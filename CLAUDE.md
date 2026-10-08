# BAP — çalışma kuralları

BAP Pizza (Erenköy + Fikirtepe; pizza, makarna, salata; satışın ~%80'i paket servis) için
stok, maliyet, satın alma, personel ve panel kodları. Sahibi teknik değil: açıklamalar Türkçe,
sade ve "senin yapman gereken" adımlarıyla yazılır.

## Temel kurallar

1. **Bu depo tek doğru kaynaktır.** Kod yalnızca burada değiştirilir. Apps Script editöründe veya
   Cloudflare panelinde elle değişiklik yapılmaz; yapılırsa bir sonraki yayın onu ezer.
   Canlıyla depo ayrışmış olabilir diye şüpheleniliyorsa önce `Apps Script'i Depoya Çek` iş akışı çalıştırılır.
2. **Ana dal `main`.** Her oturum kendi dalında çalışır, iş bitince `main`'e birleştirilir.
   Canlıya yayın yalnızca `main`'den yapılır (`.github/workflows/`): `main`'e gelen `bap-panel/`, `bap-sistem/`
   ve `apps-script/<proje>/` değişiklikleri kendiliğinden yayınlanır (yalnız değişen proje). Sahibin elle yapıştırması gerekmez.
3. **Her bilginin tek bir sahibi vardır** → `docs/veri-sozlugu.md`. Yeni bir sekme, eşleştirme
   tablosu veya ürün listesi açmadan önce oraya bakılır; aynı bilgi ikinci bir yerde tutulmaz.
4. **Veriye yazan her yeni fonksiyon önce kuru çalışır** (`KURU = true` → rapor), sahibi onaylayınca uygular.
   Satır silen kod yazılmaz; pasife alma (ör. `Tedarikçi Sipariş Aktif` kutusu) tercih edilir.
5. **Ortak yardımcılar kullanılır.** İsim eşleştirme, sayı okuma, birim çevirme, sekmeyi başlıktan bulma
   her dosyada yeniden yazılmaz (`apps-script/stok-takip-sistemi/Ortak.gs` — kurulacak).
   Tablolar sütun numarasıyla değil **başlık adıyla** okunur.
6. **Kayıt (POST) istekleri otomatik tekrar denenmez**; çift kayıt riski vardır.
7. Bulunan her sorun `docs/kontrol-listesi.md`'ye kimliğiyle (ör. `S1`) yazılır, çözülünce işaretlenir.

## Klasörler

| Klasör | Ne | Nerede çalışır |
|---|---|---|
| `apps-script/<proje>/` | Apps Script projeleri | Google Apps Script — kimlikler `apps-script/projeler.json` |
| `bap-sistem/` | Mutfak paneli (tek sayfa); arka ucu `apps-script/bap-panel-backend` | Cloudflare Pages › bap-sistem → bap-sistem.pages.dev |
| `bap-panel/` | Yönetim paneli (`page.html` + `worker.template.js` → `node build.js` → `worker.js`) | Cloudflare Worker › bap-panel |
| `docs/` | Veri sözlüğü, kontrol listesi, ajan talimatları | — |

## Beceriler (`.claude/skills/`)

Konuya girince ilgili beceri okunur: `yemek-karti`, `kurye-bordro`, `panel-ozelligi`; her işin sonunda `is-teslim`.
Beceriler yol haritasıdır; bilginin sahibi yine `docs/` ve koddur (kural 3).
