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
  // Telefondan elle (sahibi Mac başında değilken, 08.10):
  //   ?sayfa=cek&kaynak=tokenflex|setcard&k=<anahtar>     çekimi şimdi çalıştırır (Tokenflex SMS ister, kodu 3 dk bekler)
  //   ?sayfa=kodgir&kaynak=tokenflex&k=<anahtar>          SMS kodunu elle yazmak için küçük form (kestirme çalışmazsa)
  if (p.sayfa === 'cek' || p.sayfa === 'kodgir') {
    if (p.k !== KESTIRME_ANAHTAR) return ContentService.createTextOutput('Yetkisiz');
    var kn = String(p.kaynak || '').toLowerCase().replace(/[^a-z]/g, '');
    if (p.sayfa === 'cek') {
      var f = { setcard: setcardCek, tokenflex: tokenflexCek }[kn]; if (!f) return ContentService.createTextOutput('kaynak: setcard | tokenflex');
      try { var r = f(3); return ContentService.createTextOutput('✅ ' + kn + ': ' + JSON.stringify(r)); }
      catch (err) { return ContentService.createTextOutput('❌ ' + kn + ': ' + String(err && err.message || err)); }
    }
    var adres = ScriptApp.getService().getUrl();
    return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font:18px sans-serif;padding:24px">'
      + '<h3>' + kn + ' SMS kodu</h3><form method="get" action="' + adres + '" target="_top"><input type="hidden" name="sayfa" value="kod">'
      + '<input type="hidden" name="kaynak" value="' + kn + '"><input type="hidden" name="k" value="' + KESTIRME_ANAHTAR + '">'
      + '<input name="kod" inputmode="numeric" autocomplete="one-time-code" style="font-size:28px;width:160px;padding:8px" autofocus> '
      + '<button style="font-size:22px;padding:8px 16px">Gönder</button></form></div>').setTitle('SMS kodu');
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
  // Tokenflex teşhis (08.10 'Un_Authorized_User_For_This_Merchant'): giriş yanıtı (anahtar gizli) + kayıtlı işyeri no
  if (g.tur === 'tokenflexTani') {
    try {
      var p = PropertiesService.getScriptProperties();
      if (g.gonder !== true) return jsonYanit_({ ok: true, isyeriOzellik: p.getProperty('TOKENFLEX_ISYERI') || '(yok → 320096)', smsBekleme: p.getProperty('TOKENFLEX_2FA') || '' });
      var d = tfIstek_('Authentication/Login', { username: p.getProperty('TOKENFLEX_KULLANICI'), password: p.getProperty('TOKENFLEX_SIFRE'), rememberMe: false }) || {};
      var gizle = function (o) { return JSON.parse(JSON.stringify(o, function (k, v) { return /token/i.test(k) && typeof v === 'string' ? v.slice(0, 6) + '…' : v; })); };
      return jsonYanit_({ ok: true, isyeriOzellik: p.getProperty('TOKENFLEX_ISYERI') || '(yok → 320096)', giris: gizle(d) });
    } catch (err) { return jsonYanit_({ hata: String(err && err.message || err) }); }
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
