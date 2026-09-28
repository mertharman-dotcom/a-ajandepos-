// page.html'i worker.template.js içine gömer ve Cloudflare'e yapıştırılacak worker.js'i üretir.
// Kullanım: node bap-panel/build.js
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const page = fs.readFileSync(path.join(dir, 'page.html'), 'utf8');
const tpl = fs.readFileSync(path.join(dir, 'worker.template.js'), 'utf8');
fs.writeFileSync(path.join(dir, 'worker.js'), tpl.replace('__PAGE__', () => JSON.stringify(page)));
console.log('worker.js yazıldı (' + page.length + ' karakter sayfa).');
