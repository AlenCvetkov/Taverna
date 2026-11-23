# Taverna POS

Lokalna web-aplikacija za restoran: najava na vraboteni, raspored na masi, vnes na narachki, dodatoci, cenovnik i naplata. Raboti na kompjuter, tablet i telefon.

Proektot e izgraden so postoechkata tehnologija: Node.js 24.15+, `node:sqlite`, i obichen HTML/CSS/JavaScript. Nema eksterni npm paketi ili poseben databazen server.

## Startuvanje

1. Instaliraj Node.js 24.15 ili ponov.
2. Vo GitHub Desktop napravi **Open in Terminal** za repo-papkata.
3. Kopiraj `.env.example` vo `.env` i vnesi lokalni vrednosti ako sakash da gi podesish smetkite za primer.
4. Startuvaj so:

   ```powershell
   npm start
   ```

5. Na kompjuterot otvori [http://localhost:4175](http://localhost:4175).

Podrazbiranata baza e `data/taverna.sqlite`. `PORT` i `SQLITE_PATH` mozat da se promenat preku `.env`. SQLite ne koristi databazno korisnichko ime ili lozinka. Podatocite vo `data/` i `.env` se lokalni i ignorirani od Git.

## Prva najava i smetki

Najavata bara samo korisnichko ime i lozinka. Ako bazata nema korisnici, se pojavuva prvichno postavuvanje za direktor — isto so korisnichko ime i lozinka; prikazhnoto ime se postavuva od korisnichkoto ime.

Po zelba, cetirite primer-smetki mozat da se kreiraat/azhuriraat ednash so lokalni environment promenlivi. Vo `.env` postavi gi site cetiri vrednosti:

```env
SEED_KELNER1_PASSWORD=
SEED_KELNER2_PASSWORD=
SEED_MENADZER_PASSWORD=
SEED_DIREKTOR_PASSWORD=
```

Popolni gi praznite vrednosti so lozinkite shto gi dogovoril sopstvenikot na instalacijata. Koga se vneseni site cetiri, pri sledniot start migracijata ednash gi kreira ili azhurira primer-smetkite, pa potoa ne gi menuva. Lozinkite se hash-iraat so `scrypt`; ne se zapisani vo izvorniot kod ili GitHub.

| Uloga | Korisnichko ime | Sifra |
|---|---|---|
| Kelner | `kelner1` | `001` |
| Kelner | `kelner2` | `002` |
| Menadzer | `menadzer` | — |
| Direktor | `direktor` | — |

Smetkite se vo lokalnata databaza. GitHub ja prenesuva aplikacijata, ne SQLite fajlot ili korisnichkite zapisi. Za povekje kompjuteri da rabotat so isti smetki i narachki, site treba da se povrzat na zaednichka server-baza.

## Rabota vo aplikacijata

### Kelner

- Po najava vednash se prikazhuvaat masite.
- Slobodna masa e zelena; zafatena masa e crvena.
- Klik na slobodna masa otvora nova narachka. Klik na zafatena prikazhuva aktivnite narachki i dava opcija za nova.
- Artikli se prebaruvaat po shifra ili ime. Strelicki gore/dolu i Enter rabotat za izbor; kopcheto **Dodadi** e pogodeno za dopir.
- Sekoj red na narachka e oddelen i ima kolichina, kratka zabeleshka, dodatoci i brishenje.
- Dodatokot e vrzan za konkretna stavka i se presmetuva po edinica na glavniot artikl.
- **Zavrshi narachka** ja zachuvuva smetkata, a **Naplati i oslobodi masa** e oddelno dejstvo.
- Naednash najaveni kelneri gi gledaat osvezhenite sostojbi na masite.
- Gore desno, vo menito so tri tochki, ima **Log Out**.

### Menadzer i direktor

- Menadzerot ima pregled, masi/narachki i cenovnik.
- Direktorot ima istite funkcii i upravuvanje so korisnichki smetki.
- Menadzer/direktor moze da dodava masi i da dodava, menuva ili deaktivira artikli.

## Masi i cenovnik

Pochetniot raspored e O1, O2, K1, K2 i P1. Tipovite O, K i P se dozvoleni so broj 1–99; vo bazata tipot i brojot se koloni, so edinstvenost na kombinacijata.

Primer-artikli se:

- Kujna: sifri 800–899.
- Shank: sifri 501–599.
- Dodatoci: sifri 200–299.

Prikazhnite ceni se vo denari. Bazata gi cuva kako celi parichni stotinki. Istoriskite narachki ja zadrzhuvaat sifrata, imeto i cenata od momentot koga bile vneseni. Deaktiviran artikl ne se nudi vo novi narachki.

## Databaza i DBeaver

Lokalniot SQLite fajl e `data/taverna.sqlite`. Vo DBeaver izberi **New Database Connection → SQLite**, pa za Database/File izberi toj fajl. Ako SQLite drajverot nedostiga, dozvoli DBeaver Driver Manager da go instalira. Refresh hireshijata za da se pojavat tabelite.

Tabelite:

| Tabela | Znachење |
|---|---|
| `Lice` | Korisnici, ime, najava, uloga, aktivnost; `staff_code` za kelner e tekst 001–099 (tri cifri), so edinstvenost i DB trigger validacija |
| `Artikl` | Zaednichka osnovna tabela: `id`, `code`, `name`, `category`, `price_minor`, `active` |
| `Kujna` | Jadenja: `id` povrzan so Artikl, edinstvena `code` 800–899 |
| `Shank` | Pijalaci: `id` povrzan so Artikl, edinstvena `code` 501–599 |
| `Dodatok` | Dodatoci: `id` povrzan so Artikl, edinstvena `code` 200–299 |
| `Masa` | `table_type` O/K/P, `table_number` 1–99; edinstvena kombinacija, prikaz kako O1 |
| `Narachka` | `table_id` → Masa, `waiter_id` → Lice, vreme, status, `total_minor`, `paid_at`, idempotency key |
| `StavkaNaNarachka` | `order_id` → Narachka, `product_id` → Artikl, reden broj, kolichina, zachuvani ime/cena/shifra, zabeleshka |
| `DodatokNaStavka` | `order_item_id` → StavkaNaNarachka, `product_id` → Dodatok, kolichina po edinica i zachuvani ime/cena/shifra |
| `Naplata` | Masa, vraboten shto naplatil, iznos i vreme |
| `schema_migrations` | Izvrsheni migracii |

**ID i shifra se razlichni.** Na primer, artiklot so vnatreshno `id=1` mozhe da ima `code=800`; kelner so `id=1` ima `staff_code='001'`. Relaciite koristat ID, a kelnerot gi gleda shifrite. O1, K1 i P1 imaat razlichni ID-a.

Imeto, cenata i aktivnosta za Kujna/Shank/Dodatok se zachuvani ednash vo Artikl. Podtipovite avtomatski se popolnuvaat so trigger pri dodavanje artikl preku aplikacijata ili vo Artikl. Za pregled so site polinja, vo DBeaver otvori **Views → KujnaPregled / ShankPregled / DodatokPregled**. Tie prikazhuvaat `id`, `shifra`, `ime`, `cena_stotinki`, `aktiven`. Za ceni vo denari:

```sql
SELECT id, shifra, ime, cena_stotinki / 100.0 AS cena_MKD, aktiven
FROM KujnaPregled;
```

Cenite/iminjata/aktivnosta se menuvaat vo **Cenovnik** vo aplikacijata ili vo Artikl. Pri direktno menuvaње vo DBeaver vkluchi SQLite foreign-key enforcement; aplikacijata go vkluchuva na sekoja konekcija. Kategorijata ne se menuva na postoechki artikl; deaktiviraj go i kreiraj nov. Starite podatoci se zachuvani vo `Arhiva_*` tabelite i ne se koristat za novi narachki.

Po migracijata vo DBeaver selektiraj **taverna.sqlite** i pritisni **F5**. Stari otvoreni tabovi so angliski iminja zatvori gi i otvori gi novite tabeli.

SQLite stranskite kluchevi i CHECK/UNIQUE ogranichuvanjata validiraat relacii, opsezi, kolichini i sifri. Narachkata, stavkite, dodatocite i vkupnata suma se zachuvuvaat vo transakcija. Serverot sam ja presmetuva sumata.

Vo DBeaver postoeshe i aktivna PostgreSQL konekcija `localhost:5432/hospital_db`, no nejzinata `public` schema nemashe tabeli. Ne e doprena; aplikacijata koristi SQLite za da ostane vo tehnologijata na postoechkiot proekt.

## Telefon i lokalna mreza

1. Kompjuterot i telefonot neka bidat na istata Wi-Fi mreza.
2. Startuvaj `npm start` na kompjuterot i ostavi go terminalot da raboti.
3. Vo terminalot najdi ja adresata shto pocnuva so `Telefon:` i otvori ja na telefonot, na primer `http://10.0.0.15:4175`.

Ne koristi `localhost` na telefonot: toa se odnesuva na samiot telefon. Ako LAN-linkot ne raboti, dozvoli Node.js vo Windows Firewall na privatnata mreza i proveri dali telefonot e na istata mreza. IP-adresata moze da se smeni, pa koristi ja tekovnata adresa od terminalot.

## Migracii

Serverot gi primenuva migraciite ednash po verzija pri startuvanje:

1. `migrations/001_initial_schema.sql` — osnovni tabeli, ogranicuvanja i indeksi.
2. `migrations/002_add_order_indexes.sql` — indeksi za stavki, dodatoci i naplati.
3. Migracija verzija 3 vo `server.mjs` — ednokratno kreiranje/azhuriranje primer-smetki od lokalni `.env` vrednosti.

4. `migrations/004_named_restaurant_schema.sql` — preimenuvanje na domenskite tabeli, Kujna/Shank/Dodatok podtipovi, validacija na kelnerski shifri, kataloshki views i zachuvuvanje na istorijata; se primenuva atomski preku `database-schema.mjs`. Verzija 3 za smetkite mozhe da se izvrshi podocna ako `.env` ne bil popolnet.

Starata SQLite data-file e ignorirana od Git. Ako se kopira proektot na drug kompjuter, migraciite se izvrshuvaat nad negovata lokalna baza.

## Git commit hronologija

Slednive tocki ja belezhat rabotata vo redosledot vo koj e commit-irana:

| Commit | Shto e napraveno |
|---|---|
| `d3094d5` — Add Taverna POS MVP | Prv Node.js/SQLite MVP: najava i ulogi, ekran za masi, narachki i naplata, pregled za menadzer/direktor i korisnichki smetki. |
| `0060293` — Add account menu with logout | Dodadeno meni so tri tochki gore desno i **Log Out**. |
| `e361338` — Build transactional restaurant ordering workflow | POS preraboten so SQLite migracii, artikli i dodatoci, cenovni snimki, narachki vo transakcii, naplata, masi O/K/P, SSE osvezhuvanje i mobilna narachka. |
| `a32caef` — Use an available default local port | Podrazbiranata porta e promeneta na 4175 za da se izbegne sudirot na 4173. |
| `d360aa2` — Simplify first-run account setup | Prvichnoto postavuvanje e skrateno na korisnichko ime i lozinka; prikazhnoto ime se postavuva od korisnichkoto ime. |
| `a1a2ccf` — Configure demo staff accounts from local environment | Dodadeni `.env` promenlivi i kod za bezbedno lokalno podesuvanje primer-smetki, bez lozinki vo Git. |
| `d2bd8ae` — Seed demo accounts from local environment once | Primer-smetkite se kreiraat/azhuriraat ednash od `.env`, so hash-irani lozinki. |
| Named restaurant schema (ovaa promena) | Lice, Kujna, Shank, Dodatok, Masa, Narachka, StavkaNaNarachka, DodatokNaStavka; Artikl i Naplata; migracija so zachuvani podatoci, DB validacija na 001–099 i DBeaver pregledi. |

## Proverki i ogranicuvanja

- JavaScript sintaksata e proverena so `node --check`.
- Sveza SQLite baza e startuvana so migraciite; se provereni tabelite, pochetniot raspored i hash-iranjeto na primer-smetkite.
- Narachkite i pregledot se za lokalna rabota/LAN. Za produkcija so oddaleni lokacii treba centralna databaza, HTTPS, bekap i dopolnitelna bezbednosna proverka.

Proverka na imenovanata shema: `node verify-schema.mjs`. Koristi posebna privremena baza i port 4199; proveruva svezi migracii, najava, narachka so dodatok i suma, dvojno prakjanje, naplata, restart i nedozvoleni shifri. Lokalnata postoechka baza e proverena so sporedba na site redovi pred/po migracijata i `PRAGMA foreign_key_check` / `integrity_check`.
