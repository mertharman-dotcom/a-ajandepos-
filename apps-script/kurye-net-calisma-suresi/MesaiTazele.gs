/**
 * MesaiTazele.gs — "Kurye Net Çalışma Süresi" tablosunun script projesine YENİ DOSYA olarak eklenir.
 * Mevcut kodun hiçbir satırını değiştirmez; onun yardımcı fonksiyonlarını kullanır
 * (_kuryeAdlari, _siparisOzeti, _mesaiGunu, _mesaiSatiri, _gunler, _isoToTr, kuraliUygula).
 *
 * Neden: mesaiCek() bir günü, o gün HERHANGİ bir kuryenin satırı yazıldıysa bir daha sormaz
 * (yalnız bugün ve dün tazelenir). Kurye HemenYolda'ya sonradan eklenirse ya da oturumu sonradan
 * düzeltilirse o günün satırı hiç oluşmaz (ör. alp 22–23.09, nurullah 15–16.09).
 * Bu dosya verilen günleri kurye kurye yeniden sorar: eksik satırı ekler, değişen satırı günceller,
 * hiçbir satırı silmez. Sonunda kuraliUygula() ile 'Günlük Mesai' tazelenir.
 *
 * Kullanım:
 *   mesaiEylulTazele()          → 01–30.09.2026'yı bir kez geriye dönük tarar (gerekirse tekrar çalıştırın,
 *                                 kaldığı günden devam eder).
 *   mesaiAraligiTazele('2026-09-22', '2026-09-23')  → yalnız istenen günler.
 *   mesaiTazeleTetikleyiciKur() → her gece 04:00'te son 10 günü tazeleyen tetikleyici (bir kez çalıştırın).
 */

var MT_BUTCE_MS = 270000;   // tek çalışmada en fazla ~4,5 dk (Apps Script 6 dk sınırı)

function mesaiAraligiTazele(basIso, bitIso) {
  var props = PropertiesService.getScriptProperties();
  var anahtar = 'MT_DEVAM_' + basIso + '_' + bitIso;
  var gunler = _gunler(basIso, bitIso);
  var devam = props.getProperty(anahtar);
  if (devam) gunler = gunler.filter(function (g) { return g >= devam; });

  var ss = SpreadsheetApp.openById(SS_ID), sh = ss.getSheetByName(SHEET_MESAI);
  if (!sh || sh.getLastRow() < 2) throw new Error("'" + SHEET_MESAI + "' sekmesi yok ya da boş. Önce mesaiCek() çalıştırın.");
  var harita = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues().forEach(function (r, i) {
    var tar = String(r[0]).trim(), ad = String(r[1]).trim(); if (tar && ad) harita[tar + '|' + ad] = i + 2;
  });

  var kuryeler = _kuryeAdlari(), sipOzet = _siparisOzeti();
  var basla = Date.now(), eklenen = 0, guncellenen = 0, islenen = 0, eklenenler = [];
  for (var gi = 0; gi < gunler.length; gi++) {
    if (Date.now() - basla > MT_BUTCE_MS) {
      props.setProperty(anahtar, gunler[gi]);
      Logger.log('Süre doldu: ' + islenen + ' gün işlendi, +' + eklenen + ' eklendi, ' + guncellenen + ' güncellendi. '
        + 'Aynı fonksiyonu tekrar çalıştırın, ' + _isoToTr(gunler[gi]) + ' gününden devam eder.');
      return { tamam: false, eklenen: eklenen, guncellenen: guncellenen, eklenenler: eklenenler };
    }
    var gun = gunler[gi], tr = _isoToTr(gun), yeni = [];
    _mesaiGunu(kuryeler, gun).forEach(function (b) {
      var s = _mesaiSatiri(tr, b, sipOzet[tr + '|' + b.ad]); if (!s) return;
      var satir = harita[tr + '|' + b.ad];
      if (satir) {
        var eski = sh.getRange(satir, 1, 1, MESAI_NCOL).getValues()[0];
        if (eski.join('') !== s.join('')) { sh.getRange(satir, 1, 1, MESAI_NCOL).setValues([s]); guncellenen++; }
      } else { yeni.push(s); }
    });
    if (yeni.length) {
      var ilk = sh.getLastRow() + 1;
      sh.getRange(ilk, 1, yeni.length, MESAI_NCOL).setValues(yeni);
      yeni.forEach(function (r, j) { harita[r[0] + '|' + r[1]] = ilk + j; eklenenler.push(r[0] + ' ' + r[1]); });
      eklenen += yeni.length;
    }
    islenen++;
  }
  props.deleteProperty(anahtar);
  try { kuraliUygula(false); } catch (e) { Logger.log('kuraliUygula atlandı: ' + e.message); }
  Logger.log('TAMAMLANDI: ' + islenen + ' gün, +' + eklenen + ' eklendi, ' + guncellenen + ' güncellendi.'
    + (eklenenler.length ? ' Eklenenler: ' + eklenenler.join(', ') : ''));
  return { tamam: true, eklenen: eklenen, guncellenen: guncellenen, eklenenler: eklenenler };
}

function mesaiEylulTazele() { return mesaiAraligiTazele('2026-09-01', '2026-09-30'); }

/** Gece tetikleyicisi: son 10 günü (bugün hariç) tazeler; sonradan eklenen kurye ya da oturum kaçmaz. */
function mesaiSon10GunTazele() {
  var bit = Utilities.formatDate(new Date(Date.now() - 86400000), TZ, 'yyyy-MM-dd');
  var bas = Utilities.formatDate(new Date(Date.now() - 10 * 86400000), TZ, 'yyyy-MM-dd');
  return mesaiAraligiTazele(bas, bit);
}

function mesaiTazeleTetikleyiciKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'mesaiSon10GunTazele') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('mesaiSon10GunTazele').timeBased().atHour(4).everyDays(1).inTimezone(TZ).create();
  Logger.log('Her gece 04:00 için mesaiSon10GunTazele tetikleyicisi kuruldu.');
}
