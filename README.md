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

## Günlük fiş (İşletme Özeti)

**İşletme Özeti** sayfasında, Yemeksepeti ve Trendyol online siparişleri için gün sonunda kesilecek fiş şube şube hesaplanır:

```
Kesilecek fiş = YS + Trendyol online
              − Masa / gel-al siparişlerinde kredi kartı + yemek kartı
              − WhatsApp / telefon (Adisyo paket) siparişlerinde kredi kartı + yemek kartı
              − YS + Trendyol kapıda ödemesi kredi kartına dönen tutar
```

- Rakamlar **Adisyo sipariş verisi › Satıs Verileri** sekmesinden (Sipariş Kanalı, Masa Siparişi, Ödeme Yöntemi, Tahsil Tipi) gelir; yalnız kapanmış siparişler sayılır. İş günü 03:00'te kapanır.
- Getir ve diğer platformlar hesaba girmez. YS / Trendyol kapıda yemek kartı düşülmez, kartta bilgi olarak yazar.
- Kurye ödeme yöntemini yanlış girdiyse kutudaki rakam elle düzeltilir (sarı görünür, kayıtta "Elle değişen" sütununa düşer).
- **Fişi kaydet** ile kesilen tutar **BAP Günlük Fiş Kaydı › Fisler** tablosuna yazılır (ilk kayıtta kendiliğinden oluşur). Aynı gün + şube için tek satır tutulur; tekrar kaydedilirse onay sorup o satırı günceller.
- Son 14 günün grafiği hesaplanan ve kesilen fişi yan yana gösterir; fişi kaydedilmemiş günler kırmızı.

## Yayına alma

1. **Apps Script** (BAP Panel Veri Kapısı): `apps-script/bap-panel-veri-kapisi/Kod.gs` içeriğini `Kod.gs` dosyasına yapıştır,
   kaydet → *Dağıt › Dağıtımları yönet* → mevcut dağıtımı düzenle → *Sürüm: Yeni sürüm* → Dağıt.
   (Adres değişmez; Cloudflare'deki `GAS_URL` aynı kalır.)
2. **Cloudflare Worker** (bap-panel): `node bap-panel/build.js` → oluşan `bap-panel/worker.js` içeriğini
   Workers › bap-panel › *Edit code* ekranına yapıştır → *Deploy*.

Sayfayı düzenlerken `bap-panel/page.html` ve `bap-panel/worker.template.js` değiştirilir; `worker.js` bunlardan üretilir.
