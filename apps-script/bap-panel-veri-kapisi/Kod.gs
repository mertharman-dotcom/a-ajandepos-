/**
 * BAP Yönetim Paneli — Veri Kapısı (Google Apps Script)
 *
 * Ne yapar: Panel verisini tablolardan OKUR ve özet olarak panele verir.
 * Yazma: Yalnızca sahibin panelden verdiği cevabı yazar (doPost): ilgili sorunun Cevap hücresine ekler ve
 *        'BAP Panel Cevapları' tablosuna kayıt düşer. Toptancı ödemesi girilince 'Kolaybi Fatura Ham Veri › Odemeler'
 *        sekmesinin sonuna yeni satır ekler. Puantaj düzeltmesinde yalnız o günün satırındaki giriş/çıkış, toplam,
 *        fazla mesai, açıklama ve Manuel hücrelerini günceller (Ham Giriş/Çıkış değişmez). Kurye açık hesabı kapatılınca 'Kurye Net Çalışma Süresi › Tahsilatlar'
 *        sekmesine (kuryeden kesilirse ayrıca 'Kesintiler' sekmesine) yeni satır ekler; panelden girilen kurye
 *        kesintisi 'Kesintiler' sekmesine yeni satır olarak yazılır. Kurye eşleştirmesinde Adisyo 'Satıs Verileri' › Kurye
 *        hücresi yazılır (yalnız boş olan ya da sahibin onayladığı); önceki değer 'Kurye Eşleştirme' sekmesine düşer. Başka hiçbir hücreyi değiştirmez, hiçbir şey silmez.
 * Gizlilik: Müşteri adı, telefonu, adresi ve personel kişisel bilgisi dışarı verilmez; yalnız toplamlar döner.
 * Erişim: Yalnızca doğru anahtarla gelen isteğe cevap verir. Anahtar koda yazılmaz, Komut Dosyası Özelliklerinde durur.
 *
 * Kurulum sırası: 1) anahtarOlustur çalıştır  2) testEt çalıştır  3) Web uygulaması olarak yayınla.
 */

var TZ = 'Europe/Istanbul';

// beklenenDk: kaynağın normalde en geç kaç dakikada bir güncellenmesi beklenir (tazelik göstergesi için).
var KAYNAK = {
  siparis:  { id: '1gdn_rbaevKx9_-pNTRKL1DDtytFxZHr9QF-jrS4cHPE', ad: 'Adisyo sipariş verisi',   bolum: 'satis',    beklenenDk: 60 },
  isKaydi:  { id: '1Lsfaxw71jGeo93AuLovkyFfAfw2H53BsYWKire5COhs', ad: 'Ortak iş kaydı',          bolum: 'merkez',   beklenenDk: 1440 },
  hub:      { id: '1JbhHFzQYAvRXokYT3IClXgHz0vsXR3Rb0521jxBOFUQ', ad: 'Yapay zeka görev merkezi', bolum: 'ai',       beklenenDk: 1440 },
  gider:    { id: '1F-lWaWJN43GdQMAQWpggPmwFoFEcWARCB0GRHhR70Tw', ad: 'Aylık gider takibi',      bolum: 'finans',   beklenenDk: 10080 },
  hakedis:  { id: '139-CaKw5Dew7-PFIDAcjn6h673QJGPJ1j3mPslkttAE', ad: 'Platform hakediş',        bolum: 'finans',   beklenenDk: 1440 },
  fatura:   { id: '1JJ6UZzh8rSX1FE9Cr-UPzEAaE-2aKtM10bEvjAv2P5w', ad: 'Alış faturaları',         bolum: 'alim',     beklenenDk: 1440 },
  stok:     { id: '1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE', ad: 'Stok takip',              bolum: 'stok',     beklenenDk: 1440 },
  menu:     { id: '1rcOUvokeb0VG3mm72-IKV1-bk0WugEcNSvDaHz41pP8', ad: 'Menü ve genel bilgiler',  bolum: 'genel',    beklenenDk: 43200 },
  kurye:    { id: '1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo', ad: 'Kurye çalışma süresi',    bolum: 'kurye',    beklenenDk: 1440 },
  personel: { id: '1WBniOC2h9SvD20bHZl3G4o0f4kUmjbXtIrNvYVyV8Hg', ad: 'Personel',                bolum: 'personel', beklenenDk: 1440 },
  yorum:    { id: '1KLWCEBwFMHCTrTnCYLhv2ctg5PvGtS9DNzoMXF-Z1JE', ad: 'Trendyol yorumları',      bolum: 'musteri',  beklenenDk: 1440 }
};

var DEPARTMANLAR = ['Müşteri İlişkileri', 'Operasyon', 'Finans', 'Satış & Gelir', 'Teknoloji & Sistemler',
                    'İnsan Kaynakları', 'Strateji & İş Geliştirme', 'Sosyal Medya'];

/* ---------------- Web uygulaması girişi ---------------- */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var anahtar = PropertiesService.getScriptProperties().getProperty('PANEL_KEY');
  if (!anahtar || p.key !== anahtar) return json_({ hata: 'yetkisiz' });

  var cache = CacheService.getScriptCache();
  if (!p.fresh) {
    var c = onbellekOku_(cache);
    if (c) return ContentService.createTextOutput(c).setMimeType(ContentService.MimeType.JSON);
  }
  var metin = JSON.stringify(paketHazirla_());
  onbellekYaz_(cache, metin); // 2 dakika önbellek (parçalı)
  return ContentService.createTextOutput(metin).setMimeType(ContentService.MimeType.JSON);
}


// Önbellek anahtar başına 100 KB sınırlı; büyük paket parçalara bölünür.
function onbellekYaz_(cache, metin) {
  var n = Math.ceil(metin.length / 90000), o = {};
  if (n > 9) return;
  for (var i = 0; i < n; i++) o['panel_v1_' + i] = metin.substr(i * 90000, 90000);
  o['panel_v1_n'] = String(n);
  cache.putAll(o, 120);
}
function onbellekOku_(cache) {
  var n = +cache.get('panel_v1_n'); if (!n) return null;
  var keys = []; for (var i = 0; i < n; i++) keys.push('panel_v1_' + i);
  var o = cache.getAll(keys), s = '';
  for (i = 0; i < n; i++) { if (o[keys[i]] == null) return null; s += o[keys[i]]; }
  return s;
}

/* ---------------- Elle çalıştırılacak yardımcılar ---------------- */

// Bir kez çalıştırın. Günlükteki (Yürütme günlüğü) anahtarı yalnızca Cloudflare'deki GAS_KEY alanına yapıştırın.
function anahtarOlustur() {
  var k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('PANEL_KEY', k);
  Logger.log('Panel anahtarı hazır. Bunu yalnızca Cloudflare GAS_KEY alanına yapıştırın, başka yere yazmayın:');
  Logger.log(k);
}

// Yayınlamadan önce çalıştırın: verinin okunabildiğini ve hata olmadığını gösterir.
function testEt() {
  var v = paketHazirla_();
  Logger.log('Kaynak sayısı: ' + v.kaynaklar.length);
  Logger.log('Bugünkü ciro: ' + (v.satis ? v.satis.gun.bugun.ciro : 'yok'));
  Logger.log('Bekleyen karar: ' + (v.hub ? v.hub.bekleyen.length : 'yok'));
  Logger.log('Hatalar: ' + JSON.stringify(v.hatalar));
}

/* ---------------- Paket ---------------- */

function paketHazirla_() {
  var simdi = new Date();
  var out = {
    surum: 1,
    olusturma: Utilities.formatDate(simdi, TZ, "yyyy-MM-dd'T'HH:mm:ss"),
    kaynaklar: [], satis: null, nabiz: null, isKaydi: null, hub: null, finans: null, personel: null, kurye: null, genel: null, hatalar: []
  };
  Object.keys(KAYNAK).forEach(function (k) {
    var s = KAYNAK[k];
    var r = { anahtar: k, ad: s.ad, bolum: s.bolum, beklenenDk: s.beklenenDk,
              link: 'https://docs.google.com/spreadsheets/d/' + s.id };
    try {
      var t = DriveApp.getFileById(s.id).getLastUpdated();
      r.guncelleme = Utilities.formatDate(t, TZ, "yyyy-MM-dd'T'HH:mm:ss");
      r.dakika = Math.max(0, Math.round((simdi.getTime() - t.getTime()) / 60000));
    } catch (err) { r.hata = 'Dosya açılamadı'; }
    out.kaynaklar.push(r);
  });
  bolum_(out, 'satis', satis_);
  bolum_(out, 'nabiz', nabiz_);
  bolum_(out, 'isKaydi', isKaydi_);
  bolum_(out, 'hub', hub_);
  bolum_(out, 'finans', finans_);
  bolum_(out, 'personel', personel_);
  bolum_(out, 'kurye', kurye_);
  bolum_(out, 'genel', genel_);
  return out;
}

function bolum_(out, ad, fn) {
  try { out[ad] = fn(); }
  catch (err) { out.hatalar.push({ bolum: ad, mesaj: String((err && err.message) || err) }); }
}

/* ---------------- Satış ---------------- */

function satis_() {
  var sh = SpreadsheetApp.openById(KAYNAK.siparis.id).getSheetByName('Satıs Verileri');
  if (!sh) throw new Error("Sipariş dosyasında 'Satıs Verileri' sekmesi bulunamadı");
  var son = sh.getLastRow(), gen = sh.getLastColumn();
  var b = sh.getRange(1, 1, 1, gen).getValues()[0];
  var c = {
    tarih: kolon_(b, ['Sipariş Tarihi']), sube: kolon_(b, ['Şube']), kanal: kolon_(b, ['Sipariş Kanalı']),
    marka: kolon_(b, ['Marka']), tutar: kolon_(b, ['Toplam Tutar']), durum: kolon_(b, ['Durum']),
    tip: kolon_(b, ['Sipariş Tipi', 'Masa Siparişi']), cikan: kolon_(b, ['Ürün Çıkan Şube']), id: kolon_(b, ['Sipariş ID']), mahalle: kolon_(b, ['Mahalle'])
  };
  if (c.tarih < 0 || c.tutar < 0 || c.durum < 0) throw new Error('Sipariş tablosunda tarih, tutar ya da durum sütunu bulunamadı');
  var n = Math.min(5000, son - 1);
  if (n <= 0) return null;
  var rows = sh.getRange(son - n + 1, 1, n, gen).getValues();

  var simdi = simdi_();
  var bugun = isGunu_(simdi);
  var dun = gunEkle_(bugun, -1);
  var gecenHafta = gunEkle_(bugun, -7);
  var dow = (new Date(bugun + 'T00:00:00Z').getUTCDay() + 6) % 7; // Pazartesi = 0
  var haftaBasi = gunEkle_(bugun, -dow);
  var ilkSeri = gunEkle_(bugun, -13);

  var seri = {}; for (var i = 0; i < 14; i++) seri[gunEkle_(ilkSeri, i)] = { ciro: 0, adet: 0 };
  var g = { bugun: z_(), dun: z_(), hafta: z_(), gecenHaftaAyniSaat: z_() };
  var acik = z_(), iptalBugun = 0, sonSiparis = null;
  var kanalBugun = {}, subeBugun = {}, markaBugun = {}, kanalHafta = {}, mutfakBugun = {};
  var yediBasi = gunEkle_(bugun, -6), otuzBasi = gunEkle_(bugun, -29);
  var markaDetay = {}, mah = { bugun: {}, hafta: {}, otuz: {} }, mahBos = { bugun: 0, hafta: 0, otuz: 0 };
  var cikan = { bugunDolu: 0, bugunToplam: 0, yediDolu: 0, yediToplam: 0, baskaSubedenBugun: 0, sonEksik: [] };

  rows.forEach(function (r) {
    var ms = zaman_(r[c.tarih]); if (ms === null) return;
    var gun = isGunu_(ms);
    var d = norm_(r[c.durum]);
    var tutar = sayi_(r[c.tutar]);
    if (sonSiparis === null || ms > sonSiparis) sonSiparis = ms;
    if (d.indexOf('iptal') >= 0 || d.indexOf('iade') >= 0 || d.indexOf('red') === 0) { if (gun === bugun) iptalBugun++; return; }
    if (d !== 'kapali') { if (gun === bugun) { acik.ciro += tutar; acik.adet++; } return; }

    if (seri[gun]) { seri[gun].ciro += tutar; seri[gun].adet++; }
    var gelen = subeAnahtar_(c.sube >= 0 ? r[c.sube] : ''), mutfak = c.cikan >= 0 ? subeAnahtar_(r[c.cikan]) : '';
    if (gun >= yediBasi && gun <= bugun) {
      cikan.yediToplam++;
      if (mutfak) cikan.yediDolu++;
      else cikan.sonEksik.push({ ms: ms, id: String(c.id >= 0 ? r[c.id] : ''), sube: gelen });
    }
    var mh = String(c.mahalle >= 0 ? r[c.mahalle] : '').trim();
    if (/bulunamad/i.test(mh)) mh = '';
    if (gun >= otuzBasi && gun <= bugun) mahEkle_(mah.otuz, mahBos, 'otuz', mh, tutar);
    if (gun >= haftaBasi && gun <= bugun) mahEkle_(mah.hafta, mahBos, 'hafta', mh, tutar);
    if (gun === bugun) {
      mahEkle_(mah.bugun, mahBos, 'bugun', mh, tutar);
      var mk = markaKok_(c.marka >= 0 ? r[c.marka] : ''), sb = gelen || 'Belirtilmemiş';
      var md = markaDetay[mk] = markaDetay[mk] || { ad: mk, ciro: 0, adet: 0, subeler: {} };
      md.ciro += tutar; md.adet++;
      var ms2 = md.subeler[sb] = md.subeler[sb] || { ad: sb, ciro: 0, adet: 0 }; ms2.ciro += tutar; ms2.adet++;
    }
    if (gun === bugun) {
      cikan.bugunToplam++; if (mutfak) cikan.bugunDolu++;
      if (mutfak && gelen && mutfak !== gelen) cikan.baskaSubedenBugun++;
      topla_(mutfakBugun, mutfak || gelen, tutar);
    }
    var kanal = String(c.kanal >= 0 ? r[c.kanal] : '').trim() || ('Adisyo ' + String(c.tip >= 0 ? r[c.tip] : '').replace(/Siparişi/i, '').trim().toLowerCase()).trim();
    if (gun === bugun) { ek_(g.bugun, tutar); topla_(kanalBugun, kanal, tutar); topla_(subeBugun, c.sube >= 0 ? r[c.sube] : '', tutar); topla_(markaBugun, c.marka >= 0 ? r[c.marka] : '', tutar); }
    if (gun === dun) ek_(g.dun, tutar);
    if (gun >= haftaBasi && gun <= bugun) { ek_(g.hafta, tutar); topla_(kanalHafta, kanal, tutar); }
    if (gun === gecenHafta && ms <= simdi - 7 * 86400000) ek_(g.gecenHaftaAyniSaat, tutar);
  });

  cikan.sonEksik = cikan.sonEksik.sort(function (a, b) { return b.ms - a.ms; }).slice(0, 8)
    .map(function (x) { return { id: x.id, zaman: new Date(x.ms).toISOString().slice(0, 16).replace('T', ' '), sube: x.sube }; });
  cikan.sutunVar = c.cikan >= 0;

  return {
    bugun: bugun, dun: dun, haftaBasi: haftaBasi, cikanSube: cikan, mutfakBugun: sirala_(mutfakBugun),
    markaDetay: Object.keys(markaDetay).map(function (k2) { var m = markaDetay[k2];
      return { ad: m.ad, ciro: Math.round(m.ciro), adet: m.adet, subeler: Object.keys(m.subeler).map(function (s2) { var x = m.subeler[s2]; return { ad: x.ad, ciro: Math.round(x.ciro), adet: x.adet }; }).sort(function (a, b) { return b.ciro - a.ciro; }) };
    }).sort(function (a, b) { return b.ciro - a.ciro; }),
    mahalle: { bugun: mahSirala_(mah.bugun), hafta: mahSirala_(mah.hafta), otuz: mahSirala_(mah.otuz), bos: mahBos },
    sonSiparis: sonSiparis ? new Date(sonSiparis).toISOString().slice(0, 16).replace('T', ' ') : null,
    gun: g, acik: acik, iptalBugun: iptalBugun,
    kanalBugun: sirala_(kanalBugun), subeBugun: sirala_(subeBugun), markaBugun: sirala_(markaBugun), kanalHafta: sirala_(kanalHafta),
    seri: Object.keys(seri).sort().map(function (k) { return { gun: k, ciro: Math.round(seri[k].ciro), adet: seri[k].adet }; })
  };
}

/* ---------------- Sistem nabzı (sipariş dosyasındaki Sistem_Nabzi sekmesi) ---------------- */

function nabiz_() {
  var sh = SpreadsheetApp.openById(KAYNAK.siparis.id).getSheetByName('Sistem_Nabzi');
  if (!sh) return null;
  var v = sh.getRange(1, 1, Math.min(40, Math.max(1, sh.getLastRow())), 3).getDisplayValues();
  var out = { sonKontrol: null, satirlar: [] }, basladi = false;
  v.forEach(function (r) {
    var a = String(r[0]).trim();
    if (/^son kontrol/i.test(a)) out.sonKontrol = a.replace(/^son kontrol:?\s*/i, '');
    else if (norm_(a) === 'sistem') basladi = true;
    else if (basladi && a) out.satirlar.push({ sistem: a, durum: String(r[1]).trim(), detay: String(r[2]).trim() });
  });
  return out;
}

/* ---------------- Ortak iş kaydı ---------------- */

function isKaydi_() {
  var sh = SpreadsheetApp.openById(KAYNAK.isKaydi.id).getSheets()[0];
  var v = sh.getDataRange().getDisplayValues();
  if (v.length < 2) return null;
  var b = v[0];
  var c = { tarih: kolon_(b, ['Tarih-Saat', 'Tarih']), dep: kolon_(b, ['Departman']), ajan: kolon_(b, ['Ajan']),
            ne: kolon_(b, ['Ne yapıldı']), denetci: kolon_(b, ['Denetçi sonucu']) };
  if (c.tarih < 0 || c.dep < 0) throw new Error('İş kaydında tarih ya da departman sütunu bulunamadı');
  var simdi = simdi_();
  var dep = {};
  DEPARTMANLAR.forEach(function (d) { dep[d] = { departman: d, son: null, saatOnce: null, son24: 0, son7: 0 }; });
  var kayitlar = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i]; var ms = zaman_(r[c.tarih]); if (ms === null) continue;
    var ad = depEsle_(r[c.dep]); if (!ad) continue;
    var o = dep[ad]; var saat = (simdi - ms) / 3600000;
    if (o.son === null || ms > o.sonMs) { o.sonMs = ms; o.son = new Date(ms).toISOString().slice(0, 16).replace('T', ' '); o.saatOnce = Math.round(saat); }
    if (saat <= 24) o.son24++;
    if (saat <= 168) o.son7++;
    kayitlar.push({ ms: ms, zaman: new Date(ms).toISOString().slice(0, 16).replace('T', ' '), departman: ad,
                    ajan: c.ajan >= 0 ? r[c.ajan] : '', ne: kodsuz_(c.ne >= 0 ? r[c.ne] : '').slice(0, 260),
                    denetci: c.denetci >= 0 ? r[c.denetci] : '' });
  }
  kayitlar.sort(function (a, b) { return b.ms - a.ms; });
  return {
    departmanlar: DEPARTMANLAR.map(function (d) { var o = dep[d]; delete o.sonMs; return o; }),
    sonKayitlar: kayitlar.slice(0, 15).map(function (k) { delete k.ms; return k; })
  };
}

/* ---------------- Yapay zeka görev merkezi (BAP AI HUB) ---------------- */

function hub_() {
  var ss = SpreadsheetApp.openById(KAYNAK.hub.id);
  var tq = tablo_(ss, 'TASK_QUEUE'), ap = tablo_(ss, 'CEO_APPROVALS'), ao = tablo_(ss, 'AI_OUTPUTS'),
      ej = tablo_(ss, 'ENGINE_JOBS'), au = tablo_(ss, 'AUDIT_LOG');

  var konu = {}, gorevDurum = {}, gorevToplam = 0;
  tq.satirlar.forEach(function (r) {
    var id = al_(tq, r, 'TASK_ID'); if (!id || testMi_(id)) return;
    konu[id] = { konu: al_(tq, r, 'TOPIC'), departman: al_(tq, r, 'DEPARTMENT') };
    gorevToplam++; topla_(gorevDurum, al_(tq, r, 'STATUS') || 'BOŞ', 1);
  });

  var bekleyen = [];
  ap.satirlar.forEach(function (r) {
    var id = al_(ap, r, 'APPROVAL_ID'), gorev = al_(ap, r, 'TASK_ID'), durum = String(al_(ap, r, 'STATUS'));
    if (!id || testMi_(id) || testMi_(gorev) || /TEST|CLOSED|PROCESSED/i.test(durum)) return;
    if (String(al_(ap, r, 'MERT_DECISION')).trim()) return;
    var k = konu[gorev] || {};
    bekleyen.push({ id: id, konu: k.konu || '', departman: k.departman || '', istek: String(al_(ap, r, 'REQUEST')).slice(0, 600),
                    kapsam: String(al_(ap, r, 'SCOPE')).slice(0, 400), yetki: al_(ap, r, 'AUTHORITY_LEVEL'),
                    olusturma: String(al_(ap, r, 'CREATED_AT')).slice(0, 16).replace('T', ' ') });
  });

  var cikti = {};
  ao.satirlar.forEach(function (r) { if (!testMi_(al_(ao, r, 'TASK_ID'))) topla_(cikti, al_(ao, r, 'AI_ENGINE') || 'Bilinmiyor', 1); });

  var motor = {};
  ej.satirlar.forEach(function (r) {
    if (testMi_(al_(ej, r, 'TASK_ID'))) return;
    var m = String(al_(ej, r, 'AI_ENGINE') || 'Bilinmiyor').toUpperCase(), s = String(al_(ej, r, 'STATUS'));
    motor[m] = motor[m] || { motor: m, toplam: 0, biten: 0, hata: 0 };
    motor[m].toplam++;
    if (/DONE|COMPLETED|SUCCESS/i.test(s)) motor[m].biten++;
    else if (/ERROR|BLOCKED|FAIL/i.test(s)) motor[m].hata++;
  });

  var acikDenetim = 0, ciddi = 0;
  au.satirlar.forEach(function (r) {
    var s = String(al_(au, r, 'STATUS'));
    if (testMi_(al_(au, r, 'TASK_ID')) || /TEST|CLOSED|RESOLVED|DONE/i.test(s)) return;
    acikDenetim++; if (/HIGH|CRITICAL/i.test(String(al_(au, r, 'SEVERITY')))) ciddi++;
  });

  return {
    gorevToplam: gorevToplam, gorevDurum: sirala_(gorevDurum), bekleyen: bekleyen,
    cikti: sirala_(cikti), motorlar: Object.keys(motor).map(function (k) { return motor[k]; }),
    acikDenetim: acikDenetim, ciddiDenetim: ciddi, not: 'Deneme kayıtları sayılmadı.'
  };
}


/* ---------------- Finans ve alımlar (Kolaybi fatura verisi + aylık gider takibi) ---------------- */

function finans_() {
  var ss = SpreadsheetApp.openById(KAYNAK.fatura.id);
  var simdi = simdi_();
  var bugun = new Date(simdi).toISOString().slice(0, 10);
  var ay = bugun.slice(0, 7), gun = +bugun.slice(8, 10);
  var gAy = new Date(Date.UTC(+ay.slice(0, 4), +ay.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);
  var out = { ay: ay, bugun: bugun };

  // Alış faturaları
  var al = satirlar_(ss, 'Sayfa1');
  var cT = kolon_(al.b, ['Tarih']), cG = kolon_(al.b, ['Gönderen', 'Tedarikçi']), cU = kolon_(al.b, ['Tutar']), cN = kolon_(al.b, ['Fatura_No']);
  var gorulen = {}, faturalar = [], aylik = {}, tedBuAy = {};
  var alis = { buAy: 0, buAyAdet: 0, gecenAy: 0, gecenAyAyniDonem: 0 };
  al.r.forEach(function (r) {
    var no = String(r[cN] || ''), ms = zaman_(r[cT]); if (ms === null) return;
    if (no && gorulen[no]) return; if (no) gorulen[no] = 1;
    var t = sayi_(r[cU]), tarih = new Date(ms).toISOString().slice(0, 10), a2 = tarih.slice(0, 7), ad = String(r[cG] || '').trim();
    faturalar.push({ ms: ms, tarih: tarih, ad: ad, tutar: t });
    aylik[a2] = (aylik[a2] || 0) + t;
    if (a2 === ay) { alis.buAy += t; alis.buAyAdet++; var x = tedBuAy[ad] = tedBuAy[ad] || { ad: ad, tutar: 0, adet: 0 }; x.tutar += t; x.adet++; }
    if (a2 === gAy) { alis.gecenAy += t; if (+tarih.slice(8, 10) <= gun) alis.gecenAyAyniDonem += t; }
  });
  alis.aylik = Object.keys(aylik).sort().slice(-6).map(function (k) { return { ay: k, tutar: Math.round(aylik[k]) }; });
  alis.tedarikciBuAy = Object.keys(tedBuAy).map(function (k) { var x = tedBuAy[k]; return { ad: x.ad, tutar: Math.round(x.tutar), adet: x.adet }; })
    .sort(function (a, b) { return b.tutar - a.tutar; }).slice(0, 15);
  alis.sonFaturalar = faturalar.slice().sort(function (a, b) { return b.ms - a.ms; }).slice(0, 12)
    .map(function (f) { return { tarih: f.tarih, ad: f.ad, tutar: Math.round(f.tutar * 100) / 100 }; });
  out.alis = alis;

  // Ödemeler
  var od = satirlar_(ss, 'Odemeler');
  var oT = kolon_(od.b, ['Tarih']), oG = kolon_(od.b, ['Tedarikçi']), oU = kolon_(od.b, ['Tutar']), oY = kolon_(od.b, ['Yöntem']);
  var oA = kolon_(od.b, ODEME_SUTUN.aciklama);
  var odemeler = [], odeme = { buAy: 0, buAyAdet: 0 }, yontemler = {};
  od.r.forEach(function (r, i) {
    var ms = zaman_(r[oT]); if (ms === null) return;
    var t = sayi_(r[oU]), tarih = new Date(ms).toISOString().slice(0, 10), y = oY >= 0 ? String(r[oY] || '').trim() : '';
    odemeler.push({ ms: ms, sira: i, tarih: tarih, ad: String(r[oG] || '').trim(), tutar: t, yontem: y, aciklama: oA >= 0 ? String(r[oA] || '').trim() : '' });
    if (y) yontemler[y] = 1;
    if (tarih.slice(0, 7) === ay) { odeme.buAy += t; odeme.buAyAdet++; }
  });
  // Aynı gün girilen ödemelerde en son eklenen en üstte görünsün.
  odeme.son = odemeler.slice().sort(function (a, b) { return b.ms - a.ms || b.sira - a.sira; }).slice(0, 40)
    .map(function (o) { return { tarih: o.tarih, ad: o.ad, tutar: Math.round(o.tutar * 100) / 100, yontem: o.yontem, aciklama: o.aciklama }; });
  odeme.yontemler = Object.keys(yontemler).sort();
  out.odeme = odeme;

  // Tedarikçi borcu ve vadesi geçen (ödemeler en eski faturadan kapatılır)
  var td = satirlar_(ss, 'Tedarikciler');
  var dG = kolon_(td.b, ['Tedarikçi']), dV = kolon_(td.b, ['Vade_Gun']), dA = kolon_(td.b, ['Acilis_Bakiye']);
  var borc = { toplam: 0, vadesiGecen: 0, tedarikciSayisi: 0, vgTedarikci: 0, liste: [] }, tumTed = [];
  td.r.forEach(function (r) {
    var ad = String(r[dG] || '').trim(); if (!ad) return;
    tumTed.push(ad);
    var n = norm_(ad), vade = sayi_(r[dV]) || 30, acilis = sayi_(r[dA]);
    var fat = faturalar.filter(function (f) { return norm_(f.ad) === n; }).sort(function (a, b) { return a.ms - b.ms; });
    var odenen = odemeler.filter(function (o) { return norm_(o.ad) === n; }).reduce(function (t, o) { return t + o.tutar; }, 0);
    var kalanOdeme = odenen, acilisKalan = Math.max(0, acilis - kalanOdeme); kalanOdeme = Math.max(0, kalanOdeme - acilis);
    var vg = acilisKalan, enEski = acilisKalan > 0 ? 'açılış bakiyesi' : null;
    var toplamFat = 0;
    fat.forEach(function (f) {
      toplamFat += f.tutar;
      var acik = Math.max(0, f.tutar - kalanOdeme); kalanOdeme = Math.max(0, kalanOdeme - f.tutar);
      if (acik > 0.5 && (simdi - f.ms) / 86400000 > vade) { vg += acik; if (!enEski) enEski = f.tarih; }
    });
    var b = acilis + toplamFat - odenen;
    if (Math.abs(b) < 0.5 && vg < 0.5) return;
    borc.liste.push({ ad: ad, borc: Math.round(b * 100) / 100, vadesiGecen: Math.round(vg * 100) / 100, enEski: enEski, vadeGun: vade });
    borc.toplam += Math.max(0, b); borc.tedarikciSayisi++;
    if (vg > 0.5) { borc.vadesiGecen += vg; borc.vgTedarikci++; }
  });
  borc.liste.sort(function (a, b) { return b.vadesiGecen - a.vadesiGecen || b.borc - a.borc; });
  out.borc = borc;
  // Ödeme ekranındaki toptancı listesi: borcu olmayanlar da seçilebilsin.
  out.tedarikciler = tumTed.sort(function (a, b) { return a.localeCompare(b, 'tr'); });

  // Yemek kartı / kurum alacakları (satış faturaları)
  var sf = satirlar_(ss, 'Satis_Faturalari');
  var sI = kolon_(sf.b, ['Fatura_ID']), sM = kolon_(sf.b, ['Musteri']), sK = kolon_(sf.b, ['Kalan']), sV = kolon_(sf.b, ['Vade_Tarihi']), sD = kolon_(sf.b, ['Odeme_Durumu']);
  var alacak = { toplam: 0, vadesiGecen: 0, liste: [] }, am = {}, gorSf = {};
  sf.r.forEach(function (r) {
    var id = String(r[sI] || ''); if (id && gorSf[id]) return; if (id) gorSf[id] = 1;
    var kalan = sayi_(r[sK]); if (kalan < 0.5 || /^paid$/i.test(String(r[sD] || ''))) return;
    var ad = String(r[sM] || '').trim() || 'Belirtilmemiş', v = zaman_(r[sV]);
    var x = am[ad] = am[ad] || { ad: ad, kalan: 0, vadesiGecen: 0, adet: 0 };
    x.kalan += kalan; x.adet++; alacak.toplam += kalan;
    if (v !== null && v < simdi) { x.vadesiGecen += kalan; alacak.vadesiGecen += kalan; }
  });
  alacak.liste = Object.keys(am).map(function (k) { var x = am[k]; return { ad: x.ad, kalan: Math.round(x.kalan), vadesiGecen: Math.round(x.vadesiGecen), adet: x.adet }; })
    .sort(function (a, b) { return b.kalan - a.kalan; });
  out.alacak = alacak;

  // Aylık gider tablosu ve açık sorular (BAP Aylık Gider Takibi)
  try {
    var gs = SpreadsheetApp.openById(KAYNAK.gider.id);
    var oz = gs.getSheetByName('Özet');
    if (oz) {
      var v = oz.getDataRange().getDisplayValues(), aylar = null, kalemler = [], toplam = null;
      v.forEach(function (r) {
        var a0 = String(r[0]).trim();
        if (/^gider kalemi$/i.test(a0)) aylar = r.slice(1).filter(function (x) { return String(x).trim(); });
        else if (aylar && /^toplam/i.test(a0)) toplam = r.slice(1, aylar.length + 1).map(sayi_);
        else if (aylar && !toplam && a0) kalemler.push({ ad: a0, degerler: r.slice(1, aylar.length + 1).map(sayi_) });
      });
      if (aylar) out.gider = { aylar: aylar, kalemler: kalemler, toplam: toplam || [] };
    }
    var es = gs.getSheetByName('Eksikler & Sorular');
    if (es) {
      var ev = es.getDataRange().getDisplayValues(), eb = ev[0];
      var c = { konu: kolon_(eb, ['Konu']), neden: kolon_(eb, ['Neden önemli']), etki: kolon_(eb, ['Tutar etkisi']), durum: kolon_(eb, ['Durum']), cevap: kolon_(eb, ['Cevap']) };
      out.sorular = ev.slice(1).filter(function (r) { return r[c.konu] && !/kapand/i.test(r[c.durum]); }).map(function (r) {
        return { no: r[0], konu: r[c.konu], neden: r[c.neden], etki: r[c.etki], durum: r[c.durum], cevap: c.cevap >= 0 ? r[c.cevap] : '' };
      });
    }
  } catch (err) { out.giderHata = String(err.message || err); }
  return out;
}

function satirlar_(ss, ad) {
  var sh = ss.getSheetByName(ad);
  if (!sh || sh.getLastRow() < 2) return { b: [], r: [] };
  var v = sh.getDataRange().getValues();
  return { b: v[0].map(String), r: v.slice(1) };
}




/* ---------------- Genel bilgiler (BAP GENEL BİLGİLER: menü, şubeler, bölgeler, ödeme) ---------------- */
var GENEL_PORTAL_URL = 'https://bap-genel-bilgiler.mertharman.workers.dev/';

function genel_() {
  var ss = SpreadsheetApp.openById(KAYNAK.menu.id), out = { portal: GENEL_PORTAL_URL };
  var t = function (ad) { var sh = ss.getSheetByName(ad); return sh ? sh.getDataRange().getDisplayValues() : null; };
  var m = t('Menü');
  if (m) {
    var b = m[0], c = { ad: kolon_(b, ['Urun_Adı', 'Ürün Adı']), kat: kolon_(b, ['Kategori']), fiyat: kolon_(b, ['Fiyat']), ic: kolon_(b, ['İçerik']), haz: kolon_(b, ['Hazırlanma Süresi']),
      akt: kolon_(b, ['Aktif']), tur: kolon_(b, ['Ürün / Yarı Mamül / Direkt Satış']), rec: kolon_(b, ['Reçete_Durumu']), kal: kolon_(b, ['Kalori (kcal)']) };
    out.menu = m.slice(1).filter(function (r) { return String(r[c.ad]).trim(); }).map(function (r) {
      return { ad: r[c.ad], kategori: r[c.kat], fiyat: sayi_(r[c.fiyat]), icerik: String(r[c.ic] || '').slice(0, 180), hazirlama: r[c.haz], aktif: !/pasif|hay[ıi]r|false/i.test(r[c.akt]),
               tur: c.tur >= 0 ? r[c.tur] : '', recete: c.rec >= 0 ? r[c.rec] : '', kalori: c.kal >= 0 ? r[c.kal] : '' };
    });
  }
  var s = t('Şubeler');
  if (s) out.subeler = s.slice(1).filter(function (r) { return r[0]; }).map(function (r) { return { ad: r[0], adres: r[1], telefon: r[2], saatler: r[3] }; });
  var mh = t('Mahalle_Sube');
  if (mh) out.bolgeler = mh.slice(1).filter(function (r) { return r[0]; }).map(function (r) { return { mahalle: r[0], tamAd: r[1], sube: r[2], sure: r[3] }; });
  var od = t('Ödeme yöntemleri');
  if (od) out.odeme = od.slice(1).filter(function (r) { return r[0]; }).map(function (r) { return { ad: r[0], grup: r[1], tip: r[2], online: /true/i.test(r[3]) }; });
  var al = t('Al Ayarları');
  if (al) out.santral = al.slice(1).filter(function (r) { return r[0]; }).map(function (r) { return { ayar: onar_(r[0]), deger: onar_(r[1]) }; });
  return out;
}

// "SipariÅŸ" gibi bozuk kodlanmış Türkçe karakterleri düzeltir.
function onar_(s) {
  return String(s || '').replace(/Ã§/g, 'ç').replace(/Ã‡/g, 'Ç').replace(/ÄŸ/g, 'ğ').replace(/Äž/g, 'Ğ').replace(/Ä±/g, 'ı').replace(/Ä°/g, 'İ')
    .replace(/Ã¶/g, 'ö').replace(/Ã–/g, 'Ö').replace(/ÅŸ/g, 'ş').replace(/Åž/g, 'Ş').replace(/Ã¼/g, 'ü').replace(/Ãœ/g, 'Ü');
}

/* ---------------- Personel (BAP Personel dosyası) ----------------
 * Şifre, telefon, IBAN, acil durum kişisi ve ayrılma notu panele HİÇ gönderilmez.
 */
var PERSONEL_PANEL_URL = 'https://script.google.com/macros/s/AKfycbwPJbZCgnURva8C--D7jmMK8t4jhaQkC3J0ps-j7fxQEgbrSAfTtLYKqtMJr9yfXtOm/exec?panel=yonetici';

function personel_() {
  var ss = SpreadsheetApp.openById(KAYNAK.personel.id);
  var simdi = simdi_(), bugun = isGunu_(simdi), ay = bugun.slice(0, 7);
  var out = { bugun: bugun, yoneticiLink: PERSONEL_PANEL_URL };

  // Aktif personel (yalnız ad, şube, departman, maaş toplamı)
  var ps = ss.getSheetByName('Personel'), aktif = [], maasToplam = 0, subeSay = {};
  if (ps) {
    var v = ps.getDataRange().getDisplayValues(), b = v[0];
    var cA = kolon_(b, ['İsim Soyisim']), cAk = kolon_(b, ['Aktif']), cM = kolon_(b, ['Maaş']), cS = kolon_(b, ['Sube', 'Şube']), cD = kolon_(b, ['Departman']);
    v.slice(1).forEach(function (r) {
      if (!r[cA] || !/^(true|evet|1)$/i.test(String(r[cAk]).trim())) return;
      aktif.push({ ad: r[cA], sube: cS >= 0 ? r[cS] : '', departman: cD >= 0 ? r[cD] : '' });
      maasToplam += sayi_(r[cM]); topla_(subeSay, cS >= 0 ? r[cS] : '', 1);
    });
  }
  out.aktif = { sayi: aktif.length, maasToplam: Math.round(maasToplam), subeler: sirala_(subeSay), liste: aktif };
  out.bilgiler = personelBilgileri_(ss);

  // Giriş-çıkış kayıtları: bugün ve bu ay
  var gs = ss.getSheetByName('Personel_Giris_Cİkis') || ss.getSheetByName('Personel_Giris_Cikis');
  var bugunListe = [], ayKisi = {}, puantaj = [];
  if (gs) {
    var g = gs.getDataRange().getDisplayValues(), gb = g[0];
    var c = { gun: kolon_(gb, ['Kayıt Okutma (Gün)', 'Kayıt Okutma']), ad: kolon_(gb, ['İsim Soyisim']), gir: kolon_(gb, ['Mesai Giriş']), cik: kolon_(gb, ['Mesai Çıkış']),
              not: kolon_(gb, ['Gün Genel Notu']), ga: kolon_(gb, ['Giriş Açıklaması']), ca: kolon_(gb, ['Çıkış Açıklaması']), top: kolon_(gb, ['Toplam mesai']),
              faz: kolon_(gb, ['Fazla Mesai']), gps: kolon_(gb, ['Gps']), off: kolon_(gb, ['OFF Günü']), yi: kolon_(gb, ['Yıllık İzin']), rap: kolon_(gb, ['Rapor']),
              ui: kolon_(gb, ['Ücretsiz İzin']), dev: kolon_(gb, ['Devamsızlık']),
              hg: kolon_(gb, ['Ham Giriş']), hc: kolon_(gb, ['Ham Çıkış']), man: kolon_(gb, ['Manuel']) };
    var puIlk = gunEkle_(ay + '-01', -1).slice(0, 7) + '-01'; // geçen ayın 1'i
    g.slice(1).forEach(function (r, i) {
      var ms = zaman_(r[c.gun]); if (ms === null || !r[c.ad]) return;
      var gun = new Date(ms).toISOString().slice(0, 10);
      if (gun >= puIlk && gun <= bugun) puantaj.push(puantajSatir_(r, c, i + 2, gun));
      // Gps sütunu bazen ham koordinat içerir; yalnız şube adı çıkarılır, koordinat panele gönderilmez.
      var sbGps = subeAnahtar_(r[c.gps] || ''); sbGps = /Erenköy|Fikirtepe/.test(sbGps) ? sbGps.replace('BAP ', '') : '';
      if (gun === bugun) bugunListe.push({ ad: r[c.ad], sube: sbGps, giris: r[c.gir] || '', cikis: r[c.cik] || '', not: r[c.not] || '',
        girisNot: kodsuz_(r[c.ga] || ''), cikisNot: kodsuz_(r[c.ca] || ''), toplam: r[c.top] || '' });
      if (gun.slice(0, 7) === ay) {
        var x = ayKisi[r[c.ad]] = ayKisi[r[c.ad]] || { ad: r[c.ad], gun: 0, dk: 0, fazlaDk: 0, eksikDk: 0, gec: 0, izin: 0 };
        var t = sureDk_(r[c.top]); if (t > 0) { x.gun++; x.dk += t; }
        var f = sureDk_(r[c.faz]); if (f > 0) x.fazlaDk += f; else if (f < 0) x.eksikDk += -f;
        if (/geç girildi/i.test(r[c.ga] || '')) x.gec++;
        [c.yi, c.rap, c.ui, c.dev].forEach(function (i) { if (i >= 0 && String(r[i]).trim()) x.izin++; });
      }
    });
  }
  bugunListe.sort(function (a, b) { return String(a.giris).localeCompare(String(b.giris)); });

  // Bugünün vardiya planı
  var planli = [];
  var vs = ss.getSheetByName('Vardiya');
  if (vs) {
    var vv = vs.getDataRange().getDisplayValues(), vb = vv[0];
    var dow = (new Date(bugun + 'T00:00:00Z').getUTCDay() + 6) % 7, hafta = gunEkle_(bugun, -dow);
    var gunAd = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'][dow], cG = kolon_(vb, [gunAd]), cH = kolon_(vb, ['Hafta (Pazartesi)', 'Hafta']), cI = kolon_(vb, ['İsim Soyisim']), cS2 = kolon_(vb, ['Şube', 'Sube']);
    vv.slice(1).forEach(function (r) {
      var h = zaman_(r[cH]); if (h === null || new Date(h).toISOString().slice(0, 10) !== hafta) return;
      var plan = String(r[cG] || '').trim(); if (!plan) return;
      var kayit = bugunListe.filter(function (x) { return norm_(x.ad) === norm_(r[cI]); })[0];
      planli.push({ ad: r[cI], plan: plan, calisacak: /\d{1,2}:\d{2}/.test(plan), geldi: !!kayit, giris: kayit ? kayit.giris : '', sube: (cS2 >= 0 && r[cS2]) || (kayit ? kayit.sube : '') });
    });
  }
  puantaj.sort(function (a, b) { return a.ad === b.ad ? (a.gun < b.gun ? 1 : -1) : String(a.ad).localeCompare(String(b.ad), 'tr'); });
  out.puantaj = puantaj;
  out.bugunKayit = bugunListe;
  out.plan = planli;
  out.vardiya = vardiyaPlani_(ss, bugun, out.bilgiler);
  out.ay = { ay: ay, kisiler: Object.keys(ayKisi).map(function (k) { var x = ayKisi[k]; x.saat = Math.round(x.dk / 6) / 10; delete x.dk; return x; })
    .sort(function (a, b) { return b.saat - a.saat; }) };

  // Maaş ödemeleri (yalnız ay toplamı ve kişi sayısı)
  var os = ss.getSheetByName('Odemeler'), odAy = {};
  if (os) {
    var ov = os.getDataRange().getDisplayValues(), ob = ov[0], oA = kolon_(ob, ['Ay']), oT = kolon_(ob, ['Tutar']);
    ov.slice(1).forEach(function (r) { if (r[oA]) { var x = odAy[r[oA]] = odAy[r[oA]] || { ay: r[oA], tutar: 0, kisi: 0 }; x.tutar += sayi_(r[oT]); x.kisi++; } });
  }
  out.odemeler = Object.keys(odAy).sort().slice(-6).map(function (k) { var x = odAy[k]; x.tutar = Math.round(x.tutar); return x; });

  // Bordro: bu ay ve geçen ay ayrıntılı, son 6 ay özet (sahibin onayladığı kural; IBAN, şifre, telefon gönderilmez)
  var bv = bordroVeri_(ss), gecenAy = gunEkle_(ay + '-01', -1).slice(0, 7);
  out.bordro = [ay, gecenAy].map(function (a) { return bordro_(bv, a, bugun, planli); });
  out.bordroTrend = [];
  for (var t = 5; t >= 0; t--) {
    var m = ay; for (var z = 0; z < t; z++) m = gunEkle_(m + '-01', -1).slice(0, 7);
    if (!bv.aylar[m]) continue; // puantajı olmayan ay (QR sistemi öncesi) hesaplanmaz
    var B = bordro_(bv, m, bugun, planli);
    out.bordroTrend.push({ ay: m, normal: B.toplam.normal, fazla: B.toplam.fazla, resmi: B.toplam.resmi, aySonu: B.toplam.aySonu, odenen: B.toplam.odenen, kisi: B.kisiler.length });
  }
  return out;
}

/* ---------------- Bordro ----------------
 * Sahibin onayladığı kural (İK envanteri, 17.09.2026):
 *  - Günlük ücret = aylık maaş / ayın gün sayısı; saatlik ücret = günlük / 10.
 *  - Normal mesai = günlük × ücretli gün (işe giriş / işten çıkış arası, bugüne kadar). Ay ortası giriş-çıkışta kıst.
 *  - Ücretsiz izin ve devamsızlık günleri günlük ücretten kesilir; rapor 3 günü aşarsa aşan günler kesilir.
 *  - Fazla mesai: puantajdaki Fazla Mesai sütununun YALNIZ pozitif süreleri × saatlik. Eksik süre kesilmez.
 *    (Off gününde çalışma puantajda zaten tamamı fazla mesai olarak yazılıdır.)
 *  - Resmi tatilde çalışılan her gün için bir günlük ek.
 *  - SGK'lı personele asgari ücret bankadan, kalanı "diğer" olarak ödenir.
 * Aynı kişi aynı güne birden fazla satır varsa en üstteki (en yeni) kullanılır.
 */
var ASGARI_NET = 28076;      // 2026 net asgari ücret (SGK'lı personelin bankadan ödenen kısmı)
var SGK_ISVEREN = 7845;      // kişi başı aylık SGK işveren payı
var FAZLA_BOLEN = 10;        // saatlik = günlük / 10

function bordroIso_(s) { var ms = zaman_(s); return ms === null ? '' : new Date(ms).toISOString().slice(0, 10); }

// Bordro için gereken sekmeleri bir kez okur.
function bordroVeri_(ss) {
  var V = { tatil: {}, pu: {}, aylar: {}, odenen: {}, personel: [] };
  var rt = ss.getSheetByName('Resmi_tatiller');
  if (rt) rt.getDataRange().getDisplayValues().slice(1).forEach(function (r) { var d = bordroIso_(r[1]); if (d) V.tatil[d] = r[0]; });
  var gs = ss.getSheetByName('Personel_Giris_Cİkis') || ss.getSheetByName('Personel_Giris_Cikis');
  if (gs) {
    var g = gs.getDataRange().getDisplayValues(), c = puKolonlar_(g[0]), cRt = kolon_(g[0], ['Resmi Tatil Çalışma']);
    g.slice(1).forEach(function (r) {
      var d = bordroIso_(r[c.gun]); if (!d || !r[c.ad]) return;
      var k = norm_(r[c.ad]), x = V.pu[k] = V.pu[k] || { ad: r[c.ad], gunler: {} };
      if (x.gunler[d]) return; // aynı güne mükerrer satır: en üstteki (en yeni) kullanılır
      function f(j) { return j >= 0 && String(r[j]).trim() !== ''; }
      var top = sureSn_(r[c.top]);
      x.gunler[d] = { top: top, faz: sureSn_(r[c.faz]), off: f(c.off), yi: f(c.yi), ui: f(c.ui), dev: f(c.dev), rap: f(c.rap), resmi: f(cRt) || (!!V.tatil[d] && top > 0) };
      V.aylar[d.slice(0, 7)] = 1;
    });
  }
  var os = ss.getSheetByName('Odemeler');
  if (os) { var ov = os.getDataRange().getDisplayValues(), ob = ov[0], oA = kolon_(ob, ['Ay']), oP = kolon_(ob, ['Personel']), oT = kolon_(ob, ['Tutar']);
    ov.slice(1).forEach(function (r) { var a = String(r[oA]).trim(); if (a && r[oP]) { var o = V.odenen[a] = V.odenen[a] || {}, k = norm_(r[oP]); o[k] = (o[k] || 0) + sayi_(r[oT]); } }); }
  var ps = ss.getSheetByName('Personel');
  if (ps) {
    var v = ps.getDataRange().getDisplayValues(), b = v[0];
    var cA = kolon_(b, ['İsim Soyisim']), cG = kolon_(b, ['İşe Giriş']), cC = kolon_(b, ['İşten Çıkış']), cM = kolon_(b, ['Maaş']), cAk = kolon_(b, ['Aktif']),
        cS = kolon_(b, ['SGK lı', 'SGK']), cSb = kolon_(b, ['Sube', 'Şube']), cI = kolon_(b, ['IBAN']), gor = {};
    v.slice(1).forEach(function (r) {
      var ad = String(r[cA] || '').trim(), k = norm_(ad); if (!ad || gor[k]) return; gor[k] = 1; // aynı isimle çift kayıt: ilki
      V.personel.push({ ad: ad, k: k, giris: bordroIso_(r[cG]), cikis: bordroIso_(r[cC]), maas: sayi_(r[cM]), aktif: /^(true|evet|1)$/i.test(String(r[cAk]).trim()),
        sgk: /^(true|evet|1|ok)$/i.test(String(r[cS]).trim()), sube: cSb >= 0 ? String(r[cSb]).trim() : '', ibanVar: cI >= 0 && String(r[cI]).trim() !== '' });
    });
  }
  return V;
}

function bordro_(V, ay, bugun, planli) {
  var yil = +ay.slice(0, 4), aNo = +ay.slice(5, 7), gunSay = new Date(Date.UTC(yil, aNo, 0)).getUTCDate();
  var ilk = ay + '-01', son = ay + '-' + ('0' + gunSay).slice(-2), kadar = bugun < son ? bugun : son;
  function gunFark(a, b) { return b < a ? 0 : Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1; }
  var odenen = V.odenen[ay] || {}, kisiler = [], gorulen = {};
  V.personel.forEach(function (p) {
    var P = V.pu[p.k], ayKaydi = P && Object.keys(P.gunler).some(function (d) { return d >= ilk && d <= son; });
    if ((p.giris && p.giris > son) || (p.cikis && p.cikis < ilk)) return;
    if (!p.aktif && !p.cikis && !ayKaydi) return;          // pasif ve bu ay kaydı yok
    if (!p.giris && !ayKaydi && ay < bugun.slice(0, 7) && !odenen[p.k]) return; // giriş tarihi bilinmiyor, o ay izi yok
    if (!(p.maas > 0)) return;
    gorulen[p.k] = 1;
    var bas = p.giris && p.giris > ilk ? p.giris : ilk, bitis = p.cikis && p.cikis < son ? p.cikis : son;
    var gunluk = p.maas / gunSay, saatlik = gunluk / FAZLA_BOLEN;
    var ucretliBugune = gunFark(bas, kadar < bitis ? kadar : bitis), ucretliAy = gunFark(bas, bitis);
    var n = { yi: 0, ui: 0, dev: 0, rap: 0, resmi: 0, off: 0, offCalisma: 0, calisilan: 0 }, fazSn = 0, eksikSn = 0, topSn = 0;
    if (P) Object.keys(P.gunler).forEach(function (d) {
      if (d < bas || d > bitis) return; var x = P.gunler[d];
      ['yi', 'ui', 'dev', 'rap', 'resmi', 'off'].forEach(function (z) { if (x[z]) n[z]++; });
      if (x.off && x.top > 0) n.offCalisma++;
      if (x.top > 0) { n.calisilan++; topSn += x.top; }
      if (x.faz > 0) fazSn += x.faz; else if (x.faz < 0) eksikSn += -x.faz;
    });
    var raporKes = Math.max(0, n.rap - 3), kesGun = n.ui + n.dev + raporKes;
    var normal = Math.max(0, ucretliBugune - kesGun) * gunluk, normalAy = Math.max(0, ucretliAy - kesGun) * gunluk;
    var fazla = fazSn / 3600 * saatlik, resmiTl = n.resmi * gunluk;
    var aySonu = normalAy + fazla + resmiTl, asgari = p.sgk ? Math.min(ASGARI_NET, aySonu) : 0;
    kisiler.push({ ad: p.ad, sube: p.sube, sgk: p.sgk, aktif: p.aktif, ayrildi: !!p.cikis && p.cikis <= son, cikis: p.cikis, giris: p.giris && p.giris >= ilk ? p.giris : '',
      maas: Math.round(p.maas), gunluk: Math.round(gunluk), saatlik: Math.round(saatlik * 100) / 100, ucretliGun: ucretliBugune, ucretliAy: ucretliAy,
      gun: n, calisilanGun: n.calisilan, saat: Math.round(topSn / 360) / 10, fazlaDk: Math.round(fazSn / 60), eksikDk: Math.round(eksikSn / 60),
      yillikTl: Math.round(n.yi * gunluk), raporKesGun: raporKes, raporTl: -Math.round(raporKes * gunluk), ucretsizTl: -Math.round(n.ui * gunluk), devamsizTl: -Math.round(n.dev * gunluk),
      normal: Math.round(normal), fazla: Math.round(fazla), resmi: Math.round(resmiTl),
      hakedis: Math.round(normal + fazla + resmiTl), aySonu: Math.round(aySonu), asgari: Math.round(asgari), diger: Math.round(Math.max(0, aySonu - asgari)),
      ibanVar: p.ibanVar, odenen: Math.round(odenen[p.k] || 0) });
  });
  // Puantajda bu ay kaydı olup personel listesinde (ya da maaşı) olmayanlar
  var eksik = Object.keys(V.pu).filter(function (k) { return !gorulen[k] && Object.keys(V.pu[k].gunler).some(function (d) { return d >= ilk && d <= son; }); }).map(function (k) { return V.pu[k].ad; });
  kisiler.sort(function (a, b) { return String(a.sube).localeCompare(String(b.sube), 'tr') || a.ad.localeCompare(b.ad, 'tr'); });

  function topla(l) { var t = { kisi: l.length, maas: 0, normal: 0, fazla: 0, resmi: 0, hakedis: 0, aySonu: 0, odenen: 0, kesinti: 0, eksikDk: 0, fazlaDk: 0 };
    l.forEach(function (x) { t.maas += x.maas; t.normal += x.normal; t.fazla += x.fazla; t.resmi += x.resmi; t.hakedis += x.hakedis; t.aySonu += x.aySonu; t.odenen += x.odenen;
      t.kesinti += -(x.ucretsizTl + x.devamsizTl + x.raporTl); t.eksikDk += x.eksikDk; t.fazlaDk += x.fazlaDk; }); return t; }
  var subeler = {}; kisiler.forEach(function (x) { (subeler[x.sube || 'Belirtilmemiş'] = subeler[x.sube || 'Belirtilmemiş'] || []).push(x); });
  var aktifler = V.personel.filter(function (p) { return p.aktif && p.maas > 0; });
  var bugunGider = 0;
  if (ay === bugun.slice(0, 7)) (planli || []).forEach(function (p) { if (!p.calisacak) return; var x = kisiler.filter(function (y) { return norm_(y.ad) === norm_(p.ad); })[0]; if (x) bugunGider += x.gunluk; });
  return { ay: ay, gunSayisi: gunSay, kadar: kadar, kapandi: bugun > son, kisiler: kisiler, toplam: topla(kisiler),
    subeler: Object.keys(subeler).sort().map(function (k) { return { ad: k, toplam: topla(subeler[k]) }; }), eksikPersonel: eksik,
    butce: Math.round(aktifler.reduce(function (s, p) { return s + p.maas; }, 0)), sgkSayi: aktifler.filter(function (p) { return p.sgk; }).length, sgkIsveren: SGK_ISVEREN,
    bugunGider: Math.round(bugunGider), bugunKisi: (planli || []).filter(function (p) { return p.calisacak; }).length, asgariNet: ASGARI_NET };
}

// Vardiya çizelgesi: 4 hafta geri, 2 hafta ileri. Geçmiş günlerde fiili giriş-çıkış da eklenir.
function vardiyaPlani_(ss, bugun, bilgiler) {
  var vs = ss.getSheetByName('Vardiya'); if (!vs) return null;
  var dow = (new Date(bugun + 'T00:00:00Z').getUTCDay() + 6) % 7, buHafta = gunEkle_(bugun, -dow);
  var ilk = gunEkle_(buHafta, -28), son = gunEkle_(buHafta, 14);
  var subeHar = {}; (bilgiler && bilgiler.liste || []).forEach(function (p) { subeHar[norm_(p.ad)] = p.degerler && p.degerler['Sube'] || ''; });
  var v = vs.getDataRange().getDisplayValues(), b = v[0];
  var cH = kolon_(b, ['Hafta (Pazartesi)', 'Hafta']), cI = kolon_(b, ['İsim Soyisim']), cS = kolon_(b, ['Şube', 'Sube']);
  var gc = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(function (g) { return kolon_(b, [g]); });
  var haftalar = {};
  v.slice(1).forEach(function (r) {
    var ms = zaman_(r[cH]); if (ms === null || !String(r[cI]).trim()) return;
    var h = new Date(ms).toISOString().slice(0, 10); if (h < ilk || h > son) return;
    var gunler = gc.map(function (i) { return i >= 0 ? String(r[i] || '').trim() : ''; });
    var saat = 0, off = 0;
    gunler.forEach(function (g) { var m = g.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (m) { var dk = (+m[3] * 60 + +m[4]) - (+m[1] * 60 + +m[2]); if (dk <= 0) dk += 1440; saat += dk / 60; } else if (/^off$/i.test(g)) off++; });
    (haftalar[h] = haftalar[h] || []).push({ ad: r[cI], sube: (cS >= 0 && r[cS]) || subeHar[norm_(r[cI])] || '', gunler: gunler, planSaat: Math.round(saat * 10) / 10, off: off });
  });
  // Fiili kayıtlar (yalnız bu pencere)
  var gercek = {}, gs = ss.getSheetByName('Personel_Giris_Cİkis') || ss.getSheetByName('Personel_Giris_Cikis');
  if (gs) {
    var g = gs.getDataRange().getDisplayValues(), gb = g[0];
    var c = { gun: kolon_(gb, ['Kayıt Okutma (Gün)', 'Kayıt Okutma']), ad: kolon_(gb, ['İsim Soyisim']), gir: kolon_(gb, ['Mesai Giriş']), cik: kolon_(gb, ['Mesai Çıkış']), top: kolon_(gb, ['Toplam mesai']), ga: kolon_(gb, ['Giriş Açıklaması']) };
    g.slice(1).forEach(function (r) {
      var ms = zaman_(r[c.gun]); if (ms === null) return; var gun = new Date(ms).toISOString().slice(0, 10);
      if (gun < ilk || gun > bugun) return;
      gercek[norm_(r[c.ad]) + '|' + gun] = { g: String(r[c.gir] || '').slice(0, 5), c: String(r[c.cik] || '').slice(0, 5), t: String(r[c.top] || '').replace(/:\d{2}$/, ''), gec: /geç girildi/i.test(r[c.ga] || '') };
    });
  }
  return { buHafta: buHafta, bugun: bugun, haftalar: Object.keys(haftalar).sort().map(function (h) { return { hafta: h, satirlar: haftalar[h] }; }), gercek: gercek };
}

/* ---------------- Puantaj elle düzeltme ----------------
 * Bordro, yönetici panelinde her açılışta puantaj satırlarından hesaplanır. Bu yüzden düzeltme ayrı bir yere değil,
 * doğrudan günün satırına yazılır: Mesai Giriş / Mesai Çıkış, Toplam mesai ve Fazla Mesai birlikte güncellenir.
 * Ham Giriş / Ham Çıkış (QR'ın gerçek saati) DEĞİŞTİRİLMEZ; eski değerler Manuel sütununa ve işlem kaydına yazılır.
 * E-tablodan C/D elle değiştirildiğinde de aynı hesap kendiliğinden yapılır (bkz. tabloTetikleyicisiKur).
 */
function puantajSatir_(r, c, satir, gun) {
  function al(i) { return i >= 0 ? String(r[i] || '').trim() : ''; }
  function saatKismi(s) { var m = String(s || '').match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*$/); return m ? m[1] : ''; }
  return { satir: satir, gun: gun, ad: r[c.ad], giris: al(c.gir), cikis: al(c.cik), toplam: al(c.top), fazla: al(c.faz),
    not: al(c.not), girisNot: kodsuz_(al(c.ga)), cikisNot: kodsuz_(al(c.ca)), hamGiris: saatKismi(al(c.hg)), hamCikis: saatKismi(al(c.hc)),
    elle: al(c.man), off: !!al(c.off), izin: !!(al(c.yi) || al(c.rap) || al(c.ui) || al(c.dev)) };
}

// "11:57" / "11.57" / "11:57:52" → saniye; boş → null; geçersiz → NaN
function saatSn_(s) {
  s = String(s || '').trim(); if (!s) return null;
  var m = s.match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/); if (!m || +m[1] > 23 || +m[2] > 59 || +(m[3] || 0) > 59) return NaN;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0));
}
// "10:03:01" → 36181, "--0:12:38" / "-0:12:38" → -758
function sureSn_(s) {
  var m = String(s || '').trim().match(/^(-*)(\d+):(\d{1,2})(?::(\d{1,2}))?/); if (!m) return null;
  var sn = (+m[2]) * 3600 + (+m[3]) * 60 + (+(m[4] || 0));
  return m[1] ? -sn : sn;
}
function snYaz_(sn) {
  var e = sn < 0; sn = Math.abs(Math.round(sn));
  var h = Math.floor(sn / 3600), d = Math.floor(sn % 3600 / 60), s = sn % 60;
  return (e ? '-' : '') + h + ':' + ('0' + d).slice(-2) + ':' + ('0' + s).slice(-2);
}

/* ---- Satırı yeniden hesaplama (panel düzeltmesi ve e-tablodan yapılan elle değişiklik ortak kullanır) ----
 * Kural (sistemin kendi yazdıklarıyla aynı):
 *  - C ve D dolu (çalışılmış gün): Toplam = çıkış − giriş. İzin / rapor / ücretsiz izin / devamsızlık işareti kalkar.
 *    Off gününde çalışılan sürenin tamamı fazla mesaidir; diğer günlerde Fazla = Toplam − o günün vardiya süresi.
 *  - C ve D ikisi de silinmiş: vardiya planında off ise OFF işaretlenir, çalışma günüyse Devamsızlık işaretlenir.
 *  - Yalnız giriş var, çıkış yok: bugünse bir şey yapılmaz; geçmiş günse not düşülür, toplam değiştirilmez.
 * Vardiya süresi: satırın eski toplamı − eski fazlası (sistemin o gün kullandığı) → yoksa Vardiya sekmesi →
 * yoksa kişinin bu sekmedeki en sık vardiya süresi.
 * Ham Giriş / Ham Çıkış hiç değişmez. Yapılan her şey Manuel sütununa ve Islem_Loglari'na yazılır.
 */
function puKolonlar_(b) {
  return { gun: kolon_(b, ['Kayıt Okutma (Gün)', 'Kayıt Okutma']), ad: kolon_(b, ['İsim Soyisim']), gir: kolon_(b, ['Mesai Giriş']), cik: kolon_(b, ['Mesai Çıkış']),
           not: kolon_(b, ['Gün Genel Notu']), ga: kolon_(b, ['Giriş Açıklaması']), ca: kolon_(b, ['Çıkış Açıklaması']), top: kolon_(b, ['Toplam mesai']),
           faz: kolon_(b, ['Fazla Mesai']), off: kolon_(b, ['OFF Günü']), yi: kolon_(b, ['Yıllık İzin']), rap: kolon_(b, ['Rapor']),
           ui: kolon_(b, ['Ücretsiz İzin']), dev: kolon_(b, ['Devamsızlık']), hg: kolon_(b, ['Ham Giriş']), hc: kolon_(b, ['Ham Çıkış']), man: kolon_(b, ['Manuel']) };
}
var PU_IZIN = [['yi', 'Yıllık İzin'], ['rap', 'Rapor'], ['ui', 'Ücretsiz İzin'], ['dev', 'Devamsızlık']];

function puBaglam_() {
  var ss = SpreadsheetApp.openById(KAYNAK.personel.id);
  var gs = ss.getSheetByName('Personel_Giris_Cİkis') || ss.getSheetByName('Personel_Giris_Cikis');
  if (!gs) throw new Error('Giriş-çıkış sekmesi bulunamadı.');
  var v = gs.getDataRange().getDisplayValues(), c = puKolonlar_(v[0]);
  if (c.gun < 0 || c.ad < 0 || c.gir < 0 || c.cik < 0 || c.top < 0 || c.faz < 0 || c.man < 0) throw new Error('Giriş-çıkış sekmesinin başlıkları değişmiş; hesap yapılmadı.');
  return { ss: ss, gs: gs, v: v, c: c, bugun: isGunu_(simdi_()), vardiya: null, mod: null };
}
function puGun_(ctx, i) { var ms = zaman_(ctx.v[i][ctx.c.gun]); return ms === null ? '' : new Date(ms).toISOString().slice(0, 10); }
function puIzinli_(ctx, r) { return PU_IZIN.some(function (x) { var j = ctx.c[x[0]]; return j >= 0 && String(r[j]).trim(); }); }

// Vardiya sekmesi: 'ad|gün' → { off: true } ya da { sn: vardiya süresi }
function puVardiya_(ctx, ad, gun) {
  if (!ctx.vardiya) {
    ctx.vardiya = {};
    var vs = ctx.ss.getSheetByName('Vardiya');
    if (vs) {
      var vv = vs.getDataRange().getDisplayValues(), vb = vv[0];
      var cH = kolon_(vb, ['Hafta (Pazartesi)', 'Hafta']), cI = kolon_(vb, ['İsim Soyisim']);
      var gc = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(function (g) { return kolon_(vb, [g]); });
      vv.slice(1).forEach(function (r) {
        var h = zaman_(r[cH]); if (h === null || !String(r[cI]).trim()) return;
        var hafta = new Date(h).toISOString().slice(0, 10);
        gc.forEach(function (j, k) {
          if (j < 0) return; var g = String(r[j] || '').trim(), m = g.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/), x = null;
          if (m) { var sn = ((+m[3]) * 60 + (+m[4]) - (+m[1]) * 60 - (+m[2])) * 60; if (sn <= 0) sn += 86400; x = { sn: sn }; }
          else if (/^off$/i.test(g)) x = { off: true };
          if (x) ctx.vardiya[norm_(r[cI]) + '|' + gunEkle_(hafta, k)] = x;
        });
      });
    }
  }
  return ctx.vardiya[norm_(ad) + '|' + gun] || null;
}
// Kişinin normal günlerinde sistemin kullandığı en sık vardiya süresi (toplam − fazla)
function puMod_(ctx, ad) {
  if (!ctx.mod) {
    var say = {}, c = ctx.c;
    ctx.v.slice(1).forEach(function (r) {
      if (!r[c.ad] || puIzinli_(ctx, r) || (c.off >= 0 && String(r[c.off]).trim()) || /elle|tablodan/i.test(r[c.not])) return;
      var t = sureSn_(r[c.top]), f = sureSn_(r[c.faz]); if (!(t > 0) || f === null) return;
      var k = norm_(r[c.ad]), p = Math.round((t - f) / 60) * 60; if (p <= 0) return;
      (say[k] = say[k] || {})[p] = (say[k][p] || 0) + 1;
    });
    ctx.mod = {};
    Object.keys(say).forEach(function (k) { var e = Object.keys(say[k]).sort(function (a, b) { return say[k][b] - say[k][a]; })[0]; ctx.mod[k] = +e; });
  }
  return ctx.mod[norm_(ad)] || null;
}

// ctx.v[i] içindeki C/D'ye göre satırı yeniden yazar. o = { kaynak: 'Panel'|'Tablo', gerekce, eskiG, eskiC, girisDegisti, cikisDegisti }
function puSatirHesapla_(ctx, i, o) {
  var c = ctx.c, r = ctx.v[i], satir = i + 1, gun = puGun_(ctx, i), ad = r[c.ad];
  var g = saatSn_(r[c.gir]), cs = saatSn_(r[c.cik]);
  if (isNaN(g) || isNaN(cs)) return { hata: 'Giriş ya da çıkış saati okunamadı (SS:DD:ss olmalı).' };
  var eT = sureSn_(r[c.top]), eF = sureSn_(r[c.faz]), izinli = puIzinli_(ctx, r);
  var offIsaret = c.off >= 0 && String(r[c.off]).trim() !== '', plan = puVardiya_(ctx, ad, gun);
  var yaz = {}, notlar = [], sonuc = { satir: satir };

  if (g !== null && cs !== null) {
    var top = cs - g; if (top <= 0) top += 86400;
    if (top > 16 * 3600) return { hata: 'Giriş ile çıkış arası 16 saati geçiyor; saatleri kontrol edin.' };
    // Satırın kendi bilgisi (sistemin o gün yazdığı) vardiya planından önce gelir.
    var satirNormal = eT > 0 && eF !== null && !izinli;
    var off = offIsaret || (!satirNormal && !!(plan && plan.off)), vs = null;
    if (!off) {
      if (satirNormal) vs = eT - eF;
      else if (plan && plan.sn) vs = plan.sn;
      else vs = puMod_(ctx, ad);
    }
    var faz = off ? top : (vs !== null ? top - vs : null);
    yaz[c.top] = snYaz_(top);
    if (faz !== null) yaz[c.faz] = snYaz_(faz); else notlar.push('vardiya süresi bulunamadı, fazla mesai hesaplanmadı');
    if (off && !offIsaret && c.off >= 0) yaz[c.off] = 1;
    PU_IZIN.forEach(function (x) { var j = c[x[0]]; if (j >= 0 && String(r[j]).trim()) { yaz[j] = ''; notlar.push(x[1] + ' işareti kaldırıldı'); } });
    var etiket = o.kaynak === 'Panel' ? 'Elle Düzeltildi' : 'Tablodan Güncellendi';
    yaz[c.not] = etiket + (off ? ' (Off Gününde Çalışıldı)' : '') + (faz > 0 ? ' + Fazla Mesai' : '');
    sonuc.toplam = yaz[c.top]; sonuc.fazla = faz !== null ? yaz[c.faz] : String(r[c.faz]);
  } else if (g === null && cs === null) {
    if (izinli) return { yok: true };
    var offGun = offIsaret || !!(plan && plan.off);
    yaz[c.top] = ''; yaz[c.faz] = '';
    if (offGun) { if (!offIsaret && c.off >= 0) yaz[c.off] = 1; yaz[c.not] = 'İzinli (Off Günü)'; }
    else if (c.dev >= 0) { yaz[c.dev] = 1; yaz[c.not] = 'Devamsızlık (giriş-çıkış silindi)'; notlar.push('devamsızlık işaretlendi'); }
    sonuc.toplam = ''; sonuc.fazla = '';
  } else if (cs === null) {
    if (gun >= ctx.bugun) return { yok: true };
    yaz[c.not] = 'Tablodan Güncellendi — çıkış saati eksik';
    notlar.push('çıkış saati yok, toplam değiştirilmedi');
    sonuc.toplam = String(r[c.top]); sonuc.fazla = String(r[c.faz]);
  } else return { hata: 'Çıkış saati var ama giriş saati yok; giriş saatini de yazın.' };

  var ham = [r[c.hg], r[c.hc]].map(function (s) { var m = String(s || '').match(/(\d{1,2}:\d{2}:\d{2})\s*$/); return m ? m[1] : ''; });
  var etk = o.kaynak === 'Panel' ? 'Elle düzeltildi' : 'Tablodan güncellendi';
  function aciklama(eski, qr) { var p = []; if (eski != null) p.push('önce ' + (eski || 'boş')); if (qr) p.push('QR ' + qr); return etk + (o.gerekce ? ': ' + o.gerekce : '') + (p.length ? ' (' + p.join(', ') + ')' : ''); }
  if (o.girisDegisti || o.tarama) yaz[c.ga] = aciklama(o.eskiG, ham[0]);
  if (o.cikisDegisti || o.tarama) yaz[c.ca] = aciklama(o.eskiC, ham[1]);

  var degisim = [];
  if (o.tarama) degisim.push('Saatler tablodan değiştirilmiş (' + (r[c.gir] || 'boş') + '–' + (r[c.cik] || 'boş') + ')');
  if (o.girisDegisti) degisim.push('Giriş ' + (o.eskiG != null ? (o.eskiG || 'boş') : '?') + '→' + (r[c.gir] || 'boş'));
  if (o.cikisDegisti) degisim.push('Çıkış ' + (o.eskiC != null ? (o.eskiC || 'boş') : '?') + '→' + (r[c.cik] || 'boş'));
  if (c.top in yaz && yaz[c.top] !== String(r[c.top]).trim()) degisim.push('Toplam ' + (String(r[c.top]).trim() || 'boş') + '→' + (yaz[c.top] || 'boş'));
  if (c.faz in yaz && yaz[c.faz] !== String(r[c.faz]).trim()) degisim.push('Fazla ' + (String(r[c.faz]).trim() || 'boş') + '→' + (yaz[c.faz] || 'boş'));
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm');
  var iz = (o.kaynak === 'Panel' ? 'Elle düzeltme (Sahip, panel, ' : 'Tablodan güncellendi (') + damga + '): ' + degisim.concat(notlar).join(', ') + (o.gerekce ? ' — ' + o.gerekce : '');
  var eskiMan = String(r[c.man] || '').trim();
  yaz[c.man] = (eskiMan ? eskiMan + ' | ' : '') + iz;

  Object.keys(yaz).forEach(function (j) { j = +j; if (j >= 0) { ctx.gs.getRange(satir, j + 1).setValue(yaz[j]); r[j] = String(yaz[j]); } });
  var log = ctx.ss.getSheetByName('Islem_Loglari');
  if (log) { log.insertRowAfter(1); log.getRange(2, 1, 1, 5).setValues([[damga + ':00', o.kaynak === 'Panel' ? 'Yönetici (panel)' : 'Yönetici (e-tablo)', o.kaynak === 'Panel' ? 'PUANTAJ_ELLE_DUZELTME' : 'PUANTAJ_TABLODAN_GUNCELLENDI', ad + ' ' + gun + ' — ' + degisim.concat(notlar).join(', ') + (o.gerekce ? ' — ' + o.gerekce : ''), '-']]); }
  sonuc.tamam = true; sonuc.giris = String(r[c.gir]); sonuc.cikis = String(r[c.cik]); sonuc.elle = iz; sonuc.ozet = ad + ' ' + gun + ': ' + degisim.concat(notlar).join(', ');
  return sonuc;
}

// Panel { satir, ad, gun: 'YYYY-MM-DD', giris: 'HH:MM', cikis: 'HH:MM', gerekce } gönderir. Boş saat = değişmesin.
function puantajDuzelt_(d) {
  var yeniG = saatSn_(d.giris), yeniC = saatSn_(d.cikis), gerekce = String(d.gerekce || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (isNaN(yeniG) || isNaN(yeniC)) return { hata: 'Saat SS:DD biçiminde olmalı (örn. 12:00).' };
  if (yeniG === null && yeniC === null) return { hata: 'Değiştirilecek bir saat yazın.' };
  if (!gerekce) return { hata: 'Kısa bir gerekçe yazın (bordroda iz kalsın).' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.gun || ''))) return { hata: 'Gün bilgisi eksik; sayfayı yenileyin.' };
  var ctx; try { ctx = puBaglam_(); } catch (err) { return { hata: err.message }; }
  var v = ctx.v, c = ctx.c;
  // Yeni kayıtlar üste eklendiği için satır numarası kayabilir: kişi + gün ile doğrula, kaydıysa yeniden bul.
  function uyar(i) { return puGun_(ctx, i) === d.gun && norm_(v[i][c.ad]) === norm_(d.ad); }
  var i = +d.satir - 1;
  if (!(i >= 1 && i < v.length && uyar(i))) {
    var bulunan = []; for (var k = 1; k < v.length; k++) if (uyar(k)) bulunan.push(k);
    if (bulunan.length !== 1) return { hata: bulunan.length ? 'Bu kişi için o güne ait birden fazla satır var; tablodan düzeltin.' : 'Satır bulunamadı; sayfayı yenileyip tekrar deneyin.' };
    i = bulunan[0];
  }
  var r = v[i], eskiG = String(r[c.gir]).trim(), eskiC = String(r[c.cik]).trim();
  var gD = yeniG !== null && snYaz_(yeniG) !== eskiG, cD = yeniC !== null && snYaz_(yeniC) !== eskiC;
  if (gD) { r[c.gir] = snYaz_(yeniG); ctx.gs.getRange(i + 1, c.gir + 1).setValue(r[c.gir]); }
  if (cD) { r[c.cik] = snYaz_(yeniC); ctx.gs.getRange(i + 1, c.cik + 1).setValue(r[c.cik]); }
  if (!gD && !cD && !puTutarsiz_(ctx, i)) return { hata: 'Yazdığınız saatler tablodakiyle aynı; toplam ve fazla mesai de zaten tutuyor.' };
  var s = puSatirHesapla_(ctx, i, { kaynak: 'Panel', gerekce: gerekce, eskiG: eskiG, eskiC: eskiC, girisDegisti: gD, cikisDegisti: cD });
  if (s.yok) return { hata: 'Bu satırda hesaplanacak bir şey yok.' };
  if (s.tamam) cevapKaydet_('İnsan Kaynakları', 'BAP Personel › Personel_Giris_Cikis', s.satir, s.ozet, gerekce, Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm'));
  return s;
}

// C/D dolu ama Toplam mesai tutmuyor ya da izin/devamsızlık işareti duruyorsa satır elle değiştirilmiş demektir.
function puTutarsiz_(ctx, i) {
  var r = ctx.v[i], c = ctx.c, g = saatSn_(r[c.gir]), cs = saatSn_(r[c.cik]);
  if (g === null || cs === null || isNaN(g) || isNaN(cs)) return false;
  var h = cs - g; if (h <= 0) h += 86400;
  var t = sureSn_(r[c.top]);
  return t === null || Math.abs(h - t) > 60 || puIzinli_(ctx, r);
}

/* ---------------- E-tablodan yapılan elle değişiklikler ----------------
 * Kurulum: tabloTetikleyicisiKur'u BİR KEZ çalıştırın (izin ister). Sonrasında Personel_Giris_Cikis sekmesinde
 * C (Mesai Giriş) ya da D (Mesai Çıkış) değiştiğinde satır kendiliğinden yeniden hesaplanır ve "Tablodan Güncellendi" yazar.
 * Ayrıca saatte bir tarama, tetikleyicinin kaçırdığı (ör. toplu yapıştırma) satırları yakalar.
 * Sistemin (QR, gece işi) kendi yazdıkları onEdit'i tetiklemez; yalnız sizin elle yaptığınız değişiklikler işlenir.
 */
function tabloTetikleyicisiKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['puantajTabloDegisti', 'puantajTaramasi'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('puantajTabloDegisti').forSpreadsheet(KAYNAK.personel.id).onEdit().create();
  ScriptApp.newTrigger('puantajTaramasi').timeBased().everyHours(1).create();
  Logger.log('Tetikleyiciler kuruldu. Şimdi daha önce elle değiştirilmiş satırlar taranıyor…');
  puantajTaramasi();
}

function puantajTabloDegisti(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet(); if (!/^Personel_Giris_C[İi]kis$/.test(sh.getName())) return;
  var kilit = LockService.getScriptLock(); if (!kilit.tryLock(30000)) return;
  try {
    var ctx = puBaglam_(), c = ctx.c;
    var r1 = e.range.getRow(), r2 = e.range.getLastRow(), k1 = e.range.getColumn() - 1, k2 = e.range.getLastColumn() - 1;
    var gD = k1 <= c.gir && c.gir <= k2, cD = k1 <= c.cik && c.cik <= k2;
    if (!gD && !cD) return;
    var tek = r1 === r2 && k1 === k2;
    for (var s = Math.max(2, r1); s <= r2; s++) {
      var i = s - 1; if (i >= ctx.v.length || !ctx.v[i][c.ad]) continue;
      puSatirHesapla_(ctx, i, { kaynak: 'Tablo', girisDegisti: gD, cikisDegisti: cD,
        eskiG: tek && gD ? (e.oldValue != null ? String(e.oldValue) : '') : null, eskiC: tek && cD ? (e.oldValue != null ? String(e.oldValue) : '') : null });
    }
    CacheService.getScriptCache().remove('panel_v1_n');
  } finally { kilit.releaseLock(); }
}

// Son 62 günde C/D'si elle değiştirilip toplamı eski kalan satırları bulur ve yeniden hesaplar.
function puantajTaramasi() {
  var kilit = LockService.getScriptLock(); if (!kilit.tryLock(30000)) return;
  try {
    var ctx = puBaglam_(), sinir = gunEkle_(ctx.bugun, -62), islenen = [];
    for (var i = 1; i < ctx.v.length; i++) {
      if (!ctx.v[i][ctx.c.ad] || puGun_(ctx, i) < sinir || !puTutarsiz_(ctx, i)) continue;
      var s = puSatirHesapla_(ctx, i, { kaynak: 'Tablo', tarama: true, eskiG: null, eskiC: null });
      islenen.push(s.tamam ? s.ozet : ('satır ' + (i + 1) + ': ' + (s.hata || 'atlandı')));
    }
    if (islenen.length) CacheService.getScriptCache().remove('panel_v1_n');
    Logger.log(islenen.length ? islenen.length + ' satır yeniden hesaplandı:\n' + islenen.join('\n') : 'Toplamı eski kalan satır yok.');
  } finally { kilit.releaseLock(); }
}

// Personel bilgileri: hassas alanların DEĞERİ gönderilmez, yalnız dolu/eksik bilgisi gönderilir.
var PERSONEL_ALANLAR = [
  { ad: 'İşe Giriş', etiket: 'İşe giriş tarihi', tur: 'tarih', goster: true },
  { ad: 'Maaş', etiket: 'Aylık maaş', tur: 'sayi', goster: true },
  { ad: 'SGK lı', etiket: 'SGK durumu', tur: 'evethayir', goster: true },
  { ad: 'Sube', etiket: 'Şube', tur: 'sube', goster: true },
  { ad: 'Departman', etiket: 'Departman / pozisyon', tur: 'metin', goster: true },
  { ad: 'Telefon Numarası', etiket: 'Telefon', tur: 'telefon', goster: false },
  { ad: 'IBAN', etiket: 'IBAN', tur: 'iban', goster: false },
  { ad: 'Banka Hesap Adı', etiket: 'Banka hesap adı', tur: 'metin', goster: false },
  { ad: 'Acil durum kişi', etiket: 'Acil durum kişisi', tur: 'metin', goster: false },
  { ad: 'Acil durum kişisi telefon', etiket: 'Acil durum telefonu', tur: 'telefon', goster: false }
];

function personelBilgileri_(ss) {
  var ps = ss.getSheetByName('Personel'); if (!ps) return null;
  var v = ps.getDataRange().getDisplayValues(), b = v[0];
  var cA = kolon_(b, ['İsim Soyisim']), cAk = kolon_(b, ['Aktif']), cC = kolon_(b, ['İşten Çıkış']);
  var idx = PERSONEL_ALANLAR.map(function (a) { return kolon_(b, [a.ad]); });
  var liste = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i]; if (!String(r[cA]).trim()) continue;
    var aktifMi = /^(true|evet|1)$/i.test(String(r[cAk]).trim());
    var p = { satir: i + 1, ad: r[cA], aktif: aktifMi, cikis: cC >= 0 ? r[cC] : '', degerler: {}, eksik: [] };
    PERSONEL_ALANLAR.forEach(function (a, j) {
      if (idx[j] < 0) return;
      var dolu = String(r[idx[j]]).trim() !== '';
      if (a.goster && dolu) p.degerler[a.ad] = r[idx[j]];
      if (!dolu) p.eksik.push({ alan: a.ad, etiket: a.etiket, tur: a.tur });
    });
    liste.push(p);
  }
  return { alanlar: PERSONEL_ALANLAR.map(function (a) { return { ad: a.ad, etiket: a.etiket }; }), liste: liste };
}

// Sahip panelden eksik bir personel bilgisini girer. Yalnız BOŞ hücreye yazılır; dolu bilgi panelden değiştirilemez.
function personelBilgiGir_(d) {
  var alan = PERSONEL_ALANLAR.filter(function (a) { return a.ad === d.alan; })[0];
  if (!alan) return { hata: 'Bu alan panelden girilemez.' };
  var deger = dogrula_(alan.tur, String(d.cevap || '').trim());
  if (deger.hata) return { hata: deger.hata };
  var ss = SpreadsheetApp.openById(KAYNAK.personel.id), ps = ss.getSheetByName('Personel');
  var v = ps.getDataRange().getDisplayValues(), b = v[0];
  var cA = kolon_(b, ['İsim Soyisim']), cX = kolon_(b, [alan.ad]), satir = +d.satir;
  if (cX < 0 || !(satir >= 2 && satir <= v.length)) return { hata: 'Personel satırı bulunamadı.' };
  if (norm_(v[satir - 1][cA]) !== norm_(d.ad)) return { hata: 'Personel listesi değişmiş; sayfayı yenileyip tekrar deneyin.' };
  if (String(v[satir - 1][cX]).trim() !== '') return { hata: 'Bu bilgi zaten dolu. Değiştirmek için yönetici panelini kullanın.' };
  ps.getRange(satir, cX + 1).setValue(deger.deger);
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss');
  var gizli = alan.goster ? String(deger.deger) : maskele_(String(deger.deger));
  var log = ss.getSheetByName('Islem_Loglari');
  if (log) { log.insertRowAfter(1); log.getRange(2, 1, 1, 5).setValues([[damga, 'Yönetici (panel)', 'PERSONEL_BILGI_GIRILDI', d.ad + ' — ' + alan.etiket + ': ' + gizli, '-']]); }
  cevapKaydet_('İnsan Kaynakları', 'BAP Personel › Personel', satir, d.ad + ' — ' + alan.etiket + ' girildi', gizli, damga.slice(0, 16));
  return { tamam: true, goster: gizli };
}

function dogrula_(tur, s) {
  if (!s) return { hata: 'Boş bırakılamaz.' };
  if (tur === 'iban') { var t = s.replace(/\s+/g, '').toUpperCase(); if (!/^TR\d{24}$/.test(t)) return { hata: 'IBAN TR ile başlamalı ve 26 karakter olmalı.' };
    return { deger: t.replace(/(.{4})/g, '$1 ').trim() }; }
  if (tur === 'telefon') { var n = s.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, ''); if (!/^\d{10}$/.test(n)) return { hata: 'Telefon 10 haneli olmalı (5XX XXX XX XX).' }; return { deger: n }; }
  if (tur === 'tarih') { var m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/); if (!m) return { hata: 'Tarih GG.AA.YYYY biçiminde olmalı.' };
    return { deger: ('0' + m[1]).slice(-2) + '.' + ('0' + m[2]).slice(-2) + '.' + m[3] }; }
  if (tur === 'sayi') { var x = sayi_(s); if (!(x > 0)) return { hata: 'Geçerli bir tutar yazın.' }; return { deger: x }; }
  if (tur === 'evethayir') { if (/^(evet|var|true|1|sgkl[ıi])$/i.test(s)) return { deger: true }; if (/^(hay[ıi]r|yok|false|0)$/i.test(s)) return { deger: false }; return { hata: 'Evet ya da Hayır yazın.' }; }
  if (tur === 'sube') { var sb = subeAnahtar_(s); if (!/Erenköy|Fikirtepe/.test(sb)) return { hata: 'Erenköy ya da Fikirtepe yazın.' }; return { deger: sb.replace('BAP ', '') }; }
  return { deger: s.slice(0, 200) };
}
function maskele_(s) { var t = s.replace(/\s+/g, ''); return t.length > 4 ? '•••• ' + t.slice(-4) : '••••'; }

// "9:47:22" → 587, "--0:12:38" → -13 (dakika)
function sureDk_(s) {
  var m = String(s || '').trim().match(/^(-*)(\d+):(\d{1,2})(?::(\d{1,2}))?/); if (!m) return 0;
  var dk = (+m[2]) * 60 + (+m[3]) + (m[4] ? Math.round(+m[4] / 60) : 0);
  return m[1] ? -dk : dk;
}

/* ---------------- Kurye ve teslimat ---------------- */

// Kaynak: 'Kurye Net Çalışma Süresi' tablosu (Siparişler, Günlük Mesai, Teslimat Gecikmeleri, Açık Hesaplar).
// Müşteri adı, telefonu, adresi ve sipariş içeriği dışarı verilmez.

// Gecikme ölçütleri (dakika). Toplam süre HEDEF.toplam'ı aşan sipariş gecikmiş sayılır; sebebi:
// mutfak = sipariş → restorandan çıkış HEDEF.cikis'i aştı, kurye = yol süresi mesafeye göre beklenenden HEDEF.yolPay fazla.
var KURYE_HEDEF = { toplam: 40, cikis: 25, yolPay: 5 };
var KURYE_DONEMLER = ['bugun', 'dun', 'yedi', 'ay', 'otuz'];

// Mesafeye göre beklenen yol süresi (dk): 5 dk + km başına 2,5 dk (kurye panelindeki formül).
function beklenenYol_(km) { return Math.round(5 + 2.5 * km); }

// Kurye ücretleri 'Kurye bilgiler' sekmesinden okunur (Kurye Adı, Bordro, Saat ücreti, Paket başı ücret, SGK'lı).
// Adı boş satır o bordro grubunun varsayılanıdır (ör. Haddy Kurye); listede olmayan kurye bu varsayılanla hesaplanır.
// Haddy faturası KDV'li (%20), BAP bordrosunda KDV yok. Sekme okunamazsa aşağıdaki yedek kullanılır.
// Saat hakedişi kesintiler düşülmüş net süre üzerinden.
var KURYE_UCRET = {
  varsayilan: { grup: 'Haddy', saat: 235, paket: 25, kdv: 0.20 },
  kisiler: { 'Kenan': { grup: 'BAP', saat: 245, paket: 15, kdv: 0 } },
  kaynak: 'yedek'
};
var KURYE_KDV = { haddy: 0.20 };
function kuryeUcretOku_(ss) {
  var sh = ss.getSheetByName('Kurye bilgiler') || ss.getSheetByName('Kurye Bilgiler'); if (!sh || sh.getLastRow() < 2) return;
  var v = sh.getDataRange().getDisplayValues(), b = v[0];
  var c = { ad: kolon_(b, ['Kurye Adı', 'Kurye']), grup: kolon_(b, ['Bordro']), saat: kolon_(b, ['Saat ücreti']), paket: kolon_(b, ['Paket başı ücret', 'Paket başı']), sgk: kolon_(b, ['SGK']) };
  if (c.grup < 0 || c.saat < 0) return;
  var u = { varsayilan: null, kisiler: {}, kaynak: 'Kurye bilgiler' };
  v.slice(1).forEach(function (r) {
    var grup = String(r[c.grup] || '').trim(); if (!grup) return;
    var ad = c.ad >= 0 ? String(r[c.ad] || '').trim() : '', kdv = /haddy/i.test(grup) ? KURYE_KDV.haddy : 0;
    var x = { grup: grup.replace(/\s*kurye\s*$/i, ''), saat: sayi_(r[c.saat]), paket: c.paket >= 0 ? sayi_(r[c.paket]) : 0, kdv: kdv, sgk: c.sgk >= 0 && /^(true|evet|1)$/i.test(String(r[c.sgk]).trim()) };
    if (ad) u.kisiler[ad] = x; else if (!u.varsayilan) u.varsayilan = x;
  });
  if (!u.varsayilan) u.varsayilan = KURYE_UCRET.varsayilan;
  KURYE_UCRET = u;
}
// Tablodaki kısa ad ("Kenan") mesaideki tam adla ("Kenan Aydemir") eşleşir.
function kuryeUcret_(ad) {
  var k = KURYE_UCRET.kisiler, n = norm_(ad), a;
  for (a in k) if (norm_(a) === n) return k[a];
  for (a in k) if (norm_(a) && norm_(String(ad).split(/\s+/)[0]) === norm_(a)) return k[a];
  return KURYE_UCRET.varsayilan;
}
// Bir mesai satırının maliyeti (KDV dahil) ve kırılımı.
function kuryeMaliyet_(ad, netDk, paket) {
  var u = kuryeUcret_(ad), saat = netDk / 60 * u.saat, pk = paket * u.paket, kdv = (saat + pk) * u.kdv;
  return { grup: u.grup, saat: saat, paket: pk, kdv: kdv, toplam: saat + pk + kdv };
}

function kurye_() {
  var ss = SpreadsheetApp.openById(KAYNAK.kurye.id);
  try { kuryeUcretOku_(ss); } catch (err) { /* yedek ücretlerle devam */ }
  var simdi = simdi_(), bugun = isGunu_(simdi), ay = bugun.slice(0, 7), dun = gunEkle_(bugun, -1);
  var yediBasi = gunEkle_(bugun, -6), otuzBasi = gunEkle_(bugun, -29), ilkSeri = gunEkle_(bugun, -13);
  var out = { bugun: bugun, hedef: KURYE_HEDEF };
  function donemleri(gun) {
    var d = []; if (gun > bugun) return d;
    if (gun === bugun) d.push('bugun'); if (gun === dun) d.push('dun');
    if (gun >= yediBasi) d.push('yedi'); if (gun.slice(0, 7) === ay) d.push('ay'); if (gun >= otuzBasi) d.push('otuz');
    return d;
  }
  var kisi = {}, genel = {}; KURYE_DONEMLER.forEach(function (d) { kisi[d] = {}; genel[d] = gz_(); });
  function kk(d, ad) { return kisi[d][ad] = kisi[d][ad] || { ad: ad, paket: 0, km: 0, toplamDk: 0, yolDk: 0, sureAdet: 0, gec: 0, kuryeGec: 0,
    mesaiDk: 0, mesaiPaket: 0, gun: 0, gecGiris: 0, gecGirisDk: 0, erkenDk: 0, kapanisDk: 0, maliyet: 0 }; }

  // Siparişler: süre aşamaları, gecikme sebebi, kurye başına paket
  var s = sonSatirlar_(ss, 'Siparişler', 6000, ['Tarih', 'Adisyon No', 'Kurye', 'Platform', 'Sipariş Saati', 'Atama (dk)', 'Hazırlık (dk)', 'Yol (dk)', 'Toplam (dk)', 'Mesafe (km)', 'Durum', 'Adres']);
  var seri = {}; for (var i = 0; i < 14; i++) seri[gunEkle_(ilkSeri, i)] = { adet: 0, dk: 0, n: 0, gec: 0, maliyet: 0 };
  var saat = {}, dagilim = [0, 0, 0, 0, 0], platform = {}, enKotu = [], sonSiparisMs = null, mahalleSay = {}, siparisGun = {};
  KURYE_DONEMLER.forEach(function (d) { mahalleSay[d] = {}; });
  if (s) {
    var c = { tarih: kolon_(s.b, ['Tarih']), no: kolon_(s.b, ['Adisyon No']), kurye: kolon_(s.b, ['Kurye']), plat: kolon_(s.b, ['Platform']), sip: kolon_(s.b, ['Sipariş Saati']),
              at: kolon_(s.b, ['Atama (dk)']), hz: kolon_(s.b, ['Hazırlık (dk)']), yol: kolon_(s.b, ['Yol (dk)']), top: kolon_(s.b, ['Toplam (dk)']), km: kolon_(s.b, ['Mesafe (km)']),
              durum: kolon_(s.b, ['Durum']), adres: kolon_(s.b, ['Adres']) };
    s.v.forEach(function (r) {
      var gun = gunStr_(r[c.tarih]); if (!gun) return;
      if (c.durum >= 0 && /iptal|iade/i.test(r[c.durum])) return;
      var ad = String(r[c.kurye] || '').trim() || 'Atanmamış', plat = String(r[c.plat] || '').trim() || 'Belirtilmemiş';
      var at = sayi_(r[c.at]), hz = sayi_(r[c.hz]), yol = sayi_(r[c.yol]), top = sayi_(r[c.top]), km = sayi_(r[c.km]);
      var sureVar = top > 0 && top < 240; // uçuk değerler (unutulan teslim) ortalamayı bozmasın
      var cikis = at + hz, bekYol = beklenenYol_(km);
      var gec = sureVar && top > KURYE_HEDEF.toplam;
      var mutfak = cikis > KURYE_HEDEF.cikis, kuryeden = km > 0 && yol > bekYol + KURYE_HEDEF.yolPay;
      var sebep = !gec ? '' : (mutfak && kuryeden ? 'ikisi' : mutfak ? 'mutfak' : kuryeden ? 'kurye' : 'diger');
      var ms = zaman_(String(r[c.tarih]).trim() + ' ' + String(r[c.sip] || '').trim());
      // Mesai kontrolü için iş günü (gece 00-03 siparişleri önceki vardiyaya sayılır)
      var isg = ms !== null ? isGunu_(ms) : gun;
      if (isg >= otuzBasi && isg <= bugun && ad !== 'Atanmamış') { var gk = siparisGun[isg + '|' + norm_(ad)] = siparisGun[isg + '|' + norm_(ad)] || { gun: isg, ad: ad, paket: 0 }; gk.paket++; }
      if (ms !== null && (sonSiparisMs === null || ms > sonSiparisMs)) sonSiparisMs = ms;
      if (seri[gun]) { seri[gun].adet++; if (sureVar) { seri[gun].dk += top; seri[gun].n++; } if (gec) seri[gun].gec++; }
      donemleri(gun).forEach(function (d) {
        var x = kk(d, ad); x.paket++; x.km += km;
        if (sureVar) { x.toplamDk += top; x.yolDk += yol; x.sureAdet++; }
        if (gec) { x.gec++; if (sebep === 'kurye' || sebep === 'ikisi') x.kuryeGec++; }
        var g = genel[d]; g.adet++; g.km += km;
        if (sureVar) { g.n++; g.at += at; g.cikis += cikis; g.yol += yol; g.top += top; }
        if (gec) { g.gec++; g[sebep]++; }
        if (c.adres >= 0 && d !== 'dun') { var mn = mahalleAdi_(r[c.adres]); if (mn) { var mk = mahalleSay[d][norm_(mn)] = mahalleSay[d][norm_(mn)] || { ad: mn, paket: 0, n: 0, top: 0, cikis: 0, yol: 0, km: 0, gec: 0, sureler: [] };
          mk.paket++; mk.km += km; if (sureVar) { mk.n++; mk.top += top; mk.cikis += cikis; mk.yol += yol; mk.sureler.push(top); if (gec) mk.gec++; } } }
      });
      if (gun >= yediBasi && gun <= bugun) {
        var h = parseInt(String(r[c.sip] || '').split(':')[0], 10);
        if (!isNaN(h)) { var sx = saat[h] = saat[h] || { adet: 0, dk: 0, n: 0 }; sx.adet++; if (sureVar) { sx.dk += top; sx.n++; } }
        if (sureVar) dagilim[top <= 20 ? 0 : top <= 30 ? 1 : top <= 40 ? 2 : top <= 60 ? 3 : 4]++;
        var p = platform[plat] = platform[plat] || { ad: plat, adet: 0, dk: 0, n: 0, gec: 0 };
        p.adet++; if (sureVar) { p.dk += top; p.n++; } if (gec) p.gec++;
        if (gec) enKotu.push({ gun: gun, no: r[c.no], platform: plat, kurye: ad, saat: String(r[c.sip] || '').slice(0, 5), km: Math.round(km * 100) / 100,
          cikis: Math.round(cikis), yol: Math.round(yol), bekYol: bekYol, toplam: Math.round(top), sebep: sebep });
      }
    });
  }
  out.sonSiparis = sonSiparisMs === null ? null : new Date(sonSiparisMs).toISOString().slice(0, 16).replace('T', ' ');
  // İş günü 10:00'da başlar: saatleri 11, …, 23, 0, 1, 2 sırasıyla ver
  out.saatlik = []; for (var hh = 10; hh < 27; hh++) { var h2 = hh % 24, sv = saat[h2]; if (sv || (hh >= 11 && hh <= 23)) out.saatlik.push({ saat: h2, gunluk: sv ? Math.round(sv.adet / 7 * 10) / 10 : 0, ortDk: sv && sv.n ? Math.round(sv.dk / sv.n) : null }); }
  out.dagilim = ['20 dk ve altı', '21–30 dk', '31–40 dk', '41–60 dk', '60 dk üstü'].map(function (ad, j) { return { ad: ad, deger: dagilim[j] }; });
  out.platform = Object.keys(platform).map(function (k) { var p = platform[k]; return { ad: p.ad, adet: p.adet, gec: p.gec, ortDk: p.n ? Math.round(p.dk / p.n) : null }; }).sort(function (a, b) { return b.adet - a.adet; });
  out.enKotu = enKotu.sort(function (a, b) { return b.toplam - a.toplam; }).slice(0, 30);
  // Mahalle bazlı gerçekleşen teslimat süreleri; Genel Bilgiler › Mahalle_Sube'deki söz verilen süreyle karşılaştırılır.
  var soz = {}; try { soz = subeSozlugu_(); } catch (e) { soz = { sure: {}, mahalle: {} }; }
  out.mahalleSure = {};
  ['bugun', 'yedi', 'ay', 'otuz'].forEach(function (d) {
    out.mahalleSure[d] = Object.keys(mahalleSay[d]).map(function (k) { var x = mahalleSay[d][k], o = function (t) { return x.n ? Math.round(t / x.n * 10) / 10 : null; };
      var srt = x.sureler.sort(function (a, b) { return a - b; }), sz = (soz.sure || {})[k];
      return { ad: x.ad, sube: ((soz.mahalle || {})[k] || '').replace('BAP ', ''), paket: x.paket, ort: o(x.top), medyan: srt.length ? Math.round(srt[Math.floor((srt.length - 1) / 2)]) : null,
               cikis: o(x.cikis), yol: o(x.yol), km: Math.round(x.km / x.paket * 10) / 10, gecOran: x.n ? Math.round(x.gec / x.n * 100) : 0,
               soz: sz ? sz.ust : null, sozMetin: sz ? sz.metin : '', sozAsan: sz ? Math.round(x.sureler.filter(function (t) { return t > sz.ust; }).length / (x.n || 1) * 100) : null };
    }).sort(function (a, b) { return b.paket - a.paket; }).slice(0, 60);
  });

  // Günlük Mesai: bugün kim sahada; dönem bazında net saat, geç giriş, kesinti, maliyet; haftalık bordro
  var mesaiGun = {}, m = sonSatirlar_(ss, 'Günlük Mesai', 1200), bugunMesai = [], kesintiler = [], kadro = {}, haftalar = {};
  var dow = (new Date(bugun + 'T00:00:00Z').getUTCDay() + 6) % 7, buHafta = gunEkle_(bugun, -dow), ilkHafta = gunEkle_(buHafta, -7 * 7);
  if (m) {
    var cm = { tarih: kolon_(m.b, ['Tarih']), kurye: kolon_(m.b, ['Kurye']), pg: kolon_(m.b, ['Planlı Giriş']), g: kolon_(m.b, ['Giriş']), pc: kolon_(m.b, ['Planlı Çıkış']),
               cik: kolon_(m.b, ['Çıkış']), ek: kolon_(m.b, ['Erken Kesinti (dk)']), kk: kolon_(m.b, ['Kapanış Kesintisi (dk)']), net: kolon_(m.b, ['Net Süre']),
               paket: kolon_(m.b, ['Paket']), gec: kolon_(m.b, ['Geç Giriş (dk)']), durum: kolon_(m.b, ['Durum']), neden: kolon_(m.b, ['Kesinti Gerekçesi']) };
    m.v.forEach(function (r) {
      var gun = gunStr_(r[cm.tarih]); if (!gun || gun > bugun) return;
      var ad = String(r[cm.kurye] || '').trim(); if (!ad) return;
      var net = sureDk_(r[cm.net]), paket = sayi_(r[cm.paket]), gec = sayi_(r[cm.gec]), erken = sayi_(r[cm.ek]), kapanis = sayi_(r[cm.kk]);
      mesaiGun[gun + '|' + norm_(ad)] = { net: net, acik: /açık/i.test(r[cm.durum] || '') || !!(r[cm.g] && !r[cm.cik]), durum: r[cm.durum] || '' };
      var acik = /açık/i.test(r[cm.durum] || '') || !!(r[cm.g] && !r[cm.cik]);
      var mal = kuryeMaliyet_(ad, acik ? 0 : net, paket), u = kuryeUcret_(ad);
      if (gun >= otuzBasi) kadro[ad] = u.grup;
      if (gun === bugun) {
        // Vardiyası kapanmamış kurye için süreyi girişten şu ana kadar say (tablo vardiya kapanınca yazıyor).
        var canli = 0, gm = String(r[cm.g] || '').match(/^(\d{1,2}):(\d{2})/);
        if (acik && gm) { var gms = Date.parse(gun + 'T00:00:00Z') + (+gm[1]) * 3600000 + (+gm[2]) * 60000; if (+gm[1] < 6) gms += 86400000; canli = Math.max(0, Math.round((simdi - gms) / 60000)); }
        bugunMesai.push({ ad: ad, plan: [r[cm.pg], r[cm.pc]].filter(String).join('–'), giris: r[cm.g] || '', cikis: r[cm.cik] || '', paket: paket, gecDk: gec,
          durum: r[cm.durum] || '', netDk: net, canliDk: canli, acik: acik, neden: kodsuz_(r[cm.neden] || '') });
      }
      if (gun >= otuzBasi && (erken > 0 || kapanis > 0))
        kesintiler.push({ gun: gun, ad: ad, erken: erken, kapanis: kapanis, tl: Math.round(kapanis / 60 * u.saat), unutulmus: kapanis >= 120, neden: kodsuz_(r[cm.neden] || '') });
      if (seri[gun]) seri[gun].maliyet += mal.toplam;
      // Açık vardiyanın süresi henüz yazılmadı: saatte-paket oranına girmesin, paketleri hakedişe girsin.
      donemleri(gun).forEach(function (d) {
        var x = kk(d, ad); if (net > 0 && !acik) { x.mesaiDk += net; x.mesaiPaket += paket; x.gun++; }
        if (gec > 0) { x.gecGiris++; x.gecGirisDk += gec; } x.erkenDk += erken; x.kapanisDk += kapanis;
        x.maliyet += mal.toplam; genel[d].maliyet += mal.toplam; genel[d].mesaiPaket += paket;
      });
      var hf = gunEkle_(gun, -((new Date(gun + 'T00:00:00Z').getUTCDay() + 6) % 7));
      if (hf >= ilkHafta) {
        var hk = haftalar[hf] = haftalar[hf] || {}, b = hk[ad] = hk[ad] || { ad: ad, grup: mal.grup, gun: 0, netDk: 0, paket: 0, kesintiDk: 0, saat: 0, paketTl: 0, kdv: 0, toplam: 0, acik: false };
        if (net > 0 || paket > 0) b.gun++; if (!acik) b.netDk += net; b.paket += paket; b.kesintiDk += erken + kapanis; if (acik) b.acik = true;
        b.saat += mal.saat; b.paketTl += mal.paket; b.kdv += mal.kdv; b.toplam += mal.toplam;
      }
    });
  }
  bugunMesai.sort(function (a, b) { return String(a.giris || '99').localeCompare(String(b.giris || '99')); });
  out.bugunMesai = bugunMesai;
  // Paketi olduğu halde mesai kaydı olmayan (ya da süresi 0 kalan) kurye-günleri: bordroya ne saat ne paket girer.
  var mesaiAdlar = {}; Object.keys(mesaiGun).forEach(function (k) { mesaiAdlar[k.split('|')[1]] = 1; });
  out.eksikMesai = Object.keys(siparisGun).map(function (k) { var x = siparisGun[k], mg = mesaiGun[k];
    if (mg && (mg.net > 0 || mg.acik)) return null;
    return { gun: x.gun, ad: x.ad, paket: x.paket, neden: mg ? 'Mesai satırı var ama süre 0 (' + (mg.durum || 'giriş yok') + ')' : (mesaiAdlar[norm_(x.ad)] ? 'O gün mesai satırı yok' : 'Bu isimle hiç mesai satırı yok (isim farklı yazılıyor olabilir)') };
  }).filter(Boolean).sort(function (a, b) { return b.gun.localeCompare(a.gun) || b.paket - a.paket; }).slice(0, 40);
  var bugunAdlar = {}; bugunMesai.forEach(function (x) { bugunAdlar[norm_(x.ad)] = 1; });
  out.kadro = { sayi: Object.keys(kadro).length, off: Object.keys(kadro).filter(function (k) { return !bugunAdlar[norm_(k)]; }).sort(function (a, b) { return a.localeCompare(b, 'tr'); }) };
  out.kesintiler = kesintiler.sort(function (a, b) { return b.gun.localeCompare(a.gun) || (b.erken + b.kapanis) - (a.erken + a.kapanis); }).slice(0, 150);
  var yuv = function (x) { return Math.round(x); };
  // Elle girilen kesintiler ('Kesintiler' sekmesi): TL tipi hakedişten düşülür, Saat tipi ödenen süreden düşülür.
  var ks = sonSatirlar_(ss, 'Kesintiler', 2000), elle = [];
  if (ks) {
    var ck = { tarih: kolon_(ks.b, ['Tarih']), ad: kolon_(ks.b, ['Kurye Adı', 'Kurye']), tip: kolon_(ks.b, ['Kesinti Tipi']), dk: kolon_(ks.b, ['Kesilen Süre']),
               tl: kolon_(ks.b, ['Kesilen Tutar']), not: kolon_(ks.b, ['Açıklama']) };
    ks.v.forEach(function (r) {
      var gun = gunStr_(r[ck.tarih]), ad = String(r[ck.ad] || '').trim(); if (!gun || !ad) return;
      if (gun >= gunEkle_(bugun, -59)) elle.push({ gun: gun, ad: ad, tip: /saat/i.test(r[ck.tip] || '') ? 'Saat' : 'TL', dk: sayi_(r[ck.dk]), tl: sayi_(r[ck.tl]), not: String(r[ck.not] || '').slice(0, 120) });
      var hf = gunEkle_(gun, -((new Date(gun + 'T00:00:00Z').getUTCDay() + 6) % 7)); if (hf < ilkHafta || gun > bugun) return;
      var hk = haftalar[hf] = haftalar[hf] || {}, anahtar = kuryeEsle_(Object.keys(hk), ad) || ad;
      var b = hk[anahtar] = hk[anahtar] || { ad: ad, grup: kuryeUcret_(ad).grup, gun: 0, netDk: 0, paket: 0, kesintiDk: 0, saat: 0, paketTl: 0, kdv: 0, toplam: 0, acik: false };
      var tl = sayi_(r[ck.tl]), dk = sayi_(r[ck.dk]), tip = String(r[ck.tip] || '');
      if (/saat/i.test(tip) && dk > 0) { b.ekDk = (b.ekDk || 0) + dk; b.saat -= dk / 60 * kuryeUcret_(b.ad).saat; }
      if (tl > 0) b.paraKesinti = (b.paraKesinti || 0) + tl;
      if (tl > 0 || dk > 0) (b.kesintiNot = b.kesintiNot || []).push(gun.slice(8) + '.' + gun.slice(5, 7) + ' ' + (tl > 0 ? Math.round(tl) + ' ₺' : dk + ' dk') + (r[ck.not] ? ' — ' + String(r[ck.not]).slice(0, 60) : ''));
    });
  }
  out.elleKesinti = elle.sort(function (x, y) { return y.gun.localeCompare(x.gun); }).slice(0, 40);
  // Kesinti formundaki kurye listesi: son 60 günde mesaisi olanlar + Kurye bilgiler'deki adlar
  var adlar = {}; Object.keys(haftalar).forEach(function (hf) { Object.keys(haftalar[hf]).forEach(function (k) { adlar[k] = 1; }); });
  Object.keys(KURYE_UCRET.kisiler || {}).forEach(function (k) { if (!kuryeEsle_(Object.keys(adlar), k)) adlar[k] = 1; });
  out.kuryeAdlari = Object.keys(adlar).sort(function (a, b) { return a.localeCompare(b, 'tr'); });
  // Kuryeye ödenecek: saat + paket − para kesintisi; Haddy'de KDV bu net tutar üzerinden (kurye panelindeki bordroyla aynı).
  out.bordro = Object.keys(haftalar).sort().reverse().map(function (hf) {
    return { hafta: hf, bitis: gunEkle_(hf, 6), kisiler: Object.keys(haftalar[hf]).map(function (k) { var b = haftalar[hf][k];
      var para = b.paraKesinti || 0, net = b.saat + b.paketTl - para, kdv = net * kuryeUcret_(b.ad).kdv;
      return { ad: b.ad, grup: b.grup, gun: b.gun, netDk: b.netDk, paket: b.paket, kesintiDk: b.kesintiDk, ekDk: b.ekDk || 0, saat: yuv(b.saat), paketTl: yuv(b.paketTl),
               paraKesinti: yuv(para), kdv: yuv(kdv), toplam: yuv(net + kdv), acik: b.acik, kesintiNot: (b.kesintiNot || []).join(' · ') };
    }).sort(function (a, b) { return a.grup.localeCompare(b.grup) || b.toplam - a.toplam; }) };
  });

  // Açık hesaplar: 'Ödenmez' (işletme/personel siparişi) kuryeden alınacak para değil, ayrı sayılır.
  // Panelden kapatılanlar ('Tahsilatlar' sekmesi) listeden düşer.
  var kapali = tahsilatlar_(ss), a = sonSatirlar_(ss, 'Açık Hesaplar', 2000), acikL = [], haric = { adet: 0, tutar: 0 };
  if (a) {
    var ca = { tarih: kolon_(a.b, ['Tarih']), no: kolon_(a.b, ['Adisyon No']), id: kolon_(a.b, ['Sipariş ID']), plat: kolon_(a.b, ['Platform']), kurye: kolon_(a.b, ['Kurye']),
               odeme: kolon_(a.b, ['Ödeme Yöntemi']), tutar: kolon_(a.b, ['Tutar (TL)', 'Tutar']), durum: kolon_(a.b, ['Durum']) };
    a.v.forEach(function (r) {
      var gun = gunStr_(r[ca.tarih]); if (!gun) return;
      var odeme = String(r[ca.odeme] || '').trim(), tutar = sayi_(r[ca.tutar]), id = siparisNo_(r[ca.id]);
      if (id && kapali.idler[id]) return;
      if (/ödenmez|odenmez/i.test(odeme)) { haric.adet++; haric.tutar += tutar; return; }
      var yas = Math.round((Date.parse(bugun + 'T00:00:00Z') - Date.parse(gun + 'T00:00:00Z')) / 86400000);
      acikL.push({ id: id, gun: gun, yas: yas, no: r[ca.no], platform: r[ca.plat] || '', kurye: String(r[ca.kurye] || '').trim() || 'Atanmamış', odeme: odeme, tutar: tutar,
        durum: r[ca.durum] || '' });
    });
  }
  acikL.sort(function (x, y) { return y.yas - x.yas || y.tutar - x.tutar; });
  var eski = acikL.filter(function (x) { return x.yas > 0; }), bugunkuler = acikL.filter(function (x) { return x.yas <= 0; });
  var eskiKisi = {}; eski.forEach(function (x) { topla_(eskiKisi, x.kurye, x.tutar); });
  var tl = function (l) { return Math.round(l.reduce(function (t, x) { return t + x.tutar; }, 0)); };
  out.acik = { eski: { adet: eski.length, toplam: tl(eski), ayUstu: eski.filter(function (x) { return x.yas > 30; }).length },
               bugun: { adet: bugunkuler.length, toplam: tl(bugunkuler) }, haric: { adet: haric.adet, toplam: Math.round(haric.tutar) },
               kisi: sirala_(eskiKisi), liste: eski.slice(0, 60).concat(bugunkuler.slice(0, 30)), kapanan: kapali.son, adisyoBekleyen: kapali.adisyoBekleyen };

  out.genel = {};
  KURYE_DONEMLER.forEach(function (d) { var g = genel[d], o = function (t) { return g.n ? Math.round(t / g.n * 10) / 10 : null; };
    out.genel[d] = { adet: g.adet, km: Math.round(g.km), maliyet: Math.round(g.maliyet), paketBasi: g.mesaiPaket ? Math.round(g.maliyet / g.mesaiPaket) : null, atama: o(g.at), cikis: o(g.cikis), yol: o(g.yol), toplam: o(g.top), gec: g.gec,
      sebep: { mutfak: g.mutfak, kurye: g.kurye, ikisi: g.ikisi, diger: g.diger } }; });
  out.seri = Object.keys(seri).sort().map(function (k) { var x = seri[k]; return { gun: k, adet: x.adet, ortDk: x.n ? Math.round(x.dk / x.n) : null, gec: x.gec, maliyet: Math.round(x.maliyet) }; });
  out.ucret = KURYE_UCRET;
  try { out.eslestirme = kuryeEslestirme_(); } catch (err) { out.eslestirme = { hata: String(err.message || err) }; }
  try { out.seferler = seferler_(ss, bugun); } catch (err) { out.seferler = []; out.seferHata = String(err.message || err); }
  out.subeKonum = SUBE_KONUM;
  out.kisiler = {};
  KURYE_DONEMLER.forEach(function (d) {
    out.kisiler[d] = Object.keys(kisi[d]).map(function (k) { var x = kisi[d][k];
      return { ad: x.ad, paket: x.paket, km: Math.round(x.km), ortDk: x.sureAdet ? Math.round(x.toplamDk / x.sureAdet) : null,
               ortYol: x.sureAdet ? Math.round(x.yolDk / x.sureAdet) : null, gec: x.gec, kuryeGec: x.kuryeGec, netSaat: Math.round(x.mesaiDk / 6) / 10,
               paketSaat: x.mesaiDk >= 60 ? Math.round(x.mesaiPaket / (x.mesaiDk / 60) * 10) / 10 : null, gun: x.gun,
               gecGiris: x.gecGiris, gecGirisDk: Math.round(x.gecGirisDk), erkenDk: Math.round(x.erkenDk), kapanisDk: Math.round(x.kapanisDk),
               maliyet: Math.round(x.maliyet), paketBasi: x.paket ? Math.round(x.maliyet / x.paket) : null };
    }).sort(function (x, y) { return y.paket - x.paket || y.netSaat - x.netSaat; });
  });
  return out;
}

// "46.847.362" ve "46847362" aynı sipariş: yalnız rakamlar.
function siparisNo_(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

// Mesaideki tam adla kısa adı eşleştirir ("Kenan" → "Kenan Aydemir", "Ömer" → "MUHAMMET ÖMER").
function kuryeEsle_(adlar, ad) {
  var n = norm_(ad), i, parca;
  for (i = 0; i < adlar.length; i++) if (norm_(adlar[i]) === n) return adlar[i];
  for (i = 0; i < adlar.length; i++) { parca = String(adlar[i]).split(/\s+/).map(norm_); if (parca.indexOf(n) >= 0) return adlar[i]; }
  return null;
}

var TAHSILAT_BASLIK = ['Sipariş Tarihi', 'Adisyon No', 'Sipariş ID', 'Kurye', 'Ödeme Yöntemi', 'Tutar (TL)', 'İşlem', 'Not', 'Kayıt Zamanı', 'Kaynak'];

// 'Tahsilatlar' sekmesi: panelden kapatılan açık hesaplar. Satır silinirse hesap yeniden açık görünür.
function tahsilatlar_(ss) {
  var t = sonSatirlar_(ss, 'Tahsilatlar', 5000), out = { idler: {}, son: [] }; if (!t) return out;
  var c = { id: kolon_(t.b, ['Sipariş ID']), no: kolon_(t.b, ['Adisyon No']), kurye: kolon_(t.b, ['Kurye']), tutar: kolon_(t.b, ['Tutar (TL)', 'Tutar']),
            islem: kolon_(t.b, ['İşlem']), zaman: kolon_(t.b, ['Kayıt Zamanı']), tarih: kolon_(t.b, ['Sipariş Tarihi', 'Tarih']), adisyo: kolon_(t.b, ['Adisyo Durumu']) };
  out.adisyoBekleyen = 0;
  t.v.forEach(function (r) {
    var id = siparisNo_(r[c.id]); if (!id) return; out.idler[id] = 1;
    var ad = c.adisyo >= 0 ? String(r[c.adisyo] || '') : ''; if (!ad) out.adisyoBekleyen++;
    out.son.push({ id: id, no: r[c.no], kurye: r[c.kurye], tutar: sayi_(r[c.tutar]), islem: r[c.islem], zaman: String(r[c.zaman] || '').slice(0, 16), tarih: r[c.tarih], adisyo: ad });
  });
  out.son = out.son.reverse().slice(0, 15);
  return out;
}

// Panelden açık hesap kapatma: { siparisId, islem: 'tahsil' | 'kes', not }.
// Sipariş bilgisi tarayıcıdan değil 'Açık Hesaplar' sekmesinden alınır. 'kes' ayrıca 'Kesintiler' sekmesine TL kesinti yazar (bordroda düşülür).
function hesapKapat_(d) {
  if (d.islem === 'adisyo') return { tamam: true, adisyo: tahsilatlariAdisyoyaIsle_() };
  var id = siparisNo_(d.siparisId), islem = d.islem === 'kes' ? 'kes' : d.islem === 'tahsil' ? 'tahsil' : '';
  if (!id || !islem) return { hata: 'Geçersiz istek.' };
  var ss = SpreadsheetApp.openById(KAYNAK.kurye.id);
  if (tahsilatlar_(ss).idler[id]) return { tamam: true, zatenKapali: true };
  var a = sonSatirlar_(ss, 'Açık Hesaplar', 2000); if (!a) return { hata: "'Açık Hesaplar' sekmesi okunamadı." };
  var ca = { tarih: kolon_(a.b, ['Tarih']), no: kolon_(a.b, ['Adisyon No']), id: kolon_(a.b, ['Sipariş ID']), kurye: kolon_(a.b, ['Kurye']),
             odeme: kolon_(a.b, ['Ödeme Yöntemi']), tutar: kolon_(a.b, ['Tutar (TL)', 'Tutar']) };
  var r = a.v.filter(function (x) { return siparisNo_(x[ca.id]) === id; })[0];
  if (!r) return { hata: 'Bu sipariş Açık Hesaplar listesinde bulunamadı; tablo güncellenmiş olabilir. Paneli yenileyin.' };
  var kurye = String(r[ca.kurye] || '').trim(), tutar = sayi_(r[ca.tutar]), not = String(d.not || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (islem === 'kes' && !(tutar > 0)) return { hata: 'Tutar okunamadı; kesinti yazılmadı.' };
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss');

  var sh = ss.getSheetByName('Tahsilatlar');
  if (!sh) { sh = ss.insertSheet('Tahsilatlar'); sh.appendRow(TAHSILAT_BASLIK); sh.setFrozenRows(1); sh.getRange(1, 1, 1, TAHSILAT_BASLIK.length).setFontWeight('bold'); }
  sh.appendRow([r[ca.tarih], r[ca.no], "'" + id, kurye, r[ca.odeme], tutar, islem === 'kes' ? 'Kuryeden kesildi' : 'Tahsil edildi', not, damga, 'Panel']);

  if (islem === 'kes') {
    var ks = ss.getSheetByName('Kesintiler');
    if (!ks) { ks = ss.insertSheet('Kesintiler'); ks.appendRow(['Tarih', 'Kurye Adı', 'Kesinti Tipi (Saat / TL)', 'Kesilen Süre (Dk)', 'Kesilen Tutar (TL)', 'Açıklama']); ks.setFrozenRows(1); }
    ks.appendRow([Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy'), kurye, 'TL', '', tutar,
      'Açık hesap: adisyon ' + r[ca.no] + ', ' + r[ca.tarih] + ' (' + r[ca.odeme] + ')' + (not ? ' — ' + not : '')]);
  }
  var ozet = kurye + ' — adisyon ' + r[ca.no] + ', ' + tutar + ' TL: ' + (islem === 'kes' ? 'kuryeden kesildi' : 'tahsil edildi');
  try { cevapKaydet_('Operasyon', 'Kurye Net Çalışma Süresi › Tahsilatlar', sh.getLastRow(), 'Açık hesap kapatıldı', ozet, damga.slice(0, 16)); } catch (err) { }
  var adisyo = null; try { adisyo = tahsilatlariAdisyoyaIsle_(); } catch (err) { adisyo = { hata: String(err.message || err) }; }
  return { tamam: true, islem: islem, kurye: kurye, tutar: tutar, adisyo: adisyo };
}

// Panelden elle kesinti: { istekNo, kurye, tarih: 'yyyy-MM-dd', tip: 'Saat' | 'TL', miktar, aciklama, onay }.
// 'Kesintiler' sekmesine kurye panelindeki biçimde yeni satır ekler; bordroda TL hakedişten, Saat ödenen süreden düşülür.
function kesintiGir_(d) {
  var cache = CacheService.getScriptCache(), istek = String(d.istekNo || '').slice(0, 64);
  var onceki = istek ? cache.get('kesinti_' + istek) : null;
  if (onceki) { try { var o = JSON.parse(onceki); o.zatenKayitli = true; return o; } catch (err) { return { tamam: true, zatenKayitli: true }; } }
  var ad = String(d.kurye || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!ad) return { hata: 'Kuryeyi seçin.' };
  var tip = d.tip === 'Saat' ? 'Saat' : d.tip === 'TL' ? 'TL' : '';
  if (!tip) return { hata: 'Kesinti türünü seçin (saat ya da TL).' };
  var miktar = Math.round(sayi_(d.miktar) * 100) / 100;
  if (!(miktar > 0)) return { hata: tip === 'Saat' ? 'Kaç dakika kesileceğini yazın.' : 'Geçerli bir tutar yazın.' };
  if (tip === 'Saat' && miktar > 720) return { hata: 'Bir seferde en fazla 720 dk (12 saat) kesilebilir.' };
  if (tip === 'TL' && miktar > 50000) return { hata: 'Tutar çok yüksek görünüyor; kontrol edin.' };
  if (tip === 'Saat') miktar = Math.round(miktar);
  var m = String(d.tarih || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return { hata: 'Tarihi seçin.' };
  var tarih = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0), gun = (tarih.getTime() - Date.now()) / 86400000;
  if (gun > 1) return { hata: 'İleri tarihli kesinti girilemez.' };
  if (gun < -62) return { hata: 'İki aydan eski kesinti panelden girilemez; tabloya elle yazın.' };
  var tarihYazi = Utilities.formatDate(tarih, TZ, 'dd.MM.yyyy');
  var aciklama = String(d.aciklama || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!aciklama) return { hata: 'Kısa bir açıklama yazın (ne oldu?). Kurye itiraz ederse bu satıra bakılacak.' };

  var ss = SpreadsheetApp.openById(KAYNAK.kurye.id);
  var sh = ss.getSheetByName('Kesintiler');
  if (!sh) { sh = ss.insertSheet('Kesintiler'); sh.appendRow(['Tarih', 'Kurye Adı', 'Kesinti Tipi (Saat / TL)', 'Kesilen Süre (Dk)', 'Kesilen Tutar (TL)', 'Açıklama']); sh.setFrozenRows(1); }
  var lc = Math.max(6, sh.getLastColumn()), b = sh.getRange(1, 1, 1, lc).getDisplayValues()[0];
  var c = { tarih: kolon_(b, ['Tarih']), ad: kolon_(b, ['Kurye Adı', 'Kurye']), tip: kolon_(b, ['Kesinti Tipi']), dk: kolon_(b, ['Kesilen Süre']), tl: kolon_(b, ['Kesilen Tutar']), not: kolon_(b, ['Açıklama']) };
  if (c.tarih < 0 || c.ad < 0 || c.tip < 0 || c.dk < 0 || c.tl < 0) return { hata: "'Kesintiler' sekmesinde beklenen başlıklar bulunamadı (Tarih, Kurye Adı, Kesinti Tipi, Kesilen Süre, Kesilen Tutar)." };

  // Aynı gün, aynı kurye, aynı tür ve miktar zaten varsa önce sor.
  if (d.onay !== '1' && sh.getLastRow() >= 2) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, lc).getDisplayValues();
    for (var i = v.length - 1; i >= 0; i--) {
      if (gunStr_(v[i][c.tarih]) === gunStr_(tarihYazi) && norm_(v[i][c.ad]) === norm_(ad) && Math.abs(sayi_(v[i][tip === 'Saat' ? c.dk : c.tl]) - miktar) < 0.01)
        return { tekrarMi: true, hata: tarihYazi + ' tarihinde ' + ad + ' için aynı kesinti zaten var. Yine de eklemek istiyorsan onayla.' };
    }
  }
  var satir = []; for (var j = 0; j < lc; j++) satir.push('');
  satir[c.tarih] = tarihYazi; satir[c.ad] = ad; satir[c.tip] = tip;
  satir[tip === 'Saat' ? c.dk : c.tl] = miktar; if (c.not >= 0) satir[c.not] = aciklama + ' (panel)';
  var no = sh.getLastRow() + 1;
  sh.getRange(no, 1, 1, lc).setValues([satir]);
  var sonuc = { tamam: true, kurye: ad, tip: tip, miktar: miktar, tarih: tarihYazi };
  if (istek) cache.put('kesinti_' + istek, JSON.stringify(sonuc), 600);
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss');
  try { cevapKaydet_('Operasyon', 'Kurye Net Çalışma Süresi › Kesintiler', no, 'Kurye kesintisi ' + tarihYazi, ad + ' — ' + (tip === 'Saat' ? miktar + ' dk' : miktar + ' TL') + ': ' + aciklama, damga.slice(0, 16)); } catch (err) { }
  return sonuc;
}

/* ---------------- Kurye seferleri ve canlı rota ---------------- */

// Şubelerin çıkış noktası (Google Haritalar'a verilen adres). En doğrusu koordinat: Google Haritalar'da şubenin kapısına
// basılı tutunca çıkan "41.0xxxxx, 29.0xxxxx" değeri buraya adres yerine yazılabilir (ör. 'BAP Erenköy': '40.97351, 29.07623').
var SUBE_KONUM = {
  'BAP Erenköy': 'Erenköy Mahallesi, Alpler Sokak No:7A, 34738 Kadıköy/İstanbul',
  'BAP Fikirtepe': 'Evinpark Sitesi C Blok, Mandıra Caddesi, Fikirtepe Mahallesi, 34720 Kadıköy/İstanbul'
};
var SEFER_ARALIK_DK = 5;   // aynı kuryenin bu kadar dakika içinde restorandan çıkan siparişleri tek sefer
var TESLIM_PAYI_DK = 2;    // her kapıda paketi teslim etmek için eklenen süre

// Adres metninden mahalle adı (panelde yalnız mahalle gösterilir).
function mahalleAdi_(adres) {
  var s = String(adres || ''), m = s.match(/Mahalle\s*:\s*([^,]+?)\s*Mah/i) || s.match(/([A-ZÇĞİÖŞÜ][\wçğıöşüÇĞİÖŞÜ]+)\s+(?:Kadıköy\s+|Üsküdar\s+|Ataşehir\s+)?Mah(?:allesi)?\b/);
  if (m) return m[1].trim();
  var ilk = s.split(',')[0].trim();
  // "Göztepe Cavitpaşa Sk. No:1" gibi mahalle + sokak bitişikse yalnız ilk kelime mahalledir
  if (/\b(Sk|Sok|Sokak|Cd|Cad|Cadde|Caddesi|Bulvar|Blv|No)\b/i.test(ilk)) ilk = ilk.split(/\s+/)[0];
  return ilk.slice(0, 30);
}
// Platform adresini Haritalar'ın anlayacağı hale getirir: kat, daire, apartman adı, notlar atılır.
// Sokakta kapı numarası yoksa platformun "Apt No" / "Apt" alanı (bina numarası) kapı numarası olarak kullanılır.
function adresTemizle_(adres) {
  var s = String(adres || '').split(' * ')[0].split(/,?\s*Türkiye\b/)[0];
  var kapiVar = /(?:^|[^A-Za-z.])No\s*:?\s*\d/i.test(s.replace(/Apt\.?\s*No/gi, '').replace(/Kapı\s*No/gi, '').replace(/Bina\s*No/gi, ''));
  if (!kapiVar) { var m = s.match(/Apt\.?(?:\s*No)?\s*:\s*(\d[\d\/-]*)/i); if (m) s = s.replace(m[0], 'No:' + m[1]); }
  s = s.replace(/Apt\.?(?:\s*Adı|\s*No)?\s*:[^,]*/gi, '').replace(/Kat\s*:[^,]*/gi, '').replace(/Daire(?:\s*No)?\s*:[^,]*/gi, '')
       .replace(/Kapı\s*No\s*:[^,]*/gi, '').replace(/Bina\s*No\s*:\s*/gi, '').replace(/TGO Yemek/gi, '').replace(/Mahalle\s*:/gi, '')
       .replace(/\s*,\s*(,\s*)+/g, ', ').replace(/\s{2,}/g, ' ').replace(/^[,\s]+|[,\s-]+$/g, '');
  if (!/[iİ]stanbul/.test(s)) s += ', İstanbul';
  return s.slice(0, 220);
}
function saatDk_(s) { var m = String(s || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/); if (!m) return null; var d = (+m[1]) * 60 + (+m[2]) + (m[3] ? +m[3] / 60 : 0); return d < 360 ? d + 1440 : d; }

// Siparişin çıktığı şube: Adisyo'da (tarih + günlük sipariş no) → Ürün Çıkan Şube, yoksa Şube; bulunamazsa mahalle listesi.
function subeSozlugu_() {
  var cache = CacheService.getScriptCache(), c = cache.get('sube_sozluk_v2'); if (c) { try { return JSON.parse(c); } catch (e) { } }
  var out = { no: {}, mahalle: {}, sure: {} };
  try {
    var a = sonSatirlar_(SpreadsheetApp.openById(KAYNAK.siparis.id), 'Satıs Verileri', 1500, ['Sipariş No', 'Sipariş Tarihi', 'Şube', 'Ürün Çıkan Şube']);
    if (a) { var cn = kolon_(a.b, ['Sipariş No']), ct = kolon_(a.b, ['Sipariş Tarihi']), cs = kolon_(a.b, ['Şube']), cc = kolon_(a.b, ['Ürün Çıkan Şube']);
      a.v.forEach(function (r) { var no = String(r[cn] || '').trim(), gun = gunStr_(r[ct]); if (!no || !gun) return;
        var sb = subeAnahtar_(r[cc]) || subeAnahtar_(r[cs]); if (/Erenköy|Fikirtepe/.test(sb)) out.no[gun + '|' + no] = sb; }); }
  } catch (e) { }
  try {
    var mh = SpreadsheetApp.openById(KAYNAK.menu.id).getSheetByName('Mahalle_Sube');
    // Sütunlar: Mahalle, Tam ad, Şube, Teslimat süresi ("30-40 dk" gibi; üst sınır söz verilen süre sayılır)
    if (mh) mh.getDataRange().getDisplayValues().slice(1).forEach(function (r) { if (!r[0]) return; var k = norm_(String(r[0]).replace(/\bmah(allesi)?\b\.?/i, '')), sb = subeAnahtar_(r[2]);
      if (/Erenköy|Fikirtepe/.test(sb)) out.mahalle[k] = sb;
      var n = String(r[3] || '').match(/\d+/g); if (n) out.sure[k] = { metin: String(r[3]).trim(), ust: +n[n.length - 1] }; });
  } catch (e) { }
  try { cache.put('sube_sozluk_v2', JSON.stringify(out), 600); } catch (e) { }
  return out;
}
function siparisSubesi_(soz, gun, no, mahalle) {
  var k = soz.no[gun + '|' + String(no || '').trim()] || soz.no[gunEkle_(gun, -1) + '|' + String(no || '').trim()];
  if (k) return { sube: k, kaynak: 'Adisyo' };
  var m = soz.mahalle[norm_(mahalle)]; if (m) return { sube: m, kaynak: 'mahalle' };
  return { sube: 'BAP Erenköy', kaynak: 'varsayılan' };
}

// Bugünün seferleri: aynı kurye + restorandan SEFER_ARALIK_DK içinde çıkan siparişler. Yola çıkmamış atanmış siparişler ayrı grup.
function seferler_(ss, bugun) {
  var s = sonSatirlar_(ss, 'Siparişler', 600, ['Tarih', 'Sipariş ID', 'Adisyon No', 'Platform', 'Kurye', 'Atandı', 'Restorandan Çıktı', 'Teslim Saati', 'Mesafe (km)', 'Toplam (dk)', 'Adres', 'Durum']);
  if (!s) return [];
  var c = { tarih: kolon_(s.b, ['Tarih']), id: kolon_(s.b, ['Sipariş ID']), no: kolon_(s.b, ['Adisyon No']), plat: kolon_(s.b, ['Platform']), kurye: kolon_(s.b, ['Kurye']),
            at: kolon_(s.b, ['Atandı']), cik: kolon_(s.b, ['Restorandan Çıktı']), tes: kolon_(s.b, ['Teslim Saati']), km: kolon_(s.b, ['Mesafe (km)']), top: kolon_(s.b, ['Toplam (dk)']),
            adres: kolon_(s.b, ['Adres']), durum: kolon_(s.b, ['Durum']) };
  var soz = subeSozlugu_(), yarin = gunEkle_(bugun, 1), kisi = {};
  s.v.forEach(function (r) {
    var gun = gunStr_(r[c.tarih]); if (gun !== bugun && gun !== yarin) return;
    var durum = String(r[c.durum] || ''); if (/iptal|iade/i.test(durum)) return;
    var ad = String(r[c.kurye] || '').trim(); if (!ad) return;
    var mh = mahalleAdi_(r[c.adres]), sb = siparisSubesi_(soz, gun, r[c.no], mh);
    (kisi[ad] = kisi[ad] || []).push({ id: siparisNo_(r[c.id]), no: r[c.no], platform: r[c.plat] || '', mahalle: mh, km: sayi_(r[c.km]),
      cikti: String(r[c.cik] || '').slice(0, 5), teslim: String(r[c.tes] || '').slice(0, 5), cikDk: saatDk_(r[c.cik]), tesDk: saatDk_(r[c.tes]),
      durum: durum, sube: sb.sube, subeKaynak: sb.kaynak });
  });
  var out = [];
  Object.keys(kisi).forEach(function (ad) {
    var l = kisi[ad], cikmis = l.filter(function (x) { return x.cikDk !== null; }).sort(function (a, b) { return a.cikDk - b.cikDk; });
    var bekleyen = l.filter(function (x) { return x.cikDk === null && !/teslim/i.test(x.durum); });
    var grup = null;
    cikmis.forEach(function (x) {
      if (!grup || x.cikDk - grup.bas > SEFER_ARALIK_DK) { grup = { kurye: ad, bas: x.cikDk, siparisler: [] }; out.push(grup); }
      grup.siparisler.push(x);
    });
    if (bekleyen.length) out.push({ kurye: ad, bas: 99999, bekliyor: true, siparisler: bekleyen });
  });
  out.forEach(function (g) {
    var l = g.siparisler, bitti = l.every(function (x) { return x.tesDk !== null; });
    g.durum = g.bekliyor ? 'yola çıkmadı' : bitti ? 'tamamlandı' : 'yolda';
    var sb = {}; l.forEach(function (x) { sb[x.sube] = (sb[x.sube] || 0) + 1; }); g.sube = Object.keys(sb).sort(function (a, b) { return sb[b] - sb[a]; })[0];
    if (bitti && !g.bekliyor) { var son = Math.max.apply(null, l.map(function (x) { return x.tesDk; })); g.fiiliDk = Math.round(son - g.bas); g.cikti = l[0].cikti; }
    else if (!g.bekliyor) g.cikti = l[0].cikti;
    l.sort(function (a, b) { return (a.tesDk || 99999) - (b.tesDk || 99999); });
    l.forEach(function (x) { delete x.cikDk; delete x.tesDk; });
    delete g.bas;
  });
  var sira = { 'yola çıkmadı': 0, 'yolda': 1, 'tamamlandı': 2 };
  out.sort(function (a, b) { return sira[a.durum] - sira[b.durum] || String(b.cikti || '').localeCompare(String(a.cikti || '')); });
  return out.slice(0, 60);
}

// Canlı rota: { idler: [...] }. Şubeden → 1. teslimat → 2. → 3.; her bacak o anki trafikle km ve süre.
// Teslim edilmiş seferde gerçek teslim sırası, edilmemişte en kısa sıra kullanılır.
function rotaHesapla_(d) {
  var idler = (d.idler || []).map(siparisNo_).filter(String).slice(0, 5); if (!idler.length) return { hata: 'Sipariş seçilmedi.' };
  var zorla = SUBE_KONUM[d.sube] ? d.sube : '';  // panelden "Erenköy'den / Fikirtepe'den hesapla"
  var cache = CacheService.getScriptCache(), anahtar = 'rota_' + idler.slice().sort().join('_') + (zorla ? '_' + norm_(zorla) : ''), eski = cache.get(anahtar);
  // Saklanan sonuç, o sırada teslim edilmemiş siparişlerle hesaplandıysa ve panel artık teslimleri görüyorsa yeniden hesapla.
  if (eski) { try { var o = JSON.parse(eski); if (!(+d.teslimSayisi > (o.teslimSayisi || 0))) { o.onbellek = true; return o; } } catch (e) { } }
  var ss = SpreadsheetApp.openById(KAYNAK.kurye.id);
  var s = sonSatirlar_(ss, 'Siparişler', 1500, ['Tarih', 'Sipariş ID', 'Adisyon No', 'Adres', 'Restorandan Çıktı', 'Teslim Saati', 'Mesafe (km)']);
  if (!s) return { hata: 'Siparişler sekmesi okunamadı.' };
  var c = { tarih: kolon_(s.b, ['Tarih']), id: kolon_(s.b, ['Sipariş ID']), no: kolon_(s.b, ['Adisyon No']), adres: kolon_(s.b, ['Adres']), cik: kolon_(s.b, ['Restorandan Çıktı']),
            tes: kolon_(s.b, ['Teslim Saati']), km: kolon_(s.b, ['Mesafe (km)']) };
  var soz = subeSozlugu_(), duraklar = [];
  s.v.forEach(function (r) { var id = siparisNo_(r[c.id]); if (idler.indexOf(id) < 0) return;
    var gun = gunStr_(r[c.tarih]), mh = mahalleAdi_(r[c.adres]);
    duraklar.push({ id: id, no: r[c.no], mahalle: mh, adres: adresTemizle_(r[c.adres]), tesDk: saatDk_(r[c.tes]), cikDk: saatDk_(r[c.cik]), tabloKm: sayi_(r[c.km]), sube: siparisSubesi_(soz, gun, r[c.no], mh) }); });
  if (!duraklar.length) return { hata: 'Siparişler tabloda bulunamadı.' };
  var sb = {}; duraklar.forEach(function (x) { sb[x.sube.sube] = (sb[x.sube.sube] || 0) + 1; });
  var sube = zorla || Object.keys(sb).sort(function (a, b) { return sb[b] - sb[a]; })[0], cikis = SUBE_KONUM[sube] || SUBE_KONUM['BAP Erenköy'];
  var teslimli = duraklar.every(function (x) { return x.tesDk !== null; });

  function sor(sirali, optimize) {
    var df = Maps.newDirectionFinder().setOrigin(cikis).setDestination(sirali[sirali.length - 1].adres).setMode(Maps.DirectionFinder.Mode.DRIVING)
      .setLanguage('tr').setRegion('tr').setDepart(new Date());
    sirali.slice(0, -1).forEach(function (x) { df.addWaypoint(x.adres); });
    if (optimize && sirali.length > 2) df.setOptimizeWaypoints(true);
    var r = df.getDirections(); if (!r || r.status !== 'OK' || !r.routes || !r.routes.length) throw new Error('Haritalar rota bulamadı (' + (r && r.status) + ')');
    var rt = r.routes[0], ara = sirali.slice(0, -1), sira = optimize && rt.waypoint_order ? rt.waypoint_order.map(function (i) { return ara[i]; }) : ara;
    sira = sira.concat([sirali[sirali.length - 1]]);
    var bacak = rt.legs.map(function (l, i) { var sn = (l.duration_in_traffic || l.duration).value;
      return { kime: sira[i], km: Math.round(l.distance.value / 100) / 10, dk: Math.round(sn / 60), trafikli: !!l.duration_in_traffic, adres: String(l.end_address || '').replace(/, Türkiye$/, '') }; });
    return { bacak: bacak, toplamSn: bacak.reduce(function (t, x) { return t + x.dk; }, 0), baslangic: String((rt.legs[0] || {}).start_address || '').replace(/, Türkiye$/, '') };
  }
  var sonuc;
  try {
    if (teslimli || duraklar.length === 1) sonuc = sor(duraklar.slice().sort(function (a, b) { return (a.tesDk || 0) - (b.tesDk || 0); }), false);
    else { // teslim edilmemiş: her durağı son durak deneyip en kısa sırayı seç (en çok 5 sorgu)
      duraklar.forEach(function (son, i) { var l = duraklar.filter(function (x, j) { return j !== i; }).concat([son]); var r = sor(l, true); if (!sonuc || r.toplamSn < sonuc.toplamSn) sonuc = r; });
    }
  } catch (err) { return { hata: String(err.message || err) }; }
  var surus = sonuc.bacak.reduce(function (t, x) { return t + x.dk; }, 0), km = Math.round(sonuc.bacak.reduce(function (t, x) { return t + x.km; }, 0) * 10) / 10;
  var ilkCik = Math.min.apply(null, duraklar.map(function (x) { return x.cikDk === null ? 99999 : x.cikDk; })), sonTes = Math.max.apply(null, duraklar.map(function (x) { return x.tesDk || 0; }));
  var out = { sube: sube, cikis: cikis, baslangic: sonuc.baslangic, elle: !!zorla, subeKaynak: zorla ? 'elle' : duraklar.map(function (x) { return x.sube.kaynak; }).join(','), sira: teslimli ? 'gerçek teslim sırası' : 'en kısa sıra (öneri)',
    bacaklar: sonuc.bacak.map(function (b) { return { no: b.kime.no, mahalle: b.kime.mahalle, adres: b.adres, km: b.km, dk: b.dk, trafikli: b.trafikli }; }),
    toplamKm: km, surusDk: surus, teslimPayiDk: TESLIM_PAYI_DK * duraklar.length, kapatmaDk: surus + TESLIM_PAYI_DK * duraklar.length,
    fiiliDk: teslimli && ilkCik < 99999 ? Math.round(sonTes - ilkCik) : null, tabloKm: Math.round(duraklar.reduce(function (t, x) { return t + x.tabloKm; }, 0) * 10) / 10,
    zaman: Utilities.formatDate(new Date(), TZ, 'HH:mm'), teslimSayisi: duraklar.filter(function (x) { return x.tesDk !== null; }).length };
  try { cache.put(anahtar, JSON.stringify(out), 600); } catch (e) { }
  return out;
}

/* ---------------- Kapatılan açık hesapları Adisyo'ya işleme ---------------- */

// Tahsilatlar sekmesinde 'Adisyo Durumu' sütunu boş olan her kayıt için Adisyo › Satıs Verileri'nde siparişi bulur
// (kurye tablosundaki sipariş no + sipariş saati, en fazla 20 dk fark) ve 'Ödeme Alındı' hücresini TRUE yapar.
// Sonuç Tahsilatlar › 'Adisyo Durumu' sütununa yazılır; bulunamayan bir sonraki çalışmada yeniden denenir (en fazla 3 gün).
function tahsilatlariAdisyoyaIsle_() {
  var ks = SpreadsheetApp.openById(KAYNAK.kurye.id), th = ks.getSheetByName('Tahsilatlar'); if (!th || th.getLastRow() < 2) return { islenen: 0 };
  var lc = th.getLastColumn(), tb = th.getRange(1, 1, 1, lc).getDisplayValues()[0], ca = kolon_(tb, ['Adisyo Durumu']);
  if (ca < 0) { lc++; th.getRange(1, lc).setValue('Adisyo Durumu'); ca = lc - 1; }
  var ci = kolon_(tb, ['Sipariş ID']), cz = kolon_(tb, ['Kayıt Zamanı']), tv = th.getRange(2, 1, th.getLastRow() - 1, lc).getDisplayValues();
  var bekleyen = []; tv.forEach(function (r, i) { if (!String(r[ca] || '').trim() && siparisNo_(r[ci])) bekleyen.push({ satir: i + 2, id: siparisNo_(r[ci]), zaman: zaman_(r[cz]) }); });
  if (!bekleyen.length) return { islenen: 0 };
  // Kurye sistemi: sipariş ID → sipariş anı ve adisyon no
  var s = sonSatirlar_(ks, 'Siparişler', 8000, ['Tarih', 'Sipariş ID', 'Adisyon No', 'Sipariş Saati']), kmap = {};
  if (s) { var cs = { t: kolon_(s.b, ['Tarih']), id: kolon_(s.b, ['Sipariş ID']), no: kolon_(s.b, ['Adisyon No']), sa: kolon_(s.b, ['Sipariş Saati']) };
    s.v.forEach(function (r) { var id = siparisNo_(r[cs.id]); if (id) kmap[id] = { no: String(r[cs.no] || '').trim(), ms: zaman_(String(r[cs.t]).trim() + ' ' + String(r[cs.sa] || '').trim()) }; }); }
  var as = SpreadsheetApp.openById(KAYNAK.siparis.id), ash = as.getSheetByName('Satıs Verileri'); if (!ash) throw new Error("Adisyo'da 'Satıs Verileri' yok");
  var a = sonSatirlar_(as, 'Satıs Verileri', 8000, ['Sipariş ID', 'Sipariş No', 'Sipariş Tarihi', 'Ödeme Alındı']);
  var son = ash.getLastRow(), ilk = son - a.v.length + 1, c = { id: kolon_(a.b, ['Sipariş ID']), no: kolon_(a.b, ['Sipariş No']), t: kolon_(a.b, ['Sipariş Tarihi']), od: kolon_(a.b, ['Ödeme Alındı']) };
  if (c.od < 0) throw new Error("Adisyo'da 'Ödeme Alındı' sütunu bulunamadı");
  var ano = {}; a.v.forEach(function (r, i) { var no = String(r[c.no] || '').trim(), ms = zaman_(r[c.t]); if (no && ms !== null) (ano[no] = ano[no] || []).push({ satir: ilk + i, ms: ms, id: String(r[c.id] || '').trim(), od: String(r[c.od] || '') }); });
  var simdi = new Date().getTime(), n = 0, bulunamadi = 0;
  bekleyen.forEach(function (b) {
    var k = kmap[b.id], sonuc = '';
    var aday = k && k.ms !== null ? (ano[k.no] || []).map(function (x) { return { x: x, f: Math.abs(x.ms - k.ms) }; }).filter(function (y) { return y.f <= 20 * 60000; }).sort(function (p, q) { return p.f - q.f; })[0] : null;
    if (aday) {
      var hucre = ash.getRange(aday.x.satir, c.id + 1);
      if (String(hucre.getDisplayValue()).trim() !== aday.x.id) sonuc = ''; // satır kaydı; bir sonraki çalışmada yeniden denenir
      else { var od = ash.getRange(aday.x.satir, c.od + 1), once = String(od.getDisplayValue()).toUpperCase();
        if (once !== 'TRUE') od.setValue(true);
        sonuc = 'Ödeme Alındı = TRUE (Adisyo ' + aday.x.id + (once === 'TRUE' ? ', zaten TRUE' : '') + ')'; n++; }
    } else if (b.zaman !== null && simdi - b.zaman > 3 * 86400000) { sonuc = "Adisyo'da bulunamadı; elle kontrol edin"; bulunamadi++; }
    if (sonuc) th.getRange(b.satir, ca + 1).setValue(sonuc);
  });
  return { islenen: n, bulunamadi: bulunamadi, bekleyen: bekleyen.length - n - bulunamadi };
}

/* ---------------- Adisyo ↔ kurye sistemi kurye eşleştirmesi ---------------- */

// Adisyo 'Satıs Verileri'ndeki paket siparişlerini kurye tablosundaki 'Siparişler' ile eşleştirir
// (günlük sipariş no + sipariş saati en fazla 20 dk farklı). Kurye sistemi kimin götürdüğünün kaynağıdır.
// bos: Adisyo'da kurye boş, kurye sisteminde var → doldurulur. farkli: ikisi farklı → sahibin onayı.
// eslesmeyen: Adisyo'da paket siparişi, kurye sisteminde karşılığı yok → sahip kuryeyi seçer.
var ESLESTIRME_GUN = 30;

function ayniKurye_(a, b) {
  var x = norm_(a), y = norm_(b); if (!x || !y) return false; if (x === y) return true;
  var ax = String(a).trim().split(/\s+/).map(norm_), by = String(b).trim().split(/\s+/).map(norm_);
  return ax.indexOf(by[0]) >= 0 || by.indexOf(ax[0]) >= 0;
}

function kuryeEslestirme_() {
  var simdi = simdi_(), bugun = isGunu_(simdi), bas = gunEkle_(bugun, -ESLESTIRME_GUN);
  // Kurye sistemi: sipariş no → [{ms, kurye, platform}]
  var ks = sonSatirlar_(SpreadsheetApp.openById(KAYNAK.kurye.id), 'Siparişler', 6000, ['Tarih', 'Adisyon No', 'Kurye', 'Platform', 'Sipariş Saati', 'Durum']);
  var kno = {}, kAdlar = {};
  if (ks) { var ck = { tarih: kolon_(ks.b, ['Tarih']), no: kolon_(ks.b, ['Adisyon No']), kurye: kolon_(ks.b, ['Kurye']), plat: kolon_(ks.b, ['Platform']), sip: kolon_(ks.b, ['Sipariş Saati']), durum: kolon_(ks.b, ['Durum']) };
    ks.v.forEach(function (r) { var no = String(r[ck.no] || '').trim(), ms = zaman_(String(r[ck.tarih]).trim() + ' ' + String(r[ck.sip] || '').trim()); if (!no || ms === null) return;
      if (/iptal|iade/i.test(r[ck.durum] || '')) return; var ad = String(r[ck.kurye] || '').trim(); if (ad) kAdlar[ad] = 1;
      (kno[no] = kno[no] || []).push({ ms: ms, kurye: ad, platform: r[ck.plat] || '' }); }); }
  // Adisyo
  var ss = SpreadsheetApp.openById(KAYNAK.siparis.id), sh = ss.getSheetByName('Satıs Verileri'); if (!sh) throw new Error("Adisyo dosyasında 'Satıs Verileri' yok");
  var son = sh.getLastRow(), k = Math.min(6000, son - 1);
  var ok = sonSatirlar_(ss, 'Satıs Verileri', 6000, ['Sipariş ID', 'Sipariş No', 'Sipariş Tarihi', 'Sipariş Tipi', 'Masa Siparişi', 'Sipariş Kanalı', 'Şube', 'Kurye', 'Durum']);
  if (!ok) return { bos: [], farkli: [], eslesmeyen: [], ozet: { paket: 0, eslesen: 0, bos: 0, farkli: 0, eslesmeyen: 0 }, kuryeler: [] };
  var b = ok.b;
  var c = { id: kolon_(b, ['Sipariş ID']), no: kolon_(b, ['Sipariş No']), tarih: kolon_(b, ['Sipariş Tarihi']), tip: kolon_(b, ['Sipariş Tipi', 'Masa Siparişi']), kanal: kolon_(b, ['Sipariş Kanalı']),
            sube: kolon_(b, ['Şube']), kurye: kolon_(b, ['Kurye']), durum: kolon_(b, ['Durum']) };
  if (c.id < 0 || c.no < 0 || c.tarih < 0 || c.kurye < 0) throw new Error("Adisyo'da Sipariş ID, Sipariş No, Sipariş Tarihi ya da Kurye sütunu bulunamadı");
  var ilk = son - k + 1, v = ok.v; // satır kaysa bile yazarken Sipariş ID ile doğrulanır
  var karar = eslestirmeKararlari_(), adisyoYazim = {}, out = { bos: [], farkli: [], eslesmeyen: [], ozet: { paket: 0, eslesen: 0 }, kuryeler: [] };
  v.forEach(function (r) { var a = String(r[c.kurye] || '').trim(); if (a) { var f = norm_(a.split(/\s+/)[0]); adisyoYazim[f] = adisyoYazim[f] || {}; adisyoYazim[f][a] = (adisyoYazim[f][a] || 0) + 1; } });
  function yazim(ad) { var f = adisyoYazim[norm_(String(ad).split(/\s+/)[0])]; if (f) return Object.keys(f).sort(function (x, y) { return f[y] - f[x]; })[0];
    var t = String(ad).trim(); return t.charAt(0).toLocaleUpperCase('tr-TR') + t.slice(1); }
  v.forEach(function (r, i) {
    var ms = zaman_(r[c.tarih]); if (ms === null) return; var gun = isGunu_(ms); if (gun < bas || gun > bugun) return;
    if (c.tip >= 0 && !/paket/i.test(r[c.tip] || '')) return;
    if (c.durum >= 0 && /iptal|iade/i.test(r[c.durum] || '')) return;
    var no = String(r[c.no] || '').trim(), id = String(r[c.id] || '').trim(); if (!no || !id) return;
    out.ozet.paket++;
    var aday = (kno[no] || []).map(function (x) { return { x: x, fark: Math.abs(x.ms - ms) }; }).filter(function (y) { return y.fark <= 20 * 60000; }).sort(function (p, q) { return p.fark - q.fark; })[0];
    var adisyo = String(r[c.kurye] || '').trim();
    var kayit = { id: id, satir: ilk + i, no: no, tarih: new Date(ms).toISOString().slice(0, 16).replace('T', ' '), kanal: r[c.kanal] || '', sube: subeAnahtar_(r[c.sube] || '').replace('BAP ', ''), adisyo: adisyo };
    if (!aday || !aday.x.kurye) { if (!adisyo && !karar[id]) out.eslesmeyen.push(kayit); return; }
    kayit.kurye = aday.x.kurye; kayit.oneri = yazim(aday.x.kurye);
    if (!adisyo) out.bos.push(kayit);
    else if (!ayniKurye_(adisyo, aday.x.kurye)) { if (!karar[id]) out.farkli.push(kayit); }
    else out.ozet.eslesen++;
  });
  var tum = {}; Object.keys(kAdlar).forEach(function (a) { tum[yazim(a)] = 1; }); Object.keys(adisyoYazim).forEach(function (f) { tum[yazim(f)] = 1; });
  out.kuryeler = Object.keys(tum).sort(function (x, y) { return x.localeCompare(y, 'tr'); });
  ['bos', 'farkli', 'eslesmeyen'].forEach(function (k2) { out.ozet[k2] = out[k2].length; out[k2].sort(function (x, y) { return y.tarih.localeCompare(x.tarih); }); });
  out.eslesmeyen = out.eslesmeyen.slice(0, 80); out.farkli = out.farkli.slice(0, 80);
  return out;
}

// "Böyle kalsın" denen siparişler kurye tablosundaki 'Kurye Eşleştirme' sekmesinde tutulur (bir daha sorulmaz).
function eslestirmeKaydi_() {
  var ss = SpreadsheetApp.openById(KAYNAK.kurye.id), sh = ss.getSheetByName('Kurye Eşleştirme');
  if (!sh) { sh = ss.insertSheet('Kurye Eşleştirme'); sh.appendRow(['Zaman', 'Adisyo Sipariş ID', 'Sipariş No', 'Sipariş Tarihi', 'Adisyo Kuryesi (önce)', 'Yeni Kurye', 'İşlem', 'Kaynak']); sh.setFrozenRows(1); }
  return sh;
}
function eslestirmeKararlari_() {
  var out = {}, t = sonSatirlar_(SpreadsheetApp.openById(KAYNAK.kurye.id), 'Kurye Eşleştirme', 5000); if (!t) return out;
  var ci = kolon_(t.b, ['Adisyo Sipariş ID']), cl = kolon_(t.b, ['İşlem']);
  t.v.forEach(function (r) { if (/kalsın|kalsin/i.test(r[cl] || '')) out[String(r[ci]).trim()] = 1; });
  return out;
}
// Adisyo'da tek siparişin Kurye hücresini yazar; satır kaymışsa Sipariş ID ile bulur. Önceki değeri kayıt sekmesine düşer.
function adisyoKuryeYaz_(sh, c, kayit, yeni, islem, kaynak, iz) {
  var satir = kayit.satir, idHuc = satir >= 2 && satir <= sh.getLastRow() ? String(sh.getRange(satir, c.id + 1).getDisplayValue()).trim() : '';
  if (idHuc !== kayit.id) { var son = sh.getLastRow(), k = Math.min(8000, son - 1), ids = sh.getRange(son - k + 1, c.id + 1, k, 1).getDisplayValues(); satir = -1;
    for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]).trim() === kayit.id) { satir = son - k + 1 + i; break; } }
  if (satir < 2) return false;
  var hucre = sh.getRange(satir, c.kurye + 1), once = String(hucre.getDisplayValue()).trim();
  hucre.setValue(yeni);
  iz.appendRow([Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss'), "'" + kayit.id, kayit.no, kayit.tarih, once, yeni, islem, kaynak]);
  return true;
}

// Panelden: { islem: 'doldur' | 'duzelt' | 'kalsin' | 'ata', id, kurye }. 'doldur' bütün boşları kurye sistemindeki adla doldurur.
function kuryeEslestirIslem_(d, kaynak) {
  var e = kuryeEslestirme_(), sh = SpreadsheetApp.openById(KAYNAK.siparis.id).getSheetByName('Satıs Verileri'), iz = eslestirmeKaydi_();
  var b = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0], c = { id: kolon_(b, ['Sipariş ID']), kurye: kolon_(b, ['Kurye']) };
  var bul = function (l) { return l.filter(function (x) { return x.id === String(d.id || '').trim(); })[0]; };
  if (d.islem === 'doldur') { var n = 0; e.bos.forEach(function (x) { if (adisyoKuryeYaz_(sh, c, x, x.oneri, 'Boş dolduruldu', kaynak || 'Panel', iz)) n++; }); return { tamam: true, yazilan: n }; }
  if (d.islem === 'duzelt') { var f = bul(e.farkli); if (!f) return { hata: 'Bu sipariş artık farklı görünmüyor; paneli yenileyin.' };
    return adisyoKuryeYaz_(sh, c, f, f.oneri, 'Farklı: kurye sistemine göre düzeltildi', 'Panel', iz) ? { tamam: true } : { hata: "Sipariş Adisyo'da bulunamadı." }; }
  if (d.islem === 'kalsin') { var g = bul(e.farkli) || bul(e.eslesmeyen); if (!g) return { hata: 'Sipariş listede yok; paneli yenileyin.' };
    iz.appendRow([Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss'), "'" + g.id, g.no, g.tarih, g.adisyo, g.adisyo, 'Böyle kalsın', 'Panel']); return { tamam: true }; }
  if (d.islem === 'ata') { var h = bul(e.eslesmeyen) || bul(e.farkli); if (!h) return { hata: 'Sipariş listede yok; paneli yenileyin.' };
    var ad = String(d.kurye || '').replace(/\s+/g, ' ').trim().slice(0, 40); if (!ad) return { hata: 'Kurye seçin.' };
    if (e.kuryeler.map(norm_).indexOf(norm_(ad)) < 0) return { hata: 'Bu kurye listede yok.' };
    return adisyoKuryeYaz_(sh, c, h, ad, 'Elle atandı', 'Panel', iz) ? { tamam: true } : { hata: "Sipariş Adisyo'da bulunamadı." }; }
  return { hata: 'Geçersiz işlem.' };
}

// Zamanlayıcıyla çalıştırılabilir (Tetikleyiciler › saatlik): Adisyo'da kuryesi boş paket siparişlerini doldurur.
function kuryeBoslariDoldur() {
  var k = LockService.getScriptLock(); k.waitLock(20000);
  try { var r = kuryeEslestirIslem_({ islem: 'doldur' }, 'Otomatik'); Logger.log('Doldurulan: ' + r.yazilan);
    try { Logger.log('Adisyo ödeme: ' + JSON.stringify(tahsilatlariAdisyoyaIsle_())); } catch (e) { Logger.log(e); } }
  finally { k.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
}

function gz_() { return { maliyet: 0, mesaiPaket: 0, adet: 0, km: 0, n: 0, at: 0, cikis: 0, yol: 0, top: 0, gec: 0, mutfak: 0, kurye: 0, ikisi: 0, diger: 0 }; }

// "29.09.2026" → "2026-09-29"
function gunStr_(v) { var ms = zaman_(v); return ms === null ? null : new Date(ms).toISOString().slice(0, 10); }

// Sekmenin başlığı ve son n satırı (görünen değerlerle). Sekme yoksa ya da boşsa null.
// basliklar verilirse yalnız o sütunlar okunur (uzun metin sütunları atlanır; büyük sekmede çok daha hızlı).
// Satırlar yine tam genişlikte döner, okunmayan hücreler boş kalır; kolon_ ile bulunan sıra numaraları değişmez.
function sonSatirlar_(ss, ad, n, basliklar) {
  var sh = ss.getSheetByName(ad); if (!sh) return null;
  var son = sh.getLastRow(), gen = sh.getLastColumn(); if (son < 2) return null;
  var k = Math.min(n, son - 1), b = sh.getRange(1, 1, 1, gen).getDisplayValues()[0];
  if (!basliklar) return { b: b, v: sh.getRange(son - k + 1, 1, k, gen).getDisplayValues() };
  var idx = []; basliklar.forEach(function (h) { var i = kolon_(b, [h]); if (i >= 0 && idx.indexOf(i) < 0) idx.push(i); });
  idx.sort(function (x, y) { return x - y; });
  var v = []; for (var r = 0; r < k; r++) { var bos = []; bos.length = gen; v.push(bos); }
  // Yan yana sütunları tek seferde oku
  for (var j = 0; j < idx.length;) {
    var bas = idx[j], bit = bas; while (j + 1 < idx.length && idx[j + 1] === bit + 1) { j++; bit++; } j++;
    var blok = sh.getRange(son - k + 1, bas + 1, k, bit - bas + 1).getDisplayValues();
    for (r = 0; r < k; r++) for (var c = bas; c <= bit; c++) v[r][c] = blok[r][c - bas];
  }
  return { b: b, v: v };
}

/* ---------------- Sahibin panelden verdiği cevaplar ---------------- */

// Panel POST ile { key, tur: 'cevap', kaynak: 'finans-soru', no, konu, cevap } gönderir.
function doPost(e) {
  var d; try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ hata: 'Geçersiz istek' }); }
  var anahtar = PropertiesService.getScriptProperties().getProperty('PANEL_KEY');
  if (!anahtar || d.key !== anahtar) return json_({ hata: 'yetkisiz' });
  if (d.tur === 'puantaj') {
    var kp = LockService.getScriptLock(); kp.waitLock(20000);
    try { return json_(puantajDuzelt_(d)); }
    finally { kp.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  if (d.tur === 'eslestir') {
    var ke = LockService.getScriptLock(); ke.waitLock(25000);
    try { return json_(kuryeEslestirIslem_(d)); } catch (err) { return json_({ hata: String(err.message || err) }); }
    finally { ke.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  if (d.tur === 'rota') {
    try { return json_(rotaHesapla_(d)); } catch (err) { return json_({ hata: String(err.message || err) }); }
  }
  if (d.tur === 'kesinti') {
    var kk = LockService.getScriptLock(); kk.waitLock(20000);
    try { return json_(kesintiGir_(d)); }
    finally { kk.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  if (d.tur === 'hesap') {
    var kh = LockService.getScriptLock(); kh.waitLock(20000);
    try { return json_(hesapKapat_(d)); }
    finally { kh.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  if (d.tur === 'odeme') {
    var k = LockService.getScriptLock(); k.waitLock(20000);
    try { return json_(toptanciOdemeGir_(d)); }
    finally { k.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  var cevap = String(d.cevap || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (!cevap) return json_({ hata: 'Cevap boş.' });
  var kilit = LockService.getScriptLock(); kilit.waitLock(20000);
  try {
    if (d.kaynak === 'finans-soru') return json_(finansSoruCevapla_(d, cevap));
    if (d.kaynak === 'personel-bilgi') return json_(personelBilgiGir_(d));
    return json_({ hata: 'Bilinmeyen kaynak.' });
  } finally { kilit.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
}

function finansSoruCevapla_(d, cevap) {
  var sh = SpreadsheetApp.openById(KAYNAK.gider.id).getSheetByName('Eksikler & Sorular');
  if (!sh) return { hata: "'Eksikler & Sorular' sekmesi bulunamadı." };
  var v = sh.getDataRange().getDisplayValues(), b = v[0];
  var cK = kolon_(b, ['Konu']), cC = kolon_(b, ['Cevap']);
  if (cK < 0 || cC < 0) return { hata: 'Konu ya da Cevap sütunu bulunamadı.' };
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(d.no) && norm_(v[i][cK]) === norm_(d.konu)) {
      var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm');
      var eski = String(v[i][cC] || '').trim();
      var yeni = (eski ? eski + ' | ' : '') + 'Sahip (panelden, ' + damga + '): ' + cevap;
      sh.getRange(i + 1, cC + 1).setValue(yeni);
      cevapKaydet_('Finans', 'BAP Aylık Gider Takibi › Eksikler & Sorular', i + 1, v[i][cK], cevap, damga);
      return { tamam: true, cevap: yeni };
    }
  }
  return { hata: 'Soru tabloda bulunamadı; tablo değişmiş olabilir. Sayfayı yenileyip tekrar deneyin.' };
}

/* ---------------- Toptancı ödemesi girişi ---------------- */

// Odemeler sekmesindeki sütunlar başlık adına göre bulunur; sütun sırası değişse de doğru hücreye yazılır.
var ODEME_SUTUN = {
  id: ['Odeme_ID'], tarih: ['Tarih'], tedarikci: ['Tedarikçi', 'Toptancı', 'Firma'], tutar: ['Tutar'], yontem: ['Yöntem', 'Ödeme_Yöntemi', 'Odeme Yontemi'],
  aciklama: ['Açıklama', 'Aciklama', 'Not'], kayit: ['Kayıt_Zamanı', 'Kayit_Zamani', 'Girilme'], kaynak: ['Kaynak', 'Giren']
};

// Panel POST ile { key, tur: 'odeme', istekNo, tedarikci, tutar, tarih, yontem, aciklama, onay } gönderir.
// Yalnızca Odemeler sekmesinin sonuna yeni satır ekler; mevcut satırlara dokunmaz.
function toptanciOdemeGir_(d) {
  var cache = CacheService.getScriptCache(), istek = String(d.istekNo || '').slice(0, 64);
  // Aynı gönderim ikinci kez gelirse (yanıt yolda kaybolup yeniden gönderildiyse) yeni satır yazma, ilk sonucu döndür.
  var onceki = istek ? cache.get('odeme_' + istek) : null;
  if (onceki) { try { var o = JSON.parse(onceki); o.zatenKayitli = true; return o; } catch (err) { return { tamam: true, zatenKayitli: true }; } }

  var ss = SpreadsheetApp.openById(KAYNAK.fatura.id);
  // Toptancı adı Tedarikciler listesindekiyle birebir aynı yazılmalı, yoksa borçtan düşülmez.
  var td = satirlar_(ss, 'Tedarikciler'), dG = kolon_(td.b, ['Tedarikçi']), aranan = norm_(d.tedarikci), ad = '';
  td.r.forEach(function (r) { var x = String(r[dG] || '').trim(); if (x && norm_(x) === aranan) ad = x; });
  if (!aranan) return { hata: 'Toptancı seçin.' };
  if (!ad) return { hata: 'Bu toptancı Tedarikciler listesinde yok. Önce tabloya ekleyin; yoksa ödeme borçtan düşülmez.' };

  var tutar = Math.round(sayi_(d.tutar) * 100) / 100;
  if (!(tutar > 0)) return { hata: 'Geçerli bir tutar yazın.' };
  if (tutar > 5000000) return { hata: 'Tutar çok yüksek görünüyor; kontrol edin.' };

  var m = String(d.tarih || '').match(/^(\d{4})-(\d{2})-(\d{2})$/) || null, g, a, y;
  if (m) { y = +m[1]; a = +m[2]; g = +m[3]; }
  else { m = String(d.tarih || '').match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/); if (!m) return { hata: 'Tarih GG.AA.YYYY biçiminde olmalı.' }; g = +m[1]; a = +m[2]; y = +m[3]; }
  var tarih = new Date(y, a - 1, g, 12, 0, 0);
  if (tarih.getMonth() !== a - 1 || tarih.getDate() !== g) return { hata: 'Geçersiz tarih.' };
  var gun = (tarih.getTime() - Date.now()) / 86400000;
  if (gun > 1) return { hata: 'İleri tarihli ödeme girilemez.' };
  if (gun < -400) return { hata: 'Bir yıldan eski ödeme panelden girilemez; tabloya elle yazın.' };
  var tarihYazi = Utilities.formatDate(tarih, TZ, 'dd.MM.yyyy');

  var yontem = String(d.yontem || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!yontem) return { hata: 'Ödeme yöntemini seçin.' };
  var aciklama = String(d.aciklama || '').replace(/\s+/g, ' ').trim().slice(0, 300);

  var sh = ss.getSheetByName('Odemeler');
  if (!sh) {
    sh = ss.insertSheet('Odemeler');
    sh.appendRow(['Tarih', 'Tedarikçi', 'Tutar', 'Yöntem', 'Açıklama', 'Kayıt_Zamanı', 'Kaynak']);
    sh.setFrozenRows(1);
  }
  var lc = Math.max(1, sh.getLastColumn()), b = sh.getRange(1, 1, 1, lc).getValues()[0].map(String);
  var c = {}; Object.keys(ODEME_SUTUN).forEach(function (k) { c[k] = kolon_(b, ODEME_SUTUN[k]); });
  if (c.tarih < 0 || c.tedarikci < 0 || c.tutar < 0) return { hata: "Odemeler sekmesinde Tarih, Tedarikçi ve Tutar başlıkları bulunamadı." };
  // Eksik yardımcı sütunları sona ekle (Yöntem, Açıklama, kayıt izi), mevcut sütunların yerini değiştirmez.
  [['yontem', 'Yöntem'], ['aciklama', 'Açıklama'], ['kayit', 'Kayıt_Zamanı'], ['kaynak', 'Kaynak']].forEach(function (x) {
    if (c[x[0]] < 0) { lc++; sh.getRange(1, lc).setValue(x[1]); c[x[0]] = lc - 1; b.push(x[1]); }
  });

  // Aynı gün, aynı toptancı, aynı tutar zaten varsa önce sor.
  if (d.onay !== '1' && sh.getLastRow() >= 2) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, lc).getValues(), tz = zaman_(tarih);
    for (var i = v.length - 1; i >= 0; i--) {
      if (norm_(v[i][c.tedarikci]) === aranan && Math.abs(sayi_(v[i][c.tutar]) - tutar) < 0.01 && zaman_(v[i][c.tarih]) !== null
          && new Date(zaman_(v[i][c.tarih])).toISOString().slice(0, 10) === new Date(tz).toISOString().slice(0, 10)) {
        return { tekrarMi: true, hata: tarihYazi + ' tarihinde ' + ad + ' için aynı tutarda bir ödeme zaten var. Yine de eklemek istiyorsan onayla.' };
      }
    }
  }

  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss');
  var satir = []; for (var j = 0; j < lc; j++) satir.push('');
  satir[c.tarih] = tarih; satir[c.tedarikci] = ad; satir[c.tutar] = tutar; satir[c.yontem] = yontem;
  satir[c.aciklama] = aciklama; satir[c.kayit] = damga; satir[c.kaynak] = 'Panel';
  // Eski ödeme sayfasının kimlik biçimi: O + yyMMddHHmmss + 2 hane (ör. O26092213141974).
  if (c.id >= 0) satir[c.id] = 'O' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + ('0' + Math.floor(Math.random() * 100)).slice(-2);
  var no = sh.getLastRow() + 1;
  sh.getRange(no, 1, 1, lc).setValues([satir]);
  sh.getRange(no, c.tarih + 1).setNumberFormat('dd.mm.yyyy');
  sh.getRange(no, c.tutar + 1).setNumberFormat('#,##0.00');
  var sonuc = { tamam: true, satir: no, ad: ad, tutar: tutar, tarih: tarihYazi, yontem: yontem };
  if (istek) cache.put('odeme_' + istek, JSON.stringify(sonuc), 600);

  var ozet = ad + ' — ' + tutar.toLocaleString('tr-TR') + ' TL (' + yontem + ')' + (aciklama ? ', ' + aciklama : '');
  // Satır yazıldı; kayıt defterine düşülemese bile ödeme kaydedilmiş sayılır (tekrar gönderilip çift yazılmasın).
  try { cevapKaydet_('Finans', 'Kolaybi Fatura Ham Veri › Odemeler', no, 'Toptancı ödemesi ' + tarihYazi, ozet, damga.slice(0, 16)); } catch (err) { }
  return sonuc;
}

// Tüm panel cevaplarının ortak kaydı. İlk cevapta dosya kendiliğinden oluşturulur.
function cevapKaydet_(bolum, kaynak, satir, konu, cevap, damga) {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('CEVAP_DOSYASI'), ss;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('BAP Panel Cevapları');
    var s0 = ss.getSheets()[0]; s0.setName('Cevaplar');
    s0.appendRow(['Zaman', 'Bölüm', 'Kaynak dosya', 'Satır', 'Konu', 'Sahibin cevabı', 'Durum', 'İşleyen ajan', 'İşlenme zamanı']);
    s0.setFrozenRows(1);
    p.setProperty('CEVAP_DOSYASI', ss.getId());
  }
  ss.getSheetByName('Cevaplar').appendRow([damga, bolum, kaynak, satir, konu, cevap, 'Yeni', '', '']);
}

/* ---------------- Yardımcılar ---------------- */

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function norm_(s) {
  return String(s == null ? '' : s).replace(/İ/g, 'i').toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

function kolon_(baslik, adaylar) {
  var n = baslik.map(norm_), i, j, a;
  for (i = 0; i < adaylar.length; i++) { j = n.indexOf(norm_(adaylar[i])); if (j >= 0) return j; }
  for (i = 0; i < adaylar.length; i++) { a = norm_(adaylar[i]); for (j = 0; j < n.length; j++) if (n[j] && n[j].indexOf(a) === 0) return j; }
  return -1;
}

function tablo_(ss, ad) {
  var sh = ss.getSheetByName(ad);
  if (!sh || sh.getLastRow() < 2) return { baslik: [], satirlar: [], idx: {} };
  var v = sh.getDataRange().getDisplayValues(), idx = {};
  v[0].forEach(function (h, i) { idx[String(h).trim().toUpperCase()] = i; });
  return { baslik: v[0], satirlar: v.slice(1), idx: idx };
}
function al_(t, r, ad) { var i = t.idx[ad]; return i === undefined ? '' : r[i]; }
function testMi_(id) { return /TEST/i.test(String(id || '')); }

function sayi_(v) {
  if (typeof v === 'number') return v;
  var s = String(v || '').replace(/[^\d,.\-]/g, '');
  if (!s) return 0;
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 861.265 → 861265 (binlik nokta)
  else if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.indexOf(',') >= 0) s = s.replace(',', '.');
  var x = parseFloat(s); return isNaN(x) ? 0 : x;
}

// İstanbul saatiyle yazılmış zamanı saat diliminden bağımsız milisaniyeye çevirir (karşılaştırma için).
function zaman_(v) {
  var s = (v instanceof Date) ? Utilities.formatDate(v, TZ, 'dd.MM.yyyy HH:mm:ss') : String(v || '').trim();
  var m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return null;
}
function simdi_() { return zaman_(new Date()); }

// İş günü 10:00 – ertesi gün 03:00: gece 00:00-03:00 arası bir önceki güne yazılır.
function isGunu_(ms) { return new Date(ms - 3 * 3600000).toISOString().slice(0, 10); }
function gunEkle_(gun, k) { return new Date(Date.parse(gun + 'T00:00:00Z') + k * 86400000).toISOString().slice(0, 10); }

function z_() { return { ciro: 0, adet: 0 }; }
function ek_(o, t) { o.ciro += t; o.adet++; }
function topla_(o, k, t) { k = String(k || '').trim() || 'Belirtilmemiş'; o[k] = (o[k] || 0) + t; }
function sirala_(o) {
  return Object.keys(o).map(function (k) { return { ad: k, deger: Math.round(o[k] * 100) / 100 }; })
    .sort(function (a, b) { return b.deger - a.deger; });
}

// Marka adından şube kısmını atar: "BAP Pizza Erenköy" → "BAP Pizza". Yalnız "BAP Erenköy" yazanlar Adisyo'dan girilen siparişlerdir.
function markaKok_(s) {
  var t = String(s || '').replace(/erenk[öo]y|fikirtepe/ig, '').replace(/\s{2,}/g, ' ').trim();
  if (!t) return 'Belirtilmemiş';
  if (norm_(t) === 'bap') return "BAP (Adisyo'dan girilen)";
  return t;
}

function mahEkle_(o, bos, donem, ad, tutar) {
  if (!ad) { bos[donem]++; return; }
  var x = o[ad] = o[ad] || { ciro: 0, adet: 0 }; x.ciro += tutar; x.adet++;
}
function mahSirala_(o) {
  return Object.keys(o).map(function (k) { return { ad: k, ciro: Math.round(o[k].ciro), adet: o[k].adet }; })
    .sort(function (a, b) { return b.adet - a.adet || b.ciro - a.ciro; }).slice(0, 30);
}

// Şube adlarını tek biçime getirir: "Erenköy", "BAP Erenköy", "erenkoy" → "BAP Erenköy".
function subeAnahtar_(s) {
  var n = norm_(s); if (!n) return '';
  if (n.indexOf('erenkoy') >= 0) return 'BAP Erenköy';
  if (n.indexOf('fikirtepe') >= 0) return 'BAP Fikirtepe';
  return String(s).trim();
}

function depEsle_(ad) {
  var n = norm_(ad); if (!n) return null;
  for (var i = 0; i < DEPARTMANLAR.length; i++) { var d = norm_(DEPARTMANLAR[i]); if (n === d || n.indexOf(d) === 0 || d.indexOf(n) === 0) return DEPARTMANLAR[i]; }
  return null;
}

// Sahibe gösterilen metinden iş kodlarını temizler (ör. "TS-G12", "MI-C6").
function kodsuz_(s) {
  return String(s || '').replace(/\b(?:MI|OP|IK|FN|SG|SM|TS|IG|GM)-[A-Z]{0,4}\d+[a-z]?\b/g, '')
    .replace(/\(\s*[,;]?\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}