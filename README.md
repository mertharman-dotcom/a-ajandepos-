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

## Puantaj düzeltme

Giriş/çıkış iki yoldan düzeltilir; ikisi de aynı hesabı yapar ve bordro (puantajdan hesaplandığı için) buna göre çıkar.

**1) E-tablodan:** *BAP Personel › Personel_Giris_Cikis* sekmesinde C (Mesai Giriş) ya da D (Mesai Çıkış) değiştirilir.
Satır kendiliğinden yeniden hesaplanır ve **Gün Genel Notu = "Tablodan Güncellendi"** yazar.
Tetikleyicinin kaçırdığı satırları (toplu yapıştırma vb.) saatlik tarama yakalar.

**2) Panelden:** *Personel › Puantaj düzeltme* sekmesinde günün yanındaki **Düzelt** (gerekçe zorunlu) → "Elle Düzeltildi".

Hesap kuralı:
- C ve D dolu → Toplam = çıkış − giriş. Off gününde fazla mesai = toplamın tamamı; diğer günlerde
  Fazla = Toplam − vardiya süresi (sistemin o satırda kullandığı süre → yoksa Vardiya sekmesi → yoksa kişinin en sık vardiyası).
  Yıllık izin / rapor / ücretsiz izin / devamsızlık işareti varsa kalkar.
- C ve D ikisi de silinirse → vardiya planında off ise OFF, çalışma günüyse **Devamsızlık** işaretlenir.
- Yalnız giriş var, çıkış yok → geçmiş günse not düşülür, toplam değiştirilmez.
- Ham Giriş / Ham Çıkış (QR'ın gerçek saati) hiç değişmez. Eski değerler **Manuel** sütununa ve **Islem_Loglari**'na yazılır.

## Yayına alma

1. **Apps Script** (BAP Panel Veri Kapısı): `apps-script/bap-panel-veri-kapisi/Kod.gs` içeriğini `Kod.gs` dosyasına yapıştır,
   kaydet → *Dağıt › Dağıtımları yönet* → mevcut dağıtımı düzenle → *Sürüm: Yeni sürüm* → Dağıt.
   (Adres değişmez; Cloudflare'deki `GAS_URL` aynı kalır.) `appsscript.json` da güncellendiyse onu da yapıştırın
   (*Proje ayarları › "appsscript.json" dosyasını düzenleyicide göster*).
   Tablo tetikleyicisi için bir kez **`tabloTetikleyicisiKur`** fonksiyonunu çalıştırın; izin ister, sonra
   daha önce elle değiştirilmiş satırları tarayıp yürütme günlüğüne listeler.
2. **Cloudflare Worker** (bap-panel): `node bap-panel/build.js` → oluşan `bap-panel/worker.js` içeriğini
   Workers › bap-panel › *Edit code* ekranına yapıştır → *Deploy*.

Sayfayı düzenlerken `bap-panel/page.html` ve `bap-panel/worker.template.js` değiştirilir; `worker.js` bunlardan üretilir.
