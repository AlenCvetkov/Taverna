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
| `users` | Korisnici, uloga, scrypt sol i hash, aktivnost, sifra na kelner |
| `dining_tables` | Tip i broj na masa, edinstvena kombinacija |
| `products` | Jadenja, pijalaci i dodatoci; sifra, tip, cena i aktivnost |
| `orders` | Masa, kelner, status, vkupna suma, vreme i kluch za sprechuvanje duplo zacuvuvanje |
| `order_items` | Redovi na narachka, kolichina, zabeleshka i cenovna snimka |
| `order_item_addons` | Dodatoci vrzani za konkreten red i cenovna snimka |
| `payments` | Naplata, iznos, vreme i vraboten shto ja evidentiral |
| `schema_migrations` | Verzii na izvrsheni promeni na shemata i inicijalnite smetki |

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

## Proverki i ogranicuvanja

- JavaScript sintaksata e proverena so `node --check`.
- Sveza SQLite baza e startuvana so migraciite; se provereni tabelite, pochetniot raspored i hash-iranjeto na primer-smetkite.
- Narachkite i pregledot se za lokalna rabota/LAN. Za produkcija so oddaleni lokacii treba centralna databaza, HTTPS, bekap i dopolnitelna bezbednosna proverka.
