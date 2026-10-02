/*************************************************************
 *  B.A.P RAPOR  —  v5
 *
 *  "Gunluk_Indirimli_Siparisler" sayfası — indirim verilen her siparişi
 *  tek tek listeler (tarih/saat, sipariş ID, kanal, marka, MAHALLE,
 *  ADRES, ödeme yöntemi, ürünler, liste cirosu, tahsilat, indirim TL/%).
 *  Sağ tarafta mahalle bazında indirim özeti var.
 *   - Siparişler TARİH/SAAT sırasına göre (eskiden yeniye) dizilir.
 *   - Masa ve Gel Al siparişlerinde mahalle/adres yerine "Masa" / "Gel Al"
 *     yazar; mahalle özetinde de ayrı satır olarak görünür.
 *   - Paket siparişte adres gerçekten boşsa "— (boş)" kalır.
 *
 *  YENİ KAYNAK: "BAP Adisyo Siparis Datası"
 *  (eski "Make.com Data" tablosu artık kullanılmıyor)
 *
 *  Yeni sayfadaki sütun düzeni (1'den sayarak):
 *    C(3)  Sipariş Tarihi      I(9)  Sipariş Kanalı
 *    H(8)  Sipariş Tipi        K(11) Ödeme Yöntemi
 *    P(16) Ürün Kategorileri   Q(17) Ürünler
 *    R(18) Ürün Adetleri       S(19) Ürün Fiyatları   ← ADET ve FİYAT YER DEĞİŞTİRDİ
 *    T(20) Toplam Tutar        X(24) Durum
 *
 *  Eski kod sabit sütun numarası kullandığı için (V/W/X/Y) bu tabloda
 *  fiyatları bulamıyordu → teorik ciro 0 → "indirim yok".
 *  Bu sürümde sütunlar BAŞLIK ADINA göre bulunuyor, sayfa da otomatik
 *  seçiliyor; tablo bir daha değişirse kod kendini toparlar.
 *************************************************************/

const ANA_VERI_TABLOSU_ID = "1gdn_rbaevKx9_-pNTRKL1DDtytFxZHr9QF-jrS4cHPE"; // BAP Adisyo Siparis Datası
const KAYNAK_SAYFA_ADI    = "";     // boş bırakın → doğru sayfa otomatik bulunur
const INDIRIM_ESIK        = 1;      // TL. Bu tutarın üstündeki fark "indirim" sayılır.
const ZAMAN_DILIMI        = "GMT+3";

/* ───────────────────────── MENÜ ───────────────────────── */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 BAP Rapor')
    .addItem('⚡ Raporu Güncelle / Getir', 'raporuOlustur')
    .addItem('🔍 Teşhis: Veriyi Kontrol Et', 'teshis')
    .addItem('🔑 Otomatik Yenilemeyi Aç (Tetikleyici Kur)', 'otomatikYenilemeyiBaslat')
    .addToUi();
}

function installedOnEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const a1 = e.range.getA1Notation();
  if (sheet.getName() === 'Gunluk_Satis_Detay' && (a1 === 'B2' || a1 === 'D2' || a1 === 'F2')) {
    raporuOlustur();
  }
}

function otomatikYenilemeyiBaslat() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // SADECE kendi onEdit tetikleyicimizi sil — gece raporu vb. tetikleyicilere dokunma.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'installedOnEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('installedOnEdit').forSpreadsheet(ss).onEdit().create();
  uyari("✅ Otomatik yenileme açıldı.\n\n(Diğer tetikleyicileriniz silinmedi.)");
}

/* ──────────────────── YARDIMCI FONKSİYONLAR ──────────────────── */

function uyari(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

/** Türkçe/İngilizce her formatı tolere eden sayı çevirici. */
function sayiyaCevir(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return 0;
  let s = String(v).replace(/[^\d.,\-]/g, '').trim();
  if (!s) return 0;
  const sonVirgul = s.lastIndexOf(','), sonNokta = s.lastIndexOf('.');
  if (sonVirgul > -1 && sonNokta > -1) {
    if (sonVirgul > sonNokta) s = s.replace(/\./g, '').replace(',', '.');   // 1.234,56
    else                      s = s.replace(/,/g, '');                      // 1,234.56
  } else if (sonVirgul > -1) {
    const p = s.split(',');
    s = (p.length === 2 && p[1].length !== 3) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (sonNokta > -1) {
    const p = s.split('.');
    if (p.length > 2 || (p.length === 2 && p[1].length === 3)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Date / gg.aa.yyyy / gg/aa/yyyy / yyyy-aa-gg / ISO / Sheets seri no. */
function parseDateObject(val) {
  if (val === null || val === undefined || val === '') return null;

  if (val instanceof Date) {
    if (isNaN(val.getTime()) || val.getFullYear() < 1950) return null;
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }
  if (typeof val === 'number') {
    if (val < 1000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + val * 86400000);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  const str = String(val).trim();
  if (!str) return null;

  let m = str.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);        // 13.09.2026 / 13/09/2026
  if (m) { const y = +m[3]; return y < 1950 ? null : new Date(y, +m[2] - 1, +m[1]); }

  m = str.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);            // 2026-09-13 (ISO "T" dahil)
  if (m) { const y = +m[1]; return y < 1950 ? null : new Date(y, +m[2] - 1, +m[3]); }

  const d = new Date(str);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 1950) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return null;
}

function formatDateISO(d) { return Utilities.formatDate(d, ZAMAN_DILIMI, "yyyy-MM-dd"); }

/** Hücredeki ham tarih değerini "gg.aa.yyyy SS:dd" olarak gösterir. */
function zamanGoster(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, ZAMAN_DILIMI, "dd.MM.yyyy HH:mm");
  return String(v || '');
}

/** Başlık adına göre sütun bulur — sabit harf/numara YOK. */
function sutunlariBul(headers) {
  const norm = s => String(s || '')
    .replace(/\\/g, '').replace(/\s+/g, ' ').trim()
    .toLocaleLowerCase('tr').replace(/i̇/g, 'i');

  function bul(adaylar) {
    for (const a of adaylar) {                       // 1) tam eşleşme
      const t = norm(a);
      for (let c = 0; c < headers.length; c++) if (norm(headers[c]) === t) return c;
    }
    for (const a of adaylar) {                       // 2) içerir
      const t = norm(a);
      for (let c = 0; c < headers.length; c++) if (norm(headers[c]).indexOf(t) > -1) return c;
    }
    return -1;
  }

  return {
    tarih:       bul(['Sipariş Tarihi', 'Tarih_ISO', 'tarih', 'date']),
    siparisId:   bul(['Sipariş ID']),
    mahalle:     bul(['Mahalle']),
    adres:       bul(['Müşteri Adres', 'Adres']),
    tip:         bul(['Sipariş Tipi']),
    kanal:       bul(['Sipariş Kanalı', 'kanal', 'platform']),
    marka:       bul(['Marka']),
    sube:        bul(['Şube']),
    odeme:       bul(['Ödeme Yöntemi', 'ödeme']),
    kategoriler: bul(['Ürün Kategorileri']),
    urunler:     bul(['Ürünler']),
    adetler:     bul(['Ürün Adetleri']),
    fiyatlar:    bul(['Ürün Fiyatları']),
    tutar:       bul(['Toplam Tutar', 'tutar', 'total']),
    durum:       bul(['Durum'])
  };
}

/** Doğru sayfayı otomatik bulur: başlıkları uyan ve en çok satırı olan sayfa. */
function kaynakSayfaBul(anaSS) {
  if (KAYNAK_SAYFA_ADI) {
    const s = anaSS.getSheetByName(KAYNAK_SAYFA_ADI);
    if (s) return s;
  }
  let enIyi = null, enCokSatir = -1;
  anaSS.getSheets().forEach(function (sh) {
    const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 5) return;
    const C = sutunlariBul(sh.getRange(1, 1, 1, lastCol).getValues()[0]);
    if (C.tarih === -1 || C.urunler === -1 || C.fiyatlar === -1 || C.tutar === -1) return;
    if (lastRow > enCokSatir) { enCokSatir = lastRow; enIyi = sh; }
  });
  return enIyi;
}

function kanalBelirle(kanalRaw, tipRaw) {
  const k = String(kanalRaw || '').toLocaleLowerCase('tr');
  if (k.indexOf('getir') > -1) return 'Getir';
  if (k.indexOf('trendyol') > -1) return 'Trendyol';
  if (k.indexOf('yemeksepeti') > -1 || k.indexOf('dh') > -1) return 'Yemeksepeti';
  // Kanal boşsa sipariş tipine bak (masa / gel al / paket)
  const t = String(tipRaw || '').toLocaleLowerCase('tr');
  if (k.indexOf('getir') > -1 || t.indexOf('getir') > -1) return 'Getir';
  return 'Masa / Paket';
}

function boruAyir(v) {
  return String(v === null || v === undefined ? '' : v).split('|').map(s => s.trim());
}

/* ──────────────────────── ANA RAPOR ──────────────────────── */

function raporuOlustur() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const detSheet = ss.getSheetByName('Gunluk_Satis_Detay') || ss.insertSheet('Gunluk_Satis_Detay');

  const secim = detSheet.getRange('B2').getValue() || "Bugün";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate, endDate;

  switch (secim) {
    case "Bugün":      startDate = today; endDate = today; break;
    case "Dün":        startDate = new Date(today.getTime() - 864e5); endDate = startDate; break;
    case "Son 7 Gün":  startDate = new Date(today.getTime() - 6 * 864e5);  endDate = today; break;
    case "Son 30 Gün": startDate = new Date(today.getTime() - 29 * 864e5); endDate = today; break;
    case "Bu Ay":      startDate = new Date(today.getFullYear(), today.getMonth(), 1); endDate = today; break;
    case "Geçen Ay":
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate   = new Date(today.getFullYear(), today.getMonth(), 0); break;
    default:
      startDate = parseDateObject(detSheet.getRange('D2').getValue()) || today;
      endDate   = parseDateObject(detSheet.getRange('F2').getValue()) || startDate;
  }
  if (endDate < startDate) endDate = startDate;
  const startStr = formatDateISO(startDate), endStr = formatDateISO(endDate);

  /* --- kaynağı oku --- */
  let rawData, kaynakAdi;
  try {
    const anaSS = SpreadsheetApp.openById(ANA_VERI_TABLOSU_ID);
    const kaynakSheet = kaynakSayfaBul(anaSS);
    if (!kaynakSheet) {
      uyari("Kaynak tabloda uygun sipariş sayfası bulunamadı.\n\nAranan başlıklar: Sipariş Tarihi, Ürünler, Ürün Fiyatları, Toplam Tutar");
      return;
    }
    kaynakAdi = kaynakSheet.getName();
    rawData = kaynakSheet.getRange(1, 1, kaynakSheet.getLastRow(), kaynakSheet.getLastColumn()).getValues();
  } catch (err) {
    uyari("Ana tabloya bağlanılamadı!\nHata: " + err.message);
    return;
  }
  if (!rawData || rawData.length < 2) { uyari("Kaynak sayfada veri yok."); return; }

  const C = sutunlariBul(rawData[0]);

  /* --- topla --- */
  const urunOzet = {};
  const mutabakat = {
    'Getir':        { teorik: 0, odenen: 0, adet: 0 },
    'Trendyol':     { teorik: 0, odenen: 0, adet: 0 },
    'Yemeksepeti':  { teorik: 0, odenen: 0, adet: 0 },
    'Masa / Paket': { teorik: 0, odenen: 0, adet: 0 }
  };
  const indirimliUrun = {};
  const indirimliSiparis = { 'Getir': 0, 'Trendyol': 0, 'Yemeksepeti': 0, 'Masa / Paket': 0 };
  const indirimliSiparisListesi = [];   // sipariş bazlı liste (mahalle/adres ile)

  const tani = {
    kaynak: kaynakAdi,
    toplamSatir: rawData.length - 1,
    tarihOkunamayan: 0, araliktaki: 0, odenmez: 0, iptal: 0,
    fiyatiEksik: 0, urunuEksik: 0,
    enEskiTarih: null, enYeniTarih: null
  };

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];

    const rowDate = parseDateObject(row[C.tarih]);
    if (!rowDate) {
      if (String(row[C.tarih] || '').trim() !== '') tani.tarihOkunamayan++;
      continue;
    }
    if (!tani.enEskiTarih || rowDate < tani.enEskiTarih) tani.enEskiTarih = rowDate;
    if (!tani.enYeniTarih || rowDate > tani.enYeniTarih) tani.enYeniTarih = rowDate;
    if (rowDate < startDate || rowDate > endDate) continue;

    if (C.durum > -1 && String(row[C.durum] || '').toLocaleLowerCase('tr').indexOf('iptal') > -1) {
      tani.iptal++; continue;
    }
    if (C.odeme > -1) {
      const oy = String(row[C.odeme] || '').toLocaleLowerCase('tr');
      if (oy.indexOf('ödenmez') > -1 || oy.indexOf('odenmez') > -1) { tani.odenmez++; continue; }
    }

    tani.araliktaki++;

    const odenenTutar = sayiyaCevir(row[C.tutar]);
    const kanal = kanalBelirle(row[C.kanal], C.tip > -1 ? row[C.tip] : '');
    mutabakat[kanal].odenen += odenenTutar;

    const urunler     = boruAyir(row[C.urunler]);
    const fiyatlar    = boruAyir(row[C.fiyatlar]).map(sayiyaCevir);
    const adetler     = boruAyir(row[C.adetler]).map(sayiyaCevir);
    const kategoriler = C.kategoriler > -1 ? boruAyir(row[C.kategoriler]) : [];

    const kalemler = [];
    let siparisTeorik = 0;
    for (let u = 0; u < urunler.length; u++) {
      const uAdi = urunler[u];
      if (!uAdi) continue;
      const uAdet  = adetler[u] > 0 ? adetler[u] : (fiyatlar[u] > 0 ? 1 : 0);
      const uFiyat = fiyatlar[u] || 0;
      const uCiro  = uFiyat * uAdet;
      if (uAdet === 0 && uCiro === 0) continue;      // Adisyo'nun "0 adet" tekrar satırları
      siparisTeorik += uCiro;
      kalemler.push({ adi: uAdi, kat: (kategoriler[u] || 'Diğer'), fiyat: uFiyat, adet: uAdet, ciro: uCiro });
    }

    if (kalemler.length === 0) { tani.urunuEksik++; continue; }
    if (siparisTeorik === 0)   { tani.fiyatiEksik++; }

    const siparisIndirim = siparisTeorik - odenenTutar;
    const indirimliMi = siparisTeorik > 0 && siparisIndirim > INDIRIM_ESIK;
    if (indirimliMi) {
      indirimliSiparis[kanal]++;
      let mah = C.mahalle > -1 ? String(row[C.mahalle] || '').trim() : '';
      let adr = C.adres   > -1 ? String(row[C.adres]   || '').trim() : '';
      // Masa / Gel Al siparişlerinde mahalle-adres olmaz; "boş" yerine tipini yaz.
      const tipStr = (C.tip > -1 ? String(row[C.tip] || '') : '').toLocaleLowerCase('tr');
      const icerdeMi = tipStr.indexOf('masa') > -1 || tipStr.indexOf('salon') > -1 ||
                       tipStr.indexOf('gel al') > -1 || tipStr.indexOf('gel-al') > -1;
      if (icerdeMi) {
        const etiket = (tipStr.indexOf('gel al') > -1 || tipStr.indexOf('gel-al') > -1) ? 'Gel Al' : 'Masa';
        if (!mah) mah = etiket;
        if (!adr) adr = etiket;
      }
      indirimliSiparisListesi.push({
        zaman:    zamanGoster(row[C.tarih]),
        siraDate: (row[C.tarih] instanceof Date && !isNaN(row[C.tarih].getTime()))
                    ? row[C.tarih].getTime() : rowDate.getTime(),
        id:       C.siparisId > -1 ? String(row[C.siparisId] || '') : '',
        kanal:    kanal,
        tip:      C.tip   > -1 ? String(row[C.tip]   || '') : '',
        marka:    C.marka > -1 ? String(row[C.marka] || '') : (C.sube > -1 ? String(row[C.sube] || '') : ''),
        mahalle:  mah || '— (boş)',
        adres:    adr || '— (boş)',
        odeme:    C.odeme > -1 ? String(row[C.odeme] || '') : '',
        urunler:  kalemler.map(k => (k.adet > 1 ? k.adet + '× ' : '') + k.adi).join(' | '),
        teorik:   siparisTeorik,
        odenen:   odenenTutar,
        indirim:  siparisIndirim,
        oran:     siparisIndirim / siparisTeorik
      });
    }

    for (const k of kalemler) {
      mutabakat[kanal].teorik += k.ciro;
      mutabakat[kanal].adet   += k.adet;

      if (!urunOzet[k.adi]) {
        urunOzet[k.adi] = {
          kategori: k.kat, fiyat: k.fiyat,
          masa_adet: 0, masa_ciro: 0, ys_adet: 0, ys_ciro: 0,
          getir_adet: 0, getir_ciro: 0, trendyol_adet: 0, trendyol_ciro: 0
        };
      }
      const o = urunOzet[k.adi];
      if      (kanal === 'Masa / Paket') { o.masa_adet     += k.adet; o.masa_ciro     += k.ciro; }
      else if (kanal === 'Yemeksepeti')  { o.ys_adet       += k.adet; o.ys_ciro       += k.ciro; }
      else if (kanal === 'Getir')        { o.getir_adet    += k.adet; o.getir_ciro    += k.ciro; }
      else if (kanal === 'Trendyol')     { o.trendyol_adet += k.adet; o.trendyol_ciro += k.ciro; }

      if (indirimliMi) {
        const key = kanal + '|' + k.adi;
        if (!indirimliUrun[key]) {
          indirimliUrun[key] = { kanal: kanal, kategori: k.kat, urun: k.adi, adet: 0, siparis: 0, listeCiro: 0, indirimPayi: 0 };
        }
        const d = indirimliUrun[key];
        d.adet        += k.adet;
        d.siparis++;
        d.listeCiro   += k.ciro;
        d.indirimPayi += siparisIndirim * (k.ciro / siparisTeorik);
      }
    }
  }

  /* --- sayfa 1: ürün detayı --- */
  sablonOlusturGuvenli(detSheet, secim, startDate, endDate);

  const rows1 = [];
  for (const [uAdi, d] of Object.entries(urunOzet)) {
    const totAdet = d.masa_adet + d.ys_adet + d.getir_adet + d.trendyol_adet;
    const totCiro = d.masa_ciro + d.ys_ciro + d.getir_ciro + d.trendyol_ciro;
    rows1.push([d.kategori, uAdi, d.masa_adet, d.masa_ciro, d.ys_adet, d.ys_ciro,
                d.getir_adet, d.getir_ciro, d.trendyol_adet, d.trendyol_ciro, totAdet, totCiro]);
  }
  rows1.sort((a, b) => a[0].localeCompare(b[0], 'tr') || b[10] - a[10] || a[1].localeCompare(b[1], 'tr'));

  const lastR = detSheet.getLastRow();
  if (lastR >= 5) detSheet.getRange(5, 1, lastR - 4, 12).clearContent();
  if (rows1.length > 0) {
    detSheet.getRange(5, 1, rows1.length, 12).setValues(rows1);
    for (let c = 3; c <= 11; c += 2) detSheet.getRange(5, c, rows1.length, 1).setNumberFormat('#,##0');
    for (let c = 4; c <= 12; c += 2) detSheet.getRange(5, c, rows1.length, 1).setNumberFormat('#,##0.00 "₺"');
  }

  /* --- sayfa 2: mutabakat --- */
  const mutSheet = ss.getSheetByName('Gunluk_Indirim_Mutabakat') || ss.insertSheet('Gunluk_Indirim_Mutabakat');
  mutSheet.clear();
  const baslikAralik = (startStr === endStr) ? startStr : (startStr + "  ➜  " + endStr);

  mutSheet.getRange('A1:G1').merge().setValue('B.A.P PLATFORM İNDİRİM & JOKER MUTABAKATI')
    .setBackground('#1F4E78').setFontColor('#FFF').setFontWeight('bold').setHorizontalAlignment('center');
  mutSheet.getRange('A2').setValue('SEÇİLEN DÖNEM:').setFontWeight('bold');
  mutSheet.getRange('B2:D2').merge().setValue(secim + " (" + baslikAralik + ")")
    .setFontWeight('bold').setBackground('#E26B00').setFontColor('#FFF').setHorizontalAlignment('center');
  mutSheet.getRange('F2').setValue('Kaynak: ' + kaynakAdi + ' · ' + tani.araliktaki + ' sipariş')
    .setFontStyle('italic').setFontColor('#666');

  const headers2 = ['Sipariş Kanalı', 'Satılan Adet', 'Liste Fiyatı Cirosu (Teorik Brüt)', 'Gerçek Tahsilat',
                    'Verilen Toplam İndirim / Fark (TL)', 'İndirim Oranı (%)', 'Durum Kontrolü'];
  mutSheet.getRange(4, 1, 1, headers2.length).setValues([headers2])
    .setBackground('#203764').setFontColor('#FFF').setFontWeight('bold');

  const rows2 = [];
  for (const [kanalAdi, data] of Object.entries(mutabakat)) {
    const fark = data.teorik - data.odenen;
    const indOran = data.teorik > 0 ? (fark / data.teorik) : 0;
    const durum = data.teorik === 0 ? 'Veri yok' : (fark > 1 ? 'İndirim / Joker Kesildi' : 'Standart Liste Fiyatı');
    rows2.push([kanalAdi, data.adet, data.teorik, data.odenen, fark, indOran, durum]);
  }
  mutSheet.getRange(5, 1, rows2.length, headers2.length).setValues(rows2);
  mutSheet.getRange(5, 2, rows2.length, 1).setNumberFormat('#,##0');
  mutSheet.getRange(5, 3, rows2.length, 3).setNumberFormat('#,##0.00 "₺"');
  mutSheet.getRange(5, 6, rows2.length, 1).setNumberFormat('0.0%');

  const totR = 5 + rows2.length;
  mutSheet.getRange(totR, 1).setValue('GENEL TOPLAM').setFontWeight('bold');
  mutSheet.getRange(totR, 2).setFormula('=SUM(B5:B' + (totR - 1) + ')').setFontWeight('bold');
  mutSheet.getRange(totR, 3).setFormula('=SUM(C5:C' + (totR - 1) + ')').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"');
  mutSheet.getRange(totR, 4).setFormula('=SUM(D5:D' + (totR - 1) + ')').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"');
  mutSheet.getRange(totR, 5).setFormula('=SUM(E5:E' + (totR - 1) + ')').setFontWeight('bold').setFontColor('#E26B00').setNumberFormat('#,##0.00 "₺"');
  mutSheet.getRange(totR, 6).setFormula('=IF(C' + totR + '>0; E' + totR + '/C' + totR + '; 0)').setFontWeight('bold').setNumberFormat('0.0%');
  mutSheet.getRange(totR, 7).setValue('MUTABAKAT TAMAM').setFontWeight('bold');
  mutSheet.getRange(totR, 1, 1, headers2.length).setBackground('#EAEEF3');

  /* --- sayfa 3: indirimli ürünler --- */
  indirimliUrunSayfasiYaz(ss, indirimliUrun, indirimliSiparis, secim, baslikAralik, tani);

  /* --- sayfa 4: indirimli siparişler (mahalle / adres) --- */
  indirimliSiparisSayfasiYaz(ss, indirimliSiparisListesi, secim, baslikAralik, tani);

  ss.toast(
    tani.araliktaki + ' sipariş · ' +
    Object.values(indirimliSiparis).reduce((a, b) => a + b, 0) + ' indirimli' +
    (tani.iptal ? ' · ' + tani.iptal + ' iptal hariç' : '') +
    (tani.fiyatiEksik ? ' · ⚠ ' + tani.fiyatiEksik + ' siparişte fiyat yok' : ''),
    baslikAralik, 8);
}

/* ─────────────── SAYFA 3 (teşhis satırlarıyla) ─────────────── */

function indirimliUrunSayfasiYaz(ss, indirimliUrun, indirimliSiparis, secim, baslikAralik, tani) {
  const sh = ss.getSheetByName('Gunluk_Indirimli_Urunler') || ss.insertSheet('Gunluk_Indirimli_Urunler');
  sh.clear();

  sh.getRange('A1:I1').merge().setValue('B.A.P İNDİRİMLİ SİPARİŞLERDE TERCİH EDİLEN ÜRÜNLER')
    .setBackground('#1F4E78').setFontColor('#FFF').setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange('A2').setValue('SEÇİLEN DÖNEM:').setFontWeight('bold');
  sh.getRange('B2:D2').merge().setValue(secim + " (" + baslikAralik + ")")
    .setFontWeight('bold').setBackground('#E26B00').setFontColor('#FFF').setHorizontalAlignment('center');
  sh.getRange('F2').setValue('İndirimli Sipariş:').setFontWeight('bold');
  sh.getRange('G2:I2').merge()
    .setValue(Object.entries(indirimliSiparis).map(([k, v]) => k + ': ' + v).join('   |   '))
    .setFontStyle('italic');

  const headers = ['Kategori', 'Ürün Adı', 'Kanal', 'Satılan Adet', 'Geçtiği Sipariş Sayısı',
                   'Liste Cirosu', 'Tahmini İndirim Payı', 'Tahmini Net Tahsilat', 'İndirim Oranı (%)'];
  sh.getRange(4, 1, 1, headers.length).setValues([headers])
    .setBackground('#203764').setFontColor('#FFF').setFontWeight('bold');

  const rows = [];
  for (const d of Object.values(indirimliUrun)) {
    rows.push([d.kategori, d.urun, d.kanal, d.adet, d.siparis, d.listeCiro, d.indirimPayi,
               d.listeCiro - d.indirimPayi, d.listeCiro > 0 ? d.indirimPayi / d.listeCiro : 0]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0], 'tr') || b[3] - a[3] ||
                      a[1].localeCompare(b[1], 'tr') || a[2].localeCompare(b[2], 'tr'));

  if (rows.length === 0) {
    const t = [
      ['Bu dönemde indirimli sipariş bulunamadı — teşhis:', ''],
      ['Okunan kaynak sayfa', tani.kaynak],
      ['Kaynaktaki toplam satır', tani.toplamSatir],
      ['Seçilen tarih aralığına düşen sipariş', tani.araliktaki],
      ['Tarihi okunamadığı için atlanan satır', tani.tarihOkunamayan],
      ['İptal olduğu için atlanan sipariş', tani.iptal],
      ['"Ödenmez" olduğu için atlanan sipariş', tani.odenmez],
      ['Ürün listesi boş olan sipariş', tani.urunuEksik],
      ['Fiyat verisi boş olduğu için hesaplanamayan sipariş', tani.fiyatiEksik],
      ['Kaynaktaki en eski tarih', tani.enEskiTarih ? formatDateISO(tani.enEskiTarih) : '—'],
      ['Kaynaktaki en yeni tarih', tani.enYeniTarih ? formatDateISO(tani.enYeniTarih) : '—']
    ];
    sh.getRange(5, 1, t.length, 2).setValues(t);
    sh.getRange(5, 1).setFontWeight('bold').setFontColor('#B00020');
    sh.autoResizeColumns(1, 2);
    return;
  }

  sh.getRange(5, 1, rows.length, headers.length).setValues(rows);
  sh.getRange(5, 4, rows.length, 2).setNumberFormat('#,##0');
  sh.getRange(5, 6, rows.length, 3).setNumberFormat('#,##0.00 "₺"');
  sh.getRange(5, 9, rows.length, 1).setNumberFormat('0.0%');

  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] !== rows[r - 1][0]) {
      sh.getRange(5 + r, 1, 1, headers.length)
        .setBorder(true, null, null, null, null, null, '#1F4E78', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    }
  }
  sh.setFrozenRows(4);
  sh.autoResizeColumns(1, headers.length);
}

/* ───────── SAYFA 4: İNDİRİMLİ SİPARİŞLER (MAHALLE / ADRES) ───────── */

function indirimliSiparisSayfasiYaz(ss, liste, secim, baslikAralik, tani) {
  const sh = ss.getSheetByName('Gunluk_Indirimli_Siparisler') || ss.insertSheet('Gunluk_Indirimli_Siparisler');
  sh.clear();

  sh.getRange('A1:M1').merge().setValue('B.A.P İNDİRİMLİ SİPARİŞLER — MAHALLE / ADRES DETAYI')
    .setBackground('#1F4E78').setFontColor('#FFF').setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange('A2').setValue('SEÇİLEN DÖNEM:').setFontWeight('bold');
  sh.getRange('B2:D2').merge().setValue(secim + " (" + baslikAralik + ")")
    .setFontWeight('bold').setBackground('#E26B00').setFontColor('#FFF').setHorizontalAlignment('center');

  const topIndirim = liste.reduce((a, r) => a + r.indirim, 0);
  sh.getRange('F2').setValue(liste.length + ' indirimli sipariş  ·  toplam indirim: ' +
      Utilities.formatString('%s ₺', Math.round(topIndirim).toLocaleString('tr-TR')))
    .setFontWeight('bold').setFontColor('#B00020');

  const headers = ['Tarih / Saat', 'Sipariş ID', 'Kanal', 'Sipariş Tipi', 'Marka / Şube',
                   'Mahalle', 'Adres', 'Ödeme Yöntemi', 'Ürünler',
                   'Liste Cirosu', 'Tahsilat', 'İndirim (TL)', 'İndirim (%)'];
  sh.getRange(4, 1, 1, headers.length).setValues([headers])
    .setBackground('#203764').setFontColor('#FFF').setFontWeight('bold');

  if (liste.length === 0) {
    sh.getRange('A5').setValue('Bu dönemde indirimli sipariş yok. (Aralıkta ' + tani.araliktaki +
                               ' sipariş tarandı — ayrıntı için Gunluk_Indirimli_Urunler sayfasına bakın.)')
      .setFontStyle('italic');
    sh.setFrozenRows(4);
    sh.autoResizeColumns(1, headers.length);
    return;
  }

  // Tarih/saat sırasına göre (eskiden yeniye)
  liste.sort((a, b) => a.siraDate - b.siraDate);

  const rows = liste.map(r => [r.zaman, r.id, r.kanal, r.tip, r.marka, r.mahalle, r.adres,
                               r.odeme, r.urunler, r.teorik, r.odenen, r.indirim, r.oran]);
  sh.getRange(5, 1, rows.length, headers.length).setValues(rows);
  sh.getRange(5, 2, rows.length, 1).setNumberFormat('@');                    // ID bilimsel gösterime düşmesin
  sh.getRange(5, 10, rows.length, 3).setNumberFormat('#,##0.00 "₺"');
  sh.getRange(5, 13, rows.length, 1).setNumberFormat('0.0%');
  sh.getRange(5, 12, rows.length, 1).setFontWeight('bold').setFontColor('#B00020');
  sh.getRange(5, 7, rows.length, 1).setWrap(false);
  sh.getRange(5, 9, rows.length, 1).setWrap(false);

  // %25 üzeri indirimli siparişleri işaretle
  const kural = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(0.25)
    .setBackground('#FCE4E4')
    .setRanges([sh.getRange(5, 13, rows.length, 1)])
    .build();
  sh.setConditionalFormatRules([kural]);

  /* --- sağ tarafta mahalle özeti --- */
  const mahOzet = {};
  liste.forEach(r => {
    if (!mahOzet[r.mahalle]) mahOzet[r.mahalle] = { siparis: 0, teorik: 0, indirim: 0 };
    const m = mahOzet[r.mahalle];
    m.siparis++; m.teorik += r.teorik; m.indirim += r.indirim;
  });
  const mahRows = Object.entries(mahOzet)
    .map(([ad, m]) => [ad, m.siparis, m.teorik, m.indirim, m.teorik > 0 ? m.indirim / m.teorik : 0])
    .sort((a, b) => b[3] - a[3]);

  sh.getRange(2, 15).setValue('MAHALLE BAZINDA İNDİRİM').setFontWeight('bold').setFontColor('#1F4E78');
  sh.getRange(4, 15, 1, 5).setValues([['Mahalle', 'Sipariş', 'Liste Cirosu', 'İndirim (TL)', 'Oran']])
    .setBackground('#203764').setFontColor('#FFF').setFontWeight('bold');
  sh.getRange(5, 15, mahRows.length, 5).setValues(mahRows);
  sh.getRange(5, 17, mahRows.length, 2).setNumberFormat('#,##0.00 "₺"');
  sh.getRange(5, 19, mahRows.length, 1).setNumberFormat('0.0%');

  sh.setFrozenRows(4);
  sh.autoResizeColumns(1, 6);
  sh.setColumnWidth(7, 280);    // Adres
  sh.setColumnWidth(9, 340);    // Ürünler
  sh.autoResizeColumns(10, 4);
  sh.autoResizeColumns(15, 5);
}

/* ──────────────────────── ŞABLON ──────────────────────── */

function sablonOlusturGuvenli(sheet, secim, sDate, eDate) {
  sheet.getRange('A1:Z3').breakApart();
  sheet.getRange('A1:L1').merge().setValue('B.A.P PLATFORM SATIŞ & CİRO DETAYI')
    .setBackground('#1F4E78').setFontColor('#FFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange('A2').setValue('DÖNEM:').setFontWeight('bold');

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Bugün', 'Dün', 'Son 7 Gün', 'Son 30 Gün', 'Bu Ay', 'Geçen Ay', 'Özel Tarih / Aralık'], true)
    .setAllowInvalid(false).build();
  sheet.getRange('B2').setDataValidation(rule).setValue(secim)
    .setBackground('#E26B00').setFontColor('#FFF').setFontWeight('bold').setHorizontalAlignment('center');

  sheet.getRange('C2').setValue('BAŞLANGIÇ:').setFontWeight('bold');
  sheet.getRange('D2').setValue(formatDateISO(sDate)).setHorizontalAlignment('center');
  sheet.getRange('E2').setValue('BİTİŞ:').setFontWeight('bold');
  sheet.getRange('F2').setValue(formatDateISO(eDate)).setHorizontalAlignment('center');
  sheet.getRange('G2:L2').merge().setValue('💡 B2 açılır listesinden dönemi seçin.')
    .setFontStyle('italic').setFontColor('#555');

  const headers = ['Kategori', 'Ürün Adı', 'Masa (Adet)', 'Masa (Ciro)', 'YS (Adet)', 'YS (Ciro)',
                   'Getir (Adet)', 'Getir (Ciro)', 'Trendyol (Adet)', 'Trendyol (Ciro)',
                   'Toplam Adet', 'Toplam Liste Cirosu'];
  sheet.getRange(4, 1, 1, headers.length).setValues([headers])
    .setBackground('#203764').setFontColor('#FFF').setFontWeight('bold');
}

/* ──────────────────────── TEŞHİS ──────────────────────── */

function teshis() {
  const anaSS = SpreadsheetApp.openById(ANA_VERI_TABLOSU_ID);
  const sh = kaynakSayfaBul(anaSS);
  if (!sh) { uyari('Uygun sipariş sayfası bulunamadı.'); return; }

  const data = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const C = sutunlariBul(data[0]);

  let out = 'DOSYA : ' + anaSS.getName() +
            '\nSAYFA : ' + sh.getName() + '  (' + (data.length - 1) + ' satır)\n\n' +
            'BULUNAN SÜTUNLAR (0 = A sütunu)\n';
  for (const k in C) {
    out += '  ' + k + ': ' + (C[k] === -1 ? '❌ yok' : C[k] + ' → "' + data[0][C[k]] + '"') + '\n';
  }

  out += '\nSON 8 SATIR:\n';
  for (let i = Math.max(1, data.length - 8); i < data.length; i++) {
    const r = data[i];
    const d = parseDateObject(r[C.tarih]);
    const fiyatlar = boruAyir(r[C.fiyatlar]).map(sayiyaCevir);
    const adetler  = boruAyir(r[C.adetler]).map(sayiyaCevir);
    let teorik = 0;
    for (let u = 0; u < fiyatlar.length; u++) teorik += fiyatlar[u] * (adetler[u] > 0 ? adetler[u] : 1);
    const odenen = sayiyaCevir(r[C.tutar]);
    out += '\n#' + i +
           '\n  tarih   : "' + r[C.tarih] + '" → ' + (d ? formatDateISO(d) : '❌ OKUNAMADI') +
           '\n  kanal   : "' + r[C.kanal] + '"   durum: "' + (C.durum > -1 ? r[C.durum] : '-') + '"' +
           '\n  ürünler : "' + r[C.urunler] + '"' +
           '\n  adetler : "' + r[C.adetler] + '"' +
           '\n  fiyatlar: "' + r[C.fiyatlar] + '"' +
           '\n  teorik  : ' + teorik + '  | ödenen: ' + odenen + '  | fark: ' + (teorik - odenen) + '\n';
  }

  Logger.log(out);
  try {
    SpreadsheetApp.getUi().showModalDialog(
      HtmlService.createHtmlOutput('<pre style="font:12px/1.4 monospace;white-space:pre-wrap">' +
        out.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>').setWidth(720).setHeight(540),
      'Teşhis'
    );
  } catch (e) { /* tetikleyici ortamı */ }
}