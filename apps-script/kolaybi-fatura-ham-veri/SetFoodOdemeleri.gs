// ============================================================
// TEK SEFERLİK: Set Food ödemelerini ekstreye göre düzelt
// ------------------------------------------------------------
// Kolaybi Fatura Ham Veri projesine ayrı dosya olarak eklenir (alım paneli API dosyası kalmalı).
// setFoodOdemeleriniDuzelt() çalıştırılır:
//   1) 21.09.2026 tarihli 658.886,56 TL'lik "toplam ödeme" satırını (O26092212581430) siler.
//   2) Set Food cari hesap ekstresindeki (01.01–15.09.2026) 6 kredi kartı ödemesini
//      ödeme tarihleriyle Odemeler sekmesine ekler.
// İki kez çalıştırılırsa aynı ödemeyi tekrar eklemez. İş bitince bu dosya silinebilir.
// ============================================================

var SF_TED = 'SET FOOD GIDA DAĞITIM PAZARLAMA SAN. VE TİC. LTD. ŞTİ.';
var SF_TOPLU_ODEME_ID = 'O26092212581430';
var SF_ODEMELER = [
  ['2026-02-16', 100000, '00000043'],
  ['2026-03-17',  95000, '00000086'],
  ['2026-04-17',  95000, '00000115'],
  ['2026-05-25', 133000, '00000158'],
  ['2026-06-24', 140000, '00000190'],
  ['2026-07-29', 150000, '00000226']
];

function setFoodOdemeleriniDuzelt() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(AP_ODEME);
  var mesaj = [];

  // 1) Tek satırlık toplam ödemeyi sil
  var sil = ap_odemeSil_(SF_TOPLU_ODEME_ID);
  mesaj.push(sil.ok ? '658.886,56 TL tek satır silindi.' : 'Tek satır bulunamadı (daha önce silinmiş olabilir).');

  // 2) Ekstredeki ödemeleri ekle (aynı gün + aynı tutar varsa atla)
  var mevcut = {};
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    if (ap_nrm_(r[2]) !== ap_nrm_(SF_TED)) return;
    mevcut[ap_iso_(ap_tarih_(r[1])) + '|' + ap_r2_(ap_sayi_(r[3]))] = true;
  });
  var eklenen = 0, atlanan = 0;
  SF_ODEMELER.forEach(function (o) {
    if (mevcut[o[0] + '|' + ap_r2_(o[1])]) { atlanan++; return; }
    var s = ap_odemeEkle_({ ted: SF_TED, tarih: o[0], tutar: o[1], yontem: 'Kredi Kartı',
                            not: 'Set Food ekstresi fiş ' + o[2] + ' (K KART ÖDEMESİ)' });
    if (s.ok) eklenen++;
    Utilities.sleep(1100);   // ödeme kimlikleri saniyeye göre üretiliyor, çakışmasın
  });
  mesaj.push(eklenen + ' ödeme eklendi' + (atlanan ? ', ' + atlanan + ' zaten vardı' : '') + '. Toplam 713.000 TL.');

  var m = mesaj.join(' ');
  Logger.log(m);
  try { SpreadsheetApp.getUi().alert(m); } catch (e) {}
}
