// ============================================================
// FATURA VERİSİ — TUTARLILIK KONTROLÜ ve GERİYE DÖNÜK TARAMA
// ------------------------------------------------------------
// Kolaybi Fatura Ham Veri projesine AYRI dosya olarak eklenir (Kolaybi çekici dosyası kalmalı).
//
//   veriKontrol()               → "Veri_Kontrol" sekmesine rapor yazar; hiçbir veriyi değiştirmez.
//   sayfa1Tekillestir()         → Sayfa1'de aynı Fatura_No ile birden fazla satır varsa ilkini bırakıp
//                                 kopyaları siler. Silmeden önce "Sayfa1_Yedek_<tarih>" sekmesine kopyalar.
//   kolaybiAlisTamTarama()      → Ocak'tan bu yana TÜM alış faturalarını tarar, Sayfa1'de olmayanları ekler.
//                                 (Normal çekim yalnız son KC_GUN güne bakar; Kolaybi'ye geç düşen fatura kaçar.)
//   tamTaramaTetikleyiciKur()   → kolaybiAlisTamTarama'yı her pazar gecesi otomatik çalıştırır.
// ============================================================

var VK_SEKME = 'Veri_Kontrol';
var VK_TARAMA_BASLANGIC = '2026-01-01';

/** Ocak'tan bu yana bütün alış faturalarını tarar; Sayfa1'de olmayanları ekler ve kalemlere ayırır. */
function kolaybiAlisTamTarama() {
  var eski = KC_GUN;
  var bas = new Date(VK_TARAMA_BASLANGIC + 'T00:00:00');
  KC_GUN = Math.ceil((Date.now() - bas.getTime()) / 86400000) + 1;
  try {
    var o = kolaybiFaturalariCek() || {};
    var msg = 'Tam tarama bitti: ' + (o.gorulen || 0) + ' fatura görüldü, ' + (o.yeni || 0) + ' eksik fatura eklendi.';
    Logger.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
    return o;
  } finally {
    KC_GUN = eski;
  }
}

/** Her pazar 03:00 civarı tam tarama. Mevcut 2 saatlik çekim tetikleyicisine dokunmaz. */
function tamTaramaTetikleyiciKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'kolaybiAlisTamTarama') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('kolaybiAlisTamTarama').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  var msg = '✅ Geriye dönük tam tarama her pazar gecesi çalışacak.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/** Sayfa1'deki kopya satırları siler (aynı Fatura_No'nun ilk satırı kalır). Önce yedek alır. */
function sayfa1Tekillestir() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(KC_KAYNAK) || ss.getSheets()[0];
  var n = sh.getLastRow() - 1;
  if (n < 2) return 0;
  var ids = sh.getRange(2, 1, n, 1).getValues();
  var gorulen = {}, sil = [];
  for (var i = 0; i < n; i++) {
    var id = vk_no_(ids[i][0]);
    if (!id) continue;
    if (gorulen[id]) sil.push(i + 2); else gorulen[id] = true;
  }
  if (!sil.length) {
    Logger.log('Sayfa1: kopya satır yok.');
    try { SpreadsheetApp.getUi().alert('Sayfa1\'de kopya satır yok.'); } catch (e) {}
    return 0;
  }
  var yedekAd = 'Sayfa1_Yedek_' + Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyyMMdd_HHmm');
  sh.copyTo(ss).setName(yedekAd);
  // Alttan yukarı, ardışık satırları tek seferde sil
  for (var j = sil.length - 1; j >= 0;) {
    var son = sil[j], k = j;
    while (k > 0 && sil[k - 1] === sil[k] - 1) k--;
    sh.deleteRows(sil[k], son - sil[k] + 1);
    j = k - 1;
  }
  var msg = sil.length + ' kopya satır silindi. Silinmeden önceki hali "' + yedekAd + '" sekmesinde.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return sil.length;
}

/** Tutarlılık raporu. Veriyi değiştirmez; sonuçları Veri_Kontrol sekmesine yazar. */
function veriKontrol() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s1 = ss.getSheetByName(KC_KAYNAK) || ss.getSheets()[0];
  var d1 = s1.getLastRow() > 1 ? s1.getRange(2, 1, s1.getLastRow() - 1, 7).getValues() : [];
  var rapor = [];   // [Kontrol, Durum, Adet, Ayrıntı]

  // 1) Sayfa1 kopya satırlar
  var say = {}, ilk = {}, fatura = [];
  d1.forEach(function (r) {
    var no = vk_no_(r[0]); if (!no) return;
    say[no] = (say[no] || 0) + 1;
    if (!ilk[no]) { ilk[no] = r; fatura.push(r); }
  });
  var kopya = Object.keys(say).filter(function (k) { return say[k] > 1; });
  var kopyaSatir = kopya.reduce(function (t, k) { return t + say[k] - 1; }, 0);
  rapor.push(['Sayfa1 kopya satır', kopya.length ? 'SORUN' : 'Tamam', kopyaSatir,
    kopya.length ? kopya.length + ' fatura birden fazla yazılmış. Düzeltmek için sayfa1Tekillestir çalıştır. Örnek: ' + kopya.slice(0, 8).join(', ') : '']);

  // 2) Kalem sayısı fatura içeriğiyle uyumlu mu (kopya ya da eksik kalem)
  var ks = ss.getSheetByName('Fatura_Kalemleri'), hl = ss.getSheetByName('Haric_Log');
  var kalemSay = {}, haricSay = {};
  if (ks && ks.getLastRow() > 1) ks.getRange(2, 1, ks.getLastRow() - 1, 1).getValues().forEach(function (r) { var no = vk_no_(r[0]); if (no) kalemSay[no] = (kalemSay[no] || 0) + 1; });
  if (hl && hl.getLastRow() > 1) {
    var hGor = {};
    hl.getRange(2, 1, hl.getLastRow() - 1, 7).getValues().forEach(function (r) {
      var no = vk_no_(r[1]); if (!no) return;
      var key = r.slice(1, 7).join('|'); if (hGor[key]) return; hGor[key] = true;
      haricSay[no] = (haricSay[no] || 0) + 1;
    });
  }
  var fazla = [], eksik = [];
  fatura.forEach(function (r) {
    var no = vk_no_(r[0]);
    var beklenen = String(r[4] || '').split('\n').filter(function (x) { return x.trim(); }).length;
    if (!beklenen) return;
    var k = kalemSay[no] || 0, h = haricSay[no] || 0;
    if (k > beklenen) fazla.push(no + ' (' + k + '/' + beklenen + ')');
    else if (k + h < beklenen) eksik.push(no + ' (' + (k + h) + '/' + beklenen + ')');
  });
  rapor.push(['Kalem sayısı fazla (stoğa iki kez girmiş olabilir)', fazla.length ? 'SORUN' : 'Tamam', fazla.length, fazla.slice(0, 15).join(', ')]);
  rapor.push(['Kalem sayısı eksik (kalemlere ayrılmamış)', eksik.length ? 'SORUN' : 'Tamam', eksik.length, eksik.slice(0, 15).join(', ')]);

  // 3) Aynı tedarikçinin farklı yazımları
  var adlar = {};
  fatura.forEach(function (r) { var ad = String(r[2] || ''); var k = vk_nrm_(ad); if (!k) return; (adlar[k] = adlar[k] || {})[ad] = true; });
  var farkli = Object.keys(adlar).filter(function (k) { return Object.keys(adlar[k]).length > 1; })
    .map(function (k) { return Object.keys(adlar[k]).map(function (x) { return '"' + x + '"'; }).join(' / '); });
  rapor.push(['Tedarikçi adı farklı yazılmış', farkli.length ? 'Uyarı' : 'Tamam', farkli.length, farkli.slice(0, 5).join(' · ')]);

  // 4) Tedarikciler listesinde olmayan tedarikçi (borç hesabına girmez)
  var ts = ss.getSheetByName('Tedarikciler'), tedSet = {};
  if (ts && ts.getLastRow() > 1) ts.getRange(2, 1, ts.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0]) tedSet[vk_nrm_(r[0])] = true; });
  var listedeYok = {};
  fatura.forEach(function (r) { var ad = String(r[2] || '').trim(); if (ad && !tedSet[vk_nrm_(ad)]) listedeYok[ad] = true; });
  var ly = Object.keys(listedeYok);
  rapor.push(['Faturası olup Tedarikciler listesinde olmayan', ly.length ? 'SORUN' : 'Tamam', ly.length, ly.slice(0, 10).join(' · ')]);

  // 5) Ödemesi olup hiçbir tedarikçiyle eşleşmeyen isimler (borçtan düşmez)
  var os = ss.getSheetByName('Odemeler'), odYok = {};
  if (os && os.getLastRow() > 1) {
    var ob = os.getRange(1, 1, 1, os.getLastColumn()).getValues()[0].map(vk_nrm_);
    var cT = ob.indexOf(vk_nrm_('Tedarikçi')), cU = ob.indexOf(vk_nrm_('Tutar'));
    if (cT >= 0) os.getRange(2, 1, os.getLastRow() - 1, os.getLastColumn()).getValues().forEach(function (r) {
      var ad = String(r[cT] || '').trim(); if (!ad || tedSet[vk_nrm_(ad)]) return;
      odYok[ad] = (odYok[ad] || 0) + (cU >= 0 ? vk_sayi_(r[cU]) : 0);
    });
  }
  var oy = Object.keys(odYok);
  rapor.push(['Ödemesi olup tedarikçiyle eşleşmeyen isim', oy.length ? 'SORUN' : 'Tamam', oy.length,
    oy.map(function (k) { return k + ' (' + Math.round(odYok[k]).toLocaleString('tr-TR') + ' TL)'; }).join(' · ')]);

  // 6) Stok başlangıcından sonra şubesi boş fatura
  var subeBos = fatura.filter(function (r) {
    var t = r[1] instanceof Date ? r[1] : null;
    var iso = t ? Utilities.formatDate(t, 'Europe/Istanbul', 'yyyy-MM-dd') : String(r[1] || '').replace(/^(\d{2})\.(\d{2})\.(\d{4}).*$/, '$3-$2-$1');
    return iso >= '2026-08-13' && !String(r[5] || '').trim();
  }).map(function (r) { return vk_no_(r[0]) + ' ' + String(r[2] || '').split(' ')[0]; });
  rapor.push(['13.08 sonrası şubesi boş fatura (stokta şube belirsiz)', subeBos.length ? 'Uyarı' : 'Tamam', subeBos.length, subeBos.slice(0, 15).join(', ')]);

  // Yaz
  var sh = ss.getSheetByName(VK_SEKME) || ss.insertSheet(VK_SEKME);
  sh.clear();
  sh.getRange(1, 1, 1, 4).setValues([['Kontrol', 'Durum', 'Adet', 'Ayrıntı']]).setFontWeight('bold');
  sh.getRange(2, 1, rapor.length, 4).setValues(rapor);
  sh.getRange(rapor.length + 3, 1).setValue('Son kontrol: ' + Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy HH:mm'));
  sh.setFrozenRows(1); sh.setColumnWidth(1, 330); sh.setColumnWidth(4, 700);
  sh.getRange(2, 4, rapor.length, 1).setWrap(true);
  rapor.forEach(function (r, i) {
    sh.getRange(i + 2, 2).setBackground(r[1] === 'Tamam' ? '#d9ead3' : r[1] === 'Uyarı' ? '#fff2cc' : '#f4cccc');
  });
  var sorun = rapor.filter(function (r) { return r[1] !== 'Tamam'; }).length;
  var msg = 'Kontrol bitti: ' + sorun + ' başlıkta dikkat edilecek bir şey var. Ayrıntı "' + VK_SEKME + '" sekmesinde.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return rapor;
}

function vk_no_(v) { return String(v === null || v === undefined ? '' : v).replace(/\.0$/, '').trim(); }
function vk_nrm_(s) { return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase().replace(/[\s.,\-*/()'"&:;!?]/g, ''); }
function vk_sayi_(v) {
  if (typeof v === 'number') return v;
  var s = String(v || '').trim(); if (!s) return 0;
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s); return isNaN(n) ? 0 : n;
}
