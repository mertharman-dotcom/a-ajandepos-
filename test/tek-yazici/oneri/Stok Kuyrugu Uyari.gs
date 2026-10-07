// CANLI: stok kuyruğu uyarıları e-postayla (konu başına saatte en çok bir kez; karar Stok Kuyrugu.gs › sk_uyarilar_).
var SK_UYARI_ALICI = 'mertharman@gmail.com';
function sk_uyariGonder_(konu, metin) {
  MailApp.sendEmail(SK_UYARI_ALICI, '[BAP Stok] ' + konu, metin + '\n\nKuyruk: BAP Stok Takip › Stok_Kuyrugu sekmesi.');
}
