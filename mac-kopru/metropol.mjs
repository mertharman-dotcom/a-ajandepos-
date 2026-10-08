#!/usr/bin/env node
// metropol.mjs v0.3 — Metropol Card üye işyeri: POS işlem detayı, terminal terminal (hangi kurye olduğu belli olsun diye).
// Girişte reCAPTCHA var → Mac'teki gerçek Chrome açılır (playwright-core); oturum çerezi metropol-profil'de kalır.
//   node metropol.mjs                         son geriGun günü (varsayılan 7)
//   node metropol.mjs 06.09.2026 06.10.2026   tarih aralığı (en çok 1 ay)
//   --tabloya-yazma                           yalnız CSV
//   --fatura-kuru                             manuel fatura formunu doldurur, BASMAZ (ekran görüntüsü)
//   --fatura-kes                              manuel faturayı keser (sahibinin onayıyla)
//   --canli-tut                               oturumu açık tutar (10 dk'da bir zamanlayıcıdan; giriş denemez, düşerse bildirir)
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
// Doğrulandı (06.10 HAR): gövde birebir bu; ayın 1–6'sı site "Ayın 1'i ve 6'sı arasında fatura kesilememektedir!" der.
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
  if (+z.slice(8, 10) <= 6) throw new Error('Metropol ayın 1–6\'sı arasında fatura kestirmez');
  await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), page.locator('button[name="CustomButton"][value="KayitlariGetir"]').click()]);
  await bekle(2000);
  // Oturum düşmüşse site girişe yönlendirir (06.10: ~25 dk boşta kalınca); fatura kesilmemiştir.
  if (/\/Auth\/Login/i.test(page.url())) throw new Error('oturum düşmüş; fatura KESİLMEDİ, yeniden çalıştır');
  const html = await page.content();
  await page.screenshot({ path: path.join(DIZIN, 'metropol_fatura.png'), fullPage: true });
  // Site sonucu sayfanın üstünde .alert kutusunda yazar (ör. "Ayın 1'i ve 6'sı arasında fatura kesilememektedir!")
  const uyari = await page.evaluate(() => [...document.querySelectorAll('form .alert, .white-box .alert')].map(e => e.textContent.trim()).filter(Boolean).join(' | ')).catch(() => '');
  const liste = tablo(html.slice(html.indexOf('Fatura Listesi')));
  log('fatura sonucu: ' + (uyari || '—') + ' · liste: ' + JSON.stringify(liste).slice(0, 400));
  return { tarih: z, uyari, liste };
}

// Oturum durumu BAP Yemek Kartı › 'Mac Oturumları'na yazılır (yalnız değişince); panel düşmüşse Yönetim Merkezi'nde uyarır.
const DURUM_DOSYA = path.join(DIZIN, 'metropol_oturum.txt');
async function oturumBildir(acik) {
  let once = ''; try { once = fs.readFileSync(DURUM_DOSYA, 'utf8').trim(); } catch (_) {}
  const simdi = acik ? 'acik' : 'kapali'; if (once === simdi) return;
  try { fs.writeFileSync(DURUM_DOSYA, simdi); } catch (_) {}
  log('oturum durumu: ' + simdi + ' → ' + JSON.stringify(await yk({ tur: 'oturumDurumu', kart: 'Metropol', acik }).catch(e => ({ hata: e.message }))));
}

// Sitenin oturum çerezi "oturumluk": Chrome kapanınca silinir, kalıcı profil onu saklamaz (08.10: giriş 02:44, canlı tut 02:53'te "kapalı").
// Bu yüzden çerezler her çalışmanın sonunda dosyaya yazılır, başında geri yüklenir; sunucudaki oturum 10 dakikalık canlı tutmayla açık kalır.
const CEREZ = path.join(DIZIN, 'metropol-cerez.json');
async function cerezYukle(ctx) { try { const c = JSON.parse(fs.readFileSync(CEREZ, 'utf8')); if (c.length) await ctx.addCookies(c); } catch (_) {} }
async function cerezKaydet(ctx) { try { const c = (await ctx.cookies()).filter(x => /metropolcard/i.test(x.domain)); if (c.length) fs.writeFileSync(CEREZ, JSON.stringify(c)); } catch (_) {} }

// --canli-tut (10 dakikada bir, com.bap.metropol-canli): görünmeden ana sayfayı açar → site oturumu kapatmaz.
// Oturum düşmüşse giriş denemez (robot kutusu sahibini ister), yalnız bildirir.
async function canliTut() {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFIL, { executablePath: CHROME, headless: true });
    await cerezYukle(ctx);
    const page = ctx.pages()[0] || await ctx.newPage();
    const acik = await oturumAcik(page);
    if (acik) await cerezKaydet(ctx);
    await oturumBildir(acik);
    if (!acik) log('canlı tut: oturum kapalı — "node metropol.mjs" ile bir kez giriş yapılmalı');
  } catch (e) { log('canlı tut atlandı: ' + e.message); }   // ör. ana çekim aynı anda çalışıyor (profil kilitli)
  finally { if (ctx) await ctx.close().catch(() => {}); }
}

async function main() {
  if (process.argv.includes('--canli-tut')) return canliTut();
  const a = process.argv.slice(2).filter(x => /^\d{2}\.\d{2}\.\d{4}$/.test(x));
  const tr = s => { const [g, m, y] = s.split('.'); return new Date(+y, +m - 1, +g); };
  const bitis = a[1] ? tr(a[1]) : new Date(Date.now() + 86400000), bas = a[0] ? tr(a[0]) : new Date(Date.now() - GERI_GUN * 86400000);
  log(`başladı: ${gaa(bas)} – ${gaa(bitis)}`);

  const ctx = await chromium.launchPersistentContext(PROFIL, { executablePath: CHROME, headless: false, ignoreDefaultArgs: ['--enable-automation', '--no-sandbox'], args: ['--disable-blink-features=AutomationControlled'], viewport: { width: 1280, height: 860 } });
  await cerezYukle(ctx);
  const page = ctx.pages()[0] || await ctx.newPage();
  try {
    if (!(await oturumAcik(page))) { try { await girisYap(page); } catch (e) { await oturumBildir(false); throw e; } }
    await oturumBildir(true); await cerezKaydet(ctx);
    if (process.argv.includes('--fatura-kes') || process.argv.includes('--fatura-kuru')) {
      const r = await faturaKes(page, !process.argv.includes('--fatura-kes'));
      if (YAZMA) log('tabloya: ' + JSON.stringify(await yk({ tur: 'faturaKesim', kart: 'Metropol', sonuc: { kuru: !!r.kuru, kesildi: !r.kuru && !/kesilememektedir|hata|error/i.test(r.uyari || ''), tarih: r.tarih, mesaj: (r.uyari || '') + (r.liste && r.liste.length ? ' · ' + JSON.stringify(r.liste).slice(0, 200) : '') } })));
      return;
    }
    const kisi = await kullanicilar(page).catch(e => { log('kullanıcı listesi okunamadı: ' + e.message); return { terminal: {}, telefon: {} }; });
    // Site en çok 1 aylık aralık kabul ediyor ve ileri tarih istemiyor → bugüne kadar, 30 günlük parçalar.
    // Sayfa sitenin kendi gezinmesiyle (page.goto) açılır; terminal listesi seçim kutusundan alınır (tablo yalnız sonuç varken dolu).
    const bugun = new Date(), son = bitis > bugun ? bugun : bitis, parcalar = [];
    for (let b = new Date(bas); b <= son; b = new Date(b.getTime() + 30 * 86400000)) parcalar.push([b, new Date(Math.min(b.getTime() + 29 * 86400000, son.getTime()))]);
    const q = (t, b, e, isy = ISYERI) => `/Home/PosIslemDetay?terminal=${t}&merchantCode=${isy}&start=${gaa(b)}&end=${gaa(e)}`;
    const ac = async yol => { await page.goto(KOK + yol, { waitUntil: 'domcontentloaded' }); if (/\/Auth\/Login/i.test(page.url())) throw new Error('oturum düştü'); return page.content(); };
    const ilkHtml = await ac(q(0, parcalar[0][0], parcalar[0][1]));
    // 08.10: Metropol ödemeli siparişlerin bir kısmının çekimi tabloda yoktu (listede olmayan terminal / başka işyeri olabilir).
    // Sayfadaki seçim kutuları günlüğe yazılır; işyeri kutusundaki her işyeri ve her parçada "tüm terminaller" (terminal=0) de çekilir.
    const kutular = await page.$$eval('select', l => l.map(s => ({ id: s.id || s.name, n: s.options.length,
      ornek: [...s.options].slice(0, 5).map(o => o.value + '=' + o.text.trim().slice(0, 30)) }))).catch(() => []);
    log('sayfadaki seçim kutuları: ' + JSON.stringify(kutular));
    const isyKutu = kutular.find(k => /merchant|isyeri|isYeri/i.test(k.id));
    const isyerleri = [...new Set([ISYERI].concat(isyKutu ? await page.$$eval('#' + isyKutu.id + ' option', o => o.map(x => x.value).filter(v => /^\d{6,}$/.test(v))).catch(() => []) : []))];
    if (isyerleri.length > 1) log('işyerleri: ' + isyerleri.join(', '));
    const satirlar = [], gorulen = new Set();
    const ekle = (islem, no, tel, ad) => { let n = 0; for (const x of islem) { const k = String(x['İşlem No']).trim(); if (gorulen.has(k)) continue; gorulen.add(k); n++;
      satirlar.push({ zaman: x['Tarih'], tutar: tl(x['Tutar']), islemNo: x['İşlem No'], tip: x['İşlem Tipi'], mod: x['Giriş Modu'], urun: x['Ürün Tipi'],
        terminal: no || String(x['Terminal No'] || x['Terminal'] || '').trim(), telefon: tel, kisi: ad, kart: x['Kart Numarası'], gunsonu: x['Gün Sonu Tarihi'], fatura: x['Fatura Id'] }); } return n; };
    let toplamTerminal = 0;
    for (const isy of isyerleri) {
      const html0 = isy === ISYERI ? ilkHtml : await ac(q(0, parcalar[0][0], parcalar[0][1], isy));
      const secenek = await page.$$eval('#terminal option', o => o.map(x => x.value).filter(v => v && v !== '0')).catch(() => []);
      const posBilgi = {}; tablo(html0, 'example24').forEach(t => { if (t['Terminal No']) posBilgi[t['Terminal No']] = t; });
      const terminaller = [...new Set(secenek.concat(Object.keys(posBilgi)))]; toplamTerminal += terminaller.length;
      log(`${isy}: terminal ${terminaller.length}, tarih parçası: ${parcalar.length} (${parcalar.map(p => gaa(p[0]) + '–' + gaa(p[1])).join(', ')})`);
      for (const no of terminaller) {
        const tel = String((posBilgi[no] || {})['Pos Seri No'] || '').replace(/\D/g, '').slice(0, 10), ad = kisi.terminal[no] || kisi.telefon[tel] || '';
        let say = 0;
        for (const [b, e] of parcalar) {
          // İşlem No'suz satır = tablonun "kayıt yok" satırı (her boş tarih parçasında bir tane) → işlem değil
          say += ekle(tablo(await ac(q(no, b, e, isy)), 'example23').filter(x => String(x['İşlem No'] || '').trim()), no, tel, ad); await bekle(600);
        }
        log(`  ${no} (${ad || tel || '?'}): ${say} işlem`);
      }
      // Tüm terminaller: listede olmayan terminallerden geçen işlemler
      let fazla = 0;
      for (const [b, e] of parcalar) { fazla += ekle(tablo(await ac(q(0, b, e, isy)), 'example23').filter(x => String(x['İşlem No'] || '').trim()), '', '', ''); await bekle(600); }
      log(`  ${isy} tüm terminaller: listede olmayan ${fazla} işlem daha`);
    }
    if (!toplamTerminal) { fs.writeFileSync(path.join(DIZIN, 'metropol_son.html'), ilkHtml); throw new Error('terminal listesi boş; sayfa metropol_son.html dosyasına kaydedildi'); }
    if (!satirlar.length) fs.writeFileSync(path.join(DIZIN, 'metropol_son.html'), ilkHtml);
    // Aynı işlem birden çok terminalde görünüyorsa (site filtresi) kurye ataması şüphelidir: günlüğe yaz
    const gor = {}; satirlar.forEach(x => { (gor[x.islemNo] = gor[x.islemNo] || new Set()).add(x.terminal); });
    const cift = Object.keys(gor).filter(k => gor[k].size > 1);
    if (cift.length) log(`uyarı: ${cift.length} işlem birden çok terminalde görünüyor: ` + cift.slice(0, 5).map(k => k + ' → ' + [...gor[k]].join('/')).join(', '));
    const bas_ = ['İşlem Zamanı', 'Tutar', 'İşlem No', 'İşlem Tipi', 'Giriş Modu', 'Terminal No', 'Kullanıcı', 'Telefon', 'Kart', 'Gün Sonu', 'Fatura Id'];
    fs.writeFileSync(CIKTI, [bas_.join(';')].concat(satirlar.map(x => [x.zaman, x.tutar, x.islemNo, x.tip, x.mod, x.terminal, x.kisi, x.telefon, x.kart, x.gunsonu, x.fatura].join(';'))).join('\n'));
    log(`${satirlar.length} işlem → ${CIKTI}`);
    if (YAZMA && satirlar.length) {
      for (let i = 0; i < satirlar.length; i += 300) {   // POST tekrar denenmez; tablo İşlem No ile tekrarı zaten ayıklar
        const r = await yk({ tur: 'metropol', satirlar: satirlar.slice(i, i + 300) });
        log('tabloya: ' + JSON.stringify(r));
      }
    }
    // Fatura Ödeme Bilgileri: Metropol'ün hangi faturayı ne zaman ödediği (Finans'ta alacak kapatmak için). Sütun adları sayfadan alınır.
    try {
      const od = tablo((await sayfa(page, '/Home/OdemeDetay')).html);
      log('fatura ödeme bilgileri: ' + od.length + ' satır' + (od[0] ? ' · sütunlar: ' + Object.keys(od[0]).join(' | ') : ''));
      if (YAZMA && od.length) log('tabloya: ' + JSON.stringify(await yk({ tur: 'metropolOdeme', satirlar: od.slice(0, 500) })));
    } catch (e) { log('fatura ödeme bilgileri okunamadı: ' + e.message); }
  } finally { await cerezKaydet(ctx); await ctx.close().catch(() => {}); }
}
main().catch(e => { log('HATA: ' + (e && e.message || e)); process.exit(1); });
