/**
 * Sicht-Raster (Phase 4.6I): ein grobes Zellraster über die Dreiecke einer festen Geometrie, damit die Sichtprüfung der Kino-Kamera Strecken
 * gegen Schiffsmodelle mit zehntausenden Dreiecken in Mikrosekunden testen kann. three.js prüft je Strahl jedes Dreieck eines Netzes, dessen
 * Hüllkugel getroffen ist – an Deck trifft jeder Strahl die Hüllkugeln aller zusammengefassten Schiffsnetze (rund 1,3 ms je Strahl, bis
 * 60 ms je Akt-Wechsel). Hier prüft ein Strahl nur die Zellen, deren Kasten er schneidet.
 *
 * Rein: liest Positions- und Index-Puffer, baut je Geometrie einmal (WeakMap, mit der Geometrie vergessen; ein neuer Puffer oder eine neue
 * Version baut neu, eine Geometrie, die sich laufend ändert, zählt nicht als Hindernis), je Abfrage legt es nichts an.
 */
import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute } from 'three';

/** Kantenlänge einer Zelle (m) und höchstens so viele Zellen je Achse */
export const SIGHT_GRID = { cell: 1.5, maxAxis: 12, maxRebuilds: 2 } as const;

export interface SightGrid {
  /** Positionen (x, y, z je Eckpunkt) mit Abstand `stride` und Versatz `offset` */
  readonly pos: ArrayLike<number>;
  readonly stride: number;
  readonly offset: number;
  /** Index-Puffer (drei Einträge je Dreieck) oder null */
  readonly index: ArrayLike<number> | null;
  /** Dreiecke nach Zellen sortiert (Nummer des Dreiecks) */
  readonly tris: Uint32Array;
  /** je belegter Zelle der Anfang in `tris`, der letzte Eintrag ist das Ende */
  readonly start: Uint32Array;
  /** je belegter Zelle min x, y, z, max x, y, z – lose: umschließt ihre Dreiecke ganz */
  readonly box: Float32Array;
  /** Zahl der belegten Zellen */
  readonly cells: number;
  /** Zahl der Dreiecke */
  readonly triCount: number;
}

interface Entry { grid: SightGrid | null; pos: unknown; posVer: number; idx: unknown; idxVer: number; builds: number }
const CACHE = new WeakMap<BufferGeometry, Entry>();

/** Zahl der gebauten Raster (Prüfung: je Geometrie einmal) */
export const sightGridStats = { builds: 0 };

/** Raster einer Geometrie (gepuffert); null, wenn sie keine Dreiecke hat oder sich laufend ändert */
export function sightGridOf(geo: BufferGeometry): SightGrid | null {
  const pos = geo.getAttribute('position') as BufferAttribute | InterleavedBufferAttribute | undefined;
  if (!pos) return null;
  const idx = geo.index;
  const posVer = (pos as InterleavedBufferAttribute).isInterleavedBufferAttribute ? (pos as InterleavedBufferAttribute).data.version : (pos as BufferAttribute).version;
  const idxVer = idx ? idx.version : 0;
  let e = CACHE.get(geo);
  if (e && e.pos === pos && e.posVer === posVer && e.idx === idx && e.idxVer === idxVer) return e.grid;
  if (e && e.builds > SIGHT_GRID.maxRebuilds) return null;
  const builds = (e?.builds ?? 0) + 1;
  const grid = buildFromGeometry(geo, pos, idx);
  e = { grid, pos, posVer, idx, idxVer, builds };
  CACHE.set(geo, e);
  return grid;
}

function buildFromGeometry(geo: BufferGeometry, pos: BufferAttribute | InterleavedBufferAttribute, idx: BufferAttribute | null): SightGrid | null {
  let arr: ArrayLike<number>, stride: number, offset: number;
  const inter = (pos as InterleavedBufferAttribute).isInterleavedBufferAttribute;
  const raw = inter ? (pos as InterleavedBufferAttribute).data.array : (pos as BufferAttribute).array;
  if (pos.itemSize >= 3 && !pos.normalized && raw instanceof Float32Array) {
    arr = raw;
    stride = inter ? (pos as InterleavedBufferAttribute).data.stride : pos.itemSize;
    offset = inter ? (pos as InterleavedBufferAttribute).offset : 0;
  } else {
    // gepackte oder normalisierte Positionen (komprimierte Modelle): einmal als Gleitkomma auslesen
    const n = pos.count, f = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { f[i * 3] = pos.getX(i); f[i * 3 + 1] = pos.getY(i); f[i * 3 + 2] = pos.getZ(i); }
    arr = f; stride = 3; offset = 0;
  }
  const dr = geo.drawRange;
  const total = idx ? idx.count : pos.count;
  const s0 = Math.max(0, dr.start), s1 = Math.min(total, dr.start + (Number.isFinite(dr.count) ? dr.count : total));
  const first = Math.ceil(s0 / 3), last = Math.floor(s1 / 3);
  return buildSightGrid(arr, stride, offset, idx ? idx.array : null, first, last - first);
}

/**
 * Raster aus rohen Puffern bauen: Dreiecke `first` … `first + count − 1` (Index-Puffer: je drei Einträge; ohne Index: je drei Eckpunkte).
 * Jedes Dreieck kommt in die Zelle seines Schwerpunkts, der Kasten der Zelle wächst um das ganze Dreieck.
 */
export function buildSightGrid(pos: ArrayLike<number>, stride: number, offset: number, index: ArrayLike<number> | null, first: number, count: number): SightGrid | null {
  if (!(count > 0)) return null;
  const vi = (t: number, k: number) => (index ? index[t * 3 + k] : t * 3 + k) * stride + offset;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let t = first; t < first + count; t++) {
    for (let k = 0; k < 3; k++) {
      const o = vi(t, k), x = pos[o], y = pos[o + 1], z = pos[o + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  }
  if (!(x1 >= x0 && y1 >= y0 && z1 >= z0)) return null;
  const C = SIGHT_GRID.cell, M = SIGHT_GRID.maxAxis;
  const nx = Math.max(1, Math.min(M, Math.ceil((x1 - x0) / C))), ny = Math.max(1, Math.min(M, Math.ceil((y1 - y0) / C))), nz = Math.max(1, Math.min(M, Math.ceil((z1 - z0) / C)));
  const sx = nx / Math.max(1e-9, x1 - x0), sy = ny / Math.max(1e-9, y1 - y0), sz = nz / Math.max(1e-9, z1 - z0);
  const N = nx * ny * nz;
  const cellOf = (t: number) => {
    const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2);
    const cx = (pos[a] + pos[b] + pos[c]) / 3, cy = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
    const ix = Math.min(nx - 1, Math.max(0, Math.floor((cx - x0) * sx)));
    const iy = Math.min(ny - 1, Math.max(0, Math.floor((cy - y0) * sy)));
    const iz = Math.min(nz - 1, Math.max(0, Math.floor((cz - z0) * sz)));
    return (iz * ny + iy) * nx + ix;
  };
  const counts = new Uint32Array(N);
  for (let t = first; t < first + count; t++) counts[cellOf(t)]++;
  // belegte Zellen dicht nummerieren
  const dense = new Int32Array(N).fill(-1);
  let cells = 0;
  for (let i = 0; i < N; i++) if (counts[i] > 0) dense[i] = cells++;
  const start = new Uint32Array(cells + 1);
  for (let i = 0, c = 0, acc = 0; i < N; i++) if (counts[i] > 0) { start[c++] = acc; acc += counts[i]; }
  start[cells] = count;
  const cursor = start.slice(0, cells);
  const tris = new Uint32Array(count);
  const box = new Float32Array(cells * 6);
  for (let c = 0; c < cells; c++) { box[c * 6] = box[c * 6 + 1] = box[c * 6 + 2] = Infinity; box[c * 6 + 3] = box[c * 6 + 4] = box[c * 6 + 5] = -Infinity; }
  for (let t = first; t < first + count; t++) {
    const c = dense[cellOf(t)];
    tris[cursor[c]++] = t;
    const b = c * 6;
    for (let k = 0; k < 3; k++) {
      const o = vi(t, k), x = pos[o], y = pos[o + 1], z = pos[o + 2];
      if (x < box[b]) box[b] = x; if (y < box[b + 1]) box[b + 1] = y; if (z < box[b + 2]) box[b + 2] = z;
      if (x > box[b + 3]) box[b + 3] = x; if (y > box[b + 4]) box[b + 4] = y; if (z > box[b + 5]) box[b + 5] = z;
    }
  }
  sightGridStats.builds++;
  return { pos, stride, offset, index, tris, start, box, cells, triCount: count };
}

/** kleinster Wert für Richtungsanteile und Determinanten (darunter: parallel) */
const EPS = 1e-12;

/**
 * Nächster Treffer der Strecke O + t·D mit den Dreiecken für t in [near, far) (beidseitig, D muss nicht normiert sein); Infinity ohne Treffer.
 * Prüft nur Zellen, deren Kasten die Strecke schneidet, und rückt das Ende bei jedem Treffer heran.
 */
export function sightGridHit(g: SightGrid, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, near: number, far: number): number {
  let best = far;
  const { pos, stride, offset, index, tris, start, box } = g;
  const ix = Math.abs(dx) > EPS ? 1 / dx : 0, iy = Math.abs(dy) > EPS ? 1 / dy : 0, iz = Math.abs(dz) > EPS ? 1 / dz : 0;
  for (let c = 0; c < g.cells; c++) {
    const b = c * 6;
    let t0 = near, t1 = best;
    // Platten-Test je Achse (parallel: der Ursprung muss in der Platte liegen)
    if (ix !== 0) {
      let a = (box[b] - ox) * ix, e = (box[b + 3] - ox) * ix;
      if (a > e) { const s = a; a = e; e = s; }
      if (a > t0) t0 = a; if (e < t1) t1 = e;
    } else if (ox < box[b] || ox > box[b + 3]) continue;
    if (t0 > t1) continue;
    if (iy !== 0) {
      let a = (box[b + 1] - oy) * iy, e = (box[b + 4] - oy) * iy;
      if (a > e) { const s = a; a = e; e = s; }
      if (a > t0) t0 = a; if (e < t1) t1 = e;
    } else if (oy < box[b + 1] || oy > box[b + 4]) continue;
    if (t0 > t1) continue;
    if (iz !== 0) {
      let a = (box[b + 2] - oz) * iz, e = (box[b + 5] - oz) * iz;
      if (a > e) { const s = a; a = e; e = s; }
      if (a > t0) t0 = a; if (e < t1) t1 = e;
    } else if (oz < box[b + 2] || oz > box[b + 5]) continue;
    if (t0 > t1) continue;
    for (let k = start[c], k1 = start[c + 1]; k < k1; k++) {
      const t = tris[k];
      const a = (index ? index[t * 3] : t * 3) * stride + offset;
      const p = (index ? index[t * 3 + 1] : t * 3 + 1) * stride + offset;
      const q = (index ? index[t * 3 + 2] : t * 3 + 2) * stride + offset;
      const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
      // Möller–Trumbore
      const e1x = pos[p] - ax, e1y = pos[p + 1] - ay, e1z = pos[p + 2] - az;
      const e2x = pos[q] - ax, e2y = pos[q + 1] - ay, e2z = pos[q + 2] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -EPS && det < EPS) continue;
      const inv = 1 / det;
      const sx = ox - ax, sy = oy - ay, sz = oz - az;
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (tt >= near && tt < best) best = tt;
    }
  }
  return best < far ? best : Infinity;
}

/** Vergleichswert ohne Raster (alle Dreiecke): für Tests */
export function bruteForceHit(pos: ArrayLike<number>, stride: number, offset: number, index: ArrayLike<number> | null, first: number, count: number,
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, near: number, far: number): number {
  const tris = new Uint32Array(count);
  for (let i = 0; i < count; i++) tris[i] = first + i;
  const g: SightGrid = { pos, stride, offset, index, tris, start: Uint32Array.of(0, count), box: Float32Array.of(-Infinity, -Infinity, -Infinity, Infinity, Infinity, Infinity), cells: 1, triCount: count };
  return sightGridHit(g, ox, oy, oz, dx, dy, dz, near, far);
}
