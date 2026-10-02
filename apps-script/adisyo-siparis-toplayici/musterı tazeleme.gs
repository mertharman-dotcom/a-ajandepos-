/*** BAP – MÜŞTERİ VERİTABANI TAZELEME ***
 *
 * Adisyo Sipariş Toplayıcı projesine YENİ BİR DOSYA olarak ekle.
 * (CONFIG, M, son10_, nrm_ gibi sabitleri o projeden kullanıyor.)
 *
 * Ne yapar: ana sipariş tablosunda en son işlediği satırdan sonrasını okur,
 *   - telefonu olan müşterileri  → "Ana Musteri Listesi"
 *   - telefonsuz Trendyol/Getir  → "Telefonsuz (Getir-Trendyol)" (adres anahtarıyla)
 * ekler ya da sayaç + son sipariş tarihini günceller.
 *
 * İşlenen son satır Script Properties'te tutulur, aynı sipariş iki kez sayılmaz.
 *
 * KURULUM SIRASI:
 *   1) tazelemeBaslangicAyarla()   → 22 Temmuz'a geri sar (tek sefer)
 *   2) musteriTazele()             → elle çalıştır, birikmiş boşluk kapanana kadar tekrarla
 *   3) tazelemeTetikleyiciKur()    → 14:00 / 17:00 / 20:00 / 23:00 / 02:00
 */

const TZ_PROP = 'musteriTazeleSonSatir';
const TZ_PARCA = 4000;                 // bir turda en fazla kaç sipariş satırı işlensin
const TZ_TELEFONSUZ = 'Telefonsuz (Getir-Trendyol)';
// Telefonsuz sekmesi: A Kanal, B Isim, C Mahalle, D Adres, E Siparis Sayisi,
//                     F Son Siparis Tarihi, G Adres Anahtari, H TY 4 Altında, I TY Son Puan, J Not
const TZ = { KANAL: 1, ISIM: 2, MAHALLE: 3, ADRES: 4, SAYI: 5, SON: 6, ANAHTAR: 7, TY: 8, TY_TARIH: 9, NOT: 10 };

/* ============ 1) Başlangıç noktası ============ */
function tazelemeBaslangicAyarla() {
  const sh = dataSheet_();
  const son = sh.getLastRow();
  const tarihler = sh.getRange(2, C.SIPARIS_TARIHI, son - 1, 1).getValues();
  const hedef = new Date(2026, 6, 22).getTime();      // 22 Temmuz 2026
  let bulunan = son;
  for (let i = 0; i < tarihler.length; i++) {
    const t = tarihler[i][0];
    if (t instanceof Date && t.getTime() >= hedef) { bulunan = i + 2; break; }
  }
  PropertiesService.getScriptProperties().setProperty(TZ_PROP, String(bulunan));
  Logger.log('Tazeleme ' + bulunan + '. satırdan başlayacak (toplam ' + son + ').');
}

/* ============ 2) Ana iş ============ */
function musteriTazele() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('Kilit alınamadı.'); return; }
  const basla = Date.now();
  try {
    const props = PropertiesService.getScriptProperties();
    const sh = dataSheet_();
    const son = sh.getLastRow();
    let bas = Number(props.getProperty(TZ_PROP) || 0);
    if (!bas) { Logger.log('Önce tazelemeBaslangicAyarla() çalıştır.'); return; }
    if (bas > son) { Logger.log('Yeni sipariş yok.'); return; }

    const adet = Math.min(TZ_PARCA, son - bas + 1);
    const rows = sh.getRange(bas, 1, adet, SON_KOLON).getValues();

    const ss = SpreadsheetApp.openById(CONFIG.MUSTERI_SS_ID);
    const ms = ss.getSheetByName(CONFIG.MUSTERI_SHEET);
    const ts = ss.getSheetByName(TZ_TELEFONSUZ);

    // --- mevcut kayıtları belleğe al ---
    const msSon = ms.getLastRow();
    const msVer = msSon > 1 ? ms.getRange(2, 1, msSon - 1, M.SON).getValues() : [];
    const telIdx = {};
    msVer.forEach((r, i) => { const t = son10_(r[M.TEL - 1]); if (t) telIdx[t] = i; });

    const tsSon = ts.getLastRow();
    const tsVer = tsSon > 1 ? ts.getRange(2, 1, tsSon - 1, TZ.NOT).getValues() : [];
    const anahtarIdx = {};
    tsVer.forEach((r, i) => {
      let a = String(r[TZ.ANAHTAR - 1] || '');
      if (!a) { a = tzAnahtar_(r[TZ.ADRES - 1]); tsVer[i][TZ.ANAHTAR - 1] = a; }
      if (a) anahtarIdx[a] = i;
    });

    const msYeni = [], tsYeni = [];
    const msDegisen = {}, tsDegisen = {};
    let telefonlu = 0, telefonsuz = 0, atlanan = 0;

    rows.forEach(r => {
      if (String(r[C.DURUM - 1] || '') === CONFIG.DURUM.IPTAL) { atlanan++; return; }
      const tip = String(r[C.ORDER_TYPE - 1] || '');
      if (tip.indexOf('Paket') < 0 && !String(r[C.ADRES - 1] || '').trim()) { atlanan++; return; }  // masa/gel-al

      const tarih = r[C.SIPARIS_TARIHI - 1];
      const gun = (tarih instanceof Date)
        ? Utilities.formatDate(tarih, 'Europe/Istanbul', 'yyyy-MM-dd') : '';
      const ham = String(r[C.TELEFON - 1] || '').replace(/\s/g, '');
      const isim = String(r[C.MUSTERI - 1] || '');
      const mahalle = String(r[C.BOLGE - 1] || '');
      const adres = String(r[C.ADRES - 1] || '');
      const kanal = String(r[C.EXT_APP - 1] || '');

      const maskeli = ham.indexOf('/') >= 0;
      const tel = (!maskeli && ham.length >= 10) ? ham.slice(-10) : '';

      if (tel) {
        // --- telefonlu: Ana Musteri Listesi ---
        telefonlu++;
        const i = telIdx[tel];
        if (i === undefined) {
          const y = new Array(M.SON).fill('');
          y[M.TEL - 1] = tel; y[M.ISIM - 1] = isim; y[M.MAHALLE - 1] = mahalle;
          y[M.ADRES - 1] = adres; y[M.KAYNAK - 1] = 'Tazeleme (oto)';
          y[M.SAYI - 1] = 1; y[M.SON - 1] = gun;
          telIdx[tel] = msVer.length;
          msVer.push(y);
          msYeni.push(y);
        } else {
          const v = msVer[i];
          v[M.SAYI - 1] = Number(v[M.SAYI - 1] || 0) + 1;
          if (gun > String(v[M.SON - 1] || '')) v[M.SON - 1] = gun;
          if (!v[M.ISIM - 1] && isim) v[M.ISIM - 1] = isim;
          if (!v[M.MAHALLE - 1] && mahalle) v[M.MAHALLE - 1] = mahalle;
          if (adres) v[M.ADRES - 1] = adres;
          if (i < msVer.length - msYeni.length) msDegisen[i] = true;
        }
      } else if (maskeli || /getir|trendyol/i.test(kanal)) {
        // --- telefonsuz: adres anahtarı ---
        const a = tzAnahtar_(adres);
        if (!a) { atlanan++; return; }
        telefonsuz++;
        const i = anahtarIdx[a];
        if (i === undefined) {
          const y = new Array(TZ.NOT).fill('');
          y[TZ.KANAL - 1] = kanal; y[TZ.ISIM - 1] = isim; y[TZ.MAHALLE - 1] = mahalle;
          y[TZ.ADRES - 1] = adres; y[TZ.SAYI - 1] = 1; y[TZ.SON - 1] = gun; y[TZ.ANAHTAR - 1] = a;
          anahtarIdx[a] = tsVer.length;
          tsVer.push(y);
          tsYeni.push(y);
        } else {
          const v = tsVer[i];
          v[TZ.SAYI - 1] = Number(v[TZ.SAYI - 1] || 0) + 1;
          if (gun > String(v[TZ.SON - 1] || '')) { v[TZ.SON - 1] = gun; v[TZ.KANAL - 1] = kanal; }
          if (isim && String(isim).length > String(v[TZ.ISIM - 1] || '').length) v[TZ.ISIM - 1] = isim;
          if (!v[TZ.MAHALLE - 1] && mahalle) v[TZ.MAHALLE - 1] = mahalle;
          if (i < tsVer.length - tsYeni.length) tsDegisen[i] = true;
        }
      } else atlanan++;
    });

    // --- yazım ---
    const eskiMs = msSon - 1, eskiTs = tsSon - 1;
    if (eskiMs > 0) ms.getRange(2, 1, eskiMs, M.SON).setValues(msVer.slice(0, eskiMs));
    if (msYeni.length) ms.getRange(msSon + 1, 1, msYeni.length, M.SON).setValues(msYeni);
    if (eskiTs > 0) ts.getRange(2, 1, eskiTs, TZ.NOT).setValues(tsVer.slice(0, eskiTs));
    if (tsYeni.length) {
      ts.getRange(tsSon + 1, 1, tsYeni.length, TZ.NOT).setValues(tsYeni);
      ts.getRange(tsSon + 1, TZ.TY, tsYeni.length, 1)
        .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build())
        .setHorizontalAlignment('center');
    }

    props.setProperty(TZ_PROP, String(bas + adet));
    CacheService.getScriptCache().remove('musteriEtiketleri');
    const kalan = son - (bas + adet) + 1;
    Logger.log('Tazeleme: ' + adet + ' sipariş işlendi (' + telefonlu + ' telefonlu, ' +
      telefonsuz + ' telefonsuz, ' + atlanan + ' atlandı). ' +
      'Yeni kayıt: ' + msYeni.length + ' + ' + tsYeni.length + '. ' +
      'Kalan satır: ' + Math.max(kalan, 0) + ' | süre: ' + Math.round((Date.now() - basla) / 1000) + ' sn');
  } finally { lock.releaseLock(); }
}

/* ============ Adres anahtarı (telefonsuz eşleştirme) ============ */
function tzAnahtar_(adres) {
  let a = String(adres || '').toLowerCase();
  a = a.split('|||')[0].replace(/mahalle\s*:\s*[^,]*/g, ' ');  a = a.replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
       .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
  a = a.replace(/\b(mah|mh|mahallesi|sok|sk|sokak|sokagi|cd|cad|cadde|caddesi|apt|apartmani|blok|no|kat|daire|kapi|d)\b/g, ' ');
  a = a.replace(/\b(kadikoy|uskudar|atasehir|umraniye|maltepe|istanbul|turkiye)\b/g, ' ');
  a = a.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return a.length >= 8 ? a : '';        // çok kısa anahtarlar güvenilmez
}

/* ============ 3) Tetikleyiciler ============ */
function tazelemeTetikleyiciKur() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'musteriTazele')
    .forEach(t => ScriptApp.deleteTrigger(t));
  [14, 17, 20, 23, 2].forEach(saat => {
    ScriptApp.newTrigger('musteriTazele').timeBased().atHour(saat).nearMinute(5).everyDays(1).create();
  });
  Logger.log('Tetikleyiciler kuruldu: 14:00, 17:00, 20:00, 23:00, 02:00');
}

/* ============ Durum ============ */
function tazelemeDurum() {
  const bas = Number(PropertiesService.getScriptProperties().getProperty(TZ_PROP) || 0);
  const son = dataSheet_().getLastRow();
  Logger.log('İşlenen son satır: ' + bas + ' / ' + son + ' | kalan: ' + Math.max(son - bas + 1, 0));
}