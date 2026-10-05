/**
 * PAYE GÜN SONU AKTARIMI
 * Sofra (rapor@payekart.com.tr) her gece "Gün Sonu Raporu (GG.AA.YYYY)" e-postasıyla bir .xlsx gönderir
 * (hotmail → gmail yönlendirmesiyle gelir). payeGunSonuAktar, son 14 günün bu e-postalarını bulur ve ekteki tablonun
 * satırlarını "Kurye Net Çalışma Süresi" › 'Paye' sekmesine EKLER ('Rapor Günü' ve 'Mesaj ID' sütunlarıyla).
 * Aynı e-posta iki kez işlenmez (Mesaj ID). Satır silmez, değiştirmez; yalnız yeni sekmeye ekler.
 * Bu satırları panel veri kapısındaki yemek kartı ajanı okur (payeCekimleri_) ve açık Paye hesaplarıyla eşleştirir.
 *
 * Kurulum: payeKurulum() fonksiyonunu BİR KEZ çalıştır (Gmail okuma izni ister). Sonra her gün 03:10 ve 11:10'da kendisi çalışır.
 */
const PAYE = {
  SEKME: 'Paye',
  SORGU: 'subject:"Gün Sonu Raporu" filename:xlsx newer_than:14d',
  KAYNAK: /payekart|sofra/i   // yalnız Sofra / Paye raporları (başka "Gün Sonu" e-postaları karışmasın)
};

function payeKurulum() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'payeGunSonuAktar').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('payeGunSonuAktar').timeBased().atHour(3).nearMinute(10).everyDays(1).inTimezone('Europe/Istanbul').create();
  ScriptApp.newTrigger('payeGunSonuAktar').timeBased().atHour(11).nearMinute(10).everyDays(1).inTimezone('Europe/Istanbul').create();
  Logger.log(JSON.stringify(payeGunSonuAktar()));
}

function payeGunSonuAktar() {
  const kilit = LockService.getScriptLock(); if (!kilit.tryLock(30000)) return { atlandi: 'meşgul' };
  try {
    const ss = SpreadsheetApp.openById(CFG.KURYE_ID);
    let sh = ss.getSheetByName(PAYE.SEKME), baslik = null;
    const islenmis = new Set();
    if (sh && sh.getLastRow() >= 1) {
      baslik = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(String);
      const cm = baslik.indexOf('Mesaj ID');
      if (cm >= 0 && sh.getLastRow() > 1) sh.getRange(2, cm + 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(r => { if (r[0]) islenmis.add(r[0]); });
    }
    const yeni = []; let mesaj = 0;
    GmailApp.search(PAYE.SORGU, 0, 40).forEach(th => th.getMessages().forEach(m => {
      const id = m.getId();
      if (islenmis.has(id)) return;
      if (!PAYE.KAYNAK.test(m.getFrom() + ' ' + m.getPlainBody().slice(0, 2000))) return;
      const gun = (m.getSubject().match(/(\d{2}\.\d{2}\.\d{4})/) || [])[1] || Utilities.formatDate(m.getDate(), 'Europe/Istanbul', 'dd.MM.yyyy');
      m.getAttachments().filter(a => /\.xlsx$/i.test(a.getName())).forEach(a => {
        const tablo = xlsxOku_(a.copyBlob()); if (!tablo.length) return;
        const h = tablo[0].map(v => String(v).trim());
        if (!baslik) baslik = h.filter(String).concat(['Rapor Günü', 'Mesaj ID']);
        h.forEach(x => { if (x && baslik.indexOf(x) < 0) baslik.splice(baslik.length - 2, 0, x); }); // yeni sütun → Rapor Günü'nün önüne
        const satirlar = tablo.slice(1).filter(r => r.some(v => v !== '') && !/^toplam|^genel toplam/i.test(String(r.find(v => v !== '') || '')));
        if (!satirlar.length) satirlar.push([]); // işlem olmayan gün: gün yine "rapor geldi" sayılsın
        satirlar.forEach(r => { const o = {}; h.forEach((x, i) => { if (x) o[x] = r[i] === undefined ? '' : r[i]; }); o['Rapor Günü'] = "'" + gun; o['Mesaj ID'] = id; yeni.push(o); });
      });
      islenmis.add(id); mesaj++;
    }));
    if (!yeni.length) return { mesaj: 0, satir: 0 };
    if (!sh) { sh = ss.insertSheet(PAYE.SEKME); sh.setFrozenRows(1); }
    sh.getRange(1, 1, 1, baslik.length).setValues([baslik]).setFontWeight('bold');
    const veri = yeni.map(o => baslik.map(x => o[x] === undefined ? '' : o[x]));
    sh.getRange(sh.getLastRow() + 1, 1, veri.length, baslik.length).setValues(veri);
    return { mesaj: mesaj, satir: veri.length };
  } finally { kilit.releaseLock(); }
}

/* ---------------- .xlsx okuma (ilk sayfa) ----------------
 * Dönüş: satır dizisi; ilk eleman başlık satırı (en az 3 dolu metin hücresi olan ilk satır).
 * Tarih biçimli sayılar "GG.AA.YYYY SS:dd:ss" (saat kısmı yoksa yalnız tarih, yalnız saatse "SS:dd:ss") metnine çevrilir
 * ve tabloya metin olarak yazılsın diye başına ' konur.
 */
function xlsxOku_(blob) {
  blob.setContentType('application/zip');
  const dosya = {}; Utilities.unzip(blob).forEach(f => { dosya[f.getName()] = f; });
  const xml = ad => dosya[ad] ? XmlService.parse(dosya[ad].getDataAsString('UTF-8')).getRootElement() : null;
  const metin = el => { let s = ''; (function gez(e) { e.getChildren().forEach(c => { if (c.getName() === 't') s += c.getText(); else gez(c); }); })(el); return s; };

  const paylasilan = []; const sst = xml('xl/sharedStrings.xml');
  if (sst) sst.getChildren('si', sst.getNamespace()).forEach(si => paylasilan.push(metin(si)));

  // Hangi stil numarası tarih biçimli?
  const tarihStil = {}; const st = xml('xl/styles.xml');
  if (st) {
    const ns = st.getNamespace(), ozel = {};
    const nf = st.getChild('numFmts', ns); if (nf) nf.getChildren('numFmt', ns).forEach(f => { ozel[f.getAttribute('numFmtId').getValue()] = f.getAttribute('formatCode').getValue(); });
    const xfs = st.getChild('cellXfs', ns);
    if (xfs) xfs.getChildren('xf', ns).forEach((xf, i) => {
      const id = Number(xf.getAttribute('numFmtId') ? xf.getAttribute('numFmtId').getValue() : 0);
      const kod = ozel[id] || '';
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dmyhs]/i.test(kod.replace(/"[^"]*"|\[[^\]]*\]/g, ''))) tarihStil[i] = true;
    });
  }

  const sayfa = Object.keys(dosya).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))[0];
  if (!sayfa) return [];
  const ws = xml(sayfa), ns = ws.getNamespace(), data = ws.getChild('sheetData', ns), tablo = [];
  const kolon = ref => { let n = 0; const m = ref.match(/^[A-Z]+/); for (const ch of (m ? m[0] : 'A')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const tarihMetni = v => {
    const d = new Date(Math.round((v - 25569) * 86400000)), f = (fmt) => Utilities.formatDate(d, 'UTC', fmt);
    if (v < 1) return f('HH:mm:ss');
    return Math.abs(v - Math.floor(v)) < 1e-9 ? f('dd.MM.yyyy') : f('dd.MM.yyyy HH:mm:ss');
  };
  data.getChildren('row', ns).forEach(row => {
    const r = [];
    row.getChildren('c', ns).forEach((c, i) => {
      const ref = c.getAttribute('r') ? c.getAttribute('r').getValue() : null, j = ref ? kolon(ref) : i;
      const t = c.getAttribute('t') ? c.getAttribute('t').getValue() : '', s = c.getAttribute('s') ? Number(c.getAttribute('s').getValue()) : 0;
      const vEl = c.getChild('v', ns); let v = vEl ? vEl.getText() : '';
      if (t === 's') v = paylasilan[Number(v)] || '';
      else if (t === 'inlineStr') { const is = c.getChild('is', ns); v = is ? metin(is) : ''; }
      else if (t === 'b') v = v === '1' ? 'TRUE' : 'FALSE';
      else if (t === '' || t === 'n') { if (v !== '') { const n = Number(v); v = tarihStil[s] ? "'" + tarihMetni(n) : n; } }
      while (r.length < j) r.push('');
      r[j] = v;
    });
    tablo.push(r);
  });
  const bas = tablo.findIndex(r => r.filter(v => typeof v === 'string' && v.trim() && v.charAt(0) !== "'").length >= 3);
  if (bas < 0) return [];
  const gen = Math.max.apply(null, tablo.map(r => r.length));
  return tablo.slice(bas).map(r => { while (r.length < gen) r.push(''); return r; });
}
