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
| MUSTERI | Birlesik Musteri Veritabani (müşteri listesi, telafi, etiketler) | `1dcjX3o-6N9b8ndKt8ALj9MxLg-KZ3I16Z6DI-S9oV1Q` |
| KURYE | Kurye Net Çalışma Süresi (HemenYolda köprüsü, Pluxee çekimi, açık hesaplar) | `1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo` |
| PERSONEL | BAP Personel (BAP_Personel projesi bağlı; puantaj, vardiya, izin) | `1WBniOC2h9SvD20bHZl3G4o0f4kUmjbXtIrNvYVyV8Hg` |
| MUSTERI | Birlesik Musteri Veritabani | `1dcjX3o-6N9b8ndKt8ALj9MxLg-KZ3I16Z6DI-S9oV1Q` |
| HUB | BAP AI HUB (ajan görevleri, kokpit) | `1JbhHFzQYAvRXokYT3IClXgHz0vsXR3Rb0521jxBOFUQ` |
| ISKAYDI | BAP İş Kaydı | `1Lsfaxw71jGeo93AuLovkyFfAfw2H53BsYWKire5COhs` |
| GIDER | BAP Aylık Gider Takibi | `1F-lWaWJN43GdQMAQWpggPmwFoFEcWARCB0GRHhR70Tw` |
| HAKEDIS | BAP Finans — Platform Hakediş | `139-CaKw5Dew7-PFIDAcjn6h673QJGPJ1j3mPslkttAE` |
| AMBAR | BAP Veri Ambarı | `17ScW_Xfbp6vN02DxYtjBAmwF_d-qlWhwaL5t9mF5bmk` |
| ARSIV2025 | BAP_Veri_Arsivi_2025 (yalnız okunur) | `1QVGFcOp91Bv7DXMtcxyjUuCBfm-DKoispGwZRtXbUS8` |

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
| Hammadde kartı: fatura adı (B), kısa ad (C), paket (F/H/I), son alış fiyatı (J), koli (P) | STOK › Tbl_Hammaddeler | Elle + Alış motoru (J, tek yazan: `sonAlisFiyatDoldur_`, J = fatura fiyatı × H ÷ çarpan) | Hepsi | Fiyat senkronu (`fiyatlariGuncelle`) 09.10'dan beri J'ye yazmıyor (S6). Öneriler/şüpheliler STOK › Fiyat_Kontrol |
| Ambalaj kartı | STOK › Ambalaj_Hammadde | Elle | Hepsi | — |
| Direkt satış kartı (içecek vb.) | STOK › Direktsatisurunler | Elle | Hepsi | — |
| Ambalaj kuralları | STOK › Ambalaj_Kurallari | Elle | Stok motoru, Maliyet | — |
| Satış adı ↔ reçete adı eşleştirmesi | ⏳ tek tablo kurulacak (K5) | — | — | Hazirlik_Eslestirme, Tbl_UrunEslestirme, stok motorundaki `DS_TAKMA_AD` |
| Fatura adı ↔ stok kalemi eşleştirmesi | STOK › Fatura_Eslestirme | Alış motoru (eşleşmeyeni A'ya ekler) + Yönetim paneli › Alım & Tedarikçi › Fatura eşleştirme (B/C/D/F; `ap_eslestirmeKaydet_`) ya da elle | Alış motoru | — |
| Şube stoğu | STOK › Sube_Stok | Satış, Alış, Üretim, Sayım, Transfer, Zayi | Panel, raporlar | ⏳ stok kalemi = kısa ad (K2) |
| Stok hareket defteri | STOK › Stok_Hareketleri | Tüm motorlar | Raporlar | — |
| Satış düşüm logu | STOK › Satis_Hareketleri | Stok motoru | Raporlar | — |
| Fatura kalemleri | FATURA › Fatura_Kalemleri | `kalemleriAyir` | Alış motoru | — |
| Tedarikçi, sevkiyat günü, şube | STOK › Tedarikçi Sevkiyat günleri | Elle | Alış, Sipariş ekranı | Şube sütunu eksikleri → SUBE_YOK (V1) |
| Ev / özel alım işareti (stoğa ve maliyete girmez, borçta kalır) | FATURA › Ozel_Alimlar (fatura, kalem ya da '*' ürün) + STOK › Fatura_Ev_Alimlari (J notu 'Ev') | Alım Paneli (bap-alim-paneli) / elle | Alım Paneli, Alış Motoru (`ozelAlimHaritasi_`) | — |
| Toptancıya söz verilen ödeme tarihi (plan) | FATURA › Odeme_Plani (Plan_ID, Tedarikçi, Plan_Tarihi, Tutar, Açıklama, Durum=İptal, Kayıt_Zamanı) | Alım & Tedarikçi (/alim) › Ödeme planı → /api/odeme-plani (Veri Kapısı `odemePlaniIsle_`) | Yönetim Merkezi yapılacaklar (`odemePlanlari_`) ve Alım ekranı (`ap_veri_` ham satırlar; karşılandı hesabı tarayıcıda `planHesapla`, aynı kural): o toptancıya sonradan girilen ödemelerle karşılanır | — |
| Kurye haftası ödendi işareti | KURYE › Kurye_Odemeleri (Hafta, Bitiş, Durum Ödendi/Geri alındı, BAP_Tutar, Haddy_Tutar; son satır geçerli) | Yönetim paneli › Yönetim Merkezi / Kurye bordrosu (`kuryeOdendiIsle_`) | Yönetim Merkezi yapılacaklar, kurye bordrosu | — |
| Tedarikçi siparişleri | STOK › Siparis_Kayitlari | Mutfak paneli | Alış motoru (şube tahmini), Mal Kabul | — |
| Üretim / Sayım / Zayi / Transfer girişleri | STOK › Uretim_Girisleri, Sayim_Girisleri, Zayi_Girisleri, Transferler | Mutfak paneli | Hazırlık, stok | — |
| Hazırlık planı ↔ gerçek, sapma sebebi (otomatik + elle) | BAP Mutfak Hazırlık Planı › Hazirlik_Dogruluk (`Sebep (elle)` sütununu mutfak/sahip yazar) | Hazırlık ajanı (`hp_dogrulukKontrol`, 23:30) | Hazırlık ajanı (düzeltme çarpanı), mail | Hazirlik_Sapma_Ozet ve Hazirlik_Sapma_Sebep her gece buradan baştan üretilir, kopya değil |
| Ürün maliyeti | STOK › Tbl_Maliyetler | Stok Takip içindeki `BAP Maliyet.gs` (04:00) — canlıda çalışan bu | Raporlar | Ayrı `BAP Maliyet` projesi emekliye ayrılacak (D17); stok motorundaki eski rapor silinecek (S8) |
| Telefonlu müşteri (tek satır = tek telefonun son 10 hanesi; isim, mahalle, adres, sipariş sayısı, etiketler) | MUSTERI › Ana Musteri Listesi | `musteriTazele` (Toplayıcı, günde 5 kez), `etiketleriUygula`, `yorumlariCek` (TY işareti) | Toplayıcı (etiket uyarısı), memnuniyet listesi (`listelenenSenkron`), canlı WhatsApp botu (Make 6667782, A sütunundaki telefonla arar) | "Ana Musteri - Canli" kimsenin kullanmadığı eski kopya → ESKI_ (MU4). Adisyo'daki müşteri kartları kaynak değil: aynı kişi platform başına ayrı kart olabilir |
| Telefonsuz müşteri (Getir / Trendyol, adres anahtarıyla) | MUSTERI › Telefonsuz (Getir-Trendyol) | `musteriTazele`, `yorumlariCek` | Sipariş anı düşük puan uyarısı | Anahtar iyileştirilecek (MU3) |
| Trendyol yorum ve puanları | TRENDYOL › Degerlendirmeler | `yorumlariCek` (04:15) | Özet, puan tablosu, müşteri veritabanı | — |
| Trendyol menüsü ve fiyatı (platformdaki hali) | TRENDYOL › Menu_Ham | `menuCek` (03:30) | Menu_Sorun, Menu_Fark | Asıl menü GENEL › Menü; bu yalnızca Trendyol'daki görüntü |
| Trendyol puanı × sipariş adedi (gün × mağaza), yarın tahmini | TRENDYOL › Puan_Siparis, Puan_Tahmin | `gunlukPuanRaporu` (23:50) | Sahip, panel | Puan_Siparis her gece baştan üretilir; sipariş adedi SATIS'tan okunur, kopya değil |
| Trendyol yorum cevapları (taslak, onay, gönderim, Trendyol sonucu) | TRENDYOL › Yorum_Cevap | `yorumCevapCalistir` + sahip (onay) | Sahip | — |
| Trendyol iadeleri | TRENDYOL › Iadeler | `iadeleriCek` (10 dk) | Sahip | — |
| Yemek kartı terminal çekimleri (Pluxee, Edenred, SetCard, Metropol, Multinet, Tokenflex, Paye gün sonu + Paye işlemleri) | YEMEKKARTI › Pluxee, Edenred, Paye (gün sonu), Paye İşlemler (işlem işlem), SetCard, SetCard Fatura, Metropol, Metropol Ödeme, Metropol Fatura, Multinet, Multinet Fatura, Tokenflex, Tokenflex Fatura, Fatura Kesimleri | MacBook pluxee.mjs / edenred.mjs (Kopru), `payeMailCek` (Gmail, Paye Excel'inin iki sayfası), `setcardCek` (SetCard API, saatlik) — kod: BAP Yemek Kartı projesi (`apps-script/bap-yemek-karti`; geçişte Pluxee/Edenred/Paye kurye projesinde de duruyor, `docs/yemek-karti-projesi.md`) | Yemek kartı ajanı (veri kapısı `pluxeeCekimleri_` / `edenredCekimleri_` / `setcardCekimleri_` / `payeCekimleri_` ← Paye İşlemler) | Kurye tablosundaki eski 'Pluxee' / 'Edenred' sekmeleri taşıma sonrası '(eski)' arşivi; kurye 'Paye' sekmesi (rapor ajanı kopyası) silinecek |
| Kurye bordro kalemleri: kesinti (TL / dakika), avans (−), bahşiş / eksik ödeme / ek ödeme (+). Tutar artı yazılır, yönü 'Kesinti Tipi'nden gelir | KURYE › Kesintiler (`1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo`) | Elle, panel (Kurye › Kesinti) + `iadeKesintileriIsle` (Iadeler'de "Kuryeden Düş" işaretli satırlar) | Kurye bordrosu (`kesintiOku`), panel bordrosu (Veri Kapısı `kesintiYonu_`) | Iadeler'deki "Kesinti Durumu" yalnızca durum notu, kopya değil |
| Reçete durumu | GENEL › Menü I sütunu | Maliyet Modülü | — | Stok motoru da yazıyor (S8) |
| Sistem sağlığı: her sistemin durumu (OK / UYARI / SORUN), durum değişiklikleri, bekçinin kalp atışı, ücretli abonelikler ve yenileme tarihleri | BAP Sistem Nabzı (`1Zcvs58MkIX_D2GZZv8q2p6LpFj6_BS42TBMKuU1oNpY`) › Durum, Olaylar, Kalp, Abonelikler | BAP Sistem Bekçisi (15 dk); Abonelikler'i sahip elle doldurur | Yönetim paneli › Sistem Sağlığı (Veri Kapısı `nabiz_`), TS Sistem Sağlığı ajanı | Eski SATIS › Sistem_Nabzi bekçi kurulunca kullanılmaz |
| Gece yedeği (10 ana tablonun xlsx kopyası) | Drive › yedek klasörü (`1GXCIojyM13z01MvSZSgVAA8e92FbbnSe`) › `BAP_YEDEK_yyyy-MM-dd.zip` (son 10 gün) | BAP Günlük Yedek › `yedekZipAl` (03:00) | Bekçi (Gece ZIP yedeği), TS Sistem Sağlığı ajanı (Kalp) | Eski `ARSIV ONCESI` kopyaları yalnız elle alınan yedekler |
| Kapatılan açık hesaplar | KURYE › Tahsilatlar | Panel (elle) + yemek kartı ajanı (kaynak 'Pluxee Ajanı' / 'Paye Ajanı') | Panel, bordro | — |
| Yemek kartı faturasının tahsil edildi onayı (sahibinin, kart sistemi göstermeyen faturalar için) | YEMEKKARTI › Fatura Tahsil Onayı | Panel › Yemek Kartları › 'Tahsil edildi' / 'geri al' (`faturaTahsilIslem_`) | Panel fatura tabloları, Finans alacakları (`kartOdenenFaturalar_`) | KolayBi'ye tahsilat girilmez (sahibin kararı 08.10). Kart sistemi ödeme bilgisi (SetCard Fatura, Multinet Fatura, Tokenflex Fatura) varsa o geçerli |

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
