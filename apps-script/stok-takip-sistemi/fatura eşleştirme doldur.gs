/*** BAP – FATURA EŞLEŞTİRME OTOMATİK DOLDURMA ***
 *
 * Stok Takip projesine YENİ DOSYA olarak ekle.
 *
 * NE YAPAR
 *  Tbl_Hammaddeler / Ambalaj_Hammadde / Direktsatisurunler tablolarındaki
 *  B (faturadaki ad) → C (içeride kullanılan kısa ad) eşleşmesini
 *  Fatura_Eslestirme tablosuna aktarır.
 *
 *  Böylece faturadan gelen her ürün stoğa KISA AD altında işlenir;
 *  aynı ürünün farklı toptancı adları tek stok kalemine toplanır.
 *
 * ÇARPAN
 *  1 fatura adedi = kaç stok birimi.
 *  Koli_Icerik doluysa o, değilse Birim, o da yoksa 1 yazılır.
 *
 * KULLANIM
 *  eslestirmeDoldur()  → önce KURU=true, log'a bak; sonra false yapıp uygula
 *  bekleyenleriGoster() → Alis_Bekleyenler'de hâlâ eşleşmeyenleri listeler
 */

var ESL = {
  SEKME: 'Fatura_Eslestirme',
  BEKLEYEN: 'Alis_Bekleyenler',
  KAYNAK: [
    { tablo: 'Tbl_Hammaddeler',    tip: 'HM'  },
    { tablo: 'Ambalaj_Hammadde',   tip: 'AMB' },
    { tablo: 'Direktsatisurunler', tip: 'DS'  }
  ]
};

function eslestirmeDoldur() {
  var KURU = true;                    // ← önce true, log'a bak, sonra false

  var ss = SpreadsheetApp.getActive();
  var R = [];

  /* ---------- 1) Ürün tablolarından eşleşmeleri topla ---------- */
  var esl = {};        // norm(fatura adı) -> {fatura, kisa, ted, carpan, tip}
  var kisaAdsiz = [];

  ESL.KAYNAK.forEach(function (k) {
    var sh = ss.getSheetByName(k.tablo);
    if (!sh || sh.getLastRow() < 2) { R.push('! ' + k.tablo + ' yok/boş'); return; }
    var gen = Math.max(sh.getLastColumn(), 16);
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, gen).getValues();
    var n = 0;
    v.forEach(function (r) {
      var fatura = String(r[1] || '').trim();     // B
      var kisa   = String(r[2] || '').trim();     // C
      if (!fatura) return;
      if (!kisa) { kisaAdsiz.push(k.tablo + ' | ' + fatura); return; }
      var key = eslNorm_(fatura);
      if (esl[key]) return;                        // ilk gelen kazanır
      var koli = Number(r[15]) || 0;               // P Koli_Icerik
      var birim = Number(r[7]) || 0;               // H Birim
      esl[key] = {
        fatura: fatura,
        kisa: kisa,
        ted: String(r[3] || '').trim(),            // D Tedarikçi
        carpan: koli > 0 ? koli : (birim > 0 ? birim : 1),
        tip: k.tip
      };
      n++;
    });
    R.push(k.tablo + ': ' + n + ' eşleşme');
  });

  R.push('Toplam eşleşme: ' + Object.keys(esl).length);
  if (kisaAdsiz.length) {
    R.push('');
    R.push('⚠ KISA ADI BOŞ ' + kisaAdsiz.length + ' ürün (eşleştirmeye girmedi):');
    kisaAdsiz.slice(0, 20).forEach(function (x) { R.push('   ' + x); });
    if (kisaAdsiz.length > 20) R.push('   ... +' + (kisaAdsiz.length - 20));
  }

  /* ---------- 2) Mevcut eşleştirme tablosu ---------- */
  var sh = ss.getSheetByName(ESL.SEKME);
  if (!sh) { R.push('! ' + ESL.SEKME + ' sekmesi yok'); Logger.log(R.join('\n')); return; }

  var son = sh.getLastRow();
  var mevcut = son > 1 ? sh.getRange(2, 1, son - 1, 7).getValues() : [];
  var indeks = {};
  mevcut.forEach(function (r, i) {
    var key = eslNorm_(r[0]);
    if (key) indeks[key] = i;
  });

  var doldurulacak = 0, yeni = [];
  Object.keys(esl).forEach(function (key) {
    var o = esl[key];
    var i = indeks[key];
    if (i === undefined) {
      yeni.push([o.fatura, o.kisa, o.carpan, '', o.ted, o.tip, '']);
      return;
    }
    if (String(mevcut[i][1] || '').trim()) return;   // zaten dolu, dokunma
    mevcut[i][1] = o.kisa;
    mevcut[i][2] = o.carpan;
    if (!String(mevcut[i][5] || '').trim()) mevcut[i][5] = o.tip;
    if (!String(mevcut[i][4] || '').trim()) mevcut[i][4] = o.ted;
    doldurulacak++;
  });

  var bosKalan = mevcut.filter(function (r) {
    return String(r[0] || '').trim() && !String(r[1] || '').trim();
  }).length;

  R.push('');
  R.push('Eşleştirme tablosunda ' + mevcut.length + ' satır');
  R.push('Doldurulacak: ' + doldurulacak);
  R.push('Yeni eklenecek satır: ' + yeni.length);
  R.push('Doldurulamayan (tabloda karşılığı yok): ' + bosKalan);
  R.push('');
  R.push(KURU ? '[KURU ÇALIŞMA — yazılmadı]' : '[UYGULANDI]');
  Logger.log(R.join('\n'));
  if (KURU) return;

  /* ---------- 3) Yaz ---------- */
  if (mevcut.length) sh.getRange(2, 1, mevcut.length, 7).setValues(mevcut);
  if (yeni.length) sh.getRange(sh.getLastRow() + 1, 1, yeni.length, 7).setValues(yeni);
  Logger.log('Yazıldı: ' + doldurulacak + ' dolduruldu, ' + yeni.length + ' yeni satır.');
}

/* ---------- Bekleyen alışların durumu ---------- */
function bekleyenleriGoster() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(ESL.BEKLEYEN);
  if (!sh || sh.getLastRow() < 2) { Logger.log('Bekleyen yok.'); return; }

  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  var sayac = {}, urunler = {};
  v.forEach(function (r) {
    var durum = String(r[5] || '').trim() || '(boş)';
    sayac[durum] = (sayac[durum] || 0) + 1;
    if (durum.indexOf('ESLESME_YOK') >= 0) {
      var u = String(r[3] || '').trim();
      if (u) urunler[u] = (urunler[u] || 0) + 1;
    }
  });

  var R = ['Bekleyen alış satırı: ' + v.length, ''];
  Object.keys(sayac).forEach(function (d) { R.push('  ' + d + ': ' + sayac[d]); });

  var liste = Object.keys(urunler).sort(function (a, b) { return urunler[b] - urunler[a]; });
  if (liste.length) {
    R.push('');
    R.push('EŞLEŞMEYEN ÜRÜNLER (' + liste.length + ' farklı ad):');
    liste.slice(0, 40).forEach(function (u) { R.push('   ' + u + '  (' + urunler[u] + ' satır)'); });
    if (liste.length > 40) R.push('   ... +' + (liste.length - 40));
  }
  Logger.log(R.join('\n'));
}

function eslNorm_(s) {
  return String(s).replace(/\s+/g, '').toUpperCase()
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C');
}