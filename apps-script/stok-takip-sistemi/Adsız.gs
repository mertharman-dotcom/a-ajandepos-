// ============================================================
// BAP — AMBALAJ EŞLEŞME TEŞHİS ARACI  v2 (amb_Teshis.gs)
// ------------------------------------------------------------
// v1'de her satır tek tek boyanıyordu → her biri ayrı Sheets API çağrısı,
// birkaç yüz satırda 6 dk limiti aşılıyordu. v2'de TÜM tablo ve TÜM biçim
// tek seferde yazılıyor (3 API çağrısı). Tipik süre: 5-15 saniye.
//
// Satis_Motoru dosyasına DOKUNMAZ, hiçbir veriyi değiştirmez.
// Sadece "Ambalaj_Teshis" adında bir rapor sekmesi oluşturur.
//
// KULLANIM
//   1) Apps Script editöründe + ile yeni dosya: amb_Teshis
//   2) Bu kodu yapıştır, kaydet
//   3) Fonksiyon listesinden "ambalajTeshis" seç → Çalıştır
//   4) Tabloda "Ambalaj_Teshis" sekmesini aç
// ============================================================

var ARAMA_TERIMLERI = ["yemek seti", "sticker", "kraft", "salata kap", "kapak", "poşet"];
var TESHIS_SEKME    = "Ambalaj_Teshis";
var D_BOLUM_LIMIT   = 40;   // serbest aramada terim başına en fazla kaç satır

// Global sabiti güvenli oku (motor dosyası yoksa/adı farklıysa varsayılana düşer)
function amb_sabit(getter, varsayilan) {
  try { var v = getter(); return (v === undefined || v === null || v === "") ? varsayilan : v; }
  catch (e) { return varsayilan; }
}

function amb_sade(s) {
  return (s || "").toString().replace(/[İIı]/g, "i").replace(/[Ğğ]/g, "g").replace(/[Üü]/g, "u")
    .replace(/[Şş]/g, "s").replace(/[Öö]/g, "o").replace(/[Çç]/g, "c").toLowerCase().replace(/[\s._\-]/g, "");
}
function amb_kucuk(s) { return (s || "").toString().replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase(); }
function amb_nrm(s) { return amb_kucuk(s).replace(/[\s.,\-*/()'"&:;!?]/g, ""); }
function amb_sayi(v) {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (v === null || v === undefined) return 0;
  var s = v.toString().trim();
  if (!s) return 0;
  if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function amb_bool(v) {
  if (v === true) return true;
  if (v === false) return false;
  var s = amb_kucuk(v).trim();
  if (!s) return null;
  if (s === "true" || s === "doğru" || s === "evet" || s === "1" || s === "✓" || s === "x" || s === "aktif") return true;
  if (s === "false" || s === "yanlış" || s === "hayır" || s === "0" || s === "pasif") return false;
  return null;
}
function amb_benzerlik(a, b) {
  if (a === b) return 1;
  if (!a || !b || a.length < 2 || b.length < 2) return 0;
  var say = {}, n = 0;
  for (var i = 0; i < a.length - 1; i++) { var g = a.substr(i, 2); say[g] = (say[g] || 0) + 1; }
  for (var j = 0; j < b.length - 1; j++) { var h = b.substr(j, 2); if (say[h] > 0) { say[h]--; n++; } }
  return (2 * n) / (a.length - 1 + b.length - 1);
}

// ------------------------------------------------------------

function ambalajTeshis() {
  var t0 = new Date().getTime();

  var STOK_ID  = amb_sabit(function () { return STOK_DOSYA_ID; }, "1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE");
  var HM_AD    = amb_sabit(function () { return HM_SEKME; },      "Tbl_Hammaddeler");
  var DS_AD    = amb_sabit(function () { return DS_SEKME; },      "Direktsatisurunler");
  var KURAL_AD = amb_sabit(function () { return KURAL_SEKME; },   "Ambalaj_Kurallari");
  var ESIK     = amb_sabit(function () { return BENZERLIK_ESIK; }, 0.82);

  var ss = SpreadsheetApp.openById(STOK_ID);

  // cikti: veri satırları | stil: her satır için "baslik" | "hata" | "uyari" | ""
  var cikti = [], stil = [];
  function yaz(tur, a, b, c, d, e, f, g, h, i, j) {
    cikti.push([a || "", b || "", c || "", d || "", e || "", f || "", g || "", h || "", i || "", j || ""]);
    stil.push(tur || "");
  }
  function baslik(t) { yaz("", ""); yaz("baslik", "=== " + t + " ==="); }

  // ---------- A) SEKME TARAMASI ----------
  baslik("A) SEKME TARAMASI — motor hangi sekmeyi hammadde/ambalaj tablosu sayıyor?");
  yaz("basur", "Sekme adı", "A1 başlığı", "B1 başlığı", "Satır", "Sütun", "Motor okur mu?", "Okumuyorsa sebebi");

  var kaynakSekmeler = [];
  ss.getSheets().forEach(function (sh) {
    var ad = sh.getName();
    if (ad === TESHIS_SEKME) return;
    var satir = sh.getLastRow(), sutun = sh.getLastColumn();
    var a1 = "", b1 = "";
    if (satir >= 1 && sutun >= 1) {                        // tek çağrıda iki başlık
      var bas = sh.getRange(1, 1, 1, Math.min(2, sutun)).getValues()[0];
      a1 = bas[0] === undefined ? "" : bas[0];
      b1 = bas[1] === undefined ? "" : bas[1];
    }
    if (ad === HM_AD) {
      kaynakSekmeler.push({ sh: sh, ad: ad, tip: "HM" });
      yaz("", ad, a1, b1, satir, sutun, "EVET — ana hammadde tablosu", "");
      return;
    }
    if (ad === DS_AD) { yaz("", ad, a1, b1, satir, sutun, "hayır", "direkt satış tablosu, ambalaj değil"); return; }
    if (satir < 2 || sutun < 2) { yaz("", ad, a1, b1, satir, sutun, "hayır", "en az 2 satır ve 2 sütun gerekli"); return; }

    var testA = amb_sade(a1) === "hammaddeid";
    var testB = amb_sade(b1).indexOf("hammaddead") === 0;
    if (testA && testB) {
      kaynakSekmeler.push({ sh: sh, ad: ad, tip: "AMB" });
      yaz("", ad, a1, b1, satir, sutun, "EVET — ambalaj/sarf tablosu", "");
    } else {
      var sebep = [];
      if (!testA) sebep.push("A1 '" + a1 + "' → '" + amb_sade(a1) + "' okunuyor, 'hammaddeid' olmalı");
      if (!testB) sebep.push("B1 '" + b1 + "' → '" + amb_sade(b1) + "' okunuyor, 'hammaddead…' ile başlamalı");
      yaz("uyari", ad, a1, b1, satir, sutun, "HAYIR", sebep.join(" | "));
    }
  });

  // ---------- Havuz ----------
  var havuz = {}, anahtarlar = [], tumSatirlar = [];
  kaynakSekmeler.forEach(function (k) {
    var d = k.sh.getDataRange().getValues();
    for (var r = 1; r < d.length; r++) {
      var tam = (d[r][1] || "").toString().trim();
      if (!tam) continue;
      var kayit = {
        tamAd: tam,
        kisaAd: (d[r][2] || "").toString().trim(),
        sekme: k.ad, satir: r + 1,
        aktif: k.tip === "HM" ? amb_bool(d[r][4]) : null,
        H: d[r][7], I: d[r][8], J: amb_sayi(d[r][9]), tip: k.tip
      };
      tumSatirlar.push(kayit);
      var adlar = [kayit.kisaAd, kayit.tamAd];
      for (var x = 0; x < adlar.length; x++) {
        var key = amb_nrm(adlar[x]);
        if (key && !havuz[key]) { havuz[key] = kayit; anahtarlar.push(key); }
      }
    }
  });
  yaz("", "", "", "", "", "", "TOPLAM",
      kaynakSekmeler.length + " sekme okundu · " + tumSatirlar.length + " satır · " + anahtarlar.length + " arama anahtarı");

  // ---------- B) AMBALAJ_KURALLARI ----------
  baslik("B) " + KURAL_AD + " İÇERİĞİ");
  var kuralSh = ss.getSheetByName(KURAL_AD);
  var kuralMalzemeler = [];
  if (!kuralSh) {
    yaz("hata", "'" + KURAL_AD + "' SEKMESİ BULUNAMADI — ambalaj hiç hesaplanmaz. Sekme adını kontrol et.");
  } else {
    yaz("basur", "Satır", "A (koşul)", "B (ürün/kategori)", "C (ambalaj malzemesi)", "D (miktar)", "Not");
    var kd = kuralSh.getDataRange().getValues();
    for (var i = 1; i < kd.length; i++) {
      var kosul = amb_kucuk(kd[i][0]).trim();
      var esles = (kd[i][1] || "").toString().trim();
      var malz  = (kd[i][2] || "").toString().trim();
      var mik   = amb_sayi(kd[i][3]) || 1;
      if (!esles && !malz) continue;
      var not = [];
      if (!esles) not.push("B boş → kural yok sayılır");
      if (!malz)  not.push("C boş → kural yok sayılır");
      if (kosul !== "urun" && kosul !== "ürün" && kosul !== "kategori")
        not.push("A '" + kd[i][0] + "' → 'urun' yazmıyorsa KATEGORİ kuralı sayılır");
      yaz(not.length ? "uyari" : "", i + 1, kd[i][0], esles, malz, mik, not.join(" | "));
      if (esles && malz) kuralMalzemeler.push({ malzeme: malz, miktar: mik });
    }
  }

  // ---------- C) EŞLEŞME TESTİ ----------
  baslik("C) KURALDAKİ HER MALZEME → NEREDE BULUNDU? (asıl cevap burada)");
  yaz("basur", "Ambalaj malzemesi", "Aranan anahtar", "SONUÇ", "Eşleştiği satır (B sütunu)", "Sekme",
      "Satır no", "Benzerlik", "E (Sipariş Aktif)", "H / I / J", "Teşhis");

  var gorulen = {};
  kuralMalzemeler.forEach(function (km) {
    var key = amb_nrm(km.malzeme);
    if (!key || gorulen[key]) return;
    gorulen[key] = true;

    var kayit = havuz[key], skor = 1, yontem = "BİREBİR";
    if (!kayit) {
      var enIyi = null, s = 0;
      for (var a = 0; a < anahtarlar.length; a++) {
        var sk = amb_benzerlik(key, anahtarlar[a]);
        if (sk > s) { s = sk; enIyi = anahtarlar[a]; }
      }
      if (enIyi && s >= ESIK) { kayit = havuz[enIyi]; skor = s; yontem = "BENZERLİK"; }
      else {
        var y = enIyi ? havuz[enIyi] : null;
        yaz("hata", km.malzeme, key, "BULUNAMADI", y ? y.tamAd : "(hiç aday yok)", y ? y.sekme : "", y ? y.satir : "",
            y ? Math.round(s * 1000) / 1000 : "", "", "",
            "En yakın aday eşiğin (" + ESIK + ") altında kaldı. ÇÖZÜM: o satırın C (kısa ad) sütununa birebir '" + km.malzeme + "' yaz.");
        return;
      }
    }

    var teshis = [];
    if (kayit.aktif === false) teshis.push("E sütunu (Tedarikçi Sipariş Aktif) KAPALI — motor bu satırı eliyor olabilir, kutuyu işaretle.");
    if (!(kayit.J > 0)) teshis.push("J (paket fiyatı) boş → maliyet 0 çıkar.");
    if (!amb_sayi(kayit.H)) teshis.push("H (paket içeriği) boş → adet fiyatı yanlış.");
    if (!(kayit.I || "").toString().trim()) teshis.push("I (ölçü birimi) boş.");
    if (yontem === "BENZERLİK") teshis.push("Birebir değil, benzerlikle bağlandı.");

    yaz(teshis.length ? "uyari" : "",
        km.malzeme, key, yontem === "BİREBİR" ? "BULUNDU" : "BENZERLİKLE BULUNDU",
        kayit.tamAd, kayit.sekme, kayit.satir, Math.round(skor * 1000) / 1000,
        kayit.aktif === null ? "(sütun yok/boş)" : (kayit.aktif ? "EVET" : "HAYIR"),
        kayit.H + " / " + kayit.I + " / " + kayit.J,
        teshis.length ? teshis.join(" ") : "OK");
  });

  // ---------- D) SERBEST ARAMA ----------
  baslik("D) SERBEST ARAMA — bu kelimeler fiziksel olarak hangi satırlarda geçiyor?");
  yaz("basur", "Aranan", "Sekme", "Satır", "B (Kolaybi adı)", "C (kısa ad)", "E (Sipariş Aktif)", "H", "I", "J");
  ARAMA_TERIMLERI.forEach(function (terim) {
    var t = amb_nrm(terim), bulundu = 0;
    for (var n = 0; n < tumSatirlar.length && bulundu < D_BOLUM_LIMIT; n++) {
      var k = tumSatirlar[n];
      if (amb_nrm(k.tamAd).indexOf(t) !== -1 || amb_nrm(k.kisaAd).indexOf(t) !== -1) {
        bulundu++;
        yaz("", terim, k.sekme, k.satir, k.tamAd, k.kisaAd,
            k.aktif === null ? "(sütun yok/boş)" : (k.aktif ? "EVET" : "HAYIR"), k.H, k.I, k.J);
      }
    }
    if (!bulundu) yaz("hata", terim, "—", "", "HİÇBİR SEKMEDE BULUNAMADI", "", "", "", "", "");
  });

  // ---------- TEK SEFERDE YAZ ----------
  var sh = ss.getSheetByName(TESHIS_SEKME);
  if (!sh) sh = ss.insertSheet(TESHIS_SEKME); else sh.clear();

  var n = cikti.length;
  var arka = [], kalin = [], yaziRengi = [];
  for (var z = 0; z < n; z++) {
    var t = stil[z], bg = null, fw = "normal", fc = "#000000";
    if (t === "baslik")      { bg = "#2c3e50"; fw = "bold"; fc = "#ffffff"; }
    else if (t === "basur")  { bg = "#e8eaed"; fw = "bold"; }
    else if (t === "hata")   { bg = "#f8d7da"; }
    else if (t === "uyari")  { bg = "#fff3cd"; }
    var satirBg = [], satirFw = [], satirFc = [];
    for (var c = 0; c < 10; c++) { satirBg.push(bg); satirFw.push(fw); satirFc.push(fc); }
    arka.push(satirBg); kalin.push(satirFw); yaziRengi.push(satirFc);
  }

  var alan = sh.getRange(1, 1, n, 10);
  alan.setValues(cikti);          // 1 çağrı
  alan.setBackgrounds(arka);      // 1 çağrı
  alan.setFontWeights(kalin);     // 1 çağrı
  alan.setFontColors(yaziRengi);  // 1 çağrı

  var genislik = [220, 190, 190, 260, 160, 70, 90, 140, 150, 460];
  for (var w = 0; w < genislik.length; w++) sh.setColumnWidth(w + 1, genislik[w]);
  sh.setFrozenRows(1);
  sh.activate();

  var sure = Math.round((new Date().getTime() - t0) / 100) / 10;
  var mesaj = "Teşhis bitti (" + sure + " sn) — '" + TESHIS_SEKME + "' sekmesini aç.\n\n" +
              kaynakSekmeler.length + " kaynak sekme, " + tumSatirlar.length + " satır okundu.\n" +
              kuralMalzemeler.length + " ambalaj kuralı bulundu.\n\n" +
              "KIRMIZI satır = o malzeme hiçbir tabloda bulunamıyor.\n" +
              "SARI satır = bulunuyor ama E/H/I/J eksik ya da benzerlikle bağlanmış.";
  Logger.log(mesaj);
  try { SpreadsheetApp.getUi().alert(mesaj); } catch (e) { /* editörden çalıştırıldı */ }
}