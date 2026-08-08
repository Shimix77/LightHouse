# LightHouse MVP — schválené rozhodnutia

**Stav:** schválené pre implementačný baseline
**Dátum:** 2026-08-08

Tento dokument zaznamenáva produktové rozhodnutia prijaté po architektonickom návrhu. Pri rozpore s otvorenou alternatívou v hlavnom dokumente má tento záznam prednosť.

## Technologický smer

- Core a Show Engine: Rust.
- Desktop shell: Tauri 2.
- UI: React + TypeScript.
- Stage renderer: PixiJS/WebGL s DOM overlayom.
- macOS je prvá hotová platforma. Windows sa realizuje až po dokončení macOS aplikácie, ale core, kontrakty a output adaptéry nesmú byť viazané na macOS.
- Cieľový referenčný scale je 100–300 fixtures a 4–16 aktívnych universes. Doménový model nemá pevný limit universes.

## Procesy a spoľahlivosť

- Show Engine beží ako samostatný proces a DMX pokračuje aj pri freeze alebo páde UI.
- Pri strate UI je default `hold last look`; používateľ môže per project nastaviť timeout a blackout policy.
- Grand Master a Blackout majú vyššiu prioritu než všetky show vrstvy.
- Inštalátor, code signing a notarizácia sa riešia až na konci MVP. Aplikácia je dovtedy určená na interné použitie.

## Stage Editor

- Hlavný interaction surface je 2D pôdorys v reálnych metroch.
- Podklad podporuje PNG a JPG, position/scale/opacity/lock.
- MVP preview je „B+“: symbol fixture, intensity, color, smer a približná šírka/priesvitná plocha lúča.
- MVP neobsahuje fotorealistické tiene, presné gobá ani plný 3D visualizer.
- Podporované editácie: drag/drop, zoom, pan, rectangle/multi-select, rotation, resize, clipboard, undo/redo, grid, layers a locks.

## Scenes a Cue List

- Samostatne spúšťané partial scenes sú primárny MVP workflow.
- Jednoduchý cue list s `GO/BACK/PAUSE` je tiež súčasť MVP a pripravuje cestu k hudobným lightshows.
- Pri konflikte scén používa každý parameter LTP: posledná aktivovaná scéna, ktorá ho obsahuje, vyhrá aj pri intensity.
- Parameter, ktorý nová partial scene neobsahuje, zostáva z predchádzajúcej/nižšej vrstvy.
- Deaktivácia scény odkryje predchádzajúcu vrstvu, voliteľne s fade.
- Presets/palettes nie sú používateľskou MVP funkciou.

## Effects, chase a fanning

- Chase je typ efektu; MVP nemá samostatný Sequence Editor.
- Effects Engine je parameter-based a podporuje speed, amplitude, offset, direction, fixture order, spatial phase, beat multiplier a deterministic random seed.
- MVP šablóny: Pulse, Sine Wave, Chase, Fill, Random Flicker, Sparkle, Two-Color Chase, Rainbow, Color Wave, Random Color, Pan Sweep, Tilt Bounce, Circle, Figure Eight a Fire/Candle Flicker.
- Jednoduchý fanning je MVP pre pan/tilt, intensity, color a zoom.
- Fanning je statická undoable editácia; efekt je časovo meniaci sa modulátor.

## Tempo a audio analýza

- Spoločný BeatClock podporuje fixed BPM, Tap Tempo a vybraný audio input.
- Vlastná mikrofónová/audio beat analýza je MVP funkcia.
- Audio Analyzer je oddelený od kritického DMX loopu a publikuje BPM, phase/onset a confidence.
- UI zobrazuje BPM, beat indikátor, confidence a vždy umožní korekciu cez Tap Tempo.
- MIDI Clock, Ableton Link a timecode sú neskoršie zdroje toho istého BeatClocku.

## Live workflow

- MVP obsahuje EDIT/LIVE, Blackout, Grand Master, Blind a Freeze.
- MVP obsahuje používateľsky konfigurovateľný Live Control Panel.
- Druhý monitor/multi-window Live workflow je MVP.
- MIDI controller a MIDI feedback prídu neskôr.

## Fixture Library

- Aplikácia obsahuje základné generic profily a predpripravený offline fixture pack, aby sa custom fixture používal čo najmenej.
- Zdrojom MVP packu je presne označený snapshot Open Fixture Library.
- OFL JSON sa pri builde/importovaní konvertuje do kanonického `FixtureDefinition IR`; nepoužíva sa priamo za behu.
- Každý profil prejde schema a semantic validátorom. Kriticky chybné profily sa nevydajú, warnings ostávajú viditeľné.
- Projekt embeduje presnú použitú definition revision, takže aktualizácia knižnice nemení existujúcu show potichu.
- Custom Fixture Editor je MVP a podporuje manufacturer/model/modes, channels, ranges, 8/16-bit bindingy, defaults, pan/tilt invert a capability mapping.
- Importovaný profil sa upravuje cez `Clone as Custom`; pôvodný balík je immutable.
- GDTF importer je plánovaný po stabilizácii interného fixture modelu.
- Pixel/multi-beam fixtures sa v prvej verzii ovládajú ako jeden celok; detailný pixel editor je Future.

## MVP implementačné rezy

1. **MVP 0 — Engine:** headless domain, resolver, Art-Net, Virtual DMX, fake clock, timing a crash tests.
2. **MVP 1A — Controller:** fixture pack/editor, patch, Stage, groups, scenes, persistence/recovery, Blackout.
3. **MVP 1B — Show:** cue list, effects/chase, fanning, Live panel, Blind, Freeze a druhý monitor.
4. **MVP 1C — Beat:** Tap Tempo, audio input, mikrofónová beat analýza a effect synchronization.

## Odložené funkcie

- Windows packaging do dokončenia macOS aplikácie.
- MIDI, MIDI feedback, OSC a Stream Deck.
- sACN a USB-DMX output adapters.
- GDTF/MVR, RDM a DMX-In.
- Individuálny pixel/multi-beam editor.
- Fotorealistický 3D visualizer.
