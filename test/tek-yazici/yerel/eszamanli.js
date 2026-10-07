// Eşzamanlılık denemesi: GERÇEK Satış Motoru (dusumleriUygula), GERÇEK Alış Motoru (alisIsle_) ve GERÇEK mutfak paneli
// (doPost) kodu, ortak sahte tablolar üzerinde çalışır. "Araya girme": bir yazıcının Sube_Stok'u OKUMASI ile YAZMASI
// arasında başka bir yürütmenin bütünüyle çalışması (Apps Script'te ayrı yürütmeler gerçekten böyle iç içe geçebilir).
// Her senaryo iki kez koşulur: sıralı (doğru sonuç) ve araya girmeli; Sube_Stok sonuçları karşılaştırılır.
const fs = require('fs'), vm = require('vm'), path = require('path');
const KOK = path.join(__dirname, '../../../apps-script');
const ONERI = path.join(__dirname, '../oneri');
const BURA = __dirname;
const SISTEM = process.argv[2] || 'eski'; // 'eski' | 'yeni'

// ---------- sahte tablo ----------
let aktor = null, araya = null; // araya: { kimin: 'SM'|'AM', fn }
function sheet(ad, satirlar) {
  const data = satirlar.map(r => r.slice());
  const pad = (r, c) => { while (data.length < r) data.push([]); const row = data[r - 1]; while (row.length < c) row.push(''); };
  const yazmadanOnce = () => {
    if (ad === 'Sube_Stok' && araya && aktor === araya.kimin) { const f = araya.fn; araya = null; const once = aktor; f(); aktor = once; }
  };
  const w = () => Math.max(1, ...data.map(r => r.length));
  return {
    _data: data, getName: () => ad, getLastRow: () => data.length, getLastColumn: w,
    getDataRange: () => ({ getValues: () => data.map(r => { const x = r.slice(); while (x.length < w()) x.push(''); return x; }) }),
    getRange: (r, c, nr = 1, nc = 1) => { const rg = ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (data[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
      getValue: () => { const v = (data[r - 1] || [])[c - 1]; return v === undefined ? '' : v; },
      setValues: vs => { yazmadanOnce(); vs.forEach((row, i) => row.forEach((v, j) => { pad(r + i, c + j); data[r - 1 + i][c - 1 + j] = v; })); return rg; },
      setValue: v => { yazmadanOnce(); pad(r, c); data[r - 1][c - 1] = v; return rg; },
      setFontWeight() { return rg; }, setBackground() { return rg; }, setFontColor() { return rg; }, setNumberFormat() { return rg; },
    }); return rg; },
    appendRow: row => { yazmadanOnce(); data.push(row.slice()); },
    insertRowsBefore: (r, n) => { for (let i = 0; i < n; i++) data.splice(r - 1, 0, []); },
    setFrozenRows() {}, autoResizeColumns() {}, clear() { data.length = 0; return this; }, clearContents() { data.length = 0; return this; }, getMaxRows: () => data.length + 100, deleteRows() {}, hideSheet() {},
  };
}
function dosya(sekmeler) {
  const sh = {}; Object.keys(sekmeler).forEach(a => sh[a] = sheet(a, sekmeler[a]));
  return { getSheetByName: a => sh[a] || null, getSheets: () => Object.values(sh), insertSheet: a => (sh[a] = sheet(a, [])), _sh: sh, getId: () => 'x' };
}

function baslangic() {
  const stok = dosya({
    Sube_Stok: [['Urun_Adi', 'Tip', 'Sube', 'Mevcut_Stok', 'Teorik_Stok', 'Son_Sayim', 'Son_Sayim_Tarihi', 'Fark', 'Son_Guncelleme'],
      ['Mayonez', 'HM', 'Erenköy', 20, 20, '', '', 0, ''], ['Portakal', 'HM', 'Erenköy', 30, 30, '', '', 0, ''],
      ['Elma yeşil', 'HM', 'Erenköy', 10, 10, '', '', 0, ''], ['Narenciye Sos', 'YM', 'Erenköy', 5000, 5000, '', '', 0, ''],
      ['Susurluk Ayran', 'DS', 'Erenköy', 100, 100, '', '', 0, ''], ['Susurluk Ayran', 'DS', 'Fikirtepe', 10, 10, '', '', 0, ''],
      ['Mayonez', 'HM', 'Fikirtepe', 8, 8, '', '', 0, '']],
    Stok_Hareketleri: [['Tarih', 'Sube', 'Malzeme', 'Hareket_Turu', 'Eski_Stok', 'Yeni_Stok', 'Birim', 'Karsiligi', 'Detay', 'Sorumlu']],
    Satis_Hareketleri: [['Tarih', 'Sube', 'Malzeme', 'Tip', 'Miktar', 'Birim', 'Siparis', 'Detay', 'x', 'y']],
    Tbl_YariMamulRecete: [['YariMamul_Adi', 'Hammadde', 'Baz_Miktar', 'Birim', 'Açıklama', 'Tekrar_Parti', 'Kategori'],
      ['Narenciye Sos', 'Mayonez', 4, 'kg.', '', '', 'Soslar'], ['Narenciye Sos', 'Portakal', 7, 'kg.', '', '', 'Soslar'], ['Narenciye Sos', 'Elma yeşil', 2, 'kg.', '', '', 'Soslar']],
    'Tbl_YariMamul tablosuna Cikti_Tipi': [['YariMamul_Adi', 'Cikti_Tipi', 'Baz_Miktar', 'Porsiyon_adet', 'Porsiyon_gram', 'Takip_tipi', 'Kategori'], ['Narenciye Sos', 'gr.', 16820, '', '', 'gr.', 'Soslar']],
    Tbl_Hammaddeler: [['Hammadde_ID', 'Ad', 'Kisa', 'Tedarikci', 'Aktif', 'Paket', 'Kategori', 'Icerik', 'Olcu', 'Fiyat', 'K', 'Min', 'M', 'N', 'Takip', 'Koli'],
      ['1', 'Mayonez', 'Mayonez', 'Metro', true, 'kg', 'Sos', 1, 'kg', 100, '', '', '', '', true, 1],
      ['2', 'Portakal', 'Portakal', 'Halci', true, 'kg', 'Meyve', 1, 'kg', 30, '', '', '', '', true, 1],
      ['3', 'Elma yeşil', 'Elma yeşil', 'Halci', true, 'kg', 'Meyve', 1, 'kg', 40, '', '', '', '', true, 1]],
    Direktsatisurunler: [['ID', 'Urun_adi', 'Kisa']], Ambalaj_Kurallari: [['Kosul', 'Eslesme', 'Sarf', 'Miktar']],
    'Tedarikçi Sevkiyat günleri': [['Tedarikci', 'Unvan', 'Sube'], ['Metro', 'Metro Gıda', 'Erenköy']],
    Fatura_Eslestirme: [['Fatura_Urun_Adi', 'Stok_Urun_Adi', 'Carpan', 'Not', 'Tedarikci', 'Tip', 'Sube']],
    Siparis_Kayitlari: [['Siparis_ID']], Alis_Bekleyenler: [['x']], Zayi_Girisleri: [['Tarih']], Uretim_Girisleri: [['Tarih']],
    Transferler: [['Talep_ID', 'Tarih', 'Talep_Eden_Sube', 'Talep_Eden', 'Veren_Sube', 'Urun_Adi', 'Tip', 'Talep_Miktar', 'Onay_Miktar', 'Birim', 'Durum', 'Onay_Tarihi', 'Onaylayan', 'Not'],
      ['TR1', new Date(), 'Fikirtepe', 'Ceren', 'Erenköy', 'Susurluk Ayran', 'DS', 24, '', 'adet', 'Bekliyor', '', '', '']],
  });
  const fatura = dosya({ Fatura_Kalemleri: [['Fatura_No', 'Tarih', 'Tedarikci', 'Urun', 'Adet', 'Fiyat', 'Tutar', 'KDV', 'Sube', 'Toplam', 'Stoga_Islendi', 'Sebep', 'Siparis'],
    ['F1', new Date('2026-10-08T08:00:00Z'), 'Metro Gıda', 'Mayonez', 10, 100, 1000, 1200, 'Erenköy', 1200, '', '', '']] });
  return { stok, fatura };
}

// ---------- kilit (proje başına) ----------
function kilitOlustur() { let tutan = false; return { getScriptLock: () => ({ tryLock: () => (tutan ? false : (tutan = true)), waitLock() { if (tutan) throw new Error('kilit'); tutan = true; }, releaseLock: () => { tutan = false; } }) }; }

function baglam(dosyalar, kilit, kodlar) {
  let uuid = 0;
  const ctx = {
    SpreadsheetApp: { openById: id => (id === '1JJ6UZzh8rSX1FE9Cr-UPzEAaE-2aKtM10bEvjAv2P5w' ? dosyalar.fatura : dosyalar.stok), flush() {} }, sk_uyariGonder_() {},
    LockService: kilit, CacheService: { getScriptCache: () => ({ get: () => null, put() {}, getAll: () => ({}), putAll() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, getKeys: () => [], deleteProperty() {} }) },
    ContentService: { createTextOutput: t => ({ setMimeType() { return this; }, _t: t }), MimeType: { JSON: 1, TEXT: 2 } },
    Utilities: { formatDate: (d, tz, f) => (f === 'yyyyMMdd' ? '20261008' : f === 'HHmmss' ? '090000' : '08.10.2026'), getUuid: () => 'u' + (++uuid), sleep() {} },
    Logger: { log() {} }, console, Date, JSON, Math, Number, String, Object, Array, isNaN, RegExp, Error,
  };
  vm.createContext(ctx);
  kodlar.forEach(k => vm.runInContext(fs.readFileSync(k, 'utf8'), ctx, { filename: path.basename(k) }));
  return ctx;
}

const STOK_KODU = [path.join(KOK, 'stok-takip-sistemi/Satıs Motoru.gs'), path.join(KOK, 'stok-takip-sistemi/Alıs Motoru v2.gs')]
  .concat(SISTEM === 'yeni' ? [path.join(ONERI, 'Stok Kuyrugu.gs')] : []);
const PANEL_KODU = [SISTEM === 'yeni' ? path.join(ONERI, 'panel-Kod.gs') : path.join(KOK, 'bap-panel-backend/Kod.gs')];

function dunya() {
  const d = baslangic(), stokKilit = kilitOlustur(), panelKilit = kilitOlustur();
  const stokCtx = () => baglam(d, stokKilit, STOK_KODU);   // her çağrı = yeni yürütme (genel değişkenler sıfır)
  const panelCtx = () => baglam(d, panelKilit, PANEL_KODU);
  const sonuclar = [];
  const SM = (dusum) => { aktor = 'SM'; const c = stokCtx(); const L = c.LockService.getScriptLock();
    if (!L.tryLock(5000)) { sonuclar.push('SM kilidi alamadı, atlandı'); return false; }
    try { if (SISTEM === 'yeni') c.stokKuyruguIsle_(d.stok); c.dusumleriUygula(d.stok, dusum); } finally { L.releaseLock(); } return true; };
  const AM = () => { aktor = 'AM'; const c = stokCtx(); const L = c.LockService.getScriptLock();
    if (!L.tryLock(5000)) { sonuclar.push('AM kilidi alamadı, atlandı'); return false; }
    try { if (SISTEM === 'yeni') c.stokKuyruguIsle_(d.stok); c.alisIsle_(); } finally { L.releaseLock(); } return true; };
  const KUYRUK = () => { if (SISTEM !== 'yeni') return; aktor = 'KY'; const c = stokCtx(); const L = c.LockService.getScriptLock();
    if (!L.tryLock(5000)) { sonuclar.push('Kuyruk kilidi alamadı'); return; } try { c.stokKuyruguIsle_(d.stok); } finally { L.releaseLock(); } };
  const PANEL = (g) => { aktor = 'PANEL'; const r = JSON.parse(panelCtx().doPost({ postData: { contents: JSON.stringify(g) } })._t); if (r.hata || r.basari === false) throw new Error('panel: ' + JSON.stringify(r)); return r; };
  return { d, SM, AM, KUYRUK, PANEL, sonuclar };
}

const dusumSatis = () => ({ 'a': { ad: 'Mayonez', tip: 'HM', sube: 'Erenköy', miktar: 1.5, birim: 'kg', detaylar: ['SP9'], siparisler: { SP9: { miktar: 1.5, detaylar: ['x'] } } },
  'b': { ad: 'Narenciye Sos', tip: 'YM', sube: 'Erenköy', miktar: 300, birim: 'gr', detaylar: ['SP9'], siparisler: { SP9: { miktar: 300, detaylar: ['x'] } } },
  'c': { ad: 'Susurluk Ayran', tip: 'DS', sube: 'Erenköy', miktar: 6, birim: 'adet', detaylar: ['SP9'], siparisler: { SP9: { miktar: 6, detaylar: ['x'] } } } });
const URETIM = { action: 'uretimKaydet', yariMamulAdi: 'Narenciye Sos', kat: 0.5, calisanAdi: 'Ceren', sube: 'Erenköy' };
const ZAYI = { action: 'zayiKaydet', tip: 'hm', urun: 'Mayonez', miktar: 1, birim: 'kg', sebep: 'Bozuk', calisanAdi: 'Yusuf', sube: 'Erenköy' };
const TRANSFER = { action: 'transferOnayla', talepId: 'TR1', onayMiktar: 24, onaylayan: 'Ceren' };

const stokTablosu = w => w.d.stok._sh.Sube_Stok._data.slice(1).map(r => `${r[0]}|${r[1]}|${r[2]}=${Math.round(Number(r[3]) * 1000) / 1000}`).sort();

const SENARYOLAR = {
  'S1 satış motoru ↔ mutfak üretimi': {
    sirali: w => { w.SM(dusumSatis()); w.PANEL(URETIM); w.KUYRUK(); },
    araya: w => { araya = { kimin: 'SM', fn: () => w.PANEL(URETIM) }; w.SM(dusumSatis()); w.KUYRUK(); } },
  'S2 satış motoru ↔ zayi + transfer onayı': {
    sirali: w => { w.SM(dusumSatis()); w.PANEL(ZAYI); w.PANEL(TRANSFER); w.KUYRUK(); },
    araya: w => { araya = { kimin: 'SM', fn: () => { w.PANEL(ZAYI); w.PANEL(TRANSFER); } }; w.SM(dusumSatis()); w.KUYRUK(); } },
  'S3 alış motoru (fatura) ↔ mutfak üretimi': {
    sirali: w => { w.AM(); w.PANEL(URETIM); w.KUYRUK(); },
    araya: w => { araya = { kimin: 'AM', fn: () => w.PANEL(URETIM) }; w.AM(); w.KUYRUK(); } },
  'S4 satış motoru ↔ alış motoru (aynı proje)': {
    sirali: w => { w.SM(dusumSatis()); w.AM(); },
    araya: w => { let atlandi = false; araya = { kimin: 'SM', fn: () => { atlandi = !w.AM(); } }; w.SM(dusumSatis()); if (atlandi) w.AM(); } },
  'S5 hepsi birden: satış, alış, üretim, zayi, transfer': {
    sirali: w => { w.SM(dusumSatis()); w.AM(); w.PANEL(URETIM); w.PANEL(ZAYI); w.PANEL(TRANSFER); w.KUYRUK(); },
    araya: w => { let amAtlandi = false;
      araya = { kimin: 'SM', fn: () => { w.PANEL(URETIM); amAtlandi = !w.AM(); w.PANEL(ZAYI); } }; w.SM(dusumSatis());
      if (amAtlandi) w.AM(); w.PANEL(TRANSFER); w.KUYRUK(); } },
};

let kayip = 0;
console.log(`\n=== SİSTEM: ${SISTEM === 'yeni' ? 'YENİ (tek yazıcı + kuyruk)' : 'ESKİ (bugünkü canlı kod)'} ===`);
for (const [ad, s] of Object.entries(SENARYOLAR)) {
  const w1 = dunya(); s.sirali(w1); const dogru = stokTablosu(w1);
  const w2 = dunya(); s.araya(w2); const gercek = stokTablosu(w2);
  const fark = dogru.filter(x => !gercek.includes(x)).map(x => { const k = x.split('=')[0]; const g = gercek.find(y => y.startsWith(k + '=')); return `${k}: olması gereken ${x.split('=')[1]}, olan ${g ? g.split('=')[1] : 'YOK'}`; });
  if (fark.length) kayip++;
  console.log(`${fark.length ? '✗ KAYIP' : '✓ doğru'}  ${ad}${w2.sonuclar.length ? '  [' + w2.sonuclar.join('; ') + ']' : ''}`);
  fark.forEach(f => console.log('     ' + f));
}
console.log(`Sonuç: ${Object.keys(SENARYOLAR).length} senaryodan ${kayip} tanesinde stok etkisi kayboldu.`);
