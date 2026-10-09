#!/usr/bin/env node
// edenred.mjs v0.3 — Edenred (Ticket Restaurant) terminal bazlı işlem listesi.
// Giriş telefon + VKN + SMS; sitede reCAPTCHA olduğu için Mac'teki gerçek Chrome açılır (playwright-core).
//   node edenred.mjs                                     son geriGun günü; kod iPhone Kestirmeler'den (kurye köprüsü kodYaz)
//   node edenred.mjs --terminal                          kodu terminalden sor
//   node edenred.mjs 28.09.2026 04.10.2026               tarih aralığı
//   --tabloya-yazma                                      yalnız CSV (kurye tablosuna göndermez)
// Ayar: ayar.json › edenred { telefon, vkn, geriGun }. Çıktı: edenred_islemler.csv (+ log: edenred.log)
// Depodaki kopya: mac-kopru/edenred.mjs — değişiklik önce depoda yapılır.

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { chromium } from 'playwright-core';

const DIZIN  = path.join(os.homedir(), 'bap-kopru');
const AYAR   = JSON.parse(fs.readFileSync(path.join(DIZIN, 'ayar.json'), 'utf8'));
const ED     = AYAR.edenred || {};
const LOG    = path.join(DIZIN, 'edenred.log');
const CIKTI  = path.join(DIZIN, 'edenred_islemler.csv');
const PROFIL = path.join(DIZIN, 'edenred-profil');   // oturum çerezleri burada kalır; bazen SMS gerekmez
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const KOK    = 'https://isortaklari.edenred.com.tr';
const LISTE  = KOK + '/is-ortaklari/gunsonu/terminal-bazli-islem-listesi';
const GERI_GUN = Number(ED.geriGun || 7);
const TERMINAL = process.argv.includes('--terminal');
const YAZMA    = !process.argv.includes('--tabloya-yazma');
const BEKLEME  = 4 * 60 * 1000;   // Edenred kodu ~3 dk geçerli

function log(m) {
  const s = `[${new Date().toLocaleString('tr-TR')}] ${m}`;
  console.log(s);
  try { fs.appendFileSync(LOG, s + '\n'); } catch (_) {}
}
const bekle = ms => new Promise(c => setTimeout(c, ms));
const tarih = (d, ayrac) => { const p = n => String(n).padStart(2, '0'); return `${p(d.getDate())}${ayrac}${p(d.getMonth() + 1)}${ayrac}${d.getFullYear()}`; };

/* ---------- BAP Yemek Kartı web uygulaması (ayar.json › ykWebapp; yoksa eski kurye köprüsü) ---------- */
async function kopru(govde) {
  const res = await fetch(AYAR.ykWebapp || AYAR.webapp, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ anahtar: AYAR.anahtar, ...govde }), redirect: 'follow' });
  const t = await res.text();
  try { return JSON.parse(t); } catch (_) { return { hata: t.slice(0, 200) }; }
}

async function kodBekle() {
  const bitis = Date.now() + BEKLEME; let son = 0;
  while (Date.now() < bitis) {
    const c = await kopru({ tur: 'kodOku', kaynak: 'edenred' });
    if (c.kod) { log('kod alındı'); return c.kod; }
    if (c.hata) log('köprü: ' + c.hata);
    if (Date.now() - son > 60000) { son = Date.now(); log('  ...kod bekleniyor'); }
    await bekle(4000);
  }
  throw new Error('kod gelmedi (4 dakika doldu)');
}

/* ---------- kod ---------- */
function terminaldenSor() {
  const r = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(c => r.question('Edenred SMS kodunu yaz ve Enter: ', x => { r.close(); c(x.trim()); }));
}

/* ---------- giriş ---------- */
// Oturum çerezi Chrome kapanınca siliniyor (Metropol'de görüldü, 08.10): dosyada saklanır, her çalışmada SMS istenmesin.
const CEREZ = path.join(DIZIN, 'edenred-cerez.json');
async function cerezYukle(c) { try { const x = JSON.parse(fs.readFileSync(CEREZ, 'utf8')); if (x.length) await c.addCookies(x); } catch (_) {} }
async function cerezKaydet(c) { try { const x = (await c.cookies()).filter(k => /edenred/i.test(k.domain)); if (x.length) fs.writeFileSync(CEREZ, JSON.stringify(x)); } catch (_) {} }

async function oturumAcik(page) {
  await page.goto(KOK + '/', { waitUntil: 'domcontentloaded' });
  return !/\/login/.test(page.url());
}

async function girisYap(page) {
  await page.goto(KOK + '/is-ortaklari/login/', { waitUntil: 'networkidle' });
  // Çerez penceresi düğmeleri örtmesin
  await page.locator('#onetrust-reject-all-handler').click({ timeout: 3000 }).catch(() => {});
  // Sayfa (04.10.2026): VKN = input[name=vkn]; telefon = #phoneNumber (maskeli, "(5__) ___ __ __"),
  // gönderilen değer gizli input[name=phoneNumber]; "Beni hatırla" = #remindMe; düğme "GİRİŞ YAP".
  // Sitede görünmez reCAPTCHA (puanlı) var: 08.10 "ReCaptcha Doğrulama Başarısız" verdi. Sayfada biraz durup fareyi gezdirmek,
  // alanları insan gibi yazmak puanı yükseltir (Chrome da "otomatik test" izi olmadan açılıyor).
  await bekle(2500 + Math.random() * 2000);
  for (let i = 0; i < 6; i++) { await page.mouse.move(200 + Math.random() * 700, 200 + Math.random() * 500, { steps: 12 }); await bekle(250 + Math.random() * 400); }
  const vkn = page.locator('input[name="vkn"]').first(); await vkn.click(); await vkn.fill(''); await vkn.pressSequentially(ED.vkn, { delay: 90 });
  const tel = page.locator('#phoneNumber').first();
  await tel.click(); await tel.fill(''); await tel.pressSequentially(ED.telefon, { delay: 60 });
  await page.evaluate(t => { document.querySelectorAll('input[type="hidden"][name="phoneNumber"]').forEach(i => { i.value = t; }); }, ED.telefon);
  await page.locator('#remindMe').check().catch(() => {});
  const dugme = page.locator('button[type="submit"][class*="login-sub"], button[type="submit"]:has-text("GİRİŞ")').first();
  if (!TERMINAL) { const r = await kopru({ tur: 'kodIste', kaynak: 'edenred' }); if (r.hata) throw new Error('kod kutusu: ' + r.hata); }
  if (await dugme.count()) await dugme.click().catch(() => {});
  else log('giriş düğmesi bulunamadı — açılan Chrome penceresinde elle bas');
  await page.waitForURL(/\/login\/confirm/, { timeout: 120000 }).catch(async e => {   // elle basılırsa da yakalar
    if (await page.getByText(/ReCaptcha Doğrulama Başarısız/i).count()) throw new Error('Edenred robot doğrulamasını geçemedi (ReCaptcha) — Chrome penceresinde bilgileri girip GİRİŞ YAP\'a elle basabilirsin');
    throw e;
  });
  log('Edenred SMS gönderildi');

  const kod = TERMINAL ? await terminaldenSor() : await kodBekle();
  if (!/^\d{4,8}$/.test(kod)) throw new Error('geçersiz kod: ' + kod);
  const q = Object.fromEntries(new URL(page.url()).searchParams);
  await page.evaluate(({ kod, q }) => {
    const f = document.createElement('form'); f.method = 'POST'; f.action = '/is-ortaklari/login/confirm';
    for (const [k, v] of Object.entries({ otpCode: kod, smsRecordId: q.smsRecordId, vkn: q.vkn, phoneNumber: q.phoneNumber })) {
      const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v || ''; f.appendChild(i);
    }
    document.body.appendChild(f); f.submit();
  }, { kod, q });
  await page.waitForURL(u => !/\/login/.test(String(u)), { timeout: 30000 }).catch(() => {});
  if (!TERMINAL) await kopru({ tur: 'kodSil', kaynak: 'edenred' }).catch(() => {});
  if (/\/login/.test(page.url())) throw new Error('kod kabul edilmedi');
  log('oturum açıldı');
}

/* ---------- liste ---------- */
async function subeler(page) {
  await page.goto(LISTE, { waitUntil: 'domcontentloaded' });
  return page.$$eval('select[name="branchId"] option', o => o.map(x => ({ id: x.value, ad: x.textContent.replace(/\s+/g, ' ').trim() })));
}

async function terminaller(page, sube) {
  const r = await page.request.get(`${KOK}/is-ortaklari/gunsonu/terminal?branchId=${sube}`, { headers: { 'x-requested-with': 'XMLHttpRequest', accept: '*/*' } });
  const metin = await r.text();
  fs.writeFileSync(path.join(DIZIN, `edenred_terminal_${sube}.json`), metin);   // ilk sürüm: yapıyı görmek için
  const bul = new Set();
  for (const m of metin.matchAll(/"(?:terminal\w*|id|value|text)"\s*:\s*"?(\d{5,8})"?/gi)) bul.add(m[1]);
  return [...bul];
}

// Sayfa ilk 10 satırı HTML olarak verir; devamı sitenin kendi "aşağı kaydırınca yükle" adresinden JSON gelir:
// ?page=2,3…&startDate&endDate&terminalId&branchId&sub-product=&filter=1 → { totalItemCount, transactions: [...] }
async function islemler(page, sube, terminal, bas, bit) {
  const q = `startDate=${encodeURIComponent(bas)}&endDate=${encodeURIComponent(bit)}&terminalId=${terminal}&branchId=${sube}`;
  await page.goto(`${LISTE}?${q}`, { waitUntil: 'domcontentloaded' });
  const l = await page.$$eval('table', ts => {
    const t = ts.find(x => /Kart No|İşlem Tutarı/i.test(x.innerText)); if (!t) return [];
    const b = [...t.querySelectorAll('thead th, tr:first-child th')].map(h => h.innerText.trim());
    return [...t.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim()))
      .filter(c => c.length >= 4).map(c => Object.fromEntries(b.map((h, i) => [h, c[i] || ''])));
  });
  if (l.length < 10) return l;
  let toplam = null;
  for (let sayfa = 2; sayfa <= 100; sayfa++) {
    const r = await page.request.get(`${LISTE}?page=${sayfa}&${q}&sub-product=&filter=1`,
      { headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json, text/javascript, */*; q=0.01' } });
    let j; try { j = JSON.parse(await r.text()); } catch (_) { log(`  ${terminal}: ${sayfa}. sayfa okunamadı`); break; }
    if (toplam === null && j.totalItemCount) toplam = Number(j.totalItemCount);
    const t = j.transactions || [];
    for (const x of t) l.push({ 'Üye No': x.redId, 'Terminal No': x.terminalNumber, 'Terminal Günsonu Tarihi': String(x.endDayDate || '').replace('T', ' '),
      'İşlem Tarihi': String(x.trancationDate || '').replace('T', ' '), 'Kart No': x.cardNumber, 'İşlem Tutarı (TL)': x.amount + ' ₺' });
    if (!t.length || (toplam !== null && l.length >= toplam)) break;
    await bekle(400);
  }
  if (toplam !== null && l.length !== toplam) log(`  ${terminal}: uyarı — site ${toplam} diyor, ${l.length} alındı`);
  return l;
}

/* ---------- ana ---------- */
(async () => {
  let tarayici;
  try {
    if (!ED.telefon || !ED.vkn) throw new Error('ayar.json: edenred.telefon / edenred.vkn yok');
    if (!fs.existsSync(CHROME)) throw new Error('Google Chrome bulunamadı: ' + CHROME);
    const t = process.argv.filter(a => /^\d{2}\.\d{2}\.\d{4}$/.test(a));
    let bas, bit;
    if (t.length === 2) { [bas, bit] = t.map(x => x.replace(/\./g, '/')); }
    else { const b = new Date(), g = new Date(); g.setDate(g.getDate() - GERI_GUN); bas = tarih(g, '/'); bit = tarih(b, '/'); }

    tarayici = await chromium.launchPersistentContext(PROFIL, { executablePath: CHROME, headless: false, ignoreDefaultArgs: ['--enable-automation', '--no-sandbox'], args: ['--disable-blink-features=AutomationControlled'], locale: 'tr-TR', viewport: { width: 1280, height: 900 } });
    await cerezYukle(tarayici);
    const page = tarayici.pages()[0] || await tarayici.newPage();
    if (await oturumAcik(page)) log('oturum zaten açık'); else { await girisYap(page); await cerezKaydet(tarayici); }

    const satirlar = [];
    for (const s of await subeler(page)) {
      const ter = await terminaller(page, s.id);
      log(`${s.ad}: ${ter.length} terminal (${ter.join(', ')})`);
      for (const tr of ter) {
        const l = await islemler(page, s.id, tr, bas, bit);
        log(`  ${tr}: ${l.length} işlem`);
        for (const x of l) satirlar.push({ sube: s.id, terminal: tr, ...x });
        await bekle(800);
      }
    }
    const b = [...new Set(satirlar.flatMap(x => Object.keys(x)))];
    const k = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    fs.writeFileSync(CIKTI, b.map(k).join(',') + '\n' + satirlar.map(x => b.map(h => k(x[h])).join(',')).join('\n') + '\n', 'utf8');
    log(`${bas}–${bit}: toplam ${satirlar.length} işlem → ${CIKTI}`);
    if (YAZMA && satirlar.length) {
      const z = v => { const m = String(v || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}` : String(v || ''); };
      const tl = v => { let x = String(v || '').replace(/[^\d.,]/g, ''); if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); return Number(x) || 0; };
      const gonder = satirlar.map(x => ({ zaman: z(x['İşlem Tarihi']), tutar: tl(x['İşlem Tutarı (TL)']), terminal: x.terminal, sube: x.sube,
        gunsonu: z(x['Terminal Günsonu Tarihi']), kart: x['Kart No'] || '' }));
      log('tablo: ' + JSON.stringify(await kopru({ tur: 'edenred', satirlar: gonder })));
    }
  } catch (e) {
    log('HATA: ' + e.message);
    process.exitCode = 1;
  } finally {
    if (tarayici) { await cerezKaydet(tarayici); await tarayici.close().catch(() => {}); }
  }
})();
