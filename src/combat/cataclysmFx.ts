// Phase 4.6B – Effekt-Baukasten der Kataklysmus-Ultimates und Faji-Künste: vorab angelegte Instanz-Netze (Zero-GC, nichts entsteht im Kampf).
// Grundformen: Energiewand (Bogen), Ring, Lichtsäule, Blitz, Kristall, Kugel, Sichel, Geister-Geschütz, Fels, Wasserwand und ein dunkler Kern.
// Alle teilen EIN Shader-Programm (MeshBasicMaterial mit Instanzfarbe und Eckpunktfarbe, doppelseitig, ohne Nebel): Leuchten entsteht über
// Farben > 1 (Bloom ab Hoch) und additive Mischung, der Fels und der dunkle Kern mischen normal. Ausblenden = Farbe gegen Schwarz.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Euler, Group, IcosahedronGeometry, InstancedBufferAttribute,
  InstancedMesh, Matrix4, MeshBasicMaterial, NormalBlending, Quaternion, Vector3, type Scene,
} from 'three';
import { markShared } from '../render/dispose';

export type FxPrim = 'arc' | 'ring' | 'column' | 'bolt' | 'shard' | 'orb' | 'blade' | 'cannon' | 'rock' | 'wall' | 'void' | 'fist' | 'disc' | 'cloud';
export const FX_PRIMS: readonly FxPrim[] = ['arc', 'ring', 'column', 'bolt', 'shard', 'orb', 'blade', 'cannon', 'rock', 'wall', 'void', 'fist', 'disc', 'cloud'];

/**
 * Plätze je Grundform (4.6C: für die Stürme aus hunderten Fäusten, Sicheln und Splittern deutlich größer). `disc` ist eine feste Scheibe
 * (Eisscholle), `cloud` ein Haufen bauschiger Wolkenballen (Gewitterwolke) – beide undurchsichtig.
 */
export const FX_CAP: Readonly<Record<FxPrim, number>> = {
  arc: 32, ring: 120, column: 72, bolt: 128, shard: 360, orb: 260, blade: 320, cannon: 18, rock: 120, wall: 96, void: 4, fist: 280, disc: 24, cloud: 16,
};
const CAP = FX_CAP;

// ---------- Geometrien (einmal gebaut, geteilt) ----------

function geo(pos: number[], col: number[], idx: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return markShared(g);
}

/** Senkrechte gebogene Energiewand: Bogen ±75° um +Z (Radius 1), Höhe 0 … 1, heller Kern in halber Höhe */
function arcGeo(): BufferGeometry {
  const seg = 40, rows = [0, 0.3, 0.5, 0.7, 1], lum = [0, 0.55, 1.5, 0.55, 0];
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (-75 + (150 * i) / seg) * (Math.PI / 180);
    const edge = Math.sin((Math.PI * i) / seg);
    for (let r = 0; r < rows.length; r++) {
      pos.push(Math.sin(a), rows[r], Math.cos(a));
      const l = lum[r] * (0.35 + 0.65 * edge);
      col.push(l, l, l);
    }
  }
  const R = rows.length;
  for (let i = 0; i < seg; i++) for (let r = 0; r < R - 1; r++) {
    const a = i * R + r, b = a + R;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return geo(pos, col, idx);
}

/** Flacher Ring in der XZ-Ebene (innen 0,72, außen 1), hell in der Mitte des Bands */
function ringGeo(): BufferGeometry {
  const seg = 48, rad = [0.72, 0.86, 1], lum = [0, 1.2, 0];
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    for (let r = 0; r < 3; r++) { pos.push(Math.sin(a) * rad[r], 0, Math.cos(a) * rad[r]); col.push(lum[r], lum[r], lum[r]); }
  }
  for (let i = 0; i < seg; i++) for (let r = 0; r < 2; r++) { const a = i * 3 + r, b = a + 3; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  return geo(pos, col, idx);
}

/** Offene Lichtsäule (Radius 1, Höhe 0 … 1), unten hell, oben ausblendend */
function columnGeo(): BufferGeometry {
  const seg = 20, rows = [0, 0.15, 0.6, 1], lum = [0.6, 1.3, 0.8, 0];
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    for (let r = 0; r < rows.length; r++) { pos.push(Math.sin(a), rows[r], Math.cos(a)); col.push(lum[r], lum[r], lum[r]); }
  }
  const R = rows.length;
  for (let i = 0; i < seg; i++) for (let r = 0; r < R - 1; r++) { const a = i * R + r, b = a + R; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  return geo(pos, col, idx);
}

/** Blitz: Zickzack-Band entlang +Y (0 … 1), zwei gekreuzte Bänder für Volumen, heller Kern */
function boltGeo(): BufferGeometry {
  const pts: [number, number][] = [];
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const n = 14;
  for (let i = 0; i <= n; i++) pts.push([i === 0 || i === n ? 0 : (rnd() - 0.5) * 0.16, i / n]);
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let k = 0; k < 2; k++) {
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const [ox, y] = pts[i];
      const w = 0.012 * (1 - Math.abs(y - 0.5) * 0.8);
      if (k === 0) { pos.push(ox - w, y, 0, ox + w, y, 0); } else { pos.push(ox, y, -w, ox, y, w); }
      col.push(1.6, 1.6, 1.6, 1.6, 1.6, 1.6);
    }
    for (let i = 0; i < n; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
  }
  return geo(pos, col, idx);
}

/** Kristall (Eis, Glas): gestreckter Achtflächner entlang +Y (0 … 1), Spitze hell */
function shardGeo(): BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const ring = 6, mid = 0.28;
  pos.push(0, 0, 0); col.push(0.35, 0.35, 0.35);
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + 0.3;
    const r = i % 2 ? 0.17 : 0.24;
    pos.push(Math.sin(a) * r, mid, Math.cos(a) * r);
    const l = 0.6 + 0.35 * (i % 3) / 2;
    col.push(l, l, l);
  }
  pos.push(0, 1, 0); col.push(1.5, 1.5, 1.5);
  const top = ring + 1;
  for (let i = 0; i < ring; i++) {
    const a = 1 + i, b = 1 + ((i + 1) % ring);
    idx.push(0, b, a, a, b, top);
  }
  return geo(pos, col, idx);
}

/** Kugel (Sonne, Wasser, Kern) */
function orbGeo(): BufferGeometry {
  const g = new IcosahedronGeometry(1, 2);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3).fill(1);
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  return markShared(g);
}

/** Sichel (Mond, Klingenwelle) flach in der XZ-Ebene, Öffnung nach −Z: zeigt nach vorn (+Z), helle Schneide */
function bladeGeo(): BufferGeometry {
  const seg = 28;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const a = (-80 + 160 * u) * (Math.PI / 180);
    const th = Math.sin(Math.PI * u);
    // außen die Schneide (Radius 1), innen eine zweite, verschobene Kurve (Breite in der Mitte ~0,28)
    pos.push(Math.sin(a), 0, Math.cos(a));
    pos.push(Math.sin(a) * (1 - 0.28 * th), 0, Math.cos(a) * (1 - 0.28 * th) - 0.12 * th);
    col.push(1.6 * th + 0.2, 1.6 * th + 0.2, 1.6 * th + 0.2, 0.1, 0.1, 0.1);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
  return geo(pos, col, idx);
}

/** Geister-Geschütz: Rohr entlang +Z (Länge 1) mit Mündungswulst und Lafette */
function cannonGeo(): BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const seg = 12;
  const prof: [number, number, number][] = [[0.13, -0.1, 0.5], [0.16, 0, 0.8], [0.12, 0.25, 0.9], [0.1, 0.85, 1], [0.13, 0.9, 1.4], [0.13, 1, 1.6]];
  for (let p = 0; p < prof.length; p++) {
    const [r, z, l] = prof[p];
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; pos.push(Math.sin(a) * r, Math.cos(a) * r, z); col.push(l, l, l); }
  }
  const R = seg + 1;
  for (let p = 0; p < prof.length - 1; p++) for (let i = 0; i < seg; i++) { const a = p * R + i, b = a + R; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  // Lafette: flacher Kasten unter dem Rohr
  const base = pos.length / 3;
  const bx = 0.2, by0 = -0.26, by1 = -0.12, bz0 = -0.05, bz1 = 0.5;
  const cs: [number, number, number][] = [[-bx, by0, bz0], [bx, by0, bz0], [bx, by1, bz0], [-bx, by1, bz0], [-bx, by0, bz1], [bx, by0, bz1], [bx, by1, bz1], [-bx, by1, bz1]];
  for (const c of cs) { pos.push(...c); col.push(0.5, 0.5, 0.5); }
  const box = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2];
  for (const i of box) idx.push(base + i);
  return geo(pos, col, idx);
}

/** Fels (Erdspalter): unregelmäßiger Block, oben heller (gebackene Schattierung, kein Licht nötig) */
function rockGeo(): BufferGeometry {
  const g = new IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  let s = 11;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // gleiche Ecken (Icosaeder ist nicht indiziert) gleich verschieben: Schlüssel aus der gerundeten Lage
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
  g.computeBoundingSphere();
  return markShared(g);
}

/** Geister-Faust (Sturmfaust-Stakkato): Knöchel nach +Z (Länge ~1), hell an der Schlagfläche */
function fistGeo(): BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, front: number, back: number) => {
    const b = pos.length / 3;
    for (let k = 0; k < 8; k++) {
      const x = cx + (k & 1 ? sx : -sx) * 0.5, y = cy + (k & 2 ? sy : -sy) * 0.5, z = cz + (k & 4 ? sz : -sz) * 0.5;
      pos.push(x, y, z);
      const l = k & 4 ? front : back;
      col.push(l, l, l);
    }
    const f = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3];
    for (const i of f) idx.push(b + i);
  };
  // Handrücken und Handfläche, vier Knöchel, Daumen, Ansatz des Unterarms
  box(0, 0, 0.42, 0.5, 0.36, 0.34, 1.1, 0.6);
  for (let i = 0; i < 4; i++) box(-0.19 + i * 0.127, 0.06 - Math.abs(i - 1.5) * 0.02, 0.66, 0.12, 0.2, 0.16, 1.7, 1.0);
  box(-0.3, -0.08, 0.5, 0.14, 0.16, 0.3, 1.2, 0.7);
  box(0, 0, 0.1, 0.36, 0.3, 0.4, 0.5, 0.15);
  return geo(pos, col, idx);
}

/** Flache Scheibe in der XZ-Ebene (Radius ~1) mit unregelmäßigem Rand: Eisscholle, Wolkendecke; Mitte heller */
function discGeo(seed: number, rim: number): BufferGeometry {
  const seg = 40;
  const pos: number[] = [0, 0, 0], col: number[] = [1, 1, 1], idx: number[] = [];
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const r = 0.86 + rnd() * 0.18 + Math.sin(a * 3 + seed) * 0.04;
    pos.push(Math.sin(a) * r, 0, Math.cos(a) * r);
    col.push(rim, rim, rim);
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + i, 1 + ((i + 1) % seg));
  return geo(pos, col, idx);
}

/**
 * Gewitterwolke (Blitz-Urteil): Haufen bauschiger Ballen (Radius ~1, flache Unterseite bei y ≈ −0,06, Kuppen bis ~0,42).
 * Gebackene Schattierung: Unterseite dunkel, Kuppen hell – von unten bedrohlich, von oben (hohe Kamera) eine echte Wolkendecke statt Scheibe.
 */
function cloudGeo(): BufferGeometry {
  const ball = new IcosahedronGeometry(1, 2);
  const bp = ball.getAttribute('position');
  const pos: number[] = [], col: number[] = [];
  let s = 29;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // Mitte, innerer Ring, äußerer Ring kleiner Ballen
  const puffs: [number, number, number][] = [[0, 0, 0.5]];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + rnd() * 0.4; const r = 0.5 + rnd() * 0.14; puffs.push([Math.sin(a) * r, Math.cos(a) * r, 0.3 + rnd() * 0.12]); }
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + rnd() * 0.5; const r = 0.8 + rnd() * 0.1; puffs.push([Math.sin(a) * r, Math.cos(a) * r, 0.17 + rnd() * 0.08]); }
  for (const [cx, cz, pr] of puffs) {
    const lift = (rnd() - 0.3) * 0.05;
    // gleiche Ecken gleich verbeulen (das Ikosaeder ist nicht indiziert)
    const jit = new Map<string, number>();
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      let j = jit.get(k);
      if (j === undefined) { j = 0.86 + rnd() * 0.24; jit.set(k, j); }
      const py = Math.max(y * 0.72 * pr * j + lift, -0.06);
      pos.push(cx + x * pr * j, py, cz + z * pr * j);
      const l = py <= -0.059 ? 0.3 : 0.42 + 1.05 * Math.min(1, Math.max(0, (py + 0.06) / 0.42)) * (0.75 + 0.25 * Math.max(0, y));
      col.push(l * 0.96, l * 0.98, l * 1.05);
    }
  }
  ball.dispose();
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeBoundingSphere();
  return markShared(g);
}

/** Wasserwand / Gischtvorhang: senkrechte Fläche (Breite 1 entlang X, Höhe 0 … 1), oben zerfasernd */
function wallGeo(): BufferGeometry {
  const seg = 10, rows = [0, 0.5, 0.85, 1], lum = [0.9, 1.1, 0.6, 0];
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const x = i / seg - 0.5;
    const edge = Math.sin(Math.PI * (i / seg));
    for (let r = 0; r < rows.length; r++) {
      const y = rows[r] * (r === rows.length - 1 ? 0.8 + 0.4 * ((i * 37) % 7) / 7 : 1);
      pos.push(x, y, Math.sin(i * 1.7) * 0.04);
      const l = lum[r] * (0.3 + 0.7 * edge);
      col.push(l, l, l);
    }
  }
  const R = rows.length;
  for (let i = 0; i < seg; i++) for (let r = 0; r < R - 1; r++) { const a = i * R + r, b = a + R; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  return geo(pos, col, idx);
}

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

class Pool {
  readonly mesh: InstancedMesh;
  n = 0;
  readonly d: Float32Array;
  readonly c: Float32Array;
  readonly flick: Float32Array;
  constructor(readonly prim: FxPrim, geo: BufferGeometry, mat: MeshBasicMaterial, readonly cap: number) {
    this.mesh = new InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noOutline = true;
    this.mesh.renderOrder = prim === 'rock' || prim === 'void' || prim === 'disc' || prim === 'cloud' ? 0 : 6;
    this.d = new Float32Array(cap * F);
    this.c = new Float32Array(cap * 4);
    this.flick = new Float32Array(cap);
  }
}

const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _p = new Vector3();
const _s = new Vector3();
const _mx = new Matrix4();

/** Effekt-Baukasten: `brush` füllen, `emit(prim)` ausstoßen, je Bild `update(dt)` (Spielzeit: verlangsamt in der Zeitlupe mit) */
export class CataclysmFx {
  readonly group = new Group();
  readonly brush = new FxBrush();
  private readonly pools = {} as Record<FxPrim, Pool>;
  /** ausgestoßene Teile insgesamt (Prüfungen) */
  emitted = 0;
  /** Teilchen-Faktor der Grafikstufe (wie NavalSystem.detail): weniger Kleinkram auf schwachen Geräten */
  detail = 1;

  constructor(scene: Scene) {
    this.group.name = 'cataclysm-fx';
    const add = markShared(new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }));
    const solid = markShared(new MeshBasicMaterial({ vertexColors: true, transparent: false, blending: NormalBlending, depthWrite: true, side: DoubleSide, fog: false }));
    const geos: Record<FxPrim, () => BufferGeometry> = {
      arc: arcGeo, ring: ringGeo, column: columnGeo, bolt: boltGeo, shard: shardGeo, orb: orbGeo, blade: bladeGeo, cannon: cannonGeo, rock: rockGeo, wall: wallGeo, void: orbGeo,
      fist: fistGeo, disc: () => discGeo(17, 0.78), cloud: cloudGeo,
    };
    for (const p of FX_PRIMS) {
      const solidPrim = p === 'rock' || p === 'void' || p === 'disc' || p === 'cloud';
      const pool = new Pool(p, geos[p](), solidPrim ? solid : add, CAP[p]);
      this.pools[p] = pool;
      this.group.add(pool.mesh);
    }
    scene.add(this.group);
  }

  /** Lebende Teile einer Grundform (Prüfungen) */
  count(p: FxPrim): number { return this.pools[p].n; }
  /** Lebende Teile insgesamt */
  get alive(): number { let n = 0; for (const p of FX_PRIMS) n += this.pools[p].n; return n; }

  /** Ausstoßen mit dem aktuellen Pinsel; ist die Grundform voll, ersetzt der neue das älteste Teil */
  emit(p: FxPrim): number {
    const pool = this.pools[p];
    let i = pool.n;
    if (i >= pool.cap) {
      // ältestes (größtes t/LIFE) ersetzen
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
  clear() { for (const p of FX_PRIMS) { const pool = this.pools[p]; pool.n = 0; pool.mesh.count = 0; pool.mesh.visible = false; } }

  /** Je Bild (Spielzeit) */
  update(dt: number) {
    const step = Math.max(0, Math.min(0.1, dt));
    for (const p of FX_PRIMS) {
      const pool = this.pools[p];
      if (pool.n === 0) { if (pool.mesh.visible) { pool.mesh.visible = false; pool.mesh.count = 0; } continue; }
      const d = pool.d, c = pool.c, m = pool.mesh;
      const col = m.instanceColor!.array as Float32Array;
      let w = 0;
      for (let i = 0; i < pool.n; i++) {
        const o = i * F;
        // Verzögerung: steht unsichtbar bereit
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
        const e = d[ow + EASE] > 0 ? 1 - (1 - u) * (1 - u) : u;
        const sk = d[ow + DELAY] > 0 ? 0 : 1;
        _s.set(
          (d[ow + S0] + (d[ow + S1] - d[ow + S0]) * e) * sk || 1e-5,
          (d[ow + S0 + 1] + (d[ow + S1 + 1] - d[ow + S0 + 1]) * e) * sk || 1e-5,
          (d[ow + S0 + 2] + (d[ow + S1 + 2] - d[ow + S0 + 2]) * e) * sk || 1e-5,
        );
        _p.set(d[ow + PX], d[ow + PY], d[ow + PZ]);
        _e.set(d[ow + PIT], d[ow + YAW], d[ow + ROL], 'YXZ');
        _q.setFromEuler(_e);
        _mx.compose(_p, _q, _s);
        m.setMatrixAt(w, _mx);
        const fin = d[ow + FIN], fout = d[ow + FOUT];
        let f = (fin > 0 ? Math.min(1, u / fin) : 1) * (fout > 0 ? Math.min(1, (1 - u) / fout) : 1) * sk;
        const fl = pool.flick[w];
        if (fl > 0) f *= 1 - fl + fl * (0.5 + 0.5 * Math.sin((d[ow + T] + w * 0.37) * 47));
        col[w * 3] = c[w * 4] * f; col[w * 3 + 1] = c[w * 4 + 1] * f; col[w * 3 + 2] = c[w * 4 + 2] * f;
        w++;
      }
      pool.n = w;
      m.count = w;
      m.visible = w > 0;
      // nur den belegten Teil hochladen (bei großen Pools spart das den Großteil der Übertragung)
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0, Math.max(1, w) * 16);
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.clearUpdateRanges();
      m.instanceColor!.addUpdateRange(0, Math.max(1, w) * 3);
      m.instanceColor!.needsUpdate = true;
    }
  }

  /** Für das Vorwärmen der Shader: je Grundform ein unsichtbar kleines Teil weit unter dem Meer */
  prewarm(x: number, z: number) {
    const b = this.brush;
    for (const p of FX_PRIMS) { b.reset().at(x, -2000, z).size(0.01, 0.01, 0.01).span(0.5); this.emit(p); }
    this.update(0.001);
  }

  dispose() {
    this.group.removeFromParent();
    for (const p of FX_PRIMS) this.pools[p].mesh.dispose();
  }
}
