/**
 * SetCard.gs — SetCard çekimleri ve fatura (06.10.2026)
 *
 * SetCard üye işyeri sitesi (uye.setcard.com.tr) düz bir JSON API kullanıyor (api.setcard.com.tr), SMS / robot doğrulaması yok.
 * Bu yüzden MacBook gerekmez; Apps Script doğrudan çeker.
 *   setcardCek()        – son 3 günün işlemlerini YEMEKKARTI › SetCard sekmesine EKLER (STI ID ile; aynı işlem iki kez yazılmaz)
 *   setcardFaturaKuru() – kesilmeyi bekleyen faturaları listeler, hiçbir şey kesmez
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

function setcardCek(gunSayisi) {
  var kilit = LockService.getScriptLock(); if (!kilit.tryLock(30000)) return { atlandi: 'meşgul' };
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
    return { isyeri: isyeri.length, gelen: liste.length, eklenen: yeni.length };
  } finally { kilit.releaseLock(); }
}

/* ---------------- 2) FATURA ---------------- */

function setcardFaturaKuru() { return setcardFatura_(true); }
function setcardFaturaKes() { return setcardFatura_(false); }

function setcardFatura_(kuru) {
  var token = setcardGiris_();
  var d = setcardIstek_('Invoice/MPosGetUnpaidInvoiceList', undefined, token) || {};
  var liste = d.invoiceList || [], rapor = [];
  liste.forEach(function (f) {
    var satir = { takipNo: f.faturaTakipNo, durum: f.faturaDurumAciklama, kesilebilir: f.faturaDurumu === 0, alan: f };
    if (!kuru && satir.kesilebilir) {
      try { setcardIstek_('Invoice/UpdateMPosInvoiceByTrackingNo', { InvoiceTrackingNo: Number(f.faturaTakipNo) }, token); satir.sonuc = 'kesildi'; }
      catch (e) { satir.sonuc = 'HATA: ' + e.message; }
    }
    rapor.push(satir);
  });
  var aylik = null; try { aylik = setcardIstek_('Report/SelectMonthlyInvoice', undefined, token); } catch (e) { }
  Logger.log((kuru ? 'KURU — ' : '') + JSON.stringify({ fatura: rapor, aylik: aylik }));
  return { kuru: kuru, fatura: rapor, aylik: aylik };
}
