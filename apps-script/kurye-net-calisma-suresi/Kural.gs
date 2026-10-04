/**
 * ============================================================
 *  BAP - KESINTI KURALI KATMANI  (2. katman)   sürüm 2.2
 * ------------------------------------------------------------
 *  Okur : "Mesai (Ham)"     (ham veri)
 *         "Siparişler"      (gecikme analizi icin)
 *         "Mesai Düzeltme"  (2.1: isletme sahibinin elle duzeltmeleri)
 *  Yazar: "Günlük Mesai"          -> bordro script'inin KAYNAK sekmesi
 *         "Teslimat Gecikmeleri"  -> gerekcesiyle yavas teslimat dokumu
 *
 *  ------------------------------------------------------------
 *  2.2 (05.10.2026): "Kesinti İstisnaları" sekmesi ve okuması kaldırıldı. Ona yazan
 *  tek düğme eski kurye takip sayfasındaydı ve çalışmıyordu; sekmede elle yazılmış
 *  tek bir not vardı. Bir günün kesintisini değiştirmek için "Mesai Düzeltme"
 *  (panel) kullanılır.
 *
 *  ------------------------------------------------------------
 *  2.1 DEĞİŞİKLİKLERİ
 *
 *  1) MESAİ DÜZELTME: "Mesai Düzeltme" sekmesindeki satır (panelden
 *     yazılır) o günün hesabını ezer. Esas giriş / esas çıkış verilen
 *     tarafta kesinti, o saatten önce / sonra FİİLEN ÇEVRİMİÇİ geçen
 *     süredir (kapanış kuralıyla aynı mantık). Yöntem "Olduğu gibi"
 *     ise hesap değişmez, gün onaylandı diye işaretlenir. Gerekçede
 *     kimin, neye göre düzelttiği ve otomatik hesabın ne olduğu yazar.
 *
 *  2) KAPANIŞ — son paketin "Restorandan Çıktı" saati boşsa (ya da km
 *     yoksa) makul çıkış hesaplanamıyor, kurye panelden çıkana kadar
 *     tam ödeniyordu (cemil 01.10: son teslim 22:19, çıkış 23:12, 0 dk).
 *     Artık son teslim saati esas alınır.
 *
 *  3) ERKEN GİRİŞ — kesinti "baz − giriş" olarak hesaplanıyordu; kurye
 *     erken açıp kapatıp sonra geri geldiyse aradaki ÇEVRİMDIŞI süre de
 *     kesiliyordu (2.0'da kapanışta düzeltilen hatanın aynısı). Artık
 *     baz girişten önce fiilen çevrimiçi geçen süre kesilir.
 *
 *
 *  ------------------------------------------------------------
 *  2.0 DEĞİŞİKLİĞİ — KAPANIŞ KESİNTİSİ DÜZELTİLDİ
 *
 *  ESKİ (hatalı): kesinti = panelden çıkış saati − makul çıkış
 *  Bu, kuryenin ÇEVRİMDIŞI geçirdiği araları da kesinti sayıyordu.
 *  Örnek: Emin 28.08.2026 — 02:00'de çıkmış, 04:32'de 6 dakikalığına
 *  tekrar açılmış. Ham süre o 2,5 saati zaten saymıyordu (ödenmemişti),
 *  ama kural 04:38'i çıkış sanıp 163 dk kesti. Ödenmemiş zaman ikinci
 *  kez ceza olarak düşüldü — kuryeye ~620 TL eksik ödendi.
 *
 *  YENİ (doğru): kesinti = makul çıkıştan SONRA fiilen çevrimiçi
 *  geçen dakika. Çevrimdışı aralar hesaba girmez; kesinti hiçbir zaman
 *  ödenen süreyi aşamaz. Aynı örnekte kesinti 163 dk yerine 11 dk.
 *
 *  Bunun için "Mesai (Ham)" sekmesine "Oturumlar" sütunu eklendi
 *  (11:00-17:51|17:51-20:02|... biçiminde). O sütunu olmayan ESKİ
 *  satırlarda eski formül KAPANIS_TAVAN ile sınırlanır ve gerekçede
 *  "elle doğrulanmalı" diye işaretlenir.
 *
 *  DENETİM: kapanisDenetimi() — düzeltmeden önce çalıştır. Eski ve yeni
 *  kesintileri karşılaştırıp kime ne kadar eksik ödendiğini yazar.
 * ============================================================
 */

// ---------- AYARLAR ----------
var K_SS_ID    = '1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo';
var K_HAM      = 'Mesai (Ham)';
var K_SIPARIS  = 'Siparişler';
var K_HEDEF    = 'Günlük Mesai';
var K_GECIKME  = 'Teslimat Gecikmeleri';
var K_DUZELTME = 'Mesai Düzeltme';
var K_DENETIM  = 'Kapanış Denetimi';
var K_TZ       = 'Europe/Istanbul';

var DUZELTME_BASLIK = ['Tarih', 'Kurye', 'Esas Giriş', 'Esas Çıkış', 'Yöntem',
                       'Açıklama', 'Giren', 'Kayıt Zamanı'];

// Beklenen yol suresi (restorandan cikis -> teslim), dakika:
//     beklenen = BEK_SABIT + BEK_DK_KM * km
var BEK_SABIT   = 5;
var BEK_DK_KM   = 2.5;

// Gecikme dokumune girme esigi: fiili > beklenen + bu kadar dakika
var GECIKME_TOLERANS = 10;

// Planli bitisi bu kadar dakikadan fazla asmayan cikista kapanis kesintisi yok
var KAPANIS_ESIK = 3;

// Bu dakikadan fazla gec giris "Geç giriş" olarak isaretlenir (saat kesilmez)
var GEC_GIRIS_ESIK = 5;

/**
 * KAPANIŞ TAVANI — iki işi var:
 *  1) Oturum detayı OLMAYAN eski satırlarda kesintiyi bu değerle sınırlar
 *     (fazla kesmektense az kesmek; hata payını kuryenin lehine bırakır).
 *  2) Oturum detayı OLAN satırlarda kesmez, ama bu değeri aşan kesintiyi
 *     Durum sütununda "kontrol et" diye işaretler.
 * Bir kuryenin makul çıkıştan sonra 45 dakikadan fazla gerçekten çevrimiçi
 * kalması olağandışıdır; genelde veri sorununa işaret eder.
 */
var KAPANIS_TAVAN = 45;

// Plansiz kuryede (Salim gibi) erken giris kesintisi uygulansin mi?
var PLANSIZ_ERKEN_KESINTI = false;

var HEDEF_BASLIK = ['Tarih', 'Kurye', 'Planlı Giriş', 'Giriş', 'İlk Paket', 'Baz Giriş',
                    'Erken Kesinti (dk)', 'Planlı Çıkış', 'Çıkış', 'Son Sipariş',
                    'Makul Çıkış', 'Kapanış Kesintisi (dk)', 'Ham Süre', 'Net Süre',
                    'Paket', 'Geç Giriş (dk)', 'Durum', 'Kesinti Gerekçesi'];

/* ==================== ANA FONKSIYON ==================== */
function kuraliUygula(gecikmeDe) {
  var ss = SpreadsheetApp.openById(K_SS_ID);
  var ham = ss.getSheetByName(K_HAM);
  if (!ham) throw new Error('"' + K_HAM + '" sekmesi yok. Önce mesaiCek() çalıştır.');
  if (ham.getLastRow() < 2) throw new Error('"' + K_HAM + '" boş.');

  var v = ham.getDataRange().getDisplayValues();
  var ix = _ixHam(v[0]);
  var duzeltme = _duzeltmeOku(ss);

  var satirlar = [];
  for (var r = 1; r < v.length; r++) {
    var k = String(v[r][ix.tarih] || '').trim() + '|' + String(v[r][ix.kurye] || '').trim();
    var s = _kuralUygulaSatir(v[r], ix, duzeltme[k]);
    if (!s) continue;
    satirlar.push(s);
  }

  satirlar.sort(function (a, b) {
    var d = _dt(a[0]) - _dt(b[0]);
    return d || String(a[1]).localeCompare(String(b[1]), 'tr');
  });

  var sh = ss.getSheetByName(K_HEDEF) || ss.insertSheet(K_HEDEF);
  sh.clear();
  [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14].forEach(function (c) {
    sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@');
  });
  sh.getRange(1, 1, 1, HEDEF_BASLIK.length).setValues([HEDEF_BASLIK])
    .setBackground('#134f5c').setFontColor('#ffffff').setFontWeight('bold');
  sh.setFrozenRows(1);
  if (satirlar.length) {
    sh.getRange(2, 1, satirlar.length, HEDEF_BASLIK.length).setValues(satirlar);
    sh.getRange(2, 18, satirlar.length, 1).setWrap(true);
    sh.setColumnWidth(18, 420);
  }
  sh.autoResizeColumns(1, 17);

  var gec = (gecikmeDe === false) ? '-' : gecikmeDokumu();
  Logger.log(satirlar.length + ' gün-kurye satırı yazıldı. Gecikme kaydı: ' + gec);
}

/* ==================== KAPANIŞ DENETİMİ ====================
 * DÜZELTMEDEN ÖNCE çalıştır. "Günlük Mesai"deki mevcut (eski) kesintilerle
 * yeni kuralın ürettiği kesintileri karşılaştırır, farkı TL'ye çevirir.
 * kuraliUygula() çalıştıktan sonra eski değerler kaybolur — önce bunu çalıştır.
 */
/**
 * ÖNCE BUNU ÇALIŞTIR. "Günlük Mesai"nin o anki (eski kurala göre hesaplanmış)
 * hâlini "Günlük Mesai (eski)" diye dondurur. Toplayıcı arka planda
 * kuraliUygula() çağırıp üzerine yazsa bile karşılaştırma kaybolmaz.
 */
function denetimSnapshot() {
  var ss = SpreadsheetApp.openById(K_SS_ID);
  var gm = ss.getSheetByName(K_HEDEF);
  if (!gm || gm.getLastRow() < 2) throw new Error('"' + K_HEDEF + '" boş.');
  var ad = K_HEDEF + ' (eski)';
  var eski = ss.getSheetByName(ad);
  if (eski) ss.deleteSheet(eski);
  gm.copyTo(ss).setName(ad);
  Logger.log('"' + ad + '" oluşturuldu — ' + (gm.getLastRow() - 1) + ' satır donduruldu.');
}

function kapanisDenetimi() {
  var ss = SpreadsheetApp.openById(K_SS_ID);
  // Varsa dondurulmuş kopyayı kullan; yoksa canlı sekmeyi
  var gm = ss.getSheetByName(K_HEDEF + ' (eski)') || ss.getSheetByName(K_HEDEF);
  if (!gm || gm.getLastRow() < 2) {
    throw new Error('Karşılaştıracak eski değer yok. Önce denetimSnapshot() çalıştır.');
  }

  // --- eski değerler (henüz yeniden hesaplanmadan) ---
  var eski = {};
  gm.getRange(2, 1, gm.getLastRow() - 1, HEDEF_BASLIK.length).getDisplayValues()
    .forEach(function (r) {
      eski[String(r[0]).trim() + '|' + String(r[1]).trim()] = _sayi(r[11]) || 0;
    });

  // --- yeni değerler ---
  var ham = ss.getSheetByName(K_HAM);
  var v = ham.getDataRange().getDisplayValues();
  var ix = _ixHam(v[0]);

  var satirlar = [], kurye = {};
  for (var r2 = 1; r2 < v.length; r2++) {
    var s = _kuralUygulaSatir(v[r2], ix);
    if (!s) continue;
    var k = s[0] + '|' + s[1];
    if (eski[k] === undefined) continue;
    var yeni = _sayi(s[11]) || 0;
    var fark = eski[k] - yeni;
    if (fark < 5) continue;                       // 5 dk altı farkı önemseme

    satirlar.push([s[0], s[1], eski[k], yeni, fark, s[17]]);
    if (!kurye[s[1]]) kurye[s[1]] = { gun: 0, dk: 0 };
    kurye[s[1]].gun++; kurye[s[1]].dk += fark;
  }

  var sh = ss.getSheetByName(K_DENETIM) || ss.insertSheet(K_DENETIM);
  sh.clear();
  sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@');

  var bas = ['Tarih', 'Kurye', 'Eski Kesinti (dk)', 'Yeni Kesinti (dk)',
             'Fazla Kesilen (dk)', 'Yeni Gerekçe'];
  sh.getRange(1, 1, 1, bas.length).setValues([bas])
    .setBackground('#990000').setFontColor('#ffffff').setFontWeight('bold');
  sh.setFrozenRows(1);

  if (!satirlar.length) {
    sh.getRange(2, 1).setValue('Fazla kesilmiş gün bulunamadı ✅');
    Logger.log('Denetim: fark yok.');
    return 0;
  }

  satirlar.sort(function (a, b) { return b[4] - a[4]; });
  sh.getRange(2, 1, satirlar.length, bas.length).setValues(satirlar);
  sh.getRange(2, 6, satirlar.length, 1).setWrap(true);
  sh.setColumnWidth(6, 480);

  // --- kurye bazında TL karşılığı ---
  var tarife;
  try { tarife = tarifeOku(); } catch (e) { tarife = null; }

  var r0 = satirlar.length + 3;
  sh.getRange(r0, 1).setValue('KURYE BAZINDA EKSİK ÖDEME')
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#990000');
  sh.getRange(r0, 1, 1, 6).merge();
  sh.getRange(r0 + 1, 1, 1, 6)
    .setValues([['Kurye', 'Gün', 'Fazla Kesilen (dk)', 'Saat Ücreti',
                 'Eksik Ödeme (KDV hariç)', 'KDV dahil']])
    .setBackground('#cc4125').setFontColor('#ffffff').setFontWeight('bold');

  var ozet = Object.keys(kurye).map(function (ad) {
    var t = kurye[ad];
    var tf = tarife ? kuryeTarife(ad, tarife)
                    : { saatUcret: 235, bordro: 'Haddy Kurye' };
    var haric = t.dk / 60 * tf.saatUcret;
    var dahil = tf.bordro === 'BAP' ? haric : haric * 1.20;
    return [ad, t.gun, t.dk, tf.saatUcret, Math.round(haric * 100) / 100,
            Math.round(dahil * 100) / 100];
  }).sort(function (a, b) { return b[2] - a[2]; });

  sh.getRange(r0 + 2, 1, ozet.length, 6).setValues(ozet);
  sh.getRange(r0 + 2, 5, ozet.length, 2).setNumberFormat('#,##0.00');

  var toplam = ozet.reduce(function (a, x) { return a + x[5]; }, 0);
  sh.getRange(r0 + 2 + ozet.length, 1, 1, 6)
    .setValues([['TOPLAM', '', '', '', '', Math.round(toplam * 100) / 100]])
    .setBackground('#ffe599').setFontWeight('bold')
    .setNumberFormat('@');
  sh.getRange(r0 + 2 + ozet.length, 6).setNumberFormat('#,##0.00');

  sh.autoResizeColumns(1, 5);
  Logger.log('Denetim: ' + satirlar.length + ' gün, toplam ' +
             Math.round(toplam) + ' TL eksik ödeme.');
  return satirlar.length;
}

/* ==================== MESAİ DÜZELTME (2.1) ==================== */
/** "Mesai Düzeltme" sekmesi: Tarih|Kurye -> son girilen düzeltme. */
function _duzeltmeOku(ss) {
  var sh = ss.getSheetByName(K_DUZELTME);
  if (!sh || sh.getLastRow() < 2) return {};
  var gen = Math.max(DUZELTME_BASLIK.length, sh.getLastColumn());
  var bas = sh.getRange(1, 1, 1, gen).getDisplayValues()[0].map(_kn);
  var c = function (ad) { var i = bas.indexOf(_kn(ad)); return i; };
  var ix = { tarih: c('Tarih'), kurye: c('Kurye'), giris: c('Esas Giriş'), cikis: c('Esas Çıkış'),
             yontem: c('Yöntem'), not: c('Açıklama'), giren: c('Giren'), zaman: c('Kayıt Zamanı') };
  if (ix.tarih < 0 || ix.kurye < 0) return {};
  var m = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, gen).getDisplayValues().forEach(function (r) {
    var t = String(r[ix.tarih] || '').trim(), k = String(r[ix.kurye] || '').trim();
    if (!t || !k) return;
    var al = function (i) { return i >= 0 ? String(r[i] || '').trim() : ''; };
    m[t + '|' + k] = { giris: _dk(al(ix.giris)), cikis: _dk(al(ix.cikis)), yontem: al(ix.yontem),
                       not: al(ix.not), giren: al(ix.giren), zaman: al(ix.zaman) };   // sonraki satır öncekini ezer
  });
  return m;
}

/** Bir saatten ÖNCE fiilen çevrimiçi geçen dakika (çevrimdışı aralar sayılmaz). */
function _oncekiOnline(oturumlar, sinir) {
  var t = 0, parca = [];
  oturumlar.forEach(function (o) {
    var bit = Math.min(o[1], sinir);
    if (bit > o[0]) {
      t += bit - o[0];
      parca.push(_hm(o[0]) + '-' + _hm(bit));
    }
  });
  return { dk: Math.round(t), parca: parca.join(', ') || '—' };
}

/* ==================== SATIR KURALI ==================== */
function _kuralUygulaSatir(row, ix, duz) {
  var tarih = String(row[ix.tarih] || '').trim();
  var kurye = String(row[ix.kurye] || '').trim();
  if (!tarih || !kurye) return null;

  var plGiris = _dk(row[ix.plGiris]);
  var plCikis = _dk(row[ix.plCikis]);
  var giris   = _dk(row[ix.giris]);
  var cikis   = _dk(row[ix.cikis]);
  var ilk     = _dk(row[ix.ilkPaket]);
  var sonCik  = _dk(row[ix.sonCikis]);
  var sonTes  = _dk(row[ix.sonSiparis]);
  var km      = _sayi(row[ix.km]);
  var hamDk   = _sayi(row[ix.hamDk]);
  var paket   = _sayi(row[ix.paket]);
  var durum   = String(row[ix.durum] || '').trim();

  if (giris === null) return null;

  // ---------- GECE YARISI AŞIMI ----------
  var ileri = function (t) { return (t !== null && t < giris) ? t + 1440 : t; };
  ilk    = ileri(ilk);
  sonCik = ileri(sonCik);
  sonTes = ileri(sonTes);
  cikis  = ileri(cikis);
  if (plCikis !== null) {
    var anchor = (plGiris !== null ? plGiris : giris);
    if (plCikis < anchor) plCikis += 1440;
  }

  // Oturum listesi (varsa). Giriş ile aynı zaman ekseninde döner.
  var oturum = (ix.oturumlar >= 0) ? _oturumlar(row[ix.oturumlar]) : [];

  if (durum.indexOf('açık') > -1) {
    return [tarih, kurye, _hm(plGiris), _hm(giris), _hm(ilk), '', '', _hm(plCikis), '',
            _hm(sonTes), '', '', '', '', paket, '', 'Vardiya açık', ''];
  }

  var gerekce = [];

  // ---------- 1) ERKEN GIRIS ----------
  var baz;
  if (plGiris !== null) {
    baz = (ilk === null) ? plGiris : Math.min(ilk, plGiris);
  } else if (PLANSIZ_ERKEN_KESINTI && ilk !== null) {
    baz = ilk;
  } else {
    baz = giris;
  }
  if (baz < giris) baz = giris;

  // 2.1: baz girişten önce fiilen ÇEVRİMİÇİ geçen süre (çevrimdışı aralar kesilmez).
  var erken = oturum.length ? _oncekiOnline(oturum, baz).dk : Math.max(0, baz - giris);
  if (erken > 0) {
    gerekce.push('Erken giriş: vardiya ' + (plGiris !== null ? _hm(plGiris) : 'tanımsız') +
                 ', giriş ' + _hm(giris) +
                 (ilk !== null ? ', ilk paket ' + _hm(ilk) : ', o gün hiç paket almadı') +
                 ' → sayılan giriş ' + _hm(baz) + ', ' + erken + ' dk ödenmedi.');
  }

  // ---------- 2) GEC GIRIS (bilgi, saat kesilmez) ----------
  var gec = (plGiris !== null && giris > plGiris) ? (giris - plGiris) : 0;
  if (gec > GEC_GIRIS_ESIK) {
    gerekce.push('Geç giriş: planlı ' + _hm(plGiris) + ', giriş ' + _hm(giris) +
                 ' → ' + gec + ' dk geç (saat kesilmedi, ceza kararı senin).');
  }

  // ---------- 3) KAPANIS ----------
  // Makul çıkış: son siparişin restorandan çıkışı + o mesafe için beklenen yol.
  // Kesinti: makul çıkıştan SONRA fiilen ÇEVRİMİÇİ geçen süre.
  // Çevrimdışı aralar ham süreye girmiyor; onları kesmek çifte cezalandırmadır.
  var kapanis = 0, makul = null, kapNot = '', kapParca = '', kapKaynak = '';

  if (cikis !== null) {
    if (plCikis !== null && cikis <= plCikis + KAPANIS_ESIK) {
      makul = cikis;                                     // zamanında çıkmış
    } else if (sonCik !== null && km !== null) {
      makul = sonCik + Math.round(BEK_SABIT + BEK_DK_KM * km);
      kapKaynak = 'yol';
      if (plCikis !== null && makul < plCikis) makul = plCikis;
    } else if (sonTes !== null) {
      // 2.1: restorandan çıkış saati / km yok -> son teslim esas alınır.
      makul = sonTes;
      kapKaynak = 'teslim';
      if (plCikis !== null && makul < plCikis) makul = plCikis;
    } else if (plCikis !== null) {
      makul = plCikis;                                   // o gün hiç sipariş yok
    } else {
      makul = cikis;                                     // plan da sipariş de yok
    }

    if (makul !== null && cikis > makul) {
      if (oturum.length) {
        var d = _sonrakiOnline(oturum, makul);
        kapanis = d.dk;
        kapParca = d.parca;
      } else {
        // Oturum detayı yok (eski satır): eski formül ama tavanla sınırlı.
        kapanis = Math.min(Math.max(0, cikis - makul), KAPANIS_TAVAN);
        kapNot = 'detaysiz';
      }
    }
  }

  if (kapanis > 0) {
    var g = 'Kapanış: ';
    if (kapKaynak === 'yol') {
      g += 'son sipariş ' + _hm(sonCik) + ' restorandan çıktı, ' + km +
           ' km için beklenen yol ' + Math.round(BEK_SABIT + BEK_DK_KM * km) +
           ' dk → makul çıkış ' + _hm(makul);
    } else if (kapKaynak === 'teslim') {
      g += 'son paketin restorandan çıkış saati yok; son teslim ' + _hm(sonTes) +
           ' esas alındı → makul çıkış ' + _hm(makul);
    } else {
      g += 'makul çıkış ' + _hm(makul) + ' (o gün sipariş yok)';
    }
    if (kapNot === 'detaysiz') {
      g += '; panelden çıkış ' + _hm(cikis) + ' → ' + kapanis + ' dk ödenmedi. ' +
           'DİKKAT: bu günün oturum detayı yok, kesinti ' + KAPANIS_TAVAN +
           ' dk üst sınırıyla hesaplandı — elle doğrulanmalı.';
    } else {
      g += '; makul çıkıştan sonra fiilen çevrimiçi kalınan süre: ' + kapParca +
           ' = ' + kapanis + ' dk ödenmedi. ' +
           'Çevrimdışı geçen aralar ham süreye girmediği için kesilmedi.';
    }
    gerekce.push(g);
  }

  var net = Math.max(0, hamDk - erken - kapanis);

  var durumMetin = (erken || kapanis)
    ? (kapanis > KAPANIS_TAVAN ? 'Kesintili · kontrol et' : 'Kesintili')
    : (durum || 'Tamam');

  var s = [
    tarih, kurye,
    _hm(plGiris), _hm(giris), _hm(ilk), _hm(baz), erken || '',
    _hm(plCikis), _hm(cikis), _hm(sonTes), _hm(makul), kapanis || '',
    _sure(hamDk), (hamDk ? (_sure(net) || '0:00') : ''),
    paket,
    gec > GEC_GIRIS_ESIK ? gec : '',
    durumMetin,
    gerekce.join('  ||  ')
  ];
  return duz ? _duzeltmeUygula(s, duz, { giris: giris, cikis: cikis, hamDk: hamDk, oturum: oturum }) : s;
}

/**
 * 2.1: Elle düzeltmeyi satıra uygular. Verilen tarafta (giriş / çıkış) otomatik
 * kesintinin yerine "o saatten önce / sonra fiilen çevrimiçi geçen süre" konur;
 * verilmeyen taraf otomatik hesapta kalır. Otomatik hesap gerekçede saklanır.
 */
function _duzeltmeUygula(s, duz, x) {
  var kim = [duz.giren, duz.zaman].filter(String).join(', ');
  var notu = duz.not ? ' Not: ' + duz.not : '';
  var otoNet = s[13], otoGer = s[17] || 'kesinti yok';

  if (/olduğu gibi|oldugu gibi|onay/i.test(duz.yontem) || (duz.giris === null && duz.cikis === null)) {
    s[16] = (s[16] || 'Tamam') + ' · onaylı';
    s[17] = 'ONAYLANDI — otomatik hesap olduğu gibi bırakıldı' + (kim ? ' (' + kim + ')' : '') + '.' + notu +
            (s[17] ? '  ||  ' + s[17] : '');
    return s;
  }

  var ileri = function (t) { return (t !== null && x.giris !== null && t < x.giris - 360) ? t + 1440 : t; };
  var eG = ileri(duz.giris), eC = ileri(duz.cikis);
  if (eC !== null && x.cikis !== null && eC > x.cikis) eC = x.cikis;   // panelden çıkıştan sonrası zaten ödenmiyor
  var parcalar = [];
  var online = function (fn, sinir, yedek) { return x.oturum.length ? fn(x.oturum, sinir) : { dk: Math.max(0, yedek), parca: '' }; };

  var erken = _sayi(s[6]) || 0, kapanis = _sayi(s[11]) || 0;
  if (eG !== null) {
    var e = online(_oncekiOnline, eG, eG - x.giris);
    erken = e.dk;
    s[5] = _hm(eG);
    parcalar.push('giriş ' + _hm(eG) + ' alındı → öncesi ' + (e.parca ? e.parca + ' = ' : '') + erken + ' dk ödenmedi');
  }
  if (eC !== null) {
    var k = online(_sonrakiOnline, eC, (x.cikis || eC) - eC);
    kapanis = k.dk;
    s[10] = _hm(eC);
    parcalar.push('çıkış ' + _hm(eC) + ' alındı → sonrası ' + (k.parca ? k.parca + ' = ' : '') + kapanis + ' dk ödenmedi');
  }
  var net = Math.max(0, (x.hamDk || 0) - erken - kapanis);
  s[6] = erken || '';
  s[11] = kapanis || '';
  s[13] = x.hamDk ? (_sure(net) || '0:00') : '';
  s[16] = 'Düzeltildi';
  s[17] = 'ELLE DÜZELTME (' + (duz.yontem || 'saat') + (kim ? '; ' + kim : '') + '): ' + parcalar.join('; ') +
          '. Net ' + (otoNet || '—') + ' → ' + (s[13] || '—') + '.' + notu +
          '  ||  Otomatik hesap (uygulanmadı): ' + otoGer;
  return s;
}

/* ==================== OTURUM HESABI ==================== */
/**
 * "11:00-17:51|17:51-20:02|04:32-04:38" -> [[660,1071],[1071,1202],[1712,1718]]
 * Gün aşımını kendisi düzeltir: bir saat bir öncekinden küçükse 24 saat eklenir.
 * Böylece gece yarısını geçen vardiyalar tek eksende toplanır.
 */
function _oturumlar(metin) {
  var ham = [];
  String(metin || '').split('|').forEach(function (p) {
    var m = p.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) return;
    ham.push([Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])]);
  });
  if (!ham.length) return [];

  var out = [], onceki = -1, kayma = 0;
  for (var i = 0; i < ham.length; i++) {
    var cift = [];
    for (var j = 0; j < 2; j++) {
      var v = ham[i][j] + kayma;
      if (onceki >= 0 && v < onceki) { kayma += 1440; v += 1440; }
      cift.push(v);
      onceki = v;
    }
    out.push(cift);
  }
  return out;
}

/**
 * Makul çıkıştan sonra fiilen ÇEVRİMİÇİ geçen dakika + hangi aralıklarda.
 * Kesintinin tamamı buradan gelir; kapalı geçen aralar hiç sayılmaz.
 */
function _sonrakiOnline(oturumlar, makul) {
  var t = 0, parca = [];
  oturumlar.forEach(function (o) {
    var bas = Math.max(o[0], makul);
    if (o[1] > bas) {
      t += o[1] - bas;
      parca.push(_hm(bas) + '-' + _hm(o[1]));
    }
  });
  return { dk: Math.round(t), parca: parca.join(', ') || '—' };
}

/* ==================== GECIKME DOKUMU ==================== */
function gecikmeDokumu() {
  var ss = SpreadsheetApp.openById(K_SS_ID);
  var sip = ss.getSheetByName(K_SIPARIS);
  if (!sip || sip.getLastRow() < 2) return 0;

  var v = sip.getDataRange().getDisplayValues();
  var h = v[0].map(_kn);
  var c = function (ad) { var a = _kn(ad); for (var i = 0; i < h.length; i++) if (h[i].indexOf(a) === 0) return i; return -1; };
  var iTar = c('tarih'), iAd = c('adisyon'), iKur = c('kurye'), iCik = c('restorandan'),
      iTes = c('teslim saati'), iKm = c('mesafe'), iYol = c('yol (dk)'), iMus = c('müşteri');

  var satirlar = [];
  for (var r = 1; r < v.length; r++) {
    var km = _sayi(v[r][iKm]), yol = _sayi(v[r][iYol]);
    if (km === null || yol === null || km <= 0) continue;
    var bek = Math.round(BEK_SABIT + BEK_DK_KM * km);
    var fazla = Math.round(yol - bek);
    if (fazla <= GECIKME_TOLERANS) continue;
    satirlar.push([
      v[r][iTar], v[r][iAd], v[r][iKur], km, bek, Math.round(yol), fazla,
      v[r][iCik], v[r][iTes], v[r][iMus],
      km + ' km için beklenen ' + bek + ' dk, teslim ' + Math.round(yol) + ' dk sürdü — ' +
      fazla + ' dk fazla.'
    ]);
  }

  var sh = ss.getSheetByName(K_GECIKME) || ss.insertSheet(K_GECIKME);
  sh.clear();
  [1, 8, 9].forEach(function (c2) { sh.getRange(1, c2, sh.getMaxRows(), 1).setNumberFormat('@'); });
  var bas = ['Tarih', 'Adisyon No', 'Kurye', 'Km', 'Beklenen (dk)', 'Fiili (dk)',
             'Fazla (dk)', 'Restorandan Çıktı', 'Teslim', 'Müşteri', 'Açıklama'];
  sh.getRange(1, 1, 1, bas.length).setValues([bas])
    .setBackground('#7f6000').setFontColor('#ffffff').setFontWeight('bold');
  sh.setFrozenRows(1);

  if (!satirlar.length) {
    sh.getRange(2, 1).setValue('Eşiği aşan teslimat yok ✅');
    return 0;
  }

  satirlar.sort(function (a, b) { return b[6] - a[6]; });
  sh.getRange(2, 1, satirlar.length, bas.length).setValues(satirlar);
  sh.getRange(2, 11, satirlar.length, 1).setWrap(true);
  sh.setColumnWidth(11, 400);

  var ozet = {};
  satirlar.forEach(function (r) {
    var k = String(r[2] || '-');
    if (!ozet[k]) ozet[k] = { n: 0, dk: 0 };
    ozet[k].n++; ozet[k].dk += r[6];
  });
  var o = Object.keys(ozet).map(function (k) { return [k, ozet[k].n, ozet[k].dk]; })
                           .sort(function (a, b) { return b[2] - a[2]; });
  var r0 = satirlar.length + 3;
  sh.getRange(r0, 1, 1, 3).setValues([['Kurye', 'Gecikme Adedi', 'Toplam Fazla (dk)']])
    .setBackground('#bf9000').setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(r0 + 1, 1, o.length, 3).setValues(o);

  sh.autoResizeColumns(1, 10);
  return satirlar.length;
}

/* ==================== YARDIMCILAR ==================== */
function _kn(x) {
  var s = String(x == null ? '' : x).toLowerCase().trim();
  return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
}

function _ixHam(basliklar) {
  var h = basliklar.map(_kn);
  var bul = function () {
    for (var a = 0; a < arguments.length; a++) {
      var t = _kn(arguments[a]);
      for (var i = 0; i < h.length; i++) if (h[i] === t) return i;
    }
    return -1;
  };
  return {
    tarih: bul('Tarih'), kurye: bul('Kurye'),
    plGiris: bul('Planlı Giriş'), plCikis: bul('Planlı Çıkış'),
    giris: bul('Giriş'), cikis: bul('Çıkış'),
    hamDk: bul('Ham (dk)'), ilkPaket: bul('İlk Paket'),
    sonCikis: bul('Son Sipariş Çıkış'), sonSiparis: bul('Son Sipariş'),
    km: bul('Son Sipariş Km'), paket: bul('Paket'), durum: bul('Durum'),
    oturumlar: bul('Oturumlar')
  };
}

/** "HH:MM" -> gun ici dakika. Bos/gecersiz -> null. */
function _dk(v) {
  var m = String(v == null ? '' : v).trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** dakika -> "HH:MM" (gun asimini da dogru yazar). */
function _hm(dk) {
  if (dk === null || dk === '' || dk === undefined) return '';
  var d = ((Math.round(dk) % 1440) + 1440) % 1440;
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(Math.floor(d / 60)) + ':' + p(d % 60);
}

/** dakika -> "H:MM" sure metni (bordro script'i bunu okuyor). */
function _sure(dk) {
  if (!dk) return '';
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return Math.floor(dk / 60) + ':' + p(Math.round(dk) % 60);
}

function _sayi(v) {
  if (v === '' || v === null || v === undefined) return null;
  var s = String(v).trim();
  if (!s) return null;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  var n = Number(s);
  return isNaN(n) ? null : n;
}

function _dt(tr) {
  var p = String(tr || '').split('.');
  if (p.length !== 3) return 0;
  return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime();
}
