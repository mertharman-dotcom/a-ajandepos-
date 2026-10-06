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
 *        hücresi yazılır (yalnız boş olan ya da sahibin onayladığı); önceki değer 'Kurye Eşleştirme' sekmesine düşer.
 *        Panelden girilen vardiya 'Personel › Vardiya' sekmesinde o kişinin o haftaki satırına yazılır (yoksa sona eklenir).
 *        Günlük fiş kaydedilince 'BAP Günlük Fiş Kaydı' tablosuna o gün için tek satır yazılır (onayla güncellenir);
 *        'BAP veri tablosu › Kesilen Fişler' yalnız okunur.
 *        Başka hiçbir hücreyi değiştirmez, hiçbir şey silmez.
 * Gizlilik: Müşteri adı, telefonu, adresi ve personel kişisel bilgisi panel paketine girmez; yalnız toplamlar döner.
 *           İstisna: açık hesap satırına tıklanınca o tek siparişin müşteri bilgisi ayrı istekle (tur 'musteri') verilir.
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
  yorum:    { id: '1KLWCEBwFMHCTrTnCYLhv2ctg5PvGtS9DNzoMXF-Z1JE', ad: 'Trendyol yorumları',      bolum: 'musteri',  beklenenDk: 1440 },
  yemekKarti: { id: '19RVXZQwKZRCW6xnZxSwhRHXte4VWhaVqruaTZRwVJbM', ad: 'Yemek kartı tahsilatları', bolum: 'yemekkart', beklenenDk: 180 }
};

var DEPARTMANLAR = ['Müşteri İlişkileri', 'Operasyon', 'Finans', 'Satış & Gelir', 'Teknoloji & Sistemler',
                    'İnsan Kaynakları', 'Strateji & İş Geliştirme', 'Sosyal Medya'];

/* ---------------- Web uygulaması girişi ---------------- */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var anahtar = PropertiesService.getScriptProperties().getProperty('PANEL_KEY');
  if (!anahtar || p.key !== anahtar) return json_({ hata: 'yetkisiz' });

  var cache = CacheService.getScriptCache();
  if (p.tur === 'tuketim') return tuketimCevap_(p, cache);
  if (!p.fresh) {
    var c = onbellekOku_(cache);
    if (c) return ContentService.createTextOutput(c).setMimeType(ContentService.MimeType.JSON);
  }
  var metin = JSON.stringify(paketHazirla_());
  onbellekYaz_(cache, metin); // 6 saat, sıkıştırılmış; panel açılışta bunu gösterip arkadan ?fresh=1 ister
  return ContentService.createTextOutput(metin).setMimeType(ContentService.MimeType.JSON);
}


// Satış maliyeti ekranı: istenen tarih aralığının malzeme tüketimi (2 dakika önbellek).
function tuketimCevap_(p, cache) {
  var bas = String(p.bas || ''), bit = String(p.bit || ''), gun = /^\d{4}-\d{2}-\d{2}$/;
  if (!gun.test(bas) || !gun.test(bit) || bas > bit) return json_({ hata: 'Tarih aralığı geçersiz.' });
  if ((Date.parse(bit) - Date.parse(bas)) / 86400000 > 92) return json_({ hata: 'En fazla 3 aylık aralık seçilebilir.' });
  var on = 'tuk_' + bas + '_' + bit + '_';
  if (!p.fresh) { var c = onbellekOku_(cache, on); if (c) return ContentService.createTextOutput(c).setMimeType(ContentService.MimeType.JSON); }
  var metin;
  try { metin = JSON.stringify(tuketim_(bas, bit)); }
  catch (err) { return json_({ hata: String((err && err.message) || err) }); }
  onbellekYaz_(cache, metin, on, 120);
  return ContentService.createTextOutput(metin).setMimeType(ContentService.MimeType.JSON);
}

// Önbellek anahtar başına 100 KB sınırlı; büyük paket parçalara bölünür.
// Önbellek: paket gzip + base64 ile sıkıştırılıp 90 KB'lık parçalara bölünür (anahtar başına 100 KB sınırı).
// Eskiden sıkıştırma yoktu ve 9 parçadan (≈810 KB) büyük paket hiç önbelleğe yazılmıyordu; her açılış baştan hesaplanıyordu.
var ONBELLEK_SURE = 21600; // 6 saat (CacheService üst sınırı); panel açılışta bunu gösterir, arkadan tazesini ister
function onbellekYaz_(cache, metin, on, sure) {
  on = on || 'panel_v2_';
  var z = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(metin, 'application/json')).getBytes());
  var n = Math.ceil(z.length / 90000), o = {};
  if (n > 80) return;
  for (var i = 0; i < n; i++) o[on + i] = z.substr(i * 90000, 90000);
  o[on + 'n'] = String(n);
  try { cache.putAll(o, sure || ONBELLEK_SURE); } catch (err) { }
}
function onbellekOku_(cache, on) {
  on = on || 'panel_v2_';
  var n = +cache.get(on + 'n'); if (!n) return null;
  var keys = []; for (var i = 0; i < n; i++) keys.push(on + i);
  var o = cache.getAll(keys), s = '';
  for (i = 0; i < n; i++) { if (o[keys[i]] == null) return null; s += o[keys[i]]; }
  try { return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(s), 'application/x-gzip')).getDataAsString(); } catch (err) { return null; }
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

// Satış maliyeti ekranını yayınlamadan önce çalıştırın: bugünün malzeme tüketimini günlüğe yazar.
function testTuketim() {
  var bugun = isGunu_(simdi_()), v = tuketim_(bugun, bugun);
  Logger.log('Okunan tanımlar: ' + JSON.stringify(v.tanimlar));
  v.subeler.forEach(function (s) { Logger.log(s + ': ' + JSON.stringify(v.ozet[s])); });
  v.malzemeler.filter(function (m) { return Object.keys(m.kullanim).length; })
    .sort(function (a, b) { var t = function (m) { return Object.keys(m.kullanim).reduce(function (x, s) { return x + m.kullanim[s][1]; }, 0); }; return t(b) - t(a); })
    .slice(0, 15).forEach(function (m) { Logger.log(m.tur + ' · ' + m.ad + ' · ' + JSON.stringify(m.kullanim) + ' ' + m.birim + ' · stok ' + JSON.stringify(m.stok)); });
  Logger.log('Reçetesi bulunamayan: ' + JSON.stringify(v.eslesmeyen.slice(0, 10)));
  Logger.log('Tanımı / fiyatı eksik: ' + JSON.stringify(v.eksikTanim.slice(0, 10)));
}

/* ---------------- Paket ---------------- */

function paketHazirla_() {
  var simdi = new Date();
  var out = {
    surum: 1,
    olusturma: Utilities.formatDate(simdi, TZ, "yyyy-MM-dd'T'HH:mm:ss"),
    kaynaklar: [], satis: null, nabiz: null, isKaydi: null, hub: null, finans: null, personel: null, kurye: null, genel: null, fisKayit: null, musteri: null, yemekKarti: null, pluxeeFatura: null, ykKontrol: null, setcardFatura: null, hatalar: []
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
  bolum_(out, 'fisKayit', fisKayit_);
  bolum_(out, 'musteri', musteri_);
  bolum_(out, 'yemekKarti', yemekKarti_);
  bolum_(out, 'pluxeeFatura', pluxeeFatura_);
  bolum_(out, 'ykKontrol', ykKontrol_);
  bolum_(out, 'setcardFatura', setcardFatura_);
  return out;
}

function bolum_(out, ad, fn) {
  var t0 = Date.now();
  try { out[ad] = fn(); }
  catch (err) { out.hatalar.push({ bolum: ad, mesaj: String((err && err.message) || err) }); }
  (out.sureler = out.sureler || {})[ad] = Date.now() - t0; // ms; yavaş bölümü bulmak için
}

// Elle çalıştırın: her bölümün kaç saniyede okunduğunu ve paketin boyutunu Yürütme günlüğüne yazar.
function hizTesti() {
  var t0 = Date.now(), v = paketHazirla_(), metin = JSON.stringify(v);
  Logger.log('Toplam: ' + ((Date.now() - t0) / 1000).toFixed(1) + ' sn · paket ' + Math.round(metin.length / 1024) + ' KB');
  Object.keys(v.sureler || {}).sort(function (a, b) { return v.sureler[b] - v.sureler[a]; })
    .forEach(function (k) { Logger.log(k + ': ' + (v.sureler[k] / 1000).toFixed(1) + ' sn'); });
  onbellekYaz_(CacheService.getScriptCache(), metin);
}

/* ---------------- Satış ---------------- */

// Sipariş tablosu sondan okunur. enEski (yyyy-MM-dd) verilirse o güne ulaşana kadar geriye doğru parça parça okunur.
function siparisVerisi_(enEski) {
  var sh = SpreadsheetApp.openById(KAYNAK.siparis.id).getSheetByName('Satıs Verileri');
  if (!sh) throw new Error("Sipariş dosyasında 'Satıs Verileri' sekmesi bulunamadı");
  var son = sh.getLastRow(), gen = sh.getLastColumn();
  var b = sh.getRange(1, 1, 1, gen).getValues()[0];
  var c = {
    tarih: kolon_(b, ['Sipariş Tarihi']), sube: kolon_(b, ['Şube']), kanal: kolon_(b, ['Sipariş Kanalı']),
    marka: kolon_(b, ['Marka']), tutar: kolon_(b, ['Toplam Tutar']), durum: kolon_(b, ['Durum']),
    tip: kolon_(b, ['Sipariş Tipi', 'Masa Siparişi']), cikan: kolon_(b, ['Ürün Çıkan Şube']), id: kolon_(b, ['Sipariş ID']), mahalle: kolon_(b, ['Mahalle']),
    urunler: kolon_(b, ['Ürünler']), adetler: kolon_(b, ['Ürün Adetleri']), fiyatlar: kolon_(b, ['Ürün Fiyatları']), kategoriler: kolon_(b, ['Ürün Kategorileri']),
    odeme: kolon_(b, ['Ödeme Yöntemi']), tahsil: kolon_(b, ['Tahsil Tipi'])
  };
  if (c.tarih < 0 || c.tutar < 0 || c.durum < 0) throw new Error('Sipariş tablosunda tarih, tutar ya da durum sütunu bulunamadı');
  var rows = [], alt = son, ilkGun = null;
  while (alt > 1) {
    var n = Math.min(5000, alt - 1), ust = alt - n + 1, v = sh.getRange(ust, 1, n, gen).getValues();
    rows = v.concat(rows); alt = ust - 1;
    for (var i = 0; i < v.length; i++) { var ms = zaman_(v[i][c.tarih]); if (ms !== null) { ilkGun = isGunu_(ms); break; } }
    if (!enEski || (ilkGun && ilkGun < enEski) || rows.length >= 60000) break;
  }
  return { c: c, rows: rows, ilkGun: ilkGun, hepsi: alt <= 1 };
}

function satis_() {
  // Fiş farkı 'Geçen ay' filtresi için önceki ayın 1'ine kadar okunur (normalde son 5000 satır yeter, ay başında biraz fazlası).
  var simdi = simdi_();
  var bugun = isGunu_(simdi);
  var gecenAyBasi = new Date(Date.UTC(+bugun.slice(0, 4), +bugun.slice(5, 7) - 2, 1)).toISOString().slice(0, 10);
  var sv = siparisVerisi_(gecenAyBasi), c = sv.c, rows = sv.rows;
  if (!rows.length) return null;

  var dun = gunEkle_(bugun, -1);
  var gecenHafta = gunEkle_(bugun, -7);
  var dow = (new Date(bugun + 'T00:00:00Z').getUTCDay() + 6) % 7; // Pazartesi = 0
  var haftaBasi = gunEkle_(bugun, -dow);
  var ilkSeri = gunEkle_(bugun, -13);

  var seri = {}; for (var i = 0; i < 14; i++) seri[gunEkle_(ilkSeri, i)] = { ciro: 0, adet: 0 };
  // Fiş hesabı önceki ayın 1'inden bugüne gider (Son 30 gün, Bu ay, Geçen ay filtreleri için).
  var fis = {}; for (var fg = gecenAyBasi; fg <= bugun; fg = gunEkle_(fg, 1)) fis[fg] = fisBos_();
  // İşletme Özeti filtreleri (Bugün … Geçen ay) için gün gün özet; panel seçilen aralığı toplar.
  var gunluk = {}; Object.keys(fis).forEach(function (k) { gunluk[k] = gunlukBos_(); });
  var sozluk = { urun: [], urunNo: {}, mah: [], mahNo: {} };
  var g = { bugun: z_(), dun: z_(), hafta: z_(), gecenHaftaAyniSaat: z_() };
  var acik = z_(), iptalBugun = 0, sonSiparis = null;
  var kanalBugun = {}, subeBugun = {}, markaBugun = {}, kanalHafta = {}, mutfakBugun = {};
  var yediBasi = gunEkle_(bugun, -6), otuzBasi = gunEkle_(bugun, -29);
  var markaDetay = {}, mah = { bugun: {}, hafta: {}, otuz: {} }, mahBos = { bugun: 0, hafta: 0, otuz: 0 };
  var cikan = { bugunDolu: 0, bugunToplam: 0, yediDolu: 0, yediToplam: 0, baskaSubedenBugun: 0, sonEksik: [] };
  var ykSatis = {}; // gün -> kart -> {t, a}: POS'tan geçen yemek kartı (online platform yemek kartı hariç), mutabakat için

  rows.forEach(function (r) {
    var ms = zaman_(r[c.tarih]); if (ms === null) return;
    var gun = isGunu_(ms);
    var d = norm_(r[c.durum]);
    var tutar = sayi_(r[c.tutar]);
    if (sonSiparis === null || ms > sonSiparis) sonSiparis = ms;
    if (d.indexOf('iptal') >= 0 || d.indexOf('iade') >= 0 || d.indexOf('red') === 0) { if (gun === bugun) iptalBugun++; if (gunluk[gun]) gunluk[gun].ip++; return; }
    if (d !== 'kapali') { if (gun === bugun) { acik.ciro += tutar; acik.adet++; } return; }

    if (seri[gun]) { seri[gun].ciro += tutar; seri[gun].adet++; }
    if (fis[gun]) fisEkle_(fis[gun], c.kanal >= 0 ? r[c.kanal] : '', c.tip >= 0 ? r[c.tip] : '', c.odeme >= 0 ? r[c.odeme] : '', c.tahsil >= 0 ? r[c.tahsil] : '', tutar);
    if (gun >= otuzBasi && c.odeme >= 0 && fisOdeme_(r[c.odeme], c.tahsil >= 0 ? r[c.tahsil] : '') === 'yemek') {
      var kart = yemekKartAdi_(r[c.odeme]), yg = ykSatis[gun] = ykSatis[gun] || {}, yk = yg[kart] = yg[kart] || { t: 0, a: 0 };
      yk.t += tutar; yk.a++;
    }
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
    if (gunluk[gun]) gunlukEkle_(gunluk[gun], sozluk, r, c, tutar, kanal, gelen, mutfak, mh);
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
    seri: Object.keys(seri).sort().map(function (k) { return { gun: k, ciro: Math.round(seri[k].ciro), adet: seri[k].adet }; }),
    yemekKartSatis: ykSatis,
    fis: { sutunVar: c.odeme >= 0 || c.tahsil >= 0, gunler: Object.keys(fis).sort().reverse().map(function (k) { return fisGunu_(k, fis[k]); }) },
    gunluk: { urunler: sozluk.urun, mahalleler: sozluk.mah, urunSutunu: c.urunler >= 0,
              gunler: Object.keys(gunluk).sort().map(function (k) { return gunlukYaz_(k, gunluk[k]); }) }
  };
}

/* ---------------- İşletme Özeti: gün gün özet ----------------
 * Her gün için: ciro, sipariş, iptal; kanal / gelen şube / mutfak / marka (şube kırılımlı) / mahalle / ürün.
 * Ürün ve mahalle adları sözlükte bir kez yazılır, günlerde numarayla geçer (paket küçük kalsın).
 * Ürün cirosu liste fiyatıyla (adet × birim fiyat) hesaplanır; indirimler sipariş toplamında kalır.
 */
function gunlukBos_() { return { c: 0, a: 0, ip: 0, k: {}, s: {}, m: {}, b: {}, h: {}, hb: 0, u: {} }; }
function ikiliEkle_(o, k, tutar) { k = String(k || '').trim() || 'Belirtilmemiş'; var x = o[k] = o[k] || [0, 0]; x[0] += tutar; x[1]++; }
function sozlukNo_(liste, no, ad) { if (!(ad in no)) { no[ad] = liste.length; liste.push(ad); } return no[ad]; }

function gunlukEkle_(G, S, r, c, tutar, kanal, gelen, mutfak, mh) {
  G.c += tutar; G.a++;
  ikiliEkle_(G.k, kanal, tutar);
  ikiliEkle_(G.s, gelen, tutar);
  ikiliEkle_(G.m, mutfak || gelen, tutar);
  var mk = markaKok_(c.marka >= 0 ? r[c.marka] : ''), b = G.b[mk] = G.b[mk] || { c: 0, a: 0, s: {} };
  b.c += tutar; b.a++; ikiliEkle_(b.s, gelen, tutar);
  if (mh) ikiliEkle_(G.h, sozlukNo_(S.mah, S.mahNo, mh), tutar); else G.hb++;
  if (c.urunler < 0) return;
  var ad = parca_(r[c.urunler]), adet = c.adetler >= 0 ? parca_(r[c.adetler]) : [], fiyat = c.fiyatlar >= 0 ? parca_(r[c.fiyatlar]) : [],
      kat = c.kategoriler >= 0 ? parca_(r[c.kategoriler]) : [];
  for (var i = 0; i < ad.length; i++) {
    if (!ad[i]) continue;
    var n = sayi_(adet[i]) || 1, no = sozlukNo_(S.urun, S.urunNo, (kat[i] || 'Diğer') + '|' + ad[i]);
    var x = G.u[no] = G.u[no] || [0, 0]; x[0] += n; x[1] += n * sayi_(fiyat[i]);
  }
}

function gunlukYaz_(gun, G) {
  var yuv = function (o) { var y = {}; Object.keys(o).forEach(function (k) { y[k] = [Math.round(o[k][0]), o[k][1]]; }); return y; };
  var b = {}; Object.keys(G.b).forEach(function (k) { b[k] = { c: Math.round(G.b[k].c), a: G.b[k].a, s: yuv(G.b[k].s) }; });
  var u = {}; Object.keys(G.u).forEach(function (k) { u[k] = [G.u[k][0], Math.round(G.u[k][1])]; });
  return { gun: gun, c: Math.round(G.c), a: G.a, ip: G.ip, k: yuv(G.k), s: yuv(G.s), m: yuv(G.m), b: b, h: yuv(G.h), hb: G.hb, u: u };
}

/* ---------------- Günlük fiş hesabı ----------------
 * Yemeksepeti ve Trendyol'un online ödenen siparişleri için gün sonunda fiş kesilir. Yazarkasa POS'tan geçen kart ödemeleri
 * zaten fiş ürettiği için düşülür (iki şubenin toplamı, şube ayrımı yok):
 *   Kesilecek fiş = (1) YS + Trendyol online
 *                 − (2) Masa / gel-al siparişlerinde kredi kartı + yemek kartı
 *                 − (3) WhatsApp / telefon (Adisyo paket) siparişlerinde kredi kartı + yemek kartı
 *                 − (4) YS + Trendyol kapıda ödemelerde kredi kartına dönen tutar
 * Yalnız kapanmış siparişler sayılır.
 */
var FIS_KALEMLER = ['online', 'masa', 'paket', 'platformKk'];

// Getir vb. diğer platformlar hesaba girmez; yalnız Yemeksepeti ve Trendyol.
function fisPlatform_(kanal) {
  var n = norm_(kanal);
  if (n.indexOf('yemeksepeti') >= 0 || n === 'ys' || n.indexOf('deliveryhero') >= 0) return 'Yemeksepeti';
  if (n.indexOf('trendyol') >= 0) return 'Trendyol';
  if (!n || /adisyo|whatsapp|telefon|gelal|masa|santral|paket/.test(n)) return 'ic';
  return 'diger';
}

// online | onlineKart | kredi | yemek | nakit | yok | diger. Önce ödeme yönteminin adına (daha ayrıntılı), sonra tahsil tipine bakılır.
// Fiş yalnız 'YS Online', 'Trendyol Online' ve 'İyzico Online' için kesilir. Platformda online ödenen yemek kartları
// (Edenred / Multinet / Pluxee / Setcard Online) ayrı tutulur, hesaba girmez.
// 'Ödenmez' ve 'Açık Hesap' POS'tan geçmediği için tahsil tipi 'Yemek Kartı' yazsa da düşülmez.
function fisOdeme_(odeme, tahsil) {
  var o = norm_(odeme), t = norm_(tahsil);
  if (/^ysonline|^yemeksepetionline|^trendyolonline|iyzico/.test(o)) return 'online';
  if (/online/.test(o)) return 'onlineKart';
  if (/odenmez|odenemez|acikhesap/.test(o)) return 'yok';
  if (t === 'online') return 'online';
  if (/kredi|bankakart|^pos|kartpos/.test(o)) return 'kredi';
  if (/paye|setcard|smartticket|metropol|multinet|edenred|tokenflex|sodexo|pluxee|ticket|yemekkart/.test(o)) return 'yemek';
  if (/nakit/.test(o)) return 'nakit';
  if (/kredi/.test(t)) return 'kredi';
  if (/yemek/.test(t)) return 'yemek';
  if (/nakit/.test(t)) return 'nakit';
  return 'diger';
}

// Adisyo ödeme yönteminden kart markası (mutabakat sütunu)
function yemekKartAdi_(odeme) {
  var o = norm_(odeme);
  if (/pluxee|sodexo/.test(o)) return 'Pluxee';
  if (/edenred|ticket/.test(o)) return 'Edenred';
  if (/paye/.test(o)) return 'Paye';
  if (/multinet/.test(o)) return 'Multinet';
  if (/setcard/.test(o)) return 'Setcard';
  if (/metropol/.test(o)) return 'Metropol';
  if (/tokenflex/.test(o)) return 'Tokenflex';
  return 'Diğer';
}

/* ---------------- Yemek kartı terminal çekimleri (BAP Yemek Kartı Tahsilatları) ----------------
 * Gün = iş günü (10:00 – ertesi 03:00). Pluxee / Edenred işlem zamanından, Paye raporun günü (mail konusu) üzerinden.
 * Çıktı: { gunler: { 'yyyy-mm-dd': { Pluxee: {t, a}, Edenred: {...}, Paye: {...} } }, son: { Pluxee: 'yyyy-mm-dd', ... } }
 */
function yemekKarti_() {
  var ss = SpreadsheetApp.openById(KAYNAK.yemekKarti.id), bas = gunEkle_(isGunu_(simdi_()), -29);
  var out = { gunler: {}, son: {} };
  function ekle(kart, gun, tutar) {
    if (!gun || gun < bas || !(tutar > 0)) return;
    var g = out.gunler[gun] = out.gunler[gun] || {}, x = g[kart] = g[kart] || { t: 0, a: 0 };
    x.t += tutar; x.a++;
    if (!out.son[kart] || gun > out.son[kart]) out.son[kart] = gun;
  }
  function zaman(v) {   // Date, 'dd.MM.yyyy HH:mm' ya da '1 Eyl 2026 13:17'
    var ms = zaman_(v);
    // saati kaybolmuş tarih (tam 00:00:00) iş günü kaymasın: öğlene al
    if (ms !== null) return (v instanceof Date && !v.getHours() && !v.getMinutes() && !v.getSeconds()) ? ms + 12 * 3600000 : ms;
    var m = String(v || '').trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/); if (!m) return null;
    var ay = TR_AY[m[2].toLocaleLowerCase('tr-TR').slice(0, 3)]; if (ay === undefined) ay = TR_AY[norm_(m[2]).slice(0, 3)]; if (ay === undefined) return null;
    return Date.UTC(+m[3], ay, +m[1], +(m[4] || 12), +(m[5] || 0));
  }
  [['Pluxee', 'İşlem Zamanı', 'Tutar (TL)'], ['Edenred', 'İşlem Zamanı', 'Tutar (TL)']].forEach(function (k) {
    var t = satirlar_(ss, k[0]); if (!t.r.length) return;
    var cz = kolon_(t.b, [k[1]]), ct = kolon_(t.b, [k[2], 'Tutar']);
    t.r.forEach(function (r) { var ms = zaman(r[cz]); if (ms !== null) ekle(k[0], isGunu_(ms), sayi_(r[ct])); });
  });
  var p = satirlar_(ss, 'Paye');
  if (p.r.length) {
    var cg = kolon_(p.b, ['Rapor Günü']), ct = kolon_(p.b, ['Toplam Gün Sonu Tutarı', 'Tutar']);
    if (ct >= 0) p.r.forEach(function (r) { ekle('Paye', gunStr_(r[cg]), sayi_(r[ct])); });
  }
  return out;
}

function fisBos_() { return { online: z_(), masa: z_(), paket: z_(), platformKk: z_(), platformYk: z_(), onlineKart: z_(), bilinmeyen: {} }; }

function fisEkle_(s, kanal, tip, odeme, tahsil, tutar) {
  var p = fisPlatform_(kanal), od = fisOdeme_(odeme, tahsil);
  if (p === 'Yemeksepeti' || p === 'Trendyol') {
    if (od === 'online') ek_(s.online, tutar);
    else if (od === 'onlineKart') ek_(s.onlineKart, tutar); // bilgi için; hesaba girmez
    else if (od === 'kredi') ek_(s.platformKk, tutar);
    else if (od === 'yemek') ek_(s.platformYk, tutar); // bilgi için; hesaptan düşülmez
  } else if (p === 'ic') {
    if (od !== 'kredi' && od !== 'yemek') { if (od === 'diger' || od === 'yok') topla_(s.bilinmeyen, String(odeme || tahsil || 'Boş').trim(), tutar); return; }
    ek_(/paket/i.test(String(tip)) ? s.paket : s.masa, tutar);
  }
}

function fisGunu_(gun, s) {
  var o = { gun: gun };
  FIS_KALEMLER.concat(['platformYk', 'onlineKart']).forEach(function (k) { o[k] = { tutar: Math.round(s[k].ciro * 100) / 100, adet: s[k].adet }; });
  o.kesilecek = Math.round((s.online.ciro - s.masa.ciro - s.paket.ciro - s.platformKk.ciro) * 100) / 100;
  o.bilinmeyen = sirala_(s.bilinmeyen);
  return o;
}

// Kesilen fişlerin toplu kaydı: 'BAP Günlük Fiş Kaydı' tablosu (ilk kayıtta kendiliğinden oluşur), gün başına tek satır.
var FIS_BASLIK = ['İş Günü', 'YS + Trendyol online', 'Masa / gel-al kart', 'WhatsApp / telefon kart', 'YS + Trendyol kapıda kredi kartı',
                  'Kesilecek (hesap)', 'Fiş adedi', 'Kesilen tutar', 'Fark', 'Elle değişen', 'Not', 'Kayıt_Zamanı', 'Kaynak'];
// Panelden önce fişlerin tutulduğu sekme. Yalnız okunur, hiç yazılmaz; yeni tabloda olmayan günler geçmiş olarak gösterilir.
var ESKI_FIS = { id: '152FdGaQUhwyd0ytcTbM1OI6beNZsXBJhCM-GoG2Bzvw', sekme: 'Kesilen Fişler' };

function fisDosyasi_(olustur) {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('FIS_DOSYASI'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; } }
  if (!ss && olustur) {
    ss = SpreadsheetApp.create('BAP Günlük Fiş Kaydı');
    var sh = ss.getSheets()[0]; sh.setName('Fisler');
    sh.appendRow(FIS_BASLIK); sh.setFrozenRows(1);
    p.setProperty('FIS_DOSYASI', ss.getId());
  }
  return ss;
}

// "2026-07-18", "12.09.2026", "30,.09.2026" ya da tarih hücresi → "2026-09-30"
function fisGunOku_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var s = String(v || '').trim(), m = s.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return null;
}

function fisKayit_() {
  var ss = fisDosyasi_(false), gunler = {}, out = { link: ss ? ss.getUrl() : null, eskiLink: 'https://docs.google.com/spreadsheets/d/' + ESKI_FIS.id, kayitlar: [] };
  if (ss) {
    var sh = ss.getSheetByName('Fisler') || ss.getSheets()[0], v = sh.getDataRange().getValues(), b = v[0].map(String);
    var c = FIS_BASLIK.map(function (h) { return kolon_(b, [h]); });
    v.slice(1).forEach(function (r) {
      var gun = fisGunOku_(r[c[0]]); if (!gun) return;
      gunler[gun] = { gun: gun, online: sayi_(r[c[1]]), masa: sayi_(r[c[2]]), paket: sayi_(r[c[3]]), platformKk: sayi_(r[c[4]]), kesilecek: sayi_(r[c[5]]),
        adet: sayi_(r[c[6]]), kesilen: sayi_(r[c[7]]), elle: String(r[c[9]] || ''), not: String(r[c[10]] || ''), kaynak: 'panel',
        zaman: r[c[11]] instanceof Date ? Utilities.formatDate(r[c[11]], TZ, 'dd.MM.yyyy HH:mm') : String(r[c[11]] || '').slice(0, 16) };
    });
  }
  try {
    var es = SpreadsheetApp.openById(ESKI_FIS.id).getSheetByName(ESKI_FIS.sekme);
    if (es && es.getLastRow() >= 2) {
      var ev = es.getDataRange().getValues(), eb = ev[0].map(String);
      var eG = kolon_(eb, ['Gün']), eA = kolon_(eb, ['Adet']), eT = kolon_(eb, ['Tutar']), eZ = kolon_(eb, ['Kayıt Zamanı']);
      ev.slice(1).forEach(function (r) {
        var gun = fisGunOku_(r[eG]); if (!gun) return;
        var x = gunler[gun];
        if (x && x.kaynak === 'eski') { x.adet += sayi_(r[eA]); x.kesilen += sayi_(r[eT]); return; } // aynı güne ikinci parti
        if (x) return; // panelde kayıtlı gün öncelikli
        gunler[gun] = { gun: gun, adet: sayi_(r[eA]), kesilen: sayi_(r[eT]), kesilecek: null, kaynak: 'eski',
          zaman: r[eZ] instanceof Date ? Utilities.formatDate(r[eZ], TZ, 'dd.MM.yyyy HH:mm') : String(r[eZ] || '').slice(0, 16) };
      });
    }
  } catch (err) { out.eskiHata = 'Eski Kesilen Fişler sekmesi okunamadı.'; }
  out.kayitlar = Object.keys(gunler).sort().reverse().slice(0, 400).map(function (k) { return gunler[k]; });
  return out;
}

// Panel POST ile { key, tur: 'fis', istekNo, gun, online, masa, paket, platformKk, adet, kesilen, elle, not, onay } gönderir.
// Gün başına tek satır; o gün zaten kayıtlıysa onay ister, onaylanırsa o satırı günceller.
function fisKaydet_(d) {
  var cache = CacheService.getScriptCache(), istek = String(d.istekNo || '').slice(0, 64);
  var onceki = istek ? cache.get('fis_' + istek) : null;
  if (onceki) { try { var o = JSON.parse(onceki); o.zatenKayitli = true; return o; } catch (err) { return { tamam: true, zatenKayitli: true }; } }

  var m = String(d.gun || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { hata: 'İş günü seçilmedi.' };
  var tarih = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  if ((tarih.getTime() - Date.now()) / 86400000 > 1) return { hata: 'İleri tarihli fiş kaydedilemez.' };
  var n = {}; ['online', 'masa', 'paket', 'platformKk', 'kesilen', 'adet'].forEach(function (k) { n[k] = Math.round(sayi_(d[k]) * 100) / 100; });
  for (var k in n) if (n[k] < 0 || n[k] > 5000000) return { hata: 'Tutarlardan biri geçersiz görünüyor; kontrol edin.' };
  if (n.adet !== Math.round(n.adet) || n.adet > 500) return { hata: 'Fiş adedi tam sayı olmalı.' };
  var hesap = Math.round((n.online - n.masa - n.paket - n.platformKk) * 100) / 100;
  var elle = String(d.elle || '').replace(/[^a-zA-Z,]/g, '').slice(0, 60);
  var not = String(d.not || '').replace(/\s+/g, ' ').trim().slice(0, 300);

  var ss = fisDosyasi_(true), sh = ss.getSheetByName('Fisler') || ss.getSheets()[0];
  var lc = Math.max(FIS_BASLIK.length, sh.getLastColumn()), b = sh.getRange(1, 1, 1, lc).getValues()[0].map(String);
  var c = FIS_BASLIK.map(function (h) { return kolon_(b, [h]); });
  if (c.some(function (x) { return x < 0; })) return { hata: 'Fiş kaydı tablosunun başlıkları değişmiş; ilk satırı eski haline getirin.' };
  var tarihYazi = Utilities.formatDate(tarih, TZ, 'dd.MM.yyyy'), hedef = 0;
  if (sh.getLastRow() >= 2) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, lc).getValues();
    for (var i = 0; i < v.length; i++) if (fisGunOku_(v[i][c[0]]) === d.gun) { hedef = i + 2; break; }
  }
  if (hedef && d.onay !== '1') {
    return { tekrarMi: true, hata: tarihYazi + ' için fiş zaten kaydedilmiş (' + sayi_(sh.getRange(hedef, c[7] + 1).getValue()).toLocaleString('tr-TR') + ' TL). Üzerine yazmak istiyorsan onayla.' };
  }
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss');
  var satir = hedef ? sh.getRange(hedef, 1, 1, lc).getValues()[0] : (function () { var x = []; for (var j = 0; j < lc; j++) x.push(''); return x; })();
  satir[c[0]] = tarih; satir[c[1]] = n.online; satir[c[2]] = n.masa; satir[c[3]] = n.paket; satir[c[4]] = n.platformKk; satir[c[5]] = hesap;
  satir[c[6]] = n.adet; satir[c[7]] = n.kesilen; satir[c[8]] = Math.round((n.kesilen - Math.max(0, hesap)) * 100) / 100; satir[c[9]] = elle; satir[c[10]] = not;
  satir[c[11]] = damga; satir[c[12]] = hedef ? 'Panel (güncellendi)' : 'Panel';
  var no = hedef || sh.getLastRow() + 1;
  sh.getRange(no, 1, 1, lc).setValues([satir]);
  sh.getRange(no, c[0] + 1).setNumberFormat('dd.mm.yyyy');
  sh.getRange(no, c[1] + 1, 1, 5).setNumberFormat('#,##0.00');
  sh.getRange(no, c[7] + 1, 1, 2).setNumberFormat('#,##0.00');
  var sonuc = { tamam: true, satir: no, gun: d.gun, adet: n.adet, kesilen: n.kesilen, hesap: hesap, guncellendi: !!hedef };
  if (istek) cache.put('fis_' + istek, JSON.stringify(sonuc), 600);
  try { cevapKaydet_('Finans', 'BAP Günlük Fiş Kaydı › Fisler', no, 'Günlük fiş ' + tarihYazi, n.adet + ' fiş, ' + n.kesilen.toLocaleString('tr-TR') + ' TL' + (not ? ', ' + not : ''), damga.slice(0, 16)); } catch (err) { }
  return sonuc;
}


/* ---------------- Malzeme tüketimi (satıştan, ürünün çıktığı şubeye göre) ----------------
 * Kapanan siparişlerdeki her ürün Stok Takip dosyasındaki reçetesine açılır ve malzeme malzeme toplanır:
 *   hammadde  : reçetede doğrudan kullanılan hammaddeler (Tbl_Hammaddeler; miktar stok biriminde, fiyat son alış / paket içeriği)
 *   yariMamul : reçetedeki yarı mamuller (gr ya da adet; fiyat parti reçetesi / parti çıktısı)
 *   direkt    : olduğu gibi satılanlar, ör. içecekler (Direktsatisurunler; koli fiyatı / koli içeriği)
 *   ambalaj   : yalnız paket siparişlerde, Ambalaj_Kurallari'na göre (Ambalaj_Hammadde)
 * Tüketim siparişin 'Ürün Çıkan Şube'sine yazılır; boşsa geldiği şubeye. Yanına Sube_Stok'taki mevcut stok konur.
 * Panel istediği tarih aralığını ayrıca ister (doGet tur=tuketim). Tablolara hiçbir şey yazmaz.
 * Satış adı reçetedeki addan farklıysa stok dosyasına 'Maliyet_Eslestirme' sekmesi eklenebilir: A satış adı, B reçetedeki ürün adı.
 */
var MALIYET_ESLESTIRME_SEKME = 'Maliyet_Eslestirme';
var SIFIR_MALIYET = { su: 1, sicaksu: 1, iliksu: 1, buz: 1 };
var TUR_STOK_TIP = { hammadde: 'HM', yariMamul: 'YM', direkt: 'DS', ambalaj: 'AMB' };
var AMBALAJ_DEPO = 'Merkez';

function tuketim_(bas, bit) {
  var T = maliyetTanimlari_(), sv = siparisVerisi_(bas), c = sv.c;
  if (c.urunler < 0 || c.adetler < 0) throw new Error('Sipariş tablosunda Ürünler ya da Ürün Adetleri sütunu bulunamadı');
  var ozet = {}, kul = {}, urunSatis = {}, eslesmeyen = {}, subeler = {};
  function oz(s) { return ozet[s] = ozet[s] || { ciro: 0, siparis: 0, kalemCiro: 0, eslesenCiro: 0, hammadde: 0, yariMamul: 0, direkt: 0, ambalaj: 0 }; }

  sv.rows.forEach(function (r) {
    var ms = zaman_(r[c.tarih]); if (ms === null) return;
    var gun = isGunu_(ms); if (gun < bas || gun > bit) return;
    if (norm_(r[c.durum]) !== 'kapali') return;
    var s = subeKisa_(subeAnahtar_(c.cikan >= 0 ? r[c.cikan] : '') || subeAnahtar_(c.sube >= 0 ? r[c.sube] : '')) || 'Belirtilmemiş';
    var paket = c.tip < 0 || /paket/i.test(String(r[c.tip] || ''));
    subeler[s] = 1;
    var o = oz(s); o.ciro += sayi_(r[c.tutar]); o.siparis++;
    var adlar = parca_(r[c.urunler]), adet = parca_(r[c.adetler]),
        fiyat = c.fiyatlar >= 0 ? parca_(r[c.fiyatlar]) : [], kat = c.kategoriler >= 0 ? parca_(r[c.kategoriler]) : [];
    adlar.forEach(function (u, j) {
      if (!u) return;
      var a = sayi_(adet[j]) || 1, kc = a * sayi_(fiyat[j]), m = urunAc_(T, u, kat[j] || '');
      o.kalemCiro += kc; if (m.bulundu) o.eslesenCiro += kc;
      if (!m.bulundu && kc > 0) { var e = eslesmeyen[m.anahtar] = eslesmeyen[m.anahtar] || { ad: u, adet: 0, ciro: 0 }; e.adet += a; e.ciro += kc; }
      var liste = paket ? m.kalemler.concat(m.ambalaj) : m.kalemler, maliyet = 0;
      liste.forEach(function (k) {
        var x = kul[k.mk] = kul[k.mk] || {}, y = x[s] = x[s] || { miktar: 0, tutar: 0, urunler: {} };
        y.miktar += a * k.miktar; y.tutar += a * k.tutar; y.urunler[m.ad] = (y.urunler[m.ad] || 0) + a * k.miktar;
        o[T.mal[k.mk].tur] += a * k.tutar; maliyet += a * k.tutar;
      });
      if (m.bulundu || maliyet > 0) {
        var us = urunSatis[m.ad] = urunSatis[m.ad] || { ad: m.ad, kategori: m.kategori || kat[j] || '', subeler: {} };
        var z = us.subeler[s] = us.subeler[s] || [0, 0, 0]; z[0] += a; z[1] += kc; z[2] += maliyet;
      }
    });
  });

  var stok = subeStokHaritasi_();
  var r2 = function (x) { return Math.round(x * 100) / 100; }, r3 = function (x) { return Math.round(x * 1000) / 1000; };
  var malzemeler = Object.keys(T.mal).map(function (mk) {
    var d = T.mal[mk], k = kul[mk] || {}, st = {}, stokTip = TUR_STOK_TIP[d.tur];
    var yerler = d.tur === 'ambalaj' ? [AMBALAJ_DEPO] : ['Erenköy', 'Fikirtepe'].concat(Object.keys(subeler));
    yerler.forEach(function (y) {
      for (var i = 0; i < d.adlar.length; i++) { var v = stok[norm_(d.adlar[i]) + '|' + stokTip + '|' + norm_(y)]; if (v !== undefined) { st[y] = r3(v); break; } }
    });
    var kullanim = {}, urunler = {};
    Object.keys(k).forEach(function (s) {
      kullanim[s] = [r3(k[s].miktar), r2(k[s].tutar)];
      Object.keys(k[s].urunler).forEach(function (u) { urunler[u] = (urunler[u] || 0) + k[s].urunler[u]; });
    });
    return { ad: d.ad, tamAd: d.tamAd, tur: d.tur, kategori: d.kategori, birim: d.birim, birimFiyat: r3(d.birimFiyat || 0), kullanim: kullanim, stok: st,
             urunler: Object.keys(urunler).map(function (u) { return [u, r3(urunler[u])]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8) };
  }).filter(function (m) { return Object.keys(m.kullanim).length || Object.keys(m.stok).length; });

  var sl = Object.keys(subeler).sort(function (a, b) { return (a === 'Belirtilmemiş') - (b === 'Belirtilmemiş') || a.localeCompare(b, 'tr'); });
  var ozetCikti = {};
  sl.forEach(function (s) { var o = ozet[s]; ozetCikti[s] = { ciro: Math.round(o.ciro), siparis: o.siparis, hammadde: r2(o.hammadde), yariMamul: r2(o.yariMamul), direkt: r2(o.direkt), ambalaj: r2(o.ambalaj),
    kapsam: o.kalemCiro ? Math.round(o.eslesenCiro / o.kalemCiro * 1000) / 10 : 100 }; });
  return {
    bas: bas, bit: bit, gunSayisi: Math.round((Date.parse(bit) - Date.parse(bas)) / 86400000) + 1, okunanIlkGun: sv.ilkGun, eksikAralik: !sv.hepsi && sv.ilkGun > bas,
    olusturma: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"), subeler: sl, ozet: ozetCikti, malzemeler: malzemeler,
    urunler: Object.keys(urunSatis).map(function (k) { var u = urunSatis[k], o = {}; Object.keys(u.subeler).forEach(function (s) { var z = u.subeler[s]; o[s] = [r3(z[0]), Math.round(z[1]), r2(z[2])]; }); return { ad: u.ad, kategori: u.kategori, subeler: o }; }),
    eslesmeyen: Object.keys(eslesmeyen).map(function (k) { var e = eslesmeyen[k]; return { ad: e.ad, adet: e.adet, ciro: Math.round(e.ciro) }; }).sort(function (a, b) { return b.ciro - a.ciro; }).slice(0, 30),
    eksikTanim: Object.keys(T.eksik).map(function (k) { var e = T.eksik[k]; return { ad: e.ad, urunler: Object.keys(e.urunler).slice(0, 6), urunSayi: Object.keys(e.urunler).length }; })
      .sort(function (a, b) { return b.urunSayi - a.urunSayi; }).slice(0, 30),
    tanimlar: T.sayilar, eslestirmeSekmesi: MALIYET_ESLESTIRME_SEKME, ambalajDepo: AMBALAJ_DEPO
  };
}

// Sube_Stok: Urun_Adi, Tip, Sube, Mevcut_Stok → { 'ad|TIP|sube': mevcut }
function subeStokHaritasi_() {
  var v = sekme_(SpreadsheetApp.openById(KAYNAK.stok.id), ['Sube_Stok']), h = {};
  if (v.length < 2) return h;
  var b = v[0].map(String), cA = tamKolon_(b, ['Urun_Adi'], 0), cT = tamKolon_(b, ['Tip'], 1), cS = tamKolon_(b, ['Sube', 'Şube'], 2), cM = tamKolon_(b, ['Mevcut_Stok'], 3);
  v.slice(1).forEach(function (r) {
    if (!String(r[cA]).trim()) return;
    h[norm_(r[cA]) + '|' + String(r[cT] || '').trim().toUpperCase() + '|' + norm_(r[cS])] = sayi_(r[cM]);
  });
  return h;
}

// Bir satış satırındaki ürünün BİR adedinin malzemeleri: [{ mk, miktar (malzemenin biriminde), tutar }]. Ambalaj ayrı listede.
function urunAc_(T, satisAdi, kategori) {
  var anahtar = norm_(satisAdi), memo = anahtar + '|' + norm_(kategori);
  if (T.urunMemo[memo]) return T.urunMemo[memo];
  var m = { anahtar: anahtar, ad: satisAdi, kategori: '', bulundu: false, kalemler: [], ambalaj: [] };
  var rk = T.eslestir[anahtar] || (T.recete[anahtar] ? anahtar : null) || benzer_(T, anahtar, 'r');
  if (rk && T.recete[rk]) {
    var rc = T.recete[rk]; m.ad = rc.ad; m.kategori = T.urunKategori[rk] || ''; m.bulundu = true;
    rc.bilesenler.forEach(function (b) { var s = bilesen_(T, b.ad, b.miktar, b.birim, b.tip, 0, rc.ad); if (s) m.kalemler.push(s); });
  } else {
    var dk = T.ds[anahtar] ? anahtar : benzer_(T, anahtar, 'd'), ds = dk ? T.ds[dk] : null;
    if (ds) {
      m.ad = ds.ad; m.bulundu = true;
      m.kalemler.push({ mk: malKaydet_(T, 'direkt', ds), miktar: 1, tutar: ds.birimFiyat });
      if (!(ds.birimFiyat > 0)) eksikEkle_(T, ds.ad + ' (alış fiyatı yok)', satisAdi);
    }
  }
  // Ambalaj: önce ürüne özel kural, yoksa ürünün kategorisine ait kural.
  var kural = (rk && T.ambUrun[rk]) || T.ambUrun[anahtar] || (m.kategori && T.ambKat[norm_(m.kategori)]) || T.ambKat[norm_(kategori)] || [];
  kural.forEach(function (x) {
    var p = T.amb[norm_(x.malzeme)];
    if (!p) { eksikEkle_(T, x.malzeme + ' (ambalaj tanımı yok)', m.ad); return; }
    if (!(p.birimFiyat > 0)) eksikEkle_(T, x.malzeme + ' (alış fiyatı yok)', m.ad);
    m.ambalaj.push({ mk: malKaydet_(T, 'ambalaj', p), miktar: x.miktar, tutar: x.miktar * p.birimFiyat });
  });
  T.urunMemo[memo] = m;
  return m;
}

// Reçetedeki bir satır: hangi malzeme, malzemenin biriminde ne kadar, kaç lira.
function bilesen_(T, ad, miktar, birim, tip, derin, urun) {
  if (!ad || !(miktar > 0)) return null;
  var n = norm_(ad);
  if (SIFIR_MALIYET[n]) return null;
  var ym = T.ym[n], hm = T.hm[n], ds = T.ds[n];
  if (ym && (tip === 'YM' || !hm)) {
    var q = ymMiktar_(ym, miktar, birim), bf = ymBirimFiyat_(T, ym, derin, urun);
    return { mk: malKaydet_(T, 'yariMamul', ym, bf), miktar: q, tutar: bf === null ? 0 : q * bf };
  }
  if (hm) {
    if (!(hm.birimFiyat > 0)) eksikEkle_(T, ad + ' (alış fiyatı yok)', urun);
    // Tablodaki ölçü birimi boşsa ya da reçetedekiyle aynı türde değilse (gr ↔ adet) miktar çevrilemez:
    // çevrilmeden çarpılınca paket fiyatı gram fiyatı sayılıyordu (02.10: penne porsiyonu 14.000 TL). Tutara 0 girer, eksik listesinde görünür.
    var ka = birimAile_(birim), ha = birimAile_(hm.birim);
    if (ka && (ha ? ka[0] !== ha[0] : ka[0] === 'k')) {
      eksikEkle_(T, ad + (ha ? ' (birim uyuşmuyor: reçetede ' + birim + ', tabloda ' + hm.birim + ')'
                             : ' (paket içeriği / ölçü birimi boş: ' + hm.tamAd + ')'), urun);
      return { mk: malKaydet_(T, 'hammadde', hm), miktar: miktar, tutar: 0 };
    }
    var qh = cevir_(miktar, birim, hm.birim);
    return { mk: malKaydet_(T, 'hammadde', hm), miktar: qh, tutar: qh * hm.birimFiyat };
  }
  if (ds) {
    if (!(ds.birimFiyat > 0)) eksikEkle_(T, ad + ' (alış fiyatı yok)', urun);
    return { mk: malKaydet_(T, 'direkt', ds), miktar: miktar, tutar: miktar * ds.birimFiyat };
  }
  eksikEkle_(T, ad + ' (tanımı yok)', urun);
  return null;
}

function malKaydet_(T, tur, x, ymFiyat) {
  var mk = tur + '|' + norm_(x.tamAd || x.ad);
  if (!T.mal[mk]) T.mal[mk] = { tur: tur, ad: x.ad, tamAd: x.tamAd || x.ad, kategori: x.kategori || '', adlar: [x.tamAd, x.ad].filter(Boolean),
    birim: tur === 'yariMamul' ? (x.gram ? 'gr' : 'adet') : (tur === 'hammadde' ? (x.birim || 'adet') : 'adet'),
    birimFiyat: tur === 'yariMamul' ? ymFiyat : x.birimFiyat };
  return mk;
}

// Reçetede yazılan miktarı yarı mamulün takip birimine (gr ya da adet) çevirir.
function ymMiktar_(ym, m, birim) {
  var fa = birimAile_(birim), ag = ym.birimAgir || ym.porsiyonAgir;
  if (ym.gram) { if (fa && fa[0] === 'k') return m * fa[1]; return ag > 0 ? m * ag : m; }
  if (!fa || fa[0] === 'a') return m;
  return ag > 0 ? m * fa[1] / ag : 1; // adetle takip edilen yarı mamul gramla yazılmışsa: bir adetin ağırlığına böl
}

// Yarı mamulün takip biriminin (gr ya da adet) maliyeti: parti reçetesi toplamı / parti çıktısı.
function ymBirimFiyat_(T, ym, derin, urun) {
  if (ym.fiyat !== undefined) return ym.fiyat;
  if (derin > 4 || ym.hesaplaniyor) return null;
  ym.hesaplaniyor = true;
  var parti = 0;
  ym.bilesenler.forEach(function (b) { var s = bilesen_(T, b.ad, b.miktar, b.birim, '', derin + 1, ym.ad); if (s) parti += s.tutar; });
  ym.hesaplaniyor = false;
  if (!ym.bilesenler.length) { eksikEkle_(T, ym.ad + ' (yarı mamul reçetesi yok)', urun); return ym.fiyat = null; }
  if (!(ym.baz > 0)) { eksikEkle_(T, ym.ad + ' (parti çıktısı yazılmamış)', urun); return ym.fiyat = null; }
  return ym.fiyat = parti / ym.baz;
}

function maliyetTanimlari_() {
  var ss = SpreadsheetApp.openById(KAYNAK.stok.id);
  var T = { recete: {}, receteAnahtar: [], urunKategori: {}, hm: {}, ym: {}, ds: {}, dsAnahtar: [], amb: {}, ambUrun: {}, ambKat: {}, mal: {},
            eslestir: {}, urunMemo: {}, eksik: {}, benzerMemo: {}, ikiliMemo: {}, sayilar: {} };

  sekme_(ss, ['Ürün_Listesi', 'Urun_Listesi']).slice(1).forEach(function (r) { if (String(r[0]).trim()) T.urunKategori[norm_(r[0])] = String(r[1] || '').trim(); });

  // Hammadde ve ambalaj tabloları: B tam ad, C kısa ad, E sipariş aktif, G kategori, H paket içeriği, I ölçü birimi, J son alış fiyatı (paket).
  T.sayilar.hammadde = fiyatTablosu_(sekme_(ss, ['Tbl_Hammaddeler']), T.hm);
  T.sayilar.ambalaj = fiyatTablosu_(sekme_(ss, ['Ambalaj_Hammadde']), T.amb);

  // Direkt satış ürünleri: fiyat koli fiyatıdır, koli içeriğine bölünür.
  var dv = sekme_(ss, ['Direktsatisurunler']), dn = 0;
  if (dv.length > 1) {
    var db = dv[0].map(String);
    var cU = tamKolon_(db, ['Urun_adi'], 1), cK = tamKolon_(db, ['Hammadde_Adi', 'Hammadde_Adı'], 2), cA = tamKolon_(db, ['Tedarikçi Sipariş Aktif'], 4),
        cG = tamKolon_(db, ['Kategori'], 6), cF = tamKolon_(db, ['Son Alış Fiyatı', 'Son_Alis_Fiyati'], 9), cO = tamKolon_(db, ['Ölçü_Birimi', 'Olcu_Birimi'], 8),
        cKi = tamKolon_(db, ['Koli_Icerik', 'Koli_İçerik'], 15);
    dv.slice(1).forEach(function (r) {
      var tam = String(r[cU] || '').trim(), kisa = String(r[cK] || '').trim(); if (!tam && !kisa) return;
      // Koli içeriği yazılmamışsa addan okunur: "...1X24...", "20Lİ".
      var bol = sayi_(r[cKi]), mm = tam.match(/(?:^|\D)1\s*[xX*]\s*(\d{1,3})(?!\d)/) || tam.match(/(\d{1,3})\s*L[İIiı](?![A-Za-zçğıöşüÇĞİÖŞÜ])/);
      if (!(bol > 1)) bol = mm ? +mm[1] : (sayi_(r[cO]) > 1 ? sayi_(r[cO]) : 1);
      var f = sayi_(r[cF]);
      // Aynı içecek birden çok satırda olabilir (tedarikçi / koli); malzeme kısa adıyla tek kalem sayılır.
      var x = { ad: kisa || tam, tamAd: kisa || tam, kategori: String(r[cG] || '').trim() || 'İçecek', birimFiyat: f > 0 ? f / bol : 0,
                aktif: !/^(false|yanlış|yanlis|hayır|hayir|0)$/i.test(String(r[cA]).trim()) };
      [tam, kisa].forEach(function (a) { if (a) enIyi_(T.ds, norm_(a), x); });
      dn++;
    });
  }
  T.sayilar.direkt = dn;
  T.dsAnahtar = Object.keys(T.ds);

  // Yarı mamul çıktıları ve parti reçeteleri
  var yv = sekme_(ss, ['Tbl_YariMamul tablosuna Cikti_Tipi', 'Tbl_YariMamul']);
  if (yv.length > 1) {
    var yb = yv[0].map(String);
    var yT = tamKolon_(yb, ['Cikti_Tipi', 'Çıktı_Tipi'], 1), yB = tamKolon_(yb, ['Baz_Miktar', 'Baz_Miktari', 'Parti_Miktari'], 2),
        yA = tamKolon_(yb, ['Birim_Agirlik', 'Birim_Ağırlık'], 3), yP = tamKolon_(yb, ['Porsiyon_Agirlik', 'Porsiyon_Ağırlık'], 4), yK = tamKolon_(yb, ['Kategori'], 6);
    yv.slice(1).forEach(function (r) {
      var ad = String(r[0] || '').trim(); if (!ad) return;
      var tip = birimAile_(r[yT]), baz = sayi_(r[yB]);
      T.ym[norm_(ad)] = { ad: ad, gram: !!(tip && tip[0] === 'k'), baz: tip && tip[0] === 'k' ? baz * tip[1] : baz,
                          birimAgir: sayi_(r[yA]), porsiyonAgir: sayi_(r[yP]), kategori: String(r[yK] || '').trim(), bilesenler: [] };
    });
  }
  var yr = sekme_(ss, ['Tbl_YariMamulRecete']);
  if (yr.length > 1) {
    var rb = yr[0].map(String), rH = tamKolon_(rb, ['Hammadde', 'Hammadde_Adı', 'Hammadde_Adi'], 1), rM = tamKolon_(rb, ['Miktar', 'Baz_Miktar'], 2), rBr = tamKolon_(rb, ['Birim'], 3);
    yr.slice(1).forEach(function (r) {
      var ad = String(r[0] || '').trim(), h = String(r[rH] || '').trim(); if (!ad || !h) return;
      var k = norm_(ad), y = T.ym[k] = T.ym[k] || { ad: ad, gram: false, baz: 0, birimAgir: 0, porsiyonAgir: 0, kategori: '', bilesenler: [] };
      y.bilesenler.push({ ad: h, miktar: sayi_(r[rM]), birim: String(r[rBr] || '').trim() });
    });
  }
  T.sayilar.yariMamul = Object.keys(T.ym).length;

  // Ürün reçeteleri: Ürün_Adı, Hammadde, Miktar, Birim, Tip (YM ya da Ü)
  var rv = sekme_(ss, ['Tbl_Receteler']);
  if (rv.length > 1) {
    var b = rv[0].map(String);
    var cH = tamKolon_(b, ['Hammadde', 'Hammadde_Adı', 'Hammadde_Adi', 'Malzeme'], 2), cM = tamKolon_(b, ['Miktar'], 3), cB = tamKolon_(b, ['Birim'], 4),
        cT = tamKolon_(b, ['Tip', 'Tür', 'Tur', 'Urun_Tipi', 'Ürün_Tipi', 'Ürün Tipi', 'Malzeme_Tipi'], 5);
    rv.slice(1).forEach(function (r) {
      var ad = String(r[0] || '').trim(), h = String(r[cH] || '').trim(); if (!ad || !h) return;
      var k = norm_(ad), rc = T.recete[k] = T.recete[k] || { ad: ad, bilesenler: [] };
      rc.bilesenler.push({ ad: h, miktar: sayi_(r[cM]), birim: String(r[cB] || '').trim(), tip: /^ym$/i.test(String(r[cT] || '').trim()) ? 'YM' : '' });
    });
  }
  T.receteAnahtar = Object.keys(T.recete);
  T.sayilar.recete = T.receteAnahtar.length;

  // Ambalaj kuralları: Kosul_Tipi (Urun / Kategori), Eslesme, malzeme, miktar
  var kn = 0;
  sekme_(ss, ['Ambalaj_Kurallari']).slice(1).forEach(function (r) {
    var es = String(r[1] || '').trim(), mz = String(r[2] || '').trim(); if (!es || !mz) return;
    var h = /^[uü]r[uü]n$/i.test(String(r[0] || '').trim()) ? T.ambUrun : T.ambKat, k = norm_(es);
    (h[k] = h[k] || []).push({ malzeme: mz, miktar: sayi_(r[3]) || 1 }); kn++;
  });
  T.sayilar.ambalajKurali = kn;

  // İsteğe bağlı elle eşleştirme
  sekme_(ss, [MALIYET_ESLESTIRME_SEKME]).slice(1).forEach(function (r) {
    var s = norm_(r[0]), u = norm_(r[1]); if (s && u) T.eslestir[s] = u;
  });
  T.sayilar.eslestirme = Object.keys(T.eslestir).length;

  // Tüketimi olmasa da stok listesinde görünsünler diye bütün tanımlı malzemeler kaydedilir.
  Object.keys(T.hm).forEach(function (k) { malKaydet_(T, 'hammadde', T.hm[k]); });
  Object.keys(T.amb).forEach(function (k) { malKaydet_(T, 'ambalaj', T.amb[k]); });
  Object.keys(T.ds).forEach(function (k) { malKaydet_(T, 'direkt', T.ds[k]); });
  Object.keys(T.ym).forEach(function (k) { var y = T.ym[k]; malKaydet_(T, 'yariMamul', y, ymBirimFiyat_(T, y, 0, y.ad)); });
  return T;
}

function fiyatTablosu_(v, hedef) {
  var n = 0;
  v.slice(1).forEach(function (r) {
    var tam = String(r[1] || '').trim(), kisa = String(r[2] || '').trim(); if (!tam && !kisa) return;
    var ic = sayi_(r[7]) || 1, f = sayi_(r[9]);
    var x = { ad: kisa || tam, tamAd: tam || kisa, kategori: String(r[6] || '').trim(), birim: String(r[8] || '').trim(), birimFiyat: f > 0 ? f / ic : 0,
              aktif: !/^(false|yanlış|yanlis|hayır|hayir|0)$/i.test(String(r[4]).trim()) };
    [tam, kisa].forEach(function (a) { if (a) enIyi_(hedef, norm_(a), x); });
    n++;
  });
  return n;
}
// Aynı ad birden çok tedarikçide varsa fiyatı olan ve siparişi aktif olan tercih edilir.
function enIyi_(h, k, x) {
  var p = function (o) { return (o.birimFiyat > 0 ? 2 : 0) + (o.aktif ? 1 : 0); };
  if (!h[k] || p(x) > p(h[k])) h[k] = x;
}

function sekme_(ss, adlar) {
  for (var i = 0; i < adlar.length; i++) { var sh = ss.getSheetByName(adlar[i]); if (sh) return sh.getLastRow() ? sh.getDataRange().getValues() : []; }
  var hepsi = ss.getSheets();
  for (i = 0; i < adlar.length; i++) for (var j = 0; j < hepsi.length; j++)
    if (norm_(hepsi[j].getName()) === norm_(adlar[i])) return hepsi[j].getLastRow() ? hepsi[j].getDataRange().getValues() : [];
  return [];
}
// Yalnız birebir başlık eşleşmesi (ön ek eşleşmesi 'Hammadde' → 'Hammadde_Kategori' gibi yanlış sütunu bulabilir).
function tamKolon_(b, adlar, varsayilan) {
  var n = b.map(norm_);
  for (var i = 0; i < adlar.length; i++) { var j = n.indexOf(norm_(adlar[i])); if (j >= 0) return j; }
  return varsayilan;
}

// Birim ailesi: ['k', çarpan] ağırlık/hacim (gr = ml = 1), ['a', 1] adet.
function birimAile_(b) {
  var n = norm_(b);
  if (/^(gr|g|gram|grm)$/.test(n) || /^(ml|cc)$/.test(n)) return ['k', 1];
  if (/^(kg|kilo|kilogram)$/.test(n) || /^(lt|l|litre|liter)$/.test(n)) return ['k', 1000];
  if (n === 'cl') return ['k', 10];
  if (/^(adet|ad|tane|porsiyon|paket|dilim|yaprak)$/.test(n)) return ['a', 1];
  return null;
}
function cevir_(m, kaynak, hedef) {
  var a = birimAile_(kaynak), b = birimAile_(hedef);
  if (!a || !b || a[0] !== b[0]) return m;
  return m * a[1] / b[1];
}

function benzer_(T, a, tur) {
  var mk = tur + '|' + a;
  if (mk in T.benzerMemo) return T.benzerMemo[mk];
  var liste = tur === 'd' ? T.dsAnahtar : T.receteAnahtar, ba = ikili_(T, a), en = null, puan = 0;
  if (a.length >= 5) liste.forEach(function (k) { var p = dice_(ba, ikili_(T, k)); if (p > puan) { puan = p; en = k; } });
  return T.benzerMemo[mk] = puan >= 0.82 ? en : null;
}
function ikili_(T, s) {
  if (T.ikiliMemo[s]) return T.ikiliMemo[s];
  var o = {}; for (var i = 0; i < s.length - 1; i++) { var k = s.substr(i, 2); o[k] = (o[k] || 0) + 1; }
  return T.ikiliMemo[s] = o;
}
function dice_(a, b) {
  var ort = 0, ta = 0, tb = 0, k;
  for (k in a) { ta += a[k]; if (b[k]) ort += Math.min(a[k], b[k]); }
  for (k in b) tb += b[k];
  return ta + tb ? 2 * ort / (ta + tb) : 0;
}
function eksikEkle_(T, ad, urun) { var k = norm_(ad), e = T.eksik[k] = T.eksik[k] || { ad: ad, urunler: {} }; e.urunler[urun] = 1; }
function parca_(v) { return String(v == null ? '' : v).split('|').map(function (x) { return x.trim(); }); }
function subeKisa_(s) { return String(s || '').replace(/^BAP\s+/i, '').trim(); }

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
            ne: kolon_(b, ['Ne yapıldı']), denetci: kolon_(b, ['Denetçi sonucu']), isNo: kolon_(b, ['İş No']),
            onayGerek: kolon_(b, ['Sahip onayı gerekti mi']), onay: kolon_(b, ['Sahip onayı']), yeni: kolon_(b, ['Yeni durum']) };
  if (c.tarih < 0 || c.dep < 0) throw new Error('İş kaydında tarih ya da departman sütunu bulunamadı');
  var simdi = simdi_();
  var dep = {};
  DEPARTMANLAR.forEach(function (d) { dep[d] = { departman: d, son: null, saatOnce: null, son24: 0, son7: 0 }; });
  var kayitlar = [], ozet = { son24: 0, son7: 0, son30: 0, denetciBekliyor: 0 }, ajan = {}, onayBekleyen = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i]; var ms = zaman_(r[c.tarih]); if (ms === null) continue;
    var ad = depEsle_(r[c.dep]); if (!ad) continue;
    var o = dep[ad]; var saat = (simdi - ms) / 3600000;
    if (o.son === null || ms > o.sonMs) { o.sonMs = ms; o.son = new Date(ms).toISOString().slice(0, 16).replace('T', ' '); o.saatOnce = Math.round(saat); }
    if (saat <= 24) { o.son24++; ozet.son24++; }
    if (saat <= 168) { o.son7++; ozet.son7++; }
    if (saat <= 720) { ozet.son30++; var aj = String(c.ajan >= 0 ? r[c.ajan] : '').trim() || ad; topla_(ajan, aj, 1); }
    var den = c.denetci >= 0 ? String(r[c.denetci] || '') : '';
    if (/bekliyor/i.test(den) && saat <= 720) ozet.denetciBekliyor++;
    // Sahip onayı gerekip henüz verilmemiş işler (boş, '-', 'bekliyor').
    if (c.onayGerek >= 0 && /^(evet|e|true|gerekli|var)/i.test(String(r[c.onayGerek] || '').trim()) &&
        (c.onay < 0 || /^(|-|—|bekliyor|bekleniyor)$/i.test(String(r[c.onay] || '').trim())))
      onayBekleyen.push({ ms: ms, zaman: new Date(ms).toISOString().slice(0, 16).replace('T', ' '), departman: ad, ajan: c.ajan >= 0 ? r[c.ajan] : '',
                          isNo: c.isNo >= 0 ? r[c.isNo] : '', ne: kodsuz_(c.ne >= 0 ? r[c.ne] : '').slice(0, 300), yeni: kodsuz_(c.yeni >= 0 ? r[c.yeni] : '').slice(0, 200) });
    kayitlar.push({ ms: ms, zaman: new Date(ms).toISOString().slice(0, 16).replace('T', ' '), departman: ad,
                    ajan: c.ajan >= 0 ? r[c.ajan] : '', ne: kodsuz_(c.ne >= 0 ? r[c.ne] : '').slice(0, 260),
                    denetci: c.denetci >= 0 ? r[c.denetci] : '' });
  }
  kayitlar.sort(function (a, b) { return b.ms - a.ms; });
  return {
    departmanlar: DEPARTMANLAR.map(function (d) { var o = dep[d]; delete o.sonMs; return o; }),
    sonKayitlar: kayitlar.slice(0, 15).map(function (k) { delete k.ms; return k; }),
    ozet: ozet, ajanlar: sirala_(ajan).slice(0, 15),
    onayBekleyen: onayBekleyen.sort(function (a, b) { return b.ms - a.ms; }).slice(0, 20).map(function (k) { delete k.ms; return k; })
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
    kokpit: kokpitOku_(ss),
    gorevToplam: gorevToplam, gorevDurum: sirala_(gorevDurum), bekleyen: bekleyen,
    cikti: sirala_(cikti), motorlar: Object.keys(motor).map(function (k) { return motor[k]; }),
    acikDenetim: acikDenetim, ciddiDenetim: ciddi, not: 'Deneme kayıtları sayılmadı.'
  };
}


// Yönetim Kokpiti (HUB'daki KOKPIT_* sekmeleri): departman ajanlarının sahibe soruları / kararları / görev emirleri,
// departman panoları ve Genel Müdür gündemi. Ajanlar buraya yazar; sahip panelden cevaplar (tur: 'kokpit').
var KOKPIT_BASLIK = ['ID', 'DEPARTMAN', 'TIP', 'IS_NO', 'BASLIK', 'ACIKLAMA', 'RISK', 'TALEP_EDEN', 'TALEP_ZAMANI', 'DURUM', 'SAHIP_NOTU',
                     'KARAR_ZAMANI', 'ISLENDI', 'ISLEM_NOTU', 'GM_INCELEME', 'GM_NOT', 'GUNCELLEME'];
function kokpitOku_(ss) {
  var o = tablo_(ss, 'KOKPIT_ONAYLAR'), d = tablo_(ss, 'KOKPIT_DEPARTMANLAR'), g = tablo_(ss, 'KOKPIT_GUNDEM');
  var bekleyen = [], islenmedi = 0, depSay = {}, toplam = 0;
  o.satirlar.forEach(function (r) {
    var id = String(al_(o, r, 'ID')).trim(); if (!id) return; toplam++;
    var durum = String(al_(o, r, 'DURUM')).trim().toLowerCase(), islendi = /^(true|evet|1)$/i.test(String(al_(o, r, 'ISLENDI')).trim());
    var dep = String(al_(o, r, 'DEPARTMAN')).trim();
    if (durum === 'bekliyor' || durum === 'beklet') {
      depSay[dep] = (depSay[dep] || 0) + 1;
      bekleyen.push({ id: id, departman: dep, tip: String(al_(o, r, 'TIP')).trim() || 'karar', isNo: al_(o, r, 'IS_NO'), baslik: String(al_(o, r, 'BASLIK')).slice(0, 300),
                      aciklama: String(al_(o, r, 'ACIKLAMA')).slice(0, 2500), risk: al_(o, r, 'RISK'), talepEden: al_(o, r, 'TALEP_EDEN'),
                      talepZamani: al_(o, r, 'TALEP_ZAMANI'), durum: durum, not: String(al_(o, r, 'SAHIP_NOTU')).slice(0, 1000), gmNot: String(al_(o, r, 'GM_NOT')).slice(0, 600),
                      islemNotu: String(al_(o, r, 'ISLEM_NOTU')).slice(0, 800), guncelleme: al_(o, r, 'GUNCELLEME') });
    } else if (!islendi && durum) islenmedi++;
  });
  var riskSira = { 'kritik': 0, 'yüksek': 1, 'orta': 2, 'düşük': 3 };
  bekleyen.sort(function (a, b) { return (riskSira[String(a.risk).toLowerCase()] == null ? 4 : riskSira[String(a.risk).toLowerCase()]) - (riskSira[String(b.risk).toLowerCase()] == null ? 4 : riskSira[String(b.risk).toLowerCase()])
    || String(b.talepZamani).localeCompare(String(a.talepZamani)); });
  var departmanlar = d.satirlar.map(function (r) {
    var ad = String(al_(d, r, 'AD')).trim(); if (!ad) return null;
    return { kod: al_(d, r, 'KOD'), ad: ad, aktif: !/^(false|hayır|0)$/i.test(String(al_(d, r, 'AKTIF')).trim()), pano: al_(d, r, 'PANO'), klasor: al_(d, r, 'KLASOR'),
             faz: String(al_(d, r, 'FAZ')).slice(0, 200), bekleyen: depSay[ad] || 0 };
  }).filter(Boolean);
  var gundem = null, gs = g.satirlar.filter(function (r) { return String(al_(g, r, 'TARIH')).trim(); });
  if (gs.length) { var son = gs[gs.length - 1], md = []; try { md = JSON.parse(al_(g, son, 'MADDELER_JSON') || '[]'); } catch (e) { md = []; }
    gundem = { tarih: al_(g, son, 'TARIH'), ozet: String(al_(g, son, 'OZET')).slice(0, 1500),
               maddeler: (md || []).slice(0, 10).map(function (m) { return { oncelik: m.oncelik || '', baslik: String(m.baslik || '').slice(0, 200), detay: String(m.detay || '').slice(0, 800), departmanlar: m.departmanlar || [] }; }) }; }
  return { toplam: toplam, bekleyen: bekleyen.slice(0, 200), islenmedi: islenmedi, departmanlar: departmanlar, gundem: gundem,
           cevaplanan: cevaplanan_(o), panolar: panolarOku_(ss) };
}

// d: { id, karar: 'onaylandi' | 'reddedildi' | 'beklet', not }
// Departman panoları: ajanlar HUB'daki KOKPIT_PANO / KOKPIT_ISLER / KOKPIT_EKIP / KOKPIT_BULGULAR / KOKPIT_GUNLUK
// sekmelerine yazar; panel okur. Sahibin işlere bıraktığı notlar KOKPIT_NOTLAR'a yazılır (tur: 'panoNot').
var PANO_SEKME = {
  KOKPIT_PANO: ['DEPARTMAN', 'GUNCELLEME', 'GUNCELLEYEN', 'ALT_BASLIK', 'KURALLAR', 'LINKLER'],
  KOKPIT_ISLER: ['DEPARTMAN', 'ID', 'GRUP', 'BASLIK', 'NE', 'DURUM', 'AJAN', 'DESTEK', 'ONCELIK', 'ASAMA', 'ETIKET', 'GUNCELLEME', 'LINK'],
  KOKPIT_EKIP: ['DEPARTMAN', 'ID', 'AD', 'DURUM', 'SORUMLULUK', 'DUZENLI', 'YETKI', 'SIRA'],
  KOKPIT_BULGULAR: ['DEPARTMAN', 'BASLIK', 'METIN', 'TON', 'TARIH', 'SIRA'],
  KOKPIT_GUNLUK: ['DEPARTMAN', 'ZAMAN', 'YAZAN', 'METIN'],
  KOKPIT_NOTLAR: ['ID', 'DEPARTMAN', 'IS_ID', 'IS_BASLIK', 'NOT', 'ZAMAN', 'ISLENDI', 'ISLEM_NOTU', 'KAYNAK', 'KARAR', 'CEVAP_ZAMANI', 'SONUC']
};
var PANO_ASAMA = { sende: 1, acik: 1, sirada: 1, engel: 1, hazir: 1, pencerede: 1, denetcide: 1, canlida: 1, tamam: 1, kapandi: 1 };

// Apps Script düzenleyicisinden bir kez çalıştırılabilir: eksik pano sekmelerini başlıklarıyla açar, var olana dokunmaz.
function kokpitPanoKur() {
  var ss = SpreadsheetApp.openById(KAYNAK.hub.id), acilan = [];
  Object.keys(PANO_SEKME).forEach(function (ad) {
    if (ss.getSheetByName(ad)) return;
    var sh = ss.insertSheet(ad); sh.getRange(1, 1, 1, PANO_SEKME[ad].length).setValues([PANO_SEKME[ad]]); sh.setFrozenRows(1); acilan.push(ad);
  });
  Logger.log(acilan.length ? 'Açılan sekmeler: ' + acilan.join(', ') : 'Bütün pano sekmeleri zaten var.');
}

function cevaplanan_(o) {
  var L = [];
  o.satirlar.forEach(function (r) {
    var durum = String(al_(o, r, 'DURUM')).trim().toLowerCase();
    if (durum !== 'onaylandi' && durum !== 'reddedildi') return;
    L.push({ id: String(al_(o, r, 'ID')).trim(), departman: String(al_(o, r, 'DEPARTMAN')).trim(), tip: String(al_(o, r, 'TIP')).trim() || 'karar',
             baslik: String(al_(o, r, 'BASLIK')).slice(0, 300), durum: durum, not: String(al_(o, r, 'SAHIP_NOTU')).slice(0, 600),
             kararZamani: al_(o, r, 'KARAR_ZAMANI'), islendi: /^(true|evet|1)$/i.test(String(al_(o, r, 'ISLENDI')).trim()),
             islemNotu: String(al_(o, r, 'ISLEM_NOTU')).slice(0, 400) });
  });
  var k = function (s) { var m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(\d{1,2})?:?(\d{2})?/); return m ? m[3] + ('0' + m[2]).slice(-2) + ('0' + m[1]).slice(-2) + ('0' + (m[4] || 0)).slice(-2) + (m[5] || '00') : ''; };
  L.sort(function (a, b) { return k(b.kararZamani).localeCompare(k(a.kararZamani)); });
  var say = {};
  return L.filter(function (x) { say[x.departman] = (say[x.departman] || 0) + 1; return say[x.departman] <= 10; });
}

function panolarOku_(ss) {
  var P = {}, dep = function (ad) { ad = String(ad || '').trim(); if (!ad) return null; return P[ad] = P[ad] || { ayar: null, isler: [], ekip: [], bulgular: [], gunluk: [], notlar: [] }; };
  var t = tablo_(ss, 'KOKPIT_PANO');
  t.satirlar.forEach(function (r) { var d = dep(al_(t, r, 'DEPARTMAN')); if (!d) return;
    d.ayar = { guncelleme: al_(t, r, 'GUNCELLEME'), guncelleyen: al_(t, r, 'GUNCELLEYEN'), altBaslik: String(al_(t, r, 'ALT_BASLIK')).slice(0, 600),
               kurallar: String(al_(t, r, 'KURALLAR')).split(/\n+/).map(function (x) { return x.trim(); }).filter(String).slice(0, 15),
               linkler: String(al_(t, r, 'LINKLER')).split(/\n+/).map(function (x) { var p = x.split('|'); var u = String(p[p.length - 1] || '').trim();
                 return /^https:\/\//.test(u) ? { ad: (p.length > 1 ? p[0] : 'Bağlantı').trim().slice(0, 60), url: u } : null; }).filter(Boolean).slice(0, 6) }; });
  t = tablo_(ss, 'KOKPIT_ISLER');
  t.satirlar.forEach(function (r) { var d = dep(al_(t, r, 'DEPARTMAN')), id = String(al_(t, r, 'ID')).trim(); if (!d || !id || d.isler.length >= 150) return;
    var a = String(al_(t, r, 'ASAMA')).trim().toLowerCase();
    d.isler.push({ id: id, grup: String(al_(t, r, 'GRUP')).slice(0, 80), baslik: String(al_(t, r, 'BASLIK')).slice(0, 200), ne: String(al_(t, r, 'NE')).slice(0, 400),
                   durum: String(al_(t, r, 'DURUM')).slice(0, 400), ajan: String(al_(t, r, 'AJAN')).slice(0, 120), destek: String(al_(t, r, 'DESTEK')).slice(0, 120),
                   oncelik: String(al_(t, r, 'ONCELIK')).trim().toLowerCase(), asama: PANO_ASAMA[a] ? a : 'acik', etiket: String(al_(t, r, 'ETIKET')).slice(0, 40),
                   guncelleme: al_(t, r, 'GUNCELLEME'), link: /^https:\/\//.test(String(al_(t, r, 'LINK')).trim()) ? String(al_(t, r, 'LINK')).trim() : '' }); });
  t = tablo_(ss, 'KOKPIT_EKIP');
  t.satirlar.forEach(function (r) { var d = dep(al_(t, r, 'DEPARTMAN')); if (!d || !String(al_(t, r, 'AD')).trim()) return;
    d.ekip.push({ id: al_(t, r, 'ID'), ad: String(al_(t, r, 'AD')).slice(0, 80), durum: String(al_(t, r, 'DURUM')).trim().toLowerCase(), sorumluluk: String(al_(t, r, 'SORUMLULUK')).slice(0, 300),
                  duzenli: String(al_(t, r, 'DUZENLI')).slice(0, 300), yetki: String(al_(t, r, 'YETKI')).slice(0, 300), sira: Number(al_(t, r, 'SIRA')) || 99 }); });
  t = tablo_(ss, 'KOKPIT_BULGULAR');
  t.satirlar.forEach(function (r) { var d = dep(al_(t, r, 'DEPARTMAN')); if (!d || !String(al_(t, r, 'BASLIK')).trim() || d.bulgular.length >= 8) return;
    d.bulgular.push({ baslik: String(al_(t, r, 'BASLIK')).slice(0, 200), metin: String(al_(t, r, 'METIN')).slice(0, 700), ton: String(al_(t, r, 'TON')).trim().toLowerCase(),
                      tarih: al_(t, r, 'TARIH'), sira: Number(al_(t, r, 'SIRA')) || 99 }); });
  t = tablo_(ss, 'KOKPIT_GUNLUK');
  for (var i = t.satirlar.length - 1; i >= 0; i--) { var r = t.satirlar[i], d = dep(al_(t, r, 'DEPARTMAN')); if (!d || d.gunluk.length >= 5 || !String(al_(t, r, 'METIN')).trim()) continue;
    d.gunluk.push({ zaman: al_(t, r, 'ZAMAN'), yazan: al_(t, r, 'YAZAN'), metin: String(al_(t, r, 'METIN')).slice(0, 600) }); }
  t = tablo_(ss, 'KOKPIT_NOTLAR');
  for (var j = t.satirlar.length - 1; j >= 0; j--) { var rn = t.satirlar[j], dn = dep(al_(t, rn, 'DEPARTMAN')); if (!dn || dn.notlar.length >= 120) continue;
    dn.notlar.push({ id: String(al_(t, rn, 'ID')).trim(), isId: String(al_(t, rn, 'IS_ID')).trim(), not: String(al_(t, rn, 'NOT')).slice(0, 1500), zaman: al_(t, rn, 'ZAMAN'),
                     islendi: /^(true|evet|1)$/i.test(String(al_(t, rn, 'ISLENDI')).trim()), islemNotu: String(al_(t, rn, 'ISLEM_NOTU')).slice(0, 1500),
                     kaynak: String(al_(t, rn, 'KAYNAK')).trim() || 'Panel', karar: String(al_(t, rn, 'KARAR')).trim().toLowerCase(),
                     cevapZamani: al_(t, rn, 'CEVAP_ZAMANI'), sonuc: String(al_(t, rn, 'SONUC')).trim().toLowerCase() }); }
  return P;
}

// Sahibin bir işe bıraktığı not: KOKPIT_NOTLAR'ın sonuna yeni satır. Departman ajanı bir sonraki çalışmasında okur ve ISLENDI yazar.
function panoNot_(d) {
  var dep = String(d.departman || '').trim().slice(0, 60), isId = String(d.isId || '').trim().slice(0, 80), not = String(d.not || '').replace(/\r/g, '').trim().slice(0, 2000);
  var karar = { onay: 'onay', ret: 'ret' }[String(d.karar || '')] || '';
  if (!dep) return { hata: 'Departman seçilmedi.' };
  if (!not && !karar) return { hata: 'Mesajını yaz.' };
  if (!not) not = karar === 'onay' ? 'Onaylıyorum, devam edin.' : 'Reddediyorum, bu işi durdurun.';
  var istek = String(d.istekNo || '').slice(0, 60);
  var ss = SpreadsheetApp.openById(KAYNAK.hub.id), sh = ss.getSheetByName('KOKPIT_NOTLAR');
  if (!sh) { sh = ss.insertSheet('KOKPIT_NOTLAR'); sh.getRange(1, 1, 1, PANO_SEKME.KOKPIT_NOTLAR.length).setValues([PANO_SEKME.KOKPIT_NOTLAR]); sh.setFrozenRows(1); }
  var id = 'NOT-' + (istek || Utilities.getUuid()).replace(/[^A-Za-z0-9-]/g, '').slice(0, 36);
  if (sh.getLastRow() > 1) {
    var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues();
    for (var i = ids.length - 1; i >= 0 && i >= ids.length - 200; i--) if (String(ids[i][0]).trim() === id) return { tamam: true, id: id, ozet: 'Not zaten kaydedilmiş.' };
  }
  var baslik = '', t = tablo_(ss, 'KOKPIT_ISLER');
  t.satirlar.forEach(function (r) { if (String(al_(t, r, 'ID')).trim() === isId && String(al_(t, r, 'DEPARTMAN')).trim() === dep) baslik = String(al_(t, r, 'BASLIK')); });
  if (!baslik) { var o = tablo_(ss, 'KOKPIT_ONAYLAR'); o.satirlar.forEach(function (r) { if (String(al_(o, r, 'ID')).trim() === isId) baslik = String(al_(o, r, 'BASLIK')); }); }
  var b = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getDisplayValues()[0];
  if (b.length < PANO_SEKME.KOKPIT_NOTLAR.length || String(b[11] || '').trim() !== 'SONUC') sh.getRange(1, 1, 1, PANO_SEKME.KOKPIT_NOTLAR.length).setValues([PANO_SEKME.KOKPIT_NOTLAR]);
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm');
  sh.appendRow([id, dep, isId, baslik.slice(0, 200), not, damga, 'FALSE', '', 'Panel', karar, '', '']);
  var ne = karar === 'onay' ? 'Onayın' : karar === 'ret' ? 'Reddin' : 'Mesajın';
  return { tamam: true, id: id, ozet: ne + ' kaydedildi. ' + dep + ' bir sonraki çalışmasında (13:00 / 21:00) işleyip cevabını bu kartın altına yazacak.' };
}

function kokpitCevap_(d) {
  var id = String(d.id || '').trim().slice(0, 80); if (!id) return { hata: 'Kayıt yok.' };
  var karar = { onaylandi: 'onaylandi', reddedildi: 'reddedildi', beklet: 'beklet' }[d.karar];
  if (!karar) return { hata: 'Geçersiz karar.' };
  var not = String(d.not || '').replace(/\r/g, '').trim().slice(0, 3000);
  var sh = SpreadsheetApp.openById(KAYNAK.hub.id).getSheetByName('KOKPIT_ONAYLAR'); if (!sh) return { hata: "HUB'da KOKPIT_ONAYLAR sekmesi yok." };
  var v = sh.getDataRange().getDisplayValues(), b = v[0].map(function (h) { return String(h).trim().toUpperCase(); });
  var c = function (ad) { return b.indexOf(ad); }, satir = -1;
  for (var i = v.length - 1; i >= 1; i--) if (String(v[i][c('ID')]).trim() === id) { satir = i; break; }
  if (satir < 0) return { hata: 'Bu kayıt HUB\'da bulunamadı; paneli yenileyin.' };
  if (!/^(bekliyor|beklet)$/i.test(String(v[satir][c('DURUM')]).trim())) return { hata: 'Bu kayda zaten karar verilmiş; paneli yenileyin.' };
  var tip = String(v[satir][c('TIP')]).trim();
  if (tip === 'soru' && karar === 'onaylandi' && !not) return { hata: 'Soruya cevabını yaz.' };
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm'), yaz = function (ad, deger) { var k = c(ad); if (k >= 0) sh.getRange(satir + 1, k + 1).setValue(deger); };
  yaz('DURUM', karar); yaz('SAHIP_NOTU', not); yaz('KARAR_ZAMANI', damga); yaz('ISLENDI', 'FALSE'); yaz('GUNCELLEME', damga);
  var ozet = { onaylandi: tip === 'soru' ? 'cevaplandı' : 'onaylandı', reddedildi: 'reddedildi', beklet: 'bekletildi' }[karar];
  return { tamam: true, id: id, ozet: id + ' ' + ozet + '. Departman bir sonraki çalışmasında işleyecek.' };
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




/* ---------------- Müşteri ilişkileri: Trendyol puanı, iadeler, yorum cevapları ----------------
 * Kaynak: Trendyol Yorumlar tablosu (trendyol-veri-cekme projesinin ürettiği sekmeler). Yalnız okunur.
 *   Puan_Siparis  gün × mağaza: Trendyol puanı, değişim, 90 günlük hesap, Trendyol sipariş adedi
 *   Puan_Tahmin   yarın için tahmin (en son kayıt)
 *   Iadeler       son 60 gün
 *   Yorum_Cevap   onay bekleyen taslaklar + son gönderilenler
 */
var TY_DEGERLENDIRME = 'Degerlendirmeler';
function musteri_() {
  var ss = SpreadsheetApp.openById(KAYNAK.yorum.id), bugun = isGunu_(simdi_());
  var out = { bugun: bugun, puan: [], tahmin: [], iade: [], yorumBekleyen: [], yorumSon: [], dusukYorum: [] };
  var bos = function (v) { return v === '' || v === null || v === undefined; };
  var num = function (v) { return bos(v) ? null : sayi_(v); };
  var k = function (t, ad) { return kolon_(t.b, [ad]); };

  var t = satirlar_(ss, 'Puan_Siparis'), bas = gunEkle_(bugun, -29);
  if (t.r.length) {
    var c = { g: k(t, 'Tarih'), m: k(t, 'Mağaza'), ty: k(t, 'TY Puanı'), d: k(t, 'Değişim'), h: k(t, 'Hesap 90g'),
              s: k(t, 'TY Sipariş'), n: k(t, 'Normal (4 hafta aynı gün)') };
    t.r.forEach(function (r) {
      var g = gunStr_(r[c.g]); if (!g || g < bas) return;
      out.puan.push({ gun: g, magaza: String(r[c.m]), ty: num(r[c.ty]), degisim: num(r[c.d]), hesap: num(r[c.h]),
                      siparis: num(r[c.s]) || 0, normal: num(r[c.n]) });
    });
  }

  // 1 yıldızlı değerlendirmeler (ortalama 2'nin altı), son 30 gün — grafikte kırmızı nokta
  t = satirlar_(ss, TY_DEGERLENDIRME);
  if (t.r.length) {
    c = { t: k(t, 'Değerlendirme Tarihi'), m: k(t, 'Mağaza'), o: k(t, 'Ortalama'), y: k(t, 'Yorum'), u: k(t, 'Ürünler') };
    t.r.forEach(function (r) {
      var g = gunStr_(r[c.t]), o = num(r[c.o]); if (!g || g < bas || o === null || o >= 2) return;
      out.dusukYorum.push({ gun: g, magaza: String(r[c.m]), puan: o, yorum: String(r[c.y] || '').slice(0, 200), urunler: String(r[c.u] || '').slice(0, 100) });
    });
  }

  t = satirlar_(ss, 'Puan_Tahmin');
  if (t.r.length) {
    c = { g: k(t, 'Hedef Tarih'), m: k(t, 'Mağaza'), y: k(t, 'Yarın Tahmini'), dA: k(t, 'Düşecek Yorum'), dO: k(t, 'Düşecek Ort.'),
          hb: k(t, 'Sonraki Basamak'), gr: k(t, 'Gereken 5★') };
    var son = {};
    t.r.forEach(function (r) {
      var g = gunStr_(r[c.g]), m = String(r[c.m]); if (!g || !m) return;
      if (!son[m] || son[m].gun <= g) son[m] = { gun: g, magaza: m, yarin: num(r[c.y]), dusen: num(r[c.dA]) || 0, dusenOrt: num(r[c.dO]),
                                                 hedef: num(r[c.hb]), gereken: num(r[c.gr]) };
    });
    out.tahmin = Object.keys(son).map(function (m) { return son[m]; });
  }

  t = satirlar_(ss, 'Iadeler'); bas = gunEkle_(bugun, -59);
  if (t.r.length) {
    c = { o: k(t, 'Oluşma'), sk: k(t, 'Son Karar Saati'), m: k(t, 'Mağaza'), no: k(t, 'Sipariş No'), d: k(t, 'Durum'), sb: k(t, 'Sebep'),
          nt: k(t, 'Müşteri Notu'), tl: k(t, 'Tutar'), ku: k(t, 'Kurye'), ur: k(t, 'Ürünler'), on: k(t, 'Ön Değerlendirme'),
          so: k(t, 'Sorumlu'), ks: k(t, 'Kesinti Durumu'), id: k(t, 'Claim Item ID'), is: k(t, 'İşlem'), isd: k(t, 'İşlem Durumu'),
          kd: k(t, 'Kuryeden Düş'), dt: k(t, 'Düşülecek TL') };
    t.r.forEach(function (r) {
      var ms = zaman_(r[c.o]); if (ms === null) return;
      var g = new Date(ms).toISOString().slice(0, 10); if (g < bas) return;
      var sk = zaman_(r[c.sk]);
      out.iade.push({ zaman: new Date(ms).toISOString().slice(0, 16), gun: g, sonKarar: sk === null ? '' : new Date(sk).toISOString().slice(0, 16),
        magaza: String(r[c.m]), no: String(r[c.no]), durum: String(r[c.d]), sebep: String(r[c.sb]), not: String(r[c.nt] || '').slice(0, 160),
        tutar: num(r[c.tl]) || 0, kurye: c.ku >= 0 ? String(r[c.ku] || '') : '', urunler: c.ur >= 0 ? String(r[c.ur] || '').slice(0, 120) : '',
        oneri: c.on >= 0 ? String(r[c.on] || '').slice(0, 200) : '', sorumlu: c.so >= 0 ? String(r[c.so] || 'Belirsiz') : 'Belirsiz',
        kesinti: c.ks >= 0 ? String(r[c.ks] || '') : '', id: String(r[c.id] || ''),
        islem: c.is >= 0 ? String(r[c.is] || '') : '', islemDurumu: c.isd >= 0 ? String(r[c.isd] || '') : '',
        kuryedenDus: c.kd >= 0 && r[c.kd] === true, dusulecek: c.dt >= 0 ? num(r[c.dt]) : null });
    });
    out.iade.sort(function (a, b) { return a.zaman < b.zaman ? 1 : -1; });
  }

  t = satirlar_(ss, 'Yorum_Cevap');
  if (t.r.length) {
    c = { t: k(t, 'Tarih'), m: k(t, 'Mağaza'), p: k(t, 'Ortalama'), y: k(t, 'Yorum'), ce: k(t, 'Cevap'), tf: k(t, 'Telafi Sözü'),
          on: k(t, 'Onay'), d: k(t, 'Durum'), g: k(t, 'Gönderim'), td: k(t, 'Trendyol Durumu'), rn: k(t, 'Ret Nedeni'),
          id: k(t, 'Review ID') };
    var gonderilen = [];
    t.r.forEach(function (r) {
      var ms = zaman_(r[c.t]), d = String(r[c.d] || '');
      var x = { id: String(r[c.id] || ''), zaman: ms === null ? '' : new Date(ms).toISOString().slice(0, 16), magaza: String(r[c.m]), puan: num(r[c.p]),
                yorum: String(r[c.y] || '').slice(0, 400), cevap: String(r[c.ce] || '').slice(0, 600), telafi: r[c.tf] === true, durum: d };
      if (/^TASLAK/.test(d) && r[c.on] !== true) out.yorumBekleyen.push(x);
      else if (d === 'GÖNDERİLDİ' || /^HATA/.test(d)) {
        var gm = zaman_(r[c.g]);
        x.gonderim = gm === null ? '' : new Date(gm).toISOString().slice(0, 16);
        x.trendyol = String(r[c.td] || ''); x.ret = String(r[c.rn] || '');
        gonderilen.push(x);
      }
    });
    out.yorumSon = gonderilen.sort(function (a, b) { return a.gonderim < b.gonderim ? 1 : -1; }).slice(0, 15);
  }
  return out;
}

/* Panelden iade işlemi: Iadeler sekmesine yalnız istek yazar, Trendyol'a hiçbir şey göndermez.
     sorumlu   → Sorumlu sütunu
     kuryeDus  → Kuryeden Düş = işaretli (+ Düşülecek TL); kesintiyi Trendyol projesi 10 dk içinde Kurye › Kesintiler'e yazar
     kabul/ret → İşlem = "KABUL" / "RET <kod> | not"; Trendyol'a kabul/reddi Trendyol projesi 10 dk içinde BİR KEZ gönderir */
var IADE_RET_KODLARI = [5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5016, 5017];
function iadeIslem_(d) {
  var id = String(d.id || '').trim();
  if (!id) return { hata: 'İade bulunamadı.' };
  var sh = SpreadsheetApp.openById(KAYNAK.yorum.id).getSheetByName('Iadeler');
  if (!sh || sh.getLastRow() < 2) return { hata: 'Iadeler sekmesi bulunamadı.' };
  // Trendyol projesinin henüz eklemediği istek sütunlarını burada ekle (o proje de aynı adla arar, çift olmaz)
  var bas = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(function (x) { return String(x).trim(); });
  var eksik = ['Kuryeden Düş', 'Düşülecek TL', 'Kesinti Durumu', 'Sorumlu', 'İşlem', 'İşlem Durumu'].filter(function (x) { return bas.indexOf(x) < 0; });
  if (eksik.length) { sh.getRange(1, bas.length + 1, 1, eksik.length).setValues([eksik]).setFontWeight('bold'); bas = bas.concat(eksik); }
  var ix = function (ad) { return bas.indexOf(ad); };   // tam ad (kolon_ önek eşleşmesi 'İşlem'i 'İşlem Durumu' ile karıştırabilir)
  var c = { id: ix('Claim Item ID'), du: ix('Durum'), so: ix('Sorumlu'), kd: ix('Kuryeden Düş'), dt: ix('Düşülecek TL'),
            ks: ix('Kesinti Durumu'), is: ix('İşlem'), isd: ix('İşlem Durumu'), ku: ix('Kurye'), tl: ix('Tutar') };
  if (c.id < 0 || c.du < 0) return { hata: "Iadeler'de beklenen başlıklar yok." };
  var lc = bas.length, v = sh.getRange(2, 1, sh.getLastRow() - 1, lc).getValues(), i;
  for (i = 0; i < v.length; i++) if (String(v[i][c.id]) === id) break;
  if (i >= v.length) return { hata: 'İade tabloda bulunamadı; panel verisini yenileyin.' };
  var r = v[i], satir = i + 2, yaz = [], yapilan = [];

  // 1) önce hepsini doğrula — biri hatalıysa hiçbir şey yazılmaz
  if (d.sorumlu) {
    if (['Kurye', 'Mutfak', 'Müşteri/Platform', 'Belirsiz'].indexOf(d.sorumlu) < 0) return { hata: 'Geçersiz sorumlu.' };
    yaz.push([c.so, d.sorumlu]); yapilan.push('sorumlu: ' + d.sorumlu);
  }
  var istek = null;
  if (d.islem === 'kabul' || d.islem === 'ret') {
    if (String(r[c.du]) !== 'WaitingInAction') return { hata: 'Bu iade artık karar beklemiyor (' + r[c.du] + ').' };
    if (String(r[c.is] || '').trim()) return { tamam: true, zatenIstendi: true, yapilan: ['istek zaten var: ' + r[c.is]] };
    if (d.islem === 'kabul') istek = 'KABUL';
    else {
      var kod = Number(d.kod);
      if (IADE_RET_KODLARI.indexOf(kod) < 0) return { hata: 'Ret nedenini seçin.' };
      var not = String(d.not || '').replace(/\s+/g, ' ').trim().slice(0, 400);
      if (!not) return { hata: 'Ret için kısa bir açıklama yazın (Trendyol inceleyecek).' };
      istek = 'RET ' + kod + ' | ' + not;
    }
    yaz.push([c.is, istek], [c.isd, '']); yapilan.push(d.islem === 'kabul' ? 'kabul isteği' : 'ret isteği');
  }
  if (d.kuryeDus) {
    var tl = Math.round(sayi_(d.tl) * 100) / 100;
    if (/^YAZILDI/.test(String(r[c.ks] || ''))) {
      if (!istek) return { hata: 'Bu iade kuryeden zaten düşülmüş.' };   // kabulle birlikte geldiyse kabulü engelleme
    } else {
      if (!String(r[c.ku] || '').trim()) return { hata: 'Bu iadede kurye yok; önce tabloda Kurye sütununu doldurun.' };
      if (!(tl > 0) || tl > Math.max(5000, sayi_(r[c.tl]) * 2)) return { hata: 'Geçerli bir tutar yazın.' };
      yaz.push([c.dt, tl], [c.kd, true]); yapilan.push('kuryeden ' + tl + ' TL');
    }
  }
  if (!yapilan.length) return { hata: 'Yapılacak işlem seçilmedi.' };
  // 2) sonra yaz
  yaz.forEach(function (x) { sh.getRange(satir, x[0] + 1).setValue(x[1]); });
  return { tamam: true, yapilan: yapilan };
}

/* Panelden yorum cevabı onayı: Yorum_Cevap'ta o satırın Cevap metnini (düzeltildiyse) ve Telafi Sözü'nü yazar,
   Onay'ı işaretler. Trendyol'a gönderimi trendyol-veri-cekme projesi (yorumCevapCalistir, 15 dk) BİR KEZ yapar;
   burası Trendyol'a hiçbir şey göndermez. Aynı onay iki kez gelirse zararsızdır. */
function yorumOnay_(d) {
  var id = String(d.id || '').trim(), metin = String(d.cevap || '').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!id) return { hata: 'Yorum bulunamadı.' };
  if (!metin) return { hata: 'Cevap boş olamaz.' };
  if (metin.length > 1000) return { hata: 'Cevap çok uzun (en fazla 1000 karakter).' };
  var sh = SpreadsheetApp.openById(KAYNAK.yorum.id).getSheetByName('Yorum_Cevap');
  if (!sh || sh.getLastRow() < 2) return { hata: 'Yorum_Cevap sekmesi bulunamadı.' };
  var lc = sh.getLastColumn(), b = sh.getRange(1, 1, 1, lc).getDisplayValues()[0];
  var c = { id: kolon_(b, ['Review ID']), ce: kolon_(b, ['Cevap']), tf: kolon_(b, ['Telafi Sözü']), on: kolon_(b, ['Onay']), du: kolon_(b, ['Durum']) };
  if (c.id < 0 || c.ce < 0 || c.on < 0 || c.du < 0) return { hata: "Yorum_Cevap'ta beklenen başlıklar yok (Review ID, Cevap, Onay, Durum)." };
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, lc).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][c.id]) !== id) continue;
    var satir = i + 2, durum = String(v[i][c.du] || '').trim();
    if (v[i][c.on] === true) return { tamam: true, zatenOnayli: true, durum: durum };
    if (!(durum === '' || durum.indexOf('TASLAK') === 0)) return { hata: 'Bu cevap artık onaylanamaz (durum: ' + durum + ').' };
    if (String(v[i][c.ce]) !== metin) sh.getRange(satir, c.ce + 1).setValue(metin);
    if (c.tf >= 0) sh.getRange(satir, c.tf + 1).setValue(d.telafi === true || d.telafi === '1');
    sh.getRange(satir, c.on + 1).setValue(true);
    return { tamam: true };
  }
  return { hata: 'Yorum tabloda bulunamadı; panel verisini yenileyin.' };
}

/* ---------------- Genel bilgiler (BAP GENEL BİLGİLER: menü, şubeler, bölgeler, ödeme) ---------------- */
var GENEL_PORTAL_URL = 'https://bap-genel-bilgiler.mertharman.workers.dev/';

/* ---------------- Pluxee haftalık fatura ----------------
 * Sahibin kuralı: her Cuma 23:55'te kesilir. Pluxee ayın ilk 6 günü fatura kestirmediği için o günlere denk gelen Cuma atlanır.
 * Ayrıca ayın son günü 23:55'te kesilir (son gün Cuma ise tek fatura). Plan: 3 günde al.
 * Akış (kurye dosyası › 'Pluxee Fatura' sekmesi, her fatura günü bir satır):
 *   1) Sahip panelden (Finans › Pluxee haftalık fatura) "Onayla" der → satır 'Onaylandı'. ONAY_GEREKIR false ise satırı
 *      saatlik tarama kendisi 'Onaylandı (otomatik)' yazar.
 *   2) MacBook'taki Pluxee programı 23:55'te satırı okur; yalnız 'Onaylandı' ise faturayı keser ve sonucu aynı satıra yazar
 *      (Durum 'Kesildi' / 'Kesilemedi', tutarlar, ödeme tarihi). Ayrıntı: docs/pluxee-fatura.md
 *   3) Fatura günü 21:00'den sonra hâlâ onay yoksa bir kez WhatsApp hatırlatması gider.
 */
// KESEN_HAZIR: MacBook'taki kesim adımı yazılınca true yapılır; o zamana kadar WhatsApp hatırlatması gitmez ("kesilecek" demek yanlış olur).
var PLUXEE_FATURA = { PLAN: '3 günde al', SAAT: '23:55', ONAY_GEREKIR: true, HATIRLAT_SAAT: 21, KESEN_HAZIR: false };
var PLUXEE_FATURA_BASLIK = ['Fatura Günü', 'Durum', 'Plan', 'Onay Zamanı', 'Onaylayan', 'Genel Toplam (TL)', 'KDV Hariç (TL)', 'KDV (TL)',
                            'Ödeme Tarihi', 'Kesim Zamanı', 'KolayBi Faturası', 'Not'];
// Kurye projesindeki Bildirim.gs ile aynı Make webhook'u ("BAP Bildirim - Script WA").
// Not: o senaryo başlığında "Pluxee" geçenleri atlar (MacBook kod bildirimleri); bu yüzden başlıkta "Pluxee" kullanılmaz.
var BILDIRIM_HOOK = 'https://hook.eu1.make.com/vpgqfj34j52xk5szvx79rbse69o3uxs6';

function pluxeeFaturaGunuMu_(gun) {
  var d = new Date(gun + 'T00:00:00Z'), g = d.getUTCDate(), son = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return g === son || (d.getUTCDay() === 5 && g > 6);
}
function pluxeeFaturaGunleri_(bas, n) {
  var l = [], g = bas; for (var i = 0; i < 70 && l.length < n; i++) { if (pluxeeFaturaGunuMu_(g)) l.push(g); g = gunEkle_(g, 1); } return l;
}
function takvimGunu_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function trGun_(gun) { return gun.slice(8, 10) + '.' + gun.slice(5, 7) + '.' + gun.slice(0, 4); }

function pluxeeFaturaSekmesi_(ss) {
  var sh = ss.getSheetByName('Pluxee Fatura');
  if (!sh) { sh = ss.insertSheet('Pluxee Fatura'); sh.appendRow(PLUXEE_FATURA_BASLIK); sh.setFrozenRows(1); sh.getRange(1, 1, 1, PLUXEE_FATURA_BASLIK.length).setFontWeight('bold'); }
  return sh;
}
// Satırlar: { satir, gun: 'yyyy-MM-dd', durum, ... } (başlık adıyla okunur)
function pluxeeFaturaSatirlari_(sh) {
  var lc = sh.getLastColumn(), b = sh.getRange(1, 1, 1, lc).getDisplayValues()[0], out = [];
  if (sh.getLastRow() < 2) return { b: b, l: out };
  sh.getRange(2, 1, sh.getLastRow() - 1, lc).getDisplayValues().forEach(function (r, i) {
    var al = function (h) { var j = kolon_(b, [h]); return j >= 0 ? String(r[j] || '').trim() : ''; };
    var gun = gunStr_(al('Fatura Günü')); if (!gun) return;
    out.push({ satir: i + 2, gun: gun, durum: al('Durum'), plan: al('Plan'), onay: al('Onay Zamanı'), onaylayan: al('Onaylayan'),
      toplam: sayi_(al('Genel Toplam (TL)')), kdvHaric: sayi_(al('KDV Hariç (TL)')), kdv: sayi_(al('KDV (TL)')), odeme: al('Ödeme Tarihi'),
      kesim: al('Kesim Zamanı'), kolaybi: al('KolayBi Faturası'), not: al('Not') });
  });
  return { b: b, l: out };
}

// Panel paketi: takvim, bugünün durumu, son faturalar
function pluxeeFatura_() {
  var ss = SpreadsheetApp.openById(KAYNAK.yemekKarti.id), sh = ss.getSheetByName('Pluxee Fatura'), bugun = takvimGunu_();
  var l = sh ? pluxeeFaturaSatirlari_(sh).l : [], bul = function (g) { return l.filter(function (x) { return x.gun === g; }).pop() || null; };
  var sonraki = pluxeeFaturaGunleri_(bugun, 5);
  return { plan: PLUXEE_FATURA.PLAN, saat: PLUXEE_FATURA.SAAT, onayGerekir: PLUXEE_FATURA.ONAY_GEREKIR, kesenHazir: PLUXEE_FATURA.KESEN_HAZIR, bugun: bugun,
           takvim: sonraki.map(function (g) { var x = bul(g); return { gun: g, durum: x ? x.durum : '' }; }),
           son: l.slice(-8).reverse() };
}

// Panelden: { islem: 'onayla' | 'vazgec', gun: 'yyyy-MM-dd' }. Yalnız önümüzdeki 8 gün içindeki fatura günleri.
function pluxeeFaturaIslem_(d) {
  var gun = String(d.gun || ''), islem = d.islem === 'vazgec' ? 'vazgec' : d.islem === 'onayla' ? 'onayla' : '';
  if (!islem || !/^\d{4}-\d{2}-\d{2}$/.test(gun)) return { hata: 'Geçersiz istek.' };
  var bugun = takvimGunu_();
  if (gun < bugun || gun > gunEkle_(bugun, 8)) return { hata: 'Yalnız önümüzdeki 8 gündeki fatura günü onaylanabilir.' };
  if (!pluxeeFaturaGunuMu_(gun)) return { hata: trGun_(gun) + ' fatura günü değil.' };
  if (gun === bugun && Utilities.formatDate(new Date(), TZ, 'HH:mm') >= PLUXEE_FATURA.SAAT) return { hata: 'Bugünkü fatura saati geçti.' };
  var ss = SpreadsheetApp.openById(KAYNAK.yemekKarti.id), sh = pluxeeFaturaSekmesi_(ss), s = pluxeeFaturaSatirlari_(sh);
  var x = s.l.filter(function (y) { return y.gun === gun; }).pop();
  if (x && /^kesildi/i.test(x.durum)) return { hata: 'Bu fatura zaten kesilmiş.' };
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss'), durum = islem === 'onayla' ? 'Onaylandı' : 'Kesilmeyecek';
  var deger = { 'Fatura Günü': "'" + trGun_(gun), 'Durum': durum, 'Plan': PLUXEE_FATURA.PLAN, 'Onay Zamanı': damga, 'Onaylayan': 'Panel' };
  var satir = x ? x.satir : sh.getLastRow() + 1;
  Object.keys(deger).forEach(function (h) { var j = kolon_(s.b, [h]); if (j >= 0) sh.getRange(satir, j + 1).setValue(deger[h]); });
  try { cevapKaydet_('Finans', 'BAP Yemek Kartı Tahsilatları › Pluxee Fatura', satir, 'Pluxee haftalık fatura ' + trGun_(gun), durum, damga.slice(0, 16)); } catch (err) { }
  return { tamam: true, gun: gun, durum: durum };
}

// Saatlik taramadan çağrılır: onay gerekmiyorsa fatura günü satırı açar; gerekiyorsa 21:00'den sonra bir kez hatırlatır.
function pluxeeFaturaTara_() {
  if (!PLUXEE_FATURA.KESEN_HAZIR) return;
  var bugun = takvimGunu_(); if (!pluxeeFaturaGunuMu_(bugun)) return;
  var saat = Utilities.formatDate(new Date(), TZ, 'HH:mm'); if (saat >= PLUXEE_FATURA.SAAT) return;
  var ss = SpreadsheetApp.openById(KAYNAK.yemekKarti.id), sh = ss.getSheetByName('Pluxee Fatura');
  var x = sh ? pluxeeFaturaSatirlari_(sh).l.filter(function (y) { return y.gun === bugun; }).pop() : null;
  if (x && x.durum) return; // onaylandı / kesilmeyecek / kesildi
  if (!PLUXEE_FATURA.ONAY_GEREKIR) {
    sh = pluxeeFaturaSekmesi_(ss); var b = pluxeeFaturaSatirlari_(sh).b, satir = sh.getLastRow() + 1;
    var deger = { 'Fatura Günü': "'" + trGun_(bugun), 'Durum': 'Onaylandı', 'Plan': PLUXEE_FATURA.PLAN,
                  'Onay Zamanı': Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss'), 'Onaylayan': 'Otomatik' };
    Object.keys(deger).forEach(function (h) { var j = kolon_(b, [h]); if (j >= 0) sh.getRange(satir, j + 1).setValue(deger[h]); });
    return;
  }
  if (+saat.slice(0, 2) < PLUXEE_FATURA.HATIRLAT_SAAT) return;
  var p = PropertiesService.getScriptProperties(), k = 'PLX_FATURA_HATIRLATMA_' + bugun; if (p.getProperty(k)) return;
  p.setProperty(k, '1'); // önce işaretle: POST tekrar denenmez, çift mesaj gitmesin
  UrlFetchApp.fetch(BILDIRIM_HOOK, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ tip: 'finans', baslik: 'Haftalık yemek kartı faturası onay bekliyor',
      mesaj: 'Bu gece ' + PLUXEE_FATURA.SAAT + "'te Pluxee faturası (" + PLUXEE_FATURA.PLAN + ') kesilecek. Onay yoksa kesilmez. Panel › Finans › Pluxee haftalık fatura',
      zaman: Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm') }) });
}

/* ---------------- Yemek kartları: iki taraflı kontrol (panel › Yemek Kartları) ----------------
 * Son YK_KONTROL_GUN iş günü, kart kart:
 *   Sipariş tarafı: Adisyo'da yemek kartıyla kapanan siparişler (online platform yemek kartı dahil) + kuryede hâlâ açık yemek kartı hesapları.
 *   Çekim tarafı : BAP Yemek Kartı Tahsilatları (Pluxee, Edenred, Paye İşlemler, SetCard).
 *   1) aynı tutar, zaman penceresinde → eşleşti
 *   2) kalan sipariş için daha az tutarlı çekim → 'eksik' (parçalı ödeme olabilir: kalanı nakit / kredi kartı / başka kart)
 *      ya da biraz fazla (en çok 100 TL) → 'fazla' (bahşiş ya da yanlış tutar)
 *   3) eşleşmeyen sipariş → "çekimi yok", eşleşmeyen çekim → "siparişi yok"
 * Online ödeme (SetCard 'Trendyol Pos') yalnız online siparişle, kapıda ödeme (Mobil Pos, kurye terminali) yalnız kapıda siparişle eşleşir.
 * Çekim verisi henüz gelmemiş saatler "bekliyor" sayılır, açıkta gösterilmez. Hiçbir şey yazmaz.
 */
var YK_KONTROL_GUN = 7;
function ykKartAd_(odeme) { var k = yemekKartAdi_(odeme); return k === 'Setcard' ? 'SetCard' : k; }

function ykKontrol_() {
  var bugun = isGunu_(simdi_()), bas = gunEkle_(bugun, -(YK_KONTROL_GUN - 1)), DK = 60000;
  var ks = SpreadsheetApp.openById(KAYNAK.kurye.id), sip = [];
  // 1) Adisyo: yemek kartıyla kapanan siparişler
  var sv = siparisVerisi_(gunEkle_(bas, -1)), c = sv.c;
  sv.rows.forEach(function (r) {
    var ms = zaman_(r[c.tarih]); if (ms === null || isGunu_(ms) < bas || norm_(r[c.durum]) !== 'kapali' || c.odeme < 0) return;
    var od = fisOdeme_(r[c.odeme], c.tahsil >= 0 ? r[c.tahsil] : ''); if (od !== 'yemek' && od !== 'onlineKart') return;
    var online = od === 'onlineKart';
    sip.push({ kart: ykKartAd_(r[c.odeme]), online: online, ms: ms, lo: ms - (online ? 15 : 30) * DK, hi: ms + (online ? 90 : 300) * DK,
      tutar: sayi_(r[c.tutar]), id: String(c.id >= 0 ? r[c.id] : ''), kanal: String(c.kanal >= 0 ? r[c.kanal] : '').trim(), sube: String(c.sube >= 0 ? r[c.sube] : '').trim(), odeme: String(r[c.odeme] || '').trim(), kaynak: 'Adisyo' });
  });
  // 2) Kuryede hâlâ açık yemek kartı hesapları (Adisyo'da 'Açık Hesap' görünür; kart adı kurye sisteminde)
  try {
    acikListe_(ks, tahsilatlar_(ks), bugun, {}, null).liste.forEach(function (x) {
      if (x.gun < bas || fisOdeme_(x.odeme, '') !== 'yemek') return;
      var rf = kartRef_(x.gun, x.teslim, null), kart = ykKartAd_(x.odeme), ms = rf ? rf.ms : Date.parse(x.gun + 'T12:00:00Z');
      // Adisyo'da aynı sipariş zaten kartla kapanmışsa ikinci kez sayılmaz
      if (sip.some(function (o) { return o.kart === kart && Math.abs(o.tutar - x.tutar) < 0.5 && Math.abs(o.ms - ms) <= 120 * DK; })) return;
      sip.push({ kart: kart, online: false, ms: ms, lo: rf ? ms - 120 * DK : null, hi: rf ? ms + 120 * DK : null, saatYok: !rf,
        tutar: x.tutar, id: x.id, no: x.no, kurye: x.kurye, odeme: x.odeme, kaynak: 'Kurye açık hesap' });
    });
  } catch (err) { }

  var oge = function (o) { return { zaman: o.saatYok ? kartTam_(o.ms).slice(0, 5) : kartTam_(o.ms), tutar: o.tutar, kaynak: o.kaynak, kanal: o.kanal || '', id: o.id || '', no: o.no || '',
    kurye: o.kurye || '', odeme: o.odeme || '', online: !!o.online }; };
  var cekOge = function (y) { return { zaman: y.tam, tutar: y.tutar, online: !!y.online, kurye: y.kurye || '', terminal: y.terminal || '' }; };
  var out = { bas: bas, gun: YK_KONTROL_GUN, kartlar: [] }, okundu = {};

  KART_KAYNAKLARI.forEach(function (kk) {
    var veri; try { veri = (kk.tumu || kk.oku)(ks); } catch (err) { veri = { hata: String(err.message || err) }; }
    var O = sip.filter(function (o) { return o.kart === kk.ad; }).sort(function (p, q) { return p.ms - q.ms; });
    okundu[kk.ad] = 1;
    var k = { ad: kk.ad, siparis: O.length, cekim: 0, eslesen: 0, bekleyen: 0, onlineAyri: 0, parcali: [], cekimsiz: [], siparissiz: [], son: null };
    out.kartlar.push(k);
    if (!veri) { k.hata = 'Çekim sekmesi yok ya da boş'; return; }
    if (veri.hata) { k.hata = veri.hata; return; }
    k.son = veri.son === null ? null : kartTam_(veri.son);
    var onlineVar = veri.cekim.some(function (y) { return y.online; });
    var C = veri.cekim.filter(function (y) { return isGunu_(y.ms) >= bas; }).map(function (y) { return { y: y, kul: false }; });
    k.cekim = C.length;
    // Çekim verisinin başladığı andan önceki siparişler de "bekliyor" sayılır (kart verisi sonradan bağlandıysa yanlış alarm olmasın)
    var ilk = null; veri.cekim.forEach(function (y) { if (!y.saatYok && (ilk === null || y.ms < ilk)) ilk = y.ms; });
    var kapsar = function (o) { if (veri.gunler) return !!veri.gunler[isGunu_(o.ms)];
      return veri.son !== null && veri.son >= (o.hi || o.ms) && ilk !== null && (o.lo === null || o.lo === undefined ? o.ms : o.lo) >= ilk - 6 * 3600000; };
    var uyar = function (o, y) {
      if (!!y.online !== !!o.online) return false;
      if (o.saatYok || y.saatYok || o.lo === null) return isGunu_(y.ms) === isGunu_(o.ms);
      return y.ms >= o.lo && y.ms <= o.hi;
    };
    var enYakin = function (o, f) { var b = null; C.forEach(function (x) { if (x.kul || !uyar(o, x.y) || !f(x.y)) return;
      if (!b || Math.abs(x.y.ms - o.ms) < Math.abs(b.y.ms - o.ms)) b = x; }); return b; };
    var kalan = [];
    O.forEach(function (o) {
      if (o.online && !onlineVar) { k.onlineAyri++; return; }   // bu kartın online ödemeleri terminal verisinde görünmüyor
      var b = enYakin(o, function (y) { return Math.abs(y.tutar - o.tutar) < 0.5; });
      if (b) { b.kul = true; k.eslesen++; return; }
      kalan.push(o);
    });
    kalan.forEach(function (o) {
      var b = enYakin(o, function (y) { return y.tutar < o.tutar - 0.5 || (y.tutar > o.tutar + 0.5 && y.tutar <= o.tutar + 100); });
      if (b) { b.kul = true; var fark = Math.round((b.y.tutar - o.tutar) * 100) / 100;
        k.parcali.push({ tip: fark < 0 ? 'eksik' : 'fazla', fark: fark, siparis: oge(o), cekim: cekOge(b.y) }); return; }
      if (!kapsar(o)) { k.bekleyen++; return; }
      k.cekimsiz.push(oge(o));
    });
    C.forEach(function (x) { if (!x.kul) k.siparissiz.push(cekOge(x.y)); });
    k.cekimsiz = k.cekimsiz.slice(-60).reverse(); k.siparissiz = k.siparissiz.slice(-60).reverse(); k.parcali = k.parcali.slice(-60).reverse();
  });
  // Çekim verisi sisteme gelmeyen kartlar (Multinet, Metropol …): yalnız sipariş sayısı
  var diger = {}; sip.forEach(function (o) { if (okundu[o.kart]) return; var d = diger[o.kart] = diger[o.kart] || { ad: o.kart, siparis: 0, tutar: 0 }; d.siparis++; d.tutar += o.tutar; });
  out.verisiz = Object.keys(diger).map(function (x) { diger[x].tutar = Math.round(diger[x].tutar); return diger[x]; });
  return out;
}

/* ---------------- SetCard faturası (panel › Yemek Kartları) ----------------
 * 'SetCard Fatura' sekmesini BAP Yemek Kartı projesi saatte bir SetCard › Fatura Takibi'nden tazeler.
 * Mali fatura ayrıca işaretlenmez: KolayBi satış faturalarında (Kolaybi Fatura Ham Veri › Satis_Faturalari) aranır —
 * müşteri SETCARD, aynı tutar, SetCard fatura tarihinden en çok 3 gün önce / 20 gün sonra. Her KolayBi faturası bir kez kullanılır.
 * Buradan çıkanlar: kesilip KolayBi'de mali faturası olmayan (kesilmeli), SetCard'ın ödediği ama KolayBi'de tahsil işlenmemiş.
 * Panelden: islem 'kes' → BAP Yemek Kartı web uygulaması keser (sitedeki "Fatura Kes" ile aynı).
 */
var YK_WEB = 'https://script.google.com/macros/s/AKfycbx9fcm_VBi6Ug-d1Uf9z-6Yao0AzIePIhasKN_Vv9A6yuBnqR4ZDPvSX_ho9JF-jC1OKA/exec';  // projeler.json › bap-yemek-karti
var YK_ANAHTAR = '9da1e5281cabba3ab4e9ea49';   // BAP Yemek Kartı › Ortak.gs KOPRU_ANAHTAR

function setcardFaturaSatirlari_(sh) {
  var lc = sh.getLastColumn(), b = sh.getRange(1, 1, 1, lc).getDisplayValues()[0], l = [];
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, lc).getDisplayValues().forEach(function (r, i) {
    var al = function (h) { var j = kolon_(b, [h]); return j >= 0 ? String(r[j] || '').trim() : ''; };
    var no = al('Takip No').replace(/^'/, ''); if (!no) return;
    l.push({ satir: i + 2, takipNo: no, tarih: al('Fatura Tarihi'), tutar: sayi_(al('Tutar (TL)')), durum: al('Durum'), odeme: al('Ödeme Tarihi'),
      kontrol: al('Son Kontrol'), kesim: al('Kesim Zamanı') });
  });
  return { b: b, l: l };
}
// KolayBi satış faturaları, müşteri adına göre: [{ no, ms, tutar, odendi, kalan }]
function kolaybiSatis_(musteriRe) {
  var sf = satirlar_(SpreadsheetApp.openById(KAYNAK.fatura.id), 'Satis_Faturalari'), out = [], gor = {};
  var c = { id: kolon_(sf.b, ['Fatura_ID']), no: kolon_(sf.b, ['Fatura_No']), t: kolon_(sf.b, ['Tarih']), m: kolon_(sf.b, ['Musteri']), tu: kolon_(sf.b, ['Tutar']),
            k: kolon_(sf.b, ['Kalan']), d: kolon_(sf.b, ['Odeme_Durumu']) };
  if (c.m < 0 || c.tu < 0 || c.t < 0) return out;
  sf.r.forEach(function (r) {
    var id = String(c.id >= 0 ? r[c.id] : '') ; if (id) { if (gor[id]) return; gor[id] = 1; }
    if (!musteriRe.test(norm_(r[c.m]))) return;
    var ms = zaman_(r[c.t]); if (ms === null) return;
    var kalan = c.k >= 0 ? sayi_(r[c.k]) : null;
    out.push({ no: String(c.no >= 0 ? r[c.no] : '').trim(), ms: ms, tutar: sayi_(r[c.tu]), kalan: kalan, odendi: /^paid$/i.test(String(c.d >= 0 ? r[c.d] : '')) || (kalan !== null && kalan < 0.5) });
  });
  return out;
}
// Sahibin kuralı (06.10.2026): SetCard faturası her Cuma kesilir; ayın 10'undan sonra kesilebilir (11'i ve sonrası);
// ayda en çok 4 fatura; ayın son günü mutlaka kesilir. Şimdilik sahibi keser, panel o gün uyarır (sonra program kesecek).
var SETCARD_FATURA = { ILK_GUN: 11, AYLIK_HAK: 4 };
function setcardFaturaGunuMu_(gun) {
  var d = new Date(gun + 'T00:00:00Z'), g = d.getUTCDate(), son = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return g === son || (d.getUTCDay() === 5 && g >= SETCARD_FATURA.ILK_GUN);
}
function setcardFatura_() {
  var sh = SpreadsheetApp.openById(KAYNAK.yemekKarti.id).getSheetByName('SetCard Fatura'); if (!sh) return null;
  var l = setcardFaturaSatirlari_(sh).l.sort(function (p, q) { return String(q.tarih).localeCompare(String(p.tarih)) || (+q.takipNo) - (+p.takipNo); });
  var bugun = takvimGunu_(), ay = bugun.slice(0, 7), sonGun = new Date(Date.UTC(+bugun.slice(0, 4), +bugun.slice(5, 7), 0)).toISOString().slice(0, 10);
  // Bu ay kesilen: fatura tarihi bu ay olan ve "Kesilmedi" olmayan (SetCard'ın biriken bakiye satırı sayılmaz)
  var buAy = l.filter(function (x) { return String(x.tarih).slice(0, 7) === ay && !/kesilmedi/i.test(x.durum); }).length;
  var takvim = [], g = bugun; for (var i = 0; i < 45 && takvim.length < 4; i++) { if (setcardFaturaGunuMu_(g)) takvim.push(g); g = gunEkle_(g, 1); }
  var kb = []; try { kb = kolaybiSatis_(/setcard/); } catch (err) { }
  var kul = {}, GUN = 86400000;
  // eskiden yeniye eşleştir: aynı tutarda iki fatura varsa sırayla
  l.slice().reverse().forEach(function (x) {
    if (/kesilmedi/i.test(x.durum)) return;
    var ms = zaman_(x.tarih); if (ms === null) return;
    var b = null; kb.forEach(function (f, i) { if (kul[i] || Math.abs(f.tutar - x.tutar) > 1 || f.ms < ms - 3 * GUN || f.ms > ms + 20 * GUN) return;
      if (!b || Math.abs(f.ms - ms) < Math.abs(b.f.ms - ms)) b = { f: f, i: i }; });
    if (!b) return; kul[b.i] = 1;
    x.kolaybi = { no: b.f.no, tarih: kartTam_(b.f.ms).slice(0, 5) + '.' + new Date(b.f.ms).getUTCFullYear(), odendi: b.f.odendi, kalan: b.f.kalan };
  });
  return { liste: l.slice(0, 12), kontrol: l.length ? l[0].kontrol : '', kolaybiOkundu: kb.length > 0,
           kural: { bugun: bugun, faturaGunu: setcardFaturaGunuMu_(bugun), sonGun: bugun === sonGun, buAy: buAy, hak: SETCARD_FATURA.AYLIK_HAK, ilkGun: SETCARD_FATURA.ILK_GUN, takvim: takvim } };
}
function setcardFaturaIslem_(d) {
  var no = String(d.takipNo || '').replace(/\D/g, ''); if (!no) return { hata: 'Takip numarası yok.' };
  if (d.islem !== 'kes') return { hata: 'Geçersiz işlem.' };
  var ss = SpreadsheetApp.openById(KAYNAK.yemekKarti.id), sh = ss.getSheetByName('SetCard Fatura'); if (!sh) return { hata: "'SetCard Fatura' sekmesi yok." };
  var x = setcardFaturaSatirlari_(sh).l.filter(function (y) { return y.takipNo === no; })[0];
  if (!x) return { hata: no + ' numaralı fatura listede yok; panel yenilensin.' };
  if (!/kesilmedi/i.test(x.durum)) return { hata: 'Fatura "' + x.durum + '" durumunda; kesilemez.' };
  // POST tekrar denenmez (çift kesim riski); cevap gelmezse panel "yenileyip kontrol et" der.
  var r = UrlFetchApp.fetch(YK_WEB, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: true,
    payload: JSON.stringify({ anahtar: YK_ANAHTAR, tur: 'setcardFaturaKes', takipNo: no }) });
  var j = null; try { j = JSON.parse(r.getContentText()); } catch (err) { }
  if (!j) return { belirsiz: true, hata: 'BAP Yemek Kartı beklenmeyen cevap verdi; fatura kesilmiş olabilir. Paneli yenileyip kontrol et.' };
  if (j.tamam) try { cevapKaydet_('Finans', 'BAP Yemek Kartı Tahsilatları › SetCard Fatura', x.satir, 'SetCard fatura ' + no + ' (' + x.tutar + ' TL)', 'Kesildi (panel)', Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm')); } catch (err) { }
  return j;
}

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
        var x = ayKisi[r[c.ad]] = ayKisi[r[c.ad]] || { ad: r[c.ad], gun: 0, dk: 0, fazlaDk: 0, eksikDk: 0, gec: 0, izin: 0, yi: 0, rap: 0, ui: 0, dev: 0, offCalisma: 0 };
        // İzinli satırlarda (yıllık/ücretsiz izin, rapor, devamsızlık) sistem toplam yazabiliyor (ör. 10:00); çalışılmış sayılmaz.
        var izinliSatir = ['yi', 'rap', 'ui', 'dev'].some(function (z) { return c[z] >= 0 && String(r[c[z]]).trim(); });
        var t = sureDk_(r[c.top]); if (t > 0 && !izinliSatir) { x.gun++; x.dk += t; }
        var f = sureDk_(r[c.faz]); if (f > 0) x.fazlaDk += f; else if (f < 0) x.eksikDk += -f;
        if (/geç girildi/i.test(r[c.ga] || '')) x.gec++;
        [c.yi, c.rap, c.ui, c.dev].forEach(function (i) { if (i >= 0 && String(r[i]).trim()) x.izin++; });
        ['yi', 'rap', 'ui', 'dev'].forEach(function (z) { if (c[z] >= 0 && String(r[c[z]]).trim()) x[z]++; });
        if (c.off >= 0 && String(r[c.off]).trim() && t > 0 && !izinliSatir) x.offCalisma++;
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
  // Kişi-ay planlanan süre (Vardiya sekmesinden): { 'YYYY-MM': { normAd: { sn, gun, off } } } — bu ay ve geçen ay, bugüne kadar ve ay sonuna kadar
  try {
    var pctx = { ss: ss, vardiya: null }; puVardiya_(pctx, '', '');
    var puPlan = {}, gecAy = gunEkle_(ay + '-01', -1).slice(0, 7);
    Object.keys(pctx.vardiya).forEach(function (key) {
      var i = key.lastIndexOf('|'), k = key.slice(0, i), g = key.slice(i + 1), m = g.slice(0, 7); if (m !== ay && m !== gecAy) return;
      var x = ((puPlan[m] = puPlan[m] || {})[k] = puPlan[m][k] || { sn: 0, gun: 0, off: 0, snBugune: 0, gunBugune: 0, offBugune: 0 }), v = pctx.vardiya[key];
      if (v.off) { x.off++; if (g <= bugun) x.offBugune++; } else if (v.sn) { x.sn += v.sn; x.gun++; if (g <= bugun) { x.snBugune += v.sn; x.gunBugune++; } }
    });
    out.puPlan = puPlan;
  } catch (err) { out.puPlan = null; }
  out.bugunKayit = bugunListe;
  out.plan = planli;
  out.vardiya = vardiyaPlani_(ss, bugun, out.bilgiler);
  out.ay = { ay: ay, kisiler: Object.keys(ayKisi).map(function (k) { var x = ayKisi[k]; x.saat = Math.round(x.dk / 6) / 10; x.normalDk = Math.max(0, x.dk - x.fazlaDk); x.toplamDk = x.dk; delete x.dk; return x; })
    .sort(function (a, b) { return b.saat - a.saat; }) };

  // Maaş ödemeleri (yalnız ay toplamı ve kişi sayısı)
  // Maaş ödemeleri: son 12 ay (Odemeler + eski maaş ödemeleri sekmesi), kaydı olmayan ay da listede
  var odK = odemeKayitlari_(ss), odAy = {}, son12 = [];
  for (var mi = 11, m = ay; mi >= 0; mi--) { m = ay; for (var z = 0; z < mi; z++) m = gunEkle_(m + '-01', -1).slice(0, 7); son12.push(m); }
  odK.liste.forEach(function (o) { var x = odAy[o.ay] = odAy[o.ay] || { ay: o.ay, tutar: 0, kisiler: {}, kaynak: {} }; x.tutar += o.tutar; x.kisiler[o.k] = 1; x.kaynak[o.kaynak] = 1; });
  out.odemeler = son12.map(function (k) { var x = odAy[k]; return x ? { ay: k, tutar: Math.round(x.tutar), kisi: Object.keys(x.kisiler).length, kaynak: Object.keys(x.kaynak).join(', ') } : { ay: k, tutar: 0, kisi: 0, kaynak: '' }; });
  out.odemeKaynak = { eskiSekme: odK.eskiSekme, eskiSatir: odK.eskiSatir, okunamayan: odK.okunamayan };

  // Bordro: bu ay ve geçen ay ayrıntılı, son 6 ay özet (sahibin onayladığı kural; IBAN, şifre, telefon gönderilmez)
  var bv = bordroVeri_(ss), gecenAy = gunEkle_(ay + '-01', -1).slice(0, 7);
  // Vardiya maliyeti için kişi başı maaş ve SGK (aynı isimle birden fazla satırda aktif / en son maaşlı kayıt)
  out.ucret = { sgkIsveren: SGK_ISVEREN, fazlaBolen: FAZLA_BOLEN, kisi: {} };
  bv.personel.forEach(function (p) { if (!(p.maas > 0)) return; var o = out.ucret.kisi[p.k]; if (o && o.aktif && !p.aktif) return;
    out.ucret.kisi[p.k] = { maas: Math.round(p.maas), sgk: p.sgk, aktif: p.aktif, giris: p.giris, cikis: p.cikis }; });
  var bAylar = [ay]; for (var bi = 1; bi < BORDRO_AY_SAYISI; bi++) bAylar.push(gunEkle_(bAylar[bi - 1] + '-01', -1).slice(0, 7));
  out.bordro = bAylar.map(function (a) { return bordro_(bv, a, bugun, planli); }); // [0] bu ay, [1] geçen ay (mahsup önerisi buna bakar)
  // Geçen ayın farkı (ödenen − net hak ediş): mahsup önerisi olarak bu ayın satırına bilgi düşülür
  var gk = {}; (out.bordro[1].kisiler || []).forEach(function (x) { gk[norm_(x.ad)] = x; });
  (out.bordro[0].kisiler || []).forEach(function (x) { var g = gk[norm_(x.ad)]; if (g && g.odenen) x.gecenAy = { net: g.net, odenen: g.odenen, fark: g.odenen - g.net }; });
  // Çalışma özetine SGK durumu ve bu ayın işveren SGK primi (kıst) eklenir
  var bk = {}; (out.bordro[0].kisiler || []).forEach(function (x) { bk[norm_(x.ad)] = x; });
  out.ay.kisiler.forEach(function (x) { var b = bk[norm_(x.ad)]; x.sgk = b ? b.sgk : null; x.sgkPrim = b ? b.sgkPrim : 0; });
  out.bordroTrend = [];
  for (var t = 5; t >= 0; t--) {
    var m = ay; for (var z = 0; z < t; z++) m = gunEkle_(m + '-01', -1).slice(0, 7);
    if (!bv.aylar[m] && !bv.eski[m]) continue; // ne puantajı ne eski fazla mesai kaydı olan ay hesaplanmaz
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
var BORDRO_AY_SAYISI = 4;
// GEÇİCİ: bordroda IBAN ve banka hesap adı açık gösterilir (maaş ödemesi için). Ödemeler bitince false yapın.
var IBAN_GOSTER = true;   // bordro sekmesinde ayrıntılı gösterilen ay sayısı (bu ay dahil)
var ASGARI_NET = 28075.5;     // 2026 net asgari ücret (SGK'lı personelin bankadan ödenen kısmı)
var SGK_ISVEREN = 7845;      // kişi başı aylık SGK işveren payı
var FAZLA_BOLEN = 10;        // saatlik = günlük / 10

var AVANS_SEKME = 'Avans_Masraf';
var AVANS_BASLIK = ['Tarih', 'Personel', 'Tür', 'Kalem', 'Tutar (TL)', 'Açıklama', 'Durum', 'Kayıt Zamanı', 'Kaynak'];

// Panelden avans (personele verilen, hakedişten düşer) ya da masraf (personelin cebinden ödediği, hakedişe eklenir) girişi.
// { personel, avansTur: 'Avans'|'Masraf', kalem, tutar, tarih: 'YYYY-MM-DD', aciklama, onay }. Yalnız yeni satır ekler.
function avansGir_(d) {
  var tur = d.avansTur === 'Masraf' ? 'Masraf' : d.avansTur === 'Avans' ? 'Avans' : d.avansTur === 'Mahsup' ? 'Mahsup' : '';
  var tutar = sayi_(d.tutar), ad = String(d.personel || '').trim(), kalem = String(d.kalem || '').trim().slice(0, 40), acik = String(d.aciklama || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!tur) return { hata: 'Tür seçin (avans ya da masraf).' };
  if (!ad) return { hata: 'Personel seçin.' };
  if (!(tutar > 0) || tutar > 200000) return { hata: 'Geçerli bir tutar yazın.' };
  // Mahsup işaretli yazılır: geçen ay eksik ödendiyse (+) bu ay eklenir, fazla ödendiyse (−) düşülür.
  if (tur === 'Mahsup') { if (!/eksik|fazla/i.test(kalem)) return { hata: 'Mahsubun yönünü seçin (eksik ödeme + / fazla ödeme −).' }; if (/fazla/i.test(kalem)) tutar = -tutar; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.tarih || ''))) return { hata: 'Tarih seçin.' };
  var ss = SpreadsheetApp.openById(KAYNAK.personel.id), ps = ss.getSheetByName('Personel');
  var var_ = ps ? ps.getDataRange().getDisplayValues() : [[]], cA = kolon_(var_[0], ['İsim Soyisim']);
  var gercekAd = null; var_.slice(1).forEach(function (r) { if (!gercekAd && norm_(r[cA]) === norm_(ad)) gercekAd = String(r[cA]).trim(); });
  if (!gercekAd) return { hata: 'Bu isim Personel listesinde yok.' };
  var tarih = d.tarih.slice(8, 10) + '.' + d.tarih.slice(5, 7) + '.' + d.tarih.slice(0, 4);
  var sh = ss.getSheetByName(AVANS_SEKME);
  if (!sh) { sh = ss.insertSheet(AVANS_SEKME); sh.appendRow(AVANS_BASLIK); sh.setFrozenRows(1); sh.getRange(1, 1, 1, AVANS_BASLIK.length).setFontWeight('bold'); }
  if (d.onay !== '1' && sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getDisplayValues();
    var ayniAy = tur === 'Mahsup' && v.some(function (r) { return String(r[0]).trim().slice(3) === tarih.slice(3) && norm_(r[1]) === norm_(gercekAd) && String(r[2]).trim() === 'Mahsup'; });
    if (ayniAy) return { onayGerekli: true, mesaj: gercekAd + ' için bu ay zaten bir mahsup kaydı var. Yine de eklensin mi?' };
    var ayni = v.some(function (r) { return String(r[0]).trim() === tarih && norm_(r[1]) === norm_(gercekAd) && String(r[2]).trim() === tur && Math.abs(sayi_(r[4]) - tutar) < 0.5; });
    if (ayni) return { onayGerekli: true, mesaj: 'Aynı gün ' + gercekAd + ' için aynı tutarda bir ' + tur.toLowerCase() + ' kaydı zaten var. Yine de eklensin mi?' };
  }
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss');
  sh.appendRow([tarih, gercekAd, tur, kalem || (tur === 'Avans' ? 'Avans' : 'Diğer'), tutar, acik, 'Onaylandı', damga, 'Panel']);
  var turKod = tur === 'Avans' ? 'AVANS_GIRILDI' : tur === 'Masraf' ? 'MASRAF_GIRILDI' : 'MAHSUP_GIRILDI';
  var log = ss.getSheetByName('Islem_Loglari');
  if (log) { log.insertRowAfter(1); log.getRange(2, 1, 1, 5).setValues([[damga, 'Yönetici (panel)', turKod, gercekAd + ' — ' + tarih + ' — ' + tutar + ' TL' + (kalem ? ' (' + kalem + ')' : '') + (acik ? ' — ' + acik : ''), '-']]); }
  try { cevapKaydet_('İnsan Kaynakları', 'BAP Personel › ' + AVANS_SEKME, sh.getLastRow(), gercekAd + ' ' + tur.toLowerCase() + ' girildi', tutar + ' TL ' + (kalem || '') + (acik ? ' — ' + acik : ''), damga.slice(0, 16)); } catch (err) { }
  return { tamam: true, ad: gercekAd, tur: tur, tutar: tutar };
}

/* ---------------- Maaş ödeme kayıtları ----------------
 * Kaynaklar: 'Odemeler' (yönetici panelinden girilen) + eski maaş ödemeleri sekmesi (adında "eski" ve "maaş/ödeme" geçen,
 * ör. 'Eski Maaş Ödemeleri'). Eski sekmede sütun adları esnek: Ay/Dönem/Tarih, Personel/İsim Soyisim/Çalışan, Tutar/Ödenen/Net.
 * Aynı ay Odemeler'de varsa o ay için eski sekme sayılmaz (çift sayım olmasın).
 */
var AY_ADLARI_TR = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
function ayCoz_(v, yilVarsayilan) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM');
  var s = String(v || '').trim(); if (!s) return '';
  var m = s.match(/^(\d{4})[-.\/](\d{1,2})(?:[-.\/]\d{1,2})?/); if (m) return m[1] + '-' + ('0' + m[2]).slice(-2);
  m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/); if (m) return m[3] + '-' + ('0' + m[2]).slice(-2);
  m = s.match(/^(\d{1,2})[.\/-](\d{4})$/); if (m) return m[2] + '-' + ('0' + m[1]).slice(-2);
  var n = norm_(s), yil = (s.match(/(20\d{2})/) || [])[1];
  for (var i = 0; i < 12; i++) if (n.indexOf(AY_ADLARI_TR[i].slice(0, 3)) === 0 || n.indexOf(AY_ADLARI_TR[i]) >= 0) {
    if (!yil) { yil = yilVarsayilan.slice(0, 4); if (('0' + (i + 1)).slice(-2) > yilVarsayilan.slice(5, 7)) yil = String(+yil - 1); }
    return yil + '-' + ('0' + (i + 1)).slice(-2);
  }
  return '';
}
function odemeKayitlari_(ss) {
  var out = { liste: [], eskiSekme: '', eskiSatir: 0, okunamayan: 0 }, buAy = isGunu_(simdi_()).slice(0, 7), yeniAylar = {};
  var os = ss.getSheetByName('Odemeler');
  if (os && os.getLastRow() > 1) { var ov = os.getDataRange().getDisplayValues(), ob = ov[0], oA = kolon_(ob, ['Ay']), oP = kolon_(ob, ['Personel']), oT = kolon_(ob, ['Tutar']);
    ov.slice(1).forEach(function (r) { var a = ayCoz_(r[oA], buAy); if (!a) return; yeniAylar[a] = 1;
      out.liste.push({ ay: a, ad: String(r[oP] || '').trim(), k: norm_(r[oP]), tutar: sayi_(r[oT]), kaynak: 'Odemeler' }); }); }
  var eski = ss.getSheets().filter(function (sh) { var n = norm_(sh.getName()); return n.indexOf('eski') >= 0 && /maas|odeme/.test(n); })[0];
  if (eski && eski.getLastRow() > 1) {
    out.eskiSekme = eski.getName();
    var v = eski.getDataRange().getDisplayValues(), b = v[0];
    var cA = kolon_(b, ['Ay', 'Dönem', 'Ödeme Ayı', 'Maaş Ayı', 'Tarih', 'Ödeme Tarihi']), cP = kolon_(b, ['Personel', 'İsim Soyisim', 'Ad Soyad', 'Çalışan', 'İsim']),
        cT = kolon_(b, ['Tutar', 'Ödenen', 'Ödenen Tutar', 'Net', 'Net Ödeme', 'Toplam', 'Maaş']);
    v.slice(1).forEach(function (r) {
      if (!r.join('').trim()) return;
      var a = cA >= 0 ? ayCoz_(r[cA], buAy) : '', t = cT >= 0 ? sayi_(r[cT]) : 0;
      if (!a || !(t > 0)) { out.okunamayan++; return; }
      if (yeniAylar[a]) return; // bu ay Odemeler'de var
      out.eskiSatir++;
      out.liste.push({ ay: a, ad: cP >= 0 ? String(r[cP] || '').trim() : '', k: cP >= 0 ? norm_(r[cP]) : '', tutar: t, kaynak: 'Eski ödemeler' });
    });
  }
  return out;
}

function bordroIso_(s) { var ms = zaman_(s); return ms === null ? '' : new Date(ms).toISOString().slice(0, 10); }

// Bordro için gereken sekmeleri bir kez okur.
function bordroVeri_(ss) {
  var V = { tatil: {}, pu: {}, aylar: {}, odenen: {}, personel: [], am: {}, eski: {} };
  // QR öncesi aylar: 'Fazla mesailer eski data' sekmesi (gün başına satır; Net Fazla Mesai, İzin Gününde Çalışma, Ay)
  var es = ss.getSheets().filter(function (sh) { var n = norm_(sh.getName()); return n.indexOf('fazlamesai') >= 0 && n.indexOf('eski') >= 0; })[0];
  if (es && es.getLastRow() > 1) { var ev = es.getDataRange().getDisplayValues(), eb = ev[0], buAyE = isGunu_(simdi_()).slice(0, 7);
    var ce = { ad: kolon_(eb, ['İsim Soyisim']), net: kolon_(eb, ['Net Fazla Mesai']), ay: kolon_(eb, ['Ay']), giris: kolon_(eb, ['Mesai Günü İşe Giriş']),
               izin: kolon_(eb, ['İzin Gününde Çalışma']), cal: kolon_(eb, ['Çalışılmayan Gün']), rap: kolon_(eb, ['Rapor']), yi: kolon_(eb, ['Yıllık İzin']) };
    ev.slice(1).forEach(function (r) { var ad = String(r[ce.ad] || '').trim(); if (!ad) return;
      var gun = ce.giris >= 0 ? bordroIso_(r[ce.giris]) : '', m = gun ? gun.slice(0, 7) : (ce.ay >= 0 ? ayCoz_(r[ce.ay], buAyE) : ''); if (!m) return;
      var A = V.eski[m] = V.eski[m] || {}, k = norm_(ad), x = A[k] = A[k] || { ad: ad, uzama: 0, off: 0, offGun: 0, calismayan: 0, rap: 0, yi: 0 };
      var net = sureSn_(r[ce.net]) || 0, offMu = ce.izin >= 0 && String(r[ce.izin]).trim() !== '';
      if (net > 0) { if (offMu) { x.off += net; x.offGun++; } else x.uzama += net; }
      function f(j) { return j >= 0 && String(r[j]).trim() !== ''; }
      if (f(ce.cal)) x.calismayan++; if (f(ce.rap)) x.rap++; if (f(ce.yi)) x.yi++; }); }
  // Avans / masraf: ay → kişi → { avans, masraf, kalemler[] }. 'Bekliyor' / 'Reddedildi' durumundakiler bordroya girmez.
  var am = ss.getSheetByName(AVANS_SEKME);
  if (am && am.getLastRow() > 1) { var av = am.getDataRange().getDisplayValues(), ab = av[0];
    var c9 = { t: kolon_(ab, ['Tarih']), p: kolon_(ab, ['Personel']), tur: kolon_(ab, ['Tür']), k: kolon_(ab, ['Kalem']), tl: kolon_(ab, ['Tutar (TL)', 'Tutar']),
               a: kolon_(ab, ['Açıklama']), d: kolon_(ab, ['Durum']) };
    av.slice(1).forEach(function (r, i) { var g = bordroIso_(r[c9.t]), tl = sayi_(r[c9.tl]), mahsup = /mahsup/i.test(r[c9.tur]);
      if (!g || !r[c9.p] || !(mahsup ? tl !== 0 : tl > 0)) return;
      var durum = String(r[c9.d] || '').trim(), sayilir = !/bekliyor|red/i.test(durum), masraf = /masraf/i.test(r[c9.tur]);
      var A = V.am[g.slice(0, 7)] = V.am[g.slice(0, 7)] || {}, k = norm_(r[c9.p]), x = A[k] = A[k] || { avans: 0, masraf: 0, mahsup: 0, bekleyen: 0, kalemler: [] };
      if (!sayilir) { if (/bekliyor/i.test(durum) && !mahsup) x.bekleyen += tl; } else if (mahsup) x.mahsup += tl; else if (masraf) x.masraf += tl; else x.avans += tl;
      x.kalemler.push({ satir: i + 2, gun: g, ad: r[c9.p], tur: mahsup ? 'Mahsup' : masraf ? 'Masraf' : 'Avans', kalem: r[c9.k] || '', tutar: tl, aciklama: String(r[c9.a] || '').slice(0, 120), durum: durum || 'Onaylandı' }); }); }
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
  odemeKayitlari_(ss).liste.forEach(function (x) { if (!x.k) return; var o = V.odenen[x.ay] = V.odenen[x.ay] || {}; o[x.k] = (o[x.k] || 0) + x.tutar; });
  var ps = ss.getSheetByName('Personel');
  if (ps) {
    var v = ps.getDataRange().getDisplayValues(), b = v[0];
    var cA = kolon_(b, ['İsim Soyisim']), cG = kolon_(b, ['İşe Giriş']), cC = kolon_(b, ['İşten Çıkış']), cM = kolon_(b, ['Maaş']), cAk = kolon_(b, ['Aktif']),
        cS = kolon_(b, ['SGK lı', 'SGK']), cSb = kolon_(b, ['Sube', 'Şube']), cI = kolon_(b, ['IBAN']), cBH = kolon_(b, ['Banka Hesap Adı']);
    // Aynı isimle birden fazla satır olabilir (eski kayıt + yeniden işe giriş); hepsi alınır, ay için doğru olanı bordro_ seçer.
    v.slice(1).forEach(function (r) {
      var ad = String(r[cA] || '').trim(), k = norm_(ad); if (!ad) return;
      V.personel.push({ ad: ad, k: k, giris: bordroIso_(r[cG]), cikis: bordroIso_(r[cC]), maas: sayi_(r[cM]), aktif: /^(true|evet|1)$/i.test(String(r[cAk]).trim()),
        sgk: /^(true|evet|1|ok)$/i.test(String(r[cS]).trim()), sube: cSb >= 0 ? String(r[cSb]).trim() : '', ibanVar: cI >= 0 && String(r[cI] || '').trim() !== '',
        iban: IBAN_GOSTER && cI >= 0 ? String(r[cI] || '').trim() : '', hesapAdi: IBAN_GOSTER && cBH >= 0 ? String(r[cBH] || '').trim() : '' });
    });
  }
  return V;
}

// Eski kayıttaki ad ("Ece Naz Ayverdi", "Güllü Bulaşıkçı") ile personel adını eşleştirir: tam eşit ya da ilk ad aynı ve soyad aynı/yok.
function eskiBul_(E, ad) {
  if (!E) return null; var k = norm_(ad); if (E[k]) return E[k];
  var p = String(ad).trim().split(/\s+/).map(norm_), bul = null;
  Object.keys(E).forEach(function (ek) { if (bul) return; var q = String(E[ek].ad).trim().split(/\s+/).map(norm_);
    if (p[0] === q[0] && (p.length === 1 || q.length === 1 || p[p.length - 1] === q[q.length - 1])) bul = E[ek]; });
  return bul;
}

// Para tutarları kuruş hassasiyetinde (2 hane) tutulur; banka ödemesi kuruşlu yapılır.
function kr_(x) { return Math.round((Number(x) || 0) * 100) / 100; }

function bordro_(V, ay, bugun, planli) {
  var yil = +ay.slice(0, 4), aNo = +ay.slice(5, 7), gunSay = new Date(Date.UTC(yil, aNo, 0)).getUTCDate();
  var ilk = ay + '-01', son = ay + '-' + ('0' + gunSay).slice(-2), kadar = bugun < son ? bugun : son;
  function gunFark(a, b) { return b < a ? 0 : Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1; }
  var odenen = V.odenen[ay] || {}, AM = V.am[ay] || {}, kisiler = [], gorulen = {}, grup = {};
  // Aynı kişinin satırları: bu aya denk gelen, maaşı olan kayıtlar. Birden fazlaysa tarihsiz pasif (eski) kayıt elenir;
  // yine birden fazlaysa (ör. ay içinde ayrılıp yeniden girme) her biri kendi tarih aralığıyla hesaplanır.
  V.personel.forEach(function (p) {
    if (!(p.maas > 0)) return;
    if ((p.giris && p.giris > son) || (p.cikis && p.cikis < ilk)) return;
    (grup[p.k] = grup[p.k] || []).push(p);
  });
  Object.keys(grup).forEach(function (k) {
    var l = grup[k];
    if (l.length > 1) { var tarihli = l.filter(function (p) { return p.aktif || p.cikis; }); if (tarihli.length) l = tarihli; }
    if (l.length > 1) { var aktif = l.filter(function (p) { return p.aktif; }), cikan = l.filter(function (p) { return !p.aktif && p.cikis; });
      l = aktif.length ? [aktif[aktif.length - 1]].concat(cikan) : cikan; }
    grup[k] = l;
  });
  V.personel.filter(function (p) { return (grup[p.k] || []).indexOf(p) >= 0; }).forEach(function (p) {
    var P = V.pu[p.k], ayKaydi = P && Object.keys(P.gunler).some(function (d) { return d >= ilk && d <= son; });
    var iz = ayKaydi || !!eskiBul_(V.eski[ay], p.ad) || !!odenen[p.k]; // o ay çalıştığına dair iz: puantaj, eski fazla mesai kaydı ya da ödeme
    if (!p.aktif && !p.cikis && !iz) return;          // pasif ve bu ay izi yok
    if (!p.giris && !iz && ay < bugun.slice(0, 7)) return; // giriş tarihi bilinmiyor, o ay izi yok
    gorulen[p.k] = 1;
    var bas = p.giris && p.giris > ilk ? p.giris : ilk, bitis = p.cikis && p.cikis < son ? p.cikis : son;
    var gunluk = p.maas / gunSay, saatlik = gunluk / FAZLA_BOLEN;
    var ucretliBugune = gunFark(bas, kadar < bitis ? kadar : bitis), ucretliAy = gunFark(bas, bitis);
    var n = { yi: 0, ui: 0, dev: 0, rap: 0, resmi: 0, off: 0, offCalisma: 0, calisilan: 0, uzamaGun: 0 }, fazSn = 0, eksikSn = 0, topSn = 0, uzamaSn = 0, offSn = 0;
    if (P) Object.keys(P.gunler).forEach(function (d) {
      if (d < bas || d > bitis) return; var x = P.gunler[d];
      ['yi', 'ui', 'dev', 'rap', 'resmi', 'off'].forEach(function (z) { if (x[z]) n[z]++; });
      var izinli = x.yi || x.ui || x.dev || x.rap; // izin günlerinde yazılan toplam çalışma sayılmaz
      if (x.off && x.top > 0 && !izinli) n.offCalisma++;
      if (x.top > 0 && !izinli) { n.calisilan++; topSn += x.top; }
      // Fazla mesai iki ayrı iş: normal günde vardiyadan uzun kalma ve off gününde çağırıp çalıştırma.
      if (x.faz > 0) { fazSn += x.faz; if (x.off) offSn += x.faz; else uzamaSn += x.faz; if (!x.off) n.uzamaGun++; } else if (x.faz < 0) eksikSn += -x.faz;
    });
    // Bu ay puantajı yoksa (QR öncesi) fazla mesai eski kayıttan; izin/devamsızlık kesintisi bilinmez (bilgi olarak gösterilir)
    var eskiK = !ayKaydi ? eskiBul_(V.eski[ay], p.ad) : null;
    if (eskiK) { uzamaSn += eskiK.uzama; offSn += eskiK.off; fazSn += eskiK.uzama + eskiK.off; n.offCalisma += eskiK.offGun; }
    var raporKes = Math.max(0, n.rap - 3), kesGun = n.ui + n.dev + raporKes;
    var normal = Math.max(0, ucretliBugune - kesGun) * gunluk, normalAy = Math.max(0, ucretliAy - kesGun) * gunluk;
    var fazla = fazSn / 3600 * saatlik, resmiTl = n.resmi * gunluk, uzamaTl = uzamaSn / 3600 * saatlik, offTl = offSn / 3600 * saatlik;
    var aySonu = normalAy + fazla + resmiTl, am = AM[p.k] || { avans: 0, masraf: 0, mahsup: 0, bekleyen: 0 };
    // Net hak ediş = ay sonu − avans + masraf ± geçen ay mahsubu; kalan = net − bu ay ödenen; asgari/diğer kalandan bölünür.
    var net = aySonu - am.avans + am.masraf + (am.mahsup || 0), od = odenen[p.k] || 0, kalan = net - od;
    var asgari = p.sgk ? Math.min(ASGARI_NET, Math.max(0, kalan)) : 0;
    kisiler.push({ ad: p.ad, sube: p.sube, sgk: p.sgk, sgkPrim: p.sgk ? kr_(SGK_ISVEREN * ucretliAy / gunSay) : 0, aktif: p.aktif, ayrildi: !!p.cikis && p.cikis <= son, cikis: p.cikis, giris: p.giris && p.giris >= ilk ? p.giris : '',
      maas: Math.round(p.maas), baz: kr_(gunluk * ucretliAy), gunluk: kr_(gunluk), saatlik: Math.round(saatlik * 100) / 100, ucretliGun: ucretliBugune, ucretliAy: ucretliAy,
      gun: n, calisilanGun: n.calisilan, saat: Math.round(topSn / 360) / 10, fazlaDk: Math.round(fazSn / 60), eksikDk: Math.round(eksikSn / 60),
      uzamaDk: Math.round(uzamaSn / 60), uzamaTl: kr_(uzamaTl), uzamaGun: n.uzamaGun, offDk: Math.round(offSn / 60), offTl: kr_(offTl), offGun: n.offCalisma,
      yillikTl: kr_(n.yi * gunluk), raporKesGun: raporKes, raporTl: -kr_(raporKes * gunluk), ucretsizTl: -kr_(n.ui * gunluk), devamsizTl: -kr_(n.dev * gunluk),
      normal: kr_(normal), fazla: kr_(fazla), resmi: kr_(resmiTl),
      hakedis: kr_(normal + fazla + resmiTl), aySonu: kr_(aySonu), avans: kr_(am.avans), masraf: kr_(am.masraf), masrafBekleyen: kr_(am.bekleyen),
      mahsup: kr_(am.mahsup || 0), net: kr_(net), kalan: kr_(kalan), asgari: kr_(asgari), diger: kr_(Math.max(0, kr_(kalan) - kr_(asgari))),
      ibanVar: p.ibanVar, iban: p.iban, hesapAdi: p.hesapAdi, odenen: kr_(odenen[p.k] || 0),
      eskiVeri: eskiK ? { calismayan: eskiK.calismayan, rap: eskiK.rap, yi: eskiK.yi } : null, puantajVar: !!ayKaydi });
  });
  // Puantajda bu ay kaydı olup personel listesinde (ya da maaşı) olmayanlar
  var eksik = Object.keys(V.pu).filter(function (k) { return !gorulen[k] && Object.keys(V.pu[k].gunler).some(function (d) { return d >= ilk && d <= son; }); }).map(function (k) { return V.pu[k].ad; });
  kisiler.sort(function (a, b) { return String(a.sube).localeCompare(String(b.sube), 'tr') || a.ad.localeCompare(b.ad, 'tr'); });

  function topla(l) { var t = { kisi: l.length, maas: 0, tamMaas: 0, normal: 0, fazla: 0, resmi: 0, hakedis: 0, aySonu: 0, odenen: 0, kesinti: 0, eksikDk: 0, fazlaDk: 0, sgkPrim: 0, sgkKisi: 0, avans: 0, masraf: 0, mahsup: 0, net: 0, kalan: 0, asgari: 0, diger: 0, uzamaTl: 0, uzamaDk: 0, offTl: 0, offDk: 0, offGun: 0, offKisi: 0, uzamaKisi: 0 };
    l.forEach(function (x) { t.maas += x.baz; t.tamMaas += x.maas; t.normal += x.normal; t.fazla += x.fazla; t.resmi += x.resmi; t.hakedis += x.hakedis; t.aySonu += x.aySonu; t.odenen += x.odenen;
      t.kesinti += -(x.ucretsizTl + x.devamsizTl + x.raporTl); t.eksikDk += x.eksikDk; t.fazlaDk += x.fazlaDk;
      t.sgkPrim += x.sgkPrim; if (x.sgk) t.sgkKisi++;
      t.avans += x.avans; t.masraf += x.masraf; t.mahsup += x.mahsup; t.net += x.net; t.kalan += x.kalan; t.asgari += x.asgari; t.diger += x.diger;
      t.uzamaTl += x.uzamaTl; t.uzamaDk += x.uzamaDk; t.offTl += x.offTl; t.offDk += x.offDk; t.offGun += x.offGun; if (x.offGun) t.offKisi++; if (x.uzamaDk) t.uzamaKisi++; });
    ['maas', 'normal', 'fazla', 'resmi', 'hakedis', 'aySonu', 'odenen', 'kesinti', 'sgkPrim', 'avans', 'masraf', 'mahsup', 'net', 'kalan', 'asgari', 'diger', 'uzamaTl', 'offTl'].forEach(function (k) { t[k] = kr_(t[k]); }); return t; }
  var subeler = {}; kisiler.forEach(function (x) { (subeler[x.sube || 'Belirtilmemiş'] = subeler[x.sube || 'Belirtilmemiş'] || []).push(x); });
  var aktifler = V.personel.filter(function (p) { return p.aktif && p.maas > 0; });
  var bugunGider = 0;
  if (ay === bugun.slice(0, 7)) (planli || []).forEach(function (p) { if (!p.calisacak) return; var x = kisiler.filter(function (y) { return norm_(y.ad) === norm_(p.ad); })[0]; if (x) bugunGider += x.gunluk; });
  var kalemler = []; Object.keys(AM).forEach(function (k) { kalemler = kalemler.concat(AM[k].kalemler); });
  kalemler.sort(function (a, b) { return a.gun < b.gun ? 1 : -1; });
  return { ay: ay, gunSayisi: gunSay, kadar: kadar, kapandi: bugun > son, kisiler: kisiler, toplam: topla(kisiler), avansKalemleri: kalemler.slice(0, 80),
    puantajVar: !!V.aylar[ay], eskiVeriVar: !!V.eski[ay], ibanAcik: IBAN_GOSTER,
    subeler: Object.keys(subeler).sort().map(function (k) { return { ad: k, toplam: topla(subeler[k]) }; }), eksikPersonel: eksik,
    butce: Math.round(aktifler.reduce(function (s, p) { return s + p.maas; }, 0)), sgkSayi: aktifler.filter(function (p) { return p.sgk; }).length, sgkIsveren: SGK_ISVEREN,
    bugunGider: Math.round(bugunGider), bugunKisi: (planli || []).filter(function (p) { return p.calisacak; }).length, asgariNet: ASGARI_NET };
}

// Vardiya çizelgesi: 4 hafta geri, 2 hafta ileri. Geçmiş günlerde fiili giriş-çıkış da eklenir.
function vardiyaPlani_(ss, bugun, bilgiler) {
  var vs = ss.getSheetByName('Vardiya'); if (!vs) return null;
  var dow = (new Date(bugun + 'T00:00:00Z').getUTCDay() + 6) % 7, buHafta = gunEkle_(bugun, -dow);
  var ilk = gunEkle_(buHafta, -28), son = gunEkle_(buHafta, 28);
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
    var c = { gun: kolon_(gb, ['Kayıt Okutma (Gün)', 'Kayıt Okutma']), ad: kolon_(gb, ['İsim Soyisim']), gir: kolon_(gb, ['Mesai Giriş']), cik: kolon_(gb, ['Mesai Çıkış']), top: kolon_(gb, ['Toplam mesai']), ga: kolon_(gb, ['Giriş Açıklaması']), faz: kolon_(gb, ['Fazla Mesai']),
              yi: kolon_(gb, ['Yıllık İzin']), ui: kolon_(gb, ['Ücretsiz İzin']), rap: kolon_(gb, ['Rapor']), dev: kolon_(gb, ['Devamsızlık']) };
    g.slice(1).forEach(function (r) {
      var ms = zaman_(r[c.gun]); if (ms === null) return; var gun = new Date(ms).toISOString().slice(0, 10);
      if (gun < ilk || gun > bugun) return;
      var k = norm_(r[c.ad]) + '|' + gun; if (gercek[k] && gercek[k].g) return; // mükerrer: en üstteki (en yeni) dolu kayıt
      // iz: puantajda işaretli izin türü (yi yıllık, ui ücretsiz, rap rapor, dev devamsızlık)
      var iz = ['rap', 'yi', 'ui', 'dev'].filter(function (z) { return c[z] >= 0 && String(r[c[z]]).trim(); })[0] || '';
      gercek[k] = { g: String(r[c.gir] || '').slice(0, 5), c: String(r[c.cik] || '').slice(0, 5), t: String(r[c.top] || '').replace(/:\d{2}$/, ''), gec: /geç girildi/i.test(r[c.ga] || ''), iz: iz, f: c.faz >= 0 ? Math.round(sureSn_(r[c.faz]) / 60) || 0 : 0 };
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
  // Aynı saatlik tetikleyici yemek kartı ajanını da çalıştırır (ayrı tetikleyici kurmaya gerek yok).
  try { kartAjani(); } catch (err) { Logger.log('Kart ajanı: ' + err); }
  try { pluxeeFaturaTara_(); } catch (err) { Logger.log('Pluxee fatura: ' + err); }
}

/* ---------------- Vardiya girişi (panelden) ---------------- */

// BAP_Personel uygulamasındaki VARDIYALAR ile birebir aynı olmalı: QR giriş-çıkış vardiyayı bu metinden tanır
// (yazım farkı olursa kişi "vardiya atanmamış" sayılır). [başlangıç, bitiş, saat]
var VARDIYA_SECENEK = {
  '11:00-21:00': 10, '12:00-22:00': 10, '13:00-23:00': 10, '14:00-24:00': 10, '16:00-02:00': 10,
  '11:00-22:00': 11, '12:00-23:00': 11, '13:00-24:00': 11,
  '11:00-23:00': 12, '12:00-01:00': 12, '13:00-02:00': 12,
  'Off': 0, 'Yıllık izin': 0, 'Ücretsiz izin': 0
};
var VARDIYA_HAFTA_ICI = ['11:00-21:00', '12:00-22:00', '13:00-23:00', '11:00-22:00', '12:00-23:00', '11:00-23:00', 'Off', 'Yıllık izin', 'Ücretsiz izin'];
var VARDIYA_HAFTA_SONU = ['11:00-21:00', '12:00-22:00', '13:00-23:00', '14:00-24:00', '16:00-02:00', '11:00-22:00', '12:00-23:00', '13:00-24:00',
                          '11:00-23:00', '12:00-01:00', '13:00-02:00', 'Off', 'Yıllık izin', 'Ücretsiz izin'];

// Panel POST ile { key, tur: 'vardiya', hafta: 'yyyy-MM-dd' (Pazartesi), satirlar: [{ ad, gunler: [7] }], onceki: { ad: [7] } } gönderir.
// Yalnız gönderilen kişilerin o haftaki satırı güncellenir ya da sona eklenir; başka satıra dokunulmaz, hiçbir satır silinmez.
// Yazım biçimi BAP_Personel › vardiyaCizelgeKaydet ile aynıdır (Hafta, İsim, Şube, Planlanan, Off, Pzt…Paz).
function vardiyaGir_(d) {
  var hafta = String(d.hafta || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hafta) || new Date(hafta + 'T00:00:00Z').getUTCDay() !== 1) return { hata: 'Hafta bir Pazartesi tarihi olmalı.' };
  var bugun = isGunu_(simdi_()), dow = (new Date(bugun + 'T00:00:00Z').getUTCDay() + 6) % 7, buHafta = gunEkle_(bugun, -dow);
  if (hafta < gunEkle_(buHafta, -28) || hafta > gunEkle_(buHafta, 28)) return { hata: 'Panelden yalnız son 4 hafta ile önümüzdeki 4 hafta düzenlenebilir.' };
  var gelen = Array.isArray(d.satirlar) ? d.satirlar.slice(0, 80) : [];
  if (!gelen.length) return { hata: 'Kaydedilecek vardiya yok.' };
  var onceki = d.onceki && typeof d.onceki === 'object' ? d.onceki : {};

  var ss = SpreadsheetApp.openById(KAYNAK.personel.id);
  var vs = ss.getSheetByName('Vardiya');
  if (!vs) return { hata: "Personel tablosunda 'Vardiya' sekmesi bulunamadı." };
  var v = vs.getDataRange().getDisplayValues(), b = v[0];
  var cH = kolon_(b, ['Hafta (Pazartesi)', 'Hafta']), cI = kolon_(b, ['İsim Soyisim']), cS = kolon_(b, ['Şube', 'Sube']),
      cP = kolon_(b, ['Planlanan']), cO = kolon_(b, ['Off']);
  var gc = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(function (g) { return kolon_(b, [g]); });
  if (cH < 0 || cI < 0 || gc.some(function (i) { return i < 0; })) return { hata: 'Vardiya sekmesinin başlıkları beklenen gibi değil (Hafta, İsim Soyisim, Pzt…Paz).' };

  // Bu haftanın mevcut satırları (kişi başına satır numaraları)
  var mevcut = {};
  for (var i = 1; i < v.length; i++) {
    var ms = zaman_(v[i][cH]); if (ms === null || !String(v[i][cI]).trim()) continue;
    if (new Date(ms).toISOString().slice(0, 10) !== hafta) continue;
    (mevcut[norm_(v[i][cI])] = mevcut[norm_(v[i][cI])] || []).push(i);
  }
  // Personel listesi: ad doğrulaması ve şube
  var ps = ss.getSheetByName('Personel'), kisi = {};
  if (ps) {
    var pv = ps.getDataRange().getDisplayValues(), pb = pv[0], pA = kolon_(pb, ['İsim Soyisim']), pS = kolon_(pb, ['Sube', 'Şube']);
    pv.slice(1).forEach(function (r) { var ad = String(r[pA] || '').trim(); if (ad) kisi[norm_(ad)] = { ad: ad, sube: pS >= 0 ? String(r[pS] || '').trim() : '' }; });
  }

  var guncelle = [], ekle = [], gorulen = {};
  for (var j = 0; j < gelen.length; j++) {
    var ad = String(gelen[j] && gelen[j].ad || '').replace(/\s+/g, ' ').trim(), n = norm_(ad);
    if (!n || gorulen[n]) continue; gorulen[n] = true;
    var satirNo = mevcut[n] || [];
    if (!kisi[n] && !satirNo.length) return { hata: ad + ' personel listesinde yok.' };
    var eski = satirNo.length ? gc.map(function (c) { return String(v[satirNo[0]][c] || '').trim(); }) : ['', '', '', '', '', '', ''];
    // Başka yerden (yönetici paneli / tablo) bu arada değiştirildiyse üzerine yazma.
    var gordugu = Array.isArray(onceki[ad]) ? onceki[ad].map(function (x) { return String(x || '').trim(); }) : ['', '', '', '', '', '', ''];
    if (gordugu.join('|') !== eski.join('|')) return { hata: ad + ' için bu haftanın vardiyası siz düzenlerken başka yerden değiştirilmiş. Sayfayı yenileyip yeniden girin.', cakisma: true };
    var gunler = [], saat = 0, off = 0;
    for (var k = 0; k < 7; k++) {
      var g = String(gelen[j].gunler && gelen[j].gunler[k] || '').trim();
      var izinli = (k >= 4 ? VARDIYA_HAFTA_SONU : VARDIYA_HAFTA_ICI).indexOf(g) >= 0;
      // Tabloda eskiden kalmış farklı bir değer değiştirilmeden bırakılabilir.
      if (g && !izinli && g !== eski[k]) return { hata: ad + ' — ' + ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'][k] + ': "' + g + '" geçerli bir vardiya değil.' };
      gunler.push(g);
      if (g === 'Off') off++; else if (VARDIYA_SECENEK[g]) saat += VARDIYA_SECENEK[g];
    }
    if (gunler.join('|') === eski.join('|')) continue;
    if (satirNo.length) satirNo.forEach(function (s) { guncelle.push({ satir: s + 1, gunler: gunler, saat: saat, off: off }); });
    else if (gunler.some(function (x) { return x; })) ekle.push({ ad: kisi[n].ad, sube: kisi[n].sube, gunler: gunler, saat: saat, off: off });
  }
  if (!guncelle.length && !ekle.length) return { tamam: true, degisen: 0 };

  var gMin = Math.min.apply(null, gc), gMax = Math.max.apply(null, gc);
  var bitisik = gMax - gMin === 6 && gc.every(function (c, x) { return c === gMin + x; });
  guncelle.forEach(function (u) {
    if (bitisik) vs.getRange(u.satir, gMin + 1, 1, 7).setValues([u.gunler]);
    else gc.forEach(function (c, x) { vs.getRange(u.satir, c + 1).setValue(u.gunler[x]); });
    if (cP >= 0) vs.getRange(u.satir, cP + 1).setValue(u.saat);
    if (cO >= 0) vs.getRange(u.satir, cO + 1).setValue(u.off);
  });
  if (ekle.length) {
    var genislik = b.length, yeni = ekle.map(function (x) {
      var r = []; for (var q = 0; q < genislik; q++) r.push('');
      r[cH] = hafta; r[cI] = x.ad; if (cS >= 0) r[cS] = x.sube; if (cP >= 0) r[cP] = x.saat; if (cO >= 0) r[cO] = x.off;
      gc.forEach(function (c, z) { r[c] = x.gunler[z]; });
      return r;
    });
    vs.getRange(vs.getLastRow() + 1, 1, yeni.length, genislik).setValues(yeni);
  }
  var kisiSay = Object.keys(gorulen).length, degisen = guncelle.length + ekle.length;
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss');
  var log = ss.getSheetByName('Islem_Loglari');
  if (log) { log.insertRowAfter(1); log.getRange(2, 1, 1, 5).setValues([[damga, 'Yönetici (panel)', 'VARDIYA_KAYDEDILDI', hafta + ' haftası, ' + degisen + ' kişi değişti', '-']]); }
  return { tamam: true, degisen: degisen, kisi: kisiSay };
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
  { ad: 'Acil durum kişisi telefon', etiket: 'Acil durum telefonu', tur: 'telefon', goster: false },
  // İsteğe bağlı: eksik sayılmaz ama panelden değiştirilebilir
  { ad: 'İşten Çıkış', etiket: 'İşten çıkış tarihi', tur: 'tarih', goster: true, istege: true },
  { ad: 'Aktif', etiket: 'Aktif çalışıyor mu', tur: 'evethayir', goster: true, istege: true }
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
    p.maskeli = {};
    PERSONEL_ALANLAR.forEach(function (a, j) {
      if (idx[j] < 0) return;
      var dolu = String(r[idx[j]]).trim() !== '';
      if (a.goster && dolu) p.degerler[a.ad] = r[idx[j]];
      if (!a.goster && dolu) p.maskeli[a.ad] = maskele_(String(r[idx[j]])); // telefon / IBAN / acil durum: yalnız son 4 hane
      if (!dolu && !a.istege) p.eksik.push({ alan: a.ad, etiket: a.etiket, tur: a.tur });
    });
    liste.push(p);
  }
  return { alanlar: PERSONEL_ALANLAR.map(function (a) { return { ad: a.ad, etiket: a.etiket, tur: a.tur, goster: a.goster, istege: !!a.istege }; }), liste: liste };
}

// Sahip panelden personel bilgisini girer. Boş hücreye doğrudan yazılır; dolu hücre yalnız d.degistir === '1' ile değiştirilir
// ve eski değer (hassas alanlarda maskeli) Islem_Loglari'na yazılır. Şifre panelden hiç değiştirilemez.
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
  var eski = String(v[satir - 1][cX]).trim();
  if (eski !== '' && d.degistir !== '1') return { hata: 'Bu bilgi zaten dolu; değiştirmek için ‘Değiştir’ ile gönderin.' };
  ps.getRange(satir, cX + 1).setValue(deger.deger);
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss');
  var gizli = alan.goster ? String(deger.deger) : maskele_(String(deger.deger));
  var log = ss.getSheetByName('Islem_Loglari');
  var eskiGizli = eski ? (alan.goster ? eski : maskele_(eski)) : '';
  if (log) { log.insertRowAfter(1); log.getRange(2, 1, 1, 5).setValues([[damga, 'Yönetici (panel)', eski ? 'PERSONEL_BILGI_DEGISTI' : 'PERSONEL_BILGI_GIRILDI', d.ad + ' — ' + alan.etiket + ': ' + (eski ? eskiGizli + ' → ' : '') + gizli, '-']]); }
  cevapKaydet_('İnsan Kaynakları', 'BAP Personel › Personel', satir, d.ad + ' — ' + alan.etiket + (eski ? ' değiştirildi' : ' girildi'), (eski ? eskiGizli + ' → ' : '') + gizli, damga.slice(0, 16));
  return { tamam: true, goster: gizli, degisti: !!eski };
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
  var s = sonSatirlar_(ss, 'Siparişler', 6000, ['Tarih', 'Sipariş ID', 'Adisyon No', 'Kurye', 'Platform', 'Sipariş Saati', 'Atama (dk)', 'Hazırlık (dk)', 'Yol (dk)', 'Toplam (dk)', 'Mesafe (km)', 'Durum', 'Adres', 'Teslim Saati', 'Ödeme Yöntemi', 'Tutar (TL)', 'Hesap']);
  var seri = {}; for (var i = 0; i < 14; i++) seri[gunEkle_(ilkSeri, i)] = { adet: 0, dk: 0, n: 0, gec: 0, maliyet: 0 };
  var saat = {}, dagilim = [0, 0, 0, 0, 0], platform = {}, enKotu = [], sonSiparisMs = null, mahalleSay = {}, siparisGun = {}, siparisSaat = {}, sipHesap = {};
  KURYE_DONEMLER.forEach(function (d) { mahalleSay[d] = {}; });
  if (s) {
    var c = { tarih: kolon_(s.b, ['Tarih']), no: kolon_(s.b, ['Adisyon No']), kurye: kolon_(s.b, ['Kurye']), plat: kolon_(s.b, ['Platform']), sip: kolon_(s.b, ['Sipariş Saati']),
              at: kolon_(s.b, ['Atama (dk)']), hz: kolon_(s.b, ['Hazırlık (dk)']), yol: kolon_(s.b, ['Yol (dk)']), top: kolon_(s.b, ['Toplam (dk)']), km: kolon_(s.b, ['Mesafe (km)']),
              durum: kolon_(s.b, ['Durum']), adres: kolon_(s.b, ['Adres']), id: kolon_(s.b, ['Sipariş ID']),
              tes: kolon_(s.b, ['Teslim Saati']), od: kolon_(s.b, ['Ödeme Yöntemi']), tut: kolon_(s.b, ['Tutar (TL)']), hesap: kolon_(s.b, ['Hesap']) };
    s.v.forEach(function (r) {
      if (c.id >= 0) { var sid = siparisNo_(r[c.id]); if (sid) siparisSaat[sid] = String(r[c.sip] || '').slice(0, 5);
        if (sid && c.hesap >= 0) sipHesap[sid] = { hesap: String(r[c.hesap] || '').trim(), tarih: r[c.tarih], no: r[c.no], plat: r[c.plat], kurye: r[c.kurye],
          odeme: c.od >= 0 ? r[c.od] : '', tutar: c.tut >= 0 ? r[c.tut] : '', durum: r[c.durum], teslim: c.tes >= 0 ? r[c.tes] : '' }; }
      var gun = gunStr_(r[c.tarih]); if (!gun) return;
      if (c.durum >= 0 && iptalMi_(r[c.durum])) return;
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
  var mesaiGun = {}, m = sonSatirlar_(ss, 'Günlük Mesai', 1200), bugunMesai = [], kesintiler = [], kadro = {}, haftalar = {}, mesaiKontrol = [];
  var dow = (new Date(bugun + 'T00:00:00Z').getUTCDay() + 6) % 7, buHafta = gunEkle_(bugun, -dow), ilkHafta = gunEkle_(buHafta, -7 * 7);
  if (m) {
    var cm = { tarih: kolon_(m.b, ['Tarih']), kurye: kolon_(m.b, ['Kurye']), pg: kolon_(m.b, ['Planlı Giriş']), g: kolon_(m.b, ['Giriş']), pc: kolon_(m.b, ['Planlı Çıkış']),
               cik: kolon_(m.b, ['Çıkış']), ek: kolon_(m.b, ['Erken Kesinti (dk)']), kk: kolon_(m.b, ['Kapanış Kesintisi (dk)']), net: kolon_(m.b, ['Net Süre']),
               paket: kolon_(m.b, ['Paket']), gec: kolon_(m.b, ['Geç Giriş (dk)']), durum: kolon_(m.b, ['Durum']), neden: kolon_(m.b, ['Kesinti Gerekçesi']),
               son: kolon_(m.b, ['Son Sipariş']), makul: kolon_(m.b, ['Makul Çıkış']) };
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
      var kon = mesaiKontrolSatiri_(r, cm, gun, ad, net, paket, kapanis, acik);
      if (kon && gun >= gunEkle_(bugun, -20)) mesaiKontrol.push(kon);
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
  // Düzeltmesi yazılmış gün listeden hemen düşer; Günlük Mesai henüz yeniden hesaplanmadıysa düzeltme 'tabloya işlenmedi' görünür.
  var duzListe = mesaiDuzeltmeListesi_(ss, gunEkle_(bugun, -59)), duzVar = {};
  duzListe.forEach(function (x) { var k = x.gun + '|' + norm_(x.ad); duzVar[k] = 1; var mg = mesaiGun[k]; x.islendi = !!(mg && /düzeltildi|onaylı/i.test(mg.durum)); });
  out.mesaiKontrol = mesaiKontrol.filter(function (x) { return !duzVar[x.gun + '|' + norm_(x.ad)]; })
    .sort(function (a, b) { return b.gun.localeCompare(a.gun) || b.bosta - a.bosta; }).slice(0, 60);
  out.mesaiDuzeltme = duzListe;
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
  // Kaynak: Siparişler sekmesinin 'Hesap' = AÇIK satırları + eski kayıtlar için 'Açık Hesaplar' sekmesi (acikListe_).
  var kapali = tahsilatlar_(ss), al = acikListe_(ss, kapali, bugun, siparisSaat, sipHesap), acikL = al.liste, haric = al.haric;
  // Kasada Adisyo'ya 'Ödeme Alındı' işlenmiş olanlar açık sayılmaz; yemek kartı (Pluxee / Paye / Edenred) çekimi bulunanlar işaretlenir.
  var adisyoOdendi = [], kanitHata = '';
  try { var kn = acikKanit_(ss, acikL); acikL = acikL.filter(function (x) { if (x.adisyo === 'odendi') { adisyoOdendi.push(x); return false; } return true; }); }
  catch (err) { kanitHata = String(err.message || err); }
  acikL.sort(function (x, y) { return y.yas - x.yas || y.tutar - x.tutar; });
  (kapali.son || []).forEach(function (x) { x.saat = siparisSaat[x.id] || ''; });
  var eski = acikL.filter(function (x) { return x.yas > 0; }), bugunkuler = acikL.filter(function (x) { return x.yas <= 0; });
  var eskiKisi = {}; eski.forEach(function (x) { topla_(eskiKisi, x.kurye, x.tutar); });
  var tl = function (l) { return Math.round(l.reduce(function (t, x) { return t + x.tutar; }, 0)); };
  out.acik = { eski: { adet: eski.length, toplam: tl(eski), ayUstu: eski.filter(function (x) { return x.yas > 30; }).length },
               bugun: { adet: bugunkuler.length, toplam: tl(bugunkuler) }, haric: { adet: haric.adet, toplam: Math.round(haric.tutar) },
               kisi: sirala_(eskiKisi), liste: eski.slice(0, 60).concat(bugunkuler.slice(0, 30)), kapanan: kapali.son, adisyoBekleyen: kapali.adisyoBekleyen, bahsis: kapali.bahsis,
               adisyoOdendi: { adet: adisyoOdendi.length, toplam: tl(adisyoOdendi), liste: adisyoOdendi.slice(0, 40) },
               kart: kn || null, kanitHata: kanitHata,
               kartSoru: acikL.filter(function (x) { return x.kartKarar === 'soru'; }).slice(0, 40),
               kartEmin: acikL.filter(function (x) { return x.kartKarar === 'emin'; }).slice(0, 40),
               kartAjan: kartAjanRaporu_(), kartKuru: KART_AJAN_KURU };

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

// Hâlâ açık hesaplar ('Tahsilatlar'da kapatılanlar düşer). Kaynak: Siparişler sekmesinin 'Hesap' = AÇIK satırları
// (sipHesap; son 6000 satır, ~1 ay) + bu pencereden eski kayıtlar için 'Açık Hesaplar' sekmesi. O sekme yalnız köprü bitince
// tazelendiği için geride kalabiliyor (04.10); Siparişler esas alınır. 'Ödenmez' (işletme/personel siparişi) ayrı sayılır.
// Panel (kurye_) ve yemek kartı ajanı aynı listeyi kullanır.
function acikListe_(ss, kapali, bugun, siparisSaat, sipHesap) {
  sipHesap = sipHesap || sipHesapOku_(ss);
  var a = sonSatirlar_(ss, 'Açık Hesaplar', 2000), acikL = [], haric = { adet: 0, tutar: 0 }, gorulen = {};
  function acikEkle(id, tarih, no, plat, kurye, odeme, tutarH, durum, teslim) {
    var gun = gunStr_(tarih); if (!gun) return;
    odeme = String(odeme || '').trim(); var tutar = sayi_(tutarH);
    if (id) { if (gorulen[id]) return; gorulen[id] = 1; }
    if (id && kapali.idler[id]) return;
    if (/ödenmez|odenmez/i.test(odeme)) { haric.adet++; haric.tutar += tutar; return; }
    var yas = Math.round((Date.parse(bugun + 'T00:00:00Z') - Date.parse(gun + 'T00:00:00Z')) / 86400000);
    acikL.push({ id: id, gun: gun, tarih: tarih, yas: yas, no: no, saat: siparisSaat[id] || '', platform: plat || '', kurye: String(kurye || '').trim() || 'Atanmamış', odeme: odeme, tutar: tutar,
      durum: durum || '', teslim: String(teslim || '').trim() });
  }
  Object.keys(sipHesap).forEach(function (id) { var x = sipHesap[id]; if (x.hesap !== 'AÇIK') return;
    acikEkle(id, x.tarih, x.no, x.plat, x.kurye, x.odeme, x.tutar, x.durum, x.teslim); });
  if (a) {
    var ca = { tarih: kolon_(a.b, ['Tarih']), no: kolon_(a.b, ['Adisyon No']), id: kolon_(a.b, ['Sipariş ID']), plat: kolon_(a.b, ['Platform']), kurye: kolon_(a.b, ['Kurye']),
               odeme: kolon_(a.b, ['Ödeme Yöntemi']), tutar: kolon_(a.b, ['Tutar (TL)', 'Tutar']), durum: kolon_(a.b, ['Durum']), teslim: kolon_(a.b, ['Teslim Saati']) };
    a.v.forEach(function (r) {
      var id = siparisNo_(r[ca.id]);
      if (id && sipHesap[id]) return; // Siparişler'de güncel hali var (açıksa yukarıda eklendi, değilse artık açık değil)
      acikEkle(id, r[ca.tarih], r[ca.no], r[ca.plat], r[ca.kurye], r[ca.odeme], r[ca.tutar], r[ca.durum], ca.teslim >= 0 ? r[ca.teslim] : '');
    });
  }
  return { liste: acikL, haric: haric };
}

// Siparişler › sipariş ID → { hesap, tarih, no, plat, kurye, odeme, tutar, durum, teslim } (kurye_ aynısını kendi okumasında kurar)
function sipHesapOku_(ss) {
  var s = sonSatirlar_(ss, 'Siparişler', 6000, ['Tarih', 'Sipariş ID', 'Adisyon No', 'Kurye', 'Platform', 'Durum', 'Teslim Saati', 'Ödeme Yöntemi', 'Tutar (TL)', 'Hesap']), out = {};
  if (!s) return out;
  var c = { tarih: kolon_(s.b, ['Tarih']), no: kolon_(s.b, ['Adisyon No']), kurye: kolon_(s.b, ['Kurye']), plat: kolon_(s.b, ['Platform']), durum: kolon_(s.b, ['Durum']),
            id: kolon_(s.b, ['Sipariş ID']), tes: kolon_(s.b, ['Teslim Saati']), od: kolon_(s.b, ['Ödeme Yöntemi']), tut: kolon_(s.b, ['Tutar (TL)']), hesap: kolon_(s.b, ['Hesap']) };
  if (c.id < 0 || c.hesap < 0) return out;
  s.v.forEach(function (r) { var sid = siparisNo_(r[c.id]); if (!sid) return;
    out[sid] = { hesap: String(r[c.hesap] || '').trim(), tarih: r[c.tarih], no: r[c.no], plat: r[c.plat], kurye: r[c.kurye],
      odeme: c.od >= 0 ? r[c.od] : '', tutar: c.tut >= 0 ? r[c.tut] : '', durum: r[c.durum], teslim: c.tes >= 0 ? r[c.tes] : '' }; });
  return out;
}

// Açık hesapları kanıtlara karşı kontrol eder (hiçbir şey yazmaz):
//  1) Adisyo › Satıs Verileri 'Ödeme Alındı' = TRUE → kasada ödendi işlenmiş (x.adisyo = 'odendi' | 'acik' | '' bulunamadı).
//     Eşleşme: kurye tablosundaki sipariş no + sipariş saati, en fazla 20 dk fark (tahsilatlariAdisyoyaIsle_ ile aynı kural).
//  2) Yemek kartı siparişleri için kart çekimi (KART_KAYNAKLARI: Pluxee ve Paye sekmeleri), aynı tutarda, teslimden en fazla 3 saat uzak.
//     Karar verir (kart ajanı bununla kapatır):
//       x.kartKarar = 'emin' → tam olarak bir çekim aynı tutarda, teslim ve çekim saati belli, çekim teslimden en fazla 90 dk uzak
//                             ve o çekime uyan başka hiçbir aynı kartlı sipariş yok (kapatılmışlar dahil).
//       x.kartKarar = 'soru' → aday var ama bu şartlardan biri tutmuyor, ya da çekim verisi o saati kapsıyor ama çekim yok.
//       x.kartNeden: neden (panelde sahibine sorulur). x.kartKaynak: 'Pluxee' | 'Paye'. x.kartZaman: çekim saati (SS:dd).
var TR_AY = { oca: 0, sub: 1, şub: 1, mar: 2, nis: 3, may: 4, haz: 5, tem: 6, agu: 7, ağu: 7, eyl: 8, eki: 9, kas: 10, ara: 11 };
var KART_KAYNAKLARI = [
  { ad: 'Pluxee', odeme: /pluxee|sodexo/i, oku: function (ks) { return pluxeeCekimleri_(ks); } },
  { ad: 'Paye',   odeme: /paye/i,          oku: function (ks) { return payeCekimleri_(ks); } },
  { ad: 'Edenred', odeme: /edenred|^\s*ticket/i, oku: function (ks) { return edenredCekimleri_(ks); } },
  { ad: 'SetCard', odeme: /set\s*card/i,  oku: function (ks) { var v = setcardCekimleri_(ks); if (v && v.cekim && !v.hata) v.cekim = v.cekim.filter(function (y) { return !y.online; }); return v; }, tumu: function (ks) { return setcardCekimleri_(ks); } }
];
function acikKanit_(ks, liste) {
  var ozet = {}; if (!liste.length) return ozet;
  // Kurye sistemi: sipariş ID → sipariş anı ve adisyon no; ayrıca tüm siparişler (aynı çekime başka sipariş de uyuyor mu diye)
  var s = sonSatirlar_(ks, 'Siparişler', 9000, ['Tarih', 'Sipariş ID', 'Adisyon No', 'Sipariş Saati', 'Teslim Saati', 'Ödeme Yöntemi', 'Tutar (TL)']), kmap = {}, tum = [];
  if (s) { var cs = { t: kolon_(s.b, ['Tarih']), id: kolon_(s.b, ['Sipariş ID']), no: kolon_(s.b, ['Adisyon No']), sa: kolon_(s.b, ['Sipariş Saati']),
                      te: kolon_(s.b, ['Teslim Saati']), od: kolon_(s.b, ['Ödeme Yöntemi']), tu: kolon_(s.b, ['Tutar (TL)', 'Tutar']) };
    s.v.forEach(function (r) { var id = siparisNo_(r[cs.id]); if (!id) return;
      var ms = zaman_(String(r[cs.t]).trim() + ' ' + String(r[cs.sa] || '').trim()), teslim = cs.te >= 0 ? String(r[cs.te] || '').trim() : '';
      kmap[id] = { no: String(r[cs.no] || '').trim(), ms: ms, teslim: teslim };
      if (cs.od >= 0 && cs.tu >= 0) { var rf = kartRef_(gunStr_(r[cs.t]), teslim, ms);
        tum.push({ id: id, no: String(r[cs.no] || '').trim(), odeme: String(r[cs.od] || ''), tutar: sayi_(r[cs.tu]), ms: rf ? rf.ms : null, gun: gunStr_(r[cs.t]) }); } }); }
  var as = SpreadsheetApp.openById(KAYNAK.siparis.id);
  var a = sonSatirlar_(as, 'Satıs Verileri', 12000, ['Sipariş ID', 'Sipariş No', 'Sipariş Tarihi', 'Ödeme Alındı']);
  if (a) {
    var c = { no: kolon_(a.b, ['Sipariş No']), t: kolon_(a.b, ['Sipariş Tarihi']), od: kolon_(a.b, ['Ödeme Alındı']) }, ano = {}, enEski = null;
    if (c.od < 0) throw new Error("Adisyo'da 'Ödeme Alındı' sütunu bulunamadı");
    a.v.forEach(function (r) { var no = String(r[c.no] || '').trim(), ms = zaman_(r[c.t]); if (!no || ms === null) return; if (enEski === null || ms < enEski) enEski = ms;
      (ano[no] = ano[no] || []).push({ ms: ms, od: /^true$/i.test(String(r[c.od] || '').trim()) }); });
    liste.forEach(function (x) {
      var k = kmap[x.id]; x.adisyo = '';
      if (!k || k.ms === null) return;
      var aday = (ano[k.no] || []).map(function (y) { return { y: y, f: Math.abs(y.ms - k.ms) }; }).filter(function (z) { return z.f <= 20 * 60000; }).sort(function (p, q) { return p.f - q.f; })[0];
      if (aday) x.adisyo = aday.y.od ? 'odendi' : 'acik';
      else if (enEski !== null && k.ms < enEski) x.adisyo = 'eski';
    });
  }
  KART_KAYNAKLARI.forEach(function (kk) {
    var veri; try { veri = kk.oku(ks); } catch (err) { veri = { hata: String(err.message || err) }; }
    if (!veri) return;
    if (veri.hata) { ozet[kk.ad] = { hata: veri.hata }; return; }
    kartEslestir_(kk, veri, liste.filter(function (x) { return kk.odeme.test(x.odeme); }), tum.filter(function (o) { return kk.odeme.test(o.odeme); }), kmap);
    ozet[kk.ad] = { son: veri.son === null ? null : new Date(veri.son).toISOString().slice(0, 16).replace('T', ' '), adet: veri.cekim.length, gunler: veri.gunler ? Object.keys(veri.gunler).length : null };
  });
  return ozet;
}

// Bir kart kaynağının çekimlerini açık hesaplarla karşılaştırır, x.kart* alanlarını doldurur.
// veri: { cekim: [{ ms, tutar, tam: 'GG.AA SS:dd', zaman: 'SS:dd', saatYok }], son: ms | null, gunler: { 'yyyy-MM-dd': 1 } | undefined }
// gunler verilirse (gün sonu raporu) "çekim yok" yalnız raporu gelmiş günler için söylenir; verilmezse son çekim anına bakılır.
function kartEslestir_(kk, veri, liste, tum, kmap) {
  var SAAT = 3600000, cekim = veri.cekim, ad = kk.ad;
  var ayniTutar = function (p, q) { return Math.abs(p - q) < 0.5; };
  var yakinMi = function (y, ms) { return y.saatYok ? isGunu_(y.ms) === isGunu_(ms) : Math.abs(y.ms - ms) <= 3 * SAAT; };
  var uzaklik = function (y, ms) { return y.saatYok ? 12 * SAAT : Math.abs(y.ms - ms); };
  // Bir çekime uyan diğer siparişler (saati bilinmeyen sipariş aynı iş günündeki her çekime uyar sayılır)
  var rakipler = function (c, haricId) { return tum.filter(function (o) {
    if (o.id === haricId || !ayniTutar(o.tutar, c.tutar)) return false;
    return o.ms === null ? o.gun === isGunu_(c.ms) : yakinMi(c, o.ms); }); };
  var kapsar = function (ms) { return veri.gunler ? !!veri.gunler[isGunu_(ms)] : (veri.son !== null && veri.son >= ms + 3 * SAAT); };
  liste.forEach(function (x) {
    var k = kmap[x.id], rf = kartRef_(x.gun, x.teslim || (k ? k.teslim : ''), k ? k.ms : null); if (!rf) return;
    if (!tum.some(function (o) { return o.id === x.id; })) tum.push({ id: x.id, no: String(x.no || ''), tutar: x.tutar, ms: rf.ms, gun: x.gun });
    x.kartKaynak = ad;
    var aday = cekim.filter(function (y) { return ayniTutar(y.tutar, x.tutar) && yakinMi(y, rf.ms); })
      .sort(function (p, q) { return uzaklik(p, rf.ms) - uzaklik(q, rf.ms); });
    if (!aday.length) {
      if (!kapsar(rf.ms)) return; // çekim verisi bu güne/saate henüz gelmedi
      var yakin = cekim.filter(function (y) { return yakinMi(y, rf.ms) && uzaklik(y, rf.ms) <= 1.5 * SAAT && Math.abs(y.tutar - x.tutar) <= 100; })
        .sort(function (p, q) { return uzaklik(p, rf.ms) - uzaklik(q, rf.ms); })[0];
      x.kartKarar = 'soru';
      x.kartNeden = ad + "'de bu tutarda çekim yok" + (yakin ? '; en yakını ' + yakin.tam + ', ' + yakin.tutar + ' TL (bahşiş ya da yanlış tutar olabilir)' : '; kurye çekmemiş olabilir');
      return;
    }
    var b = aday[0], fark = b.saatYok ? null : Math.round(Math.abs(b.ms - rf.ms) / 60000), rk = rakipler(b, x.id), neden = [];
    x.kartZaman = b.zaman; x.kartCekim = { zaman: b.tam, tutar: b.tutar, farkDk: fark };
    if (aday.length > 1) neden.push('aynı tutarda ' + aday.length + ' çekim var (' + aday.slice(0, 3).map(function (y) { return y.tam; }).join(', ') + ')');
    if (rk.length) neden.push('bu çekim ' + rk.slice(0, 3).map(function (o) { return 'adisyon ' + (o.no || o.id); }).join(', ') + ' siparişine de uyuyor');
    if (b.saatYok) neden.push(ad + ' raporunda çekim saati yok');
    if (!rf.saatVar) neden.push('teslim saati yok');
    else if (fark !== null && fark > 90) neden.push('çekim teslimden ' + fark + ' dk uzak');
    x.kartKarar = neden.length ? 'soru' : 'emin';
    x.kartNeden = neden.length ? neden.join('; ') : 'tek ' + ad + ' çekimi, aynı tutar, teslimden ' + fark + ' dk fark';
  });
}

// Kart çekimlerinin tek sahibi 'BAP Yemek Kartı Tahsilatları' (KAYNAK.yemekKarti, 05.10.2026). Taşıma yapılmamışsa
// kurye dosyasındaki eski sekmeye ('Pluxee', 'Pluxee (eski)' …) düşer.
function kartSekmesi_(ks, ad, n) {
  var t = null; try { t = sonSatirlar_(SpreadsheetApp.openById(KAYNAK.yemekKarti.id), ad, n); } catch (err) { }
  return t || sonSatirlar_(ks, ad, n) || sonSatirlar_(ks, ad + ' (eski)', n);
}

// Pluxee çekimleri: Yemek Kartı Tahsilatları › 'Pluxee' (MacBook pluxee.mjs yazar). İşlem Zamanı "4 Eki 2026 21:14" ya da tarih.
function pluxeeCekimleri_(ks) {
  var px = kartSekmesi_(ks, 'Pluxee', 3000); if (!px) return null;
  var cz = kolon_(px.b, ['İşlem Zamanı']), ct = kolon_(px.b, ['Tutar (TL)', 'Tutar']), cekim = [], son = null;
  if (cz < 0 || ct < 0) return { hata: "Pluxee sekmesinde 'İşlem Zamanı' ya da 'Tutar' sütunu yok" };
  px.v.forEach(function (r) { var ham = String(r[cz] || '').trim(), m = ham.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/), ms = null;
    if (m) { var ay = TR_AY[m[2].toLocaleLowerCase('tr-TR').slice(0, 3)]; if (ay === undefined) ay = TR_AY[norm_(m[2]).slice(0, 3)];
      if (ay !== undefined) ms = Date.UTC(+m[3], ay, +m[1], +m[4], +m[5]); }
    else if (/\d:\d\d/.test(ham)) ms = zaman_(ham);   // yeni tabloda tarih hücresi ("01.10.2026 13:17:00")
    if (ms === null) return;
    m = [0, 0, 0, 0, new Date(ms).toISOString().slice(11, 13), new Date(ms).toISOString().slice(14, 16)];
    cekim.push({ ms: ms, tutar: sayi_(r[ct]), zaman: ('0' + m[4]).slice(-2) + ':' + m[5], tam: kartTam_(ms) });
    if (son === null || ms > son) son = ms; });
  return { cekim: cekim, son: son };
}

// Paye çekimleri: Yemek Kartı Tahsilatları › 'Paye İşlemler' (kurye projesi › Yemek Karti.gs payeMailCek, Sofra "Gün Sonu Raporu"
// e-postasının Excel ekindeki İşlemler sayfası; 'Paye' sekmesi aynı ekin gün sonu toplamları — mutabakat için).
// Sütunlar başlık adıyla aranır; bulunamazsa hata panelde başlıklarla birlikte görünür (eşleme buradan düzeltilir).
var PAYE_SUTUN = {
  zaman: ['İşlem Tarihi Saati', 'İşlem Tarih ve Saati', 'İşlem Tarih Saat', 'İşlem Zamanı', 'Tarih Saat', 'İşlem Tarihi', 'Tarih'],
  saat: ['İşlem Saati', 'Saat'],
  tutar: ['İşlem Tutarı', 'Tutar (TL)', 'Tutar', 'Satış Tutarı', 'Brüt Tutar', 'Toplam Tutar'],
  tip: ['İşlem Tipi', 'İşlem Türü', 'İşlem Durumu', 'Durum', 'Tip']
};
function payeCekimleri_(ks) {
  var p = null; try { p = sonSatirlar_(SpreadsheetApp.openById(KAYNAK.yemekKarti.id), 'Paye İşlemler', 6000); } catch (err) { }
  if (!p) return null;
  var c = { z: kolon_(p.b, PAYE_SUTUN.zaman), s: kolon_(p.b, PAYE_SUTUN.saat), t: kolon_(p.b, PAYE_SUTUN.tutar), tip: kolon_(p.b, PAYE_SUTUN.tip), g: kolon_(p.b, ['Rapor Günü']) };
  if (c.z < 0 || c.t < 0) return { hata: "Paye sekmesinde zaman ya da tutar sütunu bulunamadı. Başlıklar: " + p.b.filter(String).join(' | ') };
  var satis = [], iptal = [], gunler = {}, son = null;
  p.v.forEach(function (r) {
    var g = gunStr_(r[c.g]); if (g) gunler[g] = 1;
    var tutar = sayi_(r[c.t]); if (!tutar) return;
    var zs = String(r[c.z] || '').trim(), saat = zs.match(/\d{1,2}:\d{2}/) ? '' : (c.s >= 0 ? String(r[c.s] || '').trim() : '');
    var ms = zaman_(zs + (saat ? ' ' + saat : '')); if (ms === null) return;
    var saatYok = !/\d{1,2}:\d{2}/.test(zs + ' ' + saat);
    var y = { ms: ms, tutar: Math.abs(tutar), saatYok: saatYok, zaman: saatYok ? '—' : kartTam_(ms).slice(6), tam: saatYok ? kartTam_(ms).slice(0, 5) : kartTam_(ms) };
    if (tutar < 0 || (c.tip >= 0 && /iptal|iade|^ret|geri/.test(norm_(r[c.tip])))) iptal.push(y); else satis.push(y);
    if (!saatYok && (son === null || ms > son)) son = ms;
  });
  // İptal / iade edilen çekim, aynı gün aynı tutardaki bir satışı düşürür
  iptal.forEach(function (y) { for (var i = 0; i < satis.length; i++) if (Math.abs(satis[i].tutar - y.tutar) < 0.5 && isGunu_(satis[i].ms) === isGunu_(y.ms)) { satis.splice(i, 1); return; } });
  return { cekim: satis, son: son, gunler: gunler };
}

// Edenred çekimleri: Yemek Kartı Tahsilatları › 'Edenred' (MacBook edenred.mjs → kurye köprüsü tur:'edenred').
// İşlem listesi terminal gün sonundan sonra dolduğu için "çekim yok" yalnız son çekim anından en az 3 saat önceki siparişler için söylenir.
function edenredCekimleri_(ks) {
  var e = kartSekmesi_(ks, 'Edenred', 6000); if (!e) return null;
  var cz = kolon_(e.b, ['İşlem Zamanı']), ct = kolon_(e.b, ['Tutar (TL)', 'Tutar']), cekim = [], son = null;
  if (cz < 0 || ct < 0) return { hata: "Edenred sekmesinde 'İşlem Zamanı' ya da 'Tutar' sütunu yok" };
  e.v.forEach(function (r) {
    var ms = zaman_(r[cz]), t = sayi_(r[ct]); if (ms === null || !(t > 0)) return;
    var tam = kartTam_(ms); cekim.push({ ms: ms, tutar: t, zaman: tam.slice(6), tam: tam });
    if (son === null || ms > son) son = ms;
  });
  return { cekim: cekim, son: son };
}

// SetCard (kurye projesi SetCard.gs → YEMEKKARTI › SetCard). Yalnız harcamalar; iptal / iade satırları sayılmaz.
function setcardCekimleri_(ks) {
  var e = kartSekmesi_(ks, 'SetCard', 6000); if (!e) return null;
  var cz = kolon_(e.b, ['İşlem Zamanı']), ct = kolon_(e.b, ['Tutar (TL)']), cy = kolon_(e.b, ['İşlem Türü']), cter = kolon_(e.b, ['Terminal']), cku = kolon_(e.b, ['Cihaz / Kullanıcı']), cekim = [], son = null;
  if (cz < 0 || ct < 0) return { hata: "SetCard sekmesinde 'İşlem Zamanı' ya da 'Tutar (TL)' sütunu yok" };
  e.v.forEach(function (r) {
    if (cy >= 0 && /iptal|iade/.test(norm_(r[cy]))) return;
    var ms = zaman_(r[cz]), t = sayi_(r[ct]); if (ms === null || !(t > 0)) return;
    var ter = cter >= 0 ? String(r[cter] || '').trim() : '';
    // 'Trendyol Pos' = Trendyol'da online ödenen SetCard; 'Mobil Pos' = kurye / dükkan terminali (kapıda)
    var tam = kartTam_(ms); cekim.push({ ms: ms, tutar: t, zaman: tam.slice(6), tam: tam, online: /trendyol/i.test(ter), terminal: ter, kurye: cku >= 0 ? String(r[cku] || '').trim() : '' });
    if (son === null || ms > son) son = ms;
  });
  return { cekim: cekim, son: son };
}

function kartTam_(ms) { return new Date(ms).toISOString().replace(/^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2}).*/, '$2.$1 $3'); }

// Siparişin kart çekimiyle karşılaştırılacak anı: teslim saati (yoksa sipariş saati + 30 dk). Gece 04:00'ten önceki teslim ertesi güne düşer.
function kartRef_(gun, teslim, siparisMs) {
  if (!gun) return null;
  var t = String(teslim || '').match(/(\d{1,2}):(\d{2})/);
  if (t) { var ms = Date.parse(gun + 'T00:00:00Z') + ((+t[1]) * 60 + (+t[2])) * 60000; if (+t[1] < 4) ms += 86400000; return { ms: ms, saatVar: true }; }
  if (siparisMs !== null && siparisMs !== undefined) return { ms: siparisMs + 30 * 60000, saatVar: false };
  return null;
}

/* ---------------- Yemek kartı ajanı (Pluxee + Paye) ----------------
 * Saatte bir (puantajTaramasi'nin saatlik tetikleyicisiyle) açık Pluxee / Paye hesaplarını kart çekimleriyle karşılaştırır.
 * Emin olduklarını (acikKanit_ › 'emin') Tahsilatlar'a 'Tahsil edildi' / kaynak '<Kart> Ajanı' olarak yazar ve Adisyo'ya işler.
 * Emin olmadıklarını kapatmaz: panelde Kurye › Açık hesaplar › "Yemek kartı ajanı" kutusunda sorulur, karar sahibinindir.
 * Yanlış kapatılan olursa Tahsilatlar'daki o satırı silmek yeter; hesap yeniden açık görünür (ajan aynı kanıtla yeniden kapatır,
 * o yüzden yanlışlık görülürse depoya bildirilmeli).
 */
// KURU = true iken hiçbir şey yazmaz; neyi kapatacağını rapora yazar (panelde görünür). Sahibi raporu onaylayınca false yapılır.
var KART_AJAN_KURU = true;

function kartAjani() {
  var kilit = LockService.getScriptLock(); if (!kilit.tryLock(30000)) return null;
  try { var r = kartAjanCalis_(); Logger.log('Kart ajanı: ' + JSON.stringify(r)); return r; }
  finally { kilit.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
}

function kartAjanCalis_() {
  var ss = SpreadsheetApp.openById(KAYNAK.kurye.id), bugun = isGunu_(simdi_());
  var liste = acikListe_(ss, tahsilatlar_(ss), bugun, {}).liste;
  acikKanit_(ss, liste);
  liste = liste.filter(function (x) { return x.adisyo !== 'odendi' && x.id; });
  var emin = liste.filter(function (x) { return x.kartKarar === 'emin'; }), soru = liste.filter(function (x) { return x.kartKarar === 'soru'; });
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss'), kapatilan = 0, adisyo = null;
  if (!KART_AJAN_KURU && emin.length) {
    var sh = tahsilatSekmesi_(ss);
    emin.forEach(function (x) {
      sh.appendRow([x.tarih, x.no, "'" + x.id, x.kurye, x.odeme, x.tutar, 'Tahsil edildi',
        x.kartKaynak + ' ajanı: çekim ' + x.kartCekim.zaman + ', ' + x.kartCekim.tutar + ' TL (' + x.kartNeden + ')', damga, x.kartKaynak + ' Ajanı']);
      kapatilan++;
    });
    try { adisyo = tahsilatlariAdisyoyaIsle_(); } catch (err) { adisyo = { hata: String(err.message || err) }; }
  }
  var kisa = function (x) { return { kart: x.kartKaynak, no: String(x.no || ''), gun: x.gun, kurye: x.kurye, tutar: x.tutar, cekim: x.kartCekim ? x.kartCekim.zaman : '' }; };
  var rapor = { zaman: damga.slice(0, 16), kuru: KART_AJAN_KURU, emin: emin.length, kapatilan: kapatilan, soru: soru.length,
                liste: emin.slice(0, 30).map(kisa), adisyo: adisyo };
  PropertiesService.getScriptProperties().setProperty('KART_AJAN', JSON.stringify(rapor));
  return rapor;
}

function kartAjanRaporu_() {
  try { var t = PropertiesService.getScriptProperties().getProperty('KART_AJAN'); return t ? JSON.parse(t) : null; } catch (err) { return null; }
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

function tahsilatSekmesi_(ss) {
  var sh = ss.getSheetByName('Tahsilatlar');
  if (!sh) { sh = ss.insertSheet('Tahsilatlar'); sh.appendRow(TAHSILAT_BASLIK); sh.setFrozenRows(1); sh.getRange(1, 1, 1, TAHSILAT_BASLIK.length).setFontWeight('bold'); }
  return sh;
}

// 'Tahsilatlar' sekmesi: panelden kapatılan açık hesaplar. Satır silinirse hesap yeniden açık görünür.
function tahsilatlar_(ss) {
  var t = sonSatirlar_(ss, 'Tahsilatlar', 5000), out = { idler: {}, son: [] }; if (!t) return out;
  var c = { id: kolon_(t.b, ['Sipariş ID']), no: kolon_(t.b, ['Adisyon No']), kurye: kolon_(t.b, ['Kurye']), tutar: kolon_(t.b, ['Tutar (TL)', 'Tutar']),
            islem: kolon_(t.b, ['İşlem']), zaman: kolon_(t.b, ['Kayıt Zamanı']), tarih: kolon_(t.b, ['Sipariş Tarihi', 'Tarih']), adisyo: kolon_(t.b, ['Adisyo Durumu']),
            bahsis: kolon_(t.b, ['Bahşiş (TL)', 'Bahşiş']) };
  out.adisyoBekleyen = 0;
  // Bahşişler: kayıt zamanına göre son 30 gün ve bu hafta (Pazartesi'den), kurye bazında
  var bugun = isGunu_(simdi_()), dow = (new Date(bugun + 'T00:00:00Z').getUTCDay() + 6) % 7, hafta = gunEkle_(bugun, -dow), otuz = gunEkle_(bugun, -29), bh = {};
  out.bahsis = { hafta: 0, otuz: 0, adet: 0, haftaBasi: hafta, kisi: [] };
  t.v.forEach(function (r) {
    var id = siparisNo_(r[c.id]); if (!id) return; out.idler[id] = 1;
    var ad = c.adisyo >= 0 ? String(r[c.adisyo] || '') : ''; if (!ad) out.adisyoBekleyen++;
    var bs = c.bahsis >= 0 ? sayi_(r[c.bahsis]) : 0;
    out.son.push({ id: id, no: r[c.no], kurye: r[c.kurye], tutar: sayi_(r[c.tutar]), islem: r[c.islem], zaman: String(r[c.zaman] || '').slice(0, 16), tarih: r[c.tarih], adisyo: ad, bahsis: bs });
    if (bs > 0) { var ms = zaman_(r[c.zaman]), g = ms === null ? '' : new Date(ms).toISOString().slice(0, 10);
      if (g >= otuz) { var kx = String(r[c.kurye] || '').trim() || '—', x = bh[kx] = bh[kx] || { ad: kx, hafta: 0, otuz: 0, adet: 0 };
        x.otuz += bs; x.adet++; out.bahsis.otuz += bs; out.bahsis.adet++; if (g >= hafta) { x.hafta += bs; out.bahsis.hafta += bs; } } }
  });
  out.bahsis.kisi = Object.keys(bh).map(function (k) { return bh[k]; }).sort(function (a, b) { return b.otuz - a.otuz; });
  out.son = out.son.reverse().slice(0, 15);
  return out;
}

// Panelden açık hesap kapatma: { siparisId, islem: 'tahsil' | 'kes', not }.
// Sipariş bilgisi tarayıcıdan değil 'Açık Hesaplar' sekmesinden alınır. 'kes' ayrıca 'Kesintiler' sekmesine TL kesinti yazar (bordroda düşülür).
// Açık hesap satırına tıklanınca tek siparişin müşteri bilgisi (yalnız istenince; panel paketine girmez).
function musteriDetay_(d) {
  var id = siparisNo_(d.siparisId); if (!id) return { hata: 'Sipariş numarası yok.' };
  var ss = SpreadsheetApp.openById(KAYNAK.kurye.id), out = null;
  var s = sonSatirlar_(ss, 'Siparişler', 8000, ['Tarih', 'Sipariş ID', 'Adisyon No', 'Platform', 'Kurye', 'Sipariş Saati', 'Restorandan Çıktı', 'Teslim Saati',
    'Ödeme Yöntemi', 'Tutar (TL)', 'Sipariş İçeriği', 'Müşteri', 'Telefon', 'Adres', 'Not', 'Durum', 'Mesafe (km)']);
  if (s) { var b = s.b, k = function (h) { return kolon_(b, [h]); }, ci = k('Sipariş ID');
    for (var i = s.v.length - 1; i >= 0; i--) { var r = s.v[i]; if (siparisNo_(r[ci]) !== id) continue;
      var al = function (h) { var j = k(h); return j >= 0 ? String(r[j] || '').trim() : ''; };
      out = { kaynak: 'Siparişler', tarih: al('Tarih'), no: al('Adisyon No'), platform: al('Platform'), kurye: al('Kurye'), siparisSaati: al('Sipariş Saati'), cikti: al('Restorandan Çıktı'),
              teslim: al('Teslim Saati'), odeme: al('Ödeme Yöntemi'), tutar: sayi_(al('Tutar (TL)')), icerik: al('Sipariş İçeriği'), musteri: al('Müşteri'), telefon: al('Telefon'),
              adres: al('Adres'), not: al('Not').split(' * Müşteri Telefon Kodu')[0], durum: al('Durum'), km: sayi_(al('Mesafe (km)')) };
      break; } }
  if (!out) { var a = sonSatirlar_(ss, 'Açık Hesaplar', 2000);
    if (a) { var cb = function (h) { return kolon_(a.b, [h]); };
      a.v.forEach(function (r) { if (out || siparisNo_(r[cb('Sipariş ID')]) !== id) return; var al = function (h) { var j = cb(h); return j >= 0 ? String(r[j] || '').trim() : ''; };
        out = { kaynak: 'Açık Hesaplar', tarih: al('Tarih'), no: al('Adisyon No'), platform: al('Platform'), kurye: al('Kurye'), musteri: al('Müşteri'), telefon: al('Telefon'),
                odeme: al('Ödeme Yöntemi'), tutar: sayi_(al('Tutar (TL)')), teslim: al('Teslim Saati'), durum: al('Durum') }; }); } }
  return out ? { tamam: true, siparis: out } : { hata: 'Sipariş kurye tablosunda bulunamadı.' };
}

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
  // Kurye farklı yöntemle tahsil ettiyse (ör. sistemde kart, gerçekte nakit) gerçek yöntem yazılır, eskisi notta kalır.
  var eskiOdeme = String(r[ca.odeme] || '').trim(), odeme = String(d.odeme || '').replace(/\s+/g, ' ').trim().slice(0, 60) || eskiOdeme;
  var odemeDegisti = odeme !== eskiOdeme;
  if (odemeDegisti) not = ('Ödeme yöntemi değişti: ' + (eskiOdeme || '—') + ' → ' + odeme + (not ? ' | ' + not : '')).slice(0, 300);
  var bahsis = islem === 'tahsil' ? Math.max(0, sayi_(d.bahsis)) : 0;
  if (bahsis > 5000) return { hata: 'Bahşiş tutarı çok yüksek görünüyor; kontrol edin.' };
  if (islem === 'kes' && !(tutar > 0)) return { hata: 'Tutar okunamadı; kesinti yazılmadı.' };
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss');

  var sh = tahsilatSekmesi_(ss);
  sh.appendRow([r[ca.tarih], r[ca.no], "'" + id, kurye, odeme, tutar, islem === 'kes' ? 'Kuryeden kesildi' : 'Tahsil edildi', not, damga, 'Panel']);
  if (bahsis > 0) { // Bahşiş hesap tutarından ayrı, kendi sütununa yazılır (yoksa sütun eklenir).
    var lc = sh.getLastColumn(), hb = sh.getRange(1, 1, 1, lc).getDisplayValues()[0], cb = kolon_(hb, ['Bahşiş (TL)', 'Bahşiş']);
    if (cb < 0) { cb = lc; sh.getRange(1, cb + 1).setValue('Bahşiş (TL)').setFontWeight('bold'); }
    sh.getRange(sh.getLastRow(), cb + 1).setValue(bahsis); }

  if (islem === 'kes') {
    var ks = ss.getSheetByName('Kesintiler');
    if (!ks) { ks = ss.insertSheet('Kesintiler'); ks.appendRow(['Tarih', 'Kurye Adı', 'Kesinti Tipi (Saat / TL)', 'Kesilen Süre (Dk)', 'Kesilen Tutar (TL)', 'Açıklama']); ks.setFrozenRows(1); }
    ks.appendRow([Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy'), kurye, 'TL', '', tutar,
      'Açık hesap: adisyon ' + r[ca.no] + ', ' + r[ca.tarih] + ' (' + odeme + ')' + (not ? ' — ' + not : '')]);
  }
  var ozet = kurye + ' — adisyon ' + r[ca.no] + ', ' + tutar + ' TL: ' + (islem === 'kes' ? 'kuryeden kesildi' : 'tahsil edildi') + (bahsis ? ' + ' + bahsis + ' TL bahşiş' : '') + (odemeDegisti ? ' (ödeme: ' + eskiOdeme + ' → ' + odeme + ')' : '');
  try { cevapKaydet_('Operasyon', 'Kurye Net Çalışma Süresi › Tahsilatlar', sh.getLastRow(), 'Açık hesap kapatıldı', ozet, damga.slice(0, 16)); } catch (err) { }
  var adisyo = null; try { adisyo = tahsilatlariAdisyoyaIsle_(); } catch (err) { adisyo = { hata: String(err.message || err) }; }
  return { tamam: true, islem: islem, kurye: kurye, tutar: tutar, bahsis: bahsis, adisyo: adisyo, odeme: odeme, odemeDegisti: odemeDegisti };
}

// Panelden elle kesinti: { istekNo, kurye, tarih: 'yyyy-MM-dd', tip: 'Saat' | 'TL', miktar, aciklama, onay }.
// 'Kesintiler' sekmesine kurye panelindeki biçimde yeni satır ekler; bordroda TL hakedişten, Saat ödenen süreden düşülür.
/* ---------------- Mesai düzeltme ---------------- */
// Kurye tablosunun kural katmanı (Kural.gs 2.1) 'Mesai Düzeltme' sekmesini okur: düzeltme varsa o günün
// erken / kapanış kesintisi verilen saate göre yeniden hesaplanır, yoksa otomatik hesap kalır.
// Kontrol listesi: son paketten sonra 15 dk'dan fazla boşta kalınıp otomatik kuralın kesmediği günler
// (vardiyası olmayan ya da vardiyasından erken çıkan kurye) ve kuralın 'kontrol et' dediği günler.
var MESAI_KONTROL_DK = 15;
var MESAI_DUZELTME_BASLIK = ['Tarih', 'Kurye', 'Esas Giriş', 'Esas Çıkış', 'Yöntem', 'Açıklama', 'Giren', 'Kayıt Zamanı'];
// Kural katmanını tetiklemek için kurye tablosunun Köprü web uygulaması. Repoda boş; anahtar ilk kullanımda
// Script Properties'e (KOPRU_URL, KOPRU_ANAHTAR) yazılır, sonraki sürümler oradan okur.
var KURAL_KOPRU = { url: '', anahtar: '' };

function dkOku_(v) { var m = String(v == null ? '' : v).trim().match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function hmYaz_(dk) { var d = ((Math.round(dk) % 1440) + 1440) % 1440, p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(Math.floor(d / 60)) + ':' + p(d % 60); }

function mesaiKontrolSatiri_(r, cm, gun, ad, net, paket, kapanis, acik) {
  if (acik || cm.son < 0) return null;
  var durum = String(r[cm.durum] || '');
  if (/düzeltildi|onaylı|yok sayıldı/i.test(durum)) return null;
  var g = dkOku_(r[cm.g]), cik = dkOku_(r[cm.cik]), son = dkOku_(r[cm.son]), pc = dkOku_(r[cm.pc]), mk = cm.makul >= 0 ? dkOku_(r[cm.makul]) : null;
  if (g === null || cik === null) return null;
  var ileri = function (t) { return t !== null && t < g ? t + 1440 : t; };
  cik = ileri(cik); son = ileri(son); pc = pc === null ? null : ileri(pc); mk = ileri(mk);
  var kontrolEt = /kontrol et/i.test(durum), bosta = 0, neden = '';
  if (son !== null) {
    var odenenSon = kapanis > 0 && mk !== null ? mk : cik;
    bosta = Math.max(0, Math.round(odenenSon - son));
  }
  if (bosta > MESAI_KONTROL_DK && pc === null) neden = 'Vardiyası yok; son paketten sonra ' + bosta + ' dk çevrimiçi kalmış ve kesilmedi';
  else if (bosta > MESAI_KONTROL_DK && cik < pc - 3) neden = 'Vardiyadan erken çıkmış (plan bitişi ' + hmYaz_(pc) + ', çıkış ' + hmYaz_(cik) + '); son paketten sonraki ' + bosta + ' dk kesilmedi';
  else if (kontrolEt) neden = 'Kural ' + kapanis + ' dk kesti (45 dk üstü) — çıkış unutulmuş olabilir';
  else return null;
  return { gun: gun, tarih: String(r[cm.tarih] || '').trim(), ad: ad, plan: [r[cm.pg], r[cm.pc]].filter(String).join('–'), giris: r[cm.g] || '', cikis: r[cm.cik] || '',
           son: son !== null ? hmYaz_(son) : '', bosta: bosta, net: net, paket: paket, kapanis: kapanis, neden: neden };
}

function mesaiDuzeltmeListesi_(ss, enEski) {
  var t = sonSatirlar_(ss, 'Mesai Düzeltme', 400); if (!t) return [];
  var c = { tarih: kolon_(t.b, ['Tarih']), ad: kolon_(t.b, ['Kurye']), g: kolon_(t.b, ['Esas Giriş']), cik: kolon_(t.b, ['Esas Çıkış']), y: kolon_(t.b, ['Yöntem']),
            not: kolon_(t.b, ['Açıklama']), kim: kolon_(t.b, ['Giren']), z: kolon_(t.b, ['Kayıt Zamanı']) };
  var al = function (r, i) { return i >= 0 ? String(r[i] || '').trim() : ''; };
  return t.v.map(function (r) { var gun = gunStr_(r[c.tarih]); if (!gun || gun < enEski) return null;
    return { gun: gun, tarih: al(r, c.tarih), ad: al(r, c.ad), giris: al(r, c.g), cikis: al(r, c.cik), yontem: al(r, c.y), not: al(r, c.not).slice(0, 120), kim: al(r, c.kim), zaman: al(r, c.z) };
  }).filter(Boolean).reverse().slice(0, 60);
}

// d: { islem: 'sonPaket' | 'saat' | 'onay' | 'sil', tarih: 'yyyy-mm-dd', kurye, giris, cikis, aciklama }
function mesaiDuzelt_(d) {
  var ad = String(d.kurye || '').replace(/\s+/g, ' ').trim().slice(0, 60); if (!ad) return { hata: 'Kurye yok.' };
  var m = String(d.tarih || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return { hata: 'Tarih okunamadı.' };
  var tarihYazi = m[3] + '.' + m[2] + '.' + m[1];
  var islem = String(d.islem || ''), saat = function (v) { var x = String(v || '').trim(); if (!x) return ''; var k = x.match(/^(\d{1,2}):(\d{2})$/); return k && +k[1] < 24 && +k[2] < 60 ? (k[1].length < 2 ? '0' : '') + k[1] + ':' + k[2] : null; };
  var giris = saat(d.giris), cikis = saat(d.cikis), aciklama = String(d.aciklama || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (giris === null || cikis === null) return { hata: 'Saati SS:DD biçiminde yazın (örn. 19:33).' };
  var yontem = { sonPaket: 'Son paket', saat: 'Saat', onay: 'Olduğu gibi' }[islem];
  if (islem !== 'sil' && !yontem) return { hata: 'Bilinmeyen işlem.' };
  if (islem === 'sonPaket' && !cikis) return { hata: 'Son paket saati yok; saat girerek düzeltin.' };
  if (islem === 'saat' && !giris && !cikis) return { hata: 'Esas giriş ya da esas çıkış saatini yazın.' };
  if (islem === 'saat' && !aciklama) return { hata: 'Kısa bir açıklama yazın (kurye itiraz ederse bu satıra bakılacak).' };

  var ss = SpreadsheetApp.openById(KAYNAK.kurye.id), sh = ss.getSheetByName('Mesai Düzeltme');
  if (!sh) {
    sh = ss.insertSheet('Mesai Düzeltme');
    sh.getRange(1, 1, 1, MESAI_DUZELTME_BASLIK.length).setValues([MESAI_DUZELTME_BASLIK]).setBackground('#134f5c').setFontColor('#ffffff').setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), 4).setNumberFormat('@'); sh.setFrozenRows(1);
  }
  var damga = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm'), ozet;
  if (islem === 'sil') {
    var n = 0;
    if (sh.getLastRow() >= 2) {
      var v = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues();
      for (var i = v.length - 1; i >= 0; i--) if (gunStr_(v[i][0]) === m[1] + '-' + m[2] + '-' + m[3] && norm_(v[i][1]) === norm_(ad)) { sh.deleteRow(i + 2); n++; }
    }
    if (!n) return { hata: 'Bu güne ait düzeltme bulunamadı.' };
    ozet = ad + ' ' + tarihYazi + ' düzeltmesi geri alındı; otomatik hesap geçerli.';
  } else {
    if (islem === 'onay') { giris = ''; cikis = ''; }
    var no = sh.getLastRow() + 1;
    sh.getRange(no, 1, 1, 4).setNumberFormat('@');
    sh.getRange(no, 1, 1, MESAI_DUZELTME_BASLIK.length).setValues([[tarihYazi, ad, giris, cikis, yontem, aciklama, 'Panel', damga]]);
    ozet = ad + ' ' + tarihYazi + ': ' + (islem === 'onay' ? 'otomatik hesap onaylandı' : [giris ? 'esas giriş ' + giris : '', cikis ? 'esas çıkış ' + cikis : ''].filter(String).join(', ') + ' (' + yontem.toLowerCase() + ')');
    try { cevapKaydet_('Operasyon', 'Kurye Net Çalışma Süresi › Mesai Düzeltme', no, 'Mesai düzeltme ' + tarihYazi, ozet + (aciklama ? ' — ' + aciklama : ''), damga); } catch (err) { }
  }
  var y = kuralYenile_();
  return { tamam: true, ozet: ozet, yenilendi: y.ok, not: y.not || '' };
}

// Bir kez editörden çalıştır: dış istek iznini onaylatır ve kurye tablosunu yeniden hesaplatır.
function kuralBaglantiTesti() { var y = kuralYenile_(); Logger.log(y.ok ? 'Bağlantı tamam: Günlük Mesai yeniden hesaplandı.' : y.not); return y; }

// Kurye tablosundaki kural katmanını (kuraliUygula) Köprü web uygulaması üzerinden çalıştırır.
function kuralYenile_() {
  var p = PropertiesService.getScriptProperties(), url = p.getProperty('KOPRU_URL'), anahtar = p.getProperty('KOPRU_ANAHTAR');
  if ((!url || !anahtar) && KURAL_KOPRU.url && KURAL_KOPRU.anahtar) { url = KURAL_KOPRU.url; anahtar = KURAL_KOPRU.anahtar; p.setProperties({ KOPRU_URL: url, KOPRU_ANAHTAR: anahtar }); }
  if (!url || !anahtar) return { ok: false, not: 'Düzeltme kaydedildi; tablo, kurye tablosunda Kurye Sistemi › VERİYİ ÇEK ve TÜMÜNÜ YENİLE ya da köprünün bir sonraki çalışmasında yeniden hesaplanır (KOPRU_URL ayarlı değil).' };
  try {
    var r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ anahtar: anahtar, tur: 'kural' }), muteHttpExceptions: true, followRedirects: true });
    var j = JSON.parse(r.getContentText());
    if (j && j.ok) return { ok: true };
    return { ok: false, not: 'Düzeltme kaydedildi ama tablo yeniden hesaplanamadı: ' + ((j && j.hata) || 'bilinmeyen hata') + '. Kurye Sistemi › VERİYİ ÇEK ve TÜMÜNÜ YENİLE çalıştırın.' };
  } catch (err) {
    return { ok: false, not: 'Düzeltme kaydedildi ama kurye tablosuna ulaşılamadı (' + String(err.message || err).slice(0, 80) + '). Kurye Sistemi › VERİYİ ÇEK ve TÜMÜNÜ YENİLE çalıştırın.' };
  }
}

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
    var durum = String(r[c.durum] || ''); if (iptalMi_(durum)) return;
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
      if (iptalMi_(r[ck.durum])) return; var ad = String(r[ck.kurye] || '').trim(); if (ad) kAdlar[ad] = 1;
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
    if (c.durum >= 0 && iptalMi_(r[c.durum])) return;
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
  if (d.tur === 'mesaiDuzelt') {
    var kmd = LockService.getScriptLock(); kmd.waitLock(20000);
    try { return json_(mesaiDuzelt_(d)); } catch (err) { return json_({ hata: String(err.message || err) }); }
    finally { kmd.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  if (d.tur === 'kokpit') {
    var kkp = LockService.getScriptLock(); kkp.waitLock(20000);
    try { return json_(kokpitCevap_(d)); } catch (err) { return json_({ hata: String(err.message || err) }); }
    finally { kkp.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  if (d.tur === 'panoNot') {
    var kpn = LockService.getScriptLock(); kpn.waitLock(20000);
    try { return json_(panoNot_(d)); } catch (err) { return json_({ hata: String(err.message || err) }); }
    finally { kpn.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  if (d.tur === 'iadeIslem') {
    var kii = LockService.getScriptLock(); kii.waitLock(20000);
    try { return json_(iadeIslem_(d)); } catch (err) { return json_({ hata: String(err.message || err) }); }
    finally { kii.releaseLock(); }
  }
  if (d.tur === 'yorumOnay') {
    var kyo = LockService.getScriptLock(); kyo.waitLock(20000);
    try { return json_(yorumOnay_(d)); } catch (err) { return json_({ hata: String(err.message || err) }); }
    finally { kyo.releaseLock(); }
  }
  if (d.tur === 'musteri') {
    try { return json_(musteriDetay_(d)); } catch (err) { return json_({ hata: String(err.message || err) }); }
  }
  if (d.tur === 'setcardFatura') {
    var ksf = LockService.getScriptLock(); ksf.waitLock(25000);
    try { return json_(setcardFaturaIslem_(d)); } catch (err) { return json_({ hata: String(err.message || err) }); }
    finally { ksf.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  if (d.tur === 'pluxeeFatura') {
    var kpf = LockService.getScriptLock(); kpf.waitLock(20000);
    try { return json_(pluxeeFaturaIslem_(d)); } catch (err) { return json_({ hata: String(err.message || err) }); }
    finally { kpf.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  if (d.tur === 'hesap') {
    var kh = LockService.getScriptLock(); kh.waitLock(20000);
    try { return json_(hesapKapat_(d)); }
    finally { kh.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  if (d.tur === 'vardiya') {
    var kv = LockService.getScriptLock(); kv.waitLock(20000);
    try { return json_(vardiyaGir_(d)); }
    finally { kv.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  if (d.tur === 'avans') {
    var kav = LockService.getScriptLock(); kav.waitLock(20000);
    try { return json_(avansGir_(d)); }
    finally { kav.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  if (d.tur === 'odeme') {
    var k = LockService.getScriptLock(); k.waitLock(20000);
    try { return json_(toptanciOdemeGir_(d)); }
    finally { k.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
  }
  if (d.tur === 'fis') {
    var kf = LockService.getScriptLock(); kf.waitLock(20000);
    try { return json_(fisKaydet_(d)); }
    finally { kf.releaseLock(); CacheService.getScriptCache().remove('panel_v1_n'); }
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

// Adisyo 'İPTAL' yazar: /iptal/i büyük İ'yi tanımaz, bu yüzden norm_ üzerinden bakılır.
function iptalMi_(v) { var n = norm_(v); return n.indexOf('iptal') >= 0 || n.indexOf('iade') >= 0; }
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