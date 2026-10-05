# BAP Yemek Kartı projesi — taşıma planı (06.10.2026)

Amaç: Pluxee, Edenred, Paye, SetCard'ın bütün kodu tek Apps Script projesinde, bütün verisi tek tabloda.
Kurye projesinde yalnız kurye işleri kalır.

## Son hâl

| | Nerede |
|---|---|
| Kod | Yeni Apps Script projesi **BAP Yemek Kartı** (`apps-script/bap-yemek-karti/`) |
| Veri | **BAP Yemek Kartı Tahsilatları** tablosu (zaten var): Pluxee, Edenred, Paye, Paye İşlemler, SetCard, Pluxee Fatura |
| Doğrulama kodları (SMS) | Tek ortak sistem: `?sayfa=kod&kaynak=pluxee|edenred&kod=…` (ayrı 'Pluxee Kod' sekmesi ve ayrı Pluxee kod sayfası kalkar) |
| Mac programları | `pluxee.mjs`, `edenred.mjs` yeni projenin adresine gönderir |
| iPhone kestirmeleri | İkisi de yeni projenin adresini çağırır (aynı biçim, yalnız `kaynak` farklı) |
| Yemek kartı ajanı | Panel veri kapısında kalır (açık hesap, Tahsilatlar, Adisyo orada); YEMEKKARTI tablosundan okur |

Kurye projesinden çıkacaklar: `Pluxee.gs`, `PluxeeKodSayfa.gs`, `Yemek Karti.gs`, `SetCard.gs`, `Kopru.gs` içindeki
pluxee / edenred / kod türleri, `Kurye Web.gs` içindeki `?sayfa=pluxee` ve `?sayfa=kod`. Kurye tablosundaki
'Pluxee Kod' sekmesi ve '(eski)' sekmeleri en sonda sahibinin onayıyla silinir.

## Adımlar

1. **Sahibi:** script.google.com › Yeni proje › adı "BAP Yemek Kartı" › Proje Ayarları › Komut dosyası kimliği → depoya.
2. **Depo:** kod yeni klasöre taşınır, `projeler.json`'a eklenir, yayınlanır. Kurye'deki kopyalar **henüz silinmez**
   (Mac ve kestirmeler eski adrese bağlı, çalışmaya devam eder).
3. **Sahibi:** yeni projede Dağıt › Yeni dağıtım › Web uygulaması (Ben olarak, Herkes) → adresi gönderir;
   Komut dosyası özellikleri: köprü anahtarı, kestirme anahtarı, SETCARD_VKN / SETCARD_GSM / SETCARD_SIFRE.
   `kurulum()` bir kez çalıştırılır: Paye (02:30, 09:30) ve SetCard (saatlik) tetikleyicileri.
4. **Akşam, Mac başında birlikte:** Mac `ayar.json` adresi değişir; Pluxee ve Edenred kestirmeleri yeni adresle baştan kurulur;
   ikisi de denenir.
5. **İkisi de 1 gün sorunsuz çalışınca:** Kurye projesinden yemek kartı kodu silinir; Kurye'deki eski Paye tetikleyicisi silinir;
   kurye tablosundaki 'Pluxee Kod' ve '(eski)' sekmeleri sahibinin onayıyla silinir.

Geri dönüş: 5. adıma kadar eski yol duruyor; yeni projede sorun olursa Mac ayarı eski adrese döndürülür.
