function pluxeeKodSayfasi_() {
  var html = '<style>body{font-family:sans-serif;max-width:360px;margin:40px auto;padding:0 16px;text-align:center}'
   + 'input{font-size:32px;letter-spacing:8px;text-align:center;width:100%;padding:12px;box-sizing:border-box}'
   + 'button{font-size:20px;margin-top:16px;width:100%;padding:14px;background:#c0392b;color:#fff;border:0;border-radius:8px}'
   + '#s{margin-top:16px;font-size:18px}</style>'
   + '<h2>Pluxee SMS Kodu</h2>'
   + '<input id="k" inputmode="numeric" maxlength="6" autocomplete="one-time-code" autofocus>'
   + '<button onclick="g()">Gönder</button><div id="s"></div>'
   + '<script>function g(){var k=document.getElementById("k").value.trim();var s=document.getElementById("s");'
   + 'if(!/^\\d{6}$/.test(k)){s.textContent="6 haneli kodu yaz";return;}s.textContent="Gönderiliyor...";'
   + 'google.script.run.withSuccessHandler(function(r){s.textContent=r;})'
   + '.withFailureHandler(function(e){s.textContent="Hata: "+e.message;}).pluxeeKodYaz(k);}</script>';
  return HtmlService.createHtmlOutput(html).setTitle('Pluxee Kod')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function pluxeeKodYaz(kod) {
  kod = String(kod || '').trim();
  if (!/^\d{6}$/.test(kod)) return 'Kod 6 haneli olmalı';
  var sh = SpreadsheetApp.openById('1LG7naAbMM9aL3K0QNzzrjXomC2LXjx4rdSCYNYWzDQo').getSheetByName('Pluxee Kod');
  if (!sh) return 'Pluxee Kod sekmesi bulunamadı';
  sh.getRange('B2').setNumberFormat('@').setValue(kod);
  return '✅ Kod alındı, rapor birkaç saniye içinde çekilecek.';
}