// Phase 4.6B/4.6D – Effekt-Baukasten der Kataklysmus-Ultimates, Faji-Künste und aller Kampfbewegungen: vorab angelegte Instanz-Netze
// (Zero-GC, nichts entsteht im Kampf). Seit 4.6D trägt JEDE Grundform eine der sechs prozeduralen Texturen der `AnimeVfxForge`
// (Klingensichel, Flammenpinsel, Plasma-Blitz, Gischt, Runen-Risse, Funken-Atlas) – keine glatten Einzel-Primitive mehr. Die Grundformen
// teilen sich zwei Shader-Programme: alle durchscheinenden (additiv oder normal gemischt) eines, die festen Brocken (Fels, Wolke,
// Eisscholle, Abgrund) ein zweites. Dunkle Mäntel (`*Ink`, Krater, Rauch, Gischt) mischen normal und blenden über vier Deckkraft-Stufen
// aus (je Stufe ein Instanz-Netz mit eigenem Material, gleiches Programm), alles Additive über die Farbe gegen Schwarz.
// Funken, Glut, Eis, Tropfen und Rauch drehen sich zur Kamera (Funken und Tropfen entlang ihrer Flugbahn), Blitz-Abschnitte um ihre Achse.
import {
  BufferAttribute, BufferGeometry, Color, Euler, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion,
  SphereGeometry, Vector3, DynamicDrawUsage, type MeshBasicMaterial, type Scene,
} from 'three';
import { advanceVfxScroll, vfxMaterial, INK_LEVELS, type VfxBlend, type VfxTexKey } from '../graphics/animeVfxForge';
import { markShared } from '../render/dispose';

export type FxPrim =
  | 'arc' | 'ring' | 'column' | 'bolt' | 'shard' | 'orb' | 'blade' | 'cannon' | 'rock' | 'wall' | 'void' | 'fist' | 'disc' | 'cloud'
  | 'sickle' | 'sickleInk' | 'ribbon' | 'ribbonInk' | 'jag' | 'jagInk' | 'shock' | 'crater' | 'foam' | 'splash'
  | 'spark' | 'ember' | 'ice' | 'drop' | 'smoke' | 'funnel' | 'funnelInk' | 'glass'
  /** 4.6I: pfeilförmiger Luftdruck-Kegel (Mach-Konus) vor stürzenden Meteoriten und Überschall-Vorstößen */
  | 'cone'
  /** 4.6I: dunkler Mantel einer gebogenen Wasserwand (Flutdrache; 3-Schicht-Regel: vor hellem Himmel blieb die additive Wand unsichtbar) */
  | 'arcInk';
export const FX_PRIMS: readonly FxPrim[] = [
  'arc', 'ring', 'column', 'bolt', 'shard', 'orb', 'blade', 'cannon', 'rock', 'wall', 'void', 'fist', 'disc', 'cloud',
  'sickle', 'sickleInk', 'ribbon', 'ribbonInk', 'jag', 'jagInk', 'shock', 'crater', 'foam', 'splash',
  'spark', 'ember', 'ice', 'drop', 'smoke', 'funnel', 'funnelInk', 'glass', 'cone', 'arcInk',
];

/**
 * Plätze je Grundform (4.6C: für die Stürme aus hunderten Fäusten, Sicheln und Splittern deutlich größer; 4.6D: die Schichten der
 * Schmiede). `disc` ist eine feste Scheibe (Eisscholle), `cloud` ein Haufen bauschiger Wolkenballen (Gewitterwolke).
 */
export const FX_CAP: Readonly<Record<FxPrim, number>> = {
  arc: 32, ring: 140, column: 72, bolt: 128, shard: 360, orb: 260, blade: 320, cannon: 18, rock: 160, wall: 96, void: 4, fist: 280, disc: 24, cloud: 16,
  sickle: 260, sickleInk: 160, ribbon: 160, ribbonInk: 100, jag: 480, jagInk: 360, shock: 120, crater: 80, foam: 100, splash: 70,
  spark: 700, ember: 360, ice: 320, drop: 420, smoke: 260, funnel: 12, funnelInk: 8, glass: 80, cone: 48, arcInk: 16,
};
const CAP = FX_CAP;

/**
 * Darstellung je Grundform: Textur der Schmiede, Mischung (`add` additiv, `ink` normal mit Deckkraft-Stufen, `solid` fest), UV-Lauf
 * (je s entlang v), Ausrichtung (0 Euler, 1 zur Kamera, 2 entlang der Flugbahn zur Kamera, 3 um die eigene Achse zur Kamera).
 */
export interface PrimLook { tex: VfxTexKey; blend: VfxBlend; scroll: number; bb: 0 | 1 | 2 | 3 }
export const PRIM_LOOK: Readonly<Record<FxPrim, PrimLook>> = {
  arc: { tex: 'flameBrush', blend: 'add', scroll: 0.9, bb: 0 },
  ring: { tex: 'flameBrush', blend: 'add', scroll: 0.6, bb: 0 },
  column: { tex: 'flameBrush', blend: 'add', scroll: 1.4, bb: 0 },
  bolt: { tex: 'lightningJagged', blend: 'add', scroll: 3.5, bb: 0 },
  shard: { tex: 'runeCrack', blend: 'add', scroll: 0, bb: 0 },
  orb: { tex: 'flameBrush', blend: 'add', scroll: 0.8, bb: 0 },
  blade: { tex: 'slashArc', blend: 'add', scroll: 0, bb: 0 },
  cannon: { tex: 'flameBrush', blend: 'add', scroll: 0.7, bb: 0 },
  rock: { tex: 'flameBrush', blend: 'solid', scroll: 0, bb: 0 },
  wall: { tex: 'waterFoam', blend: 'add', scroll: 0.5, bb: 0 },
  void: { tex: 'flameBrush', blend: 'solid', scroll: 0, bb: 0 },
  fist: { tex: 'flameBrush', blend: 'add', scroll: 1.2, bb: 0 },
  disc: { tex: 'waterFoam', blend: 'solid', scroll: 0, bb: 0 },
  cloud: { tex: 'flameBrush', blend: 'solid', scroll: 0, bb: 0 },
  sickle: { tex: 'slashArc', blend: 'add', scroll: 0, bb: 0 },
  sickleInk: { tex: 'slashArc', blend: 'ink', scroll: 0, bb: 0 },
  ribbon: { tex: 'flameBrush', blend: 'add', scroll: 1.6, bb: 0 },
  ribbonInk: { tex: 'flameBrush', blend: 'ink', scroll: 0.9, bb: 0 },
  jag: { tex: 'lightningJagged', blend: 'add', scroll: 4, bb: 3 },
  jagInk: { tex: 'lightningJagged', blend: 'ink', scroll: 4, bb: 3 },
  shock: { tex: 'runeCrack', blend: 'add', scroll: 0, bb: 0 },
  crater: { tex: 'runeCrack', blend: 'ink', scroll: 0, bb: 0 },
  foam: { tex: 'waterFoam', blend: 'ink', scroll: 0.25, bb: 0 },
  splash: { tex: 'waterFoam', blend: 'ink', scroll: 0.6, bb: 0 },
  spark: { tex: 'emberSpark', blend: 'add', scroll: 0, bb: 2 },
  ember: { tex: 'emberSpark', blend: 'add', scroll: 0, bb: 1 },
  ice: { tex: 'emberSpark', blend: 'add', scroll: 0, bb: 1 },
  drop: { tex: 'emberSpark', blend: 'ink', scroll: 0, bb: 2 },
  smoke: { tex: 'emberSpark', blend: 'ink', scroll: 0, bb: 1 },
  funnel: { tex: 'flameBrush', blend: 'add', scroll: 1.8, bb: 0 },
  funnelInk: { tex: 'flameBrush', blend: 'ink', scroll: 1.1, bb: 0 },
  glass: { tex: 'runeCrack', blend: 'add', scroll: 0, bb: 0 },
  // gestauchte Luft strömt von der Spitze nach hinten ab (Gischt-Textur: weiß-bläuliche Schlieren), additiv: dasselbe Programm wie alle Kerne
  cone: { tex: 'waterFoam', blend: 'add', scroll: -2.6, bb: 0 },
  arcInk: { tex: 'waterFoam', blend: 'ink', scroll: 0.5, bb: 0 },
};

// ---------- Geometrien (einmal gebaut, geteilt; Position, Eckpunktfarbe und UV – nie Normalen: gleiche Programme) ----------

function geo(pos: number[], col: number[], uv: number[], idx: number[] | null): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  if (idx) g.setIndex(idx);
  g.computeBoundingSphere();
  return markShared(g);
}

/** Raster aus Zeilen × Spalten: Viereck-Streifen für Bänder, Wände, Trichter */
function stripIndex(cols: number, rows: number, idx: number[]) {
  for (let i = 0; i < cols; i++) for (let r = 0; r < rows - 1; r++) { const a = i * rows + r, b = a + rows; idx.push(a, b, a + 1, b, b + 1, a + 1); }
}

/** Senkrechte gebogene Energiewand: Bogen ±75° um +Z (Radius 1), Höhe 0 … 1, heller Kern in halber Höhe; Flammen laufen nach oben */
function arcGeo(): BufferGeometry {
  const seg = 40, rows = [0, 0.3, 0.5, 0.7, 1], lum = [0.08, 0.7, 1.4, 0.7, 0];
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (-75 + (150 * i) / seg) * (Math.PI / 180);
    const edge = Math.sin((Math.PI * i) / seg);
    for (let r = 0; r < rows.length; r++) {
      pos.push(Math.sin(a), rows[r], Math.cos(a));
      const l = lum[r] * (0.35 + 0.65 * edge);
      col.push(l, l, l);
      uv.push((i / seg) * 3, rows[r] * 1.5);
    }
  }
  stripIndex(seg, rows.length, idx);
  return geo(pos, col, uv, idx);
}

/** Flacher Energiering in der XZ-Ebene (innen 0,72, außen 1): Flammen-Kranz, der nach außen züngelt */
function ringGeo(): BufferGeometry {
  const seg = 48, rad = [0.72, 0.86, 1], lum = [0.2, 1.25, 0.15];
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    for (let r = 0; r < 3; r++) { pos.push(Math.sin(a) * rad[r], 0, Math.cos(a) * rad[r]); col.push(lum[r], lum[r], lum[r]); uv.push((i / seg) * 4, (rad[r] - 0.72) / 0.28); }
  }
  stripIndex(seg, 3, idx);
  return geo(pos, col, uv, idx);
}

/** Offene Lichtsäule (Radius 1, Höhe 0 … 1), unten hell, oben ausblendend; Energie strömt nach oben */
function columnGeo(): BufferGeometry {
  const seg = 20, rows = [0, 0.15, 0.6, 1], lum = [0.6, 1.3, 0.8, 0];
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    for (let r = 0; r < rows.length; r++) { pos.push(Math.sin(a), rows[r], Math.cos(a)); col.push(lum[r], lum[r], lum[r]); uv.push((i / seg) * 2, rows[r] * 3); }
  }
  stripIndex(seg, rows.length, idx);
  return geo(pos, col, uv, idx);
}

/** Blitz: Zickzack-Band entlang +Y (0 … 1), zwei gekreuzte Bänder für Volumen, Plasma-Textur läuft entlang */
function boltGeo(): BufferGeometry {
  const pts: [number, number][] = [];
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const n = 14;
  for (let i = 0; i <= n; i++) pts.push([i === 0 || i === n ? 0 : (rnd() - 0.5) * 0.16, i / n]);
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let k = 0; k < 2; k++) {
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const [ox, y] = pts[i];
      const w = 0.03 * (1 - Math.abs(y - 0.5) * 0.8);
      if (k === 0) { pos.push(ox - w, y, 0, ox + w, y, 0); } else { pos.push(ox, y, -w, ox, y, w); }
      col.push(1.4, 1.4, 1.4, 1.4, 1.4, 1.4);
      uv.push(0, y * 2, 1, y * 2);
    }
    for (let i = 0; i < n; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
  }
  return geo(pos, col, uv, idx);
}

/** Kristall (Eis, Glas): gestreckter Achtflächner entlang +Y (0 … 1), Spitze hell, Risse im Inneren */
function shardGeo(): BufferGeometry {
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const ring = 6, mid = 0.28;
  pos.push(0, 0, 0); col.push(0.4, 0.4, 0.4); uv.push(0.5, 0.05);
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + 0.3;
    const r = i % 2 ? 0.17 : 0.24;
    pos.push(Math.sin(a) * r, mid, Math.cos(a) * r);
    const l = 0.65 + 0.35 * (i % 3) / 2;
    col.push(l, l, l);
    uv.push(0.5 + Math.sin(a) * 0.45, 0.3);
  }
  pos.push(0, 1, 0); col.push(1.5, 1.5, 1.5); uv.push(0.5, 0.95);
  const top = ring + 1;
  for (let i = 0; i < ring; i++) { const a = 1 + i, b = 1 + ((i + 1) % ring); idx.push(0, b, a, a, b, top); }
  return geo(pos, col, uv, idx);
}

/** Kugel mit Kugel-UV (Flammen laufen über die Oberfläche): Glutkerne, Sonnen, Wasserballen */
function orbGeo(): BufferGeometry {
  const g = new SphereGeometry(1, 18, 12);
  g.deleteAttribute('normal');
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.computeBoundingSphere();
  return markShared(g);
}

/** Sichel (Mond, Klingenwelle) flach in der XZ-Ebene, Öffnung nach −Z: zeigt nach vorn (+Z); u entlang, v quer (Schneide außen) */
function bladeGeo(): BufferGeometry {
  const seg = 28;
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const a = (-80 + 160 * u) * (Math.PI / 180);
    const th = Math.sin(Math.PI * u);
    pos.push(Math.sin(a), 0, Math.cos(a));
    pos.push(Math.sin(a) * (1 - 0.28 * th), 0, Math.cos(a) * (1 - 0.28 * th) - 0.12 * th);
    const l = 0.35 + 1.1 * th;
    col.push(l, l, l, 0.3, 0.3, 0.3);
    uv.push(u, 1, u, 0);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
  return geo(pos, col, uv, idx);
}

/** Verjüngte Anime-Klingensichel (4.6D): ±95°, scharf zulaufend, breiter Bauch; Schneide außen (v = 1), Schweif bei u = 0 */
function sickleGeo(): BufferGeometry {
  const seg = 40;
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const a = (-95 + 190 * u) * (Math.PI / 180);
    const th = Math.sin(Math.PI * u) ** 0.8 * 0.42;
    pos.push(Math.sin(a), 0, Math.cos(a));
    pos.push(Math.sin(a) * (1 - th), 0, Math.cos(a) * (1 - th) - 0.1 * th);
    col.push(1, 1, 1, 1, 1, 1);
    uv.push(u, 1, u, 0);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
  return geo(pos, col, uv, idx);
}

/** Geister-Geschütz: Rohr entlang +Z (Länge 1) mit Mündungswulst und Lafette */
function cannonGeo(): BufferGeometry {
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const seg = 12;
  const prof: [number, number, number][] = [[0.13, -0.1, 0.5], [0.16, 0, 0.8], [0.12, 0.25, 0.9], [0.1, 0.85, 1], [0.13, 0.9, 1.4], [0.13, 1, 1.6]];
  for (let p = 0; p < prof.length; p++) {
    const [r, z, l] = prof[p];
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; pos.push(Math.sin(a) * r, Math.cos(a) * r, z); col.push(l, l, l); uv.push(i / seg, z * 2); }
  }
  const R = seg + 1;
  for (let p = 0; p < prof.length - 1; p++) for (let i = 0; i < seg; i++) { const a = p * R + i, b = a + R; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const base = pos.length / 3;
  const bx = 0.2, by0 = -0.26, by1 = -0.12, bz0 = -0.05, bz1 = 0.5;
  const cs: [number, number, number][] = [[-bx, by0, bz0], [bx, by0, bz0], [bx, by1, bz0], [-bx, by1, bz0], [-bx, by0, bz1], [bx, by0, bz1], [bx, by1, bz1], [-bx, by1, bz1]];
  for (const c of cs) { pos.push(...c); col.push(0.5, 0.5, 0.5); uv.push(c[0] + 0.5, c[2]); }
  const box = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2];
  for (const i of box) idx.push(base + i);
  return geo(pos, col, uv, idx);
}

/** Planare UV aus der Lage (Felsen, Wolke: die Textur gibt Gestein bzw. Wolkenstruktur) */
function planarUv(g: BufferGeometry, ku: number, kv: number, mixY = 0) {
  const p = g.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = 0.5 + (p.getX(i) + p.getZ(i) * 0.5) * ku; uv[i * 2 + 1] = 0.5 + (p.getZ(i) * (1 - mixY) + p.getY(i) * mixY) * kv; }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
}

/** Fels (Erdspalter): unregelmäßiger Block, oben heller (gebackene Schattierung, kein Licht nötig), Gesteinsstruktur aus der Textur */
function rockGeo(): BufferGeometry {
  const g = new IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  let s = 11;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const jit = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let j = jit.get(k);
    if (j === undefined) { j = 0.75 + rnd() * 0.45; jit.set(k, j); }
    const yy = (y * 0.5 + 0.5) * j;
    p.setXYZ(i, x * j * 0.8, yy * 1.6, z * j * 0.8);
    const l = 0.42 + 0.5 * (y * 0.5 + 0.5);
    col[i * 3] = l * 0.62; col[i * 3 + 1] = l * 0.55; col[i * 3 + 2] = l * 0.48;
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  planarUv(g, 0.45, 0.45, 0.6);
  g.computeBoundingSphere();
  return markShared(g);
}

/** Geister-Faust (Sturmfaust-Stakkato): Knöchel nach +Z (Länge ~1), hell an der Schlagfläche */
function fistGeo(): BufferGeometry {
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, front: number, back: number) => {
    const b = pos.length / 3;
    for (let k = 0; k < 8; k++) {
      const x = cx + (k & 1 ? sx : -sx) * 0.5, y = cy + (k & 2 ? sy : -sy) * 0.5, z = cz + (k & 4 ? sz : -sz) * 0.5;
      pos.push(x, y, z);
      const l = k & 4 ? front : back;
      col.push(l, l, l);
      uv.push(x + 0.5, z * 1.5 + y * 0.5);
    }
    const f = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3];
    for (const i of f) idx.push(b + i);
  };
  box(0, 0, 0.42, 0.5, 0.36, 0.34, 1.1, 0.6);
  for (let i = 0; i < 4; i++) box(-0.19 + i * 0.127, 0.06 - Math.abs(i - 1.5) * 0.02, 0.66, 0.12, 0.2, 0.16, 1.7, 1.0);
  box(-0.3, -0.08, 0.5, 0.14, 0.16, 0.3, 1.2, 0.7);
  box(0, 0, 0.1, 0.36, 0.3, 0.4, 0.5, 0.15);
  return geo(pos, col, uv, idx);
}

/** Flache Scheibe in der XZ-Ebene (Radius ~1) mit unregelmäßigem Rand: Eisscholle; Mitte heller, Eisstruktur aus der Gischt-Textur */
function discGeo(seed: number, rim: number): BufferGeometry {
  const seg = 40;
  const pos: number[] = [0, 0, 0], col: number[] = [1, 1, 1], uv: number[] = [1, 1], idx: number[] = [];
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const r = 0.86 + rnd() * 0.18 + Math.sin(a * 3 + seed) * 0.04;
    pos.push(Math.sin(a) * r, 0, Math.cos(a) * r);
    col.push(rim, rim, rim);
    uv.push(1 + Math.sin(a) * r * 2, 1 + Math.cos(a) * r * 2);
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + i, 1 + ((i + 1) % seg));
  return geo(pos, col, uv, idx);
}

/**
 * Gewitterwolke (Blitz-Urteil): Haufen bauschiger Ballen (Radius ~1, flache Unterseite bei y ≈ −0,06, Kuppen bis ~0,42).
 * Gebackene Schattierung: Unterseite dunkel, Kuppen hell – von unten bedrohlich, von oben (hohe Kamera) eine echte Wolkendecke statt Scheibe.
 */
function cloudGeo(): BufferGeometry {
  const ball = new IcosahedronGeometry(1, 2);
  const bp = ball.getAttribute('position');
  const pos: number[] = [], col: number[] = [], uv: number[] = [];
  let s = 29;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const puffs: [number, number, number][] = [[0, 0, 0.5]];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + rnd() * 0.4; const r = 0.5 + rnd() * 0.14; puffs.push([Math.sin(a) * r, Math.cos(a) * r, 0.3 + rnd() * 0.12]); }
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + rnd() * 0.5; const r = 0.8 + rnd() * 0.1; puffs.push([Math.sin(a) * r, Math.cos(a) * r, 0.17 + rnd() * 0.08]); }
  for (const [cx, cz, pr] of puffs) {
    const lift = (rnd() - 0.3) * 0.05;
    const jit = new Map<string, number>();
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      let j = jit.get(k);
      if (j === undefined) { j = 0.86 + rnd() * 0.24; jit.set(k, j); }
      const py = Math.max(y * 0.72 * pr * j + lift, -0.06);
      const px = cx + x * pr * j, pz = cz + z * pr * j;
      pos.push(px, py, pz);
      const l = py <= -0.059 ? 0.3 : 0.42 + 1.05 * Math.min(1, Math.max(0, (py + 0.06) / 0.42)) * (0.75 + 0.25 * Math.max(0, y));
      col.push(l * 0.96, l * 0.98, l * 1.05);
      uv.push(0.5 + px * 0.7, 0.5 + pz * 0.7 + py);
    }
  }
  ball.dispose();
  return geo(pos, col, uv, null);
}

/** Wasserwand / Gischtvorhang: senkrechte Fläche (Breite 1 entlang X, Höhe 0 … 1), oben zerfasernd */
function wallGeo(): BufferGeometry {
  const seg = 10, rows = [0, 0.5, 0.85, 1], lum = [0.9, 1.1, 0.6, 0];
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const x = i / seg - 0.5;
    const edge = Math.sin(Math.PI * (i / seg));
    for (let r = 0; r < rows.length; r++) {
      const y = rows[r] * (r === rows.length - 1 ? 0.8 + 0.4 * ((i * 37) % 7) / 7 : 1);
      pos.push(x, y, Math.sin(i * 1.7) * 0.04);
      const l = lum[r] * (0.3 + 0.7 * edge);
      col.push(l, l, l);
      uv.push((x + 0.5) * 2, y * 1.4);
    }
  }
  stripIndex(seg, rows.length, idx);
  return geo(pos, col, uv, idx);
}

/** Gewundenes Energieband (Helix um die Y-Achse, Radius 1, Höhe 0 … 1, 1¼ Windungen): Spiralen, Drachenleib, Tornado-Bänder, Flammenzungen */
function ribbonGeo(): BufferGeometry {
  const seg = 64, turns = 1.25;
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const th = t * Math.PI * 2 * turns;
    const hw = 0.075 * Math.sin(Math.PI * t) ** 0.6 + 0.008;
    const c = Math.cos(th), s = Math.sin(th);
    pos.push(c, t - hw, s, c, t + hw, s);
    const l = 0.35 + 0.75 * Math.sin(Math.PI * t);
    col.push(l, l, l, l, l, l);
    uv.push(0, t * 3, 1, t * 3);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
  return geo(pos, col, uv, idx);
}

/** Blitz-Abschnitt: gerader Streifen x ∈ [−0,5, 0,5], y ∈ [0, 1] – dreht sich um seine Achse zur Kamera; das Zickzack trägt die Textur */
function jagGeo(): BufferGeometry {
  const rows = 4;
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= 1; i++) for (let r = 0; r < rows; r++) {
    const y = r / (rows - 1);
    pos.push(i - 0.5, y, 0);
    col.push(1, 1, 1);
    uv.push(i, y * 1.5);
  }
  stripIndex(1, rows, idx);
  return geo(pos, col, uv, idx);
}

/** Liegender Ring mit planarer UV (Runen-Risse, Gischt): innen `inner`, außen 1; die Textur zeigt ihren Rand-Ausschnitt */
function planarRingGeo(inner: number, tile: number, lum: [number, number, number]): BufferGeometry {
  const seg = 48, rad = [inner, (inner + 1) / 2, 1];
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    for (let r = 0; r < 3; r++) {
      const x = Math.sin(a) * rad[r], z = Math.cos(a) * rad[r];
      pos.push(x, 0, z); col.push(lum[r], lum[r], lum[r]);
      uv.push(tile === 1 ? 0.5 + x * 0.5 : x * tile, tile === 1 ? 0.5 + z * 0.5 : z * tile);
    }
  }
  stripIndex(seg, 3, idx);
  return geo(pos, col, uv, idx);
}

/** Volle liegende Scheibe mit planarer UV (Krater, Hitze-Kontrastring) */
function craterGeo(): BufferGeometry {
  const seg = 48;
  const pos: number[] = [0, 0, 0], col: number[] = [1, 1, 1], uv: number[] = [0.5, 0.5], idx: number[] = [];
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; pos.push(Math.sin(a), 0, Math.cos(a)); col.push(1, 1, 1); uv.push(0.5 + Math.sin(a) * 0.5, 0.5 + Math.cos(a) * 0.5); }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + i, 2 + i);
  return geo(pos, col, uv, idx);
}

/** Gischt-Krone: offener, nach oben aufgehender Zylinder (Radius 0,55 → 1), oben ausgefranst */
function splashGeo(): BufferGeometry {
  const seg = 24, rows = [0, 0.35, 0.7, 1], lum = [0.9, 1, 0.7, 0];
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    for (let r = 0; r < rows.length; r++) {
      const y = rows[r], rr = 0.55 + 0.45 * y;
      pos.push(Math.sin(a) * rr, y, Math.cos(a) * rr); col.push(lum[r], lum[r], lum[r]); uv.push((i / seg) * 3, y);
    }
  }
  stripIndex(seg, rows.length, idx);
  return geo(pos, col, uv, idx);
}

/** Viereck (x, y ∈ [−0,5, 0,5]) auf eine Zelle des Funken-Atlas (0 Funke, 1 Glut/Rauch, 2 Eis, 3 Tropfen) */
function quadGeo(cell: number): BufferGeometry {
  const u0 = (cell % 2) * 0.5, v0 = cell < 2 ? 0.5 : 0;
  const pos = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0];
  const uv = [u0, v0, u0 + 0.5, v0, u0 + 0.5, v0 + 0.5, u0, v0 + 0.5];
  return geo(pos, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], uv, [0, 1, 2, 0, 2, 3]);
}

/** Trichter-Tornado: Radius 0,12 unten → 1 oben (Höhe 0 … 1), oben und unten weich auslaufend; Flammen/Wind wirbeln nach oben */
function funnelGeo(): BufferGeometry {
  const seg = 28, rows = 10;
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    for (let r = 0; r < rows; r++) {
      const y = r / (rows - 1), rr = 0.12 + 0.88 * y ** 1.5;
      pos.push(Math.sin(a) * rr, y, Math.cos(a) * rr);
      const l = (1 - Math.max(0, (y - 0.82) / 0.18)) * (0.45 + 0.55 * y) * Math.min(1, y * 6 + 0.2);
      col.push(l, l, l);
      uv.push((i / seg) * 2, y * 2);
    }
  }
  stripIndex(seg, rows, idx);
  return geo(pos, col, uv, idx);
}

/** Glas-Splitter-Ebene (unregelmäßiges Vieleck in der XY-Ebene, Radius ~1) mit Runen-Rissen */
function glassGeo(): BufferGeometry {
  const pos: number[] = [0, 0, 0], col: number[] = [1.2, 1.2, 1.2], uv: number[] = [0.5, 0.5], idx: number[] = [];
  let s = 13;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5, r = 0.6 + rnd() * 0.4;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    pos.push(x, y, 0); col.push(0.55, 0.55, 0.55); uv.push(0.5 + x * 0.5, 0.5 + y * 0.5);
  }
  for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  return geo(pos, col, uv, idx);
}

/**
 * 4.6I – Mach-Kegel: offener Kegel entlang +Y, Spitze bei y = 1 (zeigt in Flugrichtung), Rand bei y = 0 mit Radius 1; die Spitze glüht hell,
 * der Rand läuft dunkel aus (additiv: Schwarz = unsichtbar), dazu drei feine Druckringe als hellere Bänder
 */
function coneGeo(): BufferGeometry {
  const seg = 24, rows = [0, 0.18, 0.4, 0.62, 0.84, 1];
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    for (let r = 0; r < rows.length; r++) {
      const y = rows[r], rr = (1 - y) ** 1.25;
      pos.push(Math.sin(a) * rr, y, Math.cos(a) * rr);
      const band = r === 2 || r === 4 ? 0.35 : 0;
      const l = Math.min(1.5, 0.06 + 1.2 * y * y + band * y);
      col.push(l, l, l);
      uv.push((i / seg) * 2, y * 1.6);
    }
  }
  stripIndex(seg, rows.length, idx);
  return geo(pos, col, uv, idx);
}

const GEOS: Record<FxPrim, () => BufferGeometry> = {
  arc: arcGeo, ring: ringGeo, column: columnGeo, bolt: boltGeo, shard: shardGeo, orb: orbGeo, blade: bladeGeo, cannon: cannonGeo, rock: rockGeo,
  wall: wallGeo, void: orbGeo, fist: fistGeo, disc: () => discGeo(17, 0.78), cloud: cloudGeo,
  sickle: sickleGeo, sickleInk: sickleGeo, ribbon: ribbonGeo, ribbonInk: ribbonGeo, jag: jagGeo, jagInk: jagGeo,
  shock: () => planarRingGeo(0.3, 1, [0.9, 1.1, 1]), crater: craterGeo, foam: () => planarRingGeo(0.45, 1.6, [0.55, 1, 0.3]), splash: splashGeo,
  spark: () => quadGeo(0), ember: () => quadGeo(1), ice: () => quadGeo(2), drop: () => quadGeo(3), smoke: () => quadGeo(1),
  funnel: funnelGeo, funnelInk: funnelGeo, glass: glassGeo, cone: coneGeo, arcInk: arcGeo,
};

// ---------- Pinsel und Pool ----------

/** Pinsel: Werte für den nächsten `emit` (ein Objekt, je Ausstoß neu gefüllt) */
export class FxBrush {
  x = 0; y = 0; z = 0;
  vx = 0; vy = 0; vz = 0; grav = 0; drag = 0;
  yaw = 0; pitch = 0; roll = 0;
  dyaw = 0; dpitch = 0; droll = 0;
  sx0 = 1; sy0 = 1; sz0 = 1; sx1 = 1; sy1 = 1; sz1 = 1;
  /** Kurve der Größe: 0 = gleichmäßig, 1 = schnell auf, langsam aus (ease-out) */
  ease = 1;
  life = 1; delay = 0;
  r = 1; g = 1; b = 1; k = 1;
  fadeIn = 0.08; fadeOut = 0.35;
  flicker = 0;
  reset(): this {
    this.x = this.y = this.z = 0; this.vx = this.vy = this.vz = 0; this.grav = 0; this.drag = 0;
    this.yaw = this.pitch = this.roll = 0; this.dyaw = this.dpitch = this.droll = 0;
    this.sx0 = this.sy0 = this.sz0 = this.sx1 = this.sy1 = this.sz1 = 1; this.ease = 1;
    this.life = 1; this.delay = 0; this.r = this.g = this.b = 1; this.k = 1; this.fadeIn = 0.08; this.fadeOut = 0.35; this.flicker = 0;
    return this;
  }
  at(x: number, y: number, z: number): this { this.x = x; this.y = y; this.z = z; return this; }
  vel(x: number, y: number, z: number): this { this.vx = x; this.vy = y; this.vz = z; return this; }
  rot(yaw: number, pitch = 0, roll = 0): this { this.yaw = yaw; this.pitch = pitch; this.roll = roll; return this; }
  spin(dy: number, dp = 0, dr = 0): this { this.dyaw = dy; this.dpitch = dp; this.droll = dr; return this; }
  size(x0: number, y0: number, z0: number, x1 = x0, y1 = y0, z1 = z0): this { this.sx0 = x0; this.sy0 = y0; this.sz0 = z0; this.sx1 = x1; this.sy1 = y1; this.sz1 = z1; return this; }
  span(life: number, delay = 0): this { this.life = Math.max(0.02, life); this.delay = Math.max(0, delay); return this; }
  col(c: Color, k = 1): this { this.r = c.r; this.g = c.g; this.b = c.b; this.k = k; return this; }
  fade(fin: number, fout: number): this { this.fadeIn = fin; this.fadeOut = fout; return this; }
}

const F = 26; // Felder je Platz
// Feldnummern
const T = 0, LIFE = 1, DELAY = 2, PX = 3, PY = 4, PZ = 5, VX = 6, VY = 7, VZ = 8, GRAV = 9, DRAG = 10, YAW = 11, PIT = 12, ROL = 13,
  DYAW = 14, DPIT = 15, DROL = 16, S0 = 17, S1 = 20, EASE = 23, FIN = 24, FOUT = 25;

/** Schwellen der Deckkraft-Stufen (dunkle Mäntel): Ausblend-Faktor ≥ Schwelle → Stufe */
const INK_CUT = [0.86, 0.59, 0.34, 0.1];

class Pool {
  /** ein Netz (additiv, fest) bzw. vier Stufen-Netze (dunkle Mäntel) */
  readonly meshes: InstancedMesh[] = [];
  n = 0;
  readonly d: Float32Array;
  readonly c: Float32Array;
  readonly flick: Float32Array;
  readonly bb: 0 | 1 | 2 | 3;
  readonly ink: boolean;
  /** additiv (leuchtender Kern): blendet nah vor der Linse aus (`CataclysmFx.lensNear`) */
  readonly add: boolean;
  constructor(readonly prim: FxPrim, geo: BufferGeometry, mats: MeshBasicMaterial[], readonly cap: number, look: PrimLook) {
    this.bb = look.bb;
    this.ink = look.blend === 'ink';
    this.add = look.blend === 'add';
    for (const mat of mats) {
      const m = new InstancedMesh(geo, mat, cap);
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.instanceColor.setUsage(DynamicDrawUsage);
      m.count = 0;
      m.visible = false;
      m.frustumCulled = false;
      m.userData.noOutline = true;
      m.name = `fx-${prim}`;
      // feste Brocken zuerst, dann die dunklen Mäntel, darüber der leuchtende Kern
      m.renderOrder = look.blend === 'solid' ? 0 : look.blend === 'ink' ? 5 : 6;
      this.meshes.push(m);
    }
    this.d = new Float32Array(cap * F);
    this.c = new Float32Array(cap * 4);
    this.flick = new Float32Array(cap);
  }
}

const _q = new Quaternion();
const _qr = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _p = new Vector3();
const _s = new Vector3();
const _mx = new Matrix4();
const _ax = new Vector3();
const _ay = new Vector3();
const _az = new Vector3();
const _z = new Vector3(0, 0, 1);
const _cnt = new Int32Array(8);

/** Kamera für die Ausrichtung der Sprites (Lage und Drehung, je Bild gelesen) */
export interface FxCamera { readonly position: Vector3; readonly quaternion: Quaternion }

/** Effekt-Baukasten: `brush` füllen, `emit(prim)` ausstoßen, je Bild `update(dt)` (Spielzeit: verlangsamt in der Zeitlupe mit) */
export class CataclysmFx {
  readonly group = new Group();
  readonly brush = new FxBrush();
  private readonly pools = {} as Record<FxPrim, Pool>;
  /** ausgestoßene Teile insgesamt (Prüfungen) */
  emitted = 0;
  /** Teilchen-Faktor der Grafikstufe (wie NavalSystem.detail): weniger Kleinkram auf schwachen Geräten */
  detail = 1;
  /**
   * 4.6I: Leuchtende Teile (additiv, bis 3 m groß), die näher als so viele Meter vor der Kamera schweben, blenden weich aus – in den
   * Nahaufnahmen der Kino-Regie (Hand, Gesicht) überstrahlten Glut, Aura-Bänder und Funken direkt vor der Linse sonst das ganze Bild.
   */
  lensNear = 1.6;
  private cam: FxCamera | null = null;

  constructor(scene: Scene) {
    this.group.name = 'cataclysm-fx';
    for (const p of FX_PRIMS) {
      const look = PRIM_LOOK[p];
      const mats = look.blend === 'ink'
        ? INK_LEVELS.map((_, lv) => vfxMaterial(look.tex, 'ink', look.scroll, lv))
        : [vfxMaterial(look.tex, look.blend, look.scroll)];
      const pool = new Pool(p, GEOS[p](), mats, CAP[p], look);
      this.pools[p] = pool;
      for (const m of pool.meshes) this.group.add(m);
    }
    scene.add(this.group);
  }

  /** Kamera setzen (Funken, Rauch und Blitz-Abschnitte drehen sich zu ihr); ohne Kamera gilt die Euler-Lage des Pinsels */
  setCamera(cam: FxCamera | null) { this.cam = cam; }

  /** Lebende Teile einer Grundform (Prüfungen) */
  count(p: FxPrim): number { return this.pools[p].n; }
  /** Lebende Teile insgesamt */
  get alive(): number { let n = 0; for (const p of FX_PRIMS) n += this.pools[p].n; return n; }
  /** Instanz-Netze einer Grundform (Prüfungen: Material, Stufen) */
  meshesOf(p: FxPrim): readonly InstancedMesh[] { return this.pools[p].meshes; }

  /** Ausstoßen mit dem aktuellen Pinsel; ist die Grundform voll, ersetzt der neue das älteste Teil */
  emit(p: FxPrim): number {
    const pool = this.pools[p];
    let i = pool.n;
    if (i >= pool.cap) {
      let best = 0, bu = -1;
      for (let k = 0; k < pool.cap; k++) { const u = pool.d[k * F + T] / pool.d[k * F + LIFE]; if (u > bu) { bu = u; best = k; } }
      i = best;
    } else pool.n++;
    const b = this.brush, d = pool.d, o = i * F;
    d[o + T] = 0; d[o + LIFE] = b.life; d[o + DELAY] = b.delay;
    d[o + PX] = b.x; d[o + PY] = b.y; d[o + PZ] = b.z;
    d[o + VX] = b.vx; d[o + VY] = b.vy; d[o + VZ] = b.vz; d[o + GRAV] = b.grav; d[o + DRAG] = b.drag;
    d[o + YAW] = b.yaw; d[o + PIT] = b.pitch; d[o + ROL] = b.roll;
    d[o + DYAW] = b.dyaw; d[o + DPIT] = b.dpitch; d[o + DROL] = b.droll;
    d[o + S0] = b.sx0; d[o + S0 + 1] = b.sy0; d[o + S0 + 2] = b.sz0;
    d[o + S1] = b.sx1; d[o + S1 + 1] = b.sy1; d[o + S1 + 2] = b.sz1;
    d[o + EASE] = b.ease; d[o + FIN] = b.fadeIn; d[o + FOUT] = b.fadeOut;
    const c = pool.c, oc = i * 4;
    c[oc] = b.r * b.k; c[oc + 1] = b.g * b.k; c[oc + 2] = b.b * b.k; c[oc + 3] = 1;
    pool.flick[i] = b.flicker;
    this.emitted++;
    return i;
  }

  /** Alles sofort beenden (Szenenwechsel) */
  clear() {
    for (const p of FX_PRIMS) { const pool = this.pools[p]; pool.n = 0; for (const m of pool.meshes) { m.count = 0; m.visible = false; } }
  }

  /**
   * Lage eines Teils ausrichten: 1 = zur Kamera (Drehung um die Blickachse = roll), 2 = lokale y-Achse entlang der Flugbahn, Fläche zur
   * Kamera, 3 = lokale y-Achse entlang der Euler-Richtung (yaw/pitch), um sie zur Kamera gedreht. Schreibt `_mx` (ohne neue Objekte).
   */
  private orient(bb: number, d: Float32Array, o: number) {
    const cam = this.cam!;
    if (bb === 1) {
      _qr.setFromAxisAngle(_z, d[o + ROL]);
      _q.copy(cam.quaternion).multiply(_qr);
      _mx.compose(_p, _q, _s);
      return;
    }
    if (bb === 2) {
      _ay.set(d[o + VX], d[o + VY], d[o + VZ]);
      if (_ay.lengthSq() < 1e-6) _ay.set(0, 1, 0); else _ay.normalize();
    } else {
      const yaw = d[o + YAW], pit = d[o + PIT];
      _ay.set(Math.sin(pit) * Math.sin(yaw), Math.cos(pit), Math.sin(pit) * Math.cos(yaw));
    }
    _az.copy(cam.position).sub(_p);
    _ax.crossVectors(_ay, _az);
    if (_ax.lengthSq() < 1e-8) _ax.set(1, 0, 0).cross(_ay);
    _ax.normalize();
    _az.crossVectors(_ax, _ay);
    const e = _mx.elements;
    e[0] = _ax.x * _s.x; e[1] = _ax.y * _s.x; e[2] = _ax.z * _s.x; e[3] = 0;
    e[4] = _ay.x * _s.y; e[5] = _ay.y * _s.y; e[6] = _ay.z * _s.y; e[7] = 0;
    e[8] = _az.x * _s.z; e[9] = _az.y * _s.z; e[10] = _az.z * _s.z; e[11] = 0;
    e[12] = _p.x; e[13] = _p.y; e[14] = _p.z; e[15] = 1;
  }

  /** Je Bild (Spielzeit) */
  update(dt: number) {
    const step = Math.max(0, Math.min(0.1, dt));
    advanceVfxScroll(step);
    for (const p of FX_PRIMS) {
      const pool = this.pools[p];
      const meshes = pool.meshes, nm = meshes.length;
      if (pool.n === 0) { for (const m of meshes) if (m.visible) { m.visible = false; m.count = 0; } continue; }
      const d = pool.d, c = pool.c;
      const bb = this.cam ? pool.bb : 0;
      for (let k = 0; k < nm; k++) _cnt[k] = 0;
      let w = 0;
      for (let i = 0; i < pool.n; i++) {
        const o = i * F;
        if (d[o + DELAY] > 0) { d[o + DELAY] -= step; }
        else d[o + T] += step;
        const life = d[o + LIFE];
        if (d[o + T] >= life) continue; // ausgelaufen: nicht übernehmen
        const u = d[o + T] / life;
        if (d[o + DELAY] <= 0) {
          const drag = d[o + DRAG] > 0 ? Math.exp(-d[o + DRAG] * step) : 1;
          d[o + VX] *= drag; d[o + VZ] *= drag; d[o + VY] = d[o + VY] * drag - d[o + GRAV] * step;
          d[o + PX] += d[o + VX] * step; d[o + PY] += d[o + VY] * step; d[o + PZ] += d[o + VZ] * step;
          d[o + YAW] += d[o + DYAW] * step; d[o + PIT] += d[o + DPIT] * step; d[o + ROL] += d[o + DROL] * step;
        }
        // nach vorn zusammenschieben (Platz w), damit die Instanzen lückenlos bleiben
        if (w !== i) {
          d.copyWithin(w * F, o, o + F);
          c.copyWithin(w * 4, i * 4, i * 4 + 4);
          pool.flick[w] = pool.flick[i];
        }
        const ow = w * F;
        w++;
        const sk = d[ow + DELAY] > 0 ? 0 : 1;
        const fin = d[ow + FIN], fout = d[ow + FOUT];
        let f = (fin > 0 ? Math.min(1, u / fin) : 1) * (fout > 0 ? Math.min(1, (1 - u) / fout) : 1) * sk;
        // Ziel-Netz: dunkle Mäntel blenden über Deckkraft-Stufen aus, alles andere über die Farbe
        let mi = 0;
        if (pool.ink) {
          mi = f >= INK_CUT[0] ? 0 : f >= INK_CUT[1] ? 1 : f >= INK_CUT[2] ? 2 : f >= INK_CUT[3] ? 3 : -1;
          if (mi < 0) continue;
          f = 1;
        }
        const m = meshes[mi];
        const slot = _cnt[mi]++;
        const e = d[ow + EASE] > 0 ? 1 - (1 - u) * (1 - u) : u;
        _s.set(
          (d[ow + S0] + (d[ow + S1] - d[ow + S0]) * e) * sk || 1e-5,
          (d[ow + S0 + 1] + (d[ow + S1 + 1] - d[ow + S0 + 1]) * e) * sk || 1e-5,
          (d[ow + S0 + 2] + (d[ow + S1 + 2] - d[ow + S0 + 2]) * e) * sk || 1e-5,
        );
        _p.set(d[ow + PX], d[ow + PY], d[ow + PZ]);
        if (bb) this.orient(bb, d, ow);
        else {
          _e.set(d[ow + PIT], d[ow + YAW], d[ow + ROL], 'YXZ');
          _q.setFromEuler(_e);
          _mx.compose(_p, _q, _s);
        }
        m.setMatrixAt(slot, _mx);
        const fl = pool.flick[w - 1];
        if (fl > 0 && !pool.ink) f *= 1 - fl + fl * (0.5 + 0.5 * Math.sin((d[ow + T] + w * 0.37) * 47));
        // vor der Linse: kleine leuchtende Teile blenden aus (Abstand zur Kamera minus halbe Größe)
        if (pool.add && this.cam && this.lensNear > 0) {
          const sz = Math.max(_s.x, _s.y, _s.z);
          if (sz < 3) {
            const cp = this.cam.position;
            const dn = Math.hypot(_p.x - cp.x, _p.y - cp.y, _p.z - cp.z) - sz * 0.5;
            if (dn < this.lensNear) { const k = Math.max(0, (dn - 0.3) / (this.lensNear - 0.3)); f *= k * k * (3 - 2 * k); }
          }
        }
        const col = m.instanceColor!.array as Float32Array;
        col[slot * 3] = c[(w - 1) * 4] * f; col[slot * 3 + 1] = c[(w - 1) * 4 + 1] * f; col[slot * 3 + 2] = c[(w - 1) * 4 + 2] * f;
      }
      pool.n = w;
      for (let k = 0; k < nm; k++) {
        const m = meshes[k], cnt = _cnt[k];
        m.count = cnt;
        m.visible = cnt > 0;
        if (!cnt) continue;
        // nur den belegten Teil hochladen (bei großen Pools spart das den Großteil der Übertragung)
        m.instanceMatrix.clearUpdateRanges();
        m.instanceMatrix.addUpdateRange(0, cnt * 16);
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor!.clearUpdateRanges();
        m.instanceColor!.addUpdateRange(0, cnt * 3);
        m.instanceColor!.needsUpdate = true;
      }
    }
  }

  /**
   * Für das Vorwärmen der Shader: je Grundform ein unsichtbar kleines Teil weit unter dem Meer (ohne Ein- und Ausblenden, also voll
   * sichtbar). Alle durchscheinenden Schichten teilen sich ein Programm, die Deckkraft-Stufen der Mäntel sind nur Uniform-Werte.
   */
  prewarm(x: number, z: number) {
    const b = this.brush;
    for (const p of FX_PRIMS) { b.reset().at(x, -2000, z).size(0.01, 0.01, 0.01).span(0.5).fade(0, 0); this.emit(p); }
    this.update(0.001);
  }

  dispose() {
    this.group.removeFromParent();
    for (const p of FX_PRIMS) for (const m of this.pools[p].meshes) m.dispose();
  }
}
