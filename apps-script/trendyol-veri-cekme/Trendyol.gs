/*** BAP – TRENDYOL GO DEĞERLENDİRME TAKİBİ (tek dosya) ***
 *
 * Bu dosya önceki dört dosyanın hepsinin yerine geçer.
 * KURULUM: projedeki diğer Trendyol dosyalarını SİL, sadece bunu bırak.
 *          "Sorunlu Trendyol" sekmesini de silebilirsin, artık kullanılmıyor.
 *
 * Fonksiyonlar:
 *   yorumlariCek()       – ana iş: yorumları çeker, sıralar, özetler, veritabanına işler
 *   gecmisiCek()         – son 90 günü tek seferde çeker
 *   tetikleyiciKur()     – her gece 04:15
 *   sorunluMu(adres)     – dışarıdan sorgu: bu adres düşük puan verdi mi?
 *
 * Ana sipariş tablosuna hiçbir şey YAZILMAZ, sadece okunur.
 */

const TY = {
  ANA_TABLO: '1gdn_rbaevKx9_-pNTRKL1DDtytFxZHr9QF-jrS4cHPE',   // BAP Adisyo Siparis Datası
  ANA_SEKME: 'Satıs Verileri',
  REVIEW_SHEET: 'Degerlendirmeler',      // yorumların yazıldığı sekme (bu tabloda)
  OZET_SHEET: 'Özet',
  MUSTERI_DB: '1dcjX3o-6N9b8ndKt8ALj9MxLg-KZ3I16Z6DI-S9oV1Q',  // Birlesik Musteri Veritabani
  TELEFONSUZ: 'Telefonsuz (Getir-Trendyol)',
  ANA_LISTE: 'Ana Musteri Listesi',

  GUN: 10,                 // gecelik tarama penceresi (müşteri 7 güne kadar yorum yapabiliyor)
  ESIK: 4,                 // bu puanın ALTI düşük sayılır (1-2-3)
  GERI_SATIR: 20000,       // ana tablonun son kaç satırı okunsun

  MAGAZALAR: [
    { supplier: 251784, store: 943,    marka: 'BAP Pizza Erenköy',
      token: 'NHBDY3pUV1dPSUdmWGFGSkdjVTk6Wm1JTlFyV05HVjdLRTBmYlpXUUY=' },
    { supplier: 251784, store: 213171, marka: 'BAP Pizza Fikirtepe',
      token: 'NHBDY3pUV1dPSUdmWGFGSkdjVTk6Wm1JTlFyV05HVjdLRTBmYlpXUUY=' },
    { supplier: 654639, store: 213169, marka: 'BAP Salad & Pasta Fikirtepe',
      token: 'dXVVQzh4cExmRjNtMnlodE5iWUc6RnVQa3pPUUxtR20yOUhwamRqUWY=' },
    { supplier: 654639, store: 155492, marka: 'BAP Salad & Pasta Erenköy',
      token: 'dXVVQzh4cExmRjNtMnlodE5iWUc6RnVQa3pPUUxtR20yOUhwamRqUWY=' }
  ],

  // Telefonsuz (Getir-Trendyol) sütunları
  T: { KANAL: 1, ISIM: 2, MAHALLE: 3, ADRES: 4, SAYI: 5, SON: 6, ANAHTAR: 7, TY: 8, TY_TARIH: 9, NOT: 10 },
  // Ana Musteri Listesi sütunları
  A: { TEL: 1, ISIM: 2, ADRES: 4, TY: 15, NOT: 16, TY_TARIH: 17 }
};

const TY_BASLIK = ['Review ID', 'Değerlendirme Tarihi', 'Sipariş Tarihi', 'Platform Sipariş No',
  'Mağaza', 'Lezzet', 'Servis', 'Teslimat', 'Ortalama', 'Yorum', 'Ürünler',
  'Adisyo Sipariş ID', 'Şube', 'Kurye', 'Mahalle', 'Tutar', 'Eşleşti'];

/* ============================================================
 * 1) ANA İŞ
 * ============================================================ */
function yorumlariCek() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(TY.REVIEW_SHEET);
  if (!sh) {
    sh = ss.insertSheet(TY.REVIEW_SHEET);
    sh.appendRow(TY_BASLIK);
    sh.setFrozenRows(1);
    sh.getRange('D:D').setNumberFormat('@');
    sh.setColumnWidth(10, 320);
    sh.setColumnWidth(11, 260);
  }

  const mevcut = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
      .forEach(r => { if (r[0]) mevcut[r[0]] = true; });
  }

  const bitis = Date.now();
  const baslangic = bitis - TY.GUN * 86400000;
  const eslesme = siparisHaritasi_();
  const yeni = [], dusukler = [];

  TY.MAGAZALAR.forEach(m => {
    let sayfa = 0, toplamSayfa = 1;
    while (sayfa < toplamSayfa && sayfa < 50) {
      const url = 'https://api.tgoapis.com/integrator/review/meal/suppliers/' + m.supplier +
        '/stores/' + m.store + '/reviews/filter?page=' + sayfa + '&size=50' +
        '&startDate=' + baslangic + '&endDate=' + bitis;
      const res = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: {
          'Authorization': 'Basic ' + m.token,
          'User-Agent': m.supplier + ' - SelfIntegration',
          'Accept': 'application/json'
        },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() !== 200) {
        Logger.log(m.marka + ' HATA ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
        tyErisimHatasi_('Yorumlar', res.getResponseCode(), res.getContentText());
        break;
      }
      const j = JSON.parse(res.getContentText());
      toplamSayfa = j.totalPages || 0;
      (j.content || []).forEach(r => {
        if (mevcut[r.reviewId]) return;
        mevcut[r.reviewId] = true;
        const no = String(r.orderParentId || '');
        const s = eslesme[no] || {};
        const puan = (r.rating && r.rating.average) || '';
        const urunler = (r.products || []).map(p => p.name).join(', ');
        const yorum = (r.comment && r.comment.text) || '';
        yeni.push([
          r.reviewId, new Date(r.createdDate), new Date(r.orderCreatedDate), no, m.marka,
          r.rating ? r.rating.flavorScore : '',
          r.rating ? r.rating.serviceScore : '',
          r.rating ? r.rating.deliveryScore : '',
          puan, yorum, urunler,
          s.id || '', s.sube || '', s.kurye || '', s.mahalle || '', s.tutar || '',
          s.id ? 'EVET' : 'HAYIR'
        ]);
        if (puan && puan < TY.ESIK) {
          dusukler.push({ marka: m.marka, puan: puan, yorum: yorum,
                          kurye: s.kurye || '-', urunler: urunler });
        }
      });
      sayfa++;
      Utilities.sleep(300);
    }
  });

  if (yeni.length) {
    sh.getRange(sh.getLastRow() + 1, 1, yeni.length, TY_BASLIK.length).setValues(yeni);
    sh.getRange(2, 2, sh.getLastRow() - 1, 2).setNumberFormat('dd.MM.yyyy HH:mm');
    const es = yeni.filter(r => r[16] === 'EVET').length;
    Logger.log('Yeni: ' + yeni.length + ' | eşleşen: ' + es + ' | eşleşmeyen: ' + (yeni.length - es));
  } else {
    Logger.log('Yeni değerlendirme yok.');
  }

  yorumlariSirala_();
  ozetiYenile_();
  dusukPuanlariIsle();
  if (dusukler.length) dusukBildir_(dusukler);
  return yeni.length;
}

/*** gecmisiCek() — YENİ HALİ *****************************************
 *
 * Mevcut dosyadaki şu üç satırlık fonksiyonu SİL:
 *
 *   function gecmisiCek() {          // son 90 gün
 *     const eski = TY.GUN;
 *     TY.GUN = 90;
 *     try { yorumlariCek(); } finally { TY.GUN = eski; }
 *   }
 *
 * ...ve yerine aşağıdakini yapıştır.
 *
 * Farkları:
 *  - Gün sayısı yerine sabit tarih: 1 Ocak 2026'dan bugüne.
 *  - Aralığı 30'ar günlük parçalara böler (Trendyol uzun aralığı reddedebiliyor).
 *  - Düşük puan bildirimi GÖNDERMEZ, müşteri veritabanına DOKUNMAZ.
 *    Sadece Degerlendirmeler sekmesine satır yazar, sıralar, özeti yeniler.
 *  - 5 dakikayı geçerse durur ve nerede kaldığını hatırlar; fonksiyonu
 *    tekrar çalıştırınca kaldığı yerden devam eder.
 *  - Bittiğinde log'a "TAMAMLANDI" yazar.
 *********************************************************************/

function gecmisiCek() {
  const BASLANGIC = new Date(2026, 0, 1).getTime();     // 1 Ocak 2026
  const BITIS     = Date.now();
  const PARCA     = 30 * 86400000;                      // 30 günlük dilimler

  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(TY.REVIEW_SHEET);
  if (!sh) {
    sh = ss.insertSheet(TY.REVIEW_SHEET);
    sh.appendRow(TY_BASLIK);
    sh.setFrozenRows(1);
    sh.getRange('D:D').setNumberFormat('@');
  }

  // mükerrer engelle
  const mevcut = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
      .forEach(r => { if (r[0]) mevcut[r[0]] = true; });
  }

  // kaldığı yerden devam
  const prop = PropertiesService.getScriptProperties();
  const kayit = prop.getProperty('TY_GECMIS');           // "magazaIndex|parcaBaslangic"
  let baslaMagaza = 0, baslaParca = BASLANGIC;
  if (kayit) {
    const p = kayit.split('|');
    baslaMagaza = Number(p[0]);
    baslaParca  = Number(p[1]);
    Logger.log('Devam ediliyor: mağaza ' + baslaMagaza + ', ' +
      Utilities.formatDate(new Date(baslaParca), 'Europe/Istanbul', 'dd.MM.yyyy'));
  }

  const eslesme = siparisHaritasi_();
  const basladi = Date.now();
  let toplam = 0;

  for (let i = baslaMagaza; i < TY.MAGAZALAR.length; i++) {
    const m = TY.MAGAZALAR[i];
    let ilk = (i === baslaMagaza) ? baslaParca : BASLANGIC;

    for (let bas = ilk; bas < BITIS; bas += PARCA) {

      // süre kontrolü — temiz çık, yerini kaydet
      if (Date.now() - basladi > 5 * 60 * 1000) {
        prop.setProperty('TY_GECMIS', i + '|' + bas);
        yorumlariSirala_();
        Logger.log('Süre doldu. Bu turda eklenen: ' + toplam +
                   '. Fonksiyonu TEKRAR çalıştır, kaldığı yerden devam eder.');
        return;
      }

      const bit = Math.min(bas + PARCA, BITIS);
      const satirlar = [];
      let sayfa = 0, toplamSayfa = 1;

      while (sayfa < toplamSayfa && sayfa < 100) {
        const url = 'https://api.tgoapis.com/integrator/review/meal/suppliers/' + m.supplier +
          '/stores/' + m.store + '/reviews/filter?page=' + sayfa + '&size=50' +
          '&startDate=' + bas + '&endDate=' + bit;
        const res = UrlFetchApp.fetch(url, {
          method: 'get',
          headers: {
            'Authorization': 'Basic ' + m.token,
            'User-Agent': m.supplier + ' - SelfIntegration',
            'Accept': 'application/json'
          },
          muteHttpExceptions: true
        });
        if (res.getResponseCode() !== 200) {
          Logger.log(m.marka + ' ' +
            Utilities.formatDate(new Date(bas), 'Europe/Istanbul', 'dd.MM.yyyy') +
            ' HATA ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
          break;
        }
        const j = JSON.parse(res.getContentText());
        toplamSayfa = j.totalPages || 0;

        (j.content || []).forEach(r => {
          if (mevcut[r.reviewId]) return;
          mevcut[r.reviewId] = true;
          const no = String(r.orderParentId || '');
          const s = eslesme[no] || {};
          satirlar.push([
            r.reviewId, new Date(r.createdDate), new Date(r.orderCreatedDate), no, m.marka,
            r.rating ? r.rating.flavorScore : '',
            r.rating ? r.rating.serviceScore : '',
            r.rating ? r.rating.deliveryScore : '',
            (r.rating && r.rating.average) || '',
            (r.comment && r.comment.text) || '',
            (r.products || []).map(p => p.name).join(', '),
            s.id || '', s.sube || '', s.kurye || '', s.mahalle || '', s.tutar || '',
            s.id ? 'EVET' : 'HAYIR'
          ]);
        });
        sayfa++;
        Utilities.sleep(250);
      }

      if (satirlar.length) {
        sh.getRange(sh.getLastRow() + 1, 1, satirlar.length, TY_BASLIK.length).setValues(satirlar);
        toplam += satirlar.length;
      }
    }
  }

  prop.deleteProperty('TY_GECMIS');
  sh.getRange(2, 2, sh.getLastRow() - 1, 2).setNumberFormat('dd.MM.yyyy HH:mm');
  yorumlariSirala_();
  ozetiYenile_();
  Logger.log('TAMAMLANDI. Bu turda eklenen: ' + toplam +
             ' | sekmedeki toplam satır: ' + (sh.getLastRow() - 1));
}

/*** Baştan almak istersen (kaydedilen ilerlemeyi siler) ***/
function gecmisiSifirla() {
  PropertiesService.getScriptProperties().deleteProperty('TY_GECMIS');
  Logger.log('İlerleme kaydı silindi, gecmisiCek baştan başlayacak.');
}

/* ============================================================
 * 2) ANA TABLODAN SİPARİŞ HARİTASI (sadece okur)
 * ============================================================ */
function siparisHaritasi_() {
  const sh = SpreadsheetApp.openById(TY.ANA_TABLO).getSheetByName(TY.ANA_SEKME);
  if (!sh) throw new Error('Ana sekme bulunamadı: ' + TY.ANA_SEKME);
  const son = sh.getLastRow();
  const bas = Math.max(2, son - TY.GERI_SATIR);
  const v = sh.getRange(bas, 1, son - bas + 1, 21).getValues();   // A..U
  const h = {};
  v.forEach(r => {
    const tel = String(r[12] || '');            // M Müşteri Telefon
    const i = tel.indexOf('/');
    if (i < 0) return;                          // sadece platform (maskeli) siparişler
    const no = tel.slice(i + 1).trim();
    if (!no) return;
    h[no] = {
      id: r[0], sube: r[5], isim: r[11], mahalle: r[13], adres: r[14],
      tutar: r[19], kurye: r[20]
    };
  });
  Logger.log('Haritada ' + Object.keys(h).length + ' platform siparişi var.');
  return h;
}

/* ============================================================
 * 3) SIRALAMA
 * ============================================================ */
function yorumlariSirala_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TY.REVIEW_SHEET);
  const son = sh.getLastRow();
  if (son < 3) return;
  sh.getRange(2, 1, son - 1, sh.getLastColumn()).sort({ column: 2, ascending: true });
}

/* ============================================================
 * 4) ÖZET SEKMESİ
 * ============================================================ */
function ozetiYenile_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(TY.REVIEW_SHEET);
  const son = sh.getLastRow();
  if (son < 2) return;

  const v = sh.getRange(2, 1, son - 1, 17).getValues();
  const simdi = Date.now();
  const g30 = simdi - 30 * 86400000;
  const g90 = simdi - 90 * 86400000;
  const bos = () => ({ n: 0, top: 0, lez: 0, ser: 0, tes: 0, yorum: 0, dusuk: 0, n30: 0, top30: 0 });

  const magazalar = TY.MAGAZALAR.map(m => m.marka);
  const kutu = {};
  magazalar.concat(['TOPLAM']).forEach(m => { kutu[m] = bos(); });

  v.forEach(r => {
    const tarih = r[1] instanceof Date ? r[1].getTime() : 0;
    if (tarih < g90) return;                       // Trendyol da 90 gün üzerinden hesaplıyor
    const m = r[4];
    if (!kutu[m]) kutu[m] = bos();
    [m, 'TOPLAM'].forEach(k => {
      const o = kutu[k];
      o.n++;
      o.top += Number(r[8]) || 0;
      o.lez += Number(r[5]) || 0;
      o.ser += Number(r[6]) || 0;
      o.tes += Number(r[7]) || 0;
      if (String(r[9] || '').trim()) o.yorum++;
      if ((Number(r[8]) || 0) < TY.ESIK) o.dusuk++;
      if (tarih >= g30) { o.n30++; o.top30 += Number(r[8]) || 0; }
    });
  });

  const ort = (t, n) => n ? Math.round((t / n) * 100) / 100 : '';
  const satirlar = magazalar.concat(['TOPLAM']).map(m => {
    const o = kutu[m];
    return [m, o.n, ort(o.top, o.n), ort(o.lez, o.n), ort(o.ser, o.n), ort(o.tes, o.n),
            o.yorum, o.dusuk, o.n ? Math.round(o.dusuk / o.n * 1000) / 10 + '%' : '',
            o.n30, ort(o.top30, o.n30)];
  });

  let oz = ss.getSheetByName(TY.OZET_SHEET);
  if (!oz) oz = ss.insertSheet(TY.OZET_SHEET);
  oz.clear();
  oz.getRange(1, 1).setValue('Trendyol değerlendirme özeti — son 90 gün')
    .setFontWeight('bold').setFontSize(12);
  oz.getRange(2, 1).setValue('Güncelleme: ' +
    Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy HH:mm'));

  const baslik = ['Mağaza', 'Değerlendirme', 'Ortalama', 'Lezzet', 'Servis', 'Teslimat',
                  'Yorumlu', '4 Altı', 'Düşük %', 'Son 30 gün adet', 'Son 30 gün ort.'];
  oz.getRange(4, 1, 1, baslik.length).setValues([baslik])
    .setFontWeight('bold').setBackground('#f1f3f4');
  oz.getRange(5, 1, satirlar.length, baslik.length).setValues(satirlar);
  oz.getRange(4 + satirlar.length, 1, 1, baslik.length).setFontWeight('bold');
  oz.setColumnWidth(1, 220);
  oz.getRange(5, 3, satirlar.length, 4).setNumberFormat('0.00');

  // ürün bazlı: en düşük puanlı 15 ürün
  const urun = {};
  v.forEach(r => {
    const tarih = r[1] instanceof Date ? r[1].getTime() : 0;
    if (tarih < g90) return;
    String(r[10] || '').split(',').map(s => s.trim()).filter(Boolean).forEach(u => {
      if (!urun[u]) urun[u] = { n: 0, top: 0 };
      urun[u].n++;
      urun[u].top += Number(r[8]) || 0;
    });
  });
  const urunSatir = Object.keys(urun)
    .filter(u => urun[u].n >= 3)
    .map(u => [u, urun[u].n, ort(urun[u].top, urun[u].n)])
    .sort((a, b) => a[2] - b[2])
    .slice(0, 15);

  if (urunSatir.length) {
    const bas = 6 + satirlar.length;
    oz.getRange(bas, 1).setValue('En düşük puanlı ürünler (en az 3 değerlendirme)').setFontWeight('bold');
    oz.getRange(bas + 1, 1, 1, 3).setValues([['Ürün', 'Değerlendirme', 'Ortalama']])
      .setFontWeight('bold').setBackground('#f1f3f4');
    oz.getRange(bas + 2, 1, urunSatir.length, 3).setValues(urunSatir);
    oz.getRange(bas + 2, 3, urunSatir.length, 1).setNumberFormat('0.00');
  }
}

/* ============================================================
 * 5) DÜŞÜK PUANLARI MÜŞTERİ VERİTABANINA İŞLE
 * ============================================================ */
function dusukPuanlariIsle() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TY.REVIEW_SHEET);
  if (!sh || sh.getLastRow() < 2) return;

  const dusuk = sh.getRange(2, 1, sh.getLastRow() - 1, 17).getValues()
    .filter(r => { const p = Number(r[8]) || 0; return p > 0 && p < TY.ESIK; });
  if (!dusuk.length) { Logger.log('Düşük puan yok.'); return; }

  const harita = siparisHaritasi_();

  // adres anahtarına göre topla
  const kutu = {};
  let eslesmeyen = 0;
  dusuk.forEach(r => {
    const s = harita[String(r[3] || '')];
    if (!s || !s.adres) { eslesmeyen++; return; }
    const a = tyAnahtar_(s.adres);
    if (!a) { eslesmeyen++; return; }
    if (!kutu[a]) kutu[a] = { adet: 0, sonTarih: null, sonPuan: '' };
    const k = kutu[a];
    k.adet++;
    const t = r[1] instanceof Date ? r[1] : null;
    if (t && (!k.sonTarih || t > k.sonTarih)) { k.sonTarih = t; k.sonPuan = r[8]; }
  });
  const anahtarlar = Object.keys(kutu);
  if (!anahtarlar.length) { Logger.log('Eşleşen adres yok (' + eslesmeyen + ' eşleşmedi).'); return; }

  const db = SpreadsheetApp.openById(TY.MUSTERI_DB);

  // --- Telefonsuz sekmesi ---
  const ts = db.getSheetByName(TY.TELEFONSUZ);
  const tsSon = ts.getLastRow();
  const tsVer = ts.getRange(2, 1, tsSon - 1, TY.T.NOT).getValues();
  let isaretli = 0;
  tsVer.forEach(r => {
    let a = String(r[TY.T.ANAHTAR - 1] || '');
    if (!a) { a = tyAnahtar_(r[TY.T.ADRES - 1]); if (a) r[TY.T.ANAHTAR - 1] = a; }
       const k = a && kutu[a];
    if (!k) {
      if (r[TY.T.TY - 1] === true) {
        r[TY.T.TY - 1] = false;
        r[TY.T.TY_TARIH - 1] = '';
        r[TY.T.NOT - 1] = '';
      }
      return;
    }
    r[TY.T.TY - 1] = true;
    if (k.sonTarih) r[TY.T.TY_TARIH - 1] = k.sonTarih;
    r[TY.T.NOT - 1] = k.adet + ' kez düşük puan | son: ' + k.sonPuan + '/5 – ' +
      (k.sonTarih ? Utilities.formatDate(k.sonTarih, 'Europe/Istanbul', 'dd.MM.yyyy') : '');
    k.bulundu = true;
    isaretli++;
  });
  ts.getRange(2, 1, tsSon - 1, TY.T.NOT).setValues(tsVer);
  ts.getRange(2, TY.T.TY, tsSon - 1, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build())
    .setHorizontalAlignment('center');
  ts.getRange(2, TY.T.TY_TARIH, tsSon - 1, 1).setNumberFormat('dd.MM.yyyy');

  // --- Ana Musteri Listesi (adres aynıysa telefonlu müşteri de işaretlensin) ---
  const ms = db.getSheetByName(TY.ANA_LISTE);
  const msSon = ms.getLastRow();
  const msVer = ms.getRange(2, 1, msSon - 1, TY.A.TY_TARIH).getValues();
  let anaIsaretli = 0;
  msVer.forEach(r => {
    const a = tyAnahtar_(r[TY.A.ADRES - 1]);
      const k = a && kutu[a];
    if (!k) {
      if (r[TY.T.TY - 1] === true) {
        r[TY.T.TY - 1] = false;
        r[TY.T.TY_TARIH - 1] = '';
        r[TY.T.NOT - 1] = '';
      }
      return;
    }
    if (r[TY.A.TY - 1] === true && r[TY.A.TY_TARIH - 1] instanceof Date &&
        k.sonTarih && r[TY.A.TY_TARIH - 1].getTime() >= k.sonTarih.getTime()) return;
    r[TY.A.TY - 1] = true;
    if (k.sonTarih) r[TY.A.TY_TARIH - 1] = k.sonTarih;
    const eskiNot = String(r[TY.A.NOT - 1] || '');
    if (eskiNot.indexOf('TY: ') < 0) {
      const yeni = 'TY: ' + k.adet + ' kez 4 altı puan';
      r[TY.A.NOT - 1] = eskiNot ? eskiNot + ' | ' + yeni : yeni;
    }
    anaIsaretli++;
  });
  if (anaIsaretli) {
    ms.getRange(2, 1, msSon - 1, TY.A.TY_TARIH).setValues(msVer);
    ms.getRange(2, TY.A.TY, msSon - 1, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build())
      .setHorizontalAlignment('center');
    ms.getRange(2, TY.A.TY_TARIH, msSon - 1, 1).setNumberFormat('dd.MM.yyyy');
  }

  const bulunamayan = anahtarlar.filter(a => !kutu[a].bulundu).length;
  Logger.log('Düşük puan: ' + dusuk.length + ' değerlendirme, ' + anahtarlar.length + ' adres | ' +
    'Telefonsuz işaretlenen: ' + isaretli + ', bulunamayan: ' + bulunamayan + ' | ' +
    'Ana listede: ' + anaIsaretli + ' | siparişle eşleşmeyen: ' + eslesmeyen);
}

/* ============================================================
 * 6) DIŞARIDAN SORGU: bu adres düşük puan verdi mi?
 *    Toplayıcıdan çağırmak için. Boş dönerse temiz.
 * ============================================================ */
function sorunluMu(adres) {
  const a = tyAnahtar_(adres);
  if (!a) return '';
  const ts = SpreadsheetApp.openById(TY.MUSTERI_DB).getSheetByName(TY.TELEFONSUZ);
  if (ts.getLastRow() < 2) return '';
  const v = ts.getRange(2, TY.T.ANAHTAR, ts.getLastRow() - 1, 4).getValues();  // G..J
  const bul = v.find(r => String(r[0]) === a && r[1] === true);
  return bul ? '⚠️ Trendyol: ' + String(bul[3] || 'daha önce düşük puan verdi') : '';
}

/* ============================================================
 * 7) ADRES ANAHTARI  (tazeleme fonksiyonundaki tzAnahtar_ ile aynı kural)
 * ============================================================ */
function tyAnahtar_(adres) {
  let a = String(adres || '').toLowerCase();
  a = a.split('|||')[0].replace(/mahalle\s*:\s*[^,]*/g, ' ');  a = a.replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
       .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
  a = a.replace(/\b(mah|mh|mahallesi|sok|sk|sokak|sokagi|cd|cad|cadde|caddesi|apt|apartmani|blok|no|kat|daire|kapi|d)\b/g, ' ');
  a = a.replace(/\b(kadikoy|uskudar|atasehir|umraniye|maltepe|istanbul|turkiye)\b/g, ' ');
  a = a.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return a.length >= 8 ? a : '';
}

/* ============================================================
 * 8) BİLDİRİM + TETİKLEYİCİ
 * ============================================================ */
function dusukBildir_(liste) {
  const govde = liste.map(d =>
    '• ' + d.puan + '/5 — ' + d.marka + ' — kurye: ' + d.kurye +
    '\n   ' + d.urunler + (d.yorum ? '\n   "' + d.yorum + '"' : '')
  ).join('\n\n');
  const konu = '⚠️ Trendyol düşük puan: ' + liste.length + ' değerlendirme';
    MailApp.sendEmail({ to: 'mertharman@gmail.com', subject: konu, body: govde });
  try {
    UrlFetchApp.fetch('https://hook.eu1.make.com/6wgq4uajtmy8p7vsl3u7j1rwei70cy58', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ konu: konu, mesaj: govde }), muteHttpExceptions: true
    });
  } catch (e) { Logger.log('Webhook hatası: ' + e); }
}

function tetikleyiciKur() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'yorumlariCek')
    .forEach(t => ScriptApp.deleteTrigger(t));
  // servis saatleri boyunca saat başı + gece kapanışı
  [11, 13, 15, 17, 19, 20, 21, 22, 23, 0, 1, 2, 4].forEach(saat => {
    ScriptApp.newTrigger('yorumlariCek').timeBased().atHour(saat).nearMinute(10).everyDays(1).create();
  });
  Logger.log('13 tetikleyici kuruldu (11:00–02:00 arası + 04:10)');
}
function anahtarlariYenidenUret() {
  const ts = SpreadsheetApp.openById(TY.MUSTERI_DB).getSheetByName(TY.TELEFONSUZ);
  const son = ts.getLastRow();
  const adres = ts.getRange(2, TY.T.ADRES, son - 1, 1).getValues();
  const yeni = adres.map(r => [tyAnahtar_(r[0])]);
  ts.getRange(2, TY.T.ANAHTAR, son - 1, 1).setValues(yeni);
  Logger.log('Yenilenen anahtar: ' + yeni.filter(r => r[0]).length + ' / ' + yeni.length);
}