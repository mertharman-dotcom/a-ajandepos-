// @ts-nocheck
// ==========================================
// BAP OS - TAM KOD (01.09.2026 v2 - FM raporu düzeltme + resmi tatil saatlik + hız + dashboard izin düzeltmeleri)
// ==========================================
// BU SÜRÜMDE DEĞİŞENLER (önceki sürüme ek):
//  A. FAZLA MESAİ RAPORU: Artık H/I sütunlarındaki saklı değerler yerine doğrudan
//     giriş-çıkış saatlerinden hesaplanır. (Raporlardaki yüzlerce saatlik şişme düzeltildi.)
//  B. RESMİ TATİL: Resmi_tatiller sekmesinde A VEYA B sütunundaki tarihler tanınır.
//     Tatil günü çalışana çalıştığı saat kadar EK ücret ödenir (en fazla 10 saat = 1 günlük ücret).
//  C. resmiTatilleriYenidenIsaretle(): Geçmiş kayıtlarda resmi tatil işaretini düzeltir (1 kez çalıştır).
//  D. DASHBOARD: Giriş yapan kişi artık izinli sayılmaz (Selim vakası). Vardiyası
//     "Yıllık izin"/"Ücretsiz izin" olan kişi puantaj satırı olmasa da İzinli sayacında görünür (Mehmet küçe vakası).
//  E. HIZ: Ayarlar + Vardiya sekmeleri her istekte yalnızca 1 kez okunur (bellek önbelleği).
//     Aylık trend grafiği yalnızca Bordro&Puantaj sekmesi açıkken hesaplanır.
//  F. AYRILAN PERSONEL SON GÜNÜ: Çıkış tarihi karşılaştırması artık GÜN bazında yapılır;
//     son çalışma günündeki eksik/fazla mesai artık hesaba katılır (Bahrettin vakası).
//  G. puantajDenetim(): Seçilen ay için 'Denetim_...' sekmesi oluşturur; her satırın sayılıp
//     sayılmadığını ve nedenini gösterir (mükerrer / bozuk kayıt avcısı).\n//  H. Denetimde HAM QR saati ile yazılan saat karşılaştırılır; şüpheli yuvarlamalar ⚠️ ile işaretlenir.\n//  I. ERKEN GİRİŞ KURALI GERİ EKLENDİ (kaybolmuştu): 25 dk'ya kadar erken -> vardiya saatine;\n//     25-60 dk erken -> gerçek saat + fazla mesai; 60 dk'dan fazla -> üst tam saate + uyumsuz;\n//     vardiya atanmamışsa -> en yakın tam saate. (Eşik: Ayarlar ERKEN_TEYIT_DK, varsayılan 25)
// ==========================================

var IS_GUNU_SINIR_SAAT = 6;
var SABIT_CIKIS_SAATLERI = [21, 22, 23, 24, 26];

var VARDIYALAR = {
  "11:00-21:00": ["11:00", "21:00", 10],
  "12:00-22:00": ["12:00", "22:00", 10],
  "13:00-23:00": ["13:00", "23:00", 10],
  "14:00-24:00": ["14:00", "24:00", 10],
  "16:00-02:00": ["16:00", "02:00", 10],
  "11:00-22:00": ["11:00", "22:00", 11],
  "12:00-23:00": ["12:00", "23:00", 11],
  "13:00-24:00": ["13:00", "24:00", 11],
  "11:00-23:00": ["11:00", "23:00", 12],
  "12:00-01:00": ["12:00", "01:00", 12],
  "13:00-02:00": ["13:00", "02:00", 12],
  "Off": ["", "", 0],
  "Yıllık izin": ["", "", 0],
  "Ücretsiz izin": ["", "", 0]
};

var OPTS_HAFTA_ICI = [
  "-- Seçiniz --", "11:00-21:00", "12:00-22:00", "13:00-23:00",
  "11:00-22:00", "12:00-23:00", "11:00-23:00",
  "Off", "Yıllık izin", "Ücretsiz izin"
];
var OPTS_HAFTA_SONU = [
  "-- Seçiniz --", "11:00-21:00", "12:00-22:00", "13:00-23:00", "14:00-24:00", "16:00-02:00",
  "11:00-22:00", "12:00-23:00", "13:00-24:00",
  "11:00-23:00", "12:00-01:00", "13:00-02:00",
  "Off", "Yıllık izin", "Ücretsiz izin"
];

function anaSayfa(ss) { return ss.getSheetByName("Personel_Giris_Cikis"); }

function usteEkle(sheet, satirDizisi) {
  sheet.insertRowBefore(2);
  sheet.getRange(2, 1, 1, satirDizisi.length).setValues([satirDizisi]);
  return 2;
}

function kilitAl() {
  try { var lock = LockService.getScriptLock(); lock.waitLock(25000); return lock; } catch (e) { return null; }
}
function kilitBirak(lock) { try { if (lock) lock.releaseLock(); } catch (e) {} }

function anahtarTarih(d) {
  if (!d) return "";
  var dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  return String(dt.getDate()).padStart(2, '0') + "." + String(dt.getMonth() + 1).padStart(2, '0') + "." + dt.getFullYear();
}

// Date, "dd.MM.yyyy", "dd/MM/yyyy", "yyyy-MM-dd" metnini güvenli Date'e çevirir; olmazsa null.
function parseTarih(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (v === null || v === undefined || v === "") return null;
  var s = v.toString().trim();
  if (!s) return null;
  var m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (m) { var d1 = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10)); return isNaN(d1.getTime()) ? null : d1; }
  m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) { var d2 = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)); return isNaN(d2.getTime()) ? null : d2; }
  var d3 = new Date(s);
  return isNaN(d3.getTime()) ? null : d3;
}

function haftaKey(v) {
  if (v instanceof Date) return v.getFullYear() + "-" + String(v.getMonth() + 1).padStart(2, '0') + "-" + String(v.getDate()).padStart(2, '0');
  var s = (v || "").toString().trim();
  if (!s) return "";
  var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return m[1] + "-" + String(+m[2]).padStart(2, '0') + "-" + String(+m[3]).padStart(2, '0');
  m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (m) return m[3] + "-" + String(+m[2]).padStart(2, '0') + "-" + String(+m[1]).padStart(2, '0');
  return s;
}

function haftaPazartesi(d) {
  var dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var day = dt.getDay();
  var diff = (day === 0) ? -6 : (1 - day);
  dt.setDate(dt.getDate() + diff);
  return dt;
}

function gunBasi(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function isGunuTarihi(d) {
  var r = new Date(d.getTime());
  if (r.getHours() < IS_GUNU_SINIR_SAAT) r.setDate(r.getDate() - 1);
  return gunBasi(r);
}

function saatDk(d) {
  if (!(d instanceof Date)) return "--";
  return String(d.getHours()).padStart(2, '0') + ":" + String(d.getMinutes()).padStart(2, '0');
}

function sureMetin(dk) {
  dk = Math.round(Math.abs(dk || 0));
  var sa = Math.floor(dk / 60), m = dk % 60;
  if (sa > 0 && m > 0) return sa + " sa " + m + " dk";
  if (sa > 0) return sa + " sa";
  return m + " dk";
}
function dkMetin(dk) {
  dk = Math.round(dk || 0);
  if (dk === 0) return "0 dk";
  return (dk < 0 ? "-" : "+") + sureMetin(dk);
}
function tlMetin(n) { return Math.round(n || 0).toLocaleString('tr-TR') + " ₺"; }

function htmlEsc(str) {
  return String(str === null || str === undefined ? "" : str)
    .replace(/\\/g, '&#92;').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\r?\n/g, ' ').replace(/\t/g, ' ');
}

function strToMinutesSafe(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (val instanceof Date) return (val.getHours() * 60) + val.getMinutes();
  if (typeof val === "number") { if (isNaN(val)) return 0; return Math.round(val * 24 * 60); }
  var str = val.toString().trim();
  if (!str || str === "-" || str.charAt(0) === "#" || str === "NaN") return 0;
  var neg = (str.charAt(0) === "-");
  if (neg) str = str.substring(1);
  var dk, p = str.split(":");
  if (p.length >= 2) dk = ((parseInt(p[0], 10) || 0) * 60) + (parseInt(p[1], 10) || 0) + (((parseInt(p[2], 10) || 0) >= 30) ? 1 : 0);
  else { var num = parseFloat(str.replace(",", ".")); if (isNaN(num)) return 0; dk = (num < 1) ? Math.round(num * 24 * 60) : Math.round(num * 60); }
  return neg ? -dk : dk;
}

var _AYAR_CACHE = null;
var _VARDIYA_CACHE = null;

function onbellekleriDoldur(ss) {
  try { var aySh = ss.getSheetByName("Ayarlar"); _AYAR_CACHE = aySh ? aySh.getDataRange().getValues() : null; } catch (e1) { _AYAR_CACHE = null; }
  try { var vSh = ss.getSheetByName("Vardiya"); _VARDIYA_CACHE = vSh ? vSh.getDataRange().getValues() : null; } catch (e2) { _VARDIYA_CACHE = null; }
}

function ayarAl(ss, anahtar, varsayilan) {
  try {
    var data = _AYAR_CACHE;
    if (!data) { var ayarSheet = ss.getSheetByName("Ayarlar"); if (!ayarSheet) return varsayilan; data = ayarSheet.getDataRange().getValues(); }
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim().toUpperCase() === anahtar.toUpperCase()) {
        var val = data[i][1];
        if (typeof varsayilan === "number") { var num = parseFloat(val); return isNaN(num) ? varsayilan : num; }
        return (val !== "" && val !== null && val !== undefined) ? val : varsayilan;
      }
    }
  } catch (e) {}
  return varsayilan;
}

function logEkle(ss, kullanici, islemTipi, detay, sube) {
  try {
    var logSheet = ss.getSheetByName("Islem_Loglari");
    if (!logSheet) return;
    usteEkle(logSheet, [new Date(), kullanici || "Sistem", islemTipi, detay, sube || "-"]);
    logSheet.getRange(2, 1).setNumberFormat("dd.MM.yyyy HH:mm:ss");
  } catch (e) {}
}

function personelBilgi(ss) {
  var pSheet = ss.getSheetByName("Personel");
  var liste = [];
  if (!pSheet) return liste;
  var data = pSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var ad = (data[i][0] || "").toString().trim();
    if (!ad) continue;
    var rawPin = (data[i][5] !== null && data[i][5] !== undefined) ? data[i][5].toString().trim() : "";
    if (rawPin.length > 0 && rawPin.length < 4 && !isNaN(rawPin)) rawPin = rawPin.padStart(4, '0');
    var aktiflik = data[i][4];
    var isAktif = (aktiflik === true || aktiflik === "TRUE" || aktiflik === 1 || aktiflik === "Evet");
    var istenCikis = data[i][2];
    var iseGiris = data[i][1];
    var sgkDurum = data[i][7];
    var telNo = data[i][6] || "-";
    var igDate = parseTarih(iseGiris);
    liste.push({
      ad: ad, pin: rawPin, aktif: isAktif,
      maas: parseFloat(data[i][3] || 0) || 0,
      iseGirisTarihi: igDate ? anahtarTarih(igDate) : (iseGiris ? iseGiris.toString() : "-"),
      iseGirisDate: igDate,
      cikisTarihi: parseTarih(istenCikis),
      sgk: (sgkDurum === true || sgkDurum === "TRUE" || sgkDurum === 1 || sgkDurum === "Evet"),
      telefon: telNo.toString(),
      iban: (data[i][14] || "-").toString(),
      departman: (data[i][11] || "Mutfak / Operasyon").toString(),
      yetkinlik: (data[i][15] || "Standart").toString(),
      sube: (data[i][10] || "").toString().trim(),
      pid: (data[i][9] || "").toString().trim(),
      ayrilma: (data[i][8] || "").toString(),
      rowNo: i + 1
    });
  }
  liste.sort(function (a, b) { return (b.aktif === true) - (a.aktif === true); });
  return liste;
}

function personelBul(ss, ad) {
  var l = personelBilgi(ss);
  var k = (ad || "").toString().trim().toLowerCase();
  var yedek = null;
  for (var i = 0; i < l.length; i++) {
    if (l[i].ad.toLowerCase() !== k) continue;
    if (l[i].aktif) return l[i];
    if (!yedek || l[i].rowNo > yedek.rowNo) yedek = l[i];
  }
  return yedek;
}

// Kişi hedef ay içinde en az bir gün istihdamda mıydı? (aktif VEYA o ay içinde ayrılmış dahil)
function ayIcindeCalismisMi(pers, yil, ay) {
  var ayBas = new Date(yil, ay, 1);
  var aySon = new Date(yil, ay + 1, 0);
  if (pers.iseGirisDate instanceof Date && gunBasi(pers.iseGirisDate) > aySon) return false; // o aydan sonra başlamış
  if (pers.cikisTarihi instanceof Date && gunBasi(pers.cikisTarihi) < ayBas) return false;   // o aydan önce ayrılmış
  if (!pers.aktif && !(pers.cikisTarihi instanceof Date)) return false; // pasif ama çıkış tarihi yoksa gösterme
  return true;
}

function waBildirimGonder(ss, telefon, isim, mesaj, tip) {
  try {
    var url = ayarAl(ss, "WA_WEBHOOK_URL", "");
    if (!url || url.toString().indexOf("http") !== 0) return;
    var payload = { telefon: (telefon || "").toString(), isim: (isim || "").toString(), mesaj: (mesaj || "").toString(), tip: (tip || "").toString(), zaman: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "dd.MM.yyyy HH:mm") };
    UrlFetchApp.fetch(url.toString(), { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
  } catch (e) {}
}
function waOlayBildir(ss, calisanAdi, calisanTel, yoneticiMesaj, calisanMesaj, tip) {
  var yoneticiTel = ayarAl(ss, "YONETICI_TEL", "905325550253");
  if (yoneticiMesaj) waBildirimGonder(ss, yoneticiTel, "Yönetici", yoneticiMesaj, tip);
  if (calisanMesaj && calisanTel && calisanTel !== "-") waBildirimGonder(ss, calisanTel, calisanAdi, calisanMesaj, tip);
}

// Resmi_tatiller sekmesinde A VEYA B sütunundaki tarihler tatil sayılır (metin/tarih fark etmez).
function resmiTatilMi(ss, tarih) {
  try {
    var rSheet = ss.getSheetByName("Resmi_tatiller");
    if (!rSheet) return false;
    var rData = rSheet.getDataRange().getValues();
    var tStr = anahtarTarih(tarih);
    for (var i = 1; i < rData.length; i++) {
      for (var c = 0; c < 2 && c < rData[i].length; c++) {
        var t = parseTarih(rData[i][c]);
        if (t && anahtarTarih(t) === tStr) return true;
      }
    }
  } catch (e) {}
  return false;
}

function aktifSubeBul(ss, ad) {
  try {
    var vSheet = ss.getSheetByName("Vardiya");
    if (vSheet) {
      var vData = _VARDIYA_CACHE || vSheet.getDataRange().getValues();
      for (var r = 1; r < vData.length; r++) {
        if ((vData[r][1] || "").toString().trim().toLowerCase() === ad.toLowerCase()) {
          var val = (vData[r][2] || "").toString().trim();
          if (val.indexOf("Erenköy") > -1) return "Erenköy";
          if (val.indexOf("Fikirtepe") > -1) return "Fikirtepe";
        }
      }
    }
    var p = personelBul(ss, ad);
    if (p && p.sube) return p.sube;
  } catch (e) {}
  return "Erenköy";
}

function personelGunlukVardiyaAl(ss, ad, tarih) {
  try {
    var vData = _VARDIYA_CACHE;
    if (!vData) { var vSheet = ss.getSheetByName("Vardiya"); if (!vSheet) return null; vData = vSheet.getDataRange().getValues(); }
    var hfStr = haftaKey(haftaPazartesi(tarih));
    var dayIdx = tarih.getDay();
    var colIdx = (dayIdx === 0) ? 11 : (dayIdx + 4);
    var adKey = ad.toLowerCase();
    var enSonKayit = null;
    for (var r = 1; r < vData.length; r++) {
      if ((vData[r][1] || "").toString().trim().toLowerCase() !== adKey) continue;
      enSonKayit = vData[r];
      if (haftaKey(vData[r][0]) === hfStr) return vData[r][colIdx] ? vData[r][colIdx].toString().trim() : null;
    }
    if (enSonKayit && enSonKayit[colIdx]) return enSonKayit[colIdx].toString().trim();
  } catch (e) {}
  return null;
}

function vardiyaBaslangic(ss, ad, isGunu) {
  var g = gunBasi(isGunu);
  var vTip = personelGunlukVardiyaAl(ss, ad, g);
  if (vTip && VARDIYALAR[vTip] && VARDIYALAR[vTip][0]) {
    var p = VARDIYALAR[vTip][0].split(":");
    return new Date(g.getFullYear(), g.getMonth(), g.getDate(), parseInt(p[0], 10), parseInt(p[1], 10), 0);
  }
  return null;
}
function vardiyaBitis(ss, ad, isGunu) {
  var g = gunBasi(isGunu);
  var vTip = personelGunlukVardiyaAl(ss, ad, g);
  if (vTip && VARDIYALAR[vTip] && VARDIYALAR[vTip][1]) {
    var p = VARDIYALAR[vTip][1].split(":");
    var hh = parseInt(p[0], 10), mm = parseInt(p[1], 10);
    var bit = new Date(g.getFullYear(), g.getMonth(), g.getDate(), hh, mm, 0);
    if (hh < IS_GUNU_SINIR_SAAT) bit.setDate(bit.getDate() + 1);
    return bit;
  }
  return null;
}

function tumEkipHaftalikVardiyaAl(ss, ref) {
  var liste = [];
  try {
    var vData = _VARDIYA_CACHE;
    if (!vData) { var vSheet = ss.getSheetByName("Vardiya"); if (!vSheet) return liste; vData = vSheet.getDataRange().getValues(); }
    var hfStr = haftaKey(haftaPazartesi(ref));
    for (var r = 1; r < vData.length; r++) {
      if (haftaKey(vData[r][0]) !== hfStr || !vData[r][1]) continue;
      liste.push({ ad: vData[r][1].toString().trim(), pzt: vData[r][5] || "Off", sal: vData[r][6] || "Off", car: vData[r][7] || "Off", per: vData[r][8] || "Off", cum: vData[r][9] || "Off", cmt: vData[r][10] || "Off", paz: vData[r][11] || "Off" });
    }
  } catch (e) {}
  return liste;
}

function aylikPlanlananVardiyaSaati(ss, ad, yil, ay) {
  var toplam = 0;
  try {
    var vData = _VARDIYA_CACHE;
    if (!vData) { var vSheet = ss.getSheetByName("Vardiya"); if (!vSheet) return 0; vData = vSheet.getDataRange().getValues(); }
    var adKey = ad.toLowerCase();
    for (var r = 1; r < vData.length; r++) {
      if ((vData[r][1] || "").toString().trim().toLowerCase() !== adKey) continue;
      var hk = haftaKey(vData[r][0]); if (!hk) continue;
      var pp = hk.split("-"); if (pp.length < 3) continue;
      var pzt = new Date(parseInt(pp[0], 10), parseInt(pp[1], 10) - 1, parseInt(pp[2], 10));
      if (isNaN(pzt.getTime())) continue;
      for (var g = 0; g < 7; g++) {
        var gun = new Date(pzt.getFullYear(), pzt.getMonth(), pzt.getDate() + g);
        if (gun.getFullYear() !== yil || gun.getMonth() !== ay) continue;
        var vTip = (vData[r][5 + g] || "").toString().trim();
        if (VARDIYALAR[vTip] && VARDIYALAR[vTip][2]) toplam += VARDIYALAR[vTip][2];
      }
    }
  } catch (e) {}
  return toplam;
}

// Üst tam saate yuvarlar: 10:54 -> 11:00, 12:03 -> 13:00, 11:00 -> 11:00
function ustSaateYuvarla(d) {
  var r = new Date(d.getTime());
  if (r.getMinutes() > 0 || r.getSeconds() > 0) r.setHours(r.getHours() + 1);
  r.setMinutes(0, 0, 0);
  return r;
}
// En yakın tam saate yuvarlar: 15:46 -> 16:00, 15:20 -> 15:00
function enYakinSaateYuvarla(d) {
  var r = new Date(d.getTime());
  if (r.getMinutes() >= 30) r.setHours(r.getHours() + 1);
  r.setMinutes(0, 0, 0);
  return r;
}

function sabitSaateYuvarla(now, isGunu, tolDk) {
  var g = gunBasi(isGunu);
  var dk = (now.getTime() - g.getTime()) / 60000;
  for (var i = SABIT_CIKIS_SAATLERI.length - 1; i >= 0; i--) {
    var hm = SABIT_CIKIS_SAATLERI[i] * 60;
    if (dk >= hm && (dk - hm) <= tolDk) return { saat: new Date(g.getTime() + hm * 60000), yuvarlandi: true, sabit: SABIT_CIKIS_SAATLERI[i] % 24 };
  }
  return { saat: now, yuvarlandi: false, sabit: null };
}

function girisHesapla(ss, ad, now, isGunu) {
  var GEC_TOL = ayarAl(ss, "GEC_KALMA_ICIN_SURE", 5);
  var vTip = personelGunlukVardiyaAl(ss, ad, isGunu);
  var r = { saat: now, girisNotu: "Vardiyaya Uyumlu", gunNotu: "Normal Mesai", isOff: false, vTip: vTip, erkenDk: 0, gecDk: 0, bas: null };
  if (vTip && vTip.indexOf("Off") > -1) { r.isOff = true; r.gunNotu = "Off Gününde Çalışıldı"; r.girisNotu = "Off Günü Mesai Başlangıcı (gerçek saat " + saatDk(now) + ")"; return r; }
  var bas = vardiyaBaslangic(ss, ad, isGunu);
  r.bas = bas;
  if (!bas) { r.saat = enYakinSaateYuvarla(now); r.girisNotu = "Vardiya atanmamış (En yakın saate yuvarlandı, gerçek " + saatDk(now) + ")"; return r; }
  var farkSn = (bas.getTime() - now.getTime()) / 1000;
  if (farkSn > 0) {
    r.erkenDk = Math.ceil(farkSn / 60);
    var ERKEN_TOL = ayarAl(ss, "ERKEN_TEYIT_DK", 25);
    if (r.erkenDk <= ERKEN_TOL) {
      // 25 dk'ya kadar erken: vardiya saatine yuvarla
      r.saat = bas; r.girisNotu = "Vardiyaya Uyumlu (Yuvarlandı, " + r.erkenDk + " dk erken, gerçek " + saatDk(now) + ")";
    } else if (r.erkenDk <= 60) {
      // 25-60 dk erken: GERÇEK saat yazılır, fazla mesai sayılır
      r.saat = now; r.girisNotu = "Erken giriş (Fazla Mesai, " + r.erkenDk + " dk erken)"; r.gunNotu = "Erken Mesai Girişi";
    } else {
      // 60 dk'dan fazla erken: üst tam saate yuvarla + uyumsuz
      r.saat = ustSaateYuvarla(now); r.girisNotu = "Erken giriş (Vardiya Uyumsuz, " + r.erkenDk + " dk erken, " + saatDk(ustSaateYuvarla(now)) + " yazıldı)"; r.gunNotu = "Erken Mesai Girişi / Vardiya Uyumsuz";
    }
  }
  else {
    var gec = Math.round(-farkSn / 60); r.gecDk = gec; r.saat = now;
    if (gec <= GEC_TOL) r.girisNotu = (gec === 0) ? "Vardiyaya Uyumlu" : "Vardiyaya Uyumlu (Tolerans İçi, " + gec + " dk)";
    else { r.girisNotu = "Geç girildi (" + gec + " dk geç, Vardiya Uyumsuz)"; r.gunNotu = "Vardiya Uyumsuz / Geç Giriş"; }
  }
  return r;
}

function cikisHesapla(ss, ad, now, satirTarih, offGunuMu) {
  var GEC_TOL = ayarAl(ss, "GEC_CIKIS", 25);
  var ERKEN_TOL = ayarAl(ss, "ERKEN_CIKIS_TOLERANS", 0);
  var r = { saat: now, cikisNotu: "Vardiyaya Uyumlu", beklenen: null };
  var bit = offGunuMu ? null : vardiyaBitis(ss, ad, satirTarih);
  if (!bit) {
    var sy = sabitSaateYuvarla(now, satirTarih, GEC_TOL);
    var etiket = offGunuMu ? "Off Günü Çıkışı" : "Vardiyasız Çıkış";
    r.saat = sy.saat;
    r.cikisNotu = sy.yuvarlandi ? (etiket + " (" + String(sy.sabit).padStart(2, '0') + ":00 saatine yuvarlandı, gerçek " + saatDk(now) + ")") : (etiket + " (gerçek saat)");
    return r;
  }
  r.beklenen = bit;
  var fark = Math.round((now.getTime() - bit.getTime()) / 60000);
  if (fark > GEC_TOL) { r.saat = now; r.cikisNotu = "Fazla Mesai (Geç Çıkış +" + fark + " dk)"; }
  else if (fark >= 0) { r.saat = bit; r.cikisNotu = "Çıkış Uyumlu (Yuvarlandı, gerçek " + saatDk(now) + ")"; }
  else { var erken = -fark; if (erken <= ERKEN_TOL) { r.saat = bit; r.cikisNotu = "Çıkış Uyumlu (Tolerans İçi)"; } else { r.saat = now; r.cikisNotu = "Erken Çıkış (Eksik Mesai -" + erken + " dk)"; } }
  return r;
}

function gunGenelNotuBelirle(row, girisNotu, cikisNotu) {
  var mevcut = (row[4] || "").toString();
  var offIsaret = (row[9] === 1 || row[9] === "1");
  var girisStr = (girisNotu || "").toString();
  var cikisStr = (cikisNotu || "").toString();
  var giris = row[2];
  if (offIsaret || mevcut.indexOf("Off Gününde") > -1) { if (giris instanceof Date) return "Off Gününde Çalışıldı"; return "İzinli (Off Günü)"; }
  var yillik = (row[11] === 1 || row[11] === "1" || mevcut.indexOf("Yıllık") > -1);
  var rapor = (row[12] === 1 || row[12] === "1" || mevcut.indexOf("Rapor") > -1);
  var ucretsiz = (row[13] === 1 || row[13] === "1" || mevcut.indexOf("Ücretsiz") > -1);
  var devamsiz = (row[14] === 1 || row[14] === "1");
  if (yillik) return "Yıllık İzin";
  if (devamsiz && !(giris instanceof Date)) return "Devamsızlık";
  if (rapor) return "Rapor";
  if (ucretsiz) return "Ücretsiz İzin";
  var uyumsuz = (girisStr.indexOf("Uyumsuz") > -1 || girisStr.indexOf("Geç") > -1 || cikisStr.indexOf("Eksik") > -1);
  var fazlaMesai = (cikisStr.indexOf("Fazla Mesai") > -1 || girisStr.indexOf("Erken giriş (Fazla Mesai") > -1);
  if (uyumsuz && fazlaMesai) return "Vardiya Uyumsuz + Fazla Mesai";
  if (uyumsuz) return "Vardiya Uyumsuz";
  if (fazlaMesai) return "Fazla Mesai";
  return "Normal Mesai";
}

function hiHesapla(row, normalSaat) {
  var eNot = (row[4] || "").toString();
  var gNot = (row[6] || "").toString();
  var giris = row[2], cikis = row[3];
  var offIsaret = (row[9] === 1 || row[9] === "1" || eNot.indexOf("Off Gününde") > -1);
  var izinNotlari = ["Haftalık İzin (Off)", "Devamsız", "Raporlu", "Rapor", "Yıllık İzin", "Ücretsiz İzin", "İzinli (Off Günü)", "Şüpheli"];
  var izinMi = false;
  for (var z = 0; z < izinNotlari.length; z++) { if (eNot.indexOf(izinNotlari[z]) > -1) izinMi = true; }
  if (izinMi && !offIsaret) return { h: 0, i: "" };
  if (giris instanceof Date && cikis instanceof Date) {
    var ms = cikis.getTime() - giris.getTime();
    if (ms < 0) ms += 24 * 3600 * 1000;
    var toplamGun = ms / (24 * 3600 * 1000);
    var fazlaGun = offIsaret ? toplamGun : (toplamGun - (normalSaat / 24));
    if (!offIsaret && gNot.toLowerCase().indexOf("sistem") > -1 && fazlaGun > 0) fazlaGun = 0;
    return { h: toplamGun, i: fazlaGun };
  }
  return { h: "", i: "" };
}

function formulF(sheet, satir, ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var normalSaat = ayarAl(ss, "GUNLUK_NORMAL_SAAT", 10);
  sheet.getRange(satir, 3).setNumberFormat("HH:mm:ss");
  sheet.getRange(satir, 4).setNumberFormat("HH:mm:ss");
  var row = sheet.getRange(satir, 1, 1, 18).getValues()[0];
  var hi = hiHesapla(row, normalSaat);
  var hCell = sheet.getRange(satir, 8), iCell = sheet.getRange(satir, 9);
  hCell.setValue(hi.h); iCell.setValue(hi.i);
  if (hi.h !== "" && hi.h !== 0) hCell.setNumberFormat("[h]:mm:ss");
  if (hi.i !== "") iCell.setNumberFormat("[h]:mm:ss;-[h]:mm:ss");
}

function durum(sheet, ad, now) {
  now = now || new Date();
  var isGunu = isGunuTarihi(now);
  var tStr = anahtarTarih(isGunu);
  var data = sheet.getDataRange().getValues();
  var adKey = ad.toLowerCase();
  var r = { acikSatir: -1, acikGiris: null, acikTarih: null, acikOff: false, bugunSatir: -1, bugunGiris: "--", bugunCikis: "--", bugunGirisNotu: "", bugunCikisNotu: "", sonHareketZamani: null, isGunu: isGunu };
  var SINIR_MS = 20 * 3600 * 1000;
  for (var i = 1; i < data.length; i++) {
    if ((data[i][1] || "").toString().trim().toLowerCase() !== adKey) continue;
    var gTarih = data[i][0];
    var gStr = (gTarih instanceof Date) ? anahtarTarih(gTarih) : "";
    var giris = data[i][2], cikis = data[i][3];
    var adaylar = [giris, cikis, data[i][15], data[i][16]];
    for (var a = 0; a < adaylar.length; a++) { var z = adaylar[a]; if (z instanceof Date && (now.getTime() - z.getTime()) < SINIR_MS && (!r.sonHareketZamani || z > r.sonHareketZamani)) r.sonHareketZamani = z; }
    if (gStr === tStr) {
      if (r.bugunSatir < 0) r.bugunSatir = i + 1;
      if (giris instanceof Date) { r.bugunGiris = saatDk(giris); r.bugunGirisNotu = (data[i][5] || "").toString(); }
      if (cikis instanceof Date) { r.bugunCikis = saatDk(cikis); r.bugunCikisNotu = (data[i][6] || "").toString(); }
    }
    if (r.acikSatir < 0 && (giris instanceof Date) && !(cikis instanceof Date) && (now.getTime() - giris.getTime()) < SINIR_MS) {
      r.acikSatir = i + 1; r.acikGiris = giris; r.acikTarih = (gTarih instanceof Date) ? gunBasi(gTarih) : isGunu;
      var eN = (data[i][4] || "").toString();
      r.acikOff = (data[i][9] === 1 || data[i][9] === "1" || eN.indexOf("Off Gününde") > -1);
    }
  }
  return r;
}

function bugunGirisTamam(sheet, ad, tStr) {
  var data = sheet.getDataRange().getValues();
  var adKey = ad.toLowerCase();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][1] || "").toString().trim().toLowerCase() !== adKey) continue;
    var gTarih = data[i][0];
    if (!(gTarih instanceof Date) || anahtarTarih(gTarih) !== tStr) continue;
    if ((data[i][2] instanceof Date) && (data[i][3] instanceof Date)) return true;
  }
  return false;
}

function bugunBosSatirBul(sheet, ad, tStr) {
  var data = sheet.getDataRange().getValues();
  var adKey = ad.toLowerCase();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][1] || "").toString().trim().toLowerCase() !== adKey) continue;
    var gTarih = data[i][0];
    if (!(gTarih instanceof Date) || anahtarTarih(gTarih) !== tStr) continue;
    if (data[i][2] instanceof Date) continue;
    var eN = (data[i][4] || "").toString();
    var offMu = (data[i][9] === 1 || data[i][9] === "1" || eN.indexOf("Off") > -1);
    var devamsizMi = (data[i][14] === 1 || data[i][14] === "1" || eN.indexOf("Devamsız") > -1);
    if (offMu) return { satir: i + 1, tip: "off" };
    if (devamsizMi) return { satir: i + 1, tip: "devamsiz" };
  }
  return null;
}

// AYLIK ÖZET: Toplam süre ve fazla mesai artık H/I sütunlarından DEĞİL,
// doğrudan giriş-çıkış saatlerinden hesaplanır (saklı sütun bozuk olsa bile rapor doğru çıkar).
// tatilDk: resmi tatil günlerinde çalışılan süre (gün başına en fazla normalSaat, ek ücret için).
function kisiAyOzet(gcData, ad, yil, ay, cikisTarihi, normalSaat, girisTarihi) {
  normalSaat = normalSaat || 10;
  var adKey = ad.toLowerCase();
  var gunMap = {};
  var oncelik = function (row) { return ((row[2] instanceof Date) ? 2 : 0) + ((row[3] instanceof Date) ? 1 : 0); };
  for (var r = 1; r < gcData.length; r++) {
    var row = gcData[r]; var rt = row[0];
    if (!(rt instanceof Date)) continue;
    if (rt.getFullYear() !== yil || rt.getMonth() !== ay) continue;
    if ((row[1] || "").toString().trim().toLowerCase() !== adKey) continue;
    if (cikisTarihi instanceof Date && gunBasi(rt) > gunBasi(cikisTarihi)) continue; // çıkış GÜNÜ dahil (saat farkı yüzünden son gün atlanmasın)
    if (girisTarihi instanceof Date && gunBasi(rt) < gunBasi(girisTarihi)) continue;   // işe girişten önceki satırlar sayılmaz
    var key = anahtarTarih(rt);
    if (!gunMap[key] || oncelik(row) > oncelik(gunMap[key])) gunMap[key] = row;
  }
  var o = { toplamDk: 0, fazlaDk: 0, calisilanGun: 0, offCalisilan: 0, yillik: 0, rapor: 0, ucretsiz: 0, devamsiz: 0, tatil: 0, tatilDk: 0, gec: 0, erkenCikis: 0, sistemCikis: 0 };
  for (var k in gunMap) {
    var rw = gunMap[k];
    var eNot = (rw[4] || "").toString(), fNot = (rw[5] || "").toString(), gNot = (rw[6] || "").toString();
    var girisVar = (rw[2] instanceof Date), cikisVar = (rw[3] instanceof Date);
    var off = (rw[9] === 1 || rw[9] === "1" || eNot.indexOf("Off Gününde") > -1);
    if (girisVar) o.calisilanGun++;
    var toplamDk = 0;
    if (girisVar && cikisVar) {
      var ms = rw[3].getTime() - rw[2].getTime();
      if (ms < 0) ms += 24 * 3600 * 1000;
      toplamDk = Math.round(ms / 60000);
      if (toplamDk < 0 || toplamDk >= 1440) toplamDk = 0;
      o.toplamDk += toplamDk;
      if (off) { o.offCalisilan++; o.fazlaDk += toplamDk; }
      else {
        var fm = toplamDk - (normalSaat * 60);
        if (fm > 0 && gNot.toLowerCase().indexOf("sistem") > -1) fm = 0;
        if (fm > -1440 && fm < 1440) o.fazlaDk += fm;
      }
    }
    if (rw[11] === 1 || rw[11] === "1" || eNot.indexOf("Yıllık") > -1) o.yillik++;
    if (rw[12] === 1 || rw[12] === "1" || eNot.indexOf("Rapor") > -1) o.rapor++;
    if (rw[13] === 1 || rw[13] === "1" || eNot.indexOf("Ücretsiz") > -1) o.ucretsiz++;
    if (!girisVar && (rw[14] === 1 || rw[14] === "1" || eNot.indexOf("Devamsız") > -1)) o.devamsiz++;
    var rtVal = (rw[10] || "").toString().trim();
    var tatilMi = (rw[10] === 1 || rtVal === "1" || rtVal.toLowerCase().indexOf("resmi") > -1);
    if (girisVar && tatilMi) { o.tatil++; if (toplamDk > 0) o.tatilDk += Math.min(toplamDk, normalSaat * 60); }
    if (fNot.indexOf("Geç") > -1) o.gec++;
    if (gNot.indexOf("Erken Çıkış") > -1) o.erkenCikis++;
    if (gNot.toLowerCase().indexOf("sistem") > -1) o.sistemCikis++;
  }
  return o;
}

function kisiHakedis(ss, pers, ozet, yil, ay, simdi) {
  var ayGun = new Date(yil, ay + 1, 0).getDate();
  var normalSaat = ayarAl(ss, "GUNLUK_NORMAL_SAAT", 10);
  var katsayi = ayarAl(ss, "FAZLA_MESAI_KATSAYI", 1);
  var raporEsik = ayarAl(ss, "RAPOR_KESINTI_ESIK", 3);
  var maas = pers.maas || 0;
  var gunluk = maas / ayGun;
  var saatlik = gunluk / normalSaat;
  var raporKesinti = (ozet.rapor >= raporEsik) ? ozet.rapor : 0;
  var kesintiGun = ozet.ucretsiz + ozet.devamsiz + raporKesinti;
  var ilkGun = 1, sonGun = ayGun;
  if (pers.iseGirisDate instanceof Date && pers.iseGirisDate.getFullYear() === yil && pers.iseGirisDate.getMonth() === ay) ilkGun = pers.iseGirisDate.getDate();
  if (pers.cikisTarihi instanceof Date && pers.cikisTarihi.getFullYear() === yil && pers.cikisTarihi.getMonth() === ay) sonGun = Math.min(ayGun, pers.cikisTarihi.getDate());
  var aySonuEsasGun = Math.max(0, sonGun - ilkGun + 1);
  var bugunEsasGun;
  if (yil < simdi.getFullYear() || (yil === simdi.getFullYear() && ay < simdi.getMonth())) bugunEsasGun = aySonuEsasGun;
  else if (yil === simdi.getFullYear() && ay === simdi.getMonth()) bugunEsasGun = Math.max(0, Math.min(sonGun, simdi.getDate()) - ilkGun + 1);
  else bugunEsasGun = 0;
  var fazlaKazanc = (ozet.fazlaDk / 60) * saatlik * katsayi;
  // Resmi tatil: çalışılan saat kadar EK ücret (gün başına en fazla normalSaat = 1 günlük ücret)
  var tatilKazanc = ((ozet.tatilDk || 0) / 60) * saatlik;
  var kesintiTutar = kesintiGun * gunluk;
  var normalBugun = Math.max(0, gunluk * bugunEsasGun - kesintiTutar);
  var normalAySonu = Math.max(0, gunluk * aySonuEsasGun - kesintiTutar);
  return {
    ayGun: ayGun, gunluk: gunluk, saatlik: saatlik, katsayi: katsayi,
    kesintiGun: kesintiGun, kesintiTutar: kesintiTutar, raporKesintiGun: raporKesinti,
    fazlaKazanc: fazlaKazanc, tatilKazanc: tatilKazanc, normalBugun: normalBugun, normalAySonu: normalAySonu,
    bugunNet: Math.max(0, Math.round(normalBugun + fazlaKazanc + tatilKazanc)),
    aySonuNet: Math.max(0, Math.round(normalAySonu + fazlaKazanc + tatilKazanc)),
    bugunEsasGun: bugunEsasGun, aySonuEsasGun: aySonuEsasGun
  };
}

function yeniTokenUret(ad) {
  var t = Utilities.getUuid().replace(/-/g, "").substring(0, 16);
  try { CacheService.getScriptCache().put("TK_" + t, ad.toLowerCase(), 21600); } catch (e) {}
  return t;
}
function tokenDogrulaVeTuket(ad, t) {
  if (!t) return false;
  try { var c = CacheService.getScriptCache(); var v = c.get("TK_" + t); if (!v || v !== ad.toLowerCase()) return false; c.remove("TK_" + t); return true; } catch (e) { return true; }
}

function ortakStil() {
  return '<style>body{background:#0d1117;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:20px;margin:0;box-sizing:border-box}' +
    '.card{background:#161b22;border:1px solid #30363d;border-radius:16px;padding:32px 24px;width:100%;max-width:380px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.5)}' +
    'h2{margin:0 0 10px;font-size:22px}p{color:#8b949e;font-size:14px;line-height:1.5;margin:0 0 16px}' +
    'input{width:100%;padding:14px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#fff;font-size:22px;text-align:center;letter-spacing:6px;margin:12px 0;box-sizing:border-box}' +
    'select{width:100%;padding:14px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#fff;font-size:16px;margin:12px 0;box-sizing:border-box}' +
    'button,.btn{display:block;width:100%;padding:14px;border:none;border-radius:8px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;text-decoration:none;box-sizing:border-box;margin-top:10px}' +
    '.b-blue{background:#2563eb}.b-green{background:#22a559}.b-grey{background:#21262d;color:#c9d1d9}.b-red{background:#b23b3b}' +
    '.t{font-size:12px;color:#484f58;margin-top:16px}.link{display:block;margin-top:14px;color:#58a6ff;font-size:13px;text-decoration:none}' +
    '.ozet{background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:12px;margin:12px 0;font-size:14px;color:#c9d1d9;text-align:left}' +
    '</style>';
}
function sayfaSar(baslik, icHtml) {
  var html = '<!DOCTYPE html><html lang="tr"><head><base target="_top"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    ortakStil() + '</head><body>' + icHtml + '<script>try{history.replaceState(null,"",window.location.pathname);}catch(e){}</script></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(baslik).addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);}
function msg(baslik, mesaj, renk, simdi, sureTxt, ikon) {
  var ic = '<div class="card"><div style="width:64px;height:64px;border-radius:50%;background:' + renk + ';display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px">' + (ikon || '✓') + '</div>' +
    '<h2>' + htmlEsc(baslik) + '</h2><p>' + mesaj + '</p>' + (sureTxt ? '<p style="color:#22a559;font-weight:bold">Çalışma Süresi: ' + htmlEsc(sureTxt) + '</p>' : '') +
    '<div class="t">' + anahtarTarih(simdi || new Date()) + '</div></div>';
  return sayfaSar(baslik, ic);
}
function durumOzetHtml(d) {
  return '<div class="ozet">Bugünkü durum:<br>Giriş: <b>' + htmlEsc(d.bugunGiris) + '</b> &nbsp; Çıkış: <b>' + htmlEsc(d.bugunCikis) + '</b>' +
    (d.bugunGirisNotu ? '<br><span style="font-size:12px;color:#8b949e">' + htmlEsc(d.bugunGirisNotu) + '</span>' : '') +
    (d.bugunCikisNotu ? '<br><span style="font-size:12px;color:#8b949e">' + htmlEsc(d.bugunCikisNotu) + '</span>' : '') + '</div>';
}

function secimSayfasi(ss, panel) {
  panel = panel || "";
  var pList = personelBilgi(ss).filter(function (x) { return x.aktif; });
  var base = ScriptApp.getService().getUrl();
  var opts = pList.map(function (p) { return '<option value="' + htmlEsc(p.ad) + '">' + htmlEsc(p.ad) + '</option>'; }).join("");
  var ic = '<div class="card"><h2>👤 Personel Seçimi</h2><p>' + (panel === "calisan" ? 'Bilgi paneli için ismini seç' : 'Mesai giriş/çıkışı için ismini seç') + '</p>' +
    '<form method="get" action="' + base + '" target="_top">' + (panel ? '<input type="hidden" name="panel" value="' + htmlEsc(panel) + '">' : '') +
    '<select name="ad">' + opts + '</select><button type="submit" class="b-blue">Devam Et</button></form></div>';
  return sayfaSar("BAP Personel", ic);
}

function pinEkran(ad, hatali, kod, panel) {
  panel = panel || ""; kod = kod || "";
  var base = ScriptApp.getService().getUrl();
  var tk = (panel === "calisan") ? "" : yeniTokenUret(ad);
  var ic = '<div class="card"><h2>🔒 PIN Doğrulama</h2><p><b>' + htmlEsc(ad) + '</b>, kişisel PIN kodunu gir</p>' +
    (hatali ? '<p style="color:#ff7b72">Hatalı PIN, tekrar dene!</p>' : '') +
    '<form method="get" action="' + base + '" target="_top">' +
    '<input type="hidden" name="ad" value="' + htmlEsc(ad) + '"><input type="hidden" name="kod" value="' + htmlEsc(kod) + '">' +
    (panel ? '<input type="hidden" name="panel" value="' + htmlEsc(panel) + '">' : '<input type="hidden" name="tk" value="' + htmlEsc(tk) + '">') +
    '<input type="password" inputmode="numeric" name="pin" maxlength="6" autofocus required>' +
    '<button type="submit" class="b-blue">' + (panel === "calisan" ? 'Paneli Aç' : 'Devam Et') + '</button></form>' +
    '<a href="' + base + '?ad=' + encodeURIComponent(ad) + '&kod=' + encodeURIComponent(kod) + '&islem=pinSifirlaTalep" target="_top" class="link">Şifremi Unuttum</a></div>';
  return sayfaSar("PIN Girişi", ic);
}

function ilkPinEkran(ad, kod, hata) {
  var base = ScriptApp.getService().getUrl();
  var ic = '<div class="card"><h2>🆕 İlk Giriş - PIN Oluştur</h2><p><b>' + htmlEsc(ad) + '</b>, sisteme ilk girişin. Kendine 4 haneli bir PIN belirle.</p>' +
    (hata ? '<p style="color:#ff7b72">' + htmlEsc(hata) + '</p>' : '') +
    '<form method="get" action="' + base + '" target="_top">' +
    '<input type="hidden" name="ad" value="' + htmlEsc(ad) + '"><input type="hidden" name="kod" value="' + htmlEsc(kod || "") + '"><input type="hidden" name="islem" value="ilkPinOlustur">' +
    '<input type="text" inputmode="numeric" name="yeniPin" maxlength="4" placeholder="••••" autofocus required>' +
    '<button type="submit" class="b-green">PIN Oluştur</button></form></div>';
  return sayfaSar("İlk PIN Oluştur", ic);
}

function pinSifirlaEkran(ad, telHatali, kod, hata) {
  var base = ScriptApp.getService().getUrl();
  var ic = '<div class="card"><h2>🔑 Şifremi Unuttum</h2><p><b>' + htmlEsc(ad) + '</b>, telefon numaranın <b>son 4 hanesini</b> gir, sonra yeni PIN belirle.</p>' +
    (telHatali ? '<p style="color:#ff7b72">Telefon son 4 hanesi hatalı!</p>' : '') + (hata ? '<p style="color:#ff7b72">' + htmlEsc(hata) + '</p>' : '') +
    '<form method="get" action="' + base + '" target="_top">' +
    '<input type="hidden" name="ad" value="' + htmlEsc(ad) + '"><input type="hidden" name="kod" value="' + htmlEsc(kod || "") + '"><input type="hidden" name="islem" value="pinSifirlaOnay">' +
    '<label style="display:block;text-align:left;font-size:12px;color:#8b949e">Telefon Son 4 Hane</label><input type="text" inputmode="numeric" name="tel4" maxlength="4" placeholder="••••" required>' +
    '<label style="display:block;text-align:left;font-size:12px;color:#8b949e">Yeni 4 Haneli PIN</label><input type="text" inputmode="numeric" name="yeniPin" maxlength="4" placeholder="••••" required>' +
    '<button type="submit" class="b-blue">Yeni PIN Belirle</button></form>' +
    '<a href="' + base + '?ad=' + encodeURIComponent(ad) + '&kod=' + encodeURIComponent(kod || "") + '" target="_top" class="link" style="color:#8b949e">← Geri</a></div>';
  return sayfaSar("Şifremi Unuttum", ic);
}

function cikisOnaySayfasi(ad, pin, kod, d, now) {
  var base = ScriptApp.getService().getUrl();
  var tk = yeniTokenUret(ad);
  var gecen = d.acikGiris ? sureMetin((now.getTime() - d.acikGiris.getTime()) / 60000) : "";
  var ic = '<div class="card"><h2>🚪 Çıkış Onayı</h2>' +
    '<p><b>' + htmlEsc(ad) + '</b>, bugün <b>' + saatDk(d.acikGiris) + '</b>\'de giriş yaptın' + (gecen ? ' (' + htmlEsc(gecen) + ' oldu)' : '') + '.<br>Şu an saat <b>' + saatDk(now) + '</b>.</p>' +
    '<p style="color:#fff;font-size:16px">Çıkış yapmak istiyor musun?</p>' +
    '<a class="btn b-green" target="_top" href="' + base + '?ad=' + encodeURIComponent(ad) + '&pin=' + encodeURIComponent(pin) + '&kod=' + encodeURIComponent(kod || "") + '&tk=' + encodeURIComponent(tk) + '&onay=cikis">Evet, çıkış yap</a>' +
    '<a class="btn b-grey" target="_top" href="' + base + '">Hayır, sadece kontrol ediyordum</a></div>';
  return sayfaSar("Çıkış Onayı", ic);
}

function engelSayfasi(ad, d) {
  return msg("Mesai Tamamlandı", htmlEsc(ad) + " - Bugün için giriş ve çıkışın zaten alınmış." + durumOzetHtml(d), "#9c7a1a", new Date(), null, "!");
}

function pinGate(ss, pObj, params, kod, panel) {
  var girilenPin = (params.pin || "").toString().trim();
  if (!pObj || !pObj.pin || girilenPin !== pObj.pin) return { pin: null, page: pinEkran(pObj ? pObj.ad : "", girilenPin !== "", kod, panel) };
  return { pin: girilenPin, page: null };
}

function pinGuncelle(ss, ad, yeniPin) {
  var pSheet = ss.getSheetByName("Personel");
  if (!pSheet) return false;
  var p = personelBul(ss, ad);
  if (!p) return false;
  var c = pSheet.getRange(p.rowNo, 6); c.setNumberFormat("@"); c.setValue(yeniPin.toString());
  logEkle(ss, ad, "PIN_GUNCELLENDI", "PIN kodu güncellendi/oluşturuldu (satır " + p.rowNo + ")", "-");
  return true;
}

function calisanDashboardSayfasi(ss, ad, pin, ekipHaftaStr, kod, ekipAcik) {
  kod = kod || "";
  var base = ScriptApp.getService().getUrl();
  var sheet = anaSayfa(ss);
  var now = new Date();
  var isGunu = isGunuTarihi(now);
  var ayAdlari = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  var ayAdi = ayAdlari[now.getMonth()];
  var d = durum(sheet, ad, now);
  var calisiyor = (d.acikSatir > 0);
  var vTip = personelGunlukVardiyaAl(ss, ad, isGunu);
  var bas = vardiyaBaslangic(ss, ad, isGunu), bit = vardiyaBitis(ss, ad, isGunu);
  var planGir = bas ? saatDk(bas) : "--", planCik = bit ? saatDk(bit) : "--";
  var gcData = sheet.getDataRange().getValues();
  var pObj = personelBul(ss, ad) || { maas: 0 };
  var normalSaatCal = ayarAl(ss, "GUNLUK_NORMAL_SAAT", 10);
  var ozet = kisiAyOzet(gcData, ad, now.getFullYear(), now.getMonth(), pObj.cikisTarihi, normalSaatCal, pObj.iseGirisDate);
  var hak = kisiHakedis(ss, pObj, ozet, now.getFullYear(), now.getMonth(), now);
  var planlananSaat = aylikPlanlananVardiyaSaati(ss, ad, now.getFullYear(), now.getMonth());
  var hareketler = [];
  for (var i = 1; i < gcData.length; i++) { if ((gcData[i][1] || "").toString().trim().toLowerCase() !== ad.toLowerCase()) continue; if (!(gcData[i][0] instanceof Date)) continue; hareketler.push(gcData[i]); }
  hareketler.sort(function (a, b) { return b[0].getTime() - a[0].getTime(); });
  var son10 = hareketler.slice(0, 10).map(function (r) {
    var girisD = r[2], cikisD = r[3];
    var fm = "";
    if ((girisD instanceof Date) && (cikisD instanceof Date)) {
      var ms = cikisD.getTime() - girisD.getTime();
      if (ms < 0) ms += 24 * 3600 * 1000;
      var tDk = Math.round(ms / 60000);
      if (tDk < 0 || tDk >= 1440) tDk = 0;
      var offMu = (r[9] === 1 || r[9] === "1" || (r[4] || "").toString().indexOf("Off Gününde") > -1);
      var fmDk = offMu ? tDk : (tDk - normalSaatCal * 60);
      if (!offMu && fmDk > 0 && (r[6] || "").toString().toLowerCase().indexOf("sistem") > -1) fmDk = 0;
      fm = dkMetin(fmDk);
    }
    return { tarih: anahtarTarih(r[0]), giris: (r[2] instanceof Date) ? saatDk(r[2]) : "--:--", cikis: (r[3] instanceof Date) ? saatDk(r[3]) : "--:--", not: (r[4] || "Normal").toString(), fazla: fm };
  });
  var tabloRows = son10.map(function (r) {
    return '<tr style="border-bottom:1px solid #f1f5f9;font-size:13px">' +
      '<td style="padding:10px;color:#475569">' + r.tarih + '</td>' +
      '<td style="padding:10px;font-weight:700;' + (r.giris !== "--:--" ? 'color:#16a34a' : 'color:#94a3b8') + '">' + r.giris + '</td>' +
      '<td style="padding:10px;font-weight:700;' + (r.cikis !== "--:--" ? 'color:#dc2626' : 'color:#94a3b8') + '">' + r.cikis + '</td>' +
      '<td style="padding:10px;font-weight:700;color:' + (r.fazla.charAt(0) === "-" ? '#dc2626' : '#7c3aed') + '">' + htmlEsc(r.fazla) + '</td>' +
      '<td style="padding:10px;color:#64748b"><span style="background:#f1f5f9;padding:4px 8px;border-radius:6px;font-weight:600;color:#334155">' + htmlEsc(r.not) + '</span></td></tr>';
  }).join("");
  var ekipRef = isGunu;
  if (ekipHaftaStr) { try { var _p = ekipHaftaStr.split("-"); var _d = new Date(parseInt(_p[0], 10), parseInt(_p[1], 10) - 1, parseInt(_p[2], 10)); if (!isNaN(_d.getTime())) ekipRef = _d; } catch (e) {} }
  var ekipPzt = haftaPazartesi(ekipRef);
  var ekipPaz = new Date(ekipPzt.getFullYear(), ekipPzt.getMonth(), ekipPzt.getDate() + 6);
  var ekipBaslik = anahtarTarih(ekipPzt) + " - " + anahtarTarih(ekipPaz);
  var ekipLinkTabani = base + "?ad=" + encodeURIComponent(ad) + "&pin=" + encodeURIComponent(pin) + "&kod=" + encodeURIComponent(kod) + "&panel=calisan&ekip=1&ekipHafta=";
  var ekipOnceki = haftaKey(new Date(ekipPzt.getFullYear(), ekipPzt.getMonth(), ekipPzt.getDate() - 7));
  var ekipSonraki = haftaKey(new Date(ekipPzt.getFullYear(), ekipPzt.getMonth(), ekipPzt.getDate() + 7));
  var panelLink = base + "?ad=" + encodeURIComponent(ad) + "&pin=" + encodeURIComponent(pin) + "&kod=" + encodeURIComponent(kod) + "&panel=calisan";
  var ekipRows = tumEkipHaftalikVardiyaAl(ss, ekipRef).map(function (e) {
    var isMe = e.ad.toLowerCase() === ad.toLowerCase();
    return '<tr style="' + (isMe ? 'background:#eff6ff;font-weight:700' : '') + ';border-bottom:1px solid #e2e8f0;font-size:12px">' +
      '<td style="padding:10px;color:#1e293b">' + htmlEsc(e.ad) + (isMe ? ' (Sen)' : '') + '</td>' +
      '<td style="padding:8px">' + htmlEsc(e.pzt) + '</td><td style="padding:8px">' + htmlEsc(e.sal) + '</td><td style="padding:8px">' + htmlEsc(e.car) + '</td>' +
      '<td style="padding:8px">' + htmlEsc(e.per) + '</td><td style="padding:8px">' + htmlEsc(e.cum) + '</td><td style="padding:8px">' + htmlEsc(e.cmt) + '</td><td style="padding:8px">' + htmlEsc(e.paz) + '</td></tr>';
  }).join("");
  var sonEklenenHaftaMetni = "Haftalık vardiya programı sisteme eklenmiştir.";
  try {
    var vDataD = _VARDIYA_CACHE;
    if (!vDataD) { var vSheetD = ss.getSheetByName("Vardiya"); vDataD = vSheetD ? vSheetD.getDataRange().getValues() : []; }
    var enYeni = null;
    for (var vr = 1; vr < vDataD.length; vr++) { var hk = haftaKey(vDataD[vr][0]); if (!hk) continue; var pp = hk.split("-"); if (pp.length < 3) continue; var hd = new Date(parseInt(pp[0], 10), parseInt(pp[1], 10) - 1, parseInt(pp[2], 10)); if (!isNaN(hd.getTime()) && (!enYeni || hd > enYeni)) enYeni = hd; }
    if (enYeni) sonEklenenHaftaMetni = anahtarTarih(enYeni) + " - " + anahtarTarih(new Date(enYeni.getFullYear(), enYeni.getMonth(), enYeni.getDate() + 6)) + " haftası vardiya programı sisteme eklenmiştir.";
  } catch (e) {}
  var fmRenk = ozet.fazlaDk < 0 ? '#dc2626' : '#7e22ce';
  var vardiyaMetni = (vTip && vTip.indexOf("Off") < 0) ? vTip : 'Bugün vardiyan yok (Off)';
  var html = '<!DOCTYPE html><html lang="tr"><head><base target="_top"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
    'body{background:#f8fafc;color:#1e293b;padding:16px;min-height:100vh}' +
    '.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;background:#fff;padding:14px 20px;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05);border:1px solid #e2e8f0}' +
    '.grid-top{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-bottom:16px}' +
    '.card{background:#fff;border-radius:16px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);border:1px solid #e2e8f0}' +
    '.card-title{font-size:15px;color:#475569;font-weight:700;margin-bottom:14px}' +
    '.status-badge{padding:6px 16px;border-radius:20px;font-size:13px;font-weight:700;display:inline-block}.st-active{background:#dcfce7;color:#15803d}.st-off{background:#f1f5f9;color:#64748b}' +
    '.time-boxes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}.t-box{background:#f8fafc;padding:12px;border-radius:12px;text-align:center}.t-lbl{font-size:12px;color:#64748b;margin-bottom:4px}.t-val{font-size:18px;font-weight:800;color:#0f172a}' +
    '.v-box{background:#eff6ff;padding:16px;border-radius:12px;color:#1d4ed8;font-size:20px;font-weight:800;text-align:center;margin-bottom:14px}' +
    '.v-link{display:block;text-align:center;padding:12px;background:#f1f5f9;color:#2563eb;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;margin-top:14px}' +
    '.grid-4{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:16px}.stat-card{padding:16px;border-radius:16px;border:1px solid rgba(0,0,0,0.05)}' +
    '.sc-plan{background:#f0f9ff;color:#0369a1}.sc-gercek{background:#f0fdf4;color:#15803d}.sc-fazla{background:#faf5ff;color:#7e22ce}.sc-maas{background:#f0fdfa;color:#0f766e}.sc-tahmin{background:#fefce8;color:#a16207}.sc-val{font-size:20px;font-weight:800;margin-top:6px}' +
    '.grid-5{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px}.p-card{padding:14px;border-radius:12px;text-align:center}' +
    '.pc-yil{background:#e0f2fe;color:#0369a1}.pc-ucr{background:#fef3c7;color:#b45309}.pc-rap{background:#ffe4e6;color:#be123c}.pc-gec{background:#fee2e2;color:#b91c1c}.pc-tat{background:#f3e8ff;color:#6b21a8}.pc-dev{background:#fee2e2;color:#991b1b}' +
    '.grid-bottom{display:grid;grid-template-columns:2fr 1fr 1fr;gap:16px}@media(max-width:1024px){.grid-bottom{grid-template-columns:1fr}}' +
    'input,select,textarea{width:100%;padding:10px;margin-top:6px;margin-bottom:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px}button.form-btn{width:100%;padding:12px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer}' +
    '.modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);display:' + (ekipAcik ? 'flex' : 'none') + ';align-items:center;justify-content:center;z-index:999;padding:16px}' +
    '.modal-card{background:#fff;border-radius:16px;padding:20px;width:100%;max-width:900px;max-height:85vh;overflow-y:auto}.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid #e2e8f0;padding-bottom:12px}' +
    '.close-btn{background:#f1f5f9;border:none;width:32px;height:32px;border-radius:50%;font-weight:800;text-decoration:none;color:#0f172a;display:flex;align-items:center;justify-content:center}</style></head><body>' +
    '<div class="header"><div><h2 style="font-size:20px;font-weight:800;color:#0f172a">Merhaba, ' + htmlEsc(ad) + ' 👋</h2><p style="font-size:13px;color:#64748b;margin-top:2px">' + anahtarTarih(isGunu) + '</p></div>' +
    '<a href="' + base + '?panel=calisan" target="_top" style="font-size:13px;color:#ef4444;font-weight:700;text-decoration:none;background:#fef2f2;padding:8px 16px;border-radius:8px">Çıkış Yap</a></div>' +
    '<div class="grid-top"><div class="card"><div class="card-title">Mesai İşlemleri</div>' +
    '<div style="text-align:center"><div style="font-size:12px;color:#64748b">Bugünkü Durumun</div><div class="status-badge ' + (calisiyor ? 'st-active' : 'st-off') + '" style="margin-top:6px">' + (calisiyor ? '🟢 Çalışıyor' : '⚪ Çalışmıyor') + '</div></div>' +
    '<div class="time-boxes"><div class="t-box"><div class="t-lbl">Giriş Saati</div><div class="t-val">' + htmlEsc(d.bugunGiris) + '</div></div><div class="t-box"><div class="t-lbl">Çıkış Saati</div><div class="t-val">' + htmlEsc(d.bugunCikis) + '</div></div></div>' +
    (d.bugunGirisNotu ? '<div style="font-size:12px;color:#64748b;text-align:center;margin-bottom:10px">' + htmlEsc(d.bugunGirisNotu) + (d.bugunCikisNotu ? ' · ' + htmlEsc(d.bugunCikisNotu) : '') + '</div>' : '') +
    '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px;text-align:center;color:#1e40af;font-size:13px;font-weight:600">📷 Giriş/çıkış için dükkândaki <b>QR kodu okut</b>. Bu ekran sadece bilgi görüntüler.</div></div>' +
    '<div class="card"><div class="card-title">Bugünkü Vardiyam</div><div class="v-box">' + htmlEsc(vardiyaMetni) + '</div>' +
    '<div style="font-size:13px;color:#64748b;display:flex;justify-content:space-between;margin-bottom:8px"><span>⏱️ Planlanan Giriş:</span><b>' + planGir + '</b></div>' +
    '<div style="font-size:13px;color:#64748b;display:flex;justify-content:space-between;margin-bottom:8px"><span>⏱️ Planlanan Çıkış:</span><b>' + planCik + '</b></div>' +
    '<a href="' + ekipLinkTabani + haftaKey(ekipPzt) + '" target="_top" class="v-link">📅 Tüm Ekip Haftalık Vardiyasını Göster ›</a></div></div>' +
    '<div class="grid-4">' +
    '<div class="stat-card sc-plan"><div style="font-size:12px;font-weight:700">' + ayAdi + ' — Planlanan</div><div class="sc-val">' + planlananSaat + ' sa</div><div style="font-size:11px;margin-top:4px">Vardiya planından</div></div>' +
    '<div class="stat-card sc-gercek"><div style="font-size:12px;font-weight:700">' + ayAdi + ' — Gerçekleşen</div><div class="sc-val">' + sureMetin(ozet.toplamDk) + '</div><div style="font-size:11px;margin-top:4px">' + ozet.calisilanGun + ' gün çalışıldı</div></div>' +
    '<div class="stat-card sc-fazla" style="color:' + fmRenk + '"><div style="font-size:12px;font-weight:700">Fazla Mesai (Net)</div><div class="sc-val">' + dkMetin(ozet.fazlaDk) + '</div><div style="font-size:11px;margin-top:4px">Artı ve eksi netleşmiş · ' + tlMetin(hak.fazlaKazanc) + '</div></div>' +
    '<div class="stat-card sc-maas"><div style="font-size:12px;font-weight:700">Şu Ana Kadar Hak Edilen</div><div class="sc-val">' + tlMetin(hak.bugunNet) + '</div><div style="font-size:11px;margin-top:4px">' + hak.bugunEsasGun + ' gün üzerinden</div></div>' +
    '<div class="stat-card sc-tahmin"><div style="font-size:12px;font-weight:700">Ay Sonu Tahmini</div><div class="sc-val">' + tlMetin(hak.aySonuNet) + '</div><div style="font-size:11px;margin-top:4px">Kalan günler tam çalışılırsa</div></div></div>' +
    '<div class="grid-5">' +
    '<div class="p-card pc-yil"><div style="font-size:20px;font-weight:800">' + ozet.yillik + '</div><div style="font-size:11px;font-weight:700">Yıllık İzin</div></div>' +
    '<div class="p-card pc-ucr"><div style="font-size:20px;font-weight:800">' + ozet.ucretsiz + '</div><div style="font-size:11px;font-weight:700">Ücretsiz İzin</div></div>' +
    '<div class="p-card pc-rap"><div style="font-size:20px;font-weight:800">' + ozet.rapor + '</div><div style="font-size:11px;font-weight:700">Rapor</div></div>' +
    '<div class="p-card pc-dev"><div style="font-size:20px;font-weight:800">' + ozet.devamsiz + '</div><div style="font-size:11px;font-weight:700">Devamsız</div></div>' +
    '<div class="p-card pc-gec"><div style="font-size:20px;font-weight:800">' + ozet.gec + '</div><div style="font-size:11px;font-weight:700">Geç Kalınan</div></div>' +
    '<div class="p-card pc-tat"><div style="font-size:20px;font-weight:800">' + ozet.tatil + '</div><div style="font-size:11px;font-weight:700">Resmi Tatil Çalışılan</div></div></div>' +
    '<div class="grid-bottom"><div class="card"><div class="card-title">Son Hareketler (Son 10 Gün)</div>' +
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr style="border-bottom:2px solid #e2e8f0;font-size:12px;color:#64748b"><th style="padding:8px">Tarih</th><th style="padding:8px">Giriş</th><th style="padding:8px">Çıkış</th><th style="padding:8px">Fazla/Eksik</th><th style="padding:8px">Durum</th></tr></thead>' +
    '<tbody>' + (tabloRows || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#94a3b8">Kayıt bulunamadı.</td></tr>') + '</tbody></table></div></div>' +
    '<div class="card"><div class="card-title">📢 Duyuru & Bildiriler</div>' +
    '<div style="background:#f8fafc;padding:12px;border-radius:8px;border-left:4px solid #2563eb;margin-bottom:10px"><strong style="font-size:13px;color:#1e293b">Vardiya Yayınlandı</strong><p style="font-size:12px;color:#64748b;margin-top:4px">' + htmlEsc(sonEklenenHaftaMetni) + '</p></div>' +
    '<div style="background:#f8fafc;padding:12px;border-radius:8px;border-left:4px solid #16a34a"><strong style="font-size:13px;color:#1e293b">Mesai Kuralları</strong><p style="font-size:12px;color:#64748b;margin-top:4px">25 dakikaya kadar erken geliş vardiya saatine yuvarlanır; 25-60 dk erken geliş gerçek saatle yazılır ve fazla mesai sayılır; 1 saatten fazla erken geliş üst tam saate yuvarlanır. Vardiya bitişinden sonraki 25 dk bitişe yuvarlanır; daha geç kalırsan gerçek saat yazılır.</p></div></div>' +
    '<div class="card"><div class="card-title">📝 İzin & Rapor Girişi</div><form method="get" action="' + base + '" target="_top">' +
    '<input type="hidden" name="ad" value="' + htmlEsc(ad) + '"><input type="hidden" name="pin" value="' + htmlEsc(pin) + '"><input type="hidden" name="kod" value="' + htmlEsc(kod) + '"><input type="hidden" name="panel" value="calisan"><input type="hidden" name="islem" value="izinEkle">' +
    '<label style="font-size:12px;color:#64748b;font-weight:700">Talep Tipi</label><select name="tTip"><option>Yıllık İzin</option><option>Ücretsiz İzin</option><option>Rapor</option></select>' +
    '<label style="font-size:12px;color:#64748b;font-weight:700">Başlangıç Tarihi</label><input type="date" name="tBas" required>' +
    '<label style="font-size:12px;color:#64748b;font-weight:700">Bitiş Tarihi</label><input type="date" name="tBit" required>' +
    '<label style="font-size:12px;color:#64748b;font-weight:700">Açıklama / Sebep</label><textarea name="tAck" rows="2" placeholder="Neden belirtiniz..."></textarea>' +
    '<button type="submit" class="form-btn">Talebi Kaydet</button></form></div></div>' +
    '<div class="modal-overlay"><div class="modal-card"><div class="modal-header"><h3 style="font-size:16px;color:#0f172a">📅 Ekip Haftalık Vardiya Programı</h3><a href="' + panelLink + '" target="_top" class="close-btn">✕</a></div>' +
    '<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:4px 0 14px">' +
    '<a href="' + ekipLinkTabani + ekipOnceki + '" target="_top" style="text-decoration:none;background:#f1f5f9;color:#334155;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:700">‹ Önceki</a>' +
    '<span style="font-size:13px;font-weight:800;color:#0f172a;min-width:160px;text-align:center">' + ekipBaslik + '</span>' +
    '<a href="' + ekipLinkTabani + ekipSonraki + '" target="_top" style="text-decoration:none;background:#f1f5f9;color:#334155;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:700">Sonraki ›</a></div>' +
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;text-align:center"><thead><tr style="background:#f8fafc;font-size:12px;color:#64748b;border-bottom:2px solid #e2e8f0"><th style="padding:10px;text-align:left">Personel</th><th>Pzt</th><th>Sal</th><th>Çar</th><th>Per</th><th>Cum</th><th>Cmt</th><th>Paz</th></tr></thead>' +
    '<tbody>' + (ekipRows || '<tr><td colspan="8" style="padding:20px">Bu hafta için vardiya kaydı bulunamadı.</td></tr>') + '</tbody></table></div></div></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle("BAP Personel Paneli").addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);}

// ==========================================
// YÖNETİCİ KONSOLU
// ==========================================
function yoneticiHub(ss, sheet, secilenHaftaStr, secilenAyStr, secilenSekme, secilenPid, secilenGrafik) {
  secilenSekme = secilenSekme || "dash";
  secilenGrafik = secilenGrafik || "toplam";
  var base = ScriptApp.getService().getUrl();
  var pList = personelBilgi(ss);
  var now = new Date();
  var isGunu = isGunuTarihi(now);
  var tz = ss.getSpreadsheetTimeZone();
  var normalSaatGenel = ayarAl(ss, "GUNLUK_NORMAL_SAAT", 10);
  var hedefYil = now.getFullYear(), hedefAy = now.getMonth();
  if (secilenAyStr) { var ap = secilenAyStr.split("-"); if (ap.length === 2) { hedefYil = parseInt(ap[0], 10); hedefAy = parseInt(ap[1], 10) - 1; } }
  var secilenAyVal = hedefYil + "-" + String(hedefAy + 1).padStart(2, '0');
  var ayAdlariTr = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  var secilenAyBaslikStr = ayAdlariTr[hedefAy] + " " + hedefYil;
  var tStr = anahtarTarih(isGunu);
  var aktifPersonelSayisi = pList.filter(function (p) { return p.aktif; }).length;
  var hedefPazartesi = haftaPazartesi(now);
  if (secilenHaftaStr) { var parts = secilenHaftaStr.split("-"); if (parts.length === 3) { var hp = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)); if (!isNaN(hp.getTime())) hedefPazartesi = haftaPazartesi(hp); } }
  var hedefPazar = new Date(hedefPazartesi.getFullYear(), hedefPazartesi.getMonth(), hedefPazartesi.getDate() + 6);
  var oncekiStr = haftaKey(new Date(hedefPazartesi.getFullYear(), hedefPazartesi.getMonth(), hedefPazartesi.getDate() - 7));
  var sonrakiStr = haftaKey(new Date(hedefPazartesi.getFullYear(), hedefPazartesi.getMonth(), hedefPazartesi.getDate() + 7));
  var hfBaslik = anahtarTarih(hedefPazartesi) + " - " + anahtarTarih(hedefPazar);
  var hfStrKey = haftaKey(hedefPazartesi);
  var vData = _VARDIYA_CACHE;
  if (!vData) { var vSheet0 = ss.getSheetByName("Vardiya"); vData = vSheet0 ? vSheet0.getDataRange().getValues() : []; }
  var kayitliVardiyalarMap = {};
  for (var r = 1; r < vData.length; r++) { if (haftaKey(vData[r][0]) === hfStrKey && vData[r][1]) kayitliVardiyalarMap[vData[r][1].toString().trim().toLowerCase()] = [vData[r][5] || "", vData[r][6] || "", vData[r][7] || "", vData[r][8] || "", vData[r][9] || "", vData[r][10] || "", vData[r][11] || ""]; }
  var gcData = sheet.getDataRange().getValues();
  // Bugünün kayıtları: kişi başına TEK kayıt tutulur (girişli kayıt önceliklidir).
  var bugunGirisMap = {};
  for (var bk = 1; bk < gcData.length; bk++) {
    var bt = gcData[bk][0]; if (!(bt instanceof Date) || anahtarTarih(bt) !== tStr) continue;
    var bAd = (gcData[bk][1] || "").toString().trim(); if (!bAd) continue;
    var kayit = { ad: bAd, giris: gcData[bk][2], cikis: gcData[bk][3], eNot: (gcData[bk][4] || "").toString(), girisNotu: (gcData[bk][5] || "").toString(), cikisNotu: (gcData[bk][6] || "").toString() };
    var onceki = bugunGirisMap[bAd.toLowerCase()];
    if (!onceki || (kayit.giris instanceof Date && !(onceki.giris instanceof Date))) bugunGirisMap[bAd.toLowerCase()] = kayit;
  }
  // Sayaçlar kişi bazlı hesaplanır: GİRİŞ YAPAN KİŞİ İZİNLİ/DEVAMSIZ SAYILMAZ.
  var calisanSayisi = 0, bugunIzinliSayisi = 0, devamsizSayisi = 0, gecKalanSayisi = 0;
  var bugunIzinliAdlari = [], bugunDevamsizAdlari = [], gecKalanlarListesi = [], bugunIzinliListesi = {};
  for (var mk in bugunGirisMap) {
    var kk = bugunGirisMap[mk];
    if (kk.giris instanceof Date) {
      if (!(kk.cikis instanceof Date)) calisanSayisi++;
      if (kk.girisNotu.indexOf("Geç") > -1) { gecKalanSayisi++; gecKalanlarListesi.push({ ad: kk.ad, saat: saatDk(kk.giris) }); }
    } else {
      if (kk.eNot.indexOf("İzin") > -1 || kk.eNot.indexOf("Rapor") > -1) { bugunIzinliSayisi++; bugunIzinliListesi[kk.ad] = kk.eNot; if (bugunIzinliAdlari.indexOf(kk.ad) < 0) bugunIzinliAdlari.push(kk.ad); }
      else if (kk.eNot.indexOf("Devamsız") > -1) { devamsizSayisi++; if (bugunDevamsizAdlari.indexOf(kk.ad) < 0) bugunDevamsizAdlari.push(kk.ad); }
    }
  }
  var oAyGunBugun = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  var bugunGiderToplam = 0, bugunGiderKisi = 0, anlikDurumRows = "";
  var anlikListe = pList.filter(function (p) { return p.aktif; }).sort(function (a, b) { var sa = (a.sube || "").toLowerCase(), sb = (b.sube || "").toLowerCase(); if (sa < sb) return -1; if (sa > sb) return 1; return (a.ad || "").localeCompare((b.ad || ""), "tr"); });
  anlikListe.forEach(function (p) {
    if (p.iseGirisDate instanceof Date && gunBasi(p.iseGirisDate) > isGunu) return;
    var vTip = null; try { vTip = personelGunlukVardiyaAl(ss, p.ad, isGunu); } catch (e) {}
    if (vTip && vTip !== "Off" && vTip !== "Yıllık izin" && vTip !== "Ücretsiz izin") { bugunGiderToplam += (p.maas || 0) / oAyGunBugun; bugunGiderKisi++; }
    var kayit = bugunGirisMap[p.ad.toLowerCase()];
    // Vardiya planında izinli görünen ve bugün giriş yapmamış kişiler İzinli sayacına da eklenir (Mehmet küçe vakası).
    if ((vTip === "Yıllık izin" || vTip === "Ücretsiz izin") && (!kayit || !(kayit.giris instanceof Date))) {
      if (bugunIzinliAdlari.indexOf(p.ad) < 0) { bugunIzinliSayisi++; bugunIzinliAdlari.push(p.ad); bugunIzinliListesi[p.ad] = vTip; }
    }
    if (!vTip && !kayit) return;
    var vardiyaStr = vTip || "-", girisStr = "--", cikisStr = "--", durumStr = vardiyaStr, girisUyum = "", cikisUyum = "";
    if (kayit) {
      if (kayit.giris instanceof Date) girisStr = saatDk(kayit.giris);
      if (kayit.cikis instanceof Date) cikisStr = saatDk(kayit.cikis);
      durumStr = kayit.eNot || vardiyaStr;
      if (kayit.girisNotu.indexOf("Geç") > -1) girisUyum = "⚠️"; else if (kayit.giris instanceof Date) girisUyum = "✓";
      if (kayit.cikisNotu.indexOf("Fazla") > -1 || kayit.cikisNotu.indexOf("Eksik") > -1 || kayit.cikisNotu.toLowerCase().indexOf("sistem") > -1) cikisUyum = "⚠️"; else if (kayit.cikis instanceof Date) cikisUyum = "✓";
    }
    var durumRenk = (vTip === "Off") ? "#ca8a04" : ((durumStr.indexOf("Uyumsuz") > -1 || durumStr.indexOf("Devamsız") > -1) ? "#dc2626" : "#16a34a");
    anlikDurumRows += '<tr style="border-bottom:1px solid #f1f5f9;font-size:12px"><td style="padding:8px;font-weight:700;color:#0f172a">' + htmlEsc(p.ad) + '</td><td style="padding:8px;color:#64748b">' + htmlEsc(vardiyaStr) + '</td><td style="padding:8px;color:#334155">' + girisStr + ' ' + girisUyum + '</td><td style="padding:8px;color:#334155">' + cikisStr + ' ' + cikisUyum + '</td><td style="padding:8px;color:' + durumRenk + ';font-weight:600">' + htmlEsc(durumStr) + '</td></tr>';
  });
  bugunGiderToplam = Math.round(bugunGiderToplam);
  if (!anlikDurumRows) anlikDurumRows = '<tr><td colspan="5" style="padding:12px;text-align:center;color:#94a3b8">Bugün vardiyası olan personel yok.</td></tr>';
  var toplamPersonelButcesi = 0;
  for (var i2 = 0; i2 < pList.length; i2++) { if (pList[i2].aktif) toplamPersonelButcesi += pList[i2].maas; }
  var SGK_BRUT = 33030, SGK_ISVEREN_ORAN = 0.2175, ISSIZLIK_ISVEREN_ORAN = 0.02;
  var kisiBasiSgkGider = SGK_BRUT * (SGK_ISVEREN_ORAN + ISSIZLIK_ISVEREN_ORAN);
  var sgkliSayisi = 0, toplamSgkGider = 0;
  for (var spi = 0; spi < pList.length; spi++) { var sp = pList[spi]; if (!(sp.aktif && sp.sgk)) continue; sgkliSayisi++; var sgkGun = 30; if (sp.iseGirisDate instanceof Date && sp.iseGirisDate.getFullYear() === hedefYil && sp.iseGirisDate.getMonth() === hedefAy) sgkGun = Math.max(0, Math.min(30, 30 - sp.iseGirisDate.getDate())); toplamSgkGider += kisiBasiSgkGider * (sgkGun / 30); }
  toplamSgkGider = Math.round(toplamSgkGider);
  var asgariUcretTutar = 28075.50;
  var toplamNormalBugun = 0, toplamFazla = 0, toplamTatil = 0, toplamBugunNet = 0, toplamAySonuNet = 0;
  var tablo = []; var odemeMap = odemeleriOku(ss, hedefYil, hedefAy);
  for (var pi = 0; pi < pList.length; pi++) {
    var pers = pList[pi];
    if (!ayIcindeCalismisMi(pers, hedefYil, hedefAy)) continue; // aktif VEYA o ay çalışıp ayrılan
    var ozet = kisiAyOzet(gcData, pers.ad, hedefYil, hedefAy, pers.cikisTarihi, normalSaatGenel, pers.iseGirisDate);
    var hak = kisiHakedis(ss, pers, ozet, hedefYil, hedefAy, now);
    var asgariOdeme = pers.sgk ? asgariUcretTutar : 0;
    var digerTutar = Math.max(0, hak.aySonuNet - asgariOdeme);
    toplamNormalBugun += hak.normalBugun; toplamFazla += hak.fazlaKazanc; toplamTatil += hak.tatilKazanc; toplamBugunNet += hak.bugunNet; toplamAySonuNet += hak.aySonuNet;
    tablo.push({ ad: pers.ad, aktif: pers.aktif, sube: pers.sube || "Erenköy", sgk: pers.sgk ? "☑️ SGK'lı" : "—", maas: pers.maas, normal: Math.round(hak.normalBugun), fazla: Math.round(hak.fazlaKazanc), tatil: Math.round(hak.tatilKazanc), bugunNet: hak.bugunNet, aySonuNet: hak.aySonuNet, asgari: Math.round(asgariOdeme), diger: Math.round(digerTutar), fazlaDk: ozet.fazlaDk, tatilDk: ozet.tatilDk, tatilGun: ozet.tatil, yillikGun: ozet.yillik, raporGun: ozet.rapor, ucretsizGun: ozet.ucretsiz, devamsizGun: ozet.devamsiz, raporKesintiGun: hak.raporKesintiGun, gunluk: hak.gunluk, offCalisilan: ozet.offCalisilan, sistemCikis: ozet.sistemCikis, iban: pers.iban, rowNo: pers.rowNo, odenen: (odemeMap[pers.ad.toLowerCase()] || 0), odenenVar: odemeMap.hasOwnProperty(pers.ad.toLowerCase()) });
  }
  tablo.sort(function (a, b) { var sa = (a.sube || "").toLowerCase(), sb = (b.sube || "").toLowerCase(); if (sa < sb) return -1; if (sa > sb) return 1; if ((a.maas || 0) !== (b.maas || 0)) return (b.maas || 0) - (a.maas || 0); return (a.ad || "").localeCompare((b.ad || ""), "tr"); });
  function adRozet(it) { return htmlEsc(it.ad) + (it.aktif ? '' : ' <span style="font-size:10px;background:#fee2e2;color:#b91c1c;padding:2px 6px;border-radius:6px;font-weight:700">Ayrıldı</span>'); }
  var kazancTabloRows = tablo.map(function (it) {
    return '<tr style="border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b"><td style="padding:10px;font-weight:700;color:#0f172a">' + adRozet(it) + '</td><td style="padding:10px;color:#475569">' + htmlEsc(it.sube) + '</td><td style="padding:10px;text-align:center">' + it.sgk + '</td><td style="padding:10px;color:#0369a1;font-weight:700">' + tlMetin(it.normal) + '</td><td style="padding:10px;color:' + (it.fazla < 0 ? '#dc2626' : '#7e22ce') + ';font-weight:700">' + tlMetin(it.fazla) + '<div style="font-size:11px;color:#94a3b8">' + htmlEsc(dkMetin(it.fazlaDk)) + '</div></td><td style="padding:10px;color:#b45309;font-weight:700">' + tlMetin(it.tatil) + (it.tatilDk > 0 ? '<div style="font-size:11px;color:#94a3b8">' + htmlEsc(sureMetin(it.tatilDk)) + '</div>' : '') + '</td><td style="padding:10px;color:#15803d;font-weight:900">' + tlMetin(it.bugunNet) + '</td><td style="padding:10px;color:#a16207;font-weight:800">' + tlMetin(it.aySonuNet) + '</td><td style="padding:10px;color:#0f766e;font-weight:700">' + tlMetin(it.asgari) + '</td><td style="padding:10px;color:#334155;font-weight:700">' + tlMetin(it.diger) + '</td><td style="padding:10px;color:#64748b;font-size:12px">' + htmlEsc(it.iban) + '</td></tr>';
  }).join("");
  function ikiKatmanli(anaHtml, altText, renk) { var alt = altText ? '<div style="font-size:11px;color:#94a3b8;margin-top:2px">' + htmlEsc(altText) + '</div>' : ''; return '<td style="padding:10px;color:' + renk + '"><div style="font-weight:700">' + anaHtml + '</div>' + alt + '</td>'; }
  var puantajTabloRows = tablo.map(function (it, idx) {
    var fazlaAna = (it.fazla !== 0) ? ((it.fazla > 0 ? '+' : '') + tlMetin(it.fazla)) : '-';
    var tatilAna = it.tatil > 0 ? '+' + tlMetin(it.tatil) : '-';
    var tatilAlt = it.tatilGun > 0 ? (sureMetin(it.tatilDk) + ' · ' + it.tatilGun + ' gün') : '';
    var yillikAna = it.yillikGun > 0 ? tlMetin(it.yillikGun * it.gunluk) : '-';
    var raporAna = it.raporGun > 0 ? (it.raporKesintiGun > 0 ? '-' + tlMetin(it.raporKesintiGun * it.gunluk) : '0 ₺ (ödenir)') : '-';
    var ucretsizAna = it.ucretsizGun > 0 ? '-' + tlMetin(it.ucretsizGun * it.gunluk) : '-';
    var devamsizAna = it.devamsizGun > 0 ? '-' + tlMetin(it.devamsizGun * it.gunluk) : '-';
    return '<tr style="border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b"><td style="padding:10px;font-weight:700">' + adRozet(it) + '</td><td style="padding:10px;color:#475569">' + htmlEsc(it.sube || '-') + '</td><td style="padding:10px;color:#0369a1;font-weight:700">' + tlMetin(it.maas) + '</td>' + ikiKatmanli(fazlaAna, dkMetin(it.fazlaDk) + (it.offCalisilan ? ' · ' + it.offCalisilan + ' off günü' : ''), it.fazla < 0 ? '#dc2626' : '#7c3aed') + ikiKatmanli(tatilAna, tatilAlt, '#c2410c') + ikiKatmanli(yillikAna, it.yillikGun > 0 ? it.yillikGun + ' gün' : '', '#0891b2') + ikiKatmanli(raporAna, it.raporGun > 0 ? it.raporGun + ' gün' : '', '#ca8a04') + ikiKatmanli(ucretsizAna, it.ucretsizGun > 0 ? it.ucretsizGun + ' gün' : '', '#dc2626') + ikiKatmanli(devamsizAna, it.devamsizGun > 0 ? it.devamsizGun + ' gün' : '', '#dc2626') + '<td style="padding:10px;color:#15803d;font-weight:800">' + tlMetin(it.bugunNet) + '</td><td style="padding:10px;color:#a16207;font-weight:800">' + tlMetin(it.aySonuNet) + '</td>' + odemeHucreleri(it, idx) + '</tr>';
  }).join("");
  var gtBaz = 0, gtFazla = 0, gtTatil = 0, gtNet = 0, gtTahmin = 0, gtOdenen = 0, subeOzet = {};
  tablo.forEach(function (it) { gtBaz += it.maas; gtFazla += it.fazla; gtTatil += it.tatil; gtNet += it.bugunNet; gtTahmin += it.aySonuNet; gtOdenen += (it.odenen || 0); var s = it.sube || "Diğer"; if (!subeOzet[s]) subeOzet[s] = { baz: 0, fazla: 0, tatil: 0, net: 0, tahmin: 0, kisi: 0 }; subeOzet[s].baz += it.maas; subeOzet[s].fazla += it.fazla; subeOzet[s].tatil += it.tatil; subeOzet[s].net += it.bugunNet; subeOzet[s].tahmin += it.aySonuNet; subeOzet[s].kisi++; });
  var subeKartlari = "";
  Object.keys(subeOzet).sort().forEach(function (s) { var dd = subeOzet[s]; subeKartlari += '<div style="flex:1;min-width:200px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><div style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:8px">📍 ' + htmlEsc(s) + ' <span style="font-size:11px;color:#94a3b8;font-weight:600">(' + dd.kisi + ' kişi)</span></div><div style="font-size:12px;color:#64748b;display:flex;justify-content:space-between;padding:2px 0">Baz Maaş <b style="color:#0369a1">' + tlMetin(dd.baz) + '</b></div><div style="font-size:12px;color:#64748b;display:flex;justify-content:space-between;padding:2px 0">Fazla Mesai (net) <b style="color:' + (dd.fazla < 0 ? '#dc2626' : '#7c3aed') + '">' + tlMetin(dd.fazla) + '</b></div><div style="font-size:12px;color:#64748b;display:flex;justify-content:space-between;padding:2px 0">Resmi Tatil <b style="color:#c2410c">' + tlMetin(dd.tatil) + '</b></div><div style="font-size:13px;color:#0f172a;display:flex;justify-content:space-between;padding:6px 0 0;margin-top:6px;border-top:1px solid #f1f5f9">Bugüne Kadar <b style="color:#15803d">' + tlMetin(dd.net) + '</b></div><div style="font-size:13px;color:#0f172a;display:flex;justify-content:space-between;padding:2px 0">Ay Sonu Tahmini <b style="color:#a16207">' + tlMetin(dd.tahmin) + '</b></div></div>'; });
  // HIZ: Trend grafiği yalnızca Bordro & Puantaj sekmesinde hesaplanır.
  var trendKutusu = "";
  if (secilenSekme === "puantaj") {
    var trendVerisi = aylikTrendHesapla(ss, pList, 6, gcData, normalSaatGenel);
    var metrikBilgi = [{ key: "toplam", ad: "Toplam Maaş", renk: "#15803d" }, { key: "baz", ad: "Baz Maaş", renk: "#0369a1" }, { key: "fazla", ad: "Fazla Mesai", renk: "#7c3aed" }, { key: "tatil", ad: "Resmi Tatil", renk: "#c2410c" }];
    var metrikButonlari = metrikBilgi.map(function (m) { var aktifMi = (secilenGrafik === m.key); return '<a href="' + base + '?panel=yonetici&sekme=puantaj&ay=' + secilenAyVal + '&grafik=' + m.key + '" target="_top" style="text-decoration:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:700;' + (aktifMi ? ('background:' + m.renk + ';color:#fff') : 'background:#f1f5f9;color:#475569') + '">' + m.ad + '</a>'; }).join("");
    var secilenMetrikAd = "Toplam Maaş";
    for (var mi = 0; mi < metrikBilgi.length; mi++) { if (metrikBilgi[mi].key === secilenGrafik) secilenMetrikAd = metrikBilgi[mi].ad; }
    trendKutusu = '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-top:20px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px"><h3 style="font-size:15px;color:#0f172a;margin:0">📊 Aylık Trend — ' + secilenMetrikAd + ' (Son 6 Ay)</h3><div style="display:flex;gap:6px;flex-wrap:wrap">' + metrikButonlari + '</div></div>' + trendGrafigiCiz(trendVerisi, secilenGrafik) + '</div>';
  }
  var ozetKutusu = '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px"><div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:14px"><div style="flex:1;min-width:120px"><div style="font-size:12px;color:#64748b">Toplam Baz Maaş</div><div style="font-size:18px;font-weight:800;color:#0369a1">' + tlMetin(gtBaz) + '</div></div><div style="flex:1;min-width:120px"><div style="font-size:12px;color:#64748b">Fazla Mesai (Net)</div><div style="font-size:18px;font-weight:800;color:' + (gtFazla < 0 ? '#dc2626' : '#7c3aed') + '">' + tlMetin(gtFazla) + '</div></div><div style="flex:1;min-width:120px"><div style="font-size:12px;color:#64748b">Resmi Tatil</div><div style="font-size:18px;font-weight:800;color:#c2410c">' + tlMetin(gtTatil) + '</div></div><div style="flex:1;min-width:120px"><div style="font-size:12px;color:#64748b">BUGÜNE KADAR NET</div><div style="font-size:18px;font-weight:800;color:#15803d">' + tlMetin(gtNet) + '</div></div><div style="flex:1;min-width:120px"><div style="font-size:12px;color:#64748b">AY SONU TAHMİNİ</div><div style="font-size:18px;font-weight:800;color:#a16207">' + tlMetin(gtTahmin) + '</div></div><div style="flex:1;min-width:120px"><div style="font-size:12px;color:#64748b">ÖDENEN</div><div style="font-size:18px;font-weight:800;color:#0f766e">' + tlMetin(gtOdenen) + '</div></div><div style="flex:1;min-width:120px"><div style="font-size:12px;color:#64748b">FARK (Ödenen − Tahmin)</div><div style="font-size:18px;font-weight:800;color:' + (gtOdenen - gtTahmin < 0 ? '#dc2626' : '#ea580c') + '">' + (gtOdenen ? tlMetin(gtOdenen - gtTahmin) : '-') + '</div></div></div><div style="display:flex;flex-wrap:wrap;gap:12px">' + subeKartlari + '</div></div>';
  function buildOptions(opts, currentVal) { var cv = String(currentVal || "").toLowerCase(); return opts.map(function (o) { return '<option value="' + o + '"' + ((String(o).toLowerCase() === cv) ? " selected" : "") + '>' + o + '</option>'; }).join(""); }
  var vardiyaMatrisRows = pList.filter(function (p) { return p.aktif; }).sort(function (a, b) { var sa = (a.sube || "").toLowerCase(), sb = (b.sube || "").toLowerCase(); if (sa < sb) return -1; if (sa > sb) return 1; return (a.ad || "").localeCompare((b.ad || ""), "tr"); }).map(function (p, idx) {
    var pV = kayitliVardiyalarMap[p.ad.toLowerCase()] || ["", "", "", "", "", "", ""];
    var planToplam = 0, offAdet = 0;
    for (var gv = 0; gv < 7; gv++) { var gd = String(pV[gv] || ""); if (gd === "Off") offAdet++; else if (VARDIYALAR[gd] && VARDIYALAR[gd][2]) planToplam += VARDIYALAR[gd][2]; }
    return '<tr style="border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b"><td style="padding:10px;font-weight:700;color:#0f172a"><input type="hidden" name="ad_' + idx + '" value="' + htmlEsc(p.ad) + '">' + htmlEsc(p.ad) + '</td><td style="padding:10px;color:#475569">' + htmlEsc(p.sube || "Erenköy") + '</td><td style="padding:10px;font-weight:700;color:#0369a1" id="planSa_' + idx + '">' + planToplam + ' sa</td><td style="padding:10px;font-weight:700;color:#b45309" id="offSayi_' + idx + '">' + offAdet + '</td><td style="padding:6px"><select name="pzt_' + idx + '" onchange="satirHesapla(' + idx + ')">' + buildOptions(OPTS_HAFTA_ICI, pV[0]) + '</select></td><td style="padding:6px"><select name="sal_' + idx + '" onchange="satirHesapla(' + idx + ')">' + buildOptions(OPTS_HAFTA_ICI, pV[1]) + '</select></td><td style="padding:6px"><select name="car_' + idx + '" onchange="satirHesapla(' + idx + ')">' + buildOptions(OPTS_HAFTA_ICI, pV[2]) + '</select></td><td style="padding:6px"><select name="per_' + idx + '" onchange="satirHesapla(' + idx + ')">' + buildOptions(OPTS_HAFTA_ICI, pV[3]) + '</select></td><td style="padding:6px"><select name="cum_' + idx + '" onchange="satirHesapla(' + idx + ')">' + buildOptions(OPTS_HAFTA_SONU, pV[4]) + '</select></td><td style="padding:6px"><select name="cmt_' + idx + '" onchange="satirHesapla(' + idx + ')">' + buildOptions(OPTS_HAFTA_SONU, pV[5]) + '</select></td><td style="padding:6px"><select name="paz_' + idx + '" onchange="satirHesapla(' + idx + ')">' + buildOptions(OPTS_HAFTA_ICI, pV[6]) + '</select></td></tr>';
  }).join("");
  var personelKartlari = pList.map(function (p) { return '<a href="' + base + '?panel=yonetici&sekme=personel&pid=' + encodeURIComponent(p.rowNo) + '&hafta=' + encodeURIComponent(secilenHaftaStr || "") + '&ay=' + encodeURIComponent(secilenAyStr || "") + '" target="_top" style="display:block;text-decoration:none;background:#fff;border:1px solid ' + (p.aktif ? '#cbd5e1' : '#fecaca') + ';padding:14px;border-radius:12px;margin-bottom:10px;box-shadow:0 1px 2px rgba(0,0,0,0.05)"><div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:15px;color:#0f172a">' + htmlEsc(p.ad) + '</strong><span style="font-size:11px;padding:3px 8px;border-radius:6px;background:' + (p.aktif ? '#dcfce7;color:#15803d' : '#fee2e2;color:#b91c1c') + '">' + (p.aktif ? 'Aktif' : 'Pasif') + '</span></div><div style="font-size:12px;color:#64748b;margin-top:6px">Şube: <b style="color:#1e293b">' + htmlEsc(p.sube) + '</b></div></a>'; }).join("");
  var detayFormHtml = '<p style="color:#64748b;font-size:13px;text-align:center">Soldaki listeden bir personele tıklayın.</p>';
  if (secilenPid) {
    var pSheetD = ss.getSheetByName("Personel");
    var satirNo = parseInt(secilenPid, 10);
    if (pSheetD && satirNo >= 2 && satirNo <= pSheetD.getLastRow()) {
      var rd = pSheetD.getRange(satirNo, 1, 1, 16).getValues()[0];
      var dAd = (rd[0] || "").toString();
      var dGiris = rd[1] instanceof Date ? Utilities.formatDate(rd[1], tz, "yyyy-MM-dd") : "";
      var dCikis = rd[2] instanceof Date ? Utilities.formatDate(rd[2], tz, "yyyy-MM-dd") : "";
      var dAktif = (rd[4] === true || rd[4] === "TRUE" || rd[4] === "Evet" || rd[4] === 1);
      var inpS = 'width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;margin-top:3px;box-sizing:border-box';
      var labS = 'font-size:11px;color:#64748b;font-weight:600;display:block;margin-top:10px';
      detayFormHtml = '<form action="' + base + '" method="get" target="_top"><input type="hidden" name="panel" value="yonetici"><input type="hidden" name="sekme" value="personel"><input type="hidden" name="islem" value="personelGuncelle"><input type="hidden" name="pRow" value="' + satirNo + '"><h4 style="color:#0284c7;font-size:16px;margin-bottom:4px">' + htmlEsc(dAd) + '</h4><label style="' + labS + '">İsim Soyisim</label><input name="pAd" value="' + htmlEsc(dAd) + '" style="' + inpS + '"><label style="' + labS + '">Aylık Maaş</label><input name="pMaas" type="number" value="' + htmlEsc(rd[3] || "") + '" style="' + inpS + '"><label style="' + labS + '">Telefon</label><input name="pTel" value="' + htmlEsc(rd[6] || "") + '" style="' + inpS + '"><label style="' + labS + '">IBAN</label><input name="pIban" value="' + htmlEsc(rd[14] || "") + '" style="' + inpS + '"><label style="' + labS + '">Şube</label><input name="pSube" value="' + htmlEsc(rd[10] || "") + '" style="' + inpS + '"><label style="' + labS + '">Departman / Pozisyon</label><input name="pDept" value="' + htmlEsc(rd[11] || "") + '" style="' + inpS + '"><label style="' + labS + '">İşe Giriş</label><input name="pGiris" type="date" value="' + dGiris + '" style="' + inpS + '"><label style="' + labS + '">İşten Çıkış (girilirse otomatik Pasif)</label><input name="pCikis" type="date" value="' + dCikis + '" style="' + inpS + '"><label style="' + labS + '">Durum</label><select name="pDurum" style="' + inpS + '"><option value="Aktif"' + (dAktif ? " selected" : "") + '>Aktif</option><option value="Pasif"' + (!dAktif ? " selected" : "") + '>Pasif</option></select><label style="' + labS + '">Ayrılma Sebebi / Not</label><textarea name="pAyril" rows="2" style="' + inpS + '">' + htmlEsc(rd[8] || "") + '</textarea><button type="submit" style="width:100%;margin-top:14px;background:#2563eb;color:#fff;border:none;padding:12px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer">💾 Değişiklikleri Kaydet</button></form>';
    }
  }
    var bekleyenIzinKutusu = bekleyenIzinlerHtml(ss, base, secilenHaftaStr, secilenAyStr);
  var jsonGecListesi = JSON.stringify(gecKalanlarListesi).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  var jsonBugunIzinli = JSON.stringify(bugunIzinliListesi).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  var tabLink = function (sekme, etiket) { return '<a href="' + base + '?panel=yonetici&sekme=' + sekme + '&hafta=' + encodeURIComponent(secilenHaftaStr || "") + '&ay=' + encodeURIComponent(secilenAyStr || "") + '" target="_top" class="tab' + (secilenSekme === sekme ? " sec" : "") + '">' + etiket + '</a>'; };
  var html = '<!DOCTYPE html><html lang="tr"><head><base target="_top"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,sans-serif}html,body{height:100%;background:#f8fafc;color:#1e293b}.navbar{display:flex;justify-content:space-between;align-items:center;padding:16px 24px;background:#fff;border-bottom:1px solid #e2e8f0}.tabbar{display:flex;background:#fff;border-bottom:1px solid #e2e8f0;overflow-x:auto}.tab{flex:1;padding:14px;text-align:center;color:#64748b;font-weight:700;font-size:13px;letter-spacing:1px;white-space:nowrap;text-decoration:none;display:block}.tab.sec{color:#0f172a;border-bottom:3px solid #2563eb;background:#f8fafc}.container{padding:24px;max-width:1600px;margin:0 auto}.stat-box{background:#fff;border:1px solid #e2e8f0;padding:20px;border-radius:12px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.05)}.stat-lbl{font-size:12px;color:#64748b;font-weight:600}.stat-val{font-size:24px;font-weight:800;color:#0f172a;margin-top:6px}.card{background:#fff;border:1px solid #e2e8f0;padding:20px;border-radius:16px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.05)}table{width:100%;border-collapse:collapse}th{text-align:left;padding:12px;font-size:12px;color:#64748b;border-bottom:2px solid #e2e8f0}input,select{background:#f8fafc;border:1px solid #cbd5e1;color:#1e293b;padding:8px;border-radius:6px;width:100%;font-size:12px}button.btn{background:#2563eb;color:#fff;border:none;padding:12px;border-radius:6px;font-weight:700;cursor:pointer;width:100%}.arrow-btn{background:#f1f5f9;border:1px solid #cbd5e1;color:#1e293b;padding:8px 16px;border-radius:8px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-block}.modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);display:none;align-items:center;justify-content:center;z-index:999;padding:16px}.modal-card{background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:24px;width:100%;max-width:450px}.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid #e2e8f0;padding-bottom:12px}.close-btn{background:#f1f5f9;border:none;width:32px;height:32px;border-radius:50%;color:#1e293b;font-weight:800;cursor:pointer}</style></head><body>' +
    '<div class="navbar"><div style="font-size:18px;font-weight:800;letter-spacing:1px;color:#0f172a">🍕 BAP OS <span style="font-size:12px;font-weight:400;color:#64748b">Yönetici Paneli</span></div><div style="font-size:13px;color:#64748b">' + tStr + '</div></div>' +
    '<div class="tabbar">' + tabLink("dash", "📊 DASHBOARD") + tabLink("vardiya", "📅 VARDİYA PLANLAMA") + tabLink("puantaj", "📈 BORDRO & PUANTAJ") + tabLink("personel", "👥 PERSONEL YÖNETİMİ") + '</div>' +
    '<div id="jsHata" style="display:none;background:#dc2626;color:#fff;padding:12px;font-size:13px;text-align:center;font-weight:600"></div><div class="container">' +
        '<div style="display:' + (secilenSekme === "dash" ? "block" : "none") + '">' + bekleyenIzinKutusu + '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px"><div style="flex:0 0 260px;display:flex;flex-direction:column;gap:10px"><div class="stat-box" style="padding:14px"><div class="stat-lbl">Toplam Çalışan (Aktif)</div><div class="stat-val" style="font-size:22px">' + aktifPersonelSayisi + '</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="stat-box" style="padding:12px"><div class="stat-lbl" style="font-size:11px">Şu An İçeride</div><div class="stat-val" style="font-size:18px;color:#16a34a">' + calisanSayisi + '</div></div><div class="stat-box" style="padding:12px" onclick="bugunIzinlileriGoster()"><div class="stat-lbl" style="font-size:11px">İzinli/Rapor</div><div class="stat-val" style="font-size:18px;color:#ca8a04">' + bugunIzinliSayisi + '</div>' + (bugunIzinliAdlari.length ? '<div style="font-size:10px;color:#a16207;margin-top:2px">' + htmlEsc(bugunIzinliAdlari.join(", ")) + '</div>' : '') + '</div><div class="stat-box" style="padding:12px"><div class="stat-lbl" style="font-size:11px">Devamsız</div><div class="stat-val" style="font-size:18px;color:#dc2626">' + devamsizSayisi + '</div>' + (bugunDevamsizAdlari.length ? '<div style="font-size:10px;color:#dc2626;margin-top:2px">' + htmlEsc(bugunDevamsizAdlari.join(", ")) + '</div>' : '') + '</div><div class="stat-box" style="padding:12px" onclick="gecKalanlariGoster()"><div class="stat-lbl" style="font-size:11px">Geç Kalan</div><div class="stat-val" style="font-size:18px;color:#ea580c">' + gecKalanSayisi + '</div></div></div></div>' +
    '<div style="flex:1;min-width:320px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px"><h3 style="font-size:14px;color:#0f172a;margin:0 0 10px">🕐 Anlık Giriş / Çıkış Durumu (' + tStr + ')</h3><div style="overflow-x:auto"><table><thead><tr style="font-size:11px;color:#64748b;text-align:left;border-bottom:2px solid #e2e8f0"><th style="padding:8px">Personel</th><th style="padding:8px">Vardiya</th><th style="padding:8px">Giriş</th><th style="padding:8px">Çıkış</th><th style="padding:8px">Durum</th></tr></thead><tbody>' + anlikDurumRows + '</tbody></table></div></div></div>' +
    '<div class="card"><h3 style="font-size:16px;margin-bottom:12px;color:#0f172a">💰 Aylık Finansal & Hak Ediş İcmali (' + secilenAyBaslikStr + ')</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px"><div style="background:#f8fafc;padding:14px;border-radius:10px;border:1px solid #e2e8f0"><div style="font-size:12px;color:#64748b">Normal Mesai (bugüne kadar)</div><div style="font-size:18px;font-weight:800;color:#0284c7;margin-top:4px">' + tlMetin(toplamNormalBugun) + '</div></div><div style="background:#f8fafc;padding:14px;border-radius:10px;border:1px solid #e2e8f0"><div style="font-size:12px;color:#64748b">Fazla Mesai (Net)</div><div style="font-size:18px;font-weight:800;color:' + (toplamFazla < 0 ? '#dc2626' : '#7e22ce') + ';margin-top:4px">' + tlMetin(toplamFazla) + '</div></div><div style="background:#f8fafc;padding:14px;border-radius:10px;border:1px solid #e2e8f0"><div style="font-size:12px;color:#64748b">Resmi Tatil Kazancı</div><div style="font-size:18px;font-weight:800;color:#b45309;margin-top:4px">' + tlMetin(toplamTatil) + '</div></div><div style="background:#f0fdf4;padding:14px;border-radius:10px;border:1px solid #bbf7d0"><div style="font-size:12px;color:#15803d;font-weight:700">Bugüne Kadar Hakediş</div><div style="font-size:20px;font-weight:900;color:#15803d;margin-top:4px">' + tlMetin(toplamBugunNet) + '</div></div><div style="background:#fefce8;padding:14px;border-radius:10px;border:1px solid #fde68a"><div style="font-size:12px;color:#a16207;font-weight:700">Ay Sonu Tahmini</div><div style="font-size:20px;font-weight:900;color:#a16207;margin-top:4px">' + tlMetin(toplamAySonuNet) + '</div></div></div>' +
    '<div style="margin-top:14px;display:flex;gap:16px;flex-wrap:wrap"><div style="flex:1;min-width:220px;background:#fffbeb;padding:14px;border-radius:10px;border:1px solid #fde68a"><div style="font-size:12px;color:#92400e;font-weight:700">📅 Bugünkü Personel Gideri</div><div style="font-size:20px;font-weight:900;color:#b45309;margin-top:4px">' + tlMetin(bugunGiderToplam) + '</div><div style="font-size:11px;color:#a16207;margin-top:2px">Bugün vardiyalı ' + bugunGiderKisi + ' kişinin günlük ücreti</div></div><div style="flex:1;min-width:220px;background:#eff6ff;padding:14px;border-radius:10px;border:1px solid #bfdbfe"><div style="font-size:12px;color:#1e40af;font-weight:700">💼 Toplam Aylık Maaş Bütçesi</div><div style="font-size:20px;font-weight:900;color:#1d4ed8;margin-top:4px">' + tlMetin(toplamPersonelButcesi) + '</div><div style="font-size:11px;color:#3b82f6;margin-top:2px">Aktif çalışanların baz maaş toplamı</div></div><div style="flex:1;min-width:220px;background:#fef2f2;padding:14px;border-radius:10px;border:1px solid #fecaca"><div style="font-size:12px;color:#991b1b;font-weight:700">🏛️ Aylık SGK İşveren Gideri</div><div style="font-size:20px;font-weight:900;color:#dc2626;margin-top:4px">' + tlMetin(toplamSgkGider) + '</div><div style="font-size:11px;color:#ef4444;margin-top:2px">' + sgkliSayisi + ' SGK\'lı × ' + tlMetin(kisiBasiSgkGider) + '</div></div></div></div>' +
    '<div class="card"><h3 style="font-size:16px;color:#0f172a;margin:0 0 16px">👥 Personel Bazlı Hak Ediş ve Ödeme Listesi</h3><div style="overflow-x:auto"><table><thead><tr><th style="padding:10px">Personel</th><th>Şube</th><th style="text-align:center">SGK</th><th>Normal Mesai</th><th>Fazla Mesai (net)</th><th>Resmi Tatil</th><th>Bugüne Kadar</th><th>Ay Sonu Tahmini</th><th>Asgari Ücret</th><th>Diğer Tutar</th><th>IBAN</th></tr></thead><tbody>' + (kazancTabloRows || '<tr><td colspan="11" style="padding:16px;text-align:center;color:#94a3b8">Kayıt bulunamadı.</td></tr>') + '</tbody></table></div></div></div>' +
    '<div style="display:' + (secilenSekme === "vardiya" ? "block" : "none") + '"><div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px"><div><h3 style="font-size:16px;color:#0f172a">📅 Haftalık Ekip Vardiya Çizelgesi</h3><p style="font-size:12px;color:#64748b;margin-top:2px">Vardiyaları seçin, toplam saat ve off sayıları anlık hesaplansın.</p></div><div style="display:flex;gap:12px;align-items:center;background:#f8fafc;padding:6px 12px;border-radius:10px;border:1px solid #e2e8f0"><a class="arrow-btn" target="_top" href="' + base + '?panel=yonetici&sekme=vardiya&hafta=' + oncekiStr + '&ay=' + secilenAyVal + '">‹ Önceki Hafta</a><span style="font-weight:800;color:#0f172a;font-size:14px;padding:0 8px">' + hfBaslik + '</span><a class="arrow-btn" target="_top" href="' + base + '?panel=yonetici&sekme=vardiya&hafta=' + sonrakiStr + '&ay=' + secilenAyVal + '">Sonraki Hafta ›</a></div></div><form action="' + base + '" method="get" target="_top"><input type="hidden" name="panel" value="yonetici"><input type="hidden" name="sekme" value="vardiya"><input type="hidden" name="islem" value="vardiyaKaydet"><input type="hidden" name="vhafta" value="' + hfStrKey + '"><div style="overflow-x:auto"><table><thead><tr><th>Personel</th><th>Şube</th><th>Planlanan</th><th>Off</th><th>Pzt</th><th>Sal</th><th>Çar</th><th>Per</th><th>Cum</th><th>Cmt</th><th>Paz</th></tr></thead><tbody>' + vardiyaMatrisRows + '</tbody></table></div><button type="submit" class="btn" style="margin-top:20px;padding:14px;font-size:15px">💾 Tüm Vardiya Çizelgesini Kaydet</button></form></div></div>' +
    '<div style="display:' + (secilenSekme === "puantaj" ? "block" : "none") + '"><div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px"><h3 style="font-size:16px;color:#0f172a;margin:0">📈 Aylık Puantaj Ve Bordro İcmali (' + secilenAyBaslikStr + ')</h3><form action="' + base + '" method="get" target="_top" style="display:flex;align-items:center;gap:8px;margin:0"><input type="hidden" name="panel" value="yonetici"><input type="hidden" name="sekme" value="puantaj"><input type="hidden" name="grafik" value="' + htmlEsc(secilenGrafik) + '"><label style="font-size:12px;font-weight:700;color:#64748b">Rapor Ayı:</label><input type="month" name="ay" value="' + secilenAyVal + '" style="padding:6px 10px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:700;color:#0f172a;width:auto"><button type="submit" style="padding:7px 12px;border-radius:6px;border:none;background:#2563eb;color:#fff;font-weight:700;cursor:pointer">Göster</button></form></div>' + ozetKutusu + '<form method="get" action="' + base + '" target="_top"><input type="hidden" name="panel" value="yonetici"><input type="hidden" name="sekme" value="puantaj"><input type="hidden" name="islem" value="odemeTopluKaydet"><input type="hidden" name="ay" value="' + secilenAyVal + '"><input type="hidden" name="grafik" value="' + htmlEsc(secilenGrafik) + '"><div style="overflow-x:auto"><table><thead><tr><th style="padding:10px">Personel</th><th>Şube</th><th>Baz Maaş</th><th>Fazla Mesai (±)</th><th>Resmi Tatil (+)</th><th>Yıllık İzin</th><th>Rapor</th><th>Ücretsiz (−)</th><th>Devamsız (−)</th><th>Bugüne Kadar</th><th>Ay Sonu Tahmini</th><th>Ödenen</th><th>Fark</th></tr></thead><tbody>' + (puantajTabloRows || '<tr><td colspan="13" style="padding:16px;text-align:center;color:#94a3b8">Kayıt bulunamadı.</td></tr>') + '</tbody></table></div><button type="submit" class="btn" style="margin-top:14px;width:auto;padding:12px 24px">💾 Tüm Ödemeleri Kaydet</button></form>' + trendKutusu + '</div></div>' +
    '<div style="display:' + (secilenSekme === "personel" ? "block" : "none") + '"><div style="display:grid;grid-template-columns:1fr 1fr;gap:20px"><div><h3 style="font-size:16px;margin-bottom:16px;color:#0f172a">👥 Personel Listesi (İncelemek için tıklayın)</h3><div style="max-height:550px;overflow-y:auto;padding-right:6px">' + personelKartlari + '</div></div><div class="card"><h3 style="font-size:16px;margin-bottom:16px;color:#0f172a">🔍 Personel Detay & Düzenleme</h3><div style="background:#f8fafc;padding:20px;border-radius:12px;border:1px solid #e2e8f0;margin-bottom:20px">' + detayFormHtml + '</div><h3 style="font-size:16px;margin-bottom:16px;color:#0f172a">➕ Yeni Personel Ekle</h3><form action="' + base + '" method="get" target="_top"><input type="hidden" name="panel" value="yonetici"><input type="hidden" name="sekme" value="personel"><input type="hidden" name="islem" value="personelEkle"><label style="font-size:12px;color:#64748b">İsim Soyisim</label><input type="text" name="ypAd" placeholder="Örn: Selim Temiz" required style="margin-bottom:8px"><label style="font-size:12px;color:#64748b">Aylık Maaş (TL)</label><input type="number" name="ypMaas" placeholder="Örn: 60000" required style="margin-bottom:8px"><div style="font-size:12px;color:#16a34a;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;margin:8px 0">🔑 PIN girmenize gerek yok. Çalışan ilk girişinde kendi 4 haneli PIN\'ini oluşturur.</div><label style="font-size:12px;color:#64748b">Atanan Şube</label><select name="ypSube" style="margin-bottom:8px"><option>Erenköy</option><option>Fikirtepe</option></select><label style="font-size:12px;color:#64748b">Departman / Pozisyon</label><input type="text" name="ypDept" placeholder="Örn: Pizza Ustası" style="margin-bottom:8px"><label style="font-size:12px;color:#64748b">Telefon</label><input type="text" name="ypTel" placeholder="Örn: 0555..." style="margin-bottom:8px"><label style="font-size:12px;color:#64748b">IBAN</label><input type="text" name="ypIban" placeholder="TR..." style="margin-bottom:8px"><label style="font-size:12px;color:#64748b">Yetkinlik</label><input type="text" name="ypYetkinlik" placeholder="Örn: Standart" style="margin-bottom:8px"><label style="font-size:12px;color:#64748b">SGK Durumu</label><select name="ypSgk" style="margin-bottom:8px"><option value="hayir">SGK Yok</option><option value="evet">SGK\'lı</option></select><button type="submit" class="btn" style="margin-top:10px">Yeni Personel Kaydet</button></form></div></div></div>' +
    '</div><div id="infoModal" class="modal-overlay"><div class="modal-card"><div class="modal-header"><h3 id="modalBaslik" style="font-size:16px;color:#0f172a">Detaylı Bilgi</h3><button class="close-btn" onclick="modalKapat()">✕</button></div><div id="modalIcerik" style="font-size:14px;color:#334155;line-height:1.6"></div></div></div>' +
    '<script>window.onerror=function(m,s,l){var d=document.getElementById("jsHata");if(d){d.style.display="block";d.innerText="JS HATA: "+m+" (satir "+l+")";}return false;};function listeModal(baslik,liste,fmt){document.getElementById("modalBaslik").innerText=baslik;var html="";if(!liste||liste.length===0){html="<p style=\'color:#64748b;text-align:center;padding:10px\'>Kayıt bulunmuyor.</p>";}else{html="<ul style=\'list-style:none;padding:0\'>";for(var i=0;i<liste.length;i++){html+="<li style=\'display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0\'>"+fmt(liste[i])+"</li>";}html+="</ul>";}document.getElementById("modalIcerik").innerHTML=html;document.getElementById("infoModal").style.display="flex";}function bugunIzinlileriGoster(){var o=' + jsonBugunIzinli + ';var l=Object.keys(o).map(function(k){return {ad:k,v:o[k]};});listeModal("Bugün İzinli / Raporlu",l,function(x){return "<span>"+x.ad+"</span><b style=\'color:#ca8a04\'>"+x.v+"</b>";});}function gecKalanlariGoster(){listeModal("Bugün Geç Kalanlar",' + jsonGecListesi + ',function(x){return "<span>"+x.ad+"</span><b style=\'color:#ea580c\'>Giriş: "+x.saat+"</b>";});}function modalKapat(){document.getElementById("infoModal").style.display="none";}var vardiyaSureleri={"11:00-21:00":10,"12:00-22:00":10,"13:00-23:00":10,"14:00-24:00":10,"16:00-02:00":10,"11:00-22:00":11,"12:00-23:00":11,"13:00-24:00":11,"11:00-23:00":12,"12:00-01:00":12,"13:00-02:00":12};function satirHesapla(idx){var g=["pzt_","sal_","car_","per_","cum_","cmt_","paz_"];var t=0,o=0;for(var i=0;i<g.length;i++){var s=document.querySelector("select[name=\'"+g[i]+idx+"\']");if(s){if(vardiyaSureleri[s.value]){t+=vardiyaSureleri[s.value];}if(s.value==="Off"){o++;}}}var a=document.getElementById("planSa_"+idx),b=document.getElementById("offSayi_"+idx);if(a)a.innerText=t+" sa";if(b)b.innerText=o;}</script></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle("BAP OS - Yönetici Paneli").addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);}

function vardiyaPaneli(ss, sheet) { return yoneticiHub(ss, sheet); }
function yonetimPaneli(ss, sheet) { return yoneticiHub(ss, sheet); }
function personelYonetimPaneli(ss) { return yoneticiHub(ss, anaSayfa(ss)); }

function aylikTrendHesapla(ss, pList, ayGeriSayisi, gcHazir, normalSaat) {
  var gc = gcHazir;
  if (!gc) { var sheet = anaSayfa(ss); gc = sheet ? sheet.getDataRange().getValues() : []; }
  normalSaat = normalSaat || ayarAl(ss, "GUNLUK_NORMAL_SAAT", 10);
  var simdi = new Date(), sonuc = [];
  var ayKisa = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  for (var geri = ayGeriSayisi - 1; geri >= 0; geri--) {
    var d = new Date(simdi.getFullYear(), simdi.getMonth() - geri, 1);
    var yil = d.getFullYear(), ay = d.getMonth();
    var tBaz = 0, tFazla = 0, tTatil = 0, tNet = 0;
    for (var pi = 0; pi < pList.length; pi++) { var pers = pList[pi]; if (!ayIcindeCalismisMi(pers, yil, ay)) continue; var oz = kisiAyOzet(gc, pers.ad, yil, ay, pers.cikisTarihi, normalSaat, pers.iseGirisDate); var hk = kisiHakedis(ss, pers, oz, yil, ay, simdi); tBaz += pers.maas || 0; tFazla += hk.fazlaKazanc; tTatil += hk.tatilKazanc; tNet += hk.bugunNet; }
    sonuc.push({ etiket: ayKisa[ay] + " " + String(yil).slice(2), baz: Math.round(tBaz), fazla: Math.round(tFazla), tatil: Math.round(tTatil), toplam: Math.round(tNet) });
  }
  return sonuc;
}

function trendGrafigiCiz(trend, secilenMetrik) {
  var renkler = { baz: "#0369a1", fazla: "#7c3aed", tatil: "#c2410c", toplam: "#15803d" };
  var renk = renkler[secilenMetrik] || "#15803d";
  var degerler = trend.map(function (t) { return Math.abs(t[secilenMetrik] || 0); });
  var maxDeger = Math.max.apply(null, degerler.concat([1]));
  var W = 720, H = 240, padL = 10, padR = 10, padT = 20, padB = 30;
  var alanW = W - padL - padR, alanH = H - padT - padB, n = trend.length;
  var barW = Math.min(70, (alanW / n) * 0.6), adim = alanW / n, barlar = "";
  for (var i = 0; i < n; i++) {
    var val = trend[i][secilenMetrik] || 0;
    var h = maxDeger > 0 ? (Math.abs(val) / maxDeger) * alanH : 0;
    var x = padL + adim * i + (adim - barW) / 2, y = padT + (alanH - h);
    var kisaVal = (Math.abs(val) >= 1000) ? (Math.round(val / 1000) + "b") : val;
    barlar += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4" fill="' + (val < 0 ? '#dc2626' : renk) + '"></rect><text x="' + (x + barW / 2).toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" font-size="11" font-weight="700" fill="#334155" text-anchor="middle">' + kisaVal + '</text><text x="' + (x + barW / 2).toFixed(1) + '" y="' + (H - 10) + '" font-size="11" fill="#64748b" text-anchor="middle">' + trend[i].etiket + '</text>';
  }
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block">' + barlar + '</svg>';
}

// ==========================================
// ANA GİRİŞ NOKTASI
// ==========================================
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = anaSayfa(ss);
    onbellekleriDoldur(ss); // HIZ: Ayarlar + Vardiya bu istek boyunca 1 kez okunur
    var P = e ? (e.parameter || {}) : {};
    var panel = (P.panel || "").toString().trim().toLowerCase();
    var ad = (P.ad || "").toString().trim();
    var islem = (P.islem || "").toString().trim();
    var kod = (P.kod || "").toString().trim();
    var haftaParam = (P.hafta || "").toString().trim();
    var ayParam = (P.ay || "").toString().trim();
    var sekmeParam = (P.sekme || "dash").toString().trim();
    var pidParam = (P.pid || "").toString().trim();
    var grafikParam = (P.grafik || "toplam").toString().trim();

    if (panel === "yonetici" || panel === "vardiya" || panel === "yonetim" || panel === "personelyonetim") {
      if (islem === "personelGuncelle") { personelGuncelleKaydet(ss, P); return yoneticiHub(ss, sheet, haftaParam, ayParam, "personel", ""); }
      if (islem === "vardiyaKaydet") { vardiyaCizelgeKaydet(ss, P); return yoneticiHub(ss, sheet, (P.vhafta || haftaParam), ayParam, "vardiya", ""); }
      if (islem === "personelEkle") { yeniPersonelEkle(ss, P); return yoneticiHub(ss, sheet, haftaParam, ayParam, "personel", ""); }
            if (islem === "izinOnay") { izinTalebiKarar(ss, (P.tno || "").toString(), true); return yoneticiHub(ss, sheet, haftaParam, ayParam, "dash", ""); }
      if (islem === "izinRed") { izinTalebiKarar(ss, (P.tno || "").toString(), false); return yoneticiHub(ss, sheet, haftaParam, ayParam, "dash", ""); }
      if (islem === "odemeKaydet") { odemeKaydet(ss, P); return yoneticiHub(ss, sheet, haftaParam, ayParam, "puantaj", "", grafikParam); }
      if (islem === "odemeTopluKaydet") { odemeTopluKaydet(ss, P); return yoneticiHub(ss, sheet, haftaParam, ayParam, "puantaj", "", grafikParam); }
      return yoneticiHub(ss, sheet, haftaParam, ayParam, sekmeParam, pidParam, grafikParam);
    }

    if (!ad) return secimSayfasi(ss, panel);

    var pObj = personelBul(ss, ad);
    if (!pObj) return msg("Kayıt Bulunamadı", htmlEsc(ad) + " - personel listesinde bulunamadı. Yöneticinle görüş.", "#b23b3b", new Date(), null, "?");
    ad = pObj.ad;

    var bugun0 = gunBasi(new Date());
    var ayrildi = !pObj.aktif;
    if (pObj.cikisTarihi instanceof Date && gunBasi(pObj.cikisTarihi) <= bugun0) ayrildi = true;
    if (ayrildi) return msg("Erişim Kapalı", htmlEsc(ad) + " - Hesabın aktif değil. Bir sorun olduğunu düşünüyorsan yöneticinle görüş.", "#b23b3b", new Date(), null, "🔒");

    if (islem === "pinSifirlaTalep") return pinSifirlaEkran(ad, false, kod);
    if (islem === "pinSifirlaOnay") {
      var tel4 = (P.tel4 || "").toString().trim();
      var yeniPin = (P.yeniPin || "").toString().trim();
      var gercekTel = (pObj.telefon || "").replace(/\D/g, "");
      var son4 = gercekTel.length >= 4 ? gercekTel.slice(-4) : gercekTel;
      if (!tel4 || tel4 !== son4) return pinSifirlaEkran(ad, true, kod);
      if (!/^[0-9]{4}$/.test(yeniPin)) return pinSifirlaEkran(ad, false, kod, "PIN 4 haneli rakam olmalı.");
      pinGuncelle(ss, ad, yeniPin);
      return msg("PIN Güncellendi", htmlEsc(ad) + " - Yeni PIN kodun oluşturuldu. QR'ı tekrar okutup bu PIN ile devam edebilirsin.", "#22a559", new Date(), null, "✓");
    }
    if (islem === "ilkPinOlustur") {
      var yeniPin2 = (P.yeniPin || "").toString().trim();
      if (!/^[0-9]{4}$/.test(yeniPin2)) return ilkPinEkran(ad, kod, "PIN 4 haneli rakam olmalı.");
      pinGuncelle(ss, ad, yeniPin2);
      return msg("PIN Oluşturuldu", htmlEsc(ad) + " - PIN kodun belirlendi. QR'ı tekrar okutup bu PIN ile devam edebilirsin.", "#22a559", new Date(), null, "✓");
    }
    if (!pObj.pin) return ilkPinEkran(ad, kod);

    var g = pinGate(ss, pObj, P, kod, panel);
    if (g.page) return g.page;
    var PIN = g.pin;

    if (islem === "izinEkle") {
      var tTip = (P.tTip || "Yıllık İzin").toString();
      var tBas = (P.tBas || "").toString();
      var tBit = (P.tBit || "").toString();
      var tAck = (P.tAck || "").toString();
      if (tBas && tBit) {
        var lockI = kilitAl(); var basarili = false;
              var talep = null;
        try { talep = izinTalebiKaydet(ss, ad, tTip, tBas, tBit, tAck); } finally { kilitBirak(lockI); }
        if (talep) return msg("Talebin İletildi", htmlEsc(ad) + " - " + htmlEsc(tBas) + " / " + htmlEsc(tBit) + " tarihleri arasındaki " + htmlEsc(tTip) + " talebin yöneticiye iletildi. Onaylandığında vardiya planına işlenecek.", "#2563eb", new Date(), null, "📝");
        return msg("Kayıt Yapılamadı", "Tarihler kontrol edilip tekrar denenmeli.", "#b23b3b", new Date(), null, "✖");
      }
    }

    if (panel === "calisan") {
      return calisanDashboardSayfasi(ss, ad, PIN, (P.ekipHafta || "").toString(), kod, (P.ekip || "").toString() === "1");
    }

    var now = new Date();
    var isGunu = isGunuTarihi(now);
    var tStr = anahtarTarih(isGunu);
    var onay = (P.onay || "").toString().trim();

    var gelenToken = (P.tk || "").toString().trim();
    if (!tokenDogrulaVeTuket(ad, gelenToken)) {
      var dEski = durum(sheet, ad, now);
      return msg("Bu Sayfa Kullanılmış", htmlEsc(ad) + " - Bu bağlantı daha önce kullanılmış veya sayfa yenilenmiş; yeni işlem alınmadı. Yeni işlem için QR'ı tekrar okut." + durumOzetHtml(dEski), "#d97706", now, null, "↻");
    }

    var TEKRAR_DK = ayarAl(ss, "TEKRAR_KORUMA_DK", 30);
    var MIN_MESAI = ayarAl(ss, "MIN_MESAI_SAAT", 4);
    var hedefSube = aktifSubeBul(ss, ad);

    var kodKontrolModu = ayarAl(ss, "KOD_KONTROL_MODU", "KAPALI").toString().trim().toUpperCase();
    var kodsuzSupheli = false;
    if (kodKontrolModu === "ISARETLE" || kodKontrolModu === "ENGELLE") {
      var genelKod = ayarAl(ss, "GENEL_QR_KOD", "").toString().trim();
      var subeKodu = ayarAl(ss, "SUBE_KOD_" + hedefSube, "").toString().trim();
      var kodGecerli = (kod && (kod === genelKod || kod === subeKodu) && (genelKod || subeKodu));
      if (!kodGecerli) {
        logEkle(ss, ad, "KOD_HATA", "Geçersiz/eksik QR kodu (gelen: " + (kod || "YOK") + ") - mod: " + kodKontrolModu, hedefSube);
        try { waOlayBildir(ss, ad, "-", "🚨 ŞÜPHELİ GİRİŞ: " + ad + " dükkan dışından (QR okutmadan / geçersiz kod) " + saatDk(now) + "'de giriş yapmaya çalıştı.", "", "kod_hata"); } catch (e2) {}
        if (kodKontrolModu === "ENGELLE") return msg("Geçersiz Kod", htmlEsc(ad) + " - Giriş yalnızca <b>dükkandaki QR kod</b> ile yapılabilir.", "#b23b3b", now, null, "🔒");
        kodsuzSupheli = true;
      }
    }

    var lock = kilitAl();
    try {
      var d = durum(sheet, ad, now);
      if (d.sonHareketZamani) {
        var gecenDk = (now.getTime() - d.sonHareketZamani.getTime()) / 60000;
        if (gecenDk < TEKRAR_DK) return msg("İşlemin Zaten Alınmış", htmlEsc(ad) + " - Az önce işlem yapıldı, tekrar okutmana gerek yok." + durumOzetHtml(d), "#22a559", now, null, "✓");
      }

      if (d.acikSatir > 0) {
        var gecenSaat = (now.getTime() - d.acikGiris.getTime()) / 3600000;
        if (gecenSaat < MIN_MESAI) {
          var kalanDk = Math.ceil((MIN_MESAI - gecenSaat) * 60);
          return msg("Çıkış İçin Erken", htmlEsc(ad) + " - Girişin " + saatDk(d.acikGiris) + "'de alınmış. Girişten " + MIN_MESAI + " saat geçmeden çıkış yapılamaz (yaklaşık " + kalanDk + " dk sonra)." + durumOzetHtml(d), "#d97706", now, null, "⏱");
        }
        if (onay !== "cikis") return cikisOnaySayfasi(ad, PIN, kod, d, now);

        var satir = d.acikSatir;
        var satirRow = sheet.getRange(satir, 1, 1, 18).getValues()[0];
        var satirTarih = (satirRow[0] instanceof Date) ? gunBasi(satirRow[0]) : isGunu;
        var hc = cikisHesapla(ss, ad, now, satirTarih, d.acikOff);
        sheet.getRange(satir, 4).setValue(hc.saat);
        sheet.getRange(satir, 7).setValue(hc.cikisNotu);
        sheet.getRange(satir, 17).setValue(now);
        sheet.getRange(satir, 17).setNumberFormat("dd.MM.yyyy HH:mm:ss");
        sheet.getRange(satir, 18).setValue(hedefSube);
        var yeniEnot = gunGenelNotuBelirle(satirRow, (satirRow[5] || "").toString(), hc.cikisNotu);
        sheet.getRange(satir, 5).setValue(yeniEnot);
        formulF(sheet, satir, ss);
        var sonRow = sheet.getRange(satir, 1, 1, 18).getValues()[0];
        var cMs = hc.saat.getTime() - d.acikGiris.getTime();
        if (cMs < 0) cMs += 24 * 3600 * 1000;
        var toplamDk = Math.round(cMs / 60000);
        if (toplamDk < 0 || toplamDk >= 1440) toplamDk = 0;
        var normalSaatQ = ayarAl(ss, "GUNLUK_NORMAL_SAAT", 10);
        var fazlaDk = d.acikOff ? toplamDk : (toplamDk - normalSaatQ * 60);
        var sure = sureMetin(toplamDk);
        logEkle(ss, ad, "QR_CIKIS", "Çıkış: " + saatDk(hc.saat) + " (gerçek " + saatDk(now) + ") - " + hc.cikisNotu + " - toplam " + sure + ", fazla/eksik " + dkMetin(fazlaDk), hedefSube);
        var fazlaHtml = d.acikOff ? '<br><span style="color:#7c3aed;font-weight:700">Off günü çalışması: ' + htmlEsc(sure) + ' tamamı fazla mesai</span>' : '<br>Fazla/eksik mesai: <b style="color:' + (fazlaDk < 0 ? '#ff7b72' : '#a5d6ff') + '">' + htmlEsc(dkMetin(fazlaDk)) + '</b>';
        return msg("Çıkış Alındı", '<b>' + htmlEsc(ad) + '</b><br>Giriş: <b>' + saatDk(d.acikGiris) + '</b> &nbsp; Çıkış: <b>' + saatDk(hc.saat) + '</b>' + (hc.saat.getTime() !== now.getTime() ? '<br><span style="font-size:12px">(gerçek çıkış ' + saatDk(now) + ', ' + htmlEsc(hc.cikisNotu) + ')</span>' : '') + fazlaHtml, "#3f7d4f", now, sure, "✓");
      }

      if (bugunGirisTamam(sheet, ad, tStr)) return engelSayfasi(ad, d);

      var hg = girisHesapla(ss, ad, now, isGunu);
      var isTatil = resmiTatilMi(ss, isGunu);
      var girisSaati = hg.saat, girisNotu = hg.girisNotu, gunNotu = hg.gunNotu;
      if (kodsuzSupheli) { gunNotu = "⚠️ Şüpheli (Kod Yok)"; girisNotu = "QR okutulmadan / uzaktan giriş - doğrulanmadı"; girisSaati = now; }

      var bos = bugunBosSatirBul(sheet, ad, tStr);
      var yeniSatir;
      if (bos) {
        yeniSatir = bos.satir;
        sheet.getRange(yeniSatir, 3).setValue(girisSaati);
        sheet.getRange(yeniSatir, 5).setValue(gunNotu);
        sheet.getRange(yeniSatir, 6).setValue(girisNotu + (bos.tip === "devamsiz" ? " - devamsızlık işareti kaldırıldı" : ""));
        sheet.getRange(yeniSatir, 7).setValue("");
        sheet.getRange(yeniSatir, 11).setValue(isTatil ? 1 : "");
        if (bos.tip === "off") { sheet.getRange(yeniSatir, 10).setValue(1); hg.isOff = true; gunNotu = "Off Gününde Çalışıldı"; sheet.getRange(yeniSatir, 5).setValue(gunNotu); }
        if (bos.tip === "devamsiz") sheet.getRange(yeniSatir, 15).setValue("");
        sheet.getRange(yeniSatir, 16).setValue(now);
        sheet.getRange(yeniSatir, 18).setValue((kodsuzSupheli ? "ŞÜPHELİ - " : "") + hedefSube);
      } else {
        yeniSatir = usteEkle(sheet, [isGunu, ad, girisSaati, "", gunNotu, girisNotu, "", "", "", hg.isOff ? 1 : "", isTatil ? 1 : "", "", "", "", "", now, "", (kodsuzSupheli ? "ŞÜPHELİ - " : "") + hedefSube]);
      }
      sheet.getRange(yeniSatir, 1).setNumberFormat("dd.MM.yyyy");
      sheet.getRange(yeniSatir, 16).setNumberFormat("dd.MM.yyyy HH:mm:ss");
      formulF(sheet, yeniSatir, ss);
      logEkle(ss, ad, "QR_GIRIS", "Giriş: " + saatDk(girisSaati) + " (gerçek " + saatDk(now) + ") - " + girisNotu, hedefSube);
      try {
        if (hg.isOff) waOlayBildir(ss, ad, pObj.telefon, "🔴 OFF GÜNÜ ÇALIŞMA: " + ad + " off gününde " + saatDk(now) + "'de giriş yaptı.", "Merhaba " + ad + ", off gününde " + saatDk(now) + " girişin alındı; tüm süre fazla mesai.", "off_gunu");
        else if (bos && bos.tip === "devamsiz") waOlayBildir(ss, ad, "-", "🟠 GEÇ GELDİ: " + ad + " devamsız işaretlenmişti, " + saatDk(now) + "'de giriş yaptı.", "", "gec_geldi");
        else if (hg.erkenDk > 60) waOlayBildir(ss, ad, "-", "🟠 ERKEN GELİŞ: " + ad + " vardiyasından " + hg.erkenDk + " dk önce (" + saatDk(now) + ") geldi; giriş " + saatDk(girisSaati) + " yazıldı.", "", "erken_giris");
      } catch (waErr) {}
      var vardiyaMetni = hg.vTip ? (" (vardiya: " + hg.vTip + ")") : "";
      var tatilHtml = isTatil ? '<br><span style="color:#c2410c;font-weight:700">🎌 Resmi tatil - çalıştığın saat kadar ek ücret yazılacak (en fazla 10 sa)</span>' : '';
      var girisAciklama = (girisSaati.getTime() !== now.getTime()) ? '<br><span style="font-size:12px">Gerçek geliş ' + saatDk(now) + '; ' + htmlEsc(girisNotu) + '</span>' : (hg.gecDk > 0 ? '<br><span style="font-size:12px">' + htmlEsc(girisNotu) + '</span>' : '');
      return msg("Giriş Alındı", '<b>' + htmlEsc(ad) + '</b><br>Giriş saati: <b>' + saatDk(girisSaati) + '</b>' + htmlEsc(vardiyaMetni) + girisAciklama + (hg.isOff ? '<br><span style="color:#7c3aed;font-weight:700">Off günü çalışması - tüm süre fazla mesai</span>' : '') + tatilHtml + '<br><span style="font-size:12px;color:#8b949e">Çıkışta QR\'ı tekrar okut, onay ekranı gelecek.</span>', "#2563eb", now, null, "✓");
    } finally { kilitBirak(lock); }
  } catch (err) {
    return msg("Sistem Hatası", "İşlem sırasında bir hata oluştu: " + htmlEsc(err.toString()), "#b23b3b", new Date(), null, "✖");
  }
}

function izinTalebiSatirlariEkle(ss, ad, talepTipi, basTarihStr, bitTarihStr, aciklama) {
  try {
    var sheet = anaSayfa(ss);
    var bas = new Date(basTarihStr), bit = new Date(bitTarihStr);
    if (isNaN(bas.getTime()) || isNaN(bit.getTime()) || bit < bas) return false;
    if ((bit - bas) > 62 * 24 * 3600 * 1000) return false;
    var data = sheet.getDataRange().getValues();
    var mevcutGunler = {};
    for (var i = 1; i < data.length; i++) { if ((data[i][1] || "").toString().trim().toLowerCase() !== ad.toLowerCase()) continue; if (data[i][0] instanceof Date) mevcutGunler[anahtarTarih(data[i][0])] = true; }
    var isYillik = (talepTipi === "Yıllık İzin"), isRapor = (talepTipi === "Rapor"), isUcretsiz = (talepTipi === "Ücretsiz İzin"), isDevamsiz = (talepTipi === "Devamsız");
    var curr = gunBasi(bas), son = gunBasi(bit);
    while (curr <= son) {
      var tStr = anahtarTarih(curr);
      if (!mevcutGunler[tStr]) {
        var rIdx = usteEkle(sheet, [new Date(curr), ad, "", "", talepTipi, aciklama || (talepTipi + " işlendi"), "", 0, "", "", "", isYillik ? 1 : "", isRapor ? 1 : "", isUcretsiz ? 1 : "", isDevamsiz ? 1 : "", "", "", "Panel Talebi"]);
        sheet.getRange(rIdx, 1).setNumberFormat("dd.MM.yyyy");
      }
      curr.setDate(curr.getDate() + 1);
    }
    return true;
  } catch (e) { return false; }
}

function personelGuncelleKaydet(ss, P) {
  var pSheet = ss.getSheetByName("Personel");
  if (!pSheet) return;
  var satirNo = parseInt((P.pRow || "").toString(), 10);
  if (!satirNo || satirNo < 2 || satirNo > pSheet.getLastRow()) return;
  var cikis = (P.pCikis || "").toString().trim();
  var durumS = (P.pDurum || "Aktif").toString().trim();
  var aktif = (cikis !== "") ? false : (durumS === "Aktif");
  pSheet.getRange(satirNo, 1).setValue((P.pAd || "").toString());
  if ((P.pGiris || "").toString()) pSheet.getRange(satirNo, 2).setValue(new Date(P.pGiris));
  if (cikis) pSheet.getRange(satirNo, 3).setValue(new Date(cikis)); else pSheet.getRange(satirNo, 3).setValue("");
  pSheet.getRange(satirNo, 4).setValue(parseFloat(P.pMaas || 0) || 0);
  pSheet.getRange(satirNo, 5).setValue(aktif);
  var telC = pSheet.getRange(satirNo, 7); telC.setNumberFormat("@"); telC.setValue((P.pTel || "").toString());
  pSheet.getRange(satirNo, 9).setValue((P.pAyril || "").toString());
  pSheet.getRange(satirNo, 11).setValue((P.pSube || "").toString());
  pSheet.getRange(satirNo, 12).setValue((P.pDept || "").toString());
  var ibanC = pSheet.getRange(satirNo, 15); ibanC.setNumberFormat("@"); ibanC.setValue((P.pIban || "").toString());
  logEkle(ss, "Yönetici", "PERSONEL_GUNCELLENDI", (P.pAd || "").toString() + " güncellendi", "-");
}

function vardiyaCizelgeKaydet(ss, P) {
  var vSheet = ss.getSheetByName("Vardiya");
  if (!vSheet) { vSheet = ss.insertSheet("Vardiya"); vSheet.appendRow(["Hafta (Pazartesi)", "İsim Soyisim", "Şube", "Planlanan", "Off", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]); }
  var hafta = (P.vhafta || "").toString().trim();
  if (!hafta) return;
  var lock = kilitAl();
  try {
    var data = vSheet.getDataRange().getValues();
    for (var r = data.length - 1; r >= 1; r--) { if (haftaKey(data[r][0]) === hafta) vSheet.deleteRow(r + 1); }
    var pList = personelBilgi(ss);
    var subeMap = {};
    for (var s = 0; s < pList.length; s++) subeMap[pList[s].ad.toLowerCase()] = pList[s].sube || "";
    var gunler = ["pzt", "sal", "car", "per", "cum", "cmt", "paz"];
    var satirlar = [];
    for (var idx = 0; idx < 200; idx++) {
      var ad = P["ad_" + idx];
      if (ad === null || ad === undefined || ad === "") continue;
      var gunVerileri = [], planlananSaat = 0, offSayisi = 0;
      for (var gg = 0; gg < 7; gg++) { var deger = (P[gunler[gg] + "_" + idx] || "").toString(); if (deger === "-- Seçiniz --") deger = ""; gunVerileri.push(deger); if (deger === "Off") offSayisi++; else if (VARDIYALAR[deger] && VARDIYALAR[deger][2]) planlananSaat += VARDIYALAR[deger][2]; }
      satirlar.push([hafta, ad, subeMap[ad.toLowerCase()] || "", planlananSaat, offSayisi].concat(gunVerileri));
    }
    if (satirlar.length) vSheet.getRange(vSheet.getLastRow() + 1, 1, satirlar.length, 12).setValues(satirlar);
    try { _VARDIYA_CACHE = vSheet.getDataRange().getValues(); } catch (eC) { _VARDIYA_CACHE = null; }
    logEkle(ss, "Yönetici", "VARDIYA_KAYDEDILDI", hafta + " haftası, " + satirlar.length + " kişi", "-");
  } finally { kilitBirak(lock); }
}

function yeniPersonelEkle(ss, P) {
  var pSheet = ss.getSheetByName("Personel");
  if (!pSheet) return;
  var ad = (P.ypAd || "").toString().trim();
  if (!ad) return;
  var yeniSatir = pSheet.getLastRow() + 1;
  pSheet.getRange(yeniSatir, 1).setValue(ad);
  pSheet.getRange(yeniSatir, 2).setValue(new Date());
  pSheet.getRange(yeniSatir, 4).setValue(parseFloat(P.ypMaas || 0) || 0);
  pSheet.getRange(yeniSatir, 5).setValue(true);
  var pinC = pSheet.getRange(yeniSatir, 6); pinC.setNumberFormat("@"); pinC.setValue("");
  var telC = pSheet.getRange(yeniSatir, 7); telC.setNumberFormat("@"); telC.setValue((P.ypTel || "").toString().trim());
  pSheet.getRange(yeniSatir, 8).setValue(((P.ypSgk || "").toString().trim() === "evet"));
  pSheet.getRange(yeniSatir, 11).setValue((P.ypSube || "").toString().trim());
  pSheet.getRange(yeniSatir, 12).setValue((P.ypDept || "").toString().trim());
  var ibanC = pSheet.getRange(yeniSatir, 15); ibanC.setNumberFormat("@"); ibanC.setValue((P.ypIban || "").toString().trim());
  pSheet.getRange(yeniSatir, 16).setValue((P.ypYetkinlik || "").toString().trim());
  logEkle(ss, "Yönetici", "PERSONEL_EKLENDI", ad, "-");
}

// ==========================================
// OTOMATİK GÖREVLER
// ==========================================


function eksikCikislariTamamla() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = anaSayfa(ss);
  if (!sheet) return [];
  var simdi = new Date();
  var isGunuBugun = isGunuTarihi(simdi);
  var normalSaat = ayarAl(ss, "GUNLUK_NORMAL_SAAT", 10);
  var sonSatir = sheet.getLastRow();
  if (sonSatir < 2) return [];
  var veri = sheet.getRange(2, 1, sonSatir - 1, 18).getValues();
  var islenenler = [];
  for (var idx = 0; idx < veri.length; idx++) {
    var row = veri[idx];
    var satir = idx + 2;
    var ad = (row[1] || "").toString().trim();
    if (!ad) continue;
    var rTar = row[0];
    if (!(rTar instanceof Date)) continue;
    var rGun = gunBasi(rTar);
    if (rGun >= isGunuBugun) continue;
    var giris = row[2], cikis = row[3];
    if (!(giris instanceof Date) || (cikis instanceof Date)) continue;
    var eNot = (row[4] || "").toString();
    var offMu = (row[9] === 1 || row[9] === "1" || eNot.indexOf("Off Gününde") > -1);
    var yeniCikis = null, notu;
    if (offMu) {
      var gunNo = rGun.getDay();
      var kapanis = (gunNo === 5 || gunNo === 6) ? ayarAl(ss, "KAPANIS_SAAT_CUMA_CMT", 24) : ayarAl(ss, "KAPANIS_SAAT", 23);
      yeniCikis = new Date(rGun.getTime() + kapanis * 3600000);
      if (yeniCikis <= giris) yeniCikis = new Date(giris.getTime() + 60000);
      notu = "Çıkış okutulmadı - sistem kapanış saatini (" + String(kapanis % 24).padStart(2, '0') + ":00) yazdı, yönetici kontrol etmeli";
    } else {
      yeniCikis = vardiyaBitis(ss, ad, rGun);
      if (!yeniCikis || yeniCikis <= giris) yeniCikis = new Date(giris.getTime() + normalSaat * 3600000);
      notu = "Çıkış okutulmadı - sistem vardiya bitişini yazdı (fazla mesai yok)";
    }
    var dCell = sheet.getRange(satir, 4);
    dCell.setValue(yeniCikis); dCell.setNumberFormat("HH:mm:ss");
    sheet.getRange(satir, 7).setValue(notu);
    var rowSon = sheet.getRange(satir, 1, 1, 18).getValues()[0];
    sheet.getRange(satir, 5).setValue(gunGenelNotuBelirle(rowSon, (rowSon[5] || "").toString(), notu));
    formulF(sheet, satir, ss);
    logEkle(ss, ad, "SISTEM_CIKIS", anahtarTarih(rGun) + " - " + notu, "-");
    islenenler.push(ad + " (" + anahtarTarih(rGun) + " → " + saatDk(yeniCikis) + ")");
    var pTel = "-"; try { var pp = personelBul(ss, ad); if (pp) pTel = pp.telefon; } catch (e) {}
    waOlayBildir(ss, ad, pTel, null, "Merhaba " + ad + ", " + anahtarTarih(rGun) + " günü çıkış okutmadığın için çıkışın " + saatDk(yeniCikis) + " olarak sistem tarafından yazıldı.", "cikis_yok");
  }
  return islenenler;
}

function gunlukDevamsizIsaretle() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = anaSayfa(ss);
  if (!sheet || !ss.getSheetByName("Vardiya")) return;
  onbellekleriDoldur(ss);
  var lock = kilitAl();
  try {
    var bugun = gunBasi(new Date());
    var bugunKey = anahtarTarih(bugun);
    var pList = personelBilgi(ss);
    var gcData = sheet.getDataRange().getValues();
    for (var i = 0; i < pList.length; i++) {
      var pers = pList[i];
      if (!pers.aktif) continue;
      if (pers.iseGirisDate instanceof Date && gunBasi(pers.iseGirisDate) > bugun) continue;
      var vTip = personelGunlukVardiyaAl(ss, pers.ad, bugun);
      if (!vTip || vTip === "Off" || vTip === "Yıllık izin" || vTip === "Ücretsiz izin") continue;
      var zatenVar = false;
      for (var r = 1; r < gcData.length; r++) { if ((gcData[r][0] instanceof Date) && anahtarTarih(gcData[r][0]) === bugunKey && (gcData[r][1] || "").toString().trim().toLowerCase() === pers.ad.toLowerCase()) { zatenVar = true; break; } }
      if (zatenVar) continue;
      var yeniSatir = usteEkle(sheet, [bugun, pers.ad, "", "", "Devamsızlık", "", "Devamsız", 0, "", "", "", "", "", "", 1, "", "", "Otomatik Devamsız"]);
      sheet.getRange(yeniSatir, 1).setNumberFormat("dd.MM.yyyy");
      logEkle(ss, pers.ad, "DEVAMSIZ", "Vardiyası (" + vTip + ") olduğu halde 17:00'ye kadar giriş yok", "-");
      waOlayBildir(ss, pers.ad, pers.telefon, "🔴 DEVAMSIZLIK: " + pers.ad + " bugün vardiyası (" + vTip + ") olduğu halde giriş yapmadı.", "Merhaba " + pers.ad + ", bugün vardiyan olduğu halde giriş kaydın yok; devamsız işaretlendin. Geldiysen QR okut, kayıt düzelir.", "devamsiz");
    }
  } finally { kilitBirak(lock); _AYAR_CACHE = null; _VARDIYA_CACHE = null; }
}

function gunlukOzetGonder(ss, isGunu, sistemCikislari) {
  var sheet = anaSayfa(ss);
  if (!sheet) return;
  var key = anahtarTarih(isGunu);
  var normalSaat = ayarAl(ss, "GUNLUK_NORMAL_SAAT", 10);
  var data = sheet.getDataRange().getValues();
  var devamsiz = [], gec = [], erkenCikis = [], fazlaMesai = [], offCalisan = [], supheli = [], acikKalan = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!(row[0] instanceof Date) || anahtarTarih(row[0]) !== key) continue;
    var ad = (row[1] || "").toString().trim();
    if (!ad) continue;
    var eNot = (row[4] || "").toString(), fNot = (row[5] || "").toString(), gNot = (row[6] || "").toString();
    var girisVar = (row[2] instanceof Date), cikisVar = (row[3] instanceof Date);
    var offMu = (row[9] === 1 || row[9] === "1");
    if (!girisVar && (row[14] === 1 || row[14] === "1")) devamsiz.push(ad);
    if (fNot.indexOf("Geç") > -1) gec.push(ad + " " + saatDk(row[2]));
    if (gNot.indexOf("Erken Çıkış") > -1) erkenCikis.push(ad + " " + saatDk(row[3]));
    if (eNot.indexOf("Şüpheli") > -1) supheli.push(ad);
    if (girisVar && !cikisVar) acikKalan.push(ad);
    if (girisVar && cikisVar) {
      var ms = row[3].getTime() - row[2].getTime();
      if (ms < 0) ms += 24 * 3600 * 1000;
      var tDk = Math.round(ms / 60000);
      if (tDk < 0 || tDk >= 1440) tDk = 0;
      if (offMu) offCalisan.push(ad + " " + sureMetin(tDk));
      else { var fm = tDk - normalSaat * 60; if (fm > 0 && gNot.toLowerCase().indexOf("sistem") < 0) fazlaMesai.push(ad + " " + dkMetin(fm)); }
    }
  }
  var satirlar = ["📋 " + key + " GÜNLÜK ÖZET"];
  satirlar.push("Devamsız: " + (devamsiz.length ? devamsiz.join(", ") : "yok"));
  satirlar.push("Çıkış okutmayan (sistem yazdı): " + (sistemCikislari && sistemCikislari.length ? sistemCikislari.join(", ") : "yok"));
  satirlar.push("Geç gelen: " + (gec.length ? gec.join(", ") : "yok"));
  satirlar.push("Erken çıkan: " + (erkenCikis.length ? erkenCikis.join(", ") : "yok"));
  satirlar.push("Fazla mesai: " + (fazlaMesai.length ? fazlaMesai.join(", ") : "yok"));
  satirlar.push("Off günü çalışan: " + (offCalisan.length ? offCalisan.join(", ") : "yok"));
  if (supheli.length) satirlar.push("⚠️ Şüpheli giriş: " + supheli.join(", "));
  if (acikKalan.length) satirlar.push("⚠️ Hâlâ açık kayıt: " + acikKalan.join(", "));
  var metin = satirlar.join("\n");
  logEkle(ss, "Sistem", "GUNLUK_OZET", metin.replace(/\n/g, " | "), "-");
  waBildirimGonder(ss, ayarAl(ss, "YONETICI_TEL", "905325550253"), "Yönetici", metin, "gunluk_ozet");
}

function gece_kontrol() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  onbellekleriDoldur(ss);
  var lock = kilitAl();
  var sistemCikislari = [];
  try { try { gunlukOffIsaretle(); } catch (e1) {} try { sistemCikislari = eksikCikislariTamamla() || []; } catch (e2) {} } finally { kilitBirak(lock); }
  try { gunlukOzetGonder(ss, isGunuTarihi(new Date()), sistemCikislari); } catch (e3) {}
  _AYAR_CACHE = null; _VARDIYA_CACHE = null;
}

function tetikleyicileriKur() {
  var eskiler = ["gece_kontrol", "gunlukDevamsizIsaretle", "eksikCikislariTamamla", "gunlukOffIsaretle"];
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) { if (eskiler.indexOf(triggers[i].getHandlerFunction()) > -1) ScriptApp.deleteTrigger(triggers[i]); }
  ScriptApp.newTrigger("gece_kontrol").timeBased().everyDays(1).atHour(3).create();
  ScriptApp.newTrigger("gunlukDevamsizIsaretle").timeBased().everyDays(1).atHour(17).create();
}
function offTetikleyiciKur() { tetikleyicileriKur(); }
function eksikCikisTetikleyiciKur() { tetikleyicileriKur(); }
function devamsizTetikleyiciKur() { tetikleyicileriKur(); }

// ==========================================
// TEK SEFERLİK (gerektiğinde tekrar da çalıştırılabilir):
// Resmi tatil işaretlerini geriye dönük düzeltir.
// Resmi_tatiller sekmesindeki (A veya B sütunu) tüm tarihler için,
// o gün GİRİŞİ OLAN puantaj satırlarında K sütununa (resmi tatil) 1 yazar.
// Tatil listesinde OLMAYAN günlerdeki yanlış işaretleri de temizler.
// ==========================================
function resmiTatilleriYenidenIsaretle() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = anaSayfa(ss);
  var rSheet = ss.getSheetByName("Resmi_tatiller");
  if (!sheet || !rSheet) { try { SpreadsheetApp.getUi().alert("Personel_Giris_Cikis veya Resmi_tatiller sekmesi bulunamadı."); } catch (e) {} return; }
  var tatilSet = {};
  var rData = rSheet.getDataRange().getValues();
  for (var i = 1; i < rData.length; i++) {
    for (var c = 0; c < 2 && c < rData[i].length; c++) {
      var t = parseTarih(rData[i][c]);
      if (t) tatilSet[anahtarTarih(t)] = true;
    }
  }
  var sonSatir = sheet.getLastRow();
  if (sonSatir < 2) return;
  var veri = sheet.getRange(2, 1, sonSatir - 1, 11).getValues();
  var isaretlenen = 0, temizlenen = 0;
  for (var r = 0; r < veri.length; r++) {
    var row = veri[r];
    if (!(row[0] instanceof Date)) continue;
    var key = anahtarTarih(row[0]);
    var girisVar = (row[2] instanceof Date);
    var mevcutStr = (row[10] || "").toString().trim();
    var mevcutFlag = (row[10] === 1 || mevcutStr === "1" || mevcutStr.toLowerCase().indexOf("resmi") > -1);
    if (tatilSet[key] && girisVar && !mevcutFlag) { sheet.getRange(r + 2, 11).setValue(1); isaretlenen++; }
    if (!tatilSet[key] && mevcutFlag) { sheet.getRange(r + 2, 11).setValue(""); temizlenen++; }
  }
  logEkle(ss, "Sistem", "RESMI_TATIL_ISARET", "İşaretlenen: " + isaretlenen + ", temizlenen: " + temizlenen, "-");
  try { SpreadsheetApp.getUi().alert("Resmi tatil işaretleri güncellendi.\nYeni işaretlenen: " + isaretlenen + "\nYanlış işaret temizlenen: " + temizlenen + "\n\nTatil listesi (A/B sütunları) toplam " + Object.keys(tatilSet).length + " gün içeriyor."); } catch (e) {}
}

// ==========================================
// TEK SEFERLİK: Islem_Loglari temizleme
// Boş satırları ve PANEL_ACILDI kayıtlarını siler (log şişmesini geri alır). Önce yedek.
// ==========================================
function loglariTemizle() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName("Islem_Loglari");
  if (!logSheet) { try { SpreadsheetApp.getUi().alert("Islem_Loglari bulunamadı"); } catch (e) {} return; }
  var sonSatir = logSheet.getLastRow();
  if (sonSatir < 2) return;
  var tarihEk = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyyMMdd_HHmmss");
  var yedek = logSheet.copyTo(ss); yedek.setName("YEDEK_Log_" + tarihEk);
  ss.setActiveSheet(logSheet);
  var data = logSheet.getRange(1, 1, sonSatir, 5).getValues();
  var baslik = data[0];
  var tutulan = [];
  var silinenPanel = 0, silinenBos = 0;
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var bosMu = !(r[0]) && !(r[1]) && !(r[2]) && !(r[3]);
    var islemTipi = (r[2] || "").toString();
    if (bosMu) { silinenBos++; continue; }
    if (islemTipi === "PANEL_ACILDI") { silinenPanel++; continue; }
    tutulan.push(r);
  }
  logSheet.clearContents();
  logSheet.getRange(1, 1, 1, 5).setValues([baslik]);
  if (tutulan.length) logSheet.getRange(2, 1, tutulan.length, 5).setValues(tutulan);
  logSheet.getRange(2, 1, Math.max(tutulan.length, 1), 1).setNumberFormat("dd.MM.yyyy HH:mm:ss");
  try { SpreadsheetApp.getUi().alert("Log temizlendi.\nSilinen boş satır: " + silinenBos + "\nSilinen PANEL_ACILDI: " + silinenPanel + "\nKalan kayıt: " + tutulan.length + "\n\nYedek: YEDEK_Log_" + tarihEk); } catch (e) {}
}

// ==========================================
// TEK SEFERLİK: Tüm kayıtları YENİ kurallarla yeniden hesapla
// ==========================================
function topluYenidenHesapla() {
  var BASLANGIC = new Date(2026, 7, 1);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = anaSayfa(ss);
  if (!sheet) return;
  var sonSatir = sheet.getLastRow();
  if (sonSatir < 2) return;
  var tarihEk = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyyMMdd_HHmmss");
  var yedek = sheet.copyTo(ss); yedek.setName("YEDEK_YenidenHesap_" + tarihEk);
  ss.setActiveSheet(yedek); ss.moveActiveSheet(ss.getNumSheets()); ss.setActiveSheet(sheet);
  onbellekleriDoldur(ss);
  var lockT = kilitAl();
  var islenen = 0;
  try {
    var normalSaat = ayarAl(ss, "GUNLUK_NORMAL_SAAT", 10);
    var veri = sheet.getRange(2, 1, sonSatir - 1, 18).getValues();
    var cikti = [];
    for (var idx = 0; idx < veri.length; idx++) {
      var row = veri[idx];
      var mevcut = [row[2], row[3], row[4], row[5], row[6], row[7], row[8]];
      var ad = (row[1] || "").toString().trim();
      if (!ad || !(row[0] instanceof Date) || gunBasi(row[0]) < BASLANGIC) { cikti.push(mevcut); continue; }
      var rGun = gunBasi(row[0]);
      var yeniRow = row.slice();
      if (row[2] instanceof Date) {
        var eNot = (row[4] || "").toString();
        var offMu = (row[9] === 1 || row[9] === "1" || eNot.indexOf("Off Gününde") > -1);
        var hamGiris = (row[15] instanceof Date) ? row[15] : row[2];
        var hamCikis = (row[16] instanceof Date) ? row[16] : ((row[3] instanceof Date) ? row[3] : null);
        var gNotEski = (row[6] || "").toString();
        var hg = new Date(rGun.getFullYear(), rGun.getMonth(), rGun.getDate(), hamGiris.getHours(), hamGiris.getMinutes(), hamGiris.getSeconds());
        if (hamGiris.getHours() < IS_GUNU_SINIR_SAAT) hg.setDate(hg.getDate() + 1);
        var hGiris = offMu ? { saat: hg, girisNotu: "Off Günü Mesai Başlangıcı (gerçek saat " + saatDk(hg) + ")", gunNotu: "Off Gününde Çalışıldı" } : girisHesapla(ss, ad, hg, rGun);
        yeniRow[2] = hGiris.saat; yeniRow[5] = hGiris.girisNotu;
        var cikisNotu = gNotEski;
        if (hamCikis && gNotEski.toLowerCase().indexOf("sistem") < 0) {
          var hc0 = new Date(rGun.getFullYear(), rGun.getMonth(), rGun.getDate(), hamCikis.getHours(), hamCikis.getMinutes(), hamCikis.getSeconds());
          if (hc0 < hGiris.saat) hc0.setDate(hc0.getDate() + 1);
          var hCikis = cikisHesapla(ss, ad, hc0, rGun, offMu);
          yeniRow[3] = hCikis.saat; yeniRow[6] = hCikis.cikisNotu; cikisNotu = hCikis.cikisNotu;
        }
        yeniRow[4] = gunGenelNotuBelirle(yeniRow, hGiris.girisNotu, cikisNotu);
      }
      var hi = hiHesapla(yeniRow, normalSaat);
      yeniRow[7] = hi.h; yeniRow[8] = hi.i;
      cikti.push([yeniRow[2], yeniRow[3], yeniRow[4], yeniRow[5], yeniRow[6], yeniRow[7], yeniRow[8]]);
      islenen++;
    }
    var hedef = sheet.getRange(2, 3, cikti.length, 7);
    hedef.setValues(cikti);
    sheet.getRange(2, 3, cikti.length, 2).setNumberFormat("HH:mm:ss");
    sheet.getRange(2, 8, cikti.length, 1).setNumberFormat("[h]:mm:ss");
    sheet.getRange(2, 9, cikti.length, 1).setNumberFormat("[h]:mm:ss;-[h]:mm:ss");
    SpreadsheetApp.flush();
  } finally { kilitBirak(lockT); _AYAR_CACHE = null; _VARDIYA_CACHE = null; }
  logEkle(ss, "Sistem", "TOPLU_YENIDEN_HESAP", islenen + " satır yeniden hesaplandı. Yedek: YEDEK_YenidenHesap_" + tarihEk, "-");
  try { SpreadsheetApp.getUi().alert(islenen + " satır yeni kurallarla yeniden hesaplandı.\n\nYedek: YEDEK_YenidenHesap_" + tarihEk); } catch (e) {}
}

// ==========================================
// DENETİM: Bordro rakamları şüpheliyse çalıştır.
// DENETIM_AY içindeki ay için "Denetim_yyyy-MM" sekmesi oluşturur:
// her personelin her satırı, sayıldı mı / neden sayılmadı (mükerrer, tarih bozuk,
// işe girişten önce, çıkıştan sonra) ve kişi başı toplamlar görünür.
// ==========================================
var DENETIM_AY = "2026-08"; // denetlenecek ay (yyyy-MM)

function puantajDenetim() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = anaSayfa(ss);
  if (!sheet) return;
  onbellekleriDoldur(ss);
  try {
    var pr = DENETIM_AY.split("-");
    var yil = parseInt(pr[0], 10), ay = parseInt(pr[1], 10) - 1;
    var normalSaat = ayarAl(ss, "GUNLUK_NORMAL_SAAT", 10);
    var pList = personelBilgi(ss);
    var gc = sheet.getDataRange().getValues();
    var adiSayfa = "Denetim_" + DENETIM_AY;
    var eskiSh = ss.getSheetByName(adiSayfa);
    if (eskiSh) ss.deleteSheet(eskiSh);
    var dSh = ss.insertSheet(adiSayfa);
    var satirlar = [["Personel", "Sayfa Satır No", "Tarih", "Giriş (Yazılan)", "Ham Giriş (QR)", "Çıkış (Yazılan)", "Ham Çıkış (QR)", "Toplam", "Fazla/Eksik", "Off", "Resmi Tatil", "Yuvarlama Kontrolü", "Durum / Neden"]];
    var oncelik = function (row) { return ((row[2] instanceof Date) ? 2 : 0) + ((row[3] instanceof Date) ? 1 : 0); };
    for (var pi = 0; pi < pList.length; pi++) {
      var pers = pList[pi];
      if (!ayIcindeCalismisMi(pers, yil, ay)) continue;
      var adKey = pers.ad.toLowerCase();
      var kayitlar = []; // {rowNo, row, rt, key, durum}
      for (var r = 1; r < gc.length; r++) {
        var row = gc[r];
        if ((row[1] || "").toString().trim().toLowerCase() !== adKey) continue;
        var rt = row[0];
        if (!(rt instanceof Date)) {
          var pd = parseTarih(rt);
          if (pd && pd.getFullYear() === yil && pd.getMonth() === ay) kayitlar.push({ rowNo: r + 1, row: row, rt: pd, key: anahtarTarih(pd), durum: "SAYILMADI: Tarih hücresi METİN (tarihe çevir!)" });
          continue;
        }
        if (rt.getFullYear() !== yil || rt.getMonth() !== ay) continue;
        var durum = "";
        if (pers.cikisTarihi instanceof Date && gunBasi(rt) > gunBasi(pers.cikisTarihi)) durum = "SAYILMADI: İşten çıkış tarihinden sonra";
        else if (pers.iseGirisDate instanceof Date && gunBasi(rt) < gunBasi(pers.iseGirisDate)) durum = "SAYILMADI: İşe giriş tarihinden önce";
        kayitlar.push({ rowNo: r + 1, row: row, rt: rt, key: anahtarTarih(rt), durum: durum });
      }
      // Gün bazında hangi satır kullanılıyor? (kisiAyOzet ile aynı mantık)
      var secilen = {};
      for (var k1 = 0; k1 < kayitlar.length; k1++) {
        var kk = kayitlar[k1];
        if (kk.durum) continue;
        if (!secilen[kk.key] || oncelik(kk.row) > oncelik(secilen[kk.key].row)) secilen[kk.key] = kk;
      }
      var topFm = 0, topTatilDk = 0, topToplamDk = 0, gunSay = 0;
      kayitlar.sort(function (a, b) { return a.rt.getTime() - b.rt.getTime(); });
      for (var k2 = 0; k2 < kayitlar.length; k2++) {
        var kx = kayitlar[k2];
        var rw = kx.row;
        var eNot = (rw[4] || "").toString(), gNot = (rw[6] || "").toString();
        var girisVar = (rw[2] instanceof Date), cikisVar = (rw[3] instanceof Date);
        var off = (rw[9] === 1 || rw[9] === "1" || eNot.indexOf("Off Gününde") > -1);
        var rtVal = (rw[10] || "").toString().trim();
        var tatilMi = (rw[10] === 1 || rtVal === "1" || rtVal.toLowerCase().indexOf("resmi") > -1);
        var toplamDk = 0, fmDk = "";
        if (girisVar && cikisVar) {
          var ms = rw[3].getTime() - rw[2].getTime();
          if (ms < 0) ms += 24 * 3600 * 1000;
          toplamDk = Math.round(ms / 60000);
          if (toplamDk < 0 || toplamDk >= 1440) toplamDk = 0;
          if (off) fmDk = toplamDk;
          else { fmDk = toplamDk - normalSaat * 60; if (fmDk > 0 && gNot.toLowerCase().indexOf("sistem") > -1) fmDk = 0; }
        }
        var durumStr = kx.durum;
        if (!durumStr) {
          if (secilen[kx.key] === kx) {
            durumStr = "KULLANILDI";
            gunSay++;
            if (girisVar && cikisVar) { topToplamDk += toplamDk; topFm += (fmDk === "" ? 0 : fmDk); }
            if (girisVar && tatilMi && toplamDk > 0) topTatilDk += Math.min(toplamDk, normalSaat * 60);
          } else durumStr = "SAYILMADI: Aynı güne MÜKERRER kayıt (satır " + secilen[kx.key].rowNo + " kullanıldı)";
        }
        // Ham QR saatleri (P/Q sütunları) ile yazılan saatleri karşılaştır
        var hamG = (rw[15] instanceof Date) ? rw[15] : null;
        var hamC = (rw[16] instanceof Date) ? rw[16] : null;
        var yuvarNotlar = [];
        if (girisVar && hamG) {
          var farkG = (rw[2].getHours() * 60 + rw[2].getMinutes()) - (hamG.getHours() * 60 + hamG.getMinutes());
          if (farkG > 720 || farkG < -720) { /* gece yarısı sarkması - karşılaştırma anlamsız */ }
          else if (farkG < 0) yuvarNotlar.push("⚠️ UYARI: giriş, QR okutma saatinden ÖNCEYE yazılmış (" + (-farkG) + " dk)");
          else if (farkG > 0) {
            var ERKEN_TOL_D = ayarAl(ss, "ERKEN_TEYIT_DK", 25);
            var basD = null; try { basD = vardiyaBaslangic(ss, pers.ad, kx.rt); } catch (eB) {}
            var vardiyayaYazilmis = (basD && rw[2].getHours() === basD.getHours() && rw[2].getMinutes() === basD.getMinutes());
            if (farkG <= ERKEN_TOL_D) yuvarNotlar.push(farkG + " dk erken, vardiya saatine yuvarlandı (normal)");
            else if (vardiyayaYazilmis) yuvarNotlar.push("⚠️ ESKİ KURALLA YAZILMIŞ: " + farkG + " dk erken ama vardiya saatine yuvarlanmış - gerçek saat (" + saatDk(hamG) + ") yazılmalıydı, topluYenidenHesapla çalıştır");
            else if (rw[2].getMinutes() === 0 && rw[2].getSeconds() === 0) yuvarNotlar.push(farkG + " dk erken, üst tam saate yuvarlandı (60+ dk kuralı)");
            else yuvarNotlar.push("⚠️ UYARI: giriş ile ham okutma arasında " + farkG + " dk fark - kontrol et");
          }
        }
        if (cikisVar && hamC) {
          var farkC = (hamC.getHours() * 60 + hamC.getMinutes()) - (rw[3].getHours() * 60 + rw[3].getMinutes());
          if (farkC > 720 || farkC < -720) { /* sarkma */ }
          else if (farkC > 0 && farkC <= 30) yuvarNotlar.push("çıkış " + farkC + " dk aşağı yuvarlandı (tolerans, normal)");
          else if (farkC > 30) yuvarNotlar.push("⚠️ UYARI: çıkış " + farkC + " dk aşağı yuvarlanmış - tolerans üstü, kontrol et");
          else if (farkC < 0) yuvarNotlar.push("⚠️ UYARI: çıkış, QR okutma saatinden SONRAYA yazılmış (" + (-farkC) + " dk)");
        }
        satirlar.push([pers.ad, kx.rowNo, kx.key, girisVar ? saatDk(rw[2]) : "", hamG ? saatDk(hamG) : "", cikisVar ? saatDk(rw[3]) : "", hamC ? saatDk(hamC) : "", (girisVar && cikisVar) ? sureMetin(toplamDk) : "", (fmDk === "" ? "" : dkMetin(fmDk)), off ? "OFF" : "", tatilMi ? "TATİL" : "", yuvarNotlar.join(" · "), durumStr]);
      }
      satirlar.push(["≫ " + pers.ad + " TOPLAM", "", "", "", "", "", "", sureMetin(topToplamDk), dkMetin(topFm), "", topTatilDk > 0 ? ("+" + sureMetin(topTatilDk) + " tatil ek ücreti") : "", "", gunSay + " gün kaydı kullanıldı"]);
      satirlar.push(["", "", "", "", "", "", "", "", "", "", "", "", ""]);
    }
    dSh.getRange(1, 1, satirlar.length, 13).setValues(satirlar);
    dSh.getRange(1, 1, 1, 13).setFontWeight("bold");
    dSh.setFrozenRows(1);
    dSh.autoResizeColumns(1, 13);
    try { SpreadsheetApp.getUi().alert("Denetim tamamlandı: '" + adiSayfa + "' sekmesine bak.\n\n'SAYILMADI' yazan satırlar bordroya girmeyen kayıtlardır; nedenleri yanlarında yazıyor.\nMükerrer/bozuk satırları orada tespit edip Personel_Giris_Cikis'te düzeltebilirsin."); } catch (e) {}
  } finally { _AYAR_CACHE = null; _VARDIYA_CACHE = null; }
}// ==========================================
// ÖDEME TAKİBİ v2 (Odemeler sekmesi): Bordro & Puantaj'da "Ödenen" ve "Fark" kolonları, TOPLU kayıt
// Odemeler sütunları: A Ay (yyyy-MM) | B Personel | C Tutar | D Ödeme Tarihi | E Not | F Kayıt Zamanı
// ==========================================
function odemeSayfasi(ss) {
  var sh = ss.getSheetByName("Odemeler");
  if (!sh) {
    sh = ss.insertSheet("Odemeler");
    sh.appendRow(["Ay", "Personel", "Tutar", "Ödeme Tarihi", "Not", "Kayıt Zamanı"]);
    sh.getRange(1, 1, 1, 6).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function odemeAyStr_(ss, v) {
  return (v instanceof Date) ? Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), "yyyy-MM") : (v || "").toString().trim();
}

// Seçilen ay için kişi başı ödenen toplam: { "ad (küçük harf)": tutar }  — kayıt varsa 0 bile olsa anahtar bulunur
function odemeleriOku(ss, yil, ay) {
  var map = {};
  try {
    var sh = ss.getSheetByName("Odemeler");
    if (!sh) return map;
    var key = yil + "-" + String(ay + 1).padStart(2, '0');
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (odemeAyStr_(ss, data[i][0]) !== key) continue;
      var ad = (data[i][1] || "").toString().trim().toLowerCase();
      if (!ad) continue;
      var ham = data[i][2];
      var t = (typeof ham === "number") ? ham : parseFloat(String(ham || "0").replace(/\./g, "").replace(",", "."));
      if (isNaN(t)) t = 0;
      map[ad] = (map[ad] || 0) + t;
    }
  } catch (e) {}
  return map;
}

// Tek kişi kaydı: aynı ay + kişi varsa üstüne yazar, yoksa yeni satır. Kilit dışarıdan alınır.
function odemeSatirYaz_(ss, sh, ad, ayStr, tutar) {
  var data = sh.getDataRange().getValues();
  var bulunan = -1, eski = null;
  for (var i = 1; i < data.length; i++) {
    if (odemeAyStr_(ss, data[i][0]) === ayStr && (data[i][1] || "").toString().trim().toLowerCase() === ad.toLowerCase()) { bulunan = i + 1; eski = parseFloat(data[i][2]); break; }
  }
  var simdi = new Date();
  if (bulunan > 0) {
    if (!isNaN(eski) && Math.abs(eski - tutar) < 0.005) return false; // değişmemiş
    sh.getRange(bulunan, 3).setValue(tutar);
    sh.getRange(bulunan, 4).setValue(simdi);
    sh.getRange(bulunan, 6).setValue(simdi);
  } else {
    sh.appendRow([ayStr, ad, tutar, simdi, "", simdi]);
    bulunan = sh.getLastRow();
  }
  sh.getRange(bulunan, 1).setNumberFormat("@");
  sh.getRange(bulunan, 4).setNumberFormat("dd.MM.yyyy");
  sh.getRange(bulunan, 6).setNumberFormat("dd.MM.yyyy HH:mm:ss");
  logEkle(ss, "Yönetici", "ODEME_KAYDEDILDI", ad + " " + ayStr + ": " + ((eski !== null && !isNaN(eski)) ? tlMetin(eski) + " → " : "") + tlMetin(tutar), "-");
  return true;
}

function odemeTutarCoz_(v) {
  var ham = (v === null || v === undefined) ? "" : v.toString().trim().replace(/\s/g, "").replace(/₺/g, "");
  if (ham === "") return null;
  // 65.492,74 / 65492,74 / 65492.74 hepsini kabul et
  if (ham.indexOf(",") > -1) ham = ham.replace(/\./g, "").replace(",", ".");
  var t = parseFloat(ham);
  return isNaN(t) ? null : t;
}

// Toplu kayıt: oAd_0..oAd_N ve oTutar_0..oTutar_N; boş bırakılan kutular atlanır
function odemeTopluKaydet(ss, P) {
  var ayStr = (P.ay || "").toString().trim();
  if (!/^\d{4}-\d{2}$/.test(ayStr)) return;
  var lock = kilitAl();
  try {
    var sh = odemeSayfasi(ss);
    var yazilan = 0;
    for (var idx = 0; idx < 300; idx++) {
      var ad = (P["oAd_" + idx] || "").toString().trim();
      if (!ad) continue;
      var tutar = odemeTutarCoz_(P["oTutar_" + idx]);
      if (tutar === null) continue;
      if (odemeSatirYaz_(ss, sh, ad, ayStr, tutar)) yazilan++;
    }
    if (yazilan) logEkle(ss, "Yönetici", "ODEME_TOPLU", ayStr + " için " + yazilan + " kişi kaydedildi", "-");
  } finally { kilitBirak(lock); }
}

// Tek kişi kaydı (eski satır başı düğmesi için, formlar kaldırıldı ama uyumluluk kalsın)
function odemeKaydet(ss, P) {
  var ad = (P.oAd || "").toString().trim();
  var ayStr = (P.ay || "").toString().trim();
  var tutar = odemeTutarCoz_(P.oTutar);
  if (!ad || !/^\d{4}-\d{2}$/.test(ayStr) || tutar === null) return;
  var lock = kilitAl();
  try { odemeSatirYaz_(ss, odemeSayfasi(ss), ad, ayStr, tutar); } finally { kilitBirak(lock); }
}

// Puantaj satırındaki "Ödenen" (giriş kutusu) ve "Fark" hücreleri — tablo tek bir formun içinde
function odemeHucreleri(it, idx) {
  var odenen = it.odenen || 0;
  var kayitVar = !!it.odenenVar;
  var inp = 'width:110px;padding:6px 8px;font-size:13px;font-weight:700;color:#0f172a;text-align:right';
  var deger = kayitVar ? String(Math.round(odenen * 100) / 100).replace(".", ",") : '';
  var kutu = '<input type="hidden" name="oAd_' + idx + '" value="' + htmlEsc(it.ad) + '">' +
    '<input type="text" inputmode="decimal" name="oTutar_' + idx + '" value="' + deger + '" placeholder="₺" style="' + inp + '">';
  var farkHtml;
  if (!kayitVar) farkHtml = '<span style="color:#94a3b8">-</span>';
  else {
    var fark = Math.round(odenen - it.aySonuNet);
    if (fark === 0) farkHtml = '<span style="color:#15803d;font-weight:800">✓ Tam</span>';
    else if (fark < 0) farkHtml = '<span style="color:#dc2626;font-weight:800">' + tlMetin(fark) + '</span><div style="font-size:11px;color:#dc2626">' + (odenen === 0 ? 'ödenmedi' : 'eksik ödendi') + '</div>';
    else farkHtml = '<span style="color:#ea580c;font-weight:800">+' + tlMetin(fark) + '</span><div style="font-size:11px;color:#ea580c">fazla ödendi</div>';
  }
  return '<td style="padding:6px 10px">' + kutu + '</td><td style="padding:10px">' + farkHtml + '</td>';
}