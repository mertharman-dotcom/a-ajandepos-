# MacBook köprüsü (`~/bap-kopru`) — depodaki kopyalar

MacBook'ta çalışan Node programlarının depodaki asılları. Değişiklik önce burada yapılır, sonra Mac'e kopyalanır.
Ayarlar ve şifreler (`ayar.json`) depoya **girmez**.

| Dosya | Ne | Zamanlayıcı |
|---|---|---|
| `edenred.mjs` | Edenred terminal bazlı işlem listesi (gerçek Chrome + playwright-core; giriş telefon + VKN + SMS) | henüz yok (deneme aşaması) |
| `pluxee.mjs` | Pluxee gün sonu raporu | `com.bap.pluxee` 12:00 ve 23:50 — **depoya henüz alınmadı** |
| `topla.mjs` | HemenYolda kurye verisi | `com.bap.kopru` 10 dk'da bir — **depoya henüz alınmadı** |

Edenred kurulumu: `npm i playwright-core@1.54` (`~/bap-kopru` içinde), `ayar.json › edenred { telefon, vkn, geriGun }`.
