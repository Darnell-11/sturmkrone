# Was ist neu

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
