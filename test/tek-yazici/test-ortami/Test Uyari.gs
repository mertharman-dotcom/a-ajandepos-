// TEST ORTAMI: uyarılar e-posta yerine TEST stok dosyasındaki Test_Uyarilar sekmesine yazılır (gerçek mesaj gönderilmez).
function sk_uyariGonder_(konu, metin) {
  var ss = SpreadsheetApp.openById(STOK_DOSYA_ID), sh = ss.getSheetByName('Test_Uyarilar');
  if (!sh) { sh = ss.insertSheet('Test_Uyarilar'); sh.appendRow(['Zaman', 'Konu', 'Metin']); }
  sh.appendRow([new Date(), konu, metin]);
}
