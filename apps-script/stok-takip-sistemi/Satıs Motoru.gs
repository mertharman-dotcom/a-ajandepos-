// ============================================================
// BAP RESTORAN - SATIŞ → STOK & MALİYET MOTORU v7.1
// ------------------------------------------------------------
// v7.0 + iki iyilestirme:
//   1) Ayni isimden fiyatli hammadde her zaman kazanir (fiyat yok uyarisi azalir)
//   2) Tek urun maliyet detayi acilir liste ile secilir (isim yazmak yok)
//
// AKIŞ
//   Make.com Data (satış) → reçete → hammadde/YM/ambalaj/direkt satış
//   → Sube_Stok düşümü + Satis_Hareketleri logu (üstten eklenir)
//   Kolaybi Urun_Listesi (son alış fiyatı) → Tbl_Hammaddeler J
//   Reçete + YM reçete + fiyat → Tbl_Maliyetler (uyarılarla)
//
// TABLO DÜZENİ (canlı tablodan doğrulandı, 25.08.2026)
//   Make.com Data : A ID | E Tarih | N Şube | V Ürünler | W Fiyatlar | X Adetler | Y Kategoriler | AA Motor_Islendi
//   Tbl_Receteler : A Ürün | C Hammadde/YM | D Miktar | E Birim | F Ü / YM
//   Tbl_YariMamulRecete : A YM adı | B Hammadde | C Baz_Miktar | D Birim
//   Tbl_YariMamul : A YM adı | B Cikti_Tipi | C Baz_Miktar | D Porsiyon_adet | E Porsiyon_gram
//   Tbl_Hammaddeler : B Kolaybi adı | C kısa ad | F paket durumu | H paket içeriği | I ölçü birimi
//                     J son alış fiyatı (PAKET başına) | O Stok_Takip | P Koli_Icerik
//   Direktsatisurunler : B Kolaybi adı | C kısa ad | J son alış fiyatı
//   Sube_Stok : A Ürün | B Tip (HM/YM/DS/AMB) | C Şube | D Mevcut | E Teorik | I Son_Guncelleme
//   Kolaybi Fatura Ham Veri › Urun_Listesi : A ürün adı | C son fiyat
//
// BİRİM MANTIĞI
//   Hammadde stoğu Tbl_Hammaddeler I sütunundaki ölçü biriminde tutulur (gr/kg/lt/ml/adet).
//   Reçete miktarı bu birime çevrilerek düşülür (120 gr → stok kg ise 0,12).
//   Birim maliyet = J / H  (paket fiyatı / paket içeriği) → ölçü birimi başına TL.
//   YM stoğu ve maliyeti Takip_tipi biriminde: Adet → porsiyon başına (parti / Porsiyon_adet),
//   gr → gram başına (parti / Baz_Miktar). Satışta yalnızca YM düşer; un/maya üretimde düşmüştür.
//   Reçete birimi Takip_tipi'nden farklıysa Porsiyon_gram ile çevrilir.
// ============================================================

var SATIS_KAYNAK_ID     = "1gdn_rbaevKx9_-pNTRKL1DDtytFxZHr9QF-jrS4cHPE";
var SATIS_SEKME         = "Satıs Verileri";
var STOK_DOSYA_ID       = "1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE";
var KOLAYBI_DOSYA_ID    = "1JJ6UZzh8rSX1FE9Cr-UPzEAaE-2aKtM10bEvjAv2P5w";
var KOLAYBI_FIYAT_SEKME = "Urun_Listesi";

var RECETE_SEKME    = "Tbl_Receteler";
var YM_RECETE_SEKME = "Tbl_YariMamulRecete";
var YM_SEKME        = "Tbl_YariMamul";
var HM_SEKME        = "Tbl_Hammaddeler";
var DS_SEKME        = "Direktsatisurunler";
var KURAL_SEKME     = "Ambalaj_Kurallari";
var STOK_SEKME      = "Sube_Stok";
var LOG_SEKME       = "Satis_Hareketleri";
var UYARI_SEKME     = "Satis_Uyarilar";
var MALIYET_SEKME   = "Tbl_Maliyetler";
var GENEL_BILGILER_ID = "1rcOUvokeb0VG3mm72-IKV1-bk0WugEcNSvDaHz41pP8";   // BAP Genel Bilgiler
var MENU_SEKME        = "Menü";   // A Urun_Adı | B Kategori | C Fiyat | ... | H Ürün/Yarı Mamül/Direk Satış | I Reçete_Durumu (script yazar)
var AMB_SUBE        = "Merkez";
var ISARET_BASLIK   = "Motor_Islendi";

var MOTOR_BASLANGIC = "06.09.2026";   // bu tarihten önceki satışlar işlenmez
var BENZERLIK_ESIK  = 0.82;           // isim benzerlik eşiği (0-1)
// Reçetede durur ama maliyeti 0'dır, stoktan düşülmez, uyarı üretmez
var SIFIR_MALIYET   = ["su", "musluk suyu", "buz", "sıcak su", "soğuk su"];

// Make.com Data sütunları (1 tabanlı). V/W/X/Y hücrelerinde ürünler "|" ile ayrılır.
var K_ID = 1, K_TARIH = 3, K_TIP = 8, K_SUBE = 7, K_URUNLER = 17, K_FIYATLAR = 19, K_ADETLER = 18, K_KATLER = 16;
var URUN_AYIRICI = "|";

// Adisyo'daki satış adı → Direktsatisurunler kısa adı (otomatik eşleşmeyenler için elle)
var DS_TAKMA_AD = {
  "Coca-Cola Şekersiz": "Cola Zero",
  "Coca-Cola":          "Coca Cola",
  "Susurluk Ayranı":    "Susurluk Ayran"
};

// ==========================================
// 1. GİRİŞ NOKTALARI
// ==========================================

function stokMotoru() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { Logger.log("Başka çalışma devam ediyor, atlandı."); return; }
  try { satislariIsle(); } finally { lock.releaseLock(); }
}

function kaynakSayfa() { return SpreadsheetApp.openById(SATIS_KAYNAK_ID).getSheetByName(SATIS_SEKME); }

/**
 * Sekmeyi önce adıyla, bulamazsa 1. satır başlıklarına bakarak bulur
 * (ör. "Tbl_YariMamul" sekmesi "Tbl_YariMamul tablosuna Cikti_Tipi" diye adlandırılmışsa).
 * basliklar: ilk N başlığın sade() halinin başlangıcı, ör. ["yarimamuladi","ciktitipi"]
 */
function sm_sekmeBul(ss, ad, basliklar) {
  var sh = ss.getSheetByName(ad);
  if (sh) return sh;
  var bulunan = null;
  ss.getSheets().some(function (s2) {
    if (s2.getLastRow() < 1 || s2.getLastColumn() < basliklar.length) return false;
    var b = s2.getRange(1, 1, 1, basliklar.length).getValues()[0];
    for (var i = 0; i < basliklar.length; i++) {
      if (sade(b[i]).indexOf(basliklar[i]) !== 0) return false;
    }
    bulunan = s2;
    return true;
  });
  if (bulunan) Logger.log("'" + ad + "' bulunamadı, başlıktan eşleşen sekme kullanıldı: " + bulunan.getName());
  else Logger.log("UYARI: '" + ad + "' sekmesi yok");
  return bulunan;
}
function stokDosyasi() { return SpreadsheetApp.openById(STOK_DOSYA_ID); }

/** Yeni satışları işler, stokları düşer, logları yazar. */
function satislariIsle() {
  var stokSS = stokDosyasi();
  var sh = kaynakSayfa();
  if (!sh) { Logger.log("HATA: '" + SATIS_SEKME + "' sekmesi bulunamadı"); return; }
  var son = sh.getLastRow();
  if (son < 2) return;

  var isaretKol = isaretKolonuHazirla(sh);
  var durumKol  = sm_durumKolonu(sh);   // S2: "Durum" başlıklı sütun (yoksa 0)
  var genislik  = Math.max(isaretKol, durumKol, K_KATLER, K_URUNLER, K_ADETLER, K_FIYATLAR);
      var veri      = sh.getRange(2, 1, son - 1, genislik).getValues();

  var ctx   = sm_baglamOlustur(stokSS);
  var basla = baslangicTarihi();

  var dusum = {};
  var isaretler = [];
  var islenen = 0, degisti = false, iptalSayi = 0, acikSayi = 0;

 function ekle(ad, tip, sube, miktar, birim, detay, siparisId) {
  if (!ad || !(miktar > 0)) return;

  // Stok düşümü yine malzeme + tip + şube bazında toplu tutulur
  var k = nrm(ad) + "|" + tip + "|" + nrm(sube);

  if (!dusum[k]) {
    dusum[k] = {
      ad: ad,
      tip: tip,
      sube: sube,
      miktar: 0,
      birim: birim,
      detaylar: [],
      siparisler: {}
    };
  }

  dusum[k].miktar += miktar;

  if (detay && dusum[k].detaylar.length < 25) {
    dusum[k].detaylar.push(detay);
  }

  // Satış hareketi için sipariş bazında ayrıca biriktir
  var sid = (siparisId || "").toString();

  if (sid) {
    if (!dusum[k].siparisler[sid]) {
      dusum[k].siparisler[sid] = {
        miktar: 0,
        detaylar: []
      };
    }

    dusum[k].siparisler[sid].miktar += miktar;

    if (detay) {
      dusum[k].siparisler[sid].detaylar.push(detay);
    }
  }
}

  for (var i = 0; i < veri.length; i++) {
    var row = veri[i];
    var isaret = row[isaretKol - 1];
    isaretler.push([isaret]);
    if (sm_islendiMi(isaret)) continue;

    var sipId = row[K_ID - 1];


var urunlerStr = (row[K_URUNLER - 1] || "").toString();
    if (!sipId || !urunlerStr.trim()) continue;

    // S2: yalnızca kapanmış siparişler stoktan düşer. İptal edilen "İPTAL" diye işaretlenip atlanır;
    // henüz açık olan işaretlenmez, kapandığında sonraki turda düşülür.
    if (durumKol) {
      var durum = sade(row[durumKol - 1]);
      if (durum.indexOf("iptal") !== -1) { isaretler[i] = ["İPTAL"]; degisti = true; iptalSayi++; continue; }
      if (durum && durum.indexOf("kapa") !== 0) { acikSayi++; continue; }
    }

    var sipTarih = satisTarihi(row[K_TARIH - 1]);
    if (sipTarih && sipTarih < basla) { isaretler[i] = ["✓"]; degisti = true; continue; }

    var sube = subeCoz(row[K_SUBE - 1]);

// Masa siparişlerinde Şube (G) boş gelebiliyor.
// Bu durumda F sütunundaki restoran adından şubeyi çöz:
// "BAP Erenköy" / "BAP Fikirtepe"
if (!sube || sube.charAt(0) === "#") {
  sube = subeCoz(row[5]);
}

if (!sube || sube.charAt(0) === "#") {
  Logger.log("Şube çözülemedi, atlandı: #" + sipId);
  continue;
}

var paketMi = trKucuk(row[K_TIP - 1]).indexOf("paket") !== -1;
    var ayirici = urunlerStr.indexOf(URUN_AYIRICI) !== -1 ? URUN_AYIRICI : ",";
    var urunler = urunlerStr.split(ayirici);
    var adetler = (row[K_ADETLER - 1] || "").toString().split(ayirici);
    var katler  = (row[K_KATLER - 1]  || "").toString().split(ayirici);

    for (var j = 0; j < urunler.length; j++) {
      var urun = urunler[j].trim();
      if (!urun) continue;
      var adet = sm_sayi(adetler[j]) || 1;
      var kat  = (katler[j] || "").toString().trim();
      var ref  = urun + " x" + adet + " · #" + sipId;

      var coz = sm_satisUrunuCoz(urun, ctx);

      if (coz.tur === "RECETE") {
        var mal = coz.recete.malzemeler;
        for (var k = 0; k < mal.length; k++) {
          var m = mal[k];
          var mc = sm_malzemeCoz(m, ctx);
          var toplam = m.miktar * adet;

          if (mc.tur === "SIFIR") continue;                          // su vb.: stok yok, maliyet yok
          if (mc.tur === "HM") {
            var hm = mc.bilgi;
            if (hm.stokTakip === false) continue;              // takip dışı hammadde
            var cv = sm_cevir(toplam, m.birim, hm.olcu, hm.paketIcerik);
            if (!cv.ok) { ctx.uyarilar.push([sipId, urun, m.ad + " (" + hm.tamAd + "): " + cv.not + " — düşülmedi"]); continue; }
            var hmSube = hm.tip === "AMB" ? AMB_SUBE : sube;
          ekle(hm.tamAd, hm.tip, hmSube, cv.m, hm.olcu || m.birim,
     ref + (mc.fuzzy ? " (~" + m.ad + ")" : "") + (cv.not ? " [" + cv.not + "]" : ""), sipId);
          } else if (mc.tur === "YM") {
            var ym = mc.bilgi;
            // Satışta yalnızca YM'nin kendisi düşer (un/maya üretimde düştü). Birim = Takip_tipi (adet / gr)
            var yc = ym.takip ? sm_ymTakipMiktar(toplam, m.birim, ym) : sm_ymCevir(toplam, m.birim, ym);
            if (!yc.ok) { ctx.uyarilar.push([sipId, urun, yc.uyari + " — düşülmedi"]); continue; }
            ekle(ym.ad, "YM", sube, yc.m, ym.takip || yc.birim,
     ref + (mc.fuzzy ? " (~" + m.ad + ")" : "") + (yc.uyari ? " [" + yc.uyari + "]" : ""), sipId);
          } else {
            // tanımı olmayan malzeme: reçetedeki adıyla ve birimiyle düş (eskisi gibi), uyarı yaz
            var tip0 = m.tip === "YM" ? "YM" : "HM";
            var b0 = sm_birim(m.birim), m0 = toplam;
            if (tip0 === "YM" && (b0 === "kg" || b0 === "lt")) { m0 = toplam * 1000; b0 = "gr"; }
           ekle(m.ad, tip0, sube, m0, b0 || m.birim,
     ref + " (" + tip0 + " tanimi yok)", sipId);
            ctx.uyarilar.push([sipId, urun, m.ad + " → " + tip0 + " tanımı yok (Tbl_" + (tip0 === "YM" ? "YariMamul" : "Hammaddeler") + "'de bulunamadı)"]);
          }
        }
      } else if (coz.tur === "DS") {
        ekle(coz.ds.kisaAd, "DS", sube, adet, "adet",
     ref + (coz.fuzzy ? " (~" + urun + ")" : ""), sipId);
      } else {
        ctx.uyarilar.push([sipId, urun, "Reçetesi de direkt satış tanımı da yok"]);
      }

      // Ambalaj kuralları → Merkez / AMB. Sadece paket siparişte; ürün kuralı varsa o, yoksa kategori kuralı
      var ambList = [];
      if (paketMi) {
        ambList = ctx.kurallar.urun[nrm(urun)] || (coz.tur === "RECETE" ? ctx.kurallar.urun[coz.recete.key] : null) ||
                  (kat ? ctx.kurallar.kategori[nrm(kat)] : null) || [];
      }
      for (var a = 0; a < ambList.length; a++) {
  var amb = ambList[a];
  var ambKey = nrm(amb.malzeme);
  var ambBilgi = ctx.hm.harita[ambKey] || null;
  var ambAd = ambBilgi ? ambBilgi.tamAd : amb.malzeme;

ekle(
  ambAd,
  "AMB",
  AMB_SUBE,
  amb.miktar * adet,
  "adet",
  ref + " (ambalaj)",
  sipId
);
}
    }   // ürün döngüsü (S1: bu parantez eksikti)

    isaretler[i] = ["✓"];
    islenen++;
    degisti = true;
  }

  if (islenen) dusumleriUygula(stokSS, dusum);
  if (degisti) sh.getRange(2, isaretKol, isaretler.length, 1).setValues(isaretler);
  sm_uyarilariYaz(stokSS, ctx.uyarilar);

  if (iptalSayi || acikSayi) Logger.log("Durum: " + iptalSayi + " iptal sipariş atlandı, " + acikSayi + " açık sipariş sonraki tura kaldı.");
  Logger.log("Tamamlandı: " + islenen + " sipariş işlendi, " + Object.keys(dusum).length + " kalem düşüldü, " + ctx.uyarilar.length + " uyarı.");
}

/** Düşümleri Sube_Stok'a uygular (tek okuma / tek yazma) ve logu üstten ekler. */
function dusumleriUygula(ss, dusum) {
  var sh = ss.getSheetByName(STOK_SEKME);

  if (!sh) {
    sh = ss.insertSheet(STOK_SEKME);
    sh.appendRow([
      "Urun_Adi",
      "Tip",
      "Sube",
      "Mevcut_Stok",
      "Teorik_Stok",
      "Son_Sayim",
      "Son_Sayim_Tarihi",
      "Fark",
      "Son_Guncelleme"
    ]);
    sh.setFrozenRows(1);
  }

  var lastRow = sh.getLastRow();
  var rows = lastRow > 1
    ? sh.getRange(2, 1, lastRow - 1, 9).getValues()
    : [];

  var idx = {};
  var grup = {};

  for (var i = 0; i < rows.length; i++) {
    if (!rows[i][0]) continue;

    var tip = (rows[i][1] || "").toString().toUpperCase().trim();
    var key = nrm(rows[i][0]) + "|" + tip + "|" + nrm(rows[i][2]);

    idx[key] = i;

    var g = tip + "|" + nrm(rows[i][2]);

    if (!grup[g]) grup[g] = [];

    grup[g].push({
      key: nrm(rows[i][0]),
      i: i
    });
  }

  var simdi = new Date();

  // Detaylı satış logu
  var loglar = [];

  // Ana stok hareket defteri
  var stokHareketleri = [];

  var yeni = [];
  var eskiSatirSayisi = rows.length;

  Object.keys(dusum).forEach(function (k) {

    var d = dusum[k];

    var key =
      nrm(d.ad) + "|" +
      d.tip + "|" +
      nrm(d.sube);

    var r = idx[key];

// Sube_Stok'ta birebir bulunamazsa:
// HM / YM / DS için benzer isim kullanılabilir.
// AMB için ASLA fuzzy eşleştirme yapma.
if (r === undefined && d.tip !== "AMB") {

  var adaylar =
    grup[d.tip + "|" + nrm(d.sube)] || [];

  var enIyi = null;
  var skor = 0;

  for (var a = 0; a < adaylar.length; a++) {

    var s =
      sm_benzerlik(
        nrm(d.ad),
        adaylar[a].key
      );

    if (s > skor) {
      skor = s;
      enIyi = adaylar[a];
    }
  }

  if (enIyi && skor >= BENZERLIK_ESIK) {
    r = enIyi.i;
  }
}
    

   // Stok satırı hiç yoksa oluştur
if (r === undefined) {

      rows.push([
        d.ad,
        d.tip,
        d.sube,
        0,
        0,
        "",
        "",
        0,
        simdi
      ]);

      r = rows.length - 1;

      idx[key] = r;

      yeni.push(d.ad);
    }

    // -------------------------------
    // STOĞU GERÇEKTEN DÜŞ
    // -------------------------------

    var eskiM = sm_sayi(rows[r][3]);
    var eskiT = sm_sayi(rows[r][4]);

    var yeniM =
      Math.round(
        (eskiM - d.miktar) * 1000
      ) / 1000;

    var yeniT =
      Math.round(
        (eskiT - d.miktar) * 1000
      ) / 1000;

    rows[r][3] = yeniM;
    rows[r][4] = yeniT;
    rows[r][8] = simdi;

    var miktar =
      Math.round(
        d.miktar * 1000
      ) / 1000;

    var detay =
  d.detaylar.join(", ");

// -------------------------------
// SATIS_HAREKETLERI
// Her sipariş + malzeme ayrı satır
// -------------------------------

var siparisAnahtarlari = Object.keys(d.siparisler || {});

siparisAnahtarlari.forEach(function(siparisId) {

  var sp = d.siparisler[siparisId];

  var sipMiktar =
    Math.round(sp.miktar * 1000) / 1000;

  var sipDetay =
    sp.detaylar.join(", ");

  loglar.push([
    simdi,             // Tarih
    d.sube,            // Şube
    rows[r][0],        // Malzeme
    d.tip,             // HM / YM / DS / AMB
    "Satis",
    "",                // Eski_Stok - sipariş bazında anlamlı değil
    "",                // Yeni_Stok - sipariş bazında anlamlı değil
    sipMiktar,         // Bu siparişin düşürdüğü miktar
    d.birim,
    sipDetay,
    siparisId
  ]);
});

    // -------------------------------
    // STOK_HAREKETLERI
    // -------------------------------
    // Sadece LOG.
    // Burada stok tekrar düşürülmez.
    // -------------------------------

    stokHareketleri.push([
      simdi,                    // Tarih
      d.sube,                   // Sube
      rows[r][0],               // Malzeme
      "Satis",                  // Hareket_Turu
      eskiM,                    // Eski_Stok
      yeniM,                    // Yeni_Stok
      d.birim,                  // Birim
      "-" + miktar + " " + d.birim, // Karsiligi
      detay,                    // Detay
      "Otomatik (satış)"        // Sorumlu
    ]);
  });

  // -------------------------------
  // SUBE_STOK'U TEK SEFERDE YAZ
  // -------------------------------

  sm_stokYaz(
    sh,
    rows,
    eskiSatirSayisi
  );

  // -------------------------------
  // SATIS_HAREKETLERI'NE YAZ
  // -------------------------------

  if (loglar.length) {

    var log =
      ss.getSheetByName(LOG_SEKME);

    if (!log) {

      log =
        ss.insertSheet(LOG_SEKME);

      log.appendRow([
  "Tarih",
  "Sube",
  "Urun",
  "Tip",
  "Hareket",
  "Eski_Stok",
  "Yeni_Stok",
  "Dusulen",
  "Birim",
  "Detay",
  "Siparis_ID"
]);

      log.getRange(1, 1, 1, 10)
        .setFontWeight("bold")
        .setBackground("#8a4b2c")
        .setFontColor("white");

      log.setFrozenRows(1);
    }

    log.insertRowsBefore(
      2,
      loglar.length
    );

    log.getRange(
  2,
  1,
  loglar.length,
  11
).setValues(loglar);
  }

  // -------------------------------
  // STOK_HAREKETLERI'NE YAZ
  // -------------------------------

  if (stokHareketleri.length) {

    var hareket =
      ss.getSheetByName("Stok_Hareketleri");

    if (!hareket) {

      hareket =
        ss.insertSheet("Stok_Hareketleri");

      hareket.appendRow([
        "Tarih",
        "Sube",
        "Malzeme",
        "Hareket_Turu",
        "Eski_Stok",
        "Yeni_Stok",
        "Birim",
        "Karsiligi",
        "Detay",
        "Sorumlu"
      ]);

      hareket.setFrozenRows(1);
    }

    // Alış motoruyla aynı şekilde alta ekle
    hareket.getRange(
      hareket.getLastRow() + 1,
      1,
      stokHareketleri.length,
      10
    ).setValues(stokHareketleri);
  }

  if (yeni.length) {
    Logger.log(
      "Sube_Stok'a yeni satır: " +
      yeni.join(", ")
    );
  }
}

  

// ==========================================
// 2. BAĞLAM: TÜM HARİTALAR TEK SEFERDE
// ==========================================

function sm_baglamOlustur(ss) {
  return {
    hm:       hmBilgiHaritasi(ss),     // {harita:{key→bilgi}, anahtarlar:[...]}
    ym:       ymHaritasi(ss),          // {harita:{key→ym}, anahtarlar:[...]}
    receteler: receteHaritasi(ss),     // {harita:{key→{key,ad,malzemeler}}, anahtarlar}
    ds:       dsHaritasi(ss),          // {harita:{key→{kisaAd,tamAd,fiyat}}, anahtarlar}
    kurallar: ambalajKurallari(ss),
    ymMaliyet: {},                     // önbellek
    uyarilar: []                       // [sipId, urun, mesaj]
  };
}

/**
 * Tbl_Hammaddeler (+ ambalaj tipi sekmeler). Anahtar: hem B (Kolaybi adı) hem C (kısa ad).
 * Aynı kısa ada sahip birden fazla satır varsa FİYATLI olan tercih edilir (fiyat yok uyarısı azalir).
 */
function hmBilgiHaritasi(ss) {
  var sonuc = { harita: {}, anahtarlar: [] };
  function koy(key, bilgi) {
    if (!key) return;
    var eski = sonuc.harita[key];
    if (!eski) { sonuc.harita[key] = bilgi; sonuc.anahtarlar.push(key); return; }
    // DEGISIKLIK 1: Fiyatli satir her zaman kazanir. Ayni isimden biri acik/fiyatli, biri
    // kapali/fiyatsizsa fiyatli olani al ki "fiyat yok" uyarisi cikmasin. Fiyat 4 puan, Stok_Takip 1 puan.
    var eskiPuan = (eski.fiyatPaket > 0 ? 4 : 0) + (eski.stokTakip !== false ? 1 : 0);
    var yeniPuan = (bilgi.fiyatPaket > 0 ? 4 : 0) + (bilgi.stokTakip !== false ? 1 : 0);
    if (yeniPuan > eskiPuan) sonuc.harita[key] = bilgi;
  }
  function satirOku(r, tip) {
    var tam = (r[1] || "").toString().trim();
    if (!tam) return null;
    var icerik = sm_sayi(r[7]);
    var bilgi = {
      tamAd: tam,
      kisaAd: (r[2] || "").toString().trim(),
      paketDurumu: (r[5] || "").toString().trim(),
      paketIcerik: icerik > 0 ? icerik : 1,
      olcu: sm_birim(r[8]),
      fiyatPaket: sm_sayi(r[9]),
      stokTakip: sm_bool(r[14]),
      koliIcerik: sm_sayi(r[15]),
      tip: tip
    };
    bilgi.fiyatBirim = bilgi.fiyatPaket > 0 ? bilgi.fiyatPaket / bilgi.paketIcerik : 0;
    return bilgi;
  }
  var sh = ss.getSheetByName(HM_SEKME);
  if (sh) {
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var b = satirOku(data[i], "HM");
      if (!b) continue;
      koy(nrm(b.kisaAd), b);
      koy(nrm(b.tamAd), b);
    }
  }
  // Ambalaj / sarf sekmeleri: başlığı Hammadde_ID | Hammadde_Adı olan diğer sekmeler
  ss.getSheets().forEach(function (s2) {
    var ad = s2.getName();
    if (ad === HM_SEKME || ad === DS_SEKME || s2.getLastRow() < 2 || s2.getLastColumn() < 2) return;
    var bas = s2.getRange(1, 1, 1, 2).getValues()[0];
    if (sade(bas[0]) !== "hammaddeid" || sade(bas[1]).indexOf("hammaddead") !== 0) return;
    var v = s2.getDataRange().getValues();
    for (var r = 1; r < v.length; r++) {
      var b2 = satirOku(v[r], "AMB");
      if (!b2) continue;
      if (b2.kisaAd && !sonuc.harita[nrm(b2.kisaAd)]) koy(nrm(b2.kisaAd), b2);
      if (!sonuc.harita[nrm(b2.tamAd)]) koy(nrm(b2.tamAd), b2);
    }
  });
  return sonuc;
}

/** Tbl_YariMamul (çıktı bilgisi) + Tbl_YariMamulRecete (içerik) birleşik. */
function ymHaritasi(ss) {
  var sonuc = { harita: {}, anahtarlar: [] };
  function al(ad) {
    var key = nrm(ad);
    if (!sonuc.harita[key]) {
      sonuc.harita[key] = { ad: ad.trim(), cikti: "", takip: "", baz: 0, porsAdet: 0, porsGram: 0, recete: [] };
      sonuc.anahtarlar.push(key);
    }
    return sonuc.harita[key];
  }
  var sh = sm_sekmeBul(ss, YM_SEKME, ["yarimamuladi", "ciktitipi"]);
  if (sh) {
    var d = sh.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) {
      var ad = (d[i][0] || "").toString().trim(); if (!ad) continue;
      var y = al(ad);
      y.cikti    = sm_ymBirim(d[i][1]);      // B: stok/üretim birimi (gr | adet)
      y.baz      = sm_sayi(d[i][2]);         // C: 1 partiden çıkan toplam (Cikti_Tipi biriminde)
      y.porsAdet = sm_sayi(d[i][3]);         // D: 1 partiden çıkan porsiyon adedi
      y.porsGram = sm_sayi(d[i][4]);         // E: 1 porsiyonun gramı
      y.takip    = sm_ymBirim(d[i][5]);      // F: maliyet birimi (Adet → porsiyon başına, gr → gram başına)
    }
  }
  var sr = sm_sekmeBul(ss, YM_RECETE_SEKME, ["yarimamuladi", "hammadde"]);
  if (sr) {
    var v = sr.getDataRange().getValues();
    for (var r = 1; r < v.length; r++) {
      var ymAd = (v[r][0] || "").toString().trim();
      var hmAd = (v[r][1] || "").toString().trim();
      if (!ymAd || !hmAd) continue;
      var key = nrm(ymAd);
      var hedef = sonuc.harita[key];
      if (!hedef) {                                  // reçete adı çıktı tablosundakinden farklı yazılmışsa (Domattes/Domates)
        var b = sm_bul(key, sonuc);
        hedef = b ? b.bilgi : al(ymAd);
      }
      hedef.recete.push({ ad: hmAd, miktar: sm_sayi(v[r][2]), birim: (v[r][3] || "").toString().trim() });
    }
  }
  // Çıktı bilgisi (Baz_Miktar veya Porsiyon_gram) olan ama tipi boş olanlar gr sayılır;
  // hiç bilgisi olmayanlarda cikti boş kalır → reçete biriminde düşülür
  sonuc.anahtarlar.forEach(function (k) {
    var y = sonuc.harita[k];
    if (!y.cikti && (y.baz > 0 || y.porsGram > 0)) y.cikti = "gr";
    if (y.cikti && !(y.baz > 0) && !(y.porsGram > 0) && !(y.porsAdet > 0)) y.cikti = "";
    if (!y.takip) y.takip = y.cikti;          // Takip_tipi boşsa Cikti_Tipi ile aynı
    // porsiyon bilgisi tek taraflı girilmişse diğerini türet
    if (y.cikti === "gr" && y.baz > 0) {
      if (!(y.porsGram > 0) && y.porsAdet > 0) y.porsGram = y.baz / y.porsAdet;
      if (!(y.porsAdet > 0) && y.porsGram > 0) y.porsAdet = y.baz / y.porsGram;
    }
    if (y.cikti === "adet" && !(y.porsAdet > 0) && y.baz > 0) y.porsAdet = y.baz;
  });
  return sonuc;
}

/** Tbl_Receteler → ürün → malzemeler. */
function receteHaritasi(ss) {
  var sonuc = { harita: {}, anahtarlar: [], sira: [] };
  var sh = sm_sekmeBul(ss, RECETE_SEKME, ["urunadi", "hammaddekategori", "hammadde"]);
  if (!sh) return sonuc;
  var d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    var ust = (d[i][0] || "").toString().trim();
    var ad  = (d[i][2] || "").toString().trim();
    if (!ust || !ad) continue;
    var key = nrm(ust);
    if (!sonuc.harita[key]) {
      sonuc.harita[key] = { key: key, ad: ust, malzemeler: [] };
      sonuc.anahtarlar.push(key);
      sonuc.sira.push(ust);
    }
    sonuc.harita[key].malzemeler.push({
      ad: ad,
      miktar: sm_sayi(d[i][3]),
      birim: (d[i][4] || "").toString().trim(),
      tip: trKucuk(d[i][5]).trim() === "ym" ? "YM" : "Ü"
    });
  }
  return sonuc;
}

/** Direktsatisurunler: satış adı → kısa ad. */
function dsHaritasi(ss) {
  var sonuc = { harita: {}, anahtarlar: [] };
  var sh = ss.getSheetByName(DS_SEKME);
  if (!sh) return sonuc;
  var d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    var tam = (d[i][1] || "").toString().trim();
    var kisa = (d[i][2] || "").toString().trim();
    var gorunen = kisa || tam;
    if (!gorunen) continue;
    var bilgi = { kisaAd: gorunen, tamAd: tam, fiyatPaket: sm_sayi(d[i][9]), koliIcerik: sm_sayi(d[i][15]) };
    [kisa, tam].forEach(function (n) {
      var k = nrm(n);
      if (k && !sonuc.harita[k]) { sonuc.harita[k] = bilgi; sonuc.anahtarlar.push(k); }
    });
  }
  Object.keys(DS_TAKMA_AD).forEach(function (satisAdi) {
    var hedef = sonuc.harita[nrm(DS_TAKMA_AD[satisAdi])];
    if (hedef) { sonuc.harita[nrm(satisAdi)] = hedef; sonuc.anahtarlar.push(nrm(satisAdi)); }
  });
  return sonuc;
}

function ambalajKurallari(ss) {
  var sh = ss.getSheetByName(KURAL_SEKME);
  var sonuc = { urun: {}, kategori: {} };
  if (!sh) return sonuc;
  var d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    var kosul = sade(d[i][0]);   // S3: "Ürün" / "urun" / "URUN" hepsi "urun" olur
    var esles = (d[i][1] || "").toString().trim();
    var malzeme = (d[i][2] || "").toString().trim();
    if (!esles || !malzeme) continue;
    var hedef = kosul === "urun" ? sonuc.urun : sonuc.kategori;
    var key = nrm(esles);
    if (!hedef[key]) hedef[key] = [];
    hedef[key].push({ malzeme: malzeme, miktar: sm_sayi(d[i][3]) || 1 });
  }
  return sonuc;
}

// ==========================================
// 3. EŞLEŞTİRME (birebir → benzerlik)
// ==========================================

/** harita içinde key'i arar; yoksa Dice-bigram benzerliğiyle en yakını. → {bilgi, fuzzy} | null */
function sm_bul(key, h) {
  if (!key) return null;
  if (h.harita[key]) return { bilgi: h.harita[key], fuzzy: false };
  if (!h._cache) h._cache = {};
  if (key in h._cache) return h._cache[key];
  var enIyi = null, skor = 0;
  for (var i = 0; i < h.anahtarlar.length; i++) {
    var s = sm_benzerlik(key, h.anahtarlar[i]);
    if (s > skor) { skor = s; enIyi = h.anahtarlar[i]; }
  }
  var r = (enIyi && skor >= BENZERLIK_ESIK) ? { bilgi: h.harita[enIyi], fuzzy: true, skor: skor } : null;
  h._cache[key] = r;
  return r;
}

/** Satılan ürün → reçete / direkt satış. */
function sm_satisUrunuCoz(urun, ctx) {
  var key = nrm(urun);
  if (ctx.receteler.harita[key]) return { tur: "RECETE", recete: ctx.receteler.harita[key], fuzzy: false };
  if (ctx.ds.harita[key]) return { tur: "DS", ds: ctx.ds.harita[key], fuzzy: false };
  var r = sm_bul(key, ctx.receteler);
  if (r) return { tur: "RECETE", recete: r.bilgi, fuzzy: true };
  // direkt satış: "Fuse Tea Şeftali 33 cl." içinde "Fuse Tea Şeftali" geçiyor mu?
  for (var i = 0; i < ctx.ds.anahtarlar.length; i++) {
    var k = ctx.ds.anahtarlar[i];
    if (k.length >= 5 && key.indexOf(k) === 0) return { tur: "DS", ds: ctx.ds.harita[k], fuzzy: true };
  }
  var d = sm_bul(key, ctx.ds);
  if (d) return { tur: "DS", ds: d.bilgi, fuzzy: true };
  return { tur: "YOK" };
}

function sm_sifirMi(key) {
  for (var i = 0; i < SIFIR_MALIYET.length; i++) if (nrm(SIFIR_MALIYET[i]) === key) return true;
  return false;
}

/** Reçete malzemesi → HM (Tbl_Hammaddeler/ambalaj) veya YM. Etiket yanlışsa çapraz dener. */
function sm_malzemeCoz(m, ctx) {
  var key = nrm(m.ad);
  if (sm_sifirMi(key)) return { tur: "SIFIR", bilgi: { ad: m.ad } };
  var hm, ym;
  if (m.tip === "YM") {
    ym = sm_bul(key, ctx.ym);
    if (ym) return { tur: "YM", bilgi: ym.bilgi, fuzzy: ym.fuzzy };
    hm = sm_bul(key, ctx.hm);
    if (hm) return { tur: "HM", bilgi: hm.bilgi, fuzzy: hm.fuzzy, not: "YM etiketli ama hammadde bulundu" };
  } else {
    hm = sm_bul(key, ctx.hm);
    if (hm) return { tur: "HM", bilgi: hm.bilgi, fuzzy: hm.fuzzy };
    ym = sm_bul(key, ctx.ym);
    if (ym) return { tur: "YM", bilgi: ym.bilgi, fuzzy: ym.fuzzy, not: "Ü etiketli ama yarı mamul bulundu" };
  }
  return { tur: "YOK" };
}

// ==========================================
// 4. BİRİM DÖNÜŞÜMLERİ
// ==========================================

function sm_birim(b) {
  var s = trKucuk(b).replace(/\./g, "").trim();
  if (!s) return "";
  if (s === "gr" || s === "gram" || s === "g") return "gr";
  if (s === "kg" || s === "kilo" || s === "kilogram") return "kg";
  if (s === "lt" || s === "litre" || s === "l") return "lt";
  if (s === "ml" || s === "cc" || s === "mililitre") return "ml";
  if (s === "adet" || s === "ad" || s === "porsiyon" || s === "dilim" || s === "demet" || s === "pcs") return "adet";
  if (s === "paket" || s === "pk" || s === "pkt") return "paket";
  if (s === "koli") return "koli";
  if (s.indexOf("yemek ka") === 0) return "yk";
  if (s.indexOf("tatlı ka") === 0 || s.indexOf("çay ka") === 0) return "tk";
  return s;
}

function sm_ymBirim(b) {
  var s = sm_birim(b);
  if (s === "adet" || s === "paket") return "adet";
  if (s === "gr" || s === "kg" || s === "ml" || s === "lt") return "gr";
  return "";
}

/**
 * Reçete miktarını stok birimine çevirir. → {m, not}
 * paketIcerik: 1 paketin stok birimindeki içeriği (Tbl_Hammaddeler H).
 */
function sm_cevir(miktar, kaynakBirim, hedefBirim, paketIcerik) {
  var m = Number(miktar) || 0;
  var kb = sm_birim(kaynakBirim), hb = sm_birim(hedefBirim);
  var icerik = paketIcerik > 0 ? paketIcerik : 1;
  var OLCU = { gr: 1, ml: 1, kg: 1000, lt: 1000 };
  if (kb === "yk") { kb = "gr"; m *= 15; }
  if (kb === "tk") { kb = "gr"; m *= 5; }
  if (!hb) return { m: m, ok: true };
  if (kb === "paket") return { m: m * icerik, ok: true };
  if (kb === "koli")  return { m: m * icerik, ok: true, not: "koli=paket sayıldı" };
  if (kb === hb) return { m: m, ok: true };
  if (OLCU[kb] && OLCU[hb]) return { m: m * OLCU[kb] / OLCU[hb], ok: true };
  if (kb === "adet" && OLCU[hb]) return { m: m * icerik, ok: true, not: "1 adet = 1 paket (" + icerik + " " + hb + ") sayıldı" };
  if (OLCU[kb] && hb === "adet") return { m: 0, ok: false, not: kb + "→adet çevrilemez (Tbl_Hammaddeler I sütununu kontrol et)" };
  return { m: 0, ok: false, not: (kaynakBirim || "?") + "→" + (hedefBirim || "?") + " çevrilemez" };
}

/** Reçetedeki YM miktarını YM'nin stok birimine (gr/adet) çevirir. → {m, uyari} */
function sm_ymCevir(miktar, birim, ym) {
  var m = Number(miktar) || 0;
  var b = sm_birim(birim);
  // Çıktı bilgisi (Baz_Miktar / Porsiyon_gram) yoksa reçetenin biriminde tut
  if (!ym.cikti) {
    if (b === "kg" || b === "lt") return { m: m * 1000, birim: "gr", ok: true };
    if (b === "adet" || b === "paket") return { m: m, birim: "adet", ok: true };
    return { m: m, birim: "gr", ok: true };
  }
  if (ym.cikti === "gr") {
    if (b === "gr" || b === "ml" || !b) return { m: m, birim: "gr", ok: true };
    if (b === "kg" || b === "lt") return { m: m * 1000, birim: "gr", ok: true };
    if (b === "adet" || b === "paket") {
      if (ym.porsGram > 0) return { m: m * ym.porsGram, birim: "gr", ok: true };
      if (ym.baz > 0 && ym.porsAdet > 0) return { m: m * ym.baz / ym.porsAdet, birim: "gr", ok: true };
      return { m: 0, birim: "gr", ok: false, uyari: ym.ad + ": adet→gr için Porsiyon_gram gerekli (Tbl_YariMamul E)" };
    }
  } else {
    if (b === "adet" || b === "paket" || !b) return { m: m, birim: "adet", ok: true };
    if (b === "gr" || b === "ml") {
      if (ym.porsGram > 0) return { m: m / ym.porsGram, birim: "adet", ok: true };
      return { m: 0, birim: "adet", ok: false, uyari: ym.ad + ": gr→adet için Porsiyon_gram gerekli (Tbl_YariMamul E)" };
    }
    if (b === "kg" || b === "lt") {
      if (ym.porsGram > 0) return { m: m * 1000 / ym.porsGram, birim: "adet", ok: true };
      return { m: 0, birim: "adet", ok: false, uyari: ym.ad + ": kg→adet için Porsiyon_gram gerekli" };
    }
  }
  return { m: 0, birim: ym.cikti, ok: false, uyari: ym.ad + ": birim '" + birim + "' çevrilemez" };
}

// ==========================================
// 5. MALİYET MOTORU (rekürsif YM)
// ==========================================

/** Hammadde satırının maliyeti (TL). */
function sm_hmMaliyet(hm, miktar, birim, uyarilar, kaynak) {
  if (!(hm.fiyatBirim > 0)) { uyarilar.push(kaynak + ": fiyat yok (" + hm.tamAd + ")"); return 0; }
  var kgFiyat = sm_kgFiyat(hm);
  if (kgFiyat !== null && (kgFiyat > 5000 || kgFiyat < 2)) {
    uyarilar.push(kaynak + ": " + hm.tamAd + " için J/H = " + Math.round(kgFiyat) + " TL/kg çıkıyor, H (paket içeriği) veya I (ölçü birimi) yanlış olabilir");
  }
  var cv = sm_cevir(miktar, birim, hm.olcu, hm.paketIcerik);
  if (!cv.ok) { uyarilar.push(kaynak + ": " + cv.not + ", maliyete dahil edilmedi"); return 0; }
  if (cv.not) uyarilar.push(kaynak + ": " + cv.not);
  return cv.m * hm.fiyatBirim;
}

/** Hammaddenin kg/lt başına fiyatı (ölçü birimi adet ise null). Şüpheli H/I değerlerini yakalamak için. */
function sm_kgFiyat(hm) {
  if (!(hm.fiyatBirim > 0)) return null;
  if (hm.olcu === "gr" || hm.olcu === "ml") return hm.fiyatBirim * 1000;
  if (hm.olcu === "kg" || hm.olcu === "lt") return hm.fiyatBirim;
  return null;
}

/** YM'nin 1 stok birimi (1 gr veya 1 adet) maliyeti. Önbellekli, döngü korumalı. */
function sm_ymBirimMaliyet(ym, ctx, uyarilar, ziyaret) {
  var key = nrm(ym.ad);
  if (ctx.ymMaliyet[key] !== undefined) return ctx.ymMaliyet[key];
  ziyaret = ziyaret || [];
  if (ziyaret.indexOf(key) !== -1) { uyarilar.push(ym.ad + ": döngüsel YM reçetesi"); return 0; }
  if (!ym.recete.length) { uyarilar.push(ym.ad + ": Tbl_YariMamulRecete'de içerik yok"); ctx.ymMaliyet[key] = 0; return 0; }
  var bolen = sm_ymBolen(ym);
  if (!(bolen > 0)) {
    uyarilar.push(ym.ad + ": " + (ym.takip === "adet" ? "Porsiyon_adet" : "Baz_Miktar") + " boş (Tbl_YariMamul), maliyet 0");
    ctx.ymMaliyet[key] = 0; return 0;
  }
  ziyaret.push(key);
  var toplam = 0;
  for (var i = 0; i < ym.recete.length; i++) {
    var r = ym.recete[i];
    if (sm_sifirMi(nrm(r.ad))) continue;
    var hm = sm_bul(nrm(r.ad), ctx.hm);
    if (hm) { toplam += sm_hmMaliyet(hm.bilgi, r.miktar, r.birim, uyarilar, ym.ad + " › " + r.ad); continue; }
    var alt = sm_bul(nrm(r.ad), ctx.ym);
    if (alt && alt.bilgi !== ym) {
      var altBirim = sm_ymBirimMaliyet(alt.bilgi, ctx, uyarilar, ziyaret);
      var ac = sm_ymTakipMiktar(r.miktar, r.birim, alt.bilgi);
      if (ac.ok) toplam += ac.m * altBirim; else uyarilar.push(ym.ad + " › " + r.ad + ": " + ac.uyari);
      continue;
    }
    uyarilar.push(ym.ad + " › " + r.ad + ": tanımı yok");
  }
  ziyaret.pop();
  var birimMaliyet = toplam / bolen;          // Takip_tipi Adet → 1 porsiyon, gr → 1 gram maliyeti
  ctx.ymMaliyet[key] = birimMaliyet;
  return birimMaliyet;
}

/** 1 partinin maliyeti kaça bölünecek: Takip_tipi Adet → Porsiyon_adet (88), gr → Baz_Miktar (4345). */
function sm_ymBolen(ym) {
  if (ym.takip === "adet") {
    if (ym.porsAdet > 0) return ym.porsAdet;
    if (ym.baz > 0 && ym.porsGram > 0) return ym.baz / ym.porsGram;
    return 0;
  }
  if (ym.baz > 0) return ym.baz;
  if (ym.porsAdet > 0 && ym.porsGram > 0) return ym.porsAdet * ym.porsGram;
  return 0;
}

/** Reçetedeki YM miktarını Takip_tipi birimine (adet ya da gr) çevirir → {m, ok, uyari} */
function sm_ymTakipMiktar(miktar, birim, ym) {
  var m = Number(miktar) || 0;
  var b = sm_birim(birim);
  if (ym.takip === "adet") {
    if (b === "adet" || b === "paket" || !b) return { m: m, ok: true };
    if (b === "gr" || b === "ml") {
      if (ym.porsGram > 0) return { m: m / ym.porsGram, ok: true };
      return { m: 0, ok: false, uyari: ym.ad + ": gr→porsiyon için Porsiyon_gram gerekli" };
    }
    if (b === "kg" || b === "lt") {
      if (ym.porsGram > 0) return { m: m * 1000 / ym.porsGram, ok: true };
      return { m: 0, ok: false, uyari: ym.ad + ": kg→porsiyon için Porsiyon_gram gerekli" };
    }
  } else {
    if (b === "gr" || b === "ml" || !b) return { m: m, ok: true };
    if (b === "kg" || b === "lt") return { m: m * 1000, ok: true };
    if (b === "adet" || b === "paket") {
      if (ym.porsGram > 0) return { m: m * ym.porsGram, ok: true };
      return { m: 0, ok: false, uyari: ym.ad + ": adet→gr için Porsiyon_gram gerekli" };
    }
  }
  return { m: 0, ok: false, uyari: ym.ad + ": birim '" + birim + "' çevrilemez" };
}

/** Ürünün reçete maliyeti (TL). uyarilar dizisine sorunları ekler. */
function urunMaliyeti(recete, ctx, uyarilar) {
  var toplam = 0;
  for (var i = 0; i < recete.malzemeler.length; i++) {
    var m = recete.malzemeler[i];
    var mc = sm_malzemeCoz(m, ctx);
    if (mc.not) uyarilar.push(m.ad + ": " + mc.not);
    if (mc.tur === "SIFIR") continue;
    if (mc.tur === "HM") {
      toplam += sm_hmMaliyet(mc.bilgi, m.miktar, m.birim, uyarilar, m.ad);
    } else if (mc.tur === "YM") {
      var birim = sm_ymBirimMaliyet(mc.bilgi, ctx, uyarilar);
      var yc = sm_ymTakipMiktar(m.miktar, m.birim, mc.bilgi);
      if (yc.uyari) uyarilar.push(yc.uyari + ", maliyete dahil edilmedi");
      if (yc.ok) toplam += yc.m * birim;
    } else {
      uyarilar.push(m.ad + ": tanımı yok (" + (m.tip === "YM" ? YM_SEKME : HM_SEKME) + ")");
    }
    // olağandışı miktar uyarısı (parti miktarı girilmiş reçeteleri yakalar)
    var b = sm_birim(m.birim);
    if ((b === "gr" || b === "ml") && m.miktar > 2000) uyarilar.push(m.ad + ": " + m.miktar + " " + m.birim + " porsiyon için çok fazla, reçeteyi kontrol et");
    if (b === "adet" && m.miktar > 20) uyarilar.push(m.ad + ": " + m.miktar + " adet porsiyon için çok fazla, reçeteyi kontrol et");
  }
  return toplam;
}

/**
 * Ambalaj_Kurallari'na göre ürünün ambalaj maliyeti.
 * → { toplam, kalemler:[{malzeme, miktar, kaynak, hm, maliyet, not}] }  uyarilar dizisine sorunları ekler.
 * Ürün bazlı kurallar + kategori bazlı kurallar birlikte uygulanır (kategori: ürün listesi B sütunu).
 */
function ambalajMaliyeti(urunAd, kategori, ctx, uyarilar) {
  uyarilar = uyarilar || [];
  var liste = [];
  // 1) Kategori kuralları — her zaman uygulanır
  if (kategori) {
    var katKural = ctx.kurallar.kategori[nrm(kategori)] || [];
    katKural.forEach(function (k) {
      liste.push({ malzeme: k.malzeme, miktar: k.miktar, kaynak: "Kategori: " + kategori });
    });
    if (!katKural.length)
      uyarilar.push("Ambalaj: '" + kategori + "' kategorisi için Ambalaj_Kurallari'nda kural yok");
  } else {
    uyarilar.push("Ambalaj: ürünün kategorisi bulunamadı (BAP Genel Bilgiler › Menü, B sütunu)");
  }

  // 2) Ürün kuralları — kategorinin yerine geçmez, ÜZERİNE eklenir
  (ctx.kurallar.urun[nrm(urunAd)] || []).forEach(function (k) {
    liste.push({ malzeme: k.malzeme, miktar: k.miktar, kaynak: "Ürün: " + urunAd });
  });

  var sonuc = { toplam: 0, kalemler: [] };
  liste.forEach(function (k) {
    // Ambalajda SADECE birebir eşleşme.
// 1100CC / 1300CC gibi benzer ambalajların karışmasını engeller.
var ambKey = nrm(k.malzeme);
var ambBilgi = ctx.hm.harita[ambKey] || null;
var hm = ambBilgi
  ? { bilgi: ambBilgi, fuzzy: false }
  : null;
    var kalem = { malzeme: k.malzeme, miktar: k.miktar, kaynak: k.kaynak, hm: hm ? hm.bilgi : null, maliyet: 0, not: "" };
    if (!hm) {
      kalem.not = "ambalaj tablosunda yok";
      uyarilar.push("Ambalaj '" + k.malzeme + "': ambalaj tablosunda yok (C sütununa kısa adı yaz)");
    } else if (!(hm.bilgi.fiyatBirim > 0)) {
      kalem.not = "fiyat yok";
      uyarilar.push("Ambalaj '" + k.malzeme + "' (" + hm.bilgi.tamAd + "): fiyat yok (H paket içeriği, J paket fiyatı)");
    } else {
      kalem.maliyet = k.miktar * hm.bilgi.fiyatBirim;
      if (hm.fuzzy) kalem.not = "~" + hm.bilgi.tamAd;
      if (hm.bilgi.fiyatBirim > 150) uyarilar.push("Ambalaj '" + k.malzeme + "': adet fiyatı " + Math.round(hm.bilgi.fiyatBirim) + " TL, H (paket içeriği) eksik olabilir");
    }
    sonuc.toplam += kalem.maliyet;
    sonuc.kalemler.push(kalem);
  });
  return sonuc;
}

/** Tüm ürünlerin maliyetini Tbl_Maliyetler'e yazar (önce fiyatları Kolaybi'den tazeler). */
function maliyetRaporuOlustur() {
  var ss = stokDosyasi();
  var fiyatSonuc = fiyatlariGuncelle(true);
  var ctx = sm_baglamOlustur(ss);
  var katalog = sm_urunKatalogu(ss);          // ürün → {kategori, satisFiyati}

  var sh = ss.getSheetByName(MALIYET_SEKME);
  if (!sh) sh = ss.insertSheet(MALIYET_SEKME);
  sh.clearContents();
  var baslik = ["Ürün Adı", "Reçete Maliyeti (TL)", "Ambalaj Maliyeti (TL, paket servis)", "Toplam Maliyet (TL)",
                "Son Güncelleme", "Satış Fiyatı", "Maliyet %", "Uyarılar"];
  sh.getRange(1, 1, 1, baslik.length).setValues([baslik]).setFontWeight("bold").setBackground("#2c3e50").setFontColor("white");
  sh.setFrozenRows(1);

  var simdi = new Date();
  var satirlar = [];
  var uyariliUrun = 0;
  var uyariMap = {};
  ctx.receteler.sira.forEach(function (ad) {
    var rec = ctx.receteler.harita[nrm(ad)];
    var uyarilar = [];
    uyariMap[rec.key] = uyarilar;
    var recM = urunMaliyeti(rec, ctx, uyarilar);
    var kat = katalog[nrm(ad)] || {};
    var ambM = ambalajMaliyeti(ad, kat.kategori || "", ctx, uyarilar).toplam;
    var topM = recM + ambM;
    var oran = kat.satisFiyati > 0 ? topM / kat.satisFiyati : "";
    var tekil = uyarilar.filter(function (u, i) { return uyarilar.indexOf(u) === i; });
    if (tekil.length) uyariliUrun++;
    satirlar.push([ad, sm_yuvarla(recM), sm_yuvarla(ambM), sm_yuvarla(topM), simdi,
                   kat.satisFiyati || "", oran, tekil.join(" | ")]);
  });
  if (satirlar.length) {
    sh.getRange(2, 1, satirlar.length, baslik.length).setValues(satirlar);
    sh.getRange(2, 7, satirlar.length, 1).setNumberFormat("0%");
    sh.getRange(2, 2, satirlar.length, 3).setNumberFormat("#,##0.00");
  }
  sh.autoResizeColumns(1, 7);
  sm_receteDurumuYaz(ctx, katalog, uyariMap);
  sm_uyar("✅ Maliyet raporu güncellendi.\n\n" +
          satirlar.length + " ürün hesaplandı, " + uyariliUrun + " üründe uyarı var (H sütunu).\n" +
          "Fiyat: " + fiyatSonuc.guncellenen + " hammadde Kolaybi'den güncellendi, " + fiyatSonuc.eslesmeyen.length + " eşleşmedi.");
}

/**
 * Tek ürün maliyet detayı — Tbl_Receteler'den ACILIR LISTE ile ürün seçtirir.
 * (DEGISIKLIK 2: Eski prompt'lu surumun yerine.)
 */
function maliyetDetayGoster() {
  var ss = stokDosyasi();
  var adlar = {};
  var rSh = sm_sekmeBul(ss, RECETE_SEKME, ["urunadi", "hammaddekategori", "hammadde"]);
  if (rSh) {
    var rd = rSh.getDataRange().getValues();
    for (var i = 1; i < rd.length; i++) {
      var u = (rd[i][0] || "").toString().trim();
      if (u) adlar[u] = true;
    }
  }
  var liste = Object.keys(adlar).sort(function (a, b) { return a.localeCompare(b, "tr"); });
  if (!liste.length) { sm_uyar("Tbl_Receteler'de urun bulunamadi."); return; }

  var opsiyon = liste.map(function (ad) {
    return '<option value="' + ad.replace(/"/g, "&quot;") + '">' + ad + "</option>";
  }).join("");

  var html = HtmlService.createHtmlOutput(
    '<style>body{font-family:Arial;padding:16px}select{width:100%;padding:8px;font-size:14px;margin:10px 0}' +
    'button{background:#2c3e50;color:#fff;border:0;padding:10px 20px;border-radius:6px;font-size:14px;cursor:pointer}</style>' +
    '<b>Maliyet detayini gormek istedigin urunu sec:</b>' +
    '<select id="urun">' + opsiyon + "</select>" +
    '<button onclick="git()">Detayi Goster</button>' +
    "<script>function git(){var u=document.getElementById('urun').value;" +
    "google.script.run.withSuccessHandler(function(){google.script.host.close()}).maliyetDetay(u);}<\/script>"
  ).setWidth(420).setHeight(180);
  SpreadsheetApp.getUi().showModalDialog(html, "Tek Urun Maliyet Detayi");
}

function maliyetDetay(urunAdi) {
  var ss = stokDosyasi();
  var ctx = sm_baglamOlustur(ss);
  var r = sm_bul(nrm(urunAdi), ctx.receteler);
  if (!r) { sm_uyar("Reçete bulunamadı: " + urunAdi); return; }
  var rec = r.bilgi;
  var satirlar = [];

  function hmSatir(girinti, ad, miktar, birim, hm, carpan) {
    var u = [];
    var cv = sm_cevir(miktar, birim, hm.olcu, hm.paketIcerik);
    var maliyet = sm_hmMaliyet(hm, miktar, birim, u, ad) * (carpan || 1);
    var kg = sm_kgFiyat(hm);
    satirlar.push([girinti + ad, "HM", hm.tamAd, miktar, birim, cv.ok ? sm_yuvarla(cv.m) : "", hm.olcu,
                   hm.paketIcerik, hm.fiyatPaket, sm_yuvarla(hm.fiyatBirim * 1000) / 1000, kg === null ? "" : Math.round(kg),
                   sm_yuvarla(maliyet), u.join(" | ")]);
    return maliyet;
  }

  var toplam = 0;
  rec.malzemeler.forEach(function (m) {
    var mc = sm_malzemeCoz(m, ctx);
    if (mc.tur === "SIFIR") { satirlar.push([m.ad, "—", "", m.miktar, m.birim, "", "", "", "", 0, "", 0, "sıfır maliyet (su vb.)"]); return; }
    if (mc.tur === "HM") {
      toplam += hmSatir("", m.ad, m.miktar, m.birim, mc.bilgi, 1);
    } else if (mc.tur === "YM") {
      var ym = mc.bilgi, u = [];
      var birimM = sm_ymBirimMaliyet(ym, ctx, u);
      var yc = sm_ymTakipMiktar(m.miktar, m.birim, ym);
      var bolen = sm_ymBolen(ym);
      var ymMaliyet = yc.ok ? yc.m * birimM : 0;
      toplam += ymMaliyet;
      satirlar.push([m.ad, "YM", ym.ad, m.miktar, m.birim, yc.ok ? sm_yuvarla(yc.m * 1000) / 1000 : "",
                     "takip: " + (ym.takip || "?"), "1 parti = " + bolen + " " + (ym.takip || "?"), "",
                     sm_yuvarla(birimM * 1000) / 1000, "", sm_yuvarla(ymMaliyet),
                     (yc.uyari || "") + (u.length ? " " + u.join(" | ") : "") + " — parti reçetesi aşağıda"]);
      var pay = (yc.ok && bolen > 0) ? yc.m / bolen : 0;   // bu ürünün partiden aldığı pay
      ym.recete.forEach(function (rr) {
        if (sm_sifirMi(nrm(rr.ad))) { satirlar.push(["    ↳ " + rr.ad, "—", "", rr.miktar, rr.birim, "", "", "", "", 0, "", 0, "sıfır maliyet"]); return; }
        var h = sm_bul(nrm(rr.ad), ctx.hm);
        if (h) { hmSatir("    ↳ ", rr.ad, rr.miktar, rr.birim, h.bilgi, pay); }
        else satirlar.push(["    ↳ " + rr.ad, "?", "", rr.miktar, rr.birim, "", "", "", "", "", "", 0, "tanımı yok"]);
      });
    } else {
      satirlar.push([m.ad, "?", "", m.miktar, m.birim, "", "", "", "", "", "", 0, "tanımı yok"]);
    }
  });
  satirlar.push(["REÇETE TOPLAMI", "", "", "", "", "", "", "", "", "", "", sm_yuvarla(toplam), ""]);

  // Ambalaj (Ambalaj_Kurallari: ürün + kategori)
  var katalog = sm_urunKatalogu(ss);
  var kat = katalog[nrm(rec.ad)] || {};
  var ambU = [];
  var amb = ambalajMaliyeti(rec.ad, kat.kategori || "", ctx, ambU);
  satirlar.push(["", "", "", "", "", "", "", "", "", "", "", "", ""]);
  satirlar.push(["AMBALAJ (kategori: " + (kat.kategori || "?") + ")", "", "", "", "", "", "", "", "", "", "", "", ambU.length ? ambU.join(" | ") : ""]);
  amb.kalemler.forEach(function (k) {
    var h = k.hm;
    satirlar.push(["    ↳ " + k.malzeme, "AMB", h ? h.tamAd : "", k.miktar, "adet", h ? k.miktar : "", h ? (h.olcu || "adet") : "",
                   h ? h.paketIcerik : "", h ? h.fiyatPaket : "", h ? sm_yuvarla(h.fiyatBirim * 1000) / 1000 : "", "",
                   sm_yuvarla(k.maliyet), (k.kaynak + (k.not ? " · " + k.not : ""))]);
  });
  satirlar.push(["AMBALAJ TOPLAMI", "", "", "", "", "", "", "", "", "", "", sm_yuvarla(amb.toplam), ""]);
  satirlar.push(["", "", "", "", "", "", "", "", "", "", "", "", ""]);
  satirlar.push(["GENEL TOPLAM", "", "", "", "", "", "", "", "", "", "", sm_yuvarla(toplam + amb.toplam),
                 kat.satisFiyati > 0 ? "Satış " + kat.satisFiyati + " TL → maliyet %" + Math.round((toplam + amb.toplam) / kat.satisFiyati * 100) : ""]);

  var sh = ss.getSheetByName("Maliyet_Detay");
  if (!sh) sh = ss.insertSheet("Maliyet_Detay"); else sh.clearContents();
  var baslik = ["Malzeme", "Tür", "Eşleşen tablo adı", "Reçete miktarı", "Reçete birimi", "Stok birimine çevrilmiş",
                "Stok birimi (I)", "Paket içeriği (H)", "Paket fiyatı (J)", "Birim fiyat (J/H)", "≈ TL/kg", "Maliyet (TL)", "Not"];
  sh.getRange(1, 1, 1, baslik.length).setValues([[rec.ad + " — maliyet detayı"].concat(baslik.slice(1).map(function () { return ""; }))]);
  sh.getRange(2, 1, 1, baslik.length).setValues([baslik]).setFontWeight("bold").setBackground("#2c3e50").setFontColor("white");
  sh.getRange(3, 1, satirlar.length, baslik.length).setValues(satirlar);
  sh.setFrozenRows(2);
  sh.autoResizeColumns(1, baslik.length);
  sm_uyar(rec.ad + ": reçete " + sm_yuvarla(toplam) + " + ambalaj " + sm_yuvarla(amb.toplam) + " = " + sm_yuvarla(toplam + amb.toplam) + " TL — döküm 'Maliyet_Detay' sekmesinde.");
}

/** Menü sekmesini bulur (BAP Genel Bilgiler): adıyla, yoksa başlıktan (A Urun_Ad…, B Kategori, C Fiyat). */
function sm_menuSekmesi() {
  var gss = SpreadsheetApp.openById(GENEL_BILGILER_ID);
  var sh = gss.getSheetByName(MENU_SEKME);
  if (sh) return sh;
  var bulunan = null;
  gss.getSheets().some(function (s2) {
    if (s2.getLastRow() < 2 || s2.getLastColumn() < 3) return false;
    var b = s2.getRange(1, 1, 1, 3).getValues()[0];
    if (sade(b[0]).indexOf("urunad") === 0 && sade(b[1]) === "kategori" && sade(b[2]).indexOf("fiyat") === 0) { bulunan = s2; return true; }
    return false;
  });
  return bulunan;
}

/**
 * Ürün kataloğu = BAP Genel Bilgiler › Menü (tek kaynak). nrm(ad) → { kategori, satisFiyati, tip, aktif, satir }.
 * Erişilemezse boş döner (maliyet raporu satış fiyatı ve kategori olmadan devam eder).
 */
function sm_urunKatalogu(ss) {
  var sonuc = {};
  try {
    var sh = sm_menuSekmesi();
    if (!sh) return sonuc;
    var d = sh.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) {
      var ad = (d[i][0] || "").toString().trim();
      if (!ad) continue;
      sonuc[nrm(ad)] = { ad: ad, kategori: (d[i][1] || "").toString().trim(), satisFiyati: sm_sayi(d[i][2]),
                         tip: (d[i][7] || "").toString().trim(), aktif: trKucuk(d[i][5]).indexOf("aktif") === 0 || d[i][5] === "", satir: i + 1 };
    }
  } catch (e) { Logger.log("Menü okunamadı: " + e); }
  return sonuc;
}

/**
 * Menü sekmesinin I sütununa her ürünün reçete durumunu yazar:
 * "Tam" | "Eksik: n tanımsız" | "Reçete yok" | "Yarı mamul" | "Direkt satış". Maliyet raporu sonunda çağrılır.
 */
function sm_receteDurumuYaz(ctx, katalog, uyariMap) {
  try {
    var sh = sm_menuSekmesi();
    if (!sh) return;
    var son = sh.getLastRow();
    if (son < 2) return;
    if (sade(sh.getRange(1, 9).getValue()) !== "recetedurumu") sh.getRange(1, 9).setValue("Reçete_Durumu").setFontWeight("bold");
    var kol = [], tam = 0, eksik = 0, yok = 0;
    for (var r = 2; r <= son; r++) kol.push([""]);
    Object.keys(katalog).forEach(function (key) {
      var k = katalog[key], tip = trKucuk(k.tip);
      var durum;
      if (tip.indexOf("yar") === 0) durum = "Yarı mamul";
      else if (tip.indexOf("dire") === 0) durum = "Direkt satış";
      else {
        var b = sm_bul(key, ctx.receteler);
        if (!b) { durum = "Reçete yok"; yok++; }
        else {
          var u = uyariMap[b.bilgi.key] || [];
          var n = u.filter(function (x) { return x.indexOf("tanımı yok") !== -1 || x.indexOf("fiyat yok") !== -1; }).length;
          if (n) { durum = "Eksik: " + n + " malzeme" + (b.fuzzy ? " (~" + b.bilgi.ad + ")" : ""); eksik++; }
          else { durum = "Tam" + (b.fuzzy ? " (~" + b.bilgi.ad + ")" : ""); tam++; }
        }
      }
      if (k.satir >= 2 && k.satir <= son) kol[k.satir - 2][0] = durum;
    });
    sh.getRange(2, 9, kol.length, 1).setValues(kol);
    Logger.log("Menü reçete durumu: " + tam + " tam, " + eksik + " eksik, " + yok + " reçete yok");
  } catch (e) { Logger.log("Reçete durumu yazılamadı: " + e); }
}

// ==========================================
// 6. FİYAT GÜNCELLEME (Kolaybi Urun_Listesi → J)
// ==========================================

/**
 * Urun_Listesi (A ürün adı, C son fiyat) → Tbl_Hammaddeler J ve Direktsatisurunler J.
 * Koli ile alınan ürünlerde (F=Koli, P>1) koli fiyatı P'ye bölünerek paket fiyatı yazılır.
 * sessiz=true ise alert göstermez (maliyet raporu içinden çağrı).
 */
function fiyatlariGuncelle(sessiz) {
  var sonuc = { guncellenen: 0, eslesmeyen: [] };
  var kss;
  try { kss = SpreadsheetApp.openById(KOLAYBI_DOSYA_ID); } catch (e) { Logger.log("Kolaybi dosyası açılamadı: " + e); return sonuc; }
  var ksh = kss.getSheetByName(KOLAYBI_FIYAT_SEKME);
  if (!ksh) { Logger.log("Kolaybi '" + KOLAYBI_FIYAT_SEKME + "' sekmesi yok"); return sonuc; }

  var fiyatlar = { harita: {}, anahtarlar: [] };
  var kd = ksh.getDataRange().getValues();
  for (var i = 1; i < kd.length; i++) {
    var ad = (kd[i][0] || "").toString().trim();
    var f = sm_sayi(kd[i][2]);
    if (!ad || !(f > 0)) continue;
    var k = nrm(ad);
    if (!fiyatlar.harita[k]) { fiyatlar.harita[k] = { ad: ad, fiyat: f }; fiyatlar.anahtarlar.push(k); }
  }

  var ss = stokDosyasi();
  var sekmeler = [HM_SEKME, DS_SEKME];
  ss.getSheets().forEach(function (s2) {            // ambalaj/sarf sekmeleri (başlığı Hammadde_ID | Hammadde_Adı)
    var ad = s2.getName();
    if (ad === HM_SEKME || ad === DS_SEKME || s2.getLastRow() < 2 || s2.getLastColumn() < 2) return;
    var b = s2.getRange(1, 1, 1, 2).getValues()[0];
    if (sade(b[0]) === "hammaddeid" && sade(b[1]).indexOf("hammaddead") === 0) sekmeler.push(ad);
  });
  sekmeler.forEach(function (sekmeAdi) {
    var sh = ss.getSheetByName(sekmeAdi);
    if (!sh) return;
    var d = sh.getDataRange().getValues();
    for (var r = 1; r < d.length; r++) {
      var tam = (d[r][1] || "").toString().trim();
      if (!tam) continue;
      var b = sm_bul(nrm(tam), fiyatlar);
      if (!b || (b.fuzzy && b.skor < 0.9)) { sonuc.eslesmeyen.push(tam); continue; }
      var fiyat = b.bilgi.fiyat;
      var koliMu = trKucuk(d[r][5]).indexOf("koli") === 0;
      var koliIc = sm_sayi(d[r][15]);
      if (koliMu && koliIc > 1) fiyat = fiyat / koliIc;
      fiyat = Math.round(fiyat * 10000) / 10000;
      if (sm_sayi(d[r][9]) !== fiyat) { sh.getRange(r + 1, 10).setValue(fiyat); sonuc.guncellenen++; }
    }
  });

  Logger.log("Fiyat: " + sonuc.guncellenen + " güncellendi, " + sonuc.eslesmeyen.length + " Urun_Listesi'nde yok.");
  if (!sessiz) sm_uyar("✅ Fiyatlar güncellendi.\n\nGüncellenen: " + sonuc.guncellenen +
                       "\nUrun_Listesi'nde bulunamayan: " + sonuc.eslesmeyen.length +
                       (sonuc.eslesmeyen.length ? "\n\n" + sonuc.eslesmeyen.slice(0, 12).join("\n") + (sonuc.eslesmeyen.length > 12 ? "\n…" : "") : ""));
  return sonuc;
}

// ==========================================
// 7. KURULUM / GERİ ALMA / TETİKLEYİCİ / MENÜ
// ==========================================

function eskileriIsaretle() {
  var sh = kaynakSayfa();
  if (!sh) { sm_uyar(SATIS_SEKME + " bulunamadı!"); return; }
  var son = sh.getLastRow();
  if (son < 2) return;
  var kolon = isaretKolonuHazirla(sh);
  var dolu = [];
  for (var i = 2; i <= son; i++) dolu.push(["✓"]);
  sh.getRange(2, kolon, dolu.length, 1).setValues(dolu);
  sm_uyar("✅ " + dolu.length + " eski satış satırı işlendi olarak işaretlendi.");
}

/** Satis_Hareketleri'ndeki TÜM satış düşümlerini geri alır ve arşive taşır. */
function satisDusumleriniGeriAl() {
  sm_geriAl(function (hareket) { return hareket === "Satis" || hareket === "Satis Dusumu"; }, true);
}

/** Sadece NotebookLM v6.3'ün yazdığı "Satis Dusumu" satırlarını geri alır (bugünkü hatalı düşümler). */
function notebookDusumleriniGeriAl() {
  sm_geriAl(function (hareket) { return hareket === "Satis Dusumu"; }, false);
}

function sm_geriAl(filtre, arsivle) {
  var ss = stokDosyasi();
  var log = ss.getSheetByName(LOG_SEKME);
  if (!log || log.getLastRow() < 2) { sm_uyar("Geri alınacak kayıt yok."); return; }
  var rows = log.getDataRange().getValues();
  var geri = {}, secilen = [], kalan = [];
  for (var i = 1; i < rows.length; i++) {
    var hareket = (rows[i][4] || "").toString().trim();
    if (!filtre(hareket)) { kalan.push(rows[i]); continue; }
    secilen.push(rows[i]);
    var ad = (rows[i][2] || "").toString().trim();
    var tip = (rows[i][3] || "").toString().toUpperCase().trim();
    var sube = (rows[i][1] || "").toString().trim();
    var dusulen = sm_sayi(rows[i][7]);
    if (!ad || !dusulen) continue;
    var k = nrm(ad) + "|" + tip + "|" + nrm(sube);
    if (!geri[k]) geri[k] = { ad: ad, tip: tip, sube: sube, miktar: 0 };
    geri[k].miktar += dusulen;
  }
  if (!secilen.length) { sm_uyar("Kriterlere uyan log satırı yok."); return; }

  var sh = ss.getSheetByName(STOK_SEKME);
  var lastRow = sh.getLastRow();
  var stok = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, 9).getValues() : [];
  var idx = {};
  for (var j = 0; j < stok.length; j++) {
    if (!stok[j][0]) continue;
    idx[nrm(stok[j][0]) + "|" + (stok[j][1] || "").toString().toUpperCase().trim() + "|" + nrm(stok[j][2])] = j;
  }
  var duzeltilen = 0, bulunamayan = [];
  Object.keys(geri).forEach(function (k) {
    var g = geri[k], r = idx[k];
    if (r === undefined) { bulunamayan.push(g.ad + " (" + g.tip + "/" + g.sube + ")"); return; }
    stok[r][3] = Math.round((sm_sayi(stok[r][3]) + g.miktar) * 1000) / 1000;
    stok[r][4] = Math.round((sm_sayi(stok[r][4]) + g.miktar) * 1000) / 1000;
    stok[r][8] = new Date();
    duzeltilen++;
  });
  sm_stokYaz(sh, stok, stok.length);

  if (arsivle) {
    var arsiv = ss.getSheetByName(LOG_SEKME + "_Arsiv");
    if (!arsiv) { arsiv = ss.insertSheet(LOG_SEKME + "_Arsiv"); arsiv.appendRow(rows[0]); arsiv.setFrozenRows(1); }
    arsiv.getRange(arsiv.getLastRow() + 1, 1, secilen.length, rows[0].length).setValues(secilen);
  }
  // logu yeniden yaz: sadece kalanlar
  if (rows.length > 1) log.deleteRows(2, rows.length - 1);
  if (kalan.length) log.getRange(2, 1, kalan.length, rows[0].length).setValues(kalan);

  var mesaj = "✅ " + secilen.length + " log satırı geri alındı, " + duzeltilen + " stok kalemi düzeltildi.";
  if (bulunamayan.length) mesaj += "\n⚠️ Sube_Stok'ta bulunamayan " + bulunamayan.length + ": " + bulunamayan.slice(0, 8).join(", ");
  sm_uyar(mesaj);
}

/**
 * TEK SEFERLİK: Sube_Stok'taki YM satırlarını Cikti_Tipi biriminden Takip_tipi birimine çevirir
 * (ör. Pizza Hamuru 78.908 gr → 438 adet, Porsiyon_gram=180 ile). Script property ile ikinci kez çalışmaz.
 * Sadece Takip_tipi ≠ Cikti_Tipi olan ve Porsiyon_gram'ı dolu YM'lere dokunur.
 */
function ymStokTakipBirimineGec() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("ymTakipBirimi_v7") === "ok") { sm_uyar("Bu dönüşüm daha önce yapılmış, tekrar çalıştırılmadı."); return; }
  var ss = stokDosyasi();
  var ymler = ymHaritasi(ss);
  var sh = ss.getSheetByName(STOK_SEKME);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  var rows = sh.getRange(2, 1, lastRow - 1, 9).getValues();
  var loglar = [], simdi = new Date(), sayac = 0, atlanan = [];
  for (var i = 0; i < rows.length; i++) {
    if ((rows[i][1] || "").toString().toUpperCase().trim() !== "YM" || !rows[i][0]) continue;
    var b = sm_bul(nrm(rows[i][0]), ymler);
    if (!b) { atlanan.push(rows[i][0] + " (Tbl_YariMamul'de yok)"); continue; }
    var ym = b.bilgi;
    if (!ym.takip || ym.takip === ym.cikti) continue;               // zaten aynı birim
    var carpan = 0;
    if (ym.cikti === "gr" && ym.takip === "adet" && ym.porsGram > 0) carpan = 1 / ym.porsGram;
    if (ym.cikti === "adet" && ym.takip === "gr" && ym.porsGram > 0) carpan = ym.porsGram;
    if (!carpan) { atlanan.push(rows[i][0] + " (Porsiyon_gram yok)"); continue; }
    var eskiM = sm_sayi(rows[i][3]), eskiT = sm_sayi(rows[i][4]), eskiS = sm_sayi(rows[i][5]);
    rows[i][3] = Math.round(eskiM * carpan * 1000) / 1000;
    rows[i][4] = Math.round(eskiT * carpan * 1000) / 1000;
    if (rows[i][5] !== "" && rows[i][5] !== null) rows[i][5] = Math.round(eskiS * carpan * 1000) / 1000;
    rows[i][8] = simdi;
    loglar.push([simdi, rows[i][2], rows[i][0], "YM", "Birim Donusumu", eskiM, rows[i][3], 0, ym.takip,
                 ym.cikti + " → " + ym.takip + " (Porsiyon_gram " + ym.porsGram + ")"]);
    sayac++;
  }
  sh.getRange(2, 4, rows.length, 3).setValues(rows.map(function (r) { return [r[3], r[4], r[5]]; }));
  sh.getRange(2, 9, rows.length, 1).setValues(rows.map(function (r) { return [r[8]]; }));
  if (loglar.length) {
    var log = ss.getSheetByName(LOG_SEKME);
    if (log) { log.insertRowsBefore(2, loglar.length); log.getRange(2, 1, loglar.length, 10).setValues(loglar); }
  }
  props.setProperty("ymTakipBirimi_v7", "ok");
  sm_uyar("✅ " + sayac + " YM satırı Takip_tipi birimine çevrildi." +
          (atlanan.length ? "\n⚠️ Atlanan: " + atlanan.join(", ") : ""));
}

/** Fiyat senkronu: her gün 00:40 ve 14:40 (Kolaybi dosyasındaki kalemleriAyir 00:10/14:10'dan sonra). */
function fiyatTetikleyiciKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "fiyatlariGuncelleOtomatik") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("fiyatlariGuncelleOtomatik").timeBased().atHour(0).nearMinute(40).everyDays(1).create();
  ScriptApp.newTrigger("fiyatlariGuncelleOtomatik").timeBased().atHour(14).nearMinute(40).everyDays(1).create();
  sm_uyar("✅ Fiyat senkron tetikleyicisi kuruldu: her gün 00:40 ve 14:40.");
}

/** Tetikleyiciden çağrılır: fiyatları çeker, sonucu Fiyat_Log sekmesine üstten yazar. */
function fiyatlariGuncelleOtomatik() {
  var sonuc = fiyatlariGuncelle(true);
  var ss = stokDosyasi();
  var sh = ss.getSheetByName("Fiyat_Log");
  if (!sh) {
    sh = ss.insertSheet("Fiyat_Log");
    sh.appendRow(["Tarih", "Güncellenen", "Eşleşmeyen", "Eşleşmeyen ürünler"]);
    sh.getRange(1, 1, 1, 4).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  sh.insertRowsBefore(2, 1);
  sh.getRange(2, 1, 1, 4).setValues([[new Date(), sonuc.guncellenen, sonuc.eslesmeyen.length, sonuc.eslesmeyen.slice(0, 40).join(", ")]]);
}

function satisTetikleyiciKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "stokMotoru") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("stokMotoru").timeBased().everyMinutes(5).create();
  sm_uyar("✅ Satış motoru tetikleyicisi kuruldu (5 dk).");
}

function onOpen() {
  // S7/S8: riskli tek seferlik düğmeler (eskileri işaretle, tüm satış düşümlerini geri al, NotebookLM geri al,
  // YM birim dönüşümü) ve eski maliyet raporu menüden kaldırıldı. Fonksiyonlar duruyor; gerekirse editörden çalıştırılır.
  // Maliyet raporu artık yalnızca BAP Maliyet modülünden üretilir.
  SpreadsheetApp.getUi().createMenu("🍕 BAP Stok")
    .addItem("Manuel Satış İşle", "stokMotoru")
    .addItem("⏱ Otomatik Tetikleyici Kur (5 dk)", "satisTetikleyiciKur")
    .addItem("⏱ Fiyat Senkron Tetikleyicisi Kur (00:40 / 14:40)", "fiyatTetikleyiciKur")
    .addSeparator()
    .addItem("💰 Fiyatları Kolaybi'den Güncelle", "fiyatlariGuncelle")
    .addToUi();
}

// ==========================================
// 8. YARDIMCILAR
// ==========================================

function isaretKolonuHazirla(sh) {
  var bas = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (x) { return sade(x); });
  var i = bas.indexOf(sade(ISARET_BASLIK));
  if (i >= 0) return i + 1;
  var kolon = sh.getLastColumn() + 1;
  sh.getRange(1, kolon).setValue(ISARET_BASLIK).setFontWeight("bold");
  return kolon;
}

/**
 * Sube_Stok'a yalnızca D:E (Mevcut/Teorik) ve I (Son_Guncelleme) yazılır; F/G/H'deki
 * formüller ezilmez. eskiSatirSayisi'ndan sonraki satırlar yenidir → A:C de yazılır.
 */
function sm_stokYaz(sh, rows, eskiSatirSayisi) {
  if (!rows.length) return;
  sh.getRange(2, 4, rows.length, 2).setValues(rows.map(function (r) { return [r[3], r[4]]; }));
  sh.getRange(2, 9, rows.length, 1).setValues(rows.map(function (r) { return [r[8]]; }));
  var yeniler = rows.slice(eskiSatirSayisi);
  if (yeniler.length) {
    sh.getRange(2 + eskiSatirSayisi, 1, yeniler.length, 3).setValues(yeniler.map(function (r) { return [r[0], r[1], r[2]]; }));
    sh.getRange(2 + eskiSatirSayisi, 8, yeniler.length, 1).setValues(yeniler.map(function () { return [0]; }));
  }
}

/** Satış tablosunda başlığı "Durum" olan sütun (1 tabanlı); yoksa 0. */
function sm_durumKolonu(sh) {
  var bas = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var i = 0; i < bas.length; i++) if (sade(bas[i]) === "durum") return i + 1;
  return 0;
}

function sm_islendiMi(v) {
  if (v === true) return true;
  if (sade(v) === "iptal") return true;
  var s = (v || "").toString().trim().toLowerCase();
  return s === "✓" || s === "true" || s === "doğru" || s === "islendi" || s === "işlendi" || s === "1";
}

function sm_uyarilariYaz(ss, uyarilar) {
  if (!uyarilar.length) return;
  var sh = ss.getSheetByName(UYARI_SEKME);
  if (!sh) {
    sh = ss.insertSheet(UYARI_SEKME);
    sh.appendRow(["Tarih", "Siparis_ID", "Urun", "Sorun"]);
    sh.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#b45309").setFontColor("white");
    sh.setFrozenRows(1);
  }
  var simdi = new Date();
  var gorulen = {}, satirlar = [];
  uyarilar.forEach(function (u) {
    var k = u[1] + "|" + u[2];
    if (gorulen[k]) return;
    gorulen[k] = true;
    satirlar.push([simdi, u[0], u[1], u[2]]);
  });
  sh.insertRowsBefore(2, satirlar.length);
  sh.getRange(2, 1, satirlar.length, 4).setValues(satirlar);
}

function satisTarihi(deger) {
  if (!deger) return null;
  if (deger instanceof Date) return deger;
  var t = deger.toString().trim();
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

function baslangicTarihi() {
  var m = MOTOR_BASLANGIC.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : new Date(2000, 0, 1);
}

function subeCoz(deger) {
  var s = sade(deger);
  if (s.indexOf("erenkoy") !== -1) return "Erenköy";
  if (s.indexOf("fikirtepe") !== -1) return "Fikirtepe";
  return (deger || "").toString().trim();
}

/** "1.100,00" / "0.05" / "2,4" / sayı → number */
function sm_sayi(v) {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (v === null || v === undefined) return 0;
  var s = v.toString().trim();
  if (!s) return 0;
  if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Stok_Takip vb. onay kutuları: TRUE/DOĞRU/true → true, FALSE/YANLIŞ → false, boş → null */
function sm_bool(v) {
  if (v === true) return true;
  if (v === false) return false;
  var s = trKucuk(v).trim();
  if (!s) return null;
  if (s === "true" || s === "doğru" || s === "evet" || s === "1") return true;
  if (s === "false" || s === "yanlış" || s === "hayır" || s === "0") return false;
  return null;
}

function sm_yuvarla(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function sm_uyar(msg) {
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* editörden çalıştırıldı */ }
}

/** Dice benzerliği (karakter ikilileri). 0-1 */
function sm_benzerlik(a, b) {
  if (a === b) return 1;
  if (!a || !b || a.length < 2 || b.length < 2) return 0;
  var say = {}, n = 0;
  for (var i = 0; i < a.length - 1; i++) { var g = a.substr(i, 2); say[g] = (say[g] || 0) + 1; }
  for (var j = 0; j < b.length - 1; j++) { var h = b.substr(j, 2); if (say[h] > 0) { say[h]--; n++; } }
  return (2 * n) / (a.length - 1 + b.length - 1);
}

function sade(s) {
  return (s || "").toString().replace(/[İIı]/g, "i").replace(/[Ğğ]/g, "g").replace(/[Üü]/g, "u")
    .replace(/[Şş]/g, "s").replace(/[Öö]/g, "o").replace(/[Çç]/g, "c").toLowerCase().replace(/[\s._\-]/g, "");
}

function trKucuk(s) {
  return (s || "").toString().replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
}

function nrm(s) {
  return trKucuk(s).replace(/[\s.,\-*/()'"&:;!?]/g, "");
}

function satisSiparisIdleriniDoldur() {
  var ss = stokDosyasi();
  var sh = ss.getSheetByName(LOG_SEKME);

  if (!sh) {
    Logger.log("Satis_Hareketleri bulunamadı.");
    return;
  }

  var sonSatir = sh.getLastRow();

  if (sonSatir < 2) {
    Logger.log("Doldurulacak satış hareketi yok.");
    return;
  }

  // K sütunu başlığı
  sh.getRange(1, 11).setValue("Siparis_ID");

  // J = Detay
  var detaylar = sh.getRange(2, 10, sonSatir - 1, 1).getValues();

  var sonuc = detaylar.map(function(row) {
    var detay = (row[0] || "").toString();

    // Detay içindeki #123456789 formatındaki siparişleri bul
    var bulunan = detay.match(/#(\d+)/g) || [];

    var benzersiz = [];

    bulunan.forEach(function(id) {
      id = id.replace("#", "");

      if (benzersiz.indexOf(id) === -1) {
        benzersiz.push(id);
      }
    });

    return [benzersiz.join(", ")];
  });

  // K = Siparis_ID
  sh.getRange(2, 11, sonuc.length, 1).setValues(sonuc);

  Logger.log(
    "Tamamlandı: " +
    sonuc.length +
    " Satis_Hareketleri satırı kontrol edildi, Siparis_ID sütunu dolduruldu."
  );
}