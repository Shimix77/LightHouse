# LightHouse – používateľský návod

Tento návod opisuje aktuálnu macOS MVP verziu LightHouse: od vytvorenia projektu cez patch svetiel až po spustenie show v režime Live.

> Bezpečný začiatok: pred povolením fyzického DMX výstupu nastavte `MASTER` na 0 % alebo zapnite `BLACKOUT`. Najprv skontrolujte DMX mode a adresy svetiel, až potom pomaly zvýšte intenzitu.

## Základné pojmy

- **Fixture** – jedno svetlo alebo iné DMX zariadenie.
- **DMX mode** – režim svetla určujúci počet a význam jeho kanálov. Musí byť rovnaký v LightHouse aj na fyzickom svetle.
- **Universe** – 512 DMX kanálov.
- **Patch** – priradenie fixture ku konkrétnemu universe a počiatočnej adrese.
- **Scene** – uložený svetelný obraz. Môže obsahovať všetky alebo iba vybrané parametre.
- **Cue list** – scény zoradené na postupné spúšťanie tlačidlom `GO`.
- **Effect** – časová zmena parametrov, napríklad chase, pulse alebo priestorová vlna.

## Prvé spustenie a vytvorenie projektu

Po otvorení aplikácie sa zobrazí `Project Browser` s naposledy použitými projektmi.

1. Dvojklikom otvorte existujúci projekt alebo kliknite na dlaždicu `New Project`.
2. Zadajte názov a vyberte miesto pre súbor `.lightshow`.
3. Prejdite päť krokov sprievodcu `Project Setup`: `Output`, `Fixtures & Patch`, `Stage Layout`, `Groups`, `Finish`.
4. Kliknite na `Open Design Workspace`.

LightHouse si pamätá posledný projekt a zmeny ukladá automaticky. Projektový súbor je verzovaný a pri ukladaní vzniká aj záloha `.bak`.

## Project Setup krok za krokom

### 1. Output

Vyberte jeden spôsob pripojenia:

- `USB-DMX` – priamy FTDI kábel, napríklad DOREMiDi UTD-11,
- `Art-Net` – DMX uzol pripojený cez sieť,
- `No Output` – bezpečná príprava show bez fyzického výstupu.

Pri `USB-DMX` aplikácia zobrazí nájdené zariadenie. Detekcia je iba na čítanie: v tomto kroku sa žiadne DMX dáta neposielajú. Kábel sa do projektu uloží so zakázaným výstupom a aktivuje sa až neskôr v `Output Settings`.

Na macOS môže byť DOREMiDi zobrazené napríklad ako `FTDI USB-DMX / Serial Interface — /dev/cu.usbserial-…`. Jeden USB-DMX kábel obsluhuje jeden universe.

Pri `Art-Net` zadajte cieľovú IP adresu a port, štandardne `6454`. Mac aj Art-Net uzol musia byť v kompatibilnej IP sieti.

### 2. Fixtures & Patch

Fixture Manager je rozdelený podobne ako v Lightkey:

- vľavo je vyhľadávanie, zoznam výrobcov a dostupné profily,
- vpravo je vizuálna mriežka všetkých 512 kanálov zvoleného universe.

Postup pridania svetiel:

1. Vyhľadajte výrobcu a model.
2. Vyberte presný `DMX mode` nastavený na fyzickom svetle.
3. Zadajte krátky názov, počet kusov, universe a počiatočnú adresu.
4. Kliknite `Find Free`, ak má aplikácia automaticky nájsť prvý voľný súvislý blok.
5. Skontrolujte farebný náhľad obsadených kanálov a kliknite `Patch`.

Adresný konflikt sa označí červenou a patch nemožno potvrdiť, kým ho neopravíte. Pri viacerých kusoch sa adresy prideľujú za sebou podľa veľkosti zvoleného DMX mode.

Ak profil nenájdete, otvorte `Custom Profiles`. Podľa manuálu svetla vytvorte mode a priraďte význam každému kanálu, napríklad:

- dimmer → `intensity`,
- red/green/blue → `color.red`, `color.green`, `color.blue`,
- pan/tilt → `position.pan`, `position.tilt`,
- zoom → `beam.zoom`.

### 3. Stage Layout

Vyberte `Front View` alebo `Top View`. Voliteľne pridajte PNG/JPG obrázok pôdorysu; aplikácia ho použije ako zamknuté pozadie. Orientáciu môžete neskôr prepínať aj priamo v pracovnom priestore.

### 4. Groups

Pomenujte skupinu a vyberte fixtures, ktoré do nej patria, napríklad `Front Wash` alebo `Moving Heads`. Skupiny uľahčujú spoločný výber, ovládanie a aplikovanie efektov.

### 5. Finish

Skontrolujte súhrn výstupu, patchnutých kanálov, Stage a skupín. `Open Design Workspace` otvorí hlavný pracovný priestor.

## Design Workspace

Hlavná plocha má tri časti:

- uprostred je interaktívny 2D Stage,
- vpravo je paleta `Colors`, `Positions`, `Scenes`, `Effects` a `Fixture Groups`,
- dole sa prepína `Fixture Controls` a `Scenes · Cues · Effects`.

Fixture vyberiete kliknutím. Dvojklik otvorí jeho detailné nastavenia. Viac fixtures vyberiete so `Shift` alebo obdĺžnikovým výberom. Vybrané objekty možno presúvať, kopírovať, duplikovať a odstrániť; Stage podporuje zoom, pan, mriežku, vrstvy a undo/redo.

PNG/JPG pôdorys je iba orientačné pozadie a neposiela DMX. Fixture na Stage a jeho patch zdieľajú rovnaké ID, ale poloha na Stage nemení DMX adresu.

### Ovládanie fixture

V `Fixture Controls` sa podľa profilu zobrazia logické parametre:

- `Intensity` – jas,
- `Color` – farba,
- `Pan` a `Tilt` – smer moving headu,
- `Zoom` – šírka lúča,
- ďalšie funkcie konkrétneho fixture profilu.

UI mení iba tieto logické parametre. DMX engine ich samostatne prekladá na fyzické kanály.

## Scény, cues a effects

V spodnom paneli vyberte `Scenes · Cues · Effects`.

### Scene

1. Nastavte požadovaný svetelný obraz.
2. Vyberte fixtures pre partial scénu alebo výber zrušte, ak chcete uložiť celý stav.
3. Kliknite `+ Scene`, zadajte názov a `Default fade`.
4. Scénu aktivujte kliknutím na jej dlaždicu.

Pri súbehu scén platí pre uložené parametre pravidlo „posledná scéna vyhrá“.

### Cue list

Pridajte scény do cue listu a určte ich poradie. `GO` spustí nasledujúci cue, `BACK` sa vráti a `PAUSE` pozastaví prebiehajúci prechod.

### Effects, chase a fanning

Vyberte fixtures, zvoľte šablónu efektu, parameter, rýchlosť, amplitúdu a prípadnú synchronizáciu na beat. Chase je typ efektu, ktorý aktivuje svetlá postupne. Priestorové efekty používajú X/Y polohu fixture zo Stage, napríklad na vlnu zľava doprava.

Fanning rovnomerne rozloží hodnoty medzi vybrané fixtures. Príklad: piatim moving headom rozdelí Pan tak, aby nemierili všetky na rovnaké miesto.

Tempo možno zadať ako BPM, opakovane vyklikať cez `TAP` alebo načítať cez `MIC`. Pri prvom použití mikrofónu macOS požiada o povolenie; LightHouse potom generuje beat impulzy z analyzovaného zvuku.

## Live Workspace

Prepínačom hore prejdite z `Design` do `Live`. Naľavo je `MASTER`, tempo, `TAP` a `MIC`; uprostred je Live plocha a napravo prehľad skratiek.

### Úprava Live tlačidiel

1. Kliknite `Edit`.
2. Vyberte tlačidlo a presuňte ho ťahaním.
3. Jeho veľkosť upravte ktorýmkoľvek z ôsmich modrých bodov po obvode.
4. Nastavte vlastnú farbu a správanie `Toggle`, `Flash`, `Push` alebo `Radio`.
5. Kliknite `Done`, čím sa rozloženie zamkne proti náhodným úpravám.

Tlačidlá sa prichytávajú k mriežke, neprekrývajú sa a ich poloha aj veľkosť sa ukladajú do projektu. Tlačidlo `▣` v hornej lište otvorí Live panel v samostatnom okne pre druhý monitor.

Správanie tlačidiel:

- `Toggle` – prvé stlačenie zapne, druhé vypne,
- `Flash` – aktivuje obsah iba počas držania,
- `Push` – vykoná jednorazový príkaz,
- `Radio` – aktivuje jedno tlačidlo z rovnakej skupiny a vypne ostatné.

## Bezpečnostné ovládanie

- `MASTER` násobí celkovú intenzitu výstupu.
- `BLACKOUT` okamžite zníži intenzity na nulu; ďalším stlačením obnoví predchádzajúci stav.
- `FREEZE` podrží aktuálny výstup počas prípravy ďalších zmien.
- `BLIND` umožňuje pripraviť zmeny bez ich okamžitého odoslania; následne ich možno potvrdiť alebo zahodiť.

DMX output beží oddelene od UI. Dočasné zamrznutie okna preto nezastaví aktuálne odosielaný svetelný stav.

## Zapnutie fyzického výstupu

1. Nastavte `MASTER` na 0 % alebo zapnite `BLACKOUT`.
2. Kliknite na ikonu `⌁` vpravo hore (`Output Settings`).
3. Pre každý universe vyberte `Art-Net`, `USB-DMX (FTDI)` alebo `No output`.
4. Pri USB vyberte detegovaný kábel a zapnite output. Pri Art-Net zadajte destination a port-address.
5. Kliknite na použitie nastavení.
6. Pri USB aplikácia ešte raz upozorní, že fyzické svetlá môžu okamžite zmeniť stav. Pokračujte iba po kontrole patchu.

LightHouse používa pre FTDI/Open-DMX USB pripojenie 250000 baud, 8N2 a samostatné DMX Break/MAB časovanie. Art-Net aj USB sú samostatné output adaptéry; show engine nie je viazaný na konkrétny transport.

## Klávesové skratky pre úpravu Stage

| Skratka | Funkcia |
|---|---|
| `Cmd+Z` / `Shift+Cmd+Z` | späť / znova |
| `Cmd+C` / `Cmd+V` | kopírovať / vložiť |
| `Cmd+D` | duplikovať výber |
| `Delete` | odstrániť výber |
| `Shift+B` | Blackout |

## Keď svetlo nereaguje

Najprv skontrolujte spoločné príčiny:

1. `BLACKOUT` nie je aktívny a `MASTER` je vyššie ako 0 %.
2. Fixture má intenzitu vyššiu ako 0 %.
3. Fyzické svetlo má rovnaký DMX mode a počiatočnú adresu ako projekt.
4. Fixture je patchnuté do správneho universe a output je zapnutý.

Pri USB-DMX navyše skontrolujte:

5. Zvolený je správny `/dev/cu.usbserial-…` port a kábel nie je otvorený inou aplikáciou.
6. Kábel vedie z konektora `DMX OUT` do vstupu prvého svetla a DMX reťazec je správne ukončený.

Pri Art-Net navyše skontrolujte:

5. Destination IP a UDP port `6454` smerujú na správny uzol.
6. Mac a uzol sú v kompatibilnej sieti a firewall komunikáciu neblokuje.
7. Art-Net port-address v LightHouse zodpovedá universe nastavenému na uzle.

## Ukladanie, obnova a projektové menu

Kliknutím na názov projektu vľavo hore otvoríte menu s položkami `Project Browser`, `Project Setup…`, `Manage Fixtures…`, `Open Project…` a `Save As…`.

Projekt sa ukladá automaticky pri štrukturálnych zmenách. Pri prepise vzniká záložný súbor `.bak`; pri poškodení hlavného súboru sa LightHouse pokúsi obnoviť overenú zálohu.

Podrobnosti pre vývojárov sú v [architektonickej dokumentácii](architecture/ARCHITECTURE.md).
