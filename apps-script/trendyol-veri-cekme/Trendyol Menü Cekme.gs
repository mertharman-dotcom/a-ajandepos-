/*** BAP – TRENDYOL GO MENÜ TAKİBİ (tek dosya) ***
 *
 * Trendyol değerlendirme projesine EK dosya olarak ekle.
 * TY sabitini oradan kullanır; o dosya yoksa aşağıdaki YEDEK listeye düşer.
 *
 * Fonksiyonlar:
 *   menuCek()            – ana iş: 4 şubenin menüsünü API'den çeker, 3 sekme üretir
 *   menuTetikleyiciKur() – her gece 03:30
 *
 * Ürettiği sekmeler:
 *   Menu_Ham    – her şubenin tüm ürünleri (kategori, ID, ad, açıklama, fiyat, durum)
 *   Menu_Sorun  – kategorisiz/mükerrer/pasif ürünler, boş kategoriler, yazım hataları
 *   Menu_Fark   – aynı ürün şubeler arası: fiyat farkı + açıklama farkı
 *
 * Kaynak: GET /integrator/product/meal/suppliers/{supplierId}/stores/{storeId}/products
 * sellingPrice  = panelde senin girdiğin fiyat
 * originalPrice = Trendyol'un hesapladığı üstü çizili tutar (kampanya varsa dolu)
 */

const MENU = {
  HAM: 'Menu_Ham',
  SORUN: 'Menu_Sorun',
  FARK: 'Menu_Fark',

  // vitrinde görünmeyen teknik ürünleri ham listeden ayıklamak için
  // (sos/ekstra gibi sadece opsiyon içinde geçen kayıtlar)
  OPSIYONLARI_GIZLE: true,

  // isimde/açıklamada aranan bilinen yazım hataları
  YAZIM: {
    'gluteniz': 'Glutensiz',
    'chese': 'Cheese',
    'bolonese': 'Bolognese',
    'spagetti': 'Spaghetti',
    'roastbeaf': 'Roastbeef',
    'fransz': 'Fransız',
    'peynirili': 'peynirli',
    'enginat': 'Enginar',
    'markarna': 'makarna',
    'lingıine': 'Linguine',
    'naranciye': 'narenciye',
    'avakado': 'avokado',
    'balli': 'ballı',
    'kivircik': 'kıvırcık'
  }
};

/* TY dosyası yoksa devreye giren yedek mağaza listesi */
const MENU_YEDEK_MAGAZALAR = [
  { supplier: 251784, store: 943,    marka: 'BAP Pizza Erenköy',
    token: 'NHBDY3pUV1dPSUdmWGFGSkdjVTk6Wm1JTlFyV05HVjdLRTBmYlpXUUY=' },
  { supplier: 251784, store: 213171, marka: 'BAP Pizza Fikirtepe',
    token: 'NHBDY3pUV1dPSUdmWGFGSkdjVTk6Wm1JTlFyV05HVjdLRTBmYlpXUUY=' },
  { supplier: 654639, store: 155492, marka: 'BAP Salad & Pasta Erenköy',
    token: 'dXVVQzh4cExmRjNtMnlodE5iWUc6RnVQa3pPUUxtR20yOUhwamRqUWY=' },
  { supplier: 654639, store: 213169, marka: 'BAP Salad & Pasta Fikirtepe',
    token: 'dXVVQzh4cExmRjNtMnlodE5iWUc6RnVQa3pPUUxtR20yOUhwamRqUWY=' }
];

function menuMagazalari_() {
  try {
    if (typeof TY !== 'undefined' && TY.MAGAZALAR && TY.MAGAZALAR.length) return TY.MAGAZALAR;
  } catch (e) { /* TY tanımlı değil */ }
  return MENU_YEDEK_MAGAZALAR;
}

/* ============================================================
 * 1) ANA İŞ
 * ============================================================ */
function menuCek() {
  const magazalar = menuMagazalari_();
  const veri = [];          // { marka, sections, products, modifierGroups }

  magazalar.forEach(m => {
    const url = 'https://api.tgoapis.com/integrator/product/meal/suppliers/' + m.supplier +
                '/stores/' + m.store + '/products';
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
      return;
    }
    const j = JSON.parse(res.getContentText());
    veri.push({
      marka: m.marka,
      store: m.store,
      sections: j.sections || [],
      products: j.products || [],
      modifierGroups: j.modifierGroups || []
    });
    Logger.log(m.marka + ': ' + (j.products || []).length + ' ürün, ' +
               (j.sections || []).length + ' kategori');
    Utilities.sleep(300);
  });

  if (!veri.length) { Logger.log('Hiçbir mağaza çekilemedi.'); return; }

  hamYaz_(veri);
  sorunYaz_(veri);
  farkYaz_(veri);
  Logger.log('Menü sekmeleri güncellendi: ' +
    Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy HH:mm'));
}

/* ============================================================
 * 2) YARDIMCILAR
 * ============================================================ */

/* ürün ID -> içinde geçtiği kategori(ler) */
function kategoriHaritasi_(d) {
  const h = {};
  d.sections.forEach(s => {
    (s.products || []).forEach(p => {
      if (!h[p.id]) h[p.id] = [];
      h[p.id].push({ ad: s.name, durum: s.status, pos: p.position });
    });
  });
  return h;
}

/* opsiyon (modifier) içinde geçen ürün ID'leri */
function opsiyonUrunleri_(d) {
  const s = {};
  d.modifierGroups.forEach(g => {
    (g.modifierProducts || []).forEach(p => { s[p.id] = true; });
  });
  return s;
}

function sadelestir_(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* metinde bilinen yazım hatası var mı */
function yazimKontrol_(metin) {
  const n = sadelestir_(metin);
  const bulunan = [];
  Object.keys(MENU.YAZIM).forEach(yanlis => {
    if (n.indexOf(sadelestir_(yanlis)) >= 0) {
      bulunan.push(yanlis + ' → ' + MENU.YAZIM[yanlis]);
    }
  });
  return bulunan.join(' ; ');
}

function sekme_(ad) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ad);
  if (!sh) sh = ss.insertSheet(ad);
  sh.clear();
  return sh;
}

function basligiYaz_(sh, baslik) {
  sh.getRange(1, 1, 1, baslik.length).setValues([baslik])
    .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

/* ============================================================
 * 3) Menu_Ham
 * ============================================================ */
function hamYaz_(veri) {
  const baslik = ['Şube', 'Kategori', 'Kat. Durum', 'Sıra', 'Ürün ID', 'Ürün Adı',
                  'Açıklama', 'Satış Fiyatı', 'TY Liste Fiyatı', 'Ürün Durum', 'Opsiyon Grubu'];
  const satirlar = [];

  veri.forEach(d => {
    const kat = kategoriHaritasi_(d);
    const ops = opsiyonUrunleri_(d);

    d.products.forEach(p => {
      const kayitlar = kat[p.id];
      const opsGrup = (p.modifierGroups || []).length;

      if (!kayitlar) {
        // hiçbir kategoriye bağlı değil
        if (MENU.OPSIYONLARI_GIZLE && ops[p.id]) return;   // sadece opsiyon ürünü, atla
        satirlar.push([d.marka, '— KATEGORİSİZ —', '', '', p.id, p.name,
                       p.description || '', p.sellingPrice,
                       p.originalPrice === null ? '' : p.originalPrice,
                       p.status, opsGrup]);
        return;
      }
      kayitlar.forEach(k => {
        satirlar.push([d.marka, k.ad, k.durum, k.pos, p.id, p.name,
                       p.description || '', p.sellingPrice,
                       p.originalPrice === null ? '' : p.originalPrice,
                       p.status, opsGrup]);
      });
    });
  });

  satirlar.sort((a, b) =>
    a[0] === b[0] ? (a[1] === b[1] ? (a[3] - b[3]) : String(a[1]).localeCompare(b[1], 'tr'))
                  : String(a[0]).localeCompare(b[0], 'tr'));

  const sh = sekme_(MENU.HAM);
  basligiYaz_(sh, baslik);
  if (satirlar.length) {
    sh.getRange(2, 1, satirlar.length, baslik.length).setValues(satirlar);
    sh.getRange(2, 8, satirlar.length, 2).setNumberFormat('#,##0 "TL"');
  }
  sh.setColumnWidth(1, 190); sh.setColumnWidth(2, 160);
  sh.setColumnWidth(6, 240); sh.setColumnWidth(7, 420);
  sh.getRange(2, 7, Math.max(satirlar.length, 1), 1).setWrap(true);
  Logger.log(MENU.HAM + ': ' + satirlar.length + ' satır');
}

/* ============================================================
 * 4) Menu_Sorun
 * ============================================================ */
function sorunYaz_(veri) {
  const baslik = ['Şube', 'Sorun Tipi', 'Ürün ID', 'Ürün Adı', 'Detay', 'Satış Fiyatı'];
  const satirlar = [];

  veri.forEach(d => {
    const kat = kategoriHaritasi_(d);
    const ops = opsiyonUrunleri_(d);

    // boş kategori
    d.sections.forEach(s => {
      if (!(s.products || []).length) {
        satirlar.push([d.marka, 'Boş kategori', s.id, s.name,
                       'Kategoride hiç ürün yok, vitrinde boş görünüyor', '']);
      }
      if (s.status !== 'ACTIVE') {
        satirlar.push([d.marka, 'Pasif kategori', s.id, s.name,
                       'Kategori durumu: ' + s.status, '']);
      }
    });

    // aynı isimde birden fazla ürün
    const isimler = {};
    d.products.forEach(p => {
      if (ops[p.id] && !kat[p.id]) return;          // saf opsiyon ürünü
      const n = sadelestir_(p.name);
      if (!isimler[n]) isimler[n] = [];
      isimler[n].push(p);
    });
    Object.keys(isimler).forEach(n => {
      const liste = isimler[n];
      if (liste.length < 2) return;
      liste.forEach(p => {
        const yayinda = kat[p.id] ? 'menüde yayında (' + kat[p.id][0].ad + ')' : 'KATEGORİSİZ, vitrinde görünmüyor';
        satirlar.push([d.marka, 'Mükerrer isim', p.id, p.name,
                       liste.length + ' kayıt var — bu kayıt: ' + yayinda, p.sellingPrice]);
      });
    });

    d.products.forEach(p => {
      if (ops[p.id] && !kat[p.id]) return;

      // kategorisiz ürün
      if (!kat[p.id]) {
        satirlar.push([d.marka, 'Kategorisiz ürün', p.id, p.name,
                       'Hiçbir kategoriye bağlı değil — panelde var, müşteri göremiyor',
                       p.sellingPrice]);
      }
      // pasif ürün
      if (p.status !== 'ACTIVE') {
        satirlar.push([d.marka, 'Pasif ürün', p.id, p.name,
                       'Ürün durumu: ' + p.status, p.sellingPrice]);
      }
      // açıklama boş
      if (!p.description) {
        satirlar.push([d.marka, 'Açıklama boş', p.id, p.name,
                       'İçerik metni girilmemiş', p.sellingPrice]);
      }
      // yazım hatası
      const yAd = yazimKontrol_(p.name);
      if (yAd) satirlar.push([d.marka, 'İsimde yazım hatası', p.id, p.name, yAd, p.sellingPrice]);
      const yAc = yazimKontrol_(p.description);
      if (yAc) satirlar.push([d.marka, 'Açıklamada yazım hatası', p.id, p.name, yAc, p.sellingPrice]);

      // ad ile açıklama çelişiyor mu (pizza ürününde makarna metni gibi)
      const ad = sadelestir_(p.name), ac = sadelestir_(p.description);
      const anahtar = [
        { kelime: 'pizza', celisen: ['fettuccine', 'penne', 'linguine', 'spaghetti', 'gnocchi', 'panini ekmegi', 'panuozzo'] },
        { kelime: 'panini', celisen: ['pizza hamuru'] },
        { kelime: 'penne',  celisen: ['spaghetti', 'fettuccine', 'linguine'] }
      ];
      anahtar.forEach(a => {
        if (ad.indexOf(a.kelime) < 0 || !ac) return;
        a.celisen.forEach(c => {
          if (ac.indexOf(c) >= 0) {
            satirlar.push([d.marka, 'Ad–açıklama çelişkisi', p.id, p.name,
                           'Ad "' + a.kelime + '" diyor, açıklamada "' + c + '" geçiyor', p.sellingPrice]);
          }
        });
      });
    });
  });

  const sh = sekme_(MENU.SORUN);
  basligiYaz_(sh, baslik);
  if (satirlar.length) {
    sh.getRange(2, 1, satirlar.length, baslik.length).setValues(satirlar);
    sh.getRange(2, 6, satirlar.length, 1).setNumberFormat('#,##0 "TL"');
  }
  sh.setColumnWidth(1, 190); sh.setColumnWidth(2, 170);
  sh.setColumnWidth(4, 240); sh.setColumnWidth(5, 460);
  sh.getRange(2, 5, Math.max(satirlar.length, 1), 1).setWrap(true);
  Logger.log(MENU.SORUN + ': ' + satirlar.length + ' satır');
}

/* ============================================================
 * 5) Menu_Fark  (aynı ürün, şubeler arası)
 * ============================================================ */
function farkYaz_(veri) {
  const markalar = veri.map(d => d.marka);
  const kutu = {};    // sadeAd -> { ad, sube -> {fiyat, aciklama, id} }

  veri.forEach(d => {
    const kat = kategoriHaritasi_(d);
    const ops = opsiyonUrunleri_(d);
    d.products.forEach(p => {
      if (!kat[p.id]) return;                 // sadece yayındaki ürünler kıyaslansın
      if (ops[p.id] && p.sellingPrice === 0) return;
      const n = sadelestir_(p.name);
      if (!kutu[n]) kutu[n] = { ad: p.name, kat: kat[p.id][0].ad, s: {} };
      kutu[n].s[d.marka] = { fiyat: p.sellingPrice, aciklama: p.description || '', id: p.id };
    });
  });

  const baslik = ['Kategori', 'Ürün']
    .concat(markalar)
    .concat(['Fark (TL)', 'Fark %', 'Açıklama Farkı', 'Ürün ID (şube sırasıyla)']);

  const satirlar = [];
  Object.keys(kutu).forEach(n => {
    const e = kutu[n];
    const fiyatlar = [], idler = [], aciklamalar = [];
    markalar.forEach(m => {
      const v = e.s[m];
      fiyatlar.push(v ? v.fiyat : '');
      idler.push(v ? v.id : '-');
      if (v) aciklamalar.push(sadelestir_(v.aciklama));
    });
    const dolu = fiyatlar.filter(f => f !== '');
    if (dolu.length < 2) return;

    const mn = Math.min.apply(null, dolu), mx = Math.max.apply(null, dolu);
    const farkliAciklama = aciklamalar.length > 1 &&
      aciklamalar.some(a => a !== aciklamalar[0]);

    if (mn === mx && !farkliAciklama) return;   // her şey aynıysa listeye girmesin

    satirlar.push([e.kat, e.ad].concat(fiyatlar).concat([
      mx - mn,
      mn ? (mx - mn) / mn : '',
      farkliAciklama ? 'FARKLI' : '',
      idler.join(' / ')
    ]));
  });

  satirlar.sort((a, b) => (b[markalar.length + 3] || 0) - (a[markalar.length + 3] || 0));

  const sh = sekme_(MENU.FARK);
  basligiYaz_(sh, baslik);
  if (satirlar.length) {
    sh.getRange(2, 1, satirlar.length, baslik.length).setValues(satirlar);
    sh.getRange(2, 3, satirlar.length, markalar.length + 1).setNumberFormat('#,##0 "TL"');
    sh.getRange(2, markalar.length + 4, satirlar.length, 1).setNumberFormat('0.0%');
  }
  sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 260);
  Logger.log(MENU.FARK + ': ' + satirlar.length + ' satır');
}

/* ============================================================
 * 6) TETİKLEYİCİ
 * ============================================================ */
function menuTetikleyiciKur() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'menuCek')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('menuCek').timeBased().atHour(3).nearMinute(30).everyDays(1).create();
  Logger.log('Tetikleyici kuruldu: her gece 03:30');
}