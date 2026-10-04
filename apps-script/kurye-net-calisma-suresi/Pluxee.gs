/**
 * Pluxee.gs — v2.1 (04.10.2026)
 * 1) Gün sonu hareketlerini "Pluxee" sekmesine yazar (rrn ile mükerrer ayıklama).
 *    v2.1: 7. sütun "Terminal No". Eski satırlarda boşsa sonraki çekimlerde doldurulur.
 * 2) Yedek kod sayfası (?pluxee=1&k=...). Asıl kullanılan link: PluxeeKodSayfa (?sayfa=pluxee).
 */

var PLUXEE_SS_ID  = '1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo';
var PLUXEE_SEKME  = 'Pluxee';
var PLUXEE_BASLIK = ['İşlem Zamanı', 'Tutar (TL)', 'Servis', 'Gün Sonu Zamanı', 'Gün Sonu No', 'RRN', 'Terminal No'];

var PLUXEE_KOD_SEKME     = 'Pluxee Kod';
var PLUXEE_SAYFA_ANAHTAR = 'DU0HVwX0K-xgyCjnudnUYOeB';

/* ======================= 1) GÜN SONU VERİSİ ======================= */

function _pluxeeSekme() {
  var ss = SpreadsheetApp.openById(PLUXEE_SS_ID);
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

/** Bir kez çalıştır: aynı RRN'li tekrar satırları siler, terminal bilgisini korur. */
function pluxeeTekrarTemizle() {
  var sh = _pluxeeSekme();
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  var v = sh.getRange(2, 1, n, 7).getValues();
  var sira = [], harita = {};
  v.forEach(function (r) {
    var k = _rrnNorm(r[5]) || (String(r[0]) + '|' + String(r[1]));
    if (harita[k]) {
      if (!String(harita[k][6]).trim() && String(r[6]).trim()) harita[k][6] = r[6];
      return;
    }
    harita[k] = r; sira.push(k);
  });
  var temiz = sira.map(function (k) { return harita[k]; });
  sh.getRange(2, 1, n, 7).clearContent();
  sh.getRange(2, 1, temiz.length, 7).setValues(temiz);
  sh.getRange(2, 7, temiz.length, 1).setNumberFormat('@');
  Logger.log(n + ' satır -> ' + temiz.length + ' satır (' + (n - temiz.length) + ' tekrar silindi)');
}

function pluxeeSekmeKur() {
  var sh = _pluxeeSekme();
  Logger.log('Sekme hazır: ' + sh.getName() + ', satır: ' + sh.getLastRow());
}

/* ======================= 2) YEDEK KOD SAYFASI ======================= */

function pluxeeKodLinki() {
  return ScriptApp.getService().getUrl() + '?pluxee=1&k=' + PLUXEE_SAYFA_ANAHTAR;
}

function pluxeeLinkTest() {
  Logger.log(pluxeeKodLinki());
}

function _pluxeeSayfa(e) {
  var k = (e && e.parameter && e.parameter.k) || '';
  if (k !== PLUXEE_SAYFA_ANAHTAR) return HtmlService.createHtmlOutput('Yetkisiz.');
  var html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<style>' +
    'body{font-family:-apple-system,system-ui,sans-serif;background:#fff7ef;margin:0;padding:24px;color:#2b1d14}' +
    '.kart{max-width:360px;margin:40px auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 4px 18px rgba(0,0,0,.08);text-align:center}' +
    'h1{font-size:20px;margin:0 0 6px}p{font-size:14px;color:#6b5a4e;margin:0 0 18px}' +
    'input{width:100%;box-sizing:border-box;font-size:32px;letter-spacing:8px;text-align:center;padding:12px;border:2px solid #e3d5c8;border-radius:12px}' +
    'button{margin-top:16px;width:100%;padding:14px;font-size:18px;border:0;border-radius:12px;background:#c0392b;color:#fff}' +
    'button:disabled{opacity:.5}#durum{margin-top:14px;font-size:15px;min-height:20px}' +
    '</style></head><body><div class="kart">' +
    '<h1>Pluxee kodu</h1><p>SMS ile gelen kodu yaz ve gönder.</p>' +
    '<input id="kod" inputmode="numeric" autocomplete="one-time-code" maxlength="8" autofocus>' +
    '<button id="btn" onclick="gonder()">Gönder</button><div id="durum"></div></div>' +
    '<script>function gonder(){' +
    'var kod=document.getElementById("kod").value.replace(/\\D/g,"");' +
    'var d=document.getElementById("durum"),b=document.getElementById("btn");' +
    'if(kod.length<4){d.textContent="Kodu kontrol et.";return;}' +
    'b.disabled=true;d.textContent="Gönderiliyor…";' +
    'google.script.run.withSuccessHandler(function(r){d.textContent=r;})' +
    '.withFailureHandler(function(err){b.disabled=false;d.textContent="Hata: "+err.message;})' +
    '.pluxeeKodKaydet(kod,"' + PLUXEE_SAYFA_ANAHTAR + '");}' +
    'document.getElementById("kod").addEventListener("keydown",function(e){if(e.key==="Enter")gonder();});' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Pluxee kodu')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function pluxeeKodKaydet(kod, anahtar) {
  if (anahtar !== PLUXEE_SAYFA_ANAHTAR) throw new Error('Yetkisiz');
  kod = String(kod || '').replace(/\D/g, '');
  if (kod.length < 4 || kod.length > 8) throw new Error('Geçersiz kod');
  var sh = SpreadsheetApp.openById(PLUXEE_SS_ID).getSheetByName(PLUXEE_KOD_SEKME);
  if (!sh) throw new Error('"' + PLUXEE_KOD_SEKME + '" sekmesi yok');
  sh.getRange('B2').setNumberFormat('@').setValue(kod);
  SpreadsheetApp.flush();
  return '✓ Kod alındı (' + kod + '). Sayfayı kapatabilirsin.';
}