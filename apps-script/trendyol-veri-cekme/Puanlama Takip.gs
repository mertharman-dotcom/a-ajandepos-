/*** BAP — Trendyol Günlük Puan Tablosu (90 günlük kayan ortalama) ****
 *
 * Trendyol değerlendirme projesine EK dosya olarak ekle.
 * TY sabitini oradan kullanır, yeniden tanımlamaz.
 *
 * Ne yapar: "Degerlendirmeler" sekmesindeki ham yorumlardan her gün için
 * o güne kadarki son 90 günün ortalamasını hesaplar ve Puan_Gunluk
 * sekmesine yazar. Tarihler yukarıdan aşağı, 4 şube yan yana.
 * Tablo, veri başlangıcından 90 gün sonra başlar (1 Ocak verisi -> 31 Mart).
 *
 * Her çalıştırmada tablo baştan üretilir; geç gelen yorumlar geçmiş
 * günleri de otomatik düzeltir.
 *
 * Kurulum:
 *   1) puanTablosuYenile()   — tabloyu kurar
 *   2) puanTetikleyiciKur()  — her gece 23:45 otomatik
 *********************************************************************/

const TYP = {
  TABLO:    'Puan_Gunluk',
  RESMI:    'Puan_Resmi',   // Trendyol'un gösterdiği puanın günlük kaydı
  PENCERE:   90,
  PENCERE2:  30,
  KISA: {
    'BAP Pizza Erenköy':           'Pizza Erenköy',
    'BAP Pizza Fikirtepe':         'Pizza Fikirtepe',
    'BAP Salad & Pasta Fikirtepe': 'Salad Fikirtepe',
    'BAP Salad & Pasta Erenköy':   'Salad Erenköy'
  }
};

const GUN_MS = 86400000;
const SIFIR  = new Date(2020, 0, 1).getTime();

function gunNo_(d)  { return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - SIFIR) / GUN_MS); }
function gunTar_(n) { return new Date(SIFIR + n * GUN_MS); }
function kisa_(m)   { return TYP.KISA[m] || m; }

/* ================== ANA İŞ ================== */
function puanTablosuYenile() {
  const ss  = SpreadsheetApp.getActive();
  const kay = ss.getSheetByName(TY.REVIEW_SHEET);
  if (!kay || kay.getLastRow() < 2) { Logger.log('Değerlendirme sekmesi boş.'); return; }

  const v = kay.getRange(2, 1, kay.getLastRow() - 1, 9).getValues();   // A..I
  const markalar = TY.MAGAZALAR.map(m => m.marka);

  // marka -> gün -> {toplam, adet}
  const kova = {};
  markalar.forEach(m => kova[m] = {});
  let ilkGun = null, sonGun = null;

  v.forEach(r => {
    const t = r[1], marka = r[4], puan = Number(r[8]);   // B tarih, E mağaza, I ortalama
    if (!(t instanceof Date) || !kova[marka] || !puan) return;
    const g = gunNo_(t);
    const c = kova[marka][g] || (kova[marka][g] = { t: 0, a: 0 });
    c.t += puan; c.a++;
    if (ilkGun === null || g < ilkGun) ilkGun = g;
    if (sonGun === null || g > sonGun) sonGun = g;
  });
  if (ilkGun === null) { Logger.log('Puanlı değerlendirme yok.'); return; }

  const bugun = gunNo_(new Date());
  if (bugun > sonGun) sonGun = bugun;

  let bas = ilkGun + TYP.PENCERE - 1;        // 90 günlük pencerenin dolduğu ilk gün
  if (bas > sonGun) {
    bas = ilkGun;
    Logger.log('UYARI: 90 günlük tam geçmiş yok, ilk satırlar kısmi pencere.');
  }

  // bugünün resmi puanını kaydet, geçmiş kayıtları da oku
  resmiPuanKaydet_();
  const resmi = {};
  const rsh = ss.getSheetByName(TYP.RESMI);
  if (rsh && rsh.getLastRow() > 1) {
    rsh.getRange(2, 1, rsh.getLastRow() - 1, 3).getValues().forEach(r => {
      if (r[0] instanceof Date) resmi[gunNo_(r[0]) + '|' + r[1]] = r[2];
    });
  }

  // kayan ortalamalar
  const seri = {};
  markalar.forEach(marka => {
    const k = kova[marka];
    let t90 = 0, n90 = 0, t30 = 0, n30 = 0;
    for (let g = bas - TYP.PENCERE  + 1; g <= bas; g++) { const c = k[g]; if (c) { t90 += c.t; n90 += c.a; } }
    for (let g = bas - TYP.PENCERE2 + 1; g <= bas; g++) { const c = k[g]; if (c) { t30 += c.t; n30 += c.a; } }

    const d90 = [], d30 = [], ad = [];
    for (let g = bas; g <= sonGun; g++) {
      if (g > bas) {
        const gir = k[g];
        if (gir) { t90 += gir.t; n90 += gir.a; t30 += gir.t; n30 += gir.a; }
        const c90 = k[g - TYP.PENCERE];   if (c90) { t90 -= c90.t; n90 -= c90.a; }
        const c30 = k[g - TYP.PENCERE2];  if (c30) { t30 -= c30.t; n30 -= c30.a; }
      }
      d90.push(n90 ? t90 / n90 : '');
      d30.push(n30 ? t30 / n30 : '');
      ad.push(n90);
    }
    seri[marka] = { d90: d90, d30: d30, ad: ad };
  });

  // tablo
  const baslik = ['Tarih'];
  markalar.forEach(m => baslik.push(kisa_(m) + ' 90g'));
  markalar.forEach(m => baslik.push(kisa_(m) + ' Adet'));
  markalar.forEach(m => baslik.push(kisa_(m) + ' 30g'));
  markalar.forEach(m => baslik.push(kisa_(m) + ' TY'));

  const satirlar = [];
  for (let i = 0; i <= sonGun - bas; i++) {
    const g = bas + i;
    const s = [gunTar_(g)];
    markalar.forEach(m => s.push(seri[m].d90[i]));
    markalar.forEach(m => s.push(seri[m].ad[i]));
    markalar.forEach(m => s.push(seri[m].d30[i]));
    markalar.forEach(m => s.push(resmi[g + '|' + m] !== undefined ? resmi[g + '|' + m] : ''));
    satirlar.push(s);
  }

  let sh = ss.getSheetByName(TYP.TABLO);
  if (!sh) sh = ss.insertSheet(TYP.TABLO);
  sh.clear();
  sh.getRange(1, 1, 1, baslik.length).setValues([baslik])
    .setFontWeight('bold').setBackground('#f1f3f4');
  sh.getRange(2, 1, satirlar.length, baslik.length).setValues(satirlar);

  const n = markalar.length;
  sh.getRange(2, 1,         satirlar.length, 1).setNumberFormat('dd.MM.yyyy');
  sh.getRange(2, 2,         satirlar.length, n).setNumberFormat('0.00');
  sh.getRange(2, 2 + n,     satirlar.length, n).setNumberFormat('0');
  sh.getRange(2, 2 + n * 2, satirlar.length, n).setNumberFormat('0.00');
  sh.getRange(2, 2 + n * 3, satirlar.length, n).setNumberFormat('0.00');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);

  Logger.log('Puan_Gunluk: ' + satirlar.length + ' gün | ' +
    Utilities.formatDate(gunTar_(bas), 'Europe/Istanbul', 'dd.MM.yyyy') + ' - ' +
    Utilities.formatDate(gunTar_(sonGun), 'Europe/Istanbul', 'dd.MM.yyyy'));
}

/* ========== Trendyol'un gösterdiği anlık puanı kaydet ========== */
function resmiPuanKaydet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(TYP.RESMI);
  if (!sh) {
    sh = ss.insertSheet(TYP.RESMI);
    sh.appendRow(['Tarih', 'Mağaza', 'Genel', 'Lezzet', 'Servis', 'Teslimat', 'Yorum Adedi', 'Puan Adedi']);
    sh.setFrozenRows(1);
  }
  const bugun = new Date(), bg = gunNo_(bugun), var_ = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
      if (r[0] instanceof Date) var_[gunNo_(r[0]) + '|' + r[1]] = true;
    });
  }
  const yeni = [];
  TY.MAGAZALAR.forEach(m => {
    if (var_[bg + '|' + m.marka]) return;
    const url = 'https://api.tgoapis.com/integrator/review/meal/suppliers/' + m.supplier +
                '/stores/' + m.store + '/reviews/stats';
    try {
      const res = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: { 'Authorization': 'Basic ' + m.token,
                   'User-Agent': m.supplier + ' - SelfIntegration',
                   'Accept': 'application/json' },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() !== 200) {
        Logger.log(m.marka + ' stats ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 120));
        tyErisimHatasi_('Puan', res.getResponseCode(), res.getContentText());
        return;
      }
      const j = JSON.parse(res.getContentText()), a = j.averageScores || {};
      yeni.push([bugun, m.marka, a.overall || '', a.flavor || '', a.service || '',
                 a.delivery || '', j.commentCount || '', j.ratingCount || '']);
    } catch (e) { Logger.log(m.marka + ' stats hata: ' + e); }
    Utilities.sleep(250);
  });
  if (yeni.length) {
    sh.getRange(sh.getLastRow() + 1, 1, yeni.length, 8).setValues(yeni);
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).setNumberFormat('dd.MM.yyyy');
  }
}

/* ================== TETİKLEYİCİ ================== */
function puanTetikleyiciKur() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'puanTablosuYenile')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('puanTablosuYenile').timeBased().atHour(23).nearMinute(45).everyDays(1).create();
  Logger.log('Tetikleyici kuruldu: her gece 23:45');
}