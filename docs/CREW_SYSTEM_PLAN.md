# Zwei-Stufen-Crew-System: technische Bestandsaufnahme und Andockplan (Stand 2.9.86)

Nur Analyse, kein Spielcode geändert. Zeilenangaben sind Orientierung.

Ziel: **Stufe 1 = Offiziere** (die benannten Crewmitglieder, die es schon gibt) und **Stufe 2 = Endgame-Massentruppen** (viele namenlose Kämpfer, ab dem größten Schiff, dem Leviathan).

## 1. Was es heute gibt: zwei getrennte Crew-Begriffe

| Begriff | Wo | Inhalt |
|---|---|---|
| **Benannte Crew** (Offiziere) | `src/data/crew.ts` (`CREW`, 16 Einträge inklusive Katze; `CREW_BY_ID`, `defaultParty`, `CREW_ROLE_LABEL`, `CREW_QUESTS`), Spielstand `save.crew` | Einzelpersonen mit Rolle (`tank`/`heiler`/`schaden`/`unterstuetzung`/`keine`), Waffe (`style`), Fähigkeit, Preis, Rang, Treue, eigener Auftrag. Perks wirken über `has('id')` in `Game.applyPower` (z. B. `nav` +15 % Tempo, `gun` Nachladen 0,7, `cook` Rumpfbonus, `carp` +40 Rumpf) |
| **Schiffsbesatzung** (Seeleute, seit 2.9.86) | `src/naval/shipSim.ts` (`ShipSimState.crew`, `CREW_POOLS`, `makeCrew`, `crewFrac`, `crewEffects`, `refillCrew`), `Ship.crew` (Anteil 0 bis 1) | Namenlose Köpfe je `shipId`: Maximum `cls.crew * 8` (Schaluppe 16 bis Leviathan 104). Die Crew-% steuert Nachladen, Segelsetzen, Reparatur; Kanonentreffer fordern Verluste (`loseCrew`); Auffüllen für Gold in Taverne, Hafen, Werft (`Game.refillCrew`, `crewPricePerHead`) |

Die beiden Begriffe berühren sich nur lose: `ship.cls.crew` (2 bis 13) ist Rohwert für die Köpfe und steuert beim Entern, wie viele Feinde erscheinen (`seaWorld.board`: `crewN = clamp(round(cls.crew * (0,4 + 0,6 * crew)), 2, 7)`).

## 2. Rekrutierung (Offiziere)

- `Game.hireCrew(id)` (`core/game.ts` um 929): prüft Rang (`rankIndex(fame) >= def.rank`) und Gold, schreibt `crew.hired.push(id)`, Treue 10, nimmt den Offizier in den Landtrupp auf, wenn weniger als 3 drin sind; ruft `applyPower` und `persist`.
- `Game.toggleParty(id)`: Landtrupp höchstens **3** (harte Zahl an mehreren Stellen: `hireCrew`, `toggleParty`, `defaultParty` mit `slice(0, 3)`, `Ally`-Plätze in `CrewAboard.spawnAllies` mit festen Versätzen für Platz 0, 1, 2).
- UI: `ui/menus.ts` `showHire` (Taverne und Hafen) und `showCrew` (Verwaltung, Treue, Landtrupp). Gold je Kopf für Seeleute neu in `showHarbor`/Taverne/`showShipyard` (Taste `sailors`).
- Ränge: `FAME_THRESHOLDS` mit 10 Stufen (0 bis 6000 Ruhm), das größte Schiff verlangt Rang 9 (`SHIP_CLASSES.rank`).

## 3. Begleiter-KI

- `src/entities/ally.ts` (`Ally`, `AllyWorld`): eine Klasse für alle Offiziere. Werte aus Stufe und Rolle: `maxHp = (70 + 14 * level) * Rollenfaktor * Treue 1,3`, `dmg = (5 + 1,6 * level) * Rollenfaktor`. Eigene Angriffstabelle `ATTACKS` je `StyleId`, Fähigkeit je Offizier (`skillT`), Spott für Tanks, Wegfindung über `NavAgent`/`NavGrid` (nur auf Inseln, an Deck `nav() = null`: freie Bewegung, `ground.constrain`). Hat `entityId` (`ally-n`) und Kapselradius 0,45.
- Sie sind **Einzelfiguren mit voller Figur** (`Character` mit Skelett, Waffen, Hurtbox): teuer. Pro Figur gilt: Figurenzahl im Kampf ist bisher höchstens 3 Offiziere + Spieler + Gegner.
- `src/world/crewAboard.ts`: zwei Aufgaben.
  1. **Deck-Besatzung** (`setDeck`, `updateDeck`): jede angeheuerte Person (auch Katze) steht an Deck mit Tätigkeiten aus `DECK_TASKS` (nach `id`), Plätze auf zwei Bahnen im Arbeitsbereich `zone()` (zwischen Achterdeck-Treppe und Vordeck), gemieden werden `model.blockers`. Sprüche über `lines`.
  2. **Landtrupp** (`spawnAllies`, `clearAllies`, `reviveAll`): erzeugt `Ally` je Eintrag der `party`; kein Platz für mehr als 3 (Versatz nach `i`).
- `seaWorld.setCrew(hired, party, loyalty, level, allyBuff)` kopiert Daten vom Spiel in die Welt; `spawnParty(yaw)` startet beim An-Land-Gehen und beim Entern. `combat.allies` ist die Liste, die Gegner als Ziele sehen (`CombatSystem.constrain` hält Gegner aus Allies heraus, Spott über `taunt`).
- Die **sichtbare Deck-Besatzung ist rein dekorativ** und hat keine Verbindung zu den Seeleuten (`crewFrac`): bei 20 % Crew stehen trotzdem alle angeheuerten Offiziere an Deck, namenlose Seeleute gibt es als Figuren nicht.

## 4. Schiffsklassen und Kapazitäten

`src/data/ships.ts` `SHIP_CLASSES` (Auszug, Werte aus dem Code):

| Klasse | L | W | hp | Kanonen je Seite | `crew` | Köpfe (`crew * 8`) | Rang | Deck-Zonen (Deckfläche grob) |
|---|---|---|---|---|---|---|---|---|
| Schaluppe | 18 | 5,8 | 120 | 2 | 2 | 16 | 0 | Hauptdeck, Achterdeck, Kajüte |
| Brigg | 24 | 7,2 | 200 | 3 | 4 | 32 | 2 | + Vordeck |
| Korvette | 30 | 8,4 | 290 | 4 | 5 | 40 | 3 | |
| Fregatte | 38 | 10 | 400 | 5 | 6 | 48 | 4 | |
| Galeone | 46 | 12,5 | 560 | 6 | 8 | 64 | 5 | |
| Linienschiff | 58 | 15 | 780 | 8 | 10 | 80 | 7 | |
| **Leviathan** | 74 | 19 | 1100 | 10 | 13 | 104 | 9 | zwei Achtertreppen (geschwungen), Prunkkajüte |

Deck-Maße je Klasse stehen in `docs/DOCKING_BOARDING_PLAN.md` (Abschnitt 3).

Es gibt **keine** Kapazitätsangabe für Offiziere oder Truppen je Klasse (nur `crew` als einzelne Zahl). Der Landtrupp (3) ist klassenunabhängig.

## 5. Savegame

- `core/save/types.ts`: `SAVE_VERSION = 11`. `CrewState { hired: string[]; party: string[]; loyalty: Record<string, number> }` in `SaveData.crew`. `ShipState { tier, owned, look, ammo, hull, sail?, crew?, up }`: `sail` und `crew` (0 bis 1) sind seit 2.9.86 optional (fehlt = 1).
- Migrationen in `core/save/migrations.ts` (Tabelle `MIGRATIONS[von]`, zuletzt 10 → 11); fehlende Felder füllt `ensure*`-Code (`ensureGear` für Inventar) ohne Versionssprung.
- Gespeichert wird in `Game.persist` (`save.ship.sail/crew` als Anteile, Offiziere als IDs). Die **Köpfe der Seeleute werden nur als Anteil gespeichert**, nicht je Gruppe (`pools`).
- Regel aus `CLAUDE.md`: Spielstände bleiben lesbar, Inhalte datengetrieben.

## 6. Andockplan

### 6.1 Daten (neu, keine Spiellogik ändern)

- **Kapazitätstabelle je Klasse** in `data/ships.ts` oder neuer `data/crewTiers.ts`: `officers` (wie viele Offiziere an Bord kämpfen dürfen), `troops` (Massentruppen, nur `leviathan` > 0; Vorschlag: Zahl der Gruppen und Köpfe), `troopRank`. Ein Eintrag `CREW_POOLS.truppen` in `naval/shipSim.ts` (Gewicht, `casualty`-Reihenfolge, damit Verluste erst die Truppen treffen, dann die Matrosen, dann die Offiziere sind **nie** Verluste) und `makeCrew` legt den Pool nur an, wenn die Klasse Truppen hat.
- **Truppentypen** als Daten (`data/troops.ts`): z. B. Schwertträger, Musketiere, Kanoniere mit Werten je Stufe, Preis je Kopf, Rang, Ruhm-Freischaltung. Offiziere bleiben in `data/crew.ts` unverändert, optional kommt das Feld `tier: 'offizier'` dazu, damit der Menütext trennen kann.

### 6.2 Spielstand

- `CrewState` erweitern um **optionale** Felder: `troops?: Record<string, number>` (Truppentyp → Köpfe) und `officerSlots?: string[]` (Offiziere im Kampfeinsatz, falls die Zahl 3 steigen soll). Fehlt das Feld, gilt leer. Kein Pflichtfeld nötig, **Migration auf Version 12 nur, wenn ein bestehendes Feld umgedeutet wird** (z. B. `party` wird zu `officerSlots`); sonst Ersatz ohne Versionssprung wie bei `ship.sail`.
- `ShipSimState.crew.pools` ist bereits JSON-tauglich; speichern als Anteile je Gruppe: `ship.crew` bleibt Gesamtanteil für alte Stände, neue Felder `ship.crewPools?: Record<string, number>` (Anteil je Gruppe).

### 6.3 Rekrutierung

- Offiziere: `hireCrew` unverändert; `party.length < 3` und die drei Plätze in `spawnAllies` durch `officerSlots(cls)` aus der Kapazitätstabelle ersetzen (eine Quelle der Zahl).
- Truppen: neue Methode neben `refillCrew`, ruft `Ship.requestCrewRefill` mit `CrewRefillIntent` (hat `heads`, ergänzen um optionale `pool`-Angabe, z. B. `'truppen'`); Kosten über `crewPricePerHead`-Verwandten je Truppentyp. UI: Knopf in `showShipyard` und Hafen, sichtbar ab Klasse mit `troops > 0`.
- Rangsperre über `rankIndex` wie bei Offizieren.

### 6.4 Wirkung auf See und im Kampf

- **See:** Truppen sollen das Entern stärken, nicht Nachladen oder Segelsetzen. `crewEffects(frac)` bekommt dafür nur die Seeleute-Gruppe; neue reine Funktion `boardingStrength(crew)` (Truppenanteil → Entern-Erfolg, Trefferpunkte der Enterer, Verlustabsicherung). Kanonenverluste (`applyDamage`) sollen zuerst die Truppen treffen.
- **Entern:** `seaWorld.board` ersetzt die feste Gegnerzahl `crewN` durch Gegnerzahl aus `cls.crew` und die Enterer aus Offizieren + Truppen. Massentruppen dürfen **keine** vollen `Ally`-Figuren sein.

### 6.5 Begleiter-KI für Massentruppen

- Kosten: Eine volle `Character` je Figur sinkt die Bildrate bei dutzenden Figuren (Skelett, Waffen, Hurtbox, Outline). Für hundert Köpfe nötig: **Instanzierte Truppen** (`InstancedMesh`/Impostor mit gemeinsamem Animationstakt, GPU-Skinning über Textur, je Figur nur Position und Zustand), Kampf als **Sammelzustand**: `TroopSquad { entityId, typ, n, hpAnteil, x, z, yaw }` mit wenigen Zahlen, nicht je Kopf eine KI (`ai/behaviorTree.ts` für den Trupp, `NavAgent` einmal je Trupp).
- Trupps haben `entityId` (`mintEntityId('ally')` oder neue Art `'squad'`), Trupp-Treffer laufen über denselben Schadenspfad wie `Ally.receive`, Bewegung über `sweepMove`.
- Obergrenzen: 4 bis 6 Trupps zu je 10 bis 20 Figuren sichtbar (Kameradistanz, `figureDist` in `seaWorld.cullFigures` begrenzt schon), der Rest als Zahl im Trupp.
- Deck-Optik (`crewAboard.setDeck`): Truppen als instanzierte Gruppen an Reling und Deckmitte, Offiziere bleiben Einzelfiguren. Die Zahl der sichtbaren Matrosen kann an `crewFrac` hängen (heute hängt die Optik an der Zahl der Offiziere).

### 6.6 Schnittstellen, die schon bereitstehen (2.9.86)

- `Ship.sim.crew.pools`, `CREW_POOLS` (Gewicht, `casualty`), `crewFrac`, `loseCrew`, `refillCrew`, `CrewRefillIntent` (Schiffskennung), `Ship.requestCrewRefill`. Ein neuer Pool ist ein Eintrag; Anzeige (`shipTooltip`) und Hafenpreise brauchen Anpassung.
- `entityId` für `ally`, `enemy`, `ship`; `DashIntent` und `sweepMove` für Bewegungen.

### 6.7 Reihenfolge der Umsetzung

1. Daten: Kapazitäts- und Truppentabelle, `CREW_POOLS.truppen`, `makeCrew` je Klasse (Tests in `tests/shipSim.test.ts` ergänzen).
2. Spielstand: optionale Felder, Tests in `tests/save.test.ts` (Altstand ohne Felder lädt).
3. Rekrutierung und Menü (Werft, Hafen), Preis und Rangsperre.
4. Seeleute-vs-Truppen-Wirkung: `boardingStrength`, Verlustreihenfolge, HUD-Tooltip.
5. Offiziere-Plätze aus der Klassentabelle statt fester 3.
6. Massentruppen im Kampf: `TroopSquad` ohne Grafik (Zahlenmodell, Tests), dann Instanz-Darstellung, dann Anbindung an `board` und Landgang.
7. QA: Leistung mit 100 Köpfen im Playwright-Lauf (Bildrate je Grafikstufe), Savegame-Hin-und-Zurück, Entern auf Leviathan.

## 7. Offene Fragen an dich

- Dürfen Truppen auch an Land mitkämpfen oder nur beim Entern und auf See?
- Wie viele Offiziere gleichzeitig (heute 3)? Wachsen die Plätze mit der Schiffsklasse?
- Sollen Truppen Treue, Namen oder Aufträge haben, oder reine Zahlen mit Typ und Stufe sein?
