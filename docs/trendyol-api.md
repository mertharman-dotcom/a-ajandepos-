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

## Henüz çekilmeyenler (ileride)

Öncelik, paket servisin %80 olmasına göre verildi.

| # | Servis | Bize ne kazandırır | Öncelik |
|---|---|---|---|
| TY-A | **İade siparişleri çekme** (`claims`) | Hangi ürün / şube / kurye iade alıyor, iade tutarı ne. Düşük puanla birlikte okununca "sorun lezzet mi teslimat mı" netleşir; iade edilen ürün maliyeti zarar olarak raporlanabilir | Yüksek |
| TY-B | **Çalışma durumu** (açık/kapalı) — okuma | Mağazanın Trendyol'da gün içinde kaç dakika kapalı kaldığını kaydetmek (kapalı = kaçan sipariş). Saatlik anlık görüntü yeter | Yüksek |
| TY-C | **Teslimat süresi** | Trendyol'da gösterilen süre ile Adisyo'daki gerçek kurye süresinin karşılaştırılması; yoğun saatte süreyi uzatmak puanı korur | Orta |
| TY-D | **Teslimat bölgeleri** | Hangi mahalleye servis veriyoruz, min. sepet; Adisyo mahalle satışlarıyla yan yana konunca "bölge kârlı mı" sorusu cevaplanır | Orta |
| TY-E | **Restoran bilgileri** | Mağaza kimlikleri, adres, durum — kodlardaki sabit listeyi doğrulamak için tek seferlik | Düşük |
| TY-F | **Çalışma saatleri** — okuma | Panelde saatleri görmek; tatil/bayram değişikliği kontrolü | Düşük |
| TY-G | **Yoruma cevap verme** (`POST .../answer`) | Düşük puanlara şablon cevap. **Veri yazar** → önce kuru çalışma + sahip onayı; otomatik tekrar denenmez (CLAUDE.md kural 4 ve 6) | Düşük, dikkatli |

Yazan servisler (bölge/saat/durum/süre **güncelleme**, iade onay-red, yoruma cevap) şimdilik kapsam dışı:
yanlış çalışırsa mağazayı kapatabilir veya müşteriye cevap gider. Önce yalnızca **okuyan** servisler eklenir.

## Bilinen riskler

- **Uber Eats geçişi:** Trendyol Go Uber Eats'e geçen restoranlarda yorum, puan ve cevap servisleri
  `403 endpoint.not-available.error` döner. Bizim kod bu durumda yalnızca log yazıp devam ediyor —
  yani geçiş olursa yorumlar **sessizce durur**. Bkz. kontrol listesi R2.
- **Puan servisi 404:** 3'ten az değerlendirmesi olan mağaza için `stats` 404 döner; hata değildir.
- **Kimlik bilgileri kodun içinde:** Bkz. kontrol listesi R1.
