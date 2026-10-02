# Departman panoları — ortak şablon

Yedi departman panosu tek bir sayfa şablonunu (`sablon.html`) kullanır. Sayfanın tasarımı sabittir;
içerik panonun kendi veritabanında (artifact `db`) durur. Ajanlar artık HTML yazmaz, yalnızca
veritabanındaki satırları günceller (ArtifactData). Böylece her çalışmada tasarım bozulmaz.

Renk ve yazı tipi BAP Yönetim Paneli ile aynıdır (Onest; zemin/kâğıt/kum/mavi).

| Dosya | Ne |
|---|---|
| `sablon.html` | Ortak şablon (başlık: "Departman Masası") |
| `pano.html` | Müşteri İlişkileri pilotu — https://claude.ai/artifact/Ks2atFCTTkyJ8cNUx9uHvh |

Yeni departman panosu: `sablon.html`'i kopyala, ilk satırdaki `<title>` değerini değiştir,
`capabilities: {db: {}, user: {}}` ile yayınla, sonra aşağıdaki koleksiyonları doldur.

## Veri yapısı

| Yol | Kim yazar | Alanlar |
|---|---|---|
| `pano/ayar` | ajan | departman, baslik, faz, altBaslik, guncelleme ("GG.AA.YYYY SS:dd"), guncelleyen, linkler[{ad,url}], kurallar[], ekipNot |
| `isler/<id>` | ajan | baslik, ne (1. cümle: ne ve neden), durum (2. cümle: şu anki durum), ajan, destek, oncelik (kritik/yüksek/orta/düşük), asama, etiket, grup, guncelleme, link, linkAd |
| `sorular/<HUB ID>` | ajan oluşturur, **sahip cevaplar** | tip (soru/karar/fikir), isNo, baslik, aciklama, risk, talepEden, talepZamani, durum (bekliyor/beklet/onaylandi/reddedildi), sahipNotu, kararZamani, kaynak, hubeAktarildi, islendi |
| `notlar/<otomatik>` | **sahip** | isNo, baslik, metin, zaman, islendi |
| `ekip/<id>` | ajan | ad, durum (aktif/sirada/durdu/test), sorumluluk, duzenli, yetki, sira |
| `bulgular/<id>` | ajan (isteğe bağlı) | baslik, metin, ton (kotu/dikkat/iyi), tarih, sira |
| `grafikler/<id>` | ajan (isteğe bağlı) | baslik, tur (cizgi/cubuk), etiketler[], seriler[{ad, degerler[]}], not, sira |
| `gunluk/<id>` | ajan | zaman, yazan, metin — son 10 kayıt tutulur, eskisi silinir |

### `asama` değerleri (işlerin üç bölümü)

| Bölüm | asama | Anlamı |
|---|---|---|
| Senden beklenen | `sende` | Sahibin bir şey yapması gerekiyor (karar kartı yoksa) |
| Açık işler | `acik`, `sirada`, `engel` | Üzerinde çalışılıyor, sırası gelmedi ya da takıldı |
| Hazırladıklarımız | `hazir`, `pencerede`, `denetcide` | Departman hazırladı, canlıya alınmadı (plan, taslak, 15:00–17:00 penceresi) |
| Canlıda ve tamamlanan | `canlida`, `tamam`, `kapandi` | Canlı sistemde çalışıyor, bitti ya da kapandı |

## Ajan talimatına eklenecek bölüm (taslak)

```
## Departman panosu (yeni şablon)
Panon: <PANO_URL>. Panoya HTML YAZMA; yalnızca ArtifactData ile veritabanını güncelle.
1. Her çalışmanın başında `sorular` koleksiyonunda kaynak "pano" olup hubeAktarildi false olan
   satırları oku. Bunlar sahibin panodan verdiği cevaplardır: KOKPIT_ONAYLAR'da aynı ID'li satırın
   DURUM hâlâ "bekliyor"/"beklet" ise DURUM, SAHIP_NOTU, KARAR_ZAMANI hücrelerine sahibin değerlerini
   aynen yaz (sahibin panodaki cevabını taşımak bu hücrelere yazmanın TEK izinli hâlidir), sonra
   panodaki satıra hubeAktarildi true yaz. Satır HUB'da zaten cevaplanmışsa yalnız hubeAktarildi true yap.
2. `notlar` koleksiyonunda islendi false olan sahip notlarını oku, işle, islendi true yap.
3. KOKPIT_ONAYLAR'da departmanının DURUM "bekliyor"/"beklet" satırlarını `sorular/<ID>`'ye aynala
   (kaynak "hub"); HUB'da cevaplanmış ya da işlenmiş olanların durum ve islendi alanlarını güncelle.
4. Yaptığın işleri `isler`'de güncelle: her iş iki cümle (ne + durum), doğru `asama`.
   Canlıya alınmadıysa "hazir", canlıdaysa "canlida", sahipten bir şey bekleniyorsa "sende".
5. `pano/ayar` guncelleme alanını ve `gunluk`'e tek kayıt yaz (en fazla 3 cümle).
```

Bu bölüm departman ajanlarının zamanlanmış görevlerine (trigger) sahip onayıyla eklenir.
