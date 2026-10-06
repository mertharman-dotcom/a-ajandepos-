/**
 * Metropol Card POS işlemleri (MacBook metropol.mjs → doPost tur 'metropol') → 'Metropol' sekmesi.
 * Her işlem İşlem No ile bir kez yazılır. 'Kullanıcı' = terminali kullanan kişi (kurye / dükkan), Metropol kullanıcı listesinden.
 * satirlar: [{ zaman: 'GG/AA/YYYY SS:dd:ss', tutar, islemNo, tip, mod, terminal, telefon, kisi, kart, gunsonu, fatura }]
 */
var METROPOL_SEKME = 'Metropol';
var METROPOL_BASLIK = ['İşlem Zamanı', 'Tutar (TL)', 'İşlem Türü', 'Giriş Modu', 'Terminal No', 'Cihaz / Kullanıcı', 'Telefon', 'Kart No', 'İşlem No', 'Gün Sonu', 'Fatura Id', 'Kayıt Zamanı'];

function metropolYaz(satirlar) {
  var ss = ykTablo_(), sh = ss.getSheetByName(METROPOL_SEKME);
  if (!sh) { sh = ss.insertSheet(METROPOL_SEKME); sh.getRange(1, 1, 1, METROPOL_BASLIK.length).setValues([METROPOL_BASLIK]).setFontWeight('bold'); sh.setFrozenRows(1); }
  var cNo = METROPOL_BASLIK.indexOf('İşlem No'), var_ = {};
  if (sh.getLastRow() > 1) {
    var n = Math.min(8000, sh.getLastRow() - 1);
    sh.getRange(sh.getLastRow() - n + 1, cNo + 1, n, 1).getDisplayValues().forEach(function (r) { var k = String(r[0]).replace(/^'/, ''); if (k) var_[k] = 1; });
  }
  // Metropol tarihi GG/AA/YYYY → GG.AA.YYYY (panel bu biçimi okur)
  var z = function (v) { var m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/); return m ? m[1] + '.' + m[2] + '.' + m[3] + m[4] : String(v || ''); };
  var t = function (v) { v = String(v == null ? '' : v).trim(); return v ? "'" + v : ''; };
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss'), yeni = [];
  (satirlar || []).forEach(function (x) {
    var no = String(x && x.islemNo || ''); if (!no || var_[no] || !(Number(x.tutar) > 0)) return; var_[no] = 1;
    yeni.push([t(z(x.zaman)), Number(x.tutar), t(x.tip), t(x.mod), t(x.terminal), t(x.kisi), t(x.telefon), t(x.kart), t(no), t(z(x.gunsonu)), t(x.fatura), damga]);
  });
  if (yeni.length) sh.getRange(sh.getLastRow() + 1, 1, yeni.length, METROPOL_BASLIK.length).setValues(yeni);
  return { ok: true, eklenen: yeni.length, atlanan: (satirlar || []).length - yeni.length };
}
