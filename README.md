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

## Puantaj düzeltme ekranı

Panelde **Personel › Puantaj düzeltme** sekmesi. Kişi ve ay seçilir, günün yanındaki **Düzelt** ile
yeni giriş / çıkış saati ve gerekçe yazılır (ör. 11:57 okutulmuş giriş → 12:00).

- Düzeltme **BAP Personel › Personel_Giris_Cikis** sekmesinde o günün satırına yazılır: Mesai Giriş / Mesai Çıkış,
  Toplam mesai, Fazla Mesai, açıklamalar ve Gün Genel Notu. Bordro puantajdan hesaplandığı için bordroya yansır.
- Fazla mesai, sistemin o gün kullandığı vardiya süresi (eski toplam − eski fazla) korunarak yeniden hesaplanır;
  off gününde çalışılan sürenin tamamıdır.
- **Ham Giriş / Ham Çıkış** (QR'ın gerçek saati) değişmez. Eski değerler, gerekçe ve tarih **Manuel** sütununa,
  **Islem_Loglari**'na ve **BAP Panel Cevapları**'na yazılır; geri almak için eski değer oradan okunur.
- İzin / rapor / devamsızlık işli günler buradan düzeltilmez (yönetici paneli).
- Giriş/çıkış (C/D) tablodan elle değiştirilip Toplam mesai / Fazla Mesai eski kalmışsa panel bu satırları
  **toplam eski** diye işaretler; **Yeniden hesapla** ile toplam ve fazla mesai tablodaki saate göre yazılır.
- Tam saate 15 dakikadan az kala yazılmış girişlerde (11:57 gibi) form tam saati önerir.

## Yayına alma

1. **Apps Script** (BAP Panel Veri Kapısı): `apps-script/bap-panel-veri-kapisi/Kod.gs` içeriğini `Kod.gs` dosyasına yapıştır,
   kaydet → *Dağıt › Dağıtımları yönet* → mevcut dağıtımı düzenle → *Sürüm: Yeni sürüm* → Dağıt.
   (Adres değişmez; Cloudflare'deki `GAS_URL` aynı kalır.)
2. **Cloudflare Worker** (bap-panel): `node bap-panel/build.js` → oluşan `bap-panel/worker.js` içeriğini
   Workers › bap-panel › *Edit code* ekranına yapıştır → *Deploy*.

Sayfayı düzenlerken `bap-panel/page.html` ve `bap-panel/worker.template.js` değiştirilir; `worker.js` bunlardan üretilir.
