// Kullanım: node tests/veri-kapisi-maliyet-testi.js
// Panel maliyet hesabı (BAP Panel Veri Kapısı › bilesen_): ölçü birimi boş ya da reçeteyle uyuşmayan
// hammadde paket fiyatıyla çarpılmamalı (02.10: Barilla 2 kg satırında H/I boştu, penne porsiyonu 14.000 TL çıkıyordu).
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/bap-panel-veri-kapisi/Kod.gs'), 'utf8'), ctx);

// Tbl_Hammaddeler: A ID, B tam ad, C kısa ad, D ted, E aktif, F paket, G kategori, H içerik, I ölçü, J fiyat
const satir = (tam, kisa, h, i, j) => ['', tam, kisa, '', true, '', '', h, i, j];
ctx.SATIRLAR = [['başlık'],
  satir('BARILLA MAKARNA2KG', 'Penne', '', '', 168.22),          // H/I boş: hatalı satır
  satir('PENNE RİGATE 500 GR', 'Penne Liguori', 500, 'gr.', 100),
  satir('MAYDANOZ', 'Maydonoz', 1, 'adet', 18),
  satir('KAPARİ 190 CC', 'Kapari', 190, 'cc', 49),
  satir('EKŞİ MAYALI EKMEK', 'Ekmek', '', '', 96.53)];         // birimsiz ama adetle kullanılıyor: eskisi gibi
const sonuc = vm.runInContext(`
  var T = { hm: {}, ym: {}, ds: {}, mal: {}, eksik: {} };
  fiyatTablosu_(SATIRLAR, T.hm);
  ({ penne: bilesen_(T, 'Penne', 500, 'gr.', '', 0, 'Penne Pesto').tutar,
     liguori: bilesen_(T, 'Penne Liguori', 500, 'gr.', '', 0, 'Penne Pesto').tutar,
     maydanoz: bilesen_(T, 'Maydonoz', 15, 'gr.', '', 0, 'Tabule').tutar,
     kapari: bilesen_(T, 'Kapari', 130, 'gr.', '', 0, 'Cesar sos').tutar,
     ekmek: bilesen_(T, 'Ekmek', 1, 'adet', '', 0, 'Sandviç').tutar,
     eksik: Object.keys(T.eksik).map(function (k) { return T.eksik[k].ad; }) })`, ctx);

const kontrol = [
  ['H/I boş satır paket fiyatıyla çarpılmaz', sonuc.penne === 0],
  ['eksik listesinde görünür', sonuc.eksik.some(a => /Penne.*ölçü birimi boş/.test(a))],
  ['dolu satır doğru hesaplanır (500 gr = 100 TL)', Math.abs(sonuc.liguori - 100) < 1e-9],
  ['gr ↔ adet uyuşmazlığı 0 + uyarı', sonuc.maydanoz === 0 && sonuc.eksik.some(a => /Maydonoz.*uyuşmuyor/.test(a))],
  ['cc, ml gibi sayılır (130 cc ≈ 33,5 TL)', Math.abs(sonuc.kapari - 130 * 49 / 190) < 1e-9],
  ['birimsiz satır adetle kullanılınca eskisi gibi', Math.abs(sonuc.ekmek - 96.53) < 1e-9],
];
kontrol.forEach(([ad, ok]) => console.log((ok ? 'TAMAM ' : 'HATA  ') + ad));
if (kontrol.some(k => !k[1])) { console.log(JSON.stringify(sonuc, null, 1)); process.exit(1); }
