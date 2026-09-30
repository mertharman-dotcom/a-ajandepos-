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

## Vardiya girişi

Panelde **Personel › Vardiya planı** sekmesi. Son 4 hafta ile önümüzdeki 4 hafta seçilip
*Bu haftanın vardiyasını gir / düzenle* ile her kişi için gün gün vardiya seçilir.
Kayıt **BAP Personel › Vardiya** sekmesine, yönetici panelinin yazdığı biçimle yazılır
(Hafta, İsim Soyisim, Şube, Planlanan, Off, Pzt…Paz); QR giriş-çıkış bu planı kullanır.

- Seçenekler BAP_Personel uygulamasındaki `VARDIYALAR` listesiyle birebir aynıdır (Cum/Cmt/Paz gece kapanışlı seçenekler dahil).
  O listeye yeni vardiya eklenirse `Kod.gs › VARDIYA_SECENEK/VARDIYA_HAFTA_*` ve `page.html › VARD_*` da güncellenmeli.
- Yalnız değişen kişinin o haftaki satırı güncellenir ya da sona eklenir; satır silinmez.
- Siz düzenlerken aynı kişinin vardiyası başka yerden değiştirildiyse kayıt reddedilir (üzerine yazmaz).

## Yayına alma

> **Adres değişmesin:** Apps Script'te hiçbir zaman *Yeni dağıtım* yapmayın ve eski dağıtımı arşivlemeyin.
> Her güncellemede *Dağıtımları yönet › mevcut dağıtımı düzenle (kalem) › Sürüm: Yeni sürüm › Dağıt*.
> Yeni dağıtım yeni bir `/exec` adresi üretir; eski adres arşivlenince panel
> "Apps Script adresi bulunamadı" hatası verir.
>
> **Depo canlıyla aynı olmalı:** Kod başka bir yerden (doğrudan Apps Script / Cloudflare ekranından) değiştirilirse
> önce buraya alınmalı; yoksa buradan yayınlamak o değişiklikleri siler.

1. **Apps Script** (BAP Panel Veri Kapısı): `apps-script/bap-panel-veri-kapisi/Kod.gs` içeriğini `Kod.gs` dosyasına yapıştır,
   kaydet → *Dağıt › Dağıtımları yönet* → mevcut dağıtımı düzenle → *Sürüm: Yeni sürüm* → Dağıt.
   (Adres değişmez; Cloudflare'deki `GAS_URL` aynı kalır.)
2. **Cloudflare Worker** (bap-panel): `node bap-panel/build.js` → oluşan `bap-panel/worker.js` içeriğini
   Workers › bap-panel › *Edit code* ekranına yapıştır → *Deploy*.

Sayfayı düzenlerken `bap-panel/page.html` ve `bap-panel/worker.template.js` değiştirilir; `worker.js` bunlardan üretilir.
