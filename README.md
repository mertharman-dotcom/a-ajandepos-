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

## Bordro

Panelde **Personel › Bordro** sekmesi: bu ay ve geçen ay; üstte toplamlar, şube kırılımı, kişi bazlı tablo
(baz maaş, normal mesai, fazla mesai, resmi tatil, yıllık izin, rapor, ücretsiz izin, devamsızlık, bugüne kadar,
ay sonu tahmini, asgari/diğer, ödenen, fark) ve giriş-çıkış kaydı olan aylar için trend.

Kural (İK envanteri, 17.09.2026): günlük = maaş / ayın gün sayısı, saatlik = günlük / 10; ücretsiz izin ve
devamsızlık kesilir, rapor 3 günü aşarsa aşan gün kesilir, yıllık izin ödenir; kıst giriş/çıkış;
fazla mesai = puantajdaki Fazla Mesai sütununun **yalnız artı** süreleri (eksik süre kesilmez); resmi tatilde
çalışılan gün +1 günlük; SGK'lıya asgari ücret bankadan (`ASGARI_NET`), kalanı "diğer".
Yönetici panelindeki (BAP OS) bordro eksik süreyi de kestiği için fazla mesai orada eksi görünebilir.
IBAN, telefon ve şifre panele gönderilmez.

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
  Kapatılan her hesap Adisyo › Satıs Verileri'nde de işlenir: sipariş (no + saat ile) bulunur ve **Ödeme Alındı** TRUE yapılır;
  sonuç Tahsilatlar › **Adisyo Durumu** sütununa yazılır. Bulunamayan 3 gün yeniden denenir, sonra "elle kontrol" diye işaretlenir.
  Eski kapatmalar için panelde "Şimdi Adisyo'ya işle" düğmesi var; saatlik `kuryeBoslariDoldur` tetikleyicisi de bunu çalıştırır.
- Seferler & rota: bugünün siparişleri kurye bazında seferlere ayrılır (restorandan 5 dk içinde çıkanlar tek sefer; atanmış
  ama yola çıkmamışlar ayrı grup). "Canlı süre ve km" Google Haritalar'dan (Apps Script Maps servisi, şu anki trafik)
  şube → 1. → 2. → 3. teslimat bacaklarını hesaplar: gidilecek km, sürüş, paket kapatma süresi (sürüş + kapı başına 2 dk),
  tamamlanmış seferde gerçekleşenle fark. Çıkış noktaları `SUBE_KONUM` (Erenköy: Alpler Sk. No:7; Fikirtepe: Mandıra Cd.
  Evinpark Sitesi). Şube: Adisyo'da tarih + günlük sipariş no → Ürün Çıkan Şube / Şube; yoksa Genel Bilgiler › Mahalle_Sube;
  o da yoksa Erenköy (panelde "?" ile işaretli). Hesap düğmeyle yapılır ve 10 dk saklanır (günlük Haritalar kotası için).
- Mahalle bazlı teslimat süreleri (Seferler & rota altında): bugün / 7 gün / bu ay / 30 gün; paket, ortalama ve medyan
  teslim (sipariş → kapı), restoranda / yolda kırılımı, ortalama km, 40 dk üstü oranı. Genel Bilgiler › Mahalle_Sube'deki
  teslimat süresinin üst sınırı "söz verilen süre" sayılır; onu aşan paket oranı gösterilir. Mahalle Siparişler › Adres'ten okunur.
- Kurye eşleştirme: Adisyo › Satıs Verileri'ndeki son 30 günün paket siparişleri kurye tablosundaki Siparişler ile
  (günlük sipariş no + sipariş saati en fazla 20 dk farklı) eşleştirilir; kimin götürdüğünün kaynağı kurye sistemidir.
  Adisyo'da Kurye boşsa **Hepsini doldur** ile yazılır; farklıysa sahip "Adisyo'yu düzelt" ya da "Böyle kalsın" der;
  kurye sisteminde karşılığı yoksa kurye elle atanır ya da "Kurye yok" denir. Her yazma (önceki değerle) kurye tablosundaki
  **Kurye Eşleştirme** sekmesine düşer. Boşları otomatik doldurmak için Apps Script'te `kuryeBoslariDoldur` fonksiyonuna
  saatlik zaman tetikleyicisi eklenebilir.
- Kesinti girişi (Kesintiler sekmesi): kurye, tarih, tür (para ₺ / süre dk), miktar ve açıklama. Kurye tablosunun
  **Kesintiler** sekmesine kurye panelindeki biçimde yazılır (açıklamanın sonunda "(panel)"). Aynı gün + kurye + miktar
  varsa önce onay ister; aynı gönderim iki kez yazılmaz. Yanlış kayıt tablodan silinir.
- Bordro: Kesintiler sekmesindeki TL kesintiler "Para kesintisi" olarak düşülür (Saat tipi ödenen süreden); Haddy'de KDV
  kesinti sonrası tutar üzerinden — kurye panelindeki Haftalık Bordro & Hakediş ile aynı hesap.
- Müşteri adı, telefonu, adresi ve sipariş içeriği panele gönderilmez.

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
