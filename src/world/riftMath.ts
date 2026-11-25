// Rechnung entlang der Spalten der Mega-Inseln (4.3.6), rein und ohne three.js: Länge eines Linienzugs, Punkt und Richtung bei einer Bogenlänge,
// stehengelassene Brückenstellen. Benutzt von world/megaRifts.ts (Aufbau), SeaWorld (Seekarten-Topografie) und den Tests.
import type { RiftDef } from '../data/settlements';

/** Halbe Breite der stehengelassenen Brückenstelle entlang der Spalte (Brücke 4,6 m breit, etwas Luft) */
export const RIFT_GAP = 3.4;
/** Breite Brücken (Kaiser-Inseln): Öffnung und Fahrbahn so viel breiter */
export const RIFT_WIDE_K = 2;

/** Abstand der Spaltenwand von der Mittellinie: der Aushub (Sohle) reicht genau bis hierhin */
export const riftWallOff = (w: number): number => w / 2 + 0.2;

/** Halbe Breite der Randsperren quer zur Spalte: bis über die Mauerkrone hinaus, damit niemand an den Rand der Spalte hinabsteigt */
export const riftBlockHalf = (w: number): number => w / 2 + 1;

/** Länge eines Linienzugs */
export function polyLength(pts: readonly (readonly [number, number])[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** Punkt und Richtung bei Bogenlänge s (ohne neue Objekte: Ergebnis in `out`) */
export function pointAt(pts: readonly (readonly [number, number])[], s: number, out: { x: number; z: number; dx: number; dz: number }): { x: number; z: number; dx: number; dz: number } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    if (s <= acc + l || i === pts.length - 1) {
      const t = Math.max(0, Math.min(1, (s - acc) / l));
      out.x = ax + (bx - ax) * t; out.z = az + (bz - az) * t; out.dx = (bx - ax) / l; out.dz = (bz - az) / l;
      return out;
    }
    acc += l;
  }
  out.x = pts[0][0]; out.z = pts[0][1]; out.dx = 0; out.dz = 1;
  return out;
}

/** Liegt die Bogenlänge s an einem Übergang (dort bleibt der Boden stehen)? */
export const inCrossing = (rift: Pick<RiftDef, 'cross' | 'wide'>, total: number, s: number): boolean => {
  const gap = rift.wide ? RIFT_GAP * RIFT_WIDE_K : RIFT_GAP;
  for (let k = 0; k < rift.cross.length; k++) if (Math.abs(s - rift.cross[k] * total) < gap) return true;
  return false;
};
