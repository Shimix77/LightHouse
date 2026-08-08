# LightHouse – používateľský návod

Tento návod je určený pre prvé spustenie aplikácie LightHouse na macOS. Prevedie vás od prázdneho projektu až po prvú svetelnú scénu a jednoduchý cue list.

> Bezpečný začiatok: pred pripojením reálnych svetiel nastavte `GRAND MASTER` na 0 %. Najprv skontrolujte patch a až potom intenzitu pomaly zvýšte. Tlačidlo `BLACKOUT` okamžite zníži intenzitu všetkých svetiel na nulu.

## Čo znamenajú základné pojmy

- **Fixture** – jedno svetlo alebo iné DMX zariadenie.
- **DMX mode** – režim svetla, ktorý určuje počet a význam jeho DMX kanálov. Režim v LightHouse musí byť rovnaký ako režim nastavený priamo na svetle.
- **Universe** – sada 512 DMX kanálov.
- **Patch** – priradenie svetla ku konkrétnemu universe a počiatočnej DMX adrese.
- **Scene** – uložený svetelný obraz, napríklad „Modrá scéna“ alebo „Kapela – refrén“.
- **Cue list** – scény zoradené v poradí, v akom ich počas predstavenia spúšťate tlačidlom `GO`.
- **Effect** – automatická zmena parametrov v čase, napríklad chase, pulse alebo vlna zľava doprava.

## Rýchly štart: prvá scéna

### 1. Vytvorte projekt

1. Otvorte LightHouse.
2. Kliknite na názov projektu vľavo hore.
3. Vyberte `New Project` alebo stlačte `Cmd+N`.
4. Zvoľte názov a miesto uloženia súboru `.lightshow`.

LightHouse ukladá zmeny priebežne. `Save As…` (`Shift+Cmd+S`) vytvorí samostatnú kópiu projektu.

### 2. Nastavte Art-Net výstup

Ak zatiaľ nemáte pripojený Art-Net/DMX prevodník, tento krok môžete preskočiť a show si pripraviť bez neho.

1. Zostaňte v režime `EDIT`.
2. Kliknite na stav `Art-Net` v hornej lište.
3. Pri `U1` zapnite `Output enabled`.
4. Do `Destination IP : port` zadajte IP adresu Art-Net uzla, napríklad `192.168.1.50:6454`.
5. `Port-address 0` predstavuje prvý Art-Net universe. Druhý je 1, tretí 2 atď.
6. `Interface` nechajte prázdne, ak macOS nemá viac aktívnych sieťových pripojení.
7. Kliknite `Apply & restart output`.

Mac aj Art-Net uzol musia byť v kompatibilnej IP sieti. Ak uzol používa adresu `2.x.x.x`, nastavte ethernetovému adaptéru Macu adresu v rovnakej sieti. Presné nastavenie závisí od konkrétneho uzla.

Úspešný výstup spoznáte podľa rastúceho počtu `Frames sent` a hodnoty `Send errors = 0`. Počet odoslaných UDP paketov sám osebe nepotvrdzuje, že ich fyzický uzol prijal, preto skontrolujte aj jeho stavové kontrolky alebo webové rozhranie.

### 3. Pridajte svetlo

1. Skontrolujte, že hore svieti režim `EDIT`.
2. V ľavom paneli otvorte kartu `Fixtures`.
3. Kliknite na `+` vedľa vyhľadávania.
4. Vyhľadajte výrobcu alebo model.
5. Vyberte presný `DMX mode`, ktorý máte nastavený na fyzickom svetle.
6. Voliteľne zadajte vlastný názov, napríklad `Front Left PAR`.
7. Kliknite `Add & Auto-patch`.

Aplikácia vyberie prvú voľnú DMX adresu. Adresa sa zobrazuje pri svetle vľavo vo formáte napríklad `U1 · 17`.

Ak profil nenájdete, použite `Create Custom Fixture`. Podľa manuálu svetla pridajte kanály a priraďte im logické funkcie, napríklad:

- dimmer → `intensity`
- červená → `color.red`
- zelená → `color.green`
- modrá → `color.blue`
- pan → `position.pan`
- tilt → `position.tilt`
- zoom → `beam.zoom`

### 4. Skontrolujte patch

1. Kliknite na svetlo v ľavom zozname alebo na 2D ploche.
2. Úplne dole v pravom inšpektore nájdete `PATCH`.
3. Skontrolujte `Universe` a `Address`.
4. Ak ich zmeníte, potvrďte tlačidlom `APPLY`.
5. Ďalší universe pridáte cez `+ UNIVERSE`.

Fyzické svetlo musí mať nastavenú rovnakú počiatočnú adresu aj rovnaký DMX mode. Dve svetlá s rôznymi funkciami sa nesmú v rovnakom universe prekrývať, pokiaľ ich zámerne nechcete ovládať spoločne na tej istej adrese.

### 5. Usporiadajte 2D Stage

- Svetlo vyberiete kliknutím a presuniete ťahaním myšou.
- Viac svetiel vyberiete podržaním `Shift` alebo obdĺžnikovým výberom.
- Kolieskom približujete a odďaľujete; plochu môžete posúvať nástrojom Pan.
- `SNAP` zapína prichytávanie k mriežke.
- PNG alebo JPG pôdorys pridáte cez `ADD FLOOR PLAN` v hornej lište nad Stage.
- Karty `Objects` a `Layers` vľavo slúžia na vizuálne objekty a organizáciu. Stage objekty neposielajú DMX.

## Ovládanie svetiel

Vyberte jedno alebo viac svetiel. V pravom inšpektore sa zobrazia dostupné ovládače:

- `Intensity / Dimmer` – jas,
- `Color` – farba,
- `Pan` a `Tilt` – poloha moving headu,
- `Zoom` – šírka lúča,
- `Fixture Channels` – ďalšie funkcie konkrétneho profilu.

Ak je vybraných viac svetiel, zmena sa aplikuje na celý výber. Skupinu vytvoríte tak, že vyberiete svetlá, vľavo otvoríte `Groups` a stlačíte `+`.

## Scény a cue list

### Uloženie scény

1. Nastavte požadovaný svetelný obraz.
2. Dole otvorte `SCENES`.
3. Rozhodnite, čo sa má uložiť:
   - ak sú vybrané konkrétne svetlá, vytvorí sa **partial scene** iba pre ne;
   - ak nie je vybrané žiadne svetlo, uložia sa všetky svetlá.
4. Kliknite `Capture Scene` alebo `+ SCENE`.
5. Zadajte názov a `Default fade` v sekundách.
6. Potvrďte `Capture Scene`.

Kliknutím na dlaždicu scény ju okamžite aktivujete. Pri súbehu scén platí pravidlo „posledná scéna vyhrá“ pre parametre, ktoré daná scéna obsahuje.

### Cue list

1. Pri každej scéne kliknite `+ CUE`.
2. Otvorte kartu `CUE LIST` a skontrolujte poradie.
3. `GO` spustí nasledujúci cue, `BACK` sa vráti o krok a `Ⅱ` prechod pozastaví.

### Live panel

Pri scéne kliknite `+ LIVE`. V karte `LIVE PANEL` vznikne veľké tlačidlo vhodné na priame spúšťanie počas show. Tlačidlo `LIVE WINDOW` hore otvorí samostatné okno, ktoré môžete presunúť na druhý monitor.

## EDIT a LIVE

- `EDIT` slúži na pridávanie svetiel, patch, úpravu scén a prípravu show.
- `LIVE` zamkne rizikové štrukturálne zmeny. Počas predstavenia používajte Live Panel alebo Cue List.
- `GRAND MASTER` násobí celkovú intenzitu výstupu.
- `BLACKOUT` okamžite nastaví intenzity na nulu. Opätovným kliknutím sa vrátite k predchádzajúcemu výstupu.
- `FREEZE` podrží aktuálny výstup, kým pripravujete ďalšie zmeny.
- `BLIND` umožňuje meniť hodnoty bez okamžitého odoslania na živý výstup. `COMMIT` ich odošle, `CLEAR` ich zahodí.

## Efekty, chase a tempo

1. Vyberte svetlá, na ktorých má efekt bežať. Bez výberu sa použijú všetky vhodné svetlá.
2. Otvorte dole kartu `EFFECTS`.
3. Kliknite `+ EFFECT`.
4. Vyberte šablónu, parameter, rýchlosť, amplitúdu a prípadne `Beat sync`.
5. Uložte efekt a spustite ho kliknutím na jeho riadok.

Chase je jeden z typov efektu. Svetlá sa zapínajú postupne v poradí. Pri priestorových efektoch sa môže použiť ich X/Y poloha z 2D Stage, napríklad vlna zľava doprava.

`FAN` rozdelí rozsah hodnôt medzi vybrané svetlá. Príklad: pri piatich moving headoch rozloží Pan zľava doprava tak, aby netrafili všetky na jedno miesto.

Tempo nastavíte tromi spôsobmi:

- zadaním BPM,
- opakovaným klikaním `TAP` do rytmu,
- tlačidlom `MIC`, ktoré po povolení mikrofónu odhaduje beat prehrávanej hudby.

## Klávesové skratky

| Skratka | Funkcia |
|---|---|
| `Cmd+N` | nový projekt |
| `Cmd+O` | otvoriť projekt |
| `Shift+Cmd+S` | uložiť kópiu |
| `Cmd+Z` / `Shift+Cmd+Z` | späť / znova |
| `Cmd+C` / `Cmd+V` | kopírovať / vložiť |
| `Cmd+D` | duplikovať výber |
| `Delete` | odstrániť výber |
| `Shift+B` | Blackout |

## Keď svetlo nereaguje

Skontrolujte postupne:

1. Nie je aktívny `BLACKOUT` a `GRAND MASTER` je vyššie ako 0 %.
2. Intenzita vybraného svetla je vyššie ako 0 %.
3. Fyzické svetlo má správny DMX mode a adresu.
4. Svetlo je patchnuté do universe, ktorý má zapnutý Art-Net output.
5. Destination IP smeruje na správny Art-Net uzol a používa port `6454`.
6. Mac a Art-Net uzol sú v kompatibilnej sieti a macOS firewall alebo Wi-Fi neblokuje komunikáciu.
7. V Art-Net diagnostike rastie `Frames sent` a `Send errors` ostáva 0.
8. Art-Net port-address v LightHouse zodpovedá universe nastavenému na uzle.

## Ukladanie a obnova

Projekt sa ukladá automaticky pri štrukturálnych zmenách. Pri prepise vzniká aj záložný súbor `.bak`. Ak sa hlavný projekt poškodí, LightHouse sa pokúsi načítať overenú zálohu a zobrazí informáciu o obnove.

Podrobné technické informácie sú v [architektonickej dokumentácii](architecture/ARCHITECTURE.md).
