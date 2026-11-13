---
name: blender-3d-assets
description: Komplexe 3D-Modelle (Rüstungen, Hüte, Waffen, Schiffs-Props) per Python-Skript im Headless-Modus von Blender bauen und als .glb exportieren.
---

# Blender-Workflow für 3D-Assets (Standard: Headless)

Modelle entstehen als **Python-Skripte** in `tools/blender/`, die Blender ohne Oberfläche ausführt. Das ist wiederholbar, braucht keine offene Blender-Verbindung und hält die Modelle im Repository nachvollziehbar. Die `blender`-MCP-Verbindung (GUI) ist nur eine **Ausnahme** für Sichtprüfungen (`look`) oder wenn der Nutzer ausdrücklich live in Blender arbeiten will.

## Ablauf

1. **Skript schreiben** `tools/blender/build_<name>.py` (Vorlage: `build_boots.py`). Es nutzt die Helfer aus `tools/blender/gearlib.py` (Körperhaut ausschneiden und aufblasen `region`, Ringe um Gliedmaßen `loft`/`loft2`/`loft_x`, Riemen `band_y`, `smooth`, `solid`, `unwrap`, `join`, `export`) und endet mit `export([objekt], GEAR_DIR + r'\<name>.glb')`.
2. **Ausführen (headless):**
   ```
   "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background --python tools/blender/headless.py -- build_<name>.py
   ```
   `headless.py` lädt `gearlib.py` und den Körper der Grundfigur (`public/assets/characters/vroid/base_male.glb`) und führt dann die angegebenen Skripte aus (auch mehrere hintereinander). Ausgabe: `public/models/gear/<name>.glb`. Andere Zielordner (z. B. Schiffs-Props nach `public/models/`) im Skript über einen eigenen Pfad setzen.
3. **Verkleinern:** `node scripts/compress-gear.mjs` (Draco, in place; mehrfaches Ausführen schadet nicht).
4. **Prüfen im Spiel:** `__audit.shot(name, look, yaw, dist, lookY)` mit `look.extra = ['<set>_<platz>']` aus mehreren Winkeln und beim Gehen (`'Walking_A'`). Erst Bilder, dann Zahlen.
5. **Einbinden:** Modellname in `GLB_MODELS` (`entities/character/gear/glbGear.ts`), Teil `glb(...)` oder `held(...)` in `data/gear.ts`, Eintrag im `CHANGELOG.md`.

## Regeln für Modelle

- Maßstab 1 Einheit = 1 m, Z oben (Blender), Vorderseite +Y; Export Y-up. Körperteile in der **Ruhehaltung der Grundfigur** (T-Pose) modellieren; das Spiel überträgt die Skelett-Gewichte beim Laden von den nächsten Hautpunkten (`skinned`), für Hüte und Frisuren genügt ein Knochen (`bone`), feine Riemen am Fuß bekommen Regel-Gewichte (`foot`). Waffen: Griff am Ursprung, Klinge entlang +Z (im Spiel +Y).
- **Materialname = Rolle:** `main`, `trim`, `leather`, `steel`, `gold`, `dark`, `cloth`, `skin`, `hair`. Das Spiel ersetzt jede Rolle durch Oberfläche und Farbe aus `data/gear.ts`. Keine eigenen Texturen nötig.
- **Saubere UV-Maps:** jedes Netz bekommt UV-Inseln ohne Überlappung (`unwrap` = Smart UV Project); Ringflächen (`loft…`) haben zylindrische UVs; Haare: v läuft senkrecht von der Wurzel zur Spitze, jede Strähne in eigener Spalte.
- Sparsam mit Flächen (Handy): Helm ≤ 3 000, Schulterteil ≤ 2 000, Waffe ≤ 4 000, Rock/Mantel ≤ 10 000 Dreiecke. Normalen nach außen, keine losen Teile, Skalierung angewendet.
- Schneiden sich Ringe auf dünn besetzten Hautschnitten, mit `section(..., legacy=False)` (Maximum über Nachbarn, glatter) arbeiten; ein Modell nach Änderung an `gearlib.py` immer neu prüfen.
- Lizenz: selbst gebaut = kein Eintrag; fremde Vorlagen nur mit klarer Lizenz in `CREDITS.md`.

## Ausnahme: Live-Blender über MCP

Nur für Sichtprüfungen: `powershell -File scripts/start-blender-mcp.ps1` (Port 9876, Server öffnet nach etwa 5 Sekunden), Sitzung im Ordner mit `.mcp.json` starten. Nie `bpy.ops.wm.read_factory_settings` aufrufen (beendet das Addon). Ergebnisse trotzdem als Skript in `tools/blender/` festhalten.
