# MacBook köprüsü (`~/bap-kopru`) — depodaki kopyalar

MacBook'ta çalışan Node programlarının depodaki asılları. Değişiklik önce burada yapılır, sonra Mac'e kopyalanır.
Ayarlar ve şifreler (`ayar.json`) depoya **girmez**.

| Dosya | Ne | Zamanlayıcı |
|---|---|---|
| `edenred.mjs` | Edenred terminal bazlı işlem listesi (gerçek Chrome + playwright-core; giriş telefon + VKN + SMS). Kod: iPhone Kestirmeler → kurye köprüsü `kodYaz` (kaynak `edenred`); sonuç → kurye köprüsü `tur:'edenred'` → KURYE › Edenred | `com.bap.edenred` 00:40 ve 12:10 (`com.bap.edenred.plist`) |
| `pluxee.mjs` | Pluxee gün sonu raporu | `com.bap.pluxee` 12:00 ve 23:50 — **depoya henüz alınmadı** |
| `topla.mjs` | HemenYolda kurye verisi | `com.bap.kopru` 10 dk'da bir (04.10 depoya alındı; plan isteği satırı maskeden yeniden yazıldı, Mac'tekiyle karşılaştırılmalı) |

Edenred kurulumu: `npm i playwright-core@1.54` (`~/bap-kopru` içinde), `ayar.json › edenred { telefon, vkn, geriGun }`.

| `com.bap.uyanik.plist` | Mac fişteyken uyumasın (`caffeinate -s -i`, KeepAlive) — 04.10 duruşunun sebebi uykuydu (P12) | açılışta |
