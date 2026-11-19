# Andocken und Entern: technische Bestandsaufnahme (Stand 2.9.86)

> **Umgesetzt in 2.9.89** (siehe `CHANGELOG.md` und `CLAUDE.md`): `CompositeGround`, Liegeplätze mit Überhang-Regel, Gangway, Strickleiter am Ufer, Entern mit Planken und Leitern, Laufwege für Offiziere und Trupps. Die Abschnitte unten beschreiben den Ausgangszustand von 2.9.86 (`groundProxy`, Versetzen per `foot.place`, Sprung über die Reling gibt es nicht mehr).

Nur Analyse, kein Spielcode geändert. Alle Zeilenangaben beziehen sich auf den Stand von 2.9.86 und sind Orientierung, keine Zusage.

## 1. Relevante Dateien

| Bereich | Datei | Was dort passiert |
|---|---|---|
| Moduswechsel, Kontext-Taste, Entern, Anlegen | `src/world/seaWorld.ts` | `updateSail` (Gashebel, `Ship.steer`, `pushShip`, `collidePiers`), `updateContext` (die eine Taste `interact` je Lage), `goDeck`/`toHelm` (eigenes Deck), `disembark`/`goAshore`/`embark`, `board(e)` (Feindschiff), `shipReach`, `groundProxy`, `attachToHelm` |
| Schiff: Fahrt, Zustand | `src/entities/ship/ship.ts` | `steer`, `render` (Wellenlage, Neigung, Rollen), `sim` (`ShipSimState`) |
| Schiff: Maße, Deck, Treppen | `src/entities/ship/shipBuilder.ts` | `ShipModel`: `deckY`, `quarter`, `fore`, `helm`, `halfWidth(z)`, `blockers`, `cabinRoof` |
| Schiffsklassen | `src/data/ships.ts` | `SHIP_CLASSES` (`L`, `W`, `mh`, `masts`, `can`, `crew`, `decks`) |
| Begehbarer Boden | `src/world/islandGround.ts` | `IslandGround` (Inseln, Stege, `constrain`, `pushShip`, `pierNear`, `clampToPier`, `shorePoint`), `DeckGround` (Schiffsdeck: Höhe, Wände, Zonen), `Pier`, `Blocker` |
| Spielerfigur, Kollision | `src/entities/player/playerFoot.ts`, `src/combat/sweep.ts` | Laufen und Impulse, ruft `ground.constrain`/`height` |
| Feindschiffe, Entern-Auswahl | `src/naval/naval.ts` | `boardable()`, `isWeak`, `capture`, KI-Fahrt |
| Gegner an Deck | `src/combat/combat.ts` (`enterDeck`, `leaveIsland`), `src/entities/enemy.ts` | Besatzung des Feindschiffs entsteht beim Entern |
| Crew an Deck | `src/world/crewAboard.ts` | `setDeck`, `DECK_TASKS`, Laufwege auf freien Pfaden |
| Stege und Hafenbauten | `src/world/seaWorld.ts` (Zeilen um 539, 552, 590), `src/world/settlement.ts` (Zeile um 77 bis 91), `src/world/architecture.ts` (Steg-Modul, `pier: len`), `src/world/town.ts` (Hafenstadt-Steg, Zeile um 460), `src/world/islandStyle.ts` (`OUTPOST_PIER`) | erzeugen `Pier`-Einträge und Kollider |
| Hafenmenü | `src/ui/menus.ts` (`showHarbor`), `src/core/game.ts` (`onHarbor`) | Hafen öffnet sich per Kontext-Taste, nicht per Andocken |
| Eingabe, Touch | `src/data/actions.ts`, `src/data/touchLayout.ts`, `src/ui/hud.ts` (`ctx`-Knopf, `setContext`) | Aktion `interact` (R/Enter), am Handy der Kontext-Knopf |

## 2. Ist-Ablauf heute

- **Am Steuer (`mode 'sail'`)**: Der Spieler steht als Figur im Schiffsraum (`attachToHelm`: Kind der `ship.model.group` bei `model.helm`). `Ship.steer` fährt, danach `IslandGround.pushShip` (Bug, Mitte, Heck gegen die Küste) und `collidePiers` (7 Punkte entlang des Rumpfs gegen jede Stegachse, Mindestabstand `hw + W/2 + 0.35`, schiebt heraus, bremst und dreht parallel zum Steg).
- **Hafen**: `updateContext` zeigt "Hafen", wenn eine Insel der Art `town` oder `harbor` innerhalb `30 + W` liegt (`islandAt`). Taste öffnet `onHarbor` und setzt `throttle = 0`. Es gibt keinen Anlegepunkt, keine Leinen, kein Festmachen: das Schiff bleibt, wo es steht.
- **An Land gehen** (`disembark`): Landepunkt ist `shorePoint` (nächster Strandpunkt, 90 % der Küste) oder, wenn `pierNear(x, z, 45)` einen Steg findet, ein Punkt auf der Stegachse neben dem Schiff (`u` zwischen 1,5 und `len - 1,5`). Die Figur wird dort per `foot.place` **versetzt** (kein Gehen), `anchor` merkt den Punkt.
- **An Bord gehen** (`embark`): zu Fuß erscheint "An Bord gehen", sobald `|pos - anchor| < 16` oder `shipReach(pos) < 26` (Abstand zum Rumpf-Rechteck). Wieder ein Versetzen, kein Hinübergehen.
- **Eigenes Deck** (`goDeck`/`toHelm`): "Ruder verlassen" nur auf offener See (kein Hafen, keine Beute in Reichweite). `DeckGround(this.ship)` wird zum Boden (`groundProxy`), Segel werden durchsichtig, Ansicht wechselt auf `mode 'foot'`. Zurück: "Ans Steuer" auf dem Achterdeck, `distTo(helm) < 1.5`.
- **Entern** (`board(e)`): Kontext "Entern!" bei `naval.boardable()`: schwaches Feindschiff (Rumpf < 35 %, Crew < 30 %, Händler < 60 %) innerhalb `(L1 + L2)/2 + 20` m, kein Tempolimit, kein Enterhaken, keine Annäherung. `board` setzt beide Schiffe auf Tempo 0, friert das Feindschiff (`frozen = 999`), baut `DeckGround(e.ship)`, lässt `combat.enterDeck` die Besatzung erscheinen (2 bis 7 Köpfe, `crewN`), setzt die Figur per `foot.place` auf `deckGround.spot(0, 0.2)` (Mitte, Blick zum Heck), blendet Cut-in "Entern!" ein. Sieg: `hostilesLeft === 0` löst nach 2,6 s `capture` aus (Prise sinkt, Kiste mit Beute) und `embark`.
- **Kein Übergang zwischen Boden und Deck**: Insel und Deck sind getrennte `Ground`-Objekte, die Figur wechselt sie nur durch Versetzen. Es gibt keine gemeinsame Höhenfunktion für Steg und Deck.

## 3. Schiffsgrößen und Decks (Messung am gebauten Modell, Standard-Look)

Maße in Metern. `deckY` = Hauptdeck über dem Rumpfursprung (Wasserlinie liegt etwa 0,25 m tiefer als der Ursprung, siehe `Ship.render`: `tgtY = ... - 0.25`). `top` = Höhe des Achter-/Vordecks über dem Hauptdeck. Schiffs-z: +z = Bug, Hecklinie bei `-L/2`.

| Klasse | L | W | Halbbreite Mitte | `deckY` | Achterdeck `z0 … z1` | Achter `top` | Treppe `stairX`, Breite, Länge | Vordeck `z0 … z1` | Vor `top`, Treppenlänge | Steuer (y, z) |
|---|---|---|---|---|---|---|---|---|---|---|
| Schaluppe | 18 | 5,8 | 2,9 | 2,15 | -8,64 … -4,68 | 2,69 | -1,66 / 1,33 / 4,64 | keines | | 4,84 / -6,07 |
| Brigg | 24 | 7,2 | 3,6 | 2,15 | -11,52 … -6,24 | 2,69 | -2,25 / 1,44 / 4,64 | 5,52 … 13,8 | 1,22 / 2,10 | 4,84 / -8,09 |
| Korvette | 30 | 8,4 | 4,2 | 2,46 | -14,40 … -7,80 | 2,69 | -2,75 / 1,53 / 4,64 | 6,90 … 17,25 | 1,22 / 2,10 | 5,15 / -10,11 |
| Fregatte | 38 | 10 | 5,0 | 3,82 | -18,24 … -9,88 | 3,04 | -3,42 / 1,65 / 5,24 | 8,74 … 21,85 | 1,42 / 2,45 | 6,86 / -12,81 |
| Galeone | 46 | 12,5 | 6,25 | 4,28 | -22,08 … -11,96 | 3,39 | -4,51 / 1,84 / 5,85 | 10,58 … 26,45 | 1,42 / 2,45 | 7,68 / -15,50 |
| Linienschiff | 58 | 15 | 7,5 | 6,20 | -27,84 … -15,08 | 4,72 | -5,56 / 2,02 / 8,15 | 13,34 … 33,35 | 1,62 / 2,79 | 10,92 / -19,55 |
| Leviathan | 74 | 19 | 9,5 | 7,17 | -35,52 … -19,24 | 5,45 | ±2,92 / 2,33 / 9,39 | 17,02 … 42,55 | 1,62 / 2,79 | 12,62 / -24,94 |

Gemessen im Dev-Server mit `buildShip(SHIP_CLASSES[i], DEFAULT_SHIP_LOOK('pirat'), false)` (Schiffe 2 ist Standard, `?schiffe2=aus` ändert die Werte; `stairX` ist bei den kleinen Klassen eine einzelne Treppe links, nur der Leviathan hat zwei).

Weitere Größen:
- Treppen sind Rampen mit Steigung 1 : 0,58 (30°, `stairLen = top / 0,58`), geschwungen (`flare`) nur beim Leviathan. `DeckGround.level` liefert die Höhe, die Kante `edge`-Wand schließt die Kastellwand bis auf die Treppenlücken und die Kajütentür (`doorHalf` 0,58 bis 0,81).
- Kajüte: Innenraum `cabin.zA … zB` unter dem Achterdeck, Zone 2 in `DeckGround` (`inCabin`).
- Begehbare Breite: `halfWidth(z) * 0,85` (oben `0,86`, Kajüte `0,9 - 0,18`) minus Figurenradius; vorn bis `L/2 * 0,93`; hinten `z0 + 0,35 + r` bzw. `-L/2 + 0,28 L`, falls kein Kastell.
- Deckshöhe in der Welt: `height(x, z)` = Gruppenmatrix angewendet auf `(lx, deckY + level, lz)`, folgt also Nicken und Rollen. Das Schiff wippt je Welle und Klasse träger (Eigenfrequenz 2,6 bis 1,2 rad/s).

## 4. Andockpunkte und Stege

| Quelle | Wert |
|---|---|
| `Pier` (`islandGround.ts`) | Strecke `a → b`, halbe Breite `hw`, Bohlenhöhe `y` (Oberkante) |
| Hafenstadt (`seaWorld.ts` um 590) | `a = (s.x, s.z - r + 5)`, `b = (s.x, s.z - r - 41)`, `hw 2,4`, `y 1,65`, 46 m lang; Steg-Mesh in `town.ts` um 460 (Breite 5, Planken auf y 1,5) |
| Außenposten (`OUTPOST_PIER`) | von `e - 5` bis `e + 27` ab Küstenradius `e`, Richtung zum Meer, Länge 32 m, `hw` 1,5, `y` etwa 1,45 |
| Dorfstege (`settlement.ts` um 89) | Länge `b.pier + 2,5`, `hw 1,5`, `y 1,45` |
| Steg-Modul (`architecture.ts`) | `pier: len`, Laterne bei `len / 2` |
| Strand | Plateau `beachY` 1,3, Böschung höchstens 22 m breit (`shelfOf`), Wasserlinie bei `WATERLINE = 1,3 / 3` der Böschung |

Daraus folgt für die Planung:
- **Höhenunterschied Steg zu Deck**: Deck in der Welt = Wasserhöhe + `deckY - 0,25`, also etwa 1,9 m (Schaluppe, Brigg), 2,2 (Korvette), 3,6 (Fregatte), 4,0 (Galeone), 5,95 (Linienschiff), 6,9 (Leviathan) über dem Wasser, Stege liegen bei 1,45 bis 1,65 m. Nur die kleinen Klassen liegen auf Stegniveau (Unterschied 0,25 bis 0,45 m, also im Rahmen der Stufenhöhe 0,45 m aus `SWEEP.stepHeight`); alle ab Fregatte brauchen Gangway oder Rampe.
- **Anlegeabstand**: `collidePiers` hält die Schiffsachse mindestens `hw + W/2 + 0,35` von der Stegachse entfernt, die Bordwand liegt dann 0,35 m vom Stegrand. `pushShip` hält das Schiff `W * 0,5 + 1,2` m vor der Wasserlinie. Beide Werte sind Ausgangspunkte für feste Liegeplätze.
- **Ausrichtung**: `collidePiers` dreht bereits sanft parallel zur Stegachse (Faktor 0,02 bis 0,06 je Bild), wählt dabei die nähere der zwei Richtungen.
- **Seiten**: Das Schiff liegt seitlich am Steg; nutzbare Länge des Stegs (32 bis 46 m) trägt die Klassen bis zur Galeone (46 m Länge nur mit dem Hafensteg), größere Schiffe liegen ohne Weiteres länger als die Außenposten-Stege (32 m).

## 5. Kollisionen der Spielerfigur

- `PlayerFoot` ruft `ground.constrain(x, z, radius 0,35)` und `ground.height(x, z)`. Impulse (Ausfallschritt, Rolle) laufen über `combat/sweep.ts` (Teilschritte höchstens 0,15 m, Stufen höchstens 0,45 m, Rampen unter 42°, Wand stoppt oder gleitet).
- `IslandGround.constrain`: Blocker-Kreise und gedrehte Rechtecke (bis 3 Durchgänge), Küstenlinie (`edge * (1 + shelf * 0,16)`), Stegstreifen über Wasser (`clampToPier`, quer `hw - 0,6 min(r, 0,5)`, an der Spitze `len - 0,35`). `height`: Insel (Plateau, Hügel, Relief, Pads, Wiese) oder `pier.y` auf den Bohlen.
- `DeckGround.constrain`: Hüllenbreite je z, Kastellvorderwand mit Treppenlücken, Wangen, feste Aufbauten (`model.blockers`), Zonenwechsel Hauptdeck / Achterdeck / Kajüte. Zone wird in `updateZone` aus der Position abgeleitet (bei `lz > z1 + 0,04` Hauptdeck, durch die Tür Kajüte).
- `groundProxy` in `seaWorld.ts` wählt je Bild `deckGround ?? ground`. Ein Mischboden (Steg und Deck gleichzeitig) existiert nicht.
- Gegner (`Enemy`) und Crew (`Ally`) nutzen dieselben `constrain`-Aufrufe über `EnemyWorld`/`AllyWorld.ground`.

## 6. Lücken, die die Umsetzung schließen muss

1. **Kein Festmachen**: kein Zustand "angelegt" für das Schiff (Liegeplatz, Heading, Leinen). Heute: Taste, Menü, Versetzen.
2. **Kein Übergang Steg ↔ Deck**: Gangway oder Rampe mit gemeinsamer Höhenfunktion fehlt; `groundProxy` kennt nur einen Boden. Das Schiff wippt, der Steg nicht: die Gangway muss die Höhe pro Bild aus Schiffsmatrix und Steghöhe verbinden.
3. **Entern ohne Annäherung**: Teleport auf `spot(0, 0.2)` mit eingefrorenem Feindschiff, kein Enterhaken, keine Seitenlage, kein Brückenschlag. Alle Entern-Bedingungen stehen in `naval.boardable()` und `board()`.
4. **Feindliches Deck ist ein eigenes `DeckGround`**, das im Welt-Raum an `e.ship` hängt. Für einen Brückenübergang müssten beide Decks gleichzeitig verfügbar sein (zwei Böden, Wechsel an der Brückenmitte).
5. **Eingabe**: nur eine Kontext-Taste (`interact`); Mehrfachangebote (Hafen, Anlegen, Ablegen, Entern) brauchen Priorität oder ein Auswahlmenü (`updateContext` liefert genau ein Label).
6. **Seegang**: Das Deck folgt Nicken und Rollen, das Schiff hält am Steg aber keine Ruhelage (`sm`-Federn). Anlegen braucht eine gedämpfte Lage oder eine Wellenhöhe, die am Hafen schwach ist.
7. **Reparatur und Crew** (2.9.86) liegen schon im Hafen/Taverne und an Bord: `ShipSimState`, `Ship.requestRepair`, `requestCrewRefill`. Ein Anlegepunkt wäre der natürliche Auslöser für die Werftreparatur (heute Menü).
8. **Spielstand**: Der Liegeplatz (Insel, Steg) gehört nicht in den Spielstand, solange `world.boat` (x, z, heading) genügt; bei Bedarf optionale Felder ergänzen (Regel: keine Pflichtfelder).

## 7. Vorschlag für den Einstieg (Reihenfolge)

1. **Liegeplätze als Daten**: je Steg eine Liste `berths` (Seite, Mitte u, Heading, maximale Schiffslänge) aus `Pier` und `shelf`; Auswahl per Klassenlänge `L` und `W`.
2. **Anleger-Zustand im Schiff**: `Ship.moored: { pier, side, u } | null`, Fahrt gesperrt, Lage gedämpft; `steer` blendet das Anlegen als Annäherungsmodus ein (Tempo unter 2 m/s, Winkel unter 20° zum Steg).
3. **Gangway**: Boden-Brücke, die `IslandGround.height` am Steg und `DeckGround.height` an der Bordwand verbindet; ab Fregatte mit Rampe (`SWEEP` erlaubt 30°).
4. **Gemeinsamer Boden**: `CompositeGround` (Insel, Steg, ein oder zwei Decks) mit Auswahl nach Position, `groundProxy` darauf umstellen.
5. **Entern mit Annäherung**: Enterhaken-Zustand (Abstand, Tempo, Wende), beide Decks als Boden, Brücke zwischen den Relings; `board()` ersetzt das Versetzen.
6. **Prüfung**: `tests/` für reine Geometrie (Liegeplatz, Brückenhöhe, Stegmaße), im Spiel Playwright-Läufe je Klasse (7 Schiffe) an Hafen-, Außenposten- und Dorfstegen.
