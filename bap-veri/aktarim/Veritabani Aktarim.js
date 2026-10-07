// VERİTABANI → SHEETS AKTARIMI (Faz 1 taslağı; Apps Script'e "stok-takip-sistemi" projesine taşınacak)
// Neden o proje: Satış Motoru ve Alış Motoru da Sube_Stok'a orada, AYNI ScriptLock ile yazıyor. Aktarım da bu kilidi
// alınca üçü sırayla çalışır; birbirinin stok yazımını ezemez (bugünkü panel ↔ motor çakışması bu yolla kapanır).
//
// Kurallar:
//  - Her veritabanı işlemi Sheets'e bir kez işlenir. İşaret tablosu: Veritabani_Aktarim (Sira | Islem_ID | Tur | Durum | Zaman).
//  - Bir işlem için önce "BASLADI" işareti yazılır, sonra veri, en son "TAMAM". Yeniden çalışınca TAMAM olan atlanır.
//    BASLADI'da kalan (yarım) işlem OTOMATİK TEKRARLANMAZ: aktarım durur ve uyarı verir (çift stok hareketi olmasın).
//  - Sayım "sayıldığı ana" göre uygulanır: sayımdan sonra Sheets'e yazılmış hareketler (satış vb.) sayılan miktarın üstüne eklenir.
//  - Veritabanına "şuraya kadar işledim" onayı ancak işaretler TAMAM olduktan sonra gönderilir.

var AKT_SEKME = 'Veritabani_Aktarim';
var AKT_SUBE_AD = { ERENKOY: 'Erenköy', FIKIRTEPE: 'Fikirtepe', MERKEZ: 'Merkez' };

function akt_aktar(ss, baglanti, simdi) {
  simdi = simdi || new Date();
  var isaret = akt_isaretSekmesi_(ss);
  var durum = akt_isaretOku_(isaret);
  var yarim = Object.keys(durum.byId).filter(function (id) { return durum.byId[id] === 'BASLADI'; });
  if (yarim.length) return { durum: 'DURDU_YARIM', yarim: yarim, mesaj: 'Yarım kalmış aktarım var, elle kontrol gerekli' };

  var liste = baglanti.liste(durum.sonSira);
  var islenen = 0, sonTamam = durum.sonSira;
  for (var i = 0; i < liste.length; i++) {
    var is = liste[i];
    if (durum.byId[is.id] === 'TAMAM') { sonTamam = Math.max(sonTamam, is.sira); continue; }
    var isaretSatir = isaret.getLastRow() + 1;
    isaret.getRange(isaretSatir, 1, 1, 5).setValues([[is.sira, is.id, is.tur, 'BASLADI', simdi]]);
    akt_islemiUygula_(ss, is, simdi);
    isaret.getRange(isaretSatir, 4).setValue('TAMAM');
    sonTamam = is.sira;
    islenen++;
  }
  if (liste.length) baglanti.onay(sonTamam);
  return { durum: 'TAMAM', islenen: islenen, sonSira: sonTamam };
}

function akt_isaretSekmesi_(ss) {
  var sh = ss.getSheetByName(AKT_SEKME);
  if (!sh) { sh = ss.insertSheet(AKT_SEKME); sh.appendRow(['Sira', 'Islem_ID', 'Tur', 'Durum', 'Zaman']); }
  return sh;
}

function akt_isaretOku_(sh) {
  var son = sh.getLastRow(), byId = {}, sonSira = 0;
  if (son > 1) sh.getRange(2, 1, son - 1, 4).getValues().forEach(function (r) {
    byId[r[1]] = r[3];
    if (r[3] === 'TAMAM') sonSira = Math.max(sonSira, Number(r[0]) || 0);
  });
  return { byId: byId, sonSira: sonSira };
}

function akt_islemiUygula_(ss, is, simdi) {
  var sube = AKT_SUBE_AD[is.konum_id] || is.konum_id;
  var stok = ss.getSheetByName('Sube_Stok');
  var harSh = ss.getSheetByName('Stok_Hareketleri');
  var hareketSatirlari = [];

  if (is.tur === 'SAYIM') {
    is.sayimlar.forEach(function (s) {
      var r = akt_stokSatiri_(stok, s.kaynak_satir_ad, s.tip, sube);
      var su = stok.getRange(r, 4, 1, 2).getValues()[0];
      var eski = Number(su[0]) || 0;
      // Sayımdan SONRA Sheets'e yazılmış hareketler (satış düşümü, alış...) sayılanın üstüne eklenir.
      var sonra = akt_sonrakiHareketler_(harSh, s.kaynak_satir_ad, sube, is.islem_zamani);
      var yeni = Math.round((Number(s.sayilan) + sonra) * 1000) / 1000;
      stok.getRange(r, 4, 1, 6).setValues([[yeni, yeni, s.sayilan, simdi, Math.round((yeni - eski) * 1000) / 1000, simdi]]);
      hareketSatirlari.push([simdi, sube, s.kaynak_satir_ad, 'Sayim', eski, yeni, '', '', 'DB:' + is.id + ' · sayım anı ' + is.islem_zamani + ' · sonraki hareket ' + sonra, is.kullanici]);
    });
    var sayimSh = ss.getSheetByName('Sayim_Girisleri');
    is.sayimlar.forEach(function (s) {
      sayimSh.appendRow([is.isletme_gunu, sube, s.kaynak_satir_ad, s.tip === 'YM' ? 'Yari Mamul' : s.tip, s.sayilan, '', '', is.kullanici, 'DB:' + is.id]);
    });
  } else {
    is.hareketler.forEach(function (h) {
      var r = akt_stokSatiri_(stok, h.kaynak_satir_ad, h.tip, sube);
      var su = stok.getRange(r, 4, 1, 2).getValues()[0];      // kilit altında, yazmadan hemen önce okunur
      var eski = Number(su[0]) || 0, yeni = Math.round((eski + h.miktar) * 1000) / 1000;
      var yeniT = Math.round(((Number(su[1]) || 0) + h.miktar) * 1000) / 1000;
      stok.getRange(r, 4, 1, 2).setValues([[yeni, yeniT]]);
      stok.getRange(r, 9).setValue(simdi);
      var tur = is.tur === 'URETIM' ? 'Uretim' : is.tur === 'ZAYI' ? 'Zayi' : 'Duzeltme';
      hareketSatirlari.push([simdi, sube, h.kaynak_satir_ad, tur, eski, yeni, '', '', 'DB:' + is.id + (is.sebep ? ' · ' + is.sebep : ''), is.kullanici]);
    });
    if (is.tur === 'URETIM' && is.parti) {
      var cikti = is.hareketler.filter(function (h) { return h.rol === 'CIKTI'; })[0];
      ss.getSheetByName('Uretim_Girisleri').appendRow([is.isletme_gunu, sube, cikti ? cikti.kaynak_satir_ad : '', is.parti.kat,
        is.parti.gercek, '', is.parti.gercek, is.kullanici, is.aciklama || '', simdi, 'DB:' + is.id]);
    }
    if (is.tur === 'ZAYI') {
      var h0 = is.hareketler[0];
      ss.getSheetByName('Zayi_Girisleri').appendRow([is.isletme_gunu, sube, h0.tip, h0.kaynak_satir_ad, -h0.miktar, '', is.sebep || '', '', is.aciklama || '', is.kullanici, simdi, 'DB:' + is.id]);
    }
  }
  if (hareketSatirlari.length) harSh.getRange(harSh.getLastRow() + 1, 1, hareketSatirlari.length, 10).setValues(hareketSatirlari);
}

function akt_stokSatiri_(sh, ad, tip, sube) {
  var son = sh.getLastRow();
  var v = son > 1 ? sh.getRange(2, 1, son - 1, 3).getValues() : [];
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]).trim() === ad && String(v[i][1]).toUpperCase() === tip && String(v[i][2]) === sube) return i + 2;
  }
  sh.appendRow([ad, tip, sube, 0, 0, '', '', 0, new Date()]);
  return sh.getLastRow();
}

// Sayım anından sonra Stok_Hareketleri'ne yazılmış, aynı kalem+şube hareketlerinin toplamı (Yeni − Eski).
// Yalnız son 3000 satıra bakar (sayım en geç bir aktarım turu önce yapılmıştır).
function akt_sonrakiHareketler_(sh, ad, sube, zamanIso) {
  var son = sh.getLastRow(); if (son < 2) return 0;
  var bas = Math.max(2, son - 2999);
  var v = sh.getRange(bas, 1, son - bas + 1, 6).getValues();
  var t = Date.parse(zamanIso), top = 0;
  v.forEach(function (r) {
    var z = r[0] instanceof Date ? r[0].getTime() : Date.parse(r[0]);
    if (z > t && r[2] === ad && r[1] === sube && r[3] !== 'Sayim') top += (Number(r[5]) || 0) - (Number(r[4]) || 0);
  });
  return Math.round(top * 1000) / 1000;
}

if (typeof module !== 'undefined') module.exports = { akt_aktar: akt_aktar };
