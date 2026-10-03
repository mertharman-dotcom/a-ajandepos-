// ============================================================
// BAP — ÜRÜN REÇETESİ ŞABLONU KURULUMU
// Tek seferlik çalıştırılır. Stok dosyasında 4 sekme oluşturur:
//   Bilesen_Listesi     → seçilebilir tüm bileşenler (HM/YM/DS/AMB)
//   Tbl_UrunRecete      → reçetelerin girileceği tablo (asıl iş burada)
//   Tbl_UrunEslestirme  → Adisyo ürün adı ↔ sistem ürün adı
//   Urun_Durum          → hangi ürünün reçetesi var/yok (ilerleme takibi)
//
// KULLANIM: Stok dosyasında Uzantılar → Apps Script → bu dosyayı ekle →
//           receteSablonuKur fonksiyonunu çalıştır.
// Tekrar çalıştırılabilir: girilmiş reçeteler SİLİNMEZ, sadece
// listeler ve durum sekmesi tazelenir.
// ============================================================

const RS_STOK_ID  = '1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE'; // BAP Stok Takip Sistemi
const RS_SATIS_ID = '152FdGaQUhwyd0ytcTbM1OI6beNZsXBJhCM-GoG2Bzvw'; // BAP veri tablosu (Detay sekmesi)
const RS_SATIS_SEKME = 'Detay';
const RS_BOS_SATIR = 3000; // Tbl_UrunRecete'de hazırlanacak boş satır sayısı

// ---------- yardımcılar (panel kodundakiyle birebir aynı) ----------
function rsTrKucuk(s) {
  return (s || '').toString().replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}
function rsNrm(s) {
  return rsTrKucuk(s).replace(/[\s.,\-*\/()\\'"]/g, '');
}
function rsTrSade(s) {
  return (s || '').toString()
    .replace(/[İIı]/g, 'i').replace(/[Ğğ]/g, 'g').replace(/[Üü]/g, 'u')
    .replace(/[Şş]/g, 's').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c')
    .replace(/[Ââ]/g, 'a').replace(/[Îî]/g, 'i').replace(/[Ûû]/g, 'u')
    .toLowerCase().replace(/[\s._\-*\/()\\'"]/g, '');
}
function rsSekme(ss, ad) {
  let sh = ss.getSheetByName(ad);
  if (sh) return sh;
  const hedef = rsTrSade(ad);
  const hepsi = ss.getSheets();
  for (let i = 0; i < hepsi.length; i++) {
    if (rsTrSade(hepsi[i].getName()) === hedef) return hepsi[i];
  }
  return null;
}
function rsSekmeAcVeyaKur(ss, ad) {
  let sh = ss.getSheetByName(ad);
  if (!sh) sh = ss.insertSheet(ad);
  return sh;
}
function rsKolBul(basliklar, ad, varsayilan) {
  const i = basliklar.indexOf(rsTrSade(ad));
  return i >= 0 ? i : varsayilan;
}

// ============================================================
// ANA FONKSİYON
// ============================================================
function receteSablonuKur() {
  const ss = SpreadsheetApp.openById(RS_STOK_ID);

  const bilesenler = rsBilesenleriTopla(ss);
  rsBilesenListesiYaz(ss, bilesenler);

  const urunler = rsUrunleriOku(ss);                    // [{adi, kategori}]
  const adisyo  = rsAdisyoUrunleriTopla();              // [{ad, kategori, adet}]

  const eslesme = rsEslestirmeYaz(ss, adisyo, urunler); // {adisyoAd -> sistemAd}
  rsReceteTablosuKur(ss, urunler, bilesenler);
  rsDurumSekmesiYaz(ss, urunler, adisyo, eslesme);

  SpreadsheetApp.flush();
  Logger.log('Kurulum bitti. Bileşen: %s · Ürün: %s · Adisyo ürün adı: %s',
             bilesenler.length, urunler.length, adisyo.length);
}

// ============================================================
// 1) BİLEŞENLER — HM + YM + DS + AMB
//    "Bilesen" kolonu, stok motorunun kullandığı ADIN BİREBİR AYNISI olmalı.
// ============================================================
function rsBilesenleriTopla(ss) {
  const out = [];
  const gorulen = {};
  const ekle = (ad, tip, birim, gorunen, kategori) => {
    ad = (ad || '').toString().trim();
    if (!ad) return;
    const k = rsNrm(ad) + '|' + tip;
    if (gorulen[k]) return;
    gorulen[k] = true;
    out.push([ad, tip, birim || '', gorunen || ad, kategori || '']);
  };

  // --- Hammadde: stok anahtarı TAM AD (B sütunu) ---
  const hm = rsSekme(ss, 'Tbl_Hammaddeler');
  if (hm) {
    const r = hm.getDataRange().getValues();
    for (let i = 1; i < r.length; i++) {
      const tamAd  = r[i][1] ? r[i][1].toString().trim() : '';
      const kisaAd = r[i][2] ? r[i][2].toString().trim() : '';
      if (!tamAd) continue;
      ekle(tamAd, 'HM', r[i][8] || 'gr', kisaAd || tamAd, r[i][6] || '');
    }
  }

  // --- Yarı mamul: Cikti_Tipi tablosundaki ad ---
  const ym = rsSekme(ss, 'Tbl_YariMamul tablosuna Cikti_Tipi');
  if (ym) {
    const r = ym.getDataRange().getValues();
    for (let i = 1; i < r.length; i++) {
      const ad = r[i][0] ? r[i][0].toString().trim() : '';
      if (!ad) continue;
      // porsiyon ağırlığı varsa reçete birimi "porsiyon" daha doğal
      const porsAgir = Number(r[i][4]) || 0;
      ekle(ad, 'YM', porsAgir > 0 ? 'porsiyon' : 'gr', ad, r[i][6] || '');
    }
  }

  // --- Direkt satış (içecek vb.): stok anahtarı KISA AD varsa kısa ad ---
  const ds = rsSekme(ss, 'Direktsatisurunler');
  if (ds) {
    const r = ds.getDataRange().getValues();
    if (r.length > 1) {
      const bas = r[0].map(h => rsTrSade(h));
      const cUrun  = rsKolBul(bas, 'Urun_adi', 1);
      const cKisa  = rsKolBul(bas, 'Hammadde_Adi', 2);
      const cKat   = rsKolBul(bas, 'Kategori', 6);
      const cBirim = rsKolBul(bas, 'Birim', 7);
      for (let i = 1; i < r.length; i++) {
        const tamAd  = r[i][cUrun] ? r[i][cUrun].toString().trim() : '';
        const kisaAd = r[i][cKisa] ? r[i][cKisa].toString().trim() : '';
        const gorunen = kisaAd || tamAd;
        if (!gorunen) continue;
        ekle(gorunen, 'DS', r[i][cBirim] || 'adet', gorunen, r[i][cKat] || 'İçecek');
      }
    }
  }

  // --- Ambalaj ---
  const amb = rsSekme(ss, 'Ambalaj_Hammadde');
  if (amb) {
    const r = amb.getDataRange().getValues();
    if (r.length > 1) {
      const bas = r[0].map(h => rsTrSade(h));
      const cTamAd = rsKolBul(bas, 'Hammadde_Adı', 1);
      const cKisa  = rsKolBul(bas, 'Hammadde', 2);
      const cKat   = rsKolBul(bas, 'Kategori', 6);
      const cOlcu  = rsKolBul(bas, 'Ölçü_Birimi', 8);
      for (let i = 1; i < r.length; i++) {
        const tamAd  = r[i][cTamAd] ? r[i][cTamAd].toString().trim() : '';
        const kisaAd = r[i][cKisa]  ? r[i][cKisa].toString().trim()  : '';
        const gorunen = kisaAd || tamAd;
        if (!gorunen) continue;
        ekle(gorunen, 'AMB', r[i][cOlcu] || 'adet', gorunen, r[i][cKat] || 'Ambalaj');
      }
    }
  }

  out.sort((a, b) => (a[1] + a[0]).localeCompare(b[1] + b[0], 'tr'));
  return out;
}

function rsBilesenListesiYaz(ss, bilesenler) {
  const sh = rsSekmeAcVeyaKur(ss, 'Bilesen_Listesi');
  sh.clear();
  const bas = ['Bilesen', 'Tip', 'Varsayilan_Birim', 'Gorunen_Ad', 'Kategori'];
  sh.getRange(1, 1, 1, bas.length).setValues([bas])
    .setFontWeight('bold').setBackground('#37474f').setFontColor('#ffffff');
  if (bilesenler.length) {
    sh.getRange(2, 1, bilesenler.length, 5).setValues(bilesenler);
  }
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 5);
}

// ============================================================
// 2) SİSTEM ÜRÜNLERİ (Urun_Listesi)
// ============================================================
function rsUrunleriOku(ss) {
  const sh = rsSekme(ss, 'Urun_Listesi');
  if (!sh) return [];
  const r = sh.getDataRange().getValues();
  const out = [];
  const gorulen = {};
  for (let i = 1; i < r.length; i++) {
    const adi = r[i][0] ? r[i][0].toString().trim() : '';
    if (!adi) continue;
    const k = rsNrm(adi);
    if (gorulen[k]) continue;
    gorulen[k] = true;
    out.push({ adi: adi, kategori: r[i][1] ? r[i][1].toString().trim() : '' });
  }
  return out;
}

// ============================================================
// 3) ADİSYO'DA FİİLEN SATILAN ÜRÜN ADLARI (Detay sekmesi)
//    Detay kolonları: A Gün · B Şube · C Kanal · D Mağaza ·
//                     E Kategori · F Ürün · G Adet · H Tutar
// ============================================================
function rsAdisyoUrunleriTopla() {
  let sh = null;
  try {
    sh = rsSekme(SpreadsheetApp.openById(RS_SATIS_ID), RS_SATIS_SEKME);
  } catch (e) {
    Logger.log('Satış dosyası açılamadı: ' + e);
    return [];
  }
  if (!sh) { Logger.log('Detay sekmesi bulunamadı.'); return []; }

  const son = sh.getLastRow();
  if (son < 2) return [];
  const veri = sh.getRange(2, 5, son - 1, 3).getValues(); // E,F,G

  const harita = {};
  for (let i = 0; i < veri.length; i++) {
    const urun = veri[i][1] ? veri[i][1].toString().trim() : '';
    if (!urun) continue;
    const k = rsNrm(urun);
    if (!harita[k]) {
      harita[k] = { ad: urun, kategori: veri[i][0] ? veri[i][0].toString().trim() : '', adet: 0 };
    }
    harita[k].adet += Number(veri[i][2]) || 0;
  }

  const out = Object.keys(harita).map(k => harita[k]);
  out.sort((a, b) => b.adet - a.adet); // en çok satan üstte
  return out;
}

// ============================================================
// 4) EŞLEŞTİRME TABLOSU
// ============================================================
function rsEslestirmeYaz(ss, adisyo, urunler) {
  const sh = rsSekmeAcVeyaKur(ss, 'Tbl_UrunEslestirme');

  // Daha önce elle girilmiş eşleşmeleri koru
  const eski = {};
  if (sh.getLastRow() > 1) {
    const r = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
    for (let i = 0; i < r.length; i++) {
      const a = r[i][0] ? r[i][0].toString().trim() : '';
      const s = r[i][3] ? r[i][3].toString().trim() : '';
      if (a && s) eski[rsNrm(a)] = s;
    }
  }

  const urunHarita = {};
  urunler.forEach(u => { urunHarita[rsNrm(u.adi)] = u.adi; });

  const satirlar = adisyo.map(a => {
    const k = rsNrm(a.ad);
    const sistemAd = eski[k] || urunHarita[k] || '';
    return [a.ad, a.kategori, a.adet, sistemAd];
  });

  sh.clear();
  const bas = ['Adisyo_Ad', 'Kategori', 'Toplam_Adet', 'Sistem_Ad', 'Durum'];
  sh.getRange(1, 1, 1, bas.length).setValues([bas])
    .setFontWeight('bold').setBackground('#37474f').setFontColor('#ffffff');

  if (satirlar.length) {
    sh.getRange(2, 1, satirlar.length, 4).setValues(satirlar);
    const durum = satirlar.map((_, i) =>
      ['=IF($A' + (i + 2) + '="","",IF($D' + (i + 2) + '="","⛔ EŞLEŞMEDİ","✓"))']);
    sh.getRange(2, 5, durum.length, 1).setFormulas(durum);

    // Sistem_Ad açılır listesi
    const kaynak = ss.getSheetByName('Urun_Listesi');
    if (kaynak) {
      const kural = SpreadsheetApp.newDataValidation()
        .requireValueInRange(kaynak.getRange('A2:A'), true)
        .setAllowInvalid(true).build();
      sh.getRange(2, 4, satirlar.length, 1).setDataValidation(kural);
    }
    sh.getRange(2, 3, satirlar.length, 1).setNumberFormat('#,##0');
  }

  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 5);

  const out = {};
  satirlar.forEach(s => { if (s[3]) out[rsNrm(s[0])] = s[3]; });
  return out;
}

// ============================================================
// 5) REÇETE TABLOSU — asıl doldurulacak yer
//    Girilmiş satırlar korunur, sadece boş alanlar tazelenir.
// ============================================================
function rsReceteTablosuKur(ss, urunler, bilesenler) {
  const sh = rsSekmeAcVeyaKur(ss, 'Tbl_UrunRecete');

  const bas = ['Urun_Adi', 'Bilesen', 'Bilesen_Tipi', 'Miktar', 'Birim', 'Kanal', 'Not'];
  sh.getRange(1, 1, 1, bas.length).setValues([bas])
    .setFontWeight('bold').setBackground('#1b5e20').setFontColor('#ffffff');

  // Kaç satır dolu?
  const doluSatir = Math.max(sh.getLastRow(), 1);
  const toplam = Math.max(doluSatir, RS_BOS_SATIR + 1);
  if (sh.getMaxRows() < toplam) sh.insertRowsAfter(sh.getMaxRows(), toplam - sh.getMaxRows());

  const n = toplam - 1; // veri satırı sayısı

  // --- Açılır listeler ---
  const urunKaynak = ss.getSheetByName('Urun_Listesi');
  if (urunKaynak) {
    sh.getRange(2, 1, n, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(urunKaynak.getRange('A2:A'), true)
        .setAllowInvalid(true).build());
  }
  const bilKaynak = ss.getSheetByName('Bilesen_Listesi');
  if (bilKaynak) {
    sh.getRange(2, 2, n, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(bilKaynak.getRange('A2:A'), true)
        .setAllowInvalid(true).build());
  }
  sh.getRange(2, 6, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['', 'Paket', 'Salon'], true)
      .setAllowInvalid(true).build());

  // --- C ve E: bileşenden otomatik türeyen formüller (üzerine yazılabilir) ---
  const tipF = [], birimF = [];
  for (let i = 2; i <= toplam; i++) {
    tipF.push(['=IF($B' + i + '="","",IFERROR(VLOOKUP($B' + i +
               ',Bilesen_Listesi!$A:$B,2,FALSE),"⚠ LİSTEDE YOK"))']);
    birimF.push(['=IF($B' + i + '="","",IFERROR(VLOOKUP($B' + i +
                 ',Bilesen_Listesi!$A:$C,3,FALSE),""))']);
  }
  sh.getRange(2, 3, n, 1).setFormulas(tipF);

  // Birim: elle girilmiş değer varsa dokunma, boşsa varsayılan formülü koy
  const birimAralik = sh.getRange(2, 5, n, 1);
  const mevcutBirim = birimAralik.getValues();
  const mevcutBirimF = birimAralik.getFormulas();
  const yeniBirim = [];
  for (let i = 0; i < n; i++) {
    const elleGirilmis = mevcutBirim[i][0] !== '' && mevcutBirim[i][0] !== null &&
                         mevcutBirimF[i][0] === '';
    yeniBirim.push(elleGirilmis ? [mevcutBirim[i][0]] : birimF[i]);
  }
  birimAralik.setValues(yeniBirim);

  // Uyarı biçimlendirmesi: listede olmayan bileşen kırmızı
  const kural = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('⚠ LİSTEDE YOK')
    .setBackground('#ffcdd2')
    .setRanges([sh.getRange(2, 3, n, 1)])
    .build();
  sh.setConditionalFormatRules([kural]);

  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 240);
  sh.setColumnWidth(2, 300);
  sh.setColumnWidth(7, 260);
}

// ============================================================
// 6) DURUM SEKMESİ — hangi ürünün reçetesi eksik, öncelik sırasıyla
// ============================================================
function rsDurumSekmesiYaz(ss, urunler, adisyo, eslesme) {
  const sh = rsSekmeAcVeyaKur(ss, 'Urun_Durum');
  sh.clear();

  // Sistem ürünü bazında satış adedi
  const satis = {};
  adisyo.forEach(a => {
    const sistemAd = eslesme[rsNrm(a.ad)];
    if (!sistemAd) return;
    const k = rsNrm(sistemAd);
    satis[k] = (satis[k] || 0) + a.adet;
  });

  const satirlar = urunler.map(u => [u.adi, u.kategori, satis[rsNrm(u.adi)] || 0]);
  satirlar.sort((a, b) => b[2] - a[2]); // en çok satan önce

  const bas = ['Urun_Adi', 'Kategori', 'Toplam_Satis_Adedi', 'Bilesen_Sayisi', 'Durum'];
  sh.getRange(1, 1, 1, bas.length).setValues([bas])
    .setFontWeight('bold').setBackground('#37474f').setFontColor('#ffffff');

  if (satirlar.length) {
    sh.getRange(2, 1, satirlar.length, 3).setValues(satirlar);
    const f = satirlar.map((_, i) => {
      const r = i + 2;
      return ['=COUNTIF(Tbl_UrunRecete!$A:$A,$A' + r + ')',
              '=IF($D' + r + '=0,"⛔ REÇETE YOK","✓ " & $D' + r + ' bileşen")'];
    });
    sh.getRange(2, 4, f.length, 2).setFormulas(f);
    sh.getRange(2, 3, satirlar.length, 1).setNumberFormat('#,##0');

    const kural = SpreadsheetApp.newConditionalFormatRule()
      .whenTextStartsWith('⛔')
      .setBackground('#ffcdd2')
      .setRanges([sh.getRange(2, 5, satirlar.length, 1)])
      .build();
    sh.setConditionalFormatRules([kural]);
  }

  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 5);
}