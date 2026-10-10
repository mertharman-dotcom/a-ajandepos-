// Kullanım: node tests/veri-kapisi-toptanci-borc-testi.js
// Yönetim paneli toptancı borcu (finans_ › borc) Alım ekranıyla aynı ad eşleştirmesini kullanmalı (P72):
// Odemeler'e kısa ya da farklı yazılmış ad ("Sapori", "SERA SEBZE") fatura adındaki toptancının borcundan düşmeli.
const fs = require('fs'), vm = require('vm'), path = require('path');
const gun = n => { const d = new Date(Date.now() - n * 864e5); return ('0' + d.getUTCDate()).slice(-2) + '.' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '.' + d.getUTCFullYear(); };
const SAP = 'SAPORİ GIDA VE KOZMETİK TİC. İTH. İHR. LTD. ŞTİ.', SERA = 'SERA SEBZE MEYVE KOMİSYONCULUĞU VE TİC. LTD ŞTİ';
const sekmeler = {
  Sayfa1: [['Fatura_No', 'Tarih', 'Gönderen', 'Tutar'],
    ['F1', gun(100), SAP, 10000], ['F2', gun(20), SAP, 5000], ['F3', gun(90), SERA, 8000], ['F4', gun(5), 'METRO GROSMARKET', 700]],
  Odemeler: [['Odeme_ID', 'Tarih', 'Tedarikçi', 'Tutar', 'Yöntem', 'Açıklama'],
    ['', gun(30), 'Sapori', 9000, 'Havale/EFT', ''],                         // kısa ad → Sapori'den düşmeli
    ['O2', gun(10), SAP, 1000, 'Nakit', ''],                                  // tam ad
    ['', gun(15), 'Sera sebze meyve', 8000, 'Havale/EFT', ''],               // adın baş kısmı
    ['', gun(3), 'Bambaşka Firma', 500, 'Nakit', '']],                       // hiçbir toptancıya benzemiyor → kimseden düşmemeli
  Tedarikciler: [['Tedarikçi', 'Vade_Gun', 'Acilis_Bakiye'], [SAP, 30, 0], ['Sera Sebze', 30, 0], ['METRO GROSMARKET', 30, 0]]
};
const sheet = ad => ({ getName: () => ad, getLastRow: () => sekmeler[ad].length, getLastColumn: () => sekmeler[ad][0].length, getDataRange: () => ({ getValues: () => sekmeler[ad] }) });
const ss = { getSheetByName: ad => sekmeler[ad] ? sheet(ad) : null, getSheets: () => Object.keys(sekmeler).map(sheet) };
const ctx = vm.createContext({ console, SpreadsheetApp: { openById: () => ss }, CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  Utilities: { formatDate: d => d.toISOString() }, Logger: { log: () => {} } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/bap-panel-veri-kapisi/Kod.gs'), 'utf8'), ctx);
const out = vm.runInContext('finans_()', ctx);
const b = ad => (out.borc.liste.find(x => x.ad === ad) || { borc: 0, vadesiGecen: 0 });
const kontrol = [
  ['Sapori: 15.000 fatura − 10.000 ödeme (kısa adla girilen dahil) = 5.000', Math.abs(b(SAP).borc - 5000) < 0.01, b(SAP)],
  ['Sapori: vadesi geçen yok (ödemeler en eski faturayı kapattı)', b(SAP).vadesiGecen < 0.5, b(SAP)],
  ['Sera: Tedarikciler\'de kısa ad, Odemeler\'de adın baş kısmı → borç 0, listede yok', !out.borc.liste.some(x => /sera/i.test(x.ad)), out.borc.liste],
  ['Metro: 700 borç, ödeme yok', Math.abs(b('METRO GROSMARKET').borc - 700) < 0.01, b('METRO GROSMARKET')],
  // Alım ekranıyla aynı: büyük I 'ı' sayılır; "KOMISYONCULUGU" gibi Türkçe harfsiz yazım %80 benzemez → iki ekranda da eşleşmeyen ödeme.
  ['benzemeyen ödeme kimsenin borcundan düşmedi: toplam 5.700', Math.abs(out.borc.toplam - 5700) < 0.01, out.borc.toplam]
];
kontrol.forEach(([ad, ok, m]) => console.log((ok ? 'TAMAM ' : 'HATA  ') + ad + (ok ? '' : '  ' + JSON.stringify(m))));
if (kontrol.some(k => !k[1])) process.exit(1);
