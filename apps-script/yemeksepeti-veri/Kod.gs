/*** BAP — Yemeksepeti rapor okuyucu ****************************************
 *
 * Yemeksepeti raporları mailde dosya olarak değil, partner paneline giden link olarak gelir;
 * o panele betik giriş yapamaz. Bu yüzden düzen şöyle:
 *   1) Sahip maildeki linke tıklar, inen CSV'yi Drive › "Yemeksepeti Raporları" klasörüne bırakır.
 *   2) Bu betik saatte bir klasöre bakar, dosyanın türünü başlıklarından tanır, ilgili sekmeye yazar,
 *      dosyayı "İşlendi" alt klasörüne taşır. Aynı satır iki kez yazılmaz (anahtar sütunlarla bulunur,
 *      değişmişse yerinde güncellenir). Satır silinmez.
 *
 * Tanınan raporlar (sütunlar başlık adıyla okunur; "Eski" dışa aktarmanın farklı adları YS.TURLER › esanlam ile eşlenir):
 *   Finansal Rapor - Ödemeler           → YS_Odemeler    (anahtar: Ödeme No)
 *   Finansal Rapor - Faturalar          → YS_Faturalar   (Fatura No) — haftalık brüt satış, komisyon, nakit, kesintiler
 *   Menü raporu                         → YS_Menu_Satis  (Tarih + Mağaza + Menü öğesi ID'si + adı)
 *   Puanlar ve değerlendirmeler raporu  → YS_Puanlar     (Sipariş Kimliği)
 *   Performans Raporu                   → YS_Performans  (Tarih + Restoran No) — kısa ya da 55 sütunluk tam hali
 *                                         (görüntülenme, menü görüntüleme, sepet, çevrimdışı süre, hazırlık süresi…)
 *
 * Kurulum (sırayla, Apps Script editöründen):
 *   ysKurulum()          — klasörü ve "BAP Yemeksepeti Raporları" tablosunu açar (veri yazmaz)
 *   ysKuru()             — klasördeki dosyaları okur, ne yazacağını raporlar, HİÇBİR ŞEY yazmaz
 *   ysYaz()              — sahip raporu onaylayınca: gerçekten yazar
 *   ysTetikleyiciKur()   — saatte bir ysYaz
 ***************************************************************************/

var YS = {
  KLASOR: 'Yemeksepeti Raporları',
  ISLENDI: 'İşlendi',
  TABLO: 'BAP Yemeksepeti Raporları',
  KAYIT: 'YS_Dosyalar',
  // Yemeksepeti mağaza kodu → şube (Drive'daki "Yemeksepeti BAP … DKNP / NRRZ" klasörlerinden)
  SUBE: { dknp: 'Salad Erenköy', nrrz: 'Pizza Erenköy', l65e: 'Salad Fikirtepe', ml23: 'Pizza Fikirtepe' },
  // esanlam: Yemeksepeti aynı raporu iki adlandırmayla veriyor (panelden yeni dışa aktarma ↔ geçmiş "Eski" dışa aktarma).
  // Eski ad → bu sekmede kullanılan ad. Tür, eşleştirmeden sonraki başlıklara göre tanınır.
  TURLER: [
    { ad: 'Ödemeler', sekme: 'YS_Odemeler', imza: ['Ödeme No', 'Toplam Ödeme'], anahtar: ['Ödeme No'], magaza: '' },
    { ad: 'Faturalar', sekme: 'YS_Faturalar', imza: ['Fatura No', 'Komisyon Bedeli'], anahtar: ['Fatura No'], magaza: '' },
    { ad: 'Menü satışları', sekme: 'YS_Menu_Satis', imza: ["Menü öğesi ID'si", 'Satılan Adet'],
      anahtar: ['Tarih', 'Mağaza Kimliği', "Menü öğesi ID'si", 'Menü öğesi adı'], magaza: 'Mağaza Kimliği',
      esanlam: {
        "Satıcı Kimliği": "Mağaza Kimliği",
        "Ortalama sipariş tutarı": "Ürün içeren siparişler için ortalama sipariş değeri",
        "Sipariş sayısı": "Öğe içeren siparişler",
        "Adet": "Satılan Adet",
        "Gelir": "Öğe başına gelir"
      } },
    { ad: 'Puanlar', sekme: 'YS_Puanlar', imza: ['Sipariş Kimliği', 'Derecelendirme'], anahtar: ['Sipariş Kimliği'], magaza: 'Vendor ID',
      esanlam: {
        "Restoran adı": "Restaurant Name",
        "Satıcı Kimliği": "Vendor ID",
        "Sipariş kimliği": "Sipariş Kimliği",
        "Puan": "Derecelendirme",
        "İnceleme metni": "Review Text"
      } },
    { ad: 'Performans', sekme: 'YS_Performans', imza: ['Brüt Satışlar', 'Başarılı Siparişler'], anahtar: ['Tarih', 'Restoran No'], magaza: 'Restoran No',
      esanlam: {
        "Başarılı siparişler": "Başarılı Siparişler",
        "Brüt satışlar": "Brüt Satışlar",
        "Çevrim içi satışlar": "Online Ödemeli Satışlar",
        "Nakit satış": "Nakit Ödemeli Satışlar",
        "Teslimat satışları": "Adrese Teslim Satışlar",
        "Gel Al satışları": "Gel-Al Satışları",
        "İptal edilen siparişler": "İptal Edilen Siparişler",
        "Çevrim içi siparişler": "Online Ödemeli Siparişler",
        "Nakit siparişler": "Nakit Ödemeli Siparişler",
        "Kurye teslimatlı siparişler": "Adrese Teslim Siparişler",
        "Gel Al siparişleri": "Gel-Al Siparişleri",
        "Pro siparişleri": "Pro Siparişler",
        "Pro geliri": "Pro Ciro",
        "Müsait olmama süresi (Dakika)": "Unavailable time duration (Minutes)",
        "Erişilemeyen süre oranı": "Çevrimdışı Kalma Oranı",
        "Planlanan açılma zamanı (dakika)": "Planlanan çalışma saati (Dakika)",
        "Uygun Olmayan Süre sayısı": "Unavailable Time Duration count",
        "Önlenebilir iptal nedeni": "İşletme Kaynaklı İptal Nedeni",
        "Önlenebilir iptal sayısı": "Avoidable cancellation count",
        "Ortalama hazırlama süresi (dakika)": "Average preparation time (minutes)",
        "İşaretli siparişlerin oranı": "Orders marked rate",
        "Toplam önlenebilir bekleme süresi (dakika)": "Total AWT Duration (Minutes)",
        "AWT'li siparişler": "Orders with AWT",
        "Önlenebilir bekleme süresi ücreti olan sipariş": "Order with AWT Fee",
        "Uygulanan toplam ücret": "Total Fee applied",
        "1. Kümedeki siparişler: < 5 dakika": "Orders in Bucket1: < 5 minutes",
        "Kova1'de ücretli siparişler: < 5 dakika": "Orders with fees in Bucket1: < 5 minutes",
        "Grup2'deki siparişler: >= 5 dakika ve < 10 dakika": "Orders in Bucket2: >= 5 Mins and < 10 Mins",
        "Grup2'deki ücretli siparişler: >= 5 dakika ve < 10 dakika": "Orders with fees in Bucket2: >= 5 Mins and < 10 Mins",
        "Grup3'teki siparişler: >= 10 dakika": "Orders in Bucket3: >= 10 Mins",
        "Kepçe3'te ücretli siparişler: >= 10 dakika": "Orders with fees in Bucket3: >= 10 Mins",
        "Müşteri Şikayet oranı": "Customer Complaint rate",
        "Müşteri şikâyeti nedeni": "Customer Complaint Reason",
        "Müşteri şikâyeti kişileri": "Customer Complaint Contacts",
        "Kendi teslimat personelinin kişi sayısı": "Own delivery contacts count",
        "Satıcı teslimat irtibat kişisi sayısı": "Vendor delivery contacts counts",
        "Yeni müşterilerden gelen siparişlerin oranı": "Orders from new customers rate",
        "Tekrar gelen müşterilerden gelen siparişler": "Orders from returning customers",
        "Tekrar gelen müşterilerden gelen siparişlerin oranı": "Orders from returning customers rate"
      } }
  ],
  EK: ['Şube', 'Dosya', 'Alındı', 'Rapor Son Gün']   // her sekmenin sonuna eklenen sütunlar; son gün = dosyadaki en geç Tarih
};

/* ================== KURULUM ================== */

function ysKurulum() {
  var p = PropertiesService.getScriptProperties();
  var klasor = ysKlasor_(), islendi = ysAltKlasor_(klasor, YS.ISLENDI);
  var ss = ysTablo_();
  Logger.log('Klasör: ' + klasor.getUrl() + '\nİşlendi: ' + islendi.getUrl() + '\nTablo: ' + ss.getUrl() +
             '\nCSV dosyalarını bu klasöre bırakın, sonra ysKuru() çalıştırın.');
  p.setProperty('YS_KURULDU', new Date().toISOString());
}

function ysTetikleyiciKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'ysYaz') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('ysYaz').timeBased().everyHours(1).create();
  Logger.log('ysYaz saatte bir çalışacak.');
}

/* ================== ANA İŞ ================== */

function ysKuru() { return ysCalistir_(true); }
function ysYaz()  { return ysCalistir_(false); }

function ysCalistir_(kuru) {
  var klasor = ysKlasor_(), islendi = ysAltKlasor_(klasor, YS.ISLENDI);
  var ss = ysTablo_(), kayit = ysKayitSekme_(ss), gorulen = {}, bellek = {};
  if (kayit.getLastRow() > 1) kayit.getRange(2, 1, kayit.getLastRow() - 1, 1).getValues().forEach(function (r) { gorulen[r[0]] = 1; });

  var rapor = [], it = klasor.getFiles();
  while (it.hasNext()) {
    var f = it.next(), sonuc = { dosya: f.getName(), tur: '', yeni: 0, guncel: 0, ayni: 0, not: '' };
    try {
      if (gorulen[f.getId()]) { sonuc.not = 'daha önce işlenmiş'; if (!kuru) f.moveTo(islendi); rapor.push(sonuc); continue; }
      if (!/\.csv$/i.test(f.getName()) && f.getMimeType() !== MimeType.CSV) { sonuc.not = 'CSV değil, atlandı'; rapor.push(sonuc); continue; }
      var tablo = ysCsvOku_(f.getBlob());
      if (tablo.length < 1) { sonuc.not = 'boş dosya'; rapor.push(sonuc); continue; }
      var tur = ysTurBul_(tablo[0]);
      if (!tur) { sonuc.not = 'tanınmayan rapor (başlıklar: ' + tablo[0].join(', ') + ')'; rapor.push(sonuc); continue; }
      sonuc.tur = tur.ad;
      var s = ysSekmeyeYaz_(ss, tur, tablo, f.getName(), kuru, bellek);
      sonuc.yeni = s.yeni; sonuc.guncel = s.guncel; sonuc.ayni = s.ayni;
      if (!kuru) {
        kayit.appendRow([f.getId(), f.getName(), tur.ad, s.yeni, s.guncel, s.ayni, new Date()]);
        f.moveTo(islendi);
      }
    } catch (e) { sonuc.not = 'HATA: ' + e; }
    rapor.push(sonuc);
  }

  var metin = (kuru ? 'KURU ÇALIŞMA — hiçbir şey yazılmadı.\n' : '') +
    (rapor.length ? rapor.map(function (r) {
      return '• ' + r.dosya + ' → ' + (r.tur || '-') + (r.tur ? ': ' + r.yeni + ' yeni, ' + r.guncel + ' güncellenen, ' + r.ayni + ' aynı' : '') + (r.not ? ' (' + r.not + ')' : '');
    }).join('\n') : 'Klasörde yeni dosya yok.');
  Logger.log(metin);
  return rapor;
}

/* Sekmenin bu çalıştırmadaki durumu (başlıklar, satırlar, anahtar → satır). Aynı türden iki dosya gelirse
   ikincisi birincinin satırlarını görür; kuru çalışmada da sayılar gerçekteki gibi çıkar. */
function ysSekmeDurum_(ss, tur, bellek) {
  if (bellek[tur.sekme]) return bellek[tur.sekme];
  var sh = ss.getSheetByName(tur.sekme);
  var bas = sh ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); }) : YS.EK.slice();
  var satir = sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, bas.length).getValues() : [];
  var eksik = YS.EK.filter(function (b) { return bas.indexOf(b) < 0; });   // sonradan eklenen ek sütun
  if (eksik.length) { bas = bas.concat(eksik); satir = satir.map(function (r) { return r.concat(eksik.map(function () { return ''; })); }); }
  return (bellek[tur.sekme] = { sh: sh, bas: bas, satir: satir, yer: null, tumunuYaz: eksik.length > 0 && satir.length > 0 });
}

/* Raporu sekmesine yazar: anahtar varsa ve değer değiştiyse yerinde günceller, yoksa sona ekler. */
function ysSekmeyeYaz_(ss, tur, tablo, dosyaAd, kuru, bellek) {
  var d = ysSekmeDurum_(ss, tur, bellek);
  var basl = tablo[0].map(function (x) { return String(x).trim(); });
  var ekBas = basl.filter(function (x, i) { return x && d.bas.indexOf(x) < 0 && basl.indexOf(x) === i; });
  if (ekBas.length) {
    // rapor sütunları başa, Şube / Dosya / Alındı hep en sonda; mevcut satırlar yeni sıraya taşınır
    var eskiBas = d.bas, yeniBas = eskiBas.filter(function (b) { return YS.EK.indexOf(b) < 0; }).concat(ekBas, YS.EK);
    d.satir = d.satir.map(function (r) { return yeniBas.map(function (b) { var c = eskiBas.indexOf(b); return c < 0 ? '' : r[c]; }); });
    d.bas = yeniBas; d.yer = null; d.tumunuYaz = true;
  }
  var bas = d.bas, anahtarSira = tur.anahtar.map(function (a) { return bas.indexOf(a); });
  if (!d.yer) { d.yer = {}; d.satir.forEach(function (r, i) { d.yer[ysAnahtar_(r, anahtarSira)] = i; }); }

  var tc = basl.indexOf('Tarih'), sonGun = '';
  if (tc >= 0) for (var t = 1; t < tablo.length; t++) { var tv = ysDeger_('Tarih', tablo[t][tc]); if (tv instanceof Date && (!sonGun || tv > sonGun)) sonGun = tv; }
  var simdi = new Date(), ilkYeni = d.satir.length, sayi = { yeni: 0, guncel: 0, ayni: 0 }, guncellenen = false;
  for (var i = 1; i < tablo.length; i++) {
    var r = tablo[i];
    if (!r.some(function (x) { return String(x).trim() !== ''; })) continue;
    var s = new Array(bas.length).fill('');
    basl.forEach(function (b, k) { if (b) s[bas.indexOf(b)] = ysDeger_(b, r[k]); });
    var mag = tur.magaza ? String(s[bas.indexOf(tur.magaza)]).trim() : '';
    s[bas.indexOf('Şube')] = YS.SUBE[mag] || mag;
    s[bas.indexOf('Dosya')] = dosyaAd;
    s[bas.indexOf('Alındı')] = simdi;
    s[bas.indexOf('Rapor Son Gün')] = sonGun;

    var k = ysAnahtar_(s, anahtarSira), j = d.yer[k];
    if (j === undefined) { d.yer[k] = d.satir.length; d.satir.push(s); sayi.yeni++; continue; }
    var eski = d.satir[j];
    var fark = basl.some(function (b) { var c = bas.indexOf(b); return ysKarsilastir_(eski[c]) !== ysKarsilastir_(s[c]); });
    if (!fark) { sayi.ayni++; continue; }
    // Gün kapanmadan çekilen rapor o günü yarım verir (görüntülenme boş, herkes "yeni müşteri"). Dosyalar sırasız
    // işlendiği için: daha eski tarihe kadar uzanan rapor, daha yenisinin yazdığı satırın üstüne yazmaz.
    var sg = bas.indexOf('Rapor Son Gün');
    if (ysKarsilastir_(s[sg]) < ysKarsilastir_(eski[sg])) { sayi.ayni++; continue; }
    // bu raporda olmayan sütunlar (kısa Performans raporu ↔ 55 sütunluk tam hali) eski değerini korur
    s = s.map(function (v, c) { return basl.indexOf(bas[c]) < 0 && YS.EK.indexOf(bas[c]) < 0 ? eski[c] : v; });
    d.satir[j] = s; sayi.guncel++;
    if (j < ilkYeni) guncellenen = true;
  }
  if (kuru) return sayi;

  if (!d.sh) { d.sh = ss.insertSheet(tur.sekme); d.sh.setFrozenRows(1); d.tumunuYaz = true; }
  var sh = d.sh, n = d.satir.length;
  if (!n) return sayi;
  if (sh.getMaxRows() < n + 1) sh.insertRowsAfter(sh.getMaxRows(), n + 1 - sh.getMaxRows());
  if (sh.getMaxColumns() < bas.length) sh.insertColumnsAfter(sh.getMaxColumns(), bas.length - sh.getMaxColumns());
  sh.getRange(1, 1, 1, bas.length).setValues([bas]).setFontWeight('bold');
  bas.forEach(function (b, c) {
    var rng = sh.getRange(2, c + 1, n, 1);
    if (ysKimlikMi_(b)) rng.setNumberFormat('@');          // değerlerden önce: kimlik sayıya dönmesin
    else if (b === 'Alındı') rng.setNumberFormat('dd.MM.yyyy HH:mm');
    else if (/tarih|son gün/i.test(b)) rng.setNumberFormat('dd.MM.yyyy');
  });
  var bas0 = (d.tumunuYaz || guncellenen) ? 0 : ilkYeni;   // değişen eski satır yoksa yalnız yeniler yazılır
  if (n > bas0) sh.getRange(2 + bas0, 1, n - bas0, bas.length).setValues(d.satir.slice(bas0));
  d.tumunuYaz = false;
  return sayi;
}

/* ================== YARDIMCILAR ================== */

/* Raporun türünü bulur; eski adlı başlıkları o türün adlarına çevirir (başlık satırı yerinde değişir). */
function ysTurBul_(baslik) {
  var b = baslik.map(function (x) { return String(x).trim(); });
  for (var i = 0; i < YS.TURLER.length; i++) {
    var tur = YS.TURLER[i], es = tur.esanlam || {};
    var c = b.map(function (x) { return es[x] || x; });
    if (tur.imza.every(function (x) { return c.indexOf(x) >= 0; })) {
      c.forEach(function (x, k) { baslik[k] = x; });
      return tur;
    }
  }
  return null;
}

function ysCsvOku_(blob) {
  var metin = blob.getDataAsString('UTF-8').replace(/^﻿/, '');
  var ilk = metin.split(/\r?\n/)[0] || '';
  var ayrac = (ilk.split(';').length > ilk.split(',').length) ? ';' : ',';
  return Utilities.parseCsv(metin, ayrac).filter(function (r) { return r.length > 1 || String(r[0]).trim() !== ''; });
}

/* Kimlik / numara sütunları metin kalır (600007911355 sayıya dönüp bozulmasın) */
function ysKimlikMi_(b) { return /(^| )(no|id)$|id'si|id'leri|kimliği/i.test(b); }

function ysDeger_(baslik, v) {
  var s = String(v == null ? '' : v).trim();
  if (s === '') return '';
  if (ysKimlikMi_(baslik)) return s;
  var t = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (t) return new Date(+t[1], +t[2] - 1, +t[3]);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function ysKarsilastir_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Istanbul', 'yyyy-MM-dd');
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
  var s = String(v == null ? '' : v).trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? String(Math.round(Number(s) * 1000) / 1000) : s;
}

function ysAnahtar_(r, sira) { return sira.map(function (c) { return c < 0 ? '' : ysKarsilastir_(r[c]); }).join('|'); }

function ysKlasor_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('YS_KLASOR');
  if (id) return DriveApp.getFolderById(id);
  var it = DriveApp.getRootFolder().getFoldersByName(YS.KLASOR);
  var k = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(YS.KLASOR);
  p.setProperty('YS_KLASOR', k.getId());
  return k;
}

function ysAltKlasor_(ust, ad) {
  var it = ust.getFoldersByName(ad);
  return it.hasNext() ? it.next() : ust.createFolder(ad);
}

function ysTablo_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('YS_TABLO');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create(YS.TABLO);
  DriveApp.getFileById(ss.getId()).moveTo(ysKlasor_());
  p.setProperty('YS_TABLO', ss.getId());
  return ss;
}

function ysKayitSekme_(ss) {
  var sh = ss.getSheetByName(YS.KAYIT);
  if (sh) return sh;
  var ilk = ss.getSheets()[0];   // yeni tablonun boş 'Sayfa1'i kayıt sekmesi olur
  if (ss.getSheets().length === 1 && ilk.getLastRow() === 0 && /^(Sayfa|Sheet)1$/.test(ilk.getName())) { sh = ilk; sh.setName(YS.KAYIT); }
  else sh = ss.insertSheet(YS.KAYIT);
  sh.getRange(1, 1, 1, 7).setValues([['Dosya ID', 'Dosya', 'Rapor', 'Yeni', 'Güncellenen', 'Aynı', 'İşlendi']]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}
