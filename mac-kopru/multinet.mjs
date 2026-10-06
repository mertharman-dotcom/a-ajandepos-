#!/usr/bin/env node
// multinet.mjs v0.2 — Multinet (multiavantaj.com.tr) işlemleri ve faturaları.
// Giriş: VKN/TCKN + telefon + SMS kodu (sitede reCAPTCHA olduğu için Mac'teki gerçek Chrome). Kod iPhone Kestirmeler'den
// BAP Yemek Kartı kod kutusuna gelir (kaynak 'multinet'), program oradan okur.
//   node multinet.mjs                        son geriGun günü işlemler + son 90 gün faturalar
//   node multinet.mjs 01.09.2026 06.10.2026  tarih aralığı
//   --terminal                               kodu terminalden sor
//   --tabloya-yazma                          yalnız CSV
//   --fatura-kuru                            fatura dönemlerini (vade seçenekleri) gösterir, kesmez
//   --fatura-kes                             faturayı keser (createMerchantInvoiceSummary; vade ayar.json › multinet.vade, varsayılan 3)
//   --fatura-zamanli                         Salı 23:30 zamanlayıcısı: otoFatura true ise keser, değilse dener; sonra işlem/fatura çekimine devam eder
// Ayar: ayar.json › multinet { vkn, telefon, geriGun, vade, otoFatura }, ayar.json › ykWebapp. Çıktı: multinet_islemler.csv (+ multinet.log)
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

/* ---------- oturum: sitenin kendi isteklerinden csrf, başlıklar ve müşteri no yakalanır ----------
   Sitenin güvenlik duvarı (F5) yalnız sitenin kendi isteklerine benzeyenleri geçirir (07.10: düz fetch "Request Rejected" aldı).
   Bu yüzden istek sayfanın içinden XMLHttpRequest ile (sitenin kullandığı yol) ve sitenin kendi isteğindeki başlıklarla atılır.
   Sitenin kendi aldığı yanıtlar da saklanır: güvenlik duvarı yine reddederse aynı istek için onlar kullanılır. */
const OT = { csrf: '', customerId: null, basliklar: {}, yanit: {} };
const ATLA = /^(host|cookie|content-length|content-type|origin|referer|user-agent|accept-encoding|connection|sec-|:)/i;
function dinle(page) {
  page.on('request', r => {
    if (!r.url().startsWith(KOK + '/api/')) return;
    const h = r.headers(); if (h['x-csrf-token']) OT.csrf = h['x-csrf-token'];
    for (const [k, v] of Object.entries(h)) if (!ATLA.test(k)) OT.basliklar[k] = v;
    try { const b = JSON.parse(r.postData() || '{}'); if (b.customerId) OT.customerId = b.customerId; } catch (_) {}
  });
  page.on('response', async r => {
    if (!r.url().startsWith(KOK + '/api/')) return;
    try {
      const j = await r.json(), yol = r.url().slice((KOK + '/api/').length).split('?')[0];
      OT.yanit[yol] = j;
      if (/auth\/confirmOtp/.test(yol) && j.Result && j.Result.CustomerId) OT.customerId = j.Result.CustomerId;
    } catch (_) {}
  });
}
function sonuc_(yol, j) {
  const d = j.data || j; if (d.ResultCode && d.ResultCode !== 0) throw new Error(`${yol}: ${d.ResultMessage}`);
  return d.Result;
}
async function api(page, yol, govde, { yedekKullan = false } = {}) {
  const r = await page.evaluate(({ yol, govde, basliklar }) => new Promise(c => {
    const x = new XMLHttpRequest(); x.open('POST', yol, true); x.withCredentials = true;
    x.setRequestHeader('content-type', 'application/json');
    for (const [k, v] of Object.entries(basliklar)) { try { x.setRequestHeader(k, v); } catch (_) {} }
    x.onload = () => c({ kod: x.status, metin: x.responseText }); x.onerror = () => c({ kod: 0, metin: 'ağ hatası' });
    x.send(JSON.stringify(govde));
  }), { yol: '/api/' + yol, govde, basliklar: { accept: 'application/json, text/plain, */*', ...OT.basliklar, 'x-csrf-token': OT.csrf } });
  let j = null; try { j = JSON.parse(r.metin); } catch (_) {}
  if (r.kod === 200 && j) return sonuc_(yol, j);
  if (yedekKullan && OT.yanit[yol]) { log(`${yol}: doğrudan istek reddedildi, sitenin kendi yanıtı kullanıldı`); return sonuc_(yol, OT.yanit[yol]); }
  throw new Error(`${yol}: HTTP ${r.kod} ${r.metin.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 150)}`);
}

async function girisYap(page) {
  if (!MN.vkn || !MN.telefon) throw new Error('ayar.json: multinet.vkn / multinet.telefon yok');
  await page.goto(KOK + '/auth/login', { waitUntil: 'networkidle' });
  await page.locator('#taxNumber').fill(MN.vkn);
  const tel = page.locator('#phone'); await tel.click(); await tel.pressSequentially(MN.telefon, { delay: 50 });
  if (!TERMINAL) { const r = await yk({ tur: 'kodIste', kaynak: 'multinet' }); if (r.hata) throw new Error('kod kutusu: ' + r.hata); }
  await page.locator('button[type="submit"]').first().click();
  log('Multinet SMS istendi (robot doğrulaması çıkarsa Chrome penceresinde işaretle)');
  // Kod kutusu: tek kutu ya da 6 ayrı kutu olabilir; sitedeki kutuların özniteliği belli olmadığından
  // VKN / telefon dışındaki görünür yazı kutuları alınır.
  const kutular = page.locator('input:visible:not(#taxNumber):not(#phone):not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');
  await kutular.first().waitFor({ timeout: 180000 });
  const kod = TERMINAL ? await terminaldenSor() : await kodBekle();
  if (!/^\d{4,8}$/.test(kod)) throw new Error('geçersiz kod: ' + kod);
  const n = await kutular.count();
  log(`kod ekranında ${n} kutu`);
  if (n >= kod.length) {
    for (let i = 0; i < kod.length; i++) { const k = kutular.nth(i); await k.click(); await k.pressSequentially(kod[i], { delay: 80 }); }
  } else if (n >= 1) {
    await kutular.first().click(); await kutular.first().pressSequentially(kod, { delay: 80 });
  } else {
    const oz = await page.$$eval('input', l => l.map(i => `${i.id}|${i.name}|${i.type}|${i.maxLength}|${i.offsetParent ? 'görünür' : 'gizli'}`));
    throw new Error('kod kutusu bulunamadı; sayfadaki kutular: ' + oz.join(', '));
  }
  await page.locator('button[type="submit"]:visible').first().click({ timeout: 5000 }).catch(() => {});
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
    log('sitenin istek başlıkları: ' + Object.keys(OT.basliklar).join(', ') + ' · sitenin kendi çağrıları: ' + Object.keys(OT.yanit).join(', '));

    const sube = (await api(page, 'transactions/getBranches', { customerId: OT.customerId }, { yedekKullan: true }))[0];
    if (!sube) throw new Error('şube bulunamadı');
    // Fatura (sahibin kuralı 06.10: Salı 23:30, 3 gün vade). --fatura-zamanli: zamanlayıcıdan; ayar.json › multinet.otoFatura true ise keser,
    // değilse yalnız dener (kuru) ve kaydeder. --fatura-kes: elle, her zaman keser. --fatura-kuru: yalnız gösterir.
    const FZ = process.argv.includes('--fatura-zamanli');
    if (FZ || process.argv.includes('--fatura-kuru') || process.argv.includes('--fatura-kes')) {
      const vade = Number(MN.vade || 3), kes = process.argv.includes('--fatura-kes') || (FZ && MN.otoFatura === true);
      const ozet = (await api(page, 'invoices/getMerchantInvoiceSummary', { merchantId: sube.Id }).catch(() => []) || [])[0] || {};
      const tutar = kurus(ozet.Total), adet = ozet.Quantity || 0;
      log(`faturalanacak: ${tutar} TL (${adet} işlem, ${ozet.MerchantProductDescription || '?'})`);
      if (YAZMA) await yk({ tur: 'multinetBekleyen', bekleyen: { tutar, adet, urun: ozet.MerchantProductDescription || '' } }).catch(() => {});
      const donem = await api(page, 'invoices/getPaymentPeriodList', { merchantId: sube.Id }) || [];
      log('vade seçenekleri: ' + donem.map(d => `${d.ProductDescription} ${d.DueDay} gün %${(d.Commission || 0) / 100}${d.IsInvoiceable ? '' : ' (kesilemez)'}`).join(' | '));
      let sonuc = { kuru: !kes, kesildi: false, tutar, vade: vade + ' gün', mesaj: kes ? '' : 'otomatik kesim kapalı (ayar.json › multinet.otoFatura)' };
      if (kes) {
        // POST tekrar denenmez; hata gelirse (ör. gün sonu alınmamış) fatura kesilmemiştir.
        try { const r = await api(page, 'invoices/createMerchantInvoiceSummary', { dueDay: vade, merchantId: sube.Id }); sonuc.kesildi = true; sonuc.mesaj = JSON.stringify(r || '').slice(0, 300); log('FATURA KESİLDİ (' + vade + ' gün vade)'); }
        catch (e) { sonuc.mesaj = e.message; log('fatura KESİLMEDİ: ' + e.message); }
      }
      if (YAZMA && (kes || FZ)) log('kayıt: ' + JSON.stringify(await yk({ tur: 'faturaKesim', kart: 'Multinet', sonuc })));
      if (!FZ) return;
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
