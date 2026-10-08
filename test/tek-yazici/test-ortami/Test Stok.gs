// TEST ORTAMI — stok projesi deneme kapısı (yalnız "BAP TEST Stok Tek Yazıcı" projesinde; canlıya ASLA kurulmaz)
// Bu projedeki bütün dosya kimlikleri derlemede TEST kopyalarına çevrilir ve denetlenir (build.mjs).
// Çağrı: <web app adresi>?anahtar=...&islem=<ad>&...  → JSON

// Anahtar depoda DEĞİL (depo herkese açık): TEST stok kopyasındaki Test_Ayar sekmesinin B1 hücresinde durur.
var TEST_KLASOR_ADI = 'BAP TEST — Tek Yazıcı Denemesi (canlı değil)';

function doGet(e) {
  var p = (e && e.parameter) || {};
  var ayar = ts_ss_().getSheetByName('Test_Ayar'), anahtar = ayar ? String(ayar.getRange('B1').getValue()) : '';
  if (anahtar.length < 20 || p.anahtar !== anahtar) return ts_json_({ hata: 'anahtar' });
  var t0 = Date.now();
  try {
    var f = TS_ISLEMLER[p.islem];
    if (!f) return ts_json_({ hata: 'bilinmeyen islem', islemler: Object.keys(TS_ISLEMLER) });
    var r = f(p);
    return ts_json_({ ok: true, ms: Date.now() - t0, sonuc: r });
  } catch (err) {
    return ts_json_({ ok: false, ms: Date.now() - t0, hata: String(err && err.stack || err) });
  }
}
function ts_json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function ts_ss_() { return SpreadsheetApp.openById(STOK_DOSYA_ID); }

/** Sahibin bir kez çalıştıracağı fonksiyon: Apps Script izin penceresini açar (dosya okuma/yazma, tetikleyici). */
function testYetkiVer() {
  var ss = ts_ss_();
  Logger.log('TEST stok dosyası: ' + ss.getName());
  ScriptApp.getProjectTriggers();
  return ss.getName();
}

var TS_ISLEMLER = {
  // ---- durum ----
  durum: function () {
    var ss = ts_ss_(), q = ss.getSheetByName(SK_SEKME), props = PropertiesService.getScriptProperties();
    var ozet = { dosya: ss.getName(), kuyrukSatir: q ? q.getLastRow() - 1 : 0, ilkAcik: props.getProperty('SK_ILK_ACIK'),
      kilitKacirma: props.getProperty('SK_KILIT_KACIRMA'), sonDurum: JSON.parse(props.getProperty('SK_DURUM') || 'null'),
      tetikler: ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }) };
    var u = ss.getSheetByName('Test_Uyarilar');
    ozet.uyarilar = u && u.getLastRow() > 1 ? u.getRange(Math.max(2, u.getLastRow() - 9), 1, Math.min(10, u.getLastRow() - 1), 3).getValues() : [];
    return ozet;
  },
  // ---- motorlar (gerçek kod, gerçek kilit) ----
  satis: function () { var t = Date.now(); stokMotoru(); return { calisti: true, ms: Date.now() - t }; },
  alis: function () { var t = Date.now(); var r = alisIsle(); return { sayac: r, ms: Date.now() - t }; },
  kuyruk: function (p) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(Number(p.bekle) || 5000)) {
      var props = PropertiesService.getScriptProperties();
      props.setProperty('SK_KILIT_KACIRMA', String((Number(props.getProperty('SK_KILIT_KACIRMA')) || 0) + 1));
      return { kilit: false, mesaj: 'Kilit alınamadı (başka çalışma sürüyor). Kayıtlar kuyrukta BEKLIYOR, kaybolmadı.' };
    }
    try {
      SK_TEST = p.kesinti ? { kesinti: p.kesinti } : null;
      try { var r = stokKuyruguIsle_(ts_ss_()); sk_uyarilar_(r); return { kilit: true, sonuc: r }; }
      catch (err) { return { kilit: true, kesildi: String(err) }; }
    } finally { SK_TEST = null; lock.releaseLock(); }
  },
  // Satış Motoru'nun uzun sürmesini taklit: kilidi N saniye tutar
  kilitTut: function (p) {
    var lock = LockService.getScriptLock(); var t = Date.now();
    if (!lock.tryLock(30000)) return { kilit: false };
    try { Utilities.sleep(Math.min(Number(p.sn) || 20, 60) * 1000); } finally { lock.releaseLock(); }
    return { kilit: true, tutulanMs: Date.now() - t };
  },
  tetikKur: function () {
    ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('stokKuyruguTetik').timeBased().everyMinutes(1).create();
    return ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  },
  tetikSil: function () { ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); }); return []; },
  // ---- sahte veri (yalnız TEST dosyalarına) ----
  siparisEkle: function (p) {
    var liste = JSON.parse(p.json);   // [{id, no, zaman:'2026-10-08T12:00:00+03:00', cikis, kapanis, tur:'paket'|'masa', odeme, sube, urunler:[..], adetler:[..], durum}]
    var sh = SpreadsheetApp.openById(SATIS_KAYNAK_ID).getSheetByName(SATIS_SEKME);
    var satirlar = liste.map(function (s) {
      var z = new Date(s.zaman);
      var tarih = function (x) { return x ? new Date(x) : ''; };
      return [s.id, s.no || '', z, tarih(s.cikis), tarih(s.kapanis), 'BAP ' + s.sube, s.sube, s.tur === 'masa' ? 'Masa Siparişi' : 'Paket Siparişi',
        'Test', 'BAP', s.odeme || 'Nakit', 'TEST', '', '', '',
        s.urunler.map(function () { return 'Pizza'; }).join('|'), s.urunler.join('|'), s.adetler.join('|'), s.urunler.map(function () { return 0; }).join('|'),
        0, '', '', '', s.durum || 'Kapandı', '', z.toISOString(), 'TEST'];
    });
    sh.getRange(sh.getLastRow() + 1, 1, satirlar.length, satirlar[0].length).setValues(satirlar);
    return { eklenen: satirlar.length };
  },
  siparisDurum: function (p) {   // ?id=..&durum=Kapandı&cikis=..&kapanis=..
    var sh = SpreadsheetApp.openById(SATIS_KAYNAK_ID).getSheetByName(SATIS_SEKME);
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < v.length; i++) if (String(v[i][0]) === p.id) {
      if (p.durum) sh.getRange(i + 2, 24).setValue(p.durum);
      if (p.cikis) sh.getRange(i + 2, 4).setValue(new Date(p.cikis));       // Hazırlanma (Şube Çıkış)
      if (p.kapanis) sh.getRange(i + 2, 5).setValue(new Date(p.kapanis));   // Teslim Zamanı
      return { satir: i + 2 };
    }
    return { bulunamadi: p.id };
  },
  faturaEkle: function (p) {
    var liste = JSON.parse(p.json);   // [{no, tarih, tedarikci, urun, adet, fiyat, sube}]
    var sh = SpreadsheetApp.openById(FATURA_SS_ID).getSheetByName(KALEM_SEKME);
    var satirlar = liste.map(function (f) { return [f.no, new Date(f.tarih), f.tedarikci, f.urun, f.adet, f.fiyat || 0, 0, 0, f.sube || '', 0, '', '', '']; });
    sh.getRange(sh.getLastRow() + 1, 1, satirlar.length, 13).setValues(satirlar);
    return { eklenen: satirlar.length };
  },
  // ---- okuma ----
  stok: function (p) {   // ?urunler=["Mayonez|HM|Erenköy", ...]
    var ss = ts_ss_(), st = ss.getSheetByName('Sube_Stok'), v = st.getRange(2, 1, st.getLastRow() - 1, 9).getValues();
    var istenen = JSON.parse(p.urunler || '[]').map(function (x) { var a = x.split('|'); return sk_anahtar_(a[0], a[1], a[2]); });
    var out = {};
    v.forEach(function (r) { var k = sk_anahtar_(r[0], r[1], r[2]); if (!istenen.length || istenen.indexOf(k) !== -1) out[r[0] + '|' + r[1] + '|' + r[2]] = [r[3], r[4], r[6]]; });
    return { satir: v.length, stok: istenen.length ? out : undefined };
  },
  kuyrukOku: function (p) {
    var q = ts_ss_().getSheetByName(SK_SEKME); if (!q || q.getLastRow() < 2) return [];
    var n = Math.min(Number(p.n) || 30, q.getLastRow() - 1);
    return q.getRange(q.getLastRow() - n + 1, 1, n, 14).getValues();
  },
  hareketOku: function (p) {   // ?n=40&urun=...
    var h = ts_ss_().getSheetByName('Stok_Hareketleri'), n = Math.min(Number(p.n) || 40, h.getLastRow() - 1);
    var v = h.getRange(h.getLastRow() - n + 1, 1, n, 10).getValues();
    if (p.urun) v = v.filter(function (r) { return sk_n_(r[2]) === sk_n_(p.urun); });
    return { sonSatir: h.getLastRow(), satirlar: v };
  },
  // Belirli bir satırdan sonraki hareketler için zincir ve kapsam kontrolü:
  //  - zincir: aynı ürün+şubede her hareketin Eski'si bir öncekinin Yeni'sine eşit mi (kopukluk = ezilme)
  //  - kapsam: baz anındaki stoktan bugüne değişim = hareketlerin toplamı mı; mutfak hareketleri KUYRUK izli mi
  denetle: function (p) {
    var ss = ts_ss_(), h = ss.getSheetByName('Stok_Hareketleri'), bas = Number(p.basSatir);
    var son = h.getLastRow(); if (son < bas) return { hareket: 0 };
    var v = h.getRange(bas, 1, son - bas + 1, 10).getValues();
    var baz = JSON.parse(PropertiesService.getScriptProperties().getProperty('TS_BAZ_' + p.baz) || '{}');
    var st = ss.getSheetByName('Sube_Stok').getRange(2, 1, ss.getSheetByName('Sube_Stok').getLastRow() - 1, 4).getValues();
    var simdi = {}; st.forEach(function (r) { simdi[sk_adSube_(r[0], r[2]) + '|' + String(r[1]).toUpperCase()] = Number(r[3]) || 0; });
    var son_ = {}, kopuk = [], toplam = {}, kuyruksuzMutfak = [];
    v.forEach(function (r, i) {
      var k = sk_adSube_(r[2], r[1]);
      if (k in son_ && Math.abs(Number(r[4]) - son_[k]) > 0.0005) kopuk.push({ satir: bas + i, urun: r[2], sube: r[1], tur: r[3], beklenenEski: son_[k], eski: r[4] });
      son_[k] = Number(r[5]);
      toplam[k] = (toplam[k] || 0) + (Number(r[5]) - Number(r[4]));
      var kaynak = String(r[9]);
      if (kaynak.indexOf('Otomatik') !== 0 && String(r[8]).indexOf('KUYRUK:') !== 0) kuyruksuzMutfak.push({ satir: bas + i, urun: r[2], tur: r[3], detay: String(r[8]).slice(0, 60) });
    });
    var fark = [];
    Object.keys(baz).forEach(function (kt) {
      var k = kt.split('|').slice(0, 2).join('|');
      if (!(k in toplam)) { if (Math.abs((simdi[kt] || 0) - baz[kt]) > 0.0005) fark.push({ anahtar: kt, baz: baz[kt], simdi: simdi[kt], hareket: 0 }); return; }
      var beklenen = Math.round((baz[kt] + toplam[k]) * 1000) / 1000;
      if (Math.abs(beklenen - (simdi[kt] || 0)) > 0.0005) fark.push({ anahtar: kt, baz: baz[kt], hareketToplami: toplam[k], beklenen: beklenen, simdi: simdi[kt] });
    });
    return { hareket: v.length, zincirKopuk: kopuk, kapsamFarki: fark, kuyruksuzMutfakYazimi: kuyruksuzMutfak };
  },
  // Baz al: belirli ürünlerin stoku + Stok_Hareketleri son satırı
  baz: function (p) {
    var ss = ts_ss_(), st = ss.getSheetByName('Sube_Stok').getRange(2, 1, ss.getSheetByName('Sube_Stok').getLastRow() - 1, 4).getValues();
    var istenen = JSON.parse(p.urunler || '[]').map(function (x) { var a = x.split('|'); return sk_adSube_(a[0], a[2]) + '|' + a[1].toUpperCase(); });
    var baz = {};
    st.forEach(function (r) { var k = sk_adSube_(r[0], r[2]) + '|' + String(r[1]).toUpperCase(); if (istenen.indexOf(k) !== -1) baz[k] = Number(r[3]) || 0; });
    PropertiesService.getScriptProperties().setProperty('TS_BAZ_' + p.ad, JSON.stringify(baz));
    return { baz: baz, hareketSonSatir: ss.getSheetByName('Stok_Hareketleri').getLastRow() };
  },
  // ---- yedekten dönüş (TEST stok dosyasına yazar; kaynak: yedek kopya, yalnız okunur) ----
  // Yöntem: Sube_Stok ve Stok_Hareketleri yedekteki hâline döner. Kuyruk (mutfak kayıtları) YEDEKTEN DÖNMEZ: yedekten sonra
  // işlenmiş kuyruk kayıtları BEKLIYOR'a alınır ve yeniden (bir kez) işlenir. Yedekten sonra düşülmüş satışların
  // işaretleri kaldırılır, Satış Motoru onları yeniden düşer. Böylece yedekten sonraki yeni kayıtlar kaybolmaz.
  yedektenDon: function (p) {
    var yedek = SpreadsheetApp.openById(p.yedek);
    if (yedek.getName().indexOf('TEST YEDEK') !== 0) throw new Error('Yedek dosyanın adı "TEST YEDEK" ile başlamalı');
    var yedekZamani = new Date(p.zaman).getTime();
    var ss = ts_ss_(), rapor = {};
    var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) throw new Error('kilit');
    try {
      // 1) Yedekten sonra düşülmüş satışlar: güncel Satis_Hareketleri'nde olup yedekte olmayan sipariş kimlikleri
      var idler = function (dosya) { var s = dosya.getSheetByName('Satis_Hareketleri'); var o = {}; if (s && s.getLastRow() > 1) s.getRange(2, 11, s.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0]) o[String(r[0])] = 1; }); return o; };
      var yedekteki = idler(yedek), simdiki = idler(ss), acilacak = Object.keys(simdiki).filter(function (id) { return !yedekteki[id]; });
      // 2) Sekmeleri yedekten geri yaz
      ['Sube_Stok', 'Stok_Hareketleri', 'Satis_Hareketleri'].forEach(function (ad) {
        var kaynak = yedek.getSheetByName(ad), hedef = ss.getSheetByName(ad);
        var v = kaynak.getDataRange().getValues();
        hedef.getRange(1, 1, Math.max(hedef.getLastRow(), 1), Math.max(hedef.getLastColumn(), 1)).clearContent();
        hedef.getRange(1, 1, v.length, v[0].length).setValues(v);
        rapor[ad] = v.length;
      });
      // 3) Satış işaretlerini kaldır
      var sh = SpreadsheetApp.openById(SATIS_KAYNAK_ID).getSheetByName(SATIS_SEKME), isaretKol = isaretKolonuHazirla(sh);
      var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues(), n = 0;
      ids.forEach(function (r, i) { if (acilacak.indexOf(String(r[0])) !== -1) { sh.getRange(i + 2, isaretKol).setValue(''); n++; } });
      rapor.yenidenDusulecekSiparis = n;
      // 4) Yedekten sonra işlenmiş kuyruk kayıtlarını yeniden işlenecek yap
      var q = ss.getSheetByName(SK_SEKME), qv = q.getRange(2, 1, q.getLastRow() - 1, 14).getValues(), m = 0;
      qv.forEach(function (r) {
        var t = r[SK_K.ISLENME] instanceof Date ? r[SK_K.ISLENME].getTime() : 0;
        if ((r[SK_K.DURUM] === 'ISLENDI' || r[SK_K.DURUM] === 'ISLENIYOR') && t > yedekZamani) { r[SK_K.DURUM] = 'BEKLIYOR'; r[SK_K.SONUC] = 'Yedekten dönüş: yeniden işlenecek'; m++; }
      });
      q.getRange(2, SK_K.DURUM + 1, qv.length, 3).setValues(qv.map(function (r) { return [r[SK_K.DURUM], r[SK_K.ISLENME], r[SK_K.SONUC]]; }));
      PropertiesService.getScriptProperties().setProperty('SK_ILK_ACIK', '2');
      rapor.yenidenIslenecekKuyruk = m;
      SpreadsheetApp.flush();
    } finally { lock.releaseLock(); }
    return rapor;
  },
  // Sahte kayıtların dosyadaki yeri (raporda göstermek için)
  dosyalar: function () {
    return { stok: STOK_DOSYA_ID, satis: SATIS_KAYNAK_ID, fatura: FATURA_SS_ID };
  }
};
