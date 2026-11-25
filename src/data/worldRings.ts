// Die fünf konzentrischen Meeres-Ringe der offenen Welt (Phase 4.3B, seit 4.5C fünf statt vier). Reine Daten und Rechnung (ohne three.js, JSON-tauglich).
// Die fünf Kuchenstücke der Mächte (data/factions.ts, je 72°) laufen quer durch alle Ringe; die Ringe bestimmen Gefahr und Charakter des Meeres,
// die Kuchenstücke den Besitz. Die Gefahrenstufen selbst (Meter je Stufe, Gegnerwerte) stehen in data/balanceConfig.ts.
import { DANGER, DANGER_BANDS_M, dangerOfDistance, type DangerTier } from './balanceConfig';
import { PLAYABLE_RADIUS } from './world';
import { SECTORS, type PowerId } from './factions';

export type RingId = 1 | 2 | 3 | 4 | 5;
export const RING_IDS: readonly RingId[] = [1, 2, 3, 4, 5];

export interface RingDef {
  ring: RingId;
  name: string;
  /** Abstand vom Weltmittelpunkt in Metern (von einschließlich, bis ausschließlich) */
  from: number;
  to: number;
  /** Gefahrenstufen, die in diesem Ring vorkommen (innen → außen) */
  danger: [DangerTier, DangerTier];
  /** Beiname der Stufe für Karte und Kompass (Ring 5: „Kaiser-Stufe“) */
  tierName: string;
  info: string;
}

export const RINGS: readonly RingDef[] = [
  { ring: 1, name: 'Bernsteinsee · Ruhige Innen-See', from: 0, to: 2800, danger: [1, 1], tierName: 'Stufe 1', info: 'Das sichere Zentrum um den Freihafen Ankerglück: geschützte Handelsrouten, Wrack-Atolle und leichte Patrouillen.' },
  { ring: 2, name: 'Die Handels-Archipele', from: 2800, to: 6600, danger: [2, 2], tierName: 'Stufe 2', info: 'Kolonien, Kontore und Rohstoff-Inseln der fünf Großmächte, dazu die Grenzfestungen der Marine.' },
  { ring: 3, name: 'Der Riff- und Sturmgürtel', from: 6600, to: 10200, danger: [3, 3], tierName: 'Stufe 3', info: 'Die sechs Mega-Inseln, Felsnadeln, Riff-Ketten als lohnende Abkürzungen und versteckte Schmugglerbuchten.' },
  { ring: 4, name: 'Die Königs-Meere', from: 10200, to: 13000, danger: [4, 5], tierName: 'Stufe 4 – 5', info: 'Weite Tiefsee mit den sechs Königsinseln: Albion, Adlerstein, Yamikura, Oranjehaven, Soleilmont und das Marine-Hauptquartier Weißwacht.' },
  { ring: 5, name: 'Die Äußeren Kaiser-Meere', from: 13000, to: PLAYABLE_RADIUS, danger: [5, 5], tierName: 'Kaiser-Stufe', info: 'Das letzte Meer vor der Sturm-Barriere: Vorposten, Leuchtturm-Atolle und die verbotenen Bauplätze der Kaiser.' },
];

/** Ring an einem Abstand vom Mittelpunkt (jenseits des spielbaren Radius: Ring 5) */
export function ringAtDistance(dist: number): RingDef {
  const d = Math.max(0, dist);
  for (const r of RINGS) if (d < r.to) return r;
  return RINGS[RINGS.length - 1];
}

export const ringAt = (x: number, z: number): RingDef => ringAtDistance(Math.hypot(x, z));

/** Gefahrenstufe eines Ortes (1 … 5) aus den Bändern in Metern */
export const dangerTierAt = (x: number, z: number): DangerTier => dangerOfDistance(Math.hypot(x, z));

/** Höchste Gegnerstufe auf offener See am Außenrand der Königs-Meere (Ring 4) und an der Sturm-Barriere (Ring 5, Kaiser-Stufe) */
export const SEA_LEVEL_RING4 = 22;
export const SEA_LEVEL_KAISER = 26;

/**
 * Gegnerstufe auf offener See in den äußeren Ringen: ab Ring 3 wächst sie gleichmäßig mit dem Abstand, von der unteren Stufe des Bands 3
 * am Innenrand von Ring 3 bis Stufe 22 am Außenrand von Ring 4 und weiter bis Stufe 26 an der Sturm-Barriere (Ring 5, Kaiser-Stufe).
 */
export function outerSeaLevel(dist: number): number {
  const tier = dangerOfDistance(dist);
  let lv: number;
  if (dist >= RINGS[4].from) {
    const t = Math.max(0, Math.min(1, (dist - RINGS[4].from) / (PLAYABLE_RADIUS - RINGS[4].from)));
    lv = Math.round(SEA_LEVEL_RING4 + (SEA_LEVEL_KAISER - SEA_LEVEL_RING4) * t);
  } else {
    const from = RINGS[2].from, to = RINGS[3].to;
    const lo = DANGER[3].levelMin + 1;
    const t = Math.max(0, Math.min(1, (dist - from) / (to - from)));
    lv = Math.round(lo + (SEA_LEVEL_RING4 - lo) * t);
  }
  // an die Bänder angelehnt: an jeder Bandgrenze mindestens die untere Stufe des Bandes
  return Math.max(lv, DANGER[tier].levelMin);
}

/** Meter, an denen eine Gefahrenstufe beginnt (für Karten und Tests) */
export const dangerFrom = (t: DangerTier): number => DANGER_BANDS_M[t][0];

// ---------- Ring 5: Bauplätze der Kaiser-Zitadellen (Phase 4.5D) ----------

/**
 * Je Kuchenstück der Mächte ein großer, kollisionsfreier Bauplatz in den Äußeren Kaiser-Meere (Ring 5), auf der Mittellinie des Sektors bei 14 200 m.
 * Hier entstehen in Phase 4.5D die fünf Kaiser-Zitadellen; bis dahin liegt dort nur offenes Meer. Kein Insel-Rand (Platzbedarf `r · ISLAND_REACH`,
 * data/regions.ts) darf näher als `clear` an die Mitte heran (Test in tests/expandedOpenWorld.test.ts).
 */
export interface KaiserSiteDef { id: string; sectorIndex: number; power: PowerId; deg: number; dist: number; clear: number; x: number; z: number }

export const KAISER_SITE_DIST = 14200;
export const KAISER_SITE_CLEAR = 1200;

export const KAISER_SITES: readonly KaiserSiteDef[] = SECTORS.map((s) => {
  const deg = (s.fromDeg + s.toDeg) / 2;
  const a = (deg * Math.PI) / 180;
  return {
    id: `kaiser_${s.factionId}`, sectorIndex: s.sectorIndex, power: s.factionId, deg, dist: KAISER_SITE_DIST, clear: KAISER_SITE_CLEAR,
    x: Math.round(Math.sin(a) * KAISER_SITE_DIST), z: Math.round(Math.cos(a) * KAISER_SITE_DIST),
  };
});

/** Liegt ein Punkt (mit Radius) im Sperrgebiet eines Kaiser-Bauplatzes? */
export function inKaiserSite(x: number, z: number, r = 0): boolean {
  for (const k of KAISER_SITES) if (Math.hypot(x - k.x, z - k.z) < k.clear + r) return true;
  return false;
}
