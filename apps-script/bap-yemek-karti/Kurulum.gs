/**
 * kurulum() — BİR KEZ çalıştır (izinleri ister: Gmail, tablolar, dış bağlantı).
 * Tetikleyiciler: payeMailCek her gün 02:30 ve 09:30, setcardCek ve tokenflexCek saatte bir. Sonra her birini bir kez dener ve sonucu günlüğe yazar.
 * Tekrar çalıştırmak zararsız: önce eski tetikleyicileri siler, yeniden kurar.
 */
function kurulum() {
  var ad = ['payeMailCek', 'setcardCek', 'tokenflexCek'];
  ScriptApp.getProjectTriggers().filter(function (t) { return ad.indexOf(t.getHandlerFunction()) >= 0; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('payeMailCek').timeBased().atHour(2).nearMinute(30).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('payeMailCek').timeBased().atHour(9).nearMinute(30).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('setcardCek').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('tokenflexCek').timeBased().everyHours(1).create();
  Logger.log('Tetikleyiciler: payeMailCek 02:30 + 09:30, setcardCek ve tokenflexCek saatte bir');
  try { Logger.log('Paye: ' + JSON.stringify(payeMailCek())); } catch (e) { Logger.log('Paye HATA: ' + e.message); }
  try { Logger.log('SetCard: ' + JSON.stringify(setcardCek())); } catch (e) { Logger.log('SetCard HATA: ' + e.message); }
  try { var sf = setcardFaturaKuru(), kes = sf.fatura.filter(function (f) { return f.kesilebilir; });
    Logger.log('SetCard fatura: ' + sf.fatura.length + ' kayıt; kesilebilir: ' + (kes.map(function (f) { return f.takipNo + ' (' + f.tutar + ' TL)'; }).join(', ') || 'yok')); } catch (e) { Logger.log('SetCard fatura HATA: ' + e.message); }
  try { Logger.log('Tokenflex: ' + JSON.stringify(tokenflexCek(31))); } catch (e) { Logger.log('Tokenflex HATA: ' + e.message); }
}
