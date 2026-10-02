/**
 * BAP RAPOR AJANI  v1.0
 * Kurulum: "BAP Adisyo Siparis Datası" > Uzantılar > Apps Script > yeni dosya > bu kodu yapıştır
 *          > kurulum() fonksiyonunu BİR KEZ çalıştır (izin ver).
 * Her PAZARTESİ 09:00: geçen haftanın satış raporu.
 * Ayın ilk pazartesi: ek olarak geçen ayın maliyet / çarpan tablosu.
 * Elle deneme: testHaftalik()  ·  testAylik()
 */

const CFG = {
  ALICI: 'mertharman@gmail.com',
  SATIS_SEKME: 'Satıs Verileri',
  ARSIV_2025_ID: '1QVGFcOp91Bv7DXMtcxyjUuCBfm-DKoispGwZRtXbUS8', ARSIV_2025_SEKME: 'Make.com Data',
  TRENDYOL_ID: '1KLWCEBwFMHCTrTnCYLhv2ctg5PvGtS9DNzoMXF-Z1JE',
  KOLAYBI_ID: '1JJ6UZzh8rSX1FE9Cr-UPzEAaE-2aKtM10bEvjAv2P5w',
  KURYE_ID: '1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo',
  SABIT: { 'Personel': 500000, 'Kira': 170000, 'SGK': 60000, 'KDV': 80000 },
  // Aylık paket sipariş senaryoları (15.09.2026 projeksiyonu)
  SENARYO: { 9:{kotu:3121,baz:3360,iyi:3480}, 10:{kotu:2878,baz:3326,iyi:3442},
             11:{kotu:2603,baz:3028,iyi:3240}, 12:{kotu:2770,baz:3243,iyi:3581} },
  ISLETME: ['Elektrik','Doğalgaz','İnternet/Telefon','Güvenlik / Alarm','Araç şarj','Taşımacılık Abonelik',
            'Reklam','Reklam/Tanıtım','Kampanya/İndirim','Kargo','Temizlik','Kurye Taşımacılık'],
  KOMISYON: ['Platform komisyonu','Yemek kartı komisyonu','Erken ödeme masrafı'],
  HADDY_KDV: 1.20
};

/* ---------------- kurulum ---------------- */
function kurulum() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'haftalikRapor')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('haftalikRapor').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9).inTimezone('Europe/Istanbul').create();
}
function testHaftalik() { haftalikRapor(); }
function testAylik() { const b = new Date(); aylikRaporGonder_(b.getMonth() === 0 ? 12 : b.getMonth(), b.getMonth() === 0 ? b.getFullYear() - 1 : b.getFullYear()); }

/* ---------------- ana akış ---------------- */
function haftalikRapor() {
  try {
    const bugun = new Date();
    const bitis = gunBasi_(bugun); bitis.setDate(bitis.getDate() - ((bitis.getDay() + 6) % 7)); // bu pazartesi 00:00
    const bas = new Date(bitis); bas.setDate(bas.getDate() - 7);
    let html = baslik_('BAP Haftalık Satış Raporu', tr_(bas) + ' – ' + tr_(new Date(bitis - 1)));
    html += satisBolumu_(bas, bitis);
    html += puanBolumu_();
    let konu = 'BAP Haftalık Rapor · ' + tr_(bas);
    if (bugun.getDate() <= 7) {
      const ay = bugun.getMonth() === 0 ? 12 : bugun.getMonth();
      const yil = bugun.getMonth() === 0 ? bugun.getFullYear() - 1 : bugun.getFullYear();
      html += maliyetBolumu_(ay, yil);
      konu += ' + ' + AYLAR_[ay - 1] + ' maliyet';
    }
    MailApp.sendEmail({ to: CFG.ALICI, subject: konu, htmlBody: sar_(html) });
  } catch (e) {
    MailApp.sendEmail(CFG.ALICI, '⚠️ BAP Rapor Ajanı HATA', String(e && e.stack || e));
  }
}
function aylikRaporGonder_(ay, yil) {
  MailApp.sendEmail({ to: CFG.ALICI, subject: 'BAP ' + AYLAR_[ay - 1] + ' ' + yil + ' maliyet raporu',
    htmlBody: sar_(baslik_('BAP Aylık Maliyet', AYLAR_[ay - 1] + ' ' + yil) + maliyetBolumu_(ay, yil)) });
}

/* ---------------- satış ---------------- */
function satisBolumu_(bas, bitis) {
  const b26 = oku_(SpreadsheetApp.getActive().getSheetByName(CFG.SATIS_SEKME),
    { t: 'Sipariş Tarihi', tip: 'Sipariş Tipi', kanal: 'Sipariş Kanalı', kat: 'Ürün Kategorileri', adet: 'Ürün Adetleri', tutar: 'Toplam Tutar', durum: 'Durum' });
  const b25 = oku_(SpreadsheetApp.openById(CFG.ARSIV_2025_ID).getSheetByName(CFG.ARSIV_2025_SEKME),
    { t: 'Sipariş Tarihi', tip: 'Sipariş Tİpi', kanal: 'Sipariş Kanalı', kat: 'Ürün Kategorileri', adet: 'Ürün Adetleri', tutar: 'Toplam Tutar' });
  const gb = new Date(bas); gb.setDate(gb.getDate() - 364);   // aynı haftanın günleri, geçen yıl
  const gs = new Date(bitis); gs.setDate(gs.getDate() - 364);
  const s26 = ozet_(b26, bas, bitis), s25 = ozet_(b25, gb, gs);
  const d = (x, y) => y ? pct_(x / y - 1) : '–';

  let h = '<h3>1. Geçen hafta (paket)</h3>' + tablo_(['', 'Bu yıl', 'Geçen yıl', 'Değişim'], [
    ['Sipariş', nf_(s26.n), nf_(s25.n), d(s26.n, s25.n)],
    ['Ciro (tüm siparişler)', tl_(s26.ciroTum), tl_(s25.ciroTum), d(s26.ciroTum, s25.ciroTum)],
    ['Sepet ort.', tl_(s26.ciro / (s26.n || 1)), tl_(s25.ciro / (s25.n || 1)), d(s26.ciro / (s26.n || 1), s25.ciro / (s25.n || 1))],
    ['Yemeksepeti', nf_(s26.kanal.Yemeksepeti), nf_(s25.kanal.Yemeksepeti), d(s26.kanal.Yemeksepeti, s25.kanal.Yemeksepeti)],
    ['Trendyol+Getir', nf_(s26.kanal.Trendyol), nf_(s25.kanal.Trendyol), d(s26.kanal.Trendyol, s25.kanal.Trendyol)],
    ['Direkt (tel/WA)', nf_(s26.kanal.Direkt), nf_(s25.kanal.Direkt), d(s26.kanal.Direkt, s25.kanal.Direkt)]
  ]);
  h += '<h3>2. Kategori (adet)</h3>' + tablo_(['', 'Bu yıl', 'Geçen yıl', 'Değişim'],
    ['Pizza', 'Makarna', 'Salata&Bowl', 'Sandviç', 'Atıştırmalık', 'Tatlı', 'İçecek']
      .map(k => [k, nf_(s26.kat[k] || 0), nf_(s25.kat[k] || 0), d(s26.kat[k] || 0, s25.kat[k] || 0)]));

  // projeksiyon karşılaştırması
  const ay = bas.getMonth() + 1, sc = CFG.SENARYO[ay];
  if (sc) {
    const gunSay = new Date(bas.getFullYear(), ay, 0).getDate();
    const hafta = k => Math.round(k / gunSay * 7);
    const n = s26.n;
    const durum = n >= hafta(sc.iyi) ? '🙂 İYİ senaryonun üstünde' : n >= hafta(sc.baz) ? '🎯 BAZ ile İYİ arasında'
      : n >= hafta(sc.kotu) ? '⚠️ KÖTÜ ile BAZ arasında' : '🔴 KÖTÜ senaryonun da altında';
    h += '<h3>3. Projeksiyona göre</h3>' + tablo_(['Kötü', 'Baz', 'İyi', 'Gerçekleşen'],
      [[nf_(hafta(sc.kotu)), nf_(hafta(sc.baz)), nf_(hafta(sc.iyi)), '<b>' + nf_(n) + '</b>']]) + '<p><b>' + durum + '</b></p>';
  }
  // alarmlar
  const al = [];
  if (s25.n && s26.n / s25.n - 1 < -0.25) al.push('Sipariş geçen yılın %25\'ten fazla gerisinde.');
  if ((s25.kat.Pizza || 0) && (s26.kat.Pizza || 0) / s25.kat.Pizza - 1 < -0.30) al.push('Pizza adedi %30\'dan fazla geride.');
  if ((s25.kat['Salata&Bowl'] || 0) && (s26.kat['Salata&Bowl'] || 0) / s25.kat['Salata&Bowl'] - 1 < -0.20) al.push('Salata adedi %20\'den fazla geride.');
  if (al.length) h += '<div style="background:#fdecea;padding:8px;border-radius:6px"><b>🚨 Dikkat</b><br>' + al.join('<br>') + '</div>';
  return h;
}

function ozet_(rows, bas, bitis) {
  const o = { n: 0, ciro: 0, ciroTum: 0, kanal: { Yemeksepeti: 0, Trendyol: 0, Direkt: 0 }, kat: {} };
  rows.forEach(r => {
    const t = tarih_(r.t); if (!t || t < bas || t >= bitis) return;
    if (r.durum !== undefined && r.durum && String(r.durum) !== 'KAPALI') return;
    const tutar = Number(r.tutar) || 0; o.ciroTum += tutar;
    if (String(r.tip) !== 'Paket Siparişi') return;
    o.n++; o.ciro += tutar;
    const k = String(r.kanal).toLowerCase();
    o.kanal[k.indexOf('yemeksepeti') > -1 ? 'Yemeksepeti' : (k.indexOf('trendyol') > -1 || k.indexOf('getir') > -1) ? 'Trendyol' : 'Direkt']++;
    const ks = String(r.kat || '').split(' | '), as = String(r.adet || '').split(' | ');
    ks.forEach((kk, i) => { const f = aile_(kk); if (f) o.kat[f] = (o.kat[f] || 0) + (Number(as[i]) || 1); });
  });
  return o;
}
function aile_(k) {
  k = String(k).trim();
  if (k.indexOf('Pizza') === 0) return 'Pizza'; if (k.indexOf('Makarna') === 0) return 'Makarna';
  if (k.indexOf('Salata') === 0) return 'Salata&Bowl'; if (k.indexOf('Sandviç') === 0) return 'Sandviç';
  if (k.indexOf('Atıştırmalık') === 0) return 'Atıştırmalık'; if (k.indexOf('Tatlı') === 0) return 'Tatlı';
  if (k.indexOf('İçecek') === 0) return 'İçecek'; return null;
}

/* ---------------- Trendyol puan ---------------- */
function puanBolumu_() {
  try {
    const sh = SpreadsheetApp.openById(CFG.TRENDYOL_ID).getSheetByName('Puan_Gunluk');
    const v = sh.getDataRange().getValues(), H = v[0];
    const rows = v.slice(1).filter(r => r[0]); if (rows.length < 2) return '';
    const son = rows[rows.length - 1], once = rows[Math.max(0, rows.length - 8)];
    const out = [];
    H.forEach((h, i) => {
      if (String(h).indexOf('90g') < 0) return;
      const a = Number(son[i]), b = Number(once[i]); if (!a) return;
      const fark = a - b;
      out.push([String(h).replace(' 90g', ''), a.toFixed(2), (fark >= 0 ? '+' : '') + fark.toFixed(2),
        a < 4.5 ? '🔴 4,5 altı' : fark < -0.05 ? '⚠️ düşüyor' : '✅']);
    });
    return '<h3>4. Trendyol 90 günlük puan (1 haftalık değişim)</h3>' + tablo_(['Mağaza', 'Puan', 'Değişim', ''], out);
  } catch (e) { return '<p>Trendyol puanı okunamadı: ' + e + '</p>'; }
}

/* ---------------- aylık maliyet ---------------- */
function maliyetBolumu_(ay, yil) {
  const icinde = t => { t = tarih_(t); return t && t.getMonth() + 1 === ay && t.getFullYear() === yil; };
  // ciro + paket
  const satis = oku_(SpreadsheetApp.getActive().getSheetByName(CFG.SATIS_SEKME), { t: 'Sipariş Tarihi', tip: 'Sipariş Tipi', tutar: 'Toplam Tutar', durum: 'Durum' });
  let ciro = 0, paket = 0;
  satis.forEach(r => { if (!icinde(r.t) || (r.durum && String(r.durum) !== 'KAPALI')) return; ciro += Number(r.tutar) || 0; if (String(r.tip) === 'Paket Siparişi') paket++; });

  const kb = SpreadsheetApp.openById(CFG.KOLAYBI_ID);
  // Ev / özel alımlar
  const oz = oku_(kb.getSheetByName('Ozel_Alimlar'), { f: 'Fatura_No', u: 'Ürün (boş = tüm fatura)' });
  const evFat = new Set(), evUrunHer = new Set(), evCift = new Set();
  oz.forEach(r => { const f = String(r.f), u = String(r.u || '');
    if (!u) evFat.add(f); else if (f === '*') evUrunHer.add(u); else evCift.add(f + '|' + u); });
  // ürün alışı
  const kal = oku_(kb.getSheetByName('Fatura_Kalemleri'), { f: 'Fatura_No', t: 'Tarih', u: 'Ürün (Hammadde)', a: 'Adet', b: 'Birim Fiyat', k: 'Kalem Tutarı (KDV hariç)' });
  const gor = new Set(); let alis = 0;
  kal.forEach(r => {
    if (!icinde(r.t)) return;
    const key = [r.f, r.u, r.a, r.b, r.k].join('|'); if (gor.has(key)) return; gor.add(key);
    const f = String(r.f), u = String(r.u);
    if (evFat.has(f) || evUrunHer.has(u) || evCift.has(f + '|' + u)) return;
    alis += Number(r.k) || 0;
  });
  // giderler
  const gid = oku_(kb.getSheetByName('Gider_Faturalari'), { id: 'Fatura_ID', t: 'Tarih', tutar: 'Tutar', kat: 'Kategori' });
  const gg = new Set(); let isl = 0, kom = 0, kurFat = 0, kurFatAdet = 0; const komDetay = {};
  gid.forEach(r => {
    if (!icinde(r.t) || gg.has(String(r.id))) return; gg.add(String(r.id));
    const v = Number(r.tutar) || 0, k = String(r.kat);
    if (k === 'Teslimat/Kurye') { kurFat += v; kurFatAdet++; }
    if (CFG.ISLETME.indexOf(k) > -1) isl += v;
    if (CFG.KOMISYON.indexOf(k) > -1) { kom += v; komDetay[k] = (komDetay[k] || 0) + v; }
  });
  // kurye: Kolaybi'ye gelen kurye faturaları (Teslimat/Kurye). Saat×tarife hesabı yalnızca kontrol amaçlı.
  let ky = { bap: 0, haddy: 0, toplam: 0, eksik: '' };
  try { ky = kuryeMaliyeti_(ay, yil); } catch (e) { ky.eksik = 'saat verisi okunamadı'; }
  const sabit = Object.keys(CFG.SABIT).reduce((s, k) => s + CFG.SABIT[k], 0);
  const top = alis + isl + kom + kurFat + sabit, kalan = ciro - top;
  const x = v => alis ? (v / alis).toFixed(2) : '–';

  let h = '<h3>5. ' + AYLAR_[ay - 1] + ' ' + yil + ' maliyet tablosu</h3>' + tablo_(['Kalem', 'Tutar', 'Alışın katı', 'Cironun %'], [
    ['Ciro', tl_(ciro), x(ciro), '100%'],
    ['Ürün alışı', tl_(alis), '1,00', pct0_(alis / ciro)],
    ['Komisyonlar', tl_(kom), x(kom), pct0_(kom / ciro)],
    ['Kurye (faturalar)', tl_(kurFat), x(kurFat), pct0_(kurFat / ciro)],
    ['Personel+kira+SGK+KDV', tl_(sabit), x(sabit), pct0_(sabit / ciro)],
    ['İşletme giderleri', tl_(isl), x(isl), pct0_(isl / ciro)],
    ['<b>Toplam maliyet (başabaş)</b>', '<b>' + tl_(top) + '</b>', '<b>' + x(top) + '</b>', pct0_(top / ciro)],
    ['<b>Kalan</b>', '<b>' + tl_(kalan) + '</b>', '', pct0_(kalan / ciro)]
  ]);
  h += '<p>Paket sipariş: ' + nf_(paket) + ' · Kurye faturası: ' + kurFatAdet + ' adet' +
       (paket ? ' · sipariş başı ' + tl_(kurFat / paket) : '') +
       '<br><span style="font-size:12px;color:#666">Kontrol (HemenYolda saat×tarife): Haddy ' + tl_(ky.haddy) + ' + BAP kuryeleri ' + tl_(ky.bap) +
       (ky.eksik ? ' · ' + ky.eksik : '') + '. Faturalar dönemsel kesildiği için aylık tutar dalgalanabilir; BAP kendi kuryeleri faturaya girmez.</span></p>';
  const komOran = ciro ? kom / ciro : 0.19, F = sabit + isl + kurFat;
  h += '<p><b>Gerçekleşen çarpan (ciro/alış): ' + x(ciro) + '</b> · Başabaş: ' + x(top) +
       ' · %15 kâr için gereken: ' + (alis ? ((alis + F) / alis / (1 - komOran - 0.15)).toFixed(2) : '–') + '</p>' +
       '<p style="font-size:12px;color:#666">Alış: Fatura_Kalemleri (mükerrer ve "Ev" alımları hariç). Faturalar gecikmeli gelebilir; ayın ilk haftasında rakamlar eksik olabilir.</p>';
  return h;
}

function kuryeMaliyeti_(ay, yil) {
  const ss = SpreadsheetApp.openById(CFG.KURYE_ID);
  const tar = {}; let haddy = { s: 235, p: 25 };
  oku_(ss.getSheetByName('Kurye bilgiler'), { ad: 'Kurye Adı', bordro: 'Bordro', s: 'Saat ücreti', p: 'Paket başı ücret' })
    .forEach(r => { if (!r.ad) haddy = { s: Number(r.s) || 235, p: Number(r.p) || 25 };
      else tar[normAd_(r.ad)] = { s: Number(r.s), p: Number(r.p), bap: String(r.bordro) === 'BAP' }; });
  const icinde = t => { t = tarih_(t); return t && t.getMonth() + 1 === ay && t.getFullYear() === yil; };
  const saat = {}, pk = {}; const gunler = new Set();
  oku_(ss.getSheetByName('Mesai (Ham)'), { t: 'Tarih', k: 'Kurye', dk: 'Ham (dk)' }).forEach(r => {
    if (!icinde(r.t)) return; const k = normAd_(r.k); saat[k] = (saat[k] || 0) + (Number(r.dk) || 0) / 60; gunler.add(tr_(tarih_(r.t))); });
  oku_(ss.getSheetByName('Siparişler'), { t: 'Tarih', k: 'Kurye' }).forEach(r => {
    if (!icinde(r.t) || !r.k) return; const k = normAd_(r.k); pk[k] = (pk[k] || 0) + 1; });
  let bap = 0, hd = 0;
  new Set(Object.keys(saat).concat(Object.keys(pk))).forEach(k => {
    const t = tar[k];
    if (t && t.bap) bap += t.s * (saat[k] || 0) + t.p * (pk[k] || 0);
    else hd += (haddy.s * (saat[k] || 0) + haddy.p * (pk[k] || 0)) * CFG.HADDY_KDV;
  });
  const gunAy = new Date(yil, ay, 0).getDate();
  return { bap: bap, haddy: hd, toplam: bap + hd, eksik: gunler.size < gunAy - 1 ? 'mesai verisi ' + gunler.size + '/' + gunAy + ' gün' : '' };
}
function normAd_(a) { a = String(a || '').trim(); return a.split(' ')[0]; }

/* ---------------- yardımcılar ---------------- */
const AYLAR_ = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
function oku_(sh, harita) {
  if (!sh) throw new Error('Sekme bulunamadı');
  const v = sh.getDataRange().getValues(), H = v[0].map(x => String(x).trim()), idx = {};
  Object.keys(harita).forEach(k => { idx[k] = H.indexOf(harita[k]); });
  return v.slice(1).map(r => { const o = {}; Object.keys(idx).forEach(k => { o[k] = idx[k] > -1 ? r[idx[k]] : undefined; }); return o; });
}
function tarih_(x) {
  if (!x) return null; if (x instanceof Date) return x;
  const s = String(x).trim(); let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  return null;
}
function gunBasi_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function tr_(d) { return Utilities.formatDate(d, 'Europe/Istanbul', 'dd.MM.yyyy'); }
function nf_(n) { return Math.round(n || 0).toLocaleString('tr-TR'); }
function tl_(n) { return nf_(n) + ' TL'; }
function pct_(x) { const v = Math.round(x * 100); return (v > 0 ? '+' : '') + v + '%'; }
function pct0_(x) { return isFinite(x) ? Math.round(x * 100) + '%' : '–'; }
function tablo_(bas, rows) {
  const td = 'style="border:1px solid #ccc;padding:5px 8px"';
  return '<table style="border-collapse:collapse;font-size:13px"><tr style="background:#eee">' +
    bas.map(b => '<th ' + td + '>' + b + '</th>').join('') + '</tr>' +
    rows.map(r => '<tr>' + r.map(c => '<td ' + td + '>' + c + '</td>').join('') + '</tr>').join('') + '</table>';
}
function baslik_(b, alt) { return '<h2 style="margin-bottom:2px">' + b + '</h2><div style="color:#777">' + alt + '</div>'; }
function sar_(h) { return '<div style="font-family:Arial,sans-serif;color:#222;max-width:720px">' + h +
  '<p style="color:#999;font-size:11px">BAP Rapor Ajanı · otomatik</p></div>'; }