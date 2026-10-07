/**
 * Pluxee gün sonu hareketleri (MacBook pluxee.mjs → doPost tur 'pluxee') → 'Pluxee' sekmesi; RRN ile tekrar ayıklanır.
 * Kurye projesindeki Pluxee.gs v2.1'den taşındı (06.10.2026). SMS kodu: Kod Kutusu.gs (kaynak 'pluxee').
 */

var PLUXEE_SEKME  = 'Pluxee';
var PLUXEE_BASLIK = ['İşlem Zamanı', 'Tutar (TL)', 'Servis', 'Gün Sonu Zamanı', 'Gün Sonu No', 'RRN', 'Terminal No'];

/* ======================= 1) GÜN SONU VERİSİ ======================= */

function _pluxeeSekme() {
  var ss = ykTablo_();
  var sh = ss.getSheetByName(PLUXEE_SEKME);
  if (!sh) {
    sh = ss.insertSheet(PLUXEE_SEKME);
    sh.getRange(1, 1, 1, PLUXEE_BASLIK.length).setValues([PLUXEE_BASLIK])
      .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 150);
    sh.setColumnWidth(4, 150);
    sh.setColumnWidth(6, 130);
  }
  // v2.1: eski sekmeye Terminal No başlığı
  if (String(sh.getRange(1, 7).getValue()).trim() !== 'Terminal No') {
    sh.getRange(1, 7).setValue('Terminal No')
      .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  }
  sh.getRange(2, 7, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
  // 05.10.2026: yeni tabloda zaman tarih olarak saklanıyor; saat görünsün (panel açık hesap kontrolü saatle eşler)
  sh.getRange(2, 1, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('dd.MM.yyyy HH:mm');
  return sh;
}

/**
 * satirlar: [[islemZamani, tutar, servis, gunSonuZamani, gunSonuNo, rrn, terminalNo], ...]
 * Döner: {eklenen, atlanan, terminalDolduruldu, toplam}
 */
/** RRN karşılaştırması: baştaki sıfırları ve ".0" kuyruğunu at (Sheets sayıya çeviriyor). */
function _rrnNorm(v) {
  return String(v == null ? '' : v).trim().replace(/\.0+$/, '').replace(/^0+/, '');
}

function pluxeeYaz(satirlar) {
  if (!satirlar || !satirlar.length) return { eklenen: 0, atlanan: 0, terminalDolduruldu: 0, toplam: 0 };

  var sh = _pluxeeSekme();
  var sonSatir = sh.getLastRow();

  var mevcut = {}, eskiTerm = {};
  if (sonSatir > 1) {
    var eski = sh.getRange(2, 6, sonSatir - 1, 2).getValues();
    for (var i = 0; i < eski.length; i++) {
      var a = _rrnNorm(eski[i][0]);
      if (!a || mevcut[a]) continue;
      mevcut[a] = i + 2;
      eskiTerm[i + 2] = String(eski[i][1] || '').trim();
    }
  }

  var yeni = [], atlanan = 0, dolduruldu = 0;
  for (var j = 0; j < satirlar.length; j++) {
    var s = satirlar[j];
    var rrn = _rrnNorm(s[5]);
    var term = String(s[6] || '').trim();
    var anahtar = rrn || (String(s[0]) + '|' + String(s[1]));

    if (mevcut[anahtar]) {
      atlanan++;
      var r = mevcut[anahtar];
      if (r > 1 && term && !eskiTerm[r]) {
        sh.getRange(r, 7).setValue(term);
        eskiTerm[r] = term;
        dolduruldu++;
      }
      continue;
    }
    mevcut[anahtar] = -1;
    yeni.push([s[0], Number(s[1]) || 0, s[2], s[3], s[4], rrn, term]);
  }

  if (yeni.length) {
    sh.getRange(sh.getLastRow() + 1, 1, yeni.length, PLUXEE_BASLIK.length).setValues(yeni);
    sh.getRange(2, 2, sh.getLastRow() - 1, 1).setNumberFormat('#,##0.00');
  }

  return { eklenen: yeni.length, atlanan: atlanan, terminalDolduruldu: dolduruldu,
           toplam: sh.getLastRow() - 1 };
}
