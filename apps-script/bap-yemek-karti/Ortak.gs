/**
 * BAP Yemek Kartı — bütün yemek kartı işleri tek projede (06.10.2026)
 * Bu proje "BAP Yemek Kartı Tahsilatları" tablosuna bağlı (Uzantılar › Apps Script). Plan: docs/yemek-karti-projesi.md
 *
 *   Pluxee  : MacBook pluxee.mjs  → doPost tur 'pluxee'   → Pluxee.gs   → 'Pluxee' sekmesi
 *   Edenred : MacBook edenred.mjs → doPost tur 'edenred'  → Edenred.gs  → 'Edenred' sekmesi
 *   Paye    : Gmail "Gün Sonu Raporu" Excel'i (günde 2)   → Paye.gs     → 'Paye' (gün sonu) + 'Paye İşlemler' (işlem işlem)
 *   SetCard : SetCard API (saatte bir, MacBook gerekmez)   → SetCard.gs  → 'SetCard' sekmesi
 *   Metropol: MacBook metropol.mjs → doPost tur 'metropol' → Metropol.gs → 'Metropol' sekmesi (terminal = kurye)
 *   SMS doğrulama kodları (Pluxee, Edenred): Kod Kutusu.gs — iPhone Kestirmeler GET ?sayfa=kod&kaynak=…&k=…&kod=…
 *
 * Yemek kartı ajanı (açık hesapları kapatan) panel veri kapısında; bu tablodan okur.
 * Bir kez: kurulum() (Kurulum.gs).
 */

var YK_SS_ID = '19RVXZQwKZRCW6xnZxSwhRHXte4VWhaVqruaTZRwVJbM';   // BAP Yemek Kartı Tahsilatları
var TZ = 'Europe/Istanbul';

// MacBook programlarının (pluxee.mjs, edenred.mjs) POST anahtarı — kurye köprüsündekiyle aynı, Mac'te yalnız adres değişir.
var KOPRU_ANAHTAR = '9da1e5281cabba3ab4e9ea49';
// iPhone Kestirmeler anahtarı (GET ?k=…)
var KESTIRME_ANAHTAR = 'DU0HVwX0K-xgyCjnudnUYOeB';

function ykTablo_() { return SpreadsheetApp.openById(YK_SS_ID); }

function jsonYanit_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
