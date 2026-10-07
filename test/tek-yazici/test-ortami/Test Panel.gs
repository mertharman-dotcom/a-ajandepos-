// TEST ORTAMI — mutfak paneli test projesi. Kod.gs (önerilen panel) değişmeden alınır; yalnız doPost bu kapıdan geçer.
// Tedarikçi siparişi / WhatsApp ile ilgili eylemler test ortamında KAPALI (gerçek sipariş tetiklenmesin).
var TEST_KAPALI = ['siparisKaydet', 'siparisDuzelt', 'siparisWpIsaretle', 'malKabul'];
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (TEST_KAPALI.indexOf(d.action) !== -1) return jsonRes({ basari: false, hata: 'TEST ortamında tedarikçi siparişi kapalı' });
  } catch (x) {}
  return doPost_asil(e);
}
function testYetkiVer() { Logger.log(SpreadsheetApp.openById(SHEET_ID).getName()); }
