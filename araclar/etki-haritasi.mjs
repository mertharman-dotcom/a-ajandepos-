#!/usr/bin/env node
// BAP etki haritası: hangi kod hangi Google Sheets dosyasının hangi sekmesini / sütununu okuyor ya da yazıyor,
// o kodu kim çalıştırıyor (zamanlayıcı, menü, mutfak paneli, yönetim paneli, MacBook köprüsü).
//
//   node araclar/etki-haritasi.mjs            → docs/etki-haritasi.md, .json, .html dosyalarını yeniden üretir
//   node araclar/etki-haritasi.mjs ara Birim  → "Birim" geçen sekme / sütun / fonksiyonların etkisini yazar
//   node araclar/etki-haritasi.mjs --kontrol  → harita koddan geride kaldıysa hata verir (çıktı yazmaz)
//
// Yalnızca okur; hiçbir tabloya ya da canlı sisteme dokunmaz. Bağımlılığı yoktur (Node 18+).
// Kod statik olarak okunduğu için "en iyi tahmin"dir: değişken adla açılan sekmeler ve dolaylı yazmalar kaçabilir.
// Kaçanlar .md'deki "Çözülemeyenler" bölümünde listelenir.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = p => fs.readFileSync(path.join(KOK, p), 'utf8');
const var_ = p => fs.existsSync(path.join(KOK, p));

// ───────────────────────── Ayarlar ─────────────────────────

// Projenin "bağlı" olduğu dosya (getActiveSpreadsheet() bu dosyayı açar). Kısa adlar docs/veri-sozlugu.md › Dosyalar.
const BAGLI_DOSYA = {
  'stok-takip-sistemi': 'STOK',
  'bap-genel-bilgiler': 'GENEL',
  'kolaybi-fatura-ham-veri': 'FATURA',
  'bap-yemek-karti': 'YEMEKKARTI',
  'kurye-net-calisma-suresi': 'KURYE',
  'trendyol-veri-cekme': 'TRENDYOL',
  'adisyo-siparis-toplayici': 'SATIS',
  'bap-rapor-ajani': 'SATIS',
  'bap-personel': 'PERSONEL',
};

// Arayüzler: hangi dosya hangi Apps Script projesinin web adresine istek atıyor.
// (Dağıtım kimliği dosyada geçiyorsa kendiliğinden bulunur; bunlar adresi ayardan alanlar.)
const ARAYUZLER = [
  { ad: 'Mutfak paneli (bap-sistem.pages.dev)', dosyalar: ['bap-sistem/index.html'], proje: ['bap-panel-backend'] },
  { ad: 'Yönetim paneli (bap-panel Worker)', dosyalar: ['bap-panel/page.html', 'bap-panel/worker.template.js'], proje: ['bap-panel-veri-kapisi'] },
  { ad: 'MacBook köprüsü (mac-kopru)', klasor: 'mac-kopru', uzanti: '.mjs', proje: ['bap-yemek-karti', 'kurye-net-calisma-suresi'] },
  { ad: 'Cloudflare eski sayfalar', klasor: 'cloudflare/workers', uzanti: '.html', proje: [] },
];

const YAZMA = new Set(['setValue', 'setValues', 'appendRow', 'insertRowBefore', 'insertRowAfter', 'insertRowsBefore',
  'insertRowsAfter', 'insertRows', 'deleteRow', 'deleteRows', 'clear', 'clearContent', 'clearContents', 'setFormula',
  'setFormulas', 'setFormulaR1C1', 'setFormulasR1C1', 'setRichTextValue', 'setRichTextValues', 'sort', 'copyTo',
  'moveTo', 'setName', 'insertColumnAfter', 'insertColumnBefore', 'insertColumns', 'deleteColumn', 'deleteColumns',
  'insertCheckboxes', 'removeCheckboxes', 'setDataValidation', 'setDataValidations', 'autoResizeColumns', 'hideSheet',
  'appendRows', 'setFrozenRows', 'deleteSheet', 'activate']);
const BICIM_YAZMA = new Set(['setFrozenRows', 'autoResizeColumns', 'hideSheet', 'activate']); // yazma ama veri değil
const BASLIK_FN = /kolon|kol$|^kol|sutun|sütun|baslik|başlık|^col|^idx$|^ix$|^ind(e|i)x|^hi$|^sx$|^bas$/i;
const BASLIK_DEG = /^(b|h|bs|bas|bsl|baslik|basliklar|başlık|başlıklar|hdr|hdrs|header|headers|head|H|B|tb|kb|ub|ab|hb|baslikSatiri|ilk)$/;
const AKSIYON_ANAHTAR = /^(action|tur|islem|adim|sayfa|aksiyon)$/;
const YANIT_FN = /^(json|jsonRes|json_|jsonYanit_|_kopruYanit|cevap_|yanit_|out_|onbellekli_|performansYaz_)$/i;

// ───────────────────────── Yardımcılar ─────────────────────────

const TR = { 'ı': 'i', 'İ': 'i', 'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g', 'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c' };
const sade = s => String(s).replace(/[ıİşŞğĞüÜöÖçÇ]/g, c => TR[c]).toLowerCase().replace(/[\s_\-]+/g, ' ').trim();
const benzersiz = a => [...new Set(a)];
const sirala = a => [...a].sort((x, y) => String(x).localeCompare(String(y), 'tr'));

function dosyalariListele(klasor, uzanti) {
  const tam = path.join(KOK, klasor);
  if (!fs.existsSync(tam)) return [];
  const out = [];
  for (const g of fs.readdirSync(tam, { withFileTypes: true })) {
    const p = path.join(klasor, g.name);
    if (g.isDirectory()) out.push(...dosyalariListele(p, uzanti));
    else if (!uzanti || g.name.endsWith(uzanti)) out.push(p);
  }
  return out.sort();
}

// ───────────────────────── Sözcük ayırıcı (tokenizer) ─────────────────────────

const OPS3 = ['===', '!==', '...', '**=', '<<=', '>>=', '||=', '&&=', '??=', '>>>'];
const OPS2 = ['==', '!=', '=>', '&&', '||', '??', '?.', '<=', '>=', '++', '--', '+=', '-=', '*=', '/=', '%=', '**', '<<', '>>', '|=', '&=', '^='];
const REGEX_ONCESI = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^',
  '==', '===', '!=', '!==', '&&', '||', '??', '=>', '+=', '-=', '<=', '>=', '?.']);
const REGEX_KELIME = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do']);

function sozcukle(src) {
  const T = []; let i = 0, satir = 1; const n = src.length;
  const son = () => T[T.length - 1];
  while (i < n) {
    const c = src[i];
    if (c === '\n') { satir++; i++; continue; }
    if (c <= ' ' || c === '\u00a0' || c === '\ufeff') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2), bit = e < 0 ? n : e + 2;
      for (let k = i; k < bit; k++) if (src[k] === '\n') satir++;
      i = bit; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const s0 = satir; let j = i + 1, s = '';
      while (j < n && src[j] !== c) {
        const d = src[j];
        if (d === '\\') { const e = src[j + 1]; s += e === 'n' ? '\n' : e === 't' ? '\t' : (e || ''); if (e === '\n') satir++; j += 2; continue; }
        if (d === '\n') { satir++; if (c !== '`') break; }
        if (c === '`' && d === '$' && src[j + 1] === '{') {
          let derin = 1; j += 2; s += '…';
          while (j < n && derin > 0) { if (src[j] === '{') derin++; else if (src[j] === '}') derin--; else if (src[j] === '\n') satir++; j++; }
          continue;
        }
        s += d; j++;
      }
      T.push({ t: 's', v: s, l: s0, sablon: c === '`' && s.includes('…') }); i = j + 1; continue;
    }
    const o = son();
    if (c === '/' && (!o || (o.t === 'p' && REGEX_ONCESI.has(o.v)) || (o.t === 'i' && REGEX_KELIME.has(o.v)))) {
      let j = i + 1, sinif = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') sinif = true; else if (src[j] === ']') sinif = false;
        else if (src[j] === '/' && !sinif) break;
        j++;
      }
      j++; while (j < n && /[a-z]/i.test(src[j])) j++;
      T.push({ t: 'r', v: src.slice(i, j), l: satir }); i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i + 1; while (j < n && /[0-9a-zA-Z_.]/.test(src[j])) j++;
      T.push({ t: 'n', v: src.slice(i, j), l: satir }); i = j; continue;
    }
    if (/[A-Za-z_$\u00C0-\uFFFF]/.test(c)) {
      let j = i + 1; while (j < n && /[\w$\u00C0-\uFFFF]/.test(src[j])) j++;
      T.push({ t: 'i', v: src.slice(i, j), l: satir }); i = j; continue;
    }
    const u3 = src.substr(i, 3), u2 = src.substr(i, 2);
    if (src.substr(i, 4) === '>>>=') { T.push({ t: 'p', v: '>>>=', l: satir }); i += 4; continue; }
    if (OPS3.includes(u3)) { T.push({ t: 'p', v: u3, l: satir }); i += 3; continue; }
    if (OPS2.includes(u2)) { T.push({ t: 'p', v: u2, l: satir }); i += 2; continue; }
    T.push({ t: 'p', v: c, l: satir }); i++;
  }
  return T;
}

const ACAN = { '(': ')', '[': ']', '{': '}' };
const KAPA = { ')': '(', ']': '[', '}': '{' };
function eslesen(T, i) { // T[i] açan parantez → kapananın indeksi
  const a = T[i].v, k = ACAN[a]; let d = 0;
  for (let j = i; j < T.length; j++) {
    if (T[j].t !== 'p') continue;
    if (T[j].v === a) d++; else if (T[j].v === k) { d--; if (d === 0) return j; }
  }
  return T.length - 1;
}
function geriEslesen(T, i) { // T[i] kapanan → açanın indeksi
  const k = T[i].v, a = KAPA[k]; let d = 0;
  for (let j = i; j >= 0; j--) {
    if (T[j].t !== 'p') continue;
    if (T[j].v === k) d++; else if (T[j].v === a) { d--; if (d === 0) return j; }
  }
  return 0;
}
function argumanlar(T, ac) { // T[ac] = '(' → [[bas, son], ...] (son hariç)
  const kapa = eslesen(T, ac), out = []; let bas = ac + 1, d = 0;
  for (let j = ac + 1; j < kapa; j++) {
    const t = T[j];
    if (t.t === 'p') {
      if (ACAN[t.v]) d++; else if (KAPA[t.v]) d--;
      else if (t.v === ',' && d === 0) { out.push([bas, j]); bas = j + 1; }
    }
  }
  if (kapa > bas) out.push([bas, kapa]);
  return { args: out, kapa };
}
const tekKimlik = (T, [b, s]) => s - b === 1 && T[b].t === 'i' ? T[b].v : null;
function zincirAdi(T, [b, s]) { // a.b.c biçimindeyse "a.b.c"
  if ((s - b) % 2 === 0) return null;
  const p = [];
  for (let j = b; j < s; j++) {
    if ((j - b) % 2 === 0) { if (T[j].t !== 'i') return null; p.push(T[j].v); }
    else if (T[j].v !== '.') return null;
  }
  return p.join('.');
}

// Bir ifadenin "kökü": sh.getRange(...).setValues → sh
function zincirKoku(T, j) { // T[j] zincirin herhangi bir üyesi; geri yürüyerek kökü bulur
  let k = j;
  while (k > 0) {
    if (T[k].t === 'p' && (T[k].v === ')' || T[k].v === ']')) { k = geriEslesen(T, k) - 1; continue; }
    if (T[k].t === 'i' && T[k - 1] && T[k - 1].t === 'p' && (T[k - 1].v === '.' || T[k - 1].v === '?.')) { k -= 2; continue; }
    break;
  }
  return k;
}
// T[j]'den sonra gelen .a(...).b[...] zincirindeki üye adları ve zincirin bittiği yer
function ileriZincir(T, j) {
  const adlar = []; let k = j + 1;
  while (k < T.length) {
    const t = T[k];
    if (t.t === 'p' && (t.v === '.' || t.v === '?.') && T[k + 1] && T[k + 1].t === 'i') { adlar.push(T[k + 1].v); k += 2; continue; }
    if (t.t === 'p' && (t.v === '(' || t.v === '[')) { k = eslesen(T, k) + 1; continue; }
    break;
  }
  return { adlar, son: k };
}

// ───────────────────────── Dosya kimlikleri ─────────────────────────

function dosyaKimlikleri() {
  const md = oku('docs/veri-sozlugu.md'), harita = {}, adlar = {};
  for (const m of md.matchAll(/^\|\s*([A-Z0-9]+)\s*\|\s*([^|]+?)\s*\|\s*`([A-Za-z0-9_-]{25,})`\s*\|/gm)) {
    harita[m[3]] = m[1]; adlar[m[1]] = m[2];
  }
  return { harita, adlar };
}
const KIMLIK_RE = /^1[A-Za-z0-9_-]{30,}$/;

// ───────────────────────── Proje çözümleme ─────────────────────────

function sabitleriTopla(T, b, s, hedef) { // var X = 'a' | X: 'a' | X = ['a','b'] | X = { K: 'a', A: { B: 'c' } }
  const ekle = (ad, deger) => { if (!hedef.has(ad)) hedef.set(ad, []); hedef.get(ad).push(...deger); };
  const nesne = (onek, ac) => {
    const kapa = eslesen(T, ac); let j = ac + 1;
    while (j < kapa) {
      const t = T[j];
      if ((t.t === 'i' || t.t === 's') && T[j + 1] && T[j + 1].v === ':') {
        const v = T[j + 2];
        if (v && v.t === 's' && T[j + 3] && (T[j + 3].v === ',' || T[j + 3].v === '}')) ekle(onek + '.' + t.v, [v.v]);
        else if (v && v.v === '{') { nesne(onek + '.' + t.v, j + 2); j = eslesen(T, j + 2); continue; }
        else if (v && v.v === '[') { const dz = dizi(j + 2); if (dz) ekle(onek + '.' + t.v, dz); }
      }
      if (t.t === 'p' && ACAN[t.v] && j !== ac) { j = eslesen(T, j) + 1; continue; }
      j++;
    }
  };
  const dizi = ac => {
    const kapa = eslesen(T, ac), d = [];
    for (let j = ac + 1; j < kapa; j++) { if (T[j].t === 's') d.push(T[j].v); else if (T[j].v !== ',') return null; }
    return d;
  };
  for (let j = b; j < s; j++) {
    if (T[j].t !== 'p' || T[j].v !== '=' || !T[j - 1] || T[j - 1].t !== 'i') continue;
    const k0 = zincirKoku(T, j - 1), ad = zincirAdi(T, [k0, j]);
    if (!ad) continue;
    const v = T[j + 1], sonra = T[j + 2];
    if (v && v.t === 's' && !v.sablon && (!sonra || ![ '+', '.', '[', '?', '||', '&&' ].includes(sonra.v))) ekle(ad, [v.v]);
    else if (v && v.v === '{') nesne(ad, j + 1);
    else if (v && v.v === '[') { const dz = dizi(j + 1); if (dz && dz.length) ekle(ad, dz); }
  }
}

function fonksiyonlariBul(T) {
  const F = []; let d = 0;
  for (let j = 0; j < T.length; j++) {
    const t = T[j];
    if (t.t === 'p' && t.v === '{') { d++; continue; }
    if (t.t === 'p' && t.v === '}') { d--; continue; }
    if (d !== 0) continue;
    let ad = null, pAc = -1;
    if (t.t === 'i' && t.v === 'function' && T[j + 1] && T[j + 1].t === 'i' && T[j + 2] && T[j + 2].v === '(') { ad = T[j + 1].v; pAc = j + 2; }
    else if (t.t === 'i' && ['var', 'let', 'const'].includes(t.v) && T[j + 1] && T[j + 1].t === 'i' && T[j + 2] && T[j + 2].v === '=') {
      const r = T[j + 3];
      if (r && r.v === 'function') { ad = T[j + 1].v; pAc = T[j + 4] && T[j + 4].v === '(' ? j + 4 : j + 5; }
      else if (r && r.v === '(') { const k = eslesen(T, j + 3); if (T[k + 1] && T[k + 1].v === '=>') { ad = T[j + 1].v; pAc = j + 3; } }
      else if (r && r.t === 'i' && T[j + 4] && T[j + 4].v === '=>') { ad = T[j + 1].v; pAc = -2; }
    }
    if (!ad) continue;
    let parametreler = [], govdeAc;
    if (pAc === -2) { parametreler = [T[j + 3].v]; govdeAc = j + 5; }
    else {
      const { args, kapa } = argumanlar(T, pAc);
      parametreler = args.map(a => T[a[0]].t === 'i' ? T[a[0]].v : (T[a[0] + 1] && T[a[0] + 1].t === 'i' ? T[a[0] + 1].v : null));
      govdeAc = kapa + 1; if (T[govdeAc] && T[govdeAc].v === '=>') govdeAc++;
    }
    if (!T[govdeAc] || T[govdeAc].v !== '{') continue; // tek satırlık ok fonksiyonu: atla
    const govdeSon = eslesen(T, govdeAc);
    F.push({ ad, parametreler, b: govdeAc + 1, s: govdeSon, l: t.l });
    j = govdeSon; // içini atla (d değişmez)
  }
  return F;
}

// Bir atamanın sağ tarafının bittiği yer (ASI dahil kaba tahmin)
function ifadeSonu(T, b, sinir) {
  let d = 0;
  for (let j = b; j < sinir; j++) {
    const t = T[j];
    if (t.t === 'p') {
      if (ACAN[t.v]) { j = eslesen(T, j); continue; }
      if (KAPA[t.v]) return j;
      if (t.v === ';' || t.v === ',') return j;
    }
    const n = T[j + 1];
    if (n && n.l > t.l && d === 0) {
      const devam = (n.t === 'p' && ['.', '?.', '+', '-', '*', '/', '||', '&&', '??', '?', ':', '(', '[', '===', '!==', '=='].includes(n.v))
        || (t.t === 'p' && ['.', '?.', '+', '-', '*', '/', '||', '&&', '??', '?', ':', '=', '(', '[', ',', '=>', '==='].includes(t.v));
      if (!devam) return j + 1;
    }
  }
  return sinir;
}

function projeCozumle(klasor, kimlik) {
  const dosyalar = dosyalariListele('apps-script/' + klasor).filter(p => p.endsWith('.gs') || p.endsWith('.html'));
  const kaynaklar = [];
  for (const p of dosyalar) {
    let metin = oku(p);
    if (p.endsWith('.html')) { // yalnız <script> içleri; satır numaraları korunur
      let out = '', son = 0;
      for (const m of metin.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
        out += metin.slice(son, m.index).replace(/[^\n]/g, ' ') + ' '.repeat(m[0].indexOf('>') + 1) + m[1];
        son = m.index + m[0].length - '</script>'.length;
      }
      metin = out;
    }
    kaynaklar.push({ dosya: p, T: sozcukle(metin), html: p.endsWith('.html') });
  }
  const sabit = new Map();
  const fnler = new Map(); // ad → bilgi
  for (const k of kaynaklar) {
    const F = fonksiyonlariBul(k.T);
    // üst düzey (fonksiyon dışı) sabitler
    let onceki = 0;
    for (const f of F) { sabitleriTopla(k.T, onceki, f.b - 1, sabit); onceki = f.s + 1; }
    sabitleriTopla(k.T, onceki, k.T.length, sabit);
    for (const f of F) fnler.set(f.ad, { ...f, T: k.T, dosya: k.dosya, html: k.html });
  }
  const bagli = BAGLI_DOSYA[klasor] || null;

  // Fonksiyon bilgileri (çoklu geçiş: sarmalayıcılar birbirini çağırabilir)
  const bilgi = new Map();
  for (const ad of fnler.keys()) bilgi.set(ad, { sekmeParam: -1, dosyaParam: -1, sabitDosya: null, dondurDosya: null, dondurDosyaIdParam: -1, dondurSekme: null, paramYazar: new Set(), baslikFn: false });

  const degerler = (T, aralik, yerel, parametreler) => { // bir argümandan çıkan metin değerleri
    const out = []; let param = -1;
    const [b, s] = aralik;
    const tk = tekKimlik(T, aralik) || (T[b].t === 'i' && T[b + 1] && T[b + 1].v === '[' && eslesen(T, b + 1) === s - 1 ? T[b].v : null);
    if (tk && parametreler && parametreler.indexOf(tk) >= 0) param = parametreler.indexOf(tk);
    for (let j = b; j < s; j++) {
      const t = T[j];
      if (t.t === 's') {
        const birlesik = (T[j + 1] && T[j + 1].v === '+') || (T[j - 1] && T[j - 1].v === '+') || t.sablon;
        out.push(birlesik ? t.v.replace(/…/g, '') + '…' : t.v);
      } else if (t.t === 'i' && !(T[j - 1] && (T[j - 1].v === '.' || T[j - 1].v === '?.'))) {
        let k = j; while (T[k + 1] && T[k + 1].v === '.' && T[k + 2] && T[k + 2].t === 'i') k += 2;
        if (T[k + 1] && T[k + 1].v === '(') { j = k; continue; }
        const ad = zincirAdi(T, [j, k + 1]);
        const v = (yerel && yerel.get(ad)) || sabit.get(ad);
        if (v) out.push(...v);
        j = k;
      }
    }
    return { degerler: benzersiz(out.filter(x => x && x.length < 90 && !x.includes('\n'))), param };
  };

  const dosyaCoz = (T, aralik, ctx) => { // ifade hangi e-tabloyu açıyor
    const [b, s] = aralik;
    for (let j = b; j < s; j++) {
      const t = T[j];
      if (t.t !== 'i') continue;
      if ((t.v === 'openById' || t.v === 'openByUrl') && T[j + 1] && T[j + 1].v === '(') {
        const { args } = argumanlar(T, j + 1);
        if (!args.length) return null;
        const { degerler: v } = degerler(T, args[0], ctx.yerel);
        const id = v.map(x => (x.match(/[-\w]{30,}/) || [])[0]).find(x => x && KIMLIK_RE.test(x));
        if (id) return kimlik.harita[id] || ('ID:' + id.slice(0, 10) + '…');
        const pi = ctx.parametreler.indexOf(tekKimlik(T, args[0]));
        if (pi >= 0) return { idParam: pi };
        return null;
      }
      if ((t.v === 'getActiveSpreadsheet' || (t.v === 'getActive' && T[j - 2] && T[j - 2].v === 'SpreadsheetApp')) && T[j + 1] && T[j + 1].v === '(')
        return bagli || ('BAĞLI:' + klasor);
    }
    const tk = zincirAdi(T, aralik);
    if (tk) {
      if (ctx.dosyaDeg.has(tk)) return ctx.dosyaDeg.get(tk);
      const pi = ctx.parametreler.indexOf(tk); if (pi >= 0) return { param: pi };
    }
    if (T[b] && T[b].t === 'i' && T[b + 1] && T[b + 1].v === '(' && bilgi.get(T[b].v)) {
      const fb = bilgi.get(T[b].v);
      if (fb.dondurDosya) return fb.dondurDosya;
      if (fb.dondurDosyaIdParam >= 0) {
        const { args } = argumanlar(T, b + 1);
        const a = args[fb.dondurDosyaIdParam];
        if (a) {
          const { degerler: v } = degerler(T, a, ctx.yerel);
          const id = v.map(x => (x.match(/[-\w]{30,}/) || [])[0]).find(x => x && KIMLIK_RE.test(x));
          if (id) return kimlik.harita[id] || ('ID:' + id.slice(0, 10) + '…');
          const pi = ctx.parametreler.indexOf(tekKimlik(T, a));
          if (pi >= 0) return { idParam: pi };
        }
      }
    }
    return null;
  };

  let sonuc;
  for (let gecis = 0; gecis < 4; gecis++) {
    sonuc = { refler: [], basliklar: [], cagrilar: new Map(), cozulemeyen: [], cagriYerleri: [] };
    for (const [ad, f] of fnler) {
      const T = f.T, fb = bilgi.get(ad);
      const yerel = new Map(); sabitleriTopla(T, f.b, f.s, yerel);
      const ctx = { yerel, parametreler: f.parametreler, dosyaDeg: new Map() };
      const sekmeDeg = new Map(); // değişken → [{sekme, dosya}] ya da {param}
      const veriDeg = new Map();  // değişken → sekmeler (getValues sonucu)
      const baslikDeg = new Map(); // değişken → sekmeler
      const yerelBaslikFn = new Set();
      const golge = new Set(); // fonksiyon içinde tanımlanan aynı adlı yerel fonksiyonlar / değişkenler
      for (let q = f.b; q < f.s; q++) {
        if (T[q].t === 'i' && T[q].v === 'function' && T[q + 1] && T[q + 1].t === 'i') golge.add(T[q + 1].v);
        if (T[q].t === 'i' && ['var', 'let', 'const'].includes(T[q].v) && T[q + 1] && T[q + 1].t === 'i') golge.add(T[q + 1].v);
      }
      const refler = [];
      const cagri = new Set();
      const refEkle = (sekmeler, dosya, satir, nasil, yazar) => {
        const r = sekmeler.filter(s => /^[\p{L}\p{N}]/u.test(s) && s.length <= 45).map(s => ({ fn: ad, sekme: s, dosya, satir, dosyaAdi: f.dosya, nasil, yazar: !!yazar }));
        refler.push(...r); return r;
      };
      const yazmaIsaretle = (hedef, ad2, bicim) => { for (const r of hedef) { if (bicim) r.bicim = true; else r.yazar = true; r.yazmaYolu = ad2; } };
      const zincirYazar = adlar => { const y = adlar.find(a => YAZMA.has(a)); return y ? { y, bicim: BICIM_YAZMA.has(y) } : null; };

      for (let j = f.b; j < f.s; j++) {
        const t = T[j];
        // 1) atama: x = ...
        if (t.t === 'p' && t.v === '=' && T[j - 1] && T[j - 1].t === 'i') {
          const k0 = zincirKoku(T, j - 1), hedef = zincirAdi(T, [k0, j]);
          if (hedef) {
            const son = ifadeSonu(T, j + 1, f.s), sag = [j + 1, son];
            const ilk = T[j + 1];
            const okFn = ilk && (ilk.v === 'function' || (ilk.v === '(' && T[eslesen(T, j + 1) + 1] && T[eslesen(T, j + 1) + 1].v === '=>') || (ilk.t === 'i' && T[j + 2] && T[j + 2].v === '=>'));
            if (okFn) {
              for (let q = j + 1; q < son; q++) if (T[q].t === 'i' && (baslikDeg.has(T[q].v) || BASLIK_FN.test(T[q].v) || (bilgi.get(T[q].v) || {}).baslikFn)) { yerelBaslikFn.add(hedef); break; }
            } else {
              const sagMetin = T.slice(j + 1, son).map(x => x.v);
              const sheetGetter = sagMetin.includes('getSheetByName') || sagMetin.includes('insertSheet');
              const d = dosyaCoz(T, sag, ctx);
              if (d && !sheetGetter) ctx.dosyaDeg.set(hedef, d);
              const kok = T[j + 1] && T[j + 1].t === 'i' ? T[j + 1].v : null;
              // getValues()[0], v[0], .shift(), getRange(1, ...)
              const sonIki = sagMetin.slice(-3).join('');
              const baslikMi = /\[0\]$/.test(sonIki) || sagMetin.includes('shift') || (sagMetin.join(' ').match(/getRange \( 1 ,/) && /get(Display)?Values/.test(sagMetin.join(' ')))
                || (sagMetin.includes('map') && sagMetin.indexOf('[') >= 0 && sagMetin[sagMetin.indexOf('[') + 1] === '0' && sagMetin[sagMetin.indexOf('[') + 2] === ']');
              if (kok && sekmeDeg.has(kok)) {
                const kaynak = sekmeDeg.get(kok);
                if (baslikMi) baslikDeg.set(hedef, kaynak); else veriDeg.set(hedef, kaynak);
              } else if (kok && veriDeg.has(kok)) {
                if (baslikMi) baslikDeg.set(hedef, veriDeg.get(kok)); else veriDeg.set(hedef, veriDeg.get(kok));
              } else if (baslikMi && /get(Display)?Values/.test(sagMetin.join(' '))) baslikDeg.set(hedef, []);
              if (BASLIK_DEG.test(hedef) && !baslikDeg.has(hedef) && baslikMi) baslikDeg.set(hedef, []);
              t._hedef = hedef; // sonraki adımda (sekme alma) kullanılır
              // var sekme = String(b.sekme || AP_HM) → sekme ≈ AP_HM
              if (!yerel.has(hedef) && son - j > 2 && T.slice(j + 1, son).every((x, q) => x.t === 's' || x.t === 'i' || ['.', '||', '??', '(', ')'].includes(x.v))
                && T.slice(j + 1, son).every((x, q, a) => !(a[q + 1] && a[q + 1].v === '(') || x.v === 'String' || x.v === 'trim')) {
                const { degerler: dv } = degerler(T, sag, yerel);
                if (dv.length) yerel.set(hedef, dv);
              }
            }
          }
          continue;
        }
        if (t.t !== 'i') continue;
        const sonraki = T[j + 1], onceki = T[j - 1];
        const uye = onceki && (onceki.v === '.' || onceki.v === '?.');
        // atamanın hedefi (varsa): j'den geri "=" ara (aynı ifade içinde)
        const atamaHedefi = () => {
          let k = zincirKoku(T, j);
          if (T[k - 1] && T[k - 1].v === '=' && T[k - 1]._hedef) return T[k - 1]._hedef;
          return null;
        };

        // 2) sekme alma: x.getSheetByName('Ad') / x.insertSheet('Ad')
        if (uye && (t.v === 'getSheetByName' || t.v === 'insertSheet') && sonraki && sonraki.v === '(') {
          const { args, kapa } = argumanlar(T, j + 1);
          if (!args.length) continue;
          const { degerler: ss, param } = degerler(T, args[0], yerel, f.parametreler);
          const kok = zincirKoku(T, j - 2);
          let dosya = dosyaCoz(T, [kok, j - 1], ctx), dParam = -1;
          if (dosya && typeof dosya === 'object') { if (dosya.param !== undefined) { fb.dosyaParam = dosya.param; dParam = dosya.param; } dosya = null; }
          if (param >= 0) { fb.sekmeParam = param; if (dosya) fb.sabitDosya = dosya; }
          const { adlar } = ileriZincir(T, kapa);
          const yz = t.v === 'insertSheet' ? { y: 'insertSheet' } : zincirYazar(adlar);
          let r = [];
          if (ss.length) { r = refEkle(ss, dosya, t.l, t.v === 'insertSheet' ? 'oluşturur' : '', yz && !yz.bicim); if (dParam >= 0) r.forEach(x => { x.dosyaParam = dParam; }); }
          else if (param < 0) sonuc.cozulemeyen.push({ proje: klasor, fn: ad, dosya: f.dosya, satir: t.l, ifade: T.slice(args[0][0], args[0][1]).map(x => x.v).join(' ').slice(0, 60) });
          const h = atamaHedefi();
          if (h) sekmeDeg.set(h, param >= 0 ? { param } : r);
          // return ss.getSheetByName(...)
          const kk = zincirKoku(T, j);
          if (T[kk - 1] && T[kk - 1].v === 'return') fb.dondurSekme = param >= 0 ? { param } : r;
          continue;
        }

        // 3) proje fonksiyonu çağrısı
        if (!uye && sonraki && sonraki.v === '(' && fnler.has(t.v) && t.v !== ad && !golge.has(t.v)) {
          cagri.add(t.v);
          const hb = bilgi.get(t.v);
          const { args, kapa } = argumanlar(T, j + 1);
          const { adlar } = ileriZincir(T, kapa);
          const yz = zincirYazar(adlar);
          let r = [];
          if (hb.sekmeParam >= 0 && args[hb.sekmeParam]) { // sarmalayıcı: tabloAl_(ss, 'Ad')
            const { degerler: ss, param } = degerler(T, args[hb.sekmeParam], yerel, f.parametreler);
            let dosya = hb.sabitDosya, dParam = -1;
            if (!dosya && hb.dosyaParam >= 0 && args[hb.dosyaParam]) {
              dosya = dosyaCoz(T, args[hb.dosyaParam], ctx);
              if (dosya && typeof dosya === 'object') { if (dosya.param !== undefined) { fb.dosyaParam = dosya.param; dParam = dosya.param; } dosya = null; }
            }
            if (param >= 0) { fb.sekmeParam = param; if (dosya) fb.sabitDosya = dosya; }
            if (ss.length) { r = refEkle(ss, dosya, t.l, 'via ' + t.v, (yz && !yz.bicim) || hb.paramYazar.has(-1)); if (dParam >= 0) r.forEach(x => { x.dosyaParam = dParam; }); }
          } else if (Array.isArray(hb.dondurSekme) && hb.dondurSekme.length) {
            for (const d0 of hb.dondurSekme) r.push(...refEkle([d0.sekme], d0.dosya, t.l, 'via ' + t.v, yz && !yz.bicim));
          }
          sonuc.cagriYerleri.push({ arayan: ad, aranan: t.v, dosyalar: args.map(a => { const d = dosyaCoz(T, a, ctx); return d && typeof d === 'object' ? (d.param !== undefined ? { param: d.param } : null) : d; }) });
          const h = atamaHedefi();
          if (h && r.length) sekmeDeg.set(h, r);
          if (h && hb.dondurDosya) ctx.dosyaDeg.set(h, hb.dondurDosya);
          // sekme değişkenini başka fonksiyona veriyorsa ve o fonksiyon o parametreye yazıyorsa
          args.forEach((a, i) => {
            const tk = tekKimlik(T, a);
            if (tk && sekmeDeg.has(tk) && hb.paramYazar.has(i)) {
              const sd = sekmeDeg.get(tk);
              if (Array.isArray(sd)) yazmaIsaretle(sd, t.v + '()'); else if (sd.param !== undefined) fb.paramYazar.add(sd.param);
            }
            // başlık: kolon_(b, ['Ad'])
            if (tk && baslikDeg.has(tk)) hb.baslikFn = true;
          });
          if (hb.baslikFn || BASLIK_FN.test(t.v)) {
            const kaynak = args.map(a => tekKimlik(T, a)).find(x => x && baslikDeg.has(x));
            args.forEach((a, i) => {
              if (tekKimlik(T, a)) return;
              for (let q = a[0]; q < a[1]; q++) if (T[q].t === 's' && !T[q].sablon && !(T[q + 1] && T[q + 1].v === '+')) sonuc.basliklar.push({ fn: ad, baslik: T[q].v, sekmeler: kaynak ? baslikDeg.get(kaynak) : null, satir: T[q].l });
            });
          }
          continue;
        }

        // başlık sabiti: HP_DOGRULUK_BASLIK = ['Tarih', 'Şube', ...] fonksiyonda kullanılıyorsa o sekmenin başlıklarıdır
        if (!uye && /BASLIK|BAŞLIK|HEADER|KOLONLAR|SUTUNLAR/i.test(t.v) && !(sonraki && sonraki.v === '=')) {
          let k = j; while (T[k + 1] && T[k + 1].v === '.' && T[k + 2] && T[k + 2].t === 'i') k += 2;
          const ad2 = zincirAdi(T, [j, k + 1]), v = (yerel.get(ad2) || sabit.get(ad2));
          if (v && v.length >= 2) for (const b of v) sonuc.basliklar.push({ fn: ad, baslik: b, sekmeler: null, satir: t.l, sabit: true });
        }
        // 4) yerel başlık fonksiyonu: ix('Ad'), al('Ad')
        if (!uye && sonraki && sonraki.v === '(' && (yerelBaslikFn.has(t.v) || (BASLIK_FN.test(t.v) && !fnler.has(t.v)))) {
          const { args } = argumanlar(T, j + 1);
          for (const a of args) for (let q = a[0]; q < a[1]; q++) if (T[q].t === 's' && !T[q].sablon && !(T[q + 1] && T[q + 1].v === '+')) sonuc.basliklar.push({ fn: ad, baslik: T[q].v, sekmeler: null, satir: T[q].l });
          continue;
        }

        // 5) başlık dizisinde arama: b.indexOf('Ad')
        if (!uye && sonraki && (sonraki.v === '.' || sonraki.v === '?.') && T[j + 2] && ['indexOf', 'findIndex', 'includes'].includes(T[j + 2].v)
          && (baslikDeg.has(t.v) || BASLIK_DEG.test(t.v)) && T[j + 3] && T[j + 3].v === '(') {
          const { args } = argumanlar(T, j + 3);
          if (args[0]) for (let q = args[0][0]; q < args[0][1]; q++) if (T[q].t === 's' && !T[q].sablon) sonuc.basliklar.push({ fn: ad, baslik: T[q].v, sekmeler: baslikDeg.get(t.v) || null, satir: T[q].l });
        }

        // sekme nesnesi başka bir yapıya konuyorsa ({ fiyatSh: sh }, liste.push(sh)) başka bir fonksiyon ona yazabilir
        if (!uye && sekmeDeg.has(t.v) && Array.isArray(sekmeDeg.get(t.v)) && onceki && (onceki.v === ':' || (onceki.v === '(' && T[j - 2] && T[j - 2].v === 'push'))
          && sonraki && [',', '}', ')'].includes(sonraki.v)) for (const r of sekmeDeg.get(t.v)) r.kacar = true;
        // 6) sekme değişkeni üzerinden yazma: sh.getRange(...).setValues(...)
        if (!uye && sekmeDeg.has(t.v) && sonraki && (sonraki.v === '.' || sonraki.v === '?.')) {
          const { adlar } = ileriZincir(T, j);
          const yz = zincirYazar(adlar);
          if (yz) {
            const sd = sekmeDeg.get(t.v);
            if (Array.isArray(sd)) yazmaIsaretle(sd, yz.y, yz.bicim);
            else if (sd.param !== undefined && !yz.bicim) fb.paramYazar.add(-1);
          }
        }
        // parametre üzerinden yazma: function yaz_(sh) { sh.getRange().setValues() }
        const pi = !uye ? f.parametreler.indexOf(t.v) : -1;
        if (pi >= 0 && sonraki && sonraki.v === '.') {
          const { adlar } = ileriZincir(T, j);
          const yz = zincirYazar(adlar);
          if (yz && !yz.bicim && (adlar[0] === 'getRange' || adlar[0] === 'appendRow' || adlar[0] === 'clear' || adlar[0] === 'clearContents' || adlar[0] === 'getDataRange' || adlar[0] === 'deleteRow' || adlar[0] === 'deleteRows' || adlar[0] === 'insertRowsAfter' || adlar[0] === 'sort')) fb.paramYazar.add(pi);
        }
        // return SpreadsheetApp.openById(...)
        if (t.v === 'return') {
          const son = ifadeSonu(T, j + 1, f.s);
          const metin = T.slice(j + 1, son).map(x => x.v);
          if (!metin.includes('getSheetByName')) {
            const d = dosyaCoz(T, [j + 1, son], ctx);
            if (d && typeof d === 'string') fb.dondurDosya = d;
            else if (d && d.idParam !== undefined) fb.dondurDosyaIdParam = d.idParam;
          }
          const tk = tekKimlik(T, [j + 1, son]);
          if (tk && sekmeDeg.has(tk)) { const sd = sekmeDeg.get(tk); fb.dondurSekme = sd; }
        }
        // dosya değişkenini alan sarmalayıcı: dosyası sabit sarmalayıcıda yalnız bir dosya açılıyorsa
      }
      if (!fb.dondurDosya && fb.dondurDosyaIdParam < 0) {
        for (let q = f.b; q < f.s; q++) if (T[q].v === 'create' && T[q - 2] && T[q - 2].v === 'SpreadsheetApp' && T[q + 1] && T[q + 1].v === '(') {
          const { args } = argumanlar(T, q + 1);
          const ad0 = args[0] && degerler(T, args[0], yerel).degerler.find(x => x && !x.endsWith('…'));
          if (!ad0) continue;
          const adi = 'AD:' + ad0;
          fb.dondurDosya = adi;
          for (const [k, v] of ctx.dosyaDeg) if (v === null) ctx.dosyaDeg.set(k, adi);
          break;
        }
      }
      // fonksiyonun tek bir açtığı dosya varsa, dosyası boş kalan referanslara onu ver
      const dosyalar = benzersiz([...ctx.dosyaDeg.values()].filter(x => typeof x === 'string'));
      for (const r of refler) {
        if (!r.dosya && dosyalar.length === 1) r.dosya = dosyalar[0];
        if (r.dosya && fb.sekmeParam >= 0 && !fb.sabitDosya && dosyalar.length === 1) fb.sabitDosya = dosyalar[0];
      }
      if (fb.sekmeParam >= 0 && !fb.sabitDosya && fb.dosyaParam < 0 && dosyalar.length === 1) fb.sabitDosya = dosyalar[0];
      if (fb.sekmeParam >= 0 && fb.dosyaParam < 0 && !fb.sabitDosya && /getActive/.test(T.slice(f.b, f.s).map(x => x.v).join(' '))) fb.sabitDosya = bagli;
      sonuc.refler.push(...refler);
      sonuc.cagrilar.set(ad, cagri);
    }
  }

  // Dosyası parametreyle gelen sekmeler: kokpitOku_(ss) → çağıranın ss'i hangi dosyaysa o
  const paramDosya = new Map(); // fn → Map(idx → Set(dosya))
  const ekleP = (fn, i, d) => {
    if (!paramDosya.has(fn)) paramDosya.set(fn, new Map());
    const m = paramDosya.get(fn); if (!m.has(i)) m.set(i, new Set());
    if (m.get(i).has(d)) return false; m.get(i).add(d); return true;
  };
  for (let tur = 0, degisti = true; tur < 12 && degisti; tur++) {
    degisti = false;
    for (const c of sonuc.cagriYerleri) c.dosyalar.forEach((d, i) => {
      if (typeof d === 'string') { if (ekleP(c.aranan, i, d)) degisti = true; }
      else if (d && d.param !== undefined) {
        const m = paramDosya.get(c.arayan); const s = m && m.get(d.param);
        if (s) for (const x of s) if (ekleP(c.aranan, i, x)) degisti = true;
      }
    });
  }
  const yeniRefler = [];
  for (const r of sonuc.refler) {
    if (!r.dosya && r.dosyaParam !== undefined) {
      const s = paramDosya.get(r.fn) && paramDosya.get(r.fn).get(r.dosyaParam);
      if (s && s.size) { for (const d of s) yeniRefler.push({ ...r, dosya: d }); continue; }
    }
    yeniRefler.push(r);
  }
  sonuc.refler = yeniRefler;

  // Giriş noktaları
  const girisler = []; // { fn, tur, aciklama }
  const tumMetin = kaynaklar.map(k => k.T);
  // web eylemi aranacak fonksiyonlar: doGet/doPost ve onlardan en çok iki adımda çağrılanlar
  const webYakin = new Set(['doGet', 'doPost']);
  for (let adim = 0; adim < 2; adim++) for (const f of [...webYakin]) for (const c of sonuc.cagrilar.get(f) || []) webYakin.add(c);
  const kapsayanFn = (T, j) => { for (const f of fnler.values()) if (f.T === T && f.b <= j && j < f.s) return f; return null; };
  for (const k of kaynaklar) {
    const T = k.T;
    for (let j = 0; j < T.length; j++) {
      const t = T[j];
      if (t.t === 'i' && t.v === 'newTrigger' && T[j + 1] && T[j + 1].v === '(') {
        const { args, kapa } = argumanlar(T, j + 1);
        if (!args.length) continue;
        const { degerler: fn } = degerler(T, args[0], null);
        const ileri = []; let q = kapa + 1;
        while (q < T.length && !(T[q].v === ';') && T[q].v !== 'create') { ileri.push(T[q]); q++; }
        const metin = ileri.map(x => x.v).join(' ');
        const sayi = isim => { const m = metin.match(new RegExp(isim + ' \\( ([0-9]+)')); return m ? Number(m[1]) : null; };
        let a = '';
        if (/everyMinutes/.test(metin)) a = `her ${sayi('everyMinutes') || '?'} dk`;
        else if (/everyHours/.test(metin)) a = sayi('everyHours') === 1 ? 'her saat' : `her ${sayi('everyHours') || '?'} saatte`;
        else if (/everyDays|atHour/.test(metin)) { const s = sayi('atHour'); a = (/onWeekDay/.test(metin) ? 'haftada bir' : 'her gün') + (s !== null ? ` ${String(s).padStart(2, '0')}:${String(sayi('nearMinute') || 0).padStart(2, '0')}` : ''); }
        else if (/onWeekDay/.test(metin)) a = 'haftada bir';
        else if (/onEdit/.test(metin)) a = 'tabloda düzenleme olunca';
        else if (/onFormSubmit/.test(metin)) a = 'form gönderilince';
        else if (/onChange/.test(metin)) a = 'tablo değişince';
        else if (/onOpen/.test(metin)) a = 'tablo açılınca';
        else if (/after/.test(metin)) a = 'bir kez (gecikmeli)';
        else a = 'zamanlayıcı';
        for (const f of fn) if (fnler.has(f)) girisler.push({ fn: f, tur: 'zamanlayici', aciklama: a, dosya: k.dosya, satir: t.l });
      }
      if (t.t === 'i' && t.v === 'addItem' && T[j - 1] && T[j - 1].v === '.' && T[j + 1] && T[j + 1].v === '(') {
        const { args } = argumanlar(T, j + 1);
        if (args.length >= 2) {
          const et = T[args[0][0]].t === 's' ? T[args[0][0]].v : '?';
          const fn = T[args[1][0]].t === 's' ? T[args[1][0]].v : null;
          if (fn && fnler.has(fn)) girisler.push({ fn, tur: 'menu', aciklama: `menü: ${et}`, dosya: k.dosya, satir: t.l });
        }
      }
      // web eylemi: x.action === 'ad' ... fonksiyon(
      if (t.t === 'p' && (t.v === '===' || t.v === '==') && T[j + 1] && T[j + 1].t === 's' && T[j - 1] && T[j - 1].t === 'i' && AKSIYON_ANAHTAR.test(T[j - 1].v)
        && (kapsayanFn(T, j) || {}).ad && webYakin.has(kapsayanFn(T, j).ad)) {
        // aynı koşulun gövdesindeki ilk proje fonksiyonları
        let q = j + 2, d = 0; const bulunan = [];
        // if (...) { ... }  ya da  if (...) return f(...)
        while (q < T.length && T[q].v !== ')') q++;
        q++;
        const bit = T[q] && T[q].v === '{' ? eslesen(T, q) : ifadeSonu(T, q, T.length);
        for (let z = q; z < Math.min(bit, q + 400); z++) {
          if (T[z].t === 'i' && T[z + 1] && T[z + 1].v === '(' && fnler.has(T[z].v) && !YANIT_FN.test(T[z].v) && !(T[z - 1] && T[z - 1].v === '.')) bulunan.push(T[z].v);
        }
        const kapsayan = [...fnler.values()].find(f => f.T === T && f.b <= j && j < f.s);
        for (const f of benzersiz(bulunan).slice(0, 3)) girisler.push({ fn: f, tur: 'web', anahtar: T[j - 1].v, eylem: T[j + 1].v, aciklama: `web: ${T[j - 1].v}=${T[j + 1].v}`, dosya: k.dosya, satir: t.l, ust: kapsayan && kapsayan.ad });
        if (!bulunan.length && kapsayan) girisler.push({ fn: kapsayan.ad, tur: 'web', anahtar: T[j - 1].v, eylem: T[j + 1].v, aciklama: `web: ${T[j - 1].v}=${T[j + 1].v}`, dosya: k.dosya, satir: t.l, ust: kapsayan.ad });
      }
      // case 'ad': f(...)
      if (t.t === 'i' && t.v === 'case' && T[j + 1] && T[j + 1].t === 's' && T[j + 2] && T[j + 2].v === ':') {
        const kapsayan = [...fnler.values()].find(f => f.T === T && f.b <= j && j < f.s);
        if (kapsayan && webYakin.has(kapsayan.ad)) {
          for (let z = j + 3; z < Math.min(T.length, j + 60); z++) {
            if (T[z].v === 'case' || T[z].v === 'default') break;
            if (T[z].t === 'i' && T[z + 1] && T[z + 1].v === '(' && fnler.has(T[z].v) && !YANIT_FN.test(T[z].v) && !(T[z - 1] && T[z - 1].v === '.')) {
              girisler.push({ fn: T[z].v, tur: 'web', anahtar: 'case', eylem: T[j + 1].v, aciklama: `web: ${T[j + 1].v}`, dosya: k.dosya, satir: t.l, ust: kapsayan.ad });
              break;
            }
          }
        }
      }
    }
    // HTML ekranından google.script.run.fn()
    if (k.html) {
      const ham = oku(k.dosya);
      if (/google\.script\.run/.test(ham)) for (const m of ham.matchAll(/\.\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
        if (fnler.has(m[1]) && !/^(with|get|set)/.test(m[1])) girisler.push({ fn: m[1], tur: 'ekran', aciklama: `ekran: ${path.basename(k.dosya)}`, dosya: k.dosya });
      }
    }
  }
  for (const ad of fnler.keys()) {
    if (['onOpen', 'onEdit', 'onInstall', 'onFormSubmit', 'onChange'].includes(ad)) girisler.push({ fn: ad, tur: 'otomatik', aciklama: { onOpen: 'tablo açılınca', onEdit: 'tabloda düzenleme olunca', onInstall: 'kurulunca', onFormSubmit: 'form gönderilince', onChange: 'tablo değişince' }[ad] });
    if (ad === 'doGet' || ad === 'doPost') girisler.push({ fn: ad, tur: 'web', aciklama: ad === 'doGet' ? 'web adresi (GET)' : 'web adresi (POST)' });
  }

  return { klasor, bagli, fnler, bilgi, refler: sonuc.refler, basliklar: sonuc.basliklar, cagrilar: sonuc.cagrilar, cozulemeyen: sonuc.cozulemeyen, girisler, tumMetin };
}

// ───────────────────────── Ana çözümleme ─────────────────────────

function haritaCikar() {
  const kimlik = dosyaKimlikleri();
  const projeler = JSON.parse(oku('apps-script/projeler.json')).projeler;
  const klasorler = benzersiz([...projeler.map(p => p.klasor), ...fs.readdirSync(path.join(KOK, 'apps-script'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)])
    .filter(k => var_('apps-script/' + k));
  const P = klasorler.map(k => projeCozumle(k, kimlik));
  const projeAd = Object.fromEntries(projeler.map(p => [p.klasor, p.ad.split(/ [—(]/)[0].trim()]));

  // Sekme → dosya tahmini: dosyası çözülemeyen sekme adını, aynı adla başka yerde çözülmüş dosyaya bağla
  const sekmeDosyalari = new Map();
  for (const p of P) for (const r of p.refler) if (r.dosya) {
    if (!sekmeDosyalari.has(r.sekme)) sekmeDosyalari.set(r.sekme, new Set());
    sekmeDosyalari.get(r.sekme).add(r.dosya);
  }
  for (const p of P) for (const r of p.refler) if (!r.dosya) {
    const s = sekmeDosyalari.get(r.sekme);
    if (s && s.size === 1) { r.dosya = [...s][0]; r.tahmini = true; }
    else if (p.bagli && !s) { r.dosya = p.bagli; r.tahmini = true; }
  }

  // Ters çağrı grafiği ve giriş noktalarına yükselme
  const girisBul = (p, fn) => {
    const ters = new Map();
    for (const [a, c] of p.cagrilar) for (const b of c) { if (!ters.has(b)) ters.set(b, new Set()); ters.get(b).add(a); }
    const gorulen = new Set([fn]), kuyruk = [fn], bulunan = [];
    while (kuyruk.length) {
      const x = kuyruk.shift();
      for (const g of p.girisler) if (g.fn === x) bulunan.push({ ...g, yol: x === fn ? null : x });
      for (const y of ters.get(x) || []) if (!gorulen.has(y)) { gorulen.add(y); kuyruk.push(y); }
    }
    return bulunan;
  };

  // Arayüzler (mutfak paneli, yönetim paneli, Mac köprüsü)
  const arayuzler = [];
  const dagitim = Object.fromEntries(projeler.filter(p => p.deploymentId).map(p => [p.deploymentId, p.klasor]));
  for (const a of ARAYUZLER) {
    const dosyalar = a.dosyalar || dosyalariListele(a.klasor, a.uzanti);
    for (const d of dosyalar) {
      if (!var_(d)) continue;
      const ham = oku(d);
      const hedef = new Set(a.proje);
      for (const m of ham.matchAll(/macros\/s\/([A-Za-z0-9_-]{20,})/g)) if (dagitim[m[1]]) hedef.add(dagitim[m[1]]);
      const bilinmeyen = [...ham.matchAll(/macros\/s\/([A-Za-z0-9_-]{20,})/g)].map(m => m[1]).filter(x => !dagitim[x]);
      const eylemler = [];
      for (const k of hedef) {
        const p = P.find(x => x.klasor === k); if (!p) continue;
        for (const e of benzersiz(p.girisler.filter(g => g.tur === 'web' && g.eylem).map(g => g.eylem))) {
          const kac = e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp(`(action|tur|islem|adim|sayfa|kaynak)["']?\\s*[:=]\\s*["'\`]${kac}["'\`]|[?&](action|tur|adim|sayfa)=${kac}\\b|["'\`]${kac}["'\`]`, 'g');
          const sert = new RegExp(`(action|tur|islem|adim|sayfa|kaynak)["']?\\s*[:=]\\s*["'\`]${kac}["'\`]|[?&](action|tur|adim|sayfa)=${kac}\\b`);
          if (sert.test(ham) || (e.length >= 6 && re.test(ham))) eylemler.push({ proje: k, eylem: e });
        }
      }
      arayuzler.push({ ad: a.ad, dosya: d, projeler: [...hedef], eylemler, bilinmeyenDagitim: benzersiz(bilinmeyen) });
    }
  }

  // Sekme kayıtları
  const sekmeler = new Map(); // "DOSYA › Sekme" → kayıt
  const anahtar = (dosya, sekme) => (dosya || '?') + ' › ' + sekme;
  for (const p of P) for (const r of p.refler) {
    const k = anahtar(r.dosya, r.sekme);
    if (!sekmeler.has(k)) sekmeler.set(k, { dosya: r.dosya || '?', sekme: r.sekme, yazan: new Map(), okuyan: new Map(), olusturan: new Set(), dolayli: new Set(), sutunlar: new Map(), girisler: new Map(), arayuzler: new Set() });
    const s = sekmeler.get(k);
    const fnAnahtar = p.klasor + ' › ' + r.fn;
    const hedef = r.yazar ? s.yazan : s.okuyan;
    if (!hedef.has(fnAnahtar)) hedef.set(fnAnahtar, { proje: p.klasor, fn: r.fn, yer: [] });
    hedef.get(fnAnahtar).yer.push(`${r.dosyaAdi}:${r.satir}`);
    if (r.nasil === 'oluşturur') s.olusturan.add(fnAnahtar);
    if (r.kacar && !r.yazar) s.dolayli.add(fnAnahtar);
  }
  for (const s of sekmeler.values()) for (const k of s.yazan.keys()) s.okuyan.delete(k);

  // Sütunlar: fonksiyonun sekmesine bağla
  for (const p of P) {
    const fnSekme = new Map();
    for (const r of p.refler) { if (!fnSekme.has(r.fn)) fnSekme.set(r.fn, new Set()); fnSekme.get(r.fn).add(anahtar(r.dosya, r.sekme)); }
    for (const b of p.basliklar) {
      if (!b.baslik || b.baslik.length > 50 || /^[\s\d.,:;%/-]*$/.test(b.baslik)) continue;
      let hedefler = [];
      if (b.sekmeler && b.sekmeler.length) hedefler = benzersiz(b.sekmeler.map(r => anahtar(r.dosya, r.sekme)));
      else hedefler = [...(fnSekme.get(b.fn) || [])];
      const kesin = (b.sekmeler && b.sekmeler.length) || hedefler.length === 1;
      for (const h of hedefler) {
        const s = sekmeler.get(h); if (!s) continue;
        if (s.sekme === b.baslik) continue;
        if (!s.sutunlar.has(b.baslik)) s.sutunlar.set(b.baslik, { kesin: false, fn: new Set() });
        const c = s.sutunlar.get(b.baslik); c.fn.add(p.klasor + ' › ' + b.fn); if (kesin) c.kesin = true;
      }
    }
  }

  // Giriş noktaları ve arayüzler
  for (const s of sekmeler.values()) {
    for (const x of [...s.yazan.values(), ...s.okuyan.values()]) {
      const p = P.find(q => q.klasor === x.proje);
      for (const g of girisBul(p, x.fn)) {
        const k = `${x.proje} › ${g.aciklama}${g.tur === 'web' ? '' : ' → ' + g.fn}`;
        if (!s.girisler.has(k)) s.girisler.set(k, { proje: x.proje, tur: g.tur, aciklama: g.aciklama, fn: g.fn, eylem: g.eylem });
        if (g.tur === 'web' && g.eylem) for (const a of arayuzler) if (a.eylemler.some(e => e.proje === x.proje && e.eylem === g.eylem)) s.arayuzler.add(a.ad);
      }
    }
  }

  // JSON'a dökülecek düz yapı
  const sekmeListesi = sirala([...sekmeler.keys()]).map(k => {
    const s = sekmeler.get(k);
    const fnListe = m => sirala([...m.keys()]).map(f => ({ ad: f, yer: benzersiz(m.get(f).yer) }));
    return {
      anahtar: k, dosya: s.dosya, dosyaAdi: kimlik.adlar[s.dosya] || null, sekme: s.sekme,
      yazan: fnListe(s.yazan), okuyan: fnListe(s.okuyan), olusturan: sirala(s.olusturan), dolayli: sirala(s.dolayli),
      sutunlar: sirala([...s.sutunlar.keys()]).map(c => ({ ad: c, kesin: s.sutunlar.get(c).kesin, fn: sirala(s.sutunlar.get(c).fn) })),
      girisler: sirala([...s.girisler.keys()]).map(g => s.girisler.get(g)),
      arayuzler: sirala(s.arayuzler),
      projeler: sirala(benzersiz([...s.yazan.values(), ...s.okuyan.values()].map(x => x.proje))),
    };
  });
  const projeListesi = P.map(p => ({
    klasor: p.klasor, ad: projeAd[p.klasor] || p.klasor, bagliDosya: p.bagli,
    fonksiyonSayisi: p.fnler.size,
    girisler: sirala(benzersiz(p.girisler.filter(g => g.tur !== 'web' || g.eylem).map(g => `${g.aciklama} → ${g.fn}`))),
    sekmeler: sirala(benzersiz(p.refler.map(r => anahtar(r.dosya, r.sekme)))),
    fonksiyonlar: Object.fromEntries(sirala([...p.fnler.keys()]).map(f => [f, {
      dosya: p.fnler.get(f).dosya, satir: p.fnler.get(f).l,
      cagirir: sirala(p.cagrilar.get(f) || []),
      sekmeler: sirala(benzersiz(p.refler.filter(r => r.fn === f).map(r => (r.yazar ? '✎ ' : '') + anahtar(r.dosya, r.sekme)))),
    }])),
    cozulemeyen: p.cozulemeyen,
  }));
  return { dosyalar: kimlik.adlar, sekmeler: sekmeListesi, projeler: projeListesi, arayuzler };
}

// ───────────────────────── Çıktılar ─────────────────────────

const kisa = f => f.replace(/^apps-script\//, '');
function mdYaz(H) {
  const L = [];
  const projeAd = Object.fromEntries(H.projeler.map(p => [p.klasor, p.ad]));
  const fnYaz = liste => liste.map(x => `\`${x.ad.split(' › ')[1]}\` (${projeAd[x.ad.split(' › ')[0]] || x.ad.split(' › ')[0]})`).join(', ');
  L.push('# Etki haritası — bir şeyi değiştirince neresi etkilenir?', '');
  L.push('> **Bu dosya otomatik üretilir, elle düzenlenmez.** Üreten: `node araclar/etki-haritasi.mjs` ' +
    '(`main`e her kod değişikliğinde GitHub kendisi de çalıştırır). Kod statik okunduğu için "en iyi tahmin"dir; ' +
    'kesin değildir ama değişiklikten önce bakılacak ilk yerdir.', '');
  L.push('**Nasıl kullanılır?** Bir sekmenin adını, bir sütun başlığını ya da bir ürün listesini değiştirmeden önce o sekmeyi aşağıda bul:',
    '- **Yazan** kodlar o sekmeye veri yazar: sütun sırası/adı değişirse yanlış yere yazabilirler.',
    '- **Okuyan** kodlar o sekmeden veri alır: başlık değişirse boş/yanlış veri görürler.',
    '- **Sütunlar** kodun adıyla aradığı başlıklardır: bunların adı değişirse kod onları bulamaz.',
    '- **Kim çalıştırıyor** o kodu tetikleyen zamanlayıcı, menü ya da paneldir: bozulursa etkiyi ilk orada görürsün.', '',
    'Ajan için: `node araclar/etki-haritasi.mjs ara "<sekme / sütun / fonksiyon adı>"` aynı bilgiyi tek bir ad için verir.', '');

  // Özet
  const coklu = H.sekmeler.filter(s => benzersiz(s.yazan.map(y => y.ad.split(' › ')[0])).length > 1);
  L.push('## Özet', '');
  L.push(`| | Adet |`, `|---|---|`,
    `| Apps Script projesi | ${H.projeler.length} |`,
    `| Kodun dokunduğu sekme | ${H.sekmeler.length} |`,
    `| Birden fazla projenin **yazdığı** sekme (risk) | ${coklu.length} |`,
    `| Arayüz dosyası (panel, köprü) | ${H.arayuzler.length} |`, '');

  if (coklu.length) {
    L.push('### ⚠️ Birden fazla projenin yazdığı sekmeler', '',
      'Aynı sekmeye iki ayrı proje yazıyorsa birinin yaptığı değişiklik diğerini bozabilir; "her bilginin tek sahibi" kuralına (`veri-sozlugu.md`) aykırı olabilir.', '',
      '| Sekme | Yazan projeler |', '|---|---|');
    for (const s of coklu) L.push(`| ${s.anahtar} | ${benzersiz(s.yazan.map(y => projeAd[y.ad.split(' › ')[0]] || y.ad.split(' › ')[0])).join(', ')} |`);
    L.push('');
  }

  // Dosya bazında
  const dosyaSira = benzersiz(H.sekmeler.map(s => s.dosya));
  dosyaSira.sort((a, b) => (a === '?') - (b === '?') || String(a).startsWith('ID:') - String(b).startsWith('ID:') || a.localeCompare(b, 'tr'));
  L.push('## Dosya › sekme', '');
  for (const d of dosyaSira) {
    const ad = H.dosyalar[d];
    L.push(`### ${d === '?' ? '? — dosyası bulunamayan sekmeler' : d.startsWith('ID:') ? d + ' — veri sözlüğünde olmayan dosya' : d + (ad ? ' — ' + ad : '')}`, '');
    for (const s of H.sekmeler.filter(x => x.dosya === d)) {
      L.push(`#### ${s.sekme}`, '');
      if (s.yazan.length) L.push(`- **Yazan:** ${fnYaz(s.yazan)}`);
      if (s.okuyan.length) L.push(`- **Okuyan:** ${fnYaz(s.okuyan)}`);
      if (s.dolayli.length) L.push(`- **Dolaylı yazabilir** (sekmeyi başka bir yapıya verip orada yazdırıyor olabilir): ${s.dolayli.map(x => '`' + x.split(' › ')[1] + '`').join(', ')}`);
      if (s.olusturan.length) L.push(`- **Yoksa oluşturan:** ${s.olusturan.map(x => '`' + x.split(' › ')[1] + '`').join(', ')}`);
      const kesin = s.sutunlar.filter(c => c.kesin).map(c => '`' + c.ad + '`');
      const belki = s.sutunlar.filter(c => !c.kesin).map(c => '`' + c.ad + '`');
      if (kesin.length) L.push(`- **Adıyla aranan sütunlar:** ${kesin.join(', ')}`);
      if (belki.length) L.push(`- Olası başka sütunlar: ${belki.length} (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / \`ara\`)`);
      const zam = s.girisler.filter(g => g.tur === 'zamanlayici' || g.tur === 'otomatik').map(g => `${g.aciklama} (\`${g.fn}\`)`);
      const men = s.girisler.filter(g => g.tur === 'menu' || g.tur === 'ekran').map(g => `${g.aciklama} (\`${g.fn}\`)`);
      if (zam.length) L.push(`- **Zamanla çalışan:** ${benzersiz(zam).join(', ')}`);
      if (men.length) L.push(`- **Elle çalıştırılan:** ${benzersiz(men).join(', ')}`);
      if (s.arayuzler.length) L.push(`- **Etkilenen arayüz:** ${s.arayuzler.join(', ')}`);
      L.push('');
    }
  }

  // Projeler
  L.push('## Projeler: kim, ne zaman çalışıyor', '');
  for (const p of H.projeler) {
    L.push(`### ${p.ad} (\`apps-script/${p.klasor}\`)`, '');
    L.push(`Bağlı dosya: ${p.bagliDosya || '— (tabloları kimlikle açar)'} · ${p.fonksiyonSayisi} fonksiyon · ${p.sekmeler.length} sekme`, '');
    const z = p.girisler.filter(g => !g.startsWith('web:'));
    const w = p.girisler.filter(g => g.startsWith('web:'));
    if (z.length) L.push('- ' + z.join('\n- '));
    if (w.length) L.push(`- Web eylemleri (${w.length}): ${w.map(x => '`' + x.replace(/^web: /, '') + '`').join(', ')}`);
    L.push('');
  }

  // Arayüzler
  L.push('## Arayüzler', '', '| Dosya | Konuştuğu proje | Kullandığı eylem sayısı |', '|---|---|---|');
  for (const a of H.arayuzler) L.push(`| \`${a.dosya}\` (${a.ad}) | ${a.projeler.join(', ') || (a.bilinmeyenDagitim.length ? 'projeler.json\'da olmayan dağıtım' : '—')} | ${a.eylemler.length} |`);
  L.push('');

  // Çözülemeyenler
  const coz = H.projeler.flatMap(p => p.cozulemeyen.map(c => ({ ...c, proje: p.klasor })));
  L.push('## Çözülemeyenler', '',
    'Sekme adı koddan okunamadı (değişkenle ya da döngüyle açılıyor). Bu yerler haritada yok; değişiklikte elle bakılmalı.', '',
    '| Proje | Fonksiyon | Yer | İfade |', '|---|---|---|---|');
  for (const c of coz) L.push(`| ${c.proje} | \`${c.fn}\` | \`${kisa(c.dosya)}:${c.satir}\` | \`${c.ifade.replace(/\|/g, '\\|')}\` |`);
  L.push('');
  return L.join('\n');
}

function htmlYaz(H) {
  const sablon = oku('araclar/etki-haritasi.sablon.html');
  const ince = { dosyalar: H.dosyalar, sekmeler: H.sekmeler, arayuzler: H.arayuzler.map(a => ({ ad: a.ad, dosya: a.dosya })),
    projeler: H.projeler.map(p => ({ klasor: p.klasor, ad: p.ad, bagliDosya: p.bagliDosya })) };
  const veri = JSON.stringify(ince).replace(/</g, '\\u003c');
  return sablon.replace('/*VERI*/null', veri);
}

function ara(H, kelime) {
  const q = sade(kelime), out = [];
  const pa = Object.fromEntries(H.projeler.map(p => [p.klasor, p.ad]));
  const sekmeYaz = s => {
    out.push(`\n■ ${s.anahtar}${s.dosyaAdi ? ' (' + s.dosyaAdi + ')' : ''}`);
    if (s.yazan.length) out.push('  Yazan:   ' + s.yazan.map(x => x.ad + ' [' + x.yer.map(kisa).join(', ') + ']').join('\n           '));
    if (s.okuyan.length) out.push('  Okuyan:  ' + s.okuyan.map(x => x.ad + ' [' + x.yer.map(kisa).join(', ') + ']').join('\n           '));
    if (s.dolayli.length) out.push('  Dolaylı yazabilir: ' + s.dolayli.join(', '));
    if (s.sutunlar.length) out.push('  Sütunlar: ' + s.sutunlar.map(c => c.ad + (c.kesin ? '' : '?')).join(', '));
    if (s.girisler.length) out.push('  Çalıştıran: ' + benzersiz(s.girisler.map(g => `${pa[g.proje] || g.proje}: ${g.aciklama}`)).join(' · '));
    if (s.arayuzler.length) out.push('  Arayüz:  ' + s.arayuzler.join(', '));
  };
  const sek = H.sekmeler.filter(s => sade(s.sekme).includes(q) || sade(s.dosya) === q);
  if (sek.length) { out.push(`SEKMELER (${sek.length})`); sek.forEach(sekmeYaz); }
  const sut = H.sekmeler.flatMap(s => s.sutunlar.filter(c => sade(c.ad).includes(q)).map(c => ({ s, c })));
  if (sut.length) {
    out.push(`\nSÜTUNLAR (${sut.length})`);
    for (const { s, c } of sut) out.push(`  "${c.ad}" ${c.kesin ? '' : '(belki) '}— ${s.anahtar} — kullanan: ${c.fn.join(', ')}`);
  }
  const fn = H.projeler.flatMap(p => Object.entries(p.fonksiyonlar).filter(([f]) => sade(f).includes(q)).map(([f, b]) => ({ p, f, b })));
  if (fn.length) {
    out.push(`\nFONKSİYONLAR (${fn.length})`);
    for (const { p, f, b } of fn) {
      const cagiran = Object.entries(p.fonksiyonlar).filter(([, x]) => x.cagirir.includes(f)).map(([a]) => a);
      out.push(`  ${p.klasor} › ${f}  (${kisa(b.dosya)}:${b.satir})`);
      if (b.sekmeler.length) out.push('    sekmeler: ' + b.sekmeler.join(', '));
      if (cagiran.length) out.push('    çağıran: ' + cagiran.join(', '));
      const g = p.girisler.filter(x => x.endsWith('→ ' + f));
      if (g.length) out.push('    çalıştıran: ' + g.join(' · '));
    }
  }
  // Ham metin araması: haritanın kaçırdığı geçişler için
  const ham = [];
  for (const d of [...dosyalariListele('apps-script').filter(p => /\.(gs|html)$/.test(p)), 'bap-sistem/index.html', 'bap-panel/page.html', 'bap-panel/worker.template.js', ...dosyalariListele('mac-kopru', '.mjs')]) {
    if (!var_(d)) continue;
    oku(d).split('\n').forEach((satir, i) => { if (satir.length < 4000 && sade(satir).includes(q)) ham.push(`  ${kisa(d)}:${i + 1}`); });
  }
  if (ham.length) out.push(`\nKODDA GEÇTİĞİ YERLER (${ham.length}, ham arama)`, ...ham.slice(0, 60), ham.length > 60 ? `  … ve ${ham.length - 60} yer daha` : '');
  return out.length ? out.join('\n') : `"${kelime}" haritada da kodda da bulunamadı.`;
}

// ───────────────────────── Çalıştır ─────────────────────────

const [komut, ...kalan] = process.argv.slice(2);
const H = haritaCikar();
if (komut === 'ara') {
  if (!kalan.length) { console.error('Kullanım: node araclar/etki-haritasi.mjs ara "<ad>"'); process.exit(2); }
  console.log(ara(H, kalan.join(' ')));
} else {
  const ciktilar = {
    'docs/etki-haritasi.md': mdYaz(H),
    'docs/etki-haritasi.json': JSON.stringify(H, null, 1) + '\n',
    'docs/etki-haritasi.html': htmlYaz(H),
  };
  if (komut === '--kontrol') {
    const eski = Object.entries(ciktilar).filter(([p, v]) => !var_(p) || oku(p) !== v).map(([p]) => p);
    if (eski.length) { console.error('Etki haritası güncel değil: ' + eski.join(', ') + '\n→ node araclar/etki-haritasi.mjs'); process.exit(1); }
    console.log('Etki haritası güncel.');
  } else {
    for (const [p, v] of Object.entries(ciktilar)) fs.writeFileSync(path.join(KOK, p), v);
    console.log(`Yazıldı: ${Object.keys(ciktilar).join(', ')} — ${H.sekmeler.length} sekme, ${H.projeler.length} proje.`);
  }
}
