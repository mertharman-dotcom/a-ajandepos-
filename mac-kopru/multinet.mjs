#!/usr/bin/env node
// multinet.mjs v0.1 — Multinet (multiavantaj.com.tr) işlemleri ve faturaları.
// Giriş: VKN/TCKN + telefon + SMS kodu (sitede reCAPTCHA olduğu için Mac'teki gerçek Chrome). Kod iPhone Kestirmeler'den
// BAP Yemek Kartı kod kutusuna gelir (kaynak 'multinet'), program oradan okur.
//   node multinet.mjs                        son geriGun günü işlemler + son 90 gün faturalar
//   node multinet.mjs 01.09.2026 06.10.2026  tarih aralığı
//   --terminal                               kodu terminalden sor
//   --tabloya-yazma                          yalnız CSV
//   --fatura-kuru                            fatura dönemlerini (vade seçenekleri) gösterir, kesmez
//   --fatura-kes                             faturayı keser (createMerchantInvoiceSummary; vade ayar.json › multinet.vade, varsayılan 3)
// Ayar: ayar.json › multinet { vkn, telefon, geriGun, vade }, ayar.json › ykWebapp. Çıktı: multinet_islemler.csv (+ multinet.log)
// Depodaki kopya: mac-kopru/multinet.mjs — değişiklik önce depoda.
//
// Site (06.10.2026, JSON API, oturum çerezi + x-csrf-token):
//   POST /api/auth/sendOtp {vkn, gsmNumber} · /api/auth/confirmOtp {vkn, gsmNumber, otpCode} → {Result:{CustomerId}}
//   POST /api/transactions/getBranches {customerId} → [{Id (merchantId)}]
//   POST /api/transactions/getMerchantTransactionDetailSummaries {customerId, merchantId, terminalIds:[], transactionDateRange:'yyyyMMdd-yyyyMMdd'}
//        Amount '55000TRY' (kuruş), TransactionCreateDate 'yyyyMMddHHmmss', Description 'MultiPOS Satis' (kapıda) |
//        'Trendyol Satis' / 'Yemek Sepeti Satis' / 'Getir Food Payment' (online) | 'harcama iptali' (ExternalServerRefNo = iptal edilen)
//   POST /api/invoices/getMerchantDebitInvoiceSummaries {customerBranchId, invoiceDateRange, validityDateRange:null, …}
//        InvoiceSeriNumber = KolayBi fatura no (EFA…), InvoiceDebitPaymentTypeText 'Ödeme Tamamlandı', ödeme tarihi açıklamada
//   POST /api/invoices/getPaymentPeriodList {merchantId} → vade seçenekleri (DueDay 3 / 30 …, Commission, IsInvoiceable)
//   POST /api/invoices/createMerchantInvoiceSummary {dueDay, merchantId} — fatura kesme. Gün sonu alınmamışsa site:
//        'ES-ERROR[50181]: LUTFEN GUNSONU ALARAK TEKRAR DENEYINIZ.' (06.10)

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { chromium } from 'playwright-core';

const DIZIN  = path.join(os.homedir(), 'bap-kopru');
const AYAR   = JSON.parse(fs.readFileSync(path.join(DIZIN, 'ayar.json'), 'utf8'));
const MN     = AYAR.multinet || {};
const LOG    = path.join(DIZIN, 'multinet.log');
const CIKTI  = path.join(DIZIN, 'multinet_islemler.csv');
const PROFIL = path.join(DIZIN, 'multinet-profil');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const KOK    = 'https://multiavantaj.com.tr';
const GERI_GUN = Number(MN.geriGun || 7);
const TERMINAL = process.argv.includes('--terminal');
const YAZMA  = !process.argv.includes('--tabloya-yazma');

function log(m) { const s = `[${new Date().toLocaleString('tr-TR')}] ${m}`; console.log(s); try { fs.appendFileSync(LOG, s + '\n'); } catch (_) {} }
const bekle = ms => new Promise(c => setTimeout(c, ms));
const p2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
const kurus = v => { const m = String(v || '').match(/-?\d+/); return m ? Number(m[0]) / 100 : 0; };          // '55000TRY' → 550
const zaman = v => { const m = String(v || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/); return m ? `${m[3]}.${m[2]}.${m[1]}` + (m[4] ? ` ${m[4]}:${m[5] || '00'}:${m[6] || '00'}` : '') : ''; };

/* ---------- BAP Yemek Kartı web uygulaması ---------- */
async function yk(govde) {
  if (!AYAR.ykWebapp) throw new Error('ayar.json › ykWebapp yok');
  const res = await fetch(AYAR.ykWebapp, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ anahtar: AYAR.anahtar, ...govde }), redirect: 'follow' });
  const t = await res.text();
  try { return JSON.parse(t); } catch (_) { return { hata: t.slice(0, 200) }; }
}
async function kodBekle() {
  const bitis = Date.now() + 4 * 60 * 1000; let son = 0;
  while (Date.now() < bitis) {
    const c = await yk({ tur: 'kodOku', kaynak: 'multinet' });
    if (c.kod) { log('kod alındı'); return c.kod; }
    if (c.hata) log('kod kutusu: ' + c.hata);
    if (Date.now() - son > 60000) { son = Date.now(); log('  ...kod bekleniyor'); }
    await bekle(4000);
  }
  throw new Error('kod gelmedi (4 dakika doldu)');
}
function terminaldenSor() {
  const r = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(c => r.question('Multinet SMS kodunu yaz ve Enter: ', x => { r.close(); c(x.trim()); }));
}

/* ---------- oturum: sitenin kendi isteklerinden csrf ve müşteri no yakalanır ---------- */
const OT = { csrf: '', customerId: null };
function dinle(page) {
  page.on('request', r => {
    if (!r.url().startsWith(KOK + '/api/')) return;
    const t = r.headers()['x-csrf-token']; if (t) OT.csrf = t;
    try { const b = JSON.parse(r.postData() || '{}'); if (b.customerId) OT.customerId = b.customerId; } catch (_) {}
  });
  page.on('response', async r => {
    if (!/\/api\/auth\/confirmOtp/.test(r.url())) return;
    try { const j = await r.json(); if (j.Result && j.Result.CustomerId) OT.customerId = j.Result.CustomerId; } catch (_) {}
  });
}
async function api(page, yol, govde) {
  const r = await page.evaluate(async ({ yol, govde, csrf }) => {
    const x = await fetch(yol, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(govde) });
    return { kod: x.status, metin: await x.text() };
  }, { yol: '/api/' + yol, govde, csrf: OT.csrf });
  let j = null; try { j = JSON.parse(r.metin); } catch (_) {}
  if (r.kod !== 200 || !j) throw new Error(`${yol}: HTTP ${r.kod} ${r.metin.slice(0, 150)}`);
  const d = j.data || j; if (d.ResultCode && d.ResultCode !== 0) throw new Error(`${yol}: ${d.ResultMessage}`);
  return d.Result;
}

async function girisYap(page) {
  if (!MN.vkn || !MN.telefon) throw new Error('ayar.json: multinet.vkn / multinet.telefon yok');
  await page.goto(KOK + '/auth/login', { waitUntil: 'networkidle' });
  await page.locator('#taxNumber').fill(MN.vkn);
  const tel = page.locator('#phone'); await tel.click(); await tel.pressSequentially(MN.telefon, { delay: 50 });
  if (!TERMINAL) { const r = await yk({ tur: 'kodIste', kaynak: 'multinet' }); if (r.hata) throw new Error('kod kutusu: ' + r.hata); }
  await page.locator('button[type="submit"]').first().click();
  log('Multinet SMS istendi (robot doğrulaması çıkarsa Chrome penceresinde işaretle)');
  // Kod kutusu: tek kutu ya da 6 ayrı kutu olabilir
  await page.waitForSelector('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[maxlength="6"], input[maxlength="1"]', { timeout: 180000 });
  const kod = TERMINAL ? await terminaldenSor() : await kodBekle();
  if (!/^\d{4,8}$/.test(kod)) throw new Error('geçersiz kod: ' + kod);
  const tekler = page.locator('input[maxlength="1"]');
  if (await tekler.count() >= kod.length) { for (let i = 0; i < kod.length; i++) await tekler.nth(i).fill(kod[i]); }
  else await page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[maxlength="6"]').first().fill(kod);
  await page.locator('button[type="submit"]').first().click().catch(() => {});
  await page.waitForURL(u => !/\/auth\/login/.test(String(u)), { timeout: 30000 }).catch(() => {});
  if (!TERMINAL) await yk({ tur: 'kodSil', kaynak: 'multinet' }).catch(() => {});
  if (/\/auth\/login/.test(page.url())) throw new Error('kod kabul edilmedi');
  log('oturum açıldı');
}

/* ---------- ana ---------- */
(async () => {
  let ctx;
  try {
    if (!fs.existsSync(CHROME)) throw new Error('Google Chrome bulunamadı: ' + CHROME);
    const a = process.argv.filter(x => /^\d{2}\.\d{2}\.\d{4}$/.test(x)), tr = s => { const [g, m, y] = s.split('.'); return new Date(+y, +m - 1, +g); };
    const bit = a[1] ? tr(a[1]) : new Date(), bas = a[0] ? tr(a[0]) : new Date(Date.now() - GERI_GUN * 86400000);
    ctx = await chromium.launchPersistentContext(PROFIL, { executablePath: CHROME, headless: false, locale: 'tr-TR', viewport: { width: 1280, height: 900 } });
    const page = ctx.pages()[0] || await ctx.newPage(); dinle(page);
    await page.goto(KOK + '/transactions', { waitUntil: 'networkidle' });
    if (/\/auth\/login/.test(page.url())) { await girisYap(page); await page.goto(KOK + '/transactions', { waitUntil: 'networkidle' }); }
    else log('oturum zaten açık');
    for (let i = 0; i < 20 && (!OT.csrf || !OT.customerId); i++) await bekle(500);   // sayfa kendi isteklerini atınca dolar
    if (!OT.csrf || !OT.customerId) throw new Error('oturum bilgisi (csrf / müşteri no) yakalanamadı');

    const sube = (await api(page, 'transactions/getBranches', { customerId: OT.customerId }))[0];
    if (!sube) throw new Error('şube bulunamadı');
    if (process.argv.includes('--fatura-kuru') || process.argv.includes('--fatura-kes')) {
      const donem = await api(page, 'invoices/getPaymentPeriodList', { merchantId: sube.Id }) || [];
      log('vade seçenekleri: ' + donem.map(d => `${d.ProductDescription} ${d.DueDay} gün %${(d.Commission || 0) / 100}${d.IsInvoiceable ? '' : ' (kesilemez)'}`).join(' | '));
      if (process.argv.includes('--fatura-kes')) {
        const vade = Number(MN.vade || 3);
        // POST tekrar denenmez; hata gelirse (ör. gün sonu alınmamış) fatura kesilmemiştir.
        try { const r = await api(page, 'invoices/createMerchantInvoiceSummary', { dueDay: vade, merchantId: sube.Id }); log('FATURA KESİLDİ (' + vade + ' gün vade): ' + JSON.stringify(r).slice(0, 300)); }
        catch (e) { log('fatura KESİLMEDİ: ' + e.message); }
      }
      return;
    }
    const ham = await api(page, 'transactions/getMerchantTransactionDetailSummaries',
      { customerId: OT.customerId, merchantId: sube.Id, terminalIds: [], transactionDateRange: `${ymd(bas)}-${ymd(bit)}` }) || [];
    const iptal = new Set(ham.filter(x => kurus(x.Amount) < 0).map(x => String(x.ExternalServerRefNo || '')));
    const satirlar = ham.filter(x => kurus(x.Amount) > 0).map(x => ({
      zaman: zaman(x.TransactionCreateDate || x.Timestamp), tutar: kurus(x.Amount), ref: String(x.ServerRefNo || ''),
      aciklama: x.Description || '', durum: iptal.has(String(x.ServerRefNo)) ? 'İptal' : (x.TransactionTypeString || ''),
      terminal: String(x.TerminalId || ''), kart: x.SourceAccountNumberToDisplay || '' }));
    log(`${ymd(bas)}–${ymd(bit)}: ${satirlar.length} işlem (${iptal.size} iptal)`);
    const k = v => `"${String(v ?? '').replace(/"/g, '""')}"`, b = ['zaman', 'tutar', 'ref', 'aciklama', 'durum', 'terminal', 'kart'];
    fs.writeFileSync(CIKTI, b.join(',') + '\n' + satirlar.map(x => b.map(h => k(x[h])).join(',')).join('\n') + '\n', 'utf8');

    const d90 = new Date(Date.now() - 90 * 86400000);
    const fat = (await api(page, 'invoices/getMerchantDebitInvoiceSummaries', { customerBranchId: String(sube.Id), invoiceDateRange: `${ymd(d90)}-${ymd(new Date())}`,
      validityDateRange: null, isGettingAccountActivityNoList: true, isGettingSlipNoList: true }) || []).map(f => ({
      no: f.InvoiceSeriNumber || '', tutar: kurus(f.InvoiceTotal), tarih: zaman(f.PreInvoiceDate), vade: zaman(f.ValidityDate),
      durum: f.InvoiceDebitPaymentTypeText || '', odeme: ((String(f.InvoiceStatusSubDescription || '').match(/\*\*(\d{1,2}\.\d{1,2}\.\d{4})\*\* tarihinde/) || [])[1]) || '',
      urun: f.ProductName || '' }));
    log(`faturalar (90 gün): ${fat.length}`);

    if (YAZMA) {
      for (let i = 0; i < satirlar.length; i += 300) log('tabloya: ' + JSON.stringify(await yk({ tur: 'multinet', satirlar: satirlar.slice(i, i + 300) })));
      if (fat.length) log('faturalar: ' + JSON.stringify(await yk({ tur: 'multinetFatura', faturalar: fat })));
    }
  } catch (e) { log('HATA: ' + e.message); process.exitCode = 1; }
  finally { if (ctx) await ctx.close().catch(() => {}); }
})();
