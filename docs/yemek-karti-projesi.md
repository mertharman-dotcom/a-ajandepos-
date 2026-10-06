# BAP Yemek Kartı projesi — taşıma planı (06.10.2026)

Amaç: Pluxee, Edenred, Paye, SetCard'ın bütün kodu tek Apps Script projesinde, bütün verisi tek tabloda.
Kurye projesinde yalnız kurye işleri kalır.

## Son hâl

| | Nerede |
|---|---|
| Kod | **BAP Yemek Kartı** Apps Script projesi, "BAP Yemek Kartı Tahsilatları" tablosuna bağlı (Uzantılar › Apps Script) — `apps-script/bap-yemek-karti/` |
| Veri | **BAP Yemek Kartı Tahsilatları** tablosu (zaten var): Pluxee, Edenred, Paye, Paye İşlemler, SetCard, Pluxee Fatura |
| Doğrulama kodları (SMS) | Tek ortak sistem: `?sayfa=kod&kaynak=pluxee|edenred&kod=…` (ayrı 'Pluxee Kod' sekmesi ve ayrı Pluxee kod sayfası kalkar) |
| Mac programları | `pluxee.mjs`, `edenred.mjs` yeni projenin adresine gönderir |
| iPhone kestirmeleri | İkisi de yeni projenin adresini çağırır (aynı biçim, yalnız `kaynak` farklı) |
| Yemek kartı ajanı | Panel veri kapısında kalır (açık hesap, Tahsilatlar, Adisyo orada); YEMEKKARTI tablosundan okur |

Kurye projesinden çıkacaklar: `Pluxee.gs`, `PluxeeKodSayfa.gs`, `Yemek Karti.gs`, `SetCard.gs`, `Kopru.gs` içindeki
pluxee / edenred / kod türleri, `Kurye Web.gs` içindeki `?sayfa=pluxee` ve `?sayfa=kod`. Kurye tablosundaki
'Pluxee Kod' sekmesi ve '(eski)' sekmeleri en sonda sahibinin onayıyla silinir.

## Adımlar

1. ☑ 06.10 **Sahibi:** tablo › Uzantılar › Apps Script › adı "BAP Yemek Kartı" › Komut dosyası kimliği → depoya.
2. **Depo:** kod yeni klasöre taşınır, `projeler.json`'a eklenir, yayınlanır. Kurye'deki kopyalar **henüz silinmez**
   (Mac ve kestirmeler eski adrese bağlı, çalışmaya devam eder).
   İlk yayın web dağıtımını kendisi oluşturur ve adresini iş akışı günlüğüne yazar (`apps-script-yayinla.yml`);
   dağıtım kimliği sonra `projeler.json`'a eklenir. Köprü ve kestirme anahtarları kurye projesindekiyle aynı (Mac'te yalnız adres değişir).
3. **Sahibi:** Komut dosyası özellikleri: SETCARD_VKN / SETCARD_GSM / SETCARD_SIFRE. `kurulum()` bir kez çalıştırılır
   (izinler + Paye 02:30/09:30 ve SetCard saatlik tetikleyicileri). Kurye projesindeki 2 `payeMailCek` tetikleyicisi silinir.
4. **Akşam, Mac başında birlikte:** Mac `ayar.json` adresi değişir; Pluxee ve Edenred kestirmeleri yeni adresle baştan kurulur;
   ikisi de denenir.
5. **İkisi de 1 gün sorunsuz çalışınca:** Kurye projesinden yemek kartı kodu silinir; Kurye'deki eski Paye tetikleyicisi silinir;
   kurye tablosundaki 'Pluxee Kod' ve '(eski)' sekmeleri sahibinin onayıyla silinir.

Geri dönüş: 5. adıma kadar eski yol duruyor; yeni projede sorun olursa Mac ayarı eski adrese döndürülür.

## Sahibin istediği iki taraflı kontrol (06.10.2026 — henüz yapılmadı, sırası gelince)

Bütün yemek kartları için geçerli (Pluxee, Edenred, Paye, SetCard). Örnek: SetCard sekmesi.

1. **Online ödemeler** (SetCard'da `Terminal = Trendyol Pos`): Siparişler'de Trendyol'dan gelen "SetCard online" siparişleriyle eşleştirilir.
   Fark varsa sahibine bildirilir.
2. **Kapıda ödemeler** (SetCard'da `Terminal = Mobil Pos`, `Cihaz / Kullanıcı` = kurye / dükkan cihazı): kuryenin açık hesabıyla eşleştirilir.
   Ödeme varsa kurye sayfasındaki açık hesap kapatılır (yemek kartı ajanı); hangi çekimin hangi siparişle eşleştiği yazılır
   ya da arka planda tutulur (panelde görünebilsin).
3. **İki yönlü:**
   - Siparişte kart seçilmiş → kart dosyasında karşılığı var mı?
   - Kart dosyasında çekim var → bir siparişle eşleşiyor mu?
   Açıkta kalanlar iki taraflı listelenir: "çekimi olmayan sipariş" ve "siparişi olmayan çekim (fazla ödeme)".
4. **Parçalı ödeme olabilir:** müşteri yemek kartını seçip 1000 TL'lik siparişin 700 TL'sini kartla, kalanını kredi kartı / nakit /
   başka yemek kartıyla ödeyebilir. Bu yüzden çekim tutarı sipariş tutarından **az** olabilir; bu durum "parçalı" diye ayrı gösterilir,
   kalan tutarın nereden geldiği sorulur. Hata sayılıp kapatılmaz.

Mevcut parçalar: kart ajanı (`acikKanit_` / `kartEslestir_`, veri kapısı; şu an yalnız tam tutar eşleşmesi), Finans › Yemek kartı mutabakatı (YK3; gün toplamı).
Bu iş ikisini sipariş × çekim düzeyinde birleştirir; yeni bir sekme / ikinci liste açılmaz.
