/*** BAP – TRENDYOL GO TOPLU FİYAT GÜNCELLEME ***
 *
 * Menü takibi dosyasının yanına ekle. TY.MAGAZALAR ve MENU sabitlerini
 * oradan kullanır; yoksa menü dosyasındaki yedek listeye düşer.
 *
 * KULLANIM SIRASI
 *   1) fiyatListesiHazirla()  – "Fiyat_Guncelle" sekmesini kurar.
 *                               Her satır: şube, ürün ID, ürün adı, mevcut fiyat.
 *   2) F sütununa (Yeni Fiyat) yeni fiyatları yaz/yapıştır.
 *      Boş bıraktığın veya mevcutla aynı olan satırlara DOKUNULMAZ.
 *   3) fiyatOnizleme()        – ne gönderilecek, listeler. Hiçbir şey göndermez.
 *   4) fiyatlariGonder()      – sadece değişenleri Trendyol'a gönderir.
 *   5) batchKontrol()         – gönderimlerin sonucunu okur (birkaç dk sonra).
 *
 * GÜVENLİK
 *   - 0 veya negatif fiyat gönderilmez.
 *   - Mevcut fiyatın 3 katından fazla / 3'te birinden azı "şüpheli" sayılır,
 *     gönderilmez, G sütununa yazılır. Bilerek yapıyorsan F sütununa fiyatı
 *     yazıp G sütununa ZORLA yaz, o satır gönderilir.
 *   - Aynı isteği iki kez atmak Trendyol tarafında hata verir; bu yüzden
 *     gönderilen satırların F sütunu temizlenir, E sütunu yeni fiyata çekilir.
 *
 * API: POST /integrator/product/meal/suppliers/{supplierId}/products/price
 *      body { items: [ { restaurantId, productId, sellingPrice } ] }  (maks 1000)
 */

const FIYAT = {
  SHEET: 'Fiyat_Guncelle',
  LOG: 'Fiyat_Log',
  MAKS_ITEM: 1000,
  SUPHE_KAT: 3          // bu katsayıdan fazla sapma şüpheli sayılır
};

const FIYAT_BASLIK = ['Şube', 'Kategori', 'Ürün ID', 'Ürün Adı',
                      'Mevcut Fiyat', 'Yeni Fiyat', 'Not / ZORLA', 'Sonuç'];

/* ============================================================
 * 1) LİSTEYİ HAZIRLA
 * ============================================================ */
function fiyatListesiHazirla() {
  const magazalar = menuMagazalari_();
  const satirlar = [];

  magazalar.forEach(m => {
    const j = fiyatMenuCek_(m);
    if (!j) return;

    // ürün -> kategori
    const kat = {};
    (j.sections || []).forEach(s => {
      (s.products || []).forEach(p => { if (!kat[p.id]) kat[p.id] = s.name; });
    });

    (j.products || []).forEach(p => {
      if (!kat[p.id]) return;                 // kategorisiz / opsiyon ürünü listelenmez
      satirlar.push([m.marka, kat[p.id], p.id, p.name, p.sellingPrice, '', '', '']);
    });
    Utilities.sleep(300);
  });

  satirlar.sort((a, b) =>
    a[0] === b[0]
      ? (a[1] === b[1] ? String(a[3]).localeCompare(b[3], 'tr')
                       : String(a[1]).localeCompare(b[1], 'tr'))
      : String(a[0]).localeCompare(b[0], 'tr'));

  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(FIYAT.SHEET);
  if (!sh) sh = ss.insertSheet(FIYAT.SHEET);
  sh.clear();
  sh.getRange(1, 1, 1, FIYAT_BASLIK.length).setValues([FIYAT_BASLIK])
    .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  sh.setFrozenRows(1);

  if (satirlar.length) {
    sh.getRange(2, 1, satirlar.length, FIYAT_BASLIK.length).setValues(satirlar);
    sh.getRange(2, 5, satirlar.length, 2).setNumberFormat('#,##0');
    // yeni fiyat sütununu belirgin yap
    sh.getRange(2, 6, satirlar.length, 1).setBackground('#fff2cc');
  }
  sh.setColumnWidth(1, 190); sh.setColumnWidth(2, 160); sh.setColumnWidth(4, 260);
  sh.setColumnWidth(7, 150); sh.setColumnWidth(8, 300);

  Logger.log('Fiyat_Guncelle hazır: ' + satirlar.length +
             ' ürün. F sütununa yeni fiyatları yaz, sonra fiyatOnizleme() çalıştır.');
}

function fiyatMenuCek_(m) {
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
    Logger.log(m.marka + ' menü HATA ' + res.getResponseCode() + ': ' +
               res.getContentText().slice(0, 200));
    return null;
  }
  return JSON.parse(res.getContentText());
}

/* ============================================================
 * 2) DEĞİŞENLERİ TOPLA (ortak yardımcı)
 * ============================================================ */
function fiyatDegisenler_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(FIYAT.SHEET);
  if (!sh || sh.getLastRow() < 2) throw new Error('Önce fiyatListesiHazirla() çalıştır.');

  const magazalar = menuMagazalari_();
  const markaHarita = {};
  magazalar.forEach(m => { markaHarita[m.marka] = m; });

  const v = sh.getRange(2, 1, sh.getLastRow() - 1, FIYAT_BASLIK.length).getValues();
  const gonderilecek = [], atlanan = [];

  v.forEach((r, i) => {
    const satirNo = i + 2;
    const marka = r[0], id = r[2], ad = r[3];
    const mevcut = Number(r[4]);
    const yeniHam = r[5];
    const zorla = String(r[6] || '').toUpperCase().indexOf('ZORLA') >= 0;

    if (yeniHam === '' || yeniHam === null) return;          // dokunulmamış
    const yeni = Number(String(yeniHam).replace(/[^\d.,-]/g, '').replace(',', '.'));
    if (!isFinite(yeni)) { atlanan.push([satirNo, marka, ad, 'Fiyat okunamadı']); return; }
    if (yeni === mevcut) return;                              // değişiklik yok
    if (yeni <= 0) { atlanan.push([satirNo, marka, ad, 'Sıfır/negatif fiyat']); return; }

    if (!zorla && mevcut > 0 &&
        (yeni > mevcut * FIYAT.SUPHE_KAT || yeni < mevcut / FIYAT.SUPHE_KAT)) {
      atlanan.push([satirNo, marka, ad,
        'Şüpheli sapma (' + mevcut + ' → ' + yeni + '). Bilerekse G sütununa ZORLA yaz.']);
      return;
    }

    const m = markaHarita[marka];
    if (!m) { atlanan.push([satirNo, marka, ad, 'Şube tanınmadı']); return; }

    gonderilecek.push({
      satir: satirNo, marka: marka, ad: ad,
      supplier: m.supplier, store: m.store, token: m.token,
      productId: Number(id), mevcut: mevcut, yeni: yeni
    });
  });

  return { sh: sh, gonderilecek: gonderilecek, atlanan: atlanan };
}

/* ============================================================
 * 3) ÖNİZLEME — hiçbir şey göndermez
 * ============================================================ */
function fiyatOnizleme() {
  const d = fiyatDegisenler_();
  Logger.log('GÖNDERİLECEK: ' + d.gonderilecek.length + ' ürün');
  d.gonderilecek.forEach(x =>
    Logger.log('  ' + x.marka + ' | ' + x.ad + ' (' + x.productId + '): ' +
               x.mevcut + ' → ' + x.yeni));
  if (d.atlanan.length) {
    Logger.log('ATLANAN: ' + d.atlanan.length);
    d.atlanan.forEach(a => Logger.log('  satır ' + a[0] + ' | ' + a[1] + ' | ' + a[2] + ' → ' + a[3]));
  }
  if (!d.gonderilecek.length) Logger.log('Gönderilecek değişiklik yok.');
}

/* ============================================================
 * 4) GÖNDER
 * ============================================================ */
function fiyatlariGonder() {
  const d = fiyatDegisenler_();
  const sh = d.sh;

  // atlananları sonuç sütununa yaz
  d.atlanan.forEach(a => sh.getRange(a[0], 8).setValue('ATLANDI — ' + a[3]));

  if (!d.gonderilecek.length) { Logger.log('Gönderilecek değişiklik yok.'); return; }

  // supplier bazında grupla (tek istekte tek satıcı hesabı)
  const gruplar = {};
  d.gonderilecek.forEach(x => {
    if (!gruplar[x.supplier]) gruplar[x.supplier] = { token: x.token, items: [] };
    gruplar[x.supplier].items.push(x);
  });

  const log = fiyatLogSekmesi_();
  let toplam = 0;

  Object.keys(gruplar).forEach(supplier => {
    const g = gruplar[supplier];
    for (let i = 0; i < g.items.length; i += FIYAT.MAKS_ITEM) {
      const dilim = g.items.slice(i, i + FIYAT.MAKS_ITEM);
      const body = {
        items: dilim.map(x => ({
          restaurantId: x.store,
          productId: x.productId,
          sellingPrice: x.yeni
        }))
      };

      const url = 'https://api.tgoapis.com/integrator/product/meal/suppliers/' +
                  supplier + '/products/price';
      const res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'Authorization': 'Basic ' + g.token,
          'User-Agent': supplier + ' - SelfIntegration',
          'Accept': 'application/json'
        },
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      });

      const kod = res.getResponseCode();
      const metin = res.getContentText();

      if (kod !== 200) {
        Logger.log('Supplier ' + supplier + ' HATA ' + kod + ': ' + metin.slice(0, 300));
        dilim.forEach(x => sh.getRange(x.satir, 8).setValue('HATA ' + kod + ' — ' + metin.slice(0, 120)));
        continue;
      }

      const batchId = (JSON.parse(metin) || {}).batchRequestId || '';
      dilim.forEach(x => {
        sh.getRange(x.satir, 8).setValue('GÖNDERİLDİ ' + x.mevcut + ' → ' + x.yeni +
                                        ' | batch: ' + batchId);
        sh.getRange(x.satir, 5).setValue(x.yeni);   // mevcut fiyatı güncelle
        sh.getRange(x.satir, 6).setValue('');       // yeni fiyat kutusunu boşalt
      });
      log.appendRow([new Date(), supplier, batchId, dilim.length, 'GÖNDERİLDİ', '']);
      toplam += dilim.length;
      Utilities.sleep(500);
    }
  });

  Logger.log('Gönderilen: ' + toplam + ' ürün. Birkaç dakika sonra batchKontrol() çalıştır.');
}

/* ============================================================
 * 5) BATCH SONUÇ KONTROLÜ
 * ============================================================ */
function batchKontrol() {
  const log = fiyatLogSekmesi_();
  if (log.getLastRow() < 2) { Logger.log('Kontrol edilecek gönderim yok.'); return; }

  const magazalar = menuMagazalari_();
  const tokenHarita = {};
  magazalar.forEach(m => { tokenHarita[m.supplier] = m.token; });

  const v = log.getRange(2, 1, log.getLastRow() - 1, 6).getValues();
  v.forEach((r, i) => {
    const satir = i + 2;
    const supplier = r[1], batchId = r[2];
    if (!batchId || String(r[4]).indexOf('COMPLETED') >= 0) return;

    const url = 'https://api.tgoapis.com/integrator/product/meal/suppliers/' +
                supplier + '/batch-requests/' + batchId;
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'Authorization': 'Basic ' + tokenHarita[supplier],
        'User-Agent': supplier + ' - SelfIntegration',
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      log.getRange(satir, 5).setValue('KONTROL HATASI ' + res.getResponseCode());
      return;
    }
    const j = JSON.parse(res.getContentText());
    const hatali = j.failedItemCount || 0;
    log.getRange(satir, 5).setValue(j.status + (hatali ? ' — ' + hatali + ' hatalı' : ' — hepsi başarılı'));

    if (hatali) {
      const sebep = (j.items || [])
        .filter(it => it.status !== 'SUCCESS')
        .map(it => {
          const req = (it.requestItem && it.requestItem.request) || {};
          return req.productId + ': ' + (it.failureReasons || []).join(', ');
        })
        .slice(0, 20)
        .join(' | ');
      log.getRange(satir, 6).setValue(sebep);
    }
    Logger.log(batchId + ' → ' + j.status + ', hatalı: ' + hatali);
    Utilities.sleep(300);
  });
}

function fiyatLogSekmesi_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(FIYAT.LOG);
  if (!sh) {
    sh = ss.insertSheet(FIYAT.LOG);
    sh.appendRow(['Tarih', 'Supplier', 'Batch ID', 'Ürün Adedi', 'Durum', 'Hata Detayı']);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('dd.MM.yyyy HH:mm');
    sh.setColumnWidth(3, 320); sh.setColumnWidth(6, 420);
  }
  return sh;
}