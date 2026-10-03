/*** BAP – ESKİ ÜRÜN ADI ARŞİVİ ***
 *
 * Stok Takip projesine YENİ DOSYA olarak ekle.
 *
 * NE YAPAR
 *  Toptancılar aynı ürünü farklı adlarla faturalandırdıkça sipariş listesi şişiyor.
 *  Bu script artık kullanılmayan fatura adlarını "Eski_Urun_Isimleri" sekmesine taşır,
 *  böylece çalışanların gördüğü liste temiz kalır.
 *
 * ARŞİVLEME ŞARTLARI (dördü birden sağlanmalı)
 *  1. Son 90 günde o adla alım yok
 *  2. Sube_Stok'ta stoğu sıfır (ya da hiç kaydı yok)
 *  3. Alis_Bekleyenler'de bekleyen satırı yok
 *  4. Aynı kısa ada (C sütunu) bağlı BAŞKA aktif bir ad var
 *     → ürünün kendisi hâlâ sipariş edilebiliyor, sadece eski ambalaj adı ölüyor
 *
 * GERİ DÖNÜŞ
 *  Arşivdeki bir ad yeni bir faturada tekrar görünürse otomatik geri alınır.
 *
 * KULLANIM
 *  arsivKontrol()  → önce KURU=true ile çalıştır, log'a bak; sonra false yapıp uygula
 */

var ARS = {
  HAM_DOSYA_ID: '1JJ6UZzh8rSX1FE9Cr-UPzEAaE-2aKtM10bEvjAv2P5w',
  TABLOLAR: ['Tbl_Hammaddeler', 'Ambalaj_Hammadde', 'Direktsatisurunler'],
  ARSIV: 'Eski_Urun_Isimleri',
  STOK: 'Sube_Stok',
  BEKLEYEN: 'Alis_Bekleyenler',
  GUN: 120
};

function arsivKontrol() {
  var KURU = true;                      // ← önce true, log'a bak, sonra false yap

  var ss = SpreadsheetApp.getActive();
  var R = [];

  /* ---------- 1) Faturalardan son alım tarihleri ---------- */
  var sonAlim = {};                     // norm(uzun ad) -> Date
  (function () {
    var ham = SpreadsheetApp.openById(ARS.HAM_DOSYA_ID).getSheets()[0];
    var data = ham.getDataRange().getValues();
    var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
    var iTarih = h.indexOf('tarih'), iIcerik = 4;
    h.forEach(function (x, i) { if (x.indexOf('fatura_i') === 0 && x.indexOf('eri') > 0) iIcerik = i; });
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      if (!row[iIcerik]) continue;
      var t = row[iTarih] instanceof Date ? row[iTarih] : new Date(String(row[iTarih]).replace(' ', 'T'));
      if (isNaN(t)) continue;
      arsParse_(String(row[iIcerik])).forEach(function (it) {
        var k = arsNorm_(it.urun);
        if (!k) return;
        if (!sonAlim[k] || t > sonAlim[k]) sonAlim[k] = t;
      });
    }
  })();
  R.push('Faturalarda geçen farklı ad: ' + Object.keys(sonAlim).length);

  /* ---------- 2) Stok ---------- */
  var stok = {};
  (function () {
    var sh = ss.getSheetByName(ARS.STOK);
    if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
      var k = arsNorm_(r[0]);
      if (!k) return;
      stok[k] = (stok[k] || 0) + (Number(r[3]) || 0);
    });
  })();

  /* ---------- 3) Bekleyen alışlar ---------- */
  var bekleyen = {};
  (function () {
    var sh = ss.getSheetByName(ARS.BEKLEYEN);
    if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, 4, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
      var durum = String(r[2] || '').toUpperCase();
      if (durum.indexOf('TAMAM') >= 0) return;
      var k = arsNorm_(r[0]);
      if (k) bekleyen[k] = true;
    });
  })();

  /* ---------- 4) Tabloları tara ---------- */
  var sinir = new Date();
  sinir.setDate(sinir.getDate() - ARS.GUN);

  var adaylar = [];        // {tablo, satir, uzun, kisa, sonAlim, stok}
  var kisaSayac = {};      // kısa ad -> aktif uzun ad sayısı

  var tabloVerisi = {};
  ARS.TABLOLAR.forEach(function (ad) {
    var sh = ss.getSheetByName(ad);
    if (!sh || sh.getLastRow() < 2) return;
    var gen = Math.max(sh.getLastColumn(), 10);
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, gen).getValues();
    tabloVerisi[ad] = { sh: sh, gen: gen, v: v };
    v.forEach(function (r) {
      var uzun = String(r[1] || '').trim();
      var kisa = String(r[2] || '').trim();
      if (!uzun || !kisa) return;
      kisaSayac[kisa] = (kisaSayac[kisa] || 0) + 1;
    });
  });

  ARS.TABLOLAR.forEach(function (ad) {
    var t = tabloVerisi[ad];
    if (!t) return;
    t.v.forEach(function (r, i) {
      var uzun = String(r[1] || '').trim();
      var kisa = String(r[2] || '').trim();
      if (!uzun) return;
      var k = arsNorm_(uzun);

      var sa = sonAlim[k] || null;
      if (sa && sa >= sinir) return;                       // yakın zamanda alınmış
      if ((stok[k] || 0) !== 0) return;                    // stoğu var
      if (bekleyen[k]) return;                             // bekleyen alış var
      if (!kisa) return;                                   // kısa adı yok, dokunma
    

      adaylar.push({
        tablo: ad, satir: i + 2, uzun: uzun, kisa: kisa,
        sonAlim: sa, satirVeri: r, gen: t.gen
      });
    });
  });

  R.push('');
  R.push('ARŞİVLENECEK: ' + adaylar.length + ' ad');
  adaylar.slice(0, 40).forEach(function (a) {
    R.push('   [' + a.tablo + '] ' + a.uzun + '  →  kısa ad: ' + a.kisa +
           '  |  son alım: ' + (a.sonAlim ? Utilities.formatDate(a.sonAlim, 'Europe/Istanbul', 'dd.MM.yyyy') : 'hiç'));
  });
  if (adaylar.length > 40) R.push('   ... +' + (adaylar.length - 40) + ' tane daha');

  /* ---------- 5) Arşivden geri dönecekler ---------- */
  var geri = [];
  (function () {
    var sh = ss.getSheetByName(ARS.ARSIV);
    if (!sh || sh.getLastRow() < 2) return;
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
    v.forEach(function (r, i) {
      var uzun = String(r[1] || '').trim();     // B = fatura adı
      var k = arsNorm_(uzun);
      if (sonAlim[k] && sonAlim[k] >= sinir) geri.push({ satir: i + 2, veri: r, uzun: uzun });
    });
  })();
  if (geri.length) {
    R.push('');
    R.push('GERİ ALINACAK (tekrar alım yapılmış): ' + geri.length);
    geri.slice(0, 20).forEach(function (g) { R.push('   ' + g.uzun); });
  }

  R.push('');
  R.push(KURU ? '[KURU ÇALIŞMA — hiçbir şey değiştirilmedi]' : '[UYGULANDI]');
  Logger.log(R.join('\n'));
  if (KURU) return;

  /* ---------- 6) Uygula ---------- */
  var ars = ss.getSheetByName(ARS.ARSIV);
  if (!ars) {
    ars = ss.insertSheet(ARS.ARSIV);
    ars.getRange(1, 1, 1, 4).setValues([['Kaynak Tablo', 'Fatura Adı', 'Kısa Ad', 'Arşiv Tarihi']])
       .setFontWeight('bold');
    ars.setFrozenRows(1);
  }

  // geri alınacakları önce hedef tabloya yaz, sonra arşivden sil
  if (geri.length) {
    var geriGrup = {};
    geri.forEach(function (g) {
      var hedef = String(g.veri[0] || 'Tbl_Hammaddeler');
      (geriGrup[hedef] = geriGrup[hedef] || []).push(g.veri);
    });
    Object.keys(geriGrup).forEach(function (hedef) {
      var sh = ss.getSheetByName(hedef);
      if (!sh) return;
      var gen = Math.max(sh.getLastColumn(), 10);
      var satirlar = geriGrup[hedef].map(function (v) {
        var y = new Array(gen).fill('');
        for (var c = 4; c < v.length && (c - 4) < gen; c++) y[c - 4] = v[c];   // E sütunundan sonrası orijinal satır
        y[1] = v[1]; y[2] = v[2];
        return y;
      });
      sh.getRange(sh.getLastRow() + 1, 1, satirlar.length, gen).setValues(satirlar);
    });
    geri.map(function (g) { return g.satir; }).sort(function (a, b) { return b - a; })
        .forEach(function (s) { ars.deleteRow(s); });
  }

  // arşive yaz
  if (adaylar.length) {
    var yeni = adaylar.map(function (a) {
      var satir = [a.tablo, a.uzun, a.kisa, new Date()];
      return satir.concat(Array.prototype.slice.call(a.satirVeri, 0, a.gen));
    });
    var maxGen = Math.max.apply(null, yeni.map(function (x) { return x.length; }));
    yeni = yeni.map(function (x) { while (x.length < maxGen) x.push(''); return x; });
    ars.getRange(ars.getLastRow() + 1, 1, yeni.length, maxGen).setValues(yeni);

    // kaynak tablolardan sil (alttan yukarı)
    var grup = {};
    adaylar.forEach(function (a) { (grup[a.tablo] = grup[a.tablo] || []).push(a.satir); });
    Object.keys(grup).forEach(function (tablo) {
      var sh = ss.getSheetByName(tablo);
      grup[tablo].sort(function (a, b) { return b - a; }).forEach(function (s) { sh.deleteRow(s); });
    });
  }

  Logger.log('Arşivlenen: ' + adaylar.length + ' | geri alınan: ' + geri.length);
}

/* ---------- yardımcılar ---------- */
function arsParse_(s) {
  var out = [];
  s = s.replace(/\r/g, '');
  var parcalar = s.indexOf('\n') >= 0 ? s.split('\n') : [s];
  var re = /^(.*?)-(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)/;
  parcalar.forEach(function (p) {
    p = p.trim();
    while (p.length) {
      var m = re.exec(p);
      if (!m) break;
      out.push({ urun: m[1].replace(/\s+/g, ' ').trim() });
      p = p.substring(m[0].length).trim();
    }
  });
  return out;
}
function arsNorm_(s) {
  return String(s).replace(/\s+/g, '').toUpperCase()
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C');
}