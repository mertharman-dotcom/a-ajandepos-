/**
 * Mac programlarının fatura kesim denemeleri (metropol.mjs / multinet.mjs --fatura-kes ve zamanlı kesim) → 'Fatura Kesimleri' sekmesi.
 * doPost tur 'faturaKesim' { kart, sonuc: { kesildi, tarih, mesaj, tutar, vade, kuru } }. Yalnız ekler; panel bugünkü kaydı okur.
 */
var FATURA_KESIM_BASLIK = ['Zaman', 'Kart', 'Sonuç', 'Tutar (TL)', 'Vade', 'Mesaj'];
function faturaKesimYaz(kart, sonuc) {
  sonuc = sonuc || {};
  var ss = ykTablo_(), sh = ss.getSheetByName('Fatura Kesimleri');
  if (!sh) { sh = ss.insertSheet('Fatura Kesimleri'); sh.getRange(1, 1, 1, FATURA_KESIM_BASLIK.length).setValues([FATURA_KESIM_BASLIK]).setFontWeight('bold'); sh.setFrozenRows(1); }
  var durum = sonuc.kuru ? 'Deneme (kesilmedi)' : sonuc.kesildi ? 'Kesildi' : 'Kesilemedi';
  sh.appendRow([Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss'), String(kart || ''), durum, Number(sonuc.tutar) || '', sonuc.vade || '', String(sonuc.mesaj || '').slice(0, 400)]);
  return { ok: true, durum: durum };
}

/* Mac programlarının site oturumu (ör. Metropol robot doğrulamalı giriş) → 'Mac Oturumları' (kart başına tek satır, üzerine yazılır).
 * doPost tur 'oturumDurumu' { kart, acik }. Panel kapalı olanı Yönetim Merkezi'nde uyarır. */
function oturumDurumuYaz(kart, acik) {
  var ss = ykTablo_(), sh = ss.getSheetByName('Mac Oturumları');
  if (!sh) { sh = ss.insertSheet('Mac Oturumları'); sh.getRange(1, 1, 1, 3).setValues([['Kart', 'Durum', 'Zaman']]).setFontWeight('bold'); sh.setFrozenRows(1); }
  var v = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues() : [], r = -1;
  v.forEach(function (x, i) { if (String(x[0]) === String(kart)) r = i + 2; });
  if (r < 0) r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, 3).setValues([[String(kart || ''), acik ? 'Açık' : 'Giriş gerekiyor', Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm')]]);
  return { ok: true };
}
