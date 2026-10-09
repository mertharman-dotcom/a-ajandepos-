---
name: is-teslim
description: BAP deposunda kod ya da belge değiştiren bir işi bitirirken (commit, push, pull request açmadan önce) kullan. Testleri, etki haritası güncellemesini, kontrol listesi numarasını, canlı-depo ayrışmasını ve sahibe yazılacak "senin yapman gereken" özetini sırayla kontrol eder.
---

# İşi teslim etme

Bir konu = bir oturum = bir PR. Aynı konunun düzeltmeleri aynı dalda toplanır; konu bitmeden yeni PR açılmaz.

## 1. Kontroller (hepsi temiz olmadan push yok)

```bash
# Değişen .gs/.js dosyalarında yazım hatası (Apps Script = JavaScript)
for f in $(git diff --name-only origin/main -- '*.gs' '*.js' '*.mjs'); do
  [ -f "$f" ] || continue; t=$(mktemp --suffix=.js); cp "$f" "$t"; node --check "$t" || echo "HATA: $f"; rm "$t"; done
node tests/satis-motoru-testi.js "apps-script/stok-takip-sistemi/Satıs Motoru.gs"
node tests/veri-kapisi-maliyet-testi.js
node tests/veri-kapisi-direkt-satis-testi.js
node tests/kart-ajani-parcali-testi.js
node bap-panel/build.js          # bap-panel/ değiştiyse; üretilen worker.js de commit'e girer
```
Değiştirdiğin hesaplamaya test yoksa ekle (`tests/` kalıbı: `vm` ile .gs yüklenir, sahte sekme verilir).
Veriye yazan yeni kod `KURU = true` ile gelir; uygulamayı sahibi onaylar (CLAUDE.md kural 4).

## 2. Etki haritası (kod değiştiyse)
- `node araclar/etki-haritasi.mjs` → `docs/etki-haritasi.md/.json/.html` yeniden üretilir, **aynı commit'e** girer.
  `node araclar/etki-haritasi.mjs --kontrol` hatasız bitmeli.
- Sekme, sütun başlığı, liste ya da ortak fonksiyon adı/yapısı değiştiyse: `node araclar/etki-haritasi.mjs ara "<ad>"`
  çıktısındaki yazan/okuyan kodlar ve onları çalıştıran zamanlayıcı/panel PR açıklamasına ve sahibe yazılır
  ("bu sütunun adı değişti → şu üç kod ve mutfak panelinin sipariş ekranı etkilenir").
- `docs/etki-haritasi.html` değiştiyse görsel sayfa yeniden yayınlanır (Artifact,
  `https://claude.ai/artifact/8S5NzS4c53PUvVVHu7sKRK` — önce `read`, sonra aynı adrese publish).
- Araç henüz depoda yoksa (`araclar/` yok) bu adım atlanır ve PR'da söylenir.

## 3. Kontrol listesi (`docs/kontrol-listesi.md`)
- Yeni sorun = yeni kimlik. Numara **`main`'e göre** seçilir; açık PR'lar da taranır (P28→P33, P51→P53 çakışmaları oldu):
  ```bash
  git fetch -q origin main
  git show origin/main:docs/kontrol-listesi.md | grep -oE '^\| P[0-9]+' | sort -t P -k2 -n | tail -1
  ```
  Açık PR'larda da aynı ön ek kullanılıyorsa (GitHub'da açık PR dosyalarına bak) bir sonraki boş numarayı al.
- Çözülen satır işaretlenir: `☑ GG.AA` + ne yapıldı; canlıda doğrulanmadıysa `◐ … · ☐ canlıda doğrula`.
- Tablo sütun sayısını koru (her bölümün başlığına bak).

## 4. Canlı ↔ depo
- `main`'e birleşen `apps-script/<proje>/` canlıya gider ve canlıda olup depoda olmayan dosyaya rastlarsa **durur** (Y8).
  Proje canlıda elle değiştirilmiş olabilirse (sahibi editörde bir şey eklediyse) önce GitHub › Actions ›
  `Apps Script'i Depoya Çek` çalıştırılır, çıkan dal birleştirilir, sonra iş yapılır.
- Yeni web dağıtımı / yeni proje: `apps-script/projeler.json` güncellenir.

## 5. Commit, push, PR
- Commit mesajı Türkçe ve ne değiştiğini söyler; kontrol listesi kimliği parantez içinde (`… (P56)`).
- Kendi dalına push; `main`'e doğrudan yazma. PR açıklaması: **Ne yapıyor**, **Etki** (2. adım), **Kontrol** (1. adım çıktısı),
  **Senin yapman gereken**.

## 6. Sahibe son mesaj (Türkçe, sade)
1. Ne değişti — tek cümle, teknik terim yok.
2. **Senin yapman gereken:** PR'ı birleştir (link) ve varsa elle adımlar (Komut dosyası özelliği, tetikleyici, Mac'e dosya kopyalama).
3. **Telefondan dene:** hangi ekranda, neye basınca ne görmeli; yanlışsa ne yapmalı.
4. KURU çalışan iş varsa: raporun nerede çıkacağı ve onay için ne yazacağı.
