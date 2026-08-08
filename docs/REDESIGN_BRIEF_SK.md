# LightHouse UI redesign brief

Status: návrh na vizuálne schválenie pred implementáciou

Referenčný workflow: [Lightkey Tutorial](https://www.youtube.com/watch?v=2F3A58GI5vw)

## Cieľ

Kompletne prerobiť UI LightHouse tak, aby workflow aj vizuál čo najtesnejšie nasledovali Lightkey, ale aplikácia zostala označená ako LightHouse. Rozhranie bude v angličtine a primárne optimalizované pre 13-palcový MacBook.

Hlavným princípom je nezobrazovať všetko súčasne. Nový projekt vznikne cez povinného sprievodcu a hlavná pracovná plocha bude rozdelená na čisté režimy `Design` a `Live`. Posledný režim sa zapamätá v projekte; globálne rozloženie zbaliteľných panelov sa uloží v používateľských nastaveniach.

## Project Setup

Povinné poradie krokov:

1. Output
2. Fixtures & Patch
3. Stage Layout
4. Groups
5. Finish

Kroky sa nepreskakujú. `No DMX Output` je platná voľba v prvom kroku, aby sa dal projekt pripraviť bez hardvéru. Setup sa dá neskôr znova otvoriť.

Output umožní vybrať spôsob pripojenia. Pre aktuálne používané zariadenie musí budúca implementácia podporiť USB-DMX. Oficiálna stránka identifikuje zariadenie ako [DOREMiDi USB-C To DMX Cable, model UTD-11](https://www.doremidi.cn/h-pd-51.html). Ide o USB-C/DMX prevodník s DMX/RDM, nie Art-Net node. MVP Art-Net backend ho preto dnes nevie priamo ovládať.

Fixture knižnica bude používať drag & drop. Zobrazí výrobcov, modely, vyhľadávanie, DMX modes, jednoduché vysvetlenie režimov a možnosť pridať viac rovnakých kusov naraz. Custom fixture sa vytvára počas pridávania rovnako ako v referenčnom workflow.

Patch bude viditeľná 512-kanálová plocha. Používateľ pred potvrdením vidí výsledné adresy. Konflikt sa nepresunie automaticky; prekrytie sa zvýrazní červenou.

## Design workspace

- Stage zaberá približne 60–70 % obrazovky.
- Trvalo otvorený ľavý Object Panel sa odstráni.
- Trvalo otvorený pravý Inspector sa odstráni.
- Fixture knižnica sa ukáže iba pri pridávaní zariadení.
- Kliknutie na fixture zobrazí kontextové ovládanie v spodnej časti.
- Spodný panel sa zostaví podľa možností vybraného fixture.
- Stage podporuje floor-plan PNG/JPG, truss, stage, speaker, person, text a tvary.
- Zarovnávací nástroj pre MVP rovnomerne rozmiestni vybrané objekty.
- Fixture na Stage zobrazuje iba krátky názov.
- Stage bude vizualizovať smer, farbu, intenzitu a prekrytie lúčov; cieľom je postupne realistickejší náhľad.

Kontextové ovládače môžu zahŕňať Dimmer, RGB/RGBW/RGBA/RGBWA-UV color wheel, Shutter/Strobe, Pan/Tilt, Zoom, Gobo a Beam. Zobrazia sa iba podporované sekcie.

## Presets a Scenes

Nový návrh opäť zavádza presets:

- preset ukladá jeden alebo menšiu skupinu logických parametrov, napríklad `Red`, `Open Shutter` alebo `Center Stage`;
- scene ukladá výsledný svetelný obraz viacerých fixtures a parametrov;
- preset sa aplikuje na aktuálne vybrané fixtures;
- presets sa organizujú v stromovej knižnici a vlastných priečinkoch;
- presets sa dajú presunúť do Live plochy.

## Effects

- Galéria obsahuje všetky prakticky realizovateľné Lightkey-inšpirované šablóny.
- Výber šablóny funguje ako v referenčnom videu a pokračuje do jedného plného editora; samostatný jednoduchý/advanced režim nebude.
- Editor obsahuje farebné kroky, duration, step count, phase, delay, smoothness a fixture order.
- Stage môže efekt okamžite previewovať.
- Po zastavení sa fixtures vrátia do stavu pred efektom.
- Viac kompatibilných efektov sa môže kombinovať.
- Chase zostáva typom efektu a môže sa presunúť do Live plochy.

## Live workspace

- Stage zostáva viditeľný v hornej časti; nebude existovať celoobrazovkový režim iba s tlačidlami.
- Live plocha je upraviteľná snap-to-grid mriežka s presúvaním a resize.
- Scény, presets a efekty sa pridávajú drag & dropom.
- Zatiaľ existuje jedna Live stránka, ktorá môže obsahovať vizuálne skupiny.
- Button behavior je nastaviteľný ako Toggle, Flash/Hold, Push alebo Radio Group.
- Používateľ vyberá farbu tlačidla; aktívny stav a priebeh fade sú výrazne viditeľné.
- Tlačidlo môže mať klávesovú skratku.
- Grand Master je veľký vertikálny fader vľavo.
- Blackout je stále viditeľný hore.
- Editácia layoutu je chránená prepínačom `Edit Layout` / `Done`.
- Cue List a voľná Live plocha sa zatiaľ nezobrazujú súčasne.

## Tempo a integrácie

- Bez audio timeline a bez importu skladby.
- Ručné GO, Tap Tempo a mikrofónová beat detekcia zostávajú.
- Mikrofón generuje beat impulzy priamo pre efekty, zobrazuje confidence a pri nespoľahlivom výsledku sa vráti k pevnému BPM.
- Ableton, MIDI a OSC integrácie sa rozhodnú neskôr.

## Vizuálny jazyk

- Takmer čierne a grafitové plochy.
- Tenké separátory a minimum rámikov.
- Menej cyan/modrej systémovej farby.
- Farby pochádzajú predovšetkým z presets, scén, efektov a beam preview.
- Ikony s krátkymi textovými názvami.
- Žiadne zbytočné prechodové animácie.
- Hybrid natívneho macOS správania a kompaktného profesionálneho lighting-console UI.

## Mockupy v1

- [Project Setup](mockups/project-setup-v1.png)
- [Design workspace](mockups/design-workspace-v1.png)
- [Live workspace](mockups/live-workspace-v1.png)

Mockupy sú vizuálny smer, nie pixelovo presná implementačná špecifikácia. Text, spacing a komponenty sa po schválení prekreslia deterministicky v React/CSS/PixiJS.

## Otvorené rozhodnutia

1. Otvorenie podrobných Fixture Settings: dvojklik alebo viditeľné tlačidlo `Edit Fixture`.
2. Floor plan uzamknutý proti náhodnému posunutiu.
3. Voliteľný expert panel s raw DMX channel faders.
4. Presets ako prenosné logické hodnoty bez uloženého fixture výberu.
5. Kompletná ponuka fixture order pre effects.
6. Obsah samostatného druhého monitora.
7. Potvrdenie hybridného macOS/lighting-console vizuálneho štýlu.
