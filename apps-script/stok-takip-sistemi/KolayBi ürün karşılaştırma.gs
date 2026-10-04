/**
 * BAP Stok Takip Sistemi — Fatura Eksik Ürün Yönlendirici
 * Eski "eksikUrunler" dosyasının TAMAMINI silip bunu yapıştır.
 *
 * NE YAPAR
 *  KolayBi faturalarındaki ürünleri mevcut tablolarla karşılaştırır,
 *  hiçbir tabloda olmayanları "Fatura_Eksik_Urunler" sekmesine yazar.
 *
 * NOT SÜTUNU (J) — ne yazarsan oraya gider:
 *   Ev            → Fatura_Ev_Alimlari sekmesine taşınır
 *   Demirbaş      → Fatura_Demirbas sekmesine taşınır
 *   Hammadde      → Tbl_Hammaddeler tablosuna SATIR olarak eklenir
 *   Ambalaj       → Ambalaj_Hammadde tablosuna eklenir
 *   Direkt        → Direktsatisurunler tablosuna eklenir
 *   Yok say       → listeden tamamen düşer, bir daha sorulmaz
 *
 * Tabloya eklenen ürünlerde C sütunu (içeride kullanılan kısa ad) BOŞ gelir,
 * çalıştırma sonunda hangilerini doldurman gerektiği bildirilir.
 */

var HAM_DOSYA_ID = '1JJ6UZzh8rSX1FE9Cr-UPzEAaE-2aKtM10bEvjAv2P5w'; // Kolaybi Fatura Ham Veri
var HAM_SEKME = '';
var EKSIK_SEKME = 'Fatura_Eksik_Urunler';
var EV_SEKME = 'Fatura_Ev_Alimlari';
var DEMIRBAS_SEKME = 'Fatura_Demirbas';
var TED_BASLIK = 'Tedarikçi Adı';
var HARIC_TEDARIKCI = [];

// Not → hedef tablo eşleşmesi
var HEDEF_TABLO = {
  HAMMADDE: 'Tbl_Hammaddeler',
  AMBALAJ:  'Ambalaj_Hammadde',
  DIREKT:   'Direktsatisurunler'
};

function eksikUrunler() {
  var ss = SpreadsheetApp.getActive();

  /* ---------- Ham fatura verisi ---------- */
  var hamSS = SpreadsheetApp.openById(HAM_DOSYA_ID);
  var ham = HAM_SEKME ? hamSS.getSheetByName(HAM_SEKME) : hamSS.getSheets()[0];
  var data = ham.getDataRange().getValues();
  var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var iNo = h.indexOf('fatura_no'), iTarih = h.indexOf('tarih'), iGon = h.indexOf('gönderen'),
      iTutar = h.indexOf('tutar'), iIcerik = 4;
  h.forEach(function (x, i) { if (x.indexOf('fatura_i') === 0 && x.indexOf('eri') > 0) iIcerik = i; });

  // Ticari ünvan -> kısa tedarikçi adı
  var tedMap = {};
  (function () {
    var sh = ss.getSheetByName('Tedarikçi Sevkiyat günleri');
    if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (r[1]) tedMap[norm(r[1])] = String(r[0]).trim();
    });
  })();

  /* ---------- Mevcut ürün adları (sadece ilgili sütun okunur) ---------- */
    // Mevcut ürün adları — SADECE üç ürün tablosu taranır
  var mevcut = {};
  ['Tbl_Hammaddeler', 'Ambalaj_Hammadde', 'Direktsatisurunler'].forEach(function (ad) {
    var sh = ss.getSheetByName(ad);
    if (!sh) { Logger.log('Sekme yok: ' + ad); return; }
    var sonSatir = sh.getLastRow();
    if (sonSatir < 2) return;
    sh.getRange(2, 2, sonSatir - 1, 1).getValues().forEach(function (r) {   // B sütunu
      var k = norm(r[0]);
      if (k) mevcut[k] = ad;
    });
  });
  Logger.log('Mevcut ürün adı: ' + Object.keys(mevcut).length);

  /* ---------- Faturaları kalemlere aç ---------- */
  var seen = {}, son = {};
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (!row[iIcerik]) continue;
    var key = [row[iNo], row[iTarih], row[iGon], row[iTutar], row[iIcerik]].join('|');
    if (seen[key]) continue;
    seen[key] = 1;
    var tarih = row[iTarih] instanceof Date ? row[iTarih] : new Date(String(row[iTarih]).replace(' ', 'T'));
    var ted = tedMap[norm(row[iGon])] || String(row[iGon]).trim();
    if (HARIC_TEDARIKCI.indexOf(ted) >= 0) continue;
    parseIcerik(String(row[iIcerik])).forEach(function (it) {
      var k = norm(it.urun);
      if (!it.fiyat || k.indexOf('YUKLEMEBEDEL') >= 0) return;
      var o = son[k];
      if (!o) o = son[k] = { ad: it.urun, ted: ted, fiyat: it.fiyat, tarih: tarih, n: 0,
                             min: it.fiyat, max: it.fiyat, adet: 0, tutar: 0 };
      o.n++; o.adet += it.adet; o.tutar += it.adet * it.fiyat;
      if (it.fiyat < o.min) o.min = it.fiyat;
      if (it.fiyat > o.max) o.max = it.fiyat;
      if (tarih >= o.tarih) { o.tarih = tarih; o.fiyat = it.fiyat; o.ted = ted; }
    });
  }

  /* ---------- Önceki notlar ---------- */
  var eskiNot = {};
  [EKSIK_SEKME, EV_SEKME, DEMIRBAS_SEKME].forEach(function (ad) {
    var sh = ss.getSheetByName(ad);
    if (!sh || sh.getLastRow() < 2) return;
    var v = sh.getDataRange().getValues(), cNot = v[0].length - 1;
    v.slice(1).forEach(function (rr) { if (rr[cNot]) eskiNot[norm(rr[0])] = String(rr[cNot]).trim(); });
  });

  function notTipi(k) {
    var n = norm(eskiNot[k] || '');
    if (!n) return '';
    if (n.indexOf('YOKSAY') === 0) return 'YOKSAY';
    if (n.indexOf('EV') === 0) return 'EV';
    if (n.indexOf('DEMIRBAS') === 0) return 'DEMIRBAS';
    if (n.indexOf('HAMMADDE') === 0) return 'HAMMADDE';
    if (n.indexOf('AMBALAJ') === 0) return 'AMBALAJ';
    if (n.indexOf('DIREKT') === 0) return 'DIREKT';
    return '';
  }

  /* ---------- Ayrıştır ---------- */
  var eksik = [], ev = [], demirbas = [], eklenecek = { HAMMADDE: [], AMBALAJ: [], DIREKT: [] };

  Object.keys(son).forEach(function (k) {
    if (mevcut[k]) return;
    var o = son[k];
    var tip = notTipi(k);
    if (tip === 'YOKSAY') return;
    var satir = [o.ad, o.ted, o.fiyat, o.tarih, o.n, round2(o.adet), o.min, o.max, round2(o.tutar), eskiNot[k] || ''];
    if (tip === 'EV') { ev.push(satir); return; }
    if (tip === 'DEMIRBAS') { demirbas.push(satir); return; }
    if (eklenecek[tip]) { eklenecek[tip].push(o); return; }
    eksik.push(satir);
  });

  /* ---------- Tablolara ekle ---------- */
  var eklendi = [], eklenenAdlar = [];
  Object.keys(eklenecek).forEach(function (tip) {
    var liste = eklenecek[tip];
    if (!liste.length) return;
    var n = tabloyaEkle_(ss, HEDEF_TABLO[tip], liste, tip);
    if (n) {
      eklendi.push(HEDEF_TABLO[tip] + ': ' + n);
      liste.forEach(function (o) { eklenenAdlar.push(o.ad); });
    }
  });

  /* ---------- Yaz ---------- */
  var sirala = function (a, b) { return a[1] === b[1] ? (a[0] < b[0] ? -1 : 1) : (a[1] < b[1] ? -1 : 1); };
  eksik.sort(sirala); ev.sort(sirala); demirbas.sort(sirala);

  var B = ['Hammadde_Adı (faturadaki)', 'Tedarikçi', 'Son Fiyat', 'Son Alım', 'Alım Sayısı', 'Toplam Adet',
    'Min Fiyat', 'Max Fiyat', 'Toplam Tutar',
    'Not (Ev / Demirbaş / Hammadde / Ambalaj / Direkt / Yok say)'];
  yaz(ss, EKSIK_SEKME, B, eksik);
  yaz(ss, EV_SEKME, B, ev);
  yaz(ss, DEMIRBAS_SEKME, B, demirbas);

  var mesaj = 'Bitti.\n\n' +
    Object.keys(son).length + ' fatura ürünü tarandı\n' +
    eksik.length + ' ürün hâlâ sınıflandırılmadı → ' + EKSIK_SEKME + '\n' +
    ev.length + ' ev alımı → ' + EV_SEKME + '\n' +
    demirbas.length + ' demirbaş → ' + DEMIRBAS_SEKME;

  if (eklendi.length) {
    mesaj += '\n\nTABLOLARA EKLENEN: ' + eklendi.join(' · ') +
             '\n\n⚠️ Eklenen ürünlerin C sütununa (içeride kullanılan kısa ad) senin yazman gerekiyor:\n· ' +
             eklenenAdlar.slice(0, 15).join('\n· ') +
             (eklenenAdlar.length > 15 ? '\n... +' + (eklenenAdlar.length - 15) + ' tane daha' : '');
  }
  SpreadsheetApp.getUi().alert(mesaj);
}

/* ---------- Hedef tabloya satır ekle ---------- */
function tabloyaEkle_(ss, tabloAdi, liste, tip) {
  var sh = ss.getSheetByName(tabloAdi);
  if (!sh) { Logger.log('Tablo bulunamadı: ' + tabloAdi); return 0; }

  var sonSatir = sh.getLastRow();
  var genislik = Math.max(sh.getLastColumn(), 10);

  // Hammadde tablosunda ID üret (HM###)
  var sonrakiId = 0;
  if (tip === 'HAMMADDE' && sonSatir > 1) {
    sh.getRange(2, 1, sonSatir - 1, 1).getValues().forEach(function (r) {
      var m = String(r[0] || '').match(/HM(\d+)/i);
      if (m && +m[1] > sonrakiId) sonrakiId = +m[1];
    });
  }

  var satirlar = liste.map(function (o) {
    var y = new Array(genislik).fill('');
    if (tip === 'HAMMADDE') y[0] = 'HM' + (++sonrakiId);   // A  ID
    y[1] = o.ad;          // B  Hammadde_Adı (faturadaki)
    y[2] = '';            // C  Hammadde (kısa ad) — elle doldurulacak
    y[3] = o.ted;         // D  Tedarikçi
    y[4] = true;          // E  Tedarikçi Sipariş Aktif
    y[9] = o.fiyat;       // J  Son Alış Fiyatı
    if (genislik > 10) y[10] = 0;   // K  Mevcut_Stok
    if (genislik > 11) y[11] = 0;   // L  Min_Stok_Uyarı
    return y;
  });

  sh.getRange(sonSatir + 1, 1, satirlar.length, genislik).setValues(satirlar);
  return satirlar.length;
}

/* ---------- Yardımcılar ---------- */
function yaz(ss, ad, B, rows) {
  var sh = ss.getSheetByName(ad) || ss.insertSheet(ad);
  sh.clear();
  sh.getRange(1, 1, 1, B.length).setValues([B]).setFontWeight('bold');
  if (rows.length) {
    sh.getRange(2, 1, rows.length, B.length).setValues(rows);
    sh.getRange(2, 4, rows.length, 1).setNumberFormat('dd.MM.yyyy');
    sh.getRange(2, 3, rows.length, 7).setNumberFormat('#,##0.00');
  }
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, B.length);
}

function parseIcerik(s) {
  var out = [];
  s = s.replace(/\r/g, '');
  var parcalar = s.indexOf('\n') >= 0 ? s.split('\n') : [s];
  var re = /^(.*?)-(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)/;
  parcalar.forEach(function (p) {
    p = p.trim();
    while (p.length) {
      var m = re.exec(p);
      if (!m) break;
      out.push({ urun: m[1].replace(/\s+/g, ' ').trim(), adet: sayi(m[2]), fiyat: sayi(m[3]) });
      p = p.substring(m[0].length).trim();
    }
  });
  return out;
}
function sayi(x) { return Number(String(x).replace(',', '.')) || 0; }
function round2(x) { return Math.round(x * 100) / 100; }
function norm(s) {
  return String(s).replace(/\s+/g, '').toUpperCase()
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C');
}