// Kullanım: node tests/satis-motoru-testi.js "apps-script/stok-takip-sistemi/Satıs Motoru.gs"
// Beklenen: MOZZARELLA 9.44 (4 pizza × 140 gr), KUTU 96, 103 İPTAL, 104 işaretsiz.
// Apps Script'in tablo API'sinin küçük bir taklidi + satış motoru testi
const fs=require('fs'),vm=require('vm');
function Sheet(name,rows){this.n=name;this.r=rows.map(x=>x.slice());}
Sheet.prototype={getName(){return this.n},getLastRow(){return this.r.length},
 getLastColumn(){return Math.max(0,...this.r.map(x=>x.length))},
 _p(r,c){while(this.r.length<r)this.r.push([]);while(this.r[r-1].length<c)this.r[r-1].push('');},
 getRange(r,c,nr=1,nc=1){const s=this;return{
  getValues(){const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++){const v=(s.r[r-1+i]||[])[c-1+j];row.push(v===undefined?'':v);}o.push(row);}return o;},
  setValues(v){v.forEach((row,i)=>row.forEach((x,j)=>{s._p(r+i,c+j);s.r[r-1+i][c-1+j]=x;}));return this;},
  setValue(x){s._p(r,c);s.r[r-1][c-1]=x;return this;},getValue(){return ((s.r[r-1]||[])[c-1])??''},
  setFontWeight(){return this},setBackground(){return this},setFontColor(){return this},setNumberFormat(){return this}};},
 getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn())},
 insertRowsBefore(i,n){for(let k=0;k<n;k++)this.r.splice(i-1,0,[]);},appendRow(a){this.r.push(a.slice())},
 setFrozenRows(){},deleteRows(i,n){this.r.splice(i-1,n)},autoResizeColumns(){}};
function SS(sheets){this.s=sheets;}
SS.prototype={getSheetByName(n){return this.s.find(x=>x.n===n)||null},getSheets(){return this.s},insertSheet(n){const x=new Sheet(n,[]);this.s.push(x);return x}};
function kur(){
 const H=r=>r; // satış: 1 ID,3 Tarih,6 Restoran,7 Şube,8 Tip,10 Durum,16 Kat,17 Ürünler,18 Adet,19 Fiyat
 const bas=['ID','x','Tarih','x','x','Restoran','Sube','Tip','x','Durum','x','x','x','x','x','Kategoriler','Urunler','Adetler','Fiyatlar'];
 const sip=(id,durum,adet)=>[id,'','2026-10-01','','','BAP Erenköy','Erenköy','Paket','',durum,'','','','','','Pizza','Margarita Pizza',String(adet),'300'];
 const satis=new Sheet('Satıs Verileri',[bas,sip(101,'KAPALI',1),sip(102,'KAPALI',2),sip(103,'İPTAL',1),sip(104,'AÇIK',1),sip(105,'KAPALI',1)]);
 const hm=new Sheet('Tbl_Hammaddeler',[['Hammadde_ID','Hammadde_Adı','Kısa','Ted','Aktif','Paket','x','İçerik','Ölçü','Fiyat','x','x','x','x','Stok_Takip','Koli'],
   ['HM1','MOZZARELLA 2KG','Mozzarella','Metro',true,'Paket','',2,'kg',600,'','','','',true,''],
   ['HM2','KUTU 33CM','Pizza Kutusu','Merkez',true,'Paket','',1,'adet',5,'','','','',true,'']]);
 const rec=new Sheet('Tbl_Receteler',[['Ürün_Adı','Hammadde_Kategori','Hammadde','Miktar','Birim','Ü / YM'],['Margarita Pizza','Peynir','Mozzarella',140,'gr','Ü']]);
 const kural=new Sheet('Ambalaj_Kurallari',[['Kosul','Eslesme','Sarf','Miktar'],['Ürün','Margarita Pizza','Pizza Kutusu',1]]);
 const stok=new Sheet('Sube_Stok',[['Urun_Adi','Tip','Sube','Mevcut','Teorik','a','b','c','Son'],['MOZZARELLA 2KG','HM','Erenköy',10,10,'','','',''],['KUTU 33CM','AMB','Merkez',100,100,'','','','']]);
 return {satisSS:new SS([satis]),stokSS:new SS([hm,rec,kural,stok,new Sheet('Direktsatisurunler',[['ID','Ad']])]),satis,stok};
}
function calistir(dosya){
 const d=kur(); const loglar=[];
 const ctx=vm.createContext({SpreadsheetApp:{openById:id=>id.startsWith('1gdn')?d.satisSS:d.stokSS,getUi(){throw 1}},
   LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},Logger:{log:m=>loglar.push(String(m))},
   PropertiesService:{getScriptProperties:()=>({getProperty(){},setProperty(){}})},Utilities:{formatDate:()=>''},console});
 vm.runInContext(fs.readFileSync(dosya,'utf8'),ctx);
 vm.runInContext('stokMotoru()',ctx);
 const st=Object.fromEntries(d.stok.r.slice(1).map(r=>[r[0]+'/'+r[2],r[3]]));
 const isaret=d.satis.r.slice(1).map(r=>r[0]+':'+(r[r.length-1]||'—'));
 return {stok:st, isaret, log:loglar.filter(l=>/Tamamlandı|Durum:/.test(l))};
}
for(const f of process.argv.slice(2)){ try{console.log(f.split('/').pop(), JSON.stringify(calistir(f),null,1));}catch(e){console.log(f,'HATA',e.message)} }
