# bap-veri — veritabanı çekirdeği (Faz 1 taslağı)

**Canlıya kurulmadı.** Plan: Claude Docs "BAP Veri Sistemi Yeniden Yapılanma Planı".

| Dosya | Ne |
|---|---|
| `sema.sql` | Faz 1 tabloları (Cloudflare D1 / SQLite). İşlem ve hareket satırları değiştirilemez, silinemez. |
| `src/cekirdek.mjs` | Kayıt mantığı: aynı kimlik tek kayıt, hepsi-ya-hiçbiri, reçete sürümü, 05:00 işletme günü, geç giriş sebebi, yetki. |
| `istemci/kuyruk.js` | Panelin kayıt kuyruğu: telefonda bekliyor / sunucuya kaydedildi / hata. |
| `aktarim/Veritabani Aktarim.js` | Veritabanı → Sheets aktarımı; `stok-takip-sistemi` projesine, Satış Motoru'yla aynı kilitle kurulacak. |
| `test/` | `npm test` — 12 test (mükerrer, yarım işlem, eşzamanlı, bağlantı kesintisi, aktarım hatası, geri dönüş …). |

Testler Node 22'nin yerleşik SQLite'ı ile Cloudflare D1 davranışını taklit eder; gerçek D1'de ayrıca denenecek.
