/*** BAP – EKSİK ÜRÜNLERE KISA AD ÖNERİSİ ***
 *
 * Stok Takip projesine YENİ DOSYA olarak ekle.
 *
 * İKİ FONKSİYON
 *  1) oneriUret()   → Fatura_Eksik_Urunler'e K ve L sütunlarını ekler:
 *                     K = Önerilen Kısa Ad, L = Güven (%). Hiçbir tabloya dokunmaz.
 *                     Sen listeyi gözden geçirir, yanlış önerileri siler ya da düzeltirsin.
 *  2) onerileriUygula() → K sütunu dolu olan satırları ilgili tabloya ekler
 *                     (M sütununa Hammadde/Ambalaj/Direkt yazabilirsin, boşsa Hammadde).
 *
 * Eşleştirme, mevcut kısa adların kelimelerini faturadaki ad içinde arar.
 * Metro/Aro/Fine Life gibi marka önekleri ve ambalaj bilgisi (500G, 1KG, 6LI) atılır.
 */

var ONR = {
  EKSIK: 'Fatura_Eksik_Urunler',
  TABLOLAR: ['Tbl_Hammaddeler', 'Ambalaj_Hammadde', 'Direktsatisurunler'],
  VARSAYILAN_TABLO: 'Tbl_Hammaddeler',
  ESIK: 55            // bu güvenin altındaki öneriler yazılmaz
};

// Faturalarda geçen ama ürünle ilgisi olmayan kelimeler
var ONR_COP = ('METRO|METROCHEF|MC|M|CHEF|ARO|FINE|LIFE|FINED|FINEDREAMING|PROF|PREMIUM|' +
  'KG|GR|G|ML|LT|L|CC|MM|CM|ADET|AD|PAKET|PKT|KUTU|KOLI|KOLİ|LU|LÜ|Lİ|LI|' +
  'BUYUK|BÜYÜK|KUCUK|KÜÇÜK|ORTA|BOY|TAZE|DONUK|DONDURULMUS|DONDURULMUŞ|' +
  'YERLI|YERLİ|ITHAL|İTHAL|SADE|KLASIK|KLASİK|SEC|SEÇ').split('|');

function oneriUret() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(ONR.EKSIK);
  if (!sh || sh.getLastRow() < 2) { SpreadsheetApp.getUi().alert('Eksik listesi boş.'); return; }

  /* --- mevcut kısa adlar --- */
  var kisalar = [];      // {ad, tablo, kelimeler[]}
  ONR.TABLOLAR.forEach(function (tablo) {
    var t = ss.getSheetByName(tablo);
    if (!t || t.getLastRow() < 2) return;
    t.getRange(2, 3, t.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var ad = String(r[0] || '').trim();
      if (!ad) return;
      if (kisalar.some(function (x) { return x.ad === ad; })) return;
      kisalar.push({ ad: ad, tablo: tablo, kelimeler: onrKelime_(ad) });
    });
  });

  /* --- eksik listesi --- */
  var son = sh.getLastRow();
  var adlar = sh.getRange(2, 1, son - 1, 1).getValues();
  var cikti = adlar.map(function (r) {
    var fatura = String(r[0] || '').trim();
    if (!fatura) return ['', ''];
    var fk = onrKelime_(fatura);
    var enIyi = null, enIyiSkor = 0;

    kisalar.forEach(function (k) {
      var skor = onrSkor_(fk, k.kelimeler);
      if (skor > enIyiSkor) { enIyiSkor = skor; enIyi = k; }
    });

    if (!enIyi || enIyiSkor < ONR.ESIK) return ['', enIyiSkor ? Math.round(enIyiSkor) : ''];
    return [enIyi.ad, Math.round(enIyiSkor)];
  });

  sh.getRange(1, 11, 1, 3).setValues([['Önerilen Kısa Ad', 'Güven %', 'Hedef Tablo (boş = Hammadde)']])
    .setFontWeight('bold');
  sh.getRange(2, 11, cikti.length, 2).setValues(cikti);

  var oneriliSayi = cikti.filter(function (x) { return x[0]; }).length;
  sh.autoResizeColumns(11, 3);
  SpreadsheetApp.getUi().alert(
    (son - 1) + ' satırdan ' + oneriliSayi + ' tanesine öneri üretildi.\n\n' +
    'K sütununu gözden geçir:\n' +
    '· Doğruysa bırak\n' +
    '· Yanlışsa sil ya da doğru kısa adı yaz\n' +
    '· Ambalaj/Direkt ise M sütununa yaz\n\n' +
    'Sonra onerileriUygula() çalıştır.');
}

function onerileriUygula() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(ONR.EKSIK);
  if (!sh || sh.getLastRow() < 2) return;

  var son = sh.getLastRow();
  var v = sh.getRange(2, 1, son - 1, 13).getValues();   // A..M
  var grup = {};
  var islenen = [];

  v.forEach(function (r, i) {
    var fatura = String(r[0] || '').trim();
    var kisa = String(r[10] || '').trim();              // K
    if (!fatura || !kisa) return;
    var hedef = String(r[12] || '').trim();             // M
    var t = ONR.VARSAYILAN_TABLO;
    var hn = hedef.toUpperCase();
    if (hn.indexOf('AMBALAJ') === 0) t = 'Ambalaj_Hammadde';
    else if (hn.indexOf('DIREKT') === 0 || hn.indexOf('DİREKT') === 0) t = 'Direktsatisurunler';
    (grup[t] = grup[t] || []).push({ fatura: fatura, kisa: kisa, ted: r[1], fiyat: r[2] });
    islenen.push(i + 2);
  });

  if (!islenen.length) { SpreadsheetApp.getUi().alert('K sütununda dolu satır yok.'); return; }

  var ozet = [];
  Object.keys(grup).forEach(function (tablo) {
    var t = ss.getSheetByName(tablo);
    if (!t) return;
    var gen = Math.max(t.getLastColumn(), 10);
    var sonSatir = t.getLastRow();

    var sonrakiId = 0;
    if (tablo === 'Tbl_Hammaddeler' && sonSatir > 1) {
      t.getRange(2, 1, sonSatir - 1, 1).getValues().forEach(function (r) {
        var m = String(r[0] || '').match(/HM(\d+)/i);
        if (m && +m[1] > sonrakiId) sonrakiId = +m[1];
      });
    }

    var satirlar = grup[tablo].map(function (o) {
      var y = new Array(gen).fill('');
      if (tablo === 'Tbl_Hammaddeler') y[0] = 'HM' + (++sonrakiId);
      y[1] = o.fatura;
      y[2] = o.kisa;
      y[3] = o.ted;
      y[4] = true;
      y[9] = o.fiyat;
      if (gen > 10) y[10] = 0;
      if (gen > 11) y[11] = 0;
      return y;
    });
    t.getRange(sonSatir + 1, 1, satirlar.length, gen).setValues(satirlar);
    ozet.push(tablo + ': ' + satirlar.length);
  });

  // işlenen satırları listeden sil (alttan yukarı)
  islenen.sort(function (a, b) { return b - a; }).forEach(function (s) { sh.deleteRow(s); });

  SpreadsheetApp.getUi().alert('Eklendi → ' + ozet.join(' · ') +
    '\n\nBu ürünler artık tablolarda, eksik listesinden çıkarıldı.');
}

/* ---------- yardımcılar ---------- */
function onrKelime_(s) {
  var t = String(s).toUpperCase()
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]+/g, ' ');
  // rakam+birim bitişikse ayır: 500G -> 500 G
  t = t.replace(/(\d)([A-Z])/g, '$1 $2').replace(/([A-Z])(\d)/g, '$1 $2');
  return t.split(' ').filter(function (w) {
    if (w.length < 3) return false;
    if (/^\d+$/.test(w)) return false;
    return ONR_COP.indexOf(w) < 0;
  });
}

function onrSkor_(faturaKel, kisaKel) {
  if (!kisaKel.length || !faturaKel.length) return 0;
  var eslesen = 0;
  kisaKel.forEach(function (k) {
    var bulundu = faturaKel.some(function (f) {
      if (f === k) return true;
      if (k.length >= 4 && f.indexOf(k) === 0) return true;
      if (f.length >= 4 && k.indexOf(f) === 0) return true;
      return false;
    });
    if (bulundu) eslesen++;
  });
  if (!eslesen) return 0;
  // kısa adın kelimelerinin ne kadarı bulundu + tek kelimelik adlarda ceza
  var oran = eslesen / kisaKel.length * 100;
  if (kisaKel.length === 1 && faturaKel.length > 3) oran -= 15;
  return oran;
}