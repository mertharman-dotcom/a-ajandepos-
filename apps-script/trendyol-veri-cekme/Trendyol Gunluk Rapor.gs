/*** BAP – TRENDYOL GÜNLÜK PUAN RAPORU + İADE TAKİBİ ***
 *
 * Trendyol değerlendirme projesine EK dosya. TY (Trendyol.gs) ve TYP, gunNo_, gunTar_,
 * kisa_, resmiPuanKaydet_ (Puanlama Takip.gs) buradan kullanılır.
 *
 * Trendyol'a hiçbir şey YAZMAZ, sadece okur. Kendi sekmelerine yazar.
 * İade kabul/ret burada YOK — sadece bildirim ve öneri (karar sahipte).
 *
 * Fonksiyonlar:
 *   gunlukPuanRaporu()      – Puan_Siparis (gün × mağaza: TY puanı, değişim, sipariş adedi)
 *                             + Puan_Tahmin (yarın puan tahmini). Her gece ~23:50
 *   iadeleriCek()           – Iadeler sekmesi; yeni iade gelince bildirim. 10 dk'da bir
 *   sabahOzeti()            – puan, değişim, yarın tahmini, dünkü sipariş, bekleyen iade. Her sabah ~10:45
 *   raporTetikleyiciKur()   – üç tetikleyiciyi kurar (yalnızca kendi tetikleyicilerini siler)
 *
 * Yarın tahmini: Trendyol puanı son 90 günün ortalaması. Yarın 90 günü dolan yorumlar hesaptan
 * çıkar. "Yeni yorum gelmezse yarın puan X" hesaplanır. Örnek: 101 yorum ort. 4,7 ve düşen
 * 1 yıldız → (474,7 − 1) / 100 = 4,737. Hesabın Trendyol'la uyuşup uyuşmadığı Puan_Siparis'teki
 * "Fark (TY−Hesap)" ve "Dünkü Tahmin" sütunlarından izlenir.
 */

const TYR = {
  PUAN_SIPARIS: 'Puan_Siparis',
  TAHMIN: 'Puan_Tahmin',
  IADE: 'Iadeler',
  IADE_OZET: 'Iade_Ozet',
  IADE_OZET_AY: 6,         // Iade_Ozet kaç ayı gösterir
  RAPOR_GUN: 120,          // Puan_Siparis kaç günü gösterir
  SATIS_SATIR: 40000,      // ana tablonun son kaç satırı okunur
  IADE_GUN: 14,            // iade çekme penceresi
  IADE_SURE_SAAT: 4,       // Trendyol'un iade için tanıdığı karar süresi
  GEC_ESIK_DK: 45,         // "geç teslim" iadesinde bu süreyi aşmayan teslim gecikmesiz sayılır
  KURYE_TABLO: '1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo',   // Kurye Net Çalışma Süresi
  KURYE_KESINTI: 'Kesintiler',     // bordronun okuduğu kesinti sekmesi (sahibi orası)
  KESINTI_KURU: true,      // true: Kesintiler'e YAZMAZ, sadece "ne yazılacak" raporlar. Sahip onaylayınca false
  KESINTI_BENZER_GUN: 3,   // aynı kurye + aynı tutar bu kadar gün içinde varsa yazmaz, sorar
  SATIS_BASLIK: {          // ana tabloda başlık adları (sütun numarasıyla okunmaz)
    TARIH: 'Sipariş Tarihi', CIKIS: 'Hazırlanma (Şube Çıkış)', TESLIM: 'Teslim Zamanı',
    KANAL: 'Sipariş Kanalı', MARKA: 'Marka', TEL: 'Müşteri Telefon', MAHALLE: 'Mahalle',
    TUTAR: 'Toplam Tutar', KURYE: 'Kurye', DURUM: 'Durum', ID: 'Sipariş ID', URUN: 'Ürünler'
  }
};

const TYR_IADE_BASLIK = ['Claim Item ID', 'Claim ID', 'Oluşma', 'Son Karar Saati', 'Mağaza',
  'Sipariş No', 'Durum', 'Sebep', 'Müşteri Notu', 'Tutar', 'İade Şekli', 'Tür', 'Fotoğraf',
  'Adisyo Sipariş ID', 'Ürünler', 'Kurye', 'Mahalle', 'Sipariş→Teslim (dk)', 'Ön Değerlendirme',
  'Kapanış Nedeni', 'Kapanış Tarihi', 'Bildirildi', 'Kuryeden Düş', 'Düşülecek TL', 'Kesinti Durumu',
  'Sorumlu'];

/* iade sebebine göre varsayılan sorumlu; Iadeler'de Sorumlu sütunundan elle değiştirilebilir */
const TYR_SORUMLULAR = ['Kurye', 'Mutfak', 'Müşteri/Platform', 'Belirsiz'];
const TYR_SORUMLU = {
  4005: 'Kurye', 4004: 'Kurye', 4013: 'Kurye', 4006: 'Kurye', 4016: 'Kurye', 4003: 'Kurye', 4020: 'Kurye',
  4002: 'Mutfak', 4007: 'Mutfak', 4008: 'Mutfak', 4014: 'Mutfak', 4021: 'Mutfak', 4022: 'Mutfak',
  4000: 'Mutfak', 4001: 'Mutfak',
  4009: 'Müşteri/Platform', 4011: 'Müşteri/Platform', 4012: 'Müşteri/Platform', 4015: 'Müşteri/Platform'
};

const TYR_SEBEP = {
  4000: 'SKT - Geçmiş Ürün', 4001: 'SKT - Yaklaşmış Ürün', 4002: 'Düşük Kaliteli Ürün',
  4003: 'Hasarlı / Yolda Zarar Görmüş', 4004: 'Yanlış ürün', 4005: 'Eksik ürün',
  4006: 'Geç teslim edilmiş', 4007: 'Zehirlenme-Yaralanma', 4008: 'Yabancı Cisim',
  4009: 'Pin Hatası / Müşteri Kaynaklı', 4011: 'Teslim alınmamış (Model 2)', 4012: 'Fiş gelmedi',
  4013: 'Siparişler karıştı', 4014: 'Nota dikkat edilmemiş', 4015: 'Fiş ile tutar farklı',
  4016: 'Teslim alınmamış (Model 1)', 4020: 'Soğuk geldi', 4021: 'Porsiyon boyutu',
  4022: 'Teslimatta fark edilen yanlış/düşük kalite', 451: 'Diğer'
};

/* ============================================================
 * 1) GÜNLÜK PUAN RAPORU
 * ============================================================ */
function gunlukPuanRaporu() {
  resmiPuanKaydet_();                     // bugünün Trendyol puanı (günde bir kez yazar)
  const ss = SpreadsheetApp.getActive();
  const markalar = TY.MAGAZALAR.map(m => m.marka);
  const bugun = gunNo_(new Date());
  const bas = bugun - TYR.RAPOR_GUN + 1;

  const kova = tyrYorumKovasi_();
  const resmi = tyrResmiPuanlar_();
  const satis = tyrSatisOku_();
  const tahminler = tyrTahminKayitlari_();

  const satirlar = [];
  for (let g = bas; g <= bugun; g++) {
    markalar.forEach(marka => {
      const ty = resmi[g + '|' + marka];
      const tyDun = resmi[(g - 1) + '|' + marka];
      const h = tyrPencere_(kova[marka], g);
      const hesap = h.n ? h.t / h.n : '';
      const gun = kova[marka][g] || { t: 0, a: 0 };
      const adet = satis.adet[g + '|' + marka] || 0;
      // aynı haftanın günü, önceki 4 hafta ortalaması
      let top = 0, say = 0;
      for (let k = 1; k <= 4; k++) {
        const x = satis.adet[(g - 7 * k) + '|' + marka];
        if (x !== undefined) { top += x; say++; }
      }
      const normal = say ? top / say : '';
      satirlar.push([
        gunTar_(g), kisa_(marka),
        ty !== undefined ? ty : '',
        (ty !== undefined && tyDun !== undefined && ty !== '' && tyDun !== '') ? ty - tyDun : '',
        hesap,
        (ty !== undefined && ty !== '' && hesap !== '') ? ty - hesap : '',
        tahminler[g + '|' + marka] !== undefined ? tahminler[g + '|' + marka] : '',
        gun.a, gun.a ? gun.t / gun.a : '',
        adet, normal,
        (normal !== '' && normal > 0) ? (adet - normal) / normal : ''
      ]);
    });
  }

  const baslik = ['Tarih', 'Mağaza', 'TY Puanı', 'Değişim', 'Hesap 90g', 'Fark (TY−Hesap)',
    'Dünkü Tahmin', 'O Gün Yorum', 'O Gün Ort.', 'TY Sipariş', 'Normal (4 hafta aynı gün)', 'Sapma'];
  let sh = ss.getSheetByName(TYR.PUAN_SIPARIS);
  if (!sh) sh = ss.insertSheet(TYR.PUAN_SIPARIS);
  sh.clear();
  sh.getRange(1, 1, 1, baslik.length).setValues([baslik]).setFontWeight('bold').setBackground('#f1f3f4');
  if (satirlar.length) {
    satirlar.reverse();                   // en yeni gün en üstte
    const n = satirlar.length;
    sh.getRange(2, 1, n, baslik.length).setValues(satirlar);
    sh.getRange(2, 1, n, 1).setNumberFormat('dd.MM.yyyy');
    sh.getRange(2, 3, n, 1).setNumberFormat('0.00');
    sh.getRange(2, 4, n, 1).setNumberFormat('+0.000;-0.000;0');
    sh.getRange(2, 5, n, 3).setNumberFormat('0.000');
    sh.getRange(2, 9, n, 1).setNumberFormat('0.00');
    sh.getRange(2, 11, n, 1).setNumberFormat('0.0');
    sh.getRange(2, 12, n, 1).setNumberFormat('+0%;-0%;0%');
    const kurallar = [
      SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0)
        .setFontColor('#188038').setRanges([sh.getRange(2, 4, n, 1), sh.getRange(2, 12, n, 1)]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0)
        .setFontColor('#c5221f').setRanges([sh.getRange(2, 4, n, 1), sh.getRange(2, 12, n, 1)]).build()
    ];
    sh.setConditionalFormatRules(kurallar);
  }
  sh.setFrozenRows(1);

  tyrTahminKaydet_(kova, bugun);
  try { iadeOzetiYenile(); } catch (e) { Logger.log('İade özeti hatası: ' + e); }
  Logger.log(TYR.PUAN_SIPARIS + ': ' + satirlar.length + ' satır');
}

/* marka -> gün -> {t, a} (Degerlendirmeler sekmesinden; Puan_Gunluk ile aynı kural) */
function tyrYorumKovasi_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TY.REVIEW_SHEET);
  const kova = {};
  TY.MAGAZALAR.forEach(m => kova[m.marka] = {});
  if (!sh || sh.getLastRow() < 2) return kova;
  const b = tyrBasliklar_(sh);
  const iT = b('Değerlendirme Tarihi'), iM = b('Mağaza'), iP = b('Ortalama');
  sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(r => {
    const t = r[iT], marka = r[iM], puan = Number(r[iP]);
    if (!(t instanceof Date) || !kova[marka] || !puan) return;
    const g = gunNo_(t);
    const c = kova[marka][g] || (kova[marka][g] = { t: 0, a: 0 });
    c.t += puan; c.a++;
  });
  return kova;
}

/* g gününde geçerli 90 günlük pencere: g-89 .. g */
function tyrPencere_(k, g) {
  let t = 0, n = 0;
  for (let d = g - TYP.PENCERE + 1; d <= g; d++) { const c = k[d]; if (c) { t += c.t; n += c.a; } }
  return { t: t, n: n };
}

/* "gün|marka" -> Trendyol'un gösterdiği genel puan (Puan_Resmi) */
function tyrResmiPuanlar_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TYP.RESMI);
  const h = {};
  if (!sh || sh.getLastRow() < 2) return h;
  const b = tyrBasliklar_(sh);
  const iT = b('Tarih'), iM = b('Mağaza'), iG = b('Genel');
  sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(r => {
    if (r[iT] instanceof Date && r[iG] !== '') h[gunNo_(r[iT]) + '|' + r[iM]] = Number(r[iG]);
  });
  return h;
}

/* ============================================================
 * 2) YARIN TAHMİNİ
 * ============================================================ */
/* her mağaza için: bugünkü hesap, yarın düşecek yorumlar, yeni yorum gelmezse yarın puan,
   bir sonraki 0,1 basamağına çıkmak için gereken 5 yıldız adedi */
function tyrTahmin_(kova, bugun) {
  return TY.MAGAZALAR.map(m => {
    const k = kova[m.marka];
    const simdi = tyrPencere_(k, bugun);
    const dusen = k[bugun - TYP.PENCERE + 1] || { t: 0, a: 0 };
    const n = simdi.n - dusen.a, t = simdi.t - dusen.t;
    const yarin = n ? t / n : '';
    let hedef = '', gereken = '';
    if (yarin !== '') {
      hedef = Math.min(5, Math.round(Math.floor(yarin * 10 + 1e-9) + 1) / 10);
      if (hedef < 5) gereken = Math.max(0, Math.ceil((hedef * n - t) / (5 - hedef) - 1e-9));
    }
    return {
      marka: m.marka, bugun: simdi.n ? simdi.t / simdi.n : '', adet: simdi.n,
      dusenAdet: dusen.a, dusenOrt: dusen.a ? dusen.t / dusen.a : '',
      yarin: yarin, hedef: hedef, gereken: gereken
    };
  });
}

/* Puan_Tahmin: her gün yarın için yapılan tahmini saklar (sonradan gerçekle karşılaştırılır) */
function tyrTahminKaydet_(kova, bugun) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(TYR.TAHMIN);
  if (!sh) {
    sh = ss.insertSheet(TYR.TAHMIN);
    sh.appendRow(['Hedef Tarih', 'Mağaza', 'Bugün (hesap)', 'Yorum Adedi', 'Düşecek Yorum',
      'Düşecek Ort.', 'Yarın Tahmini', 'Sonraki Basamak', 'Gereken 5★', 'Kayıt Zamanı']);
    sh.setFrozenRows(1);
  }
  const yarin = bugun + 1, var_ = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
      if (r[0] instanceof Date) var_[gunNo_(r[0]) + '|' + r[1]] = true;
    });
  }
  const yeni = tyrTahmin_(kova, bugun)
    .filter(x => !var_[yarin + '|' + x.marka])
    .map(x => [gunTar_(yarin), x.marka, x.bugun, x.adet, x.dusenAdet, x.dusenOrt,
               x.yarin, x.hedef, x.gereken, new Date()]);
  if (!yeni.length) return;
  sh.getRange(sh.getLastRow() + 1, 1, yeni.length, yeni[0].length).setValues(yeni);
  sh.getRange(2, 1, sh.getLastRow() - 1, 1).setNumberFormat('dd.MM.yyyy');
  sh.getRange(2, 3, sh.getLastRow() - 1, 1).setNumberFormat('0.000');
  sh.getRange(2, 6, sh.getLastRow() - 1, 3).setNumberFormat('0.000');
}

/* "gün|marka" -> o gün için önceden yapılmış tahmin */
function tyrTahminKayitlari_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TYR.TAHMIN);
  const h = {};
  if (!sh || sh.getLastRow() < 2) return h;
  const b = tyrBasliklar_(sh);
  const iT = b('Hedef Tarih'), iM = b('Mağaza'), iY = b('Yarın Tahmini');
  sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(r => {
    if (r[iT] instanceof Date && r[iY] !== '') h[gunNo_(r[iT]) + '|' + r[iM]] = Number(r[iY]);
  });
  return h;
}

/* ============================================================
 * 3) ANA SATIŞ TABLOSU (sadece okur, başlık adıyla)
 * ============================================================ */
/* adet: "gün|marka" -> iptal hariç Trendyol sipariş adedi
   siparis: platform sipariş no -> sipariş bilgisi (iade eşleştirmesi için) */
function tyrSatisOku_() {
  const sh = SpreadsheetApp.openById(TY.ANA_TABLO).getSheetByName(TY.ANA_SEKME);
  if (!sh) throw new Error('Ana sekme bulunamadı: ' + TY.ANA_SEKME);
  const B = TYR.SATIS_BASLIK, b = tyrBasliklar_(sh);
  const i = {};
  Object.keys(B).forEach(k => i[k] = b(B[k]));
  const son = sh.getLastRow();
  const bas = Math.max(2, son - TYR.SATIS_SATIR);
  const genislik = Math.max.apply(null, Object.keys(i).map(k => i[k])) + 1;
  const adet = {}, siparis = {};
  if (son < 2) return { adet: adet, siparis: siparis };
  sh.getRange(bas, 1, son - bas + 1, genislik).getValues().forEach(r => {
    if (String(r[i.KANAL]).trim() !== 'Trendyol') return;
    if (String(r[i.DURUM]).trim().toUpperCase() === 'İPTAL') return;
    const t = tyrTarih_(r[i.TARIH]);
    if (t) {
      const anahtar = gunNo_(t) + '|' + String(r[i.MARKA]).trim();
      adet[anahtar] = (adet[anahtar] || 0) + 1;
    }
    const tel = String(r[i.TEL] || ''), k = tel.indexOf('/');
    if (k >= 0 && tel.slice(k + 1).trim()) {
      const teslim = tyrTarih_(r[i.TESLIM]);
      siparis[tel.slice(k + 1).trim()] = {
        id: r[i.ID], marka: r[i.MARKA], kurye: r[i.KURYE], mahalle: r[i.MAHALLE],
        tutar: r[i.TUTAR], urun: r[i.URUN],
        dk: (t && teslim && teslim > t) ? Math.round((teslim - t) / 60000) : ''
      };
    }
  });
  return { adet: adet, siparis: siparis };
}

/* ============================================================
 * 4) İADELER (sadece okur + bildirir)
 * ============================================================ */
function iadeleriCek() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(TYR.IADE);
  if (!sh) {
    sh = ss.insertSheet(TYR.IADE);
    sh.getRange(1, 1, 1, TYR_IADE_BASLIK.length).setValues([TYR_IADE_BASLIK])
      .setFontWeight('bold').setBackground('#f1f3f4');
    sh.setFrozenRows(1);
    sh.getRange('A:B').setNumberFormat('@');
    sh.getRange('F:F').setNumberFormat('@');
  }
  tyrEksikBasliklariEkle_(sh, TYR_IADE_BASLIK);
  const b = tyrBasliklar_(sh);
  const iId = b('Claim Item ID'), iDurum = b('Durum'), iKN = b('Kapanış Nedeni'),
        iKT = b('Kapanış Tarihi');

  const mevcut = {};               // claim item id -> { satir, durum }  (satir 0 = bu çalışmada eklendi)
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
      .forEach((r, k) => { if (r[iId]) mevcut[r[iId]] = { satir: k + 2, durum: r[iDurum] }; });
  }

  const magaza = {};
  TY.MAGAZALAR.forEach(m => magaza[m.store] = m.marka);
  const saticilar = {};
  TY.MAGAZALAR.forEach(m => saticilar[m.supplier] = m.token);

  const bitis = Date.now(), baslangic = bitis - TYR.IADE_GUN * 86400000;
  let satis = null;
  const yeni = [], bildirilecek = [];

  Object.keys(saticilar).forEach(supplier => {
    let sayfa = 0, toplamSayfa = 1;
    while (sayfa < toplamSayfa && sayfa < 20) {
      const url = 'https://api.tgoapis.com/integrator/claim/meal/suppliers/' + supplier +
        '/claims?page=' + sayfa + '&size=50&createdStartDate=' + baslangic + '&createdEndDate=' + bitis;
      const res = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: { 'Authorization': 'Basic ' + saticilar[supplier],
                   'User-Agent': supplier + ' - SelfIntegration', 'Accept': 'application/json' },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() !== 200) {
        Logger.log('İade ' + supplier + ' HATA ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
        tyErisimHatasi_('İade (' + supplier + ')', res.getResponseCode(), res.getContentText());
        break;
      }
      const j = JSON.parse(res.getContentText());
      toplamSayfa = j.totalPages || 0;
      (j.content || []).forEach(c => {
        (c.claimItems || []).forEach(it => {
          const kapanis = it.completionClaimItemReason ? it.completionClaimItemReason.reasonText || '' : '';
          const kapTarih = it.completionDate ? new Date(it.completionDate) : '';
          const eski = mevcut[it.id];
          if (eski) {                      // var olan kayıt: durum değiştiyse durum ve kapanış güncellenir
            if (eski.satir && eski.durum !== (it.status || '')) {
              sh.getRange(eski.satir, iDurum + 1).setValue(it.status || '');
              sh.getRange(eski.satir, iKN + 1).setValue(kapanis);
              sh.getRange(eski.satir, iKT + 1).setValue(kapTarih);
            }
            return;
          }
          if (!satis) satis = tyrSatisOku_().siparis;
          const s = satis[String(c.orderNumber || '')] || satis[String(c.orderId || '')] || {};
          const sebepId = it.customerClaimItemReason ? it.customerClaimItemReason.id : '';
          const sebep = (it.customerClaimItemReason && it.customerClaimItemReason.name) ||
                        TYR_SEBEP[sebepId] || '';
          const foto = (it.imageUrls || []).join('\n');
          const bekliyor = it.status === 'WaitingInAction';
          const kayit = [
            it.id, c.id, new Date(c.createdDate),
            new Date(c.createdDate + TYR.IADE_SURE_SAAT * 3600000),
            magaza[c.storeId] || String(c.storeId || ''), String(c.orderNumber || ''),
            it.status || '', sebep, it.note || '', it.price || '', c.sellerRefundType || '',
            c.type || '', foto, s.id || '', s.urun || '', s.kurye || '', s.mahalle || '', s.dk,
            tyrIadeOneri_(sebepId, s, foto), kapanis, kapTarih, bekliyor ? new Date() : '',
            false, '', '', tyrSorumluBul_(sebepId, sebep)
          ];
          mevcut[it.id] = { satir: 0, durum: it.status || '' };
          yeni.push(kayit);
          if (bekliyor) bildirilecek.push(kayit);
        });
      });
      sayfa++;
      Utilities.sleep(300);
    }
  });

  if (yeni.length) {
    sh.getRange(sh.getLastRow() + 1, 1, yeni.length, TYR_IADE_BASLIK.length).setValues(yeni);
    sh.getRange(2, 3, sh.getLastRow() - 1, 2).setNumberFormat('dd.MM.yyyy HH:mm');
    sh.getRange(2, iKT + 1, sh.getLastRow() - 1, 1).setNumberFormat('dd.MM.yyyy HH:mm');
    sh.getRange(2, 1, sh.getLastRow() - 1, TYR_IADE_BASLIK.length).sort({ column: 3, ascending: false });
  }
  if (sh.getLastRow() > 1) {
    const n = sh.getLastRow() - 1;
    sh.getRange(2, b('Kuryeden Düş') + 1, n, 1).insertCheckboxes();
    // eski satırlarda boş Sorumlu'yu sebepten doldur; açılır liste koy
    const iS = b('Sorumlu'), iSeb = b('Sebep');
    const rs = sh.getRange(2, 1, n, sh.getLastColumn()).getValues();
    const sor = rs.map(r => [String(r[iS]).trim() || tyrSorumluBul_('', r[iSeb])]);
    sh.getRange(2, iS + 1, n, 1).setValues(sor).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(TYR_SORUMLULAR, true).build());
  }
  if (bildirilecek.length) tyrIadeBildir_(bildirilecek);
  iadeKesintileriIsle();
  Logger.log('İade: ' + yeni.length + ' yeni kalem, ' + bildirilecek.length + ' bildirim');
  return yeni.length;
}

/* ============================================================
 * 4b) İADEYİ KURYEDEN DÜŞ
 * Iadeler sekmesinde "Kuryeden Düş" kutusu işaretli ve "Kesinti Durumu" boş olan satırlar
 * Kurye tablosundaki Kesintiler sekmesine TL kesintisi olarak yazılır (bordro oradan okur).
 *   Kurye      = satırdaki Kurye (yanlışsa önce düzelt)
 *   Tutar      = "Düşülecek TL" doluysa o, boşsa iade tutarı
 *   Tarih      = işaretlendiği gün (açık haftanın bordrosuna girsin diye); sipariş bilgisi açıklamada
 * Aynı kurye + aynı tutar son birkaç günde zaten varsa (elle girilmiş olabilir) yazmaz, sorar.
 * KESINTI_KURU = true iken hiçbir şey yazmaz, Kesinti Durumu'na "KURU: ..." yazar.
 * iadeleriCek her çalıştığında (10 dk) bunu da çağırır; elle de çalıştırılabilir.
 * ============================================================ */
function iadeKesintileriIsle() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TYR.IADE);
  if (!sh || sh.getLastRow() < 2) return 0;
  tyrEksikBasliklariEkle_(sh, TYR_IADE_BASLIK);
  const b = tyrBasliklar_(sh);
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const iDus = b('Kuryeden Düş'), iDurumK = b('Kesinti Durumu');
  const isler = v.map((r, k) => ({ r: r, satir: k + 2 }))
    .filter(x => {
      const d = String(x.r[iDurumK]).trim();      // boş, KURU, BEKLİYOR ya da ZORLA olanlar yeniden denenir
      return x.r[iDus] === true && (!d || /^(KURU|BEKLİYOR)/.test(d) || d.toUpperCase() === 'ZORLA');
    });
  if (!isler.length) return 0;

  const ks = SpreadsheetApp.openById(TYR.KURYE_TABLO).getSheetByName(TYR.KURYE_KESINTI);
  if (!ks) throw new Error('Kurye tablosunda sekme yok: ' + TYR.KURYE_KESINTI);
  const kb = tyrBasliklar_(ks);
  const kT = kb('Tarih'), kK = kb('Kurye Adı'), kTip = kb('Kesinti Tipi (Saat / TL)'),
        kDk = kb('Kesilen Süre (Dk)'), kTl = kb('Kesilen Tutar (TL)'), kAc = kb('Açıklama');
  const mevcut = ks.getLastRow() > 1
    ? ks.getRange(2, 1, ks.getLastRow() - 1, ks.getLastColumn()).getValues() : [];

  const bugun = new Date();
  const kisaAd = x => String(x || '').trim().toLocaleLowerCase('tr');
  let yazilan = 0;
  isler.forEach(x => {
    const r = x.r;
    const kurye = String(r[b('Kurye')] || '').trim();
    const tl = Number(String(r[b('Düşülecek TL')]).replace(',', '.')) || Number(r[b('Tutar')]) || 0;
    const etiket = '[TY iade ' + String(r[b('Claim Item ID')]).slice(0, 8) + ']';
    let durum;
    if (!kurye) durum = 'BEKLİYOR: Kurye boş — Kurye sütununa adını yaz';
    else if (!(tl > 0)) durum = 'BEKLİYOR: tutar yok — Düşülecek TL yaz';
    else if (mevcut.some(m => String(m[kAc]).indexOf(etiket) >= 0)) {
      durum = 'ZATEN YAZILMIŞ ' + etiket;
    } else {
      const benzer = mevcut.find(m => {
        const t = tyrTarih_(m[kT]);
        return t && kisaAd(m[kK]) === kisaAd(kurye) && Number(m[kTl]) === tl &&
               Math.abs(bugun - t) <= TYR.KESINTI_BENZER_GUN * 86400000;
      });
      const zorla = String(r[iDurumK]).trim().toUpperCase() === 'ZORLA';
      if (benzer && !zorla) {
        durum = 'SORU: ' + kurye + ' için ' + tl + ' TL zaten var (' +
          Utilities.formatDate(tyrTarih_(benzer[kT]), 'Europe/Istanbul', 'dd.MM') + ', "' +
          String(benzer[kAc]).slice(0, 40) + '"). Yine de düşülecekse bu hücreyi silip yalnızca ZORLA yaz.';
      } else {
        const aciklama = 'Trendyol iade — ' + r[b('Mağaza')] + ' — sipariş ' + r[b('Sipariş No')] +
          ' (' + Utilities.formatDate(r[b('Oluşma')] instanceof Date ? r[b('Oluşma')] : bugun,
                                      'Europe/Istanbul', 'dd.MM HH:mm') + ') — ' +
          r[b('Sebep')] + (r[b('Müşteri Notu')] ? ': ' + r[b('Müşteri Notu')] : '') + ' ' + etiket;
        if (TYR.KESINTI_KURU) {
          durum = 'KURU: ' + kurye + "'dan " + tl + ' TL düşülecek (henüz yazılmadı)';
        } else {
          const satir = new Array(ks.getLastColumn()).fill('');
          satir[kT] = bugun; satir[kK] = kurye; satir[kTip] = 'TL'; satir[kDk] = '';
          satir[kTl] = tl; satir[kAc] = aciklama;
          ks.appendRow(satir);
          mevcut.push(satir);
          durum = 'YAZILDI ' + Utilities.formatDate(bugun, 'Europe/Istanbul', 'dd.MM HH:mm') +
                  ' — ' + kurye + ' ' + tl + ' TL';
          yazilan++;
        }
      }
    }
    sh.getRange(x.satir, iDurumK + 1).setValue(durum);
  });
  Logger.log('Kuryeden düş: ' + isler.length + ' satır, ' + yazilan + ' yazıldı' +
             (TYR.KESINTI_KURU ? ' (KURU)' : ''));
  return yazilan;
}

/* sekmede olmayan başlıkları sona ekler (eski sekmeye yeni sütun) */
function tyrEksikBasliklariEkle_(sh, liste) {
  const var_ = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(x => String(x).trim());
  const eksik = liste.filter(x => var_.indexOf(x) < 0);
  if (!eksik.length) return;
  sh.getRange(1, sh.getLastColumn() + 1, 1, eksik.length).setValues([eksik])
    .setFontWeight('bold').setBackground('#f1f3f4');
}

/* sebep kodu (yoksa sebep adı) → varsayılan sorumlu */
function tyrSorumluBul_(sebepId, sebepAdi) {
  if (TYR_SORUMLU[Number(sebepId)]) return TYR_SORUMLU[Number(sebepId)];
  const ad = String(sebepAdi || '').trim();
  const id = Object.keys(TYR_SEBEP).find(k => TYR_SEBEP[k].toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'));
  return (id && TYR_SORUMLU[Number(id)]) || 'Belirsiz';
}

/* ============================================================
 * 4c) İADE ÖZETİ — ay × sorumlu × mağaza; mutfak zararı; kurye bazında
 * Kaynak yalnızca Iadeler sekmesi (kopya tutulmaz, her seferinde baştan üretilir).
 * Zarar = kabul edilen iade tutarı (Trendyol'un bizden kestiği). Reddedilen / bekleyen sayılmaz,
 * bekleyenler ayrıca gösterilir.
 * ============================================================ */
function iadeOzetiYenile() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(TYR.IADE);
  if (!sh || sh.getLastRow() < 2) return;
  tyrEksikBasliklariEkle_(sh, TYR_IADE_BASLIK);
  const b = tyrBasliklar_(sh);
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const simdi = new Date();
  const ayAnahtar = d => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  const aylar = [];
  for (let k = TYR.IADE_OZET_AY - 1; k >= 0; k--) aylar.push(ayAnahtar(new Date(simdi.getFullYear(), simdi.getMonth() - k, 1)));
  const kabul = d => d === 'Accepted' || d === 'WaitingForSellerRefund';
  const bekliyor = d => d === 'WaitingInAction' || d === 'Unresolved';

  const ay = {}, mutfakUrun = {}, kurye = {};
  v.forEach(r => {
    const t = r[b('Oluşma')];
    if (!(t instanceof Date)) return;
    const a = ayAnahtar(t);
    if (aylar.indexOf(a) < 0) return;
    const durum = String(r[b('Durum')]);
    const sor = String(r[b('Sorumlu')] || 'Belirsiz');
    const tl = Number(r[b('Tutar')]) || 0;
    const k = a + '|' + sor;
    const o = ay[k] || (ay[k] = { adet: 0, tl: 0, bekAdet: 0, bekTl: 0 });
    if (kabul(durum)) { o.adet++; o.tl += tl; }
    else if (bekliyor(durum)) { o.bekAdet++; o.bekTl += tl; }
    if (!kabul(durum)) return;
    if (sor === 'Mutfak' && a === aylar[aylar.length - 1]) {
      const anahtar = r[b('Mağaza')] + '|' + r[b('Sebep')];
      const m = mutfakUrun[anahtar] || (mutfakUrun[anahtar] = { adet: 0, tl: 0, ornek: [] });
      m.adet++; m.tl += tl;
      if (m.ornek.length < 3) m.ornek.push(String(r[b('Ürünler')] || '').slice(0, 60));
    }
    if (sor === 'Kurye' && a === aylar[aylar.length - 1]) {
      const ad = String(r[b('Kurye')] || '—');
      const q = kurye[ad] || (kurye[ad] = { adet: 0, tl: 0, dusulen: 0 });
      q.adet++; q.tl += tl;
      if (/^YAZILDI/.test(String(r[b('Kesinti Durumu')]))) {
        q.dusulen += Number(String(r[b('Düşülecek TL')]).replace(',', '.')) || tl;
      }
    }
  });

  let oz = ss.getSheetByName(TYR.IADE_OZET);
  if (!oz) oz = ss.insertSheet(TYR.IADE_OZET);
  oz.clear();
  let satir = 1;
  const blok = (baslik, kolonlar, veri, not) => {
    oz.getRange(satir, 1).setValue(baslik).setFontWeight('bold').setFontSize(12);
    if (not) oz.getRange(satir + 1, 1).setValue(not).setFontColor('#666666');
    satir += not ? 2 : 1;
    oz.getRange(satir, 1, 1, kolonlar.length).setValues([kolonlar]).setFontWeight('bold').setBackground('#f1f3f4');
    if (veri.length) oz.getRange(satir + 1, 1, veri.length, kolonlar.length).setValues(veri);
    else oz.getRange(satir + 1, 1).setValue('Kayıt yok');
    const bas = satir + 1;
    satir += Math.max(veri.length, 1) + 2;
    return bas;
  };

  const ayVeri = aylar.slice().reverse().map(a => {
    const g = s => ay[a + '|' + s] || { adet: 0, tl: 0, bekAdet: 0, bekTl: 0 };
    const satirlar = [a];
    TYR_SORUMLULAR.forEach(s => satirlar.push(g(s).tl));
    const top = TYR_SORUMLULAR.reduce((x, s) => x + g(s).tl, 0);
    const adet = TYR_SORUMLULAR.reduce((x, s) => x + g(s).adet, 0);
    const bek = TYR_SORUMLULAR.reduce((x, s) => x + g(s).bekTl, 0);
    return satirlar.concat([top, adet, bek]);
  });
  const b1 = blok('Aylık iade zararı (TL) — sorumluya göre',
    ['Ay'].concat(TYR_SORUMLULAR, ['Toplam TL', 'Kabul Adedi', 'Bekleyen TL']), ayVeri,
    'Kabul edilen iadeler. Sorumlu, Iadeler sekmesindeki Sorumlu sütunundan (sebepten önerilir, elle düzeltilebilir).');
  oz.getRange(b1, 2, ayVeri.length, TYR_SORUMLULAR.length + 1).setNumberFormat('#,##0 "TL"');
  oz.getRange(b1, TYR_SORUMLULAR.length + 4, ayVeri.length, 1).setNumberFormat('#,##0 "TL"');

  const mVeri = Object.keys(mutfakUrun).map(k => {
    const p = k.split('|'), m = mutfakUrun[k];
    return [p[0], p[1], m.adet, m.tl, m.ornek.join(' / ')];
  }).sort((x, y) => y[3] - x[3]);
  const b2 = blok('Bu ay mutfak kaynaklı iadeler — mağaza × sebep',
    ['Mağaza', 'Sebep', 'Adet', 'TL', 'Örnek siparişler'], mVeri);
  if (mVeri.length) oz.getRange(b2, 4, mVeri.length, 1).setNumberFormat('#,##0 "TL"');

  const kVeri = Object.keys(kurye).map(ad => [ad, kurye[ad].adet, kurye[ad].tl, kurye[ad].dusulen,
    kurye[ad].tl - kurye[ad].dusulen]).sort((x, y) => y[2] - x[2]);
  const b3 = blok('Bu ay kurye kaynaklı iadeler',
    ['Kurye', 'Adet', 'İade TL', 'Kuryeden Düşülen', 'Düşülmemiş'], kVeri,
    'Düşülen = Iadeler\'de "Kesinti Durumu" YAZILDI olanlar. Elle düşülenler burada görünmez.');
  if (kVeri.length) oz.getRange(b3, 3, kVeri.length, 3).setNumberFormat('#,##0 "TL"');

  oz.getRange(satir, 1).setValue('Güncelleme: ' +
    Utilities.formatDate(simdi, 'Europe/Istanbul', 'dd.MM.yyyy HH:mm')).setFontColor('#666666');
  oz.setColumnWidth(1, 200); oz.setColumnWidth(2, 200); oz.setColumnWidth(5, 360);
}

/* kural tabanlı ön değerlendirme — yalnızca öneri, karar sahipte */
function tyrIadeOneri_(sebepId, s, foto) {
  const dk = s.dk, kurye = s.kurye ? ' (kurye: ' + s.kurye + ')' : '';
  const sure = dk !== '' && dk !== undefined ? 'Sipariş→Adisyo kapanış ' + dk + ' dk' + kurye + '. ' : '';
  if (!s.id) return 'Adisyo\'da sipariş bulunamadı — panelden bak.';
  switch (Number(sebepId)) {
    case 4007: case 4008:
      return 'CİDDİ: müşteriyi hemen ara, ürünün fotoğrafını iste. Sağlık iddiası — kabul etmeden önce görüş.';
    case 4006:
      if (dk === '' || dk === undefined) return 'Teslim saati yok — kuryeye sor.';
      return dk <= TYR.GEC_ESIK_DK
        ? sure + 'Gecikme görünmüyor → ret düşünülebilir (5004 Satıcı kaynaklı gecikme yok).'
        : sure + 'Gerçekten geç → kabul mantıklı.';
    case 4016:
      return sure + 'Adisyo\'da kapanmış. Kuryeye teyit et; teslim ettiyse ret (5005 Ürünler teslim edildi).';
    case 4004: case 4005: case 4013: case 4014:
      return foto ? 'Fotoğrafı fişle karşılaştır, mutfağa sor.'
                  : 'Fotoğraf yok → ret düşünülebilir (5006 Görseller/bilgiler yetersiz); önce mutfağa sor.';
    case 4020: case 4003:
      return sure + (dk !== '' && dk > TYR.GEC_ESIK_DK ? 'Uzun yol → kabul mantıklı.' : 'Süre normal; fotoğrafa bak.');
    case 4009:
      return 'Müşteri kaynaklı görünüyor → ret düşünülebilir.';
    default:
      return sure + 'İncele.';
  }
}

function tyrIadeBildir_(liste) {
  const saat = d => Utilities.formatDate(d, 'Europe/Istanbul', 'HH:mm');
  const govde = liste.map(r =>
    '• ' + r[4] + ' — ' + r[7] + ' — ' + r[9] + ' TL' +
    '\n   Son karar: ' + saat(r[3]) + ' | Sipariş ' + r[5] +
    (r[8] ? '\n   Müşteri: "' + r[8] + '"' : '') +
    (r[14] ? '\n   Ürünler: ' + r[14] : '') +
    '\n   Sorumlu (öneri): ' + r[25] + (r[25] === 'Kurye' ? ' — onaylarsan "Kuryeden Düş" kutusunu işaretle' : '') +
    '\n   Öneri: ' + r[18]
  ).join('\n\n');
  tyBildir_('↩️ Trendyol iade: ' + liste.length + ' kalem bekliyor (4 saat içinde karar)', govde);
}

/* ============================================================
 * 5) SABAH ÖZETİ
 * ============================================================ */
function sabahOzeti() {
  const bugun = gunNo_(new Date());
  const kova = tyrYorumKovasi_();
  const resmi = tyrResmiPuanlar_();
  const satis = tyrSatisOku_().adet;
  const sayi = (x, h) => x === '' || x === undefined ? '-' : Number(x).toFixed(h).replace('.', ',');

  const satir = tyrTahmin_(kova, bugun).map(x => {
    // en son iki resmi kayıt
    let son = null, onceki = null;
    for (let g = bugun; g > bugun - 10 && (son === null || onceki === null); g--) {
      const v = resmi[g + '|' + x.marka];
      if (v === undefined) continue;
      if (son === null) son = v; else onceki = v;
    }
    const fark = son !== null && onceki !== null ? son - onceki : null;
    const ok = fark === null ? '' : fark > 0 ? ' ▲ +' + sayi(fark, 2) : fark < 0 ? ' ▼ ' + sayi(fark, 2) : ' =';
    const dun = bugun - 1;
    const adet = satis[dun + '|' + x.marka] || 0;
    let top = 0, say = 0;
    for (let k = 1; k <= 4; k++) {
      const v = satis[(dun - 7 * k) + '|' + x.marka];
      if (v !== undefined) { top += v; say++; }
    }
    const normal = say ? top / say : 0;
    return '• ' + kisa_(x.marka) + ': ' + (son === null ? '-' : sayi(son, 2)) + ok +
      '\n   Yarın (yeni yorum gelmezse): ' + sayi(x.yarin, 3) +
      (x.dusenAdet ? ' — ' + x.dusenAdet + ' yorum düşecek (ort. ' + sayi(x.dusenOrt, 1) + ')' : ' — düşen yorum yok') +
      (x.gereken !== '' ? '\n   ' + sayi(x.hedef, 1) + ' için ' + x.gereken + ' adet 5★ gerekir' : '') +
      '\n   Dün sipariş: ' + adet + (normal ? ' (normal ' + Math.round(normal) + ', ' +
        (adet >= normal ? '+' : '') + Math.round((adet - normal) / normal * 100) + '%)' : '');
  });

  let iade = '';
  const sh = SpreadsheetApp.getActive().getSheetByName(TYR.IADE);
  if (sh && sh.getLastRow() > 1) {
    const b = tyrBasliklar_(sh);
    const bek = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
      .filter(r => r[b('Durum')] === 'WaitingInAction');
    if (bek.length) iade = '\n\n↩️ Bekleyen iade: ' + bek.length + ' kalem — Iadeler sekmesine bak.';
  }

  tyBildir_('📊 Trendyol sabah özeti — ' + Utilities.formatDate(new Date(), 'Europe/Istanbul', 'dd.MM.yyyy'),
            satir.join('\n\n') + iade);
}

/* ============================================================
 * 6) ORTAK: bildirim, erişim hatası, başlık, tarih
 * ============================================================ */
function tyBildir_(konu, govde) {
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: konu, body: govde });
  try {
    UrlFetchApp.fetch('https://hook.eu1.make.com/6wgq4uajtmy8p7vsl3u7j1rwei70cy58', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ konu: konu, mesaj: govde }), muteHttpExceptions: true
    });
  } catch (e) { Logger.log('Webhook hatası: ' + e); }
}

/* 401/403 gelirse (kimlik bozuk ya da Uber Eats geçişi) günde bir kez haber verir */
function tyErisimHatasi_(servis, kod, metin) {
  if (kod !== 401 && kod !== 403) return;
  const anahtar = 'TY_HATA_' + servis + '_' + kod;
  const bugun = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyy-MM-dd');
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty(anahtar) === bugun) return;
  p.setProperty(anahtar, bugun);
  const neden = kod === 403 && String(metin).indexOf('endpoint.not-available') >= 0
    ? 'Trendyol bu servisi kapatmış görünüyor (Uber Eats geçişi). Veri artık gelmiyor.'
    : kod === 401 ? 'API kimlik bilgisi hatalı ya da yenilenmiş.' : 'Erişim reddedildi.';
  tyBildir_('🚫 Trendyol erişim hatası: ' + servis + ' (' + kod + ')',
            neden + '\n\n' + String(metin).slice(0, 300));
}

/* başlık adı -> sütun indeksi (0 tabanlı); bulunamazsa hata */
function tyrBasliklar_(sh) {
  const b = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
  return ad => {
    const i = b.indexOf(ad);
    if (i < 0) throw new Error('"' + sh.getName() + '" sekmesinde başlık yok: ' + ad);
    return i;
  };
}

function tyrTarih_(x) {
  if (x instanceof Date) return x.getFullYear() >= 2000 ? x : null;
  if (!x) return null;
  const m = String(x).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);   // 19.08.2026
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(x);
  return isNaN(d) ? null : d;
}

/* ============================================================
 * 7) TETİKLEYİCİ
 * ============================================================ */
function raporTetikleyiciKur() {
  const adlar = ['gunlukPuanRaporu', 'iadeleriCek', 'sabahOzeti'];
  ScriptApp.getProjectTriggers()
    .filter(t => adlar.indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('gunlukPuanRaporu').timeBased().atHour(23).nearMinute(50).everyDays(1).create();
  ScriptApp.newTrigger('iadeleriCek').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('sabahOzeti').timeBased().atHour(10).nearMinute(45).everyDays(1).create();
  Logger.log('Kuruldu: gunlukPuanRaporu 23:50, iadeleriCek 10 dk, sabahOzeti 10:45');
}
