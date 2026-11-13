# Charakter-System 3.0 – Analyse und Bauplan

Stand: 12.11.2026, Code-Version 2.9.57 (three.js 0.186.1).

**Stand der Umsetzung (2.9.60):** Alle Phasen 0 bis 5 sind gebaut, gemessen und abgenommen, siehe `CHANGELOG.md`. Die Abnahme lief im Editor-Raum und mit nachgestellter Handy-Größe; ein echtes Handy und die Bildrate im laufenden Spiel stehen noch aus. Aus Phase 4 nicht umgesetzt: Sandalen (der Fuß der Grundfigur ist unter dem Schuh nicht ausgearbeitet) und ein eigener Stahl- oder Lederglanz für Platten und Schienen. Abweichungen vom Plan, die sich beim Messen ergaben:

- Die Haut der Grundfigur ist grob aufgeteilt (ein Punkt-Ring ist etwa 3 cm breit). Der Saumrand beträgt deshalb 0 bis 2 Ringe je nach Abstand des Stücks, nicht pauschal 2.
- Die größte Einzelursache war nicht die fehlende Maske, sondern dass Mantel und Schärpe das Oberteil darunter nicht kannten (Jacke stach zu 40 bis 50 % durch). Das löst jetzt `GarmentCtx`.
- Das Hemd der Grundfigur wird nicht maskiert, weil Schärpe und Tuch stellenweise unter seinem losen Saum liegen.
- Das Halstuch liegt auf Ebene 7 über dem Mantel, Handschuhe auf Ebene 1 unter den Ärmeln.
- Säume werden nicht über eine eigene Abstandsfunktion geschnitten, sondern per Halbierungssuche entlang der Hautkanten mit derselben Regel, die auch die Zugehörigkeit entscheidet. So bleibt jede Stück-Regel an einer Stelle.
- Die neuen Plätze im Spielstand heißen `hands`, `legs`, `feet`, `offhand`; die Rüstungsstufe bleibt der Platz für den Oberkörper.
- Die Hüllkugel ist nicht fest und groß (Abschnitt 4), sondern eng und folgt der Hüfte: Die feste Kugel hielt zu viele Figuren im Schattenbild.
- Die Tabelle in 3.2 (Flackern ab 80 bis 135 m) ist gerechnet. Gemessen wurde eine Abnahme der wechselnden Bildpunkte um 16 bis 42 % auf 100 m, kein vollständiges Verschwinden.
- Waffen bleiben bei `Character.hold` (Sockets `mainHand`, `offHand`); als Gegenstände in `data/equipment.ts` kommen sie mit dem Inventar in Phase 4.

**Was dieses Dokument ist:** eine Analyse des heutigen Figuren-, Kleidungs- und Animationssystems und ein Bauplan für drei neue Bausteine: Sichtbarkeits-Hülle, `BodyMaskingEngine` und Socket-System. Es wurde noch nichts am Spielcode geändert.

**Wie belastbar die Befunde sind:** Alle Ursachen stammen aus dem Lesen des Codes und der three.js-Quelle. Im laufenden Spiel nachgemessen ist davon noch nichts. Jeder Befund trägt deshalb eine Einstufung:

- **sicher** – der Mechanismus steht so im Code, er muss auftreten.
- **wahrscheinlich** – der Mechanismus steht im Code, wie stark er sichtbar wird, zeigt erst die Messung (Phase 0).

**Hinweis zu den Ordnern:** Einen Ordner `src/graphics/` gibt es nicht. Die Grafik liegt in `src/render/`, die Figuren in `src/entities/character/`.

---

## 1. Kurzfassung

1. **Die Haut wird nie ausgeblendet.** Unter jedem Kleidungsstück liegt der vollständige Körper, 4 bis 11 mm darunter. Das ist die Hauptursache für durchstechende Haut und für Flackern auf Entfernung.
2. **Kleidungsschichten liegen nur 8 mm auseinander** (Hemd, Weste, Mantel, Schärpe) und stecken alle in einem Netz mit derselben Tiefenverschiebung. Ab etwa 80 bis 100 m Kameraabstand reicht die Tiefengenauigkeit dafür nicht mehr.
3. **Körperteile verschwinden am Bildrand**, weil three.js die Hüllkugel jedes Figuren-Netzes nur einmal berechnet, in der Pose des ersten Bildes. Liegt oder rollt die Figur später, werden Haare, Gesicht oder Kleidung einzeln weggeschnitten.
4. **Kleidungsränder sind ausgefranst**, weil ein Stück nur aus ganzen Haut-Dreiecken besteht und nach Knochen und Höhe ausgewählt wird.
5. **Mehrere Teile fehlen ganz:** Die Uniform hat kein eigenes Kleidungsstück, Sandalen gibt es bei den Anime-Figuren nicht, Rüstungsstufen sind nur Umfärbungen, und es gibt keine Plätze für Beine, Füße und Hände.

Der Bauplan behebt das in fünf Schritten (Abschnitt 7). Die zwei schnellsten Gewinne sind die Hüllkugel (Punkt 3, wenige Zeilen) und die `BodyMaskingEngine` (Punkte 1 und 2).

---

## 2. Wie das System heute aufgebaut ist

### 2.1 Zwei Figuren-Arten

| | Anime-Figur (Normalfall) | Bausteinfigur (Ersatz) |
|---|---|---|
| Quelle | VRoid-Grundfiguren `base_male.glb`, `base_female.glb`, Haare aus `male.glb`, `female.glb` | Grundformen aus `builder.ts` |
| Skelett | VRoid (`J_Bip_…`), über 50 Knochen plus Haarknochen | KayKit `Rig_Medium` |
| Bindung | echte Gewichte, bis zu 4 Knochen je Punkt | jeder Teil starr an genau einem Knochen |
| Kleidung | aus der Haut erzeugte Hüllen (`buildGarment`) | Kästen und Zylinder |
| Wann | immer, wenn die VRoid-Dateien laden | nur wenn `loadVroid` scheitert |

Die Bausteinfigur hat keinen Körper unter der Kleidung. Clipping und Masken betreffen deshalb nur die Anime-Figur. Der Rest dieses Dokuments meint sie, wenn nichts anderes dasteht.

### 2.2 Woraus eine Anime-Figur besteht

Eine Figur ist ein Klon der Vorlage (`cloneSkinned(vb.template)`, `character.ts:237`) mit diesen Netzen:

| Netz | Herkunft | Sichtbar |
|---|---|---|
| Körperhaut (`Body…_SKIN`) | VRoid, vollständig modelliert | **immer** |
| Gesicht, Brauen, Iris, Mund, Wimpern | VRoid | immer |
| Haare | VRoid, je Material zusammengeführt (`mergeParts`) | immer, auch unter Hüten |
| Hemd der Grundfigur (`Tops`) | VRoid-Schuluniform | nur bei Outfit „Hemd“ und „Uniform“ ohne Mantel |
| Rock oder Hose der Grundfigur (`Bottoms`) | VRoid | nie (`character.ts:380`) |
| Schuhe der Grundfigur (`Shoes`) | VRoid | **immer**, auch unter Stiefeln |
| Erzeugte Kleidung | ein Netz für alle Stücke (`garmentSet`) | je nach Aussehen |
| Hut, Bart, Narbe, Ohrring, Augenklappe | starre Netze am Kopfknochen | je nach Aussehen |
| Schärpenknoten, Schnalle, Schulterstücke | starre Netze an Hüfte bzw. Brust | je nach Aussehen |
| Laterne | starr am Becken | immer |
| Waffen | starr an `handslotl` / `handslotr` | je nach Kampfstil |

### 2.3 Wie Kleidung an das Skelett gebunden ist (`mesh.bind`)

Es gibt vier Stellen, an denen ein Netz an ein Skelett gebunden wird:

| Stelle | Was | Bewertung |
|---|---|---|
| `character.ts:421` `m.bind(body.skeleton, body.bindMatrix)` | erzeugte Kleidung an das Skelett der Körperhaut | richtig: gleiches Skelett, gleiche Bindematrix, Gewichte von der Haut kopiert |
| `character.ts:458`, `:466` `bind(this.skeleton, IDENTITY)` | Bausteinfigur | richtig für starre Teile |
| `outline.ts:155` `sm.bind(skeleton, bindMatrix)` | Tusche-Kontur | richtig, bei Figuren derzeit aus (`CHARACTER_INK = false`) |
| `vroid.ts:1134` `m.bind(skel, h.bindMatrix.clone())` | fremde Haare auf die Grundfigur | richtig, eigenes Skelett-Objekt je Haarquelle |

**Die Bindung selbst ist nicht die Fehlerquelle.** Die erzeugte Kleidung übernimmt Knochen-Indizes und Gewichte Punkt für Punkt von der Haut (`vroid.ts:719–723`) und bewegt sich im Grundsatz genau mit ihr. Die Probleme entstehen danach, in drei Schritten von `buildGarment`:

1. **Unterteilen** (`vroid.ts:726–755`): Jeder Mittelpunkt mischt die Gewichte zweier Ecken und behält nur die vier stärksten. An Gelenken mit vielen beteiligten Knochen (Schulter, Hüfte) weicht das leicht von der Haut ab.
2. **Glätten** (`vroid.ts:769–808`): Acht Durchgänge schieben die Punkte seitlich über die Oberfläche. Die Gewichte wandern nicht mit. Ein Punkt, der vom Oberschenkel Richtung Knie gerutscht ist, biegt sich weiter wie Oberschenkel.
3. **Mindestabstand** (`vroid.ts:803–806`): Geprüft wird nur gegen den *ursprünglichen* Hautpunkt und nur in Ruhehaltung. In Bewegung prüft niemand.

### 2.4 Schichten und ihre Abstände zur Haut

Aus `garmentOffset` (`vroid.ts:983–1069`), in Millimetern:

| Schicht | Abstand zur Haut | Abstand zur Schicht darunter |
|---|---|---|
| Hose | 11 | 11 (Haut) |
| enges Hemd (unter Weste und Mantel) | 4–14 | 4–14 (Haut) |
| Ringelhemd | Hemd der Grundfigur + 4 | Grundhemd ist dabei ausgeblendet |
| Weste | 16–22 | etwa 8 (Hemd) |
| Jacke | mindestens 18 | Grundhemd ausgeblendet |
| Mantel, Rumpf | 24–30 | etwa 8 (Weste) |
| Mantel, Ärmel | 15–24 | 8–11 (Hemd) |
| Schärpe eng / weit | 26–34 / ab 26 | 4–10 (Weste), unter dem Mantel |
| Handschuhe | 6 | 6 (Haut) |
| Stiefel | 26–48, mindestens Schuh + 5 | **5 (Schuh der Grundfigur)** |

### 2.5 Animation

- Quelle sind 132 KayKit-Clips. `VroidBase.retarget` (`vroid.ts:850`) überträgt sie beim ersten Abruf auf das VRoid-Skelett, mit 30 Stützstellen je Sekunde.
- Übertragen werden 18 Knochen (`VROID_BONES`). Schultern (`J_Bip_L_Shoulder`), Hals, obere Brust, Finger und Zehen bekommen keine Spur.
- Arme werden um bis zu 24° an den Körper gelegt (`tuckArm`), weil die Vorlagen breite Figuren sind.
- Finger stehen fest in einer Greifhaltung (`curl`).
- Haarknochen (`J_Sec_…`) werden mitgenommen, aber nicht bewegt. Haare sind starr am Kopf.
- Nach der Animation kommen Neigung in Kurven (`applyLean`) und Arm-Zielführung am Steuerrad (`reach`) dazu.

### 2.6 Ausrüstung im Spielstand

`SlotId = 'head' | 'armor' | 'weapon' | 'trinket'` (`data/items.ts:6`). Sichtbar wirkt Ausrüstung nur über `displayLook()` (`game.ts:536`): Die Kopfbedeckung überschreibt `look.hat`, die Rüstungsstufe überschreibt Oberteil und Mantel (`ARMOR_LOOK`). Alles läuft am Ende durch `CharacterLook` und `Character.setLook`.

---

## 3. Ursachen im Einzelnen

### 3.1 Clipping (Haut oder untere Schicht sticht durch)

**C1 – Die Haut unter der Kleidung bleibt sichtbar. (sicher, Hauptursache)**
`dressVroid` blendet nur ganze Netze der Grundkleidung aus (`m.visible = false`, `character.ts:380–381`). Die Körperhaut wird nie angefasst. Jede Abweichung zwischen Hülle und Haut, die größer ist als der Abstand aus 2.4, zeigt Haut. Bei Hemd (4 mm) und Handschuhen (6 mm) genügt sehr wenig.

**C2 – Gewichte wandern beim Glätten nicht mit. (sicher im Mechanismus, Stärke wahrscheinlich)**
Siehe 2.3, Schritt 2. Betroffen sind alle weichen Stücke (`soft`, `vroid.ts:725`), am stärksten an Knie, Ellbogen, Schulter und Schritt, wo die Gewichte auf kurzer Strecke wechseln.

**C3 – Das Hemd der Grundfigur hat eigene Gewichte. (sicher)**
Bei „Hemd“ und „Uniform“ ohne Mantel ist das VRoid-Hemd sichtbar. Es ist ein eigenes Netz mit anderer Aufteilung und anderen Gewichten als die Haut. Der Freiraum (`clearance`, `vroid.ts:359`) wird nur in Ruhehaltung gemessen. In Bewegung sticht die Haut an Ellbogen und Achseln durch, genau der Effekt, wegen dem die Hose der Grundfigur schon ausgeblendet wurde (Kommentar `character.ts:379`).

**C4 – Der Freiraum ist gedeckelt und hat Lücken. (sicher)**
`clearance` begrenzt jeden Wert auf 40 mm (`vroid.ts:399`) und findet nichts, wenn der nächste Hautpunkt weiter als 60 mm entfernt ist (`vroid.ts:386`). Kragen, Puffärmel und Schuhspitzen der Grundfigur stehen weiter ab. Schärpe und Halstuch, die „Grundhemd + Zuschlag“ rechnen, liegen dort zu eng, und das Grundhemd sticht durch.

**C5 – Stiefel liegen nur 5 mm über den Schuhen der Grundfigur. (wahrscheinlich)**
Die Schuhe bleiben unter den Stiefeln sichtbar (2.2). Der Stiefel ist geglättet, der Schuh nicht, und beide haben verschiedene Gewichte. Durch C4 kann der Stiefel an dicken Stellen sogar innerhalb des Schuhs liegen.

**C6 – Haare unter Kopfbedeckungen. (wahrscheinlich)**
`capShell` (`vroid.ts:594`) tastet die Frisur mit 32 × 10 Richtungen ab und legt 5 bis 10 mm Rand darüber. Strähnen zwischen zwei Abtastrichtungen können herausragen. Die Haare selbst werden nicht ausgeblendet.

**C7 – Starre Teile auf beweglichem Untergrund. (sicher)**
Schärpenknoten und Schnalle hängen starr am Hüftknochen, das Band darunter biegt sich mit Hüfte *und* Wirbelsäule. Schulterstücke hängen starr an der Brust, die Schulter darunter am Oberarm. Bei Rumpfbeugen und gehobenen Armen schweben sie oder tauchen ein. Dasselbe gilt für die Laterne an der Hüfte gegen Mantelschöße und schwingende Arme und für die Kampfhandschuh-Kästen (`weapons.ts:88`) gegen Hand und Fäustling.

**C8 – Lange Mantelschöße folgen den Beinen. (sicher)**
Die Schöße sind verschobene Oberschenkel-Haut mit Oberschenkel-Gewichten (`vroid.ts:1061–1065`). Beim Ausfallschritt reißen linke und rechte Hälfte auseinander oder ein Bein tritt durch die Fläche der anderen Seite.

### 3.2 Z-Fighting (Flackern)

**Z1 – Flächen liegen dichter beieinander, als der Tiefenpuffer auf Entfernung auflöst. (sicher)**
Kamera-Ebenen sind 0,1 m und 1000 m (`qualityTiers.ts:79`). Bei 24 Bit Tiefe ist der kleinste unterscheidbare Abstand ungefähr `d² / (0,1 · 2²⁴)`:

| Kameraabstand | auflösbarer Abstand |
|---|---|
| 10 m | 0,06 mm |
| 50 m | 1,5 mm |
| 100 m | 6 mm |
| 200 m | 24 mm |

Hemd auf Haut (4 mm) flackert damit ab etwa 80 m, Schicht auf Schicht (8 mm) ab etwa 115 m, die Hose (11 mm) ab etwa 135 m. Solche Abstände kommen vor: Crew an Deck aus der See-Kamera und der Draufsicht, Stadtleute aus der Ferne, feindliche Besatzungen. Auf Geräten mit 16 Bit Tiefe beginnt es schon bei wenigen Metern.

**Z2 – Alle Kleidungsschichten teilen eine Tiefenverschiebung. (sicher)**
Die gesamte erzeugte Kleidung ist ein Netz mit einem Material und `polygonOffset −1 / −2` (`character.ts:419`). Die Verschiebung hilft nur gegen Haut und Grundkleidung. Zwischen Hemd, Weste, Mantel und Schärpe gibt es keine Rangfolge. Dazu ist das Material doppelseitig (`DoubleSide`), sodass auch Innenseiten gegeneinander antreten.

**Z3 – Durchscheinende Gesichtsteile ohne feste Reihenfolge. (wahrscheinlich, klein)**
Wimpern und Augenglanz schreiben keine Tiefe (`character.ts:321`). Ihre Zeichenreihenfolge ergibt sich aus dem Abstand der Netz-Mittelpunkte und kann beim Drehen des Kopfes wechseln. Ein fester `renderOrder` je Teil beseitigt das.

**Z4 – Schatten auf dünnen Schichten. (wahrscheinlich, klein)**
Mit Schichten im Abstand von 8 mm und einem Normalen-Versatz von 1,6 Schattenpixeln (`environment.ts:149`) können Hemd und Weste sich gegenseitig streifig beschatten. Verschwindet von selbst, sobald verdeckte Schichten nicht mehr gezeichnet werden.

### 3.3 Fehlende und abgeschnittene Teile

**F1 – Netze verschwinden am Bildrand. (sicher)**
`SkinnedMesh` hat seit three.js r151 eine eigene Hüllkugel. Sie wird einmal berechnet, beim ersten Bild, aus der Pose in diesem Moment, und danach nie erneuert (`SkinnedMesh.js:133–155`, `Frustum.js:148–152`). Die großzügige Kugel der Geometrie (Faktor 1,6, `vroid.ts:280`, `:344`, `:831`) wird für `SkinnedMesh` gar nicht benutzt. Alle Netze der Anime-Figur haben `frustumCulled = true` (`character.ts:261`, die Kleidung als Voreinstellung).

Folge: Die Kugel der Haare sitzt dort, wo der Kopf im ersten Bild war. Liegt die Figur (K.o., `Lie_Idle`, `Sit_Floor_Idle`), rollt sie oder beugt sie sich weit vor, dann ist der Kopf über einen Meter davon entfernt. Sobald die alte Stelle aus dem Bild wandert, verschwinden Haare, Gesicht oder Kleidung einzeln, auch im Schatten. Das erklärt „fehlende“ Teile, die bei einer kleinen Kamerabewegung wieder auftauchen.

**F2 – Ausgefranste Ränder. (sicher)**
Ein Dreieck gehört nur dann zum Kleidungsstück, wenn alle drei Ecken dazugehören (`vroid.ts:711`). Die Auswahl läuft über den stärksten Knochen, die Höhe in T-Pose und teils die Richtung der Normale (`N.z > 0.2` bei den Mantelschößen, `vroid.ts:1062`). Der Rand folgt so dem Zickzack der Haut-Dreiecke. Das Glätten zieht nur Randpunkte mit genau zwei Rand-Nachbarn gerade (`vroid.ts:793`), Ecken und Verzweigungen bleiben stehen.

**F3 – Auswahl nach dem stärksten Knochen reißt Löcher. (sicher)**
Weste ohne Arm-Punkte, Stiefel nur aus Unterschenkel-, Fuß- und Zehen-Punkten, Schärpe nur aus Becken-Punkten: Wo der stärkste Knochen von Punkt zu Punkt wechselt (Achsel, Knie, Taille), fallen einzelne Dreiecke heraus.

**F4 – Teile, die es gar nicht gibt.** (sicher)

| Was der Editor oder das Inventar verspricht | Was die Anime-Figur zeigt |
|---|---|
| Outfit „Uniform“ | das eingefärbte Schulhemd der Grundfigur, kein Uniformrock |
| Schuhe „Sandalen“ | die geschlossenen Schuhe der Grundfigur |
| Rüstungsstufen 1–4 | nur andere Oberteile und Farben (`ARMOR_LOOK`), keine Platten, Schulterstücke, Armschienen |
| Halstuch, Handschuhe, Narbe | im Anime-Editor nicht wählbar (`editor.ts:208`), Handschuhe nur automatisch bei Faustkämpfern |
| Gesichtsform, Augenform, Brauen, Mund | ohne Wirkung, nur die Augenfarbe |
| Plätze Beine, Füße, Hände | gibt es nicht (`SlotId` kennt nur Kopf, Rüstung, Waffe, Zubehör) |
| Schild, Zweitwaffe als Gegenstand | nur fest über den Kampfstil |

### 3.4 Animation als Verstärker

- **A1 – Schultern werden nicht übertragen.** Die Hülle über der Schulter hängt an Brust- und Oberarm-Gewichten. Hebt die Figur den Arm, knickt die Schulter ein und Mantel und Weste falten sich dort in den Körper. (wahrscheinlich)
- **A2 – Arme werden angelegt.** `tuckArm` bringt die Arme näher an den Rumpf, als die Vorlage es vorsieht. Ärmel (15–24 mm) und Rumpf des Mantels (24–30 mm) berühren sich in der Achsel und am Brustkorb. (wahrscheinlich)
- **A3 – Keine Stoff-Bewegung.** Mantelschöße, Schärpen-Enden, Haare und Halstuch sind starr oder reine Haut-Hüllen. Das ist kein Fehler, erklärt aber C8.

---

## 4. Baustein 1: Sichtbarkeits-Hülle (behebt F1)

Kleinster und sicherster Eingriff, deshalb zuerst.

- Je Figur **eine** Kugel im Raum der Figur: Mitte auf Hüfthöhe, Halbmesser 1,25 × Körpergröße (deckt Liegen, Rollen und den Ausfallschritt ab).
- Diese Kugel wird jedem `SkinnedMesh` der Figur als `mesh.boundingSphere` gesetzt, auch der Kleidung und den Effekt-Kopien. Dann rechnet three.js nichts mehr selbst.
- Eine Kugel je Grundfigur genügt, alle Klone teilen sie (nur lesend). Keine Arbeit je Bild, keine neuen Objekte in der Spielschleife.
- Die Faktor-1,6-Kugeln an den Geometrien können danach entfallen.

Ort: neue Hilfsfunktion in `character.ts`, aufgerufen am Ende von `initVroid` und `dressVroid`.

---

## 5. Baustein 2: `BodyMaskingEngine`

### 5.1 Ziel

Was von Kleidung vollständig verdeckt ist, wird nicht gezeichnet: Haut unter Stoff, Hemd unter Mantel, Schuh unter Stiefelschaft, Haar unter Helm. Damit gibt es an diesen Stellen nichts mehr, was durchstechen oder flackern könnte. Nebenbei sinkt die Zahl der gezeichneten Dreiecke.

### 5.2 Welche Technik

Im Auftrag stehen `material.visible = false` und `geometry.groups`. Beide passen hier nur eingeschränkt:

| Weg | Urteil |
|---|---|
| `material.visible = false` | schaltet ein ganzes Netz ab. Die Körperhaut ist *ein* Netz, also unbrauchbar für Teilbereiche. Für ganze Netze der Grundkleidung wird es schon benutzt und bleibt dafür richtig. |
| `geometry.groups` mit Material-Liste | funktioniert in three.js (`WebGLRenderer.js:1948` überspringt Gruppen mit unsichtbarem Material). Aber `stylize`, `enableFx`, Treffer-Leuchten und Auflösen überspringen ausdrücklich Netze mit Material-Liste (`character.ts:355`, `:725`). Diese Wege müssten alle umgebaut werden, und jede Gruppe kostet einen eigenen Zeichenaufruf. |
| **eigener Index-Puffer je Maske (Empfehlung)** | Die Figur bekommt eine leichte Geometrie, die alle Punktdaten mit der Vorlage teilt und nur eine eigene Dreiecksliste hat, ohne die verdeckten Dreiecke. Ein Material, ein Zeichenaufruf, Effekte und Schatten laufen unverändert. Dasselbe Muster nutzt die Kleidung schon (`character.ts:403–405`). |
| Maske im Shader (`discard`) | kostet weiter Rechenzeit für jeden verdeckten Punkt und braucht einen Eingriff in das Toon-Material. Nicht nötig. |

### 5.3 Maske punktgenau statt nach groben Zonen

Die erzeugte Kleidung entsteht aus den Hautpunkten selbst. `garmentOffset` beantwortet für jeden Hautpunkt bereits die Frage „gehört dieser Punkt zum Stück?“ (Rückgabe ≥ 0). Die Maske fällt also als Nebenprodukt an, genau entlang des echten Saums. Grobe Zonen (Oberkörper, Beine, Füße) wären ungenauer: ein offener Mantel, eine ärmellose Weste oder ein V-Ausschnitt ließen sich damit nicht abbilden.

Je Kleidungsstück und Grundfigur wird einmal berechnet und zwischengespeichert:

```ts
/** 1 = dieser Hautpunkt liegt unter dem Stück */
cover: Uint8Array            // Länge = Zahl der Hautpunkte
```

Für Netze mit eigener Aufteilung (Hemd und Schuhe der Grundfigur, Haare) gibt es eine Zuordnung „Punkt → nächster Hautpunkt“. `clearance()` sucht diese Paare schon (`vroid.ts:383–399`) und muss sie nur behalten:

```ts
/** je Punkt des Grundhemds / der Schuhe: Index des nächsten Hautpunkts, −1 = keiner */
owner: Int32Array
```

Haare unter Kappen-Hüten: verdeckt ist jeder Haarpunkt, der mindestens 4 mm innerhalb der Kappe liegt (gleiches Richtungsraster wie `capShell`).

### 5.4 Schichten-Regel

Jedes Stück hat eine Ebene (innen → außen). Ein Dreieck wird weggelassen, wenn **alle drei Ecken** von einem **deckenden** Stück einer höheren Ebene verdeckt sind **und** keine Ecke im Saumrand liegt.

| Ebene | Stücke | deckend |
|---|---|---|
| 0 | Körperhaut | – |
| 1 | Hose, enges Hemd, Hemd der Grundfigur, Schuhe der Grundfigur | ja |
| 2 | Ringelhemd, Tunika | ja |
| 3 | Weste, Jacke, Uniformrock | ja |
| 4 | Schärpe, Koppel | ja |
| 5 | Halstuch, Handschuhe, Stiefel | ja |
| 6 | Mantel | ja |
| 7 | starre Rüstungsteile (Platten, Schienen) | nach Angabe |

**Saumrand:** Die verdeckte Fläche wird um zwei Punkt-Ringe (etwa 15–20 mm) vom Saum zurückgenommen. Unter jedem Saum bleibt so ein Streifen der unteren Schicht stehen. Man sieht nie in ein Loch, auch nicht schräg in einen Ärmel oder unter einen Mantelschoß.

**Öffnungen bleiben offen:** Im V-Ausschnitt des Mantels liefert `garmentOffset` −1. Dort ist nichts verdeckt, Weste und Hemd bleiben sichtbar.

**Durchscheinendes und Löchriges deckt nicht:** Stücke mit `alphaTest`-Löchern oder Transparenz (zerrissene Säume, Netzstoff) bekommen `opaque: false` und verdecken nichts.

### 5.5 Schnittstelle

Neue Datei `src/entities/character/bodyMask.ts`:

```ts
export interface MaskLayer {
  /** Ebene, innen → außen */
  level: number;
  /** verdeckt dieses Stück, was darunter liegt? */
  opaque: boolean;
  /** je Hautpunkt 1 = bedeckt (geteilt, je Grundfigur zwischengespeichert) */
  cover: Uint8Array;
}

export class BodyMaskingEngine {
  constructor(base: VroidBase);

  /**
   * Dreiecksliste eines Netzes ohne verdeckte Dreiecke.
   * target: 'skin' | 'baseTop' | 'baseShoes' | 'hair' | GarmentKind
   * Ergebnis ist zwischengespeichert (Schlüssel: Grundfigur + Ziel + Kombination der Stücke).
   */
  indexFor(target: MaskTarget, worn: readonly MaskLayer[]): BufferAttribute;

  /** Nutzer abmelden; nicht mehr gebrauchte Listen werden freigegeben */
  release(index: BufferAttribute): void;
}
```

Einbau in `Character.dressVroid`:

1. Liste der getragenen Stücke bilden (wie heute `want`).
2. Für Körperhaut, Grundhemd, Grundschuhe und Haare je eine leichte Geometrie anlegen, die die Punktdaten der Vorlage teilt und `engine.indexFor(…)` als Dreiecksliste bekommt.
3. Die erzeugte Kleidung bekommt ebenfalls eine maskierte Liste (Hemd unter Mantel fällt weg).
4. Beim Wechsel des Aussehens und in `dispose()` die alten Listen mit `release` zurückgeben.

### 5.6 Speicher und Leistung (Regeln aus `CLAUDE.md`)

- **Keine Arbeit je Bild.** Masken entstehen nur beim Anziehen.
- **Zwischenspeicher mit Zählung.** NPCs wiederholen ihre Kombinationen, gleiche Kombination heißt gleiche Liste. Eine Liste für die Körperhaut ist wenige Kilobyte groß.
- **Freigabe:** Listen ohne Nutzer werden über `dispose()` freigegeben, sobald der Speicher eine Obergrenze überschreitet (wie `geoCache` in `character.ts:479`). Geteilte Punktdaten bleiben mit `markShared` geschützt. `releaseGarment` wird um die neuen leichten Geometrien erweitert.
- **Zeichenaufrufe:** unverändert, weiter ein Aufruf je Netz.
- **Erwartete Ersparnis:** Bei Mantel, Hose und Stiefeln sind grob zwei Drittel der Körperhaut verdeckt. Das wird in Phase 0 und 2 gemessen, nicht geschätzt.

### 5.7 Begleitende Korrekturen in `buildGarment`

Die Maske beseitigt Durchstiche in der Fläche. Am Saum bleibt die untere Schicht sichtbar, dort müssen die Hüllen sauber sitzen:

1. **Gewichte nach dem Glätten neu holen (behebt C2):** Jeder geglättete Punkt übernimmt die Gewichte des Hautpunkts, über dem er jetzt liegt (nächstes Haut-Dreieck, gewichtet nach Lage im Dreieck).
2. **Saum als Linie statt nach Dreiecken (behebt F2, F3):** Die Zugehörigkeit wird ein weicher Wert je Hautpunkt (Abstand zur Saumlinie). Dreiecke, durch die die Linie läuft, werden an ihr geschnitten. So entstehen gerade Säume unabhängig von der Aufteilung der Haut.
3. **Auswahl nach Gewichtssumme statt nach stärkstem Knochen (behebt F3):** „Gehört zum Arm“ heißt dann: Arm-Gewichte zusammen über 0,5.
4. **Freiraum ohne Deckel (behebt C4):** Suchweite 100 mm, kein 40-mm-Deckel. Stattdessen werden Ausreißer über den Mittelwert der Nachbarn geglättet.
5. **Mindestabstände:** Nach der Maske liegt unter den meisten Flächen nichts mehr. Die Abstände aus 2.4 können dann kleiner und gleichmäßiger werden, Mäntel werden schlanker.
6. **Eigene Tiefenverschiebung entfällt:** `polygonOffset` an der Kleidung wird überflüssig und entfernt (Z2).

---

## 6. Baustein 3: Socket-System

### 6.1 Zwei Arten von Plätzen

- **Trage-Plätze** (Head, Chest, Legs, Feet, Hands): Das Teil liegt am Körper. Es ist entweder eine Hülle aus der Haut (bewegt sich mit, liefert eine Maske) oder ein starres Teil an einem Knochen.
- **Halte-Plätze** (MainHand, OffHand): Das Teil liegt in der Hand, starr an der Handhalterung.

### 6.2 Die sieben Sockets

| Socket | Knochen (VRoid) | Knochen (Bausteinfigur) | Maskiert | Heutiger Code, der hierher wandert |
|---|---|---|---|---|
| `head` | `J_Bip_C_Head` | `head` | Haare unter Kappen | `attachHeadgear`, `capHat`, Brille, Augenklappe, Ohrring, Bart, Narbe |
| `chest` | `J_Bip_C_Chest`; Hüllen über Rumpf und Arme | `chest` | Rumpf, Schultern, Arme | Hemd, Ringelhemd, Tunika, Weste, Jacke, Mantel, Halstuch, Schulterstücke |
| `legs` | `J_Bip_C_Hips`; Hüllen über Becken und Beine | `hips` | Becken, Ober- und Unterschenkel | Hose, Schärpe, Koppel, Knoten und Schnalle, Laterne |
| `feet` | `J_Bip_L_Foot`, `J_Bip_R_Foot` | `footl`, `footr` | Füße, Unterschenkel bis Schaftkante | Schuhe der Grundfigur, Stiefel, neu: Sandalen |
| `hands` | `J_Bip_L_Hand`, `J_Bip_R_Hand`; Schienen an `…LowerArm` | `handl`, `handr` | Hände, bei Stulpen der Unterarm | Fäustlinge, Kampfhandschuhe (heute fälschlich Waffe) |
| `mainHand` | `handslotr` | `handslotr` | – | `Character.hold('r', …)` |
| `offHand` | `handslotl` | `handslotl` | – | `Character.hold('l', …)`, Schild, Zweitklinge |

Paarige Sockets (`feet`, `hands`) haben eine linke und eine rechte Halterung. Ein Gegenstand beschreibt eine Seite, die andere wird gespiegelt.

### 6.3 Halterungen: einheitlicher Raum

Heute rechnet jedes starre Teil selbst um: `rotation.y = Math.PI`, weil VRoid-Knochen nach −Z schauen (`animeHats.ts:331`, `:340`), und `k = 1 / Weltmaßstab`, damit Maße in Metern stimmen (`character.ts:293`). Das ist die Quelle der früheren „schwebt 3 cm daneben“-Fehler.

Neu: `initVroid` legt je Socket einmal einen Halterungs-Knoten an (`Object3D`, Name `socket_head` usw.), der diese Umrechnung enthält:

- **Ausrichtung:** +Z nach vorn, +Y nach oben, +X zur linken Körperseite, für beide Figuren-Arten gleich.
- **Maßstab:** 1 Einheit = 1 Meter in der Welt, unabhängig von Körpergröße und Körperbau (`rig.scale` ist bei „kräftig“ in der Breite 1,07).
- **Ursprung:** aus der Körperform gemessen, nicht geschätzt. `VroidBase.anchors()` liefert schon Ohrläppchen, Augenhöhe, Schultern, Knoten und Schnalle.

Unter einer Halterung liegen benannte **Ankerpunkte** für Kleinteile:

| Socket | Ankerpunkte |
|---|---|
| `head` | `crown` (Sitzhöhe der Frisur), `brow`, `eyeL`, `eyeR`, `earL`, `earR`, `chin` |
| `chest` | `shoulderL`, `shoulderR`, `collar`, `back` (Rückenscheide, Umhang), `sternum` |
| `legs` | `buckle`, `knotL`, `knotR`, `hipL`, `hipR` (Laterne, Scheide) |
| `hands` | `wristL`, `wristR`, `knucklesL`, `knucklesR` |

Starre Kleinteile auf weichem Untergrund (C7) hängen nicht mehr an einem Knochen, sondern an einem **Hautpunkt**: Der Anker merkt sich einen Hautpunkt samt Gewichten und wird mit denselben Knochen bewegt wie die Haut dort. Knoten und Schulterstück bleiben so auf dem Band bzw. der Schulter, wenn die Figur sich beugt. Rechenaufwand: eine gewichtete Summe aus höchstens vier Matrizen je Anker und Bild, mit vorab angelegten Hilfsobjekten.

### 6.4 Ausrüstung als Daten

Neue Datei `src/data/equipment.ts` (Inhalte als Daten, wie in `CLAUDE.md` verlangt):

```ts
export type SocketId = 'head' | 'chest' | 'legs' | 'feet' | 'hands' | 'mainHand' | 'offHand';

export type EquipForm =
  | { type: 'shell'; garment: GarmentKind }                  // Hülle aus der Haut
  | { type: 'cap'; sink: number; margin: number }            // Kappe um die Frisur
  | { type: 'rigid'; build: string; anchor: string }         // starres Teil an einem Ankerpunkt
  | { type: 'held'; build: string; grip: number };           // in der Hand, grip = Fingerschluss 0…1

export interface EquipDef {
  id: string;
  /** Anzeigename (Deutsch) */
  n: string;
  socket: SocketId;
  /** ein Gegenstand kann aus mehreren Teilen bestehen (Mantel + Schulterstücke) */
  parts: EquipForm[];
  /** Ebene für die Maske, innen → außen */
  level: number;
  /** verdeckt, was darunter liegt */
  opaque: boolean;
  /** ganze Netze der Grundfigur, die dieses Teil ersetzt */
  hidesBase?: ('top' | 'bottom' | 'shoes')[];
  /** belegt weitere Sockets mit (Zweihänder: offHand; Overall: legs) */
  alsoOccupies?: SocketId[];
  /** Farbfelder, die die Figur liefert */
  tint?: { part: number; from: 'outfit' | 'accent' | 'pants' | 'shoes' | 'coat' | 'hat' | 'fixed'; color?: string }[];
  surface?: 'cloth' | 'leather' | 'steel';
  /** Spielwerte, wie heute in HEADS */
  hp?: number; reduce?: number; crit?: number; price?: number; rank?: number; rarity?: Rarity;
}

/** Was eine Figur gerade trägt. Mehrere Lagen je Socket sind erlaubt (Hemd + Weste + Mantel). */
export type Loadout = Record<SocketId, string[]>;
```

### 6.5 Ablauf beim Anziehen

`Character.equip(loadout)` ersetzt den Kern von `applyVroidLook` und `dressVroid`:

1. `Loadout` auflösen: Belegungen prüfen (`alsoOccupies`), je Socket nach Ebene sortieren.
2. Hüllen sammeln und als ein Netz bauen (`garmentSet`, wie heute).
3. `BodyMaskingEngine` mit allen deckenden Teilen füttern, maskierte Listen für Haut, Grundkleidung, Haare und untere Hüllen holen.
4. Starre Teile an ihre Ankerpunkte hängen, gehaltene Teile an `mainHand` / `offHand`.
5. Fingerschluss aus `grip` setzen (`curl`).
6. `stylize` und die Sichtbarkeits-Hülle (Abschnitt 4) anwenden.

### 6.6 Übergang ohne Bruch

- **`CharacterLook` bleibt.** Eine Funktion `loadoutFromLook(look, style)` bildet Outfit, Mantel, Schuhe, Hut, Halstuch und Handschuhe auf ein `Loadout` ab. NPCs, Gegner, Crew und der Editor laufen damit unverändert.
- **Spielstand:** `gear` bekommt in Version 11 die Felder `chest`, `legs`, `feet`, `hands` und `offHand`, jeweils mit Besitzliste. Die Migration füllt sie aus der heutigen Rüstungsstufe (`ARMOR_LOOK`), es geht nichts verloren. Alte Stände bleiben lesbar.
- **Inventar:** `SlotId` wächst von vier auf sieben Plätze plus Zubehör. `HEADS` wandert in `equipment.ts`.
- **Bausteinfigur:** bekommt dieselben Socket-Namen auf ihren Knochen und trägt starre und gehaltene Teile. Hüllen und Masken braucht sie nicht.

---

## 7. Bauplan in Schritten

Jeder Schritt ist eine eigene kleine Version mit Eintrag im `CHANGELOG.md` und endet spielbar. Die Reihenfolge ist so gewählt, dass jeder Schritt für sich nichts verschlechtern kann.

### Phase 0 – Messen (kein sichtbarer Unterschied)

Ziel: Zahlen statt Eindrücke, damit jeder spätere Schritt belegt ist.

- Prüfwerkzeug nur im Entwicklungsmodus: für beide Grundfiguren, alle Outfits, Mäntel, Schuhe und Hüte und eine feste Liste von Clips (Idle, Gehen, Rennen, Rolle, je ein Angriff pro Stil, Treffer, K.o., Sitzen, Liegen, Steuern) in Schritten von 0,1 s die Punkte per `getVertexPosition` auswerten.
- Kennzahl **Durchstich:** Anteil der Hautpunkte unter einem Stück, die weiter außen liegen als die Hülle darüber, plus größte Tiefe in mm.
- Kennzahl **Flackern:** kleinster Abstand zwischen zwei gezeichneten Schichten, daraus der Kameraabstand, ab dem es flackert (Tabelle in 3.2).
- Kennzahl **Sichtbarkeit:** Anteil der Bilder, in denen ein Netz außerhalb seiner Hüllkugel liegt.
- Dazu Bildtafeln von vorn, von der Seite und von hinten je Kombination, wie beim Figuren-Audit 2.9.23.

### Phase 1 – Schnelle Korrekturen

- Sichtbarkeits-Hülle (Abschnitt 4), behebt F1.
- Gewichte nach dem Glätten neu holen (5.7 Punkt 1), behebt C2.
- Fester `renderOrder` für durchscheinende Gesichtsteile, behebt Z3.
- Freiraum ohne Deckel (5.7 Punkt 4), behebt C4.

### Phase 2 – `BodyMaskingEngine`

- `bodyMask.ts`, `cover` je Kleidungsstück, `owner` für Grundhemd, Schuhe und Haare.
- Einbau in `dressVroid`, Freigabe in `releaseGarment` und `dispose`.
- `polygonOffset` der Kleidung entfernen, Mindestabstände nachziehen.
- Prüfung: Durchstich in der Fläche = 0, kein Loch aus irgendeinem Blickwinkel, Speicherzahlen nach zwölf Aussehenwechseln unverändert (Probe wie in 2.9.33).

### Phase 3 – Sockets und Ausrüstungsdaten

- Halterungs-Knoten und Ankerpunkte, Hautpunkt-Anker für Knoten, Schnalle, Schulterstücke.
- `data/equipment.ts`, `loadoutFromLook`, `Character.equip`.
- Hüte, Schmuck, Laterne und Waffen auf Sockets umstellen. Aussehen bleibt gleich, Bildtafeln aus Phase 0 dienen als Vergleich.

### Phase 4 – Fehlende Teile und saubere Säume

- Säume als Linie, Auswahl nach Gewichtssumme (5.7 Punkte 2 und 3), behebt F2 und F3.
- Neue Hüllen: Uniformrock, Sandalen (Schuhe der Grundfigur aus, Riemen als Hülle), Armschienen, Beinschienen.
- Starre Rüstungsteile: Brustplatte, Schulterplatten, Schild als Gegenstand.
- Mantelschöße: eigene Gewichte mit Anteil Becken, damit sie beim Schritt nicht aufreißen (C8); optional einfaches Pendeln über zwei Hilfsknochen.
- Inventar auf sieben Plätze, Spielstand Version 11 mit Migration.
- Editor: Halstuch, Handschuhe und Narbe auch für Anime-Figuren.

### Phase 5 – Abnahme

- Prüfwerkzeug aus Phase 0 erneut, Vorher-Nachher-Tabelle ins `CHANGELOG.md`.
- Alle vier Qualitätsstufen, Hochformat am Handy und Desktop.
- Bildrate und Zeichenaufrufe mit 30 Figuren im Bild (Hafenstadt, Enterkampf) gegen den Stand vor Phase 1.
- Speicherprobe: wiederholtes Erscheinen und Entfernen, Zahlen aus `renderer.info.memory` bleiben gleich.

---

## 8. Offene Punkte und Risiken

- **Nichts davon ist gemessen.** Phase 0 kann die Reihenfolge der Ursachen verschieben. Sicher sind C1, C3, C4, C7, C8, Z1, Z2, F1 bis F4 im Mechanismus; wie oft sie im Spiel auffallen, ist offen.
- **Schultern (A1):** Lässt sich die Schulter sauber aus den KayKit-Clips ableiten (das Quellskelett hat keinen eigenen Schulterknochen), oder braucht es eine Regel „Schulter folgt dem Oberarm zu 30 %“? Erst nach Phase 2 entscheiden, wenn sichtbar ist, was übrig bleibt.
- **Schnitt am Saum (5.7 Punkt 2)** ist der aufwendigste Teil. Er steht deshalb in Phase 4 und nicht vor der Maske.
- **Weibliche Grundfigur:** Der Rock ist ausgeblendet und durch die erzeugte Hose ersetzt. Ein Rock oder Kleid als Gegenstand bräuchte eigene Gewichte wie die Mantelschöße.
- **Haare:** Starr am Kopf, lange Frisuren schneiden bei gesenktem Kopf in Schultern und Mantelkragen. Gehört nicht zu diesem Bauplan, wäre ein eigener Schritt (Haarknochen pendeln lassen).
- **Arbeitsregel 13:** Phase 2 bis 4 sind größere Schritte. Vor jeder Phase kurz den Plan zeigen und auf Zustimmung warten.
