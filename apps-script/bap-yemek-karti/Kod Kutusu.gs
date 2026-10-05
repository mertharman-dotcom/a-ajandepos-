/**
 * SMS doğrulama kodu kutusu (Pluxee, Edenred — kaynak adıyla ayrılır).
 * MacBook programı kodIste der (giriş SMS'i istenmeden hemen önce), iPhone Kestirmeler SMS'teki kodu kodYaz ile bırakır,
 * program kodOku ile alır. Yalnız son kodIste'den SONRA yazılan kod verilir (eski kodla giriş denenmesin).
 * kodDurum: kestirmeden en son ne geldiğini gösterir (kurulum denemesi için).
 */
function kodKutusu_(g) {
  var kaynak = String(g.kaynak || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!kaynak) return { hata: 'kaynak yok' };
  var p = PropertiesService.getScriptProperties(), kIste = 'KOD_ISTE_' + kaynak, kKod = 'KOD_' + kaynak;
  if (g.tur === 'kodIste') { p.setProperty(kIste, String(Date.now())); p.deleteProperty(kKod); return { ok: true }; }
  if (g.tur === 'kodSil') { p.deleteProperty(kKod); return { ok: true }; }
  if (g.tur === 'kodYaz') {
    // Kestirmeler "Eşleşenler"i liste/sözlük olarak da gönderebilir: içindeki ilk 4–8 haneli sayı alınır.
    var ham = typeof g.kod === 'string' ? g.kod : JSON.stringify(g.kod || ''), m = ham.match(/\d{4,8}/), kod = m ? m[0] : '';
    p.setProperty('KOD_SON_GELEN_' + kaynak, JSON.stringify({ ham: ham.slice(0, 200), zaman: Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm:ss') }));
    if (!kod) return { hata: 'geçersiz kod', gelen: ham.slice(0, 100) };
    p.setProperty(kKod, JSON.stringify({ kod: kod, zaman: Date.now() }));
    return { ok: true };
  }
  if (g.tur === 'kodDurum') return { ok: true, sonGelen: JSON.parse(p.getProperty('KOD_SON_GELEN_' + kaynak) || 'null') };
  var x = p.getProperty(kKod); if (!x) return { ok: true, kod: null };
  x = JSON.parse(x);
  if (x.zaman < Number(p.getProperty(kIste) || 0)) return { ok: true, kod: null };
  return { ok: true, kod: x.kod };
}
