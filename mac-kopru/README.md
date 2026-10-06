# MacBook köprüsü (`~/bap-kopru`) — depodaki kopyalar

MacBook'ta çalışan Node programlarının depodaki asılları. Değişiklik önce burada yapılır, sonra Mac'e kopyalanır.
Ayarlar ve şifreler (`ayar.json`) depoya **girmez**.

| Dosya | Ne | Zamanlayıcı |
|---|---|---|
| `edenred.mjs` | Edenred terminal bazlı işlem listesi (gerçek Chrome + playwright-core; giriş telefon + VKN + SMS). Kod: iPhone Kestirmeler → kurye köprüsü `kodYaz` (kaynak `edenred`); sonuç → kurye köprüsü `tur:'edenred'` → KURYE › Edenred | `com.bap.edenred` 00:40 ve 12:10 (`com.bap.edenred.plist`) |
| `multinet.mjs` | Multinet (multiavantaj.com.tr) işlemleri + faturaları (gerçek Chrome; giriş VKN + telefon + SMS, kod iPhone Kestirmeler → BAP Yemek Kartı kod kutusu `kaynak: multinet`). Sonuç → `tur:'multinet'` / `'multinetFatura'` → YEMEKKARTI › Multinet, Multinet Fatura | `com.bap.multinet` 00:45 ve 12:15 |
| `metropol.mjs` | Metropol Card POS işlem detayı, terminal terminal (gerçek Chrome; giriş telefon + şifre + reCAPTCHA, oturum `metropol-profil`'de kalır). Kullanıcı listesinden terminal → kurye adı. Sonuç → BAP Yemek Kartı `tur:'metropol'` → YEMEKKARTI › Metropol | `com.bap.metropol` 00:55, 12:25, 18:25 |
| `pluxee.mjs` | Pluxee gün sonu raporu | `com.bap.pluxee` 12:00 ve 23:50 — **depoya henüz alınmadı** |
| `topla.mjs` | HemenYolda kurye verisi | `com.bap.kopru` 10 dk'da bir (04.10 depoya alındı; plan isteği satırı maskeden yeniden yazıldı, Mac'tekiyle karşılaştırılmalı) |

Edenred kurulumu: `npm i playwright-core@1.54` (`~/bap-kopru` içinde), `ayar.json › edenred { telefon, vkn, geriGun }`.

| `com.bap.uyanik.plist` | Mac fişteyken uyumasın (`caffeinate -s -i`, KeepAlive) — 04.10 duruşunun sebebi uykuydu (P12) | açılışta |

Metropol kurulumu: `ayar.json › ykWebapp` (BAP Yemek Kartı web adresi) ve `ayar.json › metropol { telefon, sifre, isyeri: "0000068645", geriGun: 7 }`. İlk çalıştırmada "robot değilim" çıkarsa Chrome penceresinde işaretlenir.

Multinet kurulumu: `ayar.json › multinet { vkn: "45289231790", telefon, geriGun: 7 }`. iPhone Kestirmeler'de Multinet SMS'i için Edenred'deki gibi bir kural (kaynak `multinet`).
