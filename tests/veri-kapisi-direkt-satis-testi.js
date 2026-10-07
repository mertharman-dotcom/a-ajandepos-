// Kullanım: node tests/veri-kapisi-direkt-satis-testi.js
// Panel maliyet hesabı: içecekler (Direktsatisurunler) satış adıyla eşleşmeli, reçete istememeli (M16).
// Satırlar stok dosyasındaki gerçek Direktsatisurunler sekmesinden (07.10), satış adları paneldeki listeden.
const fs = require('fs'), vm = require('vm'), path = require('path');

const B = ['Direktsatisurunler_ID', 'Hammadde_Adı', 'Hammadde', 'Tedarikçi', 'Tedarikçi Sipariş Aktif', 'Sipariş paket durumu',
  'Kategori', 'Birim', 'Ölçü_Birimi', 'Son Alış Fiyatı', 'Mevcut_Stok', 'Min_Stok_Uyarı', 'Son_Güncelleme', 'Ürün kategori ', 'Stok_Takip', 'Koli_Icerik'];
const s = (tam, kisa, aktif, koli, fiyat) => ['', tam, kisa, 'Global içecek', aktif, 'Koli', 'İçecek', 'adet', koli, fiyat];
const DS = [B,
  s('CCZS 1X24 330 ML FIFA26', 'Cola Zero', 'TRUE', '24', '1710,24'),
  s('COCA-COLA KUTU330ML1X24 FIFA26', 'Coca Cola', 'TRUE', '24', '1710,24'),
  s('DAM MN.OWB 330ML YESIL SISE DYS', 'Damla Sade Soda', 'TRUE', '12', '481,08'),
  s('DAMLA SU OWB 330ML YENI SIS DYS', 'Damla Su', 'TRUE', '12', '467,16'),
  s('FT LIMON KUTU 330ML RMX2 DYS', 'Fuse Tea Limon', 'TRUE', '12', '855,12'),
  s('FT SEFT HIBISKUS CAN330ML 1X12', 'Fuse Tea Şeftali', 'TRUE', '12', '855,12'),
  s('SCH.MAND.OWB250ML 1X24VIS24', 'Schweppes Mandalina', 'TRUE', '24', '1725,12'),
  s('SPR KUTU330ML 1X24 2022 DYS', 'Sprite', 'TRUE', '24', '1710,24'),
  s('SANPELLEGRINOMNRL SU200ML', 'San Pellegrino Soda', 'TRUE', '', '90'),
  s('SUSURLUK 20Lİ 245 GR ŞİŞE AYRAN', 'Susurluk Ayran', 'TRUE', '20', '524,76')];

function kur(eslestirme) {
  const sekmeler = { Direktsatisurunler: DS, Maliyet_Eslestirme: [['Satış adı', 'Reçete adı']].concat(eslestirme || []) };
  const sheet = (ad) => ({ getName: () => ad, getLastRow: () => sekmeler[ad].length, getDataRange: () => ({ getValues: () => sekmeler[ad] }) });
  const ctx = vm.createContext({ console, SpreadsheetApp: { openById: () => ({
    getSheetByName: ad => sekmeler[ad] ? sheet(ad) : null, getSheets: () => Object.keys(sekmeler).map(sheet) }) } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/bap-panel-veri-kapisi/Kod.gs'), 'utf8'), ctx);
  vm.runInContext('var T = maliyetTanimlari_();', ctx);
  return ad => vm.runInContext('(function(a){var m=urunAc_(T,a,"");return {b:m.bulundu,ad:m.ad,t:m.kalemler.length?m.kalemler[0].tutar:0};})', ctx)(ad);
}

const ac = kur(), kontrol = [];
const bekle = (satis, ad, adetFiyat) => {
  const m = ac(satis);
  kontrol.push([satis + ' → ' + ad, m.b && m.ad === ad && Math.abs(m.t - adetFiyat) < 0.01, m]);
};
bekle('Coca-Cola 33 cl.', 'Coca Cola', 71.26);
bekle('Susurluk Ayranı 24.5 cl.', 'Susurluk Ayran', 26.238);
bekle('Sprite 33 cl.', 'Sprite', 71.26);
bekle('Damla Su 33 cl.', 'Damla Su', 38.93);
bekle('Damla Sade Soda 33 cl.', 'Damla Sade Soda', 40.09);
bekle('Fuse Tea Şeftali 33 cl.', 'Fuse Tea Şeftali', 71.26);
bekle('Fuse Tea Limon 33 cl.', 'Fuse Tea Limon', 71.26);
bekle('Schweppes Mandalina 25 cl.', 'Schweppes Mandalina', 71.88);
bekle('San Pellegrino Soda 25 cl.', 'San Pellegrino Soda', 90);
// "Şekersiz" adı tabloda yok: eşleştirme satırı olmadan Coca Cola'ya düşer (fiyat aynı), satırla Cola Zero olur.
const zero = kur([['Coca-Cola Şekersiz 33 cl.', 'Cola Zero']])('Coca-Cola Şekersiz 33 cl.');
kontrol.push(['Maliyet_Eslestirme ile Coca-Cola Şekersiz → Cola Zero', zero.b && zero.ad === 'Cola Zero', zero]);
const yemek = ac('Şeftali Stracciatella Salata');
kontrol.push(['reçetesiz yemek içeceğe bağlanmaz', !yemek.b, yemek]);

kontrol.forEach(([ad, ok, m]) => console.log((ok ? 'TAMAM ' : 'HATA  ') + ad + (ok ? '' : '  ' + JSON.stringify(m))));
if (kontrol.some(k => !k[1])) process.exit(1);
