// Meeresströmungen – „Windstraßen“ (Phase 4.3C). Rein, deterministisch, ohne three.js: Bänder zwischen den Handels-Archipelen der Ringe 1 – 3,
// die um Inseln herumgeführt werden, und eine allokationsfreie Abfrage „welche Strömung liegt hier?“. Wer in Strömungsrichtung segelt, bekommt
// bis zu +35 % Fahrt (`CURRENT_BOOST`). Die Daten (Bänder) sind JSON; Darstellung (Schaumlinien) in world/worldEventView.ts, Wirkung in
// `Ship.flowK` (Spieler über SeaWorld, KI über NavalSystem).
import { CURRENT_BOOST, CURRENT_LANES, type CurrentLaneDef } from '../data/seaEvents';
import { ISLAND_REACH } from '../data/regions';
import { SpatialGrid } from './worldGrid';
import { smoothstep } from '../core/mathUtil';

export interface LaneIsland { id: string; x: number; z: number; r: number }

/** Ein fertiges Strömungsband: Mittellinie in gleichmäßigen Schritten (flach x, z, x, z …), Bogenlänge je Punkt, Breite */
export interface CurrentLane {
  id: string;
  name: string;
  from: string;
  to: string;
  width: number;
  /** Tiefsee-Strömung zwischen den äußeren Ringen (4.5C) */
  deep: boolean;
  pts: number[];
  /** Bogenlänge (m) bis zu jedem Punkt */
  s: number[];
  length: number;
}

/** Abstand der Punkte der fertigen Mittellinie (m) */
export const LANE_STEP = 30;
/** Freiraum der Bandkante zur Küste (m über dem Platzbedarf `r · ISLAND_REACH`) */
export const LANE_CLEAR = 60;
/** Strömung baut sich an den Enden auf und ab (m) */
const END_FADE = 160;

const clearOf = (i: LaneIsland, width: number) => i.r * ISLAND_REACH + LANE_CLEAR + width * 0.5;

/**
 * Mittellinie eines Bandes: Start und Ende liegen vor den beiden Häfen (in Richtung des anderen Hafens, außerhalb ihres Platzbedarfs), dazwischen
 * wird die gerade Linie so lange von Inseln weggedrückt und geglättet, bis überall der Freiraum stimmt. Deterministisch (keine Zufallszahlen).
 */
export function buildLane(def: CurrentLaneDef, islands: readonly LaneIsland[]): CurrentLane | null {
  const A = islands.find((i) => i.id === def.from), B = islands.find((i) => i.id === def.to);
  if (!A || !B) return null;
  const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz) || 1;
  const ux = dx / d, uz = dz / d;
  const a0 = clearOf(A, def.width) + 20, b0 = clearOf(B, def.width) + 20;
  const ax = A.x + ux * a0, az = A.z + uz * a0, bx = B.x - ux * b0, bz = B.z - uz * b0;
  const len = Math.hypot(bx - ax, bz - az);
  // Nur die Inseln in Reichweite des Korridors zählen
  const near = islands.filter((i) => distSeg(i.x, i.z, ax, az, bx, bz) < clearOf(i, def.width) + len * 0.45).map((i) => ({ x: i.x, z: i.z, c: clearOf(i, def.width) }));
  const { xs, zs } = routeAround(ax, az, bx, bz, near, 40);
  const n = xs.length - 1;
  // gleichmäßig neu abtasten
  const pts: number[] = [], s: number[] = [];
  let acc = 0, next = 0;
  pts.push(xs[0], zs[0]); s.push(0);
  for (let k = 1; k <= n; k++) {
    const sx = xs[k - 1], sz = zs[k - 1], ex = xs[k], ez = zs[k];
    const segL = Math.hypot(ex - sx, ez - sz);
    while (next + LANE_STEP <= acc + segL) {
      next += LANE_STEP;
      const t = (next - acc) / segL;
      pts.push(sx + (ex - sx) * t, sz + (ez - sz) * t); s.push(next);
    }
    acc += segL;
  }
  if (acc - next > 1) { pts.push(xs[n], zs[n]); s.push(acc); }
  return { id: def.id, name: def.name, from: def.from, to: def.to, width: def.width, deep: !!def.deep, pts, s, length: s[s.length - 1] };
}

/** Hindernis für Routen: Mitte und Freiraum (m) */
export interface RouteObstacle { x: number; z: number; c: number }

/**
 * Weg von A nach B um Hindernisse herum (Inseln mit ihrem Freiraum): die gerade Linie in Schritten von `step` Metern wird so lange von den
 * Hindernissen weggedrückt und geglättet, bis überall der Freiraum stimmt (Start und Ende bleiben). Deterministisch, ohne Zufall: dieselbe
 * Rechnung nutzen die Strömungsbänder und die Routen der Konvois und Schatzschiffe.
 */
export function routeAround(ax: number, az: number, bx: number, bz: number, obstacles: readonly RouteObstacle[], step = 40): { xs: number[]; zs: number[] } {
  const len = Math.hypot(bx - ax, bz - az);
  const ux = len > 0 ? (bx - ax) / len : 0, uz = len > 0 ? (bz - az) / len : 1;
  const n = Math.max(3, Math.ceil(len / step));
  const xs: number[] = [], zs: number[] = [];
  for (let k = 0; k <= n; k++) { xs.push(ax + (bx - ax) * (k / n)); zs.push(az + (bz - az) * (k / n)); }
  const near = obstacles.filter((o) => distSeg(o.x, o.z, ax, az, bx, bz) < o.c + len * 0.5);
  const push = () => {
    for (let k = 1; k < n; k++) {
      for (const o of near) {
        let px = xs[k] - o.x, pz = zs[k] - o.z;
        let r = Math.hypot(px, pz);
        if (r >= o.c) continue;
        // genau durch die Mitte: nach rechts der Fahrtrichtung ausweichen (fest, kein Zufall)
        if (r < 1e-3) { px = uz; pz = -ux; r = 1; }
        xs[k] = o.x + (px / r) * o.c; zs[k] = o.z + (pz / r) * o.c;
      }
    }
  };
  for (let it = 0; it < 80; it++) {
    push();
    for (let k = 1; k < n; k++) { xs[k] = xs[k] * 0.5 + (xs[k - 1] + xs[k + 1]) * 0.25; zs[k] = zs[k] * 0.5 + (zs[k - 1] + zs[k + 1]) * 0.25; }
  }
  for (let it = 0; it < 6; it++) push();
  return { xs, zs };
}

/** Alle Bänder der Welt aus den Daten (`CURRENT_LANES`) und den Inseln */
export function buildCurrentLanes(islands: readonly LaneIsland[], defs: readonly CurrentLaneDef[] = CURRENT_LANES): CurrentLane[] {
  const out: CurrentLane[] = [];
  for (const d of defs) { const l = buildLane(d, islands); if (l) out.push(l); }
  return out;
}

function distSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L2)) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

// ---------- Abfrage ----------

/** Ergebnis einer Abfrage: Stärke 0 … 1 (1 = Kern des Bandes), Fließrichtung (Einheitsvektor) und Kurs der Strömung, Band und Lage darauf */
export interface CurrentSample {
  strength: number;
  dirX: number;
  dirZ: number;
  /** Kurs der Strömung (wie `Ship.heading`: x += sin, z += cos) */
  heading: number;
  /** Nummer des Bandes (−1 = keins) und Bogenlänge auf ihm (m) */
  lane: number;
  along: number;
}

export const newCurrentSample = (): CurrentSample => ({ strength: 0, dirX: 0, dirZ: 1, heading: 0, lane: -1, along: 0 });

/**
 * Fahrtfaktor durch eine Strömung (1 … 1 + `CURRENT_BOOST`): voll im Kern des Bandes und auf Kurs (Abweichung bis etwa 20°), weich weniger bis
 * 57° Abweichung, quer oder gegen die Strömung kein Bonus.
 */
export function currentBoost(heading: number, c: CurrentSample): number {
  if (c.strength <= 0) return 1;
  const cos = Math.sin(heading) * c.dirX + Math.cos(heading) * c.dirZ;
  return 1 + CURRENT_BOOST * c.strength * smoothstep(0.55, 0.94, cos);
}

/**
 * Feld aller Strömungen mit Raster: jedes Segment trägt sich mit seiner halben Länge plus halber Breite ins Raster ein; eine Abfrage liest nur die
 * Zelle unter dem Punkt und prüft die Segmente darin genau. Keine Zuweisung je Abfrage (eigene Arbeitsliste).
 */
export class CurrentField {
  private readonly grid = new SpatialGrid(500);
  /** je Segment: Band, Punktindex (Anfang) */
  private readonly segLane: number[] = [];
  private readonly segIdx: number[] = [];
  private readonly hits: number[] = [];

  constructor(readonly lanes: readonly CurrentLane[]) {
    lanes.forEach((l, li) => {
      for (let k = 0; k + 1 < l.pts.length / 2; k++) {
        const ax = l.pts[k * 2], az = l.pts[k * 2 + 1], bx = l.pts[k * 2 + 2], bz = l.pts[k * 2 + 3];
        this.grid.add((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) / 2 + l.width / 2);
        this.segLane.push(li); this.segIdx.push(k);
      }
    });
  }

  get segments(): number { return this.segLane.length; }

  /** Strömung an (x, z) in `out` (ohne Strömung: Stärke 0, Band −1) */
  sample(x: number, z: number, out: CurrentSample): CurrentSample {
    out.strength = 0; out.lane = -1; out.along = 0;
    const n = this.grid.query(x, z, 0, this.hits);
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      const sid = this.hits[j];
      const l = this.lanes[this.segLane[sid]], k = this.segIdx[sid];
      const ax = l.pts[k * 2], az = l.pts[k * 2 + 1], bx = l.pts[k * 2 + 2], bz = l.pts[k * 2 + 3];
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
      if (L2 <= 0) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
      const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
      const hw = l.width * 0.5;
      if (d >= hw || d >= best) continue;
      best = d;
      const L = Math.sqrt(L2);
      const along = l.s[k] + t * L;
      // Kern bis 55 % der halben Breite voll, zur Kante weich auf 0; an den Enden baut sich die Strömung auf und ab
      const across = 1 - smoothstep(0.55, 1, d / hw);
      const ends = smoothstep(0, END_FADE, along) * smoothstep(0, END_FADE, l.length - along);
      out.strength = across * ends;
      out.dirX = vx / L; out.dirZ = vz / L;
      out.heading = Math.atan2(out.dirX, out.dirZ);
      out.lane = this.segLane[sid];
      out.along = along;
    }
    return out;
  }
}
