# Договорен PER модел

Миграција: `migrations/006_per_schema.sql`, применета атомски преку `database-per.mjs`. PK означува примарен клуч, FK надворешен клуч. За прецизност, сите парични полиња се цели броеви во MKD стотинки: `9000` = `90 ден.`

## Ентитети

| Табела | Клучеви | Други полиња |
|---|---|---|
| Lice | LiceID PK | Ime, KorisnickoIme UNIQUE, Pozicija, Sol, LozinkaHash, Aktiven, KreiranNa, Sifra UNIQUE |
| Kelner | KelnerID PK/FK → Lice.LiceID | Pozicija='waiter' |
| Menager | MenagerID PK/FK → Lice.LiceID | Pozicija='manager' |
| Direktor | DirektorID PK/FK → Lice.LiceID | Pozicija='director' |
| Article | ArticleID PK | Sifra UNIQUE, Ime, Cena, Kategorija, Aktiven, Slika, SlikaVerzija |
| Kujna | ArticleID PK/FK → Article | Sifra 800–899, Kategorija='kitchen' |
| Shank | ArticleID PK/FK → Article | Sifra 501–599, Kategorija='bar' |
| Dodatok | ArticleID PK/FK → Article | Sifra 200–299, Kategorija='addon' |
| Masa | MasaID PK | Tip O/K/P, Broj 1–99, Aktivna; UNIQUE(Tip,Broj) |
| Smetka | SmetkaID PK, MasaID FK → Masa | Plateno, Otkazana, DatumVreme, NaplatenoNa, Vkupno |
| Narachka | NarachkaID PK; SmetkaID/MasaID FK → Smetka; KelnerID FK → Kelner; ArticleID FK → Article | BrojNaArtikli, Komentar, SifraPriNaracka, ImePriNaracka, CenaPriNaracka, DodadenoNa, Prakanje, RedenBroj |
| DodatokNaNarachka | DodatokNaNarachkaID PK; NarachkaID FK → Narachka; ArticleID FK → Dodatok | BrojPoEdinica, SifraPriNaracka, ImePriNaracka, CenaPriNaracka |
| Naplata | NaplataID PK; SmetkaID UNIQUE/FK → Smetka; PrimilLiceID FK → Lice | Iznos, DatumVreme |

`DodatokNaNarachkaID` е внатрешен идентификатор: овозможува две посебно додадени ставки со ист додаток, без автоматско спојување. `Prakanje` е техничкиот клуч на едно притискање „Заврши нарачка“, а не посебен ентитет. Комбинацијата Prakanje/RedenBroj е единствена.

Келнерската Sifra се чува како текст `001`–`099`, независно од KelnerID. Подтиповите се создаваат автоматски. Составните FK и CHECK ограничувања спречуваат едно лице да има две позиции или еден артикл две категории. Article ги чува заедничките име, цена и активност. Подоцнежна промена на ценовникот не ги менува снимките во нарачаните редови.

## Именувани релации

| Релација | Клучеви и кардиналност |
|---|---|
| Izbira | PK(KelnerID,MasaID), двата FK; Kelner N:M Masa |
| Pristap | PK(MenagerID,DirektorID,SmetkaID), сите FK; тернарна M:N:P |
| MenuvaDirektorMasa | PK(DirektorID,MasaID), двата FK; Direktor M:N Masa |
| Dodal | NarachkaID PK/FK, KelnerID FK; Kelner 1:N Narachka |
| Pregled | SmetkaID PK/FK, MasaID FK; Masa 1:N Smetka |
| MenuvaMasaNarachka | NarachkaID PK/FK, MasaID FK; Masa 1:N Narachka |
| PovekjeNarachki | NarachkaID PK/FK, SmetkaID FK; Smetka 1:N Narachka |
| Prikazuva | NarachkaID PK/FK, ArticleID FK; Article 1:N Narachka |
| ImaDodatok | DodatokNaNarachkaID PK/FK, NarachkaID FK; Narachka 1:N DodatokNaNarachka |
| SeOdnesuvaNaDodatok | DodatokNaNarachkaID PK/FK, ArticleID FK → Dodatok; Dodatok 1:N DodatokNaNarachka |

И 1:N релациите се експлицитни табели, по барањето за дијаграмот. Се создаваат автоматски со тригери. Составните FK ја проверуваат нивната согласност со ентитетите: нарачката не може да покажува на различна маса од сопствената сметка, ниту Dodal да наведува друг автор.

`Izbira` го евидентира изборот на маса и не ја зафаќа масата. „Мои маси“ се изведува од сопствените редови во отворените сметки, па масата може да се појави кај повеќе келнери. `MenuvaDirektorMasa` се пополнува при создавање/измена на маса од директор; историски измени за кои нема евиденција не се измислуваат.

`Pristap` ги поврзува постоечките менаџери, директори и сметки според тернарниот модел. Тоа не бара истовремено најавување на двајцата: апликацијата дозволува секој активен менаџер/директор самостојно да ги прегледува сметките. Ако сè уште нема менаџер, директорот има преглед преку својата улога. Нови административни сметки автоматски ги добиваат соодветните поврзувања.

## Изведени атрибути и однесување

- `MasaPregled.SlobodnaZafatena`: постои отворена сметка → Zafatena; инаку Slobodna.
- `MasaPregled.TekovnaCena`: збир од неплатените редови и нивните додатоци.
- `NarachkaPregled.Vkupno`: BrojNaArtikli × (CenaPriNaracka + збир на додатоци × BrojPoEdinica).
- `SmetkaPregled.TraenjeSekundi`: од отворањето до наплатата, или до тековниот момент додека е отворена.

Една маса има повеќе сметки низ времето и најмногу една отворена сметка во моментот. Ставките, додатоците, релациите и сумата се зачувуваат во една трансакција. Наплатата ја затвора сметката и ја ослободува масата; редовите се задржуваат. Затворените редови и ценовните снимки се заштитени од измена. Секој нарачан ред има автор преземен од најавената сесија. Само келнер додава редови; менаџерот има преглед/ценовник/наплата, директорот преглед/ценовник/корисници/маси.

## DBeaver

Поврзи го локалниот `data/taverna.sqlite`. По миграцијата избери ја конекцијата и F5. Под Tables се сите ентитети и именувани релации; под Views се изведените атрибути. Селектирај ги доменските табели и отвори ER Diagram за FK врските. `Arhiva_*` ги содржат записите од првото издание и не се дел од тековниот модел. При директни SQL измени користи `PRAGMA foreign_keys=ON` во таа конекција.

Пред миграцијата автоматски се создава SQLite backup покрај базата. Базите, резервните копии, лозинките и локалните фотографии не се пуштаат на GitHub. Достапни проверки: `node verify-schema.mjs` и `node verify-per.mjs`.
