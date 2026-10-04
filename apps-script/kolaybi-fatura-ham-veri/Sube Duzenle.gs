// ================= KOLAYBİ E-FATURA NOTUNDAN ŞUBE TESPİTİ v2 =================
// Eski "subeDoldur" dosyasının yerine geçer. Fark: sonucu bulunamayan faturalar
// script property'de tutulur ve 7 gün boyunca Kolaybi'ye yeniden sorulmaz
// (çekim artık 2 saatte bir çalıştığı için gereksiz API çağrısını önler).
var KB_API_KEY = '170a0b91-f00a-47cc-9eb4-fdb2d29c96a7';
var KB_CHANNEL = 'mertharman';
var KB_BASE    = 'https://ofis-api.kolaybi.com/kolaybi/v1';
var KB_BOS_TEKRAR_GUN = 7;      // notu boş çıkan fatura kaç gün sonra tekrar sorulsun

function kbToken_() {
  try {
    var r = UrlFetchApp.fetch(KB_BASE + '/access_token', {
      method: 'post', contentType: 'application/json',
      headers: { Channel: KB_CHANNEL },
      payload: JSON.stringify({ api_key: KB_API_KEY }), muteHttpExceptions: true
    });
    return JSON.parse(r.getContentText()).data;
  } catch (e) { Logger.log('Token alma hatası: ' + e.message); return null; }
}

function kbGet_(path, token) {
  var r = UrlFetchApp.fetch(KB_BASE + path, {
    headers: { Authorization: 'Bearer ' + token, Channel: KB_CHANNEL }, muteHttpExceptions: true
  });
  return { code: r.getResponseCode(), text: r.getContentText() };
}

function b64coz_(s) {
  s = String(s || '').replace(/\s+/g, '');
  if (!s) return '';
  try { return Utilities.newBlob(Utilities.base64Decode(s)).getDataAsString('UTF-8'); }
  catch (e) { try { return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString('UTF-8'); } catch (err) { return ''; } }
}

/** Fatura ID -> { sube, notlar, hata? } */
function faturaSubesi_(faturaId, token) {
  var f = kbGet_('/invoices/' + faturaId, token);
  if (f.code !== 200) return { sube: '', notlar: '', hata: 'invoice ' + f.code };
  var m = f.text.match(/"uuid"\s*:\s*"([0-9a-fA-F-]{36})"/);
  if (!m) return { sube: '', notlar: '', hata: 'uuid yok' };
  var v = kbGet_('/invoices/e-document/view?uuid=' + m[1] + '&output_type=xml&direction=inbound', token);
  if (v.code !== 200) return { sube: '', notlar: '', hata: 'view ' + v.code };
  var resObj = JSON.parse(v.text);
  var d = resObj ? resObj.data : null;
  var b64 = (d && typeof d === 'object') ? (d.src || d.content || d.file || '') : d;
  var xml = b64coz_(b64);
  var notlar = (xml.match(/<(?:cbc:)?Note>([\s\S]*?)<\/(?:cbc:)?Note>/gi) || [])
    .map(function (x) { return x.replace(/<\/?(?:cbc:)?Note>/gi, '').trim(); }).join(' | ');
  return { sube: subeTespit_(notlar), notlar: notlar };
}

function subeTespit_(metin) {
  var t = String(metin || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
    .replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i');
  if (t.indexOf('fikirt') > -1) return 'Fikirtepe';
  if (t.indexOf('erenk') > -1)  return 'Erenköy';
  return '';
}

/** Fatura_Kalemleri (I) ve Sayfa1 (F) için şubeyi doldurur. Bulunamayanlar 7 gün tekrar sorulmaz. */
function subeDoldur() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var kal = ss.getSheetByName('Fatura_Kalemleri');
  var s1  = ss.getSheetByName('Sayfa1');
  var props = PropertiesService.getScriptProperties();
  var bosCache = JSON.parse(props.getProperty('sube_bos') || '{}');   // id → epoch ms (sorulduğu an)
  var simdi = Date.now(), tekrar = KB_BOS_TEKRAR_GUN * 86400000;
  var token = null, cache = {}, sayac = { fatura: 0, bulundu: 0, bos: 0, atlandi: 0, kalem: 0 };
  var basla = Date.now(), MAX_SURE_MS = 4 * 60 * 1000;

  function sor(fno) {
    if (fno in cache) return cache[fno];
    if (bosCache[fno] && simdi - bosCache[fno] < tekrar) { sayac.atlandi++; cache[fno] = ''; return ''; }
    if (!token) { token = kbToken_(); if (!token) throw new Error('Kolaybi token alınamadı'); }
    var s = faturaSubesi_(fno, token).sube;
    cache[fno] = s; sayac.fatura++;
    if (s) { sayac.bulundu++; delete bosCache[fno]; } else { sayac.bos++; bosCache[fno] = simdi; }
    return s;
  }

  if (kal && kal.getLastRow() > 1) {
    var kRows = kal.getDataRange().getValues();
    var subeKol = kal.getRange(2, 9, kRows.length - 1, 1).getValues();
    var degistiKal = false;
    for (var i = 1; i < kRows.length; i++) {
      if (Date.now() - basla > MAX_SURE_MS) break;
      var fno = String(kRows[i][0]).replace(/\.0$/, '').trim();
      if (!fno || String(kRows[i][8] || '').trim()) continue;
      var s = sor(fno);
      if (s) { subeKol[i - 1][0] = s; sayac.kalem++; degistiKal = true; }
    }
    if (degistiKal) kal.getRange(2, 9, subeKol.length, 1).setValues(subeKol);
  }

  if (s1 && s1.getLastRow() > 1) {
    var r1 = s1.getDataRange().getValues();
    var f1 = s1.getRange(2, 6, r1.length - 1, 1).getValues();
    var degistiS1 = false;
    for (var j = 1; j < r1.length; j++) {
      if (Date.now() - basla > MAX_SURE_MS + 20000) break;
      var no = String(r1[j][0]).replace(/\.0$/, '').trim();
      if (!no || String(r1[j][5] || '').trim()) continue;
      var s2 = sor(no);
      if (s2) { f1[j - 1][0] = s2; degistiS1 = true; }
    }
    if (degistiS1) s1.getRange(2, 6, f1.length, 1).setValues(f1);
  }

  props.setProperty('sube_bos', JSON.stringify(bosCache));
  Logger.log(JSON.stringify(sayac));
  return sayac;
}

/** Bulunamayanlar önbelleğini temizler (hepsini yeniden sormak için). */
function subeOnbellekTemizle() {
  PropertiesService.getScriptProperties().deleteProperty('sube_bos');
  Logger.log('Şube önbelleği temizlendi.');
}

/** Tek fatura testi */
function subeTest() {
  var r = faturaSubesi_(41626230, kbToken_());
  Logger.log('SUBE: ' + r.sube + ' | NOTLAR: ' + r.notlar + (r.hata ? ' | HATA: ' + r.hata : ''));
}