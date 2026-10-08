-- BAP veritabanı (Cloudflare D1 / SQLite) — Faz 1 çekirdeği. Taslak: canlıya kurulmadı.
-- Kural: islem ve hareket satırları DEĞİŞTİRİLMEZ, SİLİNMEZ. Düzeltme yeni bir islem'dir (ilgili_islem_id ile bağlı).

CREATE TABLE IF NOT EXISTS konum (
  id TEXT PRIMARY KEY,               -- 'ERENKOY', 'FIKIRTEPE', 'MERKEZ'
  ad TEXT NOT NULL UNIQUE
);

-- Kalem = stokta tutulan her şey. id mevcut tablodan gelir (Tbl_Hammaddeler A = Hammadde_ID, YM için 'YM-<ad>' bir kez verilir).
CREATE TABLE IF NOT EXISTS kalem (
  id TEXT PRIMARY KEY,
  tip TEXT NOT NULL CHECK (tip IN ('HM','YM','DS','AMB')),
  ad TEXT NOT NULL,
  kaynak_sekme TEXT,                 -- hangi Sheets tablosundan geldi
  kaynak_satir_ad TEXT,              -- Sube_Stok'taki adı (aktarım bu adla yazar)
  stok_birimi TEXT NOT NULL,         -- 'gr' | 'ml' | 'adet' (stok bu birimde tutulur)
  porsiyon_gram REAL,                -- YM: 1 adet/porsiyon kaç gram (dönüşüm için)
  aktif INTEGER NOT NULL DEFAULT 1
);

-- Satış adı, fatura adı, kısa ad → kalem (mevcut eşleştirme tablolarından yüklenir)
CREATE TABLE IF NOT EXISTS kalem_ad (
  ad_norm TEXT PRIMARY KEY,
  kalem_id TEXT NOT NULL REFERENCES kalem(id),
  kaynak TEXT NOT NULL
);

-- Reçete sürümü: değişince yeni sürüm açılır, eskisi silinmez. Geçmiş üretim kendi sürümüne bağlı kalır.
CREATE TABLE IF NOT EXISTS recete_surum (
  id TEXT PRIMARY KEY,
  kalem_id TEXT NOT NULL REFERENCES kalem(id),   -- üretilen yarı mamul
  surum INTEGER NOT NULL,
  parti_cikti REAL NOT NULL,                     -- 1 parti (1 kat) çıktısı, kalemin stok biriminde
  raf_omru_saat INTEGER,                         -- boşsa raf ömrü bilinmiyor (uyarı)
  gecerli_bas TEXT NOT NULL,                     -- ISO zaman
  degistiren TEXT, sebep TEXT,
  UNIQUE (kalem_id, surum)
);
CREATE TABLE IF NOT EXISTS recete_satir (
  surum_id TEXT NOT NULL REFERENCES recete_surum(id),
  sira INTEGER NOT NULL,
  girdi_kalem_id TEXT NOT NULL REFERENCES kalem(id),
  miktar REAL NOT NULL,                          -- 1 parti için, girdi kaleminin stok biriminde
  tekrar_parti INTEGER,                          -- konfi yağı gibi N partide bir yenilenen
  PRIMARY KEY (surum_id, sira)
);

-- İşlem: ekrandan gelen tek kayıt. id istemcide üretilir (UUID), aynı id ikinci kez gelirse yeni kayıt açılmaz.
CREATE TABLE IF NOT EXISTS islem (
  sira INTEGER PRIMARY KEY AUTOINCREMENT,        -- aktarım sırası (Sheets bu sırayla okur)
  id TEXT NOT NULL UNIQUE,
  tur TEXT NOT NULL CHECK (tur IN ('URETIM','ZAYI','SAYIM','DUZELTME')),
  konum_id TEXT NOT NULL REFERENCES konum(id),
  isletme_gunu TEXT NOT NULL,                    -- 05:00 sınırıyla (İstanbul)
  islem_zamani TEXT NOT NULL,                    -- işin gerçekten yapıldığı an
  giris_zamani TEXT NOT NULL,                    -- sunucuya ulaştığı an
  kullanici TEXT NOT NULL,
  cihaz TEXT,
  ilgili_islem_id TEXT REFERENCES islem(id),     -- düzeltme hangi kaydı düzeltiyor
  sebep TEXT,
  aciklama TEXT,
  govde_ozet TEXT NOT NULL                       -- aynı id farklı içerikle gelirse reddetmek için
);

CREATE TABLE IF NOT EXISTS parti (
  id TEXT PRIMARY KEY,                           -- = üretim islem id
  kalem_id TEXT NOT NULL REFERENCES kalem(id),
  konum_id TEXT NOT NULL REFERENCES konum(id),
  recete_surum_id TEXT NOT NULL REFERENCES recete_surum(id),
  kat REAL NOT NULL,
  beklenen REAL NOT NULL,
  gercek REAL NOT NULL,
  uretim_zamani TEXT NOT NULL,
  son_kullanma TEXT                              -- boş = raf ömrü tanımsız
);

-- Hareket: stok etkisi. Üretimde girdiler eksi, çıktı artı; hepsi aynı islem'e bağlı ve birlikte yazılır.
CREATE TABLE IF NOT EXISTS hareket (
  id INTEGER PRIMARY KEY,
  islem_id TEXT NOT NULL REFERENCES islem(id),
  kalem_id TEXT NOT NULL REFERENCES kalem(id),
  konum_id TEXT NOT NULL REFERENCES konum(id),
  miktar REAL NOT NULL,                          -- stok biriminde, işaretli
  parti_id TEXT REFERENCES parti(id),
  rol TEXT NOT NULL                              -- 'GIRDI' | 'CIKTI' | 'ZAYI' | 'DUZELTME'
);
CREATE INDEX IF NOT EXISTS hareket_islem ON hareket(islem_id);

-- Kör sayım: sayan kişi sistem miktarını görmez; fark aktarımda, sayım anına göre hesaplanır.
CREATE TABLE IF NOT EXISTS sayim_satir (
  islem_id TEXT NOT NULL REFERENCES islem(id),
  kalem_id TEXT NOT NULL REFERENCES kalem(id),
  sayilan REAL NOT NULL,
  PRIMARY KEY (islem_id, kalem_id)
);

-- BAKİYE: her (kalem, konum) için güncel stok. Hareketleri her okumada toplamak bütün tabloyu tarar (ölçüm: 8.000 harekette
-- tek bakiye sorgusu 12.000 satır okudu); bu yüzden bakiye ayrı tutulur. Bakiyeyi YALNIZ hareket tetiği değiştirir:
--  * hareket eklenince aynı işlemin (transaction) içinde bakiye güncellenir → "hareket var, bakiye yok" ya da tersi olamaz;
--  * mükerrer kayıt islem.id UNIQUE ile reddedilir → bütün toplu yazım geri alınır, bakiye iki kez değişmez;
--  * elle güncelleme reddedilir: her bakiye değişikliği tam olarak bir yeni harekete (son_hareket_id) karşılık gelmeli;
--  * hareket_sayisi + son_hareket_id ile bakiye hareketlerden yeniden hesaplanıp karşılaştırılabilir (bakiyeKontrol).
CREATE TABLE IF NOT EXISTS bakiye (
  kalem_id TEXT NOT NULL REFERENCES kalem(id),
  konum_id TEXT NOT NULL REFERENCES konum(id),
  miktar REAL NOT NULL DEFAULT 0,
  hareket_sayisi INTEGER NOT NULL DEFAULT 0,
  son_hareket_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kalem_id, konum_id)
);
CREATE TRIGGER IF NOT EXISTS hareket_bakiye AFTER INSERT ON hareket BEGIN
  INSERT OR IGNORE INTO bakiye (kalem_id, konum_id) VALUES (NEW.kalem_id, NEW.konum_id);
  UPDATE bakiye SET miktar = round(miktar + NEW.miktar, 6), hareket_sayisi = hareket_sayisi + 1, son_hareket_id = NEW.id
   WHERE kalem_id = NEW.kalem_id AND konum_id = NEW.konum_id;
END;
CREATE TRIGGER IF NOT EXISTS bakiye_elle_degismez BEFORE UPDATE ON bakiye
WHEN NEW.hareket_sayisi <> OLD.hareket_sayisi + 1
  OR NEW.son_hareket_id <= OLD.son_hareket_id
  OR NEW.kalem_id <> OLD.kalem_id OR NEW.konum_id <> OLD.konum_id
  OR (SELECT kalem_id || '|' || konum_id FROM hareket WHERE id = NEW.son_hareket_id) IS NOT NEW.kalem_id || '|' || NEW.konum_id
  OR abs(NEW.miktar - round(OLD.miktar + (SELECT miktar FROM hareket WHERE id = NEW.son_hareket_id), 6)) > 0.000001
BEGIN SELECT RAISE(ABORT, 'bakiye elle degistirilemez; hareket yazin'); END;
CREATE TRIGGER IF NOT EXISTS bakiye_silinmez BEFORE DELETE ON bakiye BEGIN SELECT RAISE(ABORT, 'bakiye silinemez'); END;
CREATE TRIGGER IF NOT EXISTS bakiye_elle_eklenmez BEFORE INSERT ON bakiye WHEN NEW.miktar <> 0 OR NEW.hareket_sayisi <> 0
BEGIN SELECT RAISE(ABORT, 'bakiye elle eklenemez'); END;

-- Sheets aktarımının durumu: Apps Script en son hangi sıraya kadar işledi.
CREATE TABLE IF NOT EXISTS aktarim (
  hedef TEXT PRIMARY KEY,
  son_sira INTEGER NOT NULL DEFAULT 0,
  son_onay TEXT
);

-- Değişmezlik: kayıt sessizce değişemez.
CREATE TRIGGER IF NOT EXISTS islem_degismez BEFORE UPDATE ON islem BEGIN SELECT RAISE(ABORT, 'islem degistirilemez'); END;
CREATE TRIGGER IF NOT EXISTS islem_silinmez BEFORE DELETE ON islem BEGIN SELECT RAISE(ABORT, 'islem silinemez'); END;
CREATE TRIGGER IF NOT EXISTS hareket_degismez BEFORE UPDATE ON hareket BEGIN SELECT RAISE(ABORT, 'hareket degistirilemez'); END;
CREATE TRIGGER IF NOT EXISTS hareket_silinmez BEFORE DELETE ON hareket BEGIN SELECT RAISE(ABORT, 'hareket silinemez'); END;
CREATE TRIGGER IF NOT EXISTS recete_surum_degismez BEFORE UPDATE ON recete_surum BEGIN SELECT RAISE(ABORT, 'recete surumu degistirilemez, yeni surum acin'); END;
