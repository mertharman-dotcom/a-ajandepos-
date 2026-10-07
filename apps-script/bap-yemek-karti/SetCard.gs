/**
 * SetCard.gs — SetCard çekimleri ve fatura (06.10.2026)
 *
 * SetCard üye işyeri sitesi (uye.setcard.com.tr) düz bir JSON API kullanıyor (api.setcard.com.tr), SMS / robot doğrulaması yok.
 * Bu yüzden MacBook gerekmez; Apps Script doğrudan çeker.
 *   setcardCek()        – son 3 günün işlemlerini YEMEKKARTI › SetCard sekmesine EKLER (STI ID ile; aynı işlem iki kez yazılmaz)
 *   setcardFaturaKuru() – Fatura Takibi'ndeki faturaları durumlarıyla listeler, hiçbir şey kesmez
 *   setcardFaturaKes()  – durumu "kesilebilir" (faturaDurumu 0) olanları sitedeki "Fatura Kes" düğmesiyle aynı şekilde keser.
 *                         Sonra resmi faturayı (KolayBi) SetCard'a ulaştırmak gerekir — site de bunu söylüyor.
 *
 * Kurulum (sahibi, bir kez):
 *   1) Proje Ayarları › Komut dosyası özellikleri: SETCARD_VKN, SETCARD_GSM (başında 0 olmadan, 5xx…), SETCARD_SIFRE
 *      (şifre depoya yazılmaz, yalnız burada durur)
 *   2) kurulum() çalıştır (Kurulum.gs) → giriş denenir, son 3 gün çekilir, saatlik tetikleyici kurulur.
 */

var SETCARD_API = 'https://api.setcard.com.tr/MerchantServices/';
var SETCARD_SEKME = 'SetCard';
var SETCARD_BASLIK = ['İşlem Zamanı', 'Tutar (TL)', 'İşlem Türü', 'Durum', 'Terminal', 'Ödeme Şekli', 'Kart No', 'Cihaz / Kullanıcı',
  'SUT Kod', 'STI ID', 'İşyeri', 'Gün Sonu', 'Kayıt Zamanı'];

/* ---------------- API ---------------- */

function setcardIstek_(yol, govde, token) {
  var o = { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Accept: 'application/json', Origin: 'https://uye.setcard.com.tr', Referer: 'https://uye.setcard.com.tr/' },
    payload: govde === undefined ? '' : JSON.stringify(govde) };
  if (token) o.headers.Authorization = 'Bearer ' + token;
  var r = UrlFetchApp.fetch(SETCARD_API + yol, o), kod = r.getResponseCode(), j = null;
  try { j = JSON.parse(r.getContentText()); } catch (e) { }
  if (kod !== 200 || !j) throw new Error('SetCard ' + yol + ': HTTP ' + kod + ' ' + r.getContentText().slice(0, 200));
  if (!j.isSuccessfull) throw new Error('SetCard ' + yol + ': ' + (j.errorMessage || ('hata ' + j.errorCode)));
  return j.responseData;
}

function setcardGiris_() {
  var p = PropertiesService.getScriptProperties();
  var vkn = p.getProperty('SETCARD_VKN'), gsm = String(p.getProperty('SETCARD_GSM') || '').replace(/\D/g, '').replace(/^0/, ''), sifre = p.getProperty('SETCARD_SIFRE');
  if (!vkn || !gsm || !sifre) throw new Error('SetCard: Komut dosyası özelliklerine SETCARD_VKN, SETCARD_GSM, SETCARD_SIFRE girilmeli');
  var d = setcardIstek_('Auth/MPosUserLogin', { TaxNo: vkn, GsmNo: gsm, Password: sifre });
  if (!d || !d.Token) throw new Error('SetCard: giriş yanıtında Token yok');
  return d.Token;
}

/* ---------------- 1) İŞLEMLER ---------------- */

// Bir kez: son 31 günün işlemlerini çeker (kontrol sayfası geçmiş günleri de karşılaştırabilsin). Tekrar çalıştırmak zararsız.
function setcardGecmisCek() { var r = setcardCek(31); Logger.log(JSON.stringify(r)); return r; }

function setcardCek(gunSayisi) {
  // Saatlik tetikleyici ilk değişken olarak olay nesnesi verir; sayı değilse varsayılan 3 gün (06–07.10 bu yüzden hiç çalışmadı).
  gunSayisi = typeof gunSayisi === 'number' && gunSayisi > 0 ? gunSayisi : 3;
  var kilit = LockService.getScriptLock(); if (!kilit.tryLock(120000)) return sonCalisma_('setcard', { atlandi: 'meşgul' });
  try {
    var token = setcardGiris_();
    var isyeri = (setcardIstek_('Merchant/SelectMerchantList', undefined, token).merchantList || []);
    var kub = isyeri.map(function (m) { return m.kubID; }).join(',');
    if (!kub) throw new Error('SetCard: işyeri listesi boş');
    var bugun = new Date(), bas = new Date(bugun.getTime() - (gunSayisi || 3) * 86400000), son = new Date(bugun.getTime() + 86400000);
    var f = function (d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); };
    var d = setcardIstek_('Transaction/MPosUserTransactionsList', { StartDate: f(bas), EndDate: f(son), KubIdList: kub }, token);
    var liste = (d && d.mPosUserTransactionsDetail) || [];

    var ss = ykTablo_(), sh = ss.getSheetByName(SETCARD_SEKME);
    if (!sh) { sh = ss.insertSheet(SETCARD_SEKME); sh.getRange(1, 1, 1, SETCARD_BASLIK.length).setValues([SETCARD_BASLIK]).setFontWeight('bold'); sh.setFrozenRows(1); }
    var cSti = SETCARD_BASLIK.indexOf('STI ID'), var_ = {};
    if (sh.getLastRow() > 1) {
      var n = Math.min(8000, sh.getLastRow() - 1);
      sh.getRange(sh.getLastRow() - n + 1, cSti + 1, n, 1).getDisplayValues().forEach(function (r) { var k = String(r[0]).replace(/^'/, ''); if (k) var_[k] = 1; });
    }
    var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss'), yeni = [];
    var m = function (v) { v = String(v == null ? '' : v).trim(); return v ? "'" + v : ''; };   // metin olarak yaz (kart no, kod sayıya dönmesin)
    liste.forEach(function (x) {
      var id = String(x.stiId || ''); if (!id || var_[id]) return; var_[id] = 1;
      var gs = String(x.endOfDayDate || ''); if (/^0001/.test(gs)) gs = '';
      yeni.push([m(String(x.transactionDate || '').replace('T', ' ').slice(0, 19)), Number(x.transactionAmount) || 0,
        m(x.transactionTypeName), x.stiState, m(x.terminalTypeName), m(x.paymentTypeName),
        m(x.cardNumber), m(x.nameSurname), m(x.sutKod), m(id), m(x.merchantName),
        m(gs.replace('T', ' ').slice(0, 19)), damga]);
    });
    if (yeni.length) sh.getRange(sh.getLastRow() + 1, 1, yeni.length, SETCARD_BASLIK.length).setValues(yeni);
    var fatura = null; try { fatura = setcardFaturaTazele_(token); } catch (e) { fatura = 'HATA: ' + e.message; }
    return sonCalisma_('setcard', { isyeri: isyeri.length, gelen: liste.length, eklenen: yeni.length, fatura: fatura });
  } catch (e) { sonCalisma_('setcard', { hata: String(e && e.message || e) }); throw e; }
  finally { kilit.releaseLock(); }
}

/* ---------------- 2) FATURA ---------------- */

function setcardFaturaKuru() { return setcardFatura_(true); }
function setcardFaturaKes() { return setcardFatura_(false); }

function setcardFatura_(kuru) {
  var token = setcardGiris_();
  // Sitede Fatura › Fatura Takibi sayfası (bütün faturalar ve durumları). "Fatura Kes" yalnız faturaDurumu 0 ("Fatura Kesilmedi") olana basılabilir.
  var d = setcardIstek_('Invoice/MPosGetInvoiceList', undefined, token) || {};
  var liste = d.invoiceList || [], rapor = [];
  liste.forEach(function (f) {
    var satir = { takipNo: f.faturaTakipNo, durum: f.faturaDurumAciklama, tutar: f.tutar, odemeTarihi: f.paymentDate, kesilebilir: f.faturaDurumu === 0 };
    if (!kuru && satir.kesilebilir) {
      try { setcardIstek_('Invoice/UpdateMPosInvoiceByTrackingNo', { InvoiceTrackingNo: Number(f.faturaTakipNo) }, token); satir.sonuc = 'kesildi'; }
      catch (e) { satir.sonuc = 'HATA: ' + e.message; }
    }
    rapor.push(satir);
  });
  var aylik = null; try { aylik = setcardIstek_('Report/SelectMonthlyInvoice', undefined, token); } catch (e) { }
  Logger.log((kuru ? 'KURU — ' : '') + rapor.length + ' fatura; kesilebilir: ' + rapor.filter(function (f) { return f.kesilebilir; }).map(function (f) { return f.takipNo + ' (' + f.tutar + ' TL)' + (f.sonuc ? ' → ' + f.sonuc : ''); }).join(', '));
  return { kuru: kuru, fatura: rapor, aylik: aylik };
}

/* ---------------- 3) FATURA SEKMESİ (panel bunu okur) ----------------
 * 'SetCard Fatura': Fatura Takibi'nin kopyası, takip numarasıyla güncellenir (satır silinmez).
 * 'Kesim Zamanı' bu programın kestiği an. Mali fatura burada tutulmaz: panel KolayBi satış faturalarından bulur.
 */
var SETCARD_FATURA_SEKME = 'SetCard Fatura';
var SETCARD_FATURA_BASLIK = ['Takip No', 'Fatura Tarihi', 'Tutar (TL)', 'Durum', 'Ödeme Tarihi', 'Son Kontrol', 'Kesim Zamanı'];

function setcardFaturaTazele_(token) {
  token = token || setcardGiris_();
  var liste = (setcardIstek_('Invoice/MPosGetInvoiceList', undefined, token) || {}).invoiceList || [];
  var ss = ykTablo_(), sh = ss.getSheetByName(SETCARD_FATURA_SEKME);
  if (!sh) { sh = ss.insertSheet(SETCARD_FATURA_SEKME); sh.getRange(1, 1, 1, SETCARD_FATURA_BASLIK.length).setValues([SETCARD_FATURA_BASLIK]).setFontWeight('bold'); sh.setFrozenRows(1); }
  var b = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String), col = function (h) { return b.indexOf(h); };
  var satir = {};
  if (sh.getLastRow() > 1) sh.getRange(2, col('Takip No') + 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(function (r, i) { satir[String(r[0]).replace(/^'/, '')] = i + 2; });
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm'), gun = function (v) { v = String(v || ''); return /^0001|^$/.test(v) ? '' : "'" + v.slice(0, 10); };
  liste.forEach(function (f) {
    var no = String(f.faturaTakipNo || ''); if (!no) return;
    var r = satir[no] || (satir[no] = sh.getLastRow() + 1);
    var deger = { 'Takip No': "'" + no, 'Fatura Tarihi': gun(f.tarih), 'Tutar (TL)': Number(f.tutar) || 0, 'Durum': f.faturaDurumAciklama || '', 'Ödeme Tarihi': gun(f.paymentDate), 'Son Kontrol': damga };
    Object.keys(deger).forEach(function (h) { if (col(h) >= 0) sh.getRange(r, col(h) + 1).setValue(deger[h]); });
  });
  return { fatura: liste.length };
}

// Panelden (veri kapısı → doPost tur 'setcardFaturaKes'): yalnız o takip numarası ve yalnız durumu "Fatura Kesilmedi" ise keser.
function setcardFaturaKesTek_(takipNo) {
  takipNo = String(takipNo || '').replace(/\D/g, ''); if (!takipNo) return { hata: 'Takip numarası yok.' };
  var token = setcardGiris_();
  var f = ((setcardIstek_('Invoice/MPosGetInvoiceList', undefined, token) || {}).invoiceList || []).filter(function (x) { return String(x.faturaTakipNo) === takipNo; })[0];
  if (!f) return { hata: takipNo + ' numaralı fatura SetCard listesinde yok.' };
  if (f.faturaDurumu !== 0) return { hata: 'Fatura "' + f.faturaDurumAciklama + '" durumunda; kesilemez.' };
  setcardIstek_('Invoice/UpdateMPosInvoiceByTrackingNo', { InvoiceTrackingNo: Number(takipNo) }, token);
  setcardFaturaTazele_(token);
  var sh = ykTablo_().getSheetByName(SETCARD_FATURA_SEKME), b = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var nos = sh.getRange(2, b.indexOf('Takip No') + 1, sh.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return String(r[0]).replace(/^'/, ''); });
  var i = nos.indexOf(takipNo); if (i >= 0) sh.getRange(i + 2, b.indexOf('Kesim Zamanı') + 1).setValue(Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm'));
  return { tamam: true, takipNo: takipNo, tutar: f.tutar };
}

