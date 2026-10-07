/**
 * Yemek Karti.gs — yemek kartı tahsilatları ayrı tabloda (05.10.2026)
 *
 * Pluxee / Edenred / Paye çekimleri kurye tablosundan ayrıldı; tek sahibi "BAP Yemek Kartı Tahsilatları".
 *   Pluxee  : MacBook pluxee.mjs  → Kopru (tur 'pluxee')  → pluxeeYaz          (Pluxee.gs)
 *   Edenred : MacBook edenred.mjs → Kopru (tur 'edenred') → _kopruEdenredYaz   (Kopru.gs)
 *   Paye    : payekart.com.tr "Gün Sonu Raporu" maili (Excel eki, 2 sayfa) → payeMailCek (bu dosya) → 'Paye' + 'Paye İşlemler'
 *
 * Bir kez çalıştırılacaklar:
 *   yemekKartiTasiKuru()   – eski Pluxee/Edenred sekmelerinden kaç satır taşınacağını yazar, hiçbir şey değiştirmez
 *   yemekKartiTasi()       – satırları yeni tabloya KOPYALAR, eski sekmelerin adını "… (eski)" yapar (silmez)
 *   payeTetikleyiciKur()   – payeMailCek her gün 02:30 ve 09:30 (Gmail izni ister)
 */

var YK_SS_ID = '19RVXZQwKZRCW6xnZxSwhRHXte4VWhaVqruaTZRwVJbM';   // BAP Yemek Kartı Tahsilatları
var PAYE_SEKME = 'Paye';               // gün sonu (cihaz başına toplam)
var PAYE_ISLEM_SEKME = 'Paye İşlemler'; // işlem işlem tutarlar — kart ajanı bunu okur
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

/**
 * Gün sonu raporu maillerinin Excel ekini okur. Excel'de iki sayfa var:
 *   "İşlemler" (işlem işlem tutarlar) → 'Paye İşlemler'   — yemek kartı ajanı bunu okur
 *   gün sonu (cihaz başına toplam)    → 'Paye'
 * Her sekme kendi Mail ID listesini tutar: bir mail o sekmeye bir kez yazılır, eski mailler yeni sekmeye de gelir.
 */
function payeMailCek() {
  var ss = ykTablo_(), hedef = {};
  function sekme(ad) {
    if (hedef[ad]) return hedef[ad];
    var sh = ss.getSheetByName(ad);
    if (!sh) { sh = ss.insertSheet(ad); sh.getRange(1, 1, 1, PAYE_SABIT.length).setValues([PAYE_SABIT]).setFontWeight('bold'); sh.setFrozenRows(1); }
    var h = { sh: sh, bas: sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); }), islenen: {}, yazildi: 0 };
    if (sh.getLastRow() > 1) sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { h.islenen[r[0]] = 1; });
    return (hedef[ad] = h);
  }
  var gs = sekme(PAYE_SEKME), is = sekme(PAYE_ISLEM_SEKME);

  var eklenen = 0, mail = 0, hata = [];
  GmailApp.search(PAYE_SORGU, 0, 60).forEach(function (th) {
    th.getMessages().forEach(function (m) {
      var id = m.getId(); if (gs.islenen[id] && is.islenen[id]) return;
      var gun = (m.getSubject().match(/\((\d{2})\.(\d{2})\.(\d{4})\)/) || []);
      var rgun = gun.length ? new Date(+gun[3], +gun[2] - 1, +gun[1]) : '';
      m.getAttachments().forEach(function (a) {
        if (!/\.xlsx$/i.test(a.getName())) return;
        try {
          xlsxSayfalar_(a.copyBlob()).forEach(function (sy, k) {
            var h = /şlem|islem/i.test(sy.ad) ? is : (k === 0 ? gs : null);
            if (!h || h.islenen[id] || !sy.tablo.length) return;
            eklenen += payeSatirYaz_(h, sy.tablo, rgun, id, a.getName());
          });
          mail++;
        } catch (e) { hata.push(a.getName() + ': ' + e); }
      });
      gs.islenen[id] = is.islenen[id] = 1;
    });
  });
  Object.keys(hedef).forEach(function (ad) { var h = hedef[ad]; if (h.yazildi && h.sh.getLastRow() > 1) h.sh.getRange(2, 1, h.sh.getLastRow() - 1, 1).setNumberFormat('dd.MM.yyyy'); });
  Logger.log('Paye: ' + mail + ' rapor, ' + eklenen + ' satır' + (hata.length ? ' | HATA: ' + hata.join('; ') : ''));
  return { mail: mail, satir: eklenen, hata: hata };
}

/* bir Excel sayfasını hedef sekmeye ekler (sütunlar başlık adıyla eşlenir; yeni başlık sona eklenir) */
function payeSatirYaz_(h, tablo, rgun, id, dosya) {
  var hb = baslikSatiri_(tablo), b = tablo[hb].map(function (x) { return String(x == null ? '' : x).trim(); });
  var yeniB = b.filter(function (x, i) { return x && h.bas.indexOf(x) < 0 && b.indexOf(x) === i; });
  if (yeniB.length) { h.sh.getRange(1, h.bas.length + 1, 1, yeniB.length).setValues([yeniB]).setFontWeight('bold'); h.bas = h.bas.concat(yeniB); }
  var satirlar = [];
  for (var i = hb + 1; i < tablo.length; i++) {
    var r = tablo[i]; if (!r.some(function (x) { return x !== '' && x != null; })) continue;
    var s = new Array(h.bas.length).fill('');
    s[0] = rgun; s[1] = id; s[2] = dosya; s[3] = i + 1;
    b.forEach(function (x, k) { if (x) s[h.bas.indexOf(x)] = excelDeger_(x, r[k]); });
    satirlar.push(s);
  }
  if (satirlar.length) h.sh.getRange(h.sh.getLastRow() + 1, 1, satirlar.length, h.bas.length).setValues(satirlar);
  else h.sh.appendRow([rgun, id, dosya, 'boş rapor']);
  h.yazildi++;
  return satirlar.length;
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
// Gelişmiş Drive servisi gerektirmeden .xlsx'in sayfalarını okur: [{ad, tablo: [[hücre, …], …]}, …] (Excel'deki sırayla)

function xlsxSayfalar_(blob) {
  var dosyalar = {};
  Utilities.unzip(blob.setContentType('application/zip')).forEach(function (f) { dosyalar[f.getName()] = f.getDataAsString('UTF-8'); });
  var ortak = xlsxOrtakMetin_(dosyalar['xl/sharedStrings.xml'] || ''), hedef = {}, m, out = [];
  var rels = dosyalar['xl/_rels/workbook.xml.rels'] || '', rr = /<Relationship\b([^>]*)\/?>/g;
  while ((m = rr.exec(rels))) {
    var rid = (m[1].match(/\bId="([^"]+)"/) || [])[1], tg = (m[1].match(/\bTarget="([^"]+)"/) || [])[1];
    if (rid && tg) hedef[rid] = tg.charAt(0) === '/' ? tg.slice(1) : 'xl/' + tg;
  }
  var wb = dosyalar['xl/workbook.xml'] || '', rs = /<sheet\b([^>]*)\/?>/g;
  while ((m = rs.exec(wb))) {
    var ad = xmlCoz_((m[1].match(/\bname="([^"]*)"/) || [])[1] || ''), id = (m[1].match(/\br:id="([^"]+)"/) || [])[1];
    if (id && dosyalar[hedef[id]]) out.push({ ad: ad, tablo: xlsxSayfa_(dosyalar[hedef[id]], ortak) });
  }
  if (!out.length) Object.keys(dosyalar).filter(function (k) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(k); })
    .sort(function (x, y) { return +x.match(/\d+/)[0] - +y.match(/\d+/)[0]; })
    .forEach(function (k) { out.push({ ad: k.replace(/^.*\//, '').replace('.xml', ''), tablo: xlsxSayfa_(dosyalar[k], ortak) }); });
  if (!out.length) throw new Error('Excel içinde sayfa bulunamadı');
  return out;
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
