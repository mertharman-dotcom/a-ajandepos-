# Trendyol Go API — ne çekiyoruz, ne çekebiliriz

Kod: `apps-script/trendyol-veri-cekme/` · Tablo: **Trendyol Yorumlar**
(`1KLWCEBwFMHCTrTnCYLhv2ctg5PvGtS9DNzoMXF-Z1JE`). Dört mağaza: BAP Pizza Erenköy / Fikirtepe,
BAP Salad & Pasta Erenköy / Fikirtepe. Hepsi `https://api.tgoapis.com/integrator/...` adresine Basic
kimlikle gider.

## Şu an çekilenler

| Servis | Adres (kısaltılmış) | Kod | Sekme | Ne zaman |
|---|---|---|---|---|
| Yorum ve puanlar | `GET review/.../reviews/filter` | `Trendyol.gs › yorumlariCek` | Degerlendirmeler, Özet | Her gece 04:15 (son 10 gün) |
| Genel puan ortalaması | `GET review/.../reviews/stats` | `Puanlama Takip.gs › resmiPuanKaydet_` | Puan resmi sekmesi | Her gece 23:45 |
| Menü (ürün, açıklama, fiyat) | `GET product/.../products` | `Trendyol Menü Cekme.gs › menuCek` | Menu_Ham, Menu_Sorun, Menu_Fark | Her gece 03:30 |
| Fiyat güncelleme | `product/...` (gönderim + batch kontrol) | `Trendyol Fiyat Güncelleme.gs` | Fiyat sekmesi + log | Elle |
| Günlük puan raporu + yarın tahmini | (yorum + puan verisi, SATIS) | `Trendyol Gunluk Rapor.gs › gunlukPuanRaporu` | Puan_Siparis, Puan_Tahmin | Her gece ~23:50 |
| İadeler (yalnız okur, bildirir) | `GET claim/meal/suppliers/{supplierId}/claims` | `Trendyol Gunluk Rapor.gs › iadeleriCek` | Iadeler | 10 dk'da bir |
| İade özeti (ay × sorumlu, mutfak zararı, kurye bazında) | — | `Trendyol Gunluk Rapor.gs › iadeOzetiYenile` | Iade_Ozet | gunlukPuanRaporu ile her gece |
| Yorum cevapları (taslak → onay → gönder) | `GET reviews/filter` + `POST .../reviews/{reviewId}/answer` + Claude API | `Trendyol Yorum Cevap.gs › yorumCevapCalistir` | Yorum_Cevap (+ telafi sözü → Telafi_Listesi) | 15 dk'da bir |
| İadeyi kuryeden düş | — (Kurye › Kesintiler'e yazar) | `Trendyol Gunluk Rapor.gs › iadeKesintileriIsle` | Iadeler (Kuryeden Düş / Düşülecek TL / Kesinti Durumu) | iadeleriCek ile 10 dk'da bir |
| Sabah özeti (e-posta + Make) | — | `Trendyol Gunluk Rapor.gs › sabahOzeti` | — | Her sabah ~10:45 |

## Yol haritası (sahibin 03.10 istekleri)

| # | İstek | Ne var | Ne eklenecek | Yazar mı? | Aşama |
|---|---|---|---|---|---|
| TY-1 | Günlük puan + düne göre değişim + puanın sipariş sayısına etkisi | `Puan_Resmi` (Trendyol'un gösterdiği puan, her gece), `Puan_Gunluk` (90/30 günlük ortalama) | "Değişim" sütunu; şube × gün Trendyol sipariş adedi (SATIS'tan) yan yana; haftanın günü etkisinden arındırılmış karşılaştırma; panelde grafik | Hayır | 1 ☑ kod yazıldı |
| TY-2 | Yarın puan tahmini (90 günden düşecek yorumlar) | 90 günlük kayan ortalama hesabı var | Yarın pencereden çıkacak yorumlar → "yeni yorum gelmezse yarın puan X"; "4,8'e çıkmak için kaç 5 yıldız gerekir". Trendyol kuralı `Puan_Resmi` ile ayarlanır | Hayır | 1 ☑ kod yazıldı |
| TY-3 | Uber Eats geçişi / 403 uyarısı (R2) | Sadece log | 401/403 gelince günde bir bildirim | Hayır | 1 ☑ kod yazıldı |
| TY-4 | Menü tutarlılığı + onayla düzeltme | `Menu_Sorun`, `Menu_Fark`, `Fiyat_Guncelle` (onaylı fiyat gönderimi) | GENEL › Menü ile fiyat/ürün farkı; açıklama ↔ reçete (Tbl_Receteler) içerik farkı; kategori uyumu; boy/fiyat merdiveni. İsim/açıklama/kategori güncelleme API'si belgeden doğrulanacak | Onaylı | 2 |
| TY-5 | Yorumlara cevap: taslak → onay → gönder | Yorumlar çekiliyor | Taslak cevap (yapay zekâ), onay kutusu, `POST .../answer`; ret nedenleri (`rejectedReason`) izlenir | Onaylı | 2 |
| TY-6 | İade: bildirim + sebep analizi + onay/ret önerisi | — | 5-10 dk'da bir iade çekme; sipariş, kurye, teslim süresi, müşteri geçmişi, önceki puanlarla birlikte öneri; karar sahipte, `PUT claimAccept/Reject` | Onaylı | okuma + bildirim + kural tabanlı öneri ☑ kod yazıldı (1); kabul/ret 3 |
| TY-7 | Yoğunluğa göre otomatik teslimat süresi (önce mağaza geneli, sonra bölge bazında) | Adisyo siparişleri 5 dk'da bir geliyor (sipariş, çıkış, teslim zamanı, mahalle, kurye) | Son 45-60 dk'nın gerçek teslim süresi → süre basamağı (ör. 20-25 / 25-30 / 35-40); iniş-çıkış titreşimini önleyen eşik; en az/en çok sınırı. Önce 1 hafta yalnızca öneri (kuru), sonra otomatik | Otomatik (sınırlı) | 4 |

**Kurulum (TY-1, TY-2, TY-3, TY-6'nın okuma kısmı):** yayından sonra Apps Script'te bir kez
`raporTetikleyiciKur()` çalıştırılır. Trendyol'a hiçbir şey yazılmaz.

## TY-5 Yorum cevapları — tasarım (sahiple konuşuldu, 05.10; kod: `Trendyol Yorum Cevap.gs`)

Sahip kararları: imza yok; telafi sözü yalnızca sorun bizden kaynaklıysa ve tutar yazmadan. Model `claude-opus-5-5`,
effort `low`, `fallbacks: "default"`; anahtar Script Properties › `CLAUDE_API_KEY`.

1. **Toplama:** `yorumlariCek` zaten çekiyor. Yorum metni olan ve restoran cevabı olmayan
   (`hasComment=true`, `hasRestaurantAnswer=false`) yorumlar `Yorum_Cevap` sekmesine düşer.
2. **Taslak:** yapay zekâ (Claude API) her yoruma taslak yazar. Girdi: yorum, puanlar (lezzet/servis/teslimat),
   ürünler, Adisyo'dan kurye ve teslim süresi, müşterinin önceki puanları. Kurallar: Türkçe, kısa, ürün adını
   anar; düşük puanda özür + ne yapıldığı; Trendyol ret nedenlerinden kaçınır (müşteriyi suçlama, tartışma,
   başka platform/indirim/telefon yazma, kişisel bilgi). Para/telafi sözü yalnızca sahip isterse.
3. **Onay:** sahip sekmede (telefondan Google E-Tablolar) taslağı okur, gerekirse düzeltir, "Onay" kutusunu
   işaretler. Sabah özetinde "X yorum cevap bekliyor" yazar.
4. **Gönderim:** 10 dk'da bir onaylılar `POST .../reviews/{reviewId}/answer` ile **bir kez** gönderilir
   (otomatik tekrar yok, kural 6); Durum = GÖNDERİLDİ. Sonra Trendyol'un onay/ret sonucu (`restaurantAnswer.status`,
   `rejectedReason`) okunup yazılır; reddedilen taslaklar kurallara eklenir.
5. **Sonra (güven oluşunca):** 5★ ve kısa övgü yorumları için otomatik onay seçeneği.

## Servis notları (sahibin yapıştırdığı belgelerden, 03.10)

**Teslimat süresi** — `PUT store/meal/suppliers/{supplierId}/stores/{storeId}/average-delivery-time`,
gövde `{"min": 40, "max": 50}`. Yalnızca kendi kuryesiyle çalışan (Model 1) mağazalar. **Mağazanın
tüm bölgeleri** için geçer. 5'in katı; max 20–90, min 15–85, min < max.

**Teslimat bölgeleri** — `GET`/`PUT .../stores/{storeId}/delivery-areas`. Her bölge: `averageDeliveryTime
{min,max}`, `coordinates` (MULTIPOLYGON), `minBasketPrice`, `status` (AVAILABLE/UNAVAILABLE),
`deliveryFeeType` (FREE/FIXED/BASKET_BASED_DELIVERY), `deliveryFees[]`. PUT **bütün bölge listesini**
yeniden gönderir: bölge bazında süre değiştirmek = önce GET, yalnızca o bölgenin süresini değiştir,
hepsini geri PUT. Yanlış giderse harita bozulur → önce GET yedeği alınır. Süre servisi ile bölge
servisindeki süreler aynı tutulmalı, yoksa sonraki gönderilen geçerli olur.

**İadeler** — `GET claim/meal/suppliers/{supplierId}/claims` (createdStartDate/EndDate, page, size,
storeId, orderNumber, itemStatuses). Durumlar: `WaitingInAction` (**4 saat içinde karar**),
`Unresolved` (reddedildi, Trendyol inceliyor), `Accepted`, `Rejected`, `WaitingForSellerRefund`.
Kabul: `PUT .../claims/{claimId}/accept` `{"claimItemIds": [...]}`. Ret: `PUT .../claims/{claimId}/unresolve`
`{"claimItemIds": [...], "reasonId": 5000-5017, "note": "..."}`. Müşteri sebep kodları ve ret kodları
`Trendyol Gunluk Rapor.gs` içinde (`TYR_SEBEP`, öneri metinleri).

**Genel hatalar** — 401 kimlik, 403 servis kapalı (Uber Eats geçişi), 409 aynı anda iki statü
değişikliği, 429 dakikalık istek sınırı. Fiyat batch sonucu 4 saat sorgulanabilir.

**Diğer öneriler:** sabah özeti (puan, değişim, yarın tahmini, bekleyen iade/cevap); mağaza Trendyol'da
beklenmedik kapalıysa uyarı; ürün bazında lezzet puanı; kurye bazında teslimat puanı.

## Bilinen riskler

- **Uber Eats geçişi:** Trendyol Go Uber Eats'e geçen restoranlarda yorum, puan ve cevap servisleri
  `403 endpoint.not-available.error` döner. Bizim kod bu durumda yalnızca log yazıp devam ediyor —
  yani geçiş olursa yorumlar **sessizce durur**. Bkz. kontrol listesi R2.
- **Puan servisi 404:** 3'ten az değerlendirmesi olan mağaza için `stats` 404 döner; hata değildir.
- **Kimlik bilgileri kodun içinde:** Bkz. kontrol listesi R1.
