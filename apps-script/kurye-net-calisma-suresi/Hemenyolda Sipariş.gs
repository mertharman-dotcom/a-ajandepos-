/**
 * ============================================================
 *  HemenYolda -> Google E-Tablolar
 *  Siparis cekici + Acik hesap (kurye hesap alma) takibi
 *  Bap Pizza Kadikoy
 * ------------------------------------------------------------
 *  FONKSIYONLAR
 *    tokenKaydet()          : token'i bir kez kaydet
 *    siparisleriCek()       : gecmis dolgu (BASLANGIC -> bugun)
 *    guncelle()             : 15 dk'da bir - bugun + hala ACIK hesabi olan gunler
 *    acikHesaplar()         : "Acik Hesaplar" sekmesini tazeler (API'ye gitmez)
 *    mesaiCek()             : "Mesai (Ham)" - vardiya giris/cikis + paket
 *    mesaiBosGunleriUnut()  : "veri yok" diye isaretlenen gunleri sifirlar
 *    tetikleyiciKur()       : guncelle() icin 15 dakikalik tetikleyici
 *    tetikleyiciSil()       : tetikleyiciyi kaldirir
 *    hyTeshis()             : hata olunca calistir - sebebini yazar
 *
 *  SIRA: tokenKaydet() -> siparisleriCek() -> mesaiCek() -> tetikleyiciKur()
 * ============================================================
 */

// ---------- AYARLAR ----------
var SS_ID       = '1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo'; // "Kurye Net Calisma Suresi"
var SHEET_ADI   = 'Siparişler';
var SHEET_ACIK  = 'Açık Hesaplar';
var SHEET_MESAI = 'Mesai (Ham)';  // DIKKAT: "Net Süre" sutunu YOK - bordro script'i
                                  // kaynak sekme diye bunu secmesin diye bilerek boyle.
var BASLANGIC   = '2026-09-01';   // dahil. Ayrilan kuryelerin verisi API'de yok,
                                  // daha geriye gitmenin faydasi yok.
var BITIS       = '';             // bos = bugun
var TZ          = 'Europe/Istanbul';
var BASE        = 'https://hemenyolda.com/api/v2';
var ACIK_GERI   = 60;             // acik hesap icin geriye kac gun taransin
// guncelle() bu saatler arasinda hicbir sey yapmaz (restoran kapali, bosa istek atmasin)
var SESSIZ_BAS  = 3;              // 03:00
var SESSIZ_BIT  = 9;              // 09:59

// IS GUNU: 03:00 - ertesi gun 02:59.
var GUN_BAS     = 3;

// Kuryeden hesap ALINMAYAN odeme yontemleri.
var ONLINE_KELIMELER = ['online', 'cuzdan', 'havale', 'eft', 'odeme alindi'];

var BASLIKLAR = [
  'Tarih', 'Sipariş ID', 'Adisyon No', 'Platform', 'Kurye',
  'Sipariş Saati', 'Atandı', 'Restorandan Çıktı', 'Yolda', 'Teslim Saati',
  'Atama (dk)', 'Hazırlık (dk)', 'Yol (dk)', 'Toplam (dk)', 'Mesafe (km)',
  'Ödeme Yöntemi', 'Tutar (TL)', 'Hesap',
  'Ürün Adedi', 'Sipariş İçeriği', 'Müşteri', 'Telefon', 'Adres', 'Not', 'Durum'
];
var NCOL   = BASLIKLAR.length;
var C_TARIH = 1, C_ID = 2, C_HESAP = 18;

// ---------- TOKEN ----------
/**
 * Token ZATEN kayitli. Bu fonksiyonu SADECE token degistiginde,
 * asagidaki tirnaklarin arasina yeni token'i yazip calistir.
 * Token'i panelde: F12 -> Console -> copy(localStorage.token)
 */
function tokenKaydet() {
  var TOKEN = 'BURAYA_YENI_TOKEN';
  if (TOKEN === 'BURAYA_YENI_TOKEN') {
    throw new Error('Once TOKEN degiskenine yeni token yapistir. ' +
                    'Mevcut token bozulmadiysa bu fonksiyonu calistirmana gerek yok.');
  }
  PropertiesService.getScriptProperties().setProperty('HY_TOKEN', TOKEN.trim());
  Logger.log('Token kaydedildi.');
}

function _token() {
  var t = PropertiesService.getScriptProperties().getProperty('HY_TOKEN');
  if (!t || t.indexOf('YAPISTIR') > -1) throw new Error('Token yok. Once tokenKaydet() calistir.');
  return t;
}

function _headers() {
  return {
    Authorization: 'Bearer ' + _token(),
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                  '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Origin': 'https://hemenyolda.com',
    'Referer': 'https://hemenyolda.com/'
  };
}

/**
 * API hatasini KONUSAN hata mesajina cevirir.
 * 403'un sebebi token mi, yoksa sunucunun Google IP'sini engellemesi mi -
 * cevabin govdesine bakip soyler.
 */
function _apiHata(ne, r) {
  var kod = r.getResponseCode();
  var govde = '';
  try { govde = (r.getContentText() || '').replace(/\s+/g, ' ').slice(0, 400); } catch (e) {}
  var ipucu;
  if (kod === 401) {
    ipucu = 'Token gecersiz veya suresi dolmus -> panelden yeni token alip tokenKaydet() calistir.';
  } else if (kod === 403 && /<\s*html|cloudflare|captcha|Attention Required|Just a moment|Access denied|Forbidden/i.test(govde)) {
    ipucu = 'Sunucu Google sunucularinin IP adresini engelliyor (bot/WAF korumasi). ' +
            'Token ile ilgisi YOK - ayni token tarayicida calisir.';
  } else if (kod === 403) {
    ipucu = 'Yetki reddedildi. Token suresi dolmus ya da bu hesabin yonetici yetkisi degismis olabilir.';
  } else if (kod === 429) {
    ipucu = 'Cok fazla istek atildi, sunucu kisitliyor. 10-15 dk bekleyip tekrar dene.';
  } else if (kod >= 500) {
    ipucu = 'HemenYolda tarafinda gecici sunucu hatasi. Sonra tekrar dene.';
  } else {
    ipucu = 'Beklenmeyen yanit.';
  }
  return new Error(ne + ': HTTP ' + kod + ' - ' + ipucu +
                   ' || Sunucu yaniti: ' + (govde || '(bos)'));
}

/**
 * TESHIS: sorun cikinca bunu calistir, log'daki ciktiyi bana gonder.
 * Token'i EKRANA YAZMAZ - sadece uzunlugunu ve son kullanma tarihini gosterir.
 */
function hyTeshis() {
  var sat = [];
  var t = PropertiesService.getScriptProperties().getProperty('HY_TOKEN') || '';
  sat.push('Token kayitli mi : ' + (t ? 'EVET (' + t.length + ' karakter)' : 'HAYIR'));
  try {
    var g = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    var j = JSON.parse(Utilities.newBlob(Utilities.base64Decode(g)).getDataAsString());
    if (j.exp) {
      var bit = new Date(j.exp * 1000);
      sat.push('Token bitis    : ' + Utilities.formatDate(bit, TZ, 'dd.MM.yyyy HH:mm') +
               (bit < new Date() ? '  <-- SURESI DOLMUS!' : '  (gecerli)'));
    }
  } catch (e) { sat.push('Token bitis    : okunamadi'); }

  var testler = [
    ['Kurye listesi', BASE + '/manager/agents'],
    ['Aktif siparis', BASE + '/order/orders']
  ];
  testler.forEach(function (x) {
    try {
      var r = UrlFetchApp.fetch(x[1], { headers: _headers(), muteHttpExceptions: true,
                                        followRedirects: true });
      var b = (r.getContentText() || '').replace(/\s+/g, ' ').slice(0, 250);
      sat.push('--- ' + x[0] + ' -> HTTP ' + r.getResponseCode());
      sat.push('    server : ' + (r.getAllHeaders()['Server'] || r.getAllHeaders()['server'] || '-'));
      sat.push('    yanit  : ' + b);
    } catch (e) {
      sat.push('--- ' + x[0] + ' -> ISTEK PATLADI: ' + e.message);
    }
  });
  var m = sat.join('\n');
  Logger.log(m);
  try { SpreadsheetApp.getUi().alert('HemenYolda Teshis', m, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return m;
}

// ---------- 1) GECMIS DOLGU ----------
function siparisleriCek() {
  var sh = _sheet();
  _metinSutunlari(sh, [1, 6, 7, 8, 9, 10, 22]);
  var mevcut = _idHaritasi(sh);
  var kuryeler = _kuryeler();
  var gunler = _gunler(BASLANGIC, BITIS || _bugun());

  var basla = Date.now(), islenen = 0, toplam = 0, yarim = false;

  for (var gi = 0; gi < gunler.length; gi++) {
    if (Date.now() - basla > 270000) { yarim = true; break; }

    var yeniSatir = [];
    _gunuCek(kuryeler, gunler[gi]).forEach(function (o) {
      if (mevcut[o.id]) return;
      mevcut[o.id] = -1;
      yeniSatir.push(_satir(o));
    });

    if (yeniSatir.length) {
      yeniSatir.sort(function (a, b) { return a._ts - b._ts; });
      var ilk = sh.getLastRow() + 1;
      sh.getRange(ilk, 1, yeniSatir.length, NCOL)
        .setValues(yeniSatir.map(function (r) { return r.v; }));
      yeniSatir.forEach(function (r, j) { mevcut[r.v[1]] = ilk + j; });
      toplam += yeniSatir.length;
    }
    islenen++;
  }

  acikHesaplar();
  Logger.log(islenen + '/' + gunler.length + ' gun tarandi, ' + toplam + ' yeni siparis yazildi.' +
             (yarim ? ' — SURE DOLDU, siparisleriCek() tekrar calistirin.' : ''));
}

// ---------- 2) CANLI GUNCELLEME (15 dk tetikleyici) ----------
function guncelle() {
  var saat = Number(Utilities.formatDate(new Date(), TZ, 'H'));
  if (saat >= SESSIZ_BAS && saat <= SESSIZ_BIT) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    var sh = _sheet();
    var kuryeler = _kuryeler();

    var gunSet = {};
    gunSet[_bugun()] = 1;
    if (saat < SESSIZ_BAS) gunSet[_dun()] = 1;
    _acikGunler(sh).forEach(function (g) { gunSet[g] = 1; });
    var gunler = Object.keys(gunSet);

    var siparisler = [];
    gunler.forEach(function (g) { siparisler = siparisler.concat(_gunuCek(kuryeler, g)); });

    var varOlan = {};
    siparisler.forEach(function (o) { varOlan[o.id] = 1; });
    _aktifSiparisler().forEach(function (o) {
      var g = o.createdAt ? Utilities.formatDate(new Date(o.createdAt), TZ, 'yyyy-MM-dd') : null;
      if (!varOlan[o.id] && g && gunSet[g]) { varOlan[o.id] = 1; siparisler.push(o); }
    });

    if (!siparisler.length) return;

    var mevcut = _idHaritasi(sh);
    var eklenecek = [], guncellenecek = [], satirNo = [];

    siparisler.forEach(function (o) {
      var s = _satir(o);
      if (mevcut[o.id]) { guncellenecek.push(s.v); satirNo.push(mevcut[o.id]); }
      else { eklenecek.push(s); }
    });

    var degisti = 0;
    if (satirNo.length) {
      var bas = Math.min.apply(null, satirNo);
      var son = Math.max.apply(null, satirNo);
      var blok = sh.getRange(bas, 1, son - bas + 1, NCOL).getValues();
      for (var i = 0; i < satirNo.length; i++) {
        var idx = satirNo[i] - bas;
        if (blok[idx].join('') !== guncellenecek[i].join('')) {
          blok[idx] = guncellenecek[i];
          degisti++;
        }
      }
      if (degisti) sh.getRange(bas, 1, blok.length, NCOL).setValues(blok);
    }

    if (eklenecek.length) {
      eklenecek.sort(function (a, b) { return a._ts - b._ts; });
      sh.getRange(sh.getLastRow() + 1, 1, eklenecek.length, NCOL)
        .setValues(eklenecek.map(function (r) { return r.v; }));
    }

    if (eklenecek.length || degisti) acikHesaplar();
    mesaiCek(90000);
    try { kuraliUygula(false); }
    catch (e) { Logger.log('kuraliUygula atlandı: ' + e.message); }
    Logger.log('guncelle: ' + gunler.length + ' gun, +' + eklenecek.length +
               ' yeni, ' + degisti + ' satir tazelendi.');
  } finally {
    lock.releaseLock();
  }
}

// ---------- 3) ACIK HESAPLAR ----------
function acikHesaplar() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var kaynak = _sheet();
  var sh = ss.getSheetByName(SHEET_ACIK) || ss.insertSheet(SHEET_ACIK);
  sh.clear();

  var bas = ['Tarih', 'Adisyon No', 'Sipariş ID', 'Platform', 'Kurye',
             'Müşteri', 'Telefon', 'Ödeme Yöntemi', 'Tutar (TL)', 'Teslim Saati', 'Durum'];
  _metinSutunlari(sh, [1, 7, 10]);
  sh.getRange(1, 1, 1, bas.length).setValues([bas])
    .setBackground('#990000').setFontColor('#ffffff').setFontWeight('bold');
  sh.setFrozenRows(1);

  var satirlar = [];
  if (kaynak.getLastRow() > 1) {
    var v = kaynak.getRange(2, 1, kaynak.getLastRow() - 1, NCOL).getValues();
    v.forEach(function (r) {
      if (String(r[C_HESAP - 1]).trim() !== 'AÇIK') return;
      satirlar.push([r[0], r[2], r[1], r[3], r[4], r[20], r[21], r[15], r[16], r[9], r[24]]);
    });
  }

  if (!satirlar.length) {
    sh.getRange(2, 1).setValue('Açık hesap yok ✅');
    sh.autoResizeColumns(1, bas.length);
    return 0;
  }

  satirlar.sort(function (a, b) {
    var d = _trTarih(a[0]) - _trTarih(b[0]);
    return d || String(a[4]).localeCompare(String(b[4]), 'tr');
  });

  sh.getRange(2, 1, satirlar.length, bas.length).setValues(satirlar);
  sh.getRange(2, 9, satirlar.length, 1).setNumberFormat('#,##0');

  var toplam = satirlar.reduce(function (t, r) { return t + (Number(r[8]) || 0); }, 0);
  var r0 = satirlar.length + 2;
  sh.getRange(r0, 1, 1, bas.length)
    .setValues([['TOPLAM', satirlar.length + ' hesap', '', '', '', '', '', '', toplam, '', '']])
    .setBackground('#ffe599').setFontWeight('bold');

  var ozet = {};
  satirlar.forEach(function (r) {
    var k = String(r[4] || '(kurye yok)');
    if (!ozet[k]) ozet[k] = { n: 0, tl: 0, enEski: r[0] };
    ozet[k].n++; ozet[k].tl += Number(r[8]) || 0;
  });
  var oList = Object.keys(ozet).map(function (k) {
    return [k, ozet[k].n, ozet[k].tl, ozet[k].enEski];
  }).sort(function (a, b) { return b[2] - a[2]; });

  var r1 = r0 + 2;
  sh.getRange(r1, 1).setValue('KURYE BAZINDA AÇIK HESAP')
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#990000');
  sh.getRange(r1, 1, 1, 4).merge();
  sh.getRange(r1 + 1, 1, 1, 4).setValues([['Kurye', 'Hesap Adedi', 'Tutar (TL)', 'En Eski Tarih']])
    .setBackground('#cc4125').setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(r1 + 2, 1, oList.length, 4).setValues(oList);
  sh.getRange(r1 + 2, 3, oList.length, 1).setNumberFormat('#,##0');

  sh.autoResizeColumns(1, bas.length);
  Logger.log('Açık hesap: ' + satirlar.length + ' kayıt / ' + toplam + ' TL');
  return satirlar.length;
}

function _acikGunler(sh) {
  if (sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, C_TARIH, sh.getLastRow() - 1, C_HESAP).getValues();
  var sinir = new Date(Date.now() - ACIK_GERI * 86400000);
  var set = {};
  v.forEach(function (r) {
    if (String(r[C_HESAP - 1]).trim() !== 'AÇIK') return;
    var d = _trTarih(r[0]);
    if (!d || d < sinir) return;
    set[Utilities.formatDate(d, TZ, 'yyyy-MM-dd')] = 1;
  });
  return Object.keys(set);
}

function mesaiYenidenKur() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(SHEET_MESAI);
  if (sh) ss.deleteSheet(sh);
  mesaiBosGunleriUnut();
  mesaiCek();
  Logger.log('Mesai (Ham) sıfırlandı ve yeniden kuruldu. Log "SÜRE DOLDU" diyorsa '
           + 'mesaiCek() tekrar çalıştırın, sonra kuraliUygula().');
}

// ---------- 4) MESAI (vardiya giris/cikis) ----------
var MESAI_BASLIK = ['Tarih', 'Kurye', 'Planlı Giriş', 'Planlı Çıkış', 'Giriş', 'Çıkış',
                    'Oturum', 'Ham Süre', 'Ham (dk)', 'İlk Paket',
                    'Son Sipariş Çıkış', 'Son Sipariş', 'Son Sipariş Km',
                    'Paket', 'Teslim', 'İptal', 'Durum', 'Oturumlar'];
var MESAI_NCOL = MESAI_BASLIK.length;
var M_DURUM = 16;          // Durum sütunu (0'dan) — MESAI_NCOL'e bağlı olmamalı
var ILK_PAKET_ANI = 'Atandı';

/**
 * DUZELTILDI (28.08.2026)
 *  1) Gunler artik YENIDEN ESKIYE isleniyor. Bugun listenin sonunda degil
 *     basinda; sure bitse bile guncel gun mutlaka giriyor.
 *  2) Hic kayit cikmayan gunler "bos gun" olarak hatirlaniyor. Eskiden
 *     Ocak-Temmuz arasindaki veri olmayan ~200 gun her calismada yeniden
 *     sorgulaniyor ve butceyi bitiriyordu; sira hicbir zaman bugune gelmiyordu.
 */
function mesaiCek(butceMs) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(SHEET_MESAI) || ss.insertSheet(SHEET_MESAI);
  if (sh.getLastRow() === 0) {
    _metinSutunlari(sh, [1, 3, 4, 5, 6, 8, 10, 11, 12, 18]);
        sh.getRange(1, 1, 1, MESAI_NCOL).setValues([MESAI_BASLIK]).setFontWeight('bold')
      .setBackground('#134f5c').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }

  var harita = {}, islenmis = {}, acikGun = {};
  if (sh.getLastRow() > 1) {
    var mv = sh.getRange(2, 1, sh.getLastRow() - 1, MESAI_NCOL).getDisplayValues();
    mv.forEach(function (r, i) {
      var tar = String(r[0]).trim(), ad = String(r[1]).trim();
      if (!tar || !ad) return;
      harita[tar + '|' + ad] = i + 2;
      islenmis[tar] = 1;
      if (String(r[M_DURUM]).indexOf('açık') > -1) acikGun[tar] = 1;    });
  }

  var props = PropertiesService.getScriptProperties();
  var bos = {};
  try { bos = JSON.parse(props.getProperty('MESAI_BOS_GUNLER') || '{}'); } catch (e) { bos = {}; }

  var bugunTr = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy');
  var dunTr   = Utilities.formatDate(new Date(Date.now() - 86400000), TZ, 'dd.MM.yyyy');

  var gunler = _gunler(BASLANGIC, BITIS || _bugun()).filter(function (g) {
    var tr = _isoToTr(g);
    if (tr === bugunTr || tr === dunTr) return true;   // her zaman tazele
    if (acikGun[tr]) return true;                      // vardiya acik kalmis
    if (islenmis[tr]) return false;                    // zaten yazilmis
    if (bos[tr]) return false;                         // daha once bakildi, kayit yoktu
    return true;
  }).reverse();                                        // YENIDEN ESKIYE

  if (!gunler.length) { Logger.log('mesai: işlenecek gün yok.'); return; }

  var kuryeler = _kuryeAdlari();
  var sipOzet  = _siparisOzeti();

  var butce = butceMs || 270000;
  var basla = Date.now(), islenen = 0, toplamYeni = 0, toplamGuncel = 0, yeniBos = 0, yarim = false;

  for (var gi = 0; gi < gunler.length; gi++) {
    if (Date.now() - basla > butce) { yarim = true; break; }

    var gun = gunler[gi], tr = _isoToTr(gun);
    var yeni = [], guncelDeger = [], guncelSatir = [];

    _mesaiGunu(kuryeler, gun).forEach(function (b) {
      var s = _mesaiSatiri(tr, b, sipOzet[tr + '|' + b.ad]);
      if (!s) return;
      var k = tr + '|' + b.ad;
      if (harita[k]) { guncelDeger.push(s); guncelSatir.push(harita[k]); }
      else { yeni.push(s); }
    });

    if (!yeni.length && !guncelSatir.length && tr !== bugunTr && tr !== dunTr) {
      bos[tr] = 1; yeniBos++;
    }

    if (guncelSatir.length) {
      var bas = Math.min.apply(null, guncelSatir), son = Math.max.apply(null, guncelSatir);
      var blok = sh.getRange(bas, 1, son - bas + 1, MESAI_NCOL).getValues();
      var d = 0;
      for (var i = 0; i < guncelSatir.length; i++) {
        var idx = guncelSatir[i] - bas;
        if (blok[idx].join('') !== guncelDeger[i].join('')) { blok[idx] = guncelDeger[i]; d++; }
      }
      if (d) sh.getRange(bas, 1, blok.length, MESAI_NCOL).setValues(blok);
      toplamGuncel += d;
    }

    if (yeni.length) {
      yeni.sort(function (a, b) { return String(a[1]).localeCompare(String(b[1]), 'tr'); });
      var ilkSatir = sh.getLastRow() + 1;
      sh.getRange(ilkSatir, 1, yeni.length, MESAI_NCOL).setValues(yeni);
      yeni.forEach(function (r, j) { harita[r[0] + '|' + r[1]] = ilkSatir + j; });
      toplamYeni += yeni.length;
    }
    islenen++;
  }

  props.setProperty('MESAI_BOS_GUNLER', JSON.stringify(bos));

  Logger.log('mesai: ' + islenen + '/' + gunler.length + ' gün, +' + toplamYeni +
             ' yeni, ' + toplamGuncel + ' tazelendi, ' + yeniBos + ' boş gün işaretlendi.' +
             (yarim ? ' — SÜRE DOLDU, mesaiCek() tekrar çalıştır.' : ' — TAMAMLANDI.'));
}

/** "Veri yok" diye isaretlenen gunleri unutur (gecmise donuk veri girildiyse). */
function mesaiBosGunleriUnut() {
  PropertiesService.getScriptProperties().deleteProperty('MESAI_BOS_GUNLER');
  Logger.log('Boş gün listesi temizlendi.');
}

function _kuryeAdlari() {
  var c = CacheService.getScriptCache().get('hy_agents_full');
  if (c) return JSON.parse(c);
  var r = UrlFetchApp.fetch(BASE + '/manager/agents', { headers: _headers(), muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw _apiHata('Kurye listesi alinamadi', r);
  var l = JSON.parse(r.getContentText()).map(function (a) { return { id: a.id, ad: a.fullName }; });
  CacheService.getScriptCache().put('hy_agents_full', JSON.stringify(l), 3600);
  return l;
}

function _mesaiGunu(kuryeler, gun) {
  var sd = gun + 'T12:00:00.000Z';
  var istek = [];
  kuryeler.forEach(function (k) {
    istek.push({ url: BASE + '/manager/agent/' + k.id + '/working-hours-by-date?searchDate=' + sd,
                 headers: _headers(), muteHttpExceptions: true });
  });
  kuryeler.forEach(function (k) {
    istek.push({ url: BASE + '/manager/agent/' + k.id + '/shifts?searchDate=' + sd,
                 headers: _headers(), muteHttpExceptions: true });
  });

  var cev = UrlFetchApp.fetchAll(istek);
  var n = kuryeler.length, out = [];
  for (var i = 0; i < n; i++) {
    out.push({ ad: kuryeler[i].ad, plan: _jsonData(cev[i]), shifts: _jsonData(cev[n + i]) || [] });
  }
  return out;
}

function _jsonData(cev) {
  if (!cev || cev.getResponseCode() !== 200) return null;
  try { return JSON.parse(cev.getContentText()).data; } catch (e) { return null; }
}

function _siparisOzeti() {
  var sh = _sheet();
  var ozet = {};
  if (sh.getLastRow() < 2) return ozet;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, NCOL).getValues();
  var ilkKol = ILK_PAKET_ANI === 'Atandı' ? 6 : 7;
  v.forEach(function (r) {
    var ad = String(r[4]).trim();
    if (!String(r[0]).trim() || !ad) return;
    var tar = _isGunu(r[0], r[5]);
    if (!tar) return;
    var k = tar + '|' + ad;
    if (!ozet[k]) ozet[k] = { paket: 0, teslim: 0, iptal: 0, ilk: '', ilkBm: null,
                              son: '', sonBm: null, sonCikis: '', km: '' };
    var o = ozet[k];
    var dur = String(r[24]).trim();
    o.paket++;
    if (dur === 'Teslim Edildi') o.teslim++;
    else if (dur === 'İptal Edildi') o.iptal++;

    var ilk = String(r[ilkKol] || '').trim();
    var ilkBm = _isDk(ilk);
    if (ilk && ilkBm !== null && (o.ilkBm === null || ilkBm < o.ilkBm)) { o.ilk = ilk; o.ilkBm = ilkBm; }
    var tes = String(r[9] || '').trim();
    var tesBm = _isDk(tes);
    if (tes && tesBm !== null && (o.sonBm === null || tesBm > o.sonBm)) {
      o.son = tes; o.sonBm = tesBm;
      o.sonCikis = String(r[7] || '').trim();
      o.km = r[14];
    }
  });
  return ozet;
}

function _isGunu(tarih, saat) {
  var d = _trTarih(tarih);
  if (!d) return null;
  var m = String(saat || '').match(/^(\d{1,2}):/);
  if (m && Number(m[1]) < GUN_BAS) d = new Date(d.getTime() - 86400000);
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
}

function _isDk(saat) {
  var m = String(saat || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  var dk = Number(m[1]) * 60 + Number(m[2]);
  return dk < GUN_BAS * 60 ? dk + 1440 : dk;
}

function _mesaiSatiri(tr, b, sip) {
  var plan = b.plan || {};
  var offGun = plan.isOffDay === true;
  var otur = (b.shifts || []).filter(function (s) { return s && s.started; });
   // Vardiya da giriş de paket de yoksa satır yazma (izin günü ya da vardiya tanımsız).
 if (!otur.length && (offGun || !plan.start) && (!sip || !sip.paket)) return null;

  var sa = function (iso) { return iso ? Utilities.formatDate(new Date(iso), TZ, 'HH:mm') : ''; };

  var giris = '', cikis = '', hamDk = 0, acik = false;
  if (otur.length) {
    otur.sort(function (a, b2) { return new Date(a.started) - new Date(b2.started); });
    giris = sa(otur[0].started);
    var sonOt = otur[otur.length - 1];
    if (sonOt.ended) cikis = sa(sonOt.ended); else acik = true;
    otur.forEach(function (s) {
      if (s.ended) hamDk += Math.round((new Date(s.ended) - new Date(s.started)) / 60000);
    });
  }

  var durum = acik ? 'Vardiya açık'
            : !otur.length ? 'Giriş yok'
            : !plan.start ? 'Planlı vardiya yok'
            : 'Tamam';

    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };

  // Oturum saatleri — kapanış kesintisinin doğru hesaplanması için şart.
  // Kural katmanı bunu okuyup "makul çıkıştan sonra çevrimiçi kalınan süre"yi
  // buluyor; çevrimdışı aralar böylece kesinti sayılmıyor.
  var oturumMetin = otur.map(function (s) {
    return sa(s.started) + '-' + (s.ended ? sa(s.ended) : '…');
  }).join('|');

  return [tr, b.ad, sa(plan.start), sa(plan.end), giris, cikis, otur.length,
    hamDk ? (Math.floor(hamDk / 60) + ':' + p2(hamDk % 60)) : '', hamDk || '',
    sip ? sip.ilk : '', sip ? sip.sonCikis : '', sip ? sip.son : '', sip ? sip.km : '',
    sip ? sip.paket : 0, sip ? sip.teslim : 0, sip ? sip.iptal : 0, durum, oturumMetin];
}

/** Mevcut "Mesai (Ham)" sekmesine Oturumlar başlığını ekler. Veriye dokunmaz. */
function mesaiSutunEkle() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(SHEET_MESAI);
  if (!sh) { Logger.log('Mesai (Ham) yok.'); return; }
  var mv = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), MESAI_NCOL)).getDisplayValues()[0];
  if (String(mv[MESAI_NCOL - 1]).trim() === 'Oturumlar') {
    Logger.log('Oturumlar sütunu zaten var.'); return;
  }
  sh.getRange(1, MESAI_NCOL).setValue('Oturumlar')
    .setFontWeight('bold').setBackground('#134f5c').setFontColor('#ffffff');
  sh.getRange(1, MESAI_NCOL, sh.getMaxRows(), 1).setNumberFormat('@');
  Logger.log('Oturumlar sütunu eklendi.');
}

function _isoToTr(g) {
  var p = g.split('-');
  return p[2] + '.' + p[1] + '.' + p[0];
}

// ---------- 5) TETIKLEYICI ----------
function tetikleyiciKur() {
  tetikleyiciSil();
  ScriptApp.newTrigger('guncelle').timeBased().everyMinutes(15).create();
  Logger.log('15 dakikalik tetikleyici kuruldu.');
}

function tetikleyiciSil() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'guncelle') ScriptApp.deleteTrigger(t);
  });
}

// ---------- API ----------
function _kuryeler() {
  var c = CacheService.getScriptCache().get('hy_agents');
  if (c) return JSON.parse(c);
  var r = UrlFetchApp.fetch(BASE + '/manager/agents', { headers: _headers(), muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw _apiHata('Kurye listesi alinamadi', r);
  var ids = JSON.parse(r.getContentText()).map(function (a) { return a.id; });
  CacheService.getScriptCache().put('hy_agents', JSON.stringify(ids), 3600);
  return ids;
}

function _aktifSiparisler() {
  var r = UrlFetchApp.fetch(BASE + '/order/orders', { headers: _headers(), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return [];
  try {
    var j = JSON.parse(r.getContentText());
    return Array.isArray(j) ? j : [];
  } catch (e) { return []; }
}

function _gunuCek(kuryeIds, gun) {
  var istekler = kuryeIds.map(function (id) {
    return {
      url: BASE + '/manager/agent/' + id + '/orders-by-date?searchDate=' + gun + 'T12:00:00.000Z',
      headers: _headers(),
      muteHttpExceptions: true
    };
  });
  var out = [], gorulen = {};
  UrlFetchApp.fetchAll(istekler).forEach(function (c) {
    if (c.getResponseCode() !== 200) return;
    var liste;
    try { liste = JSON.parse(c.getContentText()); } catch (e) { return; }
    if (!Array.isArray(liste)) return;
    liste.forEach(function (o) {
      if (o && o.id && !gorulen[o.id]) { gorulen[o.id] = true; out.push(o); }
    });
  });
  return out;
}

// ---------- SAYFA / SATIR ----------
function _sheet() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(SHEET_ADI) || ss.insertSheet(SHEET_ADI);
  if (sh.getLastRow() === 0) {
    _metinSutunlari(sh, [1, 6, 7, 8, 9, 10, 22]);
    sh.getRange(1, 1, 1, NCOL).setValues([BASLIKLAR]).setFontWeight('bold')
      .setBackground('#0c343d').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  } else {
    var mv = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), NCOL)).getValues()[0];
    if (String(mv[0]).trim() !== BASLIKLAR[0] || String(mv[NCOL - 1]).trim() !== BASLIKLAR[NCOL - 1]) {
      throw new Error('"' + SHEET_ADI + '" sekmesinin başlıkları bu sürümle uyuşmuyor. ' +
                      'Sekmeyi silip siparisleriCek() çalıştırın.');
    }
  }
  return sh;
}

function _metinSutunlari(sh, kolonlar) {
  var n = sh.getMaxRows();
  kolonlar.forEach(function (c) { sh.getRange(1, c, n, 1).setNumberFormat('@'); });
}

function _idHaritasi(sh) {
  var m = {};
  if (sh.getLastRow() < 2) return m;
  sh.getRange(2, C_ID, sh.getLastRow() - 1, 1).getValues().forEach(function (r, i) {
    if (r[0] !== '') m[String(r[0])] = i + 2;
  });
  return m;
}

function _nrm(s) {
  var x = String(s == null ? '' : s).toLowerCase();
  return x.normalize ? x.normalize('NFD').replace(/[̀-ͯ]/g, '') : x;
}

function _onlineMi(ad) {
  var n = _nrm(ad);
  for (var i = 0; i < ONLINE_KELIMELER.length; i++) {
    if (n.indexOf(ONLINE_KELIMELER[i]) > -1) return true;
  }
  return false;
}

function _satir(o) {
  var st = function (tip) {
    var s = (o.statuses || []).filter(function (x) { return x.statusType === tip; })[0];
    return s ? new Date(s.createdAt) : null;
  };
  var olustu = o.createdAt ? new Date(o.createdAt) : st('Oluşturuldu');
  var atandi = st('Atandı');
  var cikti  = st('Restorandan Çıktı');
  var yolda  = st('Yolda');
  var teslim = st('Teslim Edildi');
  var iptal  = st('İptal Edildi');

  var dk = function (a, b) { return (a && b) ? Math.round((b - a) / 6000) / 10 : ''; };
  var sa = function (d) { return d ? Utilities.formatDate(d, TZ, 'HH:mm:ss') : ''; };

  var urunler = (o.products || []).map(function (p) {
    var ops = (p.options || []).map(function (x) { return x.name; }).filter(String);
    return p.quantity + 'x ' + p.name + (ops.length ? ' (' + ops.join(', ') + ')' : '');
  }).join(' | ');
  var adet = (o.products || []).reduce(function (t, p) { return t + (p.quantity || 0); }, 0);

  var od = (o.payments || []);
  var yontem = od.map(function (p) { return (p.method && p.method.name) || '?'; }).join(' + ');
  var tutar  = od.reduce(function (t, p) { return t + (p.amount || 0); }, 0);
  var hesap;
  if (iptal)                                         hesap = 'İptal';
  else if (!od.length)                               hesap = '';
  else if (od.every(function (p) { return _onlineMi(p.method && p.method.name); })) hesap = 'Online';
  else if (od.some(function (p) { return !p.received && !_onlineMi(p.method && p.method.name); })) hesap = 'AÇIK';
  else                                               hesap = 'Alındı';

  var durum = iptal ? 'İptal Edildi'
            : teslim ? 'Teslim Edildi'
            : yolda  ? 'Yolda'
            : cikti  ? 'Restorandan Çıktı'
            : atandi ? 'Atandı' : 'Oluşturuldu';

  return {
    _ts: olustu ? olustu.getTime() : 0,
    v: [
      olustu ? Utilities.formatDate(olustu, TZ, 'dd.MM.yyyy') : '',
      o.id, o.localOrderId || '', o.source || 'Panel',
      (o.agent && o.agent.fullName) || '',
      sa(olustu), sa(atandi), sa(cikti), sa(yolda), sa(teslim),
      dk(olustu, atandi), dk(atandi, cikti), dk(cikti, teslim), dk(olustu, teslim),
      o.routeDistanceKm || '', yontem, tutar || '', hesap, adet, urunler,
      (o.customer && o.customer.fullName) || '',
      (o.customer && o.customer.phone) || '',
      (o.address && o.address.text) || '',
      o.note || '', durum
    ]
  };
}

// ---------- TARIH ----------
function _trTarih(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  var p = String(v || '').trim().split('.');
  if (p.length !== 3) return null;
  var d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
  return isNaN(d.getTime()) ? null : d;
}

function _gunler(bas, bit) {
  var d = new Date(bas + 'T12:00:00Z'), son = new Date(bit + 'T12:00:00Z'), out = [];
  while (d <= son) {
    out.push(Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

function _bugun() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function _dun()   { return Utilities.formatDate(new Date(Date.now() - 86400000), TZ, 'yyyy-MM-dd'); }

function nedenEksikDegil() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(SHEET_MESAI);
  var islenmis = {};
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues()
      .forEach(function (r) {
        var t = String(r[0]).trim();
        if (t) islenmis[t] = (islenmis[t] || 0) + 1;
      });
  }
  var bos = {};
  try {
    bos = JSON.parse(PropertiesService.getScriptProperties()
            .getProperty('MESAI_BOS_GUNLER') || '{}');
  } catch (e) {}

  var out = [];
  _gunler(BASLANGIC, BITIS || _bugun()).forEach(function (g) {
    var t = _isoToTr(g);
    out.push(t + '  ->  ' +
      (islenmis[t] ? islenmis[t] + ' satır var' : '') +
      (bos[t] ? '  [boş gün işaretli]' : '') +
      (!islenmis[t] && !bos[t] ? 'EKSİK — çekilecek' : ''));
  });
  Logger.log(out.join('\n'));
}

/* ==================== GECELİK YEDEK ==================== */
var YEDEK_KLASOR = 'BAP Yedek — Kurye Tablosu';
var YEDEK_GUN    = 30;    // kaç günlük kopya saklansın

function yedekAl() {
  var klasor = _yedekKlasoru();
  var ad = 'Kurye Net Çalışma Süresi — ' +
           Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');

  if (klasor.getFilesByName(ad).hasNext()) {
    Logger.log('Bugünün yedeği zaten var.');
    return;
  }

  DriveApp.getFileById(SS_ID).makeCopy(ad, klasor);

  // YEDEK_GUN'den eski kopyaları çöpe at
  var sinir = new Date(Date.now() - YEDEK_GUN * 86400000);
  var it = klasor.getFiles(), silinen = 0;
  while (it.hasNext()) {
    var f = it.next();
    if (f.getDateCreated() < sinir) { f.setTrashed(true); silinen++; }
  }

  Logger.log('Yedek alındı: ' + ad +
             (silinen ? ' · ' + silinen + ' eski kopya silindi' : ''));
}

function _yedekKlasoru() {
  var it = DriveApp.getFoldersByName(YEDEK_KLASOR);
  return it.hasNext() ? it.next() : DriveApp.createFolder(YEDEK_KLASOR);
}

function yedekTetikleyiciKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'yedekAl') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('yedekAl').timeBased()
    .everyDays(1).atHour(4).nearMinute(30).inTimezone(TZ).create();
  Logger.log('Gecelik yedek tetikleyicisi kuruldu (04:30).');
}
/** Bir kez çalıştır: vardiyası, girişi ve paketi olmayan "Giriş yok" satırlarını Mesai (Ham)'dan siler. */
function bosMesaiSatirlariniTemizle() {
  var sh = SpreadsheetApp.openById(SS_ID).getSheetByName(SHEET_MESAI);
  var son = sh.getLastRow();
  if (son < 2) return;
  var v = sh.getRange(2, 1, son - 1, 17).getDisplayValues();
  var sil = [];
  v.forEach(function (r, i) {
    if (String(r[16]).trim() === 'Giriş yok' && !String(r[2]).trim() &&
        !String(r[4]).trim() && !Number(r[13] || 0)) sil.push(i + 2);
  });
  // Alttan yukarı, ardışık satırları tek seferde sil.
  for (var i = sil.length - 1; i >= 0; ) {
    var j = i;
    while (j > 0 && sil[j - 1] === sil[j] - 1) j--;
    sh.deleteRows(sil[j], sil[i] - sil[j] + 1);
    i = j - 1;
  }
  Logger.log(sil.length + ' boş satır silindi.');
}