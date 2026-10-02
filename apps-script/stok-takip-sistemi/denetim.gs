function yapiDokumu() {
  var ss = SpreadsheetApp.openById('1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE');
  var cikti = [];
  ss.getSheets().forEach(function (sh) {
    var sonS = sh.getLastRow(), sonC = sh.getLastColumn();
    var bas = sonS > 0 && sonC > 0
      ? sh.getRange(1, 1, 1, Math.min(sonC, 15)).getValues()[0]
          .map(function (x) { return String(x).trim(); })
          .filter(String).join(' | ')
      : '(boş)';
    cikti.push(sh.getName() + '  [' + sonS + 'x' + sonC + ']  ' + bas);
  });
  Logger.log(cikti.join('\n'));
}
/**
 * BAP Stok Sistemi — Denetim
 * Denetim.gs dosyasına ekle, denetimRaporuBAP() çalıştır.
 * Hiçbir şeyi değiştirmez, sadece okur ve rapor yazar.
 */

var D_SS = '1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE';

function _dSh(ad) {
  return SpreadsheetApp.openById(D_SS).getSheetByName(ad);
}

function _dVeri(ad) {
  var sh = _dSh(ad);
  if (!sh) return [];
  var s = sh.getLastRow(), c = sh.getLastColumn();
  if (s < 2) return [];
  return sh.getRange(2, 1, s - 1, c).getValues();
}

function _dTarih(v) {
  if (v instanceof Date) return v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function _dGun(d) {
  return d ? Math.round((Date.now() - d.getTime()) / 86400000) : null;
}

function _dSonTarih(veri, sutun) {
  var en = null;
  for (var i = 0; i < veri.length; i++) {
    var d = _dTarih(veri[i][sutun]);
    if (d && (!en || d > en)) en = d;
  }
  return en;
}

function _dFmt(d) {
  return d ? Utilities.formatDate(d, 'Europe/Istanbul', 'dd.MM.yyyy HH:mm') : 'yok';
}

function denetimRaporuBAP() {
  var r = [];
  var not = function (s) { r.push(s); };

  not('===== BAP STOK SİSTEMİ DENETİMİ =====');
  not('Çalışma: ' + _dFmt(new Date()));
  not('');

  /* ---------- 1. SATIŞ → STOK ---------- */
  not('--- 1. SATIŞ ZİNCİRİ ---');
  var satis = _dVeri('Satis_Hareketleri');
  var sonSatis = _dSonTarih(satis, 0);
  not('Satis_Hareketleri: ' + satis.length + ' satır, son ' + _dFmt(sonSatis) +
      ' (' + _dGun(sonSatis) + ' gün önce)');

  var duz = _dVeri('Duzenlenmis_Liste');
  var sonSip = _dSonTarih(duz, 4);
  not('Duzenlenmis_Liste: ' + duz.length + ' satır, son sipariş ' + _dFmt(sonSip) +
      ' (' + _dGun(sonSip) + ' gün önce)');
  if (sonSatis && sonSip && (sonSip - sonSatis) > 86400000) {
    not('  !! SİPARİŞ VAR AMA STOK DÜŞMEMİŞ — aradaki fark ' +
        Math.round((sonSip - sonSatis) / 86400000) + ' gün');
  }

  /* ---------- 2. SATIŞ UYARILARI ---------- */
  not('');
  not('--- 2. SATIŞ UYARILARI (stoktan düşemedikleri) ---');
  var uy = _dVeri('Satis_Uyarilar');
  var son30 = 0, sorunlar = {};
  for (var i = 0; i < uy.length; i++) {
    var d = _dTarih(uy[i][0]);
    if (d && _dGun(d) <= 30) {
      son30++;
      var s = String(uy[i][3]).slice(0, 60);
      sorunlar[s] = (sorunlar[s] || 0) + 1;
    }
  }
  not('Toplam ' + uy.length + ' uyarı, son 30 günde ' + son30);
  var sirali = Object.keys(sorunlar).sort(function (a, b) { return sorunlar[b] - sorunlar[a]; });
  for (var i = 0; i < Math.min(8, sirali.length); i++) {
    not('  ' + sorunlar[sirali[i]] + 'x  ' + sirali[i]);
  }

  /* ---------- 3. ÜRETİM ---------- */
  not('');
  not('--- 3. ÜRETİM ---');
  var ur = _dVeri('Uretim_Girisleri');
  var sonUr = _dSonTarih(ur, 0);
  not('Uretim_Girisleri: ' + ur.length + ' satır, son ' + _dFmt(sonUr) +
      ' (' + _dGun(sonUr) + ' gün önce)');

  var hrk = _dVeri('Stok_Hareketleri');
  var turler = {}, sonHrk = null;
  var bas = Math.max(0, hrk.length - 5000);
  for (var i = bas; i < hrk.length; i++) {
    var d = _dTarih(hrk[i][0]);
    if (d && (!sonHrk || d > sonHrk)) sonHrk = d;
    if (d && _dGun(d) <= 30) {
      var t = String(hrk[i][3]);
      turler[t] = (turler[t] || 0) + 1;
    }
  }
  not('Stok_Hareketleri: ' + hrk.length + ' satır, son ' + _dFmt(sonHrk));
  not('Son 30 gün hareket türleri (son 5000 satır içinde):');
  Object.keys(turler).sort(function (a, b) { return turler[b] - turler[a]; })
    .forEach(function (t) { not('  ' + turler[t] + 'x  ' + t); });

  /* ---------- 4. ALIŞ / FATURA ---------- */
  not('');
  not('--- 4. FATURA → STOK ---');
  var alis = _dVeri('Alis_Bekleyenler');
  var sonAlis = _dSonTarih(alis, 1);
  var durumlar = {};
  for (var i = 0; i < alis.length; i++) {
    var dd = String(alis[i][5] || '(boş)');
    durumlar[dd] = (durumlar[dd] || 0) + 1;
  }
  not('Alis_Bekleyenler: ' + alis.length + ' satır, son fatura ' + _dFmt(sonAlis) +
      ' (' + _dGun(sonAlis) + ' gün önce)');
  Object.keys(durumlar).sort(function (a, b) { return durumlar[b] - durumlar[a]; })
    .forEach(function (t) { not('  ' + durumlar[t] + 'x  durum: ' + t); });

  var esl = _dVeri('Fatura_Eslestirme');
  var subeBos = 0, stokBos = 0, yokSay = 0;
  for (var i = 0; i < esl.length; i++) {
    if (!String(esl[i][6] || '').trim()) subeBos++;
    if (!String(esl[i][1] || '').trim()) stokBos++;
    if (/YOK\s*SAY/i.test(String(esl[i][3] || ''))) yokSay++;
  }
  not('Fatura_Eslestirme: ' + esl.length + ' kural');
  not('  şube boş (otomatik): ' + subeBos);
  not('  stok karşılığı BOŞ (eşleşmiyor): ' + stokBos);
  not('  yok say: ' + yokSay);

  not('Fatura_Eksik_Urunler: ' + _dVeri('Fatura_Eksik_Urunler').length + ' eşleşmeyen ürün');

  /* ---------- 5. MALİYETLER ---------- */
  not('');
  not('--- 5. MALİYETLER ---');
  var mal = _dVeri('Tbl_Maliyetler');
  var sifir = 0, fiyatYok = 0, yuksek = 0, uyariliSayi = 0, ornek = [];
  for (var i = 0; i < mal.length; i++) {
    var ad = String(mal[i][0] || '').trim();
    if (!ad) continue;
    var toplam = Number(mal[i][3]) || 0;
    var fiyat = Number(mal[i][5]) || 0;
    var yuzde = Number(mal[i][6]) || 0;
    if (toplam <= 0) { sifir++; if (ornek.length < 6) ornek.push('maliyet 0: ' + ad); }
    if (fiyat <= 0) fiyatYok++;
    if (yuzde > 0.45 || yuzde > 45) { yuksek++; }
    if (String(mal[i][7] || '').trim()) uyariliSayi++;
  }
  not('Tbl_Maliyetler: ' + mal.length + ' ürün');
  not('  maliyeti 0 olan: ' + sifir);
  not('  satış fiyatı girilmemiş: ' + fiyatYok);
  not('  maliyet oranı %45 üstü: ' + yuksek);
  not('  uyarı taşıyan: ' + uyariliSayi);
  ornek.forEach(function (x) { not('  ' + x); });

  /* ---------- 6. ŞUBE STOK ---------- */
  not('');
  not('--- 6. ŞUBE STOK ---');
  var ss = _dVeri('Sube_Stok');
  var negatif = 0, subeler = {}, tipler = {}, negOrnek = [];
  for (var i = 0; i < ss.length; i++) {
    var ad = String(ss[i][0] || '').trim();
    if (!ad) continue;
    var sb = String(ss[i][2] || '(boş)');
    subeler[sb] = (subeler[sb] || 0) + 1;
    tipler[String(ss[i][1] || '(boş)')] = (tipler[String(ss[i][1] || '(boş)')] || 0) + 1;
    var mevcut = Number(ss[i][3]);
    if (mevcut < 0) { negatif++; if (negOrnek.length < 8) negOrnek.push(ad + ' / ' + sb + ' = ' + mevcut); }
  }
  not('Sube_Stok: ' + ss.length + ' satır');
  Object.keys(subeler).forEach(function (s) { not('  şube ' + s + ': ' + subeler[s] + ' kalem'); });
  Object.keys(tipler).forEach(function (t) { not('  tip ' + t + ': ' + tipler[t]); });
  not('  NEGATİF stok: ' + negatif);
  negOrnek.forEach(function (x) { not('    ' + x); });

  /* ---------- 7. HAMMADDE / AMBALAJ / DİREKT ---------- */
  not('');
  not('--- 7. HAMMADDE · AMBALAJ · DİREKT SATIŞ ---');
  [['Tbl_Hammaddeler', 'HM'], ['Ambalaj_Hammadde', 'AMB'], ['Direktsatisurunler', 'DS']]
    .forEach(function (p) {
      var v = _dVeri(p[0]);
      var fiyatsiz = 0, dolu = 0;
      for (var i = 0; i < v.length; i++) {
        var ad = String(v[i][1] || '').trim();
        if (!ad) continue;
        dolu++;
        if (!(Number(v[i][9]) > 0)) fiyatsiz++;
      }
      not(p[1] + ' (' + p[0] + '): ' + dolu + ' kalem, son alış fiyatı YOK: ' + fiyatsiz);
    });

  /* ---------- 8. REÇETE ---------- */
  not('');
  not('--- 8. REÇETE KAPSAMI ---');
  var ul = _dVeri('Ürün_Listesi');
  var rec = _dVeri('Tbl_Receteler');
  var recVar = {};
  rec.forEach(function (x) { recVar[String(x[0]).trim().toLowerCase()] = true; });
  var aktif = 0, recYok = 0, recYokOrnek = [];
  for (var i = 0; i < ul.length; i++) {
    var ad = String(ul[i][0] || '').trim();
    if (!ad) continue;
    var akt = String(ul[i][2] || '').toLowerCase();
    if (akt === 'hayır' || akt === 'false' || akt === 'pasif') continue;
    aktif++;
    if (!recVar[ad.toLowerCase()]) {
      recYok++;
      if (recYokOrnek.length < 10) recYokOrnek.push(ad);
    }
  }
  not('Aktif ürün: ' + aktif + ', reçetesi OLMAYAN: ' + recYok);
  recYokOrnek.forEach(function (x) { not('  ' + x); });

  not('');
  not('===== BİTTİ =====');

  Logger.log(r.join('\n'));
}
function denetim2() {
  var r = [], not = function(s){ r.push(s); };
  var AGU = new Date(2026, 7, 1);

  // --- Alış: 1 Ağustos öncesi/sonrası ve tedarikçi kırılımı ---
  var alis = _dVeri('Alis_Bekleyenler');
  var eski = 0, yeni = 0, yeniTed = {};
  for (var i = 0; i < alis.length; i++) {
    var d = _dTarih(alis[i][1]), durum = String(alis[i][5] || '');
    if (durum !== 'SUBE_YOK') continue;
    if (d && d < AGU) { eski++; continue; }
    yeni++;
    var t = String(alis[i][2] || '(boş)');
    yeniTed[t] = (yeniTed[t] || 0) + 1;
  }
  not('SUBE_YOK — 1 Ağustos ÖNCESİ: ' + eski + '  |  SONRASI: ' + yeni);
  not('1 Ağustos sonrası tedarikçi kırılımı:');
  Object.keys(yeniTed).sort(function(a,b){return yeniTed[b]-yeniTed[a];})
    .slice(0,12).forEach(function(t){ not('  ' + yeniTed[t] + 'x  ' + t); });

  // --- Eşleşmeyen fatura ürünleri ---
  var esl = {}, n = 0;
  for (var i = 0; i < alis.length; i++) {
    if (String(alis[i][5]) !== 'ESLESME_YOK') continue;
    var u = String(alis[i][3] || '').trim();
    esl[u] = (esl[u] || 0) + 1; n++;
  }
  not('');
  not('ESLESME_YOK: ' + n + ' satır, ' + Object.keys(esl).length + ' farklı ürün adı');
  Object.keys(esl).sort(function(a,b){return esl[b]-esl[a];})
    .slice(0,25).forEach(function(u){ not('  ' + esl[u] + 'x  ' + u); });

  // --- Tanımsız satış ürünleri (direkt satış adayları) ---
  var uy = _dVeri('Satis_Uyarilar'), tanimsiz = {};
  for (var i = 0; i < uy.length; i++) {
    if (!/Reçetesi de direkt satış/i.test(String(uy[i][3]))) continue;
    var u = String(uy[i][2] || '').trim();
    tanimsiz[u] = (tanimsiz[u] || 0) + 1;
  }
  not('');
  not('TANIMSIZ SATIŞ ÜRÜNLERİ: ' + Object.keys(tanimsiz).length + ' farklı');
  Object.keys(tanimsiz).sort(function(a,b){return tanimsiz[b]-tanimsiz[a];})
    .forEach(function(u){ not('  ' + tanimsiz[u] + 'x  ' + u); });

  // --- Direkt satış listesindeki adlar ---
  var ds = _dVeri('Direktsatisurunler');
  not('');
  not('Direktsatisurunler içindeki adlar:');
  ds.forEach(function(x){ var a = String(x[1]||'').trim(); if (a) not('  ' + a); });

  Logger.log(r.join('\n'));
}
function kaynakBasliklar() {
  var sh = SpreadsheetApp.openById("1gdn_rbaevKx9_-pNTRKL1DDtytFxZHr9QF-jrS4cHPE")
            .getSheetByName("Satıs Verileri");
  var b = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var s = [];
  for (var i = 0; i < b.length; i++) s.push((i + 1) + ") " + b[i]);
  Logger.log(s.join("\n"));
  Logger.log("--- örnek satır ---");
  var v = sh.getRange(sh.getLastRow(), 1, 1, sh.getLastColumn()).getValues()[0];
  for (var i = 0; i < v.length; i++) if (String(v[i]).trim()) Logger.log((i + 1) + ") " + String(v[i]).slice(0, 80));
}
function adetKontrol() {
  var sh = SpreadsheetApp.openById("1gdn_rbaevKx9_-pNTRKL1DDtytFxZHr9QF-jrS4cHPE")
            .getSheetByName("Satıs Verileri");
  var bas = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var i = 0; i < bas.length; i++) {
    if (String(bas[i]).indexOf("Motor_Islendi") !== -1) {
      Logger.log("Motor_Islendi sütunu: " + (i + 1) + (i + 1 < 18 ? "  → ADETLER OKUNMUYOR, hata gerçek" : "  → sorun yok"));
    }
  }
}

function sayimVeTop20() {
  var r = [], not = function(s){ r.push(s); };

  /* --- 1. Sayım girişleri çalışıyor mu --- */
  var sg = _dVeri('Sayim_Girisleri');
  not('=== SAYIM GİRİŞLERİ ===');
  not('Satır: ' + sg.length + ', son ' + _dFmt(_dSonTarih(sg, 0)));
  var hrk = _dVeri('Stok_Hareketleri'), sayimH = 0, sonSayimH = null;
  for (var i = hrk.length - 1; i >= 0 && i > hrk.length - 20000; i--) {
    if (String(hrk[i][3]).toLowerCase().indexOf('sayim') !== -1) {
      sayimH++;
      var d = _dTarih(hrk[i][0]);
      if (d && (!sonSayimH || d > sonSayimH)) sonSayimH = d;
    }
  }
  not('Stok_Hareketleri içinde "Sayim" hareketi: ' + sayimH + ', son ' + _dFmt(sonSayimH));
  not(sg.length > 1 && sayimH < sg.length - 1
      ? '  !! Sayım girilmiş ama stoğa YANSIMAMIŞ görünüyor'
      : '  görünüşe göre yansıyor');

  /* --- 2. Son 21 günde en çok düşen kalemler --- */
  var sh = _dVeri('Satis_Hareketleri'), ur = {};
  for (var i = 0; i < sh.length; i++) {
    var d = _dTarih(sh[i][0]);
    if (!d || _dGun(d) > 21) continue;
    var ad = String(sh[i][2] || '').trim();
    if (!ad) continue;
    var k = ad + '||' + String(sh[i][3]) + '||' + String(sh[i][1]);
    if (!ur[k]) ur[k] = { ad: ad, tip: String(sh[i][3]), sube: String(sh[i][1]), m: 0, birim: String(sh[i][8]) };
    ur[k].m += Number(sh[i][7]) || 0;
  }

  /* --- 3. Fiyatlarla birleştir --- */
  var fiyat = {};
  [['Tbl_Hammaddeler', 'HM'], ['Ambalaj_Hammadde', 'AMB'], ['Direktsatisurunler', 'DS']]
    .forEach(function(p){
      _dVeri(p[0]).forEach(function(x){
        var ad = String(x[1] || '').trim(), kisa = String(x[2] || '').trim();
        var f = Number(x[9]) || 0, ic = Number(x[7]) || 1;
        var birimF = ic > 0 ? f / ic : f;
        if (ad) fiyat[ad.toLowerCase()] = birimF;
        if (kisa) fiyat[kisa.toLowerCase()] = birimF;
      });
    });

  var liste = Object.keys(ur).map(function(k){
    var u = ur[k];
    var f = fiyat[u.ad.toLowerCase()] || 0;
    u.tutar = u.m * f;
    u.birimF = f;
    return u;
  }).filter(function(u){ return u.tutar > 0; })
    .sort(function(a,b){ return b.tutar - a.tutar; });

  not('');
  not('=== SON 21 GÜNDE PARASAL OLARAK EN ÇOK TÜKENEN 30 KALEM ===');
  not('(tüketim × birim fiyat — sayım önceliği bu sırayla)');
  liste.slice(0, 30).forEach(function(u, i){
    not((i+1) + ') ' + u.ad + '  [' + u.tip + '/' + u.sube + ']  ' +
        Math.round(u.m * 100) / 100 + ' ' + u.birim +
        '  ×  ' + (Math.round(u.birimF * 100) / 100) + ' TL  =  ' +
        Math.round(u.tutar) + ' TL');
  });

  Logger.log(r.join('\n'));
}
function top20Duzeltilmis() {
  var r = [], not = function(s){ r.push(s); };

  var fiyat = {};
  [['Tbl_Hammaddeler','HM'], ['Ambalaj_Hammadde','AMB'], ['Direktsatisurunler','DS']]
    .forEach(function(p){
      _dVeri(p[0]).forEach(function(x){
        var ad = String(x[1]||'').trim(), kisa = String(x[2]||'').trim();
        var ic = Number(x[7]) || 1, olcu = String(x[8]||'').toLowerCase().replace(/\./g,'').trim();
        var f = Number(x[9]) || 0;
        if (!(f > 0)) return;
        var bilgi = { birimF: f / (ic > 0 ? ic : 1), olcu: olcu };
        if (ad) fiyat[ad.toLowerCase()] = bilgi;
        if (kisa) fiyat[kisa.toLowerCase()] = bilgi;
      });
    });

  function cevir(m, kaynak, hedef) {
    var K = { gr:1, g:1, ml:1, kg:1000, lt:1000, l:1000 };
    kaynak = String(kaynak||'').toLowerCase().replace(/\./g,'').trim();
    hedef  = String(hedef||'').toLowerCase().replace(/\./g,'').trim();
    if (kaynak === hedef) return m;
    if (K[kaynak] && K[hedef]) return m * K[kaynak] / K[hedef];
    return m;
  }

  var sh = _dVeri('Satis_Hareketleri'), ur = {};
  for (var i = 0; i < sh.length; i++) {
    var ad = String(sh[i][2]||'').trim();
    if (!ad) continue;
    var k = ad + '||' + sh[i][3] + '||' + sh[i][1];
    if (!ur[k]) ur[k] = { ad:ad, tip:String(sh[i][3]), sube:String(sh[i][1]), m:0, birim:String(sh[i][8]) };
    ur[k].m += Number(sh[i][7]) || 0;
  }

  var liste = Object.keys(ur).map(function(k){
    var u = ur[k], f = fiyat[u.ad.toLowerCase()];
    if (!f) { u.tutar = 0; return u; }
    u.tutar = cevir(u.m, u.birim, f.olcu) * f.birimF;
    u.birimF = f.birimF; u.olcu = f.olcu;
    return u;
  }).filter(function(u){ return u.tutar > 0; })
    .sort(function(a,b){ return b.tutar - a.tutar; });

  not('=== TÜM DÖNEM · PARASAL AĞIRLIĞA GÖRE İLK 35 ===');
  not('(sıralama amaçlı — log tarihleri güvenilmez, tutar mutlak değil)');
  liste.slice(0,35).forEach(function(u,i){
    not((i+1) + ') ' + u.ad + ' [' + u.tip + '/' + u.sube + ']  ' +
        Math.round(u.m*10)/10 + ' ' + u.birim + '  →  ' + Math.round(u.tutar) + ' TL');
  });

  Logger.log(r.join('\n'));
}

function alisAra() {
  var sh = SpreadsheetApp.openById('1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE')
             .getSheetByName('Stok_Hareketleri');
  var son = sh.getLastRow();
  var bas = Math.max(2, son - 3000);
  var v = sh.getRange(bas, 1, son - bas + 1, 9).getValues();
  var bulundu = 0;
  for (var i = v.length - 1; i >= 0; i--) {
    if (String(v[i][8]).indexOf('42301890') !== -1 || String(v[i][8]).indexOf('42301885') !== -1) {
      Logger.log('BULUNDU satır ' + (bas + i) + ': ' + v[i].join(' | '));
      if (++bulundu > 3) break;
    }
  }
  if (!bulundu) Logger.log('Bu fatura numaraları Stok_Hareketleri son 3000 satırda YOK. Son satır: ' + son);
  Logger.log('Son satırın tarihi: ' + sh.getRange(son, 1).getValue());
}
/**
 * BİRİM DENETİMİ
 * Denetim.gs'e ekle, birimDenetimi() çalıştır.
 * Hiçbir şeyi değiştirmez. Sadece okur ve raporlar.
 *
 * Ne yapar:
 *  1) Tbl_Hammaddeler / Ambalaj_Hammadde / Direktsatisurunler'de
 *     H (paket içeriği) ve I (ölçü birimi) eksik/şüpheli olanları bulur
 *  2) Ürün adından içeriği tahmin eder (5LT, 1 KG, 2 KG * 6, 500 GR ...)
 *  3) Reçetelerde o hammaddenin hangi birimle istendiğine bakar
 *  4) "otomatik düzelir" ve "elle bakılmalı" diye ikiye ayırır
 */

var BD_SS = '1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE';

function _bdVeri(ad) {
  var sh = SpreadsheetApp.openById(BD_SS).getSheetByName(ad);
  if (!sh) return [];
  var s = sh.getLastRow(), c = sh.getLastColumn();
  if (s < 2) return [];
  return sh.getRange(2, 1, s - 1, c).getValues();
}

function _bdBirim(b) {
  var s = String(b || '').toLowerCase().replace(/\./g, '').trim();
  if (s === 'gr' || s === 'gram' || s === 'g') return 'gr';
  if (s === 'kg' || s === 'kilo') return 'kg';
  if (s === 'lt' || s === 'l' || s === 'litre') return 'lt';
  if (s === 'ml' || s === 'cc') return 'ml';
  if (s === 'adet' || s === 'ad' || s === 'porsiyon' || s === 'dilim') return 'adet';
  return s;
}

/** Ürün adından paket içeriğini çıkarmaya çalışır → {miktar, birim} | null */
function _bdAdtanIcerik(ad) {
  var s = String(ad).toUpperCase().replace(/,/g, '.');

  // "2 KG * 6"  /  "500 GR / 16AD"  /  "1 LT*12"  → tek paketin içeriği
  var m = s.match(/(\d+(?:\.\d+)?)\s*(KG|GR|G|LT|ML|CC)\b/);
  if (!m) return null;

  var miktar = parseFloat(m[1]);
  var birim = _bdBirim(m[2]);
  if (!(miktar > 0)) return null;

  // kg/lt → stok birimi kg/lt ise miktar aynen; gr/ml ise 1000 ile çarp
  return { miktar: miktar, birim: birim, kaynak: m[0] };
}

function birimDenetimi() {
  var r = [], not = function (s) { r.push(s); };

  /* --- reçetelerde hangi hammadde hangi birimle isteniyor --- */
  var recBirim = {};
  _bdVeri('Tbl_Receteler').forEach(function (x) {
    var ad = String(x[2] || '').trim().toLowerCase();
    var b = _bdBirim(x[4]);
    if (!ad || !b) return;
    if (!recBirim[ad]) recBirim[ad] = {};
    recBirim[ad][b] = (recBirim[ad][b] || 0) + 1;
  });
  _bdVeri('Tbl_YariMamulRecete').forEach(function (x) {
    var ad = String(x[1] || '').trim().toLowerCase();
    var b = _bdBirim(x[3]);
    if (!ad || !b) return;
    if (!recBirim[ad]) recBirim[ad] = {};
    recBirim[ad][b] = (recBirim[ad][b] || 0) + 1;
  });

  var otomatik = [], elle = [], tamam = 0, toplam = 0;

  [['Tbl_Hammaddeler', 'HM'], ['Ambalaj_Hammadde', 'AMB'], ['Direktsatisurunler', 'DS']]
    .forEach(function (p) {
      _bdVeri(p[0]).forEach(function (x) {
        var tamAd = String(x[1] || '').trim();
        var kisaAd = String(x[2] || '').trim();
        if (!tamAd) return;

        // E sütunu: Tedarikçi Sipariş Aktif — işaretli değilse atla
        var aktif = x[4];
        if (aktif !== true && String(aktif).toLowerCase() !== 'true' &&
            String(aktif).toLowerCase() !== 'doğru' && String(aktif) !== '1') return;
             var takip = x[14];
        if (takip !== true && String(takip).toLowerCase() !== 'true' &&
            String(takip).toLowerCase() !== 'doğru' && String(takip) !== '1') return;

        toplam++;

        var paketDurumu = String(x[5] || '').trim();
        var icerik = Number(x[7]) || 0;       // H
        var olcu = _bdBirim(x[8]);            // I
        var fiyat = Number(x[9]) || 0;        // J

        // reçetede hangi birimle isteniyor
        var rb = recBirim[(kisaAd || tamAd).toLowerCase()] || recBirim[tamAd.toLowerCase()] || {};
        var istenenler = Object.keys(rb);
        var istenen = istenenler.length ? istenenler.sort(function (a, b) { return rb[b] - rb[a]; })[0] : '';

        var tahmin = _bdAdtanIcerik(tamAd);

        var sorun = [];
        if (!olcu) sorun.push('ölçü birimi(I) BOŞ');
        if (!(icerik > 0)) sorun.push('paket içeriği(H) BOŞ');

        // çelişki: reçete gram istiyor ama stok adet
        if (olcu === 'adet' && (istenen === 'gr' || istenen === 'kg' || istenen === 'ml' || istenen === 'lt')) {
          sorun.push('stok ADET ama reçete ' + istenen + ' istiyor');
        }
        // içerik 1 ama ad çoklu paket diyor
        if (icerik === 1 && tahmin && tahmin.miktar > 1) {
          sorun.push('H=1 ama ad "' + tahmin.kaynak + '" diyor');
        }
        // koli işaretli ama koli içeriği yok
        if (/koli/i.test(paketDurumu) && !(Number(x[15]) > 0)) {
          sorun.push('Koli işaretli ama P(Koli_Icerik) boş');
        }

        if (!sorun.length) { tamam++; return; }

        var satir = p[1] + ' | ' + tamAd +
          (kisaAd ? ' (' + kisaAd + ')' : '') +
          '  →  H=' + (icerik || '-') + ' I=' + (olcu || '-') +
          (istenen ? ' · reçete: ' + istenen : ' · reçetede yok') +
          '  ||  ' + sorun.join('; ');

        // adından çıkarılabiliyorsa otomatik
        if (tahmin && istenen && (istenen === 'gr' || istenen === 'kg' || istenen === 'ml' || istenen === 'lt')) {
          var onerilenOlcu = (tahmin.birim === 'gr' || tahmin.birim === 'kg') ? 'kg' : 'lt';
          var onerilenIcerik = (tahmin.birim === 'gr' || tahmin.birim === 'ml')
            ? tahmin.miktar / 1000 : tahmin.miktar;
          otomatik.push(satir + '  →→ ÖNERİ: I=' + onerilenOlcu + ', H=' + onerilenIcerik);
        } else {
          elle.push(satir);
        }
      });
    });

  not('===== BİRİM DENETİMİ =====');
  not('Toplam kalem: ' + toplam + ' · sorunsuz: ' + tamam +
      ' · otomatik düzelebilir: ' + otomatik.length + ' · elle: ' + elle.length);
  not('');
  not('--- OTOMATİK DÜZELEBİLİR (ad içinde gramaj var) ---');
  otomatik.slice(0, 80).forEach(function (x) { not(x); });
  if (otomatik.length > 80) not('... ve ' + (otomatik.length - 80) + ' tane daha');
  not('');
  not('--- ELLE BAKILMALI ---');
  elle.slice(0, 60).forEach(function (x) { not(x); });
  if (elle.length > 60) not('... ve ' + (elle.length - 60) + ' tane daha');

  Logger.log(r.join('\n'));
}