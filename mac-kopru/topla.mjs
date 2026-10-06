// Depodaki kopya (04.10.2026, Mac'teki ~/bap-kopru/topla.mjs'ten anahtarlar gizlenerek alındı). Değişiklik önce burada yapılır.
/**
 * ============================================================
 *  BAP KÖPRÜ — otomatik toplayıcı  (Node 18+)
 *  HemenYolda -> Google E-Tablolar
 * ------------------------------------------------------------
 *  Tarayıcı konsoluna yapıştırılan köprü kodunun aynısını yapar,
 *  ama kendi kendine. Apps Script tarafında HİÇBİR değişiklik
 *  gerekmez — aynı protokolü konuşuyor:
 *
 *    GET  ?adim=plan          -> hangi günler eksik?
 *    POST tur:'kuryeler'      -> kurye listesini kaydet
 *    POST tur:'gun'           -> bir günün verisi
 *    POST tur:'bitir'         -> Açık Hesaplar + Günlük Mesai tazele
 *
 *  KULLANIM
 *    node topla.mjs              -> plandaki günleri çeker
 *    node topla.mjs 2026-09-01   -> sadece o günü çeker (elle dolgu)
 *
 *  AYARLAR: yanındaki ayar.json dosyasında.
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(DIR, 'kopru.log');

// ---------- AYARLAR ----------
const BASE     = 'https://hemenyolda.com/api/v2';
const BEKLE    = 1200;    // istekler arası ms
const GUN_ARA  = 3000;   // günler arası ms
const DENEME   = 4;      // başarısız isteği kaç kez tekrar denesin
const ENFAZLA  = 4;      // bir turda en fazla kaç gün
const SESSIZ_BAS = 3.5;  // 03:30 - 09:30 arası hiçbir şey yapma
const SESSIZ_BIT = 9.5;
const LOG_MAKS = 1024 * 1024;   // 1 MB üstünde log dosyasını kırp

let AYAR;
try {
  AYAR = JSON.parse(fs.readFileSync(path.join(DIR, 'ayar.json'), 'utf8'));
} catch (e) {
  console.error('ayar.json okunamadı: ' + e.message);
  process.exit(1);
}

// ---------- YARDIMCILAR ----------
function log(m) {
  const t = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const s = `[${t}] ${m}\n`;
  process.stdout.write(s);
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > LOG_MAKS) {
      const eski = fs.readFileSync(LOG, 'utf8');
      fs.writeFileSync(LOG, eski.slice(-LOG_MAKS / 2));
    }
    fs.appendFileSync(LOG, s);
  } catch {}
}

const uyu = ms => new Promise(r => setTimeout(r, ms));

function trSaat() {
  const s = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
  const [h, m] = s.split(':').map(Number);
  return h + m / 60;
}

/** JWT'nin bitiş tarihi (yoksa null). Token'ı hiçbir yere yazmaz. */
function tokenBitis(tk) {
  try {
    const g = tk.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const j = JSON.parse(Buffer.from(g, 'base64').toString('utf8'));
    return j.exp ? new Date(j.exp * 1000) : null;
  } catch { return null; }
}

/** HemenYolda'dan tek istek. dur:true -> bu tur bitsin, sonraki turda denenir. */
async function iste(u, H) {
  const eng = await engel();
  if (eng && Date.now() < eng.sonraki) return { ok: false, kod: 403, dur: true };
  for (let d = 0; d < DENEME; d++) {
    try {
      const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(20000) });
      if (r.status === 200) {
        if (eng) { await engel(null); log('ENGEL KALKTI (' + eng.n + '. denemeden sonra)'); }
        const t = await r.text();
        if (!t.trim()) return { ok: true, j: null };
        try { return { ok: true, j: JSON.parse(t) }; } catch { return { ok: true, j: null }; }
      }
      if (r.status === 401) return { ok: false, kod: 401, dur: true };
      if (r.status === 403 || r.status === 429) {
        const govde = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
        if (govde.includes('agent_not_in_firm')) return { ok: false, kod: 403, disari: true };
        const n = eng ? eng.n + 1 : 1;
        const dk = Math.min(60 * 2 ** (n - 1), 480);
        await engel({ n, sonraki: Date.now() + dk * 60000 });
        log('ENGEL ' + r.status + ' (' + n + '. kez) server=' + (r.headers.get('server') || '-') +
            ' cf=' + (r.headers.get('cf-ray') ? 'evet' : 'hayir') + ' | ' + govde + ' | ' + dk + ' dk sonra tekrar');
        return { ok: false, kod: r.status, dur: true };
      }
    } catch {}
    await uyu(600 * (d + 1));
  }
  return { ok: false, kod: 0 };
}

/** 403/429 sonrası bekleme durumu: engel.json. 1 sa, 2 sa, 4 sa, sonra 8 saatte bir dener. */
const ENGEL_DOSYA = new URL('./engel.json', import.meta.url);
async function engel(o) {
  const fs = await import('node:fs');
  if (o === undefined) { try { return JSON.parse(fs.readFileSync(ENGEL_DOSYA, 'utf8')); } catch { return null; } }
  if (o === null) { try { fs.unlinkSync(ENGEL_DOSYA); } catch {} return null; }
  fs.writeFileSync(ENGEL_DOSYA, JSON.stringify(o));
}

/** Apps Script web uygulamasına POST. Google'ın yönlendirmesi ara sıra bozuk döner. */
async function yolla(o) {
  o.anahtar = AYAR.anahtar;
  let sonHata = '';
  for (let d = 0; d < 3; d++) {
    try {
      const r = await fetch(AYAR.webapp, { signal: AbortSignal.timeout(300000),
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(o)
      });
      const t = await r.text();
      try { return JSON.parse(t); }
      catch { sonHata = `Google yanıtı bozuk (HTTP ${r.status})`; }
    } catch (e) { sonHata = String(e.message || e); }
    await uyu(4000 * (d + 1));
  }
  return { hata: sonHata };
}

// ---------- ANA AKIŞ ----------
(async () => {
  const elleGun = process.argv[2] || null;   // "2026-09-01" verilirse sadece o gün

  if (!elleGun) {
    const s = trSaat();
    if (s >= SESSIZ_BAS && s < SESSIZ_BIT) return;   // sessiz saat, log bile yazma
  }

  const tk = String(AYAR.token || '').trim();
  if (!tk) { log('HATA: ayar.json içinde token yok.'); return; }

  const bit = tokenBitis(tk);
  if (bit && bit.getTime() < Date.now()) {
    log(`HATA: token süresi dolmuş (${bit.toLocaleString('tr-TR')}). ayar.json içindeki token'ı yenile.`);
    return;
  }
  if (bit) {
    const kalanSaat = Math.round((bit.getTime() - Date.now()) / 3600000);
    if (kalanSaat < 48) log(`UYARI: token ${kalanSaat} saat sonra bitiyor.`);
  }

  const H = { Authorization: 'Bearer ' + tk, Accept: 'application/json' };

  // --- plan ---
  let p;
  if (elleGun) {
    p = { gunler: [elleGun], sipHazir: [], kuryeler: null };
    log(`elle: ${elleGun}`);
  } else {
    try {
      const url = `${AYAR.webapp}?anahtar=${encodeURIComponent(AYAR.anahtar)}&adim=plan`;   // depo kopyası: bu satır Mac'teki asıldan maskeli alındı, yeniden yazıldı
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
      p = await r.json();
    } catch (e) {
      log('HATA: plan alınamadı — ' + (e.message || e));
      return;
    }
    if (!p || p.hata) { log('HATA: ' + ((p && p.hata) || 'boş plan')); return; }
  }

  // --- kurye listesi ---
  let kur = p.kuryeler;
  if (!kur || !kur.length) {
    const a = await iste(BASE + '/manager/agents', H);
    if (!a.ok || !a.j || !a.j.length) {
      log(`HATA: kurye listesi alınamadı (kod ${a.kod})` +
          (a.kod === 401 ? ' — token geçersiz, yenile.' : ''));
      return;
    }
    kur = a.j.map(x => ({ id: x.id, ad: x.fullName }));
    const c = await yolla({ tur: 'kuryeler', kuryeler: kur });
    if (c.hata) { log('HATA: kurye listesi kaydedilemedi — ' + c.hata); return; }
  }

  const gunler = p.gunler || [];
  if (!gunler.length) return;      // eksik gün yok, sessizce çık

  // --- günleri çek ---
  const atlanan = new Set();
  let tm = 0, ts = 0, sorunlu = [];

  for (let i = 0; i < gunler.length; i++) {
    const gun = gunler[i];
    const sd = gun + 'T12:00:00.000Z';
    const sipVar = (p.sipHazir || []).includes(gun);
    const paket = [];
    let hataliKurye = 0;

    if (i) await uyu(GUN_ARA);

    for (const k of kur) {
      const u = `${BASE}/manager/agent/${k.id}`;

      const w = await iste(`${u}/working-hours-by-date?searchDate=${sd}`, H);
      await uyu(BEKLE);
      const sf = await iste(`${u}/shifts?searchDate=${sd}`, H);
      await uyu(BEKLE);

      let od = null;
      if (!sipVar) {
        od = await iste(`${u}/orders-by-date?searchDate=${sd}`, H);
        await uyu(BEKLE);
      }

      if (w.disari || sf.disari || (od && od.disari)) {
        if (!atlanan.has(k.id)) { atlanan.add(k.id); log('ATLANDI: ' + k.ad + ' (no ' + k.id + ') firmada degil, diger kuryelere devam'); }
      }
      if (w.dur || sf.dur || (od && od.dur)) {
        const kod = w.kod || sf.kod || (od && od.kod);
        log(kod === 401
          ? 'DURDU (401): token geçersiz. ayar.json içindeki token\'ı yenile.'
          : `DURDU (${kod}): sunucu istekleri reddediyor. Sonraki turda tekrar denenecek.`);
        return;
      }
      if (!sf.ok || !w.ok) hataliKurye++;

      const kayit = {
        ad: k.ad,
        sOk: sf.ok,
        pOk: w.ok,
        plan: (w.j && w.j.data) || null,
        shifts: (sf.j && sf.j.data) || []
      };
      if (od) kayit.siparisler = Array.isArray(od.j) ? od.j : ((od.j && od.j.data) || []);
      paket.push(kayit);
    }

    const s = await yolla({ tur: 'gun', gun, kuryeler: paket });
    if (s.hata) { log(`HATA (${gun}): ${s.hata}`); return; }
    tm += (s.mesaiYeni || 0) + (s.mesaiGuncel || 0);
    ts += (s.sipYeni || 0) + (s.sipGuncel || 0);
    if (hataliKurye) sorunlu.push(`${gun} (${hataliKurye} kurye)`);
  }

  // --- tabloları tazele: sadece bir şey değiştiyse ---
  let bt = null;
  if (tm || ts) bt = await yolla({ tur: 'bitir' });

  if (true) {
    log(`${gunler.length} gün · ${tm} mesai · ${ts} sipariş` +
        (bt ? ` · tablolar ${bt.ok ? 'yenilendi' : 'YENİLENEMEDİ'}` : '') +
        (sorunlu.length ? ` · eksik: ${sorunlu.join(', ')}` : ''));
  }
})().catch(e => log('BEKLENMEYEN HATA: ' + (e && e.stack ? e.stack : e)));
