function hizliYedek() {
  var damga = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyy-MM-dd HH:mm');
  var dosya = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  var klasor;
  try {
    klasor = DriveApp.getFolderById('1GXCIojyM13z01MvSZSgVAA8e92FbbnSe');
  } catch (e) {
    klasor = DriveApp.getRootFolder();
  }
  var kopya = dosya.makeCopy(damga + ' - ARSIV ONCESI - ' + dosya.getName(), klasor);
  Logger.log('Yedek alındı: ' + kopya.getName() + '\n' + kopya.getUrl());
}