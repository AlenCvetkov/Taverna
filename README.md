# Taverna POS

Lokalna aplikacija za kelnerski narachki, meni, naplata i pregled na masi. Proektot prodolzhuva so Node.js i vgradeniot SQLite od postoechkiot kod; nema npm zavisnosti ili poseben server za bazata.

## Startuvanje

Potreben e Node.js 24.15 ili ponov.

1. Kopiraj `.env.example` vo `.env` (ne stavaj tajni podatoci vo Git).
2. Vo terminal otvori ja papkata na proektot i izvrshi `npm start`.
3. Otvori http://localhost:4173.

`PORT` i `SQLITE_PATH` se podesuvaat vo `.env`. SQLite nema korisnichko ime ili lozinka. Podrazbiranata baza e `data/taverna.sqlite`; papkata `data` e ignorirana od Git.

## Najava

Vo postoechkata lokalna baza se podgotveni smetkite:

| Uloga | Korisnichko ime | Lozinka |
|---|---|---|
| Kelner | `kelner1` | Lozinkata e dadena zasebno vo razgovorot |
| Kelner | `kelner2` | Lozinkata e dadena zasebno vo razgovorot |
| Menadzer | `menadzer` | Lozinkata e dadena zasebno vo razgovorot |
| Direktor | `direktor` | Lozinkata e dadena zasebno vo razgovorot |

Smetkite se vo lokalnata SQLite baza; lozinkite se hash-irani i ne se vklucheni vo Git.

## Funkcii

- Kelnerot po najava vednash go gleda rasporedot na masite. Slobodnite se zeleni, zafatenite crveni.
- Pochetni masi: O1, O2, K1, K2 i P1. Menaџer/direktor moze da dodava tip O/K/P so broj 1–99.
- Prebaruvanje na jadenja i pijalaci po shifra ili ime, izbor so strelicki/Enter ili dopir, kolichini, zabeleshki i povekje posebni redovi.
- Dodatoci se vrzani za konkretna stavka i se presmetuvaat po glaven artikl.
- Zavrshena narachka se zapishuva transakciski; naplatata e oddelna i ja osloboduva masata.
- SSE gi osvezhuva masite kaj najavenite korisnici.
- Direktorot upravuva so smetki; menadzerot i direktorot imaat pregled i cenovnik.
- Tri tochki gore desno sodrzhat **Log Out**.
- Interfejsot e prilagoden za desktop, tablet i telefon.

## Baza i DBeaver

Vo DBeaver napravi nova SQLite konekcija i za database file izberi `data/taverna.sqlite` od korenot na proektot. Ako SQLite drajverot ne e instaliran vo DBeaver, dozvoli mu na DBeaver da go prezeme od Driver Manager. Napravi refresh za da gi vidish tabelite.

Tabeli: `users`, `dining_tables`, `products`, `orders`, `order_items`, `order_item_addons`, `payments` i `schema_migrations`. Relaciite se so strani kluchevi; se proveruvaat opsezite na shifrite, tipovite, kolichinite i edinstvenosta na masite. Ceni se zapishuvaat vo stotinki kako celi broevi. Stavkite i dodatocite cuvaat snimka od shifra, ime i cena za istorijata.

Pri startuvanje se izvrshuva osnovnata schema i migraciite vo `migrations/` ednash po verzija. Pochetni primeri: 5 masi, 4 jadenja, 4 pijalaci, 3 dodatoci. Primer cenite se vo denari.

## Promena na meni i masi

Menaџerot i direktorot vo **Cenovnik** dodavaat, menuvaat ili deaktiviraat artikli. Shifri: kujna 800–899, shank 501–599, dodatoci 200–299. Deaktiviran artikl ne se nudi za nova narachka, a starite narachki go zadrzhuvaat zacuvaniot opis i cena. Na ekranot **Masi i narachki** dodadi O/K/P masa so broj 1–99; duplikatite se odbivaat.

## Telefon

Startuvaj ja aplikacijata na kompjuterot i otvori ja prikazhanata LAN adresa (primer `http://192.168.1.20:4173`) na telefon shto e na istata Wi-Fi mreza. Windows Firewall moze da pobara dozvola za privatnata mreza.

## Proverki i pretpostavki

- Vo DBeaver ima aktivna PostgreSQL konekcija `localhost:5432/hospital_db`; javnata schema vo nea e prazna. Aplikacijata sepak koristi SQLite, bidejki postoechkiot kod vekje go koristi i e lokalna odvoena baza za Taverna. PostgreSQL konekcijata ne e doprena.
- Lozinkite se hash-iraat so scrypt; najavata koristi korisnichko ime. Narachkite se vrzuvaat so korisnik od sesijata.
- Serverot ja presmetuva cenata od aktivnite artikli i ja zachuvuva so cenovnite snimki vo edna transakcija.
- Napraveni se sintaksni proverki za JavaScript i proverka na SQLite shemata/pochetni podatoci. Okolinata ja blokirashe HTTP loopback proverката; aplikacijata startuva na slobodna porta.

Pred javno komercijalno objavuvanje treba HTTPS i plan za bekap.
