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
      getValue: () => { const v = (data[r - 1] || [])[c - 1]; return v === undefined ? '' : v; },
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
  const ekle = (id, tur, urun, tip, delta, mutlak, islem, giris, detay) => sh.Stok_Kuyrugu._data.push([id, giris || islem || T('12:00'), islem || T('12:00'), 'Erenköy', urun, tip, tur,
    delta == null ? '' : delta, mutlak == null ? '' : mutlak, detay || '', 'Ceren', 'BEKLIYOR', '', '']);
  const stok = ad => sh.Sube_Stok._data.find(r => r[0] === ad)[3];
  const satir = id => sh.Stok_Kuyrugu._data.find(r => r[0] === id);
  const izSayisi = id => sh.Stok_Hareketleri._data.filter(r => String(r[8]).indexOf('KUYRUK:' + id) === 0).length;
  const satis = secenek.satis || { tuketim: {}, bekleyen: {} };
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
// Satış senaryoları için yardımcı: sipariş, şube çıkışı, kapanış (Teslim Zamanı), tür (paket/masa/gelal/odenmez)
function satisKur(k, siparisler) {
  const s = k.satis; s.tuketim = {}; s.bekleyen = {};
  siparisler.forEach(o => {
    const z = k.ctx.sk_tuketimZamani_(T(o.siparis).getTime(), o.cikis ? T(o.cikis).getTime() : NaN, o.kapanis ? T(o.kapanis).getTime() : NaN, o.tur || 'paket');
    z.id = o.id; z.no = o.no || o.id;
    s.tuketim[o.id] = z;
    if (!o.islendi) (s.bekleyen['erenköy'] = s.bekleyen['erenköy'] || []).push(z);
  });
}
// Satış Motoru siparişi düştü: stok azalır, Satis_Hareketleri'ne sipariş satırı, Stok_Hareketleri'ne toplu satır
function motorDustu(k, id, miktar, saat) {
  const r = k.sh.Sube_Stok._data.find(x => x[0] === 'Mozzarella'); const eski = r[3]; r[3] = Math.round((eski - miktar) * 1000) / 1000;
  k.sh.Satis_Hareketleri._data.splice(1, 0, [T(saat), 'Erenköy', 'Mozzarella', 'HM', 'Satis', '', '', miktar, 'kg', '', id]);
  k.sh.Stok_Hareketleri._data.push([T(saat), 'Erenköy', 'Mozzarella', 'Satis', eski, r[3], '', '', 'motor', 'Otomatik (satış)']);
}
t('Tüketim kayıt zamanı: çıkış varsa TAM çıkış saati (−10 dk / pencere yok); masa/gel-al/ödenmez çıkışsızsa sipariş saati (kural); paket çıkışsızsa zaman YOK', () => {
  const f = (s, c, kp, tur) => k0.ctx.sk_tuketimZamani_(T(s).getTime(), c ? T(c).getTime() : NaN, kp ? T(kp).getTime() : NaN, tur);
  const k0 = kur();
  let r = f('11:00', '11:25', '11:50', 'paket'); assert.equal(r.nokta, T('11:25').getTime()); assert.equal(r.kaynak, 'cikis');
  r = f('09:00', '13:10', '', 'paket'); assert.equal(r.nokta, T('13:10').getTime());                  // ileri saatli
  r = f('11:00', '', '13:30', 'masa'); assert.equal(r.nokta, T('11:15').getTime()); assert.equal(r.kaynak, 'kural-masa');   // girişten 15 dk sonra; kapanış kullanılmaz
  r = f('11:00', '11:20', '', 'masa'); assert.equal(r.nokta, T('11:15').getTime());                                           // masada çıkış olsa da 15 dk kuralı
  r = f('11:00', '', '11:40', 'odenmez'); assert.equal(r.kaynak, 'kural-odenmez'); assert.equal(r.nokta, T('11:00').getTime());  // personel: hemen
  r = f('11:00', '11:25', '11:40', 'odenmez'); assert.equal(r.nokta, T('11:00').getTime());
  r = f('11:00', '', '11:40', 'gelal'); assert.equal(r.kaynak, 'kural-gelal');
  r = f('11:00', '', '11:40', 'paket'); assert.equal(r.kaynak, 'eksik'); assert.equal(r.nokta, null);        // sessizce atanmaz
  const b = k0.ctx.sk_bildirim_('Teorik: 3 · HAZIRDA:012, 15 · x'); assert.ok(b.cevap && b.hazirda['12'] && b.hazirda['15']);
  assert.ok(k0.ctx.sk_bildirim_('HAZIRDA:YOK').cevap); assert.equal(Object.keys(k0.ctx.sk_bildirim_('HAZIRDA:YOK').hazirda).length, 0);
  assert.equal(k0.ctx.sk_bildirim_('Teorik: 3').cevap, false);
});
t('Sayım: sayımdan önce çıkmış ama henüz düşülmemiş sipariş varsa BEKLER; düşülünce sonraki siparişin düşümü çıkarılır', () => {
  const k = kur();
  satisKur(k, [{ id: 'SP1', siparis: '10:40', cikis: '10:55' }, { id: 'SP2', siparis: '11:20', cikis: '11:35' }]);
  k.ekle('s:1', 'Sayim', 'Mozzarella', 'HM', null, 20, T('11:00'), T('11:02'), 'HAZIRDA:YOK');
  let s = k.isle(T('11:10')); assert.equal(s.bekleyenSayim, 1); assert.equal(k.stok('Mozzarella'), 40);
  motorDustu(k, 'SP1', 1.4, '11:40'); motorDustu(k, 'SP2', 0.7, '11:40');
  satisKur(k, [{ id: 'SP1', siparis: '10:40', cikis: '10:55', islendi: 1 }, { id: 'SP2', siparis: '11:20', cikis: '11:35', islendi: 1 }]);
  s = k.isle(T('11:45')); assert.equal(s.islenen, 1);
  assert.equal(k.stok('Mozzarella'), 19.3);   // 20 sayıldı − 0,7 (sayımdan sonra çıkan); önceki 1,4 tekrar düşülmedi
});
t('İleri saatli sipariş: 09:00\'da verilmiş, 13:10\'da çıkmış; 12:00 sayımından SONRA tüketilmiş sayılır', () => {
  const k = kur();
  satisKur(k, [{ id: 'IL1', siparis: '09:00', cikis: '13:10', islendi: 1 }]);
  motorDustu(k, 'IL1', 2, '13:20');
  k.ekle('s:1', 'Sayim', 'Mozzarella', 'HM', null, 30, T('12:00'), T('13:30'), 'HAZIRDA:YOK');
  k.isle(T('13:31')); assert.equal(k.stok('Mozzarella'), 28);
});
t('Geç kapanan sipariş: 10:50 çıkış, 13:00 kapanış; 12:00 sayımından ÖNCE tüketilmiş — kapanış (ödeme) zamanı kullanılmaz, ikinci kez düşülmez', () => {
  const k = kur();
  satisKur(k, [{ id: 'GK1', siparis: '10:30', cikis: '10:50', kapanis: '13:00' }]);
  k.ekle('s:1', 'Sayim', 'Mozzarella', 'HM', null, 30, T('12:00'), T('12:05'));
  let s = k.isle(T('12:10')); assert.equal(s.bekleyenSayim, 1);
  motorDustu(k, 'GK1', 1.5, '13:05');
  satisKur(k, [{ id: 'GK1', siparis: '10:30', cikis: '10:50', kapanis: '13:00', islendi: 1 }]);
  k.isle(T('13:10')); assert.equal(k.stok('Mozzarella'), 30);
});
t('Çıkış sayımdan 4 dk sonra (11:52 sipariş, 12:04 çıkış, 12:00 sayım), hazırda bildirilmedi → çıkışa göre SONRA; açık sipariş notta görünür', () => {
  const k = kur();
  satisKur(k, [{ id: 'B1', no: '41', siparis: '11:52', cikis: '12:04', islendi: 1 }]);
  motorDustu(k, 'B1', 0.3, '12:10');
  k.ekle('s:1', 'Sayim', 'Mozzarella', 'HM', null, 25, T('12:00'), T('12:15'));
  k.isle(T('12:16'));
  assert.equal(k.stok('Mozzarella'), 24.7);
  assert.ok(/Sayım anında 1 sipariş hazırlıkta\/çıkmamıştı \(0\.3\); hazırda olan bildirilmedi/.test(k.satir('s:1')[13]), k.satir('s:1')[13]);
});
t('Aynı sipariş HAZIRDA:41 bildirildi → sayımdan önce tüketilmiş sayılır; sayım motor düşene kadar BEKLER, çıkışta ikinci fark OLUŞMAZ', () => {
  const k = kur();
  satisKur(k, [{ id: 'B1', no: '41', siparis: '11:52', cikis: '12:04' }]);
  k.ekle('s:1', 'Sayim', 'Mozzarella', 'HM', null, 25, T('12:00'), T('12:01'), 'Teorik: 40 · HAZIRDA:41');
  let s = k.isle(T('12:02')); assert.equal(s.bekleyenSayim, 1); assert.ok(/no 41/.test(k.satir('s:1')[13]));
  motorDustu(k, 'B1', 0.3, '12:10');                         // çıkış + kapanış: motor düştü
  satisKur(k, [{ id: 'B1', no: '41', siparis: '11:52', cikis: '12:04', islendi: 1 }]);
  k.isle(T('12:11')); assert.equal(k.stok('Mozzarella'), 25);
  assert.ok(/1 hazırda bildirilen sipariş/.test(k.satir('s:1')[13]));
  k.isle(T('12:12')); assert.equal(k.stok('Mozzarella'), 25);   // tekrar çalışma bir şey değiştirmez
});
t('HAZIRDA:YOK cevabı → açık siparişler sonra sayılır, uyarı notu çıkmaz', () => {
  const k = kur();
  satisKur(k, [{ id: 'B1', no: '41', siparis: '11:52', cikis: '12:04', islendi: 1 }]);
  motorDustu(k, 'B1', 0.3, '12:10');
  k.ekle('s:1', 'Sayim', 'Mozzarella', 'HM', null, 25, T('12:00'), T('12:15'), 'HAZIRDA:YOK');
  k.isle(T('12:16')); assert.equal(k.stok('Mozzarella'), 24.7); assert.ok(!/bildirilmedi/.test(k.satir('s:1')[13]));
});
t('Çıkış saati EKSİK paket: sipariş sayımdan sonra → kesin sonra; sayımdan önce kapanmış → kesin önce (saat atanmaz)', () => {
  const k = kur();
  satisKur(k, [{ id: 'E1', siparis: '12:05', kapanis: '12:40', islendi: 1 }, { id: 'E2', siparis: '11:00', kapanis: '11:50', islendi: 1 }]);
  motorDustu(k, 'E2', 0.5, '11:50'); motorDustu(k, 'E1', 0.3, '12:40');
  k.ekle('s:1', 'Sayim', 'Mozzarella', 'HM', null, 25, T('12:00'), T('12:45'), 'HAZIRDA:YOK');
  k.isle(T('12:46')); assert.equal(k.stok('Mozzarella'), 24.7);
  assert.ok(/2 siparişte çıkış saati yok/.test(k.satir('s:1')[13]));
});
t('Çıkış saati EKSİK, sipariş sayımdan önce, kapanış sonra → önce BEKLER, sonra otomatik UYGULANMAZ (HATA + iki değer); elle SONRA:no yazılınca uygulanır', () => {
  const k = kur();
  satisKur(k, [{ id: 'E3', no: '77', siparis: '11:50', kapanis: '12:30' }]);
  k.ekle('s:1', 'Sayim', 'Mozzarella', 'HM', null, 25, T('12:00'), T('12:01'), 'HAZIRDA:YOK');
  assert.equal(k.isle(T('12:02')).bekleyenSayim, 1);
  motorDustu(k, 'E3', 0.3, '12:30');
  satisKur(k, [{ id: 'E3', no: '77', siparis: '11:50', kapanis: '12:30', islendi: 1 }]);
  const s = k.isle(T('12:31'));
  assert.equal(k.satir('s:1')[11], 'HATA'); assert.equal(k.stok('Mozzarella'), 39.7);    // stok dokunulmadı
  assert.ok(/no 77 \(0\.3\).*stok 25, sonra hazırlandıysa 24\.7/.test(k.satir('s:1')[13]), k.satir('s:1')[13]);
  assert.equal(s.hata.length, 1);
  k.ekle('z:1', 'Zayi', 'Mayonez', 'HM', -1, null, T('12:32')); k.isle(T('12:33'));       // kuyruk ilerledi, işaretçi HATA'nın ötesinde
  const r = k.satir('s:1'); r[9] = 'HAZIRDA:YOK · SONRA:77'; r[11] = 'BEKLIYOR';          // sahibin elle kararı
  k.isle(T('12:40')); assert.equal(k.satir('s:1')[11], 'ISLENDI'); assert.equal(k.stok('Mozzarella'), 24.7);
});
t('Masa: girişten 15 dk sonra tüketilmiş sayılır; sayım anında açık masa (ilave olabilir) notta listelenir', () => {
  const k = kur();
  satisKur(k, [{ id: 'M1', no: '12', siparis: '11:40', kapanis: '13:30', tur: 'masa', islendi: 1 },   // 11:55 → sayımdan önce, masa hâlâ açık
               { id: 'M2', no: '14', siparis: '11:50', kapanis: '12:30', tur: 'masa', islendi: 1 },   // 12:05 → sayımdan sonra
               { id: 'P1', no: '20', siparis: '11:59', tur: 'odenmez', islendi: 1 }]);               // personel: 11:59 → önce
  motorDustu(k, 'M1', 0.5, '13:35'); motorDustu(k, 'M2', 0.2, '13:35'); motorDustu(k, 'P1', 0.1, '12:30');
  k.ekle('s:1', 'Sayim', 'Mozzarella', 'HM', null, 25, T('12:00'), T('13:40'), 'HAZIRDA:YOK');
  k.isle(T('13:41'));
  assert.equal(k.stok('Mozzarella'), 24.8);   // yalnız M2 sonra
  const not = k.satir('s:1')[13];
  assert.ok(/açık masa: no 12 \(0\.5\)/.test(not), not);
  assert.ok(/2 masa\/gel-al\/personel/.test(not), not);
});
t('Hazırlanıp çıkmadan iptal: sipariş düşülmez ama mutfağın zayi kaydı tüketimi korur; sayımdan önceki zayi sayımı değiştirmez', () => {
  const k = kur();
  satisKur(k, []);   // iptal sipariş bekleyen listesine girmez (sayımı bekletmez)
  k.ekle('i:1', 'Zayi', 'Mozzarella', 'HM', -0.4, null, T('11:40'), T('11:45'), 'İptal (hazırlanmıştı) · sipariş no 55');
  k.isle(T('11:46')); assert.equal(k.stok('Mozzarella'), 39.6);
  k.ekle('s:1', 'Sayim', 'Mozzarella', 'HM', null, 30, T('12:00'), T('12:01'), 'HAZIRDA:YOK');
  k.isle(T('12:02')); assert.equal(k.stok('Mozzarella'), 30);
});
t('Satış dosyası okuma: başlık adıyla; aynı sipariş ID iki satırda (biri iptal) → iptal satır çıkış saatini EZMEZ; masa/ödenmez türü tanınır', () => {
  const k = kur();
  const bas = ['Sipariş ID', 'Sipariş No (Gün İçi Sıra)', 'Sipariş Tarihi', 'Hazırlanma (Şube Çıkış)', 'Teslim Zamanı', 'Şube', 'Ürün Çıkan Şube', 'Masa Siparişi', 'Kanal', 'Marka', 'Ödeme Yöntemi', 'Durum', 'Motor_Islendi'];
  const satirlar = [bas,
    ['S2', '9002', T('11:50'), T('12:05'), T('12:10'), 'BAP Fikirtepe', 'Fikirtepe', 'Paket Siparişi', '', '', 'Nakit', 'Kapandı', ''],
    ['S2', '9002', T('11:50'), '', '', 'BAP Fikirtepe', 'Fikirtepe', 'Paket Siparişi', '', '', 'Nakit', 'İptal', ''],
    ['M1', '0012', T('11:00'), '', T('13:00'), '', 'Fikirtepe', 'Masa Siparişi', '', '', 'Kredi Kartı', 'Açık', ''],
    ['P1', '0013', T('11:10'), '', T('11:30'), 'BAP Erenköy', 'Erenköy', 'Paket Siparişi', '', '', 'Ödenmez', 'Kapandı', '✓']];
  const sh = { getLastRow: () => satirlar.length, getLastColumn: () => bas.length,
    getRange: (r, c, nr = 1, nc = 1) => ({ getValues: () => satirlar.slice(r - 1, r - 1 + nr).map(x => x.slice(c - 1, c - 1 + nc)) }) };
  const sade = x => String(x || '').replace(/[İIı]/g, 'i').replace(/[Ğğ]/g, 'g').replace(/[Üü]/g, 'u').replace(/[Şş]/g, 's').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c').toLowerCase().replace(/[\s._\-]/g, '');
  Object.assign(k.ctx, { kaynakSayfa: () => sh, sade, ISARET_BASLIK: 'Motor_Islendi', baslangicTarihi: () => T('00:00'),
    sm_islendiMi: v => v === '✓', subeCoz: v => String(v).replace('BAP ', '') });
  const b = k.ctx.sk_satisBilgisi_();
  assert.equal(b.tuketim.S2.kaynak, 'cikis'); assert.equal(b.tuketim.S2.nokta, T('12:05').getTime()); assert.equal(b.tuketim.S2.no, '9002');
  assert.equal(b.tuketim.M1.kaynak, 'kural-masa'); assert.equal(b.tuketim.M1.no, '12');
  assert.equal(b.tuketim.P1.kaynak, 'kural-odenmez');
  assert.equal(b.bekleyen['fikirtepe'].length, 2);   // S2 (kapalı, düşülmemiş) + M1 (açık); iptal satır ve işlenmiş P1 yok
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
