# Was ist neu

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
