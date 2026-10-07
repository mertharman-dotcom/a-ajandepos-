// TEST ortamı derlemesi + güvenlik denetimi.  node test/tek-yazici/build.mjs [--panel=oneri|eski]
// Çıktı: test/tek-yazici/dist/{stok,panel,on-yuz} ve dist/denetim.txt. Denetim geçmezse çıkış kodu 1 (yayın durur).
//
// Denetim kuralları:
//  1. Koddaki her uzun kimlik (Google dosya/dağıtım kimliği biçimi) TEST listesinde olmalı. Tek istisna: personel dosyası
//     (giriş için YALNIZ OKUNUR; yalnız panelde, yalnız getCalisanlar/sifreKontrol içinde).
//  2. MailApp, GmailApp, UrlFetchApp, DriveApp hiçbir test dosyasında olamaz (gerçek mesaj / dış istek / Drive işlemi yok).
//  3. Her SpreadsheetApp.openById(...) çağrısının hedefi izinli bir sabit olmalı.
//  4. Ön yüzde canlı panel adresi kalmamalı; tedarikçi siparişi / WhatsApp düğmesi kapalı olmalı.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const BURA = path.dirname(fileURLToPath(import.meta.url)), KOK = path.join(BURA, '../..');
const K = JSON.parse(fs.readFileSync(path.join(BURA, 'test-kimlikleri.json'), 'utf8'));
const panelKaynak = (process.argv.find(a => a.startsWith('--panel=')) || '--panel=oneri').split('=')[1];
const DIST = path.join(BURA, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
const rapor = [], hatalar = [];
const oku = p => fs.readFileSync(p, 'utf8');
const yaz = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
function degistir(s, a, b, ad) { const n = s.split(a).length - 1; if (n !== 1) { hatalar.push(`${ad}: yama yeri ${n} kez bulundu: ${a.slice(0, 60)}`); return s; } return s.replace(a, b); }
function kimlikCevir(s) {
  return s.split(K.canli.stok).join(K.test.stok).split(K.canli.satis).join(K.test.satis).split(K.canli.fatura).join(K.test.fatura)
    .split(K.canli.genelBilgiler).join('TEST_YASAK_GENEL_BILGILER');
}
const manifest = scopes => JSON.stringify({ timeZone: 'Europe/Istanbul', runtimeVersion: 'V8', exceptionLogging: 'STACKDRIVER',
  oauthScopes: scopes, webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' } }, null, 2);

// ---------- stok projesi: canlı Satış/Alış Motoru + önerilen kuyruk + test kapısı ----------
const SS = path.join(KOK, 'apps-script/stok-takip-sistemi');
let sm = kimlikCevir(oku(path.join(SS, 'Satıs Motoru.gs')));
// ÖNERİLEN CANLI DEĞİŞİKLİK 1: Satış Motoru kendi kilidi altında ÖNCE kuyruğu işler. Kuyruk hata verirse bu tur satış
// düşülmez (sipariş kaybolmaz, sonraki turda düşülür) — böylece yarım kalan kuyruk turunu ilk yine kuyruk tamamlar.
sm = degistir(sm, 'try { satislariIsle(); } finally { lock.releaseLock(); }',
  'try { stokKuyruguOnce_(stokDosyasi()); satislariIsle(); } finally { lock.releaseLock(); }', 'Satış Motoru');
let am = kimlikCevir(oku(path.join(SS, 'Alıs Motoru v2.gs')));
// ÖNERİLEN CANLI DEĞİŞİKLİK 2: Alış Motoru da önce kuyruğu işler.
am = degistir(am, "try { return alisIsle_(); } finally { lock.releaseLock(); }",
  "try { stokKuyruguOnce_(SpreadsheetApp.openById(SHEET_ID)); return alisIsle_(); } finally { lock.releaseLock(); }", 'Alış Motoru');
const kuyruk = oku(path.join(BURA, 'oneri/Stok Kuyrugu.gs')) + `
/** Satış ve Alış Motoru'nun başında (kilit altındayken) çağrılır. Hata olursa uyarı + motor bu tur durur. */
function stokKuyruguOnce_(ss) {
  try { sk_uyarilar_(stokKuyruguIsle_(ss)); }
  catch (e) { sk_uyar_('motor', 'Stok kuyruğu işlenemedi, motor bu tur atlandı (kayıtlar kaybolmadı, sonraki turda denenecek): ' + e); throw e; }
}
`;
yaz(path.join(DIST, 'stok/Satıs Motoru.gs'), sm);
yaz(path.join(DIST, 'stok/Alıs Motoru v2.gs'), am);
yaz(path.join(DIST, 'stok/Stok Kuyrugu.gs'), kuyruk);
yaz(path.join(DIST, 'stok/Test Uyari.gs'), oku(path.join(BURA, 'test-ortami/Test Uyari.gs')));
yaz(path.join(DIST, 'stok/Test Stok.gs'), oku(path.join(BURA, 'test-ortami/Test Stok.gs')));
yaz(path.join(DIST, 'stok/appsscript.json'), manifest(['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/script.scriptapp']));

// ---------- panel projesi ----------
let panel = panelKaynak === 'eski' ? oku(path.join(KOK, 'apps-script/bap-panel-backend/Kod.gs')) : oku(path.join(BURA, 'oneri/panel-Kod.gs'));
panel = kimlikCevir(panel);
panel = degistir(panel, 'function doPost(e) {', 'function doPost_asil(e) {', 'panel doPost');
yaz(path.join(DIST, 'panel/Kod.gs'), panel);
yaz(path.join(DIST, 'panel/Test Panel.gs'), oku(path.join(BURA, 'test-ortami/Test Panel.gs')));
yaz(path.join(DIST, 'panel/appsscript.json'), manifest(['https://www.googleapis.com/auth/spreadsheets']));

// ---------- ön yüz (Cloudflare Pages önizleme dalı) ----------
let on = oku(path.join(KOK, 'bap-sistem/index.html'));
const panelUrl = K.projeler.panel.deploymentId ? `https://script.google.com/macros/s/${K.projeler.panel.deploymentId}/exec` : 'about:blank#panel-henuz-kurulmadi';
on = degistir(on, `https://script.google.com/macros/s/${K.canli.panelDagitim}/exec`, panelUrl, 'ön yüz API');
on = degistir(on, '<body>', `<body>
<div id="test-serit" style="position:sticky;top:0;z-index:9999;background:#b91c1c;color:#fff;font:800 12px system-ui;padding:6px 10px;text-align:center">
  TEST ORTAMI — canlı stoka yazmaz · tedarikçi siparişi / WhatsApp kapalı</div>`, 'ön yüz şerit');
on = degistir(on, `  const sonuc=await apiFetchJson(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(d)});`,
`  // Aynı kayıt (aynı içerik) cevap alınamadan tekrar gönderilirse AYNI istekId gider; sunucu ikinci kez yazmaz.
  const icerik=JSON.stringify(d);
  if(!d.istekId){ ISTEK_KIMLIK[icerik]=ISTEK_KIMLIK[icerik]||((self.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2)); d.istekId=ISTEK_KIMLIK[icerik]; }
  const sonuc=await apiFetchJson(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(d)});
  delete ISTEK_KIMLIK[icerik];
  setTimeout(bekleyenYukle,1500);`, 'ön yüz istekId');
on = degistir(on, `    const veriler=await Promise.all(subeler.map(x=>stokVeriGetir(STOK_TIP,x,zorla)));`,
`    await bekleyenYukle();
    const veriler=await Promise.all(subeler.map(x=>stokVeriGetir(STOK_TIP,x,zorla)));`, 'ön yüz stok bekleyen');
on = degistir(on, `        <div style="font-size:12px"><b>Mevcut Stok:</b> \${mevcut} \${h.birim}</div>`,
`        <div style="font-size:12px"><b>Mevcut Stok:</b> \${mevcut} \${h.birim}</div>\${bekleyenSatiri(sube,h,mevcut)}`, 'ön yüz stok hücresi');
on = degistir(on, '</body>', `<div id="bekleyen-bar" style="display:none;position:fixed;left:0;right:0;bottom:0;z-index:9998;background:#fef3c7;color:#78350f;font:700 12px system-ui;padding:8px 12px;border-top:2px solid #f59e0b"></div>
<script>
// TEST: stoka henüz işlenmemiş kayıtlar ayrı gösterilir
const ISTEK_KIMLIK={}; let BEKLEYEN={kayitlar:[],ozet:{}};
async function bekleyenYukle(){
  try{ BEKLEYEN=await apiFetchJson(API+'?action=getBekleyenler'); }catch(e){ return; }
  const o=BEKLEYEN.ozet||{}, bar=document.getElementById('bekleyen-bar'); if(!bar) return;
  const parca=[];
  if(o.bekleyen) parca.push('⏳ '+o.bekleyen+' kayıt stoka işlenmeyi bekliyor (en eski '+o.enEskiDk+' dk)');
  if(o.sayimBekleyen) parca.push('🧮 '+o.sayimBekleyen+' sayım, sayımdan önceki siparişlerin düşülmesini bekliyor');
  if(o.hata24s) parca.push('⚠️ '+o.hata24s+' kayıt elle kontrol bekliyor');
  bar.style.display=parca.length?'block':'none'; bar.style.background=o.hata24s||o.enEskiDk>10?'#fee2e2':'#fef3c7';
  bar.innerHTML=parca.join(' · ');
}
function bekleyenSatiri(sube,h,mevcut){
  const ad=(h.adi||'').toLocaleLowerCase('tr-TR').trim(), sb=(sube||'').toLocaleLowerCase('tr-TR').trim();
  let d=0, sayim=null;
  (BEKLEYEN.kayitlar||[]).forEach(k=>{
    if((k.urun||'').toLocaleLowerCase('tr-TR').trim()!==ad || (k.sube||'').toLocaleLowerCase('tr-TR').trim()!==sb) return;
    if(k.sayilan!==null && k.sayilan!==undefined) sayim=k.sayilan; else d+=Number(k.delta)||0;
  });
  if(!d && sayim===null) return '';
  const r=Math.round(d*1000)/1000;
  return '<div style="font-size:11px;color:#b45309;font-weight:700;margin-top:3px">⏳ '+(r?(r>0?'+':'')+r+' '+h.birim+' stoka işlenmeyi bekliyor → '+(Math.round((mevcut+r)*1000)/1000)+' '+h.birim:'')+
    (sayim!==null?' · sayım ('+sayim+') uygulanmayı bekliyor':'')+'</div>';
}
siparisKaydetVeWhatsApp=async function(){ alert('TEST ortamında tedarikçi siparişi ve WhatsApp kapalı.'); };
setInterval(bekleyenYukle,30000); bekleyenYukle();
</script>
</body>`, 'ön yüz bekleyen çubuğu');
yaz(path.join(DIST, 'on-yuz/index.html'), on);

// ---------- DENETİM ----------
const izinliKimlik = new Set([K.test.stok, K.test.satis, K.test.fatura, K.test.klasor]);
if (K.projeler.panel.deploymentId) izinliKimlik.add(K.projeler.panel.deploymentId);
const izinliOpen = { stok: ['STOK_DOSYA_ID', 'SATIS_KAYNAK_ID', 'SHEET_ID', 'FATURA_SS_ID', 'GENEL_BILGILER_ID', 'KOLAYBI_DOSYA_ID', 'HAM_DOSYA_ID', 'p.yedek'],
  panel: ['SHEET_ID', 'CALISAN_ID'] };
const yasakli = /\b(MailApp|GmailApp|UrlFetchApp|DriveApp)\b/;
function fonksiyonAdi(s, konum) { const once = s.slice(0, konum); const m = [...once.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(|([A-Za-z0-9_$]+)\s*:\s*function\s*\(/g)].pop(); return m ? (m[1] || m[2]) : '(üst düzey)'; }
for (const proje of ['stok', 'panel']) {
  for (const dosya of fs.readdirSync(path.join(DIST, proje)).filter(f => f.endsWith('.gs'))) {
    const s = oku(path.join(DIST, proje, dosya)), yer = `${proje}/${dosya}`;
    const satirlar = s.split('\n');
    satirlar.forEach((l, i) => {
      const kod = l.replace(/\/\/.*$/, '');
      if (yasakli.test(kod)) hatalar.push(`${yer}:${i + 1} yasaklı servis: ${l.trim().slice(0, 90)}`);
    });
    for (const m of s.matchAll(/['"]([A-Za-z0-9_-]{30,})['"]/g)) {
      const id = m[1];
      if (izinliKimlik.has(id)) continue;
      if (id === K.canli.calisan && proje === 'panel') { rapor.push(`${yer}: personel dosyası (YALNIZ OKUMA, giriş için)`); continue; }
      if (/^TEST_YASAK_/.test(id)) continue;
      hatalar.push(`${yer}: izinsiz kimlik ${id}`);
    }
    for (const m of s.matchAll(/SpreadsheetApp\.openById\(\s*([^)]+?)\s*\)/g)) {
      const hedef = m[1], fn = fonksiyonAdi(s, m.index);
      const satir = s.slice(0, m.index).split('\n').length;
      if (!izinliOpen[proje].includes(hedef) && !(hedef === 'id' && /^hp_|^rs_/.test(fn))) hatalar.push(`${yer}:${satir} izinsiz openById(${hedef}) — ${fn}`);
      else rapor.push(`${yer}:${satir} openById(${hedef}) — ${fn}`);
      if (hedef === 'CALISAN_ID' && !['getCalisanlar', 'sifreKontrol'].includes(fn)) hatalar.push(`${yer}:${satir} personel dosyası beklenmeyen yerde: ${fn}`);
    }
  }
}
// Kimlik sabitlerinin derlenmiş değerleri
const sabit = (proje, dosya, ad) => (oku(path.join(DIST, proje, dosya)).match(new RegExp(`(?:var|const)\\s+${ad}\\s*=\\s*['"]([^'"]+)['"]`)) || [])[1];
const tablo = [['stok', 'Satıs Motoru.gs', 'STOK_DOSYA_ID'], ['stok', 'Satıs Motoru.gs', 'SATIS_KAYNAK_ID'], ['stok', 'Satıs Motoru.gs', 'KOLAYBI_DOSYA_ID'],
  ['stok', 'Satıs Motoru.gs', 'GENEL_BILGILER_ID'], ['stok', 'Alıs Motoru v2.gs', 'SHEET_ID'], ['stok', 'Alıs Motoru v2.gs', 'FATURA_SS_ID'],
  ['panel', 'Kod.gs', 'SHEET_ID'], ['panel', 'Kod.gs', 'CALISAN_ID']];
const adlar = { [K.test.stok]: 'TEST stok kopyası', [K.test.satis]: 'TEST satış dosyası', [K.test.fatura]: 'TEST fatura dosyası', [K.canli.calisan]: 'CANLI personel (yalnız okuma)', TEST_YASAK_GENEL_BILGILER: 'yasak (çağrılırsa hata)' };
const sabitler = tablo.map(([p, d, a]) => { const v = sabit(p, d, a); const ad = adlar[v] || (v ? 'BİLİNMEYEN' : 'YOK'); if (ad === 'BİLİNMEYEN') hatalar.push(`${p}/${a} bilinmeyen hedef ${v}`); return `${p}/${a} → ${ad}`; });
// Ön yüz
const onYuz = oku(path.join(DIST, 'on-yuz/index.html'));
if (onYuz.includes(K.canli.panelDagitim)) hatalar.push('ön yüz: canlı panel adresi duruyor');
for (const m of onYuz.matchAll(/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)/g)) if (!izinliKimlik.has(m[1])) hatalar.push('ön yüz: izinsiz adres ' + m[1]);
// Sube_Stok'a yazan yollar (gözden geçirme listesi)
const yazanlar = [];
for (const [proje, dosya] of [['stok', 'Satıs Motoru.gs'], ['stok', 'Alıs Motoru v2.gs'], ['stok', 'Stok Kuyrugu.gs'], ['panel', 'Kod.gs']]) {
  const s = oku(path.join(DIST, proje, dosya));
  for (const m of s.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/g)) {
    const bas = m.index, gov = s.slice(bas, s.indexOf('\nfunction ', bas + 10) > 0 ? s.indexOf('\nfunction ', bas + 10) : s.length);
    const stokSekmesi = /(Sube_Stok|STOK_SEKME|SUBESTOK_SEKME|subeStokSheet\(\)|stokSatirBul\()/.test(gov);
    if (stokSekmesi && /\.(setValues?|appendRow)\(/.test(gov)) yazanlar.push(`${proje}/${dosya} › ${m[1]}`);
  }
}
// Önerilen panelde Sube_Stok'a doğrudan yazan eski yol hiç çağrılmamalı
if (panelKaynak === 'oneri') {
  const pk = oku(path.join(DIST, 'panel/Kod.gs'));
  for (const fn of ['stokHareketDogrudan_', 'stokSatirBul']) {
    const cagri = (pk.match(new RegExp(fn.replace('$', '\\$') + '\\(', 'g')) || []).length - 1 - (fn === 'stokSatirBul' ? 1 : 0);
    if (cagri !== 0) hatalar.push(`panel: ${fn} ${cagri} yerden çağrılıyor (Sube_Stok'a doğrudan yazım)`);
    else yazanlar.push(`  (panel/Kod.gs › ${fn}: tanımlı ama HİÇBİR yerden çağrılmıyor → panel Sube_Stok'a yazmaz)`);
  }
}
const metin = [
  `TEST derlemesi ${new Date().toISOString()} · panel kaynağı: ${panelKaynak}`, '',
  'KİMLİK SABİTLERİ (derlenmiş):', ...sabitler.map(x => '  ' + x), '',
  'OKUNAN/YAZILAN DOSYALAR (openById):', ...rapor.map(x => '  ' + x), '',
  "Sube_Stok'a yazabilen fonksiyonlar (sekme adını kullanıp hücreye yazanlar):", ...yazanlar.map(x => '  ' + x), '',
  hatalar.length ? 'DENETİM: KALDI' : 'DENETİM: GEÇTİ (canlı kimlik yok, e-posta/dış istek/Drive yok, ön yüz test adresinde)',
  ...hatalar.map(x => '  ✗ ' + x)].join('\n');
yaz(path.join(DIST, 'denetim.txt'), metin);
console.log(metin);
process.exit(hatalar.length ? 1 : 0);
