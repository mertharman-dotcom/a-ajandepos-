/**
 * BAP – Adisyo Sipariş Toplayıcı (Apps Script)  v1
 * ------------------------------------------------
 * Make "adisyo_webhook" senaryosunun yerine geçer. 5 dakikada bir:
 *   1) Adisyo'daki AÇIK siparişleri çeker (tek istek) → yeni olanları Make.com Data'ya yazar (Durum=AÇIK)
 *      + Ana Musteri Listesi upsert + Telafi_Listesi kontrolü
 *   2) Açık listeden DÜŞEN siparişleri Adisyo'dan tek tek sorar (3 sn arayla) → kapandıysa satırı günceller
 *      (teslim tarihi, hazırlanma, Tarih_ISO, Durum=KAPALI; ödeme değiştiyse Not + mail),
 *      iptal olduysa Durum=İPTAL + Not + mail
 *
 * KURULUM
 *  1. "BAP veri tablosu" e-tablosu → Uzantılar → Apps Script → bu dosyayı yapıştır
 *  2. Proje ayarları → Saat dilimi: (GMT+03:00) Istanbul
 *  3. CONFIG'i doldur (Adisyo anahtarları Make'teki HTTP modülüyle aynı)
 *  4. `ilkKurulum` çalıştır (başlık/sekme kontrolü + 5 dk tetikleyici)
 *  5. `testCalistir` ile dene. TEST_MODE açıkken Make paralel çalışmaya devam eder.
 *  6. Bir hafta sonra: TEST_MODE=false yap + Make'teki adisyo_webhook'u KAPAT (mükerrer olmasın)
 */

const CONFIG = {
  ADISYO_BASE: 'https://ext.adisyo.com/api/External/v2',
  ADISYO_HEADERS: {
    'x-api-key':      '25b80b3556ca3a15353dd2fd312062fad27adcf5a1de51b75bdadea1fa8214ab',
    'x-api-secret':   '8c16f189-8099-4ce0-b7c1-c40c0131501c',
    'x-api-consumer': '932ab8c-8846-ad07-sca0-6b70af18cb6f-d6c524f3-9ea3-42ce-90b0-89973d0c0d2',
  },

  // TEST_MODE: true → ayrı test tablosuna yazar, müşteri DB'ye dokunmaz (Make paralel çalışabilir)
  //            false → canlı Make.com Data'ya yazar (o zaman Make senaryosu KAPALI olmalı)
  TEST_MODE: true,
  TEST_SS_ADI: 'BAP Adisyo Test Verisi',   // script ilk çalışmada kendisi oluşturur

  // Eski canlı sipariş tablosu (Make'in yazdığı; eskiVeriyiDonustur bunu okur)
  DATA_SS_ID: '152FdGaQUhwyd0ytcTbM1OI6beNZsXBJhCM-GoG2Bzvw',
  ESKI_DATA_SHEET: 'Make.com Data',
  // Yeni ana sipariş sekmesi (bu tabloda)
  DATA_SHEET: 'Satıs Verileri',

  // Müşteri veritabanı + telafi listesi
  MUSTERI_SS_ID: '1dcjX3o-6N9b8ndKt8ALj9MxLg-KZ3I16Z6DI-S9oV1Q',
  MUSTERI_SHEET: 'Ana Musteri Listesi',
  TELAFI_SHEET: 'Telafi_Listesi',

  // Ayar tablosu: "Ödeme yöntemleri" sekmesi, D sütunu TRUE = online / takip dışı (doğrudan Ödeme Alındı)
  AYAR_SS_ID: '1rcOUvokeb0VG3mm72-IKV1-bk0WugEcNSvDaHz41pP8',
  ODEME_SHEET: 'Ödeme yöntemleri',
  MAHALLE_SHEET: 'Mahalle_Sube',   // A Mahalle, B Tam ad, C Gönderim_Yapan_Sube
  GEOCODE: true,                   // mahalle listeden çıkmazsa Google geocoder dene

  // HemenYolda kurye takip tablosu (tahsilat durumu buradan okunur)
  HY_SS_ID: '1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo',
  HY_SIPARIS_SHEET: 'Siparişler',
  HY_ACIK_SHEET: 'Açık Hesaplar',
  TAHSIL_GERI_GUN: 14,            // tahsil senkronu kaç günlük siparişe bakar

  // Bildirim
  NOTIFY_EMAIL: 'mertharman@gmail.com',
      MAKE_WEBHOOK_URL: 'https://hook.eu1.make.com/6wgq4uajtmy8p7vsl3u7j1rwei70cy58',  // BAP Bildirim - Script WA → WA mesajı

  // Tamamlanmış siparişler ucu (masa + gel-al + paket, iptaller dahil). Ad belirsizse testTamamlananUcu çalıştır.
  TAMAMLANAN_PATH: '/CompletedOrders',
  TAMAMLANAN_GERI_SAAT: 2,        // her turda son N saatin tamamlanan siparişleri taranır

  // Davranış
  ISTEK_ARASI_MS: 3000,           // Adisyo rate limit: ardışık istekler arası bekleme
  KAPALI_STATUS_ID: 7,            // Adisyo: 7 = kapalı (Make senaryosundaki filtreyle aynı)
  IPTAL_STATUS_IDS: [8, 9, 10],   // iptal/red sayılacak statusId'ler — ilk iptalde loga bakıp düzelt
  ACIK_MAX_SAAT: 6,               // 6 saattir açık duran sipariş kapanmadıysa da takibi bırak (Not düşer)

  DURUM: { ACIK: 'AÇIK', KAPALI: 'KAPALI', IPTAL: 'İPTAL' },
};

// Kolon haritası (1-tabanlı) — tablodaki sıralamayla birebir
const C = {
  ID: 1, ORDER_NO: 2, SIPARIS_TARIHI: 3, HAZIRLANMA: 4, TESLIM_TARIHI: 5, SUBE: 6, CIKAN_SUBE: 7,
  ORDER_TYPE: 8, EXT_APP: 9, MARKA: 10, ODEME: 11, MUSTERI: 12, TELEFON: 13, BOLGE: 14, ADRES: 15,
  KATEGORI: 16, URUN_ADLARI: 17, ADET: 18, BIRIM_FIYAT: 19, TUTAR: 20, KURYE: 21,
  TAHSIL: 22,      // V  Ödeme Alındı: ☑ onay kutusu / kırmızı "Ödeme Bekleniyor (Nakit)"
  TAHSIL_TIP: 23,  // W  Online / Nakit / Kart / Yemek Kartı
  DURUM: 24, MOTOR: 25, TARIH_ISO: 26, NOT: 27,
};
const SON_KOLON = 27;
const BASLIKLAR = ['Sipariş ID', 'Sipariş No (Gün İçi Sıra)', 'Sipariş Tarihi', 'Hazırlanma (Şube Çıkış)', 'Teslim Zamanı',
  'Şube', 'Ürün Çıkan Şube', 'Sipariş Tipi', 'Sipariş Kanalı', 'Marka', 'Ödeme Yöntemi', 'Müşteri Adı', 'Müşteri Telefon',
  'Mahalle', 'Müşteri Adres', 'Ürün Kategorileri', 'Ürünler', 'Ürün Adetleri', 'Ürün Fiyatları', 'Toplam Tutar', 'Kurye',
  'Ödeme Alındı', 'Tahsil Tipi', 'Durum', 'Motor_Islendi', 'Tarih_ISO', 'Not'];

// Ana Musteri Listesi kolonları (1-tabanlı): A Telefon, B İsim, C Mahalle, D Adres, E Kaynak,
// F Sipariş sayısı, H Son sipariş, J Eski adresler
const M = { TEL: 1, ISIM: 2, MAHALLE: 3, ADRES: 4, KAYNAK: 5, SAYI: 6, SON: 8, ESKI_ADRES: 10, ETIKET_ILK: 11, ETIKET_NOT: 16, TY_TARIH: 17 }; // KO onay programları, P not, Q TY tarih const ETIKETLER = ['İletişim Sağlanmayacak', 'Kara Liste', 'Sorunlu Müşteri', 'YS 4 Altında Not Veren', 'TY 4 Altında Not Veren'];

// Telafi_Listesi kolonları
const T = { TEL: 1, ISIM: 2, TARIH: 3, SORUN: 4, SOZ: 5, DURUM: 6, SIPARIS: 7, KULLANIM: 8, NOT: 9 };
const T_HEADERS = ['Telefon', 'İsim', 'Tarih', 'Sorun', 'Söz verilen', 'Durum', 'Kullanıldığı Sipariş', 'Kullanım Tarihi', 'Not'];

// ============================================================
// KURULUM / TEST
// ============================================================
function ilkKurulum() {
  const sh = dataSheet_();
  if (CONFIG.TEST_MODE) Logger.log('TEST MODU: ' + sh.getParent().getUrl());
  // Eski düzenden geliyorsa fazlalık sütunları başlığa bakarak sil (idempotent)
  sutunlariSirala_(sh);   // başlık adlarına göre sütunları BASLIKLAR sırasına diz (gerekirse)
  sh.getRange(1, 1, 1, BASLIKLAR.length).setValues([BASLIKLAR]).setFontWeight('bold');
  sh.setFrozenRows(1);
  // Tarih sütunları tek biçim: E, F, U
  sh.getRange(1, C.SIPARIS_TARIHI, sh.getMaxRows(), 3).setNumberFormat('dd.MM.yyyy HH:mm:ss');   // C, D, E
  telafiSheet_();
  ScriptApp.getProjectTriggers()
    .filter(t => ['siparisDongusu', 'kuryeKasaOzeti', 'tahsilSenkron', 'etiketleriUygula'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('siparisDongusu').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('tahsilSenkron').timeBased().everyHours(1).create();   // 03:30–09:30 arası fonksiyon kendisi susar
  ScriptApp.newTrigger('etiketleriUygula').timeBased().everyMinutes(15).create(); // Etiket_Girisi sekmesini işler
  Logger.log('Kurulum tamam. 5 dk sipariş + saatlik HemenYolda tahsil senkronu (03:30-09:30 sessiz) aktif.');
}

function testCalistir() {
  CONFIG._LOG = true;
  siparisDongusu();   // kendi kilidini alır
}

// ============================================================
// ANA DÖNGÜ
// ============================================================
function siparisDongusu() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const acik = adisyoAcikSiparisler_();          // turda TEK istek
    if (CONFIG._LOG) {
      Logger.log(`Açık sipariş: ${acik.length}`);
      if (acik.length) Logger.log('İlk kayıt: ' + JSON.stringify(acik[0]).slice(0, 1500));
    }
    yeniSiparisleriIsle_(acik);
    acikSiparisleriGuncelle_(acik);
    tamamlananlariIsle_();                         // masa / gel-al / turlar arasında kapananlar + iptaller
  } catch (e) {
    Logger.log('HATA: ' + e + '\n' + (e.stack || ''));
    hataBildir_(e);
  } finally {
    lock.releaseLock();
  }
}

// ---------- 1) Yeni açık siparişler ----------
function yeniSiparisleriIsle_(acik) {
  if (!acik.length) return;

  const sh = dataSheet_();
  const acikIndeks = acikIndeksOku_();         // { orderId: rowNumber }
  const bekleyenTelafi = telafiBekleyenler_();
  const etiketMap = musteriEtiketleri_();
  const mahalleYok = [];

  for (const oz of acik) {
    const id = String(oz.id || oz.orderId || '');
    if (!id || acikIndeks[id]) continue;
    if (satirBul_(sh, id)) { acikIndeks[id] = satirBul_(sh, id); continue; } // önceki turdan zaten var

    const d = oz;                            // RecentOrders zaten tam detay döndürüyor

    const satir = satirOlustur_(d, CONFIG.DURUM.ACIK);
    const paketMi = String(d.orderType || '').indexOf('Paket') >= 0;
const mh = paketMi ? mahalleCoz_(d) : null;                 // {tamAd, sube, kaynak} | null
    if (mh) { satir[C.BOLGE - 1] = mh.tamAd; satir[C.CIKAN_SUBE - 1] = mh.sube; }
    sh.appendRow(satir);
    const rowNo = sh.getLastRow();
    tarihBicimi_(sh, rowNo);
    { const b = tahsilTipi_(satir[C.ODEME - 1]); tahsilYaz_(sh, rowNo, b, b === 'ONLINE'); }
    etiketKontrol_(sh, rowNo, d, etiketMap);
    if (paketMi && !mh) {
  notEkle_(sh, rowNo, 'Mahalle bulunamadı');
  mahalleYok.push(`#${d.orderNumber || d.id} ${(d.customer && d.customer.customerName) || ''} — ${(d.customer && d.customer.address) || ''}`);
}
    acikIndeks[id] = rowNo;

    if (!CONFIG.TEST_MODE) musteriUpsert_(d, mh);   // testte Make zaten yapıyor, iki kez saymasın
    telafiKontrol_(d, bekleyenTelafi);
  }
  acikIndeksYaz_(acikIndeks);
  if (mahalleYok.length) bildir_('📍 Mahalle bulunamadı – ' + mahalleYok.length + ' sipariş',
    'Aşağıdaki siparişlerin mahallesi Mahalle_Sube listesinden ve haritadan çıkarılamadı. Müşteri adresini düzelt ya da mahalleyi listeye ekle:\n\n' + mahalleYok.join('\n'));
}

// ---------- 1b) Tamamlanmış siparişler (masa, gel-al, hızlı kapananlar, iptaller) ----------
function tamamlananPath_() {
  return PropertiesService.getScriptProperties().getProperty('tamamlananPath') || CONFIG.TAMAMLANAN_PATH;
}
function utcTarih_(d) { return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd HH:mm:ss'); }

function tamamlananSiparisler_(geriSaat) {
  const bas = new Date(Date.now() - geriSaat * 3600e3);
  const hepsi = [];
  for (let page = 1; page <= 30; page++) {
    if (page > 1) Utilities.sleep(CONFIG.ISTEK_ARASI_MS);
    const j = adisyoGet_(`${tamamlananPath_()}?page=${page}&startDate=${encodeURIComponent(utcTarih_(bas))}&includeCancelled=true`);
    if (!j) break;
    const liste = Array.isArray(j.orders) ? j.orders : (Array.isArray(j.data) ? j.data : []);
    hepsi.push(...liste);
    const pageCount = Number(j.pageCount || 1);
    if (page >= pageCount || liste.length < 100) break;
  }
  return hepsi;
}

// Elle: geriye dönük tamamlananları çek (masa/gel-al eksikleri için). Tabloda olanlara dokunmaz.
function tamamlananGeri48() { kilitliCalistir_(() => tamamlananlariIsle_(48)); }
function tamamlananGeri7Gun() { kilitliCalistir_(() => tamamlananlariIsle_(24 * 7)); }
function kilitliCalistir_(fn) {
  CONFIG._LOG = true;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(120000)) { Logger.log('Tur çalışıyor, kilit alınamadı; biraz sonra tekrar dene.'); return; }
  try { fn(); } finally { lock.releaseLock(); }
}

function tamamlananlariIsle_(geriSaat) {
  Utilities.sleep(CONFIG.ISTEK_ARASI_MS);
  let liste;
  try { liste = tamamlananSiparisler_(geriSaat || CONFIG.TAMAMLANAN_GERI_SAAT); }
  catch (e) { Logger.log('Tamamlanan liste alınamadı: ' + e); return; }
  if (!liste.length) return;
  const sh = dataSheet_();
  const acikIndeks = acikIndeksOku_();
  const etiketMap = musteriEtiketleri_();
  const bekleyenTelafi = telafiBekleyenler_();
  let yeni = 0, kapatilan = 0, iptal = 0;
  for (const d of liste) {
    const id = String(d.id || '');
    if (!id) continue;
    const statusId = Number(d.statusId);
    const iptalMi = CONFIG.IPTAL_STATUS_IDS.includes(statusId) || !!d.orderCancelReason;
    const kapaliMi = statusId === CONFIG.KAPALI_STATUS_ID;
    if (!iptalMi && !kapaliMi) continue;
    const row = satirBul_(sh, id);
    if (row) {
      const durum = String(sh.getRange(row, C.DURUM).getValue() || '');
      if (durum === CONFIG.DURUM.ACIK) {
        if (iptalMi) { iptalYaz_(sh, row, d); iptal++; } else { kapanisiYaz_(sh, row, d); kapatilan++; }
        delete acikIndeks[id];
      }
      continue;
    }
    // tabloda hiç yok → doğrudan kapalı/iptal olarak yaz
    const satir = satirOlustur_(d, iptalMi ? CONFIG.DURUM.IPTAL : CONFIG.DURUM.KAPALI);
    satir[C.TESLIM_TARIHI - 1] = isoToDate_(d.closedDate || d.updateDate);
    satir[C.TARIH_ISO - 1] = d.insertDate || '';
    if (d.tableName && !satir[C.MUSTERI - 1]) satir[C.MUSTERI - 1] = d.tableName;   // masa siparişinde masa adı
    const paketMi = String(d.orderType || '').indexOf('Paket') >= 0;
    const mh = paketMi ? mahalleCoz_(d) : null;
    if (mh) { satir[C.BOLGE - 1] = mh.tamAd; satir[C.CIKAN_SUBE - 1] = mh.sube; }
    sh.appendRow(satir);
    const rowNo = sh.getLastRow();
    tarihBicimi_(sh, rowNo);
    if (iptalMi) { notEkle_(sh, rowNo, `İptal (statusId ${statusId}${d.orderCancelReason ? ', ' + d.orderCancelReason : ''})`); iptal++; }
    else {
      const b = tahsilTipi_(satir[C.ODEME - 1]);
      tahsilYaz_(sh, rowNo, b, b === 'ONLINE' || !paketMi);   // masa/gel-al kasada ödenir → alındı
      etiketKontrol_(sh, rowNo, d, etiketMap);
      if (paketMi && !mh) notEkle_(sh, rowNo, 'Mahalle bulunamadı');
      if (!CONFIG.TEST_MODE && paketMi) musteriUpsert_(d, mh);
      telafiKontrol_(d, bekleyenTelafi);
      yeni++;
    }
  }
  acikIndeksYaz_(acikIndeks);
  if (CONFIG._LOG || yeni || iptal) Logger.log(`Tamamlanan: ${liste.length} kayıt tarandı → ${yeni} yeni (masa/gel-al/kaçan), ${kapatilan} açık kapatıldı, ${iptal} iptal.`);
}

// Elle: tamamlanan siparişler ucunun adını doğrula ve son 24 saatin dağılımını gör
function testTamamlananUcu() {
  const adaylar = [CONFIG.TAMAMLANAN_PATH, '/CompletedOrders', '/ClosedOrders', '/Orders/Completed', '/CompletedOrder'];
  for (const path of [...new Set(adaylar)]) {
    try {
      const resp = UrlFetchApp.fetch(CONFIG.ADISYO_BASE + path + '?page=1&includeCancelled=true', { method: 'get', headers: CONFIG.ADISYO_HEADERS, muteHttpExceptions: true });
      const code = resp.getResponseCode();
      Logger.log(`${path} → HTTP ${code}`);
      if (code !== 200) { Utilities.sleep(CONFIG.ISTEK_ARASI_MS); continue; }
      const j = JSON.parse(resp.getContentText());
      const liste = Array.isArray(j.orders) ? j.orders : [];
      PropertiesService.getScriptProperties().setProperty('tamamlananPath', path);
      const dag = liste.reduce((a, o) => { const k = (o.orderType || '?') + ' / status ' + o.statusId; a[k] = (a[k] || 0) + 1; return a; }, {});
      Logger.log(`✓ Uç bulundu: ${path}. Son 24 saat: ${liste.length} kayıt (toplam ${j.totalCount}, ${j.pageCount} sayfa). Dağılım: ${JSON.stringify(dag)}`);
      const masa = liste.find(o => o.orderTypeId === 1) || liste.find(o => o.orderTypeId === 5);
      if (masa) Logger.log('Örnek masa/gel-al: ' + JSON.stringify(masa).slice(0, 700));
      return;
    } catch (e) { Logger.log(path + ' hata: ' + e); }
  }
  Logger.log('Hiçbir aday uç 200 dönmedi. Dokümandaki uç adını CONFIG.TAMAMLANAN_PATH\'e yaz.');
}

// ---------- 2) Açık siparişleri kapanış için kontrol ----------
function acikSiparisleriGuncelle_(acik) {
  const acikIndeks = acikIndeksOku_();
  const idler = Object.keys(acikIndeks);
  if (!idler.length) return;
  const halaAcik = new Set(acik.map(o => String(o.id || o.orderId || '')));

  const sh = dataSheet_();
  for (const id of idler) {
    const rowNo = acikIndeks[id];
    // satır kayarsa (silme vs.) ID ile doğrula
    const gercekRow = (String(sh.getRange(rowNo, C.ID).getValue()) === id) ? rowNo : satirBul_(sh, id);
    if (!gercekRow) { delete acikIndeks[id]; continue; }

    // Hâlâ açık listede görünüyorsa kapanmamıştır; gereksiz istek atma.
    // (Ödeme/ürün değişikliği kapanışta yakalanır.)
    if (halaAcik.has(id)) {
      const oz = acik.find(o => String(o.id || o.orderId) === id);
      if (oz && oz.deliveryUserName) sh.getRange(gercekRow, C.KURYE).setValue(oz.deliveryUserName);
      continue;
    }

    Utilities.sleep(CONFIG.ISTEK_ARASI_MS);   // rate limit
    const d = adisyoSiparisDetay_(id);
    if (!d) continue;
    const statusId = Number(d.statusId);

    if (statusId === CONFIG.KAPALI_STATUS_ID) {
      kapanisiYaz_(sh, gercekRow, d);
      delete acikIndeks[id];
    } else if (CONFIG.IPTAL_STATUS_IDS.includes(statusId)) {
      iptalYaz_(sh, gercekRow, d);
      delete acikIndeks[id];
    } else {
      // hâlâ açık: çok uzun süredir açıksa takibi bırak, not düş
      const acilis = sh.getRange(gercekRow, C.SIPARIS_TARIHI).getValue();
      if (acilis instanceof Date && Date.now() - acilis.getTime() > CONFIG.ACIK_MAX_SAAT * 3600e3) {
        notEkle_(sh, gercekRow, `${CONFIG.ACIK_MAX_SAAT} saattir kapanmadı (statusId ${statusId}), takip bırakıldı`);
        delete acikIndeks[id];
      }
    }
  }
  acikIndeksYaz_(acikIndeks);
}

function kapanisiYaz_(sh, row, d) {
  const eskiOdeme = String(sh.getRange(row, C.ODEME).getValue() || '').trim();
  const yeniOdeme = odemeMetni_(d);
  const notlar = [];

  sh.getRange(row, C.TESLIM_TARIHI).setValue(isoToDate_(d.updateDate));
  sh.getRange(row, C.HAZIRLANMA).setValue(isoToDate_(d.preparedDate));
  sh.getRange(row, C.TARIH_ISO).setValue(d.insertDate || '');
  sh.getRange(row, C.TUTAR).setValue(d.orderTotal);
  if (d.deliveryUserName) sh.getRange(row, C.KURYE).setValue(d.deliveryUserName);
  sh.getRange(row, C.DURUM).setValue(CONFIG.DURUM.KAPALI);
  tarihBicimi_(sh, row);

  { const eskiAlindi = sh.getRange(row, C.TAHSIL).getValue() === true;
    const b = tahsilTipi_(yeniOdeme || eskiOdeme);
    if (yeniOdeme !== eskiOdeme || !eskiAlindi) tahsilYaz_(sh, row, b, b === 'ONLINE' || eskiAlindi); }
  if (yeniOdeme && eskiOdeme && yeniOdeme !== eskiOdeme) {
    sh.getRange(row, C.ODEME).setValue(yeniOdeme);
    notlar.push(`Ödeme değişti: ${eskiOdeme} → ${yeniOdeme}`);
    bildir_(`💳 Ödeme yöntemi değişti – #${d.orderNumber || d.id}`,
      `Sipariş #${d.orderNumber || d.id} (${d.salesChannelName || ''})\n${d.customer && d.customer.customerName || ''}\n` +
      `Açılışta: ${eskiOdeme}\nKapanışta: ${yeniOdeme}\nTutar: ${d.orderTotal} TL`);
  } else if (yeniOdeme && !eskiOdeme) {
    sh.getRange(row, C.ODEME).setValue(yeniOdeme);
  }
  if (notlar.length) notEkle_(sh, row, notlar.join(' | '));
}

function iptalYaz_(sh, row, d) {
  sh.getRange(row, C.DURUM).setValue(CONFIG.DURUM.IPTAL);
  sh.getRange(row, C.TESLIM_TARIHI).setValue(isoToDate_(d.updateDate));
  notEkle_(sh, row, `İptal (statusId ${d.statusId})`);
  bildir_(`❌ Sipariş iptal – #${d.orderNumber || d.id}`,
    `Sipariş #${d.orderNumber || d.id} (${d.salesChannelName || ''}) iptal edildi.\n` +
    `${d.customer && d.customer.customerName || ''} – ${d.orderTotal} TL\nÜrünler: ${urunListesi_(d)}`);
}

function notEkle_(sh, row, metin) {
  const eski = String(sh.getRange(row, C.NOT).getValue() || '');
  sh.getRange(row, C.NOT).setValue(eski ? `${eski} | ${metin}` : metin);
}
// Not hücresinden belirli bir notu çıkarır (ör. sorun çözülünce)
function notSil_(sh, row, metin) {
  const eski = String(sh.getRange(row, C.NOT).getValue() || '');
  if (eski.indexOf(metin) < 0) return;
  const yeni = eski.split(' | ').filter(x => x.trim() !== metin).join(' | ');
  sh.getRange(row, C.NOT).setValue(yeni);
}

// ============================================================
// SATIR OLUŞTURMA (Make senaryosuyla birebir)
// ============================================================
function satirOlustur_(d, durum) {
  const r = new Array(SON_KOLON).fill('');
  const cust = d.customer || {};
  const prods = d.products || [];
  const join = (key) => prods.map(p => p[key] == null ? '' : p[key]).join(' | ');

  r[C.ID - 1] = d.id;
  r[C.ODEME - 1] = odemeMetni_(d);
  r[C.TUTAR - 1] = d.orderTotal;
  r[C.EXT_APP - 1] = kanalNormalize_(d.externalAppName, d.orderType);
  r[C.SIPARIS_TARIHI - 1] = isoToDate_(d.insertDate);
  r[C.TESLIM_TARIHI - 1] = '';                          // kapanışta dolar
  r[C.ORDER_TYPE - 1] = d.orderType || '';
  r[C.ORDER_NO - 1] = d.orderNumber || '';
  r[C.MUSTERI - 1] = cust.customerName || '';
  r[C.TELEFON - 1] = cust.customerPhone || '';
  r[C.ADRES - 1] = cust.address || '';
  r[C.KURYE - 1] = d.deliveryUserName || '';
  r[C.SUBE - 1] = d.salesChannelName || '';
  r[C.BOLGE - 1] = cust.region || '';
  r[C.MARKA - 1] = markaNormalize_(d);
  r[C.HAZIRLANMA - 1] = isoToDate_(d.preparedDate);
  r[C.URUN_ADLARI - 1] = join('productName');
  r[C.BIRIM_FIYAT - 1] = join('unitPrice');
  r[C.ADET - 1] = join('quantity');
  r[C.KATEGORI - 1] = join('categoryName');
  r[C.TARIH_ISO - 1] = '';                              // kapanışta dolar (memnuniyet bunu okuyor)
  r[C.DURUM - 1] = durum;
  r[C.TAHSIL - 1] = '';
  r[C.TAHSIL_TIP - 1] = tipAdi_(tahsilTipi_(r[C.ODEME - 1]));
  return r;
}

// Ayar tablosundaki online (takip dışı) ödeme yöntemleri — normalize edilmiş ad seti, 30 dk önbellek
function onlineYontemler_() {
  const cache = CacheService.getScriptCache();
  const c = cache.get('onlineYontemler');
  if (c) return JSON.parse(c);
  let liste = [];
  try {
    const sh = SpreadsheetApp.openById(CONFIG.AYAR_SS_ID).getSheetByName(CONFIG.ODEME_SHEET);
    const v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 4).getValues();
    liste = v.filter(r => r[0] && (r[3] === true || String(r[3]).toUpperCase() === 'TRUE')).map(r => nrm_(r[0]));
  } catch (e) { Logger.log('Ödeme yöntemleri sekmesi okunamadı: ' + e); }
  cache.put('onlineYontemler', JSON.stringify(liste), 1800);
  return liste;
}
function nrm_(x) {
  return String(x || '').toLowerCase().replace(/ı/g, 'i').replace(/İ/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

// Ödeme yöntemi adından temel tip: ONLINE (takip dışı) / NAKİT / YK (yemek kartı, kuryede onaylanır) / KART
function tahsilTipi_(odeme) {
  const ham = String(odeme || '').trim();
  if (!ham) return '';
  const online = onlineYontemler_();
  const parcalar = ham.split(/\s*[,+]\s*/).map(nrm_).filter(Boolean);
  const onlineMi = (p) => online.length ? online.indexOf(p) >= 0 : p.indexOf('online') >= 0;
  if (parcalar.length && parcalar.every(onlineMi)) return 'ONLINE';
  const takip = parcalar.filter(p => !onlineMi(p));
  if (takip.some(p => p.indexOf('nakit') >= 0)) return 'NAKİT';
  if (takip.some(p => p.indexOf('kredi') >= 0 || p.indexOf('banka') >= 0)) return 'KART';
  return 'YK';
}

function tipAdi_(base) {
  return { ONLINE: 'Online', 'NAKİT': 'Nakit', KART: 'Kart', YK: 'Yemek Kartı' }[base] || '';
}
// AE hücresini yazar: alındıysa ☑ onay kutusu, değilse kırmızı "Ödeme Bekleniyor (Nakit)"
function tahsilYaz_(sh, row, base, alindi) {
  const ae = sh.getRange(row, C.TAHSIL);
  sh.getRange(row, C.TAHSIL_TIP).setValue(tipAdi_(base));
  if (!base) { ae.clearDataValidations().clearContent().setFontColor(null); return; }
  if (alindi) {
    ae.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build())
      .setValue(true).setFontColor(null).setFontWeight('normal').setHorizontalAlignment('center');
  } else {
    ae.clearDataValidations().setValue('Ödeme Bekleniyor (' + tipAdi_(base) + ')')
      .setFontColor('#c00000').setFontWeight('bold').setHorizontalAlignment('left');
  }
}

// ============================================================
// MAHALLE ÇÖZÜMLEME (Mahalle_Sube listesi → adres metni → Google geocoder)
// ============================================================
function mahalleListesi_() {
  const cache = CacheService.getScriptCache();
  const c = cache.get('mahalleListesi');
  if (c) return JSON.parse(c);
  let liste = [];
  try {
    const sh = SpreadsheetApp.openById(CONFIG.AYAR_SS_ID).getSheetByName(CONFIG.MAHALLE_SHEET);
    const v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 3).getValues();
    liste = v.filter(r => r[0] !== '' && r[0] !== null).map(r => {
      // "19 Mayıs" gibi adlar E-Tablolar'da tarihe dönebilir → B'deki tam addan türet
      let ad = (r[0] instanceof Date || typeof r[0] === 'number') ? String(r[1] || '').split(/\s+(mah|mh|-)/i)[0].trim() : String(r[0]).trim();
      return { ad, n: nrm_(ad), tamAd: String(r[1] || ad).trim(), sube: String(r[2] || '').trim(), ilce: nrm_(String(r[1] || '').split('-').pop()) };
    }).filter(m => m.n);
    liste.sort((a, b) => b.n.length - a.n.length);   // uzun ad önce ("Sahrayı Cedit" > "Site")
  } catch (e) { Logger.log('Mahalle_Sube okunamadı: ' + e); }
  cache.put('mahalleListesi', JSON.stringify(liste), 1800);
  return liste;
}
// Kısa/yaygın kelimeler: sadece "X mah" kalıbı veya adresin baş segmenti olarak kabul edilir
const MAHALLE_TITIZ = ['site', 'ornek', 'fetih', 'cumhuriyet', 'barbaros', 'egitim', 'kisikli'];

function mahalleEsle_(metin, sadeceKesin) {
  const liste = mahalleListesi_();
  if (!liste.length) return null;
  const t = nrm_(metin);
  if (!t) return null;
  const ilceSec = (adaylar) => adaylar.length === 1 ? adaylar[0] : (adaylar.find(a => a.ilce && t.indexOf(a.ilce) >= 0) || adaylar[0]);
  // 1) "X mah / mh / mahallesi" kalıbı
  for (const m of liste) {
    const re = new RegExp('(^|[^a-z0-9])' + m.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(istanbul|kadikoy|uskudar|atasehir|umraniye|maltepe)?\\s*(mah|mh|mahallesi)');
    if (re.test(t)) return ilceSec(liste.filter(x => x.n === m.n));
  }
  // 1b) bölge alanı sadece "Mahalle İlçe/İstanbul" ise (Yemeksepeti: "Eğitim İstanbul")
  const temiz = t.replace(/\b(istanbul|kadikoy|uskudar|atasehir|umraniye|maltepe|mahallesi|mah|mh)\b/g, ' ').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const m of liste) if (temiz === m.n) return ilceSec(liste.filter(x => x.n === m.n));
  // 2) adresin ilk segmenti (Getir: "Eğitim - Kentplus…", "Bostancı, Yazmacı…")
  const bas = t.split(/\s*[-,\/]\s*/)[0].trim();
  for (const m of liste) if (bas === m.n) return ilceSec(liste.filter(x => x.n === m.n));
  if (sadeceKesin) return null;
  // 3) kelime sınırlı serbest eşleşme (titiz kelimeler hariç)
  for (const m of liste) {
    if (MAHALLE_TITIZ.indexOf(m.n) >= 0) continue;
    const re = new RegExp('(^|[^a-z0-9])' + m.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])');
    if (re.test(t)) return ilceSec(liste.filter(x => x.n === m.n));
  }
  return null;
}

function mahalleCoz_(d) {
  const cust = d.customer || {};
  const region = String(cust.region || '').trim();
  const adres = String(cust.address || '').trim();
  let m = (region && mahalleEsle_(region, false)) || (adres && mahalleEsle_(adres, false)) || null;
  if (!m && CONFIG.GEOCODE && adres) {
    try {
      const cache = CacheService.getScriptCache();
      const key = 'geo_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, adres)).slice(0, 40);
      let mahAdi = cache.get(key);
      if (mahAdi === null) {
        const g = Maps.newGeocoder().setRegion('tr').setLanguage('tr').geocode(adres.replace(/\|\|\|/g, ' ') + ', İstanbul');
        mahAdi = '';
        if (g && g.results && g.results.length) {
          const comps = g.results[0].address_components || [];
          const c4 = comps.find(c => c.types.indexOf('administrative_area_level_4') >= 0) || comps.find(c => c.types.indexOf('sublocality_level_1') >= 0) || comps.find(c => c.types.indexOf('neighborhood') >= 0);
          if (c4) mahAdi = c4.long_name;
        }
        cache.put(key, mahAdi, 21600);
      }
      if (mahAdi) m = mahalleEsle_(mahAdi + ' mah', true);
    } catch (e) { Logger.log('Geocode hatası: ' + e); }
  }
  return m ? { tamAd: m.tamAd, sube: m.sube, kaynak: region ? 'region' : 'adres' } : null;
}

// Sipariş kanalı adını eski Make düzeniyle aynı yaz (raporlar/memnuniyet bu adlara göre filtreliyor)
function kanalNormalize_(ext, orderType) {
  const e = nrm_(ext);
  if (e.indexOf('yemeksepeti') >= 0 || e.indexOf('delivery') >= 0) return 'Yemeksepeti (DH)';
  if (e.indexOf('trendyol') >= 0) return 'Trendyol';
  if (e.indexOf('getir') >= 0) return 'Getir Yemek';
  if (e.indexOf('web') >= 0) return 'Web Sipariş';
  if (e) return String(ext).trim();
  const t = nrm_(orderType);
  if (t.indexOf('masa') >= 0) return 'Masa Siparisi';
  if (t.indexOf('gel') >= 0) return 'Gel Al Siparis';
  return 'Paket Siparis';
}
// Elle, tek sefer: mevcut satırlardaki ham kanal adlarını eski düzene çevir
function kanallariDuzelt() {
  const sh = dataSheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const v = sh.getRange(2, 1, last - 1, C.EXT_APP).getValues();
  let n = 0;
  v.forEach((r, i) => {
    const eski = String(r[C.EXT_APP - 1] || '');
    const yeni = kanalNormalize_(eski, r[C.ORDER_TYPE - 1]);
    if (yeni !== eski) { sh.getRange(i + 2, C.EXT_APP).setValue(yeni); n++; }
  });
  Logger.log('Kanal adı düzeltilen satır: ' + n);
}

function markaNormalize_(d) {
  const kanal = d.salesChannelName || '';
  const ent = (d.integrationRestaurantName || '').toLowerCase();
  if (!ent) return kanal;
  const fikirtepe = kanal.indexOf('Fikirtepe') >= 0;
  if (ent.indexOf('salad') >= 0) return fikirtepe ? 'BAP Salad & Pasta Fikirtepe' : 'BAP Salad & Pasta Erenköy';
  return fikirtepe ? 'BAP Pizza Fikirtepe' : 'BAP Pizza Erenköy';
}

function odemeMetni_(d) {
  const p = (d.payments || []).map(x => x.paymentName).filter(Boolean).join(', ');
  return p || d.paymentMethodName || '';
}
function urunListesi_(d) {
  return (d.products || []).map(p => `${p.quantity || 1}x ${p.productName}`).join(', ');
}

// ============================================================
// MÜŞTERİ VERİTABANI UPSERT (Make dallarıyla aynı mantık)
// ============================================================
function musteriUpsert_(d, mh) {
  const cust = d.customer || {};
  const mahalle = (mh && mh.tamAd) || cust.region || '';
  const ham = String(cust.customerPhone || '').replace(/\s/g, '');
  if (!ham || ham.indexOf('/') >= 0 || ham.length < 10) return;   // Getir maskeli vb.
  const tel = ham.slice(-10);

  const sh = SpreadsheetApp.openById(CONFIG.MUSTERI_SS_ID).getSheetByName(CONFIG.MUSTERI_SHEET);
  const hit = sh.getRange(1, M.TEL, sh.getLastRow(), 1).createTextFinder(tel).matchEntireCell(true).findNext();
  const bugun = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyy-MM-dd');

  if (!hit) {
    const r = new Array(M.ESKI_ADRES).fill('');
    r[M.TEL - 1] = tel; r[M.ISIM - 1] = cust.customerName || ''; r[M.MAHALLE - 1] = mahalle;
    r[M.ADRES - 1] = cust.address || ''; r[M.KAYNAK - 1] = 'Adisyo (oto)'; r[M.SAYI - 1] = 1; r[M.SON - 1] = bugun;
    sh.appendRow(r);
    return;
  }
  const row = hit.getRow();
  const eski = sh.getRange(row, 1, 1, M.ESKI_ADRES).getValues()[0];
  const eskiAdres = String(eski[M.ADRES - 1] || '');
  const yeniAdres = String(cust.address || '');
  const eskiListe = String(eski[M.ESKI_ADRES - 1] || '');

  sh.getRange(row, M.ISIM).setValue(eski[M.ISIM - 1] || cust.customerName || '');
  sh.getRange(row, M.MAHALLE).setValue(eski[M.MAHALLE - 1] || mahalle);
  sh.getRange(row, M.ADRES).setValue(yeniAdres || eskiAdres);
  sh.getRange(row, M.SAYI).setValue(Number(eski[M.SAYI - 1] || 0) + 1);
  sh.getRange(row, M.SON).setValue(bugun);
  if (eskiAdres && yeniAdres && eskiAdres !== yeniAdres) {
    sh.getRange(row, M.ESKI_ADRES).setValue(eskiListe ? `${eskiListe} | ${eskiAdres}` : eskiAdres);
  }
}

// ============================================================
// TELAFİ KONTROLÜ
// ============================================================
function telafiSheet_() {
  const ss = SpreadsheetApp.openById(CONFIG.MUSTERI_SS_ID);
  let sh = ss.getSheetByName(CONFIG.TELAFI_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.TELAFI_SHEET);
    sh.getRange(1, 1, 1, T_HEADERS.length).setValues([T_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
    sh.getRange('F2:F1000').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['BEKLİYOR', 'KULLANILDI', 'İPTAL'], true).setAllowInvalid(false).build());
  }
  return sh;
}

function telafiBekleyenler_() {
  const sh = telafiSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, T_HEADERS.length).getValues()
    .map((r, i) => ({ row: i + 2, tel: son10_(r[T.TEL - 1]), isim: r[T.ISIM - 1], sorun: r[T.SORUN - 1], soz: r[T.SOZ - 1], durum: String(r[T.DURUM - 1] || '').toUpperCase() }))
    .filter(x => x.tel && x.durum === 'BEKLİYOR');
}

function telafiKontrol_(d, bekleyenler) {
  if (!bekleyenler.length) return;
  const tel = son10_(d.customer && d.customer.customerPhone);
  if (!tel) return;
  const i = bekleyenler.findIndex(b => b.tel === tel);
  if (i < 0) return;
  const k = bekleyenler[i];
  const sh = telafiSheet_();
  sh.getRange(k.row, T.DURUM).setValue('KULLANILDI');
  sh.getRange(k.row, T.SIPARIS).setValue(String(d.orderNumber || d.id));
  sh.getRange(k.row, T.KULLANIM).setValue(new Date());
  bekleyenler.splice(i, 1);

  bildir_(`🎁 Telafi müşterisi sipariş verdi – ${k.isim || d.customer.customerName}`,
    `🎁 TELAFİ MÜŞTERİSİ SİPARİŞ VERDİ\n\nMüşteri: ${k.isim || d.customer.customerName} (${tel})\n` +
    `Sipariş: #${d.orderNumber || d.id} – ${d.salesChannelName || ''} – ${d.orderTotal} TL\n` +
    `Ürünler: ${urunListesi_(d)}\nAdres: ${d.customer.address || ''}\n\n` +
    `Önceki sorun: ${k.sorun}\nSöz verilen: ${k.soz}\n\nListede KULLANILDI olarak işaretlendi.`);
}

// ============================================================
// ADISYO API
// ============================================================
function adisyoGet_(path) {
  let sonHata = '';
  for (let deneme = 0; deneme < 4; deneme++) {
    const resp = UrlFetchApp.fetch(CONFIG.ADISYO_BASE + path, { method: 'get', headers: CONFIG.ADISYO_HEADERS, muteHttpExceptions: true });
    const code = resp.getResponseCode();
    const govde = resp.getContentText() || '';
    if (code === 404) return null;
    if (code === 200) return JSON.parse(govde);
    sonHata = `Adisyo ${code} ${path}: ${govde.slice(0, 300)}`;
    // 601 = istek sıklığı aşıldı → bekleyip tekrar dene
    if (govde.indexOf('"status":601') >= 0 || code === 429) { Utilities.sleep(10000 * (deneme + 1)); continue; }
    break;
  }
  throw new Error(sonHata);
}

function adisyoAcikSiparisler_() {
  // status gönderilmeyince Adisyo zaten sadece son 24 saatin AÇIK siparişlerini döner;
  // minimumUpdateDate parametresi 500 verdiği için kullanılmıyor.
  const hepsi = [];
  for (let page = 1; page <= 10; page++) {
    const j = adisyoGet_(`/RecentOrders?page=${page}`);
    if (!j) break;
    const liste = Array.isArray(j.data) ? j.data : (Array.isArray(j) ? j : []);
    hepsi.push(...liste);
    const total = Number(j.totalCount || j.TotalCount || 0);
    if (liste.length < 100 || (total && hepsi.length >= total)) break;
  }
  return hepsi;
}

function adisyoSiparisDetay_(id) {
  const j = adisyoGet_(`/Order/${id}`);
  if (!j) return null;
  return j.data || j;
}

// ============================================================
// YARDIMCILAR
// ============================================================
function tarihBicimi_(sh, row) {
  sh.getRange(row, C.SIPARIS_TARIHI, 1, 3).setNumberFormat('dd.MM.yyyy HH:mm:ss');   // C, D, E
}
function dataSheet_() {
  // Script bağlı olduğu tabloya ("BAP Adisyo Siparis Datası") yazar — TEST_MODE artık sadece müşteri DB upsert'ini kapatır
  const bagli = SpreadsheetApp.getActiveSpreadsheet();
  if (bagli && bagli.getId() !== CONFIG.DATA_SS_ID) {
    const bs = bagli.getSheetByName(CONFIG.DATA_SHEET);
    if (!bs) throw new Error(`"${CONFIG.DATA_SHEET}" sekmesi bulunamadı. Sekme adı değiştiyse CONFIG.DATA_SHEET'i güncelle.`);
    return bs;
  }
  const p = PropertiesService.getScriptProperties();
  let id = p.getProperty('testSsId');
  let ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.TEST_SS_ADI);
    ss.setSpreadsheetLocale('tr_TR');
    p.setProperty('testSsId', ss.getId());
    const sh = ss.getActiveSheet().setName(CONFIG.DATA_SHEET);
    sh.getRange(1, 1, 1, BASLIKLAR.length).setValues([BASLIKLAR]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, C.SIPARIS_TARIHI, 5000, 2).setNumberFormat('dd.MM.yyyy HH:mm:ss');
    sh.getRange(1, C.HAZIRLANMA, 5000, 1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
    Logger.log('Test tablosu oluşturuldu: ' + ss.getUrl());
  }
  return ss.getSheetByName(CONFIG.DATA_SHEET);
}
function satirBul_(sh, id) {
  const hit = sh.getRange(1, C.ID, sh.getLastRow(), 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}
function son10_(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}
function isoToDate_(iso) {
  if (!iso || String(iso).length < 19) return '';
  const s = String(iso);
  return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19));
}
function acikIndeksOku_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('acikSiparisler') || '{}');
}
function acikIndeksYaz_(obj) {
  PropertiesService.getScriptProperties().setProperty('acikSiparisler', JSON.stringify(obj));
}
function bildir_(konu, metin) {
  if (CONFIG.MAKE_WEBHOOK_URL) {
    try { UrlFetchApp.fetch(CONFIG.MAKE_WEBHOOK_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ konu, mesaj: metin }), muteHttpExceptions: true }); }
    catch (e) { Logger.log('Webhook hatası: ' + e); }
  }
  if (CONFIG.NOTIFY_EMAIL) MailApp.sendEmail(CONFIG.NOTIFY_EMAIL, konu, metin);
}
function hataBildir_(e) {
  const p = PropertiesService.getScriptProperties();
  const son = Number(p.getProperty('sonHataZamani') || 0);
  if (Date.now() - son < 3600e3) return;
  p.setProperty('sonHataZamani', String(Date.now()));
  bildir_('⚠️ Adisyo sipariş scripti hata', String(e));
}


// ============================================================
// HEMENYOLDA TAHSİL SENKRONU (06:30, gece köprüsü veriyi yazdıktan sonra)
// Siparişler!R (Hesap) = "Alındı" → AE "Ödeme Alındı (..)"; Açık Hesaplar'da olanlar → "Ödeme Bekleniyor (..)"
// Eşleştirme anahtarı: tarih (gg.aa.yyyy) + adisyon no
// ============================================================
function tahsilSenkron() {
  const tz = 'Europe/Istanbul';
  // Sessiz saat: köprü 03:30–09:30 arası çalışmıyor, veri değişmez
  const simdi = new Date();
  const h = Number(Utilities.formatDate(simdi, tz, 'H')), m = Number(Utilities.formatDate(simdi, tz, 'm'));
  const dk = h * 60 + m;
  if (dk >= 3 * 60 + 30 && dk < 9 * 60 + 30) { Logger.log('Sessiz saat, senkron atlandı.'); return; }
  const hy = SpreadsheetApp.openById(CONFIG.HY_SS_ID);
  const key = (tarih, adisyon) => {
    const t = (tarih instanceof Date) ? Utilities.formatDate(tarih, tz, 'dd.MM.yyyy') : String(tarih || '').trim();
    const a = String(adisyon || '').trim().replace(/\D/g, '');
    return t && a ? t + '|' + a : '';
  };

  // Açık Hesaplar: A Tarih, B Adisyon No, K Durum
  const acikKeys = new Set();
  const acikSh = hy.getSheetByName(CONFIG.HY_ACIK_SHEET);
  if (acikSh && acikSh.getLastRow() > 1) {
    acikSh.getRange(2, 1, acikSh.getLastRow() - 1, 11).getValues().forEach(r => { const k = key(r[0], r[1]); if (k) acikKeys.add(k); });
  }
  // Siparişler: A Tarih, C Adisyon No, R Hesap (son ~2500 satır yeter)
  const hesapMap = {};
  const sipSh = hy.getSheetByName(CONFIG.HY_SIPARIS_SHEET);
  if (sipSh && sipSh.getLastRow() > 1) {
    const last = sipSh.getLastRow();
    const bas = Math.max(2, last - 2500);
    sipSh.getRange(bas, 1, last - bas + 1, 18).getValues().forEach(r => { const k = key(r[0], r[2]); if (k) hesapMap[k] = String(r[17] || '').trim(); });
  }

  const sh = dataSheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const bas = Math.max(2, last - 1500);
  const rows = sh.getRange(bas, 1, last - bas + 1, SON_KOLON).getValues();
  const sinir = Date.now() - CONFIG.TAHSIL_GERI_GUN * 86400e3;
  let alindi = 0, bekleyen = 0, eslesmeyen = 0;
  const yaz = [];
  rows.forEach((r, i) => {
    const t = r[C.SIPARIS_TARIHI - 1];
    if (!(t instanceof Date) || t.getTime() < sinir) return;
    if (String(r[C.DURUM - 1] || '') === CONFIG.DURUM.IPTAL) return;
    const mevcutAE = r[C.TAHSIL - 1];
    const eskiAlindi = mevcutAE === true;
    const eskiBekliyor = String(mevcutAE || '').indexOf('Bekleniyor') >= 0;
    const base = tahsilTipi_(r[C.ODEME - 1]);
    if (!base) return;
    if (base === 'ONLINE') { if (!eskiAlindi) yaz.push([bas + i, base, true]); return; }
    const k = key(t, r[C.ORDER_NO - 1]);
    let yeniAlindi = eskiAlindi;
    if (acikKeys.has(k)) { yeniAlindi = false; bekleyen++; }
    else if (hesapMap[k] !== undefined) {
      const h = nrm_(hesapMap[k]);
      if (h.indexOf('alindi') >= 0 || h === 'online') { yeniAlindi = true; alindi++; }
      else { yeniAlindi = false; bekleyen++; }
    } else { eslesmeyen++; }
    if (yeniAlindi !== eskiAlindi || (!yeniAlindi && !eskiBekliyor)) yaz.push([bas + i, base, yeniAlindi]);
  });
  yaz.forEach(([row, base, a]) => tahsilYaz_(sh, row, base, a));
  Logger.log(`Tahsil senkronu: ${alindi} alındı, ${bekleyen} bekliyor, ${eslesmeyen} HemenYolda'da bulunamadı, ${yaz.length} hücre güncellendi.`);
}


// ============================================================
// GERİYE DÖNÜK: tüm satırlarda Mahalle (N) ve Ürün Çıkan Şube (O) doldur
// Elle çalıştır. 5 dk sınırına yaklaşınca durur; tekrar çalıştırınca kaldığı yerden devam eder.
// ============================================================
function mahalleleriDoldur() {
  CacheService.getScriptCache().remove('mahalleListesi');   // liste taze okunsun
  const sh = dataSheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const liste = mahalleListesi_();
  const tamAdSet = new Set(liste.map(m => nrm_(m.tamAd)));
  const rows = sh.getRange(2, 1, last - 1, Math.max(C.BOLGE, C.ADRES, C.CIKAN_SUBE)).getValues();
  const basla = Date.now();
  let dolu = 0, bulunamadi = 0, atlanan = 0, islenen = 0;
  const notlar = [];
  for (let i = 0; i < rows.length; i++) {
    if (Date.now() - basla > 270000) { Logger.log('Süre doldu, tekrar çalıştır.'); break; }
    const r = rows[i];
    const rowNo = i + 2;
    const mevcutN = String(r[C.BOLGE - 1] || '').trim();
    const mevcutO = String(r[C.CIKAN_SUBE - 1] || '').trim();
    if (mevcutN && tamAdSet.has(nrm_(mevcutN)) && mevcutO) { notSil_(sh, rowNo, 'Mahalle bulunamadı'); atlanan++; continue; }   // zaten standart
    islenen++;
    const mh = mahalleCoz_({ customer: { region: mevcutN, address: r[C.ADRES - 1] } });
    if (mh) {
      sh.getRange(rowNo, C.BOLGE).setValue(mh.tamAd);
      sh.getRange(rowNo, C.CIKAN_SUBE).setValue(mh.sube);
      notSil_(sh, rowNo, 'Mahalle bulunamadı');
      dolu++;
    } else {
      bulunamadi++;
      notlar.push(rowNo);
    }
  }
  // bulunamayanlara not (aynı notu tekrar yazma)
  notlar.forEach(rowNo => {
    const eski = String(sh.getRange(rowNo, C.NOT).getValue() || '');
    if (eski.indexOf('Mahalle bulunamadı') < 0) notEkle_(sh, rowNo, 'Mahalle bulunamadı');
  });
  Logger.log(`Mahalle doldurma: ${islenen} satır işlendi, ${dolu} dolduruldu, ${bulunamadi} bulunamadı, ${atlanan} zaten standarttı.`);
}


// Sütunları başlık adına göre BASLIKLAR sırasına diz. Bilinmeyen sütunlar sona eklenir, hiçbir veri silinmez.
function sutunlariSirala_(sh) {
  const lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
  if (lastRow < 1 || lastCol < 1) return;
  const mevcut = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(x => String(x || '').trim());
  const hedefN = BASLIKLAR.map(nrm_);
  const mevcutN = mevcut.map(nrm_);
  // zaten doğru sıradaysa çık
  if (hedefN.every((h, i) => mevcutN[i] === h)) return;
  const eksik = BASLIKLAR.filter(b => mevcutN.indexOf(nrm_(b)) < 0);
  // eksik başlıklar boş sütun olarak eklenecek; fazlalar sona taşınır
  const kaynakIdx = BASLIKLAR.map(b => mevcutN.indexOf(nrm_(b)));           // -1 = yeni boş sütun
  const fazlaIdx = mevcutN.map((m, i) => i).filter(i => mevcut[i] && hedefN.indexOf(mevcutN[i]) < 0);
  const data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const yeni = data.map((r, ri) => {
    const satir = kaynakIdx.map((k, ci) => ri === 0 ? BASLIKLAR[ci] : (k >= 0 ? r[k] : ''));
    fazlaIdx.forEach(k => satir.push(r[k]));
    return satir;
  });
  const yeniCol = yeni[0].length;
  sh.getRange(1, 1, lastRow, lastCol).clearContent().clearDataValidations().clearFormat();
  if (sh.getMaxColumns() < yeniCol) sh.insertColumnsAfter(sh.getMaxColumns(), yeniCol - sh.getMaxColumns());
  sh.getRange(1, 1, lastRow, yeniCol).setValues(yeni);
  sh.getRange(1, 1, 1, yeniCol).setFontWeight('bold');
  // Ödeme Alındı sütununu onay kutusu / kırmızı yazı biçimine geri getir
  for (let ri = 1; ri < yeni.length; ri++) {
    const v = yeni[ri][C.TAHSIL - 1];
    const base = tahsilTipi_(yeni[ri][C.ODEME - 1]);
    if (v === true || String(v).toUpperCase() === 'TRUE') tahsilYaz_(sh, ri + 1, base, true);
    else if (String(v).indexOf('Bekleniyor') >= 0) tahsilYaz_(sh, ri + 1, base, false);
  }
  if (fazlaIdx.length) Logger.log('Tanınmayan sütunlar sona taşındı: ' + fazlaIdx.map(i => mevcut[i]).join(', '));
  if (eksik.length) Logger.log('Yeni boş sütunlar eklendi: ' + eksik.join(', '));
  Logger.log('Sütunlar yeni sıraya dizildi (' + (lastRow - 1) + ' satır). Onay kutuları için tahsilSenkron çalıştır.');
}


// ============================================================
// MÜŞTERİ ETİKETLERİ (Ana Musteri Listesi K-N onay kutuları, O not)
// Etiketli müşteri sipariş verince: siparişin Not sütununa yazılır + bildirim gider
// ============================================================
function musteriEtiketleri_() {
  const cache = CacheService.getScriptCache();
  const c = cache.get('musteriEtiketleri');
  if (c) return JSON.parse(c);
  const map = {};
  try {
    const sh = SpreadsheetApp.openById(CONFIG.MUSTERI_SS_ID).getSheetByName(CONFIG.MUSTERI_SHEET);
    const last = sh.getLastRow();
    if (last >= 2) {
  const v = sh.getRange(2, 1, last - 1, M.TY_TARIH).getValues();      v.forEach(r => {
        const tags = ETIKETLER.filter((_, i) => r[M.ETIKET_ILK - 1 + i] === true);
        if (!tags.length) return;
        const tel = son10_(r[M.TEL - 1]);
           if (tel) map[tel] = { tags, not: String(r[M.ETIKET_NOT - 1] || '').trim(),
                          isim: String(r[M.ISIM - 1] || ''),
                          tyTarih: r[M.TY_TARIH - 1] instanceof Date
                            ? Utilities.formatDate(r[M.TY_TARIH - 1], 'Europe/Istanbul', 'dd.MM.yyyy') : '' };
      });
    }
  } catch (e) { Logger.log('Etiket okunamadı: ' + e); }
  cache.put('musteriEtiketleri', JSON.stringify(map), 600);   // 10 dk
  return map;
}

function etiketKontrol_(sh, rowNo, d, etiketMap) {
   const ham = String((d.customer && d.customer.customerPhone) || '');
   if (!ham || ham.indexOf('/') >= 0) { tyKontrol_(sh, rowNo, d); return; }
   const tel = son10_(ham);
   if (!tel || !etiketMap[tel]) return;
  const e = etiketMap[tel];
const metin = '⚠️ ' + e.tags.join(', ') + (e.tyTarih ?' (son TY puanı: ' + e.tyTarih + ')' : '') + (e.not ? ' — ' + e.not : '');
  notEkle_(sh, rowNo, metin);
  bildir_('⚠️ Etiketli müşteri sipariş verdi – ' + (e.isim || (d.customer && d.customer.customerName) || tel),
    `⚠️ ETİKETLİ MÜŞTERİ SİPARİŞ VERDİ\n\nEtiket: ${e.tags.join(', ')}${e.not ? '\nNot: ' + e.not : ''}\n\n` +
    `Müşteri: ${(d.customer && d.customer.customerName) || ''} (${tel})\n` +
    `Sipariş: #${d.orderNumber || d.id} – ${d.salesChannelName || ''} – ${d.orderTotal} TL\n` +
    `Ürünler: ${urunListesi_(d)}\nAdres: ${(d.customer && d.customer.address) || ''}`);
}


// ============================================================
// ETİKET GİRİŞİ: Birlesik Musteri Veritabani → "Etiket_Girisi" (Telefon | Etiket | Not | Durum)
// Etiket: İletişim sağlanmayacak / Kara Liste / Sorunlu Müşteri / Yemeksepeti 1-3 puan… (serbest yazım tanınır)
// Başına "KALDIR:" yazılırsa işaret kaldırılır. İşlenen satır D'ye damgalanır, tekrar işlenmez.
// ============================================================
function etiketIndeksi_(metin) {
  const t = nrm_(metin);
  if (!t) return -1;
  if (t.indexOf('iletisim') >= 0) return 0;
  if (t.indexOf('kara') >= 0) return 1;
    if (t.indexOf('trendyol') >= 0 || t.indexOf('ty ') === 0 || t === 'ty') return 4;
  if (t.indexOf('puan') >= 0 || t.indexOf('yemeksepeti') >= 0 || t.indexOf('ys') === 0) return 3;
  return -1;
}

function etiketleriUygula() {
  const ss = SpreadsheetApp.openById(CONFIG.MUSTERI_SS_ID);
  const gs = ss.getSheetByName('Etiket_Girisi');
  if (!gs || gs.getLastRow() < 2) return;
  const ms = ss.getSheetByName(CONFIG.MUSTERI_SHEET);
  const giris = gs.getRange(2, 1, gs.getLastRow() - 1, 4).getValues();
  const bekleyen = giris.map((r, i) => ({ row: i + 2, tel: son10_(r[0]), etiket: String(r[1] || '').trim(), not: String(r[2] || '').trim(), durum: String(r[3] || '').trim() }))
    .filter(x => x.tel && x.etiket && !x.durum);
  if (!bekleyen.length) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const telSutunu = ms.getRange(2, M.TEL, Math.max(ms.getLastRow() - 1, 1), 1).getValues().map(r => son10_(r[0]));
    const bugun = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy HH:mm');
    let islendi = 0, yeniMusteri = 0, hatali = 0;
    bekleyen.forEach(x => {
      const kaldir = /^kald[iı]r\b/i.test(x.etiket);
      const idx = etiketIndeksi_(x.etiket.replace(/^kald[iı]r\s*:?\s*/i, ''));
      if (idx < 0) { gs.getRange(x.row, 4).setValue('HATA: etiket tanınmadı'); hatali++; return; }
      let row = telSutunu.indexOf(x.tel), yeni = false;
      if (row >= 0) row += 2;
      else if (kaldir) { gs.getRange(x.row, 4).setValue('Müşteri bulunamadı'); hatali++; return; }
      else {
        const r = new Array(M.ETIKET_NOT).fill('');
        r[M.TEL - 1] = x.tel; r[M.KAYNAK - 1] = 'Etiket girişi';
        ms.appendRow(r); row = ms.getLastRow(); telSutunu.push(x.tel); yeniMusteri++; yeni = true;
      }
      ms.getRange(row, M.ETIKET_ILK + idx).setValue(!kaldir);
      if (x.not && !kaldir) {
        const eski = String(ms.getRange(row, M.ETIKET_NOT).getValue() || '');
        ms.getRange(row, M.ETIKET_NOT).setValue(eski && eski.indexOf(x.not) < 0 ? eski + ' | ' + x.not : (eski || x.not));
      }
      gs.getRange(x.row, 4).setValue((kaldir ? 'Kaldırıldı ' : 'İşlendi ') + bugun + (yeni ? ' (yeni müşteri satırı açıldı)' : ''));
      islendi++;
    });
    islendiVar_ = islendi > 0;
    CacheService.getScriptCache().remove('musteriEtiketleri');
    Logger.log(`Etiket: ${islendi} işlendi (${yeniMusteri} yeni müşteri satırı), ${hatali} hatalı.`);
  } finally { lock.releaseLock(); }
  if (islendiVar_) listelenenSenkron();
}
var islendiVar_ = false;

// WhatsApp memnuniyet senaryosunun okuduğu "Listelenen Müşteriler" (eski BAP veri tablosu) listesini
// Ana Musteri Listesi'ndeki kutulardan yeniden üretir. Mesaj GİTMEYECEK etiketler: İletişim Sağlanmayacak, Kara Liste, YS 1-3 Puan.
const MESAJ_ENGEL_ETIKET_IDX = [0, 1, 3];
function listelenenSenkron() {
  const ms = SpreadsheetApp.openById(CONFIG.MUSTERI_SS_ID).getSheetByName(CONFIG.MUSTERI_SHEET);
  const last = ms.getLastRow();
  const satirlar = [];
  if (last >= 2) {
    ms.getRange(2, 1, last - 1, M.ETIKET_NOT).getValues().forEach(r => {
      const tel = son10_(r[M.TEL - 1]);
      if (!tel) return;
      const engel = MESAJ_ENGEL_ETIKET_IDX.filter(i => r[M.ETIKET_ILK - 1 + i] === true).map(i => ETIKETLER[i]);
      if (engel.length) satirlar.push([tel, engel.join(', '), 1]);
    });
  }
  const ls = SpreadsheetApp.openById(CONFIG.DATA_SS_ID).getSheetByName('Listelenen Müşteriler');
  if (!ls) { Logger.log('Listelenen Müşteriler sekmesi bulunamadı'); return; }
  const eskiSon = ls.getLastRow();
  if (eskiSon >= 2) ls.getRange(2, 1, eskiSon - 1, 3).clearContent();
  if (satirlar.length) {
    ls.getRange(2, 1, satirlar.length, 3).setValues(satirlar);
    ls.getRange(2, 1, satirlar.length, 1).setNumberFormat('@');
  }
  Logger.log('Listelenen Müşteriler yenilendi: ' + satirlar.length + ' numara mesaj almayacak.');
}


// GERİYE DÖNÜK: son TAHSIL_GERI_GUN günün siparişlerine etiketli müşteri notu düşer (mail atmaz). Elle çalıştır.
function etiketNotlariniDoldur() {
  CacheService.getScriptCache().remove('musteriEtiketleri');
  const etiketMap = musteriEtiketleri_();
  if (!Object.keys(etiketMap).length) { Logger.log('Etiketli müşteri yok (önce etiketleriUygula çalıştır).'); return; }
  const sh = dataSheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const bas = Math.max(2, last - 1500);
  const rows = sh.getRange(bas, 1, last - bas + 1, SON_KOLON).getValues();
  const sinir = Date.now() - CONFIG.TAHSIL_GERI_GUN * 86400e3;
  let yazilan = 0;
  rows.forEach((r, i) => {
    const t = r[C.SIPARIS_TARIHI - 1];
    if (!(t instanceof Date) || t.getTime() < sinir) return;
    const tel = son10_(r[C.TELEFON - 1]);
    const e = tel && etiketMap[tel];
    if (!e) return;
    const metin = '⚠️ ' + e.tags.join(', ') + (e.not ? ' — ' + e.not : '');
    if (String(r[C.NOT - 1] || '').indexOf('⚠️ ' + e.tags[0]) >= 0) return;
    notEkle_(sh, bas + i, metin);
    yazilan++;
  });
  Logger.log('Etiket notu düşülen sipariş: ' + yazilan);
}


// ============================================================
// ESKİ VERİYİ DÖNÜŞTÜR: canlı Make.com Data (eski 30 sütunlu düzen) → yeni düzen, ayrı sekmeye
// Kullanım: eskiVeriyiDonustur(2026)   → bu tabloda "Eski_2026" sekmesi
// 5 dk sınırında durur, tekrar çalıştırınca kaldığı yerden devam eder (ilerleme Script Properties'te).
// ============================================================
const ESKI = { ID: 1, ODEME: 2, TUTAR: 3, EXT_APP: 4, SIP_TARIHI: 5, TESLIM: 6, TIP: 7, NO: 8, MUSTERI: 9, TEL: 10, ADRES: 11,
  KURYE: 12, URUN: 13, SUBE: 14, MAHALLE: 15, CIKAN_SUBE: 16, MARKA: 17, HAZIRLANMA: 21, URUNLER: 22, FIYAT: 23, ADET: 24,
  KATEGORI: 25, MOTOR: 27, TARIH_ISO: 28, DURUM: 29, NOT: 30 };

function eskiVeriyiDonustur2026() { eskiVeriyiDonustur(2026); }
function eskiVeriyiDonustur2025() { eskiVeriyiDonustur(2025); }
function eskiVeriyiDonustur2024() { eskiVeriyiDonustur(2024); }

function eskiVeriyiDonustur(yil) {
  const basla = Date.now();
  const props = PropertiesService.getScriptProperties();
  const propKey = 'donustur_' + yil;
  const kaynak = SpreadsheetApp.openById(CONFIG.DATA_SS_ID).getSheetByName(CONFIG.ESKI_DATA_SHEET);
  const hedefSs = SpreadsheetApp.getActiveSpreadsheet();
  let hedef = hedefSs.getSheetByName('Eski_' + yil);
  if (!hedef) {
    hedef = hedefSs.insertSheet('Eski_' + yil);
    hedef.getRange(1, 1, 1, BASLIKLAR.length).setValues([BASLIKLAR]).setFontWeight('bold');
    hedef.setFrozenRows(1);
    hedef.getRange(1, C.SIPARIS_TARIHI, hedef.getMaxRows(), 3).setNumberFormat('dd.MM.yyyy HH:mm:ss');
    props.deleteProperty(propKey);
  }
  // Yeni ana tabloda zaten olan ID'ler (mükerrer olmasın)
  const ana = dataSheet_();
  const varOlan = new Set();
  if (ana.getLastRow() > 1) ana.getRange(2, C.ID, ana.getLastRow() - 1, 1).getValues().forEach(r => { if (r[0] !== '') varOlan.add(String(r[0])); });
  if (hedef.getLastRow() > 1) hedef.getRange(2, C.ID, hedef.getLastRow() - 1, 1).getValues().forEach(r => { if (r[0] !== '') varOlan.add(String(r[0])); });

  CacheService.getScriptCache().remove('mahalleListesi');
  const etiketMap = musteriEtiketleri_();
  const geoEski = CONFIG.GEOCODE; CONFIG.GEOCODE = false;   // toplu işte harita kullanma (kota)

  const sonSatir = kaynak.getLastRow();
  let bas = Number(props.getProperty(propKey) || 2);
  const PARCA = 500;
  let yazilanToplam = 0, mahalleYok = 0, etiketli = 0, atlanan = 0;
  try {
    while (bas <= sonSatir) {
      if (Date.now() - basla > 250000) { Logger.log(`Süre doldu; ${bas}. satırda kaldı, tekrar çalıştır.`); break; }
      const n = Math.min(PARCA, sonSatir - bas + 1);
      const genislik = Math.min(ESKI.NOT, kaynak.getLastColumn());
      const blok = kaynak.getRange(bas, 1, n, genislik).getValues().map(r => r.concat(new Array(ESKI.NOT - genislik).fill('')));
      const cikti = [];
      blok.forEach(r => {
        const t = r[ESKI.SIP_TARIHI - 1];
        if (!(t instanceof Date) || t.getFullYear() !== yil) return;
        const id = String(r[ESKI.ID - 1] || '');
        if (!id || varOlan.has(id)) { atlanan++; return; }
        varOlan.add(id);
        const y = new Array(SON_KOLON).fill('');
        y[C.ID - 1] = r[ESKI.ID - 1];
        y[C.ORDER_NO - 1] = r[ESKI.NO - 1];
        y[C.SIPARIS_TARIHI - 1] = t;
{ const eh = r[ESKI.HAZIRLANMA - 1];
  y[C.HAZIRLANMA - 1] = (eh instanceof Date && eh.getFullYear() >= 2000) ? eh : ''; }        y[C.TESLIM_TARIHI - 1] = r[ESKI.TESLIM - 1];
        y[C.SUBE - 1] = r[ESKI.SUBE - 1];
        y[C.ORDER_TYPE - 1] = r[ESKI.TIP - 1];
        y[C.EXT_APP - 1] = r[ESKI.EXT_APP - 1];
        y[C.MARKA - 1] = r[ESKI.MARKA - 1] || r[ESKI.CIKAN_SUBE - 1] || '';
        y[C.ODEME - 1] = r[ESKI.ODEME - 1];
        y[C.MUSTERI - 1] = r[ESKI.MUSTERI - 1];
        y[C.TELEFON - 1] = r[ESKI.TEL - 1];
        y[C.ADRES - 1] = r[ESKI.ADRES - 1];
        y[C.KATEGORI - 1] = r[ESKI.KATEGORI - 1];
        y[C.URUN_ADLARI - 1] = r[ESKI.URUNLER - 1] || r[ESKI.URUN - 1];
        y[C.ADET - 1] = r[ESKI.ADET - 1];
        y[C.BIRIM_FIYAT - 1] = r[ESKI.FIYAT - 1];
        y[C.TUTAR - 1] = r[ESKI.TUTAR - 1];
        y[C.KURYE - 1] = r[ESKI.KURYE - 1];
        y[C.MOTOR - 1] = r[ESKI.MOTOR - 1];
        y[C.TARIH_ISO - 1] = r[ESKI.TARIH_ISO - 1];
        const eskiDurum = String(r[ESKI.DURUM - 1] || '').trim();
        y[C.DURUM - 1] = (eskiDurum === CONFIG.DURUM.IPTAL) ? CONFIG.DURUM.IPTAL : CONFIG.DURUM.KAPALI;
        // mahalle + şube
        const mh = mahalleCoz_({ customer: { region: r[ESKI.MAHALLE - 1], address: r[ESKI.ADRES - 1] } });
        const notlar = [];
        const eskiNot = String(r[ESKI.NOT - 1] || '').trim();
        if (eskiNot) notlar.push(eskiNot);
        if (mh) { y[C.BOLGE - 1] = mh.tamAd; y[C.CIKAN_SUBE - 1] = mh.sube; }
        else { y[C.BOLGE - 1] = r[ESKI.MAHALLE - 1] || ''; notlar.push('Mahalle bulunamadı'); mahalleYok++; }
        // etiket
        const tel = son10_(r[ESKI.TEL - 1]);
        if (tel && etiketMap[tel]) { const e = etiketMap[tel]; notlar.push('⚠️ ' + e.tags.join(', ') + (e.not ? ' — ' + e.not : '')); etiketli++; }
        y[C.NOT - 1] = notlar.join(' | ');
        // tahsil: geçmiş sipariş → alındı
        const base = tahsilTipi_(r[ESKI.ODEME - 1]);
        y[C.TAHSIL_TIP - 1] = tipAdi_(base);
        y[C.TAHSIL - 1] = base ? true : '';
        cikti.push(y);
      });
      if (cikti.length) {
        const ilk = hedef.getLastRow() + 1;
        hedef.getRange(ilk, 1, cikti.length, SON_KOLON).setValues(cikti);
        hedef.getRange(ilk, C.TAHSIL, cikti.length, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build()).setHorizontalAlignment('center');
        yazilanToplam += cikti.length;
      }
      bas += n;
      props.setProperty(propKey, String(bas));
    }
  } finally { CONFIG.GEOCODE = geoEski; }
  if (bas > sonSatir) { props.deleteProperty(propKey); Logger.log(`TAMAMLANDI (${yil}).`); }
  Logger.log(`${yil}: ${yazilanToplam} satır yazıldı, ${mahalleYok} mahalle bulunamadı, ${etiketli} etiketli müşteri, ${atlanan} zaten var/atlandı. Sekme: Eski_${yil}`);
}

function tarihTeshis() {
  const liste = tamamlananSiparisler_(6);   // son 6 saatin tamamlananları
  Logger.log('Kayıt: ' + liste.length + '  |  Script saati: ' +
    Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy HH:mm:ss'));
  liste.slice(0, 5).forEach(d => {
    Logger.log(`#${d.orderNumber || d.id}
      insertDate   : ${d.insertDate}
      preparedDate : ${d.preparedDate}
      closedDate   : ${d.closedDate}
      updateDate   : ${d.updateDate}`);
  });
}

function detayTeshis() {
  // Ekrandaki bozuk satırlardan biri — sipariş ID
  const id = '454225303';
  const d = adisyoSiparisDetay_(id);
  Logger.log(`/Order/${id}
    insertDate   : ${d.insertDate}
    preparedDate : ${d.preparedDate}
    closedDate   : ${d.closedDate}
    updateDate   : ${d.updateDate}
    statusId     : ${d.statusId}`);
}

// ============================================================
// TEK SEFERLİK ONARIM: Hazırlanma (D) sütunu
//  1) "1900" çöp değerleri boşalt
//  2) Hazırlanma > Teslim olan satırlardan 3 saat düş
// Güvenli: doğru satırlara dokunmaz, tekrar çalıştırılabilir.
// Önce KURU=true ile çalıştır, log'a bak; sonra false yapıp uygula.
// ============================================================
function hazirlanmaOnar() {
  const KURU = true;                 // true = sadece rapor, yazma yok
  const sh = dataSheet_();
  const last = sh.getLastRow();
  if (last < 2) return;

  const rows = sh.getRange(2, 1, last - 1, C.TESLIM_TARIHI).getValues();
  const yazilacak = [];
  let bosaltilan = 0, duzeltilen = 0, saglam = 0, garip = 0;

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const h = r[C.HAZIRLANMA - 1];
    const t = r[C.TESLIM_TARIHI - 1];
    if (!(h instanceof Date)) return;

    // 1) 1900 çöpü → boşalt
    if (h.getFullYear() < 2000) { yazilacak.push([rowNo, '']); bosaltilan++; return; }

    if (!(t instanceof Date)) return;          // teslim yoksa karşılaştıramayız, dokunma
    const farkDk = (h.getTime() - t.getTime()) / 60000;
    if (farkDk <= 0) { saglam++; return; }     // hazırlanma teslimden önce → doğru

    const yeni = new Date(h.getTime() - 3 * 3600e3);
    if (yeni.getTime() > t.getTime()) {        // 3 saat düşünce hâlâ ters → şüpheli
      garip++;
      Logger.log(`ŞÜPHELİ satır ${rowNo}: hazırlanma ${h} / teslim ${t} (fark ${Math.round(farkDk)} dk)`);
      return;
    }
    yazilacak.push([rowNo, yeni]);
    duzeltilen++;
  });

  Logger.log(`${KURU ? '[KURU ÇALIŞMA — yazılmadı] ' : ''}` +
    `Boşaltılacak (1900): ${bosaltilan} | 3 saat düşülecek: ${duzeltilen} | ` +
    `Zaten doğru: ${saglam} | Şüpheli (elle bak): ${garip}`);

  if (KURU || !yazilacak.length) return;

  // toplu yazım: ardışık blokları tek seferde
  yazilacak.forEach(([rowNo, v]) => sh.getRange(rowNo, C.HAZIRLANMA).setValue(v));
  sh.getRange(2, C.HAZIRLANMA, last - 1, 1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
  Logger.log('Yazıldı.');
}
function tySutunlariniAc() { const ss = SpreadsheetApp.openById(CONFIG.MUSTERI_SS_ID); const sh = ss.getSheetByName(CONFIG.MUSTERI_SHEET);

// N başlığını yeniden adlandırarak sh.getRange(1, 14).setValue('YS 4 Altında Not Veren');

// O'dan önce iki yeni sütun aç: O = TY onay kutusu, P = eski not (kayar), Q = TY tarih sh.insertColumnsBefore(15, 1); // yeni O sh.getRange(1, 15).setValue('TY 4 Altında Not Veren'); const son = sh.getLastRow(); if (son > 1) { sh.getRange(2, 15, oğul - 1, 1) .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build()) .setHorizontalAlignment('center'); } // Artık değil P(16). TY tarihi için Q (17) aç: sh.insertColumnsBefore(17, 1); sh.getRange(1, 17).setValue('TY Son Puan Tarihi'); sh.getRange(2, 17, Math.max(son - 1, 1), 1).setNumberFormat('dd.MM.yyyy');

sh.getRange(1, 1, 1, 17).setFontWeight('bold'); Logger.log('Sütunlar hazır: N=YS, O=TY, P=Not, Q=TY Son Puan Tarihi'); }
function hangiTablo() {
  const ss = SpreadsheetApp.openById(CONFIG.MUSTERI_SS_ID);
  Logger.log(ss.getName() + '\n' + ss.getUrl());
  const sh = ss.getSheetByName(CONFIG.MUSTERI_SHEET);
  Logger.log('Sekme: ' + sh.getName() + ' | sütun sayısı: ' + sh.getLastColumn());
  Logger.log(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].join(' | '));
}
function bildirimTest() {
  bildir_('Test – Trendyol uyarı hattı', 'Bu bir testtir. WhatsApp\'a düştüyse hat çalışıyor.');
}
function hazirlanmaOnar2() {
  const KURU = false;                 // önce true ile çalıştır, log'a bak
  const sh = dataSheet_();
  const last = sh.getLastRow();
  const rows = sh.getRange(2, 1, last - 1, C.TESLIM_TARIHI).getValues();
  const yazilacak = [];
  let duzelen = 0, cozulemeyen = 0;

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const h = r[C.HAZIRLANMA - 1];
    const s = r[C.SIPARIS_TARIHI - 1];
    const t = r[C.TESLIM_TARIHI - 1];
    if (!(h instanceof Date) || !(s instanceof Date) || !(t instanceof Date)) return;
    if (h.getTime() <= t.getTime()) return;          // zaten doğru

    let bulundu = null;
    [3, 6, 9, 12].forEach(saat => {
      if (bulundu) return;
      const aday = new Date(h.getTime() - saat * 3600e3);
      if (aday.getTime() >= s.getTime() && aday.getTime() <= t.getTime()) bulundu = { aday, saat };
    });

    if (bulundu) {
      yazilacak.push([rowNo, bulundu.aday]);
      duzelen++;
      if (KURU) Logger.log('Satır ' + rowNo + ': -' + bulundu.saat + ' saat → ' +
        Utilities.formatDate(bulundu.aday, 'Europe/Istanbul', 'dd.MM.yyyy HH:mm:ss'));
    } else {
      cozulemeyen++;
      Logger.log('ÇÖZÜLEMEDİ satır ' + rowNo + ': sipariş ' + s + ' / hazırlanma ' + h + ' / teslim ' + t);
    }
  });

  Logger.log((KURU ? '[KURU ÇALIŞMA] ' : '') + 'Düzeltilecek: ' + duzelen + ' | çözülemeyen: ' + cozulemeyen);
  if (KURU || !yazilacak.length) return;

  yazilacak.forEach(([rowNo, v]) => sh.getRange(rowNo, C.HAZIRLANMA).setValue(v));
  sh.getRange(2, C.HAZIRLANMA, last - 1, 1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
  Logger.log('Yazıldı: ' + yazilacak.length + ' satır');
}