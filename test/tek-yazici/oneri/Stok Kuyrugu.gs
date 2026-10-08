// STOK KUYRUĞU — TEK YAZICI v2 (öneri, 08.10.2026; canlıya kurulmadı — onay bekliyor)
//
// NEDEN: Apps Script'te kilit (LockService.getScriptLock) yalnız kendi projesinde geçerli; belge kilidi yalnız dosyaya bağlı
// projede kullanılabilir, mutfak paneli ise bağımsız bir proje. İki proje AYNI kilidi paylaşamaz.
// ÇÖZÜM: Sube_Stok'a YALNIZ bu proje (stok-takip-sistemi) yazar. Satış Motoru, Alış Motoru ve bu kuyruk işleyicisi aynı
// getScriptLock altında sırayla çalışır. Mutfak paneli stok etkisini Stok_Kuyrugu sekmesine EKLER, Sube_Stok'a dokunmaz.
//
// DURUMLAR: BEKLIYOR → ISLENIYOR → ISLENDI   (HATA: elle bakılmalı, otomatik tekrar yok)
// YARIDA KESİLME: önce her satırın planı (eski → yeni) ISLENIYOR ile birlikte kuyruğa yazılır, sonra stok, sonra hareket izi,
// en son ISLENDI. Sonraki çalışma ISLENIYOR satırlarda Sube_Stok'taki değere bakar: plandaki YENİ değerse stok yazılmıştır →
// eksik iz tamamlanır, ISLENDI; ESKİ değerse yazılmamıştır → yeniden işlenir; ikisi de değilse HATA. Böylece ikinci etki olmaz.
// (Bu kontrol geçerlidir çünkü kesintiden sonra Sube_Stok'a ilk dokunan yine bu işleyicidir: Satış ve Alış Motoru önce bunu çağırır.)
//
// SAYIM ANI: sayım, sayıldığı ana (İşlem_Zamani) göre uygulanır.
//  - Sayımdan önce verilmiş ama henüz Satış Motoru'nca düşülmemiş sipariş varsa sayım BEKLER (en çok SK_SAYIM_BEKLEME_SAAT).
//  - Yeni stok = sayılan + sayımdan SONRA olmuş hareketler (olay zamanına göre) − sayımdan SONRA verilmiş siparişlerin düşümü.
//  - Sayımdan önceki bir zamana ait geç girilmiş kayıt (üretim, zayi, transfer) stoku DEĞİŞTİRMEZ: sayım onu zaten içerir.
//  - Daha yeni bir sayım/düzeltme varsa eski sayım yalnız geçmişe yazılır.

var SK_SEKME = 'Stok_Kuyrugu';
var SK_BASLIK = ['Kuyruk_ID', 'Giris_Zamani', 'Islem_Zamani', 'Sube', 'Urun_Adi', 'Tip', 'Tur', 'Delta', 'Mutlak', 'Detay', 'Sorumlu', 'Durum', 'Islenme', 'Sonuc'];
var SK_K = { ID: 0, GIRIS: 1, ISLEM: 2, SUBE: 3, URUN: 4, TIP: 5, TUR: 6, DELTA: 7, MUTLAK: 8, DETAY: 9, SORUMLU: 10, DURUM: 11, ISLENME: 12, SONUC: 13 };
var SK_AZAMI = 300;                 // bir çalışmada en çok işlenecek kayıt (aynı istekten gelenler bölünmez)
var SK_SAYIM_BEKLEME_SAAT = 3;      // sayım öncesi açık sipariş kapanmazsa en çok bu kadar beklenir
var SK_GECIKME_UYARI_DK = 10;       // bu kadar dakikadır bekleyen kayıt varsa uyarı
var SK_HAREKET_PENCERE = 5000;      // sayım hesabında bakılan son Stok_Hareketleri satırı
var SK_HAZIRLIK_DK = 10;            // şube çıkışından önceki hazırlık (pişirme + kutulama) varsayımı
var SK_PENCERE_DK = 30;             // tüketim penceresi: şube çıkışından en çok bu kadar önce başlar
var SK_TAHMIN_DK = 18;              // şube çıkışı yoksa: siparişten tüketime ortanca süre (Satış dosyası, son 5.160 kapalı sipariş)
var SK_TAHMIN_UST_DK = 33;          // … ve %90'lık üst sınır
var SK_TEST = null;                 // yalnız test ortamı doldurur: { kesinti: 'plan' | 'yeniSatir' | 'stok' | 'iz' }

/** Zamanlı tetikleyici (her dakika). Satış/Alış Motoru çalışıyorsa kilidi alamaz; kayıt kuyrukta bekler, sonraki dakika işlenir. */
function stokKuyruguTetik() {
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    var kacan = (Number(props.getProperty('SK_KILIT_KACIRMA')) || 0) + 1;
    props.setProperty('SK_KILIT_KACIRMA', String(kacan));
    if (kacan >= 10) sk_uyar_('kilit', 'Stok kuyruğu ' + kacan + ' kez üst üste kilit alamadı (Satış/Alış Motoru uzun sürüyor olabilir). Kayıtlar kuyrukta bekliyor, kaybolmadı.');
    return;
  }
  var sonuc;
  try {
    props.setProperty('SK_KILIT_KACIRMA', '0');
    sonuc = stokKuyruguIsle_(SpreadsheetApp.openById(STOK_DOSYA_ID));
  } finally { lock.releaseLock(); }
  sk_uyarilar_(sonuc);
}

function sk_kucuk_(s) { return (s || '').toString().replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase(); }
function sk_n_(x) { return sk_kucuk_(x).replace(/[\s.,\-*\/()\\'"]/g, ''); }
function sk_anahtar_(ad, tip, sube) { return sk_n_(ad) + '|' + (tip || '').toString().toUpperCase().trim() + '|' + sk_n_(sube); }   // panelin stokKey'i ile aynı
function sk_adSube_(ad, sube) { return sk_n_(ad) + '|' + sk_n_(sube); }
function sk_yuv_(n) { return Math.round(Number(n) * 1000) / 1000; }
function sk_zaman_(v) {
  if (v instanceof Date) return v.getTime();
  if (v === '' || v == null) return NaN;
  var s = String(v).trim(), m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  return Date.parse(s);
}
function sk_istek_(id) { return String(id).split(':')[0]; }
function sk_mutlakMi_(r) { return r[SK_K.MUTLAK] !== '' && r[SK_K.MUTLAK] !== null && r[SK_K.MUTLAK] !== undefined; }
function sk_test_(nokta) { if (SK_TEST && SK_TEST.kesinti === nokta) { SpreadsheetApp.flush(); throw new Error('TEST KESİNTİSİ: ' + nokta); } }

/**
 * Kilit ÇAĞIRANDA olmalı (stokKuyruguTetik, stokMotoru ya da alisIsle içinden).
 * secenek: { simdi, satis: {tuketim:{id:{erken,gec,nokta,kaynak}}, bekleyen:{sube:[{erken,nokta,kesin}]}} (test için) }
 */
function stokKuyruguIsle_(ss, secenek) {
  secenek = secenek || {};
  var simdi = secenek.simdi || new Date();
  var sonuc = { islenen: 0, tamamlanan: 0, yeniden: 0, hata: [], degismeyen: 0, bekleyenSayim: 0, bekleyen: 0, enEskiBekleyenDk: 0, notlar: [] };
  var q = ss.getSheetByName(SK_SEKME);
  if (!q || q.getLastRow() < 2) return sonuc;
  var props = PropertiesService.getScriptProperties();
  var son = q.getLastRow();
  var bas = Number(props.getProperty('SK_ILK_ACIK')) || 2;
  if (bas < 2 || bas > son + 1) bas = 2;
  if (bas > son) return sonuc;
  var qv = q.getRange(bas, 1, son - bas + 1, 14).getValues();

  var st = ss.getSheetByName('Sube_Stok');
  var har = ss.getSheetByName('Stok_Hareketleri');
  var stokSon = st.getLastRow();
  var rows = stokSon > 1 ? st.getRange(2, 1, stokSon - 1, 9).getValues() : [];
  var eskiSayi = rows.length, idx = {};
  rows.forEach(function (r, i) { if (r[0] !== '') idx[sk_anahtar_(r[0], r[1], r[2])] = i; });

  // ---------- 1) Önceki yarım çalışma ----------
  var yarim = [];
  qv.forEach(function (r, i) { if (r[SK_K.DURUM] === 'ISLENIYOR') yarim.push(i); });
  var tamamlanacakIz = [];
  if (yarim.length) {
    var izler = sk_hareketIzleri_(har);
    yarim.forEach(function (i) {
      var r = qv[i], p = null;
      try { p = JSON.parse(r[SK_K.SONUC]); } catch (e) {}
      var satir = idx[sk_anahtar_(r[SK_K.URUN], r[SK_K.TIP], r[SK_K.SUBE])];
      var mevcut = satir === undefined ? null : sk_yuv_(rows[satir][3]);
      if (!p || p.k === undefined) { sk_hata_(qv, i, simdi, 'Yarım kaldı ve planı okunamadı: elle kontrol edin', sonuc); return; }
      if (mevcut !== null && mevcut === p.Y && (p.Y !== p.E || izler[r[SK_K.ID]])) {
        if (!izler[r[SK_K.ID]]) tamamlanacakIz.push(sk_izSatiri_(r, p.e, p.y, p.not));
        r[SK_K.DURUM] = 'ISLENDI'; r[SK_K.ISLENME] = simdi;
        r[SK_K.SONUC] = sk_sonucMetni_(p) + ' · kesintiden sonra tamamlandı';
        sonuc.tamamlanan++;
      } else if ((mevcut === null && p.n) || mevcut === p.E) {
        r[SK_K.DURUM] = 'BEKLIYOR'; r[SK_K.SONUC] = 'Kesintide stok yazılmamıştı; yeniden işlenecek';
        sonuc.yeniden++;
      } else {
        sk_hata_(qv, i, simdi, 'Yarım kaldı: stok ' + mevcut + ', plan ' + p.E + ' → ' + p.Y + '. Elle kontrol edin (otomatik tekrar yok)', sonuc);
      }
    });
    // Eksik izler HEMEN yazılır, durumlar hemen ardından: araya kesinti girse de iz kaybolmaz (iz varsa bir sonraki tur yine ISLENDI der)
    if (tamamlanacakIz.length) { har.getRange(har.getLastRow() + 1, 1, tamamlanacakIz.length, 10).setValues(tamamlanacakIz); SpreadsheetApp.flush(); }
    sk_durumlariYaz_(q, bas, qv); SpreadsheetApp.flush();
  }

  // ---------- 2) İşlenecekler (geliş sırasıyla; sayım hazır değilse bekler) ----------
  var adaylar = [];
  qv.forEach(function (r, i) { if (r[SK_K.DURUM] === 'BEKLIYOR') adaylar.push(i); });
  var satis = null;
  var satis_ = function () { return satis || (satis = secenek.satis || sk_satisBilgisi_()); };
  var secilen = [], sonIstek = null;
  for (var a = 0; a < adaylar.length; a++) {
    var i = adaylar[a], r = qv[i];
    if (secilen.length >= SK_AZAMI && sk_istek_(r[SK_K.ID]) !== sonIstek) break;
    if (sk_mutlakMi_(r) && r[SK_K.TUR] === 'Sayim') {
      var tc = sk_zaman_(r[SK_K.ISLEM]);
      // Bekleme yalnız "sayımdan önce tüketilmiş olabilecek ama henüz düşülmemiş" sipariş varsa:
      // şube çıkışı belliyse tüketim noktası sayımdan önce olanlar; çıkışı belli değilse sipariş saati sayımdan önce olanlar.
      var acik = (satis_().bekleyen[sk_n_(r[SK_K.SUBE])] || []).some(function (b) { return b.kesin ? b.nokta <= tc : b.erken <= tc; });
      if (acik) {
        var beklenen = (simdi.getTime() - tc) / 3600000;
        if (beklenen < SK_SAYIM_BEKLEME_SAAT) {
          r[SK_K.SONUC] = 'Sayım bekliyor: sayımdan önce verilmiş sipariş(ler) henüz stoktan düşülmedi'; sonuc.bekleyenSayim++; continue;
        }
        r._uyari = 'Sayımdan önce açılmış sipariş ' + SK_SAYIM_BEKLEME_SAAT + ' saattir kapanmadı; kapanınca ikinci kez düşülebilir — kontrol edin';
      }
    }
    secilen.push(i); sonIstek = sk_istek_(r[SK_K.ID]);
  }

  // ---------- 3) Hesap (bellekte) ----------
  var ctx = null, plan = {};
  var ctx_ = function () { return ctx || (ctx = sk_hareketBaglami_(ss, har, rows, idx)); };
  var yeniSatirlar = [], degisen = {}, sayimSatiri = {}, izSatirlari = [];
  var anahtarIlk = {}, anahtarSon = {}, anahtarYeni = {};
  var batch = Utilities.getUuid().slice(0, 8);
  secilen.forEach(function (i) {
    var k = qv[i];
    var anahtar = sk_anahtar_(k[SK_K.URUN], k[SK_K.TIP], k[SK_K.SUBE]);
    var r = idx[anahtar];
    if (r === undefined) {
      rows.push([k[SK_K.URUN], String(k[SK_K.TIP] || '').toUpperCase(), k[SK_K.SUBE], 0, 0, '', '', 0, simdi]);
      r = rows.length - 1; idx[anahtar] = r; anahtarYeni[anahtar] = true;
    }
    var eski = sk_yuv_(rows[r][3]), eskiT = sk_yuv_(rows[r][4]), yeni = eski, yeniT = eskiT, not = '';
    var t = sk_zaman_(k[SK_K.ISLEM]);
    var as = sk_adSube_(k[SK_K.URUN], k[SK_K.SUBE]);
    if (sk_mutlakMi_(k)) {
      var c = ctx_();
      var dahaYeni = Math.max(c.sonMutlak[as] || 0, sk_zaman_(rows[r][6]) || 0);
      if (dahaYeni > t) {
        not = 'Daha yeni sayım/düzeltme var; yalnız geçmişe yazıldı, stok değişmedi'; sonuc.degismeyen++;
      } else {
        var sonra = sk_sayimSonrasi_(c, satis_, k[SK_K.URUN], k[SK_K.TIP], k[SK_K.SUBE], t);
        yeni = yeniT = sk_yuv_(Number(k[SK_K.MUTLAK]) + sonra.toplam);
        not = 'Sayılan ' + sk_yuv_(k[SK_K.MUTLAK]) + (sonra.toplam ? ' · sayımdan sonraki hareket ' + sonra.toplam : '') + (sonra.not ? ' · ' + sonra.not : '');
        if (k[SK_K.TUR] === 'Sayim') sayimSatiri[r] = [sk_yuv_(k[SK_K.MUTLAK]), new Date(t), sk_yuv_(yeni - eskiT)];
        c.sonMutlak[as] = t;
      }
    } else {
      var sonSayim = Math.max(ctx_().sonMutlak[as] || 0, sk_zaman_(rows[r][6]) || 0);
      if (sonSayim > t) {
        not = 'Sayımdan (' + sk_saat_(sonSayim) + ') önceye ait; sayım bunu zaten içeriyor, stok değişmedi'; sonuc.degismeyen++;
      } else {
        yeni = sk_yuv_(eski + Number(k[SK_K.DELTA])); yeniT = sk_yuv_(eskiT + Number(k[SK_K.DELTA]));
        ctx_().bekleyenHareket.push({ as: as, t: t, d: sk_yuv_(yeni - eski) });
      }
    }
    if (k._uyari) { not += (not ? ' · ' : '') + k._uyari; sonuc.notlar.push(k[SK_K.ID] + ': ' + k._uyari); }
    rows[r][3] = yeni; rows[r][4] = yeniT; rows[r][8] = simdi; degisen[r] = 1;
    if (!(anahtar in anahtarIlk)) anahtarIlk[anahtar] = eski;
    anahtarSon[anahtar] = yeni;
    plan[i] = { b: batch, k: anahtar, e: eski, y: yeni, n: !!anahtarYeni[anahtar], not: not };
    izSatirlari.push(sk_izSatiri_(k, eski, yeni, not));
  });
  secilen.forEach(function (i) { plan[i].E = anahtarIlk[plan[i].k]; plan[i].Y = anahtarSon[plan[i].k]; });

  // ---------- 4) Yaz: plan → yeni satırlar → stok → iz → ISLENDI ----------
  if (secilen.length) {
    secilen.forEach(function (i) { qv[i][SK_K.DURUM] = 'ISLENIYOR'; qv[i][SK_K.ISLENME] = simdi; qv[i][SK_K.SONUC] = JSON.stringify(plan[i]); });
    sk_durumlariYaz_(q, bas, qv); SpreadsheetApp.flush(); sk_test_('plan');
    if (rows.length > eskiSayi) {
      st.getRange(2 + eskiSayi, 1, rows.length - eskiSayi, 9).setValues(rows.slice(eskiSayi));
      SpreadsheetApp.flush(); sk_test_('yeniSatir');
    }
    if (eskiSayi) {
      // Tek seferde, tek blok: ya hepsi yazılır ya hiçbiri (yarım stok olmaz)
      st.getRange(2, 4, eskiSayi, 2).setValues(rows.slice(0, eskiSayi).map(function (x) { return [x[3], x[4]]; }));
      SpreadsheetApp.flush(); sk_test_('stok');
      Object.keys(degisen).forEach(function (r) { r = Number(r); if (r < eskiSayi) st.getRange(r + 2, 9).setValue(simdi); });
      Object.keys(sayimSatiri).forEach(function (r) { r = Number(r); if (r < eskiSayi) st.getRange(r + 2, 6, 1, 3).setValues([sayimSatiri[r]]); });
    }
  }
  if (izSatirlari.length) { har.getRange(har.getLastRow() + 1, 1, izSatirlari.length, 10).setValues(izSatirlari); SpreadsheetApp.flush(); sk_test_('iz'); }
  secilen.forEach(function (i) {
    qv[i][SK_K.DURUM] = 'ISLENDI'; qv[i][SK_K.ISLENME] = simdi; qv[i][SK_K.SONUC] = sk_sonucMetni_(plan[i]);
  });
  sonuc.islenen = secilen.length;
  if (secilen.length || sonuc.bekleyenSayim) sk_durumlariYaz_(q, bas, qv);

  // ---------- 5) İşaretçi ve durum özeti ----------
  var ilkAcik = qv.length;
  for (var j = 0; j < qv.length; j++) { if (qv[j][SK_K.DURUM] !== 'ISLENDI' && qv[j][SK_K.DURUM] !== 'HATA') { ilkAcik = j; break; } }
  props.setProperty('SK_ILK_ACIK', String(bas + ilkAcik));
  qv.forEach(function (r) {
    if (r[SK_K.DURUM] !== 'BEKLIYOR') return;
    sonuc.bekleyen++;
    var dk = (simdi.getTime() - sk_zaman_(r[SK_K.GIRIS])) / 60000;
    if (!sk_mutlakMi_(r) && dk > sonuc.enEskiBekleyenDk) sonuc.enEskiBekleyenDk = Math.round(dk);
  });
  props.setProperty('SK_DURUM', JSON.stringify({ zaman: simdi.toISOString(), islenen: sonuc.islenen, bekleyen: sonuc.bekleyen,
    bekleyenSayim: sonuc.bekleyenSayim, enEskiBekleyenDk: sonuc.enEskiBekleyenDk, hata: sonuc.hata.length, tamamlanan: sonuc.tamamlanan }));
  return sonuc;
}

function sk_saat_(ms) { var d = new Date(ms); return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function sk_sonucMetni_(p) { return p.e + ' → ' + p.y + (p.not ? ' · ' + p.not : ''); }
function sk_hata_(qv, i, simdi, metin, sonuc) { qv[i][SK_K.DURUM] = 'HATA'; qv[i][SK_K.ISLENME] = simdi; qv[i][SK_K.SONUC] = metin; sonuc.hata.push(qv[i][SK_K.ID] + ': ' + metin); }

/** Stok_Hareketleri satırı. Tarih = İŞLEM zamanı (olayın olduğu an); giriş zamanı farklıysa Detay'a yazılır. */
function sk_izSatiri_(k, eski, yeni, not) {
  var t = sk_zaman_(k[SK_K.ISLEM]), g = sk_zaman_(k[SK_K.GIRIS]);
  var gec = (g - t) > 10 * 60000 ? ' · giriş ' + sk_saat_(g) : '';
  return [new Date(t), k[SK_K.SUBE], k[SK_K.URUN], k[SK_K.TUR], eski, yeni, '', '',
    'KUYRUK:' + k[SK_K.ID] + (k[SK_K.DETAY] ? ' · ' + k[SK_K.DETAY] : '') + gec + (not ? ' · ' + not : ''), k[SK_K.SORUMLU]];
}

/** Kuyruğun Durum | Islenme | Sonuc sütunlarını okunan aralık için tek seferde yazar. */
function sk_durumlariYaz_(q, bas, qv) {
  q.getRange(bas, SK_K.DURUM + 1, qv.length, 3).setValues(qv.map(function (r) { return [r[SK_K.DURUM], r[SK_K.ISLENME], r[SK_K.SONUC]]; }));
}

/** Stok_Hareketleri'nin son satırlarındaki KUYRUK:<id> izleri */
function sk_hareketIzleri_(har) {
  var son = har.getLastRow(), izler = {};
  if (son < 2) return izler;
  var bas = Math.max(2, son - SK_HAREKET_PENCERE + 1);
  har.getRange(bas, 9, son - bas + 1, 1).getValues().forEach(function (r) {
    var m = String(r[0]).match(/^KUYRUK:([^ ]+)/);
    if (m) izler[m[1]] = true;
  });
  return izler;
}

/** Sayım hesabı için son hareketler (olay zamanıyla) ve son sayım/düzeltme zamanları. */
function sk_hareketBaglami_(ss, har, rows, idx) {
  var c = { hareket: [], sonMutlak: {}, bekleyenHareket: [], satisH: null, ss: ss };
  var son = har.getLastRow();
  if (son >= 2) {
    var bas = Math.max(2, son - SK_HAREKET_PENCERE + 1);
    har.getRange(bas, 1, son - bas + 1, 6).getValues().forEach(function (r) {
      var t = sk_zaman_(r[0]); if (isNaN(t)) return;
      var as = sk_adSube_(r[2], r[1]), tur = String(r[3]);
      if (tur === 'Sayim' || tur === 'Duzeltme') { if (!(c.sonMutlak[as] > t)) c.sonMutlak[as] = t; return; }
      if (tur === 'Satis') return;   // satış düşümü sipariş zamanıyla Satis_Hareketleri'nden hesaplanır
      c.hareket.push({ as: as, t: t, d: (Number(r[5]) || 0) - (Number(r[4]) || 0), tur: tur });
    });
  }
  return c;
}

/** Sayım anından SONRA olan etki: diğer hareketler + bu çalışmada önce işlenenler − sayımdan sonra verilmiş siparişlerin düşümü. */
function sk_sayimSonrasi_(c, satis_, ad, tip, sube, t) {
  var as = sk_adSube_(ad, sube), toplam = 0, aynGunAlis = false;
  c.hareket.forEach(function (h) {
    if (h.as !== as) return;
    if (h.t > t) toplam += h.d;
    if (h.tur === 'Alis' && new Date(h.t).toDateString() === new Date(t).toDateString()) aynGunAlis = true;
  });
  c.bekleyenHareket.forEach(function (h) { if (h.as === as && h.t > t) toplam += h.d; });
  // Satış: Satis_Hareketleri (en yeni üstte) sipariş bazında; sipariş zamanı satış dosyasından
  if (!c.satisH) {
    c.satisH = [];
    var sh = c.ss.getSheetByName('Satis_Hareketleri');
    if (sh && sh.getLastRow() > 1) c.satisH = sh.getRange(2, 1, Math.min(SK_HAREKET_PENCERE, sh.getLastRow() - 1), 11).getValues();
  }
  // Her siparişin tüketim zamanı bir PENCEREDİR (sipariş saati değil): sayım pencerenin dışındaysa kesin, içindeyse belirsiz.
  // Belirsizde karar tahmini noktaya göre verilir; belirsiz miktar ayrıca yazılır (sayım raporunda görünür).
  var tuk = satis_().tuketim, tipU = String(tip || '').toUpperCase(), belirsiz = 0, belirsizMiktar = 0, tahmin = 0;
  c.satisH.forEach(function (r) {
    if (sk_adSube_(r[2], r[1]) !== as || String(r[3]).toUpperCase() !== tipU) return;
    var z = tuk[String(r[10])]; if (!z) return;
    var m = Number(r[7]) || 0;
    if (z.nokta > t) toplam -= m;
    if (z.erken <= t && t < z.gec) { belirsiz++; belirsizMiktar += m; }
    if (z.kaynak !== 'cikis' && z.erken <= t + SK_TAHMIN_UST_DK * 60000 && z.gec >= t - SK_TAHMIN_UST_DK * 60000) tahmin++;
  });
  var notlar = [];
  if (aynGunAlis) notlar.push('Aynı gün alış faturası var (fatura saati yok) — sayımdan önce mi sonra mı geldiğini kontrol edin');
  if (belirsiz) notlar.push(belirsiz + ' siparişin tüketim penceresi sayım anını kapsıyor (±' + sk_yuv_(belirsizMiktar) + '); tahmini hazırlık anına göre ayrıldı');
  if (tahmin) notlar.push(tahmin + ' siparişte şube çıkış saati yok, tüketim anı tahmini');
  return { toplam: sk_yuv_(toplam), not: notlar.join(' · '), belirsizMiktar: sk_yuv_(belirsizMiktar) };
}

/**
 * Satış dosyasının son 3000 satırından her siparişin TÜKETİM PENCERESİ (sipariş saati tüketim zamanı sayılmaz):
 *  - Şube çıkış saati (Hazırlanma) varsa: [max(sipariş, çıkış − 30 dk), çıkış], tahmini nokta = çıkış − 10 dk. İleri saatli
 *    siparişte de böyle (sipariş saati çok önce olsa da hazırlık çıkıştan hemen önce yapılır). Sonradan eklenen ürün ayrı saat
 *    taşımadığı için siparişle aynı pencereye düşer; çıkıştan sonra eklenen ürün bu veriden anlaşılamaz (belirsizlik).
 *  - Çıkış saati yoksa (masa, gel-al, eksik veri): [sipariş, sipariş + 33 dk], nokta = sipariş + 18 dk (tahmin). Masa siparişinde
 *    kapanış saati daha geçse pencere kapanışa kadar uzar (sonradan eklenen ürün olabilir).
 *  - Kapanış (Teslim Zamanı) tüketim zamanı olarak KULLANILMAZ: geç kapanan sipariş tüketimi geciktirmez.
 * Ayrıca şube başına henüz düşülmemiş siparişler (sayım beklemesi için).
 */
function sk_tuketimPenceresi_(siparis, cikis, kapanis, masa) {
  var D = 60000;
  if (cikis && !isNaN(cikis) && cikis >= siparis - D) {
    return { erken: Math.max(siparis, cikis - SK_PENCERE_DK * D), gec: cikis, nokta: Math.max(siparis, cikis - SK_HAZIRLIK_DK * D), kaynak: 'cikis' };
  }
  var gec = siparis + SK_TAHMIN_UST_DK * D;
  if (masa && kapanis && !isNaN(kapanis) && kapanis > gec) gec = kapanis;
  return { erken: siparis, gec: gec, nokta: Math.min(gec, siparis + SK_TAHMIN_DK * D), kaynak: masa ? 'tahmin-masa' : 'tahmin' };
}
function sk_satisBilgisi_() {
  var sonuc = { tuketim: {}, bekleyen: {} };
  var sh = kaynakSayfa(); if (!sh || sh.getLastRow() < 2) return sonuc;
  var bas = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (x) { return sade(x); });
  var kol = function (ad) { for (var i = 0; i < bas.length; i++) if (bas[i].indexOf(ad) === 0) return i; return -1; };
  var cId = kol('siparisid'), cT = kol('siparistarihi'), cCikis = kol('hazirlanma'), cKapanis = kol('teslimzamani'), cMasa = kol('masasiparisi'),
      cSube = kol('uruncikansube'), cSube2 = bas.indexOf('sube'), cDurum = bas.indexOf('durum'), cIs = bas.indexOf(sade(ISARET_BASLIK));
  var son = sh.getLastRow(), ilk = Math.max(2, son - 2999);
  var v = sh.getRange(ilk, 1, son - ilk + 1, bas.length).getValues();
  var basla = baslangicTarihi().getTime();
  v.forEach(function (r) {
    var t = sk_zaman_(r[cT]); if (isNaN(t)) return;
    var masa = cMasa >= 0 && sade(r[cMasa]).indexOf('masa') === 0;
    var z = sk_tuketimPenceresi_(t, cCikis >= 0 ? sk_zaman_(r[cCikis]) : NaN, cKapanis >= 0 ? sk_zaman_(r[cKapanis]) : NaN, masa);
    var id = String(r[cId]); sonuc.tuketim[id] = z;
    if (t < basla) return;
    if (sm_islendiMi(cIs >= 0 ? r[cIs] : '')) return;
    if (cDurum >= 0 && sade(r[cDurum]).indexOf('iptal') !== -1) return;
    var sube = subeCoz(cSube >= 0 ? r[cSube] : '');
    if (!sube || sube.charAt(0) === '#') sube = subeCoz(cSube2 >= 0 ? r[cSube2] : '');
    var s = sk_n_(sube);
    (sonuc.bekleyen[s] = sonuc.bekleyen[s] || []).push({ erken: z.erken, nokta: z.nokta, kesin: z.kaynak === 'cikis' });
  });
  return sonuc;
}

/** Uyarı kararları. Gönderim sk_uyariGonder_ ile (canlı: e-posta; test ortamı: Test_Uyarilar sekmesi). Konu başına saatte bir. */
function sk_uyarilar_(sonuc) {
  if (!sonuc) return;
  if (sonuc.hata.length) sk_uyar_('hata', 'Stok kuyruğunda elle bakılması gereken kayıt var:\n' + sonuc.hata.join('\n'));
  if (sonuc.enEskiBekleyenDk > SK_GECIKME_UYARI_DK) sk_uyar_('gecikme', sonuc.bekleyen + ' kayıt stoka işlenmeyi bekliyor; en eskisi ' + sonuc.enEskiBekleyenDk + ' dakikadır bekliyor.');
  if (sonuc.notlar.length) sk_uyar_('not', sonuc.notlar.join('\n'));
}
function sk_uyar_(konu, metin) {
  var props = PropertiesService.getScriptProperties(), anahtar = 'SK_UYARI_' + konu, simdi = Date.now();
  if (simdi - (Number(props.getProperty(anahtar)) || 0) < 3600000) return false;
  props.setProperty(anahtar, String(simdi));
  sk_uyariGonder_('Stok kuyruğu: ' + konu, metin);
  return true;
}

if (typeof module !== 'undefined') module.exports = { stokKuyruguIsle_: stokKuyruguIsle_ };
