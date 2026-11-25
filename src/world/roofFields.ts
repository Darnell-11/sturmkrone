// Phase 4.6H – begehbare Dächer, Wehrgänge und Zinnen.
//
// Bis 4.6G waren alle Bauten flache Kollider ohne Höhe: die Figur prallte an jeder Hauswand ab, Dächer und Festungsmauern blieben Kulisse
// (Offenpunkt 4.6A). Jetzt bekommt jedes Blender-Bauwerk ein **Dachfeld**: ein Höhenraster seiner obersten Flächen (Dachschrägen, First,
// Schornsteine, Wehrgang, Zinnen, Turmplattformen) im Objektraum, einmal je Modell gerechnet und geteilt. Aufgestellt wird es als `Roof`
// (Ort, Sockelhöhe, Drehung, Maßstab). Der Boden (`IslandGround`) wertet es nur für Läufer MIT Höhenhinweis aus (Spielfigur):
//  - Höhe: die höchste Dachfläche, deren Oberkante höchstens `ROOF.step` über den Füßen liegt, sonst der Boden darunter;
//  - Kollision: die Wände eines Baus sperren nur unterhalb seiner Traufe (`Blocker.top`); wer oben steht, läuft frei – Schornsteine, Zinnen und
//    höhere Dachteile wirken dort selbst als Wand (`roofWall`).
// Rein: ohne three.js-Szene (nur Punktdaten), ohne Zufall; keine Speicheranforderung je Abfrage.

/** Abstimmung der Dachfelder */
export const ROOF = {
  /** Zellgröße des Rasters (m) */
  cell: 0.25,
  /** Höchste Kante, die ein Läufer ohne Sprung nimmt bzw. in der Luft mitnimmt (gleich `ACTION_TUNING.stepUp`) */
  step: 0.55,
  /** Glatt abtasten (bilinear), wenn die vier Nachbarn höchstens so weit auseinanderliegen; sonst die nächste Zelle (Zinnen bleiben kantig) */
  smooth: 0.3,
  /** Rollen ohne Standfläche: Tuch, Taue, Laub, Blumen, Licht, Glas, Obst */
  skipRoles: ['cloth', 'cloth2', 'rope', 'greenery', 'flower', 'light', 'lantern', 'glass', 'fruit1', 'fruit2', 'fruit3', 'flame', 'ember'] as readonly string[],
} as const;

/** Höhenraster eines Modells (Objektraum: +Y oben); `h` je Zelle (Zeile = z), NaN = keine Fläche */
export interface RoofField {
  x0: number; z0: number; cell: number; nx: number; nz: number;
  h: Float32Array;
  /** höchste und niedrigste belegte Zelle */
  top: number; low: number;
}

/** Aufgestelltes Dachfeld (Weltkoordinaten): Ursprung und Sockelhöhe, Drehung um y (wie `rotation.y`), Maßstab je Achse, Umkreis */
export interface Roof {
  f: RoofField;
  x: number; y: number; z: number; yaw: number;
  sx: number; sy: number; sz: number;
  /** cos/sin der Drehung, Umkreis (m) um (x, z) */
  c: number; s: number; r: number;
  /** Traufe: niedrigste Oberkante über den Wand-Kollidern dieses Baus (Welt); ab hier gelten die inneren Dachwände */
  eave: number;
}

/** Punktdaten wie bei three.js (`BufferGeometry`): Lage und optional Dreiecksliste */
export interface GeoLike {
  getAttribute(name: 'position'): { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number };
  index: { count: number; getX(i: number): number } | null;
}

/**
 * Dachfeld aus Netzen (Objektraum). Jedes Dreieck schreibt in jede Zellmitte, die es im Grundriss überdeckt, seine Höhe dort – das Maximum
 * bleibt (die oberste Fläche). Senkrechte Dreiecke (Wände) haben keine Grundfläche und zählen nicht. null ohne Flächen.
 */
export function buildRoofField(parts: readonly { geo: GeoLike; role: string }[], cell: number = ROOF.cell): RoofField | null {
  let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
  const use = parts.filter((p) => !ROOF.skipRoles.includes(p.role));
  for (const p of use) {
    const pos = p.geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (z < mnz) mnz = z; if (z > mxz) mxz = z;
    }
  }
  if (!(mxx > mnx) || !(mxz > mnz)) return null;
  const x0 = mnx - cell, z0 = mnz - cell;
  const nx = Math.ceil((mxx - mnx) / cell) + 2, nz = Math.ceil((mxz - mnz) / cell) + 2;
  const h = new Float32Array(nx * nz).fill(Number.NEGATIVE_INFINITY);
  for (const p of use) {
    const pos = p.geo.getAttribute('position'), idx = p.geo.index;
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
      const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
      const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
      const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);
      // Grundfläche (doppelt, mit Vorzeichen); senkrechte Flächen überspringen
      const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(den) < 1e-7) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cell - 0.5)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / cell - 0.5));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / cell - 0.5)), j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - z0) / cell - 0.5));
      for (let j = j0; j <= j1; j++) {
        const pz = z0 + (j + 0.5) * cell;
        for (let i = i0; i <= i1; i++) {
          const px = x0 + (i + 0.5) * cell;
          const w1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den;
          const w2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den;
          const w3 = 1 - w1 - w2;
          if (w1 < -1e-4 || w2 < -1e-4 || w3 < -1e-4) continue;
          const y = w1 * ay + w2 * by + w3 * cy;
          const k = j * nx + i;
          if (y > h[k]) h[k] = y;
        }
      }
    }
  }
  let top = -Infinity, low = Infinity;
  for (let k = 0; k < h.length; k++) {
    if (h[k] === Number.NEGATIVE_INFINITY) { h[k] = NaN; continue; }
    if (h[k] > top) top = h[k];
    if (h[k] < low) low = h[k];
  }
  if (!(top > -Infinity)) return null;
  return { x0, z0, cell, nx, nz, h, top, low };
}

/** Dachfeld aufstellen (Welt): Ort und Sockelhöhe des Bauwerks, Drehung, Maßstab (Mauerstücke werden in x gestreckt) */
export function placeRoof(f: RoofField, x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, sz = 1): Roof {
  const ex = Math.max(Math.abs(f.x0), Math.abs(f.x0 + f.nx * f.cell)) * Math.abs(sx);
  const ez = Math.max(Math.abs(f.z0), Math.abs(f.z0 + f.nz * f.cell)) * Math.abs(sz);
  return { f, x, y, z, yaw, sx, sy, sz, c: Math.cos(yaw), s: Math.sin(yaw), r: Math.hypot(ex, ez), eave: y + f.low * sy };
}

const nearest = (f: RoofField, i: number, j: number): number => (i < 0 || j < 0 || i >= f.nx || j >= f.nz ? NaN : f.h[j * f.nx + i]);

/**
 * Oberkante des Dachs bei (x, z) in Weltkoordinaten (NaN = dort keine Fläche). Glatte Flächen (Dachschrägen) bilinear, Kanten (Zinnen,
 * Traufe, Schornstein) aus der nächsten Zelle – so bleibt jede Stufe eine Stufe.
 */
export function roofHeight(r: Roof, x: number, z: number): number {
  const dx = x - r.x, dz = z - r.z;
  if (dx * dx + dz * dz > r.r * r.r) return NaN;
  const f = r.f;
  // Welt → Objektraum (Umkehrung von wx = ox·c + oz·s, wz = −ox·s + oz·c), dann der Maßstab
  const ox = (dx * r.c - dz * r.s) / r.sx, oz = (dx * r.s + dz * r.c) / r.sz;
  const u = (ox - f.x0) / f.cell - 0.5, v = (oz - f.z0) / f.cell - 0.5;
  const i = Math.floor(u), j = Math.floor(v);
  const fu = u - i, fv = v - j;
  const a = nearest(f, i, j), b = nearest(f, i + 1, j), c = nearest(f, i, j + 1), d = nearest(f, i + 1, j + 1);
  let h: number;
  if (a === a && b === b && c === c && d === d && Math.max(a, b, c, d) - Math.min(a, b, c, d) <= ROOF.smooth) {
    h = (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
  } else {
    h = nearest(f, Math.round(u), Math.round(v));
  }
  return h === h ? r.y + h * r.sy : NaN;
}

/**
 * Niedrigste Oberkante des Dachs über einem Rechteck (Welt: Mitte, halbe Breite/Tiefe, Drehung) bzw. einem Kreis (hw = hd = Radius, rund):
 * die Traufe über einer Wand. Abgetastet im Raster des Felds; NaN, wenn keine Fläche darüber liegt.
 */
export function roofMinOver(r: Roof, bx: number, bz: number, hw: number, hd: number, yaw: number, round = false): number {
  const step = r.f.cell;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let mn = Infinity;
  // etwas innerhalb des Kolliders abtasten: die Traufe steht über der Wand, nicht neben ihr
  const iw = Math.max(0, hw - step), id = Math.max(0, hd - step);
  for (let lz = -id; lz <= id + 1e-6; lz += step) {
    for (let lx = -iw; lx <= iw + 1e-6; lx += step) {
      if (round && lx * lx + lz * lz > iw * iw) continue;
      const wx = bx + lx * c + lz * s, wz = bz - lx * s + lz * c;
      const y = roofHeight(r, wx, wz);
      if (y === y && y < mn) mn = y;
    }
  }
  return mn < Infinity ? mn : NaN;
}

const RING = 12;
const RING_C = Array.from({ length: RING }, (_, k) => Math.cos((k / RING) * Math.PI * 2));
const RING_S = Array.from({ length: RING }, (_, k) => Math.sin((k / RING) * Math.PI * 2));

/**
 * Innere Dachwand (Schornstein, Zinne, höheres Dachteil): liegt die Oberkante bei (x, z) mehr als `ROOF.step` über den Füßen (y), schiebt die
 * Figur auf den nächsten Punkt in Ringen um (x, z), an dem sie stehen kann (Dach in Stufenhöhe oder kein Dach mehr). Schreibt das Ergebnis
 * in `out` und gibt true zurück, wenn geschoben wurde.
 */
export function roofWall(r: Roof, x: number, z: number, y: number, out: { x: number; z: number }): boolean {
  const h0 = roofHeight(r, x, z);
  if (!(h0 === h0) || h0 <= y + ROOF.step) return false;
  for (let ring = 1; ring <= 6; ring++) {
    const d = ring * 0.15;
    for (let k = 0; k < RING; k++) {
      const px = x + RING_C[k] * d, pz = z + RING_S[k] * d;
      const h = roofHeight(r, px, pz);
      if (!(h === h) || h <= y + ROOF.step) { out.x = px; out.z = pz; return true; }
    }
  }
  return false;
}
