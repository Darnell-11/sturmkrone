# Was ist neu

## 2.9.60 – Figuren 3.0, Teil 3: Abnahme (13.11.2026)

Phase 5 aus `docs/CHARACTER_SYSTEM_3.0.md`: gemessen, verglichen und dabei noch drei Dinge behoben.

- **Schneller mit vielen Figuren.** Die neue Hülle, die das Verschwinden von Teilen am Bildrand verhindert, war zu großzügig: Mit 30 Figuren und Schatten kostete sie ein Fünftel mehr Bildzeit. Sie folgt jetzt eng der Hüfte jeder Figur.
- **Hemdsaum und Hosenbund flackern nicht mehr gegeneinander.** Beide lagen auf gleicher Höhe. Jedes Oberteil liegt jetzt klar über der Hose, und die Hose wird darunter nicht mehr gezeichnet.
- **Seltener Fehler beim Wechsel der Grafikstufe abgesichert.** Das erste Bild nach dem Umschalten auf „Hoch“ oder höher konnte einen Fehler werfen (das Bild danach war wieder in Ordnung). Der Fehler steckte schon in 2.9.57. Er trat nur gelegentlich auf (zweimal in etwa zehn Läufen); nach der Korrektur kam er in den folgenden Läufen nicht mehr vor, sicher ausschließen kann ich ihn damit nicht.

**Leistung (30 Figuren mit Schatten im Editor-Raum, Bildzeit je Bild auf diesem Rechner):**

| Stufe | 2.9.57 | jetzt | Zeichenaufrufe 2.9.57 → jetzt |
|---|---|---|---|
| Niedrig | 10,2 ms | 9,8 ms | 644 → 642 |
| Mittel | 12,4 ms | 13,9 ms | 826 → 965 |
| Hoch | 12,9 ms | 14,0 ms | 839 → 978 |
| Maximal | 13,3 ms | 13,8 ms | 839 → 978 |
| Ultra | 12,3 ms | 14,3 ms | 839 → 978 |

Ab „Mittel“ ist der neue Stand 4 bis 16 % langsamer. Der Grund: Vorher fielen Figuren-Teile fälschlich aus dem Schattenbild (derselbe Fehler, durch den Teile am Bildrand verschwanden); jetzt werden sie gezeichnet. Auf „Niedrig“ (ohne Schatten) ist er gleich schnell. Die Bildzeit schwankt von Lauf zu Lauf um etwa 1 ms.

**Flackern auf Entfernung (Bildpunkte, die bei winzigem Kamerazittern die Farbe wechseln; Stufe Hoch, 100 m):**

| Kleidung | 2.9.57 | jetzt |
|---|---|---|
| Hemd und langer Mantel | 3 036 | 2 539 |
| Jacke und langer Mantel | 4 348 | 2 518 |
| Weste | 2 773 | 2 341 |
| Tunika | 2 636 | 2 083 |

Das sind 16 bis 42 % weniger. Ein Teil der verbleibenden Punkte sind Kanten der Figur, die bei jedem Zittern wechseln; wie groß dieser Anteil ist, habe ich nicht getrennt gemessen. Auf 60 m und 150 m sind es bei Hemd und Mantel je 18 % weniger.

**Durchstiche (Schlussmessung, 26 Figuren, je 75 Posen):** 20 Punkte je Figur und Pose (2.9.57: 150), Haut durch Kleidung 1 857 (4 843), kein Netz außerhalb seiner Hülle (67 % der Posen).

**Gesichtet:** alle fünf Grafikstufen mit 30 Figuren (gleiches Bild der Figuren auf jeder Stufe), Inventar mit acht Plätzen im Handy-Hochformat (375 × 812, nichts abgeschnitten, kein seitliches Rollen), Hemd-, Westen-, Ringelhemd- und Mantelsäume aus der Nähe, Sitzen.

**Geprüft:** `tsc`, 72 Tests, Produktionsbau, Speicher über 130 Runden unverändert (413 Netze). **Nicht geprüft:** ein echtes Handy (nur die Größe wurde nachgestellt), die Bildrate im laufenden Spiel mit vielen Figuren (gemessen wurde im Editor-Raum mit angehaltener Spielschleife), langes Spielen, die Bausteinfigur.

**Technik (für Entwickler):**
- `Character.fitCull`/`syncCull`: alle Netze einer Figur teilen sich eine `Sphere`, deren Mitte nach jedem `mixer.update` auf die Hüfte gesetzt wird (Halbmesser `CULL_RADIUS` 1,45 m). Vorher eine feste Kugel von 3,2 m je Netz.
- `vroid.ts` `garmentOffset`: `overHose` hebt Hemd, Ringelhemd und Tunika im Bereich der Hose auf mindestens 17 mm, `slim` ist das enge Hemd an einer Stelle; `GARMENT_LEVEL.hemd = 2`.
- `render/csm.ts` `csmDefines`: füllt `CSM_cascades` auf die erwartete Länge, bis der nächste Weltschritt die Grenzen setzt.
- `audit.ts`: `__audit.ready()`, `__audit.perf(stufe, n, bilder)` und `__audit.flicker(stufe, entfernung, figur)`. Die Flacker-Probe zittert in fester Folge; mit Zufall schwankte sie um ein Drittel.

## 2.9.59 – Figuren 3.0, Teil 2: gerade Säume, neue Rüstungsteile, vier neue Ausrüstungsplätze (12.11.2026)

Phase 4 aus `docs/CHARACTER_SYSTEM_3.0.md`.

- **Gerade Säume.** Mantelkanten, Ärmel, Hosenbund, Schärpe und Tunika enden jetzt an einer sauberen Linie. Vorher folgte jeder Saum dem Zickzack der Körper-Dreiecke, und an Achsel, Knie und Taille fehlten einzelne Stücke.
- **Schärpe und Gürtel laufen ganz um den Körper**, auch hinten über dem Hemd.
- **Mantelschöße hängen am Becken.** Sie klebten als zweite Haut an jedem Oberschenkel und rissen beim Ausfallschritt auseinander. Jetzt folgen sie den Beinen nur noch etwa zur Hälfte.
- **Uniformrock:** Die Uniform ist ein eigenes Kleidungsstück mit langen Ärmeln und kurzem Schoß. Vorher war sie nur das eingefärbte Hemd.
- **Neue Rüstungsteile:** Brustplatte (Kettenhemd-Stufe), Schulterplatten (Gezeitenpanzer-Stufe), Armschienen und Beinschienen aus Leder oder Stahl, zwei Paar Stiefel und zwei Schilde.
- **Vier neue Ausrüstungsplätze:** Hände, Beine, Füße und Nebenhand. Die Stücke gibt es beim Händler unter „Schienen, Stiefel und Schilde“, sie bringen Leben, Schadensminderung oder Volltreffer und sind an der Figur zu sehen. Der Schild wird getragen, wenn der Kampfstil die linke Hand frei lässt (nicht bei Langklinge, Zweihänder, Doppelklingen und Faust). Die Laterne wechselt dann auf die rechte Hüfte.
- **Editor:** Das Oberteil ist jetzt wählbar (Hemd, Weste, Jacke, Ringelhemd, Uniform, Tunika), dazu Narbe, Halstuch und Handschuhe. Vorher gab es bei den Anime-Figuren nur Farben.
- **Halstuch** liegt wieder eng um den Hals und sitzt über dem Mantelkragen.
- **Spielstände:** Version 11. Alte Stände werden übernommen, die neuen Plätze sind dort leer, Rüstungsstufe und alles andere bleibt.

**Gemessen (26 Prüf-Figuren, je 75 Posen; strengere Zählung als in 2.9.58: nur Flächen direkt übereinander):**

| | 2.9.57 | jetzt |
|---|---|---|
| durchstechende Punkte je Figur und Pose | 150 | 19 |
| davon Haut durch Kleidung (Summe) | 4 843 | 1 857 |
| Netze außerhalb ihrer Hülle | 67 % der Posen | 0 % |
| gezeichnete Dreiecke je Figur | 32 050 | 30 571 |

Die Zahlen aus 2.9.58 (190 und 27) stammen aus der gröberen Zählung und sind mit dieser Tabelle nicht vergleichbar. Die Dreieckszahl liegt höher als in 2.9.58, weil die geschnittenen Säume zusätzliche Dreiecke brauchen.

**Mit Bildern verglichen (vorher gegen nachher, 14 Ansichten, dazu die neuen Teile):** Dabei gefunden und behoben: ein Schulterstück schwenkte mit dem Arm von der Schulter weg, das Halstuch wurde zum Schulterkragen, das Ringelhemd blitzte am Ellbogen unter dem Mantelärmel hervor, der Schild verdeckte die Laterne.

**Nicht umgesetzt:** Sandalen zeigen weiter die Schuhe der Figur. Der Fuß der Grundfigur ist unter dem Schuh nicht ausgearbeitet und sähe barfuß falsch aus. Brustplatte, Schienen und Schulterplatten haben die passende Farbe, aber noch keinen eigenen Stahl- oder Lederglanz (alle Hüllen teilen ein Stoff-Material). Die Brustplatte entfällt unter einem Mantel.

**Geprüft:** `tsc`, 72 Tests (drei neue: Übernahme alter Stände, Werte der neuen Stücke, Übersetzung von Aussehen in Ausrüstung), Produktionsbau; Speicher über 130 Runden Anlegen, Umziehen, Treffer-Leuchten und Entfernen unverändert (496 Netze); im Spiel: neuer Stand, vier Stücke gekauft und angelegt, Inventar mit acht Plätzen, Landgang mit Schild ohne Fehlermeldung. **Nicht geprüft:** echtes Handy und die Grafikstufen einzeln, Bildrate mit vielen Figuren, Kampf mit Schild über längere Zeit (der Schild ist reine Optik plus Werte, die Kampfanimationen bleiben), der Händler-Dialog mit echter Maus, Hochformat des Inventars mit acht Plätzen, die Bausteinfigur.

**Technik (für Entwickler):**
- `vroid.ts` `buildGarment`: Zugehörigkeit je Hautpunkt über Gewichtssummen der Körperregionen (`boneClass`, `NCLS`) statt über den stärksten Knochen. Angeschnittene Haut-Dreiecke werden an der Saumlinie geteilt (`cutVert`, Halbierungssuche über `evalEdge`, `CUT_HEMS`). `TAIL_HIPS` mischt die Gewichte der Mantelschöße zum Becken.
- Neue `GarmentKind`: `uniform`, `kuerass`, `armschiene`, `beinschiene`. `TopUnder` kennt `uniform`. `GarmentCtx.boots`. Unter einem Mantel sitzen eigene Oberteile schlank (`cT`), der Mantel zählt deshalb im Schlüssel (`garmentKey`). `BANDS` (Tuch, Gürtel, Schienen) verdecken bis an ihren Rand.
- `animeHats.ts` `buildPauldron`; `shoulderAnchors(ctx, kind)` misst am äußersten Stück über der Schulter und mittelt die Gewichte der Schulterkuppe.
- `data/equipment.ts`: neue Einträge, `notUnderCoat`, starre Teile mit Farbe, `CharacterLook.extra` (nur Anzeige, nie gespeichert) wird in `loadoutFromLook` eingehängt.
- `data/items.ts`: `GearSlot`, `GEAR`, `ARMOR_LOOK[].extra`. `core/inventory.ts`: `wornGear`, Werte in `computeStats`. `core/game.ts`: `buyPiece`, `displayLook` mit Extras, Inventar-Host für die neuen Plätze. `GearState.owned`/`worn`, `SAVE_VERSION = 11`, Migration 10 → 11.
- `seaWorld.ts` `setOffhand`, `weapons.ts` `shieldFor`; `Character.hold` verlegt die Laterne bei breiten Teilen links.
- `audit.ts`: Vergleich nur noch mit der Fläche direkt über einem Punkt (seitlich höchstens 1 cm); `__audit.start()`/`.last` für lange Läufe, `__audit.shot(name, look, yaw, …)` für Bilder aus dem Editor-Raum (braucht einen lokalen Empfänger auf Port 5199).

## 2.9.58 – Figuren 3.0, Teil 1: Kleidung sticht nicht mehr durch, nichts verschwindet am Bildrand (12.11.2026)

Grundlage ist der Bauplan in `docs/CHARACTER_SYSTEM_3.0.md`. Umgesetzt sind die Phasen 0 bis 3.

- **Mäntel und Gürtel über Jacke, Tunika und Ringelhemd sitzen richtig.** Vorher rechneten Mantel und Schärpe immer mit einem dünnen Hemd darunter. Trug die Figur eine Jacke, stach diese flächig durch den Mantel, und die Schärpe versank im Oberteil. Jetzt richten sich Mantel, Schärpe und Halstuch nach dem, was wirklich darunter liegt.
- **Verdecktes wird nicht mehr gezeichnet.** Haut unter Kleidung, Hemd unter Weste und Mantel, Schuh unter dem Stiefelschaft und Haare unter Kopftuch, Mütze und Helm fallen weg. Dort kann nichts mehr durchstechen oder auf Entfernung flackern. Unter jedem Saum bleibt ein Streifen stehen, damit man nie in ein Loch sieht.
- **Nichts verschwindet mehr am Bildrand.** Lag oder rollte eine Figur, konnten Haare, Gesicht oder Kleidung einzeln verschwinden, bis die Kamera sich bewegte. Jede Figur hat jetzt eine feste, großzügige Hülle für alle ihre Teile.
- **Schärpenknoten, Gürtelschnalle und Schulterstücke bewegen sich mit dem Stoff.** Sie hingen starr an einem Knochen und schwebten oder tauchten ein, wenn die Figur sich beugte oder die Arme hob.
- **Das Halstuch liegt über dem Mantelkragen** statt auf gleicher Höhe (dort flackerte es).

**Gemessen (26 Prüf-Figuren, je 75 Posen aus 15 Animationen):**

| | vorher | nachher |
|---|---|---|
| durchstechende Punkte je Figur und Pose | 190 | 27 |
| davon Haut durch Kleidung (Summe) | 37 399 | 6 806 |
| Jacke durch Schärpe | 50 % der Punkte | 4 % |
| Jacke, Tunika, Ringelhemd durch den Mantel | 33–41 % | 2 % |
| Netze außerhalb ihrer Hülle | 67 % der Posen, bis 2 m | 0 % |
| gezeichnete Dreiecke je Figur | 32 050 | 27 868 |

**Mit Bildern verglichen (alt gegen neu, 14 Ansichten):** Hemd, Weste, Jacke, Tunika, Ringelhemd, Uniform, kurzer, langer und Kapitänsmantel, Stiefel, Helm, Mütze, Kopftuch, Sitzen, Rennen, Treffer, Tritt, Jubeln. Dabei gefunden und behoben: feine Risse an den Schulternähten (Nahtpunkte bekamen verschiedene Gewichte), kahle Kopfhaut unter dem Helm (zu schmaler Haarstreifen unter dem Rand), dunkle Lücken am Mantelrand (Saumrand zu schmal).

**Noch offen (Phase 4):** Lange Mantelschöße folgen weiter den Beinen (Beine treten beim Ausfallschritt durch). Das Hemd der Grundfigur hängt hinten über die Schärpe. Säume sind noch gezackt. Uniform und Sandalen haben kein eigenes Stück. Das Inventar kennt die neuen Plätze (Beine, Füße, Hände) noch nicht.

**Geprüft:** `tsc`, 69 Tests, Produktionsbau; Speicher über 130 Runden Anlegen, Umziehen, Treffer-Leuchten und Entfernen unverändert (529 Netze); neuer Spielstand, Segeln und Landgang in Ankerglück mit 17 Bewohnern ohne Fehlermeldung. **Nicht geprüft:** echtes Handy, die vier Qualitätsstufen einzeln, Bildrate mit vielen Figuren, das Flackern auf große Entfernung im laufenden Spiel (nur gerechnet), Bausteinfigur (Ersatz, wenn die Anime-Figuren nicht laden).

**Technik (für Entwickler):**
- **Prüfwerkzeug** `entities/character/audit.ts` (nur Entwicklung): `await __audit.run()` misst ohne zu zeichnen Durchstiche je Schichtpaar, Schichtabstände und Hüllkugeln; `__audit.one(look)` für eine Figur. Verglichen werden nur Punkte, die schon in Ruhe benachbart sind. `Character.auditLayers()` liefert die Schichten.
- **`BodyMaskingEngine`** (`entities/character/bodyMask.ts`): eigene Dreiecksliste je Netz ohne verdeckte Dreiecke, Punktdaten bleiben mit der Vorlage geteilt, ein Zeichenaufruf. Listen sind je Kombination zwischengespeichert und gezählt (`indexFor`, `release`). Ein Dreieck fällt weg, wenn ein einzelnes Stück höherer Ebene alle drei Ecken verdeckt. Ebenen in `GARMENT_LEVEL`.
- **Masken-Daten** in `vroid.ts`: `garmentCover` (je Stück, nur wo es höchstens 4 cm absteht, Saumrand 0 bis 2 Haut-Ringe je nach Abstand), `baseCover` (Hemd und Schuhe der Grundfigur, per Strahl je Hautpunkt, Textur-Löcher beachtet), `baseSrc`, `hairUnderCap`, `erodeCover`. Das Hemd der Grundfigur selbst wird nicht maskiert.
- **Abstände nach Zusammenhang:** `GarmentCtx { under, coat }`. Schärpe, Halstuch und Mantel rechnen mit der Außenfläche des Oberteils darunter. `guertelEng` entfällt (jetzt `guertel` mit `under: 'eng'`).
- **Gewichte nach dem Glätten:** verschobene Punkte übernehmen die Gewichte der Haut unter ihrer neuen Lage; Nahtpunkte teilen sich ein Ergebnis.
- **Sockets** (`entities/character/sockets.ts`): `SocketRig` mit `head`, `chest`, `legs`, `feet`, `hands`, `mainHand`, `offHand`; `node()` liefert eine Halterung in Metern mit +Z nach vorn, `bone()` den rohen Knochen. `SkinAnchor` bewegt sich mit gewichteten Knochen wie ein Hautpunkt (ohne neue Objekte je Bild). Laterne, Waffen, Hut, Knoten, Schnalle und Schulterstücke hängen an Sockets bzw. Ankern.
- **Ausrüstung als Daten** (`data/equipment.ts`): `EQUIPMENT`, `Loadout`, `loadoutFromLook`, `resolveLoadout`. `Character.equip(loadout)` setzt Ausrüstung unabhängig vom Aussehen; `setLook` leitet sie wie bisher ab. Spielstände sind unverändert.
- **Hüllkugel:** `Character.fitCull` setzt je Netz eine feste Kugel (3,2 m), weil `SkinnedMesh` seine Kugel sonst nur einmal aus der ersten Pose berechnet.
- Nicht umgesetzt aus Phase 1: feste Zeichenreihenfolge der durchscheinenden Gesichtsteile (in den Bildern kein Fehler sichtbar; die Änderung hätte Wimpern vor Rauch zeichnen können) und der Freiraum ohne Deckel (durch die Abstände nach Zusammenhang nicht mehr nötig).

## 2.9.57 – Polish-Runde: Stabilität, Wege an Deck, Handy-Anzeige, schnellere Schiffsbauten (12.11.2026)

Diese Runde ist eine gründliche Prüfung von Code, Logik, Grafik und Gestaltung. Gefunden und behoben:

- **Speicherleck bei der Crew:** Beim Neuaufstellen der Crew (Schiffswechsel, Anheuern) blieben die Grafikteile der Schiffskatze im Grafikspeicher. Pro Aufstellung gingen etwa zehn Netze verloren. Jetzt werden sie freigegeben (Probe: Grafikspeicher bleibt über fünf Runden mit je sechs Aufstellungen konstant).
- **Deck immer begehbar:** Beim Fregattentyp bildeten Beiboot, Luke, Geschütze und Fässer eine durchgehende Sperre, man kam nicht von der Achterdeck-Treppe zum Vordeck. Der Schiffsbau prüft jetzt bei jedem Aufbau per Flutfüllung, ob noch ein durchgehender Weg bleibt (Treppenfuß hinten bis Treppenfuß vorn, Achterdeck-Treppe bis Steuerrad), und lässt Teile sonst weg. Probe für alle sieben Klassen: Steuerrad, Treppen, Vordeck und Bugspitze sind erreichbar (96–100 % aller freien Flächen).
- **Keine übereinanderstehenden Aufbauten:** Fässer, Kisten, Deckgeschütze, Karronaden und Tonnen am Achterdeck überlappten sich teilweise; sie prüfen jetzt ihren Platz. Tonnen stehen nicht mehr am Austritt der Achterdeck-Treppe. Doppelte Mast-Hindernisse entfernt.
- **Beiboot, Segel:** Segel bleiben nicht mehr durchsichtig, wenn man aus der Draufsicht an Land geht oder ins Menü wechselt.
- **Laternen-Lichter ruhiger:** Die Lichter wechseln nicht mehr schlagartig zwischen Trägern (erst ausblenden, dann springen) und erzeugen keinen Speichermüll je Bild mehr.
- **Handy-Anzeige:** Meldungen werden nicht mehr mit „…“ abgeschnitten, sondern umbrochen. Im Hochformat lagen Hinweis, Meldung und Auftragsanzeige übereinander; sie stehen jetzt untereinander.
- **Editor:** Die Kompassleiste hing noch über dem Figuren-Editor und den Fenstern (Inventar, Fähigkeiten) und ist dort jetzt aus.
- **Schiffsbau schneller:** Die Konturen großer Schiffe brauchten über 140 ms (Textschlüssel je Eckpunkt). Mit Zahlenschlüsseln sind es etwa 35 ms; der Bau des Leviathan sank von etwa 210 ms auf etwa 100 ms, der der Fregatte von etwa 115 ms auf etwa 60 ms. Das mindert das Ruckeln, wenn große Feindschiffe auftauchen.

**Geprüft (alles ohne Fehler):** `tsc`, 69 Tests, Produktionsbau; 45 Kombinationen aus Wetter und Tageszeit (keine schwarzen oder überbelichteten Bilder); alle fünf Grafikstufen; Wechsel der Stufen (Lichterzahl, Programme); Entern aller sieben Schiffsklassen (Höhe von Spieler und Gegnern auf dem fremden Deck, keine Gegner in Hindernissen); Sturm-Probe (Spielerhöhe folgt dem Deck auf wenige Zentimeter bei Neigungen bis 0,22 rad); Insel betreten und verlassen (Speicher flach); zwei Minuten Segeln mit Wetterwechsel (keine NaN, kein Fehler, Speicher stabil); alle Menüs ohne Fehler; Handy-Hochformat (Niedrig und Mittel). **Nicht geprüft:** echte Maus, Tastatur, Gamepad und Touch; echtes Handy; Kämpfe über längere Zeit; Audio; Laufen über die Kurventreppe mit echter Steuerung.

**Technik (für Entwickler):** `shipBuilder.ts`: `Occ` (Belegungsraster, Flutfüllung), `canAdd`/`fits`, Mast-Ringe früh als Hindernisse; `outline.ts`: `ensureOutlineNormals` mit Zahlenschlüssel; `lamps.ts`: `LampPool` mit fester Zuteilung; `crewAboard.ts`: `disposeObject` für die Katze; `seaWorld.ts`: Segel zurücksetzen; `game.ts`: Kompass im Editor aus; `styles.css`: `.toast` umbrechend, Hochformat-Abstände.

## 2.9.56 – Prunkaufgang, begehbares Vordeck, Laternen an den Figuren, stimmungsvollere Tageszeiten (12.11.2026)

- **Treppen repariert:** Auf den Stufen standen Fässer und Kisten, weil die Standflächen schon am Achterdeck-Aufgang begannen; die Luke konnte im Mast stehen. Jetzt beginnen Fässer, Kisten, Luke, Deckgeschütze und Crew-Plätze erst hinter dem Treppenfuß, und die Luke weicht den Masten aus.
- **Seegang:** Die Laufhöhe an Deck folgte nur dem Auf und Ab des Schiffs, nicht dessen Neigung (Nicken und Rollen). Im Sturm schwebte man dadurch über den Planken oder steckte darin, besonders auf den Treppen. Die Höhe wird jetzt aus der echten Lage des Decks berechnet (Probe: 0,2 rad Rollen verschiebt die Höhe 10 m seitlich um 1,97 m, erwartet 1,99 m).
- **Prunkaufgang beim Leviathan:** Die Doppeltreppe liegt oben beidseits der Kajütentür und schwingt unten in einer Trompetenkurve nach außen, mit schrägen Stufen, breiteren Antrittsstufen, gebogenen Handläufen, Zierpfosten und goldenen Kugeln unten. Wangen und Höhe folgen der Kurve (Probe: stufenloser Anstieg, größter Sprung 8 cm).
- **Vordeck begehbar bis zum Bug:** Der Aufbau am Bug ist kein Klotz mehr. Zwei Treppen beidseits der Doppeltür führen aufs Vordeck, das bis in die Bugspitze reicht, mit Plankendeck, Reling rundum, Pollern, Tauwerk und Buggeschützen (ab Korvette). Man kommt auf jedem Schiff bis ganz nach vorn (93 % der Halblänge, gerechnet für alle sieben Klassen). Die Nagelbank des Vormasts steht auf dem Vordeck.
- **Laternen an den Figuren:** Kapitän, Bewohner, Crew und Gegner tragen eine kleine Laterne an der rechten Hüfte, sie pendelt beim Gehen. Das Glas glüht ab der Dämmerung. Echtes Licht geben die nächsten Träger (Hoch 3, Maximal und Ultra 4, Mittel 2, Niedrig nur sichtbares Leuchten): warmes, leicht flackerndes Punktlicht.
- **Stimmung:** Nächte heller und blauer (Mondlicht-Himmel, Meer und Wolken angehoben, Mond mit Hof, mehr und farbige Sterne, Sternenstaub, Milchstraße, stärkere Mondspiegelung), Abendrot und Dämmerung satter (Orange, Magenta, Violett, breites Glutband am Horizont), Mittag kräftiger blau, Morgenrot wärmer. Neue Farbkorrektur nach Tageszeit: nachts Mondlicht-Blau in den Schatten, zur goldenen Stunde bernsteinfarbene Lichter und violette Schatten. Bloom etwas kräftiger. Stückpforten leuchten nachts.
- **Crew-Plätze:** größere Suche nach einem freien Platz, damit niemand in Hindernissen startet.

**Technik (für Entwickler):** `lamps.ts` (`createLamp`, `lampShared`, `LampPool` mit festen Lichtern, `QualityConfig.lamps`), `Character.mountLamp`/`lamped`/`lamp`; `SeaWorld.lampPool`. `shipBuilder.ts`: `ShipModel.fore` mit Treppen, `quarter.flare` (statt `bulge`), `stairXc`/`stairN`, `FORE_T0`, Reling stoppt am Vordeck, Luke/Geschütze/Beiboot nach Treppenfuß; `islandGround.ts`: `DeckGround.height` über `matrixWorld` (Neigung), `level` mit Vordeck, `stairCx`/`stairN`, Vordeck-Wände als `blockers`, `constrain` bis `0,93 · L/2`. `grade.ts`: `uNight`, `uGold`; `renderer.setMood`; `sky.ts`: Sterne, Milchstraße, Mond; `data/world.ts`: `TIME_KEYS`. Geprüft: `tsc`, 69 Tests, Treppenläufe aller Klassen (Achter- und Vordeck), Bugspitze per Zufallswegen, Neigungsprobe, Nacht, Abend, Mittag, Leviathan-Aufgang, Vordeck, Laternen. Nicht geprüft: echtes Laufen mit Tastatur über die Kurventreppe im Seegang, Handy-Leistung durch vier Punktlichter, Morgen und Nebel, Gegnerschiffe beim Entern mit dem neuen Vordeck.

## 2.9.55 – Neue Version lädt sich im Menü selbst (11.11.2026)

- **Updates kommen an:** Die Seite hielt nach einem Update oft noch die alte Version vor, bis man zweimal neu lud. Sobald im Hintergrund die neue Version bereit ist, lädt sich das Menü jetzt selbst neu. Mitten im Spiel passiert das nicht (nichts geht verloren); der nächste Start nimmt dann die neue Version.

**Technik (für Entwickler):** `main.ts`: `controllerchange`-Handler (nur Produktionsbau, nur im Zustand `menu`/`boot`). Geprüft: `tsc`, Bau. Nicht geprüft: der Wechsel zwischen zwei echten Versionen im Browser.

## 2.9.54 – Welt-Werkstatt auf der veröffentlichten Seite freischaltbar (11.11.2026)

- **Werkstatt wieder erreichbar:** Seit 2.9.7 gab es die Welt-Werkstatt (Zeit, Wetter, Orte, Gold, Faji) nur in der Entwicklerversion. Jetzt schaltet man sie auf der echten Seite mit der Adresse `https://darnell-11.github.io/sturmkrone/?werkstatt` frei. Der Browser merkt sich das; der Knopf „Welt-Werkstatt (Test)“ steht dann im Pause-Menü. Mit `?werkstatt=aus` verschwindet er wieder. Ohne Freischaltung sehen ihn andere Spieler nicht.

**Technik (für Entwickler):** `menus.ts`: `workshopUnlocked()` (DEV oder localStorage `sturmkrone2-workshop`). Geprüft: `tsc`. Nicht geprüft: die freigeschaltete Seite im Produktionsbau.

## 2.9.53 – Gold-Knopf in der Welt-Werkstatt (11.11.2026)

- **Gold geben:** In der Welt-Werkstatt gibt es unter „Gold (Test)“ den Knopf **+10.000 Gold**. Man kann ihn beliebig oft drücken, jeder Druck gibt 10.000 Gold und speichert. Die Werkstatt gibt es nur in der Entwicklerversion, nicht auf der veröffentlichten Seite.

**Technik (für Entwickler):** `game.ts`: `testGold(n)`; `menus.ts`: Knopf `gold` in `showWorkshop`. Geprüft: `tsc`, Knopf im Spiel (200 → 10.200 → 20.200).

## 2.9.52 – Ruhiges Schiff, echte Umlaufkamera mit Draufsicht, lebendige Crew und reich ausgestattete Schiffe (11.11.2026)

- **Zittern behoben:** Verließ man bei voller Fahrt das Ruder oder ging an Land, zitterte das Schiff stark. Ursache: Das Schiff wurde zu Fuß nicht mehr fortgeschrieben, die Darstellung mischte aber weiter zwischen alter und neuer Lage (bei Tempo 14 sprang es etwa 25 cm hin und her). Jetzt liegt das Schiff still, sobald man das Ruder verlässt: Fahrt, Drehung und Interpolationslage werden gleichgesetzt (gemessen: höchstens 2,6 mm Bewegung pro Bild, Drehung 0).
- **Bug-Klotz ersetzt:** Das braune Vorderkastell war ein nackter Holzblock, man lief hindurch, und die Crew stand darin. Jetzt ist es ein massiver, nicht begehbarer Aufbau mit Deckplatte aus Planken, Goldleiste, Sockelleiste, Reling rundum, Doppeltür mit Goldrahmen, Bullaugen und (ab Korvette) zwei Drehgeschützen oben. Die Crew steht davor, nicht darin.
- **Feste Gegenstände:** Masten, Luke, Ankerwinde, Fässer, Kisten, Kompasshaus, Oberlicht, Truhen, Karronaden, Kartentisch, Beiboot und das Vorderkastell sind jetzt Hindernisse. Man läuft nicht mehr hindurch (auch auf Feindschiffen).
- **Crew arbeitet:** Statt nur zu stehen oder zu sitzen, hat jedes Crewmitglied Tätigkeiten: Köchin rührt, Zimmermann und Schmiedin hämmern, Kanoniere prüfen Kanonen und heben Kugeln auf, Segelmacherin näht, Ausguck schaut aufs Meer und winkt, Musiker jubelt, Enterkämpfer macht Liegestütze. Alle wenden sich zur Reling oder zum Mast, wechseln nach einigen Sekunden die Arbeit und gehen ab und zu zu einem neuen Platz an Deck (nur auf freiem Weg, nie durch Masten oder Fässer). Wer gerade spricht, hält inne und arbeitet danach weiter.
- **Große Schiffe mit mehr Inhalt:** Achterdeck mit Kompasshaus (leuchtendes Nachtlicht), Oberlicht, Kompassrose als Goldintarsie, Fernrohr auf Dreibein, Schiffsglocke, Heckflagge am Stock, Truhen und Drehgeschützen; ab Galeone dazu Kartentisch mit Hocker, Karronaden an beiden Seiten, Tonnen und Tauwerk. Masten mit Nagelbank (Ring, Belegnägel, Taue), Mastkorb mit Reling und goldener Spitze, Wantenspanner an der Bordwand. Ab Fregatte Deckgeschütze mit Rädern und Brooktau. Ab Korvette ein Beiboot mit Riemen auf Böcken (dort, wo zwischen den Masten Platz ist). Ab Fregatte eine Heckgalerie unter den Fenstern.
- **Geschwungene Doppeltreppe:** Das größte Schiff (Leviathan) hat zwei Treppen, die in der Mitte zur Schiffsmitte hin ausschwingen, mit gebogenen Handläufen, schrägen Stufen und goldenen Kugeln auf Pfosten unten. Man läuft sie auch wirklich hinauf (Höhe und Wangen folgen der Kurve).
- **Kamera:** Die Kamera umkreist das Schiff jetzt wirklich (Umlaufbahn mit Radius und Höhenwinkel um das Schiff). Vorher zeigte der Blick immer in Fahrtrichtung, auch bei seitlich gedrehter Kamera: das Schiff wanderte aus dem Bild, und die Kamera „drehte ein“. Der gewählte Blickwinkel bleibt jetzt stehen (Rückschwenk hinter das Schiff erst nach 8 s Ruhe und nur unter Fahrt, sanft). Steile Blickwinkel gehen bis fast senkrecht, ohne dass das Schiff unten aus dem Bild fällt.
- **Draufsicht:** Wer am größten Zoom weiter herauszoomt, bei dem kippt die Kamera Stück für Stück in eine Draufsicht (Fahrtrichtung nach oben), die Segel werden dabei durchsichtig, damit man das Deck sieht. Hineinzoomen kippt zuerst zurück.
- **Ausgeliefert:** GitHub ist wieder erreichbar; alle bisher nur lokal gesammelten Runden (seit 2.9.9) sind veröffentlicht.

**Technik (für Entwickler):** `ship.ts`: `settle()` (Fahrt, Gierrate, `course` und `prev` gleichsetzen), aufgerufen in `SeaWorld.updateFoot`. `shipBuilder.ts`: `Blocker`, `ShipModel.blockers/fore/quarter.bulge`, `block()`, Vorderkastell-Aufbau, Treppenmittellinie `stairXc`, Block „Ausstattung großer Schiffe“ mit Hilfsfunktion `carr` (Karronade). `islandGround.ts`: `DeckGround` übernimmt `blockers` als Wände, `stairCx`/`level` für gebogene Treppen, Wangen als Kette kurzer Stücke, Begehbereich endet vor `fore.z0`, `spot()` ebenso. `crewAboard.ts`: Tätigkeiten (`DECK_TASKS`), `startTask`, `tryWalk` (freie Wege), Plätze nicht in Hindernissen. `seaWorld.ts`: Schiffskamera als Umlaufbahn (`camR`, `camE`, `camTop`/`camTopS`, `sailFaded`), Blickziel entlang der Kamerarichtung, Zoom über das Maximum hinaus in `camTop`. Geprüft: `tsc`, 69 Tests, Zittertest (Schiff steht nach „Ruder verlassen“), alle sieben Schiffsklassen mit 14 Crewmitgliedern ohne Platz in Hindernissen, Kamera von hinten, seitlich, steil und in der Draufsicht (Klasse 2 und 6), Crew arbeitet und geht (Positionen über 12 s), Leviathan-Treppen und Achterdeck von oben. Nicht geprüft: Mausdrehen und Mausrad mit echter Hardware, Handy, Heckgalerie aus nächster Nähe, Laufen über die gebogene Treppe mit echter Tastatur.

## 2.9.51 – Treppen, Kapitänskajüte und prächtigere Schiffe (11.11.2026)

- **Treppe und Kapitänskajüte auf jedem Schiff:** Das Achterdeck (dort steht der Kapitän am Steuerrad) hat jetzt eine **echte, begehbare Treppe** auf der Steuerbordseite, vorn an der Kajütenwand. Mit Stufen, Wangen, Handlauf mit Zwischenholm, Docken und Pfosten mit goldener Kappe. In der Vorderwand sitzt die **Kapitänskajüte**: Tür mit Goldrahmen, Brettern, Messingknäufen, Oberlicht (leuchtet nachts) und zwei Wandlaternen. Die Treppe wächst mit dem Schiff (Breite und Länge). Das **größte Schiff (Leviathan) hat eine Doppeltreppe** beidseits der Tür.
- **Ruder verlassen ohne Versetzen:** Statt „An Deck gehen“ (der Spieler sprang mittschiffs aufs Deck) heißt es jetzt „Ruder verlassen“. Man bleibt am Steuerrad stehen und läuft selbst über das Achterdeck und die Treppe hinunter aufs Hauptdeck. Zurück: „Ans Steuer“ erscheint nur oben nahe am Rad.
- **Echte Wege und Wände:** Die Vorderwand des Achterdecks ist fest, offen nur an den Treppen; die Treppen haben seitlich Wangen. Man läuft stufenlos als Rampe hinauf und hinunter (Höhe folgt der Treppe), kann nicht durch die Wand und nicht seitlich auf die Treppe springen. Auf Feindschiffen gilt dasselbe. Die Crew steht nicht mehr auf den Stufen.
- **Prächtigere Schiffe:** Segel neu gemalt (höhere Auflösung, Bahnen mit genähten Nähten, zwei Reffbänder mit Reffbändseln, Liektau-Rand mit Ösen und Zurrings, Flicken, Wasserflecken, Schimmel an den unteren Ecken, ausgeblichene Streifen). Goldene Zierleiste an der Oberkante des Rumpfes und am Vorsteven. Goldrahmen mit Sprosse um die Heckfenster. Wimpel auf jeder Mastspitze. Das Relief des Rumpfes ist ruhiger (weniger Kratzlinien).
- **Fehler behoben:** Kielwasser endete bei hohem Tempo mit einer hellen Querlinie hinten; die letzten Spurpunkte blenden jetzt aus.
- **Sicherung:** `backups/schiff-2.9.51/`.

**Technik (für Entwickler):** `shipBuilder.ts`: `ShipModel.quarter` (z0, z1, top, stairX, stairW, stairLen), Treppen, Tür, Reling mit Lücken, Sheer-Zierleiste, Wimpel; `railSeg` mit Höhenparameter. `islandGround.ts`: `DeckGround` mit `level()` (Achterdeck, Rampe), Wänden (`pushWall`, seitentreu), `height(x?, z?)`, `onQuarter`, `distTo`, `world`. `seaWorld.ts`: `goDeck` bleibt am Rad, Kontext „Ans Steuer“ nur am Rad. `crewAboard.ts`: Plätze nicht auf der Treppe. `textures.ts`: neue `sailTexture` (512 × 384). Geprüft: `tsc`, 69 Tests, Schiffe der Klassen 0 bis 6 von hinten und vorn, Laufweg über die Treppe als Rechnung (Höhe 1,84 → 0), Wandtests von beiden Seiten, Spieler auf der Treppe im Bild, Entern eines Feindschiffs ohne Fehler. Nicht geprüft: Laufen mit echter Tastatur/Gamepad über die Treppe, Doppeltreppe zu Fuß, Crew auf großen Schiffen mit Treppe, Handy-Leistung durch mehr Teile je Schiff.

## 2.9.50 – Seekamera, Einsteigen, Möwen und detailliertere Schiffe (11.11.2026)

- **Seekamera (alter Fehler seit Projektbeginn):** Der Kamerawinkel wuchs beim Drehen unbegrenzt (zum Beispiel 7 Radiant) und wurde nach der Ruhepause über den langen Weg zurückgedreht, dabei drehte sich die Kamera ganze Runden „ein“ und wieder „aus“. Der Winkel bleibt jetzt immer zwischen −180° und +180°. Die Kamera selbst wurde früher als gerade Linie zur neuen Position bewegt und schnitt dabei durchs Schiff. Jetzt werden Blickwinkel (kürzester Weg), Abstand und Höhe einzeln und weich nachgeführt, der Ankerpunkt folgt dem Schiff mit leichter Verzögerung.
- **Einsteigen vom Strand:** Der Knopf „An Bord gehen“ erschien nur nahe dem einen Landepunkt (6 m). Jetzt zählt der Abstand zur Schiffshülle (Rechteck aus Länge und Breite in Schiffsrichtung gedreht, bis 14 m) oder bis zu 12 m zum Landepunkt. Von jeder Stelle am Strand, von der aus das Schiff nah ist, kommt der Knopf.
- **Möwen:** Statt zwei Dreiecken ein kleines Modell mit Körper, Kopf, gelbem Schnabel, Schwanzfächer und je Flügel Arm und Hand (weiß, grauer Mantel, schwarze Spitzen). Die Flügel schlagen auf der Grafikkarte, im Wechsel mit Gleitflug; beim Steigen kräftiger. Schräglage in der Kurve, Neigung beim Steigen, Höhenwellen. Die Gruppe am Schiff fliegt in lockerer Formation vor und neben dem Bug.
- **Schiffsfehler behoben:** (1) Flackernde Zierleiste am Achterdeck: Die goldene Leiste lag mit denselben Flächen im Kastell-Körper (Tiefenkonflikt), sie ist jetzt etwas größer. (2) Lücke am Bug: Der Bug war eine stumpfe senkrechte Wand mit offener Spitze, Deck und Reling ragten darüber hinaus. Jetzt gibt es einen nach vorn geneigten Vorsteven, der letzte Spant schließt zur Schneide, und Deck, Reling, Bugspriet, Galionsfigur und Lampe sitzen auf der neuen Oberkante. (3) Der Steuermann stand 14 cm im Deckbrett.
- **Mehr Detail:** Reling mit Handlauf, Zwischenholm, Pfosten, gedrechselten Docken und goldenen Kappen, dazu Heckreling quer über das Heck. Das Achterdeck hat eine Reling rundum mit Durchgang vorn.
- **Lebendiger:** Das **Steuerrad dreht** mit dem Ruder (voller Ausschlag etwa 140°, leichter Nachlauf), der Steuermann lehnt sich in die Kurve.
- **Steuermann (Nachtrag):** (1) **Drehung im Kreis behoben:** Die Neigung des Oberkörpers wurde Bild für Bild auf die Wirbelsäule aufaddiert, sobald ein Clip diese Knochen nicht jedes Mal neu setzt (beim Steuern der Fall). Der Oberkörper kippte dadurch immer weiter und drehte sich endlos im Kreis. Die Neigung wird jetzt vor der Animation wieder abgezogen und neu angelegt, sie summiert sich nicht mehr auf (gilt für alle Figuren). (2) **Keine Waffe am Ruder:** Am Steuer ist die Hand leer und leicht geschlossen; die Waffe kommt beim Verlassen des Ruders zurück. (3) **Hände am Rad:** Beide Arme werden jedes Bild per Zwei-Knochen-Zielführung zu den Radgriffen auf 10 und 2 Uhr gestreckt (Ellbogen nach außen und unten) und drehen mit dem Rad mit.
- **Hände am Rad (Überarbeitung):** Die erste Fassung sah schlecht aus (eine Hand verbogen, die andere steif). Ursache war ein Fehler in der Armführung: Die Hilfsvektoren fielen zusammen, dadurch überschrieb die Handgelenk-Position das Ziel des Ellbogens und der Oberarm drehte sich nicht. Behoben. Dazu ist das Steuerrad etwas kleiner (85 %), sitzt tiefer und näher am Steuermann, die Hände greifen oben auf 11 und 1 Uhr: Die Arme gehen jetzt nach vorn, leicht angewinkelt, statt weit zur Seite zu zeigen.
- **Sicherung:** `backups/schiff-2.9.50/` (seaWorld, ship, shipBuilder, life vor dieser Runde).

**Technik (für Entwickler):** `seaWorld.ts`: `camYaw` mit `atan2` normiert, `camAz`/`camBackS`/`camUpS`/`camAx` geglättet, `camSailInit`; `shipReach()` für den Einsteigen-Knopf. `gull.ts` neu (Instanzen mit `aFlap`-Attribut, Flügelschlag im Vertex-Shader). `shipBuilder.ts`: `rakeAt`, `edge()`, Reling über `railSeg()`, `ShipModel.wheel` (Rad als ein Netz, nicht mit dem Schiff verschmolzen). `ship.ts`: `wheelA`, `steerAmount`. `character.ts`: `undoLean`/`leanApplied`, `reach()` (Zwei-Knochen-IK mit `aimBone`), `hold(side, obj, grip)`; `seaWorld.ts` ruft `reach` nach dem Schiffsbild auf. Geprüft: `tsc`, 69 Tests, Schiffe der Klassen 0, 1, 2, 4, 5 von mehreren Seiten, Möwen im Flug, Rad in der Kurve. Nicht geprüft: die Kamera und das Einsteigen im echten Spiel mit Maus und Gamepad (nur nach Code und Rechnung), Kamera im Hochformat, Steuermann-Haltung im Spiel, große Schiffe: untere Stückpforten stehen leicht vor der Bordwand.

## 2.9.49 – Zurück auf das Wasser von 2.9.48, nur das Kielwasser biegt sich in Kurven mit (11.11.2026)

- **Zurückgenommen:** Alle Wasser-Änderungen der verworfenen Zwischenrunde (neue Wellenverteilung mit Gruppen, schärfere Kräuselung, Spurhöhe, Schaumsäume) sind raus. Wellen, Licht, Farben und Kräuselung sind wieder genau wie in 2.9.48. Die verworfene Fassung liegt zur Ansicht unter `backups/wasser-2.9.49-verworfen/`.
- **Neu, nur die Logik der Spur:** Der Schaum hinter dem Schiff liegt in Spurkoordinaten (seitlicher Abstand zur gefahrenen Bahn und Alter). Er bleibt im Wasser liegen, wo das Schiff gefahren ist, biegt sich in Kurven mit dem Fahrweg, wird mit der Zeit breiter und dünner und zerfasert. Spurpunkte entstehen alle 2,4 m Fahrweg statt nach Zeit (keine Lücken bei hohem Tempo). Die Spur läuft am Heck und am ältesten Punkt weich aus, ohne gerade Kante.
- **Keine Linien mehr neben Schiffen:** Die Spur verformt das Wasser nicht (das hatte Haarlinien erzeugt). Der starre V-Ansatz am Rumpf endet nach etwa einer Rumpflänge, bei Feindschiffen vorher bis zu sieben Längen.

**Technik (für Entwickler):** `ocean.ts`: `skWakeFind` (nächster Spurpunkt, Endenausblendung `endK`), Schaumteppich im Fragment-Shader, `skDispH = skHullH`, Cache-Key `sk-ocean25`. `seaWorld.ts`: Spurpunkte nach Wegstrecke (`WAKE_INTERVAL` entfernt). `data/world.ts` und alle Wasserwerte wie 2.9.48. Geprüft: `tsc`, Geradeaus, Kurven nach beiden Seiten, alle fünf Stufen ohne Shader-Fehler. Nicht geprüft: Handy, Nacht, Feindschiffe mit gebogener Spur (haben nur den kurzen Rumpfansatz).

## 2.9.48 – Echte Delfine, weiche Schiffsbewegung, keine weißen Striche mehr (11.11.2026)

- **Delfine neu gebaut:** Statt Kugel, Kegel und Brett gibt es jetzt einen glatten Delfinkörper mit Schnabel, Melone und Schwanzstiel, grau oben und hell am Bauch, mit Rückenflosse, Brustflossen und Fluke. Der Körper schlängelt sich wie bei echten Tieren (Welle von der Nase zum Schwanz, die Fluke folgt). Sie begleiten das Schiff in 9–15 m Abstand, tauchen mit der Rückenflosse auf, springen in echten Bögen (Neigung folgt der Flugbahn, Nase vorn) und tauchen mit Gischt wieder ein. Sie halten mit dem Schiff Schritt (vorher blieben sie bei Tempo 20 zurück) und sinken am Ende ab, statt zu verschwinden. Sie werden wiederverwendet, es entsteht kein Speicherleck mehr.
- **Weiße Striche auf Deck und Rumpf:** Die Eichentextur enthielt 18 senkrechte weiße „Salzstreifen“ über die ganze Höhe, die als Striche über Deck und Bordwand liefen. Sie sind durch wenige kurze, sehr schwache Fahnen ersetzt; helle Maserung abgeschwächt, Relief und Glanz von Rumpf und Deck gedämpft. Am Heckspiegel bleiben feine helle Fugenkanten sichtbar.
- **Schiff und Wasser geschmeidiger:** Höhe, Neigung und Rollen des Schiffes folgen den Wellen jetzt über gedämpfte Federn (je größer das Schiff, desto träger) statt Welle für Welle sofort. Das Schiff hebt bei Fahrt den Bug leicht. Gischt von den Bugflanken ist feiner.
- **Mehr Wasser-Look:** Großflächige Farbfelder (türkisgrün bis tiefblau) färben das Meer langsam und ohne Wandern, dazu die früheren Verbesserungen von 2.9.46/47.
- **Sicherung:** `backups/wasser-2.9.48/`.

**Technik (für Entwickler):** neue Datei `world/dolphin.ts` (`DolphinModel`: Ringe mit Radienprofil, Vertexfarben, CPU-Schlängeln mit `computeVertexNormals` und Nachführen von `outlineNormal`, Fluke-Gelenk); `world/life.ts` Pool, Sprungbahn `hAt`, Lage relativ zum Schiff. `ship.ts`: Federn `sm` (Eigenfrequenz 2,6 → 1,2 rad/s). `textures.ts`: Salzstreifen. `ocean.ts`: Farbfelder, Cache-Key `sk-ocean18`. Geprüft: `tsc`, 69 Tests, alle fünf Stufen ohne Shader-Fehler (2–5 ms), Delfine im Sprung und beim Schwimmen in Bildern. Nicht geprüft: Delfine bei Nacht und Sturm, Handy, Delfine bei Kurvenfahrt und beim Entern, Gefühl der neuen Schiffsfederung am Gamepad.

## 2.9.47 – Schwere Schiffe, Spur im Wasser, weicheres Meer (11.11.2026)

- **Warum das Wasser „zog“:** Eine 18-m-Schaluppe fuhr mit rund 29 m/s (über 55 Knoten), das Wasser schoss darum wie ein Fluss unter ihr durch. Das Grundtempo aller Schiffe ist jetzt rund 27 % niedriger (`SEA_SPEED` 1,3 → 0,95, Schaluppe etwa 21 m/s).
- **Schwerfälliges, mächtiges Steuern:** Alle Schiffe haben jetzt Masse. Ruderausschlag baut die Drehung langsam auf und ab, die Drehgeschwindigkeit ist deutlich geringer (Schaluppe etwa 0,6 rad/s, Leviathan etwa 0,25), je größer das Schiff, desto träger beim Beschleunigen, Bremsen und Wenden. Kurven kosten etwas Fahrt, das Schiff neigt sich in die Kurve und **driftet seitlich**: die Fahrtrichtung folgt dem Bug mit Verzögerung, man sieht, wie der Rumpf über das Wasser schiebt.
- **Spur im Wasser statt am Schiff:** Bugwelle-V, Querwellen und Heckmulde hingen starr am Rumpf und schwenkten in Kurven mit. Jetzt entsteht alles hinter dem Heck aus den gespeicherten Spurpunkten und bleibt im Wasser liegen, wo das Schiff gefahren ist. In Kurven biegt sich die Spur mit dem Fahrweg und klingt langsam ab. Nur der kurze Ansatz am Bug bleibt am Rumpf.
- **Weicheres, natürlicheres Meer:** Weniger spitze Kämme (Wellensteilheit rund 18 % niedriger), sanftere Kräuselung ohne lange Streifen, feineres Gitter. Das Brechen von Schaum an den Verdrängungswellen setzt erst bei steilen Kanten ein, das Kielwasser ist schmaler und zerfasert.
- **Nachtrag – „fließt durchgehend“ (auch im Startbild):** Ursache waren zwei Dinge. Erstens wanderten alle Rausch- und Schaummuster mit einer festen Geschwindigkeit in eine Richtung, das sieht wie ein Fluss aus. Sie schwingen jetzt hin und her, ohne Nettobewegung. Zweitens bestand die Kräuselung aus wenigen Wellenrichtungen und bildete lange, gleichlaufende Streifen (wie Seide). Jetzt kommt sie aus allen Richtungen (goldener Winkel, 18 Wellen, 9 m bis 0,5 m), schwächer und mit der Windrichtung leicht bevorzugt. Die Fresnel-Spiegelung nutzt eine geglättete Normale, damit flach geschautes Wasser nicht zwischen dunkel und gleißend flackert.
- **Sicherung:** `backups/wasser-2.9.47/` (Wasser, Seewelt und Schiff vor dieser Runde).

**Technik (für Entwickler):** `ship.ts`: `yawRate`, `course` (Abdrift), Masse `m` aus `cls.L`; Kurswinkel-Reset bei Sprung über 1 rad (Teleport, Respawn). `ocean.ts`: `hullGlsl(wakeN)` mit `skHullH` (Rumpf, Flag `uHull.w` = hat Spur) und `skWakeH` (nächster Punkt des Spurzugs, nicht Summe aller Abschnitte, sonst entstehen Kanten), neues Uniform `uWakeD` (Richtung, Halbbreite, Tempo), `skDispH` im Vertex- und Fragment-Shader, Cache-Key `sk-ocean17` (`skOsc` für schwingende Muster). `seaWorld.ts` schreibt Spurpunkte mit Fahrtrichtung. Geprüft: `tsc`, 69 Tests, Kurvenfahrt mit Bildern, alle fünf Stufen ohne Shader-Fehler (2–7 ms je Bild am Desktop), Feindschiffe. Nicht geprüft: Handy, Gamepad-Stick-Gefühl, Balance der Gefechte mit dem neuen Tempo und den Wenderadien.

## 2.9.46 – Meer mit echtem Licht und lebendigem Seegang (11.11.2026)

- **Sonnenglanz wie in echt:** Die Spiegelung der Sonne rechnet jetzt wie bei echtem Wasser (GGX-Glanz an den Wellenfacetten mit Fresnel). Bei tiefer Sonne entsteht eine breite, warme Glitzerbahn bis zum Horizont, die nah an der Kamera in einzelne Funken zerfällt und in der Ferne weich wird. Mit mehr Wind und höherem Seegang wird die Bahn breiter.
- **Himmelsspiegelung und Fresnel:** Flach geschaut spiegelt das Meer den Himmel fast vollständig, steil geschaut sieht man tief ins Wasser. Der Himmel in der Spiegelung hat Horizontaufhellung und einen warmen Schein um die Sonne. Dünne Wellenkämme gegen die Sonne leuchten grün-türkis, Wellenflanken und Tiefe bekommen Streulicht.
- **Lebendigerer Seegang:** Drei zusätzliche Wellenschichten (Windsee 46 m, 27 m und feines Kabbelwasser 8,5 m). Das Meer arbeitet unruhiger und weniger gleichmäßig; die Schiffe schaukeln mit.
- **Weißkappen und Schaumschleppen:** Wellengruppen türmen sich in Böen auf und fallen zusammen. Hinter jedem brechenden Kamm bleibt eine Schaumschleppe zurück, die langsam zerfällt. Im Sturm bricht der Schaum in Strähnen und Fäden statt in flachen Platten.
- **Sicherung:** `backups/wasser-2.9.46/ocean.vor-runde.ts`.

**Technik (für Entwickler):** `ocean.ts`: GGX (`rough` aus Wind, Seegang und Entfernung, `min(spec, 60)`), Schlick-Fresnel mit Faktor 1,35, Funkeln über Mikronormale, Wellengruppen `grp`, Schaumschleppe über zwei zusätzliche `skGerstner`-Aufrufe in Laufrichtung der Hauptwelle (nur ab `uDetail > 0.7`), Strähnenrauschen gegen Platten. `data/world.ts`: drei neue `WAVES`. Cache-Key `sk-ocean11`. Geprüft: `tsc`, 69 Tests, Mittag, Abend (vier Blickrichtungen), Sturm, Nacht, alle fünf Stufen ohne Shader-Fehler (3–5,5 ms je Bild am Desktop). Nicht geprüft: echte Handys, Mondglanz bei Nacht (Mond war nicht im Bild), Nebel.

## 2.9.45 – Das Schiff spaltet das Wasser wirklich (11.11.2026)

- **Nicht mehr „ziehend“:** Alle Wellen und Schaummuster laufen jetzt deutlich ruhiger (Wellen mit rund 40 % der bisherigen Geschwindigkeit, Kräuselung, Kaustiken, Schaumstreifen und Brandung ebenfalls langsamer). Das Meer wirkt schwer und weit statt wie ein reißender Fluss. Schiffe schaukeln passend dazu.
- **Echte Wasserverdrängung:** Das Schiff verformt die Wasseroberfläche selbst: Bugwulst vor dem Steven, Mulden an der Bordwand, zwei V-förmige Bugwellen-Kämme mit Querwellen, Heckwellen und ein Loch im Kielwasser. Das ist echte Geometrie mit richtigen Lichtreflexen, nicht nur Textur.
- **Schaum bricht dort, wo es steil wird:** Auf den steilen Verdrängungskämmen bricht das Wasser in Fäden und Bläschen, Luftblasen färben es heller und türkis.
- **Neues Kielwasser:** Ein zusammenhängendes Band statt einzelner Scheiben, das nach hinten breiter, dünner und spitzenartiger ausläuft.
- **Gischt:** Feine Tröpfchen werden von den Bugflanken seitlich weggeschleudert, am Bug spritzt es hoch, am Heck wirbelt feiner Nebel (die großen weißen Kugeln sind weg).
- **Sicherung:** `backups/wasser-2.9.45/` (Wasser und Seewelt vor dieser Runde).

- **Prüfrunde der offenen Punkte (gleiche Version):** Wasser im Sturm bei Nacht, bei Regen am Mittag und im Nebel bei Dämmerung angesehen, mit fünf Feindschiffen in der Nähe: keine Shader-Fehler, alle fünf Grafikstufen laufen sauber (Desktop 3,6 ms Niedrig bis 7,5 ms Ultra je Bild). Seegefecht 25 Sekunden simuliert (Breitseiten, Schaden an beiden Seiten, ein Feindschiff versenkt): keine Fehler, keine ungültigen Zahlen. Speicher bei acht Stufenwechseln und drei Wetterwechseln stabil (Geometrien und Texturen gleichbleibend). Minikarte kostet etwa 0,2 ms je Zeichnung.
- **Behoben:** Regentropfen-Spritzer waren große weiße Kugeln, jetzt klein. Handys (Niedrig/Mittel) berechnen die Wasserverdrängung nur für 2 bzw. 3 Schiffe, Niedrig ohne Feinnormale. Pausenmenü hat jetzt Auftragsbuch, Inventar und Faji-Talente, damit Gamepad- und Touch-Spieler sie ohne Tastatur erreichen (vorher hatten sie dort keine Taste).
- **Kein Fehler:** Die Zahl der Shader-Programme stieg anfangs bei Stufenwechseln leicht, das war nur das erstmalige Übersetzen je Stufe. Nach den ersten Durchläufen bleibt sie stabil (406, keine Duplikate). Echte Handys, Touch-Gesten und Gamepad-Steuerung am Gerät konnte ich ohne Hardware nicht testen.

**Technik (für Entwickler):** `ocean.ts`: `HULL_GLSL`/`skHullH` (Vertex und Fragment, Normale per Differenz, `skHg` für Brechschaum), `WAVE_SPEED = 0.42` (gilt auch für `heightAt`), Kielwasser als Segmentband zwischen `uWake`-Punkten, Cache-Key `sk-ocean9`. `particles.ts`: `EmitOpts.size/vx/vz` (Größe in `iT.w`). `seaWorld.ts`: Flanken-, Bug- und Heckgischt. Geprüft: `tsc` fehlerfrei, keine Shader-Fehler, Bilder von vorn, seitlich und hinten. Nicht geprüft: Sturm und Nacht, Feindschiffe, Handy-Leistung (Vertex-Schleife über bis zu 6 Schiffe).

## 2.9.44 – Wasser schäumt um den Rumpf, statt dass eine Fläche dranhängt (11.11.2026)

- **Bugwelle und Rumpfschaum neu:** Die aufgesetzten Schaum-Flächen links, rechts und vorn am Schiff sind weg (sie sahen wie angeklebte Bilder aus). Stattdessen zeichnet das **Wasser selbst** den Schaum, im selben Shader wie Wellenkämme und Kielwasser: feiner Spitzenschaum direkt an der Bordwand (am Bug am breitesten, mit Tempo mehr), zwei **V-förmige Bugwellen-Kämme** (Kelvin-Winkel etwa 20°), ein Gischtwulst vor dem Steven und Schaum, der mit der Strömung am Rumpf entlang nach hinten läuft. Er liegt auf den Wellen, verändert sich mit Tempo, Kurs und Zeit und hat keine harten Kanten.
- Gilt für das eigene Schiff und die sechs nächsten Schiffe in Sichtweite (weiter weg blendet es aus, damit es nichts kostet). Gesunkene Schiffe schäumen nicht mehr.

- **Natürlicherer Schaum (Überarbeitung):** Der Schaum ist nicht mehr glatt und weiß, sondern besteht aus Strähnen entlang der Strömung, Bläschen und dünnen Stellen mit ausgefranstem Rand. Luftblasen färben das Wasser rund um Rumpf und Bugwelle heller und türkis (Tiefe unter dem Schaum). Die Wasseroberfläche selbst blieb unverändert.
- **Sicherung:** Das Wasser (`ocean.ts`) vor allen Änderungen dieser Sitzung liegt als Kopie unter `backups/wasser-2.9.44/ocean.original-vor-sitzung.ts`, dazu der Stand mit Rumpfschaum und eine Kopie des ganzen Quellcodes unter `backups/projekt-2.9.44/`.

**Technik (für Entwickler):** `world/ocean.ts`: Uniforms `uHull`/`uHullD` (`setHulls`, höchstens 6) und Schaum im Fragment-Shader in Schiffskoordinaten; `world/seaWorld.ts` meldet die Rümpfe je Bild (`Ship.hullFx`). Aus `shipBuilder.ts` und `ship.ts` sind Schaumnetz und Schaum-Textur entfernt. Geprüft: `tsc` fehlerfrei, im Spiel von hinten und von der Seite gesehen, keine Shader-Fehler. Nicht geprüft: Nacht und Sturm, Feindschiffe im Kampf, Handy-Leistung.


## 2.9.43 – Closed Beta 1.0: Vorwärmen, Leistungs-Wächter, stimmiges Bild (11.11.2026)

### Übersicht: die 15 System-Upgrades der Closed Beta

| # | System | Version | Kurz |
|---|---|---|---|
| 1 | Schiffe 2.0 | 2.9.36 | Eichenholz, Kupferkanonen, Laternen mit Licht, Takelage, Segel mit Windbiegung, Bugwelle |
| 2 | Häuser, Bäume, Felsen | 2.9.37 | Mauerwerk, Dachziegel, Fachwerk, Fenster mit Scheibe, Props, Borke, Blatt-Durchleuchtung, Moos |
| 3 | Licht-Kalibrierung | 2.9.38 | Mittagskurve, stärkere Kontaktschatten, Lichter bei Nacht und Sturm, Bodennebel |
| 4 | Talentbaum (K) | 2.9.39 | Faji-Baum per Taste K, Punkte für Passive und Aktiv-Fähigkeiten |
| 5 | Waffenwechsel | 2.9.39 | Q/Z/X, Wechselschlag mitten in der Kombo |
| 6 | Siegesfanfaren | 2.9.39 | Beute-Karten, Fanfaren, Zeitlupe beim Boss-Todesstoß, Siegesbild |
| 7 | Sprechende NPCs | 2.9.40 | !/?-Zeichen, „E · Sprechen“, benannte Dorfbewohner |
| 8 | Dialogsystem | 2.9.40 | Anime-Fenster, Schreibmaschine, verzweigte Antworten |
| 9 | Auftragsbuch (L) und Tracker | 2.9.40 | Haupt- und Nebenaufträge, Verfolgen, Fortschrittsbalken |
| 10 | Inventar (I) | 2.9.41 | Raster mit Ausrüstung und Verbrauchsgütern |
| 11 | Ausrüstung und Werte | 2.9.41 | Kopf, Rüstung, Waffe, Zubehör; Werte und 3D-Modell in Echtzeit |
| 12 | Schnellleiste (1–4) | 2.9.41 | Tränke und Stärkungen mit Abklingzeit-Kreis |
| 13 | Minikarte | 2.9.42 | Dreht mit der Kamera, echte Inselformen, Sichtkegel, Symbole |
| 14 | Kompassleiste | 2.9.42 | Gradskala mit Feinden, Bossen, Auftragspersonen, Ziel |
| 15 | Weltkarte (M) | 2.9.42 | Vollbild, ziehen und zoomen, Inselinfo, „?“ für Unentdecktes |

Dazu in dieser Version der Feinschliff für die Closed Beta:

- **Vorwärmen beim Laden:** Der Ladebildschirm übersetzt jetzt zusätzlich die Shader aller sieben Schiffsklassen (Rumpf, Segel, Takelage, Schaum), lädt **alle Texturen der Szene** (Inseln, Dörfer, Schiffe) schon auf die Grafikkarte, stößt alle Partikelsysteme (Gischt, Staub, Funken) einmal an und wärmt **jeden wichtigen Klang** (Treffer, Schuss, Fanfaren, Wechsel …) beim ersten Tippen fast lautlos vor. So entfällt das Stocken beim ersten Erscheinen von Schiffen, Texturen und Klängen. Die Inseln selbst stehen schon beim Start komplett in der Szene, ihre Programme sind damit vorübersetzt.
- **Leistungs-Wächter:** Fällt die Bildrate unter 50 fps (zwei Messfenster à 2,5 s), nimmt das Spiel der Reihe nach unsichtbare Last weg: **Stufe 1** halbiert die Schattenkarte und senkt AO-Richtungen und -Schritte, **Stufe 2** viertelt sie, begrenzt auf zwei Kaskaden, setzt AO auf Minimum und kürzt Vegetation und Partikel, **Stufe 3** schaltet AO, Tiefenunschärfe und Spiegelungen ab, nutzt nur noch eine Schattenkarte und kürzt die Vegetation weiter. Läuft es über 15 s mit 58 fps oder mehr, gibt er die Stufen einzeln zurück (nach einer zu frühen Rücknahme 90 s Pause). Erst wenn alle drei nicht reichen, greifen wie bisher dynamische Auflösung und dann die Absenkung der Grafikstufe. Im FPS-Anzeiger steht „Spar 1 … 3“. Nur bei automatischer Grafikstufe.
- **Stimmigeres Bild (Boden, Schiff, Tiefe):** Gras, Sand und Fels wirken nicht mehr flach neben dem sehr detaillierten Schiff. **Sand:** Windrippel, Korn und Kiesel als Relief im Licht, dunkle Treibgutkörner, hellere Rippelkämme. **Gras:** weiches Halm- und Büschelrelief, Klee- und Blütentupfer, dunkle Rillen zwischen den Büscheln. **Fels:** Risse und Schichtkanten mit Relief. Alles blendet mit der Entfernung aus (kein Flimmern). Im Gegenzug etwas ruhiger: das Eichenholz des Rumpfs (Relief 1,1 → 0,8, schwächere Fugen und Rillen). Für mehr Tiefe setzt der Dunst in der Mittelentfernung etwas früher ein.

**Technik (für Entwickler):**
- `render/watchdog.ts`: `PerfWatchdog`, `budgetConfig(base, level)`; `GameRenderer.setBudget()` baut Schatten und Nachbearbeitung mit der gesparten Konfiguration neu auf (`QualityConfig.budget`); `SeaWorld.vegLod` wird je Stufe um 17 % gekürzt. `core/game.ts` schaltet Wächter, dynamische Auflösung und Stufenabsenkung hintereinander.
- `core/warmup.ts`: Schiffsklassen, `renderer.initTexture` für alle Texturen, Entsorgung der Wegwerf-Schiffe; `audio.prewarm()` (verteilt über viele Bilder); `SeaWorld.warmup` stößt die Partikel an.
- `render/toon.ts`: `DETAIL_FRAG` für `sand`, `grass`, `rock` liefert `skDetH`/`skDetA`; der Bump-Block gilt jetzt für alle Detail-Arten.
- Tests: `tests/watchdog.test.ts` (Auslösen, Halten, Zurückgeben, Konfiguration). Geprüft: `tsc` fehlerfrei, 69 Tests grün; im Spiel Gras, Sand und Schiff angesehen, keine neuen Shader-Fehler.
- Nicht geprüft (bitte in der Beta messen): echte Ladezeit und Speicher auf Handys (7 zusätzliche Schiffe und alle Texturen beim Start), Wächter auf echter schwacher Hardware, Erscheinen von Gegnern auf neuen Inseln (die Figuren selbst entstehen weiter erst beim Betreten), Ultra-Stufe, Nacht und Regen mit dem neuen Bodenrelief.


## 2.9.42 – Minikarte, Kompassleiste und Weltkarte (11.11.2026)

- **Minikarte (oben rechts):** Sie dreht sich jetzt mit der Kamera (oben = Blickrichtung), die Himmelsrichtungen N, O, S, W wandern am Rand mit. Ein heller **Sichtkegel** zeigt, wohin du schaust, der Pfeil, wohin du läufst. Inseln erscheinen mit ihrer **echten Küstenform** (Flachwasser, Sand, Land in der Farbe der Inselart) statt als Kreise. Zu Fuß zoomt sie auf 85 m an die Insel heran, auf See zeigt sie weiter 420 m.
- **Orientierungspunkte:** Rote Punkte = Feinde, **Totenkopf** = Boss (Legenden, Boss-Inseln), **! (gold)** = Person mit Auftrag, **? (grün)** = Abgabe möglich, blaue Punkte = übrige Gesprächspartner, **Stern** = Ziel des verfolgten Auftrags. Die Symbole bleiben aufrecht, auch wenn sich die Karte dreht. Gilt für Minikarte, Kompass und Weltkarte.
- **Kompassleiste (oben Mitte):** Gradskala mit N/NO/O/…, Mittenmarke und dieselben Symbole in ihrer Richtung, bei Auftrag, Boss und Ziel mit Entfernung. Liegt ein wichtiger Punkt außerhalb des Sichtfelds, klemmt sein Symbol blass am Rand der Leiste. Feinde blenden mit der Entfernung aus. In dieser Welt liegt Osten bei −x: wer nach Norden schaut, hat Osten rechts.
- **Weltkarte (Taste M):** Vollbild mit allen sechs Meeren, allen Inseln, dem Weltrand und einem Gitter alle 500 m. Entdeckte Inseln zeigen Form und Namen, unentdeckte erscheinen als „?“. Ziehen (Maus oder Finger), Mausrad, Zwei-Finger-Geste, Pfeiltasten/WASD und +/− zoomen und bewegen; Knöpfe springen zu den Meeren, „Zu mir“ und „Alles“. Ein Klick auf eine Insel zeigt Art, Meer, Stufe, Entfernung, Boss und Auftragshinweis. Das Logbuch (Aufträge, Taten) bleibt über den Knopf „Logbuch“ und das Pausenmenü erreichbar; ein Klick auf die Minikarte öffnet ebenfalls die Weltkarte.

**Technik (für Entwickler):**
- `ui/minimap.ts`: `drawMap` bekommt `view`, `range`, `pois` und `MapOpts.shape` (Küstenlinie aus `world.islands`), neu `drawPoi`, `drawWorldMap`, `worldToScreen`/`screenToWorld`. Neu: `ui/compass.ts` (`Compass`, Canvas, zeichnet nur bei Änderung), `ui/worldMap.ts` (`WorldMapScreen`, Zeiger-Ereignisse, eigener Zeichenbetrieb nur bei Änderung).
- `core/game.ts`: `mapPois()`, `questIslandMarks()`, `mapOpts`, `openWorldMap()`, `updateCompass()`; `SeaWorld.footEnemies()`. Peilung der Leiste: Kompasswinkel = −Weltwinkel (wie die Auftragspfeile).
- Tests: `tests/map.test.ts` (Umrechnung Bildschirm ↔ Welt, Spiegelung). Geprüft: `tsc` fehlerfrei, 64 Tests grün; im Spiel Minikarte zu Fuß (Küstenform, Auftragszeichen, Ziel, Sichtkegel), Kompass, Weltkarte als Gesamtansicht und Zoom auf Ankerglück.
- Nicht geprüft: Minikarte und Kompass auf See und mit Bossen im Kampf, Weltkarte mit entdeckten Inseln aller Meere, Touch-Gesten auf einem Handy, Gamepad (Weltkarte nur mit Maus, Tastatur oder Touch), Kosten der Minikarte auf Handys (wird 10-mal pro Sekunde mit Inselformen gezeichnet).


## 2.9.41 – Inventar, Ausrüstung und Schnellleiste (11.11.2026)

- **Inventar (I):** Links die Figur im 3D-Fenster, rechts vier Ausrüstungsplätze (**Kopf, Rüstung, Waffe, Zubehör**), Werteanzeige, Raster mit allem, was du besitzt (Filter: Alles, Kopf, Rüstung, Waffe, Zubehör, Verbrauch) und die Schnellleiste. Ein Klick wählt ein Stück, **Ausrüsten** legt es an, **Ablegen** nimmt Kopf und Zubehör ab, **Benutzen** verbraucht ein Gut. I oder Esc schließt.
- **Werte in Echtzeit:** Wer ein Stück nur auswählt, sieht die Änderung als Vorschau (▲ grün, ▼ rot) bei Leben, Angriff, Volltreffer, Schadensminderung, Faji-Erholung und Goldbonus. Beim Ausrüsten gelten die neuen Werte sofort im Spiel, und das **3D-Modell** zieht sich um: Kopfbedeckung (Mütze, Dreispitz, Helm, Brille, Admiralshut), Rüstungsstufe (Weste, Kettenjacke, Gezeitenpanzer, Faji-Harnisch mit Mantel) und Klingenfarbe/Leuchten der Waffe. Das im Editor gewählte Aussehen bleibt gespeichert.
- **Ausrüstung wählen:** Gekaufte Waffen- und Rüstungsstufen bleiben im Besitz und lassen sich jetzt wieder anlegen (bisher zählte immer die höchste).
- **Neue Güter:** Festmahl (heilt 80 %), Kraftsaft (+25 % Angriff, 60 s), Eisenhaut-Trank (25 % weniger Schaden, 45 s), Falkenauge (+15 % Volltreffer, 60 s), Faji-Essenz (füllt 60 % Faji). Neue Kopfbedeckungen: Seidenkopftuch, Wollmütze, Kapitänshut, Eisenhelm, Fliegerbrille, Admiralshut. Beides gibt es am Markt; seltene und epische Beute-Säulen mit Proviant liefern jetzt oft ein besonderes Gut.
- **Schnellleiste (Tasten 1–4):** Unten am Bildschirm vier Plätze für Heiltränke und Stärkungen mit Menge und **Abklingzeit als Kreisausschnitt**; eine laufende Stärkung leuchtet mit schmalem Zeitbalken. Jedes Gut hat seine Abklingzeit, dazu eine kurze gemeinsame Pause (1,2 s). Plätze belegt das Inventar; der erste Kauf legt ein Gut gleich in einen freien Platz. Proviant liegt anfangs auf Platz 1; **H** isst weiter Proviant.
- **Tastenänderung:** Die Fähigkeiten liegen jetzt auf **F1–F3** (so heißen sie auch auf der Leiste und am Handy), die Ziffern 1–4 gehören der Schnellleiste.

**Technik (für Entwickler):**
- Neu: `data/items.ts` (Güter, Kopfbedeckungen, `ARMOR_LOOK`), `core/inventory.ts` (`computeStats`, `ensureGear`, Zählen und Ablegen von Gütern; eine Stelle für alle Werte), `ui/inventory.ts` (`InventoryScreen`, `InventoryHost`), `Hud.setItemBar`. `GearState` hat neue optionale Felder (`items`, `heads`, `head`, `bar`, `weaponEq`, `armorEq`); alte Spielstände bekommen Standardwerte (`ensureGear`), keine Migration nötig.
- `core/game.ts`: `playerStats()` speist `applyPower()` (Leben, Angriff, Volltreffer, Faji-Erholung, Schadensminderung) und das Inventar; `displayLook()` legt Kopfbedeckung und Rüstung über das gespeicherte Aussehen; `useItem()`, `tickItems()`, `buyItem()`, `buyHead()`, `openInventory()`. `PlayerFoot.gearReduce` addiert sich zur Faji-Schadensminderung. Neue Aktionen `inventory`, `item1` … `item4`.
- Tests: `tests/inventory.test.ts` (Zählen mit Obergrenze, Werte beim Ausrüsten, Stärkungen, alte Spielstände). Geprüft: `tsc` fehlerfrei, 62 Tests grün; im Spiel Kauf, Schnellleiste mit Stärkung und Abklingzeit, Inventar mit Ausrüsten, Ablegen und Vorschau, Figur zieht sich um.
- Nicht geprüft: Touch (keine Schnellleisten-Knöpfe, nur der Proviant-Knopf), Gamepad, die Marktseite im Menü auf kleinen Bildschirmen, Tränke auf See (nur an Land), Zubehör-Wechsel mit Talisman im Spiel nach neuem Fund, Inventar im Hochformat.


## 2.9.40 – Gespräche, Auftragsbuch und sprechende Dorfbewohner (11.11.2026)

- **Sprechende Personen:** In Ankerglück und in den Dörfern (Weidenbrück, Palmenküste, Sturmklippe, Fährholm) schweben über Gesprächspartnern Zeichen: **!** = Auftrag zu vergeben, **?** = Abgabe möglich. Wer nah genug steht, sieht über der Person die Aufforderung **„E · Sprechen“** mit ihrem Namen. Neue benannte Dorfbewohner: Wanda und Toni (Weidenbrück), Kiri (Palmenküste), Sven (Sturmklippe), Fenna (Fährholm).
- **Dialogfenster im Anime-Stil:** Namensschild mit Titel, Porträt, Text mit Schreibmaschineneffekt (Klick, Leertaste, Eingabe oder E überspringt), nummerierte Antworten (Klick oder Ziffern 1–9), Esc beendet. Die Gespräche verzweigen: Auftragsangebote (ansehen, annehmen oder später), Nachfragen zu laufenden Aufträgen, Themen mit eigenen Antworten (jede Person hat mindestens eines), Laden öffnen und zurück ins Gespräch. Abgegebene Aufträge werden im Gespräch mit Dank und Belohnung gewürdigt.
- **Auftragsbuch (L):** Haupt- und Nebenaufträge in zwei Reitern (laufend, erledigt) mit Auftraggeber, Einleitung, Schritten mit Haken, Belohnung und Knopf **Verfolgen** (bestimmt Anzeige und Richtungspfeil). L oder Esc schließt.
- **Auftragsanzeige am rechten Rand:** Fortschrittsbalken bei Zählschritten, Farbe nach Hauptgeschichte (golden) oder Nebenauftrag (blau), Hinweis „L · Auftragsbuch“.
- **Neue Nebenaufträge:** „Die Säulen im Norden“ (Wanda, **Erkunde die Ruinen-Insel** Versunkener Tempel, nach Kapitel 2), „Plünderer an der Küste“ (Toni, 5 Gegner), „Muscheln für den Markt“ (Kiri, Muschelruh erkunden).
- **Tasten:** **E** spricht zu Fuß (auf See bleibt E die rechte Breitseite), **L** öffnet das Auftragsbuch. Blocken liegt dafür nur noch auf **C**.

**Technik (für Entwickler):**
- Neu: `story/dialog.ts` (`DialogSession`, rein logisch), `data/dialogs.ts` (`TALKS`: Themen und Knoten je Person), `ui/dialogOverlay.ts`, `ui/npcMarkers.ts`, `ui/questLog.ts`. `data/quests.ts`: `VILLAGE_NPCS`, `VILLAGE_NPC_BY_ID`, drei neue Aufträge. `QuestSystem.setTracked()`; der gewählte Auftrag steht in `progress.flags.tracked`.
- `world/seaWorld.ts`: `talkables()` (Stadt und Dorf), benannte Dorfbewohner entstehen in `spawnCamp`. `core/game.ts`: `talkTo()` öffnet das Dialogfenster, `openQuestLog()`, `updateNpcMarkers()`. `Menus.openShop(npc, back)` ist öffentlich. Das alte Menü-Gespräch bleibt für Hafenmenü und Taverne.
- Neue Aktionen `quests` (L), `talk` (E); Tests: `tests/dialog.test.ts` (alle Knoten erreichbar, Auftrag annehmen, Abgabe, Laden, Ende), `tests/actions.test.ts` angepasst. Geprüft: `tsc` fehlerfrei, 57 Tests grün; im Spiel Ankerglück (Zeichen, Aufforderung, E, Verzweigung, Auftrag annehmen, Auftragsbuch) und Weidenbrück (Wanda, Toni).
- Nicht geprüft: Gamepad und Touch (keine Standardtaste für Sprechen und Auftragsbuch), Dialog in der Taverne (altes Menü), Laden aus dem neuen Dialog, Nebenaufträge von Wanda und Kiri bis zum Abschluss, schmale Handy-Bildschirme.


## 2.9.39 – Talentbaum auf K, Waffenwechsel, Siegesfanfaren (11.11.2026)

- **Talentbaum (K):** Der Faji-Baum (Punkte für passive Boni und Aktiv-Fähigkeiten, Vorschau, Synergien) öffnet sich jetzt mit **K** und schließt sich mit K wieder. Der schwere Angriff liegt dafür neu auf **U** (frei umbelegbar im Menü).
- **Zwei Waffenplätze:** **Q** wechselt die Waffe, **Z** wählt Platz 1, **X** Platz 2 (auf dem Handy der Knopf „Waffe“). Platz 1 ist die im Editor gewählte Waffe, Platz 2 standardmäßig Faust (bei Faustkämpfern der Säbel). Beide stehen im HUD, der aktive ist hervorgehoben; der aktive Platz wird gespeichert. Der Wechsel kostet etwas Ausdauer, Fähigkeiten-Boni passen sich der Waffe an.
- **Wechselschlag:** Mitten in einer Kombo (Hieb läuft oder Kombo-Fenster offen) setzt der Wechsel sofort einen Hieb der neuen Waffe an, mit kurzer Überblendung statt Pause, 1,6-fachem Schaden, Schockring und Speedlines; die Kombo zählt weiter. Aus der Ruhe wechselt die Waffe sofort mit Ring und Funken.
- **Siegesfanfaren:**
  - **Beute:** Seltene, epische und legendäre Funde zeigen eine Karte in der Farbe der Seltenheit (legendär größer, mit Blitz und Speedlines) und spielen je eine eigene Fanfare.
  - **Boss-Todesstoß:** Eine halbe Sekunde Zeitlupe mit Kamerastoß, Schockring und Lichtblitz, danach das Siegesbild mit rotierenden goldenen Strahlen, großem Schriftzug, Name der Legende und Belohnungen, begleitet von einer Fanfare mit Paukenwirbel und Blechakkord.

**Technik (für Entwickler):**
- `data/actions.ts`: neue Aktionen `skills`, `swap`, `weapon1`, `weapon2`; `heavy` jetzt `KeyU`. Gespeicherte eigene Belegungen bleiben gültig (nur Abweichungen vom Standard stehen im Spielstand).
- `entities/player/playerFoot.ts`: `swapTo(style)`, `swapCd`, `swMult` (Schadensfaktor des laufenden Hiebs); `STAMINA.swap`. `world/seaWorld.ts`: `swapWeapon()`, `currentStyle`. `core/game.ts`: `weaponSlots()`, `activeStyle()`, `swapWeapon()`, `refreshWeaponHud()`; `SaveData.player.alt` und `.slot` sind optional, alte Spielstände brauchen keine Migration.
- `ui/combatOverlay.ts`: `victory()` und `lootCard()`; `audio/audio.ts`: `fanfareRare`, `fanfareEpic`, `fanfareLegend`, `victory`; Zeitlupe über den vorhandenen `hitstop(0,5 s, 0,15)`.
- Neuer Test `tests/actions.test.ts` (Belegung: K/Q/U, keine Tastenkonflikte). Geprüft: `tsc` fehlerfrei, 51 Tests grün; im Spiel Wechsel aus der Ruhe, Wechselschlag mitten im Hieb (Kombo 2, Faktor 1,6), K öffnen und schließen, Siegesbild und Beute-Karte angesehen.
- Nicht geprüft: echter Boss-Todesstoß im Kampf (Zeitlupe und Siegesbild wurden direkt ausgelöst), Gamepad (keine Standardtaste für den Wechsel), Touch-Knopf auf einem Handy, Wechselschlag mit allen Waffenpaaren und Animationsübergänge im Detail, Klang der Fanfaren über Lautsprecher.


## 2.9.38 – Licht-Kalibrierung: Mittag, Kontaktschatten, Nacht und Sturm (11.11.2026)

- **Mittagssonne:** Je höher die Sonne steht, desto wärmer (leicht gelblich statt weiß-blau) und etwas schwächer wird ihr Licht; das blaue Himmelsfüllicht sinkt, die Schattenseiten werden kühler und dunkler. Stein, Holz und Gras behalten dadurch Struktur und harte Schatten, statt auszuwaschen. Die Mittags-Stimmung (12:30) ist nachgestellt.
- **Kontaktschatten:** Die Umgebungsverdeckung (High, Max, Ultra) wird mittags um bis zu 45 % stärker, weil steile Sonne sonst Häuser, Klippen und Schiffe „schweben“ lässt; im Unwetter etwas stärker. Die Stärke ist begrenzt (höchstens 1,25).
- **Nacht und Sturm:** Fenster, Laternen, Schiffs-Lichter und Leuchtfeuer gehen nicht nur nachts an, sondern auch im Regen, Nebel und Sturm am Tag (je dunkler der Himmel, desto stärker). Das Spielerschiff wirft dann sein warmes Punktlicht.
- **Nebel:** Bodennebel liegt dichter nahe der Wasserlinie und wird nach oben dünner. Er ist morgens und abends stärker, nachts und im Unwetter am stärksten. Die Nebelfarbe folgt weiter dem Horizont (golden in der Dämmerung, tiefblau nachts, graublau im Sturm), nachts schimmert der Dunst zusätzlich leicht im Mondlicht.

**Technik (für Entwickler):**
- `world/timeOfDay.ts`: `Palette.noon` (Smoothstep der Sonnenhöhe 0,6 … 0,93) beeinflusst Lichtfarbe, `lightI`, `ambientSky`, `ambientI`. `data/world.ts`: Schlüssel „Mittag“ angepasst.
- `render/atmosphere.ts`: neue Uniform `skFogGround` (Bodennebel nach Höhe über dem Meer). `render/gtao.ts`: `aoShared.boost`, `AoEffect.update()` skaliert die Stärke. `world/environment.ts` setzt beides und mindert die Schattenfarbe mittags.
- `world/seaWorld.ts`: `night` für Lichter ist jetzt `max(1 − sunVis, (grey − 0,4) · 2,2)`.
- Bewusst nicht geändert: Der SSAO-Pass bleibt auf High/Max/Ultra (Handys auf Low/Mid haben Vorrang bei den 60 FPS, siehe `CLAUDE.md`). Weitere Punktlichter gibt es nicht, es bleibt bei den zwei des Spielerschiffs; Fenster und Fackeln leuchten über Emission und Bloom.
- Geprüft: `tsc` fehlerfrei; im Spiel Dorf bei Mittag, Sturm, Abendrot und Nacht angesehen. Nicht geprüft: Kosten auf Handys, Mittag auf See mit Schiffen, Ultra, Ozean im Sturm bei Nacht, Zeitmessung gegen vorher.


## 2.9.37 – Häuser, Bäume und Felsen auf High-End-Niveau (11.11.2026)

- **Häuser:**
  - **Stein:** Mauerwerk aus Quadern im Läuferverband mit Mörtelfugen, Relief im Licht, Farbvarianten je Stein und Moos auf Oberseiten und in feuchten Flecken (auch an Ruinen, Mauern und Fundamenten).
  - **Dächer:** Ziegel- und Schindelreihen mit gerundeten, überlappenden Kanten, versetzt je Reihe; leichter Moosbelag. Das Relief folgt dem Gefälle, egal wie das Haus gedreht ist.
  - **Putz:** feine Körnung, Flecken und Schmutz an Wänden.
  - **Fachwerk:** Obergeschoss des Gasthauses mit Schwelle und Diagonalstreben.
  - **Fenster:** warmer Innenraum mit Sprossenkreuz und Vorhängen, der nachts leuchtet; davor eine spiegelnde Scheibe (tags hell mit Himmelsreflex, nachts nur ein Hauch), dazu Rahmen und steinerne Fensterbank.
  - **Stadt (Ankerglück):** Wände, Sockel und Dächer der Häuser nutzen jetzt ebenfalls Putz, Stein und Ziegel.
- **Props an Wohnhäusern** (Holzhütte, Steinhaus, Gasthaus): Pflasterweg von der Tür, Hängelaterne an der Wand und Laternenpfahl am Weg, Holzstapel mit Hackklotz, Wäscheleine mit bunten Tüchern hinter dem Haus und Lattenzaun mit Lücke für den Weg. Alles hat Kollision.
- **Bewuchs:**
  - **Borke:** Stämme haben längs laufende Rillen als Relief und dunkle Furchen.
  - **Laub und Gras:** Licht scheint durchs Blatt, wenn man gegen die Sonne schaut (gelbliches Leuchten, Subsurface-Näherung).
  - **Moos:** Felsen tragen Moos auf Oberseiten und in feuchten Flecken.
  - **Platzierung:** Dichte Grasbüschel und Farn rund um die Hauswände (Tür und Weg frei), bemooste Felsen an den Hausecken, Gras und Steine beidseitig an den Wegen.

**Technik (für Entwickler):**
- `render/toon.ts`: neue `DetailKind`-Werte `stone`, `tile`, `plaster` (Muster aus Weltposition, Fläche aus `dFdx/dFdy` der Weltposition, Achsen entlang und quer zum Gefälle). Das Muster liefert `skDetH` und `skDetA`; danach kippt die Normale per Bildschirm-Ableitung (Bump). Programmschlüssel enthalten den Detailnamen.
- `world/vegetation.ts`: `patchVeg()` setzt auf das gemeinsame Bewuchs-Material auf (Attribute `aSurf` 1 Borke, 2 Laub, 3 Fels und `aBk` für Stammkoordinaten aus dem Zylinder-UV; Optionen `surf` je Pflanze in `FLORA`). Borke, Moos und Durchleuchtung laufen im selben Shader; die Durchleuchtung nutzt die erste Richtungslichtquelle. Weiterhin ein Material und ein Zeichenaufruf je Vorlage und Kachel.
- `world/architecture.ts`: `dress()` (Props), `fachwerk()`, Fenster mit `windowTexture()`/`glassTexture()` und `glassMat` (Deckkraft in `setSiteNight`). `world/settlement.ts`: Gras und Felsen an Wänden und Wegen aus dem Bewuchs-System (`veg.add`).
- Geprüft: `tsc` fehlerfrei, 48 Tests grün, keine Shader-Fehler. Im Spiel angesehen: Ankerglück, Dorf Weidenbrück bei Tag, Abend und Nacht (Fenster, Laternen), Wald mit Borke, Moosfelsen, Blätter im Gegenlicht. Beim Test gefunden und behoben: Gras an Wegen und Wänden war doppelt so hoch wie nötig, Mauerwerk zu dunkel, Flimmern durch zu feines Rauschen im Stein.
- Nicht geprüft: Kosten auf echten Handys (mehr Shader-Arbeit je Pixel an Wänden und Laub, mehr Gras-Instanzen), Regen auf Stein und Ziegel, Ruinen, Scheune und Stelzenhütte aus der Nähe, die Stadt bei Nacht (Fenster dort noch ohne Scheibe).


## 2.9.36 – Schiffe 2.0: Details, Eichenholz, Takelage, Bugwelle (11.11.2026)

Alle sieben Klassen (Schaluppe bis Leviathan) laufen über denselben Baukasten (`buildShip`) und bekommen alles automatisch, je größer das Schiff, desto mehr.

- **Deck und Rumpf:**
  - **Eichenholz:** Neue Holz-Textur mit tiefen Rillen, langer Maserung, Astlöchern, Salzstreifen und Nägeln; der Rumpf ist dunkler und verwittert (Streifen, Schmutz an der Wasserlinie). Die Bretter haben Relief, Rauheit und Verdeckung aus der Textur.
  - **Ausstattung an Deck:** Gitterluke, Ankerwinde mit Speichen, Fässer (mit Eisenreifen) und Kisten an den Bordwänden, aufgerollte Kette, Steuerrad mit Griffen und Nabe, zweite Reling-Leiste, Anker mit Kette am Bug.
  - **Kanonen:** Kupferrohre mit Eisenbändern und Mündungswulst auf Holzlafetten; jede Stückpforte hat einen Eisenrahmen mit Ringschraube (auch die oberen Reihen).
  - **Rost-Eisen:** Beschläge, Reifen, Kette und Anker haben ein eigenes, raues Eisen-Material.
- **Laternen:** Eisengehäuse mit Deckel, Streben und Haken; neue Laterne am Mastkorb. Auf dem **Spielerschiff** werfen Heck- und Mastlaterne ein warmes, leicht flackerndes **Punktlicht**, das mit der Dämmerung aufblendet (Tag: aus).
- **Nässe:** Gischt bei schneller Fahrt in rauer See und Regen färben die Deckplanken dunkel; dazu kommen der Glanz und die Pfützen aus dem bestehenden Nässe-System.
- **Segel:**
  - **Zerfetzt:** Ausgefranster Saum, angenagte Ecken und Risse (Alpha-Maske), höhere Auflösung (10 × 6).
  - **Windbiegung:** Der Bauch wächst und schrumpft mit Böen, Wellen laufen übers Tuch, die Kanten flattern stärker; mehr Wind = mehr Bewegung.
  - **Durchleuchtung:** Steht die Sonne hinter dem Tuch, glüht es warm, tiefe Sonne stärker.
- **Takelage:** Webleinen (Sprossen) zwischen den Wanten, Rah-Hängetaue und dicke, leicht durchhängende Taue: Stage zwischen den Masten, Stag zum Bugspriet, Pardunen zum Heck.
- **Bugwelle und Schaum:** Schaumstreifen an Rumpf und Bug auf Höhe der Wasserlinie, der Bug wölbt sich weit nach außen. Deckkraft und Lauf folgen dem Tempo; bei Nacht dunkel.

**Technik (für Entwickler):**
- `entities/ship/shipBuilder.ts`: neue Bausteine `box`/`cyl`/`torus`/`cone` (geteilte Netze über `sharedGeo`), `rope()` (durchhängendes Tau aus Zylindern), `foamCanvasOnce()`. `buildShip(c, look, hero)`; `ShipModel` neu: `deckMat`, `deckBase`, `lights`, `foam`. `mergeStatic` gibt jetzt die Netze der verschmolzenen Einzelteile frei (vorher Leck) und behält Lichter.
- `entities/ship/ship.ts`: Konstruktor-Parameter `hero` (Spielerschiff: Lichter und Segel-Normalen jedes Bild). `SeaEnv` hat optional `sunDir` und `sunVis` (aus `seaWorld.seaEnv`). Segel-Ausgangsform in `userData.baseP`.
- `render/textures.ts`: `oakTexture()`, `sailTexture(..., tattered)`.
- Es gibt nur zwei Punktlichter in der ganzen Szene (Spielerschiff, Anzahl bleibt konstant, Stärke 0 am Tag), damit sich die Shader nicht neu übersetzen.
- Geprüft: `tsc` fehlerfrei, 48 Tests grün; im Spiel Schaluppe, Fregatte, Galeone und Linienschiff bei Tag, Abend und Nacht angesehen, keine neuen Shader-Fehler. Nicht geprüft: Kosten auf echten Handys (zwei Punktlichter, dichtere Rumpftextur, Segel-Neuberechnung je Bild), Regen und Gischt-Nässe an Deck, Leviathan, Schäden an Segeln mit der neuen Alpha-Maske, Feindschiffe in Kämpfen.


## 2.9.35 – PBR-Beleuchtung statt harter Toon-Stufen (11.11.2026)

- **Weiche Beleuchtung:** Die harte 3-Stufen-Rampe ist weg. Licht und Schatten gehen jetzt stufenlos ineinander über; die Schattenseite bleibt wie im Anime angehoben (32 %) und kühl getönt, hat aber keine Kante mehr. Gilt für die ganze Welt: Inseln, Gebäude, Schiffe, Figuren, Waffen.
- **Echtes Metall, Leder, Stoff, Haut:** Der Glanz der Sonne folgt jetzt dem Cook-Torrance-Modell (GGX) mit Rauheit, Metallanteil und Fresnel. Metall verliert seine matte Grundfarbe und lebt von Glanz und Spiegelung, raue Flächen glänzen breit und schwach, glatte klein und scharf. Aus dem harten „Glanzfleck“ ist ein weicher Verlauf geworden. Nässe bei Regen glättet die Fläche weiter.
- **Spiegelungen auf mehr Oberflächen:** Der Himmel spiegelt sich jetzt auch auf Leder, Haut und glattem Holz (Rauheit unter 0,75), nicht mehr nur auf Metall und Eis.
- **Feinrelief auch an der Welt:** Das prozedurale Mikro-Relief (Stoffwebung, Lederpore, gekratzter Stahl) wirkt jetzt auf das Licht, nicht nur auf den Glanz, und gilt auch außerhalb der Figuren: Metall (Kanonen, Gold, Beschläge) bekommt automatisch gekratzten Stahl, Segel gewebten Stoff. In der Ferne blendet es aus, bevor es flimmert.
- **Anime-Akzente bleiben:** Fresnel-Randlicht aus dem Himmel an Figuren, anisotroper Haarglanz und die zwei Glanzpunkte in den Augen sind unverändert; Haare und Augen bekommen keinen zusätzlichen GGX-Glanz.

**Technik (für Entwickler):**
- Es bleibt beim `MeshToonMaterial` (nur so bleiben Kaskaden-Schatten, Nebel, Nässe, Wind, Treffer-Leuchten und Auflösen in einem Shader). Der Baustein `lights_toon_pars_fragment` wird in `render/toon.ts` durch `LIGHTS_GLSL` ersetzt: `RE_Direct_Toon` mit weicher Kurve `mix(0,32, 1, smoothstep(−0,3, 0,95, N·L))`, `albedo × (1 − 0,8 · metal)` und GGX (D, Smith-Sichtbarkeit, Schlick-Fresnel, bei rauen Flächen gedämpft). Der Toon-Shader zählt `directSpecular` nicht mit, der Glanz geht deshalb in `directDiffuse`. Rauheit und Metall aus den Uniforms `uRough`/`uMetal` und den Karten; `uWet` senkt die Rauheit.
- Der alte Glanzfleck (`smoothstep(0.45, 0.55, …)` mit `uSpec`) ist entfernt; `uSpec` und `spec` in den Optionen bestimmen weiter, ob ein Material als Metall gilt.
- `ToonOptions.micro`: Feinrelief ohne Figuren-Effekte. Neue Defines `SK_MICRO` (Relief, Normalenstörung mit `SK_RELIEF` 0,35 Haut / 0,7 Stoff und Leder / 0,5 Stahl) und `SK_CHAR` (nur Figuren: Randlicht, Haut, Haare, Augen, Alpha-Maske). Die Normale selbst wird gestört (`normal = mix(normal, skMicroN, SK_RELIEF)`), damit das Diffuse mitgeht.
- `env` (Himmelsspiegelung) jetzt ab Rauheit < 0,75; Programmschlüssel `sk-toon-7`. Segel: `micro: 'cloth'`, Rauheit 0,92 (`entities/ship/shipBuilder.ts`).
- Beim Test gefunden und behoben: Der Fresnel-Glanz überzog Stoff im Gegenlicht mit Dunst (der Mantel wirkte grau und durchscheinend); er wird bei rauen Flächen jetzt mit `1 − 0,88 · rough` gedämpft.
- Bewusst nicht umgestellt: Ozean (eigener Wasser-Shader mit weicher Rampe), Himmel, Effekt-Materialien.
- Geprüft: `tsc` fehlerfrei, 48 Tests grün. Im Spiel: keine Shader-Fehler auf Niedrig, Mittel, Hoch und Ultra (alle Programme übersetzt), Figur von vorn, hinten und im Gesicht, Deck, Hafen und Schiff mit Segeln angesehen. Nicht geprüft: Kosten auf echten Handys (der GGX-Anteil und die Himmelsspiegelung kosten pro Bildpunkt etwas mehr, Figuren und Metall sind klein im Bild), Nacht, Regen mit nassen Flächen, Zeitmessung gegen vorher.

## 2.9.34 – Boss-Mechaniken, Beute-Säulen und Zonen-Ereignisse (11.11.2026)

- **Bosskämpfe in Phasen (Legenden):**
  - **Warnflächen:** Rote Flächen am Boden zeigen, wo der nächste Angriff einschlägt, und füllen sich bis dahin: Kreis, Ring (innen sicher), Linie und Kegel. Wer vorher hinausläuft, wird nicht getroffen. Der Boss dreht sich beim Ausholen nicht mehr mit, die Fläche zeigt ehrlich dorthin, wo er hinsah.
  - **Break-Bar:** Unter dem Lebensbalken liegt der Haltebalken. Treffer leeren ihn, eine perfekte Parade nimmt 40 %. Ist er leer, ist der Boss **gebrochen**: Er taumelt 3,2 s, nimmt 50 % mehr Schaden, seine laufende Warnfläche verfällt. Danach ist der Balken wieder voll; ohne Treffer lädt er sich langsam auf. Normale Treffer unterbrechen Bosse im Angriff nicht mehr.
  - **Phase 2 (unter 60 % Leben) und Phase 3 (unter 30 %):** Der Boss brüllt, ist 2,1 s unverwundbar, ein Schockring geht aus, ein Banner meldet die Phase, seine Ränder glühen rot. Danach gelten neue Angriffe: Lanzenstoß (Linie), Sturmschlag (Kegel), Schlachtruf (Ring), Himmelsfall (Kreis auf dich); in Phase 3 dazu Kreuzschlag, Zornring (Kreis plus Ring mit sicherem Band) und Dreifach-Lanzenstoß. Phasenmarken stehen im Lebensbalken, der Name des Angriffs erscheint über dem Boss.
- **Beute-Säulen:** Besiegte Gegner lassen mit Wahrscheinlichkeit Beute fallen (normal 14–30 %, Elite 85 %, Bosse immer vier Stück, das erste mindestens episch). Jedes Stück fällt in einem Bogen heraus und leuchtet als **Lichtsäule** in der Farbe seiner Seltenheit: Gewöhnlich grau, Selten blau, Episch lila, Legendär golden; je seltener, desto höher, breiter und heller (Bloom), epische und legendäre Säulen sprühen Funken. Darin schwebt ein Metall-Stück (Edelstein, Goldstapel oder Proviant). Näherst du dich (4,5 bis 8 m), wird es **magnetisch eingesaugt**. Der Inhalt ist ein Talisman genau dieser Seltenheit, Gold oder Proviant; gibt es keinen neuen Talisman der Seltenheit mehr, wird daraus Gold. Beim Verlassen der Insel nimmt die Crew liegen gebliebene Beute mit.
- **Zonen-Ereignisse:** Zu Fuß auf Inseln ohne Lager (nicht Boss- und Ruineninseln, ab Stufe 2) passiert alle 110 bis 200 s etwas, das erste nach etwa 50 s:
  - **Piraten-Invasion** (für Marine-Spieler „Marine-Landung“): Boote landen in zwei Wellen an einem Strand etwa 70 m entfernt.
  - **Elite-Jäger:** ein Hauptmann mit zwei Begleitern taucht 22–30 m entfernt auf.
  - Belohnung: Gold und 2 (Invasion) bzw. 3 (Elite) Beute-Säulen, mindestens selten. Die Gegner gehören nicht zum Lager: „Insel befreit“ und die Lagerbelohnung lassen sich damit nicht doppelt auslösen.

**Technik (für Entwickler):**
- Neue Dateien: `combat/zones.ts` (`ZoneSystem`, `zoneContains` als reine Rechnung), `combat/loot.ts` (`LootSystem`), `data/loot.ts` (Seltenheits-Gewichte, Säulen-Aussehen, `rollLoot`), `world/events.ts` (`WorldEvents`, `EVENT`), `tests/loot.test.ts` (9 neue Tests: Gewichte, Bossbeute, Formen der Flächen). Balancing steht in `data/combat.ts` (`BOSS`, `ZoneSpec`, `phaseAttacks`), `data/loot.ts` und `EVENT`.
- `EnemyAttack.zones`: Schaden kommt beim Einschlag der Fläche (`CombatSystem.detonate`, höchstens einmal je Angriff und Boss), nicht über den Hieb (`enemyStrike` kehrt zurück). Flächen verfallen ohne Schaden, wenn `Enemy.atkSeq` sich ändert oder der Boss nicht mehr in `windup`/`attack`/`recover` ist. Netze sind geteilt (`sharedGeo`), Materialien je Fläche werden freigegeben.
- `Enemy`: neuer Zustand `transition`, `phase`, `brokenT`, `breakFrac`, `atkSeq`, `tag`. `takeHit(h, now, w)` und `parried(w)` bekommen die Welt; `EnemyWorld` hat `bossPhase()` und `bossBreak()`. Der Rotton ab Phase 2 läuft über `updateFlash`/`setTint`.
- Beute: `LootDrop` (Seltenheit steht beim Fallen fest, Inhalt bei Aufheben), `rollTrinket(..., exact)`. Die Säule ist ein additiver Zylinder mit Alpha-Verlauf, das Stück ein Toon-Material mit `metalness`/`roughness`/`emissive` (PBR). Alle Materialien und Netze sind geteilt. Aufheben: `CombatHooks.loot` → `SeaWorld.onLootDrop` → `Game.onLootPickup`.
- `CombatSystem`: `campLeft` (ohne Ereignis-Gegner) statt `hostilesLeft` für „Insel befreit“, `tagLeft`, `beginEvent`, `spawnWave`.
- Geprüft: `tsc` fehlerfrei, 48 Tests grün. Im Spiel gemessen: Phasenwechsel mit Unverwundbarkeit, Warnflächen aller Formen gesehen und Schaden innen, keiner außen und keiner nach Abbruch, Break nach 6 schweren Treffern mit +50 % Schaden und Erholung nach 3,2 s, Phase 3 mit allen fünf Angriffen über 70 s ohne hängenden Zustand und ohne Speicherzuwachs, Beute-Säulen gesehen und eingesaugt (Gold, Proviant, Talisman), Elite- und Invasionsereignis samt Belohnung. Ein Fehler beim Test gefunden und behoben: Beim Einsaugen gingen bis zu zwei weitere Stücke verloren.
- Nicht geprüft: Gamepad und Touch, Ereignis-Häufigkeit und Beute-Balance über eine längere Sitzung, Seeboss und Schiffsbosse (unverändert, ohne Warnflächen), Crew als Ziel der Warnflächen (sie treffen nur dich), Beute-Säulen im Regen und bei Nacht.

## Release-Zusammenfassung – behobene Fehler bis 2.9.33 (11.11.2026)

Ein Überblick über alle Fehler, die seit 2.7.0 behoben wurden, nach Bereich und mit der Version, in der es geschah. Einzelheiten stehen in den Einträgen darunter.

**Bildfehler und schwarze Flächen**
- Schwarzes Wasser auf Samsung-Handys (2.9.9) und schwarzes Meer an Handys durch ungültige Rechenwerte, die der Leuchteffekt verschmierte (2.9.7). Ursache jedes Mal: `NaN` oder `pow(0, x)`; Schutz im Bloom (2.9.26).
- Schwarzer Bildschirm beim Schwerthieb (2.7.0), beim Regen durch Wurzel aus minimal negativer Zahl (2.9.18), schwarze Flecken am Vulkan durch 168 ungültige Eckpunkte (2.9.14).
- Dunkle Linien und wandernde Schraffur der Umgebungsverdeckung (2.9.26); `smoothstep` mit vertauschten Grenzen lieferte auf manchen Treibern 0 (2.9.18).
- Unsichtbarer Regen (Quads als Rückseite verworfen, 2.9.18); Schiffsrumpf fälschlich als spiegelnd erkannt (2.9.17); Wassermaterial ohne Kaskaden-Schalter (2.9.12); Schiffsflagge doppelt gemalt (2.9.12).
- Flimmern an Straßenkreuzungen, Fenstern aus der Ferne und im Brunnenwasser (2.9.22); Wimpern und Augenglanz verdeckten sich gegenseitig (2.9.22, nach dem ersten Treffer erneut, 2.9.33).

**Laufen, Kollision, Gelände**
- Figuren sanken am Inselrand ein (2.9.0) oder schwebten an Hängen (2.7.0): Laufhöhe ist jetzt das sichtbare Gelände.
- Schiffe lagen mit dem Bug auf dem Strand (2.9.5); am Festland ließ sich nie anlegen, Stege lagen auf dem Trockenen (2.9.28).
- Torbogen-Kollision neben den Säulen, riesige unsichtbare Kreisfläche um die Werft (2.9.22); Pfähle, Poller, Laternenmasten und Fässer an Stegen waren durchlaufbar (2.9.33).
- Gegner flogen in dich hinein und zitterten (2.0.0-m5); Gegner und später der Spieler rutschten mit den Füßen (2.9.15, 2.9.31); Bodenrisse schwebten an Hängen (2.9.15).

**Hängende Zustände und Zeitabläufe**
- Spielfigur, Gegner und Crew konnten in Parade, Fähigkeit, Angriff oder Flug festhängen, wenn eine Animation ihr Ende nicht meldete (2.9.22).
- Verzögerte Ereignisse liefen nach Pause, Menü oder Spielstandwechsel weiter (Banner, Abspann, Breitseiten, Donner); sie laufen jetzt in Spielzeit und verfallen (2.9.22).
- Brand und Gift schadeten nach dem Verlassen der Insel unsichtbar weiter, Gegner-Geschosse flogen nach dem Ablegen weiter, Münzen gingen verloren (2.9.14); nach dem Untergang des eigenen Schiffs blieben Lebensbalken und Beutekisten stehen (2.7.0).

**Kampf und Aufträge**
- Treffer-Aufblitzen der Gegner wirkte nie, weil nur ein Netz getauscht wurde (2.9.13); Tritte der Faustkämpfer trafen nie, Klingenrichtung beim ersten Hiebschritt war falsch (2.9.19).
- Geenterte Legende zählte doppelt als Sieg und Revanche, „Schiff versenkt!“ erschien nach dem Entern (2.7.0); Prolog nicht abgebbar, Befreiungsaufträge hingen, Werftwechsel reparierte gratis, neuer Kampfstil ohne Boni bis zum Neustart (2.9.5).

**Speicher**
- Wachsender Speicher bei jedem Eistreffer (9 Netze, 2.9.15); Grundfiguren-Texturen nicht als geteilt markiert (2.9.13, 2.9.12); Freigabe aller entfernten Objekte über `disposeObject` (2.9.10). Prüfung in 2.9.33: nach 10 Gefechtsrunden mit sechs Gegnertypen und 12 Aussehenwechseln bleiben Netze, Texturen und Szenenobjekte konstant.

**Build**
- `VroidBase.irisUv()` fehlte, das Projekt ließ sich nicht bauen (2.9.30).

## 2.9.33 – Audit: Kollision, Transparenz, Speicher (11.11.2026)

- **Kollision der neuen Inseln geprüft:** Alle 37 Inseln wurden gescannt (3616 hohe Bäume, Palmen, Felsen, Basaltsäulen und 3528 weitere Netze). Jedes feste Objekt hat einen Kollider, Gebäude, Mauern, Ruinen, Felsen und Bewuchs sind lückenlos abgedeckt. Die einzige Lücke: **Stegpfähle, Poller, Laternenmasten und das Fass am Steg** waren durchlaufbar. Sie haben jetzt Kollider (175 neue, auf Außenposten-Häfen, Fähranlegern und Fischerdörfern).
- **Transparenz:** Nach dem ersten Treffer verloren die durchscheinenden Gesichtsteile (Wimpern, Augenglanz) `depthWrite = false` und sortierten sich falsch. Behoben für alle Materialkopien. Die Flaschenpost im Meer schrieb Tiefe, obwohl sie durchscheinend ist, das ist abgestellt. Alle übrigen durchscheinenden Materialien (Partikel, Rauch, Wasserfall, Regen, Effekte) hatten es schon richtig.
- **Speicher:** Zehn Runden Landgang mit sechs Gegnertypen (spawnen, kämpfen, besiegen, Insel verlassen) und zwölf Aussehenwechsel mit Treffer-Leuchten ergeben nach der Aufwärmphase unveränderte Zahlen: 613 Netze, 422 Texturen, 8790 Szenenobjekte. Gefunden und behoben wurden Lecks im Seekampf: Jede Beutekiste legte ein eigenes Netz an (Faji-Splitter auch ein Material), jede Brandkugel ein eigenes Material, beides wurde beim Einsammeln nie freigegeben; die Faji-Wellen gaben beim Aufräumen ihr Material nicht frei. Kisten und Brandkugeln teilen sich jetzt Netz und Material.

**Technik (für Entwickler):**
- Es gibt keinen Physik-Körper (kein Rigidbody oder `MeshCollider`): Kollision sind 2D-`Blocker` je Insel (Kreis oder gedrehtes Rechteck, `world/islandGround.ts`). „Jedes feste Objekt hat einen Kollider“ heißt hier: ein `Blocker` deckt seinen Standort ab.
- Methode (im Spiel, ohne Test-Datei): Für jedes Netz einer Inselgruppe, auch jede Instanz der `InstancedMesh`-Bäume, Standort gegen `blockers` geprüft. Zusätzlich alle Eckpunkte zwischen 0,6 und 2,2 m über dem Boden, Terrain-Netze (über 150 m) ausgenommen, auf Abdeckung mit 0,9 m Rand. Vorher 37 unabgedeckte Zellen, nachher 5, alle ≈ 1 m neben einem Kollider (breitere Sockel von Felsen und Türmen, kein Loch).
- `world/architecture.ts` `steg()`: `circles` für Pfähle, Poller, Mast und Fass. `world/seaWorld.ts`: Außenposten-Hafen schiebt Pfähle (alle 5 m beiderseits, r 0,22) und Laternenmast (r 0,16) nach den Positionen aus `islandStyle.ts` `outpost()` als `walk.blockers` ein.
- `render/toon.ts`: neue `inheritState()` übernimmt `alphaTest`, `depthWrite`, `depthTest` und `polygonOffset*` nach jeder Kopie; `toonChar()` und `toonFx()` nutzen sie. Ursache: Diese Werte stehen nicht in `ToonOptions`, `toonFx()` hat sie bisher verloren.
- `world/life.ts`: Flaschenpost `depthWrite: false`.
- `naval/naval.ts`: `crateGeo`, `shardMat`, `fireMat` als Felder; `clear()` gibt das Wellen-Material frei. Kanonenkugeln teilten sich schon `ballGeo` und die gecachten Toon-Materialien.
- Offen/bewusst so: Die Pfähle im Wasser (unter 0,9 m Bodenhöhe) und Baumkronen haben keinen Kollider, sie liegen nicht auf begehbarem Grund bzw. über Kopfhöhe. Die Seekampf-Korrektur ist nur gelesen und per `tsc` geprüft, nicht im Spiel gemessen (Schiffsgefecht nicht gefahren). Nicht geprüft: Speicher bei Wetterwechsel, Qualitätsstufenwechsel und Schiffskauf.
- Geprüft: `tsc` fehlerfrei, 39 Tests grün.

## 2.9.32 – Kombo-Finisher, Zielerfassung, Ausdauer und HUD (11.11.2026)

- **Leicht → Leicht → Schwer:** Nach zwei leichten Hieben löst der schwere Hieb (auch wenn er schon im zweiten Hieb gedrückt wird oder kurz nach dem Kombo-Ende) einen **Finisher** aus statt des normalen schweren Hiebs. Jeder Kampfstil hat seinen eigenen Clip: Faust und Langklinge Wirbel, Säbel weiter Schrägschlag, Zweihänder Wirbel mit hohem Schaden, Doppelklingen Wirbelhieb, Faji Zauberwelle. Effekte: Schockring, Bodenrisse, Siegel, Impact-Frame, Speedlines und ein „Finisher!“-Schriftzug am Zähler. Ein schwerer Hieb ohne Kette bleibt wie bisher aufladbar.
- **Zielerfassung (F oder mittlere Maustaste, dazu T, Tab, Gamepad R3):** Die Kamera dreht weich auf das Ziel (ca. 1 s), neigt sich nach dessen Höhe, blickt ein Stück zum Ziel hin und rückt bei großem Abstand zurück. Fällt das Ziel, erfasst die Kamera den nächsten Gegner in 14 m statt die Erfassung zu verlieren. Erneutes Drücken wechselt zum Gegner, der der Kamerarichtung am nächsten liegt. Wer eigene Tasten belegt hat, behält sie.
- **Ausdauer:** Neuer grüner Balken unter den Lebenspunkten (nur zu Fuß). Rolle kostet 18, schwerer Hieb 14, Finisher 20; nach 0,55 s Pause lädt er auf (32 pro Sekunde, im Stand 48). Leichte Hiebe und Blocken kosten nichts. Reicht sie nicht (unter 6), blinkt der Balken rot und die Aktion entfällt.
- **HUD:** Lebens- und Ausdauerbalken haben einen hellen Nachlauf, der kurz stehen bleibt und dann nachzieht; bei unter 25 % Leben pulsiert der Balken. Der Kombo-Zähler erscheint ab 2 Treffern, zeigt die Restzeit als Balken und steigert sich bei 6, 10 und 15 Treffern („Stark!“, „Brutal!“, „Legendär!“) mit Farbe und Größe. Fähigkeiten blitzen auf, sobald sie wieder bereit sind.

**Technik (für Entwickler):**
- `data/combat.ts`: `FINISHERS` (je Stil ein `AttackDef`) und `STAMINA` (Kosten, Aufladung, Pause). Alles Balancing steht dort.
- `PlayerFoot`: `kind` (`light`/`heavy`/`finisher`) je Hieb, `combo` zählt die Leicht-Kette (schwerer Hieb setzt sie zurück), `finisherReady` entscheidet über Finisher oder Aufladen. Ausdauer in `stamina`/`spend()`/`staminaFlash`, Aufladung im Logikschritt. Finisher-Effekte in `processAttack`.
- `CombatOverlay`: `finisher()`, Kombo-Rang und Restzeit (`COMBO_TIME`); `Hud.setStamina()` plus Nachlaufstreifen `.lag` (CSS-Transition mit Verzögerung, nur `transform`).
- Kamera: `SeaWorld.lockK`/`lockDX`/`lockDZ` (weicher Überblendfaktor), `prevLock` für den Wechsel bei gefallenem Ziel; `Combat.retarget()` und `lockScore()`. Ausschnitt und Abstand im Fuß-Kamerablock.
- Neue Standardtasten in `data/actions.ts` (`lockon`: F, Mouse1, T, Tab); gespeichert werden nur eigene Abweichungen.
- Geprüft: `tsc` fehlerfrei, 39 Tests grün. Im Spiel: L-L-H startet den Finisher (Ausdauer 100 → 80, Zähler „Stark!“ mit Schriftzug), fünf Rollen leeren die Ausdauer, die sechste bei 10 und danach wird verweigert (Balken blinkt); Kamera dreht in ca. 1 s auf das Ziel (Winkelfehler 1,8 → 0,0 rad), Wechsel auf den nächsten Gegner bei gefallenem Ziel. HUD per Bildschirmfoto gesehen. Nicht geprüft: Gamepad, Touch, Finisher-Effekte der anderen fünf Stile per Auge, Balance der Ausdauer im echten Kampf.

## 2.9.31 – Bewegung: Schrittsync am echten Tempo, weichere Übergänge (11.11.2026)

- **Keine rutschenden Füße mehr:** Die Schrittgeschwindigkeit folgt jetzt dem tatsächlich zurückgelegten Weg statt dem Stick-Befehl. Gegen Reling, Mauern oder Hänge rennt die Figur nicht mehr auf der Stelle, sondern steht.
- **Auch bei Tempo-Bonus exakt:** Der Spielraum der Lauf- und Geh-Animation ist größer (Gehen bis 3,1 m/s, Rennen bis 9,6 m/s). Das Gehen mit halber Stickneigung (bis 3 m/s) und Läufe mit Fähigkeiten-Tempo rutschten vorher.
- **Gehen ↔ Rennen ohne Sprung:** Die Schrittphase wird beim Wechsel übernommen, das Bein springt nicht mehr um. Die Wechselschwellen haben eine Hysterese (Rennen ab 3,4 m/s, zurück ab 2,7 m/s), kein Flackern an der Grenze.
- **Neigung nach echtem Tempo:** Die Neigung in Kurven und beim Antreten nutzt das gemessene Tempo, an einer Wand lehnt sich die Figur nicht ins Leere.
- Schon vorhanden und unverändert: Überblendzeiten 0,08–0,2 s je Übergang (Ruhe, Laufen, Angriff, Kombo, Rolle, Parade, Treffer) und der Eingabepuffer (0,25 s) für Angriff, Rolle und schweren Hieb; Hiebe und Rollen aus Ausschwung, Treffer oder Rolle heraus werden nachgeholt.

**Technik (für Entwickler):**
- `PlayerFoot.realSpeed`: aus `prev` zu aktueller Position je Logikschritt, geglättet (`dt * 18`), nach oben auf `speed * 1.5 + 0.5` begrenzt. Speist `setLocoSpeed`, die Ruhe/Gehen/Rennen-Wahl und `Character.lean` (`min(speed, realSpeed + 0.3)`). `place()` setzt ihn zurück.
- `Character.setLocoSpeed`: Gehen `mps / 1,5` auf 0,4–2,1, Rennen `mps / 3,7` auf 0,7–2,6.
- `Character.playClip`: zwischen `Walking_A` und `Running_A` (`LOCO_CLIPS`) wird die normierte Zeit übernommen, bevor `crossFadeFrom` startet.
- Gegner, Crew und NPCs nutzten schon das echte Tempo (`Character.place`); unverändert.
- Geprüft: `tsc` fehlerfrei, 39 Tests grün. Im Spiel an Deck gemessen: Gehen 1,97 und 2,97 m/s sowie Rennen 6,2 m/s entsprechen dem Clip-Tempo; gegen die Reling Tempo 0 und Ruhe-Animation. Nicht gemessen: Sprint-Bonus über 8 m/s, Schrittphase per Auge, Handy.

## 2.9.30 – Figuren im Stil „Stylized Realism“ (11.11.2026)

- **Anime-Formen, echte Oberflächen:** Gesichter und Proportionen bleiben Anime. Haut, Stoff, Leder und Stahl haben jetzt je eine eigene Oberfläche: Webmuster im Stoff, Narbung im Leder, gebürstete Riefen im Stahl, feine Poren im Hautglanz.
- **Haut:** Licht streut unter der Haut. Rötlicher Saum an der Schattengrenze, warme statt kühle Schatten, Durchleuchten an Ohren und Fingern im Gegenlicht.
- **Haare:** ein Lichtband quer über den Kopf, das mit Blickwinkel und Sonne wandert. Es nimmt die Haarfarbe an (blond hell, schwarz nur ein Schimmer).
- **Augen:** zwei scharfe Glanzpunkte je Iris, die ein Stück mit dem Licht wandern.
- **Randlicht statt Tusche:** Figuren haben keine schwarzen Konturen mehr. Ihre Ränder leuchten im Himmelslicht ihrer Seite, zur Sonne hin in deren Farbe. Schiffe, Bauten und Landschaft behalten ihre Konturen.
- **Editor:** Die Kleidung zeigte im Editor Streifen (Schatten der Figur auf sich selbst). Behoben.

**Technik (für Entwickler):**
- Kein eigenes `ShaderMaterial`: Die Figuren-Fassung ist eine Option des Toon-Materials (`surface` in `ToonOptions`, `render/toon.ts`). So bleiben Kaskaden-Schatten, Nebel, Nässe, Treffer-Leuchten und Auflösen erhalten.
  - `surface`: `skin`, `cloth`, `leather`, `steel`, `hair`, `eye`, `plain`. Shader-Define `SK_CHAR` und `SK_SURF`.
  - `toonChar(mat)` liefert die Figuren-Fassung eines vorhandenen Toon-Materials (Metall wird Stahl, sonst Stoff). `Character.stylize()` wendet sie auf Kleidung, Hüte, Schmuck und gehaltene Waffen an.
- Feinrelief (`MICRO_PARS_GLSL`, `MICRO_FRAG_GLSL`): prozedurale Höhe aus der Körperposition vor dem Skinning (`vSkObj`, in Metern), Normale über Bildschirm-Ableitungen. Braucht weder UV noch Tangenten und blendet aus, bevor das Muster kleiner als ein Bildpunkt wird.
- Haut, Glanz je Oberfläche, Haar, Auge und Randlicht stehen in `CHAR_GLSL`.
  - Haar: Kajiya-Kay mit zwei Bändern. Die Tangente kommt aus der Kopfrundung (`vSkSph`, Kugelmitte `hairC` aus `VroidBase.hairCenter()`), nicht aus den Strähnen-Normalen. Sonst zerfällt das Band.
  - Auge: `eyeUv` aus `VroidBase.irisUv()`. Die Iris-Textur enthält beide Augen nebeneinander, v läuft nach unten.
  - Randlicht: `pow(1 − N·V, 3,4)`, Farbe aus `uEnvLow`/`uEnvHigh` nach Normalenrichtung plus Sonnenanteil.
- Konturen: `CHARACTER_INK = false`. Figuren bekommen keine Hüllen mehr (`addOutlines`). Für die Kantenerkennung (High bis Ultra) schreiben sie Alpha 0,98 (`CHAR_ALPHA`); `EdgeEffect` lässt diese Pixel aus. SSR und AO werten 0,98 wie 1.
- `world/editorStage.ts`: `shadow.bias` und `shadow.normalBias` am Hauptlicht.
- Behoben: `VroidBase.irisUv()` fehlte, das Projekt ließ sich nicht bauen.
- Geprüft: `tsc` fehlerfrei, 39 Tests grün. Im Spiel angesehen: Editor (beide Grundfiguren, braunes, schwarzes und blondes Haar, Nahaufnahmen von Augen und Stoff) und an Deck bei Tag auf Ultra, Mid und Low. Nicht angesehen: Nacht, Regen, Kampf, Gegner und NPCs, echtes Handy.

## 2.9.29 – Kampfgefühl: Schweif, Fähigkeiten-Stufen, Trefferwucht (10.11.2026)

- **Waffenschweif glatter:** Der leuchtende Klingenschweif wird jetzt als Kurve gezeichnet (dreifach unterteilt) statt als Knickzug – auch bei niedriger Bildrate ein runder Bogen.
- **Fähigkeiten in Stufen:** Jede Fähigkeit beginnt mit einer Aufladephase (Siegel am Boden zieht sich zusammen, Funken steigen auf, Hitzeflimmern um die Figur), danach folgen Einschlag, Schockwelle und Bodenspuren.
- **Druckwellen verzerren das Bild** (Refraktion) bei Schockwellen ab 2,2 m Radius.
- **Trefferpause 35 ms** bei jedem wirksamen Treffer, dazu ein **gerichtetes Kamerawackeln** entlang der Trefferrichtung, das schnell abklingt.
- **Spuren am Boden:** Kritische Treffer, Kills und schwere Hiebe hinterlassen Brandflecken (Klinge, Magie) oder Risse (Faust).

**Technik (für Entwickler):**
- `render/weaponTrail.ts`: Catmull-Rom (`S = 3`), Arbeitsfelder `ctl`/`ctlAge`, keine Allokation pro Bild.
- `faji/abilities.ts`: `charge()` (gehaltenes Sigil-Decal, gehaltene Hitzequelle, `rise`) wird in `cast` vor dem Wirken gestartet.
- `combat/fx.ts`: `shockwave` fügt eine `heatShared`-Quelle hinzu.
- `world/seaWorld.ts`: `HIT_STOP = 0.035`; `shakeAx`/`shakeDir`/`shakePh` für die gerichtete Schwingung, zusätzlich zur Feder (`kick`).
- `combat/combat.ts`: Decals in `applyHit`.
- Geprüft: `tsc` fehlerfrei, 39 Tests grün. Nicht im Spiel angesehen.

## 2.9.28 – Anlegen am Festland, Stege im Wasser, schnellere Schiffe (10.11.2026)

- **Anlegen überall möglich:** Am Festland Grünmark erschien „An Land gehen“ nie, weil das Schiff zu weit vor dem Strand gestoppt wurde. Jetzt kann man an jeder Insel aus jeder Richtung anlegen. Geprüft an allen 37 Inseln aus je 36 Richtungen und mit echten Anfahrten.
- **Stege im Wasser:** Bei großen Inseln begann das Wasser erst 30–37 m hinter der Küste, die Stege lagen ganz auf dem Sand. Jetzt reicht jeder Steg 15–32 m ins Wasser.
- **Längere Hafenstege:** Die Stege der Außenposten-Häfen (Nebelhafen, Kiefernhafen, Glutheim, Donnerbucht, Letzter Hafen) sind 32 m statt 22 m lang. Der zweite Steg der Palmenküste ist 28 m statt 20 m lang.
- **Keine Felsen auf Stegen:** In Nebelhafen lagen zwei Felsen auf dem Steg. Steg und Zugang bleiben jetzt frei.
- **Schnellere Schiffe:** Alle Schiffe segeln 30 % schneller (Schaluppe jetzt knapp 29 m/s bei voller Fahrt). Feinde ebenso, damit Verfolgen und Fliehen gleich bleiben.

**Technik (für Entwickler):**
- Ursache: Die Strandböschung war fest 25 % des Inselradius (`CylinderGeometry(r, r * 1.25)`, Laufhöhe bis `e * 1.25`, Schiffsgrenze `e * 1.11`). Beim Festland (r 270) lag die Wasserlinie gut 30 m vor der Küste, das Schiff wurde dort gehalten, und `islandAt(…, 30 + W)` traf nicht mehr.
- Neu: `shelfOf(r) = min(0.25, 22 / r)` und `WATERLINE` in `world/islandGround.ts`, Feld `shelf` an `WalkIsland`. Strand-Mesh (`islandTerrain`), Laufhöhe (`height`), Schiffsgrenze (`pushShip`), Laufgrenze (`constrain`) und Brandungskarte (`IslandShape.base`) nutzen alle denselben Wert. Inseln bis r 88 bleiben unverändert.
- `SEA_SPEED = 1.3` in `data/ships.ts`, angewandt in `Ship.steer`. Die Werftanzeige zeigt weiter die Grundwerte.
- `OUTPOST_PIER` in `world/islandStyle.ts` (Steg und Kollider von −5 bis +27 m ab Küste, Pfähle beiderseits). Harbor-Fall in `islandDress.ts` hält den Stegstreifen frei; Felsen im Wasser prüfen jetzt auch belegte Flächen.
- Test „lässt Schiffe an jeder Inselgröße nah genug zum Anlegen heran“ (39 Tests grün).
- Geprüft im Spiel: Anfahrt an Grünmark aus sechs Richtungen und an sechs weiteren Inseln aus zwei Richtungen; alle 13 Stege von See aus angesehen; Rechenprüfung aller 37 Inseln × 36 Richtungen ohne Fehler.
- Hinweis: Beim Testen hat ein angeschlossener Gamepad-Stick das Schiff dauerhaft gelenkt. Falls das Schiff ohne Eingabe im Kreis fährt: Gamepad prüfen (Stick-Drift).

## 2.9.27 – Große Welt: Festland, neue Inseln, Dörfer und Biome (10.11.2026)

- **Vierfache Karte:** Die Welt ist doppelt so weit (Radius 4000 m statt 2000 m). Alle Inseln liegen wie bisher zueinander, nur weiter auseinander, und sind rund ein Viertel größer. Ankerglück bleibt an seinem Platz. Die Wege über See sind dadurch etwa doppelt so lang.
- **Festland Grünmark:** südlich von Ankerglück, gut einen halben Kilometer breit. Weiden, Laubwälder und Birken, das Dorf Weidenbrück mit Gasthaus, ein Wachturm mit Leuchtfeuer auf dem Hügel, ein Hof mit Kornfeldern, eine Abteiruine, ein Fischerweiler, ein Fähranleger und Wege dazwischen.
- **Drei neue Inseln:**
  - Palmenküste (Tropen): weißer Sand, geschwungene Palmen, Fischerdorf auf Stelzen mit zwei Stegen.
  - Sturmklippe: schwarze Basaltsäulen, windschiefe Kiefern, Steinturm und Ruinen.
  - Fährholm: Hirtenhof mit Steinhäusern, Trockenmauern, Feld und Fähre zum Festland.
- **Bauten mit Kollision:** Holzhütten, Stelzenhütten, Steinhäuser, Gasthaus, Scheune, Wachtürme, Ruinen, Säulen, Zäune, Mauern, Stege, Kisten, Fässer, Brunnen, Laternen, Boote. Fenster und Laternen leuchten nachts, Schornsteine rauchen.
- **Alte Inseln sehen nicht mehr gleich aus:**
  - Die überall gleichen, bis über 30 m hohen Felsklötze sind weg. Dafür gibt es fünf Felsformen in menschlichem Maß: Blockhaufen, Felsnadeln, Plattenstapel, Felsbögen und Basaltsäulen. Jede Insel hat ihre Hauptform.
  - Häfen: statt vier gleicher roter Häuschen baut jede Region anders (Stelzenhütten im Nebel, Blockhäuser und Scheunen im Norden, Steinhäuser im Sturm). Hafeninseln sind nicht mehr kreisrund.
  - Dörfer der ruhigen Inseln: drei Anlagen (um einen Platz, Zeile am Strand, verstreut), Bauweise je Region, Brunnen oder Feuerstelle, eigener Hausrat.
  - Bewuchs: Bäume stehen in Hainen mit Lichtungen. Jede Insel ist karg, normal oder dicht bewaldet und mischt in den Tropen Palmen und Laubbäume anders. Die Wiese hat Buchten und Zungen statt eines runden Rands.
  - Neue geschwungene Palmen und Farn auf allen Tropeninseln, Birken im Norden.
  - Kahle Stellen auf Asche- und Schlundinseln sind nicht mehr sandhell.
- **Wind:** Bäume, Büsche, Farn, Gras, Schilf und Kornfelder wiegen sich im Wind, auch die neuen instanzierten Pflanzen.
- **Spielstände:** Alte Stände bleiben lesbar. Das Schiff wandert mit der Karte nach außen; wer vor Ankerglück lag, liegt weiter dort.
- **Karte:** Welt- und Regionskarte zeigen die neuen Länder.

**Technik (für Entwickler):**
- Welt: `WORLD_SCALE = 2` in `data/world.ts`; `WORLD_RADIUS`, Regionen, Inselabstände, Seestufen (`seaLevelAt`), Tiefenschlund-Lage, Treibgut, Weltrand (Segmente, Gischt) und Brandungskarte (2048², Zelle bleibt 4 m) leiten sich daraus ab.
- Länder als Daten: `data/settlements.ts` (`SITES`: Küste, Hügel, Siedlungen aus Bauwerkslisten, Wege, Bewuchs-Schichten je Hektar). Neue Felder an `IslandDef`: `biome`, `site`, `placed`. Neue Stile `festland` und `klippe`.
- `world/architecture.ts`: Baukasten der Gebäude. Jedes Modell liefert sein Kollisions-Gitter (gedrehte Rechtecke und Kreise); `colliders()` rechnet es in Weltkoordinaten um. Ein gemeinsames Fenster- und Lampenmaterial (`setSiteNight`).
- `world/settlement.ts`: stellt Siedlungen auf, trägt Kollider, Stege (Schiffskollision), Feuer und Schornsteine ein, baut Wege (`roadMesh`) und Felder.
- `world/vegetation.ts`: instanzierter Bewuchs.
  - Vorlagen (`cachedProto`, `floraProto`): ein Netz je Pflanze mit Eckpunktfarben, ein Material für alles (`vegMat`).
  - `Scatter` baut je Vorlage und Geländekachel ein `InstancedMesh` (Bäume und Felsen 240 m, Kleinkram 80 m) mit Farbton je Instanz.
  - Kleinkram hat eine Sichtweite (Gras 105 m, Büsche 230 m) und wird in `cullFigures` ausgeblendet, skaliert mit der Grafikstufe.
  - `Occupancy` (Raster) und `scatterSite` (Gürtel, Haine über Rauschen, Hanglage).
  - Auch die alten Inseln nutzen es (`islandDress.ts`, Palmen in `seaWorld.ts`) statt verschmolzener Einzelnetze.
- Wind mit Instanzen: `WIND_VERTEX` in `render/wind.ts` nimmt die Weltposition aus der Instanzmatrix und rechnet die Verschiebung in den Instanzraum zurück. Die Tusche-Kontur (`render/outline.ts`) kann instanzierte Netze und teilt sich deren Matrizen.
- Felsen: `rockFormation` und `ROCK_TYPES` in `world/islandStyle.ts`. Wiesenrand: Parameter `ragged` in `islandTerrain`. Hafenhäuser und Dörfer: `HOMES` und `mount` in `islandDress.ts`; `outpost` baut nur noch den Steg.
- Toon-Option `layer` (Tiefenverschiebung für Bodenschichten): Die Wiese lag 2 cm über dem Sand und flimmerte auf großen Inseln in der Ferne.
- `NavGrid`: Zellgröße 1 m ab Inselradius 150 m (Festland: 0,45 Mio. Zellen, Aufbau etwa 100 ms beim ersten Landgang).
- `SeaWorld.setState` schiebt ein Schiff, das an Land läge, an die Küste.
- Spielstand-Version 10 (Migration 9 → 10). Tests: Weltgröße, neue Länder, Siedlungsdaten, Migration (38 Tests grün).
- Neue Dateien: `data/settlements.ts`, `world/architecture.ts`, `world/settlement.ts`, `world/vegetation.ts`.
- Geprüft (RTX 5070 Ti, Ultra, 2400 × 1800, Bilder von Hand weitergeschaltet): alle 37 Inseln einzeln aus der Luft, zwölf davon aus Bodenhöhe; Tag und Nacht im Dorf; Stufe Niedrig mit Konturen. Bildzeit Ankerglück 7,9 ms, Festland vom Schiff 7,4 ms, Festland zu Fuß 13,5 ms (74 Bilder/s), Mittel 7,4 ms.
- Nicht geprüft: echtes Handy, Hochformat, Regen und Sturm auf den neuen Inseln, Kämpfe und Aufträge auf den umgebauten Inseln, ein echter alter Spielstand (nur der Migrations-Test).

## 2.9.26 – Stabile Bild-Pipeline (Start 3.0-Update) (10.11.2026)

- **Schwarzes Flimmern behoben:** Die Umgebungsverdeckung (Kontaktschatten) zeichnete dunkle Linien quer über Böden und eine wandernde Schraffur auf Wände. Beides ist weg, die Schatten in Ecken sind jetzt ruhig und weich.
- **Keine Shader-Warnung mehr:** Die Meldung X3595 („gradient instruction in loop“) tritt nicht mehr auf.
- **Feste Kamera-Ebenen:** nah 0,1 m, fern 1000 m. Meer, Himmel, Wolken und Sonne werden nicht abgeschnitten.
- **Sichtweite Maximal/Ultra:** Wegen der festen Fernebene endet die Sicht bei 900 m (Maximal, vorher 1200 m) bzw. 960 m (Ultra, vorher 1800 m). Der Dunst beginnt in derselben Entfernung wie bisher, schließt sich aber früher.

**Technik (für Entwickler):**
- Behobene Fehler:
  - X3595: Der 3×3-Weichzeichner des `AoEffect` las mit `texture2D` in einer Schleife (undefinierte Ableitungen). Jetzt vier feste Proben mit `textureLod`, keine Schleife.
  - Dunkle Linien: `AoPass`/`SsrPass` lasen die Tiefe mit `texture2D` genau auf Bildpunkt-Grenzen (halbe bzw. 0,75-fache Auflösung); je nach Rundung kam der falsche Nachbar, die Flächennormale kippte, ganze Bildzeilen wurden verdeckt. Jetzt `texelFetch` und Position aus derselben Bildpunkt-Mitte (`render/depthGlsl.ts`).
  - Schraffur: Zufallsmuster (IGN) durch festes 2×2-Muster ersetzt; der Weichzeichner mittelt exakt ein 2×2-Feld, das Muster hebt sich auf.
  - Mögliche ungültige Werte entfernt: entartete Normalen am Bildrand, `pow(0, x)` im Fresnel der Spiegelungen, Division durch 0 bei der Projektion.
- Schleifen: Strahlverfolgung der Spiegelungen, Horizontsuche und Hitzeflimmern laufen mit fester Durchlaufzahl ohne `break`/`continue`.
- Pipeline (`render/renderer.ts`): Kern auf allen Stufen RenderPass → Bloom (Mipmap, Schwelle 1,0) → ACES Filmic. Niedrig/Mittel: nur RenderPass + ein Effekt-Durchgang. Hoch bis Ultra: zusätzlich AoPass, SsrPass, Tiefenunschärfe. Das Hitzeflimmern rechnet im Abschluss-Durchgang mit (ein Vollbild-Durchgang weniger). AO, Spiegelungen, Tiefenunschärfe, Konturen und Farbkorrektur bleiben erhalten (Vorgabe aus CLAUDE.md).
- `guardBloom`: Der Helligkeitsfilter des Bloom verwirft NaN/Unendlich und begrenzt die Helligkeit (ein einzelner ungültiger Bildpunkt wurde sonst als schwarzer Block verschmiert).
- `render/shaderLog.ts`: filtert nur die harmlose Notiz X4122 aus three.js' eigenem PMREM-Shader; alle anderen Meldungen bleiben.
- Kamera: `CAMERA_PLANES` (0,1 / 1000) in `data/qualityTiers.ts`. Himmels-Schwelle der Tiefen-Effekte 0,9999 → 0,999999 (`SKY_DEPTH`; die alte Schwelle hätte bei den neuen Ebenen alles ab 500 m als Himmel gewertet). Sonne in 900 m Abstand (gleiche scheinbare Größe), Meer und Wolken werden an die Fernebene gelegt statt abgeschnitten, Höhennebel schließt sich am Ende der Sichtweite ganz.
- Neue Stufenwerte: `figureDistance` (Zeichenweite der Figuren, unverändert zu vorher), `fogStart`.
- Geänderte Dateien: `render/renderer.ts`, `render/gtao.ts`, `render/ssr.ts`, `render/heat.ts`, `render/outline.ts`, `render/atmosphere.ts`, `render/depthGlsl.ts` (neu), `render/shaderLog.ts` (neu), `data/qualityTiers.ts`, `world/seaWorld.ts`, `world/environment.ts`, `world/sky.ts`, `world/ocean.ts`.
- Geprüft (RTX 5070 Ti, ANGLE/Direct3D 11): alle 171 Shader-Programme frisch übersetzt – nur noch die PMREM-Notiz; alle fünf Stufen auf See mit stehendem Bild identisch von Bild zu Bild, keine schwarzen Bildpunkte; Stadt auf Ultra vorher/nachher verglichen. Noch nicht geprüft: Regen/Pfützen, Nacht, Sturm, Hitzeflimmern im Kampf, Sonnenstrahlen, Handy-Einstellung, Hochformat.

## 2.9.25 – Mantel oben geschlossen und schlank (10.11.2026)

- **Mantel rundum geschlossen:** Oben fehlte vorn, hinten und an den Seiten ein Streifen, weil der Mantel 1,5 cm unter dem Halsansatz aufhörte. Die Schulterpartie des Körpers liegt aber genau auf dieser Höhe. Jetzt reicht der Mantel bis über die Schultern. Hals und Kopf bleiben frei.
- **Schlanker Mantel:** Unter Mantel und Weste trägt die Figur jetzt ein eng anliegendes, mitbewegtes Hemd statt des weiten Hemds des Grundmodells mit Puffärmeln. Mantel, Weste und Schärpe liegen dadurch eng darüber, statt sich über die Puffärmel aufzublähen. Die Ärmel sind deutlich dünner. Nur über der Schärpe trägt der Mantel etwas weiter auf.
- **Weste sichtbar:** „Weste und Hemd“ färbt jetzt die Weste. Darunter liegt ein helles Leinenhemd. Die Westenöffnung ist schmaler als der Mantelausschnitt, damit die Weste im Ausschnitt zu sehen ist.
- **Schulterstücke** sitzen auf dem schlankeren Mantel.

**Technik (für Entwickler):**
- Neue Kleidungsart `hemd` (enges Hemd, höchstens `SHIRT_CAP` = 1,4 cm) und `guertelEng`. `Character.dressVroid` ersetzt das Grundhemd bei Mantel oder Weste (`slimTop`).
- Mantel = Unterkleidung (gekappt) + 1,6 cm, über der Schärpe + 1,6 cm extra, Ärmel + 1,0/0,8 cm, Rumpf bis Halsansatz + 3 cm, Öffnung 4–6,5 cm.
- Weste eigener Fall mit schmaler Öffnung. Schärpenknoten und Schnalle an den passenden Ankern (`knotEng`/`buckleEng`).
- Geänderte Dateien: `entities/character/vroid.ts`, `entities/character/character.ts`.
- Geprüft mit Bildreihen (5 Blickwinkel, stehend und rennend): Kapitänsmantel mit Weste, langer und kurzer Mantel, Mann und Frau, Weste ohne Mantel.

## 2.9.24 – Glatte Kleidung: Mantel mit Schultern, keine Zacken mehr (08.11.2026)

- **Mantel mit Schultern:** Die Vorderöffnung des Mantels war oben 12 cm breit und schnitt die ganze Schulterpartie heraus. Dort sah man Hemd und Weste, darüber schwebten die Schulterstücke. Jetzt ist die Öffnung ein schmales V, Schultern und Kragenpartie sind bedeckt, und die Schulterstücke liegen auf dem Mantel.
- **Keine Zacken und abstehenden Zipfel mehr:** Mäntel, Westen, Jacken, Tuniken, Ringelhemden, Schärpen, Schals, Hosen und Stiefel werden feiner unterteilt und geglättet. Ränder, Säume und Stiefelschäfte verlaufen glatt statt als Treppe.
- **Weiche Schattierung:** Die Kleidung schattiert nach ihrer eigenen geglätteten Form statt nach dem Körper darunter und wirkt dadurch nicht mehr kantig.
- **Hose bis zum Knöchel:** Alle Figuren tragen jetzt die mitbewegte Hose. Bei der Hose des Grundmodells stach an gebeugten Knien die Haut durch, und ohne Stiefel endete die Hose mitten an der Wade.
- **Schärpe und Mantel:** Beide haben etwas mehr Abstand zur Kleidung darunter. Die Schärpe verschwindet nicht mehr stellenweise unter der Jacke, und der Mantel legt sich über die Schärpe.

**Technik (für Entwickler):**
- `VroidBase.buildGarment` (`entities/character/vroid.ts`):
  - Arbeitsdaten je Punkt: Hautlage, Normale, Abstand, Gewichte.
  - Eine Mittelpunkt-Unterteilung (jedes Dreieck in vier); die Gewichte beider Ecken werden gemischt, die vier stärksten bleiben.
  - Nähte werden nach Lage verschweißt. Danach 8 Glättungsdurchgänge: im Inneren flächig, an offenen Rändern nur entlang der Kante, Ecken fest. Nach jedem Durchgang wird der Mindestabstand zur Haut wiederhergestellt.
  - Normalen neu berechnet und über die Nähte gemittelt.
- `garmentOffset`:
  - Mantelöffnung 4,5–9 cm als V, nach oben zeigende Flächen (Schultern) bleiben.
  - Schärpe = Unterkleidung + 2,6 cm, Mantel = Unterkleidung + 3,4 cm.
  - Hose bis knapp über den Knöchel.
- `Character.dressVroid`: Die Hose der Grundfigur ist für alle Figuren ausgeblendet, die erzeugte Hose kommt immer dazu. Der Freiraum zur Grundhose entfällt.
- Geänderte Dateien: `entities/character/vroid.ts`, `entities/character/character.ts`.
- Geprüft mit Bildreihen: Kapitänsmantel wie im Editor, Mann und Frau mit Jacke und Weste, Beine mit Stiefeln, Schuhen und Sandalen, stehend und rennend. Aufbau aller Kleidungsstücke einer Grundfigur einmalig etwa 40 ms.

## 2.9.23 – Figuren-Audit: Kleidung, Hüte und Schmuck sitzen (08.11.2026)

- **Nichts schwebt mehr:**
  - Der Ohrring hängt am Ohrläppchen. Vorher schwebte er etwa 3 cm neben dem Kopf, weil er nach dem Augenabstand statt nach der Kopfbreite gesetzt wurde.
  - Die Kapitäns-Schulterstücke sitzen auf den Schultern und nicht mehr in der Luft daneben.
  - Knoten und Enden der Schärpe bzw. die Gürtelschnalle liegen auf dem Band.
- **Nichts sticht mehr durch:**
  - Mäntel, Stiefel, Schärpe und Gürtel messen, wie dick Hemd, Hose und Schuhe der Figur darunter sind, und legen sich darüber. Vorher stachen das Hemd am Rücken und das Oberteil durch die Schärpe.
  - Ringelhemd, Tunika und Jacke ersetzen das Hemd der Figur, statt es zu überdecken.
  - Oberteile und Mäntel sind geglättet und wirken wie Stoff statt wie aufgemalt. Die Nähte bleiben dabei geschlossen.
- **Hüte passen sich der Frisur an:**
  - Kopftuch, Wollmütze, Südwester, Helm, Kochmütze und Zweispitz legen sich als gemessene Kappe um die jeweilige Frisur.
  - Vorher waren es starre Halbkugeln: entweder hohe Schüsseln über dem Kopf oder in der Frisur versunken, sodass nur ein schwebender Ring zu sehen war.
  - Der Dreispitz wächst bei voluminösen Frisuren nicht mehr so stark mit.
  - Die Fliegerbrille sitzt auf der Stirn statt im Haar, ihr Riemen ist kein Heiligenschein mehr.
- **Keine unsichtbare Kleidung mehr:**
  - Was man im Editor wählt, ist jetzt auch bei den Anime-Figuren zu sehen. Bisher änderte es nichts oder nur die Farbe.
  - Bärte: Kinnbart, Schnurrbart, Vollbart und Koteletten, aus der Gesichtsform erzeugt.
  - Außerdem Narbe, Schal und Handschuhe.
  - Oberteil-Arten: Weste (vorn offen), Jacke mit langen Ärmeln, lange Tunika und gestreiftes Ringelhemd.

**Technik (für Entwickler):**
- Kleidung (`entities/character/vroid.ts`):
  - `clearance()` misst je Hautpunkt den Abstand von Hemd, Hose und Schuhen der Grundfigur: nächster Hautpunkt im 2-cm-Raster, Abstand entlang der Normale, Ausreißer bei 4 cm gekappt, Lücken aus Nachbarn gefüllt.
  - `garmentOffset` schichtet von innen nach außen: Hemd → Ringel/Tunika (+4–6 mm) → Weste/Jacke (+9 mm) → Schärpe (+16 mm) → Schal → Mantel (+20 mm).
  - Neue Stücke: `weste`, `jacke`, `tunika`, `ringel`, `handschuhe`, `schal`. Die Fläche richtet sich nach dem Hemd statt nach Knochen, weil die Brust an eigenen Knochen hängt (sonst Löcher).
  - Glättung der Oberteile und Mäntel (5 Laplace-Durchgänge): Nahtpunkte verschweißt, offene Ränder fest, danach jeder Punkt mindestens auf seinem Hautabstand.
  - Kleidungsmaterial mit kleinem `polygonOffset`.
  - Ringelstreifen zeichnet der Toon-Shader (Option `ringel`, Attribut `stripe`, Höhe vor dem Skinning, mit `fwidth` geglättet).
- Anker und Kopfschmuck:
  - `anchors()`: Ohrläppchen aus der Kopfhaut, Schultern aus der Rumpfhaut unter dem Hals plus Hemd und Mantel, Schärpen-Ellipse aus Taille und Kleidung. Alles in den lokalen Räumen von Kopf, Brust und Hüfte.
  - `beard(kind)`: Hülle aus der Gesichtshaut mit Regionen nach Mund und Ohr. `scarPlacement()`: Lage auf der Wange.
  - `capShell(sink, margin)`: Richtungsraster (32 × 10) um die Haarmitte, je Richtung die weiteste Haarspitze, Lücken gefüllt und nach außen geglättet.
  - `animeHats.ts`: `capHat()` für die gemessenen Hüte, gemessener Ohrring, Bart- und Narbenteile, Fliegerbrille nach Haarform und Schädelbreite.
  - `attachOutfit()` setzt Schärpe und Schulterstücke an die Anker. Die Halbkugel-Hüte mit `domeFit` sind durch die gemessenen Kappen ersetzt.
- Geänderte Dateien: `entities/character/vroid.ts`, `entities/character/animeHats.ts`, `entities/character/character.ts`, `render/toon.ts`.
- Geprüft mit Bildreihen (vorn, seitlich, hinten; stehend und rennend):
  - alle 9 Hüte auf kurzen und langen Frisuren
  - alle 6 Oberteile an Mann und Frau
  - Mäntel in Bewegung
  - 12 zufällige Stadtbewohner aller Rollen
- Keine Konsolenfehler. Formen und Anker werden je Grundfigur einmal berechnet und dann geteilt.

## 2.9.22 – QA-Audit: Kollisionen, Flackern, hängende Zustände, saubere Konsole (08.11.2026)

- **Kein Hineinlaufen mehr in Objekte:**
  - Häuser, Marktstände, Karren, Kistenstapel, Zäune, Mauern und die Werft haben jetzt rechteckige Kollider. Bisher waren es Kreise: An den Hausecken lief man ein Stück hinein, und vor den Seitenwänden stand eine unsichtbare Wand.
  - Zäune, Palisadenpfähle im Lager, die Steinblöcke der Ruinen, Uferfelsen und die Brocken rund um große Felsen hatten gar keine Kollision. Jetzt haben sie eine.
  - Der Torbogen der Ruinen hatte seine Kollision neben den Säulen statt an ihnen (die Drehung fehlte). Das ist behoben.
  - Die riesige unsichtbare Kreisfläche um die Werft ist durch ein Rechteck in Rumpfgröße ersetzt.
- **Kein Flackern mehr:**
  - Wo sich Straßen kreuzen und in den Stadtplatz münden, flimmerte das Pflaster. Behoben.
  - Das Wasser im Stadtbrunnen lag genau auf der Höhe des Beckenrands. Behoben.
  - Die Fenster flackerten aus der Ferne mit der Hauswand. Behoben.
  - Wimpern und Augenglanz der Figuren verdecken sich nicht mehr gegenseitig.
- **Nie mehr festhängen:**
  - Spielfigur, Gegner und Crew können nicht mehr dauerhaft in einer Parade, einer Fähigkeit, einem Angriff, einem Ausholen oder einem Flug festhängen, falls eine Animation ihr Ende nicht meldet.
  - Verzögerte Ereignisse laufen jetzt in Spielzeit, stehen in der Pause still und verfallen beim Verlassen. Das betrifft den Rundumschlag der Crew, gestaffelte Breitseiten, die Erwachen-Sequenz, neues Treibgut und Donner nach dem Blitz.
  - Vorher konnte die Crew nach dem Verlassen der Insel noch Gegner treffen, und Kanonenkugeln wurden noch nach dem Untergang abgefeuert.
  - Banner, Kapitelstart und Abspann erscheinen nicht mehr, wenn man inzwischen ins Menü zurückgekehrt ist oder einen anderen Spielstand geladen hat.
- **Saubere Konsole:** Beim Start kamen je Spielstart 16 Animations-Warnungen und eine veraltete Lader-Einstellung. Beides ist weg.

**Technik (für Entwickler):**
- Physik und Kollision:
  - `Blocker` mit gedrehtem Rechteck (`hw`, `hd`, `yaw`; `r` = umschließender Radius), `boxBlocker()` und `inBox()` in `world/islandGround.ts`.
  - `IslandGround.constrain` schiebt aus Rechtecken heraus: über den nächsten Randpunkt, im Inneren entlang der kleinsten Eindringtiefe.
  - Die Auflösung läuft bis zu drei Durchgänge, wenn ein Hinausschieben in einem Nachbarobjekt landet. `NavGrid` brennt die Rechtecke ein.
  - `town.ts`: `place()` nimmt Kreis oder `[Breite, Tiefe, Versatz]`, `extra()` für Amboss, Esse und Kran.
  - `islandDress.ts`: `blockBox()` für Festungs- und Bossmauern sowie Ruinenblöcke. Pfähle bekommen Kreise, der Bogen wird gedreht. Der Felsradius folgt der Streckung, auch im Wasser.
  - `seaWorld.ts`: Kollider für jeden Felsbrocken.
- Darstellung:
  - Szenengraph-Prüfung (2746 Meshes): keine unsichtbaren Meshes, keine NaN-Geometrie, keine umgedrehten Normalen (Stichprobe je Geometrie), keine gespiegelten Matrizen, keine unnötig transparenten Materialien.
  - Straßen und Platz bekommen je eine eigene Material-Kopie mit gestaffeltem `polygonOffset`. `windowMat` hat ebenfalls `polygonOffset`, das Brunnenwasser liegt 3 cm höher.
  - VRoid-Teile mit `transparent` schreiben keine Tiefe mehr (`depthWrite = false`, wie MToon „Transparent“).
- Spiellogik:
  - Wächter je Zustand: Spieler (`attack` > 4 s, `roll`/`hurt` > 2 s → `toMove`), Gegner (`attack` > 5 s → `endAttack`, `windup` > 4 s → Abbruch mit Rückgabe des Angriffsplatzes, `air` > 6 s → Landung), Crew (`attack`/`spawn` > 3 s).
  - `setTimeout` ersetzt durch Spielzeit-Timer: `Ally.sweep`, `NavalSystem.later` (mit Prüfung `ship.alive`), `SeaWorld.later`/`runTimers` und `Weather.thunderT`.
  - In `game.ts` laufen 16 verzögerte Anzeigen über `after()` mit Sitzungszähler `session` (steigt in `enterPlay` und `quitToMenu`).
  - `Ally.dispose` und `Enemy.dispose` räumen offene Treffer und den Angriffsplatz ab.
- Konsole:
  - `VroidBase.retarget` filtert Spuren ohne Zielknochen (`PropertyBinding.parseTrackName`) und gibt den Hilfs-Clip danach frei (`uncacheClip`).
  - `DRACOLoader.setDecoderConfig` entfernt (WebAssembly ist Standard).
  - Geprüft: kein `console.log` im Spiel. `console.warn` gibt es nur in Fehlerpfaden. Alle Promises haben `catch`/`try`. Event-Listener sind app-weit und einmalig.
- Geänderte Dateien: `world/islandGround.ts`, `world/town.ts`, `world/islandDress.ts`, `world/seaWorld.ts`, `world/weather.ts`, `ai/navGrid.ts`, `entities/ally.ts`, `entities/enemy.ts`, `entities/player/playerFoot.ts`, `entities/character/character.ts`, `entities/character/vroid.ts`, `naval/naval.ts`, `core/game.ts`, `core/preload.ts`.
- Messung:
  - 1200 Läufe gegen alle Rechteck-Kollider von Ankerglück (192.000 Schritte zu 8 cm): Schritte mit mehr als 10 cm Eindringen 879 → 3. Das größte Eindringen sank von 44 auf 25 cm, nur in Nischen schmaler als die Figur.
  - Alle 50 Rechtecke sind im NavMesh gesperrt. Kollisionsschritt 5 µs.
  - Testlauf (Seefahrt im Sturm, Breitseite, Lagerkampf, Stadt im Regen, Stufenwechsel Ultra → Niedrig → Hoch): Konsole ohne Warnungen und Fehler.

## 2.9.21 – Dynamische Auflösung (08.11.2026)

- **Dynamische Auflösung:**
  - Fällt die Bildrate mehrere Sekunden unter 50 fps, rechnet das Spiel mit etwas weniger Pixeln. Die Schritte betragen etwa 12 %, und es wird nie unschärfer als auf der Stufe „Niedrig“ (0,75 Bildpunkte je Anzeigepunkt).
  - Läuft es wieder lange flüssig, kehrt die volle Auflösung der Grafikstufe zurück, aber nie mehr als die Stufe vorsieht.
  - **Schutz vor unnötiger Unschärfe:** Jede Absenkung ist ein Versuch. Bringt sie keine höhere Bildrate, nimmt das Spiel sie zurück und probiert es erst viel später wieder. Das betrifft zum Beispiel Handys im Stromsparmodus mit festen 30 fps oder Fälle, in denen der Prozessor statt der Grafikkarte bremst.
  - Erst wenn die Auflösung nicht mehr weiter sinken kann, senkt „Automatisch“ die ganze Grafikstufe.
  - Ein- und ausschaltbar unter Einstellungen → Grafik (standardmäßig an). Ist die FPS-Anzeige an, steht dort die aktuelle Auflösung in Prozent.
- **Grafikstufen:** Die fünf Stufen (Niedrig, Mittel, Hoch, Maximal, Ultra) regelten schon bisher zentral Schattenauflösung und -reichweite, Umgebungsverdeckung, Partikelmenge, Post-Effekte, Sichtweite und Texturen. Daran hat sich nichts geändert.
- **WebGPU:** Das Spiel erkennt jetzt, ob der Browser WebGPU kann, und zeigt es im Grafikmenü an. Es bleibt aber bewusst bei WebGL 2. Alle Effekte, Toon-Shader, Schatten, Spiegelungen, das Meer und die Nachbearbeitung sind für WebGL geschrieben. Ein Wechsel würde heute Effekte kosten und eher langsamer laufen.

**Technik (für Entwickler):**
- Änderungen:
  - `DynamicResolution` (`src/render/dynamicResolution.ts`): Messfenster 1 s, 4 s Anlauf nach Laden, Stufenwechsel oder Pause (`rewarm`).
    - Unter 50 fps in 2 Fenstern: Faktor × 0,87 (auf 0,05 gerundet). 6 Fenster ab 57 fps: +0,08 bis höchstens 1. Zwischen zwei Änderungen liegen mindestens 1,5 s.
    - Jede Änderung wird nach 2 Fenstern geprüft. Eine Absenkung ohne +3 fps wird zurückgenommen und gesperrt (45 s, verdoppelt bis 10 min). Eine Anhebung, nach der die Bildrate unter 50 fällt, wird zurückgenommen und 60 s gesperrt.
  - `GameRenderer.pixelRatio()` = Stufenwert (`basePixelRatio`) × Faktor, mindestens min(Stufenwert, 0,75). `applyQuality` setzt den Faktor zurück.
  - `AutoQuality` senkt die Stufe nur noch, wenn die dynamische Auflösung keinen Spielraum mehr hat (`hasRoom`).
  - Neue Einstellung `dynamicResolution` (Standard an; alte Einstellungen werden ergänzt). Schalter im Grafikmenü, Anzeige in FPS-Leiste und Fakten.
  - `detectWebGpu()` in `render/quality.ts`: `navigator.gpu.requestAdapter()`, nur zur Anzeige.
- Neue Dateien: `src/render/dynamicResolution.ts`.
- Geänderte Dateien: `render/renderer.ts`, `render/quality.ts`, `core/game.ts`, `core/settings.ts`, `ui/menus.ts`.
- Messung (Simulation des Watchdogs mit vorgegebener Bildrate):
  - Grafikkarte überlastet (38 fps bei voller Auflösung): eine Absenkung auf 85 %, danach stabil über 50 fps.
  - Last vorbei: in 14 s zurück auf 100 %.
  - Feste 30 fps oder Prozessor-Last: Versuch nach 6 s, nach 2 s zurückgenommen, neue Versuche nach 45/90/180 s.
  - Knapp über 50 fps oder Stufe Niedrig: keine Änderung.
  - Größenwechsel im Spiel: 1,3 ms (1197 × 1102 → 1017 × 937).

## 2.9.20 – Musik, die mit der Gefahr wächst, und epische Seeschlachten (08.11.2026)

- **Musik passt sich der Gefahr an:**
  - Kommt ein Feind näher, blendet das laufende Stück nahtlos und taktgenau von der Erkundung in den Kampf über, ohne Wechsel des Stücks.
  - Zuerst setzen treibende Celli und Pauken ein (Spannung), dann das volle Kampforchester. Beim Übergang in den Kampf gibt es einen großen Trommel-, Becken- und Blechschlag.
  - Nach dem Kampf klingt die Musik in etwa 10 Sekunden wieder in die Erkundung aus. So flackert sie nicht hin und her.
  - Hafen- und Nachtmusik weichen bei Gefahr dem Regionsthema mit seinem Kampfarrangement. Legenden behalten ihr eigenes Boss-Stück.
- **Epische Seeschlachten:**
  - Auf See wird das Meeresthema im Kampf zur Hymne: Hörner tragen die Melodie, Trompeten strahlen eine Oktave darüber, Posaunen und Tuba spielen ein schweres „DAM – da DAM“-Ostinato.
  - Spiccato-Streicher treiben in Sechzehnteln, ein Taiko-Ensemble mit Vorschlägen gibt den Takt.
  - Dazu kommen ein großer Chor („Oh“), Paukenwirbel und Becken, die in jede neue Phrase hineinschwellen.
  - Die Instrumente sitzen wie im Orchester im Raum: Streicher links, Blech rechts, Chor und Trommeln in der Mitte.
  - Zu Fuß klingt der Kampf leichter, mit Streichern, Trommeln und Hörnern.
- **Räumlicher Klang:**
  - Links und rechts kommen jetzt von der Kamera aus, passen also immer zum Bild. Die Lautstärke richtet sich nach dem Abstand zu deiner Figur.
  - Entfernte Klänge werden natürlich leiser (logarithmisch) und dumpfer, weil die Luft die Höhen schluckt.
  - Jede Klangart hat ihre eigene Reichweite: Schritte verklingen schnell, Hiebe sind mittelweit zu hören, Kanonendonner über Hunderte Meter.
  - Bei vielen gleichzeitigen Klängen fallen die leisesten weg, damit nichts übersteuert.
- **Abwechslung:**
  - Schritte und Schwerthiebe klingen nie zweimal gleich: Tonhöhe ±5 %, Lautstärke ±15 % und mehrere Varianten, nie dieselbe zweimal hintereinander.
  - Schritte klingen je nach Untergrund anders: Sand und Gras, Holz an Deck (mit gelegentlichem Knarren), Pflaster in der Stadt.
  - Auch Treffer, Faustschläge und Paraden schwanken leicht.

**Technik (für Entwickler):**
- Änderungen:
  - Schichten (Stems) je Stück: `base` (Fläche, Bass), `explore` (Fidel/Flöte/Laute), `tension` (Celli-Ostinato, Pauke), `combat` (Taiko-Ensemble, Spiccato, Blech, Chor, Becken).
    - Jede Schicht hat eigene trockene und Hall-GainNodes und drei Stereoplätze (StereoPanner ±0,45, Ausgleich +2,6 dB). Im sparsamen Modus läuft alles mono.
    - Überblenden mit gleichmäßiger Leistung (`cos`/`sin`) über die geglättete Bedrohung (≈ 0,9 s rein, 4 s Halten, ≈ 6 s raus). Pegelausgleich je Schicht `STEM_TRIM`.
    - Geplant werden nur hörbare Schichten (`hot`: 1,5 s Ausklingzeit), das spart Rechenzeit.
  - `setMood(mood, threat, song, naval)`: Kampf wechselt kein Stück mehr; `naval` schaltet Blech-Ostinato, Trompeten, zweite Taiko-Reihe und lauteren Chor zu. `musicThreat` liest die geglättete Bedrohung.
  - Neue Stimmen: `spiccato`, `lowBrass`, `trumpet`, `timpani` (auf den Grundton gestimmt), `cymbal` (Schwellung oder Schlag). Kampfbeginn-Schlag `sting` am nächsten Taktanfang (höchstens alle 25 s).
  - 3D-Klang: PannerNode mit `distanceModel: 'exponential'`, also −6 dB × rolloff je Abstandsverdopplung.
    - Klangarten `SPATIAL_CAT`: Schritte (ref 2,5 m, rolloff 1,2, 45 m), Kampf (4 m, 1,0, 110 m), laut (22 m, 0,75, 900 m), mittel (8 m, 1,0, 260 m).
    - Die Richtung kommt von der Kamera (`setListener3D`), die Entfernung von den Ohren der Figur (`setEars`). Der Panner sitzt auf dem Kamerastrahl im Ohrabstand.
    - Luftdämpfung als Tiefpass ab 2 × ref. Stimmenbegrenzung je Klangart (Schritte 8, Kampf 10, laut 14).
  - Varianz: `pitch`/`gainVar` gelten für alle Bausteine von `tone`/`noise` (höher heißt kürzer, wie ein schneller abgespieltes Sample). `pick()` wählt Varianten ohne direkte Wiederholung. `surface` (sand/holz/stein) setzt das Spiel je nach Ort.
- Geänderte Dateien: `audio/audio.ts`, `core/game.ts`, `world/seaWorld.ts` (`onDeck`).
- Behobene Fehler beim Entwickeln:
  - Die Offline-Messung wurde vom laufenden Spiel gestört, weil es den Hörer jedes Bild neu setzte. Gemessen wird jetzt mit angehaltener Spielschleife.
  - Seitlich aufgestellte Instrumente waren 3 dB leiser als die Mitte (Equal-Power-Panning); das ist ausgeglichen.
- Messung (offline, OfflineAudioContext):
  - Pegel (RMS): Erkundung 0,046 · Spannung 0,059 · Seeschlacht 0,081 (+4,9 dB) · Kampf zu Fuß 0,072. Spitzen höchstens 0,58.
  - 3D-Dämpfung je Abstandsverdopplung: Hiebe −6,0 dB · Kanonen −4,5 dB · Schritte −7,2 dB. Luftdämpfung bei 64 m: −14 dB bei 6 kHz. Stereo bei 6 m seitlich: 5,9 dB Unterschied.
  - Rechenaufwand: Seeschlacht etwa 72 Oszillatoren pro Sekunde, ungefähr so viel wie das bisherige Boss-Stück (68).

## 2.9.19 – Klügere Gegner, Wege um Hindernisse, präzise Treffer (08.11.2026)

- **Gegner finden ihren Weg:**
  - Gegner und deine Crew laufen flüssig um Häuser, Felsen, Bäume und Kisten herum, statt daran hängen zu bleiben.
  - Große Gegner meiden enge Gassen, durch die sie nicht passen.
  - Gegner erscheinen nicht mehr in Häusern oder Felsen.
- **Gegner verhalten sich wie echte Wachen:**
  - **Patrouille:** Im Lager gehen sie umher, bleiben stehen und sehen sich um.
  - **Verdacht:** Sehen oder hören sie etwas, erscheint ein **?** über dem Kopf. Dann gehen sie zur Stelle, an der sie dich bemerkt haben.
  - **Alarm:** Erkennen sie dich, erscheint ein **!**, und das Lager in der Nähe greift an. Gegner sehen nach vorn (etwa 130°, bis 26 m weit), hören dich im Umkreis von 6 m und sehen nicht durch Häuser oder Felsen.
  - **Flankieren:** Greifen schon zwei Gegner an, suchen sich die anderen einen Platz an deiner Seite oder in deinem Rücken.
  - **Rückzug:** Schwer verletzte Gegner fliehen einmal je Kampf zum Lager, verschnaufen kurz und kommen dann zurück. Wenn du sie in die Enge treibst, schlagen sie zurück. Legenden fliehen nie.
  - Wer dich lange aus den Augen verliert, sucht erst nach dir und kehrt dann zur Patrouille zurück.
- **Treffer sind präzise:**
  - Deine Klinge trifft genau dort, wo sie sichtbar durchzieht. Funken sprühen an der Stelle, an der sie den Gegner schneidet.
  - Jede Figur hat drei Trefferzonen. Kopftreffer machen 25 % mehr Schaden, Beintreffer 15 % weniger.
  - Wer hinter dir oder neben dir steht, wird nicht mehr „mitgetroffen“.
  - Liegende oder durch die Luft fliegende Gegner trifft nur ein Hieb, der sie wirklich erreicht.
  - Beim Faustkampf zählen Fäuste und Füße, Tritte treffen also mit dem Bein.
  - Schnelle Geschosse fliegen nicht mehr durch Gegner hindurch.

**Technik (für Entwickler):**
- Änderungen:
  - NavMesh als Raster (`src/ai/navGrid.ts`): 0,6-m-Zellen je Insel, gesperrt sind Meer und runde Hindernisse.
    - Freiraum je Zelle per Chamfer-Distanztransformation, damit jede Figur mit ihrem eigenen Radius plant.
    - A* mit 8 Nachbarn ohne Eckenschneiden. Die Puffer (Heap, g/f, Elternzellen, Markierungen) sind vorab angelegt.
    - Wege werden mit Sichtlinien geglättet (String Pulling).
    - Cache für die zwei zuletzt benutzten Inseln; neu gebaut, wenn sich die Zahl der Hindernisse ändert.
  - `NavAgent`: bei freier Sicht direkt zum Ziel, sonst über den Weg. Neu geplant wird alle 0,45–0,65 s, wenn sich das Ziel verschiebt oder die Figur feststeckt.
  - Verhaltensbaum (`src/ai/behaviorTree.ts`): Selector, Sequence, Bedingung, Handlung. Der Baum ist geteilt, die Tafel liegt im Gegner.
  - Gegnerbaum (`src/ai/enemyBrain.ts`): Furcht → Rückzug → Kampf (Angriff mit Angriffsplatz / Flankieren / Jagd) → Verdacht → Patrouille.
    - Wahrnehmung mit Verdachtswert 0 … 1, letzter bekannter Position und Sichtlinie über das NavMesh.
  - `Enemy`: Animationszustände (Ausholen, Angriff, Treffer, Taumeln, Luft, K.o.) bleiben erhalten. In den freien Zuständen entscheidet der Baum über `goTo`/`stand`/`strafe`/`lookAround`.
    - Neue Zustände: `patrol`, `suspicious`, `flank`, `retreat`.
    - Rückzugsschwelle `retreatAt`: 25 %, Elite 15 %, Schläger 12 %, Legenden nie.
  - OBB-Hitboxen (`src/combat/hitbox.ts`):
    - `OBB` mit Strecken-Test (Slab, mit Radius) und Quader-Test (Trennachsen-Satz, 15 Achsen).
    - `Hurtbox` mit Kopf, Rumpf und Beinen aus Hüfte, Kopf und Füßen, je Logikschritt einmal berechnet.
    - `LogicFrame` rechnet Knochen in den Figurenraum zurück und setzt sie mit Position und Drehung des Logikschritts neu ein (wichtig bei schlagartiger Zielhilfe-Drehung).
  - Spielerhieb als Raycast-Sweep:
    - Je Klinge (`trailBase` → `trailTip`) bzw. Unterarm/Unterschenkel ohne Klinge wird die Lage zwischen zwei Logikschritten in bis zu 8 Teilschritten abgetastet.
    - Dazu kommt ein waagrechter „Schwertwind“ von der Spitze bis zur Reichweite des Angriffs, auf Körperhöhe. Bei Fäusten und Füßen gilt er nur ausgestreckt.
    - Das Abtastfenster beginnt 0,2 vor und endet 0,22 nach dem Trefferfenster, weil viele Animationen die Klinge früher oder später durchziehen.
    - Rundum-Wellen und Faji-Stöße nutzen ein Angriffsvolumen (OBB).
  - Gegner- und Crew-Hiebe: Angriffsvolumen (OBB) gegen die Trefferzonen statt Abstand plus Winkel. Geschosse: Wisch-Test von der letzten zur aktuellen Position.
  - Crew (`Ally`) läuft über `NavAgent`. `AllyWorld` hat dafür `nav()` und `reach()` bekommen.
- Neue Dateien: `src/ai/navGrid.ts`, `src/ai/behaviorTree.ts`, `src/ai/enemyBrain.ts`, `src/combat/hitbox.ts`.
- Geänderte Dateien: `entities/enemy.ts`, `entities/ally.ts`, `entities/player/playerFoot.ts`, `combat/combat.ts`, `world/seaWorld.ts`.
- Behobene Fehler beim Entwickeln:
  - Knochen hinkten bei schneller Drehung einen Schritt hinterher (falsche Klingenrichtung beim ersten Hiebschritt).
  - Bei Faustkämpfern wurden nur die kurzen Handschuh-Markierungen gefunden, Tritte trafen nie.
  - Eine entlang der schräg gehaltenen Klinge verlängerte Reichweite zielte über die Köpfe hinweg; jetzt wird der Wind waagrecht verlängert.
- Messung:
  - NavMesh-Aufbau Krähenfels (227 × 227 Zellen, 42 Hindernisse): 6,7 ms beim Betreten.
  - Weg um einen 9-m-Felsen: volle Laufgeschwindigkeit, Abstand zum Felsen 0,5 bis 1 m.
  - Trefferquote Klingen-Sweep (6 Abstände/Winkel × 5 Hiebe): Säbel 30/30, Langklinge 30/30, Zweihänder 30/30, Doppelklingen 29/30, Faust 29/30. Hinter und neben der Figur: 0 Treffer.
  - Logikschritt Kampf mit 5 Gegnern: Median 0,10 ms, 99 % unter 0,3 ms.

## 2.9.18 – Tag und Nacht, echter Regen, nasse Straßen und Pfützen (08.11.2026)

- **Tageszeit:**
  - Die Sonne wandert ohne Sprünge über den Himmel. Himmel, Nebel, Umgebungslicht und Meer passen ihre Farben laufend an.
  - Die Stimmungen gehen fließend ineinander über: Morgenrot, eine neue klare Mittagssonne, Dämmerung und Nacht.
  - Beim Wechsel von Sonne zu Mond wird das Licht kurz weich gedimmt. Schatten springen nicht mehr von einer Seite zur anderen.
- **Regen:**
  - Tausende Tropfen fallen als feine Streifen und werden vom Wind schräg getrieben.
  - Die Zahl der Tropfen hängt von der Grafikstufe ab, die Bewegung berechnet die Grafikkarte.
  - Rund um deine Figur spritzen Tropfen auf Boden, Deck und Wasser auf.
- **Nässe:**
  - Bei Regen werden alle Oberflächen nach und nach nass: dunkler, satter und glänzend.
  - Böden, Dächer und Schultern werden schneller nass als Wände.
  - Nach dem Regen trocknet alles in ein bis zwei Minuten wieder, in der Sonne schneller.
- **Pfützen:**
  - Auf Pflaster, Sand, Gras und Holzplanken bilden sich nach einer Weile Pfützen.
  - Sie spiegeln den Himmel und ab Grafikstufe Hoch auch Figuren, Häuser und Schiffe.
  - Regenringe kräuseln die Wasseroberfläche.

**Technik (für Entwickler):**
- Änderungen:
  - Tageszeit: neuer Schlüssel „Mittag“ (12,5 Uhr) in `data/world.ts`, „Morgenrot“ umbenannt.
  - `Palette.lightK` dimmt die Hauptlichtquelle beim Übergang Sonne ↔ Mond (`timeOfDay.ts`, `environment.ts`).
  - Regen: instanzierte Quads statt Linien (`InstancedBufferGeometry`, Attribut `aSeed`, bis 6000 Tropfen, `instanceCount` = Stufe × Regenstärke).
    - Die Bahn wird im Vertex-Shader berechnet (Wind, Box um die Kamera).
    - Die Streifen sind zur Kamera gedreht, werden mit der Entfernung breiter und vor der Linse ausgeblendet.
  - Regenspritzer: `SeaWorld.rainSplashes()` über das vorhandene Gischt-Partikelsystem.
  - Nässe: `src/render/wetness.ts` mit gemeinsamen Uniforms `uWet` und `uPuddle` und `updateWetness()` im Logikschritt. `uWet` baut sich mit dem Regen auf, `uPuddle` folgt verzögert.
    - Im Toon-Shader (alle Materialien) sinkt die Rauheit, der Spiegelanteil (Metallwert) steigt in Pfützen, die Grundfarbe wird dunkler.
    - Für Materialien ohne Umgebungskarte kommen Glanzfleck und Himmelsspiegelung (Fresnel) hinzu, gewichtet nach oben zeigenden Flächen.
  - Pfützen: Toon-Option `puddles` (Sand 0,75, Gras 0,45, Planken 0,6, Pflaster 1). Rauschmaske auf ebenen Flächen.
    - Die Ebenheit kommt aus der echten Geometrie per `dFdx`/`dFdy`, nicht aus der Reliefkarte.
    - Regenringe kippen die Normale. Die SSR-Maske im Alpha-Kanal liegt bei 0,62 … 0,98.
    - Die Weltposition (`vSkWorld`) berücksichtigt jetzt auch instanzierte Netze.
- Neue Dateien: `src/render/wetness.ts`.
- Geänderte Dateien: `render/toon.ts`, `world/weather.ts`, `world/environment.ts`, `world/timeOfDay.ts`, `world/seaWorld.ts`, `world/islandStyle.ts`, `world/town.ts`, `world/worldEdge.ts`, `data/world.ts`.
- Behobene Fehler:
  - Die Regen-Quads wurden je nach Fallrichtung als Rückseite verworfen und waren unsichtbar, deshalb jetzt beidseitig.
  - Eine Wurzel aus einem minimal negativen Wert im Regen-Shader ergab NaN und machte über Bloom das ganze Bild schwarz.
  - `smoothstep` mit vertauschten Grenzen ist in GLSL undefiniert und lieferte auf manchen Grafiktreibern 0. Betroffen waren der Regen-Shader, die Regenringe und ein bestehender Fall am Weltrand-Wasserfall (`worldEdge.ts`).
  - Die Pfützen-Normale ist gegen Nullvektoren abgesichert (Decken, entartete Ableitungen).
- Messung (GPU, Hoch, Hafen von Ankerglück): trocken 1,54 ms, Regen mit voller Nässe und Pfützen 1,67 ms.

## 2.9.17 – Spiegelungen im Wasser, Wind in den Pflanzen, Fokus auf Gegner (08.11.2026)

- **Spiegelungen (Screen Space Reflections), ab Grafikstufe Hoch am PC:**
  - Das Meer spiegelt Schiffe, Masten, Segel, Figuren, Inseln und Effekte, gebrochen von den Wellen.
  - Flach über das Wasser geschaut stärker, von oben schwächer.
  - Spiegelnde Böden und Pfützen können ab jetzt mitspiegeln (Toon-Option `reflect`). Pfützen bei Regen folgen mit dem Wetter-Update.
- **Wind in den Pflanzen:**
  - Gras, Büsche, Palmwedel, Baumkronen und Stämme wiegen sich im Wind.
  - Böen wandern sichtbar übers Land, und Blätter und Halme flattern leicht quer zum Wind.
  - Die Stärke folgt dem Wetter: ruhig bei Flaute, kräftig im Sturm.
  - Wurzeln bleiben stehen, die Spitzen bewegen sich. Auch die Tusche-Konturen auf Niedrig und Mittel bewegen sich mit.
- **Sonnenstrahlen:** Die Lichtstreuung durch Lücken in Baumkronen, Masten und Häusern ist kräftiger und feiner aufgelöst und erscheint jetzt schon ab etwa 6° Sonnenhöhe, also auch im Abendlicht.
- **Dynamische Tiefenunschärfe (Bokeh), jetzt auch auf Hoch am PC:**
  - Erfasst du einen Gegner (Lock-on), wandert der Fokus weich auf ihn, und der Hintergrund wird unscharf.
  - In Nahaufnahmen zu Fuß verschwimmt der Hintergrund stärker, auf See nur der Horizont.

**Technik (für Entwickler):**
- Änderungen:
  - `SsrPass`/`SsrEffect` (`src/render/ssr.ts`): Strahlverfolgung im Bildschirmraum in reduzierter Auflösung mit Binärverfeinerung, Treffer-Dicke passend zur Schrittweite, Ausblenden an Rändern und mit der Entfernung, 5-Proben-Weichzeichnen beim Mischen.
  - Spiegelmaske im Alpha-Kanal: Wasser < 0,5, spiegelnde Toon-Flächen 0,6 … 0,96 (Option `reflect`, nur mit Nachbearbeitung).
  - Stufen: Hoch 14, Maximal 20, Ultra 28 Schritte; am Handy aus.
  - Wind (`src/render/wind.ts`): Gewicht je Eckpunkt `aWind`, gesetzt mit `windify()` vor dem Zusammenfassen. `mergeByMaterial` behält es und füllt fehlende Gewichte mit 0. Materialien mit `markWind()`, Shader-Baustein `WIND_PARS` (Rauschen, Böen, Flattern) im Toon- und im Kontur-Shader. Uniforms kommen aus der Umgebung (Zeit, `windDir`, Wetterwind).
  - God Rays: Dichte 0,96, Zerfall 0,935, Gewicht 0,26, mehr Proben; Einblenden ab Sonnenhöhe ≈ 0,1.
  - Tiefenunschärfe: weich nachgeführter `dofFocus`, Ziel `dofTarget` (erfasster Gegner aus `SeaWorld.lockFocus`), Schärfebereich und `bokehScale` nach Kameraabstand. Auf Hoch an, am Handy aus.
- Neue Dateien: `src/render/ssr.ts`, `src/render/wind.ts`.
- Geänderte Dateien: `render/renderer.ts`, `render/toon.ts`, `render/outline.ts`, `world/islandStyle.ts`, `world/islandDress.ts`, `world/town.ts`, `world/environment.ts`, `world/seaWorld.ts`, `core/game.ts`, `data/qualityTiers.ts`.
- Behobene Fehler beim Entwickeln:
  - Der Schiffsrumpf wurde wegen knapp unter 1 liegender Alpha-Werte (Vertexfarben) als spiegelnd erkannt.
  - Lange Strahlschritte übersprangen Treffer, deshalb fehlte die Rumpfspiegelung direkt unter dem Schiff.
- Messung (GPU): See Hoch 1,9 ms, See Maximal 2,2 ms, Stadt Hoch 2,6 ms. Spiegelungen und Tiefenunschärfe auf Hoch kosten zusammen etwa 1 ms.

## 2.9.16 – Schneller laden, kein Ruckeln beim ersten Kampf, neuer Ladebildschirm (08.11.2026)

- **30 % weniger Download:** Die Figuren und Animationen sind komprimiert, 8,6 MB statt vorher 12,4 MB. Der erste Start geht spürbar schneller, besonders am Handy. Das Offline-Paket ist 1,5 MB kleiner.
- **Kein Ruckeln beim ersten Mal:** Bevor der Ladebildschirm verschwindet, bereitet die Grafikkarte alle Effekte einmal vor: Gegner, Treffer-Leuchten, Auflösen, Waffenschweife, Bodenspuren und die Einschläge aller 14 Elemente. Der erste Landgang und die ersten Fähigkeiten laufen dadurch ohne Hänger.
- **Neuer Ladebildschirm:**
  - Prozentanzeige mit weich laufendem Balken und der aktuellen Phase („Figuren und Animationen werden geladen …“, „Effekte werden vorbereitet …“, „Leinen los!“).
  - Wechselnde Tipps zum Spiel.
  - Sanftes Ausblenden, wenn wirklich alles bereit ist.

**Technik (für Entwickler):**
- Änderungen:
  - Zentrale Lade-Pipeline `preload` (`src/core/preload.ts`): ein `LoadingManager`, ein gemeinsamer `GLTFLoader` mit `DRACOLoader`, `KTX2Loader` und `MeshoptDecoder`.
  - Fortschritt nach Bytes je Datei plus gewichtete Aufgaben: Dateien 72 %, Aufbereiten 8 %, Shader 20 %.
  - Hinweise zu den Formaten:
    - Den früheren `BasisTextureLoader` gibt es in three.js nicht mehr; `KTX2Loader` mit dem Basis-Transcoder ist sein Nachfolger.
    - Die Figurentexturen bleiben WebP, weil das Spiel sie für das Umfärben pixelweise liest, was mit GPU-komprimierten Texturen nicht geht.
    - Audiodateien gibt es keine: Musik und Klänge entstehen per Web Audio.
  - Assets: VRoid-Figuren und Mannequin mit Draco (`gltf-transform draco`), KayKit-Animationen mit Meshopt. `scripts/build-vroid.mjs` komprimiert künftig selbst mit Draco (Entwicklerpaket `draco3dgltf`).
  - Decoder lokal: `public/libs/draco` (wasm, im Offline-Paket) und `public/libs/basis` (nur bei Bedarf, per `globIgnores` vom Vorab-Cache ausgenommen).
  - Shader-Aufwärmen (`src/core/warmup.ts`):
    - Je ein Exemplar aller Figuren- und Effektarten vor der Kamera, dann `renderer.compileAsync()` plus zwei gerenderte Bilder (Schattenkarten, Nachbearbeitung).
    - Ein unsichtbarer „Shader-Bewahrer“ hält von jedem neuen Material eine Kopie. Die Aufwärm-Figuren bleiben unsichtbar erhalten. So gibt three.js die Programme nicht wieder frei.
  - `LoadingScreen` (`src/ui/loadingScreen.ts`): Balken über `transform`, Prozent, Phase, Tipps, Ausblenden, ARIA-Fortschritt.
- Neue Dateien: `src/core/preload.ts`, `src/core/warmup.ts`, `src/ui/loadingScreen.ts`, `public/libs/draco/*`, `public/libs/basis/*`.
- Geänderte Dateien: `entities/character/assets.ts`, `entities/character/vroid.ts`, `core/game.ts`, `world/seaWorld.ts`, `ui/styles.css`, `vite.config.ts`, `scripts/build-vroid.mjs`, `package.json`, `CREDITS.md` und alle Modelle unter `public/assets/characters`.
- Messung (dieser PC, Dateien im Browser-Cache):
  - Laden und Aufwärmen dauern zusammen etwa 1,4 s.
  - Neue Shader beim ersten Landgang: 3 (vorher wurden Gegner-, Treffer- und Effekt-Shader erst im Kampf übersetzt).
  - Neue Shader bei den Einschlägen aller 14 Elemente: 0. Das Bild mit allen Einschlägen dauert 16 ms.

## 2.9.15 – Waffenschweife, Auflade-Auren, Bodenspuren, Hitzeflimmern, Gewicht beim Laufen (08.11.2026)

- **Leuchtende Waffenschweife:** Klingen ziehen beim Hieb einen glühenden Lichtschweif nach, der in rund 0,16 s verglüht und zur Spitze hin heller ist.
  - Gilt für deine Schläge in der Farbe deines Kampfstils, für Fähigkeiten, für die Crew in ihrer Farbe und für Gegner in Warnrot.
  - Faustkämpfer bekommen einen kurzen Schweif an den Knöcheln.
- **Mehrstufige Fähigkeiten:**
  1. Beim Wirken erscheint ein leuchtendes magisches Siegel unter dir, Funken steigen auf, und Feuer lässt die Luft schon beim Wirken flirren.
  2. Der Einschlag bringt Druckwelle, Splitter und Funken wie bisher.
  3. Neu dazu kommen eine Spur am Boden und Hitzeflimmern.
- **Auflade-Aura:** Beim Aufladen des schweren Angriffs wächst ein Siegel am Boden, Funken steigen auf, und die Luft um dich flirrt.
- **Hitzeflimmern:** Das Bild verzerrt sich leicht um Feuer, Meteore, Blitzeinschläge und aufladende Kämpfer, ab Grafikstufe Hoch.
- **Spuren am Boden:** Bodenrisse (schwere Schläge, Erde, Meteore), Brandflecken mit Glut (Feuer, Meteor, Blitz), giftgrüne Flecken, Reif (Eis) und leuchtende Siegel (Licht, Geist, Schatten). Sie legen sich ans Gelände und verblassen nach einigen Sekunden.
- **Gewicht beim Laufen:** Der Oberkörper neigt sich beim Rennen leicht nach vorn und legt sich in Kurven nach innen. Gegner, Crew und Stadtleute setzen ihre Schritte jetzt passend zum Tempo, ihre Füße gleiten nicht mehr über den Boden.

**Technik (für Entwickler):**
- Änderungen:
  - `WeaponTrail`: Ribbon-Mesh aus 24 Stützpunkten zwischen den Marken `trailBase`/`trailTip` der Waffe, abgetastet bei jedem Bild über `Character.renderTrails()`, additiv, altersbasiert ausgeblendet. Steuerung mit `Character.setTrail(on, farbe)`.
  - `DecalSystem`: Pool aus 28 geländeangepassten Netzen (9×9) mit vier gemalten Texturen. Halten und Bewegen für die Auflade-Aura; `CombatFx.crack/burn/frost/sigil/rise/heat`.
  - `HeatEffect`: eigener `EffectPass` mit `mainUv`, bis zu 6 projizierte Hitzequellen aus `heatShared` (Tier-Schalter `post.heat`: Hoch/Max/Ultra).
  - Neigung: `Character.lean(yaw, tempo, dt)` addiert Roll und Neigung auf Wirbelsäule und Brust nach der Animation.
  - `Character.place()` koppelt `setLocoSpeed` an das echte Tempo und neigt in Kurven.
- Neue Dateien: `src/render/weaponTrail.ts`, `src/render/decals.ts`, `src/render/heat.ts`.
- Geänderte Dateien: `entities/character/character.ts`, `entities/character/weapons.ts`, `entities/player/playerFoot.ts`, `entities/enemy.ts`, `entities/ally.ts`, `combat/fx.ts`, `faji/elementFx.ts`, `faji/fajiController.ts`, `render/renderer.ts`, `data/qualityTiers.ts`, `world/seaWorld.ts`, `core/game.ts`.
- Behobene Fehler:
  - Seit 2.9.13 wuchs der Speicher bei jedem Eistreffer um 9 Netze, weil die Splitterhöhe nicht gerundet war. Die Rundung der Effekt-Netze ist jetzt grober: Nach 480 Einschlägen zufälliger Stärke bleibt der Zwischenspeicher bei rund 400 kleinen Netzen stehen.
  - Bodenrisse lagen flach auf einer Höhe und schwebten an Hängen. Jetzt folgen sie dem Gelände.
  - Gegner liefen mit fester Animationsgeschwindigkeit (Fußgleiten).
- Messung (GPU, Stadt, Hoch): 2,7 ms inklusive Hitzeflimmern. Speicher nach 8 Landgängen mit Schweifen: unverändert.

## 2.9.14 – Feinschliff: flüssige Kampfanimationen, ruhige Anzeigen, Fehlerjagd (08.11.2026)

- **Weichere Übergänge:** Stehen, Laufen, Angriff, Ausweichrolle und Zauber überblenden jetzt in 150–200 ms. Folgeschläge einer Kombo gehen in 120 ms über, Trefferreaktionen bleiben bewusst schnell. Die Trefferzeitpunkte ändern sich dadurch nicht.
- **Eingabepuffer:** Zu früh gedrückte Angriffe und Rollen gehen nicht mehr verloren.
  - Ein Angriff während einer Rolle folgt direkt nach der Rolle.
  - Eine Rolle während eines Schlags wird ausgeführt, sobald der Schlag abgebrochen werden darf.
  - Zwei Rollen lassen sich verketten.
  - Zu alte Eingaben (über 0,25 s) verfallen.
- **Ruhige Anzeigen:**
  - Lebens-, Faji-, Erfahrungs-, Rumpf- und Nachladebalken sowie die Gegner- und Bossbalken werden von der Grafikkarte skaliert, statt jedes Bild neu vermessen zu werden. Kein Zittern, kein Nachruckeln.
  - Zahlen haben gleich breite Ziffern, damit Text nicht springt.
  - Gegnerbalken kleben auch auf 120/144-Hz-Bildschirmen an den Köpfen.
  - Auf großen Bildschirmen (1600p, 4K) wächst die Oberfläche leicht mit.
- **Schneller in der Stadt:** Kleine Dinge (Figuren, Kisten, Pflanzen) werfen nur in der Nähe Schatten (Hoch 45 m, Maximal 70 m, Ultra 110 m), Leuchtkörper gar keine. Das spart auf Hoch 25 % und auf Maximal 34 % der Zeichenaufrufe.
- **Behoben:**
  - Am Vulkan von Funkenriff waren 168 Eckpunkte ungültig (NaN). Auf manchen Handys kann so etwas schwarze Flecken verursachen.
  - Nach dem Verlassen einer Insel schadeten Brand und Gift unsichtbar weiter, mit schwebenden Zahlen.
  - Gegner-Geschosse flogen nach dem Ablegen weiter.
  - Liegengebliebene Münzen verschwinden beim Ablegen nicht mehr: Die Crew sammelt sie ein.
  - Fehler beim Teilen, Installieren oder Importieren landen nicht mehr unbemerkt in der Konsole, sondern zeigen eine kurze Meldung.

**Technik (für Entwickler):**
- Änderungen:
  - Spieler: `FADE`-Tabelle und Eingabepuffer `buf` mit Logikzeit `clock`, `BUFFER = 0,25 s`. Eingaben während Rolle/Treffer zählen ab deren Ende.
  - Gegner-Ausholen und Crew-Schläge überblenden mit 0,15 s.
  - HUD: `bar()` setzt `transform: scaleX`; `put()` schreibt nur bei Änderung; Elemente werden einmal gesucht; `tabular-nums`; `html { font-size: clamp(16px, 9px + 0.45vmin, 20px) }`.
  - Overlay: Balken folgen einem Anker-Objekt und werden bei jedem Bild projiziert (`placeBars`).
  - Schatten-Detailstufe (`shadowLod` im Renderer, alle 0,25 s): `shadows.smallRange` je Stufe.
  - `keepIf()` (`core/arrays.ts`) ersetzt `filter()` in den Schritt-Schleifen von Seekampf, Fähigkeiten, Effekten, Leben und Seeboss. Die Seekampf-Timer bilden nur noch bei Fälligkeit eine Liste.
  - Fehlerbehandlung: `Menus.run()` fängt synchrone und asynchrone Aktionen ab; `game.start().catch`; `AudioContext.resume/suspend().catch`.
  - Kampf: `leaveIsland()` leert `targets`, `dots`, `swings`, Geschosse und Münzen; entfernte Gegner werden aus allen Tabellen gelöscht.
- Neue Dateien: `src/core/arrays.ts`.
- Geänderte Dateien: `entities/player/playerFoot.ts`, `entities/enemy.ts`, `entities/ally.ts`, `entities/character/character.ts`, `ui/hud.ts`, `ui/combatOverlay.ts`, `ui/styles.css`, `ui/menus.ts`, `combat/combat.ts`, `naval/naval.ts`, `naval/seaBoss.ts`, `faji/abilities.ts`, `faji/elementFx.ts`, `world/life.ts`, `world/islandStyle.ts`, `render/renderer.ts`, `data/qualityTiers.ts`, `audio/audio.ts`, `core/game.ts`, `main.ts`.
- Messung (dieser PC):
  - Stadt, Hoch: 120 fps (Bildschirm-Grenze); Maximal: 83–87 fps.
  - Zeichenaufrufe Stadt: Hoch 914 → 684, Maximal 1613 → 1070.
  - Ein Durchlauf über alle Inselarten, Seegefecht und Entern läuft ohne Fehlermeldung.

## 2.9.13 – Kampf mit Wucht: GPU-Partikel, Treffer-Standbild, Leuchten und Auflösen, 3D-Klang (08.11.2026)

- **Partikel auf der Grafikkarte:** Funken, Gischt, Staub, Treffer- und Magiefunken sowie aller Rauch (Pulverdampf, Lagerfeuer, Vulkane) werden jetzt von der Grafikkarte berechnet. Der Prozessor schreibt nur noch die Startwerte neuer Teilchen. Das spart Rechenzeit und erlaubt mehr Teilchen gleichzeitig (1600 Funken je System, 2000 Rauchwolken).
- **Treffer mit Wucht:**
  - Jeder wirksame Treffer hält das Bild für 30–40 ms an (Standbild), danach folgt wie bisher die kurze Zeitlupe schwerer Treffer.
  - Die Kamera bekommt einen Stoß in Trefferrichtung, der federnd zurückschwingt. Getroffene Gegner, Fähigkeiten und Treffer auf dich selbst stoßen jeweils in ihre Richtung.
- **Treffer-Leuchten:** Getroffene Figuren leuchten kurz an den Rändern auf (Fresnel-Randlicht): Gegner weiß, bei schweren Treffern warm, du selbst rot, Crew orange. Eingefrorene Gegner schimmern eisblau.
- **Auflösen:** Besiegte Gegner fallen und lösen sich dann in Glut auf, mit glühenden Rändern, die über den Körper wandern.
- **3D-Klang:**
  - Hiebe, Treffer, Zauber, Schritte, Kanonen und Platscher kommen aus der Richtung, in der sie passieren, passend zur Blickrichtung der Kamera.
  - Sie werden mit der Entfernung leiser. Am PC wird kopfbezogen gerechnet (HRTF), am Handy sparsamer.
- **Neu: Schritte.** Du, die Gegner und die Crew sind beim Laufen zu hören, Stadtleute leiser. Die Schrittlänge passt sich dem Tempo an, und jeder Schritt klingt etwas anders.

**Technik (für Entwickler):**
- Änderungen:
  - `ParticleSystem` und `SmokeSystem`: instanzierte Billboards. Die Bahn wird geschlossen im Vertex-Shader berechnet: Luftwiderstand 0,25^t bzw. e^(−kt), Auftrieb, Schwerkraft, Wind-Integral. Hochgeladen werden nur die neu beschriebenen Plätze (`addUpdateRange`).
  - `CombatHooks.impact(dirX, dirZ, k)`: Standbild über `hitstop.freeze` (`loop.timeScale = 0`) und Kamerastoß als gedämpfte Feder in `SeaWorld.render`.
  - Toon-Material `fx`: eigene Kopie je Figur (`toonFx`, gleiches Programm mit Schlüssel „f“), Uniforms `uHit`/`uHitCol`/`uDissolve`, Rauschen im Objektraum. Steuerung über `Character.enableFx/hitFlash/setTint/setDissolve`.
  - Audio: `PannerNode` (inverse Dämpfung, ref 14 m, rolloff 0,8, max 400 m) je Effekt. Der Hörer sitzt an der Spielfigur und ist nach der Kamera ausgerichtet (`setListener3D`). Neuer Effekt `step` mit `Character.footsteps()`.
- Neue Dateien: keine.
- Geänderte Dateien: `world/particles.ts`, `world/smoke.ts`, `render/toon.ts`, `entities/character/character.ts`, `entities/character/vroid.ts`, `entities/enemy.ts`, `entities/ally.ts`, `entities/npc.ts`, `entities/player/playerFoot.ts`, `combat/combat.ts`, `world/seaWorld.ts`, `core/game.ts`, `audio/audio.ts`, `ui/combatOverlay.ts`, `faji/fajiController.ts`.
- Behobene Fehler:
  - Das Treffer-Aufblitzen der Gegner tauschte das Material eines einzelnen Netzes. Anime-Figuren bestehen aus vielen Netzen, deshalb blitzten sie nie auf. Das gilt auch für das Eisblau beim Einfrieren. Beides läuft jetzt über den Effekt-Shader.
  - Texturen der Anime-Grundfiguren waren nicht als geteilt markiert. Das Freigeben einer Figur hätte sie für alle anderen neu hochladen lassen.
- Messung:
  - GPU in der Stadt (Hoch): 2,3 ms, mit sehr vielen Partikeln 2,6 ms.
  - Ein Logikschritt unter Partikel-Volllast: 0,13 ms.
  - Speicher nach 8 Landgängen mit Treffern: unverändert.

## 2.9.12 – Materialien mit Tiefe, Metall mit Spiegelungen, natürlicher Dunst (08.11.2026)

- **Holz, Kisten und Pflaster mit echtem Relief:** Schiffsrumpf, Deck, Stege, Kisten, Fässer, Fischerboote und das Pflaster der Hafenstadt haben jetzt Relief-, Verdeckungs- und Rauheitskarten. Fugen und Maserung liegen sichtbar tiefer und fangen das Licht.
- **Metall spiegelt die Umgebung:** Klingen, Helme, Rüstungen, Gold, Kanonen und Münzen spiegeln Himmel, Sonne und Abendrot, unscharf je nach Rauheit. Dafür wird der Himmel regelmäßig als Umgebungskarte aufgenommen (ab Mittel). Auf Niedrig spiegeln Metalle einen einfachen Himmelsverlauf.
- **Natürlicher Dunst statt gleichmäßigem Nebel:** Der Nebel verdichtet sich mit der Entfernung, liegt über dem Meer dichter als in der Höhe und leuchtet in Richtung Sonne in deren Farbe, abends golden und mittags hell.
- **Himmel mit Atmosphäre:** heller Hof um die Sonne in der Lichtfarbe, Dunstband am Horizont, das nahtlos in den Nebel übergeht.
- **Behoben:** Ein neu gebautes Wassermaterial (beim Wechsel der Grafikstufe) konnte die Kaskaden-Schatten mehrfach als Licht zählen. Jetzt prüft das Spiel neue beleuchtete Materialien automatisch.
- **Speicher:** Schiffsflaggen werden nur noch einmal statt zweimal gemalt. Geteilte Texturen (Funken, Risse, Rauch, Partikel, Lichtrampen) sind gegen versehentliches Freigeben geschützt. Alte Umgebungskarten werden beim Erneuern freigegeben.

**Technik (für Entwickler):**
- Änderungen:
  - PBR im Toon-Material: neue Optionen `normalMap`, `aoMap`, `roughness`, `metalness`, `roughnessMap` und `metalnessMap` (ORM-Kanäle wie glTF).
  - Materialien mit `spec ≥ 0,8` werden automatisch Metall.
  - Prozedurale Relief- und ORM-Karten aus den gemalten Texturen (`toonPbr()`).
  - IBL: eine PMREM-Aufnahme des Himmels (`SkyProbe`) alle `ibl` Sekunden je Stufe, gelesen über `textureCubeUV`. Niedrig nutzt einen Ersatz-Himmelsverlauf.
  - Atmosphärischer Nebel: global ersetzte Fog-Chunks, exponentiell mit Höhenabnahme und Sonnenfarbe.
  - Himmel mit Mie-Hof und Horizont-Dunst.
- Neue Dateien: `src/render/pbrMaps.ts`, `src/render/ibl.ts`, `src/render/atmosphere.ts`.
- Geänderte Dateien: `render/toon.ts`, `render/renderer.ts`, `render/textures.ts`, `world/sky.ts`, `world/ocean.ts`, `world/environment.ts`, `world/town.ts`, `world/islandStyle.ts`, `world/life.ts`, `world/fauna.ts`, `world/particles.ts`, `world/smoke.ts`, `combat/fx.ts`, `entities/ship/shipBuilder.ts`, `entities/enemy.ts`, `core/game.ts`, `data/qualityTiers.ts`.
- Behobene Fehler:
  - Ein neu gebautes Wassermaterial erhielt keine CSM-Schalter. Jetzt gibt es `ensureCsm` beim Bau und eine Prüfung alle 0,5 s.
  - Die Schiffsflagge wurde doppelt gemalt.
  - Geteilte Effekt-Texturen und Lichtrampen waren nicht als geteilt markiert.
- Bekannt, für später:
  - `mergeStatic` im Schiffsbau entfernt UVs; die Holztextur fehlt auf zusammengefassten Teilen.
  - Animations-Warnung „handslotl/handslotr: no target node“.
- Messung (GPU, Stadt, Hoch): 2,5 ms, wie vorher. Maximal 3,6 ms (+0,3 ms). Eine Himmels-Aufnahme kostet 0,6 ms.

## 2.9.11 – Neues Licht: gestaffelte Schatten, Kontaktschatten, sauberes Leuchten (08.11.2026)

- **Gestaffelte Schatten (Kaskaden) ab Grafikstufe Hoch:**
  - Statt einer Schattenkarte um die Figur gibt es jetzt 2 (Hoch), 3 (Maximal) oder 4 (Ultra) Karten hintereinander.
  - In der Nähe sind die Schatten gestochen scharf, in der Ferne laufen sie weich aus.
  - Schatten reichen jetzt bis 180 m (Hoch), 320 m (Maximal) oder 520 m (Ultra), vorher waren es höchstens 120 m. Palmen, Häuser und Schiffe werfen auch auf entfernten Inseln Schatten.
  - Die Übergänge zwischen den Karten werden weich überblendet.
- **Kontaktschatten (Umgebungsverdeckung) ab Hoch, vorher nur Maximal und Ultra:**
  - Neues, genaueres Verfahren: Ecken, Hauskanten, Kisten am Boden und Füße bekommen dunkle Übergänge, und Figuren stehen sichtbar auf dem Boden.
  - Es wird in halber Auflösung berechnet und kantenscharf geglättet. Am Handy läuft eine sparsamere Variante.
- **Leuchten nur, wo Licht ist:** Der Leuchteffekt (Bloom) setzt erst ab echter Lichtstärke ein. Sonne, Laternen, Fenster und Magie strahlen, Sand, Segel und Wände nicht mehr.
- **Belichtung:** Das filmische Tonemapping (ACES) arbeitet mit etwas mehr Belichtung (1,1). Das Bild wird ein wenig heller, ohne dass helle Flächen ausbleichen. Gemessen am Mittag, Abend, in der Nacht, im Sturm und in der Stadt.
- **Dezentere Vignette:** Die Bildränder werden nur noch leicht abgedunkelt.
- **Leistung:** Auf Maximal ist das Bild sogar etwas schneller als vorher, weil drei kleinere Schattenkarten weniger kosten als eine große. Auf Hoch kostet alles zusammen etwa 0,3 ms pro Bild mehr. Niedrig und Mittel bleiben unverändert.

## 2.9.10 – Sauberer Speicher, flüssigere Bewegung (08.11.2026)

Der erste Schritt Richtung 3.0: Unter der Haube aufgeräumt, damit Sturmkrone auch nach Stunden flüssig bleibt.

- **Kein Speicherleck mehr bei langen Sitzungen.** Bisher blieb Grafikspeicher liegen:
  - Jedes versenkte oder davongesegelte Schiff ließ etwa 20 Modellteile und 5 Bilder zurück.
  - Jeder Landgang ließ die Figuren (Gegner, Dorfbewohner, Crew) mit Kleidung, Hut, Waffen und Skelett-Daten zurück.
  - Beim Ändern des Aussehens im Charakter-Editor blieben alte Hüte und Kleidung zurück.
  - Jetzt wird alles freigegeben, sobald es verschwindet. Gemessen über viele Seegefechte, Landgänge, Werftbesuche und Grafikwechsel bleibt der Speicher gleich.
- **Weniger Arbeit pro Bild.** Beim Segeln entstehen keine Wegwerf-Objekte mehr (vorher 9 pro Bild), im Kampf zu Fuß kaum noch welche (vorher 6). Bei Faji-Fähigkeiten sind es etwa 90 % weniger. Treffer- und Elementeffekte nutzen ihre 3D-Formen jetzt gemeinsam, statt sie bei jedem Treffer neu zu bauen. Das beugt kurzen Rucklern vor, vor allem am Handy.
- **Flüssige Bewegung auf schnellen Bildschirmen.** Die Spiellogik läuft wie bisher fest mit 60 Schritten pro Sekunde. Gegner, Crew und Stadtleute gleiten jetzt aber zwischen den Schritten weich, wie schon dein Schiff und deine Figur. Auf 90-, 120- und 144-Hz-Bildschirmen ruckeln sie nicht mehr.

## 2.9.9 – Samsung-Handys: kein schwarzes Wasser mehr (08.11.2026)

- **Fehler behoben: schwarzes Wasser auf Samsung-Handys** (im Browser und in der Android-App).
  - Das Wasser markiert sich im Bild unsichtbar, damit die Tusche-Konturen keine Striche über die Wellen ziehen.
  - Samsung-Browser und manche Android-Grafiktreiber werteten diese Markierung als „durchsichtig“ und zeigten den dunklen Seitenhintergrund durch das Wasser. Nur Schaum und Sonnenglitzer waren zu sehen.
  - Das fertige Bild ist jetzt immer vollständig undurchsichtig, auf jeder Grafikstufe.
- Die Android-App muss dafür nicht neu installiert werden: Sie lädt die neue Version beim nächsten Start von selbst.

## 2.9.8 – Sturmkrone als App zum Herunterladen (06.11.2026)

- **Echte App-Dateien für PC und Android:** Im Hauptmenü erkennt das Spiel dein Gerät und bietet die passende Datei an.
  - Am Windows-PC: „PC-App laden“ lädt `Sturmkrone-Setup.exe`. Doppelklicken, und Sturmkrone installiert sich in Sekunden mit Symbol auf dem Desktop.
  - Am Android-Handy: „Android-App laden“ lädt `Sturmkrone.apk` zum Installieren.
  - Alle Downloads stehen auch unter https://github.com/Darnell-11/sturmkrone/releases/latest.
- **1:1 dasselbe Spiel:** Die Apps laden das Spiel von der Webseite, mit derselben Chrome-Technik wie der Browser. Sie aktualisieren sich dadurch selbst und laufen nach dem ersten Start auch ohne Internet.
- **PC-App:** Sie nutzt immer die starke Grafikkarte, auch bei Laptops mit zwei Grafikchips. F11 schaltet Vollbild um.
- **Android-App:** Sie läuft im echten Vollbild, der Bildschirm bleibt beim Spielen an, und die Zurück-Taste öffnet die Pause oder geht im Menü zurück. Spielstände lassen sich als Datei speichern und laden. „Spiel teilen“ öffnet das Teilen-Menü von Android.
- In der App verschwinden die Knöpfe zum Installieren und Herunterladen.

## 2.9.7 – Optimiert fürs Handy (06.11.2026)

- **Fehler behoben: schwarzes Meer am Handy.** Viele Handy-Grafikchips rechnen einige Formeln anders als PC-Grafikkarten. Dabei entstanden ungültige Werte, und der Leuchteffekt verschmierte sie als große schwarze Flächen über das Wasser. Nur die Richtung zur Sonne sah richtig aus.
  - Alle betroffenen Formeln in Wasser, Himmel, Sand, Gras und Effekten sind jetzt handysicher.
  - Ein Sicherheitsnetz im Wasser fängt ungültige Werte ab, bevor sie das Bild verderben.
- **Aufgeräumte Anzeige am Handy:**
  - Die Statustafel ist kompakter. Uhrzeit, Wetter und die lange Schiffszeile entfallen am Handy, Lebens-, Faji- und Rumpfbalken bleiben.
  - Leere Fähigkeitsplätze („Leer“) werden nicht mehr als Knöpfe angezeigt.
  - „An Deck gehen“ ist klein und ruhig, statt groß und pulsierend über dem Schiff zu stehen.
  - Auftrag, Karte und Knöpfe oben sind kleiner. Der Bedienhinweis steht oben und verdeckt keinen Knopf mehr.
- **Als App installieren und teilen:** Im Hauptmenü gibt es zwei neue Knöpfe.
  - „Als App installieren“ legt Sturmkrone wie eine normale App auf den Startbildschirm (Android, PC mit Chrome/Edge): Vollbild, spielbar ohne Internet, aktualisiert sich selbst, und die Grafikstufe passt sich jedem Gerät an. Auf iPhone und iPad erklärt der Knopf die zwei Schritte in Safari.
  - „Spiel teilen“ öffnet das Teilen-Menü des Geräts, z. B. für WhatsApp, oder kopiert den Link zum Weiterschicken.
- Das Testwerkzeug „Welt-Werkstatt“ ist aus dem Pausenmenü verschwunden; es gibt es nur noch beim Entwickeln.

## 2.9.6 – Grafikkarte wird in jedem Browser erkannt (06.11.2026)

- **Grafikkarte in jedem Browser erkannt:** Manche Browser verbergen den Namen der Grafikkarte aus Datenschutzgründen, z. B. Firefox und Brave. Dann misst das Spiel beim Start kurz selbst, wie stark die Grafik ist, und wählt die passende Stufe bis Ultra. Das gilt auch für neue Grafikkarten, die das Spiel noch nicht kennt.
- **Hinweis, wenn die Grafikkarte gar nicht benutzt wird:** Ist im Browser die Hardwarebeschleunigung ausgeschaltet, erklärt das Startmenü Schritt für Schritt, wie man sie in Chrome, Edge oder Firefox einschaltet.
- In den Einstellungen steht unter „Erkanntes Gerät“, ob die Stufe aus dem Namen oder aus der Messung stammt.

## 2.9.5 – Große Prüfrunde: alles durchgespielt, Kräfte auf See, faire Kampfstile (06.11.2026)

- **Jede Fähigkeit wirkt jetzt auch auf See**, passend zu ihrer Art und in Schiffsgröße:
  - Faust: Bergbrecher schickt eine Druckwelle über das Wasser, die nahe Schiffe trifft und wegstößt. Hundert Fäuste hagelt glühende Druckschläge auf ein Schiff. Meteorfaust lässt einen Meteor einschlagen.
  - Körper: Stahlleib und Titanform legen einen Faji-Panzer um dein Schiff.
  - Schwert: Blitzziehen, Tausend Schnitte, Kreuzschnitt und Schattenschritt-Klinge fliegen als riesige Klingenwellen durch alle Schiffe in einer Linie. Wirbelklinge und Klingensturm werden zur Druckwelle.
  - Erde: Erdstoß und Erdstacheln lassen Felsen aus dem Meer brechen und halten das Schiff fest.
  - Schwerkraft: Schwerkraftsog und Schwarzes Loch ziehen Schiffe in einen Strudel.
  - Gift: Die Giftwolke legt die feindliche Crew lahm.
  - Feuer: Feuersäulen setzen alle nahen Schiffe in Brand.
  - Weitere: Phönixflügel feuert eine große Brandsalve, Eissplitter friert ein, Kampfschrei lässt die Feinde das Feuer einstellen.
  - **Meteore stürzen sichtbar vom Himmel**, mit Glut- und Rauchschweif, Krater, Feuer und Splittern. Blitze schlagen gezackt aus dem Himmel ein.
  - Der Skillbaum zeigt bei jeder Fähigkeit, was sie auf See macht.
- **Fähigkeiten mit mehr Wucht:**
  - Sichelwind, Mondsichel und Himmelsspalter fliegen als echte Sichel mit Nachbildern. Der Himmelsspalter ist riesig, steht senkrecht und reißt den Boden auf.
  - Blitzziehen hinterlässt eine leuchtende Schnittlinie, der Schnitt „kommt erst an“, wenn du vorbei bist.
  - Einschläge hinterlassen Krater statt dünner Risse.
  - Alle Effekte behalten ihre Elementfarbe, statt weiß auszubrennen.
- **Stufen wirken wie beschrieben:** Mehr Blitzsprünge, Säulen, Meteore, längere Dauer und stärkere Heilung je Stufe. Vorher standen die Werte nur im Text.
- **Kampfstile fair ausbalanciert:**
  - Der Faji-Wirker machte aus sicherer Entfernung etwa doppelt so viel Schaden pro Sekunde wie Nahkämpfer. Jetzt liegt er gleichauf und hat dafür den Vorteil des Abstands.
  - Faustkämpfer schlagen schneller und härter.
  - Doppelklingen sind der schnellste Klingenstil.
  - Der Zweihänder-Wirbel ist nicht mehr zu langsam.
- **Fehler behoben:**
  - Schiffe liegen nicht mehr mit dem Bug auf dem Strand: Bug, Mitte und Heck prüfen die Küste samt Strandböschung.
  - Der Prolog ließ sich nicht abgeben, wenn man den Hafen öffnete, bevor die Ankunft gezählt hatte.
  - Aufträge zum Befreien einer Insel blieben hängen, wenn die Insel kurz vorher schon befreit worden war.
  - Wechsel zwischen eigenen Schiffen in der Werft reparierte den Rumpf umsonst.
  - Ein neuer Kampfstil im Aussehen-Menü übernahm seine Boni erst nach einem Neustart.
  - Ein leerer Name im Charakter-Editor ergibt jetzt den Standardnamen.
  - Lange Inselnamen über der Insel wurden abgeschnitten.
  - Faji-Treffer auf See laufen in Spielzeit und stehen in der Pause still.
- **Schönere Orte:**
  - Der Glutberg ist ein zerklüfteter Vulkan mit sich schlängelnden Lavaströmen und einem Kratersee.
  - Die Festung Nordwacht hat Ringmauern mit Zinnen, drei Tore mit Rundtürmen und einen hohen Bergfried.
- **Bedienung:**
  - Läden und Werft nennen den nötigen Rang beim Namen statt mit einer Nummer.
  - Beim Entern schaut die Kamera steiler von oben, damit kein Mast mitten im Bild steht.
  - Auf schmalen Handys überdeckt der Aktionsknopf keine Fähigkeitsknöpfe mehr.

## 2.9.0 – Größere Inseln, echtes Meer, echte Schiffe und Kräfte mit Wucht (06.11.2026)

- **Fehler behoben: Kein Einsinken mehr am Inselrand.** Wer Richtung Schiff lief, versank am Strand im Boden. Jetzt ist die Laufhöhe genau das sichtbare Gelände, auf jeder Insel.
- **Inseln größer und alle verschieden:**
  - eigene Küstenformen: lang gestreckt, gelappt, sichelförmig oder fast rund
  - ein bis drei Hügel, die weich in die Wiese auslaufen
  - Grasflächen und Felsgruppen je nach Region
  - Größe nach Inselart: Städte und Boss-Inseln deutlich größer, kleine Riffe und Schatzinseln bleiben klein
  - Brandung und Flachwasser folgen der echten Küste.
- **Hochauflösende Oberflächen:**
  - Sand mit Korn, Rippeln, nassem Saum und Muschelsplittern
  - Gras mit Halmen, Büscheln, trockenen und satten Flecken und Erdstellen
  - Fels mit Schichten
  - In jeder Auflösung scharf, auch aus nächster Nähe ohne Pixel.
  - Holzbohlen auf den Stegen, Frachtkisten mit Brettern und Strebe
- **Das Meer wie echte See:**
  - lange Dünung und Kreuzsee
  - feine Windwellen, die mit echter Geschwindigkeit laufen und sich kreuzen
  - Licht scheint grün-türkis durch die Wellenkämme, Wellentäler sind dunkler
  - Lichtspiele am Grund im Flachwasser, blasiger Küstenschaum, schmale anrollende Brandungslinien
  - Schaumkronen als zerfasernde Gischt, im Sturm viel mehr als bei Flaute
  - keine weißen Flecken mehr auf dem Strand und keine schwarzen Linien auf fernen Wellen
- **Schiffe wie echte Segelschiffe:**
  - geschwungener Rumpf mit Spring und eingezogenen Bordwänden, Barghölzer und dunkles Unterwasserschiff
  - Achter- und Vorderkastell mit Goldkante, Stückpforten-Reihen, Mars- und Bramstengen
  - Das eigene Schiff ist größer. Spätere Klassen sind deutlich größer, bis zum 74 m langen Leviathan.
- **Faji-Kräfte mit eigener Effektsprache und Wucht:**
  - Feuer: Flammenzungen mit heißem Kern
  - Eis: aufschießende Eisdornen
  - Blitz: gezackte Einschläge vom Himmel
  - Erde: Felsen und Risse
  - Sturm: steigende Windringe
  - Schatten und Schwerkraft: Sog-Kern mit nach innen stürzendem Ring
  - Licht und Geist: Lichtsäulen
  - Gift: Wolken und Blasen
  - Flut: Wassersäule
  - Meteor und Körper: Kuppel, Krater und Rauch
  - Klinge: gekreuzte Hiebe
  - Starke Kräfte und Ultimates bringen Kamerawackeln, Trefferpause und Speedlines.
- **Skillbaum mit eigenen Symbolen:** Jede Fähigkeit hat ein eigenes Zeichen, je nach Element, Wirkung und Technik. Ein kleines Abzeichen zeigt die Form (Ring, Kegel, Sprung …). Lange Namen brechen sauber um.
- **Kleinigkeiten:**
  - Pflasterwege folgen den Hügeln ohne durchscheinendes Gras.
  - Strand und Wiese leuchten im Sturm nicht mehr am Rand.
  - Effekte räumen hinter sich vollständig auf.

## 2.8.0 – Lebendige Inseln, Ultra-Grafik und drei starke Kampfstile (06.11.2026)

- **Jede Insel ist anders und lebt:**
  - Eigene Form pro Insel: Der Hügel liegt versetzt, ist schmaler oder breiter, flacher oder höher.
  - Natur je Region: Laubbäume zwischen den Palmen, Büsche, Gras, Blumen, Farne, Felsnadeln und Felsbrocken, Klippen im Flachwasser, Treibholz, Muscheln und Seesterne
  - Lager mit Zelten, Lagerfeuer (Rauch und Funken), Palisaden, Waffenständern und Banner
  - Dörfer mit Strohhütten, Feuerstelle, trocknenden Netzen und Ruderbooten
  - Gestrandete Wracks auf Schatzinseln, Säulen und Torbögen in Ruinen, Wachtürme und Mauern auf Boss-Inseln
  - Tierleben: Krabben huschen über den Strand, Schildkröten kriechen ans Ufer, Papageien, Krähen oder leuchtende Falter kreisen um die Bäume, Fische springen vor der Küste, nachts tanzen Glühwürmchen.
- **Neue Grafikstufe Ultra** für sehr starke PCs:
  - bis 4K mit Supersampling, 8-fache Kantenglättung
  - Schatten in 8192er-Auflösung mit größerer Reichweite
  - Holz, Segel, Pflaster, Wolken und Rauch in vierfacher Auflösung, maximale Texturfilterung
  - weiteste Sicht, feinere Wellen, mehr Partikel
  - Starke Grafikkarten bekommen Ultra automatisch.
- **Handys:** „Niedrig“ hat jetzt denselben Farblook wie die höheren Stufen und weitere Sicht. Inseln im Nebel jenseits der Sichtweite werden gar nicht erst gezeichnet; das spart auf schwachen Geräten rund ein Viertel der Arbeit.
- **Gegner kommen natürlich statt im Sekundentakt:** Schiffe segeln am Horizont herein und folgen eigenen Routen. Sie greifen erst an, wenn sie dich sichten. Nach jedem Gefecht kehrt kurz Ruhe ein, dann kommt etwa jede halbe bis ganze Minute ein neues Schiff in Sicht. Manche Händler fahren mit Begleitschutz.
- **Jedes Gefecht lohnt sich mehr:** etwa doppelte Erfahrung und mehr Ruhm fürs Versenken und Entern, deutlich mehr Gold in der Beute, häufiger Faji-Splitter, Talismane von Jägern und Patrouillen
- **Musik epischer und weniger aufdringlich:**
  - Die Melodie pausiert regelmäßig, dann tragen Streicher, tiefe Hörner und Chor.
  - Kontrabass, Paukenwirbel am Phrasenende, breiteres Tempo
  - Kampfmusik wuchtig statt hektisch
- **Natürliche Laufanimationen:** Die Schrittfrequenz passt jetzt zur echten Geschwindigkeit; vorher rutschten Füße über den Boden. Das gilt für Bewohner, Spielfigur, Gegner und Crew. Bewohner laufen sanft an und bremsen ab, bleiben nicht mehr an Wänden hängen und machen öfter Pausen.
- **Alle drei Kampfstile können aufrüsten:**
  - Der Schmied verkauft passend zum Stil Klingen, Kampfhandschuhe (mit +Volltreffer) oder Faji-Foki (mit +Faji-Erholung).
  - Handschuhe und Fokus sind an der Figur sichtbar und leuchten ab Stufe 4.
- **Mehr Wucht im Kampf:**
  - Faustschläge schicken Druckwellen und Staub über den Boden, Tritte und Finisher kommen mit Speedlines.
  - Faji-Geschosse ziehen leuchtende Spuren und schlagen mit Druckwelle, farbiger Wolke und Funken ein.
  - Schwere Schwerthiebe schlagen Funken.

## 2.7.0 – Seeschlachten wie im Kino, edles Meer und echter Aufstieg (05.11.2026)

- **Das Meer sieht aus wie echte hohe See statt wie ein Planschbecken:**
  - Offenes Wasser ist tief saphirblau, Türkis gibt es nur noch an Küsten und Riffen.
  - Feines, wanderndes Kräuseln auf den Wellen, eine warme Sonnenbahn mit funkelnden Glitzerpunkten bis zum Horizont
  - Bei Wind ziehen Schaumstreifen in Windrichtung übers Wasser.
  - Der Himmel spiegelt sich sauberer, das Wasser wirkt dadurch tiefer und glänzender.
- **Seeschlachten mit Pulverdampf, Splittern und brennenden Wracks:**
  - Jede Kanone stößt eine dichte Pulverdampfwolke aus, die mit dem Wind abzieht. Nach einer Breitseite hängt der Qualm über dem Wasser.
  - Kanonenkugeln ziehen eine feine Rauchspur.
  - Treffer schlagen Holzsplitter aus dem Rumpf, die ins Wasser klatschen und treiben.
  - Fehlschüsse reißen hohe Wassersäulen mit Sprühnebel auf.
  - Angeschlagene Schiffe qualmen, je schlimmer der Schaden, desto dichter. Brennende Schiffe tragen eine schwarze Rauchsäule mit Glut, die man von Weitem sieht.
  - Rauch wird wie die Wolken beleuchtet: golden im Abendrot, bläulich bei Nacht, Blitze erhellen ihn.
- **Schiffe gehen dramatisch unter:** Bug oder Heck ragt in die Luft, das Wrack kippt zur Seite und sackt immer schneller weg. Planken, Balken und Fässer treiben danach noch eine Weile auf den Wellen.
- **Rückstoß:** Bei jeder Breitseite krängt das Schiff von der feuernden Seite weg und schaukelt zurück. Die Kamera rollt leicht mit dem Schiff, so spürt man Dünung und Kanonendonner.
- Auch Vulkane und Schornsteine rauchen jetzt mit echten Rauchschwaden.
- **Ruhigere Zielhilfe:** Der Zielring ist ein feiner Messingring statt eines grellroten Kreises. Der Feuerfächer zeigt nur noch einen hellen Saum an der Reichweite statt eines grauen Schleiers.
- **Echter Aufstieg von unten nach oben:**
  - Feindschiffe richten sich nach dem Meer, nicht mehr nach deiner Stufe. Bisher wuchsen die Gegner überall mit, man wurde nie spürbar stärker.
  - Bernsteinsee: Stufe 1 vor Ankerglück bis 4 am Rand. Äußere Meere: Stufe der Region, zum Weltrand hin bis zu 2 mehr.
  - Erfahrene Crews in hohen Meeren halten mehr aus.
  - Die Warnung „Gefährliche Gewässer“ nutzt dieselben Stufen.
- **Ernster, düsterer Anime-Look:** filmische Farbkorrektur (kühle Schatten, warme Lichter, ruhigere Farben, Vignette, auch auf „Mittel“), dunstigere Himmel, tiefere Schatten, dramatisches Abendrot, dunklere Nächte, gedämpftes Grün, mehr Wolken und häufiger raues Wetter
- **Gemalte Wolken** mit weichen Ballen und fließendem Licht statt Wattewolken
- **Ankerglück lebt:** gepflasterte Straßen und Marktplatz, deutlich mehr Häuser, Karren, Kisten, Zäune, Büsche, Wimpelleinen und Fahnen
- **Epische Musik, die der Situation folgt:** Streicher, Celli, Kriegstrommeln, Hörner, Chor und Fidel mit großem Hall. Spannung, Kampf und Boss bauen sich auf, Stücke blenden weich ineinander über. Kampfbeginn mit Trommelschlag, kein Flackern beim Kampfende. Der Shanty klingt jetzt in Moll.
  - Alle Stücke sind auf passende Lautstärken eingemessen (ruhige See leiser, Kampf und Boss kräftiger), nichts übersteuert. Auch der Hall blendet beim Wechsel mit aus.
- **Anzeigen im düsteren Look:** dunkle Tafeln mit Messingkante, Namen in Antiqua, die Minikarte als dunkle Seekarte, kantige Messingknöpfe, ruhigere Banner und Cut-ins, unabhängig vom Hell/Dunkel-Modus des Geräts
- **Tiefenschärfe** nur noch für den fernen Hintergrund: Figur, Vordergrund und Schiffe bleiben scharf.
- **Behoben:**
  - Figuren schwebten an Inselhängen bis zu einen halben Meter über dem Gras (die sichtbare Kuppe war anders geformt als die Lauffläche).
  - Beim normalen Schwerthieb wurde der ganze Bildschirm schwarz (Rechenfehler im Schwertbogen, den das Leuchten übers Bild verteilte).
  - Eine geenterte Legende zählte zugleich als Sieg und als gewonnene Revanche (doppelte Belohnung, die Revanche war danach verbraucht).
  - Nach dem Entern erschien zusätzlich „Schiff versenkt!“, und es zählte als versenkt. Jetzt gibt es eine eigene, etwas höhere Belohnung fürs Entern.
  - Nach dem Untergang des eigenen Schiffs blieben Lebensbalken, Beutekisten und Faji-Wellen stehen.

## 2.6.0 – Anime-Piraten, Faji auf See und alles aus der Demo (05.11.2026)

- **Figuren sehen aus wie Anime-Piraten statt wie eine Schulklasse:**
  - Hohe Lederstiefel, Hosen (statt Faltenrock und Kniestrümpfen) und Mäntel: kurz, lang mit geteilten Schößen oder als Kapitänsmantel. Die Kleidung entsteht aus dem Körper selbst und bewegt sich deshalb genau mit, auch beim Rennen, Rollen und Treten.
  - Schärpe bzw. Koppel liegt jetzt eng um die Taille statt als steifes Brett.
  - Gedeckte Seefahrer-Farben für Crew, Bewohner und Gegner. Piraten tragen öfter Mantel und Kopftuch, die Marine dunkelblaue Röcke.
  - Im Charakter-Editor wählbar: Mantel und Farbe, hohe Stiefel oder Schuhe, Schärpe oder Koppel. Bestehende Figuren bekommen einmalig einen langen Mantel und Stiefel (änderbar im Editor).
- **Hüte sitzen auf dem Haar:** Jeder Hut wird an die Frisur angepasst, nichts sticht mehr durch.
  - Neuer Dreispitz mit durchgehender, hochgeschlagener Krempe und Goldborte
  - Kopftuch mit umgeschlagenem Saum
  - Die Augenklappe sitzt sichtbar auf dem Auge (vorher steckte sie im Kopf).
- **Faji im Seekampf (wie in der Demo):**
  - Die Fähigkeitenleiste ist auch auf See zu sehen. Fähigkeiten ohne Seewirkung sind abgeblendet.
  - Leuchtende Wellen fliegen vom Schiff zum Ziel. Schwerthiebe treffen auf See das nächste Feindschiff, man muss nicht mehr mit dem Bug zielen.
  - Klare Meldungen bei zu wenig Faji oder bei Fähigkeiten, die nur an Land wirken. Ein leerer Platz öffnet den Faji-Baum.
  - Kurze, zweizeilige Namen auf den Knöpfen
- **Breitseiten:** Die Knöpfe „Links“ und „Rechts“ glühen, sobald ein Gegner im Fächer liegt.
- **Neu aus der Demo:**
  - Übungsschiff in der Einführung: Bei „Versenke …“ und „Entere ein Schiff“ taucht ein angeschlagenes Ziel vor dem Bug auf.
  - Lichtsäule mit Ring am Ziel der aktuellen Aufgabe
  - Faji-Kristall in befreiten Ruinen: +2 Fähigkeitspunkte und eine neue Fähigkeit, die gleich auf einen freien Platz kommt
  - Kleine Dörfer auf den ruhigen Inseln: Bewohner schlendern umher und schenken Gold und Proviant (alle 10 Minuten je Insel).
  - In ruhigen Momenten heilen Schiff und Figur langsam.
  - Warnung beim Einfahren in gefährliche Gewässer
- Der Steuerungshinweis liegt im Hochformat (auch am PC) nicht mehr unter der Statustafel.

## 2.5.0 – Kampfgefühl, Waffenhaltung und geschlossene Schiffe (04.11.2026)

- **Waffen richtig in der Hand:**
  - Die Klinge ragte bisher wie eine Verlängerung des Unterarms aus den Fingern. Jetzt liegt der Griff quer in der Faust.
  - Beim Zustechen zeigt die Klinge geradeaus, in der Grundhaltung nach oben und vorn.
  - Die Finger schließen sich um den Griff, freie Hände hängen locker.
- **Kampfanimationen überarbeitet:**
  - Die Arme bleiben näher am Körper statt ständig abgespreizt (die Vorlagen stammen von breiten Figuren).
  - Die Drehung der Faust aus den Animationen geht nicht mehr verloren.
  - Angriffe springen nicht mehr bis 1,5 m vor und schnappen dann zurück. Der Sprunghieb ist ein kontrollierter Satz statt eines Riesensprungs.
- **Kampf fühlt sich direkter an:**
  - Zielhilfe: Ohne Zielerfassung dreht sich der Hieb zum nächsten Gegner in Laufrichtung (bis 5,5 m).
  - Ausfallschritt bis zum Gegner, dann bleibst du davor stehen statt hindurchzulaufen.
  - Nach dem Treffer bricht Laufen den Ausschwung ab, du bist nie lange festgenagelt.
  - Takt wie im Anime: schnell ausholen, den Hieb sichtbar durchziehen, zügig zurück.
- **Effekte:**
  - Funken verglühen und schrumpfen, Staub und Gischt quellen auf und werden durchsichtig. Bisher blieben sie als große weiße Scheiben stehen.
  - Schwerthiebe ziehen eine Sichel mit heller, scharfer Außenkante statt eines flachen Bretts.
- **Schiffe von hinten geschlossen:** Am Heckspiegel fehlte ein Dreieck. Die Bordwand ist jetzt auch von innen (vom Deck aus) sichtbar.
- **Stege:** Schiffe fahren nicht mehr durch Hafenstege, sondern legen daran an.
- **Gesichter ohne Schatten:** Kein dunkler Haarschatten mehr über den Augen.
- **Handy im Hochformat:** Der Steuerungshinweis liegt nicht mehr unter der Statustafel, sondern gut lesbar über den Knöpfen.
- Das Kopftuch sitzt wieder enger am Kopf.

## 2.4.0 – Entern, eigenes Deck und runde Schiffe (04.11.2026)

- **Schiffe vollständig sichtbar:** Die Rümpfe waren seit 2.0 von außen teilweise durchsichtig (eigene und feindliche Schiffe). Behoben.
  - Rumpf, Deck und Achterdeck mit Holzplanken-Textur, Segel mit Stoffstruktur und Wappen
- **Entern funktioniert wieder zuverlässig:**
  - Schwer beschädigte Schiffe (Rumpf unter 35 % oder kaum noch Crew) werden langsamer, und es erscheint die Meldung, dass sie geentert werden können.
  - Über ihrer Lebensleiste steht dann **ENTERN**.
  - Der Knopf **„Entern!“** erscheint, sobald du in der Nähe bist, egal wie schnell du fährst.
- **Auf dem eigenen Schiff herumlaufen:** Mit **„An Deck gehen“** verlässt du das Steuer.
  - mit der Crew an Deck reden
  - an der Reling angeln
  - mit **„Ans Steuer“** zurück
- **Segeln fühlt sich runder an:**
  - Das Tempo hängt wie in der Demo nur vom Gashebel ab. Es schwankt nicht mehr in jeder Kurve mit dem Wind.
  - Die Segel wachsen stufenlos mit dem Tempo.
  - Das Ruder spricht schneller an, das Schiff schaukelt ruhiger auf den Wellen.
- **Figuren ohne Kapuzenpulli:** Die Anime-Figuren tragen jetzt Hemd und Weste (Grundfiguren aus VRoid Studio, CC0), dazu die Anime-Frisuren.
  - Krawatte und Katzenohren entfernt
- **Hüte:**
  - neuer Dreispitz mit Kuppel, hochgeschlagener Krempe und Goldborte
  - Das Kopftuch liegt sichtbar über dem Haar.
  - Hüte werfen keinen harten Schatten mehr aufs Gesicht.

## 2.3.0 – Echte Anime-Figuren (02.11.2026)

- **Alle Figuren sind jetzt echte Anime-Figuren:** Spielfigur, Crew, Gegner, Legenden und Bewohner.
  - Grundlage sind fein modellierte Figuren aus VRoid Studio (CC0, VRoid Project) mit Anime-Gesichtern statt Bausteinen.
  - Kurzhaar- und Langhaar-Figur
  - frei einfärbbar: Haare (auch Blond und Weiß), Haut, Augen, Oberteil, Hose oder Rock, Schuhe
- **Mimik:** Figuren blinzeln, strahlen beim Jubeln und bewegen beim Reden den Mund.
- **Alle 132 Animationen** werden auf die neuen Figuren übertragen, inklusive Ausrichtungsausgleich (A- und T-Pose), damit Arme und Beine natürlich aussehen. Waffen liegen richtig in der Hand.
- **Piraten-Ausstattung:**
  - Dreispitz, Zweispitz, Kopftuch, Marinemütze, Wollmütze, Südwester, Kochmütze, Helm, Fliegerbrille
  - Augenklappe und Ohrring
  - Schärpe (Piraten) oder Koppel (Marine), goldene Schulterstücke für Kapitäne
- **Charakter-Editor** zeigt bei den Anime-Figuren nur Optionen, die wirklich wirken.
- **Entern:**
  - Du landest mittschiffs mit Blick übers freie Deck statt hinter dem Steuerrad.
  - Die Segel des geenterten Schiffs werden durchsichtig (wie in der Demo).
- **Leistung:** Figuren außerhalb des Bildes oder weit weg werden nicht gezeichnet, je nach Grafikstufe. Die Zeichenaufrufe auf „Niedrig“ sinken dadurch von über 900 auf rund 230.
- **Behoben:**
  - Auf „Niedrig“ blieben alte Bilder stehen (Geisterbilder, z. B. im Editor).
  - Inselhügel waren höher als die Lauffläche, Figuren versanken im Gras.
- Kielwasser als feine Schaumspitze statt runder Flecken; Fischerboote mit Holz- und Segeltextur

## 2.2.0 – Anime-Proportionen und Demo-Funktionen (02.11.2026)

- **Figuren in Anime-Proportionen statt Chibi:** Das gilt für alle Figuren: Spielfigur, Crew, Gegner, Bewohner und Legenden.
  - kleinerer Kopf
  - deutlich längere Beine und Arme, etwas längerer Oberkörper
  - Die Knochen selbst sind verlängert, deshalb verzerrt beim Laufen und Kämpfen nichts.
- **Inselschilder wie in der Demo:** Über entdeckten Inseln schweben Name, Art und Stufe, z. B. „Krähenfels – Lager · Stufe 1“.
- **Entdecken wie in der Demo:** Wer nahe genug segelt, sieht „Insel entdeckt“. Karte und Minikarte zeigen nur entdeckte Inseln.
- **Lebensbalken über beschädigten Feindschiffen** wie in der Demo
- Mündungsfeuer an jeder Kanone

## 2.1.0 – Seekampf wie in der Demo, Grafik überarbeitet (02.11.2026)

**Seekampf 1:1 aus der Demo übernommen**
- Feindschiffe sind wieder langsamer als du (14,5 statt bis zu 24). Sie umkreisen dich auf Breitseitenabstand und feuern nur, wenn eine Seite zu dir zeigt.
- **Breitseite antippen = feuern.** Gezielt wird automatisch, mit Vorhalt auf fahrende Schiffe; halten feuert nach jedem Nachladen.
- **Zielfächer links und rechts** werden rot, sobald ein Gegner drin ist, dazu ein Zielring um das Schiff.
- Reichweite und Nachladezeit wie in der Demo (72 m, 1,9 s)
- Feindschiffe tauchen näher auf, Kämpfe finden schneller statt.

**Segeln und Kamera**
- Etwas schneller, vor allem bei Gegenwind
- Kamera deutlich weiter weg (Abstand und Höhe wie in der Demo, im Hochformat noch weiter)

**Grafikfehler behoben**
- Die **riesigen Schattenstreifen** über dem Meer sind weg:
  - Das Wasser empfängt keine Schatten mehr.
  - Sonnenstrahlen blenden bei tiefer Sonne aus.
  - Gischt und Effekte erzeugen keine dunklen Höfe mehr.
- Keine harten Hell-Dunkel-Keile mehr auf dem Wasser, Wellenlicht wird pro Bildpunkt berechnet.
- Das **Heck war offen** (man sah ins Schiff hinein) – jetzt geschlossen.
- Kielwasser als weiche Schaumspur statt Ringen

**Grafik-Upgrade**
- Schiffe mit Holzplanken an Rumpf, Deck und Kastell
- Segel mit Tuchbahnen, Reffreihe, Liektau, Flicken und Wappen; deutlich voller gebläht
- **Anime-Licht:** Schattenseiten kühl blau, im Abendrot violett, statt nur grau; saubere, weiche Lichtkanten
- Wasser mit Licht durch die Wellenkämme, Funkeln im Sonnenglanz und Tiefe zum Horizont
- Inseln mit unregelmäßigen Küsten und hügeligen Kuppen statt Zylinder und Halbkugel

## 2.0.0 – Das große 2.0-Update (01.11.2026)

**Neu seit der Vorabversion**
- **Talismane** in vier Seltenheiten (Gewöhnlich, Selten, Episch, Legendär) als Beute von Legenden, Bossen, Ruinen, Geisterschiffen und Schätzen. Einer ist angelegt und gibt Angriff, Leben, Krit, Gold, Faji oder Kanonenkraft.
- **32 Erfolge** mit Fortschrittsbalken und Belohnung
- **Farbenblind-freundlicher Modus** (Einstellungen → Anzeige): Orange und Blau statt Rot und Grün, eindeutige Formen auf der Karte
- Der Tiefenschlund schiebt dein Schiff zur Seite, statt hindurchzugleiten.
- Banner liegen nicht mehr über offenen Menüs.

**Spielgefühl wie in 1.0 – und besser**
- **Segeln:** so schnell und direkt wie in 1.0 (doppelt so schnell wie vorher). Gas stufenlos per W/S oder Stick, schnellere Wenden.
- **Kampfkamera auf See:** Sie nimmt das nächste Feindschiff automatisch mit ins Bild.
- **Beute treibt zum Schiff.**

**Musik und Klang (neu)**
- Eigene Seemannsmusik in Schichten: ruhig, Spannung, Kampf. Die Musik blendet je nach Lage über.
- Eigene Stücke für Hafen, Nacht, Kampf, Boss, Sieg und jede Region.
- Umgebung: Wellen, Wind, Regen, Donner, Möwen, Stadtlärm und das Grollen am Weltrand
- Soundeffekte für jede Aktion: Hiebe, Treffer, Paraden, Kanonen, Breitseiten, Splitter, Sinken, Münzen, Faji je Element, Stufenaufstieg, Aufträge
- Lautstärken im Menü „Ton“ wirken jetzt.

**Crew (aus 1.0, stark ausgebaut)**
- 16 Crewmitglieder zum Anheuern in der Taverne – mit Bonus, Kampfrolle und Fähigkeit
- Sie stehen sichtbar an Deck und reden miteinander, Brömmel die Schiffskatze inklusive.
- **Landtrupp:** Bis zu drei kämpfen an Land und beim Entern an deiner Seite.
  - Beschützer ziehen Gegner auf sich, Heiler heilen dich, Angreifer räumen auf.
  - Ausgeknockte Crew steht wieder auf.
- **Treue:** Sie wächst mit jedem gemeinsamen Sieg. Volle Treue gibt +30 % Kampfkraft.
- Jedes Crewmitglied hat einen **persönlichen Auftrag**.

**Rangliste der Legenden (aus 1.0, ausgebaut)**
- 20 Legenden mit Persönlichkeit, eigenem Schiff, Heimatgewässer und Sprüchen
- Auftritte mit Cut-in und Rangliste mit deinem Platz
- Revanchen besiegter Legenden

**Welt: sechs handgemachte Meere**
- Neu zur Bernsteinsee: Nebelarchipel, Nordwacht, Glutring, Sturmgürtel und Schlundriff am Weltrand
  - je mit eigener Inselgestalt (tote Bäume, Kiefern, Vulkane mit Lava, Sturmklippen, Kristalle), eigenem Wetter und eigener Musik
  - je mit Hafen-Außenposten, Lagern, Ruinen mit Schätzen und einem Regionsboss
- Geisterschiffe nachts im Nebelarchipel
- **Hafenmenü wie in 1.0:** Leg an einer Hafenstadt an, und alle Läden und Bewohner sind mit einem Knopf erreichbar. Durch die Stadt laufen kannst du weiterhin.

**Hauptgeschichte bis zum Ende**
- Prolog und sieben Kapitel um die fünf Siegel und die Sturmkrone, für Pirat und Marine. Jedes Kapitel startet von selbst mit einer Erzähltafel.
- Faji-Erwachen als Story-Moment
- Endkampf gegen den **Tiefenschlund**, eine riesige Seeschlange, dann gegen den Hüter der Tiefe
- Abspann und offene Welt danach

**Mehr zu tun**
- **Schiffsausbauten:** Kanonen, Rumpf und Segel in je 5 Stufen
- **Angeln** vom Schiff aus (mit Fangfenster) und **Würfeln** mit Baldo in der Taverne
- Gekaufte Klingen sind jetzt an der Figur sichtbar (Farbe, Leuchten).
- Banner warten aufeinander, statt sich zu überdecken.

## 2.0.0-m6 – Meilenstein 6 „Welt 2.0: Bernsteinsee“ (01.11.2026)

- **Handgemachte Bernsteinsee** statt Zufallsinseln: 9 benannte Inseln mit eigener Rolle – die Hafenstadt Ankerglück, Muschelruh, Krähenfels, Möwennest, das Leuchtfeuer, Rabenriff, Bernsteinbucht, Sonnenstrand und Sturmzahn mit einer Legende. Wer zum ersten Mal eine Insel erreicht, sieht ein Banner mit ihrem Namen.
- **Ankerglück:** Hafen mit Steg, Taverne „Zum Rostigen Anker“, Schmiede, Markt, Werft und Faji-Schrein. Nachts leuchten Fenster und Laternen, aus Schornsteinen steigt Rauch.
- **7 Bewohnerinnen und Bewohner mit Namen**, eigenen Sprüchen und Aufgaben (Ilse, Baldo, Grete, Mara, Meister Ilyas, Jasper, Ole). Dazu Stadtvolk, das umherschlendert, sitzt, arbeitet und dir zuwinkt.
- **Gespräche:** Taste R bzw. goldener Knopf „Sprechen“.
- **Aufträge:** 2 Kapitel der Hauptgeschichte („Salz im Blut“, „Die Legende von Sturmzahn“) und 5 Nebenaufträge. Die Ziele reichen von Orten erreichen und Lager räumen über Schiffe versenken, Entern und Schätze ausgraben bis zu Schiffbrüchige retten. Für jeden Auftrag gibt es Gold, Erfahrung, Ruhm und manchmal Faji-Punkte.
- **Auftragsanzeige** oben rechts mit Richtungspfeil und Entfernung
- **Minikarte** (antippen öffnet die große Karte)
- **Seekarte und Logbuch** (Taste M): Bernsteinsee und ganze Welt, laufende und erledigte Aufträge mit allen Schritten, deine Taten
- **Läden:**
  - Schmiede: 6 Klingen und 5 Rüstungen; das alte Stück wird in Zahlung genommen.
  - Markt: Proviant
  - Faji-Schrein: Faji-Punkte gegen Gold
  - Werft (jetzt bei Jasper in der Stadt)
  - Taverne: übernachten, um voll zu heilen und bis zum Morgen zu schlafen
- **Proviant** (Taste H bzw. grüner Knopf an Land) heilt 40 % deiner Lebenspunkte.
- **Leben auf See:**
  - Möwenschwärme, springende Delfine und ein Wal
  - Fischerboote, die zwischen den Inseln kreuzen
  - Schiffbrüchige auf Flößen zum Retten
  - Flaschenpost mit Schatzkarten. Das X liegt auf einer Insel, dort kannst du graben.
- **Pausemenü:** „Karte & Logbuch“ ersetzt den Knopf für die Werft.
## 2.0.0-m5 – Meilenstein 5 „Schiffe 2.0“ (01.11.2026)

- **Behoben:** Gegner flogen im Kampf manchmal in dich hinein und zitterten. Sie schoben sich beim Ausweichen versehentlich selbst weg. Jetzt halten sie sauberen Abstand (gemessen über 3000 Bewegungsschritte ohne Sprung).
- **7 Schiffsklassen aus 1.0** (Schaluppe, Brigg, Korvette, Fregatte, Galeone, Linienschiff, Leviathan) als detaillierte Modelle:
  - geschwungener Rumpf mit Zierstreifen und Kupferboden, Plankendeck mit Reling
  - Achterkastell mit nachts leuchtenden Fenstern, Vorderkastell
  - Masten mit Mastkorb, Rahen und geblähten Rahsegeln, Klüver, Bugspriet und Takelage
  - Kanonen an den Stückpforten, Laternen, Steuerrad, wehende Flagge und Galionsfigur
- **Segeln mit Wind:** Fahrstufen (Anker, halbe und volle Fahrt) mit Vor/Zurück. Rückenwind ist schnell, Gegenwind langsam, Windpfeil im HUD. Große Schiffe wenden träger und neigen sich in Kurven.
- **Breitseiten mit Zielhilfe:** Feuertaste halten zeigt die Flugbahn als Punktlinie, die Reichweite wächst. Loslassen feuert. Dazu die Bugkanone nach vorn.
- **4 Munitionsarten** (Taste K bzw. Knopf „Munition“): Kugeln (Rumpf), Kettenkugeln (Segel, Gegner werden langsam), Kartätschen (Crew, erleichtert das Entern), Brandkugeln (Feuer)
- **Schadenszonen Rumpf, Segel und Crew** mit sichtbaren Löchern, verfärbten Segeln, Feuer an Deck und Sinken mit Wasserfontäne
- **Feindschiffe mit KI:**
  - Patrouillen, Kopfgeldjäger, die dich jagen, und flüchtende Handelsschiffe
  - seltene Legenden-Schiffe mit Cut-in
  - Sie manövrieren in Breitseitenposition, halten vor und fliehen, wenn sie schwer angeschlagen sind.
- **Beute:** Treibgutkisten mit Gold, seltene Faji-Splitter (+1 Faji-Punkt)
- **Nahtloses Entern:** Ist ein Gegner angeschlagen, erscheint der Knopf „Entern!“. Du springst aufs feindliche Deck und kämpfst gegen die Crew (bei Legenden gegen den Kapitän selbst). Danach heißt es „Schiff erobert!“ und es gibt Beute.
- **Faji auf See:** Feuersalve, Schiffe einfrieren, Blitzeinschlag, Rückenwind, Flutwelle, Reparatur, Feuerpause erzwingen, schneller Nachladen, Himmelsspalter durch Schiffe, Meteore auf Flotten, Königsdruck lässt alle erstarren
- **Werft** (Pausemenü):
  - Schiffsklassen kaufen und wechseln (Gold und Rang), Reparieren
  - Rumpf-, Streifen- und Segelfarbe, 6 Flaggen in 6 Farben, 5 Galionsfiguren, Laternen
- **Begleitschiffe** ab Rang 6 (zwei ab Rang 9). Sie fahren in Formation und greifen Feinde an.
- **Spielstand Version 5** mit eigenem Schiff. Die Schiffsstufe aus 1.0 wird übernommen.

## 2.0.0-m4 – Meilenstein 4 „Faji 2.0“ (01.11.2026)

- **Grafischer Faji-Baum** (Stern-Knopf oben rechts):
  - 4 Zweige (Körper-Faji, Schwertkunst, Effekt-Faji, Geistiges Faji)
  - Knoten mit Symbol und Stufenpunkten, leuchtende Verbindungen
  - Details, Lernen und Platzwahl direkt im Baum
- **Live-Vorschau:** Deine eigene Figur führt jede Fähigkeit im Studio an drei Übungspuppen vor.
- **61 Fähigkeiten:** alle 37 aus 1.0 plus 24 neue, darunter Erdstoß, Meteorfaust, Blitzziehen, Kreuzschnitt, Mondsichel, Schattenschritt-Klinge, Klingensturm, Feuersäulen, Eissplitter, Donnerkeil, Schwarzes Loch, Phönixflügel, Kampfschrei, Aurastoß und Unbeugsam. Dazu kommen 4 Meisterfähigkeiten nach dem Erwachen.
- **14 Wirkungsformen** in der Effektsprache jedes Elements:
  - Welle, Fächer, Klingenwelle, Geschosse, Kettenblitz, Sprint, Schattensprung
  - Einschlagregen mit Warnkreisen, Sog, Wolke, Stacheln, Schlaghagel, Stärkung, Heilung
- **Statuseffekte:** Brand und Gift (Schaden über Zeit), Frost (Gegner erstarrt in Eis), Betäubung, Furcht (Gegner fliehen), Verlangsamung, Hochschleudern
- **8 Synergien zwischen Zweigen,** z. B. Klinge + Flamme = brennende Hiebe, Körper + Erde = Felsenhaut, Riposte + Frost = Frostparade
- **Faji-Erwachen:** ab Stufe 15 mit 9 Punkten in einem Zweig. Eine Zwischensequenz mit kreisender Kamera, Aura und Cut-in gibt +2 Punkte und schaltet die Meisterfähigkeit frei.
- **Faji-Energie** als Leiste im HUD, 3 Fähigkeitsplätze (Tasten 1–3, LT/RT/RB, Touch-Buttons mit Namen und Abklingzeit), Ultimates mit Cut-in-Banner
- **Passive Boni wirken alle:** Schaden, Schutz, Tempo, Krit, Ausweichen, Lebensraub, Zweiter Atem, längere Paraden, mehr Faji
- **1 Faji-Punkt pro Stufenaufstieg.** Fähigkeiten aus 1.0-Spielständen werden übernommen (Spielstand Version 4).
- Welt-Werkstatt: Testknöpfe für Punkte, Stufen und das Erwachen
- 22 automatische Tests (neu: Faji-Baum)

## 2.0.0-m3 – Meilenstein 3 „Kampf 2.0“ (01.11.2026)

- **Echtes Kampfsystem zu Fuß:** Jeder Schlag hat eigene Trefferzeit, Reichweite und Winkel. Kombos mit Zeitfenster, Schritt nach vorn bei jedem Hieb.
- **Kampfstile:**
  - Faustkämpfer mit Luftkombos (Tritt schleudert Gegner hoch)
  - Säbel, Langklinge, Zweihänder und Doppelklingen mit je eigener Kombo
  - Faji-Wirker mit zielsuchenden Geschossen
- **Schwer gedrückt halten = Aufladeangriff** mit Cut-in-Banner, kurz drücken = schwerer Angriff
- **Ausweichrolle** mit Unverwundbarkeit, **Blocken** und **perfekte Parade** (im richtigen Moment blocken: Gegner taumelt, Zeitlupe)
- **Zielerfassung** (T / Tab / R3 / Knopf „Ziel“): Die Kamera hält das Ziel im Blick, Angriffe richten sich darauf aus.
- **Haltesystem:** Schwere Gegner taumeln erst nach genug Druck („Haltung gebrochen!“).
- **7 Gegnertypen** mit Warnzeichen vor jedem Angriff:
  - Matrose
  - Schildträger, der Angriffe von vorn abwehrt
  - Musketier mit Ziellaser
  - Schläger mit Flächenschlag
  - Faji-Wirker mit Geschossen und Warnkreisen
  - Hauptmann
  - Legende als Boss mit drei Phasen und Boss-Leiste
- **Gegnerlager auf den Inseln.** Die Stärke steigt mit der Entfernung zur Mitte. Höchstens zwei Gegner greifen gleichzeitig an, die anderen umkreisen dich.
- **Effekte:**
  - Trefferpausen und Kamerawackeln
  - Trefferfunken im Anime-Stil und Schmier-Bögen bei Schwerthieben
  - Speedlines, Impact-Frames, Schockwellen und Bodenrisse
  - Rote Vignette bei Treffern auf dich
  - Schadenszahlen mit Krits und Kombo-Zähler
- **Fortschritt:** Erfahrung, Stufenaufstieg mit Banner, Ruhm und Ränge, Gold-Münzen zum Einsammeln
- **K.O.:** Die Crew rettet dich an Bord, dabei gehen 10 % Gold verloren.
- **Übungspuppen** auf der Startinsel

## 2.0.0-m2 – Meilenstein 2 „Charaktere“ (01.11.2026)

- **Echte animierte Figuren:** eigene Anime-Figuren auf dem KayKit-Skelett mit 132 Animationen (CC0), darunter Gehen, Rennen, Rolle, Kombos je Kampfstil, Treffer, Jubeln, Winken, Sitzen, Steuern, Arbeiten und Angeln
- **Charakter-Editor 2.0** (beim neuen Spiel und im Pausemenü unter „Aussehen ändern“):
  - Auswahl: Fraktion, Kampfstil, Klingenform, Körperbau, Größe, Hautton
  - Gesicht: Form, Augen, Augenfarbe, Brauen, Mund
  - 11 Frisuren mit 12 Haarfarben, Bärte
  - 6 Oberteile, Mantel, Schuhe und alle Farben
  - 10 Kopfbedeckungen, dazu Augenklappe, Narbe, Ohrring, Halstuch und Handschuhe
  - 3D-Vorschau zum Drehen und Zoomen, mit Probe-Animationen (Angriff, Schwer, Rolle, Jubeln, Winken) und Zufallsknopf
- **Sichtbare Waffen:** Säbel, Langklinge, Zweihänder, Doppelklingen oder eine leuchtende Faji-Kugel
- **Zu Fuß unterwegs:** Mit dem goldenen Aktionsknopf (oder R) gehst du an Land. Du läufst, rennst und rollst, schlägst Kombos und schwere Angriffe und gehst wieder an Bord. Die Kamera folgt beim Rennen.
- **Am Ruder:** Deine Figur steht beim Segeln sichtbar am Steuer.
- **NPC-Baukasten:** zufällige, zur Rolle passende Bewohner (Fischer, Händler, Koch, Schmied, Wirt, Piraten, Marine …). Auf der neuen Startinsel schlendern, sitzen, arbeiten und winken sie.
- **Spielstände Version 3** mit dem neuen Aussehen. Looks aus 1.0 werden übernommen.
- Schiffe laufen nicht mehr durch Inseln, weniger grelle Gischt

## 2.0.0-m1 – Meilenstein 1 „Grafik-Kern“ (01.11.2026)

Sturmkrone sieht jetzt nach Anime aus. Schiff, Inseln und Figuren bleiben Platzhalter bis zu den Meilensteinen 2, 5 und 6.

- **Toon-Material:** 3-stufige Licht-Rampe, Randlicht passend zur Tageszeit, weiche Glanzflecken auf Metall
- **Tusche-Konturen:** Auf Niedrig/Mittel umranden einfache Konturen jedes Modell, auf Hoch/Maximal übernimmt das eine Kantenerkennung über das ganze Bild. Wasser bekommt bewusst keine Linien.
- **Neuer Ozean:** fünf Schichten Gerstner-Wellen, Gischt auf den Wellenkämmen, türkises Flachwasser und Brandungsringe um jede Insel, Kielwasser hinter dem Schiff, Spiegelung des Himmels und stilisierter Sonnenglanz. Das Schiff schaukelt passend auf genau diesen Wellen.
- **Himmel:** Farbverlauf je Tageszeit, Sonne mit Leuchten, Mond, funkelnde Sterne, gemalte Wolken in drei Höhen, die mit dem Wind ziehen
- **Tageszeit:** Morgen, Tag, Abendrot, Dämmerung und Nacht gehen fließend ineinander über (ein Tag dauert 24 Minuten). Uhrzeit und Tageszeit stehen im HUD.
- **Wetter:** Klar, Bewölkt, Nebel, Regen und Sturm mit weichen Übergängen und automatischem Wechsel. Im Sturm gibt es hohe Wellen, Regen, Blitze, die Wolken und Himmel aufleuchten lassen, und ein deutlich dunkleres Licht.
- **Weltrand:** Das Meer strömt nach außen und stürzt als riesiger Wasserfall in den Abgrund, mit einer Gischtwand und einem Regenbogen, wenn die Sonne scheint. Eine unsichtbare Wand hält das Schiff kurz vor der Kante.
- **Post-Effekte je Stufe:**
  - Mittel: Leuchten
  - Hoch: zusätzlich Konturen, Farbkorrektur und Sonnenstrahlen
  - Maximal: zusätzlich Tiefenunschärfe und Umgebungsverdeckung
- **Welt-Werkstatt (Test) im Pausemenü:** Uhrzeit, Zeitraffer und Wetter einstellen und zum Weltrand springen. Der Button bzw. die Taste R wechselt das Wetter.
- **Spielstände Version 2:** speichern Uhrzeit und Wetter. Alte Stände werden automatisch umgewandelt.
- **17 automatische Tests** (neu: Migration von Version 1 auf 2)

## 2.0.0-m0 – Meilenstein 0 „Fundament“ (01.11.2026)

Das technische Fundament für Sturmkrone 2.0. Die eigentliche Grafik (Toon-Stil, Gerstner-Ozean, Himmel, Wetter, Weltrand) kommt in Meilenstein 1. Die Testszene ist bewusst schlicht.

- **Neues Projekt:** Vite, TypeScript, three.js 0.186.1 und postprocessing 6.39.5, feste Versionen
- **Spielschleife:** gleichmäßiges Spieltempo auf jedem Gerät (60 Logikschritte pro Sekunde), weiche Darstellung auch bei 120/144 Hz, Pause beim Tab-Wechsel
- **Eingabe:** Tastatur und Maus mit frei belegbaren Tasten, Touch (Joystick links, Kamera rechts, Buttons), Gamepad (auch fürs Menü). Die Steuerung wechselt automatisch je nach Gerät.
- **Grafikstufen Niedrig / Mittel / Hoch / Maximal:** Beim ersten Start wählt das Spiel automatisch eine Stufe. Ruckelt es, senkt es die Stufe von selbst. Im Menü jederzeit änderbar.
  - Schon wirksam: Renderauflösung (bis 4K), Schatten (1024/2048/4096), Leuchten (Bloom), Farbkorrektur, Kantenglättung, Sichtweite, Partikelmenge
- **Speichern:** drei Spielstände mit automatischer Sicherungskopie, Autospeichern alle 30 Sekunden und beim Pausieren, Export und Import als Datei, Versionsnummer und Migration für künftige Updates
- **Sturmkrone 1.0:** Alte Spielstände werden erkannt und übernommen (Name, Fraktion, Stufe, Gold, Ruhm). Alle übrigen Daten wie Crew und Fähigkeiten bleiben für spätere Meilensteine erhalten.
- **Testszene:** Meer mit Wellen, Inseln mit Palmen, Leuchtturm, Bojen, Platzhalter-Schaluppe mit Kielwasser, Bug-Kanone, Breitseiten, Schub und Tag/Nacht-Wechsel
- **Menüs auf Deutsch:** Titel, Spielstände, Neues Spiel (Name, Pirat/Marine), Pause, Einstellungen (Grafik, Steuerung, Ton, Anzeige mit Textgröße und FPS-Anzeige)
- **Installierbar als App (PWA)**, funktioniert nach dem ersten Laden auch offline
- **Automatische Veröffentlichung** auf GitHub Pages bei jeder Änderung
- **16 automatische Tests** für Spielschleife, Speichern, Migration, Einstellungen und Grafikerkennung
