#!/usr/bin/env node
// metropol.mjs v0.2 — Metropol Card üye işyeri: POS işlem detayı, terminal terminal (hangi kurye olduğu belli olsun diye).
// Girişte reCAPTCHA var → Mac'teki gerçek Chrome açılır (playwright-core); oturum çerezi metropol-profil'de kalır.
//   node metropol.mjs                         son geriGun günü (varsayılan 7)
//   node metropol.mjs 06.09.2026 06.10.2026   tarih aralığı (en çok 1 ay)
//   --tabloya-yazma                           yalnız CSV
//   --fatura-kuru                             manuel fatura formunu doldurur, BASMAZ (ekran görüntüsü)
//   --fatura-kes                              manuel faturayı keser (sahibinin onayıyla)
// Ayar: ayar.json › metropol { telefon, sifre, isyeri, geriGun, urunTip }, ayar.json › ykWebapp (BAP Yemek Kartı web uygulaması).
// Çıktı: metropol_islemler.csv (+ log: metropol.log). Depodaki kopya: mac-kopru/metropol.mjs — değişiklik önce depoda.
//
// Site (06.10.2026):
//   Giriş     POST /Auth/Login  CompanyUserName (telefon) + Password + g-recaptcha-response
//   Terminaller ve işlemler: GET /Home/PosIslemDetay?terminal=<no|0>&merchantCode=<işyeri>&start=GG/AA/YYYY&end=GG/AA/YYYY
//     tablo #example24: terminal listesi (Terminal No, Pos Seri No = kullanıcı telefonu + işyeri no)
//     tablo #example23: işlemler (Kart Numarası, Tutar, İşlem No, Tarih, Fatura Id, Giriş Modu, İşlem Tipi, Ürün Tipi, Gün Sonu …)
//   Kullanıcılar: POST /Auth/ListAdminCreatedUsersFiltreForMember (TerminalCode → ad soyad; kurye adı buradan)
//   Manuel fatura: POST /Operation/ManualBillingFilter (faturaKes)

import fs from 'fs';
import path from 'path';
import os from 'os';
import { chromium } from 'playwright-core';

const DIZIN  = path.join(os.homedir(), 'bap-kopru');
const AYAR   = JSON.parse(fs.readFileSync(path.join(DIZIN, 'ayar.json'), 'utf8'));
const MT     = AYAR.metropol || {};
const LOG    = path.join(DIZIN, 'metropol.log');
const CIKTI  = path.join(DIZIN, 'metropol_islemler.csv');
const PROFIL = path.join(DIZIN, 'metropol-profil');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const KOK    = 'https://uye.metropolcard.com';
const ISYERI = MT.isyeri || '0000068645';
const GERI_GUN = Number(MT.geriGun || 7);
const YAZMA  = !process.argv.includes('--tabloya-yazma');

function log(m) { const s = `[${new Date().toLocaleString('tr-TR')}] ${m}`; console.log(s); try { fs.appendFileSync(LOG, s + '\n'); } catch (_) {} }
const bekle = ms => new Promise(c => setTimeout(c, ms));
const p2 = n => String(n).padStart(2, '0');
const tl = v => { v = String(v || '').trim(); return Number(/,/.test(v) ? v.replace(/\./g, '').replace(',', '.') : v) || 0; };   // "610" ya da "1.085,50"
const gaa = d => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;

/* ---------- BAP Yemek Kartı web uygulaması ---------- */
async function yk(govde) {
  if (!AYAR.ykWebapp) throw new Error('ayar.json › ykWebapp yok');
  const res = await fetch(AYAR.ykWebapp, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ anahtar: AYAR.anahtar, ...govde }), redirect: 'follow' });
  const t = await res.text();
  try { return JSON.parse(t); } catch (_) { return { hata: t.slice(0, 200) }; }
}

/* ---------- HTML tablo okuma ---------- */
const coz = s => String(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
function tablo(html, id) {
  const i = id ? html.indexOf(`id="${id}"`) : html.indexOf('<table'); if (i < 0) return [];
  const j = html.indexOf('</table>', i), t = html.slice(i, j);
  const bas = [...t.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => coz(m[1]));
  return [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => coz(x[1])))
    .filter(r => r.length).map(r => Object.fromEntries(bas.map((b, k) => [b, r[k] ?? ''])));
}

/* ---------- giriş ---------- */
async function oturumAcik(page) {
  await page.goto(KOK + '/', { waitUntil: 'domcontentloaded' });
  return !/\/Auth\/Login/i.test(page.url());
}
async function girisYap(page) {
  await page.goto(KOK + '/Auth/Login', { waitUntil: 'networkidle' });
  await page.locator('input[name="CompanyUserName"]').first().fill(MT.telefon);
  await page.locator('input[name="Password"]').first().fill(MT.sifre);
  log('giriş bilgileri yazıldı; "robot değilim" çıkarsa Chrome penceresinde işaretle (3 dk beklenir)');
  // Görünmez reCAPTCHA ise düğmeye basmak yeter; kutucuk çıkarsa sahibi işaretler, sonra düğmeye biz basarız.
  const dugme = page.locator('button[type="submit"], input[type="submit"]').first();
  const bitis = Date.now() + 3 * 60 * 1000;
  while (Date.now() < bitis) {
    const tamam = await page.evaluate(() => { const t = document.querySelector('textarea[name="g-recaptcha-response"]'); return !t || !!t.value; }).catch(() => false);
    if (tamam || Date.now() + 170000 < bitis) { await dugme.click().catch(() => {}); }
    await page.waitForURL(u => !/\/Auth\/Login/i.test(String(u)), { timeout: 8000 }).catch(() => {});
    if (!/\/Auth\/Login/i.test(page.url())) { log('giriş tamam'); return; }
    await bekle(3000);
  }
  throw new Error('giriş yapılamadı (robot doğrulaması ya da şifre)');
}

/* ---------- veri ---------- */
async function sayfa(page, yol) {
  return page.evaluate(async u => { const r = await fetch(u, { credentials: 'same-origin' }); return { url: r.url, html: await r.text() }; }, KOK + yol);
}
// Kullanıcılar: /Auth/ListAdminCreatedUsersFiltreForMember (DataTables JSON). Satırda Name, Surname, MobilePhone, TerminalCode var.
// Dönüş: { terminal: { '0000140129': 'Ad Soyad' }, telefon: { '5325550253': 'Ad Soyad' } }
async function kullanicilar(page) {
  const sutun = ['Name', 'Surname', 'MobilePhone', 'TerminalCode', 'MerchantCode', 'RoleName', 'Status', 'AccountBlockStatus'];
  const govde = new URLSearchParams({ draw: '1', start: '0', length: '500', 'search[value]': '', 'search[regex]': 'false',
    IsActive: 'true', Name: '', Surname: '', UserName: '', MobilePhone: '', TotalRowCount: '', MerchantCode: '0' });
  sutun.forEach((c, i) => { govde.set(`columns[${i}][data]`, c); govde.set(`columns[${i}][name]`, c); govde.set(`columns[${i}][searchable]`, 'true');
    govde.set(`columns[${i}][orderable]`, 'false'); govde.set(`columns[${i}][search][value]`, ''); govde.set(`columns[${i}][search][regex]`, 'false'); });
  const j = await page.evaluate(async b => { const r = await fetch('/Auth/ListAdminCreatedUsersFiltreForMember', { method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' }, body: b }); return r.text(); }, govde.toString());
  let veri = []; try { const o = JSON.parse(j); veri = o.data || o.Data || []; } catch (_) { log('kullanıcı listesi JSON değil: ' + j.slice(0, 120)); }
  const out = { terminal: {}, telefon: {} };
  for (const u of veri) {
    const ad = [u.Name, u.Surname].filter(Boolean).join(' ').trim(); if (!ad) continue;
    const tel = String(u.MobilePhone || '').replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
    if (u.TerminalCode) out.terminal[String(u.TerminalCode).trim()] = ad;
    if (tel) out.telefon[tel] = ad;
  }
  log(`kullanıcı listesi: ${veri.length} kişi (${Object.keys(out.terminal).length} terminalli)`);
  return out;
}

// Manuel fatura kesimi (Operation/ManualBilling sayfasındaki form; 06.10.2026):
//   POST /Operation/ManualBillingFilter  IsYeriNo=<işyeri> VadeTipId=3 (GEÇ) UrunTipId=1 (Resto) FaturaTarihManual='YYYY-AA-GG SS:dd:ss' CustomButton=KayitlariGetir
// Yalnız `--fatura-kes` ile çalışır; önce `--fatura-kuru` sayfayı açıp formu doldurur, basmaz (ekran görüntüsü: metropol_fatura.png).
async function faturaKes(page, kuru) {
  await page.goto(KOK + '/Operation/ManualBilling', { waitUntil: 'networkidle' });
  if (/\/Auth\/Login/i.test(page.url())) throw new Error('oturum düştü');
  await page.waitForFunction(() => document.querySelectorAll('#UrunTipId option').length > 1, null, { timeout: 15000 }).catch(() => {});
  await page.selectOption('#IsYeriNo', ISYERI).catch(() => {});
  await page.selectOption('#UrunTipId', String(MT.urunTip || 1));
  const d = new Date(), z = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  await page.fill('#FaturaTarihManual', z);
  if (kuru) { await page.screenshot({ path: path.join(DIZIN, 'metropol_fatura.png'), fullPage: true }); log('KURU: form dolduruldu (' + z + '), düğmeye basılmadı → metropol_fatura.png'); return { kuru: true, tarih: z }; }
  await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), page.locator('button[name="CustomButton"][value="KayitlariGetir"]').click()]);
  await bekle(2000);
  const html = await page.content();
  await page.screenshot({ path: path.join(DIZIN, 'metropol_fatura.png'), fullPage: true });
  const uyari = await page.evaluate(() => { const t = document.querySelector('#alertTitle'), m = document.querySelector('#alertModal .alert div:last-child, #alertMessage');
    return [t && t.textContent, m && m.textContent].filter(Boolean).join(' ').trim(); }).catch(() => '');
  const liste = tablo(html.slice(html.indexOf('Fatura Listesi')));
  log('fatura sonucu: ' + (uyari || '—') + ' · liste: ' + JSON.stringify(liste).slice(0, 400));
  return { tarih: z, uyari, liste };
}

async function main() {
  const a = process.argv.slice(2).filter(x => /^\d{2}\.\d{2}\.\d{4}$/.test(x));
  const tr = s => { const [g, m, y] = s.split('.'); return new Date(+y, +m - 1, +g); };
  const bitis = a[1] ? tr(a[1]) : new Date(Date.now() + 86400000), bas = a[0] ? tr(a[0]) : new Date(Date.now() - GERI_GUN * 86400000);
  log(`başladı: ${gaa(bas)} – ${gaa(bitis)}`);

  const ctx = await chromium.launchPersistentContext(PROFIL, { executablePath: CHROME, headless: false, viewport: { width: 1280, height: 860 } });
  const page = ctx.pages()[0] || await ctx.newPage();
  try {
    if (!(await oturumAcik(page))) await girisYap(page);
    if (process.argv.includes('--fatura-kes') || process.argv.includes('--fatura-kuru')) {
      const r = await faturaKes(page, !process.argv.includes('--fatura-kes'));
      if (YAZMA && !r.kuru) log('tabloya: ' + JSON.stringify(await yk({ tur: 'metropolFatura', sonuc: r })));
      return;
    }
    const kisi = await kullanicilar(page).catch(e => { log('kullanıcı listesi okunamadı: ' + e.message); return { terminal: {}, telefon: {} }; });
    const q = (t) => `/Home/PosIslemDetay?terminal=${t}&merchantCode=${ISYERI}&start=${gaa(bas)}&end=${gaa(bitis)}`;
    const ilk = await sayfa(page, q(0));
    if (/\/Auth\/Login/i.test(ilk.url)) throw new Error('oturum düştü');
    const terminaller = tablo(ilk.html, 'example24');
    log('terminal: ' + terminaller.length + ', toplam işlem (tümü): ' + tablo(ilk.html, 'example23').length);
    const satirlar = [];
    for (const t of terminaller) {
      const no = t['Terminal No']; if (!no) continue;
      const tel = String(t['Pos Seri No'] || '').replace(/\D/g, '').slice(0, 10), ad = kisi.terminal[no] || kisi.telefon[tel] || '';
      const { html } = await sayfa(page, q(no));
      const islem = tablo(html, 'example23');
      for (const x of islem) satirlar.push({ zaman: x['Tarih'], tutar: tl(x['Tutar']), islemNo: x['İşlem No'],
        tip: x['İşlem Tipi'], mod: x['Giriş Modu'], urun: x['Ürün Tipi'], terminal: no, telefon: tel, kisi: ad,
        kart: x['Kart Numarası'], gunsonu: x['Gün Sonu Tarihi'], fatura: x['Fatura Id'] });
      log(`  ${no} (${ad || tel || '?'}): ${islem.length} işlem`);
      await bekle(800);
    }
    const bas_ = ['İşlem Zamanı', 'Tutar', 'İşlem No', 'İşlem Tipi', 'Giriş Modu', 'Terminal No', 'Kullanıcı', 'Telefon', 'Kart', 'Gün Sonu', 'Fatura Id'];
    fs.writeFileSync(CIKTI, [bas_.join(';')].concat(satirlar.map(x => [x.zaman, x.tutar, x.islemNo, x.tip, x.mod, x.terminal, x.kisi, x.telefon, x.kart, x.gunsonu, x.fatura].join(';'))).join('\n'));
    log(`${satirlar.length} işlem → ${CIKTI}`);
    if (YAZMA && satirlar.length) {
      for (let i = 0; i < satirlar.length; i += 300) {   // POST tekrar denenmez; tablo İşlem No ile tekrarı zaten ayıklar
        const r = await yk({ tur: 'metropol', satirlar: satirlar.slice(i, i + 300) });
        log('tabloya: ' + JSON.stringify(r));
      }
    }
  } finally { await ctx.close().catch(() => {}); }
}
main().catch(e => { log('HATA: ' + (e && e.message || e)); process.exit(1); });
