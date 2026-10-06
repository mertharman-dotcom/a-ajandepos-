// ============================================================
// TEK SEFERLİK: Sera Sebze ödemelerini veresiye defterine (ekstre) göre düzelt
// ------------------------------------------------------------
// Kaynak: Sera'nın "Veresiye Defteri" dökümleri (01.01–22.09.2026, sıra 817–1063).
// Ekstrede 7 kredi kartı (KK) ödemesi var, toplam 1.320.000 TL. Bizim Odemeler sekmesinde:
//   - 13.09 tarihli 730.330,41 TL'lik tek satır (O26092213113982) ekstrede yok → tutarı 0'a çekilir (silinmez, notu kalır).
//   - 06.05 ödemesi 200.000 yazılmış, ekstrede 260.000 → düzeltilir.
//   - Elle girilen 6 satırın Odeme_ID'si boş (Alım Paneli bu satırları saymıyordu) → kimlik verilir.
//   - Yöntem "Havale/EFT" yazılmış, ekstrede hepsi KK → "Kredi Kartı" yapılır, nota ekstre fiş no yazılır.
//   - Tedarikciler › Sera Acilis_Bakiye: ekstre devri 316.213,19 − 2025 tarihli Sera faturaları (Sayfa1'de zaten var).
//
// Çalıştırma: önce seraOdemeKuru() → rapor. Rapor doğruysa seraOdemeUygula().
// İki kez çalıştırılırsa ikinci seferde değişiklik bulmaz. İş bitince bu dosya silinebilir.
// ============================================================

var SR_TED = 'SERA SEBZE MEYVE KOMİSYONCULUĞU VE TİC. LTD ŞTİ';
var SR_EKSTRE_SON = '2026-09-22';           // ekstrenin kapsadığı son gün
var SR_DEVIR_2026 = 316213.19;              // 01.01.2026 devir bakiyesi (borç)
var SR_BAKIYE_EKSTRE_SON = 286923.53;       // 22.09.2026 ekstre bakiyesi (borç)
var SR_GUN_TOLERANS = 3;                    // bizim girilen tarih ekstreden en çok kaç gün sapabilir
var SR_ODEMELER = [                         // [tarih, tutar, ekstre fiş no]
  ['2026-01-19', 160000, '64009'],
  ['2026-03-02', 200000, '64745'],
  ['2026-04-06', 200000, '65233'],
  ['2026-05-06', 260000, '65837'],
  ['2026-07-14', 250000, '66917'],
  ['2026-08-18', 100000, '67473'],
  ['2026-09-22', 150000, '68032']
];

function seraOdemeKuru()   { return sr_calistir_(true); }
function seraOdemeUygula() { return sr_calistir_(false); }

function sr_calistir_(kuru) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var plan = sr_plan_(ss);
    var rapor = sr_rapor_(plan, kuru);
    if (!kuru) sr_uygula_(ss, plan);
    Logger.log(rapor);
    try { SpreadsheetApp.getUi().alert(rapor); } catch (e) {}
    return rapor;
  } finally {
    lock.releaseLock();
  }
}

function sr_kolon_(baslik, adlar) {
  var b = baslik.map(ap_nrm_);
  for (var i = 0; i < adlar.length; i++) { var k = b.indexOf(ap_nrm_(adlar[i])); if (k >= 0) return k; }
  return -1;
}

function sr_plan_(ss) {
  var tedN = ap_nrm_(SR_TED);
  var gun = function (iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };

  // --- Odemeler: Sera satırları
  var sh = ss.getSheetByName(AP_ODEME);
  var v = sh.getDataRange().getValues(), b = v[0].map(String);
  var c = { id: sr_kolon_(b, ['Odeme_ID']), tarih: sr_kolon_(b, ['Tarih']), ted: sr_kolon_(b, ['Tedarikçi']),
            tutar: sr_kolon_(b, ['Tutar']), yontem: sr_kolon_(b, ['Yöntem']), not: sr_kolon_(b, ['Not', 'Açıklama']),
            kaynak: sr_kolon_(b, ['Kaynak']) };
  if (c.tarih < 0 || c.ted < 0 || c.tutar < 0 || c.id < 0 || c.yontem < 0 || c.not < 0)
    throw new Error('Odemeler başlıkları bulunamadı (Odeme_ID, Tarih, Tedarikçi, Tutar, Yöntem, Not gerekli).');

  var sera = [];
  for (var i = 1; i < v.length; i++) {
    if (ap_nrm_(v[i][c.ted]) !== tedN) continue;
    var tutar = ap_sayi_(v[i][c.tutar]);
    sera.push({ satir: i + 1, id: String(v[i][c.id] || '').trim(), tarih: ap_iso_(ap_tarih_(v[i][c.tarih])),
                tutar: tutar, yontem: String(v[i][c.yontem] || ''), not: String(v[i][c.not] || ''), kullanildi: false });
  }

  // --- ekstre ödemesi ↔ bizim satır
  var guncelle = [], ekle = [], sifirla = [];
  SR_ODEMELER.forEach(function (o) {
    var ref = 'Sera ekstresi KK fiş ' + o[2];
    var aday = null;
    sera.forEach(function (s) {
      if (s.kullanildi || !(s.tutar > 0)) return;
      var fark = Math.abs((gun(s.tarih) - gun(o[0])) / 86400000);
      if (fark > SR_GUN_TOLERANS) return;
      var puan = (Math.abs(s.tutar - o[1]) < 0.01 ? 0 : 1000) + fark;   // önce aynı tutar, sonra en yakın gün
      if (!aday || puan < aday.puan) aday = { s: s, puan: puan };
    });
    if (!aday) { ekle.push({ tarih: o[0], tutar: o[1], ref: ref }); return; }
    var s = aday.s; s.kullanildi = true;
    var deg = {};
    if (Math.abs(s.tutar - o[1]) >= 0.01) deg.tutar = o[1];
    if (!s.id) deg.id = true;
    if (s.yontem !== 'Kredi Kartı') deg.yontem = 'Kredi Kartı';
    if (s.not.indexOf(ref) < 0) deg.not = (s.not ? s.not + ' · ' : '') + ref + (deg.tutar ? ' (eski tutar ' + s.tutar.toLocaleString('tr-TR') + ')' : '');
    if (Object.keys(deg).length) guncelle.push({ s: s, deg: deg, ekstre: o });
  });

  // ekstre dönemine düşen, ekstrede karşılığı olmayan Sera ödemesi → tutar 0 (satır silinmez)
  sera.forEach(function (s) {
    if (s.kullanildi || !(s.tutar > 0) || s.tarih > SR_EKSTRE_SON) return;
    sifirla.push({ s: s, not: (s.not ? s.not + ' · ' : '') + 'İPTAL ' + Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy') +
                              ': Sera ekstresinde yok (eski tutar ' + s.tutar.toLocaleString('tr-TR') + ')' });
  });

  // --- açılış bakiyesi: devir − Sayfa1'deki 2025 tarihli Sera faturaları (tekil fatura no)
  var s1 = ss.getSheetByName(AP_SAYFA1) || ss.getSheets()[0];
  var d1 = s1.getDataRange().getValues(), fb = d1[0].map(String);
  var fNo = sr_kolon_(fb, ['Fatura_No']), fT = sr_kolon_(fb, ['Tarih']), fG = sr_kolon_(fb, ['Gönderen', 'Tedarikçi']), fU = sr_kolon_(fb, ['Tutar']);
  var gor = {}, eski2025 = 0, fatToplam = 0, fatEkstreSon = 0, fatAdet = 0;
  for (var j = 1; j < d1.length; j++) {
    if (ap_nrm_(d1[j][fG]) !== tedN) continue;
    var no = ap_no_(d1[j][fNo]); if (!no || gor[no]) continue; gor[no] = 1;
    var t = ap_iso_(ap_tarih_(d1[j][fT])), u = ap_sayi_(d1[j][fU]);
    fatToplam += u; fatAdet++;
    if (t < AP_ACILIS_TARIHI) eski2025 += u;
    if (t <= SR_EKSTRE_SON) fatEkstreSon += u;
  }
  var acilis = ap_r2_(SR_DEVIR_2026 - eski2025);

  var ts = ss.getSheetByName(AP_TED), tv = ts.getDataRange().getValues(), tb = tv[0].map(String);
  var tA = sr_kolon_(tb, ['Tedarikçi']), tB = sr_kolon_(tb, ['Acilis_Bakiye']), tN = sr_kolon_(tb, ['Not']);
  var tedSatir = -1, eskiAcilis = 0;
  for (var k = 1; k < tv.length; k++) if (ap_nrm_(tv[k][tA]) === tedN) { tedSatir = k + 1; eskiAcilis = ap_sayi_(tv[k][tB]); break; }

  // --- düzeltme sonrası bakiye
  var odenenSonra = 0, odenenSonraEkstreSon = 0;
  sera.forEach(function (s) {
    var u = s.tutar;
    guncelle.forEach(function (g) { if (g.s === s && g.deg.tutar !== undefined) u = g.deg.tutar; });
    sifirla.forEach(function (z) { if (z.s === s) u = 0; });
    odenenSonra += u;
    if (s.tarih <= SR_EKSTRE_SON) odenenSonraEkstreSon += u;
  });
  ekle.forEach(function (e) { odenenSonra += e.tutar; odenenSonraEkstreSon += e.tutar; });
  var odenenOnce = sera.reduce(function (t, s) { return t + s.tutar; }, 0);

  return {
    c: c, guncelle: guncelle, ekle: ekle, sifirla: sifirla,
    acilis: acilis, eskiAcilis: eskiAcilis, eski2025: ap_r2_(eski2025), tedSatir: tedSatir, tCol: { acilis: tB, not: tN },
    fatAdet: fatAdet, fatToplam: ap_r2_(fatToplam),
    bakiyeOnce: ap_r2_(eskiAcilis + fatToplam - odenenOnce),
    bakiyeSonra: ap_r2_(acilis + fatToplam - odenenSonra),
    bakiyeEkstreSon: ap_r2_(acilis + fatEkstreSon - odenenSonraEkstreSon)
  };
}

function sr_rapor_(p, kuru) {
  var tl = function (x) { return Number(x).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL'; };
  var r = [(kuru ? 'KURU ÇALIŞMA — hiçbir şey yazılmadı.' : 'UYGULANDI.') + ' Sera Sebze ödemeleri ↔ veresiye defteri'];
  if (!p.guncelle.length && !p.ekle.length && !p.sifirla.length && Math.abs(p.acilis - p.eskiAcilis) < 0.01) r.push('Değişiklik yok, zaten ekstreyle uyumlu.');
  p.sifirla.forEach(function (z) { r.push('• 0\'a çekilecek: ' + z.s.tarih + ' ' + tl(z.s.tutar) + ' (' + (z.s.id || 'satır ' + z.s.satir) + ') — ekstrede yok'); });
  p.guncelle.forEach(function (g) {
    var d = [];
    if (g.deg.tutar !== undefined) d.push('tutar ' + tl(g.s.tutar) + ' → ' + tl(g.deg.tutar));
    if (g.deg.id) d.push('kimlik verilecek');
    if (g.deg.yontem) d.push('yöntem → Kredi Kartı');
    if (g.deg.not) d.push('nota fiş no');
    r.push('• ' + g.s.tarih + ' ' + tl(g.s.tutar) + ' (satır ' + g.s.satir + '): ' + d.join(', '));
  });
  p.ekle.forEach(function (e) { r.push('• Eklenecek: ' + e.tarih + ' ' + tl(e.tutar) + ' (' + e.ref + ')'); });
  if (Math.abs(p.acilis - p.eskiAcilis) >= 0.01) r.push('• Açılış bakiyesi ' + tl(p.eskiAcilis) + ' → ' + tl(p.acilis) + ' (devir 316.213,19 − 2025 faturaları ' + tl(p.eski2025) + ')');
  r.push('');
  r.push('Sera bakiyesi (bizim hesap): önce ' + tl(p.bakiyeOnce) + ' → sonra ' + tl(p.bakiyeSonra) + ' (' + p.fatAdet + ' fatura)');
  r.push('22.09 itibarıyla: bizde ' + tl(p.bakiyeEkstreSon) + ', ekstrede ' + tl(SR_BAKIYE_EKSTRE_SON) +
         ' → fark ' + tl(SR_BAKIYE_EKSTRE_SON - p.bakiyeEkstreSon) + ' (KolayBi\'ye düşmemiş Sera faturaları; ayrıntı docs/kontrol-listesi.md F1)');
  return r.join('\n');
}

function sr_uygula_(ss, p) {
  var sh = ss.getSheetByName(AP_ODEME), c = p.c;
  var damga = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyMMddHHmmss');
  var n = 10;
  p.sifirla.forEach(function (z) {
    sh.getRange(z.s.satir, c.tutar + 1).setValue(0);
    sh.getRange(z.s.satir, c.not + 1).setValue(z.not);
  });
  p.guncelle.forEach(function (g) {
    if (g.deg.tutar !== undefined) sh.getRange(g.s.satir, c.tutar + 1).setValue(g.deg.tutar).setNumberFormat('#,##0.00');
    if (g.deg.id) sh.getRange(g.s.satir, c.id + 1).setValue('O' + damga + (n++));   // eski kimlik biçimi: O + yyMMddHHmmss + 2 hane
    if (g.deg.yontem) sh.getRange(g.s.satir, c.yontem + 1).setValue(g.deg.yontem);
    if (g.deg.not) sh.getRange(g.s.satir, c.not + 1).setValue(g.deg.not);
  });
  p.ekle.forEach(function (e) {
    var s = ap_odemeEkle_({ ted: SR_TED, tarih: e.tarih, tutar: e.tutar, yontem: 'Kredi Kartı', not: e.ref });
    if (s.ok && c.kaynak >= 0) sh.getRange(2, c.kaynak + 1).setValue('Sera ekstresi');   // ap_odemeEkle_ satırı 2. sıraya ekler
    Utilities.sleep(1100);   // kimlikler saniyeye göre üretiliyor
  });
  if (p.tedSatir > 0 && Math.abs(p.acilis - p.eskiAcilis) >= 0.01) {
    var ts = ss.getSheetByName(AP_TED);
    ts.getRange(p.tedSatir, p.tCol.acilis + 1).setValue(p.acilis);
    if (p.tCol.not >= 0) ts.getRange(p.tedSatir, p.tCol.not + 1).setValue('Açılış = Sera ekstresi 01.01.2026 devri 316.213,19 − Sayfa1\'deki 2025 faturaları ' +
      p.eski2025.toLocaleString('tr-TR') + ' (06.10 mutabakatı)');
  }
}
