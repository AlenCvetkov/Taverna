-- Names and relationships from the agreed PER diagram. Money is integer MKD cents.
CREATE TABLE Lice(
 LiceID INTEGER PRIMARY KEY, Ime TEXT NOT NULL, KorisnickoIme TEXT NOT NULL UNIQUE,
 Pozicija TEXT NOT NULL CHECK(Pozicija IN ('waiter','manager','director')),
 Sol TEXT NOT NULL, LozinkaHash TEXT NOT NULL, Aktiven INTEGER NOT NULL DEFAULT 1 CHECK(Aktiven IN(0,1)),
 KreiranNa TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, Sifra TEXT UNIQUE,
 CHECK(Pozicija<>'waiter' OR (Sifra IS NOT NULL AND Sifra GLOB '0[0-9][0-9]' AND Sifra<>'000')),
 UNIQUE(LiceID,Pozicija)
);
CREATE TABLE Kelner(KelnerID INTEGER PRIMARY KEY, Pozicija TEXT NOT NULL DEFAULT 'waiter' CHECK(Pozicija='waiter'),
 FOREIGN KEY(KelnerID,Pozicija) REFERENCES Lice(LiceID,Pozicija));
CREATE TABLE Menager(MenagerID INTEGER PRIMARY KEY, Pozicija TEXT NOT NULL DEFAULT 'manager' CHECK(Pozicija='manager'),
 FOREIGN KEY(MenagerID,Pozicija) REFERENCES Lice(LiceID,Pozicija));
CREATE TABLE Direktor(DirektorID INTEGER PRIMARY KEY, Pozicija TEXT NOT NULL DEFAULT 'director' CHECK(Pozicija='director'),
 FOREIGN KEY(DirektorID,Pozicija) REFERENCES Lice(LiceID,Pozicija));
CREATE TRIGGER per_lice_subtype AFTER INSERT ON Lice BEGIN
 INSERT INTO Kelner SELECT NEW.LiceID,NEW.Pozicija WHERE NEW.Pozicija='waiter';
 INSERT INTO Menager SELECT NEW.LiceID,NEW.Pozicija WHERE NEW.Pozicija='manager';
 INSERT INTO Direktor SELECT NEW.LiceID,NEW.Pozicija WHERE NEW.Pozicija='director';
END;
CREATE TRIGGER per_fixed_role BEFORE UPDATE OF Pozicija ON Lice WHEN NEW.Pozicija<>OLD.Pozicija BEGIN
 SELECT RAISE(ABORT,'A person has exactly one immutable position; deactivate an old account if necessary');
END;
CREATE TABLE Article(
 ArticleID INTEGER PRIMARY KEY, Sifra INTEGER NOT NULL UNIQUE, Ime TEXT NOT NULL,
 Cena INTEGER NOT NULL CHECK(typeof(Cena)='integer' AND Cena>=0),
 Kategorija TEXT NOT NULL CHECK(Kategorija IN('kitchen','bar','addon')),
 Aktiven INTEGER NOT NULL DEFAULT 1 CHECK(Aktiven IN(0,1)), Slika TEXT, SlikaVerzija INTEGER NOT NULL DEFAULT 0,
 CHECK((Kategorija='kitchen' AND Sifra BETWEEN 800 AND 899) OR (Kategorija='bar' AND Sifra BETWEEN 501 AND 599) OR (Kategorija='addon' AND Sifra BETWEEN 200 AND 299)),
 UNIQUE(ArticleID,Sifra,Kategorija)
);
CREATE TABLE Kujna(ArticleID INTEGER PRIMARY KEY,Sifra INTEGER NOT NULL UNIQUE CHECK(Sifra BETWEEN 800 AND 899),
 Kategorija TEXT NOT NULL DEFAULT 'kitchen' CHECK(Kategorija='kitchen'),
 FOREIGN KEY(ArticleID,Sifra,Kategorija) REFERENCES Article(ArticleID,Sifra,Kategorija) ON UPDATE CASCADE);
CREATE TABLE Shank(ArticleID INTEGER PRIMARY KEY,Sifra INTEGER NOT NULL UNIQUE CHECK(Sifra BETWEEN 501 AND 599),
 Kategorija TEXT NOT NULL DEFAULT 'bar' CHECK(Kategorija='bar'),
 FOREIGN KEY(ArticleID,Sifra,Kategorija) REFERENCES Article(ArticleID,Sifra,Kategorija) ON UPDATE CASCADE);
CREATE TABLE Dodatok(ArticleID INTEGER PRIMARY KEY,Sifra INTEGER NOT NULL UNIQUE CHECK(Sifra BETWEEN 200 AND 299),
 Kategorija TEXT NOT NULL DEFAULT 'addon' CHECK(Kategorija='addon'),
 FOREIGN KEY(ArticleID,Sifra,Kategorija) REFERENCES Article(ArticleID,Sifra,Kategorija) ON UPDATE CASCADE);
CREATE TRIGGER per_article_subtype AFTER INSERT ON Article BEGIN
 INSERT INTO Kujna SELECT NEW.ArticleID,NEW.Sifra,NEW.Kategorija WHERE NEW.Kategorija='kitchen';
 INSERT INTO Shank SELECT NEW.ArticleID,NEW.Sifra,NEW.Kategorija WHERE NEW.Kategorija='bar';
 INSERT INTO Dodatok SELECT NEW.ArticleID,NEW.Sifra,NEW.Kategorija WHERE NEW.Kategorija='addon';
END;
CREATE TRIGGER per_fixed_category BEFORE UPDATE OF Kategorija ON Article WHEN NEW.Kategorija<>OLD.Kategorija BEGIN
 SELECT RAISE(ABORT,'An article belongs to exactly one category');
END;
CREATE TABLE Masa(MasaID INTEGER PRIMARY KEY,Tip TEXT NOT NULL CHECK(Tip IN('O','K','P')),
 Broj INTEGER NOT NULL CHECK(typeof(Broj)='integer' AND Broj BETWEEN 1 AND 99),Aktivna INTEGER NOT NULL DEFAULT 1 CHECK(Aktivna IN(0,1)),UNIQUE(Tip,Broj));
CREATE TABLE Smetka(
 SmetkaID INTEGER PRIMARY KEY,MasaID INTEGER NOT NULL REFERENCES Masa(MasaID),
 Plateno INTEGER NOT NULL DEFAULT 0 CHECK(Plateno IN(0,1)),Otkazana INTEGER NOT NULL DEFAULT 0 CHECK(Otkazana IN(0,1)),
 DatumVreme TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,NaplatenoNa TEXT,
 Vkupno INTEGER NOT NULL DEFAULT 0 CHECK(typeof(Vkupno)='integer' AND Vkupno>=0),
 CHECK(NOT(Plateno=1 AND Otkazana=1)),CHECK(Plateno=0 OR NaplatenoNa IS NOT NULL),UNIQUE(SmetkaID,MasaID)
);
CREATE UNIQUE INDEX per_one_open_bill ON Smetka(MasaID) WHERE Plateno=0 AND Otkazana=0;
CREATE TABLE Narachka(
 NarachkaID INTEGER PRIMARY KEY,SmetkaID INTEGER NOT NULL,MasaID INTEGER NOT NULL,
 KelnerID INTEGER NOT NULL REFERENCES Kelner(KelnerID),ArticleID INTEGER NOT NULL REFERENCES Article(ArticleID),
 BrojNaArtikli INTEGER NOT NULL CHECK(typeof(BrojNaArtikli)='integer' AND BrojNaArtikli BETWEEN 1 AND 999),
 Komentar TEXT NOT NULL DEFAULT '',SifraPriNaracka INTEGER NOT NULL CHECK(SifraPriNaracka BETWEEN 501 AND 599 OR SifraPriNaracka BETWEEN 800 AND 899),
 ImePriNaracka TEXT NOT NULL,CenaPriNaracka INTEGER NOT NULL CHECK(typeof(CenaPriNaracka)='integer' AND CenaPriNaracka>=0),
 DodadenoNa TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,Prakanje TEXT NOT NULL,RedenBroj INTEGER NOT NULL CHECK(RedenBroj>0),
 FOREIGN KEY(SmetkaID,MasaID) REFERENCES Smetka(SmetkaID,MasaID),UNIQUE(Prakanje,RedenBroj),
 UNIQUE(NarachkaID,KelnerID),UNIQUE(NarachkaID,MasaID),UNIQUE(NarachkaID,SmetkaID),UNIQUE(NarachkaID,ArticleID)
);
CREATE INDEX per_narachka_bill ON Narachka(SmetkaID);
CREATE INDEX per_narachka_waiter ON Narachka(KelnerID,SmetkaID);
CREATE TABLE DodatokNaNarachka(
 DodatokNaNarachkaID INTEGER PRIMARY KEY,NarachkaID INTEGER NOT NULL REFERENCES Narachka(NarachkaID),
 ArticleID INTEGER NOT NULL REFERENCES Dodatok(ArticleID),
 BrojPoEdinica INTEGER NOT NULL CHECK(typeof(BrojPoEdinica)='integer' AND BrojPoEdinica BETWEEN 1 AND 999),
 SifraPriNaracka INTEGER NOT NULL CHECK(SifraPriNaracka BETWEEN 200 AND 299),ImePriNaracka TEXT NOT NULL,
 CenaPriNaracka INTEGER NOT NULL CHECK(typeof(CenaPriNaracka)='integer' AND CenaPriNaracka>=0),
 UNIQUE(DodatokNaNarachkaID,NarachkaID),UNIQUE(DodatokNaNarachkaID,ArticleID)
);
CREATE INDEX per_addon_line ON DodatokNaNarachka(NarachkaID);
CREATE TABLE Naplata(NaplataID INTEGER PRIMARY KEY,SmetkaID INTEGER NOT NULL UNIQUE REFERENCES Smetka(SmetkaID),
 PrimilLiceID INTEGER NOT NULL REFERENCES Lice(LiceID),Iznos INTEGER NOT NULL CHECK(typeof(Iznos)='integer' AND Iznos>0),DatumVreme TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- Explicit named relationships requested in the diagram. Composite FKs keep them consistent.
CREATE TABLE Izbira(KelnerID INTEGER NOT NULL REFERENCES Kelner(KelnerID),MasaID INTEGER NOT NULL REFERENCES Masa(MasaID),PRIMARY KEY(KelnerID,MasaID));
CREATE TABLE Pristap(MenagerID INTEGER NOT NULL REFERENCES Menager(MenagerID),DirektorID INTEGER NOT NULL REFERENCES Direktor(DirektorID),
 SmetkaID INTEGER NOT NULL REFERENCES Smetka(SmetkaID),PRIMARY KEY(MenagerID,DirektorID,SmetkaID));
CREATE TABLE MenuvaDirektorMasa(DirektorID INTEGER NOT NULL REFERENCES Direktor(DirektorID),MasaID INTEGER NOT NULL REFERENCES Masa(MasaID),PRIMARY KEY(DirektorID,MasaID));
CREATE TABLE Dodal(NarachkaID INTEGER PRIMARY KEY,KelnerID INTEGER NOT NULL REFERENCES Kelner(KelnerID),
 FOREIGN KEY(NarachkaID,KelnerID) REFERENCES Narachka(NarachkaID,KelnerID));
CREATE TABLE Pregled(SmetkaID INTEGER PRIMARY KEY,MasaID INTEGER NOT NULL REFERENCES Masa(MasaID),
 FOREIGN KEY(SmetkaID,MasaID) REFERENCES Smetka(SmetkaID,MasaID));
CREATE TABLE MenuvaMasaNarachka(NarachkaID INTEGER PRIMARY KEY,MasaID INTEGER NOT NULL REFERENCES Masa(MasaID),
 FOREIGN KEY(NarachkaID,MasaID) REFERENCES Narachka(NarachkaID,MasaID));
CREATE TABLE PovekjeNarachki(NarachkaID INTEGER PRIMARY KEY,SmetkaID INTEGER NOT NULL REFERENCES Smetka(SmetkaID),
 FOREIGN KEY(NarachkaID,SmetkaID) REFERENCES Narachka(NarachkaID,SmetkaID));
CREATE TABLE Prikazuva(NarachkaID INTEGER PRIMARY KEY,ArticleID INTEGER NOT NULL REFERENCES Article(ArticleID),
 FOREIGN KEY(NarachkaID,ArticleID) REFERENCES Narachka(NarachkaID,ArticleID));
CREATE TABLE ImaDodatok(DodatokNaNarachkaID INTEGER PRIMARY KEY,NarachkaID INTEGER NOT NULL REFERENCES Narachka(NarachkaID),
 FOREIGN KEY(DodatokNaNarachkaID,NarachkaID) REFERENCES DodatokNaNarachka(DodatokNaNarachkaID,NarachkaID));
CREATE TABLE SeOdnesuvaNaDodatok(DodatokNaNarachkaID INTEGER PRIMARY KEY,ArticleID INTEGER NOT NULL REFERENCES Dodatok(ArticleID),
 FOREIGN KEY(DodatokNaNarachkaID,ArticleID) REFERENCES DodatokNaNarachka(DodatokNaNarachkaID,ArticleID));
CREATE TRIGGER per_bill_relationships AFTER INSERT ON Smetka BEGIN
 INSERT INTO Pregled VALUES(NEW.SmetkaID,NEW.MasaID);
 INSERT INTO Pristap SELECT m.MenagerID,d.DirektorID,NEW.SmetkaID FROM Menager m CROSS JOIN Direktor d;
END;
CREATE TRIGGER per_manager_access AFTER INSERT ON Menager BEGIN
 INSERT OR IGNORE INTO Pristap SELECT NEW.MenagerID,d.DirektorID,s.SmetkaID FROM Direktor d CROSS JOIN Smetka s;
END;
CREATE TRIGGER per_director_access AFTER INSERT ON Direktor BEGIN
 INSERT OR IGNORE INTO Pristap SELECT m.MenagerID,NEW.DirektorID,s.SmetkaID FROM Menager m CROSS JOIN Smetka s;
END;
CREATE TRIGGER per_order_relationships AFTER INSERT ON Narachka BEGIN
 INSERT INTO Dodal VALUES(NEW.NarachkaID,NEW.KelnerID);
 INSERT INTO MenuvaMasaNarachka VALUES(NEW.NarachkaID,NEW.MasaID);
 INSERT INTO PovekjeNarachki VALUES(NEW.NarachkaID,NEW.SmetkaID);
 INSERT INTO Prikazuva VALUES(NEW.NarachkaID,NEW.ArticleID);
 INSERT OR IGNORE INTO Izbira VALUES(NEW.KelnerID,NEW.MasaID);
END;
CREATE TRIGGER per_addon_relationships AFTER INSERT ON DodatokNaNarachka BEGIN
 INSERT INTO ImaDodatok VALUES(NEW.DodatokNaNarachkaID,NEW.NarachkaID);
 INSERT INTO SeOdnesuvaNaDodatok VALUES(NEW.DodatokNaNarachkaID,NEW.ArticleID);
END;
CREATE VIEW NarachkaPregled AS SELECT n.*,
 n.BrojNaArtikli*(n.CenaPriNaracka+COALESCE((SELECT SUM(d.CenaPriNaracka*d.BrojPoEdinica) FROM DodatokNaNarachka d WHERE d.NarachkaID=n.NarachkaID),0)) AS Vkupno,
 l.Ime AS KelnerIme FROM Narachka n JOIN Lice l ON l.LiceID=n.KelnerID;
CREATE VIEW MasaPregled AS SELECT m.*,m.Tip||m.Broj AS Oznaka,
 CASE WHEN EXISTS(SELECT 1 FROM Smetka s WHERE s.MasaID=m.MasaID AND s.Plateno=0 AND s.Otkazana=0) THEN 'Zafatena' ELSE 'Slobodna' END AS SlobodnaZafatena,
 COALESCE((SELECT SUM(n.Vkupno) FROM NarachkaPregled n JOIN Smetka s ON s.SmetkaID=n.SmetkaID WHERE s.MasaID=m.MasaID AND s.Plateno=0 AND s.Otkazana=0),0) AS TekovnaCena FROM Masa m;
CREATE VIEW SmetkaPregled AS SELECT s.*,m.Tip||m.Broj AS Oznaka,
 MAX(0,unixepoch(COALESCE(s.NaplatenoNa,CURRENT_TIMESTAMP))-unixepoch(s.DatumVreme)) AS TraenjeSekundi FROM Smetka s JOIN Masa m ON m.MasaID=s.MasaID;
CREATE VIEW KujnaPregled AS SELECT a.ArticleID,a.Sifra,a.Ime,a.Cena,a.Aktiven FROM Kujna k JOIN Article a USING(ArticleID);
CREATE VIEW ShankPregled AS SELECT a.ArticleID,a.Sifra,a.Ime,a.Cena,a.Aktiven FROM Shank k JOIN Article a USING(ArticleID);
CREATE VIEW DodatokPregled AS SELECT a.ArticleID,a.Sifra,a.Ime,a.Cena,a.Aktiven FROM Dodatok k JOIN Article a USING(ArticleID);
CREATE TRIGGER per_line_open BEFORE INSERT ON Narachka BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM Smetka WHERE SmetkaID=NEW.SmetkaID AND Plateno=0 AND Otkazana=0) THEN RAISE(ABORT,'Bill is closed') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM Article WHERE ArticleID=NEW.ArticleID AND Kategorija IN('kitchen','bar')) THEN RAISE(ABORT,'Main item must be food or drink') END;
END;
CREATE TRIGGER per_line_update BEFORE UPDATE ON Narachka BEGIN
 SELECT CASE WHEN (SELECT Plateno OR Otkazana FROM Smetka WHERE SmetkaID=OLD.SmetkaID) THEN RAISE(ABORT,'Bill is closed') END;
 SELECT CASE WHEN NEW.SmetkaID<>OLD.SmetkaID OR NEW.MasaID<>OLD.MasaID OR NEW.KelnerID<>OLD.KelnerID OR NEW.ArticleID<>OLD.ArticleID OR NEW.CenaPriNaracka<>OLD.CenaPriNaracka OR NEW.ImePriNaracka<>OLD.ImePriNaracka OR NEW.SifraPriNaracka<>OLD.SifraPriNaracka OR NEW.Prakanje<>OLD.Prakanje OR NEW.RedenBroj<>OLD.RedenBroj THEN RAISE(ABORT,'Saved line identity and price snapshot are immutable') END;
END;
CREATE TRIGGER per_addon_open BEFORE INSERT ON DodatokNaNarachka BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM Narachka n JOIN Smetka s USING(SmetkaID) WHERE n.NarachkaID=NEW.NarachkaID AND s.Plateno=0 AND s.Otkazana=0) THEN RAISE(ABORT,'Bill is closed') END;
END;
CREATE TRIGGER per_addon_update BEFORE UPDATE ON DodatokNaNarachka BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM Narachka n JOIN Smetka s USING(SmetkaID) WHERE n.NarachkaID=OLD.NarachkaID AND (s.Plateno=1 OR s.Otkazana=1)) THEN RAISE(ABORT,'Bill is closed') END;
 SELECT CASE WHEN NEW.NarachkaID<>OLD.NarachkaID OR NEW.ArticleID<>OLD.ArticleID OR NEW.CenaPriNaracka<>OLD.CenaPriNaracka OR NEW.ImePriNaracka<>OLD.ImePriNaracka OR NEW.SifraPriNaracka<>OLD.SifraPriNaracka THEN RAISE(ABORT,'Saved addon identity and price snapshot are immutable') END;
END;
CREATE TRIGGER per_bill_table_fixed BEFORE UPDATE OF MasaID ON Smetka WHEN NEW.MasaID<>OLD.MasaID BEGIN
 SELECT RAISE(ABORT,'Bill table cannot change');
END;
CREATE TRIGGER per_line_total_insert AFTER INSERT ON Narachka BEGIN
 UPDATE Smetka SET Vkupno=COALESCE((SELECT SUM(Vkupno) FROM NarachkaPregled WHERE SmetkaID=NEW.SmetkaID),0) WHERE SmetkaID=NEW.SmetkaID;
END;
CREATE TRIGGER per_line_total_update AFTER UPDATE OF BrojNaArtikli ON Narachka BEGIN
 UPDATE Smetka SET Vkupno=COALESCE((SELECT SUM(Vkupno) FROM NarachkaPregled WHERE SmetkaID=NEW.SmetkaID),0) WHERE SmetkaID=NEW.SmetkaID;
END;
CREATE TRIGGER per_addon_total_insert AFTER INSERT ON DodatokNaNarachka BEGIN
 UPDATE Smetka SET Vkupno=COALESCE((SELECT SUM(Vkupno) FROM NarachkaPregled WHERE SmetkaID=Smetka.SmetkaID),0) WHERE SmetkaID=(SELECT SmetkaID FROM Narachka WHERE NarachkaID=NEW.NarachkaID);
END;
CREATE TRIGGER per_addon_total_update AFTER UPDATE OF BrojPoEdinica ON DodatokNaNarachka BEGIN
 UPDATE Smetka SET Vkupno=COALESCE((SELECT SUM(Vkupno) FROM NarachkaPregled WHERE SmetkaID=Smetka.SmetkaID),0) WHERE SmetkaID=(SELECT SmetkaID FROM Narachka WHERE NarachkaID=NEW.NarachkaID);
END;
-- Saved rows are retained; cancellation is recorded at bill level instead of deletion.
CREATE TRIGGER per_keep_line BEFORE DELETE ON Narachka BEGIN SELECT RAISE(ABORT,'Saved order history cannot be deleted'); END;
CREATE TRIGGER per_keep_addon BEFORE DELETE ON DodatokNaNarachka BEGIN SELECT RAISE(ABORT,'Saved addon history cannot be deleted'); END;
CREATE TRIGGER per_payment_check BEFORE INSERT ON Naplata BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM Smetka WHERE SmetkaID=NEW.SmetkaID AND Plateno=1 AND Vkupno=NEW.Iznos) THEN RAISE(ABORT,'Payment does not match the paid bill') END;
END;
