import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { d1Olustur, ornekVeri } from './d1-taklit.mjs';
import { kaydet, aktarimListesi, aktarimOnay, bekleyenEtki, suresiGecenPartiler, isletmeGunu } from '../src/cekirdek.mjs';

const require = createRequire(import.meta.url);
const { kuyrukOlustur } = require('../istemci/kuyruk.js');
const { akt_aktar } = require('../aktarim/Veritabani Aktarim.js');
const { bosStokDosyasi } = require('./sheets-taklit.cjs');

const SEMA = new URL('../sema.sql', import.meta.url).pathname;
const CEREN = { ad: 'Ceren', rol: 'SEF' };
const USTA = { ad: 'Yusuf', rol: 'MUTFAK' };
const SIMDI = '2026-10-08T09:00:00.000Z'; // 12:00 İstanbul

function yeniDb() { const db = d1Olustur(SEMA); ornekVeri(db); return db; }
const uretim = (ek = {}) => ({ id: randomUUID(), tur: 'URETIM', konum: 'ERENKOY', kalem: 'YM-NARENCIYE', kat: 0.5, islem_zamani: SIMDI, ...ek });
const say = (db, t) => db.tum(`SELECT COUNT(*) n FROM ${t}`)[0].n;
// Apps Script senkron çalışır; testte veritabanı çağrısını önceden çözüp senkron bağlantı veriyoruz.
async function senkronBaglanti(db) {
  const tum = await aktarimListesi(db, 0, 1000);
  let onaylanan = null;
  return { liste: s => tum.filter(i => i.sira > s), onay: s => { onaylanan = s; }, onaylanan: () => onaylanan };
}

test('1. Mükerrer kayıt: aynı kimlik iki kez gelirse tek kayıt açılır', async () => {
  const db = yeniDb();
  const g = uretim();
  const a = await kaydet(db, g, CEREN, SIMDI);
  const b = await kaydet(db, g, CEREN, SIMDI);
  assert.equal(a.durum, 'KAYDEDILDI');
  assert.equal(b.durum, 'ZATEN_KAYITLI');
  assert.equal(b.sira, a.sira);
  assert.equal(say(db, 'islem'), 1);
  assert.equal(say(db, 'hareket'), 4); // 3 girdi + 1 çıktı
  await assert.rejects(kaydet(db, { ...g, kat: 1 }, CEREN, SIMDI), e => e.kod === 'cakisma' && e.durum === 409);
});

test('2. Yarım işlem: hareketlerden biri yazılamazsa üretim, parti ve hiçbir hareket kalmaz', async () => {
  const db = yeniDb();
  let n = 0;
  db.hataEnjekte(sql => sql.startsWith('INSERT INTO hareket') && ++n === 3);
  const g = uretim();
  await assert.rejects(kaydet(db, g, CEREN, SIMDI));
  assert.equal(say(db, 'islem'), 0);
  assert.equal(say(db, 'parti'), 0);
  assert.equal(say(db, 'hareket'), 0);
  db.hataEnjekte(null);
  const r = await kaydet(db, g, CEREN, SIMDI); // aynı kimlikle yeniden: temiz yazılır
  assert.equal(r.durum, 'KAYDEDILDI');
  assert.equal(say(db, 'hareket'), 4);
});

test('3. Eşzamanlı giriş: iki şubeden 50 kayıt aynı anda; hepsi yazılır, toplamlar tutar; aynı kimlik 5 kez aynı anda → 1 kayıt', async () => {
  const db = yeniDb();
  const isler = [];
  for (let i = 0; i < 25; i++) isler.push(kaydet(db, uretim({ kat: 1 }), CEREN, SIMDI));
  for (let i = 0; i < 25; i++) isler.push(kaydet(db, { id: randomUUID(), tur: 'URETIM', konum: 'FIKIRTEPE', kalem: 'YM-PIZZA-HAMURU', kat: 0.5, islem_zamani: SIMDI }, USTA, SIMDI));
  const sonuc = await Promise.all(isler);
  assert.equal(sonuc.filter(r => r.durum === 'KAYDEDILDI').length, 50);
  const top = db.tum(`SELECT kalem_id, SUM(miktar) m FROM hareket GROUP BY kalem_id`).reduce((a, r) => (a[r.kalem_id] = r.m, a), {});
  assert.equal(top['HM-MAYONEZ'], -4000 * 25);
  assert.equal(top['YM-NARENCIYE'], 16820 * 25);
  assert.equal(top['YM-PIZZA-HAMURU'], 85 * 0.5 * 25); // adet olarak: gram/adet karışıklığı yok
  const ayni = uretim();
  const coklu = await Promise.all([1, 2, 3, 4, 5].map(() => kaydet(db, ayni, CEREN, SIMDI)));
  assert.equal(coklu.filter(r => r.durum === 'KAYDEDILDI').length, 1);
  assert.equal(db.tum('SELECT COUNT(*) n FROM islem WHERE id = ?', ayni.id)[0].n, 1);
});

test('4. Bağlantı kesintisi: kayıt telefonda bekler, sunucu onayı gelmeden "kaydedildi" denmez, cevap kaybolsa da çift kayıt olmaz', async () => {
  const db = yeniDb();
  let depo = [];
  const plan = ['AG_YOK', 'AG_YOK', 'SUNUCU_500', 'YAZDI_CEVAP_KAYIP', 'NORMAL'];
  let adim = 0;
  const kuyruk = kuyrukOlustur({
    depo: { oku: () => JSON.parse(JSON.stringify(depo)), yaz: l => { depo = JSON.parse(JSON.stringify(l)); } },
    kimlikUret: randomUUID,
    gonder: async govde => {
      const p = plan[adim++];
      if (p === 'AG_YOK') throw new TypeError('Failed to fetch');
      if (p === 'SUNUCU_500') return { status: 500, json: null };
      const r = await kaydet(db, govde, CEREN, SIMDI);
      if (p === 'YAZDI_CEVAP_KAYIP') throw new TypeError('connection reset');
      return { status: 200, json: r };
    },
  });
  const id = kuyruk.ekle({ tur: 'URETIM', konum: 'ERENKOY', kalem: 'YM-NARENCIYE', kat: 0.5, islem_zamani: SIMDI });
  assert.equal(kuyruk.liste()[0].durum, 'BEKLIYOR'); // ağa gitmeden telefona yazıldı
  const gorulen = [];
  for (let i = 0; i < 5; i++) { const l = await kuyruk.isle(); gorulen.push(l[0].durum); }
  assert.deepEqual(gorulen, ['BEKLIYOR', 'BEKLIYOR', 'BEKLIYOR', 'BEKLIYOR', 'KAYDEDILDI']);
  assert.equal(db.tum('SELECT COUNT(*) n FROM islem WHERE id = ?', id)[0].n, 1);
  // Sunucu reddederse (ör. sebep eksik) HATA olur, sessizce silinmez
  let d3 = [{ id: 'x', durum: 'BEKLIYOR', deneme: 0, govde: {} }];
  const k3 = kuyrukOlustur({ depo: { oku: () => d3, yaz: l => { d3 = l; } }, kimlikUret: randomUUID,
    gonder: async () => ({ status: 400, json: { hata: 'Zayi sebebi yazılmalı' } }) });
  const l3 = await k3.isle();
  assert.equal(l3[0].durum, 'HATA');
  assert.equal(l3[0].mesaj, 'Zayi sebebi yazılmalı');
});

test('5. Aktarım hatası: yarıda kalan tur tekrarlanmaz ve durur; baştan düşen tur sonra eksiksiz tamamlanır; ikinci çalışma çift yazmaz', async () => {
  const db = yeniDb();
  await kaydet(db, uretim(), CEREN, SIMDI);
  await kaydet(db, { id: randomUUID(), tur: 'ZAYI', konum: 'ERENKOY', kalem: 'HM-PORTAKAL', miktar: 1500, sebep: 'Çürük', islem_zamani: SIMDI }, USTA, SIMDI);

  // a) Veritabanına ulaşılamadı: hiçbir şey yazılmaz, onay gitmez
  const ss = bosStokDosyasi();
  assert.throws(() => akt_aktar(ss, { liste: () => { throw new Error('UrlFetch zaman aşımı'); }, onay: () => assert.fail('onay gitmemeli') }));
  assert.equal(ss.veri('Stok_Hareketleri').length, 1);

  // b) Normal tur
  let b = await senkronBaglanti(db);
  const r1 = akt_aktar(ss, b, new Date(SIMDI));
  assert.equal(r1.islenen, 2);
  assert.equal(b.onaylanan(), 2);
  const stok = ad => ss.veri('Sube_Stok').find(r => r[0] === ad)[3];
  assert.equal(stok('Mayonez'), 20000 - 2000);
  assert.equal(stok('PORTAKAL'), 30000 - 3500 - 1500);
  assert.equal(stok('Narenciye sos'), 500 + 8410);
  const hareketSayisi = ss.veri('Stok_Hareketleri').length;

  // c) Aynı tur yeniden çalışırsa (tetikleyici iki kez koştu): hiçbir şey değişmez
  b = await senkronBaglanti(db);
  const r2 = akt_aktar(ss, b, new Date(SIMDI));
  assert.equal(r2.islenen, 0);
  assert.equal(ss.veri('Stok_Hareketleri').length, hareketSayisi);
  assert.equal(stok('Mayonez'), 18000);

  // d) Yeni kayıt yazılırken Sheets hatası: işaret BASLADI'da kalır, sonraki tur durur, çift hareket olmaz
  await kaydet(db, uretim(), CEREN, SIMDI);
  ss.hataEnjekte((ad, islem) => ad === 'Stok_Hareketleri' && islem === 'setValues');
  b = await senkronBaglanti(db);
  assert.throws(() => akt_aktar(ss, b, new Date(SIMDI)));
  assert.equal(b.onaylanan(), null); // veritabanına "işlendi" denmedi
  ss.hataEnjekte(null);
  const r3 = akt_aktar(ss, await senkronBaglanti(db), new Date(SIMDI));
  assert.equal(r3.durum, 'DURDU_YARIM');
  assert.equal(r3.yarim.length, 1);
});

test('6. Geri dönüş: aktarım bitince veritabanındaki her işlem Sheets\'te birebir var; bekleyen etki sıfır', async () => {
  const db = yeniDb();
  for (let i = 0; i < 10; i++) await kaydet(db, uretim({ kat: 0.5 }), CEREN, SIMDI);
  const once = bosStokDosyasi();
  const b = await senkronBaglanti(db);
  akt_aktar(once, b, new Date(SIMDI));
  await aktarimOnay(db, 'sheets', b.onaylanan());
  assert.deepEqual(await bekleyenEtki(db, 'sheets', 'ERENKOY'), []);
  const dbIdler = db.tum('SELECT id FROM islem').map(r => r.id).sort();
  const sheetsIdler = [...new Set(once.veri('Stok_Hareketleri').slice(1).map(r => String(r[8]).split(' ')[0].replace('DB:', '')))].sort();
  assert.deepEqual(sheetsIdler, dbIdler);
  // Stok farkı = veritabanı hareket toplamı (kalem kalem)
  const dbTop = db.tum(`SELECT k.kaynak_satir_ad ad, SUM(h.miktar) m FROM hareket h JOIN kalem k ON k.id=h.kalem_id GROUP BY ad`);
  const ilk = bosStokDosyasi().veri('Sube_Stok');
  for (const r of dbTop) {
    const s0 = ilk.find(x => x[0] === r.ad)[3], s1 = once.veri('Sube_Stok').find(x => x[0] === r.ad)[3];
    assert.equal(Math.round((s1 - s0) * 1000) / 1000, Math.round(r.m * 1000) / 1000, r.ad);
  }
});

test('7. Sayım, sayıldığı ana göre uygulanır: sayımdan sonra işlenen satış düşümü kaybolmaz', async () => {
  const db = yeniDb();
  const sayimAni = '2026-10-08T06:00:00.000Z';
  await kaydet(db, { id: randomUUID(), tur: 'SAYIM', konum: 'ERENKOY', satirlar: [{ kalem: 'YM-NARENCIYE', sayilan: 1000 }], islem_zamani: sayimAni }, USTA, SIMDI);
  const ss = bosStokDosyasi();
  // Satış motoru sayımdan sonra 200 gr düşmüş
  ss.veri('Stok_Hareketleri').push([new Date('2026-10-08T07:00:00Z'), 'Erenköy', 'Narenciye sos', 'Satis', 500, 300, 'gr', '', 'SP123', 'motor']);
  ss.veri('Sube_Stok').find(r => r[0] === 'Narenciye sos')[3] = 300;
  akt_aktar(ss, await senkronBaglanti(db), new Date(SIMDI));
  assert.equal(ss.veri('Sube_Stok').find(r => r[0] === 'Narenciye sos')[3], 800);
});

test('8. Düzeltme eski kaydı değiştirmez; ters hareketle bağlanır; aynı kayıt iki kez düzeltilemez; mutfak düzeltme yapamaz', async () => {
  const db = yeniDb();
  const g = uretim();
  await kaydet(db, g, CEREN, SIMDI);
  assert.throws(() => db.exec(`UPDATE islem SET kullanici='x'`), /degistirilemez/);
  assert.throws(() => db.exec(`DELETE FROM hareket`), /silinemez/);
  const d = { id: randomUUID(), tur: 'DUZELTME', konum: 'ERENKOY', ilgili_islem_id: g.id, sebep: 'Yanlış ürün seçildi', islem_zamani: SIMDI };
  await assert.rejects(kaydet(db, d, USTA, SIMDI), e => e.kod === 'yetki');
  await kaydet(db, d, CEREN, SIMDI);
  const net = db.tum(`SELECT SUM(miktar) m FROM hareket`)[0].m;
  assert.equal(net, 0);
  await assert.rejects(kaydet(db, { ...d, id: randomUUID() }, CEREN, SIMDI), e => e.kod === 'duzeltme');
});

test('9. Reçete sürümü: değişiklik geçmiş üretimi değiştirmez; geriye dönük giriş o tarihteki sürümü kullanır', async () => {
  const db = yeniDb();
  const eski = uretim({ kat: 1 });
  await kaydet(db, eski, CEREN, SIMDI);
  db.exec(`INSERT INTO recete_surum VALUES ('RS-NAR-2','YM-NARENCIYE',2,16000,72,'2026-10-08T10:00:00Z','Ceren','Portakal azaltıldı');
           INSERT INTO recete_satir VALUES ('RS-NAR-2',1,'HM-MAYONEZ',4000,NULL),('RS-NAR-2',2,'HM-PORTAKAL',6000,NULL),('RS-NAR-2',3,'HM-ELMA',2000,NULL);`);
  assert.throws(() => db.exec(`UPDATE recete_surum SET parti_cikti=1 WHERE id='RS-NAR-1'`), /yeni surum/);
  const yeni = uretim({ kat: 1, islem_zamani: '2026-10-08T11:00:00.000Z' });
  await kaydet(db, yeni, CEREN, '2026-10-08T11:00:00.000Z');
  // Yeni sürüm açıldıktan SONRA, ama işi sürümden ÖNCE yapılmış bir üretim girilirse eski sürüm kullanılır
  const geriye = uretim({ kat: 1, islem_zamani: '2026-10-08T09:30:00.000Z' });
  await kaydet(db, geriye, CEREN, '2026-10-08T11:05:00.000Z');
  const p = db.tum('SELECT id, recete_surum_id, beklenen FROM parti ORDER BY uretim_zamani');
  assert.deepEqual(p.map(x => x.recete_surum_id), ['RS-NAR-1', 'RS-NAR-1', 'RS-NAR-2']);
  assert.equal(db.tum(`SELECT miktar FROM hareket WHERE islem_id=? AND kalem_id='HM-PORTAKAL'`, eski.id)[0].miktar, -7000);
});

test('10. İşletme günü (05:00) ve geç giriş: 04:30 önceki güne yazılır; 24 saatten eskisi sebep ister, iki zaman ayrı saklanır', async () => {
  assert.equal(isletmeGunu('2026-10-08T01:30:00Z'), '2026-10-07'); // 04:30 İstanbul
  assert.equal(isletmeGunu('2026-10-08T02:00:00Z'), '2026-10-08'); // 05:00 İstanbul
  const db = yeniDb();
  const gec = uretim({ islem_zamani: '2026-10-06T08:00:00.000Z' });
  await assert.rejects(kaydet(db, gec, CEREN, SIMDI), e => e.kod === 'gec_giris');
  await kaydet(db, { ...gec, sebep: '5–7 Ekim panel hatası, sonradan giriş' }, CEREN, SIMDI);
  const r = db.tum('SELECT islem_zamani, giris_zamani, isletme_gunu, sebep FROM islem')[0];
  assert.equal(r.islem_zamani, '2026-10-06T08:00:00.000Z');
  assert.equal(r.giris_zamani, SIMDI);
  assert.equal(r.isletme_gunu, '2026-10-06');
});

test('11. Raf ömrü: süresi geçen parti listelenir (stok kendiliğinden silinmez, zayi personel onayıyla girilir)', async () => {
  const db = yeniDb();
  const g = uretim({ islem_zamani: '2026-10-04T06:00:00.000Z', sebep: 'test' });
  await kaydet(db, g, CEREN, SIMDI);
  const l = await suresiGecenPartiler(db, 'ERENKOY', SIMDI);
  assert.equal(l.length, 1);
  assert.equal(l[0].id, g.id);
  assert.equal(say(db, 'hareket'), 4); // otomatik zayi yazılmadı
});

test('12. Kapasite ölçümü: işlem başına veritabanına yazılan satır', async () => {
  const db = yeniDb();
  const once = db.sayac.yazilanSatir;
  await kaydet(db, uretim(), CEREN, SIMDI);
  const uretimSatir = db.sayac.yazilanSatir - once;
  const o2 = db.sayac.yazilanSatir;
  await kaydet(db, { id: randomUUID(), tur: 'ZAYI', konum: 'ERENKOY', kalem: 'HM-PORTAKAL', miktar: 100, sebep: 'x', islem_zamani: SIMDI }, USTA, SIMDI);
  const zayiSatir = db.sayac.yazilanSatir - o2;
  console.log(`  ÖLÇÜM: 3 malzemeli üretim = ${uretimSatir} satır (+ indeksler), zayi = ${zayiSatir} satır`);
  assert.ok(uretimSatir === 6 && zayiSatir === 2);
});
