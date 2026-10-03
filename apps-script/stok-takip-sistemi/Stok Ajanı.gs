/*** BAP – STOK AJANI v1 ***
 *
 * Stok Takip projesine YENİ DOSYA olarak ekle.
 * Diğer dosyalarla çakışmaz (tüm fonksiyonlar "aj" önekli).
 *
 * NE YAPAR
 *  Zinciri baştan sona yürür: katalog → eşleştirme → bekleyen alışlar → stok.
 *  Kendi çözebileceğini çözer, çözemediğini "Ajan_Sorular" sekmesine tek tek sorar.
 *  Sen cevap sütununu doldurursun, bir sonraki çalıştırmada uygular ve bir daha sormaz.
 *
 * KULLANIM
 *  1) ajanCalistir()   → KURU=true iken sadece raporlar, hiçbir şeye dokunmaz
 *  2) Log'u oku, mantıklıysa AJ.KURU = false yap
 *  3) ajanCalistir()   → düzeltir + Ajan_Sorular'ı doldurur
 *  4) Sorular sekmesinde "Cevabın" sütununu doldur
 *  5) ajanCalistir()   → cevapları uygular, kaldığı yerden devam eder
 */

var AJ = {
  KURU: true,                    // ← ilk çalıştırmada true bırak

  HAM_DOSYA_ID: '1JJ6UZzh8rSX1FE9Cr-UPzEAaE-2aKtM10bEvjAv2P5w',
  TABLOLAR: [
    { ad: 'Tbl_Hammaddeler',    tip: 'HM'  },
    { ad: 'Ambalaj_Hammadde',   tip: 'AMB' },
    { ad: 'Direktsatisurunler', tip: 'DS'  }
  ],
  ESLESME: 'Fatura_Eslestirme',
  BEKLEYEN: 'Alis_Bekleyenler',
  STOK: 'Sube_Stok',
  SORULAR: 'Ajan_Sorular',
  EKSIK: 'Fatura_Eksik_Urunler',

  OTO_ESIK: 80,                  // bu güvenin üstündeki öneriyi kendi uygular
  SOR_ESIK: 45,                  // bunun üstünü öneriyle sorar, altını öneriyisiz
  SORU_LIMIT: 40                 // bir turda en fazla kaç soru sorsun
};

var AJ_COP = ('METRO|METROCHEF|CHEF|ARO|FINE|LIFE|PROF|PREMIUM|MPREMIUM|MCHEF|' +
  'KG|GR|ML|CC|MM|ADET|PAKET|PKT|KUTU|KOLI|BUYUK|KUCUK|ORTA|BOY|' +
  'DONUK|DONDURULMUS|YERLI|ITHAL|SADE|TNK|PET|CAM|ŞİŞE|SISE').split('|');

/* ============================================================
 * ANA AKIŞ
 * ============================================================ */
function ajanCalistir() {
  var ss = SpreadsheetApp.getActive();
  var R = [];
  var yapilan = [];

  R.push('BAP STOK AJANI — ' + Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy HH:mm'));
  R.push(AJ.KURU ? '*** KURU ÇALIŞMA — hiçbir şey değiştirilmiyor ***' : '*** UYGULAMA MODU ***');
  R.push('');

  var sorular = ajSorularOku_(ss);

  // ---------- ADIM 0: bekleyen cevapları uygula ----------
  var uygulanan = ajCevaplariUygula_(ss, sorular, R);
  if (uygulanan) yapilan.push(uygulanan + ' cevap uygulandı');

  // ---------- ADIM 1: katalog — kısa adı boş ürünler ----------
  var katalog = ajKatalogOku_(ss);
  R.push('── 1. KATALOG ──');
  R.push('Toplam ürün: ' + katalog.hepsi.length + ' | kısa adı dolu: ' +
         (katalog.hepsi.length - katalog.bosOlanlar.length) + ' | BOŞ: ' + katalog.bosOlanlar.length);

  var otoDolan = [], yeniSorular = [];
  katalog.bosOlanlar.forEach(function (u) {
    if (sorular.cevaplanmis[ajNorm_(u.uzun)]) return;         // zaten cevaplanmış
    var t = ajOneri_(u.uzun, katalog.kisaAdlar);
    if (t.skor >= AJ.OTO_ESIK) {
      otoDolan.push({ tablo: u.tablo, satir: u.satir, kisa: t.ad, uzun: u.uzun, skor: t.skor });
    } else if (!sorular.soruldu[ajNorm_(u.uzun)]) {
      yeniSorular.push([
        'Bu ürünün içeride kullandığın adı ne?',
        u.uzun,
        u.tablo,
        t.skor >= AJ.SOR_ESIK ? t.ad : '',
        t.skor ? Math.round(t.skor) : '',
        '', ''
      ]);
    }
  });

  R.push('Otomatik doldurulacak (güven ≥' + AJ.OTO_ESIK + '): ' + otoDolan.length);
  otoDolan.slice(0, 15).forEach(function (o) {
    R.push('   ' + o.uzun + '  →  ' + o.kisa + '  (%' + Math.round(o.skor) + ')');
  });
  if (otoDolan.length > 15) R.push('   ... +' + (otoDolan.length - 15));
  R.push('Sorulacak: ' + yeniSorular.length);

  if (!AJ.KURU && otoDolan.length) {
    ajKisaAdYaz_(ss, otoDolan);
    yapilan.push(otoDolan.length + ' kısa ad dolduruldu');
  }

  // ---------- ADIM 2: eşleştirme köprüsü ----------
  R.push('');
  R.push('── 2. FATURA EŞLEŞTİRME ──');
  var es = ajEslestirme_(ss, AJ.KURU);
  R.push('Doldurulan: ' + es.doldurulan + ' | yeni satır: ' + es.yeni + ' | hâlâ boş: ' + es.bos);
  if (!AJ.KURU && (es.doldurulan || es.yeni)) yapilan.push(es.doldurulan + '+' + es.yeni + ' eşleştirme satırı');

  // ---------- ADIM 3: bekleyen alışlar ----------
  R.push('');
  R.push('── 3. BEKLEYEN ALIŞLAR ──');
  var bek = ajBekleyen_(ss);
  Object.keys(bek.durum).forEach(function (d) { R.push('   ' + d + ': ' + bek.durum[d]); });
  if (bek.eslesmeyen.length) {
    R.push('   Eşleşmeyen farklı ürün: ' + bek.eslesmeyen.length);
    bek.eslesmeyen.slice(0, 10).forEach(function (u) { R.push('      ' + u); });
  }
  if (!AJ.KURU && bek.toplam && typeof alisIsle === 'function') {
    try {
      var s = alisIsle();
      R.push('   → alisIsle çalıştırıldı: ' + JSON.stringify(s));
      yapilan.push('bekleyen alışlar işlendi');
    } catch (e) { R.push('   ! alisIsle hatası: ' + e); }
  }

  // ---------- ADIM 4: stok sağlığı ----------
  R.push('');
  R.push('── 4. STOK ──');
  var st = ajStok_(ss, katalog);
  R.push('Stok satırı: ' + st.satir + ' | eksi stoklu: ' + st.eksi);
  R.push('Uzun adla tutulan (kısa ada taşınmalı): ' + st.uzunAdli);
  if (st.eksiler.length) {
    R.push('   En büyük eksiler:');
    st.eksiler.slice(0, 10).forEach(function (e) { R.push('      ' + e.ad + ' (' + e.sube + '): ' + e.m); });
  }

  // ---------- Soruları yaz ----------
  if (!AJ.KURU && yeniSorular.length) {
    ajSorulariYaz_(ss, yeniSorular.slice(0, AJ.SORU_LIMIT));
    yapilan.push(Math.min(yeniSorular.length, AJ.SORU_LIMIT) + ' yeni soru');
  }

  // ---------- Özet ----------
  R.push('');
  R.push('── ÖZET ──');
  if (yapilan.length) R.push('Yapılanlar: ' + yapilan.join(' · '));
  else R.push('Değişiklik yapılmadı' + (AJ.KURU ? ' (kuru mod)' : ''));

  var bekleyenSoru = yeniSorular.length + sorular.acik;
  if (bekleyenSoru) {
    R.push('SENDEN BEKLENEN: ' + Math.min(yeniSorular.length, AJ.SORU_LIMIT) + ' yeni + ' +
           sorular.acik + ' eski = ' + bekleyenSoru + ' soru');
    R.push('→ "' + AJ.SORULAR + '" sekmesinde "Cevabın" sütununu doldur, sonra tekrar çalıştır.');
  } else {
    R.push('Bekleyen soru yok.');
  }

  Logger.log(R.join('\n'));
  return R.join('\n');
}

/* ============================================================
 * KATALOG
 * ============================================================ */
function ajKatalogOku_(ss) {
  var hepsi = [], bosOlanlar = [], kisaAdlar = [];
  AJ.TABLOLAR.forEach(function (t) {
    var sh = ss.getSheetByName(t.ad);
    if (!sh || sh.getLastRow() < 2) return;
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
    v.forEach(function (r, i) {
      var uzun = String(r[1] || '').trim();
      var kisa = String(r[2] || '').trim();
      if (!uzun) return;
      hepsi.push({ tablo: t.ad, tip: t.tip, satir: i + 2, uzun: uzun, kisa: kisa });
      if (kisa) {
        if (!kisaAdlar.some(function (x) { return x.ad === kisa; }))
          kisaAdlar.push({ ad: kisa, kelimeler: ajKelime_(kisa) });
      } else {
        bosOlanlar.push({ tablo: t.ad, tip: t.tip, satir: i + 2, uzun: uzun });
      }
    });
  });
  return { hepsi: hepsi, bosOlanlar: bosOlanlar, kisaAdlar: kisaAdlar };
}

function ajKisaAdYaz_(ss, liste) {
  var grup = {};
  liste.forEach(function (o) { (grup[o.tablo] = grup[o.tablo] || []).push(o); });
  Object.keys(grup).forEach(function (tablo) {
    var sh = ss.getSheetByName(tablo);
    grup[tablo].forEach(function (o) { sh.getRange(o.satir, 3).setValue(o.kisa); });
  });
}

/* ============================================================
 * EŞLEŞTİRME
 * ============================================================ */
function ajEslestirme_(ss, kuru) {
  var esl = {};
  AJ.TABLOLAR.forEach(function (t) {
    var sh = ss.getSheetByName(t.ad);
    if (!sh || sh.getLastRow() < 2) return;
    var gen = Math.max(sh.getLastColumn(), 16);
    sh.getRange(2, 1, sh.getLastRow() - 1, gen).getValues().forEach(function (r) {
      var uzun = String(r[1] || '').trim(), kisa = String(r[2] || '').trim();
      if (!uzun || !kisa) return;
      var key = ajNorm_(uzun);
      if (esl[key]) return;
      var koli = Number(r[15]) || 0, birim = Number(r[7]) || 0;
      esl[key] = { uzun: uzun, kisa: kisa, ted: String(r[3] || '').trim(),
                   carpan: koli > 0 ? koli : (birim > 0 ? birim : 1), tip: t.tip };
    });
  });

  var sh = ss.getSheetByName(AJ.ESLESME);
  if (!sh) return { doldurulan: 0, yeni: 0, bos: 0 };
  var son = sh.getLastRow();
  var mevcut = son > 1 ? sh.getRange(2, 1, son - 1, 7).getValues() : [];
  var idx = {};
  mevcut.forEach(function (r, i) { var k = ajNorm_(r[0]); if (k) idx[k] = i; });

  var dolan = 0, yeni = [];
  Object.keys(esl).forEach(function (k) {
    var o = esl[k], i = idx[k];
    if (i === undefined) { yeni.push([o.uzun, o.kisa, o.carpan, '', o.ted, o.tip, '']); return; }
    if (String(mevcut[i][1] || '').trim()) return;
    mevcut[i][1] = o.kisa; mevcut[i][2] = o.carpan;
    if (!String(mevcut[i][5] || '').trim()) mevcut[i][5] = o.tip;
    if (!String(mevcut[i][4] || '').trim()) mevcut[i][4] = o.ted;
    dolan++;
  });

  var bos = mevcut.filter(function (r) {
    return String(r[0] || '').trim() && !String(r[1] || '').trim();
  }).length;

  if (!kuru) {
    if (mevcut.length) sh.getRange(2, 1, mevcut.length, 7).setValues(mevcut);
    if (yeni.length) sh.getRange(sh.getLastRow() + 1, 1, yeni.length, 7).setValues(yeni);
  }
  return { doldurulan: dolan, yeni: yeni.length, bos: bos };
}

/* ============================================================
 * BEKLEYEN ALIŞLAR
 * ============================================================ */
function ajBekleyen_(ss) {
  var sh = ss.getSheetByName(AJ.BEKLEYEN);
  var sonuc = { toplam: 0, durum: {}, eslesmeyen: [] };
  if (!sh || sh.getLastRow() < 2) return sonuc;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  var u = {};
  v.forEach(function (r) {
    sonuc.toplam++;
    var d = String(r[5] || '').trim() || '(boş)';
    sonuc.durum[d] = (sonuc.durum[d] || 0) + 1;
    if (d.indexOf('ESLESME_YOK') >= 0) { var a = String(r[3] || '').trim(); if (a) u[a] = 1; }
  });
  sonuc.eslesmeyen = Object.keys(u);
  return sonuc;
}

/* ============================================================
 * STOK SAĞLIĞI
 * ============================================================ */
function ajStok_(ss, katalog) {
  var sh = ss.getSheetByName(AJ.STOK);
  var sonuc = { satir: 0, eksi: 0, uzunAdli: 0, eksiler: [] };
  if (!sh || sh.getLastRow() < 2) return sonuc;

  var uzunSet = {};
  katalog.hepsi.forEach(function (u) { uzunSet[ajNorm_(u.uzun)] = true; });

  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    var ad = String(r[0] || '').trim();
    if (!ad) return;
    sonuc.satir++;
    var m = Number(r[3]) || 0;
    if (m < 0) { sonuc.eksi++; sonuc.eksiler.push({ ad: ad, sube: r[2], m: Math.round(m * 100) / 100 }); }
    if (uzunSet[ajNorm_(ad)]) sonuc.uzunAdli++;
  });
  sonuc.eksiler.sort(function (a, b) { return a.m - b.m; });
  return sonuc;
}

/* ============================================================
 * SORULAR
 * ============================================================ */
function ajSorularOku_(ss) {
  var sonuc = { soruldu: {}, cevaplanmis: {}, acik: 0, sh: null, satirlar: [] };
  var sh = ss.getSheetByName(AJ.SORULAR);
  if (!sh || sh.getLastRow() < 2) return sonuc;
  sonuc.sh = sh;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  v.forEach(function (r, i) {
    var konu = String(r[1] || '').trim();
    if (!konu) return;
    var k = ajNorm_(konu);
    sonuc.soruldu[k] = true;
    var cevap = String(r[5] || '').trim();
    var durum = String(r[6] || '').trim();
    if (cevap && !durum) sonuc.satirlar.push({ satir: i + 2, konu: konu, tablo: String(r[2] || '').trim(), cevap: cevap });
    if (cevap) sonuc.cevaplanmis[k] = cevap;
    if (!cevap) sonuc.acik++;
  });
  return sonuc;
}

function ajCevaplariUygula_(ss, sorular, R) {
  if (!sorular.satirlar.length) return 0;
  R.push('── 0. CEVAPLARIN ──');
  R.push('Uygulanacak cevap: ' + sorular.satirlar.length);
  if (AJ.KURU) {
    sorular.satirlar.slice(0, 10).forEach(function (s) { R.push('   ' + s.konu + '  →  ' + s.cevap); });
    R.push('');
    return 0;
  }

  var n = 0;
  sorular.satirlar.forEach(function (s) {
    var cevap = s.cevap;
    var hedefTablo = s.tablo;
    var sh = ss.getSheetByName(hedefTablo);
    if (!sh) return;
    var son = sh.getLastRow();
    var v = sh.getRange(2, 2, son - 1, 1).getValues();
    for (var i = 0; i < v.length; i++) {
      if (ajNorm_(v[i][0]) === ajNorm_(s.konu)) {
        var yn = cevap.toUpperCase();
        if (yn.indexOf('YOK SAY') === 0 || yn.indexOf('YOKSAY') === 0) {
          sh.getRange(i + 2, 3).setValue('YOK SAY');
        } else {
          sh.getRange(i + 2, 3).setValue(cevap);
        }
        n++;
        break;
      }
    }
    sorular.sh.getRange(s.satir, 7).setValue('Uygulandı ' +
      Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM HH:mm'));
  });
  R.push('Uygulandı: ' + n);
  R.push('');
  return n;
}

function ajSorulariYaz_(ss, satirlar) {
  var sh = ss.getSheetByName(AJ.SORULAR);
  if (!sh) {
    sh = ss.insertSheet(AJ.SORULAR);
    sh.getRange(1, 1, 1, 7).setValues([[
      'Soru', 'Konu (faturadaki ad)', 'Tablo', 'Ajanın tahmini', 'Güven %', 'Cevabın', 'Durum'
    ]]).setFontWeight('bold').setBackground('#1F4E78').setFontColor('white');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 230); sh.setColumnWidth(2, 300); sh.setColumnWidth(6, 180);
  }
  sh.getRange(sh.getLastRow() + 1, 1, satirlar.length, 7).setValues(satirlar);
}

/* ============================================================
 * ÖNERİ MOTORU
 * ============================================================ */
function ajOneri_(fatura, kisaAdlar) {
  var fk = ajKelime_(fatura);
  var enIyi = null, skor = 0;
  kisaAdlar.forEach(function (k) {
    var s = ajSkor_(fk, k.kelimeler);
    if (s > skor) { skor = s; enIyi = k.ad; }
  });
  return { ad: enIyi || '', skor: skor };
}

function ajKelime_(s) {
  var t = String(s).toUpperCase()
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]+/g, ' ');
  t = t.replace(/(\d)([A-Z])/g, '$1 $2').replace(/([A-Z])(\d)/g, '$1 $2');
  return t.split(' ').filter(function (w) {
    if (w.length < 3) return false;
    if (/^\d+$/.test(w)) return false;
    return AJ_COP.indexOf(w) < 0;
  });
}

function ajSkor_(fk, kk) {
  if (!kk.length || !fk.length) return 0;
  var e = 0;
  kk.forEach(function (k) {
    var b = fk.some(function (f) {
      if (f === k) return true;
      if (k.length >= 4 && f.indexOf(k) === 0) return true;
      if (f.length >= 4 && k.indexOf(f) === 0) return true;
      return false;
    });
    if (b) e++;
  });
  if (!e) return 0;
  var oran = e / kk.length * 100;
  if (kk.length === 1 && fk.length > 3) oran -= 15;
  return oran;
}

function ajNorm_(s) {
  return String(s).replace(/\s+/g, '').toUpperCase()
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C');
}

/* ============================================================
 * GECELİK ÇALIŞMA
 * ============================================================ */
function ajanTetikleyiciKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'ajanGecelik') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('ajanGecelik').timeBased().atHour(5).nearMinute(0).everyDays(1).create();
  Logger.log('Ajan her gece 05:00\'te çalışacak.');
}

function ajanGecelik() {
  var eski = AJ.KURU;
  AJ.KURU = false;
  var rapor;
  try { rapor = ajanCalistir(); } finally { AJ.KURU = eski; }
  try {
    MailApp.sendEmail({
      to: 'mertharman@gmail.com',
      subject: '🤖 BAP Stok Ajanı — gecelik rapor',
      body: rapor
    });
  } catch (e) { Logger.log('Mail hatası: ' + e); }
}