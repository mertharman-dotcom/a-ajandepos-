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
| K6 | Dilimli/yapraklı ürünlerin (ekmek, sucuk, pastırma, fesleğen…) mutfak birimi ve gramı Tbl_Hammaddeler'de iki sütunda tutulsun (`Mutfak_Birimi` = dilim, `Mutfak_Birimi_Gram` = 8); reçete gram tutar, mutfak reçete kartı "6 dilim" gösterir | Evet | ☐ sahip onayı |

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
| M9 | Tarifi ya da parti çıktısı eksik yarı mamuller: Konfi sarımsak, Pancarlı humus ("Humur" yazım hatası), Tavuk suyu, Karabuğday tabule, Humus, Falafel, Bulgur haşlanmış, File badem kavurma, Sotelenmiş kabak-havuç, Panini ekmeği, Lasagne Bolognese, Ispanak sos | Maliyete 0 giriyor | ☐ sahibinden tarif / parti çıktısı · ☑ 03.10 Acılı Zeytinyağ eklendi (500 ml zeytinyağ + 100 gr kırmızı biber pul → 600 ml) · ☑ 03.10 Konfi domates eklendi (parti 500 gr = 16 adet) |
| M10 | Panelde reçetesi bulunamayan satışlar (02.10, cironun %8,7'si): Şeftali Stracciatella Salata, Tiftik Etli Ispanaklı Salata, Börülce Bowl, Chicken Roll Bowl, Bap Ekşi Mayalı Special Sandviç, Linguine Deniz Mahsullü, Karpuz Semizotu Salata; içecekler (Coca-Cola, Ayran, Su, Fuse Tea) | Maliyet eksik | ◐ 03.10 Füme Dilli Sandviç ve Ekşi Mayalı BAP Special reçeteleri girildi (Tbl_Receteler 747–753) · ☐ K5 tablosu ya da `Maliyet_Eslestirme` sekmesi |
| M11 | Rende mozzarella J = 4.380 TL koli fiyatı (6 × 2 kg = 12 kg) ama H = 2 kg → kg fiyatı 2.190 TL okunuyor (doğrusu ≈ 365) | 28 pizza/panini 2–3 kat pahalı görünüyor | ☐ H 12 yapılmalı (ya da J 2 kg fiyatı); M3/M4 kuralıyla birlikte |
| M12 | Stracciatella H = 500 gr ama J = 1.700 TL kilo fiyatı (paket 500 g, 850 TL) | Panuozzo Roastbeef %64, Linguine Pomodoro Stracciatella %56 görünüyordu | ☑ 03.10 sahip teyidi, H = 1000 (Fiyat_Duzeltme_28.09 satır 35) → %47 ve %34 |
| M13 | Ekşi Mayalı Ekmek (UNO 450 g) H ve I boştu | Gramla yazılan reçetede maliyet 0 girerdi | ☑ 03.10 sahip teyidi: 450 g, 12 dilim, uçtaki 2 dilim kullanılmıyor → H/I = 450 gr., reçete 2 dilim = 90 gr (fire dahil); Fiyat_Duzeltme_28.09 satır 31–32 |
| M15 | Sebzede kasa fiyatı yok (sahip, 03.10): J kilo fiyatı. Cherry (H=5) ve pembe domates (H=7,5) kasa ağırlığına bölünüyordu | 25 üründe domates maliyeti eksik çıkıyordu (kilosu 20 / 13 TL) | ☑ 03.10 H=1 yapıldı (Fiyat_Duzeltme_28.09 satır 33–34). M4'teki bu iki ürün için risk kalktı |
| M16 | Konfi yağı her partide sıfırdan kullanılmıyor (10 partide bir yenileniyor, küfte hemen) | 700 gr yağın tamamı her partiye yazılırsa domates maliyeti ve yağ stok düşümü 10 kat çıkar | ☑ 03.10 reçetede 70 gr (ortalama pay), F `Tekrar_Parti` = 10 · ◐ mutfak paneli sayacı (YENİLE uyarısı + küf butonu, `Tekrar_Kullanim_Log`) PR'da, yayın bekliyor |
| M14 | 40'tan fazla reçete satırında miktar noktalı ("0.25", "0.1") — Türkçe tabloda metin olarak duruyor | Stok ve maliyet motoru sayı okuyamayabilir | ☐ virgüle çevrilecek (kuru rapor → onay) |

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

## R · Trendyol (`docs/trendyol-api.md`)

| | Sorun / iş | Durum |
|---|---|---|
| R1 | Trendyol API kimlik bilgileri (token) üç `.gs` dosyasında açık yazılı ve depoda. Script Properties'e taşınmalı; depo herkese açıksa Trendyol panelinden yenilenmeli | ☐ |
| R2 | Uber Eats geçişinde yorum/puan servisleri 403 döner; kod sessizce devam ediyor. 403 gelince Make bildirimi gönderilmeli | ☑ 03.10 yayınlandı |
| R3 | Degerlendirmeler sekmesinde "Eşleşti = HAYIR" satırları çok (örnek: Ocak 2026). Adisyo eşleşmesi yalnızca son 20.000 satıra bakıyor (`GERI_SATIR`); eski kayıtlar için normal olabilir ⚠️ bakılacak | ☐ |
| R4 | Trendyol yol haritası TY-1 … TY-7 (puan, tahmin, menü, cevap, iade, teslimat süresi) — `docs/trendyol-api.md` | ◐ 1. aşama 03.10 yayınlandı; sahip `raporTetikleyiciKur()` çalıştıracak |
| R5 | Yeni iadede bildirim — Trendyol 4 saat içinde karar istiyor; şu an iade takibi yoktu | ◐ 03.10 yayınlandı; tetikleyici kurulunca 10 dk'da bir |
| R6 | İade onaylanınca kuryeden düşüş elle yapılıyordu → Iadeler'e "Kuryeden Düş" kutusu; Kurye › Kesintiler'e yazar. 05.10 sahip gerçek moda aldı (`KESINTI_KURU = false`) | ☑ |
| R7 | İade sorumluluğu: Iadeler'e "Sorumlu" (Kurye / Mutfak / Müşteri-Platform / Belirsiz, sebepten önerilir); `Iade_Ozet`'te aylık mutfak zararı ve kurye bazında iade | ◐ |
| R8 | Yorum cevapları: Yorum_Cevap sekmesi, Claude taslağı, sahip onayı, Trendyol'a tek gönderim; telafi sözü Telafi_Listesi'ne (telefonsuz, adres Not'ta) | ◐ |
| R9 | Telafi_Listesi otomatik eşleşmesi telefonla çalışıyor; Trendyol müşterisi (maskeli telefon) adresle tanınmalı — Adisyo toplayıcıda `telafiKontrol_`'e adres anahtarı eklenecek | ☐ |
| R10 | Panel › Müşteri İlişkileri: Trendyol puanı + sipariş (30 gün, mağaza başına), yarın tahmini, iadeler (bekleyen, bu ayın mutfak/kurye zararı), yorum cevapları (onay bekleyen, son gönderilen). Veri kapısı `musteri_()` Trendyol Yorumlar tablosunu okur | ◐ 05.10 yayına alındı |
| R11 | Panelden yorum cevabı onayı: Müşteri İlişkileri › Yorum cevapları'nda metni düzelt + telafi kutusu + 'Onayla ve gönder' → `/api/yorum-onay` → veri kapısı `yorumOnay_` yalnız Yorum_Cevap'a Onay yazar; Trendyol'a gönderimi Trendyol projesi bir kez yapar | ◐ 05.10 yayına alındı |
| R12 | Panelden iade aksiyonu: bekleyende Kabul / Reddet (neden + açıklama) + sorumlu + kuryeden düş; kabul edilmişte sorumlu + kuryeden düş. Veri kapısı `iadeIslem_` Iadeler'e istek yazar (İşlem / Sorumlu / Kuryeden Düş); Trendyol projesi `iadeIslemleriYap_` 10 dk'da bir PUT accept/unresolve'u bir kez gönderir | ◐ 05.10 yayına alındı |
| R13 | Puan grafiğinde 1★ değerlendirme gelen günler kırmızı nokta (Degerlendirmeler, ortalama < 2) | ☑ 05.10 |

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
