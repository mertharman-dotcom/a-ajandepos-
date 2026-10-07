// Kuyruk işleyicisinin (oneri/Stok Kuyrugu.gs v2) hata durumları — sahte tablolarla, saniyeler içinde.
// Çalıştır: node test/tek-yazici/yerel/kuyruk-test.js
const assert = require('assert'); const fs = require('fs'); const vm = require('vm'); const path = require('path');
const KOD = path.join(__dirname, '../oneri/Stok Kuyrugu.gs');

function sheet(ad, satirlar, hata) {
  const data = satirlar.map(r => r.slice());
  const pad = (r, c) => { while (data.length < r) data.push([]); const row = data[r - 1]; while (row.length < c) row.push(''); };
  const k = (op) => { if (hata.f && hata.f(ad, op)) throw new Error('ENJEKTE ' + ad + ' ' + op); };
  return { _data: data, getLastRow: () => data.length,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (data[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
      setValues: vs => { k('setValues'); vs.forEach((row, i) => row.forEach((v, j) => { pad(r + i, c + j); data[r - 1 + i][c - 1 + j] = v; })); },
      setValue: v => { k('setValue'); pad(r, c); data[r - 1][c - 1] = v; } }) };
}
const T = s => new Date('2026-10-08T' + s + ':00+03:00');
function kur(secenek = {}) {
  const hata = { f: null }, props = {}, uyarilar = [];
  const sh = {
    Sube_Stok: sheet('Sube_Stok', [['Urun_Adi', 'Tip', 'Sube', 'Mevcut', 'Teorik', 'Son_Sayim', 'Son_Sayim_Tarihi', 'Fark', 'Son_Guncelleme'],
      ['Mayonez', 'HM', 'Erenköy', 20, 20, '', '', 0, ''], ['Narenciye Sos', 'YM', 'Erenköy', 500, 500, '', '', 0, ''],
      ['Mozzarella', 'HM', 'Erenköy', 40, 40, '', '', 0, '']], hata),
    Stok_Hareketleri: sheet('Stok_Hareketleri', [['Tarih', 'Sube', 'Malzeme', 'Tur', 'Eski', 'Yeni', 'B', 'K', 'Detay', 'S']], hata),
    Satis_Hareketleri: sheet('Satis_Hareketleri', [['Tarih', 'Sube', 'Malzeme', 'Tip', 'Hareket', 'Eski', 'Yeni', 'Dusulen', 'Birim', 'Detay', 'Siparis_ID']], hata),
    Stok_Kuyrugu: sheet('Stok_Kuyrugu', [['Kuyruk_ID', 'Giris', 'Islem', 'Sube', 'Urun', 'Tip', 'Tur', 'Delta', 'Mutlak', 'Detay', 'Sorumlu', 'Durum', 'Islenme', 'Sonuc']], hata),
  };
  const ss = { getSheetByName: a => sh[a] || null };
  let uuid = 0;
  const ctx = { console, Date, Math, Number, String, Object, Array, JSON, RegExp, isNaN, Error,
    SpreadsheetApp: { flush() {} }, Utilities: { getUuid: () => 'batch' + (++uuid) + '-xxxx' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    sk_uyariGonder_: (konu, metin) => uyarilar.push(konu + ': ' + metin) };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(KOD, 'utf8'), ctx);
  const ekle = (id, tur, urun, tip, delta, mutlak, islem, giris) => sh.Stok_Kuyrugu._data.push([id, giris || islem || T('12:00'), islem || T('12:00'), 'Erenköy', urun, tip, tur,
    delta == null ? '' : delta, mutlak == null ? '' : mutlak, '', 'Ceren', 'BEKLIYOR', '', '']);
  const stok = ad => sh.Sube_Stok._data.find(r => r[0] === ad)[3];
  const satir = id => sh.Stok_Kuyrugu._data.find(r => r[0] === id);
  const izSayisi = id => sh.Stok_Hareketleri._data.filter(r => String(r[8]).indexOf('KUYRUK:' + id) === 0).length;
  const satis = secenek.satis || { zaman: {}, bekleyenEnEski: {} };
  const isle = (simdi, kesinti) => { ctx.SK_TEST = kesinti ? { kesinti } : null; try { return ctx.stokKuyruguIsle_(ss, { simdi: simdi || T('12:05'), satis }); } finally { ctx.SK_TEST = null; } };
  return { ss, sh, hata, ekle, stok, satir, izSayisi, isle, props, uyarilar, ctx, satis };
}
let n = 0; const t = (ad, f) => { f(); n++; console.log('✓ ' + ad); };

t('Normal: üç kayıt bir kez uygulanır; ikinci çalışma hiçbir şey değiştirmez', () => {
  const k = kur(); k.ekle('a:1', 'Uretim', 'Mayonez', 'HM', -2); k.ekle('a:2', 'Uretim', 'Narenciye Sos', 'YM', 8410); k.ekle('b:1', 'Zayi', 'Mayonez', 'HM', -1);
  assert.equal(k.isle().islenen, 3); assert.equal(k.stok('Mayonez'), 17); assert.equal(k.stok('Narenciye Sos'), 8910);
  assert.equal(k.sh.Stok_Hareketleri._data.length, 4);
  assert.equal(k.isle().islenen, 0); assert.equal(k.stok('Mayonez'), 17); assert.equal(k.sh.Stok_Hareketleri._data.length, 4);
  assert.equal(k.satir('a:1')[11], 'ISLENDI'); assert.equal(k.props.SK_ILK_ACIK, '5');
});
for (const nokta of ['plan', 'yeniSatir', 'stok', 'iz']) {
  t(`Kesinti "${nokta}": sonraki çalışma kendini tamamlar, stok etkisi TAM BİR KEZ, iz tam bir kez`, () => {
    const k = kur(); k.ekle('a:1', 'Uretim', 'Mayonez', 'HM', -2); k.ekle('a:2', 'Uretim', 'Kaşar', 'HM', 5);   // Kaşar: yeni satır açar
    assert.throws(() => k.isle(T('12:05'), nokta), /TEST KESİNTİSİ/);
    assert.equal(k.satir('a:1')[11], 'ISLENIYOR');
    const s = k.isle(T('12:06'));
    assert.equal(k.stok('Mayonez'), 18); assert.equal(k.stok('Kaşar'), 5);
    assert.equal(k.izSayisi('a:1'), 1); assert.equal(k.izSayisi('a:2'), 1);
    assert.equal(k.satir('a:1')[11], 'ISLENDI'); assert.equal(k.satir('a:2')[11], 'ISLENDI');
    assert.equal(s.hata.length, 0);
    k.isle(T('12:07')); assert.equal(k.stok('Mayonez'), 18); assert.equal(k.sh.Sube_Stok._data.filter(r => r[0] === 'Kaşar').length, 1);
  });
}
t('Yarım kayıt elle değiştirilmişse (stok ne eski ne yeni) → HATA, otomatik tekrar YOK, uyarı gider', () => {
  const k = kur(); k.ekle('a:1', 'Uretim', 'Mayonez', 'HM', -2);
  assert.throws(() => k.isle(T('12:05'), 'plan'));
  k.sh.Sube_Stok._data[1][3] = 99;   // biri elle değiştirdi
  const s = k.isle(T('12:06')); assert.equal(k.satir('a:1')[11], 'HATA'); assert.equal(k.stok('Mayonez'), 99);
  k.ctx.sk_uyarilar_(s); assert.ok(k.uyarilar.some(u => u.indexOf('Stok kuyruğu: hata') === 0));
});
t('Sayım: sayımdan önce verilmiş sipariş henüz düşülmediyse BEKLER; düşülünce sayımdan sonraki siparişlerin düşümü çıkarılarak uygulanır', () => {
  const satis = { zaman: { SP1: T('10:50').getTime(), SP2: T('11:30').getTime() }, bekleyenEnEski: { 'erenköy': T('10:50').getTime() } };
  const k = kur({ satis });
  k.ekle('s:1', 'Sayim', 'Mozzarella', 'HM', null, 20, T('11:00'), T('11:02'));
  let s = k.isle(T('11:10')); assert.equal(s.bekleyenSayim, 1); assert.equal(k.stok('Mozzarella'), 40); assert.equal(k.satir('s:1')[11], 'BEKLIYOR');
  // Satış Motoru iki siparişi düştü: SP1 (10:50, sayımdan önce) 1,4 kg, SP2 (11:30, sayımdan sonra) 0,7 kg
  k.sh.Sube_Stok._data[3][3] = 37.9;
  k.sh.Satis_Hareketleri._data.splice(1, 0, [T('11:35'), 'Erenköy', 'Mozzarella', 'HM', 'Satis', '', '', 0.7, 'kg', '', 'SP2'], [T('11:35'), 'Erenköy', 'Mozzarella', 'HM', 'Satis', '', '', 1.4, 'kg', '', 'SP1']);
  k.sh.Stok_Hareketleri._data.push([T('11:35'), 'Erenköy', 'Mozzarella', 'Satis', 40, 37.9, '', '', 'motor', 'Otomatik (satış)']);
  satis.bekleyenEnEski = {};
  s = k.isle(T('11:40')); assert.equal(s.islenen, 1);
  assert.equal(k.stok('Mozzarella'), 19.3);   // 20 sayıldı − 0,7 (sayımdan sonraki sipariş); sayımdan önceki 1,4 tekrar düşülmedi
});
t('Sayım: sayımdan sonra işlenen üretim/zayi (olay zamanına göre) sayılanın üstüne eklenir; önceki eklenmez', () => {
  const k = kur();
  k.sh.Stok_Hareketleri._data.push([T('10:30'), 'Erenköy', 'Narenciye Sos', 'Uretim', 0, 500, '', '', 'eski', 'x']);   // sayımdan önce
  k.ekle('u:1', 'Uretim', 'Narenciye Sos', 'YM', 300, null, T('11:20'));   // sayımdan sonra olmuş, önce işlenecek
  k.isle(T('11:21')); assert.equal(k.stok('Narenciye Sos'), 800);
  k.ekle('s:1', 'Sayim', 'Narenciye Sos', 'YM', null, 450, T('11:00'), T('11:25'));   // 11:00'de sayılmış, 11:25'te girilmiş
  k.isle(T('11:26')); assert.equal(k.stok('Narenciye Sos'), 750);   // 450 + 300
});
t('Geriye tarihli kayıt sayımdan önceye aitse stok DEĞİŞMEZ (sayım onu içeriyor); sonraya aitse uygulanır', () => {
  const k = kur();
  k.ekle('s:1', 'Sayim', 'Mayonez', 'HM', null, 15, T('11:00')); k.isle(T('11:01')); assert.equal(k.stok('Mayonez'), 15);
  k.ekle('g:1', 'Zayi', 'Mayonez', 'HM', -3, null, T('09:00'), T('11:30'));   // 09:00'daki zayi 11:30'da girildi
  k.ekle('g2:1', 'Zayi', 'Mayonez', 'HM', -1, null, T('11:20'), T('11:30'));
  k.isle(T('11:31')); assert.equal(k.stok('Mayonez'), 14);
  assert.ok(/sayım bunu zaten içeriyor/.test(k.satir('g:1')[13]));
  const iz = k.sh.Stok_Hareketleri._data.find(r => String(r[8]).indexOf('KUYRUK:g:1') === 0);
  assert.equal(iz[0].getTime(), T('09:00').getTime()); assert.ok(/giriş/.test(iz[8]));   // tarih = olay anı, giriş ayrı
});
t('Daha yeni sayım varken gelen eski sayım yalnız geçmişe yazılır', () => {
  const k = kur();
  k.ekle('s:2', 'Sayim', 'Mayonez', 'HM', null, 12, T('11:00')); k.isle(T('11:01'));
  k.ekle('s:1', 'Sayim', 'Mayonez', 'HM', null, 30, T('10:00'), T('11:10')); k.isle(T('11:11'));
  assert.equal(k.stok('Mayonez'), 12); assert.ok(/Daha yeni sayım/.test(k.satir('s:1')[13]));
});
t('Biriken kayıt: 700 kayıt 300\'lük parçalarla işlenir, bir isteğin satırları bölünmez, hiçbiri kaybolmaz', () => {
  const k = kur();
  for (let i = 0; i < 350; i++) { k.ekle('r' + i + ':1', 'Zayi', 'Mayonez', 'HM', -0.01); k.ekle('r' + i + ':2', 'Uretim', 'Narenciye Sos', 'YM', 1); }
  const a = k.isle(T('12:05')); assert.equal(a.islenen, 300);
  assert.equal(k.satir('r149:2')[11], 'ISLENDI'); assert.equal(k.satir('r150:1')[11], 'BEKLIYOR');
  const b = k.isle(T('12:06')); const c = k.isle(T('12:07'));
  assert.equal(b.islenen + c.islenen, 400); assert.equal(k.stok('Mayonez'), 16.5); assert.equal(k.stok('Narenciye Sos'), 850);
});
t('Gecikme uyarısı: 10 dakikadan uzun bekleyen kayıt varsa saatte bir uyarı', () => {
  const k = kur(); k.ekle('a:1', 'Uretim', 'Mayonez', 'HM', -2, null, T('11:00'));
  k.ctx.SK_AZAMI = 0;   // işleyici durmuş gibi
  const s = k.isle(T('11:30')); assert.equal(s.enEskiBekleyenDk, 30);
  k.ctx.sk_uyarilar_(s); k.ctx.sk_uyarilar_(s);
  assert.equal(k.uyarilar.filter(u => u.indexOf('Stok kuyruğu: gecikme') === 0).length, 1);
});
t('HATA satırı kuyruğu tıkamaz: sonraki kayıtlar işlenir, işaretçi ilerler', () => {
  const k = kur(); k.ekle('a:1', 'Uretim', 'Mayonez', 'HM', -2);
  assert.throws(() => k.isle(T('12:05'), 'plan')); k.sh.Sube_Stok._data[1][3] = 99; k.isle(T('12:06'));
  k.ekle('b:1', 'Zayi', 'Narenciye Sos', 'YM', -10); k.isle(T('12:07'));
  assert.equal(k.stok('Narenciye Sos'), 490); assert.equal(k.props.SK_ILK_ACIK, '4');
});
console.log(n + ' kuyruk testi geçti');
