// BAP Yönetim Paneli — Cloudflare Worker (tek dosya)
//
// Cloudflare'de Settings > Variables and Secrets bölümüne şu üç ayarı girin:
//   GAS_URL        (Text)   Apps Script web uygulamasının adresi (sonu /exec ile biter)
//   GAS_KEY        (Secret) Apps Script'te anahtarOlustur ile üretilen anahtar
//   ALLOWED_EMAIL  (Text)   Panele girebilecek tek e-posta adresi
//
// Güvenlik: Cloudflare Access açık değilse ya da giriş yapan e-posta ALLOWED_EMAIL değilse
// panel hiçbir veri göstermez. Veri kapısının anahtarı tarayıcıya hiç gönderilmez.

const PAGE = __PAGE__;

const LOCKED = "<!doctype html><html lang=\"tr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><meta name=\"robots\" content=\"noindex, nofollow\"><title>BAP Yönetim Paneli</title>\n<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#E9ECEE;color:#34312D;font-family:\"Segoe UI\",system-ui,sans-serif}main{max-width:460px;padding:32px;background:#FBFAF7;border:1px solid #D9D4CB;border-radius:12px}b{font-size:28px;letter-spacing:.14em}h1{font-size:20px;margin:18px 0 6px}p{margin:0;color:#76706A;line-height:1.5}</style></head>\n<body><main><b>BAP</b><h1>Bu panele giriş kapalı</h1><p>Panel yalnızca izin verilen e-posta adresiyle, Cloudflare giriş ekranından açılır. Giriş ekranını görmediysen panelin korumasının henüz açılmadığı anlamına gelir; kurulum rehberindeki koruma adımını tamamla.</p></main></body></html>\n";

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow'
};

// Apps Script hata verdiğinde JSON yerine HTML hata sayfası döner; sayfadaki hata metnini kısaca çıkarır.
function gasHatasi(metin) {
  const t = String(metin || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  // "Sayfa bulunamadı / Drive dosyası açılamıyor": GAS_URL artık var olmayan bir dağıtımı gösteriyor.
  if (/nicht gefunden|not found|bulunamad|kann derzeit nicht ge|unable to open|açılam/i.test(t))
    return ' Apps Script adresi bulunamadı: Cloudflare\'deki GAS_URL silinmiş ya da arşivlenmiş bir dağıtımı gösteriyor. Apps Script\'te Dağıt › Dağıtımları yönet ekranındaki güncel Web uygulaması adresini (sonu /exec) GAS_URL\'ye yazın.';
  return t ? ' Google\'ın mesajı: ' + t.slice(0, 300) : '';
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

export default {
  async fetch(request, env) {
    const email = (request.headers.get('cf-access-authenticated-user-email') || '').trim().toLowerCase();
    const izinli = (env.ALLOWED_EMAIL || '').trim().toLowerCase();
    if (!izinli || email !== izinli) {
      return new Response(LOCKED, { status: 403, headers: HTML_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/data') {
      if (!env.GAS_URL || !env.GAS_KEY) {
        return json({ hata: 'Veri kapısı ayarları eksik: Cloudflare ayarlarına GAS_URL ve GAS_KEY girilmeli.' }, 500);
      }
      const hedef = new URL(env.GAS_URL);
      hedef.searchParams.set('key', env.GAS_KEY);
      if (url.searchParams.get('fresh')) hedef.searchParams.set('fresh', '1');
      try {
        const r = await fetch(hedef.toString(), { redirect: 'follow' });
        const metin = await r.text();
        let veri;
        try { veri = JSON.parse(metin); }
        catch (e) {
          return json({ hata: 'Veri kapısı beklenmeyen bir cevap verdi. Apps Script yayınında "Erişimi olanlar: Herkes" seçili mi, adres /exec ile mi bitiyor, kontrol edin.' + gasHatasi(metin) }, 502);
        }
        if (veri && veri.hata === 'yetkisiz') {
          return json({ hata: 'Veri kapısı anahtarı eşleşmiyor. Cloudflare GAS_KEY ile Apps Script anahtarı aynı olmalı.' }, 502);
        }
        return json(veri, 200);
      } catch (e) {
        return json({ hata: 'Veri kapısına ulaşılamadı. Biraz sonra yeniden deneyin.' }, 502);
      }
    }

    if (url.pathname === '/api/cevap' && request.method === 'POST') {
      // Yalnızca panelin kendisinden gelen istek kabul edilir (başka siteden gönderilemez).
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'cevap', kaynak: String(govde.kaynak || ''), no: String(govde.no || ''),
        konu: String(govde.konu || '').slice(0, 500), cevap: String(govde.cevap || '').slice(0, 1500),
        satir: String(govde.satir || ''), ad: String(govde.ad || '').slice(0, 120), alan: String(govde.alan || '').slice(0, 60) });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ hata: 'Cevap kaydedilemedi: veri kapısı beklenmeyen bir cevap verdi. Apps Script yeni sürüm olarak yayınlandı mı?' }, 502); }
      } catch (e) { return json({ hata: 'Veri kapısına ulaşılamadı; cevap kaydedilmedi.' }, 502); }
    }

    if (url.pathname === '/api/odeme' && request.method === 'POST') {
      // Toptancı ödemesi: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'odeme', istekNo: String(govde.istekNo || '').slice(0, 64),
        tedarikci: String(govde.tedarikci || '').slice(0, 200), tutar: String(govde.tutar || '').slice(0, 20),
        tarih: String(govde.tarih || '').slice(0, 10), yontem: String(govde.yontem || '').slice(0, 40),
        aciklama: String(govde.aciklama || '').slice(0, 300), onay: govde.onay === '1' ? '1' : '' });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        // Veri kapısı satırı yazıp sonra hata vermiş olabilir: "kaydedilmedi" demeyip panelden kontrol ettir.
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; ödeme kaydedilmiş olabilir.' }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; ödeme kaydedilmiş olabilir.' }, 502); }
    }

    if (url.pathname === '/api/rota' && request.method === 'POST') {
      // Canlı rota (yalnız okur): sipariş numaralarını veri kapısına iletir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const idler = (Array.isArray(govde.idler) ? govde.idler : []).slice(0, 5).map(function (x) { return String(x).replace(/\D/g, '').slice(0, 20); });
      const sube = govde.sube === 'BAP Fikirtepe' || govde.sube === 'BAP Erenköy' ? govde.sube : '';
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'rota', idler: idler, sube: sube });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ hata: 'Veri kapısı beklenmeyen bir cevap verdi.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ hata: 'Veri kapısına ulaşılamadı.' }, 502); }
    }

    if (url.pathname === '/api/kesinti' && request.method === 'POST') {
      // Kurye kesintisi: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'kesinti', istekNo: String(govde.istekNo || '').slice(0, 64),
        kurye: String(govde.kurye || '').slice(0, 60), tarih: String(govde.tarih || '').slice(0, 10), tip: govde.tip === 'Saat' ? 'Saat' : 'TL',
        miktar: String(govde.miktar || '').slice(0, 20), aciklama: String(govde.aciklama || '').slice(0, 200), onay: govde.onay === '1' ? '1' : '' });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; kesinti yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; kesinti yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }

    if (url.pathname === '/api/hesap' && request.method === 'POST') {
      // Kurye açık hesabı kapatma: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'hesap', siparisId: String(govde.siparisId || '').slice(0, 30),
        islem: govde.islem === 'kes' ? 'kes' : 'tahsil', not: String(govde.not || '').slice(0, 200) });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; kayıt yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; kayıt yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(PAGE, { headers: HTML_HEADERS });
    }
    return new Response('Bulunamadı', { status: 404 });
  }
};
