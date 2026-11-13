---
name: visual-qa
description: Visuelle Prüfung des laufenden Spiels mit Playwright: WebGL-Konsolenfehler, Clipping, Lichtfehler, Screenshots.
---

# Visual QA mit Playwright

1. **Server:** `npm run dev -- --port 5174 --strictPort` im Hintergrund starten (Projektordner `sturmkrone`), falls `http://localhost:5174/` nicht antwortet.
2. **Öffnen:** Playwright-MCP: `http://localhost:5174/` laden, warten bis der Ladebalken weg ist (Menü „Spielen“ sichtbar).
3. **Konsole prüfen:** alle Meldungen der Stufen error und warning lesen. Suchen nach `THREE.WebGLRenderer`, `shader`, `GL_INVALID`, `NaN`, `Uncaught`. Jeder Fehler wird behoben, nicht ignoriert.
4. **Screenshots:** Editor (neues Spiel → Editor), Figuren mit Ausrüstung (Rüstkammer → Set anprobieren), Spielwelt tagsüber und nachts. Bei Handy zusätzlich Viewport 375 × 812.
5. **Auf Fehler achten:** durchstechende Haut oder Kleidung (Clipping), schwebende Teile, fehlende Teile am Bildrand, Flackern (Z-Fighting), schwarze Flächen, Überstrahlung, abgeschnittene UI.
6. **Bericht:** kurz auflisten, was geprüft wurde, was gefunden und behoben wurde, und was nicht prüfbar war (z. B. echtes Handy).

Hinweis: Das verborgene Browserfenster der Desktop-App liefert teils veraltete Bilder; echte Frames lassen sich in der Seite per `readPixels` holen (siehe `__shot` in `src/main.ts`).
