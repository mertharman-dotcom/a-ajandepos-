// ============================================================
// BAP — ALIŞ MOTORU v2  (Fatura_Kalemleri → Sube_Stok + Stok_Hareketleri)
// Bu dosya STOK TAKİP dosyasının Apps Script projesine yapıştırılır
// (SHEET_ID sabiti ana script'te zaten tanımlı, o kullanılır).
// Eski "alisIsle" fonksiyonunu ve alisTetikleyiciKur'u SİL, bunu koy.
//
// v1'e göre farklar:
//  1. ŞUBE ÇÖZÜMÜ: faturada şube boşsa sırayla dener:
//       a) Fatura_Eslestirme'deki Sube kolonu (o kaleme özel)
//       b) Tedarikçi Sevkiyat günleri → tedarikçi tek şubeye mi bağlı
//       c) Siparis_Kayitlari → aynı tedarikçiden, fatura tarihine yakın
//          (-7/+2 gün) sipariş tek bir şubeden mi verilmiş
//       d) VARSAYILAN_SUBE (boş bırakırsan SUBE_YOK olur, kalem bekler)
//     Bulunan şube Fatura_Kalemleri'ne geri yazılır (elle düzeltilebilir).
//  2. BİRİM: HM stoğu ÖLÇÜ BİRİMİNDE (kg/lt/adet, Tbl_Hammaddeler I sütunu) tutulur.
//     Alış = fatura adedi × (Koli ise Koli_Icerik) × paket içeriği (H).
//       2 koli mozzarella (Koli · 12 Kg) → +24 kg ; 2 teneke zeytinyağı (5 lt) → +10 lt
//     Log'da Karşılığı = yeni stoğun kaç paket/teneke/koli ettiği.
//     (Bu değişiklik ana script yaması + stokBirimineGec() ile birlikte geçerli!)
//  3. DS (Direktsatisurunler) ve AMB (Ambalaj_Kurallari / Merkez) da eşleşir.
//  4. Sube_Stok'ta satır yoksa açılır (SUBE_STOK_YOK kalktı).
//  5. Tbl_Hammaddeler "Son Alış Fiyatı" güncellenir (stok birimi başına).
//  6. Eşleşmeyen kalemler Fatura_Eslestirme'ye tedarikçisiyle eklenir,
//     ayrıca "Alis_Bekleyenler" sekmesinde sebebiyle listelenir.
// ============================================================
var SHEET_ID = '1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE';   // BAP Stok Takip
var FATURA_SS_ID   = '1JJ6UZzh8rSX1FE9Cr-UPzEAaE-2aKtM10bEvjAv2P5w'; // Kolaybi Fatura Ham Veri
var KALEM_SEKME    = 'Fatura_Kalemleri';
var HAREKET_SEKME  = 'Stok_Hareketleri';
var SUBESTOK_SEKME = 'Sube_Stok';
var ESLESME_SEKME  = 'Fatura_Eslestirme';
var BEKLEYEN_SEKME = 'Alis_Bekleyenler';
var AMB_SUBE_ADI   = 'Merkez';        // satış motoruyla aynı olmalı
var VARSAYILAN_SUBE = '';             // örn 'Erenköy' — boşsa çözülemeyen kalem bekler
var USTE_YAZ       = false;           // false = kronolojik ekle (diğer hareketler gibi)
var SIPARIS_GERI_GUN = 7, SIPARIS_ILERI_GUN = 2;

// Fatura_Kalemleri sütunları (kalemleriAyir yazıyor, 0-bazlı)
var FK_NO=0, FK_TARIH=1, FK_TED=2, FK_URUN=3, FK_ADET=4, FK_FIYAT=5, FK_SUBE=8, FK_ISLENDI=10, FK_SEBEP=11, FK_SIPARIS=12;

function alisIsle() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { Logger.log('alisIsle: başka çalışma sürüyor'); return; }
  try { return alisIsle_(); } finally { lock.releaseLock(); }
}

function alisIsle_() {
  var fss = SpreadsheetApp.openById(FATURA_SS_ID);
  var kal = fss.getSheetByName(KALEM_SEKME);
  if (!kal) throw new Error(KALEM_SEKME + ' bulunamadı');
  var sss = SpreadsheetApp.openById(SHEET_ID);
  var har = sss.getSheetByName(HAREKET_SEKME) || hareketSekmesiAc_(sss);
  var sst = sss.getSheetByName(SUBESTOK_SEKME);
  var esl = eslesmeSekmesi_(sss);
  basliklariTamamla_(kal);

  var esMap   = eslesmeHaritasi_(esl);
  var hmMap   = hammaddeHaritasi_(sss);      // fatura adı == Tbl_Hammaddeler B (tam ad)
  var dsMap   = direktSatisHaritasi_(sss);   // fatura adı == Direktsatisurunler B (Urun_adi)
  var ambMap  = ambalajHaritasi_(sss);       // fatura adı == Ambalaj_Kurallari Sarf_Malzeme
  var tedBilgi = tedarikciHaritasi_(sss);    // ünvan → {kisa, sube}
  var sipIdx  = siparisIndeksi_(sss);        // kisa ted → [{tarih, sube}]
  var stMap   = subeStokHaritasi_(sst);

  var kRows = kal.getDataRange().getValues();
  var hareketler = [], sonuc = [], sebepler = [], subeYaz = [], sipYaz = [], bekleyen = [], eksikAd = {};
  var sayac = { ok:0, atla:0, eslesmeYok:0, subeYok:0, zatenIslendi:0 };
  var simdi = new Date();

  for (var r = 1; r < kRows.length; r++) {
    var K = kRows[r];
    var durum = String(K[FK_ISLENDI] || '').trim();
    var eskiSube = String(K[FK_SUBE] || '').trim();
    if (durum === 'EVET' || durum === 'ATLANDI') { sonuc.push([durum]); sebepler.push([K[FK_SEBEP] || '']); subeYaz.push([eskiSube]); sipYaz.push(['']); sayac.zatenIslendi++; continue; }

    var fno = K[FK_NO], tarih = tarihCoz_(K[FK_TARIH]), unvan = String(K[FK_TED] || '').trim();
    var hareketTarihi = (K[FK_TARIH] instanceof Date) ? K[FK_TARIH] : (tarih || simdi);   // faturanın tarihi, işleme saati değil
    var urun = String(K[FK_URUN] || '').trim(), adet = num_(K[FK_ADET]), fiyat = num_(K[FK_FIYAT]);
    if (!urun || !adet) { sonuc.push(['']); sebepler.push(['adet/urun bos']); subeYaz.push([eskiSube]); sipYaz.push(['']); continue; }

    var ted = tedBilgi[norm_(unvan)] || { kisa: unvan, sube: '' };

    // ---- eşleşme: önce elle tablo, sonra HM, DS, AMB
    var es = esMap[norm_(urun)] || null;
    if (es && es.not === 'YOK SAY') { sonuc.push(['ATLANDI']); sebepler.push(['Not: YOK SAY']); subeYaz.push([eskiSube]); sipYaz.push(['']); sayac.atla++; continue; }
    if (es && (!es.hedef || !es.carpan)) es = null;      // satır var ama doldurulmamış
    if (!es) es = hmMap[norm_(urun)] || dsMap[norm_(urun)] || ambMap[norm_(urun)] || null;
    if (es && es.icerik === undefined) { var hmH = hmMap[norm_(es.hedef)]; es.icerik = hmH ? hmH.icerik : 1; es.olcu = hmH ? hmH.olcu : ''; es.paketAdi = hmH ? hmH.paketAdi : 'paket'; if (!es.birim) es.birim = hmH ? hmH.birim : 'adet'; }
    if (!es) {
      eksikAd[urun] = ted.kisa;
      sonuc.push(['ESLESME_YOK']); sebepler.push(['Fatura_Eslestirme\'ye ekle: hedef + carpan']); subeYaz.push([eskiSube]); sipYaz.push(['']);
      bekleyen.push([fno, K[FK_TARIH], ted.kisa, urun, adet, 'ESLESME_YOK', 'Fatura_Eslestirme satırını doldur']);
      sayac.eslesmeYok++; continue;
    }

    // ---- şube çözümü
    var sube = '', kaynak = '';
    if (es.tip === 'AMB') { sube = AMB_SUBE_ADI; kaynak = 'ambalaj'; }
    else if (eskiSube) { sube = eskiSube; kaynak = 'faturada'; }
    else if (es.sube) { sube = es.sube; kaynak = 'eslestirme'; }
    else if (ted.sube && norm_(ted.sube) !== 'hepsi') { sube = ted.sube; kaynak = 'tedarikci'; }
    else {
      var tahmin = siparistenSube_(sipIdx[norm_(ted.kisa)] || [], tarih, urun);
      if (tahmin.sube) { sube = tahmin.sube; kaynak = 'siparis'; }
      else if (tahmin.belirsiz) { kaynak = 'SUBE_BELIRSIZ'; }
      else if (VARSAYILAN_SUBE) { sube = VARSAYILAN_SUBE; kaynak = 'varsayilan'; }
    }
    if (!sube) {
      var kod = kaynak === 'SUBE_BELIRSIZ' ? 'SUBE_BELIRSIZ' : 'SUBE_YOK';
      sonuc.push([kod]); sebepler.push(['Fatura_Kalemleri Şube kolonunu elle doldur']); subeYaz.push(['']); sipYaz.push(['']);
      bekleyen.push([fno, K[FK_TARIH], ted.kisa, urun, adet, kod, kod === 'SUBE_BELIRSIZ' ? 'Aynı günlerde iki şubeden sipariş var' : 'Şube bulunamadı']);
      sayac.subeYok++; continue;
    }

    // ---- stoğa işle
    var tip = es.tip || 'HM';
    var miktar = Math.round(adet * es.carpan * 1000) / 1000;
    var st = stokSatiri_(sst, stMap, es.hedef, tip, sube, simdi);
    var eski = st.mevcut, yeni = Math.round((eski + miktar) * 1000) / 1000;
    st.mevcut = yeni; st.teorik = Math.round((st.teorik + miktar) * 1000) / 1000;
    sst.getRange(st.row, 4).setValue(st.mevcut);
    sst.getRange(st.row, 5).setValue(st.teorik);
    sst.getRange(st.row, 9).setValue(simdi);

    // Karşılığı: diğer hareketlerle aynı mantık — YENİ stoğun kaç paket/teneke ettiği (35.5 kg → 2.96 koli)
    var karsilik = '';
    if (es.tip === 'HM' && es.icerik > 1) karsilik = (Math.round(yeni / es.icerik * 100) / 100) + ' ' + (es.paketAdi || 'paket');
    var girisAcik = '+' + miktar + ' ' + (es.birim || 'adet');
    if (es.tip === 'HM' && es.icerik > 1) girisAcik += ' (' + adet + ' ' + (es.paketAdi || 'paket') + (es.carpan / es.icerik > 1 ? ' × ' + (es.carpan / es.icerik) : '') + ')';
    var sipIdler = eslesenSiparisler_(sipIdx[norm_(ted.kisa)] || [], tarih, urun);
    hareketler.push([hareketTarihi, sube, es.hedef, 'Alis', eski, yeni, es.birim || 'adet', karsilik,
      adet + ' x ' + urun + ' → ' + girisAcik + ' · Fatura ' + fno + ' · ' + ted.kisa + ' · ' + fmtTarih_(tarih) +
      (sipIdler.length ? ' · Sipariş ' + sipIdler.join(', ') : ' · sipariş eşleşmedi') + ' · şube:' + kaynak,
      'Otomatik (fatura)']);
    sipYaz.push([sipIdler.join(', ')]);

    sonuc.push(['EVET']); sebepler.push(['şube:' + kaynak]); subeYaz.push([sube]); sayac.ok++;
  }

  // ---- yazımlar
  if (hareketler.length) {
    if (USTE_YAZ) { har.insertRowsBefore(2, hareketler.length); har.getRange(2, 1, hareketler.length, 10).setValues(hareketler); }
    else har.getRange(har.getLastRow() + 1, 1, hareketler.length, 10).setValues(hareketler);
  }
  if (sonuc.length) {
    kal.getRange(2, FK_ISLENDI + 1, sonuc.length, 1).setValues(sonuc);
    kal.getRange(2, FK_SEBEP + 1, sebepler.length, 1).setValues(sebepler);
    kal.getRange(2, FK_SUBE + 1, subeYaz.length, 1).setValues(subeYaz);
    kal.getRange(2, FK_SIPARIS + 1, sipYaz.length, 1).setValues(sipYaz);
  }
  // Son alış fiyatları: stoğa işlensin işlenmesin, TÜM kalemlerden en güncel fiyat
  try { sayac.fiyat = sonAlisFiyatDoldur_(sss, kRows, esMap, hmMap, dsMap, ambMap); } catch (e) { Logger.log('fiyat: ' + e); }

  var eklenecek = [];
  Object.keys(eksikAd).forEach(function (ad) {
    if (esMap[norm_(ad)]) return;
    eklenecek.push([ad, '', '', '', eksikAd[ad], '', '']);
    esMap[norm_(ad)] = { hedef: '', carpan: 0 };
  });
  if (eklenecek.length) esl.getRange(esl.getLastRow() + 1, 1, eklenecek.length, 7).setValues(eklenecek);

  bekleyenYaz_(sss, bekleyen);
  Logger.log(JSON.stringify(sayac));
  return sayac;
}

// ============================================================
// HARİTALAR
// ============================================================
function eslesmeHaritasi_(esl) {
  // Fatura_Urun_Adi | Stok_Urun_Adi | Carpan | Not | Tedarikci | Tip (HM/DS/AMB) | Sube
  var rows = esl.getDataRange().getValues(), m = {};
  for (var i = 1; i < rows.length; i++) {
    var k = norm_(rows[i][0]); if (!k) continue;
    m[k] = {
      hedef: String(rows[i][1] || '').trim(),
      carpan: parseFloat(String(rows[i][2]).replace(',', '.')) || 0,
      not: String(rows[i][3] || '').trim().toUpperCase(),
      tip: String(rows[i][5] || 'HM').trim().toUpperCase() || 'HM',
      sube: String(rows[i][6] || '').trim(),
      birim: '',
    };
  }
  return m;
}

// Tbl_Hammaddeler: B tam ad(=fatura adı), F paket durumu, I ölçü birimi, P Koli_Icerik
function hammaddeHaritasi_(ss) {
  var sh = ss.getSheetByName('Tbl_Hammaddeler'), m = {};
  if (!sh) return m;
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var ad = String(rows[i][1] || '').trim(); if (!ad) continue;
    var paketAdi = norm_(rows[i][5]);
    var koliMi = paketAdi.indexOf('koli') === 0;
    var koli = num_(rows[i][15]) || 1;
    var icerik = num_(rows[i][7]) || 1;
    var olcu = String(rows[i][8] || '').trim();
    m[norm_(ad)] = { hedef: ad, carpan: (koliMi ? koli : 1) * icerik, tip: 'HM', sube: '', birim: olcu || 'adet',
      icerik: icerik, olcu: olcu, paketAdi: paketAdi && paketAdi !== 'kg.' && paketAdi !== 'kg' ? paketAdi : 'paket',
      fiyatSh: sh, fiyatRow: i + 1, fiyatBolen: (koliMi ? koli : 1) };   // fiyat: PAKET başına
  }
  return m;
}

// Direktsatisurunler: B Urun_adi (=fatura adı), C Hammadde_Adi (panelde görünen), F paket durumu, P Koli_Icerik
function direktSatisHaritasi_(ss) {
  var sh = ss.getSheetByName('Direktsatisurunler'), m = {};
  if (!sh) return m;
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var tam = String(rows[i][1] || '').trim(), kisa = String(rows[i][2] || '').trim();
    var gorunen = kisa || tam; if (!gorunen) continue;
    var koliMi = norm_(rows[i][5]).indexOf('koli') === 0;
    var koli = num_(rows[i][15]) || 1;
    var e = { hedef: gorunen, carpan: koliMi ? koli : 1, tip: 'DS', sube: '', birim: 'adet', fiyatSh: sh, fiyatRow: i + 1, fiyatBolen: koliMi ? koli : 1 };   // fiyat: ADET başına
    if (tam) m[norm_(tam)] = e;
    if (kisa) m[norm_(kisa)] = e;
  }
  return m;
}

// Ambalaj: (a) Ambalaj_Kurallari C Sarf_Malzeme, (b) başlığı Hammadde_ID/Hammadde_Adı olan ama Tbl_Hammaddeler
// OLMAYAN sekmeler (ambalaj/sarf tablosu). Hepsi Merkez / AMB, carpan 1 (koli için Fatura_Eslestirme'ye yaz)
function ambalajHaritasi_(ss) {
  var m = {};
  var sh = ss.getSheetByName('Ambalaj_Kurallari');
  if (sh) {
    var rows = sh.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var ad = String(rows[i][2] || '').trim(); if (!ad) continue;
      m[norm_(ad)] = { hedef: ad, carpan: 1, tip: 'AMB', sube: AMB_SUBE_ADI, birim: 'adet' };
    }
  }
  ss.getSheets().forEach(function (s2) {
    if (s2.getName() === 'Tbl_Hammaddeler' || s2.getName() === 'Direktsatisurunler' || s2.getLastRow() < 2) return;
    var b = s2.getRange(1, 1, 1, Math.min(2, s2.getLastColumn())).getValues()[0];
    if (norm_(b[0]) !== 'hammadde_id' || norm_(b[1]).indexOf('hammadde_ad') !== 0) return;
    var v = s2.getDataRange().getValues();
    for (var r = 1; r < v.length; r++) {
      var ad2 = String(v[r][1] || '').trim(); if (!ad2 || m[norm_(ad2)]) continue;
      m[norm_(ad2)] = { hedef: ad2, carpan: 1, tip: 'AMB', sube: AMB_SUBE_ADI, birim: 'adet', fiyatSh: s2, fiyatRow: r + 1, fiyatBolen: 1 };
    }
  });
  return m;
}

// ── SON ALIŞ FİYATI (J) — tek yazan bu kod (S6, M3, M4, M11, M18) ──
// Kural: J = faturadaki birim fiyat × H ÷ çarpan
//   çarpan = faturadaki 1 birim kaç stok birimi (I) eder (Fatura_Eslestirme C; eşleştirme yoksa koli × H)
//   ör. rende mozzarella koli 4.380 TL, koli = 12 kg (çarpan 12), H = 2 kg → J = 4.380 × 2 ÷ 12 = 730
// Fatura_Eslestirme hedefi tam ad (B) ya da kısa ad (C) olabilir; kısa ad birden çok satırdaysa her satır kendi H'siyle yazılır.
// Mevcut J'nin yarısından az ya da iki katından fazla tutan değişiklik ŞÜPHELİ sayılır, yazılmaz:
// 'Fiyat_Kontrol' sekmesinde Onay sütununa EVET yazılıp fiyatOnaylariniUygula() çalıştırılınca yazılır.
// FIYAT_KURU = true iken hiçbir J yazılmaz, yalnız rapor çıkar.
var FIYAT_KURU = true;
var FIYAT_SUPHE_KAT = 2;
var FIYAT_RAPOR = 'Fiyat_Kontrol';

function sonAlisFiyatDoldur_(ss, kRows, esMap, hmMap, dsMap, ambMap) {
  var kisaMap = hmKisaHaritasi_(ss);
  var son = {};   // hedef satır → en son fatura fiyatı
  for (var r = 1; r < kRows.length; r++) {
    var K = kRows[r];
    var urun = String(K[FK_URUN] || '').trim(), fiyat = num_(K[FK_FIYAT]);
    if (!urun || !(fiyat > 0)) continue;
    var es = esMap[norm_(urun)];
    if (es && (es.not === 'YOK SAY' || !es.hedef)) es = null;
    var hedefler, carpan = 0, kaynak;
    if (es) {
      var h1 = hmMap[norm_(es.hedef)] || dsMap[norm_(es.hedef)] || ambMap[norm_(es.hedef)];
      hedefler = h1 ? [h1] : (kisaMap[norm_(es.hedef)] || []);
      carpan = es.carpan; kaynak = 'eşleştirme';
    } else {
      var h2 = hmMap[norm_(urun)] || dsMap[norm_(urun)] || ambMap[norm_(urun)];
      hedefler = h2 ? [h2] : [];
      kaynak = 'aynı ad';
    }
    var t = tarihCoz_(K[FK_TARIH]) || new Date(0);
    hedefler.forEach(function (h) {
      if (!h.fiyatSh) return;
      var H = h.tip === 'HM' ? (h.icerik || 1) : 1;
      var c = carpan || (h.tip === 'HM' ? h.carpan : (h.fiyatBolen || 1));   // eşleştirmesiz: koli × H (HM) / koli (DS)
      var key = h.fiyatSh.getSheetId() + '|' + h.fiyatRow;
      if (son[key] && t < son[key].tarih) return;
      son[key] = { h: h, tarih: t, faturaAdi: urun, ted: String(K[FK_TED] || ''), fiyat: fiyat, carpan: c, H: H,
        kaynak: kaynak + (hedefler.length > 1 ? ' (kısa ad, ' + hedefler.length + ' satır)' : ''),
        yeni: c > 0 ? Math.round(fiyat * H / c * 100) / 100 : 0 };
    });
  }

  var rapor = [['Tablo', 'Satir', 'Urun', 'Olcu', 'H', 'Fatura_Adi', 'Tedarikci', 'Fatura_Tarihi', 'Fatura_Fiyati', 'Carpan',
                'Mevcut_J', 'Yeni_J', 'Degisim_%', 'Kaynak', 'Durum', 'Onay']];
  var n = 0, supheli = 0;
  Object.keys(son).forEach(function (k) {
    var f = son[k], h = f.h;
    var mevcut = num_(h.fiyatSh.getRange(h.fiyatRow, 10).getValue());
    var durum;
    if (!(f.yeni > 0)) durum = 'ÇARPAN YOK';
    else if (Math.abs(mevcut - f.yeni) < 0.005) durum = 'aynı';
    else if (mevcut > 0 && (f.yeni > mevcut * FIYAT_SUPHE_KAT || f.yeni < mevcut / FIYAT_SUPHE_KAT)) { durum = 'ŞÜPHELİ'; supheli++; }
    else if (FIYAT_KURU) durum = 'yazılacak';
    else { h.fiyatSh.getRange(h.fiyatRow, 10).setValue(f.yeni); durum = 'yazıldı'; n++; }
    if (durum === 'aynı') return;
    rapor.push([h.fiyatSh.getName(), h.fiyatRow, h.hedef, h.olcu || h.birim || '', f.H, f.faturaAdi, f.ted, fmtTarih_(f.tarih),
      f.fiyat, f.carpan, mevcut, f.yeni, mevcut > 0 ? Math.round((f.yeni / mevcut - 1) * 1000) / 10 : '', f.kaynak, durum, '']);
  });
  var sh = ss.getSheetByName(FIYAT_RAPOR) || ss.insertSheet(FIYAT_RAPOR);
  sh.clear();
  sh.getRange(1, 1, rapor.length, rapor[0].length).setValues(rapor);
  sh.getRange(1, 1, 1, rapor[0].length).setFontWeight('bold');
  sh.setFrozenRows(1);
  Logger.log('Son alış fiyatı: ' + (FIYAT_KURU ? 'KURU, ' : '') + n + ' yazıldı, ' + supheli + ' şüpheli, ' + (rapor.length - 1) + ' rapor satırı');
  return n;
}

// Tbl_Hammaddeler C (kısa ad) → o kısa adı taşıyan bütün satırlar
function hmKisaHaritasi_(ss) {
  var sh = ss.getSheetByName('Tbl_Hammaddeler'), m = {}, hm = hammaddeHaritasi_(ss);
  if (!sh) return m;
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var kisa = norm_(rows[i][2]), tam = norm_(rows[i][1]);
    if (!kisa || !tam || !hm[tam]) continue;
    (m[kisa] = m[kisa] || []).push(hm[tam]);
  }
  return m;
}

// Fiyat_Kontrol'de Onay = EVET yazılan (şüpheli) satırların Yeni_J'sini yazar. Editörden ya da menüden çalıştırılır.
function fiyatOnaylariniUygula() {
  var ss = SpreadsheetApp.openById(SHEET_ID), sh = ss.getSheetByName(FIYAT_RAPOR);
  if (!sh || sh.getLastRow() < 2) return 0;
  var v = sh.getDataRange().getValues(), b = v[0].map(norm_);
  var cT = b.indexOf('tablo'), cS = b.indexOf('satir'), cU = b.indexOf('urun'), cY = b.indexOf('yeni_j'), cD = b.indexOf('durum'), cO = b.indexOf('onay');
  var n = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][cO]).trim().toUpperCase() !== 'EVET' || String(v[i][cD]).indexOf('yazıldı') === 0) continue;
    var hedef = ss.getSheetByName(String(v[i][cT])), satir = Number(v[i][cS]), yeni = num_(v[i][cY]);
    if (!hedef || !(satir > 1) || !(yeni > 0)) continue;
    if (norm_(hedef.getRange(satir, 2).getValue()) !== norm_(v[i][cU])) { sh.getRange(i + 1, cD + 1).setValue('satır değişmiş, yazılmadı'); continue; }
    hedef.getRange(satir, 10).setValue(yeni);
    sh.getRange(i + 1, cD + 1).setValue('yazıldı (onay)');
    n++;
  }
  try { SpreadsheetApp.getUi().alert('✅ ' + n + ' onaylı fiyat yazıldı.'); } catch (e) {}
  return n;
}

// Menüden/elle tek başına çalıştırmak için
function sonAlisFiyatlariniDoldur() {
  var fss = SpreadsheetApp.openById(FATURA_SS_ID), kal = fss.getSheetByName(KALEM_SEKME);
  var sss = SpreadsheetApp.openById(SHEET_ID);
  var n = sonAlisFiyatDoldur_(sss, kal.getDataRange().getValues(), eslesmeHaritasi_(eslesmeSekmesi_(sss)), hammaddeHaritasi_(sss), direktSatisHaritasi_(sss), ambalajHaritasi_(sss));
  try { SpreadsheetApp.getUi().alert('✅ ' + n + ' ürünün son alış fiyatı güncellendi.'); } catch (e) {}
  return n;
}

// ── V1/V2: stoğa girmeyen fatura kalemleri ──
// alisBekleyenOzeti(): Alis_Bekleyenler'i (her alış çalışmasında yeniden yazılır) özetler → 'Alis_Bekleyen_Ozet'.
//   Son 30 gün ayrı: geleceği düzeltmek için önce bunlar. Hiçbir şey değiştirmez.
// eskiBekleyenleriKapat(): sayımdan ÖNCEKİ bekleyen kalemler artık stoğa işlenmemeli (sayım stoğu zaten sıfırdan kurar).
//   ESKI_KAPAT_SINIR = sayım günü ('gg.aa.yyyy'). KURU = true → yalnız sayar. false → Fatura_Kalemleri'nde Islendi = ATLANDI,
//   Sebep 'sayım öncesi, kapatıldı'. Satır silinmez; ATLANDI'yı boşaltınca kalem yeniden işlenir.
var ESKI_KAPAT_SINIR = '';
var ESKI_KAPAT_KURU = true;

function alisBekleyenOzeti() {
  var ss = SpreadsheetApp.openById(SHEET_ID), sh = ss.getSheetByName(BEKLEYEN_SEKME);
  if (!sh || sh.getLastRow() < 2) return 'Alis_Bekleyenler boş';
  var v = sh.getDataRange().getValues();   // Fatura_No | Tarih | Tedarikci | Urun | Adet | Durum | Ne yapmali
  var sinir = new Date(); sinir.setDate(sinir.getDate() - 30);
  var say = {}, ted = {}, urun = {}, top = { yeni: 0, eski: 0 };
  for (var i = 1; i < v.length; i++) {
    var t = tarihCoz_(v[i][1]), yeni = t && t >= sinir, d = String(v[i][5] || '').trim(), tk = String(v[i][2] || '(boş)');
    var donem = yeni ? 'yeni' : 'eski'; top[donem]++;
    say[d + '|' + donem] = (say[d + '|' + donem] || 0) + 1;
    if (!yeni) continue;
    var kt = d + '|' + tk; ted[kt] = (ted[kt] || 0) + 1;
    if (d === 'ESLESME_YOK') { var ku = tk + '|' + String(v[i][3] || ''); urun[ku] = urun[ku] || { n: 0, adet: 0, son: t }; urun[ku].n++; urun[ku].adet += num_(v[i][4]); if (t > urun[ku].son) urun[ku].son = t; }
  }
  var out = [['STOĞA GİRMEYEN FATURA KALEMLERİ — ' + fmtTarih_(new Date()), '', '', '', ''],
             ['Durum', 'Son 30 gün', '30 günden eski', '', ''],
             ['SUBE_YOK', say['SUBE_YOK|yeni'] || 0, say['SUBE_YOK|eski'] || 0, '', ''],
             ['SUBE_BELIRSIZ', say['SUBE_BELIRSIZ|yeni'] || 0, say['SUBE_BELIRSIZ|eski'] || 0, '', ''],
             ['ESLESME_YOK', say['ESLESME_YOK|yeni'] || 0, say['ESLESME_YOK|eski'] || 0, '', ''],
             ['', '', '', '', ''],
             ['SON 30 GÜN — TEDARİKÇİYE GÖRE', 'Durum', 'Kalem', '', '']];
  Object.keys(ted).sort(function (a, b) { return ted[b] - ted[a]; }).forEach(function (k) { var p = k.split('|'); out.push([p[1], p[0], ted[k], '', '']); });
  out.push(['', '', '', '', '']);
  out.push(['SON 30 GÜN — EŞLEŞMEYEN ÜRÜNLER (Fatura_Eslestirme\'de hedef + çarpan doldurulmalı)', 'Tedarikçi', 'Kaç fatura', 'Toplam adet', 'Son tarih']);
  Object.keys(urun).sort(function (a, b) { return urun[b].n - urun[a].n; }).forEach(function (k) {
    var p = k.split('|'); out.push([p.slice(1).join('|'), p[0], urun[k].n, urun[k].adet, fmtTarih_(urun[k].son)]); });
  var o = ss.getSheetByName('Alis_Bekleyen_Ozet') || ss.insertSheet('Alis_Bekleyen_Ozet');
  o.clear();
  o.getRange(1, 1, out.length, 5).setValues(out);
  [1, 2, 7].forEach(function (r) { o.getRange(r, 1, 1, 5).setFontWeight('bold'); });
  var ozet = 'Son 30 gün ' + top.yeni + ' kalem, daha eski ' + top.eski + ' kalem bekliyor';
  Logger.log(ozet);
  return ozet;
}

function eskiBekleyenleriKapat() {
  var m = String(ESKI_KAPAT_SINIR || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) throw new Error("ESKI_KAPAT_SINIR'a sayım gününü yaz (ör. '15.10.2026')");
  var sinir = new Date(+m[3], +m[2] - 1, +m[1]);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Alış motoru çalışıyor, birazdan tekrar dene');
  try {
    var kal = SpreadsheetApp.openById(FATURA_SS_ID).getSheetByName(KALEM_SEKME);
    var v = kal.getDataRange().getValues(), n = 0, durumlar = {};
    for (var i = 1; i < v.length; i++) {
      var d = String(v[i][FK_ISLENDI] || '').trim();
      if (d !== 'SUBE_YOK' && d !== 'SUBE_BELIRSIZ' && d !== 'ESLESME_YOK') continue;
      var t = tarihCoz_(v[i][FK_TARIH]);
      if (!t || t >= sinir) continue;
      durumlar[d] = (durumlar[d] || 0) + 1; n++;
      if (!ESKI_KAPAT_KURU) {
        kal.getRange(i + 1, FK_ISLENDI + 1).setValue('ATLANDI');
        kal.getRange(i + 1, FK_SEBEP + 1).setValue('sayım öncesi (' + ESKI_KAPAT_SINIR + '), kapatıldı — ' + d);
      }
    }
    var ozet = (ESKI_KAPAT_KURU ? 'KURU: ' : 'Kapatıldı: ') + n + ' kalem (' + JSON.stringify(durumlar) + ') ' + ESKI_KAPAT_SINIR + ' öncesi';
    Logger.log(ozet);
    return ozet;
  } finally { lock.releaseLock(); }
}

// Tedarikçi Sevkiyat günleri: A kısa ad, B ticari ünvan, C şube (Hepsi/Erenköy/Fikirtepe)
function tedarikciHaritasi_(ss) {
  var m = {};
  ss.getSheets().forEach(function (sh) {
    if (sh.getLastRow() < 2) return;
    var v = sh.getRange(1, 1, 1, Math.max(3, sh.getLastColumn())).getValues()[0];
    if (String(v[0]).trim() !== 'Tedarikçi Adı') return;
    var t = sh.getDataRange().getValues();
    for (var r = 1; r < t.length; r++) {
      var kisa = String(t[r][0] || '').trim(), unvan = String(t[r][1] || '').trim(), sube = String(t[r][2] || '').trim();
      if (!kisa) continue;
      var e = { kisa: kisa, sube: sube };
      if (unvan) m[norm_(unvan)] = e;
      m[norm_(kisa)] = e;
    }
  });
  return m;
}

// Siparis_Kayitlari: B tarih, E tedarikçi (kısa), F şube
function siparisIndeksi_(ss) {
  var sh = ss.getSheetByName('Siparis_Kayitlari'), m = {};
  if (!sh) return m;
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var ted = norm_(rows[i][4]), sube = String(rows[i][5] || '').trim(), t = tarihCoz_(rows[i][1]);
    if (!ted || !sube || !t) continue;
    if (norm_(sube) === 'hepsi') continue;                        // P34: 'Hepsi' gerçek bir yer değil, şube sayılmaz
    if (norm_(rows[i][11]) === 'mükerrer') continue;              // P39: çift kayıt
    if (!m[ted]) m[ted] = [];
    m[ted].push({ tarih: t, sube: sube, sipId: String(rows[i][0] || ''), urun: norm_(rows[i][6]) });
  }
  return m;
}
function pencerede_(liste, faturaTarihi) {
  if (!faturaTarihi) return [];
  return liste.filter(function (s) {
    var g = Math.floor((faturaTarihi - s.tarih) / 86400000);   // sipariş kaç gün önce
    return g >= -SIPARIS_ILERI_GUN && g <= SIPARIS_GERI_GUN;
  });
}
// Önce aynı ÜRÜN için verilmiş siparişlere bak, yoksa tedarikçinin o günlerdeki tüm siparişlerine
function siparistenSube_(liste, faturaTarihi, urun) {
  var p = pencerede_(liste, faturaTarihi);
  var ayni = p.filter(function (s) { return s.urun && s.urun === norm_(urun); });
  var aday = ayni.length ? ayni : p;
  var subeler = {};
  aday.forEach(function (s) { subeler[s.sube] = true; });
  var k = Object.keys(subeler);
  if (k.length === 1) return { sube: k[0], belirsiz: false };
  return { sube: '', belirsiz: k.length > 1 };
}
// Kontrol için: bu kaleme denk gelen sipariş satır ID'leri (aynı ürün, tarih penceresinde)
function eslesenSiparisler_(liste, faturaTarihi, urun) {
  var ids = {};
  pencerede_(liste, faturaTarihi).forEach(function (s) { if (s.urun && s.urun === norm_(urun) && s.sipId) ids[s.sipId] = true; });
  return Object.keys(ids);
}

function subeStokHaritasi_(sst) {
  var rows = sst.getDataRange().getValues(), m = {};
  for (var j = 1; j < rows.length; j++) {
    if (!rows[j][0]) continue;
    m[stokKey_(rows[j][0], rows[j][1], rows[j][2])] = { row: j + 1, mevcut: num_(rows[j][3]), teorik: num_(rows[j][4]) };
  }
  return m;
}
function stokSatiri_(sst, stMap, ad, tip, sube, simdi) {
  var k = stokKey_(ad, tip, sube);
  if (stMap[k]) return stMap[k];
  sst.appendRow([ad, tip, sube, 0, 0, '', '', 0, simdi]);
  stMap[k] = { row: sst.getLastRow(), mevcut: 0, teorik: 0 };
  return stMap[k];
}
function stokKey_(ad, tip, sube) { return norm_(ad) + '|' + String(tip || '').toUpperCase().trim() + '|' + norm_(sube); }

// ============================================================
// SEKMELER
// ============================================================
function eslesmeSekmesi_(ss) {
  var B = ['Fatura_Urun_Adi', 'Stok_Urun_Adi (Sube_Stok\'taki ad)', 'Carpan (1 fatura adedi = kac kg/lt/adet)', 'Not (YOK SAY = stoga isleme)', 'Tedarikci', 'Tip (HM/DS/AMB)', 'Sube (bos = otomatik)'];
  var sh = ss.getSheetByName(ESLESME_SEKME);
  if (!sh) { sh = ss.insertSheet(ESLESME_SEKME); sh.appendRow(B); sh.setFrozenRows(1); sh.setColumnWidth(1, 320); sh.setColumnWidth(2, 260); }
  else if (sh.getLastColumn() < B.length) sh.getRange(1, 1, 1, B.length).setValues([B]);
  return sh;
}
function hareketSekmesiAc_(ss) {
  var sh = ss.insertSheet(HAREKET_SEKME);
  sh.appendRow(['Tarih','Sube','Malzeme','Hareket_Turu','Eski_Stok','Yeni_Stok','Birim','Karsiligi','Detay','Sorumlu']);
  sh.setFrozenRows(1);
  return sh;
}
function basliklariTamamla_(kal) {
  var son = kal.getLastColumn();
  if (son < FK_ISLENDI + 1 || !kal.getRange(1, FK_ISLENDI + 1).getValue()) kal.getRange(1, FK_ISLENDI + 1).setValue('Stoga_Islendi');
  if (son < FK_SEBEP + 1 || !kal.getRange(1, FK_SEBEP + 1).getValue()) kal.getRange(1, FK_SEBEP + 1).setValue('Sebep');
  if (son < FK_SIPARIS + 1 || !kal.getRange(1, FK_SIPARIS + 1).getValue()) kal.getRange(1, FK_SIPARIS + 1).setValue('Siparis_ID');
}
function bekleyenYaz_(ss, rows) {
  var B = ['Fatura_No', 'Tarih', 'Tedarikci', 'Urun', 'Adet', 'Durum', 'Ne yapmali'];
  var sh = ss.getSheetByName(BEKLEYEN_SEKME) || ss.insertSheet(BEKLEYEN_SEKME);
  sh.clear();
  sh.getRange(1, 1, 1, B.length).setValues([B]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, B.length).setValues(rows);
  sh.setFrozenRows(1);
}

// ============================================================
// YARDIMCILAR
// ============================================================
function norm_(s) { return String(s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim(); }
function num_(v) {
  if (typeof v === 'number') return v;
  var s = String(v || '').trim(); if (!s) return 0;
  // "1.100,00" → 1100 ; "1,25" → 1.25 ; "2.5" → 2.5
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s); return isNaN(n) ? 0 : n;
}
function tarihCoz_(d) {
  if (!d) return null;
  if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var s = String(d).trim(), m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  var x = new Date(s); return isNaN(x.getTime()) ? null : new Date(x.getFullYear(), x.getMonth(), x.getDate());
}
function fmtTarih_(t) { return t instanceof Date ? Utilities.formatDate(t, 'Europe/Istanbul', 'dd.MM.yyyy') : String(t || ''); }

function alisTetikleyiciKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'alisIsle') ScriptApp.deleteTrigger(t); });
  // kalemleriAyir (Kolaybi dosyasında) 00:10 ve 14:10'da çalışıyor; bu 20 dk sonra koşar
  ScriptApp.newTrigger('alisIsle').timeBased().atHour(0).nearMinute(30).everyDays(1).create();
  ScriptApp.newTrigger('alisIsle').timeBased().atHour(14).nearMinute(30).everyDays(1).create();
}

// ============================================================
// TEK SEFERLİK YARDIMCILAR
// ============================================================
// Stok_Hareketleri'ne K sütununa "Degisim" (Yeni - Eski, +giriş / -çıkış) formülü koyar.
// Tüm hareket türleri için çalışır (üretim, zayi, satış, alış...). Bir kez çalıştır.
function degisimSutunuEkle() {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(HAREKET_SEKME);
  sh.getRange('K1').setFormula('=ARRAYFORMULA(IF(ROW(F:F)=1;"Degisim";IF(F:F="";"";F:F-E:E)))');
  sh.getRange('K1').setFontWeight('bold');
}
// Daha önce işleme saatiyle yazılmış Alis satırlarının Tarih'ini Detay'daki fatura tarihine çeker.
function alisTarihDuzelt() {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(HAREKET_SEKME);
  var rows = sh.getDataRange().getValues(), n = 0;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][3]).trim() !== 'Alis') continue;
    var m = String(rows[i][8] || '').match(/·\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!m) continue;
    sh.getRange(i + 1, 1).setValue(new Date(+m[3], +m[2] - 1, +m[1]));
    n++;
  }
  Logger.log(n + ' Alis satırının tarihi düzeltildi');
}