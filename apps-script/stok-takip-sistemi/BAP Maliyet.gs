// ============================================================
// BAP MALİYET MODÜLÜ v1  —  AYRI APPS SCRIPT PROJESİ
// ------------------------------------------------------------
// OKUR  : Stok dosyası › Tbl_Receteler, Tbl_YariMamul, Tbl_YariMamulRecete,
//         Tbl_Hammaddeler, ambalaj sekmeleri (başlık Hammadde_ID | Hammadde_Adı),
//         Ambalaj_Kurallari
//         BAP Genel Bilgiler › Menü (kategori, satış fiyatı)
// YAZAR : Stok dosyası › Tbl_Maliyetler, Maliyet_Detay
//         BAP Genel Bilgiler › Menü I sütunu (Reçete_Durumu)
// DOKUNMAZ: fiyatlar (Kolaybi), stok, satış hareketleri
//
// KURALLAR
//   • Hammadde: yalnızca E (Tedarikçi Sipariş Aktif) işaretli + I (Ölçü_Birimi) dolu
//     + H (Birim/paket içeriği) dolu satırlar kullanılır.
//   • Ambalaj: yalnızca E işaretli satırlar kullanılır.
//   • Bulunamayan malzeme maliyete eklenmez, notuna nedeni yazılır.
//   • Benzer isimle eşleşen her kalemin notunda "~ benzer isimle eşleşti" yazar.
//
// KURULUM: kurulum() fonksiyonunu BİR KERE çalıştır.
//   → her gece 04:00 Tbl_Maliyetler güncellenir
//   → Maliyet_Detay sekmesinde B1'den ürün seçince detay anında hesaplanır
// ============================================================
var CFG = {
  STOK_DOSYA_ID:     "1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE",
  GENEL_BILGILER_ID: "1rcOUvokeb0VG3mm72-IKV1-bk0WugEcNSvDaHz41pP8",
  MENU_SEKME:        "Menü",
  RECETE_SEKME:      "Tbl_Receteler",
  YM_SEKME:          "Tbl_YariMamul",
  YM_RECETE_SEKME:   "Tbl_YariMamulRecete",
  HM_SEKME:          "Tbl_Hammaddeler",
  DS_SEKME:          "Direktsatisurunler",
  KURAL_SEKME:       "Ambalaj_Kurallari",
  MALIYET_SEKME:     "Tbl_Maliyetler",
  DETAY_SEKME:       "Maliyet_Detay",
  BENZERLIK_ESIK:    0.85,
  SIFIR_MALIYET:     ["Su"],
  GECE_SAATI:        4
};
var NOT_BULUNAMADI = "AKTİF TEDARİKÇİDE ÜRÜN BULUNAMADI, maliyete eklenmedi";
var NOT_TANIMSIZ   = "TANIMI YOK: hiçbir tabloda bulunamadı, maliyete eklenmedi";
var DETAY_BASLIK   = ["Malzeme", "Tür", "Eşleşen tablo adı", "Tedarikçi", "Reçete miktarı", "Reçete birimi",
                      "Stok birimine çevrilmiş", "Stok birimi (I)", "Paket içeriği (H)", "Paket fiyatı (J)",
                      "Birim fiyat (J/H)", "≈ TL/kg", "Maliyet (TL)", "Not"];
// ============================================================
// 1. ÇALIŞTIRILACAK FONKSİYONLAR
// ============================================================
/** Bir kere çalıştır: tetikleyicileri kurar, Maliyet_Detay'ı hazırlar, ilk raporu üretir. */
function kurulum() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (["maliyetRaporu", "detayTetik"].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("maliyetRaporu").timeBased().everyDays(1)
    .atHour(CFG.GECE_SAATI).inTimezone("Europe/Istanbul").create();
  ScriptApp.newTrigger("detayTetik").forSpreadsheet(CFG.STOK_DOSYA_ID).onEdit().create();
  detaySekmesi(stokDosyasi(), true);
  maliyetRaporu();
  Logger.log("✅ Kurulum tamam. Gece " + CFG.GECE_SAATI + ":00 rapor + Maliyet_Detay B1 seçimi aktif.");
}
/** Tüm ürünlerin maliyeti → Tbl_Maliyetler. Gece tetikleyicisi bunu çalıştırır. */
function maliyetRaporu() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log("Başka bir maliyet çalışması sürüyor, atlandı."); return; }
  try {
    var ss = stokDosyasi();
    var ctx = baglamOlustur(ss);
    var katalog = urunKatalogu();
    var simdi = new Date();
    var satirlar = [], uyariMap = {}, uyarili = 0;
    ctx.receteler.sira.forEach(function (ad) {
      var rec = ctx.receteler.harita[nrm(ad)];
      if (!rec.aktif) return;
      var kat = katalog[rec.key] || {};
      var u = urunHesapla(rec, ctx);
      var a = ambalajHesapla(rec.ad, kat.kategori || "", ctx);
      var tum = tekil(u.uyarilar.concat(a.uyarilar));
      uyariMap[rec.key] = tum;
      if (tum.length) uyarili++;
      var top = u.toplam + a.toplam;
      satirlar.push([rec.ad, yuvarla(u.toplam), yuvarla(a.toplam), yuvarla(top), simdi,
                     kat.satisFiyati || "", kat.satisFiyati > 0 ? top / kat.satisFiyati : "",
                     kisalt(tum.join(" | "))]);
    });
    if (!satirlar.length) throw new Error("Tbl_Receteler H sütununda aktif ürün bulunamadı; mevcut maliyet tablosu korunuyor.");
    // Hesap bitince yaz (yarıda hata olursa eski tablo silinmez)
    var sh = ss.getSheetByName(CFG.MALIYET_SEKME) || ss.insertSheet(CFG.MALIYET_SEKME);
    var baslik = ["Ürün Adı", "Reçete Maliyeti (TL)", "Ambalaj Maliyeti (TL, paket servis)", "Toplam Maliyet (TL)",
                  "Son Güncelleme", "Satış Fiyatı", "Maliyet %", "Uyarılar"];
    sh.clearContents();
    sh.getRange(1, 1, 1, baslik.length).setValues([baslik]).setFontWeight("bold")
      .setBackground("#2c3e50").setFontColor("white");
    sh.setFrozenRows(1);
    if (satirlar.length) {
      sh.getRange(2, 1, satirlar.length, baslik.length).setValues(satirlar);
      sh.getRange(2, 2, satirlar.length, 3).setNumberFormat("#,##0.00");
      sh.getRange(2, 7, satirlar.length, 1).setNumberFormat("0%");
    }
    receteDurumuYaz(ctx, katalog, uyariMap);
    detayListesiGuncelle(ss, ctx);
    Logger.log("✅ Maliyet raporu: " + satirlar.length + " ürün, " + uyarili + " üründe uyarı. " +
               "Kullanılan hammadde: " + ctx.hm.sayac.aktif + ", elenen: " + ctx.hm.sayac.elenen);
  } finally {
    lock.releaseLock();
  }
}
/** Maliyet_Detay B1 değişince çalışır (kurulum() bu tetikleyiciyi kurar). */
function detayTetik(e) {
  try {
    var r = e && e.range;
    if (!r) return;
    if (r.getSheet().getName() !== CFG.DETAY_SEKME || r.getRow() !== 1 || r.getColumn() !== 2) return;
    var ad = (r.getValue() || "").toString().trim();
    if (ad) maliyetDetay(ad);
  } catch (err) {
    Logger.log("detayTetik hata: " + err);
  }
}
/** Editörden elle deneme için. */
function testSucukluPizza() { maliyetDetay("Sucuklu Pizza"); }
/** Tek ürün detayı → Maliyet_Detay (satır 4'ten itibaren). */
function maliyetDetay(urunAdi) {
  var ss = stokDosyasi();
  var sh = detaySekmesi(ss, false);
  if (!urunAdi) urunAdi = (sh.getRange("B1").getValue() || "").toString().trim();
  if (!urunAdi) {
    sh.getRange("C1").setValue("❌ B1'den ürün seçin");
    return;
  }
  sh.getRange("C1").setValue("⏳ Hesaplanıyor…");
  SpreadsheetApp.flush();
  var ctx = baglamOlustur(ss);
  if (!ctx.receteler.sira.length) {
    throw new Error("Tbl_Receteler bulunamadı veya okunabilir ürün reçetesi yok. Mevcut maliyet tablosu korunuyor.");
  }
  var bulunan = bul(nrm(urunAdi), ctx.receteler);
  sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), sh.getMaxColumns()).clear();
  if (!bulunan) { sh.getRange("C1").setValue("❌ Reçete bulunamadı: " + urunAdi); return; }
  var rec = bulunan.bilgi;
  var kat = urunKatalogu()[rec.key] || {};
  var u = urunHesapla(rec, ctx);
  var a = ambalajHesapla(rec.ad, kat.kategori || "", ctx);
  var rows = [], kalin = [];
  u.kalemler.forEach(function (k) {
    if (k.tur === "YM" && k.parti) {
      var p = k.parti, ym = k.bilgi, yc = k.ymMiktar;
      rows.push([k.ad, "YM", ym.ad, "", k.miktar, k.birim, yc && yc.ok ? yuvarla(yc.m, 3) : "",
                 "takip: " + (ym.takip || "?"), "1 parti = " + yuvarla(p.bolen, 2) + " " + (ym.takip || "?"), "",
                 yuvarla(p.birimMaliyet, 4), "", yuvarla(k.maliyet),
                 k.notlar.concat(p.genel).concat(["parti reçetesi aşağıda"]).join(" | ")]);
      var pay = (yc && yc.ok && p.bolen > 0) ? yc.m / p.bolen : 0;
      p.kalemler.forEach(function (pk) { rows.push(kalemSatiri("    ↳ ", pk, pay)); });
    } else {
      rows.push(kalemSatiri("", k, 1));
    }
  });
  kalin.push(rows.length); rows.push(ozetSatir("REÇETE TOPLAMI", yuvarla(u.toplam), ""));
  rows.push(ozetSatir("", "", ""));
  kalin.push(rows.length); rows.push(ozetSatir("AMBALAJ (kategori: " + (kat.kategori || "?") + ")", "", a.genel.join(" | ")));
  a.kalemler.forEach(function (k) {
    var h = k.bilgi;
    rows.push(["    ↳ " + k.malzeme, "AMB", h ? h.tamAd : "", h ? h.tedarikci : "", k.miktar, "adet",
               h ? k.miktar : "", h ? (h.olcu || "adet") : "", h ? (h.hamIcerik || "") : "", h ? (h.fiyatPaket || "") : "",
               h && h.fiyatBirim > 0 ? yuvarla(h.fiyatBirim, 4) : "", "", yuvarla(k.maliyet),
               [k.kaynak].concat(k.notlar).join(" | ")]);
  });
  kalin.push(rows.length); rows.push(ozetSatir("AMBALAJ TOPLAMI", yuvarla(a.toplam), ""));
  rows.push(ozetSatir("", "", ""));
  var genel = u.toplam + a.toplam;
  kalin.push(rows.length);
  rows.push(ozetSatir("GENEL TOPLAM", yuvarla(genel),
            kat.satisFiyati > 0 ? "Satış " + kat.satisFiyati + " TL → maliyet %" + Math.round(genel / kat.satisFiyati * 100) : ""));
  sh.getRange(2, 1).setValue(rec.ad + " — maliyet detayı").setFontWeight("bold").setFontSize(12);
  sh.getRange(3, 1, 1, DETAY_BASLIK.length).setValues([DETAY_BASLIK]).setFontWeight("bold")
    .setBackground("#2c3e50").setFontColor("white");
  sh.getRange(4, 1, rows.length, DETAY_BASLIK.length).setValues(rows);
  kalin.forEach(function (i) { sh.getRange(4 + i, 1, 1, DETAY_BASLIK.length).setFontWeight("bold").setBackground("#ecf0f1"); });
  // Maliyete girmeyen / şüpheli kalemleri renklendir
  rows.forEach(function (r, i) {
    var n = (r[13] || "").toString();
    if (n.indexOf("BULUNAMADI") !== -1 || n.indexOf("TANIMI YOK") !== -1 || n.indexOf("fiyat yok") !== -1) {
      sh.getRange(4 + i, 1, 1, DETAY_BASLIK.length).setBackground("#fdecea");
    } else if (n.indexOf("~ benzer") !== -1) {
      sh.getRange(4 + i, 1, 1, DETAY_BASLIK.length).setBackground("#fff7e0");
    }
  });
  sh.setFrozenRows(3);
  sh.getRange("C1").setValue("✅ " + Utilities.formatDate(new Date(), "Europe/Istanbul", "dd.MM HH:mm") +
                             " — " + yuvarla(genel) + " TL");
}
// ============================================================
// 2. HESAP ÇEKİRDEĞİ
// ============================================================
function baglamOlustur(ss) {
  return {
    hm: hmHaritasi(ss),
    ym: ymHaritasi(ss),
    receteler: receteHaritasi(ss),
    kurallar: ambalajKurallari(ss),
    parti: {}
  };
}
/** Ürün reçetesi → { toplam, kalemler, uyarilar } */
function urunHesapla(rec, ctx) {
  var s = { toplam: 0, kalemler: [], uyarilar: [] };
  rec.malzemeler.forEach(function (m) {
    var k = kalemHesapla(m.ad, m.tip, m.miktar, m.birim, ctx, null, []);
    s.toplam += k.maliyet;
    s.kalemler.push(k);
    k.notlar.forEach(function (n) { s.uyarilar.push(m.ad + ": " + n); });
    k.altUyarilar.forEach(function (n) { s.uyarilar.push(n); });
    var b = birim(m.birim);
    if ((b === "gr" || b === "ml") && m.miktar > 2000) s.uyarilar.push(m.ad + ": " + m.miktar + " " + m.birim + " porsiyon için çok fazla, reçeteyi kontrol et");
    if (b === "adet" && m.miktar > 20) s.uyarilar.push(m.ad + ": " + m.miktar + " adet porsiyon için çok fazla, reçeteyi kontrol et");
  });
  return s;
}
/** Tek malzeme satırı (ürün reçetesinde veya YM partisinde). */
function kalemHesapla(ad, tip, miktar, birimAd, ctx, haricYm, ziyaret) {
  var k = { ad: ad, miktar: miktar, birim: birimAd, tur: "?", bilgi: null, cv: null, maliyet: 0,
            notlar: [], bilgiNot: "", altUyarilar: [], parti: null, ymMiktar: null };
  var mc = malzemeCoz(ad, tip, ctx, haricYm);
  if (mc.not) k.notlar.push(mc.not);
  if (mc.tur === "SIFIR") { k.tur = "—"; k.bilgiNot = "sıfır maliyet (su vb.)"; return k; }
  if (mc.tur === "YOK") return k;
  k.bilgi = mc.bilgi;
  if (mc.tur === "HM") {
    var h = mc.bilgi;
    k.tur = h.tip;
    if (!(h.fiyatBirim > 0)) { k.notlar.push("fiyat yok (" + h.tamAd + ": J paket fiyatı boş)"); return k; }
    var cv = cevir(miktar, birimAd, h.olcu, h.paketIcerik);
    k.cv = cv;
    if (cv.not) k.notlar.push(cv.not);
    if (cv.ok) k.maliyet = cv.m * h.fiyatBirim;
    return k;
  }
  // Yarı mamul
  k.tur = "YM";
  var p = ymParti(mc.bilgi, ctx, ziyaret || []);
  k.parti = p;
  k.altUyarilar = p.uyarilar.slice();
  var yc = ymTakipMiktar(miktar, birimAd, mc.bilgi);
  k.ymMiktar = yc;
  if (!yc.ok) { k.notlar.push(yc.uyari + ", maliyete eklenmedi"); return k; }
  k.maliyet = yc.m * p.birimMaliyet;
  return k;
}
/** YM'nin 1 partisi → { toplam, bolen, birimMaliyet, kalemler, uyarilar, genel }. Önbellekli. */
function ymParti(ym, ctx, ziyaret) {
  var key = nrm(ym.ad);
  if (ctx.parti[key]) return ctx.parti[key];
  var p = { toplam: 0, bolen: ymBolen(ym), birimMaliyet: 0, kalemler: [], uyarilar: [], genel: [] };
  function genelUyari(msg) { p.genel.push(msg); p.uyarilar.push(ym.ad + ": " + msg); }
  if (ziyaret.indexOf(key) !== -1) { genelUyari("döngüsel YM reçetesi"); return p; }
  if (!ym.recete.length) { genelUyari("Tbl_YariMamulRecete'de içerik yok"); ctx.parti[key] = p; return p; }
  if (!(p.bolen > 0)) {
    genelUyari((ym.takip === "adet" ? "Porsiyon_adet" : "Baz_Miktar") + " boş (Tbl_YariMamul), maliyet 0");
    ctx.parti[key] = p; return p;
  }
  ziyaret.push(key);
  ym.recete.forEach(function (r) {
    var k = kalemHesapla(r.ad, null, r.miktar, r.birim, ctx, ym, ziyaret);
    p.toplam += k.maliyet;
    p.kalemler.push(k);
    k.notlar.forEach(function (n) { p.uyarilar.push(ym.ad + " › " + r.ad + ": " + n); });
    k.altUyarilar.forEach(function (n) { p.uyarilar.push(n); });
  });
  ziyaret.pop();
  p.birimMaliyet = p.toplam / p.bolen;
  ctx.parti[key] = p;
  return p;
}
/**
 * Malzeme adını çözer. Sıra: birebir (etikete göre HM/YM önce) → benzer isim → bulunamadı.
 * → { tur: "HM"|"YM"|"SIFIR"|"YOK", bilgi, not }
 */
function malzemeCoz(ad, tip, ctx, haricYm) {
  var key = nrm(ad);
  if (sifirMi(key)) return { tur: "SIFIR" };
  var hmE = ctx.hm.harita[key];
  var ymE = ctx.ym.harita[key];
  if (ymE && ymE === haricYm) ymE = null;
  if (tip === "YM") {
    if (ymE) return { tur: "YM", bilgi: ymE };
    if (hmE) return { tur: "HM", bilgi: hmE, not: "YM etiketli ama hammadde bulundu" };
  } else {
    if (hmE) return { tur: "HM", bilgi: hmE };
    if (ymE) return { tur: "YM", bilgi: ymE, not: tip === "Ü" ? "Ü etiketli ama yarı mamul bulundu" : "" };
  }
  var sira = tip === "YM" ? ["ym", "hm"] : ["hm", "ym"];
  for (var i = 0; i < sira.length; i++) {
    var r = bul(key, ctx[sira[i]]);
    if (r && r.bilgi !== haricYm) {
      return { tur: sira[i].toUpperCase(), bilgi: r.bilgi,
               not: "~ benzer isimle eşleşti → " + (r.bilgi.tamAd || r.bilgi.ad) + " (kontrol et)" };
    }
  }
  return { tur: "YOK", not: yokNotu(ad, ctx) };
}
/** Bulunamayan malzemenin notu: aktif olmadığı / eksik olduğu için elenmişse onu da yazar. */
function yokNotu(ad, ctx) {
  var elenen = ctx.hm.elenen;
  var key = nrm(ad);
  var liste = elenen[key];
  if (!liste) {
    var enIyi = null, skor = 0;
    Object.keys(elenen).forEach(function (k) {
      var s = benzerlik(key, k);
      if (s > skor) { skor = s; enIyi = k; }
    });
    if (enIyi && skor >= CFG.BENZERLIK_ESIK) liste = elenen[enIyi];
  }
  if (!liste || !liste.length) return NOT_TANIMSIZ;
  return NOT_BULUNAMADI + " — kullanılmayan: " + tekil(liste).join("; ");
}
/** Ambalaj_Kurallari → { toplam, kalemler, uyarilar, genel } */
function ambalajHesapla(urunAd, kategori, ctx) {
  var s = { toplam: 0, kalemler: [], uyarilar: [], genel: [] };
  // Ekstra ürünler için kategori veya ürün ambalaj kuralı sorgulanmaz.
  if (/^ekstra(?:\s|$)/i.test((urunAd || "").toString().trim())) {
    s.genel.push("Ekstra ürün: ambalaj uygulanmaz");
    return s;
  }
  var liste = [];
  var uk = ctx.kurallar.urun[nrm(urunAd)];
  if (uk) {
    uk.forEach(function (x) { liste.push({ malzeme: x.malzeme, miktar: x.miktar, kaynak: "Ürün: " + urunAd }); });
  } else if (kategori) {
    (ctx.kurallar.kategori[nrm(kategori)] || []).forEach(function (x) {
      liste.push({ malzeme: x.malzeme, miktar: x.miktar, kaynak: "Kategori: " + kategori });
    });
  } else {
    var msg = "ürünün kategorisi bulunamadı (Menü B sütunu), ambalaj eklenmedi";
    s.genel.push(msg); s.uyarilar.push("Ambalaj: " + msg);
  }
  liste.forEach(function (x) {
    var key = nrm(x.malzeme);
    var bilgi = ctx.hm.harita[key];
    var notlar = [];
    if (!bilgi) {
      var r = bul(key, ctx.hm);
      if (r) { bilgi = r.bilgi; notlar.push("~ benzer isimle eşleşti → " + bilgi.tamAd + " (kontrol et)"); }
    }
    var k = { malzeme: x.malzeme, miktar: x.miktar, kaynak: x.kaynak, bilgi: bilgi || null, maliyet: 0, notlar: notlar };
    if (!bilgi) {
      k.notlar.push(yokNotu(x.malzeme, ctx));
    } else if (!(bilgi.fiyatBirim > 0)) {
      k.notlar.push("fiyat yok (" + bilgi.tamAd + ": J paket fiyatı boş)");
    } else {
      k.maliyet = x.miktar * bilgi.fiyatBirim;
      if (bilgi.fiyatBirim > 150) k.notlar.push("adet fiyatı " + Math.round(bilgi.fiyatBirim) + " TL, H (paket içeriği) eksik olabilir");
    }
    k.notlar.forEach(function (n) { s.uyarilar.push("Ambalaj " + x.malzeme + ": " + n); });
    s.toplam += k.maliyet;
    s.kalemler.push(k);
  });
  return s;
}
// ============================================================
// 3. BİRİM DÖNÜŞÜMLERİ
// ============================================================
function birim(b) {
  var s = sade(b);
  if (!s) return "";
  if (s === "gr" || s === "gram" || s === "g" || s === "grm") return "gr";
  if (s === "kg" || s === "kilo" || s === "kilogram") return "kg";
  if (s === "lt" || s === "litre" || s === "l" || s === "ltr") return "lt";
  if (s === "ml" || s === "cc" || s === "mililitre") return "ml";
  if (s === "adet" || s === "ad" || s === "porsiyon" || s === "dilim" || s === "demet" || s === "pcs") return "adet";
  if (s === "paket" || s === "pk" || s === "pkt") return "paket";
  if (s === "koli") return "koli";
  if (s.indexOf("yemekka") === 0) return "yk";
  if (s.indexOf("tatlika") === 0 || s.indexOf("cayka") === 0) return "tk";
  return s;
}
function ymBirim(b) {
  var s = birim(b);
  if (s === "adet" || s === "paket") return "adet";
  if (s === "gr" || s === "kg" || s === "ml" || s === "lt") return "gr";
  return "";
}
/** Reçete miktarını hammaddenin stok birimine çevirir → { m, ok, not } */
function cevir(miktar, kaynakBirim, hedefBirim, paketIcerik) {
  var m = Number(miktar) || 0;
  var kb = birim(kaynakBirim), hb = birim(hedefBirim);
  var icerik = paketIcerik > 0 ? paketIcerik : 1;
  var OLCU = { gr: 1, ml: 1, kg: 1000, lt: 1000 };
  if (kb === "yk") { kb = "gr"; m *= 15; }
  if (kb === "tk") { kb = "gr"; m *= 5; }
  if (!hb) return { m: m, ok: true };                              // yalnızca ambalajda olabilir
  if (kb === "paket") return { m: m * icerik, ok: true };
  if (kb === "koli")  return { m: m * icerik, ok: true, not: "koli=paket sayıldı" };
  if (kb === hb) return { m: m, ok: true };
  if (OLCU[kb] && OLCU[hb]) return { m: m * OLCU[kb] / OLCU[hb], ok: true };
  if (kb === "adet" && OLCU[hb]) return { m: m * icerik, ok: true, not: "1 adet = 1 paket (" + icerik + " " + hb + ") sayıldı" };
  if (OLCU[kb] && hb === "adet") return { m: 0, ok: false, not: kb + "→adet çevrilemez, maliyete eklenmedi (Tbl_Hammaddeler I sütununu kontrol et)" };
  return { m: 0, ok: false, not: (kaynakBirim || "birim boş") + " → " + (hedefBirim || "?") + " çevrilemez, maliyete eklenmedi" };
}
/** 1 partinin maliyeti kaça bölünür: takip adet → Porsiyon_adet, gr → Baz_Miktar */
function ymBolen(ym) {
  if (ym.takip === "adet") {
    if (ym.porsAdet > 0) return ym.porsAdet;
    if (ym.baz > 0 && ym.porsGram > 0) return ym.baz / ym.porsGram;
    return 0;
  }
  if (ym.baz > 0) return ym.baz;
  if (ym.porsAdet > 0 && ym.porsGram > 0) return ym.porsAdet * ym.porsGram;
  return 0;
}
/** Reçetedeki YM miktarını takip birimine (adet/gr) çevirir → { m, ok, uyari } */
function ymTakipMiktar(miktar, birimAd, ym) {
  var m = Number(miktar) || 0;
  var b = birim(birimAd);
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
  return { m: 0, ok: false, uyari: ym.ad + ": birim '" + birimAd + "' çevrilemez" };
}
function kgFiyat(h) {
  if (!(h.fiyatBirim > 0)) return null;
  if (h.olcu === "gr" || h.olcu === "ml") return h.fiyatBirim * 1000;
  if (h.olcu === "kg" || h.olcu === "lt") return h.fiyatBirim;
  return null;
}
// ============================================================
// 4. TABLO OKUMA
// ============================================================
/**
 * Tbl_Hammaddeler + ambalaj sekmeleri.
 * Tbl_Hammaddeler: B tam ad | C kısa ad | D tedarikçi | E Tedarikçi Sipariş Aktif | F paket durumu
 *                  H paket içeriği | I ölçü birimi | J paket fiyatı | O stok takip | P koli içeriği
 * → { harita, anahtarlar, elenen: {key: ["ad (neden)"]}, sayac }
 */
function hmHaritasi(ss) {
  var sonuc = { harita: {}, anahtarlar: [], elenen: {}, sayac: { aktif: 0, elenen: 0 } };
  function oku(r, tip) {
    var tam = (r[1] || "").toString().trim();
    if (!tam) return null;
    var icerik = sayi(r[7]);
    var b = {
      tamAd: tam,
      kisaAd: (r[2] || "").toString().trim(),
      tedarikci: (r[3] || "").toString().trim(),
      sipAktif: bool_(r[4]) === true,
      paketDurumu: (r[5] || "").toString().trim(),
      hamIcerik: icerik,
      paketIcerik: icerik > 0 ? icerik : 1,
      olcu: birim(r[8]),
      fiyatPaket: sayi(r[9]),
      stokTakip: bool_(r[14]),
      tip: tip
    };
    b.fiyatBirim = b.fiyatPaket > 0 ? b.fiyatPaket / b.paketIcerik : 0;
    return b;
  }
  function puan(x) { return (x.fiyatPaket > 0 ? 4 : 0) + (x.stokTakip !== false ? 1 : 0); }
  function koy(key, b) {
    if (!key) return;
    var eski = sonuc.harita[key];
    if (!eski) { sonuc.harita[key] = b; sonuc.anahtarlar.push(key); return; }
    if (puan(b) > puan(eski)) sonuc.harita[key] = b;
  }
  function ele(b, neden) {
    sonuc.sayac.elenen++;
    [b.kisaAd, b.tamAd].forEach(function (n) {
      var key = nrm(n);
      if (!key) return;
      if (!sonuc.elenen[key]) sonuc.elenen[key] = [];
      sonuc.elenen[key].push(b.tamAd + " [" + (b.tip === "AMB" ? "ambalaj" : "hammadde") + "] (" + neden + ")");
    });
  }
  var sh = ss.getSheetByName(CFG.HM_SEKME);
  if (sh) {
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var b = oku(data[i], "HM");
      if (!b) continue;
      var neden = !b.sipAktif ? "Tedarikçi Sipariş Aktif işaretli değil"
                : !b.olcu ? "Ölçü_Birimi (I) boş"
                : !(b.hamIcerik > 0) ? "Birim / paket içeriği (H) boş"
                : "";
      if (neden) { ele(b, neden); continue; }
      sonuc.sayac.aktif++;
      koy(nrm(b.kisaAd), b);
      koy(nrm(b.tamAd), b);
    }
  }
  ss.getSheets().forEach(function (s2) {
    var ad = s2.getName();
    if (ad === CFG.HM_SEKME || ad === CFG.DS_SEKME || s2.getLastRow() < 2 || s2.getLastColumn() < 2) return;
    var bas = s2.getRange(1, 1, 1, 2).getValues()[0];
    if (sade(bas[0]) !== "hammaddeid" || sade(bas[1]).indexOf("hammaddead") !== 0) return;
    var v = s2.getDataRange().getValues();
    for (var r = 1; r < v.length; r++) {
      var b2 = oku(v[r], "AMB");
      if (!b2) continue;
      if (!b2.sipAktif) { ele(b2, "Tedarikçi Sipariş Aktif işaretli değil"); continue; }
      if (b2.kisaAd && !sonuc.harita[nrm(b2.kisaAd)]) koy(nrm(b2.kisaAd), b2);
      if (!sonuc.harita[nrm(b2.tamAd)]) koy(nrm(b2.tamAd), b2);
    }
  });
  return sonuc;
}
/** Tbl_YariMamul (A ad | B Cikti_Tipi | C Baz_Miktar | D Porsiyon_adet | E Porsiyon_gram | F Takip_tipi) + Tbl_YariMamulRecete */
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
  var sh = sekmeBul(ss, CFG.YM_SEKME, ["yarimamuladi", "ciktitipi"]);
  if (sh) {
    var d = sh.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) {
      var ad = (d[i][0] || "").toString().trim();
      if (!ad) continue;
      var y = al(ad);
      y.cikti = ymBirim(d[i][1]);
      y.baz = sayi(d[i][2]);
      y.porsAdet = sayi(d[i][3]);
      y.porsGram = sayi(d[i][4]);
      y.takip = ymBirim(d[i][5]);
    }
  }
  var sr = sekmeBul(ss, CFG.YM_RECETE_SEKME, ["yarimamuladi", "hammadde"]);
  if (sr) {
    var v = sr.getDataRange().getValues();
    for (var r = 1; r < v.length; r++) {
      var ymAd = (v[r][0] || "").toString().trim();
      var hmAd = (v[r][1] || "").toString().trim();
      if (!ymAd || !hmAd) continue;
      var hedef = sonuc.harita[nrm(ymAd)];
      if (!hedef) {
        var b = bul(nrm(ymAd), sonuc);
        hedef = b ? b.bilgi : al(ymAd);
      }
      hedef.recete.push({ ad: hmAd, miktar: sayi(v[r][2]), birim: (v[r][3] || "").toString().trim() });
    }
  }
  sonuc.anahtarlar.forEach(function (k) {
    var y = sonuc.harita[k];
    if (!y.cikti && (y.baz > 0 || y.porsGram > 0)) y.cikti = "gr";
    if (y.cikti && !(y.baz > 0) && !(y.porsGram > 0) && !(y.porsAdet > 0)) y.cikti = "";
    if (!y.takip) y.takip = y.cikti;
    if (y.cikti === "gr" && y.baz > 0) {
      if (!(y.porsGram > 0) && y.porsAdet > 0) y.porsGram = y.baz / y.porsAdet;
      if (!(y.porsAdet > 0) && y.porsGram > 0) y.porsAdet = y.baz / y.porsGram;
    }
    if (y.cikti === "adet" && !(y.porsAdet > 0) && y.baz > 0) y.porsAdet = y.baz;
  });
  return sonuc;
}
/** Tbl_Receteler: A ürün | C hammadde/YM | D miktar | E birim | F Ü/YM | H aktif */
function receteHaritasi(ss) {
  var sonuc = { harita: {}, anahtarlar: [], sira: [] };
  var sh = sekmeBul(ss, CFG.RECETE_SEKME, ["urunadi", "hammaddekategori", "hammadde"]);
  if (!sh) return sonuc;
  var d = sh.getDataRange().getValues();
  var aktifler = {};
  for (var a = 1; a < d.length; a++) {
    var ad0 = (d[a][0] || "").toString().trim();
    if (ad0 && isaretliMi(d[a][7])) aktifler[nrm(ad0)] = true;
  }
  for (var i = 1; i < d.length; i++) {
    var ust = (d[i][0] || "").toString().trim();
    var ad = (d[i][2] || "").toString().trim();
    if (!ust || !ad) continue;
    var key = nrm(ust);
    if (!sonuc.harita[key]) {
      sonuc.harita[key] = { key: key, ad: ust, aktif: aktifler[key] === true, malzemeler: [] };
      sonuc.anahtarlar.push(key);
      sonuc.sira.push(ust);
    }
    sonuc.harita[key].malzemeler.push({
      ad: ad,
      miktar: sayi(d[i][3]),
      birim: (d[i][4] || "").toString().trim(),
      tip: sade(d[i][5]) === "ym" ? "YM" : "Ü"
    });
  }
  return sonuc;
}
function isaretliMi(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  var s = v.toString().trim().toLocaleLowerCase("tr-TR");
  return ["✓", "✔", "x", "✅", "true", "doğru", "dogru", "evet", "1", "aktif", "var"].indexOf(s) !== -1;
}
/** Ambalaj_Kurallari: A Kosul_Tipi | B Eslesme | C Sarf_Malzeme | D Miktar */
function ambalajKurallari(ss) {
  var sonuc = { urun: {}, kategori: {} };
  var sh = ss.getSheetByName(CFG.KURAL_SEKME);
  if (!sh) return sonuc;
  var d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    var kosul = sade(d[i][0]);
    var esles = (d[i][1] || "").toString().trim();
    var malzeme = (d[i][2] || "").toString().trim();
    if (!esles || !malzeme) continue;
    var hedef = kosul === "urun" ? sonuc.urun : sonuc.kategori;
    var key = nrm(esles);
    if (!hedef[key]) hedef[key] = [];
    hedef[key].push({ malzeme: malzeme, miktar: sayi(d[i][3]) || 1 });
  }
  return sonuc;
}
function menuSekmesi() {
  var gss = SpreadsheetApp.openById(CFG.GENEL_BILGILER_ID);
  var sh = gss.getSheetByName(CFG.MENU_SEKME);
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
/** Menü: A ad | B kategori | C fiyat | F aktif | H tip → nrm(ad) → {...} */
function urunKatalogu() {
  var sonuc = {};
  try {
    var sh = menuSekmesi();
    if (!sh) return sonuc;
    var d = sh.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) {
      var ad = (d[i][0] || "").toString().trim();
      if (!ad) continue;
      sonuc[nrm(ad)] = { ad: ad, kategori: (d[i][1] || "").toString().trim(), satisFiyati: sayi(d[i][2]),
                         tip: (d[i][7] || "").toString().trim(), satir: i + 1 };
    }
  } catch (e) { Logger.log("Menü okunamadı: " + e); }
  return sonuc;
}
/** Menü I sütunu: Tam | Eksik: n malzeme | Reçete yok | Yarı mamul | Direkt satış */
function receteDurumuYaz(ctx, katalog, uyariMap) {
  try {
    var sh = menuSekmesi();
    if (!sh) return;
    var son = sh.getLastRow();
    if (son < 2) return;
    if (sade(sh.getRange(1, 9).getValue()) !== "recetedurumu") sh.getRange(1, 9).setValue("Reçete_Durumu").setFontWeight("bold");
    var kol = [];
    for (var r = 2; r <= son; r++) kol.push([""]);
    Object.keys(katalog).forEach(function (key) {
      var k = katalog[key], tip = sade(k.tip), durum;
      if (tip.indexOf("yar") === 0) durum = "Yarı mamul";
      else if (tip.indexOf("dire") === 0) durum = "Direkt satış";
      else {
        var b = bul(key, ctx.receteler);
        if (!b) durum = "Reçete yok";
        else {
          var u = uyariMap[b.bilgi.key] || [];
          var n = u.filter(function (x) {
            return x.indexOf("BULUNAMADI") !== -1 || x.indexOf("TANIMI YOK") !== -1 || x.indexOf("fiyat yok") !== -1;
          }).length;
          durum = (n ? "Eksik: " + n + " malzeme" : "Tam") + (b.fuzzy ? " (~" + b.bilgi.ad + ")" : "");
        }
      }
      if (k.satir >= 2 && k.satir <= son) kol[k.satir - 2][0] = durum;
    });
    sh.getRange(2, 9, kol.length, 1).setValues(kol);
  } catch (e) { Logger.log("Reçete durumu yazılamadı: " + e); }
}
// ============================================================
// 5. MALİYET_DETAY SEKMESİ
// ============================================================
function detaySekmesi(ss, sifirla) {
  var sh = ss.getSheetByName(CFG.DETAY_SEKME) || ss.insertSheet(CFG.DETAY_SEKME);
  if (sh.getMaxColumns() < DETAY_BASLIK.length) sh.insertColumnsAfter(sh.getMaxColumns(), DETAY_BASLIK.length - sh.getMaxColumns());
  if (sifirla || sh.getRange("A1").getValue() !== "Ürün seç ▸") {
    sh.clear();
    sh.getRange("A1").setValue("Ürün seç ▸").setFontWeight("bold");
    sh.getRange("B1").setBackground("#fff7e0").setFontWeight("bold");
    sh.getRange("C1").setValue("B1'den ürün seç, detay otomatik hesaplanır").setFontColor("#7f8c8d");
    detayListesiGuncelle(ss, baglamOlustur(ss));
  }
  return sh;
}
function detayListesiGuncelle(ss, ctx) {
  var sh = ss.getSheetByName(CFG.DETAY_SEKME);
  if (!sh) return;
  var liste = ctx.receteler.sira.filter(function (ad) {
    return ctx.receteler.harita[nrm(ad)].aktif;
  }).sort(function (a, b) { return a.localeCompare(b, "tr"); });
  if (!liste.length) return;
  if (liste.length > 500) { Logger.log("Açılır liste 500 ile sınırlı, " + liste.length + " ürün var."); liste = liste.slice(0, 500); }
  var kural = SpreadsheetApp.newDataValidation().requireValueInList(liste, true).setAllowInvalid(false).build();
  sh.getRange("B1").setDataValidation(kural);
}
function kalemSatiri(girinti, k, carpan) {
  var h = k.bilgi;
  var notlar = k.notlar.concat(k.bilgiNot ? [k.bilgiNot] : []).join(" | ");
  if (k.tur === "YM" && h) {
    return [girinti + k.ad, "YM", h.ad, "", k.miktar, k.birim, k.ymMiktar && k.ymMiktar.ok ? yuvarla(k.ymMiktar.m, 3) : "",
            "takip: " + (h.takip || "?"), "", "", k.parti ? yuvarla(k.parti.birimMaliyet, 4) : "", "",
            yuvarla(k.maliyet * carpan), notlar];
  }
  if (!h) return [girinti + k.ad, k.tur, "", "", k.miktar, k.birim, "", "", "", "", "", "", 0, notlar];
  var kg = kgFiyat(h);
  return [girinti + k.ad, h.tip, h.tamAd, h.tedarikci, k.miktar, k.birim,
          k.cv && k.cv.ok ? yuvarla(k.cv.m, 4) : "", h.olcu || "", h.hamIcerik || "", h.fiyatPaket || "",
          h.fiyatBirim > 0 ? yuvarla(h.fiyatBirim, 4) : "", kg === null ? "" : Math.round(kg),
          yuvarla(k.maliyet * carpan), notlar];
}
function ozetSatir(etiket, maliyet, not) {
  return [etiket, "", "", "", "", "", "", "", "", "", "", "", maliyet, not];
}
// ============================================================
// 6. YARDIMCILAR
// ============================================================
function stokDosyasi() { return SpreadsheetApp.openById(CFG.STOK_DOSYA_ID); }
function sekmeBul(ss, ad, basliklar) {
  var sh = ss.getSheetByName(ad);
  if (sh) return sh;
  var hedef = sade(ad), bulunan = null;
  ss.getSheets().some(function (s) { if (sade(s.getName()) === hedef) { bulunan = s; return true; } return false; });
  if (bulunan || !basliklar) return bulunan;
  ss.getSheets().some(function (s) {
    if (s.getLastRow() < 1 || s.getLastColumn() < basliklar.length) return false;
    var h = s.getRange(1, 1, 1, Math.min(s.getLastColumn(), 10)).getValues()[0].map(sade);
    var ok = basliklar.every(function (b) { return h.some(function (x) { return x.indexOf(b) === 0; }); });
    if (ok) { bulunan = s; return true; }
    return false;
  });
  return bulunan;
}
/** harita içinde birebir, yoksa benzerlikle en yakın → { bilgi, fuzzy } | null */
function bul(key, h) {
  if (!key) return null;
  if (h.harita[key]) return { bilgi: h.harita[key], fuzzy: false };
  if (!h._cache) h._cache = {};
  if (key in h._cache) return h._cache[key];
  var enIyi = null, skor = 0;
  for (var i = 0; i < h.anahtarlar.length; i++) {
    var s = benzerlik(key, h.anahtarlar[i]);
    if (s > skor) { skor = s; enIyi = h.anahtarlar[i]; }
  }
  var r = (enIyi && skor >= CFG.BENZERLIK_ESIK) ? { bilgi: h.harita[enIyi], fuzzy: true, skor: skor } : null;
  h._cache[key] = r;
  return r;
}
function sifirMi(key) {
  return CFG.SIFIR_MALIYET.some(function (s) { return nrm(s) === key; });
}
function benzerlik(a, b) {
  if (a === b) return 1;
  if (!a || !b || a.length < 2 || b.length < 2) return 0;
  var say = {}, n = 0;
  for (var i = 0; i < a.length - 1; i++) { var g = a.substr(i, 2); say[g] = (say[g] || 0) + 1; }
  for (var j = 0; j < b.length - 1; j++) { var h = b.substr(j, 2); if (say[h] > 0) { say[h]--; n++; } }
  return (2 * n) / (a.length - 1 + b.length - 1);
}
/** Türkçe harfleri sadeleştirir, küçültür, boşluk/nokta/altçizgi/tire siler. */
function sade(s) {
  return (s || "").toString().replace(/[İIı]/g, "i").replace(/[Ğğ]/g, "g").replace(/[Üü]/g, "u")
    .replace(/[Şş]/g, "s").replace(/[Öö]/g, "o").replace(/[Çç]/g, "c").toLowerCase().replace(/[\s._\-]/g, "");
}
/** Eşleştirme anahtarı: sadece harf ve rakam. */
function nrm(s) { return sade(s).replace(/[^a-z0-9]/g, ""); }
function sayi(v) {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (v === null || v === undefined) return 0;
  var s = v.toString().trim();
  if (!s) return 0;
  if (s.indexOf(",") !== -1) s = s.replace(/\\./g, "").replace(",", ".");
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function bool_(v) {
  if (v === true) return true;
  if (v === false) return false;
  var s = sade(v);
  if (!s) return null;
  if (s === "true" || s === "dogru" || s === "evet" || s === "1") return true;
  if (s === "false" || s === "yanlis" || s === "hayir" || s === "0") return false;
  return null;
}
function yuvarla(n, hane) {
  var k = Math.pow(10, hane === undefined ? 2 : hane);
  return Math.round((Number(n) || 0) * k) / k;
}
function tekil(arr) { return arr.filter(function (x, i) { return arr.indexOf(x) === i; }); }
function kisalt(s) { return s.length > 45000 ? s.substr(0, 45000) + " …" : s; }
