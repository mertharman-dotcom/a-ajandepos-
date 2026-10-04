/*******************************************************************
 * ADRES EŞLEŞMESİ → TELEFON DOLDURMA (BAP Adisyo Toplayıcı ek modülü)
 *
 * Kaynak: Birlesik Musteri Veritabani › "Kontrol Edilecek Eşleşmeler"
 *   A Kanal | B Siparisteki Isim | C Mahalle | D Siparisteki Adres
 *   E Sipariş Sayısı | F ONERILEN TELEFON | G Master Isim | H Master Adres
 *   I Durum | J Skor | K Onay ("ok")
 *
 * Hedef: ana sipariş tablosu (27 sütunlu yeni düzen)
 *   I Sipariş Kanalı · L Müşteri Adı · M Telefon · O Adres · X Durum · AA Not
 *
 * Kural: Getir/Trendyol siparişi, telefonu boşsa, adres anahtarı
 * (sokak + bina no + daire) onaylı listedeki D veya H anahtarıyla
 * BİREBİR tutar ve ad tutarsa → M'ye telefon, AA'ya not yazılır.
 * Benzerlik skoru yok; tutmayan sipariş "Adres_Aday" sekmesine düşer.
 *******************************************************************/

var AE_MUSTERI_DB_ID = '1dcjX3o-6N9b8ndKt8ALj9MxLg-KZ3I16Z6DI-S9oV1Q'; // Birlesik Musteri Veritabani
var AE_ESLESME_SEKME = 'Kontrol Edilecek Eşleşmeler';
var AE_ADAY_SEKME    = 'Adres_Aday';
var AE_ANA_ID        = '1gdn_rbaevKx9_-pNTRKL1DDtytFxZHr9QF-jrS4cHPE'; // BAP Adisyo Siparis Datası
var AE_ANA_SEKME     = ''; // boş bırakılırsa ilk sekme kullanılır
var AE_KANALLAR      = /getir|trendyol/i;

// Sütun indeksleri (1 tabanlı) — 27 sütunlu düzen
var AE_C = { KANAL: 9, MUSTERI: 12, TELEFON: 13, ADRES: 15, DURUM: 24, NOT: 27 };

/** Her 5 dk toplayıcı turunun sonunda ya da ayrı tetikleyiciyle çağır */
function adresEslesmeUygula() {
  var onayli = onayliAnahtarlar_();
  if (!onayli.length) { Logger.log('Onaylı eşleşme yok'); return; }

  var ss = SpreadsheetApp.openById(AE_ANA_ID);
  var sh = AE_ANA_SEKME ? ss.getSheetByName(AE_ANA_SEKME) : ss.getSheets()[0];
  var son = sh.getLastRow();
  if (son < 2) return;

  // Son 300 satıra bakmak yeterli (günlük hacim)
  var bas = Math.max(2, son - 300);
  var rng = sh.getRange(bas, 1, son - bas + 1, 27);
  var v = rng.getValues();
  var adaylar = [];
  var yazildi = 0;

  for (var i = 0; i < v.length; i++) {
    var r = v[i];
    var kanal = String(r[AE_C.KANAL - 1] || '');
    if (!AE_KANALLAR.test(kanal)) continue;
    if (String(r[AE_C.TELEFON - 1] || '').trim()) continue;         // telefon zaten var
    var not = String(r[AE_C.NOT - 1] || '');
    if (/adres eşleşmesi|adres aday/i.test(not)) continue;        // daha önce işlendi

    var adres = String(r[AE_C.ADRES - 1] || '');
    var ad    = String(r[AE_C.MUSTERI - 1] || '');
    var key   = adresAnahtar_(adres);
    if (!key) continue;

    var hit = null;
    for (var k = 0; k < onayli.length; k++) {
      var o = onayli[k];
      if ((key === o.keyD || key === o.keyH) && adTutuyor_(ad, o.adlar)) { hit = o; break; }
    }

    if (hit) {
      sh.getRange(bas + i, AE_C.TELEFON).setValue(hit.tel);
      sh.getRange(bas + i, AE_C.NOT).setValue((not ? not + ' | ' : '') + 'Tel: adres eşleşmesi (' + kanal + ')');
      yazildi++;
    } else {
      // Aday: aynı sokak/bina ama daire/ad tutmayan ya da hiç tutmayan → haftalık liste
      var sokakBina = key.split('|').slice(0, 2).join('|');
      for (var m = 0; m < onayli.length; m++) {
        if (onayli[m].keyD.indexOf(sokakBina) === 0 || onayli[m].keyH.indexOf(sokakBina) === 0) {
          adaylar.push([new Date(), r[0], kanal, ad, adres, onayli[m].tel, onayli[m].adlar[0], 'sokak+bina tuttu, daire/ad tutmadı']);
          sh.getRange(bas + i, AE_C.NOT).setValue((not ? not + ' | ' : '') + 'Adres aday');
          break;
        }
      }
    }
  }

  if (adaylar.length) adayYaz_(adaylar);
  Logger.log(yazildi + ' siparişe telefon yazıldı, ' + adaylar.length + ' aday');
}

/** Onaylı satırları oku, iki adresten de anahtar üret */
function onayliAnahtarlar_() {
  var ss = SpreadsheetApp.openById(AE_MUSTERI_DB_ID);
  var sh = ss.getSheetByName(AE_ESLESME_SEKME);
  if (!sh) { // adı esnek ara: "kontrol" + "esles" geçen sekme
    sh = ss.getSheets().filter(function (x) { var n = trNorm_(x.getName()); return n.indexOf('kontrol') >= 0 && n.indexOf('esles') >= 0; })[0];
  }
  if (!sh) throw new Error('Eşleşme sekmesi bulunamadı. Sekmeler: ' + ss.getSheets().map(function (x) { return x.getName(); }).join(', '));
  var v = sh.getRange(2, 1, Math.max(0, sh.getLastRow() - 1), 11).getValues();
  var out = [];
  v.forEach(function (r) {
    if (String(r[10] || '').trim().toLowerCase() !== 'ok') return;
    var tel = String(r[5] || '').replace(/\D/g, '');
    if (tel.length === 10) tel = '90' + tel;
    if (tel.length === 11 && tel[0] === '0') tel = '9' + tel;
    if (!/^90\d{10}$/.test(tel)) return;
    out.push({
      tel: tel,
      keyD: adresAnahtar_(String(r[3] || '')),
      keyH: adresAnahtar_(String(r[7] || '')),
      adlar: [ilkAd_(String(r[1] || '')), ilkAd_(String(r[6] || ''))].filter(Boolean)
    });
  });
  return out;
}

/** "sokak|bina|daire" anahtarı. Bulunamazsa '' */
function adresAnahtar_(a) {
  if (!a) return '';
  var s = trNorm_(a);
  // platform gürültüsü
  s = s.replace(/\|\|\|.*$/, '')                     // Getir "|||Suadiye|Kadıköy|İstanbul"
       .replace(/mahalle\s*:\s*[^,]+/g, ' ')          // Trendyol "Mahalle:X Mah"
       .replace(/\b(kadikoy|uskudar|atasehir|istanbul|turkiye|turkey|turkei)\b/g, ' ')
       .replace(/\b\d{5}\b/g, ' ');

  // daire
  var daire = ilkEsleme_(s, [/(?:kapi no|daire no|flat no\.?|daire|d)\s*[:.]?\s*([0-9]+[a-z]?)/]);
  // bina no
  var bina = ilkEsleme_(s, [/(?:apt no|bina no|apt\. no|no)\s*[:.]?\s*(?:no\s*[:.]?\s*)?([0-9]+(?:[\/-][0-9a-z]+)?[a-z]?)/]);
  // sokak: "xxx sok/sk/sokağı/cad/cd/caddesi/çk/bulvarı" öncesindeki son 1-2 kelime
  var sokak = '';
  var mm = s.match(/([a-z0-9.]+(?:\s+[a-z0-9.]+)?)\s+(?:sokagi|sokak|sok|sk|caddesi|cadde|cad|cd|cikmazi|ck|bulvari|bulvar|bv)\b/);
  if (mm) sokak = mm[1].replace(/\b(mah|mahallesi|mh)\b/g, '').trim();
  if (!sokak || !bina) return '';
  bina = bina.replace(/[\/-].*$/, '');             // 11/1 → 11, 6-8 → 6
  return [sokak.replace(/\s+/g, ''), bina, daire || ''].join('|');
}

function ilkEsleme_(s, regs) {
  for (var i = 0; i < regs.length; i++) { var m = s.match(regs[i]); if (m) return m[1]; }
  return '';
}

function trNorm_(t) {
  return String(t).toLowerCase()
    .replace(/İ/g, 'i').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a')
    .replace(/[^a-z0-9\/:.,\-| ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function ilkAd_(n) {
  var t = trNorm_(n).replace(/[^a-z ]/g, ' ').trim().split(' ')[0] || '';
  return t.length >= 3 ? t : '';
}

function adTutuyor_(siparisAd, adlar) {
  var a = ilkAd_(siparisAd);
  if (!a) return false;
  return adlar.some(function (x) { return x === a || x.indexOf(a) === 0 || a.indexOf(x) === 0; });
}

function adayYaz_(rows) {
  var ss = SpreadsheetApp.openById(AE_MUSTERI_DB_ID);
  var sh = ss.getSheetByName(AE_ADAY_SEKME);
  if (!sh) {
    sh = ss.insertSheet(AE_ADAY_SEKME);
    sh.appendRow(['Tarih', 'Sipariş ID', 'Kanal', 'Siparişteki Ad', 'Sipariş Adresi', 'Önerilen Tel', 'Master Ad', 'Neden', 'Onay']);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

/** Test: onaylı listedeki D adreslerini H'ye karşı kendi kendine eşleştir */
function testAnahtarlar() {
  onayliAnahtarlar_().forEach(function (o) {
    Logger.log((o.keyD === o.keyH ? 'OK  ' : 'FARK') + ' D=' + o.keyD + '  H=' + o.keyH + '  ' + o.adlar.join('/'));
  });
}