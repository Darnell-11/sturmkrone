# Was ist neu

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
