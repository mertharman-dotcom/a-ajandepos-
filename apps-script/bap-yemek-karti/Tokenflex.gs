/**
 * Tokenflex (uye.tokenflex.com.tr) — Apps Script doğrudan çeker (robot doğrulaması yok), saatte bir (Kurulum.gs).
 *   Giriş: SMS doğrulamalı (tfGiris_ açıklaması); token 10 saat saklanır.
 *   İşlemler: POST Invoices/GetTransactionListFo (sayfalı) → 'Tokenflex' (Ref = cardTransactionId; terminal → kişi adı terminal listesinden)
 *   Faturalar: GET Invoices/GetInvoiceList → 'Tokenflex Fatura' (Fatura No = KolayBi no; 'Ödendi' → Finans alacaktan düşer;
 *              'Açık' = henüz faturalanmamış biriken dönem)
 * Komut dosyası özellikleri: TOKENFLEX_KULLANICI (e-posta), TOKENFLEX_SIFRE, isteğe bağlı TOKENFLEX_ISYERI (varsayılan 320096).
 * Faturayı sahibi mobil uygulamadan keser (06.10); program kesmez.
 */
var TF_API = 'https://tokenflex-api.tokenflex.com.tr/MerchantPortal/';
var TF_BASLIK = ['İşlem Zamanı', 'Tutar (TL)', 'Durum', 'İşlem Türü', 'Terminal No', 'Cihaz / Kullanıcı', 'Telefon', 'Ref', 'Gün Sonu', 'Kayıt Zamanı'];
var TF_FATURA_BASLIK = ['Talep No', 'Fatura No', 'Dönem Başı', 'Dönem Sonu', 'Tutar (TL)', 'Net Ödeme (TL)', 'Komisyon (TL)', 'Durum', 'Vade', 'Ödeme Tarihi', 'Son Kontrol'];

function tfIstek_(yol, govde, token) {
  var o = { method: govde === undefined ? 'get' : 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Accept: 'application/json', Origin: 'https://uye.tokenflex.com.tr', Referer: 'https://uye.tokenflex.com.tr/' } };
  if (govde !== undefined) o.payload = JSON.stringify(govde);
  if (token) o.headers.Authorization = 'Bearer ' + token;
  var r = UrlFetchApp.fetch(TF_API + yol, o), kod = r.getResponseCode(), j = null;
  try { j = JSON.parse(r.getContentText()); } catch (e) { }
  if (kod === 401 || /Un_Authorized/i.test(r.getContentText())) PropertiesService.getScriptProperties().deleteProperty('TOKENFLEX_TOKEN');   // süresi bitmiş / geçersiz anahtar
  if (kod === 401) throw new Error('Tokenflex ' + yol + ': yetkisiz (oturum açılamadı)');
  if (kod !== 200 || !j) throw new Error('Tokenflex ' + yol + ': HTTP ' + kod + ' ' + r.getContentText().slice(0, 200));
  if (j.isOk === false || (j.data && j.data.isSuccess === false)) throw new Error('Tokenflex ' + yol + ': ' + ((j.error && (j.error.message || JSON.stringify(j.error))) || (j.data && j.data.message) || 'hata'));
  return j.data;
}
/* Giriş (08.10'dan beri SMS doğrulamalı; sahibinin HAR'ı):
 *   Authentication/Login → twoFactorData {loginAttemptId, otpGuid} → SendMerchantPortalLoginOtp {loginAttemptId, otpType: 1 (SMS), otpGuid}
 *   → SMS (4 hane) iPhone kestirmesiyle kod kutusuna (kaynak 'tokenflex') → VerifyMerchantPortalLoginOtp {…, otpCode} → token (10 saat).
 * Token saklanır (TOKENFLEX_TOKEN) ve süresi bitene kadar yeniden giriş yapılmaz: günde 2–3 SMS. Gece 01–09 arası SMS istenmez;
 * kod 3 dakikada gelmezse 2 saat yeniden denenmez (TOKENFLEX_2FA) — sahibine üst üste SMS gitmesin. */
function tfGiris_() {
  var p = PropertiesService.getScriptProperties(), k = p.getProperty('TOKENFLEX_KULLANICI'), s = p.getProperty('TOKENFLEX_SIFRE');
  if (!k || !s) throw new Error('Tokenflex: Komut dosyası özelliklerine TOKENFLEX_KULLANICI ve TOKENFLEX_SIFRE girilmeli');
  var kayit = JSON.parse(p.getProperty('TOKENFLEX_TOKEN') || 'null');
  if (kayit && kayit.son - Date.now() > 15 * 60000) return kayit.t;
  var d = tfIstek_('Authentication/Login', { username: k, password: s, rememberMe: true });
  if (d && d.token && !d.twoFactorData) return tfTokenSakla_(p, d);
  var tf = d && d.twoFactorData; if (!tf || !tf.loginAttemptId) throw new Error('Tokenflex girişte bilinmeyen ek doğrulama istiyor');
  var saat = +Utilities.formatDate(new Date(), TZ, 'H');
  if (saat >= 1 && saat < 9) throw new Error('Tokenflex SMS doğrulaması gece istenmez (01–09); sabah alınır');
  var son = Number(p.getProperty('TOKENFLEX_2FA') || 0);
  if (son && Date.now() - son < 2 * 3600000) throw new Error('Tokenflex SMS kodu son denemede gelmedi; 2 saat beklenecek (TOKENFLEX_2FA)');
  kodKutusu_({ tur: 'kodIste', kaynak: 'tokenflex' });
  // Site SMS'i gönderdiği hâlde isSuccess:false döndürüyor (HAR, 08.10) → yalnız bağlantı / yetki hatası durdurur
  try { tfIstek_('Authentication/SendMerchantPortalLoginOtp', { loginAttemptId: tf.loginAttemptId, otpType: 1, otpGuid: tf.otpGuid }); }
  catch (e) { if (/HTTP|yetkisiz/.test(String(e.message))) throw e; }
  var kod = null;
  for (var i = 0; i < 36 && !kod; i++) { Utilities.sleep(5000); kod = kodKutusu_({ tur: 'kodOku', kaynak: 'tokenflex' }).kod; }
  if (!kod) { p.setProperty('TOKENFLEX_2FA', String(Date.now())); throw new Error('Tokenflex SMS kodu 3 dakikada gelmedi (kestirme: kaynak=tokenflex)'); }
  kodKutusu_({ tur: 'kodSil', kaynak: 'tokenflex' });
  var v = tfIstek_('Authentication/VerifyMerchantPortalLoginOtp', { loginAttemptId: tf.loginAttemptId, otpType: 1, otpCode: String(kod), otpGuid: tf.otpGuid });
  if (!v || !v.token) throw new Error('Tokenflex SMS kodu kabul edilmedi');
  p.deleteProperty('TOKENFLEX_2FA');
  return tfTokenSakla_(p, v);
}
function tfTokenSakla_(p, d) {
  p.setProperty('TOKENFLEX_TOKEN', JSON.stringify({ t: d.token, son: Date.now() + (Number(d.expiresIn) || 36000) * 1000 }));
  return d.token;
}

function tokenflexCek(gunSayisi) {
  // Saatlik tetikleyici ilk değişken olarak olay nesnesi verir; sayı değilse varsayılan 3 gün (06–07.10 bu yüzden hiç çalışmadı).
  gunSayisi = typeof gunSayisi === 'number' && gunSayisi > 0 ? gunSayisi : 3;
  // Giriş kilitten önce: SMS kodu 3 dakikaya kadar beklenebilir, Mac programlarının kayıtları o sırada kilide takılmasın.
  var token; try { token = tfGiris_(); } catch (e) { sonCalisma_('tokenflex', { hata: String(e && e.message || e) }); throw e; }
  var kilit = LockService.getScriptLock(); if (!kilit.tryLock(120000)) return sonCalisma_('tokenflex', { atlandi: 'meşgul' });
  try {
    var isyeri = Number(PropertiesService.getScriptProperties().getProperty('TOKENFLEX_ISYERI') || 320096);
    var f = function (d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }, bugun = new Date();
    // terminal → kişi (SoftPOS satırında contactName ve 'Gsm: 5xx…')
    var kisi = {};
    try { (tfIstek_('Terminals/GetTerminalList', { merchantNo: isyeri, pageRequest: { pageSize: 200, isDesc: false, pageIndex: 0, sortColumn: 'terminalNo' } }, token).items || [])
      .forEach(function (t) { var gsm = (String(t.terminalName || '').match(/Gsm:\s*(\d{10})/) || [])[1] || '';
        kisi[String(t.terminalNo)] = { ad: String(t.contactName || '').trim(), gsm: gsm }; }); } catch (e) { }
    var liste = [], sayfa = 1, devam = true;
    while (devam && sayfa <= 50) {
      var d = tfIstek_('Invoices/GetTransactionListFo', { merchantNo: [isyeri], serviceId: null, status: null,
        startDate: f(new Date(bugun.getTime() - (gunSayisi || 3) * 86400000)), endDate: f(new Date(bugun.getTime() + 86400000)),
        batchStartDate: null, batchEndDate: null, includeSubMerchant: false, terminals: null,
        pageRequest: { pageSize: 100, isDesc: false, pageIndex: sayfa, sortColumn: 'batch_time' } }, token) || {};
      liste = liste.concat(d.items || []); devam = !!d.hasNext && (d.items || []).length > 0; sayfa++;
    }
    var ss = ykTablo_(), sh = ss.getSheetByName('Tokenflex');
    if (!sh) { sh = ss.insertSheet('Tokenflex'); sh.getRange(1, 1, 1, TF_BASLIK.length).setValues([TF_BASLIK]).setFontWeight('bold'); sh.setFrozenRows(1); }
    var cRef = TF_BASLIK.indexOf('Ref'), cDur = TF_BASLIK.indexOf('Durum'), var_ = {};
    if (sh.getLastRow() > 1) { var n = Math.min(8000, sh.getLastRow() - 1), ilk = sh.getLastRow() - n + 1;
      sh.getRange(ilk, 1, n, TF_BASLIK.length).getDisplayValues().forEach(function (r, i) { var k = String(r[cRef]).replace(/^'/, ''); if (k) var_[k] = { satir: ilk + i, durum: r[cDur] }; }); }
    var t = function (v) { v = String(v == null ? '' : v).trim(); return v ? "'" + v : ''; };
    var z = function (v) { var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/); return m ? m[3] + '.' + m[2] + '.' + m[1] + ' ' + m[4] : ''; };
    var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss'), yeni = [], guncel = 0;
    liste.forEach(function (x) {
      var ref = String(x.cardTransactionId || x.referenceId || ''); if (!ref) return;
      var durum = String(x.statusText || ''), v = var_[ref];
      if (v) { if (v.satir > 0 && durum && v.durum !== durum) { sh.getRange(v.satir, cDur + 1).setValue(durum); guncel++; } return; }
      var k = kisi[String(x.terminalNo)] || {};
      var_[ref] = { satir: -1, durum: durum };
      yeni.push([t(z(x.transactionDts)), Number(x.transactionAmount) || 0, t(durum), t(x.transactionTypeText), t(x.terminalNo), t(k.ad), t(k.gsm), t(ref), t(z(x.batchTime)), damga]);
    });
    if (yeni.length) sh.getRange(sh.getLastRow() + 1, 1, yeni.length, TF_BASLIK.length).setValues(yeni);
    var fatura = null; try { fatura = tokenflexFaturaTazele_(token, isyeri); } catch (e) { fatura = 'HATA: ' + e.message; }
    return sonCalisma_('tokenflex', { gelen: liste.length, eklenen: yeni.length, durumGuncel: guncel, terminal: Object.keys(kisi).length, fatura: fatura });
  } catch (e) { sonCalisma_('tokenflex', { hata: String(e && e.message || e) }); throw e; }
  finally { kilit.releaseLock(); }
}

function tokenflexFaturaTazele_(token, isyeri) {
  var l = (tfIstek_('Invoices/GetInvoiceList?merchantNo=' + isyeri, undefined, token) || {}).items || [];
  var ss = ykTablo_(), sh = ss.getSheetByName('Tokenflex Fatura');
  if (!sh) { sh = ss.insertSheet('Tokenflex Fatura'); sh.getRange(1, 1, 1, TF_FATURA_BASLIK.length).setValues([TF_FATURA_BASLIK]).setFontWeight('bold'); sh.setFrozenRows(1); }
  var satir = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(function (r, i) { satir[String(r[0]).replace(/^'/, '')] = i + 2; });
  var g = function (v) { v = String(v || ''); return /^\d{4}-\d{2}-\d{2}/.test(v) ? "'" + v.slice(8, 10) + '.' + v.slice(5, 7) + '.' + v.slice(0, 4) : ''; };
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm');
  l.forEach(function (x) {
    var id = String(x.paymentClaimId || ''); if (!id) return;
    var r = satir[id] || (satir[id] = sh.getLastRow() + 1);
    sh.getRange(r, 1, 1, TF_FATURA_BASLIK.length).setValues([["'" + id, x.fiscalInvoiceNumber ? "'" + x.fiscalInvoiceNumber : '', g(x.startDate), g(x.endDate),
      Number(x.paymentClaimAmount) || 0, Number(x.paymentAmount) || 0, Number(x.commissionAmount) || 0, x.paymentClaimStatusName || '',
      g(x.electronicInvoicePaymentDate), g(x.actualPaymentDate || (/ödendi/i.test(String(x.paymentClaimStatusName || '')) ? x.payDate : '')), damga]]);
  });
  return { fatura: l.length };
}
