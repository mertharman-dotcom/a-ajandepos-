# Cloudflare — ne nerede (03.10.2026)

Bu klasör **canlının kopyasıdır** (GitHub › Actions › *Cloudflare'i Depoya Çek*). Düzenleme
`bap-panel/` ve `bap-sistem/` klasörlerinde yapılır; buradaki dosyalar elle değiştirilmez.

| Adres | Ne | Bağlandığı arka uç | Durum |
|---|---|---|---|
| **bap-sistem.pages.dev** | Mutfak paneli (çalışanların kullandığı) | BAP PANEL Backend (`AKfycbzc…`) | ✅ Tek mutfak paneli adresi — 02.10 WhatsApp düzeltmesi yayında |
| **bap-panel.workers.dev** | Yönetim paneli (Worker kodu: `bap-panel/`) | BAP Panel Veri Kapısı | ✅ Ana adres |
| bap-alim-paneli.workers.dev | "BAP · Alım Paneli" | `AKfycbx8…` | ❓ kullanılıyor mu |
| bap-genel-bilgiler.workers.dev | "Genel Bilgiler & Operasyon Portalı" | `AKfycbwI…` | ❓ kullanılıyor mu |
| bap-genel-yonetm.workers.dev | "Merkezi Yönetim Portalı" (3 uygulamaya bağlantı) | `AKfycbwP…`, `AKfycbwf…`, `AKfycbzw…` | ❓ kullanılıyor mu |
| kurye-takip.workers.dev | Kurye takip sayfası | — | ❓ kullanılıyor mu |

02.10: mutfak panelinin kopyaları (bappizza, damp-limit-5aba, black-credit-7dca) ve boş Worker'lar
(billowing-credit-87e3, empty-firefly-7396) *Cloudflare'den Sil* ile kaldırıldı; içerikleri git geçmişinde duruyor.
