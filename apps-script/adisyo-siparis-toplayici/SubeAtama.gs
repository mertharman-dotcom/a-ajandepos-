/*** BAP – ÇIKIŞ ŞUBESİ ATAMA + GÜNLÜK ŞUBE RAPORU ***
 *
 * Adisyo Sipariş Toplayıcı projesine YENİ DOSYA olarak ekle (SubeAtama.gs).
 * Toplayıcıdaki CONFIG, C, dataSheet_, nrm_, mahalleListesi_, bildir_ kullanılır.
 *
 * "Ürün Çıkan Şube" (G) sütununu şu sırayla belirler (yalnız KAPALI siparişler):
 *   0) Çıkış Kaynağı = "Elle" ise hiç dokunmaz (G'yi elle değiştirince otomatik "Elle" olur)
 *   1) Masa / Gel-Al        → siparişin geldiği şube (F)
 *   2) Erenköy kapalıyken   → Fikirtepe   (12:00 öncesi ve 22:00 sonrası tüm paketler)
 *   3) Kurye_Gecici kaydı   → o gün/saatte kuryenin çalıştığı şube
 *                             (ör. Fikirtepe kuryesi 19:00–22:00 Erenköy'den paket attı)
 *   4) Kurye_Sube listesi   → kuryenin şubesi (mahalle başka diyorsa "Kurye (pas)")
 *   5) Mahalle_Sube listesi → mahallenin şubesi
 *   6) hiçbiri yoksa        → "Belirsiz", G'ye dokunmaz
 *
 * Tabloya iki sütun ekler (sona): "Varsayılan Şube" (mahalle/saat ne diyordu) ve "Çıkış Kaynağı".
 * Ayar tablosuna iki sekme ekler:
 *   Kurye_Sube   : A Kurye (Adisyo'daki ad, ilk adı yeter) | B Şube (Erenköy / Fikirtepe / Platform) | C Not
 *   Kurye_Gecici : A İş günü | B Başlangıç (SS:dd) | C Bitiş (SS:dd) | D Kurye | E Çalıştığı Şube | F Not
 *                  (saatler boşsa bütün gün; gece yarısını geçen aralık yazılabilir: 22:00–01:30)
 *
 * KURULUM: subeAtamaKurulum() → Kurye_Sube'yi tamamla → subeAtamaGeriye(30) → subeRaporuGeriye(7)
 * Tetikleyiciler: saatlik subeAtamaGuncelle, her gece ~04:30 gunlukSubeRaporu, G düzenlemesini yakalayan onEdit.
 */

const SA = {
  ERENKOY: 'Erenköy',           // Mahalle_Sube'deki yazımı otomatik alınır; bulunamazsa bu kullanılır
  FIKIRTEPE: 'Fikirtepe',
  ERENKOY_ACILIS: 12, ERENKOY_KAPANIS: 22,          // her gün
  FIKIRTEPE_ACILIS: 11, FIKIRTEPE_KAPANIS: 23,      // Pazar–Perşembe
  FIKIRTEPE_KAPANIS_CUMA_CMT: 26,                   // Cuma ve Cumartesi gecesi 02:00
  GUN_DONUMU: 4,                // 04:00'ten önceki siparişler önceki iş gününe sayılır
  GERI_GUN: 2,                  // saatlik turda kaç günlük siparişe bakılır
  KURYE_SHEET: 'Kurye_Sube',
  GECICI_SHEET: 'Kurye_Gecici',
  RAPOR_SHEET: 'Sube_Gunluk',
  PAS_SHEET: 'Sube_Pas_Detay',
  KOL_VARSAYILAN: 'Varsayılan Şube',
  KOL_KAYNAK: 'Çıkış Kaynağı',
  ELLE: 'Elle',
  BILDIR: true,                 // günlük rapor mail + WhatsApp webhook'a gitsin mi
};
const SA_GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const SA_RAPOR_BASLIK = ['İş Günü', 'Erenköy Paket', 'Erenköy Ciro', 'Fikirtepe Paket', 'Fikirtepe Ciro',
  'Erenköy Masa/Gel-Al', 'Fikirtepe Masa/Gel-Al', 'Pas Erenköy→Fikirtepe', 'Pas Fikirtepe→Erenköy',
  'Geçici Görev', 'Elle', 'Belirsiz', 'Kuryesiz Paket', 'Tanımsız Kurye', 'Mesai Dışı', 'İptal', 'Güncellendi'];
const SA_PAS_BASLIK = ['İş Günü', 'Saat', 'Sipariş No', 'Sipariş ID', 'Kanal', 'Mahalle', 'Varsayılan Şube',
  'Çıkış Şubesi', 'Kurye', 'Kaynak', 'Tutar'];

// ============================================================
// KURULUM
// ============================================================
function subeAtamaKurulum() {
  const ayar = SpreadsheetApp.openById(CONFIG.AYAR_SS_ID);
  const ad = saAdlar_();
  const subeListesi = SpreadsheetApp.newDataValidation()
    .requireValueInList([ad.E, ad.F, 'Platform'], true).setAllowInvalid(false).build();

  let k = ayar.getSheetByName(SA.KURYE_SHEET);
  if (!k) {
    k = ayar.insertSheet(SA.KURYE_SHEET);
    k.getRange(1, 1, 1, 3).setValues([['Kurye (Adisyo adı)', 'Şube', 'Not']]).setFontWeight('bold');
    k.getRange(2, 1, 3, 3).setValues([['Feyzul', ad.E, ''], ['Bedirhan', ad.E, ''], ['Nurullah', ad.E, '']]);
    k.setFrozenRows(1);
    k.getRange('B2:B300').setDataValidation(subeListesi);
  }
  let g = ayar.getSheetByName(SA.GECICI_SHEET);
  if (!g) {
    g = ayar.insertSheet(SA.GECICI_SHEET);
    g.getRange(1, 1, 1, 6).setValues([['İş Günü', 'Başlangıç', 'Bitiş', 'Kurye', 'Çalıştığı Şube', 'Not']]).setFontWeight('bold');
    g.setFrozenRows(1);
    g.getRange('A2:A2000').setNumberFormat('dd.MM.yyyy');
    g.getRange('B2:C2000').setNumberFormat('@');          // saat metin olarak: "19:00"
    g.getRange('E2:E2000').setDataValidation(subeListesi);
  }

  const sh = dataSheet_();
  saKolonlar_(sh);
  saSekme_(SA.RAPOR_SHEET, SA_RAPOR_BASLIK);
  saSekme_(SA.PAS_SHEET, SA_PAS_BASLIK);

  ScriptApp.getProjectTriggers()
    .filter(t => ['subeAtamaGuncelle', 'gunlukSubeRaporu', 'subeDuzenlemeYakala'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('subeAtamaGuncelle').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('gunlukSubeRaporu').timeBased().atHour(4).nearMinute(30).everyDays(1).create();
  ScriptApp.newTrigger('subeDuzenlemeYakala').forSpreadsheet(sh.getParent()).onEdit().create();
  Logger.log('Şube atama kuruldu. Kurye_Sube sekmesine tüm kuryeleri ekle (ayar tablosu), sonra subeAtamaGeriye(30) çalıştır.');
}

// ============================================================
// SAATLİK GÜNCELLEME
// ============================================================
function subeAtamaGuncelle() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('Kilit alınamadı, sonraki turda.'); return; }
  try { saGuncelle_(SA.GERI_GUN); } finally { lock.releaseLock(); }
}

// Elle: geçmiş siparişleri bugünkü kurye listesine göre yeniden hesaplar ("Elle" satırlara dokunmaz)
function subeAtamaGeriye(gun) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(120000)) { Logger.log('Tur çalışıyor, biraz sonra tekrar dene.'); return; }
  try { saGuncelle_(typeof gun === 'number' ? gun : 30); } finally { lock.releaseLock(); }
}

function saGuncelle_(geriGun) {
  const sh = dataSheet_();
  const kol = saKolonlar_(sh);
  const son = sh.getLastRow();
  const bas = saBaslangicSatiri_(sh, Date.now() - geriGun * 86400e3);
  if (bas > son) return;
  const genislik = Math.max(kol.v, kol.k, C.NOT);
  const rows = sh.getRange(bas, 1, son - bas + 1, genislik).getValues();
  const ctx = saBaglam_();
  let degisen = 0;
  rows.forEach((r, i) => {
    if (String(r[C.DURUM - 1] || '') !== CONFIG.DURUM.KAPALI) return;
    if (String(r[kol.k - 1] || '').trim() === SA.ELLE) return;
    const s = saHesapla_(r, ctx);
    if (!s.sube) s.sube = String(r[C.CIKAN_SUBE - 1] || '');     // belirsiz: mevcut değeri koru
    const rowNo = bas + i;
    if (String(r[C.CIKAN_SUBE - 1] || '') !== s.sube) sh.getRange(rowNo, C.CIKAN_SUBE).setValue(s.sube);
    if (String(r[kol.v - 1] || '') !== s.varsayilan) sh.getRange(rowNo, kol.v).setValue(s.varsayilan);
    if (String(r[kol.k - 1] || '') !== s.kaynak) sh.getRange(rowNo, kol.k).setValue(s.kaynak);
    if (String(r[C.CIKAN_SUBE - 1] || '') !== s.sube || String(r[kol.k - 1] || '') !== s.kaynak) degisen++;
  });
  Logger.log(`Şube atama: ${rows.length} satır tarandı, ${degisen} satır güncellendi.`);
}

// Tek siparişin çıkış şubesi → { varsayilan, sube, kaynak, kuryeDurum }
function saHesapla_(r, ctx) {
  const ad = ctx.ad;
  const t = r[C.SIPARIS_TARIHI - 1];
  const tip = nrm_(r[C.ORDER_TYPE - 1]);
  if (tip.indexOf('paket') < 0) {
    const s = saSube_(r[C.SUBE - 1], ad);
    return { varsayilan: s, sube: s, kaynak: 'Masa/Gel-Al', kuryeDurum: '' };
  }
  if (!(t instanceof Date)) return { varsayilan: '', sube: '', kaynak: 'Belirsiz', kuryeDurum: '' };

  const kurye = String(r[C.KURYE - 1] || '').trim();
  const ks = kurye ? saKuryeSube_(kurye, ctx.kuryeler) : '';
  const kuryeDurum = !kurye ? 'yok' : (ks === null ? 'tanımsız' : (ks === 'Platform' ? 'platform' : 'tanımlı'));

  if (!saErenkoyAcik_(t)) return { varsayilan: ad.F, sube: ad.F, kaynak: 'Saat', kuryeDurum };

  const varsayilan = ctx.mahalle[nrm_(r[C.BOLGE - 1])] || '';
  const tn = ' ' + nrm_(kurye) + ' ';
  const gec = kurye && ctx.geciciler.find(g => tn.indexOf(' ' + g.ad) >= 0 && t.getTime() >= g.bas && t.getTime() < g.bit);
  if (gec) return { varsayilan, sube: gec.sube, kaynak: gec.sube === varsayilan ? 'Mahalle' : 'Kurye (geçici görev)', kuryeDurum };
  if (ks === ad.E || ks === ad.F) {
    if (!varsayilan) return { varsayilan, sube: ks, kaynak: 'Kurye', kuryeDurum };
    return { varsayilan, sube: ks, kaynak: ks === varsayilan ? 'Mahalle' : 'Kurye (pas)', kuryeDurum };
  }
  if (varsayilan) return { varsayilan, sube: varsayilan, kaynak: 'Mahalle', kuryeDurum };
  return { varsayilan: '', sube: '', kaynak: 'Belirsiz', kuryeDurum };
}

// G sütunu elle değişince Çıkış Kaynağı = "Elle" (boşaltılırsa otomatiğe geri döner)
function subeDuzenlemeYakala(e) {
  try {
    const rg = e && e.range;
    if (!rg) return;
    const sh = rg.getSheet();
    if (sh.getName() !== CONFIG.DATA_SHEET || rg.getLastRow() < 2) return;
    if (rg.getColumn() > C.CIKAN_SUBE || rg.getLastColumn() < C.CIKAN_SUBE) return;
    const ilk = Math.max(2, rg.getRow());
    const n = rg.getLastRow() - ilk + 1;
    const kol = saKolonlar_(sh);
    const g = sh.getRange(ilk, C.CIKAN_SUBE, n, 1).getValues();
    sh.getRange(ilk, kol.k, n, 1).setValues(g.map(x => [String(x[0] || '').trim() ? SA.ELLE : '']));
  } catch (err) { Logger.log('subeDuzenlemeYakala: ' + err); }
}

// ============================================================
// GÜNLÜK RAPOR (her gece ~04:30, bir önceki iş günü)
// ============================================================
function gunlukSubeRaporu(e) {
  subeAtamaGuncelle();
  const gun = (typeof e === 'string') ? e : saIsGunu_(new Date(Date.now() - 86400e3));
  saRapor_(gun, SA.BILDIR);
}

// Elle: son N iş gününün raporunu tabloya yazar (bildirim göndermez)
function subeRaporuGeriye(gunSayisi) {
  const n = typeof gunSayisi === 'number' ? gunSayisi : 7;
  for (let i = n; i >= 1; i--) saRapor_(saIsGunu_(new Date(Date.now() - i * 86400e3)), false);
}

function saRapor_(gun, bildir) {
  const sh = dataSheet_();
  const kol = saKolonlar_(sh);
  const son = sh.getLastRow();
  const gunBas = saGunBaslangic_(gun);
  const bas = saBaslangicSatiri_(sh, gunBas.getTime() - 86400e3);
  if (bas > son) { Logger.log(gun + ': sipariş yok.'); return; }
  const rows = sh.getRange(bas, 1, son - bas + 1, Math.max(kol.v, kol.k, C.NOT)).getValues();
  const ctx = saBaglam_();
  const ad = ctx.ad;
  const o = { paketE: 0, ciroE: 0, paketF: 0, ciroF: 0, masaE: 0, masaF: 0, pasEF: 0, pasFE: 0,
    gecici: 0, elle: 0, belirsiz: 0, kuryesiz: 0, mesaiDisi: 0, iptal: 0 };
  const tanimsiz = {};
  const pas = [];

  rows.forEach(r => {
    const t = r[C.SIPARIS_TARIHI - 1];
    if (!(t instanceof Date) || saIsGunu_(t) !== gun) return;
    const durum = String(r[C.DURUM - 1] || '');
    if (durum === CONFIG.DURUM.IPTAL) { o.iptal++; return; }
    if (durum !== CONFIG.DURUM.KAPALI) return;
    const paket = nrm_(r[C.ORDER_TYPE - 1]).indexOf('paket') >= 0;
    const sube = saSube_(r[C.CIKAN_SUBE - 1], ad);
    const tutar = Number(r[C.TUTAR - 1]) || 0;
    const kaynak = String(r[kol.k - 1] || '');
    if (!paket) { if (sube === ad.E) o.masaE++; else if (sube === ad.F) o.masaF++; return; }

    if (sube === ad.E) { o.paketE++; o.ciroE += tutar; }
    else if (sube === ad.F) { o.paketF++; o.ciroF += tutar; }
    if (!saFikirtepeAcik_(t)) o.mesaiDisi++;
    if (kaynak === SA.ELLE) o.elle++;
    if (kaynak === 'Belirsiz' || !sube) o.belirsiz++;
    if (kaynak === 'Kurye (geçici görev)') o.gecici++;

    const kurye = String(r[C.KURYE - 1] || '').trim();
    if (!kurye) o.kuryesiz++;
    else if (saKuryeSube_(kurye, ctx.kuryeler) === null) tanimsiz[kurye] = (tanimsiz[kurye] || 0) + 1;

    const vars = saSube_(r[kol.v - 1], ad);
    if (vars && sube && vars !== sube) {
      if (vars === ad.E) o.pasEF++; else o.pasFE++;
      pas.push([gun, Utilities.formatDate(t, 'Europe/Istanbul', 'HH:mm'), r[C.ORDER_NO - 1], String(r[C.ID - 1]),
        r[C.EXT_APP - 1], r[C.BOLGE - 1], vars, sube, kurye, kaynak, tutar]);
    }
  });

  const tanimsizMetin = Object.keys(tanimsiz).sort((a, b) => tanimsiz[b] - tanimsiz[a]).map(k => `${k} (${tanimsiz[k]})`).join(', ');
  const ozet = [gun, o.paketE, Math.round(o.ciroE), o.paketF, Math.round(o.ciroF), o.masaE, o.masaF, o.pasEF, o.pasFE,
    o.gecici, o.elle, o.belirsiz, o.kuryesiz, tanimsizMetin, o.mesaiDisi, o.iptal, new Date()];
  saGunuYaz_(saSekme_(SA.RAPOR_SHEET, SA_RAPOR_BASLIK), gun, [ozet]);
  saGunuYaz_(saSekme_(SA.PAS_SHEET, SA_PAS_BASLIK), gun, pas);
  Logger.log(`${gun}: Erenköy ${o.paketE} paket, Fikirtepe ${o.paketF} paket, pas ${o.pasEF}+${o.pasFE}.`);

  if (!bildir) return;
  const g = saGunBaslangic_(gun);
  const satirlar = [
    `🏪 Şube raporu – ${Utilities.formatDate(g, 'Europe/Istanbul', 'dd.MM.yyyy')} ${SA_GUNLER[g.getDay()]}`,
    `${ad.E}: ${o.paketE} paket · ${saTL_(o.ciroE)} TL` + (o.masaE ? ` (+${o.masaE} masa/gel-al)` : ''),
    `${ad.F}: ${o.paketF} paket · ${saTL_(o.ciroF)} TL` + (o.masaF ? ` (+${o.masaF} masa/gel-al)` : ''),
    `🔁 Pas: ${ad.E}→${ad.F} ${o.pasEF} · ${ad.F}→${ad.E} ${o.pasFE}`,
  ];
  if (o.gecici || o.elle) satirlar.push(`👤 Geçici görev: ${o.gecici} · ✍️ Elle: ${o.elle}`);
  if (tanimsizMetin) satirlar.push(`❓ Tanımsız kurye: ${tanimsizMetin} → ayar tablosunda ${SA.KURYE_SHEET}'ye ekle`);
  if (o.belirsiz) satirlar.push(`⚠️ Şubesi belirlenemeyen paket: ${o.belirsiz}`);
  if (o.mesaiDisi) satirlar.push(`🌙 Mesai dışı saatte paket: ${o.mesaiDisi}`);
  if (o.iptal) satirlar.push(`❌ İptal: ${o.iptal}`);
  if (pas.length) satirlar.push(`Detay: "${SA.PAS_SHEET}" sekmesi`);
  bildir_(`🏪 Şube raporu – ${gun}`, satirlar.join('\n'));
}

// ============================================================
// YARDIMCILAR
// ============================================================
function saBaglam_() {
  const ad = saAdlar_();
  const mahalle = {};
  mahalleListesi_().forEach(m => {
    const s = saSube_(m.sube, ad);
    if (!s) return;
    mahalle[nrm_(m.tamAd)] = s;
    if (!mahalle[m.n]) mahalle[m.n] = s;
  });
  return { ad, mahalle, kuryeler: saKuryeler_(ad), geciciler: saGeciciler_(ad) };
}

// Şube adlarını Mahalle_Sube'deki yazımdan al (G sütunu eski kayıtlarla aynı kalsın)
function saAdlar_() {
  const ad = { E: SA.ERENKOY, F: SA.FIKIRTEPE };
  mahalleListesi_().forEach(m => {
    const n = nrm_(m.sube);
    if (n.indexOf('erenkoy') >= 0) ad.E = m.sube;
    else if (n.indexOf('fikirtepe') >= 0) ad.F = m.sube;
  });
  return ad;
}

function saSube_(x, ad) {
  const t = nrm_(x);
  if (t.indexOf('erenkoy') >= 0) return ad.E;
  if (t.indexOf('fikirtepe') >= 0) return ad.F;
  if (t.indexOf('platform') >= 0) return 'Platform';
  return '';
}

function saKuryeler_(ad) {
  const sh = SpreadsheetApp.openById(CONFIG.AYAR_SS_ID).getSheetByName(SA.KURYE_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
    .map(r => ({ ad: nrm_(r[0]), sube: saSube_(r[1], ad) }))
    .filter(x => x.ad && x.sube)
    .sort((a, b) => b.ad.length - a.ad.length);
}

// Kuryenin şubesi; listede yoksa null. Listedeki ad, Adisyo'daki adın bir kelimesinin başıyla tutmalı.
function saKuryeSube_(kurye, liste) {
  const t = ' ' + nrm_(kurye) + ' ';
  const hit = liste.find(x => t.indexOf(' ' + x.ad) >= 0);
  return hit ? hit.sube : null;
}

function saGeciciler_(ad) {
  const sh = SpreadsheetApp.openById(CONFIG.AYAR_SS_ID).getSheetByName(SA.GECICI_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const n = sh.getLastRow() - 1;
  const v = sh.getRange(2, 1, n, 5).getValues();
  const d = sh.getRange(2, 1, n, 5).getDisplayValues();     // saatleri ekranda göründüğü gibi oku
  const out = [];
  v.forEach((r, i) => {
    const gun = r[0];
    const kurye = nrm_(r[3]);
    const sube = saSube_(r[4], ad);
    if (!(gun instanceof Date) || !kurye || !sube) return;
    const g0 = new Date(gun.getFullYear(), gun.getMonth(), gun.getDate()).getTime();
    let bDk = saDakika_(d[i][1]), sDk = saDakika_(d[i][2]);
    if (bDk === null) bDk = SA.GUN_DONUMU * 60;
    if (sDk === null) sDk = SA.GUN_DONUMU * 60 + 1440;
    if (bDk < SA.GUN_DONUMU * 60) { bDk += 1440; if (sDk < SA.GUN_DONUMU * 60) sDk += 1440; }  // 00:30–02:00 → gece yarısından sonra
    if (sDk <= bDk) sDk += 1440;                                                              // 22:00–01:30
    out.push({ ad: kurye, sube, bas: g0 + bDk * 60000, bit: g0 + sDk * 60000 });
  });
  return out;
}

function saDakika_(s) {
  const m = String(s || '').match(/(\d{1,2})[:.](\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function saErenkoyAcik_(t) {
  const h = t.getHours();
  return h >= SA.ERENKOY_ACILIS && h < SA.ERENKOY_KAPANIS;
}

function saFikirtepeAcik_(t) {
  const g = saGunBaslangic_(saIsGunu_(t));
  const dk = (t.getTime() - g.getTime()) / 60000;
  const kapanis = (g.getDay() === 5 || g.getDay() === 6) ? SA.FIKIRTEPE_KAPANIS_CUMA_CMT : SA.FIKIRTEPE_KAPANIS;
  return dk >= SA.FIKIRTEPE_ACILIS * 60 && dk < kapanis * 60;
}

// Siparişin iş günü 'yyyy-MM-dd' (04:00'ten önceki sipariş önceki güne)
function saIsGunu_(t) {
  return Utilities.formatDate(new Date(t.getTime() - SA.GUN_DONUMU * 3600e3), 'Europe/Istanbul', 'yyyy-MM-dd');
}
function saGunBaslangic_(gun) {
  const p = gun.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

// Sipariş tarihi `sinirMs`'den yeni olan ilk satır (alttan yukarı tarar)
function saBaslangicSatiri_(sh, sinirMs) {
  const son = sh.getLastRow();
  if (son < 2) return 2;
  const t = sh.getRange(2, C.SIPARIS_TARIHI, son - 1, 1).getValues();
  let bas = son + 1;
  for (let i = t.length - 1; i >= 0; i--) {
    const d = t[i][0];
    if (d instanceof Date && d.getTime() < sinirMs) break;
    bas = i + 2;
  }
  return bas;
}

// "Varsayılan Şube" ve "Çıkış Kaynağı" sütunlarını başlıktan bulur, yoksa sona ekler
function saKolonlar_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), SON_KOLON);
  const bas = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(nrm_);
  let v = bas.indexOf(nrm_(SA.KOL_VARSAYILAN)) + 1;
  let k = bas.indexOf(nrm_(SA.KOL_KAYNAK)) + 1;
  let son = lastCol;
  const ekle = (ad) => {
    son++;
    if (sh.getMaxColumns() < son) sh.insertColumnsAfter(sh.getMaxColumns(), son - sh.getMaxColumns());
    sh.getRange(1, son).setValue(ad).setFontWeight('bold');
    return son;
  };
  if (!v) v = ekle(SA.KOL_VARSAYILAN);
  if (!k) k = ekle(SA.KOL_KAYNAK);
  return { v, k };
}

function saSekme_(ad, baslik) {
  const ss = dataSheet_().getParent();
  let sh = ss.getSheetByName(ad);
  if (!sh) {
    sh = ss.insertSheet(ad);
    sh.getRange(1, 1, 1, baslik.length).setValues([baslik]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Sekmede o iş gününe ait satırları silip yenilerini yazar (rapor tekrar çalıştırılabilir)
function saGunuYaz_(sh, gun, yeni) {
  const son = sh.getLastRow();
  if (son >= 2) {
    const genislik = sh.getLastColumn();
    const eski = sh.getRange(2, 1, son - 1, genislik).getValues();
    const kalan = eski.filter(r => saGunMetni_(r[0]) !== gun);
    if (kalan.length !== eski.length) {
      sh.getRange(2, 1, son - 1, genislik).clearContent();
      if (kalan.length) sh.getRange(2, 1, kalan.length, genislik).setValues(kalan);
    }
  }
  if (!yeni.length) return;
  const ilk = sh.getLastRow() + 1;
  sh.getRange(ilk, 1, yeni.length, 1).setNumberFormat('@');     // önce metin biçimi: tarih yazısı Date'e dönmesin
  sh.getRange(ilk, 1, yeni.length, yeni[0].length).setValues(yeni);
  if (sh.getLastRow() > 2) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).sort(1);
}

function saGunMetni_(x) {
  return (x instanceof Date) ? Utilities.formatDate(x, 'Europe/Istanbul', 'yyyy-MM-dd') : String(x || '').trim();
}

function saTL_(x) {
  return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Elle test: son 2 günün kapalı paketlerinde kurallar ne diyor (yazmaz)
function subeAtamaTest() {
  const sh = dataSheet_();
  const kol = saKolonlar_(sh);
  const son = sh.getLastRow();
  const bas = Math.max(2, son - 40);
  const ctx = saBaglam_();
  Logger.log('Şube adları: ' + JSON.stringify(ctx.ad) + ' | kurye: ' + ctx.kuryeler.length + ' | geçici: ' + ctx.geciciler.length);
  sh.getRange(bas, 1, son - bas + 1, Math.max(kol.v, kol.k, C.NOT)).getValues().forEach(r => {
    if (String(r[C.DURUM - 1]) !== CONFIG.DURUM.KAPALI) return;
    const s = saHesapla_(r, ctx);
    Logger.log(`#${r[C.ORDER_NO - 1]} ${r[C.SIPARIS_TARIHI - 1] instanceof Date ? Utilities.formatDate(r[C.SIPARIS_TARIHI - 1], 'Europe/Istanbul', 'HH:mm') : ''} ` +
      `${r[C.BOLGE - 1]} | kurye: ${r[C.KURYE - 1] || '-'} (${s.kuryeDurum}) → ${s.sube || '?'} [${s.kaynak}]` +
      (r[C.CIKAN_SUBE - 1] !== s.sube ? `  (şu an: ${r[C.CIKAN_SUBE - 1]})` : ''));
  });
}
