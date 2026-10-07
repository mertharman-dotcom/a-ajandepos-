# Tek yazıcı + stok kuyruğu — TEST ortamı (canlı değil)

| Klasör | Ne |
|---|---|
| `oneri/` | Canlıya önerilen kod (onay bekliyor): `Stok Kuyrugu.gs` (+ e-posta uyarısı), `panel-Kod.gs` (mutfak paneli: Sube_Stok'a yazmaz, kuyruğa ekler) |
| `test-ortami/` | Yalnız test projelerine giden kapılar: deneme işlemleri, uyarıyı sekmeye yazan sürüm, sipariş/WhatsApp kapalı panel kapısı |
| `yerel/` | Saniyeler süren yerel testler (sahte tablolar): `kuyruk-test.js`, `eszamanli.js eski|yeni` |
| `build.mjs` | Test derlemesi + güvenlik denetimi (`dist/denetim.txt`): canlı kimlik, e-posta, dış istek, Drive işlemi kalırsa durur |
| `test-kimlikleri.json` | TEST dosyaları ve test projeleri |

Kurulum/güncelleme: GitHub › Actions › **TEST — Tek Yazıcı Ortamı** › Run workflow (dal: main).
Test dosyaları Drive'da `BAP TEST — Tek Yazıcı Denemesi (canlı değil)` klasöründe. Deneme kapısının anahtarı
TEST stok kopyasındaki `Test_Ayar` sekmesinde (depo herkese açık olduğu için depoda değil).

`apps-script/` altına bu klasörden hiçbir şey otomatik gitmez; canlı geçiş ayrı bir değişiklik listesiyle sahibin onayına sunulur.
