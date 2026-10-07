/**
 * BAP OPERASYON — MUTFAK HAZIRLIK PLANLAMA AJANI  (hp_hazirlik.gs  v1.4)
 * --------------------------------------------------------------------
 * Nereye: "BAP Stok Takip Sistemi" → Uzantılar → Apps Script (mevcut "Hazırlık Ajanı" dosyasının yerine)
 * Her gece 23:30:
 *   1) Yarının ihtiyacını tahmin eder: son 8 haftanın AYNI GÜNÜ (son 4 hafta 2 kat) × reçeteler
 *      × Hazirlik_Takvim çarpanı × (1 + güvenlik payı)
 *   2) STOK SORGUSU: şubedeki yarı mamul stoğunu hesaplar
 *      = son YM sayımı + üretim kaydındaki partiler − satıştan tüketim (ilk üretilen ilk tüketilir)
 *        − raf ömrünü dolduran partiler (Hazirlik_Raf_Omru)
 *   3) Net ihtiyaç = ihtiyaç − eldeki. Eldeki yetiyorsa ÜRETİM İSTEMEZ.
 *   4) Üretim, reçetenin standart partisinin katı olarak istenir: 0,5 · 1 · 1,5 · 2 … (yukarı yuvarlanır)
 *      Yarım parti bile raf ömrü içinde tüketilemiyorsa tahmini fireyi not düşer.
 *   5) "BAP Mutfak Hazırlık Planı" dosyasına yazar + e-posta; dünkü plan ↔ gerçek karşılaştırması
 * v1.4: e-postanın sonuna dünkü plan ↔ gerçek satış karşılaştırması eklendi (eksik / fazla / satılmadı).
 * v1.3: eldeki hesabına Zayi_Girisleri (yarı mamul zayi) ve Transferler (şubeler arası) eklendi;
 *       gram girilmiş adet takipli sayımlar porsiyona çevrilir. Kaynak dosyalar yalnızca OKUNUR —
 *       mutfak paneli (bap-sistem.pages.dev) ve Uretim_Girisleri'ne dokunulmaz.
 * v1.1: çıktılar ayrı hafif dosyada; stok dosyası sadece okunur; zaman aşımında yeniden dener.
 * Tüm global adlar hp_ önekli. İlk çalıştırma: hp_kurulum() · Elle: hp_planOlustur() · Mailsiz: hp_testTarih()
 */

var HP = {
  SATIS_ID: '1gdn_rbaevKx9_-pNTRKL1DDtytFxZHr9QF-jrS4cHPE', // BAP Adisyo Siparis Datası
  STOK_ID: '1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE',  // BAP Stok Takip Sistemi (sadece okunur)
  CIKTI_ID: '',             // boş: hp_kurulum "BAP Mutfak Hazırlık Planı" dosyasını açar ve kimliğini saklar
  CIKTI_AD: 'BAP Mutfak Hazırlık Planı',
  KLASOR: ['Departmanlar', 'Operasyon Departmanı', 'Hazırlık Ajanı'], // Drive'da ajanın dosyaları burada durur
  SATIS_SEKME: 'Satıs Verileri',
  HAFTA: 8,                 // kaç hafta geriye bakılır
  YAKIN_HAFTA: 4,           // son kaç hafta 2 kat ağırlık alır
  GUVENLIK: 0.10,           // %10 güvenlik payı
  GUN_BASLANGIC_SAAT: 5,    // 05:00'ten önceki siparişler bir önceki iş gününe sayılır
  DICE_ESIK: 0.82,          // satış adı ↔ reçete adı otomatik eşleşme eşiği
  KAT_ADIM: 0.5,            // üretim reçetenin 0,5 · 1 · 1,5 · 2 … katı olarak istenir
  STOK_GERI_GUN: 21,        // eldeki stok hesabı için kaç gün geriye bakılır
  RAF_VARSAYILAN: {         // Hazirlik_Raf_Omru boşsa kategoriye göre VARSAYILAN gün (şef onaylamalı)
    'hamurveunlumamuller': 3, 'soslar': 3, 'haslamavepisirme': 2, 'urunhazirlik': 2, 'pastavetatlicilik': 3, '_': 2
  },
  MAIL: 'mertharman@gmail.com',
  SUBELER: ['Erenköy', 'Fikirtepe'],
  TZ: 'Europe/Istanbul',
  PLAN: 'Hazirlik_Plani',
  GECMIS: 'Hazirlik_Plan_Gecmis',
  ESLESME: 'Hazirlik_Eslestirme',
  TAKVIM: 'Hazirlik_Takvim',
  DOGRULUK: 'Hazirlik_Dogruluk',
  RAF: 'Hazirlik_Raf_Omru',
  STOK: 'Hazirlik_Stok'
};

/* ============================ KURULUM ============================ */

function hp_kurulum() {
  var ss = hp_cikti_();
  var plan = ss.getSheetByName(HP.PLAN);
  if (plan && plan.getLastColumn() > 0 && String(plan.getRange(1, 6).getValue()).indexOf('Yarın') !== 0) {
    plan.clear(); // v1.1 başlıklarını yenile
  }
  hp_sekme_(ss, HP.PLAN, ['Tarih', 'Şube', 'Kategori', 'Yarı Mamul', 'Birim', 'Yarın İhtiyaç (pay dahil)',
    'Raf Ömrü İçi İhtiyaç', 'Eldeki (sistem)', 'Eldeki (mutfak düzeltir)', 'Net İhtiyaç', '1 Kat =',
    'Üretilecek Kat', 'Üretilecek Miktar', 'Not']);
  hp_sekme_(ss, HP.GECMIS, ['Tarih', 'Şube', 'Yarı Mamul', 'Birim', 'Plan (ihtiyaç)', 'Oluşturma', 'Eldeki', 'Üretilecek Kat']);
  var gsh = ss.getSheetByName(HP.GECMIS);
  if (gsh.getLastColumn() < 8) gsh.getRange(1, 7, 1, 2).setValues([['Eldeki', 'Üretilecek Kat']]).setFontWeight('bold').setBackground('#222').setFontColor('#fff');
  hp_sekme_(ss, HP.ESLESME, ['Satış Adı', 'Reçete Adı', 'Durum (OTOMATİK / ELLE / YOK SAY / EŞLEŞMEDİ)', 'Benzerlik', 'Öneri', 'Son Görülme']);
  hp_sekme_(ss, HP.TAKVIM, ['Tarih (gg.aa.yyyy)', 'Şube (Tümü / Erenköy / Fikirtepe)', 'Çarpan (örn 1,3)', 'Sebep']);
  hp_sekme_(ss, HP.DOGRULUK, ['Tarih', 'Şube', 'Yarı Mamul', 'Birim', 'Plan', 'Gerçek İhtiyaç', 'Üretilen (kayıt)', 'Sapma %', 'Değerlendirme']);
  hp_sekme_(ss, HP.RAF, ['Yarı Mamul', 'Kategori', 'Raf Ömrü (gün)', 'Kaynak (VARSAYILAN / ŞEF)', 'Not']);
  hp_sekme_(ss, HP.STOK, ['Hesap Tarihi', 'Şube', 'Yarı Mamul', 'Birim', 'Eldeki', 'Parti Sayısı', 'En Eski Parti', 'Raf Ömrü (gün)',
    'Son Sayım', 'Son 3 Gün Fire (tahmini)', 'Uyarı']);
  hp_rafDoldur_(ss, hp_context_());

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'hp_gunluk') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('hp_gunluk').timeBased().atHour(23).nearMinute(30).everyDays(1).inTimezone(HP.TZ).create();
  PropertiesService.getScriptProperties().getKeys().forEach(function (k) {
    if (k.indexOf('HP_TBL_') === 0) PropertiesService.getScriptProperties().deleteProperty(k);
  });
  Logger.log('Kurulum tamam. Plan dosyası: ' + ss.getUrl() + '  ·  her gece 23:30 hp_gunluk tetikleyicisi kuruldu.');
}

function hp_gunluk() {
  var dog = null;
  try { dog = hp_dogrulukKontrol(); } catch (e) { Logger.log('Doğruluk hatası: ' + e); }
  hp_planOlustur(null, false, dog);
}

/** Belirli bir tarih için elle deneme: hp_testTarih('18.09.2026') */
function hp_testTarih(tarihStr) {
  hp_planOlustur(tarihStr ? hp_tarihParse_(tarihStr) : null, true);
}

/* ============================ PLAN ============================ */

/** dog: hp_dogrulukKontrol() çıktısı — verilirse mailin sonuna "dünkü plan ↔ gerçek satış" eklenir */
function hp_planOlustur(hedef, mailYok, dog) {
  var ss = hp_cikti_();
  if (!hedef) hedef = new Date(Date.now() + 864e5);
  var D = hp_gunKey_(hedef);
  var bugun = hp_keyEkle_(D, -1);
  var ctx = hp_context_();
  var raf = hp_rafOku_(ss, ctx);
  var maxRaf = 1;
  Object.keys(raf).forEach(function (k) { maxRaf = Math.max(maxRaf, raf[k]); });
  maxRaf = Math.min(maxRaf, 6);

  // Tek okumada gereken tüm günler: tahmin günleri (D..D+maxRaf-1) için 8 hafta geçmiş + stok penceresi
  var tahminGunleri = [], istenen = {};
  for (var i = 0; i < maxRaf; i++) tahminGunleri.push(hp_keyEkle_(D, i));
  tahminGunleri.forEach(function (X) {
    for (var k = 1; k <= HP.HAFTA; k++) istenen[hp_keyEkle_(X, -7 * k)] = 1;
  });
  var pencereBas = hp_keyEkle_(bugun, -HP.STOK_GERI_GUN);
  var pencere = [];
  for (var g = pencereBas; g <= bugun; g = hp_keyEkle_(g, 1)) { pencere.push(g); istenen[g] = 1; }
  var talep = hp_talep_(ctx, Object.keys(istenen));

  var takvim = {};
  tahminGunleri.forEach(function (X) { takvim[X] = hp_takvim_(ss, X); });
  var tahmin = {};  // X → sube → ym → {ort, tavan}
  tahminGunleri.forEach(function (X) { tahmin[X] = hp_tahmin_(talep, X, takvim[X]); });

  // STOK SORGUSU (Stok & Satın Alma ajanının hizmeti — şimdilik burada hesaplanır)
  var stok = hp_stokSorgu_(ctx, raf, talep, pencere, D);

  var satirlar = [], gecmis = [], stokSatir = [], mailVeri = {};
  HP.SUBELER.forEach(function (sube) {
    var liste = [];
    var ymler = {};
    tahminGunleri.forEach(function (X) { Object.keys(tahmin[X][sube] || {}).forEach(function (ym) { ymler[ym] = 1; }); });
    Object.keys((stok[sube] || {})).forEach(function (ym) { ymler[ym] = 1; });

    Object.keys(ymler).forEach(function (ym) {
      var info = ctx.ym[ym]; if (!info) return;
      var R = Math.min(raf[ym] || 2, 6);
      var yarin = ((tahmin[D][sube] || {})[ym] || { plan: 0 }).plan;
      var rafIci = 0;
      for (var j = 0; j < R && j < tahminGunleri.length; j++) rafIci += ((tahmin[tahminGunleri[j]][sube] || {})[ym] || { plan: 0 }).plan;
      var st = (stok[sube] || {})[ym] || { eldeki: 0, partiler: [], uyari: '' };
      if (yarin < 0.0001 && st.eldeki < 0.0001) return;

      var net = Math.max(0, yarin - st.eldeki);
      var kat = 0, not = [];
      if (net > 0 && info.base > 0) kat = Math.ceil(net / info.base / HP.KAT_ADIM - 1e-9) * HP.KAT_ADIM;
      if (net > 0 && !info.base) not.push('1 kat miktarı tanımsız — elle hazırlanır');
      if (net === 0 && yarin > 0) not.push('Eldeki yeter, üretim yok');
      if (kat > 0) {
        // raf ömrü içinde tüketilemeyecek kısım (tahmini fire)
        var toplam = st.eldeki + kat * info.base;
        var artan = toplam - rafIci;
        if (artan > info.base * 0.25 && kat === HP.KAT_ADIM) not.push('Yarım kat bile ' + R + ' günde bitmiyor, tahmini fire ' + hp_fmt_(artan, info.planBirim));
        else if (artan > info.base * 0.5) not.push('Raf ömrü içinde ' + hp_fmt_(artan, info.planBirim) + ' artabilir');
      }
      if (st.uyari) not.push(st.uyari);
      if (takvim[D]._not) not.push('Takvim: ' + takvim[D]._not);
      var yuv = info.planBirim === 'adet' ? 1 : 10;
      liste.push({ ym: info.ad, kat: info.kategori || '', birim: info.planBirim, yarin: yarin, rafIci: rafIci,
        eldeki: st.eldeki, net: net, base: info.base, uretKat: kat, not: not.join(' · ') });
      stokSatir.push([hp_gosterTarih_(D), sube, info.ad, info.planBirim, hp_yuv_(st.eldeki, yuv), st.partiler.length,
        st.partiler.length ? hp_gosterTarih_(st.partiler[0].t) : '', R, st.sayim || '', hp_yuv_(st.fire || 0, yuv), st.uyari || '']);
    });
    liste.sort(function (a, b) { return a.kat === b.kat ? b.yarin - a.yarin : (a.kat < b.kat ? -1 : 1); });
    mailVeri[sube] = liste;
    liste.forEach(function (r) {
      var yuv = r.birim === 'adet' ? 1 : 10;
      satirlar.push([hp_gosterTarih_(D), sube, r.kat, r.ym, r.birim, Math.ceil(r.yarin / yuv) * yuv, Math.ceil(r.rafIci / yuv) * yuv,
        hp_yuv_(r.eldeki, yuv), '', '', r.base || '', '', '', r.not]);
      gecmis.push([hp_gosterTarih_(D), sube, r.ym, r.birim, Math.ceil(r.yarin / yuv) * yuv, new Date(), hp_yuv_(r.eldeki, yuv), r.uretKat]);
    });
  });

  // Plan sekmesi — mutfak "Eldeki (mutfak düzeltir)" girerse net/kat/miktar yeniden hesaplanır
  var sh = hp_sekme_(ss, HP.PLAN, []);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 14).clearContent();
  if (satirlar.length) {
    sh.getRange(2, 1, satirlar.length, 14).setValues(satirlar);
    var fJ = [], fL = [], fM = [];
    for (var i2 = 0; i2 < satirlar.length; i2++) {
      var r = i2 + 2; // formüller her yerel ayarda İngilizce söz dizimiyle yazılır
      fJ.push(['=MAX(0,F' + r + '-IF(I' + r + '="",H' + r + ',N(I' + r + ')))']);
      fL.push(['=IF(OR(J' + r + '=0,N(K' + r + ')=0),0,CEILING(J' + r + '/K' + r + ',' + HP.KAT_ADIM + '))']);
      fM.push(['=L' + r + '*N(K' + r + ')']);
    }
    sh.getRange(2, 10, fJ.length, 1).setFormulas(fJ);
    sh.getRange(2, 12, fL.length, 1).setFormulas(fL);
    sh.getRange(2, 13, fM.length, 1).setFormulas(fM);
    sh.getRange(2, 9, satirlar.length, 1).setBackground('#FFF8E1');
  }
  var gs = ss.getSheetByName(HP.GECMIS);
  if (gs && gecmis.length) { hp_gecmisTemizle_(gs, hp_gosterTarih_(D)); gs.getRange(gs.getLastRow() + 1, 1, gecmis.length, 8).setValues(gecmis); }
  var ss2 = hp_sekme_(ss, HP.STOK, []);
  if (ss2.getLastRow() > 1) ss2.getRange(2, 1, ss2.getLastRow() - 1, 11).clearContent();
  if (stokSatir.length) ss2.getRange(2, 1, stokSatir.length, 11).setValues(stokSatir);
  hp_eslesmeYaz_(ss, ctx);
  hp_rafDoldur_(ss, ctx);

  if (!mailYok) hp_mail_(D, mailVeri, ctx, takvim[D], dog);
  var uretSay = 0;
  Object.keys(mailVeri).forEach(function (sb) { mailVeri[sb].forEach(function (x) { if (x.uretKat > 0) uretSay++; }); });
  Logger.log('Plan ' + hp_gosterTarih_(D) + ': ' + satirlar.length + ' kalem, üretim istenen ' + uretSay + ' · eşleşmeyen ürün: ' + Object.keys(ctx.eslesmeyen).length);
  return mailVeri;
}

/** X günü için şube × YM tahmini (ağırlıklı aynı gün ortalaması × takvim × güvenlik) */
function hp_tahmin_(talep, X, takvim) {
  var out = {};
  HP.SUBELER.forEach(function (sube) {
    var toplam = {}, agirlik = 0, tavan = {};
    for (var k = 1; k <= HP.HAFTA; k++) {
      var key = hp_keyEkle_(X, -7 * k), w = k <= HP.YAKIN_HAFTA ? 2 : 1;
      if (!((talep._siparis[key] || {})[sube])) continue; // kapalı / henüz yaşanmamış gün
      agirlik += w;
      var m = (talep[key] || {})[sube] || {};
      Object.keys(m).forEach(function (ym) { toplam[ym] = (toplam[ym] || 0) + m[ym] * w; tavan[ym] = Math.max(tavan[ym] || 0, m[ym]); });
    }
    var carpan = (takvim['Tümü'] || 1) * (takvim[sube] || 1);
    out[sube] = {};
    Object.keys(toplam).forEach(function (ym) {
      var ort = agirlik ? toplam[ym] / agirlik : 0;
      out[sube][ym] = { ort: ort, plan: ort * carpan * (1 + HP.GUVENLIK), tavan: tavan[ym] || 0 };
    });
  });
  return out;
}

/* ============================ STOK SORGUSU ============================
 * Stok & Satın Alma ajanının hizmeti. Sube_Stok'taki teorik YM stoğu şu an güvenilir olmadığı için
 * eldeki yarı mamul, partiler üzerinden hesaplanır (kaynaklar: Sayim_Girisleri, Uretim_Girisleri,
 * Transferler, Zayi_Girisleri — hepsi mutfak panelinden gelir, sadece okunur):
 *   son YM sayımı (varsa) → üretim partileri + gelen transfer → zayi, giden transfer ve satış tüketimi en eski partiden düşülür
 *   → raf ömrünü dolduran parti fire sayılıp çıkarılır. Sonuç: D sabahı kullanılabilir eldeki miktar.
 * Stok ajanı kendi modülünü kurduğunda sadece bu fonksiyon onun kaynağına bağlanacak.
 */
function hp_stokSorgu_(ctx, raf, talep, pencere, D) {
  var stokSS = hp_stokDosya_();
  var uretim = hp_uretimGunluk_(stokSS, ctx, pencere);   // gün → 'sube|ym' → miktar
  var sayim = hp_sayimGunluk_(stokSS, ctx, pencere);     // gün → 'sube|ym' → miktar
  var zayi = hp_zayiGunluk_(stokSS, ctx, pencere);       // gün → 'sube|ym' → miktar
  var trf = hp_transferGunluk_(stokSS, ctx, pencere);    // gün → 'sube|ym' → +giren / −çıkan
  var out = {};
  HP.SUBELER.forEach(function (sube) { out[sube] = {}; });
  var anahtarlar = {};
  pencere.forEach(function (g) {
    Object.keys(uretim[g] || {}).forEach(function (k) { anahtarlar[k] = 1; });
    Object.keys(sayim[g] || {}).forEach(function (k) { anahtarlar[k] = 1; });
    Object.keys(trf[g] || {}).forEach(function (k) { anahtarlar[k] = 1; });
  });
  Object.keys(anahtarlar).forEach(function (k) {
    var p = k.split('|'), sube = p[0], ym = p[1], info = ctx.ym[ym];
    if (!info || !out[sube]) return;
    var R = raf[ym] || 2, partiler = [], fire3 = 0, sonSayim = '', uyari = '';
    var gunler = pencere.concat([D]);
    gunler.forEach(function (g) {
      // raf ömrü dolanlar (g >= üretim + R)
      partiler = partiler.filter(function (pt) {
        if (hp_keyEkle_(pt.t, R) <= g) { if (g > hp_keyEkle_(D, -4)) fire3 += pt.q; return false; }
        return true;
      });
      if (g === D) return;
      if (sayim[g] && sayim[g][k] != null) {
        partiler = [{ t: g, q: sayim[g][k] }];
        sonSayim = hp_gosterTarih_(g) + ': ' + hp_fmt_(sayim[g][k], info.planBirim);
      }
      if (uretim[g] && uretim[g][k]) partiler.push({ t: g, q: uretim[g][k] });
      var tr = (trf[g] || {})[k] || 0;
      if (tr > 0) partiler.push({ t: g, q: tr });
      function dus(miktar) {
        while (miktar > 1e-9 && partiler.length) {
          var al = Math.min(miktar, partiler[0].q);
          partiler[0].q -= al; miktar -= al;
          if (partiler[0].q <= 1e-9) partiler.shift();
        }
      }
      dus((zayi[g] || {})[k] || 0);                        // zayi en eski partiden
      if (tr < 0) dus(-tr);                                // diğer şubeye verilen
      dus((((talep[g] || {})[sube]) || {})[ym] || 0);      // satış tüketimi
    });
    var eldeki = partiler.reduce(function (a, b) { return a + b.q; }, 0);
    if (!sonSayim && eldeki > 0) uyari = 'Eldeki üretim kaydından hesaplandı (sayım yok)';
    out[sube][ym] = { eldeki: eldeki, partiler: partiler, fire: fire3, sayim: sonSayim, uyari: uyari };
  });
  return out;
}

/** Yarı mamul üretim kaydı: gün → 'sube|ym' → plan birimine çevrilmiş miktar */
function hp_uretimGunluk_(ss, ctx, gunler) {
  var ist = {}; gunler.forEach(function (g) { ist[g] = 1; });
  var out = {};
  var t = hp_tabloBul_(ss, ['yarimamul', 'recetekatsayisi', 'toplamgram', 'porsiyonadet']);
  if (!t) return out;
  var ymAdlari = Object.keys(ctx.ym);
  t.rows.forEach(function (r) {
    var d = r[t.i.tarih] instanceof Date ? r[t.i.tarih] : hp_tarihParse_(r[t.i.tarih]);
    if (!d) return;
    var g = Utilities.formatDate(d, HP.TZ, 'yyyy-MM-dd');
    if (!ist[g]) return;
    var sube = hp_subeCoz_(r[t.i.sube], ''), ym = hp_ymBul_(ctx, ymAdlari, r[t.i.yarimamul]);
    if (!sube || !ym) return;
    var info = ctx.ym[ym];
    var kat = hp_sayi_(r[t.i.recetekatsayisi]);
    var q = info.planBirim === 'adet' ? (hp_sayi_(r[t.i.porsiyonadet]) || kat * info.base)
                                      : (hp_sayi_(r[t.i.toplamgram]) || kat * info.base);
    if (!q) return;
    out[g] = out[g] || {};
    out[g][sube + '|' + ym] = (out[g][sube + '|' + ym] || 0) + q;
  });
  return out;
}

/** Sayım kaydındaki yarı mamul sayımları: gün → 'sube|ym' → miktar (aynı gün son sayım geçerli) */
function hp_sayimGunluk_(ss, ctx, gunler) {
  var ist = {}; gunler.forEach(function (g) { ist[g] = 1; });
  var out = {};
  var t = hp_tabloBul_(ss, ['tarih', 'sube', 'urunadi', 'sayimmiktar', 'teorikmiktar']);
  if (!t) return out;
  var ymAdlari = Object.keys(ctx.ym);
  t.rows.forEach(function (r) {
    var d = r[t.i.tarih] instanceof Date ? r[t.i.tarih] : hp_tarihParse_(r[t.i.tarih]);
    if (!d) return;
    var g = Utilities.formatDate(d, HP.TZ, 'yyyy-MM-dd');
    if (!ist[g]) return;
    var ym = ctx.ym[hp_n_(r[t.i.urunadi])] ? hp_n_(r[t.i.urunadi]) : null; // sayımda sadece birebir YM adı
    var sube = hp_subeCoz_(r[t.i.sube], '');
    if (!ym || !sube || r[t.i.sayimmiktar] === '' || r[t.i.sayimmiktar] == null) return;
    var v = hp_sayi_(r[t.i.sayimmiktar]), info = ctx.ym[ym];
    // adet takipli yarı mamul gram olarak sayılmışsa porsiyona çevir (ör. Fettucine 3000 → 15 adet)
    if (info.planBirim === 'adet' && info.pGram && v > Math.max(50, info.base * 10)) v = v / info.pGram;
    out[g] = out[g] || {};
    out[g][sube + '|' + ym] = v;
  });
  return out;
}

/** Zayi_Girisleri: yarı mamul zayileri, gün → 'sube|ym' → plan birimi */
function hp_zayiGunluk_(ss, ctx, gunler) {
  var ist = {}; gunler.forEach(function (g) { ist[g] = 1; });
  var out = {};
  var t = hp_tabloBul_(ss, ['tarih', 'sube', 'tip', 'urun', 'miktar', 'birim', 'sebep']);
  if (!t) return out;
  t.rows.forEach(function (r) {
    var tip = hp_n_(r[t.i.tip]);
    if (tip && tip.indexOf('yari') !== 0 && tip !== 'ym') return;
    var d = r[t.i.tarih] instanceof Date ? r[t.i.tarih] : hp_tarihParse_(r[t.i.tarih]);
    if (!d) return;
    var g = Utilities.formatDate(d, HP.TZ, 'yyyy-MM-dd');
    if (!ist[g]) return;
    var ym = hp_ymBul_(ctx, Object.keys(ctx.ym), r[t.i.urun]), sube = hp_subeCoz_(r[t.i.sube], '');
    if (!ym || !sube) return;
    var q = hp_cevir_(ctx.ym[ym], hp_sayi_(r[t.i.miktar]), r[t.i.birim]);
    if (!q) return;
    out[g] = out[g] || {};
    out[g][sube + '|' + ym] = (out[g][sube + '|' + ym] || 0) + q;
  });
  return out;
}

/** Transferler: onaylanan / direkt çıkış yarı mamul transferleri. Alan şubeye +, veren şubeye − */
function hp_transferGunluk_(ss, ctx, gunler) {
  var ist = {}; gunler.forEach(function (g) { ist[g] = 1; });
  var out = {};
  var t = hp_tabloBul_(ss, ['talepedensube', 'verensube', 'urunadi', 'onaymiktar', 'durum']);
  if (!t) return out;
  var ymAdlari = Object.keys(ctx.ym);
  t.rows.forEach(function (r) {
    var durum = hp_n_(r[t.i.durum]);
    if (!(durum.indexOf('onay') === 0 || durum.indexOf('direkt') === 0 || durum.indexOf('tamam') === 0 || durum.indexOf('teslim') === 0)) return;
    var ym = hp_ymBul_(ctx, ymAdlari, r[t.i.urunadi]); if (!ym) return;
    var d = r[t.i.tarih] instanceof Date ? r[t.i.tarih] : hp_tarihParse_(r[t.i.tarih]);
    if (!d) return;
    var g = Utilities.formatDate(d, HP.TZ, 'yyyy-MM-dd');
    if (!ist[g]) return;
    var q = hp_cevir_(ctx.ym[ym], hp_sayi_(r[t.i.onaymiktar]), r[t.i.birim]);
    if (!q) return;
    var alan = hp_subeCoz_(r[t.i.talepedensube], ''), veren = hp_subeCoz_(r[t.i.verensube], '');
    out[g] = out[g] || {};
    if (alan) out[g][alan + '|' + ym] = (out[g][alan + '|' + ym] || 0) + q;
    if (veren) out[g][veren + '|' + ym] = (out[g][veren + '|' + ym] || 0) - q;
  });
  return out;
}

/** Raf ömrü: sekmeden okur, boşsa kategori varsayılanı */
function hp_rafOku_(ss, ctx) {
  var out = {};
  Object.keys(ctx.ym).forEach(function (k) {
    var kat = hp_n_(ctx.ym[k].kategori);
    out[k] = HP.RAF_VARSAYILAN[kat] || HP.RAF_VARSAYILAN._;
  });
  var sh = ss.getSheetByName(HP.RAF);
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
    var k = hp_n_(r[0]), v = hp_sayi_(r[2]);
    if (k && ctx.ym[k] && v > 0) out[k] = Math.round(v);
  });
  return out;
}

/** Raf ömrü sekmesine yeni yarı mamulleri varsayılan değerle ekler (şef düzeltir, Kaynak = ŞEF yapar) */
function hp_rafDoldur_(ss, ctx) {
  var sh = hp_sekme_(ss, HP.RAF, []);
  var var_ = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { var_[hp_n_(r[0])] = 1; });
  var yeni = [];
  Object.keys(ctx.ym).forEach(function (k) {
    if (var_[k]) return;
    var info = ctx.ym[k], kat = hp_n_(info.kategori);
    yeni.push([info.ad, info.kategori || '', HP.RAF_VARSAYILAN[kat] || HP.RAF_VARSAYILAN._, 'VARSAYILAN', 'Şef onaylasın']);
  });
  if (yeni.length) sh.getRange(sh.getLastRow() + 1, 1, yeni.length, 5).setValues(yeni);
}

/* ============================ DOĞRULUK ============================ */

function hp_dogrulukKontrol(tarih) {
  var ss = hp_cikti_();
  var dunKey = tarih ? hp_gunKey_(tarih) : hp_keyEkle_(hp_gunKey_(new Date()), -1);
  var ctx = hp_context_();
  var talep = hp_talep_(ctx, [dunKey]);
  var gTarih = hp_gosterTarih_(dunKey);

  var plan = {};
  var g = ss.getSheetByName(HP.GECMIS);
  if (g && g.getLastRow() > 1) g.getRange(2, 1, g.getLastRow() - 1, 5).getDisplayValues().forEach(function (r) {
    if (r[0] === gTarih) plan[r[1] + '|' + hp_n_(r[2])] = hp_sayi_(r[4]);
  });
  var uretim = (hp_uretimGunluk_(hp_stokDosya_(), ctx, [dunKey])[dunKey]) || {};

  var anahtarlar = {};
  Object.keys(plan).forEach(function (k) { anahtarlar[k] = 1; });
  HP.SUBELER.forEach(function (s) {
    Object.keys(((talep[dunKey] || {})[s]) || {}).forEach(function (ym) { anahtarlar[s + '|' + ym] = 1; });
  });
  var out = [];
  Object.keys(anahtarlar).forEach(function (k) {
    var p = k.split('|'), sube = p[0], ym = p[1], info = ctx.ym[ym];
    if (!info) return;
    var pl = plan[k] || 0, ger = (((talep[dunKey] || {})[sube]) || {})[ym] || 0, ur = uretim[k] || '';
    var planVar = plan.hasOwnProperty(k);
    var sap = planVar && ger ? (pl - ger) / ger : '';
    var deg = !planVar ? 'Plan yok' : (sap === '' ? '' : (sap < -0.05 ? 'EKSİK planlandı' : (sap > 0.35 ? 'Fazla planlandı' : 'Uygun')));
    out.push([gTarih, sube, info.ad, info.planBirim, pl, hp_yuv_(ger, info.planBirim === 'adet' ? 1 : 10), ur, sap === '' ? '' : Math.round(sap * 100), deg]);
  });
  var d = ss.getSheetByName(HP.DOGRULUK) || hp_sekme_(ss, HP.DOGRULUK, []);
  hp_gecmisTemizle_(d, gTarih);
  if (out.length) d.getRange(d.getLastRow() + 1, 1, out.length, 9).setValues(out);
  return out;
}

/* ============================ ÇEKİRDEK ============================ */

function hp_context_() {
  var ss = hp_stokDosya_(), cikti = hp_cikti_();
  var ctx = { ym: {}, recete: {}, receteAdlari: [], alias: {}, eslesmeyen: {}, otomatik: {}, cozum: {} };

  // Yarı mamul çıktı tablosu
  var c = hp_tabloBul_(ss, ['yarimamuladi', 'ciktitipi', 'bazmiktar', 'porsiyonadet']);
  if (!c) throw new Error('Yarı mamul çıktı tablosu (YariMamul_Adi | Cikti_Tipi | Baz_Miktar | Porsiyon_adet) bulunamadı');
  c.rows.forEach(function (r) {
    var ad = String(r[c.i.yarimamuladi] || '').trim(); if (!ad) return;
    var cikti = hp_birim_(r[c.i.ciktitipi]), takip = hp_birim_(r[c.i.takiptipi] || r[c.i.ciktitipi]);
    var baz = hp_sayi_(r[c.i.bazmiktar]), pAdet = hp_sayi_(r[c.i.porsiyonadet]), pGram = hp_sayi_(r[c.i.porsiyongram]);
    var planBirim = takip.tip === 'adet' ? 'adet' : 'gr';
    var base = 0;
    if (planBirim === 'adet') base = cikti.tip === 'adet' ? baz : pAdet;
    else base = cikti.tip === 'adet' ? (pGram ? baz * pGram : 0) : baz * cikti.carpan;
    ctx.ym[hp_n_(ad)] = { ad: ad, kategori: c.i.kategori != null ? r[c.i.kategori] : '', planBirim: planBirim,
      base: base, pGram: pGram || (cikti.tip !== 'adet' && pAdet ? baz * cikti.carpan / pAdet : 0), children: [] };
  });
  var ymAdlari = Object.keys(ctx.ym);

  // Yarı mamul reçeteleri (iç içe YM için)
  var y = hp_tabloBul_(ss, ['yarimamuladi', 'hammadde', 'bazmiktar', 'birim'], ['ciktitipi']);
  if (y) y.rows.forEach(function (r) {
    var p = ctx.ym[hp_n_(r[y.i.yarimamuladi])], ch = hp_ymBul_(ctx, ymAdlari, r[y.i.hammadde]);
    if (p && ch && ch !== hp_n_(p.ad)) p.children.push({ ym: ch, miktar: hp_sayi_(r[y.i.bazmiktar]), birim: r[y.i.birim] });
  });

  // Ürün reçeteleri
  var t = hp_tabloBul_(ss, ['urunadi', 'hammadde', 'miktar', 'olcubirimi', 'uruntipi']);
  if (!t) throw new Error('Tbl_Receteler (Ürün_Adı | Hammadde | Miktar | Ölçü_Birimi | Ürün tipi) bulunamadı');
  t.rows.forEach(function (r) {
    var urun = String(r[t.i.urunadi] || '').trim(); if (!urun) return;
    var aktif = t.i.aktifurun != null ? String(r[t.i.aktifurun]).toLowerCase() : '';
    if (aktif === 'false' || aktif === 'pasif' || aktif === '✗') return;
    var key = hp_n_(urun);
    if (!ctx.recete[key]) { ctx.recete[key] = {}; ctx.receteAdlari.push(urun); }
    var ym = hp_ymBul_(ctx, ymAdlari, r[t.i.hammadde]);
    if (!ym) return;
    var q = hp_cevir_(ctx.ym[ym], hp_sayi_(r[t.i.miktar]), r[t.i.olcubirimi]);
    if (q == null) return;
    hp_yay_(ctx, ctx.recete[key], ym, q, 0);
  });

  // Eşleştirme sekmesi
  var e = cikti.getSheetByName(HP.ESLESME);
  if (e && e.getLastRow() > 1) e.getRange(2, 1, e.getLastRow() - 1, 3).getValues().forEach(function (r) {
    if (!r[0]) return;
    var durum = String(r[2] || '').toUpperCase();
    if (durum.indexOf('YOK') === 0) ctx.alias[hp_n_(r[0])] = '__YOK__';
    else if (r[1]) ctx.alias[hp_n_(r[0])] = hp_n_(r[1]);
  });
  return ctx;
}

/** YM ihtiyacını çocuk yarı mamullere (Pizza sosu içindeki sos vb.) yayar */
function hp_yay_(ctx, hedef, ym, q, derinlik) {
  hedef[ym] = (hedef[ym] || 0) + q;
  var info = ctx.ym[ym];
  if (derinlik >= 3 || !info.children.length || !info.base) return;
  var kat = q / info.base;
  info.children.forEach(function (c) {
    var cq = hp_cevir_(ctx.ym[c.ym], c.miktar, c.birim);
    if (cq != null) hp_yay_(ctx, hedef, c.ym, kat * cq, derinlik + 1);
  });
}

function hp_receteCoz_(ctx, satisAdi) {
  var n = hp_n_(satisAdi);
  if (ctx.cozum.hasOwnProperty(n)) return ctx.cozum[n];
  var sonuc = null;
  if (ctx.alias[n] === '__YOK__') sonuc = null;
  else if (ctx.alias[n] && ctx.recete[ctx.alias[n]]) sonuc = ctx.alias[n];
  else if (ctx.recete[n]) sonuc = n;
  else {
    var best = null, bs = 0;
    Object.keys(ctx.recete).forEach(function (k) { var s = hp_dice_(n, k); if (s > bs) { bs = s; best = k; } });
    if (best && bs >= HP.DICE_ESIK) { sonuc = best; ctx.otomatik[satisAdi] = { ad: hp_receteAdi_(ctx, best), s: bs }; }
    else ctx.eslesmeyen[satisAdi] = { oneri: best && bs >= 0.5 ? hp_receteAdi_(ctx, best) : '', s: bs };
  }
  ctx.cozum[n] = sonuc;
  return sonuc;
}

/** gunKeys için şube × YM gerçekleşen ihtiyaç */
function hp_talep_(ctx, gunKeys) {
  var ist = {}; gunKeys.forEach(function (k) { ist[k] = 1; });
  var v = hp_tekrar_(function () {
    var sh = SpreadsheetApp.openById(HP.SATIS_ID);
    var s = sh.getSheetByName(HP.SATIS_SEKME) || sh.getSheets()[0];
    return s.getDataRange().getValues();
  });
  var i = hp_basliklar_(v[0]);
  var cT = i['siparistarihi'], cU = i['urunler'], cA = i['urunadetleri'], cD = i['durum'], cC = i['uruncikansube'], cS = i['sube'];
  if (cT == null || cU == null || cA == null) throw new Error('Satış tablosunda Sipariş Tarihi / Ürünler / Ürün Adetleri sütunu bulunamadı');
  var out = { _siparis: {} };
  for (var r = 1; r < v.length; r++) {
    var row = v[r];
    if (cD != null && String(row[cD]).toUpperCase() !== 'KAPALI') continue;
    var d = row[cT] instanceof Date ? row[cT] : hp_tarihParse_(row[cT]);
    if (!d) continue;
    var key = hp_gunKey_(d);
    if (!ist[key]) continue;
    var sube = hp_subeCoz_(cC != null ? row[cC] : '', cS != null ? row[cS] : '');
    if (!sube) continue;
    out._siparis[key] = out._siparis[key] || {};
    out._siparis[key][sube] = (out._siparis[key][sube] || 0) + 1;
    var urunler = String(row[cU] || '').split('|'), adetler = String(row[cA] || '').split('|');
    for (var u = 0; u < urunler.length; u++) {
      var ad = urunler[u].trim(); if (!ad) continue;
      var adet = hp_sayi_(adetler[u]) || 1;
      var rk = hp_receteCoz_(ctx, ad); if (!rk) continue;
      var vec = ctx.recete[rk];
      out[key] = out[key] || {}; out[key][sube] = out[key][sube] || {};
      var hedef = out[key][sube];
      Object.keys(vec).forEach(function (ym) { hedef[ym] = (hedef[ym] || 0) + vec[ym] * adet; });
    }
  }
  return out;
}

/* ============================ ÇIKTILAR ============================ */

function hp_eslesmeYaz_(ss, ctx) {
  var e = ss.getSheetByName(HP.ESLESME) || hp_sekme_(ss, HP.ESLESME, []);
  var mevcut = {};
  if (e.getLastRow() > 1) e.getRange(2, 1, e.getLastRow() - 1, 1).getValues().forEach(function (r, i) { mevcut[hp_n_(r[0])] = i + 2; });
  var bugun = new Date(), yeni = [];
  function isle(ad, reAd, durum, s, oneri) {
    var n = hp_n_(ad);
    if (mevcut[n]) { e.getRange(mevcut[n], 6).setValue(bugun); return; }
    mevcut[n] = -1;
    yeni.push([ad, reAd, durum, s ? Math.round(s * 100) / 100 : '', oneri, bugun]);
  }
  Object.keys(ctx.otomatik).forEach(function (ad) { isle(ad, ctx.otomatik[ad].ad, 'OTOMATİK', ctx.otomatik[ad].s, ''); });
  Object.keys(ctx.eslesmeyen).forEach(function (ad) { isle(ad, '', 'EŞLEŞMEDİ', ctx.eslesmeyen[ad].s, ctx.eslesmeyen[ad].oneri); });
  if (yeni.length) e.getRange(e.getLastRow() + 1, 1, yeni.length, 6).setValues(yeni);
}

function hp_mail_(D, veri, ctx, takvim, dog) {
  var gun = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][new Date(D + 'T12:00:00Z').getUTCDay()];
  var h = '<div style="font-family:Arial,sans-serif;font-size:13px;color:#222">';
  h += '<h2 style="margin:0 0 4px">Mutfak Hazırlık Planı · ' + hp_gosterTarih_(D) + ' ' + gun + '</h2>';
  h += '<p style="margin:0 0 12px;color:#666">Üretim reçetenin standart partisinin katı olarak istenir (0,5 · 1 · 1,5 · 2…). Eldeki yarı mamul düşülmüştür; sabah sayım farklıysa plan dosyasında "Eldeki (mutfak düzeltir)" sütununa yazın.</p>';
  if (takvim._not) h += '<p style="background:#FFF3CD;padding:6px 8px">Takvim: ' + takvim._not + '</p>';
  HP.SUBELER.forEach(function (sube) {
    var liste = veri[sube] || [];
    var uret = liste.filter(function (r) { return r.uretKat > 0 || (r.net > 0 && !r.base); });
    var yok = liste.filter(function (r) { return !(r.uretKat > 0 || (r.net > 0 && !r.base)) && r.yarin > 0; });
    h += '<h3 style="margin:18px 0 6px">' + sube + ' · üretilecek (' + uret.length + ')</h3>';
    if (uret.length) {
      h += '<table cellpadding="5" style="border-collapse:collapse;font-size:13px"><tr style="background:#222;color:#fff"><th align="left">Yarı mamul</th><th align="right">Kat</th><th align="right">Miktar</th><th align="right">Yarın ihtiyaç</th><th align="right">Eldeki</th><th align="left">Not</th></tr>';
      var sonKat = null;
      uret.forEach(function (r) {
        if (r.kat !== sonKat) { h += '<tr><td colspan="6" style="background:#f2f2f2;font-weight:bold">' + (r.kat || 'Diğer') + '</td></tr>'; sonKat = r.kat; }
        h += '<tr style="border-bottom:1px solid #eee"><td>' + r.ym + '</td><td align="right"><b>' + (r.base ? String(r.uretKat).replace('.', ',') : '–') + '</b></td><td align="right">' +
          (r.base ? hp_fmt_(r.uretKat * r.base, r.birim) : hp_fmt_(r.net, r.birim)) + '</td><td align="right">' + hp_fmt_(r.yarin, r.birim) +
          '</td><td align="right">' + hp_fmt_(r.eldeki, r.birim) + '</td><td style="color:#a15c00">' + (r.not || '') + '</td></tr>';
      });
      h += '</table>';
    } else h += '<p>Üretim gerekmiyor.</p>';
    if (yok.length) h += '<p style="color:#555;margin:8px 0 0"><b>Üretim yok, eldeki yeter:</b> ' +
      yok.map(function (r) { return r.ym + ' (' + hp_fmt_(r.eldeki, r.birim) + ' / ihtiyaç ' + hp_fmt_(r.yarin, r.birim) + ')'; }).join(' · ') + '</p>';
  });
  var esl = Object.keys(ctx.eslesmeyen).length;
  if (esl) h += '<p style="color:#b00;margin-top:14px">' + esl + ' satış ürünü reçeteyle eşleşmedi → "' + HP.ESLESME + '" sekmesi.</p>';
  if (dog && dog.length) h += hp_dogrulukHtml_(dog);
  h += '</div>';
  MailApp.sendEmail({ to: HP.MAIL, subject: 'BAP Hazırlık Planı · ' + hp_gosterTarih_(D) + ' ' + gun, htmlBody: h });
}

/** Dünkü plan ↔ gerçek satış bölümü (hp_dogrulukKontrol satırlarından) */
function hp_dogrulukHtml_(dog) {
  var gTarih = dog[0][0];
  var p = gTarih.split('.');
  var gun = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][new Date(p[2] + '-' + p[1] + '-' + p[0] + 'T12:00:00Z').getUTCDay()];
  var h = '<h2 style="margin:28px 0 4px;border-top:2px solid #222;padding-top:12px">Dünkü plan ↔ gerçek satış · ' + gTarih + ' ' + gun + '</h2>';
  h += '<p style="margin:0 0 8px;color:#666">Plan = o gün için tahmin edilen ihtiyaç (%' + Math.round(HP.GUVENLIK * 100) +
    ' güvenlik payı dahil). Gerçek = o günün kapanan siparişlerinin reçeteye göre harcadığı yarı mamul. ' +
    'Sapma %5\'ten fazla eksikse "EKSİK", %35\'ten fazla fazlaysa "Fazla" sayılır. Tüm satırlar "' + HP.DOGRULUK + '" sekmesinde.</p>';
  var renk = { 'EKSİK planlandı': '#b00', 'Plan yok': '#b00', 'Fazla planlandı': '#a15c00', 'Satılmadı': '#a15c00' };
  var sira = { 'EKSİK planlandı': 0, 'Plan yok': 1, 'Fazla planlandı': 2, 'Satılmadı': 3 };
  HP.SUBELER.forEach(function (sube) {
    var say = { uygun: 0, eksik: 0, fazla: 0 }, liste = [];
    dog.forEach(function (r) {
      if (r[1] !== sube) return;
      var pl = hp_sayi_(r[4]) || 0, ger = hp_sayi_(r[5]) || 0;
      if (!pl && !ger) return;
      var deg = r[8] || (pl > 0 && !ger ? 'Satılmadı' : '');
      if (deg === 'Uygun') { say.uygun++; return; }
      if (deg === 'EKSİK planlandı' || deg === 'Plan yok') say.eksik++; else say.fazla++;
      liste.push({ ym: r[2], birim: r[3], pl: pl, ger: ger, ur: r[6], sap: r[7], deg: deg });
    });
    if (!say.uygun && !liste.length) return;
    h += '<h3 style="margin:14px 0 4px">' + sube + '</h3><p style="margin:0 0 6px">' +
      '<span style="color:#2e7d32"><b>' + say.uygun + '</b> uygun</span> · ' +
      '<span style="color:#b00"><b>' + say.eksik + '</b> eksik</span> · ' +
      '<span style="color:#a15c00"><b>' + say.fazla + '</b> fazla</span></p>';
    if (!liste.length) return;
    liste.sort(function (a, b) {
      return sira[a.deg] !== sira[b.deg] ? sira[a.deg] - sira[b.deg] : Math.abs(b.pl - b.ger) / (b.ger || b.pl || 1) - Math.abs(a.pl - a.ger) / (a.ger || a.pl || 1);
    });
    h += '<table cellpadding="5" style="border-collapse:collapse;font-size:13px"><tr style="background:#222;color:#fff"><th align="left">Yarı mamul</th><th align="right">Plan</th><th align="right">Gerçek</th><th align="right">Fark</th><th align="right">Üretilen</th><th align="left">Durum</th></tr>';
    liste.forEach(function (x) {
      var fark = x.pl - x.ger;
      h += '<tr style="border-bottom:1px solid #eee"><td>' + x.ym + '</td><td align="right">' + hp_fmt_(x.pl, x.birim) + '</td><td align="right">' + hp_fmt_(x.ger, x.birim) +
        '</td><td align="right" style="color:' + (fark < 0 ? '#b00' : '#a15c00') + '">' + (fark > 0 ? '+' : '−') + hp_fmt_(Math.abs(fark), x.birim) +
        (x.sap !== '' && x.sap != null ? ' (' + (x.sap > 0 ? '+' : '') + x.sap + '%)' : '') +
        '</td><td align="right">' + (x.ur !== '' && x.ur != null ? hp_fmt_(hp_sayi_(x.ur), x.birim) : '–') +
        '</td><td style="color:' + (renk[x.deg] || '#222') + '">' + x.deg + '</td></tr>';
    });
    h += '</table>';
  });
  return h;
}

function hp_takvim_(ss, key) {
  var out = { _not: '' };
  var t = ss.getSheetByName(HP.TAKVIM);
  if (!t || t.getLastRow() < 2) return out;
  var notlar = [];
  t.getRange(2, 1, t.getLastRow() - 1, 4).getValues().forEach(function (r) {
    var d = r[0] instanceof Date ? r[0] : hp_tarihParse_(r[0]);
    if (!d || Utilities.formatDate(d, HP.TZ, 'yyyy-MM-dd') !== key) return;
    var sube = hp_subeCoz_(r[1], '') || 'Tümü', c = hp_sayi_(r[2]) || 1;
    out[sube] = (out[sube] || 1) * c;
    notlar.push(r[3] + ' (' + sube + ' ×' + c + ')');
  });
  out._not = notlar.join(' · ');
  return out;
}

/* ============================ YARDIMCILAR ============================ */

function hp_sekme_(ss, ad, basliklar) {
  var sh = ss.getSheetByName(ad);
  if (!sh) {
    var ilk = ss.getSheets()[0];
    // yeni açılan dosyadaki boş "Sayfa1"i ilk sekme olarak yeniden kullan
    if (ss.getSheets().length === 1 && ilk.getLastRow() === 0 && /^(Sayfa1|Sheet1)$/.test(ilk.getName())) { sh = ilk; sh.setName(ad); }
    else sh = ss.insertSheet(ad);
  }
  if (basliklar.length && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, basliklar.length).setValues([basliklar]).setFontWeight('bold').setBackground('#222').setFontColor('#fff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function hp_gecmisTemizle_(sh, gTarih) {
  if (sh.getLastRow() < 2) return;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues();
  for (var i = v.length - 1; i >= 0; i--) if (v[i][0] === gTarih) sh.deleteRow(i + 2);
}

/** Stok dosyasında başlığa göre tablo arar (konum önbelleğe alınır); birden fazla varsa en çok satırlıyı seçer */
function hp_tabloBul_(ss, zorunlu, yasak) {
  var props = PropertiesService.getScriptProperties();
  var pKey = 'HP_TBL_' + zorunlu.join('_').slice(0, 80);
  function uygun(idx) {
    return zorunlu.every(function (z) { return idx[z] != null; }) && !(yasak && yasak.some(function (z) { return idx[z] != null; }));
  }
  function oku(sh, h) {
    return hp_tekrar_(function () {
      var lastRow = sh.getLastRow(), lastCol = Math.min(sh.getLastColumn(), 40);
      var ust = sh.getRange(h + 1, 1, 1, lastCol).getValues()[0];
      var idx = hp_basliklar_(ust);
      if (!uygun(idx) || lastRow <= h + 1) return null;
      return { sheet: sh, headerRow: h, i: idx, n: lastRow - h - 1,
        rows: sh.getRange(h + 2, 1, lastRow - h - 1, lastCol).getValues() };
    });
  }
  // 1) önbellekteki konum
  var cache = props.getProperty(pKey);
  if (cache) {
    var c = JSON.parse(cache), sh0 = ss.getSheetByName(c.ad);
    if (sh0) { var t0 = oku(sh0, c.h); if (t0) return t0; }
  }
  // 2) tarama: sadece ilk 3 satırın başlıkları, en fazla 40 sütun
  var enIyi = null;
  var sheets = hp_tekrar_(function () { return ss.getSheets(); });
  sheets.forEach(function (sh) {
    var meta = hp_tekrar_(function () {
      var lr = sh.getLastRow(), lc = Math.min(sh.getLastColumn(), 40);
      if (lr < 2 || lc < 1) return null;
      return { lr: lr, ust: sh.getRange(1, 1, Math.min(3, lr), lc).getValues() };
    });
    if (!meta) return;
    for (var h = 0; h < meta.ust.length; h++) {
      if (!uygun(hp_basliklar_(meta.ust[h]))) continue;
      var n = meta.lr - h - 1;
      if (!enIyi || n > enIyi.n) enIyi = { sh: sh, h: h, n: n };
      break;
    }
  });
  if (!enIyi) return null;
  props.setProperty(pKey, JSON.stringify({ ad: enIyi.sh.getName(), h: enIyi.h }));
  return oku(enIyi.sh, enIyi.h);
}

/** Plan sekmelerinin yazıldığı hafif dosya (Drive: Departmanlar / Operasyon Departmanı / Hazırlık Ajanı) */
function hp_cikti_() {
  if (hp_cikti_._ss) return hp_cikti_._ss;
  var props = PropertiesService.getScriptProperties();
  var id = HP.CIKTI_ID || props.getProperty('HP_CIKTI_ID');
  var ss = null;
  if (id) { try { ss = hp_tekrar_(function () { return SpreadsheetApp.openById(id); }); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(HP.CIKTI_AD);
    props.setProperty('HP_CIKTI_ID', ss.getId());
    Logger.log('Yeni plan dosyası açıldı: ' + ss.getUrl());
  }
  hp_klasoreTasi_(ss.getId());
  hp_cikti_._ss = ss;
  return ss;
}

/** HP.KLASOR yolunu (yoksa) oluşturur ve dosyayı oraya taşır; zaten oradaysa dokunmaz */
function hp_klasoreTasi_(dosyaId) {
  try {
    var klasor = DriveApp.getRootFolder();
    HP.KLASOR.forEach(function (ad) {
      var it = klasor.getFoldersByName(ad);
      klasor = it.hasNext() ? it.next() : klasor.createFolder(ad);
    });
    var dosya = DriveApp.getFileById(dosyaId);
    var ebeveyn = dosya.getParents();
    while (ebeveyn.hasNext()) if (ebeveyn.next().getId() === klasor.getId()) return klasor;
    dosya.moveTo(klasor);
    Logger.log('Dosya taşındı: ' + HP.KLASOR.join(' / '));
    return klasor;
  } catch (e) {
    Logger.log('Klasöre taşınamadı (dosya yerinde kaldı): ' + e);
    return null;
  }
}

function hp_stokDosya_() {
  if (!hp_stokDosya_._ss) hp_stokDosya_._ss = hp_tekrar_(function () { return SpreadsheetApp.openById(HP.STOK_ID); });
  return hp_stokDosya_._ss;
}

/** Google "timed out / service error" hatalarında 3 kez bekleyip yeniden dener */
function hp_tekrar_(fn) {
  var son;
  for (var d = 0; d < 3; d++) {
    try { return fn(); } catch (e) {
      son = e;
      if (!/timed out|zaman aşımı|Service|Hizmet|internal error|dahili hata/i.test(String(e))) throw e;
      Utilities.sleep(4000 * (d + 1));
    }
  }
  throw son;
}

function hp_basliklar_(row) {
  var m = {};
  row.forEach(function (h, i) { var k = hp_n_(h); if (k && m[k] == null) m[k] = i; });
  return m;
}

function hp_n_(s) {
  s = String(s == null ? '' : s).replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
  var tr = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
  s = s.replace(/[çğıöşüâîû]/g, function (c) { return tr[c]; });
  return s.replace(/[^a-z0-9]/g, '');
}

function hp_dice_(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  var m = {}, i, n = 0;
  for (i = 0; i < a.length - 1; i++) { var x = a.substr(i, 2); m[x] = (m[x] || 0) + 1; }
  for (i = 0; i < b.length - 1; i++) { var y = b.substr(i, 2); if (m[y] > 0) { m[y]--; n++; } }
  return 2 * n / (a.length + b.length - 2);
}

function hp_ymBul_(ctx, ymAdlari, ad) {
  var n = hp_n_(ad); if (!n) return null;
  if (ctx.ym[n]) return n;
  var best = null, bs = 0;
  ymAdlari.forEach(function (k) { var s = hp_dice_(n, k); if (s > bs) { bs = s; best = k; } });
  return bs >= 0.85 ? best : null;
}

function hp_receteAdi_(ctx, key) {
  for (var i = 0; i < ctx.receteAdlari.length; i++) if (hp_n_(ctx.receteAdlari[i]) === key) return ctx.receteAdlari[i];
  return key;
}

function hp_birim_(s) {
  var n = hp_n_(s);
  if (/^(kg|kilo|kilogram)$/.test(n)) return { tip: 'kutle', carpan: 1000 };
  if (/^(lt|l|litre)$/.test(n)) return { tip: 'kutle', carpan: 1000 };
  if (/^(adet|ad|porsiyon|pors|paket|dilim|tane)$/.test(n)) return { tip: 'adet', carpan: 1 };
  return { tip: 'kutle', carpan: 1 }; // gr, gram, g, ml, boş
}

/** reçete satırındaki miktarı YM'nin plan birimine çevirir */
function hp_cevir_(info, miktar, birim) {
  if (!info || !miktar) return null;
  var b = hp_birim_(birim);
  if (info.planBirim === 'adet') {
    if (b.tip === 'adet') return miktar;
    return info.pGram ? miktar * b.carpan / info.pGram : null;
  }
  if (b.tip === 'adet') return info.pGram ? miktar * info.pGram : null;
  return miktar * b.carpan;
}

function hp_subeCoz_(a, b) {
  var s = hp_n_(a) + ' ' + hp_n_(b);
  if (s.indexOf('erenkoy') >= 0) return 'Erenköy';
  if (s.indexOf('fikirtepe') >= 0) return 'Fikirtepe';
  if (s.indexOf('tumu') >= 0) return 'Tümü';
  return '';
}

function hp_sayi_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var s = String(v == null ? '' : v).trim().replace(/\s/g, '');
  if (!s || s.charAt(0) === '#') return 0;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function hp_tarihParse_(v) {
  if (v instanceof Date) return v;
  var m = String(v || '').match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  // İstanbul saati (UTC+3, yaz saati yok)
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], (+(m[4] || 12)) - 3, +(m[5] || 0)));
}

/** iş günü anahtarı (yyyy-MM-dd), GUN_BASLANGIC_SAAT öncesi önceki güne */
function hp_gunKey_(d) {
  return Utilities.formatDate(new Date(d.getTime() - HP.GUN_BASLANGIC_SAAT * 3600e3), HP.TZ, 'yyyy-MM-dd');
}
function hp_keyEkle_(key, gun) {
  var d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}
function hp_gosterTarih_(key) { var p = key.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
function hp_yuv_(x, adim) { return Math.round(x / adim) * adim; }
function hp_fmt_(x, birim) {
  if (birim === 'adet') return Math.round(x) + ' adet';
  return x >= 1000 ? (Math.round(x / 100) / 10).toString().replace('.', ',') + ' kg' : Math.round(x) + ' gr';
}