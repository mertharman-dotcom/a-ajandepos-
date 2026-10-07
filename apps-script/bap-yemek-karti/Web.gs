/** Web uygulaması: MacBook programları (POST) ve iPhone Kestirmeler (GET). */

function doGet(e) {
  var p = (e && e.parameter) || {};
  // iPhone Kestirmeler: ?sayfa=kod&kaynak=pluxee|edenred&k=<anahtar>&kod=<SMS metni ya da kod>
  // (?sayfa=pluxee&kod=… eski Pluxee kestirmesi için: kaynak 'pluxee' sayılır)
  if (p.sayfa === 'kod' || p.sayfa === 'pluxee') {
    if (p.k !== KESTIRME_ANAHTAR) return ContentService.createTextOutput('Yetkisiz');
    var kaynak = p.sayfa === 'pluxee' ? 'pluxee' : p.kaynak;
    var r = kodKutusu_({ tur: 'kodYaz', kaynak: kaynak, kod: String(p.kod || '') });
    return ContentService.createTextOutput(r.ok ? '✅ ' + kaynak + ' kodu alındı' : '❌ ' + (r.hata || 'hata') + (r.gelen ? ' (' + r.gelen + ')' : ''));
  }
  return ContentService.createTextOutput('BAP Yemek Kartı');
}

function doPost(e) {
  var g;
  try { g = JSON.parse(e.postData.contents); } catch (err) { return jsonYanit_({ hata: 'Geçersiz JSON.' }); }
  if (!g || g.anahtar !== KOPRU_ANAHTAR) return jsonYanit_({ hata: 'Anahtar hatalı.' });

  // Zamanlı çekimi elle çalıştır / son sonuçlarına bak (çekim kendi kilidini alır, bu yüzden aşağıdaki kilitten önce)
  if (g.tur === 'cek') {
    var cek = { setcard: setcardCek, tokenflex: tokenflexCek }[g.kaynak];
    if (!cek) return jsonYanit_({ hata: 'kaynak: setcard | tokenflex' });
    try { return jsonYanit_(cek(Number(g.gun) || 3)); } catch (err) { return jsonYanit_({ hata: String(err && err.message || err) }); }
  }
  if (g.tur === 'cekDurum') {
    var pr = PropertiesService.getScriptProperties().getProperties(), d = {};
    Object.keys(pr).filter(function (k) { return /^SON_CALISMA_/.test(k); }).forEach(function (k) { d[k.slice(12)] = JSON.parse(pr[k]); });
    return jsonYanit_({ ok: true, son: d });
  }
  var kilit = LockService.getScriptLock();
  if (!kilit.tryLock(30000)) return jsonYanit_({ hata: 'Meşgul, tekrar dene.' });
  try {
    if (g.tur === 'pluxee') return jsonYanit_(pluxeeYaz(g.satirlar || []));
    if (g.tur === 'edenred') return jsonYanit_(edenredYaz(g.satirlar || []));
    if (g.tur === 'metropol') return jsonYanit_(metropolYaz(g.satirlar || []));
    if (g.tur === 'faturaKesim') return jsonYanit_(faturaKesimYaz(g.kart, g.sonuc));
    if (g.tur === 'oturumDurumu') return jsonYanit_(oturumDurumuYaz(g.kart, g.acik));
    if (g.tur === 'multinetBekleyen') return jsonYanit_(multinetBekleyenYaz(g.bekleyen));
    if (g.tur === 'metropolOdeme') return jsonYanit_(metropolOdemeYaz(g.satirlar));
    if (g.tur === 'multinet') return jsonYanit_(multinetYaz(g.satirlar));
    if (g.tur === 'multinetFatura') return jsonYanit_(multinetFaturaYaz(g.faturalar));
    if (/^kod(Iste|Yaz|Oku|Sil|Durum)$/.test(String(g.tur))) return jsonYanit_(kodKutusu_(g));
    // Panel › Yemek Kartları › SetCard faturası "Fatura Kes" (veri kapısı üzerinden; sahibinin düğmesiyle)
    if (g.tur === 'setcardFaturaKes') return jsonYanit_(setcardFaturaKesTek_(g.takipNo));
    // pluxee.mjs'in eski türleri → ortak kod kutusu (kaynak 'pluxee').
    // pluxee.mjs girişten ÖNCE pluxeeKodSil der: "bundan sonra gelen kodu ver" anı odur. pluxeeKodIste yalnız haber verir.
    if (g.tur === 'pluxeeKodSil') return jsonYanit_(kodKutusu_({ tur: 'kodIste', kaynak: 'pluxee' }));
    if (g.tur === 'pluxeeKodIste') return jsonYanit_({ ok: true });
    if (g.tur === 'pluxeeKodOku') { var r = kodKutusu_({ tur: 'kodOku', kaynak: 'pluxee' }); return jsonYanit_({ ok: true, kod: r.kod || '' }); }
    return jsonYanit_({ hata: 'Bilinmeyen tür.' });
  } catch (err) {
    return jsonYanit_({ hata: String(err && err.message || err) });
  } finally {
    kilit.releaseLock();
  }
}
