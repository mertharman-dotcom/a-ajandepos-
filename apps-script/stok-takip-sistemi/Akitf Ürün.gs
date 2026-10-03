/**
 * ============================================================
 *  AKTİF ÜRÜN FİLTRESİ  ·  v1.0
 *  BAP Stok Takip Sistemi — maliyet motoruna ek dosya
 * ------------------------------------------------------------
 *  Ne yapar?
 *   1) Tbl_Receteler H sütununa "Aktif Ürün" işareti koyar:
 *      ürün adı Urun_Listesi'nde AKTİF bir ÜRÜN olarak varsa "✓",
 *      yoksa boş bırakır.
 *   2) Maliyet tablosundan, aktif olmayan ürünlerin satırlarını siler.
 *
 *  Sayfaları ada göre değil BAŞLIĞA göre bulur; sekme adı
 *  değişse bile çalışır.
 *
 *  KULLANIM
 *    aktifUrunleriIsaretle()   -> ikisini birden yapar
 *  Motorun sonuna eklemek istersen (maliyet tablosu yazıldıktan sonra):
 *    maliyetTablosuSuz();
 * ============================================================
 */

var AK_ISARET = '✓';
var AK_H_BASLIK = 'Aktif Ürün';

/** Dosyayı bul: STOK_DOSYA_ID varsa onu, yoksa SHEET_ID'yi, o da yoksa aktif dosyayı kullanır. */
function _akSS() {
  try { if (typeof STOK_DOSYA_ID === 'string' && STOK_DOSYA_ID) return SpreadsheetApp.openById(STOK_DOSYA_ID); } catch (e) {}
  try { if (typeof SHEET_ID === 'string' && SHEET_ID) return SpreadsheetApp.openById(SHEET_ID); } catch (e) {}
  var a = SpreadsheetApp.getActiveSpreadsheet();
  if (a) return a;
  throw new Error('Stok dosyası bulunamadı — STOK_DOSYA_ID veya SHEET_ID tanımlı değil.');
}

/** Türkçe duyarlı sadeleştirme (motordaki nrm ile aynı mantık). */
function _akNrm(s) {
  s = String(s == null ? '' : s).replace(/İ/g, 'i').replace(/I/g, 'ı');
  s = s.toLowerCase();
  return s.replace(/[\s.,\-*\/()'"&:;!?]/g, '');
}

/** Başlık satırında verilen metni içeren ilk sayfayı döndürür. */
function _akSayfaBul(ss, anahtar) {
  var sayfalar = ss.getSheets();
  for (var i = 0; i < sayfalar.length; i++) {
    var sonSutun = sayfalar[i].getLastColumn();
    if (!sonSutun) continue;
    var baslik = sayfalar[i].getRange(1, 1, 1, sonSutun).getDisplayValues()[0];
    for (var j = 0; j < baslik.length; j++) {
      if (String(baslik[j]).indexOf(anahtar) > -1) return sayfalar[i];
    }
  }
  return null;
}

/** Urun_Listesi'ndeki aktif ÜRÜNLERİN (yarı mamüller hariç) adları. */
function _akAktifUrunSeti() {
  var ss = _akSS();
  var sh = _akSayfaBul(ss, 'Ürün / Yarı Mamül');
  if (!sh) throw new Error('Urun_Listesi bulunamadı — başlık satırında "Ürün / Yarı Mamül" yazan sayfa yok.');

  var veri = sh.getDataRange().getDisplayValues();
  var baslik = veri[0].map(function (x) { return String(x).trim(); });

  var iTip = -1, iAktif = -1;
  baslik.forEach(function (b, k) {
    if (b.indexOf('Ürün / Yarı Mamül') > -1) iTip = k;
    if (b === 'Aktif') iAktif = k;
  });

  var set = {}, sayac = 0;
  for (var r = 1; r < veri.length; r++) {
    var ad = String(veri[r][0] || '').trim();
    if (!ad) continue;

    // yarı mamül satırları ürün değildir
    if (iTip > -1) {
      var tip = _akNrm(veri[r][iTip]);
      if (tip && tip.indexOf('yarimamul') > -1) continue;
    }
    // "Aktif" sütunu açıkça pasif diyorsa alma
    if (iAktif > -1) {
      var d = _akNrm(veri[r][iAktif]);
      if (d && (d.indexOf('pasif') > -1 || d === 'hayır' || d === 'hayir' ||
                d === 'false' || d === '0' || d.indexOf('kapalı') > -1)) continue;
    }
    if (!set[_akNrm(ad)]) { set[_akNrm(ad)] = ad; sayac++; }
  }

  if (!sayac) throw new Error('Urun_Listesi okundu ama aktif ürün bulunamadı — sütunları kontrol et.');
  return set;
}

/** Tbl_Receteler H sütununa aktif ürün işareti koyar. */
function receteAktifIsaretle() {
  var aktif = _akAktifUrunSeti();
  var ss = _akSS();
  var sh = _akSayfaBul(ss, 'Hammadde_Kategori');
  if (!sh) throw new Error('Tbl_Receteler bulunamadı — başlıkta "Hammadde_Kategori" yazan sayfa yok.');

  var sonSatir = sh.getLastRow();
  if (sonSatir < 2) return { isaretli: 0, bos: 0, eslesmeyen: [] };

  sh.getRange(1, 8).setValue(AK_H_BASLIK);

  var adlar = sh.getRange(2, 1, sonSatir - 1, 1).getDisplayValues();
  var cikti = [], isaretli = 0, bos = 0, eslesmeyen = {};

  for (var i = 0; i < adlar.length; i++) {
    var ad = String(adlar[i][0] || '').trim();
    if (!ad) { cikti.push(['']); continue; }
    if (aktif[_akNrm(ad)]) { cikti.push([AK_ISARET]); isaretli++; }
    else { cikti.push(['']); bos++; eslesmeyen[ad] = 1; }
  }

  sh.getRange(2, 8, cikti.length, 1).setValues(cikti);

  var liste = Object.keys(eslesmeyen);
  Logger.log('Reçete satırı: ' + cikti.length + ' · işaretli: ' + isaretli + ' · boş: ' + bos);
  if (liste.length) Logger.log('Urun_Listesi\'nde AKTİF ürün olarak bulunamayanlar:\n  - ' + liste.join('\n  - '));
  return { isaretli: isaretli, bos: bos, eslesmeyen: liste };
}

/** Maliyet tablosundan aktif olmayan ürünlerin satırlarını siler. */
function maliyetTablosuSuz() {
  var aktif = _akAktifUrunSeti();
  var ss = _akSS();
  var sh = _akSayfaBul(ss, 'Reçete Maliyeti');
  if (!sh) throw new Error('Maliyet tablosu bulunamadı — başlıkta "Reçete Maliyeti" yazan sayfa yok.');

  var sonSatir = sh.getLastRow();
  if (sonSatir < 2) return { silinen: 0, kalan: 0, silinenler: [] };

  var adlar = sh.getRange(2, 1, sonSatir - 1, 1).getDisplayValues();
  var silinecek = [], silinenler = [];
  for (var i = 0; i < adlar.length; i++) {
    var ad = String(adlar[i][0] || '').trim();
    if (!ad) continue;
    if (!aktif[_akNrm(ad)]) { silinecek.push(i + 2); silinenler.push(ad); }
  }

  // aşağıdan yukarı sil, satır numaraları kaymasın
  for (var j = silinecek.length - 1; j >= 0; j--) sh.deleteRow(silinecek[j]);

  Logger.log('Maliyet tablosu: ' + silinecek.length + ' satır silindi, ' +
             (sonSatir - 1 - silinecek.length) + ' aktif ürün kaldı.');
  if (silinenler.length) Logger.log('Silinenler:\n  - ' + silinenler.join('\n  - '));
  return { silinen: silinecek.length, kalan: sonSatir - 1 - silinecek.length, silinenler: silinenler };
}

/** İkisini birden çalıştır — normalde bunu kullan. */
function aktifUrunleriIsaretle() {
  var a = receteAktifIsaretle();
  var b = maliyetTablosuSuz();
  var mesaj = 'Reçete: ' + a.isaretli + ' satır işaretlendi, ' + a.bos + ' satır boş.\n' +
              'Maliyet tablosu: ' + b.silinen + ' satır silindi, ' + b.kalan + ' aktif ürün kaldı.';
  if (a.eslesmeyen.length) mesaj += '\n\nAktif ürün listesinde bulunamayan reçete adları:\n• ' + a.eslesmeyen.join('\n• ');
  Logger.log(mesaj);
  try { SpreadsheetApp.getUi().alert(mesaj); } catch (e) {}
  return mesaj;
}