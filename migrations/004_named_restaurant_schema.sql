-- Keep internal keys and historical prices unchanged while naming the domain tables.
ALTER TABLE users RENAME TO Lice;
ALTER TABLE dining_tables RENAME TO Masa;
ALTER TABLE products RENAME TO Artikl;
ALTER TABLE orders RENAME TO Narachka;
ALTER TABLE order_items RENAME TO StavkaNaNarachka;
ALTER TABLE order_item_addons RENAME TO DodatokNaStavka;
ALTER TABLE payments RENAME TO Naplata;

-- An article's shared fields live in Artikl. Each subtype exposes its display code.
CREATE UNIQUE INDEX artikl_subtype_key ON Artikl(id,code,category);
CREATE TABLE Kujna (
 id INTEGER PRIMARY KEY,
 code INTEGER NOT NULL UNIQUE CHECK(code BETWEEN 800 AND 899),
 category TEXT NOT NULL DEFAULT 'kitchen' CHECK(category='kitchen'),
 FOREIGN KEY(id,code,category) REFERENCES Artikl(id,code,category) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE TABLE Shank (
 id INTEGER PRIMARY KEY,
 code INTEGER NOT NULL UNIQUE CHECK(code BETWEEN 501 AND 599),
 category TEXT NOT NULL DEFAULT 'bar' CHECK(category='bar'),
 FOREIGN KEY(id,code,category) REFERENCES Artikl(id,code,category) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE TABLE Dodatok (
 id INTEGER PRIMARY KEY,
 code INTEGER NOT NULL UNIQUE CHECK(code BETWEEN 200 AND 299),
 category TEXT NOT NULL DEFAULT 'addon' CHECK(category='addon'),
 FOREIGN KEY(id,code,category) REFERENCES Artikl(id,code,category) ON UPDATE CASCADE ON DELETE CASCADE
);
INSERT INTO Kujna SELECT id,code,category FROM Artikl WHERE category='kitchen';
INSERT INTO Shank SELECT id,code,category FROM Artikl WHERE category='bar';
INSERT INTO Dodatok SELECT id,code,category FROM Artikl WHERE category='addon';
-- Extras reference the addon subtype, rather than an arbitrary menu article.
CREATE TABLE DodatokNaStavka_new (
 id INTEGER PRIMARY KEY,
 order_item_id INTEGER NOT NULL REFERENCES StavkaNaNarachka(id) ON DELETE CASCADE,
 product_id INTEGER REFERENCES Dodatok(id),
 product_code INTEGER NOT NULL CHECK(product_code BETWEEN 200 AND 299),
 name_snapshot TEXT NOT NULL,
 unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor>=0),
 quantity_per_unit INTEGER NOT NULL CHECK(quantity_per_unit BETWEEN 1 AND 999)
);
INSERT INTO DodatokNaStavka_new SELECT * FROM DodatokNaStavka;
DROP TABLE DodatokNaStavka;
ALTER TABLE DodatokNaStavka_new RENAME TO DodatokNaStavka;
CREATE INDEX dodatok_stavka_idx ON DodatokNaStavka(order_item_id);
CREATE TRIGGER stavka_main_article_insert BEFORE INSERT ON StavkaNaNarachka
WHEN NEW.product_code NOT BETWEEN 501 AND 599 AND NEW.product_code NOT BETWEEN 800 AND 899 BEGIN
 SELECT RAISE(ABORT,'Order item code must be a kitchen or bar article');
END;
CREATE TRIGGER stavka_main_article_update BEFORE UPDATE OF product_code ON StavkaNaNarachka
WHEN NEW.product_code NOT BETWEEN 501 AND 599 AND NEW.product_code NOT BETWEEN 800 AND 899 BEGIN
 SELECT RAISE(ABORT,'Order item code must be a kitchen or bar article');
END;
CREATE TRIGGER artikl_create_subtype AFTER INSERT ON Artikl BEGIN
 INSERT INTO Kujna SELECT NEW.id,NEW.code,NEW.category WHERE NEW.category='kitchen';
 INSERT INTO Shank SELECT NEW.id,NEW.code,NEW.category WHERE NEW.category='bar';
 INSERT INTO Dodatok SELECT NEW.id,NEW.code,NEW.category WHERE NEW.category='addon';
END;
-- Category is the article's identity; deactivate an old article and add a new one to change it.
CREATE TRIGGER artikl_fixed_category BEFORE UPDATE OF category ON Artikl
WHEN NEW.category<>OLD.category BEGIN
 SELECT RAISE(ABORT,'Article category cannot change; deactivate and create another article');
END;
CREATE TRIGGER lice_staff_code_insert BEFORE INSERT ON Lice
WHEN NEW.role='waiter' AND (NEW.staff_code IS NULL OR NEW.staff_code NOT GLOB '0[0-9][0-9]' OR NEW.staff_code='000') BEGIN
 SELECT RAISE(ABORT,'Waiter code must be 001 through 099');
END;
CREATE TRIGGER lice_staff_code_update BEFORE UPDATE OF role,staff_code ON Lice
WHEN NEW.role='waiter' AND (NEW.staff_code IS NULL OR NEW.staff_code NOT GLOB '0[0-9][0-9]' OR NEW.staff_code='000') BEGIN
 SELECT RAISE(ABORT,'Waiter code must be 001 through 099');
END;
-- Readable joined catalogs for DBeaver; edits go through Artikl or the application.
CREATE VIEW KujnaPregled AS SELECT a.id,a.code AS shifra,a.name AS ime,a.price_minor AS cena_stotinki,a.active AS aktiven FROM Kujna k JOIN Artikl a ON a.id=k.id;
CREATE VIEW ShankPregled AS SELECT a.id,a.code AS shifra,a.name AS ime,a.price_minor AS cena_stotinki,a.active AS aktiven FROM Shank s JOIN Artikl a ON a.id=s.id;
CREATE VIEW DodatokPregled AS SELECT a.id,a.code AS shifra,a.name AS ime,a.price_minor AS cena_stotinki,a.active AS aktiven FROM Dodatok d JOIN Artikl a ON a.id=d.id;
