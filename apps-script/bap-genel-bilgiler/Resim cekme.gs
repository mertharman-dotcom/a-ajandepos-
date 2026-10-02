function doGet() {
  const folderId = "1lfqOWH63hmAd29X_RA2IdoVNBzGcVZD3";
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  const imageMap = {};

  while (files.hasNext()) {
    const file = files.next();
    // Dosya adının uzantısını temizle (Örn: "Porçini Pizza.jpg" -> "porcini pizza")
    let name = file.getName().replace(/\.[^/.]+$/, "").trim().toLowerCase();
    name = normalizeText(name);
    
    // Doğrudan görüntülenebilir Google CDN linki
    imageMap[name] = "https://lh3.googleusercontent.com/d/" + file.getId();
  }

  return ContentService.createTextOutput(JSON.stringify(imageMap))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeText(text) {
  return text
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]/g, "");
}