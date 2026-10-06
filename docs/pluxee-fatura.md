> **06.10.2026 güncelleme:** Pluxee faturası yalnız **mobil uygulamadan** kesilebiliyor (sahibin bilgisi). Aşağıdaki "MacBook programı keser" adımı yapılamaz; panel yalnız takvimi ve KolayBi tarafını izler, faturayı sahibi keser.

# Pluxee haftalık fatura — çalışma düzeni

Sahibin kuralı (04.10.2026):

- **Her Cuma 23:55** fatura kesilir.
- Pluxee **ayın ilk 6 günü** fatura kestirmez → ayın 1–6'sına denk gelen Cuma **atlanır**.
- **Ayın son günü 23:55** ayrıca kesilir (son gün Cuma ise tek fatura).
- Ödeme planı: **3 günde al** (%4,10 hizmet bedeli; ödeme 3 iş günü sonra).
- İlk haftalar **sahip onaylamadan kesilmez**.
- Mali fatura (e-fatura / e-arşiv) **KolayBi**'den kesilir; Pluxee 24 saat içinde ister.

## Kim ne yapar

| Adım | Kim | Nerede |
|---|---|---|
| Takvim (hangi gün fatura günü) | Veri kapısı `pluxeeFaturaGunuMu_` | `apps-script/bap-panel-veri-kapisi/Kod.gs` |
| Onay | Sahip, panel › Finans › "Pluxee haftalık fatura" › Onayla / Bu sefer kesme | kurye dosyası › `Pluxee Fatura` sekmesi |
| Hatırlatma | Veri kapısı `pluxeeFaturaTara_` (saatlik tarama) — fatura günü 21:00'den sonra onay yoksa bir kez WhatsApp | Make "BAP Bildirim - Script WA" |
| Faturayı kesmek | **MacBook'taki Pluxee programı** (`~/bap-kopru`) — henüz yazılmadı | Pluxee işyeri web portalı |
| Mali fatura | KolayBi — 2. aşama (önce taslak, sahip gönderir) | — |

`PLUXEE_FATURA.ONAY_GEREKIR = false` yapılırsa onay beklenmez; saatlik tarama fatura günü satırı kendisi `Onaylandı` (Onaylayan: Otomatik) yazar.

## `Pluxee Fatura` sekmesi (kurye dosyası)

Başlık adıyla okunur; sıra önemli değil. Her fatura günü tek satır.

| Sütun | Yazan | Değer |
|---|---|---|
| Fatura Günü | Panel / tarama | `GG.AA.YYYY` (metin) |
| Durum | Panel → MacBook | `Onaylandı` · `Kesilmeyecek` · `Kesildi` · `Kesilemedi` |
| Plan | Panel | `3 günde al` |
| Onay Zamanı, Onaylayan | Panel | — |
| Genel Toplam (TL), KDV Hariç (TL), KDV (TL), Ödeme Tarihi | MacBook | Pluxee onay ekranındaki değerler |
| Kesim Zamanı | MacBook | `GG.AA.YYYY SS:dd:ss` |
| KolayBi Faturası | 2. aşama | fatura no / "taslak" |
| Not | MacBook | hata ya da açıklama |

## MacBook programına eklenecek (sahip MacBook başındayken)

launchd ile **her gün 23:50** çalışır (fatura günü değilse hemen çıkar):

1. Bugün fatura günü mü? (kural yukarıda; veri kapısındaki `pluxeeFaturaGunuMu_` ile aynı olmalı)
2. `Pluxee Fatura` sekmesinde bugünün satırı `Onaylandı` mı? Değilse **kesmez**, çıkar.
3. 23:55'i bekler, portala girer (doğrulama kodu bugünkü gibi iPhone Kestirmeler → `Pluxee Kod` sekmesi).
4. Fatura → Fatura kes → **Yemek** satırını seçer (Business Yemek 0 TL ise atlar) → **3 GÜNDE AL** → Devam Et.
5. Onay penceresindeki KDV hariç, KDV, genel toplam ve ödeme tarihini okur, **Onayla**'ya basar.
6. Sonucu satıra yazar: `Kesildi` + tutarlar + kesim zamanı. Hata olursa `Kesilemedi` + Not.
7. WhatsApp özeti (başlıkta "Pluxee" geçmesin — Make filtresi atlar): "Yemek kartı faturası kesildi: 29.237 TL, ödeme 07.10, KolayBi'den 24 saat içinde mali faturayı ilet."
8. Gece yarısını geçerse **kesmez** (fatura tarihi kayar; ayın son günü kaçarsa ayın 7'sine kadar kesilemez) ve "Kesilemedi: saat geçti" yazar.

Kurallar: tekrar denemede önce satırın `Kesildi` olmadığına bakılır (çift fatura olmasın); POST tekrar denenmez.
Program eskiden gönderdiği "Pluxee bağlantısı" e-postalarını artık göndermez (kod Kestirmeler ile geliyor).

## 2. aşama — KolayBi mali faturası

Pluxee'de kesildikten sonra KolayBi'de Pluxee adına satış faturası **taslağı** hazırlanır (KDV hariç tutar, KDV %10,
açıklama "Pluxee yemek kartı tahsilatı GG.AA–GG.AA"). İlk haftalar sahip KolayBi'de kontrol edip gönderir.
KolayBi API ile satış faturası oluşturma henüz denenmedi.
