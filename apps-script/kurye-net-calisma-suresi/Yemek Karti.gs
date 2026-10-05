/**
 * Yemek Karti.gs — yemek kartı tahsilatları ayrı tabloda (05.10.2026)
 *
 * Pluxee / Edenred / Paye çekimleri kurye tablosundan ayrıldı; tek sahibi "BAP Yemek Kartı Tahsilatları".
 *   Pluxee  : MacBook pluxee.mjs  → Kopru (tur 'pluxee')  → pluxeeYaz          (Pluxee.gs)
 *   Edenred : MacBook edenred.mjs → Kopru (tur 'edenred') → _kopruEdenredYaz   (Kopru.gs)
 *   Paye    : payekart.com.tr "Gün Sonu Raporu" maili (Excel eki) → payeMailCek (bu dosya)
 *
 * Bir kez çalıştırılacaklar:
 *   yemekKartiTasiKuru()   – eski Pluxee/Edenred sekmelerinden kaç satır taşınacağını yazar, hiçbir şey değiştirmez
 *   yemekKartiTasi()       – satırları yeni tabloya KOPYALAR, eski sekmelerin adını "… (eski)" yapar (silmez)
 *   payeTetikleyiciKur()   – payeMailCek her gün 02:30 ve 09:30 (Gmail izni ister)
 */

var YK_SS_ID = '19RVXZQwKZRCW6xnZxSwhRHXte4VWhaVqruaTZRwVJbM';   // BAP Yemek Kartı Tahsilatları
var PAYE_SEKME = 'Paye';
var PAYE_SORGU = 'payekart "Gün Sonu Raporu" has:attachment newer_than:60d';
var PAYE_SABIT = ['Rapor Günü', 'Mail ID', 'Dosya', 'Satır'];

function ykTablo_() { return SpreadsheetApp.openById(YK_SS_ID); }

/* ======================= 1) ESKİ KAYITLARI TAŞI ======================= */

function yemekKartiTasiKuru() { return yemekKartiTasi_(true); }
function yemekKartiTasi() { return yemekKartiTasi_(false); }

function yemekKartiTasi_(kuru) {
  var eski = SpreadsheetApp.openById(PLUXEE_SS_ID), rapor = [];
  // Pluxee: anahtar RRN (yoksa zaman|tutar)
  var ep = eski.getSheetByName(PLUXEE_SEKME);
  if (ep && ep.getLastRow() > 1) {
    var v = ep.getRange(2, 1, ep.getLastRow() - 1, PLUXEE_BASLIK.length).getValues();
    if (kuru) rapor.push('Pluxee: ' + v.length + ' satır taşınacak');
    else { var r = pluxeeYaz(v); rapor.push('Pluxee: ' + r.eklenen + ' eklendi, ' + r.atlanan + ' zaten vardı'); }
  } else rapor.push('Pluxee: eski sekme yok ya da boş');
  // Edenred: _kopruEdenredYaz nesne bekler
  var ee = eski.getSheetByName('Edenred');
  if (ee && ee.getLastRow() > 1) {
    var w = ee.getRange(2, 1, ee.getLastRow() - 1, 6).getDisplayValues().map(function (x) {
      return { zaman: x[0], tutar: Number(String(x[1]).replace(/\./g, '').replace(',', '.')), terminal: x[2], sube: x[3], gunsonu: x[4], kart: x[5] };
    });
    if (kuru) rapor.push('Edenred: ' + w.length + ' satır taşınacak');
    else { var q = _kopruEdenredYaz(w); rapor.push('Edenred: ' + q.eklenen + ' eklendi, ' + q.atlanan + ' zaten vardı / atlandı'); }
  } else rapor.push('Edenred: eski sekme yok ya da boş');
  if (!kuru) {
    if (ep) ep.setName(PLUXEE_SEKME + ' (eski)');
    if (ee) ee.setName('Edenred (eski)');
    rapor.push('Eski sekmeler "(eski)" diye yeniden adlandırıldı; silinmedi.');
  }
  Logger.log((kuru ? 'KURU — ' : '') + rapor.join(' | '));
  return rapor;
}

/* ======================= 2) PAYE GÜN SONU MAİLİ ======================= */

function payeTetikleyiciKur() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'payeMailCek'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('payeMailCek').timeBased().atHour(2).nearMinute(30).everyDays(1).create();
  ScriptApp.newTrigger('payeMailCek').timeBased().atHour(9).nearMinute(30).everyDays(1).create();
  Logger.log('payeMailCek: her gün 02:30 ve 09:30');
  payeMailCek();
}

/** Gün sonu raporu maillerinin Excel ekini Paye sekmesine yazar. Her mail bir kez işlenir (Mail ID). */
function payeMailCek() {
  var ss = ykTablo_(), sh = ss.getSheetByName(PAYE_SEKME);
  if (!sh) { sh = ss.insertSheet(PAYE_SEKME); sh.getRange(1, 1, 1, PAYE_SABIT.length).setValues([PAYE_SABIT]).setFontWeight('bold'); sh.setFrozenRows(1); }
  var bas = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); });
  var islenen = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { islenen[r[0]] = 1; });

  var eklenen = 0, mail = 0, hata = [];
  GmailApp.search(PAYE_SORGU, 0, 60).forEach(function (th) {
    th.getMessages().forEach(function (m) {
      var id = m.getId(); if (islenen[id]) return;
      var gun = (m.getSubject().match(/\((\d{2})\.(\d{2})\.(\d{4})\)/) || []);
      var rgun = gun.length ? new Date(+gun[3], +gun[2] - 1, +gun[1]) : '';
      m.getAttachments().forEach(function (a) {
        if (!/\.xlsx$/i.test(a.getName())) return;
        try {
          var tablo = xlsxOku_(a.copyBlob());
          if (!tablo.length) return;
          var hb = baslikSatiri_(tablo), b = tablo[hb].map(function (x) { return String(x == null ? '' : x).trim(); });
          // yeni başlıkları sona ekle (sütunlar adla eşlenir)
          var yeniB = b.filter(function (x) { return x && bas.indexOf(x) < 0; });
          if (yeniB.length) { sh.getRange(1, bas.length + 1, 1, yeniB.length).setValues([yeniB]).setFontWeight('bold'); bas = bas.concat(yeniB); }
          var satirlar = [];
          for (var i = hb + 1; i < tablo.length; i++) {
            var r = tablo[i]; if (!r.some(function (x) { return x !== '' && x != null; })) continue;
            var s = new Array(bas.length).fill('');
            s[0] = rgun; s[1] = id; s[2] = a.getName(); s[3] = i + 1;
            b.forEach(function (h, k) { if (h) s[bas.indexOf(h)] = excelDeger_(h, r[k]); });
            satirlar.push(s);
          }
          if (satirlar.length) { sh.getRange(sh.getLastRow() + 1, 1, satirlar.length, bas.length).setValues(satirlar); eklenen += satirlar.length; }
          else sh.appendRow([rgun, id, a.getName(), 'boş rapor']);
          mail++;
        } catch (e) { hata.push(a.getName() + ': ' + e); }
      });
      islenen[id] = 1;
    });
  });
  if (mail) sh.getRange(2, 1, sh.getLastRow() - 1, 1).setNumberFormat('dd.MM.yyyy');
  Logger.log('Paye: ' + mail + ' rapor, ' + eklenen + ' satır' + (hata.length ? ' | HATA: ' + hata.join('; ') : ''));
  return { mail: mail, satir: eklenen, hata: hata };
}

/* başlık satırı: ilk 15 satırda, en az 3 dolu ve hepsi metin olan ilk satır (yoksa 0) */
function baslikSatiri_(t) {
  for (var i = 0; i < Math.min(15, t.length); i++) {
    var d = t[i].filter(function (x) { return x !== '' && x != null; });
    if (d.length >= 3 && d.every(function (x) { return typeof x === 'string' && isNaN(Number(x)); })) return i;
  }
  return 0;
}

/* Excel tarih seri sayısını (tarih/zaman başlıklı sütunda) tarihe çevirir */
function excelDeger_(baslik, v) {
  if (typeof v === 'number' && /tarih|zaman|saat|date/i.test(baslik) && v > 30000 && v < 80000) {
    var d = new Date(Math.round((v - 25569) * 86400000));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }
  return v;
}

/* ======================= 3) KÜÇÜK XLSX OKUYUCU ======================= */
// Gelişmiş Drive servisi gerektirmeden .xlsx'in ilk sayfasını okur: [[hücre, …], …]

function xlsxOku_(blob) {
  var dosyalar = {};
  Utilities.unzip(blob.setContentType('application/zip')).forEach(function (f) { dosyalar[f.getName()] = f.getDataAsString('UTF-8'); });
  var sayfa = dosyalar['xl/worksheets/sheet1.xml'];
  if (!sayfa) { var ad = Object.keys(dosyalar).filter(function (k) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(k); }).sort()[0]; sayfa = ad ? dosyalar[ad] : ''; }
  if (!sayfa) throw new Error('Excel içinde sayfa bulunamadı');
  return xlsxSayfa_(sayfa, xlsxOrtakMetin_(dosyalar['xl/sharedStrings.xml'] || ''));
}

function xmlCoz_(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); }).replace(/&amp;/g, '&');
}

function xlsxOrtakMetin_(xml) {
  var out = [], re = /<si\b[^>]*>([\s\S]*?)<\/si>/g, m;
  while ((m = re.exec(xml))) {
    var t = '', r2 = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g, x;
    while ((x = r2.exec(m[1]))) t += x[1] ? xmlCoz_(x[1]) : '';
    out.push(t);
  }
  return out;
}

function xlsxSutun_(ref) {
  var h = String(ref).replace(/\d+/g, ''), n = 0;
  for (var i = 0; i < h.length; i++) n = n * 26 + (h.charCodeAt(i) - 64);
  return n - 1;
}

function xlsxSayfa_(xml, ortak) {
  var satirlar = [], re = /<row\b([^>]*)>([\s\S]*?)<\/row>/g, m;
  while ((m = re.exec(xml))) {
    var no = +((m[1].match(/\br="(\d+)"/) || [])[1] || (satirlar.length + 1));
    var satir = [], rc = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, c;
    while ((c = rc.exec(m[2]))) {
      var at = c[1], ic = c[2] || '';
      var ref = (at.match(/\br="([A-Z]+\d+)"/) || [])[1], tip = (at.match(/\bt="(\w+)"/) || [])[1] || 'n';
      var col = ref ? xlsxSutun_(ref) : satir.length;
      var vv = (ic.match(/<v>([\s\S]*?)<\/v>/) || [])[1], deger = '';
      if (tip === 's') deger = vv != null ? (ortak[+vv] || '') : '';
      else if (tip === 'inlineStr') { var t = '', r3 = /<t\b[^>]*>([\s\S]*?)<\/t>/g, y; while ((y = r3.exec(ic))) t += xmlCoz_(y[1]); deger = t; }
      else if (tip === 'str' || tip === 'e') deger = vv != null ? xmlCoz_(vv) : '';
      else if (tip === 'b') deger = vv === '1';
      else deger = vv != null && vv !== '' ? Number(vv) : '';
      while (satir.length < col) satir.push('');
      satir[col] = deger;
    }
    while (satirlar.length < no - 1) satirlar.push([]);
    satirlar.push(satir);
  }
  var gen = satirlar.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
  return satirlar.map(function (r) { while (r.length < gen) r.push(''); return r; });
}
