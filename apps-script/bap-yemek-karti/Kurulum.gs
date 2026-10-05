/**
 * kurulum() — BİR KEZ çalıştır (izinleri ister: Gmail, tablolar, dış bağlantı).
 * Tetikleyiciler: payeMailCek her gün 02:30 ve 09:30, setcardCek saatte bir. Sonra her birini bir kez dener ve sonucu günlüğe yazar.
 * Tekrar çalıştırmak zararsız: önce eski tetikleyicileri siler, yeniden kurar.
 */
function kurulum() {
  var ad = ['payeMailCek', 'setcardCek'];
  ScriptApp.getProjectTriggers().filter(function (t) { return ad.indexOf(t.getHandlerFunction()) >= 0; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('payeMailCek').timeBased().atHour(2).nearMinute(30).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('payeMailCek').timeBased().atHour(9).nearMinute(30).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('setcardCek').timeBased().everyHours(1).create();
  Logger.log('Tetikleyiciler: payeMailCek 02:30 + 09:30, setcardCek saatte bir');
  try { Logger.log('Paye: ' + JSON.stringify(payeMailCek())); } catch (e) { Logger.log('Paye HATA: ' + e.message); }
  try { Logger.log('SetCard: ' + JSON.stringify(setcardCek())); } catch (e) { Logger.log('SetCard HATA: ' + e.message); }
  try { Logger.log('SetCard fatura: ' + JSON.stringify(setcardFaturaKuru())); } catch (e) { Logger.log('SetCard fatura HATA: ' + e.message); }
}
