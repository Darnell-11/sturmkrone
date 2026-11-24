// PBR-Material- und Texturschmiede (Phase 4.4A): erzeugt beim Start EINMAL alle hochauflösenden Oberflächen-Sätze der Welt – Schiffsholz in drei
// Güten, gehämmerter Kanonenstahl, gebürstetes Messing und Stahl, Segeltuch-Gewebe, Kalkstein, Basalt, Obsidian, Sand, Waldboden/Asche,
// Mauerquader, Dachziegel, Fachwerkbalken, Hafenholz, Stoff, Leder und Griffwicklung – aus kachelbaren Höhenfeldern:
//   - Albedo (nur wo die Textur die Farbe trägt: Schiffsrumpf),
//   - Normalkarte aus dem Höhenfeld (zentrale Differenzen, auflösungsunabhängige Stärke),
//   - ORMH: R = Umgebungsverdeckung (Fugen und Senken), G = Rauheit, B = Metall, A = Höhe (für Relief per Bildschirm-Ableitung im Shader).
// Die Erzeugung ist rein und deterministisch (`forgeMaps`, ohne three.js-Szene und ohne DOM, getestet). `forgeSet` legt daraus geteilte
// DataTextures an (Mipmaps, anisotrope Filterung, Wiederholung), markiert sie als geteilt und schützt sie gegen jedes fremde `dispose()`:
// der WorldStreamer gibt beim Abbau einer Insel nie eine Schmiede-Textur frei, `renderer.info.memory` bleibt stabil.
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, RepeatWrapping, SRGBColorSpace, UnsignedByteType, type Texture } from 'three';
import { markShared } from '../render/dispose';
import { FORGE_KINDS, FORGE_RECIPES, forgeKindSize, forgeMaps, type ForgeKind, type ForgeRecipe } from './forgeMaps';

export * from './forgeMaps';

// ---------- geteilter Cache ----------

/** Ein fertiger Satz: geteilte, geschützte Texturen samt Rezept */
export interface ForgeSet {
  kind: ForgeKind;
  size: number;
  recipe: ForgeRecipe;
  albedo: Texture | null;
  /** Normalkarte (UV); bei Sätzen mit Relief aus dem Höhenkanal entsteht sie erst beim ersten Zugriff */
  readonly normal: Texture;
  /** R Verdeckung, G Rauheit, B Metall, A Höhe (entsteht beim ersten Zugriff: der Wasser-Satz braucht nur die Normalkarte, 4.4C) */
  readonly orm: Texture;
}

const cache = new Map<ForgeKind, ForgeSet>();
let defaultSize = 512;
let anisotropy = 4;
/** Nur während `forgeDisposeAll` dürfen die Texturen wirklich freigegeben werden */
let releasing = false;
/** Alle je angelegten Schmiede-Texturen (für die endgültige Freigabe) */
const made: Texture[] = [];
/** Statistik für Tests und Prüfskripte */
export const forgeStats = { built: 0, ms: 0, blockedDisposes: 0, released: 0, bytes: 0 };

function makeTex(data: Uint8Array, size: number, srgb: boolean, repeat = 1): DataTexture {
  const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = anisotropy;
  t.flipY = false;
  t.needsUpdate = true;
  t.userData.forge = true;
  made.push(t);
  forgeStats.bytes += data.byteLength;
  // nach dem Hochladen braucht die Grafikkarte die Bytes nicht mehr im Arbeitsspeicher
  t.onUpdate = () => { const img = t.image as { data: Uint8Array | null }; if (img.data) { forgeStats.bytes -= img.data.byteLength; img.data = null; } };
  // Schutz: nur die Schmiede selbst gibt frei (WorldStreamer, disposeObject, Materialien rufen ins Leere)
  const real = t.dispose.bind(t);
  let done = false;
  t.dispose = () => {
    if (!releasing) { forgeStats.blockedDisposes++; return; }
    if (done) return;
    done = true;
    real();
  };
  return markShared(t);
}

/** Segeltuch läuft über die ganze Segelfläche (UV 0 … 1): 24 Kacheln je Segel */
const UV_REPEAT: Partial<Record<ForgeKind, number>> = { segeltuch: 24 };

/** Fertige Bytes eines Satzes in den Cache übernehmen (aus dem Worker oder aus `forgeMaps`) */
function adopt(kind: ForgeKind, size: number, albedo: Uint8Array | null, normal: Uint8Array | null, orm: Uint8Array): ForgeSet {
  const R = FORGE_RECIPES[kind];
  const rep = UV_REPEAT[kind] ?? 1;
  let normalTex: Texture | null = normal ? makeTex(normal, size, false, rep) : null;
  let ormTex: Texture | null = null;
  let ormBytes: Uint8Array | null = orm;
  const set: ForgeSet = {
    kind, size, recipe: R,
    albedo: albedo ? makeTex(albedo, size, true, rep) : null,
    get normal(): Texture {
      // Relief-Sätze rechnen ihre Normale im Shader aus dem Höhenkanal; die Karte entsteht nur auf Nachfrage (Werkzeuge, Tests)
      if (!normalTex) normalTex = makeTex(forgeMaps(kind, size).normal, size, false, rep);
      return normalTex;
    },
    get orm(): Texture {
      if (!ormTex) { ormTex = makeTex(ormBytes!, size, false, rep); ormBytes = null; }
      return ormTex;
    },
  };
  cache.set(kind, set);
  forgeStats.built++;
  return set;
}

/** Satz aus dem Cache (beim ersten Zugriff im Hauptfaden gebaut, falls der Start ihn nicht schon geliefert hat) */
export function forgeSet(kind: ForgeKind, size = forgeKindSize(kind, defaultSize)): ForgeSet {
  const hit = cache.get(kind);
  if (hit) return hit;
  const t0 = performance.now();
  const m = forgeMaps(kind, size);
  const set = adopt(kind, size, m.albedo, FORGE_RECIPES[kind].uvNormal ? m.normal : null, m.orm);
  forgeStats.ms += performance.now() - t0;
  return set;
}

/** Ist ein Satz schon gebaut? (ohne ihn zu bauen) */
export const forgeReady = (kind: ForgeKind): boolean => cache.has(kind);

/**
 * Alle Sätze EINMAL beim Start bereitstellen (vor dem Aufbau der Welt): was die Worker schon gerechnet haben (`forgeStart`), wird nur übernommen,
 * der Rest hier gerechnet. Setzt die anisotrope Filterung der Grafikstufe. Ein zweiter Aufruf baut nichts neu. Liefert die Rechenzeit (ms).
 */
export function forgePrewarm(size: number, aniso: number, kinds: readonly ForgeKind[] = FORGE_KINDS): number {
  defaultSize = cache.size ? defaultSize : size;
  anisotropy = aniso;
  for (const t of made) t.anisotropy = aniso;
  const t0 = performance.now();
  for (const k of kinds) forgeSet(k, forgeKindSize(k, defaultSize));
  return performance.now() - t0;
}

/**
 * Start im Hintergrund (main.ts, parallel zum Laden der Modelle): die Sätze werden auf bis zu vier Web Worker verteilt; jedes Ergebnis landet ohne
 * Kopie im Cache. Scheitern die Worker (Sicherheitsrichtlinie, sehr alte Browser), rechnet `forgePrewarm` im Hauptfaden nach.
 */
export function forgeStart(size: number): Promise<number> {
  defaultSize = size;
  const t0 = performance.now();
  if (typeof Worker === 'undefined') return Promise.resolve(0);
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  // grob nach Rechenaufwand verteilt: reihum
  const jobs: ForgeKind[][] = Array.from({ length: n }, () => []);
  FORGE_KINDS.forEach((k, i) => jobs[i % n].push(k));
  return new Promise<number>((resolve) => {
    let open = n;
    const finish = () => { if (--open === 0) resolve(performance.now() - t0); };
    for (const kinds of jobs) {
      let w: Worker;
      try {
        w = new Worker(new URL('./forgeWorker.ts', import.meta.url), { type: 'module' });
      } catch { finish(); continue; }
      const stop = () => { w.terminate(); finish(); };
      w.onerror = (e) => { e.preventDefault?.(); stop(); };
      w.onmessage = (e: MessageEvent<{ done?: boolean; kind?: ForgeKind; size?: number; albedo?: Uint8Array | null; normal?: Uint8Array | null; orm?: Uint8Array }>) => {
        const d = e.data;
        if (d.done) { stop(); return; }
        if (d.kind && d.orm && d.size === forgeKindSize(d.kind, defaultSize) && !cache.has(d.kind)) adopt(d.kind, d.size, d.albedo ?? null, d.normal ?? null, d.orm);
      };
      w.postMessage({ kinds, size });
    }
  });
}

/** Größe, mit der neue Sätze gebaut werden */
export const forgeSize = (): number => defaultSize;

/**
 * Alle Sätze wirklich freigeben (nur beim endgültigen Beenden, Tests). Doppelter Aufruf ist harmlos: jede Textur wird höchstens einmal freigegeben.
 */
export function forgeDisposeAll(): number {
  let n = 0;
  releasing = true;
  try {
    for (const t of made) { t.dispose(); n++; }
  } finally { releasing = false; }
  made.length = 0;
  cache.clear();
  forgeStats.released += n;
  return n;
}

