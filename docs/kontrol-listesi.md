# Kontrol listesi

02.10.2026 tarihli kod incelemesinin bulguları. Kodlar okunarak bulundu; ⚠️ işaretliler tabloda
doğrulanmalı. Durum: ☐ açık · ◐ devam ediyor · ☑ çözüldü.

## 0 · Hemen (sahibin yapacağı)

| | İş | Durum |
|---|---|---|
| H1 | Stok Ajanı gece tetikleyicisini sil (`ajanGecelik`) — soru cevaplanınca stoğa yanlış satır yazıyor | ☑ 02.10 |
| H2 | `hizliYedek()` ile Stok dosyasının yedeğini al | ☑ 02.10 |
| H3 | Düzeltilmiş mutfak panelini (`bap-sistem/index.html`) Cloudflare'e yükle, telefondan dene | ◐ yeni sürüm yüklendi mi teyit edilecek |
| H4 | Yönetici şifresini değiştir — `131220` panel kaynağında açık yazıyordu | ⏸ sahibi erteledi (P3 ile birlikte) |

## K · Kararlar

| | Karar | Öneri | Durum |
|---|---|---|---|
| K1 | Tek reçete tablosu: Tbl_Receteler (A) mı, Paket/Salon ayrımlı Tbl_UrunRecete (B) mi? | B | ☐ |
| K2 | Stok kalemi = kısa ad (aynı ürünün farklı toptancı adları tek stok satırında) | Evet | ☐ |
| K3 | Ürün listesinin tek kaynağı GENEL › Menü | Evet | ☐ |
| K4 | Satışın tek kaynağı SATIS › Satıs Verileri (Make.com) | Evet | ☐ |
| K5 | Satış adı ↔ reçete eşleştirmesi tek tabloda, üç motor da onu okusun | Evet | ☐ |

## S · Stok motoru (satış → stok)

| | Sorun | Etki | Durum |
|---|---|---|---|
| S1 | `satislariIsle` içinde süslü parantez kayması | Bir çalışmada birden çok sipariş varsa stok fazla düşer, log tekrarlanır; menü ve fiyat tetikleyicisi "fonksiyon bulunamadı" verebilir | ☐ |
| S2 | İptal/açık siparişler düşülüyor olabilir (Durum sütununa bakmıyor) ⚠️ | Fazla stok düşümü | ☐ |
| S3 | Ambalaj_Kurallari'nda "Ürün" (Ü ile) yazılırsa kategori kuralı sayılıyor ⚠️ | Ürüne özel ambalaj düşmüyor | ☐ |
| S4 | Satış tablosu sütun numarasıyla okunuyor | Adisyo sütun değiştirirse sessizce yanlış okur | ☐ |
| S5 | Benzer isim eşiği 0,82 ile yanlış ürüne bağlanabiliyor | Gizli hata | ☐ |
| S6 | J (son alış fiyatı) hem Alış motoru (00:30) hem `fiyatlariGuncelle` (00:40) yazıyor | Fiyat gidip gelir | ☐ |
| S7 | Riskli menü düğmeleri: Eskileri İşaretle, Tüm Satış Düşümlerini Geri Al, NotebookLM Geri Al | Yanlışlıkla basılırsa veri bozulur | ☐ |
| S8 | İçindeki eski maliyet raporu Maliyet Modülü ile aynı tabloları farklı hesapla yazıyor | Çelişen rakamlar | ☐ |

## V · Veri (gecelik ajan raporundan, 02.10)

| | Sorun | Durum |
|---|---|---|
| V1 | 5.889 fatura kalemi SUBE_YOK — stoğa hiç girmedi. Tedarikçi bazında şube girilince çözülür | ☐ |
| V2 | 1.068 ESLESME_YOK kalemi (477 farklı ürün) | ☐ |
| V3 | İmkânsız eksi stoklar: Sarımsak −230.441, Demko −358.518 → H/I birim hatası | ☐ |
| V4 | Su stoktan düşülüyor (−73.335) — üretim kodu düşüyor olabilir, kod henüz görülmedi | ☐ |
| V5 | Yarı mamul soslar sürekli eksiye gidiyor → üretim kaydı girilmiyor veya eşleşmiyor | ☐ |
| V6 | 52 üründe kısa ad boş, 53 ajan sorusu cevapsız (K2 kararından sonra cevaplanacak) | ☐ |
| V7 | WhatsApp açılmadığı günlerde çift sipariş kaydı olabilir → Siparis_Kayitlari kontrol ⚠️ | ☐ |

## D · Diğer dosyalar

| | Dosya | Sorun | Karar | Durum |
|---|---|---|---|---|
| D1 | Alış Motoru v2 | Her kalem için 3 ayrı yazma; isim eşleştirmesi stok motorundan farklı | Kalır, ortak katmana bağlanır | ☐ |
| D2 | eksikUrunler + Kısa Ad Önerisi | Eklenen satırda F/H/I/P boş; M (hedef tablo) otomatik dolmuyor; iki ayrı ekleme kodu | Birleşir | ☐ |
| D3 | Fatura Eşleştirme Doldurma | Hedefe kısa ad yazıyor, çarpan yanlış → stok ikiye bölünür | K2 geçişiyle değişir; çalıştırılmaz | ☐ |
| D4 | Stok Ajanı | Gece kuru modu kapatıyor; "YOK SAY" kısa ad olarak yazılıyor; kilit çakışması yanlış raporlanıyor | Düzeltilene kadar elle, kuru modda | ☐ |
| D5 | Eski Ürün Adı Arşivi | 4. şart kodda yok; satır siliyor | E kutusunu kapatan sürümle değişir; çalıştırılmaz | ☐ |
| D6 | Aktif Ürün Filtresi | Yanlış sekmenin H sütununa yazabilir; silinen satırlar her raporda geri gelir | Maliyet Modülü'ne taşınır, dosya silinir | ☐ |
| D7 | Maliyet Modülü | `sayi()` nokta kalıbı hatalı (`/\\./g`); ambalajda benzer isim açık; aktiflik H ✓'den okunuyor; komisyon yok | Ana maliyet motoru; düzeltilir | ☐ |
| D8 | Hazırlık Ajanı | Alt yarı mamul satıştan planlanıyor (fazla üretim); sayım gram→adet tahmini; tüm satış tablosunu iki kez okuyor | Kalır, düzeltilir | ☐ |
| D9 | Reçete Kontrol | Yanlış eşleştirme tablosuna bakıyor; içecekleri atlıyor; alt sosları "kullanılmıyor" sayıyor | Kalır, düzeltilir | ☐ |
| D10 | Ürün Reçetesi Şablonu | İkinci reçete tablosu kuruyor; varsayılan birim kg | K1 kararına bağlı | ☐ |
| D11 | Ambalaj Teşhis | "Benzerlikle bulundu"yu başarı sayıyor | Geçici, sonra silinir | ☐ |
| D12 | Mutfak (reçete) sayfası | Her açılışta tüm Drive fotoğraflarını base64 gönderiyor (çok yavaş); kategori yanlış sütundan | Önbellek + küçük resim linki | ☐ |
| D13 | CSV dışa aktarma | Okuyan yoksa gereksiz; tarihleri bozuk yazıyor | Kullanılıyor mu? | ☐ |
| D14 | Tek seferlikler: alisAra, adetKontrol, kaynakBasliklar, denetim2, sayimVeTop20, isimBirlestirmeAnalizi, yapiDokumu, satisSiparisIdleriniDoldur, alisTarihDuzelt, degisimSutunuEkle, ymStokTakipBirimineGec, notebookDusumleriniGeriAl | — | Silinir | ☐ |

## P · Paneller

| | Sorun | Durum |
|---|---|---|
| P1 | Sipariş: WhatsApp kayıt sonrası açılıyordu, telefonlar engelliyordu | ☑ (yüklenmeyi bekliyor, H3) |
| P2 | Kayıt (POST) istekleri otomatik tekrar deneniyordu → çift kayıt | ☑ (H3) |
| P3 | Yönetici şifresi istemci kodunda; personel şifresi URL'de gidiyor | ☐ |
| P4 | Sayım ekranında birim seçimi yok (Hazırlık ajanı gram/adet tahmin ediyor) | ☐ |

## Y · Yapı

| | İş | Durum |
|---|---|---|
| Y1 | 9 dağınık dal tek dalda toplandı; canlı Worker depoda olmayan sürümdü, canlıdan alındı | ☑ |
| Y2 | `main` dalı + otomatik yayın iş akışları | ◐ `main` oluştu 02.10; varsayılan dal ayarı ve gizli anahtarlar bekleniyor |
| Y3 | Apps Script kodlarının canlıdan çekilmesi (`Apps Script'i Depoya Çek`) | ☐ |
| Y4 | Ortak katman: `Ayarlar.gs` + `Ortak.gs` | ☐ |
