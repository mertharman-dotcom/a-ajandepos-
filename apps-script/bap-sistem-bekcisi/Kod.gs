/**
 * BAP SİSTEM BEKÇİSİ (Nabız v2)
 * "BAP Sistem Nabzı" e-tablosuna bağlı. 15 dakikada bir bütün sistemi dolaşır ve sonucu bu dosyaya yazar:
 *   Durum       → her sistemin şu anki hâli (OK / UYARI / SORUN), ne zamandan beri, nerede, ne yapmalı
 *   Olaylar     → bir sistemin durumu her değiştiğinde bir satır (ne zaman durdu, ne zaman düzeldi)
 *   Kalp        → bekçinin kendi son çalışması ve gece yedeği zamanı (TS Sistem Sağlığı ajanı buna bakar)
 *   Abonelikler → sahibin elle doldurduğu ücretli hizmetler ve yenileme tarihleri
 * Yönetim paneli (Veri Kapısı › nabiz_) Durum sekmesini okuyup "Sistem Sağlığı" ekranında gösterir.
 *
 * Neye bakar:
 *   1) Veri akışları: önemli sekmelerdeki en yeni kaydın zamanı (Adisyo siparişleri, kurye, yemek kartı, Trendyol…)
 *   2) Apps Script: son 24 saatte hata veren ya da zaman aşımına uğrayan çalışmalar (hangi proje, hangi fonksiyon)
 *   3) Make: kapalı / bozuk senaryolar, son çalışması hata veren senaryolar, aylık işlem kotası, yapay zekâ kredisi hataları
 *   4) Web adresleri: mutfak paneli, yönetim paneli, Apps Script web uygulamaları cevap veriyor mu
 *   5) Google: Drive alanı, günlük e-posta kotası; kurye gece yedeği
 *   6) Abonelikler: yenileme tarihi yaklaşan ya da geçen hizmetler
 *
 * Yalnızca okur; başka hiçbir tabloya yazmaz. Yazdığı tek yer bu dosyanın kendi sekmeleri.
 *
 * KURULUM (bir kez, sahibin yapacağı):
 *   1) kuruCalistir()   → hiçbir yere yazmadan raporu Günlük'e (Yürütme günlüğü) döker; izin ister, ver.
 *   2) kurulumuTamamla() → KURU kapanır, Abonelikler sekmesi açılır, 15 dakikalık tetikleyici kurulur, ilk kontrol yazılır.
 *   İsteğe bağlı: Proje Ayarları › Komut dosyası özellikleri › MAKE_TOKEN = Make API anahtarı (Make kontrolü için).
 *   Apps Script hatalarını görmek için: https://script.google.com/home/usersettings › "Google Apps Script API" AÇIK.
 */

var NABIZ_ID   = '1Zcvs58MkIX_D2GZZv8q2p6LpFj6_BS42TBMKuU1oNpY';   // BAP Sistem Nabzı (bu proje buna bağlı)
var SAHIP_MAIL = 'mertharman@gmail.com';
var TZ_B       = 'Europe/Istanbul';
// Sipariş gelen saatler (08.10 ilk raporda gece 02:51'de 'Adisyo 4 saattir sessiz' yanlış alarmı → son sipariş ~23:00).
// Muhasebe günü 03:00'te kapansa da sipariş akışı gece yarısı biter. Sahip farklı derse buradan değişir.
var ACILIS_SAAT = 11, KAPANIS_SAAT = 0;          // 11:00–24:00 arası sipariş beklenir
var MAKE_API   = 'https://eu1.make.com/api/v2';
var MAKE_TAKIM = 1385730, MAKE_ORG = 7150039;

// Dosya kimlikleri: docs/veri-sozlugu.md › Dosyalar
var DOSYA_B = {
  STOK:       '1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE',
  SATIS:      '1gdn_rbaevKx9_-pNTRKL1DDtytFxZHr9QF-jrS4cHPE',
  KURYE:      '1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo',
  YEMEKKARTI: '19RVXZQwKZRCW6xnZxSwhRHXte4VWhaVqruaTZRwVJbM',
  TRENDYOL:   '1KLWCEBwFMHCTrTnCYLhv2ctg5PvGtS9DNzoMXF-Z1JE',
  FATURA:     '1JJ6UZzh8rSX1FE9Cr-UPzEAaE-2aKtM10bEvjAv2P5w',
  PERSONEL:   '1WBniOC2h9SvD20bHZl3G4o0f4kUmjbXtIrNvYVyV8Hg',
  ISKAYDI:    '1Lsfaxw71jGeo93AuLovkyFfAfw2H53BsYWKire5COhs',
  WALOG:      '1h8fCPMLUfOKZEAUGq2sTqDU6IRzmniLtgRovZmVK2jg'
};

/* Veri akışları: sekmedeki en yeni tarih ne kadar eski? dk = normalde en geç kaç dakikada bir yeni kayıt gelir.
 * dk aşılırsa UYARI, 2 katı aşılırsa SORUN. acik:true → yalnız işletme açıkken beklenir (gece sessizlik normal).
 * Süreler ilk hafta gözlenip ayarlanacak (Olaylar sekmesinde gereksiz uyarı görülürse buradan büyütülür). */
var AKISLAR = [
  { ad: 'Adisyo siparişleri', grup: 'Satış ve sipariş', dosya: 'SATIS', sekme: 'Satıs Verileri', dk: 90, acik: true,
    nerede: 'Apps Script › Adisyo Sipariş Toplayıcı (birkaç dakikada bir Adisyo\'dan çeker)',
    cozum: 'Apps Script › Adisyo Sipariş Toplayıcı › Yürütmeler ekranında kırmızı satır var mı bak. Adisyo API anahtarı değiştiyse güncellenmeli.' },
  { ad: 'Satıştan stok düşümü', grup: 'Stok ve mutfak', dosya: 'STOK', sekme: 'Satis_Hareketleri', dk: 180, acik: true,
    nerede: 'Apps Script › Stok Takip Sistemi › satış motoru (5 dk\'da bir)',
    cozum: 'Satışlar geliyor ama stok düşmüyorsa satış motoru durmuş olabilir: Stok Takip Sistemi › Yürütmeler.' },
  { ad: 'Mutfak paneli kayıtları', grup: 'Stok ve mutfak', dosya: 'STOK', sekme: 'Stok_Hareketleri', dk: 1440, acik: true,
    nerede: 'Mutfak paneli (bap-sistem.pages.dev) → BAP PANEL Backend',
    cozum: 'Bir günden uzun süredir üretim/sayım/zayi kaydı yoksa mutfağa paneli kullanıp kullanmadıklarını sor; panel açılmıyorsa Web adresleri grubuna bak.' },
  { ad: 'Kurye siparişleri (HemenYolda)', grup: 'Kurye', dosya: 'KURYE', sekme: 'Siparişler', dk: 120, acik: true,
    nerede: 'MacBook köprüsü → Kurye Net Çalışma Süresi (Kopru)',
    cozum: 'MacBook açık ve internete bağlı mı? HemenYolda oturumu düşmüş olabilir.' },
  { ad: 'Kurye mesai kayıtları', grup: 'Kurye', dosya: 'KURYE', sekme: 'Mesai (Ham)', dk: 1560, acik: false,
    nerede: 'Kurye Net Çalışma Süresi (HemenYolda verisi)',
    cozum: 'Kurye Net Çalışma Süresi › Yürütmeler ekranına bak.' },
  { ad: 'Pluxee çekimleri', grup: 'Yemek kartları', dosya: 'YEMEKKARTI', sekme: 'Pluxee', dk: 2880, acik: false,
    nerede: 'MacBook köprüsü (Pluxee) → BAP Yemek Kartı', cozum: 'MacBook\'ta Pluxee programı çalışıyor mu? SMS kodu bekliyor olabilir.' },
  { ad: 'Edenred çekimleri', grup: 'Yemek kartları', dosya: 'YEMEKKARTI', sekme: 'Edenred', dk: 2880, acik: false,
    nerede: 'MacBook köprüsü (edenred.mjs) → BAP Yemek Kartı', cozum: 'MacBook\'ta Edenred programı çalışıyor mu? SMS kodu bekliyor olabilir.' },
  { ad: 'SetCard çekimleri', grup: 'Yemek kartları', dosya: 'YEMEKKARTI', sekme: 'SetCard', dk: 2880, acik: false,
    nerede: 'Apps Script › BAP Yemek Kartı › setcardCek (saatlik)', cozum: 'BAP Yemek Kartı › Yürütmeler. SetCard şifresi değişmiş olabilir.' },
  { ad: 'Metropol çekimleri', grup: 'Yemek kartları', dosya: 'YEMEKKARTI', sekme: 'Metropol', dk: 2880, acik: false,
    nerede: 'MacBook köprüsü (metropol.mjs)', cozum: 'Metropol robot doğrulaması istiyor olabilir: MacBook\'ta bir kez giriş yap.' },
  { ad: 'Multinet çekimleri', grup: 'Yemek kartları', dosya: 'YEMEKKARTI', sekme: 'Multinet', dk: 2880, acik: false,
    nerede: 'MacBook köprüsü (multinet.mjs)', cozum: 'MacBook\'ta Multinet programı çalışıyor mu?' },
  { ad: 'Tokenflex çekimleri', grup: 'Yemek kartları', dosya: 'YEMEKKARTI', sekme: 'Tokenflex', dk: 2880, acik: false,
    nerede: 'Apps Script › BAP Yemek Kartı › tokenflexCek', cozum: 'Tokenflex SMS kodu bekliyor olabilir (iPhone kestirmesi).' },
  { ad: 'Paye işlemleri', grup: 'Yemek kartları', dosya: 'YEMEKKARTI', sekme: 'Paye İşlemler', dk: 2880, acik: false,
    nerede: 'Apps Script › BAP Yemek Kartı › payeMailCek (Gmail\'e gelen Excel)', cozum: 'Paye gün sonu e-postası Gmail\'e geliyor mu bak.' },
  { ad: 'MacBook köprüsü oturumları', grup: 'Yemek kartları', dosya: 'YEMEKKARTI', sekme: 'Mac Oturumları', dk: 2880, acik: false,
    nerede: 'MacBook\'taki zamanlı programlar (mac-kopru)', cozum: 'MacBook uykuda ya da kapalı olabilir; aç ve internete bağla.' },
  { ad: 'Trendyol yorumları', grup: 'Trendyol', dosya: 'TRENDYOL', sekme: 'Degerlendirmeler', dk: 1560, acik: false,
    nerede: 'Apps Script › Trendyol Veri Çekme › yorumlariCek (04:15)', cozum: 'Trendyol Veri Çekme › Yürütmeler. Trendyol API anahtarı süresi dolmuş olabilir.' },
  { ad: 'Trendyol puan raporu', grup: 'Trendyol', dosya: 'TRENDYOL', sekme: 'Puan_Siparis', dk: 1560, acik: false,
    nerede: 'Apps Script › Trendyol Veri Çekme › gunlukPuanRaporu (23:50)', cozum: 'Trendyol Veri Çekme › Yürütmeler.' },
  { ad: 'KolayBi çekimi', grup: 'Finans ve alım', dosya: 'FATURA', sekme: 'Cekim_Log', dk: 1440, acik: false,   // Zaman hücresi yalnız tarih gösterebiliyor → günlük bakılır
    nerede: 'Apps Script › Kolaybi Fatura Ham Veri › kolaybiTumunuCek (2 saatte bir)', cozum: 'Kolaybi Fatura Ham Veri › Yürütmeler. Çekim çalışıyor ama aşağıdaki "yeni fatura" eskiyse KolayBi\'ye fatura girilmiyordur.' },
  // 09.10: Sayfa1 (KolayBi'den gelen ham alış faturaları) en yeni fatura 05.10; çekim çalışıyor, KolayBi'de daha yeni ürünlü alış faturası yok.
  { ad: 'KolayBi yeni fatura', grup: 'Finans ve alım', dosya: 'FATURA', sekme: 'Sayfa1', dk: 4320, acik: false,
    nerede: 'KolayBi › Alış faturaları (ürün satırlı) → Kolaybi Fatura Ham Veri › Sayfa1', cozum: 'Çekim çalışıyorsa sorun KolayBi tarafındadır: tedarikçinin e-faturası KolayBi\'de kabul edilip ürün satırlarıyla alış faturasına çevrilmemiştir.' },
  { ad: 'Personel giriş-çıkış', grup: 'Personel', dosya: 'PERSONEL', sekme: 'Personel_Giris_Cikis', dk: 1440, acik: true,
    nerede: 'BAP_Personel (QR / web giriş)', cozum: 'Personel giriş ekranı açılıyor mu? BAP_Personel › Yürütmeler.' },
  { ad: 'Ajanların iş kaydı', grup: 'Yapay zekâ ajanları', dosya: 'ISKAYDI', sekme: '', dk: 1560, acik: false,
    nerede: 'Claude zamanlanmış görevleri (departman ajanları)', cozum: 'claude.ai › Routines ekranında görevler çalışıyor mu bak; Claude aboneliği ya da kullanım limiti dolmuş olabilir.' },
  { ad: 'WhatsApp konuşmaları', grup: 'WhatsApp ve Make', dosya: 'WALOG', sekme: 'Log', dk: 720, acik: true,
    nerede: 'Make › Integration WhatsApp Business Cloud', cozum: 'Make senaryosu kapalı mı, Meta (WhatsApp) hesabında ödeme sorunu var mı bak.' }
];

// Web adresleri: cevap veriyor mu (5xx ya da hiç cevap yoksa SORUN)
var ADRESLER = [
  { ad: 'Mutfak paneli sayfası', url: 'https://bap-sistem.pages.dev/', nerede: 'Cloudflare Pages › bap-sistem' },
  { ad: 'Mutfak paneli arka ucu', url: 'https://script.google.com/macros/s/AKfycbzczj4XzNQTIJu5NadZTDl6btT-7pOIOV3XNj4ZlsGxYJn7xlW0ks_f7AV-dx3vTi6X/exec?action=getPerformans', json: true, nerede: 'Apps Script › BAP PANEL Backend (performans kaydına yazmayan eylemle yoklanır)' },
  { ad: 'Yönetim paneli', url: 'https://bap-panel.mertharman.workers.dev/', nerede: 'Cloudflare Worker › bap-panel' },
  { ad: 'Yönetim paneli veri kapısı', url: 'https://script.google.com/macros/s/AKfycbz9eMemgKkETtm67d0XeOmXL5l863k30yZsbfclpanEvg_JS7KXueIwe7ZoP1-dbnwP/exec', json: true, nerede: 'Apps Script › BAP Panel Veri Kapısı' },
  { ad: 'Yemek kartı web uygulaması', url: 'https://script.google.com/macros/s/AKfycbx9fcm_VBi6Ug-d1Uf9z-6Yao0AzIePIhasKN_Vv9A6yuBnqR4ZDPvSX_ho9JF-jC1OKA/exec', nerede: 'Apps Script › BAP Yemek Kartı (MacBook ve iPhone kestirmeleri buna bağlanır)' }
];

var ABONELIK_BASLIK = ['Hizmet', 'Ne için', 'Plan / ücret', 'Yenileme tarihi', 'Nereden bakılır'];
var ABONELIK_ORNEK = [
  ['Make.com', 'WhatsApp botu, müşteri memnuniyeti, AI motoru', 'Core', '', 'make.com › Organization › Subscription (aylık işlem kotasını bekçi kendisi okur)'],
  ['Claude', 'Departman ajanları, kod', '', '', 'claude.ai › Settings › Billing'],
  ['ChatGPT / OpenAI', 'Make\'teki AI senaryoları', '', '', 'platform.openai.com › Billing (API kredisi) · chatgpt.com › Plan'],
  ['Anthropic API', 'Make\'teki Claude modülleri', '', '', 'console.anthropic.com › Billing'],
  ['Google One / Drive', 'Bütün tablolar', '', '', 'one.google.com (Drive alanını bekçi kendisi okur)'],
  ['Cloudflare', 'Mutfak ve yönetim paneli', 'Ücretsiz', '', 'dash.cloudflare.com'],
  ['WhatsApp Business (Meta)', 'Bot mesajları', '', '', 'business.facebook.com › Ödemeler'],
  ['Adisyo', 'Kasa / sipariş', '', '', 'Adisyo hesabı'],
  ['KolayBi', 'Fatura', '', '', 'KolayBi hesabı'],
  ['HemenYolda', 'Kurye takibi', '', '', 'HemenYolda hesabı']
];

/* ============================ Giriş noktaları ============================ */

function kuruCalistir() {
  var s = kontrolEt_();
  Logger.log(raporMetni_(s));
  return 'KURU: hiçbir yere yazılmadı. Rapor Yürütme günlüğünde.';
}

function kurulumuTamamla() {
  PropertiesService.getScriptProperties().setProperty('KURU', 'hayir');
  abonelikSekmesiKur();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'bekci') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('bekci').timeBased().everyMinutes(15).create();
  bekci();
  return 'Kuruldu: bekçi 15 dakikada bir çalışacak.';
}

/** Zamanlayıcının çalıştırdığı ana fonksiyon. */
function bekci() {
  var kuru = PropertiesService.getScriptProperties().getProperty('KURU') !== 'hayir';
  var s = kontrolEt_();
  if (kuru) { Logger.log(raporMetni_(s)); return; }
  var ss = SpreadsheetApp.openById(NABIZ_ID);
  var degisim = durumGuncelle_(s);
  durumYaz_(ss, s);
  olaylarYaz_(ss, degisim);
  kalpYaz_(ss, s);
  bildir_(degisim);
}

/* ============================ Kontroller ============================ */

function kontrolEt_() {
  var simdi = new Date(), sonuc = [];
  var ekle = function (r) { r.zaman = simdi; sonuc.push(r); };
  var guvenli = function (ad, f) { try { f(); } catch (e) { ekle({ grup: 'Bekçi', ad: ad, durum: 'UYARI', detay: 'Kontrol çalışmadı: ' + (e && e.message || e), nerede: 'BAP Sistem Bekçisi', cozum: 'Hata sürerse kod incelenmeli.' }); } };

  var acikMi = isletmeAcik_(simdi), acilis = sonAcilis_(simdi);
  var dosyalar = {};
  AKISLAR.forEach(function (a) {
    guvenli(a.ad, function () {
      var ss = dosyalar[a.dosya] || (dosyalar[a.dosya] = SpreadsheetApp.openById(DOSYA_B[a.dosya]));
      var sh = a.sekme ? ss.getSheetByName(a.sekme) : ss.getSheets()[0];
      var r = { grup: a.grup, ad: a.ad, nerede: a.nerede, cozum: a.cozum };
      if (!sh) { r.durum = 'SORUN'; r.detay = '"' + a.sekme + '" sekmesi bulunamadı (adı değişmiş ya da silinmiş olabilir).'; return ekle(r); }
      var t = sonTarih_(sh, simdi);
      if (!t) { r.durum = 'UYARI'; r.detay = 'Sekmede tarih bulunamadı.'; return ekle(r); }
      r.sonVeri = t;
      var referans = a.acik ? Math.max(t.getTime(), acilis.getTime()) : t.getTime();
      var dk = Math.round((simdi.getTime() - referans) / 60000);
      var yas = Math.round((simdi.getTime() - t.getTime()) / 60000);
      if (a.acik && !acikMi) { r.durum = 'OK'; r.detay = 'İşletme kapalı. Son kayıt ' + sureMetni_(yas) + '.'; }
      else if (dk > a.dk * 2) { r.durum = 'SORUN'; r.detay = 'Son kayıt ' + sureMetni_(yas) + '. Normalde en geç ' + sureMetni_(a.dk, true) + ' içinde yeni kayıt gelir.'; }
      else if (dk > a.dk) { r.durum = 'UYARI'; r.detay = 'Son kayıt ' + sureMetni_(yas) + ' (beklenen: ' + sureMetni_(a.dk, true) + ').'; }
      else { r.durum = 'OK'; r.detay = 'Son kayıt ' + sureMetni_(yas) + '.'; }
      ekle(r);
    });
  });

  guvenli('Kurye gece yedeği', function () { ekle(geceYedegi_(simdi)); });
  guvenli('Gece ZIP yedeği', function () { ekle(zipYedegi_(simdi)); });
  guvenli('Apps Script çalışmaları', function () { scriptHatalari_(simdi).forEach(ekle); });
  guvenli('Make', function () { makeKontrol_(simdi).forEach(ekle); });
  ADRESLER.forEach(function (a) { guvenli(a.ad, function () { ekle(adresKontrol_(a)); }); });
  guvenli('Google hesabı', function () { googleKotalar_().forEach(ekle); });
  guvenli('Abonelikler', function () { abonelikKontrol_(simdi).forEach(ekle); });
  return sonuc;
}

// Sekmenin ilk ve son 40 satırındaki en yeni tarih (bazı sekmeler yeni kaydı en üste, bazıları en alta yazar).
function sonTarih_(sh, simdi) {
  var son = sh.getLastRow(), sut = Math.min(sh.getLastColumn(), 40);
  if (son < 2 || sut < 1) return null;
  var parcalar = [sh.getRange(2, 1, Math.min(40, son - 1), sut).getValues()];
  if (son > 41) parcalar.push(sh.getRange(Math.max(2, son - 39), 1, Math.min(40, son - 1), sut).getValues());
  var ust = simdi.getTime() + 6 * 3600000, alt = new Date(2020, 0, 1).getTime(), en = null;
  parcalar.forEach(function (v) {
    v.forEach(function (satir) {
      satir.forEach(function (h) {
        var t = tarihOku_(h);
        if (!t) return;
        var ms = t.getTime();
        // yalnız tarih (saat 00:00) → o günün sonu sayılır; günlük veriler gece yarısı "eski" görünmesin
        if (t.getHours() === 0 && t.getMinutes() === 0 && t.getSeconds() === 0) ms += 86399000;
        if (ms > ust || ms < alt) return;
        if (en === null || ms > en) en = ms;
      });
    });
  });
  return en === null ? null : new Date(Math.min(en, simdi.getTime()));
}

function tarihOku_(h) {
  if (Object.prototype.toString.call(h) === '[object Date]') return isNaN(h.getTime()) ? null : h;
  if (typeof h !== 'string' || h.length < 8 || h.length > 40) return null;
  var m = h.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = h.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    if (/Z|[+-]\d{2}:?\d{2}$/.test(h)) { var d = new Date(h); return isNaN(d.getTime()) ? null : d; }
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  return null;
}

function geceYedegi_(simdi) {
  var r = { grup: 'Yedekler', ad: 'Kurye gece yedeği', nerede: 'Drive › BAP Yedek — Kurye Tablosu (Kurye Net Çalışma Süresi, her gece)',
            cozum: 'Kurye Net Çalışma Süresi › Yürütmeler ekranında gece yedeği hata veriyor mu bak.' };
  var it = DriveApp.getFoldersByName('BAP Yedek — Kurye Tablosu');
  if (!it.hasNext()) { r.durum = 'UYARI'; r.detay = 'Yedek klasörü bulunamadı.'; return r; }
  var dosyalar = it.next().getFiles(), en = null;
  while (dosyalar.hasNext()) { var t = dosyalar.next().getDateCreated(); if (!en || t > en) en = t; }
  if (!en) { r.durum = 'SORUN'; r.detay = 'Klasörde hiç yedek yok.'; return r; }
  var saat = (simdi - en) / 3600000;
  r.sonVeri = en;
  r.durum = saat > 50 ? 'SORUN' : saat > 30 ? 'UYARI' : 'OK';
  r.detay = 'Son yedek ' + sureMetni_(Math.round(saat * 60)) + '.';
  return r;
}

// Gece ZIP yedeği: 10 ana tablonun xlsx kopyası, her gece 03:00 (ayrı proje: BAP Sistem Nabzı + Yedekleme v3 › yedekZipAl).
// Yalnız eksiksiz yedek "BAP_YEDEK_yyyy-MM-dd.zip" adıyla yazılır; kısmi yedekte dosya hiç oluşmaz.
var ZIP_YEDEK_KLASOR = '1GXCIojyM13z01MvSZSgVAA8e92FbbnSe';
function zipYedegi_(simdi) {
  var r = { grup: 'Yedekler', ad: 'Gece ZIP yedeği (10 ana tablo)', nerede: 'Drive › yedek klasörü · Apps Script › yedekZipAl (03:00)',
            cozum: 'Yedek projesinin Yürütmeler ekranına bak. "KISMİ/HATALI" yazıyorsa bir tablo bulunamamıştır (adı değişmiş ya da aynı adda iki dosya var).' };
  var en = null, ad = '', it = DriveApp.getFolderById(ZIP_YEDEK_KLASOR).getFiles();
  while (it.hasNext()) {
    var f = it.next(), m = f.getName().match(/^BAP_YEDEK_\d{4}-\d{2}-\d{2}\.zip$/);
    if (m && !f.isTrashed() && (!en || f.getDateCreated() > en)) { en = f.getDateCreated(); ad = f.getName() + ' · ' + Math.round(f.getSize() / 1048576) + ' MB'; }
  }
  if (!en) { r.durum = 'SORUN'; r.detay = 'Klasörde hiç tam yedek (BAP_YEDEK_….zip) yok.'; return r; }
  var saat = (simdi - en) / 3600000;
  r.sonVeri = en;
  r.durum = saat > 50 ? 'SORUN' : saat > 30 ? 'UYARI' : 'OK';
  r.detay = 'Son tam yedek ' + sureMetni_(Math.round(saat * 60)) + ' (' + ad + ').';
  return r;
}

// Apps Script API › processes.list: bu hesabın bütün projelerindeki hatalı çalışmalar (son 24 saat).
function scriptHatalari_(simdi) {
  var bas = new Date(simdi.getTime() - 24 * 3600000).toISOString();
  var url = 'https://script.googleapis.com/v1/processes?pageSize=200'
    + '&userProcessFilter.startTime=' + encodeURIComponent(bas)
    + '&userProcessFilter.statuses=FAILED&userProcessFilter.statuses=TIMED_OUT';
  var cev = gapi_(url);
  // Bekçinin varsayılan Google Cloud projesinde Apps Script API açılamıyor (sahibin o projeye erişimi yok, T13).
  // Bu durumda satır hiç yazılmaz: kalıcı bir uyarı gürültü olur. Durmalar yine veri akışı kontrollerinden yakalanır.
  if (cev.hata && /has not been used in project|is disabled|PERMISSION_DENIED|403/.test(cev.hata)) { Logger.log('Apps Script API kapalı, hata kayıtları atlandı (T13).'); return []; }
  if (cev.hata) return [{ grup: 'Apps Script', ad: 'Apps Script çalışma kayıtları', durum: 'UYARI', detay: 'Okunamadı: ' + cev.hata,
    nerede: 'Google Apps Script API', cozum: 'https://script.google.com/home/usersettings adresinde "Google Apps Script API" ayarını AÇIK yap. Açıksa bekçi projesinde kurulumuTamamla() bir kez daha çalıştırılıp izin verilmeli.' }];
  var gruplar = {};
  (cev.veri.processes || []).forEach(function (p) {
    if (p.functionName === 'bekci') return;
    var k = (p.projectName || '?') + ' › ' + (p.functionName || '?');
    var g = gruplar[k] || (gruplar[k] = { proje: p.projectName || '?', fn: p.functionName || '?', sayi: 0, son: null, tur: p.processType, zamanAsimi: 0 });
    g.sayi++; if (p.processStatus === 'TIMED_OUT') g.zamanAsimi++;
    var t = new Date(p.startTime); if (!g.son || t > g.son) g.son = t;
  });
  var out = Object.keys(gruplar).map(function (k) {
    var g = gruplar[k];
    // aynı fonksiyonun en son çalışması da hatalı mı? (hâlâ duruyor mu, yoksa bir kez hata verip düzeldi mi)
    var son = gapi_('https://script.googleapis.com/v1/processes?pageSize=1&userProcessFilter.functionName=' + encodeURIComponent(g.fn)
      + '&userProcessFilter.projectName=' + encodeURIComponent(g.proje));
    var sonDurum = son.veri && son.veri.processes && son.veri.processes[0] ? son.veri.processes[0].processStatus : null;
    var hala = sonDurum === 'FAILED' || sonDurum === 'TIMED_OUT';
    return { grup: 'Apps Script', ad: g.proje + ' › ' + g.fn,
      durum: hala && (g.sayi >= 2 || g.tur === 'TIME_DRIVEN') ? 'SORUN' : 'UYARI',
      detay: 'Son 24 saatte ' + g.sayi + ' kez ' + (g.zamanAsimi ? 'hata / zaman aşımı (' + g.zamanAsimi + ' zaman aşımı)' : 'hata verdi') +
             '. Son hata ' + sureMetni_(Math.round((simdi - g.son) / 60000)) + '. ' + (hala ? 'En son çalışması da hatalı: hâlâ duruyor.' : 'Sonraki çalışması başarılı: kendiliğinden düzelmiş.'),
      sonVeri: g.son, nerede: 'Apps Script › ' + g.proje + ' › ' + g.fn + ' (' + turMetni_(g.tur) + ')',
      cozum: 'script.google.com › ' + g.proje + ' › Yürütmeler: kırmızı satırın hata mesajını oku. "Authorization" yazıyorsa projeyi bir kez elle çalıştırıp izin ver; "Service invoked too many times" ise Google kotası dolmuştur, yarın kendiliğinden düzelir.' };
  });
  if (!out.length) out.push({ grup: 'Apps Script', ad: 'Apps Script çalışmaları', durum: 'OK', detay: 'Son 24 saatte hata veren çalışma yok.', nerede: 'Bütün Apps Script projeleri' });
  return out;
}

function makeKontrol_(simdi) {
  var token = PropertiesService.getScriptProperties().getProperty('MAKE_TOKEN');
  if (!token) return [{ grup: 'WhatsApp ve Make', ad: 'Make bağlantısı', durum: 'UYARI', detay: 'Make anahtarı girilmemiş; senaryolar izlenemiyor.',
    nerede: 'BAP Sistem Bekçisi › Komut dosyası özellikleri', cozum: 'make.com › Profil › API access › Add token (scenarios:read, organizations:read). Çıkan anahtarı bekçi projesinde MAKE_TOKEN adıyla kaydet.' }];
  var out = [];
  var org = makeGet_(token, '/organizations/' + MAKE_ORG);
  if (org.hata) out.push({ grup: 'Hesaplar ve krediler', ad: 'Make hesabı', durum: 'UYARI', detay: 'Okunamadı: ' + org.hata, nerede: 'make.com' });
  else {
    var o = org.veri.organization || org.veri, kota = Number(o.license && o.license.operations) || 0, kul = Number(o.operations) || 0;
    var bas = new Date(o.lastReset), bit = new Date(o.nextReset);
    var gecen = Math.max(0.5, (simdi - bas) / 86400000), toplam = Math.max(1, (bit - bas) / 86400000);
    var tahmin = Math.round(kul / gecen * toplam), oran = kota ? kul / kota : 0;
    out.push({ grup: 'Hesaplar ve krediler', ad: 'Make aylık işlem kotası',
      durum: o.isPaused ? 'SORUN' : (oran >= 0.95 ? 'SORUN' : (oran >= 0.8 || (kota && tahmin > kota) ? 'UYARI' : 'OK')),
      detay: (o.isPaused ? 'Make hesabı DURAKLATILMIŞ. ' : '') + kul.toLocaleString('tr-TR') + ' / ' + kota.toLocaleString('tr-TR') + ' işlem kullanıldı (%' + Math.round(oran * 100) + '). ' +
             'Bu hızla ay sonunda ≈ ' + tahmin.toLocaleString('tr-TR') + '. Yenilenme: ' + Utilities.formatDate(bit, TZ_B, 'dd.MM.yyyy') + '.' +
             (o.autoPurchasingActivated ? ' Kota bitince otomatik ek paket alınıyor (ücret çıkar).' : ''),
      nerede: 'make.com › Organization › Subscription', cozum: 'Kota yetmeyecekse en çok işlem harcayan senaryolar: WhatsApp entegrasyonu ve memnuniyet mesajı.',
      olcu: { kullanilan: kul, kota: kota, tahmin: tahmin } });
  }
  var sc = makeGet_(token, '/scenarios?teamId=' + MAKE_TAKIM + '&pg%5Blimit%5D=200');
  if (sc.hata) { out.push({ grup: 'WhatsApp ve Make', ad: 'Make senaryoları', durum: 'UYARI', detay: 'Okunamadı: ' + sc.hata, nerede: 'make.com' }); return out; }
  var kredi = /credit|quota|insufficient|billing|balance|exceeded|payment|402|429|rate.?limit/i;
  (sc.veri.scenarios || []).forEach(function (s) {
    if (!s.isActive && !s.isinvalid) return;   // bilerek kapatılanlar izlenmez
    var r = { grup: 'WhatsApp ve Make', ad: 'Make › ' + s.name, nerede: 'make.com › Scenarios › ' + s.name + ' (#' + s.id + ')',
              cozum: 'Make\'te senaryoyu aç › History: kırmızı çalışmanın hata mesajını oku.' };
    if (s.isinvalid) { r.durum = 'SORUN'; r.detay = 'Senaryo bozuk (Make "invalid" diyor): bir modülün ayarı ya da bağlantısı geçersiz.'; return out.push(r); }
    if (s.isPaused) { r.durum = 'SORUN'; r.detay = 'Senaryo Make tarafından durdurulmuş (art arda hata).'; return out.push(r); }
    var log = makeGet_(token, '/scenarios/' + s.id + '/logs?pg%5Blimit%5D=5&pg%5BsortDir%5D=desc');
    var l = (log.veri && (log.veri.scenarioLogs || log.veri.logs)) || [];
    var calisma = l.filter(function (x) { return x.status === 1 || x.status === 2 || x.status === 3; });
    var son = calisma[0];
    if (s.dlqCount > 0) { r.durum = 'UYARI'; r.detay = s.dlqCount + ' tamamlanamamış çalışma bekliyor (Incomplete executions).'; }
    if (son && son.status === 3) {
      var msj = String((son.error && (son.error.message || son.error.name)) || son.message || '').slice(0, 220);
      r.durum = 'SORUN';
      r.detay = 'Son çalışma hata verdi (' + sureMetni_(Math.round((simdi - new Date(son.timestamp || simdi)) / 60000)) + ')' + (msj ? ': ' + msj : '.');
      if (kredi.test(msj)) { r.grup = 'Hesaplar ve krediler'; r.detay = 'Kredi / kota bitmiş görünüyor. ' + r.detay; r.cozum = 'Hata mesajındaki hizmetin (OpenAI, Anthropic, Gemini, WhatsApp) faturalama sayfasından kredi yükle.'; }
      r.sonVeri = son.timestamp ? new Date(son.timestamp) : null;
      return out.push(r);
    }
    if (!r.durum) { r.durum = 'OK'; r.detay = son ? 'Son çalışma başarılı (' + sureMetni_(Math.round((simdi - new Date(son.timestamp)) / 60000)) + ').' : 'Açık; yakın zamanda çalışma yok (tetiklenince çalışır).'; }
    out.push(r);
  });
  return out;
}

function adresKontrol_(a) {
  var r = { grup: 'Web adresleri', ad: a.ad, nerede: a.nerede, cozum: 'Adresi telefondan açmayı dene. Apps Script adresiyse son yayın (GitHub › Actions) kırmızı mı bak.' };
  var t0 = Date.now(), cev;
  try { cev = UrlFetchApp.fetch(a.url, { muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: true }); }
  catch (e) { r.durum = 'SORUN'; r.detay = 'Cevap yok: ' + (e && e.message || e); return r; }
  var kod = cev.getResponseCode(), ms = Date.now() - t0;
  if (kod >= 500) { r.durum = 'SORUN'; r.detay = 'Sunucu hatası (' + kod + ').'; return r; }
  if (a.json) {
    var metin = cev.getContentText();
    try { JSON.parse(metin); }
    catch (e) { r.durum = 'SORUN'; r.detay = 'Cevap veri değil (' + kod + '): ' + (/Sayfa bulunamad|not found|Bulunamad/i.test(metin) ? 'Apps Script dağıtımı bulunamadı.' : metin.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 120)); return r; }
  }
  r.durum = ms > 20000 ? 'UYARI' : 'OK';
  r.detay = (kod < 400 ? 'Cevap veriyor' : 'Açık (giriş istiyor, ' + kod + ')') + ', ' + (ms / 1000).toFixed(1) + ' sn.' + (ms > 20000 ? ' Çok yavaş.' : '');
  return r;
}

function googleKotalar_() {
  var out = [];
  var kul = DriveApp.getStorageUsed(), lim = DriveApp.getStorageLimit();
  if (lim > 0) {
    var oran = kul / lim;
    out.push({ grup: 'Hesaplar ve krediler', ad: 'Google Drive alanı', durum: oran >= 0.95 ? 'SORUN' : oran >= 0.85 ? 'UYARI' : 'OK',
      detay: gb_(kul) + ' / ' + gb_(lim) + ' dolu (%' + Math.round(oran * 100) + ').' + (oran >= 0.95 ? ' Alan dolarsa tablolara yazılamaz, sistem durur!' : ''),
      nerede: 'Google hesabı (' + SAHIP_MAIL + ')', cozum: 'one.google.com › Depolama: büyük dosyaları (yedekler, Gmail ekleri) temizle ya da alanı büyüt.',
      olcu: { kullanilan: kul, kota: lim } });
  }
  var mail = MailApp.getRemainingDailyQuota();
  out.push({ grup: 'Hesaplar ve krediler', ad: 'Google günlük e-posta kotası', durum: mail < 10 ? 'UYARI' : 'OK',
    detay: 'Bugün ' + mail + ' e-posta daha gönderilebilir.', nerede: 'Google Apps Script kotaları', cozum: 'Gece yarısından sonra kendiliğinden yenilenir.' });
  return out;
}

function abonelikKontrol_(simdi) {
  var sh = SpreadsheetApp.openById(NABIZ_ID).getSheetByName('Abonelikler');
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), b = v[0].map(String);
  var cH = b.indexOf('Hizmet'), cT = b.indexOf('Yenileme tarihi'), cP = b.indexOf('Plan / ücret'), cN = b.indexOf('Nereden bakılır');
  if (cH < 0 || cT < 0) return [];
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var ad = String(v[i][cH] || '').trim(), t = tarihOku_(v[i][cT]);
    if (!ad || !t) continue;
    var gun = Math.floor((t - simdi) / 86400000);
    out.push({ grup: 'Abonelikler', ad: ad, durum: gun < 0 ? 'SORUN' : gun <= 7 ? 'UYARI' : 'OK',
      detay: (cP >= 0 && v[i][cP] ? v[i][cP] + ' · ' : '') + (gun < 0 ? 'Yenileme tarihi ' + (-gun) + ' gün önce geçti: ödeme yapıldı mı? Yapıldıysa tarihi güncelle.' : gun === 0 ? 'Bugün yenileniyor.' : gun + ' gün sonra yenileniyor (' + Utilities.formatDate(t, TZ_B, 'dd.MM.yyyy') + ').'),
      nerede: cN >= 0 ? String(v[i][cN] || '') : '', cozum: 'Kartın limiti ve son kullanma tarihi yeterli mi kontrol et; yenilenince bu satırdaki tarihi bir sonraki döneme çek.' });
  }
  return out;
}

/* ============================ Durum, olaylar, bildirim ============================ */

// Her sistemin önceki durumu Script Properties'te: { "Grup|Ad": { d: 'SORUN', bas: ms, kez: 2, bildirildi: true } }
function durumGuncelle_(s) {
  var p = PropertiesService.getScriptProperties(), eski = {};
  try { eski = JSON.parse(p.getProperty('DURUM') || '{}'); } catch (e) { eski = {}; }
  var yeni = {}, degisim = [], simdi = Date.now();
  s.forEach(function (r) {
    var k = r.grup + '|' + r.ad, o = eski[k];
    if (o && o.d === r.durum) { yeni[k] = { d: o.d, bas: o.bas, kez: (o.kez || 1) + 1, bildirildi: o.bildirildi }; }
    else {
      yeni[k] = { d: r.durum, bas: simdi, kez: 1, bildirildi: false };
      if (o || r.durum !== 'OK') degisim.push({ r: r, eski: o ? o.d : '—' });
    }
    r.beri = new Date(yeni[k].bas);
    // SORUN art arda 2 kontrolde (≈30 dk) sürerse bir kez e-posta; düzelince bir kez daha
    if (r.durum === 'SORUN' && yeni[k].kez >= 2 && !yeni[k].bildirildi) { yeni[k].bildirildi = true; r.bildir = 'sorun'; }
    if (o && o.d === 'SORUN' && o.bildirildi && r.durum === 'OK') r.bildir = 'duzeldi';
  });
  Object.keys(eski).forEach(function (k) { if (!yeni[k] && eski[k].d !== 'OK') degisim.push({ r: { grup: k.split('|')[0], ad: k.split('|')[1], durum: 'KALKTI', detay: 'Artık izlenmiyor (senaryo kapatıldı ya da hata listesinden düştü).' }, eski: eski[k].d }); });
  p.setProperty('DURUM', JSON.stringify(yeni));
  return { degisim: degisim, sonuc: s };
}

var DURUM_BASLIK = ['Sistem', 'Durum', 'Detay', 'Grup', 'Nerede', 'Ne yapmalı', 'Ne zamandan beri', 'Son veri'];
var SIRA = { SORUN: 0, UYARI: 1, OK: 2 };

function durumYaz_(ss, s) {
  var sh = ss.getSheetByName('Durum') || ss.insertSheet('Durum', 0);
  var sirali = s.slice().sort(function (a, b) { return (SIRA[a.durum] - SIRA[b.durum]) || a.grup.localeCompare(b.grup, 'tr') || a.ad.localeCompare(b.ad, 'tr'); });
  var sorun = s.filter(function (r) { return r.durum === 'SORUN'; }).length, uyari = s.filter(function (r) { return r.durum === 'UYARI'; }).length;
  var ust = [
    ['Son kontrol: ' + Utilities.formatDate(new Date(), TZ_B, 'dd.MM.yyyy HH:mm'), '', '', '', '', '', '', ''],
    [sorun ? sorun + ' sorun' + (uyari ? ', ' + uyari + ' uyarı' : '') : uyari ? uyari + ' uyarı' : 'Her şey çalışıyor', '', '', '', '', '', '', ''],
    DURUM_BASLIK
  ];
  var satirlar = sirali.map(function (r) {
    return [r.ad, r.durum, r.detay || '', r.grup, r.nerede || '', r.cozum || '',
            r.beri ? Utilities.formatDate(r.beri, TZ_B, 'dd.MM.yyyy HH:mm') : '', r.sonVeri ? Utilities.formatDate(r.sonVeri, TZ_B, 'dd.MM.yyyy HH:mm') : ''];
  });
  var hepsi = ust.concat(satirlar);
  // Durum sekmesi her kontrolde baştan yazılır (bu dosyanın kendi çıktısı; başka yerden veri silinmez)
  sh.getRange(1, 1, Math.max(sh.getMaxRows(), 1), DURUM_BASLIK.length).clearContent().setBackground(null);
  sh.getRange(1, 1, hepsi.length, DURUM_BASLIK.length).setValues(hepsi);
  sh.getRange(1, 1, 2, 1).setFontWeight('bold');
  sh.getRange(3, 1, 1, DURUM_BASLIK.length).setFontWeight('bold');
  sh.setFrozenRows(3);
  var renk = { SORUN: '#F5E1DC', UYARI: '#F6ECD9', OK: '#E4F0E7' };
  if (satirlar.length) sh.getRange(4, 2, satirlar.length, 1).setBackgrounds(satirlar.map(function (r) { return [renk[r[1]] || null]; }));
}

function olaylarYaz_(ss, d) {
  if (!d.degisim.length) return;
  var sh = ss.getSheetByName('Olaylar');
  if (!sh) { sh = ss.insertSheet('Olaylar'); sh.appendRow(['Zaman', 'Grup', 'Sistem', 'Önceki', 'Yeni', 'Detay', 'Nerede']); sh.setFrozenRows(1); sh.getRange(1, 1, 1, 7).setFontWeight('bold'); }
  var z = Utilities.formatDate(new Date(), TZ_B, 'dd.MM.yyyy HH:mm');
  var satir = d.degisim.map(function (x) { return [z, x.r.grup, x.r.ad, x.eski, x.r.durum, x.r.detay || '', x.r.nerede || '']; });
  sh.getRange(sh.getLastRow() + 1, 1, satir.length, 7).setValues(satir);
}

function kalpYaz_(ss, s) {
  var sh = ss.getSheetByName('Kalp') || ss.insertSheet('Kalp');
  var yedek = s.filter(function (r) { return r.ad === 'Gece ZIP yedeği (10 ana tablo)'; })[0];
  var f = function (t) { return t ? Utilities.formatDate(t, TZ_B, 'dd.MM.yyyy HH:mm') : ''; };
  sh.getRange(1, 1, 3, 3).setValues([
    ['Kalp', 'Son zaman', 'Not'],
    ['Bekçi', f(new Date()), s.length + ' kontrol'],
    ['Gece yedeği', f(yedek && yedek.sonVeri), yedek ? yedek.detay : 'okunamadı']
  ]);
  sh.getRange(1, 1, 1, 3).setFontWeight('bold');
}

function bildir_(d) {
  var sorun = d.sonuc.filter(function (r) { return r.bildir === 'sorun'; }), duzelen = d.sonuc.filter(function (r) { return r.bildir === 'duzeldi'; });
  if (!sorun.length && !duzelen.length) return;
  var metin = [];
  if (sorun.length) {
    metin.push('DURAN / SORUNLU (' + sorun.length + ')', '');
    sorun.forEach(function (r) { metin.push('■ ' + r.ad + ' [' + r.grup + ']', '  Ne oldu: ' + r.detay, '  Nerede: ' + (r.nerede || '-'), '  Ne yapmalı: ' + (r.cozum || '-'), ''); });
  }
  if (duzelen.length) { metin.push('DÜZELEN (' + duzelen.length + ')', ''); duzelen.forEach(function (r) { metin.push('✓ ' + r.ad + ': ' + r.detay); }); }
  metin.push('', 'Bütün liste: yönetim paneli › Sistem Sağlığı · https://docs.google.com/spreadsheets/d/' + NABIZ_ID);
  var konu = sorun.length ? 'BAP · ' + sorun.length + ' sistem durdu: ' + sorun.map(function (r) { return r.ad; }).slice(0, 3).join(', ') : 'BAP · Düzeldi: ' + duzelen.map(function (r) { return r.ad; }).slice(0, 3).join(', ');
  try { MailApp.sendEmail({ to: SAHIP_MAIL, subject: konu, body: metin.join('\n') }); } catch (e) { Logger.log('E-posta gönderilemedi: ' + e.message); }
}

function raporMetni_(s) {
  return s.map(function (r) { return '[' + r.durum + '] ' + r.grup + ' › ' + r.ad + ': ' + (r.detay || ''); }).join('\n');
}

/* ============================ Yardımcılar ============================ */

function gapi_(url) {
  try {
    var r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    var kod = r.getResponseCode(), m = r.getContentText();
    if (kod !== 200) { var j = {}; try { j = JSON.parse(m); } catch (e) {} return { hata: kod + ' ' + ((j.error && j.error.message) || m.slice(0, 160)) }; }
    return { veri: JSON.parse(m) };
  } catch (e) { return { hata: String(e && e.message || e) }; }
}

function makeGet_(token, yol) {
  try {
    var r = UrlFetchApp.fetch(MAKE_API + yol, { headers: { Authorization: 'Token ' + token }, muteHttpExceptions: true });
    var kod = r.getResponseCode(), m = r.getContentText();
    if (kod === 401 || kod === 403) return { hata: 'Make anahtarı geçersiz ya da yetkisi eksik (' + kod + ').' };
    if (kod !== 200) return { hata: kod + ' ' + m.slice(0, 160) };
    return { veri: JSON.parse(m) };
  } catch (e) { return { hata: String(e && e.message || e) }; }
}

function isletmeAcik_(t) { var h = Number(Utilities.formatDate(t, TZ_B, 'H')); return h >= ACILIS_SAAT || h < KAPANIS_SAAT; }

// En son açılış anı (bugün 10:00; gece 00:00–03:00 arası ise dün 10:00)
function sonAcilis_(t) {
  var h = Number(Utilities.formatDate(t, TZ_B, 'H'));
  var gun = Utilities.formatDate(new Date(t.getTime() - (h < ACILIS_SAAT ? 86400000 : 0)), TZ_B, 'yyyy-MM-dd');
  return Utilities.parseDate(gun + ' ' + (ACILIS_SAAT < 10 ? '0' : '') + ACILIS_SAAT + ':00', TZ_B, 'yyyy-MM-dd HH:mm');
}

function sureMetni_(dk, sure) {
  if (dk == null) return 'bilinmiyor';
  var s;
  if (dk < 1) s = sure ? '1 dakika' : 'az önce';
  else if (dk < 60) s = dk + ' dakika';
  else if (dk < 48 * 60) s = Math.round(dk / 60) + ' saat';
  else s = Math.round(dk / 1440) + ' gün';
  return sure || dk < 1 ? s : s + ' önce';
}

function gb_(b) { return (b / 1073741824).toFixed(1).replace('.', ',') + ' GB'; }

function turMetni_(t) {
  return { TIME_DRIVEN: 'zamanlayıcı', WEBAPP: 'web uygulaması', MENU: 'tablo menüsü', EDITOR: 'editörden elle', SIMPLE_TRIGGER: 'otomatik (onEdit/onOpen)',
           TRIGGER: 'tetikleyici', EXECUTION_API: 'dışarıdan çağrı', ADD_ON: 'eklenti' }[t] || (t || '');
}

/** Abonelikler sekmesini (yoksa) örnek satırlarla kurar. Tarihleri sahibi doldurur. */
function abonelikSekmesiKur() {
  var ss = SpreadsheetApp.openById(NABIZ_ID);
  if (ss.getSheetByName('Abonelikler')) return 'Abonelikler sekmesi zaten var.';
  var sh = ss.insertSheet('Abonelikler');
  sh.getRange(1, 1, 1, ABONELIK_BASLIK.length).setValues([ABONELIK_BASLIK]).setFontWeight('bold');
  sh.getRange(2, 1, ABONELIK_ORNEK.length, ABONELIK_BASLIK.length).setValues(ABONELIK_ORNEK);
  sh.getRange(2, 4, ABONELIK_ORNEK.length, 1).setNumberFormat('dd.mm.yyyy');
  sh.setFrozenRows(1);
  return 'Abonelikler sekmesi kuruldu: "Yenileme tarihi" sütununu doldur.';
}
