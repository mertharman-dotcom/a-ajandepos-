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

## Bilgiler

| Bilgi | Sahip | Kim yazar | Kim okur | Kopyası olan / kaldırılacak |
|---|---|---|---|---|
| Satılan ürünler (sipariş satırları) | SATIS › Satıs Verileri | Make.com | Stok motoru, Hazırlık, Reçete Kontrol | ⏳ SATIS2 › Detay yalnızca rapor kalacak (K4) |
| Menü ürünleri: ad, kategori, satış fiyatı, aktif, tip | GENEL › Menü | Elle | Maliyet, Stok motoru | ⏳ STOK › Urun_Listesi, Ürün_Listesi (K3) |
| Ürün reçetesi | STOK › Tbl_Receteler | Elle | Stok motoru, Maliyet, Hazırlık, Reçete Kontrol, Mutfak Paneli | ⏳ Tbl_UrunRecete (K1) |
| Yarı mamul çıktı bilgisi (parti, porsiyon, takip birimi) | STOK › Tbl_YariMamul (sekme adı: "Tbl_YariMamul tablosuna Cikti_Tipi") | Elle | Hepsi | — |
| Yarı mamul reçetesi | STOK › Tbl_YariMamulRecete | Elle | Hepsi | — |
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
| Ürün maliyeti | STOK › Tbl_Maliyetler | Maliyet Modülü (04:00) | Raporlar | Stok motorundaki eski maliyet raporu silinecek (S8) |
| Reçete durumu | GENEL › Menü I sütunu | Maliyet Modülü | — | Stok motoru da yazıyor (S8) |

## Birimler

- Hammadde stoğu `Tbl_Hammaddeler` **I** (ölçü birimi) cinsinden tutulur; reçete miktarı ona çevrilir.
- Birim maliyet = J (paket fiyatı) / H (paket içeriği). H veya I boşsa maliyet ve stok yanlış çıkar.
- Yarı mamul stoğu Takip_tipi biriminde (adet → porsiyon, gr → gram).
- Ambalaj ve direkt satış stoğu **Merkez** şubesinde tutulur.
