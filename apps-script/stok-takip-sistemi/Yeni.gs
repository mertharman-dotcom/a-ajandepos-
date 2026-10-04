function isimBirlestirmeAnalizi(){
  const ss = SpreadsheetApp.getActive();
  const tablolar = ['Tbl_Hammaddeler','Direktsatisurunler','Ambalaj_Hammadde'];
  const kisaAdlar = {};
  let rapor = [];

  tablolar.forEach(ad=>{
    const sh = ss.getSheetByName(ad);
    if(!sh){ rapor.push(ad+': SEKME YOK'); return; }
    const son = sh.getLastRow();
    const v = sh.getRange(2,2,son-1,2).getValues();   // B=uzun ad, C=kisa ad
    let dolu=0, bos=0;
    const yerel = {};
    v.forEach(r=>{
      const uzun = String(r[0]||'').trim();
      const kisa = String(r[1]||'').trim();
      if(!uzun) return;
      if(kisa){ dolu++; yerel[kisa]=(yerel[kisa]||0)+1; kisaAdlar[kisa]=(kisaAdlar[kisa]||0)+1; }
      else { bos++; }
    });
    const cok = Object.keys(yerel).filter(k=>yerel[k]>1).length;
    rapor.push(ad+': '+(son-1)+' satır | kısa adı dolu '+dolu+' | BOŞ '+bos+' | birden çok uzun ada sahip kısa ad: '+cok);
  });

  const tumu = Object.keys(kisaAdlar);
  const cakisan = tumu.filter(k=>kisaAdlar[k]>1).sort((a,b)=>kisaAdlar[b]-kisaAdlar[a]);
  rapor.push('---');
  rapor.push('Toplam farklı kısa ad: '+tumu.length);
  rapor.push('Birleşecek (2+ kayıt) kısa ad: '+cakisan.length);
  rapor.push('En çok birleşen 15:');
  cakisan.slice(0,15).forEach(k=>rapor.push('   '+k+' → '+kisaAdlar[k]+' kayıt'));

  Logger.log(rapor.join('\n'));
}