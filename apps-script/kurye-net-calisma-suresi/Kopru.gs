/**
 * ============================================================
 *  KÖPRÜ  (HemenYolda -> Google E-Tablolar)   sürüm 1.2
 *  Bap Pizza Kadıköy
 * ------------------------------------------------------------
 *  NEDEN VAR?
 *  HemenYolda sunucusu yurt dışı / veri merkezi IP'lerini
 *  engelliyor ("kod: GEO"). Google Apps Script istekleri
 *  Google'ın yurt dışındaki sunucularından çıktığı için 403 yiyor.
 *
 *  ÇÖZÜM: veriyi SENİN TARAYICIN çeker (Türkiye IP'si, panelde
 *  zaten oturum açık), Apps Script sadece gelen veriyi işleyip
 *  tabloya yazar. Token tarayıcıdan hiç çıkmaz.
 *
 *  1.1 DEĞİŞİKLİKLERİ
 *   - doGet -> _kopruGet. Kurye Web.gs'teki doGet ile çakışıyordu,
 *     Apps Script sessizce birini eziyordu ve köprü hiç çalışmıyordu.
 *     Kurye Web.gs -> doGet başına şu satır eklenmeli:
 *         if (p.adim) return _kopruGet(e);
 *   - Bugün/dün ve açık hesabı olan günler için siparişler ARTIK
 *     her turda yeniden çekiliyor. Eskiden "gün tabloda var" diye
 *     atlanıyordu; kapatılan hesaplar tabloya hiç yansımıyordu.
 *   - _eksikGunler artık açık hesabı olan günleri de kuyruğa alıyor.
 *   - Yeni "bitir" adımı: köprü bitince acikHesaplar() ve
 *     kuraliUygula() kendiliğinden çalışıyor.
 *
 *  1.2 DEĞİŞİKLİKLERİ
 *   - Bir gün tabloda (herhangi bir kuryeyle) yazılmışsa bir daha hiç
 *     sorulmuyordu. HemenYolda'ya SONRADAN eklenen kurye (ör. alp 24.09'da
 *     eklendi; 22-23.09 hiç gelmedi) o yüzden kayboluyordu. Siparişler de
 *     kurye kurye çekildiği için o kuryenin siparişleri de gelmiyordu.
 *   - Yeni: kopruGunleriYenidenCek(['22.09.2026','23.09.2026']) ya da
 *     kopruEylulYenidenCek() / kopruSon7GunYenidenCek(). İşaretlenen günler
 *     köprünün bir sonraki çalışmasında EN ÖNCE, mesai + siparişleriyle
 *     birlikte yeniden çekilir; eksik kurye satırları eklenir, mevcutlar
 *     güncellenir, hiçbir satır silinmez. Gün işlenince işaret kalkar.
 *   - Kuyruk sırası: bugün/dün → yeniden çekilecek ve hiç çekilmemiş günler →
 *     açık hesap / açık vardiya tazelemesi. Eskiden açık hesabı olan çok gün
 *     varsa 10'luk kuyruğu doldurup eksik günlerin sırasını hiç getirmiyordu.
 *   - Kurye listesi her çalışmada HemenYolda'dan yeniden alınır; eskiden
 *     kaydedilmiş liste yeni eklenen kuryeyi hiç sormuyordu.
 *   - HemenYolda 403 verince köprü hemen durur (eskiden 5 dk boyunca denemeye
 *     devam ediyor, panelin kendisini de kilitliyordu). İstekler arası 1,5 sn,
 *     günler arası 10 sn, her turda en fazla 7 gün.
 *   - Kutuda bu turda işlenen günler ve kalan eksik gün sayısı yazar.
 *     Bugün/dün her turda tazelendiği için "Eksik gün yok" yazısı çıkmaz;
 *     bitiş işareti "EKSIK GUN KALMADI"dır.
 * ============================================================
 */

var KOPRU_SURUM = '1.2';

// ---------- ANAHTAR ----------
/**
 * Web uygulamasi "Herkes"e acik oldugu icin basit bir paylasilan sifre.
 * SABIT tutuluyor: uretilen kod ile sunucudaki deger asla ayrisamasin diye.
 * NOT: Bu deger disari sizdiysa degistirip yeni surum dagit.
 */
var KOPRU_ANAHTAR = '__KOPRU_ANAHTAR__';

/**
 * WEB UYGULAMASI ADRESI (.../exec ile biten).
 */
var KOPRU_URL = '__KOPRU_URL__';

function _kopruAnahtar() { return KOPRU_ANAHTAR; }

function _kopruYanit(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Hala AÇIK hesabi olan gunler (dd.MM.yyyy -> 1).
 * Tek calistirmada bir kez hesaplanir - hem plan hem _eksikGunler kullaniyor.
 */
var _AHG_CACHE = null;
function _acikHesapGunleri() {
  if (_AHG_CACHE) return _AHG_CACHE;
  var m = {};
  try {
    _acikGunler(_sheet()).forEach(function (x) { m[_isoToTr(x)] = 1; });
  } catch (e) { m = {}; }
  _AHG_CACHE = m;
  return m;
}

// ---------- 1.2: ELLE YENIDEN CEKILECEK GUNLER ----------
/** Yeniden cekilmesi istenen gunler (dd.MM.yyyy -> 1). */
function _kopruZorlaOku() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('KOPRU_ZORLA_GUNLER') || '{}'); }
  catch (e) { return {}; }
}
function _kopruZorlaSil(tr) {
  var z = _kopruZorlaOku();
  if (!z[tr]) return;
  delete z[tr];
  PropertiesService.getScriptProperties().setProperty('KOPRU_ZORLA_GUNLER', JSON.stringify(z));
}

/**
 * Verilen gunleri koprunun bir sonraki calismasinda yeniden cektirir (mesai + siparis).
 * Kullanim: kopruGunleriYenidenCek(['22.09.2026', '23.09.2026'])
 */
function kopruGunleriYenidenCek(tarihler) {
  var z = _kopruZorlaOku(), n = 0;
  (tarihler || []).forEach(function (t) {
    t = String(t || '').trim();
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(t)) { z[t] = 1; n++; }
  });
  PropertiesService.getScriptProperties().setProperty('KOPRU_ZORLA_GUNLER', JSON.stringify(z));
  var m = n + ' gün yeniden çekilmek üzere işaretlendi (toplam bekleyen: ' + Object.keys(z).length + ').\n' +
          'Şimdi köprü kodunu HemenYolda panelinde çalıştır. Kod her seferinde en fazla 5 işaretli gün işler; ' +
          'kutuda "EKSIK GUN KALMADI" yazana kadar tekrar çalıştır.';
  Logger.log(m);
  try { SpreadsheetApp.getUi().alert('Yeniden çekim', m, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return m;
}

/** BASLANGIC'tan (01.09.2026) bugune kadar butun gunleri yeniden cektirir. */
function kopruEylulYenidenCek() {
  return kopruGunleriYenidenCek(_gunler(BASLANGIC, _dun()).map(_isoToTr));
}

/** Son 7 gunu yeniden cektirir (sonradan eklenen kurye / duzeltilen oturum icin, haftada bir yeter). */
function kopruSon7GunYenidenCek() {
  var bit = _dun(), bas = Utilities.formatDate(new Date(Date.now() - 7 * 86400000), TZ, 'yyyy-MM-dd');
  return kopruGunleriYenidenCek(_gunler(bas, bit).map(_isoToTr));
}

// ---------- 1) TARAYICI "ne lazim?" diye sorar ----------
function _kopruGet(e) {
  var p = (e && e.parameter) || {};

  // Anahtarsiz acik test: gizli sekmede bu adresi ac.
  if (p.adim === 'test') {
    return _kopruYanit({ ok: true, erisim: 'acik', surum: KOPRU_SURUM,
                         mesaj: 'Kopru ayakta.' });
  }

  if (p.anahtar !== _kopruAnahtar()) return _kopruYanit({ hata: 'Anahtar hatalı.' });

  if (p.adim === 'ping') return _kopruYanit({ ok: true, surum: KOPRU_SURUM });

  if (p.adim === 'plan') {
    var kuryeler = null;
    try {
      var k = PropertiesService.getScriptProperties().getProperty('HY_KURYELER');
      if (k) kuryeler = JSON.parse(k);
    } catch (err) { kuryeler = null; }

    var detay = _kuyrukDetay();
    var gunler = detay.once.concat(detay.eksik, detay.tazele).slice(0, Number(p.enfazla || 25));
    var kalanEksik = detay.eksik.filter(function (g) { return gunler.indexOf(g) < 0; }).length;

    // Siparis istegi ATLANABILECEK gunler:
    //   - bugun/dun DEGIL  (durumlar hala degisiyor)
    //   - acik hesabi YOK  (kapatilan hesap tabloya yansisin)
    //   - yeniden cekim istenmemis (1.2: sonradan eklenen kuryenin siparisleri de gelsin)
    //   - ve o gun zaten tabloda var
    var acik    = _acikHesapGunleri();
    var zorla   = _kopruZorlaOku();
    var varOlan = _siparisliGunler();
    var bugunIso = _bugun(), dunIso = _dun();

    var hazir = gunler.filter(function (g) {
      if (g === bugunIso || g === dunIso) return false;
      if (acik[_isoToTr(g)]) return false;
      if (zorla[_isoToTr(g)]) return false;
      return !!varOlan[_isoToTr(g)];
    });

    return _kopruYanit({
      ok: true,
      base: BASE,
      // 1.2: kurye listesi her calismada HemenYolda'dan tazelenir (kayitli liste yeni kuryeyi kacirmasin).
      kuryeler: null,
      kayitliKurye: (kuryeler && kuryeler.length) || 0,
      gunler: gunler,
      eksikBuTur: detay.eksik.filter(function (g) { return gunler.indexOf(g) > -1; }).length,
      kalanEksik: kalanEksik,
      sipHazir: hazir
    });
  }

  return _kopruYanit({ hata: 'Bilinmeyen adım.' });
}

// ---------- 2) TARAYICI cekip yollar, biz yazariz ----------
function doPost(e) {
  var g;
  try { g = JSON.parse(e.postData.contents); }
  catch (err) { return _kopruYanit({ hata: 'Geçersiz JSON.' }); }

  if (!g || g.anahtar !== _kopruAnahtar()) return _kopruYanit({ hata: 'Anahtar hatalı.' });

  var kilit = LockService.getScriptLock();
  if (!kilit.tryLock(30000)) return _kopruYanit({ hata: 'Meşgul, tekrar dene.' });

  try {
    if (g.tur === 'kuryeler') {
      var l = (g.kuryeler || []).filter(function (k) { return k && k.id && k.ad; });
      if (!l.length) return _kopruYanit({ hata: 'Kurye listesi boş.' });
      PropertiesService.getScriptProperties().setProperty('HY_KURYELER', JSON.stringify(l));
      CacheService.getScriptCache().put('hy_agents_full', JSON.stringify(l), 21600);
      CacheService.getScriptCache().put('hy_agents',
        JSON.stringify(l.map(function (k) { return k.id; })), 21600);
      return _kopruYanit({ ok: true, sayi: l.length });
    }

    if (g.tur === 'gun') return _kopruYanit(_kopruGunYaz(g.gun, g.kuryeler || []));

    // Kopru bitisinde: acik hesaplari ve Gunluk Mesai'yi tazele.
    // Bunlar API'ye gitmez, sadece tablodan tabloya hesaplar.
    if (g.tur === 'bitir') {
      var sonuc = { ok: true };
      try { sonuc.acik = acikHesaplar(); }
      catch (err2) { sonuc.acikHata = String(err2 && err2.message || err2); }
      try { kuraliUygula(false); sonuc.kural = true; }
      catch (err3) { sonuc.kuralHata = String(err3 && err3.message || err3); }
      return _kopruYanit(sonuc);
    }

    // 1.2: BAP panelinden mesai düzeltmesi yazılınca Günlük Mesai yeniden hesaplanır.
    if (g.tur === 'kural') {
      kuraliUygula(false);
      return _kopruYanit({ ok: true });
    }

    return _kopruYanit({ hata: 'Bilinmeyen tür.' });
  } catch (err) {
    return _kopruYanit({ hata: String(err && err.message || err) });
  } finally {
    kilit.releaseLock();
  }
}

// ---------- BIR GUNU TABLOYA YAZ ----------
function _kopruGunYaz(gun, paket) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(gun || ''))) return { hata: 'Gün formatı hatalı.' };
  var tr = _isoToTr(gun);

  // --- a) siparisler ---
  var sipGeldi = paket.some(function (b) { return b.siparisler !== undefined; });
  var yeniSip = [], guncelSip = 0, tumSatirlar = [];
  var sipSh = null, idHar = {};
  if (sipGeldi) {
    sipSh = _sheet();
    idHar = _idHaritasi(sipSh);
  }

  if (sipGeldi) paket.forEach(function (b) {
    (b.siparisler || []).forEach(function (o) {
      if (!o || !o.id) return;
      var s = _satir(o);
      tumSatirlar.push(s.v);
      var r = idHar[String(o.id)];
      if (r) {
        var mev = sipSh.getRange(r, 1, 1, NCOL).getValues()[0];
        if (mev.join('') !== s.v.join('')) {
          sipSh.getRange(r, 1, 1, NCOL).setValues([s.v]);
          guncelSip++;
        }
      } else {
        yeniSip.push(s);
      }
    });
  });

  if (yeniSip.length) {
    yeniSip.sort(function (a, b) { return a._ts - b._ts; });
    var ilk = sipSh.getLastRow() + 1;
    sipSh.getRange(ilk, 1, yeniSip.length, NCOL)
         .setValues(yeniSip.map(function (x) { return x.v; }));
  }

  // --- b) o gunun siparis ozeti ---
  var ozet = sipGeldi ? _ozetSatirlardan(tumSatirlar) : _ozetTablodan(tr);
  var sipSayisi = sipGeldi ? tumSatirlar.length : Object.keys(ozet).length;

  // --- c) mesai satirlari ---
  var ss = SpreadsheetApp.openById(SS_ID);
  var mSh = ss.getSheetByName(SHEET_MESAI) || ss.insertSheet(SHEET_MESAI);
  if (mSh.getLastRow() === 0) {
    _metinSutunlari(mSh, [1, 3, 4, 5, 6, 8, 10, 11, 12, 18]);
        mSh.getRange(1, 1, 1, MESAI_NCOL).setValues([MESAI_BASLIK]).setFontWeight('bold')
       .setBackground('#134f5c').setFontColor('#ffffff');
    mSh.setFrozenRows(1);
  }

  var harita = {}, gunVarMi = false;
  if (mSh.getLastRow() > 1) {
    var mv = mSh.getRange(2, 1, mSh.getLastRow() - 1, 2).getDisplayValues();
    mv.forEach(function (r, i) {
      var t = String(r[0]).trim(), a = String(r[1]).trim();
      if (!t || !a) return;
      harita[t + '|' + a] = i + 2;
      if (t === tr) gunVarMi = true;
    });
  }

  var yeniM = [], guncelM = 0, atlanan = 0;
  paket.forEach(function (b) {
    // Vardiya istegi basarisizsa satir YAZMA. Yoksa "Giris yok" diye
    // yanlis veri yazilir ve gun bir daha sorgulanmaz.
    if (b.sOk === false || b.pOk === false) { atlanan++; return; }
    var s = _mesaiSatiri(tr, { ad: b.ad, plan: b.plan, shifts: b.shifts },
                         ozet[tr + '|' + b.ad]);
    if (!s) return;

    var yeniGiris = String(s[4] || '').trim();          // Giriş
    var paketSay  = Number(s[13] || 0);                 // Paket

    // KURAL 1 - imkansiz satir: paket tasimis ama "giris yok".
    if (!yeniGiris && paketSay > 0) { atlanan++; return; }

    var k = tr + '|' + b.ad;
    if (harita[k]) {
      var mev = mSh.getRange(harita[k], 1, 1, MESAI_NCOL).getValues();
      var eskiGiris = String(mev[0][4] || '').trim();

      // KURAL 2 - dolu satirin uzerine bos yazma.
      if (eskiGiris && !yeniGiris) { atlanan++; return; }

      if (mev[0].join('') !== s.join('')) {
        mSh.getRange(harita[k], 1, 1, MESAI_NCOL).setValues([s]);
        guncelM++;
      }
    } else {
      yeniM.push(s);
    }
  });

  if (yeniM.length) {
    yeniM.sort(function (a, b) { return String(a[1]).localeCompare(String(b[1]), 'tr'); });
    mSh.getRange(mSh.getLastRow() + 1, 1, yeniM.length, MESAI_NCOL).setValues(yeniM);
  }

  // --- d) bos gun isaretle / isareti kaldir ---
  var props = PropertiesService.getScriptProperties();
  var bos = {};
  try { bos = JSON.parse(props.getProperty('MESAI_BOS_GUNLER') || '{}'); } catch (err) { bos = {}; }
  var bugunTr = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy');
  var dunTr   = Utilities.formatDate(new Date(Date.now() - 86400000), TZ, 'dd.MM.yyyy');

  if (!atlanan && !yeniM.length && !gunVarMi && !sipSayisi &&
      tr !== bugunTr && tr !== dunTr) {
    bos[tr] = 1;
  } else {
    delete bos[tr];
  }
  props.setProperty('MESAI_BOS_GUNLER', JSON.stringify(bos));
  props.setProperty('KOPRU_SON', new Date().toISOString());
  _kopruZorlaSil(tr);   // 1.2: yeniden cekim istenmisse islendi

  return { ok: true, gun: tr, atlanan: atlanan,
           mesaiYeni: yeniM.length, mesaiGuncel: guncelM,
           sipYeni: yeniSip.length, sipGuncel: guncelSip };
}

/** _siparisOzeti ile ayni mantik, ama tablodan degil elimizdeki satirlardan. */
function _ozetSatirlardan(satirlar) {
  var ozet = {};
  var ilkKol = ILK_PAKET_ANI === 'Atandı' ? 6 : 7;
  satirlar.forEach(function (r) {
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

/** Siparisler sekmesinde kayitli gunler (dd.MM.yyyy -> 1). Sadece Tarih sutunu. */
function _siparisliGunler() {
  var sh = _sheet();
  var out = {};
  var son = sh.getLastRow();
  if (son < 2) return out;
  var v = sh.getRange(2, C_TARIH, son - 1, 1).getDisplayValues();
  for (var i = 0; i < v.length; i++) {
    var t = String(v[i][0]).trim();
    if (t) out[t] = 1;
  }
  return out;
}

/** Bir is gununun siparis ozetini TABLODAN cikarir (API'ye gitmeden). */
function _ozetTablodan(tr) {
  var sh = _sheet();
  var son = sh.getLastRow();
  if (son < 2) return {};

  var ertesi = _trArtiGun(tr, 1);
  var tarihler = sh.getRange(2, C_TARIH, son - 1, 1).getDisplayValues();

  var ilk = -1, sonu = -1;
  for (var i = 0; i < tarihler.length; i++) {
    var t = String(tarihler[i][0]).trim();
    if (t === tr || t === ertesi) {
      if (ilk < 0) ilk = i;
      sonu = i;
    }
  }
  if (ilk < 0) return {};

  var blok = sh.getRange(ilk + 2, 1, sonu - ilk + 1, NCOL).getValues();
  var sec = [];
  for (var j = 0; j < blok.length; j++) {
    var r = blok[j];
    if (!String(r[0]).trim()) continue;
    if (_isGunu(r[0], r[5]) === tr) sec.push(r);
  }
  return _ozetSatirlardan(sec);
}

/** dd.MM.yyyy + n gun -> dd.MM.yyyy */
function _trArtiGun(tr, n) {
  var p = tr.split('.');
  var d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
  d = new Date(d.getTime() + n * 86400000);
  var z = function (x) { return (x < 10 ? '0' : '') + x; };
  return z(d.getDate()) + '.' + z(d.getMonth() + 1) + '.' + d.getFullYear();
}

/**
 * Hangi gunler cekilmeli? 1.2 sirasi:
 *   1) bugun ve dun (her zaman)
 *   2) yeniden cekim istenen gunler + hic cekilmemis gunler (yeniden eskiye)
 *   3) tazeleme: vardiyasi acik kalan ya da acik hesabi olan gunler (yeniden eskiye)
 * Eskiden hepsi tarih sirasiyla tek listedeydi; acik hesabi olan cok gun varsa
 * 10'luk kuyrugu doldurup eksik gunlerin sirasini hic getirmiyordu.
 */
function _eksikGunler(enFazla) {
  var d = _kuyrukDetay();
  return d.once.concat(d.eksik, d.tazele).slice(0, enFazla || 25);
}

/** Kuyrugu uc gruba ayirir: once (bugun/dun), eksik (hic cekilmemis / yeniden cekilecek), tazele. */
function _kuyrukDetay() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(SHEET_MESAI);
  var islenmis = {}, acikGun = {};
  if (sh && sh.getLastRow() > 1) {
      if (sh.getMaxColumns() < MESAI_NCOL) {
    sh.insertColumnsAfter(sh.getMaxColumns(), MESAI_NCOL - sh.getMaxColumns());
  }
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, MESAI_NCOL).getDisplayValues();
    v.forEach(function (r) {
      var t = String(r[0]).trim();
      if (!t) return;
      islenmis[t] = 1;
      if (String(r[M_DURUM]).indexOf('açık') > -1) acikGun[t] = 1;    });
  }
  var bos = {};
  try {
    bos = JSON.parse(PropertiesService.getScriptProperties()
            .getProperty('MESAI_BOS_GUNLER') || '{}');
  } catch (e) { bos = {}; }

  var acikHesap = _acikHesapGunleri();
  var zorla = _kopruZorlaOku();

  var bugunTr = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy');
  var dunTr   = Utilities.formatDate(new Date(Date.now() - 86400000), TZ, 'dd.MM.yyyy');

  var once = [], eksik = [], tazele = [];
  _gunler(BASLANGIC, BITIS || _bugun()).reverse().forEach(function (x) {   // yeniden eskiye
    var t = _isoToTr(x);
    if (t === bugunTr || t === dunTr) { once.push(x); return; }   // her zaman tazele
    if (zorla[t]) { eksik.push(x); return; }                       // elle yeniden çekim istendi
    if (!islenmis[t] && !bos[t]) { eksik.push(x); return; }        // hiç çekilmemiş
    if (acikGun[t] || acikHesap[t]) tazele.push(x);                // vardiya / hesap açık
  });

  return { once: once, eksik: eksik, tazele: tazele };
}

// ---------- KULLANICIYA KODU GOSTER ----------
function kopruKodunuAl() {
  var url = KOPRU_URL;
  if (!url) { try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; } }
  var ui = SpreadsheetApp.getUi();

  if (!url) {
    ui.alert('Önce dağıtım gerekiyor',
      'Apps Script ekranında:\n\n' +
      '  Dağıt  >  Yeni dağıtım  >  dişli simgesi  >  Web uygulaması\n' +
      '  Yürüten      : Ben\n' +
      '  Erişimi olan : Herkes\n' +
      '  Dağıt  >  yetkileri onayla\n\n' +
      'Sonra bu menüyü tekrar aç.', ui.ButtonSet.OK);
    return;
  }

  var kod = _kopruIstemciKodu(url, _kopruAnahtar());
  var html = HtmlService.createHtmlOutput(
    '<div style="font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:4px">' +
    '<b>1)</b> Aşağıdaki kutuya tıkla, <b>Ctrl+A</b> sonra <b>Ctrl+C</b>.<br>' +
    '<b>2)</b> <a href="https://hemenyolda.com" target="_blank">hemenyolda.com</a> panelini aç ' +
    '(giriş yapmış olmalısın).<br>' +
    '<b>3)</b> <b>F12</b> &rarr; <b>Console</b> sekmesi &rarr; yapıştır &rarr; <b>Enter</b>.<br>' +
    '<div style="color:#b45309;margin:6px 0">Chrome ilk seferde yapıştırmaya izin vermeni ' +
    'isteyebilir: konsola <code>allow pasting</code> yazıp Enter\'a bas, sonra yapıştır.</div>' +
    '<textarea id="k" style="width:100%;height:300px;font:11px/1.35 Consolas,monospace;' +
    'border:1px solid #ccc;border-radius:6px;padding:8px" onclick="this.select()">' +
    kod.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
    '</textarea>' +
    '<button style="margin-top:8px;padding:8px 14px;font-size:13px;border-radius:6px;' +
    'border:0;background:#134f5c;color:#fff;cursor:pointer" ' +
    'onclick="var t=document.getElementById(\'k\');t.select();document.execCommand(\'copy\');' +
    'this.textContent=\'Kopyalandı\'">Kopyala</button>' +
    '</div>'
  ).setWidth(720).setHeight(470);
  ui.showModalDialog(html, 'Köprü Kodu  v' + KOPRU_SURUM);
}

/** Tarayicida calisacak kod. URL ve anahtar icine gomulu gelir. */
function _kopruIstemciKodu(url, anahtar) {
  var NL = String.fromCharCode(10);
  var L = [
"(async function(){",
"  var W = '" + url + "';",
"  var A = '" + anahtar + "';",
"  var B = 'https://hemenyolda.com/api/v2';",
"  var BEKLE = 1500;   // istekler arasi ms (1.2: 700 -> 1500, HemenYolda 403 veriyordu)",
"  var GUN_ARA = 10000; // gunler arasi ms",
"  var DENEME = 4;     // basarisiz istegi kac kez tekrar denesin",
"",
"  var kutu = document.getElementById('bapKopru');",
"  if (!kutu) {",
"    kutu = document.createElement('div');",
"    kutu.id = 'bapKopru';",
"    kutu.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;'+",
"      'background:#134f5c;color:#fff;font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;'+",
"      'padding:12px 16px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3);'+",
"      'max-width:340px;white-space:pre-wrap';",
"    document.body.appendChild(kutu);",
"  }",
"  var NLC = String.fromCharCode(10);",
"  var yaz = function(m){ kutu.textContent = 'BAP Kopru' + NLC + m; console.log('[BAP]', m); };",
"  var uyu = function(ms){ return new Promise(function(f){ setTimeout(f, ms); }); };",
"",
"  var tk = localStorage.getItem('token');",
"  if (!tk) { yaz('HATA: panelde oturum yok. Giris yapip tekrar dene.'); return; }",
"  var H = { Authorization: 'Bearer ' + tk, Accept: 'application/json' };",
"",
"  var iste = async function(u){",
"    for (var d = 0; d < DENEME; d++) {",
"      try {",
"        var r = await fetch(u, { headers: H });",
"        if (r.status === 200) {",
"          var t = await r.text();",
"          if (!t || !t.trim()) return { ok:true, j:null };",
"          try { return { ok:true, j:JSON.parse(t) }; } catch(e){ return { ok:true, j:null }; }",
"        }",
"        if (r.status === 401) return { ok:false, kod:401, dur:true };",
"        if (r.status === 403) return { ok:false, kod:403, dur:true };",
"        if (r.status === 429) {",
"          for (var b = 0; b < 5; b++) {",
"            yaz('Sunucu kisitladi (' + r.status + '). ' + ((b+1)*60) + '. sn bekleniyor...');",
"            await uyu(60000);",
"            try {",
"              var r2 = await fetch(u, { headers: H });",
"              if (r2.status === 200) {",
"                var t2 = await r2.text();",
"                if (!t2 || !t2.trim()) return { ok:true, j:null };",
"                try { return { ok:true, j:JSON.parse(t2) }; } catch(e2){ return { ok:true, j:null }; }",
"              }",
"            } catch(e3){}",
"          }",
"          return { ok:false, kod:r.status, dur:true };",
"        }",
"      } catch(e){}",
"      await uyu(600 * (d + 1));",
"    }",
"    return { ok:false, kod:0 };",
"  };",
"",
"  var yolla = async function(o){",
"    o.anahtar = A;",
"    var sonHata = '';",
"    for (var d = 0; d < 3; d++) {",
"      try {",
"        var r = await fetch(W, { method:'POST',",
"          headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(o) });",
"        var t = await r.text();",
"        try { return JSON.parse(t); }",
"        catch(e){ sonHata = 'Google yaniti bozuk (HTTP ' + r.status + ')'; }",
"      } catch(e){ sonHata = String(e); }",
"      yaz('kayit basarisiz, tekrar deneniyor (' + (d+1) + '/3)...');",
"      await uyu(4000 * (d + 1));",
"    }",
"    return { hata: sonHata };",
"  };",
"",
"  yaz('plan aliniyor...');",
"  var p = await fetch(W + '?anahtar=' + A + '&adim=plan&enfazla=7')",
"          .then(function(r){ return r.json(); })",
"          .catch(function(e){ return {hata:String(e)}; });",
"  if (!p || p.hata) { yaz('HATA: ' + ((p&&p.hata)||'web uygulamasina ulasilamadi')); return; }",
"",
"  var kur = p.kuryeler;",
"  if (!kur) {",
"    yaz('kurye listesi cekiliyor...');",
"    var a = await iste(B + '/manager/agents');",
"    if (!a.ok || !a.j || !a.j.length) { yaz('HATA: kurye listesi alinamadi.'); return; }",
"    kur = a.j.map(function(x){ return { id:x.id, ad:x.fullName }; });",
"    var c = await yolla({ tur:'kuryeler', kuryeler:kur });",
"    if (c.hata) { yaz('HATA: ' + c.hata); return; }",
"  }",
"",
"  var g = p.gunler || [];",
"  if (!g.length) { yaz('Eksik gun yok. Tablo guncel.'); return; }",
"  var trG = function(x){ return x.slice(8,10) + '.' + x.slice(5,7); };",
"  yaz('Bu tur ' + g.length + ' gun: ' + g.map(trG).join(', ') + NLC + 'kurye sayisi: ' + kur.length);",
"  await uyu(2500);",
"",
"  var tm = 0, ts = 0, eksikGun = [];",
"  for (var i = 0; i < g.length; i++) {",
"    var gun = g[i], sd = gun + 'T12:00:00.000Z', paket = [], hataliKurye = 0;",
"    var sipVar = (p.sipHazir || []).indexOf(gun) > -1;",
"    if (i) await uyu(GUN_ARA);",
"",
"    for (var q = 0; q < kur.length; q++) {",
"      var k = kur[q], u = B + '/manager/agent/' + k.id;",
"      yaz('gun ' + (i+1) + '/' + g.length + '  ' + gun + NLC +",
"          'kurye ' + (q+1) + '/' + kur.length + '  ' + k.ad +",
"          (sipVar ? NLC + '(siparisler tabloda, atlaniyor)' : ''));",
"",
"      var w = await iste(u + '/working-hours-by-date?searchDate=' + sd);",
"      await uyu(BEKLE);",
"      var sf = await iste(u + '/shifts?searchDate=' + sd);",
"      await uyu(BEKLE);",
"      var od = null;",
"      if (!sipVar) {",
"        od = await iste(u + '/orders-by-date?searchDate=' + sd);",
"        await uyu(BEKLE);",
"      }",
"",
"      if (w.dur || sf.dur || (od && od.dur)) {",
"        yaz('DURDU (' + (w.kod||sf.kod||(od&&od.kod)) + '). HemenYolda istekleri reddediyor.' + NLC +",
"            'Buraya kadar cekilenler tabloya yazildi.' + NLC +",
"            'Sayfayi yenile, EN AZ 30 dk bekle, sonra kodu tekrar calistir.' + NLC +",
"            'Servis saatinde calistirma (panel de etkilenir).'); return;",
"      }",
"      if (!sf.ok || !w.ok) hataliKurye++;",
"",
"      var kayit = { ad:k.ad, sOk: sf.ok, pOk: w.ok,",
"        plan: (w.j && w.j.data) || null,",
"        shifts: (sf.j && sf.j.data) || [] };",
"      if (od) kayit.siparisler = Array.isArray(od.j) ? od.j : ((od.j && od.j.data) || []);",
"      paket.push(kayit);",
"    }",
"",
"    var s = await yolla({ tur:'gun', gun:gun, kuryeler:paket });",
"    if (s.hata) { yaz('HATA (' + gun + '): ' + s.hata); return; }",
"    tm += (s.mesaiYeni||0) + (s.mesaiGuncel||0);",
"    ts += (s.sipYeni||0) + (s.sipGuncel||0);",
"    if (hataliKurye) eksikGun.push(gun + ' (' + hataliKurye + ' kurye)');",
"  }",
"",
"  yaz('tablolar yenileniyor (acik hesaplar + gunluk mesai)...');",
"  var bt = await yolla({ tur:'bitir' });",
"",
"  var son = (p.kalanEksik > 0)",
"    ? 'DAHA BITMEDI: ' + p.kalanEksik + ' eksik/isaretli gun kaldi.' + NLC + 'Kodu tekrar calistir.'",
"    : 'EKSIK GUN KALMADI. Isaretli gunlerin hepsi islendi.';",
"  yaz('BITTI.' + NLC + son + NLC + NLC + 'Islenen: ' + g.map(trG).join(', ') + NLC + tm + ' mesai satiri' + NLC +",
"      ts + ' siparis satiri' +",
"      (eksikGun.length ? NLC + NLC + 'Eksik kalan: ' + eksikGun.join(', ') +",
"       NLC + 'Kodu bir kez daha calistir.' : '') +",
"      NLC + NLC + (bt && bt.ok",
"        ? 'Acik Hesaplar ve Gunluk Mesai yenilendi.' + NLC +",
"          'Bordro icin: Kurye Sistemi > VERIYI CEK ve TUMUNU YENILE'",
"        : 'UYARI: tablolar yenilenemedi.' + NLC +",
"          'Kurye Sistemi > VERIYI CEK ve TUMUNU YENILE calistir.'));",
"})();"
  ];
  return L.join(NL);
}

/**
 * ONARIM: "kimse giris yapmamis ama paket var" gunlerini siler.
 */
function mesaiBozukGunleriSil() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(SHEET_MESAI);
  if (!sh || sh.getLastRow() < 2) { Logger.log('Mesai (Ham) boş.'); return; }

  var n = sh.getLastRow() - 1;
  var v = sh.getRange(2, 1, n, MESAI_NCOL).getDisplayValues();

  var gun = {};
  v.forEach(function (r, i) {
    var t = String(r[0]).trim();
    if (!t) return;
    if (!gun[t]) gun[t] = { satir: [], bozuk: 0 };
    var g = gun[t];
    g.satir.push(i + 2);
    var pk = parseInt(String(r[13]).replace(/[^0-9]/g, ''), 10);
    if (!String(r[4]).trim() && !isNaN(pk) && pk > 0) g.bozuk++;
  });

  var bas = BASLANGIC.split('-');
  var basSayi = bas[0] + bas[1] + bas[2];

  var silinecek = [], gunler = [];
  Object.keys(gun).forEach(function (t) {
    var g = gun[t];
    if (!g.bozuk) return;
    var sayi = t.slice(6) + t.slice(3, 5) + t.slice(0, 2);
    if (sayi < basSayi) return;
    gunler.push(t);
    silinecek = silinecek.concat(g.satir);
  });

  if (!silinecek.length) {
    Logger.log('Bozuk gün bulunamadı.');
    try { SpreadsheetApp.getUi().alert('Bozuk gün bulunamadı — temiz.'); } catch (e) {}
    return;
  }

  silinecek.sort(function (a, b) { return b - a; });
  silinecek.forEach(function (r) { sh.deleteRow(r); });

  var props = PropertiesService.getScriptProperties();
  var bos = {};
  try { bos = JSON.parse(props.getProperty('MESAI_BOS_GUNLER') || '{}'); } catch (e) { bos = {}; }
  gunler.forEach(function (t) { delete bos[t]; });
  props.setProperty('MESAI_BOS_GUNLER', JSON.stringify(bos));

  gunler.sort(function (a, b) {
    return (a.slice(6) + a.slice(3, 5) + a.slice(0, 2)) >
           (b.slice(6) + b.slice(3, 5) + b.slice(0, 2)) ? 1 : -1;
  });

  var m = silinecek.length + ' bozuk satır silindi.' + String.fromCharCode(10) +
          gunler.length + ' gün yeniden çekilecek:' + String.fromCharCode(10) +
          gunler.join(', ') + String.fromCharCode(10) + String.fromCharCode(10) +
          'Şimdi köprü kodunu panelde tekrar çalıştır.';
  Logger.log(m);
  try { SpreadsheetApp.getUi().alert('Onarım tamam', m, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
}

/**
 * Belirtilen gunlerin mesai satirlarini siler ve bos isaretini kaldirir.
 * Kullanim: mesaiGunSil(['01.09.2026', '02.09.2026'])
 */
function mesaiGunSil(tarihler) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(SHEET_MESAI);
  if (!sh || sh.getLastRow() < 2) { Logger.log('Mesai (Ham) boş.'); return; }

  var hedef = {};
  tarihler.forEach(function (t) { hedef[t] = 1; });

  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues();
  var sil = [];
  v.forEach(function (r, i) { if (hedef[String(r[0]).trim()]) sil.push(i + 2); });

  sil.sort(function (a, b) { return b - a; });
  sil.forEach(function (r) { sh.deleteRow(r); });

  var props = PropertiesService.getScriptProperties();
  var bos = {};
  try { bos = JSON.parse(props.getProperty('MESAI_BOS_GUNLER') || '{}'); } catch (e) { bos = {}; }
  tarihler.forEach(function (t) { delete bos[t]; });
  props.setProperty('MESAI_BOS_GUNLER', JSON.stringify(bos));

  Logger.log(sil.length + ' satır silindi: ' + tarihler.join(', '));
}

/** Kopru durumu (menuden). */
function kopruDurum() {
  var p = PropertiesService.getScriptProperties();
  var son = p.getProperty('KOPRU_SON');
  var url = KOPRU_URL;
  if (!url) { try { url = ScriptApp.getService().getUrl() || '(dağıtım yok)'; } catch (e) { url = '(dağıtım yok)'; } }
  var eksik = _eksikGunler(400);
  var acik = Object.keys(_acikHesapGunleri()).length;
  var zorla = Object.keys(_kopruZorlaOku());
  var kayitli = '?';
  try { kayitli = JSON.parse(p.getProperty('HY_KURYELER') || '[]').map(function (k) { return k.ad; }).join(', ') || 'yok'; } catch (e) {}
  var m = 'Sürüm          : ' + KOPRU_SURUM + '\n' +
          'Web uygulaması : ' + url + '\n' +
          'Son veri alımı : ' + (son ? Utilities.formatDate(new Date(son), TZ, 'dd.MM.yyyy HH:mm') : 'hiç') + '\n' +
          'Kuyruk         : ' + eksik.length + ' gün' + (eksik.length ? '  (ilk sırada ' + eksik[0] + ')' : '') + '\n' +
          'Yeniden çekilecek: ' + zorla.length + ' gün' + (zorla.length ? '  (' + zorla.slice(0, 5).join(', ') + (zorla.length > 5 ? ', …' : '') + ')' : '') + '\n' +
          'Kayıtlı kurye  : ' + kayitli + '\n' +
          'Açık hesap günü: ' + acik;
  Logger.log(m);
  try { SpreadsheetApp.getUi().alert('Köprü Durumu', m, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return m;
}
