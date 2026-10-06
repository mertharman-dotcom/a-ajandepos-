# Veri sözlüğü — her bilginin tek sahibi

Kural: aşağıdaki her bilgi **yalnızca "Sahip" sütunundaki yerde** tutulur. Başka bir sekme ona kopya
tutamaz; gerekiyorsa sahipten okur. ⏳ = karar/geçiş bekliyor (bkz. `kontrol-listesi.md`, bölüm K).

## Dosyalar

| Kısa ad | Dosya | ID |
|---|---|---|
| STOK | BAP Stok Takip Sistemi | `1Ec-xcTvh6D2DfxDwueSzQtguT3HR5VaSNOTWpqYPwhE` |
| GENEL | BAP Genel Bilgiler | `1rcOUvokeb0VG3mm72-IKV1-bk0WugEcNSvDaHz41pP8` |
| SATIS | BAP Adisyo Sipariş Datası (Make.com doldurur) | `1gdn_rbaevKx9_-pNTRKL1DDtytFxZHr9QF-jrS4cHPE` |
| SATIS2 | BAP veri tablosu (Detay sekmesi) | `152FdGaQUhwyd0ytcTbM1OI6beNZsXBJhCM-GoG2Bzvw` |
| FATURA | Kolaybi Fatura Ham Veri | `1JJ6UZzh8rSX1FE9Cr-UPzEAaE-2aKtM10bEvjAv2P5w` |
| YEMEKKARTI | BAP Yemek Kartı Tahsilatları (Pluxee, Edenred, Paye çekimleri) | `19RVXZQwKZRCW6xnZxSwhRHXte4VWhaVqruaTZRwVJbM` |
| TRENDYOL | Trendyol Yorumlar (Trendyol API çeker; ayrıntı `docs/trendyol-api.md`) | `1KLWCEBwFMHCTrTnCYLhv2ctg5PvGtS9DNzoMXF-Z1JE` |
| KURYE | Kurye Net Çalışma Süresi (HemenYolda köprüsü, Pluxee çekimi, açık hesaplar) | `1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo` |

Bütün e-tabloların listesi ve önerilen Drive düzeni: `docs/tablo-haritasi.md`.

## Bilgiler

| Bilgi | Sahip | Kim yazar | Kim okur | Kopyası olan / kaldırılacak |
|---|---|---|---|---|
| Satılan ürünler (sipariş satırları) | SATIS › Satıs Verileri | Make.com | Stok motoru, Hazırlık, Reçete Kontrol | ⏳ SATIS2 › Detay yalnızca rapor kalacak (K4) |
| Menü ürünleri: ad, kategori, satış fiyatı, aktif, tip | GENEL › Menü | Elle | Maliyet, Stok motoru | ⏳ STOK › Urun_Listesi, Ürün_Listesi (K3) |
| Ürün reçetesi | STOK › Tbl_Receteler | Elle | Stok motoru, Maliyet, Hazırlık, Reçete Kontrol, Mutfak Paneli | ⏳ Tbl_UrunRecete (K1) |
| Yarı mamul çıktı bilgisi (parti, porsiyon, takip birimi) | STOK › Tbl_YariMamul (sekme adı: "Tbl_YariMamul tablosuna Cikti_Tipi") | Elle | Hepsi | — |
| Yarı mamul reçetesi | STOK › Tbl_YariMamulRecete | Elle | Hepsi | — |
| Tekrar kullanılan malzeme (kaç partide bir yenilenir, ör. konfi yağı 10) | STOK › Tbl_YariMamulRecete, F sütunu `Tekrar_Parti` (C = parti başına ortalama pay) | Elle | Mutfak paneli (hazırlık ekranı) | — |
| Tekrar kullanılan malzemenin yenilenme zamanları (sayaç) | STOK › Tekrar_Kullanim_Log (Zaman, Sube, Yari_Mamul, Malzeme, Sebep, Calisan) | Mutfak paneli (üretim kaydı, "Küf / bozulma" butonu) | Mutfak paneli | — |
| Hammadde kartı: fatura adı (B), kısa ad (C), paket (F/H/I), son alış fiyatı (J), koli (P) | STOK › Tbl_Hammaddeler | Elle + Alış motoru (J) | Hepsi | J'yi iki kod yazıyor (S6) |
| Ambalaj kartı | STOK › Ambalaj_Hammadde | Elle | Hepsi | — |
| Direkt satış kartı (içecek vb.) | STOK › Direktsatisurunler | Elle | Hepsi | — |
| Ambalaj kuralları | STOK › Ambalaj_Kurallari | Elle | Stok motoru, Maliyet | — |
| Satış adı ↔ reçete adı eşleştirmesi | ⏳ tek tablo kurulacak (K5) | — | — | Hazirlik_Eslestirme, Tbl_UrunEslestirme, stok motorundaki `DS_TAKMA_AD` |
| Fatura adı ↔ stok kalemi eşleştirmesi | STOK › Fatura_Eslestirme | Elle / Alış motoru | Alış motoru | — |
| Şube stoğu | STOK › Sube_Stok | Satış, Alış, Üretim, Sayım, Transfer, Zayi | Panel, raporlar | ⏳ stok kalemi = kısa ad (K2) |
| Stok hareket defteri | STOK › Stok_Hareketleri | Tüm motorlar | Raporlar | — |
| Satış düşüm logu | STOK › Satis_Hareketleri | Stok motoru | Raporlar | — |
| Fatura kalemleri | FATURA › Fatura_Kalemleri | `kalemleriAyir` | Alış motoru | — |
| Tedarikçi, sevkiyat günü, şube | STOK › Tedarikçi Sevkiyat günleri | Elle | Alış, Sipariş ekranı | Şube sütunu eksikleri → SUBE_YOK (V1) |
| Tedarikçi siparişleri | STOK › Siparis_Kayitlari | Mutfak paneli | Alış motoru (şube tahmini), Mal Kabul | — |
| Üretim / Sayım / Zayi / Transfer girişleri | STOK › Uretim_Girisleri, Sayim_Girisleri, Zayi_Girisleri, Transferler | Mutfak paneli | Hazırlık, stok | — |
| Ürün maliyeti | STOK › Tbl_Maliyetler | Stok Takip içindeki `BAP Maliyet.gs` (04:00) — canlıda çalışan bu | Raporlar | Ayrı `BAP Maliyet` projesi emekliye ayrılacak (D17); stok motorundaki eski rapor silinecek (S8) |
| Trendyol yorum ve puanları | TRENDYOL › Degerlendirmeler | `yorumlariCek` (04:15) | Özet, puan tablosu, müşteri veritabanı | — |
| Trendyol menüsü ve fiyatı (platformdaki hali) | TRENDYOL › Menu_Ham | `menuCek` (03:30) | Menu_Sorun, Menu_Fark | Asıl menü GENEL › Menü; bu yalnızca Trendyol'daki görüntü |
| Trendyol puanı × sipariş adedi (gün × mağaza), yarın tahmini | TRENDYOL › Puan_Siparis, Puan_Tahmin | `gunlukPuanRaporu` (23:50) | Sahip, panel | Puan_Siparis her gece baştan üretilir; sipariş adedi SATIS'tan okunur, kopya değil |
| Trendyol yorum cevapları (taslak, onay, gönderim, Trendyol sonucu) | TRENDYOL › Yorum_Cevap | `yorumCevapCalistir` + sahip (onay) | Sahip | — |
| Trendyol iadeleri | TRENDYOL › Iadeler | `iadeleriCek` (10 dk) | Sahip | — |
| Yemek kartı terminal çekimleri (Pluxee, Edenred, SetCard, Metropol, Paye gün sonu + Paye işlemleri) | YEMEKKARTI › Pluxee, Edenred, Paye (gün sonu), Paye İşlemler (işlem işlem), SetCard, SetCard Fatura, Metropol | MacBook pluxee.mjs / edenred.mjs (Kopru), `payeMailCek` (Gmail, Paye Excel'inin iki sayfası), `setcardCek` (SetCard API, saatlik) — kod: BAP Yemek Kartı projesi (`apps-script/bap-yemek-karti`; geçişte Pluxee/Edenred/Paye kurye projesinde de duruyor, `docs/yemek-karti-projesi.md`) | Yemek kartı ajanı (veri kapısı `pluxeeCekimleri_` / `edenredCekimleri_` / `setcardCekimleri_` / `payeCekimleri_` ← Paye İşlemler) | Kurye tablosundaki eski 'Pluxee' / 'Edenred' sekmeleri taşıma sonrası '(eski)' arşivi; kurye 'Paye' sekmesi (rapor ajanı kopyası) silinecek |
| Kurye kesintileri (TL / dakika) | KURYE › Kesintiler (`1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo`) | Elle + `iadeKesintileriIsle` (Iadeler'de "Kuryeden Düş" işaretli satırlar) | Kurye bordrosu (`kesintiOku`) | Iadeler'deki "Kesinti Durumu" yalnızca durum notu, kopya değil |
| Reçete durumu | GENEL › Menü I sütunu | Maliyet Modülü | — | Stok motoru da yazıyor (S8) |
| Kapatılan açık hesaplar | KURYE › Tahsilatlar | Panel (elle) + yemek kartı ajanı (kaynak 'Pluxee Ajanı' / 'Paye Ajanı') | Panel, bordro | — |
| Pluxee haftalık fatura (onay, kesim sonucu, tutarlar) | KURYE › Pluxee Fatura | Panel (onay) + MacBook Pluxee programı (kesim sonucu) | Panel › Finans | — |

## Birimler

- Hammadde stoğu `Tbl_Hammaddeler` **I** (ölçü birimi) cinsinden tutulur; reçete miktarı ona çevrilir.
- Birim maliyet = J (paket fiyatı) / H (paket içeriği). H veya I boşsa maliyet ve stok yanlış çıkar
  (02.10: Barilla 2 kg satırında boştu, panel penne porsiyonunu 14.000 TL hesapladı — M7). Panel artık bu kalemleri
  tutara 0 yazıp "eksik" listesinde gösteriyor.
- **J, H kadar malın fiyatıdır**, faturadaki birim fiyat değil. Fatura kg ile kesilip ürün kasa (H = 7,5 kg) olarak
  tutuluyorsa J = kg fiyatı × 7,5. Fatura litre kutu başına kesilip H = 1 lt ise J = kutu fiyatı (krema, süt — M1).
- `Fatura_Eslestirme` C (çarpan) = **faturadaki 1 adet kaç stok birimi (I) eder**. Metro kremayı kutu kutu faturaladığı
  için çarpan 1'dir, 12 yazılınca hem fiyat 12'ye bölündü hem stok 12 kat şişti (M1).
- Yarı mamul stoğu Takip_tipi biriminde (adet → porsiyon, gr → gram).
- Ambalaj ve direkt satış stoğu **Merkez** şubesinde tutulur.
