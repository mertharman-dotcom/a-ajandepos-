// Cloudflare D1 API'sinin (prepare/bind/first/all/run, batch) node:sqlite üzerinde taklidi.
// D1'de batch() tek bir işlem (transaction) olarak çalışır: biri başarısızsa hepsi geri alınır. Burada da öyle.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function d1Olustur(semaYolu) {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON;');
  sql.exec(readFileSync(semaYolu, 'utf8'));
  const sayac = { yazilanSatir: 0, okunanSorgu: 0, batch: 0 };
  let hataEnjekte = null; // (sqlMetni) => true ise o deyimde hata fırlat
  function deyim(metin, params = []) {
    return {
      _metin: metin, _params: params,
      bind(...p) { return deyim(metin, p); },
      async first() { sayac.okunanSorgu++; return sql.prepare(metin).get(...params) ?? null; },
      async all() { sayac.okunanSorgu++; return { results: sql.prepare(metin).all(...params) }; },
      async run() { return calistir(this); },
    };
  }
  function calistir(d) {
    if (hataEnjekte && hataEnjekte(d._metin)) throw new Error('ENJEKTE HATA: ' + d._metin.slice(0, 40));
    const r = sql.prepare(d._metin).run(...d._params);
    sayac.yazilanSatir += Number(r.changes || 0);
    return { meta: { changes: r.changes } };
  }
  return {
    prepare: m => deyim(m),
    async batch(liste) {
      sayac.batch++;
      sql.exec('BEGIN');
      try { const s = liste.map(calistir); sql.exec('COMMIT'); return s; }
      catch (e) { sql.exec('ROLLBACK'); throw e; }
    },
    exec: m => sql.exec(m),
    tum: (m, ...p) => sql.prepare(m).all(...p),
    sayac, hataEnjekte: f => { hataEnjekte = f; },
  };
}

// Gerçek verilerden örnek: Narenciye Sos ve Pizza Hamuru reçeteleri (Tbl_YariMamulRecete, 07.10.2026 okuması).
export function ornekVeri(db) {
  db.exec(`
    INSERT INTO konum VALUES ('ERENKOY','Erenköy'),('FIKIRTEPE','Fikirtepe'),('MERKEZ','Merkez');
    INSERT INTO kalem (id,tip,ad,kaynak_sekme,kaynak_satir_ad,stok_birimi,porsiyon_gram) VALUES
      ('HM-MAYONEZ','HM','Mayonez','Tbl_Hammaddeler','Mayonez','gr',NULL),
      ('HM-PORTAKAL','HM','Portakal','Tbl_Hammaddeler','PORTAKAL','gr',NULL),
      ('HM-ELMA','HM','Elma yeşil','Tbl_Hammaddeler','Elma yeşil','gr',NULL),
      ('HM-UN','HM','Un','Tbl_Hammaddeler','Un','gr',NULL),
      ('HM-SU','HM','Su','Tbl_Hammaddeler','Su','ml',NULL),
      ('YM-NARENCIYE','YM','Narenciye Sos','Tbl_YariMamul','Narenciye sos','gr',NULL),
      ('YM-PIZZA-HAMURU','YM','Pizza Hamuru','Tbl_YariMamul','Pizza Hamuru','adet',180);
    INSERT INTO recete_surum (id,kalem_id,surum,parti_cikti,raf_omru_saat,gecerli_bas,degistiren,sebep) VALUES
      ('RS-NAR-1','YM-NARENCIYE',1,16820,72,'2026-01-01T00:00:00Z','aktarım','Sheets reçetesinden'),
      ('RS-HAM-1','YM-PIZZA-HAMURU',1,85,72,'2026-01-01T00:00:00Z','aktarım','Sheets reçetesinden');
    INSERT INTO recete_satir VALUES
      ('RS-NAR-1',1,'HM-MAYONEZ',4000,NULL),('RS-NAR-1',2,'HM-PORTAKAL',7000,NULL),('RS-NAR-1',3,'HM-ELMA',2000,NULL),
      ('RS-HAM-1',1,'HM-UN',10000,NULL),('RS-HAM-1',2,'HM-SU',5600,NULL);
  `);
}
