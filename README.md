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

Panelde **Satış Maliyeti** bölümü (`#maliyet`). Seçilen tarih aralığında Adisyo'dan gelen kapanmış siparişlerdeki
her ürün **BAP Stok Takip Sistemi**'ndeki reçetesine açılır ve **malzeme malzeme** listelenir:

- **Tür:** Hammadde, Yarı mamul, Direkt satış, Ambalaj, Hepsi ya da Satılan ürünler (adet, ciro, maliyet).
- **Filtre:** tarih aralığı (başlangıç–bitiş ya da hazır: bugün, dün, bu hafta, son 7 gün, bu ay, son 30 gün), şube, kategori, ad araması.
- **Her malzeme için:** kullanılan miktar (gr / kg / ml / lt / adet), stok (Sube_Stok mevcut stok), kaç gün yeteceği,
  tutar, toplam içindeki payı ve en çok kullanan ürünler. Başlığa dokununca sıralanır.

| Tür | Nereden hesaplanır |
|---|---|
| Hammadde | `Tbl_Receteler`'de doğrudan kullanılan hammaddeler; miktar stok biriminde, fiyat `Tbl_Hammaddeler` son alış / paket içeriği |
| Yarı mamul | Reçetedeki yarı mamuller (gr ya da adet); fiyat `Tbl_YariMamulRecete` parti maliyeti / parti çıktısı |
| Direkt satış | `Direktsatisurunler`; koli fiyatı / koli içeriği |
| Ambalaj | Yalnız paket siparişte, `Ambalaj_Kurallari` (önce ürün, yoksa kategori) × `Ambalaj_Hammadde`; stok Merkez depoda |

- Tüketim siparişin **Ürün Çıkan Şube**'sine yazılır; boşsa siparişin geldiği şubeye.
- Kaç gün yeter = bugünkü stok ÷ seçili tarihlerdeki günlük ortalama kullanım.
- Reçetesi bulunamayan satışlar ve tanımı/fiyatı eksik malzemeler sayfanın altında listelenir.
  Satış adı reçetedekinden farklıysa stok dosyasına `Maliyet_Eslestirme` sekmesi açılır: A satış adı, B reçetedeki ürün adı.
- Aralık panelden ayrıca istenir (`/api/tuketim`, en fazla 3 ay, 2 dakika önbellek); bugünü içeren aralık 5 dakikada bir tazelenir.
- Yalnız okur; hiçbir tabloya yazmaz. Yayınlamadan önce Apps Script'te `testTuketim` çalıştırılıp günlüğe bakılır.

## Yayına alma

1. **Apps Script** (BAP Panel Veri Kapısı): `apps-script/bap-panel-veri-kapisi/Kod.gs` içeriğini `Kod.gs` dosyasına yapıştır,
   kaydet → *Dağıt › Dağıtımları yönet* → mevcut dağıtımı düzenle → *Sürüm: Yeni sürüm* → Dağıt.
   (Adres değişmez; Cloudflare'deki `GAS_URL` aynı kalır.)
2. **Cloudflare Worker** (bap-panel): `node bap-panel/build.js` → oluşan `bap-panel/worker.js` içeriğini
   Workers › bap-panel › *Edit code* ekranına yapıştır → *Deploy*.

Sayfayı düzenlerken `bap-panel/page.html` ve `bap-panel/worker.template.js` değiştirilir; `worker.js` bunlardan üretilir.
