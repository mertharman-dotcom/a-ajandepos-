// Kullanım: node tests/personel-pin-testi.js
// Panel › Personel bilgileri › Şifre (PIN): 4 hane, metin olarak F sütununa yazılır, panele/kayda açık gitmez (P73).
const fs = require('fs'), vm = require('vm'), path = require('path');

function kur(baslik) {
  const P = [baslik, ['Ali Veli', '01.10.2026', '', '40000', 'TRUE', '0123', '5321234567']];
  const yazilan = [], log = [];
  const ps = { getDataRange: () => ({ getDisplayValues: () => P }),
    getRange: (r, c) => ({ setNumberFormat: f => yazilan.push(['bicim', r, c, f]), setValue: v => { yazilan.push(['deger', r, c, v]); P[r - 1][c - 1] = v; } }) };
  const lg = { insertRowAfter: () => {}, getRange: () => ({ setValues: v => log.push(v[0][3]) }) };
  const ctx = vm.createContext({ console, Utilities: { formatDate: () => '09.10.2026 23:59:00' },
    SpreadsheetApp: { openById: () => ({ getSheetByName: ad => ad === 'Personel' ? ps : (ad === 'Islem_Loglari' ? lg : null) }) } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/bap-panel-veri-kapisi/Kod.gs'), 'utf8'), ctx);
  vm.runInContext('cevapKaydet_ = function () {}; tabloAc_ = function (id) { return SpreadsheetApp.openById(id); };', ctx);
  return { ctx, P, yazilan, log, gir: d => vm.runInContext('personelBilgiGir_', ctx)(d), bilgi: () => vm.runInContext('personelBilgileri_', ctx)(vm.runInContext('SpreadsheetApp.openById()', ctx)) };
}
const BAS = ['İsim Soyisim', 'İşe Giriş', 'İşten Çıkış', 'Maaş', 'Aktif', 'PIN', 'Telefon Numarası'];
const kontrol = [];
const ok = (ad, kosul, ek) => kontrol.push([ad, !!kosul, ek]);

let t = kur(BAS);
const b = t.bilgi().liste[0];
ok('PIN değeri panele gitmez', JSON.stringify(b).indexOf('0123') < 0 && b.maskeli.PIN === '••••', b.maskeli);
ok('3 hane reddedilir', t.gir({ alan: 'PIN', cevap: '123', satir: 2, ad: 'Ali Veli', degistir: '1' }).hata);
ok('harf reddedilir', t.gir({ alan: 'PIN', cevap: '12a4', satir: 2, ad: 'Ali Veli', degistir: '1' }).hata);
ok('dolu PIN Değiştir olmadan yazılmaz', t.gir({ alan: 'PIN', cevap: '4321', satir: 2, ad: 'Ali Veli' }).hata);
const r = t.gir({ alan: 'PIN', cevap: '0456', satir: 2, ad: 'Ali Veli', degistir: '1' });
ok('PIN değişir', r.tamam && t.P[1][5] === '0456', r);
ok('metin biçimi F sütununa', t.yazilan.some(x => x[0] === 'bicim' && x[2] === 6 && x[3] === '@'), t.yazilan);
ok('kayıtta PIN açık yazılmaz', t.log.length && t.log.every(x => x.indexOf('0456') < 0 && x.indexOf('0123') < 0), t.log);

t = kur(['İsim Soyisim', 'İşe Giriş', 'İşten Çıkış', 'Maaş', 'Aktif', 'Not', 'PIN']);
ok('PIN başlığı F değilse yazılmaz', t.gir({ alan: 'PIN', cevap: '1111', satir: 2, ad: 'Ali Veli', degistir: '1' }).hata && !t.yazilan.length);

let hata = 0;
kontrol.forEach(([ad, g, ek]) => { console.log((g ? 'TAMAM ' : 'HATA  ') + ad + (g ? '' : '  ' + JSON.stringify(ek))); if (!g) hata++; });
console.log(hata ? hata + ' hata' : 'Hepsi geçti (' + kontrol.length + ')');
process.exit(hata ? 1 : 0);
