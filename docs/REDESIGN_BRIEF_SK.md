# LightHouse UI redesign brief

Status: návrh na vizuálne schválenie pred implementáciou

Referenčný workflow: [Lightkey Tutorial](https://www.youtube.com/watch?v=2F3A58GI5vw)

## Cieľ

Kompletne prerobiť UI LightHouse tak, aby workflow aj vizuál čo najtesnejšie nasledovali Lightkey, ale aplikácia zostala označená ako LightHouse. Rozhranie bude v angličtine a primárne optimalizované pre 13-palcový MacBook.

Hlavným princípom je nezobrazovať všetko súčasne. Nový projekt vznikne cez povinného sprievodcu a hlavná pracovná plocha bude rozdelená na čisté režimy `Design` a `Live`. Posledný režim sa zapamätá v projekte; globálne rozloženie zbaliteľných panelov sa uloží v používateľských nastaveniach.

## Project Browser

Úvodná obrazovka sa vizuálne aj rozložením približuje referenčnému Lightkey Project Browseru, ale používa vlastnú identitu LightHouse:

- hore je značka LightHouse a náhľad aplikácie;
- odkazy na User Guide a stav offline Fixture Library;
- dole sú `Recent Projects`, veľká karta `New Project` a `Demo Projects`;
- projekt sa otvorí dvojklikom a po otvorení obnoví naposledy použitý workspace;
- inštalátor ani licenčná obrazovka sa v tejto fáze neriešia.

## Project Setup

Povinné poradie krokov:

1. Output
2. Fixtures & Patch
3. Stage Layout
4. Groups
5. Finish

Kroky sa nepreskakujú. `No DMX Output` je platná voľba v prvom kroku, aby sa dal projekt pripraviť bez hardvéru. Setup sa dá neskôr znova otvoriť.

Output umožní vybrať spôsob pripojenia. Pre aktuálne používané zariadenie musí budúca implementácia podporiť USB-DMX. Oficiálna stránka identifikuje zariadenie ako [DOREMiDi USB-C To DMX Cable, model UTD-11](https://www.doremidi.cn/h-pd-51.html). Ide o USB-C/DMX prevodník s DMX/RDM, nie Art-Net node. MVP Art-Net backend ho preto dnes nevie priamo ovládať. Pred prvým fyzickým testom s pripojeným UTD-11 si aplikácia aj vývojový postup vyžiadajú výslovné potvrdenie používateľa.

Fixture Manager preberá osvedčený mentálny model Lightkey, potvrdený v [Lightkey User Guide](https://lightkeyapp.com/media/pages/help/manual/0def2c007d-1779439202/Lightkey%20User%20Guide.pdf):

- ľavý stĺpec obsahuje výrobcov a `Generic`, pravý stĺpec profily vybraného výrobcu;
- spolu zobrazuje zabudované, importované aj používateľské Custom Profiles;
- vyhľadáva podľa výrobcu/modelu a filtruje podľa typu, obľúbených profilov a počtu kanálov;
- dvojklik na profil zobrazí podrobnosti;
- profil sa drag & dropom presunie priamo na prvú požadovanú adresu v DMX mriežke;
- pred potvrdením sa vyberie presný DMX mode, množstvo a krátky názov;
- custom fixture sa vytvára priamo z tohto workflow a jeho kanály sa zatrieďujú do logických rodín `Intensity`, `Color`, `Position`, `Beam`, `Gobo`, `Shutter/Strobe` a `Control`.

Patch bude viditeľná 512-kanálová plocha. Používateľ pred potvrdením vidí výsledné adresy. Konflikt sa nepresunie automaticky; prekrytie sa zvýrazní červenou.

Fixture Manager je zámerne svetlý natívny macOS workspace kvôli čitateľnosti 512 malých buniek a dlhých zoznamov. Design a Live zostávajú tmavé pre prácu v réžii.

## Design workspace

- Stage zaberá približne 60–70 % obrazovky.
- Trvalo otvorený ľavý Object Panel sa odstráni.
- Trvalo otvorený pravý Inspector sa odstráni.
- Fixture knižnica sa ukáže iba pri pridávaní zariadení.
- Kliknutie na fixture zobrazí kontextové ovládanie v spodnej časti.
- Dvojklik na fixture otvorí jeho podrobné nastavenia.
- Spodný panel sa zostaví podľa možností vybraného fixture.
- Stage podporuje floor-plan PNG/JPG, truss, stage, speaker, person, text a tvary.
- Floor-plan je po vložení predvolene uzamknutý proti náhodnému posunutiu.
- Stage ponúka prepínanie `Front` / `Top`; projekt si pamätá poslednú orientáciu.
- Zarovnávací nástroj pre MVP rovnomerne rozmiestni vybrané objekty.
- Fixture na Stage zobrazuje iba krátky názov.
- Stage bude vizualizovať smer, farbu, intenzitu a prekrytie lúčov; cieľom je postupne realistickejší náhľad.

Kontextové ovládače môžu zahŕňať Dimmer, RGB/RGBW/RGBA/RGBWA-UV color wheel, Shutter/Strobe, Pan/Tilt, Zoom, Gobo a Beam. Zobrazia sa iba podporované sekcie. Voliteľná záložka `Raw DMX` poskytne expertom priamy náhľad hodnôt, ale aj jej zmeny sa preložia na command/parameter override; UI nebude zapisovať do DMX output bufferu.

## Presets a Scenes

Nový návrh opäť zavádza presets. Správanie vychádza z kapitoly 9 oficiálneho Lightkey User Guide:

- preset ukladá ľubovoľnú čiastkovú kombináciu logických parametrov pre sadu fixtures, napríklad iba `Red`, iba `Center Stage`, alebo Color + Position;
- vlastnosť, ktorú preset neobsahuje, nemení; efekty v presete zostávajú editovateľné;
- scene ukladá výsledný svetelný obraz viacerých fixtures a parametrov;
- klik na preset ho aktivuje a zobrazí ovplyvnené parametre pri fixtures; opätovná toggle akcia ho deaktivuje;
- preset si predvolene pamätá cieľové fixtures ako Lightkey, ale `Apply to Selection` ho vie použiť na aktuálne vybrané kompatibilné fixtures;
- presets sa organizujú v zbaliteľnom stromovom zozname; skupiny môžu obsahovať presets, effects a vnorené skupiny;
- preset možno vytvoriť z aktuálnych overrides, ako prázdny preset alebo ako snapshot všetkých fixtures;
- editácia jedného presetu aktualizuje všetky cues, ktoré ho používajú;
- presets sa dajú presunúť do Live plochy.

Prekrývanie bude deterministické po jednotlivých parametroch: z aktívnych scenes vyhrá naposledy aktivovaná scene, nad ňou neskôr aktivovaný preset a najvyššiu prioritu má dočasný manuálny override. Blackout a Grand Master sa aplikujú bezpečnostne až na konci bez zmeny uložených stavov.

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
- Voliteľné druhé okno/monitor v MVP zobrazuje Stage, Live tlačidlá, Master, Blackout, BPM a stav enginu bez editačných panelov.

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
- Aktívny look môže jemne zafarbiť Stage a Live plochu, ale text a globálne bezpečnostné prvky si zachovajú konštantný kontrast.

## Mockupy v1

- [Project Setup](mockups/project-setup-v1.png)
- [Design workspace](mockups/design-workspace-v1.png)
- [Live workspace](mockups/live-workspace-v1.png)

Mockupy sú vizuálny smer, nie pixelovo presná implementačná špecifikácia. Text, spacing a komponenty sa po schválení prekreslia deterministicky v React/CSS/PixiJS.

## Mockupy v2 – smer podľa dodaných screenshotov

- [Project Browser](mockups/startup-screen-v2.png)
- [Fixture Manager](mockups/fixture-manager-v2.png)
- [Design workspace](mockups/design-workspace-v2.png)
- [Live workspace](mockups/live-workspace-v2.png)

Mockupy v2 nahrádzajú vizuálny smer v1. Pri implementácii sa nekopíruje značka ani assety Lightkey; preberá sa overená informačná architektúra, workflow a hustota profesionálneho macOS ovládača.

## Uzavreté rozhodnutia

1. Fixture Settings sa otvárajú dvojklikom.
2. Floor plan je po vložení uzamknutý.
3. Expert `Raw DMX` panel bude dostupný.
4. Presets sú fixture-aware a zároveň majú `Apply to Selection`.
5. Effects podporia všetky dohodnuté fixture orders vrátane vlastného poradia.
6. Druhý monitor použije zjednodušený Live pohľad.
7. Vizuál je hybrid natívneho macOS a profesionálneho lighting console.
8. Stage sa prepína medzi Front a Top pohľadom.
