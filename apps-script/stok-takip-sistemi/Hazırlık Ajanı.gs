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
 * v1.5: SAPMA SEBEPLERİ. Dünkü her sapmaya otomatik sebep yazılır (genel yoğunluk / ürün tercihi /
 *       toplu sipariş / takvim çarpanı / düzensiz talep / az veri …); mutfak "Sebep (elle)" sütununa
 *       kendi sebebini yazabilir (yağmur, kampanya …), o öncelikli sayılır. Son 28 gün ürün bazında
 *       Hazirlik_Sapma_Ozet + Hazirlik_Sapma_Sebep sekmelerinde ve mailde özetlenir.
 *       İNCE TAHMİN: her şube × yarı mamul için (a) son günlerdeki sistematik sapmadan düzeltme çarpanı,
 *       (b) talebin oynaklığına göre ayrı güvenlik payı (%5–%25) hesaplanır → "Düzeltmeli Plan".
 *       HP.DUZELTME_UYGULA = false iken KURU: plan eski yöntemle çıkar, düzeltmeli plan yalnızca yan yana
 *       kaydedilir ve mailde "eski yöntem sapması ↔ düzeltmeli sapma" gösterilir. Düzeltmeli daha iyiyse true yapılır.
 *       Satış tablosu gecede bir kez okunur (doğruluk planın okumasını kullanır — D18).
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
  GUVENLIK: 0.10,           // %10 güvenlik payı (eski yöntem; düzeltmeli yöntemde az geçmişli ürünler için)
  DUZELTME_UYGULA: false,   // false = KURU: düzeltmeli plan yalnızca kaydedilir. true = plan düzeltmeli hesaplanır
  ANALIZ_GUN: 28,           // sapma analizi ve düzeltme çarpanı kaç günlük doğruluk kaydına bakar
  DUZ_MIN_GUN: 4,           // düzeltme çarpanı için en az kaç günlük kayıt
  DUZ_ALT: 0.70, DUZ_UST: 1.40, // düzeltme çarpanı sınırları
  PAY_CV: 0.5,              // ürün güvenlik payı = oynaklık × 0,5 (raf ömrü kısa olduğu için düşük tutuldu)
  PAY_ALT: 0.05, PAY_UST: 0.25,
  TOPLU_ESIK: 0.30,         // tek sipariş, günün ihtiyacının %30'unu aşarsa "Toplu sipariş"
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
  STOK: 'Hazirlik_Stok',
  OZET: 'Hazirlik_Sapma_Ozet',
  SEBEP: 'Hazirlik_Sapma_Sebep'
};

var HP_GECMIS_BASLIK = ['Tarih', 'Şube', 'Yarı Mamul', 'Birim', 'Plan (ihtiyaç)', 'Oluşturma', 'Eldeki', 'Üretilecek Kat',
  'Ham Tahmin', 'Düzeltmeli Plan', 'Düzeltme Çarpanı', 'Güvenlik Payı %', 'Oynaklık %', 'Geçmiş Hafta', 'Beklenen Sipariş', 'Takvim Çarpanı'];
var HP_DOGRULUK_BASLIK = ['Tarih', 'Şube', 'Yarı Mamul', 'Birim', 'Plan', 'Gerçek İhtiyaç', 'Üretilen (kayıt)', 'Sapma %', 'Değerlendirme',
  'Ham Tahmin', 'Düzeltmeli Plan', 'Beklenen Sipariş', 'Gerçek Sipariş', 'Toplu Sipariş Payı %', 'Sebep (otomatik)', 'Sebep (elle)'];

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
  hp_basliklarTamam_(hp_sekme_(ss, HP.GECMIS, HP_GECMIS_BASLIK), HP_GECMIS_BASLIK);
  hp_sekme_(ss, HP.ESLESME, ['Satış Adı', 'Reçete Adı', 'Durum (OTOMATİK / ELLE / YOK SAY / EŞLEŞMEDİ)', 'Benzerlik', 'Öneri', 'Son Görülme']);
  hp_sekme_(ss, HP.TAKVIM, ['Tarih (gg.aa.yyyy)', 'Şube (Tümü / Erenköy / Fikirtepe)', 'Çarpan (örn 1,3)', 'Sebep']);
  hp_basliklarTamam_(hp_sekme_(ss, HP.DOGRULUK, HP_DOGRULUK_BASLIK), HP_DOGRULUK_BASLIK);
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

/** Gecelik: satış tablosu bir kez okunur; dünkü doğruluk + sebepler o okumadan, ardından plan ve mail */
function hp_gunluk() {
  hp_planOlustur(null, false, true);
}

/** Elle: son 28 günün sapma özetini yeniden yazar (Hazirlik_Sapma_Ozet / _Sebep), satış tablosunu okumaz */
function hp_sapmaAnalizi() {
  var an = hp_sapmaAnaliz_(hp_cikti_());
  Logger.log('Sapma özeti yazıldı: ' + an.ozetSay + ' kalem · düzeltme önerisi olan: ' + Object.keys(an.duz).length);
}

/** Belirli bir tarih için elle deneme: hp_testTarih('18.09.2026') */
function hp_testTarih(tarihStr) {
  hp_planOlustur(tarihStr ? hp_tarihParse_(tarihStr) : null, true);
}

/* ============================ PLAN ============================ */

/** dogrulukla: true ise aynı satış okumasından dünkü doğruluk + sebepler yazılır ve maile eklenir */
function hp_planOlustur(hedef, mailYok, dogrulukla) {
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

  // Dünkü doğruluk aynı okumadan (dün = bugun − 1, stok penceresinin içinde); hata planı durdurmaz
  var dog = null;
  if (dogrulukla) {
    try { dog = hp_dogrulukKontrol(null, { talep: talep, ctx: ctx }); } catch (e) { Logger.log('Doğruluk hatası: ' + e); }
  }
  var an = { duz: {}, sube: {} };
  try { an = hp_sapmaAnaliz_(ss); } catch (e) { Logger.log('Sapma analizi hatası: ' + e); }

  var takvim = {};
  tahminGunleri.forEach(function (X) { takvim[X] = hp_takvim_(ss, X); });
  var tahmin = {};  // X → sube → ym → {ort, ham, plan, duzPlan, …}
  tahminGunleri.forEach(function (X) { tahmin[X] = hp_tahmin_(talep, X, takvim[X], an.duz); });

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
      var tY = (tahmin[D][sube] || {})[ym] || null;
      var yarin = tY ? tY.plan : 0;
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
      if (HP.DUZELTME_UYGULA && tY && Math.abs(tY.f - 1) >= 0.05)
        not.push('Düzeltme ×' + String(Math.round(tY.f * 100) / 100).replace('.', ',') + ' (son günlerde hep ' + (tY.f < 1 ? 'fazla' : 'eksik') + ' çıktı)');
      var yuv = info.planBirim === 'adet' ? 1 : 10;
      liste.push({ ym: info.ad, kat: info.kategori || '', birim: info.planBirim, yarin: yarin, rafIci: rafIci,
        eldeki: st.eldeki, net: net, base: info.base, uretKat: kat, not: not.join(' · '), t: tY,
        sip: (tahmin[D]._siparis || {})[sube] || 0, carpan: (takvim[D]['Tümü'] || 1) * (takvim[D][sube] || 1) });
      stokSatir.push([hp_gosterTarih_(D), sube, info.ad, info.planBirim, hp_yuv_(st.eldeki, yuv), st.partiler.length,
        st.partiler.length ? hp_gosterTarih_(st.partiler[0].t) : '', R, st.sayim || '', hp_yuv_(st.fire || 0, yuv), st.uyari || '']);
    });
    liste.sort(function (a, b) { return a.kat === b.kat ? b.yarin - a.yarin : (a.kat < b.kat ? -1 : 1); });
    mailVeri[sube] = liste;
    liste.forEach(function (r) {
      var yuv = r.birim === 'adet' ? 1 : 10;
      satirlar.push([hp_gosterTarih_(D), sube, r.kat, r.ym, r.birim, Math.ceil(r.yarin / yuv) * yuv, Math.ceil(r.rafIci / yuv) * yuv,
        hp_yuv_(r.eldeki, yuv), '', '', r.base || '', '', '', r.not]);
      var t = r.t || {};
      gecmis.push({ 'Tarih': hp_gosterTarih_(D), 'Şube': sube, 'Yarı Mamul': r.ym, 'Birim': r.birim,
        'Plan (ihtiyaç)': Math.ceil(r.yarin / yuv) * yuv, 'Oluşturma': new Date(), 'Eldeki': hp_yuv_(r.eldeki, yuv), 'Üretilecek Kat': r.uretKat,
        'Ham Tahmin': hp_yuv_(t.ham || 0, yuv), 'Düzeltmeli Plan': Math.ceil((t.duzPlan || 0) / yuv) * yuv,
        'Düzeltme Çarpanı': t.f != null ? Math.round(t.f * 100) / 100 : '', 'Güvenlik Payı %': t.pay != null ? Math.round(t.pay * 100) : '',
        'Oynaklık %': t.cv != null ? Math.round(t.cv * 100) : '', 'Geçmiş Hafta': t.hafta != null ? t.hafta : '',
        'Beklenen Sipariş': Math.round(r.sip), 'Takvim Çarpanı': r.carpan });
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
  if (gs && gecmis.length) { hp_gecmisTemizle_(gs, hp_gosterTarih_(D)); hp_satirEkle_(gs, hp_basliklarTamam_(gs, HP_GECMIS_BASLIK), gecmis); }
  var ss2 = hp_sekme_(ss, HP.STOK, []);
  if (ss2.getLastRow() > 1) ss2.getRange(2, 1, ss2.getLastRow() - 1, 11).clearContent();
  if (stokSatir.length) ss2.getRange(2, 1, stokSatir.length, 11).setValues(stokSatir);
  hp_eslesmeYaz_(ss, ctx);
  hp_rafDoldur_(ss, ctx);

  if (!mailYok) hp_mail_(D, mailVeri, ctx, takvim[D], dog, an);
  var uretSay = 0;
  Object.keys(mailVeri).forEach(function (sb) { mailVeri[sb].forEach(function (x) { if (x.uretKat > 0) uretSay++; }); });
  Logger.log('Plan ' + hp_gosterTarih_(D) + ': ' + satirlar.length + ' kalem, üretim istenen ' + uretSay + ' · eşleşmeyen ürün: ' + Object.keys(ctx.eslesmeyen).length);
  return mailVeri;
}

/**
 * X günü için şube × YM tahmini.
 *   ham     = ağırlıklı aynı gün ortalaması × takvim
 *   eski    = ham × (1 + %10)
 *   duzPlan = ham × düzeltme çarpanı (son günlerin sistematik sapması) × (1 + ürünün oynaklığına göre pay)
 *   plan    = HP.DUZELTME_UYGULA ? duzPlan : eski
 * out._siparis[sube] = beklenen sipariş sayısı (sapma sebebinde "genel yoğunluk" ayrımı için)
 */
function hp_tahmin_(talep, X, takvim, duz) {
  var out = { _siparis: {} };
  HP.SUBELER.forEach(function (sube) {
    var toplam = {}, kare = {}, hafta = {}, agirlik = 0, tavan = {}, sip = 0;
    for (var k = 1; k <= HP.HAFTA; k++) {
      var key = hp_keyEkle_(X, -7 * k), w = k <= HP.YAKIN_HAFTA ? 2 : 1;
      var sipK = (talep._siparis[key] || {})[sube];
      if (!sipK) continue; // kapalı / henüz yaşanmamış gün
      agirlik += w; sip += sipK * w;
      var m = (talep[key] || {})[sube] || {};
      Object.keys(m).forEach(function (ym) {
        toplam[ym] = (toplam[ym] || 0) + m[ym] * w;
        kare[ym] = (kare[ym] || 0) + m[ym] * m[ym] * w;
        if (m[ym] > 0) hafta[ym] = (hafta[ym] || 0) + 1;
        tavan[ym] = Math.max(tavan[ym] || 0, m[ym]);
      });
    }
    var carpan = (takvim['Tümü'] || 1) * (takvim[sube] || 1);
    out._siparis[sube] = agirlik ? sip / agirlik * carpan : 0;
    out[sube] = {};
    Object.keys(toplam).forEach(function (ym) {
      var ort = agirlik ? toplam[ym] / agirlik : 0;
      var vr = agirlik ? kare[ym] / agirlik - ort * ort : 0;  // satış olmayan haftalar 0 sayılır
      var cv = ort > 0 ? Math.sqrt(Math.max(0, vr)) / ort : 0;
      var n = hafta[ym] || 0, ham = ort * carpan;
      var f = ((duz || {})[sube + '|' + ym] || {}).f || 1;
      var pay = n >= 4 ? Math.min(HP.PAY_UST, Math.max(HP.PAY_ALT, cv * HP.PAY_CV)) : HP.GUVENLIK;
      var eski = ham * (1 + HP.GUVENLIK), duzPlan = ham * f * (1 + pay);
      out[sube][ym] = { ort: ort, ham: ham, plan: HP.DUZELTME_UYGULA ? duzPlan : eski, duzPlan: duzPlan,
        f: f, pay: pay, cv: cv, hafta: n, tavan: tavan[ym] || 0 };
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

/* ============================ DOĞRULUK + SAPMA SEBEPLERİ ============================ */

/**
 * Dünkü plan ↔ gerçek. Her satıra otomatik sebep yazar; aynı gün yeniden çalışırsa "Sebep (elle)" korunur.
 * hazir: { talep, ctx } verilirse satış tablosu yeniden okunmaz (gecelik çalışma).
 * Dönüş: satır nesneleri (mail için).
 */
function hp_dogrulukKontrol(tarih, hazir) {
  var ss = hp_cikti_();
  var dunKey = tarih ? hp_gunKey_(tarih) : hp_keyEkle_(hp_gunKey_(new Date()), -1);
  var ctx = hazir ? hazir.ctx : hp_context_();
  var talep = hazir ? hazir.talep : hp_talep_(ctx, [dunKey]);
  var gTarih = hp_gosterTarih_(dunKey);

  // o gecenin planı (Hazirlik_Plan_Gecmis) — başlık adıyla okunur
  var plan = {}, planSube = {};
  var g = hp_tabloOku_(ss.getSheetByName(HP.GECMIS));
  if (g) g.rows.forEach(function (r) {
    if (hp_hucreKey_(r[g.i.tarih]) !== dunKey) return;
    var sube = hp_subeCoz_(r[g.i.sube], ''); if (!sube) return;
    var al = function (ad) { return g.i[ad] != null ? r[g.i[ad]] : ''; };
    var pl = hp_sayi_(al('planihtiyac'));
    plan[sube + '|' + hp_n_(r[g.i.yarimamul])] = {
      pl: pl, ham: al('hamtahmin') === '' ? pl / (1 + HP.GUVENLIK) : hp_sayi_(al('hamtahmin')),
      duz: al('duzeltmeliplan') === '' ? '' : hp_sayi_(al('duzeltmeliplan')),
      sip: hp_sayi_(al('beklenensiparis')), takvim: hp_sayi_(al('takvimcarpani')) || 1,
      cv: al('oynaklik') === '' ? null : hp_sayi_(al('oynaklik')) / 100,
      hafta: al('gecmishafta') === '' ? null : hp_sayi_(al('gecmishafta'))
    };
    planSube[sube] = 1;
  });
  var uretim = (hp_uretimGunluk_(hp_stokDosya_(), ctx, [dunKey])[dunKey]) || {};

  var d = ss.getSheetByName(HP.DOGRULUK) || hp_sekme_(ss, HP.DOGRULUK, HP_DOGRULUK_BASLIK);
  var idx = hp_basliklarTamam_(d, HP_DOGRULUK_BASLIK);
  // aynı gün yeniden hesaplanıyorsa mutfağın / sahibin yazdığı sebebi koru
  var elle = {};
  var eski = hp_tabloOku_(d);
  if (eski && eski.i.sebepelle != null) eski.rows.forEach(function (r) {
    if (hp_hucreKey_(r[eski.i.tarih]) === dunKey && r[eski.i.sebepelle] !== '') elle[r[eski.i.sube] + '|' + hp_n_(r[eski.i.yarimamul])] = r[eski.i.sebepelle];
  });

  var anahtarlar = {};
  Object.keys(plan).forEach(function (k) { anahtarlar[k] = 1; });
  HP.SUBELER.forEach(function (s) {
    Object.keys(((talep[dunKey] || {})[s]) || {}).forEach(function (ym) { anahtarlar[s + '|' + ym] = 1; });
  });
  var out = [], yaz = [];
  Object.keys(anahtarlar).forEach(function (k) {
    var p = k.split('|'), sube = p[0], ym = p[1], info = ctx.ym[ym];
    if (!info) return;
    var P = plan[k] || null;
    var pl = P ? P.pl : 0, ger = (((talep[dunKey] || {})[sube]) || {})[ym] || 0, ur = uretim[k] || '';
    var sap = P && ger ? (pl - ger) / ger : '';
    var deg = !P ? 'Plan yok' : (sap === '' ? (pl > 0 ? 'Satılmadı' : '') : (sap < -0.05 ? 'EKSİK planlandı' : (sap > 0.35 ? 'Fazla planlandı' : 'Uygun')));
    var sipG = ((talep._siparis || {})[dunKey] || {})[sube] || 0;
    var tepe = ((((talep._tepe || {})[dunKey] || {})[sube]) || {})[ym] || 0;
    var toplu = ger ? tepe / ger : 0;
    var sebep = hp_sebep_({ deg: deg, pl: pl, ger: ger, P: P, sipG: sipG, toplu: toplu, planVar: !!planSube[sube] });
    var yuv = info.planBirim === 'adet' ? 1 : 10;
    var satir = { sube: sube, ym: info.ad, birim: info.planBirim, pl: pl, ger: hp_yuv_(ger, yuv), ur: ur,
      sap: sap === '' ? '' : Math.round(sap * 100), deg: deg, sebep: elle[k] || sebep };
    out.push(satir);
    yaz.push({ 'Tarih': gTarih, 'Şube': sube, 'Yarı Mamul': info.ad, 'Birim': info.planBirim, 'Plan': pl,
      'Gerçek İhtiyaç': satir.ger, 'Üretilen (kayıt)': ur, 'Sapma %': satir.sap, 'Değerlendirme': deg,
      'Ham Tahmin': P ? hp_yuv_(P.ham, yuv) : '', 'Düzeltmeli Plan': P && P.duz !== '' ? P.duz : '',
      'Beklenen Sipariş': P && P.sip ? P.sip : '', 'Gerçek Sipariş': sipG,
      'Toplu Sipariş Payı %': toplu ? Math.round(toplu * 100) : '', 'Sebep (otomatik)': sebep, 'Sebep (elle)': elle[k] || '' });
  });
  hp_gecmisTemizle_(d, gTarih);
  hp_satirEkle_(d, idx, yaz);
  out.tarih = gTarih;
  return out;
}

/**
 * Bir sapmanın en olası sebebi. Sıra önemlidir: önce veriyle kanıtlanabilenler (toplu sipariş, takvim,
 * genel yoğunluk), sonra ürünün kendi özelliği (düzensiz talep, az veri), en son "ürün tercihi değişti".
 * Metin "Etiket: ayrıntı" biçimindedir; özet etikete göre sayar.
 */
function hp_sebep_(o) {
  var P = o.P;
  if (o.deg === 'Uygun' || o.deg === '') return '';
  if (o.deg === 'Plan yok') return o.planVar ? 'Yeni / nadir ürün: aynı gün geçmiş haftalarda satışı yoktu, plana girmedi'
                                             : 'Plan oluşmadı: o gece ajan plan yazamadı';
  if (!o.ger) return P && P.hafta != null && P.hafta <= 3 ? 'Nadir ürün: son 8 haftanın ' + P.hafta + '\'inde satılmış'
                                                          : 'Hiç satılmadı: menüden kalkmış ya da satış adı eşleşmiyor olabilir';
  var fazlaGeldi = o.ger > o.pl; // talep plandan fazla
  if (o.toplu >= HP.TOPLU_ESIK) return 'Toplu sipariş: tek sipariş günün %' + Math.round(o.toplu * 100) + '\'i';
  if (P && Math.abs(P.takvim - 1) > 0.01 && (P.takvim > 1) !== fazlaGeldi)
    return 'Takvim çarpanı tutmadı: ×' + String(P.takvim).replace('.', ',') + ' girilmişti';
  var sOran = P && P.sip ? o.sipG / P.sip : 0, uOran = P && P.ham ? o.ger / P.ham : 0;
  function yuzde(x) { var v = Math.round((x - 1) * 100); return (v > 0 ? '+' : '') + v + '%'; }
  if (sOran && Math.abs(sOran - 1) >= 0.15 && (sOran > 1) === fazlaGeldi && Math.abs(uOran - sOran) < 0.2)
    return 'Genel yoğunluk: sipariş sayısı beklenenin ' + yuzde(sOran) + ' (' + o.sipG + ' / ' + Math.round(P.sip) + ')';
  if (P && P.cv != null && P.cv >= 0.5) return 'Düzensiz talep: bu üründe günden güne oynaklık %' + Math.round(P.cv * 100);
  if (P && P.hafta != null && P.hafta <= 3) return 'Az geçmiş veri: son 8 haftanın ' + P.hafta + '\'inde satılmış';
  if (sOran) return 'Ürün tercihi: sipariş sayısı ' + (Math.abs(sOran - 1) < 0.05 ? 'normal' : yuzde(sOran)) + ' iken bu ürün ' + yuzde(uOran);
  return 'Belirlenemedi: plan eski sürümle yazılmış (sipariş beklentisi yok)';
}

/**
 * Son HP.ANALIZ_GUN günün Hazirlik_Dogruluk satırlarından:
 *   - şube × yarı mamul özeti → Hazirlik_Sapma_Ozet (her gece baştan yazılır)
 *   - sebep dağılımı → Hazirlik_Sapma_Sebep
 *   - duz: 'sube|ym' → { f, n }  düzeltme çarpanı = gerçek / ham tahmin oranlarının ortancası,
 *     az kayıtta 1'e doğru çekilir ve [DUZ_ALT, DUZ_UST] ile sınırlanır. Toplu sipariş günleri hariç.
 * Satış tablosunu okumaz.
 */
function hp_sapmaAnaliz_(ss) {
  var sonuc = { duz: {}, sube: {}, ozetSay: 0 };
  var t = hp_tabloOku_(ss.getSheetByName(HP.DOGRULUK));
  if (!t) return sonuc;
  var bitis = hp_gunKey_(new Date()), bas = hp_keyEkle_(bitis, -HP.ANALIZ_GUN);
  var al = function (r, ad) { return t.i[ad] != null ? r[t.i[ad]] : ''; };
  var grup = {}, sebepSay = {};
  HP.SUBELER.forEach(function (s) { sebepSay[s] = {}; sonuc.sube[s] = { sapan: 0, toplam: 0, eskiHata: 0, yeniHata: 0, kiyasGer: 0, kiyasGun: 0 }; });

  t.rows.forEach(function (r) {
    var key = hp_hucreKey_(al(r, 'tarih'));
    if (!key || key < bas || key >= bitis) return;
    var sube = hp_subeCoz_(al(r, 'sube'), ''); if (!sonuc.sube[sube]) return;
    var ymAd = String(al(r, 'yarimamul')), k = sube + '|' + hp_n_(ymAd);
    var pl = hp_sayi_(al(r, 'plan')), ger = hp_sayi_(al(r, 'gercekihtiyac'));
    if (!pl && !ger) return;
    var deg = String(al(r, 'degerlendirme'));
    var sebep = String(al(r, 'sebepelle') || al(r, 'sebepotomatik') || '');
    var etiket = sebep ? (al(r, 'sebepelle') ? 'Elle: ' : '') + sebep.split(':')[0].trim() : (deg !== 'Uygun' ? 'Sebep kaydı yok (eski kayıt)' : '');
    var G = grup[k] = grup[k] || { sube: sube, ad: ymAd, birim: String(al(r, 'birim')), gun: 0, pl: 0, ger: 0, mutlak: 0,
      eksik: 0, fazla: 0, sebep: {}, oran: [], yeniMutlak: 0, eskiMutlakKiyas: 0, kiyasGer: 0 };
    G.gun++; G.pl += pl; G.ger += ger; G.mutlak += Math.abs(pl - ger);
    if (deg.indexOf('EKSİK') === 0 || deg === 'Plan yok') G.eksik++;
    else if (deg.indexOf('Fazla') === 0 || deg === 'Satılmadı') G.fazla++;
    var S = sonuc.sube[sube];
    S.toplam++;
    if (etiket) { G.sebep[etiket] = (G.sebep[etiket] || 0) + 1; sebepSay[sube][etiket] = (sebepSay[sube][etiket] || 0) + 1; S.sapan++; }
    // düzeltme çarpanı için oran (plan yoksa / toplu siparişse / ham yoksa alınmaz)
    var ham = al(r, 'hamtahmin') === '' ? (pl ? pl / (1 + HP.GUVENLIK) : 0) : hp_sayi_(al(r, 'hamtahmin'));
    if (deg !== 'Plan yok' && ham > 0 && sebep.indexOf('Toplu sipariş') !== 0) G.oran.push({ key: key, o: ger / ham });
    // eski ↔ düzeltmeli yöntem kıyası (yalnızca düzeltmeli planı kayıtlı günler)
    var duz = al(r, 'duzeltmeliplan');
    if (duz !== '' && deg !== 'Plan yok') {
      G.yeniMutlak += Math.abs(hp_sayi_(duz) - ger); G.eskiMutlakKiyas += Math.abs(pl - ger); G.kiyasGer += ger;
      S.yeniHata += Math.abs(hp_sayi_(duz) - ger) / (ger || 1); S.eskiHata += Math.abs(pl - ger) / (ger || 1); S.kiyasGun++;
    }
  });

  var ozet = [];
  Object.keys(grup).forEach(function (k) {
    var G = grup[k];
    var son = G.oran.sort(function (a, b) { return a.key < b.key ? 1 : -1; }).slice(0, 14).map(function (x) { return x.o; }).sort(function (a, b) { return a - b; });
    var n = son.length, f = 1, durum = 'Az kayıt (' + n + ' gün)';
    if (n >= HP.DUZ_MIN_GUN) {
      var med = n % 2 ? son[(n - 1) / 2] : (son[n / 2 - 1] + son[n / 2]) / 2;
      f = 1 + (med - 1) * n / (n + 4);
      f = Math.min(HP.DUZ_UST, Math.max(HP.DUZ_ALT, f));
      sonuc.duz[k] = { f: f, n: n };
      durum = Math.abs(f - 1) < 0.05 ? 'Tahmin dengeli' : (f < 1 ? 'Sürekli fazla tahmin' : 'Sürekli eksik tahmin');
    }
    var enSik = '', enSay = 0;
    Object.keys(G.sebep).forEach(function (s) { if (G.sebep[s] > enSay) { enSay = G.sebep[s]; enSik = s; } });
    var yuv = G.birim === 'adet' ? 1 : 10;
    G.bias = G.ger ? (G.pl - G.ger) / G.ger : null;
    G.wape = G.ger ? G.mutlak / G.ger : null;
    G.f = f; G.durum = durum; G.enSik = enSik ? enSik + ' (' + enSay + ' gün)' : '';
    ozet.push(G);
  });
  ozet.sort(function (a, b) {
    return a.sube === b.sube ? (b.wape || 0) * Math.min(b.gun, 7) - (a.wape || 0) * Math.min(a.gun, 7) : (a.sube < b.sube ? -1 : 1);
  });

  var oz = hp_sekme_(ss, HP.OZET, ['Şube', 'Yarı Mamul', 'Birim', 'Gün', 'Toplam Plan', 'Toplam Gerçek', 'Plan Sapması % (+ fazla / − eksik)',
    'Ortalama Mutlak Sapma %', 'Eksik Gün', 'Fazla Gün', 'En Sık Sebep', 'Önerilen Düzeltme Çarpanı', 'Durum', 'Düzeltmeli Yöntem Mutlak Sapma %']);
  if (oz.getLastRow() > 1) oz.getRange(2, 1, oz.getLastRow() - 1, 14).clearContent();
  var rows = ozet.map(function (G) {
    var yuv = G.birim === 'adet' ? 1 : 10;
    return [G.sube, G.ad, G.birim, G.gun, hp_yuv_(G.pl, yuv), hp_yuv_(G.ger, yuv),
      G.bias == null ? '' : Math.round(G.bias * 100), G.wape == null ? '' : Math.round(G.wape * 100), G.eksik, G.fazla, G.enSik,
      Math.round(G.f * 100) / 100, G.durum, G.kiyasGer ? Math.round(G.yeniMutlak / G.kiyasGer * 100) : ''];
  });
  if (rows.length) oz.getRange(2, 1, rows.length, 14).setValues(rows);

  var sb = hp_sekme_(ss, HP.SEBEP, ['Şube', 'Sebep', 'Sapan Ürün-Gün', 'Sapmaların %', 'En Çok Görülen Ürünler', 'Son ' + HP.ANALIZ_GUN + ' gün · hesap']);
  if (sb.getLastRow() > 1) sb.getRange(2, 1, sb.getLastRow() - 1, 6).clearContent();
  var srows = [];
  HP.SUBELER.forEach(function (s) {
    var top = 0; Object.keys(sebepSay[s]).forEach(function (e) { top += sebepSay[s][e]; });
    var liste = Object.keys(sebepSay[s]).sort(function (a, b) { return sebepSay[s][b] - sebepSay[s][a]; });
    sonuc.sube[s].sebepler = liste.map(function (e) { return { etiket: e, say: sebepSay[s][e], pay: top ? sebepSay[s][e] / top : 0 }; });
    sonuc.sube[s].urunler = ozet.filter(function (G) { return G.sube === s; });
    liste.forEach(function (e) {
      var urun = ozet.filter(function (G) { return G.sube === s && G.sebep[e]; })
        .sort(function (a, b) { return b.sebep[e] - a.sebep[e]; }).slice(0, 4)
        .map(function (G) { return G.ad + ' (' + G.sebep[e] + ')'; }).join(', ');
      srows.push([s, e, sebepSay[s][e], top ? Math.round(sebepSay[s][e] / top * 100) : '', urun, hp_gosterTarih_(bitis)]);
    });
  });
  if (srows.length) sb.getRange(2, 1, srows.length, 6).setValues(srows);
  sonuc.ozetSay = rows.length;
  return sonuc;
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
  var out = { _siparis: {}, _tepe: {} }; // _tepe: gün → şube → ym → tek siparişin en büyük payı
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
    var bu = {};
    for (var u = 0; u < urunler.length; u++) {
      var ad = urunler[u].trim(); if (!ad) continue;
      var adet = hp_sayi_(adetler[u]) || 1;
      var rk = hp_receteCoz_(ctx, ad); if (!rk) continue;
      var vec = ctx.recete[rk];
      out[key] = out[key] || {}; out[key][sube] = out[key][sube] || {};
      var hedef = out[key][sube];
      Object.keys(vec).forEach(function (ym) { hedef[ym] = (hedef[ym] || 0) + vec[ym] * adet; bu[ym] = (bu[ym] || 0) + vec[ym] * adet; });
    }
    var tp = out._tepe[key] = out._tepe[key] || {};
    tp = tp[sube] = tp[sube] || {};
    Object.keys(bu).forEach(function (ym) { if (bu[ym] > (tp[ym] || 0)) tp[ym] = bu[ym]; });
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

function hp_mail_(D, veri, ctx, takvim, dog, an) {
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
  h += hp_sapmaHtml_(an);
  h += '</div>';
  MailApp.sendEmail({ to: HP.MAIL, subject: 'BAP Hazırlık Planı · ' + hp_gosterTarih_(D) + ' ' + gun, htmlBody: h });
}

/** Dünkü plan ↔ gerçek satış bölümü (hp_dogrulukKontrol satırlarından) */
function hp_dogrulukHtml_(dog) {
  var gTarih = dog.tarih;
  var p = gTarih.split('.');
  var gun = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][new Date(p[2] + '-' + p[1] + '-' + p[0] + 'T12:00:00Z').getUTCDay()];
  var h = '<h2 style="margin:28px 0 4px;border-top:2px solid #222;padding-top:12px">Dünkü plan ↔ gerçek satış · ' + gTarih + ' ' + gun + '</h2>';
  h += '<p style="margin:0 0 8px;color:#666">Plan = o gün için tahmin edilen ihtiyaç (güvenlik payı dahil). Gerçek = o günün kapanan siparişlerinin reçeteye göre harcadığı yarı mamul. ' +
    'Sapma %5\'ten fazla eksikse "EKSİK", %35\'ten fazla fazlaysa "Fazla" sayılır. Gri yazı ajanın bulduğu sebeptir; ' +
    'yanlışsa ya da gerçek sebebi biliyorsanız (yağmur, kampanya, ürün bitti…) "' + HP.DOGRULUK + '" sekmesinde "Sebep (elle)" sütununa yazın.</p>';
  var renk = { 'EKSİK planlandı': '#b00', 'Plan yok': '#b00', 'Fazla planlandı': '#a15c00', 'Satılmadı': '#a15c00' };
  var sira = { 'EKSİK planlandı': 0, 'Plan yok': 1, 'Fazla planlandı': 2, 'Satılmadı': 3 };
  HP.SUBELER.forEach(function (sube) {
    var say = { uygun: 0, eksik: 0, fazla: 0 }, liste = [];
    dog.forEach(function (x) {
      if (x.sube !== sube || (!x.pl && !x.ger) || !x.deg) return;
      if (x.deg === 'Uygun') { say.uygun++; return; }
      if (x.deg === 'EKSİK planlandı' || x.deg === 'Plan yok') say.eksik++; else say.fazla++;
      liste.push(x);
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
    h += '<table cellpadding="5" style="border-collapse:collapse;font-size:13px"><tr style="background:#222;color:#fff"><th align="left">Yarı mamul</th><th align="right">Plan</th><th align="right">Gerçek</th><th align="right">Fark</th><th align="right">Üretilen</th><th align="left">Durum · sebep</th></tr>';
    liste.forEach(function (x) {
      var fark = x.pl - x.ger;
      h += '<tr style="border-bottom:1px solid #eee"><td>' + x.ym + '</td><td align="right">' + hp_fmt_(x.pl, x.birim) + '</td><td align="right">' + hp_fmt_(x.ger, x.birim) +
        '</td><td align="right" style="color:' + (fark < 0 ? '#b00' : '#a15c00') + '">' + (fark > 0 ? '+' : '−') + hp_fmt_(Math.abs(fark), x.birim) +
        (x.sap !== '' && x.sap != null ? ' (' + (x.sap > 0 ? '+' : '') + x.sap + '%)' : '') +
        '</td><td align="right">' + (x.ur !== '' && x.ur != null ? hp_fmt_(hp_sayi_(x.ur), x.birim) : '–') +
        '</td><td style="color:' + (renk[x.deg] || '#222') + '">' + x.deg +
        (x.sebep ? '<br><span style="color:#666;font-size:12px">' + x.sebep + '</span>' : '') + '</td></tr>';
    });
    h += '</table>';
  });
  return h;
}

/** Son 28 günün sapma özeti: sebep dağılımı, en çok sapan ürünler, eski ↔ düzeltmeli yöntem */
function hp_sapmaHtml_(an) {
  if (!an || !an.sube) return '';
  var h = '<h2 style="margin:28px 0 4px;border-top:2px solid #222;padding-top:12px">Son ' + HP.ANALIZ_GUN + ' gün · neden sapıyoruz?</h2>';
  h += '<p style="margin:0 0 8px;color:#666">Ayrıntı: "' + HP.OZET + '" (ürün bazında) ve "' + HP.SEBEP + '" (sebep bazında) sekmeleri. ' +
    '<b>Genel yoğunluk</b> = o gün sipariş sayısı beklenenden çok farklıydı (hava, maç, tatil → "' + HP.TAKVIM + '" sekmesine önceden çarpan girilebilir). ' +
    '<b>Ürün tercihi</b> = sipariş sayısı normaldi ama müşteriler bu ürünü daha az/çok seçti.</p>';
  var bosMu = true;
  HP.SUBELER.forEach(function (sube) {
    var S = an.sube[sube]; if (!S || !S.toplam) return;
    bosMu = false;
    var eski = 0;
    var seb = (S.sebepler || []).filter(function (x) { if (x.etiket.indexOf('Sebep kaydı yok') === 0) { eski = x.say; return false; } return true; });
    h += '<h3 style="margin:14px 0 4px">' + sube + '</h3>';
    if (seb.length) h += '<p style="margin:0 0 6px"><b>Sebepler:</b> ' + seb.slice(0, 6).map(function (x) { return x.etiket + ' <b>' + x.say + '</b>'; }).join(' · ') +
      (eski ? ' <span style="color:#999">(+' + eski + ' eski kayıt, sebepsiz)</span>' : '') + '</p>';
    else if (eski) h += '<p style="margin:0 0 6px;color:#999">Sebepler bu sürümden itibaren birikiyor (' + eski + ' eski sapma sebepsiz).</p>';
    var top = (S.urunler || []).filter(function (G) { return G.gun >= HP.DUZ_MIN_GUN && G.wape != null && G.wape >= 0.2; }).slice(0, 6);
    if (top.length) {
      h += '<table cellpadding="5" style="border-collapse:collapse;font-size:13px"><tr style="background:#222;color:#fff"><th align="left">En çok sapan</th><th align="right">Gün</th><th align="right">Plan ort.</th><th align="left">En sık sebep</th><th align="right">Öneri</th></tr>';
      top.forEach(function (G) {
        var b = Math.round((G.bias || 0) * 100);
        h += '<tr style="border-bottom:1px solid #eee"><td>' + G.ad + '</td><td align="right">' + G.gun + '</td><td align="right" style="color:' + (b < 0 ? '#b00' : '#a15c00') + '">' +
          (b > 0 ? '%' + b + ' fazla' : '%' + (-b) + ' eksik') + '</td><td style="font-size:12px">' + (G.enSik || '–') + '</td><td align="right">' +
          (Math.abs(G.f - 1) >= 0.05 ? '×' + String(Math.round(G.f * 100) / 100).replace('.', ',') : '–') + '</td></tr>';
      });
      h += '</table>';
    }
    if (S.kiyasGun >= 7) {
      var e = Math.round(S.eskiHata / S.kiyasGun * 100), y = Math.round(S.yeniHata / S.kiyasGun * 100);
      h += '<p style="margin:6px 0 0">Ortalama sapma — şu anki yöntem: <b>%' + e + '</b> · düzeltmeli yöntem: <b>%' + y + '</b> (' + S.kiyasGun + ' ürün-gün)' +
        (HP.DUZELTME_UYGULA ? '' : (y < e ? ' → <span style="color:#2e7d32">düzeltmeli daha iyi</span>' : ' → henüz fark yok')) + '</p>';
    }
  });
  if (bosMu) return '';
  if (!HP.DUZELTME_UYGULA) h += '<p style="color:#666;margin-top:10px">Düzeltmeli tahmin şu an <b>KURU</b>: plan eski yöntemle hesaplanıyor, yeni yöntem yalnızca yan yana kaydediliyor.</p>';
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

/** Başlıkta olmayan sütunları sona ekler; hp_n_(başlık) → 0 tabanlı sütun döndürür (_n = toplam sütun) */
function hp_basliklarTamam_(sh, basliklar) {
  var lc = sh.getLastColumn();
  var mevcut = lc ? sh.getRange(1, 1, 1, lc).getValues()[0] : [];
  while (mevcut.length && mevcut[mevcut.length - 1] === '') mevcut.pop();
  var idx = hp_basliklar_(mevcut);
  var eksik = basliklar.filter(function (b) { return idx[hp_n_(b)] == null; });
  if (eksik.length) {
    sh.getRange(1, mevcut.length + 1, 1, eksik.length).setValues([eksik]).setFontWeight('bold').setBackground('#222').setFontColor('#fff');
    eksik.forEach(function (b, i) { idx[hp_n_(b)] = mevcut.length + i; });
  }
  idx._n = mevcut.length + eksik.length;
  return idx;
}

/** Nesne satırlarını ({'Başlık': değer}) başlık adına göre sona ekler */
function hp_satirEkle_(sh, idx, nesneler) {
  if (!nesneler.length) return;
  var rows = nesneler.map(function (o) {
    var r = []; for (var i = 0; i < idx._n; i++) r.push('');
    Object.keys(o).forEach(function (k) { var c = idx[hp_n_(k)]; if (c != null) r[c] = o[k]; });
    return r;
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, idx._n).setValues(rows);
}

/** Çıktı dosyasındaki bir sekmeyi başlık adlarıyla okur: { i: hp_n_(başlık) → sütun, rows } */
function hp_tabloOku_(sh) {
  if (!sh || sh.getLastRow() < 2) return null;
  var v = sh.getDataRange().getValues();
  return { i: hp_basliklar_(v[0]), rows: v.slice(1) };
}

/** Tarih hücresi (Date ya da "gg.aa.yyyy") → yyyy-MM-dd */
function hp_hucreKey_(v) {
  var d = v instanceof Date ? v : hp_tarihParse_(v);
  return d ? Utilities.formatDate(d, HP.TZ, 'yyyy-MM-dd') : '';
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