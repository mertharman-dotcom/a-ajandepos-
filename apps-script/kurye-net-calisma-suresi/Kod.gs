/**
 * ============================================================
 *  BAP — KURYE MESAİ / BORDRO / PERFORMANS SİSTEMİ
 *  Dosya: "Kurye Net Çalışma Süresi" (takip tablosu)
 * ------------------------------------------------------------
 *  DÜZELTMELER (28.08.2026)
 *   1) onOpen: menüye "VERİYİ ÇEK ve TÜMÜNÜ YENİLE" eklendi.
 *      "Sadece Bordroyu Yenile" veri ÇEKMEZ, sadece çizer —
 *      adında da öyle yazıyor artık.
 *   2) kesintiDefteriCiz: döngü satır üretmiyordu, defter hep boş
 *      kalıyordu. Düzeltildi.
 *   3) erkenGerekce / kapanisGerekce iki kez tanımlıydı, teke indi.
 * ============================================================
 */

var CFG = {
  KAYNAK_HEADER_ANAHTAR: ['ham süre', 'net süre'],
  SHEET_BORDRO: 'Haftalık Bordro & Hakediş',
  SHEET_PERF: 'Kurye Performans',
  SHEET_KESINTI: 'Kesintiler',
  SHEET_BILGI: 'Kurye bilgiler',
  SHEET_KONTROL: 'Veri Kontrol',
  SHEET_DEFTER: 'Kesinti Defteri',
  VARSAYILAN: { bordro: 'Haddy Kurye', saatUcret: 235, paketUcret: 25, kdv: 0.20 },
  TREND_HAFTA: 4
};

/* ============================ MENÜ ============================ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🛵 Kurye Sistemi')
    .addItem('🔄 VERİYİ ÇEK ve TÜMÜNÜ YENİLE', 'hepsiniYenile')
    .addSeparator()
    .addItem('⚡ Tüm Sistemi Kur / Güncelle', 'kuryeSisteminiKur')
    .addItem('💰 Sadece Bordroyu Yenile (veri çekmez)', 'bordroYenile')
    .addItem('📊 Sadece Performansı Yenile (veri çekmez)', 'performansYenile')
    .addSeparator()
    .addItem('📥 HemenYolda\'dan Mesai Çek', 'mesaiCek')
    .addItem('⚙️ Kesinti Kuralını Uygula', 'kuraliUygula')
    .addItem('⏱️ Teslimat Gecikme Dökümü', 'gecikmeDokumu')
    .addSeparator()
    .addItem('📒 Kesinti Defteri (gerekçeli)', 'kesintiDefteriCalistir')
    .addItem('🔍 Veri Kontrol (hatalı satırları bul)', 'veriKontrolCalistir')
    .addItem('📥 Aktarım Dosyasından Satır Al', 'aktarimdanSatirAl')
    .addSeparator()
    .addItem('🌐 JSON Dışa Aktar (HTML panel için)', 'exportJSON')
    .addSeparator()
    .addItem('🌉 Köprü Kodunu Al (tarayıcıdan veri çek)', 'kopruKodunuAl')
    .addItem('🌉 Köprü Durumu', 'kopruDurum')
    .addItem('🧹 Bozuk Mesai Günlerini Sil (onarım)', 'mesaiBozukGunleriSil')
    .addItem('🩺 Bağlantı Teşhisi (hata alınca çalıştır)', 'hyTeshis')
    .addToUi();
}

/** Zinciri doğru sırayla çalıştırır: ham veri → kural → bordro → performans. */
function hepsiniYenile() {
  var ui = SpreadsheetApp.getUi();
  var uyari = '';
  try {
    try {
      mesaiCek(200000);
    } catch (e1) {
      var m = String(e1 && e1.message || e1);
      if (m.indexOf('GEO') > -1 || m.indexOf('VPN') > -1 || m.indexOf('403') > -1) {
        uyari = '\n\n⚠️ HemenYolda, Google sunucularından gelen isteği engelliyor ' +
                '(yurt dışı/VPN koruması). Yeni veriyi çekmek için:\n' +
                'Kurye Sistemi → 🌉 Köprü Kodunu Al → paneli aç → F12 → Console → yapıştır.\n' +
                'Aşağıdaki hesaplamalar tablodaki MEVCUT veriyle yapıldı.';
      } else {
        uyari = '\n\n⚠️ Veri çekilemedi: ' + m +
                '\nHesaplamalar mevcut veriyle yapıldı.';
      }
    }
    kuraliUygula(false);
    bordroYenile();
    performansYenile();
    kesintiDefteriCiz();
    veriKontrolCiz();
    ui.alert('✅ Bordro, performans, kesinti defteri ve veri kontrol yenilendi.' + uyari);
  } catch (e) {
    ui.alert('Hata: ' + e.message);
  }
}

function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet().getName();
  if ((sh === CFG.SHEET_BORDRO || sh === CFG.SHEET_PERF) && e.range.getA1Notation() === 'B1') {
    var hafta = String(e.range.getValue()).trim();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var b = ss.getSheetByName(CFG.SHEET_BORDRO);
    var p = ss.getSheetByName(CFG.SHEET_PERF);
    if (b) { b.getRange('B1').setValue(hafta); bordroCiz(b, hafta); }
    if (p) { p.getRange('B1').setValue(hafta); performansCiz(p, hafta); }
  }
}

/* ====================== YARDIMCI FONKSİYONLAR ====================== */

function tariheCevir(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  var s = String(v).trim().split(' ')[0];
  var p = s.split(/[.\/-]/);
  if (p.length >= 3) {
    var g = parseInt(p[0], 10), a = parseInt(p[1], 10) - 1, y = parseInt(p[2], 10);
    if (y < 100) y += 2000;
    var d = new Date(y, a, g);
    return isNaN(d.getTime()) ? null : d;
  }
  var d2 = new Date(v);
  return isNaN(d2.getTime()) ? null : new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
}

function tarihAnahtari(d) {
  var p = function (n) { return ('0' + n).slice(-2); };
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
}

function sureyeDakika(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return Math.round(v * 24 * 60);
  var s = String(v).trim();
  if (!s) return 0;
  var m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  var n = Number(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n);
}

function sayiyaCevir(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  var s = String(v).trim();
  if (!s) return 0;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  var n = Number(s);
  return isNaN(n) ? 0 : n;
}

function saateMetin(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v === 'number') {
    var tk = Math.round(v * 24 * 60) % (24 * 60);
    var p2 = function (n) { return ('0' + n).slice(-2); };
    return p2(Math.floor(tk / 60)) + ':' + p2(tk % 60);
  }
  return String(v).trim();
}

function dkMetin(dk) {
  dk = Math.max(0, Math.round(dk));
  return Math.floor(dk / 60) + ' sa ' + ('0' + (dk % 60)).slice(-2) + ' dk';
}

function dkKisa(dk) {
  dk = Math.max(0, Math.round(dk));
  return Math.floor(dk / 60) + 's ' + ('0' + (dk % 60)).slice(-2) + 'd';
}

function haftaEtiketi(girdi) {
  var d = tariheCevir(girdi);
  if (!d) return null;
  var t = new Date(d.valueOf());
  var gunNo = (d.getDay() + 6) % 7;
  t.setDate(t.getDate() - gunNo + 3);
  var ilkPersembe = t.valueOf();
  t.setMonth(0, 1);
  if (t.getDay() !== 4) t.setMonth(0, 1 + ((4 - t.getDay()) + 7) % 7);
  var haftaNo = 1 + Math.ceil((ilkPersembe - t) / 604800000);

  var pzt = new Date(d); pzt.setDate(d.getDate() - gunNo);
  var paz = new Date(pzt); paz.setDate(pzt.getDate() + 6);
  var p = function (n) { return ('0' + n).slice(-2); };
  return haftaNo + '. Hafta (' + p(pzt.getDate()) + '.' + p(pzt.getMonth() + 1) +
    ' - ' + p(paz.getDate()) + '.' + p(paz.getMonth() + 1) + ')';
}

function haftaSirala(a, b) {
  return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
}

/* ====================== KAYNAK VERİ OKUMA ====================== */

function kaynakSekme() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tercih = ss.getSheetByName('Günlük Mesai');
  if (tercih) return tercih;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var ad = sheets[i].getName();
    if (ad === CFG.SHEET_BORDRO || ad === CFG.SHEET_PERF || ad === CFG.SHEET_KONTROL || ad === CFG.SHEET_DEFTER) continue;
    var son = Math.min(sheets[i].getLastColumn(), 30);
    if (son < 3) continue;
    var basliklar = sheets[i].getRange(1, 1, 1, son).getValues()[0]
      .map(function (x) { return String(x).toLowerCase().trim(); });
    var hepsi = CFG.KAYNAK_HEADER_ANAHTAR.every(function (k) {
      return basliklar.some(function (b) { return b.indexOf(k) >= 0; });
    });
    if (hepsi) return sheets[i];
  }
  throw new Error('Kaynak sekme bulunamadı: "Ham Süre" ve "Net Süre" başlıklı bir sayfa gerekli.');
}

function basligiNormalize(x) {
  var s = String(x).toLowerCase().trim();
  return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s.replace(/̇/g, '');
}

function sutunIndeksleri(basliklar) {
  var norm = basliklar.map(basligiNormalize);
  var bul = function () {
    for (var a = 0; a < arguments.length; a++) {
      var ara = basligiNormalize(arguments[a]);
      for (var i = 0; i < norm.length; i++) {
        if (norm[i].indexOf(ara) === 0) return i;
      }
    }
    return -1;
  };
  return {
    tarih: bul('tarih'), kurye: bul('kurye'),
    plGiris: bul('planlı giriş'), giris: bul('giriş'),
    erken: bul('erken kesinti'),
    plCikis: bul('planlı çıkış'), cikis: bul('çıkış'),
    makul: bul('makul'), kapanis: bul('kapanış kesinti'),
    ham: bul('ham süre'), net: bul('net süre'),
    paket: bul('paket'), sonSiparis: bul('son sipariş'),
    durum: bul('durum'), ilkPaket: bul('ilk paket'),
    bazGiris: bul('baz giriş'), gerekce: bul('kesinti gerekçesi')
  };
}

function gunlukVeriOku() {
  var sh = kaynakSekme();
  var veri = sh.getDataRange().getDisplayValues();
  if (veri.length < 2) return [];
  var ix = sutunIndeksleri(veri[0]);
  var cikti = [];

  for (var r = 1; r < veri.length; r++) {
    var sat = veri[r];
    var ilk = String(sat[0]).trim().toUpperCase();
    if (ilk === 'ÖZET' || ilk === 'KURAL' || ilk === 'TOPLAM') break;
    var d = tariheCevir(sat[ix.tarih]);
    var kurye = String(sat[ix.kurye] || '').trim();
    if (!d || !kurye) continue;

    var hamDk = ix.ham >= 0 ? sureyeDakika(sat[ix.ham]) : 0;
    var netDk = ix.net >= 0 ? sureyeDakika(sat[ix.net]) : hamDk;
    if (!netDk && hamDk) netDk = hamDk;

    cikti.push({
      satirNo: r + 1,
      tarih: d,
      tarihKey: tarihAnahtari(d),
      hafta: haftaEtiketi(d),
      kurye: kurye,
      plGiris: ix.plGiris >= 0 ? saateMetin(sat[ix.plGiris]) : '',
      giris: ix.giris >= 0 ? saateMetin(sat[ix.giris]) : '',
      erkenDk: ix.erken >= 0 ? sayiyaCevir(sat[ix.erken]) : 0,
      plCikis: ix.plCikis >= 0 ? saateMetin(sat[ix.plCikis]) : '',
      cikis: ix.cikis >= 0 ? saateMetin(sat[ix.cikis]) : '',
      makul: ix.makul >= 0 ? saateMetin(sat[ix.makul]) : '',
      kapanisDk: ix.kapanis >= 0 ? sayiyaCevir(sat[ix.kapanis]) : 0,
      hamDk: hamDk,
      netDk: netDk,
      paket: ix.paket >= 0 ? sayiyaCevir(sat[ix.paket]) : 0,
      sonSiparis: ix.sonSiparis >= 0 ? String(sat[ix.sonSiparis] || '').trim() : '',
      durum: ix.durum >= 0 ? String(sat[ix.durum] || '').trim() : '',
      ilkPaket: ix.ilkPaket >= 0 ? saateMetin(sat[ix.ilkPaket]) : '',
      bazGiris: ix.bazGiris >= 0 ? saateMetin(sat[ix.bazGiris]) : '',
      gerekce: ix.gerekce >= 0 ? String(sat[ix.gerekce] || '').trim() : ''
    });
  }
  return cikti;
}

function tarifeOku() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SHEET_BILGI);
  var harita = {}, bordroVars = {};
  if (!sh) return { kurye: harita, bordro: bordroVars };
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    var ad = String(v[i][0] || '').trim();
    var bordro = String(v[i][1] || '').trim();
    if (!bordro) continue;
    var kayit = {
      bordro: bordro.toUpperCase().indexOf('BAP') >= 0 ? 'BAP' : 'Haddy Kurye',
      saatUcret: Number(v[i][2]) || 0,
      paketUcret: Number(v[i][3]) || 0,
      sgk: v[i][4] === true || String(v[i][4]).toUpperCase() === 'TRUE'
    };
    if (ad) harita[ad] = kayit; else bordroVars[kayit.bordro] = kayit;
  }
  return { kurye: harita, bordro: bordroVars };
}

function kuryeTarife(ad, tarife) {
  if (tarife.kurye[ad]) return tarife.kurye[ad];
  var isimler = Object.keys(tarife.kurye);
  for (var i = 0; i < isimler.length; i++) {
    var a = isimler[i];
    if (ad.toLowerCase().indexOf(a.toLowerCase()) === 0 || a.toLowerCase().indexOf(ad.toLowerCase()) === 0) {
      return tarife.kurye[a];
    }
  }
  if (tarife.bordro['Haddy Kurye']) return tarife.bordro['Haddy Kurye'];
  return CFG.VARSAYILAN;
}

function kesintiOku(hafta) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SHEET_KESINTI);
  var harita = {};
  if (!sh) return harita;
  var v = sh.getDataRange().getDisplayValues();
  for (var i = 1; i < v.length; i++) {
    var d = tariheCevir(v[i][0]);
    var kurye = String(v[i][1] || '').trim();
    if (!d || !kurye) continue;
    if (haftaEtiketi(d) !== hafta) continue;
    var tip = String(v[i][2] || '').toUpperCase();
    var dk = sayiyaCevir(v[i][3]);
    var tl = sayiyaCevir(v[i][4]);
    var aciklama = String(v[i][5] || '').trim();
    if (!harita[kurye]) harita[kurye] = { saatDk: 0, tl: 0, arti: 0, avans: 0, detay: [] };
    var yon = kesintiYonu(v[i][2]); // ham metin: toUpperCase 'Bahşiş'i 'BAHŞIŞ' yapıp eşleşmeyi bozar
    if (yon === 'iptal') continue;
    if (yon === 'arti') harita[kurye].arti += tl;          // bahşiş, eksik ödeme, ek ödeme → bordroya +
    else if (yon === 'avans') harita[kurye].avans += tl;   // avans → ödenecekten −
    else {
      if (tip.indexOf('SAAT') >= 0 || dk > 0) harita[kurye].saatDk += dk;
      if (tip.indexOf('TL') >= 0 || tl > 0) harita[kurye].tl += tl;
    }
    harita[kurye].detay.push(tarihAnahtari(d) + ': ' + (dk ? dk + ' dk ' : '') + (tl ? (yon === 'arti' ? '+' : '−') + tl + ' TL ' : '') + aciklama);
  }
  return harita;
}

// 'Kesintiler' sekmesindeki tür: TL / Saat → kesinti; Avans → ödenecekten düşer;
// Bahşiş / Eksik Ödeme / Ek Ödeme → ödenecek tutara eklenir (tutar hep artı yazılır, yönü türden gelir).
// Aynı kural bap-panel-veri-kapisi/Kod.gs › kesintiYonu_ içinde de var.
function kesintiYonu(tip) {
  var t = String(tip || '').toLocaleLowerCase('tr-TR');
  if (/^iptal/.test(t)) return 'iptal'; // panelden iptal edilen satır: "İPTAL (eski tür)"
  if (/avans/.test(t)) return 'avans';
  if (/bahşiş|bahsis|eksik ödeme|eksik odeme|ek ödeme|ek odeme/.test(t)) return 'arti';
  return 'kesinti';
}

/* ====================== ANA KURULUM ====================== */

function kuryeSisteminiKur() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var veri = gunlukVeriOku();
  if (!veri.length) { SpreadsheetApp.getUi().alert('Kaynak sekmede işlenecek satır bulunamadı.'); return; }

  if (!ss.getSheetByName(CFG.SHEET_KESINTI)) {
    var k = ss.insertSheet(CFG.SHEET_KESINTI);
    k.appendRow(['Tarih', 'Kurye Adı', 'Kesinti Tipi (Saat / TL)', 'Kesilen Süre (Dk)', 'Kesilen Tutar (TL)', 'Açıklama']);
    k.getRange('A1:F1').setBackground('#1155cc').setFontColor('#fff').setFontWeight('bold');
    k.setFrozenRows(1);
  }
  if (!ss.getSheetByName(CFG.SHEET_BILGI)) {
    var b = ss.insertSheet(CFG.SHEET_BILGI);
    b.appendRow(['Kurye Adı', 'Bordro', 'Saat ücreti', 'Paket başı ücret', 'SGK lı']);
    b.getRange('A1:E1').setBackground('#1155cc').setFontColor('#fff').setFontWeight('bold');
    b.appendRow(['Erkan', 'BAP', 255, 15, true]);
    b.appendRow(['Kenan', 'BAP', 245, 15, false]);
    b.appendRow(['Bekircan', 'BAP', 245, 15, false]);
    b.appendRow(['', 'Haddy Kurye', 235, 25, false]);
    b.setFrozenRows(1);
  }

  var haftalar = [], gorulen = {};
  veri.forEach(function (s) { if (s.hafta && !gorulen[s.hafta]) { gorulen[s.hafta] = 1; haftalar.push(s.hafta); } });
  haftalar.sort(haftaSirala);
  var secili = haftalar[haftalar.length - 1] || '';

  var kural = SpreadsheetApp.newDataValidation()
    .requireValueInList(haftalar, true).setAllowInvalid(false).build();

  var bs = ss.getSheetByName(CFG.SHEET_BORDRO) || ss.insertSheet(CFG.SHEET_BORDRO);
  bs.getRange('A1').setValue('Seçilen Hafta:').setFontWeight('bold').setFontSize(11);
  bs.getRange('B1').setValue(secili).setFontWeight('bold').setBackground('#fff2cc').setDataValidation(kural);
  bordroCiz(bs, secili);

  var ps = ss.getSheetByName(CFG.SHEET_PERF) || ss.insertSheet(CFG.SHEET_PERF);
  ps.getRange('A1').setValue('Seçilen Hafta:').setFontWeight('bold').setFontSize(11);
  ps.getRange('B1').setValue(secili).setFontWeight('bold').setBackground('#d9ead3').setDataValidation(kural);
  performansCiz(ps, secili);

  kesintiDefteriCiz();
  veriKontrolCiz();

  SpreadsheetApp.getUi().alert(
    '✅ Kurulum tamam.\n\n' +
    'Sekmeler: ' + CFG.SHEET_BORDRO + ' · ' + CFG.SHEET_PERF + ' · ' + CFG.SHEET_KONTROL + '\n' +
    'İşlenen satır: ' + veri.length + '  |  Hafta sayısı: ' + haftalar.length + '\n\n' +
    'Not: Hakediş NET süre üzerinden hesaplanır.'
  );
}

function bordroYenile() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SHEET_BORDRO);
  if (!sh) { kuryeSisteminiKur(); return; }
  bordroCiz(sh, String(sh.getRange('B1').getValue()).trim());
}

function performansYenile() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SHEET_PERF);
  if (!sh) { kuryeSisteminiKur(); return; }
  performansCiz(sh, String(sh.getRange('B1').getValue()).trim());
}

/* ====================== BORDRO TABLOSU ====================== */

function bordroCiz(sheet, hafta) {
  var veri = gunlukVeriOku().filter(function (s) { return s.hafta === hafta; });
  var tarife = tarifeOku();
  var kesintiler = kesintiOku(hafta);

  var toplu = {};
  veri.forEach(function (s) {
    if (!toplu[s.kurye]) toplu[s.kurye] = { hamDk: 0, netDk: 0, paket: 0, erken: 0, kapanis: 0, gun: {} };
    var t = toplu[s.kurye];
    t.hamDk += s.hamDk; t.netDk += s.netDk; t.paket += s.paket;
    t.erken += s.erkenDk; t.kapanis += s.kapanisDk; t.gun[s.tarihKey] = 1;
  });

  var bap = [], haddy = [];
  Object.keys(toplu).forEach(function (ad) {
    var t = toplu[ad];
    var tf = kuryeTarife(ad, tarife);
    var ek = kesintiler[ad] || { saatDk: 0, tl: 0, arti: 0, avans: 0 };
    var odenenDk = Math.max(0, t.netDk - ek.saatDk);
    var saatHak = (odenenDk / 60) * tf.saatUcret;
    var paketHak = t.paket * tf.paketUcret;
    var netHaric = Math.max(0, saatHak + paketHak - ek.tl);
    var bapMi = tf.bordro === 'BAP';
    var kdv = bapMi ? 0 : netHaric * CFG.VARSAYILAN.kdv;

    var kayit = {
      hafta: hafta, ad: ad, bordro: tf.bordro,
      gunSayisi: Object.keys(t.gun).length,
      hamStr: dkMetin(t.hamDk), netStr: dkMetin(t.netDk), odenenStr: dkMetin(odenenDk),
      mesaiKesintiDk: t.erken + t.kapanis,
      paket: t.paket, saatUcret: tf.saatUcret, paketUcret: tf.paketUcret,
      saatHak: saatHak, paketHak: paketHak,
      ekKesintiDk: ek.saatDk, ekKesintiTl: ek.tl,
      // Bahşiş / eksik ödeme / ek ödeme ve avans KDV'ye girmez: KDV'den sonra eklenir / düşülür.
      arti: ek.arti || 0, avans: ek.avans || 0,
      netHaric: netHaric, kdv: bapMi ? '-' : kdv, toplam: netHaric + kdv + (ek.arti || 0) - (ek.avans || 0),
      _hamDk: t.hamDk, _netDk: t.netDk, _odenenDk: odenenDk, _kdv: kdv, _bap: bapMi
    };
    (bapMi ? bap : haddy).push(kayit);
  });

  var trSort = function (a, b) { return a.ad.localeCompare(b.ad, 'tr'); };
  bap.sort(trSort); haddy.sort(trSort);

  sheet.getRange('A3:T200').clear();

  var basliklar = ['Hafta', 'Kurye Adı', 'Bordro', 'Gün', 'Ham Süre', 'Mesai Kesintisi (dk)',
    'Net Süre', 'Ek Kesinti (dk)', 'Ödenen Süre', 'Paket', 'Saat Ücreti', 'Paket Ücreti',
    'Saat Hakediş', 'Paket Hakediş', 'Para Kesintisi (TL)', 'Net Hakediş (KDV Hariç)',
    'Haddy %20 KDV', 'Ek Ödeme / Bahşiş (+TL)', 'Avans (−TL)', 'Toplam Ödenecek'];

  var satirlar = [basliklar], tipler = [];
  var sat = function (k) {
    return [k.hafta, k.ad, k.bordro, k.gunSayisi, k.hamStr, k.mesaiKesintiDk, k.netStr,
      k.ekKesintiDk, k.odenenStr, k.paket, k.saatUcret, k.paketUcret, k.saatHak, k.paketHak,
      k.ekKesintiTl, k.netHaric, k.kdv, k.arti, k.avans, k.toplam];
  };
  var topla = function (liste) {
    var t = { ham: 0, net: 0, odenen: 0, mk: 0, ek: 0, paket: 0, sh: 0, ph: 0, tl: 0, nh: 0, kdv: 0, arti: 0, avans: 0, top: 0, gun: 0 };
    liste.forEach(function (k) {
      t.ham += k._hamDk; t.net += k._netDk; t.odenen += k._odenenDk; t.mk += k.mesaiKesintiDk;
      t.ek += k.ekKesintiDk; t.paket += k.paket; t.sh += k.saatHak; t.ph += k.paketHak;
      t.tl += k.ekKesintiTl; t.nh += k.netHaric; t.kdv += k._kdv; t.arti += k.arti; t.avans += k.avans; t.top += k.toplam; t.gun += k.gunSayisi;
    });
    return t;
  };

  bap.forEach(function (k) { satirlar.push(sat(k)); tipler.push('veri'); });
  satirlar.push(new Array(basliklar.length).fill('')); tipler.push('bos');
  haddy.forEach(function (k) { satirlar.push(sat(k)); tipler.push('veri'); });
  satirlar.push(new Array(basliklar.length).fill('')); tipler.push('bos');

  var tb = topla(bap), th = topla(haddy);
  satirlar.push([hafta, 'BAP TOPLAMI', 'BAP', tb.gun, dkMetin(tb.ham), tb.mk, dkMetin(tb.net), tb.ek,
    dkMetin(tb.odenen), tb.paket, '-', '-', tb.sh, tb.ph, tb.tl, tb.nh, '-', tb.arti, tb.avans, tb.top]);
  tipler.push('bapTop');
  satirlar.push([hafta, 'HADDY TOPLAMI', 'Haddy Kurye', th.gun, dkMetin(th.ham), th.mk, dkMetin(th.net), th.ek,
    dkMetin(th.odenen), th.paket, '-', '-', th.sh, th.ph, th.tl, th.nh, th.kdv, th.arti, th.avans, th.top]);
  tipler.push('haddyTop');
  satirlar.push([hafta, 'GENEL TOPLAM', 'TÜMÜ', tb.gun + th.gun, dkMetin(tb.ham + th.ham), tb.mk + th.mk,
    dkMetin(tb.net + th.net), tb.ek + th.ek, dkMetin(tb.odenen + th.odenen), tb.paket + th.paket, '-', '-',
    tb.sh + th.sh, tb.ph + th.ph, tb.tl + th.tl, tb.nh + th.nh, th.kdv, tb.arti + th.arti, tb.avans + th.avans, tb.top + th.top]);
  tipler.push('genelTop');

  sheet.getRange(3, 1, satirlar.length, basliklar.length).setValues(satirlar);
  sheet.getRange(3, 1, 1, basliklar.length).setBackground('#0c343d').setFontColor('#fff').setFontWeight('bold');

  for (var i = 0; i < tipler.length; i++) {
    var r = i + 4, renk = null;
    if (tipler[i] === 'bapTop') renk = '#d9ead3';
    else if (tipler[i] === 'haddyTop') renk = '#cfe2f3';
    else if (tipler[i] === 'genelTop') renk = '#ffe599';
    if (renk) sheet.getRange(r, 1, 1, basliklar.length).setBackground(renk).setFontWeight('bold');
  }

  sheet.getRange(4, 11, satirlar.length - 1, 10).setNumberFormat('#,##0.00');
  sheet.setFrozenRows(3);
  sheet.autoResizeColumns(1, basliklar.length);
}

/* ====================== PERFORMANS TABLOSU ====================== */

function performansCiz(sheet, hafta) {
  var tumVeri = gunlukVeriOku();
  var tarife = tarifeOku();
  var bordroAdi = function (ad) { return kuryeTarife(ad, tarife).bordro; };

  var haftaSet = {}, haftalikTum = {};
  tumVeri.forEach(function (s) {
    if (!s.hafta) return;
    haftaSet[s.hafta] = 1;
    if (!haftalikTum[s.kurye]) haftalikTum[s.kurye] = {};
    if (!haftalikTum[s.kurye][s.hafta]) haftalikTum[s.kurye][s.hafta] = { paket: 0, dk: 0 };
    haftalikTum[s.kurye][s.hafta].paket += s.paket;
    haftalikTum[s.kurye][s.hafta].dk += s.netDk;
  });
  var tumHaftalar = Object.keys(haftaSet).sort(haftaSirala);
  var trendHaftalar = tumHaftalar.slice(-CFG.TREND_HAFTA);

  var perf = {}, gunHarita = {};
  tumVeri.forEach(function (s) {
    if (s.hafta !== hafta) return;
    gunHarita[s.tarihKey] = s.tarih;
    if (!perf[s.kurye]) perf[s.kurye] = { paket: 0, netDk: 0, hamDk: 0, kesinti: 0, gunler: {}, gunluk: {} };
    var p = perf[s.kurye];
    p.paket += s.paket; p.netDk += s.netDk; p.hamDk += s.hamDk;
    p.kesinti += s.erkenDk + s.kapanisDk;
    p.gunler[s.tarihKey] = 1;
    if (!p.gunluk[s.tarihKey]) p.gunluk[s.tarihKey] = { paket: 0, dk: 0, kesinti: 0 };
    p.gunluk[s.tarihKey].paket += s.paket;
    p.gunluk[s.tarihKey].dk += s.netDk;
    p.gunluk[s.tarihKey].kesinti += s.erkenDk + s.kapanisDk;
  });

  var gunKeys = Object.keys(gunHarita).sort(function (a, b) { return gunHarita[a] - gunHarita[b]; });
  var gunAdlari = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

  var liste = Object.keys(perf).map(function (ad) {
    var p = perf[ad];
    var saat = p.netDk / 60;
    return {
      ad: ad, bordro: bordroAdi(ad), paket: p.paket, netDk: p.netDk, hamDk: p.hamDk,
      kesinti: p.kesinti, gunSayisi: Object.keys(p.gunler).length,
      verim: saat > 0 ? p.paket / saat : 0, gunluk: p.gunluk
    };
  }).sort(function (a, b) { return b.paket - a.paket || b.verim - a.verim; });

  sheet.getRange('A3:AZ300').clear();
  var r = 3;

  var trendBas = ['Kurye Adı', 'Bordro'];
  trendHaftalar.forEach(function (h) {
    var kisa = h.split(' ')[0] + ' Hafta';
    trendBas.push(kisa + ' Pkt/Sa'); trendBas.push(kisa + ' Paket');
  });
  trendBas.push('Genel Trend');

  r = baslikCiz(sheet, r, '📈 SON ' + trendHaftalar.length + ' HAFTALIK PERFORMANS TRENDİ (net süre bazlı)',
    trendBas, '#4c1130', '#741b47');

  var sonHafta = tumHaftalar[tumHaftalar.length - 1];
  var trendKuryeler = Object.keys(haftalikTum).sort(function (a, b) {
    var av = (haftalikTum[a][sonHafta] || {}).paket || 0;
    var bv = (haftalikTum[b][sonHafta] || {}).paket || 0;
    return bv - av;
  });

  var trendSatir = trendKuryeler.map(function (ad) {
    var row = [ad, bordroAdi(ad)], verimler = [];
    trendHaftalar.forEach(function (h) {
      var d = haftalikTum[ad][h];
      if (d && d.dk > 0) {
        var v = d.paket / (d.dk / 60);
        verimler.push(v);
        row.push(Number(v.toFixed(2))); row.push(d.paket);
      } else { row.push('-'); row.push('-'); }
    });
    var trend = '➖ Veri yetersiz';
    if (verimler.length >= 2) {
      var fark = verimler[verimler.length - 1] - verimler[verimler.length - 2];
      var isaret = (fark >= 0 ? '+' : '') + fark.toFixed(2);
      trend = fark >= 0.15 ? '📈 Yükselişte (' + isaret + ')'
        : fark <= -0.15 ? '📉 Düşüşte (' + isaret + ')'
          : '➖ Dengeli (' + isaret + ')';
    }
    row.push(trend);
    return row;
  });
  if (trendSatir.length) { sheet.getRange(r, 1, trendSatir.length, trendBas.length).setValues(trendSatir); r += trendSatir.length; }
  r += 2;

  var gunBasliklari = gunKeys.map(function (k) {
    return gunAdlari[gunHarita[k].getDay()] + ' (' + k.substring(0, 5) + ')';
  });
  var sutunSayisi = gunBasliklari.length + 3;

  r = baslikCiz(sheet, r, '⚡ 1. GÜNLÜK SAAT BAŞI PAKET (Paket / Saat) + HAFTA ORTALAMASI',
    ['Kurye Adı', 'Bordro'].concat(gunBasliklari, ['HAFTA ORT. (Pkt/Sa)']), '#b45f06', '#e69138');
  r = tabloYaz(sheet, r, liste, gunKeys, sutunSayisi, '#fff2cc', function (g) {
    return g && g.dk > 0 ? Number((g.paket / (g.dk / 60)).toFixed(2)) : '-';
  }, function (p) { return Number(p.verim.toFixed(2)); });
  r += 2;

  r = baslikCiz(sheet, r, '⏱️ 2. GÜNLÜK NET ÇALIŞMA SÜRELERİ + HAFTA TOPLAMI',
    ['Kurye Adı', 'Bordro'].concat(gunBasliklari, ['HAFTA TOPLAM NET SÜRE']), '#134f5c', '#45818e');
  r = tabloYaz(sheet, r, liste, gunKeys, sutunSayisi, '#d9ead3', function (g) {
    return g ? dkKisa(g.dk) : '-';
  }, function (p) { return dkMetin(p.netDk); });
  r += 2;

  r = baslikCiz(sheet, r, '📦 3. GÜNLÜK PAKET SAYILARI + HAFTA TOPLAMI',
    ['Kurye Adı', 'Bordro'].concat(gunBasliklari, ['HAFTA TOPLAM PAKET']), '#274e13', '#38761d');
  r = tabloYaz(sheet, r, liste, gunKeys, sutunSayisi, '#cfe2f3', function (g) {
    return g ? g.paket : '-';
  }, function (p) { return p.paket; });
  r += 2;

  r = baslikCiz(sheet, r, '✂️ 4. GÜNLÜK MESAİ KESİNTİLERİ (dk) — erken giriş + kapanış',
    ['Kurye Adı', 'Bordro'].concat(gunBasliklari, ['HAFTA TOPLAM KESİNTİ (dk)']), '#7f6000', '#bf9000');
  r = tabloYaz(sheet, r, liste, gunKeys, sutunSayisi, '#fce5cd', function (g) {
    return g && g.kesinti ? g.kesinti : '-';
  }, function (p) { return p.kesinti; });

  sheet.setFrozenRows(3);
  sheet.autoResizeColumns(1, Math.max(sutunSayisi, trendBas.length));
}

function baslikCiz(sheet, r, baslik, sutunlar, renkKoyu, renkAcik) {
  sheet.getRange(r, 1).setValue(baslik).setFontWeight('bold').setFontColor('#fff').setBackground(renkKoyu);
  sheet.getRange(r, 1, 1, sutunlar.length).merge();
  r++;
  sheet.getRange(r, 1, 1, sutunlar.length).setValues([sutunlar])
    .setBackground(renkAcik).setFontColor('#fff').setFontWeight('bold');
  return r + 1;
}

function tabloYaz(sheet, r, liste, gunKeys, sutunSayisi, ozetRenk, hucreFn, ozetFn) {
  if (!liste.length) return r;
  var satirlar = liste.map(function (p) {
    var row = [p.ad, p.bordro];
    gunKeys.forEach(function (k) { row.push(hucreFn(p.gunluk[k])); });
    row.push(ozetFn(p));
    return row;
  });
  sheet.getRange(r, 1, satirlar.length, sutunSayisi).setValues(satirlar);
  sheet.getRange(r, sutunSayisi, satirlar.length, 1).setBackground(ozetRenk).setFontWeight('bold');
  return r + satirlar.length;
}

/* ====================== KESİNTİ DEFTERİ ====================== */

/** "Kesinti Gerekçesi" sütunundan ilgili parçayı ayıklar. */
function gerekceParcasi(s, anahtar) {
  if (!s.gerekce) return '';
  var p = s.gerekce.split('||');
  for (var i = 0; i < p.length; i++) {
    if (p[i].indexOf(anahtar) >= 0) return p[i].trim();
  }
  return '';
}

/** "Vardiya 12:00'de başlıyordu, kurye 11:46'da girdi…" */
function erkenGerekce(s) {
  var y = gerekceParcasi(s, 'Erken giriş');
  if (y) return y;
  var p = [];
  p.push('Vardiya ' + (s.plGiris || '—') + ' başlıyordu, kurye ' + (s.giris || '—') + ' giriş yaptı');
  if (s.ilkPaket) p.push('ilk paketi ' + s.ilkPaket + ' aldı');
  else p.push('o gün hiç paket almadı');
  p.push('sayılan giriş ' + (s.bazGiris || s.plGiris || '—'));
  return p.join('; ') + ' → ' + s.erkenDk + ' dk ödenmedi.';
}

/** "Vardiya 22:00'de bitiyordu, çıkış 22:12. Son sipariş 2.33 km…" */
function kapanisGerekce(s) {
  var y = gerekceParcasi(s, 'Kapanış');
  if (y) return y;
  var p = ['Vardiya ' + (s.plCikis || '—') + ' bitiyordu, çıkış ' + (s.cikis || '—')];
  if (s.sonSiparis) {
    p.push('son sipariş ' + s.sonSiparis);
    p.push('makul dönüş ' + (s.makul || '—') + ' kabul edildi');
  } else {
    p.push('kapanıştan sonra hiç sipariş yok');
  }
  return p.join('; ') + ' → ' + s.kapanisDk + ' dk ödenmedi.';
}

/**
 * DÜZELTİLDİ: eski sürümde döngü hiç satır üretmiyordu, defter hep boştu.
 */
function kesintiDefteriCiz() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SHEET_DEFTER) || ss.insertSheet(CFG.SHEET_DEFTER);
  sh.clear();

  var veri = gunlukVeriOku();
  var satirlar = [], toplam = {};

  veri.forEach(function (s) {
    if (!s.erkenDk && !s.kapanisDk) return;
    var t = toplam[s.kurye] || (toplam[s.kurye] = { erken: 0, kapanis: 0, gun: {} });
    t.gun[s.tarihKey] = 1;

    if (s.erkenDk) {
      t.erken += s.erkenDk;
      satirlar.push([s.tarihKey, s.hafta, s.kurye, 'Erken giriş', s.erkenDk,
        erkenGerekce(s),
        'Sayılan giriş = planlı giriş ile ilk paket saatinden erken olanı; fiili girişten ' +
        'önceye inmez. Aradaki fiilen çalışılan süre ödenmez.']);
    }
    if (s.kapanisDk) {
      t.kapanis += s.kapanisDk;
      satirlar.push([s.tarihKey, s.hafta, s.kurye, 'Kapanış', s.kapanisDk,
        kapanisGerekce(s),
        'Son sipariş 3 km üstüyse süreye dokunulmaz. 3 km altındaysa makul çıkış = ' +
        'restorandan çıkış + beklenen yol süresi + tolerans.']);
    }
  });

  var bas = ['Tarih', 'Hafta', 'Kurye', 'Kesinti Türü', 'Kesilen (dk)', 'Ne oldu?', 'Uygulanan kural'];
  sh.getRange(1, 1, 1, bas.length).setValues([bas])
    .setBackground('#7f6000').setFontColor('#fff').setFontWeight('bold');

  if (!satirlar.length) {
    sh.getRange(2, 1).setValue('Hiç kesinti yok — tebrikler ✅');
    sh.setFrozenRows(1);
    return 0;
  }

  satirlar.sort(function (a, b) {
    var d = tariheCevir(a[0]) - tariheCevir(b[0]);
    return d || a[2].localeCompare(b[2], 'tr');
  });

  sh.getRange(2, 1, satirlar.length, bas.length).setValues(satirlar);
  sh.getRange(2, 6, satirlar.length, 2).setWrap(true);
  sh.setColumnWidth(6, 460);
  sh.setColumnWidth(7, 300);
  sh.getRange(2, 4, satirlar.length, 1).setBackgrounds(
    satirlar.map(function (r) { return [r[3] === 'Erken giriş' ? '#fce5cd' : '#d0e0e3']; })
  );

  var r = satirlar.length + 4;
  sh.getRange(r, 1).setValue('KURYE BAZINDA TOPLAM KESİNTİ')
    .setFontWeight('bold').setFontColor('#fff').setBackground('#7f6000');
  sh.getRange(r, 1, 1, bas.length).merge();
  r++;
  var ozetBas = ['Kurye', 'Kesintili gün', 'Erken giriş (dk)', 'Kapanış (dk)', 'TOPLAM (dk)', 'TOPLAM (sa:dk)', ''];
  sh.getRange(r, 1, 1, ozetBas.length).setValues([ozetBas])
    .setBackground('#bf9000').setFontColor('#fff').setFontWeight('bold');
  r++;

  var ozet = Object.keys(toplam).map(function (ad) {
    var t = toplam[ad], top = t.erken + t.kapanis;
    return [ad, Object.keys(t.gun).length, t.erken, t.kapanis, top, dkKisa(top), ''];
  }).sort(function (a, b) { return b[4] - a[4]; });

  sh.getRange(r, 1, ozet.length, ozetBas.length).setValues(ozet);
  var gt = ozet.reduce(function (a, x) { return [a[0] + x[2], a[1] + x[3]]; }, [0, 0]);
  sh.getRange(r + ozet.length, 1, 1, ozetBas.length)
    .setValues([['GENEL TOPLAM', '', gt[0], gt[1], gt[0] + gt[1], dkKisa(gt[0] + gt[1]), '']])
    .setBackground('#ffe599').setFontWeight('bold');

  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 5);
  return satirlar.length;
}

function kesintiDefteriCalistir() {
  var n = kesintiDefteriCiz();
  SpreadsheetApp.getUi().alert(n === 0
    ? 'Hiç kesinti kaydı yok.'
    : '📒 ' + n + ' kesinti kaydı "' + CFG.SHEET_DEFTER + '" sekmesine gerekçesiyle yazıldı.');
}

/* ====================== VERİ KONTROL ====================== */

function veriKontrolCalistir() {
  var n = veriKontrolCiz();
  SpreadsheetApp.getUi().alert(n === 0
    ? '✅ Tutarsız satır bulunamadı.'
    : '⚠️ ' + n + ' şüpheli satır "' + CFG.SHEET_KONTROL + '" sekmesine yazıldı.');
}

function veriKontrolCiz() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SHEET_KONTROL) || ss.insertSheet(CFG.SHEET_KONTROL);
  sh.clear();

  var veri = gunlukVeriOku();
  var bulgular = [], sayac = {};

  veri.forEach(function (s) {
    var anahtar = s.tarihKey + '|' + s.kurye;
    sayac[anahtar] = (sayac[anahtar] || 0) + 1;

    var kesintiToplam = s.erkenDk + s.kapanisDk;
    var fark = s.hamDk - s.netDk;

    if (/kesinti$/i.test(s.durum) && kesintiToplam === 0) {
      bulgular.push([s.satirNo, s.tarihKey, s.kurye, 'Kesinti yazılmamış',
        'Durum "' + s.durum + '" diyor ama Erken/Kapanış kesinti sütunları boş']);
    }
    if (Math.abs(fark - kesintiToplam) > 1) {
      bulgular.push([s.satirNo, s.tarihKey, s.kurye, 'Ham−Net uyuşmuyor',
        'Ham−Net = ' + fark + ' dk, kesinti toplamı = ' + kesintiToplam + ' dk']);
    }
    if (s.erkenDk > 0 && s.plGiris && s.giris && s.giris > s.plGiris) {
      bulgular.push([s.satirNo, s.tarihKey, s.kurye, 'Geç girişte erken kesinti',
        'Giriş ' + s.giris + ' > planlı ' + s.plGiris + ' ama ' + s.erkenDk + ' dk erken kesinti var']);
    }
    if (s.hamDk > 0 && s.hamDk < 15) {
      bulgular.push([s.satirNo, s.tarihKey, s.kurye, 'Çok kısa vardiya',
        'Ham süre yalnızca ' + s.hamDk + ' dk — kopmuş bağlantı olabilir']);
    }
    if (!s.cikis) {
      bulgular.push([s.satirNo, s.tarihKey, s.kurye, 'Vardiya açık', 'Çıkış saati boş — gün tamamlanmamış']);
    }
    if (s.erkenDk > 120) {
      bulgular.push([s.satirNo, s.tarihKey, s.kurye, 'Aşırı erken kesinti',
        s.erkenDk + ' dk — planlı vardiya yanlış tanımlı olabilir']);
    }
  });

  Object.keys(sayac).forEach(function (k) {
    if (sayac[k] > 1) {
      var p = k.split('|');
      bulgular.push(['-', p[0], p[1], 'Mükerrer satır',
        sayac[k] + ' ayrı satır — parçalı vardiya birleştirilmemiş olabilir']);
    }
  });

  var bas = ['Satır', 'Tarih', 'Kurye', 'Sorun', 'Açıklama'];
  sh.getRange(1, 1, 1, bas.length).setValues([bas])
    .setBackground('#990000').setFontColor('#fff').setFontWeight('bold');
  if (bulgular.length) sh.getRange(2, 1, bulgular.length, bas.length).setValues(bulgular);
  else sh.getRange(2, 1).setValue('Tutarsız satır bulunamadı ✅');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, bas.length);
  return bulgular.length;
}

/* ====================== AKTARIM ====================== */

function aktarimdanSatirAl() {
  var ui = SpreadsheetApp.getUi();
  var cevap = ui.prompt('Aktarım dosyası', 'Google E-Tablo ID veya bağlantısını yapıştır:', ui.ButtonSet.OK_CANCEL);
  if (cevap.getSelectedButton() !== ui.Button.OK) return;
  var girdi = cevap.getResponseText().trim();
  var m = girdi.match(/[-\w]{25,}/);
  if (!m) { ui.alert('Geçerli bir e-tablo ID bulunamadı.'); return; }

  var kaynakSs;
  try { kaynakSs = SpreadsheetApp.openById(m[0]); }
  catch (e) { ui.alert('Dosya açılamadı: ' + e.message); return; }

  var gelen = kaynakSs.getSheets()[0].getDataRange().getValues();
  if (gelen.length < 2) { ui.alert('Aktarım dosyasında satır yok.'); return; }

  var hedef = kaynakSekme();
  var hedefVeri = hedef.getDataRange().getValues();
  var hIx = sutunIndeksleri(hedefVeri[0]);
  var gIx = sutunIndeksleri(gelen[0]);

  var mevcut = {}, sonVeriSatiri = 1;
  for (var i = 1; i < hedefVeri.length; i++) {
    var ilk = String(hedefVeri[i][0]).trim().toUpperCase();
    if (ilk === 'ÖZET' || ilk === 'KURAL') break;
    var d = tariheCevir(hedefVeri[i][hIx.tarih]);
    var k = String(hedefVeri[i][hIx.kurye] || '').trim();
    if (d && k) { mevcut[tarihAnahtari(d) + '|' + k] = i + 1; sonVeriSatiri = i + 1; }
  }

  var sutunSayisi = hedefVeri[0].length;
  var yeniler = [], guncellenen = 0;

  for (var g = 1; g < gelen.length; g++) {
    var gd = tariheCevir(gelen[g][gIx.tarih]);
    var gk = String(gelen[g][gIx.kurye] || '').trim();
    if (!gd || !gk) continue;

    var satir = new Array(sutunSayisi).fill('');
    Object.keys(hIx).forEach(function (alan) {
      if (hIx[alan] >= 0 && gIx[alan] >= 0) satir[hIx[alan]] = gelen[g][gIx[alan]];
    });

    var anahtar = tarihAnahtari(gd) + '|' + gk;
    if (mevcut[anahtar]) {
      hedef.getRange(mevcut[anahtar], 1, 1, sutunSayisi).setValues([satir]);
      guncellenen++;
    } else {
      yeniler.push(satir);
    }
  }

  if (yeniler.length) hedef.insertRowsAfter(sonVeriSatiri, yeniler.length) &&
    hedef.getRange(sonVeriSatiri + 1, 1, yeniler.length, sutunSayisi).setValues(yeniler);

  ui.alert('📥 Aktarım tamam.\nYeni satır: ' + yeniler.length + '\nGüncellenen: ' + guncellenen +
    '\n\nŞimdi "Tüm Sistemi Kur / Güncelle" çalıştır.');
}

/* ====================== JSON EXPORT ====================== */

function exportJSON() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ps = ss.getSheetByName(CFG.SHEET_PERF);
  var hafta = ps ? String(ps.getRange('B1').getValue()).trim() : '';
  var tarife = tarifeOku();

  var veri = gunlukVeriOku().filter(function (s) { return s.hafta === hafta; });
  var kur = {};
  veri.forEach(function (s) {
    if (!kur[s.kurye]) kur[s.kurye] = { paket: 0, netDk: 0, hamDk: 0, kesintiDk: 0, gunler: {} };
    var k = kur[s.kurye];
    k.paket += s.paket; k.netDk += s.netDk; k.hamDk += s.hamDk;
    k.kesintiDk += s.erkenDk + s.kapanisDk;
    k.gunler[s.tarihKey] = {
      paket: s.paket, netDk: s.netDk, hamDk: s.hamDk,
      giris: s.giris, cikis: s.cikis,
      erkenDk: s.erkenDk, kapanisDk: s.kapanisDk, durum: s.durum
    };
  });

  var cikti = {
    hafta: hafta,
    olusturma: new Date().toLocaleString('tr-TR'),
    kuryeler: Object.keys(kur).map(function (ad) {
      var k = kur[ad];
      var saat = k.netDk / 60;
      return {
        kurye: ad, bordro: kuryeTarife(ad, tarife).bordro,
        toplamPaket: k.paket, netDk: k.netDk, hamDk: k.hamDk, kesintiDk: k.kesintiDk,
        verim: saat > 0 ? Number((k.paket / saat).toFixed(2)) : 0,
        gunluk: k.gunler
      };
    }).sort(function (a, b) { return b.toplamPaket - a.toplamPaket; })
  };

  var json = JSON.stringify(cikti, null, 2);
  var html = HtmlService.createHtmlOutput(
    '<p style="font-family:sans-serif">Panel için JSON:</p>' +
    '<textarea style="width:100%;height:360px;font-family:monospace;font-size:12px">' +
    json.replace(/</g, '&lt;') + '</textarea>'
  ).setWidth(640).setHeight(460);
  SpreadsheetApp.getUi().showModalDialog(html, '🌐 Kurye Performans JSON');
}

/* ====================== TEŞHİS ====================== */

function teshis() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var r = [];
  ss.getSheets().forEach(function (sh) {
    r.push(sh.getName() + '  →  satır ' + sh.getLastRow() + ', sütun ' + sh.getLastColumn());
  });

  var k;
  try { k = kaynakSekme().getName(); } catch (e) { k = 'HATA: ' + e.message; }
  r.push('--- kaynakSekme() seçtiği sekme: ' + k);

  var t0 = Date.now();
  var v = gunlukVeriOku();
  r.push('gunlukVeriOku: ' + v.length + ' satır, ' + (Date.now() - t0) + ' ms');

  var tarihler = {};
  v.forEach(function (s) { tarihler[s.tarihKey] = 1; });
  var liste = Object.keys(tarihler).sort(function (a, b) { return tariheCevir(a) - tariheCevir(b); });
  r.push('gün aralığı: ' + (liste[0] || '-') + '  →  ' + (liste[liste.length - 1] || '-') +
         '  (' + liste.length + ' gün)');

  var erken = 0, kapanis = 0;
  v.forEach(function (s) { if (s.erkenDk) erken++; if (s.kapanisDk) kapanis++; });
  r.push('erken kesintili gün: ' + erken + ' | kapanış kesintili gün: ' + kapanis);
  if (v.length) r.push('son satır: ' + JSON.stringify(v[v.length - 1]));

  Logger.log(r.join('\n'));
}