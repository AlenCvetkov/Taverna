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
- Direktorot ima pregled na masi, narachki i smetki, cenovnik i upravuvanje so korisnichki smetki/masi. Samo kelner dodava narachani redovi; kelner i menadzer evidentiraat naplata.
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

Tabelite sega go sledat dogovoreniot PER model. Celosniot pregled e vo [docs/PER-SCHEMA.md](docs/PER-SCHEMA.md).

- Lice, Kelner, Menager, Direktor: edna pozicija po lice, so nasledeni kluchevi.
- Article, Kujna, Shank, Dodatok: eden podtip po artikl i dogovorenite opsezi na shifri.
- Masa, Smetka, Narachka, DodatokNaNarachka i Naplata.
- Eksplicitni relacii: Izbira, Pristap, MenuvaDirektorMasa, Dodal, Pregled, MenuvaMasaNarachka, PovekjeNarachki, Prikazuva, ImaDodatok i SeOdnesuvaNaDodatok.

Narachka sega e **eden narachan artikl**. Smetka gi sobira site redovi na masata do naplata. Dodatocite se povrzani so konkretna Narachka i nivnata kolichina e po edinica na glavniot artikl. Site ceni vo bazata se celi MKD stotinki.

MasaPregled gi presmetuva SlobodnaZafatena i TekovnaCena. SmetkaPregled prikazhuva datum, vreme i traenje. Vo aplikacijata pregledot na smetkite e dostapen samo za menadzer/direktor. Pod sekoj narachan red kelnerite go gledaat imeto na kolegata shto go dodal. Najavata, slikite i latinichno/kirilichno prebaruvanje prodolzhuvaat da rabotat.

Vo DBeaver otvori **taverna.sqlite**, pritisni **F5**, pa Tables. Za dijagram selektiraj gi domenskite tabeli i otvori **View Diagram / ER Diagram**. Views sodrzhi MasaPregled, SmetkaPregled, NarachkaPregled i kataloshkite pregledi. Postoechkata PostgreSQL hospital_db e odvoena od aplikacijata.

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

## Мои маси / Сите маси

Над распоредот има две копчиња со број на маси. „Мои маси“ ги прикажува масите каде најавениот корисник има барем една активна, ненаплатена нарачка. „Сите маси“ ги прикажува сите активни маси, вклучувајќи слободни, за започнување нова нарачка. По наплата масата исчезнува од „Мои маси“. Ако два келнери имаат активни нарачки на иста маса, таа се појавува кај двајцата. Прикажаната сума е вкупната ненаплатена сума на масата. Изборот се памети по корисник во прелистувачот; при прва употреба се прикажуваат сите маси. Статусите и сопственоста се освежуваат преку постоечкото известување во живо.

Промена по commit `7215095`: додаден избор Мои маси / Сите маси, серверско определување на сопственоста од најавената сесија и проверки со два келнери и заедничка маса.

## Артикли: пребарување и слики

По commit `5c63052`: шифрите се помали и сиви; името и цената остануваат истакнати. За пребарување се користи исто правило во прелистувачот и серверот: латиница и кирилица, големи/мали букви, sh/ш, ch/ч, zh/ж и повторени букви. `espreso`, `espresso` и `еспресо` го наоѓаат „Еспресо“. Ова не е превод: различни зборови без заедничка транслитерација не се сметаат за исти.

Секој артикл има локална SVG илустрација, со посебни илустрации за почетните јадења, пијалаци и додатоци, и општа илустрација за нови артикли. Менаџерот/директорот во Ценовник може да избере „Смени слика“ и да прикачи PNG, JPEG, WebP или GIF до 1 MB. „Врати илустрација“ ја отстранува фотографијата. Фотографиите се локални податоци во Artikl.image_data, со image_version за освежување; не се испраќаат на надворешен сервис или GitHub. На друг компјутер се прикажуваат локалните илустрации додека не се внесат свои фотографии. Миграција 005 ги додава полињата еднаш при npm start, со зачувување на постоечките артикли и нарачки.

## PER миграција — по commit `530a302`

Миграцијата 006 го применува договорениот модел и автоматски прави SQLite backup со наставка `.before-per-...sqlite` покрај базата пред промената. Се зачувуваат сметките, хашираните лозинки, артиклите/сликите, количините, забелешките, историските цени и наплатите. Старите групи на нарачки се пренесуваат во нарачани редови во Narachka; Prakanje ги групира редовите од едно поднесување и спречува двојно зачувување. Старите наплатени нарачки се групираат во Smetka според масата и моментот на наплата. Ако историските суми не се совпаѓаат или наплатите се двосмислени, миграцијата се поништува.

Проверки: `node verify-schema.mjs` и `node verify-per.mjs`. Вториот тест проверува споделена маса, повеќе артикли, автор по ставка, датуми недостапни за келнер, M:N директор–маса, историски цени, паралелни нарачки, повторна наплата, релации и restart. Миграцијата дополнително е проверена врз копија од постоечката локална база.
