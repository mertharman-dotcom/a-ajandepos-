/*** BAP – SİSTEM NABZI + YEDEKLEME — ÜRETİM v3 (ZIP TABANLI YEDEKLEME) ***
 *
 * DURUM: Tek ve tam üretim dosyası. Geçici TEST/TAMTEST fonksiyonları,
 * doğrulama başarıyla tamamlandıktan sonra kaldırılmıştır.
 *
 * v2 — v1'DE BULUNAN KRİTİK MANTIK HATASININ DÜZELTMESİ:
 *   v1'de _zipYedekOlustur_() canonical "BAP_YEDEK_yyyy-MM-dd.zip" adını,
 *   bazı tablolar bulunamasa/hata verse bile HER ZAMAN yazıyordu. Sonraki
 *   çalıştırmada yedekZipAl() yalnızca bu adın VARLIĞINA bakıp "bugünün
 *   yedeği hazır" diyerek çıktığı için, kısmi/hatalı bir ZIP aynı gün
 *   yapılacak sonraki TAM yedek denemesini kalıcı olarak ENGELLİYORDU.
 *
 *   v2'DE DÜZELTME:
 *     1) Toplama (xlsx dışa aktarım) ve "tam başarı" kararı, canonical
 *        dosya YAZILMADAN ÖNCE tamamlanır (_zipYedekTopla_).
 *     2) "Tam başarı" DEĞİLSE, canonical createFile çağrısına HİÇ
 *        ULAŞILMAZ — kod akışı orada return ile biter (bkz. yedekZipAl).
 *     3) Bugünün canonical ZIP'i kontrolü artık yalnızca ada güvenmiyor;
 *        MIME türü (application/zip), boyut (>0) ve ZIP içindeki
 *        MANIFEST.txt'teki "TAM_BASARI: EVET" işareti de doğrulanıyor
 *        (_zipCanonicalDogrula_). Bu sayede aynı gün oluşmuş (v1
 *        döneminden kalma veya başka bir nedenle bozuk) bir dosya, sonraki
 *        denemeyi artık YANLIŞLIKLA engelleyemez.
 *     4) sonYedek ve _zipYedekTemizle_() YALNIZCA canonical ZIP fiilen ve
 *        başarıyla Drive'a yazıldıktan SONRA çalışır.
 *     5) Kısmi/hatalı durumda üretim fonksiyonu TERCİHEN hiçbir ZIP
 *        yazmaz (istenirse BAP_YEDEK_HATALI_yyyy-MM-dd_HHmmss.zip adıyla
 *        — temizlik regex'ine uymayan bir adla — ayrıca saklanabilir;
 *        bu sürümde bu opsiyon YAZILMADI, yalnızca yorum olarak belgelendi).
 *
 * KORUNANLAR (v1 ile aynı, değiştirilmedi):
 *   NABIZ nesnesi, YEDEKLENECEKLER listesi, nabizKontrol(), kontrolEt_(),
 *   nabizYaz_(), bildirNabiz_(), bulDosya_(), nabizTetikleyiciKur(),
 *   yedekTetikleyiciKur(), yedekTetikleyiciKaldir() — tetikleyici ayrımı
 *   (nabız / yedek) aynen korundu.
 *
 * KALDIRILAN: Eski makeCopy() tabanlı yedekAl() — bu dosyada YOK.
 * ============================================================ */

const NABIZ = {
  ANA_TABLO:   '1gdn_rbaevKx9_-pNTRKL1DDtytFxZHr9QF-jrS4cHPE',
  MUSTERI_DB:  '1dcjX3o-6N9b8ndKt8ALj9MxLg-KZ3I16Z6DI-S9oV1Q',
  HEMENYOLDA:  '1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo',
  KOLAYBI:     '1JJ6UZzh8rSX1FE9Cr-UPzEAaE-2aKtM10bEvjAv2P5w',
  TRENDYOL_YORUM: '1KLWCEBwFMHCTrTnCYLhv2ctg5PvGtS9DNzoMXF-Z1JE',
  PANEL_SHEET: 'Sistem_Nabzi',

  WEBHOOK: 'https://hook.eu1.make.com/6wgq4uajtmy8p7vsl3u7j1rwei70cy58',
  MAIL: '',

  // Anahtar koda yazılmaz (T10): Proje Ayarları › Komut dosyası özellikleri › MAKE_TOKEN. Boşsa Make kontrolü atlanır;
  // Make'i artık BAP Sistem Bekçisi izliyor.
  MAKE_TOKEN: PropertiesService.getScriptProperties().getProperty('MAKE_TOKEN') || '',
  MAKE_SENARYOLAR: [
    { id: 6667782, ad: 'WhatsApp botu' },
    { id: 6674522, ad: 'Memnuniyet mesajı' },
    { id: 7000163, ad: 'Değerlendirme tıklama' },
    { id: 7293450, ad: 'Bildirim hattı' }
  ],

  YEDEK_KLASOR_ID: '1GXCIojyM13z01MvSZSgVAA8e92FbbnSe',
  YEDEK_SAKLA: 10
};

const YEDEKLENECEKLER = [
  'BAP veri tablosu',
  'BAP Personel',
  'Kolaybi Fatura Ham Veri',
  'Trendyol Yorumlar',
  'BAP Adisyo Siparis Datası',
  'BAP Stok Takip Sistemi',
  'Kurye Net Çalışma Süresi',
  'BAP GENEL BİLGİLER',
  'BAP Veri Ambarı',
  'Birlesik Musteri Veritabani'
];

/* ============================================================
 * NABIZ — KAYNAKTAN AYNEN KORUNDU, DEĞİŞTİRİLMEDİ
 * ============================================================ */
function nabizKontrol() {
  const simdi = new Date();
  const saat = Number(Utilities.formatDate(simdi, 'Europe/Istanbul', 'H'));
  const mesaiDe = saat >= 11 && saat < 24;
  const sonuc = [];

  sonuc.push(kontrolEt_('Sipariş toplayıcı', function () {
    const sh = SpreadsheetApp.openById(NABIZ.ANA_TABLO).getSheetByName('Satıs Verileri');
    const son = sh.getLastRow();
    const t = sh.getRange(son, 3).getValue();
    if (!(t instanceof Date)) return { durum: 'ŞÜPHELİ', detay: 'son satırda tarih yok' };
    const dk = Math.round((Date.now() - t.getTime()) / 60000);
    return {
      durum: dk > (mesaiDe ? 90 : 720) ? 'SORUN' : 'OK',
      detay: 'son sipariş ' + dk + ' dk önce (#' + sh.getRange(son, 1).getValue() + ')'
    };
  }));

  sonuc.push(kontrolEt_('HemenYolda köprüsü', function () {
    const sh = SpreadsheetApp.openById(NABIZ.HEMENYOLDA).getSheetByName('Siparişler');
    const son = sh.getLastRow();
    const ham = sh.getRange(son, 1).getValue();
    let t = null;
    if (ham instanceof Date) {
      t = ham;
    } else {
      const m = String(ham || '').match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (m) t = new Date(+m[3], +m[2] - 1, +m[1]);
    }
    if (!t) return { durum: 'ŞÜPHELİ', detay: 'tarih okunamadı: ' + ham };
    const gun = Math.round((Date.now() - t.getTime()) / 86400000);
    return {
      durum: gun > 2 ? 'SORUN' : 'OK',
      detay: 'son kayıt ' + gun + ' gün önce (satır ' + son + ')'
    };
  }));

  sonuc.push(kontrolEt_('Trendyol yorumları', function () {
    const sh = SpreadsheetApp.openById(NABIZ.TRENDYOL_YORUM).getSheetByName('Degerlendirmeler');
    const t = sh.getRange(sh.getLastRow(), 2).getValue();
    const s = t instanceof Date ? Math.round((Date.now() - t.getTime()) / 3600000) : 999;
    return { durum: s > 48 ? 'ŞÜPHELİ' : 'OK', detay: 'son yorum ' + s + ' saat önce' };
  }));

  sonuc.push(kontrolEt_('Kolaybi faturaları', function () {
    const sh = SpreadsheetApp.openById(NABIZ.KOLAYBI).getSheetByName('Sayfa1');
    const n = sh.getLastRow() - 1;
    return { durum: n > 0 ? 'OK' : 'SORUN', detay: n + ' fatura kayıtlı' };
  }));

  sonuc.push(kontrolEt_('Etiket girişi', function () {
    const sh = SpreadsheetApp.openById(NABIZ.MUSTERI_DB).getSheetByName('Etiket_Girisi');
    const son = sh.getLastRow();
    if (son < 2) return { durum: 'OK', detay: 'boş' };
    const bekleyen = sh.getRange(2, 4, son - 1, 1).getValues()
      .filter(function (r) { return !String(r[0] || '').trim(); }).length;
    return { durum: bekleyen > 0 ? 'ŞÜPHELİ' : 'OK', detay: bekleyen + ' bekleyen satır' };
  }));

  sonuc.push(kontrolEt_('Müşteri veritabanı', function () {
    const db = SpreadsheetApp.openById(NABIZ.MUSTERI_DB);
    const ms = db.getSheetByName('Ana Musteri Listesi');
    const ts = db.getSheetByName('Telefonsuz (Getir-Trendyol)');
    return {
      durum: 'OK',
      detay: (ms.getLastRow() - 1) + ' telefonlu, ' + (ts.getLastRow() - 1) + ' telefonsuz kayıt'
    };
  }));

  if (NABIZ.MAKE_TOKEN) {
    NABIZ.MAKE_SENARYOLAR.forEach(function (s) {
      sonuc.push(kontrolEt_('Make: ' + s.ad, function () {
        let res = null;
        for (let d = 0; d < 2; d++) {
          try {
            res = UrlFetchApp.fetch('https://eu1.make.com/api/v2/scenarios/' + s.id, {
              method: 'get',
              headers: { 'Authorization': 'Token ' + NABIZ.MAKE_TOKEN },
              muteHttpExceptions: true
            });
            break;
          } catch (e) {
            Utilities.sleep(3000);
          }
        }
        if (!res) return { durum: 'ŞÜPHELİ', detay: 'Make API yanıt vermedi (ağ)' };
        const kod = res.getResponseCode();
        if (kod === 401) return { durum: 'SORUN', detay: 'token geçersiz' };
        if (kod !== 200) return { durum: 'ŞÜPHELİ', detay: 'API ' + kod };
        const sc = JSON.parse(res.getContentText()).scenario || {};
        return sc.isActive
          ? { durum: 'OK', detay: 'aktif' }
          : { durum: 'SORUN', detay: 'senaryo KAPALI' };
      }));
    });
  }

  sonuc.push(kontrolEt_('Yedekleme', function () {
    const p = PropertiesService.getScriptProperties().getProperty('sonYedek');
    if (!p) return { durum: 'KURULMADI', detay: 'henüz yedek alınmadı' };
    const gun = Math.round((Date.now() - Number(p)) / 86400000);
    return { durum: gun > 2 ? 'SORUN' : 'OK', detay: gun + ' gün önce' };
  }));

  nabizYaz_(sonuc, simdi);

  const sorunlar = sonuc.filter(function (r) { return r[1] === 'SORUN' || r[1] === 'HATA'; });
  const supheli = sonuc.filter(function (r) { return r[1] === 'ŞÜPHELİ'; });
  const saatStr = Utilities.formatDate(simdi, 'Europe/Istanbul', 'HH:mm');
  const satir = function (r) { return '• ' + r[0] + ': ' + r[2]; };

  const sp = PropertiesService.getScriptProperties();
  if (sorunlar.length) {
    const imza = sorunlar.map(function (r) { return r[0]; }).sort().join('|');
    const ayni = imza === sp.getProperty('nabizImza') &&
                 (Date.now() - Number(sp.getProperty('nabizImzaZaman') || 0)) < 6 * 3600000;
    if (ayni) {
      Logger.log('Aynı sorun 6 saat içinde bildirilmişti, tekrar gönderilmedi.');
    } else {
      bildirNabiz_('🔴 Sistem kontrolü ' + saatStr + ' — ' + sorunlar.length + ' sorun',
        sorunlar.map(satir).join('\n') +
        (supheli.length ? '\n\nŞüpheli:\n' + supheli.map(satir).join('\n') : ''));
      sp.setProperty('nabizImza', imza);
      sp.setProperty('nabizImzaZaman', String(Date.now()));
    }
  } else {
    sp.deleteProperty('nabizImza');
  }

  Logger.log('Nabız: ' + sonuc.filter(function (r) { return r[1] === 'OK'; }).length +
             ' OK, ' + sorunlar.length + ' sorun, ' + supheli.length + ' şüpheli');
}

function kontrolEt_(ad, fn) {
  try {
    const r = fn();
    return [ad, r.durum, r.detay];
  } catch (e) {
    return [ad, 'HATA', String(e).slice(0, 120)];
  }
}

function nabizYaz_(sonuc, simdi) {
  const ss = SpreadsheetApp.openById(NABIZ.ANA_TABLO);
  let sh = ss.getSheetByName(NABIZ.PANEL_SHEET);
  if (!sh) sh = ss.insertSheet(NABIZ.PANEL_SHEET);
  sh.clear();
  sh.getRange(1, 1).setValue('BAP Sistem Nabzı').setFontWeight('bold').setFontSize(14);
  sh.getRange(2, 1).setValue('Son kontrol: ' +
    Utilities.formatDate(simdi, 'Europe/Istanbul', 'dd.MM.yyyy HH:mm'));
  sh.getRange(4, 1, 1, 3).setValues([['Sistem', 'Durum', 'Detay']])
    .setFontWeight('bold').setBackground('#f1f3f4');
  sh.getRange(5, 1, sonuc.length, 3).setValues(sonuc);
  sonuc.forEach(function (r, i) {
    const renk = r[1] === 'OK' ? '#e6f4ea' : r[1] === 'ŞÜPHELİ' ? '#fef7e0' : '#fce8e6';
    sh.getRange(i + 5, 1, 1, 3).setBackground(renk);
  });
  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 100);
  sh.setColumnWidth(3, 420);
  sh.setFrozenRows(4);
}

function bildirNabiz_(konu, metin) {
  try {
    UrlFetchApp.fetch(NABIZ.WEBHOOK, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ konu: konu, mesaj: metin }),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('Webhook hatası: ' + e);
  }
  MailApp.sendEmail({
    to: NABIZ.MAIL || Session.getEffectiveUser().getEmail(),
    subject: konu,
    body: metin
  });
}

/** Ada göre e-tablo bulur; aynı adda script/doküman varsa onları eler,
 *  birden fazla e-tablo varsa en son güncelleneni döndürür.
 *  KAYNAKTAN AYNEN KORUNDU. */
function bulDosya_(ad) {
  const it = DriveApp.getFilesByName(ad);
  const adaylar = [];
  while (it.hasNext()) {
    const f = it.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) adaylar.push(f);
  }
  if (!adaylar.length) return null;
  adaylar.sort(function (a, b) { return b.getLastUpdated() - a.getLastUpdated(); });
  if (adaylar.length > 1) {
    Logger.log('DİKKAT: "' + ad + '" adında ' + adaylar.length +
               ' e-tablo var, en son güncellenen alındı.');
  }
  return adaylar[0];
}

/* ============================================================
 * YEDEKLEME — ZIP TABANLI (v2: TOPLAMA / KARAR / YAZMA AYRIŞTIRILDI)
 * Eski makeCopy() tabanlı yedekAl() KALDIRILDI, yerine bu bölüm geldi.
 * ============================================================ */

/** Tek bir tabloyu .xlsx blob'una çevirir. makeCopy() KULLANILMAZ. */
function _zipXlsxAktar_(dosya) {
  const url = 'https://docs.google.com/spreadsheets/d/' + dosya.getId() + '/export?format=xlsx';
  const token = ScriptApp.getOAuthToken();
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('xlsx dışa aktarım HTTP ' + res.getResponseCode());
  }
  return res.getBlob().setName(dosya.getName() + '.xlsx');
}

/** YALNIZCA TOPLAR — hiçbir ZIP yazmaz, hiçbir "başarı" kararı vermez.
 *  Bu ayrım kasıtlıdır: karar ve yazma adımı bu fonksiyonun DIŞINDA,
 *  çağıran tarafından, toplama bittikten SONRA yapılır. */
function _zipYedekTopla_(liste) {
  const basarili = [], bulunamayan = [], hatali = [], blobs = [];

  liste.forEach(function (ad) {
    try {
      const dosya = bulDosya_(ad);
      if (!dosya) { bulunamayan.push(ad); return; }
      const blob = _zipXlsxAktar_(dosya);
      blobs.push(blob);
      basarili.push(ad);
    } catch (e) {
      hatali.push(ad + ': ' + String(e).slice(0, 200));
    }
  });

  return { basarili: basarili, bulunamayan: bulunamayan, hatali: hatali, blobs: blobs };
}

/** MANIFEST.txt içeriğini üretir. TAM_BASARI satırı, hem insan hem de
 *  _zipCanonicalDogrula_() tarafından makine olarak okunabilir bir
 *  işarettir. */
function _zipManifestOlustur_(basarili, bulunamayan, hatali, toplamSayisi, zipAdi, tamBasarili) {
  const simdi = new Date();
  const satirlar = [
    'BAP Yedekleme Manifestosu',
    'ZIP adı: ' + zipAdi,
    'Yedekleme zamanı: ' + Utilities.formatDate(simdi, 'Europe/Istanbul', 'dd.MM.yyyy HH:mm'),
    'TAM_BASARI: ' + (tamBasarili ? 'EVET' : 'HAYIR'),
    '',
    'Başarıyla aktarılan dosyalar (' + basarili.length + '/' + toplamSayisi + '):',
    basarili.length ? basarili.map(function (a) { return '- ' + a; }).join('\n') : '(yok)',
    '',
    'Bulunamayan dosyalar (' + bulunamayan.length + '):',
    bulunamayan.length ? bulunamayan.map(function (a) { return '- ' + a; }).join('\n') : '(yok)',
    '',
    'Hata veren dosyalar (' + hatali.length + '):',
    hatali.length ? hatali.map(function (a) { return '- ' + a; }).join('\n') : '(yok)'
  ];
  return Utilities.newBlob(satirlar.join('\n'), 'text/plain', 'MANIFEST.txt');
}

/** blobs + manifest'i ZIP'ler ve verilen klasöre yazar. makeCopy() ve
 *  SpreadsheetApp.create() KULLANILMAZ. Başarısızlıkta false döner,
 *  hiçbir istisna fırlatmaz (çağıran karar verebilsin diye). */
function _zipYaz_(blobs, manifestBlob, zipAdi, klasor) {
  try {
    const hepsi = blobs.concat([manifestBlob]);
    const zipBlob = Utilities.zip(hepsi, zipAdi);
    klasor.createFile(zipBlob);
    return true;
  } catch (e) {
    Logger.log('ZIP yazma hatası (' + zipAdi + '): ' + e);
    return false;
  }
}

/** Yalnızca tam eşleşen "BAP_YEDEK_yyyy-MM-dd.zip" dosyalarına uygulanır.
 *  TEST/TAMTEST/HATALI ZIP'lerine ve başka hiçbir dosyaya dokunmaz.
 *  Yalnızca canonical ZIP fiilen ve başarıyla yazıldıktan SONRA çağrılır
 *  (çağıran fonksiyon garanti eder). */
function _zipYedekTemizle_(klasor) {
  const desen = /^BAP_YEDEK_(\d{4}-\d{2}-\d{2})\.zip$/;   // tam eşleşme
  const gunler = {};

  const dosyalar = klasor.getFiles();
  while (dosyalar.hasNext()) {
    const f = dosyalar.next();
    if (f.isTrashed()) continue;
    const m = desen.exec(f.getName());
    if (!m) continue;   // desene UYMAYAN (TEST/HATALI dahil) dosyaya asla dokunulmaz
    (gunler[m[1]] = gunler[m[1]] || []).push(f);
  }

  let silinen = 0;
  Object.keys(gunler).sort().reverse().slice(NABIZ.YEDEK_SAKLA).forEach(function (g) {
    gunler[g].forEach(function (f) {
      f.setTrashed(true);   // yalnızca yukarıdaki sıkı regex eşleşmesinden SONRA
      silinen++;
    });
  });

  if (silinen) Logger.log('Zip yedek temizliği: ' + silinen + ' eski ZIP çöpe taşındı.');
}

/** Var olan bir canonical-adlı dosyanın GERÇEKTEN geçerli bir tam-başarılı
 *  yedek olduğunu doğrular. Yalnızca dosya adına GÜVENMEZ:
 *    1) çöpte değil
 *    2) MIME türü application/zip (MimeType.ZIP)
 *    3) boyutu > 0
 *    4) ZIP içindeki MANIFEST.txt'te "TAM_BASARI: EVET" satırı var
 *  Dördü de sağlanmazsa false döner — bu durumda dosya "geçerli bugünkü
 *  yedek" SAYILMAZ ve sonraki deneme ENGELLENMEZ. */
function _zipCanonicalDogrula_(dosya) {
  try {
    if (dosya.isTrashed()) return false;
    if (dosya.getMimeType() !== MimeType.ZIP) return false;
    if (dosya.getSize() <= 0) return false;

    const icerik = Utilities.unzip(dosya.getBlob());
    const manifest = icerik.filter(function (b) { return b.getName() === 'MANIFEST.txt'; })[0];
    if (!manifest) return false;

    const metin = manifest.getDataAsString();
    return metin.indexOf('TAM_BASARI: EVET') > -1;
  } catch (e) {
    Logger.log('Canonical ZIP doğrulama hatası (' + dosya.getName() + '): ' + e);
    return false;   // doğrulanamayan dosya GEÇERSİZ sayılır, deneme engellenmez
  }
}

/** ÜRETİM yedeği. ScriptLock ile korunur.
 *
 *  KRİTİK AKIŞ (v2 düzeltmesi):
 *    1) Toplama YAPILIR, "tam başarı" HESAPLANIR — henüz hiçbir ZIP
 *       yazılmamıştır.
 *    2) Tam başarı DEĞİLSE fonksiyon burada RETURN eder — canonical
 *       createFile çağrısına HİÇ ULAŞILMAZ.
 *    3) Tam başarı İSE canonical ZIP yazılır; yalnızca yazma da fiilen
 *       başarılıysa sonYedek güncellenir ve temizlik çalışır. */
function yedekZipAl() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log('yedekZipAl: kilit alınamadı (başka bir çalışma sürüyor), bu çalışma atlandı.');
    return;
  }

  try {
    const damga = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyy-MM-dd');
    const zipAdi = 'BAP_YEDEK_' + damga + '.zip';
    const klasor = DriveApp.getFolderById(NABIZ.YEDEK_KLASOR_ID);
    const desenTam = /^BAP_YEDEK_\d{4}-\d{2}-\d{2}\.zip$/;

    // Bugünün GEÇERLİ (tam başarılı, doğrulanmış) canonical ZIP'i var mı?
    // Yalnızca ada değil; MIME + boyut + MANIFEST TAM_BASARI işaretine bakılır.
    let mevcutGecerliVarMi = false;
    const mevcutlar = klasor.getFilesByName(zipAdi);
    while (mevcutlar.hasNext()) {
      const mf = mevcutlar.next();
      if (!mf.isTrashed() && desenTam.test(mf.getName()) && _zipCanonicalDogrula_(mf)) {
        mevcutGecerliVarMi = true;
      }
    }
    if (mevcutGecerliVarMi) {
      Logger.log('yedekZipAl: "' + zipAdi + '" zaten mevcut VE doğrulandı (tam başarılı) — ' +
                 'bugünün yedeği hazır kabul edildi. Yeni ZIP OLUŞTURULMADI, temizlik YAPILMADI, ' +
                 'sonYedek DEĞİŞTİRİLMEDİ.');
      return;
    }
    // NOT: Bu noktaya, o gün için ya hiç canonical ZIP yoksa ya da var olan
    // dosya doğrulamadan geçemediyse (örn. kısmi/hatalıysa) gelinir — yani
    // aynı gün oluşmuş GEÇERSİZ bir dosya sonraki denemeyi ENGELLEMEZ.

    const toplama = _zipYedekTopla_(YEDEKLENECEKLER);

    if (toplama.bulunamayan.length) Logger.log('BULUNAMADI: ' + toplama.bulunamayan.join(', '));
    if (toplama.hatali.length)      Logger.log('HATALI: ' + toplama.hatali.join(', '));

    const tamBasarili =
      toplama.basarili.length === YEDEKLENECEKLER.length &&
      toplama.bulunamayan.length === 0 &&
      toplama.hatali.length === 0;

    if (!tamBasarili) {
      // BURADA canonical createFile'a KESİNLİKLE ULAŞILMAZ.
      Logger.log('yedekZipAl: KISMİ/HATALI (' + toplama.basarili.length + '/' +
                 YEDEKLENECEKLER.length + ' başarılı, ' + toplama.bulunamayan.length +
                 ' bulunamadı, ' + toplama.hatali.length + ' hata) — CANONICAL ZIP ' +
                 'YAZILMADI. sonYedek DEĞİŞTİRİLMEDİ, eski yedekler SİLİNMEDİ. ' +
                 '(İsteğe bağlı: kısmi sonuç BAP_YEDEK_HATALI_yyyy-MM-dd_HHmmss.zip ' +
                 'adıyla — temizlik regex\'ine uymayan bir adla — ayrıca saklanabilirdi; ' +
                 'bu sürümde tercihen YAPILMADI.)');
      if (NABIZ.WEBHOOK || NABIZ.MAIL) {
        bildirNabiz_('⚠️ Yedekleme kısmi/hatalı — ZIP oluşturulmadı',
          'Başarılı: ' + toplama.basarili.length + '/' + YEDEKLENECEKLER.length +
          '\nBulunamayan: ' + (toplama.bulunamayan.join(', ') || '(yok)') +
          '\nHatalı: ' + (toplama.hatali.join(', ') || '(yok)') +
          '\n\nCanonical ZIP yazılmadı. sonYedek güncellenmedi, eski yedekler silinmedi. ' +
          'Sonraki çalıştırmada tekrar denenecek.');
      }
      return;
    }

    // Buraya YALNIZCA tam başarıda gelinir.
    const manifestBlob = _zipManifestOlustur_(
      toplama.basarili, toplama.bulunamayan, toplama.hatali,
      YEDEKLENECEKLER.length, zipAdi, true
    );
    const yazildiMi = _zipYaz_(toplama.blobs, manifestBlob, zipAdi, klasor);

    if (yazildiMi) {
      PropertiesService.getScriptProperties().setProperty('sonYedek', String(Date.now()));
      _zipYedekTemizle_(klasor);
      Logger.log('yedekZipAl: TAM BAŞARILI ve ZIP yazıldı — ' + zipAdi +
                 '. sonYedek güncellendi, eski yedekler temizlendi.');
    } else {
      Logger.log('yedekZipAl: Tüm dosyalar başarıyla toplandı AMA ZIP Drive\'a YAZILAMADI (' +
                 zipAdi + '). sonYedek DEĞİŞTİRİLMEDİ, temizlik YAPILMADI. ' +
                 'Sonraki çalıştırmada tekrar denenecek.');
      if (NABIZ.WEBHOOK || NABIZ.MAIL) {
        bildirNabiz_('⚠️ Yedekleme: dosyalar toplandı ama ZIP yazılamadı',
          'ZIP: ' + zipAdi + '\nsonYedek güncellenmedi, eski yedekler silinmedi.');
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 * TETİKLEYİCİLER — v1 İLE AYNI, DEĞİŞTİRİLMEDİ
 * ============================================================ */

/** Yalnızca nabizKontrol tetikleyicilerini kurar/yeniler. Yedek
 *  tetikleyicisi OLUŞTURMAZ; başka bir tetikleyiciye dokunmaz. */
function nabizTetikleyiciKur() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'nabizKontrol'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  [11, 13, 15, 17, 19, 21, 23, 1].forEach(function (saat) {
    ScriptApp.newTrigger('nabizKontrol').timeBased().atHour(saat).nearMinute(0).everyDays(1).create();
  });

  Logger.log('Kuruldu: yalnızca nabız tetikleyicileri (11:00–01:00 arası 2 saatte bir, 8 kontrol). ' +
             'Yedek tetikleyicisi KURULMADI.');
}

/** Yalnızca yedekZipAl için gece 03:00 tetikleyicisi kurar. Bu fonksiyon
 *  dosyanın hiçbir yerinden OTOMATİK ÇAĞRILMAZ — yalnızca Mert'in
 *  onayından sonra bir kez ELLE çalıştırılmalıdır. */
function yedekTetikleyiciKur() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'yedekZipAl'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('yedekZipAl').timeBased().atHour(3).nearMinute(0).everyDays(1).create();
  Logger.log('Kuruldu: yedekZipAl her gece 03:00.');
}

/** Eski nabzı kapatır: yalnız nabizKontrol tetikleyicilerini siler (gece yedeğine dokunmaz).
 *  BAP Sistem Bekçisi (BAP Sistem Nabzı tablosu) bir gün sorunsuz çalıştıktan sonra bir kez elle çalıştırılır;
 *  böylece aynı sorun için iki ayrı e-posta gelmez. Geri açmak için: nabizTetikleyiciKur(). */
function nabizTetikleyiciKaldir() {
  let silinen = 0;
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'nabizKontrol'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); silinen++; });
  Logger.log(silinen + ' nabız tetikleyicisi kaldırıldı. yedekZipAl (gece yedeği) tetikleyicisine dokunulmadı.');
}

/** Hem eski 'yedekAl' (proje üzerinde kalıntı tetikleyicisi olabilir) hem
 *  yeni 'yedekZipAl' tetikleyicilerini kaldırır. nabizKontrol veya başka
 *  hiçbir tetikleyiciye dokunmaz. */
function yedekTetikleyiciKaldir() {
  let silinen = 0;
  ScriptApp.getProjectTriggers()
    .filter(function (t) {
      const h = t.getHandlerFunction();
      return h === 'yedekAl' || h === 'yedekZipAl';
    })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); silinen++; });
  Logger.log(silinen + ' yedek tetikleyicisi (eski yedekAl / yeni yedekZipAl) kaldırıldı. ' +
             'nabizKontrol tetikleyicilerine dokunulmadı.');
}
