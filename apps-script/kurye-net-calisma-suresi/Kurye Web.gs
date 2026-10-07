/**
 * ============================================================
 *  KURYE PANELI - web arayuzu + JSON servisi
 * ------------------------------------------------------------
 *  .../exec            -> HTML panel
 *  .../exec?json=1     -> beyaz listeli sekmelerin JSON'u
 *
 *  Ozet / Kesintiler / Gecikenler / Acik hesaplar  -> tarih araligi
 *  Bordro                                          -> hafta (Pzt-Paz)
 *
 *  GUVENLIK: Panelde musteri adi/telefonu var. Dagitim ayarinda
 *  "Erisimi olan: Yalnizca ben" secili olsun.
 * ============================================================
 */

var WEB_SS_ID  = '1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo';
var W_MESAI    = 'Günlük Mesai';
var W_SIPARIS  = 'Siparişler';
var W_ACIK     = 'Açık Hesaplar';
var W_BILGI    = 'Kurye bilgiler';
var W_TZ       = 'Europe/Istanbul';
var W_KDV      = 0.20;      // Haddy Kurye faturasina eklenen KDV
var W_GEC_ESIK = 15;        // "geciken teslimat" esigi (restorandan cikis -> teslim, dk)
var W_BEK_SABIT= 5;         // beklenen yol = 5 dk + 2,5 dk/km (kural katmaniyla ayni)
var W_BEK_KM   = 2.5;
var W_MAKS     = 6000;      // Siparisler'den okunacak azami satir
var W_YOL_ESIK = 20;        // "Teslimat analizi": yol suresi bu dakikayi asanlar
var W_TOP_ESIK = 25;        // "Teslimat analizi": toplam sure bu dakikayi asanlar
var W_MUTFAK   = 15;        // hedef mutfak/cikis suresi (siparis -> restorandan cikis)
var W_GUN_BAS  = 3;         // is gunu bu saatte baslar: 03:00 -> ertesi gun 02:59

/**
 * ERISIM ANAHTARI - VARSAYILAN OLARAK KAPALI (bos).
 *
 * Dagitim "Erisimi olan: Yalnizca ben" ise boyle birak: koruma zaten Google
 * hesabinda, anahtara gerek yok.
 *
 * Dagitimi "Herkes" yapman gerekirse (ornegin Cloudflare Worker arkasindan
 * servis etmek icin) buraya tahmin edilemez bir metin yaz - o zaman /exec
 * adresini bilen ama anahtari bilmeyen hicbir sey goremez. Panelde musteri
 * adi ve telefonu oldugu icin "Herkes" + bos anahtar birlesimi guvenli degildir.
 */
var W_ANAHTAR  = '546ff33314f7865dfe1219b025ffa95c';

var IZINLI_SEKMELER = [
  'Günlük Mesai', 'Kurye Performans', 'Haftalık Bordro & Hakediş',
  'Kesinti Defteri', 'Teslimat Gecikmeleri'
];

/* ==================== GIRIS ==================== */

        function doGet(e) {
  var p = (e && e.parameter) || {};
 if (p.adim) return _kopruGet(e);
  // iPhone Kestirmeler: diğer doğrulama kodları (Edenred vb.) — Pluxee ile aynı anahtar, GET ?sayfa=kod&kaynak=edenred&kod=<SMS metni>
  if (p.sayfa === 'kod' && p.kaynak) {
    if (p.k !== 'DU0HVwX0K-xgyCjnudnUYOeB') return ContentService.createTextOutput('Yetkisiz');
    return ContentService.createTextOutput(JSON.stringify(_kopruKod({ tur: 'kodYaz', kaynak: p.kaynak, kod: String(p.kod || '') })));
  }
  if (p.sayfa === 'pluxee') {
    if (p.kod) return ContentService.createTextOutput(
      p.k === 'DU0HVwX0K-xgyCjnudnUYOeB' ? pluxeeKodYaz(String(p.kod)) : 'Yetkisiz');
    return pluxeeKodSayfasi_();
  }
  if (W_ANAHTAR && String(p.k || '') !== W_ANAHTAR) {
    if (p.veri || p.json) return _wJson({ hata: 'Erişim anahtarı geçersiz.' });
        return HtmlService.createHtmlOutput(
      '<p style="font:15px system-ui;padding:40px;text-align:center;color:#c0392f">' +
      'Erişim anahtarı gerekli.</p>');
  }

  // Panel verisi.
  // cb= verilirse JSONP (script etiketiyle cekilir) - Apps Script sayfayi
  // googleusercontent cercevesinde actigi icin duz fetch calismiyor; JSONP
  // hem cercevede hem Worker arkasinda hem de kendi alan adinda calisir.
  if (p.veri) {
    var d = panelVeri({ preset: p.preset, bas: p.bas, bit: p.bit, hafta: p.hafta });
    if (p.cb) return _wJsonp(p.cb, d);
    return _wJson(d);
  }
  if (p.json) return _wJson(_wSekmeDokumu(p.sheet));

  var t = HtmlService.createTemplateFromFile('Panel');
  t.EXEC = ScriptApp.getService().getUrl();     // panelin veri cagiracagi tam adres
  t.ANAHTAR = W_ANAHTAR || '';
    t.GUNCELLEME = Utilities.formatDate(DriveApp.getFileById(WEB_SS_ID).getLastUpdated(), W_TZ, 'dd.MM.yyyy HH:mm');
    return t.evaluate()
    .setTitle('BAP Kurye Paneli')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function _wJsonp(cb, obj) {
  var ad = String(cb).replace(/[^A-Za-z0-9_]/g, '');   // sadece guvenli isim
  return ContentService
    .createTextOutput(ad + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function _wJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _wSekmeDokumu(tek) {
  var ss = SpreadsheetApp.openById(WEB_SS_ID);
  var istenen = tek ? [tek] : IZINLI_SEKMELER;
  var cikti = {};
  istenen.forEach(function (ad) {
    if (IZINLI_SEKMELER.indexOf(ad) === -1) return;
    var sh = ss.getSheetByName(ad);
    if (!sh || sh.getLastRow() < 1) return;
    cikti[ad] = sh.getRange(1, 1, Math.min(sh.getLastRow(), 5000), sh.getLastColumn())
                  .getDisplayValues();
  });
  return { guncelleme: _wSimdi(), veri: cikti };
}

/* ==================== PANEL VERISI ==================== */
/**
 * opts = { preset:'bugun|dun|son7|buhafta|buay|son30|ozel',
 *          bas:'yyyy-MM-dd', bit:'yyyy-MM-dd',   (preset='ozel' icin)
 *          hafta:'yyyy-MM-dd' }                  (bordro haftasinin Pazartesi'si)
 * Hata firlatmaz - sorunu {hata:...} olarak dondurur ki panel takilip kalmasin.
 */
function panelVeri(opts) {
  try {
    return _panelVeri(opts || {});
  } catch (e) {
    return { hata: String(e && e.message ? e.message : e) };
  }
}

function _panelVeri(o) {
  var t0 = Date.now();
  var ss = SpreadsheetApp.openById(WEB_SS_ID);
  var mesai = ss.getSheetByName(W_MESAI);
  if (!mesai || mesai.getLastRow() < 2) {
    return { hata: '"' + W_MESAI + '" sekmesi boş. Önce kuraliUygula() çalıştırın.' };
  }

  var v = mesai.getRange(2, 1, mesai.getLastRow() - 1, 18).getDisplayValues();
  var tarife = _wTarife(ss);
  var ar = _wAralik(o);

  /* ---------- haftalar (bordro secicisi) ---------- */
  var haftaSet = {};
  v.forEach(function (r) {
    var h = _wHafta(r[0]);
    if (h) haftaSet[h.key] = h.etiket;
  });
  var haftalar = Object.keys(haftaSet).sort().reverse()
                   .map(function (k) { return { key: k, etiket: haftaSet[k] }; });
  var hafta = (o.hafta && haftaSet[o.hafta]) ? o.hafta : (haftalar[0] ? haftalar[0].key : '');

  /* ---------- tek geciste: aralik toplamlari + bordro haftasi ---------- */
  var A = {}, B = {}, kesintiler = [], yokSayilan = [];
  var T = { paket: 0, netDk: 0, kesinti: 0, gun: {} };

  v.forEach(function (r) {
    var d = _wGun(r[0]);
    var ad = String(r[1] || '').trim();
    if (!ad || d.getFullYear() < 2000) return;
    var net = _wSure(r[13]);
    var paket = Number(r[14]) || 0;
    var eDk = Number(r[6]) || 0, pDk = Number(r[11]) || 0;

    if (d >= ar.bas && d <= ar.bit) {
      if (!A[ad]) A[ad] = _wBos(ad);
      _wTopla(A[ad], net, paket, eDk, pDk, Number(r[15]) || 0);
      T.paket += paket; T.netDk += net; T.kesinti += eDk + pDk; T.gun[r[0]] = 1;
      if (String(r[16] || '').indexOf('Yok sayıldı') > -1) {
        yokSayilan.push({ kurye: ad, tarih: r[0], not: String(r[17] || '') });
      }
      if (eDk || pDk) {
        kesintiler.push({
          kurye: ad, tarih: r[0], erken: eDk, kapanis: pDk, toplam: eDk + pDk,
          gerekce: String(r[17] || '').split('||')
                     .map(function (x) { return x.trim(); }).filter(Boolean)
        });
      }
    }

    var h = _wHafta(r[0]);
    if (h && h.key === hafta) {
      if (!B[ad]) B[ad] = _wBos(ad);
      _wTopla(B[ad], net, paket, eDk, pDk, Number(r[15]) || 0);
    }
  });

  /* ---------- Siparisler: TEK okuma, iki is ---------- */
  var sip = _wSiparisOku(ss, ar);
  var tekGun = ar.bas.getTime() === ar.bit.getTime();
  var gunluk = _wGunlukSeri(sip, ar);
  var gecikme = _wGecikme(sip, ar);
  var analiz = _wAnaliz(sip, ar);
  var vardiya = _wVardiya(v, _wIsBugun(), sip);
  var kadro = _wKadro(v, vardiya);
  var acik = _wAcikHesaplar(ss, ar);
  var maliyet = _wMaliyet(v, tarife, ar);
  var saatlik = tekGun ? _wSaatlik(sip, v, tarife, ar) : [];

  return {
    guncelleme: _wSimdi(),
    sureMs: Date.now() - t0,
    okunanSatir: sip.length,
    bugun: _wBugunTr(),
    aralik: { bas: _wIso(ar.bas), bit: _wIso(ar.bit), etiket: ar.etiket, preset: ar.preset },
    haftalar: haftalar,
    hafta: hafta,
    haftaEtiket: haftaSet[hafta] || '',
    gecEsik: W_GEC_ESIK,
    kpi: {
      paket: T.paket,
      netSaat: T.netDk / 60,
      gunSayisi: Object.keys(T.gun).length,
      kesintiDk: T.kesinti,
      acikAdet: acik.length,
      acikTl: acik.reduce(function (s, x) { return s + x.tutar; }, 0),
      ortTeslim: _wOrt(gunluk.map(function (g) { return g.ortDk; }).filter(Boolean)),
      ortBekleme: _wOrtSip(sip, ar, 10),      // siparis -> kuryeye atandi
      ortCikis: _wOrtSip(sip, ar, 11, 10),    // siparis -> restorandan cikis
      gecikenAdet: gecikme.length,
      analizAdet: analiz.length,
      maliyetTl: maliyet.reduce(function (s2, x) { return s2 + x.toplam; }, 0)
    },
    tekGun: tekGun,
    saatlik: saatlik,
    maliyet: maliyet,
    analiz: analiz,
    kadro: kadro,
    aralikKurye: _wHakedis(A, tarife),
    kuryeler: _wHakedis(B, tarife),
    kesintiler: kesintiler,
    yokSayilan: yokSayilan,
    gunluk: gunluk,
    gecikme: gecikme,
    vardiya: vardiya,
    acik: acik
  };
}

/* ==================== TARIH ARALIGI ==================== */
function _wAralik(o) {
  var bugun = _wGunBasi(new Date());
  var p = o.preset || 'son7';
  var bas = new Date(bugun), bit = new Date(bugun), et = '';

  if (p === 'bugun')        { et = 'Bugün'; }
  else if (p === 'dun')     { bas.setDate(bas.getDate() - 1); bit = new Date(bas); et = 'Dün'; }
  else if (p === 'son7')    { bas.setDate(bas.getDate() - 6); et = 'Son 7 gün'; }
  else if (p === 'buhafta') { bas.setDate(bugun.getDate() - ((bugun.getDay() + 6) % 7));
                              et = 'Bu hafta'; }
  else if (p === 'buay')    { bas = new Date(bugun.getFullYear(), bugun.getMonth(), 1);
                              et = 'Bu ay'; }
  else if (p === 'son30')   { bas.setDate(bas.getDate() - 29); et = 'Son 30 gün'; }
  else if (p === 'ozel') {
    var b1 = _wIsoGun(o.bas), b2 = _wIsoGun(o.bit);
    if (b1) bas = b1;
    if (b2) bit = b2;
    if (bas > bit) { var t = bas; bas = bit; bit = t; }
    et = 'Seçilen aralık';
  } else { bas.setDate(bas.getDate() - 6); et = 'Son 7 gün'; p = 'son7'; }

  return {
    bas: bas, bit: bit, preset: p,
    etiket: et + ' · ' + _wTr(bas) + (_wTr(bas) === _wTr(bit) ? '' : ' – ' + _wTr(bit))
  };
}

/* ==================== TOPLAMA ==================== */
function _wBos(ad) {
  return { ad: ad, gun: 0, netDk: 0, paket: 0, erken: 0, kapanis: 0, gec: 0 };
}
function _wTopla(a, net, paket, e, k, gec) {
  a.gun++; a.netDk += net; a.paket += paket; a.erken += e; a.kapanis += k; a.gec += gec;
}

function _wHakedis(harita, tarife) {
  return Object.keys(harita).map(function (ad) {
    var a = harita[ad];
    var tf = _wKuryeTarife(ad, tarife);
    var saat = a.netDk / 60;
    var saatHak = saat * tf.saatUcret;
    var paketHak = a.paket * tf.paketUcret;
    var haric = saatHak + paketHak;
    var bapMi = tf.bordro === 'BAP';
    var kdv = bapMi ? 0 : haric * W_KDV;
    return {
      ad: ad, bordro: tf.bordro, gun: a.gun, netDk: a.netDk, paket: a.paket,
      kesinti: a.erken + a.kapanis, erken: a.erken, kapanis: a.kapanis, gec: a.gec,
      verim: saat > 0 ? a.paket / saat : 0,
      saatUcret: tf.saatUcret, paketUcret: tf.paketUcret,
      saatHak: saatHak, paketHak: paketHak, kdv: kdv, toplam: haric + kdv
    };
  }).sort(function (a, b) { return b.toplam - a.toplam; });
}

/* ==================== SIPARISLER ==================== */
/**
 * Tek okuma; gunluk seri, gecikme ve analiz bunu paylasir.
 * HIZ: once SADECE tarih sutununu okuyup araliga giren satir bloğunu buluyoruz,
 * sonra o blogu 25 sutunla okuyoruz. "Son 7 gun"de ~700 satir okunuyor,
 * 6000 degil - sayfa acilisi belirgin hizlaniyor.
 */
function _wSiparisOku(ss, ar) {
  var sh = ss.getSheetByName(W_SIPARIS);
  if (!sh || sh.getLastRow() < 2) return [];
  var sonSatir = sh.getLastRow();
  var n = sonSatir - 1;

  var tarih = sh.getRange(2, 1, n, 1).getDisplayValues();   // tek sutun - ucuz
  var ilk = -1, son = -1;
  for (var i = 0; i < n; i++) {
    var t = String(tarih[i][0] || '').trim();
    if (!t) continue;
    var d = _wGun(t);
    if (d < ar.bas || d > ar.bit) continue;
    if (ilk === -1) ilk = i;
    son = i;
  }
  if (ilk === -1) return [];
  // guvenlik payi: satirlar tam kronolojik olmayabilir
  ilk = Math.max(0, ilk - 200);
  son = Math.min(n - 1, son + 200);
  return sh.getRange(2 + ilk, 1, son - ilk + 1, 25).getDisplayValues();
}

function _wGunlukSeri(v, ar) {
  var g = {};
  v.forEach(function (r) {
    if (!String(r[0] || '').trim()) return;
    var d = _wIsGun(r[0], r[5]);
    if (d < ar.bas || d > ar.bit) return;
    var t = _wTr(d);
    if (!g[t]) g[t] = { tarih: t, paket: 0, top: 0, adet: 0 };
    g[t].paket++;
    if (String(r[24]).trim() === 'Teslim Edildi') {
      var s = Number(String(r[13]).replace(',', '.'));
      if (s > 0 && s < 180) { g[t].top += s; g[t].adet++; }
    }
  });
  return Object.keys(g).sort(function (a, b) { return _wGun(a) - _wGun(b); })
    .map(function (t) {
      var x = g[t];
      return { tarih: t, kisa: t.substring(0, 5), paket: x.paket,
               ortDk: x.adet ? Math.round(x.top / x.adet * 10) / 10 : 0 };
    });
}

function _wGecikme(v, ar) {
  var out = [];
  v.forEach(function (r) {
    if (!String(r[0] || '').trim()) return;
    var d = _wIsGun(r[0], r[5]);
    if (d < ar.bas || d > ar.bit) return;
    var t = _wTr(d);
    var yol = Number(String(r[12]).replace(',', '.'));
    if (!(yol > W_GEC_ESIK)) return;
    var km = Number(String(r[14]).replace(',', '.')) || 0;
    var bek = km > 0 ? Math.round(W_BEK_SABIT + W_BEK_KM * km) : null;
    if (!String(r[4] || '').trim()) return;          // kuryesiz = iptal, gosterme
    out.push({
      tarih: t, adisyon: r[2], platform: r[3], kurye: String(r[4]).trim(),
      siparis: r[5], cikis: r[7], teslim: r[9],
      yol: yol, toplam: Number(String(r[13]).replace(',', '.')) || 0,
      km: km, beklenen: bek, fazla: bek === null ? null : Math.round(yol - bek),
      musteri: r[20], adres: r[22]
    });
  });
  return out.sort(function (a, b) {
    var c = String(a.kurye).localeCompare(String(b.kurye), 'tr');
    return c || b.yol - a.yol;
  });
}

/* ==================== TESLIMAT ANALIZI ==================== */
/**
 * Iki liste tek sekmede:
 *   tip 'yol'   -> restorandan cikis -> teslim  > W_YOL_ESIK
 *   tip 'toplam'-> siparis -> teslim            > W_TOP_ESIK
 * Sebep: hangi bacak kendi hedefini daha cok asmissa o.
 *   mutfak bacagi = siparis -> restorandan cikis (hedef W_MUTFAK)
 *   kurye bacagi  = restorandan cikis -> teslim  (hedef 5 + 2,5*km)
 */
function _wAnaliz(v, ar) {
  var out = [];
  v.forEach(function (r) {
    if (!String(r[0] || '').trim()) return;
    var d = _wIsGun(r[0], r[5]);
    if (d < ar.bas || d > ar.bit) return;
    var t = _wTr(d);
    if (!String(r[4] || '').trim()) return;
    if (String(r[24]).trim() !== 'Teslim Edildi') return;

    var yol = Number(String(r[12]).replace(',', '.')) || 0;
    var top = Number(String(r[13]).replace(',', '.')) || 0;
    if (!(yol > W_YOL_ESIK) && !(top > W_TOP_ESIK)) return;

    var km = Number(String(r[14]).replace(',', '.')) || 0;
    var bekYol = km > 0 ? Math.round(W_BEK_SABIT + W_BEK_KM * km) : W_BEK_SABIT;
    var mutfak = Math.max(0, Math.round(top - yol));       // siparis -> restorandan cikis
    var fazlaMutfak = mutfak - W_MUTFAK;
    var fazlaYol = Math.round(yol - bekYol);

    var sebep;
    if (fazlaMutfak > 0 && fazlaYol > 0) sebep = 'Her ikisi';
    else if (fazlaMutfak > fazlaYol)     sebep = 'Mutfak';
    else if (fazlaYol > 0)               sebep = 'Kurye';
    else                                 sebep = 'Sınırda';

    out.push({
      tarih: t, adisyon: r[2], platform: r[3], kurye: String(r[4]).trim(),
      siparis: r[5], atandi: r[6], cikis: r[7], teslim: r[9],
      mutfak: mutfak, yol: yol, toplam: top,
      km: km, bekYol: bekYol, fazlaYol: fazlaYol, fazlaMutfak: fazlaMutfak,
      sebep: sebep,
      tip: (yol > W_YOL_ESIK ? 'yol' : '') + (top > W_TOP_ESIK ? (yol > W_YOL_ESIK ? '+' : '') + 'toplam' : ''),
      musteri: r[20], adres: r[22]
    });
  });
  return out.sort(function (a, b) {
    var c = String(a.kurye).localeCompare(String(b.kurye), 'tr');
    return c || b.toplam - a.toplam;
  });
}

/** Siparisler'den ortalama: sut1 - sut2 (sut2 yoksa dogrudan sut1). */
function _wOrtSip(v, ar, sut1, sut2) {
  var t = 0, n = 0;
  v.forEach(function (r) {
    var d = _wGun(String(r[0] || '').trim());
    if (d < ar.bas || d > ar.bit) return;
    var a = Number(String(r[sut1]).replace(',', '.'));
    if (!(a >= 0)) return;
    var x = a + (sut2 !== undefined ? (Number(String(r[sut2]).replace(',', '.')) || 0) : 0);
    if (x > 0 && x < 180) { t += x; n++; }
  });
  return n ? Math.round(t / n * 10) / 10 : 0;
}

/* ==================== MALIYET ==================== */
/** Gun gun kurye maliyeti (saat + paket, Haddy'de KDV dahil). */
function _wMaliyet(v, tarife, ar) {
  var g = {};
  v.forEach(function (r) {
    var t = String(r[0] || '').trim();
    var ad = String(r[1] || '').trim();
    if (!t || !ad) return;
    var d = _wGun(t);
    if (d < ar.bas || d > ar.bit) return;
    var tf = _wKuryeTarife(ad, tarife);
    var kdv = tf.bordro === 'BAP' ? 1 : 1 + W_KDV;
    var saatM = _wSure(r[13]) / 60 * tf.saatUcret * kdv;
    var pktM = (Number(r[14]) || 0) * tf.paketUcret * kdv;
    if (!g[t]) g[t] = { tarih: t, kisa: t.substring(0, 5), saat: 0, paket: 0, toplam: 0, kurye: 0 };
    g[t].saat += saatM; g[t].paket += pktM; g[t].toplam += saatM + pktM; g[t].kurye++;
  });
  return Object.keys(g).sort(function (a, b) { return _wGun(a) - _wGun(b); })
           .map(function (t) { return g[t]; });
}

/**
 * Tek gun secildiginde saat saat: paket, ciro, ortalama teslim, kurye maliyeti.
 * Gece yarisini asan saatler 24+ olarak siralanir (10:00 -> 02:00 dogru sirada).
 */
function _wSaatlik(sip, mesai, tarife, ar) {
  var gun = _wTr(ar.bas);
  var S = {};
  var al = function (h) {                       // h: 0-23 gercek saat
    var k = _wSaatSira(h);
    if (!S[k]) S[k] = { h: h, sira: k, etiket: _wSaatEt(h), paket: 0, ciro: 0,
                        sureTop: 0, sureN: 0, saatM: 0, paketM: 0 };
    return S[k];
  };

  // --- kurye vardiya dakikalari -> saatlik ucret maliyeti ---
  mesai.forEach(function (r) {
    if (String(r[0]).trim() !== gun) return;
    var ad = String(r[1] || '').trim();
    var g1 = _wSaat(r[3]);                      // Giriş
    if (g1 === 9999) return;
    var g2 = _wSaat(r[8]);                      // Çıkış
    if (g2 === 9999) {                          // vardiya hâlâ açık -> şimdiye kadar
      var n = new Date();
      g2 = Number(Utilities.formatDate(n, W_TZ, 'H')) * 60 +
           Number(Utilities.formatDate(n, W_TZ, 'm'));
      if (g2 < g1) g2 += 1440;
      if (gun !== _wBugunTr()) return;           // geçmiş günde açık vardiya sayılmaz
    }
    if (g2 < g1) g2 += 1440;
    var tf = _wKuryeTarife(ad, tarife);
    var kdv = tf.bordro === 'BAP' ? 1 : 1 + W_KDV;
    for (var m = g1; m < g2; m++) {
      al(Math.floor(m / 60) % 24).saatM += tf.saatUcret / 60 * kdv;
    }
  });

  // --- teslim edilen siparisler -> paket, ciro, sure, paket maliyeti ---
  sip.forEach(function (r) {
    if (_wTr(_wIsGun(r[0], r[5])) !== gun) return;      // iş günü 03:00–02:59
    if (String(r[24]).trim() !== 'Teslim Edildi') return;
    var ts = _wSaat(r[9]);
    if (ts === 9999) return;
    var x = al(Math.floor(ts / 60) % 24);
    x.paket++;
    x.ciro += Number(String(r[16]).replace(/\./g, '').replace(',', '.')) || 0;
    var top = Number(String(r[13]).replace(',', '.'));
    if (top > 0 && top < 180) { x.sureTop += top; x.sureN++; }
    var tf = _wKuryeTarife(String(r[4] || '').trim(), tarife);
    x.paketM += tf.paketUcret * (tf.bordro === 'BAP' ? 1 : 1 + W_KDV);
  });

  return Object.keys(S).map(Number).sort(function (a, b) { return a - b; })
    .map(function (k) {
      var x = S[k];
      x.toplam = x.saatM + x.paketM;
      x.ortDk = x.sureN ? Math.round(x.sureTop / x.sureN * 10) / 10 : 0;
      x.oran = x.ciro > 0 ? x.toplam / x.ciro * 100 : null;
      return x;
    });
}

function _wSaatEt(h) {
  return (h < 10 ? '0' : '') + h + ':00';
}

/** Son 30 gunde gorulen kurye kadrosu + bugun off olanlar. */
function _wKadro(v, bugunListe) {
  var sinir = new Date(); sinir.setDate(sinir.getDate() - 30);
  var hepsi = {};
  v.forEach(function (r) {
    var d = _wGun(String(r[0] || '').trim());
    var ad = String(r[1] || '').trim();
    if (ad && d >= sinir) hepsi[ad] = 1;
  });
  var bugun = {};
  bugunListe.forEach(function (x) { bugun[x.kurye] = 1; });
  var off = Object.keys(hepsi).filter(function (a) { return !bugun[a]; }).sort();
  return { toplam: Object.keys(hepsi).length, off: off };
}

/* ==================== VARDIYA / ACIK HESAP ==================== */
function _wVardiya(v, bugun, sip) {
  // paket sayisi: is gunu (03:00-02:59) icinde o kuryeye ait teslim edilen siparisler
  var pk = {};
  (sip || []).forEach(function (r) {
    if (_wTr(_wIsGun(r[0], r[5])) !== bugun) return;
    var ad = String(r[4] || '').trim();
    if (!ad) return;
    pk[ad] = (pk[ad] || 0) + 1;
  });

  var out = [];
  v.forEach(function (r) {
    if (String(r[0]).trim() !== bugun) return;
    out.push({
      kurye: String(r[1] || '').trim(),
      // Günlük Mesai sütunları: 2=Planlı Giriş 3=Giriş 4=İlk Paket 5=Baz Giriş
      //                         6=Erken 7=Planlı Çıkış 8=Çıkış
      plGiris: r[2], giris: r[3], plCikis: r[7], cikis: r[8],
      paket: pk[String(r[1] || '').trim()] || Number(r[14]) || 0,
      gec: Number(r[15]) || 0,
      durum: String(r[16] || '').trim()
    });
  });
  return out.sort(function (a, b) {
    var x = _wSaat(a.plGiris), y = _wSaat(b.plGiris);
    return x !== y ? x - y : String(a.kurye).localeCompare(String(b.kurye), 'tr');
  });
}

function _wAcikHesaplar(ss, ar) {
  var sh = ss.getSheetByName(W_ACIK);
  if (!sh || sh.getLastRow() < 2) return [];
  var n = Math.min(sh.getLastRow() - 1, 2000);
  var v = sh.getRange(2, 1, n, 11).getDisplayValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    var t = String(v[i][0] || '').trim();
    if (!t || t === 'TOPLAM' || t === 'Kurye' || t.indexOf('KURYE BAZINDA') === 0) break;
    var d = _wGun(t);
    if (d < ar.bas || d > ar.bit) continue;
    if (!String(v[i][4] || '').trim()) continue;      // kuryesiz = iptal, gösterme
    out.push({
      tarih: t, adisyon: v[i][1], platform: v[i][3], kurye: v[i][4],
      musteri: v[i][5], telefon: v[i][6], yontem: v[i][7],
      tutar: Number(String(v[i][8]).replace(/\./g, '').replace(',', '.')) || 0
    });
  }
  return out;
}

/* ==================== TARIFE ==================== */
function _wTarife(ss) {
  var sh = ss.getSheetByName(W_BILGI);
  var kurye = {}, varsayilan = {};
  if (!sh || sh.getLastRow() < 2) return { kurye: kurye, varsayilan: varsayilan };
  sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().forEach(function (r) {
    var ad = String(r[0] || '').trim();
    var bordro = String(r[1] || '').trim();
    if (!bordro) return;
    var kayit = {
      bordro: bordro.toUpperCase().indexOf('BAP') >= 0 ? 'BAP' : 'Haddy Kurye',
      saatUcret: Number(r[2]) || 0, paketUcret: Number(r[3]) || 0
    };
    if (ad) kurye[ad] = kayit; else varsayilan[kayit.bordro] = kayit;
  });
  return { kurye: kurye, varsayilan: varsayilan };
}

function _wKuryeTarife(ad, t) {
  if (t.kurye[ad]) return t.kurye[ad];
  var isimler = Object.keys(t.kurye);
  for (var i = 0; i < isimler.length; i++) {
    var a = isimler[i];
    if (ad.toLowerCase().indexOf(a.toLowerCase()) === 0 ||
        a.toLowerCase().indexOf(ad.toLowerCase()) === 0) return t.kurye[a];
  }
  return t.varsayilan['Haddy Kurye'] ||
         { bordro: 'Haddy Kurye', saatUcret: 235, paketUcret: 25 };
}

/* ==================== YARDIMCI ==================== */
function _wGunBasi(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

/**
 * IS GUNU: 03:00 - ertesi gun 02:59.
 * Gece yarisindan sonra (saat < W_GUN_BAS) gelen siparis bir ONCEKI gune yazilir.
 */
function _wIsGun(tarih, saat) {
  var d = _wGun(tarih);
  if (_wSaat(saat) < W_GUN_BAS * 60) d.setDate(d.getDate() - 1);
  return d;
}

/** Saati is gunu icinde siraya sokar: 03:00 -> 0 ... 02:00 -> 23 */
function _wSaatSira(h) { return (h - W_GUN_BAS + 24) % 24; }

/** "dd.MM.yyyy" -> Date (gun basi) */
function _wGun(tr) {
  var p = String(tr || '').split('.');
  if (p.length !== 3) return new Date(0);
  var d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
  return isNaN(d.getTime()) ? new Date(0) : d;
}

/** "yyyy-MM-dd" -> Date */
function _wIsoGun(s) {
  var p = String(s || '').split('-');
  if (p.length !== 3) return null;
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return isNaN(d.getTime()) ? null : d;
}

function _wIso(d) { return Utilities.formatDate(d, W_TZ, 'yyyy-MM-dd'); }
function _wTr(d)  { return Utilities.formatDate(d, W_TZ, 'dd.MM.yyyy'); }

/** Pazartesi–Pazar hafta anahtari + etiketi */
function _wHafta(tr) {
  var d = _wGun(tr);
  if (d.getFullYear() < 2000) return null;
  var pzt = new Date(d);
  pzt.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  var paz = new Date(pzt);
  paz.setDate(pzt.getDate() + 6);
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return {
    key: pzt.getFullYear() + '-' + p(pzt.getMonth() + 1) + '-' + p(pzt.getDate()),
    etiket: p(pzt.getDate()) + '.' + p(pzt.getMonth() + 1) + ' – ' +
            p(paz.getDate()) + '.' + p(paz.getMonth() + 1)
  };
}

function _wSure(s) {
  var m = String(s || '').match(/^(\d+):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function _wSaat(s) {
  var m = String(s || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 9999;
}

function _wOrt(a) {
  if (!a.length) return 0;
  return Math.round(a.reduce(function (s, x) { return s + x; }, 0) / a.length * 10) / 10;
}

function _wBugunTr() { return Utilities.formatDate(new Date(), W_TZ, 'dd.MM.yyyy'); }

/** Is gunu olarak bugun: saat 03:00'ten onceyse hala dunun is gunu. */
function _wIsBugun() {
  var n = new Date();
  if (Number(Utilities.formatDate(n, W_TZ, 'H')) < W_GUN_BAS) {
    n = new Date(n.getTime() - 86400000);
  }
  return Utilities.formatDate(n, W_TZ, 'dd.MM.yyyy');
}
function _wSimdi()   { return Utilities.formatDate(new Date(), W_TZ, 'dd.MM.yyyy HH:mm'); }