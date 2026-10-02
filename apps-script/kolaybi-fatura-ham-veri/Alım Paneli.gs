// ============================================================
// BAP ALIM PANELİ — API (Kolaybi Fatura Ham Veri projesine ayrı dosya)
// ------------------------------------------------------------
// Dağıtım: Apps Script → Dağıt → Yeni dağıtım → Web uygulaması
//          Çalıştıran: Ben · Erişim: Herkes  → /exec adresini alim.html'deki API sabitine yaz.
// Bu dosya kendi doGet/doPost'unu tanımlar; aynı projede başka doGet/doPost OLMAMALI.
//
// Okur : Sayfa1 (faturalar), Fatura_Kalemleri, Urun_Listesi, Stok Takip › Tbl_Hammaddeler (kategori)
// Yazar: Odemeler, Tedarikciler, Sayfa1 F / Fatura_Kalemleri I (şube atama)
//
// GET  ?action=veri              → tüm veri + hesaplar
// POST {action:"subeAta",  no, sube}
// POST {action:"odemeEkle", ted, tarih:"YYYY-MM-DD", tutar, yontem, not}
// POST {action:"odemeSil",  id}
// POST {action:"tedarikciKaydet", ted, vade, acilis, not}
// ============================================================

var AP_SAYFA1  = 'Sayfa1';
var AP_KALEM   = 'Fatura_Kalemleri';
var AP_URUN    = 'Urun_Listesi';
var AP_ODEME   = 'Odemeler';
var AP_TED     = 'Tedarikciler';
var AP_STOK_ID = '1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE';
var AP_HM      = 'Tbl_Hammaddeler';
var AP_OZEL    = 'Ozel_Alimlar';      // panelden işaretlenen ev/kırtasiye alımları (bu dosyada)
var AP_SATIS   = 'Satis_Faturalari';
var AP_GIDER   = 'Gider_Faturalari';
var AP_EV_BASLIK = 'Not (elle';        // Stok Takip'te ürün bazlı "Ev" notu olan sekmelerin J başlığı
var AP_VARSAYILAN_VADE = 30;   // tedarikçiye vade tanımlanmamışsa (gün)
var AP_ACILIS_TARIHI   = '2026-01-01';  // açılış bakiyesinin tarihi (verinin başladığı ay)
var AP_STOK_BASLANGIC  = '2026-08-13';  // bu tarihten eski faturalar stoğa girmez → şubesi boşsa "belirsiz" sayılmaz
// Faturanın bütün kalemleri bunlardan oluşuyorsa fatura "ek masraf" sayılır (listelerde gizlenir, borçta kalır)
var AP_EK_MASRAF = ['yükleme bedeli', 'yukleme bedeli', 'nakliye', 'kargo', 'taşıma bedeli', 'hizmet bedeli', 'yuvarlama', 'iskonto', 'indirim', 'komisyon'];

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'veri';
  try {
    if (action === 'veri') return ap_json_(ap_veri_());
    return ap_json_({ ok: false, hata: 'Bilinmeyen action: ' + action });
  } catch (err) {
    return ap_json_({ ok: false, hata: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var sonuc;
    switch (b.action) {
      case 'subeAta':         sonuc = ap_subeAta_(b.no, b.sube); break;
      case 'odemeEkle':       sonuc = ap_odemeEkle_(b); break;
      case 'odemeSil':        sonuc = ap_odemeSil_(b.id); break;
      case 'tedarikciKaydet': sonuc = ap_tedarikciKaydet_(b); break;
      case 'ozelIsaretle':    sonuc = ap_ozelIsaretle_(b); break;
      case 'hammaddeEkle':    sonuc = ap_hammaddeEkle_(b); break;
      case 'ozelUrun':        sonuc = ap_ozelUrun_(b); break;
      case 'giderEkle':       sonuc = ap_giderEkle_(b); break;
      case 'giderSil':        sonuc = ap_giderSil_(b.id); break;
      case 'giderKategori':   sonuc = ap_giderKategori_(b.id, b.kategori); break;
      default: sonuc = { ok: false, hata: 'Bilinmeyen action' };
    }
    return ap_json_(sonuc);
  } catch (err) {
    return ap_json_({ ok: false, hata: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function ap_json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// VERİ
// ==========================================

function ap_veri_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ap_sekmeleriHazirla_(ss);

  // --- faturalar (Sayfa1)
  var s1 = ss.getSheetByName(AP_SAYFA1) || ss.getSheets()[0];
  var d1 = s1.getDataRange().getValues();
  var faturalar = [], fIdx = {};
  var tedKanon = {};                                            // nrm(ad) → ilk görülen yazım
  for (var i = 1; i < d1.length; i++) {
    var no = ap_no_(d1[i][0]);
    if (!no || fIdx[no]) continue;
    var tedHam = String(d1[i][2] || '').replace(/\s+/g, ' ').trim();
    var tedKey = ap_nrm_(tedHam);
    if (tedHam && !tedKanon[tedKey]) tedKanon[tedKey] = tedHam;
    var f = {
      no: no,
      tarih: ap_iso_(ap_tarih_(d1[i][1])),
      vade: d1[i][6] ? ap_iso_(ap_tarih_(d1[i][6])) : '',     // G: Kolaybi vade tarihi (varsa)
      ted: tedKanon[tedKey] || tedHam,
      tutar: ap_sayi_(d1[i][3]),
      sube: String(d1[i][5] || '').trim(),
      kalem: 0,
      ek: ap_ekMasrafMi_(d1[i][4]),     // sadece yükleme/nakliye gibi kalemlerden oluşan fatura
      ozel: '',
      eski: false
    };
    f.eski = f.tarih < AP_STOK_BASLANGIC;
    fIdx[no] = f;
    faturalar.push(f);
  }

  // --- kalemler (Stok Takip okumaları 10 dk önbellekte; hammaddeEkle sıfırlar)
  var hmMap = ap_cacheGet_('hmMap') || (function () { var m = ap_hammaddeHaritasi_(); ap_cacheSet_('hmMap', m); return m; })();
  var evUrunler = ap_cacheGet_('evUrunler') || (function () { var m = ap_evUrunleri_(); ap_cacheSet_('evUrunler', m); return m; })();
  var ozel = ap_ozelHaritasi_(ss);             // panelden işaretlenenler: {"no|": tur, "no|urun": tur}
  var ks = ss.getSheetByName(AP_KALEM);
  var kalemler = [];
  if (ks && ks.getLastRow() > 1) {
    var dk = ks.getRange(2, 1, ks.getLastRow() - 1, 11).getValues();
    for (var j = 0; j < dk.length; j++) {
      var r = dk[j];
      var kno = ap_no_(r[0]);
      if (!kno) continue;
      var urun = String(r[3] || '').trim();
      var hm = hmMap[ap_nrm_(urun)] || {};
      var kTed = String(r[2] || '').replace(/\s+/g, ' ').trim();
      var k = {
        no: kno,
        tarih: ap_iso_(ap_tarih_(r[1])),
        ted: tedKanon[ap_nrm_(kTed)] || kTed,
        urun: urun,
        adet: ap_sayi_(r[4]),
        fiyat: ap_sayi_(r[5]),
        tutar: ap_sayi_(r[6]),
        sube: String(r[8] || '').trim(),
        kat: hm.kat || '',
        kisa: hm.kisa || '',
        sekme: hm.sekme || '',
        icerik: hm.icerik || 0,
        olcu: hm.olcu || '',
        paket: hm.paket || '',
        koli: hm.koli || 0,
        islendi: !!String(r[10] || '').trim(),
        ozel: (function () { var t = ozel[kno + '|' + ap_nrm_(urun)] || ozel[kno + '|'] || ozel['*|' + ap_nrm_(urun)] || (evUrunler[ap_nrm_(urun)] ? 'Ev' : ''); return t === 'Pasif' ? '' : t; })(),
        pasif: ozel['*|' + ap_nrm_(urun)] === 'Pasif'
      };
      kalemler.push(k);
      if (fIdx[kno]) { fIdx[kno].kalem++; if (!fIdx[kno].sube && k.sube) fIdx[kno].sube = k.sube; }
    }
  }

  // fatura düzeyinde özel: tüm fatura işaretlenmişse ya da bütün kalemleri özelse
  var kalemNo = {};
  kalemler.forEach(function (k) { (kalemNo[k.no] = kalemNo[k.no] || []).push(k); });
  faturalar.forEach(function (f) {
    if (ozel[f.no + '|']) { f.ozel = ozel[f.no + '|']; return; }
    var ks2 = kalemNo[f.no] || [];
    if (ks2.length && ks2.every(function (k) { return k.ozel; })) f.ozel = ks2[0].ozel;
  });

  // --- ödemeler
  var os = ss.getSheetByName(AP_ODEME);
  var odemeler = [], eslesmeyenOdeme = [];
  var tedKeys = Object.keys(tedKanon);
  if (os.getLastRow() > 1) {
    os.getRange(2, 1, os.getLastRow() - 1, 6).getValues().forEach(function (r) {
      if (!r[0]) return;
      var yazilan = String(r[2] || '').replace(/\s+/g, ' ').trim();
      var eslesen = ap_tedarikciBul_(yazilan, tedKanon, tedKeys);
      var o = { id: String(r[0]), tarih: ap_iso_(ap_tarih_(r[1])), ted: eslesen || yazilan, yazilanTed: yazilan,
                tutar: ap_sayi_(r[3]), yontem: String(r[4] || ''), not: String(r[5] || ''), eslesti: !!eslesen };
      if (!eslesen) eslesmeyenOdeme.push(o);
      odemeler.push(o);
    });
  }

  // --- tedarikçiler (tanımlar) — faturalarda geçen her tedarikçi için satır olsun
  var ts = ss.getSheetByName(AP_TED);
  var tedarikciler = {};
  var tRows = ts.getLastRow() > 1 ? ts.getRange(2, 1, ts.getLastRow() - 1, 4).getValues() : [];
  tRows.forEach(function (r) {
    var ad = String(r[0] || '').replace(/\s+/g, ' ').trim();
    if (!ad) return;
    var kanon = ap_tedarikciBul_(ad, tedKanon, tedKeys) || ad;
    tedarikciler[kanon] = { vade: ap_sayi_(r[1]) || AP_VARSAYILAN_VADE, acilis: ap_sayi_(r[2]), not: String(r[3] || '') };
  });
  var eksik = [];
  faturalar.forEach(function (f) {
    if (f.ted && !tedarikciler[f.ted]) { tedarikciler[f.ted] = { vade: AP_VARSAYILAN_VADE, acilis: 0, not: '' }; eksik.push([f.ted, AP_VARSAYILAN_VADE, 0, '']); }
  });
  if (eksik.length) ts.getRange(ts.getLastRow() + 1, 1, eksik.length, 4).setValues(eksik);

  var katSet = {};
  Object.keys(hmMap).forEach(function (k) { if (hmMap[k].kat) katSet[hmMap[k].kat] = true; });

  return {
    ok: true,
    olusturma: new Date().toISOString(),
    kategoriler: Object.keys(katSet).sort(),
    urunSekmeleri: ap_cacheGet_('urunSekmeleri') || (function () { var l; try { l = ap_urunSekmeleri_(SpreadsheetApp.openById(AP_STOK_ID)); } catch (e) { l = [AP_HM]; } ap_cacheSet_('urunSekmeleri', l); return l; })(),
    satis: ap_satisOku_(ss),
    gider: ap_giderOku_(ss),
    acilisTarihi: AP_ACILIS_TARIHI,
    faturalar: faturalar,
    kalemler: kalemler,
    odemeler: odemeler,
    eslesmeyenOdeme: eslesmeyenOdeme,
    tedarikciler: tedarikciler,
    hesap: ap_hesap_(faturalar, odemeler, tedarikciler)
  };
}

/** Tedarikçi bazında bakiye, açık faturalar (FIFO ödeme dağıtımı), vadesi geçen, bu ay/geçen ay alım. */
function ap_hesap_(faturalar, odemeler, tedarikciler) {
  var bugun = new Date(); bugun.setHours(0, 0, 0, 0);
  var buAy = bugun.getFullYear() + '-' + ('0' + (bugun.getMonth() + 1)).slice(-2);
  var ga = new Date(bugun.getFullYear(), bugun.getMonth() - 1, 1);
  var gecenAy = ga.getFullYear() + '-' + ('0' + (ga.getMonth() + 1)).slice(-2);

  var grup = {};
  faturalar.forEach(function (f) { if (!f.ted) return; (grup[f.ted] = grup[f.ted] || { f: [], o: [] }).f.push(f); });
  odemeler.forEach(function (o) { if (!o.ted) return; (grup[o.ted] = grup[o.ted] || { f: [], o: [] }).o.push(o); });

  var sonuc = {};
  Object.keys(grup).forEach(function (ted) {
    var t = tedarikciler[ted] || { vade: AP_VARSAYILAN_VADE, acilis: 0 };
    var g = grup[ted];
    var kalemler = [];
    if (t.acilis > 0) kalemler.push({ no: 'Açılış', tarih: AP_ACILIS_TARIHI, tutar: t.acilis, kalan: t.acilis });
    g.f.slice().sort(function (a, b) { return a.tarih < b.tarih ? -1 : 1; })
       .forEach(function (f) { kalemler.push({ no: f.no, tarih: f.tarih, tutar: f.tutar, kalan: f.tutar, vade: f.vade || '' }); });

    var odenen = 0;
    g.o.forEach(function (o) { odenen += o.tutar; });
    var kalanOdeme = odenen;
    kalemler.forEach(function (k) {                        // FIFO: en eski borç önce kapanır
      if (kalanOdeme <= 0) return;
      var d = Math.min(k.kalan, kalanOdeme);
      k.kalan = ap_r2_(k.kalan - d); kalanOdeme = ap_r2_(kalanOdeme - d);
    });

    var toplamFatura = 0, buAyT = 0, gecenAyT = 0, sonFatura = '';
    g.f.forEach(function (f) {
      toplamFatura += f.tutar;
      if (f.tarih.slice(0, 7) === buAy) buAyT += f.tutar;
      if (f.tarih.slice(0, 7) === gecenAy) gecenAyT += f.tutar;
      if (f.tarih > sonFatura) sonFatura = f.tarih;
    });

    var acik = [], vadesiGecen = 0, enEskiGecikme = 0;
    kalemler.forEach(function (k) {
      if (k.kalan <= 0) return;
      var vt = k.vade ? new Date(k.vade) : new Date(k.tarih);
      if (!k.vade) vt.setDate(vt.getDate() + t.vade);       // faturanın kendi vadesi yoksa tedarikçi vade günü
      vt.setHours(0, 0, 0, 0);
      var gecikme = Math.floor((bugun - vt) / 86400000);
      acik.push({ no: k.no, tarih: k.tarih, tutar: k.tutar, kalan: k.kalan, vade: ap_iso_(vt), gecikme: gecikme });
      if (gecikme > 0) { vadesiGecen += k.kalan; if (gecikme > enEskiGecikme) enEskiGecikme = gecikme; }
    });

    sonuc[ted] = {
      bakiye: ap_r2_(t.acilis + toplamFatura - odenen),
      alacak: ap_r2_(Math.max(0, kalanOdeme)),           // fazla ödeme varsa
      toplamFatura: ap_r2_(toplamFatura), odenen: ap_r2_(odenen),
      buAy: ap_r2_(buAyT), gecenAy: ap_r2_(gecenAyT),
      faturaSayisi: g.f.length, sonFatura: sonFatura,
      vade: t.vade, acilis: t.acilis,
      vadesiGecen: ap_r2_(vadesiGecen), enEskiGecikme: enEskiGecikme,
      acikFaturalar: acik
    };
  });
  return sonuc;
}

// ==========================================
// YAZMA
// ==========================================

function ap_subeAta_(no, sube) {
  no = ap_no_(no);
  sube = String(sube || '').trim();
  if (!no) return { ok: false, hata: 'Fatura no boş' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s1 = ss.getSheetByName(AP_SAYFA1) || ss.getSheets()[0];
  var d1 = s1.getRange(2, 1, Math.max(1, s1.getLastRow() - 1), 1).getValues();
  var s1Sayac = 0;
  for (var i = 0; i < d1.length; i++) if (ap_no_(d1[i][0]) === no) { s1.getRange(i + 2, 6).setValue(sube); s1Sayac++; }
  var ks = ss.getSheetByName(AP_KALEM);
  var kSayac = 0;
  if (ks && ks.getLastRow() > 1) {
    var dk = ks.getRange(2, 1, ks.getLastRow() - 1, 9).getValues();
    var kol = dk.map(function (r) { return [r[8]]; }), degisti = false;
    for (var j = 0; j < dk.length; j++) if (ap_no_(dk[j][0]) === no) { kol[j][0] = sube; kSayac++; degisti = true; }
    if (degisti) ks.getRange(2, 9, kol.length, 1).setValues(kol);
  }
  return { ok: true, no: no, sube: sube, sayfa1: s1Sayac, kalem: kSayac };
}

function ap_odemeEkle_(b) {
  var ted = String(b.ted || '').trim(), tutar = ap_sayi_(b.tutar);
  if (!ted || !(tutar > 0)) return { ok: false, hata: 'Tedarikçi ve tutar gerekli' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ap_sekmeleriHazirla_(ss);
  var sh = ss.getSheetByName(AP_ODEME);
  var tarih = b.tarih ? ap_tarih_(b.tarih) : new Date();
  var id = 'O' + Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10);
  sh.insertRowsBefore(2, 1);
  sh.getRange(2, 1, 1, 7).setValues([[id, tarih, ted, tutar, String(b.yontem || ''), String(b.not || ''), new Date()]]);
  sh.getRange(2, 2).setNumberFormat('dd.MM.yyyy');
  sh.getRange(2, 4).setNumberFormat('#,##0.00');
  return { ok: true, id: id };
}

function ap_odemeSil_(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(AP_ODEME);
  if (!sh || sh.getLastRow() < 2) return { ok: false, hata: 'Ödeme yok' };
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) { sh.deleteRow(i + 2); return { ok: true }; }
  return { ok: false, hata: 'Ödeme bulunamadı: ' + id };
}

function ap_tedarikciKaydet_(b) {
  var ted = String(b.ted || '').trim();
  if (!ted) return { ok: false, hata: 'Tedarikçi boş' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ap_sekmeleriHazirla_(ss);
  var sh = ss.getSheetByName(AP_TED);
  var satir = [ted, ap_sayi_(b.vade) || AP_VARSAYILAN_VADE, ap_sayi_(b.acilis), String(b.not || '')];
  var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).trim() === ted) { sh.getRange(i + 2, 1, 1, 4).setValues([satir]); return { ok: true }; }
  sh.appendRow(satir);
  return { ok: true };
}

/** {no, urun ('' = tüm fatura), tur ('' = işareti kaldır | Ev | Kırtasiye | Diğer)} */
function ap_ozelIsaretle_(b) {
  var no = ap_no_(b.no), urun = String(b.urun || '').trim(), tur = String(b.tur || '').trim();
  if (!no) return { ok: false, hata: 'Fatura no boş' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ap_sekmeleriHazirla_(ss);
  var sh = ss.getSheetByName(AP_OZEL);
  var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues() : [];
  for (var i = rows.length - 1; i >= 0; i--) {
    if (ap_no_(rows[i][0]) === no && ap_nrm_(rows[i][1]) === ap_nrm_(urun)) sh.deleteRow(i + 2);
  }
  if (tur) sh.appendRow([no, urun, tur, new Date()]);
  return { ok: true };
}

// ---------- Satış faturaları (Satis_Faturalari) ----------
function ap_satisOku_(ss) {
  var sh = ss.getSheetByName(AP_SATIS), out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues().forEach(function (r) {
    var id = ap_no_(r[0]); if (!id) return;
    out.push({ id: id, no: String(r[1] || ''), tarih: ap_iso_(ap_tarih_(r[2])), vade: r[3] ? ap_iso_(ap_tarih_(r[3])) : '',
               musteri: String(r[4] || '').trim(), tutar: ap_sayi_(r[5]), odenen: ap_sayi_(r[7]), kalan: ap_sayi_(r[8]),
               odeme: String(r[9] || ''), durum: String(r[10] || ''), ebelge: String(r[11] || '') });
  });
  return out;
}

// ---------- Giderler (Gider_Faturalari: Kolaybi + elle girilenler) ----------
function ap_giderOku_(ss) {
  var sh = ss.getSheetByName(AP_GIDER), out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues().forEach(function (r) {
    var id = ap_no_(r[0]); if (!id) return;
    out.push({ id: id, no: String(r[1] || ''), tarih: ap_iso_(ap_tarih_(r[2])), vade: r[3] ? ap_iso_(ap_tarih_(r[3])) : '',
               ted: String(r[4] || '').trim(), tutar: ap_sayi_(r[5]), odenen: ap_sayi_(r[6]), kalan: ap_sayi_(r[7]),
               kat: String(r[8] || 'Diğer'), aciklama: String(r[9] || ''), kaynak: String(r[10] || ''), tipId: String(r[11] || '') });
  });
  return out;
}

function ap_giderSekme_(ss) {
  var sh = ss.getSheetByName(AP_GIDER);
  if (!sh) {
    sh = ss.insertSheet(AP_GIDER);
    sh.appendRow(['Fatura_ID', 'Fatura_No', 'Tarih', 'Vade_Tarihi', 'Tedarikci', 'Tutar', 'Odenen', 'Kalan', 'Kategori', 'Aciklama', 'Kaynak']);
    sh.getRange(1, 1, 1, 11).setFontWeight('bold'); sh.setFrozenRows(1);
  }
  return sh;
}

/** Elle gider: {tarih, ted, tutar, kategori, aciklama, odendi:true/false} */
function ap_giderEkle_(b) {
  var tutar = ap_sayi_(b.tutar);
  if (!(tutar > 0)) return { ok: false, hata: 'Tutar gerekli' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ap_giderSekme_(ss);
  var id = 'G' + Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10);
  var odenen = b.odendi ? tutar : 0;
  sh.appendRow([id, '', b.tarih ? ap_tarih_(b.tarih) : new Date(), '', String(b.ted || '').trim(), tutar, odenen, ap_r2_(tutar - odenen),
                String(b.kategori || 'Diğer'), String(b.aciklama || ''), 'manuel']);
  var r = sh.getLastRow();
  sh.getRange(r, 3).setNumberFormat('dd.MM.yyyy'); sh.getRange(r, 6, 1, 3).setNumberFormat('#,##0.00');
  return { ok: true, id: id };
}

function ap_giderSil_(id) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AP_GIDER);
  if (!sh || sh.getLastRow() < 2) return { ok: false, hata: 'Kayıt yok' };
  var d = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  for (var i = 0; i < d.length; i++) if (ap_no_(d[i][0]) === String(id)) {
    if (String(d[i][10]) !== 'manuel') return { ok: false, hata: 'Kolaybi kaynaklı gider silinmez; Kolaybi\'de düzenle' };
    sh.deleteRow(i + 2); return { ok: true };
  }
  return { ok: false, hata: 'Bulunamadı' };
}

function ap_giderKategori_(id, kategori) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AP_GIDER);
  if (!sh || sh.getLastRow() < 2) return { ok: false, hata: 'Kayıt yok' };
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (ap_no_(ids[i][0]) === String(id)) { sh.getRange(i + 2, 9).setValue(String(kategori || 'Diğer')); return { ok: true }; }
  return { ok: false, hata: 'Bulunamadı' };
}

/** {urunler:[fatura adları], tur:'Ev'|'Kırtasiye'|'Diğer'|''} → ürün bazlı (tüm faturalarda) özel işareti. */
function ap_ozelUrun_(b) {
  var urunler = Array.isArray(b.urunler) ? b.urunler : [b.urun];
  var tur = String(b.tur || '').trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ap_sekmeleriHazirla_(ss);
  var sh = ss.getSheetByName(AP_OZEL);
  var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues() : [];
  var hedef = {}; urunler.forEach(function (u) { if (u) hedef[ap_nrm_(u)] = true; });
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0]).trim() === '*' && hedef[ap_nrm_(rows[i][1])]) sh.deleteRow(i + 2);
  }
  if (tur) urunler.forEach(function (u) { if (u) sh.appendRow(['*', String(u).trim(), tur, new Date()]); });
  return { ok: true, sayi: urunler.length };
}

/** Panelden: fatura adını Stok Takip'teki seçilen ürün sekmesine (Tbl_Hammaddeler / Ambalaj_Hammadde / Direktsatisurunler) ekler. */
function ap_hammaddeEkle_(b) {
  var faturaAdi = String(b.faturaAdi || '').trim(), kisa = String(b.kisa || '').trim();
  var kat = String(b.kategori || '').trim(), ted = String(b.tedarikci || '').trim(), fiyat = ap_sayi_(b.fiyat);
  if (!faturaAdi || !kisa) return { ok: false, hata: 'Fatura adı ve kısa ad gerekli' };
  var ss = SpreadsheetApp.openById(AP_STOK_ID);
  var sekmeler = ap_urunSekmeleri_(ss);
  var sekme = String(b.sekme || AP_HM);
  if (sekmeler.indexOf(sekme) === -1) return { ok: false, hata: 'Geçersiz sekme: ' + sekme };
  // aynı fatura adı başka bir sekmede tanımlıysa uyar
  for (var s = 0; s < sekmeler.length; s++) {
    var dd = ss.getSheetByName(sekmeler[s]).getDataRange().getValues();
    for (var r = 1; r < dd.length; r++) if (ap_nrm_(dd[r][1]) === ap_nrm_(faturaAdi)) return { ok: false, hata: 'Bu fatura adı zaten tanımlı (' + sekmeler[s] + '): ' + dd[r][1] + ' → ' + dd[r][2] };
  }
  var sh = ss.getSheetByName(sekme);
  var d = sh.getDataRange().getValues();
  var maxNo = 0, onek = '';
  for (var i = 1; i < d.length; i++) {
    var m = String(d[i][0] || '').match(/^(.*?)(\d+)\s*$/);
    if (m) { if (+m[2] > maxNo) maxNo = +m[2]; if (!onek) onek = m[1]; }
  }
  if (!onek) onek = sekme === AP_HM ? 'HM' : sekme.indexOf('Ambalaj') === 0 ? 'AMB' : sekme.indexOf('Direkt') === 0 ? 'DS' : 'X';
  var id = onek + ('000' + (maxNo + 1)).slice(-3);
  var satir = [id, faturaAdi, kisa, ted, '', String(b.paket || ''), kat, ap_sayi_(b.icerik) || '', String(b.olcu || ''), fiyat || '', '', '', '', '', '', ap_sayi_(b.koli) || ''];
  sh.appendRow(satir);
  ap_cacheSil_('hmMap'); ap_cacheSil_('urunSekmeleri');
  return { ok: true, id: id, sekme: sekme };
}

// ==========================================
// YARDIMCILAR
// ==========================================

function ap_sekmeleriHazirla_(ss) {
  if (!ss.getSheetByName(AP_ODEME)) {
    var o = ss.insertSheet(AP_ODEME);
    o.appendRow(['Odeme_ID', 'Tarih', 'Tedarikçi', 'Tutar', 'Yöntem', 'Not', 'Kayıt_Zamanı']);
    o.getRange(1, 1, 1, 7).setFontWeight('bold'); o.setFrozenRows(1);
  }
  if (!ss.getSheetByName(AP_TED)) {
    var t = ss.insertSheet(AP_TED);
    t.appendRow(['Tedarikçi', 'Vade_Gun', 'Acilis_Bakiye', 'Not']);
    t.getRange(1, 1, 1, 4).setFontWeight('bold'); t.setFrozenRows(1);
  }
  if (!ss.getSheetByName(AP_OZEL)) {
    var z = ss.insertSheet(AP_OZEL);
    z.appendRow(['Fatura_No', 'Ürün (boş = tüm fatura)', 'Tür', 'Kayıt_Zamanı']);
    z.getRange(1, 1, 1, 4).setFontWeight('bold'); z.setFrozenRows(1);
  }
}

function ap_ozelHaritasi_(ss) {
  var h = {};
  var sh = ss.getSheetByName(AP_OZEL);
  if (!sh || sh.getLastRow() < 2) return h;
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
    var no = ap_no_(r[0]); if (!no) return;
    h[no + '|' + ap_nrm_(r[1])] = String(r[2] || 'Ev').trim();
  });
  return h;
}

/** Stok Takip'te J başlığı "Not (elle …" olan sekmelerde notu "ev" olan ürün adları. */
function ap_evUrunleri_() {
  var h = {};
  try {
    SpreadsheetApp.openById(AP_STOK_ID).getSheets().forEach(function (sh) {
      if (sh.getLastRow() < 2 || sh.getLastColumn() < 10) return;
      var bas = String(sh.getRange(1, 10).getValue() || '');
      if (bas.indexOf(AP_EV_BASLIK) !== 0) return;
      sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues().forEach(function (r) {
        if (r[0] && String(r[9] || '').trim().toLowerCase() === 'ev') h[ap_nrm_(r[0])] = true;
      });
    });
  } catch (e) { Logger.log('Ev ürünleri: ' + e); }
  return h;
}

/** Fatura içeriğindeki tüm kalemler ek masraf kalıbına uyuyorsa true. Varsa Fatura_Kalemleri_v2'nin listesini kullanır. */
function ap_ekMasrafMi_(icerik) {
  var s = String(icerik || '').replace(/\r/g, '').trim();
  if (!s) return false;
  var liste = AP_EK_MASRAF.map(function (x) { return ap_nrm_(x); });
  try { if (typeof fk_haricListesi === 'function') liste = fk_haricListesi(SpreadsheetApp.getActiveSpreadsheet()).map(function (x) { return x.norm; }); } catch (e) {}
  var parcalar = s.indexOf('\n') > -1 ? s.split('\n') : [s];
  var hepsiEk = true, sayac = 0;
  parcalar.forEach(function (p) {
    var ad = ap_nrm_(p.replace(/-\d+(?:[.,]\d+)?\s*[xX]\s*\d+(?:[.,]\d+)?.*$/, ''));
    if (!ad) return;
    sayac++;
    var ek = liste.some(function (l) { return ad.indexOf(l) !== -1; });
    if (!ek) hepsiEk = false;
  });
  return sayac > 0 && hepsiEk;
}

/** Stok Takip'te ürün tanımı taşıyan sekmeler: A başlığı "..._ID", B başlığı "Hammadde_Ad..." / "Urun_ad..." olanlar
 *  (Tbl_Hammaddeler, Ambalaj_Hammadde, Direktsatisurunler ve aynı düzende açılacak yeni sekmeler). */
function ap_urunSekmeleri_(ss) {
  var liste = [];
  ss.getSheets().forEach(function (sh) {
    if (sh.getLastColumn() < 3 || sh.getLastRow() < 1) return;
    var b = sh.getRange(1, 1, 1, 3).getValues()[0].map(function (x) { return String(x || '').replace(/[İIı]/g, 'i').toLowerCase().replace(/[^a-z0-9ğüşöç]/g, ''); });
    if (/id$/.test(b[0]) && (/^hammaddead/.test(b[1]) || /^urunad/.test(b[1]))) liste.push(sh.getName());
  });
  liste.sort(function (a, b) { return a === AP_HM ? -1 : b === AP_HM ? 1 : a.localeCompare(b); });
  return liste;
}

/**
 * Stok Takip'teki tüm ürün sekmeleri: fatura adı (B) ve kısa ad (C) →
 * { kat: G Kategori, kisa: C, icerik: H paket içeriği, olcu: I ölçü birimi, sekme }. Erişilemezse boş.
 */
function ap_hammaddeHaritasi_() {
  var h = {};
  try {
    var ss = SpreadsheetApp.openById(AP_STOK_ID);
    ap_urunSekmeleri_(ss).forEach(function (ad) {
      var sh = ss.getSheetByName(ad);
      var d = sh.getDataRange().getValues();
      for (var i = 1; i < d.length; i++) {
        var tam = String(d[i][1] || '').trim(), kisa = String(d[i][2] || '').trim();
        if (!tam && !kisa) continue;
        var bilgi = { kat: String(d[i][6] || '').trim() || (ad === AP_HM ? '' : ad.replace(/_/g, ' ')), kisa: kisa || tam, icerik: ap_sayi_(d[i][7]), olcu: String(d[i][8] || '').replace(/\./g, '').trim().toLowerCase(),
                      paket: String(d[i][5] || '').replace(/\./g, '').trim().toLowerCase(), koli: ap_sayi_(d[i][15]), sekme: ad };
        if (tam && !h[ap_nrm_(tam)]) h[ap_nrm_(tam)] = bilgi;
        if (kisa && !h[ap_nrm_(kisa)]) h[ap_nrm_(kisa)] = bilgi;
      }
    });
  } catch (e) { Logger.log('Hammadde haritası: ' + e); }
  return h;
}

/** Yazılan tedarikçi adını faturalardaki kanonik ada bağlar: birebir (normalize) → benzerlik ≥ 0,8 → başlangıç eşleşmesi. */
function ap_tedarikciBul_(ad, tedKanon, tedKeys) {
  var key = ap_nrm_(ad);
  if (!key) return '';
  if (tedKanon[key]) return tedKanon[key];
  var enIyi = '', skor = 0;
  for (var i = 0; i < tedKeys.length; i++) {
    var k = tedKeys[i];
    var s = (k.indexOf(key) === 0 || key.indexOf(k) === 0) ? 0.85 : ap_benzerlik_(key, k);
    if (s > skor) { skor = s; enIyi = k; }
  }
  return skor >= 0.8 ? tedKanon[enIyi] : '';
}

function ap_benzerlik_(a, b) {
  if (a === b) return 1;
  if (!a || !b || a.length < 2 || b.length < 2) return 0;
  var say = {}, n = 0;
  for (var i = 0; i < a.length - 1; i++) { var g = a.substr(i, 2); say[g] = (say[g] || 0) + 1; }
  for (var j = 0; j < b.length - 1; j++) { var h = b.substr(j, 2); if (say[h] > 0) { say[h]--; n++; } }
  return (2 * n) / (a.length - 1 + b.length - 1);
}

// ---- CacheService (100 KB parça sınırı için parçalı JSON) ----
var AP_CACHE_SN = 600;
function ap_cacheSet_(key, obj) {
  try {
    var s = JSON.stringify(obj), parca = [], N = 90000;
    for (var i = 0; i < s.length; i += N) parca.push(s.slice(i, i + N));
    var c = CacheService.getScriptCache(), m = {};
    m['ap_' + key + '_n'] = String(parca.length);
    parca.forEach(function (p, i) { m['ap_' + key + '_' + i] = p; });
    c.putAll(m, AP_CACHE_SN);
  } catch (e) { Logger.log('cache set: ' + e); }
}
function ap_cacheGet_(key) {
  try {
    var c = CacheService.getScriptCache();
    var n = c.get('ap_' + key + '_n'); if (!n) return null;
    var keys = []; for (var i = 0; i < +n; i++) keys.push('ap_' + key + '_' + i);
    var all = c.getAll(keys), s = '';
    for (var j = 0; j < +n; j++) { if (all[keys[j]] === undefined) return null; s += all[keys[j]]; }
    return JSON.parse(s);
  } catch (e) { return null; }
}
function ap_cacheSil_(key) {
  try { var c = CacheService.getScriptCache(); var n = c.get('ap_' + key + '_n'); var keys = ['ap_' + key + '_n']; for (var i = 0; i < +(n || 0); i++) keys.push('ap_' + key + '_' + i); c.removeAll(keys); } catch (e) {}
}

function ap_no_(v) { return String(v === null || v === undefined ? '' : v).replace(/\.0$/, '').trim(); }

function ap_tarih_(v) {
  if (v instanceof Date) return v;
  var s = String(v || '').trim();
  if (!s) return new Date();
  var m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  var d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

function ap_iso_(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function ap_sayi_(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return 0;
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function ap_r2_(x) { return Math.round((Number(x) || 0) * 100) / 100; }

function ap_nrm_(s) {
  return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
    .replace(/[\s.,\-*/()'"&:;!?]/g, '');
}