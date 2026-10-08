---
name: yemek-karti
description: Yemek kartı (Pluxee, Edenred, Paye, SetCard, Tokenflex, Multinet, Metropol) çekimleri, fatura kesimi/tahsilatı, SMS kodu, Mac programları, kart ajanı (kurye açık hesabı ↔ kart çekimi eşleşmesi), iki taraflı kontrol ya da mutabakat ile ilgili her hata, soru veya değişiklikte kullan.
---

# Yemek kartı sistemi

Plan ve sahibin kuralları: `docs/yemek-karti-projesi.md`. Açık işler: `docs/kontrol-listesi.md` › **YK** ve **P** (P7, P16, P24–P31, P50–P54).
Bu dosya bir yol haritasıdır; ayrıntı koddadır — satır numarası yerine fonksiyon adıyla ara.

## Nerede ne var

| Parça | Yer |
|---|---|
| Kod (çekim, yazma, fatura) | `apps-script/bap-yemek-karti/` — "BAP Yemek Kartı" projesi, **YEMEKKARTI** tablosuna bağlı (kimlik: `Ortak.gs` `YK_SS_ID`, `docs/veri-sozlugu.md`) |
| Web girişi | `Web.gs`: `doPost` (Mac programları + veri kapısı; `anahtar` + `tur`), `doGet` (iPhone kestirmesi `?sayfa=kod`, telefondan elle çekim `?sayfa=cek&kaynak=…`, SMS formu `?sayfa=kodgir`) |
| SMS kodu kutusu | `Kod Kutusu.gs` `kodKutusu_`: program `kodIste` → kestirme `kodYaz` → program `kodOku` (yalnız son `kodIste`'den sonra yazılan kod) |
| Zamanlayıcılar | `Kurulum.gs` `kurulum()` (tekrar çalıştırmak güvenli): Paye 02:30/09:30, SetCard + Tokenflex saatlik |
| Son çalışma | `Ortak.gs` `sonCalisma_` → `SON_CALISMA_<kaynak>`; `tur:'cekDurum'` ile okunur |
| Mac programları | `mac-kopru/*.mjs` (+ `README.md`, `com.bap.*.plist`); Mac'te `~/bap-kopru`'dan çalışır, `ayar.json` depoda **yok**. `com.bap.uyanik` Mac'i uyanık tutar |
| Kart ajanı, kontrol, mutabakat, fatura ekranı | `apps-script/bap-panel-veri-kapisi/Kod.gs` + panel › **Yemek Kartları** sekmesi (fatura → kontrol → mutabakat → ajan) |

## Sağlayıcılar

| Kart | Çekim | Sekme (tekil anahtar) | Kapıda / online ayrımı | Fatura |
|---|---|---|---|---|
| Pluxee | Mac `pluxee.mjs` (**depoda yok**) + SMS | `Pluxee` (RRN) | terminal 592123 online, 576988 kapıda | Cuma (ayın 7'sinden) + ay sonu · **yalnız mobil** |
| Edenred | Mac `edenred.mjs` + SMS, 00:40/12:10 | `Edenred` (zaman\|tutar\|terminal\|kart) | 362765 Trendyol, 375586 Yemeksepeti online; 327054 kapıda; "SmarTicket" = Edenred | Cuma (8'inden) + ay sonu · **yalnız mobil** |
| Paye | Gmail eki (`payeMailCek`, xlsx) | `Paye` (gün sonu), `Paye İşlemler` (işlem) | hepsi kapıda | Takip edilmiyor (SOFRA KURUMSAL) |
| SetCard | Apps Script saatlik JSON API (`setcardCek`) | `SetCard` (STI ID), `SetCard Fatura` | Terminal 'Trendyol Pos' online, 'Mobil Pos' kapıda | Cuma (11'inden, ayda ≤4) + ay sonu · panelden kesilir |
| Tokenflex | Apps Script saatlik (`tokenflexCek`) + SMS | `Tokenflex` (Ref), `Tokenflex Fatura` | — | 15'i + ay sonu · **yalnız mobil** |
| Multinet | Mac `multinet.mjs` + SMS, 00:45/12:15 | `Multinet` (Ref), `Multinet Fatura`, `Multinet Bekleyen` | Açıklama 'MultiPOS Satis' kapıda, diğerleri online | **Salı 23:30**, 3 gün vade, Mac `--fatura-zamanli` (`otoFatura:true` ise keser) |
| Metropol | Mac `metropol.mjs` + reCAPTCHA, 00:55/12:25/18:25 | `Metropol` (İşlem No), `Metropol Ödeme` | — | 15'i + ay sonu (1–6 arası site reddeder) · Mac `--fatura-kes` |

Ortak sekmeler: `Fatura Kesimleri`, `Mac Oturumları`, `Fatura Tahsil Onayı`. Hepsi **ekle-yalnız** + tekil anahtar; metin `'` ile, satır sonunda `Kayıt Zamanı`.

## Kurallar (sahibin kararları)
- **KolayBi'ye tahsilat girilmez (P51).** Fatura "ödendi" = kart sisteminin ödeme kaydı ya da paneldeki "Tahsil edildi" (yönetici onayı). `kartOdenenFaturalar_`.
- Online sipariş yalnız online çekimle, kapıda sipariş yalnız kapıda çekimle eşleşir.
- Parçalı ödeme olabilir: çekim siparişten **az** ise hata değil "parçalı"; kalanın kaynağı sorulur.
- Kod önce depoda değişir; Mac programı değişince sahibi yeni `.mjs`'i Mac'te `~/bap-kopru`'ya kopyalar (adımı ona yaz).

## Kart ajanı (açık hesap ↔ çekim)
- `acikKanit_` → her kurye açık hesabı için Adisyo 'Ödeme Alındı' kanıtı + `kartEslestir_`.
- `kartEslestir_`: aynı tutar (±0,5 TL), ±3 saat. **'emin'** = tek aday çekim, o çekime uyan başka sipariş yok, teslim saati biliniyor ve çekim ≤90 dk uzakta. Paye (saatsiz) için: aynı gün + **cihaz kuryenin** (`kartCihazKisi_`) + tek aday. Diğerleri **'soru'** (`kartNeden`).
- `kartAjanCalis_` saatlik (`puantajTaramasi` içinden). **`KART_AJAN_KURU = true`** → hiçbir şey yazmaz; rapor `KART_AJAN` özelliğine, panelde `kartAjanBlok`. Kapalıyken 'emin' olanlar KURYE › `Tahsilatlar`'a 'Tahsil edildi' + Kaynak '<Kart> Ajanı' yazar.
- İki taraflı kontrol `ykKontrol_` (7 iş günü, yalnız okur): eşleşen, parçalı (eksik/fazla), çekimsiz sipariş, siparişsiz çekim, bekleyen.
- Mutabakat `yemekKarti_` (iş günü 10:00–03:00; şu an yalnız Pluxee, Edenred, Paye toplanır).

## Sorun giderme sırası
1. Çekim gelmiyor → `cekDurum` / `SON_CALISMA_<kaynak>`, panel › Yönetim Merkezi Mac oturum uyarısı (`macOturum_`).
2. Mac programı ise: Mac uyanık mı, oturum (çerez/profil) düşmüş mü, SMS kodu kutuya gelmiş mi.
3. Apps Script çekimi ise: zamanlayıcı kurulu mu (`kurulum()`), Komut dosyası özellikleri dolu mu.
4. Yanlış eşleşme → `kartNeden`, terminalin online/kapıda sınıfı, saat kaydırma (04:00 öncesi = önceki iş günü).

## Bilinen tuzaklar
- **Zamanlayıcı ilk argümanı olay nesnesidir** (P28): `function x(gunSayisi)` saatlik çalışınca sayı değil nesne alır — tipini kontrol et.
- **Metropol** sorgu başına en çok 10 işlem gösterir → 10 gelirse aralık ikiye bölünür (P31); aralık ≤1 ay; oturum ~25 dk boşta düşer (`--canli-tut`, `metropol-cerez.json`).
- **Tokenflex** 08.10'dan beri SMS ister: anahtar 10 saat saklanır, 01:00–09:00 SMS istenmez, kod gelmezse 2 saat beklenir (`TOKENFLEX_2FA`; elle `cek` bunu kaldırır). OTP gönderimi `isSuccess:false` dönse de SMS gider.
- **Edenred** görünmez reCAPTCHA: "ReCaptcha Doğrulama Başarısız" → program insan gibi bekleyip yazar; profil çerezi bazen SMS'i atlatır.
- **Multinet** güvenlik duvarı programın kendi isteğini reddeder → sitenin kendi isteği yalnız tarih değiştirilerek tekrar kullanılır.
- **Paye** satırında saat yok (öğlene kaydırılır, P29); `Cihaz Sicil Numarası` telefon numarasıdır → kişi Tokenflex/Metropol kullanıcı listesinden bulunur (P30).
- Portallar online çekimleri de listeler; kapıda sanılırsa sahte "siparişsiz çekim" çıkar (P31).
- Kurye projesinde (`kurye-net-calisma-suresi/`) eski kopyalar duruyor (taşıma 5. adım bekliyor) — yeni kod yalnız `bap-yemek-karti`'ye.
- Kodda sabit anahtarlar var (`KOPRU_ANAHTAR`, `KESTIRME_ANAHTAR`, `YK_ANAHTAR`) — değerlerini hiçbir çıktıya, PR'a, mesaja yazma (YK6).
