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
// TÜKETİM KAYIT ZAMANI (sahibin 08.10 kararı): paket siparişte = ŞUBE ÇIKIŞ saati. Tahmin, pencere, ödeme/kapanış saati YOK.
//  - Çıkış saati olmayan masa, gel-al ve Ödenmez (personel yemeği / telafi) satışları: SİPARİŞ (adisyona giriş) saati — açık kural,
//    kaynak "kural-…" diye işaretli. Çıkış saati varsa onlarda da çıkış kullanılır.
//  - Çıkış saati EKSİK paket sipariş: hiçbir saate atanmaz ("eksik"). Sayımla ilişkisi yalnız kesin sınırlarla çözülür
//    (sipariş sayımdan sonraysa sonra; kapanış sayımdan önceyse önce — kapanış tüketim zamanı değil, en geç sınırdır).
//    Çözülemezse sayım otomatik uygulanmaz: HATA + iki olası değer, elle karar (Detay'a HAZIRDA:/SONRA: yazılarak).
//  - Hazırlanıp çıkmadan iptal edilen ürün: tüketim korunur (otomatik iade yok); mutfak zayi olarak girer.
//
// SAYIM ANI: sayım, sayıldığı ana (İşlem_Zamani) göre uygulanır.
//  - Sayımdan önce tüketilmiş ama henüz Satış Motoru'nca düşülmemiş sipariş varsa sayım BEKLER (en çok SK_SAYIM_BEKLEME_SAAT).
//  - Yeni stok = sayılan + sayımdan SONRA olmuş hareketler (olay zamanına göre) − sayımdan SONRA tüketilen siparişlerin düşümü.
//  - Sayım anında HAZIRLANMIŞ ama ÇIKMAMIŞ siparişler: sayım ekranı sorar, Detay'a "HAZIRDA:12,15" (gün içi no) ya da
//    "HAZIRDA:YOK" yazılır. Listedekiler sayılan miktarda yoktur (raftan alınmış) → sayımdan ÖNCE tüketilmiş sayılır; çıkışta
//    Satış Motoru düşse de ikinci fark oluşmaz (sayım, düşülene kadar bekler). Soru cevapsızsa açık siparişler sonuç notunda listelenir.
//  - Sayımdan önceki bir zamana ait geç girilmiş kayıt (üretim, zayi, transfer) stoku DEĞİŞTİRMEZ: sayım onu zaten içerir.
//  - Daha yeni bir sayım/düzeltme varsa eski sayım yalnız geçmişe yazılır.

var SK_SEKME = 'Stok_Kuyrugu';
var SK_BASLIK = ['Kuyruk_ID', 'Giris_Zamani', 'Islem_Zamani', 'Sube', 'Urun_Adi', 'Tip', 'Tur', 'Delta', 'Mutlak', 'Detay', 'Sorumlu', 'Durum', 'Islenme', 'Sonuc'];
var SK_K = { ID: 0, GIRIS: 1, ISLEM: 2, SUBE: 3, URUN: 4, TIP: 5, TUR: 6, DELTA: 7, MUTLAK: 8, DETAY: 9, SORUMLU: 10, DURUM: 11, ISLENME: 12, SONUC: 13 };
var SK_AZAMI = 300;                 // bir çalışmada en çok işlenecek kayıt (aynı istekten gelenler bölünmez)
var SK_SAYIM_BEKLEME_SAAT = 3;      // sayım öncesi açık sipariş kapanmazsa en çok bu kadar beklenir
var SK_GECIKME_UYARI_DK = 10;       // bu kadar dakikadır bekleyen kayıt varsa uyarı
var SK_HAREKET_PENCERE = 5000;      // sayım hesabında bakılan son Stok_Hareketleri satırı
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
 * secenek: { simdi, satis: {tuketim:{id:{id,no,siparis,nokta,kapanis,kaynak}}, bekleyen:{sube:[aynı biçim]}} (test için) }
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
  // Elle karar verilip yeniden BEKLIYOR yapılan HATA satırları (işaretçinin gerisinde kalmış olabilir)
  var hataSat = []; try { hataSat = JSON.parse(props.getProperty('SK_HATA_SATIRLAR') || '[]'); } catch (e) {}
  hataSat = hataSat.filter(function (h) { return h >= 2 && h <= son; });
  hataSat.forEach(function (h) { if (h < bas && q.getRange(h, SK_K.DURUM + 1).getValue() === 'BEKLIYOR') bas = h; });
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
      // Bekleme yalnız "sayımdan önce tüketilmiş (ya da hazırda bildirilmiş) ama henüz düşülmemiş" sipariş varsa.
      // Çıkış saati eksik ve sipariş sayımdan önceyse de beklenir (çıkış/kapanış gelince karar kesinleşir).
      var bil = sk_bildirim_(r[SK_K.DETAY]);
      var acik = (satis_().bekleyen[sk_n_(r[SK_K.SUBE])] || []).filter(function (b) {
        return sk_onceMi_(b, tc, bil) !== false;
      });
      if (acik.length) {
        var beklenen = (simdi.getTime() - tc) / 3600000;
        if (beklenen < SK_SAYIM_BEKLEME_SAAT) {
          r[SK_K.SONUC] = 'Sayım bekliyor: sayımdan önce tüketilmiş ' + acik.length + ' sipariş henüz stoktan düşülmedi (' + acik.slice(0, 5).map(function (b) { return 'no ' + b.no; }).join(', ') + ')';
          sonuc.bekleyenSayim++; continue;
        }
        r._uyari = 'Sayımdan önce tüketilmiş ' + acik.length + ' sipariş ' + SK_SAYIM_BEKLEME_SAAT + ' saattir düşülmedi; düşülünce stok ikinci kez azalabilir — kontrol edin';
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
        var sonra = sk_sayimSonrasi_(c, satis_, k[SK_K.URUN], k[SK_K.TIP], k[SK_K.SUBE], t, sk_bildirim_(k[SK_K.DETAY]));
        if (sonra.belirsiz.length) {   // çıkış saati olmayan sipariş sayımın neresinde, bilinmiyor → otomatik uygulanmaz
          var dahil = sk_yuv_(Number(k[SK_K.MUTLAK]) + sonra.toplam), haric = sk_yuv_(dahil - sonra.belirsizMiktar);
          sk_hata_(qv, i, simdi, 'Çıkış saati olmayan sipariş: ' + sonra.belirsiz.map(function (b) { return 'no ' + b.no + ' (' + sk_yuv_(b.m) + ')'; }).join(', ') +
            '. Sayımdan önce hazırlandıysa stok ' + dahil + ', sonra hazırlandıysa ' + haric + ' olur. Detay\'a HAZIRDA:<no> ya da SONRA:<no> yazıp Durum\'u BEKLIYOR yapın.', sonuc);
          return;
        }
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
  var hataSayisi = sonuc.hata.length;
  secilen = secilen.filter(function (i) { return qv[i][SK_K.DURUM] !== 'HATA'; });   // elle karar bekleyen sayımlar yazılmaz
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
  if (secilen.length || sonuc.bekleyenSayim || hataSayisi) sk_durumlariYaz_(q, bas, qv);

  // ---------- 5) İşaretçi ve durum özeti ----------
  var ilkAcik = qv.length;
  for (var j = 0; j < qv.length; j++) { if (qv[j][SK_K.DURUM] !== 'ISLENDI' && qv[j][SK_K.DURUM] !== 'HATA') { ilkAcik = j; break; } }
  props.setProperty('SK_ILK_ACIK', String(bas + ilkAcik));
  var hataYeni = hataSat.filter(function (h) { return h < bas; });   // okunmayan eski HATA'lar aynen kalır
  qv.forEach(function (r, j) { if (r[SK_K.DURUM] === 'HATA') hataYeni.push(bas + j); });
  props.setProperty('SK_HATA_SATIRLAR', JSON.stringify(hataYeni.slice(-50)));
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
function sk_sayimSonrasi_(c, satis_, ad, tip, sube, t, bil) {
  bil = bil || { cevap: false, hazirda: {}, sonra: {} };
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
  // Her siparişin tüketim kayıt zamanı tektir (çıkış ya da açık kural). Sayımdan SONRA tüketilenler düşülür.
  var tuk = satis_().tuketim, tipU = String(tip || '').toUpperCase(), belirsiz = [], belirsizMiktar = 0, hazirda = 0, acik = 0, acikMiktar = 0, sinir = 0, kural = 0;
  c.satisH.forEach(function (r) {
    if (sk_adSube_(r[2], r[1]) !== as || String(r[3]).toUpperCase() !== tipU) return;
    var z = tuk[String(r[10])]; if (!z) return;     // satış dosyasının son 3000 siparişinde yok: sayımdan çok önce
    var m = Number(r[7]) || 0, once = sk_onceMi_(z, t, bil);
    if (once === null) { belirsiz.push({ no: z.no, m: m }); belirsizMiktar += m; return; }
    if (!once) toplam -= m;
    if (z.kaynak === 'eksik') sinir++;
    else if (z.kaynak !== 'cikis' && z.nokta <= t && z.nokta > t - 3600000) kural++;
    if (z.kaynak !== 'eksik' && z.siparis <= t && t < z.nokta) {
      if (sk_bildirildiMi_(z, bil)) hazirda++;
      else if (!bil.cevap) { acik++; acikMiktar += m; }
    }
  });
  var notlar = [];
  if (aynGunAlis) notlar.push('Aynı gün alış faturası var (fatura saati yok) — sayımdan önce mi sonra mı geldiğini kontrol edin');
  if (hazirda) notlar.push(hazirda + ' hazırda bildirilen sipariş sayımdan önce tüketilmiş sayıldı');
  if (acik) notlar.push('Sayım anında ' + acik + ' sipariş hazırlıkta/çıkmamıştı (' + sk_yuv_(acikMiktar) + '); hazırda olan bildirilmedi, çıkışta tüketildi sayıldı');
  if (kural) notlar.push(kural + ' masa/gel-al/ödenmez sipariş (çıkış saati yok) sipariş saatine göre sayımdan önce sayıldı');
  if (sinir) notlar.push(sinir + ' siparişte çıkış saati yok; sipariş/kapanış sınırına göre ayrıldı');
  return { toplam: sk_yuv_(toplam), not: notlar.join(' · '), belirsiz: belirsiz, belirsizMiktar: sk_yuv_(belirsizMiktar) };
}

/**
 * Her siparişin TÜKETİM KAYIT ZAMANI (sahibin 08.10 kararı):
 *  - Şube çıkış saati (Hazırlanma) varsa: tam çıkış saati (kaynak 'cikis'). İleri saatli siparişte de.
 *  - Çıkış yoksa ve masa / gel-al / Ödenmez (personel yemeği, telafi) ise: sipariş saati (kaynak 'kural-masa' / 'kural-gelal' / 'kural-odenmez').
 *  - Çıkış yoksa ve paket ise: zaman YOK (kaynak 'eksik'); sessizce başka saate atanmaz.
 *  - Kapanış (Teslim Zamanı) tüketim zamanı değildir; yalnız 'eksik' siparişte "en geç bu an" sınırı olarak kullanılır.
 */
function sk_tuketimZamani_(siparis, cikis, kapanis, tur) {
  var z = { siparis: siparis, kapanis: isNaN(kapanis) ? null : kapanis };
  if (cikis && !isNaN(cikis) && cikis >= siparis - 60000) { z.nokta = cikis; z.kaynak = 'cikis'; return z; }
  if (tur === 'masa' || tur === 'gelal' || tur === 'odenmez') { z.nokta = siparis; z.kaynak = 'kural-' + tur; return z; }
  z.nokta = null; z.kaynak = 'eksik'; return z;
}
/** Sayım (t) karşısında: true = sayımdan önce tüketildi (sayılanda yok), false = sonra, null = bilinmiyor (elle karar). */
function sk_onceMi_(z, t, bil) {
  if (bil && bil.sonra[z.no]) return false;
  if (sk_bildirildiMi_(z, bil)) return true;
  if (z.kaynak !== 'eksik') return z.nokta <= t;
  if (z.siparis > t) return false;                         // sipariş sayımdan sonra → tüketim de sonra (kesin)
  if (z.kapanis !== null && z.kapanis <= t) return true;   // sayımdan önce kapanmış → tüketim de önce (kesin)
  return null;
}
function sk_bildirildiMi_(z, bil) { return !!(bil && (bil.hazirda[z.no] || bil.hazirda[z.id])); }
/** Sayım kaydının Detay'ındaki bildirim: "HAZIRDA:12,15" / "HAZIRDA:YOK" / "SONRA:12" (gün içi no ya da sipariş ID). */
function sk_bildirim_(detay) {
  var b = { cevap: false, hazirda: {}, sonra: {} }, s = String(detay || '');
  var h = s.match(/HAZIRDA:\s*([^·|]*)/i), so = s.match(/SONRA:\s*([^·|]*)/i);
  if (h) { b.cevap = true; h[1].split(/[,\s]+/).forEach(function (x) { if (x && !/^yok$/i.test(x)) b.hazirda[x.replace(/^0+/, '')] = 1; }); }
  if (so) so[1].split(/[,\s]+/).forEach(function (x) { if (x) b.sonra[x.replace(/^0+/, '')] = 1; });
  return b;
}
/** Satış dosyasının son 3000 siparişinin tüketim zamanı + şube başına henüz düşülmemiş siparişler (sayım beklemesi için). */
function sk_satisBilgisi_() {
  var sonuc = { tuketim: {}, bekleyen: {} };
  var sh = kaynakSayfa(); if (!sh || sh.getLastRow() < 2) return sonuc;
  var bas = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (x) { return sade(x); });
  var kol = function (ad) { for (var i = 0; i < bas.length; i++) if (bas[i].indexOf(ad) === 0) return i; return -1; };
  var cId = kol('siparisid'), cNo = kol('siparisno'), cT = kol('siparistarihi'), cCikis = kol('hazirlanma'), cKapanis = kol('teslimzamani'),
      cMasa = kol('masasiparisi'), cOdeme = kol('odemeyontemi'),
      cSube = kol('uruncikansube'), cSube2 = bas.indexOf('sube'), cDurum = bas.indexOf('durum'), cIs = bas.indexOf(sade(ISARET_BASLIK));
  var son = sh.getLastRow(), ilk = Math.max(2, son - 2999);
  var v = sh.getRange(ilk, 1, son - ilk + 1, bas.length).getValues();
  var basla = baslangicTarihi().getTime();
  v.forEach(function (r) {
    var t = sk_zaman_(r[cT]); if (isNaN(t)) return;
    var tipMetni = cMasa >= 0 ? sade(r[cMasa]) : '';
    var tur = tipMetni.indexOf('masa') === 0 ? 'masa' : tipMetni.indexOf('gel') === 0 ? 'gelal'
      : (cOdeme >= 0 && sade(r[cOdeme]).indexOf('odenmez') === 0) ? 'odenmez' : 'paket';
    var z = sk_tuketimZamani_(t, cCikis >= 0 ? sk_zaman_(r[cCikis]) : NaN, cKapanis >= 0 ? sk_zaman_(r[cKapanis]) : NaN, tur);
    z.id = String(r[cId]); z.no = cNo >= 0 ? String(r[cNo]).replace(/\.0+$/, '').replace(/^0+/, '') : z.id;
    var iptal = cDurum >= 0 && sade(r[cDurum]).indexOf('iptal') !== -1;
    // Aynı sipariş ID'si birden çok satırda olabilir (ör. iptal edilmiş tekrar kayıt): iptal satır, çıkışı olan satırı ezmez
    var onceki = sonuc.tuketim[z.id];
    if (!onceki || (!iptal && (onceki.iptal || (onceki.kaynak === 'eksik' && z.kaynak !== 'eksik')))) { z.iptal = iptal; sonuc.tuketim[z.id] = z; }
    if (t < basla) return;
    if (sm_islendiMi(cIs >= 0 ? r[cIs] : '')) return;
    if (iptal) return;
    var sube = subeCoz(cSube >= 0 ? r[cSube] : '');
    if (!sube || sube.charAt(0) === '#') sube = subeCoz(cSube2 >= 0 ? r[cSube2] : '');
    var s = sk_n_(sube);
    (sonuc.bekleyen[s] = sonuc.bekleyen[s] || []).push(z);
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

if (typeof module !== 'undefined') module.exports = { stokKuyruguIsle_: stokKuyruguIsle_, sk_tuketimZamani_: sk_tuketimZamani_, sk_bildirim_: sk_bildirim_ };
