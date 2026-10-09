# Etki haritası — bir şeyi değiştirince neresi etkilenir?

> **Bu dosya otomatik üretilir, elle düzenlenmez.** Üreten: `node araclar/etki-haritasi.mjs` (`main`e her kod değişikliğinde GitHub kendisi de çalıştırır). Kod statik okunduğu için "en iyi tahmin"dir; kesin değildir ama değişiklikten önce bakılacak ilk yerdir.

**Nasıl kullanılır?** Bir sekmenin adını, bir sütun başlığını ya da bir ürün listesini değiştirmeden önce o sekmeyi aşağıda bul:
- **Yazan** kodlar o sekmeye veri yazar: sütun sırası/adı değişirse yanlış yere yazabilirler.
- **Okuyan** kodlar o sekmeden veri alır: başlık değişirse boş/yanlış veri görürler.
- **Sütunlar** kodun adıyla aradığı başlıklardır: bunların adı değişirse kod onları bulamaz.
- **Kim çalıştırıyor** o kodu tetikleyen zamanlayıcı, menü ya da paneldir: bozulursa etkiyi ilk orada görürsün.

Ajan için: `node araclar/etki-haritasi.mjs ara "<sekme / sütun / fonksiyon adı>"` aynı bilgiyi tek bir ad için verir.

## Özet

| | Adet |
|---|---|
| Apps Script projesi | 16 |
| Kodun dokunduğu sekme | 180 |
| Birden fazla projenin **yazdığı** sekme (risk) | 21 |
| Arayüz dosyası (panel, köprü) | 11 |

### ⚠️ Birden fazla projenin yazdığı sekmeler

Aynı sekmeye iki ayrı proje yazıyorsa birinin yaptığı değişiklik diğerini bozabilir; "her bilginin tek sahibi" kuralına (`veri-sozlugu.md`) aykırı olabilir.

| Sekme | Yazan projeler |
|---|---|
| FATURA › Fatura_Kalemleri | Kolaybi Fatura Ham Veri, Stok Takip Sistemi |
| FATURA › Odemeler | BAP Panel Veri Kapısı, Kolaybi Fatura Ham Veri |
| GENEL › Menü | BAP Maliyet Modülü, Stok Takip Sistemi |
| KURYE › Kesintiler | BAP Panel Veri Kapısı, Kurye Net Çalışma Süresi, Trendyol Veri Çekme |
| MUSTERI › Ana Musteri Listesi | Adisyo Sipariş Toplayıcı, Trendyol Veri Çekme |
| MUSTERI › Telafi_Listesi | Adisyo Sipariş Toplayıcı, Trendyol Veri Çekme |
| MUSTERI › Telefonsuz (Getir-Trendyol) | Adisyo Sipariş Toplayıcı, Trendyol Veri Çekme |
| PERSONEL › Islem_Loglari | BAP Panel Veri Kapısı, BAP_Personel |
| PERSONEL › Personel | BAP Panel Veri Kapısı, BAP_Personel |
| PERSONEL › Vardiya | BAP Panel Veri Kapısı, BAP_Personel |
| SATIS › Satıs Verileri | Adisyo Sipariş Toplayıcı, Stok Takip Sistemi |
| STOK › Fatura_Eslestirme | Kolaybi Fatura Ham Veri, Stok Takip Sistemi |
| STOK › Maliyet_Detay | BAP Maliyet Modülü, Stok Takip Sistemi |
| STOK › Stok_Hareketleri | BAP PANEL Backend, Stok Takip Sistemi |
| STOK › Sube_Stok | BAP PANEL Backend, Stok Takip Sistemi |
| STOK › Tbl_Maliyetler | BAP Maliyet Modülü, Stok Takip Sistemi |
| TRENDYOL › Iadeler | BAP Panel Veri Kapısı, Trendyol Veri Çekme |
| TRENDYOL › Yorum_Cevap | BAP Panel Veri Kapısı, Trendyol Veri Çekme |
| YEMEKKARTI › Edenred | BAP Yemek Kartı, Kurye Net Çalışma Süresi |
| YEMEKKARTI › Pluxee | BAP Yemek Kartı, Kurye Net Çalışma Süresi |
| YEMEKKARTI › SetCard | BAP Yemek Kartı, Kurye Net Çalışma Süresi |

## Dosya › sekme

### AD:BAP Adisyo Test Verisi

#### Sube_Gunluk

- **Yazan:** `saRapor_` (Adisyo Sipariş Toplayıcı), `subeAtamaKurulum` (Adisyo Sipariş Toplayıcı)
- Olası başka sütunlar: 27 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 04:30 (`gunlukSubeRaporu`)

#### Sube_Pas_Detay

- **Yazan:** `saRapor_` (Adisyo Sipariş Toplayıcı), `subeAtamaKurulum` (Adisyo Sipariş Toplayıcı)
- Olası başka sütunlar: 27 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 04:30 (`gunlukSubeRaporu`)

### AD:BAP Günlük Fiş Kaydı

#### Fisler

- **Yazan:** `fisKaydet_` (BAP Panel Veri Kapısı)
- **Okuyan:** `fisKayit_` (BAP Panel Veri Kapısı)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

### AD:BAP Mutfak Hazırlık Planı

#### Hazirlik_Dogruluk

- **Yazan:** `hp_dogrulukKontrol` (Stok Takip Sistemi), `hp_kurulum` (Stok Takip Sistemi)
- **Okuyan:** `hp_sapmaAnaliz_` (Stok Takip Sistemi)
- Olası başka sütunlar: 25 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 23:30 (`hp_gunluk`)

#### Hazirlik_Eslestirme

- **Yazan:** `hp_eslesmeYaz_` (Stok Takip Sistemi), `hp_kurulum` (Stok Takip Sistemi)
- **Okuyan:** `hp_context_` (Stok Takip Sistemi)
- Olası başka sütunlar: 25 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** haftada bir 09:00 (`rc_kontrolEt`), her gün 23:30 (`hp_gunluk`)

#### Hazirlik_Plan_Gecmis

- **Yazan:** `hp_kurulum` (Stok Takip Sistemi), `hp_planOlustur` (Stok Takip Sistemi)
- **Okuyan:** `hp_dogrulukKontrol` (Stok Takip Sistemi)
- Olası başka sütunlar: 25 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 23:30 (`hp_gunluk`)

#### Hazirlik_Plani

- **Yazan:** `hp_kurulum` (Stok Takip Sistemi), `hp_planOlustur` (Stok Takip Sistemi)
- Olası başka sütunlar: 25 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 23:30 (`hp_gunluk`)

#### Hazirlik_Raf_Omru

- **Yazan:** `hp_kurulum` (Stok Takip Sistemi), `hp_rafDoldur_` (Stok Takip Sistemi)
- **Okuyan:** `hp_rafOku_` (Stok Takip Sistemi)
- Olası başka sütunlar: 25 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 23:30 (`hp_gunluk`)

#### Hazirlik_Sapma_Ozet

- **Yazan:** `hp_sapmaAnaliz_` (Stok Takip Sistemi)
- **Zamanla çalışan:** her gün 23:30 (`hp_gunluk`)

#### Hazirlik_Sapma_Sebep

- **Yazan:** `hp_sapmaAnaliz_` (Stok Takip Sistemi)
- **Zamanla çalışan:** her gün 23:30 (`hp_gunluk`)

#### Hazirlik_Stok

- **Yazan:** `hp_kurulum` (Stok Takip Sistemi), `hp_planOlustur` (Stok Takip Sistemi)
- Olası başka sütunlar: 25 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 23:30 (`hp_gunluk`)

#### Hazirlik_Takvim

- **Yazan:** `hp_kurulum` (Stok Takip Sistemi)
- **Okuyan:** `hp_takvim_` (Stok Takip Sistemi)
- Olası başka sütunlar: 25 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 23:30 (`hp_gunluk`)

### AD:BAP Reçete Kontrol

#### Is_Plani

- **Yazan:** `rc_yaz_` (Stok Takip Sistemi)
- **Zamanla çalışan:** haftada bir 09:00 (`rc_kontrolEt`)

### AMBAR — BAP Veri Ambarı

#### Siparis_Kalemleri

- **Yazan:** `siparisKalemleriniYaz` (BAP Satış Veri Ambarı)

### ARSIV2025 — BAP_Veri_Arsivi_2025 (yalnız okunur)

#### Make.com Data

- **Okuyan:** `satisBolumu_` (BAP Rapor Ajanı)
- **Zamanla çalışan:** haftada bir 09:00 (`haftalikRapor`)

### BAĞLI:indirim-orani

#### Gunluk_Indirim_Mutabakat

- **Yazan:** `raporuOlustur` (İndirim Oranı)
- **Yoksa oluşturan:** `raporuOlustur`
- Olası başka sütunlar: 7 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** tabloda düzenleme olunca (`installedOnEdit`)
- **Elle çalıştırılan:** menü: ⚡ Raporu Güncelle / Getir (`raporuOlustur`)

#### Gunluk_Indirimli_Siparisler

- **Yazan:** `indirimliSiparisSayfasiYaz` (İndirim Oranı)
- **Yoksa oluşturan:** `indirimliSiparisSayfasiYaz`
- **Adıyla aranan sütunlar:** `Adres`, `İndirim (%)`, `İndirim (TL)`, `Kanal`, `Liste Cirosu`, `Mahalle`, `Marka / Şube`, `Ödeme Yöntemi`, `Sipariş ID`, `Sipariş Tipi`, `Tahsilat`, `Tarih / Saat`, `Ürünler`
- **Zamanla çalışan:** tabloda düzenleme olunca (`installedOnEdit`)
- **Elle çalıştırılan:** menü: ⚡ Raporu Güncelle / Getir (`raporuOlustur`)

#### Gunluk_Indirimli_Urunler

- **Yazan:** `indirimliUrunSayfasiYaz` (İndirim Oranı)
- **Yoksa oluşturan:** `indirimliUrunSayfasiYaz`
- **Adıyla aranan sütunlar:** `Geçtiği Sipariş Sayısı`, `İndirim Oranı (%)`, `Kanal`, `Kategori`, `Liste Cirosu`, `Satılan Adet`, `Tahmini İndirim Payı`, `Tahmini Net Tahsilat`, `Ürün Adı`
- **Zamanla çalışan:** tabloda düzenleme olunca (`installedOnEdit`)
- **Elle çalıştırılan:** menü: ⚡ Raporu Güncelle / Getir (`raporuOlustur`)

#### Gunluk_Satis_Detay

- **Yazan:** `raporuOlustur` (İndirim Oranı)
- **Yoksa oluşturan:** `raporuOlustur`
- Olası başka sütunlar: 7 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** tabloda düzenleme olunca (`installedOnEdit`)
- **Elle çalıştırılan:** menü: ⚡ Raporu Güncelle / Getir (`raporuOlustur`)

### FATURA — Kolaybi Fatura Ham Veri

#### Alis_Teshis

- **Yazan:** `alisFaturaTeshis` (Kolaybi Fatura Ham Veri)
- **Yoksa oluşturan:** `alisFaturaTeshis`

#### Cekim_Log

- **Yazan:** `kc_log_` (Kolaybi Fatura Ham Veri)
- **Yoksa oluşturan:** `kc_log_`
- **Zamanla çalışan:** haftada bir 03:00 (`kolaybiAlisTamTarama`), her 2 saatte (`kolaybiTumunuCek`)

#### Fatura_Kalemleri

- **Yazan:** `ap_subeAta_` (Kolaybi Fatura Ham Veri), `geriDonukTaramaDuzelt` (Kolaybi Fatura Ham Veri), `haricKalemleriTemizle` (Kolaybi Fatura Ham Veri), `kalemleriAyir` (Kolaybi Fatura Ham Veri), `subeDoldur` (Kolaybi Fatura Ham Veri), `alisIsle_` (Stok Takip Sistemi), `eskiBekleyenleriKapat` (Stok Takip Sistemi)
- **Okuyan:** `maliyetBolumu_` (BAP Rapor Ajanı), `ap_veri_` (Kolaybi Fatura Ham Veri), `urunListesiOlustur` (Kolaybi Fatura Ham Veri), `veriKontrol` (Kolaybi Fatura Ham Veri), `sonAlisFiyatlariniDoldur` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `kalemleriAyir`
- Olası başka sütunlar: 28 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** haftada bir 09:00 (`haftalikRapor`), haftada bir 03:00 (`kolaybiAlisTamTarama`), her gün 00:10 (`kalemleriAyir`), her gün 14:10 (`kalemleriAyir`), her gün 00:30 (`alisIsle`), her gün 05:00 (`ajanGecelik`), her gün 14:30 (`alisIsle`)
- **Elle çalıştırılan:** menü: Hariç kalemleri Fatura_Kalemleri'nden temizle (`haricKalemleriTemizle`), menü: Ürün listesini yenile (`urunListesiOlustur`), menü: Yeni faturaları kalemlere ayır (`kalemleriAyir`)
- **Etkilenen arayüz:** Cloudflare eski sayfalar

#### Gider_Faturalari

- **Yazan:** `ap_giderEkle_` (Kolaybi Fatura Ham Veri), `ap_giderKategori_` (Kolaybi Fatura Ham Veri), `ap_giderSekme_` (Kolaybi Fatura Ham Veri), `ap_giderSil_` (Kolaybi Fatura Ham Veri), `giderKategorileriniYenile` (Kolaybi Fatura Ham Veri), `giderTemizle` (Kolaybi Fatura Ham Veri), `kolaybiGiderFaturalariCek` (Kolaybi Fatura Ham Veri)
- **Okuyan:** `haddyFaturalari_` (BAP Panel Veri Kapısı), `maliyetBolumu_` (BAP Rapor Ajanı), `ap_giderOku_` (Kolaybi Fatura Ham Veri)
- **Yoksa oluşturan:** `ap_giderSekme_`, `kolaybiGiderFaturalariCek`
- **Adıyla aranan sütunlar:** `Fatura_ID`, `Fatura_No`, `Tarih`, `Tedarikci`, `Tedarikçi`, `Tutar`
- Olası başka sütunlar: 7 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** haftada bir 09:00 (`haftalikRapor`)
- **Etkilenen arayüz:** Cloudflare eski sayfalar

#### Gider_Kategorileri

- **Yazan:** `giderKategoriTablosuOlustur` (Kolaybi Fatura Ham Veri)
- **Okuyan:** `kc_giderKategorileri_` (Kolaybi Fatura Ham Veri)
- **Yoksa oluşturan:** `giderKategoriTablosuOlustur`
- **Zamanla çalışan:** haftada bir 03:00 (`kolaybiAlisTamTarama`)

#### Haric_Kalemler

- **Yazan:** `haricSekmesiOlustur` (Kolaybi Fatura Ham Veri)
- **Okuyan:** `fk_haricListesi` (Kolaybi Fatura Ham Veri)
- **Yoksa oluşturan:** `haricSekmesiOlustur`
- **Zamanla çalışan:** haftada bir 03:00 (`kolaybiAlisTamTarama`), her gün 00:10 (`kalemleriAyir`), her gün 14:10 (`kalemleriAyir`)
- **Elle çalıştırılan:** menü: Hariç kalemleri Fatura_Kalemleri'nden temizle (`haricKalemleriTemizle`), menü: Hariç listesi sekmesini oluştur (`haricSekmesiOlustur`), menü: Ürün listesini yenile (`urunListesiOlustur`), menü: Yeni faturaları kalemlere ayır (`kalemleriAyir`)
- **Etkilenen arayüz:** Cloudflare eski sayfalar

#### Haric_Log

- **Yazan:** `fk_haricLogYaz` (Kolaybi Fatura Ham Veri)
- **Okuyan:** `veriKontrol` (Kolaybi Fatura Ham Veri)
- **Yoksa oluşturan:** `fk_haricLogYaz`
- **Zamanla çalışan:** haftada bir 03:00 (`kolaybiAlisTamTarama`), her gün 00:10 (`kalemleriAyir`), her gün 14:10 (`kalemleriAyir`)
- **Elle çalıştırılan:** menü: Hariç kalemleri Fatura_Kalemleri'nden temizle (`haricKalemleriTemizle`), menü: Yeni faturaları kalemlere ayır (`kalemleriAyir`)

#### Odeme_Plani

- **Yazan:** `odemePlaniIsle_` (BAP Panel Veri Kapısı)
- **Okuyan:** `odemePlanlari_` (BAP Panel Veri Kapısı), `ap_veri_` (Kolaybi Fatura Ham Veri)
- **Yoksa oluşturan:** `odemePlaniIsle_`
- **Adıyla aranan sütunlar:** `Açıklama`, `Durum`, `Kayıt_Zamanı`, `Plan_ID`, `Plan_Tarihi`, `Tedarikçi`, `Tutar`
- Olası başka sütunlar: 1 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Etkilenen arayüz:** Cloudflare eski sayfalar, Yönetim paneli (bap-panel Worker)

#### Odemeler

- **Yazan:** `toptanciOdemeGir_` (BAP Panel Veri Kapısı), `ap_odemeEkle_` (Kolaybi Fatura Ham Veri), `ap_odemeSil_` (Kolaybi Fatura Ham Veri), `ap_sekmeleriHazirla_` (Kolaybi Fatura Ham Veri)
- **Okuyan:** `finans_` (BAP Panel Veri Kapısı), `ap_veri_` (Kolaybi Fatura Ham Veri), `setFoodOdemeleriniDuzelt` (Kolaybi Fatura Ham Veri), `veriKontrol` (Kolaybi Fatura Ham Veri)
- **Yoksa oluşturan:** `toptanciOdemeGir_`, `ap_sekmeleriHazirla_`
- **Adıyla aranan sütunlar:** `Tedarikçi`, `Tutar`
- Olası başka sütunlar: 16 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Etkilenen arayüz:** Cloudflare eski sayfalar, Yönetim paneli (bap-panel Worker)

#### Ozel_Alimlar

- **Yazan:** `ap_ozelIsaretle_` (Kolaybi Fatura Ham Veri), `ap_ozelUrun_` (Kolaybi Fatura Ham Veri), `ap_sekmeleriHazirla_` (Kolaybi Fatura Ham Veri)
- **Okuyan:** `maliyetBolumu_` (BAP Rapor Ajanı), `ap_ozelHaritasi_` (Kolaybi Fatura Ham Veri), `ozelAlimHaritasi_` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `ap_sekmeleriHazirla_`
- **Zamanla çalışan:** haftada bir 09:00 (`haftalikRapor`), her gün 00:30 (`alisIsle`), her gün 05:00 (`ajanGecelik`), her gün 14:30 (`alisIsle`)
- **Etkilenen arayüz:** Cloudflare eski sayfalar

#### Satis_Faturalari

- **Yazan:** `kolaybiSatisFaturalariCek` (Kolaybi Fatura Ham Veri)
- **Okuyan:** `finans_` (BAP Panel Veri Kapısı), `kolaybiSatis_` (BAP Panel Veri Kapısı), `ap_satisOku_` (Kolaybi Fatura Ham Veri), `geriDonukTaramaDuzelt` (Kolaybi Fatura Ham Veri)
- **Yoksa oluşturan:** `kolaybiSatisFaturalariCek`
- **Adıyla aranan sütunlar:** `EBelge_Durumu`, `Fatura_Durumu`, `Fatura_ID`, `Fatura_No`, `Kalan`, `Musteri`, `Nakit_Yonu`, `Odeme_Durumu`, `Odenen`, `Para_Birimi`, `Tarih`, `Tutar`, `Vade_Tarihi`
- Olası başka sütunlar: 5 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Etkilenen arayüz:** Cloudflare eski sayfalar, Yönetim paneli (bap-panel Worker)

#### Sayfa1

- **Yazan:** `ap_subeAta_` (Kolaybi Fatura Ham Veri), `geriDonukTaramaDuzelt` (Kolaybi Fatura Ham Veri), `kolaybiFaturalariCek` (Kolaybi Fatura Ham Veri), `sayfa1Tekillestir` (Kolaybi Fatura Ham Veri), `subeDoldur` (Kolaybi Fatura Ham Veri), `vadeTarihleriniDoldur` (Kolaybi Fatura Ham Veri)
- **Okuyan:** `nabizKontrol` (BAP Günlük Yedek), `finans_` (BAP Panel Veri Kapısı), `ap_veri_` (Kolaybi Fatura Ham Veri), `kalemleriAyir` (Kolaybi Fatura Ham Veri), `kolaybiGiderFaturalariCek` (Kolaybi Fatura Ham Veri), `veriKontrol` (Kolaybi Fatura Ham Veri)
- Olası başka sütunlar: 32 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün (`nabizKontrol`), haftada bir 03:00 (`kolaybiAlisTamTarama`), her gün 00:10 (`kalemleriAyir`), her gün 14:10 (`kalemleriAyir`)
- **Elle çalıştırılan:** menü: Yeni faturaları kalemlere ayır (`kalemleriAyir`)
- **Etkilenen arayüz:** Cloudflare eski sayfalar

#### Tedarikciler

- **Yazan:** `ap_sekmeleriHazirla_` (Kolaybi Fatura Ham Veri), `ap_tedarikciKaydet_` (Kolaybi Fatura Ham Veri), `ap_veri_` (Kolaybi Fatura Ham Veri), `geriDonukTaramaDuzelt` (Kolaybi Fatura Ham Veri)
- **Okuyan:** `finans_` (BAP Panel Veri Kapısı), `odemePlaniIsle_` (BAP Panel Veri Kapısı), `toptanciOdemeGir_` (BAP Panel Veri Kapısı), `veriKontrol` (Kolaybi Fatura Ham Veri)
- **Yoksa oluşturan:** `ap_sekmeleriHazirla_`
- Olası başka sütunlar: 19 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Etkilenen arayüz:** Cloudflare eski sayfalar, Yönetim paneli (bap-panel Worker)

#### Urun_Listesi

- **Yazan:** `urunListesiOlustur` (Kolaybi Fatura Ham Veri)
- **Okuyan:** `fiyatlariGuncelle` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `urunListesiOlustur`
- Olası başka sütunlar: 12 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** haftada bir 03:00 (`kolaybiAlisTamTarama`), her gün 00:10 (`kalemleriAyir`), her gün 14:10 (`kalemleriAyir`), her gün 00:40 (`fiyatlariGuncelleOtomatik`), her gün 14:40 (`fiyatlariGuncelleOtomatik`)
- **Elle çalıştırılan:** menü: Hariç kalemleri Fatura_Kalemleri'nden temizle (`haricKalemleriTemizle`), menü: Ürün listesini yenile (`urunListesiOlustur`), menü: Yeni faturaları kalemlere ayır (`kalemleriAyir`), menü: 💰 Fiyatları Kolaybi'den Güncelle (`fiyatlariGuncelle`)

#### Veri_Kontrol

- **Yazan:** `veriKontrol` (Kolaybi Fatura Ham Veri)
- **Yoksa oluşturan:** `veriKontrol`

### GENEL — BAP Genel Bilgiler

#### Kurye_Gecici

- **Yazan:** `subeAtamaKurulum` (Adisyo Sipariş Toplayıcı)
- **Okuyan:** `saGeciciler_` (Adisyo Sipariş Toplayıcı)
- **Yoksa oluşturan:** `subeAtamaKurulum`
- Olası başka sütunlar: 27 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 04:30 (`gunlukSubeRaporu`), her saat (`subeAtamaGuncelle`)

#### Kurye_Sube

- **Yazan:** `saKuryeler_` (Adisyo Sipariş Toplayıcı), `subeAtamaKurulum` (Adisyo Sipariş Toplayıcı)
- **Yoksa oluşturan:** `subeAtamaKurulum`
- Olası başka sütunlar: 27 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 04:30 (`gunlukSubeRaporu`), her saat (`subeAtamaGuncelle`)

#### Mahalle_Sube

- **Okuyan:** `mahalleListesi_` (Adisyo Sipariş Toplayıcı), `subeSozlugu_` (BAP Panel Veri Kapısı)
- Olası başka sütunlar: 4 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her 5 dk (`siparisDongusu`), her gün 04:30 (`gunlukSubeRaporu`), her saat (`subeAtamaGuncelle`)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Menü

- **Yazan:** `receteDurumuYaz` (BAP Maliyet Modülü), `receteDurumuYaz` (Stok Takip Sistemi), `sm_receteDurumuYaz` (Stok Takip Sistemi)
- **Okuyan:** `menuSekmesi` (BAP Maliyet Modülü), `urunKatalogu` (BAP Maliyet Modülü), `menuSekmesi` (Stok Takip Sistemi), `sm_menuSekmesi` (Stok Takip Sistemi), `sm_urunKatalogu` (Stok Takip Sistemi), `urunKatalogu` (Stok Takip Sistemi)
- **Zamanla çalışan:** her gün (`maliyetRaporu`), tabloda düzenleme olunca (`detayTetik`)

#### Ödeme yöntemleri

- **Okuyan:** `onlineYontemler_` (Adisyo Sipariş Toplayıcı)
- **Zamanla çalışan:** her 5 dk (`siparisDongusu`), her saat (`tahsilSenkron`)

### GIDER — BAP Aylık Gider Takibi

#### Eksikler & Sorular

- **Yazan:** `finansSoruCevapla_` (BAP Panel Veri Kapısı)
- **Okuyan:** `finans_` (BAP Panel Veri Kapısı)
- **Adıyla aranan sütunlar:** `Cevap`, `Durum`, `Konu`, `Neden önemli`, `Tutar etkisi`
- Olası başka sütunlar: 13 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)

#### Özet

- **Okuyan:** `finans_` (BAP Panel Veri Kapısı)
- Olası başka sütunlar: 13 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)

### HUB — BAP AI HUB (ajan görevleri, kokpit)

#### AI_OUTPUTS

- **Okuyan:** `hub_` (BAP Panel Veri Kapısı)

#### AUDIT_LOG

- **Okuyan:** `hub_` (BAP Panel Veri Kapısı)

#### CEO_APPROVALS

- **Okuyan:** `hub_` (BAP Panel Veri Kapısı)

#### ENGINE_JOBS

- **Okuyan:** `hub_` (BAP Panel Veri Kapısı)

#### KOKPIT_BULGULAR

- **Okuyan:** `panolarOku_` (BAP Panel Veri Kapısı)

#### KOKPIT_DEPARTMANLAR

- **Okuyan:** `kokpitOku_` (BAP Panel Veri Kapısı)

#### KOKPIT_EKIP

- **Okuyan:** `panolarOku_` (BAP Panel Veri Kapısı)

#### KOKPIT_GUNDEM

- **Okuyan:** `kokpitOku_` (BAP Panel Veri Kapısı)

#### KOKPIT_GUNLUK

- **Okuyan:** `panolarOku_` (BAP Panel Veri Kapısı)

#### KOKPIT_ISLER

- **Okuyan:** `panolarOku_` (BAP Panel Veri Kapısı), `panoNot_` (BAP Panel Veri Kapısı)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### KOKPIT_NOTLAR

- **Yazan:** `panoNot_` (BAP Panel Veri Kapısı)
- **Okuyan:** `panolarOku_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `panoNot_`
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### KOKPIT_ONAYLAR

- **Yazan:** `kokpitCevap_` (BAP Panel Veri Kapısı)
- **Okuyan:** `kokpitOku_` (BAP Panel Veri Kapısı), `panoNot_` (BAP Panel Veri Kapısı)
- **Adıyla aranan sütunlar:** `DURUM`, `ID`, `TIP`
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### KOKPIT_PANO

- **Okuyan:** `panolarOku_` (BAP Panel Veri Kapısı)

#### TASK_QUEUE

- **Okuyan:** `hub_` (BAP Panel Veri Kapısı)

### KURYE — Kurye Net Çalışma Süresi (HemenYolda köprüsü, Pluxee çekimi, açık hesaplar)

#### Açık Hesaplar

- **Yazan:** `acikHesaplar` (Kurye Net Çalışma Süresi)
- **Okuyan:** `tahsilSenkron` (Adisyo Sipariş Toplayıcı), `acikListe_` (BAP Panel Veri Kapısı), `musteriDetay_` (BAP Panel Veri Kapısı), `_wAcikHesaplar` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `acikHesaplar`
- **Adıyla aranan sütunlar:** `Adisyon No`, `Durum`, `Kurye`, `Ödeme Yöntemi`, `Platform`, `Sipariş ID`, `Tarih`, `Teslim Saati`, `Tutar`, `Tutar (TL)`
- Olası başka sütunlar: 1 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her saat (`tahsilSenkron`), her saat (`puantajTaramasi`), her 15 dk (`guncelle`)
- **Elle çalıştırılan:** ekran: Panel.html (`panelVeri`)
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru), Yönetim paneli (bap-panel Worker)

#### Edenred

- **Yazan:** `yemekKartiTasi_` (Kurye Net Çalışma Süresi)

#### Günlük Mesai

- **Yazan:** `aktarimdanSatirAl` (Kurye Net Çalışma Süresi), `denetimSnapshot` (Kurye Net Çalışma Süresi), `kuraliUygula` (Kurye Net Çalışma Süresi)
- **Okuyan:** `kurye_` (BAP Panel Veri Kapısı), `_panelVeri` (Kurye Net Çalışma Süresi), `gunlukVeriOku` (Kurye Net Çalışma Süresi), `kapanisDenetimi` (Kurye Net Çalışma Süresi), `kaynakSekme` (Kurye Net Çalışma Süresi), `teshis` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `kuraliUygula`
- Olası başka sütunlar: 37 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her 15 dk (`guncelle`), tabloda düzenleme olunca (`onEdit`)
- **Elle çalıştırılan:** ekran: Panel.html (`panelVeri`), menü: ⚙️ Kesinti Kuralını Uygula (`kuraliUygula`), menü: ⚡ Tüm Sistemi Kur / Güncelle (`kuryeSisteminiKur`), menü: 🌐 JSON Dışa Aktar (HTML panel için) (`exportJSON`), menü: 💰 Sadece Bordroyu Yenile (veri çekmez) (`bordroYenile`), menü: 📊 Sadece Performansı Yenile (veri çekmez) (`performansYenile`), menü: 📒 Kesinti Defteri (gerekçeli) (`kesintiDefteriCalistir`), menü: 📥 Aktarım Dosyasından Satır Al (`aktarimdanSatirAl`), menü: 🔄 VERİYİ ÇEK ve TÜMÜNÜ YENİLE (`hepsiniYenile`), menü: 🔍 Veri Kontrol (hatalı satırları bul) (`veriKontrolCalistir`)
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru)

#### Haftalık Bordro & Hakediş

- **Yazan:** `bordroYenile` (Kurye Net Çalışma Süresi), `kuryeSisteminiKur` (Kurye Net Çalışma Süresi), `onEdit` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `kuryeSisteminiKur`
- **Zamanla çalışan:** tabloda düzenleme olunca (`onEdit`)
- **Elle çalıştırılan:** menü: ⚡ Tüm Sistemi Kur / Güncelle (`kuryeSisteminiKur`), menü: 💰 Sadece Bordroyu Yenile (veri çekmez) (`bordroYenile`), menü: 📊 Sadece Performansı Yenile (veri çekmez) (`performansYenile`), menü: 🔄 VERİYİ ÇEK ve TÜMÜNÜ YENİLE (`hepsiniYenile`)

#### Kapanış Denetimi

- **Yazan:** `kapanisDenetimi` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `kapanisDenetimi`

#### Kesinti Defteri

- **Yazan:** `kesintiDefteriCiz` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `kesintiDefteriCiz`
- **Elle çalıştırılan:** menü: ⚡ Tüm Sistemi Kur / Güncelle (`kuryeSisteminiKur`), menü: 💰 Sadece Bordroyu Yenile (veri çekmez) (`bordroYenile`), menü: 📊 Sadece Performansı Yenile (veri çekmez) (`performansYenile`), menü: 📒 Kesinti Defteri (gerekçeli) (`kesintiDefteriCalistir`), menü: 🔄 VERİYİ ÇEK ve TÜMÜNÜ YENİLE (`hepsiniYenile`)

#### Kesintiler

- **Yazan:** `hesapKapat_` (BAP Panel Veri Kapısı), `kesintiGir_` (BAP Panel Veri Kapısı), `kesintiIptal_` (BAP Panel Veri Kapısı), `kuryeSisteminiKur` (Kurye Net Çalışma Süresi), `iadeKesintileriIsle` (Trendyol Veri Çekme)
- **Okuyan:** `kurye_` (BAP Panel Veri Kapısı), `kesintiOku` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `hesapKapat_`, `kesintiGir_`, `kuryeSisteminiKur`
- **Adıyla aranan sütunlar:** `Açıklama`, `Kesilen Süre`, `Kesilen Tutar`, `Kesinti Tipi`, `Kurye`, `Kurye Adı`, `Tarih`
- Olası başka sütunlar: 56 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** tabloda düzenleme olunca (`onEdit`), her 10 dk (`iadeleriCek`)
- **Elle çalıştırılan:** menü: ⚡ Tüm Sistemi Kur / Güncelle (`kuryeSisteminiKur`), menü: 💰 Sadece Bordroyu Yenile (veri çekmez) (`bordroYenile`), menü: 📊 Sadece Performansı Yenile (veri çekmez) (`performansYenile`), menü: 🔄 VERİYİ ÇEK ve TÜMÜNÜ YENİLE (`hepsiniYenile`)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Kurye bilgiler

- **Yazan:** `kuryeSisteminiKur` (Kurye Net Çalışma Süresi)
- **Okuyan:** `kuryeUcretOku_` (BAP Panel Veri Kapısı), `kuryeMaliyeti_` (BAP Rapor Ajanı), `_wTarife` (Kurye Net Çalışma Süresi), `tarifeOku` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `kuryeSisteminiKur`
- **Zamanla çalışan:** haftada bir 09:00 (`haftalikRapor`), tabloda düzenleme olunca (`onEdit`)
- **Elle çalıştırılan:** ekran: Panel.html (`panelVeri`), menü: ⚡ Tüm Sistemi Kur / Güncelle (`kuryeSisteminiKur`), menü: 🌐 JSON Dışa Aktar (HTML panel için) (`exportJSON`), menü: 💰 Sadece Bordroyu Yenile (veri çekmez) (`bordroYenile`), menü: 📊 Sadece Performansı Yenile (veri çekmez) (`performansYenile`), menü: 🔄 VERİYİ ÇEK ve TÜMÜNÜ YENİLE (`hepsiniYenile`)

#### Kurye Bilgiler

- **Okuyan:** `kuryeUcretOku_` (BAP Panel Veri Kapısı)

#### Kurye Eşleştirme

- **Yazan:** `eslestirmeKaydi_` (BAP Panel Veri Kapısı), `kuryeEslestirIslem_` (BAP Panel Veri Kapısı)
- **Okuyan:** `eslestirmeKararlari_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `eslestirmeKaydi_`
- **Adıyla aranan sütunlar:** `Adisyo Sipariş ID`, `İşlem`
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Kurye Performans

- **Yazan:** `kuryeSisteminiKur` (Kurye Net Çalışma Süresi), `onEdit` (Kurye Net Çalışma Süresi), `performansYenile` (Kurye Net Çalışma Süresi)
- **Okuyan:** `exportJSON` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `kuryeSisteminiKur`
- **Zamanla çalışan:** tabloda düzenleme olunca (`onEdit`)
- **Elle çalıştırılan:** menü: ⚡ Tüm Sistemi Kur / Güncelle (`kuryeSisteminiKur`), menü: 🌐 JSON Dışa Aktar (HTML panel için) (`exportJSON`), menü: 💰 Sadece Bordroyu Yenile (veri çekmez) (`bordroYenile`), menü: 📊 Sadece Performansı Yenile (veri çekmez) (`performansYenile`), menü: 🔄 VERİYİ ÇEK ve TÜMÜNÜ YENİLE (`hepsiniYenile`)

#### Kurye_Odemeleri

- **Yazan:** `kuryeOdendiIsle_` (BAP Panel Veri Kapısı)
- **Okuyan:** `kuryeOdemeDurumu_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `kuryeOdendiIsle_`
- **Adıyla aranan sütunlar:** `BAP_Tutar`, `Bitiş`, `Durum`, `Haddy_Tutar`, `Hafta`, `Kayıt_Zamanı`, `Kaynak`
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Mesai (Ham)

- **Yazan:** `_kopruGunYaz` (Kurye Net Çalışma Süresi), `bosMesaiSatirlariniTemizle` (Kurye Net Çalışma Süresi), `mesaiBozukGunleriSil` (Kurye Net Çalışma Süresi), `mesaiCek` (Kurye Net Çalışma Süresi), `mesaiGunSil` (Kurye Net Çalışma Süresi), `mesaiSutunEkle` (Kurye Net Çalışma Süresi)
- **Okuyan:** `kuryeMaliyeti_` (BAP Rapor Ajanı), `_kuyrukDetay` (Kurye Net Çalışma Süresi), `kapanisDenetimi` (Kurye Net Çalışma Süresi), `kuraliUygula` (Kurye Net Çalışma Süresi), `mesaiYenidenKur` (Kurye Net Çalışma Süresi), `nedenEksikDegil` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `_kopruGunYaz`, `mesaiCek`
- **Adıyla aranan sütunlar:** `Çıkış`, `Durum`, `Giriş`, `Ham (dk)`, `Ham Süre`, `İlk Paket`, `İptal`, `Kurye`, `Oturum`, `Oturumlar`, `Paket`, `Planlı Çıkış`, `Planlı Giriş`, `Son Sipariş`, `Son Sipariş Çıkış`, `Son Sipariş Km`, `Tarih`, `Teslim`
- Olası başka sütunlar: 7 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** haftada bir 09:00 (`haftalikRapor`), her 15 dk (`guncelle`)
- **Elle çalıştırılan:** menü: ⚙️ Kesinti Kuralını Uygula (`kuraliUygula`), menü: 🌉 Köprü Durumu (`kopruDurum`), menü: 📥 HemenYolda'dan Mesai Çek (`mesaiCek`), menü: 🔄 VERİYİ ÇEK ve TÜMÜNÜ YENİLE (`hepsiniYenile`), menü: 🧹 Bozuk Mesai Günlerini Sil (onarım) (`mesaiBozukGunleriSil`)
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru)

#### Mesai Düzeltme

- **Yazan:** `mesaiDuzelt_` (BAP Panel Veri Kapısı)
- **Okuyan:** `mesaiDuzeltmeListesi_` (BAP Panel Veri Kapısı), `_duzeltmeOku` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `mesaiDuzelt_`
- **Adıyla aranan sütunlar:** `Açıklama`, `Esas Çıkış`, `Esas Giriş`, `Giren`, `Kayıt Zamanı`, `Kurye`, `Tarih`, `Yöntem`
- **Zamanla çalışan:** her 15 dk (`guncelle`)
- **Elle çalıştırılan:** menü: ⚙️ Kesinti Kuralını Uygula (`kuraliUygula`), menü: 🔄 VERİYİ ÇEK ve TÜMÜNÜ YENİLE (`hepsiniYenile`)
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru), Yönetim paneli (bap-panel Worker)

#### Pluxee

- **Yazan:** `yemekKartiTasi_` (Kurye Net Çalışma Süresi)

#### Pluxee Kod

- **Yazan:** `pluxeeKodKaydet` (Kurye Net Çalışma Süresi), `pluxeeKodYaz` (Kurye Net Çalışma Süresi)
- **Okuyan:** `doPost` (Kurye Net Çalışma Süresi)
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru)

#### Siparişler

- **Yazan:** `_kopruGunYaz` (Kurye Net Çalışma Süresi), `_sheet` (Kurye Net Çalışma Süresi), `guncelle` (Kurye Net Çalışma Süresi), `siparisleriCek` (Kurye Net Çalışma Süresi)
- **Okuyan:** `tahsilSenkron` (Adisyo Sipariş Toplayıcı), `nabizKontrol` (BAP Günlük Yedek), `acikKanit_` (BAP Panel Veri Kapısı), `kurye_` (BAP Panel Veri Kapısı), `kuryeEslestirme_` (BAP Panel Veri Kapısı), `musteriDetay_` (BAP Panel Veri Kapısı), `rotaHesapla_` (BAP Panel Veri Kapısı), `seferler_` (BAP Panel Veri Kapısı), `sipHesapOku_` (BAP Panel Veri Kapısı), `tahsilatlariAdisyoyaIsle_` (BAP Panel Veri Kapısı), `kuryeMaliyeti_` (BAP Rapor Ajanı), `_acikHesapGunleri` (Kurye Net Çalışma Süresi), `_ozetTablodan` (Kurye Net Çalışma Süresi), `_siparisliGunler` (Kurye Net Çalışma Süresi), `_siparisOzeti` (Kurye Net Çalışma Süresi), `_wSiparisOku` (Kurye Net Çalışma Süresi), `acikHesaplar` (Kurye Net Çalışma Süresi), `gecikmeDokumu` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `_sheet`
- **Adıyla aranan sütunlar:** `Adisyon No`, `Adres`, `Atama (dk)`, `Atandı`, `Durum`, `Hazırlık (dk)`, `Hesap`, `Kurye`, `Masa Siparişi`, `Mesafe (km)`, `Müşteri`, `Not`, `Ödeme Yöntemi`, `Platform`, `Restorandan Çıktı`, `Sipariş ID`, `Sipariş İçeriği`, `Sipariş Kanalı`, `Sipariş No`, `Sipariş Saati`, `Sipariş Tarihi`, `Sipariş Tipi`, `Şube`, `Tarih`, `Telefon`, `Teslim Saati`, `Toplam (dk)`, `Tutar (TL)`, `Ürün Adedi`, `Yol (dk)`, `Yolda`
- Olası başka sütunlar: 38 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her saat (`tahsilSenkron`), her gün (`nabizKontrol`), her saat (`puantajTaramasi`), haftada bir 09:00 (`haftalikRapor`), her 15 dk (`guncelle`)
- **Elle çalıştırılan:** ekran: Panel.html (`panelVeri`), menü: ⏱️ Teslimat Gecikme Dökümü (`gecikmeDokumu`), menü: ⚙️ Kesinti Kuralını Uygula (`kuraliUygula`), menü: 🌉 Köprü Durumu (`kopruDurum`), menü: 📥 HemenYolda'dan Mesai Çek (`mesaiCek`), menü: 🔄 VERİYİ ÇEK ve TÜMÜNÜ YENİLE (`hepsiniYenile`)
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru), Yönetim paneli (bap-panel Worker)

#### Tahsilatlar

- **Yazan:** `hesapKapat_` (BAP Panel Veri Kapısı), `kartAjanCalis_` (BAP Panel Veri Kapısı), `tahsilatlariAdisyoyaIsle_` (BAP Panel Veri Kapısı), `tahsilatSekmesi_` (BAP Panel Veri Kapısı)
- **Okuyan:** `kullanilanRef_` (BAP Panel Veri Kapısı), `tahsilatlar_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `tahsilatSekmesi_`
- **Adıyla aranan sütunlar:** `Adisyo Durumu`, `Adisyon No`, `Bahşiş`, `Bahşiş (TL)`, `İşlem`, `Kayıt Zamanı`, `Kaynak`, `Kurye`, `Not`, `Ödeme Yöntemi`, `Sipariş ID`, `Sipariş Tarihi`, `Tarih`, `Tutar`, `Tutar (TL)`
- Olası başka sütunlar: 3 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her saat (`puantajTaramasi`)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Teslimat Gecikmeleri

- **Yazan:** `gecikmeDokumu` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `gecikmeDokumu`
- Olası başka sütunlar: 8 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her 15 dk (`guncelle`)
- **Elle çalıştırılan:** menü: ⏱️ Teslimat Gecikme Dökümü (`gecikmeDokumu`), menü: ⚙️ Kesinti Kuralını Uygula (`kuraliUygula`), menü: 🔄 VERİYİ ÇEK ve TÜMÜNÜ YENİLE (`hepsiniYenile`)
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru)

#### Veri Kontrol

- **Yazan:** `veriKontrolCiz` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `veriKontrolCiz`
- **Elle çalıştırılan:** menü: ⚡ Tüm Sistemi Kur / Güncelle (`kuryeSisteminiKur`), menü: 💰 Sadece Bordroyu Yenile (veri çekmez) (`bordroYenile`), menü: 📊 Sadece Performansı Yenile (veri çekmez) (`performansYenile`), menü: 🔄 VERİYİ ÇEK ve TÜMÜNÜ YENİLE (`hepsiniYenile`), menü: 🔍 Veri Kontrol (hatalı satırları bul) (`veriKontrolCalistir`)

### MUSTERI — Birlesik Musteri Veritabani

#### Adres_Aday

- **Yazan:** `adayYaz_` (Adisyo Sipariş Toplayıcı)
- **Yoksa oluşturan:** `adayYaz_`

#### Ana Musteri - Canli

- **Okuyan:** `musteriSaglikRaporu` (Adisyo Sipariş Toplayıcı)
- Olası başka sütunlar: 9 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)

#### Ana Musteri Listesi

- **Yazan:** `etiketleriUygula` (Adisyo Sipariş Toplayıcı), `musteriTazele` (Adisyo Sipariş Toplayıcı), `musteriUpsert_` (Adisyo Sipariş Toplayıcı), `dusukPuanlariIsle` (Trendyol Veri Çekme)
- **Okuyan:** `hangiTablo` (Adisyo Sipariş Toplayıcı), `listelenenSenkron` (Adisyo Sipariş Toplayıcı), `musteriEtiketleri_` (Adisyo Sipariş Toplayıcı), `musteriSaglikRaporu` (Adisyo Sipariş Toplayıcı), `tySutunlariniAc` (Adisyo Sipariş Toplayıcı), `nabizKontrol` (BAP Günlük Yedek)
- Olası başka sütunlar: 9 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her 15 dk (`etiketleriUygula`), her 5 dk (`siparisDongusu`), her gün (`musteriTazele`), her gün (`nabizKontrol`), her gün (`yorumlariCek`)

#### Etiket_Girisi

- **Yazan:** `etiketleriUygula` (Adisyo Sipariş Toplayıcı)
- **Okuyan:** `nabizKontrol` (BAP Günlük Yedek)
- **Zamanla çalışan:** her 15 dk (`etiketleriUygula`), her gün (`nabizKontrol`)

#### Kontrol Edilecek Eşleşmeler

- **Okuyan:** `onayliAnahtarlar_` (Adisyo Sipariş Toplayıcı)

#### Telafi_Listesi

- **Yazan:** `telafiKontrol_` (Adisyo Sipariş Toplayıcı), `telafiSheet_` (Adisyo Sipariş Toplayıcı), `ycTelafiYaz_` (Trendyol Veri Çekme)
- **Okuyan:** `ilkKurulum` (Adisyo Sipariş Toplayıcı), `telafiBekleyenler_` (Adisyo Sipariş Toplayıcı)
- **Yoksa oluşturan:** `telafiSheet_`
- **Adıyla aranan sütunlar:** `Durum`, `İsim`, `Kullanıldığı Sipariş`, `Kullanım Tarihi`, `Not`, `Sorun`, `Söz verilen`, `Tarih`, `Telefon`
- Olası başka sütunlar: 25 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her 5 dk (`siparisDongusu`), her 15 dk (`yorumCevapCalistir`)

#### Telefonsuz (Getir-Trendyol)

- **Yazan:** `musteriTazele` (Adisyo Sipariş Toplayıcı), `anahtarlariYenidenUret` (Trendyol Veri Çekme), `dusukPuanlariIsle` (Trendyol Veri Çekme)
- **Okuyan:** `musteriSaglikRaporu` (Adisyo Sipariş Toplayıcı), `tyHarita_` (Adisyo Sipariş Toplayıcı), `nabizKontrol` (BAP Günlük Yedek), `sorunluMu` (Trendyol Veri Çekme)
- Olası başka sütunlar: 9 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her 5 dk (`siparisDongusu`), her gün (`musteriTazele`), her gün (`nabizKontrol`), her gün (`yorumlariCek`)

### PERSONEL — BAP Personel (BAP_Personel projesi bağlı; puantaj, vardiya, izin)

#### Avans_Masraf

- **Yazan:** `avansGir_` (BAP Panel Veri Kapısı)
- **Okuyan:** `bordroVeri_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `avansGir_`
- Olası başka sütunlar: 18 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Ayarlar

- **Okuyan:** `ayarAl` (BAP_Personel), `onbellekleriDoldur` (BAP_Personel)
- **Zamanla çalışan:** her gün 03:00 (`gece_kontrol`), her gün 17:00 (`gunlukDevamsizIsaretle`)

#### Islem_Loglari

- **Yazan:** `avansGir_` (BAP Panel Veri Kapısı), `personelBilgiGir_` (BAP Panel Veri Kapısı), `personelEkle_` (BAP Panel Veri Kapısı), `puSatirHesapla_` (BAP Panel Veri Kapısı), `vardiyaGir_` (BAP Panel Veri Kapısı), `logEkle` (BAP_Personel), `loglariTemizle` (BAP_Personel)
- Olası başka sütunlar: 10 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her saat (`puantajTaramasi`), tabloda düzenleme olunca (`puantajTabloDegisti`), her gün 03:00 (`gece_kontrol`), her gün 17:00 (`gunlukDevamsizIsaretle`)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Izinler

- **Okuyan:** `izinSayfasi` (BAP_Personel)

#### İzinler

- **Yazan:** `izinSayfasi` (BAP_Personel), `izinTalebiKarar` (BAP_Personel), `izinTalebiKaydet` (BAP_Personel)
- **Okuyan:** `bekleyenIzinler` (BAP_Personel)
- **Yoksa oluşturan:** `izinSayfasi`

#### Odemeler

- **Yazan:** `odemeSayfasi` (BAP_Personel)
- **Okuyan:** `odemeKayitlari_` (BAP Panel Veri Kapısı), `odemeleriOku` (BAP_Personel)
- **Yoksa oluşturan:** `odemeSayfasi`
- **Adıyla aranan sütunlar:** `Ad Soyad`, `Ay`, `Çalışan`, `Dönem`, `İsim`, `İsim Soyisim`, `Maaş`, `Maaş Ayı`, `Net`, `Net Ödeme`, `Ödeme Ayı`, `Ödeme Tarihi`, `Ödenen`, `Ödenen Tutar`, `Personel`, `Tarih`, `Toplam`, `Tutar`

#### Personel

- **Yazan:** `personelBilgiGir_` (BAP Panel Veri Kapısı), `personelEkle_` (BAP Panel Veri Kapısı), `personelGuncelleKaydet` (BAP_Personel), `yeniPersonelEkle` (BAP_Personel)
- **Okuyan:** `getCalisanlar` (BAP PANEL Backend), `sifreKontrol` (BAP PANEL Backend), `avansGir_` (BAP Panel Veri Kapısı), `bordroVeri_` (BAP Panel Veri Kapısı), `personel_` (BAP Panel Veri Kapısı), `personelBilgileri_` (BAP Panel Veri Kapısı), `vardiyaGir_` (BAP Panel Veri Kapısı), `personelBilgi` (BAP_Personel), `pinGuncelle` (BAP_Personel), `yoneticiHub` (BAP_Personel)
- **Adıyla aranan sütunlar:** `Aktif`, `Departman`, `IBAN`, `İsim Soyisim`, `İşe Giriş`, `Maaş`, `PIN`, `Pin`, `SGK lı`, `Sifre`, `Sube`, `Şifre`, `Şube`, `Telefon Numarası`
- Olası başka sütunlar: 16 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 03:00 (`gece_kontrol`), her gün 17:00 (`gunlukDevamsizIsaretle`)
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev), Yönetim paneli (bap-panel Worker)

#### Personel_Giris_Cikis

- **Yazan:** `doGet` (BAP_Personel), `eksikCikislariTamamla` (BAP_Personel), `gunlukDevamsizIsaretle` (BAP_Personel), `izinTalebiSatirlariEkle` (BAP_Personel), `resmiTatilleriYenidenIsaretle` (BAP_Personel), `topluYenidenHesapla` (BAP_Personel)
- **Okuyan:** `bordroVeri_` (BAP Panel Veri Kapısı), `personel_` (BAP Panel Veri Kapısı), `puBaglam_` (BAP Panel Veri Kapısı), `vardiyaPlani_` (BAP Panel Veri Kapısı), `anaSayfa` (BAP_Personel), `aylikTrendHesapla` (BAP_Personel), `calisanDashboardSayfasi` (BAP_Personel), `gunlukOzetGonder` (BAP_Personel), `izinTalebiKarar` (BAP_Personel), `personelYonetimPaneli` (BAP_Personel), `planIzinleriIsaretle` (BAP_Personel), `puantajDenetim` (BAP_Personel)
- Olası başka sütunlar: 9 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her saat (`puantajTaramasi`), tabloda düzenleme olunca (`puantajTabloDegisti`), her gün 03:00 (`gece_kontrol`), her gün 17:00 (`gunlukDevamsizIsaretle`)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Personel_Giris_Cİkis

- **Okuyan:** `bordroVeri_` (BAP Panel Veri Kapısı), `personel_` (BAP Panel Veri Kapısı), `puBaglam_` (BAP Panel Veri Kapısı), `vardiyaPlani_` (BAP Panel Veri Kapısı)
- **Dolaylı yazabilir** (sekmeyi başka bir yapıya verip orada yazdırıyor olabilir): `puBaglam_`
- **Adıyla aranan sütunlar:** `Çıkış Açıklaması`, `Devamsızlık`, `Fazla Mesai`, `Giriş Açıklaması`, `Gps`, `Gün Genel Notu`, `Ham Çıkış`, `Ham Giriş`, `İsim Soyisim`, `Kayıt Okutma`, `Kayıt Okutma (Gün)`, `Manuel`, `Mesai Çıkış`, `Mesai Giriş`, `OFF Günü`, `Rapor`, `Toplam mesai`, `Ücretsiz İzin`, `Yıllık İzin`
- Olası başka sütunlar: 6 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her saat (`puantajTaramasi`), tabloda düzenleme olunca (`puantajTabloDegisti`)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Resmi_tatiller

- **Okuyan:** `bordroVeri_` (BAP Panel Veri Kapısı), `resmiTatilleriYenidenIsaretle` (BAP_Personel), `resmiTatilMi` (BAP_Personel)
- Olası başka sütunlar: 9 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)

#### Vardiya

- **Yazan:** `vardiyaGir_` (BAP Panel Veri Kapısı), `vardiyaCizelgeKaydet` (BAP_Personel), `vardiyaGuneYaz_` (BAP_Personel)
- **Okuyan:** `personel_` (BAP Panel Veri Kapısı), `puVardiya_` (BAP Panel Veri Kapısı), `vardiyaPlani_` (BAP Panel Veri Kapısı), `aktifSubeBul` (BAP_Personel), `aylikPlanlananVardiyaSaati` (BAP_Personel), `calisanDashboardSayfasi` (BAP_Personel), `gunlukDevamsizIsaretle` (BAP_Personel), `izinTalebiKarar` (BAP_Personel), `onbellekleriDoldur` (BAP_Personel), `personelGunlukVardiyaAl` (BAP_Personel), `planIzinleriIsaretle` (BAP_Personel), `tumEkipHaftalikVardiyaAl` (BAP_Personel), `yoneticiHub` (BAP_Personel)
- **Yoksa oluşturan:** `vardiyaCizelgeKaydet`
- **Adıyla aranan sütunlar:** `Hafta`, `Hafta (Pazartesi)`, `İsim Soyisim`, `Off`, `Planlanan`, `Sube`, `Şube`
- **Zamanla çalışan:** her saat (`puantajTaramasi`), tabloda düzenleme olunca (`puantajTabloDegisti`), her gün 03:00 (`gece_kontrol`), her gün 17:00 (`gunlukDevamsizIsaretle`)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

### SATIS — BAP Adisyo Sipariş Datası (Make.com doldurur)

#### Eski_…

- **Yazan:** `eskiVeriyiDonustur` (Adisyo Sipariş Toplayıcı)
- **Yoksa oluşturan:** `eskiVeriyiDonustur`
- Olası başka sütunlar: 27 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)

#### Satıs Verileri

- **Yazan:** `acikSiparisleriGuncelle_` (Adisyo Sipariş Toplayıcı), `etiketNotlariniDoldur` (Adisyo Sipariş Toplayıcı), `hazirlanmaOnar` (Adisyo Sipariş Toplayıcı), `hazirlanmaOnar2` (Adisyo Sipariş Toplayıcı), `ilkKurulum` (Adisyo Sipariş Toplayıcı), `kanallariDuzelt` (Adisyo Sipariş Toplayıcı), `mahalleleriDoldur` (Adisyo Sipariş Toplayıcı), `saGuncelle_` (Adisyo Sipariş Toplayıcı), `saRapor_` (Adisyo Sipariş Toplayıcı), `subeAtamaKurulum` (Adisyo Sipariş Toplayıcı), `subeAtamaTest` (Adisyo Sipariş Toplayıcı), `tahsilSenkron` (Adisyo Sipariş Toplayıcı), `tamamlananlariIsle_` (Adisyo Sipariş Toplayıcı), `yeniSiparisleriIsle_` (Adisyo Sipariş Toplayıcı), `eskileriIsaretle` (Stok Takip Sistemi), `satislariIsle` (Stok Takip Sistemi)
- **Okuyan:** `dataSheet_` (Adisyo Sipariş Toplayıcı), `eskiVeriyiDonustur` (Adisyo Sipariş Toplayıcı), `musteriSaglikRaporu` (Adisyo Sipariş Toplayıcı), `musteriTazele` (Adisyo Sipariş Toplayıcı), `saSekme_` (Adisyo Sipariş Toplayıcı), `tazelemeBaslangicAyarla` (Adisyo Sipariş Toplayıcı), `tazelemeDurum` (Adisyo Sipariş Toplayıcı), `nabizKontrol` (BAP Günlük Yedek), `acikKanit_` (BAP Panel Veri Kapısı), `adisyoSatirlari_` (BAP Panel Veri Kapısı), `kuryeEslestirIslem_` (BAP Panel Veri Kapısı), `siparisVerisiOku_` (BAP Panel Veri Kapısı), `subeSozlugu_` (BAP Panel Veri Kapısı), `tahsilatlariAdisyoyaIsle_` (BAP Panel Veri Kapısı), `maliyetBolumu_` (BAP Rapor Ajanı), `satisBolumu_` (BAP Rapor Ajanı), `adetKontrol` (Stok Takip Sistemi), `hp_talep_` (Stok Takip Sistemi), `kaynakBasliklar` (Stok Takip Sistemi), `kaynakSayfa` (Stok Takip Sistemi), `rc_satisAdetleri_` (Stok Takip Sistemi), `siparisHaritasi_` (Trendyol Veri Çekme), `tyrSatisOku_` (Trendyol Veri Çekme)
- **Adıyla aranan sütunlar:** `Durum`, `Hazırlanma (Şube Çıkış)`, `Kurye`, `Mahalle`, `Marka`, `Masa Siparişi`, `Motor_Islendi`, `Müşteri Adı`, `Müşteri Adres`, `Müşteri Telefon`, `Not`, `Ödeme Alındı`, `Ödeme Yöntemi`, `Sipariş ID`, `Sipariş Kanalı`, `Sipariş No (Gün İçi Sıra)`, `Sipariş Tarihi`, `Sipariş Tipi`, `Şube`, `Tahsil Tipi`, `Tarih_ISO`, `Teslim Zamanı`, `Toplam Tutar`, `Ürün Adetleri`, `Ürün Çıkan Şube`, `Ürün Fiyatları`, `Ürün Kategorileri`, `Ürünler`
- Olası başka sütunlar: 38 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her 5 dk (`siparisDongusu`), her gün (`musteriTazele`), her gün 04:30 (`gunlukSubeRaporu`), her saat (`subeAtamaGuncelle`), her saat (`tahsilSenkron`), her gün (`nabizKontrol`), her saat (`puantajTaramasi`), haftada bir 09:00 (`haftalikRapor`), haftada bir 09:00 (`rc_kontrolEt`), her 5 dk (`stokMotoru`), her gün 23:30 (`hp_gunluk`), her 10 dk (`iadeleriCek`), her 15 dk (`yorumCevapCalistir`), her gün (`yorumlariCek`), her gün 10:45 (`sabahOzeti`), her gün 23:50 (`gunlukPuanRaporu`)
- **Elle çalıştırılan:** menü: Manuel Satış İşle (`stokMotoru`)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Sistem_Nabzi

- **Yazan:** `nabizYaz_` (BAP Günlük Yedek)
- **Okuyan:** `nabiz_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `nabizYaz_`
- **Zamanla çalışan:** her gün (`nabizKontrol`)

### SATIS2 — BAP veri tablosu (Detay sekmesi)

#### Detay

- **Okuyan:** `rsAdisyoUrunleriTopla` (Stok Takip Sistemi)

#### Kesilen Fişler

- **Okuyan:** `fisKayit_` (BAP Panel Veri Kapısı)
- **Adıyla aranan sütunlar:** `Adet`, `Gün`, `Kayıt Zamanı`, `Tutar`

#### Listelenen Müşteriler

- **Yazan:** `listelenenSenkron` (Adisyo Sipariş Toplayıcı)
- **Zamanla çalışan:** her 15 dk (`etiketleriUygula`)

#### Make.com Data

- **Okuyan:** `eskiVeriyiDonustur` (Adisyo Sipariş Toplayıcı), `siparisKalemleriniYaz` (BAP Satış Veri Ambarı)
- Olası başka sütunlar: 27 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)

### STOK — BAP Stok Takip Sistemi

#### Ajan_Sorular

- **Yazan:** `ajSorulariYaz_` (Stok Takip Sistemi)
- **Okuyan:** `ajSorularOku_` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `ajSorulariYaz_`
- **Zamanla çalışan:** her gün 05:00 (`ajanGecelik`)

#### Alis_Bekleyen_Ozet

- **Yazan:** `alisBekleyenOzeti` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `alisBekleyenOzeti`

#### Alis_Bekleyenler

- **Yazan:** `bekleyenYaz_` (Stok Takip Sistemi)
- **Okuyan:** `ap_eslestirmeVeri_` (Kolaybi Fatura Ham Veri), `ajBekleyen_` (Stok Takip Sistemi), `alisBekleyenOzeti` (Stok Takip Sistemi), `arsivKontrol` (Stok Takip Sistemi), `bekleyenleriGoster` (Stok Takip Sistemi), `denetim2` (Stok Takip Sistemi), `denetimRaporuBAP` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `bekleyenYaz_`
- Olası başka sütunlar: 1 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 00:30 (`alisIsle`), her gün 05:00 (`ajanGecelik`), her gün 14:30 (`alisIsle`)

#### Ambalaj_Hammadde

- **Okuyan:** `getAmbalajUrunler` (BAP PANEL Backend), `zayiAmbalajBul_` (BAP PANEL Backend), `maliyetTanimlari_` (BAP Panel Veri Kapısı), `rsBilesenleriTopla` (Stok Takip Sistemi)
- **Adıyla aranan sütunlar:** `Birim`, `Hammadde`, `Hammadde_Adı`, `Kategori`, `Koli_Icerik`, `Min_Stok_Uyarı`, `Ölçü_Birimi`, `Sipariş paket durumu`, `Son Alış Fiyatı`, `Stok_Takip`, `Tedarikçi`, `Tedarikçi Sipariş Aktif`
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev), Yönetim paneli (bap-panel Worker)

#### Ambalaj_Kurallari

- **Okuyan:** `zayiAmbalajKurallari_` (BAP PANEL Backend), `maliyetTanimlari_` (BAP Panel Veri Kapısı), `ambalajKurallari` (BAP Maliyet Modülü), `ambalajHaritasi_` (Stok Takip Sistemi), `ambalajKurallari` (Stok Takip Sistemi)
- **Zamanla çalışan:** her gün (`maliyetRaporu`), tabloda düzenleme olunca (`detayTetik`), her 5 dk (`stokMotoru`), her gün 00:30 (`alisIsle`), her gün 05:00 (`ajanGecelik`), her gün 14:30 (`alisIsle`)
- **Elle çalıştırılan:** menü: Manuel Satış İşle (`stokMotoru`)
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev), Yönetim paneli (bap-panel Worker)

#### Ambalaj_Teshis

- **Yazan:** `ambalajTeshis` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `ambalajTeshis`
- **Adıyla aranan sütunlar:** ` İÇERİĞİ`

#### Bilesen_Listesi

- **Yazan:** `rsBilesenListesiYaz` (Stok Takip Sistemi)
- **Okuyan:** `rsReceteTablosuKur` (Stok Takip Sistemi)

#### Cift_Siparis_Raporu

- **Yazan:** `ciftSiparisBul` (BAP PANEL Backend)
- **Yoksa oluşturan:** `ciftSiparisBul`
- Olası başka sütunlar: 9 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)

#### Direktsatisurunler

- **Okuyan:** `getDirektSatisUrunler` (BAP PANEL Backend), `maliyetTanimlari_` (BAP Panel Veri Kapısı), `denetim2` (Stok Takip Sistemi), `direktSatisHaritasi_` (Stok Takip Sistemi), `dsHaritasi` (Stok Takip Sistemi), `rsBilesenleriTopla` (Stok Takip Sistemi)
- **Dolaylı yazabilir** (sekmeyi başka bir yapıya verip orada yazdırıyor olabilir): `direktSatisHaritasi_`
- **Adıyla aranan sütunlar:** `Birim`, `Hammadde`, `Hammadde_Adı`, `Hammadde_Adi`, `Kategori`, `Koli_Icerik`, `Koli_İçerik`, `Min_Stok_Uyarı`, `Olcu_Birimi`, `Ölçü_Birimi`, `Sipariş paket durumu`, `Son Alış Fiyatı`, `Son_Alis_Fiyati`, `Tedarikçi`, `Tedarikçi Sipariş Aktif`, `Urun_adi`
- **Zamanla çalışan:** her 5 dk (`stokMotoru`), her gün 00:30 (`alisIsle`), her gün 05:00 (`ajanGecelik`), her gün 14:30 (`alisIsle`), tabloda düzenleme olunca (`detayTetik`)
- **Elle çalıştırılan:** menü: Manuel Satış İşle (`stokMotoru`)
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev), Yönetim paneli (bap-panel Worker)

#### Duzenlenmis_Liste

- **Okuyan:** `denetimRaporuBAP` (Stok Takip Sistemi)

#### Eski_Urun_Isimleri

- **Yazan:** `arsivKontrol` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `arsivKontrol`
- Olası başka sütunlar: 1 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)

#### Fatura_Demirbas

- **Yazan:** `eksikUrunler` (Stok Takip Sistemi)
- Olası başka sütunlar: 4 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)

#### Fatura_Eksik_Urunler

- **Yazan:** `eksikUrunler` (Stok Takip Sistemi), `onerileriUygula` (Stok Takip Sistemi), `oneriUret` (Stok Takip Sistemi)
- **Okuyan:** `denetimRaporuBAP` (Stok Takip Sistemi)
- Olası başka sütunlar: 4 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)

#### Fatura_Eslestirme

- **Yazan:** `ap_eslestirmeKaydet_` (Kolaybi Fatura Ham Veri), `ajEslestirme_` (Stok Takip Sistemi), `alisIsle_` (Stok Takip Sistemi), `eslesmeSekmesi_` (Stok Takip Sistemi), `eslestirmeDoldur` (Stok Takip Sistemi)
- **Okuyan:** `ap_eslestirmeVeri_` (Kolaybi Fatura Ham Veri), `denetimRaporuBAP` (Stok Takip Sistemi), `sonAlisFiyatlariniDoldur` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `eslesmeSekmesi_`
- **Adıyla aranan sütunlar:** `Carpan`, `Çarpan`, `Fatura_Urun_Adi`, `Not`, `Stok_Urun_Adi`, `Tedarikci`, `Tedarikçi`, `Tip`
- **Zamanla çalışan:** her gün 00:30 (`alisIsle`), her gün 05:00 (`ajanGecelik`), her gün 14:30 (`alisIsle`)

#### Fatura_Ev_Alimlari

- **Yazan:** `eksikUrunler` (Stok Takip Sistemi)
- Olası başka sütunlar: 4 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)

#### Fiyat_Kontrol

- **Yazan:** `fiyatOnaylariniUygula` (Stok Takip Sistemi), `sonAlisFiyatDoldur_` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `sonAlisFiyatDoldur_`
- **Adıyla aranan sütunlar:** `durum`, `onay`, `satir`, `tablo`, `urun`, `yeni_j`
- **Zamanla çalışan:** her gün 00:30 (`alisIsle`), her gün 05:00 (`ajanGecelik`), her gün 14:30 (`alisIsle`)

#### Fiyat_Log

- **Yazan:** `fiyatlariGuncelleOtomatik` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `fiyatlariGuncelleOtomatik`
- **Zamanla çalışan:** her gün 00:40 (`fiyatlariGuncelleOtomatik`), her gün 14:40 (`fiyatlariGuncelleOtomatik`)

#### Maliyet_Detay

- **Yazan:** `detayListesiGuncelle` (BAP Maliyet Modülü), `detaySekmesi` (BAP Maliyet Modülü), `maliyetDetay` (BAP Maliyet Modülü), `detayListesiGuncelle` (Stok Takip Sistemi), `detaySekmesi` (Stok Takip Sistemi), `maliyetDetay` (Stok Takip Sistemi)
- **Okuyan:** `kurulum` (BAP Maliyet Modülü), `kurulum` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `detaySekmesi`, `detaySekmesi`, `maliyetDetay`
- **Adıyla aranan sütunlar:** `≈ TL/kg`, `Birim fiyat (J/H)`, `Eşleşen tablo adı`, `Maliyet (TL)`, `Malzeme`, `Not`, `Paket fiyatı (J)`, `Paket içeriği (H)`, `Reçete birimi`, `Reçete miktarı`, `Stok birimi (I)`, `Stok birimine çevrilmiş`, `Tedarikçi`, `Tür`
- **Zamanla çalışan:** her gün (`maliyetRaporu`), tabloda düzenleme olunca (`detayTetik`)

#### Maliyet_Eslestirme

- **Okuyan:** `maliyetTanimlari_` (BAP Panel Veri Kapısı)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Recete_Onerileri

- **Yazan:** `submitRecipeSuggestion` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `submitRecipeSuggestion`
- **Elle çalıştırılan:** ekran: Index.html (`submitRecipeSuggestion`)

#### Satis_Hareketleri

- **Yazan:** `dusumleriUygula` (Stok Takip Sistemi), `satisSiparisIdleriniDoldur` (Stok Takip Sistemi), `sm_geriAl` (Stok Takip Sistemi), `ymStokTakipBirimineGec` (Stok Takip Sistemi)
- **Okuyan:** `denetimRaporuBAP` (Stok Takip Sistemi), `sayimVeTop20` (Stok Takip Sistemi), `top20Duzeltilmis` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `dusumleriUygula`, `sm_geriAl`
- **Zamanla çalışan:** her 5 dk (`stokMotoru`)
- **Elle çalıştırılan:** menü: Manuel Satış İşle (`stokMotoru`)

#### Satis_Uyarilar

- **Yazan:** `sm_uyarilariYaz` (Stok Takip Sistemi)
- **Okuyan:** `denetim2` (Stok Takip Sistemi), `denetimRaporuBAP` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `sm_uyarilariYaz`
- **Zamanla çalışan:** her 5 dk (`stokMotoru`)
- **Elle çalıştırılan:** menü: Manuel Satış İşle (`stokMotoru`)

#### Sayim_Girisleri

- **Yazan:** `sayimKaydet` (BAP PANEL Backend), `sayimTopluKaydet` (BAP PANEL Backend)
- **Okuyan:** `sayimVeTop20` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `sayimKaydet`, `sayimTopluKaydet`
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev)

#### Siparis_Duzeltme_Log

- **Yazan:** `siparisDuzelt` (BAP PANEL Backend)
- **Yoksa oluşturan:** `siparisDuzelt`
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev)

#### Siparis_Kayitlari

- **Yazan:** `ciftSiparisBul` (BAP PANEL Backend), `getAcikSiparisler` (BAP PANEL Backend), `hepsiSubeDuzelt` (BAP PANEL Backend), `malKabul` (BAP PANEL Backend), `siparisDuzelt` (BAP PANEL Backend), `siparisKaydet` (BAP PANEL Backend), `siparisSheet` (BAP PANEL Backend), `siparisWpIsaretle` (BAP PANEL Backend)
- **Okuyan:** `getPlanEkrani` (BAP PANEL Backend), `siparisIndeksi_` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `siparisSheet`
- Olası başka sütunlar: 10 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 00:30 (`alisIsle`), her gün 05:00 (`ajanGecelik`), her gün 14:30 (`alisIsle`)
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev)

#### Stok_Hareketleri

- **Yazan:** `hareketYaz` (BAP PANEL Backend), `sayimTopluKaydet` (BAP PANEL Backend), `alisIsle_` (Stok Takip Sistemi), `alisTarihDuzelt` (Stok Takip Sistemi), `degisimSutunuEkle` (Stok Takip Sistemi), `dusumleriUygula` (Stok Takip Sistemi), `hareketSekmesiAc_` (Stok Takip Sistemi)
- **Okuyan:** `alisAra` (Stok Takip Sistemi), `denetimRaporuBAP` (Stok Takip Sistemi), `sayimVeTop20` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `hareketYaz`, `sayimTopluKaydet`, `dusumleriUygula`, `hareketSekmesiAc_`
- **Zamanla çalışan:** her 5 dk (`stokMotoru`), her gün 00:30 (`alisIsle`), her gün 05:00 (`ajanGecelik`), her gün 14:30 (`alisIsle`)
- **Elle çalıştırılan:** menü: Manuel Satış İşle (`stokMotoru`)
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev)

#### Sube_Duzeltme_Raporu

- **Yazan:** `hepsiSubeDuzelt` (BAP PANEL Backend)
- **Yoksa oluşturan:** `hepsiSubeDuzelt`
- Olası başka sütunlar: 7 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)

#### Sube_Stok

- **Yazan:** `subeStokSheet` (BAP PANEL Backend), `alisIsle_` (Stok Takip Sistemi), `dusumleriUygula` (Stok Takip Sistemi), `sm_geriAl` (Stok Takip Sistemi), `ymStokTakipBirimineGec` (Stok Takip Sistemi)
- **Okuyan:** `subeStokVerisi` (BAP PANEL Backend), `zayiDSStokBul_` (BAP PANEL Backend), `subeStokHaritasi_` (BAP Panel Veri Kapısı), `ajStok_` (Stok Takip Sistemi), `arsivKontrol` (Stok Takip Sistemi), `denetimRaporuBAP` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `subeStokSheet`, `dusumleriUygula`
- **Adıyla aranan sütunlar:** `Mevcut_Stok`, `Sube`, `Şube`, `Tip`, `Urun_Adi`
- Olası başka sütunlar: 1 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her 5 dk (`stokMotoru`), her gün 00:30 (`alisIsle`), her gün 05:00 (`ajanGecelik`), her gün 14:30 (`alisIsle`)
- **Elle çalıştırılan:** menü: Manuel Satış İşle (`stokMotoru`)
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev), Yönetim paneli (bap-panel Worker)

#### Subeler

- **Yazan:** `getSubeler` (BAP PANEL Backend)
- **Yoksa oluşturan:** `getSubeler`
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev)

#### Tbl_Hammaddeler

- **Yazan:** `ap_hammaddeEkle_` (Kolaybi Fatura Ham Veri)
- **Okuyan:** `getHammaddeler` (BAP PANEL Backend), `hmBirimHaritasi` (BAP PANEL Backend), `hmBul_` (BAP PANEL Backend), `uretimKaydet` (BAP PANEL Backend), `maliyetTanimlari_` (BAP Panel Veri Kapısı), `hmHaritasi` (BAP Maliyet Modülü), `hammaddeHaritasi_` (Stok Takip Sistemi), `hmBilgiHaritasi` (Stok Takip Sistemi), `hmHaritasi` (Stok Takip Sistemi), `hmKisaHaritasi_` (Stok Takip Sistemi), `rsBilesenleriTopla` (Stok Takip Sistemi)
- **Dolaylı yazabilir** (sekmeyi başka bir yapıya verip orada yazdırıyor olabilir): `hammaddeHaritasi_`
- **Zamanla çalışan:** her gün (`maliyetRaporu`), tabloda düzenleme olunca (`detayTetik`), her 5 dk (`stokMotoru`), her gün 00:30 (`alisIsle`), her gün 05:00 (`ajanGecelik`), her gün 14:30 (`alisIsle`)
- **Elle çalıştırılan:** menü: Manuel Satış İşle (`stokMotoru`)
- **Etkilenen arayüz:** Cloudflare eski sayfalar, Mutfak paneli (bap-sistem.pages.dev), Yönetim paneli (bap-panel Worker)

#### Tbl_Maliyetler

- **Yazan:** `maliyetRaporu` (BAP Maliyet Modülü), `maliyetRaporu` (Stok Takip Sistemi), `maliyetRaporuOlustur` (Stok Takip Sistemi)
- **Okuyan:** `denetimRaporuBAP` (Stok Takip Sistemi)
- **Yoksa oluşturan:** `maliyetRaporu`, `maliyetRaporu`, `maliyetRaporuOlustur`
- **Adıyla aranan sütunlar:** `Ambalaj Maliyeti (TL, paket servis)`, `Maliyet %`, `Reçete Maliyeti (TL)`, `Satış Fiyatı`, `Son Güncelleme`, `Toplam Maliyet (TL)`, `Uyarılar`, `Ürün Adı`
- **Zamanla çalışan:** her gün (`maliyetRaporu`), tabloda düzenleme olunca (`detayTetik`)

#### Tbl_Receteler

- **Okuyan:** `urunZayiIsle_` (BAP PANEL Backend), `maliyetTanimlari_` (BAP Panel Veri Kapısı), `receteHaritasi` (BAP Maliyet Modülü), `birimDenetimi` (Stok Takip Sistemi), `denetimRaporuBAP` (Stok Takip Sistemi), `getKitchenData` (Stok Takip Sistemi), `maliyetDetayGoster` (Stok Takip Sistemi), `receteHaritasi` (Stok Takip Sistemi)
- **Adıyla aranan sütunlar:** `Birim`, `Hammadde`, `Hammadde_Adı`, `Hammadde_Adi`, `Malzeme`, `Malzeme_Tipi`, `Miktar`, `Tip`, `Tur`, `Tür`, `Urun_Tipi`, `Ürün Tipi`, `Ürün_Tipi`
- **Zamanla çalışan:** her gün (`maliyetRaporu`), tabloda düzenleme olunca (`detayTetik`), her 5 dk (`stokMotoru`)
- **Elle çalıştırılan:** menü: Manuel Satış İşle (`stokMotoru`)
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev), Yönetim paneli (bap-panel Worker)

#### Tbl_UrunEslestirme

- **Yazan:** `rsEslestirmeYaz` (Stok Takip Sistemi)

#### Tbl_UrunRecete

- **Yazan:** `rsReceteTablosuKur` (Stok Takip Sistemi)

#### Tbl_YariMamul

- **Okuyan:** `maliyetTanimlari_` (BAP Panel Veri Kapısı), `ymHaritasi` (BAP Maliyet Modülü), `ymHaritasi` (Stok Takip Sistemi)
- **Adıyla aranan sütunlar:** `Baz_Miktar`, `Baz_Miktari`, `Birim_Agirlik`, `Birim_Ağırlık`, `Cikti_Tipi`, `Çıktı_Tipi`, `Kategori`, `Parti_Miktari`, `Porsiyon_Agirlik`, `Porsiyon_Ağırlık`
- **Zamanla çalışan:** her gün (`maliyetRaporu`), tabloda düzenleme olunca (`detayTetik`), her 5 dk (`stokMotoru`)
- **Elle çalıştırılan:** menü: Manuel Satış İşle (`stokMotoru`)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Tbl_YariMamul tablosuna Cikti_Tipi

- **Okuyan:** `getRecete` (BAP PANEL Backend), `getYariMamuller` (BAP PANEL Backend), `maliyetTanimlari_` (BAP Panel Veri Kapısı), `rsBilesenleriTopla` (Stok Takip Sistemi)
- **Adıyla aranan sütunlar:** `Baz_Miktar`, `Baz_Miktari`, `Birim_Agirlik`, `Birim_Ağırlık`, `Cikti_Tipi`, `Çıktı_Tipi`, `Kategori`, `Parti_Miktari`, `Porsiyon_Agirlik`, `Porsiyon_Ağırlık`
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev), Yönetim paneli (bap-panel Worker)

#### Tbl_YariMamulRecete

- **Okuyan:** `getRecete` (BAP PANEL Backend), `maliyetTanimlari_` (BAP Panel Veri Kapısı), `ymHaritasi` (BAP Maliyet Modülü), `birimDenetimi` (Stok Takip Sistemi), `getKitchenData` (Stok Takip Sistemi), `ymHaritasi` (Stok Takip Sistemi)
- **Adıyla aranan sütunlar:** `Baz_Miktar`, `Birim`, `Hammadde`, `Hammadde_Adı`, `Hammadde_Adi`, `Miktar`
- **Zamanla çalışan:** her gün (`maliyetRaporu`), tabloda düzenleme olunca (`detayTetik`), her 5 dk (`stokMotoru`)
- **Elle çalıştırılan:** menü: Manuel Satış İşle (`stokMotoru`)
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev), Yönetim paneli (bap-panel Worker)

#### Tedarikçi Sevkiyat günleri

- **Okuyan:** `getPlanEkrani` (BAP PANEL Backend), `getSiparisEkrani` (BAP PANEL Backend), `tahminiTeslimGunu` (BAP PANEL Backend), `eksikUrunler` (Stok Takip Sistemi)
- Olası başka sütunlar: 4 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev)

#### Tekrar_Kullanim_Log

- **Yazan:** `tekrarLogYaz_` (BAP PANEL Backend)
- **Okuyan:** `tekrarSonYenileme_` (BAP PANEL Backend)
- **Yoksa oluşturan:** `tekrarLogYaz_`
- **Adıyla aranan sütunlar:** `Calisan`, `Malzeme`, `Sebep`, `Sube`, `Yari_Mamul`, `Zaman`
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev)

#### Transferler

- **Yazan:** `transferDirektCikis` (BAP PANEL Backend), `transferOnayla` (BAP PANEL Backend), `transferReddet` (BAP PANEL Backend), `transferSheet` (BAP PANEL Backend), `transferTalep` (BAP PANEL Backend)
- **Okuyan:** `getTransferler` (BAP PANEL Backend)
- **Yoksa oluşturan:** `transferSheet`
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev)

#### Uretim_Girisleri

- **Yazan:** `uretimKaydet` (BAP PANEL Backend)
- **Okuyan:** `getPlanEkrani` (BAP PANEL Backend), `tekrarDurum_` (BAP PANEL Backend), `denetimRaporuBAP` (Stok Takip Sistemi)
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev)

#### Urun_Durum

- **Yazan:** `rsDurumSekmesiYaz` (Stok Takip Sistemi)

#### Urun_Listesi

- **Okuyan:** `getUrunler` (BAP PANEL Backend), `maliyetTanimlari_` (BAP Panel Veri Kapısı), `rsEslestirmeYaz` (Stok Takip Sistemi), `rsReceteTablosuKur` (Stok Takip Sistemi), `rsUrunleriOku` (Stok Takip Sistemi)
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev), Yönetim paneli (bap-panel Worker)

#### Ürün_Listesi

- **Okuyan:** `maliyetTanimlari_` (BAP Panel Veri Kapısı), `denetimRaporuBAP` (Stok Takip Sistemi)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Zayi_Girisleri

- **Yazan:** `zayiGirisYaz_` (BAP PANEL Backend)
- **Okuyan:** `getPlanEkrani` (BAP PANEL Backend)
- **Etkilenen arayüz:** Mutfak paneli (bap-sistem.pages.dev)

### TRENDYOL — Trendyol Yorumlar (Trendyol API çeker; ayrıntı `docs/trendyol-api.md`)

#### Degerlendirmeler

- **Yazan:** `gecmisiCek` (Trendyol Veri Çekme), `yorumlariCek` (Trendyol Veri Çekme), `yorumlariSirala_` (Trendyol Veri Çekme)
- **Okuyan:** `nabizKontrol` (BAP Günlük Yedek), `musteri_` (BAP Panel Veri Kapısı), `dusukPuanlariIsle` (Trendyol Veri Çekme), `ozetiYenile_` (Trendyol Veri Çekme), `puanTablosuYenile` (Trendyol Veri Çekme), `tyrYorumKovasi_` (Trendyol Veri Çekme)
- **Yoksa oluşturan:** `gecmisiCek`, `yorumlariCek`
- **Adıyla aranan sütunlar:** `Adisyo Sipariş ID`, `Değerlendirme Tarihi`, `Eşleşti`, `Kurye`, `Lezzet`, `Mağaza`, `Mahalle`, `Ortalama`, `Platform Sipariş No`, `Review ID`, `Servis`, `Sipariş Tarihi`, `Şube`, `Teslimat`, `Tutar`, `Ürünler`, `Yorum`
- Olası başka sütunlar: 38 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün (`nabizKontrol`), her gün (`yorumlariCek`), her gün 10:45 (`sabahOzeti`), her gün 23:45 (`puanTablosuYenile`), her gün 23:50 (`gunlukPuanRaporu`)

#### Fiyat_Guncelle

- **Yazan:** `fiyatListesiHazirla` (Trendyol Veri Çekme)
- **Okuyan:** `fiyatDegisenler_` (Trendyol Veri Çekme)
- **Dolaylı yazabilir** (sekmeyi başka bir yapıya verip orada yazdırıyor olabilir): `fiyatDegisenler_`
- **Yoksa oluşturan:** `fiyatListesiHazirla`
- **Adıyla aranan sütunlar:** `Kategori`, `Mevcut Fiyat`, `Not / ZORLA`, `Sonuç`, `Şube`, `Ürün Adı`, `Ürün ID`, `Yeni Fiyat`

#### Fiyat_Log

- **Yazan:** `batchKontrol` (Trendyol Veri Çekme), `fiyatlariGonder` (Trendyol Veri Çekme), `fiyatLogSekmesi_` (Trendyol Veri Çekme)
- **Yoksa oluşturan:** `fiyatLogSekmesi_`

#### Iade_Ozet

- **Yazan:** `iadeOzetiYenile` (Trendyol Veri Çekme)
- **Yoksa oluşturan:** `iadeOzetiYenile`
- Olası başka sütunlar: 41 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 23:50 (`gunlukPuanRaporu`)

#### Iadeler

- **Yazan:** `iadeIslem_` (BAP Panel Veri Kapısı), `iadeKesintileriIsle` (Trendyol Veri Çekme), `iadeleriCek` (Trendyol Veri Çekme), `iadeOzetiYenile` (Trendyol Veri Çekme)
- **Okuyan:** `musteri_` (BAP Panel Veri Kapısı), `sabahOzeti` (Trendyol Veri Çekme)
- **Yoksa oluşturan:** `iadeleriCek`
- **Adıyla aranan sütunlar:** `Adisyo Sipariş ID`, `Bildirildi`, `Claim ID`, `Claim Item ID`, `Durum`, `Düşülecek TL`, `Fotoğraf`, `İade Şekli`, `İşlem`, `İşlem Durumu`, `Kapanış Nedeni`, `Kapanış Tarihi`, `Kesinti Durumu`, `Kurye`, `Kuryeden Düş`, `Mağaza`, `Mahalle`, `Müşteri Notu`, `Oluşma`, `Ön Değerlendirme`, `Sebep`, `Sipariş No`, `Sipariş→Teslim (dk)`, `Son Karar Saati`, `Sorumlu`, `Tutar`, `Tür`, `Ürünler`
- Olası başka sütunlar: 35 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her 10 dk (`iadeleriCek`), her gün 10:45 (`sabahOzeti`), her gün 23:50 (`gunlukPuanRaporu`)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Menu_Fark

- **Yazan:** `farkYaz_` (Trendyol Veri Çekme)
- **Adıyla aranan sütunlar:** `Kategori`, `Ürün`
- **Zamanla çalışan:** her gün 03:30 (`menuCek`)

#### Menu_Ham

- **Yazan:** `hamYaz_` (Trendyol Veri Çekme)
- **Adıyla aranan sütunlar:** `Açıklama`, `Kat. Durum`, `Kategori`, `Opsiyon Grubu`, `Satış Fiyatı`, `Sıra`, `Şube`, `TY Liste Fiyatı`, `Ürün Adı`, `Ürün Durum`, `Ürün ID`
- **Zamanla çalışan:** her gün 03:30 (`menuCek`)

#### Menu_Sorun

- **Yazan:** `sorunYaz_` (Trendyol Veri Çekme)
- **Adıyla aranan sütunlar:** `Detay`, `Satış Fiyatı`, `Sorun Tipi`, `Şube`, `Ürün Adı`, `Ürün ID`
- **Zamanla çalışan:** her gün 03:30 (`menuCek`)

#### Özet

- **Yazan:** `ozetiYenile_` (Trendyol Veri Çekme)
- **Yoksa oluşturan:** `ozetiYenile_`
- Olası başka sütunlar: 11 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün (`yorumlariCek`)

#### Puan_Gunluk

- **Yazan:** `puanTablosuYenile` (Trendyol Veri Çekme)
- **Okuyan:** `puanBolumu_` (BAP Rapor Ajanı)
- **Yoksa oluşturan:** `puanTablosuYenile`
- **Zamanla çalışan:** haftada bir 09:00 (`haftalikRapor`), her gün 23:45 (`puanTablosuYenile`)

#### Puan_Resmi

- **Yazan:** `resmiPuanKaydet_` (Trendyol Veri Çekme)
- **Okuyan:** `puanTablosuYenile` (Trendyol Veri Çekme), `tyrResmiPuanlar_` (Trendyol Veri Çekme)
- **Yoksa oluşturan:** `resmiPuanKaydet_`
- **Zamanla çalışan:** her gün 10:45 (`sabahOzeti`), her gün 23:45 (`puanTablosuYenile`), her gün 23:50 (`gunlukPuanRaporu`)

#### Puan_Siparis

- **Yazan:** `gunlukPuanRaporu` (Trendyol Veri Çekme)
- **Okuyan:** `musteri_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `gunlukPuanRaporu`
- **Adıyla aranan sütunlar:** `Değişim`, `Dünkü Tahmin`, `Fark (TY−Hesap)`, `Hesap 90g`, `Mağaza`, `Normal (4 hafta aynı gün)`, `O Gün Ort.`, `O Gün Yorum`, `Sapma`, `Tarih`, `TY Puanı`, `TY Sipariş`
- Olası başka sütunlar: 33 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 23:50 (`gunlukPuanRaporu`)

#### Puan_Tahmin

- **Yazan:** `tyrTahminKaydet_` (Trendyol Veri Çekme)
- **Okuyan:** `musteri_` (BAP Panel Veri Kapısı), `tyrTahminKayitlari_` (Trendyol Veri Çekme)
- **Yoksa oluşturan:** `tyrTahminKaydet_`
- Olası başka sütunlar: 40 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her gün 23:50 (`gunlukPuanRaporu`)

#### Yorum_Cevap

- **Yazan:** `yorumOnay_` (BAP Panel Veri Kapısı), `ycSekme_` (Trendyol Veri Çekme), `yorumCevapCalistir` (Trendyol Veri Çekme)
- **Okuyan:** `musteri_` (BAP Panel Veri Kapısı), `yorumBekleyenOzeti_` (Trendyol Veri Çekme)
- **Yoksa oluşturan:** `ycSekme_`
- **Adıyla aranan sütunlar:** `Cevap`, `Durum`, `Gönderim`, `Lezzet`, `Mağaza`, `Onay`, `Ortalama`, `Ret Nedeni`, `Review ID`, `Servis`, `Sipariş No`, `Tarih`, `Telafi Sözü`, `Teslim (dk)`, `Teslimat`, `Trendyol Durumu`, `Ürünler`, `Yorum`
- Olası başka sütunlar: 26 (aynı fonksiyon birden fazla sekme açtığı için kesin değil; ayrıntı .html / `ara`)
- **Zamanla çalışan:** her 15 dk (`yorumCevapCalistir`), her gün 10:45 (`sabahOzeti`)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

### YEMEKKARTI — BAP Yemek Kartı Tahsilatları (Pluxee, Edenred, Paye çekimleri)

#### Edenred

- **Yazan:** `edenredYaz` (BAP Yemek Kartı), `_kopruEdenredYaz` (Kurye Net Çalışma Süresi)
- **Okuyan:** `edenredCekimleri_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `edenredYaz`, `_kopruEdenredYaz`
- **Adıyla aranan sütunlar:** `Günsonu Zamanı`, `İşlem Zamanı`, `Kart No`, `Kayıt Zamanı`, `Ref`, `Şube`, `Terminal No`, `Tutar`, `Tutar (TL)`
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru)

#### Fatura Kesimleri

- **Yazan:** `faturaKesimYaz` (BAP Yemek Kartı)
- **Okuyan:** `faturaKesimBugun_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `faturaKesimYaz`
- **Adıyla aranan sütunlar:** `Kart`, `Mesaj`, `Sonuç`, `Tutar (TL)`, `Vade`, `Zaman`
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru)

#### Fatura Tahsil Onayı

- **Yazan:** `faturaTahsilIslem_` (BAP Panel Veri Kapısı)
- **Okuyan:** `tahsilOnaylari_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `faturaTahsilIslem_`
- **Adıyla aranan sütunlar:** `İşlem`, `Kart`, `Kaynak`, `KolayBi Fatura No`, `Tutar (TL)`, `Zaman`
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Mac Oturumları

- **Yazan:** `oturumDurumuYaz` (BAP Yemek Kartı)
- **Okuyan:** `macOturum_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `oturumDurumuYaz`
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru)

#### Metropol

- **Yazan:** `metropolYaz` (BAP Yemek Kartı)
- **Okuyan:** `metropolCekimleri_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `metropolYaz`
- **Adıyla aranan sütunlar:** `Cihaz / Kullanıcı`, `Fatura Id`, `Giriş Modu`, `Gün Sonu`, `İşlem No`, `İşlem Türü`, `İşlem Zamanı`, `Kart No`, `Kayıt Zamanı`, `Telefon`, `Terminal No`, `Tutar (TL)`
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru)

#### Metropol Ödeme

- **Yazan:** `metropolOdemeYaz` (BAP Yemek Kartı)
- **Okuyan:** `metropolOdemeleri_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `metropolOdemeYaz`
- **Adıyla aranan sütunlar:** `Fatura Durumu`, `Fatura Seri`, `Fatura Seri No`, `Ödeme Durumu`, `Ödeme Tarihi`
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru)

#### Multinet

- **Yazan:** `multinetYaz` (BAP Yemek Kartı)
- **Okuyan:** `multinetCekimleri_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `multinetYaz`
- **Adıyla aranan sütunlar:** `Açıklama`, `Durum`, `İşlem Zamanı`, `Kart No`, `Kayıt Zamanı`, `Ref`, `Terminal No`, `Tutar (TL)`
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru)

#### Multinet Bekleyen

- **Yazan:** `multinetBekleyenYaz` (BAP Yemek Kartı)
- **Okuyan:** `multinetFatura_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `multinetBekleyenYaz`
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru)

#### Multinet Fatura

- **Yazan:** `multinetFaturaYaz` (BAP Yemek Kartı)
- **Okuyan:** `kartOdenenFaturalar_` (BAP Panel Veri Kapısı), `multinetFatura_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `multinetFaturaYaz`
- **Adıyla aranan sütunlar:** `Durum`, `Fatura No`, `Fatura Tarihi`, `Ödeme Tarihi`, `Son Kontrol`, `Tutar (TL)`, `Ürün`, `Vade`
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru)

#### Paye İşlemler

- **Okuyan:** `payeCekimleri_` (BAP Panel Veri Kapısı)
- **Adıyla aranan sütunlar:** `cihazsicil`, `İşlem Numarası`, `Rapor Günü`

#### Pluxee

- **Yazan:** `_pluxeeSekme` (BAP Yemek Kartı), `pluxeeYaz` (BAP Yemek Kartı), `_pluxeeSekme` (Kurye Net Çalışma Süresi), `pluxeeTekrarTemizle` (Kurye Net Çalışma Süresi), `pluxeeYaz` (Kurye Net Çalışma Süresi)
- **Okuyan:** `pluxeeCekimleri_` (BAP Panel Veri Kapısı), `pluxeeSekmeKur` (Kurye Net Çalışma Süresi)
- **Yoksa oluşturan:** `_pluxeeSekme`, `_pluxeeSekme`
- **Adıyla aranan sütunlar:** `Gün Sonu No`, `Gün Sonu Zamanı`, `İşlem Zamanı`, `RRN`, `Servis`, `Terminal No`, `Tutar`, `Tutar (TL)`
- **Etkilenen arayüz:** MacBook köprüsü (mac-kopru)

#### SetCard

- **Yazan:** `setcardCek` (BAP Yemek Kartı), `setcardCek` (Kurye Net Çalışma Süresi)
- **Okuyan:** `setcardCekimleri_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `setcardCek`, `setcardCek`
- **Adıyla aranan sütunlar:** `Cihaz / Kullanıcı`, `Durum`, `Gün Sonu`, `İşlem Türü`, `İşlem Zamanı`, `İşyeri`, `Kart No`, `Kayıt Zamanı`, `Ödeme Şekli`, `STI ID`, `SUT Kod`, `Terminal`, `Tutar (TL)`
- **Zamanla çalışan:** her saat (`setcardCek`)

#### SetCard Fatura

- **Yazan:** `setcardFaturaKesTek_` (BAP Yemek Kartı), `setcardFaturaTazele_` (BAP Yemek Kartı)
- **Okuyan:** `setcardEslesme_` (BAP Panel Veri Kapısı), `setcardFaturaIslem_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `setcardFaturaTazele_`
- **Adıyla aranan sütunlar:** `Durum`, `Fatura Tarihi`, `Kesim Zamanı`, `Ödeme Tarihi`, `Son Kontrol`, `Takip No`, `Tutar (TL)`
- **Zamanla çalışan:** her saat (`setcardCek`)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Tokenflex

- **Yazan:** `tokenflexCek` (BAP Yemek Kartı)
- **Okuyan:** `tokenflexCekimleri_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `tokenflexCek`
- **Adıyla aranan sütunlar:** `Cihaz / Kullanıcı`, `Durum`, `Gün Sonu`, `İşlem Türü`, `İşlem Zamanı`, `Kayıt Zamanı`, `Ref`, `Telefon`, `Terminal No`, `Tutar (TL)`
- **Zamanla çalışan:** her saat (`tokenflexCek`)

#### Tokenflex Fatura

- **Yazan:** `tokenflexFaturaTazele_` (BAP Yemek Kartı)
- **Okuyan:** `kartOdenenFaturalar_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `tokenflexFaturaTazele_`
- **Adıyla aranan sütunlar:** `Dönem Başı`, `Dönem Sonu`, `Durum`, `Fatura No`, `Komisyon (TL)`, `Net Ödeme (TL)`, `Ödeme Tarihi`, `Son Kontrol`, `Talep No`, `Tutar (TL)`, `Vade`
- **Zamanla çalışan:** her saat (`tokenflexCek`)

### ID:1Zcvs58MkI… — veri sözlüğünde olmayan dosya

#### Abonelikler

- **Yazan:** `abonelikSekmesiKur` (BAP Sistem Bekçisi)
- **Okuyan:** `abonelikKontrol_` (BAP Sistem Bekçisi)
- **Yoksa oluşturan:** `abonelikSekmesiKur`
- **Adıyla aranan sütunlar:** `Hizmet`, `Ne için`, `Nereden bakılır`, `Plan / ücret`, `Yenileme tarihi`
- **Zamanla çalışan:** her 15 dk (`bekci`)

#### Durum

- **Yazan:** `durumYaz_` (BAP Sistem Bekçisi)
- **Okuyan:** `nabizBekci_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `durumYaz_`
- **Adıyla aranan sütunlar:** `Detay`, `Grup`, `Ne yapmalı`, `Ne zamandan beri`, `Nerede`, `Sistem`, `Son veri`
- **Zamanla çalışan:** her 15 dk (`bekci`)

#### Kalp

- **Yazan:** `kalpYaz_` (BAP Sistem Bekçisi)
- **Yoksa oluşturan:** `kalpYaz_`
- **Zamanla çalışan:** her 15 dk (`bekci`)

#### Olaylar

- **Yazan:** `olaylarYaz_` (BAP Sistem Bekçisi)
- **Okuyan:** `nabizBekci_` (BAP Panel Veri Kapısı)
- **Yoksa oluşturan:** `olaylarYaz_`
- **Zamanla çalışan:** her 15 dk (`bekci`)

### ? — dosyası bulunamayan sekmeler

#### Cevaplar

- **Yazan:** `cevapKaydet_` (BAP Panel Veri Kapısı)
- **Etkilenen arayüz:** Yönetim paneli (bap-panel Worker)

#### Odemeler

- **Yazan:** `odemeTopluKaydet` (BAP_Personel)
- **Okuyan:** `odemeKaydet` (BAP_Personel)
- **Adıyla aranan sütunlar:** `Ay`, `Personel`, `Tutar`

## Projeler: kim, ne zaman çalışıyor

### Stok Takip Sistemi (`apps-script/stok-takip-sistemi`)

Bağlı dosya: STOK · 285 fonksiyon · 53 sekme

- ekran: Index.html → submitRecipeSuggestion
- haftada bir 09:00 → rc_kontrolEt
- her 5 dk → stokMotoru
- her gün → exportAllTargetSheetsToCSV
- her gün → maliyetRaporu
- her gün 00:30 → alisIsle
- her gün 00:40 → fiyatlariGuncelleOtomatik
- her gün 05:00 → ajanGecelik
- her gün 14:30 → alisIsle
- her gün 14:40 → fiyatlariGuncelleOtomatik
- her gün 23:30 → hp_gunluk
- menü: ⏱ Fiyat Senkron Tetikleyicisi Kur (00:40 / 14:40) → fiyatTetikleyiciKur
- menü: ⏱ Otomatik Tetikleyici Kur (5 dk) → satisTetikleyiciKur
- menü: 💰 Fiyatları Kolaybi'den Güncelle → fiyatlariGuncelle
- menü: Manuel Satış İşle → stokMotoru
- tablo açılınca → onOpen
- tabloda düzenleme olunca → detayTetik

### BAP Maliyet Modülü (`apps-script/maliyet-modulu`)

Bağlı dosya: — (tabloları kimlikle açar) · 41 fonksiyon · 8 sekme

- her gün → maliyetRaporu
- tabloda düzenleme olunca → detayTetik

### BAP Satış Veri Ambarı (`apps-script/bap-satis-veri-ambari`)

Bağlı dosya: — (tabloları kimlikle açar) · 3 fonksiyon · 2 sekme


### BAP Panel Veri Kapısı (`apps-script/bap-panel-veri-kapisi`)

Bağlı dosya: — (tabloları kimlikle açar) · 227 fonksiyon · 80 sekme

- her saat → puantajTaramasi
- tabloda düzenleme olunca → puantajTabloDegisti
- Web eylemleri (57): `islem=adisyo → tahsilatlariAdisyoyaIsle_`, `islem=ata → adisyoKuryeYaz_`, `islem=ata → norm_`, `islem=doldur → adisyoKuryeYaz_`, `islem=duzelt → adisyoKuryeYaz_`, `islem=geri → faturaTahsilIslem_`, `islem=iptal → odemePlaniIsle_`, `islem=kabul → iadeIslem_`, `islem=kalsin → kuryeEslestirIslem_`, `islem=kes → hesapKapat_`, `islem=onay → mesaiDuzelt_`, `islem=ret → iadeIslem_`, `islem=saat → mesaiDuzelt_`, `islem=sil → gunStr_`, `islem=sil → norm_`, `islem=sonPaket → mesaiDuzelt_`, `islem=tahsil → hesapKapat_`, `tur=ambalaj → tuketim_`, `tur=avans → avansGir_`, `tur=Avans → avansGir_`, `tur=eslestir → kuryeEslestirIslem_`, `tur=evethayir → dogrula_`, `tur=faturaTahsil → faturaTahsilIslem_`, `tur=fis → fisKaydet_`, `tur=hesap → hesapKapat_`, `tur=hesap → hesapOnBilgi_`, `tur=hesap → tahsilatlariAdisyoyaIsle_`, `tur=iadeIslem → iadeIslem_`, `tur=iban → dogrula_`, `tur=kesinti → kesintiGir_`, `tur=kesintiIptal → kesintiIptal_`, `tur=kokpit → kokpitCevap_`, `tur=kuryeOdendi → kuryeOdendiIsle_`, `tur=Mahsup → avansGir_`, `tur=Mahsup → norm_`, `tur=Masraf → avansGir_`, `tur=mesaiDuzelt → mesaiDuzelt_`, `tur=musteri → musteriDetay_`, `tur=odeme → toptanciOdemeGir_`, `tur=odemePlani → odemePlaniIsle_`, `tur=panoNot → panoNot_`, `tur=personelEkle → personelEkle_`, `tur=pin → dogrula_`, `tur=pin → kolon_`, `tur=pin → maskele_`, `tur=pin → personelBilgiGir_`, `tur=pin → personelKolon_`, `tur=puantaj → puantajDuzelt_`, `tur=rota → rotaHesapla_`, `tur=sayi → sayi_`, `tur=setcardFatura → setcardFaturaIslem_`, `tur=sube → subeAnahtar_`, `tur=tarih → dogrula_`, `tur=telefon → dogrula_`, `tur=tuketim → tuketimCevap_`, `tur=vardiya → vardiyaGir_`, `tur=yorumOnay → yorumOnay_`

### Kolaybi Fatura Ham Veri (`apps-script/kolaybi-fatura-ham-veri`)

Bağlı dosya: FATURA · 108 fonksiyon · 18 sekme

- haftada bir 03:00 → kolaybiAlisTamTarama
- her 2 saatte → kolaybiTumunuCek
- her gün 00:10 → kalemleriAyir
- her gün 14:10 → kalemleriAyir
- menü: Hariç kalemleri Fatura_Kalemleri'nden temizle → haricKalemleriTemizle
- menü: Hariç listesi sekmesini oluştur → haricSekmesiOlustur
- menü: Tetikleyici kur (00:10 ve 14:10) → tetikleyiciKur
- menü: Ürün listesini yenile → urunListesiOlustur
- menü: Yeni faturaları kalemlere ayır → kalemleriAyir
- tablo açılınca → onOpen
- Web eylemleri (14): `action=eslestirme → ap_eslestirmeVeri_`, `action=eslestirme → ap_json_`, `action=veri → ap_veriCevap_`, `eslestirmeKaydet → ap_eslestirmeKaydet_`, `giderEkle → ap_giderEkle_`, `giderKategori → ap_giderKategori_`, `giderSil → ap_giderSil_`, `hammaddeEkle → ap_hammaddeEkle_`, `odemeEkle → ap_odemeEkle_`, `odemeSil → ap_odemeSil_`, `ozelIsaretle → ap_ozelIsaretle_`, `ozelUrun → ap_ozelUrun_`, `subeAta → ap_subeAta_`, `tedarikciKaydet → ap_tedarikciKaydet_`

### Adisyo Sipariş Toplayıcı (`apps-script/adisyo-siparis-toplayici`)

Bağlı dosya: SATIS · 118 fonksiyon · 19 sekme

- her 15 dk → etiketleriUygula
- her 5 dk → siparisDongusu
- her gün → musteriTazele
- her gün 04:30 → gunlukSubeRaporu
- her saat → subeAtamaGuncelle
- her saat → tahsilSenkron
- tabloda düzenleme olunca → subeDuzenlemeYakala

### Kurye Net Çalışma Süresi (`apps-script/kurye-net-calisma-suresi`)

Bağlı dosya: KURYE · 221 fonksiyon · 19 sekme

- ekran: Panel.html → panelVeri
- her 15 dk → guncelle
- her gün 02:30 → payeMailCek
- her gün 04:30 → yedekAl
- her gün 09:30 → payeMailCek
- her saat → nobetci
- her saat → setcardCek
- menü: ⏱️ Teslimat Gecikme Dökümü → gecikmeDokumu
- menü: ⚙️ Kesinti Kuralını Uygula → kuraliUygula
- menü: ⚡ Tüm Sistemi Kur / Güncelle → kuryeSisteminiKur
- menü: 🌉 Köprü Durumu → kopruDurum
- menü: 🌉 Köprü Kodunu Al (tarayıcıdan veri çek) → kopruKodunuAl
- menü: 🌐 JSON Dışa Aktar (HTML panel için) → exportJSON
- menü: 💰 Sadece Bordroyu Yenile (veri çekmez) → bordroYenile
- menü: 📊 Sadece Performansı Yenile (veri çekmez) → performansYenile
- menü: 📒 Kesinti Defteri (gerekçeli) → kesintiDefteriCalistir
- menü: 📥 Aktarım Dosyasından Satır Al → aktarimdanSatirAl
- menü: 📥 HemenYolda'dan Mesai Çek → mesaiCek
- menü: 🔄 VERİYİ ÇEK ve TÜMÜNÜ YENİLE → hepsiniYenile
- menü: 🔍 Veri Kontrol (hatalı satırları bul) → veriKontrolCalistir
- menü: 🧹 Bozuk Mesai Günlerini Sil (onarım) → mesaiBozukGunleriSil
- menü: 🩺 Bağlantı Teşhisi (hata alınca çalıştır) → hyTeshis
- tablo açılınca → onOpen
- tabloda düzenleme olunca → onEdit
- Web eylemleri (22): `adim=ping → _kopruGet`, `adim=plan → _acikHesapGunleri`, `adim=plan → _kopruZorlaOku`, `adim=plan → _kuyrukDetay`, `adim=test → _kopruGet`, `sayfa=kod → _kopruKod`, `sayfa=pluxee → pluxeeKodSayfasi_`, `sayfa=pluxee → pluxeeKodYaz`, `tur=bitir → acikHesaplar`, `tur=bitir → kuraliUygula`, `tur=edenred → _kopruEdenredYaz`, `tur=gun → _kopruGunYaz`, `tur=kodDurum → _kopruKod`, `tur=kodIste → _kopruKod`, `tur=kodSil → _kopruKod`, `tur=kodYaz → _kopruKod`, `tur=kural → kuraliUygula`, `tur=kuryeler → doPost`, `tur=pluxee → pluxeeYaz`, `tur=pluxeeKodIste → doPost`, `tur=pluxeeKodOku → doPost`, `tur=pluxeeKodSil → doPost`

### Trendyol Veri Çekme (`apps-script/trendyol-veri-cekme`)

Bağlı dosya: TRENDYOL · 68 fonksiyon · 19 sekme

- her 10 dk → iadeleriCek
- her 15 dk → yorumCevapCalistir
- her gün → yorumlariCek
- her gün 03:30 → menuCek
- her gün 10:45 → sabahOzeti
- her gün 23:45 → puanTablosuYenile
- her gün 23:50 → gunlukPuanRaporu

### BAP_Personel (`apps-script/bap-personel`)

Bağlı dosya: PERSONEL · 101 fonksiyon · 10 sekme

- her gün 03:00 → gece_kontrol
- her gün 17:00 → gunlukDevamsizIsaretle
- Web eylemleri (24): `islem=ilkPinOlustur → ilkPinEkran`, `islem=ilkPinOlustur → msg`, `islem=ilkPinOlustur → pinGuncelle`, `islem=izinEkle → izinTalebiKaydet`, `islem=izinEkle → kilitAl`, `islem=izinEkle → kilitBirak`, `islem=izinOnay → izinTalebiKarar`, `islem=izinOnay → yoneticiHub`, `islem=izinRed → izinTalebiKarar`, `islem=izinRed → yoneticiHub`, `islem=odemeKaydet → odemeKaydet`, `islem=odemeKaydet → yoneticiHub`, `islem=odemeTopluKaydet → odemeTopluKaydet`, `islem=odemeTopluKaydet → yoneticiHub`, `islem=personelEkle → yeniPersonelEkle`, `islem=personelEkle → yoneticiHub`, `islem=personelGuncelle → personelGuncelleKaydet`, `islem=personelGuncelle → yoneticiHub`, `islem=pinSifirlaOnay → msg`, `islem=pinSifirlaOnay → pinGuncelle`, `islem=pinSifirlaOnay → pinSifirlaEkran`, `islem=pinSifirlaTalep → pinSifirlaEkran`, `islem=vardiyaKaydet → vardiyaCizelgeKaydet`, `islem=vardiyaKaydet → yoneticiHub`

### İndirim Oranı (`apps-script/indirim-orani`)

Bağlı dosya: — (tabloları kimlikle açar) · 17 fonksiyon · 4 sekme

- menü: ⚡ Raporu Güncelle / Getir → raporuOlustur
- menü: 🔍 Teşhis: Veriyi Kontrol Et → teshis
- menü: 🔑 Otomatik Yenilemeyi Aç (Tetikleyici Kur) → otomatikYenilemeyiBaslat
- tablo açılınca → onOpen
- tabloda düzenleme olunca → installedOnEdit

### BAP PANEL Backend (`apps-script/bap-panel-backend`)

Bağlı dosya: — (tabloları kimlikle açar) · 86 fonksiyon · 22 sekme

- Web eylemleri (36): `action=getAcikSiparisler → getAcikSiparisler`, `action=getAmbalaj → getAmbalajUrunler`, `action=getAmbalajStok → getAmbalajUrunler`, `action=getCalisanlar → getCalisanlar`, `action=getDirektSatis → getDirektSatisUrunler`, `action=getHammaddeler → getHammaddeler`, `action=getPerformans → performansOku_`, `action=getPlanEkrani → getPlanEkrani`, `action=getRecete → getRecete`, `action=getRecetesiOlmayanlar → doGetIsle_`, `action=getSiparisEkrani → getSiparisEkrani`, `action=getStokDurum → getStokDurum`, `action=getSubeler → doGetIsle_`, `action=getTransferler → getTransferler`, `action=getTransferUrunler → getTransferUrunler`, `action=getUrunler → doGetIsle_`, `action=getYariMamuller → doGetIsle_`, `action=getYariMamulRapor → getYariMamulRapor`, `action=getYariMamulStok → getYariMamulStok`, `action=getZayiDirektSatis → getDirektSatisUrunler`, `action=getZayiUrunler → getZayiUrunler`, `action=malKabul → malKabul`, `action=sayimKaydet → sayimKaydet`, `action=sayimTopluKaydet → sayimTopluKaydet`, `action=sifreKontrol → sifreKontrol`, `action=siparisDuzelt → siparisDuzelt`, `action=siparisKaydet → siparisKaydet`, `action=siparisWpIsaretle → siparisWpIsaretle`, `action=stokDuzelt → stokDuzelt`, `action=tekrarYenile → tekrarYenile`, `action=transferDirektCikis → transferDirektCikis`, `action=transferOnayla → transferOnayla`, `action=transferReddet → transferReddet`, `action=transferTalep → transferTalep`, `action=uretimKaydet → uretimKaydet`, `action=zayiKaydet → zayiKaydet`

### BAP Rapor Ajanı (`apps-script/bap-rapor-ajani`)

Bağlı dosya: SATIS · 23 fonksiyon · 9 sekme

- haftada bir 09:00 → haftalikRapor

### BAP Genel Bilgiler (`apps-script/bap-genel-bilgiler`)

Bağlı dosya: GENEL · 2 fonksiyon · 0 sekme


### BAP Yemek Kartı (`apps-script/bap-yemek-karti`)

Bağlı dosya: YEMEKKARTI · 41 fonksiyon · 13 sekme

- her gün 02:30 → payeMailCek
- her gün 09:30 → payeMailCek
- her saat → setcardCek
- her saat → tokenflexCek
- Web eylemleri (25): `sayfa=cek → doGet`, `sayfa=kod → kodKutusu_`, `sayfa=kodgir → doGet`, `sayfa=pluxee → doGet`, `sayfa=pluxee → kodKutusu_`, `tur=cek → doPost`, `tur=cekDurum → doPost`, `tur=edenred → edenredYaz`, `tur=faturaKesim → faturaKesimYaz`, `tur=kodDurum → kodKutusu_`, `tur=kodIste → kodKutusu_`, `tur=kodSil → kodKutusu_`, `tur=kodYaz → kodKutusu_`, `tur=metropol → metropolYaz`, `tur=metropolOdeme → metropolOdemeYaz`, `tur=multinet → multinetYaz`, `tur=multinetBekleyen → multinetBekleyenYaz`, `tur=multinetFatura → multinetFaturaYaz`, `tur=oturumDurumu → oturumDurumuYaz`, `tur=pluxee → pluxeeYaz`, `tur=pluxeeKodIste → doPost`, `tur=pluxeeKodOku → kodKutusu_`, `tur=pluxeeKodSil → kodKutusu_`, `tur=setcardFaturaKes → setcardFaturaKesTek_`, `tur=tokenflexTani → tfIstek_`

### BAP Günlük Yedek (`apps-script/bap-gunluk-yedek`)

Bağlı dosya: — (tabloları kimlikle açar) · 16 fonksiyon · 8 sekme

- her gün → nabizKontrol
- her gün 03:00 → yedekZipAl

### BAP Sistem Bekçisi (`apps-script/bap-sistem-bekcisi`)

Bağlı dosya: — (tabloları kimlikle açar) · 27 fonksiyon · 4 sekme

- her 15 dk → bekci

## Arayüzler

| Dosya | Konuştuğu proje | Kullandığı eylem sayısı |
|---|---|---|
| `bap-sistem/index.html` (Mutfak paneli (bap-sistem.pages.dev)) | bap-panel-backend | 27 |
| `bap-panel/page.html` (Yönetim paneli (bap-panel Worker)) | bap-panel-veri-kapisi | 22 |
| `bap-panel/worker.template.js` (Yönetim paneli (bap-panel Worker)) | bap-panel-veri-kapisi | 30 |
| `mac-kopru/edenred.mjs` (MacBook köprüsü (mac-kopru)) | bap-yemek-karti, kurye-net-calisma-suresi | 6 |
| `mac-kopru/metropol.mjs` (MacBook köprüsü (mac-kopru)) | bap-yemek-karti, kurye-net-calisma-suresi | 4 |
| `mac-kopru/multinet.mjs` (MacBook köprüsü (mac-kopru)) | bap-yemek-karti, kurye-net-calisma-suresi | 8 |
| `mac-kopru/topla.mjs` (MacBook köprüsü (mac-kopru)) | bap-yemek-karti, kurye-net-calisma-suresi | 4 |
| `cloudflare/workers/bap-alim-paneli/index.html` (Cloudflare eski sayfalar) | kolaybi-fatura-ham-veri | 11 |
| `cloudflare/workers/bap-genel-bilgiler/index.html` (Cloudflare eski sayfalar) | projeler.json'da olmayan dağıtım | 0 |
| `cloudflare/workers/bap-genel-yonetm/index.html` (Cloudflare eski sayfalar) | bap-personel | 0 |
| `cloudflare/workers/kurye-takip/index.html` (Cloudflare eski sayfalar) | — | 0 |

## Çözülemeyenler

Sekme adı koddan okunamadı (değişkenle ya da döngüyle açılıyor). Bu yerler haritada yok; değişiklikte elle bakılmalı.

| Proje | Fonksiyon | Yer | İfade |
|---|---|---|---|
| stok-takip-sistemi | `ambalajTeshis` | `stok-takip-sistemi/Adsız.gs:145` | `KURAL_AD` |
| stok-takip-sistemi | `fiyatOnaylariniUygula` | `stok-takip-sistemi/Alıs Motoru v2.gs:345` | `String ( v [ i ] [ cT ] )` |
| stok-takip-sistemi | `exportAllTargetSheetsToCSV` | `stok-takip-sistemi/CVS olarak veri cekme.gs:36` | `sheetName` |
| stok-takip-sistemi | `exportAllTargetSheetsToCSV` | `stok-takip-sistemi/CVS olarak veri cekme.gs:43` | `sheetName` |
| stok-takip-sistemi | `hp_tabloBul_` | `stok-takip-sistemi/Hazırlık Ajanı.gs:1037` | `c . ad` |
| stok-takip-sistemi | `eksikUrunler` | `stok-takip-sistemi/KolayBi ürün karşılaştırma.gs:41` | `HAM_SEKME` |
| stok-takip-sistemi | `eksikUrunler` | `stok-takip-sistemi/KolayBi ürün karşılaştırma.gs:62` | `ad` |
| stok-takip-sistemi | `eksikUrunler` | `stok-takip-sistemi/KolayBi ürün karşılaştırma.gs:100` | `ad` |
| stok-takip-sistemi | `fiyatlariGuncelle` | `stok-takip-sistemi/Satıs Motoru.gs:1392` | `sekmeAdi` |
| stok-takip-sistemi | `ajKatalogOku_` | `stok-takip-sistemi/Stok Ajanı.gs:163` | `t . ad` |
| stok-takip-sistemi | `ajKisaAdYaz_` | `stok-takip-sistemi/Stok Ajanı.gs:186` | `tablo` |
| stok-takip-sistemi | `ajEslestirme_` | `stok-takip-sistemi/Stok Ajanı.gs:197` | `t . ad` |
| stok-takip-sistemi | `ajCevaplariUygula_` | `stok-takip-sistemi/Stok Ajanı.gs:319` | `hedefTablo` |
| stok-takip-sistemi | `isimBirlestirmeAnalizi` | `stok-takip-sistemi/Yeni.gs:8` | `ad` |
| stok-takip-sistemi | `arsivKontrol` | `stok-takip-sistemi/eski ğrğn arsivi.gs:95` | `ad` |
| stok-takip-sistemi | `arsivKontrol` | `stok-takip-sistemi/eski ğrğn arsivi.gs:179` | `hedef` |
| stok-takip-sistemi | `arsivKontrol` | `stok-takip-sistemi/eski ğrğn arsivi.gs:208` | `tablo` |
| stok-takip-sistemi | `eslestirmeDoldur` | `stok-takip-sistemi/fatura eşleştirme doldur.gs:43` | `k . tablo` |
| stok-takip-sistemi | `oneriUret` | `stok-takip-sistemi/kısa ad onerıcı.gs:37` | `tablo` |
| stok-takip-sistemi | `onerileriUygula` | `stok-takip-sistemi/kısa ad onerıcı.gs:107` | `tablo` |
| bap-panel-veri-kapisi | `kokpitPanoKur` | `bap-panel-veri-kapisi/Kod.gs:1153` | `ad` |
| bap-panel-veri-kapisi | `kokpitPanoKur` | `bap-panel-veri-kapisi/Kod.gs:1154` | `ad` |
| bap-panel-veri-kapisi | `mobilFatura_` | `bap-panel-veri-kapisi/Kod.gs:1602` | `k . birikenSekme` |
| bap-panel-veri-kapisi | `genel_` | `bap-panel-veri-kapisi/Kod.gs:1950` | `ad` |
| kolaybi-fatura-ham-veri | `ap_hammaddeEkle_` | `kolaybi-fatura-ham-veri/Alım Paneli.gs:535` | `sekmeler [ s ]` |
| kolaybi-fatura-ham-veri | `ap_eslestirmeVeri_` | `kolaybi-fatura-ham-veri/Alım Paneli.gs:582` | `ad` |
| kolaybi-fatura-ham-veri | `ap_hammaddeHaritasi_` | `kolaybi-fatura-ham-veri/Alım Paneli.gs:717` | `ad` |
| kolaybi-fatura-ham-veri | `alisFaturaTeshis` | `kolaybi-fatura-ham-veri/Kolaybi Veri Cek.gs:711` | `ad` |
| adisyo-siparis-toplayici | `adresEslesmeUygula` | `adisyo-siparis-toplayici/Adres Eslesme.gs:34` | `AE_ANA_SEKME` |
| kurye-net-calisma-suresi | `denetimSnapshot` | `kurye-net-calisma-suresi/Kural.gs:166` | `ad` |
| kurye-net-calisma-suresi | `_wSekmeDokumu` | `kurye-net-calisma-suresi/Kurye Web.gs:111` | `ad` |
| kurye-net-calisma-suresi | `payeMailCek` | `kurye-net-calisma-suresi/Yemek Karti.gs:76` | `ad` |
| kurye-net-calisma-suresi | `payeMailCek` | `kurye-net-calisma-suresi/Yemek Karti.gs:77` | `ad` |
| bap-personel | `puantajDenetim` | `bap-personel/Personel.gs:1701` | `adiSayfa` |
| bap-personel | `puantajDenetim` | `bap-personel/Personel.gs:1703` | `adiSayfa` |
| indirim-orani | `kaynakSayfaBul` | `indirim-orani/Kod.gs:170` | `KAYNAK_SAYFA_ADI` |
| bap-yemek-karti | `payeMailCek` | `bap-yemek-karti/Paye.gs:18` | `ad` |
| bap-yemek-karti | `payeMailCek` | `bap-yemek-karti/Paye.gs:19` | `ad` |
| bap-sistem-bekcisi | `kontrolEt_` | `bap-sistem-bekcisi/Kod.gs:166` | `a . sekme` |
