/**
 * BAP Yönetim Paneli — Veri Kapısı (Google Apps Script)
 *
 * Ne yapar: Panel verisini tablolardan OKUR ve özet olarak panele verir.
 * Yazma: Yalnızca sahibin panelden verdiği cevabı yazar (doPost): ilgili sorunun Cevap hücresine ekler ve
 *        'BAP Panel Cevapları' tablosuna kayıt düşer. Toptancı ödemesi girilince 'Kolaybi Fatura Ham Veri › Odemeler'
 *        sekmesinin sonuna yeni satır ekler. Puantaj düzeltmesinde yalnız o günün satırındaki giriş/çıkış, toplam,
 *        fazla mesai, açıklama ve Manuel hücrelerini günceller (Ham Giriş/Çıkış değişmez). Hiçbir şey silmez.
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
    kaynaklar: [], satis: null, nabiz: null, isKaydi: null, hub: null, finans: null, personel: null, genel: null, hatalar: []
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