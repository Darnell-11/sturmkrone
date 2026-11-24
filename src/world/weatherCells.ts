// Wandernde Wetterzellen (Phase 4.3C): Gewitterfronten, Nebelbänke und Flauten ziehen langsam über die Sektoren und ersetzen das einheitliche
// Globalwetter. Rein, deterministisch, JSON-tauglich (Zustand steht in `WorldEventState.cells`); die Darstellung (Wolkentürme, Nebelwände) baut
// world/worldEventView.ts, die Wirkung auf Himmel, Seegang, Wind und Sicht mischt `Weather.cell` ein (world/weather.ts).
import { WEATHER_CELL_DEFS, WEATHER_CELLS, type CellParams, type WeatherCellKind } from '../data/seaEvents';
import { smoothstep } from '../core/mathUtil';

export interface WeatherCell {
  id: string;
  kind: WeatherCellKind;
  x: number;
  z: number;
  r: number;
  /** Zug (m/s, Weltachsen) */
  vx: number;
  vz: number;
  /** Alter und Lebensdauer (s): blendet über `WEATHER_CELLS.fade` ein und aus */
  age: number;
  life: number;
  /** Zelle eines Weltbosses: zieht mit ihm, statt selbst zu wandern, und lebt, solange er lebt */
  bossEventId?: string;
}

/** Stärke einer Zelle an (x, z): 1 im Kern (`WEATHER_CELLS.core` des Radius), weich auf 0 am Rand; beim Entstehen und Vergehen eingeblendet */
export function cellWeight(c: WeatherCell, x: number, z: number): number {
  const d = Math.hypot(x - c.x, z - c.z);
  if (d >= c.r) return 0;
  const space = 1 - smoothstep(c.r * WEATHER_CELLS.core, c.r, d);
  const life = c.bossEventId ? Math.min(1, c.age / WEATHER_CELLS.fade) : Math.min(1, c.age / WEATHER_CELLS.fade, (c.life - c.age) / WEATHER_CELLS.fade);
  return space * Math.max(0, life);
}

export interface CellSample { cell: WeatherCell | null; k: number }
export const newCellSample = (): CellSample => ({ cell: null, k: 0 });

/** Die stärkste Zelle an (x, z) */
export function strongestCell(cells: readonly WeatherCell[], x: number, z: number, out: CellSample): CellSample {
  out.cell = null; out.k = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const k = cellWeight(c, x, z);
    if (k > out.k) { out.k = k; out.cell = c; }
  }
  return out;
}

/** Wetterwerte einer Zellenart (Kern) */
export const cellParams = (kind: WeatherCellKind): CellParams => WEATHER_CELL_DEFS[kind].params;

/** Faktor auf die Fahrt an (x, z): Flauten bremsen (im Kern auf `speedK`), Gewitter kaum */
export function cellSpeedK(s: CellSample): number {
  if (!s.cell || s.k <= 0) return 1;
  return 1 + (WEATHER_CELL_DEFS[s.cell.kind].speedK - 1) * s.k;
}

/** Faktor auf die Sichtweite der KI (Nebel: man entdeckt einander spät) */
export function cellSightK(s: CellSample): number {
  if (!s.cell || s.k <= 0) return 1;
  return 1 + (WEATHER_CELL_DEFS[s.cell.kind].sightK - 1) * s.k;
}

/** Zellen ziehen lassen und altern; liefert die Zahl der abgelaufenen (sie werden aus der Liste entfernt) */
export function stepCells(cells: WeatherCell[], dt: number): number {
  let gone = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    c.age += dt;
    if (!c.bossEventId) { c.x += c.vx * dt; c.z += c.vz * dt; }
    if (!c.bossEventId && c.age >= c.life) { cells.splice(i, 1); gone++; }
  }
  return gone;
}
