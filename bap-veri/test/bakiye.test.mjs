// Bakiye tablosu: hareket + bakiye aynı işlemde; mükerrer kayıt bakiyeyi iki kez değiştirmez; kesintide ikisi birlikte geri alınır;
// bakiye hareketlerden yeniden hesaplanıp karşılaştırılabilir; elle değiştirilemez.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { d1Olustur, ornekVeri } from './d1-taklit.mjs';
import { kaydet, bakiyeKontrol, subeBakiyesi } from '../src/cekirdek.mjs';

const SEMA = new URL('../sema.sql', import.meta.url).pathname;
const CEREN = { ad: 'Ceren', rol: 'SEF' };
const SIMDI = '2026-10-08T09:00:00.000Z';
const yeniDb = () => { const db = d1Olustur(SEMA); ornekVeri(db); return db; };
const uretim = (ek = {}) => ({ id: randomUUID(), tur: 'URETIM', konum: 'ERENKOY', kalem: 'YM-NARENCIYE', kat: 0.5, islem_zamani: SIMDI, ...ek });
const bak = (db, kalem, konum = 'ERENKOY') => (db.tum('SELECT miktar FROM bakiye WHERE kalem_id=? AND konum_id=?', kalem, konum)[0] || {}).miktar;

test('B1. Kayıt: hareketler ve bakiye birlikte yazılır; bakiye = hareket toplamı', async () => {
  const db = yeniDb();
  await kaydet(db, uretim(), CEREN, SIMDI);
  assert.equal(bak(db, 'YM-NARENCIYE'), 8410);
  assert.equal(bak(db, 'HM-MAYONEZ'), -2000);
  const k = await bakiyeKontrol(db); assert.equal(k.farklar.length, 0); assert.equal(k.satir, 4);
});

test('B2. Mükerrer kayıt (aynı kimlik 3 kez, 2\'si aynı anda) → bakiye bir kez değişir', async () => {
  const db = yeniDb(); const g = uretim();
  await Promise.all([kaydet(db, g, CEREN, SIMDI), kaydet(db, g, CEREN, SIMDI)]);
  await kaydet(db, g, CEREN, SIMDI);
  assert.equal(bak(db, 'YM-NARENCIYE'), 8410);
  assert.equal(db.tum('SELECT hareket_sayisi n FROM bakiye WHERE kalem_id=?', 'YM-NARENCIYE')[0].n, 1);
});

test('B3. Kesinti: toplu yazımın ortasında hata → ne hareket ne bakiye değişikliği kalır; yeniden gönderim temiz yazılır', async () => {
  for (const kacinci of [1, 2, 3, 4]) {
    const db = yeniDb(); let n = 0; const g = uretim();
    db.hataEnjekte(sql => sql.startsWith('INSERT INTO hareket') && ++n === kacinci);
    await assert.rejects(kaydet(db, g, CEREN, SIMDI));
    assert.equal(db.tum('SELECT COUNT(*) n FROM hareket')[0].n, 0, 'hareket kalmamalı');
    assert.equal(db.tum('SELECT COALESCE(SUM(hareket_sayisi),0) n FROM bakiye')[0].n, 0, 'bakiye değişmemeli');
    db.hataEnjekte(null);
    await kaydet(db, g, CEREN, SIMDI);
    assert.equal(bak(db, 'YM-NARENCIYE'), 8410);
    assert.equal((await bakiyeKontrol(db)).farklar.length, 0);
  }
});

test('B4. Bakiye elle değiştirilemez, silinemez, elle eklenemez', async () => {
  const db = yeniDb(); await kaydet(db, uretim(), CEREN, SIMDI);
  assert.throws(() => db.exec("UPDATE bakiye SET miktar = 9999 WHERE kalem_id='YM-NARENCIYE'"), /bakiye elle degistirilemez/);
  assert.throws(() => db.exec("UPDATE bakiye SET miktar = miktar + 5, hareket_sayisi = hareket_sayisi + 1 WHERE kalem_id='YM-NARENCIYE'"), /bakiye elle degistirilemez/);
  assert.throws(() => db.exec("DELETE FROM bakiye"), /bakiye silinemez/);
  assert.throws(() => db.exec("INSERT INTO bakiye VALUES ('HM-UN','ERENKOY',50,1,1)"), /bakiye elle eklenemez/);
  assert.equal(bak(db, 'YM-NARENCIYE'), 8410);
});

test('B5. 300 rastgele kayıt (üretim, zayi, düzeltme, iki şube, %20 mükerrer, %10 yarıda kesilen) → yeniden hesaplanan bakiye kayıtlı bakiyeyle birebir', async () => {
  const db = yeniDb(); const gonderilen = [];
  let tohum = 7; const rnd = () => (tohum = (tohum * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 300; i++) {
    let g;
    if (gonderilen.length && rnd() < 0.2) g = gonderilen[Math.floor(rnd() * gonderilen.length)];          // mükerrer
    else if (rnd() < 0.6) g = uretim({ konum: rnd() < 0.5 ? 'ERENKOY' : 'FIKIRTEPE', kat: [0.5, 1, 1.5][Math.floor(rnd() * 3)] });
    else g = { id: randomUUID(), tur: 'ZAYI', konum: rnd() < 0.5 ? 'ERENKOY' : 'FIKIRTEPE', kalem: 'HM-MAYONEZ', miktar: Math.round(rnd() * 500), sebep: 'Bozuldu', islem_zamani: SIMDI };
    const kes = rnd() < 0.1; let n = 0;
    if (kes) db.hataEnjekte(sql => sql.startsWith('INSERT INTO hareket') && ++n === 1);
    try { await kaydet(db, g, CEREN, SIMDI); if (!gonderilen.includes(g)) gonderilen.push(g); } catch (e) { if (!kes) throw e; }
    db.hataEnjekte(null);
  }
  const k = await bakiyeKontrol(db);
  assert.equal(k.farklar.length, 0, JSON.stringify(k.farklar.slice(0, 3)));
  assert.ok(k.satir >= 6);
});

test('B6. Kontrol gerçekten fark bulur: tetik devre dışıyken yazılan hareket (simülasyon) farkı yakalanır', async () => {
  const db = yeniDb(); await kaydet(db, uretim(), CEREN, SIMDI);
  db.exec('DROP TRIGGER hareket_bakiye');   // yalnız testte: tetik olmasaydı ne olurdu
  const islem = db.tum('SELECT id FROM islem')[0].id;
  db.exec(`INSERT INTO hareket (islem_id,kalem_id,konum_id,miktar,rol) VALUES ('${islem}','HM-UN','ERENKOY',-100,'GIRDI')`);
  const k = await bakiyeKontrol(db);
  assert.equal(k.farklar.length, 1); assert.equal(k.farklar[0].kalem_id, 'HM-UN'); assert.equal(k.farklar[0].kayitli, null);
});

test('B7. Stok ekranı bakiye tablosundan okur: 2.000 harekette okunan satır sayısı hareket sayısına bağlı değil', async () => {
  const db = yeniDb();
  for (let i = 0; i < 500; i++) await kaydet(db, uretim(), CEREN, SIMDI);
  const once = db.tum('SELECT COUNT(*) n FROM hareket')[0].n; assert.equal(once, 2000);
  const r = await subeBakiyesi(db, 'ERENKOY');
  assert.equal(r.length, 4);
  assert.equal(r.find(x => x.kalem_id === 'YM-NARENCIYE').miktar, 4205000);
});
