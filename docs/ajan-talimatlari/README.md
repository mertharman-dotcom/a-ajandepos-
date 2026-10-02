# Ajan talimatları — Kokpit → BAP AI HUB geçişi (02.10.2026)

Departman ajanları sahibe soru/karar/görev emirlerini eskiden Yönetim Kokpiti artifact veritabanına
(`onaylar`, `departmanlar`, `gm/gundem`) yazıyordu; BAP Yönetim Paneli o veriye ulaşamıyordu.
Artık BAP AI HUB e-tablosundaki sekmeler kullanılıyor:

- `KOKPIT_ONAYLAR` (ID, DEPARTMAN, TIP, IS_NO, BASLIK, ACIKLAMA, RISK, TALEP_EDEN, TALEP_ZAMANI, DURUM,
  SAHIP_NOTU, KARAR_ZAMANI, ISLENDI, ISLEM_NOTU, GM_INCELEME, GM_NOT, GUNCELLEME)
- `KOKPIT_DEPARTMANLAR` (KOD, AD, AKTIF, PANO, KLASOR, FAZ, SIRA)
- `KOKPIT_GUNDEM` (TARIH, OZET, MADDELER_JSON)

Sahip panelde Kararlarım'dan cevaplar (veri kapısı `tur: 'kokpit'` → DURUM/SAHIP_NOTU/KARAR_ZAMANI).
Ajanlar ISLENDI/ISLEM_NOTU yazar, sahibin hücrelerine dokunmaz. Açık kayıtlar her departmanın ilk
çalışmasında (Genel Müdür 08:30'da hepsini) eski Kokpit'ten tek seferde aktarılır.

`eski/` güncelleme öncesi, `yeni/` güncel talimatlar (dosya adı = trigger id). Geri dönmek için ilgili
dosyanın içeriği update_trigger ile yeniden yazılır.
