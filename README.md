# BAP Yönetim Paneli

| Klasör | Ne | Nerede çalışır |
|---|---|---|
| `bap-panel/` | Panel sayfası ve Cloudflare Worker | `bap-panel.mertharman.workers.dev` |
| `apps-script/bap-panel-veri-kapisi/` | Veri kapısı (tabloları okur, panelden gelen girişleri yazar) | Google Apps Script: **BAP Panel Veri Kapısı** |
| `apps-script/adisyo-siparis-toplayici/` | Toplayıcıya eklenen modüller (şube atama) | Google Apps Script: **Adisyo Sipariş Toplayıcı** |

## Toptancı ödemeleri ekranı

Panelde **Toptancı Ödemeleri** bölümü (`#odeme`). Girilen ödeme
**Kolaybi Fatura Ham Veri › Odemeler** sekmesinin sonuna yeni satır olarak yazılır
(Tarih, Tedarikçi, Tutar, Yöntem, Açıklama, Kayıt_Zamanı, Kaynak=Panel) ve
Finans / Alımlar sayfalarındaki tedarikçi borcundan düşülür.

- Toptancı yalnızca **Tedarikciler** sekmesindeki listeden seçilir (isim birebir eşleşmezse borçtan düşülmez).
- Aynı gün + aynı toptancı + aynı tutar varsa önce onay ister; çift tıklama / yeniden gönderme tek kayıt yazar.
- Mevcut satırlara dokunmaz, hiçbir şey silmez. Yanlış kaydı tablodan düzeltin.
- Her giriş ayrıca **BAP Panel Cevapları** tablosuna iz olarak düşer.

## Yayına alma

1. **Apps Script** (BAP Panel Veri Kapısı): `apps-script/bap-panel-veri-kapisi/Kod.gs` içeriğini `Kod.gs` dosyasına yapıştır,
   kaydet → *Dağıt › Dağıtımları yönet* → mevcut dağıtımı düzenle → *Sürüm: Yeni sürüm* → Dağıt.
   (Adres değişmez; Cloudflare'deki `GAS_URL` aynı kalır.)
2. **Cloudflare Worker** (bap-panel): `node bap-panel/build.js` → oluşan `bap-panel/worker.js` içeriğini
   Workers › bap-panel › *Edit code* ekranına yapıştır → *Deploy*.

Sayfayı düzenlerken `bap-panel/page.html` ve `bap-panel/worker.template.js` değiştirilir; `worker.js` bunlardan üretilir.

## Çıkış şubesi atama (`SubeAtama.gs`)

Siparişin hangi şubeden çıktığını (Ürün Çıkan Şube, G) saat + kurye + mahalle ile belirler, her gece şube raporu atar.

1. Erenköy kapalıyken (12:00 öncesi, 22:00 sonrası) tüm paketler **Fikirtepe**.
2. **Kurye_Gecici** (ayar tablosu): o gün başka şubeden paket atan kurye, ör. Fikirtepe kuryesi 19:00–22:00 Erenköy'de.
3. **Kurye_Sube** (ayar tablosu): kuryenin şubesi. Mahalle başka şube diyorsa sipariş "Kurye (pas)" olur.
4. Kurye bilinmiyorsa Mahalle_Sube listesi.

G'yi elle değiştirirsen o satır "Elle" olur ve script bir daha dokunmaz (hücreyi boşaltırsan otomatiğe döner).
Rapor: `Sube_Gunluk` (günlük özet) ve `Sube_Pas_Detay` (paslanan siparişler) sekmeleri + mail/WhatsApp.

Kurulum: dosyayı toplayıcı projesine ekle → `subeAtamaKurulum` → Kurye_Sube'yi doldur → `subeAtamaTest` → `subeAtamaGeriye` → `subeRaporuGeriye`.
