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
for (const d of ['Kod.gs', 'Abonelik.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/bap-sistem-bekcisi', d), 'utf8'), ctx);
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

// Sipariş saatleri: 11:00 – 24:00
k.push(['21:00 açık', f('isletmeAcik_')(ist(2026, 10, 8, 21, 0)) === true]);
k.push(['23:30 açık', f('isletmeAcik_')(ist(2026, 10, 8, 23, 30)) === true]);
k.push(['02:51 kapalı (ilk raporda yanlış alarm)', f('isletmeAcik_')(ist(2026, 10, 9, 2, 51)) === false]);
k.push(['10:30 kapalı', f('isletmeAcik_')(ist(2026, 10, 9, 10, 30)) === false]);
const ac = f('sonAcilis_')(ist(2026, 10, 9, 1, 30));
k.push(['gece 01:30\'da son açılış dün 11:00', ac.getTime() === ist(2026, 10, 8, 11, 0).getTime()]);
k.push(['21:00\'de son açılış bugün 11:00', f('sonAcilis_')(simdi).getTime() === ist(2026, 10, 8, 11, 0).getTime()]);

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

// Abonelikler: ay ekleme, tutar okuma
const ay = f('ayEkle_')(new Date(2026, 0, 31), 1);
k.push(['31 Ocak + 1 ay = 28 Şubat', ay.getMonth() === 1 && ay.getDate() === 28]);
const ay2 = f('ayEkle_')(new Date(2026, 8, 18), 1);
k.push(['18 Eylül + 1 ay = 18 Ekim', ay2.getMonth() === 9 && ay2.getDate() === 18]);
k.push(['Anthropic makbuz tutarı', f('tutarBul_')('Receipt #2349\nAmount paid $24.00\nPaid October 4') === '$24.00']);
k.push(['OpenAI yükleme tutarı', f('tutarBul_')('We charged $12.00 to your credit card ending in 0013') === '$12.00']);
k.push(['Google Cloud TL tutarı', f('tutarBul_')('Ödeme alındı ₺250,00 tutarındaki ödemeniz') === '₺250,00']);
k.push(['tutar yoksa boş', f('tutarBul_')('Teşekkür ederiz, aboneliğiniz devam ediyor') === '']);

// Abonelik planı: eksik sütun eklenir, tarih yalnız ileri alınır, sahibin yazdığı plan ezilmez, yeni hizmet satırı açılır
const eskiTablo = [
  ['Hizmet', 'Ne için', 'Plan / ücret', 'Yenileme tarihi', 'Nereden bakılır'],
  ['Google One / Drive', 'Tablolar', 'Benim notum', new Date(2026, 9, 10), ''],
  ['ChatGPT / OpenAI', '', '', new Date(2026, 11, 1), '']   // sahip elle ileri tarih yazmış
];
const pl = f('abonelikPlani_')(eskiTablo, [
  { hizmet: 'google one / drive', plan: 'Google AI Pro', sonOdeme: new Date(2026, 9, 10, 2, 11), tarih: new Date(2026, 10, 10), tutar: '₺869,99', kaynak: 'Gmail makbuzu + 1 ay (tahmini)' },
  { hizmet: 'ChatGPT / OpenAI', plan: 'ChatGPT Plus', sonOdeme: new Date(2026, 8, 18), tarih: new Date(2026, 9, 18), kaynak: 'Gmail' },
  { hizmet: 'Google Workspace', plan: 'Aylık', tarih: new Date(2026, 10, 1), bosIse: true, kaynak: 'Gmail taraması (tahmini)' }
], new Date(2026, 9, 10, 12));
const hucre = (r, sutun) => pl.islem.filter(x => x.r === r && x.sutun === sutun)[0];
k.push(['eksik 4 sütun başlığa eklenir', pl.islem.filter(x => x.ad === '(başlık)').length === 4 && pl.baslik.length === 9]);
k.push(['Google One yenilemesi 10.11\'e alınır', hucre(1, 'Yenileme tarihi') && hucre(1, 'Yenileme tarihi').yeni.getMonth() === 10]);
k.push(['sahibin plan notu ezilmez', !hucre(1, 'Plan / ücret')]);
k.push(['sahibin ileri tarihi geri alınmaz', !hucre(2, 'Yenileme tarihi') && !!hucre(2, 'Plan / ücret')]);
k.push(['makbuz tutarı yazılır', hucre(1, 'Son tutar') && hucre(1, 'Son tutar').yeni === '₺869,99']);
k.push(['yeni hizmet yeni satıra yazılır', hucre(3, 'Hizmet') && hucre(3, 'Hizmet').yeni === 'Google Workspace' && hucre(3, 'Yenileme tarihi')]);
const tekrar = f('abonelikPlani_')([pl.baslik, ['Google Workspace', '', 'Aylık', new Date(2026, 10, 1), '', '', '', 'x', '']],
  [{ hizmet: 'Google Workspace', plan: 'Aylık', tarih: new Date(2027, 0, 1), bosIse: true }], new Date());
k.push(['başlangıç bilgisi dolu tarihi değiştirmez', tekrar.islem.length === 0]);

// Bekçi satırları: tarih + Gmail sorun maili
const ab = [pl.baslik,
  ['Google One / Drive', '', '', new Date(2026, 10, 10), '', new Date(2026, 9, 10), '', 'Gmail makbuzu + 1 ay (tahmini)', ''],
  ['ChatGPT / OpenAI', '', '', ist(2026, 10, 4, 12, 0), '', '', '', '', ''],
  ['Anthropic API', '', 'API kredisi', '', '', new Date(2026, 9, 4), '', '', ''],
  ['KolayBi', '', '', '', '', '', '', '', '']];
const sat = f('abonelikSatirlari_')(ab, [
  { hizmet: 'Google One / Drive', zaman: simdi, konu: "There's an issue with your Mastercard-4601", cozum: 'kartı güncelle' },
  { hizmet: 'Anthropic API', zaman: simdi, konu: '[Action needed] Your Claude API access is turned off' },
  { hizmet: 'Google Cloud', zaman: simdi, konu: 'Ödeme reddedildi' }], simdi);
const s_ = ad => sat.filter(r => r.ad === ad)[0];
k.push(['kart uyarısı UYARI olur', s_('Google One / Drive').durum === 'UYARI' && /Mastercard/.test(s_('Google One / Drive').detay)]);
k.push(['API kapandı SORUN olur', s_('Anthropic API').durum === 'SORUN']);
k.push(['4 gün geçmiş yenileme SORUN', s_('ChatGPT / OpenAI').durum === 'SORUN']);
k.push(['tarihsiz, sorunsuz hizmet satır üretmez', !s_('KolayBi')]);
k.push(['sekmede olmayan hizmetin sorunu da çıkar', s_('Google Cloud') && s_('Google Cloud').durum === 'SORUN']);

let hata = 0;
for (const [ad, ok] of k) { console.log((ok ? 'TAMAM ' : 'HATA  ') + ad); if (!ok) hata++; }
process.exit(hata ? 1 : 0);
