// Die vier konzentrischen Meeres-Ringe der offenen Welt (Phase 4.3B). Reine Daten und Rechnung (ohne three.js, JSON-tauglich).
// Die fünf Kuchenstücke der Mächte (data/factions.ts, je 72°) laufen quer durch alle Ringe; die Ringe bestimmen Gefahr und Charakter des Meeres,
// die Kuchenstücke den Besitz. Die Gefahrenstufen selbst (Meter je Stufe, Gegnerwerte) stehen in data/balanceConfig.ts.
import { DANGER, DANGER_BANDS_M, dangerOfDistance, type DangerTier } from './balanceConfig';
import { PLAYABLE_RADIUS } from './world';

export type RingId = 1 | 2 | 3 | 4;

export interface RingDef {
  ring: RingId;
  name: string;
  /** Abstand vom Weltmittelpunkt in Metern (von einschließlich, bis ausschließlich) */
  from: number;
  to: number;
  /** Gefahrenstufen, die in diesem Ring vorkommen (innen → außen) */
  danger: [DangerTier, DangerTier];
  info: string;
}

export const RINGS: readonly RingDef[] = [
  { ring: 1, name: 'Die Ruhige Innen-See', from: 0, to: 2200, danger: [1, 1], info: 'Rund um den Freihafen Ankerglück: geschützte Handelsrouten, Wrack-Atolle und leichte Patrouillen.' },
  { ring: 2, name: 'Archipel- und Handelsstraßen', from: 2200, to: 5200, danger: [2, 3], info: 'Inselketten, schiffbare Meerengen und die wirtschaftsstarken Kolonien der fünf Großmächte.' },
  { ring: 3, name: 'Der Riff- und Sturmgürtel', from: 5200, to: 8200, danger: [3, 4], info: 'Felsnadeln, Riff-Ketten als lohnende Abkürzungen und versteckte Piraten- und Schmugglerbuchten.' },
  { ring: 4, name: 'Die Äußeren Kaiser-Meere', from: 8200, to: PLAYABLE_RADIUS, danger: [4, 5], info: 'Weite Tiefsee mit Landmarken, dem Marine-Hauptquartier und den sechs Endgame-Festungen am Außenrand.' },
];

/** Ring an einem Abstand vom Mittelpunkt (jenseits des spielbaren Radius: Ring 4) */
export function ringAtDistance(dist: number): RingDef {
  const d = Math.max(0, dist);
  for (const r of RINGS) if (d < r.to) return r;
  return RINGS[RINGS.length - 1];
}

export const ringAt = (x: number, z: number): RingDef => ringAtDistance(Math.hypot(x, z));

/** Gefahrenstufe eines Ortes (1 … 5) aus den Bändern in Metern */
export const dangerTierAt = (x: number, z: number): DangerTier => dangerOfDistance(Math.hypot(x, z));

/**
 * Gegnerstufe auf offener See in den äußeren Ringen: ab Ring 3 wächst sie gleichmäßig mit dem Abstand, von der unteren Stufe des Bands 3
 * am Innenrand von Ring 3 bis Stufe 22 am Außenrand von Ring 4 (Stufe 5 der Gefahr beginnt bei 9 200 m mit Stufe 18).
 */
export function outerSeaLevel(dist: number): number {
  const from = RINGS[2].from, to = PLAYABLE_RADIUS;
  const lo = DANGER[3].levelMin + 1, hi = 22;
  const t = Math.max(0, Math.min(1, (dist - from) / (to - from)));
  // an die Bänder angelehnt: an jeder Bandgrenze mindestens die untere Stufe des Bandes
  const tier = dangerOfDistance(dist);
  return Math.max(Math.round(lo + (hi - lo) * t), DANGER[tier].levelMin);
}

/** Meter, an denen eine Gefahrenstufe beginnt (für Karten und Tests) */
export const dangerFrom = (t: DangerTier): number => DANGER_BANDS_M[t][0];
