# Was ist neu

## 4.8.0 – Phase 4.8A: Die geteilte See wird lebendig – MMO-Schicht für einen echten Server, Gruppen von 2 bis 5 Spielern nach der Diplomatie der Welt-KI, Rechtsklick-Spielermenü mit „Betrachten“ und Mehrkanal-Chat (27.11.2026, nur lokal)

**Was du siehst**
- **Andere Kapitäne in der geteilten Welt:** Sobald sich die private Ankerglück-Instanz auflöst, sind andere Spieler da – zu Fuß in Ankerglück und mit eigenen Schiffen vor dem Hafen, mit der Flagge ihres Teams. Ohne Server bevölkern zwölf Kapitäne aller fünf Mächte und ungebundene Neulinge die See (darunter verbündete, neutrale und verfeindete Nationen zum direkten Ausprobieren). Öffnest du das Spiel in **mehreren Browser-Tabs**, teilen sie sich in Echtzeit eine Welt: Ihr seht euch, chattet und bildet Gruppen über die Tabs hinweg.
- **Rechtsklick auf einen Mitspieler** – in der 3D-Welt, auf sein Schiff, auf sein Zielfenster oben, auf seinen Namen im Chat oder auf sein Gruppenfenster (am Handy: lange drücken) – öffnet das Spielermenü: **In Gruppe einladen**, **Flüstern**, **Betrachten**, **Anvisieren**, als Anführer **Zum Anführer ernennen** und **Aus Gruppe entfernen**, beim Anführer auf See **An Bord gehen (mitfahren)**. Auf dir selbst bzw. im Gruppenkopf („⋯“): **Gruppe verlassen**.
- **Gruppen nur, wenn die Welt-KI es erlaubt:** Einladen geht bei gleicher Nation, Bündnis oder neutralen Beziehungen (auch mit Neulingen vor dem Rat der Gesandten). Herrscht zwischen euren Nationen **Krieg**, steht im Menü „In Gruppe einladen — Gesperrt (Kriegszustand)“ – und auch der Server weist jede Einladung ab. **Bricht Krieg aus, während ihr gemeinsam unterwegs seid**, erscheint ein Warn-Banner mit 30 Sekunden Schutzfrist (ein laufendes Gefecht wird noch zu Ende gekämpft), danach trennen sich die verfeindeten Mitglieder.
- **Gruppen von 2 bis 5:** Einladung mit 30-Sekunden-Balken und **Annehmen** / **Ablehnen**, dazu `/einladen Name` (`/invite`) und `/verlassen` (`/leave`). Geht der Anführer, wandert die Krone weiter; unter zwei Mitgliedern löst sich die Gruppe auf.
- **Gruppenfenster links:** bis zu vier Mitstreiter mit Name, Stufe, Klassen- und Rollen-Zeichen, Lebens- und Willenskraft-Balken in Echtzeit, Anführer-Krone, Wappenfarbe der Nation und Ort mit Entfernung. **Ein Klick visiert das Mitglied an** – ideal für gezielte Priester-Heilungen. Auf See wird das Fenster kompakt.
- **Gemeinsam stark:** In der Gruppe und unter Verbündeten gibt es keinen Eigenbeschuss, Priester-Heilungen und das Sturmhorn wirken auf Mitstreiter in der Nähe (gezielt auf ein angewähltes Gruppenmitglied), Abschüsse, versenkte Schiffe und Kriegspunkte zählen für die ganze Gruppe in der Nähe – auch für die Live-Kriegs-Einsätze.
- **Gemeinsam segeln:** Gruppenmitglieder fahren im eigenen Schiff im Verbund oder gehen **an Bord des Anführer-Schiffs** und laufen dort frei an Deck mit („Zurück an Bord deines Schiffs“ mit [R] oder `/vonbord` – ein Beiboot bringt dich längsseits zurück). Mitfahrer anderer Spieler stehen an Deck ihres Anführers.
- **Schutzzonen:** Ankerglück und die Hauptstadt-Häfen der fünf Mächte sind friedlich – dort gibt es keinen Kampf zwischen Spielern. Spieler gegen Spieler gibt es nur zwischen Nationen im Krieg.
- **Chat unten links** (halbtransparent, am Handy ein einklappbarer Knopf mit Zähler, der ausgeklappt nie die Touch-Knöpfe verdeckt): **/s** Sagen (weiß, 80 m an Land, 350 m auf See), **/p** Gruppe (hellblau), **/w Name Text** Flüstern (magenta), **/1** bzw. **/welt** Welt (gold). Namen sind anklickbar (Flüstern) bzw. per Rechtsklick ein Spielermenü. Die **Eingabe-Taste** öffnet den Chat (wenn keine Handlung ansteht), „/“ öffnet ihn mit einem Befehl, **Taste R** antwortet auf ein frisches Flüstern. `/hilfe` zeigt alle Befehle. Die Kapitäne grüßen, antworten auf Flüstern und laden dich ein, wenn du sie darum bittest.

**Technik (für Entwickler)**
- **Protokoll** `net/mmoProtocol.ts` (rein): Absichten `ClientIntent` (hello, state, chat, invite/reply/leave/kick/promote, inspect, heal, horn, share, ride/unride, hit, ping, bye) → Nachrichten `ServerMsg` (welcome, snap = `WorldSnapshot`, profiles, party = `PartyEvent`, vitals, chat = `ChatMessage`, inspect, heal, horn, share, hit, ride, notice, pong); alles von außen läuft durch `cleanIntent`/`cleanServerMsg` (Kennungen, Zahlengrenzen, gesäuberte Texte, 64 KB). Zahlen in `MMO` (Interessenbereich 600 m an Land / 2 400 m auf See, Schnappschüsse 18 Hz, Zustand 15 Hz, Interpolations-Verzug 0,12 s, Gruppe 2 – 5, Einladung 30 s, Schutzfrist 30 s bis höchstens 120 s, Sagen 80/350 m, Figuren-Pool 8, Schiffe in 3D ab 1 500 m bis 1 900 m).
- **Autoritativer Shard** `net/mmoAuthority.ts` (rein, auch für einen Node-Server): Interessenbereich je Empfänger mit wiederverwendeten Schnappschuss-Einträgen, Steckbriefe nur bei Änderung, Gruppen, Einladungen, Kriegsausbruch (`partyConflicts`, Warnung, Entwarnung), Chat-Routing mit Spam-Schutz, Heilung/Sturmhorn/geteilter Fortschritt, Mitfahrt (nur Gruppe, nur beim Anführer, 160 m, gültige Deck-Lage; eine nicht erlaubte Mitfahrt im Zustand wird verworfen), Spieler gegen Spieler (`pvpBlock`), Zeitüberschreitung 15 s. Regeln rein in `net/partyRules.ts` (`stanceOf`, `groupAllowed`, `alliedStance`, `partyConflicts`, `safeZoneAt`, `pvpBlock`, `rideToWorld`/`worldToRide`/`rideSlot`); die Welt-KI liefert `FactionWarEngine.partyStance`.
- **Transporte** `net/mmoTransport.ts`: `WebSocketMmoTransport` (`VITE_MMO_SERVER_URL`; Wiederverbinden mit wachsender Pause 1 – 15 s, Herzschlag 5 s, Latenz, Server-Uhr für die Interpolation, Warteschlange für Chat und Gruppe, Abmelden beim Schließen) und `LocalShardMmoTransport` (Standard: BroadcastChannel zwischen Tabs, der älteste Tab leitet und rechnet Shard und Kapitäne, Übergabe beim Schließen, Neumelden unbekannter Tabs, der leitende Tab hält seinen eigenen Kapitän auch ohne Spielschleife). Fabrik `createMmoTransport`.
- **Client** `net/mmoClient.ts` (Ringpuffer `net/snapshotBuffer.ts` je Mitspieler ohne Speicheranforderung, Gruppen-Spiegel, Einladung, Warnung, Chat-Verlauf, Slash-Befehle über `social/chat.ts`, Neumelden nach 8 s ohne Schnappschuss). **Kapitäne** des lokalen Shards in `net/shardBots.ts` (deterministisch; folgen in der Gruppe zu Fuß, im Flotten-Verbund oder an Deck des menschlichen Anführers).
- **Welt** `world/mmoLive.ts`: Figuren nur aus einem vorab angelegten Pool (8, gleiche Programme wie die Stadtbewohner), Schiffe über die Warteschlange (`NavalSystem.queuePeer` mit `mmo`), bewegt nach den Schnappschüssen (`EnemyShip.peer.mmo`: keine KI, `rel`/`harm` aus Gruppe, Diplomatie und Schutzzone; Treffer gehen über `NavalHooks.peerHit` an den Shard). **Figuren-Budget:** sichtbare MMO-Kapitäne ersetzen ebenso viele anonyme Stadtbewohner (`SeaWorld.cullFigures`). Ziel-Erfassung kennt die Art `player` (`TargetHost.players`/`peerInfo`, `TargetLockLive.peekAt` mit Vorrang für Mitspieler beim Rechtsklick). Mitfahrt in `SeaWorld.rideOn`/`endRide`/`carryRider` (zweites `DeckGround`, Mitnahme mit Lage und Drehung des Anführer-Schiffs).
- **Oberfläche:** `ui/chatWindow.ts`, `ui/partyFrames.ts`, `ui/partyPrompt.ts` (Einladung, Kriegsausbruch), `ui/playerMenuUi.ts` (Rechtsklick-Menü, Betrachten), Menü-Modell `social/playerMenu.ts`, Schutzzonen `social/safeZones.ts`, Stile `ui/css/social.css`; Einbindung in `Game` (`startMmo`/`stopMmo`/`mmoTick`, `dockSocial`).
- **Behoben unterwegs:** Die Kampfnähe der Welt (`SeaWorld.nearestFoe` – Kampfmusik, „im Gefecht“) zählte befreundete Schiffe mit (Mitspieler, Marine-Helfer, eigene Flotte, Prisen, Schiffe des eigenen Teams).
- **Prüfung:** 1 418 Tests grün (neu: `tests/mmoDiplomacyPartyAndChat.test.ts`, 40 Tests: Protokoll, beide Transporte mit Attrappen, Diplomatie, Kriegsausbruch, Rechtsklick-Menü und Betrachten, Gruppen-Lebenszyklus, Heilung über das Gruppenfenster, Mitfahrt, Schutzzonen, alle vier Chat-Kanäle samt /r, Kapitäne, Interessenbereich, Interpolation, Leistung), `tsc` und Build fehlerfrei. Shard-Takt mit zwölf Kapitänen und drei Menschen im Mittel unter 1 ms. Browser (Playwright, 1440 × 900 und 390 × 844 Touch): zwölf Kapitäne verschiedener Nationen nach Ankerglück, Rechtsklick auf eine verbündete Kapitänin (Menü, Betrachten), gesperrte Einladung bei Krieg (Menü und Server), angenommene Einladungen (Bündnis, neutral), Klick auf das Gruppenfenster visiert an, alle vier Kanäle mit Taste R, Gruppe verlassen, Mitfahrer an Deck, Mitfahrt beim Anführer, Kriegsausbruch mit Banner und Trennung nach 30 s, zwei echte Tabs über BroadcastChannel, Handy ohne verdeckte Touch-Knöpfe – überall ohne Konsolenfehler, 60 FPS (16,6 ms) mit sieben Kapitänen und drei Schiffen in Sicht. Startzeit im Build bis zum Menü 8,76 – 8,94 s gegen 8,81 – 9,30 s für 4.7E im selben Durchgang; 156 – 157 Programme im Menü, 172 – 173 nach dem Vorwärmen.
- **Nicht geprüft / offen:** kein echtes Handy und kein echter Server (der WebSocket-Weg ist mit einer Attrappe getestet; der Server selbst ist eine eigene Aufgabe); Spieler gegen Spieler gibt es auf See (Kanonen), zu Fuß sind Mitspieler noch nicht angreifbar; Mitspieler zeigen ein Aussehen aus dem Figuren-Pool (das eigene Aussehen über das Netz folgt später).
- **Prüfskripte:** `qa_tmp/m48_setup.js` (Aufbau), `m48_menu.js` (Rechtsklick, Betrachten, Einladungen, Gruppenfenster), `m48_chat.js` (Kanäle, Taste R, Verlassen, Bildzeit), `m48_sea.js` und `m48_seaview.js` (See, Mitfahrt, Kriegsausbruch), `m48_mobile.js` (390 × 844), `m48_tabs.js` (zwei Tabs), `m48_startup.js` und `m48_startup_ab.js` (Startzeit, A/B).

## 4.7.6 – Phase 4.7E: Eine Welt im Krieg, die nie stillsteht – Nachschub-Konvois, Patrouillen und Blockaden mit echten Mitteln, der Rat der Gesandten (einmalige Team-Wahl), Live-Kriegs-Einsätze per Funkspruch, fünf Hauptkampagnen mit offenem Horizont und ein Shader-Cache für den Spielstart (26.11.2026, nur lokal)

**Was du siehst**
- **Die fünf Mächte handeln jetzt ununterbrochen – auf der ganzen Karte, auch weit weg von dir:** England, die Niederlande, Deutschland, Frankreich und Kurogane verwalten ihre Inseln, ernten Rohstoffe, schicken **Patrouillen** über ihre Seewege, **Nachschub-Konvois** (Begleitschiff plus Transporter) von ihren Produktions-Inseln zur Front und zu ihren Belagerungen, legen **Seeblockaden** vor feindliche Häfen, starten Invasionen und schlagen nach einem Inselverlust mit einem **Gegenschlag** zurück. Auf der Seekarte siehst du alles live: Patrouillen als kleine Pfeile, Konvois als Kisten mit Wimpel, Blockaden als gestrichelter Ring um den gesperrten Hafen. In deiner Nähe werden daraus echte Schiffe.
- **Nichts kommt aus dem Nichts:** Jede Flotte, jede Reparatur, jede Verstärkung einer Garnison und jede Invasion kostet die Nation echtes Gold, Kanonenstahl, Hartholz, Segeltuch, Proviant und Rekruten. Wer pleite ist, läuft nicht aus. Jede Macht hat feste Obergrenzen für Schiffe und Truppen auf See. **Versenkst du einen Konvoi, hungert die Front:** Die belagernde Flotte verliert Moral, ohne Proviant bricht ihre Belagerung zusammen. Eine blockierte Insel liefert nichts mehr an ihre Kriegskasse.
- **Der Rat der Gesandten – einmal und für immer:** Nach „Kapitel 0: Leinen los“ bittet dich Bürgermeister Gerstenkorn in den Ratssaal von Ankerglück (oder du öffnest den Rat im Hafenmenü). Fünf Gesandte stellen ihr Team vor – mit Leitspruch, Stärken und der aktuellen Lage im Krieg. Die Marine ist als versiegelter Pfad zu sehen (kommt mit einem späteren Story-Update). Vor dem Schwur erscheint ein Bestätigungs-Dialog: **„Einmalige Entscheidung — Du verpflichtest dich dauerhaft diesem Team und kämpfst fortan an seiner Seite“**. Danach ist kein Wechsel mehr möglich; in der Kapitänstafel steht deine Team-Plakette.
- **Dein Team ist dein Verbündeter:** Seine Kriegsschiffe, Hafenwachen, Trupps und Inseln sind grün im Zielfenster („Verbündet“). Du kannst ihnen **keinen Schaden** zufügen – weder mit Kanonen, Rammstößen, Kombos, Formen, Geistes-Faji noch mit Ultimates. Die Kriegsschiffe deines Teams greifen dich nie an, helfen dir gegen Feinde, und an Belagerungen deines Teams kämpfst du automatisch auf seiner Seite. Wer mit deinem Team im Krieg liegt, ist dein Feind. Kopfgelder deines Teams sind vergeben, seine Festungen und sein Kaiser sind sichere Häfen.
- **Live-Kriegs-Einsätze per Funkspruch:** Greift ein Feind eine Insel deines Teams an, läuft eine große Invasion deines Teams aus, schickt jemand einen großen Nachschub-Konvoi oder blockiert einen Hafen, meldet sich sofort ein **Funkspruch** oben im Bild – mit Marker auf Kompass, Minikarte und Seekarte. Arten: **Insel-Verteidigung**, **Invasions-Unterstützung**, **Konvoi-Geleitschutz**, **Nachschub-Sabotage** und **Blockade brechen**. Die Ziele kommen aus der echten Welt: Versenken die Schiffe deines Teams Angreifer, sinkt die Zahl im Auftrag genauso wie bei deinen eigenen Treffern. **Fällt deine Insel trotzdem, schlägt der Auftrag um in „Gegenangriff: Insel zurückerobern“.** Wird der Angriff abgewehrt, gibt es sofort Lohn: Gold, Erfahrung, Ehre, Ansehen beim Team und ein Ausrüstungsstück. Zielhilfe: Mit Tab oder Mausklick erfasst du feindliche Kommandoschiffe und Konvois, deine Verbündeten bleiben sicher.
- **Auftragsbuch (L):** neuer Reiter **„Krieg“** mit allen Live-Einsätzen (Ziel, Richtung, dein Beitrag, Lohn, „Verfolgen“), oben der Kopf deiner Hauptkampagne mit Bilanz; die Gruppen heißen jetzt „Hauptkampagne“, „Legende der Sturmkrone“ und „Nebenaufträge“.
- **Fünf Hauptkampagnen (Stufe 3 → 60+):** Jedes Team hat sieben Kapitel mit eigenen Kommandanten (zum Beispiel Großadmiral Hagen von Adlerstein für Deutschland, Admiralin Eleanor Ashcombe für England) und einem Erzrivalen, dessen Admirale die feindlichen Kommandoschiffe führen: vom Treueschwur im Heimathafen über Grenzgefechte, die Audienz in der Hauptstadt, befreite Küsten und die Jagd auf den feindlichen Admiral bis zum **Sturm auf die Kaiserzitadelle des Rivalen** im fünften Ring. Kapitel VII „Über den Horizont“ führt an die Sturmmauer: Das Spiel endet nicht – die **Unbekannten Äußeren Meere** erscheinen auf der Seekarte, die Kriege laufen weiter, künftige Kapitel und Raids schließen dort an.
- **Spielstart flüssiger:** Beim Wechsel zwischen VS-Face-Off, Editor, Klassen-Showcase und Spielwelt werden keine Nachbearbeitungs-Shader mehr neu übersetzt (vorher rund 16 je Bühne).

**Technik (für Entwickler)**
- **Welt-Simulation** (`world/factionWarEngine.ts`): neue Zwecke `patrouille`/`konvoi`/`blockade` neben `angriff`/`entsatz` im selben `ArmadaState` (Felder `cargo`, `supplies`, `until`, `counter`, `delivered`, `lane`; Status `blockade`), Insel-Feld `blockadeId`, Nation `counter`/`focus`/`patrolAt`/`frontAt`/`blockadeAt`, Zustand `allegiance` (Spieler → Team). Entscheidung je Nation: `siegeSupply` (Nachschub laufender Belagerungen zuerst) → `militaryBrain` (Entsatz auch gegen Blockaden, Bündnisfall, Gegenschlag, Offensive mit Kampagnen-Kriegsziel) → `logistics` (Front-Konvoi, Patrouillen, Blockade, Abfangen). Gemeinsamer Stapellauf `commission`; Konvois ohne kampffähige Begleiter werden gestellt und gekapert (`huntable`, `convoyLost` mit Beuteanteil), versenkte Transporter nehmen ihren Ladungsanteil mit, `deliver` bringt Proviant/Medizin/Rekruten zur Belagerung bzw. Garnison und Kriegsrohstoffe ins Lager (Front-Depot). Reparaturen über `payRepair` (Anteil `repairK` der Baukosten; reicht das Lager nicht, wird abgewrackt), Garnisons-Verstärkung kostet Rekruten, Gold und Proviant. Laufzeitmessung `perf` (letzter/Mittel/Höchstwert je Schritt), keine Zuweisung je Takt (Arbeitsfelder `loadScratch`, `bag`, `planScratch`; neue Objekte nur beim Auslaufen und bei Meldungen). Neue Meldungen `konvoi`, `blockade`, `gegenschlag`, `versenkt`; `kriegspunkte` trägt die Insel.
- **Obergrenzen:** `WAR_CAPS` in `data/balanceConfig.ts` (30 Schiffe und 260 Truppen je Nation auf See, 2 Patrouillen, 3 Konvois, 1 Blockade, 36 Verbände insgesamt, Garnison bis 1,35 ×); militärische Verbände lassen Platz für einen Nachschub-Konvoi. Logistik-Zahlen in `WAR_LOGI` (`data/nations.ts`), Namen `PURPOSE_LABEL`.
- **Dauerhaft aktiv:** `SeaWorld.updateWar` rechnet die Engine auch in der privaten Einführung und während eines Raids (nur Daten); nur Titelbild und Prolog-Bühne ruhen. Echte Schiffe weiter nur in der geteilten Welt; Inseln, die während eines Raids fallen, werden danach neu eingekleidet (`warRestyle`). Meldungen in der privaten Instanz und im Raid sind still.
- **Team-Treue:** `data/allegiance.ts` (rein: `TEAM_IDS`, `ALLEGIANCE_PATHS` mit gesperrtem Marine-Pfad, `pledge`, `canSwitch`, `cleanAllegiance`, `councilCards`, `PLEDGE_TEXT`, `PLEDGE_STANDING`), Auftrag `rat` (nach `k0`, Schritte `talk gerstenkorn` → `pledge`), Fenster `Menus.showCouncil`/`showPledgeConfirm`, Ablauf `Game.openCouncil`/`pledgeTeam`/`applyAllegiance`, Plakette `Hud.setTeam`. Verbündete: `NavalSystem.teamPower`/`isTeamShip`/`warFoes` (nur `Game.syncAllies` setzt sie; Team-Schiffe `ally` in `relationOf`, nie provoziert, helfen über `helperFoe`, keine Kopfgeldjäger des Teams), `TargetLockLive.fillTeamSquad` und Hafenwachen (`GUARD_ROLES`) grün, `SeaWorld.alliedSquads`, `spawnFortress`/Kaiser des Teams ohne Kampf, kein Raid gegen das eigene Team, Engine `helperSide`/`joinSiege`/`contractOffers`/`beneficiaryOf` nach Team.
- **Live-Kriegs-Quests:** `story/warQuests.ts` (rein, JSON: `WarQuestState`, `WarQuestDirector.update` erzeugt, führt und beendet Aufträge aus Armadas, Konvois, Blockaden, Belagerungen und Besitz; Umschlag `turn` → `gegenangriff`; Teilnahme `join` für Gruppen bis 5, `contribute`/`presence`/`merit`, `rewardFor`/`markPaid`). Spiel-Seite `Game.stepWarQuests` (alle 0,5 s), `warQuestEvent`, `payWarQuest` (Gold, EP, Ehre, Ansehen, `rollLootGear`), Funkspruch-Banner `ui/radioBanner.ts`, Kompass/Minikarte `PoiKind 'warquest'`, Seekarte (`WorldMapData.team`/`warQuests`/`horizon`, `wars.blockades`, Logistik-Arten).
- **Kampagnen:** `data/campaigns.ts` (Kommandanten `COMMANDERS`/`COMMANDER_BY_ID`, `flagshipName` für Kommandoschiffe, `CAMPAIGNS` mit Erzrivale, Heimathafen, Hauptstadt und Kaiserzitadelle, `campaignQuests` → `CAMPAIGN_QUESTS`, `CHAPTER_LEVELS`, `OPEN_HORIZON`). Neue Schrittarten `pledge`, `war`, `flagship`, `liberate`, `level`, `kaiser`, `horizon` (`QuestDef.team`/`campaign`; `QuestSystem` mit Team-Filter `foreign` und Abfrage `poll` für Stufe und Entfernung). Offener Horizont: `Game.openHorizon` statt Abspann.
- **Shader-Cache:** `render/postChainCache.ts` (rein: `postChainKey`, `PostChainCache`) – eine Pipeline je Grafik- und Sparstufe; `GameRenderer.setView`/`setEffectSources` hängen Szene, Kamera, Sonne (Ersatz-Lichtquelle mit Gewicht 0 auf Bühnen ohne Sonne) und Fokus nur um (`composer.setMainScene`/`setMainCamera`, `AoPass`/`SsrPass` mit `mainCamera`-Setter); Tiefenunschärfe und Lichtstrahlen hängen nicht mehr an der Bühne.
- **Spielstand 27:** 25 → 26 legt `progress.allegiance` an (kein Team: der Rat wartet), 26 → 27 `world.warQuests` (leer); `cleanFactionWar` ergänzt die Logistik-Felder, `cleanAllegiance`/`cleanWarQuests` säubern.
- **Behoben unterwegs:** Wurde der Prolog während des Vorwärmens abgebrochen (Menü, Überspringen), lief die Vorbereitung auf der schon abgebauten Bühne weiter (`TypeError: warmAll`) und blendete den Ladeschirm wieder ein – jetzt endet sie still (`PrologueLive.prepare`).
- **Prüfung:** 1 378 Tests grün (neu: `tests/factionCampaignAndDynamicWarQuests.test.ts`, 33 Tests; angepasst: alte Kriegs-Tests zählen jetzt nur militärische Armadas bzw. rechnen die Logistik-Ausgaben ein, Versionsnummern), `tsc` und Build fehlerfrei. Welt-Simulation der ganzen Karte im Test im Mittel unter 1 ms je Schritt, im Spiel 0,27 – 0,32 ms (höchstens 2,8 ms bei Ereignissen). Browser (Playwright, 1440 × 900 und 390 × 844 Touch): Rat mit fünf Teams und versiegelter Marine, Schwur-Dialog mit wörtlichem Hinweis, Team-Plakette, Funkspruch „Insel-Verteidigung“, verbündete deutsche Flotte grün und ohne jeden Schaden (Breitseiten beider Seiten, Ultimate, Zerteilung: 0 Rumpfpunkte verloren, nie provoziert), eine französische KI-Flotte senkt den Auftragszähler live von 9/9 auf 5/9 („Angriff abgewehrt“), Umschlag „Gegenangriff: Clair-Vin zurückerobern“, Auftragsbuch und Seekarte – überall 60 FPS (16,6 ms), keine Konsolenfehler. Nachbearbeitung: 0 neue Programme über Face-Off, Editor, Showcase und Welt (ein Aufbau, fünf Umhängungen). Startzeit im Build bis zum Menü 8,47 – 8,58 s gegen 8,60 – 8,69 s für 4.7D.1 im selben Durchgang (die Rechnerlast war heute höher als bei der Messung von 4.7D.1), 156 Programme im Menü, 172 – 174 nach dem Vorwärmen im Hintergrund.
- **Nicht geprüft / offen:** kein echtes Handy; eine 3D-Seeschlacht bis zum Untergang mehrerer Schiffe dauert Minuten und wurde im Browser über das Daten-Gefecht nachgewiesen; die Kapitel II – VII der Kampagnen sind nur in den Tests durchgespielt.
- **Prüfskripte:** `qa_tmp/e47_stagecache.js` (Shader-Cache), `e47_world.js` (Rat, Einsatz, Verbündete, Eigenbeschuss, Karte, 1440 × 900), `e47_mobile.js` (390 × 844), `e47_radio_mobile.js`, `e47_startup2.js` und `e47_startup_ab.js` (Startzeit, A/B).

## 4.7.5 – Phase 4.7D.1: Anime-„VS“-Face-Off zum Spielstart, eigener Klassen-, Formen- & Ultimate-Showcase, butterweiche Prolog-Kamera und richtig ausgerichtete Admirals-Schiffe (26.11.2026, nur lokal)

**Was du siehst**
- **„Neues Spiel“ beginnt jetzt in drei Schritten:**
  1. **VS-Face-Off – Marine gegen Piraten:** Der Bildschirm ist diagonal durch einen pulsierenden, gezackten Blitz-Riss geteilt, in der Mitte schlägt ein leuchtendes „VS“-Emblem mit sprühenden Funken ein. Links steht der Marine-Rekrut in blau-smaragdgrüner Aura, dahinter im Nebel die sieben Admirale als dunkle Silhouetten mit Randlicht in ihren Farben. Rechts der Piraten-Rekrut in karmesinrot-goldener Aura, dahinter Kapitän Schwarzbart und sechs weitere Piraten-Kapitäne (Rabea Sturmzahn, Odo Knochenbrecher, Ysra Nachtflut, Gerrit Goldkiel, Bram Feuerbart, Lene Windlied). Über der Marine liegt ein Schloss: **„Marine-Pfad — Kommt in einem späteren Story-Update“** – ein Klick zeigt nur eine kurze Info. Ein Klick auf die Piraten lässt die Kamera mit Anime-Speedlines auf den Rekruten zufliegen, eine Weißblende führt in den Editor. Die Figuren entstehen unter einer kurzen Eröffnungsblende („Die Lager formieren sich …“), damit nichts ruckelt.
  2. **Aussehens-Editor:** nur noch Name, Körperbau, Geschlecht, Gesicht, Frisur, Bart, Hut, Kleidung und Mantel – **keine Klassen-, Stil-, Waffen- oder Fraktionswahl** mehr, die Figur steht unbewaffnet auf dem Drehteller. Der Knopf heißt **„Weiter zur Klassenwahl“**.
  3. **Klassen-, Formen- & Ultimate-Showcase:** links alle Klassen und Pfade (Faustkämpfer Schnell/Kräftig, Schwertkämpfer mit Doppelklinge, Säbel, Langschwert, Großschwert, Faji-Wirker mit acht Elementen und Priester), in der Mitte ein **Live-3D-Vorschaufenster** mit deiner eigenen Figur, rechts **MMO-Rolle**, **„Worin diese Klasse glänzt“**, **alle 10 Formen** (Form I bis X mit Symbol und Kurzbeschreibung – ein Klick spielt sie vor) und das **Level-60-Ultimate** mit seinen drei Akten. Die Vorschau zeigt nacheinander die Kampf-Kombo, Form I, V und X und dann das Ultimate in seiner echten Kino-Choreografie (Aufladung, Aufbau, Einschlag mit Impact-Frame), etwas verlangsamt, damit man es lesen kann. **„Abenteuer starten“** beginnt den 7-Szenen-Prolog. Faustkämpfer und Faji-Wirker legen ihren Pfad wie bisher in der Einführung endgültig fest; Schwertkämpfer haben ihre Klinge ab Spielbeginn.
- **Prolog: Die sieben Admirals-Flaggschiffe zeigen jetzt mit Bug und Galionsfigur frontal auf „Die Schwarze Krone“** – in der Gewitterfront (Szene 2) kommen die sieben Galionsfiguren auf Grünmarkt und die Kamera zu (die Krone liegt dahinter), in der Schlachtreihe (Szenen 4 – 6) stehen sie wie ein Fächer bugwärts zur Krone, statt ihr das Heck zu zeigen. Beim **Sieben-Farben-Strahl** steigen die Auren von den **vorderen Decks** auf, im Schussmoment entladen sich sieben Farbblitze von den Bugdecks in den Kern, und von dort schlägt der Strahl in die Krone.
- **Prolog: butterweiche Kamera** in allen sieben Szenen – gleichmäßiges Tempo auf allen Kamerafahrten (kein Mikro-Ruckeln mehr auf langen Fahrten), weiche Ein- und Ausläufe, Blick und Zoom gleiten innerhalb einer Einstellung, der Sichtfeld-Stoß bei Einschlägen springt nicht mehr, und Wellen heben die Kamera ohne Knick an. Schnitte bleiben harte Schnitte.

**Technik (für Entwickler)**
- **Ablauf:** `data/creationFlow.ts` (rein: `CreationFlow` mit `pick`/`toClasses`/`preview`/`back`/`start`, `FACE_OFF_SIDES`, `MARINE_LOCK_TEXT`, `creationOfSpec`, Aufstellung `RECRUITS`/`ADMIRAL_FIGURES`/`PIRATE_FIGURES`, Kamera `FACE_OFF_CAM`), geführt von `Game.openCreation` (Menü „Neues Spiel“) → `openFaceOff` → `openEditor(slot, resume)` → `openShowcase` → `newGame`; `Game.creationView` für Prüfungen.
- **Face-Off:** `world/faceOffStage.ts` (`FaceOffStage extends EditorStage` – gleiche Studio-Lichter wie der Editor, darum keine eigenen Figuren-Programme; eine Figur je Bild, Hintergrund-Gestalten rechnen jedes zweite Bild, Randlicht über `setTint`/`setHeroRim` der Effekt-Kopien, Effekte über die geliehenen Pools) und `ui/faceOffScreen.ts` (Riss, VS-Emblem, Schloss, Speedlines, Eröffnungsblende – reines CSS/SVG in `ui/css/creation.css`).
- **Showcase:** `data/classShowcase.ts` (rein: `showcaseOf(spec)` mit Rolle, `SPEC_STRENGTHS`, zehn Formen, Ultimate samt Akten aus `ULTIMATE_CINEMATICS`; `previewScript`), `world/showcaseStage.ts` (Kamera der Ultimate-Akte über `UltimateCinematics.keyPose` in Studio-Maßen, Impact-Frames über `impactMode` → `AnimeImpactOverlay` als Canvas-Filter, Bildmitte per `setViewOffset` im Vorschaufenster) und `ui/classShowcase.ts`.
- **Editor:** `classPicker`, Fraktions-, Stil- und Klingenwahl entfernt; bei der Erschaffung zeigt die Bühne die Figur unbewaffnet (`stageStyle`), Angriffs-Vorschauen nur noch beim Ändern einer bestehenden Figur.
- **Admirale:** reine Geometrie in `world/prologueGeo.ts` (`headingToward`, `bowError`, `fleetFacing`, `bowDeck`, `crownBearing`); `PrologueLive.placeSilhouettes`/`placeAhead` setzen jeden Kurs auf die Krone, `stepCharge`/`fireBeam` arbeiten von den Bugdecks. Die Krone liegt hinter Grünmarkt: `SeaWorld.openSeaSpot(away, minD, dir)` sucht zuerst in der gewünschten Richtung weiter hinaus und weicht erst dann seitlich aus.
- **Kamera:** `graphics/cineSmooth.ts` (rein: `shotEase` – Quintik und Sinus-Bögen, `smoothDamp`, `CineDamp` für Blickrichtung und Sichtfeld mit `cut()` an jedem Schnitt, `punchOffset`, `smoothMax`, `SHOT_ARC_DIVISIONS` = 2 400 Stützstellen der Bogenlängen-Tabelle statt 200).
- **Prüfung:** 1 345 Tests (neu: `tests/faceOffCreationAndPrologueShips.test.ts`, 25 Tests), `tsc` und Build fehlerfrei. Browser (Playwright): Einstieg in 1440 × 900 und 390 × 844 (Touch) ohne Konsolenfehler, ruhige Bildzeit 16,6 – 16,7 ms (60 FPS) in Face-Off und Showcase samt Ultimate; Prolog Szene 1/2/5/6 im Mittel 16,7 ms, höchstens 17 ms; alle sieben Bugs zeigen in Szene 2, 5 und 6 auf 0,00° genau auf die Krone. Startzeit im Build: Menü nach 6,8 – 6,9 s, 170 – 171 Programme. Der Einstieg selbst legt wie der bisherige Editor beim Bühnenwechsel die Nachbearbeitungs-Programme neu an (Renderer baut den Composer bei `setView` neu auf).
- **Prüfskripte:** `qa_tmp/k47d1_creation.js` (Ablauf 1440 × 900), `k47d1_mobile.js` (390 × 844, Touch), `k47d1_ships.js` (Ausrichtung und Bildzeiten Szene 2/5/6), `k47d1_progs.js` (Programme alt gegen neu).

## 4.7.4 – Phase 4.7D: Der Prolog als Kinofilm in sieben Szenen, das Flaggschiff „Die Schwarze Krone“, die Spaltung des Ozeans, Erwachen in der Ich-Sicht und eine aufgewertete Einführung in Ankerglück (26.11.2026, nur lokal)

**Was du siehst**
- **Ein Ladebildschirm, bevor der Film beginnt:** drehende Kompassrose, rollende Wellen und ein Fortschrittsbalken mit Text („Grünmarkt wird errichtet …“, „Die Partitur wird gestimmt …“). In dieser Zeit lädt und übersetzt das Spiel alles, was der Prolog braucht – Texturen, Shader, Modelle und den Soundtrack. Danach läuft der Prolog ohne Nachladen und ohne Ruckler bis an den Strand.
- **Der Prolog ist neu – sieben Szenen wie im Kino:**
  - **21:9-Kinobalken** in allen Film-Szenen; nur wenn du an Deck selbst läufst, fahren sie weg.
  - **Kamerafahrten** auf weichen Bahnen, Zoom-Fahrten (Vertigo-Effekt über den Dächern, Dolly-Zoom auf den Kern der sieben Auren) und Licht, das mit der Geschichte wechselt: goldene Abendstunde → eiskaltes Gewitterblau → roter Brandschein → Sieben-Farben-Spektrum → Licht unter Wasser → warmes Hoffnungslicht.
  - Unten rechts dezent „**Prolog überspringen**“.
  1. **Grünmarkt im Sonnenuntergang:** eine friedliche Hafenstadt mit Fachwerkhäusern am Hang, Kapelle auf dem Hügel, Kaimauer, Laternen, Stegen, schaukelnden Booten und Menschen bei der Arbeit. Dazu ruhiges Klavier und Schwarzbarts Stimme: „Das Leben …“ – „Das Leben kann so schön und ruhig sein …“ (eine tiefe Trommel setzt ein) – „So viele Menschen, die wir lieben und kennen …“ – „Doch wenn der Wind sich dreht …“ (die Trommeln werden schneller, das Klavier verklingt) – „… sind auch die sichersten und ruhigsten Häfen …“. Dann bricht die Musik ab: 1,2 Sekunden völlige Stille.
  2. **Die Gewitterfront:** Die Kamera steigt über die Dächer, am Horizont zieht eine pechschwarze Wand aus Nebel und Gewitter auf. Darin leuchten nacheinander die riesigen Silhouetten der sieben Admirals-Flaggschiffe auf – in Purpurrot, Abgrund-Violett, Sonnengold, Gletscher-Cyan, Sturm-Smaragd, Obsidian-Magenta und Strahlendem Weißgold. Genau auf dem Wort „Tod“ in „… dem Tod geweiht!“ bricht der Endkampf-Soundtrack los.
  3. **Die Vernichtung:** Salven, die sieben Elementar-Angriffe, brennende Häuser, Kämpfe in den Gassen, einstürzende Giebel, sieben Farbstrahlen aus dem Himmel – am Ende Ruinen unter Rauch. Die Musik verklingt, harter Schnitt.
  4. **Schwarzbarts Gegenangriff:** Heldenfahrt auf Kapitän Schwarzbart, Nahaufnahme mit glühenden Augen: „**WIR LASSEN SIE NICHT DAMIT DURCHKOMMEN!**“ – ein hoffnungsvoller Orchester- und Trommeltrack setzt ein. Die Schwarze Krone jagt durch den Sturm, die Balken fahren weg und du bist dran: „**AN DIE KANONEN!**“ – lauf zu deiner freien Kanone (Backbord, mittschiffs). Wer zu lange braucht, bekommt einen Hinweis vom Geschützmeister; verlieren kann man den Prolog nicht.
  5. **Das Vereinte Admirals-Urteil:** Die sieben Admirale bündeln ihre Auren zu einem Sieben-Farben-Strahl. Die Kamera rast hinter dem Strahl her, der die Schwarze Krone vom Bug bis zum Heck spaltet. Schnitt auf die Vogelperspektive: Der Ozean ist bis auf den Meeresgrund geteilt – dunkle Wasserwände, an denen Schaum herabrinnt –, die Hälften kippen auseinander. In Zeitlupe fällst du ins Wasser, dazu ein trauriger, leise hoffnungsvoller Engelsgesang.
  6. **Schwarzbarts Schwur:** Unter Wasser, Nahaufnahme: „Es wird jemand kommen …“ – „… jemand kommen …“ – dann eine schwarze Druckwelle aus Willenskraft: „**ES WIRD JEMAND KOMMEN, DER EUCH AUFHÄLT!**“ Trommeln und Chor setzen ein, sieben schnelle Schnitte zeigen die Admirals-Schiffe, die vor der Welle zurückweichen. Danach sinkst du im wärmer werdenden Licht.
  7. **Erwachen am Strand:** Ich-Sicht – die Lider öffnen sich blinzelnd, das Bild wird langsam scharf, kein Ton außer dem Meer. Dann stehst du auf und hast die Steuerung.
- **Kapitän Schwarzbart** ist 1,65-mal so groß wie eine normale Figur: schwerer dunkler Kapitänsmantel, dichter Vollbart, Dreispitz, Augen, die vor Willenskraft violett glühen, und eigene Mimik für Schrei und Schwur.
- **Die Schwarze Krone:** rabenschwarzer Rumpf, pechschwarze Segel, ein **gekröntes Seeungeheuer** als Galionsfigur (eiserne Krone, Goldzähne, glimmende Amethyst-Augen), ein verziertes **Kronen-Steuerrad** und schwere Geschütze aus schwarzem Gussstahl mit dunklen Eisen- und Goldbeschlägen. Die Galionsfigur gibt es nur in der Geschichte, nicht in der Werft.
- **Logik des Prologs:** Zu Beginn brennt kein Schiff, keine Marine-Soldaten stehen an Deck und dir folgen keine eigenen Truppen. Du bist ein Schiffsjunge in Leinenhemd, Leinenhose und einfachen Schuhen inmitten von Schwarzbarts riesiger Piraten-Crew. Alle Texte sind deutsch.
- **Die Einführung „Ankerglück“ (Stufe 1 → 3) ist aufgewertet:**
  - **Hinnerk** begrüßt dich am Strand, erkennt den Schiffbrüchigen von der Schwarzen Krone und schickt dich mit deinem ersten Hauptauftrag zu Bodo.
  - **Bodo** schmiedet dir am Amboss dein Klassen-Werkzeug – Hammerschläge mit Funkenflug, dann glüht das fertige Stück auf („Erste Klinge!“ bzw. dein Faji-Fokus).
  - **Waffenmeister Konrad** erklärt auf einer Lehrtafel **deine eigene Klassen-Kombo** (mit den echten Namen der Schläge aus 4.7C), den Sturm-Schritt, die Zielerfassung mit Tab oder Klick und den Klassenbaum. Mit Stufe 2 öffnet sich dein **Sternbild-Klassenbaum** von selbst für den ersten Talentpunkt; Faustkämpfer wählen vorher ihren Pfad.
  - **Hafenmeisterin Ilse** übergibt dir die ranzige Schaluppe. Du heuerst deine **erste kleine Crew** an (Navigatorin Mira und vier Deckmatrosen), am Steuer erklärt eine Lehrtafel alle Schiffsanzeigen (Segel, Kompass & Karte, Rumpf, Segeltuch, Breitseiten, Crew & Moral), dann folgt ein **Küstengefecht** gegen ein Kurogane-Spähboot.
  - **Bürgermeister Gerstenkorn:** Schwarze Kurogane-Segel tauchen vor der Bucht auf. Ein **Kriegsschiff beschießt Steg und Hafenkante** (Alarmglocke, Einschläge mit Gischt, Splittern und Rauch), dann landet der Stoßtrupp. Am Faji-Kristall erreichst du Stufe 3: Faji-Wirker legen ihr Element fest (oder werden Priester), Schwert- und Faustkämpfer erwecken ihre **Geistes-Faji (Q)** – und setzen die neue Kraft sofort im Kampf ein. Danach löst sich die private Instanz in die offene MMO-Welt auf.

**Technik (für Entwickler)**
- **Regie:** `story/prologueDirector.ts` (`PrologueDirector`, rein, Echtzeit-Uhr, feste Ereignis-Plätze in `PrologueOut`, `simulatePrologue` für Tests). Das Drehbuch steht als Taktschläge in `data/prologue.ts` (`PROLOGUE_SCRIPT`: line/music/amb/shot/grade/fx/bars/time/black), die gemeinsamen Synchronzeiten von Bild und Musik in `SCORE_SYNC`, Zeilen in `PROLOGUE_LINES` (Wort für Wort über `words`), Lichtstimmungen in `GRADES`, Kamerafahrten in `SHOTS` (Catmull-Rom in Bühnen-Rahmen `stadt`/`schiff`/`kapitaen`/`kern`/`tiefe`/`figur`/`kopf`, Dolly-Zoom über `dolly`) und `DYNAMIC_SHOTS` (Strahl-Ritt, Admirals-Schnitte, Fall, Sinken, Ich-Sicht).
- **Soundtrack:** `audio/prologueScore.ts` – sieben Sätze als reine Notenlisten (`compose`, an `SCORE_SYNC` gebunden), einmal im Ladescreen mit `OfflineAudioContext` gerendert (`renderScore`), Wiedergabe über `PrologueScorePlayer` mit Hall und Abgleich auf die Regie-Uhr (`sync`); der Heldentrack hat einen nahtlosen Endlos-Teil. `AudioEngine.scoreActive`/`scoreOut`/`prologueAmbience` ersetzen die alte Prolog-Partitur.
- **Licht:** `Environment.grade` (Horizont, Zenit, Nebel, Sonne, Himmel, Meer, Belichtung als Anteil über dem errechneten Licht), auch auf die Wolken angewandt.
- **Bühne:** `world/prologueStage.ts` (Grünmarkt: Gelände, Kaimauer, Häuser je Material verschmolzen, Brände, Einstürze, Ruinen, Bewohner; Meeresgrund unter dem Graben), reine Geometrie in `world/prologueGeo.ts` (`frameToWorld`, `gmCoastZ`, `gmHeight` mit ebenen Bauplätzen am Hang), Ablauf in `world/prologueLive.ts` (`prepare` mit Vorwärmen aller Programme und Schlüssel-Einstellungen samt Flotten-Aufstellung, `frame`, Effekte je Takt, Kamera). Overlay `ui/prologueOverlay.ts` + `ui/css/prologue.css` (Kinobalken, Lider, Unschärfe, Ladebildschirm, Wort-für-Wort-Untertitel).
- **Schiffe und Modelle:** `FLAGSHIP_FINISH` in `graphics/pbrMaterialForge.ts`, Galionsfigur `crowned_kraken` (`STORY_FIGUREHEADS`, nicht im Katalog und nicht in der Werft), Prop `steuerrad_krone`, beides aus `tools/blender/build_schwarze_krone.py`; `ShipLook.regal = 'krone'`. `NavalSystem.spawnStage(…, look)` und Bühnen-Schiffe werden nie wegen Entfernung abgebaut; `Ship.keepSpare` (vorgebautes Modell der Schaluppe für den Strand) und `Ship.clearWreck`.
- **Ruckelfreie Schnitte:** keine Kamera-Überblendung bei Regie-Schnitten (`SeaWorld.render`, nur zurück zur Spielerkamera), während des Prologs streamt nur die Umgebung von Ankerglück, die Würfel-Schattenkarte eines ausblendenden Laternenlichts wird nicht mehr gerechnet (`LampPool.update`), Schwarzbarts Effekt-Materialien und der erste Blitz werden im Ladescreen vorgewärmt, die Auftrags-Lichtsäule wartet bis zum Ende des Prologs.
- **Meer:** Die Wände der Ozean-Teilung bleiben Wasser (kein Brechschaum, herabrinnende Schaumfäden), nur der Grund zeigt nassen Meeresboden.
- **Einführung:** `TutorialHost` bekommt `forge`, `coachCombat`, `openTree`, `assault`; der Trupp landet erst nach dem Beschuss (`TUTORIAL.raidShipLead`, `raidSalvos`). `SeaWorld.forgeShow`, `tutorialAssault`, `endAssault` (auch beim Verlassen ins Menü); Lehrtafeln `SHIP_COACH` (sechs Seiten) und `combatCoach`.
- **Tests:** `tests/prologueAndAnkergluckInstance.test.ts` neu (38 Tests: alle sieben Szenen mit exakten Zeilen- und Musik-Übergängen, Stille, Wort-Synchronität, Partitur, Licht, Kamerafahrten über dem Gelände, Grünmarkt, Schiffs- und Ozean-Spaltung, Schwarzbart, Schwarze Krone, Admirale, Prolog-Regeln, Ich-Sicht, Überspringen, aufgewertete Einführung samt Schmiede, Lehrtafel, Sternbild und Kriegsschiff). Insgesamt 1 320 Tests.
- **Geprüft im Browser (Playwright):** der ganze Prolog in Echtzeit auf 1440 × 900 und 390 × 844 (Touch, Pixeldichte 2) – alle Szenen im Mittel 16,7 – 17,2 ms je Bild, Szenenwechsel ohne Einbrüche, keine Konsolenfehler; die Einführung von Hinnerk bis zum Kurogane-Überfall.

## 4.7.3 – Phase 4.7C: Klassenbaum als leuchtendes Sternbild, eigene Kombos für alle 15 Klassen, eine Welt ohne unsichtbare Grenzen und Wasserlaufen zu Fuß (26.11.2026, nur lokal)

**Was du siehst**
- **Der Klassenbaum ist ein Sternbild** (Tasten N und K) statt des Kastenrasters:
  - Die 60 Knoten steigen als Klassen-Pfad von unten nach oben; zwischen den Meilensteinen schwingt jeweils ein kurzer Seitenzweig abwechselnd nach links und rechts aus.
  - **Energie-Leitlinien** verbinden alle Knoten: gesperrt dunkel gestrichelt, freigeschaltet pulsierend in der Farbe deiner Klasse, der nächste Schritt golden.
  - **Stärkungen** sind kompakte sechseckige Edelstein-Sockel mit eigenem Stat-Symbol und Rang-Zähler („Krit-Schaden 4/7“).
  - **Die zehn Formen** sind Rauten-Medaillons mit goldener Fassung, einem mehrfarbigen Emblem deiner Klasse (Klinge, Doppelklinge, Faust, Flamme, Eiskristall, Welle, Wirbel, Blitz, Sonne, Mondsichel, Schwarzes Loch, Heiligenschein), einem Abzeichen für die Art der Form und der Nummer I – X.
  - **Knoten 60** krönt den Baum als gekröntes Apex-Wappen mit kreisendem Aura-Ring.
  - Hinter dem Baum liegt ein dezentes **Wasserzeichen deiner Klasse**: gekreuzte Säbel mit Kompassrose, goldene Kathedralen-Rosette (Priester), lodernde Drachen-Runen (Feuer), eiserne Bastions-Schilde (Großschwert und Kräftiger Faustkämpfer) und so weiter für jede Klasse.
  - Beim Öffnen steht der nächste Knoten in der Mitte; jeder Knoten ist anklickbar und zeigt rechts seine Vorschau.
  - **Kopf und Fußzeile stehen fest**, nur der Baum rollt: „Zurück“ und das neue **„Zurücksetzen“** (zwei Klicks, alle Punkte kommen zurück, Klasse und Element bleiben) sind auf 1440 × 900 und am Handy (390 × 844) immer ganz sichtbar.
- **Keine Welt-Hinweise mehr hinter Menüs:** „Sprechen“-Plaketten und die Aktionsleiste der Welt verschwinden, solange ein Menü offen ist.
- **Umschalt + 1 – 5 löst im Laufen keinen Dash mehr aus:** Umschalt wartet einen Wimpernschlag (90 ms) – kommt eine Zahl, gilt die Form 6 – 10.
- **Eigene Standardangriffe und Kombos für alle 15 Klassen:**
  - **Faji-Wirker kämpfen rein elementar, ohne Fäuste und Tritte:**
    - Feuer: Feuerlanzen, Glutfächer, Flammenspeer und Inferno-Ausbruch.
    - Eis: Eissplitter-Salven, Eislanze und Gletscherbruch.
    - Wasser: Wasserpeitschen, Druckstrahl und Gezeitenbruch.
    - Wind: Windklingen, Klingenfächer, Vakuumschnitt und Zyklon-Ausbruch.
    - Blitz: Blitzbögen, Gabelblitz, Donnerkeil und Gewitter-Ausbruch.
    - Sonne: Sonnenstrahlen, Strahlenfächer, Zenitlanze und Korona-Ausbruch.
    - Mond: wachsende Mondsicheln bis zum Neumond-Ausbruch.
    - Schwarzes Loch: Gravitationssphären, Ereignislanze und Kollaps-Ausbruch.
    - Auch Verzweigungen, der schwere Angriff, die Luft-Kette und der Meteor sind elementar und tragen eigene Namen.
    - Faji-Wirker halten dabei ihren Abstand, statt nach vorn zu rutschen.
  - **Priester:** goldene Lichtlanzen und eine heilige Glyphen-Salve. Der Kombo-Finisher **Gnadenwelle** heilt dich und deine Crew bzw. Truppen in 12 m.
  - **Waffen und Fäuste:**
    - Doppelklinge endet im Kreuzschnitt-Dash quer durchs Ziel.
    - Säbel endet im Luft-Wirbel, der die Luft-Kette eröffnet.
    - Langschwert endet im weitreichenden Iai-Fernschnitt (10 m).
    - Großschwert endet im wuchtigen Überkopf-Spalter mit Schockwelle.
    - Der Schnelle Faustkämpfer schlägt mit Nachbildern.
    - Der Kräftige Faustkämpfer schlägt Erdhaken und endet in der Schockwellen-Faust.
- **Keine unsichtbaren Grenzen mehr:**
  - Vom Strand, von der Kaimauer und von jedem Steg läufst du direkt ins Meer.
  - Über die Reling eines Schiffs springst du ins Wasser.
  - Zäune, Trockenmauern, Fässer, Kisten und Heuballen überspringst du; Häuser, Felsen und hohe Mauern bleiben fest.
  - In der Einführung hält dich keine Wand mehr in der Bucht von Ankerglück, es gibt nur noch eine Erinnerung.
  - Der Sturm am Weltrand bleibt als sichtbare Naturgrenze.
- **Wasserlaufen zu Fuß:**
  - Du läufst und gleitest über das Meer, mit Kräuselringen und Fontänen unter den Füßen.
  - Das kostet Ausdauer: beim Stehen wenig, beim Gehen mehr, beim Laufen am meisten; Dashes kosten wie gewohnt.
  - Bei 0 Ausdauer schwimmst du langsam und ohne Kampf, bis die Kraft zurück ist. Dann steigst du wieder aufs Wasser oder kletterst an Land bzw. an Bord; ein Sprung aus dem Wasser kostet Ausdauer.
  - Jedes Absinken bringt **Seemüdigkeit**, die deine Kraft auf dem Wasser senkt, bis du wieder festen Boden hast. Rund 75 m Laufen reichen für Küstenkämpfe, Hafen-Überquerungen und nahe Schiffe, aber nicht von Insel zu Insel.
  - Erreichst du zu Fuß eine andere Insel, beginnt dort das Inselleben wie nach einer Landung.

**Technik (für Entwickler)**
- **Klassenbaum:**
  - `ui/classTreeGraph.ts` (rein): `treeLayout` (Bögen gleicher Bogenlänge, kein Knoten näher als 46 Einheiten), `buffRanks`, `roman`, Stat-Symbole, Form-Embleme `emblemSvg`/`motifOf`/`patternOf`, `watermarkSvg`.
  - `ui/classScreen.ts` zeichnet das SVG; `ui/css/classes.css` mit `.card.classtree` (Flex-Spalte, feste `.ct-foot`).
  - `Menus.showTalents` rollt zum gewählten Knoten.
  - Neu: `resetClass` und `Game.classReset`.
- **Menüs:** setzen `menu-open` auf `<html>`; CSS blendet `.npcm` und `.hud-ctx` aus.
- **Umschalt:** `core/input/shiftGate.ts` (`shiftVerdict`, `SHIFT_COMBO_MS`); `Input` wertet die Wartezeit in `beginStep` aus.
- **Kombos:**
  - `data/elementCombos.ts` (`elementLight`/`elementBranch`/`elementExtras`, `COMBO_NAMES`, `PRIEST_CHAIN_HEAL`) ersetzt die Faust-Ketten in `artStyle`.
  - `applyMomentum` gibt Faji-Ketten keinen Schub mehr.
  - Physische Finisher sind in `actionStyles.ts` geändert.
  - Heilung meldet die Engine jetzt in `startMove` für jeden Angriff mit `heal`.
  - `swingFx(…, soft)` reißt bei Heilwellen den Boden nicht auf.
- **Grenzen:**
  - `Ground.constrain(…, free)`: freier Läufer ohne Wasserlinien-, Steg- und Relingsklemme (`RAIL_HOP`).
  - `Blocker.low` mit `Built.low`: Zaun 1,0, Mauer 1,35, Kisten 1,1/1,9, Fass 1,0, Fässer 1,05, Heu 1,2. Die Oberkante wird beim ersten Gebrauch gesetzt.
  - `FootWorld` übergibt die Fußhöhe der Spielfigur.
  - `keepOnLeash` erinnert nur noch.
- **Wasserlauf:**
  - Regeln in `data/waterWalk.ts` (`WATER_WALK`, `stepWaterWalk`, `waterRange`, `isWater`).
  - `PlayerFoot.waterY`/`water`/`stepWater`; `FootWorld.height` kennt die Wasseroberfläche bzw. die Schwimmtiefe.
  - `SeaWorld` setzt `waterY` je Bild und erkennt in `updateWhere` den Absprung über Bord und das Ankommen an einer anderen Insel (`leaveIslandOnFoot`).
  - Darstellung über `CataclysmDirector.waterStepFx` (Schaumringe, Gischt, Tropfen; keine neuen Shader).
- **Prüfen:**
  - `tests/classCombosAndOpenWorldWaterWalk.test.ts` (21 Tests); angepasst: Momentum- und Form-Tests der Faji-Künste. Insgesamt 1 306 Tests grün.
  - Browser: `qa_tmp/k47c_tree.js`, `k47c_combos.js`, `k47c_water.js`, `k47c_water_mobile.js`.
  - Start bis zum Menü 6,4 – 7,2 s mit 171 – 172 Shader-Programmen, im Spiel nach drei Testfiguren 185.

## 4.7.2 – Phase 4.7B: feste Klassen mit Rollen, Priester (Schaden & Heilung), 15 Klassenbäume mit je 60 Punkten (10 Formen, Stärkungen, Ultimate) und die Geistes-Faji für alle (26.11.2026, nur lokal)

**Was du siehst**
- **Eine feste Klasse statt Waffenwechsel:** Jede Figur hat genau eine Klasse und eine Spezialisierung. Q wechselt nichts mehr, Z und X gibt es nicht mehr.
  - **Faustkämpfer:** *Schneller Faustkämpfer* (DPS) oder *Kräftiger Faustkämpfer* (Tank-DPS) – die Wahl triffst du in der Einführung bei Waffenmeister Konrad, für immer.
  - **Schwertkämpfer:** die Klinge wählst du bei der Erschaffung – *Doppelklinge* (Assassinen-DPS), *Säbel* (Kombo-DPS), *Langschwert* (Midrange-DPS) oder *Großschwert* (Tank-DPS).
  - **Faji-Wirker:** acht Elemente (Feuer, Eis, Wasser, Wind, Blitz, Sonne, Mond, Schwarzes Loch – Elementar-DPS) oder der neue **Priester** (Licht- & Lebens-Faji, DPS/Heilung). Das Element legt der erste Punkt fest – oder der Faji-Kristall in der Einführung.
  - Die **Rolle** steht bei der Erschaffung auf Karten, im Klassenbaum, oben links in der Anzeige und im Zielfenster anderer Kapitäne.
- **Der Priester:** Heilende Hand (heilt dich), Lichtstrahl, Urteilsspruch, Segenskreis (heilt dich und Verbündete in 10 m), Schutzgebet (Hyper-Armor und Gruppenheilung), Gnadenkranz, Engelsurteil. Sein Ultimate ist das **Erzengel-Himmelsgericht**: Lichtsäulen fallen im Kreis, Gegner werden betäubt, du und deine Verbündeten in 20 m werden um 35 % geheilt – mit eigener Kino-Regie in drei Akten (Lichtschwingen, aufsteigende Kamera, Gericht von oben).
- **Klassenbaum (Tasten N und K):** Das Fenster zeigt nur noch deinen eigenen Baum und den Reiter „Geistes-Faji“ – keine fremden Klassen, Klingen, Faust-Pfade oder Elemente.
  - 60 Knoten in einer leuchtenden Schlangenlinie: an den Knoten 1, 6, 12, 18, 24, 30, 36, 42, 48 und 54 wird je eine **Form** frei, an Knoten 60 das **Ultimate** deiner Klasse. Die 49 Knoten dazwischen sind Stärkungen (Krit-Chance, Krit-Schaden, Max-LP, Angriffskraft, Tempo, Abklingzeit, Rüstung, Ausdauer-Regeneration; beim Priester auch Heilkraft), passend zur Rolle verteilt.
  - Jede Form hat eine Detail-Vorschau: Emblem mit animierter Vorschau (Vorstoß, Welle, Heber, Konter, Wirbel, Heilung …), Rolle, Wirkung, Taste, Abklingzeit und Kosten.
  - Eigene Gestaltung je Klasse: Rune als Wasserzeichen, Wappen, Knotenrahmen (Faust achteckig, Schwert als Raute, Faji rund), Farben der Spezialisierung.
  - „Alle freien Punkte verteilen“ füllt den Baum in einem Zug.
- **Zehn Formen je Klasse:** Die vier bekannten Kampfkünste sind Form 1 – 4; dazu kommen sechs neue je Spezialisierung (insgesamt 90 neue, jede mit eigenem Namen): Vorstoß, Heber, Konter, Flächenschlag, Kontrolle mit dem Element der Klasse und ein aufgeladenes Finale.
- **Aktionsleiste:** Formen auf **1 – 5** und **Umschalt + 1 – 5** (frei umbelegbar, auch als Umschalt-Kombination), anklickbar. Am Handy fünf Form-Knöpfe mit einem Knopf „6–10“ für die zweite Seite. Gesperrte Formen zeigen ihren Knoten („Kn. 12“).
- **Geistes-Faji für alle Klassen** (Q, R, T, G – am Handy eigene Knöpfe, am Gamepad R3 + RT / L3 / B / X):
  - **Q Willens-Entfesselung:** schwarz-goldene Aura, mehr Schaden und Durchschlag.
  - **R Lebensstrom-Fokus:** smaragd-goldene Lebensströme, mäßige Selbstheilung (steht eine Handlung an, gewinnt die Handlung).
  - **T Erwachter Wille:** mehrschichtige Schockwelle mit schwarzen Blitzen, betäubt Gegner in der Nähe und bricht ihre Haltung.
  - **G Königsdruck:** gewaltige Druckkuppel – der Himmel verdunkelt sich, der Boden reißt, Splitter schweben; schwerer Schaden und Furcht, eine Stufe unter einem Ultimate (kein Boss fällt mit einem Schlag, lange Abklingzeit).
  - Rang 1 kommt mit dem Erwachen am Faji-Kristall, Ränge 2 – 5 kosten je einen Punkt aus demselben Topf.
- **Einführung:** Bodo übergibt deine Klassen-Ausrüstung (Kampfhandschuhe, deine Klinge oder einen Faji-Fokus). Faustkämpfer wählen bei Konrad Schnell oder Kräftig, dann öffnet sich ihr Klassenbaum. Am Faji-Kristall legen Faji-Wirker ihr Element fest (auch Priester), und alle Klassen erwecken ihre Geistes-Faji und setzen sie gleich gegen den Kurogane-Stoßtrupp ein.
- **Truppenbefehle** liegen jetzt auf 6, 7 und Z (5 gehört der Form 5); T erfasst kein Ziel mehr (F und mittlere Maustaste bleiben).
- **Alte Spielstände:** Sie laden ohne Fehler. Die Klasse ergibt sich aus dem zuletzt geführten Kampfstil (bzw. der Faji-Kunst in der Hand). Alte Talentbäume und Faji-Techniken werden vollständig erstattet; Stufen, Siegel und Bonuspunkte fließen in den neuen Klassenbaum (bis 60), der Rest bleibt frei für die Geistes-Faji. Wer die Einführung hinter sich hat, hat die Geistes-Faji schon erweckt.

**Technik (für Entwickler)**
- **Daten:** `data/classes.ts` – Klassen, 15 Spezialisierungen mit Rolle/Stil/Rune/Wappen, `classTree` (60 Knoten), Stärkungen `BUFF_INFO`, Geistes-Faji `GEIST`/`GEIST_VALUES`, Spielstand `ClassSave` (erweiterbare `slots`, streng einer), Regeln `learnNext`/`autoFill`/`lockElement`/`chooseSpec`/`learnGeist`/`fitClass`/`cleanClass`/`classFromLegacy`.
- **Formen 5 – 10:** `data/classForms.ts` (`extraForms`, sechs taktische Muster mit den Clips des eigenen Stils); `actionStyles.ts` hängt sie an jeden Stil. `ActionSkill.slot` 1 … 10, `ActionStyleDef.skills` hat zehn Einträge.
- **Priester:** neuer Stil `priester` (`fajiArts.ts`, `PRIEST_STYLE`, Darstellung über das Sonnen-Element), `ActionMove.heal`/`healR`, Ultimate-Art `himmelsgericht` (`cataclysms.ts`, `ULTIMATE_CINEMATICS`, `cataclysmDirector` wie der Sonnentanz), neuer Zustand `stun`.
- **Engine:** `FighterState.formsOpen`/`ultOpen` (`setClass`), Sperre meldet den Knoten; Geistes-Faji `geistRank`/`geistCd`/`willT` (`setGeist`, `ActionInput.geist`, Ereignisse `geist` und `heal`); Stärkungen über `buildTalentCombat(…, ClassCombatFx)` mit den Talent-Obergrenzen, `regenK`.
- **Darstellung:** `CataclysmDirector.geistFx` nur aus vorhandenen AnimeVfxForge-Bausteinen (Ringe, Tusche, Säulen, Splitter, Funken), Verdunkelung über `darken` – keine neuen Shader.
- **Bedienung:** Aktionen `art5 … art10`, `formPage`, `geist1 … geist4`; `swap`, `weapon1`, `weapon2` und `WEAPON_SWAP` sind entfernt. `Input` kennt Umschalt-Kombinationen (`Shift+Digit1`, auch beim Umbelegen). Touch: `TOUCH_FOOT_PAGE2`, `TouchControls.show`.
- **UI:** `ui/classScreen.ts` + `ui/css/classes.css` (ersetzt das alte Talent-Fenster in `Menus.showTalents`), Fighter-HUD mit zehn Formen und Geistes-Leiste, Klassenkarten im Editor.
- **Spielstand 25:** Migration 24 → 25 (`refill`): alte Bäume/Techniken erstattet, Klassenbaum gefüllt, Geistes-Faji außerhalb der privaten Einführung erweckt.
- **Prüfen:** `tests/classTreesAndGeistesFaji.test.ts` (28 Tests); insgesamt 1 285 Tests grün; Browser: `qa_tmp/k47b_classes.js`, `qa_tmp/k47b_mobile.js`. Start bis zum Menü 6,7 – 7,2 s mit 162 – 163 Shader-Programmen.

## 4.7.1 – Ein Kampfstil statt Waffenwechsel: du entscheidest dich zu Beginn und gehst seinen Talentbaum (26.11.2026, nur lokal; mit 4.7.2 abgelöst – der Schalter `WEAPON_SWAP` und der Q-Wechsel zur Faji-Kunst sind dort entfernt)

**Was du siehst**
- **Kein Waffenwechsel mehr per Tastendruck:** Q schaltet nicht mehr durch alle sechs Kampfstile, die Waffenplätze Z und X ruhen. Du kämpfst mit dem Kampfstil, den du beim Erstellen der Figur gewählt hast (in der Einführung bis zu Bodos erster Klinge mit den Fäusten).
- **Die Faji-Kunst bleibt erreichbar:** Sobald am Kristall des Bürgermeisters eine Faji-Kunst erwacht ist, wechselt Q zwischen deinem Kampfstil und der Kunst hin und her (sie ist keine Waffe). Die Anzeige oben links zeigt nur noch dieses Ziel („Säbel · Q → Feuer-Faji“). Am Handy zeigt der Knopf, wohin er wechselt, und erscheint erst mit einer Faji-Kunst. Drückt man Q ohne Kunst, erklärt ein kurzer Hinweis, warum nichts passiert.
- **Talent-Fenster:** Unter „Waffen-Meisterschaften“ bzw. „Faustkampf“ steht nur noch der Baum deines Kampfstils. Bäume, in denen schon Punkte stecken, bleiben sichtbar – ältere Spielstände verlieren nichts und können wie gewohnt zurücksetzen. Faji-Künste, Kapitän & Flotte und der Kosmos-Pfad bleiben unverändert.
- **Aussehens-Editor im Spiel:** Der Kampfstil ist dort nur noch angezeigt („gewählt zu Spielbeginn“), Aussehen, Kleidung und Ausrüstung änderst du wie bisher. Beim Erstellen einer neuen Figur wählst du den Kampfstil wie gewohnt.
- **Nichts ist gelöscht:** Der Waffenwechsel ist nur ausgeschaltet und lässt sich mit einem Schalter vollständig zurückholen.

**Technik (für Entwickler)**
- **Schalter:** `WEAPON_SWAP` in `data/actionStyles.ts` (aus).
  - Der Wechsel-Kreis steht rein in `swapCycle(main, effekt, faji)`, der nächste Stil in `nextInCycle`.
  - `Game.mainStyle`: der Waffenstil in der Hand, sonst der zuletzt gehaltene (`lastWeapon`), sonst der Stil aus dem Editor.
  - `Game.availableStyles` nutzt `swapCycle`, `swapWeapon` ignoriert Waffenplätze, `refreshWeaponHud` und `controlsHint` zeigen nur das Wechselziel.
  - Der Touch-Knopf `swap` wird beschriftet bzw. ausgeblendet.
- **Tastenbelegung:** Die Waffenplätze stehen in `RESTING_ACTIONS` (behalten Namen und Tasten, fehlen nur in `ACTION_GROUPS`). `swap` heißt „Faji-Kunst ↔ Kampfstil“.
- **Talent-Fenster:** `TalentView.weapon`; `treeShown` (eigener Waffenbaum und Bäume mit Punkten) und `firstShown` in `ui/talentScreen.ts`. `Menus.showTalents` wählt nur sichtbare Bäume, `talentStartTree` beginnt beim eigenen Waffenbaum.
- **Editor:** `armorTab` zeigt im Spiel den Kampfstil fest an, `Game.applyLook` ändert dann nur das Aussehen (in der privaten Einführung bleibt das Leinenhemd).
- **Prüfen:**
  - `tests/singleWeaponStyle.test.ts` (Wechsel-Kreis an/aus, ruhende Tasten, Talent-Fenster).
  - `tests/actions.test.ts` kennt ruhende Aktionen.
  - Insgesamt 1 266 Tests grün.
  - Browser: `qa_tmp/k47_swap.js` (Q, Z/X, Anzeige, Talent-Fenster, Editor).

## 4.7.0 – Phase 4.7A: spielbarer Gewitter-Prolog auf Kapitän Schwarzbarts brennendem Flaggschiff gegen die sieben Marine-Admirale, private Einführung „Ankerglück“ (Stufe 1 → 3) und nahtloser Übergang in die geteilte Welt (26.11.2026, nur lokal)

**Was du siehst**
- **Neue Spiele beginnen mit einem Gewitter-Prolog:**
  - **Titelkarte und Einleitung:** Nacht, Sturm, peitschender Regen, Blitze und hohe Wellen. Die Kamera fährt aus dem Unwetter an die **„Schwarze Krone“** heran, Kapitän Schwarzbarts riesiges schwarzes Flaggschiff (ein Leviathan) mit brennenden Kanonendecks, Rauch und Glut.
  - **Spielbares Deck:** Du bist ein Schiffsjunge in Leinenhemd, Leinenhose und einfachen Schuhen, noch mit bloßen Fäusten. Um dich herum kämpfen Schwarzbarts Piraten gegen enternde Marinesoldaten. Lauf zum Achterdeck (der Pfeil zeigt die Treppe) und weich dabei Kanoneneinschlägen und brennenden Rahen aus – rote Warnringe zeigen, wo es gleich einschlägt.
  - **Kapitän Schwarzbart** (1,65 × so groß, dunkler Kapitänsmantel, Vollbart, violette Aura) zerschmettert unterwegs mit dunklen Schockwellen drei Marine-Kriegsschiffe. Wer früh oben ist, sieht die übrigen Schockwellen kurz hintereinander.
  - **Finale in drei Akten:**
    - Die **sieben Admirale** formieren sich nacheinander mit ihren Flaggschiffen am Horizont, jeder mit Banner und einer Lichtsäule in seiner Farbe: Großadmiral Eisenhart von Sturmwall, Admiralin Isolde Frostklinge, Admiral Bastian Flammensold, Admiralin Maren Tiefwasser, Admiral Konrad Windbrecher, Admiralin Selene Mondsichel und Admiral Aurel Sonnenspeer.
    - Sieben farbige Blitzstrahlen bündeln sich über dem Flaggschiff zum **„Vereinten Admirals-Urteil“**.
    - Der Einschlag kommt mit **Doppel-Impact-Frame**. Schwarzbart fällt im Feuersturm, die Druckwelle schleudert dich über die Reling in die See – Schwarzblende mit Herzschlag.
  - **Eigene Musik dazu:** Kriegstrommeln, Pauken, drohende Posaunen-, Horn- und Streicher-Akkorde in d-Moll, ein Chor beim Urteil, fernes Donnergrollen und Kanoneneinschläge. Die Musik zieht synchron zum Geschehen an und verstummt bis auf den Herzschlag.
  - **„Prolog überspringen“** (dezent unten rechts, am Handy auf dem Deck links): *Nur den Prolog* (weiter am Strand) oder *Prolog und Einführung* (gleich in die offene Welt mit dem Endstand der Einführung).
- **Erwachen in Ankerglück – deine private Einführung (Stufe 1 → 3):** Du liegst am Morgen nach dem Gewitter im Sand südwestlich des Piers, ohne Schiff, ohne Gold, nur in Leinen. Bis zum Ende der Einführung bist du allein in Ankerglück: keine fremden Schiffe, keine Welt-Ereignisse, kein Krieg der Mächte, kein Sold – und dein Schiff bleibt in der Bucht. Die Hauptquest-Kette:
  1. **Fischer Hinnerk Treibholz** am Pier schickt dich ins Dorf.
  2. **Hammerschmied Bodo Hammerschlag** schmiedet deine erste Waffe (deinen Kampfstil aus dem Editor).
  3. **Waffenmeister Konrad Klingenstein** zeigt dir an den Übungspuppen die Grundlagen: eine Kette aus 5 Treffern, den Sturm-Schritt (Umschalt) und das Erfassen eines Ziels mit Tab oder Klick (die Puppen lassen sich jetzt anwählen). Dann hebt er dich auf **Stufe 2** und führt dich durch den ersten Talentpunkt (Taste N).
  4. **Hafenmeisterin Ilse** übergibt dir die **ranzige Schaluppe** (sie liegt danach am Steg, die Gangway fährt aus). Du heuerst **Mira Windblatt** als erste Crew an (Ilse zahlt das Handgeld) und übernimmst das Steuer. Eine **Lehrtafel** erklärt die Schiffstafel (Segel, Rumpf, Breitseiten, Crew-Moral). Danach versenkst du ein **Kurogane-Spähboot** vor der Küste.
  5. **Bürgermeister Theodor Gerstenkorn:** Ein **Kurogane-Stoßtrupp** greift den Hafen an. Der Bürgermeister überreicht dir einen **Faji-Kristall** (**Stufe 3**), du wählst deine erste Faji-Kunst aus allen acht und setzt sie gegen die Angreifer ein (Taste 1). Fallen sie, bevor du die Kunst benutzt hast, kommen zwei Nachzügler über den Steg.
- **Die Welt öffnet sich:** Hat der Bürgermeister gedankt (150 Gold und ordentliche Seemannskleidung – dein Aussehen aus dem Editor), löst sich die private Instanz auf. Andere Kapitäne sind jetzt sichtbar: fünf schlendern durch Ankerglück (anwählbar, ansprechbar, mit Namen, Stufe und eigenem Gruß), zwei kreuzen mit ihren Schiffen vor dem Hafen. Die offene Welt läuft wieder ganz (Verkehr, Ereignisse, Krieg der Mächte), Kapitel 0 der Hauptgeschichte beginnt (jetzt „Kapitel 0: Leinen los“). Die Kampagne (4.7B) und Gruppen (4.8) bauen darauf auf.
- **Bestehende Spielstände** (Version 23 und älter) starten direkt in der offenen Welt – kein Prolog, keine Einführung, nichts geht verloren.
- **Kleinere Verbesserungen unterwegs:** Die Fußkamera rückt an Schiffsmasten vorbei heran, statt in ihnen zu stecken. Die Übungspuppen lassen sich anwählen.

**Technik (für Entwickler)**
- **Prolog-Regie, rein:** `story/prologueDirector.ts` (kein three.js, kein `Math.random`; Zustand JSON, vorab angelegte Ereignisse `PrologueOut`):
  - Phasen `intro` → `deck` → `assemble` → `charge` → `impact` → `overboard` → `blackout` → `done`.
  - Gefahren mit Warnzeit vor der Figur; Schockwellen nach Zeitplan, wer früh am Ziel ist, bekommt sie im Abstand `shockGap`.
  - Zeitgrenze `autoAfter`. Eine HP-Untergrenze von 0,55 sorgt dafür, dass ein Treffer mit höchstens 40 % Schaden nie das K.o. bringt.
  - `prologueBars` (Kinobalken), `prologueIntensity` (Musik), `skipPrologue`.
  - Alle Zahlen, Admirale, Zeilen und Wetter stehen in `data/prologue.ts`.
- **Prolog-Welt:** `world/prologueLive.ts` (`PrologueLive` über `PrologueHost`/`PrologueUi`):
  - Bühne auf freier See (`SeaWorld.openSeaSpot`), Flaggschiff über `setShip(6, FLAGSHIP.look)`, Nacht und Sturm über `Weather.hold`.
  - Flammen über `glowHub`, Marine-Enterer über `combat.enterDeck`, Piraten als `TroopSquad`.
  - Bühnen-Schiffe über `NavalSystem.spawnStage` (`EnemyShip.stage`: sinken sichtbar, zählen nie als Abschuss), Schwarzbart als `Character` (1,65 ×).
  - Alle Effekte aus `CataclysmFx`/`AnimeVfxForge` – kein neues Shader-Programm.
  - Die Texturen der Bühnen-Schiffe laden unter der Schwarzblende einzeln hoch (`NavalSystem.pendingTextures/uploadTexture`); die Admirals-Schiffe werden vorgewärmt (`PrologueHost.warm`).
  - Eigene Kamera der Kino-Phasen (`camera()`), auf dem Deck gilt die Fußkamera.
- **Seewelt:**
  - `SeaWorld.startPrologue/skipPrologue/abortPrologue/prologueBars/prologueGoal`. Eingabe-Stellvertreter `HELD_INPUT`, solange die Regie führt.
  - Instanz-Sperren `setGates(WorldGates)`: `NavalSystem.quiet` (keine Begegnungen, Grenzpatrouillen, Kopfgeldjäger, Seeschlachten), Welt-Ereignisse und Krieg ruhen, `keepOnLeash` (900 m um Ankerglück).
  - Einführungs-Helfer: `shoreSpot`, `landPlayer`, `stowShip` (verstaut bzw. am Steg festgemacht), `spawnScout`, `spawnRaid`/`raidLeft` (`TUTORIAL_RAID_TAG`), `tutorialTarget`, `tutorialProbe`.
  - Masten zählen in `camSolid`; während des Prologs keine Entdeckungen und Regionswechsel (`updateWorldEvents`).
- **Instanz-Regeln, rein:** `story/tutorialInstance.ts` (`InstanceSave` in `progress.instance`, Modi `prolog`/`tutorial`/`shared`, `enterTutorial`, `dissolve`, `skipIntro`, `worldGates`, `cleanInstance`, `TUTORIAL_END`).
- **Ablauf der Einführung:** `core/tutorialFlow.ts` (`TutorialFlow` über `TutorialHost`, ohne three.js prüfbar):
  - Beobachtet die Aufträge `t1`–`t5` (`data/quests.ts`, neue Schrittart `act` mit `TutorialAct`, Auftragsereignis `act`) und meldet Handlungen über Zustandsabfragen (Trefferkette, Dash-Phase, Zielwahl, ausgegebene Talentpunkte, Steuer, eingesetzte Faji-Techniken `PlayerFoot.tally`, lebende Angreifer).
  - Story-Momente einmalig über `progress.flags` (`TUT_FLAGS`): Laden mitten in der Einführung setzt an derselben Stelle fort.
  - In der privaten Instanz gibt es weder Erfahrung (Stufen nur aus der Geschichte) noch Sold.
- **Geteilte Welt:** `world/sharedPresence.ts` (`PresenceFeed` mit `LocalPresenceFeed`/`localRoster` – in Phase 4.8 durch einen Server-Feed ersetzbar).
  - Kapitäne in der Stadt als `Npc` mit `townDef`.
  - Schiffe über die Warteschlange `NavalSystem.queuePeer`, auch zu Fuß über `pumpIdle` (`EnemyShip.peer`: fährt seine Runde `peerLoop`, friedlich, unverwundbar für den Spieler).
  - Auf- und Abbau nach Abstand zu Ankerglück (`PRESENCE_IN`/`PRESENCE_OUT`), eine Figur je 0,25 s.
- **Anzeige:** `ui/prologueOverlay.ts` + `ui/css/prologue.css`:
  - Titelkarte, Untertitel (auf dem Deck oben, am Handy unter den Karten), Admirals-Banner, Schwarzblende, Überspringen mit Rückfrage, Lehrtafel.
  - Die Wurzel lässt Zeiger durch (`pointer-events: none !important`).
  - Klasse `pro-cine` blendet in Kino-Phasen Kampfanzeige und Touch-Knöpfe aus.
  - Wahlkarten über `Menus.showChoice` (erste Crew, erste Faji-Kunst).
- **Musik:** `AudioEngine.prologue(k | null)` (eigene Partitur-Spur über dem Musik-Bus, verdrängt Datei- und Stimmungsmusik, Schichten nach Spannung), `heartbeat()`.
- **Spielstand 24:** `progress.instance`. Die Migration 23 → 24 setzt `legacyInstance()` (offene Welt); `migrateSave` liest das Feld vor `fillDefaults`, ein fehlendes Feld gilt als offene Welt. Neue Spiele: `newInstance()` (Prolog), 0 Gold, Sturmfaust, keine ausgerüstete Faji-Kunst.
- **Messungen (Playwright, echte Grafikkarte):**
  - Prolog live bei 1440 × 900 Ultra 60 Bilder/s in allen Phasen; Bildzeiten 5 – 10 ms.
  - Der frühere Einbruch beim ersten Admiral (2 Bilder mit 360 + 258 ms Textur-Upload) ist behoben, das schlimmste Bild hat 30 ms.
  - Handy 390 × 844 60 Bilder/s.
  - Start im Build 6,4 – 6,6 s bis zum Menü, 170 Programme; keine Konsolenfehler.
- **Prüfen:**
  - `tests/prologueAndAnkergluckInstance.test.ts` (24 Tests): Prolog-Ablauf samt Sieben-Admirale-Schlag, frühe Ankunft, Zeitgrenze, Determinismus, Kinobalken/Musik, Überspringen, Daten, private Instanz, die ganze Auftragskette mit dem echten Auftragssystem, Nachzügler, Fortsetzen nach dem Laden, Mitspieler, Spielstand 24.
  - Insgesamt 1 257 Tests grün.
  - Browser: `qa_tmp/k47_start.js`, `k47_deck.js`, `k47_deck2.js`, `k47_finale.js`, `k47_tutorial.js`, `k47_mobile.js`, `k47_perf.js`, `k47_startup.js` (Build auf 4173).

## 4.6.11 – Phase 4.6J: Abschluss von Phase 4.6 – MMO-Ziel-Erfassung mit Ziel-Fenster, kein Eigenbeschuss, gestochen scharfe Auflösung auf jeder Grafikstufe, ruckelfreie Schiffs-Zerlegung, klarere Ultimates und ein Meer ohne Kachelmuster (26.11.2026, nur lokal)

**Was du siehst**
- **Ziele anwählen wie in einem Online-Rollenspiel:**
  - **Tab** schaltet durch die nächsten wichtigen Ziele im Blickfeld, **Umschalt + Tab** zurück. Im Kampf nur durch Feinde – Bosse und Elite-Gegner zuerst, dann nach Nähe zur Bildmitte; im Hafen ohne Feinde durch Bewohner, Offiziere und Schiffe. Ist nur ein Ziel da, löst ein weiterer Druck die Auswahl wieder.
  - **Anklicken** (Maus) oder **Antippen** (Handy) wählt jedes Ziel direkt: Gegner, Elite-Gegner, Bosse, feindliche und verbündete Schiffe, deine Offiziere und Trupps und alle Hafen-Bewohner. Ein Klick auf Bewohner oder Verbündete schlägt bzw. feuert nicht.
  - **Am Gamepad** schaltet der **rechte Stick-Klick** durch die Ziele, **am Handy** der Knopf **„Ziel“** (zu Fuß und jetzt auch auf See). Antippen klappt auf der ganzen Spielwelt, auch auf der linken Lauf-Fläche (kurzer Tipp ohne Ziehen).
  - **F / T / mittlere Maustaste** rasten die Kamera fest auf das angewählte Ziel ein und lösen sie wieder (die Auswahl bleibt).
  - Ein dezenter **Zielring** am Boden bzw. auf dem Wasser zeigt das Ziel: **Rot** = Feind, **Gelb** = neutral, **Grün** = verbündet, **Blau** = Bewohner.
- **Ziel-Fenster oben im HUD** (unter dem Kompass): Wappenfarbe und Name der Macht, Name, „Stufe X“, ob Feind, neutral, verbündet oder Bewohner, die Kategorie (auf See Schiffsklasse und Klasse 1–7 mit Rolle, an Land Kämpfertyp, Rolle oder Titel – z. B. „Hafenmeisterin“, „Elite · Hauptmann“, „Kaiser · …“), der Lebensbalken mit Zahlen und bei Elite-Gegnern und Bossen die **Haltungsleiste** (rot pulsierend, wenn sie gebrochen ist).
- **Zielhilfe:** Kampfkünste (1–4) und das Ultimate drehen sich sofort zum angewählten Feind, wenn er in Reichweite ist (bis 24 m), auch wenn er hinter dir steht. Die **Offiziers-Assists (8, 9, 0)** schlagen um dein angewähltes Ziel ein. **Breitseiten** richten sich auf das angewählte Feindschiff, wenn es auf der feuernden Seite in Reichweite liegt (der Fächer ist dafür weiter), die **Bugkanone** zielt mit Vorhalt darauf, wenn es vor dem Bug liegt.
- **Kein Eigenbeschuss mehr:** Deine Angriffe, Breitseiten, Rammstöße und Ultimates treffen deine eigenen Schiffe, Offiziere und Trupps nie – und auch keine Schiffe von Mächten, mit denen du verbündet bist (Marine-Dienst ab Ansehen 60, Auftraggeber deiner laufenden Kriegsaufträge), solange du sie nicht selbst angreifst. In Massenschlachten fliegen deine Kugeln durch Verbündete hindurch.
- **Bildschärfe unabhängig von der Grafikstufe:** Neuer Regler **„Auflösung / Bildschärfe“** (Einstellungen → Grafik & Leistung): *Automatisch (Monitor)* (Standard: volle Pixeldichte deines Bildschirms, höchstens doppelte Dichte), *1080p (Full HD)*, *1440p (WQHD)*, *4K (UHD)* und *Leistung (85 %)*. Die Grafikstufen **Niedrig bis Ultra** machen das Bild nicht mehr unscharf: Sie steuern nur noch Schatten, Bloom und Umgebungsverdeckung, Wasser-Spiegelungen, die Sichtweite von Bewuchs und Figuren und wie weit Stoff und Haare simuliert werden. Konturen bleiben auf jeder Stufe gestochen scharf.
- **Das Meer ohne „Rechenblock“:** Aus der Höhe oder bei viel Wasser in der Ferne lag bisher ein regelmäßiges Kästchen- und Rautenmuster auf dem Meer. Jetzt tragen echte, sich kreuzende Windwellen mit gewundenen Kämmen und großflächigen Wellengruppen die Struktur bis zum Horizont, die Kleinwellen-Kacheln wiederholen sich nicht mehr sichtbar, und die langen Dünungen zeichnen aus der Ferne keine hellen und dunklen Flecken mehr ins Wasser.
- **Kein Ruckler mehr, wenn ein Schiff zerbricht:** Das Zerlegen eines Schiffs (bisher ein Standbild von 20 – 35 ms) läuft jetzt verteilt über 1 – 3 Bilder mit höchstens rund 3 ms je Bild – mitten im Standbild der Impact-Frames, du siehst keinen Unterschied außer flüssigem Bild.
- **Klarere Ultimates in Akt 2:** Beim **Himmelsspalter** (Zweihänder) legte die 180 m breite Energiewand einen weißen Schleier über das Bild, beim **Tiefsee-Sintflutdrachen** (Wasser-Faji) überstrahlten Wasserwand und Drachenkopf alles. Jetzt: dunkler Smaragd-Mantel und gedämpfte Wände bei der Klingenwelle (die Klingenkante läuft als scharfe helle Linie über das Wasser), eine leisere Wasserwand mit kräftigerem Tiefsee-Mantel und ein Drachenkopf mit dunklem Wirbelkern beim Sintflutdrachen, dazu in Akt 2 gezielt weniger Belichtung und Bloom – Schiffe, Klingenwelle, Wasserdrache und Tusche-Konturen sind gestochen scharf zu erkennen.
- **Weniger Grauschleier in Nahaufnahmen:** Staub- und Nebelflocken direkt vor der Kamera blenden weich aus (wie schon die Glut).
- **Spielstände:** Version 23 bleibt, nichts wird umgebaut. Neue Einstellung „Auflösung“ startet auf „Automatisch“.

**Phase 4.6 ist damit abgeschlossen** – der Anime-Action-Kampf in elf Schritten:
- 4.6.0 (A) Action-Kampf-Engine mit sechs Stilen, Kombo-Baum, Sturm-Schritt, Haltungsbruch · 4.6.1 (B) acht Faji-Künste, Sturm-Erwachen, Auren und 14 Kataklysmus-Ultimates · 4.6.2 (C) kinetischer Kampf mit Momentum, Clash und Rückstoß über Bord · 4.6.3 (D) AnimeVfxForge mit 3-Schicht-Effekten und sichtbarer Zerstörung · 4.6.4 (E) 18 Talentbäume bis Stufe 100 und der geheime Aufstieg auf Stufe 101 mit dem 15. Ultimate · 4.6.5 (F) organisches Figuren-Rig · 4.6.6 – 4.6.8 (G) Charakter-Editor, Sockets, weibliche Figur, Null-Clipping, Hüte, Frisuren, Brillen · 4.6.9 (H) Mehrlagig-Frisur, Offiziers-Assists, gemeinsames Talent-Menü, begehbare Dächer · 4.6.10 (I) 3-Akt-Kinoregie aller 15 Ultimates · 4.6.11 (J) Ziel-Erfassung, Bildschärfe, ruckelfreie Zerlegung, Meer.

**Technik (für Entwickler)**
- **Ziel-Erfassung, rein:** `combat/targetLock.ts` (kein three.js, kein DOM): `TargetCandidate`/`TargetPool` (vorab angelegt), `TargetLockState` als JSON mit `cleanTargetState` (später übers Netz: Gruppen-Ziel, „Ziel des Ziels“), Freund/Feind-Regel `relationOf(subject, RelationContext)` (eigen/verbündet > provoziert/feindlich > Bündnis der Macht > Bewohner > Ansehen), Treffer-Prüfung `canHarm(attacker, target)` und `validatePlayerHit` (deutsche Gründe), `cycleTarget` (Feinde zuerst, Vorrang Boss > Elite, Bildmitte und Nähe; Sichtfeld an Land ±60°, auf See ±100°), `pickTarget` (Bildschirmkreis, vorderstes gewinnt), `frameView` (Fenster-Daten, Text nur bei Änderung), `aimYaw`, `broadsideSide`, Zahlen in `TARGET`, Ringfarben `RELATION_RING` (gleich in `tokens.css` `--target-*`).
- **Welt-Seite:** `world/targetLockLive.ts` (`TargetLockLive`, Host `SeaWorld.targetHost`): sammelt nur bei Tab/Klick/Lock-on (Gegner, Verbände, Offiziere, eigene Trupps, Bewohner und Besucher, Schiffe), frischt das angewählte Ziel je Bild aus dem lebenden Objekt auf, Zielring als ein Netz mit den Werten der Breitseiten-Ringe (gleiches Programm), Farben vorab als `Color`. `SeaWorld.updateTargets` je Logikschritt: Klick/Tipp (`Input.click`, `consumeAttack`), Durchschalten, Lock-on-Abgleich mit `CombatSystem.lock` (nur `landFoe`), `NavalSystem.aimTarget`. `Npc.entityId` neu, `Ally.level` gespeichert.
- **Zielhilfe:** `ActionInput.softLockId` (Engine: Kampfkünste und Ultimate richten sich darauf aus, `inAim` bis `TARGET.artAim`, sofortige Drehung), `PlayerFoot.update(…, softId)`, Faji-Fähigkeiten über `aimYaw`, Assists über `AssistHost.lock`, Breitseiten über `NavalSystem.sideTarget` (angewähltes Ziel zuerst, Verbündete und Neutrale nie automatisch), Bugkanone `bowShot` (±26°, 260 m, Vorhalt).
- **Kein Eigenbeschuss:** `NavalSystem.shipRelation`/`playerMayHarm` (über `relationOf`), `allyPowers` (setzt `Game.syncAllies` alle 0,5 s: Ansehen ≥ `REP.serviceAt` und Auftraggeber laufender Kriegsaufträge), Kugeln des Spielers (`harmableByPlayer` nach dem Treffertest), Freundes-Menge der KI um Flotte, Eroberte und verbündete Mächte erweitert, Rammen und `cataclysmFriendly` fragen `playerMayHarm`; an Land `CombatSystem.massOk` (`canHarm`) in allen Verbands-Schleifen.
- **Eingabe:** Aktionen `targetNext` (Tab, Gamepad R3 = 11) und `targetPrev` (Umschalt + Tab erkennt `Input.onKeyDown` selbst); `lockon` ohne Tab und am Gamepad ohne Taste; Umschalt ohne Laufrichtung löst „Ausweichen“ erst beim Loslassen aus (`shiftDefer`, mit Laufrichtung sofort) – so wird Umschalt + Tab kein Dash. Klick/Tipp: `Input.click()`, `Input.tap()` aus `TouchControls` (Kamera- und Lauf-Fläche, Tipp < 0,3 s und < 14 px), Bereich „Ziel-Erfassung“ in der Tastenbelegung, Ziel-Knopf in `TOUCH_FOOT` und `TOUCH_SEA`.
- **Ziel-Fenster:** `ui/targetFrame.ts` in der HUD-Zone `tc` unter dem Kompass, schreibt nur Änderungen ins DOM; Stile `.hud-target`/`.tf-*` in `hud.css`, Farben `--target-hostile/-neutral/-friendly/-npc` in `tokens.css`.
- **Auflösung:** `render/resolution.ts` (rein: `RESOLUTION_MODES`, `RESOLUTION_LABEL`, `RESOLUTION_HINT`, `renderPixelRatio(mode, cssW, cssH, dpr)` – kennt keine Grafikstufe; `auto` = DPR ≤ 2, feste Zielhöhen 1080/1440/2160 bei 16 : 9, höchstens 4K-Pixel, `perf85`). `Renderer.resolution`/`setResolution`, `basePixelRatio` nur noch daraus; `QualityConfig` ohne `pixelRatio`/`maxPixelRatio`/`maxPixels`/`supersample`; `tierFeatures(tier)` beschreibt, was eine Stufe steuert. Einstellung `Settings.resolution` (Reiter Grafik), Menü-Gruppe „Auflösung / Bildschärfe“. Die dynamische Auflösung bleibt (höchstens bis 0,75 × DPR).
- **Meer:** Ferne See als Spektrum aus bis zu 12 gerichteten Windwellen (goldener Winkel, 190 … 16 m, spitze Kämme, Phasen-Verwirbelung, Wellengruppen, Pixel-Fußabdruck-Filter gegen Flimmern) statt zweier Wertrauschen-Felder auf Quadratraster; Kleinwellen-Kacheln mit Verwirbelung (`skWarp`) und dritter, gedrehter Lage (61,7 m), kleine Lagen früher ausgeblendet; Farbfelder und Schaum-Wellengruppen auf gedrehten Bereichen; Höhen-Aufhellung der Dünung nur bis 520 m (`skHgtK`). Programm-Schlüssel `sk-ocean32` (ersetzt 31, keine Mehrzahl).
- **Schiffs-Zerlegung:** `beginShipSplit` + `pumpShipSplits(SPLIT_FRAME_MS = 3)` je gezeichnetem Bild in `SeaWorld.render` (auch im Standbild); Generator `splitSteps`/`partitionSteps`/`sliceGeometrySteps` gibt nach Zeitbudget ab, jeder Zwischenstand sieht aus wie das ganze Schiff (Umhängen mit gleicher Weltlage, `ShipSplit.ready` startet die Bewegung), Matrizen werden nach jeder Abgabe neu gelesen, abgebaute Teile übersprungen, `cancelShipSplit` in `Ship.dispose`. Billiger: Hälften übernehmen die Hüllkugel des Originals, Einteilungs-Puffer je Auftrag wiederverwendet, Positionen direkt aus dem Feld, `releaseIndexOnly` (render/dispose.ts) gibt nur den Index frei – die geteilten Eckpunkt-Puffer bleiben auf der Grafikkarte (bisher lud jede Hälfte sie neu hoch). `splitShipModel` bleibt als Zerlegung in einem Zug (Prüfungen).
- **Akt-2-Bildregelung:** `UltimateCinematic.grade2` (`horizonCut` Belichtung 0,8 / Bloom 0,35, `floodDragon` 0,78 / 0,3), `UltimateCinematics.exposureK/bloomK` (Ein- und Ausblenden `GRADE_BLEND`), `Game` multipliziert die Belichtung, `Renderer.setBloomK` (nur ein Uniform); Effekte in `cataclysmDirector.ts` (Energiewand mit `arcInk`-Mantel, niedrigere Wände, weniger Gischtsäulen in Akt 2; Drachenwelle 0,7/0,4, Mantel 1/0,85, Kopf mit `ribbonInk`-Wirbel). `CataclysmFx`: Linsen-Ausblendung auch für weiche `smoke`-Sprites (Staub, Nebel, Rauch) über die Deckkraft-Stufen.
- **Messungen (Playwright, echte Grafikkarte):** Zerlegung je Bild höchstens 3,3 ms über 1 – 3 Bilder (vorher 6 – 20 ms im Aufruf plus bis 8 ms Hochladen im nächsten Bild); Bildzeit 1440 × 900 auf See Niedrig 3,7 / Mittel 4,0 / Hoch 4,8 / Maximal 9,6 / Ultra 4,7 ms, Hafen Ultra 7 ms, Echtzeit 57 – 58 Bilder/s (Bildschirm-Obergrenze im Prüffenster); Handy 390 × 844 (DPR 3 → 780 × 1688) 57 – 58 Bilder/s; Start im Build 7,8 s bis zum Menü, 170 Programme; keine Konsolenfehler.
- **Prüfen:** `tests/targetLockAndResolutionSplit.test.ts` (30 Tests: Durchschalten, Anklicken, JSON-Zustand, Freund/Feind, Treffer-Prüfung, Ringfarben, Ziel-Fenster samt Zero-GC, Zielhilfe in der Engine, Breitseiten-Seite, Tasten und Touch-Knöpfe, Zerlegung über mehrere Bilder samt Abbruch und Index-Freigabe, Akt-2-Bildregelung, Auflösung je Modus und unabhängig von der Stufe, Stufen-Merkmale, Einstellung, Meer), 1 233 Tests grün. Browser: `qa_tmp/j46_split.js` (Kosten je Bild), `j46_ults.js` + `node qa_tmp/j46_sheet.mjs` (sechs Ultimates, Akt 1 – 3 bei 1440 × 900 Ultra), `j46_water.js` (Meer aus der Höhe), `j46_target.js`/`j46_target_sea.js` (Hafen, Gefecht, See, Verbündeten-Schutz), `j46_horn_only.js` + `j46_kaiser.js` (Sturmhorn an echten Trupps, Kaiser-Boss), `j46_perf.js` (alle Stufen), `j46_mobile.js` (Handy).

## 4.6.10 – Phase 4.6I: maßgeschneiderte 3-Akt-Kinoregie mit Vorbereitungs-Posen und Doppel-Impact-Frames für alle 15 Ultimates (26.11.2026, nur lokal)

**Was du siehst**
- **Jedes Ultimate ist jetzt ein eigener kleiner Anime-Moment in drei Akten** – knackig, zusammen nur rund 1,1 Sekunden (nie über 1,2 s), statt der bisher gleichen Nahaufnahme für alle:
  - **Akt 1 – Vorbereitung (0,30 – 0,35 s):** eine eigene Pose je Ultimate mit Fokus-Kamera, leuchtenden Augen, wirbelndem Mantel und Haar und einer Aura um die Figur. Der Himmel reagiert schon: Sterne reißen spiralförmig auf, Sturmwolken drehen sich, beim Blutmond verfinstert sich der Himmel.
  - **Akt 2 – Bedrohung (0,35 – 0,42 s):** ein bedrohlicher Perspektiv-Schwenk auf das, was entsteht – Meteoriten mit Mach-Kegeln, die Geister-Armada im Halbkreis, die Klingenwelle, die über das Wasser rast, die sich auftürmende Drachenwelle, der Feuerdrachen-Wirbelsturm, der Tornado von oben.
  - **Akt 3 – Einschlag (0,32 – 0,38 s):** harter Schnitt in den Treffermoment, **Doppel-Impact-Frame** (erst invertiert, dann schwarz-weiße Tusche mit Speedlines, die Zeit steht still), Kamerastoß in Schlagrichtung, danach eine weite Einstellung auf die Zerstörung in Zeitlupe.
- **Die 15 Choreografien im Einzelnen:** Himmelssturz (Heldenuntersicht, Arm zum Himmel, Zwillings-Meteoriten und Planet), Himmelsspalter (Zweihänder: die Klingenwelle rast auf das Kriegsschiff zu, Bug und Heck kippen erst im Treffermoment auseinander), Iaijutsu-Weltenbruch (Nahaufnahme auf Daumen und Griff, Überschall-Schnitt, Klick an der Scheide), Klingen-Zyklon (gekreuzte Klingen im Sprung, die Säge fräst durch, vier Sektionen brechen), Sieben-Meere-Zäsur (Säbel-Sprung, Armada im Halbkreis), Sturmfaust (Ausfallschritt mit glühenden Fäusten, Fäuste-Flut von der Seite), Erdspalter (Faustschlag, das Meer teilt sich), Schwarzes Loch, Purpur-Sonneninferno, Gletscher, Sintflutdrache, Vakuum-Himmelssturm, Donnergott-Urteil, Zenit-Sonnentanz und Blutmond-Finsternis.
- **Die Kamera schaut nie gegen einen Mast:** Vor jedem Akt prüft die Regie die Sicht auf die Figur und das Ziel gegen Masten, Takelage, Segel, Rümpfe, Relingen, Mauern und Gelände und wählt notfalls eine freie Variante (gespiegelt, gedreht, über die Schulter, angehoben, herangerückt).
- **HUD und Banner treten zurück:** Während der Sequenz sind HUD und Hinweise ausgeblendet, Kinobalken laufen ein. Große Banner wie „Schiff versenkt!“ warten, bis die Sequenz vorbei ist. Danach gleitet die Kamera in 0,45 s in die freie Steuerung zurück, Dash und Sprung sind sofort wieder frei.
- **Erdspalter an Deck:** Der Wassergraben beginnt jetzt hinter dem Bug bzw. der Bordwand deines eigenen Schiffs. Bisher begann er 4 m vor der Figur – unter dem eigenen Bug – und dein Schiff versank samt Figur und Kamera im Graben, bis er sich nach 6 Sekunden schloss.
- **Flüssiger:**
  - Schiffe mit zerschossenen Segeln ließen die Steuerung der Gegner kurz hängen (130 – 180 ms Standbild, gut sichtbar nach Blitz-Ultimates). Behoben.
  - Brechen im Treffermoment mehrere Schiffe, zerbricht jetzt eines je Bild – mitten im Standbild der Impact-Frames, statt alle zugleich in einem 40 – 60-ms-Bild.
  - Die Sichtprüfung der Kamera kostet je Akt höchstens rund 5 ms (anfangs 30 – 60 ms).
- **Sintflutdrache:** Die Drachenwelle hat einen dunklen Tiefsee-Mantel und hebt sich so auch vor hellem Taghimmel ab.
- **Spielstände:** Version 23 bleibt, nichts wird umgebaut.

**Technik (für Entwickler)**
- **Kino-Regie:** `graphics/ultimateCinematics.ts` (rein, keine Szene): `ULTIMATE_CINEMATICS` (15 Einträge, Titel = Ultimate, drei deutsche Akt-Beschreibungen, `CinePose`, `CineSky`, `CineThreat`, drei `CineShot` aus `K(Anker, Abstand, Azimut, Höhe, Blickpunkt, ly, Sichtfeld, ahead, roll)`, Impact-Bilder, Stoß, Zeitlupe), `UltimateCinematics` (Phasen prep → build → impact → return, `cineTiming`, `timeScale` je Akt, `camK`/`barsK`/`glow`/`poseK`, `resolve` mit 15 Varianten inkl. Schulter-Blick ±2,3/π, `BODY_MARGIN`, `pose` mit Kugelbahn-Überblendung nur am Beginn von Akt 2 – Akt 3 schneidet hart), `CINE`-Grenzen, `makeAnchors`, `reachTarget`, `kickDirection`. Welt-Anschluss in `SeaWorld` (`ultimateBegins`, `ultimateStrikes`, `applyCinematic`, `fillCineAnchors`, `cineDecisive`, `cineImpactFx`, `cineRelease`), Spring-Arm `CINE_ARM` (`graphics/cameraRig.ts`), Pose über `CharacterRig.cine` und `PlayerFoot.cineClip`.
- **Zeitmaß gegen die Engine:** `UltimateSpec.lag` (Spielzeit vom Einschlag bis zum entscheidenden Treffer, `decisiveAt`), `ULT_CHARGE`, `ULT_FREE_AFTER`, Sperre `cancel` = max(letzter Treffer, Treffer + 0,15 s); `SKYFALL_TIMES`. `AnimeImpactRig` zählt nur noch Impact-Bilder (2 – 4 gezeichnete Bilder, invertiert → Tusche); Zeitlupe und Standbild über `cine.timeScale` (Game setzt `loop.timeScale`).
- **Welt-Regie:** `CataclysmDirector` zeichnet Schiffe in Akt 2 (`mark`) und zerbricht sie im Treffermoment (`decide`, Host-Haken `decisive`), Akt-1-Effekte `beginCharge`/`stepCharge`/`poseFx`, Bezugspunkte `cineThreat`/`cineImpact`, Schnitt-Warteschlange (`splitQ`, ein `cataclysmSplit` je Bild, `stats.queued`), Grabenbeginn über den Host-Haken `trenchStart` (`SeaWorld.ownTrenchStart`: 3 m hinter der äußersten Ecke des eigenen Rumpfs). Neue Effekte `AnimeVfxForge.machCone`/`skyVortex`/`auraSwirl`, neue Grundformen `cone` (additiv) und `arcInk` (Tusche-Mantel) im Pool – gleiches Material, kein neues Programm; additive Kleinteile blenden vor der Linse aus.
- **Sichtprüfung:** `CineSight.free(A, B, margin)` vom Objektiv zum Motiv (Rümpfe, Aufbauten, Masten, Segel über `graphics/sightGrid.ts` – Zellraster je Geometrie, einmal gebaut, WeakMap; Takelage als Linie mit 6 cm Toleranz; Mauern, Bauten, Gelände über `camSolid`/`camFloor`), Hindernis-Listen je Schiff `occludersOf` (ohne Instanz-Kleinkram und Konturen), Vorbauen des eigenen Schiffs im Leerlauf (`warmSight`). three prüfte je Strahl jedes Dreieck (1,3 ms je Strahl, 30 – 60 ms je Akt-Wechsel).
- **Steuerung lahmgelegter Schiffe:** `TURN_RADIUS_MAX` (600 m) in `naval/shipMotion.ts` – ungedeckelt wuchsen Fühler und Ausweg-Suche bei `perfTurn` 0 auf über 50 km.
- **Oberfläche:** `CombatOverlay.quiet` hält den weißen Treffer-Blitz und große Banner zurück (`.cbt-banner.hush`), HUD über `.anime-impact.cine ~ .hud`, Tiefenunschärfe springt in der Sequenz (`Renderer.dofSnap`), Tusche-Filter dunkler.
- **Prüfen:** `tests/ultimateCinematics.test.ts` (33 Tests: Choreografien, Zeiten, Ablauf aller 15, Rückkehr, Sichtprüfung samt Mast- und Wandfall, Sicht-Raster gegen Prüfung aller Dreiecke, Spring-Arm, Welt-Regie im Treffermoment, ein Schnitt je Bild, Grabenbeginn, Zero-GC und Programme, HUD und Banner), `tests/shipSteering.test.ts` (+1: lahmgelegtes Schiff), 1 203 Tests grün. Browser: `qa_tmp/i46_all.js` mit `node qa_tmp/i46_sheet.mjs` (Bilder aller 15 je Akt), `i46_spikes.js`/`i46_perf.js` (Bildzeiten, Programme), `i46_sightprof.js` (Kosten der Sichtprüfung), `i46_trench.js` (Deckhöhe beim Erdspalter), `i46_startcmp.js` (Startzeit im Wechsel gegen 4.6H). Gemessen: Bildzeit in der Sequenz im Mittel 6 – 8 ms; längere Bilder (bis ~35 ms) nur, wenn ein Schiff zerbricht – wie in 4.6H. Startzeit im Build im Wechsel mit 4.6H: Menü nach 7,6 – 7,7 s (4.6H: 7,3 – 7,7 s), 170 – 171 Programme (gleich). Während der 15 Ultimates entstehen dieselben 6 Programme wie in 4.6H (Rumpflöcher, Schatten mit Textur, Seegeschosse) – keine neuen.

## 4.6.9 – Phase 4.6H: neue Mehrlagig-Frisur, entspannte Hüte und Helme, Kombo-Befehle der Offiziere, ein gemeinsames Talent-Menü für N und K und begehbare Dächer (25.11.2026, nur lokal)

**Was du siehst**
- **„Mehrlagig“ komplett neu – für Mann und Frau:** Die Frisur entsteht jetzt im Spiel um den Schädel der jeweiligen Figur: eine geschlossene, dunkle Haarkappe vom Haaransatz bis zum Scheitel (nirgends Kopfhaut), darüber weich gebogene, spitz zulaufende Strähnen im **gleichen Seidenglanz wie die Grundfrisur**. Keine verdrehten Flächen, keine weißen Strähnenkanten mehr.
  - *Mann:* windzerzauster, gestufter Schnitt mit aufgerichteten Spitzen, vollem Pony bis zu den Brauen, markanten Schläfensträhnen und zweistufigem Nackenhaar.
  - *Frau:* glattes Deckhaar, weich fallender Pony, gesichtsrahmende **Hime-Strähnen** bis zum Kinn und drei Stufen langer **Rückensträhnen** bis zur Rückenmitte. Sie liegen über Kragen und Mantel und schwingen an eigenen Federketten **sanft** mit: beim Laufen etwa 10 cm an den Spitzen, nach dem Anhalten in gut einer halben Sekunde wieder ruhig – nie über Kopf oder Schulter.
  - Die Wahl „Mehrlagig“ bleibt jetzt auch nach dem **Neuladen** erhalten (bisher fiel sie beim Laden weg).
- **Entspannter Sitz für alle Hüte und Helme:** Jeder Hut sitzt **0,8 cm höher**, sein innerer Kranz ist **3,5 % weiter** – nichts wirkt mehr in den Kopf gepresst, und kein Härchen sticht oben oder seitlich durch. Dieselbe Passform gilt jetzt auch für die **Ausrüstungshelme** und den **Dreispitz der Sets**: Sie sitzen am gemessenen Schädel, das Haar darunter wird in die Helmkrone gedrückt (nie bis auf die Kopfhaut: keine kahle Stirn unter offenen Krempen).
  - **Wangen- und Nackenschutz:** Auch Haar *unter* dem Helmrand bleibt innerhalb von Nackenlamellen, Nackenschutz, Wangenklappen und Kapuzen – keine Strähnenspitzen mehr durch das Blech. Vorn vor dem Gesicht bleibt der Pony frei, unter der Unterkante fällt das Haar wieder offen.
- **Offiziers-Kombo-Befehle an Land (neu):** Drei Befehle an deinen Landtrupp, jeder mit eigener Abklingzeit und Anime-Effekten:
  - **[8] Sperrfeuer-Salve** (Kanonier oder Schütze, 24 s): sechs Leuchtspur-Granaten in hohem Bogen, explodierende Einschläge mit Druckring, Rauch und Glut. Sie brechen die gegnerische Haltung und **halten hochgeschleuderte Gegner länger in der Luft**.
  - **[9] Orkan-Schildstoß** (Krieger oder Erster Maat, 20 s): der Offizier stürmt mit Windspur vor und schleudert ganze Gegnergruppen hoch – direkt danach ist die **Sturm-Verfolgung** offen.
  - **[0] Sturmhorn-Sammeln** (Steuermann oder Schiffsarzt, 45 s): goldene Schallwelle mit Lichtsäule – heilt **24 % deiner Lebenspunkte**, füllt **35 Willenskraft** auf, stärkt deine Truppen 12 Sekunden lang (mehr Schaden, weniger erlittener Schaden, schneller) und heilt und stärkt deine Offiziere.
  - Kombination: *Orkan* und gleich danach *Salve* hält eine ganze Gruppe gut doppelt so lange in der Luft.
  - Am PC unten neben den Kampfkünsten als Leiste mit Abklingzeit und Namen des Offiziers; am Gamepad **R3 + LB / RB / LT**; am Handy drei eigene runde Knöpfe über den Kampfknöpfen. Die Tasten sind frei belegbar (Einstellungen → Steuerung → „Offiziers-Assists (an Land)“).
- **Ein gemeinsames Fenster für Talente und Faji (N und K):** *Talente & Kampfkünste* vereint den alten Fähigkeitenbaum (Taste K) mit den Talentbäumen (Taste N). Beide Tasten öffnen dasselbe Fenster, K gleich bei den Faji-Künsten.
  - Fünf Reiter: **Waffen-Meisterschaften**, **Faustkampf**, **Faji-Künste**, **Kapitän & Flotte** und **Stufe 101: Kosmos-Pfad**. Die Faji-Techniken (F1 – F3) stehen bei ihrem Kampfstil, die Willenskraft-Aura bei den Faji-Künsten.
  - **Ein Punktetopf:** Stufenaufstiege, Meisterschafts-Siegel, Bossinseln, Ruinen, Kristalle, Legenden, Aufträge, Splitter, Schreine und das Erwachen geben Talentpunkte, die du überall ausgeben kannst. **Deine alten Faji-Punkte gehen nicht verloren:** freie und schon gelernte werden einmalig in den gemeinsamen Topf übernommen – gelernte Techniken bleiben gelernt.
  - **Vorschau-Karte** je Baum mit Apex-Ultimate und Evolutionen (was ab welcher Stufe kommt, was ausgerüstet ist), **Zurücksetzen** je Baum, für alle Bäume und für die Faji-Techniken.
  - **Fortschrittsbalken der geheimen Aufstiegs-Prüfung:** 0/5 bis 5/5 besiegte Kaiser-Inseln, mit einem Klick zum Kosmos-Pfad.
  - Zoom-Knöpfe für die Bäume, sauberes Scrollen am PC (1440 × 900) und am Handy (390 × 844): dort stehen alle fünf Reiter gleich breit nebeneinander, die Bäume als wischbare Karten.
- **Begehbare Dächer, Wehrgänge und Zinnen:** Häuser, Hafenbauten, Festungsmauern und die Zinnenmauern der Kaiser-Zitadellen haben jetzt echte Oberkanten. Du kannst auf Dächern stehen, über Dachschrägen laufen und von der Traufe springen, auf Wehrgängen entlanglaufen (Zinnen und Schornsteine sind dort Wände, Scharten eine Stufe) und vom Boden aus bleibt jede Wand zu.
  - **Kantengriff:** Springst du gegen eine Wand und liegt die Kante höchstens 1,6 m über deinen Füßen, ziehst du dich hinauf.
  - **Wandsprung:** Drückst du in der Luft an einer Wand Springen, stößt du dich ab (bis zu dreimal hintereinander) – ideal für vertikale Kämpfe mit Doppelsprung und Luft-Dash.
- **Himmelssturz trifft nie das eigene Schiff:** Meteore und Planet schlagen an Deck mindestens **28 m** vom Rumpf deines Flaggschiffs und deiner Begleitschiffe entfernt ein – die Trefferflächen wandern mit.
- **Spielstände:** Version 23 bleibt. Talentränge, Faji-Formen, gelernte Techniken, Frisur und Hut bleiben erhalten; alte Faji-Punkte landen als Bonus-Talentpunkte im gemeinsamen Topf (genau einmal).

**Technik (für Entwickler)**
- **Frisur:** `entities/character/layeredHair.ts` (rein: `HeadShape`, `LAYERED`, `cutStrands`, `buildLayeredHair` mit Kappe, Strähnen-Körpern, Umlaufsinn je Strähne, `computeVertexNormals`, Normalen-Neigung `normalBend`, Rückenauflage `drapeZ` als laufendes Maximum, Außenrichtung `outward` – unter der Kopfmitte waagrecht, sonst kippten die Querschnitte im Nacken). `VroidBase.headShape()`, `layeredHair(cut, seat, seatKey)` (geteilte Lage je Hut), Material = Instanz der Grundfrisur. Equipment `frisur_mehrlagig` = Teil `hairCut`; Blender-Modell und `build_frisur.py` entfernt. `sanitizeLook` behält `hairModel`.
- **Federketten der Rückensträhnen:** Kettengruppe `mane` (`CHAIN_LAYOUT.mane`, `CLOTH.mane`), Ruhelage aus den Strähnenbahnen (`maneRest`, je Kette die gewichtete Mitte der nahen Strähnen bis zur tiefsten Spitze), nur in der weiblichen Vorlage (`buildClothLayout(…, mane)`); Gewichte über den Wurzel-Winkel der Strähne (`LayeredHairGeometry.strandAz`, `VroidBase.chainWeights`); `setWorn('mane', …)`.
- **Hutsitz:** `HAT_RELAX` (lift 0,008, widen 1,035) in `seatFromSkull` und `adaptHead(…, relax)`; Ausrüstungshelme über `vb.hatSeat('helm')`, Modell-Hüte/-Helme über `glbHatSeat` (`fitSeatInside` mit `SKULL_KEEP`). **Schürzen:** `HatSeat.skirt` (`HatSkirt`: Sektor × Höhenstufe → innerster Halbmesser), `skirtFromRings` (Bausatz-Helme, Maße in `HELM_SKIRTS` in `gear/rigid.ts`), `skirtFromTriangles` (Modelle), angewandt in `squeezeUnderHat` (Krone + Schürze).
- **Assists:** Regeln rein in `combat/officerAssists.ts` (`OFFICER_ASSISTS`, `pickOfficer`, `assistBlock`, `assistCenter`, `salvoPoint`, `assistDamage`), Ablauf und Effekte in `world/officerAssistDirector.ts` (`AssistHost` aus `SeaWorld.assistHost`, Zeitachse ohne neue Objekte, Effekte über `AnimeVfxForge`/`CataclysmFx`), Treffer `CombatSystem.assistHit` (Haltung, Wurf, Jonglieren, `Enemy.airHoldT`), Trupps `TroopSquad.rally`, Offiziere `Ally.performAssist`. Aktionen `assist1–3` (Ziffern 8/9/0, `PAD_CHORDS` 4/5/6, Gruppe `assists`), HUD `FighterHud.setAssists`, Touch `TouchControls.setAssist` (`TOUCH_FOOT`).
- **Talente:** ein Topf `poolTotal`/`freePoints(t, level, techSpent)`, `TalentSave.bonus`/`fajiMerged`, `mergeFajiPoints` (einmalig beim Laden; `migrateSave` liest Merker und Bonus vor `fillDefaults`, sonst bekäme ein Stand aus 4.6G die Standardwerte eines neuen Spiels und zahlte seine Techniken doppelt), `grantBonus`, `techSpentOf`, `techRespecCost`. Fenster `ui/talentScreen.ts` neu (`TALENT_CATS`, `TalentView.tech/arts/aura`, `newTalentUi(baum, reiter)`), `Game.openTalents(reiter)`, `openSkills` leitet um, Stil `ui/css/talents.css` (`tal3-*`).
- **Dächer:** `world/roofFields.ts` (rein: `buildRoofField`, `placeRoof`, `roofHeight`, `roofMinOver`, `roofWall`, `ROOF`), Felder je Blender-Bau (`archRoofField`, `roofsOf`, `annotateTop` → `Blocker.top`), eingetragen in `islandDress`, `settlement`, `town` und `raidWorld` (`WalkIsland.roofs`). `IslandGround.height(x, z, y)` und `constrain(…, y)` werten sie nur mit Höhenhinweis aus (Spielfigur); Gegner, Kamera und Effekte sehen den Boden. Engine: `moveBody` → `ledge()` (Kantengriff, `ledgeReach` 1,6 m), Wandsprung über `wallT`/`wallKicks` (`ACTION_TUNING`), Ereignisse `ledge`/`wallKick`.
- **Himmelssturz:** `combat/skyfallClearance.ts` (`SKYFALL_SHIP_CLEAR` 28 m, `skyfallShift` entlang der Blickrichtung, `hullClearance`), `SeaWorld.skyShiftFor` → `CataclysmDirector.strike(…, shift)` und `ActionCombatEngine.ultShift` (Trefferflächen).
- **Prüfen:** `tests/officerAssistsTalentUiAndRoofs.test.ts` (25 Tests: Frisur-Normalen, Volumen je Strähne, Hülle und Ketten für Mann und Frau, Hutsitz samt Ausrüstungshelmen und Schürzen, Assists, Punktetopf und Übernahme, Fenster, Dächer und Zinnen, Himmelssturz). Browser: `qa_tmp/h46_setup.js`, dann `h46_hair.js`, `h46_helms.js`, `h46_mane.js`, `h46_nape.js`, `h46_roofs.js`, `h46_ledge.js`, `h46_citadel.js`, `h46_wallblock.js`, `h46_assists.js`, `h46_assistfx.js`, `h46_talents.js`, `h46_mobile.js` (Handy 390 × 844), `h46_startup.js` (Build). Gemessen im Build, im Wechsel mit 4.6G.3 auf demselben Rechner: Menü bereit nach 7,5 – 7,7 s (4.6G.3: 7,4 – 7,6 s), Hintergrund-Vorwärmen fertig nach gut 14 s (gleich), 170 – 171 Programme (gleich); Frisur, Helm-Schürzen und Ketten erzeugen keine neuen Programme; 1 170 Tests grün.

## 4.6.8 – Phase 4.6G.3: Hüte sitzen auf dem Kopf, keine Glatzen mehr, neu gebaute Mehrlagig-Frisur, straffe Mäntel und Brillen genau auf den Pupillen (25.11.2026, nur lokal)

**Was du siehst**
- **Hüte sitzen auf dem Kopf statt auf den Haarspitzen:** Alle acht Standard-Hüte greifen jetzt mit ihrem Band satt um Stirn und Hinterkopf – vorn knapp über den Brauen, hinten etwas tiefer, wie ein echter Hut. Bisher saßen sie auf den höchsten Haarspitzen und schwebten bei den Stachelfrisuren wie ein UFO über dem Kopf.
- **Keine kahle Stirn mehr unter Hüten:** Das Haar wurde bisher schon 4 cm unter dem Hutrand nach innen gezogen – über der Stirn entstand eine Glatze. Jetzt wird nur noch das Haar *in der Hutkrone* sanft hineingedrückt; Pony, Schläfen- und Nackenhaar bleiben voll. Eine dunkle, haarfarbene **Innenkappe** im Hut sorgt dafür, dass unter Krempe und Band nie Kopfhaut durchscheint.
- **Neu geformte Hüte** mit klaren Kanten, geschwungenen Krempen, Falten und Metall-Zier:
  - *Dreispitz:* kantige Krone, an drei Seiten steil hochgeschlagene Krempe mit scharfen Spitzen (eine über der Stirn), goldene Borte und Kokarde.
  - *Zweispitz:* quer getragen, zwei hohe halbmondförmige Krempen mit Goldborte, Kokarde und goldener Schlaufe.
  - *Marinemütze:* dunkles Band, ausgestellter Deckel mit Goldpaspel, glänzender Lederschirm, goldene Kinnkordel mit Knöpfen und ein Ankerwappen.
  - *Kochmütze:* Band und hoher, gefältelter Bausch.
  - *Wollmütze:* gestrickte Längsrippen, umgeschlagener gerippter Bund, kleiner Knauf.
  - *Südwester:* Kuppel aus sechs Bahnen mit Nähten, vorn schmale, hinten breite abfallende Krempe mit gerolltem Rand.
  - *Kopftuch:* straff gebunden, Zugfalten zum Knoten, gerollter Saum über der Stirn, Knoten mit zwei Zipfeln.
  - *Helm:* Stahlkuppel mit Kamm, vorn und hinten hochgezogene Krempe mit Rollrand, Messingnieten und Wappen.
  - Filz, Wolle und Tuch sind jetzt matt (kein Plastikglanz mehr).
- **Mehrlagig-Frisur neu gebaut** (für Mann und Frau): Die alte Frisur bestand aus einer zu kleinen Kugelhaube, die hinten in den Schädel schnitt (bei der Heldin eine große kahle Stelle am Hinterkopf), und aus flachen Kartenstreifen mit weißen Kanten. Jetzt liegt die Haube überall knapp über dem Schädel, und jede Strähne ist ein geschlossener, spitz zulaufender Körper: breites Deckhaar, ein voller Pony über die ganze Stirn, Seitensträhnen vor den Ohren und zwei Nackenlagen. Bei der Heldin sitzt sie starr am Kopf (vorher wurde sie mit der Körperform verzerrt und 1,4 cm nach vorn geschoben). Die Grundfrisur wird darunter vollständig ausgeblendet.
- **Weicher Haarglanz:** Das streifige, gezackte weiße Glanzband ist jetzt ein weicher Anime-Seidenglanz in der Haarfarbe.
- **Mäntel aus schwerem Tuch:** Lange Mäntel, Umhänge, Schultermäntel und deren leere Ärmel sind rund dreimal so steif und deutlich stärker gedämpft. Beim Anhalten schwingt der Stoff nur noch kurz nach (1,6 statt 9,5 cm, Ruhe nach 0,2 statt 1,2 Sekunden) und wabbelt im Stand nicht mehr. Wind und Sprint treiben ihn weiter kraftvoll, und kein Stoffglied klappt mehr über seine Gelenkgrenze hinaus.
- **Brillen genau auf den Augen:** Runde Brille, Fliegerbrille und Monokel sitzen jetzt exakt auf der **Pupillenmitte** – bisher richteten sie sich nach den Augenknochen, die bei den Anime-Gesichtern 2 cm näher an der Nase liegen; dadurch saßen die Gläser zu eng, zu weit vorn und wirkten zu tief. Die Gläser stehen jetzt direkt vor Wimpern und Nasensteg (mindestens 1,35 cm vor der Hornhaut).
  - Die **Fliegerbrille** sitzt jetzt vor den Augen: Lederschalen mit Messingringen, Steg über der Nase, Riemen über den Ohren nach hinten.
- **Augenklappe ohne Überschneidung:** Die Klappe liegt flach auf der Haut (die Wimpern darunter werden ausgeblendet), mit genähtem Rand. Ihr Riemen läuft schräg über die Stirn über der anderen Braue und über der Schläfe hinter das Ohr – nie mehr quer über das freie Auge. Ein **Monokel** wechselt dabei automatisch aufs freie Auge, eine **Vollbrille** sitzt mit Luft vor der Klappe (kein Flackern).
- **Drei-Tage-Bart liegt auf der Haut:** Die Stoppeln sitzen jetzt 1,5 mm über Wangen, Kiefer und Kinn – vorher schwebten einige vor dem Kinn und dem Hals in der Luft.
- **Spielstände:** unverändert (Version 23).

**Technik (für Entwickler)**
- **Hutsitz:** `entities/character/hatFit.ts` (rein): `SEATED_HATS`, `HAT_FIT`, `HAT_SEAT_STYLE`, `seatFromSkull` (Band aus dem Schädel-Radius-Feld), `squeezeUnderHat` (Haar nur über der Bandebene in das Kronen-Ellipsoid, darunter unverändert), `toSeat`/`fromSeat`/`bandYAt`. `VroidBase.skull()` (Radius-Feld aus Körper- und Gesichtshaut), `hatSeat(hut)`, `hairUnderBand(teil, hut)` (eigene, geteilte Lage, nichts abgeschnitten), `skullBox()`. Gemeinsame Rechnung für Grundfrisur und Frisur-Modelle: `hairSqueeze.ts` (`squeezePositions`).
- **Hüte:** `entities/character/seatedHats.ts` – `buildSeatedHat(hut, sitz, farben)` aus `hatShell` (Ringflächen mit Falten/Spitzen je Winkel), `domeRows` (Superellipse, liegt immer außerhalb der Krone), Innenkappe in Haarfarbe; alles über `finishMat` und `Bag` (geteilte Figuren-Programme). `attachHeadgear` nutzt den Sitz, sobald `FaceParts.hatSeat` gesetzt ist; Helme der Ausrüstung und Hüte aus Modellen behalten `CAPPED`.
- **Frisur-Modelle am Kopfknochen:** `glbGear.adaptHead` überträgt Modelle mit `mode: 'bone'` am Kopf starr (relativ zum Kopfknochen, je Achse mit dem Schädelverhältnis, `MALE_SKULL`) statt über die stückweise Körper-Abbildung; unter Standard-Hüten `squeezeUnder` (`HeadFitOpts`). `tools/blender/build_frisur.py` misst den Schädel in Blender und baut geschlossene Linsen-Strähnen (9 324 Dreiecke, Draco 31 KB). Haar-Randlicht `finishMat('haar')` 0,4.
- **Augen:** `Anchors.pupilL/R` (Iris-Mitte, Hornhaut), `VroidBase.eyeFront` (Haut, Brauen, Wimpern vor dem Auge), `lensPlane`/`LENS_AHEAD`/`LENS_CLEAR`/`LENS_R`/`MONO_R`/`GOGGLE_R`; Augen-Sockets `eyeLeft/Right` auf den Pupillen (`measureSockets(…, pupils)`). Augenklappe `eyePatch` (Schale über dem Gesichtsfeld, `PATCH_*`, Riemen über `skinStrap`/`thetaAtX`/`thetaAtDepth`), Wimpern darunter `VroidBase.lashUnderPatch` (Maske behält die Morph-Ziele). Fliegerbrille `goggles`. Gesichtsfeld reicht bis zur Stirn.
- **Stoff:** `CLOTH` (steifer, stärker gedämpft, kleinere Trägheit, `drag` verdoppelt), neues Feld `maxBend` (Gelenkgrenze je Glied, `SpringChains.bend`, Messwert `maxBendSeen`), Boden gilt auch im Längen-Schritt; Vergleichswerte `CLOTH_LEGACY`.
- **Bart:** Stoppeln auf der Haut (`fieldPoint(…, hang = false)`, `STUBBLE_LIFT` 1,5 mm, `STUBBLE_UNDER_JAW`).
- **Haarglanz:** `CHAR_GLSL` Haar-Zweig (Band-Exponent 70 statt 260, Zacken 0,07 statt 0,2, Rauschen aus der Lage statt aus dem Winkel um den Kopf) – gleiches Programm.
- **Prüfen:** `tests/characterHatHairAndFaceFit.test.ts` (20 Tests: Stirn unter Hüten, Passform, Hut um die Krone, Mehrlagig-Normalen/Hülle/Verankerung für Mann und Frau aus der echten Datei, Stoff, Brillen/Monokel/Augenklappe, Stoppeln, Haarglanz). Browser: `qa_tmp/g463_shots.js` nach `qa_tmp/g462_setup.js`, Bilder in `qa_tmp/g463/`. Gemessen: Build-Start Menü 5,1 – 5,3 s, Vorwärmen fertig 7,6 – 7,8 s, 170 Programme; alle Hut-, Brillen- und Frisur-Materialien laufen über beim Start vorgewärmte Programme; 1 147 Tests grün.

## 4.6.7 – Phase 4.6G.2: saubere Anime-Gesichter ohne Schmutzflecken, die weibliche Spielfigur, Kleidung ohne Durchstechen, Bärte aus Strähnen, richtige Brillen und eindrucksvolle Endgame-Rüstungen (25.11.2026, nur lokal)

**Was du siehst**
- **Saubere Gesichter:** Die grau-braunen „Schmutzflecken“ auf Stirn, Ohren und Hals sind weg. Ursache war die Umgebungsverdeckung (AO) des Bildes, die unter Ponys und Haarsträhnen dunkle Flecken auf die Haut malte – Haut, Haare, Augen und Gesichtsteile bleiben jetzt frei davon, Kleidung bekommt nur noch gut die Hälfte. Die **Ohren** waren zudem ein Netz, das nie das Anime-Material bekam (kein Hautton, kein Licht) – jetzt haben sie Hautfarbe und Anime-Licht wie das Gesicht.
- **Ausdrucksstärkere Augen:** dunkle, gestochen scharfe **Wimpern und Lidstriche** (vorher blassgrau), ein dunkler **Irisrand** mit sanftem Verlauf zur Mitte, die zwei Glanzpunkte bleiben. Das **Haar** zeigt kein Zebramuster mehr (die eingebackenen Glanzstreifen sind abgeschwächt, das gezeichnete Lichtband bleibt).
- **Männlich oder Weiblich:** Ganz oben im Reiter *Körper & Statur* wählst du das Geschlecht. Die **Heldin** hat ihre eigene Grundfigur (schmalere Schultern, Taille, feineres Kinn, längere Wimpern, lange Zöpfe), eine **eigene Haltung** (Kontrapost im Stand, schwingende Hüfte beim Gehen, Arme mit Abstand zur Hüfte, Schultern etwas zurück) – mit jeder Statur kombinierbar. **Alle Oberteile, Mäntel, Rüstungen und Hosen** passen sich ihrer Silhouette an; Mäntel und Westen haben bei ihr einen **V-Ausschnitt** (vorher folgte die Öffnung der Brustform). Jeder Reiter hat **Vorlagen** für beide Geschlechter (z. B. *Kapitänin*, *Kriegerin*, *Offizierin*, *Seebär*, *Admiral*). Der Größen-Regler zeigt die echte Größe der Figur. Zufallsfiguren, Stadtleute, Seeleute und Marine sind jetzt auch weiblich; die Crew-Frauen bleiben Frauen (Grete Amboss jetzt auch).
- **Nichts sticht mehr durch:**
  - **Lange Mäntel:** hinterer **Gehschlitz**, weiter ausgestellte Schöße, die Stoffketten halten Beine samt Hose und Stiefelstulpe auf Abstand – Knie und Stiefel stechen beim Gehen nicht mehr durch Mantel oder Kaiser-Umhang.
  - **Weibliche Figur:** Die Brust hängt im Skelett an eigenen Knochen, die die Kleidung nicht zum Oberkörper zählte – der Mantel ließ dort ein brustförmiges Loch. Die Finger stachen bei entspannten Armen durch die Hose; jetzt halten die Arme Abstand.
  - **Hüftplatten** (Souverän, Kriegsherr, Ritter …) liegen klar über Jacke und Uniformsaum (vorher Flackern) und sind vorn unter dem Gürtel geschlossen (vorher ein gezacktes Loch).
  - Die **weiße Zackennaht** oben am Mantelrücken (Kaiser-Regalia, Kosmos-Umhang) ist weg: der Energie-Saum hatte versehentlich das Zickzack einer anderen Borte geerbt.
  - Die **goldenen Knöpfe** saßen seit 4.6G auf dem **Rücken** der Mäntel – jetzt vorn an der Knopfleiste.
  - **Haare unter Hüten:** Unter Dreispitz, Marinemütze, Helmen und Kronen wird die Frisur weich nach innen und unten gestaucht – keine Strähne mehr durch Krempe oder Krone.
- **Bärte aus Strähnen:** *Schnurrbart*, *Kinnbart*, *Koteletten* und *Vollbart* bestehen jetzt aus weich verjüngten Strähnen in zwei Lagen, die Lippe, Kinn und Kieferlinie folgen, mit feiner Haar-Textur und Lichtband – statt kantiger schwarzer Polygon-Blöcke. Neu: der **Drei-Tage-Bart** (feine Stoppeln auf Wangen, Kiefer und Oberlippe).
- **Brillen sitzen richtig:** Die Bügel knicken am Scharnier im **rechten Winkel nach hinten** und laufen an der Kopfseite entlang über das Ohr bis zu einem kleinen Ohrhaken – keine seitlich abstehenden Stangen mehr. Mit **Augenklappe** rückt die Brille ein Stück vor die Klappe, statt sie zu schneiden.
- **Admirals-Schultermantel:** Die leeren Ärmel sind **weich gefaltete, konisch verjüngte Stoffröhren mit runder Schulterkappe** (vorher steife Kästen). Bei der weiblichen Figur standen sie senkrecht nach oben – jetzt hängen sie.
- **Endgame- und Samurai-Rüstungen:**
  - **Runen** aus einer gestochen scharfen 512 × 512-Ornament-Textur: acht eigene Sturmkrone-Zeichen (Welle, Anker, Blitz, Dreizack, Sichel, Stern, Krone, Auge) im Ring, mit eingravierter Kante und wanderndem Glimmen – statt dünner Striche.
  - Neues **Gold-Filigran** (Ranken mit Spiralen und Perlen, glänzender als der Grund) auf dem Prunkrock der Kaiser-Regalia, dem Souveränsharnisch und dem schwarzen Lackharnisch von **Kurogane**.
  - **Geschwungene Schulterpanzer** (gewölbte, am Rand ausgestellte Schale, überlappende Lamellen, Goldkamm, Leucht-Einlagen) statt der flachen Flügel-Spatel: Kaiser mit drei goldenen Schwingen und Rubin, Souverän mit Blitz-Finnen, Kosmos mit Sternbild und Sternenreif – auch an *Sturmgeborene*, *Gezeitenkönig* und *Himmelsrichter*.
  - **Fließende Energie-Säume:** heller Kern mitten in der Borte, wandernde Lichtwellen und züngelnde Ausläufer.
- **Ruhe im Editor:** Solange der Charakter-Editor offen ist, erscheinen keine Welt-, Handels- oder Ereignismeldungen mehr über der Bühne, und eine gerade sichtbare verschwindet beim Öffnen.
- **Spielstände:** Version 23 bleibt. Alte Stände laden als **männlich** – außer die Figur trug die lange Grundfrisur, mit der bisher die weibliche Grundfigur gewählt wurde: sie bleibt weiblich und sieht aus wie vorher.

**Technik (für Entwickler)**
- **AO und Haut:** `CLEAN_ALPHA` (0,99, `render/toon.ts`) für Haut, Haar, Augen und Gesichtsteile (`skSurf` 0, 1, 5, 6); `gtao.ts` liest das Alpha aus dem Szenenbild (`inputBuffer`) und setzt die Verdeckung dort auf 0, an Figuren-Kleidung (0,98) auf 0,55. Morph-Gruppen (`mergeParts`): auch die weiteren Netze eines Teils bekommen `vroidPart` und fehlende Normalen; `equipVroid` maskiert nur das Netz, das die Vorlagen-Geometrie trägt.
- **Gesicht:** Teil-Art `lash` (Wimpern, Lidstrich: `LASH_TONE`, Randlicht 0), Irisrand im Augen-Zweig von `CHAR_GLSL`, Haar-Grundtextur `HAIR_CONTRAST`.
- **Geschlecht:** `CharacterLook.gender`, `GENDERS`, `genderOf` (fehlend → männlich, alte lange Grundfrisur → weiblich), `defaultLook(faction, gender)`, `LOOK_PRESETS` (je Geschlecht und Reiter), `FEMALE_SHARE` und `randomLook` (Geschlecht zuerst), `sanitizeLook` (Frauen ohne Bart), `migrateSave` liest das Geschlecht vor dem Auffüllen mit Standardwerten. Crew: `gender: genderOf(def.look)`. Editor: `lookForGender`, `GENDER_INFO`, `BASE_CM`, Aktionen `gender`/`preset`, Vorlagen-Reihe `presets(tab)`. Rig: `FIGURE_POSE` (`data/characterRig.ts`), `CharacterRig.setFigure`, `figureStep` (Schrittphase aus den Knien, Kontrapost im ruhigen Stand), Wirkung über Hüfte/Wirbelsäule/Brust/Schultern/Kinn und `ARM_RELAX`.
- **Kleidung:** Brust-Knochen `Bust*` zählen zum Rumpf (`boneClass`); `Region.female` mit V-Ausschnitt `vNeck` für Mantel und Weste; `garmentOffset` und `classWeights` exportiert (Prüfungen); Mantel: `COAT_VENT`, `COAT_FLARE`, `TAIL_HIPS` 0,68; Kettenschöße weiter außen/hinten (`clothRig.ts`), `LEG_CAPS`, `CLOTH.coat.radius` 0,055; Hüftplatten über eigenem Oberteil; Knopfleiste mit Normalen in Weltlage. Hüte: `VroidBase.hairUnderHat` (eigene geteilte Lage, `HAT_SQUEEZE`), `hairSqueezeFor` (Hüte ohne Kappe), Kappen schneiden wie bisher (`hairUnderCap`).
- **Bärte:** `entities/character/beardStrands.ts` (rein bis auf BufferGeometry): `buildFaceField` (Radius-Feld der Gesichtshaut, Hüllkurve unter dem Kinn), `jawFromField`, `strandLayout` (zwei Lagen je Form), `buildBeardGeometry` (Rauten-Röhren, Normalen zur Gesichtsfläche geglättet; Stoppeln als Dreiecksfeld), `beardStrandTexture` (512 × 512 ORMH). `VroidBase.faceField()`/`beard(kind)`. Material: `toon({ surface: 'hair', forgeTex })` – neue Option `forgeTex` (eigene Schmiede-Textur als Uniform, kein neues Programm), Haar-Oberfläche liest sie im Mikro-Zweig.
- **Brillen:** `templePath` (Bügelweg an der Kopfseite aus dem Feld), `templeHinge`, `roundGlasses(…, ahead, field)`, `EYEPATCH_DEPTH`/`PATCH_SINK`; `Anchors.skullX`/`earTopY`, Schläfenbreite nur aus der Gesichtshaut vor den Augenknochen.
- **Ärmel:** `sleeveGeo` mit Schulterkappe, 16 Punkten je Ring, Faltenwellen und Verjüngung; Schulterkuppe in `buildClothLayout` höchstens 9 cm über dem Oberarm-Gelenk.
- **Rüstung:** `graphics/gearOrnaments.ts` (`gearOrnamentTexture`: R Runen, G Filigran, B Hof; `runeLayout`, `RUNE_KINDS`), Uniform `uSkOrn` im Borten-Programm, Muster 9 `filigran` (`PATTERN_NO`), Ableitungen ohne den atan-Sprung (`textureGrad`); Bortenart 3 mit Kern und Zungen, Zickzack nur Bortenart 2. Schultern `schulter_kaiser`/`schulter_souveraen`/`schulter_kosmos` (`pauldronCore`, `sweptShell`, `wingBlade` in `gear/rigid.ts`, je Seite unter 3 000 Dreiecke).
- **Editor-Ruhe:** `Hud.setQuiet`/`isQuiet` (Toasts und Hinweise verworfen), gesetzt in `Game` beim Zustandswechsel nach `editor`.
- **Tests:** `tests/characterPolishAndFemaleRig.test.ts` (26 Fälle: Geschlechtswahl und Vorlagen, Haltung, Kleidung an der weiblichen Brust und V-Ausschnitt, Gehschlitz und Bein-Kapseln, Hüftplatten, Energie-Saum, AO-Kennung, Hüte, Brillenbügel und Augenklappe, Bärte auf dem Gesicht, Ärmel-Form, Ornament-Textur und Schulterpanzer, keine neuen Programme, Editor-Toasts, Spielstände). Insgesamt 1 127 Tests.
- **Gemessen:** Build-Start bis Titelbild 6,6 s (zweiter Lauf), 170 Shader-Programme.

## 4.6.6 – Phase 4.6G: der neue Charakter-Editor mit Kamera-Fokus, Haltungen und Licht, natürliche Ruhe- und Kampfposen, alle Kopfteile, Bärte, Schals und Rückenwaffen sauber an den Sockets, echter Schultermantel mit leeren Ärmeln und die Kaiser- und Endgame-Ausrüstung mit Anime-Effekten (25.11.2026, nur lokal)

**Was du siehst**
- **Neuer Charakter-Editor in sechs Reitern:** *Körper & Statur* (Name und Herkunft beim neuen Spiel, Statur, Größe, Hautton), *Gesicht & Augen* (Augenfarbe, Mimik zum Ansehen, Narbe), *Haare & Bärte*, *Kleidung & Mäntel*, *Hüte & Accessoires* (Kopfbedeckung, **Brille**, Augenklappe, Ohrring, Handschuhe) und *Rüstung & Waffen-Optik* (Kampfstil und Klinge, angelegte Ausrüstung, Rüstkammer, Regler „Ausrüstungs-Aura“). Die Reiter stehen in zwei Reihen – keine Beschriftung wird mehr abgeschnitten, auch nicht am Handy.
- **Kamera-Fokus auf der Bühne:** *Gesicht (Nahaufnahme)*, *Oberkörper & Mantel*, *Ganzkörper*. Die Figur lässt sich frei **rundum drehen** (Maus oder Finger) und jetzt auch **von oben und unten** ansehen; zwei Finger oder das Mausrad zoomen. Jeder Reiter wählt den passenden Blick von selbst (Hüte und Brillen: Kopf samt Hut).
- **Haltungen zum Ausprobieren:** *Entspannte Hafen-Haltung* (Klinge auf dem Rücken, lockerer Stand), *Kampfbereitschaft* und *Sturm-Erwachen* (leuchtende Augen, Sturmwind in Mantel und Haar, Funkenkranz und aufsteigende Energiespirale). Dazu das **Licht:** *Hafen-Sonne* oder *Nacht-Laterne* (Mondlicht und eine warme Laterne).
- **Aufgeräumte Auswahl:** Die **Fliegerbrille ist kein Hut mehr**, sondern eine eigene **Brillen**-Kategorie – mit **runder Brille** und **Monokel** als Neuheiten, und jede Brille passt zu jedem Hut. Die Hutfarbe wirkt jetzt auch bei Marine- und Kochmütze (die waren fest weiß). Der Kamera-Knopf „Rüstung“ zeigte in Wahrheit den Oberkörper – er heißt jetzt so. Zufallsfiguren mit langem Haar bekommen keinen Bart mehr. Welt-Meldungen (Ereignisse, Krieg) legen sich nicht mehr über die Studio-Bühne von Editor, Inventar und Faji-Baum.
- **Natürliche Posen:** Im Stand hängen die **Arme locker** am Körper statt in der steifen A-Haltung (mit leicht gebeugtem Ellbogen, unter Mänteln mit etwas Luft, je nach Statur). Atem, Blick, Gewichtsverlagerung und Kurvenneigen haben feste **Obergrenzen** – kein verdrehter Oberkörper mehr, der Kopf dreht sich nicht mehr übermäßig, und beim Sprint in Kurven neigt sich die Figur höchstens noch rund 7° (vorher bis 17°).
- **Rückenwaffen:** Nach ein paar ruhigen Sekunden steckt deine Figur die Klinge **auf den Rücken** – Griff über der rechten Schulter, die Klinge schräg über den Rücken, Doppelklingen gekreuzt, lange Klingen steiler. Jeder Angriff zieht sie im selben Augenblick. Am **Steuerrad** stecken Klinge und Schild ebenfalls auf dem Rücken (vorher verschwanden sie). Unter einem Umhang liegt die Waffe verdeckt.
- **Kopfteile sitzen richtig:** Brillen, Monokel und **Augenklappe** steckten bisher 2 – 3 cm **im Gesicht** (die Augen der Anime-Figuren liegen gut 7 cm hinter der Haut) – jetzt liegen sie auf der gemessenen Gesichtsoberfläche; das Band der Augenklappe läuft schräg über die Schläfe um den Kopf, die Bügel der Brille an den Schläfen vorbei bis über die Ohren. Gläser zeigen einen Anime-Glanzstrich, die Augen bleiben sichtbar.
- **Echter Admirals-Schultermantel:** Der lässig über die Schultern gelegte Mantel hat jetzt **zwei leere Ärmel**, die an eigenen Feder-Ketten hinter den Armen hängen, beim Laufen nachschwingen, im Wind wehen und an den Armen abgleiten statt hindurchzugehen – mit Borte am Aufschlag und dunkler Öffnung.
- **Saubere Mäntel und Umhänge:** Die kleine helle **Naht am Rücken** einiger Mäntel ist weg, und **Umhänge setzen über dem Hemdkragen** an (vorher begannen sie darunter).
- **Mehr Stoff- und Metall-Details an der Alltagskleidung:** **Knopfleisten** auf Uniformrock, Jacke, Weste und langen Mänteln (offene Mäntel mit zwei Reihen an den Kanten), Goldborten und Schulterstücke am Kapitänsmantel, Lederoberflächen mit Borten an Jacke, Weste, Koppel und Stiefeln, Seide an Halstuch und Schärpe, Zierlinien an Uniform und Mänteln.
- **Vier Endgame-Sets** mit **Energie-Säumen** (leuchtende Borten, über die Lichtwellen laufen), **schimmernden Runen** (Zeichen, die nacheinander aufglimmen), eindrucksvollen **Umhang-Silhouetten** und feinen **Aura-Teilchen** an Schultern, Umhang und Krone – im Kampf stärker, im Editor und in den Einstellungen regelbar („Ausrüstungs-Aura“, 0 – 100 %):
  - **Kaiser-Regalia** (Purpur, Hermelin, Gold; Schwalbenschwanz-Mantel, Kaiserkrone): **je besiegtem Kaiser ein Stück**.
  - **Mythische Kriegsherren-Rüstung** (schwarzer Sternenstahl mit glühenden Adern, zerrissenes Kriegsbanner): Meilensteine **ab Stufe 80**, alle drei Stufen ein Stück.
  - **Sturmkrone-Souverän** (Sturmweiß und Blitzblau, Gewittermantel mit Zackensaum): **Stufe 100**.
  - **Kosmos-Umhang** (Nachthimmel mit treibenden Sternbildern, Sternspitzen-Saum, Sternenreif): eine **verborgene Belohnung**.
  Wer diese Erfolge schon hat, findet die Stücke beim Laden im Beutel. Sie fallen nie als Beute, liegen in keinem Laden und tragen keine Gegner.

**Technik (für Entwickler)**
- **Editor `ui/editor.ts`:** Reiter `EDITOR_TABS`, Kamera `CAM_FOCUS`, Haltungen `STAGE_POSES`, Licht `STAGE_LIGHTS`, Mimik-Vorschau `MOOD_PREVIEW`, Unterbereiche `ARMOR_SUBS`, `armorySets` (verborgene Sets erst mit einem Stück), neue Rückrufe `onPose`/`onLight`/`onMood`/`onAuraLevel`, `onRotate(dx, dy)`. Studio-Daten rein in `data/editorStudio.ts` (`STAGE_FOCUS`, `STAGE_LIGHTING`: nur Stärken und Farben, die Zahl der Lichter bleibt fest). `EditorStage`: `setPose`, `setLight`, Kamera-Fokus mit gemessener Augenhöhe, Umkreisen nach oben/unten, Laterne als festes Licht, `attachVfx` mit den **ausgeliehenen** Effekt-Pools der Welt (`SeaWorld.lendVfx`: gleiche Instanz-Netze und Programme), eigene `GearAura`. `SkillStage` bleibt in Kampfhaltung. Layout in `ui/css/screens.css` (`.ed3-left`, Reiter-Raster 3 × 2, Anprobe-Hinweis am Handy unten).
- **Kategorien:** `GLASSES` (keine, Fliegerbrille, runde Brille, Monokel) und `CharacterLook.glasses`; `HATS` ohne `brille`; Stücke `brille_flieger`/`brille_rund`/`monokel` (`GLASSES_ITEM`, Teil `glasses`), `ResolvedLoadout.glasses`; die Alt-Liste der Köpfe (`items.ts`) führt die Fliegerbrille als Brille.
- **Sockets:** `attachHeadgear` gibt die Teile zurück und hängt jedes an seinen Socket (`userData.socket`; Hüte → `headTop`, Brillen/Narbe → `faceFront`, Monokel/Augenklappe → `eyeLeft`/`eyeRight`, Bart/Ohrring → `beardJaw`), die Lage am Kopf bleibt exakt. **Gesichtsoberfläche gemessen:** `Anchors.faceZ`/`templeX` (`VroidBase.anchors`) und `measureSockets` (Augen- und Gesichts-Sockets auf der Haut statt geschätzter 4,5 cm). Grenzen `SOCKET_BOUNDS`, Zuordnung `ACCESSORY_SOCKET`. Prüfwerkzeug im Browser: `qa_tmp/g46_land.js` (`__audit46`), `g46_combos.js` (18 Aussehen, 112 Teile, keine Ausreißer).
- **Rückenwaffe:** `Character.sheathe(on, grip, all)` (Socket `backWeapon`, Lage aus `sheathPose`, Abstand je Kleidung `SHEATH.clear`, unter Umhang verdeckt; `hold` stellt weggesteckte Waffen vorher zurück, `dispose` gibt sie mit frei), Klingenlängen `SHEATH_LEN` an den Waffen (`userData.bladeLen`). `PlayerFoot`: nach `SHEATH.calmAfter` (6 s) ohne Kampf, ruhiger Stand-Clip mit weggesteckter Zweihandklinge; `SeaWorld.equip`/`attachToHelm` am Steuer.
- **Haltung:** `ARM_RELAX` (Ziel-Abspreizung je Statur, nur in ruhigen Clips `RELAX_CLIP`, mit Waffe zu 45 %), `ROT_BUDGET` (Budgets je Knochen und Achse, `CharacterRig.budget`, Zähler `budgetHits`).
- **Schultermantel-Ärmel:** Kettengruppe `sleeves` (`CHAIN_LAYOUT.sleeves`, Abstimmung `CLOTH.sleeve`) am oberen Brustkorb, Röhren-Netz `sleeveGeo` (8 Punkte je Ring, dunkle Innenkappe, `rimD` für die Borte am Aufschlag, geteilt), `Character.addSleeves` im Kleidungs-Programm; Arm-Kapseln nur, solange Ärmel schwingen.
- **Umhang:** Profil über dem Grundhemd für jeden Umhang, Oberkante über dem Kragen; Schnitte `CapeCut` (`zacken`, `schwalbe`, `zerrissen`, `sterne`) über `capeCutLift` (rein). Rückennaht: verschweißte Nahtpunkte werden am Ende gemittelt.
- **Kleidung:** starres Teil `knoepfe` (`VroidBase.buttonAnchors`: vorderster Stoffpunkt je Höhe, Haut-Anker je Knopf; gemeinsame Geometrie `buildButton`), aufgewertete Look-Stücke in `data/equipment.ts`.
- **Endgame:** Sets mit `endgame`/`secret`/`source` in `data/gear.ts` (`ENDGAME_SETS`, `WARLORD_LEVELS`, `endgamePieces`, `endgameEarned` – rein), Stufe 5, ausgeschlossen aus Beute, Gegnern und Laden; Vergabe `Game.grantEndgame` (Kaisersieg, Stufenaufstieg, Aufstieg, beim Laden still). Borte 3 (Energie-Saum) und Muster 8 (Runen) im **bestehenden** Borten-Programm `sk-toon-10ct` (`GEAR_FRAG_GLSL`, Leuchten über `totalEmissiveRadiance`, gemeinsame Uniform `toonShared.gearGlow`); Aura `graphics/gearAura.ts` (`GearAura`, Teile `aura` mit Art/Ort/Farben/Rate, Ausstoß über `AnimeVfxForge.burst` – Glut und Funken aus den vorhandenen Pools). Einstellung `gearAura` (Bereich „HUD & Spiel“).
- **Spielstand 23:** Migration 22 → 23 (Fliegerbrille als Hut → Brille, schon verdiente Endgame-Stücke in den Beutel); `sanitizeLook` wandelt den alten Wert auch ohne Migration.
- **Leistung:** keine neuen Shader-Programme (Säume, Runen, Ärmel, Knöpfe, Brillen in vorhandenen Programmen; Effekte in den Pools der Effekt-Schmiede); keine Speicheranforderung je Bild (Farben der Aura je Ausrüstungswechsel vorberechnet). Gemessen (Entwicklungsserver): Rig mit Schultermantel samt Ärmeln 0,056 ms je Figur und Logikschritt (ohne Umhang 0,027 ms), Aura 0,006 ms je Bild bei 13 Teilchen je Sekunde im Kampf. **Start im Build:** erste Vorwärmstufe nach **7,4 – 7,8 s** (Grenze 9 s), **172 – 174 Shader-Programme** (4.6.5: 171 – 173).
- **Tests:** neu `tests/characterEditorAndVfxGear.test.ts` (24 Prüfungen): Reiter, Kamera, Haltungen, Licht und alle Beschriftungen (deutsch, eindeutig, kurz genug), baubare Kopfbedeckungen, Hutfarbe, Brille plus Hut, Zufallsfiguren und alte Werte, Rüstkammer; Socket-Grenzen, Brille/Monokel/Augenklappe/Ohrring an ihren Sockets und vor der Gesichtshaut, Rückenwaffen aller Klingen (im Socket, über dem Boden, nie im Körper); Arm- und Drehbudgets; Ärmel-Ketten (hängen, nie in Arm oder Rumpf, schwingen beim Laufen, kommen zur Ruhe, Wind und Stöße); Endgame-Sets (nie als Beute, Säume, Runen, Schnitte, Aura, gleiches Programm, Aura-Stärke, Vergabe) und Spielstände der Version 22. Angepasst: `balance` (Endgame = Stufe 5), `inventory` (Knopfleiste der Jacke), `deepTalentTreesAndAscension` (Version ≥ 22). **1101 Tests**, `tsc` und `npm run build` grün.
- **Im Browser geprüft** (Playwright, Entwicklungsserver und Build): Gesichter mit allen Brillen, Hüten, Bärten und Augenklappe an beiden Grundfiguren, Rückenwaffe (Langklinge, Säbel) an Land und am Steuerrad, Schultermantel mit Ärmeln von hinten und von der Seite, entspannte Arme, alle vier Endgame-Sets bei Nacht von vorn und hinten, der Editor in allen Reitern, Haltungen und Lichtern, am Handy im Hochformat; keine Konsolenfehler.
- **Entscheidungen:** Die Kaiser-Regalia kommen aus den Kaisersiegen (Ring 5), die Kriegsherren-Rüstung aus Stufen-Meilensteinen ab 80, der Souverän mit Stufe 100, der Kosmos-Umhang nach dem Aufstieg; seine Texte nennen keine Stufe über 100. Ohrringe hängen am Kiefer-Socket (es gibt keinen eigenen Ohr-Socket unter den zwölf).
- **Offen / nicht geprüft:** kein echtes Handy und kein Gamepad, nicht alle Grafikstufen. Die Ärmel hängen am oberen Brustkorb (heben sich nicht mit einem über den Kopf gestreckten Arm). Frisuren aus Blender-Modellen bleiben starr. Gegner und Stadtleute stecken ihre Waffen nicht weg (nur die Spielfigur).

## 4.6.5 – Phase 4.6F: das organische Anime-Figuren-Rig – Statur, Hände, lebendige Gesichter mit Blinzeln und Mimik, Atem, Blick und Gewicht, federnde Landungen, Mantel-, Umhang-, Haar- und Bänderphysik an Feder-Ketten, Endbosse in Übergröße und zwölf feste Befestigungs-Sockets (25.11.2026, nur lokal)

**Was du siehst**
- **Gesichter leben:** Jede Figur **blinzelt** jetzt – in unregelmäßigen Abständen, manchmal doppelt, manchmal nur halb, das Lid schließt schnell und öffnet langsamer; bei einem schnellen Blickwechsel blinzelt sie oft mit. (Vorher blinzelte keine Figur: die Gesichtsformen im Modell trugen nur Nummern statt Namen, das Spiel fand sie nie.)
- **Mimik wechselt von selbst:** entspannter **Hafen-Blick** mit leichtem Lächeln, **konzentrierter Kampf-Blick** (Brauen zusammen, Augen schmal), sobald Gegner nah sind, kurzer **Schmerz** nach Treffern, und im **Sturm-Erwachen** und bei **Ultimates** ein **entschlossenes Grinsen mit Fangzahn und leuchtender Iris** in der Farbe deines Stils. Dazu Jubel (^^-Augen), Staunen, Grimm und Hochmut für Bosse und Stadtleute. Die Editor-Wahl für Augen, Brauen und Mund (z. B. „Scharf“, „Entschlossen“, „Grinsen“) prägt das Gesicht jetzt sichtbar mit.
- **Blick folgt dem Geschehen:** Kopf, Hals und Oberkörper drehen sich weich zum erfassten oder nächsten Gegner, die **Augen eilen voraus**. Stadtleute **schauen dir nach**, Crew-Offiziere blicken zum Gegner oder zu dir, am Steuerrad geht der Blick in Fahrtrichtung voraus.
- **Atmen und Gewicht:** Der Brustkorb **hebt und senkt sich**, die Schultern gehen mit – nach einem Sprint schneller und tiefer. Im Stand **verlagert** die Figur langsam das Gewicht von einem Bein aufs andere (die Füße bleiben dabei fest stehen), dazu kleine Bewegungen der Arme und des Kopfes – niemand steht mehr starr.
- **Weiche Gelenke:** Der Hals übernimmt einen Teil jeder Kopfdrehung, der obere Brustkorb einen Teil der Rumpfbiegung, der Unterarm die halbe Drehung der Hand (kein verdrehtes Handgelenk mehr bei Schwertstößen), und das **Schlüsselbein hebt sich**, wenn der Arm über die Schulter geht.
- **Drei Staturen statt einer breiter gezogenen Figur:** „Schmal“ wird **schlank**, „Normal“ **athletisch** (breitere Schultern, schmalere Taille), „Kräftig“ **wuchtig** (breite Brust, kräftige Arme und Schenkel, dickerer Hals, etwas kleinerer Kopf). Die Glieder werden um ihr Gelenk dicker oder dünner, Knie und Ellbogen bleiben, wo sie sind; vorher wurde bei „Kräftig“ die ganze Figur samt Kopf in die Breite gezogen.
- **Hände mit Haltung:** entspannt offene Hand, **geballte Faust** (Faustkampf im Kampf), **Schwertgriff**, lockerer Griff am Steuerrad, **Zeigen** und **erklärende Geste** im Gespräch – alles weich überblendet.
- **Bewegung mit Gewicht:** Beim Sprinten durch Kurven **neigt sich die ganze Figur** in die Kurve (bis 17°) und lehnt sich vor; nach Sprüngen und Stürzen **federt sie in die Knie**, je höher der Aufprall, desto tiefer; in Kampfnähe steht sie in **Bereitschaft** (Knie leicht gebeugt, Oberkörper vor, Arme zur Deckung). Auf **Rampen, Brücken, Treppen und schrägen Decks** setzen die Füße auf dem Boden auf, statt in der Luft zu hängen oder einzusinken.
- **Mäntel, Umhänge, Haare und Bänder schwingen:** Die Schöße langer Kapitäns- und Admiralsmäntel, Rocksäume, Umhänge, die **Haarsträhnen**, die **Enden des Halstuchs** und die **Bänder der Schärpe** hängen an Feder-Ketten: Sie wehen im **Seewind** (mit Böen), fliegen beim Sprint und beim **Dash** nach hinten, schlagen beim **Doppelsprung** und bei der Landung nach, wirbeln beim **Sturm-Schritt** hinter dir her und werden von der Druckwelle des **Sturm-Erwachens**, des **Königsdrucks**, von Einschlägen und **Ultimates** weggerissen – bei dir und bei allen Figuren ringsum. Sie stoßen dabei an Beine, Rumpf, Kopf und den Boden bzw. das Deck, statt hindurchzugehen.
- **Neu: Schultermantel** – der Admiralsmantel **lässig über beide Schultern gelegt** (ohne Ärmel), mit goldener Borte; er schwingt an den Umhang-Ketten. Im Editor unter „Mantel“ wählbar; Marine-Offiziere tragen ihn oft.
- **Endbosse mit Präsenz:** Die sechs **Königs-Endbosse** der Belagerungen stehen jetzt **1,36 – 1,5 ×** so groß wie du, die fünf **Kaiser 1,5 – 1,65 ×** – in Koloss-Statur mit eigener Haltung (breitbeinig, lauernd, herrschaftlich aufgerichtet), schwerem, langsamem Atem und grimmigem oder hochmütigem Blick; in ihrer zweiten Phase grinsen sie entschlossen. Ihre Trefferzonen wachsen mit.
- **Lebendige Stadtleute:** Händler, Hafenmeister, Wachen, Fischer und Offiziere atmen, blinzeln, haben je Rolle eine eigene Haltung (Wachen aufrecht, Fischer gebeugt, Schmiede breitbeinig) und einen eigenen Grund-Ausdruck. **Im Gespräch** sprechen sie mit dem Mund (wechselnde Laute, Pausen zwischen Wörtern), **gestikulieren** mit offener Hand, zeigen, nicken – und halten mit dir Blickkontakt, auch während das Dialogfenster offen ist.

**Technik (für Entwickler)**
- **Daten `data/characterRig.ts`:** Rig-Knochen `RIG_BONES`, Staturen `BUILDS` (+ `BUILD_OF_BODY` für den Editor-Körperbau), Mimik-Kanäle `FACE_CHANNELS`/`FACE_MORPH`, Ausdrücke `EXPRESSIONS`, Grundzüge `FACE_TRAITS`, Blinzeln `BLINK`, Sprechen `TALK`, Handhaltungen `HAND_POSES`, Lebendigkeit `LIFE` (Atem, Gewicht, Blick, Neigen, Landung, Füße, Bereitschaft, Gelenk-Verteilung), Haltungen `STANCES`, Ketten-Abstimmung `CLOTH`, Ketten-Aufbau `CHAIN_LAYOUT`, Wind und Stöße `CLOTH_WIND`/`CLOTH_IMPULSE`, Boss-Präsenz `BOSS_PRESENCE` (+ `BOSS_SCALE` 1,35 – 1,65), Lebensprofile `NPC_LIFE`, Sockets `SOCKET_IDS`/`SOCKET_DEFS`.
- **Rig `entities/character/rig/`:** `springChain.ts` (rein: Verlet-Ketten in Float32Arrays, Teilschritte ≤ 1/60 s, Trägheit, Ruheform-Zug, Luftwiderstand gegen Wind und Fahrtwind, Gliedlängen mit Dehngrenze, Kapseln/Kugeln/Boden, Teleport-Erkennung ab 1,6 m je Schritt, `kick`/`blast`, NaN-Schutz), `faceRig.ts` (rein: `BlinkScheduler` mit eigener Saat, `FaceMixer`, `morphMap`), `bodyLife.ts` (rein: Atem, Gewichtsverlagerung, kleine Bewegungen, Blick-Federn, Neigen, Landungsfeder, Bereitschaft, Haltung), `clothRig.ts` (Ketten-Knochen in der Vorlage: Schöße 8 × 3, Umhang 5 × 4, Haare 8 × 2, Schal und Schärpe je 2 Bänder; Haar-Gewichte, `chainSkin` für Kleidungs-Sätze und Umhänge, Band-Netze; `ClothRig` je Figur), `characterSockets.ts` (`measureSockets` misst Scheitel, Augen, Kinn, Hals, Schultern, Rücken, Hüften an der Vorlage; `CharacterSockets` mit `get`/`attach`/`worldMatrix`), `characterRig.ts` (`CharacterRig`: Clip-Stand sichern/wiederherstellen statt Abzüge, Statur, Gelenk-Verteilung, Blick, Augen, Hüfte und Zwei-Knochen-Beinführung, Neigen über die Skelett-Wurzel, Hände, Gesicht, Ketten; Detailstufen nach Abstand × `CharacterRig.detail` der Grafikstufe), `rigProfile.ts` (rein: Aussehen → Statur, Grundzüge, Ketten; Grundlage der Abwärtskompatibilität).
- **Grundfigur `vroid.ts`:** `nameMorphs` setzt beim Laden die echten Namen der Morph-Ziele (aus den Primitiven des glTF); `VroidBase.cloth` (Ketten-Knochen in Körper- und Haar-Skelett, Bindungs-Inverse aus dem Rahmen abgeleitet) und `socketMeasures()` – beides abgesichert, ein Fehler dort fällt nie auf Ersatzfiguren zurück; `cape(len, overCoat, drape)` mit Schultermantel-Bogen über die Schulterkuppen (Profil über dem weiten Grundhemd); Animations-Übertragung als eigenständige `retargetClip`/`boneCorrections` (prüfbar ohne Grafikkarte).
- **Figur `character.ts`:** `rigX` (CharacterRig), Reihenfolge je Schritt `restore → Mischer → snapshot → Gang-Dämpfung → apply`; alte Neigung/Blinzel-Logik entfernt (`lean` liefert nur noch Drehtempo/Tempo/Beschleunigung); `rig.scale` gleichmäßig (Statur über `setBuild`); Mantel-Shaderwind nur noch als feine Welle (`uCape`), Schwung kommt aus den Ketten; neue Aufrufe `lookAt`, `setMood`, `setReady`, `land`, `talk`, `kick`, `setGround`, `setGrounded`, `setHandPose`, `setGlowColor`, `presence`, `charSockets`, statisch `setWind`, `setViewer`, `setRigDetail`, `blastAll`; Iris-Leuchten über die eigenen Effekt-Kopien (`enableFx`), nie am geteilten Material; Hüftlaterne am gemessenen Socket `hipLeft`/`hipRight`.
- **Anbindung:** `playerFoot.ts` (`rigInputs`: Boden, Ausdruck, Bereitschaft, Blick, Fäuste; Stöße bei Sprung, Luftsprung, Landung, Dash, Treffer; `blastAll` bei Einschlag, Erwachen, Königsdruck, Ultimate), `enemy.ts` (Boss-Präsenz nach `def.kit`, Kaiser in Koloss/Herrscher-Haltung, Blick, Ausdruck, Boden), `ally.ts`, `npc.ts` (Lebensprofil, Nachschauen), `seaWorld.ts` (Wind und Betrachter je Bild, Blick am Steuerrad, `dialogTick`/`talkPulse`/`endTalk`, Detailstufe in `applyQuality`), `game.ts` (Gesprächs-Takt im Pausenzustand), `editorStage.ts` (volle Detailstufe). Endboss-Statur in `raid/raidBosses.ts` (1,36 – 1,5; Kaiser ×1,1).
- **Ausrüstung:** `EquipPart` Umhang mit `drape`, neues Teil `mantel_schulter`, `COATS.schulter` (Spielstände bleiben gültig: neuer Wert, keine Migration nötig), Offiziere tragen ihn zu 40 %.
- **Leistung:** keine neuen Shader-Programme (Ketten sind Knochen, Bänder nutzen das Kleidungs-Material), keine Speicheranforderung je Bild im Rig, gezieltes Auffrischen von 18 Körperknochen statt ganzer Figuren; gemessen am Entwicklungsserver: rund 0,02 – 0,03 ms je Figur und Logikschritt (18 Figuren in Ankerglück ≈ 0,4 – 0,5 ms), Massentruppen (`TroopSquad`, Instanzen) unverändert. **Start im Build:** erste Vorwärmstufe nach 7,5 – 7,7 s (Grenze 9 s), **171 – 173 Shader-Programme** (wie 4.6.4).
- **Tests:** neu `tests/characterRigAndClothPhysics.test.ts` (27 Prüfungen): Sockets über **alle KayKit-Animationen** auf das echte Skelett der Grundfigur übertragen – ohne NaN, sauberer Rahmen, fest am Knochen –, Seiten und Lage der Sockets, Statur ohne Scherung mit festen Gelenken, Handhaltungen, Morph-Namen beider Grundfiguren, Blinzeln (unregelmäßig, doppelt, halb, Kampf seltener, Jubel/K.o. ohne Blinzeln), weiche Mimik und Leuchten, Sprechen, Grundzüge, Ketten bei Wind und Sprint, Kollision mit Bein und Deck, Teleport, Stöße, Robustheit, Atem, Gewicht, Blickgrenzen, Landung, Neigen, verschiedene Stadtleute, Boss-Statur 1,35 – 1,65, Spielstand Version 22 mit altem bzw. kaputtem Aussehen, 400 NPC-Looks und der Schultermantel. **1077 Tests**, `tsc` und `npm run build` grün.
- **Im Browser geprüft** (Playwright, Entwicklungsserver und Build): Gesicht nah, acht Ausdrücke, Kreislauf (Neigen, Schöße wehen), Stand (Atem, Gewicht), Sprung und Landung, Endbosse neben der Spielfigur, Schultermantel und Umhänge im Stand und im Lauf, Haare und Schalenden im Lauf, Hände, Gespräch mit einer Stadtbewohnerin (Gesten, Mund, Blick); keine Konsolenfehler.
- **Entscheidungen:** Die Körper-, Gesichts- und Haarnetze der VRoid-Grundfigur bleiben die „Haut“ – alle Kleidung, Rüstungen, Hüte und Blender-Teile sind darauf angepasst; neu gebaut ist alles, was sie bewegt und belebt (Statur, Gelenke, Hände, Gesicht, Leben, Stoff, Sockets). Die vorhandenen Clips bleiben die Grundbewegung, das Rig legt sich darüber.
- **Offen / nicht geprüft:** kein echtes Handy und kein Gamepad, nicht alle Grafikstufen. Frisuren aus Blender-Modellen (z. B. „Mehrlagige Frisur“) bleiben starr – nur das Haar der Grundfigur schwingt. Der Schultermantel liegt auf den Schultern, hat aber keine leeren Ärmel. Die Massentruppen (Instanzen) haben keine eigenen Gesichter oder Ketten. Eine kleine Naht am oberen Rücken einiger Mäntel und der Umhang-Ansatz unter dem Hemdkragen waren schon vorher so.

## 4.6.4 – Phase 4.6E: das 18-Baum-Talent- und Stufensystem bis Stufe 100 (120 Punkte) und der geheime Aufstieg auf Stufe 101 mit dem Kosmos-Baum und dem 15. Ultimate „Himmelssturz: Zwillings-Meteoriten & Planeten-Kollaps“ (25.11.2026, nur lokal)

**Was du siehst**
- **Stufen bis 100:** Bis Stufe 40 wächst der Erfahrungsbedarf wie bisher, darüber deutlich steiler – Stufe 100 ist ein langes Endziel (rund 650 000 EP). Jeder Aufstieg bringt **einen Talentpunkt** (dazu wie bisher einen Faji-Punkt), das Banner sagt „+1 Talentpunkt (Taste N)“. Auf Stufe 100 ist Schluss: der Balken bleibt voll, „Höchststufe erreicht“. Leben und Angriff wachsen über Stufe 40 hinaus weiter, aber immer langsamer (Stufe 100 entspricht etwa Stufe 64 der alten Rechnung) – stark, ohne die Welt zu entwerten.
- **120 Talentpunkte:** 99 aus den Stufen und **21 Meisterschafts-Siegel** – je eins für den ersten Sieg über jeden der fünf Kaiser, die sechs Kommandanten der Mega-Inseln, die drei Weltbosse, die sechs Belagerungen (fünf Fraktions-Zitadellen und Weißwacht) und die erste Legende der Rangliste. Wer diese Siege schon errungen hat, bekommt die Siegel beim Laden sofort gutgeschrieben.
- **Neues Fenster „Talente & Stufen“ (Taste N, auch im Pausenmenü):** links die Bäume, in der Mitte die sieben Stufen des gewählten Baums mit allen Knoten und Rängen, rechts die genaue Wirkung („Jetzt“ und „Nächster Rang“), die Bedingungen und der Knopf „Lernen“. Dazu die Übersicht der 21 Siegel und – geheim, bis alle fünf Kaiser gefallen sind – die Aufstiegs-Prüfung.
- **14 Kampfbäume** (sechs Waffen, acht Faji-Künste), je **sieben Stufen** und **70 Punkte**:
  1. **Fundament:** Haltung (weniger Schaden, solange du angreifst), Ausfallschritt und Reichweite, Kombo-Tempo.
  2. **Pfadwahl** – zwei Wege, die sich ausschließen: Zweihänder **Koloss-Schiffsspalter** (Schockwelle aus jedem schweren Hieb) oder **Unaufhaltsamer Moloch** (Hyper-Armor auf allen schweren Angriffen); Säbel **Sturmblitz-Duellant** (Blitz-Riposte nach dem Sturm-Schritt, Auto-Verfolgung) oder **Korsaren-Kommandant**; Doppelklinge **Luft-Kreissäge** (mehr Luftsprünge und -Dashes) oder **Schatten-Assassine**; Langklinge **Lautloser Zieh-Schnitt** oder **Spiegel-Kontermeister**; Sturmfaust **Überschall-Stakkato** oder **Orkan-Akrobat**; Erdspalter **Seismischer Brecher** oder **Titanen-Ringer**. Jede Faji-Kunst: **Zerstörungs-Formen** (Formsiegel öffnen die Formstufen 2 – 6 ohne Meisterschafts-Punkte) oder **Kontroll- & Aura-Meisterschaft**.
  3. **Technik-Mutationen** für alle vier Kampfkünste: **Dreifach-Wellen** (jede Welle läuft zweimal nach, Wurfsicheln fliegen zu dritt), **Luft-Hinrichtung** (auch in der Luft nutzbar, mehr Schaden gegen Gegner in der Luft), **Auto-Verfolgung** (nach dem Hochschleudern teleportiert die Figur ohne Dash hinterher), Sog, Kettenblitz, durchbohrende Geschosse.
  4. **Synergien:** Finisher tragen das **Element deiner Faji-Kunst** (Brand, Frost, Schock …), **Entladung beim Sturm-Schritt** hinter dem Angreifer, **Drei-Auren-Resonanz** (Sturmblick, Eisenwille, Königsdruck stärker), Willensstrom (mehr Willenskraft, längeres Erwachen).
  5. **Meisterprüfung** (Stufe 60, 72, 85; Kaiser-Siegel): bei den Faji-Künsten die **7. Meisterform** samt Ultimate.
  6. **Apex** (ab 55 Punkten im Baum, Stufe 70, zwei Kaiser-Siegel, ein Mythischer Bauplan): das Ultimate erreicht seine **Apex-Form** – stärker und weiter, im Banner „APEX“.
  7. **Drei Ultimate-Evolutionen** (Stufe 85 – 100; der zweite Rang verlangt Kaiser-Relikte aus Revanchen): **weiter Spaltradius**, **doppeltes Nachbeben** (zwei Druckwellen nach dem Einschlag) und **Willens-Rausch** (Mehrfach-Brüche laden die Willenskraft rasend schnell). Zwei davon kannst du zugleich ausrüsten.
- **Build-Bindung:** Ab 55 Punkten wird ein Kampfbaum dein **Meisterbaum** – jeder andere Kampfbaum endet bei 54 Punkten.
- **Drei Kapitäns- und Weltbäume** (je 39 Punkte): **Admiralität & Flotte** (Kanonenschaden, Nachladen, Fahrt, Wendigkeit, Rumpf, Reichweite, Enterkraft), **Belagerung & Kriegsführung** (Kriegspunkte-Lohn, Schaden gegen Kaiser-Bastionen, günstigere Truppen, Tribut, Beute, Haltung), **Handelsimperium** (billiger einkaufen, teurer verkaufen, mehr Frachtraum, weniger Unterhalt, weniger Fahndungsdruck). Hin und Zurück im selben Hafen kostet weiterhin immer Gold.
- **Zurücksetzen** gegen Gold (je Baum oder alle; jedes weitere Mal teurer) und zwei Kaiser-Siegel, sobald Meister-Knoten betroffen sind; das Fenster fragt einmal nach.
- **Der geheime Aufstieg:** Erst wenn alle **fünf Kaiser-Inseln des fünften Rings** gefallen sind, öffnet sich im Talent-Fenster die **Aufstiegs-Prüfung**: Stufe 100, Opfer am Sternenaltar (**5 Mythische Baupläne, 2 Kaiser-Relikte, 5 Kaiser-Siegel**) – dann **Stufe 101**, der **Kosmos-Baum** wird sichtbar und bringt 5 kosmische Punkte. Je Kaiser-Insel gibt es danach eine **Sternenprüfung** (erster Sieg nach dem Aufstieg) und eine **Revanche** (zweiter Sieg): zusammen **15 kosmische Punkte**.
- **Der 18. Baum – Kosmos:** fünf Sternbilder mit je drei Sternen – **Gravitations-Singularität** (schwere Angriffe ziehen Gegner zusammen), **Sternenlicht-Geschwindigkeit** (schnellere Ketten, weiterer Luft-Dash, längerer Sturm-Schritt), **Elementar-Faji-Verschmelzung** (Element in Finishern und Kettenenden), **Planeten-Schild** (Rüstung, Leben, Hyper-Armor) und **Meteoriten-Regen** (Meteor-Sturz stärker, Finisher rufen drei Meteoriten herab). Die Vorgabe nannte vier Sternbilder bei „fünf Clustern“ – das fünfte, **Meteoriten-Regen**, ist ergänzt. Krone: das **15. Ultimate**.
- **Himmelssturz: Zwillings-Meteoriten & Planeten-Kollaps:** Als Ultimate des Sturm-Erwachens ausrüstbar – mit **jeder** Waffe und **jeder** Faji-Kunst. Der Himmel reißt zur **Sternennacht** auf (Lichtsäulen, violetter Riss, Sternenband über dem Horizont), die Kamera blickt zum Himmel: **zwei Meteoriten mit Kometenschweif** ziehen über Kreuz heran und schlagen vor dir ein (Krater an Land, Gischtkronen auf See, **schwarz-weiße Tusche-Impact-Bilder**), dann stürzt ein **dunkler Planet mit Lichthof und Ring** herab und **kollidiert**: weißer Blitz, Druckringe, **Risse im Bild**, Gestein und Glut, an Land ein brennender Krater, auf See ein **Meerestrichter**. Kriegsschiffe zerbrechen radial in drei bis vier Teile, Masten fliegen, Rümpfe verkohlen. Endbosse bleiben geschützt: das ganze Wirken zählt wie ein einziger gedeckelter Treffer.
- **Grenzen:** Alle Talent-Boni laufen asymptotisch gegen feste Obergrenzen (z. B. höchstens +100 % Schaden je Treffer aus allen Talenten zusammen, höchstens 30 % Schadensminderung); der Schutz der Endbosse gegen Einzeltreffer bleibt unverändert.

**Technik (für Entwickler)**
- **Daten `data/talentTrees.ts`:** 18 Bäume (`TALENT_TREES`, `TREE_BY_ID`, `NODE_BY_ID`), Wirkungs-Vokabular `FxKey`/`FX_INFO` (Anzeige deutsch, Einheiten), Mutationen `SkillMutation` (`waves`, `air`, `airExec`, `chase`, `reach`, `cd`, `launch`, `vortex`, `chain`, `proj`, `pierce`, `status`, `dmg`), Eckwerte `TALENT` (Freischalt-Grenzen 0/5/14/24/34/55/56, Bindung 55, Zurücksetzen, Aufstieg, Krone), Bausteine `combatTree`/`fajiTree`/`captainTree`/`cosmicTree`, `MILESTONES` (21), `COSMIC_SOURCES` (15), `CONSTELLATIONS` (5).
- **Regeln `core/talentRules.ts` (rein):** `TalentSave` (Ränge, Siegel, kosmische Punkte, Aufstieg, besiegte Kaiser, Siege nach dem Aufstieg, Relikte/Baupläne/gebundene, verbrauchte Kaiser-Siegel, ausgerüstete Evolutionen, Ultimate-Wahl, Zahl der Rücksetzungen), `applyXp` (Deckel 100), `talentTotal`/`freePoints`/`treePoints`/`committedTree`/`pathOf`, `learnBlock` (deutsche Begründungen) und `learn`, `equipEvo`, `chooseUltimate`, `respecCost`/`respec`, `claimMilestone`/`milestonesEarned`, `syncKaiser`, `ascensionRows`/`ascend`/`kaiserWinAscended`, `fxSums`/`capFx` (Obergrenzen) /`formFloor`/`captainFx`/`defenseFx`/`fxText`, `cleanTalents` (Pfade eindeutig, Bindung, nie mehr ausgegeben als verdient, Aufstieg nur mit Stufe 101).
- **Kampf `combat/talentCombat.ts`:** `buildTalentCombat(save, Faji-Kunst)` baut alle Stile und Angriffe um – **gleiche Kennungen und Plätze wie `ALL_MOVES`** (der JSON-Zustand der Engine bleibt gültig) –, je Stil `TalentEngineParams`; Schadensfaktoren je Treffer über `talentDamageK` (Produkt, Zuwachs über `TALENT_CAP.total` gedeckelt). Neu gebaut nur bei einer Änderung (`talentKey`).
- **Engine:** `setTalents`, `styleOf`, `moveAt`, `talentReduce`; Tempo der Ketten/schweren Angriffe, Magnet-Weg, Willenskraft-Faktor und Mehrfach-Bruch, Auto-Verfolgung (`FighterState.autoChase`), Sturm-Schritt-Entladung und Nachbeben (`burst`, Ereignisse `stormBurst`/`aftershock`, `FighterState.shockN/T/X/Z`; Nachbeben zählen mit `cast = strikeSeq` in den Endboss-Deckel des Ultimates), Dash-Ausdauer, Auren-Stärke, längeres Erwachen, Hinrichtung in der Luft (`ActionMove.airExec`); das Ultimate des Erwachens über `ultimateOf` (Himmelssturz bei `useCosmic`).
- **Himmelssturz:** `SKYFALL_ULTIMATE` (`data/cataclysms.ts`, `CataclysmKind` `'skyfall'`, letzter Platz in `ALL_MOVES`); Regie `beginSkyfall`/`stepSkyfall`/`starfield`/`meteorAt` mit Schmiede-Schichten (Mantel, Kern, Partikel, Oberfläche), Schiffe **je Bild höchstens eins** zerlegt (`nearestUnhit`), Meerestrichter über `setTrench`, Blick zum Himmel über den neuen Host-Haken `skyLook` → `SeaWorld.skyLookK` (die Fußkamera sinkt und blickt höher, Spring-Arm unverändert). `aftershockFx`, `stormBurstFx` für die Talent-Entladungen.
- **Spiel:** `Game.applyTalents` (nach Laden, Lernen, Zurücksetzen, Aufstieg, Kunstwechsel), Siegel in `kaiserVictory`/`megaVictory`/Weltboss/Raid/Legende, kosmische Punkte nach dem Aufstieg, `performAscension`, `talentLearn/EquipEvo/ChooseUlt/Respec`, Formstufe = höhere aus Meisterschaft und Talenten (`artForm`); Kapitänswerte in `applyPower` (Kanonen, Nachladen, Fahrt, Wendigkeit, Rumpf, Reichweite, Enterkraft, Bastionen), Beute-Gold, Truppenpreise, Kriegspunkte, Tribut (`OccHost.tributeK`), Unterhalt (`UpkeepInput.k`), Handel (`TradeTalent`, `talentUnitPrices`: Erlös < 97 % des Hafen-Einkaufs, Einkauf > 103 % des Erlöses), Frachtraum (`cargoCapOf`), Fahndungsdruck.
- **Balance `data/balanceConfig.ts`:** `TALENT_CAP` (alle Obergrenzen) und `LEVEL_GROWTH`/`effectiveLevel` (Grundwerte über Stufe 40 asymptotisch); `data/combat.ts` `xpToNext` (60 + 45 · Stufe, ab 41 plus 6 · (Stufe − 40)²).
- **Oberfläche:** `ui/talentScreen.ts` (reine HTML-Bausteine), `Menus.showTalents`, `ui/css/talents.css`; Aktion `talents` (Taste N), „Faji-Fähigkeiten“ (K) bleibt der alte Baum.
- **Spielstand 22:** `SaveData.talents`; Migration 21 → 22 übernimmt die Stufe (über 100 → 100, vermerkt als `legacyLevel`), vergibt die Siegel rückwirkend aus Merkern, Kaiser-Siegen, Weltboss-Siegen und Legenden und übernimmt Relikte und Baupläne; jedes Laden säubert über `cleanTalents`.
- **Tests:** neu `tests/deepTalentTreesAndAscension.test.ts` (37 Prüfungen: EP-Kurve und Deckel 100, 120-Punkte-Ökonomie und Siegel, alle sieben Stufen und Pfade der 14 Kampfbäume und die drei Kapitänsbäume, Freischalten und Pfadsperre, Bindung ab 55, Apex-Bedingungen, Ultimate-Evolutionen mit Ausrüsten, Zurücksetzen, Kaiser-Siegel/Relikte/Baupläne, harte Sperre von Stufe 101 unter fünf Kaisern, Aufstieg und 15 kosmische Punkte, Säubern gegen Schummeln, fünf Sternbilder und Krone, Himmelssturz in der Engine mit jeder Waffe und Kunst samt Endboss-Deckel, alle Obergrenzen, Handel ohne Kreisgewinn, Kombo-Tempo, Auto-Verfolgung, Nachbeben, Sturm-Schritt-Entladung, Willens-Rausch, Formsiegel, Mutationen, Talent-Fenster, Migration 21 → 22). Angepasst: Versionsprüfungen in `expandedOpenWorld`, `factionWarEngine`, `factionWarIntervention`, `kaiserCitadels`. **1050 Tests**, `tsc` und `npm run build` grün.
- **Im Browser geprüft** (Playwright, Entwicklungsserver): Stufe 1 → 100 über echte Erfahrung (Deckel greift), Talent-Fenster mit Zweihänder-, Feuer- und Admiralitäts-Baum, Siegel, Aufstiegs-Prüfung (Stufe 101, 5 kosmische Punkte, 7 Opfer gebunden, Kaiser-Siegel abgezogen) und Kosmos-Baum; Himmelssturz auf See gegen drei Kriegsschiffe (alle drei radial in Teile zerlegt, Masten weg, verkohlt, Meerestrichter, Bild median 7 ms, einzelne Einschlags-Bilder bis 37 ms im Entwicklungsserver); Zweihänder mit Apex und doppeltem Nachbeben (zwei Druckwellen, Banner „Apex · …“), Sturm-Schritt-Entladung. **Start im Build:** erste Vorwärm-Stufe nach 7,4 – 7,6 s (Grenze 9 s), 171 – 174 Shader-Programme (4.6D: 171 – 173); keine Konsolenfehler.
- **Offen / nicht geprüft:** kein echtes Handy und kein Gamepad (das Fenster liegt im Pausenmenü und ist mit Stick/Kreuz bedienbar, aber nicht am Gerät geprüft), nicht alle Grafikstufen. Die EP-Belohnungen jenseits von Stufe 40 sind nicht in langen Spielsitzungen erprobt. „Schaden gegen Bastionen“ wirkt auf die Seesperre der Kaiser-Zitadellen. Auf großen Schiffen schlagen die Meteoriten 11 und 22 m vor der Figur ein – unter Umständen auf dem eigenen Deck (nur Darstellung, das eigene Schiff nimmt keinen Schaden). Der alte Faji-Fähigkeitenbaum (Taste K) bleibt bestehen und hat weiter eigene Punkte.

## 4.6.3 – Phase 4.6D: AnimeVfxForge – sechs prozedurale Anime-Texturen, die 3-Schicht-Komposition für jeden Kampfeffekt (Kettenschläge, alle Kampfkünste, Meteor, Sturm-Schritt, Clash, alle 14 Ultimates) und sichtbare physische Zerstörung von Schiffen und Gelände (25.11.2026, nur lokal)

**Was du siehst**
- **Keine glatten Kugeln, Röhren und Scheiben mehr:** Jeder Kampfeffekt trägt jetzt eine von sechs gemalten Anime-Texturen – scharfe Klingensichel mit gleißender Schneide und ausgefranstem Schweif, Flammenpinsel, gezackte Plasma-Blitzader, Gischt- und Eisschaum, radiale Glas-/Raumrisse mit Schockwellen-Ringen und Funken-Sprites (Rauten-Funke/Stern, Glut, Eiskristall, Wassertropfen). Flammen, Blitze und Wasser **fließen** über die Formen.
- **Drei Schichten bei jedem Effekt:** ein **dunkler Tusche-/Rauchmantel** hinter dem Effekt (gibt Anime-Tiefe und verhindert, dass alles weiß überstrahlt), der **leuchtende Energiekern** und ein **Partikelsturm** mit **Reaktion am Boden bzw. auf dem Wasser** – an Land dunkle Krater, Runen-Schockringe, fliegendes Gestein und Staub, auf See Gischtringe, Wasserkronen und Tropfen.
- **Jeder Schlag:** Die Kettenschläge (L1 – L5) und die Luft-Kette zeichnen scharf verjüngte **Klingen- bzw. Faustbögen** vor die Figur, die Richtung wechselt von Schlag zu Schlag (schräg, gegenläufig, steil); dazu Funken entlang der Schwungbahn. Jeder Treffer schlägt **Funken in Schlagrichtung** und wirbelt **Staub oder Gischt** an den Füßen des Gegners auf, schwere Treffer reißen Krater bzw. Gischtringe. Beim **Hochschleudern** steigt eine Energiespirale um den Gegner auf.
- **Alle Kampfkünste (Tasten 1 – 4 aller Stile):** Klingenwellen fliegen als dreischichtige Sicheln, Eruptionen brechen mit Krater bzw. Gischtkrone aus, dazu je Element eigene Teilchen – Glut und Flammenzungen, Eiskristalle, Wassertropfen, gezackte Fraktal-Blitze, Windspiralen, Tusche-Mondsicheln, Gestein mit Staub.
- **Meteor-Sturz:** mehrstufiger Krater mit drei Schockwellen-Ringen, hochfliegendem Gestein bzw. Wassertropfen und einer Energiespirale.
- **Sturm-Schritt und Sturm-Verfolgung:** scharfe **Blitz-Silhouetten** der Figur am Absprung- und am Zielpunkt, dazwischen eine Plasma-Ader; jeder Dash hinterlässt ein leuchtendes **Nachbild-Band**, in der Luft mit Funkenschweif.
- **Klingen-Clash:** Funkengarben in beide Richtungen, Rauchkranz und ein doppelter Druckring mit dunklem Saum.
- **Die 14 Ultimates mit sichtbarer Zerstörung:**
  1. **Zweihänder:** dreischichtige 180-m-Energiesichel mit dunklem Tusche-Schweif; Schiffe brechen unter Explosionen (Holzsplitter, Glut, schwarzer Rauch, Gischtkrone) in Bug und Heck; an Land bleibt eine **glühende Schnittfurche**.
  2. **Säbel:** eine **dunkle Sturmwolke** über dem Sprung statt violetter Überstrahlung, gold-rote **Fraktal-Blitze** mit Ästen, Geister-Kanonen feuern sichtbare **Leuchtspuren**; die zweite Salve **sprengt die Masten ab**, Kugeln reißen Löcher und setzen Schiffe in Brand, die letzte lässt sie **kentern** oder zerbrechen.
  3. **Doppelklinge:** rotierende **Kreissäge** aus schwarz-smaragdgrünen Sicheln; sie sägt Schiffe der Länge nach in **vier sinkende Sektionen**, Masten und Segel werden zerfetzt.
  4. **Langklinge:** beim Einrasten der Klinge reißen **3D-Glas-Schnittflächen** in der Luft auf (Splitter-Ebenen mit Rissen vor einem dunklen Riss ins Schwarze), feine Raum-Schnittlinien, Schiffe zerbrechen schräg.
  5. **Sturmfaust:** **breitere Kegel-Flut** (trifft jetzt ganze Schiffsverbände), Überschall-Druckringe mit dunklem Saum, Holzsplitter fliegen, Schiffe werden **zurückgehämmert** und versenkt.
  6. **Erdspalter:** 3D-Luft-Risse über dem Faustschlag, **schäumende Grabenkanten** mit Gischtkronen; Schiffe im Graben **stürzen zur Grabenmitte** und prallen zusammen; an Land Krater und Staub entlang der aufkippenden Felsschollen.
  7. **Schwarzes Loch:** dunkel-violette **Akkretionsscheibe** mit gewundenen Materieströmen, die Schiffe kreisen **spiralförmig** hinein, werden zerquetscht – und der **Kollaps sprengt die Trümmer nach außen**.
  8. **Feuer:** ein sich windender **Feuerdrache aus Flammenbändern** mit dunklem Glut-Rauch, breitere Schneise (alle drei Prüfschiffe brennen), **Deck-Infernos**, der **Rumpf verkohlt** dunkel, an Land glühende **Magmarisse**.
  9. **Eis:** das Meer gefriert, unter jedem Kriegsschiff brechen **Gletschersäulen** hervor, **spießen es auf, heben es an** und lassen es oben **zerbersten**, dazu ein Sturm aus Eiskristallen.
  10. **Wasser:** Drachenleib aus Wasserbändern mit **Gischtkrone** auf dem Kamm; gekenterte Schiffe verschwinden unter **Wasserfontänen**.
  11. **Wind:** gewaltiger **dunkel-smaragdgrüner Trichter-Tornado**, kreisende Tusche-Sicheln; Schiffe werden **hochgerissen**, in drei Teile zerfetzt und **nach außen geschleudert**.
  12. **Blitz:** dunklere Gewitterwolke, ein **mehrgliedriger Fraktal-Hauptblitz** (32 Glieder) mit **zwölf Nebenblitzen**, die erste Welle **sprengt die Masten**, jede weitere **verkohlt** die Schiffe tiefer, **Plasma-Gischtringe** laufen über das Meer.
  13. **Sonne:** mehrschichtige **Sonnen-Korona** mit Flammenzungen vor einem **dunklen Hitze-Kontrastring** (ohne weiße Überstrahlung), Glut regnet entlang der Schneise, getroffene Schiffe werden zu **rot glühenden Wracks**.
  14. **Mond:** **dunkler Blutmond-Halo** am Himmel, Hunderte **schwarz-karmesinrote Tusche-Mondsicheln** mit Schattenschweif zerschneiden Schiffe in **vier treibende Teile**.
- **Ultimate-Banner:** Der schräge Schriftzug liegt jetzt **über dem Auftragsfenster** (vorher verdeckte es lange Titel), und die Schrift passt sich der Titellänge an – auch „7. Form: Blutmond-Finsternis“ oder „Souverän-Orkan: Sieben-Meere-Zäsur“ stehen ganz im Bild, auf dem PC wie am Handy.
- **Unverändert:** Endboss-Schutz (ein Ultimate = ein gedeckelter Treffer, Haltung bricht sofort), keine Arena-Wände.

**Technik (für Entwickler)**
- **`graphics/animeVfxForge.ts`:** sechs Texturen 256 × 256 als `DataTexture` (rein und deterministisch über periodisches Wertrauschen, ohne DOM: `vfxTexturePixels(key)`, `VFX_TEX_WRAP`; einmal erzeugt und geschützt über `vfxTextures()`), Materialien aus einem Cache (`vfxMaterial(tex, blend, scroll, level)`: `MeshBasicMaterial` mit Textur, Eck- und Instanzfarbe, doppelseitig, ohne Nebel; `add` additiv, `ink` normal mit vier Deckkraft-Stufen `INK_LEVELS`, `solid` fest), UV-Lauf über Textur-Kopien mit gemeinsamer Bildquelle (`advanceVfxScroll`). Die Klasse `AnimeVfxForge` setzt die 3-Schicht-Effekte auf die Pools: `slash` (Klinge/Faust), `bolt` (Fraktal mit Ästen, Mittelpunkt-Verschiebung in festen Zwischenspeichern), `surfaceHit` (Land/See über `VfxSurface`), `burst` (Funken, Glut, Eis, Tropfen, Gestein, Holzsplitter, Rauch, Nebel, Staub), `spiral`, `funnel`, `corona`, `silhouette`, `glass`, `pressureRing`; Teilchenfaktor `detail` aus der Grafikstufe.
- **`combat/cataclysmFx.ts`:** alle 14 alten Grundformen mit UV und Textur (`PRIM_LOOK`), 18 neue (`sickle`/`sickleInk`, `ribbon`/`ribbonInk`, `jag`/`jagInk`, `shock`, `crater`, `foam`, `splash`, `spark`, `ember`, `ice`, `drop`, `smoke`, `funnel`/`funnelInk`, `glass`); Geometrien ohne Normalen (gleiche Programme). Dunkle Mäntel haben je Grundform vier Instanz-Netze (Deckkraft-Stufen), der Pool sortiert jedes Teil beim Ausblenden ein; Ausrichtung zur Kamera (`setCamera`: Sprites, Funken/Tropfen entlang der Flugbahn, Blitz-Glieder um ihre Achse). **Programme:** alle 48 Effekt-Materialien teilen sich zwei Programme (durchscheinend, fest) – wie vorher.
- **Regie (`world/cataclysmDirector.ts`):** `slashFx` (Kettenschläge), `hitImpact`, `launchFx`, `dashFx`, `stormStepFx`; `swingFx`, `elementBurst`, `clash`, `chain`, `awakenWave`, `kingWave`, Aura und `boltBetween` laufen über die Schmiede; alle 14 Zeitachsen mit Mantel, Kern, Partikeln und Oberflächen-Reaktion. Schiffe werden jetzt vor den Startbildern eingesammelt (vorher traf das Einfrieren des Gletschers die Liste des vorigen Wirkens). Säbel-Akzent `#FF3A2A` statt `#B04AFF`, leichte Verdunkelung bei Säbel und Sonne.
- **Zerstörung:** `splitShipModel(…, sections)` zerlegt Hälften entlang einer zweiten Ebene (3 – 4 Sektionen, `ShipSplit.subs` driften und sinken versetzt; `partition` mit Ebenen-Versatz), Quer-Bruch mit Anhub (`lift`), radialer Kollaps sprengt nach außen; `NavalSystem.cataclysmSplit(…, sections)`, `Ship.blowMasts`, `Ship.char` (eigene Materialkopie des Rumpfs über `cloneToon`, Deck über `charK`, Glühen über `emissive`), `ShipModel.hull`.
- **Engine und Figur:** Ereignis `slash` für Kettenschläge, Luft-Kette und Stilwechsel-Schlag; `FootDeps.onSlash`, `onDash`, `onStormStep`; `CombatSystem.vfxHit` für jeden Treffer der Figur (Funken, Staub/Gischt, Launcher-Spirale).
- **HUD:** eigene Schicht `.cbt-cutin-layer` (`--z-cutin` über `--z-hud`, unter den Menüs, Zeiger frei), Schriftgröße `clamp(0.8rem, 88vw / (Zeichen × 0,66), 3.2rem)` über `--len`.
- **Tests:** neu `tests/animeVfxForge.test.ts` (39 Prüfungen: Texturen – Form, Kerne, Determinismus, nahtloses Kacheln, Funken-Atlas; Materialien – jede Grundform texturiert, höchstens zwei Programm-Schlüssel, Deckkraft-Stufen der Mäntel, Ausrichtung der Funken; 3-Schicht-Regel für alle Schmiede-Effekte, Fraktal-Blitz mit 10+ Ästen, Land/See-Reaktion; `slash`-Ereignisse der Kette, Kettenbögen aller Stile, alle 60 Kampfkünste der 15 Stile (die 56 aus 6 physischen und 8 Faji-Stilen plus Faji-Wirken), Meteor-Krater, Silhouetten, Dash-Band, Clash, Treffer und Launcher; alle 14 Ultimates mit Schichten, Pool-Grenzen und ihrer Zerstörung; Sektionen, Anhub und radiale Sprengung am Schiffsmodell; Banner-Schicht und Schriftgröße). Angepasst: `kineticCombatAndAllUltimates.test.ts` (Attrappen-Schiffe mit Masten und Verkohlung). **1013 Tests**, `tsc` und `npm run build` grün.
- **Im Browser geprüft** (Playwright, 1280 × 720, Ultra): Kettenschläge und Kampfkünste (Säbel, Zweihänder, Feuer-Faji, Erdspalter, Mond-Faji) an Land; Effekt-Schaukasten mit fester Kamera (Bögen, Fraktal-Blitz, Krater, Spirale, Eis/Glut, Tornado, Korona, Glas, Silhouette); alle 14 Ultimates auf See gegen je drei Kriegsschiffe (Zweihänder 3 zerteilt, Säbel 3, Doppelklinge, Langklinge, Sturmfaust, Schwarzes Loch 3 radial, Feuer 3 brennend, Eis 2 aufgespießt, Wasser 2 gekentert, Wind, Blitz 3 versenkt, Sonne, Mond 2 in Teilen; Erdspalter einzeln: Graben offen, zwei Schiffe getroffen); Banner über dem Auftragsfenster. Effekt-Pool im dichtesten Ultimate (Säbel, über 1 600 Teile): höchstens 0,4 ms je Bild, ganzes Bild 7 – 8 ms. **Start im Build:** erste Vorwärm-Stufe nach 7,6 – 7,9 s (Grenze 9 s), 171 – 173 Shader-Programme (4.6C: 172), die Effekte nutzen zwei Programme wie vorher; keine Konsolenfehler.
- **Offen / nicht geprüft:** kein echtes Handy und kein Gamepad, nicht alle vier Grafikstufen (auf schwachen Stufen werden die Partikelstürme über `detail` dünner, die Schichten bleiben). Die Texturen sind prozedural gemalt, nicht von Hand. Aus großer Höhe (freie Kamera über 25 m) verdeckt die Säbel-Sturmwolke das Bild – im Spiel steht die Kamera darunter. Zerstörung der Rümpfe zeigt sich als Zerteilen, Kentern, Sinken, Verkohlen und Mastbruch; einzelne Planken lösen sich nicht aus dem Rumpf (Splitter sind Effekt-Teilchen).

## 4.6.2 – Phase 4.6C: Kinetischer Anime-Kampf ohne Rumstehen – Vorwärts-Momentum, Sturm-Verfolgung, Rückstoß über Bord, Klingen-Clash, prozeduraler Anime-Klang und alle 14 Ultimates auf monumentalem Zerstörungs-Niveau (25.11.2026, nur lokal)

**Was du siehst**
- **Kein Rumstehen mehr – jeder Schlag hat Wucht und Weg:**
  - **Vorwärts-Momentum:** Jede Kettenstufe treibt die Figur mit einer knackigen Beschleunigungskurve nach vorn (schnell an, weich aus): die ersten Schläge rund 1 m, der letzte Kettenschlag 1,5 m, der Flächen-Finisher 2,1 m, schwere Schläge 1,8 m, Luftschläge 0,7 m. Die Langklinge stößt am weitesten vor, Doppelklinge und Sturmfaust trippeln kürzer, die Faji-Künste gleiten. Durch Truppen-Verbände geht es **hindurch**, vor einem einzelnen Gegner bleibt die Figur kurz davor stehen (kein Vorbeirutschen). Am Boden staubt es, auf Deck und im Wasser spritzt Gischt. Eine Fünfer-Kette ohne Ziel legt rund **8 m** zurück.
  - **Sturm-Verfolgung:** Nach dem Orkan-Launcher (**L → L → S**) oder jedem anderen kräftigen Hochschleudern bleibt **1,6 s** lang ein Fenster: ein **Dash** teleportiert die Figur mit Nachbild und Blitzspur **auf die Höhe des geschleuderten Gegners** (bis 16 m weit) – nahtlos weiter mit Luft-Kombo und Meteor-Sturz.
  - **Rückstoß mit Folgen:** Hart getroffene Gegner **schlittern mit Bremsspur** über den Boden, **prallen an Wänden und Relings ab** (kurz benommen) und fliegen bei wuchtigen Finishern **über die Reling, über den Stegrand oder die Klippe ins Meer** – wer im Wasser landet, ist besiegt (mit Beute, auch im flachen Hafenwasser). Bosse, Raid-Hauptmänner und Dachschützen gehen nie über Bord.
  - **Klingen-Clash:** Trifft dein schwerer Schlag (Schwer, Finisher, Verzweigung, Meteor) auf einen Elite-Gegner oder Boss, der dir zugewandt gerade ausholt, prallen die Klingen aufeinander: **Funkenfontäne**, kurzer Trefferstopp, zwei Impact-Bilder, eine **Druckwelle schleudert Truppen** im Umkreis von 11 m fort, die Haltung des Gegners bricht spürbar ein, und du federst zurück. Höchstens ein Clash je Angriff.
  - **Kampfkünste 1 – 4 aller 14 Stile** lösen jetzt immer Bewegung aus – Vorstoß, Aufstieg, Schub, Geschoss, **Klingenwelle** oder **Eruption**: Linien-Techniken schicken sichtbare Klingenwellen mit ihrem Element über den Boden (Felsen, Eis-Stacheln, Flammen, Wasser, Blitze), Kreise brechen als Eruption aus, Bögen zeigen ihren Sichelschnitt. Der Mondspiegel (Langklinge) und der Gezeitenkonter (Wasser-Faji) kontern jetzt mit einer Welle.
- **Prozeduraler Anime-Klang** (Web Audio, ohne Dateien): **Sub-Bass-Fall mit Herzschlag** in der Zeitlupe des Ultimates, ein **Riss mit Donner** im Impact-Bild, je Stil eine Signatur – das **Klicken der Schwertscheide** (Langklinge), das hohe **Sirren des Klingen-Zyklons** (Doppelklinge), **Grollen** von Erdspalter und Schwarzem Loch, **Faust-Trommelfeuer**, **Geister-Salven** – und Element-Klänge: Feuer-Brausen, Eis-Zerspringen, Donnerschlag, Flutwogen-Tosen, Sturmheulen, Sonnenchor, Mondglocke. Dazu Klänge für Clash, Sturm-Verfolgung, Klingenwellen und Eruptionen. Große Effekte senken die Musik kurz ab.
- **Die neun aufgewerteten Ultimates** (mit Mini-Zwischensequenz, Impact-Bildern und echter Zerstörung):
  1. **Säbel – Souverän-Orkan:** Die Figur **springt jetzt wirklich ab**, hinter ihr erscheint eine **Geister-Armada aus 15 goldenen Schiffsgeschützen** in drei Reihen, dazu ein Blitzschnitt; drei Salven lassen Kriegsschiffe der Gefahrenstufen 1 – 4 **kentern oder zerbrechen** und schlagen in Festungshöfe ein.
  2. **Sturmfaust – Zehntausend-Hiebe-Orkan:** **Hunderte Geister-Fäuste** und Überschall-Ringe **durchlöchern Schiffe** und versenken sie.
  3. **Feuer – Purpur-Sonneninferno:** ein **Feuerdrachen-Wirbelsturm** zieht über Land und Meer, Schiffe fangen Feuer, an Land glühen **Lavarisse**, auf See steigt Dampf.
  4. **Eis – Ewiger Gletscher-Kataklysmus:** das **Meer friert** zu Eisschollen, riesige **Gletschersäulen** wachsen und **zerspringen im zweiten Impact-Bild**.
  5. **Wasser – Tiefsee-Sintflutdrache:** eine **turmhohe Drachen-Flutwelle** rollt über das Schlachtfeld, reißt Truppen mit, **hebt Schiffe an und lässt sie kentern**.
  6. **Wind – Vakuum-Himmelssturm:** ein **monumentaler Tornado** mit Dutzenden Vakuum-Sicheln zieht Schiffe heran und **zerschneidet** sie.
  7. **Blitz – Donnergott-Urteil:** die Figur **steigt rund 9 m zu einer Gewitterwolke auf** (bauschig, mit dunkler Unterseite), schwebt dort und lenkt eine **kolossale Blitzsäule** vom Himmel, die breit einschlägt und sich zum gleißenden Strahl zusammenzieht; drei Wellen **Kettenblitze** springen von Schiff zu Schiff, echte Wetterblitze schlagen ein, der **Himmel verdunkelt sich**, die Schiffe sinken.
  8. **Sonne – Zenit-Sonnentanz:** ein **rotierender Sonnen-Feuerring** schmilzt Rüstung, eine **riesige Licht-Schneise** brennt durch das Schlachtfeld und versenkt Schiffe darin.
  9. **Mond – Blutmond-Finsternis:** ein **Blutmond-Halo verdunkelt den Himmel**, ein Sturm aus **Hunderten rot-violetter Sicheln** zerteilt Schiffe.
  - Schiffe können jetzt auch **kentern** (kippen bis kieloben) und **versinken** (Schlagseite), zusätzlich zu den Zweiteilungen aus 4.6B. Freunde, Begleiter, deine Flotte, geenterte und friedliche Schiffe bleiben weiter verschont.
- **Zwischensequenz verfeinert:** Das **HUD tritt zurück**, solange die Kamera filmt (der Schriftzug des Ultimates bleibt). An Deck prüft die Kamera, ob Rahen, Baum, Segel oder Reling die Figur verdecken, und weicht aus (gespiegelt, gedreht oder näher heran); Untersichten werden an Deck zur **Nahaufnahme des Gesichts mit leuchtenden Augen**. Die Lichtsäule schlägt bei der Nahaufnahme erst zum Einschlag herab, und das Augen-Leuchten stapelt sich nicht mehr zu einem weißen Fleck – das Gesicht bleibt erkennbar.
- **Behoben:** Blitzsäule, Flutwelle, die Wasserwände der Meeres-Teilung und die Felsen an Land wurden in den ersten Zeitlupen-Schritten doppelt bis dreifach ausgelöst und überstrahlten das Bild – jetzt genau einmal.
- **Unverändert:** Der Endboss-Schutz (ein ganzes Ultimate zählt als ein gedeckelter Treffer, Haltung bricht sofort) gilt für alle 14 Ultimates, und Kämpfe errichten nie unsichtbare Arena-Wände.

**Technik (für Entwickler)**
- **Momentum:** `ActionMove.push` (m, `data/actionKit.ts`), Kurve `easeOutCubic` über das erste Schwungfenster (bei Angriffen mit drei und mehr Treffern über alle), vor einem einzelnen Ziel aus dem Magnet-Budget (`f.magnetLeft`) gedeckelt, durch Verbände (`mass`) und Durchstöße frei. Zahlen in `MOMENTUM` (`data/actionStyles.ts`) mit `applyMomentum` über alle Stile; Launcher mit Aufstieg und Konter-/Vorstoß-Techniken behalten ihren eigenen Weg. `ACTION_TUNING`: `pushLead/pushTail/pushGap`.
- **Sturm-Verfolgung:** `FighterState.chaseT` (gesetzt, wenn ein Treffer mit `launch ≥ 6` sitzt), `tryChase` vor dem normalen Dash (nächstes Ziel in der Luft ab `chaseMinRise` über der Figur in `chaseRange`), Ereignis `chase`; `ACTION_TUNING.chaseWindow/chaseRange/chaseOffset/chaseMinRise`.
- **Klingen-Clash:** `ActionTarget.elite/attacking` (aus `Enemy.hasPosture`/`Enemy.swinging`), `HitContext.clash`, einmal je Angriff (`clashSeq`), nur zugewandt (`clashFacing`), nur schwere Fenster (`clashable`); Ereignis `clash` mit Rückprall `clashRecoil`. `CombatSystem.actionHit` rechnet ×0,5 Schaden, Haltung `poise · clashPosture + 20`, ×0,6 Rückstoß, dann `clashFx` (Funken, Druckwelle gegen Trupps, Trefferstopp, Text, Zähler `clashes`); das Bild über `animeRig.impact(2)`.
- **Rückstoß:** reine Regeln in `combat/knockback.ts` (`KNOCKBACK`, `knockOutcome` none/skid/bounce/overboard, `bounceVelocity`, `overboardLaunch`, `inWater` mit Wasserlinie 0,25 m), angewandt in `Enemy.knockPhysics`; `Enemy.overboard/skidT/splashdown/canGoOverboard/clashed`, Haken `EnemyWorld.skid/wallSlam/overboard/splashdown` (Zähler `skids/slams/overboards` im Kampfsystem, Spritzer über `CombatHooks.splash`).
- **Schwungfenster:** Ereignis `swing` für Techniken, Verzweigungen, Finisher, schwere Schläge und Meteor; `CataclysmDirector.swingFx` (Klingenwelle, Eruption, Sichel, Element-Ausbruch aus dem Pool) und die Klänge `bladeWave`/`eruption`. Momentum-Spur über `FootDeps.trail` (Staub an Land, Gischt am Wasser).
- **Aufstieg der Ultimates:** `ActionMove.hang` (Schweben mit `hoverGravityK`); Aufstieg und Schweben beginnen jetzt **nach** der Zwischensequenz (vorher setzte `cineT` das Steigtempo zurück – auch der Sprung des Säbel-Ultimates aus 4.6B kam nie an).
- **Klang:** 19 neue `Sfx` (`ANIME_SFX` in `audio/audio.ts`), synthetisch in `AudioEngine.animeVoice` (Oszillatoren, Rauschpuffer, Filter, Hüllkurven; gedrosselt über `ok()`), Kategorien und Ducking über `CAT_OF`/`DUCK`, im Vorwärmen enthalten. Ohne laufenden Klang (kopflos) bleiben alle stumm.
- **Effekt-Pool `combat/cataclysmFx.ts`:** neue Grundformen `fist` (Geister-Faust), `disc` (Eisscholle) und `cloud` (Gewitterwolke aus 17 verbeulten Ballen mit gebackener Schattierung) – dasselbe Material, **kein neues Programm**; Plätze in `FX_CAP` deutlich größer (Fäuste 280, Sicheln 320, Splitter 360 …), Instanz-Puffer laden nur den belegten Teil hoch (`addUpdateRange`).
- **`world/cataclysmDirector.ts`:** Vorphase zwischen Zwischensequenz und Einschlag (Geister-Armada, Gewitterwolke), Zeitachsen der neun Ultimates (`stepSevenSeas` … `stepBloodMoon`), Verdunkelung über `CataclysmHost.darken` → `SeaWorld.darkK` → Belichtung × (1 − 0,55 · darkK) in `Game.render`, zweites Impact-Bild über `impactFrames` (Gletscher), Signaturklänge (`STRIKE_SOUND`, `sound`). Schiffe nur über `NavalSystem`: `cataclysmSplit(e, cut, seed, lift)` mit den neuen Schnitten `capsize`/`sink` (`ShipCut`), `cataclysmBlast` → `raidTargets.hitBall` (Festungen), `Ship.punchHoles`; Kentern und Versinken in `entities/ship/shipSplit.ts`. Einmal-Auslöser heißen jetzt `t0 === 0 && t > 0` (die alte Schwelle `t0 < 0,02` feuerte in Zeitlupe mehrfach).
- **Zwischensequenz:** `SeaWorld.shipNear` (Untersicht → Nahaufnahme an Deck, `beginCharge(…, shot)`), `rigCheckView`/`rigFree` (einmal je Ultimate Strahlen Kopf → Kamera gegen nahe Schiffe, Ausweich-Winkel `RIG_OFFS`, `rigPull` mit mindestens 0,85 m Abstand wegen der Nahblende; 2,5 – 5 ms einmalig), `AnimeImpactRig.pose(…, uAt)`, Himmels-Einstellung mit tieferem Blickpunkt; HUD-Ausblendung per CSS (`.anime-impact.cine ~ .hud`). Augen-Leuchten lebt etwa anderthalb Bilder in Spielzeit (`eyeGlow(…, life)`).
- **Tests:** neu `tests/kineticCombatAndAllUltimates.test.ts` (31 Prüfungen: Momentum je Stil und Kurve, durch Verbände vs. vor Einzelzielen, Fünfer-Kette legt Strecke zurück, Kampfkünste 1 – 4 aller Stile dynamisch, Schwungfenster-Ereignisse; Sturm-Verfolgung nach L → L → S und ohne Hochschleudern; Rückstoß-Regeln Schlittern/Abprallen/über Bord/Wasser; Clash nur bei schweren Schlägen gegen ausholende Elite und Bosse, einmal je Angriff; Web-Audio kopflos ohne Fehler und mit Attrappen-Klangkarte für jeden neuen Klang; alle 14 Ultimates mit echtem Effekt-Pool: Plätze, Aufräumen, Hunderte Teile bei den großen Neun, Zerstörung je Ultimate; Klingenwellen und Clash aus dem Pool; Blitz-Aufstieg nach der Zwischensequenz und Säbel-Sprung; Boss-Deckel für alle 14; keine Arena-Wände). **974 Tests**, `tsc` und `npm run build` grün.
- **Im Browser geprüft** (Playwright, 1280 × 720, Ultra): Fünfer-Kette ohne Ziel 8,4 m; Sturm-Verfolgung von 8,2 m auf 12,6 m Höhe neben den Gegner, danach Luft-Kette und Meteor; Clash gegen einen ausholenden Hauptmann (Haltung gebrochen); Matrose über die eigene Reling geschleudert → Spritzer → besiegt mit Lohn. Alle neun Ultimates auf offener See gegen je drei Kriegsschiffe: Säbel 3 (zweimal gekentert, einmal zerbrochen), Sturmfaust 1 versenkt, Feuer 1 in Brand, Eis 3 getroffen, Wasser 2 gekentert, Wind 1 zerschnitten, Blitz 3 versenkt mit 6 Kettenblitz-Treffern, Sonne 1 – 2 versenkt, Mond 2 zerschnitten; 370 – 1 200 Effekt-Teile je Ultimate. Blitz-Ultimate aus Spielkamera, von oben und von unten: Figur steigt von 5,0 auf 12,1 m, die Kamera bleibt unter der Wolke. **Start im Build:** 172 Shader-Programme (wie 4.6B), erste Vorwärm-Stufe nach 7,4 – 8,7 s (Grenze 9 s); der größere Effekt-Pool kostet beim Start rund 5 ms und kein Programm.
- **Offen / nicht geprüft:** Die Klänge sind nur technisch geprüft (Knoten entstehen, nichts wirft), nicht mit echten Ohren abgestimmt. Kein echtes Handy und kein Gamepad, nicht alle vier Grafikstufen. Feuer und Sturmfaust trafen im Testaufbau (Schiffe auf 32, 55 und 80 m) nicht alle drei Schiffe – ihre Reichweite folgt dem Wirbel bzw. dem Kegel. Das Säbel-Ultimate wirkt aus großer Höhe sehr hell und violett (Himmelsriss plus Aura-Glühen). Über Bord gehen nur Einzelgegner; Massentruppen fliegen weiter über `TroopSquad.fling`. Mehrspieler-Abgleich der Zwischensequenz gibt es noch nicht.

## 4.6.1 – Phase 4.6B: Acht Faji-Künste mit sieben Formen, Sturm-Erwachen, drei Willenskraft-Auren, Anime-Impact-Frames mit Mini-Zwischensequenz und alle 14 Kataklysmus-Ultimates – Kriegsschiffe zerbrechen, das Meer teilt sich, ein Schwarzes Loch saugt Schiffe ein (25.11.2026, nur lokal)

**Was du siehst**
- **Acht waffenlose Faji-Künste** – rein energetisch, ohne Schwert, jede mit eigener Fünfer-Kette, Schildbrecher, Orkan-Launcher, Luft-Kette, Meteor und Finisher:
  1. **Schwarzes Loch** (Finsternis-Gravitation): Anziehungsfelder ziehen Gegner zusammen und lassen gegnerische Auren erlöschen.
  2. **Feuer-Faji:** brennende Handflächen-Stöße, Flammenwirbel und glühende Brandwellen.
  3. **Eis-Faji:** Frostwellen, Eislanzen aus dem Boden, Kristall-Stöße und ein Frostkerker.
  4. **Wasser-Faji:** Gezeiten-Konter, Strudel-Feger, Hochdruckstrahl und Flutwand.
  5. **Wind-Faji:** Vakuumklingen, Auftriebs-Wirbelsturm, Überschall-Sprint (drei Sprünge, zwei Luft-Dashes).
  6. **Blitz-Faji:** Hochspannung mit **Kettenblitzen**, die durch ganze Truppen-Formationen springen.
  7. **Sonnen-Faji:** Sonnenglut brennt **Rüstung und Heilung** der Gegner durch.
  8. **Mond-Faji:** bei **jedem Schlag** fliegen **Mondsicheln** in wachsender Größe mit.
- **Sieben Formen:** Jede Kunst wächst mit jedem Treffer (**Meisterschaft**, im Sturm-Erwachen doppelt) von der 1. bis zur **7. Meisterform**. Die vier Techniken auf den Tasten 1 – 4 werden in der 1., 2., 4. und 6. Form frei und mit jeder Form stärker; in der Meisterform wartet das **Ultimate**. Neue Form = Banner mit der neuen Technik.
- **Menü „Kampfkünste & Auren“** (Pause): alle acht Künste mit Form, Fortschritt, Techniken und Ultimate; eine davon **ausrüsten** – sie liegt dann im Stilwechsel (**Q**: sechs Waffenstile + deine Faji-Kunst). Neue Spielstände beginnen mit Feuer-Faji.
- **Sturm-Erwachen:** Die **Willenskraft-Leiste** unter den Kampfkünsten füllt sich im Kampf (Treffer, Sturm-Schritt, Konter, Haltungsbruch, Finisher). Ist sie voll, löst **V** das Erwachen aus: **18 Sekunden** lang **+20 % Angriffstempo**, eine leuchtende **Aura** und bei **jedem normalen Schlag eine Energiewelle**, die auch weiter entfernte Gegner trifft. Ein zweites **V** entfesselt **einmal je Erwachen das Ultimate** deines Stils.
- **Drei Willenskraft-Auren** (Taste **B** reihum, auch im Menü):
  - **Sturmblick:** längeres Fenster für den Sturm-Schritt, danach tiefere Zeitlupe; Angriffe der Gegner leuchten vorher auf.
  - **Eisenwille:** dunkler Metallglanz auf der Figur, deine Schläge durchdringen Rüstung (eine Waffenstufe mehr), du nimmst 10 % weniger Schaden.
  - **Königsdruck:** alle 6 s eine weite **Willens-Druckwelle**, die Truppen fortschleudert und schwache Gegner zurückweichen lässt – beim Erwachen bricht sie über 20 m los.
- **Mini-Zwischensequenz und Impact-Frames:** Beim Ultimate fährt die Kamera filmreif heran (Gesicht mit **leuchtenden Augen**, Untersicht, Profil oder Himmel), **Kinobalken** schieben sich ins Bild, die **Wolken reißen über dir auf**, eine Lichtsäule fällt herab, Aura-Blitze und **Luft-Risse** stehen in der Luft – die Zeit läuft dabei **nur für dich** mit 14 % (0,75 s). Im Treffermoment blitzt das Bild **invertiert** und dann als harte **Schwarz-Weiß-Tusche** mit Manga-Speedlines auf (2 – 4 Bilder), danach gleitet die Kamera weich zurück in die freie Kamera. (Bei „Bewegung reduzieren“ entfällt das invertierte Bild.)
- **Alle 14 Kataklysmus-Ultimates:**
  1. **Zweihänder – Himmelsspalter: Horizont-Zäsur:** eine **180 m breite Energiewand** rast über den Horizont. Kriegsschiffe der Gefahrenstufen 1 – 4 (Boss-Schiffe unter 15 % Rumpf) **zerbrechen sichtbar in Bug- und Heckhälfte**, kippen brennend nach innen weg und versinken.
  2. **Säbel – Souverän-Orkan: Sieben-Meere-Zäsur:** sieben **goldene Geister-Geschütze** erscheinen hinter dir und feuern drei Salven auf Gegner und Schiffe.
  3. **Doppelklinge – Klingen-Zyklon: Tausend-Schnitt-Wirbel:** ein Klingenwirbel zieht 42 m voran und **sägt Kriegsschiffe der Länge nach** durch – die Hälften rollen auseinander.
  4. **Langklinge – Lautloser Blitz: Iaijutsu-Weltenbruch:** ein lautloser Vorstoß, die Klinge **rastet mit einem Klick** ein – **Glas-Risse** springen über das Bild und alles Durchquerte zerbricht **im selben Moment**, Schiffe diagonal.
  5. **Sturmfaust – Zehntausend-Hiebe-Orkan:** ein Sturm aus Faust-Abdrücken, am Ende eine weite Druckwelle.
  6. **Erdspalter – Erdspalter-Beben: Ozean-Teilung:** auf See **teilt sich das Meer zu einem 9 m tiefen Graben** mit Wasserwällen und Gischtvorhängen (Schiffe darin sacken ab), an Land reißt der Boden auf und Felsen heben sich; Truppen fliegen hoch.
  7. **Schwarzes Loch – Ereignishorizont: Schwarzer Abgrund:** ein schwarzer Kern mit leuchtender Akkretionsscheibe **saugt Gegner, Trümmer und nahe Schiffe** ins Zentrum und zerbricht sie.
  8. – 14. **Die 7. Formen der Faji-Künste:** Purpur-Sonneninferno (drei Feuerdrachen), Ewiger Gletscher-Kataklysmus (Eisstachel-Ringe, die zerspringen), Tiefsee-Sintflutdrache, Vakuum-Himmelssturm (Tornado), Donnergott-Urteil (drei Wellen riesiger Blitze aus dem Himmel), Zenit-Sonnentanz (tanzende Sonnensäulen) und Blutmond-Finsternis (ein Blutmond am Himmel, Sicheln in alle Richtungen).
  - Begleiter, deine Flotte, geenterte und friedliche Schiffe bleiben verschont. Legenden-Schiffe (nur Entern) zerbrechen nie, sie werden sofort manövrierunfähig.
- **Endboss-Schutz:** Gegen Raid-, Königs- und Kaiser-Endbosse zählt ein ganzes Ultimate wie **ein einziger gedeckelter Treffer** (Raid-Endboss 8 %, Kaiser 5 %, andere Bosse 20 % der Lebenspunkte) und **bricht sofort ihre Haltung** – kein Ultimate tötet einen vollen Endboss.
- **Tasten:** **V** = Sturm-Erwachen / Ultimate, **B** = Aura wechseln (beides frei belegbar). Gamepad: **R3 + ▼** = Erwachen / Ultimate, **R3 + Y** = Aura. Am **Handy** gibt es die Knöpfe **„Erwachen“** (füllt sich mit der Willenskraft, leuchtet, wenn bereit, zeigt im Erwachen „Ultimate“) und **„Aura“**; gesperrte Techniken zeigen ein Schloss mit „ab 2./4./6.“.

**Technik (für Entwickler)**
- **Daten:** `data/actionKit.ts` (Typen und Baukasten, ohne Stil-Tabelle: `ActionHit` mit `grow/status/statusDur/chain/chainRange/vortex/delayTo/vfx`, `ActionMove.formMin/ultimate`, `UltimateSpec`, `ProjectileKind`, `HitStatus`), `data/fajiArts.ts` (acht `ArtSpec` → `FAJI_STYLES`, Formen `FORM_THRESHOLDS`/`FORM_UNLOCK`/`formOf`/`formProgress`/`formPower`, `MASTERY`, `WILL`, `WILL_AURAS`, `AURA`, `KING_WAVE`, Spielstand `FajiSave`/`cleanFaji`), `data/cataclysms.ts` (`CUTSCENE` 0,14 × 0,75 s, `ULT_CHARGE`, 14 `ULTIMATES`, `ULTIMATE_ORDER`, `canSplitShip`, `BOSS_SHIP_SPLIT`, `ultimateBossCap`, `UltimateBossLedger`), `ULTIMATE_BOSS_CAP` in `data/balanceConfig.ts`. `data/actionStyles.ts` vereint die sieben Stile von 4.6A mit den acht Künsten (`FAJI_ARTS`).
- **Engine (`combat/actionCombatEngine.ts`, weiter rein und ohne Zufall):** Willenskraft (`will`, `addWill`, Ereignis `willFull`), Erwachen (`awakenT`, `ultReady`, Tempo ×`WILL.awakenSpeed`, Energiewelle `awakenWave` je normalem Schlag), Auren (`aura`, Königsdruck-Takt `kingT`, `penAdd`), Formen (`form`, `setForm`, `locked`), Ultimates (`tryUltimate`, `cineT` = Aufladen in Spielzeit mit Unverwundbarkeit, `ultStrike` zur festen Zeit, Durchstoß-Ultimates halten ihre Richtung), Sog (`vortex` → `ActionWorld.drag`), Kettenblitz (`chain`, 70 % je Sprung, Ereignis `chain`), verzögerte Treffer (`delayTo`: Iaijutsu markiert und trifft beim Einrasten alle zugleich, Ereignis `sheath`). `ActionWorld.hit` liefert jetzt 0/1/2 (Haltungsbruch/K.O. zählt für die Willenskraft).
- **Kampfsystem:** `actionHit` mit Formfaktor, Kettenblitz-Abschwächung, `UltimateBossLedger` (je Wirken und Gegner höchstens ein gedeckelter Treffer) und `breakNow` (Ultimate bricht die Haltung); `actionStatus` (Brand, Frost, Verlangsamung, Schock, Rüstungsbrand `sunderT`, Aura-Bann `suppressT`, Furcht), `actionDrag`; Geschosse mit Form (`crescent` als Sichel). `Enemy`: Rüstung ×0,5 unter Rüstungsbrand, keine Regeneration, Aura-Bann.
- **`graphics/animeImpactRig.ts` (rein, Echtzeit):** Phasen `cine` → `return`, Kamera-Einstellungen `face/low/side/sky` (`pose` schreibt in ein vorhandenes Objekt), `camK`/`glow`, Impact-Frames in **gezeichneten** Bildern (`frame()`: invertiert, dann Tusche). `SeaWorld.applyAnimeRig` legt die Einstellung über die Fuß-Kamera (Kugelbahn `orbitBlend` um den Kopf, gespiegelt, wenn die Kamera in einer Wand stünde; Sichtfeld überblendet), Augen-Leuchten am Kopfknochen. Zeitlupe über `SeaWorld.hitstop` (läuft in Echtzeit ab, nur lokal).
- **`ui/animeImpactOverlay.ts`:** Kinobalken, Aura-Glühen, Manga-Speedlines, Glas-Risse (SVG) über dem Bild; die Bildwirkung selbst ist ein **CSS-Filter auf dem Canvas** (`invert`, `grayscale + contrast`) – Mischmodi und `backdrop-filter` einer Schicht darüber erreichen das WebGL-Bild nicht zuverlässig (eigener Stapelkontext). Schicht `--z-impact` (3), `pointer-events: none !important`.
- **`combat/cataclysmFx.ts`:** Effekt-Pool aus elf Grundformen (Energiewand, Ring, Lichtsäule, Blitz, Kristall, Kugel, Sichel, Geister-Geschütz, Fels, Wasserwand, dunkler Kern) als vorab angelegte `InstancedMesh` mit Instanz- und Eckpunktfarbe; **ein gemeinsames Programm** (MeshBasicMaterial, doppelseitig, ohne Nebel), Ausblenden über die Farbe (additiv), Pinsel `FxBrush` ohne Speicheranforderung, `prewarm` in `warmupExtras`.
- **`world/cataclysmDirector.ts`:** Aufladen (Echtzeit: Energie strömt heran, Aura-Blitze, Luft-Risse, Lichtsäule, Wolken-Teilung über `Sky.skyU.uRift`), Zeitachsen aller 14 Ultimates (Spielzeit), Energiewelle, Kettenblitz, Königsdruck, Erwachen-Aura, Augen-Leuchten. Schiffe nur über die Regeln von `NavalSystem`: `cataclysmShips`, `cataclysmFriendly`, `cataclysmHit` (über `Ship.damage`, zählt als Treffer des Spielers), `cataclysmSplit` (Regeln `canSplitShip`, `noKill` → Enterphase), `cataclysmPull`; Trümmer über `DebrisSystem.pull`.
- **Schiffs-Zweiteilung `entities/ship/shipSplit.ts`:** Schnittebene je Art (`cross` Bug/Heck, `length` Backbord/Steuerbord, `diagonal`, `radial`), große Netze werden Dreieck für Dreieck in **zwei Index-Puffer** zerlegt (gemeinsame Eckpunkt-Daten, gleiche Materialien), Instanz-Netze nach ihren Instanzen geteilt, kleine Teile wandern ganz; alles bleibt im selben Baum (zwei Gruppen `split-a/-b`), Konturen ziehen mit. `Ship.splitApart`, `Ship.split`, `updateShipSplit` in `Ship.render` (V-Form, Auseinanderrollen, Abgleiten, Trudeln).
- **Ozean-Teilung:** `skTrench` im Meeres-Shader (`skDispH = skHullH + skTrench`, Uniforms `uTrench/uTrenchD`, Meeresboden-Farbe am Grund) und der CPU-Zwilling `trenchCPU` in `Ocean.heightAt` (Schiffe sinken mit); `Ocean.setTrench`.
- **Spielfigur:** `FootWorld.hit/drag`, neue Ereignisse (Erwachen, Aura, Ultimate, Einschlag, Iaijutsu-Klick, Kettenblitz, Königsdruck, Energiewelle, gesperrt, Willenskraft voll), Färbung `updateTint` (Fesseln > Erwachen-Puls > Eisenwille; `Character.setTintAmount`), Eisenwille −10 % Schaden, Meisterschaft → `Game.gainMastery`. **HUD:** `FighterView` mit Willenskraft, Erwachen, Ultimate, Aura, Form, gesperrten Techniken; Willenskraft-Leiste, Aura-Zeichen und Form im Fighter-HUD; Touch-Knöpfe `awaken`/`aura`.
- **Eingabe:** Aktionen `awaken` (V) und `aura` (B), Gamepad-Kombinationen R3 + ▼ / R3 + Y (`PAD_CHORDS`). **Spielstand:** optionales Feld `player.faji` (ausgerüstete Kunst, Meisterschaft, Aura; `cleanFaji` beim Laden, Version bleibt 21).
- **Tests:** neu `tests/fajiAndKataklysmusUltimates.test.ts` (29 Prüfungen: acht Künste mit Formen 1 – 7, gesperrte Techniken und Formschaden, Balance der Ketten und Techniken, Sog, Kettenblitz durch Formationen, Brand/Frost/Rüstungsbrand/Konter/Auftrieb, Mondsicheln, Spielstand; Willenskraft, Erwachen mit +20 % Tempo und Energiewelle, Auren-Wechsel, Sturmblick-Fenster, Eisenwille-Durchschlag, Königsdruck; Zeitlupe 0,14 × 0,75 s, Impact-Frames invertiert → Tusche, Kamera-Einstellungen, Aufladen mit Unverwundbarkeit; alle 14 Ultimates samt Einmal-je-Erwachen und Meisterform-Sperre; Zweiteilung quer und der Länge nach am Modell, Iaijutsu-Gleichzeitigkeit, Meeresgraben, Schwarzes-Loch-Sog; Boss-Deckel und Haltungsbruch). Angepasst: `playerFleet.test.ts` (neue Gamepad-Kombinationen) – **943 Tests**, `tsc` und Build grün.
- **Browser (Playwright, 1280 × 720 und 390 × 844):** Erwachen, Zwischensequenz (Kamera am Gesicht, Zeitlupe 0,14, Kinobalken), Impact-Frames invertiert und Tusche, Himmelsspalter zerteilt drei Kriegsschiffe (je 24 Netze geschnitten, V-Form, versenkt), Erdspalter öffnet den Meeresgraben (9 m) und trifft drei Schiffe, Schwarzes Loch saugt drei Schiffe ein und zerbricht sie radial, Klingen-Zyklon (Länge) und Iaijutsu (diagonal, Glas-Risse) zerteilen je ein Schiff, Menü „Kampfkünste & Auren“, Handy-Knöpfe. **Start im Build:** Menü nach gut 4 s, erste Vorwärm-Stufe nach 6,3 – 7,3 s, **172 – 173 Shader-Programme**.
- **Offen / nicht geprüft:** echtes Handy und Gamepad, alle vier Grafikstufen und Nacht; Säbel, Sturmfaust und die sieben Faji-Ultimates außer dem Schwarzen Loch nur in den Tests und kurz im Spiel angesehen, nicht jedes Bild einzeln; die Faji-Künste sind über Meisterschaft frei, nicht über Story-Momente; Mehrspieler-Abgleich der Zwischensequenz gibt es noch nicht (die Zeitlupe gilt nur lokal).

## 4.6.0 – Phase 4.6A: 3D-Anime-Action-Kampf – freie Bewegung in der Luft, Kombo-Baum aus Leicht und Schwer, Sturm-Schritt, Haltungsbruch-Finisher und sechs physische Kampfstile mit je vier Kampfkünsten (25.11.2026, nur lokal)

**Was du siehst**
- **Der Kampf zu Fuß ist neu gebaut** – nach dem Leitbild „volle Bewegungsfreiheit, sofort Spaß, echte Tiefe für Könner“:
  - **Springen und Doppelsprung** (Leertaste): Sprünge tragen den Lauf-Schwung mit, der zweite Sprung in der Luft setzt mit einem Druckring nach. Von Kanten, Decks und Hängen fällt die Figur frei in die Tiefe und landet auf Brücken, Achterdecks und Stegen, statt hindurchzufallen.
  - **Dash** (Umschalt) am Boden **und in der Luft** (gerichteter Luft-Dash, hält die Höhe): mit kurzer Unverwundbarkeit. Jeder Schlag lässt sich **jederzeit** per Dash oder Sprung abbrechen.
  - **Keine Arena-Wände:** Kämpfe sperren nichts ab. Du läufst mitten im Gefecht über die ganze Insel, über Brücken und Decks davon und wieder hinein.
- **Sofort-Spaß:** Einfach nur **Angriff drücken** ergibt eine flüssige **Fünfer-Kette** (Doppelklinge: Siebener-Kette), deren letzter Schlag ein **Flächen-Finisher** ist, der schwache Truppen **wegschleudert** – die Soldaten fliegen im Bogen davon. Die Figur **richtet sich von selbst auf den nächsten Gegner** aus und **gleitet bis zu 3,5 m heran** (kein Luftschlagen); eine schnelle Kameradrehung, ein Sprung oder ein Dash löst das sofort. Zu früh gedrückte Knöpfe bleiben **160 ms** gültig.
- **Kombo-Tiefe – Leicht und Schwer im Wechsel:**
  - **L → S: Schildbrecher-Stoß** – knackt Blockhaltung, Schilde und die Deckung der Bosse.
  - **L → L → S: Orkan-Launcher** – schleudert **bis zu zwölf Gegner** hoch, du fliegst mit. In der Luft folgen **drei bis vier Luftschläge** (Leicht), jeder Treffer **bremst deinen Fall**, Doppelsprung und Luft-Dash bringen dich hinterher, und **Schwer in der Luft** ist der **Meteor-Sturzangriff** mit Druckwelle beim Aufprall.
  - **L ×3 → S: 360°-Massenschlacht-Feger** – trifft rundum.
  - **L ×4 → S: Langstrecken-Schockwelle** – eine Druckwelle bis zu 16 m weit.
- **Sturm-Schritt (perfektes Ausweichen):** Weichst du **höchstens 180 ms vor einem Treffer** aus, verschwindet die Figur mit einem **Blitz-Nachbild** und steht **direkt hinter dem Angreifer** – kurz läuft alles in Zeitlupe, und dein nächster Schlag ist ein **sicherer kritischer Konter**.
- **Haltungsleiste:** Elite-Truppen, Hauptmänner und Insel-Kommandanten, Königs- und Kaiser-Endbosse haben jetzt eine **Haltungsleiste unter den Lebenspunkten**. Bricht sie, **taumelt** der Gegner; über ihm leuchtet **„Finisher“** – drück **Schwer** für einen **filmreifen Finisher-Schlag** mit Cut-in, Zeitlupe und Druckwelle (bei Endbossen gelten weiter die Grenzen gegen Ein-Treffer-Siege).
- **Sechs physische Kampfstile – jederzeit wechselbar** (Q schaltet der Reihe nach durch, auch mitten in der Kette als 1,6-facher **Wechselschlag**; Z/X wählen wie bisher deine zwei Lieblingswaffen). Jeder Stil hat eigene Schläge, Reichweiten und **vier Kampfkünste auf den Tasten 1–4**:
  1. **Zweihänder (Großschwert):** weite Bogenhiebe, **Hyper-Armor** bei schweren Finishern, bricht die Haltung am schnellsten. Kampfkünste: *Bergbrecher* (Sprung und Erdbeben-Hieb), *Sturmrad* (wirbelnder Klingensturm), *Unbeugsam* (6 s Hyper-Armor), *Titanenspalter* (Schockwelle über 16 m).
  2. **Säbel (Korsaren-Souverän):** schnelle, elegante Hiebketten mit golden-roten Sturm-Blitzen, die **höchsten Krit-Treffer**. *Kronenblitz-Sprint* (Blitzschnitt quer durch die Gegner), *Donnerfächer* (drei Blitze), *Freibeuter-Tanz* (sechs Hiebe), *Sturmkrone* (Blitzring und +25 % Krit-Chance).
  3. **Doppelklinge:** rasante Sieben-Treffer-Wirbel, **drei Sprünge und zwei Luft-Dashes**, extrem schnelle Rotations-Dashes. *Klingenwirbel*, *Schwalbensturz* (steigender Wirbel mit allen in die Luft), *Zwillingsschatten* (Rotations-Dash mit Nachbildern), *Tausend Schnitte*.
  4. **Langklinge (Iaijutsu-Meister):** blitzschnelle Zieh-Schnitte mit hoher Durchschlagskraft gegen Rüstung und dem **längsten Fenster für den Sturm-Schritt** (0,27 s). *Iai: Blitzzug*, *Mondspiegel* (Konterhaltung: wer zuschlägt, wird hinterrücks erwidert), *Kreuzwind* (zwei Fernschnitte), *Hundert Monde* (Rundumschnitt).
  5. **Sturmfaust (schneller Faustkampf):** rasante Schlagserien, Sprungtritte und **Nachbild-Fäuste**. *Nachbildfäuste* (zehn Schläge in einer Sekunde), *Donnertritt* (fliegender Sprungtritt), *Sturmschritt-Kette* (drei Blitz-Dashes), *Himmelsfaust* (Aufwärtshaken in die Luft).
  6. **Erdspalter (starker Faustkampf):** seismische Bodenstöße, **Greifwürfe** und gewaltige Druckwellen. *Bebenstampfer* (zwei Erdbebenringe), *Titanengriff* (packen und in den Boden schmettern), *Felsbrecher-Welle* (15 m Druckwelle), *Weltenspalter* (Sprung und Einschlag mit 6,5 m Druckwelle).
  - **Faji-Wirker** behalten ihr Faji-Wirken als siebten Stil (Fernkampf mit Faji-Geschossen); die großen **Faji-Künste** folgen mit Phase 4.6B.
- **Fighter-HUD:** Unten in der Mitte stehen der **Kombo-Zähler „HIT!“** (ab 10 „Stark!“, ab 25 „Brutal!“, ab 50 „Legendär!“) mit dem Namen des letzten Angriffs und die **vier Kampfkünste** mit Taste, Symbol und Abklingzeit. Am **Handy** liegen die Kampfkünste als Knöpfe im Bogen über Angriff, Schwer, **Sprung** und **Dash**; Zähler und Stil stehen rechts über den Knöpfen.
- **Tasten:** Leertaste = Springen, Umschalt = Dash, 1–4 = Kampfkünste, Q = Stil wechseln. Die **Truppenbefehle** liegen jetzt auf **5, 6, 7** (Sturm, Folgen, Halten). Die Schnellleiste 1–4 gilt weiter an Bord; zu Fuß gehören 1–4 den Kampfkünsten (in den Einstellungen kannst du Güter auf freie Tasten legen). Am Gamepad: X = Springen (steht eine Handlung an, gewinnt die Handlung), Steuerkreuz = Kampfkünste. Hast du früher eigene Tasten vergeben, bleiben sie gültig – neue Standardtasten weichen ihnen aus. Auf See gibt die Leertaste weiter Schub.

**Technik (für Entwickler)**
- **`combat/actionCombatEngine.ts` (rein, ohne three.js, ohne Zufall):** `FighterState` (JSON-taugliche Daten: Lage, Tempo, Phase `ground/air/move/dash/block/cast/hurt/down`, laufender Angriff als Index in `ALL_MOVES`, Kette, Eingabepuffer als Zeitstempel, Dash, Unverwundbarkeit, Sturm-Schritt- und Konterfenster, weiches Ziel, Abklingzeiten, Stärkungen, Trefferzähler, Ausdauer) und `ActionCombatEngine.step(input, world, dt)`. Die Welt kommt über `ActionWorld` (`height(x, z, y)` mit Höhenhinweis, `move` mit strengem Sweep für Impulse am Boden, `teleport`, `targets` in vorab angelegte `ActionTarget`-Plätze, `hit`, `shoot`). Vorab angelegt: Zielplätze (160), Trefferlisten je Fenster (16 × 96), Ereignis-Warteschlange (48), `HitContext` – keine Speicheranforderung im Takt. Trefferformen `inShape` (Bogen mit Öffnungswinkel, Kreis vor der Figur/Ring, Linie) mit Höhenband. Landung über `floorBelow` (drei Höhenproben zwischen alter und neuer Höhe: Brücken und Achterdecks werden nie durchfallen). `incoming(attacker, dir, world)` entscheidet Sturm-Schritt (`behind`: hinter den Rücken, sonst seitlich, nie in eine Wand), Konterhaltung (Gegenschlag `RIPOSTE`), Ausweichen, Parade/Block, Hyper-Armor. Haltung rein: `PostureState`, `hitPosture`, `breakPosture`, `stepPosture`, `postureFrac`, `hasPostureBar`.
- **`data/actionStyles.ts`:** `ACTION_TUNING` (Puffer 0,16 s, Magnet 3,5 m / 6,5 m Suchradius, Schwerkraft 26, Sprünge 8,8/8,2 m/s, Sturm-Schritt 0,18 s, Konter ×1,8, Schweben nach Lufttreffern, Meteor −27 m/s …), `POSTURE`, sieben `ActionStyleDef` (Kette, vier Verzweigungen, Schwer, Luft-Kette, Meteor, Finisher, vier `ActionSkill`; Sprünge/Luft-Dashes, Dash-Tempo, Sturm-Schritt-Fenster, Krit-Faktor/-Bonus, Durchschlag, Haltungsfaktor). `CLIP_SWING` (gemessene Clipdauer und Schwungfenster der KayKit-Clips): `move()` legt die Trefferfenster genau auf den Schwung des genutzten Clip-Abschnitts. `ALL_MOVES`/`moveIndex`, `actionStyleOf`/`visualStyleOf`.
- **Spielfigur `entities/player/playerFoot.ts`** ist jetzt Anschluss und Darstellung der Engine: `FootWorld` (Boden, `combat/sweep.ts`, Kampfsystem), Eingabe → `ActionInput`, Ereignisse → Clips, Effekte, Klang. Clips laufen über `Character.playSynced` mit fester Zeit aus der Engine (`time` je Logikbild, `timeScale` 0; gleicher Clip zweimal hintereinander blendet über einen Zwilling). Öffentliche Felder wie vorher (`x/y/z/yaw` sind Accessoren auf den `FighterState`).
- **Schaden über die bestehende Pipeline:** `CombatSystem.actionTargets` (Gegner, Verbände als ein Ziel, Übungspuppen), `actionHit` (Krit mit Stil-Faktor, Durchschlag = Waffenstufe + Angriff + Stil, Finisher ×`POSTURE.finisherDmg`, dann `Enemy.takeHit` mit Rüstungskurve, Break-Bonus und `RAID_BOSS_HIT_CAP`/`KAISER_BOSS_HIT_CAP`), `actionShoot`; Sturm-Schritt als Ergebnis `perfect` in `hitPlayer` (`PlayerHitResult`). `PLAYER_HIT_CAP` gilt unverändert.
- **Gegner (`entities/enemy.ts`):** `hasPosture` (Elite, `boss`, `raid`), Bruch = `brokenT` (Bosse `BOSS.breakTime`, sonst `POSTURE.staggerElite`), Regeneration für alle Haltungsträger; `HitInfo.juggle/breakGuard/pullX/pullZ/finisher`: Jonglieren in der Luft (bleiben `air`), Schildbrecher gegen `guardT` und `frontBlock`, Greifwurf, Finisher beendet den Bruch. Anzeige: Haltungsleiste in `CombatOverlay.setBar` (Zusatzstreifen, blinkt rot im Bruch), Hinweis `setFinisherPrompt`.
- **Truppen:** `TroopSquad.fling` (Stoß der Aufstellung, klingt ab) und `TroopRenderer.fall(view, k, src)` mit fliegenden Gefallenen (Bogen, Überschlag); alle vier Aufrufer reichen den Trupp als Quelle weiter.
- **Effekte `combat/actionFx.ts`:** Pools für Blitz-Nachbilder (14 Sprites mit Silhouetten-Textur) und Leuchtstreifen (6 Netze), je Platz ein Material, nichts Neues im Kampf.
- **HUD:** `ui/fighterHud.ts` (Kombo-Zähler aus `CombatOverlay.comboHits/comboFrac`, Name des letzten Angriffs, vier Kampfkünste mit Kreis-Abklingzeit, Konter-Glühen; Handy-Modus) in `hud.regions.bc`; der alte Zähler am rechten Rand ruht (`comboDocked`). Touch: `TOUCH_FOOT` mit `jump` und `art1`–`art4` (`TouchControls.setArt`: Symbol und Kurzname).
- **Eingabe:** neue Aktionen `jump`, `art1`–`art4`; `artOnKey` (Güter auf Kampfkunst-Tasten ruhen zu Fuß, Anzeige und Eingabe fragen dasselbe); Truppenbefehle 5–7; `Input.setKeyBindings`: eigene Belegungen schlagen neue Standardtasten. **Spielstand:** optionales Feld `player.actionStyle` (fehlt es, gilt der Kampfstil; Version bleibt 21).
- **Tests:** `tests/actionCombatEngine.test.ts` (28 Prüfungen: freie Bewegung ohne Arena, Animation-Cancel, Doppelsprung/Luft-Dash, Kanten-, Brücken- und Decksprünge, Soft-Lock/Magnet-Schritt und sein Lösen, Puffer, 5er-/7er-Ketten, alle vier L×S-Verzweigungen inkl. Launcher → Luft-Kombo → Meteor, Sturm-Schritt hinter den Angreifer und Wand-Fall, Langklingen-Fenster, Hyper-Armor, Haltung und Boss-Finisher, alle 24 Kampfkünste, Stilwechsel, **Balance-Schutz** (Ketten-DPS 0,85 – 1,45 × `FIGHT_MODEL`, Kampfkünste zusammen < +30 %), Determinismus, 140 Ziele unter 1,5 ms je Bild, Touch-Knöpfe ohne Überlappung). Angepasst: `actions.test.ts`, `playerFleet.test.ts` (neue Tastenbelegung) – **914 Tests** insgesamt, `tsc` und Build grün.
- Browser (Playwright, 1600 × 900 und 390 × 844, echte Tastendrücke): Säbel-Kette L×5 und Orkan-Launcher → drei Luftschläge → Meteor mit Druckwelle, alle Kampfkünste, Q durch alle sechs Stile (wird gespeichert), Haltungsbruch am Hauptmann mit Finisher „Himmelsspalter“, Doppelsprung (2,55 m) mit Luft-Dash, Sturm-Schritt hinter den Hauptmann (0 Schaden, Konter-Krit danach); **112 feindliche Soldaten** in 8 Verbänden mit 360°-Feger: Bildzeit im Mittel 17,9 ms (wie ohne Kampf), keine Konsolenfehler.
- **Offen / nicht geprüft:** echtes Handy und Gamepad, alle vier Grafikstufen, Nacht; Dächer von Gebäuden sind nicht begehbar (Kollider haben keine Höhe) – Sprünge auf Zitadellen-Dächer folgen erst mit begehbaren Dächern; die Kampfkünste des Faji-Wirkens sind Platzhalter bis Phase 4.6B; Treffer-Timing einzelner Clips (Wurf, Sprungtritt) nur stichprobenartig angesehen.

## 4.5.3 – Phase 4.5D: Die fünf Kaiser-Zitadellen – Seesperre mit Hafenkette, doppelter Festungsring und Kaiser-Bosse; zwölf Archipel-Inseln und eine größere Weltkarte. Damit ist Phase 4.5 abgeschlossen (25.11.2026, nur lokal)

**Was du siehst**
- **Fünf Kaiser-Zitadellen** stehen jetzt auf den bisher „Verbotenen Gewässern“ der Äußeren Kaiser-Meere (Ring 5, 14 200 m) – je eine pro Macht, 1,0 bis 1,25 km groß und damit deutlich größer, höher und bedrohlicher als die Mega-Inseln und die Königsinseln:
  - **Kaiserzitadelle Britannia** (England): weiße Bastionsmauern auf Kreideklippen, zwei Hafenmolen, der Admiralspalast der Seekaiser.
  - **Imperiale Kontor-Festung Batavia** (Niederlande): Seefestung aus Backstein, Kanal-Zitadelle und die Schatzgewölbe der Kompanie.
  - **Eiserner Kaiserdom** (Deutschland): schwarzer Stahl und Granit, Artillerietürme, eine glühende Hochofen-Zitadelle, Kluft und Glutgraben.
  - **Palais Impérial Solis** (Frankreich): Terrassen-Zitadelle mit Marmor-Kolonnaden und der Kaiserlichen Garde.
  - **Shogunats-Zitadelle Tenkoku** (Kurogane): Pagodenfestung im Krater eines Vulkans, Lavagräben und Obsidianbrücken.
  - Jede Zitadelle hat eine Hafenbucht zur Weltmitte, Küstengeschütze, einen **doppelten Festungsring** (Zinnenmauern mit Türmen und Toren, davor Wasser-, Kluft- oder Lavagräben mit **breiten, freistehenden Brücken**) und auf dem Thronhügel die **Thron-Zitadelle**.
- **Die Kaiser-Schlacht in drei Phasen – mitten in der offenen Welt:**
  1. **Kaiserliche Seesperre:** Kommst du auf etwa 2,6 km heran, laufen **sechs Stufe-5-Kriegsschiffe** mit Rammsporn und Drehbassen aus. Eine **Hafenkette** zwischen zwei **Ketten-Bastionen** im Wasser sperrt die Bucht, die Bastionen feuern zurück. Erst wenn **beide Bastionen** zerschossen sind, sinkt die Kette – vorher kannst du nirgends an Land gehen („Seesperre“).
  2. **Doppelter Festungsring:** Am Kaiser-Tor zur Bucht warten sechs große Wachverbände der Kaisergarde und zwei Elite-Offiziere mit Aura; an den beiden Toren des inneren Rings noch einmal sechs Verbände und zwei Offiziere. Deckungsmauern im Gürtel zwischen den Ringen geben Schutz.
  3. **Der Kaiser:** Erst wenn beide Ringe gefallen sind, öffnet sich der Thronsaal. Jeder Kaiser kämpft in **zwei Phasen**: Bei 50 % ruft er eine **Verstärkungswelle** (vier Verbände und zwei weitere Gardeoffiziere) und greift mit **Aura-Schockringen** an. Kein einzelner Treffer nimmt ihm mehr als **5 %** seiner Lebenspunkte.
  - Die Kaiser: **Seekaiser Edmund Ravenscourt**, **Generalstatthalter Maurits van Oranjeveld**, **Eiserner Kaiser Konrad von Hohenwacht**, **Sonnenkaiser Aurélien de Solis** und **Shōgun Kurenai Tenkoku**.
- **Lohn:** viel Gold (beim ersten Sieg noch mehr), viel Erfahrung und **Ruhm**, Regionalware der Insel, Relikt-Splitter, **Boss-Siegel** der Macht, eine neue Währung – **Kaiser-Siegel** – und sicher ein Stück **Kriegsherren-Beute**. Der **erste Sieg** über jeden Kaiser bringt einen **mythischen Bauplan** (Kronenbug der Seekaiser, Goldener Kontorrumpf, Eiserne Panzerplatten, Sonnensegel der Armada, Obsidian-Ramme), jeder weitere ein **Kaiser-Relikt**.
- **45 Minuten Ruhe:** Nach dem Sieg liegt die Zitadelle still; danach stehen Flotte, Bastionen und Garde wieder. Die Ruhezeit überdauert Speichern und Laden.
- **Zwölf Archipel-Inseln:** Sieben neue Inseln der Ringe 2 bis 4 sind jetzt **Doppelinseln** (ein Meeresarm teilt sie, zwei Holz- oder Steinbrücken verbinden die Hälften): Webersund, Harzwald, Seilerhafen, Jadeterrassen, Teakholm, Muskatbucht und Bois-Royal. Fünf Atolle haben eine **Lagune** mit langem Holzsteg: Nordlicht-Atoll, Rotlaternen-Riff, Lotsenbake, Étoile-de-Mer und die Irrlichtbucht. Sie sind 380 bis 540 m groß.
- **Sturmkrone-Ruinen:** wieder **Gefahrenstufe 4**, obwohl sie in Ring 3 liegen.
- **Krieg der Mächte:** Offensiven reichen jetzt **6,8 km** weit (bisher 4,4 km) – die Mächte greifen über die große Welt bis in die Königs-Meere. Die Kaiser-Zitadellen sind nie eroberbar.
- **Weltkarte (M):** Die Kopfleiste hat nur noch **zwei Zeilen** (oben Titel, Meere und Werkzeuge; darunter Ebenen und Mächte), Zeichenerklärung und Hinweis stehen links neben der Karte. Die Weltscheibe ist bei 1,00× am PC dadurch **rund 38 % größer**. Die Kaiser-Zitadellen tragen eine **Festungs-Silhouette mit Kaiserkrone** in der Farbe ihrer Macht und zeigen ihre Ringmauern schon als Umriss; Doppelinseln und Lagunen erkennt man an ihrem Meeresarm. Ein Klick auf eine Kaiser-Insel zeigt Phase, Ruhezeit und Siege.

**Technik (für Entwickler)**
- `data/kaiserIslands.ts` (rein): fünf `KaiserIslandSpec` → `kaiserMegaSpec` im Format der Mega-Inseln, eingetragen über `registerMegaSpec` (zählen nicht in `MEGA_IDS`). `kaiserLayout` (Bucht zur Weltmitte, Mauer- und Grabenradien, Tore), `ringWall`, `kaiserItems` (Thronsaal und Sonderbauten), `kaiserSite` → `KAISER_SITE_DEFS` (in `SITES`), `kaiserIslandDefs` (`mega` + `kaiser`, Stufe 27, Gefahr 5), `kaiserBlockade` (Bastionen, Kette, Wachstationen), `kaiserRingPosts`, `kaiserThrone`.
- `data/kaiserBattle.ts` (rein): Zustandsmaschine `seesperre → festungsringe → thron → besiegt` (`damageBastion`, `canLand`, `enterRing`/`clearRing`/`retreatRings`, `bossShouldAppear`/`bossPhase`/`bossDefeated`, `tickKaiser`), `KAISER` (Ruhezeit 2 700 s, Bastionen 5 200 LP, Batterie, Weck-/Schlafabstand), `kaiserBossDef` (Vorlage `RAID_BOSSES` der Macht, ×1,75 LP, Phasen bei 50 %, Aura-Angriffe, `hitCap` = `KAISER_BOSS_HIT_CAP` 0,05), `kaiserOfficerDef`, `rollKaiserLoot`, Spielstand `kaiserToSave`/`cleanKaiserSave`/`kaiserFromSave`.
- `world/kaiserLive.ts`: Seesperre beim Näherkommen (Wachen über `NavalSystem.spawnGuard`, Abbau mit `clearGuards`), Bastionen als `BallTarget` an `naval.raidTargets`, Kette und Bastionen als `IslandGround.shipBlockers`, Batterien über `fireBattery`; an Land `Horde` für die Ring-Verbände, Offiziere/Kaiser über `combat.spawnWave`, Hooks `onBossPhase`/`onSummon`. Je Bild ohne neue Objekte. Eingebunden in `SeaWorld` (`ensureKaiser`, Landesperre in `goAshore`/`updateContext`, `spawnCamp`, `returnedToShip`, `startRaid`), Lohn in `Game.kaiserVictory`.
- **Breite Brücken:** `RiftDef.wide` (Fahrbahn 9,2 m, Laufdeck `BRIDGE_WIDE_K`, Öffnung `RIFT_WIDE_K`). **Kollision:** `IslandGround.blockersNear` – ab 320 Hindernissen ein 16-m-Raster für `constrain` (Kaiser-Inseln haben über 3 000 Kollider); Begehbarkeits-Netz ab 450 m Radius mit 2-m-Zellen, Geländenetz mit Ringen alle 6,5 m.
- **Archipele:** `ARCHIPELS` in `data/openWorld.ts` (`toArchipel`, `archipelRifts`: Meeresarm bzw. Lagune so gedreht, dass kein Bauplatz im Wasser steht; Wege über die Brücken). `MegaIslandSpec.tier`/`IslandDef.dangerTier` als Vorgabe (Sturmkrone-Ruinen 4). `WAR.reach` 6 800; `warIslandOf`: Kaiser geschützt, kein Ertrag, keine Mega-Insel.
- **Weltkarte:** `MAP_MARGIN` 0,075; Kopfleiste mit `.wmap-row2` (Ebenen + Mächte), Handy unverändert (Ebenen als feste Leiste unten); `PoiKind` `kaiser` in `ui/minimap.ts`; Kaiser-Krone rechts neben der Insel, Namen notfalls seitlich (`megaLabel`); keine Schnellreise zu Kaiser-Inseln.
- **Spielstand:** bleibt Version 21; neues optionales Feld `world.kaiser` (fehlt es, stehen alle fünf unentdeckt und in voller Stärke), `unlocks.kaiserSeals` und `unlocks.kaiserRelics`.
- Tests: `tests/kaiserCitadels.test.ts` (22 Prüfungen) – 885 Tests insgesamt. Browser (Playwright, Ultra, 1440 × 900 und 390 × 844): Karte 1,00× und 2,50× ohne Überlappung; Britannia und Tenkoku von der Seesperre bis zum Kaiser durchgespielt – Seegefecht 121 FPS, Festungsring 148 FPS, Kaiser-Kampf mit Verstärkung 125 FPS, keine Konsolenfehler; Build-Start 8,1 – 8,4 s, 169 – 171 Shader-Programme.

**Phase 4.5 ist damit abgeschlossen:** Krieg der Mächte (4.5.0), Eingreifen in den Krieg (4.5.1), die erweiterte Welt (4.5.2) und die Kaiser-Zitadellen (4.5.3).

## 4.5.2 – Phase 4.5C: Die Welt wird 1,5-mal so groß – fünf Meeres-Ringe, 36 neue Inseln, Tiefsee-Strömungen, Schiffbrüchige, Schmuggler, Schatzsuchen an Land und Kriegs-Nachschub (25.11.2026, nur lokal)

**Was du siehst**
- **Die Welt ist gewachsen:** Der spielbare Ozean reicht jetzt bis **15 600 m** (bisher 10 400 m) – das ist die **2,25-fache Fläche**. Dahinter beginnt die Sturm-Barriere; bei **15 850 m** ist endgültig Schluss.
- **Fünf Meeres-Ringe** statt vier, jeder mit eigener Gefahrenstufe:
  1. **Bernsteinsee · Ruhige Innen-See** (bis 2 800 m, Stufe 1): das sichere Zentrum um Ankerglück.
  2. **Die Handels-Archipele** (bis 6 600 m, Stufe 2): Kolonien, Kontore, Rohstoff-Inseln und die Grenzfestungen der Marine.
  3. **Der Riff- und Sturmgürtel** (bis 10 200 m, Stufe 3): die sechs Mega-Inseln, Felsnadeln und Schmugglerbuchten.
  4. **Die Königs-Meere** (bis 13 000 m, Stufe 4 – 5): die sechs Königsinseln Albion, Adlerstein, Soleilmont, Oranjehaven, Yamikura und das Marine-Hauptquartier Weißwacht.
  5. **Die Äußeren Kaiser-Meere** (bis 15 600 m, Kaiser-Stufe): Vorposten, Leuchtturm-Atolle und fünf **„Verbotene Gewässer“** – freigehaltene Bauplätze, auf denen später die Kaiser-Zitadellen entstehen.
- **Die Kartenmitte ist entzerrt:** Alle bisherigen Inseln sind harmonisch nach außen gerückt (die Bernsteinsee um gut 60 %, die äußeren Meere um etwa 25 %). Ankerglück, sein Hafen und dein Heimatplatz bleiben genau, wo sie waren.
- **36 neue Inseln** in den Ringen 2 bis 5, je sechs bis sieben pro Macht:
  - **Kanonenstahl-Minen** (Zinnfels, Kohlenstieg, Rußhafen, Eisgrat, Ferroir),
  - **Hartholz-Forste** mit Sägemühle und Holzfäller-Lager (Eichenhain, Harzwald, Teakholm, Bois-Royal),
  - **Segeltuch-Manufakturen** mit Webhallen und Flachsfeldern (Webersund, Seilerhafen, Segelmacherhof, Voile Blanche),
  - **Gewürz- und Wein-Kolonien** (Muskatbucht, Zimtinsel, Jadeterrassen, Clair-Vin),
  - **Leuchtturm-Atolle** (Nordlicht-Atoll, Bakenriff, Rotlaternen-Riff, Lotsenbake, Étoile-de-Mer, Mondsichel-Atoll, Perlenhorn, Sturmhorn),
  - **Vorposten und Bastionen** der Mächte in den Königs- und Kaiser-Meeren (Kronwacht, Greifenhorst, Granitwacht, Sturmbastei, Schwertfels, Drachenmaul, Kap der Stürme, Fort Aurore),
  - und **drei weitere unkartierte Geheim-Inseln**: Irrlichtbucht (Schmugglerbucht), Ankerfriedhof und Das Letzte Licht.
  - Jede hat Stege, einen eigenen Markt und – wenn sie einer Macht gehört – kann im Krieg der Mächte erobert werden und liefert Rohstoffe.
  - Auf der Hauptkarte stehen jetzt **107 Hauptinseln** (dazu 7 Geheim-Inseln, die erst nach der Entdeckung erscheinen, und 42 Schären).
- **Fünf Tiefsee-Strömungen** zwischen den Ringen 2, 3 und 4 (Kronen-, Hanse-, Schwarzsegel-, Gewürz- und Lilien-Tiefstrom): wer mitsegelt, ist **35 % schneller**. So bleiben die längeren Überfahrten kurzweilig.
- **Lebendiges Meer:** Jetzt laufen **6 bis 8 Ereignisse gleichzeitig**, mindestens **2,2 km** auseinander und gleichmäßig über die Ringe 1 bis 4 verteilt. Dazu kommen vier neue Begegnungen:
  - **Schiffbrüchige (rote Notruf-Fackeln):** Ein Floß mit drei bis sechs Seeleuten. Fahr langsam heran, und du entscheidest:
    - **Als Crew anheuern** – sie kommen ohne Handgeld an Bord (ist die Mannschaft voll, zahlen sie Dankesgeld).
    - **Zum nächsten Hafen bringen** – 20 Minuten Zeit, dann Gold, Ansehen und Ehre bei der Hafenmacht.
    - **Wrack-Koordinaten bergen** – ein reiches Wrackfeld mit Ladung und einer sicheren Schatzkarte.
  - **Schmuggler-Rendezvous (violett-goldene Leuchtraketen):** Auf offener See oder in einer abgelegenen Bucht ankert ein Schmuggler. Er verkauft einen **Werft-Bauplan einer Macht**, **Relikt-Splitter** und **Schmuggelware** (jedes Geschäft erhöht deinen Fahndungsdruck). Oder du **nimmst ihn für die Marine hoch**: Die Schmuggler wehren sich; besiegst du sie, gibt es Gold, Ansehen bei der Marine und die beschlagnahmte Ware.
  - **Schatzsuche an Land:** Gefundene Schatzkarten (aus Treibgut oder einem Wrackfeld) und Gerüchte (dünner Rauch über einer Insel) markieren einen **Suchbereich**, umgeben von roten Wimpeln. Betrittst du ihn, schlagen **Schatzjäger aus dem Hinterhalt** zu; die halb ausgegrabene Truhe kannst du erst bergen, wenn sie vertrieben sind. Beute: Gold, Relikt-Splitter und oft ein Ausrüstungsteil.
  - **Kriegs-Nachschub (Signalfeuer in Nationsfarbe):** Schwer bewachte Transporte bringen Nachschub von einer Rohstoff-Insel an eine belagerte Front.
    - **Begleitest** du ihn, schickt die Gegenseite Kaperschiffe; kommt er an, gibt es Gold, Ansehen und Kriegspunkte, und die Belagerung bekommt frische Truppen.
    - **Fängst** du ihn ab, erbeutest du Kanonenstahl, Hartholz und Medizin, und die Belagerung leidet.
  - Alle vier haben eigene Zeichen auf Kompass, Minikarte und Weltkarte.
- **Weltkarte (M):**
  - Bei **1,00×** steht die ganze Welt mit sauberem **10 %-Rand** mitten im freien Feld zwischen Titelleiste und Legende. Albion, die Kaiser-Meere und der Süden sind nie abgeschnitten, auch nicht am Handy.
  - Beim Hineinzoomen lässt sich der Rand bis unter die Leisten hervorziehen; das Zoom geht jetzt bis **7×**.
  - Namen, Ereignis- und Festungssymbole überdecken sich nie, auch mit über 150 Inseln.
  - Ring 5 hat eine eigene violette Tönung, die Bauplätze der Kaiser sind gestrichelt eingezeichnet.
- **Alte Spielstände** werden auf die größere Welt umgerechnet (Spielstand 21, siehe unten). Dein Schiff liegt danach am selben Ort relativ zu seiner Insel, und entdeckte Inseln, Flotte und Kriegsstand bleiben erhalten.

**Technik (für Entwickler)**
- **Welt** (`data/world.ts`): `PLAYABLE_RADIUS` 15 600, `WORLD_RADIUS` 15 930, `EDGE_WALL` 15 850 (Sturm-Barriere 15 600 – 15 850 m über `world/stormEdge.ts`). Uferfeld des Ozeans `SHORE_SIZE = WORLD_RADIUS · 2,04` (rund 8 m je Texel).
- **Ringe** (`data/worldRings.ts`): fünf Ringe 0 / 2 800 / 6 600 / 10 200 / 13 000 / 15 600 m mit `tierName` (Ring 5: „Kaiser-Stufe“). `outerSeaLevel` steigt bis Stufe 22 am Rand von Ring 4 und bis 26 an der Sturm-Barriere. Gefahrenbänder `DANGER_BANDS_M` 0 / 2 800 / 6 600 / 10 200 / 11 600 (`data/balanceConfig.ts`). `KAISER_SITES`: fünf Bauplätze bei 14 200 m auf der Mittellinie jedes Sektors, je 1 200 m frei (`inKaiserSite`).
- **Entzerrung** (`data/worldSpread.ts`): stückweise lineare, umkehrbare Abbildung alter auf neue Abstände (`SPREAD_KNOTS`, `spreadDist`/`unspreadDist`, `spreadPoint`/`unspreadPoint`); bis 250 m bleibt alles stehen (Ankerglück, `HOME_SPAWN`). Die Lage-Tabellen (`regions.ts`, `factions.ts` `BORDER_FORTS`/`CITADELS`, `openWorld.ts`, `megaIslands.ts`) tragen die umgerechneten Zahlen. Gefahrenstufe der Mega-Inseln jetzt aus `dangerOfDistance`; `seaLevelAt`, `sectorLabel`, Bernsteinsee-Region (Kreis 2 800 m um den Mittelpunkt) und `DISCOVERY.startRadius` (3 050 m: dieselben Startinseln) angepasst. `WAR.reach` bleibt 4 400 m.
- **Inseln** (`data/openWorld.ts`): `THEME_ISLANDS_43B` (24) + `EXPANSION_ISLANDS` (36) = `THEME_ISLANDS`; neue Bausteine `forst` und `manufaktur` in `themeItems`; Märkte in `ISLAND_PROFILES`. Lagen per Platzsuche gegen Platzbedarf, Grenzlinien (≥ 780 m), Kaiser-Bauplätze und Ringgrenzen. `themeIslandDefs` entfernt −0 (JSON-Rundlauf).
- **Strömungen** (`data/seaEvents.ts` `CURRENT_LANES`): fünf Bänder mit `deep: true` (Breite 190 m), `CurrentLane.deep`.
- **Begegnungen** (`world/worldEventDirector.ts`, rein und JSON):
  - Arten `schiffbruch`, `schmuggler`, `schatzjagd`, `nachschub` (`ENCOUNTER_KINDS`), Signale `notfackel`, `violettrakete`, `schatzrauch`, `signalfeuer`, Ausgänge `gerettet`, `angekommen`.
  - Felder `survivors`, `rescue`, `offers` (`SmuggleOffer`), `busted`, `site`, `ambushed`, `mapped`, `siegeId`, `side`, `foe`, `fromName`, `escortT`, `tripT`, `raided`.
  - Aktionen `rescue`, `follow`, `rescueArrived`, `createWreck`, `nearestPort`, `buyOffer`, `bust`, `ambush`, `claimTreasure`, `startTreasureHunt` (höchstens drei kartierte Suchen, ohne Mindestabstand).
  - Kaperschiffe gegen begleiteten Nachschub (`raidSupply`, Meldung `supplyRaid`).
  - Verteilung: `pickRing` (Ring mit den wenigsten Ereignissen, nach Fläche gewichtet), `DIRECTOR.nearShare` 0,5, `minActive` 6, `maxActive` 8, `minSpacing` 2 200, `bootstrapGap` 3. Weltbosse in Ring 4 (10 600 – 12 700 m). Zahlen in `RESCUE`, `SMUGGLER`, `HUNT`, `SUPPLY`.
  - `DirectorWorld.fronts` liefert die Belagerungen (`SupplyFront`).
- **Krieg** (`world/factionWarEngine.ts`): `supplyFronts` (Rohstoff-Inseln je Seite), `supplyArrived` (Truppen/Garnison, Moral, Fortschritt), `supplyLost`.
- **Seewelt:** `worldEventsLive.ts` mit `encounters()` (Annäherung langsamer als 4,5 bzw. 6 m/s → Meldung `encounter`, `answered`, `askAgain`), Eskorte über `follow`, `bust` (Schiffe feindlich; auch nach Neubau über `adopt`), `huntOn`/`huntsNear`/`huntAmbush`/`huntClaim`/`treasureMap`. Rolle `schmuggler` (`SeaShipRole`, KI ankert in `NavalSystem.aiEvent`). Darstellung `worldEventView.ts`: farbige Leuchtraketen (`flare(x, z, …, Farbe, Periode, Höhe)`), Flöße und Schiffbrüchige als `InstancedMesh`, Rauchsäule der Schatzsuche. Land: `world/treasureHunt.ts` (`TreasureHuntView`: Pfähle mit Wimpeln als ein Instanz-Netz, eine Truhe), `SeaWorld.updateHunt` (Hinterhalt über `spawnWave`, Kennung `hunt:<ereignis>`), Kontext „Schatztruhe bergen“.
- **Spiel** (`core/game.ts`): `openEncounter`, `rescueChoice`, `smugglerPick`, `encounterEnd` (Lohn, Kriegswirkung des Nachschubs, `awardMerit`), `supplyName`; Schatzkarten aus Treibgut werden zur Schatzsuche (früheres X als Ausweichweg). Menü `Menus.showEncounter` (`EncounterView`). Kartenzeichen `castaway`, `smuggler`, `hunt`, `supply` (`ui/minimap.ts`), Farbe der Nation auf der Weltkarte.
- **Weltkarte** (`ui/mapView.ts`, `ui/worldMap.ts`, `ui/worldMapDraw.ts`):
  - `MAP_MARGIN` 0,1, `MAP_EXTENT = WORLD_RADIUS / 0,8`, `MAP_ZOOM_MAX` 7.
  - `setMapSafeArea`/`mapSafeArea` (Leistenhöhen, gemessen in `WorldMap.measureChrome` über der Spalte der Weltscheibe): `fitScale` passt die Welt ins freie Band, `fitAll` zentriert darin, `clampView` lässt um die Leistenhöhe weiter schieben; `discMargins` für Prüfungen.
  - `LabelPlacer` mit 720 Plätzen; Ereignis- und Festungssymbole reservieren ihre Fläche. Ring 5 getönt, Kaiser-Bauplätze gestrichelt („Verbotene Gewässer“ ab 1,15×).
- **Spielstand 21** (`core/save/worldMigration.ts`, Migration 20 → 21): `migratePoint` (nahe einer alten Insel relativ zu ihr, sonst `spreadPoint`; Wasserpunkte nie in einer Insel, `pushOutOfIslands`), angewandt auf Schiff, Seekarten-Zonen (an ihre Insel), Ereignisse, Konvois, Wetterzellen, Armadas, Großschlachten und Kontrollpunkte (Landpunkte bleiben auf ihrer Insel). Entdeckte Inseln, Flotte, Inselbesitz, Kassen, Verträge und Kriegspunkte bleiben unverändert. `cleanWorldEvents` säubert alle neuen Felder.
- **Repo:** `.playwright-mcp/` und `qa_tmp/` stehen in `.gitignore`.
- **Tests:** `tests/expandedOpenWorld.test.ts` (34 Tests):
  - Radius und Sturm-Barriere, fünf Ringe, Zonen der Mega- und Königsinseln
  - Entzerrung, 105 – 112 Hauptinseln ohne Überlappung, Märkte, Stege, Krieg, Blueprint ohne three.js
  - Kaiser-Bauplätze, Tiefsee-Strömungen
  - Director mit 6 – 8 Ereignissen, Abstand und Ringverteilung
  - alle vier Begegnungen samt Entscheidungen, Engine-Kopplung, JSON-Rundlauf
  - Kartenrand und Beschriftung auf Desktop und Handy, Migration 20 → 21
  - Bestehende Tests auf die neuen Zahlen umgestellt. Stand: 863 Tests, `tsc`, Build.
- **Abnahme (Playwright, Ultra):**
  - **Weltkarte:** Desktop 1 440 × 900 und Handy 390 × 844, jeweils bei 1,00× und 2,50× (Nordrand mit Albion und Ring 5), alle 156 Inseln aufgedeckt: 0 überlappende Beschriftungen.
  - **Begegnungen im Spiel:** Schiffbrüchige (Fenster, Anheuern), Schmuggler-Rendezvous (Kauf, Hochnehmen, Kampf, Lohn) und Schatzsuche an Land (Hinterhalt, Sperre, Bergen, Lohn).
  - **Bildrate (Ultra, mit Begegnungen in Sicht):** 146 FPS bei 1 440 × 900 und 145 FPS bei 390 × 844, auf der Grafikkarte des Entwicklungsrechners (kein echtes Handy).
  - **Konsole** ohne Fehler und Warnungen.
  - **Build:** Startzeit 7,8 – 8,3 s, 168 – 170 Shader-Programme.

## 4.5.1 – Phase 4.5B: Eingreifen in den Krieg – Landkampf um Kontrollpunkte, Seekampf mit Kriegspunkten, Kriegsaufträge, Zweier-Bündnisse, Taktik-Banner und Karte „Krieg & Frontlinien“ (25.11.2026, nur lokal)

**Was du siehst**
- **Belagerungen sind eine Doppel-Front, an der du mitkämpfst:**
  - **Auf See:** Versenkst du das **Kommandoschiff** einer Armada (oder schießt es kampfunfähig), bricht die Moral der Belagerer um 22 % ein. Ein **Nachschub-Transporter** kostet sie 38 %. Jedes Schiff bringt dir **sofort Kriegspunkte** bei der Macht, der es nützt: Kommandoschiff 40, Transporter 30, sonst 15.
  - **An Land:** Jede Belagerung hat **taktische Kontrollpunkte**: kleine Inseln zwei, Häfen, Festungen und Mega-Inseln drei (Hafen-Barrikade, Marktplatz, Garnisons-Hof).
    - Jeder Punkt hat eine Fahne und einen Fangring in der Farbe der haltenden Seite (weiß = umkämpft).
    - Wer im Ring die Übermacht hat, erobert ihn. Deine Figur zählt wie zehn Soldaten, jeder Offizier wie vier.
  - **Die Punkte bestimmen das Tempo:** Hält der Angreifer alle, fällt die Insel 2,6-mal so schnell. Hält der Verteidiger alle, **läuft der Fortschritt zurück**, und bei 0 % ist die Belagerung abgewehrt.
  - Hast du Partei ergriffen, greifen dich die Trupps der Gegenseite an, und du kannst sie mit Hieben, Geschossen, Fähigkeiten und deinen eigenen Trupps treffen.
  - **Kriegspunkte an Land:** Ein aufgeriebener Trupp in deiner Nähe bringt 6, ein Punkt, den deine Seite mit dir erobert, 20.
  - **Verstärkung:** Gefallene Trupps ersetzt die Reserve per Beiboot bzw. aus dem Ort, höchstens alle 12 Sekunden. So dauert eine Landschlacht Minuten, nicht Sekunden.
- **Partei ergreifen:** Stehst du an Land, ohne dich entschieden zu haben, zeigt das Banner zwei Knöpfe („Für Frankreich kämpfen“ / „Für England kämpfen“), auch per Fingertipp. Ein angenommener Kriegsauftrag stellt dich automatisch auf die Seite deines Auftraggebers.
- **Taktik-Banner oben in der Mitte (3.0-Stil):** Es erscheint bis 1,5 km von einer Belagerung oder Großschlacht und zeigt:
  - beide Mächte mit Kriegsschiffen, Transportern bzw. Garnison
  - Belagerungsfortschritt, Moral, Kontrollpunkte und eine Uhr („≈ 7:20“, „läuft zurück“, „ruht (Seeschlacht)“, „steht“)
  - deine Seite und deine Kriegspunkte
- **Kriegsaufträge** im Fenster „Ruf & Ehre → Weltlage“, abgeleitet aus dem, was gerade geschieht:
  - **Belagerung entsetzen** und **Blockadebrecher-Lieferung** (für den Belagerten)
  - **Invasions-Armada anführen** (für den Angreifer)
  - **Nachschubkonvoi abfangen** (für den Herrn des Ziels)
  - **Lohn:** viel Gold (je nach Insel 700 – 2 200), Boss-Siegel der Auftragsmacht (Festungen und Mega-Inseln zwei), Ehre und Ansehen beim Auftraggeber.
  - **Bedingungen:** Höchstens zwei Aufträge gleichzeitig, 15 Minuten Zeit, das Ziel steht auf Kompass und Karte.
  - **Beitrag:** Entsatz und Invasion brauchen 60 Kriegspunkte. Ab der Hälfte gibt es einen anteiligen **Teil-Lohn** ohne Siegel, darunter scheitert der Auftrag.
  - **Blockadebrecher:** Er liefert 6 Medizin (oder 8 Kanonenstahl) bis vor den Hafen. Dann bekommt die Garnison +25, die Belagerer verlieren 12 % Moral und 12 % Fortschritt.
  - **Aufgeben** kostet etwas Ansehen. Wer der Macht verhasst ist (unter −20), bekommt keinen Auftrag.
- **Zweier-Bündnisse:** Handelspartner mit hohem Vertrauen und einem gemeinsamen Gegner schließen ein **Militärbündnis**.
  - Erklärt einer den Krieg, **zieht der Partner mit** (Meldung „Bündnisfall“).
  - Wird eine Insel des Partners belagert, schickt der Verbündete eine **Entsatzflotte** und tritt dafür in den Krieg ein.
  - Das Bündnis läuft nach 40 Minuten aus, wenn kein gemeinsamer Gegner mehr bleibt; der Handelspakt bleibt.
  - Die Weltlage trennt „Bündnis“ und „Koalition“.
- **Weltkarte (M), neuer Filter „Krieg & Frontlinien“:** Armadas mit gestrichelter Frontlinie zu ihrem Ziel, Belagerungsringe mit Fortschritt, Großschlachten, **Bündnislinien** zwischen den Hauptstädten (gold: Zweier-Bündnis, violett: Koalition) und **eroberte Inseln mit Rahmen** in der Farbe des neuen Herrn.
  - **Unter 1,25× Zoom** werden Belagerungen und Schlachten zu **gebündelten Kampf-Symbolen** (Fahne bzw. gekreuzte Kanonen, „×2“ bei mehreren) ohne Text. Die Kartenmitte bleibt lesbar.
  - Volle Texte erscheinen beim Hineinzoomen oder beim Antippen der Insel; das Inselfenster zeigt dann auch die Kontrollpunkte.
- **Kompass:** An Land zeigen Festungszeichen die Kontrollpunkte in der Farbe ihrer Seite; laufende Kriegsaufträge setzen das Ziel, wenn kein Story-Auftrag verfolgt wird.

**Technik (für Entwickler)**
- **Engine** (`world/factionWarEngine.ts`, weiter rein und JSON):
  - `SiegeState.points` (`siegePoints`, `pointsMean`) und `helpers` (Seite je Spieler).
  - `controlStep(siegeId, att, def, dt, present)` (Übermacht schiebt `hold`, Wechsel bei ±1 mit Meldung `punkt`, Kriegspunkte für den anwesenden Spieler).
  - `siegeRate`/`siegeEta`, Abwehr bei 0 % und Mittel ≤ −0,95.
  - `syncShip(…, by)` mit `creditSink`/`beneficiaryOf`, `awardMerit`/`meritOf` (Meldung `kriegspunkte`), `siegeLosses` (Verluste an Land als Differenz).
  - Kriegsaufträge: `contractOffers`, `acceptContract`, `abandonContract`, `deliverBlockade`, `stepContracts` (`settleByMerit` mit Teil-Lohn), `contractsOf`.
  - Bündnisse: `RelationState.allianceUntil`, `bilateral`, `commonFoe`; `declareWar(a, b, chain, ally)` mit Bündnisfall, Entsatz für den Partner in `think` (1b).
  - Zustand: `contracts`, `merit`, `stats.alliances/contracts`. Alle Zahlen in `WAR` (Kontrollpunkte, Kriegspunkte, Bündnis, Aufträge, Lieferung, `troopsPerHead`, `reinforceEvery`); Lohn in `CONTRACT_DEFS`/`CONTRACT_TIER_K`, Ladung `BLOCKADE_CARGO` (`data/nations.ts`).
- **Spielstand:** bleibt Version 20. Stände aus 4.5.0 laden ohne Verlust: `cleanFactionWar` legt Kontrollpunkte aus Insel und Lage der Flotte neu an (umkämpft) und ergänzt Aufträge, Kriegspunkte und Bündnisdauer.
- **Live-Schicht** (`world/factionWarLive.ts`):
  - `SiegeTroops` mit Kontrollpunkt-Markierungen: Fahnenmast, Fahne, Torus als Fangring; geteilte Netze, `MeshBasicMaterial`, kein neues Shader-Programm.
  - Truppen-Zuweisung zu den Punkten, `control` (Präsenz, Engine-Schritt, Nachrücken), `setSide` (Gegenseite in `combat.mass`, Ziele Spielfigur und Crew über `WarLiveHost.playerFoe/crew/strike/onFoot/setMass`).
  - Verstärkung `reinforce` (gleiche Feldlänge), Verluste `takeLosses`; `join(side)`, `siegePoints`, `siegeSquads`.
- **Seewelt/Spiel:** Belagerungsmeldung beim Landgang (`spawnCamp`). `Game`: `warHudView` + `ui/warBanner.ts` (Zone `tc`, Klick-Delegation), `joinWarSide`, `payMerit`, `contractEnded`, `warContractsView`/`acceptWarContract`/`abandonWarContract`, `warTarget`, `checkBlockadeDelivery`. Kriegsaufträge im Menü über `Menus.warOrdersHtml`.
- **Karte:** Ebene `war` in `MapLayers`, `MarkClusters` (`ui/mapView.ts`, `WAR_LABEL_ZOOM` 1,25, `WAR_CLUSTER_PX` 46), Beschriftung unter/über dem Zeichen (`label2`), Kampf-Symbole vor allen Texten. `WorldMapData.wars` mit `alliances`, `conquered`, Armada-Ziel und Kontrollpunkt-Text.
- **Tests:** `tests/factionWarIntervention.test.ts` (15):
  - Kontrollpunkte: Anlage, Übermacht, 2,6-fach, Zurücklaufen und Abwehr, Kriegspunkte
  - Kommandoschiff und Transporter
  - Bündnis-Schluss, gemeinsame Kriegserklärung, Entsatz für den Partner, Auslaufen
  - Angebote und Höchstzahl, Entsatz mit vollem, Teil- und keinem Lohn, Invasion, Lieferung mit Differenz-Verlusten, Ablauf und Aufgeben
  - Stand aus 4.5.0 über `migrateSave` und Rundlauf
  - Bündelung und Karte bei 1,00× und 2,50× ohne Überlappung

  **829 Tests**, `tsc` und `npm run build` grün.
- **Im Browser geprüft** (Playwright, Ultra; Desktop 1440 × 900 und Handyformat 390 × 844), französische Belagerung von Nebelhafen:
  - **Annehmen:** Vier Angebote, „Belagerung entsetzen“ per Klick angenommen, Seite Verteidiger.
  - **See:** Kommandoschiff kampfunfähig geschossen; Moral 100 → 78 %, +40 Kriegspunkte (+160 Gold, +3 Ansehen), Banner aktuell.
  - **Land:** Französische Trupps greifen die Figur an. Fünf aufgeriebene Trupps kosten die Engine 50 Soldaten (+30 Kriegspunkte), Verstärkung landet per Beiboot. Die Barrikade wechselt mit der Figur zu England (+20), danach läuft der Fortschritt zurück, bis die Belagerung abgewehrt ist.
  - **Blockadebrecher:** Fortschritt 50 → 38 %, Moral −12 %, Garnison 65 → 88 und bleibt; Lohn 1.200 Gold, ein Siegel, Ehre und Ansehen.
  - **Handy:** Partei per Fingertipp gewählt, danach sechs Trupps angreifbar.
  - **Karte:** 1,00× 51 Beschriftungen, 2,50× 79, 0 Überdeckungen (Handy 37 bzw. 55, 0).
  - **Bildzeit** im Landkampf auf Ultra 8,1 ms (≈ 124 Bilder je Sekunde); keine Konsolenfehler.
  - **Startzeit im Build** 8,19 – 8,56 s, 168 – 169 Shader-Programme; das Auftauchen von Truppen und Fahnen übersetzt kein neues Programm.
- **Gefunden und behoben:**
  - Die sichtbaren Trupps standen für das ganze Heer: Die eigene Crew rieb an Land in Sekunden die ganze Belagerung auf. Jetzt gilt 1 Kopf = 2,5 Soldaten, dazu Verstärkung.
  - Das Betreten der Insel leerte die angreifbaren Verbände.
  - Die Lieferung wurde vom Landkampf überschrieben.
  - Der Lieferradius war für lange Stege zu klein.
  - Die Belagerungsuhr zeigte bei fast stehendem Fortschritt „20688:12“.
  - Ein Kampf-Symbol überdeckte einen Ereignistext.
- **Abweichungen und offene Punkte:**
  1. Die Kontrollpunkte liegen geometrisch (Küste zur Flotte hin, Ortsmitte, Inselinneres), auf begehbaren Boden gerückt – nicht an bestimmten Gebäuden. Auf zerklüfteten Mega-Inseln kann ein Punkt am Rand eines Bezirks liegen.
  2. Verschoben werden die Punkte nur von echten Kämpfern in deiner Nähe; fern vom Spieler bleiben sie stehen (die Hintergrund-Rechnung bleibt wie in 4.5A).
  3. Echte Landtruppen gibt es weiter nur an der nächsten belagerten Insel.
  4. Die Seite lässt sich an einer Belagerung nicht mehr wechseln, nachdem du Partei ergriffen hast (außer über einen neuen Auftrag der Gegenseite).
  5. Gamepad: Die Partei wählt man per Maus/Finger im Banner oder per Auftrag; eine eigene Taste gibt es nicht.
  6. Kein Test auf einem echten Handy.
  7. Beim Prüfen des fertigen Spiels lädt der Playwright-Browser den Spiel-Installer herunter (`Sturmkrone-Setup.exe`, schon in früheren Läufen) – mit 4.5B hat das nichts zu tun.

## 4.5.0 – Phase 4.5A: Krieg der Mächte – eigene Wirtschaft, Nutzen-KI, Diplomatie und Koalitionen, Großschlachten mit Nachschub, Belagerungen und Besitzerwechsel (25.11.2026, nur lokal)

**Was du siehst**
- **Die Welt führt ihre eigenen Kriege.** Sechs Mächte – England, Niederlande, Deutschland, Frankreich, Kurogane und die Marine – wirtschaften, rüsten, verhandeln und kämpfen, auch wenn du nicht hinsiehst. **38 von 51 bewohnten Inseln** können den Herrn wechseln: Kolonien, Häfen, die Grenzfesten an den Meerengen und **alle sechs Mega-Inseln**. Geschützt bleiben die fünf Hauptstädte, Weißwacht und die ganze Bernsteinsee mit Ankerglück.
- **Rohstoffe:** Gold, Kanonenstahl, Hartholz, Segeltuch, Proviant, Medizin und Rekruten. Jede gehaltene Insel liefert, was ihr Markt herstellt (Stahlminen Stahl, Holzkolonien Holz, Häfen Gold und Mannschaft …). Flotten, Truppen, Reparaturen und Belagerungen kosten. Verliert eine Macht eine Rohstoff-Insel, fehlt ihr dieser Nachschub.
- **Die Mächte denken mit:** Fehlt Holz, nimmt die KI eine Holzkolonie ins Visier, fehlt Stahl, eine Stahlmine. Mit voller Kriegskasse plant sie **Großoffensiven** auf Meerengen und Mega-Inseln. Belagerte eigene Inseln bekommen **Entsatzflotten**. Krieg erklärt eine Macht nur, wenn sie die Armada auch bezahlen kann. Die Marine erobert nichts: Sie holt nur ihre eigenen Inseln zurück und stellt sich gegen Übermächtige.
- **Diplomatie:** Allianz, Handelspakt, Neutral, Rivalität und Offener Krieg, mit Vertrauen und Kriegsmüdigkeit.
  - **Handelspakte** schließen Mächte, deren Überschüsse sich ergänzen: +20 % Ertrag, dazu tauschen sie Waren.
  - Lange Kriege enden im **Waffenstillstand** (20 Minuten Frieden), der Schwächere zahlt **Reparationen**.
  - Wird eine Macht **übermächtig** (mehr als 34 % aller Ressourcen oder mehr als drei Mega-Inseln), schließen sich die Bedrohten zur **Koalition** zusammen und greifen gemeinsam an. Fällt der Hegemon unter 28 %, löst sich die Koalition auf.
- **Armadas:** 6 bis 10 Schiffe, nämlich ein Kommandoschiff (Klasse 4 – 5, Ausbau 4 – 5), Linienschiffe und Fregatten sowie 1 – 2 bewaffnete **Nachschub-Transporter** mit Truppen, Proviant und Medizin.
- **Großschlachten auf See:** Treffen feindliche Armadas aufeinander, kämpfen sie, bis eine Seite abdreht: bei unter 30 % ihrer Anfangs-Feuerkraft, spätestens nach 7 Minuten.
  - **In deiner Nähe (ab 1,5 km) werden aus den Daten echte Schiffe** in den Farben ihrer Macht. Du kannst zusehen oder eingreifen; wie bei den Grenz-Seeschlachten zählt das für Ruf & Ehre.
  - Weiter weg rechnet die Welt die Schlacht nach festen Regeln zu Ende, ohne Zufall von außen. Ab 2,3 km werden die Schiffe wieder zu Daten, nahtlos in beide Richtungen.
- **Belagerungen:** Die Armada legt sich als Ring vor die Zielinsel.
  - In deiner Nähe **landen ihre Truppen per Beiboot** und kämpfen am Strand gegen die Garnison: zwei Heere in den Uniformen ihrer Mächte.
  - Hält die Belagerung **rund 12 Minuten**, fällt die Insel, und der Sieger erbeutet die Hälfte ihrer Vorräte.
  - **Ein versenkter Nachschub-Transporter lässt die Moral der Belagerer drastisch einbrechen.** Das gilt auch, wenn du ihn versenkst. Ohne Proviant und Medizin hungert die Belagerung aus und bricht ab.
- **Besitzerwechsel, den man sieht:** Ein Banner meldet „X ist gefallen“.
  - Auf der eroberten Insel wehen Flaggen und Banner des Siegers, die Laternen leuchten in seiner Farbe, und seine Wachen stehen am Hafen.
  - Inselname auf der Karte, Hafenherr und Marktpreise wechseln mit, auch auf den Mega-Inseln: Die Bezirkswachen tragen dann die Farben der neuen Macht.
  - An Grenzfesten, die nicht mehr der Marine gehören, patrouillieren keine Marine-Boote mehr.
- **Kriegswirtschaft:**
  - Belagerte und frisch eroberte Inseln zahlen **bis zum 1,9-Fachen** für Kanonenstahl, Hartholz, Medizin und Segeltuch, denn die Garnison kauft die Vorräte auf.
  - **Embargo:** Der Herr eines Hafens kauft und verkauft keine Exportwaren seiner Kriegsgegner. Das Kontor zeigt „Embargo“ samt der verfeindeten Macht. Was die Insel selbst herstellt, bleibt frei, Schwarzmärkte sind ausgenommen.
- **Weltlage** im Fenster „Ruf & Ehre“ (auch auf dem Handy): Inseln, Mega-Inseln, Anteil an den Ressourcen, Kriege, Pakte, Rivalen, Armadas auf See, Kriegskasse, Hegemon und Koalitionen, dazu die Bilanz aller Kriege bisher.
- **Meldungen:** Kriegserklärungen, Waffenstillstände, Pakte und Koalitionen erscheinen immer. Armadas, Großschlachten, Belagerungen und versenkte Transporter werden in deiner Nähe gemeldet, mit Richtung und Entfernung.
- **Weltkarte:** Armadas erscheinen als Pfeile in der Farbe ihrer Macht, Belagerungen mit Fortschrittsring, laufende Großschlachten als gekreuzte Kanonen.
- **Kamera-Feinschliff:** Kommt die Kamera der Figur näher als 0,70 m (Rücken an der Wand), blendet die Figur weich aus, bei 0,45 m ganz, statt von innen gezeigt zu werden.

**Technik (für Entwickler)**
- **Daten** (`data/nations.ts`, rein):
  - Rohstoffe (`RESOURCE_IDS`, Ziel-, Ober- und Unterhaltswerte)
  - Ertrag je Inselstufe (`BASE_YIELD`) und je Marktware (`GOOD_YIELD`)
  - Garnisonen, strategischer Wert, Schiffskosten je Klasse (`SHIP_COST`), Rollen (`ROLE_PLAN`, `TROOPS_PER_SHIP`, `TRANSPORT_SUPPLY`)
  - Lehren der KI (`NationDoctrine`: Angriffslust, Handel, Eroberung, Gewichte), `NATION_DEFS`, `START_RELATIONS`
  - **alle Zahlen der Simulation in `WAR`**
- **`world/factionWarEngine.ts`** (rein, kein three.js, Zustand als JSON, eigener Zufall im Zustand):
  - `NationRegistry`: neue Nation = ein Eintrag, Zustand, Beziehungen und Wirtschaft ergänzen sich, auch in alten Ständen.
  - `warWorldFromDefs` übersetzt die Inseln in `WarIsland` mit Stufe, Ertrag, Schutz und Eroberbarkeit.
  - `FactionWarEngine.update(dt)` rechnet in Schritten zu 1 s, höchstens 30 je Aufruf. Wirtschaft alle 60 s; Diplomatie und KI alle 30 s.
  - Nutzen-KI: `utility` = Mangel × Lehre + strategischer Wert + Mega-Bonus gegen Entfernung und Garnison, Schwelle `0,95 − 0,45 · Angriffslust`. `affordPlan` hält 25 % Gold und Proviant als Reserve zurück.
  - Armadas fahren auf Wegen um die Inseln. Schlachten laufen über Feuerkraft, Treffer auf Transporter und Rückzugsregeln; Belagerungen über Nachschub, Zermürbung, Küstenfeuer und Fortschritt; dazu Eroberung mit Beute.
  - Meldungen (`WarNotice`) über `drain()`; `cleanFactionWar` prüft geladene Stände (eine Hauptstadt lässt sich nicht verschenken).
- **`world/factionWarLive.ts`:**
  - Echte Schiffe ab 1 500 m über `NavalSystem.spawnEventShipSteps`, Abbau ab 2 300 m. Je Armada höchstens 8 / 5 / 3 Schiffe nach `NavalSystem.detail`; gebaut wird gerecht, das Schiff der Armada mit den wenigsten zuerst.
  - Lage, Rumpf, Segel und Untergang gehen über `syncArmada`/`syncShip` zurück an die Engine.
  - Eine Schlacht übernimmt die Seewelt erst, wenn beide Seiten mindestens zwei echte Schiffe haben (`setBattleLive`); bis dahin rechnet die Engine, höchstens 25 s wartet sie auf Bauaufträge.
  - Belagerungstruppen ab 650 m (Abbau 950 m): `SiegeTroops`, zwei Seiten mit `TroopSquad` und `TroopRenderer` in den Uniformen (`hordePalette`), Landung per Beiboot; Verluste gehen anteilig über `syncSiege` zurück.
- **Seesystem:** `NavalSystem.openWarBattle`/`closeWarBattle` (`SeaBattle.war`, ohne Marine-Eingriff und Zeitlimit), KI-Schaden in Großschlachten `BATTLE.warDamage` 1,5 (gleiche Trefferpunkte wie in der Engine über `maxHull`), `fortOwner` (Marine-Patrouillen nur an Marine-Festen).
- **Welt:**
  - `WorldStreamer.restyle(i)` + `StreamHost.restyleActive` (höchstens ein Umkleiden je Bild, nur ACTIVE_HIGH). Entladene Inseln lesen den Besitzer beim nächsten Aufbau.
  - `SeaWorld.dressOwner`: Banner-Zwillinge über `userData.bannerPose`, Laternen über `userData.factionLantern`.
  - `ownerFaction`/`ownerName` für Festungen, Häfen, Mega-Bezirke und Namen; Wachen der Eroberer über `updateWarGarrisons`.
- **Markt:** `WAR_DEMAND` (`data/economy.ts`), `warDemandK` und `embargoed` (`core/economyEngine.ts`); `Game.marketSite` setzt `war` und `embargo`, Kauf und Verkauf verweigern Embargo-Waren.
- **Spielstand 20:** `world.factionWar`. Die Migration 19 → 20 setzt `null`, beim nächsten Laden entsteht das Ökosystem mit einem Startwert aus `meta.created`.
- **Nahblende:** `cameraNearFade`, `NearFade` und `NEAR_FADE` (`graphics/cameraRig.ts`), im Figuren-Shader die Uniform `uSkNear` (gerastertes Ausblenden über die Rauschmaske, kein neues Programm).
- **Tests:** `tests/factionWarEngine.test.ts` (25):
  - Registry erweiterbar; Schutz und Eroberbarkeit
  - Produktion, Kosten und Verlust einer Rohstoff-Insel
  - Mangel-Ziele Holz/Stahl, Großoffensive auf eine Mega-Insel, nie geschützte Inseln oder Partner, Ordnungsmacht
  - Handelspakt, Waffenstillstand mit Reparationen, Koalition über Anteil und über Mega-Inseln samt Auflösung
  - Schlacht deterministisch; Transporter-Verlust und Aushungern
  - Fall nach 12 Minuten mit Beute; Umkleiden über den WorldStreamer; Kriegspreise und Embargo
  - Spielstand 20, Rundlauf, manipulierte Stände, Langlauf ohne Entgleisen
  - `cameraNearFade`

  **814 Tests**, `tsc` und `npm run build` grün.
- **Kalibrierung:** 3 Spielstunden Simulation ergeben 7 Kriege, 15 Großschlachten, 4 Eroberungen, 6 Handelspakte und 5 Waffenstillstände; Rechenzeit 74 ms.
- **Im Browser geprüft** (Playwright, Ultra; Desktop 1440 × 900 und Handyformat 390 × 844):
  - **Großschlacht** vor Nebelhafen: Frankreich (8 Schiffe) gegen England (7), 15 echte Schiffe, Bildzeit 8,05 ms. Nach 208 s dreht England ab.
  - **Belagerung von Nebelhafen:** Wachring vor der Küste, nach 1,1 s landen 21 Angreifer gegen 11 Verteidiger, die Verluste gehen zurück an die Engine.
  - **Fall der Insel:** Besitzer Frankreich, zwei Banner-Zwillinge, Inselname „Frankreich“, ein Umkleiden, französische Wachen, Markt-Unruhe 0,99.
  - **Kontor in Königshafen:** Embargo auf Gewürze, Wein, Seide und Fechtklingen durch Niederlande und Frankreich.
  - **Weltkarte:** 6 Armadas, 1 Belagerung, 1 Schlacht.
  - **Nahblende:** bei 0,2 m ganz ausgeblendet, bei 0,76 m sichtbar.
  - **Meldungstexte** mit richtigen Artikeln („erklärt der Marine den Krieg“, „eine niederländische Armada“); keine Konsolenfehler.
  - **Startzeit im Build:** 8,40 – 8,74 s und 168 – 169 Shader-Programme. Das Ökosystem entsteht erst beim Laden eines Spielstands und kostet keine Startzeit.
- **Abweichungen und offene Punkte:**
  1. Neben Ankerglück, Weißwacht und den sechs Raid-Festungen ist die **ganze Bernsteinsee (Ring 1)** geschützt; sie bleibt das neutrale Zentrum.
  2. Eroberte Inseln behalten die **Architektur ihres Gründers** (englisches Fachwerk bleibt englisch); es wechseln Flaggen, Banner, Laternen, Wachen, Name, Hafenherr und Markt.
  3. Der **Landkampf einer Belagerung** ist zum Zusehen: Die Spielfigur kann (noch) nicht mitkämpfen, eingreifen kann man auf See (Transporter versenken, Schlacht). Die Trupps am Strand sind ein Ausschnitt des Heeres (2 – 6 Trupps je Seite); ihre Verluste zählen anteilig. Echte Truppen gibt es nur an der nächsten belagerten Insel.
  4. Bis eine Großschlacht in 3D vollständig steht, vergehen je nach Gerät **15 – 30 s** (Schiffe entstehen in Teilschritten), so lange rechnet die Engine weiter. Auf Niedrig und Mittel zeigen die Armadas weniger Schiffe (5 bzw. 3), gerechnet wird mit allen.
  5. Das Embargo gilt nicht für Waren, die die Insel selbst herstellt (sonst stünden manche Märkte leer).
  6. Die Marine bekommt einen festen Sold (`stipend`), weil sie als Ordnungsmacht kaum eigene Rohstoff-Inseln hält.
  7. Die Allianz entsteht in dieser Fassung nur als Koalition gegen einen Hegemon; dauerhafte Bündnisse ohne Hegemon gibt es nicht.
  8. Kein Test auf einem echten Handy (Handyformat im Desktop-Chromium).

## 4.4.4 – Phase 4.4 abgeschlossen: Kamera-Engine – nie mehr durch Fels und Wände, See-Kamera nach Schiffsklasse, Sichtfeld in Fahrt und Windstraßen, gerichtete Treffer-Stöße, weiche Übergänge (25.11.2026, nur lokal)

**Phase 4.4 ist damit vollständig:** 4.4.0 (4.4A: PBR-Schmiede, Hangfels, Massentruppen, Kantenlicht, freistehende Mega-Brücken), 4.4.1 (klare Sicht, echter Nebel, Wolkenhimmel, Wellensätze), 4.4.2 (4.4B: Start in gut 8 s, Anime-Fighter-Look, Waffen mit Härtungslinie, wehende Mäntel, Sturm-Gischt), 4.4.3 (4.4C: Meer mit Tiefe, vier Tagesphasen, Regionsstimmung, selektiver Bloom) und jetzt 4.4.4 (Kamera-Engine).

**Was du siehst**
- **Die Kamera geht nie mehr durch Fels, Hänge, Häuser, Brücken, Stege oder Schiffsrümpfe.** Kommt ein Hindernis zwischen Figur und Kamera, rückt sie im selben Bild heran; ist der Weg wieder frei, gleitet sie weich zurück. Steht die Figur mit dem Rücken an einer Wand oder vor einem steilen Hang, **hebt sich die Kamera über die Figur** und blickt von schräg oben, statt bis an den Kopf heranzurücken. Über Boden und Wasser bleibt immer ein Mindestabstand. Unter einer Brücke bleibt die Kamera unter dem Deck, auf einer Brücke fällt sie nie hindurch – auch auf den Mega-Brücken von Kurogane-Schlund und an der Kronenklippe.
- **See-Kamera nach Schiffsklasse:** Mit der Schaluppe ist die Kamera nah am Geschehen, mit Linienschiff und Leviathan rückt sie weit zurück und höher. **Beim Zielen mit Breitseiten** steigt sie etwas höher und blickt steiler (bei hohem Seegang mehr), damit Zielfächer und Gegner über den Wellenkämmen sichtbar bleiben. Die **Dünung** hebt und senkt die Kamera nur sanft und begrenzt (höchstens ±0,9 m, 1,4 m/s) – man spürt die Wellen, ohne dass einem schlecht wird. Klippen hinter dem Schiff weicht sie nach oben aus.
- **Sichtfeld mit der Fahrt:** Ab halber Fahrt öffnet sich das Bild um bis zu 4°, **in den Windstraßen** (Strömung bis +35 %) um bis zu 7°, beim **Rammstoß** um 8° – immer weich, nie ruckartig.
- **Gerichtete Treffer-Stöße:** Die eigene **Breitseite** stößt die Kamera von der feuernden Seite weg, **Kanonentreffer** kommen aus der Flugrichtung der Kugel (Bosse und schwere Breitseiten stärker), ein **Rammstoß** ruckt in Fahrtrichtung, schwere und kritische Treffer zu Fuß und Boss-Treffer stoßen aus ihrer Richtung. Neuer Regler **„Kamera-Erschütterung“ (0 – 100 %)** unter Einstellungen → HUD & Spiel; **0 % schaltet alle Stöße ab**.
- **Fokus bei Parade und Finisher:** Eine **perfekte Parade** zieht die Kamera kurz heran und das Sichtfeld zusammen, der **finale Treffer gegen einen Boss oder Raid-Endboss** noch stärker – danach gleitet alles weich zurück.
- **Weiche Übergänge:** Beim Wechsel zwischen Steuer und Deck, beim Landgang, an Leiter und Gangway, beim Entern, in der Werft und nach der **Schnellreise** gleiten Position, Blickrichtung und Sichtfeld in 0,7 – 1,1 s ineinander. Die Kamera schwingt dabei auf einer Bahn um die Figur – nie mitten durch sie hindurch. Nach der Schnellreise steht sie am neuen Hafen gleich im gewohnten Abstand zum Schiff.
- **Werft:** Beim Umschalten der Ansichten (Ganzes Schiff, Bug, Segel, Geschütze) und in der Ausbau-Vorschau schneidet die Kamera nie durch Stege, Nachbarschiffe oder Rumpfteile.

**Technik (für Entwickler)**
- **`graphics/cameraRig.ts`** (rein, ohne Szene, nichts Neues je Bild): `DampedValue` (exakte kritisch gedämpfte Feder), `smoothK`; **`SpringArm`** gegen eine `CameraWorld` (`floorAt(x, z, yRef)` = Wasser, Gelände und begehbare Flächen unter `yRef`; `solid(x, y, z)`): Sichtlinie in `samples` Punkten abtasten (Material, in dem der Anker selbst steht, zählt erst ab dem ersten freien Punkt), Stufe 1 heran (ab `jumpIn` im selben Bild), Stufe 2 weich zurück (`easeOut`), Untergrenze `minLength`, bei noch näherem Hindernis bis `hardMin`, **Ausweichen nach oben** (`raise`: Stufen 0 / 0,5 / 1 prüfen, die niedrigste mit genug freier Sicht weich anfahren, schnell hinauf und langsam herab; `raisedPoint`), Bodenklemme, letzter Ausweg `escape` (`in` = am Arm zur Figur hin, `up` = senkrecht aus dem Rumpf). Sätze `FOOT_ARM`, `SEA_ARM`, `YARD_ARM`, `BLEND_ARM`. Dazu `navalFrame` (Klasse über `SHIP_L_RANGE`, Gegnerabstand, Zielen, Seegang), `dynamicFovExtra`/`FOV_BOOST`, `SwellFollow`, `HitShake` (`impulse`, `shake`, `update(dt, rand, dirGain)`, `scale` = Regler), `FocusPulse`, `CameraBlend` (`start` mit Schnitt bei entartetem relativem Stand, `apply` über **`orbitBlend`** = Kugelbahn um den Fokus, NaN-Schutz: ein ungültiger Stand wird nie gemerkt).
- **`SeaWorld`:** `CameraWorld` aus `gatherCam` (Nachbar-Inseln, Stege, Bauten ab 0,9 m Radius, Schiffe; feste Listen), `camFloor`, `camSolid` (Gelände ohne Brückendecks, Brückendeck 0,9 m stark mit Brüstung, Stege, Bauten als Grundriss mit 0,15 m Rand und ab 2,2 m Höhe 0,8 m Traufrand, Höhe 4,5 m bzw. 9 m, Rümpfe unter Deck, Achterkastell). Fuß-, See- und Werft-Kamera laufen über die Arme; ein Übergang startet beim Wechsel der Kameraart oder einem Fokus-Sprung über 4 m (relativ ab 40 m), zu Fuß prüft `BLEND_ARM` auch den überblendeten Weg. Sichtfeld = `baseFov` + `fovExtra` (Feder ω 2,2) + `FocusPulse.fovDelta`; `lastFlow` aus `seaEvents.flowK`.
- **Stöße:** `SeaWorld.impact` → `hitShake.impulse`; neuer Haken `NavalHooks.kick` (Breitseite: entgegen der Feuerrichtung `(cos h, −sin h) × Seite`; Kugeltreffer: Flugrichtung, Stärke mit Schaden/Rumpf; Rammen: Fahrtrichtung des Rammers); auf See verstärkt `dirGain` (Kameraabstand / 10, 1 … 3,5) nur den gerichteten Anteil. `CombatHooks.focus` (Parade 0,75), Kill-Haken: Boss/Raid-Endboss → Puls 1 für 1,3 s. `NavalSystem.aiming` meldet einen Gegner im Breitseitenfächer. Einstellung `camShake` (0 … 1, Bereich „HUD & Spiel“), `Game.applySettings` setzt `hitShake.scale`.
- **Tests:** `tests/cameraRig.test.ts` (32: volle Armlänge bei freier Sicht, Wasser-Mindestabstand, Hang und Klippe mit Ausweichen nach oben, weiches Zurückgleiten ohne Sprung, sofortiges Heranziehen, Rücken an der Wand, unter und auf Brücken, fremder und eigener Rumpf, `raisedPoint`; Sichtfeld-Kurve für Fahrt, Windstraße und Rammstoß samt Obergrenze 8°; Klassen-Skalierung, Zielen, Dünungsgrenzen; gerichteter Stoß, Richtung je Treffer, 0 % und 50 %, ungültige Eingaben; Fokus-Puls; Übergänge ohne NaN, Kugelbahn, Schnellreise relativ, Schnitt bei entartetem Stand, Übergangs-Arm). **789 Tests**, `tsc` und `npm run build` grün.
- **Im Browser geprüft** (Playwright, Ultra; Desktop 1440 × 900 und Handyformat 390 × 844):
  - **Kurogane-Schlund**, 4 Brücken, je hin und zurück mit drei Blickwinkeln: 2 139 Stichproben, 0 × im Gelände, 0 × unter Wasser; 5 Sichtlinien gingen durch Baumkronen (Laub zählt bewusst nicht als Hindernis). **Kronenklippe:** 677 Stichproben, 0 Treffer. Steile Hänge beider Inseln: 0 × im Gelände, 0 × in festem Material. **Ankerglück** neben 10 großen Bauten, Blick rundum: 180 Stichproben, 0 × in festem Material, eine Sichtlinie kurz während einer Überblendung verdeckt. Handyformat: Stadt 108 / Brücken 1 181 Stichproben, 0 × in festem Material.
  - **Windstraße** (Grachten-Drift, +35 %): Sichtfeld 55° → 62°, höchstens 0,09° je Bild; gleiche Fahrt ohne Strömung 55,6°; Handyformat 70° → 77,7°.
  - **Seegefecht:** Breitseite → Stoß genau entgegen der Feuerrichtung, Kanonentreffer (−105 Rumpf) → Stoß in Flugrichtung, Regler 0 % (auch über das Menü) → kein Versatz; Bildzeit im Gefecht 6,2 ms (Desktop) bzw. 4,3 ms (Handyformat); keine Konsolenfehler.
  - **Werft:** 7 Ansichtswechsel und Ausbau-Vorschau: 0 × in festem Material. **Schnellreise** über 2,1 km: Abstand Kamera–Schiff stetig 47,3 → 45,8 m (höchstens 0,66 m je Bild), nie unter Wasser. **Parade** 6,5 → 5,4 m und −2,2°, **Boss-Finisher** 5,0 m und −3°.
  - **Startzeit im Build**, abwechselnd mit 4.4.3 gemessen: **8,35 – 8,46 s** (4.4.3 im selben Lauf Ø 8,64 s), **168 – 170 Shader-Programme** – die Kamera kostet keine Startzeit und kein Programm.
- **Abweichungen und offene Punkte:** (1) Die Kamera kennt die Welt vereinfacht (Gelände genau, Bauten als Grundriss-Kästen mit fester Höhe und Traufrand; Bäume, Laub und dünne Pfosten zählen nicht) – echte Strahltests gegen alle Netze wären je Bild zu teuer. Ungewöhnlich hohe oder weit ausladende Bauten können die Sicht kurz verdecken. (2) Steht die Figur direkt an einer Wand, rückt die Kamera bis 0,45 m an den Kopf heran; die Figur wird dann nicht ausgeblendet. (3) Während einer Überblendung wird der Weg weich (nicht sprunghaft) gekürzt, eine Kante kann die Sicht für Bruchteile einer Sekunde verdecken. (4) Ein großer Sprung aus einer an die Wand herangezogenen Kamera wird geschnitten statt überblendet. (5) „Max“ ist im Spiel die Stufe Ultra. (6) Kein Test auf einem echten Handy (Handyformat im Desktop-Chromium).
- **Prüf-Falle Startzeit:** Nach dem Menü übersetzt die Hintergrund-Stufe noch rund 6 s Shader. Wer zu früh neu lädt, misst diese Arbeit mit (gleicher GPU-Prozess) und bekommt 10 – 13 s statt gut 8 s – vor jeder Messung `warm: Hintergrund` in `window.__skTimeline` abwarten.

## 4.4.3 – Phase 4.4C: Meer mit Tiefe und Kleinwellen, vier Tagesphasen, Regionsstimmung, selektiver HDR-Bloom (25.11.2026, nur lokal)

**Was du siehst**
- **Das Meer hat Tiefe:** In flachen Strandlagunen ist das Wasser kristallklares **Smaragd-Türkis**, bis etwa 6 m Tiefe Türkis, über der Böschung Azur, dann Tiefblau – und weit draußen auf offener See ein sattes **Kobaltblau**. Die Tiefe kommt aus dem Küstenabstand jeder Insel, Schäre und Mega-Insel, ohne zusätzlichen Rechenschritt.
- **Kleinwellen:** Auf den großen Wellen laufen jetzt fein gekräuselte Kapillar- und Windwellen in zwei Größen gegeneinander, mit dem Wind. Himmel, Sonne und Mond spiegeln sich darin bei flachem Blick, die Sonnen- und Mondbahnen glitzern.
- **Wellenkämme im Gegenlicht** leuchten dezent smaragdgrün durch (ab Grafikstufe Hoch).
- **Brandung bei Seegang:** Bei hohen Wellen läuft die Brandung schneller, breiter und weiter hinaus, und an Küsten, Schären und Klippen schlägt **Brandungsgischt** hoch – sie verschmilzt mit Bugwelle und Sturm-Gischt.
- **Vier Tagesphasen mit weichen Übergängen:** **Morgengrauen** (blaue Stunde vor Sonnenaufgang, die Sterne verblassen), **Hochmittag**, **Goldene Stunde** (tiefe warme Sonne, lange Schatten, vor dem Abendrot) und **Mondnacht** mit **silbrigem Mondlicht**. Die Belichtung passt sich an: mittags etwas knapper, damit helle Segel und Kreideklippen nicht ausbrennen, nachts etwas offener für tiefe, lesbare Schatten.
- **Jede Region hat ihre Stimmung:** Im **Nebelarchipel** wird es graugrün und dunstig, in der **Nordwacht** kühl, im **Glutring** liegt Ascheschein in der Luft, im **Sturmgürtel** wird alles schiefergrau und gedämpft, im **Schlundriff** violett. Die Stimmungen blenden an den Grenzen weich über und mischen sich mit dem Wetter. Rund um **Kurogane-Schlund** leuchtet die Lavaglut Himmel, Wolkenunterseiten und das Licht von unten an.
- **Leuchten nur, was leuchtet:** Auf Hoch, Maximal und Ultra bekommen nur echte Lichtquellen einen edlen Schein – Hafenlaternen, Leuchtfeuer, die glühenden Lavaspalten von Kurogane-Schlund, Mündungsfeuer, Leuchtspuren, Brandkugeln, Boss-Augen und Edelsteine, Sonne und Mond. Himmel, Segel, Kreide und Schaum leuchten nie nach.
- **Niedrig und Mittel laufen ohne Nachbearbeitung** (flüssige 60 Bilder je Sekunde auf Handys); dafür glättet der Bildpuffer die Kanten.

**Technik (für Entwickler)**
- **Wasserfarbe** (`data/oceanLook.ts`, rein): `OCEAN_DEPTH` (Übergänge in Metern Tiefe bzw. Küstenabstand), `seaDepthAt` (gleiche Formel wie der Shader), `seaWeights`/`seaColorAt` (CPU-Zwilling), `SEA_COLOR_GLSL` (aus denselben Zahlen erzeugt). Neue Uniforms `uLagoon` (Smaragd) und `uAbyss` (Kobalt), je Bild aus den Tagesfarben getönt (`Environment.tintKeepLum`: Farbton ändern, Helligkeit behalten).
- **Kleinwellen:** Schmiede-Satz `wasser` (12 kachelbare Wellenzüge mit spitzen Kämmen plus Kabbelrauschen, Normalkarte über UV; `forgeKindSize`: ab Mittel 1024 px). Im Meeres-Shader zwei Lagen (9 m und 21 m je Kachel, die zweite gedreht), mit dem Wind verschoben; die gerechneten Windwellen von 18 auf 8 gesenkt (Mittel 6). Stufen über `uWaterK` (0 / 0,5 / 1) und `uSss` (Kamm-Streuung ab Hoch) in `Ocean.setDetail`. Die ORM-Karte eines Schmiede-Satzes entsteht erst beim ersten Zugriff (das Wasser braucht nur die Normalkarte). Programmschlüssel `sk-ocean31`.
- **Brandung:** Breite, Tempo und Spülsaum wachsen mit `uWaveScale`; `Ocean.shoreDist(x, z)` liest dasselbe Küstenabstandsfeld auf der CPU, `SeaWorld` setzt damit Brandungsgischt (`SeaSpray`) auf die Brandungslinie.
- **Tagesphasen** (`world/timeOfDay.ts`): `DayPhase`, `phaseWeights` (stetige Kosinus-Übergänge zwischen den Phasenmitten), `dayPhase`; neue Schlüssel `Morgengrauen` (5,5 h) und `Goldene Stunde` (17,3 h) in `TIME_KEYS`, Nacht als `Mondnacht` mit silbrigem Licht. Belichtung `RENDER_LOOK.phaseExposure` → `Environment.exposureK` → `GameRenderer.setExposure` (wirkt mit und ohne Nachbearbeitung).
- **Regions-Atmosphäre** (`world/regionAtmosphere.ts`, rein): `REGION_ATMO` je Sektor (Himmel, Nebel, Licht, Dunst, Schein, Meer), `ATMO_SPOTS` (Kurogane-Schlund), `atmosphereAt` schreibt in ein vorhandenes Objekt (weiche Sektorgrenzen ±9°, Einblendung hinter der Bernsteinsee). `Environment` übernimmt die Werte in vorhandene Uniforms; Himmel und Wolken haben `uAshGlow`.
- **Bloom** (`RENDER_LOOK.bloom`): Schwelle 1,12, Weichheit 0,22, Stärke 0,95, Radius 0,85, nur ab Hoch (Mipmap-Weichzeichner im Unreal-Stil von `postprocessing`, HalfFloat-Puffer). Der Himmel ist auf Helligkeit 0,9 begrenzt (`uSkyCap`), Sonnen- und Mondscheibe sind ausgenommen und verschwinden hinter Wolken und Nebel. Lava von 0,71 auf ~1,25 angehoben. **Gemessen im HDR-Puffer:** Kronenklippe mittags höchstens 1,0 (0,01 % des Bildes reinweiß), Segel unter 1, Laternenflammen 2,6, Mündungsfeuer 2,2, Leuchtspuren 2,3, Brandkugeln 2,0, Boss-Edelsteine ~1,5.
- **Niedrig/Mittel:** `post.enabled = false` (kein Composer, ACES rechnet jedes Material), Kantenglättung im Bildpuffer (`GameRenderer(canvas, antialias)`, beim Start entschieden: gespeicherte Stufe Niedrig/Mittel oder Touch-Gerät bei automatischer Wahl).
- **Freigabe geprüft:** Composer-Neubau und Fenstergröße lassen 0 Texturen liegen; acht volle Wechsel Ultra → Niedrig → Ultra: 0 zusätzliche Texturen.
- **Tests:** `tests/oceanAndLighting.test.ts` (16: Tiefe monoton und Lagunen unter 6 m, Farbgewichte und stetiger Verlauf, Shader nutzt dieselben Zahlen, Wasser-Satz, Stufen ohne/mit Nachbearbeitung und Bloom-Werte, Freigabe von Geometrie und Material beim Stufenwechsel, Uniform-Änderungen ohne neues Programm, Tagesschlüssel, Phasen-Anteile, stetige Farbstimmung, Belichtung, Regionen, Sektorgrenzen, Kurogane-Schein, keine Zuweisungen). **757 Tests**, `tsc` und `npm run build` grün.
- **Im Browser geprüft** (Playwright, 1280 × 720): Start bis zum Menü im Build **8,6 – 8,8 s** (4.4.2: 8,2 s; die neue 1024-px-Wasserkarte), **168 – 169 Shader-Programme** wie in 4.4.2, ein neues Feindschiff übersetzt 0 Programme, keine Konsolenfehler. Bildzeit je Bild (Mittel über 40 Bilder): Ultra Hafen 14,1 / offene See 5,0 / Sturm 6,6 ms; Hoch 9,2 / 4,3 / 4,5; Mittel 5,3 / 4,7 / 3,8; Niedrig 6,7 / 3,7 / 3,3 ms. Bilder: Morgengrauen, Mittag, Goldene Stunde, Abendrot, Mondnacht, Lagune, Kronenklippe, Kurogane bei Nacht, Nebelarchipel, Sturmgürtel, Brandung im Sturm, Mittel ohne Nachbearbeitung.
- **Abweichungen und offene Punkte:** (1) Bloom über `postprocessing` (pmndrs, gleichwertig zu `UnrealBloomPass`, wie CLAUDE.md es vorgibt) statt three.js-`UnrealBloomPass`. (2) Niedrig und Mittel verlieren Farbkorrektur und Vignette (sie gehören zur Nachbearbeitung). Die Kantenglättung im Bildpuffer wird beim Start festgelegt: wer am PC zur Laufzeit auf Mittel wechselt, hat bis zum Neustart keine Kantenglättung. (3) Sonne und Mond leuchten weiter nach (es sind Lichtquellen), der übrige Himmel nicht; Auftragsmarkierungen liegen knapp unter der Schwelle. (4) Mond und Sonne spiegeln sich nicht gleichzeitig (die Spiegelung folgt dem jeweils sichtbaren Gestirn). (5) Die Wasser-Kleinwellen fehlen auf Niedrig. (6) Kein Test auf einem echten Handy; die Bildzeiten stammen von einem Desktop-PC.

## 4.4.2 – Phase 4.4B: Start in 8 Sekunden, Anime-Fighter-Look der Figuren, Waffen mit Härtungslinie, wehende Mäntel, Gischt im Sturm (25.11.2026, nur lokal)

**Was du siehst**
- **Das Spiel startet doppelt so schnell:** bis zum Hauptmenü **8,2 s statt 16,1 s** (gemessen im fertigen Spiel, Ultra, warmer Shader-Speicher). Gegner, Rüstungssets, alle Schiffsklassen und Kampfeffekte werden jetzt im Hintergrund vorbereitet, während das Menü schon bedienbar ist (rund 6 s). Wer sehr schnell ein Spiel startet, sieht kurz „Gegner und Effekte werden vorbereitet …“. Danach ruckelt beim ersten Gegner, Treffer oder Schiff weiterhin nichts.
- **Figuren im Anime-Fighter-Look:** klar gezeichnete **dreistufige Cel-Schattierung** (Schatten, Halbton, Licht) statt des weichen Verlaufs; Haut etwas weicher, Stoff und Metall kantiger. Die **Augen** bekommen Tiefe: Das Oberlid wirft einen Schatten auf die Iris, unten leuchtet sie in ihrer eigenen Farbe auf, dazu die Glanzpunkte. Das **Glanzband im Haar** (Engelsring) ist heller und schärfer. An der Silhouette auf der Seite des Hauptlichts liegt eine **scharfe Lichtkante**.
- **Bosse heben sich ab:** Raid-Endbosse und Legenden tragen fast doppelt so starkes Kantenlicht, Hauptmänner und Elite-Gegner anderthalbfach.
- **Mäntel wehen:** Die Schöße langer Mäntel, des Kapitänsmantels und des Kilts schwingen mit Lauftempo und Fahrtwind nach hinten, darüber laufen zwei Wellen. Dazu ein Fehler behoben: **Umhänge hörten nach dem ersten Treffer auf zu wehen** (Gegner sofort, weil sie ihre Treffer-Materialien gleich beim Erscheinen bekommen).
- **Waffen neu modelliert (Blender):** Alle Klingen haben eine **Härtungslinie** – die Schneide endet in einer welligen Linie, frostig-hell neben der dunkel polierten Klingenfläche: Katana (kräftiger Hamon und Goldgrat an der Spitze), Säbel, Zweihänder, Kurzklingen und die Boss-Waffen (Kurogane-Katana und -Wakizashi, Eisenstein-Zweihänder, Blackwood-Säbel, De-Valois-Rapier, Hellebarde von Van Der Berg). **Musketiere tragen eine echte Steinschloss-Muskete** (konischer Lauf mit Pulverkammer, Messing-Mündungsring und Laufbänder, Hahn mit Feuerstein, Batterie, Zündpfanne, Abzugsbügel, Ladestock, geschwungener Nussbaumschaft) statt der Kastenform. Die **Pistole des Lord-Admirals** hat jetzt einen S-förmigen Hahn mit Feuerstein, Batterie, Pfanne und einen konischen Lauf.
- **Gischt im Sturm:** Bei starkem Wind und hohem Seegang reißt der Wind Gischt von den Wellenkämmen und trägt sie als weiche, in Flugrichtung gestreckte Schleier davon (in 4.4.1 mit runden Partikeln verworfen, jetzt mit eigenen weichen Schleiern).

**Technik (für Entwickler)**
- **Startzeit – Ursachen und Lösung:** (1) **Lichtzahl schwankte beim Start:** die vier Kaskaden-Lichter entstanden erst im ersten Bild (nach dem Vorübersetzen), und die drei Punktlichter des Heldenschiffs verschwanden beim gestaffelten Zeichnen mit dem Schiff. Jedes Programm hängt in three.js von der Lichtzahl ab, darum wurde fast jedes Material **dreimal** übersetzt. Jetzt: `Environment.prepareCsm` (aus `SeaWorld.applyQuality`), Schiffe tragen nur noch `LightAnchor` (`render/shipLights.ts`), die echten Lichter stehen fest in der Szene (`ShipLightRig`, folgt dem eigenen Schiff, nie unsichtbar); `warmupShaders` legt mit einem leeren Bild die Kaskaden an und blendet beim gestaffelten Zeichnen keine Gruppen mit Lichtern aus. (2) **Figuren-Varianten:** Oberfläche (`uSkSurf`), Hohlraum/Relief, Schmiede (`uSkForgeOn` + leere 1 × 1-Textur), Spiegelung (`uSkEnvK`), Kantenmaske (`uSkMaskK`) und Treffer-Effekt (geteilte Nullwerte `NO_FX`) sind bei Figuren Uniforms; der Programmschlüssel ist `sk-toon-10c` (+ `t` Borten, `g` Ringel, eigene Karten). Welt-Materialien behalten die Oberfläche als Konstante (`const int skSurf`), der Übersetzer faltet die Zweige weg. (3) **Zwei Vorwärm-Stufen:** `warmupShaders` (Titelbild, hinter dem Ladebildschirm) und `warmupExtras` (Figuren, Sets, Schiffsklassen, Effekte auf der verborgenen Ebene 31 unter dem Meer, `compile` erfasst auch Unsichtbares), gestartet nach `menus.showMain`; `Game.newGame`/`continueGame` warten über `awaitWarm`. **Programme 393 → 169**, Spielstart nach der Hintergrundstufe 120 ms, ein neues Feindschiff übersetzt 0 Programme.
- **Messen:** `preload.mark`/`window.__skTimeline` (Ladephasen mit Programmzahl). Wichtig: im Entwicklungsserver ist `checkShaderErrors` an, dort wartet `getProgramInfoLog` jedes Programm einzeln ab (rund 4 s mehr) – Startzeiten immer im Build messen. Ein großes Figuren-Programm kostet kalt rund 1,2 s Übersetzungszeit; der Shader-Speicher von Chrome hält solche Programme nicht zuverlässig über einen Neustart, darum zählt die Zahl der Programme, die vor dem Menü übersetzt werden.
- **Figuren-Look** (`render/toon.ts`): `CEL` (Anteil der Stufen je Oberfläche, Uniform `uSkCel`), Augen (`skLid`, `skLow`), Haarband, Lichtkante (`skHard`), Heldenstärke je Figur `ToonFxUniforms.hero` → `uSkHeroK` (`Character.setHeroRim`, `Enemy` für Bosse/Hauptmänner/Elite). `extendToon(mat, key, fn)`: Zusatz-Shader, den Effekt-Kopien (`toonFx`) und `cloneToon` übernehmen.
- **Mantelwind** (`character.ts`): Attribut `tailK` (0 an der Hüfte, 1 ab dem Knie, aus den Bindungslagen der Knochen) nur für Teile der Arten `mantelLang`/`kilt`, eigenes Material über `flutter()` mit `TAIL_GLSL` (der Umhang nutzt dieselbe Hilfe mit `CAPE_GLSL`), gesteuert vom Umhang-Schwung (`updateCape`); keine Tusche-Hülle an wehenden Schößen.
- **Waffen:** `tools/blender/build_waffen2.py` und `build_bosse.py`: `blade(…, hamon, hseed)` liefert [Fläche, Schneide] (Rolle `edge`), `muskete()` → `public/models/gear/w_muskete.glb` (Rollen `wood`, `gold`, `dark`, `steel`, in `GLB_MODELS`); `weapons.ts` Rollen `edge` (frostig-hell, matt) und `wood` (Nussbaum, Schmiede-Satz `hafenholz`); Boss-Sets `edge: ['seide', '#E9EEF2']` in `bossHeld`.
- **Gischt** (`world/seaSpray.ts`): `SeaSpray`, 240 feste Instanzen, ein Zeichenaufruf, Ausrichtung und Streckung im Shader (`MeshBasicMaterial` + `onBeforeCompile`, Nebel der Welt), Auslösung nur auf echten Kämmen (`heightAt` ≥ 45 % des Seegangs) in `SeaWorld.render`.
- **Tests:** `tests/heroCharacterVisuals.test.ts` (10: ein Programmschlüssel für alle Figuren-Oberflächen samt durchscheinender Teile und Effekt-Kopien, Uniforms statt Varianten, Welt-Konstanten, Cel/Augen/Haar/Lichtkante im Shader, Heldenstärke je Figur, Zusätze überleben die Effekt-Kopie, VRoid-Gelenke und Truppen-Waffenhand, Boss-Statur, Schneiden-Rolle in allen Klingen-Modellen, Musketen- und Pistolen-Rollen, feste Schiffslichter). **741 Tests**, `tsc` und `npm run build` grün.
- **Im Browser geprüft** (Playwright, Ultra, 1280 × 720): Startzeit im Build dreimal 8,2 s (vorher 16,1 s), keine Konsolenfehler; Nahaufnahmen der Figur alt gegen neu mit festem Aussehen, Frontlicht, Mantel im Stand und im Lauf, Katana/Zweihänder/Muskete, Sturm mit Linienschiff (Median 7,4 ms je Bild).
- **Abweichungen und offene Punkte:** (1) **Körper und Gesichter** von Spielfigur, Offizieren und Bossen sind weiter die VRoid-Modelle mit Skelett: neu ist das Shading (Cel-Stufen, Augen, Haar, Kantenlicht), nicht die Geometrie. Neue Köpfe, Frisuren und Körper mit Muskulatur wären eigene Modelle samt Gewichten und Gesichtsausdrücken – das würde die Gelenk-Hierarchie und alle Animationen berühren. (2) Kopfbedeckungen (Dreispitz, Admiralsmütze, Kabuto) sind die vorhandenen Blender-Modelle. (3) Die Muskete ist für Gegner (Musketiere), die Spielfigur hat keinen Feuerwaffen-Stil. (4) Der erste Start nach einem Update übersetzt alle Shader kalt; mit weniger Programmen geht das schneller, gemessen wurde es nicht getrennt. (5) Kein Test auf einem echten Handy.

## 4.4.1 – Klare Sicht, echter Nebel, lebendigeres Meer und Wolkenhimmel; Fehler an Deck und beim Raid-Start behoben (24.11.2026)

**Was du siehst**
- **Klare Sicht bei klarem Wetter.** Früher lag selbst bei Sonnenschein schon nach 420 – 960 m dichter Dunst über allem – mit großen Schiffen (Kamera weit hinten und hoch) wirkte das Meer fast ständig neblig. Jetzt reicht die Sicht je nach Grafikstufe **1,5 km (Niedrig) bis 4,3 km (Ultra)**: die Nähe bleibt klar, ferne Inseln und Schiffe tauchen in eine sanfte, blaue Luftperspektive und lösen sich erst am Horizont auf. Der Abstand der Kamera zum Schiff zählt nicht mehr als Nebelstrecke.
- **Echter Nebel, wenn Nebel ist.** Bei Nebel, Sturm und Regen schließt sich die Sicht dicht ab dem Schiff, ohne „klare Zone und dann Wand“. **Ferne Inseln verschwinden jetzt wirklich im Nebel** – früher standen ihre Silhouetten scharf hinter der Nebelwand. Auch der Himmel graut im Nebel ein, die Wolken verblassen, Leuchtfeuer am Horizont werden schwächer.
- **Wolkenhimmel.** Über den gemalten Wolken zieht jetzt eine **beleuchtete Wolkendecke** mit dem Wind über den ganzen Himmel: sonnenzugewandte Seiten hell, Eigenschatten auf der Rückseite, **Silberränder im Gegenlicht**, abends golden, im Sturm dunkel und geschlossen, bei klarem Himmel feine **Zirren** hoch oben. Sterne und Mond verschwinden hinter Wolken.
- **Meer:** Die lange Dünung läuft in **Wellensätzen** – mehrere hohe Wellen hintereinander, dann ruhigeres Wasser –, Schiffe heben und senken sich mit. **Die ferne See behält ihre Wellenstruktur bis zum Horizont** (vorher wurde sie zum glatten Spiegel); Himmelsspiegelung und Sonnenbahn brechen sich darin in Bänder und Glitzerflecken.
- **Kein Absturz mehr in die Kapitänskajüte:** Wer oben auf dem Achterdeck am Steuerrad lief, fiel manchmal durch den Boden in die Kajüte – auf dem eigenen Schiff und vor allem beim Entern auf dem Feindschiff, bei allen Schiffsklassen. Ursache: alle Läufer an Bord (Crew, Gegner, Truppen, Spielfigur) teilten sich einen Zustand „oben / unten“; lief irgendwer durch die Kajütentür, galt das für alle. Jetzt entscheidet jede Figur nach ihrer eigenen Höhe.
- **Raid-Start:** Die Wachschiffe der Belagerungen stehen beim Start **mit dem Bug zu dir** (Richtung Anfahrt) statt zur Insel und müssen nicht erst wenden.

**Technik (für Entwickler)**
- **Nebel:** `QualityConfig.hazeRange` (Dunstweite bei klarem Wetter, Niedrig 1 500 … Ultra 4 300 m) ersetzt `fogStart`; `viewDistance` bleibt Bezug für dichtes Wetter und Bewuchs. `Environment.render`: Form `shape` aus der Sichtweite des Wetters, Weite `dense + (hazeRange − dense) · (1 − shape)^1,5 + Kameraabstand · 0,9` (unter der Fernebene). **`Fog.near` trägt die Form 0 … 1** (render/atmosphere.ts: Luftperspektive `t·0,62 + t⁴·3,8` ↔ Nebel `t·2,5 + t⁴·1,2`), damit alle Materialien mit Nebel denselben Verlauf haben. Bodennebel-Grundwert gesenkt. Inseln werden bis zur aktuellen Nebelweite gezeichnet (`SeaWorld`, statt fester Sichtweite).
- **Silhouetten** (`islandHorizon.ts`): Material mit dem Nebel der Welt (`fog: true`, `fogUniforms`), gedämpfte Landfarbe; Leuchtfeuer nach Nebelweite (`update(…, fogFar)`).
- **Himmel** (`sky.ts`): Wolkendecke im Himmelsshader (`skFbm`, Oktaven `uCloudQ` nach Stufe 3/4/5, Versatz `uCloudOff` aus Kamera und Wind, Licht über eine zweite Probe zur Sonne), Zirren, `uFogK` (Nebel graut den Himmel ein); Bedeckung, Farben und Dunkelheit teilt sie mit den gemalten Wolken. Die gemalten Wolken strecken ihr Feld mit `uRange` (Hälfte der Dunstweite, 1,1 – 2,2 km) und verblassen im Nebel (`uOpacity`).
- **Meer** (`ocean.ts`): Wellengruppen für die drei langen Wellen (`WaveConst.gk/gw/gp/ga`, Hülle mit halber Phasengeschwindigkeit) **gleich in GLSL und `gerstnerCPU`** (Schiffe und Bojen schwimmen weiter exakt auf dem Wasser); Fern-Normalen aus zwei Rauschfeldern ab 90 m; Programmschlüssel `sk-ocean30`.
- **Deck-Zonen** (`islandGround.ts`, `DeckGround`): `zoneOf(lx, lz, y)` bestimmt die Zone je Aufruf aus der Höhe des Läufers (über halber Kastellhöhe = Achterdeck, sonst Kajüte); nur Läufer ohne Höhe (Deck-Crew) führen den alten Zustand. Kamera und Kajütendach folgen `notePlayer` (aus `SeaWorld` je Bild), `inCabin` = Zone der Spielfigur. `CombatSystem.ground/constrain` und `EnemyWorld.ground` reichen die Höhe durch.
- **Raid** (`raidLayout.ts`): Wachschiffe schauen zum Sammelplatz (`heading = atan2(stx0 − wx, stz0 − wz)`).
- **Tests:** `tests/deckZones.test.ts` (3: Läufer unten und in der Tür lassen die Figur oben nicht fallen, Kajüte/Achterdeck nach Höhe, Türlücke oben ist Wand, Kamera/Dach nur von der Spielfigur), `tests/raid.test.ts` (+1: Wachen schauen zur Anfahrt). **731 Tests**, `tsc` und Build grün.
- **Im Browser geprüft** (Playwright, Ultra und Niedrig, 1280 × 720): klar, bewölkt/Abendrot, Nebel, Sturm, Schaluppe und Linienschiff; keine Konsolenfehler. Bildzeit offene See Ultra Median 8,4 ms (Wolkendecke kostet unter 0,5 ms), Hafen Ankerglück ohne messbaren Unterschied zur alten Sichtweite (11 statt 9 gezeichnete Inseln).
- **Verworfen:** vom Wind abgerissene Gischtfahnen auf den Kämmen im Sturm – mit dem vorhandenen Teilchensystem sahen sie aus wie weiße Kugelhaufen; dafür bräuchte es eigene, weiche Gischt-Sprites.

## 4.4.0 – Phase 4.4A: PBR-Material- und Texturschmiede, Hangfels auf allen Inseln, neue Massentruppen, heroisches Kantenlicht, freistehende Mega-Brücken, gespeicherte Ruhezeiten (24.11.2026)

**Was du siehst**
- **Echte Oberflächen statt glatter Flächen.** Eine neue PBR-Schmiede rechnet beim Start 19 Oberflächen in bis zu 1024 × 1024 Pixeln (Ultra und Max): Schiffsplanken in drei Güten, gehämmerter Kanonenstahl, gebürstetes Messing, polierter Klingenstahl, Segeltuch-Gewebe, Kalkstein, Basalt, Obsidian, Ufersand, Waldboden und Asche, Mauerquader, gebrannter Ton, Fachwerkbalken, Hafenholz, Köperstoff, Narbenleder und Griffwicklung. Jede hat Relief, Rauheit und Verdeckung (Fugen, Senken) und reagiert so auf Sonne, Fackeln und Nässe.
- **Schiffe:** Die Rumpfplanken wechseln mit der Rumpf-Stufe: **verwittert mit Trockenrissen und tiefen Kalfaterungsfugen** auf Stufe 1–2, geölt auf Stufe 3, **seidenmattes Mahagoni/Ebenholz** auf Stufe 4–5 (die Rumpffarbe bleibt). Kanonen und Eisenbeschläge sind gehämmert, Goldzier und Bronzerohre gebürstet. **Segel** zeigen ihr Gewebe und **leuchten warm durch, wenn die Sonne dahinter steht**.
- **Inseln:** Auf allen Inseln und Mega-Inseln werden **steile Hänge zu Fels** – Kalkstein auf hellen Inseln, Basalt auf Klippen-, Nord- und Sturminseln, Obsidian auf den Vulkaninseln –, sauber ins Gras oder den Sand übergeblendet, ohne verzerrte Texturen (dreiseitige Projektion). Flaches Gras bekommt Bodenrelief, Sand feine Rippeln; der nasse, glänzende Saum an der Wasserlinie bleibt.
- **Bauten:** Mauerquader mit Steinmetzspuren und Abplatzungen, Dachziegel mit Brandflecken und Haarrissen, Fachwerk- und Hafenholz mit Maserung, Eisen gehämmert.
- **Massentruppen (Enterkommandos, Garnisonen, Belagerungsverbände) neu modelliert:** verjüngte Arme und Beine in zwei Abschnitten, geformter Oberkörper mit schmaler Taille, **Gesichter** mit Kinn, Wangenknochen, Brauenbogen, Nasenrücken, Augen mit Glanzpunkt, Ohren und Haar, **Stehkragen, Knopfleiste, Gürtel mit Messingschnalle, Ärmelaufschläge, Stiefel mit Stulpen, Epauletten bzw. Stahl-Schulterplatten**, **Rockschöße, die im Wind schwingen**. Kopfbedeckung je Macht und Truppe: **Dreispitz** mit Goldborte, **Admirals-Zweispitz** mit Kokarde (England, Marine, Frankreich), **Kurogane-Kabuto mit Hörnerkrone** und Nackenschutz, **Morion** mit Kamm, Feldmütze. Säbel mit Korb, Muskete mit Ringen und Bajonett, Streitkolben mit Dornen, gewölbter Rundschild.
- **Heroisches Kantenlicht** an allen Figuren (Spielfigur, Offiziere, Crew, Gegner, Bosse, Truppen): warm von hinten rechts, kühl von hinten links; tags zurückhaltend, **nachts und im Sturm kräftig**, damit Silhouetten vor Nacht, Lava und Hafenfeuer nicht versinken. Kleidung und Leder der Figuren tragen Köper- und Narbenrelief, Rüstungsmetall gebürsteten oder gehämmerten Stahl, Klingen sind polierter, Griffe gewickelt.
- **Freistehende Brücken auf den Mega-Inseln:** Unter den Brücken steht kein Erddamm mehr – Lava, Grachtenwasser, Klüfte und Meeresarme laufen unter allen 21 Brücken hindurch. Jede Brücke liegt an beiden Enden auf dem Ufer und neigt sich, wenn die Ufer verschieden hoch sind. Begehbar bleibt sie wie vorher (Geländer sperren). Lava- und Kreidekluft-Ränder sind jetzt nackter Fels (Basalt, Kalk) statt bemoostem Mauerwerk.
- **Geräumte Bezirke und besiegte Insel-Kommandanten bleiben es auch nach dem Laden:** die Ruhezeiten (15 bzw. 25 Minuten) werden gespeichert.

**Technik (für Entwickler)**
- **Schmiede:** `src/graphics/forgeMaps.ts` (rein, ohne three.js und DOM): `FORGE_KINDS`, `FORGE_RECIPES` (Rauheit, Metall, Relief, Kachelgröße in Metern, Relieftiefe, Albedo ja/nein, Normalkarte über UV ja/nein), kachelbares Wert- und Zellrauschen, `forgeMaps(kind, size)` → Albedo (sRGB, nur Rumpf), Normalkarte (zentrale Differenzen, auflösungsunabhängige Stärke) und ORMH (R Verdeckung aus der Senke gegen das weichgezeichnete Umfeld, G Rauheit, B Metall, A Höhe), `forgeSizeForTier` (Ultra/Max 1024, Hoch/Mittel 512, Niedrig 256), `hullForgeKind`, `rockForgeKind`. `src/graphics/forgeWorker.ts`: rechnet beim Start auf bis zu vier Web Workern, parallel zum Laden der Modelle (`forgeStart` in `main.ts`; Größe aus der gespeicherten Stufe geschätzt), Puffer ohne Kopie zurück. `src/graphics/pbrMaterialForge.ts`: geteilter Cache (`forgeSet`, `forgePrewarm` in `Game` vor dem Bau der Welt rechnet nur nach, was fehlt), DataTextures mit Mipmaps, Wiederholung und anisotroper Filterung, `markShared` und **Freigabe-Schutz** (fremde `dispose()`-Aufrufe zählen nur `forgeStats.blockedDisposes`; `forgeDisposeAll` gibt jede Textur genau einmal frei), Arbeitsspeicher der Bytes wird nach dem Hochladen freigegeben. Normalkarten entstehen nur für Sätze über UV (Rumpf, Segel); die übrigen bekommen ihr Relief im Shader aus dem Höhenkanal.
- **Toon-Material** (`render/toon.ts`, kein Wechsel zu `MeshStandardMaterial`: die Art Direction aus CLAUDE.md bleibt, die PBR-Kanäle fließen in das vorhandene GGX-Licht): neue Optionen `forge` (ORMH dreiseitig im Objektraum: Relief per Bildschirm-Ableitung, Rauheitsfaktor `skRoughK` für Licht und Spiegelung, Verdeckung), `forgeScale`, `slopeRock`/`slopeColor` (Hangfels im Inselraum über die Eckpunkt-Normale, ab ca. 24°, voll ab ca. 40°). Figuren-Stoff und -Leder bekommen `stoff`/`leder` automatisch, Welt-Metalle ohne eigene Reliefkarte `stahl`. Neues Kantenlicht im Figuren-Teil (`toonShared.heroRim`/`heroFill`, gesetzt von `Environment` nach Tageszeit und Wetter). Programmschlüssel tragen nur das Merkmal (`-F`, `-S`), nicht die Art: alle Arten teilen sich ein Programm. Segel-Gegenlicht in `render/flags.ts`.
- **Anbindung:** `islandStyle.ts` (Sand, Wiese, Wiesendecke, Fels je Stil), `shipBuilder.ts` (Rumpf aus dem Satz der Rumpf-Stufe statt `hullPlankTexture`, Eisen/Bronze/Messing, Segeltuch-Normalkarte), `architecture.ts` (Mauerwerk, Ziegel, Fachwerk, Hafenholz, Eisen), `gear/kit.ts` (`stahl`, `dunkelstahl`, `gold`), `weapons.ts` (Klinge, Griffwicklung).
- **Truppen:** `entities/troops/soldierGeometry.ts` (rein, testbar): `SOLDIER_JOINTS` (Hüfte, Brust, Hals, Kopf, Schulter, Ellbogen, Hand, Knie, Fuß, Waffenplatz – die Waffenhand liegt unverändert bei 0,29 | 0,88 | 0,28), `buildSoldier(typ, palette)`, `hatFor`; ein geteiltes, indiziertes Netz je Typ und Uniform (unter 6 000 Eckpunkte), Attribut `aWind` für die Rockschöße. `troopRender.ts`: Pool, Material mit Stoff-Oberfläche und Wind.
- **Brücken (#1):** `islandGround.ts`: `Deck`, `deckHeight`, `WalkIsland.decks`; `islandHeight(…, withDecks)` – Decks zählen nur für die Laufhöhe, nie für das Geländenetz (Standard: nur mit Wiesendecke und Einebnungen). `megaRifts.ts`: Sohle, Wände und Lava laufen unter den Brücken durch, Brücke auf beide Uferhöhen geneigt (`BRIDGE_DECK_HW`, `BRIDGE_DECK_TOP`), Ränder je Art (Fels oder Mauerwerk). Decks werden wie die Einebnungen beim ersten Aufbau in die Welt geschrieben.
- **Ruhezeiten (#7):** `data/megaIslands.ts`: `MegaSaveState`, `megaToSave` (verbleibende Sekunden), `cleanMegaSave`, `megaFromSave`; `SeaWorld.megaSnapshot`/`setMegaState`; Spielstand `world.mega` (Version bleibt 19, fehlendes Feld = alles bereit; `migrateSave` säubert).
- **Tests:** `tests/pbrMaterialForge.test.ts` (16 Tests: Karten je Art, Determinismus, Normalen als Einheitsvektoren mit Relief, Rauheit um den Rezeptwert, Metall, Verdeckung, Kachelbarkeit, Stufengrößen, Cache-Eindeutigkeit, Farbräume und Wiederholung, Freigabe-Schutz und genau einmalige Freigabe, Soldaten-Gelenke für alle Typen und Uniformen, Wind nur an den Schößen, Eckpunkt-Budget, Hüte je Macht, Laufdeck-Höhe und Trennung vom Geländenetz, Ruhezeiten speichern/laden/säubern, alte Stände ohne Feld). Angepasst: `save.test.ts` (Welt hat `mega`). Neu im Streamer-Test (4.3.6 nachgereicht): ein GPU-Schritt beendet das Bild. **727 Tests**, `tsc` und `npm run build` grün (der Worker ist ein eigener Baustein).
- **Im Browser geprüft** (Playwright, RTX 5070 Ti, Ultra, 1440 × 900; Handy 390 × 844 auf Mittel und Niedrig): alle 19 Sätze kamen bei 1024 px aus den Workern (Hauptfaden 0 ms), auch im fertigen Build; keine Konsolenfehler oder -warnungen; Schiff, Hangfels (Vulkaninsel), Mega-Brücken, Truppen nah und fern, Figur bei Nacht. **Alle 21 Brücken** der sechs Mega-Inseln überquert (Laufhöhe immer über der Sohle), quer über die Spalten gesperrt. **150 marschierende Soldaten:** Median 14,2 ms je Bild (ohne Truppen 12,5 ms), 95 % unter 19,2 ms. **Anfahrt Kurogane-Schlund mit Streaming:** Median 9,6 ms, 99 % unter 18,5 ms, höchstes Bild 27 ms (4.3.6: 42 ms). **Speicher über drei Besuche:** Texturen nach jeder Rückkehr 529, Geometrien 931 / 941 / 908, Shader-Programme fest, die Schmiede baut nichts neu, kein Freigabe-Versuch traf ihre Texturen. Ruhezeiten im echten Rundlauf Speichern → JSON → Laden erhalten (780 s und 1 000 s Rest).
- **Abweichungen und offene Punkte:** (1) **Startzeit:** rund 90 zusätzliche Shader-Varianten; mit warmem Shader-Speicher 16 s bis zum Menü statt 11,8 s, der allererste Start nach dem Update übersetzt alle Shader neu (hier rund 70 s, danach nicht mehr). Eine Zusammenlegung der Varianten wäre der nächste Schritt. (2) Das Toon-Material bleibt (CLAUDE.md: PBR fließt ein, ersetzt nicht) – keine `MeshStandardMaterial`. (3) **Spielfigur, Offiziere, Crew und Bosse** sind VRoid-Modelle mit Skelett: ihre Körper und Gesichter wurden nicht neu modelliert (Gelenke und Animationen unangetastet), sie bekamen die neuen Stoff-, Leder- und Metalloberflächen und das Kantenlicht; neu modelliert wurden die Massentruppen. Umhänge schwingen schon seit 2.9.x im Shader. (4) **Waffen:** Klingenform, Parierstange und Griff der Blender-Modelle sind unverändert (das bräuchte neue Modelle aus `tools/blender`); neu sind polierter Stahl mit Riefen und die Griffwicklung. (5) Normalkarten werden nur für UV-Sätze hochgeladen, die übrigen rechnen Relief aus dem Höhenkanal (spart rund die Hälfte Grafikspeicher). (6) Die Größe der Sätze richtet sich nach der Startstufe; ein späterer Stufenwechsel behält sie. (7) Kein Test auf einem echten Handy.

## 4.3.6 – Sechs Mega-Inseln mit Brücken, Kampf-Bezirken und Insel-Kommandanten, Seekarte mit Topografie (24.11.2026, nur lokal)

**Was du siehst**
- **Sechs Mega-Inseln (720 – 880 m Durchmesser) im dritten Ring**, jede eine eigene kleine Welt mit Häfen, Straßen, Bauten und Kampfgebieten:
  - **Kronenklippe – Albion-Bastion** (England, Nord): Kreideklippen, zwei Häfen mit Doppelstegen, Exerzierplätze, eine **Kreidekluft mit Steinbrücke**, dahinter die Zitadelle mit Bergfried, Zinnenmauern und Torhaus.
  - **Gouden Stad – Handelsmetropole der Kompanie** (Niederlande, Süd): **Grachten mit Holzbrücken**, Kontorviertel, Lagerhäuser, befestigte Molen, acht Anleger.
  - **Drachenamboss – Hanse-Bergfestung** (Deutschland, Nordost): schwarzes Massiv, Erzterrassen, Kanonengießerei, Wehrmauern, Serpentinen und eine Schlucht mit Steinbrücke.
  - **Château Soleil – Sonnenpalast-Insel** (Frankreich, West): Terrassengärten, Marmortreppen, eine Arena der Duellanten und eine doppelte Küstenbastion.
  - **Kurogane-Schlund – Vulkan-Festung** (Kurogane, Südost): eine Caldera mit **zwei glühenden Lavaspalten und vier Obsidianbrücken**, Dojo-Höfe und ein Korsarenlager am Strand.
  - **Sturmkrone-Ruinen – Das Verlorene Kaiser-Atoll** (herrenlos, 8 km draußen, Gefahrenstufe 4): ein Tempel-Archipel aus Ringinseln, getrennt von Meeresarmen, verbunden durch Ruinenbrücken, mit Statuenhainen und Schatzkammern.
- **Kampf-Bezirke statt Belagerung.** Jede Mega-Insel hat **drei Bezirke** mit Deckungsmauern und Höhenunterschieden. Kommst du einem Bezirk nahe, ziehen dort **Elite-Trupps** auf (Hauptleute, Schildträger, Musketiere, Faji-Wirker, Schläger) und patrouillieren, bis sie dich entdecken. Ist ein Bezirk geräumt, öffnet sich eine **Schatztruhe** (Gold, zwei Waren der Insel, ein Relikt-Splitter); nach 15 Minuten wird er wieder besetzt.
- **Ein Insel-Kommandant zieht mit Leibwache von Bezirk zu Bezirk** (Gefahrenstufe 3 – 4, Bossleiste mit Phasen): Kommodore Ashcombe, Syndikus Van der Roek, Bergvogt Eisenhart, Duc de Valcourt, Kaigun-Taishō Akagane und der Steinerne Kaiserwächter. Besiegt bringt er viel Gold, drei Waren, Relikt-Splitter und **Boss-Siegel der Inselmacht** (beim ersten Sieg eines mehr); er kehrt nach 25 Minuten zurück. Es gibt keine eigene Raid-Instanz: alles passiert in der offenen Welt.
- **Schären, Leuchtfelsen und Riff-Passagen** umgeben jede Mega-Insel (42 Felsen, je drei bilden eine Passage „I/II/III“).
- **Die Weltkarte (M) ist aufgeräumt und plastisch.**
  - Die alten Meeresnamen in der Kartenmitte (Nebelarchipel, Nordwacht, Glutring, Sturmgürtel, Schlundriff) sind weg; nur die Bernsteinsee bleibt als zarter Kreis.
  - **Mega-Inseln sind schon in der Gesamtansicht groß und benannt** (auch unentdeckt), stehen in der Rangfolge vor allen anderen Namen und rücken am Bildrand nach innen, statt abgeschnitten zu werden. Unentdeckte Inseln zeigen klare Umrisse; nur die vier Geheim-Inseln bleiben bis 1 400 m verborgen.
  - **Topografie** entdeckter Inseln: Höhenlinien, Spalten mit dunklem Rand (Lava, Grachten, Klüfte, Meeresarme), Brücken als helle Querbalken und die Stege der Hafenbuchten.
  - Die **Namen der Mächte** suchen sich einen freien Platz neben Mega-Inseln, Festungen und Bedienelementen; nah herangezoomt werden sie zu Wasserzeichen.
  - Oben eine **Sprungleiste** (Ankerglück und die sechs Mega-Inseln) in einer eigenen Zeile, auf dem Handy wischbar.
- **Kleinere Verbesserungen:** Die große Einblendung (Regionsname, „Bezirk geräumt“) sitzt im schmalen Hochformat im unteren Drittel und überdeckt die Bossleiste nicht mehr.

**Technik (für Entwickler)**
- **Daten:** `data/megaIslands.ts` (rein): `MEGA_ISLANDS` (Lage, Radius, Küste, Hügel, Bauplätze, Bezirke, Kommandant, Waren, Schären), `megaSite`/`MEGA_SITES` (gehen in `SITES`), `megaIslandDefs`/`skerryDefs` (in `data/regions.ts` eingetragen, `IslandDef.mega`/`skerry`), Laufzeit `MegaRuntime` mit `districtsToWake`, `clearDistrict`, `commanderShouldAppear`, `commanderRoam`, Beute `rollMegaLoot`; Werte in `MEGA_COMBAT`. Märkte in `ISLAND_PROFILES`.
- **Spalten und Brücken:** `RiftDef` (`kanal`/`lava`/`kluft`/`sund`, Breite, Linienzug, Übergänge) an `SiteDef.rifts`; Aufbau `world/megaRifts.ts` (`buildRiftsSteps`: Sohle als Einebnung mit fester Höhe `addPad(…, fixedY)`, Randsperren, Wand mit Mauerkrone, Lavaband mit Kruste und Glutader in Eckpunktfarben, Glut und Dampf, Brücken an den Übergängen); reine Rechnung `world/riftMath.ts` (`RIFT_GAP`, `riftWallOff`, `riftBlockHalf`, `pointAt`, `polyLength`, `inCrossing`). Neue Bauten in `architecture.ts`: `bruecke` (Stein, Marmor, Obsidian, Holz, Ruine), `statue`, `pagode`, `fahne` (`StructureDef.v` = Variante).
- **Streaming:** `streamLead(r)` vergrößert das ACTIVE-Fenster großer Inseln; `islandStages` rechnet die Begrenzungskugeln in 2-ms-Häppchen vor und lädt die Texturen einer Insel vor dem Tausch **je Bild höchstens eine** hoch (`yield 'gpu'` beendet das Bild im `WorldStreamer`); im veröffentlichten Spiel ist `renderer.debug.checkShaderErrors` aus. `mergeByMaterialSteps` ergänzt fehlende Eckpunktfarben (sonst schlug das Zusammenfassen fehl und meldete einen Konsolenfehler).
- **Kampf:** `SeaWorld.enterMega/updateMega/leaveMega` (Bezirke über `CombatSystem.spawnWave(…, { calm: true })`, Kennung `mega:<insel>:<bezirk>` bzw. `:kommandant`), Lohn `Game.megaVictory` (Gold, Erfahrung, Waren, Splitter, Siegel, Erster-Sieg-Marke in `progress.flags`).
- **Karte:** `MapTopo` über `SeaWorld.topoOf` und `WorldMapData.topo`, `drawTopo`, `megaLabel`, Machtnamen über `sectorSpotFree` und `LabelPlacer.free`, Bedienflächen als `MapDrawState.chrome` (einmal je Größenänderung gemessen); feste Schriften und Namen ohne neue Texte je Bild.
- **Spielstand:** keine neue Version (bleibt 19, Entdeckungen bleiben erhalten). Geräumte Bezirke und der Kommandant gelten für die laufende Sitzung.
- **Tests:** `tests/megaIslands.test.ts` (21 Tests: Lage und Abstände, Wasserlinie, Grenzen, Schären, Stege, Spalten, Erreichbarkeit mit und ohne Brücken, Bauplätze, Streaming-Fenster, Bezirke, Kommandant, Beute, Karte ohne Überlappung bei 1× und 2,5× auf Desktop und Handy), neuer Streamer-Test für `'gpu'`; angepasst `openWorld`, `factions`, `worldEvents`, `worldStreamer`. **711 Tests**, `tsc` und `npm run build` grün.
- **Im Browser geprüft** (Playwright, Grafikstufe Ultra, Desktop 1440 × 900 und Handy 390 × 844): Karte bei 1,00× und 2,50× auf beiden Größen (alle sechs Namen, keine Überlappung); **Kurogane-Schlund** angelaufen, angelegt, an Land: beide Obsidianbrücken überquert (Laufhöhe 1,2 – 1,8 m, Lava-Sohle bei 0,35 m), quer über die Lava gesperrt; Bezirk „Obsidian-Brücken“ (4 Elite, Stufe 11) erwacht und geräumt → Truhe +741 Gold, 2 Schwefel, 2 Obsidian, 1 Splitter; Kommandant Akagane (Stufe 13) besiegt → +2 954 Gold, 6 Schwefel, 5 Obsidian, 4 Medizin, 4 Splitter, 2 Siegel (Kurogane), Rückkehr nach 1 500 s. **Kronenklippe**: Steinbrücke über die Kreidekluft (1,1 → 5,7 m, Kluftsohle −4 m), quer gesperrt, Bezirke „Brücken-Engpass“ und „Zitadellen-Hof“ samt Kommodore Ashcombe erwacht. **Anfahrt mit Streaming**: Median 10,2 ms, 95 % unter 13,3 ms, 99 % unter 21 ms; vor den Korrekturen kostete der erste Tausch einer Mega-Insel 54 – 389 ms. **Speicher**: dreimal hin und zurück – Geometrien 910 → 870 / 862 / 857, Texturen 518 → 510 – 512, Shader-Programme nach dem ersten Besuch fest bei 481, alle Gegner abgebaut; JS-Speicher nach dem ersten Besuch stabil bei 479 – 486 MB. Keine Konsolenfehler.
- **Beim Prüfen gefunden und behoben:** Das Lavaband lag unter der Geländedecke (unsichtbar) und der Aushub reichte 2 – 4 m über die Spaltenwand hinaus (begehbarer Graben); jetzt endet die Sohle an der Wand, eine Mauerkrone deckt die Böschung, die Sperre reicht darüber hinaus. Sprungleiste der Karte abgeschnitten, Machtnamen über Mega-Namen, „Gouden Stad“ am Handy verdrängt. Ruckler beim ersten Tausch (Texturen, Begrenzungskugeln, Shader-Prüfung). Konsolenfehler beim Zusammenfassen gemischter Eckpunktfarben. Der Kommandanten-Lohn gab zusätzlich 1 420 Erfahrung (jetzt 300 + 20 je Stufe, Bezirk 120 + 8 je Stufe).
- **Abweichungen und offene Punkte:** (1) Unter jeder Brücke bleibt ein Erddamm stehen (dort wird nicht ausgehoben, man läuft auf dem Boden unter dem Brückendeck); die Brücke wirkt eher wie auf einem Damm als frei über der Spalte. (2) Der allererste Tausch einer Mega-Insel kostet noch ein Bild von rund 42 ms (Hochladen der Geometrie auf die Grafikkarte), Wiederbesuche nicht. (3) Die Lavaspalten im Krater von Kurogane sind nur rund 1 m tief: der Kraterboden liegt 1,3 m über dem Meer, tiefer würde das Meer hineinlaufen. (4) Der erste Besuch einer Mega-Insel bindet einmalig rund 136 MB JS-Speicher (bleibende Kollisionsdaten laut Streaming-Architektur, Gegner-Modelle, Zwischenspeicher); danach wächst nichts mehr. (5) Gekämpft wurde im Test mit Prüf-Treffern (eine Stufe-1-Figur besiegt keine Stufe-11-Elite), nicht mit echten Kombos. (6) Die Sturmkrone-Ruinen liegen mit 8 000 m laut Ringdaten noch in Ring 3 (Rand zu Ring 4). (7) Geräumte Bezirke und Kommandanten werden nicht gespeichert (nach dem Laden wieder besetzt). (8) Kein Test auf einem echten Handy; Bildzeiten im gestoppten Prüfaufbau gemessen.

## 4.3.5 – Phase 4.3D: MMO-Strategiekarte mit Zoom und Ebenen, Entdeckung mit Kartennebel, Seekarten-Schnellreise, Flotten-Ausbau in der Werft, ruckelfreie Feindschiffe, neuer Tiefsee-Leviathan – Phase 4.3 abgeschlossen (24.11.2026, nur lokal)

**Was du siehst**
- **Die Weltkarte (M) ist jetzt eine Strategiekarte.**
  - **Stufenloser Zoom von 0,65× bis 4,5×** (1× = ganze Welt): Mausrad zoomt um den Mauszeiger (der Punkt unter dem Zeiger bleibt stehen), Zwei-Finger-Geste auf dem Handy, Knöpfe ＋/－ und eine Zoomanzeige („2,20×“). **Ziehen verschiebt**, ein Antippen, das sich höchstens 5 Pixel bewegt, **wählt eine Insel**. Die Karte läuft nie aus dem Fenster: ist sie größer, bleibt das Fenster auf der Karte; ist sie kleiner, bleibt sie mindestens zur Hälfte sichtbar.
  - **„⌖ Auf Schiff zentrieren“** springt zum eigenen Schiff (aus weiter Ansicht auf 2×), auf dem Handy kurz „⌖ Schiff“.
  - **Semantischer Zoom:** unter 1,15× stehen nur Städte, Festungen und das Marine-Hauptquartier beschriftet; ab 1,15× erscheinen alle Inselnamen, Strömungs- und Wetternamen und die Markt-Abzeichen. **Keine Beschriftung überlappt eine andere** (ist der Platz über einer Insel belegt, steht der Name darunter; sonst entfällt er).
  - **Vier Ebenen zum Ein- und Ausschalten** im Kartenrahmen: *Sektoren & Gefahrenringe* (fünf Mächte, Marine-Grenzen, die vier Ringe als getönte Bänder mit Namen, dazu die Sturmsee), *Strömungen* (elf Windstraßen mit Pfeilen), *Ereignisse & Konvois* (Schatz-Galeonen, Blockaden mit rotem Ring um den Hafen, Treibgut, Weltbosse, Konvois, Wetterzellen, Seeschlachten), *Kontor-Handel* (▲ Überschuss und ▼ Bedarf entdeckter Häfen als Abzeichen, Schwarzmärkte violett). Die Wahl bleibt beim nächsten Öffnen erhalten.
  - **Handy (390 × 844):** Titel und Schließen oben, Werkzeuge darunter, die Meere als wischbare Zeile, die Ebenen unten; die Inseltafel liegt über der Karte.
- **Entdeckung und Kartennebel.**
  - Zu Beginn sind nur **Ankerglück und alles bis 2 400 m** (Ring 1) kartiert. Außerhalb liegt ein **dunkler Nebel**; noch unbekannte Inseln sind nur **schemenhafte Pergament-Umrisse** ohne Namen, Hafen, Markt oder Besatzung.
  - Segelst du bis auf **1 600 m Küstenabstand** heran (mit Ausguck weiter), ist die Insel entdeckt. Die **vier Geheim-Inseln** (Flüsterlagune, Versunkene Krone, Knochenriff, Sternenfall) erscheinen auf der Karte **gar nicht**, bis du auf **1 400 m** herankommst.
  - **Anlegen in einem Hafen** oder das **Leuchtfeuer** an einem Leuchtturm kartiert **3 200 m rundum** (Geheim-Inseln ausgenommen); ein Hinweis nennt die Zahl der neu eingetragenen Inseln. Im Spiel gemessen: die Ankunft in Kiefernhafen trug 13 Inseln neu ein.
- **Seekarten-Schnellreise.** Wähle auf der Karte einen entdeckten Hafen und tippe **„⚓ Seekarten-Reise · 53 Gold · 1 Proviant“**.
  - **Kosten:** 22 Gold je Kilometer (mindestens 30) mal Hafen-Tarif der Zielmacht, dazu 1 Proviant je 2,5 km (mindestens 1).
  - **Gesperrt** – mit deutschem Hinweis unter dem Knopf und im Tooltip –, wenn der Hafen blockiert ist, die Hafenmacht dich verfemt hat (Ansehen −60 oder tiefer), du kämpfst, im Sturmgürtel, in einer Gewitterzelle, bei Sturmwetter oder in der Sturmsee segelst, Fahndungsdruck besteht (Hitze ab 25 oder Jäger auf deiner Spur), **Handelsware im Frachtraum liegt** (damit Handelsrouten nicht per Sprung umgangen werden), du nicht auf See am Ruder bist oder Gold bzw. Proviant fehlen. Nur Häfen und Städte sind Ziele.
  - **Ankunft:** die Umgebung des Hafens wird sofort fertig gebaut, dein Schiff liegt auf freiem Wasser vor der Stegspitze (gemessen: 125 m vor der Küste, 53 m vom Steg), die Begleitschiffe laufen in ruhiger Formation mit **mehr als 45 m** Abstand zu allen Stegen aus (gemessen: 64 m), der Hafen kartiert seine Umgebung.
- **Werft → Flotte: Begleitschiffe direkt ausbauen.** Jedes aktive oder eingemottete Begleitschiff zeigt Rumpf, Segel und Kanonen mit nächster Stufe, Gold (mit Tarif), Material aus dem Frachtraum (mit Bestand), die Änderung des Solds und das Tor (Rang, Ansehen, Siegel) – bis Stufe V, ohne das Schiff erst zum Flaggschiff zu machen. Ein ausgelaufenes Schiff übernimmt die neue Stufe sofort. Reparieren ging dort schon.
- **Feindschiffe erscheinen ohne Ruckler.** Patrouillen, Händler mit Eskorte, Jäger und Kopfgeldjäger entstehen jetzt wie Ereignis-Schiffe über mehrere Bilder. Beim Messen fielen drei weitere Ursachen auf, die behoben sind: das erste Bild eines neuen Schiffs lud bis zu **zwölf 2048×1536-Segel und eine 4096²-Decktextur am Stück** hoch (0,3 – 1,1 s). Jetzt werden **gleiche Segel geteilt**, Segel und Tuchflaggen vorher im Hintergrund zu ImageBitmaps (rund viermal schneller hochzuladen) und **je Bild höchstens eine Textur** hochgeladen; die Deckplanken sind für alle Schiffe eine einzige Textur. Nebenbei spart das je Feindschiff rund 200 MB Grafikspeicher.
- **Der Tiefsee-Leviathan hat ein neues Modell:** 16 Körperglieder, die sich zu einem geschlossenen Bogen strecken, mit **Schuppenplatten** an Rücken und Flanken und einem **Flossenstachel-Kamm**; **acht Tentakelbögen** steigen aus dem Wasser, wiegen sich wellenförmig und tauchen wieder ein, mit pulsierenden Leuchtpunkten; ein Kopf mit Hörnerkranz, **zwei großen glimmenden Tiefsee-Augen** (werden mit sinkendem Leben greller) und Leuchtorganen am Kiefer.

**Technik (für Entwickler)**
- **Kartenansicht:** `ui/mapView.ts` (rein): `MAP_ZOOM_MIN/MAX`, `LABEL_ZOOM`, `CLICK_SLOP`, `fitScale`/`zoomOf`, `clampView` mit `panLimit`, `zoomAtPoint`, `panByPixels`, `centerOn`, `fitAll`, allokationsfreie `worldToScreenInto`/`screenToWorldInto`, Klick-oder-Ziehen (`dragStart`/`dragMove`/`dragEnd`), `LabelPlacer` (feste Rechteck-Liste in einem `Float32Array`) und `TextWidths` (Breiten einmal gemessen). Zeichner `ui/worldMapDraw.ts` (aus `minimap.ts` herausgelöst): Umrechnung über Modulvariablen statt Abschlüssen, Hintergrund-Verlauf gemerkt, Nebel auf einer zweiten Zeichenfläche (`destination-out`), Beschriftung nach `labelRank`, Abzeichen-Texte gemerkt. `ui/worldMap.ts`: Ebenen, Zentrieren, Reise-Knopf (`aria-disabled` mit Gründen), `debug()`/`setView()`/`select()` für Prüfskripte.
- **Entdeckung:** `world/mapDiscovery.ts` (rein): `DISCOVERY` (2 400 / 1 600 / 1 400 / 3 200 m), `chartLevel` (known/outline/hidden), `isStartCharted`, `seeRange`, `discoverNear` (ohne neue Felder), `chartAround` (Zonen je Insel, höchstens 64), `cleanChart`, `chartToSave`, `legacyDiscovered`, `chartOnLoad`. `SeaWorld.discovered` + `chartZones`, `setChart`, `chartAroundIsland`; `Game.chartFrom` beim Anlegen (`openHarbor`) und am Leuchtturm (`enterIsland`).
- **Spielstand 19:** neues Feld `world.chart` (`{ islands, zones }`). Die Migration 18 → 19 übernimmt besuchte und eroberte Inseln (`flags.disc`, `seen_`, `loot_`, `crystal_`, `beat_`, `raidwon_`, `progress.conquest`); auch ein früher Stand der Version 19 ohne Karte wird beim Laden so ergänzt. Die Versionsnummer bleibt 19 (die 4.3.4-Stände sind nie veröffentlicht worden).
- **Schnellreise:** `world/fastTravel.ts` (rein): `FAST_TRAVEL`, `isTravelPort`, `travelCost`, `travelQuote` (alle Sperren mit Text, `lock` = erste), `findBerth` (freier Platz seewärts der Stegspitze). `SeaWorld.travelState` (auf See, Kampf, Sturm, gejagt) und `travelToPort` (`forceSyncAround`, `findBerth` mit `NavalSystem.freeWater`, `releaseAll` der Ereignis-Schiffe, `arrivalClear`, `teleport`). `Game.fastTravelQuote`/`fastTravel`. Begleitschiffe: `fleetSpawnPoint` (rein, `data/playerFleet.ts`) und `NavalSystem.arrivalClear`.
- **Flotten-Ausbau:** `Game.evoGateFor`/`evoUpgradeFor` (gemeinsam für Flaggschiff und Begleiter), `fleetEvoRows`, `fleetEvoUpgrade`, rein `applyFleetEvo` (`ship.evo` und Eintrag der Flotte), `NavalSystem.removeFleetShip` (läuft mit neuen Stufen frisch aus). Menü: `.fleet-evo` im Flotten-Reiter.
- **Spawning:** `NavalSystem.spawnEnemySteps` (Generator, Bau über `Ship.buildSteps`), `queueEnemy` (Warteschlange, `SPAWN_BUILD_MS` 2,5 ms, ein Schiff zugleich, bestellte Jäger zählen mit), `spawnEnemy` bleibt als Sofort-Variante (Werkzeuge). `uploadSteps`: Texturen vor dem ersten Auftritt, Schiff solange unsichtbar; `'gpu'` beendet den Schritt des Bildes (das CPU-Budget sieht die GPU-Arbeit nicht), `'wait'` wartet auf das ImageBitmap; `finally` baut verworfene Schiffe ab; gilt auch für Ereignis-Schiffe (`WorldEventsLive.pumpSpawn`). `Renderer.uploadTexture`/`textureReady`, `SeaWorld.texHook`. `render/textures.ts`: `cachedSailTexture` (Zähler je Material, Freigabe über `onForget` aus `disposeObject`), `sailCacheStats`; `userData.staticCanvas` an Segeln und Tuchflaggen. `shipBuilder.shipDeckKit` (eine Deck-Kopie samt Reliefkarten; jedes `clone()` hob in three.js die Version der gemeinsamen Quelle und erzwang einen neuen Upload).
- **Leviathan:** `naval/leviathanBoss.ts` neu: `LEVIATHAN` (16 Glieder, 4 Platten je Glied, 8 Tentakel à 12 Glieder, 3 Leuchtpunkte je Tentakel, 3 Warnringe), Materialien und Netze einmal gebaut und geteilt (`levKit`, `markShared`, `sharedGeo`), Mittellinien in festen `Float32Array`s, Glieder entlang der Kurve ausgerichtet, Schläge aus festem Vorrat (kein `find`, kein `splice`, keine Objekte je Bild), `glimmer` setzt nur Farben, `dispose` über `disposeObject`.
- **Tests:** `tests/worldMapDiscovery.test.ts` (24 Tests): Umrechnung, Zoom-Grenzen, Zoom um den Zeiger, Klemmung auf Desktop und Handy, Klick-Schwelle, Beschriftung ohne Überlappung über alle Inseln und Zoomstufen, Start-Kartierung, Entdeckungs-Radien, Geheim-Inseln verborgen, Leuchtturm-/Hafen-Kartierung, Säubern, alle Reise-Sperren samt Texten, Kosten mit Tarif, Anlegeplatz, Flotten-Abstand über 45 m zu Stegen, direkter Ausbau bis V samt Laden, Migration 18 → 19 und frühe 19er-Stände, Spawn-Warteschlange und geteilte Segeltexturen mit Freigabe. Angepasst: `save.test.ts` (Welt hat `chart`), `worldEvents.test.ts` (Abbruchbedingung des Bauschritts). **689 Tests**, `tsc` und `npm run build` grün.
- **Im Browser geprüft** (Playwright, Entwicklungsserver, Grafikstufe Ultra, RTX 5070 Ti, Desktop 1440 × 900 und Handy 390 × 844, null Konsolenfehler): Karte bei 1× und 2,2×, Inseltafel mit Handel und Reise-Knopf, Sperre durch Handelsfracht mit Hinweis, echte Mausrad-Gesten (Zeigerpunkt bleibt exakt stehen, Grenzen 0,65× / 4,5×), 3-px-Zittern wählt Ankerglück, 60-px-Zug verschiebt ohne Auswahl, Zentrieren trifft das Schiff, Ebenen schalten; **Schnellreise per Klick nach Kiefernhafen** (–53 Gold, –1 Proviant, Umgebung fertig gebaut, Flotte in Formation 64 m von den Stegen, 13 Inseln neu kartiert); Flotten-Ausbau Rumpf I → II per Klick, Tor bei Stufe III („Ansehen ‚Freundlich‘ bei der Hafenmacht nötig“), das ausgelaufene Schiff trägt Stufe II; Leviathan aus der Nähe. **Leistung:** am Leviathan 240 Bilder im Mittel 10,5 ms, 95 % unter 12,4 ms; **9,8-km-Flug durch alle vier Ringe** und den Bernstein-Passat mit fünf bestellten Feindschiffen, frisch geladen: im Mittel 14,5 ms, Median 10,9 ms, 99 % unter 43 ms, **kein Bild über 130 ms (vorher bis 1 124 ms)**; `renderer.info.memory` nach der Rückkehr 882 Geometrien / 516 Texturen gegenüber 912 / 518 vor dem Flug; der Segel-Cache gibt beim Abbau aller Feindschiffe frei (29 → 5 Einträge, nur das eigene Schiff).
- **Abweichungen und offene Punkte:** (1) Die Bildzeiten sind im gestoppten Prüfaufbau gemessen (Bild für Bild mit Grafikkarten-Abgleich), nicht mit der echten Spielschleife. Im Mittel liegt das klar über 60 FPS; während ein neues Schiff seine Segel lädt, kosten einzelne Bilder 25 – 45 ms, und bei der allerersten Begegnung mit einer neuen Optik bleiben selten Einzelbilder um 100 – 130 ms (ein großer Bauschritt oder eine erste Tuchflagge). (2) Die Spielstand-Version bleibt 19 wie vorgegeben, obwohl 4.3.4 sie schon benutzt; die Karte wird darum bei jedem Laden aus den Besuchsmarken ergänzt. (3) „Leuchtturm aktivieren“ gibt es als Handlung nicht; das Leuchtfeuer zündet, sobald du an einen Leuchtturm herankommst. (4) Die Fahndung sperrt ab Hitze 25 oder mit Jägern auf deiner Spur (eine Schwelle nannte die Vorgabe nicht). (5) Seeschlachten zählen als Kampf, wenn sie näher als 900 m sind. (6) Kein Test auf einem echten Handy.

## 4.3.4 – Phase 4.3C: das lebendige Meer – Welt-Ereignisse mit Horizont-Signalen, Handelskonvois mit echter Marktwirkung, Meeresströmungen, wandernde Wetterzellen, drei Weltbosse (24.11.2026, nur lokal)

**Was du siehst**
- **Auf der Weltkarte laufen immer 4 bis 6 Ereignisse**, jedes an einem eigenen Signal am Horizont zu erkennen (bis rund 5 km). Nichts taucht neben dir auf und greift dich an: Ereignisse erscheinen mindestens 1,1 km entfernt, und gekämpft wird nur, wenn du hinfährst oder zuerst schießt.
  - **Schatz-Galeone** – alle sieben Sekunden steigt eine **goldene Leuchtrakete** auf, zerplatzt und hängt als Stern am Himmel. Ein gepanzertes Schatzschiff (Rumpf-Stufe 5) mit zwei Eskorten auf langer Fahrt zu einem fernen Hafen (mindestens 2,5 km). Aufgebracht: 2 200 Gold + 140 je Stufe, 2 bis 4 Relikt-Splitter, Luxusgüter und Seide, ab Rang 5 mit 35 % ein Stück der Stufe 4. Erreicht sie ihr Ziel, verlöschen die Raketen.
  - **Hafen-Blockade** – eine **dichte schwarze Rauchfahne** vor einem Hafen (Ringe 2 bis 4, nie Ankerglück, nie Schwarzmärkte). 3 bis 4 Schiffe (Kurogane-Schwarzsegler oder der Rivale der Macht) kreuzen vor dem Hafen und greifen nur an, wer näher als 420 m kommt. Solange sie liegt, **kosten alle Waren dort das Doppelte** (Kontor zeigt „⚓ Blockade“), und die **Schnellreise dorthin ist gesperrt**. Gebrochen: 800 Gold je Gefahrenstufe, +8 Ansehen und +20 Ehre bei der Macht des Hafens.
  - **Treibgut-Feld** – **kreisende Möwen** über treibenden Planken und Fässern; 5 bis 8 bergbare Kisten (einfach hindurchsegeln): Planken, Segeltuch, Handelswaren und mit 35 % eine **Schatzkarte** mit einem X auf der nächsten ruhigen Insel.
  - **Drei Weltbosse ziehen durch die Außenmeere (Ring 4)** – über jedem ein **dunkler Gewitterwirbel** mit Blitzen, dazu ein **tiefes Nebelhorn**:
    1. **Der Fliegende Klabautermann** (Gefahr 4): ein halb durchscheinendes Geister-Linienschiff in seiner eigenen Nebelbank, mit grün leuchtenden Spektral-Breitseiten (abwechselnd Kartätschen gegen die Mannschaft und Kugeln).
    2. **Kurogane-Flaggschiff „Ryujin“** (Gefahr 5): schwarzer Leviathan mit Rammsporn und Deck-Drehbassen (Ausbau 5/5/5), jagt im Gewitter.
    3. **Der Tiefsee-Leviathan** (Gefahr 5): ein Seeungeheuer mit Tentakel-Schlägen (1,8 s vorher färbt ein **roter Warnring** das Wasser), Wellenstößen, die Schiffe wegdrücken, und Abtauchen.
    Sie greifen nur an, wer ihnen näher als 380 m kommt. Kein Treffer nimmt einem Weltboss mehr als 4 % seines Rumpfs, und keine Salve eines Weltbosses nimmt deinem Schiff mehr als 18 % (**Anti-One-Shot**). Sieg: **garantiert Boss-Siegel** (der erste Sieg 2, danach 1; Ryujin gibt Kurogane-Siegel, die anderen die Siegel der Macht des Sektors), 2 bis 4 Relikt-Splitter, **ein Stück der Stufe 4**, 4 200 Gold + 160 je Stufe, viel Erfahrung und Ruhm, +6 Ansehen und +25 Ehre. Besiegte Bosse kehren nach 15 Minuten zurück.
- **Handelskonvois** fahren ständig zwischen Inseln, die eine Ware im Überschuss herstellen, und Inseln, die sie brauchen (höchstens fünf zugleich, 26 Handelsstrecken in den Ringen 1 bis 3): ein schwer beladener Frachter mit ein bis zwei Eskorten in den Farben ihrer Macht.
  - **Kommt ein Konvoi an, wird der Zielhafen wirklich beliefert**: der Vorrat der Ware steigt um die Ladung, der Knappheitspreis sinkt (im Spiel gemessen: Kiefernhafen, Marine-Ausrüstung 40 → 68 Einheiten). Liegst du dort, meldet ein Hinweis den Preis vorher und nachher.
  - **Plünderst du ihn**, bekommst du seine Ladung (die Ware seiner Herkunftsregion; geentert ganz, versenkt 65 %), nahe einer Grenze dazu einen Posten Kriegsware – und der Zielhafen bleibt knapp. Das kostet wie bisher Ansehen bei seiner Macht.
  - **Korsaren-Überfälle:** Manche Konvois werden unterwegs angegriffen. In deiner Nähe siehst du die Korsaren kommen und kannst eingreifen: Versenkst du sie, ohne selbst auf den Konvoi zu schießen, gibt es 380 Gold je Gefahrenstufe, +5 Ansehen und +12 Ehre bei seiner Macht. Fern von dir geht die Hälfte der überfallenen Konvois verloren.
- **Meeresströmungen („Windstraßen“):** elf rund 150 m breite Bänder zwischen den wichtigsten Handelshäfen (Bernstein-Passat, Albion-Strom, Hansestrom, Ostsee-Drift, Eisenstrom, Glutstrom, Asche-Drift, Gewürzstrom, Grachten-Drift, Weinstraße, Lilien-Drift), auf dem Wasser als **treibende Schaumfäden** zu sehen, auf der Weltkarte als blaue Bänder mit Pfeilen. Wer in Strömungsrichtung segelt, fährt **bis zu 35 % schneller** (voll im Kern und bei bis zu etwa 20° Abweichung); am Bug schäumt es dann stärker. Die Schiffstafel zeigt die Strömung mit Richtungspfeil und Bonus („➤ Glutstrom +35 %“). KI-Schiffe nutzen sie genauso.
- **Lokales Wetter statt Globalwetter:** sechs **wandernde Wetterzellen** ziehen langsam über die Sektoren – **Gewitterfronten** (dunkle Wolkentürme mit Regenvorhang, Blitze, hoher Seegang), **Nebelbänke** (weiße Nebelwände; drinnen schrumpft die Sicht auf wenige Schiffslängen, und Gegner entdecken dich erst spät) und **Flauten** (fast windstill, die Fahrt sinkt auf 55 %; nur Strömungen tragen). Fährt man hinein, blendet das Wetter in rund zwölf Sekunden über; die Schiffstafel und die Zeile oben links nennen die Zelle. Der zufällige Wetterwechsel für die ganze Welt ist aus; Nebelarchipel und Sturmgürtel behalten ihr eigenes Wetter.
- **Kompass, Minikarte und Weltkarte** zeigen die Ereignisse (Goldrakete, Rauchfahne, Kiste mit Möwen, Gewitterwirbel), Konvois (rot umrandet, wenn sie überfallen werden), die Strömungen und die Wetterzellen.

**Technik (für Entwickler)**
- **Reiner Zustand, MMO-tauglich:** `world/worldEventDirector.ts` (ohne three.js, eigener Zufallsgenerator im Zustand, deterministisch) führt `WorldEventState` = Ereignisse, Konvois, Wetterzellen, Wartezeiten, Siege je Boss als reines JSON (rund 15 KB). Er steht im Spielstand (`SaveData.world.seaEvents`, **Spielstand 19**, Migration 18 → 19 setzt `null`; `cleanWorldEvents` säubert beim Laden) und kann in Phase 4.7 unverändert über den Shard abgeglichen werden. Die Seewelt meldet Lage, Rumpf und Ausgang der Schiffe als `SeaShipRec` zurück; die Regeln (Ende, Wirkung) stehen nur im Director. Ein gespeicherter Zustand läuft nach dem Laden bitgenau weiter (Test).
- **Director:** `DIRECTOR` (4 – 6 Ereignisse, 1 600 m Mindestabstand, 1 100 m bis 4 000 m vom Spieler, 30 s zwischen neuen Ereignissen, 2 s beim Auffüllen), `WORLD_EVENT_DEFS` (Signal, Gewicht, Lebensdauer, Ringe, Plätze, Zone, Wartezeit). **Wartezeiten je Platz:** ein beendetes Ereignis sperrt seinen Platz (`cooldowns[Art]` = Liste von Zeitpunkten, Weltbosse je Boss `boss:<id>`); laufende plus wartende Plätze einer Art übersteigen nie ihr Maximum. `engage(id)` hält ein Ereignis im Gefecht (kein Ablaufen), `collectCrate`, `setBossHp`, `priceK`/`travelLocked`/`blockadeOf`, `cellAt`. Meldungen über `drain()`.
- **Konvois:** `world/tradeConvoys.ts` (`TradeConvoySystem`: Handelspaare aus `profileOf` samt `ISLAND_PROFILES`, `planRoute` um alle Inseln, Reise als Daten mit 7,5 m/s, `spawnCorsairs`, `step`), `deliverConvoy` (schreibt `MarketState.stock` des Zielhafens), `convoyLoot`, `defenseReward`; Zahlen in `CONVOY`. Echte Schiffe fahren die Route mit `PredictiveMaritimeSteering.cruise` (Frachter, Galeone, Weltboss) bzw. `escort` (Eskorten); Korsaren jagen den Frachter (`fight`).
- **Seesystem (`naval/naval.ts`):** `EnemyShip.ev` (`EventShipLink`: Besitzer, Eintrag, Rolle, Route, Führer, Zone, Beute, Boss), `spawnEventShip(Steps)`, `removeEventShip`, `aiEvent` (Opt-In: Angriff auf den Spieler nur `inZone || provoked`; unprovozierte Ereignis-Schiffe gelten als `peaceful`, die eigene Flotte lässt sie in Ruhe), ausgelagert `fightHostile`/`fightDuel`, `followRoute`, Spektral-Breitseite, `bossCap` (Salven-Deckel für Kugeln, Rammstöße und Drehbassen), `bossTarget` (Leviathan mit Rumpf-Panzerung), `flowK` (Strömung × Flaute für alle KI-Schiffe), `sightK` (Nebel), `onEventHit`, `hitByPlayer`, `prewarmProps`. Ereignis-Schiffe zählen nicht für Zufallsbegegnungen und werden nicht vom Fern-Abbau entfernt (das macht die Seewelt).
- **Seewelt-Seite:** `world/worldEventsLive.ts` macht ab 1 500 m echte Schiffe (zurück zu Daten ab 2 300 m, nie mitten im Gefecht), lässt den Leviathan erscheinen (`naval/leviathanBoss.ts`, gepoolt, Instanz-Netze), birgt Kisten, mischt die Zelle am Spieler in das Wetter (`Weather.cell`, `Weather.cellsDrive` statt Zufallswechsel), liefert Strömung/Flaute für den Spieler (`SeaWorld.updateSail`, Bugwellen-Gischt) und meldet `SeaEventNews` an `Game.seaNews` (Markt, Lohn, Hinweise). Im Raid und im Titelbild ruht alles (`paused`, `releaseAll`).
- **Strömungen:** `world/oceanCurrents.ts` (`routeAround` = gemeinsame Wegfindung um Inseln für Bänder, Konvois und Galeonen; `buildCurrentLanes` aus `CURRENT_LANES`; `CurrentField` mit Raster, allokationsfreie `sample`; `currentBoost` = 1 + 0,35 · Stärke · Ausrichtung). **Wetterzellen:** `world/weatherCells.ts` (`cellWeight` mit Kern 55 % und Ein-/Ausblenden über 60 s, `strongestCell`, `cellSpeedK`, `cellSightK`, `stepCells`), Werte in `WEATHER_CELL_DEFS`.
- **Weltbosse:** Daten `WORLD_BOSSES` (`data/seaEvents.ts`), Kalibrierung in `data/balanceConfig.ts`: `worldBossHull` (Klassen-Rumpf × `aiHullFactor` × `WORLD_BOSS_HULL_K` 2 × eigener Faktor = 4 381 / 7 062 / 8 564), `WORLD_BOSS_HIT_CAP` 4 % (`Ship.hitCap` in `damage` und `ramHit`, `capBossHit` beim Ungeheuer), `capVolley` mit `WORLD_BOSS_PLAYER_HIT_CAP` 18 % je `WORLD_BOSS_VOLLEY_S` 1,5 s, Kampfmodell `NAVAL_FIGHT_MODEL`/`playerNavalDps` und `playerCannonDmg` (jetzt die eine Quelle für den Kugelschaden des Spielers, `Game.applyPower` nutzt sie). Rechnung und Beute rein in `naval/worldBosses.ts` (`worldBossStats`, `bossFightSeconds`, `rollWorldBossLoot`). Ein passend ausgerüstetes Schiff braucht 145 – 176 s (Ryujin/Leviathan mit Linienschiff Stufe 22, Kanonen 5) bzw. 164 s (Klabautermann mit Galeone Stufe 18), eine Brigg der Stufe 6 über 30 Minuten.
- **Darstellung:** `world/worldEventView.ts` – alles beim Start angelegt und nur ein-/ausgeblendet: Schaumfäden (ein Netz für alle Bänder, liegt über `GERSTNER_GLSL` – jetzt aus `ocean.ts` exportiert – auf denselben Wellen), Leuchtraketen (eine Punktwolke, Größe wächst mit dem Abstand), Möwen, Trümmer und Kisten (Instanz-Netze), Gewitterwirbel und Wolken-/Nebelwände (verblassen im Dunst, weiche Seitenränder). Rauchfahnen über das vorhandene `SmokeSystem`. Neuer Klang `foghorn`.
- **Vorwärmen und Spawn-Ruckler (Fix aus 4.3.3):** Der Ladebildschirm baut zusätzlich je Macht ein Schiff (Segelmuster, Wappen, Tuchflaggen werden gemalt und hochgeladen) und zeigt Signale, Wände, Schaumfäden, Leviathan und Kanonenkugeln aller Munitionsarten einmal (`SeaWorld.warmup`, `prewarm`). Der Schiffsbau ist jetzt ein Generator: `buildShipSteps` (12 Bauabschnitte, Verschmelzen je 24 Teile und je Material, Konturen über `addOutlinesSteps`), `Ship.buildSteps`, `NavalSystem.spawnEventShipSteps`; die Seewelt baut höchstens ein Ereignis-Schiff zugleich mit 3 ms je Logikschritt (`WorldEventsLive.BUILD_MS`). `buildShip` bleibt als Hülle (gleiches Ergebnis).
- **Spiel:** `Game.seaNews` (Ankündigung nur in Sichtweite der Signale, Belohnungen, Markt), `marketSite().priceK` (Blockade, `MarketSite.priceK` in `marketPrice`), `travelLocked`, Schiffstafel `SeaView.flow`/`cell` (`.ship-flow`, `.ship-cell`), Zeile oben links nennt die Wetterzelle, Kompass/Minikarte (`PoiKind` `galeone`, `blockade`, `flotsam`, `worldboss`, `convoy`), Weltkarte (`WorldMapData.seaEvents/convoys/currents/cells`), Kontor-Hinweis bei Blockade.
- `tests/worldEvents.test.ts` (39 Tests, 665 insgesamt): Lebenszyklus über eine Stunde (höchstens 6, unter 4 nur beim Nachrücken, höchstens 30 s am Stück), Mindestabstand, Opt-In (Abstand, Zonen, nie im Gefecht gestartet), Wartezeiten je Platz und je Boss, kein Spawn-Spam, Ablaufen und Gefecht, Treibgut und Schatzkarten, Blockade (Preise ×2, Reise gesperrt, nach dem Durchbruch frei), Galeone (Route, Eskorte, entkommt), Determinismus und JSON-Rundlauf samt Laden, kaputte Daten, Spielstand 19; Konvois (Handel nur Überschuss → Bedarf, Routen um alle Inseln, **Navigation mit der echten KI-Lenkung und Fahrphysik bis ans Ziel ohne Küstenberührung**, Ankunft hebt `MarketState.stock` und senkt den Preis, Abfangen lässt den Hafen knapp, Beute mit Kriegsware an Grenzen, Verteidigung mit Lohn – und ohne, wenn man selbst auf den Konvoi schoss, Dauerlauf); Strömungen (elf Bänder in Ring 1 – 3 mit Freiraum zu allen Inseln, genau +35 % im Kern, nichts quer/gegen/außerhalb, die echte Fahrphysik erreicht das 1,35-fache Tempo, Raster gegen Rechnung über 3 000 Punkte); Wetterzellen (Abfrage, Ein-/Ausblenden, Gewitter/Nebel/Flaute, Mischung im `Weather` ohne Globalwechsel, Director-Dauerlauf); Weltbosse (Gefahr 4 – 5, nur Ring 4, Kampfzeiten, Anti-One-Shot für Boss und Spielerschiff, Siegel-Beute, Wartezeit nach dem Sieg); Architektur (alle Regelmodule ohne three.js, Zustand als reines JSON unter 60 KB, Vorwärmen und Teilschritt-Bau im Quelltext, Opt-In in der KI).
- **Bestehende Tests angepasst:** `save.test.ts` (die Welt im Spielstand hat jetzt `seaEvents`), `playerFleet.test.ts` (Spielstand-Version nicht mehr fest 18).
- **Im Browser geprüft** (Playwright, Entwicklungsserver, Ultra-Grafik, keine Konsolenfehler oder -warnungen): Start mit 11 Strömungen; nach 40 s 5 Ereignisse, 5 Konvois, 6 Wetterzellen, Logikschritt im Mittel 0,3 ms (99 % unter 0,9 ms). Bilder: Goldrakete aus 2,2 km als leuchtender Stern über dem Horizont, Schaumfäden auf dem Bernstein-Passat, Treibgut mit Möwen, Gewitterwirbel über Ryujin, Leviathan mit Körper, Kopf und Tentakeln, Schiffstafel mit „➤ Glutstrom +35 %“ und „🌫 Nebelbank“ (Sicht sinkt). Gemessen: Strömung im Kern ×1,350. **Auftauchen des Weltbosses: über rund 20 Bilder verteilt, schlimmstes Bild 22 ms** (vorher 115 ms in einem Bild; ein Schiffsmodell kostet am Stück 55 – 100 ms). 30 s Fahrt ohne Bild über 53 ms. Opt-In: Ryujin 500 m daneben fährt friedlich weiter, in 200 m greift er sofort an (Rammanlauf); die schlimmste Salve nahm 12,9 von erlaubten 18,9 Rumpfpunkten (Schaluppe), ein Riesentreffer auf den Boss nur 160 von höchstens 282. Leviathan taucht auf, greift an, der Spieler verlor gedeckelt. Markt: ein Konvoi Nebelhafen → Kiefernhafen hob den Vorrat an Marine-Ausrüstung 40 → 68; eine Blockade dort ergab Preisfaktor 2 und gesperrte Reise, nach ihrem Ende 1 und frei. Unterwegs gefunden und behoben: die Zone eines Weltbosses blieb an seinem Startpunkt stehen (er griff nach dem Weiterziehen nicht mehr an), die Warnringe des Leviathans waren nach dem Vorwärmen belegt (Absturz beim ersten Tentakelschlag), Schaumfäden sahen aus wie Fahrbahnmarkierungen, Wolkenwände wirkten im Dunst wie schwebende Rechtecke, die Leuchtrakete war aus der Ferne zu klein.
- **Abweichungen von der Vorgabe (bewusst):** (1) **Eine Schnellreise gibt es im Spiel noch nicht** (nur „Zurück zum Start“ in der Werkstatt). Die Sperre ist als Regel und Daten fertig (`travelLocked`, `Game.travelLocked`, Hinweise im Hafen und im Kontor) und greift, sobald die Schnellreise kommt (4.3D). (2) Der zufällige Wetterwechsel für die ganze Welt ist ersetzt; das **eigene Wetter von Nebelarchipel und Sturmgürtel** bleibt als Grundwetter, sonst verlören diese Regionen ihren Charakter. (3) Klabautermann und Ryujin sind Klasse 5 und 6 und gehen wie alle großen Schiffe nie unter: **kampfunfähig zählt als besiegt** (Belohnung sofort), Entern ist danach möglich. (4) „Tier 4–5“ der Schatz-Galeone ist als Panzerung und Ausbau 4 bis 5 umgesetzt; ihre Gegnerstufe folgt dem Meer (+2), damit Galeonen auch in Ring 2 erreichbar sind. (5) Die **bisherigen Zufallsbegegnungen** (Jäger, Patrouillen, Kopfgeldjäger, Grenz-Seeschlachten) bleiben, wie sie sind; nur das neue Ereignissystem folgt dem Opt-In-Prinzip. (6) Nur Ereignis-Schiffe entstehen in Teilschritten; gewöhnliche Zufalls-Feindschiffe werden weiter am Stück gebaut (50 – 110 ms, wie in 4.3.3).
- **Offen:** keine Messung auf einem echten Handy; Entern eines besiegten Weltboss-Schiffs und die Verteidigung eines Konvois sind nur in Tests und Teilschritten im Browser geprüft, nicht ganz durchgespielt; der Leviathan ist bewusst schlicht modelliert (Kugelkörper, ohne Konturen) – ein Blender-Modell wäre der nächste Schritt; gewöhnliche Zufalls-Feindschiffe sollten ebenfalls in Teilschritten entstehen.

## 4.3.3 – Phase 4.3B: offene Welt mit 10 400 m Radius, vier Meeres-Ringe, 24 Themen-Inseln, Blueprint-Start ohne Netze (24.11.2026, nur lokal)

**Was du siehst**
- **Die Welt ist 3,6-mal so groß.** Der spielbare Ozean reicht jetzt bis 10 400 m (vorher bis zur Sturmsee bei 5 450 m). Dahinter beginnt die Sturmsee, bei rund 10 600 m kommt kein Schiff weiter. Im Spiel gemessen (volles Tuch, Kurs nach außen ab 10 300 m): das Schiff blieb bei 10 505 m stehen, die Warnung „Unerforschte Sturmsee – Rückkehr empfohlen“ stand rot pulsierend oben.
- **Vier Meeres-Ringe** quer durch die fünf Kuchenstücke der Mächte:
  1. **Die Ruhige Innen-See** (bis 2 200 m, Gefahr 1): die Bernsteinsee um Ankerglück.
  2. **Archipel- und Handelsstraßen** (2 200 – 5 200 m, Gefahr 2 – 3): die bisherigen Ringmeere, die Grenzfestungen und die neuen Kolonien.
  3. **Der Riff- und Sturmgürtel** (5 200 – 8 200 m, Gefahr 3 – 4): Wachtürme, Schmugglerbuchten, Vulkanfelsen.
  4. **Die Äußeren Kaiser-Meere** (8 200 – 10 400 m, Gefahr 4 – 5): Korsaren- und Prunkfestungen, die fünf Endgame-Festungen (jetzt bei 9 500 m) und das Marine-Hauptquartier Weißwacht (9 700 m).
  Auf offener See steigt die Gegnerstufe ab Ring 3 mit dem Abstand bis Stufe 22 am Außenrand; in Ring 1 und 2 bleibt alles wie bisher.
- **24 neue Themen-Inseln**, jede mit eigener Siedlung (Kais, Lagerhäuser, Kräne, Werften, Plantagen, Weinberge, Minen, Gießereien, Batterien, Festungen, Leuchtfeuer, Schwarzmärkte, Perlendörfer, Ruinen), mindestens einem Steg zum Anlegen, Wegen vom Steg zu jedem Platz, eigenem Bewuchs und eigenem Markt:
  - **England:** Königshafen (Tee- und Handelskolonie), Kreideklippe (Marine-Werft und Tuch-Manufaktur auf weißem Kalkstein), Nebelriff (Wachturm-Atoll mit Leuchtfeuer), St.-Georgs-Kap (Küstenbatterie, Lager Stufe 16).
  - **Niederlande:** Gewürzinsel Banda (Terrassen-Plantage), Grachtenstadt Nieuw-Hoorn (Kontor mit zwei Kais), Sandbank-Atoll (Schmugglerhafen, Schwarzmarkt), Goldküste Oranje (Luxus- und Seidenkontor).
  - **Deutschland (Hanse):** Bernsteinküste (Kiefernwald- und Werftkolonie), Eisenfels (Erz- und Kanonenstahl-Mine), Nordsturmklippe (Granit-Vorposten, Lager Stufe 15), Donnergießerei (Artillerie-Gießerei).
  - **Frankreich:** Sonnenwein-Kap (Wein- und Seidenhafen), Korallenbucht (Perlen-Atoll), Fleur-Atoll (Parfüm- und Gewürzinsel), Bastion Lumière (weiße Prunkfestung, Lager Stufe 17).
  - **Kurogane:** Aschezahn (Schwefel- und Obsidian-Mine), Schattenbucht (Schwarzmarkt der Gesetzlosen), Drachenwirbel (Vulkanfelsen, Lager Stufe 15), Blutmond-Riff (Korsaren-Bastion, Lager Stufe 17).
  - **Unkartiert** (herrenlos, nur sichtbar auf der Weltkarte, wenn entdeckt): Flüsterlagune (versteckter Schmugglerhafen mit Schwarzmarkt), Versunkene Krone (Ruinen, Stufe 14), Knochenriff (Schatz-Atoll, Stufe 18), Sternenfall (Ruinen der alten Warte, Stufe 16).
- **Neue Insel-Looks:** Kreide (weißer Kalkstein, helles Gras), Atoll (Korallensand, Palmen, rosige Korallenblöcke), Weinland (goldenes Gras, Terrakotta-Fels); dazu Bewuchs-Paletten für Nordwald und Asche, damit auch Hanse- und Kurogane-Inseln Siedlungen tragen. Tore, Türme, Mauern, Kräne und Lagerhäuser der Themen-Inseln tragen die Farben ihrer Macht.
- **Schwarzmärkte** (Schattenbucht, Sandbank-Atoll, Flüsterlagune): keine Macht führt Aufsicht – kein Hafen-Tarif, keine Frachtkontrolle, keine Hafensperre; Waffenkisten und Pulver gibt es dort billig.
- **Der Start legt keine Inselnetze mehr an.** Beim Laden entstehen nur Daten (Blueprints) für alle 72 Inseln; der WorldStreamer baut danach nur die Inseln um den Startort (10 Inseln, zusammen rund 1,8 s im Ladebildschirm). Der JS-Speicher im Menü nach dem Laden: 66,5 MB (4.3.2: rund 113 MB im Spiel; im Spiel jetzt 94,5 MB) – trotz 24 Inseln mehr.
- **Horizont:** Inseln stehen bis 4 500 m als Silhouette am Horizont (Kamera-Fernebene 4 800 m). Am Heimatplatz sind das 38 Silhouetten, alle zusammen in **drei Zeichenaufrufen** (Silhouetten, Gischt, Feuer als eine Punktwolke).

**Technik (für Entwickler)**
- **Blueprint-Phase** (`world/islandBlueprint.ts`, rein, ohne three.js – ein Test verfolgt alle Importe): `buildBlueprints(defs, regions)` liefert je Insel Küste und Hügel (`islandForm`, dieselbe Zufallsfolge wie der Aufbau), Böschung, Relief, Kollisionsradius (`bound` = 1,9 · r) und Wasserlinie (`waterR`), Rasterzellen, Stege (`piersOf`: Siedlungen über `sitePiers`/`stegPlacement`, Außenposten-Häfen über `outpostPier`, Ankerglück über `townPier` – `world/settlement.ts` benutzt dieselbe Rechnung für die Bohlen), Markt (Profil und Gleichgewichtsvorrat, aus dem `marketAt` den `MarketState` beim ersten Besuch anlegt), Ring, Gefahr, Sektor, Besitz, `uncharted`. `walkOf`/`shapeOf` machen daraus die begehbare Insel und die Küstenform für das Wasser.
- **`SeaWorld`:** `prepareIslands()` im Konstruktor (nur Blueprints, `ground.islands`, `ground.piers`, Streamer-Einträge auf UNLOADED); `buildSteps()` legt Wasser und Bojen an und holt mit `forceSyncAround(HOME_SPAWN)` die Startumgebung. `islandStages(slot, first)`: `first = !slot.detailDone`; der erste vollständige Aufbau schreibt Hindernisse, Einebnungen und Wiesendecke in `slot.walk` und übergibt Feuerstellen, Schornsteine, Vulkane, Dorfmitte und Wachrunden erst am Ende an die Welt (ein abgebrochener Aufbau setzt alles zurück); spätere Aufbauten rechnen in eine Kopie. Häfen mit Siedlung bauen keinen Außenposten-Steg mehr; Vulkane nur auf Inseln ohne Siedlung (`isVolcanic`). Vor dem Tausch übersetzt `Renderer.warmObjectAsync` die Shader der Insel parallel (`SeaWorld.warmIsland`, höchstens 240 Teilschritte Wartezeit).
- **Welt:** `PLAYABLE_RADIUS` 10 400, `WORLD_RADIUS` 10 680, `EDGE_WALL` 10 600 (`data/world.ts`); Sturmsee `SOFT_WORLD_RADIUS` = 10 400, `HARD_WORLD_RADIUS` = 10 600, Gegenströmung bis 20 m/s. Ringe in `data/worldRings.ts` (`RINGS`, `ringAt`, `dangerTierAt`, `outerSeaLevel`); Gefahrenbänder in Metern `DANGER_BANDS_M` (`data/balanceConfig.ts`: 0 / 2 200 / 3 700 / 6 700 / 9 200 m), `dangerOfDistance(dist)` rechnet gegen den spielbaren Radius. Jede Insel trägt `ring` und `dangerTier`. `seaLevelAt` folgt ab 5 200 m `outerSeaLevel`. KI-Spawns und der Weltrand der KI-Lenkung nutzen den spielbaren Radius. Streaming-Schwellen `STREAM`: ACTIVE ≤ 1 100 / > 1 300 m, HORIZON ≤ 4 200 / > 4 500 m; `CAMERA_PLANES.far` 4 800; Brandungskarte 4096 × 4096 (5,5 m je Zelle).
- **Inseln:** `data/openWorld.ts` (`THEME_ISLANDS`: Lage als Winkel und Abstand, Größe, Art, Biom, Bauplätze; `themeSite` setzt die Siedlung aus 17 Bausteinen zusammen, Wege laufen vom Hafenplatz über die Inselmitte zu jedem Platz; `THEME_SITES` landen in `SITES`). Neue `IslandDef`-Felder `ring`, `dangerTier`, `uncharted`, `themePower`. Stile `kreide`, `atoll`, `weinland` (`styleKit`, `ROCK_TYPES`, Blumen, Häuser), Bewuchs-Paletten `nord`, `glut`, `kreide`, `atoll`, `weinland` (`vegetation.ts` `Biome`). `SiteDef.themed` lässt `buildSite` die Bauten in den Farben des Besitzers bauen.
- **Wirtschaft:** `ISLAND_PROFILES` (eigener Überschuss und Bedarf je Themen-Insel, zusätzlich zum Profil der Macht), `MarketProfile.blackMarket`; `Game.openHarbor` setzt in Schwarzmärkten keine Macht (`harborFid` null). Die Weltkarte zeigt unkartierte Inseln erst nach der Entdeckung, Flaschenpost-Schatzkarten führen nie zu ihnen.
- **Horizont:** `HorizonLayer` baut alle Silhouetten, Gischtbänder und Feuer in drei gemeinsame Geometrien (neu nur, wenn sich die Menge ändert); Feuer sind eine Punktwolke fester Bildgröße.
- `tests/openWorld.test.ts` (22 Tests, 626 insgesamt): Radius und Fläche, lückenlose Ringe mit ihren Gefahrenstufen, Streaming- und Kamera-Radien, Ring und Gefahr jeder Insel, Endgame-Festungen am Außenrand; Abstände (Wasserlinien aller 72 Inseln mindestens 80 m auseinander, Platzbedarf und 600 m Fahrwasser für die neuen, alles 100 m vor der Sturmsee, 700 m Abstand zu den Grenzlinien); 24 Inseln (vier je Macht, vier unkartiert, eindeutige Kennungen und Namen), Sektor und Besitz, vier Gefahrenstufen (2 bis 5), Lagerstufen, Markt (eigenes Profil, kein Gut zugleich erzeugt und gebraucht, `MarketState` = Gleichgewicht des Blueprints, Schwarzmärkte), Stege (Anfang am Strand, Ende im tiefen Wasser, über keiner Insel), Siedlungen auf Land ohne Überlappung, Wege auf der Insel; Blueprints ohne three.js (Import-Graph mit Gegenprobe), deterministisch, JSON-Rundlauf, ohne Hindernisse vor dem ersten Aufbau, `SeaWorld` legt beim Start keine Netze an; Sturm-Barriere 10 400 – 10 600 m mit der echten Fahrphysik.
- **Bestehende Tests angepasst** (bewusste Änderungen der Welt): Weltradius, `EDGE_WALL`, Gefahrenzonen in Metern (die Grenzfestungen liegen jetzt in Stufe 2), Stärke am Albion, Besitz der unkartierten Inseln, Themen-Inseln aus den Regeln der alten Ringmeere und Handgebauten Länder ausgenommen; die Streamer-Tests rechnen mit `STREAM` statt mit festen Zahlen.
- **Im Browser geprüft** (Playwright, Ultra-Grafik, Entwicklungsserver, keine Konsolenfehler): Start mit 72 Blueprints, 10 gebauten Inseln, 38 Silhouetten in 3 Zeichenaufrufen; alle 24 neuen Inseln einzeln angefahren und gebaut (Hindernisse 147 – 625, Einebnungen 1 – 19, Stege 1 – 3, 65 – 465 ms je Sofortaufbau); Fahrt 8 000 m durch Ring 2 und 3 (60 m/s): CPU je Bild im Mittel 2,8 ms, 99 % unter 6,7 ms, größter Streaming-Teilschritt 6,2 ms (23 von 2 888 über 2,5 ms); drei Runden über sechs neue Inseln ohne Leck (Texturen 498 konstant, Programme 425 → 426, Geometrien 854 – 864 je nach Schiffen in der Nähe, JS-Speicher 94,5 → 94,8 MB); Schwarzmarkt-Hafen ohne Macht; Sturm-Barriere hält bei 10 505 m.
- **Abweichungen von der Vorgabe (bewusst):** (1) Der Blueprint enthält beim Start Küste, Böschung, Kollisionsradius, Wasserlinie, Stege, Markt und Rasterzellen. Die **Hindernisse und Einebnungen unter einzelnen Häusern** entstehen erst beim ersten Aufbau einer Insel durch den Streamer und bleiben danach dauerhaft: ihre Maße hängen heute an Zufallszahlen *innerhalb* des Mesh-Codes der Bauwerke (`architecture.ts`, `islandDress.ts`), eine rein rechnerische Vorhersage hieße, alle Bauwerke in Plan und Netz zu trennen. Bis zum ersten Aufbau braucht sie niemand (Schiffe stoßen an Küste und Stege, die im Blueprint stehen; Figuren laufen nur auf aufgebauten Inseln). (2) Das Marine-Gefängnis heißt weiter **Weißwacht** statt „Impel Down“: der Name stammt aus einem bestehenden Anime, und das Projekt baut keine fremden Namen nach (CLAUDE.md, Abschnitt 1). (3) Zwei gewünschte Namen gab es schon (Sturmklippe in der Bernsteinsee, Donnerbucht im Sturmgürtel): die neuen Hanse-Inseln heißen **Nordsturmklippe** und **Donnergießerei**. (4) Ring 1 bekam keine neuen Inseln (die Bernsteinsee ist voll); die neuen Inseln liegen in den Ringen 2 bis 4 und den Gefahrenstufen 2 bis 5. (5) Die Bänder der Gefahr liegen in Metern fest; die Grenzfestungen der Marine stehen damit in Stufe 2, sind selbst aber Stufe 12 bis 16.
- **Offen:** keine Messung auf einem echten Handy; Raid-Wechsel an den verschobenen Endgame-Festungen nur über die Tests geprüft, nicht im Spiel durchgespielt; ein einzelner Shader wurde unterwegs einmal nachübersetzt (152 ms) und das Auftauchen von Feindschiffen kostet wie bisher bis 177 ms in einem Bild (nicht Teil des Streamings); Quests, Kopfgeld und Entdeckungs-Belohnungen kennen die neuen Inseln noch nicht (4.3C/4.3D); Grenz-Seeschlachten und Rückeroberungen laufen in den äußeren Ringen mit den bisherigen Regeln.

## 4.3.2 – Phase 4.3A: Chunk-Streaming der Inseln, drei Stufen mit Hysterese, Broadphase, natürlicher Sturm-Rand (24.11.2026, nur lokal)

**Was du siehst**
- **Inseln am Horizont.** Inseln, die noch zu weit für die volle Darstellung sind (bis 2 850 m), stehen als blaugraue Silhouette mit weißem Gischtband an der Küste am Horizont, frei vom Nebel (die Kamera-Fernebene reicht jetzt bis 3 200 m). Leuchttürme tragen einen Turm und ein Feuer, das auch am Tag glimmt; Häfen, Städte, Lager und Festungen leuchten ab der Dämmerung. Fährt man hin, wird die Silhouette erst gegen die volle Insel getauscht, wenn diese ganz bereitsteht – kein Aufpoppen.
- **Weniger Speicher, weniger Listen.** Es stehen nur noch die Inseln im Umkreis von 1 000 m mit ihren Netzen, Lichtern, Tieren und Instanz-Puffern da (Ankerglück bleibt immer). Die Welt hat 48 Inseln; am Heimatplatz stehen 9 voll, 11 bis 13 als Silhouette (zusammen 28 bis 33 Zeichenaufrufe), der Rest besteht nur noch aus Daten. Der JS-Speicher ist nach dem Laden 40 MB (26 %) kleiner (113 statt 154 MB, nach Speicherbereinigung gemessen).
- **Der Weltrand ist keine Wand mehr.** Ab 5 450 m (`SOFT_WORLD_RADIUS`) beginnt die Sturmsee: Gewitterwolken, Regen, Seegang und Blitze nehmen zu, der Wind dreht nach innen, oben erscheint die Warnung **„Unerforschte Sturmsee – Rückkehr empfohlen“** (bei starker Strömung rot und pulsierend), und eine Gegenströmung schiebt das Schiff zur Mitte. Bei 5 730 m (`HARD_WORLD_RADIUS`) ist sie mit 18 m/s stärker als jedes Schiff unter Segeln. Im Spiel gemessen (volles Tuch, Kurs nach außen): das Schiff verliert Fahrt (9,3 → 5,2 m/s) und bleibt bei rund 5 550 m stehen; ohne Segel treibt es zurück bis 5 450 m. Die frühere Meldung „Der Weltrand!“ ist weg.
- **Laden, Schnellreise und Rückkehr aus dem Raid** bauen alle Inseln im Umkreis von 1 000 m sofort fertig auf (`forceSyncAround`): am Heimatplatz dauert das rund 0,5 bis 0,7 s (9 Inseln), davor laufen Physik und Kollision nicht an.
- **Kleine Änderung am Bild:** Felsen und Palmen sitzen auf den Inseln etwas anders als vorher (jede Insel würfelt sie jetzt aus ihrer eigenen Kennung statt aus einer gemeinsamen Zufallsfolge; sonst hinge das Aussehen einer Insel davon ab, in welcher Reihenfolge sie gebaut wird).

**Technik (für Entwickler)**
- `world/worldGrid.ts` (rein, JSON-tauglich): `CHUNK_SIZE = 750`, `chunkKey(cx, cz)` = `"cx,cz"`, `SpatialGrid` (Scheiben in alle berührten Zellen, `query(x, z, radius, out)` allokiert nichts, genau Scheibe gegen Scheibe, aufsteigende Nummern, `toJSON`/`fromJSON`).
- **Broadphase** (`world/islandGround.ts`): `IslandGround.getNearbyIslands(x, z, queryRadius, out?)` und `getNearbyPiers(...)`. `islandAt`, `pushShip`, `shipClearance`, `height`, `pierNear` und damit `constrain` lesen nur noch die Nachbarn (je Schiffsabfrage höchstens 3 Inseln, im Mittel unter einer; Umkreis einer Insel = 1,9 × Küstenradius = die Grenze von `islandHeight`). Die Fühler der Lenkung (`SteerWorld.getNearbyPiers`), `NavalSystem.freeWater` (Ankern), `dockingSystem.shoreGap` und `SeaWorld.collidePiers` fragen dieselbe Broadphase; die Prüfpunkte in `pushShip` und `collidePiers` sind jetzt Konstanten statt einer neuen Liste je Aufruf. Nach Änderungen an `islands`/`piers` von außen (Raid) `ground.reindex()` bzw. `touchPiers()`.
- `world/worldStreamer.ts` (rein, ohne three.js): `WorldStreamer(host)` mit `StreamHost` (`showHorizon`, `hideHorizon`, `buildActive` = Iterator, `commitActive`, `disposeActive`); Stufen `UNLOADED/HORIZON_LOD/ACTIVE_HIGH`, Schwellen `STREAM` (2 600/2 850 m, 1 000/1 200 m), Hysterese `nextLevel`; Abstand = Küstenabstand (Mitte minus `r`) zum nächsten Interessenpunkt (`beginInterest`/`addInterest`: Spielerschiff, Fußfigur, Kamera, aktive Flottenschiffe); Kandidaten über das Raster; `update()` je Bild (Zeitbudget 2,5 ms, höchstens 24 Teilschritte, der Tausch steht allein in einem Bild, höchstens ein Abbau je Bild), `forceSyncAround(x, z)`, `forceActive(i)`, `snapshot()` (JSON), `stats`. Ankerglück ist `pinned`.
- `world/islandHorizon.ts`: `buildHorizonData` (rein: Silhouette aus Küste und Hügeln, 28 Küstenpunkte, Gischtband, Turm und Feuer je Inselart, unter 300 Eckpunkten) und `HorizonLayer` (drei geteilte Materialien, je Insel Silhouette + Gischt + höchstens ein Feuer-Sprite; `update` färbt aus dem Nebel; `warmUp`/`warmDone` übersetzen die Shader beim Laden vor).
- **`SeaWorld`:** `buildIslands` baut beim Laden jede Insel einmal ganz (legt alle Daten an und übersetzt alle Shader); `settleStreaming()` (ruft `Game.start` nach dem Vorübersetzen) bringt die Welt auf die Stufen. Der Inselbau ist ein Iterator `islandStages(slot, first)`: der erste Lauf schreibt die Daten (`slot.walk` mit Küste, Hindernissen, Einebnungen, Stegen, Feuerstellen, Dörfern, Patrouillen) in die Welt, jeder spätere rechnet in eine Kopie (`sink`) und wirft sie weg; die Welt behält ihre Daten, nur die Darstellung entsteht neu. 47 von 47 Neuaufbauten lieferten im Spiel dieselbe Zahl Hindernisse und Einebnungen wie der erste. `commitIsland` meldet Szene, Listen (`islandGroups`, `vegChunks`, `lamps`), Lichter (`glowHub` mit `owner = vis`, Träger), Tiere (`fauna.addIsland`), Schild und Besatzungs-Banner an, `disposeIsland` meldet alles ab (`glowHub.removeOwner`, `fauna.removeIsland`, `releaseNavForIsland`) und gibt den Baum mit einem `disposeObject` frei (nie Kinder vorher abhängen); geteilte Materialien, Vorlagen und die Sprite-Geometrie bleiben (`markShared`). Entdecken läuft über die Daten der Inseln (`slots`), nicht mehr über die Schilder. `setState` (Laden, Teleport, Schnellreise) und das Ende eines Raids (`ended`) rufen `forceSyncAround`; während eines Raids streamt nichts.
- **Teilschritte:** `islandTerrainSteps` (+ `refreshSteps`), `dressIslandSteps`, `buildSiteSteps`, `scatterSiteSteps`, `mergeByMaterialSteps`, `addOutlinesSteps` sind Iteratoren, die bisherigen Funktionen sind eine dünne Hülle darum (gleiche Zufallsfolge, gleiches Ergebnis). Messhilfe: `world.islandProfile = {}` sammelt die Zeit je Abschnitt (und die Zahl der Hindernisse für den Vergleich mit dem ersten Aufbau).
- **Sturm-Rand:** `world/stormEdge.ts` (rein): `SOFT_WORLD_RADIUS` = `WORLD_RADIUS − 350`, `HARD_WORLD_RADIUS` = `EDGE_WALL`, Stärke `edgeStrength` (weich an beiden Enden), `applyEdgeDrift` (Strömung bis 18 m/s, Widerstand, harte Kappe, NaN-fest), `clampToHardRadius` (nur diese Kappe gilt im Raid). `Weather.edgeStorm` zieht das Wetter zum Sturm, `Environment.edgeWind/edgeWindDir` drehen den Wind nach innen, `SeaWorld.edgeWarning` und `ui/edgeWarning.ts` zeigen die Warnung (`.hud-edge` in der oberen Mitte).
- **Kamera:** `CAMERA_PLANES.far` 1000 → 3200 (Himmelskuppel, Sonne und Meer liegen schon auf der Fernebene; die Himmelsschwelle der Nachbearbeitung `SKY_DEPTH` entspricht jetzt etwa 3 100 m, die Silhouetten liegen mit höchstens 2 850 m davor). `lighthouseBeam` meldet entfernte Strahlen beim Abbau ab (`onForget`).
- `tests/worldStreamer.test.ts` (47 Tests, 604 insgesamt): Zellen-Hashing und Schlüssel (negative Koordinaten, Grenzen, Umkehrung), Raster-JSON, `getNearbyIslands` gegen Brute-Force (3 000 Abfragen), zellenübergreifende Radien, höchstens 3 Nachbarn auf der echten Karte, `islandAt`/`shipClearance`/`height`/`pushShip` gegen die Rechnung ohne Raster (20 000 Punkte, 6 000 Fahrten), Stege, Inselwechsel im Raid, Hysterese (Schwellen, Zittern um 1 000, 1 200, 2 600 und 2 850 m), Streamer mit Protokoll-Host (Stufenfolge, Flottenschiff als Interessenpunkt, angeheftete Insel, Zeitbudget, Abbruch ohne Leck, Abbau höchstens eine Insel je Bild, `forceSyncAround` vollständig/stabil/Schnellreise/Brute-Force auf der echten Karte, Schnappschuss als JSON, Fehler im Aufbau), Silhouette (Dreiecke, Indizes, Küste, Feuer), Sturm-Rand mit der echten Fahrphysik (nie über die harte Grenze, auch mit Stoßfahrt; Treibenlassen trägt zurück; Umdrehen am Gleichgewicht fährt hinaus; keine NaN), Quelltext-Verdrahtung.
- **Im Browser geprüft** (Playwright, Max-Grafik, Entwicklungsserver): 28 Streams (vier Runden zu je sieben Orten, Teleport) ohne Leck: `renderer.info.memory` bei jedem Heimatbesuch gleich (682 Geometrien, 484 Texturen, 433 Programme), JS-Speicher nach Bereinigung 112,9 → 113,3 MB. Gesegelt (60 m/s, 2 000 m hin und zurück, 4 002 Bilder): Bildzeit im Mittel 3,9 ms, höchstens 12 ms; 487 Teilschritte, 3 Tauschbilder, 12 Teilschritte über 2,5 ms, größter 7,1 ms. An den Festungen im äußeren Band (Albion, Grenzwachen): Teilschritte bis 29 ms, Bilder bis 36 ms (beim allerersten Mal 205 ms durch kaltes JIT und neu übersetzte Shader). Neuaufbau einer Insel (warm): Sonnenstrand 145 Schritte/49 ms (größter 4,5 ms), Geisterriff 269/133 ms (7,1), Albion 604/422 ms (17,7), Weißwacht 748/511 ms (18), Grünmark 1 322/566 ms (16). Keine Konsolenfehler.
- **Abweichungen von der Vorgabe (bewusst):** (1) Der Abstand zählt von der Küste (Mitte minus `r`), nicht von der Mitte: große Inseln (Festland, Festungen mit r bis 380 m) werden so früher geladen. (2) Die Insel-Teilschritte sind nicht „3 bis 4 Bilder“: ein Gelände-, Bau- oder Verschmelzungsschritt am Stück kostet 10 bis 200 ms und passt nie in 2,5 ms; darum sind die Abschnitte Teilschritte von meist unter 1 ms (Mittel 0,1 bis 0,5 ms), der Streamer packt sie bis zum Zeitbudget in ein Bild, und der Tausch steht allein im letzten Bild. Ein kleiner Rest bleibt unteilbar (ein Bauwerk, das Verschmelzen eines großen Materials, ein Fels): 3 bis 12 Schritte je Insel über 2,5 ms, bis 4,5 ms (kleine Inseln), 7 ms (Bosse), 18 ms (Festungen). (3) Das Begehbarkeits-Netz (`NavGrid`, bis zu 580 000 Zellen) entsteht wie bisher beim ersten Gebrauch und nicht in Stufe 3: seine Rasterung ist ein einziger Rechenschritt von mehreren Dutzend Millisekunden; beim Abbau der Insel wird es freigegeben. (4) Beim Laden baut das Spiel noch jede Insel einmal ganz (wie bisher), weil Kollisionsdaten (Hindernisse, Einebnungen, Stege, Feuerstellen) heute nur zusammen mit den Netzen entstehen und weil so alle Shader vor dem Spiel übersetzt sind; danach streamt es. Eine reine Datenphase ohne Netze gehört in 4.3B. (5) Ankerglück (Stadt, Bewohner, Hafenmenüs) ist angeheftet. (6) `renderer.info.memory.geometries` ist mit und ohne Streaming gleich: ferne Inseln wurden schon vorher nicht gezeichnet und nie hochgeladen. Der Gewinn liegt im JS-Speicher (−40 MB) und in den Listen, die je Bild durchlaufen werden.
- **Offen:** keine Messung auf einem echten Handy; im Raid wurde der Wechsel (Raid-Start, Rückkehr) nur im Quelltext und mit dem Inselwechsel-Test geprüft, nicht im Spiel durchgespielt; nach einem Wechsel der Grafikstufe können Shader von Inseln, die gerade nicht stehen, beim nächsten Auftauchen einmal übersetzt werden (ein Ruckler pro Stufenwechsel); der Neuaufbau einer Festung dauert rund 0,4 bis 0,5 s, verteilt über Dutzende Bilder (gemessen im Entwicklungsserver); die Warnung „Unerforschte Sturmsee“ ist auf dem Handy nicht geprüft; der JS-Speicher wächst über 28 Streams um 0,4 MB (nicht untersucht).

## 4.3.1 – Phase 4.2D (Abschluss von Phase 4.2): Spieler-Flotte, Formation, Ankern, Flottenbefehle, Werft-Reiter „Flotte“ (24.11.2026, nur lokal)

**Was du siehst**
- **Die Begleitschiffe erscheinen nicht mehr von selbst.** Ab Rang 4 gibt es Plätze für Begleitschiffe: Rang 4 – 5 einen, Rang 6 – 7 zwei, ab Rang 8 drei (höchstens vier eigene Schiffe auf See). Besetzt werden sie mit **besessenen Schiffen** (jede Klasse gibt es einmal, das Flaggschiff fährt ohnehin mit): wer eine größere Klasse kauft, behält das bisherige Schiff als Begleiter. Ein Begleiter behält Ausbaustufen (Rumpf, Segel, Kanonen 1 – 5), Aussehen sowie Rumpf und Segel; sinkt er, wird das Wrack in den Hafen geschleppt (eingemottet, 25 % Rumpf) – ein Schiff geht nie verloren.
- **Werft und Hafen: Reiter „Flotte“.** Oben im Werft-Fenster (und im Hafenmenü) wechseln zwei Reiter zwischen Werft und Flotte; das Schiff bleibt im Bild. Die Flotte zeigt die Plätze (frei, belegt, gesperrt mit dem Rang, ab dem sie öffnen), jedes besessene Schiff mit Stufen, Rumpf und Segel, **Sold und Wartung je Tag schon vor dem Einsetzen** („Dein Sold steigt dann von 330 auf 360 Gold am Tag“), Einsetzen, Einmotten, Aktivieren, Reparieren (Werft-Preis mit Tarif), Aus der Flotte nehmen, „Zum Flaggschiff“ und die Wahl des Flottenbefehls. Eingemottete Schiffe kosten keinen Sold; der Kontor-Bildschirm führt die Flotte als eigene Zeile. Auf 390 px bricht alles um, nichts läuft seitlich über.
- **Formation:** Die aktiven Schiffe halten Plätze am Flaggschiff: Backbord-Flanke, Steuerbord-Flanke, Nachhut (Abstände wachsen mit den Schiffsgrößen: zwischen den Rümpfen bleiben immer mindestens 10 m Luft, vom Leviathan bis zur Schaluppe). Sie passen ihr Tempo sanft an, fahren die Kurve des Flaggschiffs mit (das Außenschiff schneller, das Innenschiff in der Kiellinie, wenn die Kurve enger ist als sein Seitenabstand) und rammen das Flaggschiff nie. Steht das Flaggschiff, rücken sie auf ihre Plätze und stehen dort still.
- **Ankern:** Legt das Flaggschiff am Steg an (`Ship.moored`), wirft es vor der Küste die Bordleiter aus oder geht der Spieler von Bord, ankert die Flotte: jedes Begleitschiff sucht den nächsten Punkt **mindestens 45 m außerhalb aller Stege, der Küste und anderer Schiffe**, fährt ihn mit sinkendem Tempo an und steht dort bei Tempo 0. Im Spiel gemessen am Hafen von Ankerglück: 56 m und 89 m Abstand, Tempo 0,00; beim Ablegen schließen sie mit allem Tuch wieder auf.
- **Flottenbefehle** (Tafel über der Schnellleiste, am Handy antippbar; Tasten **5 · 6 · 7**; am Gamepad **R3 + Kreuz**: links, oben, rechts; die Tastaturtasten sind in den Einstellungen umbelegbar, die Gamepad-Kombination ist fest):
  1. **Formation halten:** eskortieren, feuern nur zur Selbstverteidigung (Gegner bis 110 m).
  2. **Feuer frei / Angreifen:** greifen Gegner bis 360 m an (an der Leine von 520 m um das Flaggschiff), mit Breitseite und – ab Rumpf-Stufe 4 – Rammsporn; bei kritischem Schaden ziehen sie sich zurück.
  3. **Sammeln / Rückzug:** brechen jede Verfolgung ab und kehren mit allem Tuch zurück, ohne zu feuern.
  Im Spiel gemessen (zwei Jäger, 45 s): Formation 8 Salven und nie weiter als 44 m vom Flaggschiff; Angriff 36 Salven, 2 Rammstöße, bis 204 m Abstand; Sammeln keine Salve, 49 m.
- **Werft: „↺ Vorschau zurücksetzen“.** Eigener, per Tastatur und Gamepad fokussierbarer Knopf unter den Kamera-Knöpfen (auf dem Handy eine eigene mitlaufende Zeile, nie in der wischbaren Reihe): zeigt wieder das echte Schiff, ohne Mausbewegung; der Fokus bleibt auf dem Knopf. (Das war der offene Punkt aus 4.2.2.)
- **Gefechte auf Distanz:** Die Schussweite der KI ist auf 140 m begrenzt (vorher bis 156 m); jenseits von 115 m wächst die Streuung (Richtung und Entfernung der Kugel) linear bis zum Vierfachen bei 140 m. Das passt zum Gefechtsabstand von 65 – 130 m.
- **KI gegen KI:** Auch zwei Schiffe einer Grenz-Seeschlacht rammen sich jetzt, sobald eines Rumpf-Stufe 4 oder höher hat und im Rammangriff (`RAM_CHARGE`) fährt: beide Rümpfe nehmen Schaden, die Schiffe prallen auseinander. Im Spiel gemessen: neun Rammstöße in 150 s zwischen Fregatten und Galeonen (Stufe 4).
- **Kein Beschuss unter Freunden:** Kugeln von Begleitern treffen weder das Flaggschiff noch andere Begleiter (vorher konnten Begleiter, die quer über das Flaggschiff feuerten, es treffen).

**Technik (für Entwickler)**
- `data/playerFleet.ts` (rein, JSON-tauglich): `fleetSlots(rank)` (`FLEET_UNLOCK_RANKS = [4, 6, 8]`), `FleetState`/`FleetShipRecord` (`fleetShipId` = `fleet-<Klasse>`, `shipClass`, `evo`, `look`, `hp`, `sailHp`, `status` `active`/`docked`), `cleanFleet` (nur besessene Klassen außer dem Flaggschiff, einmal je Klasse, Ausbaustufen aus `ship.evo` als eine Quelle, nie mehr aktive Schiffe als Plätze), Regeln `assignShip/activateShip/dockShip/releaseShip/towShip`, Sold `shipUpkeepDaily/fleetShipUpkeep/fleetUpkeepList`, Befehle `FLEET_ORDERS`, Formation `formationOffset/formationPoint/formationSlotOf/escortSpeed/slotSpeed`. Alle Maße wachsen mit L und W beider Schiffe.
- **Spielstand 18** (`core/save/types.ts`, `migrations.ts`): `fleet?: FleetState`; Migration 17 → 18 legt eine leere Flotte an (die alten Begleiter waren nie gespeichert); `migrateSave` bereinigt die Flotte bei **jedem** Laden und Import.
- **Unterhalt:** `UpkeepInput.fleet` und `Upkeep.fleet` in `core/economyEngine.ts` (nur aktive Schiffe; `shipUpkeepDaily` ist dieselbe Rechnung wie beim Flaggschiff, ein Test hält beide gleich). `Game.fleet*`-Methoden verwalten (Einsetzen, Einmotten, Aktivieren, Aus der Flotte, Reparieren, `fleetView()` für die Anzeige, `setFleetOrder`, `syncFleet`, `syncFleetState` vor dem Speichern, `onFleetLost`). Beim Wechsel des Flaggschiffs auf ein Flottenschiff verlässt es die Flotte und bringt seinen Rumpf mit. `ownEscortsForRank` ist entfernt: im Raid zählen die aktiven Flottenschiffe als eigene Begleiter, Söldner (`raidEscorts`) kommen darüber hinaus als allgemeine Begleiter.
- **Seewelt** (`naval/naval.ts`): `setFleet(records, order, reset)`, `ensureFleet()` (statt `ensureCompanions`: Flottenschiffe laufen auf ihrem Platz aus, bei festgemachtem Flaggschiff gleich mit 45 m Abstand; Nachzügler jenseits von 700 m werden auf ihren Platz gesetzt), `aiFleet` (Ankern, Befehle, Formation), `fleetFoe`, `duelFire` (aus dem Duell-Zweig herausgezogen), `updateFlagMotion` (Drehrate des Flaggschiffs, geglättet), `NavalHooks.fleetLost`, `fleetAnchored` (setzt `SeaWorld` je Bild aus `ship.moored`, `docking.ladderId`, `mode !== 'sail'`). `EnemyShip.fleetId`; Flottenschiffe sind nicht „mutig“ (sie ziehen sich bei < 22 % zurück). Freund-Menge `friendly` filtert Beschuss unter Freunden.
- **Lenkung** (`naval/shipSteering.ts`): `escort` (Formation; nahe am Platz parallel zum Flaggschiff, weit weg `seekPoint`; Platz achteraus: nie kehrtmachen, bremsen; Flaggschiff steht: `park`), `anchor` (`findAnchor`: Ringe von 20 – 440 m, 16 Richtungen, mit 10 m Reserve, Freiraum gegen Küste, Stege, Weltrand und Schiffe), `park` (kritisch gedämpfter Anflug: Tempo = ¼ der Verzögerung des Schiffs mal Abstand; Halten ab 8 m, Lösen ab 14 m), `sailForSpeed`, `aiSpreadK`, `fireRangeOf` (gedeckelt). `AiNavState` um `anchorSet/X/Z/Wx/Wz/anchorHeld` erweitert, `SteerCommand.hold`.
- **Rammen KI gegen KI:** `aiMayRam` in `naval/ramming.ts` (rein), Schleife in `updateRamming` über `battleFoe`; `canRam` gilt für Schlachtschiffe nur im Duell gegen ein anderes Schlachtschiff (auf den Spieler zielende Schlachtschiffe rammen nicht: dort fehlt die Auswertung).
- **Eingabe** (`data/actions.ts`, `core/input/input.ts`): Aktionen `fleetHold/fleetAttack/fleetRally` (Tasten 5/6/7, Gruppe „Flottenbefehle (See)“), Gamepad-Kombination über `PAD_CHORDS` und `padActionDown` (rein, getestet): R3 gehalten + Kreuz; solange R3 gehalten wird, zählt das Kreuz nicht einzeln. Alle Controller-Tasten sind belegt, darum die Kombination.
- **Oberfläche:** `Hud.setFleet/onFleetOrder` (Tafel `.hud-fleet` neben `.hud-cmds`, geteilte Stile), `Menus.showFleet/yardTabs`, `pvreset`-Knopf mit `nextFocus` (eine Ansicht, die sich selbst neu zeichnet, behält den Fokus), `.yard-bar` (mitlaufender Rahmen für Kamera-Knöpfe und Reset), Stile in `ui/css/yard.css` und `hud.css`.
- **Während der Abnahme gefundene und behobene Fehler:** (1) Auf einer Kurve nach Steuerbord lag der Steuerbord-Platz des Linienschiffs (55 m) jenseits des Drehpunkts des Flaggschiffs (Radius ≈ 50 m): der Platz lief rückwärts, das Schiff schnitt quer vor das Flaggschiff (Rümpfe überlappten um 12 m; das Bug-Kegel-Kriterium merkte es nicht, darum misst der Test Rumpf-Kapseln). Jetzt fällt das Innenschiff in die Kiellinie, und das Wunschtempo folgt der Bahn des Platzes. (2) Ein Platz weit achteraus führte zur Kehrtwende statt zum Bremsen. (3) Bei stehendem Flaggschiff umkreisten die Begleiter ihren Platz in 30 – 57 m Abstand (sie steuerten nur „parallel“). (4) Das Ankern rollte große Schiffe 12 m über den Ankerplatz hinaus (träge Verzögerung) und löste Schleifen aus. (5) Der Fokus sprang nach „Vorschau zurücksetzen“ auf den ersten Knopf. (6) Auf dem Handy lag der Reset-Knopf außerhalb der wischbaren Reihe.
- `tests/playerFleet.test.ts` (42 Tests, 557 insgesamt): Plätze nach Rang, Regeln, Spielstand (Migration, Bereinigung, JSON-Rundlauf), Sold (gleiche Rechnung wie beim Flaggschiff, nur aktive zahlen, Zahltag), Formation (Abstände aller Klassenpaare, Weltkoordinaten, Wunschtempo), Fahrt mit der echten Physik (Geradeaus, Kurve nach rechts und links, ein bis drei Begleiter, Rumpf-Kapseln, Platzgenauigkeit, kein Kreisen, stehendes Flaggschiff, Sammeln), Ankern an Steg und Küste für alle sieben Klassen (≥ 45 m, Tempo 0, ohne Berührung), KI gegen KI (`aiMayRam`, Gegenstoß, Abprall, Pause), Streuung und Schussweite, Gamepad-Kombination, Quelltext-Verdrahtung.
- **Im Browser geprüft** (Playwright, Max-Grafik, `http://localhost:5174/`, keine Konsolenfehler): Werft-Reiter, Flotte (leer, zwei Schiffe, Sold), Reset-Knopf per Tastatur (Tab, Enter; Vorschau weg, Fokus bleibt) bei 1440 × 900 und 390 × 844 ohne seitliches Überlaufen; Auslaufen mit zwei Begleitern (Formation, Kurve, Stopp; Rümpfe nie näher als 12 m), die drei Befehle gegen zwei Jäger, Anlegen am Steg von Ankerglück und Ablegen, Grenz-Seeschlacht mit Flotte in der Nähe.
- **Offen:** keine Messung auf einem echten Handy; Ankern vor einer Küste (Bordleiter) nur über dieselbe Bedingung (`ladderId`) geprüft, nicht mit ausgeworfener Leiter im Spiel; Begleiter lassen sich nur über „Zum Flaggschiff“ ausbauen (der Ausbau wirkt auf das Flaggschiff); ein Kauf als Begleiter ohne Flaggschiff-Wechsel fehlt; das Kommando in einer Raid-Instanz wurde nicht im Spiel durchgespielt.

## 4.3.0 – Schiffs-KI: vorausschauende Lenkung und Seekampf-Zustandsmaschine (24.11.2026, nur lokal)

**Was du siehst**
- **KI-Schiffe kreisen nicht mehr.** Liegt ein Ziel innerhalb des Wendekreises (Wegpunkte, Formationsplatz der Begleiter, Rückzug), rechnet das Schiff den echten Wendekreis aus (Fahrt ÷ größte Drehrate, abhängig von Klasse, Segelstufe und Segelzustand) und refft die Segel auf 25 – 45 %, bis der Kreis klein genug ist. Gemessen im Prüfaufbau (Ziel in der Mitte des Vollruder-Kreises): die alte Lenkung fuhr gut zwei Runden (4,1 – 4,2 π Kursänderung, 28 – 63 s), die neue braucht 1,2 – 1,3 π und ist dreimal so schnell da.
- **Küsten, Stege und andere Schiffe:** fünf Fühler (0°, ±22°, ±52°) von der Bugspitze aus; die Reichweite wächst mit Schiffslänge und Tempo und ist nie kürzer als der Weg, den das Schiff zum Wegdrehen braucht. Bei knapper Passage nimmt das Schiff rechtzeitig Fahrt heraus. Ein Hindernis voraus wird immer auf derselben Seite umfahren (kein Zaudern vor einem Steg); in einer Bucht oder Sackgasse dreht das Schiff mit wenig Fahrt zum offenen Wasser. Die alte Regel „Insel voraus → immer Vollruder nach rechts“ ist entfernt.
- **Seekampf mit festen Manövern** (jedes mindestens 4 – 6 s, deterministisch je Schiff und Wechsel):
  - **Anmarsch** (`APPROACH`): Abfangkurs unter Berücksichtigung von Wind und Fahrt (Rückenwind trägt weiter, Gegenwind bremst), bleibt auf Gefechtsabstand vor dem Ziel.
  - **Breitseiten-Duell** (`BROADSIDE_ORBIT`): Parallelkurs auf Kanonenreichweite, **65 m (Schaluppe) bis 130 m (Leviathan)**; die Schussweite liegt 20 % darüber. Ein fahrendes Ziel wird begleitet. Die Seite wechselt nur, wenn die eigene Seite noch über 2 s nachlädt und die andere feuerbereit ist.
  - **Rammangriff** (`RAM_CHARGE`): nur Schiffe mit Rammsporn (Rumpf-Stufe ≥ 4), mit mindestens 45 % Rumpf, Bugwinkel unter 35° zum Abfangpunkt, hoher Fahrt und einem Ziel, das der Wendekreis noch hergibt. Wer kreist, nimmt nach 10 s Anlauf, 18 s Pause nach jedem Stoß. Im Spiel gemessen: Rumpf-Stufe 5 rammte den Spieler dreimal in 90 s (Rumpf-Stufe 1 – 3 rammt laut Tests nie).
  - **Rückzug** (`DISENGAGE`): unter 22 % Rumpf oder Segel dreht das Schiff sofort ab (auch innerhalb der Haltezeit) und nutzt das ganze verbleibende Tuch; Wiederangriff erst ab 30 %. Mutige Schiffe fliehen nie (Legenden, Wachschiffe und Rückeroberungsflotten, Begleiter, Geisterschiffe, Übungsschiff). Händler fliehen mit demselben Manöver.
- **Anderes Verhalten, das du bemerken wirst:** feindliche Schiffe schießen aus bis zu 1,2 × Gefechtsabstand, höchstens 140 m (vorher 52 – 88 m, jetzt 78 – 140 m; jenseits von 115 m wächst ihre Streuung, siehe 4.3.1); die Kanonen laden je Seite nach (vorher eine gemeinsame Uhr bei Feinden gegen den Spieler); schwer angeschlagene Gegner (unter 22 %) laufen davon, statt bis zuletzt zu kämpfen.

**Technik (für Entwickler)**
- `naval/shipMotion.ts` (rein): **die eine Quelle der Fahrphysik** – `stepMotion` (Tempo, Ruder, Drehgeschwindigkeit, Abdrift), `maxYawRate`, `turnRadius`, `windSpeedK`. `Ship.steer` ruft sie auf (Rechenreihenfolge unverändert; `tests/shipSteering.test.ts` prüft Zeile für Zeile gegen die frühere Rechnung), die KI rechnet damit den Wendekreis, die Tests fahren dieselbe Physik.
- `naval/shipSteering.ts` (rein, ohne three.js, ohne `Math.random`, ohne `new Vector3`): `PredictiveMaritimeSteering` mit `cruise(…)` (Fahrt zu einem Ort) und `fight(…)` (Gefecht gegen ein Ziel); Arbeitsobjekte `SteerSelf`/`SteerTarget`/`SteerCommand` werden je Schiff gefüllt und wiederverwendet. Alle Stellschrauben in `STEER`. Hilfen: `arriveRadius` (mindestens das 2,3fache des engsten Wendekreises: gerefft ist jedes Ziel jenseits davon erreichbar), `interceptPoint` (Abfangpunkt mit Wind, drei Iterationen), `ramWindow`/`ramEligible`, `standoffOf`/`fireRangeOf`, `noteRam`, `resetGoal`, `reachableGoal`/`pathClear` (Fahrtziel auf freie Strecke drehen).
- **MMO-tauglicher Zustand:** `AiNavState` (`aiState`, `stateLockTimer`, `desiredCourse`, `desiredSailFrac`, `targetShipId`, dazu Breitseite, Ausweichseite, Fühlerwerte …) ist reine JSON-Daten, hängt als `EnemyShip.nav` am Schiff und nie am Netz; `tests/shipSteering.test.ts` prüft den JSON-Rundlauf. Zufall nur über `hash01(seed, n)` aus der Schiffs-Kennung: gleiche Eingabe, gleiche Fahrt (bit-genau geprüft).
- **Keine Zuweisungen je Bild:** Fühler schreiben in `nav.rays` (feste Liste), Hindernisse in einen wachsenden Pool (`addObstacle`), Ausgabe in ein festes `SteerCommand`; die Fühler messen höchstens alle 0,1 s. Gemessen im Spiel mit sechs KI-Schiffen: 0,31 ms je Spielschritt insgesamt.
- `Ship.aiSail` (neu): stufenloses Segel der KI. Anders als `throttle` wirkt der Wind weiter auf das Tempo, die alten Fahrstufen bleiben für alles andere.
- `IslandGround.shipClearance(x, z, W, reach)` (neu): Abstand zur Kontaktgrenze der Inseln, exakt so wie `pushShip` sie sieht (Küste samt Böschung); `pushShip` bleibt die letzte Sicherung.
- `NavalSystem.ai` ist neu aufgebaut: Zielwahl und Schadensformeln unverändert; Steuern, Segel und Zustand kommen aus der Lenkung; `registerObstacles()` trägt vor jedem Durchlauf alle lebenden Schiffe samt Fahrt ein; `tryRam` meldet Treffer über `noteRam`. Die Felder `EnemyShip.orbit` und `EnemyShip.reload` entfallen (Nachladen je Seite über `Ship.reloadL/R`).
- **Abweichungen von der Vorgabe (bewusst):** Das Feld heißt `ship.evo.hullTier` (nicht `evo.hull`); Rammsporn-Schwelle ist `RAM_MIN_TIER` (4). Eine Tiefenkarte gibt es nicht: „Wassertiefe“ ist die Strandböschung der Inseln. „Berths“ gibt es nur als Liegeplätze am Steg; die Fühler prüfen die Stege (`ground.piers`) samt Schiffen am Liegeplatz. Rammen zwischen zwei KI-Schiffen einer Seeschlacht kam erst in 4.3.1 dazu (hier war `canRam` für sie noch aus).
- **Während der Arbeit gefundene und behobene Fehler der neuen Lenkung:** (1) die Ausweichseite sprang vor einem Steg alle paar Sekunden um, das Schiff fuhr mittendurch; (2) in einer V-förmigen Bucht lagen alle Fühler im Hindernis und das Schiff scheuerte mit Vollruder; (3) beim Rückzug mit dem Ziel voraus überstimmte das Ausweichen die Kehrtwende (Ausweichen mischt sich jetzt nach dem Hindernisgrad **in Zielrichtung**); (4) im Nahbereich lag das Anmarsch-Ziel auf dem eigenen Schiff; (5) beim Anlauf wurde das Ziel als Hindernis gesehen; (6) ein Anlauf aus dem Umkreisen endete nach der Haltezeit, bevor der Bug herumkam (jetzt bis 11 s).
- `tests/shipSteering.test.ts` (41 Tests, 515 insgesamt): Physik gegen die alte Rechnung, Wendekreis (vorhergesagt gegen gefahren), kein Kreisen (alt gegen neu, alle sieben Klassen, fünf Winkel, beide Seiten), Reffen ohne Flattern, Fühler (Reichweite, Insel, Inselkette mit Buchten, Steg, kreuzendes Schiff, Weltrand), Gefechtsabstand je Klasse, Parallelkurs, Mindest-Haltezeit, Rudder ohne Flattern, Seitenwechsel, Rückzug und Erholung, `RAM_CHARGE` nur ab Rumpf-Stufe 4 (Fenster und jede Einzelbedingung, im Gefecht für alle Klassen und Stufen 1 – 5), Anlauf aus dem Umkreisen, Abfangkurs mit Wind, JSON-Zustand, Determinismus, keine Zuweisungen, Quelltext-Prüfung.
- **Im Browser geprüft** (Playwright, echte Seewelt, ohne Konsolenfehler): Jäger gehen `APPROACH → BROADSIDE_ORBIT` auf 60 – 80 m (Brigg: Gefechtsabstand 76 m); ein auf 15 % Rumpf gesetzter Jäger floh über 46 s von 65 m auf über 320 m; Rumpf-Stufe 5 rammte dreimal, die Zustände wechselten nach dem Stoß (`noteRam`) sofort ins Umkreisen.
- **Offen:** keine Messung auf einem echten Handy; kein Spieltest mit Seeschlacht zwischen zwei Mächten (die Lenkung läuft dort über denselben Weg, ist aber nur im Prüfaufbau getestet); die Sicht-Reichweiten der Gegner (`sight`) und die Schadenswerte wurden nicht angefasst, die längere Schussweite (bis 140 m) sollte beim Spielen beobachtet werden.

## 4.2.2 – Phase 4.2C (Abschluss von Phase 4.2): 3D-Werft-Vorschau, Kamera-Perspektiven, Ausbau der KI-Flotten (24.11.2026, nur lokal)

**Was du siehst**
- **Live-3D-Vorschau in der Werft:** Wer eine Stufe (I – V) eines Zweigs (Rumpf, Segel, Kanonen) oder eine andere Schiffsklasse ansieht, sieht das Schiff sofort in diesem Zustand auf dem Meer. Mit der Maus (oder dem Fokus per Tastatur und Gamepad) genügt Darüberfahren, auf dem Handy tippt man die Stufe an; ein zweiter Tipp schaltet die Vorschau wieder aus. Beim Schließen der Werft steht wieder das eigene Schiff da, im Besitz ändert sich nichts, bevor man ausbaut.
- **Kamera-Knöpfe:** Gesamtansicht, Bug & Rammsporn, Segel & Takelage, Breitseite & Kanonen; die Kamera schwenkt weich auf den Bereich und passt Abstand und Ausschnitt an die Klasse an (Schaluppe bis Leviathan). Das Schiff steht im freien Teil des Bildes: neben dem Fenster (Querformat) bzw. über dem Blatt (Hochformat, Handy).
- **Werft-Fenster 3.0:** Je Zweig Stufenknöpfe I – V (besessen, nächste, ferne), Vorher → Nachher-Vergleich (Rumpf-HP, Panzerung, Rammsporn, Rammschaden und Eigenschaden; Segel-HP, Tempo, Wendigkeit, besser am Wind; aktive Kanonen, Schaden, Nachladen, Durchschlag, Drehbassen; täglicher Sold), alle Kosten bis zur gewählten Stufe (Gold mit Hafen-Tarif, Material aus dem Frachtraum, Boss-Siegel und Splitter, offene Rang- und Ansehen-Voraussetzungen; Fehlendes ist rot) und beim Klassenwechsel der Preis, der Rang und die **Inzahlungnahme** (50 % des Goldwerts der Ausbauten). Auf 390 px Breite bricht alles um, nichts läuft seitlich über.
- **KI-Flotten:** Küstenpatrouillen, Rookie-Piraten und kleine Händler fahren geflickte Schiffe der Stufe 1 – 2; Sektor-Kriegsschiffe, Konvoi-Eskorten und Grenz-Ereignisse (Seeschlachten, Geisterschiffe) Stufe 3 – 4; Raid-Verteidigungsflotten, Rückeroberungsflotten und die Legenden der Rangliste Stufe 5 (gepanzerte Prunkschiffe mit Rammsporn und Drehbassen).

**Technik (für Entwickler)**
- `data/shipEvolution.ts`: `aiEvolution(kind, danger)` (rein, deterministisch, kein Zufall): Art `rookie | haendler | patrouille | jaeger | eskorte | grenze | raid | flaggschiff` plus Gefahrenstufe `dangerOfLevel(level)` ergibt feste Bänder (1 – 2, 3 – 4, 5) mit Betonung je Art (Jäger Kanonen, Patrouille Rumpf, Händler Segel); NaN und Unsinn werden auf Gefahr 1 begrenzt. Alle Bausteine in `naval/naval.ts` (`spawnEnemy`, Raid-Wachschiffe und Rückeroberungsflotten, Grenzfestungen, Seeschlachten, Marine-Streifen, Legenden, Geisterschiff, Übungsschiff) rufen sie auf; `tests/yardPreview.test.ts` prüft Bänder, Monotonie und dass `naval.ts` nirgends mehr `evolutionOfTier(dangerOfLevel(…))` benutzt.
- `data/yardPreview.ts` (rein): `evoCompareRows`, `classCompareRows`, `evoPlan` (Gesamtkosten über alle Stufen dazwischen), `withTier`, Wahl-Kennungen `parsePick/pickId/samePick` (`evo|hull|3`, `cls|2`). `Game.evoPreviewInfo/classPreviewInfo` ergänzen Tarif (`yardK`), Tore (`evoGate(branch, step)`), Frachtraum, Siegel-Börse und den Sold (`upkeepOf` mit der Vorschau-Stufe); `Game.previewEvo(pick)` ändert nie den Spielstand.
- **Vorschau-Schiff:** `SeaWorld.previewShip(tier, evo)` baut ein zweites `Ship` (ohne Lichter) an der Stelle des eigenen; das echte Modell wird über `Ship.setPreviewHidden(true)` nur **netzweise** unsichtbar (Gruppe und PointLights bleiben unberührt, damit sich die Lichtzahl nie ändert; Matrizen laufen weiter, Gangway und Taue am Steg halten ihren Anschluss; Flammen werden ab- und wieder angemeldet). `clearShipPreview()` baut das Vorschau-Schiff mit `dispose()` ab; `Game` ruft es vor jeder echten Änderung (`evoUpgrade`, `shipyardSelect`, `shipyardLook`). `Menus.open` ruft beim Verlassen der Werft `leaveYard()` (Auswahl vergessen, Kamera frei, Vorschau weg).
- **Werft-Kamera:** `SeaWorld.beginYard/endYard/setYardView` und `yardCamera` (Maße aus Länge und Masthöhe der gezeigten Klasse, Ziel und Abstand je Ansicht weich nachgeführt, `camera.setViewOffset` verschiebt das Bild aus dem Fenster; `endYard` ruft `clearViewOffset`). In der Werft gilt sie vor der Fuß- und Segelkamera. Layout in `ui/css/yard.css` (`.screen.yard`: Fenster rechts, im Hochformat Blatt unten, Kamera-Knöpfe kleben oben).
- **Gemessen im Browser (Playwright, Max-Grafik):** 120 Vorschauen in 40 Werft-Besuchen: Geometrien und Szenen-Kinder gleich, Heap +1,5 MB, nach dem Schließen alle 82 Netze des echten Schiffs wieder sichtbar und die Kamera ohne Bildverschiebung. Alle sieben Klassen Stufe 1 gegen Stufe 5 angesehen (Brigg, Korvette, Fregatte, Linienschiff in dieser Runde; Schaluppe, Galeone, Leviathan in 4.2.1). Ramm-Aufprall und Drehbassen-Feuer im Gefecht aufgenommen. Desktop 1440 × 900 und Handy 390 × 844 ohne seitliches Überlaufen.
- `npm run build` läuft fehlerfrei (Hinweis zur Chunk-Größe bestand schon). 474 Tests.
- **Offen:** Messung auf einem echten Handy; Gamepad-Auswahl der Stufen nur über den Fokus (kein eigener Knopf für „Vorschau aus“).

## 4.2.1 – Phase 4.2B: Schiffs-Evolution sichtbar, Ramm-Abprall, Drehbassen mit Feuer (24.11.2026, nur lokal)

**Was du siehst**
- **Rumpf:** Stufe 1 ausgeblichenes Holz mit Flickbrettern in abweichenden Holztönen (links und rechts verschieden), schlichte Reling, kein Sporn. Stufe 2 – 3 dunkleres, geöltes Hartholz, schwarze Eisenbänder mit Nieten, verstärktes Schanzkleid, Messingbeschläge. Stufe 4 – 5 Mahagoni und Ebenholz, Panzerplatten an Wasserlinie und Breitseite (Stufe 4 geschmiedeter Stahl, Stufe 5 geschwärzt mit Gold), Heckgalerie mit mehreren Fenstern und Hecklaternen und ein Rammsporn unter dem Bugspriet, der die gewählte Galionsfigur nicht verdeckt. Die gewählte Rumpffarbe bleibt als Grundton erkennbar.
- **Segel:** Stufe 1 nur 72 % Fläche, grobes geflicktes Tuch mit ausgefransten Säumen und wenig Takelage; Stufe 2 – 3 volle Fläche, sauberes Tuch, zusätzliche Vorsegel am Bugspriet, straffe Wanten; Stufe 4 – 5 Bramsegel über den Hauptrahen, Besansegel am Heck, verstärkte Nähte mit Goldbordüre (Stufe 5 doppelt), straffe Silhouette.
- **Kanonen:** Stufe 1 die Hälfte der Pforten mit gekreuzten Brettern vernagelt, offene Pforten mit kurzen rostigen Rohren; Stufe 2 – 3 Pfortendeckel und volle Bronze-/Eisenkanonen (Stufe 2: 75 % der Pforten, ab 3 alle); Stufe 4 – 5 lange schwere Rohre (polierte Bronze, Stufe 5 schwarzer Gussstahl mit Goldring) und **Deck-Drehbassen** auf Drehgestellen an der Reling. Die Drehbassen schwenken auf das Ziel, feuern mit Mündungsfeuer, Pulverdampf und glühender Leuchtspur.
- **Rammen:** Beim Aufprall werden die Hüllen auseinandergeschoben, das Zielschiff wird seitlich weggedrückt und der Rammer prallt zurück; der Stoß klingt in etwa einer Sekunde ab. Schiffe gleiten nicht mehr durcheinander hindurch.
- Ausbau in der Werft wirkt sofort: das Modell wird live neu gebaut (Deck, Steuerrad und Gangway bleiben an ihrem Platz, auch am Steg).

**Technik (für Entwickler)**
- **Plan und Geometrie getrennt:** `data/shipVisuals.ts` (rein, ohne three.js, deterministisch über `seeded`) macht aus `(Klasse, ship.evo)` alle Zahlen und Lagen (`shipVisual`, `hullPatches`, `ironStations`, `beltPlates`, `pilasterPlates`, `lowerOpenIndices`, `pickSwivelZ`, `tierHullColor`); `entities/ship/shipEvoParts.ts` setzt sie in Geometrie um (Flicken, Eisenwerk, Gürtel, Sporn, vernagelte Pforten, Deckel, Goldringe, Drehbassen). `buildShip(c, look, hero, evo)` bekommt die Stufen als vierten Parameter; alle Maße sind Anteile von L, W und Deckshöhe, damit sie auf der Schaluppe (18 m) wie auf dem Leviathan (74 m) sitzen.
- **Begehbarkeit unverändert:** Anbauten liegen auf der Außenhaut oder der Reling-Oberkante und fügen weder `blockers` noch `railParts` hinzu; Decksgrenzen, Zugänge (`deckGates`), Steuerrad und Achterdeck sind für alle 125 Stufen-Kombinationen identisch (im Browser für alle sieben Klassen geprüft). Drehbassen halten 1,25 m Abstand zu den drei Gangway-Zugängen und zu Deck-Kanonen.
- **Live-Umbau ohne Leck:** `Ship.rebuildShipMesh()`, `Ship.visualStale` (Vergleich `model.evoKey` mit `visualKey(evo)`); `Game.applyPower` setzt zuerst `setEvolution`, dann baut `SeaWorld.setShip` einmal neu (Docking zurücksetzen, Steuer und Deck neu binden, am Steg neu festmachen). 160 Umbauten in Folge: Geometrien, Szenen-Netze und Heap unverändert (+0,8 MB). KI-Schiffe bekommen ihre Stufe schon im Konstruktor (`evolutionOfTier(dangerOfLevel(level))`), also kein Doppelbau.
- **Ramm-Abprall:** `ramContact` liefert zusätzlich Außennormale und Eindringtiefe, `ramImpulse(contact, massA, massB)` (rein) verteilt Trennung nach Massen und gibt Abprallgeschwindigkeiten (Massenanteil, `RAM.bounce/shoveK/shoveDecay/maxShove`); `Ship.shoveX/shoveZ` wirken in `steer` und klingen ab.
- **Drehbassen-Darstellung:** `NavalSystem.swivelAim` (Ziel, Schusszeit nach 0,4 s, Haltezeit 2,4 s), `aimSwivels` (nur Rohre an der Zielseite, Rest bleibt in Ruhestellung), `fireSwivels` und `swivelFx` (Mündungsfeuer, Rauch, fünf Leuchtspur-Funken je Rohr; weit entfernte Schiffe nur ein Rauchfleck). Gemessen: Rohre zeigen auf 0,1° – 1,4° genau auf das Ziel.
- Neue Tests `tests/shipVisuals.test.ts` (17 Tests, 461 insgesamt). Prüf-Fallen im Browser: Spieler an Deck (`W.mode === 'foot'`) lässt Rammen und Drehbassen ruhen (`W.toHelm()`), `Renderer.render` beim Umhüllen mit `prev.apply(R, args)` aufrufen (nie ohne Besitzer), eine NaN-Kamera bleibt wegen der Glättung dauerhaft kaputt (Seite neu laden).
- **Offen:** keine Handy-Messung der neuen Teile; Stufenbilder der Klassen Brigg bis Linienschiff nur stichprobenartig angesehen (Schaluppe, Galeone, Leviathan).

## 4.2.0 – Phase 4.2 (Teil 1): Schiffs-Evolution in fünf Stufen, Rammsporn, Drehbassen, Werft-Material (24.11.2026, nur lokal)

**Zustand und Spielstand 17 (`data/shipEvolution.ts`)**
- Jedes Schiff hat drei unabhängige Zweige mit je einer Stufe 1 … 5: `hullTier`, `sailTier`, `cannonTier`; die Gesamtstufe `shipEvolutionTier` = `round((Rumpf + Segel + Kanonen) / 3)` ist die eine Quelle für Anzeige, Unterhalt und Erfolge. Der Zustand liegt je Klasse im Spielstand (`ship.evo`, Schlüssel = Klassenindex), alle Zahlen in `data/balanceConfig.ts` (Abschnitt „Schiffs-Evolution“).
- **Startregel:** jedes neu gekaufte Schiff beginnt strikt auf 1/1/1 (75 % Rumpf, 78 % Tempo, nur halb bestückte Stückpforten) und muss in der Werft ausgebaut werden. Entscheidung von mir: das **Startschiff** eines neuen Spiels (nicht gekauft) beginnt auf 2/2/2, sonst wäre der Einstieg mit nur einer Kanone je Seite unnötig zäh; Stufe 3 sind die alten Grundwerte jeder Klasse, Begleitschiffe fahren auf Stufe 3.
- **Migration 16 → 17:** die alten Ausbaustufen `ship.up` (0 … 5) werden auf Stufen abgebildet (`legacyUpToEvo`: Rumpf 0/1/≥2 → 3/4/5, Segel 0/1–2/≥3 → 3/4/5, Kanonen 0/1/≥2 → 3/4/5) und gelten für alle gekauften Klassen. Dadurch wird kein Schiff schwächer (nur der Kanonenschaden liegt bei Stufe 4/5 bis zu 4 Punkte unter dem alten Wert, dafür kommen Durchschlag und Drehbassen dazu). Das Feld `up` entfällt.

**Mechanik**
- **Rumpf:** Rumpfpunkte 75 % → 145 % der Klassenbasis (75, 87,5, 100, 122,5, 145 %), Panzerung ×0,7 … ×1,4. **Rammsporn ab Stufe 4** (`naval/ramming.ts`, rein): Bug-Kegel `dot(Bug, Richtung zum Ziel) > 0,75`, Bugspitze in der Hüllkurve des Ziels, Annäherung über 3,5 m/s, und der Angreifer fährt selbst (ein stehendes Schiff rammt nicht, nur weil ein anderes auf es zufährt). Schaden = Rumpfpunkte des Rammers · min(0,42, 0,35/26 je m/s über der Grenze), mit Crew-Schock; Eigenschaden mit Sporn nur 30 % dessen ohne Sporn (−70 %), Stufe 5 ist **panzerbrechend** (ignoriert die Rumpf-Panzerung), Stufe 4 durchschlägt wie Durchschlag 3. Schiffe ohne Sporn (Stufe 1 – 3) richten bei Frontalkollisionen nur einen Streifstoß an (30 %) und nehmen selbst 60 % der Basis. Effekte: Splitter, Rauch, Funken, Kamera-Wackeln, Hitstop, Zahlen, Tempoverlust (Rammer ×0,55, Ziel ×0,8), Pause 4 s je Paar; auch gegnerische Kriegsschiffe mit Sporn rammen den Spieler, wenn sie im Gefecht fahren (friedliche nie).
- **Segel:** Segel-HP ×0,7 … ×1,4, Höchstgeschwindigkeit 78 % → 122 %, Beschleunigung ×0,8 … ×1,25, Wendegeschwindigkeit ×0,85 … ×1,16, Am-Wind-Verbesserung (Anteil des Gegenwind-Tempoverlusts: 100, 85, 70, 55, 40 %).
- **Kanonen:** bestückte Stückpforten 50 % (Stufe 1), 75 % (Stufe 2), ab Stufe 3 alle (mindestens eine; gleichmäßig verteilt, `portIndices`), Kugelschaden ×0,85 … ×1,2, Nachladen ×1,3 … ×0,9, Durchschlag −1 … +2 Stufen. **Deck-Drehbassen ab Stufe 4:** feuern von selbst Kartätschen (Crew, etwas Tuch, wenig Rumpf) auf feindliche, kampfbereite Schiffe im Umkreis von 45 m (Hüllenabstand), eigene Pause (3,6 s, Stufe 5: 2,8 s), Schaden 20 % einer Kanonenkugel; geenterte und kampfunfähige Schiffe sowie friedliche werden verschont. Auch KI-Schiffe der Gefahrenstufen 4 und 5 haben beides.
- **KI-Schiffe** tragen die Stufe ihrer Gefahrenstufe (1 … 5) in allen Zweigen; ihre Rumpfpunkte bleiben bei `aiHullFactor` (Kalibrierung aus 4.1.0), die Stufe wirkt dort über Panzerung, Segel, Tempo, Pforten, Rammsporn und Drehbassen.

**Werft-Ökonomie**
- **Kosten** je Stufe (300, 550, 950, 1 600 Gold) mal Klassenfaktor `1 + 0,4 · Klasse` und Hafen-Tarif. Die Tore aus 3.1.0 bleiben: Stufe 3 Ansehen „Freundlich“, Stufe 4 Rang 7 und „Verbündet“, Stufe 5 Rang 9 mit 3 Boss-Siegeln und 3 Relikt-Splittern.
- **Material aus dem Frachtraum** ab Stufe 3 (6, 12, 20 Stück, Menge wächst mit der Klasse: ×0,5 … ×2): Rumpf **Hartholz** (neue Ware, Nordwacht erzeugt, Niederlande brauchen sie), Segel **Tuch** (Stufe 5 **Seide**), Kanonen **Kanonenstahl**. Das Material wird beim Ausbau verbraucht (`takeCargo`); die Werft zeigt Bedarf und Vorrat, bei Mangel den Hinweis aufs Kontor.
- **Sold-Skalierung:** die Schiffswartung im Unterhalt wächst mit der Gesamtstufe von +0 % (Stufe 1) bis +35 % (Stufe 5) (`upkeepOf(…, evoTier)`); der Sold der Besatzung bleibt.
- **Inzahlungnahme:** kaufst du eine neue Klasse, erstattet die Werft 50 % des Goldwerts der Ausbauten des bisher gefahrenen Schiffs (ohne Tarif und Material); es wird dafür auf Stufe 1 zurückgebaut (sonst ließe sich das Geld mehrfach holen), das neue beginnt auf 1/1/1 (`applyShipPurchase`). Wechseln zwischen schon gekauften Schiffen kostet nichts und lässt die Ausbauten unberührt.

**Oberfläche:** Werft mit drei Zweigen (Stufenpunkte, Wirkung jetzt und nächste Stufe, Material mit Vorrat, Tor, Kosten), Hinweis zu Startstufe und Sold, Inzahlungnahme-Hinweis bei jeder neuen Klasse; Kompendium beschreibt die fünf Stufen je Zweig; Erfolg „Werftliebling“ zählt jetzt Stufen (12).

**Abnahme**
- `tests/shipEvolution.test.ts` (24 Fälle): Zustand und Startregel, Werte aller 7 Klassen über Stufe 1 … 5, Stückpforten, Rammsporn (Kegel und Winkelgrenze, Geschwindigkeit, Schaden, Eigenschaden, Crew-Schock, panzerbrechend), Drehbassen (45 m, Cooldown, Schaden), Kosten, Material, Inzahlungnahme (kein Doppelholen), Sold, Migration.
- **Playwright im echten Spiel (Dev-Server, keine Konsolenfehler):** Startschiff 2/2/2 mit Werten, Ausbau mit Tor, Material und Gold, alle Stufen bis 5 (Rammsporn, Drehbassen, Tempo ×1,22), Inzahlungnahme beim Brigg-Kauf (+5 100 Gold) mit Rückbau, Werft-Seite. Rammen in offener See über die Spiel-Schleife: Stufe 1 ohne Sporn: 9 % Eigenschaden, 2 % am Ziel; Stufe 4: 3 % Eigenschaden, 11 % am Ziel, Crew −18 %; Stufe 5 (panzerbrechend): 3 % / 13,5 % / Crew −23 %. Seitlich und unter 3,5 m/s kein Treffer. Drehbassen: bei 30 m Rumpf, Tuch und Crew getroffen, bei 150 m nichts.

**Offene Grenzen**
- Schiffe gleiten weiter durch einander (kein Zusammenschieben); der Rammstoß bremst nur. Die KI steuert nicht gezielt auf Ramm-Kurs; sie rammt nur, wenn sie zufällig mit Sporn und Fahrt den Spieler trifft.
- Die Zahlen (Kosten, Material, Rammschaden) sind nur nach Modell und Stichproben abgestimmt, nicht über lange Spielzeit; Drehbassen-Effekt ist Rauch und Funken (kein eigenes Modell).
- Nicht per Bild geprüft: die Werft-Seite im Handyformat, die Wirkung der Drehbassen und des Rammens im Bild (Splitter, Kamera).

**Technik (für Entwickler)**
- `data/shipEvolution.ts` (Zustand, `evoStats`, `activePorts`, `portIndices`, `evoCost`, `evoMaterial`, `evoValue`, `applyShipPurchase`, `legacyUpToEvo`), `naval/ramming.ts` (`ramContact`, `ramDamage`, `swivelTarget`, `RAM_AMMO`), `Ship.setEvolution/evo/evoS/portsOf/ramHit`, `NavalSystem.updateRamming/updateSwivels/tryRam/afterHit`, `Game.evolution/evoView/evoGate/evoUpgrade/tradeInPreview`, `core/economyEngine.ts` `takeCargo`, `upkeepOf(evoTier)`.

## 4.1.0 – Phase 4.1 abgeschlossen: Gegner, Bosse und Schiffe auf der Gefahrenskala, Schiffsbeute, Stresstest (24.11.2026)

**Landgegner auf `DANGER 1 … 5`**
- **Leben und Schaden** folgen jetzt `dangerScale(level)` (statt der alten linearen Formel): die erste Gegnerstufe jedes Bandes (1, 5, 9, 14, 18) trägt genau den Richtwert aus `DANGER` (Leben ×1 / 1,8 / 3 / 4,8 / 7,5, Schaden ×1 / 1,5 / 2,2 / 3,2 / 4,5), dazwischen läuft es stetig; ab Stufe 18 wächst es langsam weiter. Unterhalb von Stufe 18 weicht es kaum vom alten Verlauf ab, oben (Raid-Festungen) ist es etwas härter.
- **Rüstung** für alle Gegner: `Enemy.takeHit` rechnet `1 − mitigation(Rüstungswert, Waffenstufe)`; der Rüstungswert ist `DANGER[Stufe].armor × Faktor der Art` (Matrose 0,5, Schildträger 1,3, Musketier 0,3, Schläger 1,0, Faji-Wirker 0,3, Hauptmann 1,1, Legende 1,3). Die Waffenstufe der Spielfigur (`CombatSystem.attackTier`, aus `WEAPONS[…].tier`) entscheidet, wie viel durchkommt: mit Stufe-1-Klinge kommen gegen einen Stufe-5-Schildträger unter 40 % Schaden an, mit Stufe 4 fast das Doppelte. Im Spiel gemessen: gleicher Treffer (100) gegen einen Hauptmann der Stufe 14: Waffenstufe 1 → 25, Stufe 5 → 63.
- **Haltung** wächst mit der Gefahrenstufe (×1 … ×1,6, nicht für Bosse und Raid-Gegner).
- **Kein One-Shot für die Spielfigur:** ein einzelner Treffer nimmt höchstens 40 % der Lebenspunkte (`PLAYER_HIT_CAP`; im Spiel geprüft: Schaden 99 999 → genau 40 %).

**Raid-Endbosse und Hauptmänner**
- **Hardcore-Kalibrierung** mit dem Kampfmodell (`FIGHT_MODEL`, `fightSeconds`, `surviveSeconds`): Lord-Admiral Blackwood (1 870 Basis-Leben), Generalgouverneur Van Der Berg (1 660), Großkomtur von Eisenstein (1 550), Marquis-Amiral De Valois (1 980), Schattenfürst Kurogane (1 820), Großadmiral Valken (1 445, Schaden 27 → 24). Ergebnis im Modell (Stufe-4-Satz, Stufe 35, fünf Offiziere): 100 – 110 s je Boss; Stufe-5-Satz (Boss-Set, Stufe 45): 60 – 65 s; Stufe-3-Ausrüstung unterliegt (Boss gewinnt vorher), Stufe 1 braucht über 600 s und hält keine 25 s. Wer nur draufschlägt, verliert gegen Stufe 4 deutlich (Überlebenszeit unter der Kampfdauer); wer ausweicht und pariert, gewinnt.
- **Anti-One-Shot:** ein einzelner Treffer nimmt einem Raid-Endboss höchstens 8 % seiner Lebenspunkte (`RAID_BOSS_HIT_CAP`, nach Rüstung und Break-Bonus; im Spiel geprüft: Treffer mit Schaden 1 000 000 → 1 384 von 17 298 Leben).
- Hauptmänner: feste Rüstung 42 → 30 % (zusätzlich zur Rüstung der Gefahrenstufe); mit Stufe-4-Satz und Crew in unter einer Minute, allein deutlich länger.
- **Beutetabelle fest an Stufe 4/5 gebunden:** jeder Sieg gibt sicher ein Kriegsherren-Stück der Stufe 4 (noch fehlend, `kind: 'warlord'`, vorher zufälliger Wurf in `Game`), Boss-Siegel und Relikt-Splitter; die Stücke der Stufe 5 fallen mit 8 – 15 % je Platz.

**Seegefecht**
- **Rumpf-Panzerung** je Klasse (`HULL_ARMOR`: 8, 20, 38, 60, 85, 115, 150) und **Kanonen-Durchschlag** (`penTierOf`: Stufe der Klasse plus Kanonen-Ausbau/2): `Ship.damage(…, pen)` rechnet auf den Rumpf `1 − mitigation(Panzerung, Durchschlag)`, das Tuch hat keine Panzerung. Eine Schaluppe braucht gegen den Rumpf eines Linienschiffs mehr als 70 Kugeln, aber nur etwa 9 Kettenkugeln gegen sein Tuch; das Linienschiff zerlegt die Schaluppe in unter 12 Kugeln. Im Spiel geprüft: Brigg (Panzerung 20): 100 Schaden → 73 (Durchschlag 1), 89 (3), 93 (5).
- **KI-Schiffe:** Kugelschaden `9 · dangerScale(level).dmg` (Legenden ×1,5), Nachladezeit `3,6 − 0,35 · (Stufe − 1)` s (nie unter 2,2 s), Rumpf `aiHullFactor` (gedämpft aus dem Leben-Richtwert, auch Marine-Patrouillen, Grenzschlachten und Jäger). Segel-HP bleiben bewusst unverändert (die Schwachstelle). Raid-Wachschiffe behalten ihre eigenen Rumpfwerte.

**Handelswaren als Schiffsbeute**
- Beim Versenken (65 % der Ladung) oder Entern (130 %) von Schiffen der Mächte (nicht Begleitschiffe) fallen Güter: Händler die Erzeugnisse ihrer Macht (2 – 3 Posten), Kriegsschiffe Marine-Ausrüstung oder Kriegsware, Legenden Luxusgüter; nahe einer Sektorgrenze (< 700 m) mit Glück ein Posten Kriegsware. Wertbudget 30 + 12 · Stufe Gold je Schiff (Legenden ×3). `rollSalvage`/`applySalvage` (rein, mit Würfel); die Fracht geht automatisch an Bord, begrenzt durch den freien Frachtraum (30 … 500, der Rest geht verloren, mit Hinweis). Kriegsware erhöht beim Einsammeln den Fahndungsdruck (halbe Rate).

**Wirtschaft nachjustiert (Ergebnis des Stresstests)**
- Die Handelsspannen waren zu hoch (eine Schaluppe machte mit bester Planung über 3 000 Gold/Stunde und wuchs von 300 auf über 6 900 Gold in zwei Stunden). Neu: Überschuss-Preisfaktor 0,85 (vorher 0,65), Bedarf 1,2 (vorher 1,45), Elastizität 0,7, Erholungszeit 45 Minuten Spielzeit, Luxusgüter Grundpreis 120. Ergebnis (zwei Stunden, beste Route und Menge, 5 Minuten je Fahrt): Schaluppe ≈ 970, Brigg ≈ 880, Korvette ≈ 700 Gold/Stunde netto, Fregatte und größer ohne Gewinn (Sold): Handel trägt keine Kriegsflotte. Preis-Pfeil „billig/teuer“ ab ±10 %.

**Abnahme**
- `tests/economyBalance.test.ts` (22 Fälle): Gefahrenskala, Soldaten und Hauptleute (Kampfdauer, keine One-Shots), alle sechs Bosse gegen Stufe 1/3/4/5, Anti-One-Shot, Beutetabelle, Schiffs-Panzerung, KI-Schiffe, Schiffsbeute (Frachtraum, Kriegsware, Wertgrenzen), Sold von Rang 0 bis 9, Kauf-Tore, Munitions- und Reparaturpreise, Handel über zwei Stunden, Sättigung.
- **Playwright** (Dev-Server, echtes Spiel, ohne Konsolenfehler und -warnungen): Munitionsmeister in der Werft (Freischalten, Tor „Ansehen“ bei Brandkugeln), Kontor auf Desktop und im 390-px-Handyformat (kein seitliches Überlaufen, Bilder in `qa_tmp/p41_*.png`), Kompendium (Stufe, Rang, Ruf, Rezept), Landgefecht an Deck (Rüstung, 40-%-Grenze, Treffer), Boss-Anti-One-Shot, Seegefecht (Breitseiten, Panzerung, Segel zerschossen, Schiffsbeute: „Treibgut geborgen: 1 × Stoffe, 1 × Luxusgüter“).

**Offene Grenzen**
- Das Kampfmodell ist ein Modell (Treffer je Sekunde, Anteil getroffener Zeit, Beitrag der Offiziere): die echte Kampfdauer muss in längeren Spielstunden gegengeprüft werden, vor allem Fähigkeiten und Truppen. Kein Handy, keine Dauerspiel-Messung. Der Seegefecht-Beuteweg wurde über den Spiel-Haken (`onShipSunk`) geprüft, nicht über einen vollständig ausgespielten Untergang. Teile der Wirtschaftswerte aus 3.2.0 (Spanne, Elastizität) sind oben neu gesetzt.

**Technik (für Entwickler)**
- `data/balanceConfig.ts`: `dangerScale`, `DANGER_POISE`, `ENEMY_ARMOR_K`, `enemyArmorRating`, `RAID_BOSS_HIT_CAP`, `PLAYER_HIT_CAP`, `HULL_ARMOR`, `penTierOf`, `aiCannon`, `aiHullFactor`, `FIGHT_MODEL`, `fightSeconds`, `surviveSeconds`. `core/economyEngine.ts`: `rollSalvage`, `applySalvage`, `sellK`. `Ship.penTier/hullArmor`, `HitInfo.tier`, `EnemyWorld.attackTier`, `Game.salvageShip`.

## 3.2.0 – Ökonomie: Unterhalt, Regionalhandel, Tarife (24.11.2026)

**Lücke aus 3.1.0 geschlossen: Spezialmunition**
- Kettenkugeln, Kartätschen (Stufe 2) und Brandkugeln (Stufe 3) müssen beim neuen **Munitionsmeister** in der Werft freigeschaltet werden (450 / 450 / 1 600 Gold, mit Hafen-Tarif). Es gilt dasselbe Tor wie überall (`shopGate`: Rang und bei Stufe 3 Ansehen „Freundlich“); Taste und Schiffstafel wählen nur freigeschaltete Munition und sagen sonst, was fehlt. Kugeln hat jedes Schiff. Einmal freigeschaltet, ist die Munition unbegrenzt (kein Verbrauch je Schuss). Kanonen selbst: die Ausbau-Stufen der „Schweren Kanonen“ hatten ihre Tore schon in 3.1.0 (`upgradeGate`).
- Migration: wer schon einen Rang hat, bekommt die Munition seiner Stufe automatisch (ohne Ansehens-Prüfung).

**Gold-Senken**
- **Sold und Proviant (`UPKEEP`, `upkeepOf`):** je Seemann 1,2, je Truppenkopf 2,0, je Offizier 8 Gold und die Schiffsklasse (10 Schaluppe … 350 Leviathan) je Ingame-Tag; abgerechnet an vier Zahltagen je Tag (alle 6 Minuten Spielzeit), auf See und im Hafen. Beispiel Schaluppe: 29 Gold je Tag, Leviathan mit Truppen etwa 700.
- **Wer nicht zahlen kann:** gezahlt wird, was da ist; der Rest bleibt als Rückstand stehen, die **Moral** sinkt (−15 % je ausgebliebenem Zahltag, Boden 20 %), die **Treue der Offiziere** sinkt (−8 je Zahltag) und die Crew arbeitet langsamer (Wirkung 55 … 100 %, `Ship.moraleK`: Nachladen, Segel, Reparatur). Gezahlte Zahltage heben die Moral wieder und zahlen den Rückstand nach. **HUD:** neue Zeile „Sold x/Tag“ in der Kapitänstafel, gelbe Vorwarnung eine Minute vor dem Zahltag, wenn das Gold nicht reicht, rot bei Rückstand; dazu Meldungen.
- **Reparatur:** Notfall-Reparaturen und die passive Reparatur der Crew stellen auf See höchstens **75 %** von Rumpf und Segel-HP her (`SEA_REPAIR_CAP`); 100 % nur in der Werft. Segeltuch kostet jetzt 90, Planken 75 Gold. Werft-Kosten wachsen mit Länge × Breite der Klasse (Exponent 0,4) und überproportional mit dem Schadensgrad (`yardRepairCost`).
- **Zölle und Hafen-Tarife (`tariffOf`):** Ansehen (−5 … −20 %) und Ehre (bis −5 %) senken die Preise bis höchstens −25 % auf Werft, Munition, Truppen, Heuer, Bett, Verbrauchsgüter und Waren. Feindliches Ansehen (< 0) = Schwarzmarkt +35 %; ab −60 sperrt die Macht den Hafen (Meldung statt Hafenmenü). Freihäfen: Grundpreis. Ersetzt den alten Hafenrabatt (`harborK`).
- Verbrauchsgüter: Die Höchstzahl im Beutel wächst mit der Schiffsklasse (×1 Schaluppe … ×3 Leviathan, `bagMax`).

**Regionalhandel (`data/economy.ts`, `core/economyEngine.ts`)**
- 17 Handelswaren (Rohstoffe, Waren, Luxus, Kriegsware) mit Grundpreis und Platzbedarf. Profile: Nordwacht (Kanonenstahl, Werkzeuge), Glutring (Schwefel, Obsidian, Schmiedekohle), Niederlande (Gewürze, Stoffe, Luxusgüter), England (Tuch, Tee, Marine-Ausrüstung), Frankreich (Wein, Seide, Fechtklingen), dazu Deutschland, Kurogane und Marine; Ankerglück ist ein ehrlicher Freihafen ohne Spezialität. Eine Insel vereinigt Region und Macht.
- **Elastizität (Werte in 4.1.0 nachjustiert):** Preis = Grundpreis · Gleichgewichtsfaktor (Überschuss 0,65, normal 1, Bedarf 1,45) · (Vorrat/Gleichgewichtsvorrat)^−0,55, begrenzt auf 0,45 … 2,6. Jedes gekaufte Stück verteuert, jedes verkaufte verbilligt die Ware; Händlerspanne 5 %. Die Vorräte fließen mit der Spielzeit zum Gleichgewicht zurück (τ = 30 Minuten), ohne Hintergrundrechnung (lazy in `marketAt`). Hin und Zurück im selben Hafen kostet immer Gold (auch mit Rabatt).
- **Kriegs- und Schmuggelware** (Waffenkisten, Schießpulver, Medizin): Aufschlag nahe Sektorgrenzen (< 700 m), auf besetzten Inseln und in Festungen (höchstens ×2,5). Handel zu Kriegspreisen erhöht den **Fahndungsdruck** (sinkt mit der Zeit); beim Anlegen in einem Hafen einer Macht kann mit Kriegsware an Bord kontrolliert werden (5 % + Druck/150, Marine ×1,5): alles beschlagnahmt, Strafe ein Viertel des Werts, Ansehen −6; ab Druck 60 rücken Kopfgeldjäger aus.
- **Frachtraum** je Klasse: 30, 60, 100, 160, 240, 340, 500 Platz; Waren haben Platzbedarf (0,5 … 2).

**Oberfläche:** Neues **Kontor** im Hafenmenü (Mahagoni/Messing-Stil): Frachtraum-Balken, Hafentarif, Unterhalt mit Aufstellung und nächstem Zahltag, Waren mit Vorrat, Kauf-/Verkaufspreis, Preis-Pfeil (▼ günstig, ▲ teuer), Rolle (Überschuss, Gefragt, Kriegsware), Fracht mit Durchschnittspreis und Gewinn, Kauf-/Verkaufsknöpfe (1, 10, Max/Alles) und die **Preisübersicht** der fünf zuletzt besuchten Häfen (Kauf/Verkauf je Ware, bester Erlös grün). Markt und Truppen zeigen Preise mit Tarif, die Werft den Munitionsmeister.

**Spielstand 16:** `progress.economy` (Märkte, Preisbuch, Fracht, Zahltag, Rückstand, Moral, Fahndungsdruck, Munition), Migration 15 → 16 setzt den ersten Zahltag eine Periode nach dem Laden (nichts wird rückwirkend abgerechnet).

**Nicht umgesetzt / offene Punkte**
- Die Märkte gibt es für jeden Hafen (Insel mit Hafenmenü), aber noch keine Händlerschiffe auf See, die Preise beeinflussen; Fraktionskriege (4.4) und Mehrspieler-Märkte (4.7) sind nur vorbereitet: Märkte sind reine, JSON-taugliche Daten je Insel-Schlüssel mit Spielzeit als Uhr.
- Beutekapazität: nur die Verbrauchsgüter im Beutel wachsen mit der Klasse; Beute-Gold und Ausrüstung haben keine Platzgrenze. Waren aus Beute (Treibgut, Kisten) gibt es noch nicht.
- Im Spiel geprüft: Zahltag, Rückstand, Moral, HUD-Zeile, Kontor-Handel, Munitionstor. Nicht per Bild geprüft: Werft-Seite mit Munitionsmeister, Markt-Seite, Handy-Ansicht des Kontors. Kein Balancing über Stunden (Gold-Fluss, Handelsgewinn gegen Sold sind nur rechnerisch getestet).

**Technik (für Entwickler)**
- `data/economy.ts` (Waren, Profile, `MARKET`, `UPKEEP`, `TARIFF`, `CONTRABAND`, `AMMO_UNLOCK`, `EconomyState`, `cleanEconomy`), `core/economyEngine.ts` (`marketAt`, `marketPrice`, `quoteBuy/Sell`, `buyGood/sellGood`, `inspectCargo`, `tariffOf`, `upkeepOf`, `stepUpkeep`, `yardRepairCost`, alles rein und mit übergebenem Würfel), `Game.eco/kontorView/tradeBuy/tradeSell/tariff/priceAt/ammoView/buyAmmo/stepEconomy`, `Hud.setUpkeep`, `Menus.showKontor`.
- Tests: `tests/economy.test.ts` (28 Fälle: Profile, Elastizität, Erholung, Frachtraum, Kriegspreise, Kontrollen, Tarife, Unterhalt, Werft, 75-%-Grenze, Migration).

## 3.1.0 – Balance-Fundament und Ausrüstung in fünf Stufen (24.11.2026)

**Alle Werte aus einer Quelle (`data/balanceConfig.ts`)**
- **Rüstung und Widerstand:** Schadensminderung = `Rüstung / (Rüstung + 55 · Stufe des Angreifers)`. Viel Rüstung schützt spürbar, ergibt aber nie 100 % (zusätzlich bleibt mindestens 15 % Schaden). Dieselbe Kurve gilt für den elementaren Widerstand (80 % der Rüstung) gegen Magie-Angriffe. Ein voller Satz jeder Stufe fängt gegen Gegner derselben Stufe 30 / 35 / 40 / 42 / 45 % ab; Stufe-1-Rüstung hilft gegen Stufe-5-Gegner kaum (unter 10 %).
- **Weicher Deckel für Prozent-Boni:** `softCap` (bis zum Knie linear, darüber stetig bis zur Obergrenze) deckelt gestapelte Boni auf Angriff (+75 %), Volltreffer (+60 %), Schadensminderung (+50 %), Faji-Erholung (+100 %), Gold (+60 %) und die Enterkraft (Truppen plus Offiziers-/Fraktions-Boni, `boardingStrength(…, extra)`). Zahlen unterhalb des Knies ändern sich nicht.
- **Gefahrenstufen 1 – 5:** Gegnerstufen (`dangerOfLevel`), Zonen der Karte nach Abstand vom Mittelpunkt (`dangerOfDistance`: Ankerglück 1 … äußere Raid-Festungen 5, Grenzfestungen 3) und die zehn Ruhm-Ränge (`RANK_TIER`: 0–1, 2–3, 4–6, 7–8, 9) liegen auf derselben Skala, mit Richtwerten für Leben, Schaden und Panzerung (`DANGER`). Die Richtwerte sind Bezugsgröße für Tests und Neuentwürfe; die Werte der vorhandenen Gegner wurden NICHT umgeschrieben.

**Fünf Qualitätsstufen für alle Ausrüstung**
- Stufe 1 Verwittert (Rang 0–1), 2 Solide (2–3), 3 Meisterhaft (4–6, nur mit Ansehen „Freundlich“ beim Hafen), 4 Kriegsherr (7–8, nur Beute), 5 Relikt (Rang 9, Endbosse, nur schmiedbar).
- **Power-Budget:** Leben, Rüstung und Preis jedes Stücks folgen allein aus Stufe und Platz (`slotBudget`; die neun Plätze teilen das Budget einer Stufe vollständig). Waffen: `WEAPON_DMG`. Betroffen: Waffen, Körperrüstung, Köpfe, Schienen, Stiefel, Schilde, alle Rüstungssets (`tierOfSet`), Verbrauchsgüter (`tier`). Vorher hatten Stücke feste Seltenheitswerte plus Stufenfaktor; Rüstung gibt es jetzt als Wert (`armor`) statt als Prozent.
- Ein Beute-Oberteil ersetzt die gekaufte Körperrüstung (vorher zählten beide).
- **Zufallsbeute** (Truhen, Gegner) gibt nie Ausrüstung über der Stufe des eigenen Rangs.
- **Stufe 4** fällt als Kriegsherren-Beute: Belagerungssiege (immer), Bossinseln (30 %, ab Rang 5), Grenz-Seeschlachten (15 – 25 %).
- **Stufe 5 und Boss-Siegel:** Die sechs Boss-Sets fallen nicht mehr sicher, sondern mit 8 – 15 % je Stück (Waffe/Kopf 8 %, Umhang 15 %). Jeder Sieg gibt sicher Boss-Siegel dieser Macht (erster Sieg 2, danach 1) und 1 – 3 Relikt-Splitter. In der Schmiede (Relikt-Schmiede) lässt sich jedes Stück gezielt schmieden: Siegel dieser Macht, Splitter, Gold, Ehre 60 und Rang 9. Die Stufe-5-Waffe (Himmelsschneide) braucht 6 Siegel beliebiger Macht. Der letzte Werft-Ausbau (Stufe 5) braucht 3 Siegel und 3 Splitter; Stufe 3 braucht Ansehen „Freundlich“, Stufe 4 Rang 7 und „Verbündet“.
- **Ein Tor für Anzeige und Logik:** `shopGate` (`data/crafting.ts`) prüft Rang, Ansehen und „nicht käuflich“; `Game.gateText` fragt es für jeden Kauf und für die Anzeige der Läden. Stufe 4 und 5 sind in keinem Laden kaufbar (auch nicht mit Höchstrang). Der Ausrüster verkauft jetzt nach Stufe (1 – 3) statt nach Seltenheit.

**Spielstand 15 und Kompendium**
- Migration 14 → 15: Stufen-Indizes (Waffe, Rüstung, Werft-Ausbauten) werden eingegrenzt; alte Werte stecken nicht im Spielstand, sondern werden zur Laufzeit aus den Stufen berechnet. Für jede bisherige Eroberung gibt es als Ausgleich für den entfallenen sicheren Boss-Wurf ein Siegel (höchstens 5 je Insel) und zwei Splitter. Neue Felder: `progress.unlocks.seals` / `shards`. Besitz bleibt unangetastet (auch bereits gekaufte Stufe-4-Waffen).
- Item-Kompendium: jeder Eintrag nennt Qualitätsstufe, benötigten Rang, Ruf (Ansehen beim Hafen), Fundort und bei Relikten das Schmiede-Rezept. Läden und Schmiede zeigen die Stufe als Plakette und den Grund, wenn etwas gesperrt ist.

**Nicht umgesetzt / offene Punkte**
- Die Richtwerte der Gefahrenstufen (Leben/Schaden/Panzerung) sind noch nicht auf die Gegnerdaten angewendet; als Angreiferstufe für die Rüstungskurve zählt die Gegnerstufe (`dangerOfLevel`), Verbände und Geschütze ohne Gegner-Objekt zählen als Stufe 4.
- Munition und Kanonen tragen eine Stufe nur als Anzeige im Kompendium (kein Ladentor). Kanonenschaden hängt weiter an Spielerstufe, Schiffsklasse und Ausbau.
- Nicht im Spiel selbst durchgespielt: Rechnung, Tore, Schmiede, Migration und Kompendium sind getestet (`tests/balance.test.ts`), die Menüs wurden in diesem Durchgang nicht per Bild geprüft.

**Technik (für Entwickler)**
- `data/balanceConfig.ts` (Formeln, Stufen, Budget, Gefahr), `data/crafting.ts` (Tore, Rezepte, Siegel-Börse, rein), `core/gearBag.ts` `rollGearByTier` und `maxTier` in `rollLootGear`, `Game.gateText/craftBossPiece/craftWeapon/upgradeGate/dropWarlord`, `PlayerFoot.gearArmor/gearResist` und `receiveHit(…, elemental)`, `ui/components.ts` `tierBadge`.
- Tests: `tests/balance.test.ts` (25 Fälle) und angepasste Fälle in `endgame`, `factions`, `inventory`.

## 3.0.6 – Neue Schiffslaterne an der Hüfte (19.11.2026)

**Hüftlaterne: neues Aussehen** (`render/lamps.ts`)
- **Form:** Kuppeldach mit Randwulst, Kaminhals und Hut, gewölbtes Glas in Messingbändern, sechs Käfigdrähte mit Schutzring, gewölbter Messing-Ölbehälter mit Wulstring und drei Füßen, Henkel mit zwei Scharnieraugen und Ring, fünf Kettenglieder zur Gürtelhalterung (Lederschlaufe, Messingplatte mit Nieten, Haken-Arm). Der Arm ist 5 cm lang (`LAMP_ARM`), damit der Dachrand nicht in den Mantel ragt.
- **Textur:** Eckpunktfarben tragen Altern: Ruß und Schmutz nach unten, fleckiger Rost auf dem Eisen, matte und blanke Stellen im Messing. Ein Wert je Punkt (`aMat`: Leder, Eisen, Messing, Glas) steuert im Shader die Oberfläche.
- **Licht:** Das Material (`MeshBasicMaterial` mit `onBeforeCompile`, weiter ein Zeichenaufruf je Laterne) rechnet einfaches Licht aus Sonne oder Mond und Himmelslicht der Umgebung (`lampLight`, von `Environment.render` gesetzt, mit Wetter), Glanz auf Metall (Messing warm, Eisen kühl), Randlicht; nachts leuchtet die Flamme Dach, Käfig und Behälter von innen warm an. Das Glas ist tagsüber dunkles Bernsteinglas mit Glanz und glüht nachts von innen (Kern auf Flammenhöhe am hellsten, zum Rand kühler, leises Flackern). Vorher war es ein unbeleuchtetes Netz, das am Tag auf 30 % abgedunkelt wurde.
- Der Lichthof sitzt jetzt an einem eigenen Ankerpunkt auf Flammenhöhe (`userData.glowAnchor`), weil die Laterne neben dem Befestigungspunkt hängt.
- Kosten: wie vorher ein Zeichenaufruf je Träger, etwa 3 000 Dreiecke je Laterne (geteilte Geometrie); keine neuen Lichter.
- `tests/lamps.test.ts` an die neuen Maße angepasst. Geprüft im Editor von vorn, hinten und beiden Seiten, bei Tag und Nacht.

## 3.0.5 – Hüftlaterne hängt am Gürtel (19.11.2026)

**Fehler behoben**
- **Die Laterne an der Hüfte schwebte in der Luft.** Ihre „Schnur“ war ein starrer, heller Stab, der oben im Nichts endete, und die Laterne hing etwa 8 cm neben dem Bein. Jetzt hängt sie an einer richtigen Gürtelhalterung (`render/lamps.ts`, `lampGeometry`): eine dunkle Lederschlaufe am Gürtel mit Messingplatte und zwei Nieten, ein Haken-Arm nach außen (`LAMP_ARM`), eine Öse und vier Kettenglieder bis zum Henkel der Laterne. Der Ursprung des Netzes ist der Befestigungspunkt am Körper, die Laterne pendelt weiter um ihn.
- Der Befestigungspunkt sitzt im Hüft-Socket jetzt an der Außenkante von Gürtel und Mantel (`LAMP_HIP_X` = 0,187 m, Messung: Körper auf Gürtelhöhe ±0,208 m, Mitte in der Tiefe), vorher 0,27 m davon entfernt. Hält die linke Hand einen Schild, wechselt die Laterne die Seite und dreht die Halterung mit (`Character.hold`; vorher blieb die Drehung stehen).
- Geprüft im Editor von vorn, beiden Seiten und hinten sowie mit Schild; `tests/lamps.test.ts` (2 Tests: Aufbau und lückenlose Kette).

## 3.0.4 – Regen im Wasser statt auf dem Wasser (19.11.2026)

Nur lokal, noch nicht veröffentlicht. **Kein neuer Spielstand.**

**Regen auf dem Meer (`world/ocean.ts`, `world/weather.ts`)**
- **Die Aufschlagringe sind jetzt Wellen in der Wasseroberfläche.** Die aufgesetzten, additiven Ringe aus 3.0.3 (eigenes Netz mit 480 Instanzen) sind weg; stattdessen rechnet der Ozean-Shader die Tropfen selbst (`skRainRipples`, Uniform `uRain`): je Zelle ein Tropfen an zufälliger Stelle, dessen Ringwelle (Wellenpaket, abklingend, mit zweiter, kleinerer Welle dahinter) die Normale der Wasserfläche kippt. Dadurch verformen die Ringe Himmelsspiegelung, Sonnenglanz und Funkeln wie echtes Wasser: im Abendlicht fangen sie die Glitzerbahn, bei bedecktem Himmel tragen die gekippten Flanken den helleren Himmel (`skRainI`), nachts bleibt ein schwacher Mindestschimmer.
- Drei Größen (Zellen 3,3 m / 1,5 m / 0,7 m, Ringradius bis 1,45 m / 0,7 m / 0,34 m) mit Entfernungsüberblendung (die feinsten verschwinden ab ~40 m, die größten ab ~190 m), Dichte folgt der Regenstärke. Der Regen macht die Fläche etwas rauer und dämpft den Glanz zwischen den Ringen leicht.
- Kosten: nur beim Regen und nur mit Wasserdetail (`uDetail > 0`, also nicht auf der niedrigsten Stufe); vier Zellen je Größe, keine CPU-Arbeit mehr (die Ringliste und die Wasserhöhen-Nachführung der 3.0.3 sind entfernt). Der Spritzer-Funke und der Spritzkranz an Deck und an Land bleiben (`SeaWorld.rainSplashes`).
- Programm-Schlüssel des Ozeans auf `sk-ocean29`.

## 3.0.3 – Regen mit Tiefe (19.11.2026)

**Kein neuer Spielstand.**

**Regen (`world/weather.ts`)**
- **Drei Tiefenschichten statt einer Strichwolke:** nah (wenige, kräftige, kurze Striche), mittel (die Hauptmasse) und fern (viele feine, lange, blasse Striche, die zusammen einen Regenvorhang bis zum Horizont ergeben). Alle laufen über dieselben Samen und denselben Shader; Mengen folgen der Grafikstufe wie vorher (`setMaxDrops`).
- **Weicher Rand:** Die Tropfen blenden am Rand des Regenkastens und direkt vor der Linse aus, statt aus dem Nichts aufzutauchen oder als dicke Striche durchs Bild zu ziehen. Kern mit weichem Rand, je Tropfen eigene Helligkeit und Länge.
- **Licht und Farbe:** Der Regen nimmt Nebel- und Horizontfarbe auf und folgt der Helligkeit (nachts und im Unwetter dunkel statt grellweiß). Vor Sonne und Mond leuchten die Tropfen im Gegenlicht auf, Blitze hellen ihn kurz auf (`RainLook`, von `Environment.render` je Bild gefüllt).
- **Böen und Wind:** Fallzeit und Winddrift werden einzeln aufsummiert statt als `Geschwindigkeit × Uhrzeit` gerechnet; dadurch springt das Tropfenmuster nicht mehr, wenn sich der Wind ändert. Dazu ein glattes Hin- und Herwehen mit der Höhe.
- **Aufschlagringe auf dem Wasser:** Bis zu 480 Ringe gleichzeitig (`Weather.addRing`, ein Instanz-Netz), gestreut rund um die Kamera (gleichverteilt im Radius, also dicht in der Nähe und nach außen dünner, 2 bis 48 m; Rate `(Regen − 0,05) × 480` je Sekunde, skaliert mit der Grafikstufe über `Weather.density`; nie auf festem Grund). Die Ringe sind dünn und scharf, additiv gezeichnet (nachts hell auf dunklem Wasser, am Tag feines Funkeln), mit hellem Aufprallpunkt, einem zweiten, weicheren Ring und größer mit der Entfernung. Sie gleiten mit der Welle (`Weather.waterY`, Wasserhöhe in Drittel-Scheiben nachgeführt, etwa 0,26 ms je Bild im Höchstfall). Auf festem Grund (Deck, Sand, Steg) bleibt der Spritzkranz, gelegentlich mit größeren Tropfen (`SeaWorld.rainSplashes`, `SeaWorld.rainRings`).
- Kosten: etwa 2,7-mal so viele Quads wie vorher (bei der Grundstufe rund 7 000), ein Zeichenaufruf je Schicht; kein Mehraufwand auf der CPU außer den Ringen. `tests/weather.test.ts` (3 Tests).

## 3.0.2 – Flaggen standen auf dem Kopf (19.11.2026)

**Fehler behoben**
- **Alle Schiffsflaggen waren kopfüber** (Mast- und Heckflagge, jede Schiffsklasse, Titelbild und hohe See): Das Tuchnetz in `render/flagCloth.ts` bildete die Oberkante des Tuchs auf die Unterkante des Bildes ab (UV `1 − v`), obwohl Leinwand-Texturen mit `flipY` bei v = 1 oben beginnen. Totenkopf, Krone, Anker und die Wappen der Weltmächte stehen jetzt aufrecht. Das Bild wurde nie falsch gemalt, nur falsch aufgelegt, darum genügt die eine Zeile für alle Flaggenarten. `tests/figureheads.test.ts` prüft die Bildrichtung des Tuchnetzes.
- Technik: Die Banner an Land (`world/garrison.ts`, `PlaneGeometry`) und die Segel (`sailTexture`) haben eigene UV und waren nicht betroffen.

## 3.0.1 – Titelbild als Kamerafahrt, Steg-Hänger behoben, Handy-Feinschliff (19.11.2026)

Nur lokal, noch nicht veröffentlicht. **Kein neuer Spielstand** (Version bleibt 14).

**Fehler behoben**
- **Das Schiff stand beim Spielstart mitten im Steg.** Neues Spiel, „Zurück in den Hafen“ (Pausenmenü) und das Heimschleppen nach einem Untergang setzten das Schiff auf (0, 12): das ist das Ende des Stegs von Ankerglück (der Steg reicht bis etwa z = −5). Die Planken ragten durch den Rumpf, und die Stegkollision schob das Schiff beim ersten Fahren ruckartig zur Seite. Der Platz ist jetzt eine Konstante, `HOME_SPAWN` in `data/world.ts` (freies Wasser südwestlich vor dem Steg, der Bug zeigt zum Hafen); `SeaWorld.teleportHome()` nutzt sie überall. `tests/titleDirector.test.ts` prüft, dass der Platz für jede Schiffsklasse (bis zum Leviathan) außerhalb der Stegkollision liegt.
- **Startbildschirm ließ sich „minimal rollen“** (Fenster um 1333 × 663 und ähnlich, auch bei Bildschirmskalierung 150 %): der Inhalt war 35 px höher als das Fenster, dazu ragte der Lichthof des Wappens seitlich über den Rand. Jetzt messen sich Wappen, Name, Knöpfe und Abstände des Titels in `em` und die Schriftgröße folgt der Fensterhöhe (`clamp` mit `dvh`); geprüft in 15 Fenstergrößen von 320 × 568 bis 2000 × 995, nirgends überlaufend. Die niedrige Fassung (ohne Untertitel und Version) gilt bis 560 px Höhe.
- **Eine unsichtbare Schicht hätte im Spiel jeden Tipp und Klick geschluckt** (die neue Schwarzblende des Titels: `#ui > *` schaltet Zeigerereignisse ein und hat mehr Gewicht als eine Klassenregel). Aufgefallen beim Test mit echten Touch-Ereignissen; jetzt `pointer-events: none !important` und im Spiel ganz ausgeblendet. `tests/cssRules.test.ts` hält die Regel fest.
- Inselschilder blieben nach „Zurück zum Titel“ sichtbar und sahen aus der Ferne wie dunkle Striche auf dem Wasser aus; sie sind im Titel jetzt aus.
- **Segel und Flaggen glühten im Unwetter**, als schiene die Sonne dahinter (die Sichtbarkeit der Sonne für die Durchleuchtung kannte die Wolken nicht, der Himmel schon); beides folgt jetzt `1 − 0,9 · Graustufe`.

**Neu: das Titelbild ist eine Kamerafahrt** (`world/titleDirector.ts`)
- Statt eines Schiffs am Steg bei Vormittagslicht segelt jetzt das **Prachtschiff** (eine Galeone in dunklem Mahagoni mit Goldzier, cremefarbenen Segeln, Sturmkrone-Flagge und dem gekrönten Sturmdrachen am Bug, `TITLE_SHIP` in `data/ships.ts`) in **drei Stimmungen** am Betrachter vorbei, mit Schwarzblende dazwischen: **Abendgold** (die Sonne berührt den Horizont, Fenster und Laternen leuchten, Verfolgerkamera steigt vom Heck-Viertel hinter das Schiff), **Sturmfront** (Regen, hohe Wellen, dunkle Wolken, Blitze, die vor der Kamera einschlagen; die Kamera steht fest dicht über den Wellen und das Schiff zieht vorbei) und **Mondnacht** (Sterne, Mondglitzer, ein Bugkran steigt von der Galionsfigur hinauf).
- Das Schiff **fährt wirklich** (Fahrphysik des Spielerschiffs mit gedeckeltem Tempo, Schräglage, Heckwelle und Gischt), die Kamera ist eine Funktion von Zeit und Schiffslage; das Schiff steht im Querformat im freien Teil links vom Menü, im Hochformat darüber (`lensShift` dreht nur die Kamera, der Horizont bleibt waagerecht). Handkamera-Schwanken je Stimmung, Blitze mit Donner (`Weather.strikeAt`), eigene Wetterwerte über dem Wetter-Typ (`Weather.hold`).
- Beim Spielstart bekommt das Spiel Tempo, Wetter und Öffnungswinkel zurück (`TitleDirector.stop`); nach „Zurück zum Titel“ beginnt die Fahrt von vorn.
- Titelmenü: Wappen und Name steigen beim ersten Zeigen auf, ein Lichtstreif gleitet ab und zu über den Namen, das Wappen glimmt (alles aus bei `prefers-reduced-motion`).

**Handy**
- Test mit einem Handy-Browser-Profil (844 × 390 und 390 × 844, 360 × 640, 320 × 568, 412 × 915; echte Touch-Ereignisse über das Protokoll): Titel, Spielstände, Editor und Spiel per Fingertipp; Joystick nach oben = volle Fahrt, nach rechts = Kurswechsel, Knopf „Links“ feuert die Breitseite.
- Ein Fingertipp auf die Spielwelt macht das Gerät zum Touch-Gerät (Laptops und Tablets mit feinem Zeiger meldeten beim Start nicht „coarse“, die Touch-Knöpfe blieben im Auto-Modus weg).
- Querformat: die Touch-Knöpfe schrumpfen mit der Höhe (80 % bei 390 px, voll ab 700 px) und bauen sich beim Drehen neu auf; Minikarte kleiner, der Auftrag als schmaler Streifen: die rechte Spalte ragt nicht mehr in die Knöpfe. Hochformat unter 420 px: das HUD schrumpft mit der Breite, Kapitäns- und Schiffstafel bleiben in ihrer Spalte (vorher lag die Schiffstafel unter dem Auftrag). „Flicken“ heißt auf dem Knopf „Fli-cken“ (der Text wurde abgeschnitten).

**Geprüft, keine Änderung nötig**
- **Befehlstasten 1–3 im echten Kampf:** Insel mit Lager, 28 Mann Truppen an Land, echte Tastendrücke: Befehl und Anzeige wechseln, die Trupps halten bei „Position halten“ (kein Weg in 3 s), laufen bei „Folgen“ zur Spielfigur (rund 20 m in 3,5 s) und rücken bei „Sturmangriff“ ein.
- Fähigkeitenbaum, Auftragsbuch, Gespräche, Taverne, Crew anheuern, Crew, Truppen, Schmiede, Markt, Faji-Schrein, Rangliste, Ruf & Ehre, Hafen und das Beute-Fenster der Belagerung: alle im neuen Stil, ohne Überlappungen (Desktop; Beute-Fenster auch Handy).
- tsc ohne Fehler, Tests und Build grün; neue Tests: `titleDirector` (12), `cssRules` (2).

## 3.0.0 – Sturmkrone 3.0: neues Gesicht und aufgeräumter Code (19.11.2026)

Nur lokal, noch nicht veröffentlicht. **Kein neuer Spielstand** (Version bleibt 14): neue Einstellungen (HUD-Größe, Sektor-Einblendung, Schadenszahlen) werden mit Standardwerten ergänzt, alte Tastenbelegungen bleiben gültig.

**Zuerst aufgeräumt: eine Quelle je Sache (Redundanz-Prüfung über das ganze Projekt)**
- **Rechenhelfer:** neues `core/mathUtil.ts` (`clamp`, `clamp01`, `lerp`, `wrapAngle`, `angleDiff`, `smooth01`, `smoothstep`, `pickOne`) ersetzt 15 lokale Kopien (Winkel drehen und Abstand in `docking`, `dockingSystem`, `flagCloth`, `compass`, `raidWorld`, `squad`, `crewAboard`, `ship`, `seaWorld`, `game`; dazu in `enemyBrain` eine Variante mit abweichender Modulo-Formel; weiche Übergänge in `dockingFx`, `shipHull2`, `vroid`, `glow`, `glbGear`, `audio`, `musicDirector`; Zufallswahl in `crewAboard`, `architecture`, `vegetation`) und **64 Stellen** mit `Math.max(0, Math.min(1, x))`.
- **Werte aus Spielständen und Einstellungen prüfen:** neues `core/sanitize.ts` (`isRecord`, `finiteOr`, `finiteOrNull`, `countOr`, `unitOr`) statt eigener Lambdas in `save/legacy`, `save/migrations`, `settings` und `raid/occupation`.
- **Zahlen und Entfernungen:** neues `core/format.ts` (`fmtInt`, `fmtPct`, `fmtDist`, `fmtNum`); das Entfernungsformat stand dreifach (Kompass, HUD, Weltkarte), `toLocaleString('de-DE')` über zwanzigmal verstreut.
- **Daten:** `data/rarity.ts` ist jetzt die einzige Quelle der Seltenheiten (Typ und Tabelle lagen in `trinkets.ts`, die Reihenfolge doppelt in `loot.ts` und `rollTrinket`, dazu ein Re-Export). Waffen, Rüstungsstufen, Proviant und Ladenpreise sind aus der Inselkarte `regions.ts` nach `data/items.ts` gezogen. **Proviant stand doppelt** (`POTION` und Verbrauchsgut mit denselben Werten) und hat jetzt eine Definition (`PROVIANT`). Die Symbole der Rüstungsstufen und Waffenlinien standen je zweimal in `game.ts` und sind Datenfelder (`ARMOR[i].icon`, `WEAPON_LINES[stil].icon`). Schiffs-Ausbauten (Namen, Texte und die Faktoren 12 / 15 / 5 % verstreut über `menus.ts` und `game.ts`) stehen in `SHIP_UPGRADES`. Das Auswählen von Setstücken für Gegner (`gearFromSet`, `gearForNpc`) war eine Kopie und ist `pickPieces`. Doppelte Namen von Ausrüstungsstücken sind eindeutig („Ronin-Kabuto“, „Schattenumhang des Fürsten“), die kopierte Kabuto-Definition ist eine Konstante.
- **Alter Code entfernt:** der Schalter `ships2()` samt der alten Schiffsfassung (alter Rumpf `hullGeometry`, alte Heckfenster und Heckgalerie, 16 Zweige in `shipBuilder.ts`; seit 2.9.74 nur noch per `?schiffe2=aus` erreichbar), `core/flags.ts` und die alte Eichentextur. **28 tote Exporte** gelöscht; `COMMANDS`, `SHIP_UPGRADE_IDS` und `upgradeEffectText` wurden stattdessen eingebaut. Prüfung: **0 ungenutzte Exporte**, kein auskommentierter Altcode.
- **Stylesheet:** `styles.css` (898 Zeilen) legte ein dunkles Design über ein helles „Toon“-Design (Zeile 514 überschrieb die Variablen von Zeile 1; `.hint`, `.cbt-banner` und mehr doppelt, Comic-Konturen in `#1b1410`) und ist durch sechs Module (1 555 Zeilen) ersetzt, siehe unten.

**Neues Design „Kapitänskajüte“ (statt platter Cartoon-Flächen)**
- Material statt Farbfläche: tiefes Mahagoni mit Maserung (kleine SVG-Kachel, nahtlos), gebürstetes Messing mit Gravur, Rauchglas (`backdrop-filter`), Pergament mit Fasern und Alterungsflecken, Eisen, Taukante unter jeder Überschrift, Nieten an Tafeln und Karten. Schrift: **IM Fell English SC** für Überschriften und Namen, **Barlow Semi Condensed** (neu, OFL, in `CREDITS.md`) für scharfe Zahlen, Alegreya Sans für Text.
- `src/ui/css/`: `tokens.css` (alle Farben, Maße, Schatten, Texturen, Ebenen als Variablen), `base.css` (Knöpfe als Messingplakette mit Lichtreflex beim Überfahren, Reiter, Regler mit Messingknauf, Schalterzeilen, Tastenkappen), `panels.css` (`.panel`, `.card`, `.parchment`, `.gauge`, `.slot`), `hud.css`, `screens.css`, `touch.css` (Knöpfe als Metallscheiben). Eine Balken-Komponente `.gauge` statt vier Balken-Stilen. Farbenblind-Modus, `prefers-reduced-motion`, Hell-/Dunkel-Doppelwerte entfallen (das Spiel ist immer dunkel).
- Bei der niedrigsten Grafikstufe entfällt das Weichzeichnen des Glases (`html[data-fx='lite']`).

**Logo und Startbildschirm**
- **Sturmkrone-Wappen** (`ui/logoSvg.ts`): Messingmedaillon mit Kompassring (72 Teilstriche, vier Himmelsrichtungs-Rauten), Sturmkrone mit Blitz, Saphir und Rubinen über gravierten Wellen, dazu das Versionsplakettchen **3.0**. Dieselbe Zeichnung ist App-Symbol (`public/favicon.svg`, PNG-Symbole neu erzeugt), Ladebildschirm-Wappen (`index.html`) und Menü-Logo; `node scripts/build-logo.mjs` baut sie.
- **Startbildschirm:** Menü als Rauchglas-Tafel rechts, das Schiff mit der wehenden Tuchflagge und der Galionsfigur steht groß im freien linken Teil (die Menükamera berücksichtigt die Menübreite); Handys im Querformat bekommen eine kompakte Fassung (alles ohne Rollen sichtbar), hochkant steht das Wappen oben und das Menü unten. Hover: Lichtreflex über die Messingplakette. Neu: **Item-Kompendium** im Hauptmenü.

**HUD komplett neu (alle Tasten, Touch-Knöpfe und Rückrufe bleiben)**
- **Raster statt Pixelpositionen:** sieben Zonen (`Hud.regions`) und eine Meldungsspalte; jede Anzeige gehört zu genau einer Zone und stapelt sich dort, darum überlappen sich Kompass, Banner, Boss-Leiste und Meldungen nicht mehr. Alle Maße in `em`: die neue Einstellung **HUD-Größe** (80 bis 140 %) skaliert HUD und Touch-Knöpfe.
- **See:** neuer **Steuerkompass** (`ui/helmDial.ts`: drehende Kompassrose mit Messingring, Kurs in Grad und Himmelsrichtung, klare Windnadel, die Spitze zeigt, wohin der Wind weht, fünf Stärke-Punkte, Plakette des Sektors); **Schiffstafel** mit Rumpf, Segel und Crew als plastische Balken, Aufschlüsselung **Seeleute und Truppen**, Feuer-Warnung, Flickfortschritt, **Nachladebalken Backbord/Steuerbord** und **Munitionswahl per Knopf** (Kugeln, Kettenkugeln, Kartätschen, Brandkugeln; die Taste wechselt weiter durch).
- **Sektor- und Titel-Einblendung** (`ui/sectorBanner.ts`): beim Segeln in einen neuen Sektor erscheinen Fahne, Name und Beiname der Macht und der laufende Musiktitel (`audio.currentTrackTitle`); wechselt nur das Stück, erscheint der Titel allein (höchstens alle 45 s). Abschaltbar.
- **Land, Kampf, Raid:** Kapitänstafel mit Leben (mit Zahl), Ausdauer, Faji, Erfahrung, Gold, Proviant, Waffenplätzen und Zeile **Offiziere / Truppen**; **Befehlstafel** `[1] Sturmangriff · [2] Folgen · [3] Position halten` (auch antippbar) und **Befehlsmodus der Schnellleiste**: solange Trupps im Einsatz sind, zeigen die Plätze 1–3 den Befehl und ruhen, die Leiste trägt den Hinweis „Befehlsmodus“, Platz 4 bleibt frei. **Endboss-Leiste:** Name, Titel, Leben mit Nachlauf, **Phasenmarken** (erreichte leuchten), Haltebalken (Break) und **Aggro-Anzeige** („Ziel: Du · Bedrohung 100 %“, aus der Bedrohungstabelle des Bosses). Belagerungstafel mit dem Hinweis zuerst. Schadenszahlen als ruhige Zahlen mit dunklem Rand; neue Beutekarten und Siegesbild im selben Stil.
- **Kontext-Plaketten:** Messingplakette mit Gravur und Tastenkappe; **Entern!** rot, **Hafen** Pergament, **Anlegen / Ablegen / Leiter / Anker** Messing, **An Deck gehen** klein und ruhig.
- **Weltkarte (M):** Messingrahmen, Seekarten-Look, neue **Liste der besetzten Inseln mit Countdown und Rückeroberungs-Warnung** (immer sichtbar, die Warnung pulsiert), Hinweis über der Legende.
- **Werft:** Ausbauten aus den Daten, **Flaggen und Galionsfiguren als Auswahlkarten** mit eigener Vorschau-Zeichnung (Drache, Walküre, Schädel, Greif; Totenkopf, Krone, Anker, Welle, Stern, Marine) und Seltenheitsrand. Pause-Menü als Zwei-Spalten-Raster.

**Einstellungen neu**
- Vier Bereiche: **Grafik & Leistung** (Preset, dynamische Auflösung, Bildrate anzeigen, Geräteinfos), **Steuerung** (alle Tasten nach Bereichen: Bewegung, Kampf, See, **Truppenbefehle**, Schnellleiste, Menüs; Touch, Kamera, Gamepad), **Audio** (Gesamt, Musik, Effekte, Umgebung, Stimmen, „Stumm bei Fokusverlust“, laufender Titel; gekoppelt an `masterVolume`, `musicVolume`, `sfxVolume`, `ambienceVolume`, `muteWhenUnfocused`), **HUD & Spiel** (Textgröße, **HUD-Größe**, Farbenblind-Modus, Sektor-Einblendung, Schadenszahlen). **Zurücksetzen je Bereich** mit Rückfrage, Änderungen wirken sofort.
- **Truppenbefehle frei belegbar:** drei neue Aktionen `cmdSturm`, `cmdFollow`, `cmdHold` (Standard Tasten 1–3 wie bisher). Solange Trupps im Einsatz sind, hat ein Befehl Vorrang vor dem Gut auf derselben Taste; legt man die Befehle auf eigene Tasten, bleibt die Schnellleiste ganz frei.

**Item-Kompendium („Alle Items im Spiel“)**
- Im Haupt-, Pause- und Einstellungsmenü. **256 Einträge, gebaut aus den Datenquellen** (`data/catalog.ts`, nichts von Hand): Waffenlinien (Klingen, Kampfhandschuhe, Foki) mit je 6 Stufen, Rüstungsstufen, Kopfbedeckungen, Schienen, Stiefel, Schilde, **alle Rüstungssets Stück für Stück samt Boss-Sets**, Talismane, Verbrauchsgüter, Schiffsklassen und Ausbauten, Galionsfiguren, Flaggen, **Fraktions-Segel und -Zier**, Munition. Reiter nach Art plus **Raid-Beute**, **Filter nach Seltenheit**, **Suche** (Name, Set, Herkunft; Umlaute und ß werden gleichgesetzt).
- **Inspektionskarte** auf Pergament: Vorschau-Zeichnung (`ui/itemArt.ts`, 30 Zeichen) in der Farbe der Seltenheit, Name, Seltenheit, Palette, Lore, **exakte Werte** (Leben, Schadensminderung, Volltreffer, Setbonus, Stufe, Rang, Preis, Reichweiten, Wirkung je Stufe), **Herkunft/Fraktion** (Laden, Beute, Raid-Endboss samt Festung) und **Besitzstatus** („im Besitz“, „noch nicht freigeschaltet“, „frei wählbar“, Stufe des Ausbaus, Anzahl im Beutel).

**Technik (für Entwickler)**
- Neu: `core/mathUtil.ts`, `core/sanitize.ts`, `core/format.ts`, `data/rarity.ts`, `data/catalog.ts`, `ui/css/*`, `ui/components.ts` (`gaugeHtml`, `goldLine`, `toggleHtml`, `sliderHtml`), `ui/helmDial.ts`, `ui/sectorBanner.ts`, `ui/logoSvg.ts`, `ui/itemArt.ts`, `scripts/build-logo.mjs`. `data/regions.ts`: `sectorLabel()` (Sektor als Daten statt privater Hilfsfunktion in `Game`). `Hud.setSea(SeaView)`, `Hud.setItemBar(…, cmd)`, `CombatOverlay.setBoss(BossView)`, `SeaWorld.selectAmmo`, `Enemy.phaseMarks`, `EnemyDef.title`, `AllyTarget.label`.
- **Falle:** ein CSS-Sammler mit `@import` ergibt in Vite 8 leeres CSS; darum importiert `main.ts` jede CSS-Datei einzeln. Alle Quelldateien haben Windows-Zeilenenden.
- `CLAUDE.md` beschreibt Designsystem, HUD-Raster, Kompendium und die Regel „eine Quelle je Sache“.

**Geprüft**
- `npx tsc --noEmit` und `npm run build` sauber, **325 Tests** (24 Dateien, vorher 308 in 22; neu: `catalog` (5), `dataIntegrity` (8), erweiterte `actions` (7): eindeutige Kennungen in allen Datenlisten, Vollständigkeit und Eindeutigkeit des Kompendiums, Seltenheitsfarben in Daten und Stylesheet gleich, Befehl-oder-Gut-Vorrang, jede Aktion in genau einem Tastenbereich).
- **Im Browser mit Playwright** geprüft (Desktop 1280 × 720 und 1280 × 800, Handy hochkant 390 × 844 und quer 844 × 390; die Konsole blieb bei allen Abläufen ohne Fehler und Warnungen): Startbildschirm mit Wappen und Flagge, See-HUD beim Segeln und Anlegen samt Munitionswahl und Nachladebalken, Land-HUD, Kampf-HUD mit Befehlstafel, Befehlsmodus, Boss-Leiste samt Aggro, Sektor-Einblendung, Besatzungs-Warnung und Belagerungstafel, Einstellungen (Grafik, Steuerung, Audio, HUD), Kompendium mit Filter und Detailkarte, Pause, Werft mit Auswahlkarten, Inventar, Weltkarte mit Besatzungsliste.
- Beim Prüfen gefundene und behobene Fehler: Wert „100 %“ brach in der Schiffstafel um; die Belagerungstafel wurde von hohen Banner-Stapeln zusammengedrückt (die obere Mitte läuft jetzt über zwei Zeilen); Meldungen lagen über dem Boss-Titel (sie stehen jetzt unter dem Stapel); der Steuerkompass lag auf den Touch-Knöpfen; Hinweis der Weltkarte lag auf der Legende; sichtbare Kachelnähte in der Holztextur (jetzt nahtlos).
- **Nicht prüfbar / Grenzen:** echtes Handy und echte Fingereingabe nicht getestet (nur Browser-Emulation mit Touch-Knöpfen); die Befehls-Tasten im laufenden Gefecht habe ich über Prüfwerte statt mit echten Trupps geprüft (die Auswahl-Logik ist getestet); das Wind-Nadel-Bild folgt der bisherigen Pfeil-Richtung (Spitze = wohin der Wind weht), ob das im Spiel intuitiv ist, muss man beim Segeln sehen; der Editor, das Fähigkeiten-Fenster, das Auftragsbuch und die Gesprächsfenster nutzen die neuen Bausteine, sind aber nur stichprobenartig angesehen.

## 2.9.93 – Lebendige Sektoren, KI-Seeschlachten an den Grenzen und Fraktions-Ehre & Ruf (18.11.2026)

Nur lokal, noch nicht veröffentlicht. **Spielstand-Version 13 → 14** (abwärtskompatibel, Migration vorhanden): neu `progress.reputation` (Ehre je Macht, Kopfgeld, erbeutete Baupläne, Zähler der Seeschlachten, Protokoll). Das Ansehen bei allen sechs Mächten steckt schon seit Version 12 in `progress.standing`; ältere Spielstände laden unverändert, behalten ihr Ansehen und bekommen leere Ehre-Felder.

**Schiffsflaggen und Galionsfiguren: Optik-Upgrade (nur lokal)**
- **Flaggen als schweres Tuch:** Mast- und Heckflagge sind fein unterteilte Tuchnetze (32 × 20 Stücke, verjüngt oder als Schwalbenschwanz geschnitten) an einem Flaggenstock mit vergoldeter Kugel, Messingringen am Tuch und einer Flaggenleine (Fall) bis zum Deck. Die Mastflagge hängt am oberen Mastteil und fällt mit ihm, wenn der Mast in der Enterphase knickt.
- **Hochauflösende Stofftextur (1024 × 640 Vektor-Embleme):** detaillierter Totenkopf mit gekreuzten Entermessern, Sturmkrone mit Blitzen und Edelsteinen, Anker mit Tau, Wellen, Kompassstern, Marine-Wappen; Gold- und Silberborte mit Ecken, Hohlsaum mit Messingösen, Leinwand-Bump (Webstruktur plus Relief der Stickerei), ausgefranste und verwitterte Kanten (`alphaTest`, doppelseitig). Schiffe der Weltmächte tragen ihre Flagge (`render/heraldry.ts`) im selben Tuch; eigene Wappen kommen über `crestId` und `registerCrest()` in `render/flagCloth.ts`.
- **Wind-Shader (`onBeforeCompile` auf `MeshStandardMaterial`, kein rohes `ShaderMaterial`: Nebel, Schatten und Licht bleiben):** das Tuch folgt dem **scheinbaren Wind** (wahrer Wind minus Fahrtwind): bei Flaute hängt es schwer herab und rafft sich am Mast, mit Wind und Fahrt streckt es sich und peitscht, bei Seitenwind schwenkt es auf die Leeseite. Die Vertex-Normalen folgen im Shader der Wellenkrümmung; im Gegenlicht glüht das Tuch warm. Kosten: 0,4 ms Logik und 3,6 ms Zeichnen je Bild (Max, ein Schiff), drei Shader-Programme insgesamt.
- **Vier skulpturierte Galionsfiguren** aus Headless-Blender (`tools/blender/build_figureheads.py`, `public/models/figureheads/*.glb`, je 31 bis 44 KB nach Draco, 4 200 bis 7 300 Dreiecke): **Gekrönter Sturmdrache** (`storm_dragon`: S-Hals mit Schuppen, aufgerissenes Maul mit Reißzähnen, Sturmkrone mit Blitzzacken, Rückenflossen), **Meeres-Walküre** (`valkyrie`: vorgeneigt, Schwingen aus drei Federreihen, Dreizack-Speer, Flügelhelm), **Leviathan-Schädel** (`leviathan_skull`: Schädel mit Hauern, Edelstein-Augen und vier Tentakel-Ornamenten mit Saugnäpfen), **Vergoldeter Greif** (`royal_griffin`: Adlerkopf mit Krone, Löwenleib, Pranken, vierreihige Schwingen). Verzierter Sockel mit Voluten (abgeschrägte Kanten, Bevel), glatte Körper, UVs ohne Überlappung, Ambient-Occlusion je Eckpunkt.
- **Materialien:** dunkles Mahagoni, Blattgold (metallisch 0,85, rau 0,28), patinierte Bronze, Bein, dunkle Hohlräume und Edelstein-Augen, die ab einer Schiffslänge je Figur (`gemGlowFrom`, 30 bis 46 m) glimmen. Sie laufen über das Toon-Material des Spiels mit Metall und Rauheit (Himmelsspiegelung, Kaskadenschatten und Konturen bleiben einheitlich) statt über ein rohes `MeshStandardMaterial`.
- **Alle 7 Klassen:** Maßstab aus Länge und Breite (`figureheadScale`: 0,8 × L/15, höchstens 2,2, die Flügel höchstens halb so breit wie der Rumpf), Sockel am Vorsteven, die Figur steht über dem Bugspriet (es tritt tiefer aus dem Vorsteven), ein vergoldeter Kragen fasst das Bugspriet ein. Geprüft auf Schaluppe, Fregatte und Leviathan.
- **Daten und Spielstand:** neue Tabelle `data/figureheads.ts` (Namen, Breite, Edelstein-Glimmen, Ersatzform). Alte Kennungen (`loewe`, `drache`, `adler`, `meerfrau`, `kraken`) aus Spielständen und Fraktionsdaten zeigen auf die neuen Figuren, nichts geht kaputt; die Werft bietet „Keine“ und die vier neuen an, die Auswahl bleibt über `ship.look.figurehead` im Spielstand. Fehlt ein Modell, erscheint die alte Grundform.
- Prüfung: 8 neue Tests (`tests/figureheads.test.ts`), 295 Tests insgesamt, `tsc` und Build sauber, Konsole ohne Fehler und Warnungen, Playwright-Nahaufnahmen von allen sechs Flaggenarten, vier Figuren auf drei Klassen, Flaute und Sturm.

**Musik und Klang: Orchester-Stems, regionale Färbung, dynamischer Mixer (nur lokal)**
- **Neue Musik als Dateien:** `scripts/generate_music.py` (mit `scripts/music_synth.py`, Python/numpy, Ausgabe über `soundfile`) rendert **51 Stems (1 670 s, 22,4 MB, 44,1 kHz Stereo, Ogg Vorbis)** nach `public/audio/music/`: mehrstimmiges Streicher-Ensemble mit Vibrato und Verstimmung, Blech mit Helligkeits-Schwellung, Akkordeon (Musette), Fidel, Chor mit Formanten, Karplus-Strong-Zupfinstrumente (Gitarre, Mandoline, Cembalo, Koto, Shamisen), Taiko, Pauken, Marschtrommel, Gefängnisglocken, Ketten, Shakuhachi und Sub-Bass; Konzertsaal-Hall (erzeugte Raumantwort, zirkulär gefaltet: der Nachhall läuft über die Loop-Naht, kein Knacks). Jeder Stem ist auf einen Zielpegel normiert und weich unter −1 dBFS begrenzt; geprüft: keine Übersteuerung, Nähte unauffällig, Bassanteil unter 6 %.
- **Manifest (datengetrieben):** `src/data/musicTracks.ts` (`trackId`, `title`, `category`, `factionId`, `bpm`, `loopStart`, `loopEnd`, dazu `group`, `layer`, `file`). Eigene `.ogg`/`.mp3`-Aufnahmen: Datei in `public/audio/music/` legen, `file` und Schleife ändern, fertig (ohne Code-Änderung). Ein Test vergleicht das Manifest mit den gerenderten Dateien (Dauer, BPM, Ogg-Kopf, Spitzenpegel).
- **Regionale Färbung** (weiches Überblenden 3 s beim Überqueren der Grenzen, Wechsel erst nach 2,5 s an derselben Stelle): **Ankerglück** (Akkordeon, Fidel, Gitarre, Rahmentrommel, Meeresbrise, 6/8), **England** (stolze Streicher, Waldhörner, Marschtrommel), **Niederlande** (Hafenshanty mit Akkordeon, Drehleier, Mandoline, Klarinette), **Deutschland** (tiefes Blech, schwere Pauken, Quinten-Motive), **Frankreich** (Barock-Streicher, Cembalo, Flöten, punktierte Fecht-Motive), **Kurogane** (Taiko, Koto und Shamisen, Shakuhachi, Sub-Bass in der In-Skala), **Marine** an Grenzfestungen und Weißwacht (tiefe Bläser, Glocken, Ketten, unerbittlicher Marsch). Jede Region hat drei Schichten (ruhig, Spannung, Kampf) und eine eigene Hafen- und Taverne-Variante.
- **MusicDirector** (`src/audio/musicDirector.ts`): Stems starten gemeinsam und werden über Gleichleistungs-Überblendungen (0,35 bis 3 s) gemischt; **offene See** blendet Percussion und Streicher bei voller Fahrt und starkem Wind ein, **Sturm** wechselt in ein eigenes Arrangement (zweite Schicht mit dem Gewitter), **Hafen** spielt die Tavernenmusik der Macht der Stadt, **Seeschlacht und KI-Grenzschlacht** das Ostinato-Stück (volle Schicht mit der Bedrohung), **Entern** setzt sofort ein (0,35 s) beim Abfeuern der Haken, **Belagerung** hat eigene Musik für **Route A (Bresche)** und **Route B (Viertel)**, jeder der **6 Endbosse** ein eigenes Thema mit **Phase 2 (Chor, schwere Trommeln, hohes Blech) ab 50 % Boss-Leben**, dazu **Eroberungs-Fanfare** beim Hissen der Spielerflagge und **Alarm-Sting** beim Start der Rückeroberungsflotte. Wichtige Effekte senken die Musik kurz ab (Ducking). Stücke werden vorausschauend geladen und höchstens fünf bleiben im Speicher; fehlt eine Datei oder kann der Browser Ogg nicht lesen (ältere Safari), spielt die prozedurale Musik weiter.
- **Umgebung:** neu **Wind in den Segeln**, **Bugwelle** (wächst mit der Fahrt), **knarzendes Schiffsholz** bei Seegang und Fahrt, **Möwen nur in Küstennähe**; Regen und Donner wie bisher (Wetter).
- **Audio-Schnittstelle** für das 3.0-Menü und das HUD: `audio.masterVolume`, `musicVolume`, `sfxVolume`, `ambienceVolume`, `muteWhenUnfocused` (alle in den Geräteeinstellungen gespeichert, Fokusverlust von Tab und Fenster), `audio.currentTrackTitle`, `audio.currentTrack`, `audio.onTrackChange(f)`, `audio.onSectorChange(f)`, `audio.onPrefsChange(f)`. Der Ton-Reiter der Einstellungen zeigt den laufenden Titel und den Fokus-Schalter.
- **Prüfung:** alle 51 Dateien laden und entschlüsseln im Browser fehlerfrei (Länge stimmt mit dem Manifest), Konsole ohne Fehler und Warnungen; Sektor-Wechsel über alle sechs Regionen, Sturm, Seeschlacht, Entern, Belagerung (Route B), Boss-Phase 2 und Rückkehr zur Region im Spiel geprüft. 13 neue Tests (`tests/music.test.ts`: Manifest, Auswahl für alle Lagen, Einstellungen), 308 Tests insgesamt, `tsc` und Build sauber. Nicht prüfbar ohne Lautsprecher: der Höreindruck (Mischung, Melodien); die Pegel sind nur gemessen. Neu rendern: `python scripts/generate_music.py` (etwa 4,5 Minuten).

**Lebendige Sektor-Patrouillen (Sektor-Treue auf See)**
- In jedem Kuchenstück fahren **Kriegs- UND Handelsschiffe der Macht des Sektors** (Deutschland um Nordwacht, Kurogane um den Glutring, England, Niederlande, Frankreich): Rumpf, Segeltuch, Segelmuster, Flagge und Galionsfigur kommen aus `data/factions.ts` und sind schon von weitem zu unterscheiden (Englands rotweiße Segel, französisches Blau, Kuroganes dunkles Purpur). Namen: „Frankreich-Kriegsschiff“, „England-Handelsschiff“. Handelsschiffe sind kleiner (höchstens Klasse 3) und flüchten; ihre Begleitschiffe gehören derselben Macht.
- An den Grenzlinien mischt sich das Bild: in Linienlage 35 % Marine-Patrouillen, bis 700 m neben der Linie 16 % Schiffe der Nachbarmacht; im Sektor selbst 100 % die eigene Macht (Stichprobe je 600 Würfe).
- **Friedliche Durchfahrt:** ab **Ansehen 20 („Freundlich“)** greift eine Macht den Spieler in ihrem Sektor nicht mehr an (außer er schießt zuerst: dann ist das Schiff „provoziert“); darunter greifen ihre Kriegsschiffe an. Kopfgeldjäger und Raid-Wachen kennen diese Ausnahme nicht.

**Dynamische KI-Seeschlachten an den Fraktionsgrenzen (Welt-Ereignis)**
- Fährt der Spieler an eine der fünf Grenzlinien heran (näher als 900 m, im Band 2 200 bis 5 200 m, nie in 320 m Nähe einer Grenzfestung), entsteht nach 30 bis 60 s (danach alle 150 bis 240 s) **eine Seeschlacht der beiden angrenzenden Mächte**: **2 bis 3 Schiffe gegen 2 bis 3** (auf Low und Mid höchstens 2 je Seite, siehe Nachprüfung), 130 m auseinander beiderseits der Linie, 640 bis 860 m vom Spieler (knapp außerhalb der Sicht; die Rauchsäule über der Schlacht verrät sie). Reine Regeln ohne three.js in `naval/battleRules.ts`, Verwaltung und KI in `NavalSystem`.
- Die Schiffe sind echte `EnemyShip`s mit `battle { id, side }`: sie jagen das nächste Schiff der Gegenseite (Breitseiten mit Vorhalt, wie die Begleitschiffe), fliehen bei schwerem Schaden und lösen sich nach dem Ende (eine Seite besiegt, 210 s oder zu weit weg) auf; Überlebende segeln als normale Patrouille weiter. Schüsse der KI untereinander wirken gedämpft (50 %) und zeigen keine Schadenszahlen, damit eine Schlacht lange genug dauert, um einzugreifen.
- **Gelegentlich greift die Marine ein** (55 %, nach 55 s): ein bis zwei Patrouillenboote, bevorzugt gegen die Schwarzsegel.
- **Markierung:** neues Zeichen **gekreuzte Kanonen mit flackerndem Mündungsfeuer** (`PoiKind 'battle'`) auf **Kompass** (auch am Rand, mit Entfernung), **Minikarte** und **Seekarte (M)** (pulsierender Ring, „Seeschlacht Frankreich ⚔ England (2:3)“, Legende). Meldung beim Beginn mit Himmelsrichtung. Geschützrauch und Mündungsfeuer der vorhandenen Kanonen-Effekte, dazu eine **Rauchsäule** über der Schlacht (bis 3,2 km sichtbar).

**Fraktions-Ehre & Ruf (`data/reputation.ts`, `FactionReputationState`)**
- **Partei ergreifen:** wer in einer Seeschlacht nur **eine** Seite beschießt (versenkt oder mindestens 30 % der Rumpfpunkte eines Schiffs zerstört), unterstützt die andere: **Ehre** (+20 und +15 je Versenktem) und **Ansehen** (+6, +5 je Versenktem, höchstens +24) bei ihr, die beschossene Macht ist verstimmt (−4, −3 je Versenktem, höchstens −20); hilft er gegen Kurogane, gefällt das auch der **Marine** (+6 Ansehen, +10 Ehre). Streuschüsse zählen nicht: erst wenn die weniger getroffene Seite mindestens die Hälfte des Schadens der anderen bekam, ist es ein Doppelspiel.
- **Doppelspiel (beide Seiten):** **maximaler Doppel-Loot** (Kisten ×2,5 und mehr davon), **drei Handelswaren** (Segeltuch, Planken, Proviant), ein **Bauplan** (`bauplan_<macht>`: je Macht einmal, senkt die Werftpreise dauerhaft um 4 %, höchstens fünf), aber **massiver Ansehensverlust** bei beiden Mächten (−18, −6 je Versenktem, höchstens −40) und der Marine (−12), **Kopfgeld** (400 + 250 je Versenktem je Macht, 200 bei der Marine) und **Kopfgeldjäger**: „Kopfgeldjäger von England“ und „Marine-Fahndungsschiff“ jagen den Spieler (höchstens zwei zugleich, sehen ihn aus 1,1 km). Ein versenkter Jäger senkt das Kopfgeld um 120; im Hafen lässt es sich **bezahlen** (Ansehen +10).
- **Folgen des Ansehens:** **Hafen-Rabatt** der Hafenmacht (5 % ab 20, 10 % ab 40, 15 % ab 60, 20 % ab 80) auf Reparatur, Ausbauten, Matrosen und Bett; die Baupläne wirken zusätzlich auf die Werft (Reparatur, Ausbauten), insgesamt höchstens −50 %. **Marine-Dienststatus ab Ansehen 60:** Marine-Schiffe **helfen im Kampf** gegen Schiffe, die den Spieler bedrohen, und **Weißwacht ist ein sicherer Stützpunkt**. Stufen: Erzfeind, Feindlich, Neutral, Freundlich, Verbündet, Ehrenbund; Meldungen bei jedem Stufenwechsel.
- Außerhalb einer Seeschlacht kostet jedes versenkte Schiff einer Macht −4 Ansehen, ein geentertes −3 (die Marine behält ihre eigenen Werte).
- **Neues Fenster „Ruf & Ehre“** (Pausemenü und Hafen): Ansehen als Balken, Stufe, Ehre mit Ehrentitel, Rabatt, Kopfgeld mit Knopf „bezahlen“, Zähler der Seeschlachten, Baupläne, letzte Taten. Hafenmenü zeigt Ansehen und Rabatt der Hafenmacht.

**Prüfungen und gefundene Fehler (Playwright, Max, Desktop und 375 × 812)**
- Geprüft: Weltkarte mit fünf Sektoren, Marine-Festungen, sechs Zitadellen (mit Weißwacht), Seeschlacht-Markierung und Legende; Schiffsfarben und Flaggen aller Mächte als Reihe; eine echte Seeschlacht (Kompass, Minikarte, Rauch, Marine-Eingriff) mit beiden Ausgängen (Partei: Ehre +35, Ansehen +11/−7; Doppelspiel: Loot ×2,5, Bauplan, Kopfgeld, Jäger); Rabatt, Kopfgeld bezahlen; friedliche Durchfahrt (Ansehen 0: Angriff, 45: friedlich) und Dienststatus (Marine hilft); Raid Route A (Durchbruch, Burg, Endboss mit Bedrohungstabelle, Sieg, persönliche Beute) und Route B (alle vier Viertel, 116 Soldaten); Besatzung mit Countdown, Rückeroberungs-Flotte, Reset ohne Verlust von Segeln und Beute; **FPS stets über 100** (Max), keine Konsolenfehler oder Warnungen.
- Behoben: Schadenszahlen der KI-Schlacht füllten den Bildschirm; Doppelspiel durch Streuschüsse; Schlachtort lag in den Riffen der Grenzfestung; Beschriftungen von Festung und Schlacht auf dem Kompass überlagerten sich; Begleitschiffe eines Händlers hatten eine fremde Macht; Kopfgeldjäger verloren den Spieler aus der Sicht; **Boss-Leiste überdeckte den Kompass**; **Weltkarte am Handy: Legende der Mächte lag über den Regionen-Knöpfen**.

**Nachprüfung der offenen Punkte (Handy-Emulation, Nacht, Kopfgeldjäger, Entern)**
- **Handy (emuliert, kein echtes Gerät):** Chromium mit Touch-Eingabe (`pointer: coarse`), Handy-Kennung, 393 × 851 und 851 × 393 und gedrosselter CPU. Touch-Knöpfe, Minikarte, Kompass, Pausemenü und „Ruf & Ehre“ sind in beiden Lagen bedienbar. Bei **2-facher CPU-Drosselung hält Mid wie Low in der Seeschlacht 60 FPS**; bei 4-facher (sehr schwaches Gerät) fielen sie auf 25 bis 37 FPS (ohne Schlacht 40 bis 56). Darum: **Low und Mid zeigen höchstens 2 Schiffe je Seite, Low eine Seite nur mit einem Schiff (3 statt 6 Schiffe), die Marine schickt dort nur ein Boot**; Schüsse und Treffer der KI weiter als 240 m vom Spieler erzeugen nur noch einen kleinen Rauchfleck (kein Ton, keine Funken, keine Splitter), die Rauchsäule ist sparsamer (eine größere Wolke alle 0,7 s, auf schwachen Stufen alle 1,1 s). Messwerte der Schlacht vorher: 17 FPS (Mid, 4×), nachher 25 bis 28.
- **Nacht mit Laternen:** Schlacht um 22:30 Uhr, aus 200 m und 95 m: Laternenketten an den Rümpfen, Mündungsfeuer und beleuchtete Rauchsäule, Kompass-Zeichen sichtbar, keine schwarzen Flächen, über 110 FPS, keine Konsolenfehler.
- **Längere Kämpfe gegen Kopfgeldjäger (100 s, Max):** höchstens zwei Jäger zugleich, sie greifen aus über 500 m an, ein versenkter Jäger senkt das Kopfgeld um 120 (900 → 780), später kommt ein Marine-Fahndungsschiff; Speicher stabil (Geometrien 1 170 bis 1 290, Programme unverändert), keine Fehler. Behoben: ein **geenterter** Jäger senkte das Kopfgeld nicht.
- **Entern mitten in einer Seeschlacht (Ablauf Haken → Ziehen → Planken → Kampf → Einholen):** Die Prise zählt wie ein Versenken für die Bilanz (Partei: Ehre +35 bei England, −7 Ansehen bei Frankreich; zusätzlich beschossene andere Seite: Doppelspiel mit Kopfgeld). Behoben: (1) **die geenterte Prise konnte von den anderen Schiffen unter den Füßen des Spielers versenkt werden** (jetzt `EnemyShip.boarded`: kein Schaden, kein Ziel), (2) **die Schlacht endete mitten im Enterkampf** (Zeit, besiegte Seite) und die Prise ging aus der Bilanz verloren (sie läuft jetzt bis zur Entscheidung weiter), (3) die Prise einer Doppelspiel-Schlacht brachte **keinen Doppel-Loot** (jetzt ×2,5).

**Entern überarbeitet: Heranziehen, Deck-Platz, Crew-Übergang**
- **Heranziehen (`planPull`/`pullPose` in `world/docking.ts`, rein und getestet):** Das Heranziehen läuft jetzt **in fester Zeit (3 bis 6,5 s)** mit sanftem Anfahren und Abbremsen, kleinen Zugwellen im Takt der Crew und einem Stoß beim Anlegen (Rucken beider Rümpfe, Gischt, Kamerawackeln, Ton). Der Gegner dreht früher ein (kürzester Weg, höchstens 90°) und liegt zuletzt nur noch seitlich an. Vorher bewegte sich das Ziel mit begrenzter Drehgeschwindigkeit und die Phase brach nach 14 s ab und **sprang** an die Endlage: bei weit entfernten oder quer liegenden Schiffen wurde die Animation übersprungen.
- **Haken an der falschen Seite behoben:** Die Bordwand des Gegners, an der die Taue greifen, wurde aus der Lage VOR dem Drehen bestimmt; nach dem Drehen (Gleichlauf oder Gegenkurs) lag oft die andere Seite zum Angreifer. Jetzt folgt sie dem Ergebnis des Drehens (`par ? −side : side`). Die Taue sind runder (6 Stücke, Parabel-Durchhang), spannen sich beim Ziehen (Durchhang 0,55 → 0,03 m) und enden an der richtigen Reling (Seillänge am Ende 3,2 bis 3,5 m in allen acht geprüften Lagen von 0° bis 315°).
- **Deck-Platz (Kampffläche, `shipBuilder.ts`):** Die freie Fläche im Arbeitsbereich des Hauptdecks stieg von 33–59 % auf **67–88 %** (Brigg 35 → 88 %, Fregatte 33 → 74 %, Galeone 49 → 82 %). Fässer und Kisten stehen **an der Bordwand im Randstreifen** (Dekor ohne Kollision, nur gegeneinander geprüft: `soft()`), Deckgeschütze stehen **in der Bordwand** (nur der Verschluss innen blockiert, höchstens 2 bis 3 je Seite), Karronaden an der Reling statt mitten auf dem Deck (vorher bei 48 % der Halbbreite, je 1,6 × 0,84 m), die Gitterluke ist flach begehbar, das Beiboot liegt **2,2 m hoch auf Böcken** (darunter ist Platz, nur vier Stützen blockieren), Mast-Blocker kleiner.
- **Crew-Übergang:** (1) **Doppelte Crew:** wurde das Deck während des Gefechts neu aufgebaut (`applyPower` bei Stufenaufstieg, Beute, Treue → `setCrew` → `setDeck`), erschienen die Deck-Kopien der Offiziere wieder und gestikulierten weiter, obwohl ihre Kämpfer drüben standen; `setDeck` blendet sie jetzt sofort wieder aus. (2) Offiziere und Trupps laufen von ihren Plätzen an Deck über die Planken und Leitern (Prüfung: alle vier Offiziere nach 3 s auf dem Feindschiff, 70 Soldaten in vier Trupps nach 6 s, keine Kopien an Deck, auch nicht nach `applyPower` und Stufenaufstieg im Kampf), am Ende gehen sie zurück und erscheinen erst bei der Ankunft wieder.

**Enterphase: kein Schiff geht mehr „einfach so“ unter**
- Gegnerische Schiffe (Begleiter und das Spielerschiff nicht) **überleben jeden Schaden mit 1 Rumpfpunkt**, egal ob durch Kanonen, Kräfte oder Feuer. Dann beginnt die **Enterphase**: Segel zerfetzt (Segel-HP 0, nur Fetzen), **ein bis zwei Masten knicken um** (oberer Mastteil samt Rahen, Korb und Segeln kippt beschleunigt über die Bruchstelle und schlägt mit Trümmern und Gischt auf, die Takelage fällt weg), **das ganze Deck brennt** (Flammenzungen, schwarzer Qualm, Funkenflug) und das Schiff treibt wehrlos (keine Geschütze, kein Kurs). Beginn mit Explosion, Trümmern, Wackeln, Banner „Kampfunfähig!“ und Meldung; die Anzeige über dem Schiff zeigt „ENTERN“, nah dran erscheint „Entern!“.
- **Zwei Wege:** entern (Beute, Legenden-Sieg, Ehre wie bisher) oder **Gnadenstoß**: ein weiterer Treffer des Spielers (Kanone oder Kraft) versenkt es. Kugeln derselben Breitseite, die noch fliegen, zählen nicht (2 s Schonfrist). Schüsse anderer Schiffe (KI, Begleiter) richten am Wrack nichts aus, die KI zielt nicht mehr darauf. Wer lange ohne Spieler brennt, geht nach 150 s weit weg von selbst unter.
- **Nur durch Entern zu besiegen:** **Legenden (Piraten- und Marine-Legenden) und die zwei größten Klassen (Linienschiff, Leviathan)**. In der Enterphase richten Kanonen und Kräfte nichts mehr aus (Hinweis „geht nie unter – nur Entern besiegt es“), sie brennen weiter, bis sie erobert werden. Prüfung: Korvette fiel nach dem zweiten Treffer, Linienschiff und Legende blieben nach 24 Breitseiten à 260 Schaden bei 1 Rumpfpunkt.
- Seeschlachten: kampfunfähige Schiffe zählen als ausgeschaltet (Überlebenden-Zähler, Ende der Schlacht) und für die Bilanz wie ein Abschuss (nur einmal, auch nach Gnadenstoß oder Entern); die Seiten stellen sich nicht mehr auf Wracks ein.
- Technik: `naval/shipSim.ts` (`ENTER_HULL`, `enterPhaseCheck`, `finishingBlow`, `cannotBeSunk`, getestet), `Ship.canDisable/noKill/disabled/enterPhase()/stepFall`, obere Mastteile als eigene Gruppen im Schiffsmodell (`ShipModel.masts`, `rigging`; je Mast verschmolzen, kaum mehr Zeichenaufrufe), `NavalSystem.arm/onDisabled`, Brand in `damageFx`.

**Full-Game-Audit (nur Fehler beheben, keine neuen Funktionen)**
Behobene Fehler:
- **Speicherleck bei jedem Raid (rund 40 MB und ~1 000 Objekte je Durchlauf):** `RaidWorld.dispose()` hängte die Bewuchs-Kacheln ab, bevor `disposeObject` den Baum besuchte. Ihre Tusche-Konturen blieben dadurch in der globalen Kontur-Liste, und über sie hing der ganze Inselbaum (Mauern, Häuser, Gelände) im Speicher. Jetzt räumt `disposeObject` alles in einem Zug ab. Messung (Speicher nach erzwungener Bereinigung): vorher +40 bis +45 MB je Raid; jetzt nach dem Aufwärmen flach (6 Raids hintereinander 920 bis 924 MB, Geometrien 783, Texturen 537, Objektzahl 39,6 k ± 0,1 k).
- **Wegfindung an Burgmauern (Offiziere und Trupps hingen fest):** (1) Zwischen aneinanderstoßenden Mauerstücken des Burgrings (0,1 bis 0,3 m Fuge) blieb im 1-m-Raster manchmal ein Zellband frei, die Wegfindung plante durch diese „Tür“, die echte Wand hielt auf. Das Raster sperrt jetzt jede Zelle, die ein Quader berührt (`inThinBox`). (2) Das Knotenlimit der A*-Suche reichte für lange Wege um Festungen nicht (Sturmzahn: 57 von 300 Zufallswegen brachen ab und liefen in die Mauer), jetzt 60 000 Knoten (alle 300 gefunden, höchstens 6 ms je Suche, im Mittel 1,2 ms). (3) Dünne Wände (0,2 m) und kleine Pfosten sind lückenlos im Raster, Zielhilfe mit gewichteter Heuristik. (4) Wer trotzdem 2,5 s ohne Fortschritt steht (Treppe, Planke, Tor, Mast), wird von `unstick` auf einen freien Punkt Richtung Ziel gesetzt (Offiziere `Ally` und Trupps `TroopSquad`).
- **Ablegen mit Crew an Land:** Offiziere und Trupps, die noch auf dem Steg oder der Insel sind, werden nicht mehr zurückgelassen: `castOff()` sagt „Deine Crew ist noch nicht wieder an Bord.“ und wartet.
- **Entern, wenn das Feindschiff während des Heranziehens oder Kampfs verschwindet oder sinkt:** sauberer Abbruch (`rescueToShip`): Brücken und zweites Deck verschwinden sofort aus dem Boden-Verbund, keine hängende Enter-Kamera. Geprüft mitten im Heranziehen und mitten im Gefecht, über zehn Abbrüche hintereinander (Heranziehen und Gefecht) ohne Speicherzuwachs (Geometrien und Texturen stabil).
Geprüft ohne Befund:
- **Raid-Instanzen, alle sechs** (England Albion, Niederlande Oranjehaven, Deutschland Adlerstein, Frankreich Soleilmont, Kurogane Yamikura, Marine Weißwacht), je zwei Durchläufe: Route A (Wachflotte, Seetor und Mauerflügel mit Lebenspunkten 3 000 / 2 200 / 2 200, Trümmer, Freigabe des Burghafens nach dem Durchbruch, Anlegen für alle 7 Schiffsklassen, vorher kein Anlegen von draußen möglich) und Route B (vier Viertel, Burgtore, Arena): 264 Laufwege von Strand und Steg zu Vierteln, Toren und Arena, **0 hängengeblieben**. Endboss und Hauptmänner erscheinen sauber, Bedrohungstabelle ignoriert ungültige Ziele, alle Boss-Angriffe haben Warnflächen, Sieg startet die Besatzung (25 Min.), Rückeroberungs-Flotte (3 Schiffe, abgewehrt: +10 Min.), Verlust, erneute Eroberung (Zählung 2) mit allen Freischaltungen.
- **Leistung bei Max:** Raid-Belagerung mit 19 Verbänden (178 Köpfe) und 22 Einzelgegnern: Zeichnen 5,0 ms, Logik 1,8 ms je Bild (Mittelwert); Seeschlacht an der Grenze: 9,5 ms Zeichnen, 0,5 ms Logik; alle 48 Inseln der Hauptkarte 4,8 bis 8,4 ms. Szenengraph ohne ungültige Matrizen oder Begrenzungen (30 000 Knoten), Konsole ohne Fehler und Warnungen.
- **Bildrunde über alle 48 Inseln der Hauptkarte** (Anfahrt aus 100 bis 500 m, Max, Tag): keine schwarzen Flächen, schwebenden Teile, Flackerflächen oder fehlenden Bauten; Sturm und Nebel in den hinteren Meeren verdecken die Festungen aus der Ferne (Nahaufnahmen der Raid-Inseln siehe oben). Nicht geprüft: Nahaufnahmen der Häuser auf Z-Fighting und ein echtes Handy.
- Speicher: Raid betreten und verlassen (6 Durchläufe) und Entern abbrechen (über zehn Durchläufe) lassen weder Geometrien, Texturen noch Objekte wachsen.

**Technik (für Entwickler)**
- Neu: `data/reputation.ts` (rein: `REP`, Stufen, Rabatte, `judgeBattle`, `battleOutcome`, `applyOutcome`, `cleanReputation`), `naval/battleRules.ts` (rein: `BATTLE`, `borderAxes`, `battleSite`, `sideSize`, `compassWord`). `NavalSystem`: `battles`, `startBattle`/`updateBattles`/`finishBattle`, `battleMarks()`, `forceBattle()`, `callHunters()`, `bountyOf`, Hooks `battleStart`/`battleEnd`; `SeaWorld.battleMarks`, `onBattleStart`/`onBattleEnd`/`bountyOf`; `Game`: `battleEnded`, `reputationView`, `payBounty`, `harborStanding`, Preise über `yardK`/`crewK`/`restPrice`; Menüs `showReputation`.
- Tests: `tests/factions.test.ts` um 18 Tests erweitert (Sektor- und Linienwinkel, Schlachtort samt Grenzfestungs-Abstand, Ehre-/Ruf-Logik, Migration 13 → 14, Bedrohungs-Aggro, Besatzungs-Timer und Reset); **272 Tests**, `tsc` und `npm run build` fehlerfrei.
- Nicht geprüft: echtes Handy, Nacht mit Laternen, Schlacht mit Spieler-Crew im Entercombat, Kopfgeldjäger-Kämpfe über längere Zeit, Balance der Beträge (geschätzt).

## 2.9.92 – Endgame-Raids: Hauptmänner, sechs Endbosse mit Aggro-System und Insel-Besatzung mit Rückeroberung (18.11.2026)

Nur lokal, noch nicht veröffentlicht. **Spielstand-Version 12 → 13** (abwärtskompatibel, Migration vorhanden): neu `progress.conquest` (je Insel `occupiedUntil`, `conquestCount`, Stand der Rückeroberungs-Flotte) und `progress.unlocks` (Fraktions-Segel, Verzierungen, erbeutete Boss-Stücke). Ältere Spielstände laden unverändert und bekommen leere Felder.

**Verbände, Hauptmänner und Aggro in den Festungen**
- **Dichte Verbände (Frontlinie für die Massencrew):** in den vier Vierteln, am Burgtor und im Burghof stehen geschlossene Formationen schwächerer Soldaten (6 bis 12 Mann). Jeder Verband ist **eine Entität** (`TroopSquad`, `hostile`) und wird als `InstancedMesh` gezeichnet (ein Zeichenaufruf je Truppentyp, Uniform der Macht): Route B rund 190 Soldaten, Route A rund 80. Sie stehen auf Posten, rücken erst vor, wenn jemand näher als 22 m kommt (nach einem Treffer 48 m), und kehren zurück. Die eigenen Trupps (Massencrew) greifen sie an und werden von ihnen angegriffen; die Spielfigur trifft einen Verband mit jedem Schwung und jeder Fähigkeit (mehrere Köpfe je Hieb).
- **3 bis 4 Hauptmänner** je Raid (Route B vier, Route A drei), **stark gepanzert** (42 % Schaden prallen ab, rund 2,8-fache Lebenspunkte eines Garnisons-Hauptmanns) mit **eigener Aura** (Bodenring): *Schlachtruf* (+30 % Schaden), *Bollwerk* (−32 % erlittener Schaden), *Eilmarsch* (+25 % Tempo), *Feldscher* (Heilung). Die Auren wirken auf Einzelgegner und auf Verbände im Umkreis.
- **Bedrohungstabelle (`ThreatTable`, `combat/threat.ts`):** Hauptmänner und Endbosse haben statt eines festen Ziels eine `Map<entityId, Bedrohung>`. Schaden erzeugt Bedrohung (1:1), Nähe ein wenig, Heilung die Hälfte; ein Wechsel des Ziels braucht **110 % (Nahkampf) bzw. 130 % (Fernkampf)** der Bedrohung des bisherigen Ziels; Tank-Offiziere **spotten** alle 6 s; Bedrohung verblasst langsam, Gefallene fallen heraus. Schlüssel ist die `EntityId`: Spielfigur, Offiziere, Trupps und später Mitspieler laufen durch dieselbe Tabelle. Fähigkeiten laufen über `Enemy.targetEntityId` (`ZoneSpec.at`: `target`, `behind`, `allies`, `scatter`). Die Raid-Tafel zeigt die drei Spitzenwerte der Bedrohung.

**Sechs einzigartige Endbosse (zwei Kampfphasen, rote Warnflächen, eigene Fähigkeiten)** – Phase 2 beginnt bei 50 % Leben mit Brüllen und kurzer Unverwundbarkeit; jede Boss-Attacke wird vorher als rote, sich füllende Bodenfläche angezeigt (Kreis, Ring, Linie, Kegel; mit Bildern am Boden: Fässer, Granaten, Runen, Ketten, Signalstrahl). Der Schaden kommt nur über die Flächen und trifft auch Offiziere und Trupps.
1. **England · Lord-Admiral Blackwood:** Pistolensalve (Fächer aus Linien), *Artillerie-Signal* (Leuchtspur, dann Granaten auf jedes Ziel und verstreut), Säbelkombo (zwei Kegel hintereinander); Phase 2: Breitseite (9 Einschläge), Fünffach-Salve, Enterschwung.
2. **Niederlande · Generalgouverneur Van Der Berg:** Hellebardenschwung und -stoß, *Söldner-Schildwall* (ruft zwei Verbände als Wall), *Granaten-Fässer*; Phase 2: Wirbel, Dreifach-Stoß, Fässer-Salve, Schildwall mit Musketieren.
3. **Deutschland · Großkomtur von Eisenstein:** Zweihänderhieb, *Schockwellen-Stampfer* (zwei bzw. drei Ringe nacheinander), *Panzerwall* (**unverwundbare Frontal-Deckung**: Treffer von vorn prallen ab, Flanke und Rücken sind offen; Tempo −40 %).
4. **Frankreich · Marquis-Amiral De Valois:** ultraschnelle Rapier-*Ausfallschritte* (der Boss springt die Linie entlang), Doppelstich, *Parier-Konter* (ein Treffer in der Haltung löst einen Gegenschlag auf den Angreifer aus), *Königsgarde-Ruf* (zwei bis drei Verbände flankieren).
5. **Kurogane · Schattenfürst Kurogane:** Doppelkatana-*Schattenschnitt* (gekreuzte Linien), *Dunkle Feuerwellen* (bis zu vier Ringe nacheinander), *Schattensprung* (**Teleport-Dash** hinter das Ziel; die Landefläche ist vorher markiert), Nachtfeuer.
6. **Marine · Großadmiral Valken, Oberster Gefängniswärter:** *Gerechtigkeits-Kanonenfaust* (Linie plus Einschlag beim Ziel), Schockwellen-Hiebe, *Seestein-Kettenfesseln* (Fläche bei jedem Ziel: **Bewegung gebunden**, −62 % bis −70 % Tempo für 3,6 bis 4,5 s), *Elite-Marine-Verstärkung* (zwei bis drei Verbände).
- **Boss-Modelle aus Blender (`public/models/bosses/`, 14 Dateien, zusammen 209 KB):** je Boss eine Kopfbedeckung (Admiralszweispitz, Morion, Topfhelm mit Adlerschwingen, Federhut mit Lilienbrosche, Kabuto mit Dämonenmaske und Mondsichel, Admiralsmütze mit Anker) und eigene Waffen (Marinesäbel + Steinschlosspistole, Hellebarde, Zweihänder, Rapier mit Prunkgefäß, Katana + Wakizashi, Kanonenfaust). Skript `tools/blender/build_bosse.py`, Beute-Sets `boss_<macht>` in `data/gear.ts` (`raid: true`: fallen nie aus Zufallsbeute und stehen in keinem Laden).
- **Persönlicher Raid-Loot (`raid/raidLoot.ts`):** jeder Teilnehmer (`participantId` im `RaidPartyContext`) bekommt seinen **eigenen, deterministischen Wurf** (Instanz + Teilnehmer + Boss), nichts wird geteilt. Gold und Erfahrung nach Beitrag (Schaden an Bauwerken, versenkte Schiffe, Kills; mindestens 60 %), garantiert **ein neues Boss-Stück** (erste Eroberung zwei: Waffe und Kopfbedeckung), **Fraktions-Segel** bei der ersten Eroberung, **Fraktions-Verzierung** bei der zweiten, danach 25 % für noch Fehlendes; Dubletten werden zu Beutemarken (Gold). Nach dem Sieg zeigt ein Fenster die persönliche Beute.

**Insel-Besatzung und Rückeroberung (wiederholbares Endgame)**
- Nach dem Fall des Endbosses gehört die Festungsinsel dem Spieler für **25 Minuten aktiver Spielzeit** (`meta.playTime`: Menüs und Pausen zählen nicht). **Hinweis zu „3 Ingame-Tage“:** ein Ingame-Tag dauert in diesem Spiel 24 Minuten (`DAY_MINUTES`), 25 Minuten sind also rund ein Tag; maßgeblich ist die Spielzeit, die Anzeige nennt beides („24:10 · ≈ 1 Ingame-Tag“).
- **Während der Besatzung:** alle Banner der Macht werden durch die **Flagge des Spielers** ersetzt (72 Meshes, 12 Zwillings-Banner an Albion), **sechs Wachtrupps** (instanziert, zwei je Rundgang: Burghof, Wehrgang, Tor – Mitte – Tor) patrouillieren Stadt und Burg, **alle 2 Minuten Tribut** (Gold plus Proviant), und die Kontext-Taste an der Küste öffnet den **sicheren Hafen** (Werft, Truppen, Rast) statt der Belagerung. Auf besetzten Inseln erscheint keine Garnison.
- **Countdown** auf der **Weltkarte (M)** (goldener Ring mit Fahne und Zeit, Info-Fenster) und im **Insel-Banner** oben in der Mitte (erscheint in 900 m Nähe).
- **Gegenangriff:** unter 5 Minuten schickt die ursprüngliche Macht eine **Rückeroberungs-Flotte** (3 bis 6 Kriegsschiffe, wächst mit Eroberungen und abgewehrten Flotten): Warn-Banner, rotes **Alarm-Zeichen auf Kompass und Weltkarte** (mit der Lage der Flotte). Sie läuft virtuell an und erscheint als echte Schiffe, sobald der Spieler 1 500 m nah ist. **Versenkt der Spieler alle Schiffe**, verlängert sich die Besatzung um **10 Minuten** (höchstens viermal) und er bekommt **Ehre** (+150 Ruhm und mehr). **Greift er nicht ein oder scheitert er**, erobert die Macht die Insel zurück: Banner und Garnison kehren zurück, der Raid mit Endboss ist **wieder frisch spielbar**.
- **Dauerhaft (`SaveData`):** `conquestCount`, freigeschaltete Fraktions-Segel und -Verzierungen und erbeutete Boss-Stücke gehen bei einer Rückeroberung **nie verloren**. In der **Werft** wählt man erbeutete Segel (Muster, Wappen und Flagge der Macht) und Verzierungen (Galionsfigur und Zierstreifen).
- Namen: die Marine-Festung heißt im Spiel weiter **Weißwacht** (Gefängniszitadelle); der Name aus der Vorlage („Impel Down“) wurde nicht ins Spiel übernommen (eigene Namen, siehe Projekt-Briefing).

**Technik (für Entwickler)**
- Neu: `combat/threat.ts`, `raid/raidBosses.ts` (Boss-, Hauptmann- und Aura-Daten), `raid/raidLoot.ts`, `raid/occupation.ts` (Zustandsmaschine, rein), `raid/horde.ts`, `core/occupationSystem.ts`, `world/garrison.ts`, `ui/occupationBanner.ts`, `tools/blender/build_bosse.py`, `tests/endgame.test.ts` (36 Prüfungen).
- Geändert: `Enemy` (`defOverride`, `threat`, `targetEntityId`, Rüstung, Aura-Faktoren, Deckung, Konter, Wartezeiten der Fähigkeiten, zwei Phasen über `def.phases`/`phaseAt`), `CombatSystem` (Zielwahl über die Tabelle, `mass`/`foes` für Verbände, `foeHit`, Auren und Ringe, Boss-Fähigkeiten `mechTelegraph`/`mechStrike`, Streuflächen, Schaden auch an Crew, **langlebige Flächen** verfallen nur bei Tod, Break und Phasenwechsel), `ZoneSystem` (Bilder, `sticky`/`solo`), `TroopSquad` (`hostile`, `aggroR`, `patrol`, Auren), `TroopRenderer` (Uniform und Kapazität je Darstellung), `RaidDirector` (Verbände, Hauptmänner, Boss, Verstärkung, Beute), `NavalSystem.spawnReconFleet/reconAlive/clearRecon`, `SeaWorld` (`setOccupied`, Banner-Tausch über `userData.bannerPose` – die Banner-Meshes bleiben beim Verschmelzen der Insel eigene Netze –, Wachen), `islandDress` (Wachrundgänge), Weltkarte, Kompass (`alarm`), Raid-Tafel, Werft, Hafen.
- Zahlen: Bosse 1 900 bis 2 900 Lebenspunkte Basis (bei Stufe 17 rund 10 000 bis 15 000), Rüstung 10 % bis 34 %.
- Geprüft: `npx tsc --noEmit` fehlerfrei, 254 Tests bestehen. Im Browser (echte GPU, Entwicklungsserver): Raid bis zum Sieg mit Beute, Banner-Tausch, Wachen, Flotte erscheint, wird versenkt, verlängert; Ablauf und Rückeroberung; alle Angriffe von England in beiden Phasen, Fähigkeiten von Niederlande, Deutschland, Frankreich (Konter, Ausfallschritt, Verstärkung), Kurogane (Sprung, Wellen, Schnitt) und Valken (Fesselung); Verbände 118 bis 146 fps; **Speicher über drei Raid-Zyklen stabil** (Geometrien 897/899/898, Texturen 537, Shader 427).

**Bekannte Grenzen (ehrlich)**
- Nicht im Browser geprüft: einzelne Angriffe der Phase 2 von Kurogane, Valken und Niederlande, Nachtbetrieb, echtes Handy und ein vollständiger Kampf gegen jeden Boss mit Crew (Lebenspunkte und Schäden der Bosse sind geschätzt und brauchen Spieltests).
- Die Boss-Modelle sind stilisiert (Köpfe: 1 600 bis 3 600 Flächen); die Gesichtsmaske des Kurogane und die Federn wurden nur im Blender-Vorschaubild und im Spiel von weitem geprüft.
- Offiziere kämpfen nur gegen Einzelgegner, nicht gegen Verbände (sie werden aber angegriffen und können spotten).
- Ein Mehrspieler-Backend fehlt weiterhin (Daten und Tabelle sind dafür vorbereitet: Entitäts-Schlüssel, `participantId`).

## 2.9.91 – Welt 3, Teil 2: Belagerungs-Raids auf den Festungsinseln und der Marine-Hafenstadt (18.11.2026)

Nur lokal, noch nicht veröffentlicht. **Spielstand unverändert** (Version 12): eine Belagerung wird nie gespeichert; wer mitten im Raid speichert, steht beim Laden wieder am Ausgangsort. Neu im Spielstand nur das Flag `raidwon_<Insel>` (erster Sieg zahlt voll) und die Marine-Haltung nach einem Angriff auf Weißwacht.

**So läuft eine Belagerung**
- **Wo:** an den fünf großen Fraktionsinseln (Albion, Adlerstein, Yamikura, Oranjehaven, Soleilmont) und an der Marine-Hafenstadt Weißwacht. Wer mit dem Schiff an die Küste kommt und die Kontext-Taste drückt, sieht statt des Hafens das **Briefing**: Festung, die zwei Angriffswege, die eigene Flotte und die Söldner. Mit „Belagerung beginnen“ startet die Instanz.
- **Marine-Sonderregel:** Weißwacht wird wie die fünf Fraktionsinseln belagert. **Nur bei hohem Dienststatus (Marine-Ansehen ab 60)** ist sie dein sicherer Stützpunkt: dann öffnet sich der Hafen, und gekämpft wird nicht. Ein Angriff auf Weißwacht kostet sofort 40 Ansehen, der Sieg macht die Marine zu deinem erbitterten Feind (−100).
- **Flotte und Söldner:** Flaggschiff plus eigene Begleitschiffe (ab Rang 5 eins, ab Rang 8 zwei), dazu **Söldner-Eskorten für je 650 Gold**, höchstens drei Begleitschiffe insgesamt. Sie werden im Briefing angeheuert, vor dem Start.
- **Phase 1 · Seeschlacht:** fünf **stark gepanzerte Wachschiffe** mit eigenen Segel- und Mannschaftswerten (Schiffsklasse, Rumpf, Segel-HP und Crew je Wachschiff aus den Daten, zusätzlich nach Stufe und Gruppengröße skaliert) bewachen die Zufahrt, Küstenbatterien feuern auf deine Schiffe. **Erst wenn die Wachflotte gefallen ist, werden die Landungszonen frei.** Wer vorher versucht, an Land zu gehen, bekommt den Hinweis dazu.
- **Phase 2 · Sturm auf die Burg** über eine von **zwei Routen**. Die Wahl trifft man mit dem ersten Schritt: Anlegen am Burgsteg (Route A) oder Landung an einer Strandbucht (Route B).

| | **Route A · Von See** | **Route B · Landung im Flachland** |
|---|---|---|
| Idee | kurz und wuchtig | lang, voller Gegner |
| Weg | **Seetor und beide Mauerflügel** (je mit eigener Kennung und Lebenspunkten) mit den Schiffskanonen zusammenschießen; Küstenbatterien feuern, bis sie zerstört sind | an einer der **drei Landungsbuchten** am flachen Strand an Land gehen, dann **vier Viertel** nacheinander erobern |
| Zustände | je Bauwerk **intakt → beschädigt (unter 65 %) → durchbrochen**, mit sichtbaren Trümmern, Rauch und Einsturz | Viertel: Flachland-Strand & Vorposten, Hafen- & Kontorviertel, Marktplatz & Kasernen-Barrikaden, Steiler Burgaufstieg |
| Freischaltung | Wenn Tor und beide Flügel **durchbrochen** und die Wachflotte gefallen sind, werden die **Anlege-Plätze im inneren Burghafen** frei; Gangway/Strickleiter direkt vor dem Burgtor | jedes Viertel gilt als erobert, wenn alle Gegner gefallen sind; danach „hinauf zur Burg“ |
| Gegner | kleine Torwache, danach die Burg mit Kommandant | **deutlich mehr Gegner** (rund 70 Kämpfer in vier Vierteln), **Dachschützen** auf den Schützenhäusern und Straßensperren |
| Lohn | 1 800 + 220 je Stufe Gold, 900 + 140 je Stufe Erfahrung | **ein Viertel mehr** (Route B) |

- **Burg und Kommandant:** in beiden Routen am Ende der Kommandant der Festung (Albion – Lord Ashcombe, Adlerstein – von Eisenfels, Yamikura – Shōgun Kurosawa Rein, Oranjehaven – Van der Decken, Soleilmont – d’Aurevilly, Weißwacht – Großadmiral Eisenwacht) mit seiner Garnison. Sieg: Banner und Lohn, Wiederholung zahlt die Hälfte.
- **Rückzug:** über das Pausenmenü („Belagerung abbrechen“), wenn das Flaggschiff sinkt oder wenn man den Kampfplatz weit verlässt. Das Flaggschiff kehrt an den Ausgangsort zurück, die Festung bleibt bestehen. **K.O. zu Fuß** holt dich aufs Schiff; beim nächsten Landgang **treten alle Überlebenden der Garnison wieder an ihrem Platz an** (auch der Kommandant), damit kein Viertel für immer bei „15 von 16“ hängen bleibt.
- **Anzeige:** Raid-Tafel links (Phase, Ziele der Route, Lebensbalken von Tor, Mauern und Batterien, Viertel mit Fortschritt, Hinweis, was jetzt zu tun ist); auf Karte und Kompass erscheinen Landungsplätze (Zielmarke), das Seetor (Zitadelle), Batterien (Feind) und die Burg (Boss).

**Leistung: die Instanz ersetzt die Welt, statt sie zu ergänzen**
- Beim Betreten wird die **Hauptkarte angehalten**: alle übrigen Inseln, Siedlungen, Bewuchs-Blöcke, Ereignisse und das Leben auf dem Meer ruhen (versteckt, nicht gelöscht); das Gelände der Instanz ersetzt den Boden und die Kollisionsliste der Welt. Die Kamera, der Seegang und die Wetterlage laufen weiter (die Nebel-Wetter der Region werden für den Raid auf „bewölkt“ gestellt, danach kehrt das Region-Wetter zurück).
- Die Raid-Insel ist **eine einzige Wurzelgruppe** (`RaidWorld`): beim Verlassen (Sieg, Rückzug, Spiel beenden, anderer Spielstand) wird sie samt Gelände, Mauern, Trümmern, Vegetation, Stegen, Wachschiffen, Batterien, Gegnern und Kollidern **mit `.dispose()` abgebaut**. Gemessen über drei Raids hintereinander in der echten Grafikkarte: Geometrien, Texturen und Shader-Programme bleiben nach jedem Zyklus **auf demselben Stand** (kein Wachsen).
- Gegner erscheinen **gestaffelt (höchstens einer je 0,14 s)** und in **Wellen**: eine neue Welle kommt erst, wenn von der vorigen höchstens drei stehen; auf der Insel sind höchstens rund zwölf Kämpfer gleichzeitig aktiv. Dachschützen sind feste Posten (kein Laufen, keine Wegsuche).
- **Messwerte im Browser** (echte GPU, Entwicklungsserver, Hochformat nicht geprüft): Seeschlacht und Küste 80–130 fps; Landungskämpfe mit bis zu 8–12 gleichzeitigen Gegnern 90–115 fps, kurzzeitige Tiefs beim massenhaften Erscheinen/Sterben **nicht unter 52 fps** (60 fps-Ziel gilt für Mid auf Handy; dort **nicht gemessen**).

**Die Insel (rund 700 × 700 m)**
- **Insel-Gelände** je Macht aus dem Startwert (`seed`): Küstenlinie mit einer **Bucht für den Burghafen** und einem **langen Flachstrand** gegenüber (Route B), Hügel unter Burg und Vierteln, Wege zwischen den Vierteln, Bewuchs als Instanzen.
- **Einebnung** der Fundamente mit `flattenTerrainFootprint` (Gelände und Laufhöhe geben die Fläche für Mauern, Stege, Häuser und Burg frei), Burg und Häuser stehen auf **exakten, gedrehten Kollisionsrechtecken** (keine unsichtbaren Wände, kein Einsinken, keine überlagerten Flächen).
- **Schiffe stoßen sich an der Küste nicht mehr durch Bauwerke:** Mauern, Seetor und Türme sind zusätzliche Hindernisse für Schiffe (`shipBlockers`).

**Technik (für Entwickler)**
- Neu: `src/raid/raidTypes.ts` (reine Daten und Typen: `RaidInstanceSession`-Zustand, `RaidPartyContext`, `RaidParticipant`, `RaidObjective`, Bauwerke, Landungsplätze, Viertel, Wellen), `raidLayout.ts` (`buildRaidLayout(factionId, seed, seaAngle)`, deterministisch, JSON-tauglich), `raidSession.ts` (`RaidInstanceSession`: Phasen, Ziele, Anlege-Plätze, Bauwerks-Zustände, Viertel-Fortschritt, **Ereignisse für mehrere Spieler**), `raidRules.ts` (Zugang, Söldner, Lohn), `raidWorld.ts` (Meshes, Kollider, Zerstörung, `flattenTerrainFootprint`) und `raidDirector.ts` (verbindet Sitzung, Welt, Seegefecht und Kampf über einen schmalen `RaidHostWorld`-Adapter, den `SeaWorld` baut). Anzeige: `ui/raidPanel.ts` mit CSS `.raid-panel`.
- **Kontext für Koop:** `RaidPartyContext { raidInstanceId, factionId, seed, leaderPlayerId, participants, sharedObjectives }`; `participants` und die Fortschritts-Trigger (Wachschiffe, Bauwerks-Treffer, Landungsplätze, Viertel) kennen **mehrere Spieler**, `claimSlot` ist je Spieler. Rein getestet in `tests/raid.test.ts` (21 Prüfungen: Layout-Maße und Determinismus, Phasen, Landeregeln, Bauwerks-Zustände, Mehrspieler-Ziele, Zugang, Söldner, Lohn, JSON-Rundlauf).
- Anbindung: `SeaWorld.startRaid/abortRaid/retreatRaid/raid`, `onRaidRequest/onRaidView/onRaidEnd`, `goAshore` zeigt auf `RaidDirector.landing`, `arriveAshore` auf `onAshore`; `NavalSystem.raidMode/raidTargets/raidEscorts/spawnGuard/fireBattery`; `CombatSystem.spawnWave(…, opts { power, name })`; `Enemy.perch` (Dachschützen); `IslandGround.shipBlockers`; `DockingSystem.clearBerthCache`; `Game.openRaidRequest/raidBriefing/beginRaid/raidEnded`, `Menus.showRaid`.
- `SeaWorld.saveState()` meldet während eines Raids den **Ausgangsort** (nie die Lage in der Instanz).
- **Koordinaten:** das Layout liegt in Inselkoordinaten und wird mit `theta = seaAngle − π/2` in die Welt gedreht; Orte der Welt gegen Layout-Daten immer mit `x − def.x, z − def.z` vergleichen (ein früher Fehler: die Landung ging nie, weil beide Systeme gemischt waren).
- Erwähnenswerte Zahlen: Schadensfaktor von Schiffskugeln auf Bauwerke ×3,2, Lebenspunkte Seetor 3 000, Mauerflügel 2 200 je Seite, Türme 2 600, Batterien 1 300/1 300/1 100 (Reichweite 230–250 m).
- Tests: 218 bestehen (`npx vitest run`), `npx tsc --noEmit` fehlerfrei, Browser-Prüfung mit Playwright an Albion (Route A komplett bis Sieg und Rückkehr; Route B: Landung, vier Viertel, Dachschützen; K.O. und erneute Landung).

**Bekannte Grenzen (ehrlich)**
- Die „Gegnermassen“ von Route B sind **einzelne Figuren in Wellen** (höchstens rund zwölf gleichzeitig aktiv), keine instanzierten Feind-Trupps wie bei den eigenen `TroopSquad`-Massentruppen. Spürbar mehr als bei Route A, aber nicht tausend Soldaten.
- Söldner-Eskorten sind vorhandene **Begleitschiffe** (zählen wie eigene); eigene Flotten-Befehle gibt es noch nicht.
- Die **Instanz ist für mehrere Spieler gebaut** (Daten, Ereignisse, Tests), im Spiel gibt es aber noch nur **eine lokal gesteuerte Spielfigur**; ein Mehrspieler-Backend fehlt.
- **Nicht geprüft:** echtes Handy, Nachtbetrieb mit allen Laternen im Raid, ein Kampf gegen alle Garnisonen ohne Testhilfe, Raid-Beginn und -Ende bei Weißwacht und den anderen vier Mächten im Browser (Albion/England ist die getestete Insel; die Fraktionsdaten sind für alle gleich aufgebaut).
- Die Weltkarte zeigt während eines Raids nur die Raid-Insel.

## 2.9.90 – Welt 3, Teil 1: Fünf Großmächte, die Marine, Kuchenstücke und der äußere Rand (18.11.2026)

Nur lokal, noch nicht veröffentlicht. Spielstand-Version 11 → 12 (Ansehen bei der Marine, Migration vorhanden: ältere Spielstände bleiben lesbar; Piraten starten bei −40, Marine-Anwärter bei +60).

**Die Welt gehört jetzt fünf Mächten – und die Marine hält die Grenzen**
- **Fünf Kuchenstücke zu je 72°** (0° = Norden, im Uhrzeigersinn). Sie decken sich mit den fünf Ringmeeren: **England** = Nebelarchipel, **Deutschland** = Nordwacht, **Kurogane** = Glutring, **Niederlande** = Sturmgürtel, **Frankreich** = Schlundriff. Die Reihenfolge folgt der Landkarte (England grenzt an Frankreich und die Niederlande, Deutschland an die Niederlande und Kurogane).
- **Ankerglück bleibt unabhängig und neutral.** Glutring ist fest Kurogane, Nordwacht fest Deutschland.
- **Alle übrigen Inseln sind verteilt:** die zwölf Inseln der Bernsteinsee gehören je vier England (Möwennest, Sonnenstrand, Krähenfels, Bernsteinbucht), den Niederlanden (Leuchtfeuer, Grünmark, Palmenküste, Sturmklippe) und Frankreich (Fährholm, Rabenriff, Muschelruh, Sturmzahn). Wer in ein fremdes Kuchenstück ragt, ist eine **Kolonie** (gestrichelter Ring auf der Karte): Krähenfels, Bernsteinbucht, Leuchtfeuer, Palmenküste, Fährholm, Rabenriff. Jede Insel trägt das Banner ihrer Macht an der Landestelle; die Wachen tragen die Uniform ihrer Macht.
- **Die Marine (sechste Macht, ohne Kuchenstück):** weiß-marineblaue Uniformen mit Gold, weiße Kalkstein-Zitadellen mit hohen Wachtürmen und Zellenblöcken, weiße Kriegsschiffe mit blauen Streifen und Möwen-Anker-Wappen.
  - **Fünf Grenzfestungen genau auf den fünf Grenzlinien** (Nordkap, Schwarzwacht, Südwall, Westgischt, Kanalwacht) bei rund 3 000 m, je mit **zwei Patrouillenbooten**, die auf der Grenzlinie kreuzen, sobald man näher als 560 m kommt. Auch auf freier See fahren an den Grenzlinien oft Marine-Schiffe.
  - **Hauptquartier Weißwacht** (Hafenstadt und Gefängnisfestung nach dem Vorbild eines Hochsicherheits-Gefängnisses) am äußeren Kartenrand bei 5 080 m, ein Zellenblock-Komplex hinter einem Ring aus hohen Wachtürmen.
  - **Sonderstatus nach Ansehen** (−100 … +100): ab 20 **verbündet** (kein Angriff, Festungen und Hauptquartier sind nicht angreifbar, im Lager der Marine), 0 … 19 **neutral** (die Wachen beobachten nur), unter 0 **feindlich** (Schiffe und Garnisonen greifen an). Marine-Schiffe zu versenken kostet 8 Ansehen (Entern 5), Schwarzsegler der Kurogane zu versenken bringt 2. Wer auf ein Marine-Schiff schießt, macht es sofort feindlich. Die Haltung steht im Inselfenster der Weltkarte.
- **Die Welt ist größer:** äußeres Band zwischen 4 000 und 5 800 m. **Weltradius 4 000 → 5 800 m** (`WORLD_CORE_RADIUS` bleibt 4 000), Weltrand-Mauer 5 730 m. Hinter den Grenzfestungen steigt die Schiffsstärke bis +4 (bisher +2).
- **Sechs gewaltige Endgame-Festungen am Rand:** je eine im Kuchenstück jeder Macht (330 m Radius, Stufe 17–20) und die Marine-Hafenstadt Weißwacht (380 m, Stufe 22). Ihre Bastionen und Hallen sind 1,4- bis 1,8-fach vergrößert, in der Mitte wartet der Kommandant mit seiner Garnison (Albion – Lord Ashcombe, Adlerstein – von Eisenfels, Yamikura – Shōgun Kurosawa Rein, Oranjehaven – Van der Decken, Soleilmont – d’Aurevilly, Weißwacht – Großadmiral Eisenwacht).

**Jede Macht hat ein eigenes Gesicht – Schiffe schon von weitem zu erkennen**
| Macht | Rumpf | Segel | Flagge |
|---|---|---|---|
| England | dunkelbraun mit Goldstreifen | weiß, rotes St.-Georgs-Kreuz, Wappenschild | Union-Flagge |
| Niederlande | dunkelblau mit orangem Streifen, **bauchig** (volleres Heck und Bug) | Orange-Weiß-Blau, VOC-Zeichen | Oranje-Weiß-Blau mit VOC |
| Deutschland | dunkle Eiche, Goldband | schwarz-weiße Bahnen, schwarzer Adler | Schwarz-Weiß-Schwarz mit Adler |
| Frankreich | weiß mit Gold | königsblau mit goldenen Lilien | weiß mit Lilien und blauem Saum |
| Kurogane | pechschwarz, blutrotes Band | blutrot mit schwarzen Klingenhieben, Dämonenmaske | schwarz mit rotem Klingenband und Maske |
| Marine | weiß mit blauem Streifen | weiß mit blauen Bändern, Möwe über Anker | weiß mit blauen Rändern, Anker und Möwe |

- **Festungen:** England **Kalkstein-Sternfestung** (Sternbastionen an den Ecken), Niederlande **Backstein-Kontore mit Treppengiebel und Tretradkränen**, Deutschland **Granit-Küstenbastionen mit Kasematten** (auch auf Festung Nordwacht), Frankreich **Sandstein-Barockpavillons mit Mansarddach und Goldkuppel**, Kurogane **geschwärztes Holz und Vulkanstein mit geschwungenen Dächern, Schwarzholztoren und glühend roten Laternen** (auch die Häuser auf Glutring-Inseln), Marine **weiße Wachtürme (21 m, Leuchtfeuer nachts) und Zellenblöcke mit Gitterfenstern**.
- **Uniformen:** England rot-marineblau mit Dreispitz; Niederlande orange-weiß-dunkelblau; Deutschland preußischblau-schwarz-weiß-gold; Frankreich königsblau-weiß-gold; Kurogane obsidianschwarz und blutrot mit Kabuto, Gesichtsmaske, Handschuhen und Mondwacht-Rüstung (Doppelklingen sind als Daten vorbereitet, `blades: 2`); Marine mit Marinegarde-Rüstung.
- **Karte (M) und Kompass:** die fünf Kuchenstücke in Farbe, die Grenzlinien weiß gestrichelt, jede Insel mit Ring in der Farbe ihres Besitzers (gestrichelt bei Kolonien), Marine-Grenzfestungen mit Schild-Symbol, die sechs Außenfestungen mit Krone und Namen (auch unentdeckt), Legende der Mächte. Der Kompass zeigt links oben den Sektor („Sektor England“, „Grenze · Marine“, „Bernsteinsee · neutral“) und die Festungen mit Entfernung.
- **Wappen-Banner** an allen Inseln und Toren (Blender-Modelle, sonst gemaltes Tuch).

**Technik (für Entwickler)**
- Neu: `data/factions.ts` (reine Daten ohne three.js: `FACTIONS`, `SECTORS`, `BORDERS`, `BORDER_FORTS`, `CITADELS`, `BERNSTEIN_OWNERS`, Marine-Haltung `marineStance`, `sectorIndexAt`, `borderDistance`) und `data/factionLook.ts` (`applyFactionUniform`). Schlüssel `factionId`, `islandId`, `sectorIndex` sind JSON-serialisierbar (Test `tests/factions.test.ts` prüft den Rundlauf) und tragen später Welt-Shards. `FactionId` ist die Zugehörigkeit von Inseln und Schiffen, `Faction` ('pirat' | 'marine') bleibt das Lager der Spielfigur.
- `data/regions.ts`: neue `IslandKind` `marinefort` und `citadel`, `IslandDef.factionId/sectorIndex/exclave/marine/borderIndex`; Festungen als `placed`-Inseln, Zuordnung nach dem Aufbau. `data/world.ts`: `WORLD_CORE_RADIUS`, `WORLD_RADIUS` 5 800. `seaLevelAt` bis +4.
- Heraldik in `render/heraldry.ts` (Canvas, geteilte Texturen mit Mipmaps und `anisotropy`; `sailTexture` bekommt Muster und Wappen). `ShipLook.power` + `factionShipLook()`; `buildShip` wählt Flagge und Segelmuster, der niederländische Rumpf ist über `hv` voller. Alle Welt-Materialien laufen über das Toon-Material (`onBeforeCompile` auf MeshStandardMaterial), `world/factionMats.ts` ordnet den Rollen der Blender-Modelle die Farben der Macht zu (die Laternen sind einfache `MeshBasicMaterial`, nachts heller über `setFactionNight`).
- Blender (headless): `tools/blender/build_fraktionen.py` → `public/models/factions/` (16 Modelle: sechs Banner, `bastion_stern`, `kontor_giebel`, `kran_rad`, `bastion_granit`, `pavillon_barock`, `dach_kuro`, `tor_kuro`, `haus_kuro`, `wachturm_marine`, `zellenblock_marine`), saubere UVs und Bevel-Kanten, danach `node scripts/compress-gear.mjs factions` (2,5 MB → 270 KB). Geladen über `FACTION_MODELS` in `world/envModels.ts`; `world/factionArch.ts` baut `Built` mit Kollisions-Gitter (`factionBuilt(id, modell, k)`, `k` skaliert Modell und Kollision). `architecture.ts`: `build(typ, rnd, len, macht)` färbt Tore, Türme, Mauern, Bergfried, Kran, Lagerhaus und Kapelle in der Farbwelt der Macht.
- `world/islandDress.ts`: `mount` nimmt auch fertige Bausteine; `curtainWall` mit `towerEvery`/`onTower`; `grandFortress(id)` baut Ring, Eckbausteine, Hof und Torbanner je Bauart; Banner an der Landestelle jeder besetzten Insel (`plantFactionBanners` für handgebaute Länder).
- Garnisonen: `Enemy(…, power)` trägt die Uniform der Macht; `CombatSystem.enterIsland/enterDeck` reichen `power` durch, Festungsinseln halten die Garnison im Hof (`spread`). `SeaWorld.spawnFortress` wertet das Marine-Ansehen aus (`standingOf`, vom Spiel aus `progress.standing` gesetzt).
- Seekampf: `EnemyShip.power/station/provoked`; `NavalSystem.powerAt` (Kuchenstück, Besitzer der nächsten Insel in der Bernsteinsee, Marine an den Grenzlinien), `ensureBorderPatrols`, friedliche Marine bei Ansehen ≥ 0. Boarding-Besatzungen tragen die Uniform ihrer Macht.
- Spielstand 12: `progress.standing` (Migration 11 → 12). Tests: 197 grün, `npx tsc --noEmit` fehlerfrei. Geprüft im Browser (Playwright, echte GPU): Karte, Kompass, alle sechs Schiffsarten, Luftbilder von Albion, Yamikura und Weißwacht (111–123 Bilder/s), Weltrand bei 5 730 m, Garnison je Haltung der Marine, Patrouillenboote bei der Kanalwacht. Nicht geprüft: Handy-Messung, Nachtansicht der roten Laternen, Gefecht gegen alle sechs Garnisonen.

## 2.9.89 – Anlegen mit Gangway, Strickleiter am Ufer, Entern mit Planken und Leitern (18.11.2026)

Nur lokal, noch nicht veröffentlicht (wie 2.9.88 auf Wunsch erst nach Freigabe). Spielstände bleiben lesbar (nichts im Spielstand geändert: Liegeplatz, Brücken und Gefechte sind Laufzeitdaten).

**Kein Versetzen mehr:** `disembark`, `embark` und `board` setzen die Spielfigur nicht mehr per `foot.place` irgendwohin. Man geht von Bord über die Gangway, klettert die Leiter hinab oder läuft über die Planke – und Offiziere und Truppen gehen mit. (Einzige Ausnahme bleibt die Erzählung nach K.O.: „Deine Crew hat dich an Bord gezogen“.)

**Hafen: Anlegen mit Einparkhilfe**
- Fährt das Schiff unter **2,5 m/s** und mit weniger als **25°** Abweichung auf einen Steg zu, bietet die Kontext-Taste (am Handy der Kontext-Knopf) **„Anlegen“**. Das Schiff gleitet gedämpft parallel an den Steg (Achsabstand = halbe Stegbreite + halbe Schiffsbreite + 0,35 m), holt die Segel ein, Rollen und Nicken klingen ab (`Ship.calm`), vier Festmacher-Taue spannen sich zu Pollern am Stegrand.
- **Überhang-Regel:** Es wird nicht mehr nach `ship.L <= pier.len` gefragt. Das Schiff liegt mit dem Gangway-Punkt mittig über der Stegmitte, Bug und Heck dürfen überstehen (Leviathan, 74 m, an einem 36-m-Steg: 37 m Bugüberstand). Geprüft wird der echte Rumpf-Umriss gegen die Wasserlinie: die mittleren drei Viertel müssen im Wasser liegen, nur die äußeren Achtel dürfen über dem Strand überstehen (`OVERHANG_FREE`). Liegt dabei ein Ende an Land, rückt der Liegeplatz (und der Zugang an Deck: Mitte, achtern oder vorn) zur Stegspitze. **Folge:** Linienschiff und Leviathan finden nur dort einen Liegeplatz, wo der Steg weit genug ins Wasser ragt (Ankerglück und einzelne Außenposten); an den übrigen kurzen Stegen bleibt für sie die Strickleiter. Fregatte und Galeone legen an allen 13 Stegen an.
- **Begehbare Gangway** mit Geländer (seitlich begrenzt, 1,7 m breit). Fuß auf den Bohlen, Landestelle an Deck hinter der Reling; die Länge folgt dem Höhenunterschied (Schaluppe ≈ 0,3 m … Leviathan ≈ 5,1 m, Steg 1,45–1,65 m) und läuft bei großen Schiffen schräg am Steg entlang. Die Steigung bleibt unter **38°** (Entwurf 33°; gemessen am Leviathan 31,8° bis 33,9°).
- **Kontext-Priorität:** Festgemacht öffnet die Taste im Hafen das Hafenmenü (`onHarbor`), an Dörfern geht es an Land (Menüknopf „Ablegen“ holt Gangway und Taue ein); zu Fuß am Steuerrad (Abstand < 1,5 m) steht **„Ablegen“**. Die Landestelle der Gangway halten Deck-Crew (`crewAboard.ts`) und Deck-Truppen frei (`gateKeepOut`).

**Nachbesserung (18.11.): längere Stege, Liegeplatz weiter draußen, Anfahrt von vorn**
- **Alle Stege sind deutlich länger:** Außenposten 32 → 65 m (`OUTPOST_PIER`), Hafensteg Ankerglück 46 → 80 m (Mesh und Pfähle in `town.ts`, Laufstrecke in `seaWorld.ts`), Dorfstege +22 m (`settlement.ts`). Damit liegen auch Linienschiff und Leviathan an allen 13 Stegen.
- **Liegeplatz weiter Richtung Meer (für jeden Hafen, gleiche Suche):** Die Suche verlangt zuerst 30 m, dann 20, 12 und zuletzt knappe 0,4 m Abstand des Rumpfes zum Strand (Platz zum Ablegen) und legt die Gangway-Landestelle möglichst weit vorn am Steg an (Spitze minus 4 m). Gemessen: Korvette und Galeone liegen an allen 13 Stegen 12–43 m vom Strand, der Leviathan so weit es seine Länge zulässt.
- **Von ganz vorn andocken:** „Anlegen“ gilt auch, wenn man hinter der Stegspitze seitlich heranfährt (bis 90 m jenseits der Spitze plus halbe Schiffslänge, seitlicher Spielraum 60 m; an allen 13 Stegen in beiden Richtungen und Seiten geprüft, auch Nebelhafen).

**Nachbesserung 2 (18.11.): Winkel, Abstände, Leiter**
- „Anlegen“ gilt jetzt bis **50°** Abweichung zum Steg (vorher 25°); das Schiff dreht beim Gleiten parallel. So geht es auch schräg von vorn seitlich an der Stegspitze.
- **Mehr Luft zwischen den Rümpfen:** Abstand zum Steg 0,35 → 0,9 m, beim Entern halbe Breiten + 0,6 → 1,6 m (die Rümpfe wölben sich über der Wasserlinie und steckten ineinander). Planken werden dadurch etwas länger und flacher.
- **Strickleiter hängt weiter draußen** (Fuß 1 m plus 14 % der Höhe vor der Bordwand), damit sie nicht im Rumpf steckt.

**Nachbesserung 3 (18.11.): Spitze, Leiter, Abschluss**
- An der Stegspitze (letzte 10 m und dahinter, vom Wasser her) darf das Schiff in **beliebiger Lage** herankommen (auch quer): „Anlegen“ wird angeboten, das Schiff dreht beim Gleiten parallel.
- Leiter hängt **außen an der Bordwand** (Haken sitzt jetzt außerhalb der Reling, nicht mehr innen im Rumpf); gilt für die Strickleiter und die Enterleitern.
- **Stegabschluss:** Beim Festmachen erscheinen ein Stirnbalken am Stegende und eine Anlegeplatte dort, wo die Gangway aufsetzt; beides wird beim Ablegen wieder abgebaut.

**Nachbesserung 4 (18.11.): Reling-Öffnung, Optik, Abstand nach Größe**
- **Reling offen, wo Brücken ans Deck kommen:** Die Seitenreling (`ShipModel.railParts`) wird an Gangway, Strickleiter, Enterplanken und -leitern ausgeblendet und beim Einholen wieder eingesetzt; man läuft nicht mehr durch das Geländer.
- **Braune Platten auf dem Steg entfernt** (Stirnbalken und Anlegeplatte aus Nachbesserung 3).
- **Gangway neu gestaltet:** hellere Bohlen, Wangen an den Kanten, Handlauf auf Pfosten mit Seil darunter statt heller Stangen.
- **Abstand zum Steg wächst mit der Schiffsbreite:** `mooringGap(W)` = 0,9 m + 10 % der Breite (Schaluppe ≈ 1,5 m, Leviathan ≈ 2,8 m); Gangway und Planken passen sich an.

**Küste ohne Steg: Strickleiter und Klettern**
- **„Ankern & Leiter auswerfen“**, wenn die Bordwand nah genug an der Wasserlinie liegt (`ladderReach`: 1,2 + 6 + 0,04·L m; kleine Schiffe kommen nach `pushShip` näher heran als große). Die Leiter hängt an der **ufernäheren Bordseite** (Backbord oder Steuerbord, beide werden geprüft), ein Watweg führt vom Leiterfuß durchs flache Wasser zum Strand.
- **Kletter-Animation:** Die Spielfigur folgt der Leiter (`PlayerFoot.drive`, Gehen-Takt Sprosse für Sprosse), hinab und von unten wieder hinauf („Zum Ufer hinabklettern“, „An Bord klettern“). Offiziere und Truppen setzen hier weiter per **Beiboot** über.

**Entern wie in Black Flag**
- Zeigt `naval.boardable()` ein Schiff in Reichweite, löst **„Entern!“** aus: drei **Enterhaken** fliegen im Bogen, die Taue spannen sich; die Crew **zieht beide Schiffe Bord an Bord** (Achsabstand halbe Breiten + 0,6 m, gedämpft, Rollen beruhigt; der Gegner dreht sich parallel).
- **Brückenart nach Deckshöhe:** bis 1,8 m Unterschied **2–3 breite Enterplanken** (ab 30 m Länge drei, aber nur dort, wo freies Deck die Auflage trägt; auf vollgestellten kleinen Schiffen gegebenenfalls nur eine), bei höherem oder tieferem Gegner **Belagerungsleitern** an der Bordwand (zwei, Haken über der Reling). Planken reichen bei zu kurzem Spalt nach innen aufs Deck, damit die Neigung unter 38° bleibt (gemessen 21–25°), und dürfen schräg liegen; ihre Auflage liegt hinter der Geschützreihe.
- **Nahtloser Kampf:** beide `DeckGround`-Instanzen und alle Brücken sind im `CompositeGround` aktiv, der Läufer fällt nirgends zwischen den Rümpfen durch. Die Feindbesatzung erscheint erst, wenn die Brücken stehen. Nach dem Sieg (`hostilesLeft === 0`) laufen Offiziere und Trupps über die Brücken zurück; sobald die Spielfigur wieder auf dem eigenen Deck steht, holt die Crew Planken und Leitern ein, danach sinkt die Prise (Beute wie gehabt). **„Rückzug: Brücken einholen“** beendet den Kampf auch ohne Sieg.

**Offiziere und Truppen über die Brücken (Platzhalter aus 2.9.88 ersetzt)**
- Die Sprung-Animation über die Reling für `TroopSquad` ist **entfernt** (`Landing` kennt nur noch das Beiboot). Offiziere (`Ally`) und Trupps verlassen ihre Plätze an Deck (Deck-Truppen starten genau dort, wo ihre Darstellung stand) und marschieren auf einer `Route` (`stepRoute`) über Gangway, Planke oder Leiter; Leitern klettern sie mit 1,5 m/s entlang der Ankerlinie.
- **Nachrück-Fallback:** Bleibt einer an einer schmalen Brückenkante hängen (kein Fortschritt), rückt er nach 0,9 s ein Stück nach, nach 2,6 s steht er auf dem Wegpunkt (immer auf der Brückenlinie). Auf der Brücke rücken Trupps eng zusammen. Verbündete haben weiter keine Kollision mit der Spielfigur: sie blockieren die Planke nie.
- Heimweg nach Landgang und Entern: dieselben Wege rückwärts; wer ankommt, verschwindet an Bord (zählt nicht mehr als Ziel), die Truppen stehen danach wieder in ihren Gruppen an Deck.

**Prüfung**
- Neu: `tests/docking.test.ts` (25 Tests): Liegeplatz-Abstand, Ausrichtung und Überhang (Linienschiff und Leviathan am 32-m-Steg), Anlege-Bedingungen, Gangway-Höhe und -Winkel für alle 7 Klassen an Hafen-, Außenposten- und Dorfsteg, Planken-Neigung, `CompositeGround` (Brücke bündig, Live-Höhe bei Hub und Rollen, Läufer ohne Sprung, Geländer, gesperrte Fläche unter der Rampe, zwei Decks, Planke zwischen Decks, Cleanup), Laufwege mit Nachrück-Fallback und Klettern, Cleanup der Meshes (Geometrien werden freigegeben). `npx tsc --noEmit` fehlerfrei, **180 Tests** grün, `vite build` läuft durch.
- Im Spiel (Playwright, Dev-Server 5174): Schaluppe am Hafensteg (Anlegen, über die Gangway an Land und zurück, Ablegen; Höhenverlauf ohne Sprung; 10 Zyklen ohne Zuwachs bei den Geometrien); Leviathan an einem Außenposten-Steg (Überhang, 33,9°) und am Hafensteg mit 3 Offizieren und 90 Mann (alle laufen über die Gangway, ein Trupp brauchte einen Nachrück-Schritt); Schaluppe entert Fregatte (zwei Planken) und Galeone (Leitern) mit Offizieren und Truppen, Sieg, Rückweg, Abbau; Strickleiter an der Küste (hinab, waten, zurück hinauf). Keine Konsolenfehler. **Nicht geprüft:** echtes Handy, Bildrate mit voller Besatzung auf Low/Mid, starker Seegang beim Entern, Steuerung per Tastatur durch die vollgestellten Decks (die Tests liefen mit gesteuerten Wegpunkten).

**Technik (für Entwickler)**
- `world/docking.ts` (rein, ohne three.js): `DockingState` (`shipId`, `pierId`, `side`, `u`, `dir`, `phase`), `BoardingSession` (`attackerShipId`, `targetShipId`, `phase`, `bridgeType`), Liegeplatz-Geometrie (`berthPose`, `pickBerth`, `overhang`), `planGangway`/`planPlank`/`minRun`, `BridgeDef`/`BridgeFrame` (Anker in der Welt oder am Schiffsdeck), `Route`/`stepRoute`, Deck-Zugänge (`deckGates`, `gateKeepOut`). `Ship.moored` trägt den Zustand, `Ship.calm`/`calmTo` dämpft die Wellenlage, `Ship.furl` holt die Segel ein.
- `world/islandGround.ts`: `Ground.height/constrain` haben einen **optionalen Höhenhinweis `y`** des Läufers (wo mehrere Flächen übereinanderliegen); `CompositeGround` vereint `IslandGround` (Steg), bis zu zwei `DeckGround` und alle `BridgeRt` in einer Pipeline: Brücke vor Deck vor Insel; unter einer Rampe ist die Fläche gesperrt, solange die lichte Höhe unter 2,1 m liegt; Geländer nur zwischen den freien Enden. `DeckGround.anchorInto` liefert Ankerpunkte ohne Allokation aus der Schiffsmatrix (die Brückenhöhe folgt dem Deck jedes Bild). `seaWorld.groundProxy` ist jetzt der Verbund; `sweep.ts`, `PlayerFoot`, `Ally` und `TroopSquad` reichen ihre Höhe als Hinweis durch. Ohne Hinweis (Gegner, Kamera) gilt das Deck im Rumpfgrundriss, sonst die Insel.
- `world/dockingSystem.ts`: Ablauf (Gleiten, Festmacher, Gangway, Strickleiter und Watweg, Enterhaken, Heranziehen, Brücken bauen und einholen, Laufwege); Liegeplätze werden je Steg, Seite, Richtung und Klasse gesucht und gemerkt. `world/dockingFx.ts`: Meshes der Brücken, Taue, Haken und Poller; vorab angelegte Vektoren, Matrizen und Quaternionen, `clear()`/`dispose()` räumen alles ab (`disposeObject`, geteilte Toon-Materialien bleiben).
- `SeaWorld`: `updateWhere` leitet je Logikbild das Deck unter der Figur ab und löst Landung (`arriveAshore`) und Rückkehr (`returnedToShip`) aus; `startBoardFight`/`endBoardCleanup`/`rescueToShip` für das Entern. Entfernt: `groundProxy` mit `deckGround ?? ground`, `disembark`, `embark`, `boardDone`, `anchor`, `shipReach`.
- Prüfen im Spiel: `window.sturmkrone.world.docking.lastPlan` zeigt die letzte Planken-Planung. Ein Schiff nicht mit `teleport` an einen Steg setzen (das schiebt es aus der Insel heraus), sondern `ship.x/z/heading` und `prev` direkt setzen; `window.name` eignet sich als Ablage für das Prüfskript.

## 2.9.88 – Zwei-Stufen-Crew: Offiziers-Plätze je Schiffsklasse und Massentruppen auf dem Leviathan (17.11.2026)

Nur lokal, noch nicht veröffentlicht (auf Wunsch erst nach Freigabe). Spielstände bleiben lesbar (keine neue Version, alle neuen Felder optional).

**Stufe 1: Offiziere (benannte Crew)**
- **Plätze wachsen mit dem Schiff** statt fester 3: Schaluppe und Brigg 2, Korvette und Fregatte 3, Galeone und Linienschiff 4, Leviathan 5 gleichzeitige Offiziere im Land- und Entertrupp (`data/crewTiers.ts`, eine Quelle der Zahl). `defaultParty`, `hireCrew`, `toggleParty` und `CrewAboard.spawnAllies` richten sich danach; die Aufstellung hinter der Spielfigur trägt jetzt fünf Plätze (`formationSlot`).
- Wechselt man auf ein kleineres Schiff, bleiben überzählige Offiziere als **Reserve** im Spielstand (nichts wird gelöscht); das Crew-Menü zeigt „Landtrupp A/B“ und „In Reserve“.
- Offiziere sterben nie dauerhaft (wie bisher: K.O. und wieder aufstehen).

**Stufe 2: Massentruppen (nur Leviathan, ab Rang 9)**
- Namenlos, ohne Treue und Aufträge: drei Truppentypen (Schwertträger, Musketiere, Enter-Schläger, `data/troops.ts`) mit Handgeld je Kopf (14, 18, 22 Gold) und Stufe der Spielfigur (+5 % Werte je Stufe). Kapazität 100 Köpfe.
- **Verlustreihenfolge:** Beschuss auf See und Gefechte treffen erst den `truppen`-Pool, dann die Seeleute. Die Zahl der Gefallenen hängt nicht von den Truppen ab (sie fangen nur zuerst ab).
- **Saubere Trennung der Wirkung:** Crew-% (Nachladen, Segelsetzen, Reparatur) zählt nur die Seeleute, der Truppen-Pool hat Gewicht 0. Die neue reine Funktion `boardingStrength(crew)` skaliert Durchschlagskraft (bis +45 %) und Trefferpunkte (bis +60 %) der Offiziere beim Entern und an Land. Mit Truppen erscheinen beim Entern bis zu 5 zusätzliche Gegner.
- **Anheuern** in Taverne, Hafen und Werft (Bildschirm „Truppen anheuern“, Kapazitätsbalken, +10 und Auffüllen je Typ, Rangsperre). Matrosen und Truppen laufen getrennt über `CrewRefillIntent.pool`. Gefallene Truppen bleiben tot, bis man im Hafen nachheuert.
- Spielstand: `crew.troops` (Typ → Köpfe), `crew.officerSlots`, `ship.crewPools` (Anteil je Gruppe). Fehlen sie, ist alles leer beziehungsweise `ship.crew` gilt für die Seeleute. Auf Schiffen ohne Truppenplätze ruht der Bestand im Spielstand.

**Im Gefecht**
- `TroopSquad` (`entities/troops/squad.ts`): eine Entität je Trupp (`squadId`, `ownerPlayerId`, `typ`, `heads`, `hp`, `x`, `z`, `yaw`, `commandState`), JSON-tauglich und ohne three.js. Höchstens 6 Trupps zu je höchstens 20 Köpfen; Gegner greifen sie über denselben Pfad wie Offiziere an. KI gestaffelt (alle 0,22 bis 0,3 s, versetzt je Trupp), Bewegung jedes Bild.
- Darstellung (`entities/troops/troopRender.ts`): ein `InstancedMesh` je Truppentyp mit geteilter, eckpunktgefärbter Geometrie, also 3 Zeichenaufrufe für alle 100 Köpfe. Gefallene liegen kurz am Boden und sinken weg.
- **Landgang und Entern:** Truppen stehen in Gruppen an Deck (Leviathan). Beim Entern springen sie über die Reling des eigenen Schiffs aufs Feinddeck, am Strand setzen sie im Beiboot über, am Steg gehen sie über die Reling. Nach dem Gefecht kommen die Überlebenden zurück an Bord, Verluste werden abgezogen.
- **Befehle:** `[1]` Sturmangriff, `[2]` Folgen, `[3]` Position halten für Trupps und Offiziere (auch per Knopf im HUD, am Handy antippbar). Solange Trupps im Einsatz sind, gehören die Tasten 1 bis 3 den Befehlen, die Schnellleiste bleibt über Platz 4 und Antippen erreichbar. HUD-Zeile „Offiziere: A/B | Truppen: X/Y“.
- **Nie blockieren:** Verbündete haben keine Kollision mit der Spielfigur; Trupps und Offiziere trennen sich nur weich untereinander (höchstens 3 m/s). Auf schmalem Boden (Steg) rücken die Köpfe zusammen.

**Prüfung**
- Neue Tests: Verlustreihenfolge, `boardingStrength`, Auffüllen je Gruppe, Altspielstände ohne die neuen Felder, `TroopSquad` (Befehle, weiche Trennung, Leistung). `npx tsc --noEmit` fehlerfrei, 155 Tests grün.
- Im Spiel (Playwright, RTX 5070 Ti, 4K Ultra auto): Offiziers-Plätze 2/2/3/3/4/4/5 je Klasse, Anheuern, Landung am Steg und per Beiboot, Entern einer Fregatte mit 100 Köpfen, Befehle per Taste, Spielfigur läuft ungebremst durch die Trupps, Verluste und Rückkehr an Bord, keine Konsolenwarnungen. Trupp-Update 0,05 ms je Bild, 100 Köpfe in 3 Zeichenaufrufen; auf offenen Inseln 90 bis 115 Bilder/s, auf dichten Inseln (Korallenkranz, Gischtzahn) mit und ohne Truppen gleich (etwa 45 bis 60).
- Hinweis: Enterplanken, Belagerungsleitern, `CompositeGround` und die Hafen-Gangway gibt es im Code noch nicht (nur als Plan in `docs/DOCKING_BOARDING_PLAN.md`). Der Übergang ist deshalb ein Sprung über die Reling beziehungsweise ein Beiboot; sobald die Planken existieren, hängt man `LandingPlan` daran.

**Technik (für Entwickler)**
- Neu: `data/crewTiers.ts`, `data/troops.ts`, `core/crewRoster.ts`, `entities/troops/{squad,troopRender}.ts`; `naval/shipSim.ts` (`CREW_POOLS.truppen`, `boardingStrength`, `setPoolHeads`, `missingHeads(c, pool)`), `sim/intents.ts` (`pool`, `troopType`), `sim/entityId.ts` (Art `squad`).
- `Ship` trägt den Truppen-Pool nur als Spielerschiff (`hero`) und nur mit Truppenplätzen; `rebuild` behält die Köpfe. `Game.syncTroops` hält Pool und Bestand je Typ gleich (Beschuss senkt beide, Anheuern und Rückkehr setzen beide).
- `CrewAboard` besitzt Trupps, beide Darstellungen (Welt und Deck im Schiffsraum) und die Beiboote. `SeaWorld.onTroopsReturn` meldet die Überlebenden.

## 2.9.87 – Buckel mit scharfer Kante hinter dem Schiff behoben (17.11.2026)

- **Der helle Buckel mit messerscharfer Kammlinie im Wasser, 6 bis 7 m hinter dem Heck** (bei jeder Fahrt sichtbar): Ursache gefunden durch schrittweises Abschalten der Rumpf-Verdrängung im Ozean-Shader (`skHullH` in `world/ocean.ts`). Der Bugwulst (Wasser staut sich vor dem Steven) war nur nach vorn gedämpft; hinter dem Steven war der Dämpfungsfaktor immer 1. Der Wulst lief deshalb als Band entlang der ganzen Mittellinie bis hinter das Schiff und brach dort an der Grenze der Rumpf-Schleife hart ab. Er steigt jetzt erst ab der Schiffsmitte weich zum Steven an. Schaum, Kielwasser und alle anderen Wassereffekte sind unverändert. `npx tsc --noEmit` fehlerfrei, vorher und nachher dieselbe Kurvenfahrt im Spiel verglichen.

## 2.9.86 – Kampf-Kollision ohne Wanddurchbrüche, Segel-HP und Crew-% als spürbare Schiffsmechanik (17.11.2026)

Erster Schritt der Mehrspieler-tauglichen Kampfphysik: Alles, was später für Coop synchronisiert werden soll, läuft jetzt über eindeutige Kennungen, Absichten und serialisierbaren Zustand, getrennt von der Darstellung. Es gibt noch kein Backend.

**Schwerthieb-Dash und Kampf-Kollisionen**
- **Keine Wand-Durchbrüche mehr:** Ausfallschritte der Hiebe, Ausweichrollen und Rückstöße werden in Teilschritte von höchstens 0,15 m zerlegt (`combat/sweep.ts`). Jeder Teilschritt prüft die Kapsel der Figur (Radius 0,35 m) gegen alle Gebäude-Quader, Mauern, Zäune, Felsen, die Küste und die Reling. Weil jeder Teilschritt kürzer als der Figurenradius ist, springt keine Figur über einen dünnen Zaun, auch nicht bei einem langen Bild (0,25 s) oder Tempo 40 m/s.
- **Wand oder Stufe?** Höhensprünge bis 0,45 m und Rampen unter 42° steigt die Figur hinauf (Schiffstreppen haben 30°). Höhere Kanten und steilere Hänge zählen als Wand. Die Steigung wird über 0,6 m vor der Figur gemessen: eine 0,45-m-Stufe bleibt flach, eine Felswand wird steil.
- **Gleiten statt Kleben:** Trifft der Impuls schräg (mehr als 35° von der Wand-Normale), gleitet die Figur an der Wand entlang. Trifft er fast senkrecht, endet der Impuls dort und bleibt für den Rest dieser Aktion gesperrt (er läuft nicht beim nächsten Bild weiter). Eine neue Aktion hebt die Sperre auf. Ein Abschluss prüft, dass die Endposition frei ist; sonst geht die Figur auf den letzten sicheren Punkt zurück.
- **Für jede Kämpfer-Entität gleich:** Die Spielfigur (Ausfallschritt des Hiebs, Rolle) und die Gegner (Rückstoß) laufen durch denselben Code. Normales Laufen bleibt wie bisher und nutzt die Teilschritte nur, wenn ein Bild länger als 0,15 m wäre.

**Segel-HP**
- Segel haben eigene Lebenspunkte (36 % der Rumpfklassen-Punkte, Schaluppe 43, Leviathan 396). Treffer im Tuch (Kugel über 2,5 m Deckhöhe) zählen als Segelzone: der Rumpf nimmt kaum Schaden, das Segel mindestens mit 70 % Wirkung der Munition; Kettenkugeln zerfetzen am stärksten. Früher zählte jeder Segeltreffer wie eine Kettenkugel.
- **Stufenlos an die Fahrt gekoppelt** (gemessen im Spiel, Schaluppe 20 s Vollgas): 100 % = 10,5 m/s, 60 % = 7,6, 30 % = 4,7, 15 % = 1,9, 0 % = treibt nur noch mit dem Wind (20 m in 20 s, Ruder greift nicht). Auch Beschleunigung und Wendigkeit folgen der Kurve (`sailCurve`: bei 30 % noch 45 % Tempo, stetig und streng steigend).
- **Schwere Stürme** zerreißen gesetztes Tuch (bis 21 % je Minute bei voll gesetzten Segeln, gerefft deutlich weniger); ein Sturm allein lässt mindestens 20 % übrig, nur Beschuss zerstört das Segel ganz.
- **Sichtbar:** Das Tuch reißt im Fragment-Shader auf (`uDmg` in `render/flags.ts`): senkrecht gezogene Risse und Löcher mit angekohlten Rändern, dunkleres Tuch, kürzer hängende Segel. Sinusfreie Hashes (Handys), keine `pow(0, x)`.
- **Reparatur auf See** (Taste G, am Handy „Flicken“, oder die Güter in der Schnellleiste): Segeltuch +40 % Segel-HP (5 s), Holzplanken +15 % Segel und +12 % Rumpf (6 s). Ohne Material näht die Crew ein Notsegel (12 s, bis 15 %), damit man nie hilflos treibt. Die Dauer hängt an der Crew. Im Hafen stellt die Werft Rumpf und Segel her (Kosten enthalten die Segel). Segeltuch und Planken gibt es auf dem Markt (45 und 35 Gold) und als Beute.

**Crew-%**
- **Nachladen:** Faktor 1,0 bei voller Crew, 1,8 bei 50 %, 2,8 bei 0 % (Breitseiten, Bugkanone, auch Gegner).
- **Segel setzen:** Die Segelfläche folgt dem Gashebel mit Crew-Tempo: volle Fläche in etwa 3 s bei voller Crew, bei 30 % Crew erst nach etwa 7 s; Reffen geht 1,8-mal schneller.
- **Passive Rumpfreparatur** nach 8 s ohne Treffer, bis 0,16 %/s bei voller Crew, unter 15 % Crew keine. Der Schiffskoch ist jetzt ein Bonus darauf (+1,2/s), der nur mit genug Seeleuten wirkt.
- **Anzeige:** Segel- und Crew-Balken im Schiffs-HUD, Reparaturbalken, Erklärung beim Überfahren (PC) oder Antippen (Handy).
- **Auffüllen:** Taverne, Hafenmenü und Werft („Matrosen anheuern“, Gold je Kopf, wächst mit der Klasse). Ein gesunkenes Schiff startet mit mindestens 60 % Crew.
- Spielstand: `ship.sail` und `ship.crew` (optional, fehlt es, gilt 100 %), keine neue Version nötig.

**Technik (für Entwickler):**
- **Kennungen und Absichten:** `sim/entityId.ts` (`mintEntityId`, `EntityId`) vergibt `foot-n`, `enemy-n`, `ally-n`, `ship-n`; `PlayerFoot`, `Enemy`, `Ally` und `Ship` tragen `entityId`. `sim/intents.ts`: `DashIntent`, `SailRepairIntent`, `CrewRefillIntent` sind reine Daten mit Urheber (`entityId`) und Ziel (`shipId`). Es gibt nirgends ein globales Spieler-Objekt; die Welt reicht die Kennung über `playerEntityId`.
- **Kollision:** `combat/sweep.ts` ohne three.js, `SweepGround` = `height` + `constrain` (jede `Ground` der Welt erfüllt es, auch `DeckGround`). Die Kontakt-Normale folgt aus der Verschiebung durch `constrain`, die Auflösung selbst blieb unverändert. `resolveDash(body, latch, intent, ground, dt)` für Impulse, `sweepMove(..., impulse)` allgemein. Konstanten in `SWEEP`. `PlayerFoot.lastSweep` liefert Wand-/Stufen-/Steilhang-Ergebnis für Prüfungen.
- **Schiffssimulation:** `naval/shipSim.ts` (ohne three.js): `ShipSimState` (Rumpf, Segel-HP, Crew je `shipId`, gesetzte Segelfläche, Reparaturauftrag) ist JSON-tauglich. Crew in Gruppen (`CREW_POOLS`, jetzt nur `matrosen`; Köpfe `HEADS_PER_CREW_POINT` = 8 je Klassen-Crew), Crew-% = gewichteter Anteil. **Das Zwei-Stufen-Crew-System dockt an**, indem es einen Eintrag in `CREW_POOLS` und einen Pool in `makeCrew` ergänzt (Gewicht, Verlustreihenfolge); alle Wirkungen (`crewEffects`) hängen nur an der Crew-%. `Ship` hält `sim` und stellt `hull`, `sail`, `crew` als Zugriffe bereit (alter Code läuft unverändert).
- **Segel-Shader:** `SailUniforms.uDmg`, Varying `vSailP`; der Riss-Test sitzt vor `alphatest_fragment` (Segel haben `alphaTest`). Schatten der Segel zeigen die Löcher nicht (Tiefenmaterial).
- **Prüfung:** `tests/sweep.test.ts` (18, darunter 2000 zufällige Impulse gegen 14 Häuser, Treppe, Rampen 30° bis 70°, Deck) und `tests/shipSim.test.ts` (18). `npx tsc --noEmit` fehlerfrei, 122 von 122 Tests bestanden. Im Spiel (Playwright, echte GPU): Segelfahrt je Segel-%, Nachladezeit, Segelsetzen, Reparatur, Notsegel, Sturm, Matrosen anheuern; 217 Rollen und 217 Hiebe gegen 74 Häuser der Heimatinsel ohne Einbruch (kleinster Abstand 0,26 m, nur beim Quetschen zwischen Haus und Nachbarzaun, wie schon beim Laufen); Treppe der Galeone per Rolle, Hieb und Laufen ohne Höhensprung.
- Nicht geprüft: echtes Handy, Seegefecht mit Gegnerschiffen im Dauertest, Sturm im laufenden Wetter über Minuten.

## 2.9.85 – Startbildschirm ohne Streifen, Karibik-Meer (17.11.2026)

**Startbildschirm: lange gezogene Streifen und Flächen (Ursache gefunden und behoben)**
- **Symptom:** Im Menü (und überall, wo viele Figuren in der Nähe stehen) liefen dicke, glänzende Streifen von der Mitte des Bilds bis zum unteren Rand, je nach Kamerawinkel auch lange Linien über die Hafenmole. Sie hingen am Weltursprung (0, 0, 0): Je nach Blickrichtung zur Hafenstadt zeigten sie sich oder nicht.
- **Ursache (gemessen):** `render/matrixSkip.ts` überspringt die Knochen von Figuren außerhalb des Bildes (Leistung in der Stadt). Deren Weltmatrizen bleiben dabei stehen, bei frisch erzeugten Figuren ist es die Einheitsmatrix am Ursprung. three.js prüft das Sichtfeld aber mit genau diesen Matrizen und zeichnete die Figur trotzdem, sobald der Ursprung im Bild lag: halb mit aktuellen Knochen (Hüfte, von der IK nachgeführt), halb mit veralteten am Ursprung. Das ergab lange Dreiecke von dort bis zur Figur. 28 Haut-Netze von Figuren der Hafenstadt waren betroffen (Eckpunkte bis 196 m von der Figur entfernt); mit ihnen ausgeblendet waren die Streifen weg.
- **Behebung:** Übersprungene Figuren werden für die Dauer des Zeichnens unsichtbar (`updateCulledHolders` blendet den Halter aus, `restoreCulledHolders` stellt ihn nach dem Bild wieder her, auch bei einer Ausnahme). Das gilt für alle Durchgänge (Hauptbild, Schattenkaskaden, Spiegelung, Umgebungsverdeckung). Die Weltmatrix des Halters wird vor dem Test frisch berechnet (vorher lief sie dem Bild um eine Runde nach). Weitere Folge: Figuren, die sich außerhalb des Bildes bewegten, erschienen als eingefrorene „Geister“ an der letzten Stelle; auch das ist weg.
- **Möwen, Fischerboote und Treibgut lagen im Startbildschirm übereinander am Weltursprung** (Instanzmatrizen beginnen als Einheitsmatrix, bewegt wurde erst im Spiel): als weiße Flecken auf dem Wasser und als „Floß mit Segel“ neben dem Schiff sichtbar. `SeaLife` setzt Möwen, Boote und Treibgut jetzt beim Erzeugen an ihren Ort, und das Leben läuft schon im Menü (`SeaWorld.idle`): Möwen kreisen, Fischerboote fahren vor dem Hafen.
- **Geprüft und in Ordnung (Laufzeitmessung):** Hautgewichte aller 150 Figuren-Geometrien (Summe 1, kein Eckpunkt ohne Gewicht, Knochenindizes im Bereich); alle 1984 Geometrien der Szene (6,2 Mio. Eckpunkte) ohne NaN, Inf oder Indexfehler; Takelage (`LineSegments`, 66 Eckpunkte) ohne Fehler; Instanznetze für Wolken und Weltrandnebel setzen ihre Orte im Shader (Einheitsmatrix ist dort richtig).
- 5 neue Prüfungen in `tests/matrixSkip.test.ts` (86 von 86 bestanden).

**Technik (für Entwickler):**
- Wer eine Figur außerhalb von `Renderer.render` zeichnet, ruft `updateCulledHolders`/`restoreCulledHolders` selbst. Die Zweige `skipKids`/`wasSkipped` in der Matrix-Überschreibung entfallen: übersprungene Halter sind während des Bildes `visible = false`.
- Neue Instanznetze: Matrizen sofort setzen (nicht erst im ersten `update`) oder `count = 0`.
- Fehlersuche, die gezielt zum Ziel führte: Strahl (Raycaster) durch Pixel, Ausblenden von Gruppen mit Bildvergleich, danach Haut-Eckpunkte per `SkinnedMesh.getVertexPosition` im Weltraum messen; Kamera für Messungen einfrieren (`Object.defineProperty(world, 'menuOrbit', …)`).

## 2.9.84 – Qualitätsdurchgang: Laternen, schwebende Felsen, schärfere Texturen, ruhigere Wächter (17.11.2026)

Reiner Prüf- und Reparaturdurchgang, keine neuen Funktionen. Gemessen im laufenden Spiel (Chrome mit RTX 5070 Ti, Playwright, Max und Ultra), danach behoben.

**Laternen (Ursache gefunden)**
- **Das Laternenglas leuchtete nachts nie.** `UniformsUtils.merge` klont die übergebenen Uniform-Objekte: `lanternGlass`, `coalMaterial` bekamen Kopien von `lampFx.uNight` und `lampFx.uTime`, das GlowSystem schrieb aber jedes Bild in die Originale. Gemessen nachts: `lampFx.uNight = 1`, `lanternGlass.uniforms.uNight = 0`, Zeit stand still (kein Flackern, auch die Glut der Feuerstellen pulsierte nicht). Jetzt werden die gemeinsamen Objekte nach dem Anlegen wieder eingesetzt (`linkShared` in `render/lampMaterials.ts`). Bild bei 22:41 in Ankerglück: Straßenlaternen zeigen Rahmen und warmes Glas statt weißer Punkte.
- **Laternen brannten am Tag:** Der Flammenkern der Laternenpfähle (Rolle `ember`) leuchtete immer voll. Neu `lanternCoal` (10 % am Tag, voll ab der Dämmerung) für Straßen-, Wege- und Hafenlaternen; Feuerstellen, Feuerkörbe und Fackeln behalten die Glut.
- Geprüft und in Ordnung: Tag/Nacht/Wetter-Steuerung (Nachtwert 0 von 7:30 bis 17:00, 1 ab 18:30; Regen 0,44, Nebel 0,77, Sturm 0,88 auch am Tag), alle 591 bis 645 Lichtquellen unter der Kapazität (2048), Leuchtturmstrahl nur bei Dunkelheit oder schlechter Sicht (`updateBeams`).

**Schwebende und versunkene Dinge**
- **Felsen schwebten (gemessen):** Die Felsen der Inselausstattung wurden mit `+ s · 0,25` über den Boden gesetzt, die Blender-Felsen haben ihren Boden aber 0,09 bis 0,30 m über dem Ursprung. Messung an 897 Fels-Instanzen: an Land im Mittel 0,38 m über dem Boden (bis 1,12 m), im Wasser bis 1,15 m über dem Meer. Außerdem kippten sie bis 28°. Jetzt sitzt die echte Unterkante (Bounding-Box `min.y`, neu in `Proto.minY`) 8 cm unter dem tiefsten Boden unter dem Fuß (`groundY`/`lowestGround` in `vegetation.ts`); im Wasser stehen sie unter den Wellen, Neigung höchstens 8,6°. Nachmessung: an Land im Mittel 0,20 m im Boden (höchstens 0,18 m darüber, nur an Hängen), im Wasser im Mittel 0,59 m unter dem Meer. Auch die Felsen der handgebauten Länder (`festland:fels`, `basalt`) nutzen `groundY`.
- **Zäune, Mauern, Vorgärten folgen dem Hang:** Zaunfelder sind einzelne Felder zwischen zwei Pfosten und neigen sich mit dem Boden, Mauerstücke stufen sich ab, Trittsteine, Holzstapel und Lattenzaun der Häuser sitzen auf dem Boden an ihrer Stelle (`settleYard` in `architecture.ts`).
- **Festungstore und Türme:** Torhäuser schwebten auf Hängen bis 2,5 m über der Talseite. Steinsockel bis zum tiefsten Boden unter jedem Quader (`addPlinths`); Nachmessung höchstens 0,19 m.
- **Prüfwerkzeug (nur Entwicklung):** `world/placeAudit.ts` misst beim Aufbau jedes aufgestellte Objekt (Fußabdruck im Objektraum, 5 × 5 Punkte) und meldet Schweben und Hangneigung: `__placeAudit` und `__placeAuditSummary()` in der Konsole.

**Kollisionen**
- Geprüft, nichts zu beheben: Es gibt keine großen Welt-Boxen um gedrehte Zäune mehr, Zäune, Mauern und Häuser sind gedrehte Quader (`boxBlocker`, drei Durchgänge in `constrain`). 16 Messpunkte an schrägen Zäunen (Enden frei, Seiten frei, Herausschieben genau entlang der Normalen): 0 Abweichungen.

**Texturen**
- **Kleine gemalte Texturen schärfer:** Rumpfplanken, Pflaster, Erde, Rauch (Basis 256 px) malen auf Maximal in 1024 px und auf Ultra in 2048 px (`textureBoost` in `QualityConfig`, höchstens 4096 px je Seite); das Deck (Basis 1024 px) bleibt wie bisher.
- **Modell-Texturen mit Anisotropie:** Der GLTFLoader lässt sie auf 1; ein Plugin (`useAnisotropy` in `core/preload.ts`) setzt vor dem Hochladen den Wert der Grafikstufe (Figuren, Blender-Bauten, KTX2).
- **Kriseln bei flachem Blickwinkel:** Sand, Gras und Fels (`toon.ts`, `DETAIL_FRAG`) blenden ihre feinen Muster zusätzlich nach der Pixelgröße aus (`skFade`, Ableitung der Ansichtsposition: Muster mit der Periode T verschwinden zwischen 8 und 3 Pixeln je Periode). Die Abstandsfunktionen bleiben; sie sahen einen flachen Blickwinkel zu grob. Geprüft bei Tag und Nacht in Ankerglück (Pflaster, Gras, Erdweg scharf, keine Shaderfehler in der Konsole).

**Leistungs-Wächter**
- **Ruckler zählen nicht mehr als Dauerlast:** `render/frameStats.ts` misst die Bildrate ohne die langsamsten 4 % der Bilder (Shader-Übersetzung, Nachladen, Speicherbereinigung). Leistungs-Wächter, dynamische Auflösung und automatische Grafikstufe nutzen sie.
- **Schonfristen:** Nach Spielstart (10 s), Szenenwechsel (an Land gehen, Ablegen, Entern: 6 s), Pause, Tab-Rückkehr und Stufenwechsel wird nicht gemessen (`Game.sceneChanged`).
- **Prozessor oder Grafikkarte:** `GameLoop.cpuMs` misst die Rechenzeit je Bild. Liegt sie über 85 % der Bilddauer (Zeichenaufrufe bremsen), bleibt die Auflösung unangetastet; weniger Pixel brächten nichts.
- **Automatische Grafikstufe:** Erst zwei langsame Fenster zu 6 s hintereinander senken die Stufe (vorher eines), nicht in den ersten 8 s.
- Test im laufenden Spiel (Ultra, Auto): alle 500 ms ein Ruckler von 150 ms, 50 s lang: Stufe, Sparstufe und Auflösung unverändert. 5 neue Prüfungen in `tests/frameStats.test.ts` und `tests/watchdog.test.ts` (81 von 81 bestanden).

**Gemessen, kein Eingriff nötig**
- Bildrate Ankerglück zu Fuß: Maximal 2560 × 1440: 82 fps, Maximal 3840 × 2160: 80 bis 85 fps, Ultra (Auto) 3840 × 2160: Tag 85 fps, Nacht 56 bis 62 fps; Sparstufe 0, Auflösung 100 %. Auf See 118 bis 120 fps.
- Zeichenaufrufe: etwa 970 bis 1230 je Bild in der Stadt (Hauptdurchgang 650, Schatten 600). Die Inseln sind schon fast vollständig instanziert (Ankerglück: 662 von 786 Netzen, 41 656 Instanzen); Bremse ist die Rechenzeit der Zeichenbefehle, nicht die Grafikkarte (Maximal 1920 × 1080: 12,8 ms je Bild mit Warten auf die Grafikkarte, davon 12,3 ms Rechenzeit; Ultra 3840 × 2160: 12,7 ms, davon 10,2 ms Rechenzeit).
- `compileAsync` im Ladeablauf, Anisotropie und Mipmaps der gemalten Texturen, Fußabdruck-Ausblendung im Mauerwerk-Shader waren schon vorhanden.

**Offen**
- Zwei Mauerstücke der Festungsringe zeigen an der Stoßkante Zackenmuster (Z-Fighting, Bild Sturmzahn); nicht behoben.
- Steinhäuser und Lagerhäuser auf sehr steilen Hängen (Geisterriff, Blitzspitze): höchstens 1 bis 1,2 m Spalt auf der Talseite nach der Messung; Zinnentürme höchstens 0,8 m. Kein Sichttest der Burgringe.
- Leuchtturm bei Nacht und ein Handy nicht im Bild geprüft.

**Technik (für Entwickler):**
- `UniformsUtils.merge` klont Uniform-Objekte: gemeinsame Uniforms (`lampFx`) danach wieder einsetzen (`linkShared`). Jedes neue Material mit geteilten Uniforms prüfen: `material.uniforms.x === geteiltes.x`.
- Neue Platzierung auf dem Boden: `groundY(proto, hAt, x, z, sxz, sy)` statt fester Zuschläge; `Proto.minY` und `Proto.rad` kommen aus der Bounding-Box der verschmolzenen Form. Zufallsfolge der Inseln unverändert (Werte werden an derselben Stelle gezogen).
- `Scatter.build` benennt die Netze nach der Vorlage (`mesh.name = proto.id`).
- `texDetail.boost`, `QualityConfig.textureBoost`, `detailCanvas` begrenzt auf 4096 px.
- `FrameWindow` (feste Felder, Sortierung nur am Fensterende); `PerfWatchdog.rewarm(grace)`, `DynamicResolution.rewarm(grace)`, `AutoQuality.reset(grace)`.
- Prüfen im Entwicklungsserver: Playwright, Seite neu laden nach jeder Änderung (Vite lädt komplett neu); `__placeAuditSummary()` nach dem Laden; Zeichenaufrufe je Durchgang über Austausch von `renderer.renderBufferDirect`.

## 2.9.83 – Läuft auch auf eingebundenen Seiten mit strenger Sicherheitsrichtlinie (15.11.2026)

- **Ladebalken blieb auf wildhunt.com.de/sturmkrone bei 2 % stehen (Ursache gefunden und nachgestellt):** Die Seite sendet eine strenge Content-Security-Policy (`worker-src 'self'`, `script-src` ohne `'wasm-unsafe-eval'`, `connect-src` ohne `blob:`). Das Spiel brauchte dreierlei, das sie verbietet: (1) Draco-Modelle (258 Dateien) dekodierte der Standard-DRACOLoader mit WebAssembly in einem Blob-Worker, (2) die acht KayKit-Animationsdateien waren mit Meshopt (WebAssembly) komprimiert, (3) eingebettete Texturen der GLB-Dateien lud der GLTFLoader per `fetch` von Blob-Adressen. Die Richtlinie wurde lokal nachgebaut (`qa3/csp-server.cjs`): vorher Stillstand im Ladebalken, jetzt Menü, Spiel und Figuren-Editor ohne eine einzige Fehlermeldung.
- **Draco ohne WebAssembly:** Erkennt das Spiel die Einschränkung (`wasmAndBlobWorkersAllowed`), nutzt es den JavaScript-Decoder in einem Worker aus einer echten Datei (`libs/draco/draco-js-worker.js`, erzeugt von `scripts/build-draco-worker.mjs`). Auf normalen Seiten (GitHub Pages) bleibt alles wie bisher mit WebAssembly.
- **Texturen:** Bei strenger Richtlinie lädt der GLTFLoader eingebettete Bilder über Bildelemente statt per fetch.
- **Animationen ohne Meshopt:** Die acht KayKit-GLBs sind unkomprimiert (+20 % Größe, 2,3 → 2,8 MB), erzeugt mit `scripts/decode-meshopt.mjs`; Meshopt-Decoder entfällt.
- **Hinweis für die Seite:** Mit `'wasm-unsafe-eval'` in `script-src` und `blob:` in `worker-src` und `connect-src` wäre das Spiel noch etwas schneller beim Laden, nötig ist es jetzt nicht mehr.

## 2.9.82 – Großer Qualitätsdurchgang: Gelände, Brunnen, Leuchtturm, Schiffe, Leistung (15.11.2026)

**Gelände und Bauten (alle Inseln)**
- **Einebnen unter Bauten:** Wohnhäuser, Gasthäuser, Lagerhäuser, Kapellen, Scheunen, Marktstände und der Marktplatz stehen auf eingeebneten Standflächen (`Pad` in `islandGround.ts`, `WalkIsland.addPad`, `levelFootprint`): das Gelände steigt oder fällt mit weichem Übergang (2,4 bis 7 m) zur Fläche, Boden = Mittel der Grundfläche. Das Gelände-Mesh wird nach dem Aufbau der Insel nachgeführt (`islandTerrain().refresh`), die Laufhöhe folgt automatisch. Der Steinsockel bleibt nur noch als Rest für Extremfälle (Ankerglück: 78 Flächen).
- **Gelände-Meshes nicht mehr verschmolzen:** Sie werden aus der Zusammenfassung ausgenommen, damit die Anpassung greift (wenige Zeichenaufrufe mehr).
- **Wege und Gras:** Auf Wegen (Erde, Pflaster) und dem Marktplatz wächst kein Gras mehr (`onPath`); Pflasterwege liegen sichtbar auf der Wiese (Strahltest: 0 bis 9 cm Abstand).
- **Kollisionen:** Haus-Quader liegen 14 cm enger an der sichtbaren Wand, Zaun-Collider 12 statt 30 cm dick (mit Figurenradius 0,38 m blieben Lücken vorher zu schmal).
- **Wiese und Laufhöhe:** (aus 2.9.81) Wiesendecke zählt zur Laufhöhe.

**Brunnen (Ankerglück)**
- Neuer dreistufiger Steinbrunnen aus Blender (`tools/blender/build_brunnen.py`, 14 000 Dreiecke): gestufter Sockel, gegliedertes Becken mit Pilastern und acht Löwenköpfen mit Speiern, Mittelsäule mit vier Delfinen, drei Schalen, goldene Spitze, Moos.
- Wasser im Grafikchip (`world/fountain.ts`): spiegelnde Wasserflächen mit Wellenringen, acht Wasserbögen aus den Speiern, Schleier über die Schalenränder, tanzende Tropfen und Gischt. Nachts gedämpft.

**Leuchtturm**
- Neu gebaut (`world/lighthouseBeam.ts`): zwei Strahlen mit weitem Außenkegel und hellem Kern (Fresnel-Rand, weiche Abnahme, wandernder Dunst), Staub und Gischt im Strahl, glühende Fresnel-Linse mit Prismenringen, pulsierender Lampenkern, Lichthof. Additiv, ohne Tiefenschreiben, doppelseitig, kein Nebel, kein Schattenwurf, sichere Potenzen: keine schwarzen Streifen mehr.
- Steuerung: aus am klaren Tag, sanft an abends, nachts und bei Nebel, Regen oder Sturm (`updateBeams(dt, Nacht, Wetter)`).

**Schiffe**
- **Deck:** neue Deckstextur (`deckTexture`): warm verwittertes Eichenholz, dunkle Teerfugen, versetzte Stöße mit Holznägeln, 1024 px, Mipmaps und Anisotropie; schwaches Relief, Rauheit 0,77; Pfützen zurückhaltend. Auch Achter- und Vorderdeck. Das weiße Kriseln (helle Fugenlinien der Normalkarte und Nässeglanz) ist weg; geprüft bei Tag, Regen und Nacht.
- **Flagge:** nur noch eine Flagge am höchsten Mast (die Wimpel auf jedem Mast waren die zweite); fein unterteilt (22 × 10), weht im Vertex-Shader.
- **Segel:** wehen im Vertex-Shader (`sailMaterial`): Böen, Wellen, flatternde Kanten, Normale folgt der Welle; 26 × 16 statt 10 × 6 Unterteilungen. Die CPU bewegt keinen Eckpunkt mehr (vorher jedes Bild jedes Segel, bei Hero-Schiffen mit Normalen).

**Tiere**
- **Möwen:** eigenes Verhalten je Tier statt fester Formation: kreisen über ihrer Insel, begleiten ein *fahrendes* Schiff (Zahl nach Tempo, vorn, seitlich oder hinterm Heck, nach 25 bis 80 s drehen sie ab), landen im Wasser neben einem still liegenden Schiff (Flügel angelegt, wippen) und starten wieder, Sturzflüge auf Fische mit Gischt.
- **Delfine:** vier Auftrittsarten (Bugwelle bei schneller Fahrt, Rudel an der Seite, Mutter mit Kalb, einzelner großer Sprung weiter draußen); schon ab 3 Knoten.

**Kampf und Bewegung**
- **Schwerthiebe:** Der Lichtbogen ist jetzt der Schweif an der echten Klinge (verlängert über die Spitze, glühende Schneidenkante, länger nachziehend); der feste Bogen vor der Figur liegt nur noch bei Rundumhieben (er lag je nach Clip hinter oder neben der Klinge). Takt: sammeln, Peitschenbewegung durchs Trefferfenster, zügig zurück.
- **Gehen:** Ellbogen nur halb gebeugt und Oberkörper etwas aufrechter (zusätzlich zur Beinführung aus 2.9.80); Bewohner gehen mit `Walking_B` (passt zu 1 bis 1,6 m/s) und geglätteter Schrittgeschwindigkeit.

**Leistung und Fehler**
- **Grafik umstellen hängte den Browser:** Gemessen: erster Wechsel auf Maximal 19 s im ersten Bild (alle Shader am Stück). Jetzt: Kaskaden sofort anlegen, nicht zeichnen, alle Shader parallel übersetzen (`compileAsync`), dann weiter. Erstes Bild danach unter 1 s; Rückwechsel auf bekannte Stufen 60 bis 100 ms. Gilt auch für die automatische Absenkung.
- **Ruckler bei neuen Gegnern:** Shader neuer Gegner werden beim Erscheinen parallel vorübersetzt (`Renderer.warmObject`), nicht erst beim Schwenk der Kamera.
- **Schattenkaskaden gestaffelt:** nahe Kaskade jedes Bild, zweite jedes zweite, die weiteren jedes dritte. Ankerglück auf Maximal: 19,8 → 17,1 ms, Zeichenaufrufe 1395 → 888, Dreiecke 2,07 → 1,16 Mio. je Bild.
- **Gras:** eigenes Material (`vegSoftMat`) mit weichem Ausdünnen im Vertex-Shader (voll bis 24 m, ab 54 m etwa jede zehnte Instanz, Halme schrumpfen statt zu springen); Gras warf schon keine Schatten, Wind läuft im Shader.
- **Tiefenschärfe:** deutlich dezenter (Unschärfe 0,9 bis 1,35 statt 1,3 bis 2,2, größerer scharfer Bereich).
- **Straßenlaternen:** größerer Lichthof, stärkeres echtes Licht.
- **Flaggen-Shader:** Absicherung gegen NaN.
- **Erkannt, nicht umgesetzt:** Das Gras ist bereits instanziert (Blender-Modelle aus `build_env2.py`), ein neues Blender-Büschel wurde nicht gebaut; weitere Details bei Tieren (Modelle) nicht verändert.

## 2.9.81 – Füße am Boden, Wege nicht mehr unter der Wiese, ruhigeres Menü (15.11.2026)

- **Schuhe und Boden (Ursache gefunden):** Die Wiesendecke (Gras und Hügelkappen) liegt 15 bis 19 cm über dem Grundgelände, die Laufhöhe war aber die des Grundgeländes. Figuren standen dadurch mit den Schuhen halb in der Wiese (die Stiefel wirkten wie lang gezogene, abgeschnittene Spitzen), und Häuser, Pflanzen und die Pflasterstraßen der Stadt (nur 8 bis 9 cm über dem Grundgelände) waren teilweise unter der Wiese vergraben. Jetzt zählt die Wiesendecke zur Laufhöhe (`WalkIsland.lift`, gesetzt in `seaWorld.buildIslands`); Figuren, Häuser, Pflanzen, Wege und Straßen stehen auf der sichtbaren Fläche. Strahl-Messung an sechs Punkten: Abstand zwischen Laufhöhe und sichtbarer Fläche vorher 18 cm, jetzt 0 bis 9 cm.
- **Menü:** Die Kamera kreiste 9 m hoch und streifte dabei Palmwedel und Stegleinen am Hafenstadt-Steg, die in der Nahsicht als lange Streifen erscheinen. Jetzt 15 m hoch und 32 m Abstand.
- **Flaggen:** Schutz im Shader gegen Netze ohne Normale oder Gewicht (verhindert NaN-Eckpunkte an geteilten Materialien).
- **Bekannt:** Im Menü bleiben bei manchen Blickwinkeln lange Stegleinen und -reling sichtbar (echte Geometrie in starker Perspektive, kein Fehler im Bildaufbau; Nachbearbeitung wie Reflexionen, Verdeckung, Schatten, Konturen als Ursache ausgeschlossen). Ein Handy ist nicht gemessen.

## 2.9.80 – Gehen ruhiger, Stelzenhütten, Prüfung der Schwerthiebe (15.11.2026)

- **Gehen (Spieler und Bewohner):** Gemessen am Clip `Walking_A`: das Becken sackte bei jedem Schritt um bis zu 14 cm ab (knickende Knie), der Fuß hob sich beim Schwingen bis 65 cm (Ferse zum Gesäß wie beim Joggen). `Character.softenGait` dämpft das Auf und Ab des Beckens auf gut ein Drittel, hebt es etwas und hält die Füße per Beinführung genau an den Stellen des Clips (kein Rutschen); der Fußhub wird auf gut 40 % gedämpft. Gilt nur für Geh-Clips, nicht für Rennen. Kosten: weniger als 0,1 ms je Bild. Auf den Testbildern stehen die Beine gestreckter, die Füße am Boden, der Fersentritt ist weg; der Schritt bleibt weit (power-walk), die Armhaltung des Clips ist unverändert.
- **Schwerthiebe geprüft:** Für alle 34 Angriffe der fünf Kampfstile die Bahn der Schwerthand im Trefferfenster gemessen: Laufrichtung der Schmier-Bögen passt bei allen Clips mit klarer Richtung (Drehhiebe, Diagonal-, Kopf- und Sprunghiebe); Stöße und fast gerade Hiebe laufen neutral. Bögen erscheinen auf Bildern an der Klinge, vor der Figur.
- **Stelzenhütten:** Pfähle reichen 4,6 m unter den Boden (vorher 2,2 m), auch an steilen Hängen stehen sie am Boden.
- **Leistung:** Messung im Testaufbau (hohe Stufe, 1,5-facher Bildpunktfaktor): Spielschritt 0,3 ms, Zeichnen 8,9 ms (Schatten 3,3 ms davon), je Stufe Low 3,6 / Mid 5,2 / High 8,9 / Max 13,2 ms. Kein neuer Leistungsfresser gefunden; Handy nicht gemessen. Keine Grafik gekürzt.

## 2.9.79 – Ankerglück aufgeräumt, Flaggen wehen, Licht mit Tiefe (15.11.2026)

- **Stadtaufbau Ankerglück:** Häuser stehen mit Türhöhe am Hang und bekommen bei Gefälle einen Sockel statt zu schweben oder zu versinken. Gartenzäune und Beiwerk der Häuser sind in der Stadt kompakt (`setYardCompact`) und reichen nicht mehr auf die Straßen. Marktstände, Kisten, Karren und Wimpelmasten sitzen an den Straßen statt darauf. Bewohner starten und laufen entlang der Straßen (`walkways`), weichen Hindernissen und einander aus und werden aus Hindernissen herausgeschoben.
- **Licht:** Straßenlaternen und niedrige Fenster besitzen echte, weiche Lichter; Lichthof und Bodenlicht sind größer und weicher abgestuft, nachts liegt ein leichter Dunst über der Stadt. Nicht mehr grell, dafür mit Tiefe. Hinweis: die Anzahl der Lichter bleibt gleich, nur die Träger wechseln.
- **Flaggen:** Fahnen der Inseln und der Stadt, Heckflaggen und Mastwimpel der Schiffe wehen mit dem Wind (Wellen vom Mast zur freien Kante, Windstärke des Wetters), im Grafikchip gerechnet, ohne Kosten auf dem Prozessor (`render/flags.ts`).
- **Schwerthiebe:** Der Schmierbogen liegt immer vor der Figur und läuft in der Richtung der jeweiligen Animation (`SMEAR_LEFT_TO_RIGHT`): Säbel, Langklinge, Zweihänder, Doppelklingen.
- **Laufen:** Der Takt der Laufanimation passt zur Geschwindigkeit, Neigung des Oberkörpers ist deutlich ruhiger, Gehen und Rennen wechseln mit Hysterese.
- **Wiese und Strand von Ankerglück:** viel mehr Gras, Halme, Blumen, Büsche und Treibholz (instanziert), abseits von Straßen und Bauten.
- **Alle Inseln geprüft (37):** Gleiches Problem wie in Ankerglück auf anderen Inseln: Häuser standen mit der Mitte auf dem Boden, am Hang schwebten sie auf einer Seite (bis 5,6 m Höhenunterschied unter der Grundfläche). Jetzt stehen Wohnhäuser, Scheunen, Gasthäuser, Lagerhäuser und Kapellen überall auf Türhöhe, bei Gefälle trägt ein Steinsockel (`settleOnSlope` in `architecture.ts`, genutzt von `islandDress.ts` und `settlement.ts`). Stelzenhütten, Mauern und Türme sind unverändert.
- **Sternenhimmel:** Die Milchstraße bestand aus harten Quadraten (sichtbar auf Max); sie ist jetzt weiches Rauschen.
- **Flaggen:** Ausschlag etwas gemäßigter, nach Blick von oben und von der Seite geprüft (Wellen laufen vom Mast zur Kante).
- **Leistung:** Neue Dinge laufen über `InstancedMesh`; im Testaufbau (hohe Stufe, Marktplatz) 11,6 ms je Bild. Eine neue, gründliche Suche nach weiteren Leistungsfressern wurde in dieser Fassung nicht durchgeführt.
- **Bekannt:** Die Gehanimation selbst (Walking_A) ist unverändert, nur ihr Tempo und die Neigung; ein Handy wurde nicht gemessen. Schwerthieb-Richtung und Nachtlicht der übrigen Inseln wurden nicht mit Vergleichsbildern geprüft; Stelzenhütten an steilen Hängen können mit einem Pfahl über dem Boden enden.

## 2.9.78 – Ladezeit: kein Hängen mehr, ehrlicher Ladebalken (15.11.2026)

Gemessen im Produktionsbau, gleiche Bedingungen für alte (2.9.77) und neue Fassung: leerer Zwischenspeicher, Grafikkarte ohne gemerkte Programme (so läuft ein allererster Start), Messung der Hauptschleife mit dem Long-Task-Zähler des Browsers.

- **Ladebildschirm sofort:** Er steht jetzt in `index.html` und erscheint nach rund 40 ms. Vorher war die Seite 4,6 s lang leer, weil er erst nach dem Aufbau der Welt entstand. Solange noch nichts gemessen ist, wandert ein Streifen (läuft auf dem Grafikchip weiter, auch wenn der Browser rechnet).
- **Kein Stillstand mehr:** Inseln und Städte (`SeaWorld.buildSteps`, je Insel ein Schritt), Bewohner (`setCharactersSteps`, je Figur), Figuren, Schiffe und Texturen der Shader-Vorbereitung laufen in Stücken; nach jedem gibt `core/yield.ts` dem Browser Luft (per Nachricht, im Hintergrund-Tab nicht gebremst; auf ein gezeichnetes Bild wird höchstens 50 ms gewartet). Längster Block beim allerersten Start: **29,6 s → 6,3 s**; Gesamtdauer des allerersten Starts 40,7 s → 19,6 s.
- **Shader parallel:** `GameRenderer.precompile` übersetzt die Szene mit dem Zielpuffer der Nachbearbeitung als Ziel. Zuvor übersetzte `compileAsync` für den falschen Farbraum, das erste echte Bild musste alles noch einmal am Stück übersetzen. Das erste Bild wird jetzt zusätzlich in Gruppen aufgebaut (Objekte nacheinander eingeblendet, Lichter bleiben, damit sich die Lichtzahl nicht ändert).
- **Spielschleife erst nach dem Laden:** Hinter dem deckenden Ladebildschirm zeichnete sie jedes Bild umsonst (rund 1,4 s Rechenzeit).
- **Ladebalken:** Vorher sprang er sofort auf 60 bis 70 %, weil nur die bisher angemeldeten Dateien zählten, stand dort 35 s lang und lief am Ende auf 85, 97, 100 %. Jetzt gilt ein Plan (Dateien 23 %, Inseln und Städte 30 %, Bewohner 10 %, Shader 37 %) mit der erwarteten Gesamtgröße der Modelle (10,4 MB) als Untergrenze; der größte Sprung beträgt 24 Prozentpunkte, der Balken zeigt erst am Ende 100 %. Der nicht teilbare Schritt (Nachbearbeitung übersetzen) zeigt wieder den wandernden Streifen mit dem Text, dass der allererste Start länger dauert.
- **Bekannt:** Beim allerersten Start auf einem Gerät bleibt ein nicht teilbarer Block (hier 6,3 s, 52 Programme der Nachbearbeitung); die Grafikkarte merkt sich die Programme danach, spätere Starts sind deutlich kürzer. Handy nicht gemessen.

## 2.9.77 – Handy-Prüfung: Spielstand-Hinweis und Fehleranzeige (14.11.2026)

Geprüft im Handyformat mit echten Touch-Ereignissen (Chrome-Emulation, Hoch-, Quer- und kleine Formate bis 320 × 568, Stufen Niedrig und Mittel, Entwicklungs- und Produktionsbau): Hauptmenü, Spielstände, Charakter-Editor, „Ablegen!“, Feuer, Links, Rechts und Munition reagieren; keine Fehler in der Konsole; die Knöpfe werden in keinem Format verdeckt; Schüsse und Breitseiten laufen für alle sechs Schiffsklassen und alle Munitionsarten ohne Fehler.

- **Neuer Charakter nicht möglich:** Es gibt drei Spielstand-Plätze. Sind alle belegt, erscheint nirgends „Neues Spiel“ – das sah aus, als ginge das Erstellen am Handy nicht. Jetzt steht über den Plätzen ein Hinweis („Alle drei Plätze sind belegt“) mit dem Weg: bei einem Spielstand auf „Löschen“ tippen (vorher „Exportieren“); danach erscheint dort „Neues Spiel“. Löschen per Touch ist geprüft.
- **Fehleranzeige:** Unbehandelte Fehler (Skript und Versprechen) blendet das Spiel jetzt kurz ein (höchstens drei verschiedene je Sitzung, `main.ts`), damit sich „reagiert nicht“ am echten Handy mit dem Fehlertext melden lässt.
- **Nicht nachgestellt:** Der nicht reagierende Feuerknopf. Im Test feuern alle drei Knöpfe auch mit kurzem Antippen (Eingabe wird je Schritt zwischengespeichert, auch bei niedriger Bildrate). Die Bugkanone („Feuer“) hat 1,2 s Abkühlzeit. Bei echtem Auftreten bitte Handy, Szene und die eingeblendete Fehlermeldung nennen.
- **Bekannt:** Der Heap liegt schon im Menü bei rund 410 MB (davon etwa 316 MB CPU-Kopien der Geometrien, 170 MB Texturen); auf Handys mit wenig Speicher ist das knapp.

## 2.9.76 – Leistung für Handys (14.11.2026)

Gemessen im Handyformat (390 × 844, Pixelverhältnis 3) mit auf das Vierfache gedrosselter Prozessorleistung als Ersatz für ein Handy; echte Geräte sind nicht gemessen. Grafik unverändert.

- **Figuren außerhalb des Bilds (`render/matrixSkip.ts`):** In der Stadt waren über 1 900 sichtbare Knoten Skelettknochen. Figuren außerhalb der Kamera (Sicherheitsabstand 6 m) rechnen ihr Skelett nicht mehr jedes Bild mit; der Halter bleibt aktuell, beim Wiedereintritt rechnet dasselbe Bild alles neu. Geprüft: 15 379 Knochen während einer Kameradrehung um 360 °, keiner veraltet. Hafenstadt bei Nacht auf Mittel: 30,6 → 26,3 ms je Bild (gedrosselt).
- **Schatten-Takt (nur Handys, nur wenn der Leistungs-Wächter eingreift):** Die Schattenkarte der Stufe Mittel wird dann jedes zweite Bild neu gezeichnet (`Environment.shadowStride`); sie bleibt mit ihrer Matrix an die Welt gebunden, nur Schatten bewegter Figuren hinken ein Bild nach. Gemessen: 26,3 → 23,1 ms (insgesamt 30,6 → 23,1 gegenüber vorher). Auf Handys, die ohnehin 50 fps halten, bleibt alles wie bisher.
- **Gemessene Werte (gedrosselt, je Bild):** Niedrig See 15 ms, Stadt Nacht 14 ms, Insel mit Kampf 14 ms; Mittel See 18 ms, Insel mit Kampf 14 ms, Stadt Nacht 26 ms (23 ms mit Schatten-Takt).
- **Nicht geändert (würde Grafik ändern):** Dreiecksmenge der Stadt (1,7 Mio. auf Mittel, davon rund 0,6 Mio. im Schattendurchgang), Konturen als Hüllen, Figuren-Skelette je Netz.

## 2.9.75 – Leistung: Kajüte, Gegner-Spawn, Matrizen (14.11.2026)

Gemessen mit einem Prüfaufbau im Entwicklungsserver (Zeit je Bild mit Grafikkarten-Abschluss, Chrome-Profiler, Programmzähler); Grafik und Details unverändert.

- **Kajüte betreten (Hänger von bis zu 7 s):** Eine Schiffslaterne (Punktlicht) hing im Kajütendach. Beim Ausblenden des Daches änderte sich die Lichtzahl von 6 auf 5, three.js übersetzte alle beleuchteten Materialien neu (43 Programme). Lichter bleiben jetzt außerhalb des Dachs (`shipBuilder.ts`). Danach: 11–15 ms je Bild beim Betreten, keine neuen Programme.
- **Gegner- und Schiffs-Spawn:** three.js gab die Shader-Programme eines Gegners frei, sobald der letzte seiner Art verschwand, und übersetzte sie beim nächsten Spawn neu (Bilder von 120–140 ms). `Renderer.pinPrograms()` hält jedes übersetzte Programm dauerhaft (rund 300, wenig Speicher). Jedes Programm wird nur noch einmal übersetzt; Spawn von vier Gegnern: erstes Bild 22–27 ms statt 120–140 ms.
- **Matrizen (`render/matrixSkip.ts`):** Rund 70 % der 14 800 Szenenobjekte liegen in ausgeblendeten Gruppen (Inseln außer Sichtweite, ruhende Figuren). `Scene.updateMatrixWorld` besuchte sie trotzdem (etwa 3,3 ms je Bild). Die Aktualisierung der Szene überspringt jetzt Unsichtbares; direkte Aufrufe (`getWorldPosition`, `group.updateMatrixWorld(true)`) rechnen unverändert. Hafenstadt bei Nacht: 12,2 → 8,9 ms je Bild (zusammen mit dem nächsten Punkt).
- **Gesichtsteile:** durchscheinende, doppelseitige Karten (Wimpern, Augen, Glanz; 108 Netze) zeichnete three.js in zwei Durchgängen und stieß dabei je Teil und Bild die Programmsuche an (`needsUpdate`). Sie laufen jetzt in einem Durchgang (`forceSinglePass`); Pixelvergleich gegen die alte Fassung: kein Unterschied über dem Rauschen.
- **Geprüft ohne Befund (kein Leck):** 8 × 2200 Bilder in der Stadt, wiederholtes An- und Von-Bord-Gehen auf vier Inseln mit Gegnern und Kills, fünf Seegefechte mit Beschuss und Versenken: Geometrien, Texturen, Programme und Szenenobjekte bleiben flach (ein Seegefecht lässt rund 3 Objekte zurück, Kisten, harmlos). Bildzeit schwankt nur mit Tageszeit und Wetter (Nacht und Sturm kosten mehr).
- **Bekannt, nicht geändert (würde Grafik ändern oder ist riskant):** Konturen als Hüllen auf Niedrig/Mittel verdoppeln die Dreiecke der Welt; Figuren haben je Netz ein eigenes Skelett (rund 158 Knochen-Texturen je Bild); der Heap liegt bei rund 500 MB (CPU-Kopien der Geometrien); echte Handys nicht gemessen.

## 2.9.74 – Veröffentlichung: Schiffe 2, Welt 2, Figuren und neues Licht zusammen (14.11.2026)

- **Schiffe 2 ist jetzt Standard** auf der veröffentlichten Seite (`core/flags.ts`). Mit `?schiffe2=aus` hinter der Adresse kommt die bisherige Schiffsfassung zurück, mit `?schiffe2` wieder die neue (der Browser merkt sich die Wahl).
- **Brunnen auf dem Marktplatz von Ankerglück:** die schlichte Säule bekommt eine obere Schale mit Wasserspiegel und einen Kugelabschluss.
- **Abschlussprüfung** (Playwright, Spielstart über die Menüs bis zum Spaziergang durch Ankerglück): Charakter-Editor, neuer Spielstand, Nacht, Sturm, Regen und Nebel auf See, alle sechs Schiffsklassen nachts (Heckgalerie, Laternen, Leuchtturmstrahl), Hafen, Tor, Straßen und Markt bei Nacht, Handyformat auf Mittel und Niedrig; Konsole ohne Fehler und Warnungen; `tsc`, 72 Tests, Produktionsbau.
- **Bekannt:** Auf Niedrig ist die Figur nachts sehr dunkel (dort laufen keine Punktlichter). Nicht gemessen: echte Handys, Seegefechte mit vielen Schiffen in der neuen Schiffsfassung.

## 2.9.73 – Licht und Feuer: 3D-Flammen, Blender-Lampen, Lichtpool mit Schatten, Funken, Rauch, Hitzeflimmern (14.11.2026)

- **Neue Blender-Modelle** (`tools/blender/build_light2.py`, Rollen `iron`, `brass`, `glass`, `ember`, `charcoal`, `log`): **Schiffs- und Hafenlaterne** (`world/laterne.glb`, `light/laternenpfahl.glb`: sechseckiger Schmiedekäfig mit Messingbändern, Glasscheiben, Haube mit Schornstein, Tragering, Kette, Ölnapf mit Docht), **Fackel** (gedrechselter Holzgriff, Eisenzwingen, Eisenkorb, Pechwickel, verkohlter Kopf mit Glutnestern), **Feuerschale** (schwere Eisenschale mit Wulstrand, Verstärkungsbändern und drei Nietenreihen, Dreibein mit Krallenfüßen, Tragringe, Kohle- und Scheitbett) und **Feuerstelle** (Steinring, Scheite, Glutnester). Eckpunktfarbe `Col` = Hitze der Glut. Ersetzen die alten Modelle unter gleichem Namen mit gleichen Flammenpunkten; Schiffe stellen die Laterne weiter per `PropBatch` (InstancedMesh) auf, Torhaus-Fackeln, Straßenlaternen, Stege und Wachtürme nutzen dieselben Modelle.
- **Laternenglas und Glut als Material** (`render/lampMaterials.ts`): `lanternGlass` (durchscheinend, Fresnel-Rand mit Himmelsspiegelung, tagsüber Bernstein, nachts von innen glühend, flackernder Kern) und `coalMaterial` (Schwarzkörper-Rampe dunkelrot → gelbweiß, die Nester pulsieren gegeneinander). Bewusst kein `MeshPhysicalMaterial` mit Transmission: das rendert die ganze Szene ein zweites Mal und wäre auf Handys zu teuer; das eigene Glas liefert den Eindruck in einem Durchgang und wird von allen Laternen geteilt.
- **Flammen als 3D-Körper** (`render/flameShaders.ts`, `render/glow.ts`): drei ineinander liegende Zungen-Schalen (außen rot, Mitte orange, Kern gelbweiß) statt eines Billboards. FBM-Rauschen verschiebt die Eckpunkte (stärker mit der Höhe, nach oben laufend), die Spitze zerfasert, weiche Fresnel-Ränder, Schwarzkörper-Farbverlauf, **Wind** biegt die Spitze (Windrichtung und Böen der Welt, `GlowSystem.wind`). Laternen bekommen eine kleine Kerzenflamme hinter dem Glas.
- **Funken, Rauch, Hitze:** Funken (14 je Feuer, GPU-Bahn mit Aufstieg, Turbulenz und Wind, ein Zeichenaufruf), Rauchschwaden (weich, im Wind, von unten vom Feuer angeleuchtet, Himmelsfarben aus der Umgebung) und **Hitzeflimmern** über den nächsten drei Feuern (nur Hoch/Maximal/Ultra, über den vorhandenen `HeatEffect`). Ersetzt die alten Einzel-Funken der Lagerfeuer.
- **Lichtpool:** `LampPool` mit bis zu **6 echten Punktlichtern** (Niedrig 0, Mittel 3, Hoch 5, Maximal und Ultra 6). Feuer und Fackeln haben Vorrang vor Laternen an Figuren, Flackern im Takt der sichtbaren Flamme (`flickerOf`, Sinus-Rauschen mit seltenen Windstoß-Einbrüchen, gleiche Phase). Das erste Licht wirft **Schatten** (Würfel-Schattenkarte 512², ab Hoch) und gehört immer dem nächsten Feuer: Kisten, Zäune, Zelte und Figuren werfen Schatten ins Feuerlicht; am Tag friert die Karte ein. Die ferneren Quellen leuchten weiter über Flamme, Lichthof und Bodenlicht. Fackeln leuchten schwächer als Lagerfeuer.
- **Lichthöfe und Lichtkegel:** der Hof tritt in der Nähe zurück (sonst deckte er das Modell zu) und wächst in Nebel und Regen (`GlowSystem.mist`); unter Laternen steht ein Fresnel-gedämpfter **Lichtkegel**, nachts leise, im Dunst deutlich sichtbar. Nasser Boden wirft das Lichtfleck-Licht kräftiger zurück.
- **Niedrig:** bisher gar keine Flammen und Höfe; jetzt Sparstufe (`GlowSystem.quality 0.5`): Flamme und Hof der Nahen, ohne Funken, Rauch, Kegel, Bodenlicht und Hitze.
- **Geprüft** (Playwright, Hoch/Mittel/Niedrig, Handy-Hochformat): Nacht im Hafen, Sturm und Regen, Nahaufnahmen von Laterne, Fackel, Feuerschale und Lagerfeuer, Konsole ohne Fehler und Warnungen; GPU-synchron gemessen am Lagerfeuer 6,9 ms (Hoch, davon rund 1,5 ms für das Schattenlicht), Glow-System selbst unter 0,5 ms; Tests und Build.
- **Grenzen:** keine echte Raytracing-Spiegelung; Spiegelungen bleiben SSR (Hoch+), Himmelsprobe (IBL), Wasserglitzern und Lichtfleck. Lichthöfe sind nicht tiefenweich (kein Tiefenpuffer-Zugriff), sondern nutzen die normale Tiefenprüfung.

## 2.9.72 – Figuren und Ausrüstung: Umhänge, Blender-Helme und -Schultern, sechs neue Sets, neue Waffen (14.11.2026)

- **Umhänge liegen am Körper statt abzustehen:** Der Stoff stand am Gesäß 16 cm vom Rücken ab (Wulst plus wachsender Abstand). Jetzt hängt er vom hintersten Punkt des Gesäßes senkrecht herab, weitet sich nur am Saum zur Schleppe und lässt oben und an der Taille Platz für Kürass, Jacke und Gürtel (die Löcher im Stoff kamen von zu geringem Abstand). Über einem langen Mantel oder Rock (`overCoat`) liegt er weiter außen. Der Umhang schwingt: er weht beim Laufen nach hinten und flattert leicht (Vertex-Shader mit `capeK`, ein eigenes Material je Figur, Werte aus der Hüftbewegung in `Character.updateCape`).
- **Neue Blender-Modelle** (`tools/blender/armorlib.py`, `build_helme.py`, `build_schultern.py`, `build_waffen2.py`): Helme Ritter (Sallet mit Federbusch), Drache (Hörner, Glutaugen), Kabuto, Krone, Kapuze, Flügelreif und Hörnerhelm; Schultern Lamellen, Drachendornen und Federschwingen; Waffen Säbel, Katana, Zweihänder, Kurzklinge, Faustpanzer in drei Stufen und der Faji-Fokus (Kristall in goldener Fassung). Neue Rolle `glow` und Veredelung `glut` (leuchtet im Bloom). Waffen übernehmen die Stufenfarbe in der Klinge; fehlt ein Modell, bleibt die alte Eigenbau-Form.
- **Alte Sets aufpoliert:** Kettenjäger, Sturmleder, Eisenwall, Seekönig, Schuppenwache, Nebelwandler, Drachenpanzer, Sturmgeborene und Abgrundwächter tragen jetzt die neuen Helme und Schultern statt der groben Kuppeln und Dorne.
- **Sechs neue Sets** (`data/gear.ts`): Turnierritter (selten, Stufe 20), Schattenläufer (selten, 26), Mondwacht-Ronin (episch, 36), Wyrmjäger (episch, 42), Gezeitenkönig (legendär, 58), Himmelsrichter (legendär, 62). Sie erscheinen im Ausrüster, als Beute und an Gegnern.
- **Geprüft:** alle 20 Sets von vorn, hinten und der Seite, Waffen jedes Kampfstils, Umhang im Lauf, `npm test`, Produktions-Build. Die Modelle sind mit Draco auf 0,6 MB verkleinert.

## 2.9.71 – Welt 2, dritter Durchgang: Mauerwerk ohne Gekritzel, weicher Wiesenrand, Piratenlager, Leuchtturmstrahl (14.11.2026)

- **Mauerwerk, Ziegel und Putz scharf:** Die Muster rechnen mit Weltkoordinaten bis 3000 m; aus Pixel-Ableitungen schwankte die Flächenrichtung und daraus wurden Millimeter-Fehler – das war das „Abgekritzelte“ (Bogenmuster, Pünktchen an den Fugen). Stein-, Ziegel- und Putz-Materialien nutzen jetzt die exakten Eckpunkt-Normalen (kein `flatShading` mehr für diese drei), einen auf 1/4096 gerundeten Rahmen je Fläche und getrennte Phase (`skPhase`: Kameraanteil + kleiner Rest relativ zur Kamera). Ergebnis: echte Ziegelreihen mit Fugen und Fasen, Schieferziegel auf den Dächern, saubere Torhäuser. Burgstein etwas heller.
- **Wiesenrand:** Neues Detail `grassCap` (Attribut `aEdge`): die Wiese geht in trockenes Gras, ausgefranste Büschel und dann in den Sand über, die Kante sinkt auf den Sand; gilt auch für Hügel. `mergeByMaterial` behält `aEdge`.
- **Sand:** Dünenwellen im Meterbereich, warme Mulden, Spülsaum mit Tang an der Flutlinie.
- **Piratenlager neu gebaut** (alle Lager-Inseln): Holzpalisade mit Tor zum Meer und Querbalken, zwei Wachtürme und Laternen am Tor, Giebelzelte mit Türklappe, Firststange und Spannseilen, Kapitänshütte, Vorräte, Waffenständer, zwei Feuerstellen mit Sitzbalken, Erdplatz, hohes Banner mit Totenkopf – aus der Luft gut zu erkennen.
- **Wege unter der Wiese:** Dorfwege und Burgstraßen lagen unter der Grasfläche (0,15–0,19 m); `islandTerrain` liefert jetzt `liftAt`, die Wege folgen der Wiese.
- **Effekte:** Blütenstaub im Sonnenlicht und Sandfahnen am Strand (tags, in der Nähe der Spielfigur), umlaufender Lichtkegel des Leuchtturms nachts (`world/lighthouseBeam.ts`).
- **Vulkan:** Die Kegel zeigten dreieckige Schattenflecken (Schatten auf großen steilen Flächen), jetzt ohne Schattenempfang.
- **Geprüft:** alle 37 Inseln aus der Luft, Bodenansichten auf 8 Inseln, Tore, Dächer, Handy-Hochformat auf Niedrig (245 Aufrufe, 0,8 Mio. Dreiecke) und Mittel (337 Aufrufe, 1,0 Mio.), Ultra bei 59 fps, Tests und Build.

## 2.9.70 – Welt 2, zweiter Durchgang: Stege, Burgringe, Straßenstadt, Relief (14.11.2026)

Rückmeldung zu 2.9.69 abgearbeitet: Burgen, Tore, Anfangshafen, Stege, Boden und Texturen.

- **Stege begehbar:** neues `Pier`-System in `islandGround.ts`. Man läuft auf den Stegen bis zur Spitze, über den Wasserrand hinaus nur auf dem Steg. Anlegen (`collidePiers`) gleitet seitlich am Steg entlang und richtet das Schiff aus; „An Bord gehen“ greift früher (Abstand < 16 m oder Schiffsreichweite < 26 m); beim Anlegen steht man auf dem Steg neben dem Schiff. Pier-Höhen: Außenposten und Stellen 1,45 m, Stadt 1,65 m.
- **Burgen mit Logik:** `curtainWall` baut einen geschlossenen Mauerring (Wehrgang-Kanten 7 m, Tore 15 m, Türme an jeder dritten Kante) mit Straßen im Hof (`courtRoads`) und der Festung (`fortress`: Bergfried, Kapelle, Lagerhäuser, Kaserne). Das Torhaus (`build_arch2.py`) hat einen gewölbten Durchgang mit Mauerwerk (`vault_fill`); die hellen Platten im Tor waren durchgehende Steinbänder (`courses` mit `cx`). Tiefere Fundamente an Mauer, Turm, Torhaus und Bergfried.
- **Ankerglück als Straßenstadt:** Hauptstraße vom Hafentor, Ring- und Außenring, vier Gassen, Kaistraße; Häuser stehen an den Straßen mit Tür zur Straße, Zäune mit Lücke, Kisten und Karren, Laternen alle 13 m, Lagerhäuser und Hafenmeisterei an der Kaistraße. Kopfsteinpflaster mit Erdrand (`cobbleMaterial`, `dirtMaterial`, `roadMesh`).
- **Relief:** `islandTerrain` baut Strand, Gras und Hügel als Polargitter mit gemeinsamer Höhenfunktion; `IslandGround` kennt das Relief (`reliefAt`), es klingt zum Wasserrand auf 0 ab. Man läuft über echte Hügel statt Flachland.
- **Texturen:** Stein-, Ziegel- und Putz-Shader mit Tangentenraum aus Sicht-Ableitungen und Pixel-Footprint-LOD (das Gekritzel kam von numerisch instabilen Weltkoordinaten bis 3000 m); dunklerer Mörtel, Wiesenflecken im Gras.
- **Bewuchs:** dichtere Büschel, Blumen und Gras, Pflanzen je Biom, Bodenbelag (Kiesel, Strandgras, Stümpfe, Stämme, Pilze), Schilf an Ufern, Dornenbusch nur auf Klippen.
- **Licht:** Fenster- und Straßenlichter der Stadt melden sich bei `GlowSystem` an (`TownBuild.glows`), wärmeres Bodenlicht der Hemisphäre, hellere Aschepalette auf Glutheim.
- **Fix:** Kajüte war zu Fuß nicht erreichbar (Türlücke fehlte in `DeckGround`).
- **Geprüft:** alle 37 Inseln aus der Luft, Kollisionsprüfung der Gebäudeboxen (nur 1–2 m Berührung an Mauern/Türmen), Nachtansicht, Leistung ca. 760–810 Aufrufe und 1,4 Mio. Dreiecke je Bild auf Ultra bei 59 fps, `npm test`, Produktions-Build.

## 2.9.69 – Welt 2: Blender-Inseln, Piratenstädte, Burgen, neue Pflanzen (14.11.2026)

**Wichtigster Fund: die Blender-Modelle der Welt waren nie auf den Inseln.** `SeaWorld` baut die Inseln im Konstruktor des Spiels, die Modelle (Palmen, Bäume, Häuser, Türme …) luden erst danach in `Game.start()`. Deshalb standen auf allen Inseln und in Ankerglück die alten Eigenbau-Formen (Sternpalmen, Kistenhäuser). `main.ts` lädt Pflanzen, Bauten und Welt-Props jetzt vor dem Spiel (`loadEnvModels`, `loadArchModels`, `loadWorldProps`, Doppelladen wird übersprungen).

**Neue Bauten (`tools/blender/build_arch2.py`, `public/models/architecture/`, `StructureType` in `data/settlements.ts`)**
- **Fachwerkhaus** (Überhang, Streben, Blumenkästen, Schornstein), **Kolonialhaus** (Balkon über die ganze Front, Bogentür und Bogenfenster, Terrakotta-Walmdach, acht Pastellfarben), **Lagerhaus** (große Doppeltür, Ladeluke mit Hebebalken, Tau und Haken, Rampe mit Fässern), **Kapelle** (Glockenturm mit Glocke und Spitzdach), **Marktstand** (gestreifte Markise, Obst, Fässer), **Hafenkran** (Tretrad, Ausleger), **Leuchtturm** (rot-weiße Ringe, Galerie, Laternenhaus mit Leuchtfläche und Lichthof).
- **Burgteile:** Zinnenturm (rund, Machikuli, Fahne), Zinnenmauer-Stück (6 m), **Torhaus** mit Fallgitter und Wappen, **Bergfried** mit vier Ecktürmchen.
- **Festung Nordwacht** besteht jetzt aus Zinnenmauern rundum, Rundtürmen alle 24 m, drei Torhäusern, einem Bergfried und Hofgebäuden. Die Bosse der anderen Inseln bekommen ein Torhaus mit Mauerbogen und Rundtürmen. Leuchtfeuer-Inseln haben einen echten Leuchtturm mit Wärterhaus.
- **Ankerglück:** Taverne und Hafenmeisterei aus den Blender-Häusern, Hafentor (Torhaus über der Hauptstraße) mit Zinnenmauern und Türmen, Hebekräne am Kai, drei Lagerhäuser, Kapelle, bis zu 8 Marktstände am Platz, alle Wohnhäuser im Wechsel Fachwerk, Kolonial, Stein und Holz. Nur jedes dritte Haus raucht.
- **Häfen:** je ein bis zwei Lagerhäuser, Kran, Marktstände und Kapelle; Bauweise je Region (Fachwerk im Norden, Kolonialhäuser in den Tropen).

**Neue Pflanzen (`tools/blender/build_env2.py`, `public/models/env/`)**
- Kokospalmen mit Fiederblättern (sechs Varianten, ersetzen die Sternpalmen, ohne Tuschkontur), mächtige Eichen mit Wurzelanläufen, Birken mit Rindenmalen, Kiefern und Windkiefern in Etagen, Bananenstauden mit Fruchtstand, Agaven, Schilf mit Rohrkolben, Grasbüschel (drei Formen), Blumen (Farben je Palette), blühende und dürre Büsche, bemooste Felsen. Rollen `bark2`, `fruit`, `flower`, `flower2`, `moss` färbt `envColors` je Region.
- Dichte der Inseln: mehr Bäume, Büsche, Gras (doppelt), Blumen (doppelt) und Schilf am Ufer; Bananen und Agaven nach Region.
- **Gras-Shader:** großflächige Wiesenflecken, dunkler Waldboden und Wildblumeninseln, die man schon aus der Luft sieht.

**Schiffe (Schiffe 2, nur Entwicklung)**
- Geschütze und Stückpforten sitzen bündig an der neuen Rumpfform (`hullSideX`), die zweite Heckgalerie (alt) entfällt, jede Klasse hat eine eigene Grundrissform (Bugschärfe, Völligkeit, Heckbreite); die Form lebt je Schiff in einer eigenen Funktion, damit Kollision und Deck des einen Schiffs nicht vom nächsten Bau abhängen.

**Geprüft (Playwright):** Ankerglück am Boden und aus der Luft, Nordwacht von außen und am Tor, Palmenküste, Grünmark, Leuchtturm, Sturmklippe, Häfen verschiedener Regionen, jedes neue Modell einzeln. `tsc`, 72 Tests, Produktionsbau; Konsole ohne Fehler. Leistung (Palmenküste, zwei Bilder gezählt): rund 540 Zeichenaufrufe, 5,5 Mio. Dreiecke inklusive Schattenkaskaden; Ankerglück 1 860 Aufrufe für zwei Bilder.

**Nicht gebaut / offen:** Geländekanten und Wege (die Dorfwege bleiben schmale Pfade), eigene Burgen für Schlundkrone und Blitzspitze (sie bekommen das allgemeine Torhaus-Ensemble), Gefechte mit vielen Schiffen vor den neuen Inseln und echte Handys sind nicht gemessen; auf schwachen Geräten kann die höhere Pflanzendichte kosten, die Grafikstufe skaliert sie (`texDetail.density`).

## 2.9.68 – Schiffe 2 (Entwicklungsfassung) und Fix der Kajütentür (13.11.2026)

**Fix, gilt für alle Fassungen:** Die Kapitänskajüte war zu Fuß **nie erreichbar**. Die Vorderwand des Achterkastells hatte für das Hauptdeck keine Lücke an der Tür, die Figur blieb 0,4 m davor stehen (nur Sprünge ins Innere funktionierten). Die Wand lässt jetzt die Türlücke frei; auf dem Achterdeck schließt die Türwand sie weiter gegen den Absturz. Per Laufskript geprüft: Schaluppe, Brigg, Fregatte, Galeone, Linienschiff und Leviathan erreichen den Raum und die Heckwand.

**Schiffe 2 – nur als Entwicklungsfassung, die bisherigen Schiffe bleiben**
- **Schalter:** `src/core/flags.ts`. In `npm run dev` ist Schiffe 2 an, auf der veröffentlichten Seite aus. Mit `?schiffe2` hinter der Adresse einschalten, mit `?schiffe2=aus` ausschalten (der Browser merkt es sich). Die alte Fassung ist unverändert im Code (`hullGeometry`, flache Heckwand, alte Kajüteneinrichtung).
- **Rumpf (`entities/ship/shipHull2.ts`):** dichtere Spanten (30 bis 56 Schnitte statt 22), echte Berghölzer als Stufen (Kette, Haupt, oben, Schandeckel in Gold), Tumblehome am Heck, Flare am Bug, Heckspiegel weicht unten zurück (Gegenhölzer), Kupferboden mit Grünspan an der Wasserlinie, Schmuckband zwischen den Geschützreihen, beide Bordseiten vollständig. Stärkerer, weich auslaufender Deckssprung (Bug steigt kräftig, Heck sanfter). Neue helle Plankentextur (`render/shipTextures.ts`): Plankengänge, Stoßfugen, Holznägel.
- **Heckgalerie:** die Heckwand des Achterkastells wölbt sich nach hinten, Bogenfenster in goldenen Rahmen mit Pfeilern (eine Reihe, ab 3,3 m Kastellhöhe zwei Reihen), Balkone mit Geländer und Docken, Sockel- und Kranzleiste rundum, Bogenfenster auch seitlich. Die Fenster leuchten nachts (Glas auf allen, Lichthof nur auf jedem zweiten der unteren Reihe, damit das GlowSystem nicht überläuft).
- **Galion (ab Brigg):** goldene Backen zur Figur, Gräting, Katköpfe mit Rolle.
- **Prunkkajüten ab 8 m Raumlänge (Fregatte bis Leviathan, Höhe bis 5,3 m):** neue Blender-Möbel (`tools/blender/build_kajuete2.py`, `public/models/ships/`): Himmelbett mit Baldachin und Vorhängen, Kronleuchter, Anrichte mit Spiegel und Aufsatz, Fensterbank mit Samtkissen und Vorhängen, Waffenwand (Säbel, Pistolen, Rundschild), Gemälde, Kajütenofen mit Rauchrohr bis zur Decke, lange Tafel mit Gedecken (dazu 6 bis 8 Stühle). Dazu Schreibtisch vor den Heckfenstern, Bücherregale, Globen, große Teppiche. Die Raumschale kommt für alle Klassen: Parkett im Schachbrett, Sockel, Wandvertäfelung mit Füllungen und Zierleiste, Pilaster, Kranzleiste (Wandfarbe je Größe), Bogenfenster von innen. Kerzenflammen leuchten (eigenes Netz mit dem Lampenmaterial). Die Linienschiffe und der Leviathan bekommen zwei Kronleuchter.
- **Erreichbarkeit:** der Ring um die Masten hat in Schiffe 2 nur noch 0,2 m Aufschlag (vorher 0,55 m), damit man um den Besan herum zur Tür kommt.

**Geprüft (Playwright):** alle sieben Klassen von Heck, Bug und Seite verglichen mit der alten Fassung, Kajüten von oben und in der Spielkamera (Tag und Nacht), Heckgalerie bei Nacht, Laufweg in die Kajüte, `tsc`, 72 Tests.

**Kosten:** je Schiff +3 bis +21 Netze und +16 % (Schaluppe) bis +27 % (Leviathan) Dreiecke gegenüber der alten Fassung (gemessen an der Schiffsgruppe, mit Konturen; 104 000 bis 287 000). Nicht gemessen: Gefecht mit vielen Schiffen, echte Handys, einzelne Grafikstufen.

**Nicht gebaut:** Beakhead mit Schnitzwerk, eigene Rumpfformen je Klasse (alle Klassen teilen die Draufsicht), Mannschaftsdeck und Laderaum.

## 2.9.67 – Fenster, Wasserspiegelung, Hüftlaterne und begehbare Kapitänskajüte (13.11.2026)

**Offene Punkte aus 2.9.66, erledigt**
- **Fenster leuchten:** Fenster der Häuser, der Hafenstadt und der Schiffe (Heckgalerie, Oberlicht) haben einen kleinen Lichthof; Fenster im Erdgeschoss werfen zusätzlich einen warmen Lichtfleck auf den Boden davor. Die Richtung kommt aus der Drehung der Fläche (`GlowSpec.px/pz`, `pdx/pdz`). Neue Lichtart `window` im GlowSystem (ruhiges Flackern, kürzere Reichweite von 150 m).
- **Spiegelung im Wasser:** Schiffslaternen, Bojen, die Steg-Laterne und die Laternen der Außenposten werfen einen Lichtstreifen aufs Wasser, der von der Lampe zum Betrachter läuft (Funkelbänder, nahe am Betrachter breiter). Vierte Schicht im GlowSystem, 48 Streifen, 170 m Reichweite, nur nachts.
- **Hüftlaterne der Figuren:** neues Modell mit Henkel, Dach mit Knauf, Glaszylinder, heller Flamme, Messingband, Streben und Fuß.
- **Stimmung und Leistung:** Morgenrot, Abendrot und Nacht angesehen, die Palette bleibt (stimmig). Leistung mit und ohne GlowSystem im nächtlichen Dorf: 530 gegen 528 Zeichenaufrufe, Dreiecke gleich, CPU-Zeit je Bild 3 ms in beiden Fällen.

**Begehbare Kapitänskajüte auf allen sieben Schiffsklassen**
- **Achterkastell hohl:** Wandring von 0,16 m um den Innenraum (eine Umrisslinie führt außen herum und an der Tür nach innen), Sturz über der Tür. Mindesthöhe 2,55 m (die kleinen Schiffe hatten 1,7 m; darunter ist die Kajüte für eine 1,75 m große Figur). Die goldene Zierleiste ist jetzt ein Ring um die Wand statt einer vollen Platte (die wirkte sonst wie eine Decke). Die Tür steht offen: ein Flügel schwingt nach außen.
- **Betreten:** Durch die Tür in der Vorderwand des Achterkastells (Treppe bleibt der Weg aufs Achterdeck). `DeckGround` kennt drei Zonen: Hauptdeck, Achterdeck, Kajüte. Das Wechseln folgt dem Laufweg (über die Treppe nach oben, durch die Tür hinein, vorn wieder hinaus); die Höhe passt sich an, Möbel und Wände gelten nur in der passenden Zone, die Wand über der Tür nur auf dem Achterdeck (kein Absturz durch die Türlücke).
- **Kamera und Dach:** Steht die Figur in der Kajüte, rückt die Kamera näher und steiler über sie, das „Dach“ (Achterdeck samt Reling, Steuerrad, Kompassrose, Truhen und Laternen) wird als Gruppe ausgeblendet, ein Fülllicht geht an (nur Spielerschiff). Beim Verlassen ist alles wieder da; nach Sprüngen oder Landgang stellt `seaWorld` das Dach selbst wieder her.
- **Einrichtung (Blender, `tools/blender/build_kajuete.py`, `public/models/ships/kajuete_*.glb`):** Schreibtisch mit Schubladen, Tintenfass, Feder, Kerze und Kartenrolle; Kapitänsstuhl; Koje mit Decke und Kissen; Kartentisch mit Seekarte, Kompass, Zirkel und Kerze; Bücherregal mit vielen Büchern; Truhe mit Messingbändern; Globus; Hängelampe; Teppich. Auswahl und Größe richten sich nach der Raumlänge (3,6 m bei der Schaluppe bis 16 m beim Leviathan): kleine Räume bekommen Schreibtisch, Stuhl, Koje, Truhe und Teppich, größere Regal, Kartentisch mit Stühlen, Globus, zweite Koje, ab 10 m eine zweite Tafel und eine Truhenreihe, ab 12,5 m weitere Regale. Möbel sind feste Hindernisse (nur in der Kajüte).
- **Technik:** Alle Möbel werden mit ihren Rollenfarben und der Ambient-Occlusion zu einem Netz zusammengefasst (ein Zeichenaufruf, keine Kontur, kein Schatten). Heckfenster von innen (`CABIN_WINDOW`, Himmelslicht am Tag, nachts dunkel), die Hängelampe leuchtet (Lichthof, bei Nacht auch von außen durch die offene Tür sichtbar).

**Geprüft (Playwright):** Kajüte von Schaluppe, Fregatte, Galeone (auch bei Nacht) und Leviathan in der Spielkamera, Außenansicht der Fregatte und Galeone, Laufweg per Skript durch alle Zonen (Start am Steuerrad, Tür hinein, Heckwand und Seitenwand, hinaus, Treppe hinauf, Türkante oben). `tsc`, 72 Tests, Produktionsbau; Konsole ohne Fehler und Warnungen.

**Kosten und Grenzen:** Die Einrichtung kostet je Schiff einen Zeichenaufruf und 3 400 (Schaluppe) bis 14 000 Dreiecke (Leviathan); sie wird auch für Feindschiffe gebaut, weil man sie entern und betreten kann. Das ist nicht gemessen im Gefecht mit vielen Schiffen. Echte Handys und die einzelnen Grafikstufen sind nicht geprüft. Nicht gebaut: weitere Räume (Mannschaftsdeck, Laderaum), ein Neubau der Rümpfe oder Segel, neue Schiffsformen nach historischen Vorbildern. Die Takelage hatte schon Mastkorb, Wanten mit Webeleinen, Bugspriet, Stage und Nagelbänke, dort habe ich nichts ergänzt.

## 2.9.66 – Licht und Feuer: Flammen, Lichtschein, Bodenlicht (13.11.2026)

Alle Lichtquellen der Welt laufen jetzt über ein gemeinsames System (`render/glow.ts`). Vorher waren Lagerfeuer eine starre orange Kegelfigur, Laternen nur leuchtende Kugeln ohne Schein.

**Neues Licht-System (`GlowSystem`, Anmeldestelle `glowHub`)**
- **Flamme:** eine Zunge aus Rauschen mit Kern, Rand und flackernder Spitze (senkrecht, dreht sich nur zur Kamera). Lagerfeuer und Leuchtfeuer haben je nach Entfernung vier, zwei oder eine Zunge mit eigener Phase, Fackeln zwei.
- **Lichthof:** weicher orangefarbener Schein um Lampen, Fackeln und Feuer, wächst mit der Entfernung (aus der Ferne bleibt eine Lampe als Lichtpunkt), tagsüber kaum sichtbar, geht mit der Dämmerung an. Im Regen etwas matter.
- **Bodenlicht:** warmer, leicht unruhiger Lichtfleck auf dem Boden unter Lampen und Feuern (Steg, Wege, Sand), nur nah und nur in Dämmerung und Nacht.
- Drei Instanz-Netze mit je einem Zeichenaufruf (150 Flammen, 220 Höfe, 90 Bodenlichter), die Nächsten gewinnen (alle 20 Bilder neu sortiert), keine Zuweisungen je Bild.
- **Echte Lichter:** Feuer und Wandfackeln gehen als feste Träger in den `LampPool`; die nächsten bekommen ein echtes Punktlicht (28 m Reichweite, kräftiger als Laternen, brennen auch am Tag ein wenig, stärkeres Flackern).

**Angeschlossene Lichtquellen:** Lagerfeuer der Inseln und Siedlungen, Leuchtfeuer am Steinturm, Wandfackeln an der Taverne, Laternenpfähle, Tür- und Wegelaternen der Häuser, Steg-Laterne, Laternen der Hafenstadt, Leuchtturm, Hafen-Außenposten, Bojen (rot und grün), Schiffslaternen (bewegen sich mit dem Schiff, werden mit dem Schiff abgemeldet) und die Laternen an den Hüften der Figuren.

**Neue Modelle (`public/models/light/`, `tools/blender/build_light.py`):** `feuerstelle` (Steinring mit abgeschrägten Kanten, gekreuzte Scheite mit verkohlten Enden, Aschebett und leuchtende Glut), `feuerkorb` (Dreibein mit Eisenschale und Stäben), `fackel`, `laternenpfahl` (geschwungener Arm mit Hängelaterne). Die Glut leuchtet selbst, die Flamme darüber kommt aus dem GlowSystem.

**Technik:** Bauten melden Lichter über `Built.glows`, Inseln und Siedlungen reichen sie als `GlowPlaced` an die Welt (`seaWorld.addGlows`). `GlowEmitter` kann an ein Objekt gebunden sein (Schiff, Figur, Boje) und folgt ihm. Die Gruppe wird nur gezeichnet, wenn das Objekt samt Eltern sichtbar ist. Qualität: Stufe Low zeichnet keinen Schein (wie die echten Lichter). `scripts/compress-gear.mjs` komprimiert jetzt auch `light`.

**Geprüft (Playwright, Dorf Weidenbrück, Schiff, Lagerfeuer):** Abendrot (Lampen gehen an, Steg bekommt sein Bodenlicht), Nacht (Lichthöfe in der Siedlung, Wachturm-Feuer in der Ferne sichtbar), Morgenrot (Lampen aus), Lagerfeuer aus der Nähe (mehrere Flammenzungen, Lichtfleck auf dem Sand), Schiff bei Nacht. `tsc`, 72 Tests, Produktionsbau; Konsole ohne Fehler. Der Mehraufwand ist die Arbeit von drei Zeichenaufrufen und einer Schleife über die Lichter in Reichweite. Gemessen wurde die Bildzeit nicht eigens.

**Noch offen aus dem Auftrag:** Die Palette der Tageszeiten (Morgenrot, Tag, Abendrot, Nacht) habe ich nach den Bildern nicht verändert, sie wirkte stimmig. Die Fensterleuchten der Häuser und Schiffe sind noch flache leuchtende Flächen ohne eigenen Schein. Die Laterne an den Hüften der Figuren hat jetzt einen Lichthof, ihr Modell ist unverändert. Lichtreflexe der Lampen im Wasser fehlen. Handy und Grafikstufen nicht geprüft. Die Schiffe (neue Modelle, Kapitänskajüte) und die Inselvegetation folgen als eigene Pakete.

## 2.9.65 – Welt-Grafik: Flora, Klippen, Bauten und Schiffsdetails aus Blender (13.11.2026)

Weiter auf dem Weg zu 3.0. Ozean-Shader, Schiffsrümpfe und Segel blieben unangetastet. Neue Modelle entstehen per Skript in Blender (headless), laufen komprimiert (Draco) und jedes trägt Ambient-Occlusion je Eckpunkt (Farbattribut `COLOR_0`) sowie UV-Inseln ohne Überlappung.

**Neue Dateien**
- `public/models/env/` (`tools/blender/build_env.py`): Kokospalmen `palme_1..4` (gebogener Stamm mit Ringnarben, 15 Wedel mit Fiederblättern, Kokosnüsse), Laubbäume `laubbaum_1..3` (Äste, mehrschichtige Blattcluster mit gezackten Spitzen), Büsche `busch_1..2`, Farne `farn_1..2`, Treibholz `treibholz_1..3`, Felsen `fels_1..3` (Einzelblock, Dreiergruppe, geschichtete Küstenklippe) und große Klippenformationen `klippe_1..2`. Felsen haben abgeschrägte Kanten (Bevel) und flache Facetten; Kronen sind im Kern dunkel und an den Spitzen hell.
- `public/models/architecture/` (`build_arch.py`): `haus_huette`, `haus_stein`, `haus_taverne` (Fachwerk mit Streben, überstehende Schindeldächer aus überlappenden Reihen, Sparrenköpfe, Ortgangbretter, Fensterläden, Türen mit Beschlägen, Schornsteine, Taverne mit Balkenköpfen unter dem Überstand und Schildausleger), `steg_modul` (4,5-m-Modul: einzelne Bohlen mit Fugen, Längsträger, Pfähle mit umwickelten Tauen, Klampen) und `bogen` (Torbogen aus abgeschrägten Quadern, eingestürzte Steine).
- `public/models/ships/` (`build_ships.py`): geschnitzte Drachen-Galionsfigur `galionsfigur_drache` (Hals, Kiefer mit Zähnen, Hörner, Flossenohren, Rückenkamm) und ein detaillierteres Steuerrad `steuerrad` (zehn gedrechselte Speichen mit Griffen, Messingbänder und -hülsen, Nabe). Das Steuerrad ersetzt das aus 2.9.63 (`world/steuerrad.glb` entfällt). Rümpfe und Segel unverändert.
- Gemeinsame Bausteine in `tools/blender/proplib.py` (Röhren entlang Kurven, doppelseitige Blätter, Klumpen, abgeschrägte Felsen, AO-Export); `build_worldprops.py` nutzt sie ebenfalls.

**Einbindung**
- **Flora und Felsen:** `floraProto` (`world/vegetation.ts`) baut Palme, Laubbaum, Busch, Farn, Fels, Treibholz und Klippe aus den Modellen, in den Biome-Farben (`PAL`). Sie laufen durch dieselbe `InstancedMesh`-Pipeline wie bisher, mit Wind (`windify`), Borke-Bump am Stamm, Laub-Durchleuchtung und Moos auf Felsen; die Ambient-Occlusion der Datei geht in die Eckpunktfarben. Kollisionsradien und Belegung sind unverändert. Neu in den Daten: Flora-Arten `treibholz` und `klippe`. Die Insel-Bausteine (`islandDress.ts`) nutzen die Modelle für Büsche, Felsen (große Brocken im Wasser als Klippenformation) und Treibholz am Strand.
- **Bauten:** `holzhuette`, `steinhaus`, `gasthaus`, `ruinenbogen` und `steg` (`world/architecture.ts`) bauen aus den Modellen; Fenster mit Nachtleuchten, Bank, Kollisionsflächen und Rauchpunkte bleiben im Code. Das Zusammenfassen der Siedlungen (`mergeByMaterial`) behält jetzt die Eckpunktfarben von Materialien mit `vertexColors`. Die alten Funktionen bleiben als Ausweichform, falls eine Datei fehlt.
- **Schiffe:** Die Drachen-Galionsfigur und das Hero-Steuerrad sitzen an den bestehenden Schiffen (`shipBuilder.ts`), ohne Rumpf oder Segel zu ändern. Die Adler-Figur der Marine und die übrigen Figuren bleiben Eigenbau.
- **Shader:** Der Bewuchs-Shader (`patchVeg`) bekam für Felsen eine Spritzzone an der Wasserlinie: nasser, dunklerer Stein und ein Himmelsglanz im flachen Blickwinkel (Fresnel); Programmschlüssel `veg3`. Wind, Randlicht und Regennässe liefen schon über die gemeinsame Toon-Pipeline. ACES und Nachbearbeitung blieben unverändert.
- **Werkzeug:** `scripts/compress-gear.mjs` komprimiert jetzt alle fünf Modellordner (2,5 MB auf 0,7 MB). Lader: `world/envModels.ts` (Flora, Bauten), `world/worldProps.ts` (Schiffs-Props); beide laufen über den zentralen Preloader.

**Geprüft:** `tsc`, 72 Tests, Produktionsbau; Konsole ohne Fehler und Warnungen. Im Spiel (Playwright, Mittag) angesehen: Palmen, Laubbäume, Büsche, Felsen, das Dorf Weidenbrück mit Steg, Taverne, Steinhaus und Hütten, Küstenfelsen, Galionsfigur. `renderer.info` je Bild mit den Modellen gegen die alten Formen (Mittelwert über 3 s je Ort): Dorf 384 gegen 384 Aufrufe, Ankerglück 1264 gegen 1287, Palmeninsel 340 gegen 340; Dreiecke gleich hoch (Ankerglück 1,76 Mio. gegen 1,79 Mio.).

**Nicht umgesetzt / nicht geprüft:** Birke und Windkiefer sowie die nicht-tropischen Bäume der Insel-Bausteine (`plant(kit)`) bleiben Eigenbau; Ankerglück selbst (`town.ts`) hat eigene Häuser, die nicht ersetzt wurden; Steg-Ende, Stelzenhütte, Scheune, Türme und Ruinenmauern bleiben Eigenbau; die Adler-Galionsfigur ist nicht ersetzt. Die Galionsfigur wurde nur als Modell und im Spiel von hinten geprüft, die Drachen-Ansicht von vorn steht aus. Echtes Handy und die Grafikstufen einzeln sind nicht geprüft; ob Instanz-Pools mit den dichteren Palmen (2000 statt etwa 300 Dreiecke) auf schwachen Handys genug Luft lassen, ist nicht gemessen.

## 2.9.64 – Zwischenstand vor Sturmkrone 3.0: Figuren, Ausrüstung und Schiffe (13.11.2026)

Der Figuren- und Ausrüstungsumbau seit 2.9.57 ist abgeschlossen; Sturmkrone 3.0 selbst folgt nach der Welt-Grafik. Die einzelnen Schritte stehen mit allen Zahlen darunter (2.9.58 bis 2.9.63); hier das Wichtigste auf einen Blick.

**Figuren ohne Durchstiche**
- **Dreiecks-Maskierung (`BodyMaskingEngine`):** Was Kleidung vollständig verdeckt (Haut unter Stoff, Hemd unter Mantel, Schuh unter Stiefelschaft), wird gar nicht erst gezeichnet. Jede Figur bekommt eine eigene Dreiecksliste, ein Material und ein Zeichenaufruf bleiben, Treffer-Leuchten, Auflösen und Schatten laufen unverändert. Auch Hafen-NPCs, Gegner, Verbündete und Schiffscrew nutzen sie, weil alle über dieselbe `Character`-Klasse laufen.
- **Sichtbarkeits-Hülle:** Eine Hüllkugel je Figur folgt der Hüfte, damit Haare, Gesicht und Kleidung am Bildrand nicht mehr verschwinden.
- **Ebenen und Zugehörigkeit:** Mäntel und Schärpen kennen das Oberteil darunter (`GarmentCtx`), Säume sind gerade geschnitten, der Abstand der Schichten verhindert Flackern.

**Ausrüstung mit Plätzen (Sockets)**
- Sieben Sockets (Kopf, Brust, Beine, Füße, Hände, Haupthand, Nebenhand) und Ausrüstung als Daten (`data/equipment.ts`); `loadoutFromLook` übersetzt das bisherige Aussehen, Spielstand-Version 11 migrierte alte Stände.
- Inventar mit allen Plätzen: ausgerüstete Stücke mit Namen, anlegen und ablegen per Klick; das Modell der Figur aktualisiert sich sofort, alte Netze werden freigegeben (Speicherprobe über 130 Runden unverändert).
- Rüstungssets mit Oberflächen, Borten und Mustern, Umhänge, Helme und der neue Editor.

**Echte Modelle aus Blender (alle per Skript, headless)**
- Ausrüstung: Stulpenstiefel, Riemen-Sandalen, Stoffhose (zwei Fassungen), Kapitäns-Gehrock, Dreispitz, mehrlagige Frisur mit senkrechten UVs für den Haar-Shader, Entermesser und Parierdolch. Die Modelle wurden in einem Straffungsdurchgang schlanker gemacht und an die weibliche Grundfigur angepasst.
- Welt: Kanone auf Holzlafette, Steuerrad, Admiralitätsanker, Hängelaterne, Fass und Kiste. Auf allen Schiffen als `InstancedMesh`, in den Häfen als Einzelnetze; neu sind Deckkanonen ab der Korvette.
- Arbeitsweise: `blender --background --python tools/blender/headless.py -- build_<name>.py`, kein offenes Blender-Fenster nötig (Skill `blender-3d-assets`, CLAUDE.md).

**Technik und Leistung**
- Alle Modelle laden über den zentralen Preloader (`core/preload.ts`) und zählen im Ladebalken mit; Ausrüstungs- und Welt-Modelle laden jetzt gleichzeitig statt nacheinander. Das Warm-up (`core/warmup.ts`) zieht Figuren in allen Sets samt Frisur, jede Schiffsklasse und alle Effekte vorab auf die Grafikkarte.
- Messung nach dem Start (Entwicklungsserver): beim Anlegen neuer Sets und beim Schiffswechsel wird **kein neues Shader-Programm** übersetzt (Programmzahl 249 bis 251 unverändert). Neue Ausrüstungskombinationen bauen sich in 1 bis 42 ms.
- Leuchtflächen der Schiffe (Fenster, Laternenflamme, Glas) sind jetzt ein geteiltes Material für alle Schiffe statt je Schiff ein eigenes; die Laternen sind tagsüber gedämpft.
- Speicher: `disposeObject` gibt bei `InstancedMesh` die Instanzmatrizen frei.
- Gebaut und geprüft: `tsc` ohne Fehler, 72 Tests, Produktionsbau (Hauptpaket 1,93 MB, 590 KB gepackt; die Warnung zur Paketgröße gab es schon vorher).

**Bekannt und offen**
- **Ruckler beim Schiffswechsel:** Das erste Bild nach einem Schiffswechsel braucht im Entwicklungsserver dieses Rechners (Software-Grafik) 350 bis 640 ms, danach 10 bis 20 ms. Es tritt mit und ohne die neuen Welt-Modelle gleich auf, also nicht durch den Umbau. Gemessen wurde ein einzelnes Shader-Programm (`basic`), das beim Abbau des alten Schiffs freigegeben und neu übersetzt wird; die Ursache ist nicht abschließend geklärt (das Teilen der Leuchtflächen allein hat es nicht behoben). Auf echter Grafikhardware dürfte es kleiner ausfallen, ist aber nicht gemessen.
- Echtes Handy und Bildrate im laufenden Spiel auf allen Grafikstufen stehen noch aus; Flackern im Bewegtbild bei großem Kameraabstand wurde nur auf Standbildern geprüft.
- An Ellbogen und Schulter blitzen bei bestimmten Posen noch kleine Hautflecken durch den Ärmel; das Hemd der Grundfigur sticht bei etwa 20 bis 30 % der Posen leicht durch die Hose.
- Die Flunken des Ankers sind schlicht gehalten. Spielstände von 2.x bleiben lesbar (Migration auf Version 11).

## 2.9.63 – Hero-Props aus Blender für Schiffe und Häfen (13.11.2026)

Sechs neue Modelle, per Skript in Blender gebaut (`tools/blender/build_worldprops.py`, headless) und nach `public/models/world/` exportiert, jedes mit sauberen UV-Inseln ohne Überlappung. Materialname = Rolle, das Spiel setzt seine Toon-Materialien ein:

- **Kanone auf Holzlafette** (Bronzerohr mit Eisenbändern, Traubenknopf, Schildzapfen, Wangen, Räder, Keil), **Steuerrad** (Felge, Innenring, acht Speichen mit gedrehten Griffen, Messingnabe), **Admiralitätsanker**, **Hängelaterne** (Dach, Streben, Boden, Ring), **Fass** (Bauch, Eisenreifen, Spundloch, eingelassener Deckel) und **Kiste** (Bretter, Eisenecken, Deckelleisten, Schloss).
- **Schiffe (alle Klassen):** Kanonen an den Stückpforten, Laternen, Fässer, Kisten und der Anker stehen als `InstancedMesh` je Modell und Rolle (`world/worldProps.ts`, `PropBatch`). Das Steuerrad bleibt ein eigenes Netz, weil es sich dreht. Neu ab der Korvette: Deckkanonen an den Bordwänden (nur wo `canAdd` den Weg frei lässt).
- **Häfen:** Fässer, Kisten und Laternen an Stegen und Kai (`architecture.ts`, `town.ts`) nutzen dieselben Modelle als Einzelnetze, weil der Aufbau der Dörfer sie ohnehin je Material zusammenfasst (ein Zeichenaufruf je Material). Ohne Textur: die gepackten UV-Inseln taugen nicht für die Kachel-Texturen.
- **Ausweichform:** Fehlt eine Datei, bauen die alten Eigenbau-Formen das Teil wie bisher.
- **Speicher:** `disposeObject` ruft bei `InstancedMesh` jetzt `dispose()` auf, damit die Instanzmatrizen aus dem Grafikspeicher verschwinden. Die Geometrien sind geteilt (`markShared`).
- **Kleine Teile ohne Kontur und Schatten:** Eisenbänder, Messing und Laternen haben weder Kontur noch Schattenwurf (sie kosteten je Kaskade einen Zeichenaufruf), nur Rohre, Fässer und Kisten werfen Schatten.
- **Look-Dev:** Laternenflammen sind tagsüber auf 28 % gedämpft (vorher brannten sie in der Mittagssonne weiß aus und blühten im Bloom), nachts voll. ACES, Bloom-Schwelle, GTAO und Roughness blieben unverändert: auf den Bildern war nichts flach oder überstrahlt.

**Geprüft (Playwright auf `http://localhost:5174/`, Galeone, Mittag und Nacht):** Konsole ohne Fehler und Warnungen (die einzige Meldung kam von einer falschen Adresse in meinem Prüfskript); `renderer.info` je Bild, Mittelwert über rund 250 Bilder, mit Props gegen die alten Eigenbau-Formen:

| Schiff | Zeichenaufrufe | Dreiecke |
|---|---|---|
| Galeone | 991 gegen 966 (+2,6 %) | 1,24 Mio. gegen 1,17 Mio. (+5,7 %) |
| Schaluppe | 1047 gegen 1018 (+2,8 %) | 1,26 Mio. gegen 1,22 Mio. (+3,3 %) |
| Leviathan | 775 gegen 757 (+2,4 %) | 1,01 Mio. gegen 0,98 Mio. (+2,7 %) |

Die Bildrate liegt im Messrauschen dieses Rechners (zum Beispiel Galeone 70 gegen 74 fps); eine ruhige Gegenmessung steht aus. Zusätzlich gesichtet: Nahaufnahme der Figur im Kapitänsset (Gehrock, Dreispitz, Stulpenstiefel, Entermesser, Dolch), Ausweichrolle am Bildrand (nichts verschwindet), Kamera 90 m über dem Deck (kein Flackern auf dem Standbild), steile Mittagssonne gegen Nacht mit Laternen.

**Nicht geprüft:** echtes Handy, die einzelnen Grafikstufen, Flackern im Bewegtbild bei 90 m (nur Standbilder), die Häfen der anderen Regionen. Die Flunken des Ankers sind schlicht gehalten.

## 2.9.62 (Nachtrag 4) – Prüfung: Phase 2 bis 5 stehen schon (13.11.2026)

Auf Anfrage, Phase 2 bis 5 umzusetzen, wurde der Code gegen die drei Vorgaben geprüft. Nachgebaut wurde nichts, es gab nichts zu ersetzen:

- **Dreiecks-Maskierung:** `bodyMask.ts` gibt jedem Netz eine eigene Dreiecksliste ohne verdeckte Dreiecke (Haut unter Stoff, Hemd unter Mantel, Schuh unter Stiefel). Weder `material.visible` noch `geometry.groups` kommen vor, ein Material und ein Zeichenaufruf bleiben, Treffer-Leuchten und Auflösen laufen unverändert.
- **Sockets und Migration:** Die sieben Plätze (Kopf, Brust, Beine, Füße, Hände, Haupt- und Nebenhand) liegen in `sockets.ts` und `data/equipment.ts`; `loadoutFromLook` übersetzt das bestehende Aussehen, Spielstand-Version 11 migriert alte Stände (`migrations.ts`).
- **Hüllkugel:** Die Punktdaten bleiben bei der Maskierung unverändert, nur die Dreiecksliste wechselt. Deshalb muss keine Kugel neu gerechnet werden; die Figur nutzt ihre eigene Kugel an der Hüfte (`fitCull`), die geladenen Netze rechnen sie beim Bauen.

## 2.9.62 (Nachtrag 3) – Schlanker statt klobig (13.11.2026)

Rückmeldung: Vieles wirkte klobig. Die Modelle sind jetzt deutlich schlanker, nach Bildern aus mehreren Winkeln und beim Gehen geprüft:

- **Stiefel:** Schaft 7 statt 12 mm über der Haut, Umschlag halb so breit und nur noch aus Leder (vorher goldene Wülste), dünnere Sohle, schmalere Riemen.
- **Hose:** 7 bis 15 statt 16 bis 30 mm Weite, Bauschung halbiert, Falten leiser.
- **Gehrock:** Schoß weitet sich um 9 statt 17 cm, Rumpf und Ärmel liegen enger, Stulpen und Kragen kleiner, Schulterklappen kleiner.
- **Lendenschurz (Hüftplatten, alle Sets):** liegt enger und weitet sich nur noch um 2,8 statt 5,5 cm; er sah an der Hüfte wie eine Windel aus.
- **Behoben beim Straffen:** Haut und Weste stachen durch die dünneren Ärmel und die Brust. Ursache: Die Querschnitte der Arme waren bei dünn besetzten Stellen zu klein (jetzt wie beim Rumpf geglättet), und der Gehrock hatte eine Maske für die Hülle „Mantel“, die Löcher in Weste und Haut schnitt (entfernt). Statt der Hemd-Hülle trägt der Gehrock eine Innenweste im Modell selbst; so gibt es keine losen Schichten mehr darunter.
- **Offen:** an Ellbogen und Schulter blitzen bei bestimmten Posen noch kleine Hautflecken durch den Ärmel.

## 2.9.62 (Nachtrag 2) – Fehlerbereinigung nach den Blender-Modellen (13.11.2026)

Gefundene Unstimmigkeiten und ihre Behebung:

- **Modelle passten nicht auf die weibliche Grundfigur** (sie ist etwa 10 % kleiner, mit schmalen Schultern und kürzeren Armen): Sie schwebten oder klafften. Jetzt werden alle Modelle beim Laden an die Grundfigur angepasst (`glbGear.ts`, `mapper`/`adapt`): Höhen stückweise von Knöchel, Knie, Hüfte, Hals und Kopf, Breiten nach Höhe, Armlänge; Kopf und Hut behalten ihre Größe. Für die männliche Figur bleibt alles unverändert. Bei der weiblichen Figur gesichtet (Kapitänsset, Strandläufer).
- **Haare ragten durch Mantel und Hemd** (33 bis 45 % der Posen, bis 25 mm): Die Nackenlocken hingen bis auf die Schultern. Sie enden jetzt über dem Kragen (0,15 und 0,10 m statt 0,27 und 0,20 m), die Seitenlocken sind kürzer. Das Prüfwerkzeug zeigt dort jetzt keine nennenswerten Werte mehr.
- **Haare unter dem Dreispitz:** Das Haar der Frisur ragte durch die Hutkuppel. Die Dreiecke über dem Hutrand werden jetzt weggelassen (eigene Dreiecksliste, wird mit der Figur freigegeben).
- **Gehrock:** Der Schnitt auf Schulterhöhe nahm die Arme der T-Pose mit und bildete einen Wulst um den Hals. Der Rumpf-Schnitt ist dort jetzt auf den Rumpf begrenzt, die Schulterpartie liegt enger an, die Ärmel sind schlanker (0,014 statt 0,022 m).
- **Stoffhose:** Am Bund war sie weiter als das Hemd (das Hemd stach durch). Sie liegt dort jetzt enger. In den Stiefeln steckt die schmale Fassung `stoffhose_stiefel`, über den Sandalen die gebauschte `stoffhose`.
- **Prüfwerkzeug trennt jetzt Entwurf von Durchstich:** Liegt die äußere Schicht schon in Ruhe innen (Hose im Stiefel, Hemd unter dem Mantel), zählt das als Entwurfsmaß (`design`), nicht als Durchstich durch Bewegung. Vorher meldete es bei Hose gegen Stiefel und Gehrock 40 bis 80 % Durchstich, jetzt 3 bis 8 % mit höchstens 16 mm. Es kennt außerdem die Prüf-Figuren der weiblichen Grundfigur (`gear-kapitaen-w`, `gear-strand-w`).
- **Waffen-Teile erklären sich selbst:** Haupt- und Nebenhand-Stücke nennen im Namen der Beschreibung, dass sie den Säbel ersetzen bzw. nur mit Säbel in der Linken wirken (beim Faustkämpfer, Faji-Wirker und den anderen Klingenformen bleibt die Waffe des Kampfstils).
- **Schnittfunktion der Werkzeuge:** `section(…, legacy=True)` hält den geprüften Zuschnitt der Stiefel fest; `loft`/`loft2` bekommen sonst die glättere Fassung.

**Messung nach den Korrekturen (34 Figuren, je 75 Posen):** 26 Prüf-Figuren der Grundfigur 4,3 Durchstiche je Figur und Pose (mit der neuen, strengeren Zählung ohne Entwurfsmaße; der alte Wert 19,9 ist damit nicht vergleichbar), kein Netz außerhalb seiner Hüllkugel, auch nicht bei den Ausrüstungs-Figuren. Weibliche Figur im Kapitänsset: Hemd gegen Gehrock 7 % mit bis zu 24 mm (die Brust der weiblichen Figur ist tiefer als die abgebildete männliche), Hemd gegen Hose 6 %.

**Noch offen:** Das Hemd der Grundfigur (locker, über der Hose getragen) sticht an der Hose bei etwa 20 bis 30 % der Posen mit 12 bis 15 mm leicht durch (wenige Punkte). Sandalensohle gegen Haut: 6 % mit 8 mm.

- **Modelle ohne Oberfläche bauen:** `tools/blender/headless.py` führt die Modell-Skripte mit `blender --background --python … -- build_<name>.py` aus (lädt Körper und Helfer selbst). Der Skill `blender-3d-assets` nennt das jetzt als Standardweg; die offene MCP-Verbindung ist nur noch Ausnahme für Sichtprüfungen. Getestet mit den Stiefeln: gleiche Fläche wie vorher (5 496), im Spiel unverändert. Dabei aufgefallen: ein späterer Umbau der Schnittfunktion hatte die Stiefel verändert; `section(…, legacy=True)` hält den geprüften Zuschnitt fest.
- **Phase 0 und 1 aus `docs/CHARACTER_SYSTEM_3.0.md` waren schon umgesetzt** (2.9.58 bis 2.9.60), es gab nichts nachzubauen: Prüfwerkzeug `__audit` (Messen von Durchstichen, Schichtabständen und Hüllkugeln ohne Zeichnen), Sichtbarkeits-Hülle (`Character.fitCull`/`syncCull`: eine Kugel je Figur, die der Hüfte folgt, damit Haare, Gesicht und Kleidung am Bildrand nicht verschwinden), Gewichte nach dem Glätten neu holen, fester Zeichenreihenfolge der Gesichtsteile, Freiraum ohne Deckel. Nachgemessen nach 2.9.61 mit den 26 Prüf-Figuren: Durchstich unverändert bei etwa 20 Punkten je Figur und Pose. 
- **Prüfwerkzeug kennt jetzt die Blender-Modelle:** `Character.auditLayers()` liefert je Modell und Rolle eine Schicht (`glb:<modell>/<rolle>`, Ebene aus der Maske oder: Hose 3, Hut und Frisur 9, sonst 2); `testLooks()` enthält sechs Ausrüstungs-Figuren (`gear-…`, Index ab 26: `await __audit.run(26)`). Erste Messung: Keine Netze außerhalb ihrer Hüllkugel. Die Paarwerte der Modelle sind aber **mit Vorsicht zu lesen**: Hose gegen Stiefel und Gehrock zeigt 40 bis 80 % Durchstich bei der Höchsttiefe von 25 mm, obwohl die Bilder (Stand, Seite, Gehen) sauber aussehen. Das Werkzeug vergleicht Punkt gegen Punkt; die Modelle haben doppelte Schalen (Verdickung) und grob verteilte Punkte, was bei den Hüllen der Grundfigur nicht vorkommt. Offene Punkte: Dreispitz gegen Haut (14 bis 40 %, 11 bis 14 mm) und Frisur gegen Hemd. Das Werkzeug müsste für Modelle die Dreiecke statt der Punkte vergleichen.
- **Hose in Stiefeln:** Die Hose gibt es jetzt in zwei Fassungen: `stoffhose` (gebauscht, für Sandalen) und `stoffhose_stiefel` (steckt schmal im Schaft, Kapitänsset). Beide kommen aus `build_hose.py`; Hosen liegen im Prüfwerkzeug über dem Hemd.

## 2.9.62 – Echte Modelle aus Blender: Stiefel, Sandalen, Hose, Gehrock, Dreispitz, Frisur, Entermesser, Dolch (13.11.2026)

Acht Ausrüstungsteile sind keine Code-Formen mehr, sondern in Blender modellierte `.glb`-Dateien (`public/models/gear/`, zusammen 298 KB mit Draco). Sie passen sich dem Körper der Grundfigur an und biegen sich beim Gehen mit.

- **Piraten-Stulpenstiefel:** hoher Schaft, umgeschlagene Stulpe, zwei Riemen mit Schnalle, Ledersohle.
- **Riemen-Sandalen:** offene Sohle, drei Spannriemen, Knöchelband mit Schnalle, nackte Waden und Füße in der Hautfarbe der Figur (die aufgemalten Socken der Grundfigur sind verdeckt).
- **Stoffhose mit Faltenwurf:** weite Beine, am Knie gebauscht, in die Stiefel gesteckt, Bund mit Gürtelschlaufen.
- **Kapitäns-Gehrock:** langer Schoß mit Rückenschlitz, offene Front mit Revers und Knöpfen, Ärmel mit Aufschlägen, Stehkragen, goldene Schulterklappen mit Fransen.
- **Dreispitz:** Filzkuppel mit Hutband, dreifach hochgeschlagene Krempe mit Goldborte, Kokarde und Federn.
- **Mehrlagige Anime-Frisur:** Kopfhaube, zwei Lagen Nackenlocken, Seitenlocken, Pony aus spitzen Strähnen, Scheitelzipfel. Alle Texturkoordinaten laufen senkrecht (Wurzel → Spitze), der anisotrope Haar-Shader zeichnet sein Lichtband darauf. Im Editor unter „Haare“ wählbar („Mehrlagig“).
- **Verziertes Entermesser** mit gebogenem Handschutz und **Parierdolch** mit Glockenhandschutz. Sie ersetzen den Säbel des Schwertkämpfers und füllen seine freie linke Hand.
- **Zwei neue Sets:** *Piratenkapitän* (selten, Stufe 14: Dreispitz, Gehrock, Hose, Stiefel, Entermesser, Parierdolch) und *Strandläufer* (gewöhnlich, Stufe 3: Leinenhose, Sandalen). Zwei neue Plätze: Haupthand und Nebenhand.
- **Behoben (alt):** Beim Wechsel der Waffe in der Hand wurden die alten Geometrien nie freigegeben. Im Editor wuchs der Grafikspeicher mit jeder Änderung (etwa vier Netze je Klick).

**Bekannte Grenzen:** Die Modelle sind an der männlichen Grundfigur gemessen; auf der weiblichen sind sie nicht geprüft. Der Gehrock wirft an Schulter und Achsel noch leichte Falten, die Ärmel wirken etwas aufgebläht. Unter dem Dreispitz ist das neue Haar nicht abgeschnitten.

**Technik (für Entwickler):**
- Werkzeuge in `tools/blender/`: `gearlib.py` (Körperhaut ausschneiden und aufblasen, Ringe um Gliedmaßen `loft`/`loft2`/`loft_x`, Riemen `band_y`, Export), ein `build_*.py` je Modell; Blender mit `scripts/start-blender-mcp.ps1` starten, Modelle mit `node scripts/compress-gear.mjs` verkleinern.
- Materialname im Modell = Rolle (`main`, `trim`, `leather`, `steel`, `gold`, `dark`, `cloth`, `skin`, `hair`); `data/equipment.ts` Teil `glb` ordnet jeder Rolle Oberfläche und Farbe zu, Teil `held` hängt Waffen an die Handhalterung.
- `entities/character/gear/glbGear.ts`: Lader, drei Befestigungsarten: `skinned` (Gewichte von den nächsten Hautpunkten derselben Körperseite, Seite je zusammenhängendem Teil, danach über das Netz geglättet), `bone` (Hut, Frisur) und `foot` (Regel nach Höhe und Zehengelenk, für feine Riemen).
- `Character.hold`: gibt die vorige Waffe frei; Säbel (`userData.swordSkin`) wird durch das Entermesser ersetzt, die Linke durch den Dolch.
- Neue Oberflächen `haut` und `haar` in `gear/kit.ts`.

## 2.9.61 – Figuren-Overhaul: 12 Rüstungssets, Beute-Ausrüstung, neuer Editor (13.11.2026)

Die Figuren sehen jetzt aus wie Helden: echte Rüstungen mit Platten, Kettenhemd, Schuppen, Brokat und Borten, dazu Helme, Schulterpanzer und Umhänge. Der Charakter-Editor ist komplett neu.

- **12 Rüstungssets mit bis zu 7 Teilen** (Kopf, Schultern, Oberkörper, Umhang, Hände, Beine, Füße), 80 Teile insgesamt. Sie wachsen mit dem Spielfortschritt:
  - *Gewöhnlich:* Hafenarbeiter (Segeltuch und Leder), Küstenwache (gesteppter Waffenrock).
  - *Selten:* Kettenjäger (Kettenhemd), Sturmleder (genietetes Leder, Pelz, Hörnerhelm), Marinegarde (Paradeuniform mit Gold).
  - *Episch:* Eisenwall (Plattenpanzer mit Stachelschultern), Seekönig (Brokatmantel, Krone, Schleppe), Schuppenwache (Schuppenpanzer, Kabuto mit Mondzier), Nebelwandler (Kapuze und Nebelmantel).
  - *Legendär:* Drachenpanzer (glühende Hörner), Abgrundwächter (violette Kristalle), Sturmgeborene (weiß-goldene Platten, Sturmkrone mit schwebenden Lichtsplittern).
- **Oberflächen, die man sieht:** Stahl, dunkler Stahl, Gold, Leder, Seide und Stoff glänzen unterschiedlich. Dazu Muster direkt im Material: Plattenlamellen, Kettenglieder, Schuppen, Rautenbrokat, Nieten, Steppnähte, Streifen. An Säumen, Ärmelrändern, Kragen und Mantelöffnungen laufen scharfe Borten, auch mit Zierlinie oder Zickzack.
- **Neue Formen:** Hüftplatten und Lendenschurz, Stehkragen und Halsberge, Umhänge in drei Längen (kurz, lang, Schleppe) hinter dem Rücken, neun Helme (Eisenkappe, Ritterhelm, Hörnerhelm, Flügelhelm, Krone, Kapuze, Kabuto, Drachenhelm, Sturmkrone), acht Schulterpanzer, Gürteltaschen, Ketten und Schwerttasche.
- **Beute:** Besiegte Gegner lassen jetzt Rüstungsteile fallen (ab selten die häufigste Beute). Seltenheit der Lichtsäule = Seltenheit des Teils; Teile von Sets, von denen du schon etwas hast, sind etwas wahrscheinlicher. Doppelte werden zu Gold. Neue Teile legen sich automatisch an, wenn der Platz leer ist oder das Teil seltener ist als das getragene.
- **Setbonus:** Ab drei Teilen eines Sets gibt es einen Bonus, mit allen Teilen einen größeren. Alle Werte (Leben, Schadensminderung, Volltreffer, Angriff, Faji-Erholung, Gold) zählen im Inventar mit.
- **Ausrüster:** Die gewöhnlichen und seltenen Sets kaufst du beim Händler unter „Ausrüster: Rüstungssets“. Epische und legendäre Sets gibt es nur als Beute.
- **Gegner tragen Ausrüstung:** Eliten und Bosse in ganzen Sets, einfache Gegner gelegentlich einzelne Teile – nach Stufe des Gegners. Damit sehen Kämpfe und Inseln deutlich vielfältiger aus.
- **Neuer Charakter-Editor:**
  - Studio-Bühne mit weichem Licht, dunklem Drehteller und Kamera-Voreinstellungen (Gesamt, Kopf, Rüstung, Beine, Rücken), die weich anfahren. Zoom mit Mausrad oder zwei Fingern, Drehen durch Ziehen, abschaltbarer Drehteller.
  - Reiter *Stil, Körper, Gesicht, Haare, Kleidung, Ausrüstung, Rüstkammer*. Körperbau und Frisur als Karten, Bart, Narbe, Augenklappe und Ohrring im Gesicht-Reiter.
  - *Ausrüstung:* sieben Plätze wie bei einer Puppe, Teile als Karten mit Seltenheit, Werten und Set, direkt anlegen; **jedes Teil lässt sich in Haupt- und Zierfarbe färben** (Farbfelder oder eigene Farbe), Setbonus-Anzeige.
  - *Rüstkammer:* alle Sets des Spiels, jedes Teil und jedes ganze Set **anprobieren**, auch Ungefundenes (ändert nichts an deiner Ausrüstung). Die Bühne glimmt in der Farbe der Seltenheit.
  - Die Vorschau zeigt jetzt immer die angelegte Ausrüstung.
- **Spielstände:** Alles bleibt erhalten. Neue Felder (`gear.loot`, `gear.outfit`, `gear.dyes`) werden bei alten Ständen leer angelegt; Rüstungsstufen, Kopfbedeckungen und gekaufte Schienen funktionieren weiter. Beute-Teile auf einem Platz ersetzen die alte Ausrüstung dort, damit nichts doppelt zählt.

**Leistung (30 Figuren, jede in einem ganzen Set, im Editor-Raum):** Hoch 11,1 ms (ohne Ausrüstung etwa 10 ms), Mittel 10,8 ms gegenüber 9,8 ms; Zeichenaufrufe 965 → 1397 (je Figur etwa 14 mehr: je Oberfläche ein Netz plus Zierteile). Das Aufwärmen beim Laden übersetzt die neuen Oberflächen vorab (drei Figuren in ganzen Sets).

**Gesichtet:** alle zwölf Sets von vorn, von der Seite und von hinten, alle neun Helme aus der Nähe, Kamera-Voreinstellungen im Editor, Ausrüstungs-Reiter. **Nicht geprüft:** ein echtes Handy, die Bildrate im laufenden Spiel mit vielen geschmückten Gegnern, lange Spielzeiten.

**Technik (für Entwickler):**
- `render/toon.ts`: Option `trim` (nur mit `surface`) schaltet die Attribute `rimD` (Abstand zum Rand in m), `trimC`, `patC`, `gset` (Muster, Maß, Bortenbreite, Bortenart) ein; `GEAR_FRAG_GLSL` zeichnet Borte und Muster aus `vSkObj` (Körperposition vor dem Skinning). Muster blenden in der Ferne aus (`fwidth`).
- `vroid.ts`: jede Hülle trägt `rimD` (`rimDistance`, Kantenweg über das Netz, höchstens 9 cm); neue Hüllen `kilt` (Ebene 3, Schöße 80 % am Becken) und `kragen`; `VroidBase.cape(len)` baut den Umhang als Gitter hinter dem Rücken (Profil der Haut, nie wieder nach vorn, Hüftwulst, Gewichte Brust → Wirbelsäule → Hüfte, unten halb Oberschenkel).
- `character.ts`: `addShells` teilt die Hüllen nach Oberfläche (`Finish`) in je ein Netz; Position, Gewichte und `rimD` werden geteilt, Farben/Muster sind eigene Attribute je Figur. Die Dreiecksliste der Maske wird bei mehreren Oberflächen je Figur sortiert (`userData.ownIndex`).
- `entities/character/gear/kit.ts` (Formen, `Bag`, `finishMat`, `glowMat`) und `gear/rigid.ts` (`SHOULDERS`, `HELMS`, `buildBeltExtras`). Helme setzen auf eine enge Schädelkuppel (`HEAD_R`, `HELM_RISE`) statt der weiten Frisurkappe und blenden das Haar über dem Rand aus (`hairUnderCap(…, rim)`).
- `data/gear.ts`: `SETS` (Daten), `GEAR_CATALOG` (daraus erzeugte `EquipDef`), `gearForNpc`. `data/equipment.ts`: `ShellLook`, Plätze `GearCat`, Farben `item`/`item2` (aus Palette oder `look.dye`), `replace` ersetzt auf dem Platz.
- `core/gearBag.ts`: `ensureLoot`, `wearLoot`, `lootBonus` (Summe plus Setbonus), `rollLootGear`, `grantLoot`. `LootKind` kennt `gear`; `Game.dropGear`, `buyLoot`, `dyeLoot`.
- `ui/editor.ts` neu, `world/editorStage.ts` mit `preset`, `setAura`, `autoSpin`; im Editor ist die Farbstimmung neutral (`renderer.setMood(0, 0)`).
- `audit.ts`: `__audit.perf(stufe, n, bilder, bild, true)` lässt jede Figur ein ganzes Set tragen. Anprobe im Editor und Bilder: `__audit.shot(name, look, …)` mit `look.extra = ['eisenwall_head', …]`.

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
