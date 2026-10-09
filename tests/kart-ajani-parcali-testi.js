// Kullanım: node tests/kart-ajani-parcali-testi.js
// Kart ajanı parçalı ödeme (BAP Panel Veri Kapısı › parcaliVeBosta_): tek çekimle eşleşmeyen kart hesabı için 2–4 çekimin toplamı.
// 09.10 sahibinin örneği: 08.10 adisyon 108, nurullah, SmarTicket 2.725 TL = Edenred 305 + 1.340 + 1.080 (13:23–13:25).
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/bap-panel-veri-kapisi/Kod.gs'), 'utf8'), ctx);
vm.runInContext('simdi_ = function () { return Date.UTC(2026, 9, 9, 12, 0); };', ctx);
const U = (d, h, m) => Date.UTC(2026, 9, d, h, m), C = (ref, ms, t) => ({ ref, ms, tutar: t, tam: 'x' });
const havuz = [
  { kk: { ad: 'Edenred' }, veri: { cekim: [C('a', U(8, 13, 23), 1080), C('b', U(8, 13, 24), 1340), C('c', U(8, 13, 24), 305), C('d', U(8, 16, 0), 640)] } },
  { kk: { ad: 'Metropol' }, veri: { cekim: [C('m1', U(8, 19, 0), 400), C('m2', U(8, 21, 30), 300)] } }];
const liste = [
  { id: '108', odeme: 'SmarTicket', tutar: 2725, gun: '2026-10-08', teslim: '13:25' },   // 3 parça, 1 dk içinde → emin
  { id: '2', odeme: 'Metropol', tutar: 700, gun: '2026-10-08', teslim: '20:00' },        // 2 parça ama 2,5 saat arayla → soru
  { id: '3', odeme: 'Metropol', tutar: 999, gun: '2026-10-08', teslim: '20:00' }];       // tutan çekim yok → dokunulmaz
ctx.R = { liste, havuz, ek: {} };
vm.runInContext('parcaliVeBosta_(R.liste, R.havuz, {}, R.ek)', ctx);
let hata = 0; const bak = (k, m) => { console.log((k ? 'TAMAM ' : 'HATA  ') + m); if (!k) hata++; };
bak(liste[0].kartKarar === 'emin' && liste[0].kartParca.length === 3, '108: 3 Edenred parçası = 2.725 → emin');
bak(liste[1].kartKarar === 'soru' && liste[1].kartParca.length === 2, '2: parçalar dağınık → soru');
bak(!liste[2].kartKarar, '3: tutan kombinasyon yok → dokunulmaz');
bak(ctx.R.ek.bosta.length === 1 && ctx.R.ek.bosta[0].tutar === 640, 'boşta kalan tek çekim: Edenred 640');
process.exit(hata ? 1 : 0);
