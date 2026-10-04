/**
 * ============================================================
 *  BİLDİRİM + NÖBETÇİ
 *  Apps Script projesine YENİ DOSYA olarak ekle (adı: Bildirim)
 * ------------------------------------------------------------
 *  Tek kapı: _bildir() hem e-posta atar hem (açıkken) WhatsApp
 *  webhook'una yollar. Kullananlar:
 *    - doPost tur:'alarm'  -> MacBook'tan gelen kurye geç kalma uyarısı
 *    - nobetci()           -> veri akışı durdu mu (saatte bir)
 *
 *  KURULUM
 *    1) BILDIRIM_MAIL'i kontrol et
 *    2) nobetciKur() bir kez çalıştır
 *    3) Meta şablonu onaylanınca BILDIRIM_WP = true yap + yeni sürüm dağıt
 * ============================================================
 */

var BILDIRIM_MAIL = 'mertharman@gmail.com';
var BILDIRIM_HOOK = 'https://hook.eu1.make.com/vpgqfj34j52xk5szvx79rbse69o3uxs6';
var BILDIRIM_WP   = false;   // Meta şablonu onaylanınca true

/**
 * Tek bildirim kapısı. E-posta her zaman gider (bedava, Make operasyonu yok).
 * WhatsApp yalnız BILDIRIM_WP açıkken — şablon onaylanmadan gönderirsen
 * 24 saat kuralına takılır ve Make başarılı gösterse bile mesaj ulaşmaz.
 */
function _bildir(tip, baslik, mesaj) {
  var sonuc = { mail: false, wp: false };

  try {
    MailApp.sendEmail({
      to: BILDIRIM_MAIL,
      subject: 'BAP · ' + baslik,
      body: mesaj + '\n\n— Kurye veri hattı · ' + _simdiTr()
    });
    sonuc.mail = true;
  } catch (e) {
    Logger.log('E-posta gönderilemedi: ' + e.message);
  }

  if (BILDIRIM_WP && BILDIRIM_HOOK) {
    try {
      var r = UrlFetchApp.fetch(BILDIRIM_HOOK, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ tip: tip, baslik: baslik, mesaj: mesaj,
                                  zaman: _simdiTr() }),
        muteHttpExceptions: true
      });
      sonuc.wp = (r.getResponseCode() === 200);
    } catch (e) {
      Logger.log('Webhook gönderilemedi: ' + e.message);
    }
  }

  Logger.log('bildirim [' + baslik + '] mail:' + sonuc.mail + ' wp:' + sonuc.wp);
  return sonuc;
}

function _simdiTr() {
  return Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm');
}

/** Aynı uyarıyı sık sık tekrarlamamak için. true dönerse gönder. */
function _bildirimTekrar(anahtar, dakika) {
  var p = PropertiesService.getScriptProperties();
  var k = 'BILDIRIM_' + anahtar;
  var son = Number(p.getProperty(k) || 0);
  if (Date.now() - son < dakika * 60000) return false;
  p.setProperty(k, String(Date.now()));
  return true;
}

/* ==================== NÖBETÇİ ====================
 * MacBook durursa bunu MacBook haber veremez. Kontrolü bulut yapar.
 */
var NOBET_ESIK = 90;   // dakika: bu kadar süredir veri gelmiyorsa uyar
var NOBET_BAS  = 10;   // kontrol penceresi: 10:00'dan
var NOBET_BIT  = 2;    // ertesi gün 02:59'a kadar

function nobetci() {
  var saat = Number(Utilities.formatDate(new Date(), TZ, 'H'));
  if (!(saat >= NOBET_BAS || saat <= NOBET_BIT)) return;   // gece/sabah sessiz

  var p = PropertiesService.getScriptProperties();
  var son = p.getProperty('KOPRU_SON');
  var dk = son ? Math.round((Date.now() - new Date(son).getTime()) / 60000) : 99999;
  var sonMetin = son ? Utilities.formatDate(new Date(son), TZ, 'dd.MM.yyyy HH:mm') : 'hiç';

  if (dk > NOBET_ESIK) {
    if (_bildirimTekrar('nobet', 180)) {
      _bildir('sistem', 'Kurye veri akışı durdu',
        'Son veri alımı: ' + sonMetin + ' — ' + dk + ' dakika önce.\n\n' +
        'Muhtemel sebep: MacBook uyudu, kapandı ya da internet yok.\n\n' +
        'Kontrol sırası:\n' +
        '1. Mac açık mı, kapağı açık mı, fişte mi\n' +
        '2. İnternet var mı\n' +
        '3. Terminal: tail -20 ~/bap-kopru/kopru.log\n\n' +
        'Acil durumda yedek yol: tabloda Kurye Sistemi → Köprü Kodunu Al');
      p.setProperty('NOBET_DURUM', 'durdu');
    }
  } else if (p.getProperty('NOBET_DURUM') === 'durdu') {
    p.setProperty('NOBET_DURUM', 'akiyor');
    p.deleteProperty('BILDIRIM_nobet');
    _bildir('sistem', 'Veri akışı geri geldi',
      'Son veri alımı ' + dk + ' dakika önce. Sistem normale döndü, bir şey yapmana gerek yok.');
  }
}

function nobetciKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'nobetci') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('nobetci').timeBased().everyHours(1).create();
  Logger.log('Nöbetçi kuruldu — saatte bir kontrol, 90 dakika sessizlikte uyarır.');
}

/** Bildirim hattını dene: sana bir test e-postası gelmeli. */
function bildirimDene() {
  var s = _bildir('test', 'Bildirim testi',
    'Bu bir testtir. Bunu okuyorsan e-posta kanalı çalışıyor.\n' +
    'WhatsApp kanalı: ' + (BILDIRIM_WP ? 'açık' : 'kapalı (şablon onayı bekliyor)'));
  Logger.log(JSON.stringify(s));
}