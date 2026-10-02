/*** BAP – SİPARİŞ ANINDA TRENDYOL DÜŞÜK PUAN UYARISI ***
 *
 * Adisyo Sipariş Toplayıcı projesine YENİ DOSYA olarak ekle.
 * Ayrıca aşağıdaki TEK SATIRLIK düzenlemeyi mevcut koda uygula (aşağıda anlatılıyor).
 *
 * Ne yapar: telefonu maskeli (Trendyol/Getir) bir sipariş düştüğünde,
 * adresinden anahtar üretip "Telefonsuz (Getir-Trendyol)" sekmesine bakar.
 * O adres daha önce 4 altı puan verdiyse siparişin Not sütununa uyarı yazar
 * ve sana bildirim gönderir.
 *
 * ---------------------------------------------------------------
 * ZORUNLU DÜZENLEME (Toplayıcı dosyasında, etiketKontrol_ fonksiyonu)
 * ---------------------------------------------------------------
 * BUL:
 *
 * function etiketKontrol_(sh, rowNo, d, etiketMap) {
 *   const tel = son10_(d.customer && d.customer.customerPhone);
 *   if (!tel || !etiketMap[tel]) return;
 *
 * DEĞİŞTİR:
 *
 * function etiketKontrol_(sh, rowNo, d, etiketMap) {
 *   const ham = String((d.customer && d.customer.customerPhone) || '');
 *   if (!ham || ham.indexOf('/') >= 0) { tyKontrol_(sh, rowNo, d); return; }
 *   const tel = son10_(ham);
 *   if (!tel || !etiketMap[tel]) return;
 *
 * Fonksiyonun geri kalanına dokunma. Böylece telefonlu müşteriler eskisi gibi
 * etiket kontrolünden, telefonsuzlar da yeni Trendyol kontrolünden geçiyor.
 */

var _tyHarita = null;        // tur boyunca bellekte tutulur, her siparişte yeniden okunmaz

/* Telefonsuz sekmesinden "adres anahtarı → uyarı" haritası */
function tyHarita_() {
  if (_tyHarita) return _tyHarita;
  _tyHarita = {};
  try {
    const ts = SpreadsheetApp.openById(CONFIG.MUSTERI_SS_ID)
      .getSheetByName('Telefonsuz (Getir-Trendyol)');
    const son = ts.getLastRow();
    if (son > 1) {
      // G Anahtar, H TY 4 Altında, I TY Son Puan Tarihi, J Not
      ts.getRange(2, 7, son - 1, 4).getValues().forEach(r => {
        if (r[1] !== true) return;                     // sadece işaretli olanlar
        const a = String(r[0] || '');
        if (!a) return;
        _tyHarita[a] = {
          not: String(r[3] || 'daha önce 4 altı puan verdi'),
          tarih: r[2] instanceof Date
            ? Utilities.formatDate(r[2], 'Europe/Istanbul', 'dd.MM.yyyy') : ''
        };
      });
    }
  } catch (e) { Logger.log('Trendyol uyarı haritası okunamadı: ' + e); }
  return _tyHarita;
}

/* Telefonsuz sipariş için düşük puan kontrolü */
function tyKontrol_(sh, rowNo, d) {
  const cust = d.customer || {};
  const adres = String(cust.address || '');
  if (!adres) return;
  const a = tzAnahtar_(adres);                 // tazeleme dosyasındaki anahtar fonksiyonu
  if (!a) return;
  const h = tyHarita_()[a];
  if (!h) return;

  const metin = '⚠️ Trendyol: ' + h.not;
  notEkle_(sh, rowNo, metin);

  bildir_('⚠️ Düşük puan veren adresten sipariş – ' + (cust.customerName || ''),
    '⚠️ BU ADRES DAHA ÖNCE DÜŞÜK PUAN VERDİ\n\n' +
    h.not + (h.tarih ? '\nSon puanlama: ' + h.tarih : '') + '\n\n' +
    'Müşteri: ' + (cust.customerName || '') + '\n' +
    'Sipariş: #' + (d.orderNumber || d.id) + ' – ' + (d.salesChannelName || '') +
    ' – ' + d.orderTotal + ' TL\n' +
    'Ürünler: ' + urunListesi_(d) + '\n' +
    'Adres: ' + adres + '\n\n' +
    'Not: puanın lezzet mi servis mi teslimat mı olduğuna Trendyol Değerlendirme ' +
    'tablosundan bakabilirsin.');
}

/* Elle test: bir adres metni ver, uyarı çıkıyor mu gör */
function tyUyariTest() {
  const h = tyHarita_();
  const anahtarlar = Object.keys(h);
  Logger.log('İşaretli adres sayısı: ' + anahtarlar.length);
  anahtarlar.slice(0, 5).forEach(a => Logger.log(a + '  →  ' + h[a].not));
}