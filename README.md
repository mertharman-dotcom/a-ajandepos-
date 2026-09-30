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
- Açık hesap kapatma: her satırda **Tahsil edildi** / **Kuryeden kes**. İkisi de kurye tablosuna **Tahsilatlar** sekmesi
  (yoksa açılır) olarak yazılır ve o sipariş listeden düşer; yanlış kapatılan satır o sekmeden silinirse yeniden açık görünür.
  **Kuryeden kes** ayrıca **Kesintiler** sekmesine TL kesinti yazar. Sipariş bilgisi tarayıcıdan değil Açık Hesaplar'dan okunur;
  aynı sipariş iki kez kapatılamaz.
- Seferler & rota: bugünün siparişleri kurye bazında seferlere ayrılır (restorandan 5 dk içinde çıkanlar tek sefer; atanmış
  ama yola çıkmamışlar ayrı grup). "Canlı süre ve km" Google Haritalar'dan (Apps Script Maps servisi, şu anki trafik)
  şube → 1. → 2. → 3. teslimat bacaklarını hesaplar: gidilecek km, sürüş, paket kapatma süresi (sürüş + kapı başına 2 dk),
  tamamlanmış seferde gerçekleşenle fark. Çıkış noktaları `SUBE_KONUM` (Erenköy: Alpler Sk. No:7; Fikirtepe: Mandıra Cd.
  Evinpark Sitesi). Şube: Adisyo'da tarih + günlük sipariş no → Ürün Çıkan Şube / Şube; yoksa Genel Bilgiler › Mahalle_Sube;
  o da yoksa Erenköy (panelde "?" ile işaretli). Hesap düğmeyle yapılır ve 10 dk saklanır (günlük Haritalar kotası için).
- Mahalle bazlı teslimat süreleri (Seferler & rota altında): bugün / 7 gün / bu ay / 30 gün; paket, ortalama ve medyan
  teslim (sipariş → kapı), restoranda / yolda kırılımı, ortalama km, 40 dk üstü oranı. Genel Bilgiler › Mahalle_Sube'deki
  teslimat süresinin üst sınırı "söz verilen süre" sayılır; onu aşan paket oranı gösterilir. Mahalle Siparişler › Adres'ten okunur.
- Kesinti girişi (Kesintiler sekmesi): kurye, tarih, tür (para ₺ / süre dk), miktar ve açıklama. Kurye tablosunun
  **Kesintiler** sekmesine kurye panelindeki biçimde yazılır (açıklamanın sonunda "(panel)"). Aynı gün + kurye + miktar
  varsa önce onay ister; aynı gönderim iki kez yazılmaz. Yanlış kayıt tablodan silinir.
- Bordro: Kesintiler sekmesindeki TL kesintiler "Para kesintisi" olarak düşülür (Saat tipi ödenen süreden); Haddy'de KDV
  kesinti sonrası tutar üzerinden — kurye panelindeki Haftalık Bordro & Hakediş ile aynı hesap.
- Müşteri adı, telefonu, adresi ve sipariş içeriği panele gönderilmez.

## Yayına alma

1. **Apps Script** (BAP Panel Veri Kapısı): `apps-script/bap-panel-veri-kapisi/Kod.gs` içeriğini `Kod.gs` dosyasına yapıştır,
   kaydet → *Dağıt › Dağıtımları yönet* → mevcut dağıtımı düzenle → *Sürüm: Yeni sürüm* → Dağıt.
   (Adres değişmez; Cloudflare'deki `GAS_URL` aynı kalır.)
2. **Cloudflare Worker** (bap-panel): `node bap-panel/build.js` → oluşan `bap-panel/worker.js` içeriğini
   Workers › bap-panel › *Edit code* ekranına yapıştır → *Deploy*.

Sayfayı düzenlerken `bap-panel/page.html` ve `bap-panel/worker.template.js` değiştirilir; `worker.js` bunlardan üretilir.
