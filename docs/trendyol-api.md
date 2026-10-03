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

## Yol haritası (sahibin 03.10 istekleri)

| # | İstek | Ne var | Ne eklenecek | Yazar mı? | Aşama |
|---|---|---|---|---|---|
| TY-1 | Günlük puan + düne göre değişim + puanın sipariş sayısına etkisi | `Puan_Resmi` (Trendyol'un gösterdiği puan, her gece), `Puan_Gunluk` (90/30 günlük ortalama) | "Değişim" sütunu; şube × gün Trendyol sipariş adedi (SATIS'tan) yan yana; haftanın günü etkisinden arındırılmış karşılaştırma; panelde grafik | Hayır | 1 |
| TY-2 | Yarın puan tahmini (90 günden düşecek yorumlar) | 90 günlük kayan ortalama hesabı var | Yarın pencereden çıkacak yorumlar → "yeni yorum gelmezse yarın puan X"; "4,8'e çıkmak için kaç 5 yıldız gerekir". Trendyol kuralı `Puan_Resmi` ile ayarlanır | Hayır | 1 |
| TY-3 | Uber Eats geçişi / 403 uyarısı (R2) | Sadece log | 403 gelince bildirim | Hayır | 1 |
| TY-4 | Menü tutarlılığı + onayla düzeltme | `Menu_Sorun`, `Menu_Fark`, `Fiyat_Guncelle` (onaylı fiyat gönderimi) | GENEL › Menü ile fiyat/ürün farkı; açıklama ↔ reçete (Tbl_Receteler) içerik farkı; kategori uyumu; boy/fiyat merdiveni. İsim/açıklama/kategori güncelleme API'si belgeden doğrulanacak | Onaylı | 2 |
| TY-5 | Yorumlara cevap: taslak → onay → gönder | Yorumlar çekiliyor | Taslak cevap (yapay zekâ), onay kutusu, `POST .../answer`; ret nedenleri (`rejectedReason`) izlenir | Onaylı | 2 |
| TY-6 | İade: bildirim + sebep analizi + onay/ret önerisi | — | 5-10 dk'da bir iade çekme; sipariş, kurye, teslim süresi, müşteri geçmişi, önceki puanlarla birlikte öneri; karar sahipte, `PUT claimAccept/Reject` | Onaylı | 3 |
| TY-7 | Bölge ve yoğunluğa göre otomatik teslimat süresi | Adisyo siparişleri 5 dk'da bir geliyor (sipariş, çıkış, teslim zamanı, mahalle, kurye) | Son 45-60 dk'nın gerçek teslim süresi → süre basamağı (ör. 20-25 / 25-30 / 35-40); iniş-çıkış titreşimini önleyen eşik; en az/en çok sınırı. Önce 1 hafta yalnızca öneri (kuru), sonra otomatik | Otomatik (sınırlı) | 4 |

**Belge eksikleri:** Teslimat süresi güncelleme (mağaza bazında mı, bölge bazında mı?), iade çekme ve
onay/ret, ürün adı/açıklama güncelleme sayfalarının istek örnekleri gerekiyor
(`developers.tgoapps.com` buradan açılamıyor).

**Diğer öneriler:** sabah özeti (puan, değişim, yarın tahmini, bekleyen iade/cevap); mağaza Trendyol'da
beklenmedik kapalıysa uyarı; ürün bazında lezzet puanı; kurye bazında teslimat puanı.

## Bilinen riskler

- **Uber Eats geçişi:** Trendyol Go Uber Eats'e geçen restoranlarda yorum, puan ve cevap servisleri
  `403 endpoint.not-available.error` döner. Bizim kod bu durumda yalnızca log yazıp devam ediyor —
  yani geçiş olursa yorumlar **sessizce durur**. Bkz. kontrol listesi R2.
- **Puan servisi 404:** 3'ten az değerlendirmesi olan mağaza için `stats` 404 döner; hata değildir.
- **Kimlik bilgileri kodun içinde:** Bkz. kontrol listesi R1.
