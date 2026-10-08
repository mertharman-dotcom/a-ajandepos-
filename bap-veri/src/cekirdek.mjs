// BAP veri çekirdeği (Faz 1 taslağı). Cloudflare D1 API'si (prepare/bind/first/all/run, batch) ile çalışır;
// testlerde aynı API node:sqlite üzerinde taklit edilir. Canlıya kurulmadı.

const IS_GUNU_SAAT = 5;          // 05:00'ten önceki işlem önceki işletme gününe sayılır (Hazırlık ajanıyla aynı)
const TR_UTC_FARK_SAAT = 3;      // Türkiye 2016'dan beri sabit UTC+3
const GEC_GIRIS_SAAT = 24;       // bundan eski işlem zamanı sebep ister

export class KayitHatasi extends Error {
  constructor(kod, mesaj, durum = 400) { super(mesaj); this.kod = kod; this.durum = durum; }
}

export function isletmeGunu(isoZaman) {
  const t = Date.parse(isoZaman);
  if (!Number.isFinite(t)) throw new KayitHatasi('zaman', 'İşlem zamanı okunamadı');
  const yerel = new Date(t + (TR_UTC_FARK_SAAT - IS_GUNU_SAAT) * 3600e3);
  return yerel.toISOString().slice(0, 10);
}

// Gövdenin kararlı özeti: aynı id farklı içerikle gelirse yakalanır.
export function govdeOzet(g) {
  const sirali = o => Array.isArray(o) ? o.map(sirali)
    : (o && typeof o === 'object') ? Object.keys(o).sort().reduce((a, k) => (a[k] = sirali(o[k]), a), {}) : o;
  return JSON.stringify(sirali(g));
}

const YETKI = {
  YONETICI: ['URETIM', 'ZAYI', 'SAYIM', 'DUZELTME'],
  SEF: ['URETIM', 'ZAYI', 'SAYIM', 'DUZELTME'],
  MUTFAK: ['URETIM', 'ZAYI', 'SAYIM'],
};

/**
 * Tek giriş noktası. Döner: { durum: 'KAYDEDILDI' | 'ZATEN_KAYITLI', id, sira, ozet }
 * Ya hepsi yazılır ya hiçbiri (D1 batch tek işlem olarak çalışır).
 */
export async function kaydet(db, govde, kullanici, simdiIso = new Date().toISOString()) {
  if (!govde || typeof govde.id !== 'string' || !/^[0-9a-f-]{16,64}$/i.test(govde.id)) {
    throw new KayitHatasi('kimlik', 'Kayıt kimliği yok ya da geçersiz');
  }
  if (!kullanici || !YETKI[kullanici.rol] || !YETKI[kullanici.rol].includes(govde.tur)) {
    throw new KayitHatasi('yetki', 'Bu işlem için yetkiniz yok', 403);
  }
  const ozet = govdeOzet(govde);

  const onceki = await db.prepare('SELECT sira, govde_ozet FROM islem WHERE id = ?').bind(govde.id).first();
  if (onceki) {
    if (onceki.govde_ozet !== ozet) throw new KayitHatasi('cakisma', 'Bu kimlikle farklı içerikte bir kayıt zaten var', 409);
    return { durum: 'ZATEN_KAYITLI', id: govde.id, sira: onceki.sira };
  }

  const konum = await db.prepare('SELECT id FROM konum WHERE id = ?').bind(govde.konum).first();
  if (!konum) throw new KayitHatasi('konum', 'Şube bulunamadı');
  const islemZamani = govde.islem_zamani || simdiIso;
  const gecikmeSaat = (Date.parse(simdiIso) - Date.parse(islemZamani)) / 3600e3;
  if (gecikmeSaat < -0.25) throw new KayitHatasi('zaman', 'İşlem zamanı gelecekte olamaz');
  if (gecikmeSaat > GEC_GIRIS_SAAT && !(govde.sebep || '').trim()) {
    throw new KayitHatasi('gec_giris', '24 saatten eski kayıt için sebep yazılmalı');
  }

  const islemSatiri = db.prepare(
    `INSERT INTO islem (id, tur, konum_id, isletme_gunu, islem_zamani, giris_zamani, kullanici, cihaz, ilgili_islem_id, sebep, aciklama, govde_ozet)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(govde.id, govde.tur, govde.konum, isletmeGunu(islemZamani), islemZamani, simdiIso, kullanici.ad,
    govde.cihaz || null, govde.ilgili_islem_id || null, govde.sebep || null, govde.aciklama || null, ozet);

  let digerleri;
  if (govde.tur === 'URETIM') digerleri = await uretimSatirlari(db, govde, islemZamani);
  else if (govde.tur === 'ZAYI') digerleri = await zayiSatirlari(db, govde);
  else if (govde.tur === 'SAYIM') digerleri = await sayimSatirlari(db, govde);
  else if (govde.tur === 'DUZELTME') digerleri = await duzeltmeSatirlari(db, govde);
  else throw new KayitHatasi('tur', 'Bilinmeyen işlem türü');

  try {
    await db.batch([islemSatiri, ...digerleri]);
  } catch (e) {
    // Aynı id iki cihazdan aynı anda geldiyse ikinci UNIQUE'e takılır: ilkinin sonucunu döndür.
    const simdiVar = await db.prepare('SELECT sira, govde_ozet FROM islem WHERE id = ?').bind(govde.id).first();
    if (simdiVar && simdiVar.govde_ozet === ozet) return { durum: 'ZATEN_KAYITLI', id: govde.id, sira: simdiVar.sira };
    throw e;
  }
  const yazilan = await db.prepare('SELECT sira FROM islem WHERE id = ?').bind(govde.id).first();
  return { durum: 'KAYDEDILDI', id: govde.id, sira: yazilan.sira };
}

async function kalemGetir(db, id) {
  const k = await db.prepare('SELECT * FROM kalem WHERE id = ? AND aktif = 1').bind(id).first();
  if (!k) throw new KayitHatasi('kalem', 'Kalem bulunamadı: ' + id);
  return k;
}

function pozitif(x, ad) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) throw new KayitHatasi('miktar', ad + ' sıfırdan büyük olmalı');
  return n;
}

async function uretimSatirlari(db, g, islemZamani) {
  const ym = await kalemGetir(db, g.kalem);
  if (ym.tip !== 'YM') throw new KayitHatasi('kalem', 'Üretim yalnız yarı mamul için girilir');
  const kat = pozitif(g.kat, 'Parti (kat)');
  // O anda geçerli reçete sürümü (geriye dönük girişte o tarihteki sürüm)
  const surum = await db.prepare(
    `SELECT * FROM recete_surum WHERE kalem_id = ? AND gecerli_bas <= ? ORDER BY gecerli_bas DESC, surum DESC LIMIT 1`
  ).bind(ym.id, islemZamani).first();
  if (!surum) throw new KayitHatasi('recete', ym.ad + ' için geçerli reçete yok');
  const satirlar = (await db.prepare('SELECT * FROM recete_satir WHERE surum_id = ? ORDER BY sira').bind(surum.id).all()).results;
  if (!satirlar.length) throw new KayitHatasi('recete', ym.ad + ' reçetesinde malzeme yok');

  const beklenen = surum.parti_cikti * kat;
  const gercek = g.gercek_cikti == null ? beklenen : pozitif(g.gercek_cikti, 'Gerçek çıktı');
  const sk = surum.raf_omru_saat ? new Date(Date.parse(islemZamani) + surum.raf_omru_saat * 3600e3).toISOString() : null;

  const st = [db.prepare(
    `INSERT INTO parti (id, kalem_id, konum_id, recete_surum_id, kat, beklenen, gercek, uretim_zamani, son_kullanma)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(g.id, ym.id, g.konum, surum.id, kat, beklenen, gercek, islemZamani, sk)];
  for (const s of satirlar) {
    st.push(db.prepare('INSERT INTO hareket (islem_id, kalem_id, konum_id, miktar, parti_id, rol) VALUES (?,?,?,?,?,?)')
      .bind(g.id, s.girdi_kalem_id, g.konum, -(s.miktar * kat), null, 'GIRDI'));
  }
  st.push(db.prepare('INSERT INTO hareket (islem_id, kalem_id, konum_id, miktar, parti_id, rol) VALUES (?,?,?,?,?,?)')
    .bind(g.id, ym.id, g.konum, gercek, g.id, 'CIKTI'));
  return st;
}

async function zayiSatirlari(db, g) {
  if (!(g.sebep || '').trim()) throw new KayitHatasi('sebep', 'Zayi sebebi yazılmalı');
  const k = await kalemGetir(db, g.kalem);
  const miktar = pozitif(g.miktar, 'Zayi miktarı');
  if (g.parti_id) {
    const p = await db.prepare('SELECT kalem_id FROM parti WHERE id = ?').bind(g.parti_id).first();
    if (!p || p.kalem_id !== k.id) throw new KayitHatasi('parti', 'Parti bu kaleme ait değil');
  }
  return [db.prepare('INSERT INTO hareket (islem_id, kalem_id, konum_id, miktar, parti_id, rol) VALUES (?,?,?,?,?,?)')
    .bind(g.id, k.id, g.konum, -miktar, g.parti_id || null, 'ZAYI')];
}

async function sayimSatirlari(db, g) {
  if (!Array.isArray(g.satirlar) || !g.satirlar.length) throw new KayitHatasi('sayim', 'Sayım satırı yok');
  const st = [];
  const gorulen = new Set();
  for (const s of g.satirlar) {
    const k = await kalemGetir(db, s.kalem);
    if (gorulen.has(k.id)) throw new KayitHatasi('sayim', k.ad + ' iki kez sayılmış');
    gorulen.add(k.id);
    const n = Number(s.sayilan);
    if (!Number.isFinite(n) || n < 0) throw new KayitHatasi('miktar', k.ad + ': sayılan miktar geçersiz');
    st.push(db.prepare('INSERT INTO sayim_satir (islem_id, kalem_id, sayilan) VALUES (?,?,?)').bind(g.id, k.id, n));
  }
  return st;
}

// Düzeltme eski kaydı değiştirmez: ters hareketi yeni bir işlem olarak yazar ve eskisine bağlanır.
async function duzeltmeSatirlari(db, g) {
  if (!g.ilgili_islem_id) throw new KayitHatasi('duzeltme', 'Hangi kaydın düzeltildiği belirtilmeli');
  if (!(g.sebep || '').trim()) throw new KayitHatasi('sebep', 'Düzeltme sebebi yazılmalı');
  const eski = await db.prepare('SELECT * FROM islem WHERE id = ?').bind(g.ilgili_islem_id).first();
  if (!eski) throw new KayitHatasi('duzeltme', 'Düzeltilecek kayıt bulunamadı');
  if (eski.konum_id !== g.konum) throw new KayitHatasi('duzeltme', 'Düzeltme aynı şubede olmalı');
  const onceki = await db.prepare('SELECT COUNT(*) AS n FROM islem WHERE ilgili_islem_id = ? AND tur = ?').bind(eski.id, 'DUZELTME').first();
  if (onceki.n > 0) throw new KayitHatasi('duzeltme', 'Bu kayıt zaten düzeltilmiş; düzeltmeyi düzeltin');
  const hareketler = (await db.prepare('SELECT * FROM hareket WHERE islem_id = ?').bind(eski.id).all()).results;
  return hareketler.map(h => db.prepare('INSERT INTO hareket (islem_id, kalem_id, konum_id, miktar, parti_id, rol) VALUES (?,?,?,?,?,?)')
    .bind(g.id, h.kalem_id, h.konum_id, -h.miktar, h.parti_id, 'DUZELTME'));
}

/** Sheets aktarımı için: verilen sıradan sonraki işlemler, hareketleri ve sayımlarıyla. */
export async function aktarimListesi(db, sonraSira, limit = 100) {
  const islemler = (await db.prepare('SELECT * FROM islem WHERE sira > ? ORDER BY sira LIMIT ?').bind(sonraSira, limit).all()).results;
  if (!islemler.length) return [];
  const idler = islemler.map(i => i.id);
  const yer = idler.map(() => '?').join(',');
  const hareketler = (await db.prepare(`SELECT h.*, k.kaynak_satir_ad, k.tip FROM hareket h JOIN kalem k ON k.id = h.kalem_id WHERE islem_id IN (${yer}) ORDER BY h.id`).bind(...idler).all()).results;
  const sayimlar = (await db.prepare(`SELECT s.*, k.kaynak_satir_ad, k.tip FROM sayim_satir s JOIN kalem k ON k.id = s.kalem_id WHERE islem_id IN (${yer})`).bind(...idler).all()).results;
  const partiler = (await db.prepare(`SELECT * FROM parti WHERE id IN (${yer})`).bind(...idler).all()).results;
  return islemler.map(i => ({
    ...i,
    hareketler: hareketler.filter(h => h.islem_id === i.id),
    sayimlar: sayimlar.filter(s => s.islem_id === i.id),
    parti: partiler.find(p => p.id === i.id) || null,
  }));
}

/** Apps Script işlediği son sırayı bildirir. Geri gitmez (eski onay yeni onayı ezmez). */
export async function aktarimOnay(db, hedef, sira, simdiIso = new Date().toISOString()) {
  await db.prepare(
    `INSERT INTO aktarim (hedef, son_sira, son_onay) VALUES (?,?,?)
     ON CONFLICT(hedef) DO UPDATE SET son_sira = MAX(son_sira, excluded.son_sira), son_onay = excluded.son_onay`
  ).bind(hedef, sira, simdiIso).run();
}

/** Henüz Sheets'e işlenmemiş kayıtların stok etkisi (panel "stoğa işlenmeyi bekliyor" gösterir). */
export async function bekleyenEtki(db, hedef, konum) {
  const a = await db.prepare('SELECT son_sira FROM aktarim WHERE hedef = ?').bind(hedef).first();
  const son = a ? a.son_sira : 0;
  return (await db.prepare(
    `SELECT h.kalem_id, SUM(h.miktar) AS miktar, COUNT(DISTINCT i.id) AS islem_sayisi
     FROM islem i JOIN hareket h ON h.islem_id = i.id
     WHERE i.sira > ? AND i.konum_id = ? GROUP BY h.kalem_id`
  ).bind(son, konum).all()).results;
}

/** Raf ömrü geçen partiler: kullanılabilir stoktan ayrılacak miktar (zayi kaydı personel onayıyla ayrıca girilir). */
export async function suresiGecenPartiler(db, konum, simdiIso = new Date().toISOString()) {
  return (await db.prepare(
    `SELECT p.id, p.kalem_id, p.gercek, p.son_kullanma,
            p.gercek + COALESCE((SELECT SUM(h.miktar) FROM hareket h WHERE h.parti_id = p.id AND h.rol <> 'CIKTI'), 0) AS kalan_kayitli
     FROM parti p WHERE p.konum_id = ? AND p.son_kullanma IS NOT NULL AND p.son_kullanma < ?
     ORDER BY p.son_kullanma`
  ).bind(konum, simdiIso).all()).results;
}

/**
 * Bakiyeyi hareketlerden yeniden hesaplar ve kayıtlı bakiyeyle karşılaştırır (yazmaz, rapor verir).
 * Fark: tutar, hareket sayısı ya da son hareket kimliği tutmayan (kalem, konum) satırları.
 * Okuma maliyeti hareket tablosu kadardır; günlük değil, haftalık / geçiş anında çalıştırılır.
 */
export async function bakiyeKontrol(db) {
  const r = await db.prepare(`
    WITH h AS (SELECT kalem_id, konum_id, round(SUM(miktar), 6) toplam, COUNT(*) n, MAX(id) son FROM hareket GROUP BY kalem_id, konum_id)
    SELECT COALESCE(h.kalem_id, b.kalem_id) kalem_id, COALESCE(h.konum_id, b.konum_id) konum_id,
           h.toplam hesaplanan, b.miktar kayitli, h.n hareket_sayisi_h, b.hareket_sayisi hareket_sayisi_b, h.son son_h, b.son_hareket_id son_b
      FROM h LEFT JOIN bakiye b ON b.kalem_id = h.kalem_id AND b.konum_id = h.konum_id
    UNION ALL
    SELECT b.kalem_id, b.konum_id, NULL, b.miktar, NULL, b.hareket_sayisi, NULL, b.son_hareket_id
      FROM bakiye b WHERE NOT EXISTS (SELECT 1 FROM hareket x WHERE x.kalem_id = b.kalem_id AND x.konum_id = b.konum_id)`).all();
  const farklar = r.results.filter(x => x.hesaplanan === null || x.kayitli === null || Math.abs(x.hesaplanan - x.kayitli) > 0.000001
    || x.hareket_sayisi_h !== x.hareket_sayisi_b || x.son_h !== x.son_b);
  return { satir: r.results.length, farklar };
}

/** Şube stok ekranı: bakiye tablosundan okur (hareket taramaz). */
export async function subeBakiyesi(db, konum) {
  return (await db.prepare('SELECT kalem_id, miktar FROM bakiye WHERE konum_id = ? ORDER BY kalem_id').bind(konum).all()).results;
}
