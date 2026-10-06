/**
 * Multinet (MacBook multinet.mjs → doPost) — işlemler 'Multinet', faturalar 'Multinet Fatura'.
 * İşlem: Ref (ServerRefNo) ile bir kez yazılır; sonradan iptal edilirse Durum 'İptal' olarak güncellenir.
 * 'Açıklama': 'MultiPOS Satis' = kapıda (kurye terminali); 'Trendyol Satis' / 'Yemek Sepeti Satis' / 'Getir Food Payment' = online.
 * Fatura: Fatura No = KolayBi'deki satış faturası no (EFA…); Durum 'Ödeme Tamamlandı' ise Ödeme Tarihi dolu → Finans alacaktan düşer.
 */
var MULTINET_BASLIK = ['İşlem Zamanı', 'Tutar (TL)', 'Açıklama', 'Durum', 'Terminal No', 'Kart No', 'Ref', 'Kayıt Zamanı'];
var MULTINET_FATURA_BASLIK = ['Fatura No', 'Fatura Tarihi', 'Tutar (TL)', 'Vade', 'Durum', 'Ödeme Tarihi', 'Ürün', 'Son Kontrol'];

function multinetYaz(satirlar) {
  var ss = ykTablo_(), sh = ss.getSheetByName('Multinet');
  if (!sh) { sh = ss.insertSheet('Multinet'); sh.getRange(1, 1, 1, MULTINET_BASLIK.length).setValues([MULTINET_BASLIK]).setFontWeight('bold'); sh.setFrozenRows(1); }
  var cRef = MULTINET_BASLIK.indexOf('Ref'), cDur = MULTINET_BASLIK.indexOf('Durum'), var_ = {};
  if (sh.getLastRow() > 1) {
    var n = Math.min(10000, sh.getLastRow() - 1), ilk = sh.getLastRow() - n + 1;
    sh.getRange(ilk, 1, n, MULTINET_BASLIK.length).getDisplayValues().forEach(function (r, i) { var k = String(r[cRef]).replace(/^'/, ''); if (k) var_[k] = { satir: ilk + i, durum: r[cDur] }; });
  }
  var t = function (v) { v = String(v == null ? '' : v).trim(); return v ? "'" + v : ''; };
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss'), yeni = [], guncel = 0;
  (satirlar || []).forEach(function (x) {
    var ref = String(x && x.ref || ''); if (!ref || !(Number(x.tutar) > 0)) return;
    var v = var_[ref];
    if (v) { if (x.durum === 'İptal' && v.durum !== 'İptal') { sh.getRange(v.satir, cDur + 1).setValue('İptal'); v.durum = 'İptal'; guncel++; } return; }
    var_[ref] = { satir: -1, durum: x.durum };
    yeni.push([t(x.zaman), Number(x.tutar), t(x.aciklama), t(x.durum), t(x.terminal), t(x.kart), t(ref), damga]);
  });
  if (yeni.length) sh.getRange(sh.getLastRow() + 1, 1, yeni.length, MULTINET_BASLIK.length).setValues(yeni);
  return { ok: true, eklenen: yeni.length, iptalGuncel: guncel };
}

function multinetFaturaYaz(faturalar) {
  var ss = ykTablo_(), sh = ss.getSheetByName('Multinet Fatura');
  if (!sh) { sh = ss.insertSheet('Multinet Fatura'); sh.getRange(1, 1, 1, MULTINET_FATURA_BASLIK.length).setValues([MULTINET_FATURA_BASLIK]).setFontWeight('bold'); sh.setFrozenRows(1); }
  var satir = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(function (r, i) { satir[String(r[0]).replace(/^'/, '')] = i + 2; });
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm'), n = 0;
  (faturalar || []).forEach(function (f) {
    var no = String(f && f.no || '').trim(); if (!no) return;
    var r = satir[no] || (satir[no] = sh.getLastRow() + 1);
    sh.getRange(r, 1, 1, MULTINET_FATURA_BASLIK.length).setValues([["'" + no, "'" + (f.tarih || ''), Number(f.tutar) || 0, "'" + (f.vade || ''), f.durum || '', "'" + (f.odeme || ''), f.urun || '', damga]]);
    n++;
  });
  return { ok: true, fatura: n };
}

/* Multinet'te faturalanmayı bekleyen tutar (sitenin "fatura oluştur" ekranındaki özet) → 'Multinet Bekleyen' (tek satır, üzerine yazılır). */
function multinetBekleyenYaz(b) {
  b = b || {};
  var ss = ykTablo_(), sh = ss.getSheetByName('Multinet Bekleyen') || ss.insertSheet('Multinet Bekleyen');
  sh.getRange(1, 1, 2, 4).setValues([['Tutar (TL)', 'İşlem', 'Ürün', 'Güncellendi'], [Number(b.tutar) || 0, Number(b.adet) || 0, String(b.urun || ''), Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm')]]);
  sh.getRange(1, 1, 1, 4).setFontWeight('bold');
  return { ok: true };
}

