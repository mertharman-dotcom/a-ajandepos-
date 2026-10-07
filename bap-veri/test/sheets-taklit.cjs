// Apps Script Spreadsheet API'sinin aktarım için gereken kadarı (bellekte). hataEnjekte ile belli bir yazımda hata fırlatılır.
function ssOlustur(baslangic) {
  const sheets = {};
  let hata = null;
  function sheet(ad, satirlar) {
    const data = satirlar.map(r => r.slice());
    const pad = (r, c) => { while (data.length < r) data.push([]); const row = data[r - 1]; while (row.length < c) row.push(''); };
    const kontrol = (islem) => { if (hata && hata(ad, islem)) throw new Error('ENJEKTE: ' + ad + ' ' + islem); };
    return {
      _data: data, getName: () => ad, getLastRow: () => data.length,
      getRange: (r, c, nr = 1, nc = 1) => ({
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (data[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
        setValues: vs => { kontrol('setValues'); vs.forEach((row, i) => row.forEach((v, j) => { pad(r + i, c + j); data[r - 1 + i][c - 1 + j] = v; })); },
        setValue: v => { kontrol('setValue'); pad(r, c); data[r - 1][c - 1] = v; },
      }),
      appendRow: row => { kontrol('appendRow'); data.push(row.slice()); },
    };
  }
  Object.keys(baslangic).forEach(ad => { sheets[ad] = sheet(ad, baslangic[ad]); });
  return {
    getSheetByName: ad => sheets[ad] || null,
    insertSheet: ad => (sheets[ad] = sheet(ad, [])),
    veri: ad => sheets[ad]._data,
    hataEnjekte: f => { hata = f; },
  };
}
function bosStokDosyasi() {
  return ssOlustur({
    Sube_Stok: [['Urun_Adi', 'Tip', 'Sube', 'Mevcut_Stok', 'Teorik_Stok', 'Son_Sayim', 'Son_Sayim_Tarihi', 'Fark', 'Son_Guncelleme'],
      ['Mayonez', 'HM', 'Erenköy', 20000, 20000, '', '', 0, ''], ['PORTAKAL', 'HM', 'Erenköy', 30000, 30000, '', '', 0, ''],
      ['Elma yeşil', 'HM', 'Erenköy', 10000, 10000, '', '', 0, ''], ['Narenciye sos', 'YM', 'Erenköy', 500, 500, '', '', 0, ''],
      ['Un', 'HM', 'Fikirtepe', 50000, 50000, '', '', 0, ''], ['Su', 'HM', 'Fikirtepe', 0, 0, '', '', 0, ''],
      ['Pizza Hamuru', 'YM', 'Fikirtepe', 10, 10, '', '', 0, '']],
    Stok_Hareketleri: [['Tarih', 'Sube', 'Malzeme', 'Hareket_Turu', 'Eski_Stok', 'Yeni_Stok', 'Birim', 'Karsiligi', 'Detay', 'Sorumlu']],
    Uretim_Girisleri: [['Tarih', 'Sube', 'YariMamul', 'Kat', 'ToplamMiktar', 'CiktiTipi', 'PorsiyonAdet', 'Calisan', 'Not', 'Zaman', 'DB_Islem_ID']],
    Zayi_Girisleri: [['Tarih', 'Sube', 'Tip', 'Urun', 'Miktar', 'Birim', 'Sebep', 'Sorumlu', 'Aciklama', 'Calisan', 'Zaman', 'DB_Islem_ID']],
    Sayim_Girisleri: [['Tarih', 'Sube', 'Urun_Adi', 'Tip', 'Sayim_Miktar', 'Teorik_Miktar', 'Fark', 'Calisan', 'DB_Islem_ID']],
  });
}
module.exports = { ssOlustur, bosStokDosyasi };
