// BAP Yönetim Paneli — Cloudflare Worker (tek dosya)
//
// Cloudflare'de Settings > Variables and Secrets bölümüne şu üç ayarı girin:
//   GAS_URL        (Text)   Apps Script web uygulamasının adresi (sonu /exec ile biter)
//   GAS_KEY        (Secret) Apps Script'te anahtarOlustur ile üretilen anahtar
//   ALLOWED_EMAIL  (Text)   Panele girebilecek tek e-posta adresi
//   ALIM_URL       (Text)   Alım & Tedarikçi ekranının arka ucu (Kolaybi Fatura Ham Veri web uygulaması, /exec);
//                           yayın iş akışı projeler.json'dan yazar
//   ALIM_KEY       (Secret, isteğe bağlı) Kolaybi projesindeki PANEL_KEY özelliğiyle aynı; yazılınca eski açık adres kapanır
//
// Güvenlik: Cloudflare Access açık değilse ya da giriş yapan e-posta ALLOWED_EMAIL değilse
// panel hiçbir veri göstermez. Veri kapısının anahtarı tarayıcıya hiç gönderilmez.

const PAGE = __PAGE__;
const ALIM_PAGE = __ALIM__;   // /alim — Alım & Tedarikçi ekranı (bap-panel/alim.html)

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
  // Betiğin kendi hatası ("… (satır 12, dosya "Kod")"): adres doğru, sorun kodda. Bunu "adres yok" sanmamak için önce bakılır.
  if (/\((satır|line|Zeile)\s*\d+/i.test(t))
    return ' Apps Script çalışırken hata verdi (adres doğru): ' + t.slice(0, 300);
  // "Sayfa bulunamadı / Drive dosyası açılamıyor": GAS_URL artık var olmayan bir dağıtımı gösteriyor.
  if (/nicht gefunden|not found|bulunamad|kann derzeit nicht ge|unable to open|açılam/i.test(t))
    return ' Apps Script adresi bulunamadı: Cloudflare\'deki GAS_URL silinmiş ya da arşivlenmiş bir dağıtımı gösteriyor. Apps Script\'te Dağıt › Dağıtımları yönet ekranındaki güncel Web uygulaması adresini (sonu /exec) GAS_URL\'ye yazın. Sonraki güncellemelerde “Yeni dağıtım” değil, mevcut dağıtımı düzenleyip “Yeni sürüm” seçin; adres böylece hiç değişmez.';
  // Google giriş sayfası: yayın "Erişimi olanlar: Herkes" değil.
  if (/sign in|oturum aç|anmelden|accounts\.google/i.test(t))
    return ' Apps Script yayını giriş istiyor: Dağıt › Dağıtımları yönet › düzenle ekranında "Erişimi olanlar: Herkes" seçin.';
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
          const neden = gasHatasi(metin);
          // Neden belliyse yalnız onu göster; değilse genel kontrol listesi.
          return json({ hata: /bulunamadı|hata verdi|giriş istiyor/.test(neden) ? neden.trim()
            : 'Veri kapısı beklenmeyen bir cevap verdi (HTTP ' + r.status + '). Apps Script yayınında "Erişimi olanlar: Herkes" seçili mi, adres /exec ile mi bitiyor, kontrol edin.' + neden }, 502);
        }
        if (veri && veri.hata === 'yetkisiz') {
          return json({ hata: 'Veri kapısı anahtarı eşleşmiyor. Cloudflare GAS_KEY ile Apps Script anahtarı aynı olmalı.' }, 502);
        }
        return json(veri, 200);
      } catch (e) {
        return json({ hata: 'Veri kapısına ulaşılamadı. Biraz sonra yeniden deneyin.' }, 502);
      }
    }

    if (url.pathname === '/api/tuketim') {
      // Satış maliyeti ekranı: seçilen tarih aralığının malzeme tüketimi ve stok durumu.
      if (!env.GAS_URL || !env.GAS_KEY) {
        return json({ hata: 'Veri kapısı ayarları eksik: Cloudflare ayarlarına GAS_URL ve GAS_KEY girilmeli.' }, 500);
      }
      const hedef = new URL(env.GAS_URL);
      hedef.searchParams.set('key', env.GAS_KEY);
      hedef.searchParams.set('tur', 'tuketim');
      hedef.searchParams.set('bas', String(url.searchParams.get('bas') || '').slice(0, 10));
      hedef.searchParams.set('bit', String(url.searchParams.get('bit') || '').slice(0, 10));
      if (url.searchParams.get('fresh')) hedef.searchParams.set('fresh', '1');
      try {
        const r = await fetch(hedef.toString(), { redirect: 'follow' });
        const metin = await r.text();
        let veri;
        try { veri = JSON.parse(metin); }
        catch (e) { return json({ hata: 'Veri kapısı beklenmeyen bir cevap verdi. Apps Script yeni sürüm olarak yayınlandı mı?' }, 502); }
        if (veri && veri.hata === 'yetkisiz') return json({ hata: 'Veri kapısı anahtarı eşleşmiyor.' }, 502);
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
        satir: String(govde.satir || ''), ad: String(govde.ad || '').slice(0, 120), alan: String(govde.alan || '').slice(0, 60),
        degistir: govde.degistir === '1' ? '1' : '' });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ hata: 'Cevap kaydedilemedi: veri kapısı beklenmeyen bir cevap verdi. Apps Script yeni sürüm olarak yayınlandı mı?' }, 502); }
      } catch (e) { return json({ hata: 'Veri kapısına ulaşılamadı; cevap kaydedilmedi.' }, 502); }
    }

    if (url.pathname === '/api/personel-ekle' && request.method === 'POST') {
      // Yeni personel: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const k = function (v, n) { return String(v == null ? '' : v).slice(0, n); };
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'personelEkle', istekNo: k(govde.istekNo, 64), ad: k(govde.ad, 80), giris: k(govde.giris, 10),
        sube: k(govde.sube, 20), departman: k(govde.departman, 60), maas: k(govde.maas, 12), sgk: k(govde.sgk, 6), telefon: k(govde.telefon, 20),
        iban: k(govde.iban, 40), onay: govde.onay === '1' ? '1' : '' });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; kayıt yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; kayıt yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }

    if (url.pathname === '/api/avans' && request.method === 'POST') {
      // Personel avans / masraf girişi: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'avans', avansTur: govde.tur === 'Masraf' ? 'Masraf' : govde.tur === 'Mahsup' ? 'Mahsup' : 'Avans',
        personel: String(govde.personel || '').slice(0, 120), kalem: String(govde.kalem || '').slice(0, 40), tutar: String(govde.tutar || '').slice(0, 12),
        tarih: String(govde.tarih || '').slice(0, 10), aciklama: String(govde.aciklama || '').slice(0, 200), onay: govde.onay === '1' ? '1' : '' });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; kayıt yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; kayıt yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }

    if (url.pathname === '/api/puantaj' && request.method === 'POST') {
      // Puantaj elle düzeltme: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'puantaj', satir: String(govde.satir || '').slice(0, 10),
        ad: String(govde.ad || '').slice(0, 120), gun: String(govde.gun || '').slice(0, 10),
        giris: String(govde.giris || '').slice(0, 8), cikis: String(govde.cikis || '').slice(0, 8), gerekce: String(govde.gerekce || '').slice(0, 200) });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; düzeltme yazılmış olabilir. Sayfayı yenileyip kontrol edin.' }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; sayfayı yenileyip kontrol edin.' }, 502); }
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

    if ((url.pathname === '/api/odeme-plani' || url.pathname === '/api/kurye-odendi') && request.method === 'POST') {
      // Toptancı ödeme planı (söz verilen tarih) ve kurye haftası 'ödendi' işareti — Yönetim Merkezi yapılacaklar listesi.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const plan = url.pathname === '/api/odeme-plani';
      const ileti = JSON.stringify(plan
        ? { key: env.GAS_KEY, tur: 'odemePlani', istekNo: String(govde.istekNo || '').slice(0, 64), islem: govde.islem === 'iptal' ? 'iptal' : 'ekle',
            id: String(govde.id || '').slice(0, 40), tedarikci: String(govde.tedarikci || '').slice(0, 200), tarih: String(govde.tarih || '').slice(0, 10),
            tutar: String(govde.tutar || '').slice(0, 20), aciklama: String(govde.aciklama || '').slice(0, 300) }
        : { key: env.GAS_KEY, tur: 'kuryeOdendi', hafta: String(govde.hafta || '').slice(0, 10), islem: govde.islem === 'geri' ? 'geri' : 'odendi',
            bap: String(govde.bap || '').slice(0, 20), haddy: String(govde.haddy || '').slice(0, 20) });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; kayıt yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; kayıt yazılmış olabilir.' }, 502); }
    }

    if (url.pathname === '/api/eslestir' && request.method === 'POST') {
      // Adisyo kurye eşleştirmesi: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const islem = ['doldur', 'duzelt', 'kalsin', 'ata'].indexOf(govde.islem) >= 0 ? govde.islem : '';
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'eslestir', islem: islem, id: String(govde.id || '').slice(0, 20), kurye: String(govde.kurye || '').slice(0, 40) });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; kayıt yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; kayıt yazılmış olabilir.' }, 502); }
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
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'rota', idler: idler, sube: sube, teslimSayisi: Math.max(0, Math.min(10, parseInt(govde.teslimSayisi, 10) || 0)) });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ hata: 'Veri kapısı beklenmeyen bir cevap verdi.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ hata: 'Veri kapısına ulaşılamadı.' }, 502); }
    }

    if (url.pathname === '/api/iade-islem' && request.method === 'POST') {
      // Trendyol iade işlemi (sorumlu / kuryeden düş / kabul / ret isteği): yalnızca panelin kendisinden gelen istek.
      // Veri kapısı yalnız Iadeler sekmesine istek yazar; Trendyol'a gönderimi Trendyol projesi bir kez yapar.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'iadeIslem', id: String(govde.id || '').slice(0, 80),
        sorumlu: String(govde.sorumlu || '').slice(0, 30), kuryeDus: govde.kuryeDus === true, tl: String(govde.tl || '').slice(0, 20),
        islem: govde.islem === 'kabul' || govde.islem === 'ret' ? govde.islem : '', kod: String(govde.kod || '').slice(0, 6),
        not: String(govde.not || '').slice(0, 400) });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; işlem yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; işlem yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }

    if (url.pathname === '/api/yorum-onay' && request.method === 'POST') {
      // Trendyol yorum cevabı onayı: yalnızca panelin kendisinden gelen istek kabul edilir.
      // Veri kapısı yalnız tabloya "Onay" yazar; Trendyol'a gönderimi Trendyol projesi bir kez yapar.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'yorumOnay', id: String(govde.id || '').slice(0, 80),
        cevap: String(govde.cevap || '').slice(0, 1200), telafi: govde.telafi === true });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; onay yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; onay yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }

    // Yemek Kartları › SetCard 'Fatura Kes' ve tüm kartlarda 'Tahsil edildi' (yönetici onayı). Tekrar denenmez (çift kayıt riski).
    if ((url.pathname === '/api/setcard-fatura' || url.pathname === '/api/fatura-tahsil') && request.method === 'POST') {
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const sc = url.pathname === '/api/setcard-fatura';
      const ileti = JSON.stringify(sc
        ? { key: env.GAS_KEY, tur: 'setcardFatura', takipNo: String(govde.takipNo || '').slice(0, 20), islem: govde.islem === 'kes' ? 'kes' : '' }
        : { key: env.GAS_KEY, tur: 'faturaTahsil', no: String(govde.no || '').slice(0, 30), kart: String(govde.kart || '').slice(0, 30), islem: govde.islem === 'geri' ? 'geri' : govde.islem === 'onay' ? 'onay' : '' });
      const ne = sc ? 'fatura kesilmiş' : 'kayıt yazılmış';
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; ' + ne + ' olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; ' + ne + ' olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }
    if (url.pathname === '/api/kesinti' && request.method === 'POST') {
      // Kurye kesintisi: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'kesinti', istekNo: String(govde.istekNo || '').slice(0, 64),
        kurye: String(govde.kurye || '').slice(0, 60), tarih: String(govde.tarih || '').slice(0, 10), tip: ['TL', 'Saat', 'Avans', 'Bahşiş', 'Eksik Ödeme', 'Ek Ödeme'].indexOf(govde.tip) >= 0 ? govde.tip : 'TL',
        miktar: String(govde.miktar || '').slice(0, 20), aciklama: String(govde.aciklama || '').slice(0, 200), onay: govde.onay === '1' ? '1' : '' });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; kesinti yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; kesinti yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }

    if (url.pathname === '/api/kesinti-iptal' && request.method === 'POST') {
      // Kesintiler satırını iptal (pasife al): yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'kesintiIptal', satir: String(govde.satir || '').slice(0, 8), gun: String(govde.gun || '').slice(0, 10),
        kurye: String(govde.kurye || '').slice(0, 60), tip: String(govde.tip || '').slice(0, 40) });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; iptal yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; iptal yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }
    if (url.pathname === '/api/mesai-duzelt' && request.method === 'POST') {
      // Mesai düzeltme: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const islem = ['sonPaket', 'saat', 'onay', 'sil'].indexOf(govde.islem) >= 0 ? govde.islem : '';
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'mesaiDuzelt', islem: islem, kurye: String(govde.kurye || '').slice(0, 60),
        tarih: String(govde.tarih || '').slice(0, 10), giris: String(govde.giris || '').slice(0, 5), cikis: String(govde.cikis || '').slice(0, 5),
        aciklama: String(govde.aciklama || '').slice(0, 200) });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; düzeltme yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; düzeltme yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }

    if (url.pathname === '/api/kokpit' && request.method === 'POST') {
      // Departman sorusuna / kararına sahibin cevabı: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const karar = ['onaylandi', 'reddedildi', 'beklet'].indexOf(govde.karar) >= 0 ? govde.karar : '';
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'kokpit', id: String(govde.id || '').slice(0, 80), karar: karar, not: String(govde.not || '').slice(0, 3000) });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; cevap yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; cevap yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }

    if (url.pathname === '/api/pano-not' && request.method === 'POST') {
      // Sahibin departman panosundaki bir işe bıraktığı not: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'panoNot', departman: String(govde.departman || '').slice(0, 60), isId: String(govde.isId || '').slice(0, 80),
        not: String(govde.not || '').slice(0, 2000), istekNo: String(govde.istekNo || '').slice(0, 60),
        karar: ['onay', 'ret'].indexOf(govde.karar) >= 0 ? govde.karar : '' });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; not yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; not yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }

    if (url.pathname === '/api/vardiya' && request.method === 'POST') {
      // Vardiya girişi: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const gunler = function (g) { return (Array.isArray(g) ? g : []).slice(0, 7).map(function (x) { return String(x || '').slice(0, 20); }); };
      const satirlar = (Array.isArray(govde.satirlar) ? govde.satirlar : []).slice(0, 80)
        .map(function (x) { return { ad: String((x && x.ad) || '').slice(0, 80), gunler: gunler(x && x.gunler) }; });
      const onceki = {};
      if (govde.onceki && typeof govde.onceki === 'object') satirlar.forEach(function (x) { if (Array.isArray(govde.onceki[x.ad])) onceki[x.ad] = gunler(govde.onceki[x.ad]); });
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'vardiya', hafta: String(govde.hafta || '').slice(0, 10), satirlar: satirlar, onceki: onceki });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; vardiya yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; vardiya yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }

    if (url.pathname === '/api/musteri' && request.method === 'POST') {
      // Tek siparişin müşteri bilgisi (yalnız okur): yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'musteri', siparisId: String(govde.siparisId || '').replace(/\D/g, '').slice(0, 20) });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ hata: 'Veri kapısı beklenmeyen bir cevap verdi.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ hata: 'Veri kapısına ulaşılamadı.' }, 502); }
    }

    if (url.pathname === '/api/hesap' && request.method === 'POST') {
      // Kurye açık hesabı kapatma: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = JSON.stringify({ key: env.GAS_KEY, tur: 'hesap', siparisId: String(govde.siparisId || '').slice(0, 30),
        islem: govde.islem === 'kes' ? 'kes' : govde.islem === 'adisyo' ? 'adisyo' : 'tahsil', not: String(govde.not || '').slice(0, 200),
        bahsis: String(govde.bahsis || '').slice(0, 10), odeme: String(govde.odeme || '').slice(0, 60) });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ileti, redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; kayıt yazılmış olabilir. Paneli yenileyip kontrol edin.' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; kayıt yazılmış olabilir. Paneli yenileyip kontrol edin.' }, 502); }
    }

    if (url.pathname === '/api/fis' && request.method === 'POST') {
      // Günlük fiş kaydı: yalnızca panelin kendisinden gelen istek kabul edilir.
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ hata: 'İzin verilmeyen istek.' }, 403);
      }
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
      const ileti = { key: env.GAS_KEY, tur: 'fis', istekNo: String(govde.istekNo || '').slice(0, 64), gun: String(govde.gun || '').slice(0, 10),
        elle: String(govde.elle || '').slice(0, 60), not: String(govde.not || '').slice(0, 300), onay: govde.onay === '1' ? '1' : '' };
      ['online', 'masa', 'paket', 'platformKk', 'adet', 'kesilen'].forEach(function (k) { ileti[k] = String(govde[k] || '0').slice(0, 20); });
      try {
        const r = await fetch(env.GAS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ileti), redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ belirsiz: true, hata: 'Veri kapısı beklenmeyen bir cevap verdi; fiş kaydedilmiş olabilir.' }, 502); }
      } catch (e) { return json({ belirsiz: true, hata: 'Veri kapısına ulaşılamadı; fiş kaydedilmiş olabilir.' }, 502); }
    }

    // ── Alım & Tedarikçi ekranı (eski bap-alim-paneli) ──
    // Veri yalnız bu ekran açılınca istenir; yönetim panelinin ana paketine eklenmez (panel yavaşlamasın).
    if (url.pathname === '/alim') {
      return new Response(ALIM_PAGE, { headers: HTML_HEADERS });
    }
    if ((url.pathname === '/api/alim/veri' || url.pathname === '/api/alim/eslestirme') && request.method === 'GET') {
      if (!env.ALIM_URL) return json({ ok: false, hata: 'ALIM_URL ayarı yok (yayın iş akışı projeler.json\'dan yazar).' }, 500);
      const hedef = new URL(env.ALIM_URL);
      hedef.searchParams.set('action', url.pathname === '/api/alim/veri' ? 'veri' : 'eslestirme');
      if (env.ALIM_KEY) hedef.searchParams.set('key', env.ALIM_KEY);
      if (url.searchParams.get('fresh')) hedef.searchParams.set('fresh', '1');
      try {
        const r = await fetch(hedef.toString(), { redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ ok: false, hata: 'Alım arka ucu beklenmeyen bir cevap verdi (HTTP ' + r.status + ').' + gasHatasi(metin) }, 502); }
      } catch (e) { return json({ ok: false, hata: 'Alım arka ucuna ulaşılamadı. Biraz sonra yeniden deneyin.' }, 502); }
    }
    if (url.pathname === '/api/alim/islem' && request.method === 'POST') {
      if (request.headers.get('x-bap-panel') !== '1' || (request.headers.get('origin') || url.origin) !== url.origin) {
        return json({ ok: false, hata: 'İzin verilmeyen istek.' }, 403);
      }
      if (!env.ALIM_URL) return json({ ok: false, hata: 'ALIM_URL ayarı yok.' }, 500);
      let govde;
      try { govde = await request.json(); } catch (e) { return json({ ok: false, hata: 'Geçersiz istek.' }, 400); }
      // Ödeme ekleme burada yok: ödemeler /api/odeme (Veri Kapısı) ile yazılır, çift kayıt korumalı.
      const IZINLI = ['subeAta', 'odemeSil', 'tedarikciKaydet', 'ozelIsaretle', 'hammaddeEkle', 'ozelUrun', 'giderEkle', 'giderSil', 'giderKategori', 'eslestirmeKaydet'];
      if (IZINLI.indexOf(govde.action) < 0) return json({ ok: false, hata: 'Bilinmeyen işlem.' }, 400);
      // Alanlar tipine göre kırpılır: metin 300, dizi 50 eleman
      const temiz = function (v) {
        if (Array.isArray(v)) return v.slice(0, 50).map(function (x) { return String(x == null ? '' : x).slice(0, 300); });
        if (typeof v === 'number' || typeof v === 'boolean') return v;
        return String(v == null ? '' : v).slice(0, 300);
      };
      const ileti = { action: govde.action };
      Object.keys(govde).forEach(function (k) { if (k !== 'action' && k !== 'key' && /^[a-zA-Z]{1,20}$/.test(k)) ileti[k] = temiz(govde[k]); });
      if (env.ALIM_KEY) ileti.key = env.ALIM_KEY;
      try {
        const r = await fetch(env.ALIM_URL, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify(ileti), redirect: 'follow' });
        const metin = await r.text();
        try { return json(JSON.parse(metin), 200); }
        catch (e) { return json({ ok: false, belirsiz: true, hata: 'Alım arka ucu beklenmeyen bir cevap verdi; işlem yapılmış olabilir, Yenile ile kontrol edin.' }, 502); }
      } catch (e) { return json({ ok: false, belirsiz: true, hata: 'Alım arka ucuna ulaşılamadı; işlem yapılmış olabilir.' }, 502); }
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(PAGE, { headers: HTML_HEADERS });
    }
    return new Response('Bulunamadı', { status: 404 });
  }
};