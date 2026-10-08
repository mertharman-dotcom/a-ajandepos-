---
name: kurye-bordro
description: Kurye haftalık bordrosu, hakediş, mesai/mesai düzeltme, kesinti, bahşiş, avans, eksik/ek ödeme, kurye açık hesabı (kapatma, kuryeden kesme, gecikme) ve Haddy/finans ödeme dosyaları ile ilgili her hata, soru veya değişiklikte kullan. Yemek kartı çekimiyle açık hesap eşleşmesi için yemek-karti becerisine de bak.
---

# Kurye bordrosu ve açık hesap

Veri sahipliği: `docs/veri-sozlugu.md` (KURYE tablosu, `Kesintiler`, `Tahsilatlar`). Açık işler: `docs/kontrol-listesi.md`
› P5, P16, P55, **P57–P60**, R6/R12 (Trendyol iade kesintisi), D15. Satır numarası yerine fonksiyon adıyla ara.

| Kısaltma | Yer |
|---|---|
| VK | `apps-script/bap-panel-veri-kapisi/Kod.gs` (panelin hesabı ve kayıtları) |
| KN | `apps-script/kurye-net-calisma-suresi/` (KURYE tablosuna bağlı proje: sipariş, mesai, kural, tablo bordrosu) |
| PG / WK | `bap-panel/page.html` / `bap-panel/worker.template.js` |

## Hafta ve gün
- Bordro haftası **Pazartesi–Pazar**. VK `kurye_()` son 8 haftayı tutar; KN `haftaEtiketi` "41. Hafta (06.10 - 12.10)".
- İş günü 03:00–02:59 (KN `GUN_BAS=3`).

## Bordro hesabı (iki yerde — P60)
- **Panel (VK `kurye_()` → `out.bordro`):** `net = saat ücreti + paket ücreti − TL kesinti` → `kdv = net × oran` (yalnız Haddy %20)
  → `toplam = net + kdv + artı ödemeler − avans`. Ücretler: `kuryeUcretOku_` ('Kurye bilgiler'), yedek `KURYE_UCRET`.
- **Tablo (KN `bordroCiz` → 'Haftalık Bordro & Hakediş'):** aynı formül ama net `max(0, …)`. Farkı kapatmadan birini değiştirme.
- Mesai: 'Günlük Mesai' (KN `kuraliUygula` erken/kapanış kesintisi dk). Düzeltme: VK `mesaiDuzelt_` → 'Mesai Düzeltme'
  → `kuralYenile_` KN köprüsüne `{tur:'kural'}` gönderir.

## Kesintiler sekmesi (tek kalem defteri)
Başlıklar: `Tarih | Kurye Adı | Kesinti Tipi | Kesilen Süre (Dk) | Kesilen Tutar (TL) | Açıklama`. Tutar **hep pozitif**; yön türden gelir
(`kesintiYonu_` VK, ikizi `kesintiYonu` KN — ikisi birlikte değişir):
`İPTAL (…)` yok sayılır · `Avans` KDV'den sonra düşer · `Bahşiş` / `Eksik Ödeme` / `Ek Ödeme` KDV'den sonra eklenir · `Saat` dakika düşer · `TL` ve diğerleri KDV'den önce para düşer.
- Yazanlar: panel `kesintiGir_` (`istekNo` ile çift kayıt engeli, aynı gün+kurye+tür+tutar için onay, ≤62 gün geçmiş, açıklama zorunlu),
  `hesapKapat_` ('kes' ve bahşiş), Trendyol `iadeKesintileriIsle` (`[TY iade …]` etiketi, 3 gün benzer kayıt koruması).
- İptal: `kesintiIptal_` satırı silmez, türü `İPTAL (<eski>)` yapar ve açıklamaya damga ekler.
- Açık hesap kesintisi Kesintiler'de yalnız açıklamadaki **"Açık hesap:"** önekinden tanınır (PG `/^açık hesap/i`). Önek değişmez.

## Açık hesap
- Oluşur: KN `_satir` (Hemenyolda) → 'Siparişler' `Hesap = AÇIK` (ödeme alınmamış ve online değil). `guncelle` 15 dk'da bir; 'Açık Hesaplar' anlık görüntü.
- Panel listesi: VK `acikListe_` (Siparişler + eski 'Açık Hesaplar', Tahsilatlar'da olanlar düşer, `Ödenmez` ayrı, `yas` = gün).
  Kanıt: `acikKanit_` (Adisyo 'Ödeme Alındı' + kart çekimi → `yemek-karti` becerisi).
- Kapanır: VK `hesapKapat_` → 'Tahsilatlar' (`TAHSILAT_BASLIK`; İşlem 'Tahsil edildi' | 'Kuryeden kesildi', Kaynak). 'kes' ayrıca
  Kesintiler'e `TL` satırı yazar — **tarihi kapatma günü** (o haftanın bordrosuna girer). Sonra `tahsilatlariAdisyoyaIsle_` Adisyo'ya işler (kilit dışında, P55).
- Bugün: Tahsilatlar satırı silinirse hesap yeniden açılır. Yeni kod satır silmez; geri alma = yeni satır / durum (CLAUDE.md kural 4).

## Sahibin kararları (08.10) — uygulanırken bu kurallar esastır
1. **P57 — Otomatik kesinti:** 3 günden eski ve hâlâ açık kurye hesabı, o haftanın bordrosu kapanırken kendiliğinden kuryeden kesilir;
   sahibi elle "kes" demez. Kesmeden önce kart ajanı ve Adisyo kanıtı çalışmış olmalı (kartla ödenmiş hesap kesilmez).
2. **P58 — Kart ajanı kapatır:** kart verisi doğru kuryeyle eşleştiğinde ('emin') açık hesap kapanır. Her kapanışta hangi kurye, hangi
   hesap, hangi çekim (kart, zaman, tutar, işlem no) saklanır ve panelde listelenir; yanlışsa panelden geri alınır.
3. **P59 — Haftalık kurye farkları:** her kurye için o haftanın siparişle tutmayan çekimleri gösterilir (600 TL sipariş / 60 TL çekim gibi),
   siparişsiz çekim ve çekimsiz sipariş de. Kaynak `ykKontrol_` mantığı; kurye × hafta görünümü.
Uygulama sırası her hafta: kart ajanı → Adisyo kanıtı → (kalanlar) otomatik kesinti. Her biri önce KURU rapor, sahibi onaylayınca canlı.

## Panel ve dosyalar
PG `kuryeBordro` (bordro), `kuryeKesinti` (form + listeler), `kuryeAcik` (açık hesap; yaş rozeti >3 gün dikkat, >30 kötü), `kartAjanBlok`.
`kuryeBordroEk`: `Kurye_Odeme_<hafta>.csv` (finans: yalnız ödenecek tutar, BAP/Haddy ayrı) ve `Haddy_Kurye_<…>.csv` (özet, gün gün mesai, kalem gerekçeleri).
`ekGizli`: bazı kuryelerin ek ödemesi ekranda gizli ama toplama dahil (sahibin isteği).

## Zamanlayıcılar
KN `guncelle` 15 dk (03:00–09:59 sessiz) · VK `puantajTaramasi` saatlik (içinde `kartAjani`) · VK `kuryeBoslariDoldur` saatlik · Trendyol `iadeleriCek` 10 dk.

## Tuzaklar
- Bordro sayısı değişiyorsa hem panel hem tablo hesabını kontrol et (P60); Haddy dosyası finansa gider — tutar farkı gerçek para farkıdır.
- Kesinti türü eklerken `KESINTI_TURLERI` (VK) ve PG'deki listesi ile `kesintiYonu_` / `kesintiYonu` dördü birlikte güncellenir.
- Panel kayıtları tek kilidi paylaşır; kilit içinde uzun okuma yapma (P55).
