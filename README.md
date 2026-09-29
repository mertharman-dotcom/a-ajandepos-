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

## Kurye & teslimat ekranı

Panelde **Kurye & Teslimat** bölümü (`#kurye`). **Kurye Net Çalışma Süresi** tablosunu yalnızca okur
(Siparişler, Günlük Mesai, Açık Hesaplar). Dönem: Bugün / Dün / Son 7 gün / Bu ay / Son 30 gün.

- Süre aşamaları: kurye atama, restorandan çıkış, yol, teslim; 40 dk üstü teslimler.
- Gecikmenin sebebi: mutfak (sipariş → çıkış 25 dk üstü), kurye (yol, mesafeye göre beklenenden 5 dk fazla), ikisi, diğer.
  Ölçütler `Kod.gs` içindeki `KURYE_HEDEF`'te; beklenen yol `beklenenYol_(km)`.
- Bugün vardiya: açık vardiyanın süresi girişten şu ana kadar sayılır; saatte paket yalnız kapanmış vardiyalardan.
- Kurye karnesi, saat saat yük, son 14 gün, platformlar, en uzun süren teslimatlar (sebebe göre süzülür).
- Kesintiler: erken çevrimiçi (ödenmeyen, ceza değil) ve kapanış ayrı; 2 saati aşan kapanış "çıkış unutulmuş olabilir".
- Açık hesaplar: 'Ödenmez' siparişler hariç, dünden eski / bugün ayrı ve yaşa göre renkli. Trendyol'un kodlu ödemeleri de kapıda tahsil edilebildiği için listede kalır.
- Sekmeler: Özet, Bordro, Teslimat analizi, Kesintiler, Açık hesaplar.
- Bordro ve kurye maliyeti: ücretler kurye tablosunun **Kurye bilgiler** sekmesinden okunur (Kurye Adı, Bordro,
  Saat ücreti, Paket başı ücret, SGK'lı). Adı boş satır o grubun varsayılanıdır (Haddy Kurye); listede olmayan kurye
  onunla hesaplanır. Haddy tarafına %20 KDV eklenir, BAP'ta KDV yok. Saat hakedişi kesintiler düşülmüş net süre üzerinden.
  Sekme okunamazsa `Kod.gs` içindeki `KURYE_UCRET` yedeği kullanılır.
- Müşteri adı, telefonu, adresi ve sipariş içeriği panele gönderilmez.

## Yayına alma

1. **Apps Script** (BAP Panel Veri Kapısı): `apps-script/bap-panel-veri-kapisi/Kod.gs` içeriğini `Kod.gs` dosyasına yapıştır,
   kaydet → *Dağıt › Dağıtımları yönet* → mevcut dağıtımı düzenle → *Sürüm: Yeni sürüm* → Dağıt.
   (Adres değişmez; Cloudflare'deki `GAS_URL` aynı kalır.)
2. **Cloudflare Worker** (bap-panel): `node bap-panel/build.js` → oluşan `bap-panel/worker.js` içeriğini
   Workers › bap-panel › *Edit code* ekranına yapıştır → *Deploy*.

Sayfayı düzenlerken `bap-panel/page.html` ve `bap-panel/worker.template.js` değiştirilir; `worker.js` bunlardan üretilir.
