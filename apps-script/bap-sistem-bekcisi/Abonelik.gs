/**
 * ABONELİKLER — ücretli hizmetlerin yenileme tarihleri ve ödeme / kredi sorunları
 * Bilginin sahibi BAP Sistem Nabzı › Abonelikler sekmesidir; bu kod yalnızca doldurur ve kontrol eder.
 *
 *   abonelikGuncelle()  (saatte bir) Gmail'deki son makbuzdan "Son ödeme" ve "Son tutar"ı yazar; aylık / yıllık
 *                       hizmetlerde bir sonraki "Yenileme tarihi"ni hesaplar (son makbuz + 1 ay, tahmini).
 *                       Make'in planını ve yenilenme gününü Make'ten okur.
 *                       Tarihler yalnızca ileri alınır: sahip elle daha ileri bir tarih yazdıysa ona dokunulmaz.
 *                       Boş olmayan "Plan / ücret", "Ne için", "Nereden bakılır" hücrelerine dokunulmaz. Satır silinmez.
 *   abonelikKontrol_()  (bekçi, 15 dk) yenilemesi yaklaşan / geçen hizmetler + son 7 günde gelen "ödeme alınamadı",
 *                       "API erişimi kapandı", "kartın süresi doldu" gibi mailler (o hizmetten daha yeni makbuz yoksa).
 *
 * KURULUM (bir kez, sahibin yapacağı):
 *   1) abonelikKuru()        → hiçbir yere yazmadan, yazacaklarını Yürütme günlüğüne döker. Gmail'i OKUMA izni ister, ver.
 *   2) abonelikOtomatikKur() → yazmayı açar, saatlik tetikleyiciyi kurar, ilk güncellemeyi yapar.
 * Mail atmayan hizmetin tarihini sahibi sekmeye elle yazar; kod o tarihi geri almaz.
 */

var ABONELIK_BASLIK = ['Hizmet', 'Ne için', 'Plan / ücret', 'Yenileme tarihi', 'Nereden bakılır', 'Son ödeme', 'Son tutar', 'Kaynak', 'Güncellendi'];
var ABONELIK_TARIH_SUTUN = ['Yenileme tarihi', 'Son ödeme', 'Güncellendi'];

/* Nereden okunur. tur: 'ay' / 'yil' → yenileme = son makbuz + 1 ay / 1 yıl (tahmini)
 *                      'yukleme'    → ön ödemeli kredi; sabit yenileme yok, yalnız son yükleme ve sorun mailleri izlenir
 *                      'fatura'     → yalnız son fatura yazılır; yenileme tarihini sahip girer
 * makbuz / sorun: Gmail arama söz dizimi (10.10.2026'da sahibin Gmail'indeki gerçek maillerle denendi). */
var ABONELIK_KAYNAK = [
  { hizmet: 'Make.com', make: true },
  { hizmet: 'Anthropic API', tur: 'yukleme', plan: 'API kredisi (ön ödemeli yükleme)',
    makbuz: 'from:invoice+statements@mail.anthropic.com -"extra usage"',
    sorun: 'from:mail.anthropic.com (subject:"API access is turned off" OR subject:"credit balance is low" OR subject:unsuccessful)',
    cozum: 'console.anthropic.com › Billing: kredi yükle ve "Auto-reload"u aç; kart reddediyorsa kartı güncelle.' },
  { hizmet: 'Claude', tur: 'yukleme', plan: 'claude.ai ek kullanım (ön ödemeli)',
    makbuz: 'from:invoice+statements@mail.anthropic.com "extra usage"' },
  { hizmet: 'ChatGPT / OpenAI', tur: 'ay', plan: 'ChatGPT Plus $20/ay',
    makbuz: 'from:tm.openai.com "ChatGPT Plus" -subject:sign-in',
    sorun: 'from:tm.openai.com (subject:failed OR subject:declined OR subject:başarısız OR subject:"payment issue")',
    cozum: 'chatgpt.com › Ayarlar › Plan: ödeme yöntemini kontrol et.' },
  { hizmet: 'OpenAI API', tur: 'yukleme', plan: 'API kredisi (ön ödemeli yükleme)', makbuz: 'from:tm.openai.com subject:funded' },
  { hizmet: 'Google One / Drive', tur: 'ay', plan: 'Google AI Pro 5 TB (Google Play)',
    makbuz: 'from:googleplay-noreply@google.com (subject:makbuz OR subject:receipt)',
    sorun: 'from:googleplay-noreply@google.com (subject:issue OR subject:reddedildi OR subject:declined OR subject:iptal)',
    cozum: 'Google Play › Ödemeler ve abonelikler › Google One: süresi dolan kartı yenisiyle değiştir. Abonelik düşerse Drive 5 TB alanı kapanır, tablolar ve yedekler yazılamaz.' },
  { hizmet: 'Google Workspace', tur: 'ay', plan: 'bappizza.com e-posta',
    makbuz: 'from:payments-noreply@google.com "Google Workspace"',
    sorun: '(from:workspace@google.com OR from:workspace-noreply@google.com OR from:payments-noreply@google.com) Workspace (subject:suspended OR subject:declined OR subject:askıya OR subject:reddedildi OR subject:"action required")',
    cozum: 'admin.google.com › Faturalandırma.' },
  { hizmet: 'Google Cloud', tur: 'ay', plan: 'Kullandıkça öde',
    makbuz: 'from:payments-noreply@google.com "Google Cloud" ("ödemenizi aldık" OR "payment received")',
    sorun: 'from:payments-noreply@google.com "Google Cloud" (subject:declined OR subject:reddedildi OR subject:suspended OR subject:askıya OR subject:yapılamadı)',
    cozum: 'console.cloud.google.com › Faturalandırma.' },
  { hizmet: 'Adisyo', tur: 'fatura', makbuz: 'from:e.sovostr.com adisyo' }
];

/* 10.10.2026 Gmail taramasında bulunanlar. Yalnızca BOŞ hücreleri doldurur; sahibin yazdığını ezmez.
 * [Hizmet, Ne için, Plan / ücret, Yenileme tarihi (yyyy-MM-dd ya da ''), Nereden bakılır] */
var ABONELIK_BASLANGIC = [
  ['Make.com', 'WhatsApp botu, müşteri memnuniyeti, AI motoru', 'Core', '', 'make.com › Organization › Subscription'],
  ['Claude', 'Departman ajanları, kod', '', '', 'claude.ai › Settings › Billing'],
  ['Anthropic API', 'Make\'teki Claude modülleri', '', '', 'console.anthropic.com › Billing'],
  ['ChatGPT / OpenAI', 'Sohbet', '', '', 'chatgpt.com › Ayarlar › Plan'],
  ['OpenAI API', 'Make\'teki AI senaryoları', '', '', 'platform.openai.com › Billing'],
  ['Google One / Drive', 'Bütün tablolar (5 TB alan)', '', '', 'Google Play › Abonelikler · one.google.com'],
  ['Google Workspace', 'bappizza.com e-postaları', 'Aylık; ücretli dönem 01.10.2026\'da başladı', '2026-11-01', 'admin.google.com › Faturalandırma'],
  ['bappizza.com alan adı', 'Web sitesi ve e-posta adresi', 'Yıllık (12.09.2026\'da alındı)', '2027-09-12', 'admin.google.com › Alan adları'],
  ['Google Cloud', 'Google API kullanımı', '', '', 'console.cloud.google.com › Faturalandırma'],
  ['Adisyo', 'Kasa / sipariş', 'Yıllık lisans ≈ ₺29.655 (13.02.2026 faturası; tahmini)', '2027-02-13', 'Adisyo hesabı'],
  ['Cloudflare', 'Mutfak ve yönetim paneli', 'Ücretsiz', '', 'dash.cloudflare.com'],
  ['WhatsApp Business (Meta)', 'Bot mesajları', '', '', 'business.facebook.com › Ödemeler'],
  ['KolayBi', 'Fatura', '', '', 'KolayBi hesabı'],
  ['HemenYolda', 'Kurye takibi', '', '', 'HemenYolda hesabı']
];

/* ============================ Giriş noktaları ============================ */

/** KURU: hiçbir yere yazmaz; bulduklarını ve yazacaklarını Yürütme günlüğüne döker. */
function abonelikKuru() {
  var r = abonelikCalis_(false);
  Logger.log(r);
  return r;
}

function abonelikOtomatikKur() {
  PropertiesService.getScriptProperties().setProperty('ABONELIK_YAZ', 'evet');
  abonelikSekmesiKur();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'abonelikGuncelle') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('abonelikGuncelle').timeBased().everyHours(1).create();
  var r = abonelikCalis_(true);
  Logger.log(r);
  return 'Kuruldu: abonelikler saatte bir Gmail ve Make\'ten güncellenecek.';
}

/** Saatlik tetikleyicinin çalıştırdığı fonksiyon. Yazma kapalıysa yalnız günlüğe yazar. */
function abonelikGuncelle() {
  var yaz = PropertiesService.getScriptProperties().getProperty('ABONELIK_YAZ') === 'evet';
  Logger.log(abonelikCalis_(yaz));
}

/** Abonelikler sekmesini (yoksa) kurar. Varsa dokunmaz; eksik sütunları abonelikGuncelle ekler. */
function abonelikSekmesiKur() {
  var ss = SpreadsheetApp.openById(NABIZ_ID);
  if (ss.getSheetByName('Abonelikler')) return 'Abonelikler sekmesi zaten var.';
  var sh = ss.insertSheet('Abonelikler');
  sh.getRange(1, 1, 1, ABONELIK_BASLIK.length).setValues([ABONELIK_BASLIK]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return 'Abonelikler sekmesi kuruldu.';
}

/* ============================ Okuma ve yazma ============================ */

function abonelikCalis_(yaz) {
  var simdi = new Date(), bulgular = [], notlar = [];
  ABONELIK_BASLANGIC.forEach(function (s) {
    bulgular.push({ hizmet: s[0], neIcin: s[1], plan: s[2], tarih: s[3] ? tarihOku_(s[3]) : null, nereden: s[4], bosIse: true, kaynak: 'Gmail taraması 10.10.2026 (tahmini)' });
  });
  ABONELIK_KAYNAK.forEach(function (k) {
    try {
      var b = k.make ? makeAbonelik_() : gmailAbonelik_(k);
      if (b) bulgular.push(b); else notlar.push(k.hizmet + ': makbuz bulunamadı');
    } catch (e) { notlar.push(k.hizmet + ': okunamadı (' + (e && e.message || e) + ')'); }
  });
  var sh = SpreadsheetApp.openById(NABIZ_ID).getSheetByName('Abonelikler');
  var v = sh && sh.getLastRow() > 0 ? sh.getRange(1, 1, sh.getLastRow(), Math.max(1, sh.getLastColumn())).getValues() : [[]];
  var plan = abonelikPlani_(v, bulgular, simdi);
  var metin = [(yaz ? 'YAZILDI' : 'KURU (yazılmadı)') + ': ' + plan.islem.length + ' hücre'];
  plan.islem.forEach(function (x) { metin.push('  satır ' + (x.r + 1) + ' · ' + x.ad + ' · ' + x.sutun + ': ' + gorunen_(x.eski) + ' → ' + gorunen_(x.yeni)); });
  if (notlar.length) metin.push('Notlar:', '  ' + notlar.join('\n  '));
  if (yaz && sh && plan.islem.length) {
    plan.islem.forEach(function (x) { sh.getRange(x.r + 1, x.c + 1).setValue(x.yeni); });
    var son = Math.max(sh.getLastRow(), 2);
    ABONELIK_TARIH_SUTUN.forEach(function (h) { var c = plan.baslik.indexOf(h); if (c >= 0) sh.getRange(2, c + 1, son - 1, 1).setNumberFormat('dd.mm.yyyy'); });
    sh.getRange(1, 1, 1, plan.baslik.length).setFontWeight('bold');
  }
  return metin.join('\n');
}

function gmailAbonelik_(k) {
  var m = sonMail_(k.makbuz + ' newer_than:400d');
  if (!m) return null;
  var t = m.getDate(), b = { hizmet: k.hizmet, plan: k.plan || '', sonOdeme: t, tutar: tutarBul_(m.getSubject() + '\n' + m.getPlainBody()) };
  if (k.tur === 'ay' || k.tur === 'yil') { b.tarih = k.tur === 'ay' ? ayEkle_(t, 1) : ayEkle_(t, 12); b.kaynak = 'Gmail makbuzu + 1 ' + (k.tur === 'ay' ? 'ay' : 'yıl') + ' (tahmini)'; }
  else b.kaynak = 'Gmail makbuzu';
  return b;
}

function makeAbonelik_() {
  var token = PropertiesService.getScriptProperties().getProperty('MAKE_TOKEN');
  if (!token) return null;
  var org = makeGet_(token, '/organizations/' + MAKE_ORG);
  if (org.hata) throw new Error(org.hata);
  var o = org.veri.organization || org.veri, kota = Number(o.license && o.license.operations) || 0;
  return { hizmet: 'Make.com', plan: (o.productName || o.serviceName || '') + (kota ? ' · ' + kota.toLocaleString('tr-TR') + ' işlem/ay' : ''),
           tarih: o.nextReset ? new Date(o.nextReset) : null, kaynak: 'Make (işlem kotasının yenilendiği gün)' };
}

// Aramaya uyan en yeni mail (GmailApp yalnız okunur; izin: gmail.readonly).
// Sahibin kendi gönderdiği mailler atlanır: Adisyo faturaları muhasebeciye aynı konuşmadan iletiliyor.
function sonMail_(sorgu) {
  var th = GmailApp.search(sorgu + ' -in:sent', 0, 3), en = null;
  th.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      if (String(m.getFrom()).toLowerCase().indexOf(SAHIP_MAIL) >= 0) return;
      if (!en || m.getDate() > en.getDate()) en = m;
    });
  });
  return en;
}

/* Saf hesap (test edilir): sekmenin mevcut değerleri + bulgular → yazılacak hücreler.
 * v: sekmenin bütün değerleri (1. satır başlık). Dönüş: { baslik, islem: [{r, c, sutun, ad, eski, yeni}] } (r, c 0'dan) */
function abonelikPlani_(v, bulgular, simdi) {
  var b = (v[0] || []).map(function (x) { return String(x).trim(); });
  var islem = [];
  ABONELIK_BASLIK.forEach(function (h) { if (b.indexOf(h) < 0) { islem.push({ r: 0, c: b.length, sutun: h, ad: '(başlık)', eski: '', yeni: h }); b.push(h); } });
  var c = function (h) { return b.indexOf(h); };
  var yeniSatir = {}, sonr = Math.max(v.length, 1);
  var deger = function (r, h) { var x = r < v.length ? v[r][c(h)] : (yeniSatir[r] || {})[h]; return x === undefined || x === null ? '' : x; };
  var bul = function (ad) {
    for (var r = 1; r < sonr; r++) if (adEsit_(deger(r, 'Hizmet'), ad)) return r;
    return -1;
  };
  var koy = function (r, h, yeni, ad) {
    var eski = deger(r, h);
    if (r >= v.length) (yeniSatir[r] = yeniSatir[r] || {})[h] = yeni;
    islem.push({ r: r, c: c(h), sutun: h, ad: ad, eski: eski, yeni: yeni });
  };
  var gun = function (t) { return t ? new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() : null; };

  bulgular.forEach(function (x) {
    var r = bul(x.hizmet), degisti = false;
    if (r < 0) { r = sonr++; koy(r, 'Hizmet', x.hizmet, x.hizmet); }
    var bosaYaz = function (h, val) { if (val && String(deger(r, h)).trim() === '') { koy(r, h, val, x.hizmet); degisti = true; } };
    bosaYaz('Ne için', x.neIcin);
    bosaYaz('Nereden bakılır', x.nereden);
    bosaYaz('Plan / ücret', x.plan);
    var eskiT = tarihOku_(deger(r, 'Yenileme tarihi'));
    if (x.tarih && (!eskiT || (!x.bosIse && gun(x.tarih) > gun(eskiT)))) { koy(r, 'Yenileme tarihi', gun_(x.tarih), x.hizmet); degisti = true; }
    var eskiO = tarihOku_(deger(r, 'Son ödeme'));
    if (x.sonOdeme && (!eskiO || gun(x.sonOdeme) > gun(eskiO))) {
      koy(r, 'Son ödeme', gun_(x.sonOdeme), x.hizmet); degisti = true;
      if (x.tutar && x.tutar !== deger(r, 'Son tutar')) koy(r, 'Son tutar', x.tutar, x.hizmet);
    }
    if (degisti && x.kaynak && (!x.bosIse || deger(r, 'Kaynak') === '')) { if (deger(r, 'Kaynak') !== x.kaynak) koy(r, 'Kaynak', x.kaynak, x.hizmet); }
    if (degisti && !x.bosIse) koy(r, 'Güncellendi', gun_(simdi), x.hizmet);
  });
  return { baslik: b, islem: islem };
}

/* ============================ Bekçi kontrolü ============================ */

function abonelikKontrol_(simdi) {
  var sorunlar = odemeSorunlari_();
  var sh = SpreadsheetApp.openById(NABIZ_ID).getSheetByName('Abonelikler');
  var v = sh && sh.getLastRow() >= 2 ? sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues() : [[]];
  return abonelikSatirlari_(v, sorunlar, simdi);
}

// Son 7 günde gelen sorun mailleri; o hizmetten daha yeni bir makbuz geldiyse sorun kapanmış sayılır.
function odemeSorunlari_() {
  var out = [];
  ABONELIK_KAYNAK.forEach(function (k) {
    if (!k.sorun) return;
    var m = sonMail_(k.sorun + ' newer_than:7d');
    if (!m) return;
    var mb = k.makbuz ? sonMail_(k.makbuz + ' newer_than:8d') : null;
    if (mb && mb.getDate() > m.getDate()) return;
    out.push({ hizmet: k.hizmet, zaman: m.getDate(), konu: m.getSubject(), cozum: k.cozum || '' });
  });
  return out;
}

/* Saf hesap (test edilir): sekme + sorun mailleri → bekçi satırları. */
function abonelikSatirlari_(v, sorunlar, simdi) {
  var b = (v[0] || []).map(function (x) { return String(x).trim(); });
  var cH = b.indexOf('Hizmet'), cT = b.indexOf('Yenileme tarihi'), cP = b.indexOf('Plan / ücret'), cN = b.indexOf('Nereden bakılır'), cO = b.indexOf('Son ödeme'), cK = b.indexOf('Kaynak');
  var SIRA = { OK: 0, UYARI: 1, SORUN: 2 }, kullanildi = {}, out = [];
  var f = function (t) { return Utilities.formatDate(t, TZ_B, 'dd.MM.yyyy'); };
  var sorunSatiri = function (r, s) {
    var agir = /turned off|unsuccessful|reddedildi|declined|suspended|askıya|iptal|failed|başarısız|yapılamadı/i.test(s.konu) ? 'SORUN' : 'UYARI';
    if (SIRA[agir] > SIRA[r.durum || 'OK']) r.durum = agir;
    r.detay = 'Mail (' + f(s.zaman) + '): "' + String(s.konu).slice(0, 120) + '". ' + (r.detay || '');
    if (s.cozum) r.cozum = s.cozum;
  };
  for (var i = 1; i < v.length && cH >= 0; i++) {
    var ad = String(v[i][cH] || '').trim();
    if (!ad) continue;
    var t = cT >= 0 ? tarihOku_(v[i][cT]) : null, son = cO >= 0 ? tarihOku_(v[i][cO]) : null;
    var s = sorunlar.filter(function (x) { return adEsit_(x.hizmet, ad); })[0];
    if (!t && !son && !s) continue;
    var plan = cP >= 0 && v[i][cP] ? v[i][cP] + ' · ' : '';
    var r = { grup: 'Abonelikler', ad: ad, nerede: cN >= 0 ? String(v[i][cN] || '') : '',
              cozum: 'Kartın limiti ve son kullanma tarihi yeterli mi kontrol et. Mail atmayan hizmetin tarihini yenilenince sekmede elle ileri al.' };
    if (t) {
      var gun = Math.floor((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate())) / 86400000);
      var tahmini = cK >= 0 && /tahmini/.test(String(v[i][cK] || '')) ? ' (tahmini)' : '';
      r.durum = gun < -2 ? 'SORUN' : gun <= 7 ? 'UYARI' : 'OK';
      r.detay = plan + (gun < -2 ? 'Yenileme tarihi ' + (-gun) + ' gün önce geçti ve yeni makbuz gelmedi: ödeme yapıldı mı? Yapıldıysa sekmedeki tarihi ileri al.'
        : gun < 0 ? 'Yenileme günü geçti (' + f(t) + '); makbuz maili bekleniyor.'
        : gun === 0 ? 'Bugün yenileniyor' + tahmini + '.'
        : gun + ' gün sonra yenileniyor (' + f(t) + tahmini + ').');
    } else { r.durum = 'OK'; r.detay = plan + 'Son ödeme ' + f(son) + '.'; }
    if (s) { kullanildi[s.hizmet] = true; sorunSatiri(r, s); }
    out.push(r);
  }
  sorunlar.forEach(function (s) {
    if (kullanildi[s.hizmet]) return;
    var r = { grup: 'Abonelikler', ad: s.hizmet, durum: 'OK', detay: '', nerede: 'Gmail' };
    sorunSatiri(r, s);
    out.push(r);
  });
  return out;
}

/* ============================ Yardımcılar ============================ */

function adEsit_(a, b) { return String(a || '').toLocaleLowerCase('tr').trim() === String(b || '').toLocaleLowerCase('tr').trim(); }

function gun_(t) { return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }

// Ay ekler; 31 Ocak + 1 ay → 28/29 Şubat (ayın son günü aşılmaz)
function ayEkle_(t, n) {
  var y = t.getFullYear(), a = t.getMonth() + n, g = t.getDate();
  var ayinSonu = new Date(y, a + 1, 0).getDate();
  return new Date(y, a, Math.min(g, ayinSonu));
}

// Makbuzdaki ödenen tutar: "Amount paid $24.00", "We charged $12.00", "₺250,00 tutarındaki", "Toplam: ₺869,99"
function tutarBul_(metin) {
  metin = String(metin || '');
  var m = metin.match(/(?:amount paid|total|toplam|tutar|charged|ödenen)[^0-9$₺€]{0,40}((?:US)?\$|₺|€)\s?(\d[\d.,]*\d)/i);
  if (m) return m[1] + m[2];
  m = metin.match(/((?:US)?\$|₺|€)\s?(\d[\d.,]*\d)/);
  if (m) return m[1] + m[2];
  m = metin.match(/(\d[\d.,]*\d)\s?(TL|TRY)\b/);
  return m ? m[1] + ' ' + m[2] : '';
}

function gorunen_(x) {
  if (Object.prototype.toString.call(x) === '[object Date]') return Utilities.formatDate(x, TZ_B, 'dd.MM.yyyy');
  return x === '' || x === null || x === undefined ? '(boş)' : String(x);
}
