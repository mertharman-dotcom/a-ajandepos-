// Kullanım: node tests/bekci-testi.js
// BAP Sistem Bekçisi: tarih okuma, işletme saatleri, sekmedeki en yeni kayıt ve durum geçişleri (ne zaman bildirim gider).
const fs = require('fs'), vm = require('vm'), path = require('path');

const TZ_FARK = 3 * 3600000;  // Europe/Istanbul = UTC+3 (yaz saati yok)
const pad = n => String(n).padStart(2, '0');
const Utilities = {
  formatDate(t, tz, f) {
    const d = new Date(t.getTime() + TZ_FARK);
    const p = { yyyy: d.getUTCFullYear(), MM: pad(d.getUTCMonth() + 1), dd: pad(d.getUTCDate()), HH: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()), H: d.getUTCHours() };
    return f.replace(/yyyy|MM|dd|HH|mm|H/g, k => p[k]);
  },
  parseDate(s, tz, f) { const m = s.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/); return new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) - TZ_FARK); }
};
const props = {};
const PropertiesService = { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) };
const ctx = vm.createContext({ console, Utilities, PropertiesService, Logger: { log() {} } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/bap-sistem-bekcisi/Bekci.gs'), 'utf8'), ctx);
const f = ad => ctx[ad];
const ist = (y, a, g, s, d) => new Date(Date.UTC(y, a - 1, g, s, d) - TZ_FARK);   // İstanbul saatiyle tarih

// Sahte sekme: satırlar 2. satırdan başlar
const sekme = satirlar => ({
  getLastRow: () => satirlar.length + 1, getLastColumn: () => Math.max(...satirlar.map(r => r.length)),
  getRange: (r, c, n, m) => ({ getValues: () => satirlar.slice(r - 2, r - 2 + n).map(x => { const y = x.slice(0, m); while (y.length < m) y.push(''); return y; }) })
});

const simdi = ist(2026, 10, 8, 21, 0);
const k = [];
const t1 = f('tarihOku_')('08.10.2026 20:15');
k.push(['dd.MM.yyyy HH:mm okunur', t1 && t1.getDate() === 8 && t1.getHours() === 20 && t1.getMinutes() === 15]);
k.push(['ISO okunur', !!f('tarihOku_')('2026-10-08T17:15:00Z')]);
k.push(['sayı / boş tarih sayılmaz', f('tarihOku_')(45000) === null && f('tarihOku_')('') === null]);
k.push(['metin içinde rastgele sayı tarih sayılmaz', f('tarihOku_')('Sipariş 12345678') === null]);

// En yeni kayıt: yeni satırlar en altta, gelecekteki tarih (plan) yok sayılır
const altta = [];
for (let i = 0; i < 100; i++) altta.push(['x', new Date(simdi.getTime() - (100 - i) * 60000), 'a']);
altta.push(['plan', new Date(simdi.getTime() + 3 * 86400000), 'gelecek']);
const son = f('sonTarih_')(sekme(altta), simdi);
k.push(['en alttaki en yeni kayıt bulunur, gelecek tarih yok sayılır', son && Math.round((simdi - son) / 60000) === 1]);
// Yeni satırlar en üstte
const ustte = altta.slice(0, 100).reverse();
k.push(['en üstteki en yeni kayıt da bulunur', Math.round((simdi - f('sonTarih_')(sekme(ustte), simdi)) / 60000) === 1]);
// Yalnız tarih (00:00) → günün sonu sayılır
const gunluk = [[new Date(2026, 9, 7), 'Pluxee', 100]];
const sg = f('sonTarih_')(sekme(gunluk), simdi);
k.push(['yalnız tarih günün sonu sayılır', sg.getDate() === 7 && sg.getHours() === 23]);

// İşletme saatleri: 10:00 açılış, 03:00 kapanış
k.push(['21:00 açık', f('isletmeAcik_')(ist(2026, 10, 8, 21, 0)) === true]);
k.push(['01:30 açık', f('isletmeAcik_')(ist(2026, 10, 9, 1, 30)) === true]);
k.push(['05:00 kapalı', f('isletmeAcik_')(ist(2026, 10, 9, 5, 0)) === false]);
const ac = f('sonAcilis_')(ist(2026, 10, 9, 1, 30));
k.push(['gece 01:30\'da son açılış dün 10:00', ac.getTime() === ist(2026, 10, 8, 10, 0).getTime()]);
k.push(['21:00\'de son açılış bugün 10:00', f('sonAcilis_')(simdi).getTime() === ist(2026, 10, 8, 10, 0).getTime()]);

// Durum geçişleri: SORUN ilk kontrolde bildirilmez, ikincide bir kez bildirilir; düzelince bir kez daha
const tur = durum => { const r = [{ grup: 'Satış', ad: 'Adisyo', durum, detay: '' }]; return { d: f('durumGuncelle_')(r), r: r[0] }; };
let a = tur('OK');
k.push(['ilk OK olay sayılmaz', a.d.degisim.length === 0]);
a = tur('SORUN');
k.push(['OK → SORUN olay yazılır ama hemen bildirilmez', a.d.degisim.length === 1 && !a.r.bildir]);
a = tur('SORUN');
k.push(['SORUN 2. kontrolde de sürüyorsa bildirilir', a.r.bildir === 'sorun' && a.d.degisim.length === 0]);
a = tur('SORUN');
k.push(['aynı sorun tekrar bildirilmez', !a.r.bildir]);
a = tur('OK');
k.push(['düzelince bir kez "düzeldi" bildirilir', a.r.bildir === 'duzeldi' && a.d.degisim.length === 1]);
a = tur('SORUN'); a = tur('OK');
k.push(['bildirilmeden düzelen kısa sorun için "düzeldi" gitmez', !a.r.bildir]);

let hata = 0;
for (const [ad, ok] of k) { console.log((ok ? 'TAMAM ' : 'HATA  ') + ad); if (!ok) hata++; }
process.exit(hata ? 1 : 0);
