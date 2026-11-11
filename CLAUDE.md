# Sturmkrone - High-End Game Architecture Guidelines

## Core Performance Rules
- **Frame Budget:** Target 60 FPS (16.6ms) minimum.
- **Memory Management:** Mandatory `.dispose()` calls for all geometries, materials, textures, and render targets upon object destruction. Zero memory leaks permitted.
- **Garbage Collection:** Avoid instantiating new `Vector3`, `Matrix4`, or temporary objects inside the animation/render loop (`requestAnimationFrame`). Reuse pre-allocated module-scoped vectors.

## Graphic & Visual Standards
- **Post-Processing Stack:** ACESFilmicToneMapping, UnrealBloomPass, SSAO/GTAO, Depth of Field.
- **Shadow System:** Cascaded Shadow Maps (CSM) with soft shadow filtering (PCF / PCSS).
- **Asset Pipeline:** PBR Workflow (Albedo, Normal, Roughness, Metallic, AO).

## Code Quality & Architecture
- **Structure:** Decouple Physics, Input, Sound, and Render loops.
- **Physics Loop:** Fixed timestep update (60 Hz) decoupled from visual rendering frames.

> **Umsetzung im Code:**
> - Speicher: Objekte mit `disposeObject()` aus `src/render/dispose.ts` entfernen.
> - Geteilte Ressourcen (Caches, Modul-Konstanten, Toon-Materialien) mit `markShared()` kennzeichnen, damit sie nie freigegeben werden.
> - Kurzlebige Effekte holen ihre Netze über `sharedGeo()` aus `src/render/geoCache.ts`.
> - Feste Logikschleife: `src/core/loop.ts`, 60 Hz mit Akkumulator.
> - Figuren setzen ihre Position mit `Character.place()`; die Darstellung gleitet mit `Character.present(alpha)`.
> - Schiffe und Spielerfigur interpolieren über `prev`.
> - Licht und Bild:
>   - Kaskadierte Schatten: `src/render/csm.ts` mit dem three.js-CSM in `world/environment.ts`, aktiv ab `shadows.cascades ≥ 2`. Beleuchtete Materialien brauchen `ensureCsm()`; Kopien von Toon-Materialien entstehen mit `cloneToon()`.
>   - Umgebungsverdeckung: `src/render/gtao.ts`, ein `AoPass` in halber Auflösung plus `AoEffect`.
>   - Belichtung, Bloom-Schwelle und Vignette stehen in `RENDER_LOOK` in `data/qualityTiers.ts`.
> - Welt und Bewuchs:
>   - Weltgröße: `WORLD_SCALE` in `data/world.ts`. Handgebaute Länder (Form, Siedlungen, Bewuchs) stehen als Daten in `data/settlements.ts`.
>   - Gebäude kommen aus `world/architecture.ts` (immer mit Kollisions-Gitter), aufgestellt von `world/settlement.ts` oder `mount` in `world/islandDress.ts`.
>   - Bäume, Sträucher, Gras und Felsen laufen über `world/vegetation.ts` (`Scatter`, `InstancedMesh`), nicht als Einzelnetze. Wind für Instanzen: `WIND_VERTEX` in `render/wind.ts`.

> - Figuren (Stylized Realism): Oberflächen über `surface` am Toon-Material (`render/toon.ts`), fremde Bausteine über `toonChar()`. Figuren tragen keine Tusche-Konturen, sondern Fresnel-Randlicht (`CHARACTER_INK`); die Welt behält ihre Konturen.

> - Kampf-Systeme: Boss-Warnflächen `combat/zones.ts`, Beute-Säulen `combat/loot.ts` (Werte in `data/loot.ts`), Zonen-Ereignisse `world/events.ts`. Gegner eines Ereignisses tragen `tag` und zählen nicht für „Insel befreit“ (`campLeft`).

> **Abstimmung mit dem Briefing unten:** Diese Richtlinien gelten zusätzlich zum Projekt-Briefing. Der Anime-Stil (Toon-Material, Konturen an der Welt, Randlicht an Figuren) bleibt die Art Direction: PBR-Kanäle (Normal, Roughness, Metallic, AO) fließen in das Toon-Material ein, statt es zu ersetzen. Post-Effekte laufen weiter über `postprocessing` (pmndrs) mit den gleichwertigen Effekten (Bloom, AO, Tiefenunschärfe). Schwere Effekte (AO, CSM, PCSS, Tiefenunschärfe) gelten für High/Max; Handys auf Low/Mid haben Vorrang bei den 60 FPS.

---

# Sturmkrone 2.0 – Projekt-Briefing für Claude Code

Dieses Dokument ist die Grundlage für alle Arbeiten an Sturmkrone 2.0. Lies es zu Beginn jeder Sitzung. Die Datei `referenz/sturmkrone-1.0.html` enthält die bisherige Version als Einzeldatei (three.js r128). Sie dient als Referenz für Spielgefühl, Werte, Texte und Systeme – nicht als Code-Basis zum Weiterbauen.

## 1. Vision

Sturmkrone ist ein Anime-Piratenabenteuer für Browser auf Handy und PC. Man beginnt als Schiffsjunge (Pirat) oder Rekrut (Marine) auf einer kleinen Schaluppe und kämpft sich bis an die Spitze der Meere hoch – zu Fuß mit Faust, Klinge oder Faji-Kräften und auf See mit immer größeren Schiffen.

Das Spiel soll sich **nicht** wie eine leere Sandbox anfühlen, sondern handgemacht und lebendig: Orte mit Geschichte, Figuren mit Persönlichkeit, Musik, die zur Situation passt, und Effekte, die bei jedem Treffer Spaß machen.

Leitsätze:
- **Spaß in den ersten fünf Minuten.** Ein schneller, geführter Einstieg, danach Freiheit.
- **Jede Aktion fühlt sich gut an.** Trefferpausen, Kamerawackeln, Partikel, Sound – alles greift ineinander.
- **Schön auf jedem Gerät.** Vier Grafikstufen von Low bis Max, alle sehen stimmig aus.
- **Eigene Welt.** Alle Figuren, Namen, Kräfte und Designs sind eigene Schöpfungen. Keine Figuren, Symbole oder Markenzeichen aus bestehenden Animes, Mangas oder Spielen nachbauen.

Alle Texte im Spiel sind auf Deutsch.

## 2. Technik

- **Build:** Vite + TypeScript
- **3D:** three.js (feste, aktuelle Version in `package.json` pinnen)
- **Post-Processing:** `postprocessing` (pmndrs)
- **Modelle:** glTF/GLB, komprimiert mit Meshopt oder Draco; Texturen als KTX2, wo sinnvoll
- **Audio:** Web Audio API oder howler.js, Musik als OGG/MP3 in Schichten (siehe Abschnitt 9)
- **Daten:** Alle Inhalte (Fähigkeiten, Crew, Legenden, Schiffe, Gegner, Quests, Dialoge, Items) als JSON- oder TS-Datendateien, nicht im Code verstreut
- **Speichern:** localStorage mit mehreren Spielständen, Export/Import als Datei, Versionsnummer und Migration
- **Veröffentlichung:** Statischer Build, z. B. GitHub Pages, Netlify oder itch.io; als PWA installierbar
- **Eingabe:** Touch (virtueller Joystick + Buttons), Maus/Tastatur und Gamepad

### Ordnerstruktur (Vorschlag)

```
src/
  core/        Spielschleife, Zustände, Eingabe, Einstellungen, Speichern
  render/      Renderer, Qualitätsstufen, Materialien (Toon), Post-Effekte
  world/       Ozean, Himmel, Wetter, Tageszeit, Inseln, Regionen, Weltrand
  entities/    Spieler, NPCs, Gegner, Schiffe, Tiere
  combat/      Nahkampf, Fernkampf, Trefferlogik, Statuseffekte
  faji/        Skillbaum, Fähigkeiten, Effekte
  naval/       Segeln, Kanonen, Entern, Schiffsschäden
  story/       Quests, Dialoge, Kapitel, Rangliste
  ui/          HUD, Menüs, Charakter-Editor, Karte
  audio/       Musik-Engine, Soundeffekte, Mixer
  data/        JSON/TS-Inhaltsdaten
public/assets/ Modelle, Texturen, Audio
referenz/      sturmkrone-1.0.html
CREDITS.md     Herkunft und Lizenz jedes fremden Assets
```

### Assets und Lizenzen

- Bevorzugt kostenlose Assets unter CC0, zum Beispiel von Kenney oder Quaternius (stilisierte Figuren, Schiffe, Inselobjekte).
- Animationen können aus freien Paketen stammen oder retargetet werden. Prüfe bei jeder Quelle die Lizenzbedingungen.
- Jedes fremde Asset kommt mit Quelle, Autor und Lizenz in `CREDITS.md`. Assets ohne klare Lizenz werden nicht verwendet.
- Fremde Modelle bekommen unser eigenes Toon-Material, damit alles einheitlich im Anime-Stil aussieht.

## 3. Grafik und Art Direction

**Stil:** Anime-Cel-Shading, kräftige, aber harmonische Farben, klare Silhouetten, Tusche-Konturen.

- **Toon-Material:** 3-stufige Licht-Rampe, Randlicht (Rim Light), weiche Spekularflecken auf Haaren und Metall, Farbvarianten pro Fraktion
- **Konturen:** Inverted Hull auf Low/Mid; Kantenerkennung aus Tiefe und Normalen als Post-Effekt auf High/Max
- **Ozean:** Gerstner-Wellen mit mehreren Schichten, Gischt auf Wellenkämmen, türkises Flachwasser und Brandungsringe um Inseln, Kielwasser hinter Schiffen, stilisierte Spiegelung des Himmels
- **Himmel:** Farbverlauf mit Tageszeit, Sonne/Mond, gemalte Wolken in mehreren Ebenen, Sterne, Sonnenstrahlen durch Wolken (High/Max)
- **Tageszeit und Wetter:** Morgen, Tag, Abendrot, Nacht; Wetter: klar, bewölkt, Nebel, Regen, Sturm mit Blitzen und hohen Wellen
- **Weltrand:** Das Meer stürzt am Rand als riesiger Wasserfall in die Tiefe, mit Gischt, Nebel und Regenbogen. Eine unsichtbare Wand hält Schiffe kurz vor der Kante.
- **Effekte (sehr wichtig):** Anime-Trefferblitze, Schmier-Bögen bei Schwerthieben, Speedlines, Impact-Frames bei starken Treffern, Schockwellen, Bodenrisse, Elementarpartikel pro Faji-Art, Cut-in-Banner bei Ultimates, Schadenszahlen mit Stil

### Qualitätsstufen

Beim ersten Start automatisch eine passende Stufe wählen, im Menü jederzeit änderbar.

| Stufe | Für | Renderauflösung | Schatten | Post-Effekte | Sichtweite & Details |
|---|---|---|---|---|---|
| Low | schwache Handys | 0,75 × | keine | keine | kurz, wenige Partikel |
| Mid | normale Handys | 1 × | 1024, einfach | Bloom | mittel |
| High | gute Handys, PCs | bis 1,5 × | 2048, weich | Bloom, Konturen, Farbkorrektur, Sonnenstrahlen | weit, viele Partikel |
| Max | starke PCs | nativ bis 4K | 4096, kaskadiert | alles inkl. Tiefenunschärfe und Umgebungsverdeckung | sehr weit, maximale Dichte |

Leistungsziel: Mid läuft auf einem durchschnittlichen Handy flüssig mit 60 fps.

## 4. Charaktere

- Echte 3D-Figuren mit Skelett und Animationen statt Primitiv-Formen
- Animationen: Idle, Gehen, Rennen, Rolle, Kombo-Angriffe je Kampfstil, Treffer, Betäubt, K.o., Jubeln, Steuern am Ruder, Sitzen, Gesten für Dialoge
- **Charakter-Editor 2.0:** Fraktion, Kampfstil (und Klingenform), Körperbau, Gesicht, Augen, Frisur, Farben, Outfit, Kopfbedeckung, Accessoires (Narben, Ohrringe, Augenklappe), Mantel; Vorschau mit Drehen und Zoomen
- Ausrüstung ist sichtbar an der Figur (Waffen, Rüstung, Mantel)
- NPCs aus denselben Bausteinen, damit Städte vielfältig aussehen

## 5. Kampf zu Fuß

- Kamera mit Zielerfassung (Lock-on), leichter und schwerer Angriff, Ausweichrolle mit Unverwundbarkeit, Parade mit perfektem Timing
- Haltesystem (Poise): schwere Gegner taumeln erst nach genug Druck
- Gegnertypen: Matrose, Schildträger, Musketier (Fernkampf), Schläger, Faji-Wirker, Hauptmann, Legende; Bosse mit Phasen
- Kampfstile aus 1.0 bleiben und werden ausgebaut:
  - **Faustkämpfer:** schnelle Kombos, Uppercut, Luftkombos
  - **Schwertkämpfer:** Säbel, Langklinge, Zweihänder, Doppelklingen – jede mit eigenen Kombos
  - **Faji-Wirker:** Fernkampf-Geschosse, aufladbare Angriffe

## 6. Faji – das Kräftesystem

Faji ist die Kraft, aus der alle Fähigkeiten stammen. Es gibt drei Arten:

- **Geistiges Faji:** Aura und Willenskraft. Schüchtert ein, lähmt, lässt Schwache umfallen, stärkt die Crew.
- **Körper-Faji:** stärkt den Körper direkt in Angriff und Verteidigung.
- **Effekt-Faji:** formt Faji zu Elementen und Effekten (Feuer, Eis, Blitz, Sturm, Erde, Schatten, Licht, Schwerkraft, Gift, Flut, Meteore und mehr).

Dazu kommt **Schwertkunst** als eigener Zweig für Klingentechniken.

Ausbau gegenüber 1.0:
- Skillbaum als echte grafische Baumansicht mit Knoten, Verbindungen und Vorschau-Animation jeder Fähigkeit
- Mindestens 60 Fähigkeiten, davon viele mit Variante auf See
- Synergien zwischen Zweigen (z. B. Klinge + Flamme = brennende Hiebe; Körper + Erde = Felsenhaut)
- Faji-Erwachen: seltene Story-Momente, in denen eine neue Stufe einer Faji-Art erwacht, mit eigener Zwischensequenz
- Jede Faji-Art hat eine eigene Effektsprache (Farbe, Form, Klang)

Die Liste der 37 Fähigkeiten aus 1.0 steht in der Referenzdatei (Konstante `SKILLS`) und wird als Ausgangspunkt übernommen.

## 7. Schiffe und Seekampf

- Schiffsklassen aus 1.0 (Schaluppe bis Leviathan) als detaillierte Modelle mit Innendeck, Takelage, Laternen und Beschädigungszuständen (Löcher, zerrissene Segel, Feuer)
- Segeln mit Wind: Segelstellung, Rückenwind, Wenden
- Breitseiten mit sichtbarer Zielhilfe (wie in 1.0) plus manuelles Zielen am PC
- Munitionsarten: Kugeln, Kettenkugeln (Segel), Kartätschen (Crew), Brandkugeln
- Schadenszonen: Rumpf, Segel, Crew
- Nahtloses Entern: Enterhaken, Übergang aufs Feindschiff ohne Ladebildschirm
- Anpassung: Rumpffarbe, Segel, Flagge, Galionsfigur, Laternen
- Begleitschiffe ab höheren Rängen

## 8. Welt, Story und Leben

Die Welt besteht aus handgestalteten Regionen statt zufälligem Streumuster. Jede Region hat eine Hauptstadt mit NPCs, eigene Musik, Wahrzeichen, Nebenquests und einen regionalen Boss oder eine Legende.

Regionen (Vorschlag):
1. **Bernsteinsee** – tropisches Startmeer, Hafenstadt Ankerglück, Einstieg und erste Crew
2. **Nebelarchipel** – Nebel, versunkene Ruinen, Geisterschiffe bei Nacht
3. **Glutring** – Vulkaninseln, Schmiedestadt, Feuer-Faji
4. **Nordwacht** – kühle Kiefernküsten, große Marinefestung
5. **Sturmgürtel** – Dauersturm, Heimat der stärksten Legenden
6. **Schlundriff am Weltrand** – Endgame, der Tiefenschlund

Hauptgeschichte in Kapiteln rund um die legendäre Sturmkrone und den Ursprung des Faji, mit eigenen Abschnitten für Pirat und Marine.

Lebendigkeit:
- Städte mit Märkten, Tavernen, Werften, Schmieden, Faji-Schreinen; NPCs mit Tagesabläufen und Dialogen
- Fischerboote, Handelsschiffe, Patrouillen, Wale, Delfine, Möwen, Schildkröten
- Ereignisse auf See: Schiffbrüchige, Schatzkarten in Flaschen, Marineblockaden, Geisterschiff bei Nacht, Stürme
- Kleine Nebenbeschäftigungen, z. B. Angeln, Würfelspiel in der Taverne, Schatzsuche

## 9. Musik und Klang

- Eigener Soundtrack pro Region, plus Themen für Hafen, Kampf, Boss, Sieg und Menü
- **Adaptive Musik:** mehrere Schichten pro Stück (ruhig, Spannung, Kampf), die je nach Situation ein- und ausgeblendet werden
- Quellen: frei lizenzierte Musik (Lizenz prüfen und in `CREDITS.md` eintragen) oder in Auftrag gegeben; der prozedurale Shanty aus 1.0 kann als Notlösung bleiben
- Soundeffekte für jede Aktion, Umgebungsklang (Wellen, Wind, Möwen, Stadtlärm, Regen)
- Mixer im Menü: Musik, Effekte, Umgebung, Stimmen

## 10. Crew, Rangliste und Fortschritt

- **Crew:** alle 16 Mitglieder aus 1.0 und mehr. Jede Figur bekommt eine persönliche Quest, Loyalität, Sprüche an Deck, eine Rolle im Kampf (Tank, Heiler, Schaden) und eine Fähigkeit.
- **Rangliste:** die 20 Legenden aus 1.0 (10 Piraten, 10 Marine) bekommen Persönlichkeiten, eigene Schiffe, Auftritte mit Zwischensequenz, Revanchen und Sprüche. Die Liste verändert sich dynamisch.
- **Fortschritt:** Stufen, Ränge je Fraktion, Ruhm, Gold, Ausrüstung mit Seltenheiten, Schiffe, Kosmetik, Erfolge

## 11. Bedienung und Oberfläche

- Mobile zuerst: große Touch-Buttons, Hochformat und Querformat
- PC: Maus und Tastatur mit frei belegbaren Tasten, Gamepad-Unterstützung
- Menüs: Logbuch, Faji-Baum, Karte mit Regionen, Crew, Inventar, Rangliste, Einstellungen (Grafikstufe, Lautstärken, Textgröße, Steuerung)
- Gut lesbar bei Sonne am Handy, Barrierefreiheit (Textgröße, farbenblindfreundliche Markierungen)

## 12. Meilensteine

Jeder Meilenstein endet mit einer spielbaren, veröffentlichten Version und einer kurzen Liste, was neu ist.

0. **Fundament:** Projekt aufsetzen, Spielschleife, Eingabe, Speichern, Qualitätsstufen, Veröffentlichung auf einer Web-Adresse
1. **Grafik-Kern:** Toon-Material, Konturen, Ozean, Himmel, Tageszeit, Wetter, Weltrand, Post-Effekte
2. **Charaktere:** animierte Spielfigur, Charakter-Editor 2.0, NPC-Baukasten
3. **Kampf 2.0:** Kampfstile, Gegnertypen, Effekte
4. **Faji 2.0:** grafischer Skillbaum, Fähigkeiten, Synergien
5. **Schiffe 2.0:** Modelle, Segeln, Seekampf, Entern, Anpassung
6. **Welt 2.0:** Bernsteinsee komplett handgemacht mit Stadt, Quests und Leben; danach Region für Region
7. **Story, Crew und Rangliste:** Kapitel, Dialoge, Crew-Quests, Legenden
8. **Musik und Klang:** adaptive Musik, Effekte, Mixer
9. **Feinschliff:** Leistung, Balancing, Tutorial, Fehlerjagd, Release 2.0

## 13. Arbeitsregeln

- Vor größeren Schritten kurz den Plan zeigen und auf Zustimmung warten.
- Der Projektinhaber ist kein Programmierer: Schritte, die er selbst ausführen muss (z. B. etwas installieren oder ein Konto anlegen), einfach und vollständig erklären.
- Nach jeder Änderung testen: Hochformat am Handy und Desktop, alle vier Qualitätsstufen.
- Spielstände bleiben über Updates hinweg lesbar (Migration statt Löschen).
- Inhalte datengetrieben anlegen, damit neue Fähigkeiten, Crew und Quests ohne Codeumbau hinzukommen.
- Fremde Assets nur mit klarer Lizenz, immer in `CREDITS.md` eintragen.
