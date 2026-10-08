# BAP — yapay zekâ ajanları için kurallar (ChatGPT / Codex ve diğerleri)

Bu depoda Claude da çalışıyor. Aynı kurallar herkes için geçerli; tamamı `CLAUDE.md`'de. En önemlileri:

1. **Kod yalnızca bu depoda değiştirilir.** Apps Script editöründe, Google E-Tablolar'ın kod kısmında ya da
   Cloudflare panelinde doğrudan değişiklik yapma. `main`'e gelen her değişiklik kendiliğinden canlıya yayınlanır
   ve canlıda olup depoda olmayanı **siler** (04.10: editörde eklenen `Pluxee.gs` böyle silindi, kurye bağlantısı bozuldu).
   Yayın artık canlıda fazladan dosya görürse duruyor; o zaman `Apps Script'i Depoya Çek` çalıştırılıp çıkan dal birleştirilir.
2. **Kendi dalında çalış, pull request aç.** `main`'e doğrudan yazma. Birleştirmeyi sahibi onaylar.
3. **Önce oku:** `docs/kontrol-listesi.md` (açık işler, kimlikleriyle: S1, M7 …) ve `docs/veri-sozlugu.md` (hangi bilgi hangi
   tabloda). Aynı işi başka ajan yapıyor olabilir; kontrol listesinde "◐" olan işe dokunmadan önce sor.
4. **Tablolara yazan yeni kod önce kuru çalışır** (`KURU = true` → rapor). Satır silen kod yazılmaz.
   Tabloda elle düzeltme yaparsan eski ve yeni değeri `STOK › Fiyat_Duzeltme_28.09` gibi bir kayıt sekmesine yaz.
5. **Bulduğun her sorunu** `docs/kontrol-listesi.md`'ye yeni bir kimlikle ekle; çözünce işaretle.
6. Testler: `node tests/satis-motoru-testi.js "apps-script/stok-takip-sistemi/Satıs Motoru.gs"` ve
   `node tests/veri-kapisi-maliyet-testi.js`. Değiştirdiğin koda test ekle.
7. Sahibi teknik değil: açıklamalar Türkçe, sade ve "senin yapman gereken" adımlarıyla.
8. **Değiştirmeden önce etki haritasına bak:** bir sekme, sütun başlığı ya da ortak fonksiyon değişecekse önce
   `node araclar/etki-haritasi.mjs ara "<ad>"` çalıştır, etkilenen kodları ve panelleri sahibine söyle.
   Kodu değiştirince `node araclar/etki-haritasi.mjs` ile haritayı yenile ve commit'e ekle.
