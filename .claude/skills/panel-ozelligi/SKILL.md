---
name: panel-ozelligi
description: BAP yönetim paneline (bap-panel) yeni ekran, sekme, liste, düğme ya da kayıt formu eklerken veya mevcut bir panel ekranını değiştirirken kullan. Sayfa → Worker yolu → Veri Kapısı (Apps Script) zincirini, hız ve çift kayıt kurallarını, testi ve yayını sırasıyla anlatır.
---

# Yönetim paneline özellik ekleme

Panel üç parçadır; bir özellik genelde üçüne de dokunur:

| Parça | Dosya | Ne yapar |
|---|---|---|
| Sayfa | `bap-panel/page.html` | Tek dosya; ekran, form, `fetch('/api/...')` |
| Worker | `bap-panel/worker.template.js` | Cloudflare'de çalışır; isteği doğrular, `GAS_KEY` ekleyip Veri Kapısı'na iletir |
| Veri Kapısı | `apps-script/bap-panel-veri-kapisi/Kod.gs` | Tablolardan okur (`doGet` → `paketHazirla_`), kayıt yazar (`doPost` → `d.tur`) |

`bap-panel/worker.js` elle düzenlenmez: `node bap-panel/build.js` üretir (`page.html` → `__PAGE__`).

## Sıra

0. **Etkiyi bul.** Okunacak/yazılacak sekme ve sütunlar için `node araclar/etki-haritasi.mjs ara "<sekme ya da sütun>"`
   (araç yoksa `grep`). Başka kim yazıyor/okuyorsa sahibine **önce** söyle. Bilginin sahibi `docs/veri-sozlugu.md`'de;
   yeni sekme açmadan önce oraya bak (CLAUDE.md kural 3).
1. **Okuma (ekranda gösterme):** `paketHazirlaIc_` içine `bolum_(out, '<ad>', <fn>_)` ekle, `out`'a alanı `null` ile tanımla.
   - Tablo `tabloAc_(id)`, sekme `sonSatirlar_(ss, ad, n, basliklar)` / `sekme_(ss, [adlar])` ile açılır: paket hazırlanırken
     her tablo bir kez açılır, her sekme bir kez okunur (P49). `SpreadsheetApp.openById`'yi doğrudan çağırma.
   - Sütunlar **başlık adıyla** bulunur (`kolon_`, `tamKolon_`), numarayla değil.
   - Sipariş tablosu için `siparisVerisi_(enEski, enAz)` kullan; yeniden okuma.
   - Bölüm hata verirse paket yine gelir (`out.hatalar`); ekranda bölümün yokluğunu ele al.
2. **Kayıt (panelden yazma):**
   - Sayfa: `fetch('/api/<yol>', {method:'POST', credentials:'same-origin', headers:{'content-type':'application/json','x-bap-panel':'1'}, body})`.
     Gönderirken düğme kilitlenir (`gonderiliyor`), istekte `istekNo: yeniIstekNo()` taşınır; başarıdan sonra `yukle(true)`.
     Bağlantı koparsa mesaj: "kayıt yazılmış olabilir, 'Şimdi yenile' ile kontrol et". **Otomatik tekrar deneme yok** (CLAUDE.md kural 6).
   - Worker: yeni `if (url.pathname === '/api/<yol>' && request.method === 'POST')` bloğu; `x-bap-panel` + origin kontrolü,
     her alanı tipine göre kırp (`String(...).slice(0, n)`), `{ key: env.GAS_KEY, tur: '<tur>', ... }` gönder. Yol eklemeyi unutma:
     P52'de düğme vardı, yol yoktu.
   - Veri Kapısı `doPost`: `if (d.tur === '<tur>')` → `LockService.getScriptLock().tryLock(28000)` (alamazsa `MESGUL_`),
     `try { return json_(<fn>_(d)); } catch (err) { return json_({ hata: ... }); } finally { releaseLock(); }`.
     Kilidin içinde yalnız yazma yapılır; uzun okumalar kilitten önce (P55). Aynı `istekNo` ikinci kez gelirse yeniden yazma.
   - Satır silinmez; iptal = yeni satır / durum sütunu (CLAUDE.md kural 4). Yeni toplu yazma işi önce `KURU` rapor verir.
3. **Test:** `node bap-panel/build.js` hatasız çalışmalı; ilgili `tests/*.js` testleri (veri kapısı testleri `vm` ile `Kod.gs`'i
   yükler, sahte sekme verir — yeni hesaplama fonksiyonuna aynı kalıpla test ekle). Testleri `is-teslim` becerisi listeler.
4. **Yayın:** `main`'e birleşince `bap-panel/` Cloudflare'e, `apps-script/bap-panel-veri-kapisi/` Apps Script'e kendiliğinden gider.
   Veri Kapısı'nda yeni `tur` varsa ikisi birlikte birleşmeli; yalnız sayfa gider, kapı gitmezse "bilinmeyen istek" döner.
5. **Sahibe:** hangi sekmede, hangi düğme, telefonda nasıl denenir — Türkçe, adım adım. Bitirirken `is-teslim` becerisini uygula.

## Bilinen tuzaklar
- Yazma sonrası önbellek silme kodu `panel_v1_n` anahtarını siliyor, oysa önbellek `panel_v2_` ile yazılıyor (kontrol listesi P56).
  Panel kayıttan sonra zaten `?fresh=1` istediği için ekran güncellenir; yeni kodda `panel_v2_n` kullan.
- Apps Script JSON yerine HTML hata sayfası dönerse Worker `gasHatasi()` ile anlamlı mesaja çevirir; yeni yolda da aynı `try/catch` kalıbı.
- Sayfa ~350 KB tek dosya: değişiklikten sonra `build.js` çıktısındaki karakter sayısına bak, `worker.js`'i de commit'e koy.
