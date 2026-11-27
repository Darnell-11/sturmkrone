// Phase 4.93A – Kino-VFX-Netze aus Blender (public/models/vfx/, gebaut von scripts/blender/buildBrawlerAndMeteorVfx.py) für den gemeinsamen
// Effekt-Pool (`CataclysmFx`). Die Netze ersetzen die früheren Platzhalter aus Kisten, Kugeln und Zylindern (Geister-Fäuste aus Würfeln,
// Meteoriten aus Kugeln, Felsbrocken als Graben) – es gibt KEINE Ersatzform mehr: fehlt ein Netz, zeichnet seine Grundform nichts.
//
// Eckpunktfarbe der Dateien (Daten, keine sichtbare Farbe): R = weißglühende Kern-Intensität, G = Rand-Verlauf, B = Animationsphase.
// Der Pool zeichnet alle durchscheinenden Schichten mit EINEM Programm (Standard-`MeshBasicMaterial`: Textur × Eckpunktfarbe × Instanzfarbe)
// und alle festen Brocken mit einem zweiten – ein eigener Shader für die drei Kanäle kostete ein neues Programm. Darum backt der Lader den
// Hitzeverlauf beim Laden in die Eckpunktfarbe (drei gleiche Kanäle = Leuchtdichte: Kern weit über 1 → weißglühend, Rand → Farbe der Instanz
// bis Schwarz) und entfernt die Normalen (dieselben Programme wie alle anderen Grundformen). Die Animationsphase B steckt bereits im
// UV-Lauf der Netze (v wächst mit der Phase): die fließenden Texturen des Pools laufen damit vom Kern zum Schweif bzw. von Stufe zu Stufe.
import { BufferAttribute, BufferGeometry, type Material, type Mesh } from 'three';
import { markShared } from '../render/dispose';

/** Die fünf Blender-Dateien (ohne Endung) */
export const VFX_MESH_FILES = ['vfx_fist_shockcone', 'vfx_fist_rapid_barrage', 'vfx_trench_fissure', 'vfx_meteor_colossus', 'vfx_meteor_shards'] as const;
export type VfxMeshFile = (typeof VFX_MESH_FILES)[number];

/** Teile, wie der Pool sie als Grundform führt */
export type VfxMeshPart =
  | 'shockcone' | 'barrage' | 'fissureRock' | 'fissureGlow' | 'colossusRock' | 'colossusPlasma'
  | 'shardRock0' | 'shardRock1' | 'shardRock2' | 'shardRock3' | 'shardRock4'
  | 'shardPlasma0' | 'shardPlasma1' | 'shardPlasma2' | 'shardPlasma3' | 'shardPlasma4';

/** Zahl der Vorhut-Brocken des Himmelssturzes */
export const SHARD_COUNT = 5;
export const SHARD_ROCKS: readonly VfxMeshPart[] = ['shardRock0', 'shardRock1', 'shardRock2', 'shardRock3', 'shardRock4'];
export const SHARD_TAILS: readonly VfxMeshPart[] = ['shardPlasma0', 'shardPlasma1', 'shardPlasma2', 'shardPlasma3', 'shardPlasma4'];

/** Netz-Name in der Datei → Teil */
export const VFX_MESH_NODES: Readonly<Record<string, VfxMeshPart>> = {
  fist_shockcone_core: 'shockcone',
  fist_rapid_barrage_core: 'barrage',
  trench_fissure_rock: 'fissureRock',
  trench_fissure_glow: 'fissureGlow',
  meteor_colossus_rock: 'colossusRock',
  meteor_colossus_plasma: 'colossusPlasma',
  meteor_shard_0_rock: 'shardRock0', meteor_shard_1_rock: 'shardRock1', meteor_shard_2_rock: 'shardRock2', meteor_shard_3_rock: 'shardRock3', meteor_shard_4_rock: 'shardRock4',
  meteor_shard_0_plasma: 'shardPlasma0', meteor_shard_1_plasma: 'shardPlasma1', meteor_shard_2_plasma: 'shardPlasma2', meteor_shard_3_plasma: 'shardPlasma3', meteor_shard_4_plasma: 'shardPlasma4',
};
export const VFX_MESH_PARTS: readonly VfxMeshPart[] = Object.values(VFX_MESH_NODES);

/** Welche Datei welche Teile liefert (Prüfungen, Anzeige) */
export const VFX_FILE_PARTS: Readonly<Record<VfxMeshFile, readonly VfxMeshPart[]>> = {
  vfx_fist_shockcone: ['shockcone'],
  vfx_fist_rapid_barrage: ['barrage'],
  vfx_trench_fissure: ['fissureRock', 'fissureGlow'],
  vfx_meteor_colossus: ['colossusRock', 'colossusPlasma'],
  vfx_meteor_shards: [...SHARD_ROCKS, ...SHARD_TAILS],
};

/** Hitzeverlauf: `glow` = leuchtende Schicht (additiv), `rock` = festes Gestein mit glühenden Adern */
export type HeatKind = 'glow' | 'rock';
export const heatKindOf = (part: VfxMeshPart): HeatKind => (part.includes('Rock') ? 'rock' : 'glow');

/** Grenzen des gebackenen Verlaufs */
export const HEAT = {
  /** leuchtende Schicht: Grund am Rand, Zuwachs im Kern (weit über 1: brennt im Bloom zu Weiß aus) */
  glowBase: 0.22, glowCore: 2.2, glowPow: 1.5,
  /** Gestein: Schattierung über G (Furchen dunkel), Magma-Adern über R */
  rockShade: 0.42, rockFloor: 0.25, rockVein: 2.4,
} as const;

const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : Number.isFinite(x) ? x : 0);

/**
 * Leuchtdichte eines Eckpunkts aus R (Kern) und G (Rand). Leuchtende Schichten: G blendet den Rand gegen Schwarz aus (additiv = unsichtbar),
 * R hebt den Kern weit über 1 (weißglühend). Gestein: G schattiert (Furchen, Kraterböden), R lässt Adern und Bruchkanten glühen.
 */
export function heatLum(r: number, g: number, kind: HeatKind): number {
  const R = sat(r), G = sat(g);
  if (kind === 'rock') return HEAT.rockShade * (HEAT.rockFloor + (1 - HEAT.rockFloor) * G) + HEAT.rockVein * R * R;
  return G * (HEAT.glowBase + HEAT.glowCore * Math.pow(R, HEAT.glowPow));
}

/** Eckpunktfarbe (R, G, B je Eckpunkt, 0 … 1; `stride` Kanäle je Eckpunkt) → gebackene Leuchtdichte in drei Kanälen */
export function bakeHeat(src: ArrayLike<number>, stride: number, count: number, kind: HeatKind, out = new Float32Array(count * 3)): Float32Array {
  for (let i = 0; i < count; i++) {
    const l = heatLum(src[i * stride], src[i * stride + 1], kind);
    out[i * 3] = l; out[i * 3 + 1] = l; out[i * 3 + 2] = l;
  }
  return out;
}

const GEOS = new Map<VfxMeshPart, BufferGeometry>();
let EMPTY: BufferGeometry | null = null;
/** Zeit für Laden und Backen (ms, Startzeit-Prüfung) und Zahl der Dreiecke je Teil */
export const vfxMeshStats = { ms: 0, loaded: 0, tris: {} as Partial<Record<VfxMeshPart, number>> };

/** Leere Grundform (ein entartetes Dreieck: zeichnet nichts) – solange ein Netz fehlt */
function emptyGeo(): BufferGeometry {
  if (EMPTY) return EMPTY;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(9), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(6), 2));
  g.computeBoundingSphere();
  EMPTY = markShared(g);
  return EMPTY;
}

/** Geometrie eines Teils für den Pool (geteilt; vor dem Laden die leere Grundform) */
export function vfxMeshGeometry(part: VfxMeshPart): BufferGeometry { return GEOS.get(part) ?? emptyGeo(); }
export const hasVfxMesh = (part: VfxMeshPart): boolean => GEOS.has(part);
export const vfxMeshesReady = (): boolean => GEOS.size >= VFX_MESH_PARTS.length;

/**
 * Netz aus der Datei für den Pool aufbereiten: Lage und UV übernehmen, Hitzeverlauf aus (R, G) backen (drei Kanäle, keine Deckkraft – ein
 * vierter Kanal schaltete ein anderes Programm), Normalen und alles Übrige weglassen.
 */
export function bakeVfxGeometry(src: BufferGeometry, kind: HeatKind): BufferGeometry {
  const pos = src.getAttribute('position'), col = src.getAttribute('color'), uv = src.getAttribute('uv');
  const n = pos.count;
  const g = new BufferGeometry();
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { p[i * 3] = pos.getX(i); p[i * 3 + 1] = pos.getY(i); p[i * 3 + 2] = pos.getZ(i); }
  g.setAttribute('position', new BufferAttribute(p, 3));
  const raw = new Float32Array(n * 3);
  if (col) for (let i = 0; i < n; i++) { raw[i * 3] = col.getX(i); raw[i * 3 + 1] = col.getY(i); raw[i * 3 + 2] = col.getZ(i); }
  else raw.fill(1);
  g.setAttribute('color', new BufferAttribute(bakeHeat(raw, 3, n, kind), 3));
  const t = new Float32Array(n * 2);
  if (uv) for (let i = 0; i < n; i++) { t[i * 2] = uv.getX(i); t[i * 2 + 1] = uv.getY(i); }
  g.setAttribute('uv', new BufferAttribute(t, 2));
  if (src.index) g.setIndex(Array.from(src.index.array as ArrayLike<number>));
  g.computeBoundingSphere();
  return markShared(g);
}

/** Ein geladenes Netz eintragen (Lader und Prüfungen); gibt das Teil zurück oder null bei unbekanntem Namen */
export function adoptVfxMesh(name: string, geo: BufferGeometry): VfxMeshPart | null {
  const part = VFX_MESH_NODES[name.replace(/\.\d+$/, '')];
  if (!part) return null;
  const baked = bakeVfxGeometry(geo, heatKindOf(part));
  GEOS.set(part, baked);
  vfxMeshStats.tris[part] = (baked.index ? baked.index.count : baked.getAttribute('position').count) / 3;
  return part;
}

let loading: Promise<void> | null = null;

/**
 * Die fünf Dateien laden und in den gemeinsamen Pool-Vorrat legen (einmal; `main.ts` wartet vor dem Bau der Welt darauf, damit der Pool
 * seine Grundformen gleich mit den Netzen anlegt). Fehlt eine Datei, bleibt ihre Grundform leer – es gibt keinen Ersatz-Zylinder.
 */
export function loadVfxMeshes(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const { preload } = await import('../core/preload');
    const base = `${import.meta.env.BASE_URL}models/vfx/`;
    await Promise.all(VFX_MESH_FILES.map(async (file) => {
      try {
        const g = await preload.loadGltf(`${base}${file}.glb`);
        g.scene.updateMatrixWorld(true);
        g.scene.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          const geo = m.geometry.clone();
          geo.applyMatrix4(m.matrixWorld);
          // Name des Netzes (Blender-Objekt); fällt er weg (Zusammenfassen beim Verkleinern), hilft die Rolle im Materialnamen nicht weiter
          const part = adoptVfxMesh(m.name || m.parent?.name || '', geo) ?? adoptVfxMesh(m.parent?.name ?? '', geo);
          geo.dispose();
          if (part) vfxMeshStats.loaded++;
          else console.warn(`VFX-Netz ${file}: unbekanntes Teil „${m.name}“ (${((Array.isArray(m.material) ? m.material[0] : m.material) as Material)?.name ?? '?'})`);
        });
      } catch (e) {
        console.warn(`VFX-Netz ${file} nicht geladen`, e);
      }
    }));
    if (typeof performance !== 'undefined') vfxMeshStats.ms = performance.now() - t0;
  })();
  return loading;
}
