/**
 * BAP Stok Takip & Kolaybi Tablolarını CSV Olarak Dışa Aktarma Scripti
 * Hedef Klasör: BAP_Stok_CSV
 */

function exportAllTargetSheetsToCSV() {
  const folderName = "BAP_Stok_CSV";
  
  // 1. Hedef Klasörü Bul veya Oluştur
  let folder;
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
  }

  // 2. Aktarılacak Dosyalar ve Sekmeler Listesi
  // Eğer tüm bu sekmeler tek bir E-Tablo içindeyse doğrudan aktif dosyadan alır.
  const activeSS = SpreadsheetApp.getActiveSpreadsheet();
  
  const targetSheets = [
    "Tbl_Receteler",
    "Tbl_YariMamulRecete",
    "Tbl_YariMamul",
    "Tbl_Hammaddeler",
    "Ambalaj_Hammadde",
    "Direktsatisurunler",
    "Ambalaj_Kurallari",
    "Urun_Listesi",
    "Fatura_Kalemleri",
    "Sayfa1"
  ];

  targetSheets.forEach(sheetName => {
    let sheet = activeSS.getSheetByName(sheetName);
    
    // Eğer sekme aktif tabloda değilse Drive'daki diğer dosyalarda (örn. Kolaybi) ara
    if (!sheet) {
      const files = DriveApp.getFilesByName("Kolaybi Fatura Ham Veri");
      while (files.hasNext()) {
        const otherSS = SpreadsheetApp.open(files.next());
        const otherSheet = otherSS.getSheetByName(sheetName);
        if (otherSheet) {
          sheet = otherSheet;
          break;
        }
      }
    }

    if (sheet) {
      saveSheetAsCSV(sheet, folder, sheetName + ".csv");
      Logger.log(sheetName + " başarıyla CSV yapıldı.");
    } else {
      Logger.log("UYARI: " + sheetName + " sekmesi bulunamadı.");
    }
  });

  Logger.log("Tüm CSV güncelleme işlemi tamamlandı.");
}

/**
 * Tekil bir sekmeyi CSV'ye çevirip Drive'a yazar/günceller
 */
function saveSheetAsCSV(sheet, folder, fileName) {
  const data = sheet.getDataRange().getValues();
  let csvContent = "";

  data.forEach(row => {
    const processedRow = row.map(cell => {
      let text = cell !== null && cell !== undefined ? cell.toString() : "";
      text = text.replace(/"/g, '""');
      if (text.search(/("|,|\n|\r)/g) >= 0) {
        text = `"${text}"`;
      }
      return text;
    });
    csvContent += processedRow.join(",") + "\r\n";
  });

  // Dosya zaten varsa içeriğini güncelle, yoksa yeni oluştur
  const existingFiles = folder.getFilesByName(fileName);
  if (existingFiles.hasNext()) {
    const file = existingFiles.next();
    file.setContent(csvContent);
  } else {
    folder.createFile(fileName, csvContent, MimeType.PLAIN_TEXT);
  }
}

/**
 * 10:00, 14:00, 19:00 ve 24:00 (00:00) Tetikleyicilerini Otomatik Kuran Fonksiyon
 * Bu fonksiyonu sadece 1 KERE manuel çalıştırmanız yeterlidir.
 */
function setupDailyTriggers() {
  // Eski tetikleyicileri temizle (çift tetiklemeyi önlemek için)
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === "exportAllTargetSheetsToCSV") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Belirlediğiniz saatler: 10:00, 14:00, 19:00, 00:00 (24:00)
  const hours = [10, 14, 19, 0];

  hours.forEach(hour => {
    ScriptApp.newTrigger("exportAllTargetSheetsToCSV")
      .timeBased()
      .everyDays(1)
      .atHour(hour)
      .create();
  });

  Logger.log("Tetikleyiciler başarıyla kuruldu: 10:00, 14:00, 19:00 ve 24:00.");
}