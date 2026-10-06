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
