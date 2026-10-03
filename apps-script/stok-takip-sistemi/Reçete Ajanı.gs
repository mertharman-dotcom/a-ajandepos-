/**
 * BAP OPERASYON — REÇETE & AR-GE AJANI · ÇAPRAZ KONTROL  (rc_capraz_kontrol.gs  v1.0)
 * --------------------------------------------------------------------------------
 * Nereye: "BAP Stok Takip Sistemi" → Uzantılar → Apps Script → yeni dosya "Reçete Ajanı"
 *         (Hazırlık Ajanı ile AYNI projede olmalı; hp_ yardımcılarını kullanır)
 * Ne yapar: Stok Takip dosyasını SADECE OKUR, hiçbir sekmeye yazmaz. Bulguları
 *   Drive: Departmanlar / Operasyon Departmanı / Reçete Ajanı / "BAP Reçete Kontrol"
 *   dosyasının "Is_Plani" sekmesine öncelikli iş listesi olarak yazar ve e-posta atar.
 * Kontroller:
 *   R1  Son 30 günde satılan ama reçetesi olmayan ürün (satış adediyle)
 *   R2  Ürün reçetesinde geçen yarı mamul, yarı mamul çıktı tablosunda yok
 *   R3  Ürün reçetesinde geçen hammadde hiçbir hammadde / direkt satış / ambalaj tablosunda yok
 *   R4  Reçete satırı birimi yarı mamulün takip birimine çevrilemiyor (adet ↔ gram, porsiyon gramı yok)
 *   Y1  Yarı mamul reçetesi var, çıktı satırı yok (panelde seçilemez, stokta izlenemez)
 *   Y2  Çıktı satırı var, yarı mamul reçetesi (hammadde listesi) yok
 *   Y3  Çıktı satırında 1 kat miktarı boş / 0 / #REF, adet takipte porsiyon adedi yok
 *   Y4  Porsiyon adet × porsiyon gram, 1 kat miktarıyla %25'ten fazla tutmuyor
 *   Y5  Yarı mamul reçetesinde geçen hammadde tanımsız
 *   Y6  Birbirine çok benzeyen yarı mamul adları (yazım farkı / mükerrer kayıt)
 *   Y7  Hiçbir ürün reçetesinde kullanılmayan yarı mamul (bilgi)
 *   U1  Uretim_Girisleri'nde (son 30 gün) çıktı tablosuyla eşleşmeyen ad veya 0 gram / 0 porsiyon kayıt
 * İş planındaki "Durum" ve "Not" sütunlarını siz doldurursunuz; sonraki çalıştırmada korunur.
 * Artık tespit edilmeyen satır "ÇÖZÜLDÜ (otomatik)" olur.
 * Kurulum: rc_kurulum()  ·  Elle çalıştırma: rc_kontrolEt()
 */

var RC = {
  DOSYA_AD: 'BAP Reçete Kontrol',
  KLASOR: ['Departmanlar', 'Operasyon Departmanı', 'Reçete Ajanı'],
  SEKME: 'Is_Plani',
  GUN: 30,
  BENZER_ESIK: 0.80,
  MAIL: 'mertharman@gmail.com'
};

function rc_kurulum() {
  var ss = rc_dosya_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'rc_kontrolEt') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('rc_kontrolEt').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).inTimezone(HP.TZ).create();
  Logger.log('Reçete Ajanı kuruldu. Dosya: ' + ss.getUrl() + ' · her Pazartesi 09:00 çalışır.');
  rc_kontrolEt();
}

function rc_kontrolEt() {
  var stok = hp_stokDosya_();
  var ctx = hp_context_();               // reçeteler, yarı mamuller, eşleştirme sekmesi
  var bul = [];                          // {oncelik, kod, kayit, sorun, etki, oneri}
  function ekle(o, kod, kayit, sorun, etki, oneri) { bul.push([o, kod, kayit, sorun, etki, oneri]); }

  // ---------- tablolar (sadece okuma) ----------
  var cikti = hp_tabloBul_(stok, ['yarimamuladi', 'ciktitipi', 'bazmiktar', 'porsiyonadet']);
  var ymRec = hp_tabloBul_(stok, ['yarimamuladi', 'hammadde', 'bazmiktar', 'birim'], ['ciktitipi']);
  var urRec = hp_tabloBul_(stok, ['urunadi', 'hammadde', 'miktar', 'olcubirimi', 'uruntipi']);
  var uretim = hp_tabloBul_(stok, ['yarimamul', 'recetekatsayisi', 'toplamgram', 'porsiyonadet']);
  var hmAdlari = rc_hammaddeAdlari_(stok);

  var ciktiAd = {}, ymRecAd = {}, kullanilanYm = {};
  cikti.rows.forEach(function (r) { var a = String(r[cikti.i.yarimamuladi] || '').trim(); if (a) ciktiAd[hp_n_(a)] = a; });
  if (ymRec) ymRec.rows.forEach(function (r) { var a = String(r[ymRec.i.yarimamuladi] || '').trim(); if (a) ymRecAd[hp_n_(a)] = a; });
  function ymMi(ad) { var k = hp_n_(ad); return ciktiAd[k] || ymRecAd[k]; }

  // ---------- Y1 / Y2 ----------
  Object.keys(ymRecAd).forEach(function (k) {
    if (!ciktiAd[k]) {
      var yakin = rc_enYakin_(k, ciktiAd);
      ekle('P1', 'Y1', ymRecAd[k], 'Yarı mamul reçetesi var ama çıktı tablosunda satırı yok',
        'Panelden üretim girilemez, stokta ve hazırlık planında izlenemez',
        yakin.s >= RC.BENZER_ESIK ? 'Muhtemelen "' + yakin.ad + '" ile aynı — adı birleştirin' : 'Çıktı tablosuna satır ekleyin (çıktı tipi, 1 kat miktarı, porsiyon)');
    }
  });
  Object.keys(ciktiAd).forEach(function (k) {
    if (!ymRecAd[k]) {
      var yakin = rc_enYakin_(k, ymRecAd);
      ekle('P2', 'Y2', ciktiAd[k], 'Çıktı satırı var ama yarı mamul reçetesi (hammadde listesi) yok',
        'Üretimde hammadde stoktan düşmez, maliyet ve kalori hesaplanamaz',
        yakin.s >= RC.BENZER_ESIK ? 'Reçete "' + yakin.ad + '" adıyla girilmiş olabilir — adları eşitleyin' : 'Yarı mamul reçetesini girin');
    }
  });

  // ---------- Y3 / Y4 ----------
  cikti.rows.forEach(function (r) {
    var ad = String(r[cikti.i.yarimamuladi] || '').trim(); if (!ad) return;
    var ham = [r[cikti.i.bazmiktar], r[cikti.i.porsiyonadet], cikti.i.porsiyongram != null ? r[cikti.i.porsiyongram] : ''].join(' ');
    var baz = hp_sayi_(r[cikti.i.bazmiktar]), pA = hp_sayi_(r[cikti.i.porsiyonadet]), pG = cikti.i.porsiyongram != null ? hp_sayi_(r[cikti.i.porsiyongram]) : 0;
    var takip = hp_birim_(cikti.i.takiptipi != null ? (r[cikti.i.takiptipi] || r[cikti.i.ciktitipi]) : r[cikti.i.ciktitipi]);
    var cTip = hp_birim_(r[cikti.i.ciktitipi]);
    if (/#REF|#N\/A|#ERROR/i.test(ham)) ekle('P1', 'Y3', ad, 'Çıktı satırında formül hatası (#REF!)', 'Porsiyon/kat hesabı yapılamıyor', 'Porsiyon adet ve gram hücrelerini değer olarak girin');
    else if (!baz) ekle('P1', 'Y3', ad, '1 kat miktarı (Baz_Miktar) boş veya 0', 'Üretim 0 gram kaydediliyor, eldeki stok ve üretilecek kat hesaplanamıyor', '1 kat reçeteden çıkan gram/adet miktarını girin');
    else if (takip.tip === 'adet' && cTip.tip !== 'adet' && !pA) ekle('P1', 'Y3', ad, 'Adet/porsiyon takipli ama porsiyon adedi boş', 'Gram → porsiyon çevrilemiyor', '1 kattan kaç porsiyon çıktığını girin');
    if (baz && pA && pG && cTip.tip !== 'adet') {
      var fark = Math.abs(pA * pG - baz * cTip.carpan) / (baz * cTip.carpan);
      if (fark > 0.25) ekle('P2', 'Y4', ad, 'Porsiyon adet × gram (' + pA + ' × ' + pG + ' = ' + Math.round(pA * pG) + ') 1 kat miktarıyla (' + baz + ') tutmuyor (%' + Math.round(fark * 100) + ')',
        'Porsiyon/gram çevirisi yanlış sonuç verir', 'Porsiyon adet ve gram değerlerini kontrol edin (ters girilmiş olabilir)');
    }
  });

  // ---------- Y5 ----------
  if (ymRec) {
    var y5 = {};
    ymRec.rows.forEach(function (r) {
      var hm = String(r[ymRec.i.hammadde] || '').trim(); if (!hm) return;
      var k = hp_n_(hm);
      if (hmAdlari[k] || ymMi(hm)) return;
      (y5[hm] = y5[hm] || []).push(r[ymRec.i.yarimamuladi]);
    });
    Object.keys(y5).forEach(function (hm) {
      var yakin = rc_enYakin_(hp_n_(hm), hmAdlari);
      ekle('P2', 'Y5', hm, 'Yarı mamul reçetesindeki hammadde tanımsız (' + rc_uniq_(y5[hm]).slice(0, 3).join(', ') + ')',
        'Üretimde bu hammadde stoktan düşmez, maliyete girmez', yakin.s >= 0.7 ? 'Tbl_Hammaddeler\'deki "' + yakin.ad + '" olabilir' : 'Hammadde tablosuna ekleyin veya adı düzeltin');
    });
  }

  // ---------- R2 / R3 / R4 + kullanılan YM ----------
  var r2 = {}, r3 = {}, r4 = {};
  urRec.rows.forEach(function (r) {
    var urun = String(r[urRec.i.urunadi] || '').trim(), hm = String(r[urRec.i.hammadde] || '').trim();
    if (!urun || !hm) return;
    var tip = String(r[urRec.i.uruntipi] || '').toUpperCase().trim();
    var k = hp_n_(hm);
    if (ymMi(hm)) {
      kullanilanYm[k] = 1;
      var info = ctx.ym[k];
      if (info && hp_cevir_(info, hp_sayi_(r[urRec.i.miktar]) || 1, r[urRec.i.olcubirimi]) == null)
        (r4[info.ad + ' (' + r[urRec.i.olcubirimi] + ')'] = r4[info.ad + ' (' + r[urRec.i.olcubirimi] + ')'] || []).push(urun);
      if (!ciktiAd[k]) (r2[hm] = r2[hm] || []).push(urun);
      return;
    }
    if (tip === 'YM') {
      var yk = rc_enYakin_(k, ciktiAd);
      if (yk.s >= RC.BENZER_ESIK) { kullanilanYm[hp_n_(yk.ad)] = 1; (r2[hm + ' → "' + yk.ad + '"?'] = r2[hm + ' → "' + yk.ad + '"?'] || []).push(urun); }
      else (r2[hm] = r2[hm] || []).push(urun);
      return;
    }
    if (!hmAdlari[k]) (r3[hm] = r3[hm] || []).push(urun);
  });
  Object.keys(r2).forEach(function (a) {
    ekle('P1', 'R2', a, 'Ürün reçetesinde yarı mamul olarak geçiyor ama çıktı tablosunda yok (' + rc_uniq_(r2[a]).slice(0, 4).join(', ') + ')',
      'Bu ürünler satılınca yarı mamul düşmez; hazırlık planına girmez', a.indexOf('→') > 0 ? 'Reçetedeki yazımı düzeltin' : 'Çıktı tablosuna ekleyin veya reçetedeki adı düzeltin');
  });
  Object.keys(r3).forEach(function (a) {
    var yakin = rc_enYakin_(hp_n_(a), hmAdlari);
    ekle('P2', 'R3', a, 'Ürün reçetesindeki hammadde tanımsız (' + rc_uniq_(r3[a]).slice(0, 4).join(', ') + ')',
      'Satışta stoktan düşmez, maliyete girmez', yakin.s >= 0.7 ? '"' + yakin.ad + '" olabilir — adı eşitleyin' : 'Hammadde tablosuna ekleyin veya adı düzeltin');
  });
  Object.keys(r4).forEach(function (a) {
    ekle('P2', 'R4', a, 'Reçete birimi yarı mamulün takip birimine çevrilemiyor (' + rc_uniq_(r4[a]).slice(0, 4).join(', ') + ')',
      'Hazırlık planında bu satır sayılmıyor', 'Reçetede birimi yarı mamulün birimiyle yazın veya çıktı tablosuna porsiyon gramı girin');
  });

  // ---------- Y6 benzer adlar ----------
  var tumYm = {};
  Object.keys(ciktiAd).forEach(function (k) { tumYm[k] = ciktiAd[k]; });
  Object.keys(ymRecAd).forEach(function (k) { tumYm[k] = tumYm[k] || ymRecAd[k]; });
  var ks = Object.keys(tumYm), gorulen = {};
  for (var a = 0; a < ks.length; a++) for (var b = a + 1; b < ks.length; b++) {
    var s = hp_dice_(ks[a], ks[b]);
    if (s >= RC.BENZER_ESIK && !gorulen[ks[a] + ks[b]]) {
      gorulen[ks[a] + ks[b]] = 1;
      ekle('P2', 'Y6', tumYm[ks[a]] + ' ↔ ' + tumYm[ks[b]], 'Çok benzer iki yarı mamul adı (benzerlik %' + Math.round(s * 100) + ')',
        'Aynı ürün iki ayrı kayıt olabilir; stok ve üretim ikiye bölünür', 'Aynıysa tek ada birleştirin, farklıysa adı ayırt edici yapın');
    }
  }

  // ---------- Y7 ----------
  Object.keys(ciktiAd).forEach(function (k) {
    if (!kullanilanYm[k]) ekle('P3', 'Y7', ciktiAd[k], 'Hiçbir ürün reçetesinde kullanılmıyor', 'Satıştan düşmez; hazırlık planında hiç görünmez', 'Kullanıldığı ürünlerin reçetesine ekleyin ya da pasife alın');
  });

  // ---------- R1 satılan reçetesiz ürünler ----------
  var satis = rc_satisAdetleri_();
  var r1 = [];
  Object.keys(satis).forEach(function (ad) {
    var n = hp_n_(ad);
    if (ctx.alias[n] === '__YOK__') return;
    if (hp_receteCoz_(ctx, ad)) return;
    r1.push([ad, satis[ad]]);
  });
  r1.sort(function (x, y) { return y[1] - x[1]; });
  r1.forEach(function (x) {
    var ek = /^ekstra|sos$|mayonez|ketçap|ketcap/i.test(x[0]);
    var icecek = /\d+\s*(cl|ml)\b|\bcl\.|cola|sprite|fuse tea|ayran|soda|su \d|schweppes|pellegrino|istemiyorum/i.test(x[0]);
    if (icecek) return; // içecek ve seçenekler iş planına alınmaz (eşleştirmede YOK SAY yapılır)
    ekle(x[1] >= 20 ? 'P1' : 'P2', 'R1', x[0], 'Son ' + RC.GUN + ' günde ' + x[1] + ' adet satıldı, reçetesi yok' + (ek ? ' (ekstra)' : ''),
      'Stok düşümü, maliyet ve hazırlık planı bu ürünü görmüyor', ek ? 'Ekstra porsiyon reçetesi girin (ör. 30 gr sos)' : 'Reçeteyi girin; farklı adla varsa Hazirlik_Eslestirme\'de eşleyin');
  });

  // ---------- U1 üretim kayıtları ----------
  if (uretim) {
    var sinir = new Date(Date.now() - RC.GUN * 864e5), u1 = {}, u0 = {};
    uretim.rows.forEach(function (r) {
      var d = r[uretim.i.tarih] instanceof Date ? r[uretim.i.tarih] : hp_tarihParse_(r[uretim.i.tarih]);
      if (!d || d < sinir) return;
      var ad = String(r[uretim.i.yarimamul] || '').trim(); if (!ad) return;
      if (!ciktiAd[hp_n_(ad)]) u1[ad] = (u1[ad] || 0) + 1;
      if (!hp_sayi_(r[uretim.i.toplamgram]) && !hp_sayi_(r[uretim.i.porsiyonadet])) u0[ad] = (u0[ad] || 0) + 1;
    });
    Object.keys(u1).forEach(function (ad) {
      var yk = rc_enYakin_(hp_n_(ad), ciktiAd);
      ekle('P3', 'U1', ad, 'Üretim kaydındaki ad çıktı tablosuyla birebir aynı değil (' + u1[ad] + ' kayıt)',
        yk.s >= 0.85 ? 'Ajan "' + yk.ad + '" olarak eşliyor' : 'Bu üretimler stok hesabına girmiyor', yk.s >= 0.85 ? 'İsterseniz eski kayıtlardaki adı düzeltin' : 'Kaydı doğru yarı mamul adıyla düzeltin');
    });
    Object.keys(u0).forEach(function (ad) {
      ekle('P2', 'U1', ad + ' (0 miktar)', 'Son ' + RC.GUN + ' günde ' + u0[ad] + ' üretim 0 gram / 0 porsiyon kaydedildi',
        'Üretilen miktar stokta görünmüyor', 'Önce çıktı tablosuna 1 kat miktarını girin (Y3); eski kayıtlar için gerekirse elle düzeltin');
    });
  }

  rc_yaz_(bul);
  return bul.length;
}

/* ---------------- yardımcılar ---------------- */

function rc_hammaddeAdlari_(ss) {
  var out = {};
  hp_tekrar_(function () { return ss.getSheets(); }).forEach(function (sh) {
    if (sh.getLastRow() < 2) return;
    var lc = Math.min(sh.getLastColumn(), 40);
    var ust = hp_basliklar_(sh.getRange(1, 1, 1, lc).getValues()[0]);
    var kolonlar = [];
    if (ust.hammaddeid != null || ust.direktsatisurunlerid != null) {
      if (ust.hammaddeadi != null) kolonlar.push(ust.hammaddeadi);
      if (ust.hammadde != null) kolonlar.push(ust.hammadde);
    }
    if (!kolonlar.length) return;
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, lc).getValues();
    v.forEach(function (r) { kolonlar.forEach(function (c) { var a = String(r[c] || '').trim(); if (a) out[hp_n_(a)] = a; }); });
  });
  return out;
}

function rc_satisAdetleri_() {
  var v = hp_tekrar_(function () {
    var sh = SpreadsheetApp.openById(HP.SATIS_ID);
    return (sh.getSheetByName(HP.SATIS_SEKME) || sh.getSheets()[0]).getDataRange().getValues();
  });
  var i = hp_basliklar_(v[0]), sinir = new Date(Date.now() - RC.GUN * 864e5), out = {};
  for (var r = 1; r < v.length; r++) {
    if (i.durum != null && String(v[r][i.durum]).toUpperCase() !== 'KAPALI') continue;
    var d = v[r][i.siparistarihi] instanceof Date ? v[r][i.siparistarihi] : hp_tarihParse_(v[r][i.siparistarihi]);
    if (!d || d < sinir) continue;
    var u = String(v[r][i.urunler] || '').split('|'), a = String(v[r][i.urunadetleri] || '').split('|');
    for (var j = 0; j < u.length; j++) { var ad = u[j].trim(); if (ad) out[ad] = (out[ad] || 0) + (hp_sayi_(a[j]) || 1); }
  }
  return out;
}

function rc_enYakin_(k, sozluk) {
  var best = { ad: '', s: 0 };
  Object.keys(sozluk).forEach(function (x) { if (x === k) return; var s = hp_dice_(k, x); if (s > best.s) best = { ad: sozluk[x], s: s }; });
  return best;
}
function rc_uniq_(a) { var m = {}; return a.filter(function (x) { x = String(x); if (m[x]) return false; m[x] = 1; return true; }); }

function rc_dosya_() {
  if (rc_dosya_._ss) return rc_dosya_._ss;
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('RC_DOSYA_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create(RC.DOSYA_AD); props.setProperty('RC_DOSYA_ID', ss.getId()); }
  var eski = HP.KLASOR; HP.KLASOR = RC.KLASOR;
  try { hp_klasoreTasi_(ss.getId()); } finally { HP.KLASOR = eski; }
  rc_dosya_._ss = ss;
  return ss;
}

function rc_yaz_(bul) {
  var ss = rc_dosya_();
  var sh = hp_sekme_(ss, RC.SEKME, ['Öncelik', 'Kod', 'Kayıt', 'Sorun', 'Etkisi', 'Önerilen düzeltme', 'Sorumlu', 'Durum (siz doldurun)', 'Not', 'İlk Tespit', 'Son Görülme']);
  var eski = {}, bugun = new Date();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues().forEach(function (r) { if (r[1]) eski[r[1] + '|' + r[2]] = r; });
  var sorumlu = { R1: 'Reçete & Ar-Ge → Şef onayı', R2: 'Reçete & Ar-Ge', R3: 'Reçete & Ar-Ge + Stok', R4: 'Reçete & Ar-Ge',
    Y1: 'Reçete & Ar-Ge', Y2: 'Reçete & Ar-Ge → Şef onayı', Y3: 'Şef (değer girişi)', Y4: 'Şef (değer kontrolü)', Y5: 'Stok & Satın Alma',
    Y6: 'Reçete & Ar-Ge → Sahip kararı', Y7: 'Reçete & Ar-Ge', U1: 'Mutfak / Hazırlık' };
  var yeni = [], anahtar = {};
  bul.forEach(function (b) {
    var k = b[1] + '|' + b[2]; if (anahtar[k]) return; anahtar[k] = 1;
    var e = eski[k];
    var durum = e && e[7] && String(e[7]).indexOf('ÇÖZÜLDÜ (otomatik)') !== 0 ? e[7] : 'AÇIK';
    yeni.push([b[0], b[1], b[2], b[3], b[4], b[5], sorumlu[b[1]] || '', durum, e ? e[8] : '', e ? e[9] : bugun, bugun]);
  });
  Object.keys(eski).forEach(function (k) {
    if (anahtar[k]) return;
    var e = eski[k].slice(); e[7] = 'ÇÖZÜLDÜ (otomatik)'; yeni.push(e);
  });
  var sira = { P1: 1, P2: 2, P3: 3 };
  yeni.sort(function (x, y) {
    var cx = String(x[7]).indexOf('ÇÖZÜLDÜ') === 0 ? 1 : 0, cy = String(y[7]).indexOf('ÇÖZÜLDÜ') === 0 ? 1 : 0;
    return cx - cy || (sira[x[0]] || 9) - (sira[y[0]] || 9) || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0);
  });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 11).clearContent();
  if (yeni.length) sh.getRange(2, 1, yeni.length, 11).setValues(yeni);

  var say = { P1: 0, P2: 0, P3: 0 }, acik = yeni.filter(function (r) { return String(r[7]).indexOf('ÇÖZÜLDÜ') !== 0; });
  acik.forEach(function (r) { say[r[0]]++; });
  var h = '<div style="font-family:Arial,sans-serif;font-size:13px"><h2 style="margin:0 0 6px">Reçete Çapraz Kontrol · İş Planı</h2>' +
    '<p>Açık: <b>' + acik.length + '</b> (P1 ' + say.P1 + ' · P2 ' + say.P2 + ' · P3 ' + say.P3 + ') · Çözülen: ' + (yeni.length - acik.length) + '</p>' +
    '<table cellpadding="5" style="border-collapse:collapse;font-size:13px"><tr style="background:#222;color:#fff"><th>Önc.</th><th>Kod</th><th align="left">Kayıt</th><th align="left">Sorun</th><th align="left">Düzeltme</th></tr>';
  acik.filter(function (r) { return r[0] === 'P1'; }).forEach(function (r) {
    h += '<tr style="border-bottom:1px solid #eee"><td>' + r[0] + '</td><td>' + r[1] + '</td><td><b>' + r[2] + '</b></td><td>' + r[3] + '</td><td>' + r[5] + '</td></tr>';
  });
  h += '</table><p>Tüm liste: ' + ss.getUrl() + '</p></div>';
  MailApp.sendEmail({ to: RC.MAIL, subject: 'BAP Reçete Kontrol · ' + acik.length + ' açık iş (P1: ' + say.P1 + ')', htmlBody: h });
  Logger.log('İş planı: ' + acik.length + ' açık (P1 ' + say.P1 + ', P2 ' + say.P2 + ', P3 ' + say.P3 + ') · ' + ss.getUrl());
}