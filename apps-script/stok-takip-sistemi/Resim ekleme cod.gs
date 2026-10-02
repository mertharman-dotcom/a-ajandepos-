// Google Drive Klasör ID'niz
const DRIVE_FOLDER_ID = "1lfqOWH63hmAd29X_RA2IdoVNBzGcVZD3";

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('B.A.P Canlı Mutfak Paneli')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Drive'daki Resimleri Doğrudan Base64 Formatında Okuyan Fonksiyon (Engellenemez)
function getDriveImagesMap() {
  const imagesMap = {};
  try {
    const rootFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    scanFolder(rootFolder, imagesMap);
  } catch (e) {
    Logger.log("Drive okuma hatası: " + e.toString());
  }
  return imagesMap;
}

function scanFolder(folder, map) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const mime = file.getMimeType();
    if (mime.indexOf("image/") === 0) {
      // Dosya adından uzantıyı temizle ve küçük harfe çevir
      const cleanName = file.getName().replace(/\.[^/.]+$/, "").trim().toLowerCase();
      try {
        const blob = file.getBlob();
        const base64Data = Utilities.base64Encode(blob.getBytes());
        map[cleanName] = "data:" + mime + ";base64," + base64Data;
      } catch (err) {
        Logger.log("Blob dönüştürme hatası: " + err.toString());
      }
    }
  }
  const subFolders = folder.getFolders();
  while (subFolders.hasNext()) {
    scanFolder(subFolders.next(), map);
  }
}

// E-Tablodan Canlı Reçeteleri ve Yarı Mamulleri Çeken Fonksiyon
function getKitchenData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const driveImages = getDriveImagesMap();

  // 1. Ürün Reçeteleri (Tbl_Receteler)
  const recSheet = ss.getSheetByName('Tbl_Receteler');
  const productsMap = {};
  if (recSheet) {
    const data = recSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const pName = String(data[i][0] || '').trim();
      const cat = String(data[i][1] || 'Ürün').trim();
      const ing = String(data[i][2] || '').trim();
      const qty = data[i][3];
      const unit = String(data[i][4] || '').trim();
      const type = String(data[i][5] || '').trim();

      if (!pName) continue;
      if (!productsMap[pName]) {
        const key = pName.toLowerCase();
        productsMap[pName] = {
          name: pName,
          category: cat,
          imageUrl: driveImages[key] || "",
          ingredients: []
        };
      }
      if (ing) {
        productsMap[pName].ingredients.push({
          name: ing,
          qty: qty + " " + unit,
          type: type
        });
      }
    }
  }

  // 2. Yarı Mamul Reçeteleri (Tbl_YariMamulRecete)
  const ymSheet = ss.getSheetByName('Tbl_YariMamulRecete');
  const ymMap = {};
  if (ymSheet) {
    const ymData = ymSheet.getDataRange().getValues();
    for (let j = 1; j < ymData.length; j++) {
      const ymName = String(ymData[j][0] || '').trim();
      const ingName = String(ymData[j][1] || '').trim();
      const bazMiktar = ymData[j][2];
      const birim = String(ymData[j][3] || '').trim();
      const kategori = String(ymData[j][6] || 'Hazırlık').trim();

      if (!ymName) continue;
      if (!ymMap[ymName]) {
        const ymKey = ymName.toLowerCase();
        ymMap[ymName] = {
          name: ymName,
          category: kategori,
          imageUrl: driveImages[ymKey] || "",
          ingredients: []
        };
      }
      if (ingName) {
        ymMap[ymName].ingredients.push({
          name: ingName,
          qty: bazMiktar + " " + birim
        });
      }
    }
  }

  return {
    products: Object.values(productsMap),
    preparations: Object.values(ymMap)
  };
}

function submitRecipeSuggestion(urunAdi, calisanAdi, oneriTipi, aciklama) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Recete_Onerileri');
  if (!sheet) {
    sheet = ss.insertSheet('Recete_Onerileri');
    sheet.appendRow(['Tarih/Saat', 'Ürün / Hazırlık', 'Çalışan', 'Öneri Tipi', 'Açıklama', 'Durum']);
    sheet.getRange(1, 1, 1, 6).setBackground('#1F4E78').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  sheet.appendRow([new Date().toLocaleString('tr-TR'), urunAdi, calisanAdi, oneriTipi, aciklama, 'İnceleme Bekliyor']);
  return { success: true, message: 'Öneriniz kaydedildi ve yönetici tablosuna işlendi!' };
}

function yetkiVer() {
  const folder = DriveApp.getFolderById("1lfqOWH63hmAd29X_RA2IdoVNBzGcVZD3");
  Logger.log("Yetki Başarılı: " + folder.getName());
}