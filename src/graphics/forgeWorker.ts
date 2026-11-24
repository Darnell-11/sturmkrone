// Web Worker der PBR-Schmiede (Phase 4.4A): rechnet Sätze im Hintergrund, während der Hauptfaden die Modelle lädt. Die Bytes gehen ohne Kopie zurück
// (übertragbare Puffer). Normalkarten nur für Sätze, die über UV laufen (die übrigen rechnen ihr Relief im Shader aus dem Höhenkanal).
import { FORGE_RECIPES, forgeMaps, type ForgeKind } from './forgeMaps';

interface Job { kinds: ForgeKind[]; size: number }

self.onmessage = (e: MessageEvent<Job>) => {
  const { kinds, size } = e.data;
  for (const kind of kinds) {
    const m = forgeMaps(kind, size);
    const normal = FORGE_RECIPES[kind].uvNormal ? m.normal : null;
    const transfer: ArrayBuffer[] = [m.orm.buffer as ArrayBuffer];
    if (m.albedo) transfer.push(m.albedo.buffer as ArrayBuffer);
    if (normal) transfer.push(normal.buffer as ArrayBuffer);
    (self as unknown as Worker).postMessage({ kind, size, albedo: m.albedo, normal, orm: m.orm }, transfer);
  }
  (self as unknown as Worker).postMessage({ done: true });
};
