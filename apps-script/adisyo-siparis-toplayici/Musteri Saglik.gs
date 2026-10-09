/*** BAP – MÜŞTERİ VERİTABANI SAĞLIK RAPORU (yalnız okur) ***
 *
 * Birlesik Musteri Veritabani'nı ve sipariş tablosunu okur, HİÇBİR YERE YAZMAZ.
 * Sonucu Günlük'e (Çalıştırma günlüğü) yazar. Elle çalıştır: musteriSaglikRaporu()
 *
 * Neye bakar (bulgular: docs/kontrol-listesi.md › MU):
 *   - Ana Musteri Listesi: boş / bozuk telefon, aynı telefonun birden çok satırı (MU2),
 *     kısaltılmış isim ("ATA K.") ve siparişlerde aynı telefonla gelen tam isim (MU1)
 *   - Telefonsuz (Getir-Trendyol): aynı adres anahtarı, anahtar iyileşince birleşecek satırlar (MU3)
 *   - "Ana Musteri - Canli": ikinci ana liste olarak duruyor mu (MU4)
 *
 * Tablolar başlık adıyla okunur; başlık bulunamazsa rapor bunu söyler.
 */

const MS_SIPARIS_SATIR = 40000;     // sipariş tablosunun son kaç satırına bakılsın
const MS_ORNEK = 8;                 // her bulgu için günlüğe kaç örnek yazılsın

function musteriSaglikRaporu() {
  const basla = Date.now();
  const ss = SpreadsheetApp.openById(CONFIG.MUSTERI_SS_ID);
  const satirlar = [];
  const yaz = s => satirlar.push(s);

  // ---------- 1) Ana Musteri Listesi ----------
  const ana = msSekmeOku_(ss, CONFIG.MUSTERI_SHEET);
  const aTel = msSutun_(ana, ['Telefon']);
  const aIsim = msSutun_(ana, ['Isim', 'İsim']);
  const aMah = msSutun_(ana, ['Mahalle']);
  const aSay = msSutun_(ana, ['Adisyo Siparis Sayisi', 'Sipariş sayısı']);
  yaz('== ANA MUSTERI LISTESI: ' + ana.veri.length + ' satır ==');
  if (aTel < 0 || aIsim < 0) { yaz('Telefon / Isim başlığı bulunamadı: ' + ana.baslik.join(' | ')); return msBitir_(satirlar, basla); }

  const telSatir = {};                       // tel → [satır no]
  let bos = 0, bozuk = 0, mahBos = 0, kisa = 0, sayiBos = 0;
  const bozukOrnek = [], kisaTel = {};
  ana.veri.forEach((r, i) => {
    const ham = String(r[aTel] || '').trim();
    if (!ham) { bos++; return; }
    const tel = son10_(ham);
    if (!tel || !/^5\d{9}$/.test(tel)) { bozuk++; if (bozukOrnek.length < MS_ORNEK) bozukOrnek.push(ham); }
    if (tel) (telSatir[tel] = telSatir[tel] || []).push(i + 2);
    if (aMah >= 0 && !String(r[aMah] || '').trim()) mahBos++;
    if (aSay >= 0 && String(r[aSay] || '') === '') sayiBos++;
    if (msKisaIsim_(r[aIsim])) { kisa++; if (tel) kisaTel[tel] = String(r[aIsim]); }
  });
  const ciftler = Object.keys(telSatir).filter(t => telSatir[t].length > 1);
  yaz('Telefonu boş: ' + bos);
  yaz('Cep telefonu biçiminde olmayan (5xx xxx xx xx değil): ' + bozuk + (bozukOrnek.length ? '  örn: ' + bozukOrnek.join(', ') : ''));
  yaz('Aynı telefon birden çok satırda: ' + ciftler.length + ' telefon, ' +
      ciftler.reduce((s, t) => s + telSatir[t].length - 1, 0) + ' fazla satır' +
      (ciftler.length ? '  örn satırlar: ' + ciftler.slice(0, MS_ORNEK).map(t => telSatir[t].join('+')).join(', ') : ''));
  yaz('Mahallesi boş: ' + mahBos + ' | Sipariş sayısı boş: ' + sayiBos);
  yaz('Kısaltılmış isim ("ATA K." gibi): ' + kisa);

  // ---------- 2) Siparişlerde aynı telefonla gelen tam isim ----------
  const sh = dataSheet_();
  const son = sh.getLastRow();
  const bas = Math.max(2, son - MS_SIPARIS_SATIR + 1);
  const n = son - bas + 1;
  if (n > 0) {
    const telS = sh.getRange(bas, C.TELEFON, n, 1).getValues();
    const isimS = sh.getRange(bas, C.MUSTERI, n, 1).getValues();
    const tamIsim = {};                      // tel → siparişlerdeki en uzun tam isim
    for (let i = 0; i < n; i++) {
      const tel = son10_(telS[i][0]);
      if (!tel || !kisaTel[tel]) continue;
      const isim = String(isimS[i][0] || '').trim();
      if (isim && !msKisaIsim_(isim) && msAyniKisi_(kisaTel[tel], isim) &&
          isim.length > String(tamIsim[tel] || '').length) tamIsim[tel] = isim;
    }
    const bulunan = Object.keys(tamIsim);
    yaz('Kısaltılmış isimlilerden siparişlerde tam ismi gelen: ' + bulunan.length + ' (son ' + n + ' sipariş satırına bakıldı)' +
        (bulunan.length ? '  örn: ' + bulunan.slice(0, MS_ORNEK).map(t => '"' + kisaTel[t] + '" → "' + tamIsim[t] + '"').join(', ') : ''));
  }

  // ---------- 3) Telefonsuz (Getir-Trendyol) ----------
  const tz = msSekmeOku_(ss, TZ_TELEFONSUZ);
  const tAdr = msSutun_(tz, ['Adres']);
  const tAnh = msSutun_(tz, ['Adres Anahtari', 'Adres Anahtarı']);
  const tIsim = msSutun_(tz, ['Isim', 'İsim']);
  yaz('== TELEFONSUZ (GETIR-TRENDYOL): ' + tz.veri.length + ' satır ==');
  if (tAdr >= 0) {
    const eski = {}, yeni = {};
    tz.veri.forEach((r, i) => {
      const e = (tAnh >= 0 && String(r[tAnh] || '')) || tzAnahtar_(r[tAdr]);
      const y = msYeniAnahtar_(r[tAdr]);
      if (e) (eski[e] = eski[e] || []).push(i + 2);
      if (y) (yeni[y] = yeni[y] || []).push(i);
    });
    const eskiCift = Object.keys(eski).filter(k => eski[k].length > 1);
    const yeniGrup = Object.keys(yeni).filter(k => yeni[k].length > 1);
    yaz('Şu anki anahtarla aynı adres birden çok satırda: ' + eskiCift.length);
    yaz('Daha sıkı anahtarla (sokak + numaralar, posta kodu / "bina" / "floor" atılınca) birleşecek grup: ' +
        yeniGrup.length + ', fazla satır: ' + yeniGrup.reduce((s, k) => s + yeni[k].length - 1, 0));
    yeniGrup.slice(0, MS_ORNEK).forEach(k => {
      yaz('   ' + yeni[k].map(i => 'satır ' + (i + 2) + ' "' + (tIsim >= 0 ? tz.veri[i][tIsim] : '') + '"').join('  +  ') + '   [' + k + ']');
    });
  } else yaz('Adres başlığı bulunamadı: ' + tz.baslik.join(' | '));

  // ---------- 4) İkinci ana liste ----------
  const canli = ss.getSheetByName('Ana Musteri - Canli');
  if (canli) {
    const dolu = canli.getRange(1, 1, canli.getLastRow(), 1).getValues().filter(r => String(r[0]).trim()).length - 1;
    yaz('== "Ana Musteri - Canli" sekmesi duruyor: ' + dolu + ' dolu satır. Bu depoda ona yazan kod yok (MU4) ==');
  }

  return msBitir_(satirlar, basla);
}

function msBitir_(satirlar, basla) {
  satirlar.push('Süre: ' + Math.round((Date.now() - basla) / 1000) + ' sn. Tabloya hiçbir şey yazılmadı.');
  Logger.log(satirlar.join('\n'));
  return satirlar;
}

function msSekmeOku_(ss, ad) {
  const sh = ss.getSheetByName(ad);
  if (!sh || sh.getLastRow() < 1) return { baslik: [], veri: [] };
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  return { baslik: v[0].map(x => String(x).trim()), veri: v.slice(1) };
}

function msSutun_(tablo, adlar) {
  const b = tablo.baslik.map(nrm_);
  for (const a of adlar) { const i = b.indexOf(nrm_(a)); if (i >= 0) return i; }
  return -1;
}

// "ATA K." / "Meryem C" → soyadı tek harf
function msKisaIsim_(isim) {
  return /^\S+(\s+\S+)*\s+\S\.?$/.test(String(isim || '').trim());
}

// "ATA K." ile "ATA KILIÇ" aynı kişi mi: ilk kelime aynı, soyadı aynı harfle başlıyor
function msAyniKisi_(kisa, tam) {
  const k = nrm_(kisa).replace(/\./g, '').split(' '), t = nrm_(tam).split(' ');
  return k.length >= 2 && t.length >= 2 && k[0] === t[0] && t[t.length - 1].charAt(0) === k[k.length - 1].charAt(0);
}

// Telefonsuz için önerilen anahtar: İ harfi bozulmadan, posta kodu ve dolgu kelimeleri atılmış,
// tekrar eden kelime/numara bir kez. tzAnahtar_ bu rapora göre onaylanınca bununla değiştirilecek (MU3).
function msYeniAnahtar_(adres) {
  const a = tzAnahtar_(String(adres || '').replace(/İ/g, 'i'));
  if (!a) return '';
  const at = /^(bina|floor|flat|building|apartment|kapi|numara|sitesi|site|blok|34\d{3})$/;
  const goruldu = {};
  const k = a.split(' ').filter(w => w && !at.test(w) && !goruldu[w] && (goruldu[w] = true));
  const s = k.join(' ');
  return s.length >= 8 ? s : '';
}
