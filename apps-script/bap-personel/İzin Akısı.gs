// ==========================================
// BAP OS – İZİN TALEP & ONAY AKIŞI
// ==========================================
// Akış:
//   1) Çalışan panelden talep girer  → İzinler sekmesine "Beklemede" düşer, sana WhatsApp gider
//   2) Yönetici panelinde Dashboard üstünde onay kutusu çıkar
//   3) Onaylayınca  → Vardiya çizelgesine o gün izin olarak yazılır + puantaj satırı açılır
//      Reddedince   → hiçbir yere dokunmaz, çalışana bilgi gider
//   4) Sen Vardiya'ya elle "Ücretsiz izin"/"Yıllık izin" yazarsan
//      gece çalışan planIzinleriIsaretle() aynı puantaj satırını açar (onay gerekmez)
//
// İzinler sekmesi sütunları:
//   A Talep No | B Kayıt Zamanı | C Personel | D Tip | E Başlangıç | F Bitiş
//   G Gün | H Açıklama | I Durum | J Karar Zamanı | K Kaynak
// ==========================================

// Talep tipi -> Vardiya çizelgesindeki karşılığı (Rapor'un vardiya karşılığı yok, sadece puantaja yazılır)
var IZIN_VARDIYA_TIPI = {
  "Yıllık İzin": "Yıllık izin",
  "Ücretsiz İzin": "Ücretsiz izin",
  "Rapor": null
};

function izinSayfasi(ss) {
  var sh = ss.getSheetByName("İzinler") || ss.getSheetByName("Izinler");
  if (!sh) {
    var hepsi = ss.getSheets();
    for (var i = 0; i < hepsi.length; i++) {
      var n = hepsi[i].getName().toLowerCase().replace(/i̇/g, "i").replace(/ı/g, "i");
      if (n === "izinler" || n === "izin talepleri") { sh = hepsi[i]; break; }
    }
  }
  if (!sh) sh = ss.insertSheet("İzinler");
  var ilk = (sh.getRange(1, 1).getValue() || "").toString().trim();
  if (ilk !== "Talep No") {
    sh.getRange(1, 1, 1, 11).setValues([["Talep No", "Kayıt Zamanı", "Personel", "Tip", "Başlangıç", "Bitiş", "Gün", "Açıklama", "Durum", "Karar Zamanı", "Kaynak"]]);
    sh.getRange(1, 1, 1, 11).setFontWeight("bold").setBackground("#f1f3f4");
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 110); sh.setColumnWidth(3, 150); sh.setColumnWidth(8, 260);
  }
  return sh;
}

// ---------- 1) ÇALIŞAN TALEBİ ----------
function izinTalebiKaydet(ss, ad, tip, basStr, bitStr, aciklama) {
  try {
    var bas = parseTarih(basStr), bit = parseTarih(bitStr);
    if (!bas || !bit || gunBasi(bit) < gunBasi(bas)) return null;
    if ((gunBasi(bit) - gunBasi(bas)) > 62 * 24 * 3600 * 1000) return null;
    var gunSayisi = Math.round((gunBasi(bit) - gunBasi(bas)) / 86400000) + 1;
    var sh = izinSayfasi(ss);
    var no = "T" + Date.now().toString(36).toUpperCase();
    var simdi = new Date();
    sh.appendRow([no, simdi, ad, tip, gunBasi(bas), gunBasi(bit), gunSayisi, (aciklama || "").toString(), "Beklemede", "", "Çalışan"]);
    var sn = sh.getLastRow();
    sh.getRange(sn, 1).setNumberFormat("@");
    sh.getRange(sn, 2).setNumberFormat("dd.MM.yyyy HH:mm");
    sh.getRange(sn, 5, 1, 2).setNumberFormat("dd.MM.yyyy");
    logEkle(ss, ad, "IZIN_TALEBI", tip + ": " + anahtarTarih(bas) + " - " + anahtarTarih(bit) + " (" + gunSayisi + " gün) [" + no + "]", "-");
    try {
      waOlayBildir(ss, ad, "-",
        "📝 İZİN TALEBİ: " + ad + " — " + tip + "\n" + anahtarTarih(bas) + " – " + anahtarTarih(bit) + " (" + gunSayisi + " gün)" +
        (aciklama ? "\nSebep: " + aciklama : "") + "\n\nOnay için yönetici panelini aç.", "", "izin_talebi");
    } catch (e) {}
    return { no: no, gun: gunSayisi };
  } catch (e) { return null; }
}

function bekleyenIzinler(ss) {
  var liste = [];
  try {
    var sh = izinSayfasi(ss);
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][8] || "").toString().trim() !== "Beklemede") continue;
      if (!data[i][0]) continue;
      liste.push({
        no: data[i][0].toString(), ad: (data[i][2] || "").toString(), tip: (data[i][3] || "").toString(),
        bas: parseTarih(data[i][4]), bit: parseTarih(data[i][5]), gun: data[i][6] || 0,
        aciklama: (data[i][7] || "").toString(), rowNo: i + 1
      });
    }
  } catch (e) {}
  return liste;
}

// ---------- 2) ONAY / RED ----------
function izinTalebiKarar(ss, talepNo, onayMi) {
  if (!talepNo) return false;
  var lock = kilitAl();
  try {
    var sh = izinSayfasi(ss);
    var data = sh.getDataRange().getValues();
    var satir = -1, t = null;
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || "").toString() !== talepNo) continue;
      if ((data[i][8] || "").toString().trim() !== "Beklemede") return false; // daha önce karara bağlanmış
      satir = i + 1; t = data[i]; break;
    }
    if (satir < 0) return false;

    var ad = (t[2] || "").toString().trim();
    var tip = (t[3] || "").toString().trim();
    var bas = parseTarih(t[4]), bit = parseTarih(t[5]);
    var simdi = new Date();

    sh.getRange(satir, 9).setValue(onayMi ? "Onaylandı" : "Reddedildi");
    sh.getRange(satir, 10).setValue(simdi);
    sh.getRange(satir, 10).setNumberFormat("dd.MM.yyyy HH:mm");

    var pers = personelBul(ss, ad);
    var tel = pers ? pers.telefon : "-";

    if (!onayMi) {
      logEkle(ss, "Yönetici", "IZIN_REDDEDILDI", ad + " " + tip + " " + anahtarTarih(bas) + "-" + anahtarTarih(bit) + " [" + talepNo + "]", "-");
      try { waOlayBildir(ss, ad, tel, null, "Merhaba " + ad + ", " + anahtarTarih(bas) + " – " + anahtarTarih(bit) + " tarihli " + tip + " talebin onaylanmadı. Detay için yöneticinle görüş.", "izin_red"); } catch (e) {}
      return true;
    }

    var vTip = IZIN_VARDIYA_TIPI[tip] || null;
    var sheet = anaSayfa(ss);
    var gcMevcut = puantajGunSeti_(sheet);
    var gun = gunBasi(bas), son = gunBasi(bit), yazilan = 0;
    while (gun <= son) {
      if (vTip) vardiyaGuneYaz_(ss, ad, gun, vTip);
      if (izinPuantajSatiriAc_(sheet, ad, gun, vTip || tip, gcMevcut)) yazilan++;
      gun = new Date(gun.getFullYear(), gun.getMonth(), gun.getDate() + 1);
    }
    try { var vs = ss.getSheetByName("Vardiya"); if (vs) _VARDIYA_CACHE = vs.getDataRange().getValues(); } catch (e2) {}
    logEkle(ss, "Yönetici", "IZIN_ONAYLANDI", ad + " " + tip + " " + anahtarTarih(bas) + "-" + anahtarTarih(bit) + ", " + yazilan + " gün işlendi [" + talepNo + "]", "-");
    try { waOlayBildir(ss, ad, tel, null, "Merhaba " + ad + ", " + anahtarTarih(bas) + " – " + anahtarTarih(bit) + " tarihli " + tip + " talebin onaylandı ve vardiya planına işlendi.", "izin_onay"); } catch (e3) {}
    return true;
  } finally { kilitBirak(lock); }
}

// Vardiya çizelgesinde ilgili günü izin tipiyle doldurur; hafta satırı yoksa açar.
function vardiyaGuneYaz_(ss, ad, gun, vTip) {
  var vSheet = ss.getSheetByName("Vardiya");
  if (!vSheet) return false;
  var hafta = haftaKey(haftaPazartesi(gun));
  var dayIdx = gun.getDay();                       // 0=Pazar
  var kolon = (dayIdx === 0) ? 12 : (dayIdx + 5);  // Pzt=6 ... Paz=12
  var data = vSheet.getDataRange().getValues();
  var satir = -1;
  for (var r = 1; r < data.length; r++) {
    if (haftaKey(data[r][0]) === hafta && (data[r][1] || "").toString().trim().toLowerCase() === ad.toLowerCase()) { satir = r + 1; break; }
  }
  if (satir < 0) {
    var p = personelBul(ss, ad);
    vSheet.appendRow([hafta, ad, p ? (p.sube || "") : "", 0, 0, "", "", "", "", "", "", ""]);
    satir = vSheet.getLastRow();
  }
  vSheet.getRange(satir, kolon).setValue(vTip);
  var gunler = vSheet.getRange(satir, 6, 1, 7).getValues()[0];
  var plan = 0, off = 0;
  for (var g = 0; g < 7; g++) {
    var d = (gunler[g] || "").toString();
    if (d === "Off") off++; else if (VARDIYALAR[d] && VARDIYALAR[d][2]) plan += VARDIYALAR[d][2];
  }
  vSheet.getRange(satir, 4).setValue(plan);
  vSheet.getRange(satir, 5).setValue(off);
  return true;
}

// Puantajda hangi kişi-gün kombinasyonları zaten var? ("ad|dd.MM.yyyy")
function puantajGunSeti_(sheet) {
  var set = {};
  try {
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (!(data[r][0] instanceof Date)) continue;
      set[(data[r][1] || "").toString().trim().toLowerCase() + "|" + anahtarTarih(data[r][0])] = true;
    }
  } catch (e) {}
  return set;
}

// Tek bir izin günü için puantaj satırı açar. tip: "Off" | "Yıllık izin" | "Ücretsiz izin" | "Rapor"
function izinPuantajSatiriAc_(sheet, ad, gun, tip, mevcutSet) {
  var key = ad.toLowerCase() + "|" + anahtarTarih(gun);
  if (mevcutSet[key]) return false;
  var t = (tip || "").toLowerCase();
  var satir;
  if (t.indexOf("off") > -1)
    satir = [gun, ad, "", "", "İzinli (Off Günü)", "", "", "", "", 1, "", "", "", "", "", "", "", "Otomatik Off"];
  else if (t.indexOf("yıllık") > -1 || t.indexOf("yillik") > -1)
    satir = [gun, ad, "", "", "Yıllık İzin", "Vardiya planından", "", 0, "", "", "", 1, "", "", "", "", "", "Otomatik Plan"];
  else if (t.indexOf("rapor") > -1)
    satir = [gun, ad, "", "", "Rapor", "İzin talebi onaylandı", "", 0, "", "", "", "", 1, "", "", "", "", "Otomatik Plan"];
  else
    satir = [gun, ad, "", "", "Ücretsiz İzin", "Vardiya planından", "", 0, "", "", "", "", "", 1, "", "", "", "Otomatik Plan"];
  var sn = usteEkle(sheet, satir);
  sheet.getRange(sn, 1).setNumberFormat("dd.MM.yyyy");
  mevcutSet[key] = true;
  return true;
}

// ---------- 3) DASHBOARD KUTUSU ----------
function bekleyenIzinlerHtml(ss, base, haftaStr, ayStr) {
  var liste = bekleyenIzinler(ss);
  if (!liste.length) return "";
  var satirlar = liste.map(function (t) {
    var link = base + "?panel=yonetici&sekme=dash&hafta=" + encodeURIComponent(haftaStr || "") + "&ay=" + encodeURIComponent(ayStr || "") + "&tno=" + encodeURIComponent(t.no) + "&islem=";
    return '<tr style="border-bottom:1px solid #fde68a;font-size:13px">' +
      '<td style="padding:10px;font-weight:700;color:#0f172a">' + htmlEsc(t.ad) + '</td>' +
      '<td style="padding:10px;color:#b45309;font-weight:600">' + htmlEsc(t.tip) + '</td>' +
      '<td style="padding:10px;color:#334155">' + (t.bas ? anahtarTarih(t.bas) : "") + ' – ' + (t.bit ? anahtarTarih(t.bit) : "") + '<div style="font-size:11px;color:#94a3b8">' + htmlEsc(String(t.gun)) + ' gün</div></td>' +
      '<td style="padding:10px;color:#64748b;font-size:12px">' + htmlEsc(t.aciklama || "-") + '</td>' +
      '<td style="padding:10px;white-space:nowrap">' +
      '<a href="' + link + 'izinOnay" target="_top" style="text-decoration:none;background:#16a34a;color:#fff;padding:7px 14px;border-radius:8px;font-weight:700;font-size:12px;margin-right:6px">✓ Onayla</a>' +
      '<a href="' + link + 'izinRed" target="_top" style="text-decoration:none;background:#f1f5f9;color:#b91c1c;padding:7px 14px;border-radius:8px;font-weight:700;font-size:12px">✕ Reddet</a>' +
      '</td></tr>';
  }).join("");
  return '<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:16px;margin-bottom:20px">' +
    '<h3 style="font-size:15px;color:#92400e;margin:0 0 12px">📝 Onay Bekleyen İzin Talepleri (' + liste.length + ')</h3>' +
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;text-align:left">' +
    '<thead><tr style="font-size:11px;color:#a16207;border-bottom:2px solid #fcd34d"><th style="padding:8px">Personel</th><th style="padding:8px">Tip</th><th style="padding:8px">Tarih</th><th style="padding:8px">Sebep</th><th style="padding:8px">İşlem</th></tr></thead>' +
    '<tbody>' + satirlar + '</tbody></table></div></div>';
}

// ---------- 4) GECE GÖREVİ: Vardiya planındaki izinleri puantaja yaz ----------
// Eski gunlukOffIsaretle'nin yerini alır; gece_kontrol bunu çağırır.
function gunlukOffIsaretle() { planIzinleriIsaretle(1); }

function planIzinleriIsaretle(gunSayisi) {
  gunSayisi = gunSayisi || 1;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = anaSayfa(ss);
  if (!sheet || !ss.getSheetByName("Vardiya")) return;
  onbellekleriDoldur(ss);
  var lock = kilitAl();
  try {
    var bugun = gunBasi(new Date());
    var pList = personelBilgi(ss);
    var mevcut = puantajGunSeti_(sheet);
    var eklenen = [];
    for (var g = gunSayisi - 1; g >= 0; g--) {
      var gun = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() - g);
      for (var i = 0; i < pList.length; i++) {
        var p = pList[i];
        if (p.iseGirisDate instanceof Date && gunBasi(p.iseGirisDate) > gun) continue;
        if (p.cikisTarihi instanceof Date && gunBasi(p.cikisTarihi) < gun) continue;
        if (!p.aktif && !(p.cikisTarihi instanceof Date)) continue;
        var vTip = personelGunlukVardiyaAl(ss, p.ad, gun);
        if (vTip !== "Off" && vTip !== "Yıllık izin" && vTip !== "Ücretsiz izin") continue;
        if (izinPuantajSatiriAc_(sheet, p.ad, gun, vTip, mevcut)) eklenen.push(p.ad + " " + anahtarTarih(gun) + " → " + vTip);
      }
    }
    if (eklenen.length) logEkle(ss, "Sistem", "PLAN_IZIN_ISARET", eklenen.join(" | "), "-");
    Logger.log(eklenen.length + " satır eklendi" + (eklenen.length ? ":\n" + eklenen.join("\n") : ""));
  } finally { kilitBirak(lock); _AYAR_CACHE = null; _VARDIYA_CACHE = null; }
}

// Geçmişi toparlamak için elle çalıştır (son 14 günü tarar)
function planIzinleriGeriyeDonukIsaretle() { planIzinleriIsaretle(14); }