# Kontrol listesi

02.10.2026 tarihli kod incelemesinin bulguları. Kodlar okunarak bulundu; ⚠️ işaretliler tabloda
doğrulanmalı. Durum: ☐ açık · ◐ devam ediyor · ☑ çözüldü.

## 0 · Hemen (sahibin yapacağı)

| | İş | Durum |
|---|---|---|
| H1 | Stok Ajanı gece tetikleyicisini sil (`ajanGecelik`) — soru cevaplanınca stoğa yanlış satır yazıyor | ☑ 02.10 |
| H2 | `hizliYedek()` ile Stok dosyasının yedeğini al | ☑ 02.10 |
| H3 | Düzeltilmiş mutfak panelini (`bap-sistem/index.html`) Cloudflare'e yükle, telefondan dene | ☑ 02.10 bap-sistem'e yayınlandı, canlı = depo |
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
| S1 | `satislariIsle` içinde süslü parantez kayması — **canlıda doğrulandı 02.10**: onOpen, dusumleriUygula, fiyatlariGuncelleOtomatik, maliyetRaporuOlustur üst düzeyde yok | Bir çalışmada birden çok sipariş varsa stok fazla düşer, log tekrarlanır; menü ve fiyat tetikleyicisi "fonksiyon bulunamadı" verebilir | ☑ yayınlandı 03.10 01:13 |
| S2 | İptal/açık siparişler düşülüyor olabilir (Durum sütununa bakmıyor) ⚠️ | Fazla stok düşümü | ☑ yayınlandı 03.10 01:13 |
| S3 | Ambalaj_Kurallari'nda "Ürün" (Ü ile) yazılırsa kategori kuralı sayılıyor ⚠️ | Ürüne özel ambalaj düşmüyor | ☑ yayınlandı 03.10 01:13 |
| S4 | Satış tablosu sütun numarasıyla okunuyor | Adisyo sütun değiştirirse sessizce yanlış okur | ☐ |
| S5 | Benzer isim eşiği 0,82 ile yanlış ürüne bağlanabiliyor | Gizli hata | ☐ |
| S6 | J (son alış fiyatı) hem Alış motoru (00:30) hem `fiyatlariGuncelle` (00:40) yazıyor | Fiyat gidip gelir — iki kod farklı kural kullanıyor (çarpan ↔ Koli_Icerik); bkz. M3, M4 | ☐ |
| S7 | Riskli menü düğmeleri: Eskileri İşaretle, Tüm Satış Düşümlerini Geri Al, NotebookLM Geri Al | Yanlışlıkla basılırsa veri bozulur | ☑ yayınlandı 03.10 01:13 |
| S9 | Stok Takip projesinde `BAP Maliyet.gs` (Maliyet Modülü'nün kopyası) ve `KolayBi ürün karşılaştırma.gs`, Satış Motoru ile aynı adlı fonksiyonlar tanımlıyor (nrm, sade, sayi, stokDosyasi, receteHaritasi, ymHaritasi, ambalajKurallari, maliyetDetay) | Hangisinin çalışacağı dosya sırasına bağlı; S1 düzelince Satış Motoru da bunlarla çakışacak | ☐ |
| S8 | İçindeki eski maliyet raporu Maliyet Modülü ile aynı tabloları farklı hesapla yazıyor | Çelişen rakamlar | ☐ |

## M · Maliyet ve alış fiyatı (28.09–02.10 oturumu)

Tablolarda yapılan her değişikliğin eski ve yeni değeri **STOK › Fiyat_Duzeltme_28.09** sekmesinde (satır numarasıyla).

| | Sorun | Etki | Durum |
|---|---|---|---|
| M1 | `Fatura_Eslestirme` çarpanları faturadaki birime uymuyordu: krema ve süt 12, yumurta 30, pembe domates 7,5, cherry 5, kaşık patates 2,5, hellim 4 | Fiyat çarpana bölündü (krema 138,66 → 11,55), stok aynı kat şişti | ☑ 28.09 çarpanlar 1 (hellim 0,9) yapıldı · geçmiş stok şişkinliği sayımla düzelecek (V3) |
| M2 | Bu 7 ürünün ve 5 sebzenin J'si yanlıştı / bayattı | Penne Pesto %17 görünüyordu, gerçek %20 | ☑ 28.09 J elle düzeltildi, 28.09 04:04 raporunda 85,86 TL doğrulandı |
| M3 | Alış motoru `sonAlisFiyatDoldur_` hedefi yalnız tam adla (B) arıyor; `Fatura_Eslestirme`'de kısa ad (C) yazılı → 321 eşleştirmenin 283'ü fiyat yazamıyor ("güncellenen: 0") | J'yi pratikte yalnız `fiyatlariGuncelle` yazıyor | ☐ Kısa adla aramak tek satır, ama **çarpanlar doğrulanmadan açılmamalı**: mozzarella çarpanı 6 (torba) ama stok birimi kg → J yanlış çıkar. Önce çarpan denetimi (kuru rapor) |
| M4 | `fiyatlariGuncelle` J'ye faturadaki birim fiyatı yazıyor; kasa/paket ürünlerde (pembe domates H = 7,5 kg, cherry 5 kg, hellim 900 gr) kg fiyatı yazar | Bir sonraki çalışmada M2'deki 3 düzeltmeyi bozar | ☐ S6 ile birlikte: J'yi tek kod, `J = fatura fiyatı × H ÷ çarpan` kuralıyla yazsın |
| M5 | Fiyat senkronu 23.09'dan sonra Fiyat_Log'a hiç yazmadı (tetikleyici vardı) | J'ler bayatladı | ☑ büyük olasılıkla S1 (fonksiyon üst düzeyde değildi) — 03.10 yayınından sonra Fiyat_Log'da yeni satır görülmeli ⚠️ |
| M6 | Dana Tiftik Et çıktısı "kg / 5200" girilmişti (5.200 kg okunuyordu) | Tiftikli ürünler %8–9 görünüyordu | ☑ 29.09 "gr." yapıldı (gramı ≈ 1,85 TL) |
| M7 | Tbl_Hammaddeler'de H ve I boş satırlar paket fiyatını gram fiyatı yapıyordu: Barilla penne 2 kg, Calve hardal, midye, tane karabiber, acı sos, bulgur, domates, karbonat, nar ekşisi | 02.10 panelinde yarı mamul 279.247 TL (cironun %191'i); penne porsiyonu 14.000 TL | ☑ 02.10 9 satır dolduruldu · ☑ panel koruması (`bilesen_`: birim boş/uyuşmuyorsa 0 + eksik listesi; `cc` = ml) — test: `tests/veri-kapisi-maliyet-testi.js` · ☐ yayın |
| M8 | Reçetede birim türü tablodakiyle uyuşmayan 5 satır: Maydanoz 15 gr (tabloda adet), Havuç/Kabak/Kereviz adet (tabloda kg), Tost ekmeği "Paket" (tabloda gr), Limon suyu 0,5 adet (tabloda lt) | M7 korumasıyla tutara 0 girer, eksik listesinde görünür | ☐ reçete birimleri düzeltilecek |
| M9 | Tarifi ya da parti çıktısı eksik yarı mamuller: Konfi domates, Konfi sarımsak, Acılı zeytinyağ, Pancarlı humus ("Humur" yazım hatası), Tavuk suyu, Karabuğday tabule, Humus, Falafel, Bulgur haşlanmış, File badem kavurma, Sotelenmiş kabak-havuç, Panini ekmeği, Lasagne Bolognese, Ispanak sos | Maliyete 0 giriyor | ☐ sahibinden tarif / parti çıktısı |
| M10 | Panelde reçetesi bulunamayan satışlar (02.10, cironun %8,7'si): Şeftali Stracciatella Salata, Tiftik Etli Ispanaklı Salata, Börülce Bowl, Chicken Roll Bowl, Bap Ekşi Mayalı Special Sandviç, Linguine Deniz Mahsullü, Karpuz Semizotu Salata; içecekler (Coca-Cola, Ayran, Su, Fuse Tea) | Maliyet eksik | ☐ K5 tablosu ya da `Maliyet_Eslestirme` sekmesi |

## V · Veri (gecelik ajan raporundan, 02.10)

| | Sorun | Durum |
|---|---|---|
| V1 | 5.889 fatura kalemi SUBE_YOK — stoğa hiç girmedi. Tedarikçi bazında şube girilince çözülür | ☐ |
| V2 | 1.068 ESLESME_YOK kalemi (477 farklı ürün) | ☐ |
| V3 | İmkânsız eksi stoklar: Sarımsak −230.441, Demko −358.518 → H/I birim hatası. 02.10 panelinde imkânsız artılar da var: Dana Sucuk 36.520 kg, Pepperoni 14.391 kg, Yumurta 45.563 adet (M1 çarpanları). "Kaç gün yeter" şu an güvenilmez; sayımla sıfırlanacak | ☐ |
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
| D15 | Kurye projesi: `Kural.gs` ile `Mesai Kurallar.gs` birebir aynı dosya (20 fonksiyon iki kez) | Biri silinir | ☐ |
| D16 | Kolaybi projesi: `test.gs`, `VeriKontrol.gs`'nin eski kopyası (7 fonksiyon iki kez) | `test.gs` silinir | ☐ |
| D17 | Maliyet kodu iki projede. Canlıda çalışan Stok Takip içindeki kopya (Tbl_Maliyetler tarih biçimi + 135 ürün) | Stok Takip'te kalır; ayrı projenin iyi yanları (aktif filtresi, boş tablo koruması, yalnız kendi tetikleyicisini silme) taşınır, ayrı proje susturulur | ☐ |
| D14 | Tek seferlikler: alisAra, adetKontrol, kaynakBasliklar, denetim2, sayimVeTop20, isimBirlestirmeAnalizi, yapiDokumu, satisSiparisIdleriniDoldur, alisTarihDuzelt, degisimSutunuEkle, ymStokTakipBirimineGec, notebookDusumleriniGeriAl | — | Silinir | ☐ |

## T · Tablolar (Drive)

| | İş | Durum |
|---|---|---|
| T1 | 119 e-tablo sınıflandırıldı → `docs/tablo-haritasi.md` | ☑ |
| T2 | Drive'da BAP klasör düzeni kurulup dosyalar taşınacak | ☑ 02.10 — 17 dosya + 2 yedek klasörü taşındı |
| T3 | 10 "Başlıksız e-tablo" `9 Arşiv`de (3'ünde veri var, bakılacak); 15 eski dosya sahipte (dokunulmaz) | ⏸ |
| T4 | Ajanlar dosyalarını `Departmanlar/<departman>` içine açıyor; kökte açanlar (ör. "Başlıksız") bulunup düzeltilecek | ☐ |

## P · Paneller

| | Sorun | Durum |
|---|---|---|
| P1 | Sipariş: WhatsApp kayıt sonrası açılıyordu, telefonlar engelliyordu | ☑ 02.10 bap-sistem.pages.dev'de yayında |
| P2 | Kayıt (POST) istekleri otomatik tekrar deneniyordu → çift kayıt | ☑ (H3) |
| P3 | Yönetici şifresi istemci kodunda; personel şifresi URL'de gidiyor (düzeltme `bap-panel-backend`'de) | ☐ |
| P4 | Sayım ekranında birim seçimi yok (Hazırlık ajanı gram/adet tahmin ediyor) | ☐ |

## Y · Yapı

| | İş | Durum |
|---|---|---|
| Y1 | 9 dağınık dal tek dalda toplandı; canlı Worker depoda olmayan sürümdü, canlıdan alındı | ☑ |
| Y2 | `main` dalı + otomatik yayın iş akışları | ☑ 03.10 — main varsayılan dal; CLASPRC_JSON, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID eklendi; yayınlar elle başlatılır |
| Y3 | Apps Script kodlarının canlıdan çekilmesi (`Apps Script'i Depoya Çek`) | ☑ 02.10 — 13 proje, 66 dosya |
| Y6 | Cloudflare içeriği depoda (`cloudflare/`, README'de hangi adres ne) | ☑ 03.10 |
| C1 | WhatsApp düzeltmesi `bap-sistem` yerine yeni `bappizza` projesine yüklenmiş; çalışanlarda sorun sürüyor | ☑ 02.10 bap-sistem'e yayınlandı |
| C2 | Aynı arka uca yazan 4 mutfak paneli kopyası (bap-sistem, bappizza, damp-limit-5aba, black-credit-7dca) | ☑ 02.10 kopyalar silindi, tek adres bap-sistem.pages.dev |
| C3 | 2 boş Worker (billowing-credit-87e3, empty-firefly-7396) | ☑ 02.10 silindi |
| Y5 | Mutfak panelinin arka ucu `bap-panel-backend` (BAP PANEL Backend); `bap-satis-veri-ambari` yalnızca sipariş satırı bölme | ☑ tespit |
| Y4 | Ortak katman: `Ayarlar.gs` + `Ortak.gs` | ☐ |
