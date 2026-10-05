/** Edenred terminal bazlı işlemler (MacBook edenred.mjs → doPost tur 'edenred') → 'Edenred' sekmesi; yalnız yeni satırlar eklenir. */
var EDENRED_BASLIK = ['İşlem Zamanı', 'Tutar (TL)', 'Terminal No', 'Şube', 'Günsonu Zamanı', 'Kart No', 'Kayıt Zamanı'];
// satirlar: [{ zaman: 'dd.MM.yyyy HH:mm:ss', tutar: sayı, terminal, sube, gunsonu, kart }]
function edenredYaz(satirlar) {
  var ss = ykTablo_(), sh = ss.getSheetByName('Edenred');
  if (!sh) { sh = ss.insertSheet('Edenred'); sh.appendRow(EDENRED_BASLIK); sh.setFrozenRows(1); sh.getRange(1, 1, 1, EDENRED_BASLIK.length).setFontWeight('bold'); }
  var anahtar = function (z, t, ter, k) { return [String(z).slice(0, 19), Number(t).toFixed(2), String(ter), String(k)].join('|'); };
  var var_ = {};
  if (sh.getLastRow() > 1) {
    var n = Math.min(6000, sh.getLastRow() - 1);
    sh.getRange(sh.getLastRow() - n + 1, 1, n, 6).getDisplayValues().forEach(function (r) { var_[anahtar(r[0], String(r[1]).replace(/\./g, '').replace(',', '.'), r[2], r[5])] = 1; });
  }
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss'), yeni = [];
  satirlar.forEach(function (x) {
    if (!x || !x.zaman || !(Number(x.tutar) > 0)) return;
    var k = anahtar(x.zaman, x.tutar, x.terminal, x.kart); if (var_[k]) return; var_[k] = 1;
    yeni.push(["'" + x.zaman, Number(x.tutar), "'" + x.terminal, "'" + (x.sube || ''), "'" + (x.gunsonu || ''), "'" + (x.kart || ''), damga]);
  });
  if (yeni.length) sh.getRange(sh.getLastRow() + 1, 1, yeni.length, EDENRED_BASLIK.length).setValues(yeni);
  return { ok: true, eklenen: yeni.length, atlanan: satirlar.length - yeni.length };
}
