# BAP Yönetim Paneli

| Klasör | Ne | Nerede çalışır |
|---|---|---|
| `bap-panel/` | Panel sayfası ve Cloudflare Worker | `bap-panel.mertharman.workers.dev` |
| `apps-script/bap-panel-veri-kapisi/` | Veri kapısı (tabloları okur, panelden gelen girişleri yazar) | Google Apps Script: **BAP Panel Veri Kapısı** |

## Toptancı ödemeleri ekranı

Panelde **Toptancı Ödemeleri** bölümü (`#odeme`). Girilen ödeme
**Kolaybi Fatura Ham Veri › Odemeler** sekmesinin sonuna yeni satır olarak yazılır
(Tarih, Tedarikçi, Tutar, Yöntem, Açıklama, Kayıt_Zamanı, Kaynak=Panel) ve
Finans / Alımlar sayfalarındaki tedarikçi borcundan düşülür.

- Toptancı yalnızca **Tedarikciler** sekmesindeki listeden seçilir (isim birebir eşleşmezse borçtan düşülmez).
- Aynı gün + aynı toptancı + aynı tutar varsa önce onay ister; çift tıklama / yeniden gönderme tek kayıt yazar.
- Mevcut satırlara dokunmaz, hiçbir şey silmez. Yanlış kaydı tablodan düzeltin.
- Her giriş ayrıca **BAP Panel Cevapları** tablosuna iz olarak düşer.

## Satış maliyeti ekranı

Panelde **Satış Maliyeti** bölümü (`#maliyet`). Adisyo'dan gelen kapanmış siparişlerdeki her ürün
**BAP Stok Takip Sistemi**'ndeki reçetesine açılır ve dört kaleme ayrılır:

| Kalem | Nereden hesaplanır |
|---|---|
| Hammadde | `Tbl_Receteler`'de doğrudan kullanılan hammaddeler × `Tbl_Hammaddeler` son alış fiyatı / paket içeriği |
| Yarı mamul | Reçetedeki yarı mamuller: `Tbl_YariMamulRecete` parti maliyeti / parti çıktısı (`Tbl_YariMamul tablosuna Cikti_Tipi`) |
| Direkt satış | İçecek gibi olduğu gibi satılanlar: `Direktsatisurunler` koli fiyatı / koli içeriği |
| Ambalaj | Yalnız paket siparişte, `Ambalaj_Kurallari` (önce ürün, yoksa kategori kuralı) × `Ambalaj_Hammadde` fiyatı |

- Maliyet siparişin **Ürün Çıkan Şube**'sine yazılır; boşsa siparişin geldiği şubeye.
- Dönemler: bugün, dün, bu hafta, son 7 gün, bu ay; ayrıca son 14 günün kalemlere göre grafiği ve cironun yüzdesi.
- Reçetesi bulunamayan satışlar ve fiyatı olmayan malzemeler sayfanın altında listelenir (maliyete sıfır girerler).
  Satış adı reçetedekinden farklıysa stok dosyasına `Maliyet_Eslestirme` sekmesi açılır: A satış adı, B reçetedeki ürün adı.
- Yalnız okur; hiçbir tabloya yazmaz. Panel 5 dakikada bir, veri kapısı 2 dakikalık önbellekle yenilenir.

## Yayına alma

1. **Apps Script** (BAP Panel Veri Kapısı): `apps-script/bap-panel-veri-kapisi/Kod.gs` içeriğini `Kod.gs` dosyasına yapıştır,
   kaydet → *Dağıt › Dağıtımları yönet* → mevcut dağıtımı düzenle → *Sürüm: Yeni sürüm* → Dağıt.
   (Adres değişmez; Cloudflare'deki `GAS_URL` aynı kalır.)
2. **Cloudflare Worker** (bap-panel): `node bap-panel/build.js` → oluşan `bap-panel/worker.js` içeriğini
   Workers › bap-panel › *Edit code* ekranına yapıştır → *Deploy*.

Sayfayı düzenlerken `bap-panel/page.html` ve `bap-panel/worker.template.js` değiştirilir; `worker.js` bunlardan üretilir.
