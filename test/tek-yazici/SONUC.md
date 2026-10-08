# Tek yazıcı — gerçek kopya testi sonucu (08.10.2026)

Canlı geçiş, stok düzeltmesi, veri temizliği ve ücretli plan **onaylı değil**. Bu belge yalnız test sonucudur.

## Sürüm

Test edilen ve canlıya önerilecek kod aynı sürümdür. Derleme (`build.mjs`) önce `dist/canli-aday/` altında canlı dosyaları üretir,
test dosyalarını bunlardan YALNIZ dosya kimliklerini TEST kopyalarına çevirerek türetir ve ikisini karşılaştırır; fark varsa yayın durur.
Sürüm satırı ve dosya özetleri `dist/denetim.txt` başındadır (iş akışı çıktısında görünür).

## Tüketim kayıt zamanı (sahibin 08.10 kararı → koddaki kural)

| Durum | Kayıt zamanı |
|---|---|
| Paket, şube çıkışı var | **Tam çıkış saati** (tahmin, pencere, ödeme/kapanış yok) |
| Masa (sahip kararı 08.10) | **Sipariş girildikten 15 dk sonra** (`kural-masa`). Sayım anında açık masalar notta "ilave olabilir — kontrol edin" diye listelenir |
| Ödenmez — personel yemeği, telafi (sahip kararı 08.10) | **Sipariş saati, hemen** (`kural-odenmez`) |
| Gel-al, çıkış yok | Sipariş saati (`kural-gelal`) — sahibin onayı bekleniyor (ayda ~6 sipariş) |
| Gel-al, çıkış var | Çıkış saati |
| Paket, çıkış **eksik** | Saat atanmaz. Yalnız kesin sınırlar: sipariş sayımdan sonraysa → sonra; kapanış sayımdan önceyse → önce (kapanış tüketim zamanı değil, "en geç" sınırı). İkisi de değilse sayım otomatik uygulanmaz: HATA + iki olası değer, karar Detay'a `HAZIRDA:<no>` / `SONRA:<no>` yazılarak verilir |
| Hazırlanıp çıkmadan iptal | Tüketim korunur: otomatik iade yok; mutfak zayi girer ("İptal (hazırlanmıştı)" + sipariş no) |

Veri: 06.09'dan beri paket siparişlerin %99,4'ünde çıkış saati var; masada %17.

**Sayım sırasında hazırlanmış ama çıkmamış siparişler:** sayım kaydedilirken ekran sorar; fişteki numaralar `HAZIRDA:` olarak
kaydedilir. Bunlar sayımdan önce tüketilmiş sayılır (rafta yoklar); sayım, Satış Motoru onları düşene kadar bekler; çıkışta ikinci fark oluşmaz.
Soru boş geçilirse açık siparişler sonuç notunda "bildirilmedi" diye listelenir. Mümkünse sayım, bekleyen hazırlık yokken yapılmalı.

## Gerçek kopya testleri (TEST stok kopyası, Tiramisu YM Fikirtepe)

| # | Kontrol | Sonuç |
|---|---|---|
| 1 | Satış: çıkış saatli kapalı paket sipariş (2 adet) | ✅ GEÇTİ — 118 → 116 |
| 2 | Eşzamanlı: motor kilidi 40 sn tutulurken panelden zayi | ✅ GEÇTİ — panel beklemeden 01:02:51'de kuyruğa yazdı; kilit bırakılınca 01:03:06'da tek kez işlendi (116 → 115) |
| 3 | Aynı kaydın (aynı istekId) tekrar gönderilmesi | ✅ GEÇTİ — kuyrukta tek satır |
| 4 | Kesinti sonrası devam ("stok yazıldı, iz yazılmadı" anında kesme) | ✅ GEÇTİ — sonraki tur "kesintiden sonra tamamlandı", 115 → 112, hareket izi tek |
| 5 | Bekleyen / uygulanmış ayrımı | ✅ GEÇTİ — panel kaydı "BEKLIYOR −1" olarak ayrı listelendi, stok değişmedi; işlenince 112 → 111 |
| 6 | Sayım + hazırlanmış-çıkmamış sipariş (HAZIRDA:9002) | ✅ GEÇTİ — sayım 9002 düşülene kadar bekledi; sonra 110 → 100 (sayılan aynen, ikinci fark yok) |
| 7 | Yedekten dönüş (yedek 01:10:31) | ✅ GEÇTİ — geri yükleme + yeniden işleme sonrası yine 100; geçmişte her olay tam bir kez. ⚠️ Geri yükleme 236 sn sürdü (Apps Script sınırı 360 sn) |
| 8 | Geri dönüş provası (eski panel yeniden kuruldu) | ✅ GEÇTİ — eski panel doğrudan yazdı (100 → 98), kuyruğa yazmadı |
| 9 | Son sürümle tekrar (dakikalık tetikleyici açık, HAZIRDA:9003) | ✅ GEÇTİ — tetikleyici kendiliğinden işledi; 97 → 90; not: "1 hazırda bildirilen sipariş sayımdan önce tüketilmiş sayıldı" |
| 11 | Masa kuralı (sürüm 757b62b): masa 10:28'de açıldı, sayım 10:48, masa 10:49'da kapandı | ✅ GEÇTİ — tüketim 10:43 (girişten 15 dk) → sayımdan önce; sayım masa düşülene kadar bekledi, sonra 87 → 80 (sayılan aynen); notta "Sayım anında açık masa: no 9101 … ilave olabilir — kontrol edin". ⚠️ Bilgi notu "1 masa/personel siparişi kurala göre sayıldı" gerçek çalışmada görünmedi (yerelde aynı verilerle görünüyor); stok sonucunu etkilemiyor, incelenecek (P49) |
| — | Yerel testler (sahte tablo) | ✅ 24/24 kuyruk testi; eşzamanlılık: eski yöntem 5 senaryonun 4'ünde kayıp, yeni 0 |
| 10 | Telefon testi (sahip, 08.10 12:40 ve 12:53) | ✅ GEÇTİ — iki zayi (Ürün › Tiramisu: Tiramisu + 3 ambalaj; Yarı mamul › Tiramisu) önce "1 kayıt stoka işlenmeyi bekliyor" göründü, sonra işlendi: 90 → 89 → 88; kuyrukta ve hareket izinde her kayıt tek. Test işleyicisi sonra kapatıldı |

**Denenmeyen / kalan**
- Alış Motoru'nun (fatura) gerçek kopyada kuyrukla birlikte çalışması — yalnız yerel ve kod incelemesi.
- Kesinti "iz", "plan", "yeni satır" noktaları gerçek kopyada denenmedi (yerelde geçti); gerçekte yalnız "stok" noktası denendi.
- Çıkış saati eksik siparişte HATA + elle karar akışı — yalnız yerel.
- Canlı e-posta uyarısı (testte e-posta kapalı; uyarılar sekmeye yazılıyor).
- Uzun süreli (gün boyu) tetikleyici + Satış Motoru birlikte çalışması ve kota.

**Test sırasında görülen**
- Test web uygulaması bazı çağrılarda 30–50 sn bekleyip "dosya şu an açılamıyor" döndü; iş yine yapılmıştı. Bir kez de test aracımın
  sipariş ekleme çağrısı (GET) iki kez çalıştı → aynı sipariş iki satır oldu. Panel kayıtları istekId ile korunduğu için bu panelde olmaz (Test 3).
- Bu yüzden bir kusur bulundu ve düzeltildi: aynı sipariş numarası iki satırdaysa (biri iptal) iptal satır çıkış saatini eziyordu. Düzeltme sonrası Test 9 yapıldı.

**Kota (ölçüm):** boş tur 0,33 sn, kayıt varken 5–6 sn. Dakikada bir: günde ≈ 1.440 × 0,33 sn ≈ 8 dk + kayıtlı turlar (günde ~16, en çok ~64) ≈ 2–6 dk
→ günde ≈ 10–14 dk ek tetikleyici süresi (Google ücretsiz hesap sınırı günde 90 dk; Satış Motoru da aynı sınırı kullanıyor — canlıda izlenmeli).

## Canlıya geçişi engelleyen açık konular
1. ~~Masa / personel kuralı~~ 08.10'da karara bağlandı (masa +15 dk, personel hemen). Yalnız gel-al (çıkışsız, ayda ~6) için onay bekleniyor.
2. **Mutfak alışkanlığı:** sayımda "hazırda sipariş no" sorusu (P45) ve hazırlanıp iptal edilen ürün için zayi girişi (P47) anlatılmalı.
3. **Alış Motoru** gerçek kopyada kuyrukla denenmeli (yukarıda "kalan").
5. **Yayın hattı:** `stok-takip-sistemi` yayını "birden fazla web dağıtımı" diye kırmızı bitiyor (Y10). Kod yükleniyor ama bu düzeltilmeden geçiş yapılmamalı.
6. Yedekten dönüş yöntemi canlı boyutta 6 dk sınırına yakın → canlıda Drive sürüm geçmişi + yalnız `Sube_Stok` geri alma yöntemi seçilmeli; ayrıca yedekten sonra işlenmiş faturalar için işaret kaldırma eklenmeli. (Geçişin kendisini değil, olası bir felaket dönüşünü etkiler.)

## Değişecek canlı akışlar
- **Mutfak paneli** (üretim, zayi, transfer, sayım, düzeltme): stoka doğrudan değil `Stok_Kuyrugu`'na yazar; ekranda "⏳ stoka işlenmeyi bekliyor" görünür, ≤1–2 dk'da uygulanır.
- **Sayım ekranı:** kaydederken "hazırlanmış ama çıkmamış sipariş no?" sorusu. Sayım, sayımdan önce tüketilen siparişler düşülene kadar "bekliyor" kalabilir.
- **Satış Motoru / Alış Motoru:** her turda önce kuyruğu işler; kuyruk hata verirse o tur atlanır (sipariş/fatura kaybolmaz) ve e-posta gider.
- **Yeni dakikalık tetikleyici:** `stokKuyruguTetik`.
- **Stok_Hareketleri:** mutfak kayıtlarında Tarih = olayın zamanı, Detay'da `KUYRUK:<id>`.
- Değişmeyen: Adisyo → satış dosyası, tedarikçi siparişi / WhatsApp, fatura okuma, raporlar.

## Belirsiz stoklar düzeltilmeden tek yazıcıya geçilebilir mi?
**Evet.** Tek yazıcı mevcut sayıları değiştirmez; yalnız bundan sonraki her değişikliğin kaybolmadan, bir kez ve sırayla yazılmasını sağlar.
Bugünkü sayılar yanlışsa yanlış kalır ama **yeni kayıp eklenmez**. Bağımlı olduğu şeyler: stok projesi kodu + tetikleyici, panel arka ucu,
ön yüz (üçü aynı geçişte, bu sırayla), Apps Script kotası, Y10 yayın sorunu. **Bağımlı olmadığı:** K3 birim onayı ve kör sayım — onlar ayrı ilerler.
Not: K3'teki birim uyuşmazlıkları (gram/adet) geçişten sonra da aynı şekilde yanlış sayı üretmeye devam eder; tek yazıcı bunu çözmez, K3 çözer.
Geçişten sonraki ilk kör sayım, sayım-anı kuralıyla doğru uygulanır.

## Geçiş adımları (onaylanırsa)
1. Sakin bir saat seç (sayım ve yoğun hazırlık yokken). Canlı stok dosyasının Drive kopyasını al.
2. `stok-takip-sistemi`: `Stok Kuyrugu.gs`, `Stok Kuyrugu Uyari.gs` ve Satış/Alış Motoru'nun tek satırlık değişikliği `main`'e → otomatik yayın. Dakikalık tetikleyici kurulur.
3. `bap-panel-backend`: önerilen `Kod.gs` → otomatik yayın.
4. `bap-sistem` ön yüzü → otomatik yayın.
5. İlk mutfak kaydında kuyrukta ISLENDI ve stokta tek değişiklik görüldüğü kontrol edilir; ilk gün e-posta uyarıları izlenir.

## Geri dönüş adımları (provası Test 8)
1. Panel arka ucunun eski `Kod.gs`'i geri alınır (`git revert`) → panel yine doğrudan yazar.
2. Kuyrukta BEKLIYOR kalmayana kadar beklenir (tetikleyici işlemeye devam eder; birkaç dakika).
3. Tetikleyici kaldırılır; Satış/Alış Motoru değişikliği geri alınır; ön yüz geri alınır.
Veri kaybı olmaz: kuyruktaki her kayıt ya işlenmiştir ya da 2. adımda işlenir.
