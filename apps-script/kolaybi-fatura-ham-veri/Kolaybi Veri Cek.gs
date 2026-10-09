// ============================================================
// KOLAYBİ → SAYFA1 ÇEKİCİ (Make senaryosunun yerine geçer)
// ------------------------------------------------------------
// Kolaybi Fatura Ham Veri projesine AYRI dosya olarak eklenir.
// Şube tespiti dosyasındaki kbToken_() ve kbGet_() kullanılır (o dosya kalmalı).
//
//   kolaybiFaturalariCek()  → son KC_GUN gün içindeki alış faturalarını çeker, Sayfa1'de olmayanları
//                              Make ile aynı formatta ekler (A id, B düzenleme tarihi, C tedarikçi,
//                              D KDV dahil tutar, E "ürün-adetxfiyat" satırları, F şube boş),
//                              sonra kalemleriAyir() çalıştırır (şube + ürün listesi de orada).
//   kolaybiTetikleyiciKur() → her 2 saatte bir otomatik çalıştırır. Make senaryosu kapatılabilir.
//
// Sayfa1'deki fatura no'ları mükerrer kontrolü için yeterli; Make'teki datastore'a gerek kalmaz.
// ============================================================

var KC_TOPLU   = false;     // kolaybiTumunuCek içinden çalışırken tek satır log için
var KC_GUN     = 14;        // alış: kaç gün geriye bakılsın (geriye dönük girişler için)
var KC_KAYNAK  = 'Sayfa1';
var KC_LOG     = 'Cekim_Log';
var KC_SATIS_SEKME = 'Satis_Faturalari';
var KC_SATIS_GUN   = 60;    // satış: bu kadar gün geriye bakılır, mevcut satırların ödeme durumu güncellenir
var KC_SATIS_BASLIK = ['Fatura_ID', 'Fatura_No', 'Tarih', 'Vade_Tarihi', 'Musteri', 'Tutar', 'Para_Birimi', 'Odenen', 'Kalan', 'Odeme_Durumu', 'Fatura_Durumu', 'EBelge_Durumu', 'Nakit_Yonu'];
var KC_GIDER_SEKME  = 'Gider_Faturalari';   // ürün satırı olmayan alış faturaları (elektrik, su, doğalgaz, internet, kira…)
var KC_GIDER_GUN    = 60;
var KC_XML_BUTCE    = 25;       // çalıştırma başına e-fatura XML'inden satır okunacak gider sayısı (2 API çağrısı/fatura)
var KC_XML_SURE_MS  = 200000;   // XML okumaya ayrılan süre
var KC_GIDER_BASLIK = ['Fatura_ID', 'Fatura_No', 'Tarih', 'Vade_Tarihi', 'Tedarikci', 'Tutar', 'Odenen', 'Kalan', 'Kategori', 'Aciklama', 'Kaynak', 'Kolaybi_Tip_ID'];
// Fatura SATIRI adında geçen kelime → kategori (platform faturalarını bölmek için; satır kategorisi tedarikçi kategorisini ezer)
var KC_GIDER_SATIR_KATEGORI = [
  ['yemek kart', 'Yemek kartı komisyonu'], ['multinet', 'Yemek kartı komisyonu'], ['sodexo', 'Yemek kartı komisyonu'], ['pluxee', 'Yemek kartı komisyonu'], ['setcard', 'Yemek kartı komisyonu'], ['ticket', 'Yemek kartı komisyonu'], ['edenred', 'Yemek kartı komisyonu'], ['metropol', 'Yemek kartı komisyonu'],
  ['reklam', 'Reklam'], ['sponsor', 'Reklam'], ['öne çıkar', 'Reklam'], ['tanıtım', 'Reklam'],
  ['kampanya', 'Kampanya/İndirim'], ['indirim', 'Kampanya/İndirim'], ['promosyon', 'Kampanya/İndirim'], ['kupon', 'Kampanya/İndirim'],
  ['kurye', 'Teslimat/Kurye'], ['teslimat', 'Teslimat/Kurye'], ['lojistik', 'Teslimat/Kurye'],
  ['erken ödeme', 'Erken ödeme masrafı'], ['erken odeme', 'Erken ödeme masrafı'], ['vade farkı', 'Erken ödeme masrafı'], ['iskonto bedeli', 'Erken ödeme masrafı'],
  ['müdavim', 'Kampanya/İndirim'], ['mudavim', 'Kampanya/İndirim'], ['sadakat', 'Kampanya/İndirim'],
  ['şarj hizmet', 'Araç şarj'], ['sarj_hzmt', 'Araç şarj'], ['kwh', 'Araç şarj'],
  ['hakediş', 'Platform komisyonu'], ['hakedis', 'Platform komisyonu'],
  ['komisyon', 'Platform komisyonu'], ['hizmet bedeli', 'Platform komisyonu'], ['aracılık', 'Platform komisyonu']
];
// Tedarikçi adında geçen kelime → SABİT kategori: satır adı, Kolaybi tipi ya da Gider_Kategorileri ne derse desin bu kazanır.
// HemenYolda (NEURODİS) aylık faturası bazen 'Platform komisyonu' düşüyordu; sahibi tek kategori istedi (06.10).
var KC_GIDER_SABIT = [['neurodis', 'Taşımacılık Abonelik'], ['hemenyolda', 'Taşımacılık Abonelik']];
// Tedarikçi adında geçen kelime → kategori. İstersen "Gider_Kategorileri" sekmesi açıp (A kelime, B kategori) buradakileri ezersin.
var KC_GIDER_KATEGORI = [
  ['bedaş', 'Elektrik'], ['ayedaş', 'Elektrik'], ['enerjisa', 'Elektrik'], ['ck ', 'Elektrik'], ['elektrik', 'Elektrik'], ['enerji', 'Elektrik'],
  ['iski', 'Su'], ['i̇ski', 'Su'], ['su ve kanal', 'Su'],
  ['igdaş', 'Doğalgaz'], ['i̇gdaş', 'Doğalgaz'], ['doğalgaz', 'Doğalgaz'], ['gaz', 'Doğalgaz'],
  ['turkcell', 'İnternet/Telefon'], ['türk telekom', 'İnternet/Telefon'], ['vodafone', 'İnternet/Telefon'], ['superonline', 'İnternet/Telefon'], ['telekom', 'İnternet/Telefon'],
  ['kira', 'Kira'], ['sigorta', 'Sigorta'], ['muhasebe', 'Muhasebe'], ['mali müşavir', 'Muhasebe'], ['zes dijital', 'Araç şarj'],
  ['yemeksepeti', 'Platform komisyonu'], ['getir', 'Platform komisyonu'], ['trendyol', 'Platform komisyonu'], ['multinet', 'Yemek kartı komisyonu'], ['sodexo', 'Yemek kartı komisyonu'], ['pluxee', 'Yemek kartı komisyonu'], ['setcard', 'Yemek kartı komisyonu'], ['metropol', 'Yemek kartı komisyonu'], ['ticket', 'Yemek kartı komisyonu'],
  ['adisyo', 'Yazılım'], ['kolaybi', 'Yazılım'], ['google', 'Yazılım'], ['make', 'Yazılım']
];

function kolaybiFaturalariCek() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { Logger.log('Başka çekim sürüyor, atlandı'); return; }
  var basla = Date.now();
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var kaynak = ss.getSheetByName(KC_KAYNAK) || ss.getSheets()[0];
    var token = kbToken_();
    if (!token) throw new Error('Kolaybi token alınamadı');

    var min = new Date(); min.setDate(min.getDate() - KC_GUN);
    var minStr = kc_iso_(min);
    var liste = kc_faturalar_(token, minStr);

    var mevcut = {};
    if (kaynak.getLastRow() > 1) {
      kaynak.getRange(2, 1, kaynak.getLastRow() - 1, 1).getValues().forEach(function (r) {
        var v = String(r[0] || '').replace(/\.0$/, '').trim(); if (v) mevcut[v] = true;
      });
    }
    var kategoriler = kc_giderKategorileri_(ss);
    var yeni = [], giderAtlanan = 0;
    liste.forEach(function (f) {
      if (mevcut[String(f.id)]) return;
      if (kc_giderMi_(f.gonderen, kategoriler)) { giderAtlanan++; return; }   // elektrik/su/kira vb. → Gider_Faturalari alır
      yeni.push([String(f.id), f.tarih, f.gonderen, f.tutar, f.icerik, '', f.vade || '']);
      mevcut[String(f.id)] = true;
    });

    if (yeni.length) {
      if (String(kaynak.getRange(1, 7).getValue() || '') === '') kaynak.getRange(1, 7).setValue('Vade_Tarihi').setFontWeight('bold');
      var ilk = kaynak.getLastRow() + 1;
      if (ilk + yeni.length - 1 > kaynak.getMaxRows()) kaynak.insertRowsAfter(kaynak.getMaxRows(), ilk + yeni.length - 1 - kaynak.getMaxRows());
      kaynak.getRange(ilk, 1, yeni.length, 7).setValues(yeni);
      kaynak.getRange(ilk, 2, yeni.length, 1).setNumberFormat('dd.MM.yyyy');
      kaynak.getRange(ilk, 7, yeni.length, 1).setNumberFormat('dd.MM.yyyy');
      kaynak.getRange(ilk, 4, yeni.length, 1).setNumberFormat('#,##0.00');
    }

    var not = '';
    if (yeni.length) {
      try { if (typeof kalemleriAyir === 'function') { kalemleriAyir(); not = 'kalemlere ayrıldı'; } }
      catch (e) { not = 'kalemleriAyir hatası: ' + e; }
    }
    var ozet = { gorulen: liste.length, yeni: yeni.length, not: not + (giderAtlanan ? ' · ' + giderAtlanan + ' gider faturası Sayfa1\'e alınmadı' : '') };
    if (!KC_TOPLU) kc_log_(ss, [new Date(), liste.length, yeni.length, 'alış · ' + Math.round((Date.now() - basla) / 1000) + ' sn', ozet.not]);
    Logger.log('Kolaybi: ' + liste.length + ' fatura görüldü, ' + yeni.length + ' yeni eklendi. ' + not);
    return ozet;
  } catch (err) {
    kc_log_(SpreadsheetApp.getActiveSpreadsheet(), [new Date(), '', '', 'HATA', String(err)]);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/** Kolaybi alış faturaları (sayfalı). → [{id, tarih(Date), gonderen, tutar, icerik}] */
function kc_faturalar_(token, minTarih) {
  var sonuc = [], gorulen = {};
  for (var page = 1; page <= 20; page++) {
    var r = kbGet_('/invoices?type=purchase_invoice&has_products=true&min_issue_date=' + minTarih + '&per_page=500&limit=500&page=' + page, token);
    if (r.code !== 200) throw new Error('Kolaybi /invoices ' + r.code + ': ' + r.text.slice(0, 200));
    var body = JSON.parse(r.text);
    var liste = (body && body.data) ? (Array.isArray(body.data) ? body.data : (body.data.data || [])) : [];
    var yeniSayisi = 0;
    liste.forEach(function (f) {
      if (!f || gorulen[f.id]) return;
      gorulen[f.id] = true; yeniSayisi++;
      var lines = f.lines || [];
      sonuc.push({
        id: f.id,
        tarih: kc_faturaTarihi_(f),
        vade: f.due_date ? kc_tarih_(String(f.due_date).slice(0, 10) + ' 12:00') : '',
        gonderen: (f.associate && f.associate.name) ? String(f.associate.name).trim() : '',
        tutar: Number(f.total && f.total.grand_total) || 0,
        icerik: lines.map(function (l) {
          var ad = (l.product && l.product.name) ? l.product.name : (l.name || l.description || '');
          return ad + '-' + l.quantity + 'x' + l.unit_price;
        }).join('\n')
      });
    });
    if (!yeniSayisi || liste.length < 500) break;
  }
  return sonuc;
}

/** Düzenleme tarihi (issue_date); yoksa created_at (UTC) + 3 saat. Saat 12:00'ye sabitlenir (gün kayması olmasın). */
function kc_faturaTarihi_(f) {
  var iss = f.issue_date || f.invoice_date || f.date || '';
  if (iss && String(iss).length >= 10) return kc_tarih_(String(iss).slice(0, 10) + ' 12:00');
  var c = kc_tarih_(f.created_at);
  return new Date(c.getTime() + 3 * 3600 * 1000);
}

function kc_tarih_(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  var d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

function kc_iso_(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function kc_log_(ss, satir) {
  var sh = ss.getSheetByName(KC_LOG);
  if (!sh) {
    sh = ss.insertSheet(KC_LOG);
    sh.appendRow(['Zaman', 'Görülen fatura', 'Yeni eklenen', 'Süre', 'Not']);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold'); sh.setFrozenRows(1);
  }
  sh.insertRowsBefore(2, 1);
  sh.getRange(2, 1, 1, 5).setValues([satir]);
  if (sh.getLastRow() > 400) sh.deleteRows(401, sh.getLastRow() - 400);
}

// ==========================================
// SATIŞ FATURALARI (Kolaybi_Satis_Faturalari senaryosunun yerine)
// ==========================================

/**
 * Son KC_SATIS_GUN günün satış faturalarını çeker; Satis_Faturalari'nde olmayanları ekler,
 * olanların Ödenen / Kalan / Ödeme_Durumu / Fatura_Durumu / EBelge_Durumu sütunlarını günceller.
 */
function kolaybiSatisFaturalariCek(minTarihOpt) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Satış faturası çekimi devam ediyor');
  try {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(KC_SATIS_SEKME);
  if (!sh) { sh = ss.insertSheet(KC_SATIS_SEKME); sh.appendRow(KC_SATIS_BASLIK); sh.getRange(1, 1, 1, KC_SATIS_BASLIK.length).setFontWeight('bold'); sh.setFrozenRows(1); }
  var token = kbToken_();
  if (!token) throw new Error('Kolaybi token alınamadı');
  var minStr = minTarihOpt ? String(minTarihOpt) : (function () { var d = new Date(); d.setDate(d.getDate() - KC_SATIS_GUN); return kc_iso_(d); })();

  var liste = [], gorulen = {};
  for (var page = 1; page <= 20; page++) {
    var r = kbGet_('/invoices?type=sale_invoice&min_issue_date=' + minStr + '&per_page=500&limit=500&page=' + page, token);
    if (r.code !== 200) throw new Error('Kolaybi sale_invoice ' + r.code + ': ' + r.text.slice(0, 200));
    var body = JSON.parse(r.text);
    var arr = (body && body.data) ? (Array.isArray(body.data) ? body.data : (body.data.data || [])) : [];
    var yeniSayisi = 0;
    arr.forEach(function (f) {
      if (!f || gorulen[f.id]) return;
      gorulen[f.id] = true; yeniSayisi++;
      var pp = f.payment_plan || {}, cds = f.commercial_doc_status || {};
      liste.push([
        String(f.id),
        f.serial_no || '',
        f.issue_date ? kc_tarih_(f.issue_date) : kc_tarih_(f.created_at),
        f.due_date ? kc_tarih_(f.due_date) : '',
        (f.associate && (f.associate.full_name || f.associate.name)) || '',
        Number(f.total && f.total.grand_total) || 0,
        f.currency || '',
        Number(pp.total_paid) || 0,
        Number(pp.total_remaining) || 0,
        pp.payment_status_value || '',
        (typeof cds === 'object' ? cds.value : cds) || '',
        f.e_document_status || '',
        f.cash_flow_direction === undefined ? '' : f.cash_flow_direction
      ]);
    });
    if (!yeniSayisi || arr.length < 500) break;
  }

  // mevcut satırlar: id → satır no
  var n = sh.getLastRow() - 1, idx = {};
  var mevcut = n > 0 ? sh.getRange(2, 1, n, KC_SATIS_BASLIK.length).getValues() : [];
  mevcut.forEach(function (row, i) { var id = String(row[0] || '').replace(/\.0$/, '').trim(); if (id) idx[id] = i; });

  var yeni = [], guncel = 0;
  liste.forEach(function (row) {
    var i = idx[row[0]];
    if (i === undefined) { yeni.push(row); return; }
    var e = mevcut[i];
    var degisti = [5, 7, 8, 9, 10, 11].some(function (c) { return String(e[c]) !== String(row[c]); });
    if (degisti) { for (var c = 5; c < KC_SATIS_BASLIK.length; c++) mevcut[i][c] = row[c]; guncel++; }
  });
  if (guncel && n > 0) sh.getRange(2, 6, n, KC_SATIS_BASLIK.length - 5).setValues(mevcut.map(function (r) { return r.slice(5); }));
  if (yeni.length) {
    yeni.sort(function (a, b) { return a[2] - b[2]; });
    var ilk = sh.getLastRow() + 1;
    if (ilk + yeni.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), ilk + yeni.length - 1 - sh.getMaxRows());
    sh.getRange(ilk, 1, yeni.length, KC_SATIS_BASLIK.length).setValues(yeni);
    sh.getRange(ilk, 3, yeni.length, 2).setNumberFormat('yyyy-MM-dd HH:mm:ss');
  }
    kc_satisTekillestir_(sh);
  var sonSatir = sh.getLastRow();
  if (sonSatir > 2) {
    sh.getRange(2, 1, sonSatir - 1, KC_SATIS_BASLIK.length)
      .sort({ column: 3, ascending: false });
  }
  sh.setFrozenRows(1);
  if (!KC_TOPLU) kc_log_(ss, [new Date(), liste.length, yeni.length, 'satış', guncel + ' satır ödeme/durum güncellendi']);
  Logger.log('Satış: ' + liste.length + ' fatura, ' + yeni.length + ' yeni, ' + guncel + ' güncellendi.');
  return { gorulen: liste.length, yeni: yeni.length, guncel: guncel };
  
  } finally {
    lock.releaseLock();
  }
}

function kc_satisTekillestir_(sh) {
  var last = sh.getLastRow();
  if (last < 3) return 0;

  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  var seen = {};
  var remove = [];

  for (var i = ids.length - 1; i >= 0; i--) {
    var id = String(ids[i][0] || '').replace(/\.0$/, '').trim();
    if (!id) continue;
    if (seen[id]) remove.push(i + 2);
    else seen[id] = true;
  }

  remove.forEach(function (row) {
    sh.deleteRow(row);
  });

  return remove.length;
}

// ==========================================
// GİDER FATURALARI (ürün satırı olmayan alış faturaları)
// ==========================================

/**
 * Kolaybi "Genel Gider" belgelerini (type=general_expense) + gider tedarikçisinden gelen alış faturalarını çeker.
 * Gider_Faturalari'nde yoksa ekler, varsa Tutar/Ödenen/Kalan'ı günceller.
 * Kategori sırası: Gider_Kategorileri sekmesi (A: Kolaybi tip ID ya da kelime → B: kategori) → kayıttaki ad → tedarikçi kelimesi → Diğer.
 */
function kolaybiGiderFaturalariCek(minTarihOpt) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(KC_GIDER_SEKME);
  if (!sh) { sh = ss.insertSheet(KC_GIDER_SEKME); sh.appendRow(KC_GIDER_BASLIK); sh.getRange(1, 1, 1, KC_GIDER_BASLIK.length).setFontWeight('bold'); sh.setFrozenRows(1); }
  if (sh.getLastColumn() < KC_GIDER_BASLIK.length) sh.getRange(1, KC_GIDER_BASLIK.length).setValue(KC_GIDER_BASLIK[KC_GIDER_BASLIK.length - 1]).setFontWeight('bold');
  var token = kbToken_();
  if (!token) throw new Error('Kolaybi token alınamadı');
  var min = minTarihOpt ? String(minTarihOpt) : (function () { var d = new Date(); d.setDate(d.getDate() - KC_GIDER_GUN); return kc_iso_(d); })();

  // Sayfa1'deki ürünlü faturalar
  var urunlu = {};
  var s1 = ss.getSheetByName(KC_KAYNAK);
  if (s1 && s1.getLastRow() > 1) s1.getRange(2, 1, s1.getLastRow() - 1, 1).getValues().forEach(function (r) { var v = String(r[0] || '').replace(/\.0$/, '').trim(); if (v) urunlu[v] = true; });

  var kategoriler = kc_giderKategorileri_(ss);
  var liste = [], gorulen = {}, tipOrnek = {}, cokSatirli = {}, alanNotu = '';
  var xmlProps = PropertiesService.getScriptProperties();
  var xmlBakildi = JSON.parse(xmlProps.getProperty('gider_xml_bakildi') || '{}');
  var xmlSayac = 0, xmlBasla = Date.now(), xmlBulunan = 0, xmlKalan = 0;
  var mevcutAciklama = {};   // id → mevcut açıklama (boş olanlar için XML denenecek)
  (function () {
    var sh0 = ss.getSheetByName(KC_GIDER_SEKME);
    if (sh0 && sh0.getLastRow() > 1) sh0.getRange(2, 1, sh0.getLastRow() - 1, 10).getValues().forEach(function (r) { var id = String(r[0] || '').replace(/\.0$/, '').trim().replace(/-\d+$/, ''); if (id) mevcutAciklama[id] = mevcutAciklama[id] || String(r[9] || '').trim(); });
  })();
  function satirlariBul(f) {
    var adaylar = ['lines', 'items', 'invoice_lines', 'expense_lines', 'general_expense_lines', 'expense_items', 'invoice_items', 'details', 'products', 'rows'];
    for (var i = 0; i < adaylar.length; i++) if (Array.isArray(f[adaylar[i]]) && f[adaylar[i]].length) return f[adaylar[i]].filter(function (l) { return l; });
    // ad adı bilinmiyorsa: içinde ad/açıklama ya da tutar taşıyan nesne dizisi hangi alandaysa o
    var keys = Object.keys(f);
    for (var k = 0; k < keys.length; k++) {
      var v = f[keys[k]];
      if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' &&
          (v[0].name !== undefined || v[0].description !== undefined || v[0].title !== undefined || v[0].unit_price !== undefined || v[0].total !== undefined || v[0].amount !== undefined)) {
        return v.filter(function (l) { return l; });
      }
    }
    if (!alanNotu) alanNotu = 'satır alanı bulunamadı; alanlar: ' + keys.join(',');
    return [];
  }
  function kaydet(f, kaynakTip) {
    var lines = satirlariBul(f);
    var adVar = lines.some(function (l) { return l && (l.name || l.description || l.title || (l.product && l.product.name)); });
    var mevcutKisa = mevcutAciklama[String(f.id)] && mevcutAciklama[String(f.id)].length <= 25;
    if (!adVar && (!mevcutAciklama[String(f.id)] || mevcutKisa) && f.e_document_status) {   // API satır adı vermiyor → e-fatura XML'i
      if (!xmlBakildi[String(f.id)] && xmlSayac < KC_XML_BUTCE && Date.now() - xmlBasla < KC_XML_SURE_MS) {
        xmlSayac++;
        var xl = kc_xmlSatirlar_(f.id, token);
        xmlBakildi[String(f.id)] = Date.now();
        if (xl && xl.length) { lines = xl; xmlBulunan++; }
      } else if (!xmlBakildi[String(f.id)]) xmlKalan++;
    }
    var ted = (f.associate && (f.associate.full_name || f.associate.name)) || '';
    var pp = f.payment_plan || {};
    var tipId = f.financial_action_type_id || (f.financial_action_type && f.financial_action_type.id) || '';
    var tipAd = (f.financial_action_type && (f.financial_action_type.name || f.financial_action_type.title)) || (f.category && f.category.name) || (f.expense_type && f.expense_type.name) || '';
    var tarih = f.issue_date ? kc_tarih_(f.issue_date) : kc_tarih_(f.created_at);
    var vade = f.due_date ? kc_tarih_(f.due_date) : '';
    var toplam = Number(f.total && f.total.grand_total) || 0;
    var odenen = Number(pp.total_paid) || 0, kalan = Number(pp.total_remaining) || 0;
    var aciklamaTum = lines.map(function (l) { return l.name || l.description || l.title || (l.product && l.product.name) || ''; }).filter(String).join(' | ') || (f.description || f.note || f.explanation || f.title || '');
    if (tipId && !tipOrnek[tipId]) tipOrnek[tipId] = ted || aciklamaTum.slice(0, 40);
    var tedKat = kc_giderKategori_(ted + ' ' + aciklamaTum, kategoriler, tipId, tipAd);

    if (lines.length <= 1) {                                   // tek satır → tek kayıt (eskisi gibi)
      var ad1 = lines.length ? (lines[0].name || lines[0].description || (lines[0].product && lines[0].product.name) || '') : '';
      liste.push([String(f.id), f.serial_no || '', tarih, vade, ted, toplam, odenen, kalan, kc_sabitKategori_(ted) || kc_satirKategori_(ad1) || tedKat, aciklamaTum.slice(0, 200), kaynakTip, tipId]);
      return;
    }
    // çok satırlı (platform faturaları): her satır ayrı kayıt, tutarlar KDV dahil toplama ölçeklenir
    var satirTutar = lines.map(function (l) { var t = Number(l.total || l.total_amount || l.amount || l.line_total); if (!(t > 0)) t = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0); return t; });
    var satirToplam = satirTutar.reduce(function (s, x) { return s + x; }, 0);
    var oran = satirToplam > 0 ? toplam / satirToplam : 1;
    var odenenOran = toplam > 0 ? odenen / toplam : 0;
    cokSatirli[String(f.id)] = true;
    lines.forEach(function (l, i) {
      var ad = l.name || l.description || (l.product && l.product.name) || ('Satır ' + (i + 1));
      var t = Math.round(satirTutar[i] * oran * 100) / 100;
      var o = Math.round(t * odenenOran * 100) / 100;
      liste.push([String(f.id) + '-' + (i + 1), f.serial_no || '', tarih, vade, ted, t, o, Math.round((t - o) * 100) / 100,
                  kc_sabitKategori_(ted) || kc_satirKategori_(ad) || tedKat, String(ad).slice(0, 200), kaynakTip, tipId]);
    });
  }
  // 1) Genel gider belgeleri
  for (var page = 1; page <= 20; page++) {
    var r = kbGet_('/invoices?type=general_expense&min_issue_date=' + min + '&per_page=500&limit=500&page=' + page, token);
    if (r.code !== 200) throw new Error('Kolaybi general_expense ' + r.code + ': ' + r.text.slice(0, 200));
    var body = JSON.parse(r.text);
    var arr = (body && body.data) ? (Array.isArray(body.data) ? body.data : (body.data.data || [])) : [];
    var yeniSayisi = 0;
    arr.forEach(function (f) {
      if (!f || gorulen[f.id]) return;
      gorulen[f.id] = true; yeniSayisi++;
      if (!(Number(f.total && f.total.grand_total) > 0) && !f.serial_no) return;      // taslak / boş kayıt
      kaydet(f, 'kolaybi');
    });
    if (!yeniSayisi || arr.length < 500) break;
  }
  // 2) Gider tedarikçisinden gelmiş alış faturaları (yanlışlıkla alış olarak işlenenler)
  for (var page2 = 1; page2 <= 20; page2++) {
    var r2 = kbGet_('/invoices?type=purchase_invoice&min_issue_date=' + min + '&per_page=500&limit=500&page=' + page2, token);
    if (r2.code !== 200) break;
    var body2 = JSON.parse(r2.text);
    var arr2 = (body2 && body2.data) ? (Array.isArray(body2.data) ? body2.data : (body2.data.data || [])) : [];
    var yeni2 = 0;
    arr2.forEach(function (f) {
      if (!f || gorulen[f.id]) return;
      gorulen[f.id] = true; yeni2++;
      if (urunlu[String(f.id)]) return;
      var ted = (f.associate && (f.associate.full_name || f.associate.name)) || '';
      if (!kc_giderMi_(ted, kategoriler)) return;                 // yalnızca gider tedarikçisinden gelen alış faturaları
      if (!(Number(f.total && f.total.grand_total) > 0) && !f.serial_no) return;
      kaydet(f, 'kolaybi-alış');
    });
    if (!yeni2 || arr2.length < 500) break;
  }
  PropertiesService.getScriptProperties().setProperty('gider_tip_ornek', JSON.stringify(tipOrnek));

  var n = sh.getLastRow() - 1, idx = {};
  var mevcut = n > 0 ? sh.getRange(2, 1, n, KC_GIDER_BASLIK.length).getValues() : [];
  mevcut.forEach(function (row, i) { var id = String(row[0] || '').replace(/\.0$/, '').trim(); if (id) idx[id] = i; });
  // eskiden tek satır yazılmış ama artık satırlara bölünen faturalar: eski kaydı sil
  var silinecek = [];
  Object.keys(cokSatirli).forEach(function (id) { if (idx[id] !== undefined && String(mevcut[idx[id]][10]).indexOf('kolaybi') === 0) silinecek.push(idx[id]); });
  if (silinecek.length) {
    silinecek.sort(function (a, b) { return b - a; }).forEach(function (i) { sh.deleteRow(i + 2); });
    n = sh.getLastRow() - 1; idx = {};
    mevcut = n > 0 ? sh.getRange(2, 1, n, KC_GIDER_BASLIK.length).getValues() : [];
    mevcut.forEach(function (row, i) { var id = String(row[0] || '').replace(/\.0$/, '').trim(); if (id) idx[id] = i; });
  }
  var yeni = [], guncel = 0;
  var aciklamaGuncel = 0;
  liste.forEach(function (row) {
    var i = idx[row[0]];
    if (i === undefined) { yeni.push(row); return; }
    if (String(mevcut[i][6]) !== String(row[6]) || String(mevcut[i][7]) !== String(row[7]) || String(mevcut[i][5]) !== String(row[5])) { mevcut[i][5] = row[5]; mevcut[i][6] = row[6]; mevcut[i][7] = row[7]; guncel++; }
    var eskiA = String(mevcut[i][9] || '').trim();
    if (row[9] && (!eskiA || (eskiA.length <= 25 && String(row[9]).length > eskiA.length))) { mevcut[i][9] = row[9]; mevcut[i][8] = row[8]; aciklamaGuncel++; }
  });
  if (guncel && n > 0) sh.getRange(2, 6, n, 3).setValues(mevcut.map(function (r) { return [r[5], r[6], r[7]]; }));
  if (aciklamaGuncel && n > 0) sh.getRange(2, 9, n, 2).setValues(mevcut.map(function (r) { return [r[8], r[9]]; }));
  if (yeni.length) {
    yeni.sort(function (a, b) { return a[2] - b[2]; });
    var ilk = sh.getLastRow() + 1;
    if (ilk + yeni.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), ilk + yeni.length - 1 - sh.getMaxRows());
    sh.getRange(ilk, 1, yeni.length, KC_GIDER_BASLIK.length).setValues(yeni);
    sh.getRange(ilk, 3, yeni.length, 2).setNumberFormat('dd.MM.yyyy');
    sh.getRange(ilk, 6, yeni.length, 3).setNumberFormat('#,##0.00');
  }
  // yalnızca daha önce görülmemiş tip ID'leri not düş
  var props = PropertiesService.getScriptProperties();
  var bilinen = JSON.parse(props.getProperty('gider_tip_bilinen') || '{}'), yeniTip = [];
  Object.keys(tipOrnek).forEach(function (k) { if (!bilinen[k]) { bilinen[k] = tipOrnek[k]; yeniTip.push(k + '=' + tipOrnek[k]); } });
  props.setProperty('gider_tip_bilinen', JSON.stringify(bilinen));
  xmlProps.setProperty('gider_xml_bakildi', JSON.stringify(xmlBakildi));
  var not = guncel + ' güncellendi' + (xmlSayac ? ' · XML: ' + xmlSayac + ' okundu, ' + xmlBulunan + ' satırlı' : '') + (xmlKalan ? ' · XML sırada: ' + xmlKalan : '') + (yeniTip.length ? ' · yeni tip: ' + yeniTip.join(', ') : '') + (alanNotu ? ' · ⚠ ' + alanNotu : '');
  if (!KC_TOPLU) kc_log_(ss, [new Date(), liste.length, yeni.length, 'gider', not]);
  Logger.log('Gider: ' + liste.length + ' belge, ' + yeni.length + ' yeni, ' + guncel + ' güncellendi.' + (alanNotu ? ' ⚠ ' + alanNotu : ''));
  return { gorulen: liste.length, yeni: yeni.length, guncel: guncel, not: not };
}

/** TEK SEFERLİK TEŞHİS: bir genel gider kaydını olduğu gibi günlüğe döker (satır alanını bulmak için). */
function giderOrnekKayit() {
  var token = kbToken_();
  var r = kbGet_('/invoices?type=general_expense&per_page=3', token);
  var body = JSON.parse(r.text);
  var arr = (body && body.data) ? (Array.isArray(body.data) ? body.data : (body.data.data || [])) : [];
  if (!arr.length) { Logger.log('kayıt yok'); return; }
  var f = arr[0];
  Logger.log('ALANLAR: ' + Object.keys(f).join(', '));
  Logger.log('KAYIT: ' + JSON.stringify(f).slice(0, 3500));
  var d = kbGet_('/invoices/' + f.id, token);
  Logger.log('DETAY (/invoices/id): ' + d.text.slice(0, 3500));
}

/**
 * Gider_Kategorileri sekmesini oluşturur ve son çekimde görülen Kolaybi tip ID'lerini örnek tedarikçiyle listeler.
 * B sütununa kategori adını yaz (Elektrik, Su, Doğalgaz, Platform komisyonu…), sonraki çekimlerde otomatik uygulanır.
 * Mevcut satırların kategorisini de yeniden hesaplamak için giderKategorileriniYenile() çalıştır.
 */
function giderKategoriTablosuOlustur() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Gider_Kategorileri');
  if (!sh) {
    sh = ss.insertSheet('Gider_Kategorileri');
    sh.appendRow(['Kolaybi tip ID veya kelime', 'Kategori', 'Örnek (bilgi)']);
    sh.getRange(1, 1, 1, 3).setFontWeight('bold'); sh.setFrozenRows(1);
  }
  var mevcut = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0] !== '') mevcut[String(r[0])] = true; });
  var ornek = JSON.parse(PropertiesService.getScriptProperties().getProperty('gider_tip_ornek') || '{}');
  var yeni = Object.keys(ornek).filter(function (k) { return !mevcut[k]; }).map(function (k) { return [k, '', ornek[k]]; });
  if (yeni.length) sh.getRange(sh.getLastRow() + 1, 1, yeni.length, 3).setValues(yeni);
  sh.autoResizeColumns(1, 3);
  var msg = yeni.length + ' Kolaybi tip ID eklendi. B sütununa kategori adlarını yaz, sonra giderKategorileriniYenile() çalıştır.';
  Logger.log(msg); try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/** Gider_Faturalari'ndaki Kolaybi kaynaklı satırların kategorisini güncel eşlemeyle yeniden yazar (elle girilenlere dokunmaz). */
function giderKategorileriniYenile() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(KC_GIDER_SEKME);
  if (!sh || sh.getLastRow() < 2) return;
  var kategoriler = kc_giderKategorileri_(ss);
  var d = sh.getRange(2, 1, sh.getLastRow() - 1, KC_GIDER_BASLIK.length).getValues();
  var kol = d.map(function (r) { return [r[8]]; }), sayac = 0;
  for (var i = 0; i < d.length; i++) {
    if (String(d[i][10]).indexOf('kolaybi') !== 0) continue;
    var yeni = kc_sabitKategori_(d[i][4]) || kc_satirKategori_(d[i][9]) || kc_giderKategori_(d[i][4] + ' ' + d[i][9], kategoriler, d[i][11], '');
    if (yeni !== d[i][8]) { kol[i][0] = yeni; sayac++; }
  }
  sh.getRange(2, 9, kol.length, 1).setValues(kol);
  var msg = sayac + ' satırın kategorisi güncellendi.';
  Logger.log(msg); try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

function kc_giderKategorileri_(ss) {
  var liste = KC_GIDER_KATEGORI.slice();
  var sh = ss.getSheetByName('Gider_Kategorileri');
  if (sh && sh.getLastRow() > 1) {
    var ozel = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().filter(function (r) { return r[0] && r[1]; }).map(function (r) { return [String(r[0]).toLowerCase(), String(r[1])]; });
    liste = ozel.concat(liste);      // sekmedekiler önce gelir
  }
  return liste;
}

/** Tedarikçi adı gider kelimelerinden birine uyuyorsa (kategori 'Diğer' dışında) true. */
function kc_giderMi_(ted, liste) {
  var t = String(ted || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
  if (!t) return false;
  for (var i = 0; i < liste.length; i++) if (liste[i][1] !== 'Diğer' && !/^\d+$/.test(String(liste[i][0])) && t.indexOf(liste[i][0]) !== -1) return true;
  return false;
}

/**
 * E-faturanın UBL XML'inden satırları okur → [{name, total}] (KDV hariç satır tutarı). Okunamazsa null.
 * Şube tespiti dosyasındaki kbGet_ ve b64coz_ kullanılır.
 */
function kc_xmlSatirlar_(faturaId, token) {
  try {
    var f = kbGet_('/invoices/' + faturaId, token);
    if (f.code !== 200) return null;
    var m = f.text.match(/"uuid"\s*:\s*"([0-9a-fA-F-]{36})"/);
    if (!m) return null;
    var v = kbGet_('/invoices/e-document/view?uuid=' + m[1] + '&output_type=xml&direction=inbound', token);
    if (v.code !== 200) return null;
    var resObj = JSON.parse(v.text), d = resObj ? resObj.data : null;
    var b64 = (d && typeof d === 'object') ? (d.src || d.content || d.file || '') : d;
    var xml = b64coz_(b64);
    if (!xml) return null;
    // fatura düzeyi notlar (şube notu ve boşlar hariç) — satır adı sadece markaysa asıl açıklama burada olur
    var govde = xml.replace(/<(?:cac:)?InvoiceLine>[\s\S]*?<\/(?:cac:)?InvoiceLine>/gi, '');
    var faturaNot = (govde.match(/<(?:cbc:)?Note>([\s\S]*?)<\/(?:cbc:)?Note>/gi) || [])
      .map(function (x) { return kc_xmlCoz_(x.replace(/<\/?(?:cbc:)?Note>/gi, '')).trim(); })
      .filter(function (t) { return t && !kc_notGurultu_(t); }).slice(0, 2)
      .join(' | ');
    var masraflar = (govde.match(/<(?:cbc:)?AllowanceChargeReason>([\s\S]*?)<\/(?:cbc:)?AllowanceChargeReason>/gi) || [])
      .map(function (x) { return kc_xmlCoz_(x.replace(/<\/?(?:cbc:)?AllowanceChargeReason>/gi, '')).trim(); }).filter(String).join(' | ');
    var satirlar = xml.match(/<(?:cac:)?InvoiceLine>[\s\S]*?<\/(?:cac:)?InvoiceLine>/gi) || [];
    var out = [];
    satirlar.forEach(function (sx) {
      var ad = (sx.match(/<(?:cac:)?Item>[\s\S]*?<(?:cbc:)?Name>([\s\S]*?)<\/(?:cbc:)?Name>/i) || [])[1] || '';
      var acik = (sx.match(/<(?:cac:)?Item>[\s\S]*?<(?:cbc:)?Description>([\s\S]*?)<\/(?:cbc:)?Description>/i) || [])[1] || '';
      var notlar = (sx.match(/<(?:cbc:)?Note>([\s\S]*?)<\/(?:cbc:)?Note>/gi) || []).map(function (x) { return x.replace(/<\/?(?:cbc:)?Note>/gi, ''); });
      var satirMasraf = (sx.match(/<(?:cbc:)?AllowanceChargeReason>([\s\S]*?)<\/(?:cbc:)?AllowanceChargeReason>/gi) || []).map(function (x) { return x.replace(/<\/?(?:cbc:)?AllowanceChargeReason>/gi, ''); });
      var tutar = parseFloat((sx.match(/<(?:cbc:)?LineExtensionAmount[^>]*>([\d.\-]+)<\//i) || [])[1] || '0') || 0;
      var parcalar = [ad, acik].concat(notlar, satirMasraf).map(function (x) { return kc_xmlCoz_(x).trim(); }).filter(function (x) { return x && !kc_notGurultu_(x); });
      var tekil = parcalar.filter(function (x, i) { return parcalar.indexOf(x) === i; });
      var tam = tekil.join(' — ');
      if (tam || tutar) out.push({ name: tam || ('Satır ' + (out.length + 1)), total: tutar });
    });
    // tek satırlı faturada satır adı kısa (marka) ise fatura notlarını ve masraf açıklamalarını ekle
    var ek = [faturaNot, masraflar].filter(String).join(' | ');
    if (out.length === 1 && ek) out[0].name = out[0].name + ' — ' + ek;
    else if (out.length > 1 && ek) out.forEach(function (o) { if (o.name.length < 40) o.name = o.name + ' — ' + ek.slice(0, 120); });
    return out.length ? out : null;
  } catch (e) { Logger.log('XML satır: ' + e); return null; }
}
/** Faturadaki bilgi taşımayan notlar: yazıyla tutar, sistem referansları, şube notu vb. */
function kc_notGurultu_(t) {
  var l = String(t || '').replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase().replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ğ/g, 'g');
  return /yalniz|^#|^only|delivery:|upr:|mersis|cari:|sap dok|kdv uyg|is bu fatura|musteri no|fn no|sonodeme|satici id|isletme merkezi|fikirt|erenk|^\d+[.,]\d+\s*(try|tl)|e-arsiv|earsiv|ettn|irsaliye yerine/.test(l);
}
function kc_xmlCoz_(t) {
  return String(t || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ');
}

/**
 * TEMİZLİK: Gider_Faturalari'nden (1) boş/0 tutarlı fatura numarasız satırları, (2) Kaynak "kolaybi-alış" olup
 * tedarikçisi gider listesinde olmayan (yanlışlıkla gelen ürün alışı) satırları siler. Elle girilenlere dokunmaz.
 */
function giderTemizle() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(KC_GIDER_SEKME);
  if (!sh || sh.getLastRow() < 2) return;
  var kategoriler = kc_giderKategorileri_(ss);
  var d = sh.getRange(2, 1, sh.getLastRow() - 1, KC_GIDER_BASLIK.length).getValues();
  var sil = [];
  for (var i = 0; i < d.length; i++) {
    var kaynak = String(d[i][10] || ''), tutar = Number(d[i][5]) || 0, no = String(d[i][1] || '').trim(), ted = String(d[i][4] || '');
    if (kaynak === 'manuel') continue;
    if (!(tutar > 0) && !no) { sil.push(i); continue; }
    if (kaynak === 'kolaybi-alış' && !kc_giderMi_(ted, kategoriler)) sil.push(i);
  }
  sil.sort(function (a, b) { return b - a; }).forEach(function (i) { sh.deleteRow(i + 2); });
  var msg = sil.length + ' satır silindi (boş kayıt + yanlış yönlenen ürün alışı).';
  Logger.log(msg); try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/** TEŞHİS: bir gider faturasının e-fatura XML'ini (ilk 8000 karakter) günlüğe yazar. Fatura ID'sini fonksiyon içinde değiştir. */
function giderXmlOrnek() {
  var faturaId = 40450544;   // ← bakmak istediğin Gider_Faturalari A sütunu ID'si
  var token = kbToken_();
  var f = kbGet_('/invoices/' + faturaId, token);
  var m = f.text.match(/"uuid"\s*:\s*"([0-9a-fA-F-]{36})"/);
  if (!m) { Logger.log('uuid yok: ' + f.text.slice(0, 300)); return; }
  var v = kbGet_('/invoices/e-document/view?uuid=' + m[1] + '&output_type=xml&direction=inbound', token);
  var d = JSON.parse(v.text).data; var b64 = (d && typeof d === 'object') ? (d.src || d.content || d.file || '') : d;
  var xml = b64coz_(b64);
  Logger.log(xml.replace(/\s+/g, ' ').slice(0, 8000));
  Logger.log('ÇÖZÜMLENEN SATIRLAR: ' + JSON.stringify(kc_xmlSatirlar_(faturaId, token)));
}

/** XML "bakıldı" listesini sıfırlar; sonraki giderXmlBackfill bütün faturaları yeniden okur. */
function giderXmlSifirla() {
  var pr = PropertiesService.getScriptProperties();
  pr.deleteProperty('gider_xml_bakildi'); pr.setProperty('gider_xml_v2', 'ok');
  var msg = 'XML okuma listesi sıfırlandı. Şimdi giderXmlBackfill çalıştır.';
  Logger.log(msg); try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/** Geriye dönük: Ocak'tan beri açıklaması boş olan gider e-faturalarının satırlarını XML'den doldurur. Bitene kadar tekrar çalıştır. */
function giderXmlBackfill() {
  KC_XML_BUTCE = 120; KC_XML_SURE_MS = 270000;
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty('gider_xml_v2') !== 'ok') { pr.deleteProperty('gider_xml_bakildi'); pr.setProperty('gider_xml_v2', 'ok'); }   // yeni okuyucuyla bir kez baştan
  var o = kolaybiGiderFaturalariCek('2026-01-01');
  var msg = 'XML doldurma turu bitti: ' + (o.not || '') + '\n"XML sırada: N" görüyorsan tekrar çalıştır; görmüyorsan bitti.';
  Logger.log(msg); try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/** Fatura satırı adından kategori (platform faturaları için). Bulamazsa ''. */
function kc_sabitKategori_(ted) {
  var t = String(ted || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
  for (var i = 0; i < KC_GIDER_SABIT.length; i++) if (t.indexOf(KC_GIDER_SABIT[i][0]) !== -1) return KC_GIDER_SABIT[i][1];
  return '';
}

function kc_satirKategori_(ad) {
  var t = String(ad || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
  if (!t) return '';
  for (var i = 0; i < KC_GIDER_SATIR_KATEGORI.length; i++) if (t.indexOf(KC_GIDER_SATIR_KATEGORI[i][0]) !== -1) return KC_GIDER_SATIR_KATEGORI[i][1];
  return '';
}

function kc_giderKategori_(metin, liste, tipId, tipAd) {
  var id = String(tipId || '').trim();
  if (id) for (var j = 0; j < liste.length; j++) if (String(liste[j][0]).trim() === id) return liste[j][1];   // sekmedeki ID eşlemesi
  if (tipAd) return String(tipAd);                                                                              // Kolaybi kategori adı gelirse
  var t = String(metin || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
  for (var i = 0; i < liste.length; i++) if (!/^\d+$/.test(String(liste[i][0])) && t.indexOf(liste[i][0]) !== -1) return liste[i][1];
  return 'Diğer';
}

/**
 * TEK SEFERLİK: Sayfa1'deki mevcut alış faturalarına Kolaybi'den vade tarihini (G sütunu) yazar.
 * Liste sorgusuyla çalışır (fatura başına çağrı yok), Ocak'tan itibaren.
 */
function vadeTarihleriniDoldur() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kaynak = ss.getSheetByName(KC_KAYNAK) || ss.getSheets()[0];
  var token = kbToken_();
  if (!token) throw new Error('Kolaybi token alınamadı');
  var liste = kc_faturalar_(token, '2026-01-01');
  var vade = {}; liste.forEach(function (f) { if (f.vade) vade[String(f.id)] = f.vade; });
  var n = kaynak.getLastRow() - 1;
  if (n < 1) return;
  if (String(kaynak.getRange(1, 7).getValue() || '') === '') kaynak.getRange(1, 7).setValue('Vade_Tarihi').setFontWeight('bold');
  var ids = kaynak.getRange(2, 1, n, 1).getValues();
  var kol = kaynak.getRange(2, 7, n, 1).getValues(), sayac = 0;
  for (var i = 0; i < n; i++) {
    var id = String(ids[i][0] || '').replace(/\.0$/, '').trim();
    if (vade[id] && !kol[i][0]) { kol[i][0] = vade[id]; sayac++; }
  }
  kaynak.getRange(2, 7, n, 1).setValues(kol).setNumberFormat('dd.MM.yyyy');
  var msg = sayac + ' faturaya vade tarihi yazıldı (' + liste.length + ' fatura tarandı).';
  Logger.log(msg); try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/** Tek seferlik: Ocak'tan bu yana satış + gider faturaları (alış zaten Eksik kontrolüyle çekildi). */
function ocaktanBeriCek() {
  kolaybiSatisFaturalariCek('2026-01-01');
  kolaybiGiderFaturalariCek('2026-01-01');
}

/** Tetikleyiciden çağrılan ana fonksiyon: alış, satış, gider. Biri hata verse diğerleri çalışır. */
function kolaybiTumunuCek() {
  var basla = Date.now(), hatalar = [], parca = [], toplamGorulen = 0, toplamYeni = 0, notlar = [];
  KC_TOPLU = true;
  function adim(ad, fn) {
    try { var o = fn() || {}; parca.push(ad + ' ' + (o.gorulen || 0) + '/' + (o.yeni || 0)); toplamGorulen += o.gorulen || 0; toplamYeni += o.yeni || 0; if (o.not && (o.yeni || /yeni tip|⚠|hatası/.test(o.not))) notlar.push(ad + ': ' + o.not); }
    catch (e) { hatalar.push(ad + ': ' + e); parca.push(ad + ' HATA'); }
  }
  adim('alış', kolaybiFaturalariCek);
  adim('satış', kolaybiSatisFaturalariCek);
  adim('gider', kolaybiGiderFaturalariCek);
  KC_TOPLU = false;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  kc_log_(ss, [new Date(), toplamGorulen, toplamYeni, parca.join(' · ') + ' · ' + Math.round((Date.now() - basla) / 1000) + ' sn', notlar.concat(hatalar).join(' | ')]);
  if (hatalar.length) throw new Error(hatalar.join(' | '));
}

/** Her 2 saatte bir alış + satış çekimi. Eski kalemleriAyir tetikleyicileri de kaldırılır. */
// ── T12 teşhis: son alışlar neden Sayfa1'e gelmiyor? ──
// Editörden çalıştır: alisFaturaTeshis(). Hiçbir şeyi değiştirmez; 'Alis_Teshis' sekmesine yazar.
// Son 30 günün BÜTÜN alış faturalarını (ürünlü/ürünsüz) çeker ve her biri için: Sayfa1'de mi, Gider_Faturalari'nda mı,
// ürün satırı var mı, e-belge durumu ne. Ürünsüz girilen tedarikçi faturaları çekime hiç takılmaz (has_products=true).
function alisFaturaTeshis() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var token = kbToken_();
  if (!token) throw new Error('Kolaybi token alınamadı');
  var min = new Date(); min.setDate(min.getDate() - 30);
  var minStr = kc_iso_(min);
  var idSet = function (ad, kol) {
    var m = {}, sh = ss.getSheetByName(ad);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, kol, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var v = String(r[0] || '').replace(/\.0$/, '').trim().replace(/-\d+$/, ''); if (v) m[v] = true; });
    return m;
  };
  var s1 = idSet(KC_KAYNAK, 1), gider = idSet(KC_GIDER_SEKME, 1);
  var kategoriler = kc_giderKategorileri_(ss);
  var urunlu = {};
  kc_faturalar_(token, minStr).forEach(function (f) { urunlu[String(f.id)] = true; });

  var satirlar = [], gorulen = {}, gunluk = {};
  for (var page = 1; page <= 20; page++) {
    var r = kbGet_('/invoices?type=purchase_invoice&min_issue_date=' + minStr + '&per_page=500&limit=500&page=' + page, token);
    if (r.code !== 200) { satirlar.push(['HATA', '', '', '', '', '', '', '', '', 'purchase_invoice ' + r.code + ': ' + r.text.slice(0, 150)]); break; }
    var body = JSON.parse(r.text);
    var arr = (body && body.data) ? (Array.isArray(body.data) ? body.data : (body.data.data || [])) : [];
    var yeni = 0;
    arr.forEach(function (f) {
      if (!f || gorulen[f.id]) return;
      gorulen[f.id] = true; yeni++;
      var id = String(f.id), ted = (f.associate && (f.associate.full_name || f.associate.name)) || '';
      var t = kc_faturaTarihi_(f), lines = f.lines || [];
      var nerede = s1[id] ? 'Sayfa1' : gider[id] ? 'Gider_Faturalari' : '— HİÇBİRİ';
      var neden = s1[id] ? '' : urunlu[id] ? 'ürünlü ama Sayfa1\'de yok (gider tedarikçisi sayılmış olabilir)' :
        kc_giderMi_(ted, kategoriler) ? 'gider tedarikçisi' : 'KolayBi\'de ÜRÜN SATIRI YOK → çekim almaz (has_products)';
      var cds = f.commercial_doc_status || {};
      satirlar.push([id, f.serial_no || '', t, ted, Number(f.total && f.total.grand_total) || 0, lines.length, urunlu[id] ? 'evet' : 'hayır',
        nerede, (typeof cds === 'object' ? cds.value : cds) || '', f.e_document_status || '', neden]);
      var g = kc_iso_(t); gunluk[g] = gunluk[g] || [0, 0]; gunluk[g][0]++; if (s1[id]) gunluk[g][1]++;
    });
    if (!yeni || arr.length < 500) break;
  }
  satirlar.sort(function (a, b) { return (b[2] instanceof Date ? b[2] : 0) - (a[2] instanceof Date ? a[2] : 0); });
  var B = ['Fatura_ID', 'Fatura_No', 'Tarih', 'Tedarikci', 'Tutar', 'Satir_Sayisi', 'Urunlu', 'Nerede', 'Fatura_Durumu', 'EBelge_Durumu', 'Neden'];
  var sh = ss.getSheetByName('Alis_Teshis') || ss.insertSheet('Alis_Teshis');
  sh.clear();
  var ozet = Object.keys(gunluk).sort().reverse().map(function (g) { return g + ': ' + gunluk[g][0] + ' fatura, ' + gunluk[g][1] + ' Sayfa1\'de'; });
  sh.getRange(1, 1).setValue('Çalıştı: ' + new Date() + ' · son 30 gün ' + Object.keys(gorulen).length + ' alış faturası · gün gün: ' + ozet.slice(0, 15).join(' | '));
  sh.getRange(2, 1, 1, B.length).setValues([B]).setFontWeight('bold');
  if (satirlar.length) sh.getRange(3, 1, satirlar.length, B.length).setValues(satirlar.map(function (r) { while (r.length < B.length) r.push(''); return r; }));
  sh.setFrozenRows(2);
  Logger.log(ozet.join('\n'));
  return ozet;
}

function kolaybiTetikleyiciKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'kolaybiFaturalariCek' || f === 'kolaybiTumunuCek' || f === 'kalemleriAyir') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('kolaybiTumunuCek').timeBased().everyHours(2).create();
  var msg = '✅ Kolaybi alış + satış çekimi her 2 saatte bir çalışacak (kolaybiTumunuCek).';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}