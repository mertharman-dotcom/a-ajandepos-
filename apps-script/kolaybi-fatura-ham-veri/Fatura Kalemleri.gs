// ============================================================
// KOLAYBİ FATURA HAM VERİ — KALEM AYIRMA + ÜRÜN LİSTESİ v2
// ------------------------------------------------------------
// Bu dosya "duzenle" scriptinin ve eski "kalemleriAyir" dosyasının YERİNE geçer
// (ikisini de sil). Şube tespiti dosyası (subeDoldur / kbToken_) olduğu gibi kalır.
//
// AKIŞ
//   Sayfa1 (Make'in yazdığı ham fatura satırları, dokunulmaz)
//     → kalemleriAyir(): yeni faturaları kalemlere böler, HARİÇ listesindekileri atlar,
//       Fatura_Kalemleri'ne EKLER (mevcut satırlar, Şube ve Stoga_Islendi korunur)
//     → subeDoldur(): şubeleri doldurur
//     → urunListesiOlustur(): Fatura_Kalemleri'nden Urun_Listesi'ni yeniden üretir
//
// HARİÇ TUTMA
//   "Haric_Kalemler" sekmesi A sütunundaki kelimeler (yoksa aşağıdaki VARSAYILAN_HARIC)
//   kalem adında geçiyorsa o kalem yazılmaz. Atlanan kalemler "Haric_Log" sekmesine düşer
//   ki yanlışlıkla gerçek bir ürünü elemediğini görebilesin. Faturanın bütün kalemleri
//   hariçse fatura hiç yazılmaz.
// ============================================================

var KAYNAK_SEKME = 'Sayfa1';
var KALEM_SEKME  = 'Fatura_Kalemleri';
var URUN_SEKME   = 'Urun_Listesi';
var HARIC_SEKME  = 'Haric_Kalemler';
var HARIC_LOG    = 'Haric_Log';

// Haric_Kalemler sekmesi yoksa kullanılan liste (kalem adında GEÇİYORSA elenir)
var VARSAYILAN_HARIC = [
  'yükleme bedeli', 'yukleme bedeli', 'nakliye', 'kargo', 'taşıma bedeli', 'hizmet bedeli',
  'yuvarlama', 'iskonto', 'indirim', 'komisyon', 'ayrıştırılamadı'
];

var KALEM_BASLIK = ['Fatura_No', 'Tarih', 'Tedarikçi', 'Ürün (Hammadde)', 'Adet', 'Birim Fiyat',
  'Kalem Tutarı (KDV hariç)', 'Fatura Tutarı (KDV dahil)', 'Şube', 'Kalem Toplamı (kontrol)', 'Stoga_Islendi'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('BAP Fatura')
    .addItem('Yeni faturaları kalemlere ayır', 'kalemleriAyir')
    .addItem('Ürün listesini yenile', 'urunListesiOlustur')
    .addSeparator()
    .addItem('Hariç kalemleri Fatura_Kalemleri\'nden temizle', 'haricKalemleriTemizle')
    .addItem('Hariç listesi sekmesini oluştur', 'haricSekmesiOlustur')
    .addSeparator()
    .addItem('Tetikleyici kur (00:10 ve 14:10)', 'tetikleyiciKur')
    .addToUi();
}

// ==========================================
// 1. KALEMLERE AYIR (artımlı)
// ==========================================

function kalemleriAyir() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kaynak = ss.getSheetByName(KAYNAK_SEKME) || ss.getSheets()[0];
  var hedef = ss.getSheetByName(KALEM_SEKME);
  if (!hedef) {
    hedef = ss.insertSheet(KALEM_SEKME);
    hedef.appendRow(KALEM_BASLIK);
    hedef.getRange(1, 1, 1, KALEM_BASLIK.length).setFontWeight('bold');
    hedef.setFrozenRows(1);
  }
  var haric = fk_haricListesi(ss);

  // daha önce yazılmış faturalar
  var islenmis = {};
  var son = hedef.getLastRow();
  if (son > 1) {
    hedef.getRange(2, 1, son - 1, 1).getValues().forEach(function (r) {
      if (r[0] !== '') islenmis[String(r[0]).replace(/\.0$/, '').trim()] = true;
    });
  }

  var data = kaynak.getDataRange().getValues();
  if (data.length < 2) return;
  var kol = fk_kaynakKolonlari(data[0]);

  var yeni = [], atlanan = [], gorulen = {}, faturaSayisi = 0;
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var fno = String(r[kol.no] || '').replace(/\.0$/, '').trim();
    var icerik = String(r[kol.icerik] || '').trim();
    if (!fno || !icerik || islenmis[fno] || gorulen[fno]) continue;
    gorulen[fno] = true;

    var tarih = fk_tarih(r[kol.tarih]);
    var ted = String(r[kol.gonderen] || '').trim();
    var tutarKdvli = fk_sayi(r[kol.tutar]);
    var sube = kol.sube >= 0 ? (r[kol.sube] || '') : '';

    var kalemler = fk_parcala(icerik);
    var kalan = [];
    kalemler.forEach(function (k) {
      var neden = fk_haricMi(k.ad, haric);
      if (neden) atlanan.push([new Date(), fno, tarih, ted, k.ad, k.miktar, k.fiyat, neden]);
      else kalan.push(k);
    });
    if (!kalan.length) continue;                       // faturanın tamamı hariç → hiç yazma
    faturaSayisi++;

    var toplam = 0;
    kalan.forEach(function (k) { toplam += k.toplam; });
    kalan.forEach(function (k) {
      yeni.push([fno, tarih, ted, k.ad, k.miktar, k.fiyat, k.toplam, tutarKdvli || '', sube, fk_r2(toplam), '']);
    });
  }

  if (yeni.length) {
    var ilk = hedef.getLastRow() + 1;
    var gereken = ilk + yeni.length - 1;
    if (gereken > hedef.getMaxRows()) hedef.insertRowsAfter(hedef.getMaxRows(), gereken - hedef.getMaxRows());
    hedef.getRange(ilk, 1, yeni.length, KALEM_BASLIK.length).setValues(yeni);
    hedef.getRange(ilk, 2, yeni.length, 1).setNumberFormat('dd.MM.yyyy HH:mm');
    hedef.getRange(ilk, 5, yeni.length, 3).setNumberFormat('#,##0.00');
    hedef.getRange(ilk, 8, yeni.length, 1).setNumberFormat('#,##0.00');
    hedef.getRange(ilk, 10, yeni.length, 1).setNumberFormat('#,##0.00');
  }
  fk_haricLogYaz(ss, atlanan);
  Logger.log('Yeni: ' + faturaSayisi + ' fatura, ' + yeni.length + ' kalem. Hariç tutulan: ' + atlanan.length);

  var subeAtla = (typeof EK_SUBE_ATLA !== 'undefined' && EK_SUBE_ATLA);   // toplu içe aktarmada şube sorgusu yapılmaz
  if (!subeAtla) { try { if (typeof subeDoldur === 'function') subeDoldur(); } catch (e) { Logger.log('subeDoldur hatası: ' + e); } }
  urunListesiOlustur(true);
  fk_uyar('Bitti: ' + faturaSayisi + ' yeni fatura → ' + yeni.length + ' kalem eklendi. ' +
          atlanan.length + ' kalem hariç tutuldu (' + HARIC_LOG + ' sekmesi).');
}

// ==========================================
// 2. ÜRÜN LİSTESİ (Fatura_Kalemleri'nden)
// ==========================================

/** Ürün adına göre gruplar; aynı ürün birden fazla tedarikçiden alındıysa son alımın tedarikçisi yazılır. */
function urunListesiOlustur(sessiz) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ks = ss.getSheetByName(KALEM_SEKME);
  if (!ks || ks.getLastRow() < 2) { fk_uyar(KALEM_SEKME + ' boş'); return; }
  var haric = fk_haricListesi(ss);
  var rows = ks.getRange(2, 1, ks.getLastRow() - 1, 10).getValues();

  var g = {};
  rows.forEach(function (k) {
    var urun = String(k[3] || '').trim();
    var fiyat = fk_sayi(k[5]), adet = fk_sayi(k[4]);
    if (!urun || !(fiyat > 0) || fk_haricMi(urun, haric)) return;
    var tarih = fk_tarih(k[1]);
    var key = fk_norm(urun);
    var o = g[key];
    if (!o) o = g[key] = { urun: urun, ted: '', n: 0, adet: 0, tutar: 0, min: Infinity, max: -Infinity,
                           sonTarih: null, sonFiyat: null, ilkTarih: null, ilkFiyat: null };
    o.n++; o.adet += adet; o.tutar += fk_sayi(k[6]);
    if (fiyat < o.min) o.min = fiyat;
    if (fiyat > o.max) o.max = fiyat;
    if (!o.sonTarih || tarih >= o.sonTarih) { o.sonTarih = tarih; o.sonFiyat = fiyat; o.ted = String(k[2] || '').trim(); o.urun = urun; }
    if (!o.ilkTarih || tarih <= o.ilkTarih) { o.ilkTarih = tarih; o.ilkFiyat = fiyat; }
  });

  var urunler = Object.keys(g).map(function (key) {
    var o = g[key];
    return [o.urun, o.ted, o.sonFiyat, o.sonTarih, o.ilkFiyat, o.min, o.max,
            fk_r2(o.tutar / (o.adet || 1)),
            o.ilkFiyat ? fk_r2((o.sonFiyat - o.ilkFiyat) / o.ilkFiyat * 100) : '',
            o.n, fk_r2(o.adet), fk_r2(o.tutar)];
  }).sort(function (a, b) { return a[0].localeCompare(b[0], 'tr'); });

  var us = ss.getSheetByName(URUN_SEKME) || ss.insertSheet(URUN_SEKME);
  us.clearContents();
  var baslik = ['Ürün (Hammadde)', 'Tedarikçi (son alım)', 'Son Fiyat', 'Son Alım Tarihi', 'İlk Fiyat', 'Min Fiyat', 'Max Fiyat',
    'Ort. Fiyat (ağırlıklı)', 'Fiyat Değişimi %', 'Alım Sayısı', 'Toplam Adet', 'Toplam Tutar (KDV hariç)'];
  us.getRange(1, 1, 1, baslik.length).setValues([baslik]).setFontWeight('bold');
  if (urunler.length) {
    if (us.getMaxRows() < urunler.length + 1) us.insertRowsAfter(us.getMaxRows(), urunler.length + 1 - us.getMaxRows());
    us.getRange(2, 1, urunler.length, baslik.length).setValues(urunler);
    us.getRange(2, 4, urunler.length, 1).setNumberFormat('dd.MM.yyyy');
    us.getRange(2, 3, urunler.length, 1).setNumberFormat('#,##0.00');
  }
  us.setFrozenRows(1);
  if (!sessiz) fk_uyar(URUN_SEKME + ' yenilendi: ' + urunler.length + ' ürün.');
}

// ==========================================
// 3. HARİÇ LİSTESİ
// ==========================================

function fk_haricListesi(ss) {
  var sh = ss.getSheetByName(HARIC_SEKME);
  var liste = [];
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var v = fk_norm(r[0]);
      if (v) liste.push({ ham: String(r[0]).trim(), norm: v });
    });
  }
  if (!liste.length) VARSAYILAN_HARIC.forEach(function (x) { liste.push({ ham: x, norm: fk_norm(x) }); });
  return liste;
}

/** Kalem adı hariç listesindeki bir kelimeyi içeriyorsa eşleşen kelimeyi, değilse '' döner. */
function fk_haricMi(ad, liste) {
  var n = fk_norm(ad);
  if (!n) return '';
  for (var i = 0; i < liste.length; i++) if (n.indexOf(liste[i].norm) !== -1) return liste[i].ham;
  return '';
}

function haricSekmesiOlustur() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(HARIC_SEKME)) { fk_uyar(HARIC_SEKME + ' zaten var.'); return; }
  var sh = ss.insertSheet(HARIC_SEKME);
  var satirlar = [['Hariç kelime (kalem adında geçerse elenir)', 'Açıklama']];
  VARSAYILAN_HARIC.forEach(function (x) { satirlar.push([x, '']); });
  sh.getRange(1, 1, satirlar.length, 2).setValues(satirlar);
  sh.getRange(1, 1, 1, 2).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 2);
  fk_uyar(HARIC_SEKME + ' oluşturuldu. Kelimeleri buradan düzenleyebilirsin; büyük/küçük harf ve Türkçe karakter fark etmez.');
}

/** Daha önce yazılmış hariç kalemleri Fatura_Kalemleri'nden siler (Haric_Log'a kaydeder), sonra ürün listesini yeniler. */
function haricKalemleriTemizle() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ks = ss.getSheetByName(KALEM_SEKME);
  if (!ks || ks.getLastRow() < 2) return;
  var haric = fk_haricListesi(ss);
  var rows = ks.getRange(2, 1, ks.getLastRow() - 1, KALEM_BASLIK.length).getValues();
  var kalan = [], atlanan = [], islenmisSilinen = 0;
  rows.forEach(function (r) {
    var neden = fk_haricMi(r[3], haric);
    if (!neden) { kalan.push(r); return; }
    if (String(r[10] || '').trim()) islenmisSilinen++;
    atlanan.push([new Date(), r[0], r[1], r[2], r[3], r[4], r[5], neden + ' (temizlik)']);
  });
  if (!atlanan.length) { fk_uyar('Silinecek hariç kalem yok.'); return; }
  ks.getRange(2, 1, rows.length, KALEM_BASLIK.length).clearContent();
  if (kalan.length) ks.getRange(2, 1, kalan.length, KALEM_BASLIK.length).setValues(kalan);
  fk_haricLogYaz(ss, atlanan);
  urunListesiOlustur(true);
  fk_uyar(atlanan.length + ' hariç kalem silindi, ' + kalan.length + ' kalem kaldı.' +
          (islenmisSilinen ? '\n⚠️ Silinenlerin ' + islenmisSilinen + ' tanesi daha önce stoğa işlenmişti; Stok Takip dosyasında Stok_Hareketleri\'nde bu adlarla açılan satırları elle kontrol et.' : ''));
}

function fk_haricLogYaz(ss, atlanan) {
  if (!atlanan.length) return;
  var sh = ss.getSheetByName(HARIC_LOG);
  if (!sh) {
    sh = ss.insertSheet(HARIC_LOG);
    sh.appendRow(['İşlem Zamanı', 'Fatura_No', 'Fatura Tarihi', 'Tedarikçi', 'Kalem', 'Adet', 'Birim Fiyat', 'Neden']);
    sh.getRange(1, 1, 1, 8).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  sh.insertRowsBefore(2, atlanan.length);
  sh.getRange(2, 1, atlanan.length, 8).setValues(atlanan);
}

// ==========================================
// 4. YARDIMCILAR
// ==========================================

/** Sayfa1 sütunlarını başlıktan bulur; başlık yoksa A..F varsayılır. */
function fk_kaynakKolonlari(baslik) {
  var h = baslik.map(function (x) { return fk_norm(x); });
  function bul(adlar, varsayilan) {
    for (var i = 0; i < adlar.length; i++) { var k = h.indexOf(fk_norm(adlar[i])); if (k >= 0) return k; }
    for (var j = 0; j < h.length; j++) { for (var a = 0; a < adlar.length; a++) if (h[j].indexOf(fk_norm(adlar[a])) === 0) return j; }
    return varsayilan;
  }
  return {
    no: bul(['fatura_no', 'faturano'], 0),
    tarih: bul(['tarih'], 1),
    gonderen: bul(['gönderen', 'gonderen', 'tedarikçi'], 2),
    tutar: bul(['tutar'], 3),
    icerik: bul(['fatura_içeriği', 'fatura_icerigi', 'içerik'], 4),
    sube: bul(['şube', 'sube'], 5)
  };
}

/** "AD-miktarxfiyat" parçalarını çözer; üründeki tireleri korur (son "-sayıx" kalıbını baz alır). */
function fk_parcala(metin) {
  var out = [];
  var s = String(metin || '').replace(/\r/g, '').trim();
  if (!s) return out;
  var parcalar = s.indexOf('\n') > -1 ? s.split('\n') : [s];
  var re = /^(.*?)-(?=\d+(?:[.,]\d+)?\s*[xX])(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)/;
  parcalar.forEach(function (p) {
    p = p.trim();
    while (p.length) {
      var m = re.exec(p);
      if (!m) { if (p) out.push({ ad: p + ' (ayrıştırılamadı)', miktar: 0, fiyat: 0, toplam: 0 }); break; }
      var mik = fk_sayi(m[2]), fyt = fk_sayi(m[3]);
      out.push({ ad: m[1].replace(/\s+/g, ' ').trim(), miktar: mik, fiyat: fyt, toplam: fk_r2(mik * fyt) });
      p = p.substring(m[0].length).trim();
    }
  });
  return out;
}

function fk_tarih(val) {
  if (val instanceof Date) return val;
  if (!val) return new Date();
  var s = String(val).trim();
  var m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  var d = new Date(s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? new Date() : d;
}

/** "1.100,00" / "105,6" / "88" / sayı → number */
function fk_sayi(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return 0;
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function fk_norm(s) {
  return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
    .replace(/[\s.,\-*/()'"&:;!?]/g, '');
}

function fk_r2(x) { return Math.round((Number(x) || 0) * 100) / 100; }

function fk_uyar(msg) {
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* tetikleyiciden çalıştı */ }
}

function tetikleyiciKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'kalemleriAyir') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('kalemleriAyir').timeBased().atHour(0).nearMinute(10).everyDays(1).create();
  ScriptApp.newTrigger('kalemleriAyir').timeBased().atHour(14).nearMinute(10).everyDays(1).create();
  fk_uyar('Tetikleyiciler kuruldu: her gün 00:10 ve 14:10.');
}