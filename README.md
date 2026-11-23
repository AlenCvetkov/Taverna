# Taverna POS

Lokalna aplikacija za ugostitelski objekt. Sekoj vraboten se najavuva so svoj Gmail/email, lozinka i uloga.

## Startuvanje

Vo terminalot na proektot izvrshi:

```sh
npm start
```

Otvori `http://localhost:4173` na kompjuterot. Potreben e Node.js 24.15 ili ponov.

## Prvo postavuvanje

Pri prvoto otvaranje kreiraj direktor so ime, Gmail/email i lozinka. Ne se proveruva formatot na email adresata ili dolzhinata na lozinkata, no polinjata ne mozat da bidat prazni. Potoa najavi se i vo **Korisnici** kreiraj posebni smetki za kelnerite i menadzerite.

## Otvaranje od telefon

1. Startuvaj ja aplikacijata na kompjuterot.
2. Kompjuterot i telefonot neka bidat na istata privatna Wi-Fi mreza.
3. Vo terminalot pobaraj ja adresata `Telefon na istata Wi-Fi mreza`, na primer `http://192.168.1.20:4173`.
4. Otvori ja taa adresa vo browserot na telefonot. Ako Windows pobara dozvola za firewall, dozvoli ja samo za privatni mrezi.

## Podatoci i dozvoli

- SQLite bazata se cuva vo `data/taverna.sqlite` na kompjuterot i se kreira avtomatski pri prvoto startuvanje.
- Narachkite, otvorenite masi i zatvorenite smetki ostanuvaat zachuvani i po restart na aplikacijata.
- Direktorot moze da kreira i iskluchuva korisnichki smetki. Kelnerot i menadzerot mozat da rabotat so masite; serverot gi proveruva nivnite dozvoli.
- Po restart na serverot, vrabotenite treba povtorno da se najavat.
- Ova e lokalna MVP verzija. LAN pristapot koristi HTTP, pa koristi ja samo na privatna, zashitena Wi-Fi mreza i ne ja izlozhuvaj direktno na internet. Pred komercijalna upotreba treba HTTPS, bekap i dopolnitelni operativni proverki.

## Tehnologii

Node.js, SQLite (`node:sqlite`) i HTML/CSS/JavaScript; nema eksterni npm paketi.
