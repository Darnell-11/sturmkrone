---
name: threejs-architect
description: Regeln für Three.js 0.186 in Sturmkrone (Materialien, Skinning, Instanzen, Speicher). Verwenden bei jeder Änderung an Rendering, Figuren, Effekten oder Welt-Objekten.
---

# Three.js-Architektur (three 0.186.1)

1. **Materialien erweitern, nicht ersetzen.** Eigene Effekte kommen per `onBeforeCompile` an das Toon-Material (`render/toon.ts`, `toon()` mit Optionen), nicht als isolierte `ShaderMaterial`. Sonst fehlen Licht, Nebel, Schatten (CSM), Nässe und Figuren-Oberflächen. Neue Shader-Varianten brauchen einen eigenen `customProgramCacheKey`-Anteil (`progKey`).
2. **Skinning:** Nach jeder Änderung an Lage, Gewichten oder Indizes eines `SkinnedMesh` `geometry.computeBoundingSphere()` aufrufen. Figuren teilen eine Hüllkugel, die der Hüfte folgt (`Character.fitCull`); neue Netze an Figuren dort einhängen.
3. **Wiederholte Objekte** (Bäume, Gras, Felsen, Partikel, Besatzung in Massen) als `InstancedMesh` (`world/vegetation.ts`), nicht als Einzelnetze.
4. **Speicher:** Alles, was ein Objekt besitzt, wird mit `disposeObject()` (`render/dispose.ts`) freigegeben: Geometrien, Materialien, Texturen, Render-Targets. Geteilte Ressourcen mit `markShared()` kennzeichnen; kurzlebige Effekt-Geometrien über `sharedGeo()`. Geometrien, die Attribute mit anderen teilen, löschen diese vor `dispose()` (`releaseShared`, `releaseGarment`).
5. **Keine Allokationen pro Bild:** keine `new Vector3/Matrix4/Quaternion` in Update- oder Render-Schleifen, vorab angelegte Modul-Variablen nutzen.
6. **Shader-Fallen:** `smoothstep` nie mit umgekehrten Rändern, nie `pow(0, x)`, `sqrt` nur mit `max(…, 0.0)`. Ein einziges NaN schwärzt das Bild über Bloom.
7. **Prüfen:** `npx tsc --noEmit`, dann im Browser Konsole ohne WebGL-Fehler, Zeichenaufrufe und `renderer.info.memory` vor/nach Wiederholungen vergleichen.
