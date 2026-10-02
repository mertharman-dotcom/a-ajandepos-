var KAYNAK_DOSYA_ID = '152FdGaQUhwyd0ytcTbM1OI6beNZsXBJhCM-GoG2Bzvw'; // Make.com Data
var AMBAR_DOSYA_ID  = '17ScW_Xfbp6vN02DxYtjBAmwF_d-qlWhwaL5t9mF5bmk'; // BAP Veri Ambari
var KAYNAK_SEKME = 'Make.com Data';
var KALEM_SEKME  = 'Siparis_Kalemleri';

// Yan yana kolonların sabit pozisyonları (0 tabanlı: A=0)
var KOL_URUNLER     = 21; // V
var KOL_FIYATLAR    = 22; // W
var KOL_ADETLER     = 23; // X
var KOL_KATEGORILER = 24; // Y

function siparisKalemleriniYaz() {
  Logger.log("Basladi");

  var kaynakSs = SpreadsheetApp.openById(KAYNAK_DOSYA_ID);
  var kaynakSheet = kaynakSs.getSheetByName(KAYNAK_SEKME);
  if (!kaynakSheet) { Logger.log(KAYNAK_SEKME + " sekmesi bulunamadi!"); return; }

  var data = kaynakSheet.getDataRange().getValues();
  if (data.length < 2) { Logger.log("Kaynakta veri yok!"); return; }

  var hedefSs = SpreadsheetApp.openById(AMBAR_DOSYA_ID);
  var hedefSheet = hedefSs.getSheetByName(KALEM_SEKME);
  if (!hedefSheet) { Logger.log(KALEM_SEKME + " sekmesi bulunamadi!"); return; }

  var hedefSon = hedefSheet.getLastRow();
  var mevcutIdler = {};
  
  if (hedefSon > 1) {
    var mevcutData = hedefSheet.getRange(2, 1, hedefSon - 1, 1).getValues();
    for (var m = 0; m < mevcutData.length; m++) {
      if (mevcutData[m][0]) {
        mevcutIdler[mevcutData[m][0].toString().trim()] = true;
      }
    }
  }

  var headers = data[0];
  var idx = {};
  headers.forEach(function(h, i) {
    var k = h.toString().trim().toLowerCase();
    function ata(alan) { if (idx[alan] === undefined) idx[alan] = i; }

    if (k.includes("sipari") && k.includes("id")) ata("siparisId");
    else if (k.includes("kanal")) ata("kanal");
    else if (k.includes("teslim")) ata("teslim");
    else if (k.includes("tarih") || k.includes("date")) ata("tarih");
    else if (k.includes("tip") || k.includes("tür")) ata("tip");
    else if ((k.includes("urun") || k.includes("ürün") || k.includes("items")) && !k.includes("sube") && !k.includes("şube")) ata("urun");
    else if (k.includes("sube") || k.includes("şube") || k.includes("restoran")) ata("sube");
  });

  if (idx.siparisId === undefined) { Logger.log("Siparis ID sutunu bulunamadi!"); return; }

  var yeniSatirlar = [];
  var islenenSiparis = 0;

  for (var i = 1; i < data.length; i++) {
    var satir = data[i];
    var siparisId = satir[idx.siparisId] ? satir[idx.siparisId].toString().trim() : "";
    if (!siparisId || mevcutIdler[siparisId]) continue;

    var urunMetin = (idx.urun !== undefined && satir[idx.urun]) ? satir[idx.urun].toString().trim() : "";
    var yanUrun = (satir.length > KOL_URUNLER && satir[KOL_URUNLER]) ? satir[KOL_URUNLER].toString().trim() : "";
    var kalemler = [];

    // 1) YENİ FORMAT (V, W, X, Y)
    if (yanUrun !== "") {
      var adlar = yanUrun.split("|").map(function(s){ return s.trim(); });
      var fiyatlar = pipeBol(satir, KOL_FIYATLAR, adlar.length);
      var adetler = pipeBol(satir, KOL_ADETLER, adlar.length);
      var kategoriler = pipeBol(satir, KOL_KATEGORILER, adlar.length);

      for (var j = 0; j < adlar.length; j++) {
        if (!adlar[j]) continue;
        kalemler.push({
          adet: parseFloat((adetler[j] || "1").toString().replace(",", ".")) || 1,
          urun: adlar[j],
          kategori: kategoriler[j] || "",
          fiyat: parseFloat((fiyatlar[j] || "0").toString().replace(",", ".")) || 0
        });
      }
    } 
    // 2) ESKİ FORMAT (M sütunu regex parçalama)
    else if (urunMetin !== "") {
      var urunBloklari = urunMetin.split(/(?=\d+\s*x)/);
      urunBloklari.forEach(function(blok) {
        blok = blok.trim();
        if (!blok) return;
        var match = blok.match(/(\d+)\s*x\s*(.*?)\s*\(\s*(.*?)\s*,\s*([\d\.,]+)\s*\)/);
        if (!match) return;
        kalemler.push({
          adet: parseFloat(match[1].replace(",", ".")) || 1,
          urun: match[2].trim(),
          kategori: match[3].trim(),
          fiyat: parseFloat(match[4].replace(",", ".")) || 0
        });
      });
    }

    if (kalemler.length === 0) continue;

    mevcutIdler[siparisId] = true;
    islenenSiparis++;

    var sTarih = idx.tarih !== undefined ? isoTarihCevir(satir[idx.tarih]) : "";
    var sKanal = idx.kanal !== undefined ? satir[idx.kanal] : "";
    var sTip   = idx.tip !== undefined ? satir[idx.tip] : "";
    var sSube  = idx.sube !== undefined ? satir[idx.sube] : "";

    kalemler.forEach(function(kalem) {
      yeniSatirlar.push([
        siparisId,
        sTarih,
        sKanal,
        sTip,
        sSube,
        kalem.adet,
        kalem.urun,
        kalem.kategori,
        kalem.fiyat
      ]);
    });
  }

  if (yeniSatirlar.length === 0) {
    Logger.log("Yeni siparis yok, her sey guncel.");
    return;
  }

  // Başlık kontrolü
  if (hedefSon === 0) {
    hedefSheet.getRange(1, 1, 1, 9).setValues([[
      "Siparis_ID","Tarih","Kanal","Tip","Sube","Adet","Urun","Kategori","Birim_Fiyat"
    ]]);
    hedefSon = 1;
  }

  // Hedef sayfada yeterli boş satır yoksa otomatik genişlet
  var maxRows = hedefSheet.getMaxRows();
  var gerekenSatir = hedefSon + yeniSatirlar.length;
  if (gerekenSatir > maxRows) {
    hedefSheet.insertRowsAfter(maxRows, gerekenSatir - maxRows);
  }

  // Toplu Yazma (Parçalar halinde)
  var PARCA = 3000;
  for (var p = 0; p < yeniSatirlar.length; p += PARCA) {
    var parca = yeniSatirlar.slice(p, p + PARCA);
    hedefSheet.getRange(hedefSon + 1 + p, 1, parca.length, 9).setValues(parca);
  }

  Logger.log(islenenSiparis + " siparis islendi, " + yeniSatirlar.length + " kalem yazildi!");
}

function pipeBol(satir, kolonIndex, hedefUzunluk) {
  var ham = (satir.length > kolonIndex && satir[kolonIndex] !== "" && satir[kolonIndex] !== null && satir[kolonIndex] !== undefined)
    ? satir[kolonIndex].toString() : "";
  if (ham === "") {
    var bos = [];
    for (var i = 0; i < hedefUzunluk; i++) bos.push("");
    return bos;
  }
  var parcalar = ham.split("|").map(function(s){ return s.trim(); });
  while (parcalar.length < hedefUzunluk) parcalar.push("");
  return parcalar;
}

function isoTarihCevir(deger) {
  if (!deger) return "";
  if (deger instanceof Date) return deger;
  var s = deger.toString().trim();
  var d = new Date(s.replace("T", " ").replace(/\.\d+$/, ""));
  return isNaN(d.getTime()) ? s : d;
}