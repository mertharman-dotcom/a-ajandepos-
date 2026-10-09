// ============================================================
// BAP STOK TAKİP — Apps Script v3 (ŞUBE BAZLI + TRANSFER + AMBALAJ)
// 14.09.2026: Ambalaj_Hammadde siparis+stok ekranina baglandi,
//             tedarikci eslesmesi nrm() ile normalize edildi.
// Sheets ID: 1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE
// Calisan Mesai ID: 1WBniOC2h9SvD20bHZl3G4o0f4kUmjbXtIrNvYVyV8Hg
// ============================================================

const SHEET_ID = '1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE';
const CALISAN_ID = '1WBniOC2h9SvD20bHZl3G4o0f4kUmjbXtIrNvYVyV8Hg';

const SUBE_STOK_SEKME = 'Sube_Stok';
const SUBELER_SEKME   = 'Subeler';
const TRANSFER_SEKME  = 'Transferler';

// FAZ 0 (08.10.2026) HIZ: dosya bir istekte bir kez açılır (ss_), Sube_Stok bir kez okunur (subeStokVerisi),
// stok hareketleri toplanıp istek sonunda tek seferde yazılır (hareketYaz → hareketlerYaz_), kayıtlar sıraya girer (kilit).
function ss_() {
  if (!ss_._) ss_._ = SpreadsheetApp.openById(SHEET_ID);
  return ss_._;
}

// Az değişen listeler: 10 dakika sunucu önbelleği (her açılışta tabloyu baştan okumaz).
function onbellekli_(anahtar, fn) {
  const c = CacheService.getScriptCache();
  try { const v = c.get(anahtar); if (v) return JSON.parse(v); } catch (e) {}
  const sonuc = fn();
  try { const m = JSON.stringify(sonuc); if (m.length < 95000) c.put(anahtar, m, 600); } catch (e) {}
  return sonuc;
}

function doOptions(e) {
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  const t0 = Date.now();
  const p = e.parameter || {};
  const action = p.action || '';
  if (action === 'getPerformans') return jsonRes(performansOku_(p.gun));
  try { return doGetIsle_(e); } finally { performansYaz_('G', action, p.sube, Date.now() - t0, 0); }
}

function doGetIsle_(e) {
  const p = e.parameter || {};
  const action = p.action || '';
  const sube = p.sube || '';

  try {
    if (action === 'getSubeler')          return jsonRes(onbellekli_('subeler', getSubeler));
    if (action === 'getYariMamuller')     return jsonRes(onbellekli_('yariMamuller', getYariMamuller));
    if (action === 'getRecete')          return jsonRes(getRecete(p.adi, sube));
    if (action === 'getHammaddeler')      return jsonRes(getHammaddeler(p.sadeceTakip === 'true', sube));
    if (action === 'getCalisanlar')       return jsonRes(getCalisanlar());
    if (action === 'sifreKontrol')        return jsonRes(sifreKontrol(p));
    if (action === 'getStokDurum')        return jsonRes(getStokDurum(sube));
    if (action === 'getDirektSatis')      return jsonRes(getDirektSatisUrunler(sube));
    if (action === 'getZayiDirektSatis')  return jsonRes(getDirektSatisUrunler(sube));
    if (action === 'getAmbalaj')          return jsonRes(getAmbalajUrunler(sube));
    if (action === 'getAmbalajStok')      return jsonRes(getAmbalajUrunler(sube));
    if (action === 'getPlanEkrani')       return jsonRes(getPlanEkrani(sube));
    if (action === 'getSiparisEkrani')    return jsonRes(getSiparisEkrani(sube));
    if (action === 'getYariMamulStok')    return jsonRes(getYariMamulStok(sube));
    if (action === 'getYariMamulRapor')   return jsonRes(getYariMamulRapor(sube));
    if (action === 'getUrunler')          return jsonRes(onbellekli_('urunler', getUrunler));
    if (action === 'getZayiUrunler')      return jsonRes(getZayiUrunler(sube));
    if (action === 'getTransferler')      return jsonRes(getTransferler(sube));
    if (action === 'getAcikSiparisler')   return jsonRes(getAcikSiparisler(sube));
    if (action === 'getTransferUrunler')  return jsonRes(getTransferUrunler(p.hedefSube || '', sube));
    if (action === 'getRecetesiOlmayanlar') return jsonRes(getRecetesiOlmayanlar());
    return jsonRes({ hata: 'Bilinmeyen action: ' + action });
  } catch(err) {
    return jsonRes({ hata: err.toString() });
  }
}

function doPost(e) {
  const t0 = Date.now();
  let action = '', sube = '', ok = 0;
  try { const d = JSON.parse(e.postData.contents); action = d.action || ''; sube = d.sube || ''; } catch (e0) {}
  // Kayıtlar sıraya girer: iki şubeden aynı anda gelen kayıt Sube_Stok'ta birbirinin üstüne yazmaz.
  const kilit = LockService.getScriptLock();
  if (!kilit.tryLock(28000)) {
    performansYaz_('P', action, sube, Date.now() - t0, Date.now() - t0, 'K');
    return jsonRes({ basari: false, hata: 'Sistem meşgul, kayıt YAZILMADI. Birkaç saniye sonra tekrar deneyin.' });
  }
  const bekleme = Date.now() - t0;
  try {
    const sonuc = doPostIsle_(e);
    hareketlerYaz_();
    ok = 1;
    return sonuc;
  } catch (err) {
    try { hareketlerYaz_(); } catch (e2) {}
    return jsonRes({ hata: err.toString() });
  } finally {
    performansYaz_('P', action, sube, Date.now() - t0, bekleme, ok ? '' : 'H');
    kilit.releaseLock();
  }
}

// ÖLÇÜM (08.10.2026): her isteğin sunucudaki süresi. Tabloya değil Script Properties'e yazılır (gün ve tür başına anahtar,
// en çok 200 kayıt). Okuma: ?action=getPerformans&gun=yyyyMMdd. Hata ölçümü asla isteği bozmaz.
function performansYaz_(tur, action, sube, ms, beklemeMs, durum) {
  try {
    const simdi = new Date();
    const anahtar = 'PERF_' + tur + '_' + Utilities.formatDate(simdi, 'Europe/Istanbul', 'yyyyMMdd');
    const props = PropertiesService.getScriptProperties();
    const liste = JSON.parse(props.getProperty(anahtar) || '[]');
    if (liste.length >= 200) return; // tek değer en çok 9 KB
    liste.push([Utilities.formatDate(simdi, 'Europe/Istanbul', 'HHmmss'), tur, String(action).slice(0, 22),
      String(sube || '').slice(0, 1), Math.round(ms), Math.round(beklemeMs), durum || '']);
    props.setProperty(anahtar, JSON.stringify(liste));
  } catch (e) {}
}

function performansOku_(gun) {
  const g = /^\d{8}$/.test(String(gun || '')) ? gun : Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyyMMdd');
  const props = PropertiesService.getScriptProperties();
  const oku = t => JSON.parse(props.getProperty('PERF_' + t + '_' + g) || '[]');
  return { gun: g, alanlar: ['saat', 'tur(G/P)', 'islem', 'sube', 'ms', 'kilitBekleme_ms', 'durum(H=hata,K=kilit)'],
    kayit: oku('P'), okuma: oku('G') };
}

function doPostIsle_(e) {
  {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'uretimKaydet')       return jsonRes(uretimKaydet(data));
    if (data.action === 'tekrarYenile')       return jsonRes(tekrarYenile(data));
    if (data.action === 'stokDuzelt')         return jsonRes(stokDuzelt(data));
    if (data.action === 'zayiKaydet')         return jsonRes(zayiKaydet(data.data || data));
    if (data.action === 'siparisKaydet')      return jsonRes(siparisKaydet(data));
    if (data.action === 'siparisDuzelt')      return jsonRes(siparisDuzelt(data));
    if (data.action === 'siparisWpIsaretle')  return jsonRes(siparisWpIsaretle(data));
    if (data.action === 'malKabul')          return jsonRes(malKabul(data));
    if (data.action === 'sayimKaydet')        return jsonRes(sayimKaydet(data));
    if (data.action === 'sayimTopluKaydet')  return jsonRes(sayimTopluKaydet(data));
    if (data.action === 'transferTalep')      return jsonRes(transferTalep(data));
    if (data.action === 'transferOnayla')     return jsonRes(transferOnayla(data));
    if (data.action === 'transferReddet')     return jsonRes(transferReddet(data));
    if (data.action === 'transferDirektCikis')return jsonRes(transferDirektCikis(data));
    return jsonRes({ hata: 'Bilinmeyen action' });
  }
}

// ============================================================
// ŞUBE STOK ÇEKİRDEĞİ
// ============================================================

function subeStokSheet() {
  const ss = ss_();
  let sh = sekmeBul(ss, SUBE_STOK_SEKME);
  if (!sh) {
    sh = ss.insertSheet(SUBE_STOK_SEKME);
    sh.appendRow(['Urun_Adi','Tip','Sube','Mevcut_Stok','Teorik_Stok','Son_Sayim','Son_Sayim_Tarihi','Fark','Son_Guncelleme']);
    sh.getRange(1,1,1,9).setFontWeight('bold').setBackground('#1a5e20').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

var _stokV = null;
function subeStokVerisi() {
  if (_stokV) return _stokV;
  const sh = subeStokSheet();
  const rows = sh.getDataRange().getValues();
  const idx = {};
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    const k = stokKey(rows[i][0], rows[i][1], rows[i][2]);
    idx[k] = i + 1;
  }
  _stokV = { sh, rows, idx };
  return _stokV;
}

function stokKey(urun, tip, sube) {
  return nrm(urun) + '|' + (tip || '').toString().toUpperCase().trim() + '|' + nrm(sube);
}

function stokSatirBul(urunAdi, tip, sube) {
  const v = subeStokVerisi();
  const k = stokKey(urunAdi, tip, sube);
  if (v.idx[k]) return { sh: v.sh, satir: v.idx[k], rows: v.rows };
  const yeni = [urunAdi, (tip||'').toUpperCase(), sube, 0, 0, '', '', 0, new Date()];
  v.sh.appendRow(yeni);
  const satir = v.sh.getLastRow();
  v.idx[k] = satir; // aynı istekte ikinci kez aranırsa yeni satır bulunur, tekrar eklenmez
  return { sh: v.sh, satir: satir, rows: null };
}

function stokHareket(urunAdi, tip, sube, delta, hareketTuru, detay, sorumlu) {
  if (!sube) return { hata: 'Sube bilgisi yok' };
  const b = stokSatirBul(urunAdi, tip, sube);
  const sh = b.sh, satir = b.satir;

  const eskiler = sh.getRange(satir, 4, 1, 2).getValues()[0];
  const eskiMevcut = Number(eskiler[0]) || 0;
  const eskiTeorik = Number(eskiler[1]) || 0;

  const yeniMevcut = yuvarla(eskiMevcut + delta);
  const yeniTeorik = yuvarla(eskiTeorik + delta);

  sh.getRange(satir, 4, 1, 2).setValues([[yeniMevcut, yeniTeorik]]);
  sh.getRange(satir, 9).setValue(new Date());

  hareketYaz(sube, urunAdi, hareketTuru, eskiMevcut, yeniMevcut, detay, sorumlu, tip);
  return { eski: eskiMevcut, yeni: yeniMevcut, eksikMi: yeniMevcut < 0 };
}

function yuvarla(n) { return Math.round(Number(n) * 1000) / 1000; }

function hareketYaz(sube, malzeme, tur, eski, yeni, detay, sorumlu, tip) {
  const ss = ss_();
  let sh = sekmeBul(ss, 'Stok_Hareketleri');
  if (!sh) {
    sh = ss.insertSheet('Stok_Hareketleri');
    sh.appendRow(['Tarih','Sube','Malzeme','Hareket_Turu','Eski_Stok','Yeni_Stok','Birim','Karsiligi','Detay','Sorumlu']);
    sh.getRange(1,1,1,10).setFontWeight('bold').setBackground('#4a148c').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  const b = birimKarsilik(malzeme, tip, yeni);
  const karsiligi = (tur === 'Zayi') ? '' : b.karsilik;
  _hareketler.push({ sh: sh, satir: [new Date(), sube || '', malzeme, tur, eski, yeni, b.birim, karsiligi, detay || '', sorumlu || ''] });
}

// Toplanan stok hareketlerini tek seferde yazar (doPost sonunda çağrılır).
var _hareketler = [];
function hareketlerYaz_() {
  if (!_hareketler.length) return;
  const sh = _hareketler[0].sh;
  const satirlar = _hareketler.map(h => h.satir);
  _hareketler = [];
  sh.getRange(sh.getLastRow() + 1, 1, satirlar.length, satirlar[0].length).setValues(satirlar);
}

var _ymHarita = null, _hmHarita = null;

function ymBirimHaritasi() {
  if (_ymHarita) return _ymHarita;
  _ymHarita = {};
  getYariMamuller().forEach(y => {
    _ymHarita[nrm(y.adi)] = {
      birim: String(y.ciktiTipi || '').toLowerCase().trim().indexOf('gr') === 0 ? 'gr' : 'adet',
      porsiyonAgir: Number(y.porsiyonAgir) || 0,
      porsiyonAdet: Number(y.birimAgir) || 0,
      takipTipi: y.takipTipi || '',
    };
  });
  return _ymHarita;
}

function hmBirimHaritasi() {
  if (_hmHarita) return _hmHarita;
  _hmHarita = {};
  const ss = ss_();
  const sh = sekmeBul(ss, 'Tbl_Hammaddeler');
  if (!sh) return _hmHarita;
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][1]) continue;
    _hmHarita[nrm(rows[i][1])] = {
      paketIcerik: Number(rows[i][7]) || 1,
      olcuBirimi: rows[i][8] ? rows[i][8].toString().trim() : '',
      koliIcerik: Number(rows[i][15]) || 1,
    };
  }
  return _hmHarita;
}

function birimKarsilik(malzeme, tip, miktar) {
  const m = Number(miktar) || 0;
  const t = (tip || '').toString().toUpperCase();

  if (t === 'YM') {
    const y = ymBirimHaritasi()[nrm(malzeme)];
    if (!y) return { birim: '', karsilik: '' };
    if (y.porsiyonAgir > 0) {
      const p = Math.round((m / y.porsiyonAgir) * 10) / 10;
      return { birim: y.birim, karsilik: p + ' porsiyon' };
    }
    return { birim: y.birim, karsilik: '' };
  }

  if (t === 'HM') {
  const h = hmBirimHaritasi()[nrm(malzeme)];

  if (!h) {
    return { birim: '', karsilik: '' };
  }

  return {
    birim: h.olcuBirimi || 'adet',
    karsilik: ''
  };
}

  return { birim: '', karsilik: '' };
}

function subeStokHaritasi(sube) {
  const v = subeStokVerisi();
  const harita = {};
  const sn = nrm(sube);
  for (let i = 1; i < v.rows.length; i++) {
    const r = v.rows[i];
    if (!r[0]) continue;
    if (sube && nrm(r[2]) !== sn) continue;
    const k = nrm(r[0]) + '|' + (r[1] || '').toString().toUpperCase().trim();
    harita[k] = {
      mevcut: Number(r[3]) || 0,
      teorik: Number(r[4]) || 0,
      sonSayim: Number(r[5]) || 0,
      sonSayimTarih: r[6] ? new Date(r[6]).toLocaleDateString('tr-TR') : '',
      fark: Number(r[7]) || 0,
    };
  }
  return harita;
}

// ============================================================
// ŞUBELER VE ÇALIŞANLAR
// ============================================================

function getSubeler() {
  const ss = ss_();
  let sh = sekmeBul(ss, SUBELER_SEKME);
  if (!sh) {
    sh = ss.insertSheet(SUBELER_SEKME);
    sh.appendRow(['Sube_Adi','Aktif']);
    sh.getRange(1,1,1,2).setFontWeight('bold').setBackground('#1a5e20').setFontColor('#ffffff');
    sh.appendRow(['Erenköy', true]);
    sh.appendRow(['Fikirtepe', true]);
  }
  const rows = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const ad = rows[i][0] ? rows[i][0].toString().trim() : '';
    if (!ad) continue;
    if (rows[i][1] === false) continue;
    result.push(ad);
  }
  return result;
}

function getCalisanlar() {
  try {
    const ss = SpreadsheetApp.openById(CALISAN_ID);
    const sh = sekmeBul(ss, 'Personel');
    if (!sh) return [];
    const rows = sh.getDataRange().getValues();
    const result = [];
    for (let i = 1; i < rows.length; i++) {
      const isim  = rows[i][0] ? rows[i][0].toString().trim() : '';
      const aktif = rows[i][4];
      if (!isim) continue;
      if (aktif === false || aktif === 'YANLIS') continue;
      result.push({ adi: isim, pozisyon: 'Mutfak', aktif: true });
    }
    return result;
  } catch(e) {
    return [];
  }
}

function sifreKontrol(data) {
  const sifre = data.sifre ? data.sifre.toString().trim() : '';
  const adi   = data.adi   ? data.adi.toString().trim()   : '';
  if (!sifre) return { basari: false, hata: 'Sifre bos' };
  try {
    const ss = SpreadsheetApp.openById(CALISAN_ID);
    const sh = sekmeBul(ss, 'Personel');
    if (!sh) return { basari: false, hata: 'Personel sekmesi bulunamadi' };
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const isim   = rows[i][0] ? rows[i][0].toString().trim() : '';
      const aktif  = rows[i][4];
      const sifreH = rows[i][5] ? rows[i][5].toString().trim() : '';
      if (!isim) continue;
      if (isim === adi && sifreH === sifre) {
        if (aktif === false) return { basari: false, hata: 'Hesap aktif degil' };
        return { basari: true, adi: isim };
      }
    }
    return { basari: false, hata: 'Yanlis sifre' };
  } catch(e) {
    return { basari: false, hata: e.toString() };
  }
}

// ============================================================
// TANIM TABLOLARI
// ============================================================

function getYariMamuller() {
  const ss = ss_();
  const sh = sekmeBul(ss, 'Tbl_YariMamul tablosuna Cikti_Tipi');
  if (!sh) return [];
  const rows = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    result.push({
      adi:          rows[i][0].toString().trim(),
      ciktiTipi:    rows[i][1],
      bazMiktar:    Number(rows[i][2]) || 0,
      birimAgir:    Number(rows[i][3]) || 0,
      porsiyonAgir: Number(rows[i][4]) || 0,
      takipTipi:    rows[i][5] || '',
      kategori:     rows[i][6] || '',
    });
  }
  return result;
}

function getYariMamulStok(sube) {
  const tanimlar = getYariMamuller();
  const harita = subeStokHaritasi(sube);
  return tanimlar.map(y => {
    const s = harita[nrm(y.adi) + '|YM'] || { mevcut:0, teorik:0, sonSayim:0, sonSayimTarih:'', fark:0 };
    return {
      adi: y.adi,
      takipTipi: y.takipTipi || (String(y.ciktiTipi||'').toLowerCase().indexOf('gr')===0 ? 'Gram' : 'Adet'),
      kategori: y.kategori,
      ciktiTipi: y.ciktiTipi,
      porsiyonAgir: y.porsiyonAgir,
      porsiyonAdet: y.birimAgir,
      mevcutStok: s.mevcut,
      teorikStok: s.teorik,
      sonSayim: s.sonSayim,
      sonSayimTarih: s.sonSayimTarih || 'Sayım yapılmadı',
      fark: s.fark,
      sube: sube || '',
    };
  });
}

function getYariMamulRapor(sube) {
  const liste = getYariMamulStok(sube);
  const kritik = [], normal = [], farklilar = [];
  liste.forEach(item => {
    if (item.fark !== 0) farklilar.push(item);
    if (item.mevcutStok <= 0) kritik.push(item);
    else normal.push(item);
  });
  return { kritik, normal, farklilar, toplam: liste.length, sube: sube || '' };
}

function getRecete(adi, sube) {
  const ss = ss_();
  const sh = sekmeBul(ss, 'Tbl_YariMamulRecete');
  if (!sh) return { hata: 'Sekme bulunamadi' };
  const rows = sh.getDataRange().getValues();
  const malzemeler = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== adi) continue;
    // F sütunu (Tekrar_Parti): malzeme kaç partide bir yenileniyor (ör. konfi yağı 10).
    // Miktar (C) parti başına ortalama payı tutar; stok ve maliyet bunu kullanır.
    const tekrar = Number(rows[i][5]) || 0;
    malzemeler.push({
      hammadde: rows[i][1], bazMiktar: rows[i][2],
      birim: rows[i][3], aciklama: rows[i][4], kategori: tekrar ? '' : rows[i][5],
      tekrar: tekrar > 1 ? tekrar : 0,
    });
  }
  if (sube) {
    malzemeler.forEach(m => {
      if (m.tekrar) m.tekrarDurum = tekrarDurum_(ss, adi, m.hammadde, sube, m.tekrar);
    });
  }
  const ciktiSh = sekmeBul(ss, 'Tbl_YariMamul tablosuna Cikti_Tipi');
  let cikti = null;
  if (ciktiSh) {
    const cRows = ciktiSh.getDataRange().getValues();
    for (let i = 1; i < cRows.length; i++) {
      if (cRows[i][0] === adi) {
        cikti = {
          ciktiTipi:    cRows[i][1],
          bazMiktar:    Number(cRows[i][2]) || 0,
          birimAgir:    Number(cRows[i][3]) || 0,
          porsiyonAgir: Number(cRows[i][4]) || 0,
          takipTipi:    cRows[i][5] || '',
          kategori:     cRows[i][6] || '',
        };
        break;
      }
    }
  }
  return { adi, malzemeler, cikti };
}

// ============================================================
// TEKRAR KULLANILAN MALZEME (ör. konfi yağı 10 partide bir değişir)
// Tekrar_Kullanim_Log: her yenileme bir satır. Sayaç = son yenilemeden bu yana
// Uretim_Girisleri'ndeki parti (kat) toplamı, şube ve yarı mamul bazında.
// ============================================================
const TEKRAR_LOG_SEKME = 'Tekrar_Kullanim_Log';
const TEKRAR_LOG_BASLIK = ['Zaman', 'Sube', 'Yari_Mamul', 'Malzeme', 'Sebep', 'Calisan'];

function tekrarSonYenileme_(ss, ym, malzeme, sube) {
  const sh = sekmeBul(ss, TEKRAR_LOG_SEKME);
  if (!sh) return null;
  const rows = sh.getDataRange().getValues();
  let son = null;
  for (let i = 1; i < rows.length; i++) {
    if (nrm(rows[i][1]) !== nrm(sube) || nrm(rows[i][2]) !== nrm(ym) || nrm(rows[i][3]) !== nrm(malzeme)) continue;
    const z = rows[i][0] instanceof Date ? rows[i][0] : null;
    if (z && (!son || z > son)) son = z;
  }
  return son;
}

function tekrarDurum_(ss, ym, malzeme, sube, tekrar) {
  const son = tekrarSonYenileme_(ss, ym, malzeme, sube);
  if (!son) return { basladi: false, parti: 0, tekrar, degistir: false, sonYenileme: '' };
  let parti = 0;
  const uSh = sekmeBul(ss, 'Uretim_Girisleri');
  if (uSh) {
    const rows = uSh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const z = rows[i][9];
      if (!(z instanceof Date) || z < son) continue;
      if (nrm(rows[i][1]) !== nrm(sube) || nrm(rows[i][2]) !== nrm(ym)) continue;
      parti += Number(rows[i][3]) || 1;
    }
  }
  return { basladi: true, parti, tekrar, degistir: parti >= tekrar,
    sonYenileme: Utilities.formatDate(son, 'Europe/Istanbul', 'dd.MM.yyyy HH:mm') };
}

function tekrarLogYaz_(ss, sube, ym, malzeme, sebep, calisan) {
  let sh = sekmeBul(ss, TEKRAR_LOG_SEKME);
  if (!sh) {
    sh = ss.insertSheet(TEKRAR_LOG_SEKME);
    sh.appendRow(TEKRAR_LOG_BASLIK);
  }
  sh.appendRow([new Date(), sube, ym, malzeme, sebep || '', calisan || '']);
}

// Panelden "yağı şimdi değiştirdim" (küf, bozulma ya da sayacı ilk kez başlatma).
function tekrarYenile(data) {
  const { yariMamulAdi, malzeme, sube, sebep, calisanAdi } = data;
  if (!sube || !yariMamulAdi || !malzeme) return { basari: false, hata: 'Eksik bilgi' };
  const ss = ss_();
  tekrarLogYaz_(ss, sube, yariMamulAdi, malzeme, sebep || 'Elle', calisanAdi);
  return { basari: true, mesaj: malzeme + ' yenilendi, sayaç sıfırlandı (' + sube + ')' };
}

function getHammaddeler(sadeceTakip, sube) {
  const ss = ss_();
  const sh = sekmeBul(ss, 'Tbl_Hammaddeler');
  if (!sh) return [];
  
  const rows = sh.getDataRange().getValues();
  const stokHarita = sube ? subeStokHaritasi(sube) : {};
  const result = [];

  for (let i = 1; i < rows.length; i++) {
    const tamAd = rows[i][1] ? rows[i][1].toString().trim() : ''; 
    const kisaAd = rows[i][2] ? rows[i][2].toString().trim() : ''; 
    const gorunenAd = kisaAd || tamAd;
    if (!gorunenAd) continue;

    const stokTakip = rows[i][14];
    const takipAktif = (
      stokTakip === true || stokTakip === 'DOGRU' || 
      stokTakip === 'Evet' || stokTakip === 'EVET' || stokTakip === 'TRUE'
    );

    const s = stokHarita[nrm(tamAd) + '|HM'] || { mevcut: 0, teorik: 0, fark: 0, sonSayimTarih: '' };

    result.push({
      id:            rows[i][0] || i,
      adi:           gorunenAd,
      tamAd:         tamAd,
      altAd:         kisaAd,
      tedarikci:     rows[i][3] ? rows[i][3].toString().trim() : '',
      sipAktif:      rows[i][4] === true || rows[i][4] === 'EVET',
      paketDurumu:   rows[i][5] ? rows[i][5].toString().trim() : '',
      kategori:      rows[i][6] ? rows[i][6].toString().trim() : 'Diğer',
      paketIcerik:   Number(rows[i][7]) || 1,
      birim:         rows[i][8] ? rows[i][8].toString().trim() : 'gr',
      sonAlisFiyati: Number(rows[i][9]) || 0,
      minStok:       Number(rows[i][11]) || 0,
      stokTakip:     takipAktif,
      koliMu:        koliMu(rows[i][5]),
      koliIcerik:    Number(rows[i][15]) || 1,
      mevcutStok:    s.mevcut,
      teorikStok:    s.teorik,
      fark:          s.fark,
      sonSayimTarih: s.sonSayimTarih,
      sube:          sube || '',
    });
  }
  return result;
}

function getUrunler() {
  const ss = ss_();
  const sh = sekmeBul(ss, 'Urun_Listesi');
  if (!sh) return [];
  const rows = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const urunAdi = rows[i][0] ? rows[i][0].toString().trim() : '';
    if (!urunAdi) continue;
    result.push({
      adi: urunAdi,
      kategori: rows[i][1] ? rows[i][1].toString().trim() : 'Diğer',
      birim: 'adet',
      not: rows[i][3] ? rows[i][3].toString().trim() : ''
    });
  }
  return result;
}

function stokDusumuHesapla(receteMiktar, receteBirim, stokBirimi, paketIcerik, olcuBirimi) {
  let m = Number(receteMiktar) || 0;
  if (!m) return 0;

  const rb = (receteBirim || '').toString().toLowerCase().replace(/\./g, '').trim();
  const sb = (stokBirimi || '').toString().toLowerCase().replace(/\./g, '').trim();
  const ob = (olcuBirimi || '').toString().toLowerCase().replace(/\./g, '').trim();
  const paket = Number(paketIcerik) || 1;

  // Paket/adet olarak tutulan stok: recete miktarini paket olcusune cevirip paket icerigine bol.
  if (sb === 'adet' || sb === 'paket' || sb === 'koli' || sb === 'teneke' || sb === 'kova') {
    let miktar = m;
    if (rb === 'kg' && (ob === 'gr' || ob === 'gram')) miktar *= 1000;
    else if ((rb === 'gr' || rb === 'gram') && ob === 'kg') miktar /= 1000;
    else if ((rb === 'lt' || rb === 'litre') && ob === 'ml') miktar *= 1000;
    else if (rb === 'ml' && (ob === 'lt' || ob === 'litre')) miktar /= 1000;
    return yuvarla(miktar / paket);
  }

  // Kg stok. Su gibi ml ile recetelenen kalemlerde 1000 ml = 1 kg kabul edilir.
  if (sb === 'kg') {
    if (rb === 'kg') return yuvarla(m);
    if (rb === 'gr' || rb === 'gram') return yuvarla(m / 1000);
    if (rb === 'ml') return yuvarla(m / 1000);
    if (rb === 'lt' || rb === 'litre') return yuvarla(m);
  }

  if (sb === 'gr' || sb === 'gram') {
    if (rb === 'kg') return yuvarla(m * 1000);
    if (rb === 'gr' || rb === 'gram') return yuvarla(m);
    if (rb === 'ml') return yuvarla(m);
    if (rb === 'lt' || rb === 'litre') return yuvarla(m * 1000);
  }

  if (sb === 'lt' || sb === 'litre') {
    if (rb === 'ml') return yuvarla(m / 1000);
    if (rb === 'lt' || rb === 'litre') return yuvarla(m);
  }

  if (sb === 'ml') {
    if (rb === 'lt' || rb === 'litre') return yuvarla(m * 1000);
    if (rb === 'ml') return yuvarla(m);
  }

  return yuvarla(m);
}

function getStokDurum(sube) {
  const hammaddeler = getHammaddeler(false, sube).concat(getDirektSatisUrunler(sube));
  const kritik = hammaddeler.filter(h => h.minStok > 0 && h.mevcutStok <= h.minStok);
  const az     = hammaddeler.filter(h => h.minStok > 0 && h.mevcutStok > h.minStok && h.mevcutStok <= h.minStok * 1.5);
  const normal = hammaddeler.filter(h => h.minStok === 0 || h.mevcutStok > h.minStok * 1.5);
  return { kritik, az, normal, toplamKritik: kritik.length, sube: sube || '' };
}

// ============================================================
// GÜNLÜK PLAN & CANLI HAREKET AKIŞI
// ============================================================

function getPlanEkrani(sube) {
  try {
    const ss = ss_();
    sube = sube ? sube.toString().trim() : '';

    const bugun = new Date();
    const bugunStr = bugun.toLocaleDateString('tr-TR');
    const yarin = new Date();
    yarin.setDate(yarin.getDate() + 1);

    const gunKol = { 1:3, 2:4, 3:5, 4:6, 5:7, 6:8, 0:9 };
    const bugunKol = gunKol[bugun.getDay()];
    const yarinKol = gunKol[yarin.getDay()];
    const gunAdlari = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];

    const tevSh = sekmeBul(ss, 'Tedarikçi Sevkiyat günleri');
    const bugunGelecek = [];
    const bugunGeldi = [];
    const bugunSiparis = [];

    // Bugun mal kabul kontrolu yapilmis tedarikciler (Siparis_Kayitlari · Teslim_Tarihi = bugun)
    const kabulEdilenler = {};
    try {
      const sipSh = sekmeBul(ss, 'Siparis_Kayitlari');
      if (sipSh) {
        const sipRows = sipSh.getDataRange().getValues();
        for (let i = 1; i < sipRows.length; i++) {
          if (!sipRows[i][0]) continue;
          const tTarih = tarihCoz(sipRows[i][13]);
          if (!tTarih || tTarih.toLocaleDateString('tr-TR') !== bugunStr) continue;
          const sipSube = sipRows[i][5] ? sipRows[i][5].toString().trim() : '';
          if (sube && sipSube && nrm(sipSube) !== nrm(sube)) continue;
          const ted = sipRows[i][4] ? sipRows[i][4].toString().trim() : '';
          if (ted) kabulEdilenler[nrm(ted)] = true;
        }
      }
    } catch(e) { Logger.log('kabul kontrolu hatasi: ' + e); }

    if (tevSh) {
      const rows = tevSh.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        const ad = rows[i][0] ? rows[i][0].toString().trim() : '';
        if (!ad) continue;
        const tedSube = rows[i][2] ? rows[i][2].toString().trim() : '';
        const hepsiMi = trKucuk(tedSube).trim() === 'hepsi';
        if (sube && !(hepsiMi || nrm(tedSube) === nrm(sube))) continue;

        const kayit = { adi: ad, sube: tedSube, telefon: telefonDuzenle(rows[i][10]) };
        if (rows[i][bugunKol] === true) {
          if (kabulEdilenler[nrm(ad)]) bugunGeldi.push(kayit);
          else bugunGelecek.push(kayit);
        }
        if (rows[i][yarinKol] === true) bugunSiparis.push(kayit);
      }
    }

    const stok = getStokDurum(sube);
    const kritikHM = (stok.kritik || []).map(h => ({
      adi: h.adi, mevcut: h.mevcutStok, min: h.minStok,
      birim: h.koliMu ? 'adet' : 'adet',
      tedarikci: h.tedarikci || '', kategori: h.kategori || ''
    }));

    const ymler = getYariMamulStok(sube) || [];
    const bitenYM = ymler.filter(y => y.mevcutStok <= 0).map(y => ({
      adi: y.adi, kategori: y.kategori || '', mevcut: y.mevcutStok
    }));

    const bugunHazirliklar = [];
    const uretimSh = sekmeBul(ss, 'Uretim_Girisleri');
    if (uretimSh) {
      const uRows = uretimSh.getDataRange().getValues();
      for (let i = uRows.length - 1; i >= 1; i--) {
        if (!uRows[i][0]) continue;
        const uTarih = tarihCoz(uRows[i][0]);
        const uSube = uRows[i][1] ? uRows[i][1].toString().trim() : '';
        
        if (uTarih && uTarih.toLocaleDateString('tr-TR') === bugunStr && (!sube || nrm(uSube) === nrm(sube))) {
          bugunHazirliklar.push({
            urun: uRows[i][2] || '',
            kat: uRows[i][3] || 1,
            toplam: uRows[i][4] || 0,
            birim: uRows[i][5] || '',
            porsiyon: uRows[i][6] || '',
            calisan: uRows[i][7] || 'Bilinmiyor'
          });
        }
      }
    }

    const bugunZayiler = [];
    const zayiSh = sekmeBul(ss, 'Zayi_Girisleri');
    if (zayiSh) {
      const zRows = zayiSh.getDataRange().getValues();
      for (let i = zRows.length - 1; i >= 1; i--) {
        if (!zRows[i][0]) continue;
        const zTarih = tarihCoz(zRows[i][0]);
        const zSube = zRows[i][1] ? zRows[i][1].toString().trim() : '';

        if (zTarih && zTarih.toLocaleDateString('tr-TR') === bugunStr && (!sube || nrm(zSube) === nrm(sube))) {
          bugunZayiler.push({
            urun: zRows[i][3] || '',
            miktar: zRows[i][4] || 0,
            birim: zRows[i][5] || '',
            sebep: zRows[i][6] || '',
            calisan: zRows[i][9] || 'Bilinmiyor'
          });
        }
      }
    }

    return {
      sube,
      bugun: bugun.toLocaleDateString('tr-TR'),
      bugunGunAdi: gunAdlari[bugun.getDay()],
      yarinGunAdi: gunAdlari[yarin.getDay()],
      bugunGelecek,
      bugunGeldi,
      bugunSiparis,
      kritikHM,
      bitenYM,
      ymToplam: ymler.length,
      bugunHazirliklar,
      bugunZayiler
    };
  } catch(err) {
    return { hata: err.toString(), bugunGelecek:[], bugunGeldi:[], bugunSiparis:[], kritikHM:[], bitenYM:[], ymToplam:0, bugunHazirliklar:[], bugunZayiler:[] };
  }
}

// ============================================================
// SİPARİŞ EKRANI
// ============================================================

function getDirektSatisUrunler(sube) {
  const ss = ss_();
  const sh = sekmeBul(ss, 'Direktsatisurunler');
  if (!sh) return [];
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];

  // Basliklari isimle bul (sutun yeri degisse de calissin)
  const bas = rows[0].map(h => trSade(h));
  const kol = (ad, varsayilan) => {
    const i = bas.indexOf(trSade(ad));
    return i >= 0 ? i : varsayilan;
  };
  const cUrun   = kol('Urun_adi', 1);
  const cKisa   = kol('Hammadde_Adi', 2);
  const cTed    = kol('Tedarikçi', 3);
  const cAktif  = kol('Tedarikçi Sipariş Aktif', 4);
  const cPaket  = kol('Sipariş paket durumu', 5);
  const cKat    = kol('Kategori', 6);
  const cBirim  = kol('Birim', 7);
  const cMin    = kol('Min_Stok_Uyarı', 11);
  const cKoliIc = kol('Koli_Icerik', 15);

  const stokHarita = sube ? subeStokHaritasi(sube) : {};

  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const tamAd  = rows[i][cUrun] ? rows[i][cUrun].toString().trim() : '';
    const kisaAd = rows[i][cKisa] ? rows[i][cKisa].toString().trim() : '';
    const gorunenAd = kisaAd || tamAd;
    if (!gorunenAd) continue;

    const tedarikci = rows[i][cTed] ? rows[i][cTed].toString().trim() : '';
    const aktifH = rows[i][cAktif];
    const s = stokHarita[nrm(gorunenAd) + '|DS'] || { mevcut: 0, teorik: 0, fark: 0, sonSayimTarih: '' };

    result.push({
      adi:         gorunenAd,
      tamAd:       tamAd,
      altAd:       kisaAd,
      tedarikci:   tedarikci,
      sipAktif:    aktifH === false ? false : true,
      paketDurumu: rows[i][cPaket] ? rows[i][cPaket].toString().trim() : '',
      kategori:    rows[i][cKat] ? rows[i][cKat].toString().trim() : 'İçecek',
      birim:       rows[i][cBirim] ? rows[i][cBirim].toString().trim() : '',
      koliMu:      koliMu(rows[i][cPaket]),
      koliIcerik:  Number(rows[i][cKoliIc]) || 1,
      minStok:     Number(rows[i][cMin]) || 0,
      mevcutStok:  s.mevcut,
      teorikStok:  s.teorik,
      fark:        s.fark,
      sonSayimTarih: s.sonSayimTarih,
      sonAlisFiyati: 0,
      direktSatis: true,
      sube:        sube || '',
    });
  }
  return result;
}

function getZayiUrunler(sube) {
  const out = [], seen = {};
  (getUrunler() || []).forEach(u => {
    if (!u || !u.adi) return;
    const k = nrm(u.adi); if (seen[k]) return; seen[k] = true;
    out.push({ adi:u.adi, birim:u.birim || 'adet', kategori:u.kategori || 'Menü Ürünleri', zayiTip:'urun', direktSatis:false });
  });
  (getDirektSatisUrunler(sube) || []).forEach(u => {
    if (!u || !u.adi) return;
    const k = nrm(u.adi); if (seen[k]) return; seen[k] = true;
    out.push({ adi:u.adi, birim:u.birim || 'adet', kategori:u.kategori || 'İçecek / Direkt Satış', zayiTip:'ds', direktSatis:true, koliIcerik:u.koliIcerik || 1 });
  });
  return out;
}

function getSiparisEkrani(secilenSube) {
  try {
    const ss = ss_();
    secilenSube = secilenSube ? secilenSube.toString().trim() : '';

    const yarin = new Date();
    yarin.setDate(yarin.getDate() + 1);
    const yarinGun = yarin.getDay();
    const gunKol = { 1:3, 2:4, 3:5, 4:6, 5:7, 6:8, 0:9 };
    const yarinKol = gunKol[yarinGun];
    const gunAdlari = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];

    const tevSh = sekmeBul(ss, 'Tedarikçi Sevkiyat günleri');
    const tumTedList = [];
    var yarinTedSet = {};

    if (tevSh) {
      const tevRows = tevSh.getDataRange().getValues();
      for (let i = 1; i < tevRows.length; i++) {
        const tedAdi = tevRows[i][0] ? tevRows[i][0].toString().trim() : '';
        if (!tedAdi) continue;
        const ticariUnvan = tevRows[i][1] ? tevRows[i][1].toString().trim() : '';
        const tedSube = tevRows[i][2] ? tevRows[i][2].toString().trim() : '';
        const telefon = telefonDuzenle(tevRows[i][10]);
        const hepsiMi = (tedSube.toLowerCase() === 'hepsi');

        if (secilenSube) {
          const uyar = hepsiMi || (nrm(tedSube) === nrm(secilenSube));
          if (!uyar) continue;
        }

        const geliyorMu = (tevRows[i][yarinKol] === true);
        if (geliyorMu) yarinTedSet[(tedAdi + '|' + tedSube).toLowerCase()] = true;

        const gunler = [];
        for (let g = 3; g <= 9; g++) {
          if (tevRows[i][g] === true) gunler.push(gunAdlari[g === 9 ? 0 : g - 2]);
        }

        tumTedList.push({ adi: tedAdi, ticariUnvan, sube: tedSube, telefon, gunler, yarinGeliyor: geliyorMu });
      }
    }

    const yolda = {};
    try {
      const acik = getAcikSiparisler(secilenSube);
      if (acik && acik.gruplar) {
        acik.gruplar.forEach(grp => {
          grp.kalemler.forEach(k => {
            const key = nrm(k.urunAdi);
            if (!yolda[key]) yolda[key] = { miktar: 0, birim: k.birim, teslim: grp.tahminiTeslim, gecikmeGun: grp.gecikmeGun };
            yolda[key].miktar += k.miktar;
            if (grp.gecikmeGun > yolda[key].gecikmeGun) {
              yolda[key].gecikmeGun = grp.gecikmeGun;
              yolda[key].teslim = grp.tahminiTeslim;
            }
          });
        });
      }
    } catch(e) { Logger.log('yolda hesabi hatasi: ' + e); }

    // ---- v3: tedarikci anahtari nrm() ile normalize + AMBALAJ ucuncu kaynak ----
    const tedHavuz = {};
    const havuzaEkle = function(tedarikci, obj) {
      const k = nrm(tedarikci);
      if (!k) return;
      if (!tedHavuz[k]) tedHavuz[k] = [];
      tedHavuz[k].push(obj);
    };

    // 1) Hammaddeler (Tbl_Hammaddeler)
    getHammaddeler(false, secilenSube).forEach(h => {
      if (!h.tedarikci) return;
      const y = yolda[nrm(h.adi)] || null;
      havuzaEkle(h.tedarikci, {
        adi: h.adi, altAd: h.altAd || '', tamAd: h.tamAd || '', kategori: h.kategori || '', birim: h.birim,
        paketDurumu: h.paketDurumu || '',
        mevcutStok: h.mevcutStok, minStok: h.minStok,
        sonAlisFiyati: h.sonAlisFiyati, sipAktif: h.sipAktif,
        kritik: (h.minStok > 0 && h.mevcutStok <= h.minStok),
        koliMu: h.koliMu, koliIcerik: h.koliIcerik,
        olcuBirim: h.birim, paketIcerik: h.paketIcerik,
        yoldaMiktar: y ? y.miktar : 0,
        yoldaBirim: y ? y.birim : '',
        yoldaTeslim: y ? y.teslim : '',
        yoldaGecikme: y ? y.gecikmeGun : 0,
      });
    });

    // 2) Direkt satis urunleri (icecekler vs.) — DS tipiyle sube stogu takip edilir
    getDirektSatisUrunler(secilenSube).forEach(u => {
      if (!u.tedarikci) return;
      const y = yolda[nrm(u.adi)] || null;
      havuzaEkle(u.tedarikci, {
        adi: u.adi, altAd: u.altAd, tamAd: u.tamAd, kategori: u.kategori, birim: u.birim,
        paketDurumu: u.paketDurumu,
        mevcutStok: u.mevcutStok, minStok: u.minStok,
        sonAlisFiyati: 0, sipAktif: u.sipAktif,
        kritik: (u.minStok > 0 && u.mevcutStok <= u.minStok),
        koliMu: u.koliMu, koliIcerik: u.koliIcerik,
        olcuBirim: u.birim, paketIcerik: 1,
        yoldaMiktar: y ? y.miktar : 0,
        yoldaBirim: y ? y.birim : '',
        yoldaTeslim: y ? y.teslim : '',
        yoldaGecikme: y ? y.gecikmeGun : 0,
      });
    });

    // 3) Ambalaj / temizlik urunleri (Ambalaj_Hammadde) — AMB tipiyle sube stogu
    getAmbalajUrunler(secilenSube).forEach(u => {
      if (!u.tedarikci) return;
      const y = yolda[nrm(u.adi)] || null;
      havuzaEkle(u.tedarikci, {
        adi: u.adi, altAd: u.altAd, tamAd: u.tamAd, kategori: u.kategori, birim: u.birim,
        paketDurumu: u.paketDurumu,
        mevcutStok: u.mevcutStok, minStok: u.minStok,
        sonAlisFiyati: u.sonAlisFiyati, sipAktif: u.sipAktif,
        kritik: (u.minStok > 0 && u.mevcutStok <= u.minStok),
        koliMu: u.koliMu, koliIcerik: u.koliIcerik,
        olcuBirim: u.birim, paketIcerik: u.paketIcerik,
        ambalajMi: true,
        yoldaMiktar: y ? y.miktar : 0,
        yoldaBirim: y ? y.birim : '',
        yoldaTeslim: y ? y.teslim : '',
        yoldaGecikme: y ? y.gecikmeGun : 0,
      });
    });

    // Havuzu chip'teki tedarikci adina gore yeniden anahtarla
    // (hem kisa ad hem tam ticari unvan ile eslesir)
    const tedUrunler = {};
    const kullanilan = {};
    tumTedList.forEach(t => {
      const k1 = nrm(t.adi);
      const k2 = nrm(t.ticariUnvan);
      const parcalar = [];
      if (k1 && tedHavuz[k1]) { parcalar.push(tedHavuz[k1]); kullanilan[k1] = true; }
      if (k2 && k2 !== k1 && tedHavuz[k2]) { parcalar.push(tedHavuz[k2]); kullanilan[k2] = true; }
      const birlesik = [];
      const gorulen = {};
      parcalar.forEach(liste => liste.forEach(u => {
        const uk = nrm(u.adi) + '|' + nrm(u.tamAd);
        if (gorulen[uk]) return;
        gorulen[uk] = true;
        birlesik.push(u);
      }));
      tedUrunler[t.adi] = birlesik;
    });

    // Hicbir tedarikci chip'ine denk gelmeyen urunler (teshis)
    const eslesmeyenTedarikciler = Object.keys(tedHavuz)
      .filter(k => !kullanilan[k])
      .map(k => ({ anahtar: k, urunSayisi: tedHavuz[k].length }));

    return {
      bugun: new Date().toLocaleDateString('tr-TR'),
      yarin: yarin.toLocaleDateString('tr-TR'),
      yarinGunAdi: gunAdlari[yarinGun],
      secilenSube,
      subeler: getSubeler(),
      tedarikciler: tumTedList,
      tedUrunler,
      yarinGelenSayi: Object.keys(yarinTedSet).length,
      eslesmeyenTedarikciler,
    };
  } catch(err) {
    return { hata: err.toString(), tedarikciler: [], tedUrunler: {}, subeler: [] };
  }
}

function siparisSheet() {
  const ss = ss_();
  let sh = sekmeBul(ss, 'Siparis_Kayitlari');
  if (!sh) {
    sh = ss.insertSheet('Siparis_Kayitlari');
    sh.appendRow(['Siparis_ID','Tarih','Saat','Calisan','Tedarikci','Sube','Urun_Adi','Miktar','Birim','Adet_Karsiligi','Tahmini_Teslim','Teslim_Durumu','Teslim_Miktar','Teslim_Tarihi','Teslim_Alan','WP_Gonderildi']);
    sh.getRange(1,1,1,16).setFontWeight('bold').setBackground('#1a5e20').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function tahminiTeslimGunu(tedarikciAdi, sube, baslangic) {
  const ss = ss_();
  const tevSh = sekmeBul(ss, 'Tedarikçi Sevkiyat günleri');
  if (!tevSh) return null;
  const rows = tevSh.getDataRange().getValues();
  const gunKol = { 1:3, 2:4, 3:5, 4:6, 5:7, 6:8, 0:9 };

  const satirlar = [];
  for (let i = 1; i < rows.length; i++) {
    const ad = rows[i][0] ? rows[i][0].toString().trim() : '';
    if (!ad || nrm(ad) !== nrm(tedarikciAdi)) continue;
    const tedSube = rows[i][2] ? rows[i][2].toString().trim() : '';
    const hepsiMi = trKucuk(tedSube).trim() === 'hepsi';
    if (sube && !(hepsiMi || nrm(tedSube) === nrm(sube))) continue;
    satirlar.push(rows[i]);
  }
  if (!satirlar.length) return null;

  for (let g = 1; g <= 7; g++) {
    const d = new Date(baslangic.getTime());
    d.setDate(d.getDate() + g);
    const kol = gunKol[d.getDay()];
    for (let s = 0; s < satirlar.length; s++) {
      if (satirlar[s][kol] === true) return d;
    }
  }
  return null;
}

function siparisKaydet(data) {
  const sh = siparisSheet();
  const { calisanAdi, tedarikci, sube, urunler, wpGonderildi, tarih } = data;
  // 'Hepsi' ya da boş şube yazılırsa sipariş Mal Kabul'de hiçbir şubede görünmez, hep 'Bekliyor' kalır (P53).
  const subeK = trKucuk(sube).trim();
  if (!subeK || subeK === 'hepsi') return { basari: false, hata: 'Şube seçili değil. Çıkış yapıp şubeni seçerek tekrar gir.' };
  const simdi = new Date();
  const saat = simdi.getHours() + ':' + String(simdi.getMinutes()).padStart(2,'0');
  const sipId = 'SP' + Utilities.formatDate(simdi, 'Europe/Istanbul', 'yyMMddHHmmss');

  // Aynı kişi + tedarikçi + şube, aynı ürün ve miktarlar, son 10 dk içinde kaydedilmişse ikinci satır açılmaz (P39).
  // Eski kaydın numarası döner; ekran normal devam eder (WhatsApp açılır).
  const onceki = siparisTekrarBul_(sh, calisanAdi, tedarikci, sube, urunler, simdi);
  if (onceki) {
    return { basari: true, tekrar: true, siparisId: onceki, tahminiTeslim: '',
      mesaj: 'Bu sipariş az önce kaydedilmişti (' + onceki + '), ikinci kez yazılmadı.' };
  }

  const teslimGun = tahminiTeslimGunu(tedarikci, sube, simdi);
  const teslimStr = teslimGun ? Utilities.formatDate(teslimGun, 'Europe/Istanbul', 'dd.MM.yyyy') : '';

  urunler.forEach((u, i) => {
    sh.appendRow([
      sipId + '-' + (i + 1),
      tarih || simdi.toLocaleDateString('tr-TR'),
      saat, calisanAdi, tedarikci, sube || '',
      u.adi, u.miktar, u.birim || '',
      Number(u.adetKarsiligi) || Number(u.miktar) || 0,
      teslimStr, 'Bekliyor', '', '', '',
      wpGonderildi ? 'EVET' : 'HAYIR',
    ]);
  });

  return {
    basari: true, siparisId: sipId, tahminiTeslim: teslimStr,
    mesaj: tedarikci + (sube ? ' (' + sube + ')' : '') + ' siparisi kaydedildi. ' + urunler.length + ' urun.' + (teslimStr ? ' Teslim: ' + teslimStr : '')
  };
}

// 'SP261005151225' → o anın Date'i (sipariş numarası kayıt saatini taşır, İstanbul saati)
function siparisIdZamani_(base) {
  const m = String(base || '').match(/^SP(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  return Utilities.parseDate('20' + m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6], 'Europe/Istanbul', 'yyyy-MM-dd HH:mm:ss');
}

function siparisUrunImzasi_(liste) {
  return liste.map(u => nrm(u.adi) + ':' + (Number(String(u.miktar).replace(',', '.')) || 0)).sort().join('|');
}

function siparisTekrarBul_(sh, calisan, ted, sube, urunler, simdi) {
  const son = sh.getLastRow();
  if (son < 2) return '';
  const bas = Math.max(2, son - 299);
  const rows = sh.getRange(bas, 1, son - bas + 1, 8).getValues();
  const gruplar = {};
  rows.forEach(r => {
    const base = siparisBaseId_(r[0]);
    if (!base) return;
    if (nrm(r[3]) !== nrm(calisan) || nrm(r[4]) !== nrm(ted) || nrm(r[5]) !== nrm(sube)) return;
    (gruplar[base] = gruplar[base] || []).push({ adi: r[6], miktar: r[7] });
  });
  const imza = siparisUrunImzasi_(urunler);
  const bases = Object.keys(gruplar).sort().reverse();
  for (const b of bases) {
    const z = siparisIdZamani_(b);
    if (!z || (simdi - z) > 10 * 60000 || (simdi - z) < 0) continue;
    if (siparisUrunImzasi_(gruplar[b]) === imza) return b;
  }
  return '';
}

function siparisBaseId_(satirId) {
  return String(satirId || '').replace(/-\d+$/, '');
}

function siparisWpIsaretle(data) {
  const sh = siparisSheet();
  const rows = sh.getDataRange().getValues();
  const base = String(data.siparisId || '').trim();
  if (!base) return { basari:false, hata:'Siparis ID eksik' };
  let n=0;
  for (let i=1;i<rows.length;i++) {
    if (siparisBaseId_(rows[i][0]) !== base) continue;
    sh.getRange(i+1,16).setValue('EVET'); n++;
  }
  return { basari:n>0, guncellenen:n };
}

function siparisDuzelt(data) {
  const sh = siparisSheet();
  const rows = sh.getDataRange().getValues();
  const base = String(data.siparisId || '').trim();
  const urunler = data.urunler || [];
  if (!base) return { basari:false, hata:'Siparis ID eksik' };
  if (!urunler.length) return { basari:false, hata:'En az bir urun olmali' };

  const found=[];
  for(let i=1;i<rows.length;i++) if(siparisBaseId_(rows[i][0])===base) found.push(i+1);
  if(!found.length) return { basari:false, hata:'Siparis bulunamadi: '+base };

  for (let j=0;j<found.length;j++) {
    const durum=String(sh.getRange(found[j],12).getValue()||'').trim();
    if (durum && durum!=='Bekliyor') return { basari:false, hata:'Teslim islemi baslamis siparis duzeltilemez' };
  }

  const ilk=found[0];
  const eskiCalisan=String(sh.getRange(ilk,4).getValue()||'').trim();
  const duzelten=String(data.calisanAdi||'').trim();
  const yonetici=nrm(duzelten)==='yonetici';
  if (!yonetici && nrm(eskiCalisan)!==nrm(duzelten)) return { basari:false, hata:'Sadece siparisi olusturan calisan veya Yonetici duzeltebilir' };

  const tarih=sh.getRange(ilk,2).getValue();
  const saat=sh.getRange(ilk,3).getValue();
  const ted=sh.getRange(ilk,5).getValue();
  const sube=sh.getRange(ilk,6).getValue();
  const teslim=sh.getRange(ilk,11).getValue();
  const wp=sh.getRange(ilk,16).getValue();
  const eskiOzet=found.map(r=>sh.getRange(r,7).getValue()+':'+sh.getRange(r,8).getValue()+' '+sh.getRange(r,9).getValue()).join(' | ');

  for(let j=found.length-1;j>=0;j--) sh.deleteRow(found[j]);
  urunler.forEach((u,i)=>sh.appendRow([base+'-'+(i+1),tarih,saat,eskiCalisan,ted,sube,u.adi,u.miktar,u.birim||'',Number(u.adetKarsiligi)||Number(u.miktar)||0,teslim,'Bekliyor','','','',wp]));

  let log=sekmeBul(ss_(),'Siparis_Duzeltme_Log');
  if(!log){ log=ss_().insertSheet('Siparis_Duzeltme_Log'); log.appendRow(['Tarih','Siparis_ID','Sube','Tedarikci','Duzenleyen','Eski','Yeni']); }
  const yeniOzet=urunler.map(u=>u.adi+':'+u.miktar+' '+(u.birim||'')).join(' | ');
  log.appendRow([new Date(),base,sube,ted,duzelten,eskiOzet,yeniOzet]);
  return { basari:true, siparisId:base, mesaj:'Siparis duzeltildi' };
}

// ============================================================
// MAL KABUL & AÇIK SİPARİŞLER
// ============================================================

// ── P39: çift kaydedilmiş siparişler ──
// Editörden çalıştır: ciftSiparisBul()  → KURU = true: hiçbir şey yazmaz, 'Cift_Siparis_Raporu' sekmesine yazar.
// Sahibinin kuralı (09.10): aynı kişi, aynı gün, aynı tedarikçi ve şube, birbirine ≤ 20 dk yakın siparişler hatalıdır.
// Grubun son siparişi kalır (WhatsApp'a gideni varsa o); bütün ürünleri kalan siparişte de olan diğerlerinin
// Teslim_Durumu 'Mükerrer' olur. Kalan siparişte olmayan ürünü olan (sonradan eklenen kalem) dokunulmaz. Satır silinmez.
// Başka kişinin 30 dk içinde aynı tedarikçiye aynı şubeden verdiği sipariş yalnız 'KONTROL' diye yazılır, dokunulmaz.
const CIFT_SIPARIS_KURU = false;   // 09.10 sahip onayı: kuru rapor 11 sipariş / 109 satır
const CIFT_SIPARIS_DK = 20;

function ciftSiparisBul() {
  const KURU = CIFT_SIPARIS_KURU;
  const sh = siparisSheet();
  const rows = sh.getDataRange().getValues();
  const bas = rows[0].map(nrm);
  const kol = (adlar, yedek) => { for (const a of adlar) { const i = bas.indexOf(nrm(a)); if (i >= 0) return i; } return yedek; };
  const cId = kol(['Siparis_ID', 'Sipariş Numarası'], 0), cCal = kol(['Calisan'], 3), cTed = kol(['Tedarikci'], 4);
  const cSube = kol(['Sube'], 5), cUrun = kol(['Urun_Adi'], 6), cMik = kol(['Miktar'], 7);
  const cDurum = kol(['Teslim_Durumu'], 11), cWp = kol(['WP_Gonderildi'], 15);

  // sipariş numarası → bilgi
  const sip = {};
  for (let i = 1; i < rows.length; i++) {
    const b = siparisBaseId_(rows[i][cId]);
    const z = siparisIdZamani_(b);
    if (!b || !z) continue;
    const o = sip[b] || (sip[b] = { base: b, zaman: z, cal: String(rows[i][cCal] || '').trim(), ted: String(rows[i][cTed] || '').trim(),
      sube: String(rows[i][cSube] || '').trim(), satirlar: [], urunler: [], wp: false, durumlar: {} });
    o.satirlar.push(i + 1);
    o.urunler.push({ adi: rows[i][cUrun], miktar: rows[i][cMik] });
    if (String(rows[i][cWp]).trim().toUpperCase() === 'EVET') o.wp = true;
    const d = String(rows[i][cDurum] || '').trim(); o.durumlar[d] = (o.durumlar[d] || 0) + 1;
  }
  const gun = z => Utilities.formatDate(z, 'Europe/Istanbul', 'dd.MM.yyyy');
  const saatS = z => Utilities.formatDate(z, 'Europe/Istanbul', 'HH:mm');

  // aynı gün + tedarikçi + şube grupları, zamana göre sıralı
  const grup = {};
  Object.keys(sip).forEach(b => { const o = sip[b]; const k = gun(o.zaman) + '|' + nrm(o.ted) + '|' + nrm(o.sube); (grup[k] = grup[k] || []).push(o); });

  const rapor = [['Grup', 'Siparis_ID', 'Tarih', 'Saat', 'Calisan', 'Tedarikci', 'Sube', 'Kalem', 'WP', 'Teslim_Durumu', 'Ayni_urunler', 'Karar', 'Islem']];
  let gNo = 0, mukerrerSatir = 0, mukerrerSip = 0;
  Object.keys(grup).forEach(k => {
    const liste = grup[k].sort((a, b) => a.zaman - b.zaman);
    // aynı kişinin ardışık (≤ CIFT_SIPARIS_DK) siparişlerini kümele
    const kumeler = [];
    liste.forEach(o => {
      const kume = kumeler.find(c => nrm(c[c.length - 1].cal) === nrm(o.cal) && (o.zaman - c[c.length - 1].zaman) <= CIFT_SIPARIS_DK * 60000);
      if (kume) kume.push(o); else kumeler.push([o]);
    });
    kumeler.sort((a, b) => b.length - a.length).forEach(c => {
      // başka kişinin 30 dk içindeki siparişi → yalnız bilgi
      const komsu = liste.filter(o => nrm(o.cal) !== nrm(c[0].cal) && c.some(x => Math.abs(o.zaman - x.zaman) <= 30 * 60000));
      if (c.length < 2 && (!komsu.length || c[0]._raporda)) return;
      gNo++;
      let kalan = null;
      if (c.length >= 2) { const wpler = c.filter(o => o.wp); kalan = (wpler.length ? wpler : c)[(wpler.length ? wpler : c).length - 1]; }
      const imzaKalan = kalan ? siparisUrunImzasi_(kalan.urunler) : '';
      const yaz = (o, karar, islem) => {
        o._raporda = true;
        rapor.push([gNo, o.base, gun(o.zaman), saatS(o.zaman), o.cal, o.ted, o.sube, o.urunler.length, o.wp ? 'EVET' : 'HAYIR',
          Object.keys(o.durumlar).map(d => (d || '(boş)') + (o.durumlar[d] > 1 ? ' ×' + o.durumlar[d] : '')).join(', '),
          kalan && o !== kalan ? (siparisUrunImzasi_(o.urunler) === imzaKalan ? 'evet' : 'farklı') : '', karar, islem]);
      };
      const kalanUrun = {}; if (kalan) kalan.urunler.forEach(u => { kalanUrun[nrm(u.adi)] = true; });
      c.forEach(o => {
        if (!kalan || o === kalan) { yaz(o, c.length >= 2 ? 'KALIR' : 'KONTROL', ''); return; }
        // Ürünlerinden biri kalan siparişte yoksa bu bir tamamlama siparişidir (unutulan kalem): dokunulmaz
        if (!o.urunler.every(u => kalanUrun[nrm(u.adi)])) { yaz(o, 'KONTROL (farklı ürün var)', ''); return; }
        if (KURU) { yaz(o, 'MÜKERRER', 'yazılacak'); }
        else {
          o.satirlar.forEach(r => sh.getRange(r, cDurum + 1).setValue('Mükerrer'));
          yaz(o, 'MÜKERRER', 'yazıldı');
        }
        mukerrerSip++; mukerrerSatir += o.satirlar.length;
      });
      komsu.forEach(o => { if (!o._raporda) yaz(o, 'KONTROL (başka kişi)', ''); });
    });
  });

  const ss = ss_();
  let r = sekmeBul(ss, 'Cift_Siparis_Raporu');
  if (!r) r = ss.insertSheet('Cift_Siparis_Raporu'); else r.clear();
  r.getRange(1, 1, rapor.length, rapor[0].length).setValues(rapor);
  r.getRange(1, 1, 1, rapor[0].length).setFontWeight('bold');
  r.setFrozenRows(1);
  const ozet = (KURU ? 'KURU: ' : 'Uygulandı: ') + mukerrerSip + ' sipariş (' + mukerrerSatir + ' satır) mükerrer' + (KURU ? ' olacak' : ' yapıldı') + ', ' + gNo + ' grup';
  Logger.log(ozet);
  return ozet;
}

// ── P53: Sube = 'Hepsi' yazılmış eski sipariş satırlarına gerçek şubeyi önerir / yazar ──
// Editörden çalıştır: hepsiSubeDuzelt()  → KURU = true: hiçbir şey yazmaz, 'Sube_Duzeltme_Raporu' sekmesine öneri yazar.
// Sahibi raporu onaylayınca KURU = false yapılıp tekrar çalıştırılır: yalnız F (Sube) hücresi değişir, satır silinmez.
// Öneri: siparişi veren çalışanın 'Hepsi' olmayan siparişlerinde en çok kullandığı şube (en az %80 ve 3 sipariş).
// Bu koşulu sağlamayanlar 'SOR' olarak kalır, yazılmaz.
const HEPSI_SUBE_KURU = true;

function hepsiSubeDuzelt() {
  const KURU = HEPSI_SUBE_KURU;
  const sh = siparisSheet();
  const rows = sh.getDataRange().getValues();
  const bas = rows[0].map(nrm);
  const kol = (adlar, yedek) => { for (const a of adlar) { const i = bas.indexOf(nrm(a)); if (i >= 0) return i; } return yedek; };
  const cId = kol(['Siparis_ID', 'Sipariş Numarası'], 0), cTarih = kol(['Tarih'], 1), cCal = kol(['Calisan'], 3);
  const cTed = kol(['Tedarikci'], 4), cSube = kol(['Sube'], 5), cDurum = kol(['Teslim_Durumu'], 11);
  const hepsiMi = v => trKucuk(v).trim() === 'hepsi';

  // Çalışan → { şube: sipariş sayısı } (sipariş başına bir kez sayılır)
  const say = {}, gorulen = {};
  for (let i = 1; i < rows.length; i++) {
    const sube = String(rows[i][cSube] || '').trim(), cal = nrm(rows[i][cCal]);
    if (!sube || hepsiMi(sube) || !cal) continue;
    const base = siparisBaseId_(rows[i][cId]);
    if (gorulen[base]) continue; gorulen[base] = true;
    (say[cal] = say[cal] || {})[sube] = (say[cal][sube] || 0) + 1;
  }
  const oneri = cal => {
    const m = say[cal]; if (!m) return { sube: '', neden: 'bu çalışanın şubeli siparişi yok' };
    const top = Object.keys(m).reduce((t, k) => t + m[k], 0);
    const en = Object.keys(m).sort((a, b) => m[b] - m[a])[0];
    const pay = m[en] / top;
    const neden = Object.keys(m).map(k => k + ' ' + m[k]).join(', ');
    return (pay >= 0.8 && m[en] >= 3) ? { sube: en, neden: neden } : { sube: '', neden: neden + ' (net değil)' };
  };

  const rapor = [['Satir', 'Siparis_ID', 'Tarih', 'Calisan', 'Tedarikci', 'Teslim_Durumu', 'Onerilen_Sube', 'Dayanak', 'Islem']];
  let yazilan = 0, sor = 0;
  for (let i = 1; i < rows.length; i++) {
    if (!hepsiMi(rows[i][cSube])) continue;
    const o = oneri(nrm(rows[i][cCal]));
    let islem;
    if (!o.sube) { islem = 'SOR'; sor++; }
    else if (KURU) islem = 'yazılacak';
    else { sh.getRange(i + 1, cSube + 1).setValue(o.sube); islem = 'yazıldı'; yazilan++; }
    const t = rows[i][cTarih];
    rapor.push([i + 1, rows[i][cId], t instanceof Date ? Utilities.formatDate(t, 'Europe/Istanbul', 'dd.MM.yyyy') : t,
      rows[i][cCal], rows[i][cTed], rows[i][cDurum], o.sube || 'SOR', o.neden, islem]);
  }

  const ss = ss_();
  let r = sekmeBul(ss, 'Sube_Duzeltme_Raporu');
  if (!r) r = ss.insertSheet('Sube_Duzeltme_Raporu'); else r.clear();
  r.getRange(1, 1, rapor.length, rapor[0].length).setValues(rapor);
  r.getRange(1, 1, 1, rapor[0].length).setFontWeight('bold');
  r.setFrozenRows(1);
  const ozet = (KURU ? 'KURU çalışma: ' : 'Uygulandı: ') + (rapor.length - 1) + " 'Hepsi' satırı, " +
    (KURU ? (rapor.length - 1 - sor) + ' önerildi' : yazilan + ' yazıldı') + ', ' + sor + ' SOR';
  Logger.log(ozet);
  return ozet;
}

const SIPARIS_ZAMAN_ASIMI_GUN = 7;

function getAcikSiparisler(sube) {
  const sh = siparisSheet();
  const rows = sh.getDataRange().getValues();
  const bugun = new Date(); bugun.setHours(0,0,0,0);
  const gruplar = {};
  let toplamKalem = 0, gecikmis = 0;

  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    const durum = (rows[i][11] || '').toString().trim();
    if (durum && durum !== 'Bekliyor') continue;
    const sipSube = rows[i][5] ? rows[i][5].toString().trim() : '';
    if (sube && nrm(sipSube) !== nrm(sube)) continue;

    const sipTarih = tarihCoz(rows[i][1]);
    if (sipTarih) {
      const yas = Math.floor((bugun - sipTarih) / 86400000);
      if (yas > SIPARIS_ZAMAN_ASIMI_GUN) {
        sh.getRange(i + 1, 12).setValue('Zaman Asimi');
        continue;
      }
    }

    const teslimTarih = tarihCoz(rows[i][10]);
    let gecikmeGun = 0;
    if (teslimTarih) gecikmeGun = Math.floor((bugun - teslimTarih) / 86400000);

    const tedarikci = rows[i][4] ? rows[i][4].toString().trim() : '';
    const key = tedarikci + '|' + (rows[i][10] || '');
    if (!gruplar[key]) {
      gruplar[key] = {
        tedarikci, sube: sipSube,
        tahminiTeslim: rows[i][10] || '',
        siparisTarihi: rows[i][1] || '',
        gecikmeGun: gecikmeGun,
        bugunMu: gecikmeGun === 0,
        kalemler: []
      };
    }
    gruplar[key].kalemler.push({
      satirId: rows[i][0],
      urunAdi: rows[i][6],
      miktar: Number(rows[i][7]) || 0,
      birim: rows[i][8] || '',
      adetKarsiligi: Number(rows[i][9]) || 0,
      calisan: rows[i][3] || '',
    });
    toplamKalem++;
    if (gecikmeGun > 0) gecikmis++;
  }

  const liste = Object.keys(gruplar).map(k => gruplar[k]);
  liste.sort((a, b) => b.gecikmeGun - a.gecikmeGun);
  return { gruplar: liste, toplamKalem, gecikmis, sube: sube || '' };
}

function malKabul(data) {
  const { kalemler, calisanAdi, sube } = data;
  if (!sube) return { basari: false, hata: 'Sube secili degil' };
  if (!kalemler || !kalemler.length) return { basari: false, hata: 'Kalem yok' };

  const sh = siparisSheet();
  const rows = sh.getDataRange().getValues();

  const idx = {};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) idx[rows[i][0].toString()] = i + 1;
  }

  let tam = 0, eksik = 0, gelmedi = 0;
  const eksikListe = [];

  // NOT: Stok islemesi YAPILMAZ. Stok girisleri faturadan gelir.
  // Burasi sadece kontrol amaclidir: siparis geldi mi / eksik mi / gelmedi mi.
  kalemler.forEach(k => {
    const satir = idx[k.satirId];
    if (!satir) return;
    const r = rows[satir - 1];
    if ((r[11] || '').toString().trim() !== 'Bekliyor') return;

    const siparisMiktar = Number(r[7]) || 0;
    const gelen = Number(k.gelenMiktar) || 0;
    const urunAdi = r[6] ? r[6].toString().trim() : '';

    let durum;
    if (gelen <= 0) { durum = 'Gelmedi'; gelmedi++; }
    else if (gelen < siparisMiktar) { durum = 'Eksik'; eksik++; }
    else { durum = 'Tam'; tam++; }

    if (durum !== 'Tam') {
      eksikListe.push(urunAdi + ' (' + gelen + '/' + siparisMiktar + ' ' + (r[8] || '') + ')');
    }

    sh.getRange(satir, 12).setValue(durum);
    sh.getRange(satir, 13).setValue(gelen);
    sh.getRange(satir, 14).setValue(new Date());
    sh.getRange(satir, 15).setValue(calisanAdi || '');
  });

  let mesaj = tam + ' tam';
  if (eksik) mesaj += ', ' + eksik + ' eksik';
  if (gelmedi) mesaj += ', ' + gelmedi + ' gelmedi';
  if (eksik || gelmedi) mesaj += ' — eksik/gelmeyenler icin tekrar siparis vermeyi unutma';
  return { basari: true, tam, eksik, gelmedi, eksikListe, mesaj: 'Kontrol kaydedildi: ' + mesaj };
}

// ============================================================
// TRANSFER BİLEŞENLERİ (EKSİK OLAN FONKSİYONLAR)
// ============================================================

function transferSheet() {
  const ss = ss_();
  let sh = sekmeBul(ss, TRANSFER_SEKME);
  if (!sh) {
    sh = ss.insertSheet(TRANSFER_SEKME);
    sh.appendRow(['Talep_ID','Tarih','Talep_Eden_Sube','Talep_Eden','Veren_Sube','Urun_Adi','Tip','Talep_Miktar','Onay_Miktar','Birim','Durum','Onay_Tarihi','Onaylayan','Not']);
    sh.getRange(1,1,1,14).setFontWeight('bold').setBackground('#2c6e8a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function getTransferUrunler(hedefSube, kendiSube) {
  try {
    const hmHedef = getHammaddeler(false, hedefSube) || [];
    const ymHedef = getYariMamulStok(hedefSube) || [];
    const hmBenim = kendiSube ? subeStokHaritasi(kendiSube) : {};

    const liste = [];
    hmHedef.forEach(h => {
      if (!h || !h.adi) return;
      liste.push({
        adi: h.adi,
        tip: 'HM',
        kategori: h.kategori || 'Diğer',
        birim: 'adet',
        paketIcerik: h.paketIcerik || 1,
        olcuBirimi: h.birim || '',
        karsiStok: Number(h.mevcutStok) || 0,
        benimStok: Number((hmBenim[nrm(h.adi) + '|HM'] || {}).mevcut) || 0,
      });
    });

    ymHedef.forEach(y => {
      if (!y || !y.adi) return;
      const bazBirim = (String(y.ciktiTipi||'').toLowerCase().indexOf('gr')===0) ? 'gr' : 'adet';
      liste.push({
        adi: y.adi,
        tip: 'YM',
        kategori: y.kategori || 'Diğer',
        birim: bazBirim,
        paketIcerik: 1,
        olcuBirimi: bazBirim,
        porsiyonAgir: Number(y.porsiyonAgir) || 0,
        karsiStok: Number(y.mevcutStok) || 0,
        benimStok: Number((hmBenim[nrm(y.adi) + '|YM'] || {}).mevcut) || 0,
      });
    });

    // Direkt satis urunleri (icecekler vs.)
    (getDirektSatisUrunler(hedefSube) || []).forEach(u => {
      if (!u || !u.adi) return;
      liste.push({
        adi: u.adi,
        tip: 'DS',
        kategori: u.kategori || 'İçecek',
        birim: u.birim || 'adet',
        paketIcerik: 1,
        olcuBirimi: u.birim || 'adet',
        koliIcerik: u.koliIcerik || 1,
        karsiStok: Number(u.mevcutStok) || 0,
        benimStok: Number((hmBenim[nrm(u.adi) + '|DS'] || {}).mevcut) || 0,
      });
    });

    return liste;
  } catch(err) {
    Logger.log('getTransferUrunler hatasi: ' + err);
    return [];
  }
}

function transferTalep(data) {
  const { talepEdenSube, verenSube, calisanAdi, urunler, not } = data;
  if (!talepEdenSube || !verenSube) return { basari: false, hata: 'Sube bilgisi eksik' };
  if (!urunler || !urunler.length) return { basari: false, hata: 'Urun secilmedi' };
  if (nrm(talepEdenSube) === nrm(verenSube)) return { basari: false, hata: 'Ayni subeye transfer olmaz' };

  const sh = transferSheet();
  const talepId = 'TR' + Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyMMddHHmmss');

  urunler.forEach((u, i) => {
    sh.appendRow([
      talepId + '-' + (i + 1), new Date(),
      talepEdenSube, calisanAdi || '', verenSube,
      u.adi, (u.tip || 'HM').toUpperCase(),
      Number(u.miktar) || 0, '', u.birim || '',
      'Bekliyor', '', '', not || ''
    ]);
  });

  return { basari: true, talepId, mesaj: verenSube + ' subesine ' + urunler.length + ' kalemlik transfer talebi gonderildi.' };
}

function getTransferler(sube) {
  try {
    const sh = transferSheet();
    const rows = sh.getDataRange().getValues();
    const gelenTalepler = [];
    const gidenTalepler = [];
    const sn = nrm(sube);

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const kayit = {
        talepId: rows[i][0],
        tarih: rows[i][1] ? new Date(rows[i][1]).toLocaleDateString('tr-TR') + ' ' + Utilities.formatDate(new Date(rows[i][1]), 'Europe/Istanbul', 'HH:mm') : '',
        talepEdenSube: rows[i][2] || '',
        talepEden: rows[i][3] || '',
        verenSube: rows[i][4] || '',
        urunAdi: rows[i][5] || '',
        tip: rows[i][6] || 'HM',
        talepMiktar: Number(rows[i][7]) || 0,
        onayMiktar: rows[i][8] === '' ? null : Number(rows[i][8]),
        birim: rows[i][9] || '',
        durum: rows[i][10] || 'Bekliyor',
        onayTarihi: rows[i][11] ? new Date(rows[i][11]).toLocaleDateString('tr-TR') : '',
        onaylayan: rows[i][12] || '',
        not: rows[i][13] || '',
      };
      if (!sube) { gelenTalepler.push(kayit); continue; }
      if (nrm(kayit.verenSube) === sn) gelenTalepler.push(kayit);
      else if (nrm(kayit.talepEdenSube) === sn) gidenTalepler.push(kayit);
    }

    gelenTalepler.reverse();
    gidenTalepler.reverse();
    const bekleyen = gelenTalepler.filter(t => t.durum === 'Bekliyor').length;
    return { gelenTalepler, gidenTalepler, bekleyenSayi: bekleyen, sube: sube || '' };
  } catch(err) {
    return { gelenTalepler: [], gidenTalepler: [], bekleyenSayi: 0, sube: sube || '', hata: err.toString() };
  }
}

function transferOnayla(data) {
  const { talepId, onayMiktar, onaylayan } = data;
  const sh = transferSheet();
  const rows = sh.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== talepId) continue;
    if (rows[i][10] !== 'Bekliyor') return { basari: false, hata: 'Bu talep zaten islenmis: ' + rows[i][10] };

    const miktar = Number(onayMiktar) || 0;
    if (miktar <= 0) return { basari: false, hata: 'Onay miktari 0 olamaz.' };

    const talepEdenSube = rows[i][2];
    const verenSube = rows[i][4];
    const urunAdi = rows[i][5];
    const tip = rows[i][6];

    stokHareket(urunAdi, tip, verenSube, -miktar, 'Transfer Cikis', talepEdenSube + ' subesine · ' + talepId, onaylayan || '');
    stokHareket(urunAdi, tip, talepEdenSube, miktar, 'Transfer Giris', verenSube + ' subesinden · ' + talepId, onaylayan || '');

    sh.getRange(i + 1, 9).setValue(miktar);
    sh.getRange(i + 1, 11).setValue('Onaylandi');
    sh.getRange(i + 1, 12).setValue(new Date());
    sh.getRange(i + 1, 13).setValue(onaylayan || '');

    return { basari: true, mesaj: urunAdi + ' · ' + miktar + ' ' + (rows[i][9] || '') + ' · ' + verenSube + ' → ' + talepEdenSube };
  }
  return { basari: false, hata: 'Talep bulunamadi: ' + talepId };
}

function transferReddet(data) {
  const { talepId, onaylayan, not } = data;
  const sh = transferSheet();
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== talepId) continue;
    if (rows[i][10] !== 'Bekliyor') return { basari: false, hata: 'Bu talep zaten islenmis: ' + rows[i][10] };
    sh.getRange(i + 1, 9).setValue(0);
    sh.getRange(i + 1, 11).setValue('Reddedildi');
    sh.getRange(i + 1, 12).setValue(new Date());
    sh.getRange(i + 1, 13).setValue(onaylayan || '');
    if (not) sh.getRange(i + 1, 14).setValue(not);
    return { basari: true, mesaj: 'Talep reddedildi.' };
  }
  return { basari: false, hata: 'Talep bulunamadi' };
}

function transferDirektCikis(data) {
  const { verenSube, hedefSube, calisanAdi, urunler, not } = data;
  if (!verenSube || !hedefSube) return { basari: false, hata: 'Sube bilgisi eksik' };
  if (!urunler || !urunler.length) return { basari: false, hata: 'Urun secilmedi' };
  if (nrm(verenSube) === nrm(hedefSube)) return { basari: false, hata: 'Ayni subeye transfer olmaz' };

  const sh = transferSheet();
  const talepId = 'DC' + Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyMMddHHmmss');

  urunler.forEach((u, i) => {
    const miktar = Number(u.miktar) || 0;
    if (miktar <= 0) return;
    stokHareket(u.adi, (u.tip||'HM').toUpperCase(), verenSube, -miktar, 'Transfer Cikis', hedefSube + ' subesine (direkt) · ' + talepId, calisanAdi || '');
    stokHareket(u.adi, (u.tip||'HM').toUpperCase(), hedefSube, miktar, 'Transfer Giris', verenSube + ' subesinden (direkt) · ' + talepId, calisanAdi || '');

    sh.appendRow([
      talepId + '-' + (i + 1), new Date(),
      hedefSube, calisanAdi || '', verenSube,
      u.adi, (u.tip || 'HM').toUpperCase(),
      miktar, miktar, u.birim || '',
      'Direkt Cikis', new Date(), calisanAdi || '', not || ''
    ]);
  });

  return { basari: true, mesaj: hedefSube + ' subesine ' + urunler.length + ' kalem direkt cikis yapildi.' };
}
// ============================================================
// ÜRETİM VE ZAYİ İŞLEMLERİ
// ============================================================

function uretimKaydet(data) {
  const ss = ss_();
  const { yariMamulAdi, kat, calisanAdi, not, tarih, sube } = data;
  if (!sube) return { basari: false, hata: 'Sube secili degil' };

  const recete = getRecete(yariMamulAdi, sube);
  if (!recete.malzemeler || !recete.malzemeler.length) {
    return { basari: false, hata: yariMamulAdi + ' recete bulunamadi' };
  }

  const hmSh = sekmeBul(ss, 'Tbl_Hammaddeler');
  if (!hmSh) return { basari: false, hata: 'Tbl_Hammaddeler yok' };
  const hmRows = hmSh.getDataRange().getValues();
  const eksikler = [];

  recete.malzemeler.forEach(mal => {
    let bulundu = false;
    for (let i = 1; i < hmRows.length; i++) {
      if (!hmRows[i][1]) continue;
      const uzunAd = hmRows[i][1];
      const kisaAd = hmRows[i][2];
      const eslesti = nrm(kisaAd) === nrm(mal.hammadde) || nrm(uzunAd) === nrm(mal.hammadde);
      if (!eslesti) continue;

      bulundu = true;
      const stokBirimi  = hmRows[i][5] || '';
      const paketIcerik = Number(hmRows[i][7]) || 1;
      const olcuBirimi  = hmRows[i][8] || '';
      const dusum = stokDusumuHesapla(mal.bazMiktar * kat, mal.birim, stokBirimi, paketIcerik, olcuBirimi);

      const r = stokHareket(
        uzunAd.toString().trim(), 'HM', sube, -dusum, 'Uretim',
        yariMamulAdi + ' (' + kat + ' kat · ' + (mal.bazMiktar * kat) + ' ' + (mal.birim || '') + ')',
        calisanAdi || ''
      );
      if (r.eksikMi) eksikler.push({ adi: mal.hammadde, eksik: Math.abs(r.yeni).toFixed(2) });
      break;
    }
    if (!bulundu) eksikler.push({ adi: mal.hammadde, hata: 'Tbl_Hammaddeler eslesmesi bulunamadi' });
  });

  const cikti = recete.cikti;
  const toplamMiktar = cikti ? cikti.bazMiktar * kat : 0;
  let porsiyonAdet = null;
  let ciktiAciklama = '';

  if (cikti) {
    const tip = (cikti.ciktiTipi || '').toString().toLowerCase().trim();
    const bazGramMi = tip.indexOf('gr') === 0;
    if (bazGramMi) {
      ciktiAciklama = (toplamMiktar / 1000).toFixed(2) + ' kg';
      if (cikti.porsiyonAgir > 0) {
        porsiyonAdet = Math.floor(toplamMiktar / cikti.porsiyonAgir);
        ciktiAciklama = porsiyonAdet + ' porsiyon (' + ciktiAciklama + ')';
      } else if (cikti.birimAgir > 0) {
        porsiyonAdet = Math.floor(toplamMiktar / cikti.birimAgir);
        ciktiAciklama += ' → ' + porsiyonAdet + ' adet';
      }
    } else {
      porsiyonAdet = Math.round(toplamMiktar);
      ciktiAciklama = porsiyonAdet + ' adet';
    }
  }

  if (cikti && toplamMiktar > 0) {
    stokHareket(yariMamulAdi, 'YM', sube, toplamMiktar, 'Uretim', kat + ' kat · ' + ciktiAciklama, calisanAdi || '');
  }

  // Tekrar kullanılan malzeme: süresi dolduysa (ya da sayaç hiç başlamadıysa) bu parti
  // taze malzemeyle yapılır; yenileme, üretim satırından ÖNCE yazılır ki bu parti yeni
  // dönemin 1. partisi sayılsın.
  const tekrarMesajlari = [];
  recete.malzemeler.forEach(m => {
    const d = m.tekrarDurum;
    if (!d) return;
    if (!d.basladi || d.degistir) {
      tekrarLogYaz_(ss, sube, yariMamulAdi, m.hammadde,
        d.basladi ? d.tekrar + '. parti doldu' : 'Sayaç başlatıldı', calisanAdi);
      tekrarMesajlari.push(m.hammadde + ' yenilendi, sayaç 1/' + m.tekrar);
    } else {
      tekrarMesajlari.push(m.hammadde + ' ' + (d.parti + Number(kat || 1)) + '/' + m.tekrar);
    }
  });

  const uretimSh = sekmeBul(ss, 'Uretim_Girisleri');
  if (uretimSh) {
    uretimSh.appendRow([
      tarih || Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy'),
      sube, yariMamulAdi, kat, toplamMiktar,
      cikti ? cikti.ciktiTipi : '', porsiyonAdet || '',
      calisanAdi, not || '', new Date()
    ]);
  }

  return { basari: true, yariMamulAdi, kat, ciktiAciklama, eksikler, sube, tekrarMesajlari,
    mesaj: yariMamulAdi + ' kaydedildi (' + sube + '). Cikti: ' + ciktiAciklama +
      (tekrarMesajlari.length ? ' · ' + tekrarMesajlari.join(' · ') : '') };
}

function zayiKaydet(data) {
  if (Array.isArray(data)) {
    let basarili = 0;
    const sonuclar = [];
    data.forEach(item => {
      const res = zayiKaydetSartli(item);
      sonuclar.push(res);
      if (res.basari) basarili++;
    });
    return { basari: basarili === data.length, basarili, toplam: data.length, sonuclar,
      mesaj: basarili + '/' + data.length + ' adet zayi kaydi islendi.' };
  }
  return zayiKaydetSartli(data);
}

function zayiGirisYaz_(ss, data) {
  const zayiSh = sekmeBul(ss, 'Zayi_Girisleri');
  if (!zayiSh) return;
  zayiSh.appendRow([
    data.tarih || Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy'),
    data.sube, data.tip, data.urun, data.miktar, data.birim, data.sebep || 'Zayi',
    data.sorumlu || '', data.aciklama || '', data.calisanAdi || '', new Date()
  ]);
}

function hmBul_(ss, ad) {
  const sh = sekmeBul(ss, 'Tbl_Hammaddeler');
  if (!sh) return null;
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][1]) continue;
    const tamAd = rows[i][1].toString().trim();
    const kisaAd = rows[i][2] ? rows[i][2].toString().trim() : '';
    if (nrm(tamAd) === nrm(ad) || (kisaAd && nrm(kisaAd) === nrm(ad))) {
      return { ad: tamAd, stokBirimi: rows[i][5] || '', paketIcerik: Number(rows[i][7]) || 1, olcuBirimi: rows[i][8] || '' };
    }
  }
  return null;
}

function ymZayiMiktari_(urun, miktar, birim) {
  let m = Number(miktar) || 0;
  const b = (birim || '').toString().toLowerCase().replace(/\./g, '').trim();
  const tanim = getYariMamuller().find(y => nrm(y.adi) === nrm(urun));
  if (!tanim) return m;
  const gramBazli = String(tanim.ciktiTipi || '').toLowerCase().indexOf('gr') === 0;
  if (gramBazli) {
    if (b === 'kg') return yuvarla(m * 1000);
    if (b === 'porsiyon' && tanim.porsiyonAgir > 0) return yuvarla(m * tanim.porsiyonAgir);
    return yuvarla(m);
  }
  return yuvarla(m);
}


function zayiAmbalajBul_(ss, ad) {
  const sh = sekmeBul(ss, 'Ambalaj_Hammadde');
  if (!sh) return null;
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return null;
  const bas = rows[0].map(h => trSade(h));
  const kol = (ad2, varsayilan) => {
    const i = bas.indexOf(trSade(ad2));
    return i >= 0 ? i : varsayilan;
  };
  const cTamAd = kol('Hammadde_Adı', 1);
  const cKisa  = kol('Hammadde', 2);
  for (let i = 1; i < rows.length; i++) {
    const tam = rows[i][cTamAd] ? rows[i][cTamAd].toString().trim() : '';
    const kisa = rows[i][cKisa] ? rows[i][cKisa].toString().trim() : '';
    if (!tam && !kisa) continue;
    if (nrm(tam) === nrm(ad) || nrm(kisa) === nrm(ad)) return { ad: tam || kisa, kisaAd: kisa || tam };
  }
  return null;
}

function zayiUrunKategori_(urun) {
  const u = (getUrunler() || []).find(x => nrm(x.adi) === nrm(urun));
  return u ? (u.kategori || '') : '';
}

function zayiAmbalajKurallari_(ss, urun, kategori) {
  const sh = sekmeBul(ss, 'Ambalaj_Kurallari');
  if (!sh) return [];
  const rows = sh.getDataRange().getValues();
  const urunKurallari = [], kategoriKurallari = [];

  for (let i = 1; i < rows.length; i++) {
    const kosul = trKucuk(rows[i][0] || '').trim();
    const eslesme = rows[i][1] ? rows[i][1].toString().trim() : '';
    const sarf = rows[i][2] ? rows[i][2].toString().trim() : '';
    const miktar = Number(rows[i][3]) || 1;
    if (!sarf || !eslesme) continue;

    if ((kosul === 'urun' || kosul === 'ürün') && nrm(eslesme) === nrm(urun)) {
      urunKurallari.push({ sarf, miktar });
    } else if (kosul === 'kategori' && nrm(eslesme) === nrm(kategori)) {
      kategoriKurallari.push({ sarf, miktar });
    }
  }

  // SATIŞ MOTORUYLA AYNI: ürün kuralı varsa onu kullan, yoksa kategori kuralını kullan.
  return urunKurallari.length ? urunKurallari : kategoriKurallari;
}

function urunAmbalajZayiIsle_(ss, data) {
  if (!data.ambalajZayi) return { basari: true, hareketler: [] };
  const adet = Number(data.miktar) || 0;
  const kategori = data.kategori || zayiUrunKategori_(data.urun);
  const kurallar = zayiAmbalajKurallari_(ss, data.urun, kategori);
  if (!kurallar.length) return { basari: false, hata: 'Ambalaj EVET seçildi ama bu ürün/kategori için Ambalaj_Kurallari eşleşmesi bulunamadı: ' + data.urun + ' / ' + kategori };

  const hareketler = [];
  for (let i = 0; i < kurallar.length; i++) {
    const k = kurallar[i];
    const amb = zayiAmbalajBul_(ss, k.sarf);
    if (!amb) return { basari: false, hata: 'Ambalaj eslesmesi bulunamadi: ' + k.sarf };
    const dusum = yuvarla(k.miktar * adet);
    stokHareket(amb.ad, 'AMB', 'Merkez', -dusum, 'Zayi',
      data.urun + ' urun zayisi · ambalaj · ' + adet + ' adet · kaynak sube: ' + data.sube,
      data.calisanAdi || '');
    hareketler.push({ malzeme: amb.ad, tip: 'AMB', degisim: -dusum });
  }
  return { basari: true, hareketler };
}

function urunZayiIsle_(ss, data) {
  const sh = sekmeBul(ss, 'Tbl_Receteler');
  if (!sh) return { basari: false, hata: 'Tbl_Receteler yok' };
  const rows = sh.getDataRange().getValues();
  const adet = Number(data.miktar) || 0;
  if (adet <= 0) return { basari: false, hata: 'Zayi miktari 0 olamaz' };

  const hareketler = [];
  for (let i = 1; i < rows.length; i++) {
    if (nrm(rows[i][0]) !== nrm(data.urun)) continue;
    const malzeme = rows[i][2] ? rows[i][2].toString().trim() : '';
    const miktar = (Number(rows[i][3]) || 0) * adet;
    const birim = rows[i][4] || '';
    const rt = (rows[i][5] || '').toString().toUpperCase().trim();
    if (!malzeme || !miktar) continue;

    if (rt === 'YM' || rt.indexOf('YARI') >= 0) {
      const dusum = ymZayiMiktari_(malzeme, miktar, birim);
      stokHareket(malzeme, 'YM', data.sube, -dusum, 'Zayi', data.urun + ' urun zayisi · ' + adet + ' adet', data.calisanAdi || '');
      hareketler.push({ malzeme, tip: 'YM', degisim: -dusum });
    } else {
      const hm = hmBul_(ss, malzeme);
      if (!hm) return { basari: false, hata: 'Urun recetesindeki hammadde eslesmedi: ' + malzeme };
      const dusum = stokDusumuHesapla(miktar, birim, hm.stokBirimi, hm.paketIcerik, hm.olcuBirimi);
      stokHareket(hm.ad, 'HM', data.sube, -dusum, 'Zayi', data.urun + ' urun zayisi · ' + adet + ' adet', data.calisanAdi || '');
      hareketler.push({ malzeme: hm.ad, tip: 'HM', degisim: -dusum });
    }
  }
  if (!hareketler.length) return { basari: false, hata: data.urun + ' icin Tbl_Receteler kaydi bulunamadi' };
  const ambSonuc = urunAmbalajZayiIsle_(ss, data);
  if (!ambSonuc.basari) return ambSonuc;
  (ambSonuc.hareketler || []).forEach(h => hareketler.push(h));
  return { basari: true, hareketler, ambalajUyari: ambSonuc.uyari || '' };
}


function zayiDSStokBul_(ss, urun) {
  const sh = sekmeBul(ss, 'Sube_Stok');
  if (!sh) return null;
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    // Sube_Stok kolonları: A=Urun, B=Tip, C=Sube, D=Mevcut, E=Teorik
    const ad = rows[i][0] ? rows[i][0].toString().trim() : '';
    const tip = rows[i][1] ? rows[i][1].toString().trim() : '';
    const sube = rows[i][2] ? rows[i][2].toString().trim() : '';
    if (nrm(ad) === nrm(urun) && nrm(tip) === nrm('DS') && nrm(sube) === nrm('Merkez')) {
      return { adi: ad, sube: 'Merkez' };
    }
  }
  return null;
}

function zayiKaydetSartli(data) {
  const ss = ss_();
  const { tip, urun, miktar, birim, sebep, calisanAdi, sube } = data;
  if (!sube) return { basari: false, hata: 'Sube secili degil' };
  if (!urun) return { basari: false, hata: 'Urun secili degil' };
  if ((Number(miktar) || 0) <= 0) return { basari: false, hata: 'Zayi miktari 0 olamaz' };

  const tipLower = trKucuk(tip || '').trim();
  let sonuc = null;

  if (tipLower === 'hammadde' || tipLower === 'hm') {
    const hm = hmBul_(ss, urun);
    if (!hm) return { basari: false, hata: 'Hammadde eslesmesi bulunamadi: ' + urun };
    const dusum = stokDusumuHesapla(miktar, birim, hm.stokBirimi, hm.paketIcerik, hm.olcuBirimi);
    stokHareket(hm.ad, 'HM', sube, -dusum, 'Zayi', sebep || 'Zayi', calisanAdi || '');
    sonuc = { basari: true, degisim: -dusum, stokAdi: hm.ad };
  }
  else if (tipLower === 'yarimamul' || tipLower === 'yari mamul' || tipLower === 'ym') {
    const dusum = ymZayiMiktari_(urun, miktar, birim);
    stokHareket(urun, 'YM', sube, -dusum, 'Zayi', sebep || 'Zayi', calisanAdi || '');
    sonuc = { basari: true, degisim: -dusum, stokAdi: urun };
  }
  else if (tipLower === 'direkt satis' || tipLower === 'direktsatis' || tipLower === 'ds') {
    const dsStok = zayiDSStokBul_(ss, urun);
    if (!dsStok) return { basari: false, hata: 'DS stok kaydi bulunamadi (Sube_Stok / Merkez): ' + urun };

    const liste = getDirektSatisUrunler(sube) || [];
    const dsMeta = liste.find(x => nrm(x.adi) === nrm(urun) || nrm(x.tamAd) === nrm(urun) || nrm(x.altAd) === nrm(urun));

    let dusum = Number(miktar) || 0;
    const b = trKucuk(birim || '').replace(/\./g, '').trim();
    if (b === 'koli') dusum *= Number(dsMeta && dsMeta.koliIcerik) || 1;
    const dsDusum = yuvarla(dusum);

    stokHareket(
      dsStok.adi, 'DS', 'Merkez', -dsDusum, 'Zayi',
      'Direkt Satis zayisi · ' + (sebep || 'Zayi') + ' · kaynak sube: ' + sube,
      calisanAdi || ''
    );
    sonuc = { basari: true, degisim: -dsDusum, stokAdi: dsStok.adi, tip: 'DS' };
  }
  else if (tipLower === 'urun' || tipLower === 'ürün') {
    // Kesin güvenlik ağı: Ürün adı Sube_Stok'ta Merkez/DS ise reçeteye ASLA bakma.
    const dsStok = zayiDSStokBul_(ss, urun);
    if (dsStok) {
      const dsDusum = yuvarla(Number(miktar) || 0);
      stokHareket(
        dsStok.adi, 'DS', 'Merkez', -dsDusum, 'Zayi',
        'Direkt Satis zayisi · ' + (sebep || 'Zayi') + ' · kaynak sube: ' + sube,
        calisanAdi || ''
      );
      sonuc = { basari: true, degisim: -dsDusum, stokAdi: dsStok.adi, tip: 'DS' };
    } else {
      sonuc = urunZayiIsle_(ss, data);
      if (!sonuc.basari) return sonuc;
    }
  }
  else if (tipLower === 'ambalaj' || tipLower === 'amb') {
    const amb = zayiAmbalajBul_(ss, urun);
    if (!amb) return { basari: false, hata: 'Ambalaj bulunamadi: ' + urun };
    const dusum = yuvarla(Number(miktar) || 0);
    stokHareket(amb.ad, 'AMB', 'Merkez', -dusum, 'Zayi',
      (sebep || 'Zayi') + ' · kaynak sube: ' + sube, calisanAdi || '');
    sonuc = { basari: true, degisim: -dusum, stokAdi: amb.ad };
  }
  else {
    return { basari: false, hata: 'Desteklenmeyen zayi tipi: ' + tip };
  }

  zayiGirisYaz_(ss, data);
  return Object.assign({ mesaj: urun + ' zayisi kaydedildi (' + sube + ')' }, sonuc);
}

function sayimKaydet(data) {
  const ss = ss_();
  const { yariMamulAdi, sayimMiktar, calisanAdi, tarih, sube } = data;
  const tip = (data.tip === 'hm') ? 'HM' : (data.tip === 'ds') ? 'DS' : 'YM';
  if (!sube) return { basari: false, hata: 'Sube secili degil' };

  const b = stokSatirBul(yariMamulAdi, tip, sube);
  const sh = b.sh, satir = b.satir;

  const mevcutTeorik = sh.getRange(satir, 4, 1, 2).getValues()[0];
  const eskiMevcut = Number(mevcutTeorik[0]) || 0;
  const teorik = Number(mevcutTeorik[1]) || 0;
  // 14.09.2026: secilen birim artik gercekten uygulaniyor (once gormezden geliniyordu)
  const sayim = yuvarla(sayimBirimCevir(yariMamulAdi, tip, Number(sayimMiktar) || 0, data.sayimBirim));
  const fark = yuvarla(sayim - teorik);

  // D:I -> Mevcut, Teorik, Son_Sayim, Son_Sayim_Tarihi, Fark, Guncelleme
  sh.getRange(satir, 4, 1, 6).setValues([[sayim, sayim, sayim, new Date(), fark, new Date()]]);

  hareketYaz(sube, yariMamulAdi, 'Sayim', eskiMevcut, sayim, 'Teorik: ' + teorik + ' · Fark: ' + fark, calisanAdi || '', tip);

  let sayimSh = sekmeBul(ss, 'Sayim_Girisleri');
  if (!sayimSh) {
    sayimSh = ss.insertSheet('Sayim_Girisleri');
    sayimSh.appendRow(['Tarih','Sube','Urun_Adi','Tip','Sayim_Miktar','Teorik_Miktar','Fark','Calisan']);
    sayimSh.getRange(1,1,1,8).setFontWeight('bold').setBackground('#1a5e20').setFontColor('#ffffff');
  }
  sayimSh.appendRow([
    tarih || new Date().toLocaleDateString('tr-TR'),
    sube, yariMamulAdi, tip === 'HM' ? 'Hammadde' : (tip === 'DS' ? 'Direkt Satis' : 'Yari Mamul'),
    sayim, teorik, fark, calisanAdi || 'Bilinmiyor'
  ]);

  return { basari: true, fark, mesaj: yariMamulAdi + ' sayimi kaydedildi. Fark: ' + fark };
}

function stokDuzelt(data) {
  const { hammaddeAdi, yeniMiktar, neden, calisanAdi, sube } = data;
  if (!sube) return { basari: false, hata: 'Sube secili degil' };
  const tip = (data.tip || 'HM').toString().toUpperCase();
  const b = stokSatirBul(hammaddeAdi, tip, sube);
  const eski = Number(b.sh.getRange(b.satir, 4).getValue()) || 0;
  const yeni = Number(yeniMiktar) || 0;
  b.sh.getRange(b.satir, 4, 1, 2).setValues([[yeni, yeni]]);
  b.sh.getRange(b.satir, 9).setValue(new Date());
  hareketYaz(sube, hammaddeAdi, 'Duzeltme', eski, yeni, neden || '', calisanAdi || '', tip);
  return { basari: true, mesaj: hammaddeAdi + ' guncellendi (' + sube + ').' };
}

// ============================================================
// YARDIMCI BİLEŞENLER
// ============================================================

function tarihCoz(deger) {
  if (!deger) return null;
  if (deger instanceof Date) return new Date(deger.getFullYear(), deger.getMonth(), deger.getDate());
  const s = deger.toString().trim();
  const m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(s.replace('T', ' ').replace(/\.\d+$/, ''));
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function trSade(s) {
  return (s || '').toString()
    .replace(/[İIı]/g, 'i').replace(/[Ğğ]/g, 'g').replace(/[Üü]/g, 'u')
    .replace(/[Şş]/g, 's').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c')
    .replace(/[Ââ]/g, 'a').replace(/[Îî]/g, 'i').replace(/[Ûû]/g, 'u')
    .toLowerCase()
    .replace(/[\s._\-*\/()\\'"]/g, '');
}

function sekmeBul(ss, ad) {
  let sh = ss.getSheetByName(ad);
  if (sh) return sh;
  const hedef = trSade(ad);
  const hepsi = ss.getSheets();
  for (let i = 0; i < hepsi.length; i++) {
    if (trSade(hepsi[i].getName()) === hedef) return hepsi[i];
  }
  return null;
}

function trKucuk(s) {
  return (s || '').toString().replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}

function telefonDuzenle(deger) {
  if (!deger) return '';
  let s = deger.toString().replace(/[^\d]/g, '');
  if (!s) return '';
  if (s.indexOf('90') === 0 && s.length === 12) return s;
  if (s.indexOf('0') === 0 && s.length === 11) return '90' + s.substring(1);
  if (s.length === 10) return '90' + s;
  if (s.length > 12 && s.indexOf('90') === 0) return s.substring(0, 12);
  return '';
}

function nrm(s) {
  return trKucuk(s).replace(/[\s.,\-*\/()\\'"]/g, '');
}

function koliMu(deger) {
  return trKucuk(deger).trim().indexOf('koli') === 0;
}

function jsonRes(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// AMBALAJ (Ambalaj_Hammadde) — 14.09.2026 eklendi
// ============================================================

// TRUE / "TRUE" / "EVET" / 1 / isaretli kutu — hepsini kabul eder
function evetMi(v) {
  if (v === true) return true;
  if (v === false) return false;
  var s = trKucuk(v).toString().trim();
  return (s === 'true' || s === 'dogru' || s === 'doğru' ||
          s === 'evet' || s === 'e' || s === '1' || s === 'x' || s === 'var');
}

function getAmbalajUrunler(sube) {
  const ss = ss_();
  const sh = sekmeBul(ss, 'Ambalaj_Hammadde');
  if (!sh) return [];
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];

  const bas = rows[0].map(h => trSade(h));
  const kol = (ad, varsayilan) => {
    const i = bas.indexOf(trSade(ad));
    return i >= 0 ? i : varsayilan;
  };
  const cTamAd  = kol('Hammadde_Adı', 1);
  const cKisa   = kol('Hammadde', 2);
  const cTed    = kol('Tedarikçi', 3);
  const cAktif  = kol('Tedarikçi Sipariş Aktif', 4);
  const cPaket  = kol('Sipariş paket durumu', 5);
  const cKat    = kol('Kategori', 6);
  const cAdet   = kol('Birim', 7);
  const cOlcu   = kol('Ölçü_Birimi', 8);
  const cFiyat  = kol('Son Alış Fiyatı', 9);
  const cMin    = kol('Min_Stok_Uyarı', 11);
  const cTakip  = kol('Stok_Takip', 14);
  const cKoliIc = kol('Koli_Icerik', 15);

  const stokHarita = sube ? subeStokHaritasi(sube) : {};

  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const tamAd  = rows[i][cTamAd] ? rows[i][cTamAd].toString().trim() : '';
    const kisaAd = rows[i][cKisa]  ? rows[i][cKisa].toString().trim()  : '';
    const gorunenAd = kisaAd || tamAd;
    if (!gorunenAd) continue;

    const tedarikci = rows[i][cTed] ? rows[i][cTed].toString().trim() : '';
    const aktifH = rows[i][cAktif];
    const bosMu = (aktifH === '' || aktifH === null || aktifH === undefined);

    const s = stokHarita[nrm(gorunenAd) + '|AMB'] ||
              { mevcut: 0, teorik: 0, fark: 0, sonSayimTarih: '' };

    result.push({
      adi:           gorunenAd,
      tamAd:         tamAd,
      altAd:         kisaAd,
      tedarikci:     tedarikci,
      sipAktif:      bosMu ? true : evetMi(aktifH),
      paketDurumu:   rows[i][cPaket] ? rows[i][cPaket].toString().trim() : '',
      kategori:      rows[i][cKat] ? rows[i][cKat].toString().trim() : 'Ambalaj',
      paketIcerik:   Number(rows[i][cAdet]) || 1,
      birim:         rows[i][cOlcu] ? rows[i][cOlcu].toString().trim() : 'adet',
      sonAlisFiyati: Number(rows[i][cFiyat]) || 0,
      minStok:       Number(rows[i][cMin]) || 0,
      stokTakip:     evetMi(rows[i][cTakip]),
      koliMu:        koliMu(rows[i][cPaket]),
      koliIcerik:    Number(rows[i][cKoliIc]) || 1,
      mevcutStok:    s.mevcut,
      teorikStok:    s.teorik,
      fark:          s.fark,
      sonSayimTarih: s.sonSayimTarih,
      tip:           'amb',
      ambalajMi:     true,
      sube:          sube || '',
    });
  }
  return result;
}


// ============================================================
// SAYIM BIRIM CEVRIMI — 14.09.2026
// Panelden gelen sayimBirim degerini baz birime cevirir.
//   HM : olcu | kg | paket | koli
//   DS : olcu | koli
//   YM : olcu | kg | porsiyon
// ============================================================
function sayimBirimCevir(adi, tip, miktar, birim) {
  const m = Number(miktar) || 0;
  const b = (birim || 'olcu').toString().toLowerCase().replace(/\./g, '').trim();
  if (!b || b === 'olcu') return m;
  const t = (tip || '').toString().toUpperCase();

  if (t === 'YM') {
    if (b === 'kg') return yuvarla(m * 1000);
    if (b === 'porsiyon') {
      const y = ymBirimHaritasi()[nrm(adi)];
      if (!y) return m;
      const bolen = (y.birim === 'gr') ? (y.porsiyonAgir || 0) : (y.porsiyonAdet || 0);
      return bolen > 0 ? yuvarla(m * bolen) : m;
    }
    return yuvarla(m);
  }

  if (t === 'HM') {
    const ss = ss_();
    const h = hmBul_(ss, adi);
    if (!h) return yuvarla(m);
    const sb = trKucuk(h.stokBirimi || '').replace(/\./g, '').trim();
    const ob = trKucuk(h.olcuBirimi || '').replace(/\./g, '').trim();

    if (b === 'paket' || b === 'adet') {
      if (sb === 'adet' || sb === 'paket') return yuvarla(m);
      return yuvarla(stokDusumuHesapla(m * h.paketIcerik, ob, h.stokBirimi, h.paketIcerik, h.olcuBirimi));
    }
    if (b === 'koli') {
      const hmap = hmBirimHaritasi()[nrm(h.ad)];
      const koli = hmap ? (hmap.koliIcerik || 1) : 1;
      if (sb === 'adet' || sb === 'paket') return yuvarla(m * koli);
      return yuvarla(stokDusumuHesapla(m * koli * h.paketIcerik, ob, h.stokBirimi, h.paketIcerik, h.olcuBirimi));
    }
    if (b === 'kg') {
      if (sb === 'kg') return yuvarla(m);
      if (sb === 'gr' || sb === 'gram') return yuvarla(m * 1000);
      if (sb === 'adet' || sb === 'paket') return yuvarla(stokDusumuHesapla(m, 'kg', h.stokBirimi, h.paketIcerik, h.olcuBirimi));
    }
    if (b === 'gr' || b === 'gram' || b === 'ml' || b === 'lt' || b === 'litre') {
      return yuvarla(stokDusumuHesapla(m, b, h.stokBirimi, h.paketIcerik, h.olcuBirimi));
    }
    return yuvarla(m);
  }

  if (t === 'DS' || t === 'AMB') {
    if (b === 'koli') {
      const ds = getDirektSatisUrunler('').concat(getAmbalajUrunler(''));
      for (let i = 0; i < ds.length; i++) {
        if (nrm(ds[i].adi) === nrm(adi)) return yuvarla(m * (Number(ds[i].koliIcerik) || 1));
      }
    }
    return yuvarla(m);
  }

  return yuvarla(m);
}

// ============================================================
// TOPLU SAYIM — 14.09.2026
// Panelden tek istekte birden fazla sayim gelir; her urun icin
// Sube_Stok satiri tek setValues ile yazilir, loglar sonda toplu eklenir.
// data.kayitlar = [{adi, miktar, birim, tip}], data.calisanAdi, data.tarih, data.sube
// ============================================================
function sayimTopluKaydet(data) {
  const ss = ss_();
  const sube = data.sube;
  if (!sube) return { basari: false, hata: 'Sube secili degil' };
  const kayitlar = data.kayitlar || [];
  if (!kayitlar.length) return { basari: false, hata: 'Kayit yok' };

  const calisan = data.calisanAdi || 'Bilinmiyor';
  const tarih = data.tarih || new Date().toLocaleDateString('tr-TR');
  const simdi = new Date();

  let hareketSh = sekmeBul(ss, 'Stok_Hareketleri');
  if (!hareketSh) {
    hareketSh = ss.insertSheet('Stok_Hareketleri');
    hareketSh.appendRow(['Tarih','Sube','Malzeme','Hareket_Turu','Eski_Stok','Yeni_Stok','Birim','Karsiligi','Detay','Sorumlu']);
    hareketSh.getRange(1,1,1,10).setFontWeight('bold').setBackground('#4a148c').setFontColor('#ffffff');
    hareketSh.setFrozenRows(1);
  }
  let sayimSh = sekmeBul(ss, 'Sayim_Girisleri');
  if (!sayimSh) {
    sayimSh = ss.insertSheet('Sayim_Girisleri');
    sayimSh.appendRow(['Tarih','Sube','Urun_Adi','Tip','Sayim_Miktar','Teorik_Miktar','Fark','Calisan']);
    sayimSh.getRange(1,1,1,8).setFontWeight('bold').setBackground('#1a5e20').setFontColor('#ffffff');
  }

  const hareketSatirlari = [], sayimSatirlari = [], sonuclar = [];
  let ok = 0;

  for (let i = 0; i < kayitlar.length; i++) {
    const k = kayitlar[i];
    const adi = k.adi;
    try {
      const tip = (k.tip === 'hm') ? 'HM' : (k.tip === 'ds') ? 'DS' : (k.tip === 'amb') ? 'AMB' : 'YM';
      const sayim = yuvarla(sayimBirimCevir(adi, tip, Number(k.miktar) || 0, k.birim));

      const b = stokSatirBul(adi, tip, sube);
      const sh = b.sh, satir = b.satir;

      const mevcutTeorik = sh.getRange(satir, 4, 1, 2).getValues()[0];
      const eskiMevcut = Number(mevcutTeorik[0]) || 0;
      const teorik = Number(mevcutTeorik[1]) || 0;
      const fark = yuvarla(sayim - teorik);

      // D:I -> Mevcut, Teorik, Son_Sayim, Son_Sayim_Tarihi, Fark, Guncelleme
      sh.getRange(satir, 4, 1, 6).setValues([[sayim, sayim, sayim, simdi, fark, simdi]]);

      const br = birimKarsilik(adi, tip, sayim);
      hareketSatirlari.push([simdi, sube, adi, 'Sayim', eskiMevcut, sayim, br.birim, br.karsilik,
                             'Teorik: ' + teorik + ' · Fark: ' + fark + ' (toplu)', calisan]);
      sayimSatirlari.push([tarih, sube, adi,
                           tip === 'HM' ? 'Hammadde' : (tip === 'DS' ? 'Direkt Satis' : (tip === 'AMB' ? 'Ambalaj' : 'Yari Mamul')),
                           sayim, teorik, fark, calisan]);

      sonuclar.push({ adi: adi, basari: true, sayim: sayim, fark: fark });
      ok++;
    } catch (e) {
      sonuclar.push({ adi: adi, basari: false, hata: e.toString() });
    }
  }

  if (hareketSatirlari.length) {
    hareketSh.getRange(hareketSh.getLastRow() + 1, 1, hareketSatirlari.length, 10).setValues(hareketSatirlari);
  }
  if (sayimSatirlari.length) {
    sayimSh.getRange(sayimSh.getLastRow() + 1, 1, sayimSatirlari.length, 8).setValues(sayimSatirlari);
  }
  SpreadsheetApp.flush();

  return {
    basari: ok > 0,
    toplam: kayitlar.length,
    basarili: ok,
    hataliSayi: kayitlar.length - ok,
    sonuclar: sonuclar,
    mesaj: ok + '/' + kayitlar.length + ' sayim kaydedildi'
  };
}