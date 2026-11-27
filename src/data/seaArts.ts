/**
 * Phase 4.9 – Kräfte am Steuerrad (rein, ohne three.js): die zehn Formen des Klassenbaums, die vier Geistes-Faji und das Ultimate wirken
 * auch über dem Meer. Formen werden zu See-Projektionen ihrer Familie (Faust: Druckwellen-Faust über das Wasser, Klinge: Fernschnitt-Welle,
 * Faji: Element-Geschoss, Priester: Lichtlanze und Heilung des eigenen Schiffs); die Geistes-Faji wirken auf Schiff und Gegner im Umkreis.
 * Tasten am Steuer: Formen 1 – 5 und Umschalt + 1 – 5 (wie zu Fuß), Geistes-Faji Umschalt + Q/R/T/G (Q, E, R und G gehören am Steuer den
 * Breitseiten, der Aktion und dem Flicken), V geht an Deck und entfesselt dort das Ultimate über dem Meer.
 */
import { ACTION_STYLES } from './actionStyles';

export type SeaArtFamily = 'faust' | 'klinge' | 'faji' | 'priester';

export const SEA_ART = {
  /**
   * Reichweite (m) und halber Öffnungswinkel (rad), in dem ohne angewähltes Ziel zuerst gesucht wird. 4.91: bis 650 m – ein mit Tab bzw.
   * Klick angewähltes Schiff (Zielrahmen) wird immer genommen, solange es in Reichweite ist.
   */
  range: 650, cone: 0.85,
  /** Schaden: Angriffskraft × (Grund + je Form) × Stufenfaktor; ab Form 6 schwerer */
  dmgBase: 1.6, dmgSlot: 0.14, dmgLevel: 0.012,
  /** Abklingzeit am Steuer = Abklingzeit der Form × Faktor, mindestens `cdMin` s */
  cdK: 1.35, cdMin: 2.5,
  /** Fluggeschwindigkeit der Projektionen (m/s) und längste Flugzeit (s; 650 m in gut 2 s) */
  speed: 320, maxTravel: 2.2,
  /** Priester: Heilung des eigenen Schiffs je Form (Anteil des Rumpfs) */
  healK: 0.02,
} as const;

/** Kandidat für ein Ziel am Steuer (nur, was die Wahl braucht) */
export interface HelmCandidate { ship: { x: number; z: number; alive: boolean; sinking: number }; companion?: unknown; fleetId?: unknown; peer?: { mmo?: string } }

/**
 * 4.91 – Ziel einer Kraft am Steuer (rein, getestet): das angewählte Schiff (Tab/Klick, Zielrahmen) bis `range`; ist es weiter weg, steht
 * sein Abstand in `res.far` und es gibt kein Ziel (die Kraft wird nicht verschwendet). Ohne Anwahl das nächste treffbare Schiff im Kegel voraus
 * (±`cone` rad), sonst das nächste im Umkreis. Eigene Flotte und Mitspieler ohne Netz-Kennung zählen nie.
 */
export function pickHelmTarget<T extends HelmCandidate>(p: { x: number; z: number; heading: number }, aim: T | null, list: readonly T[], range: number, cone: number, mayHarm: (e: T) => boolean, res: { far: number }): T | null {
  res.far = 0;
  if (aim && aim.ship.alive && aim.ship.sinking <= 0 && mayHarm(aim)) {
    const d = Math.hypot(aim.ship.x - p.x, aim.ship.z - p.z);
    if (d <= range) return aim;
    res.far = d;
    return null;
  }
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading), cc = Math.cos(cone);
  let best: T | null = null, bd = range, front: T | null = null, fd = range;
  for (const e of list) {
    const s = e.ship;
    if (e.companion || e.fleetId || !s.alive || s.sinking > 0 || !mayHarm(e)) continue;
    if (e.peer && !e.peer.mmo) continue;
    const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz);
    if (d < bd) { bd = d; best = e; }
    if (d > 1 && d < fd && (dx * fx + dz * fz) / d >= cc) { fd = d; front = e; }
  }
  return front ?? best;
}

/** Flugzeit einer See-Projektion über `dist` m */
export function helmTravel(dist: number): number {
  return Math.min(SEA_ART.maxTravel, Math.max(0.12, (Number.isFinite(dist) ? dist : 0) / SEA_ART.speed));
}

/** Geistes-Faji am Steuer: Abklingzeit (s), Reichweite (m), Wirkung – 4.91: die Donnerlanze trifft das angewählte Schiff bis 650 m */
export const SEA_GEIST = [
  { slot: 1, label: 'Willens-Entfesselung', cd: 16, range: 150, effect: 'will' },
  { slot: 2, label: 'Lebensstrom-Fokus', cd: 22, range: 0, effect: 'heal' },
  { slot: 3, label: 'Erwachter Wille', cd: 14, range: 650, effect: 'thunder' },
  { slot: 4, label: 'Königsdruck', cd: 24, range: 95, effect: 'quake' },
] as const;

/**
 * 4.91 – Ultimate am Steuer gegen ein Ziel bis 650 m: die Wirkung entsteht AM Ziel. Ultimates mit Mittelpunkt (Sieben Meere, Schwarzes Loch,
 * Himmelssturz) setzen ihn auf die feindliche Flotte, Kreis-Ultimates um die Figur (Gletscher, Vakuum, Sonnentanz, Himmelsgericht, Blutmond,
 * Donnergott) legen ihren Kreis über die Flotte, gerichtete (Klingenwand, Ozean-Teilung, Drachen, Säge, Faustflut, Iaijutsu) beginnen so vor
 * dem Ziel, dass es mitten in ihrer Bahn liegt. Liegt das Ziel schon im natürlichen Wirkungsbereich, bleibt alles, wie es ist (null).
 */
export const SEA_ULT = { range: 650, natural: 0.6, fleetR: 220 } as const;

export const CIRCLE_ULTS: readonly string[] = ['glacier', 'vacuumStorm', 'sunDance', 'himmelsgericht', 'bloodMoon', 'thunderJudgment'];

export interface SeaUltAnchor { x: number; z: number; yaw: number; cx: number; cz: number }

export function seaUltAnchor(kind: string, s: { reach: number; center: number }, fromX: number, fromZ: number, tx: number, tz: number, fleetX = tx, fleetZ = tz): SeaUltAnchor | null {
  const dx = tx - fromX, dz = tz - fromZ, d = Math.hypot(dx, dz);
  if (!(d >= 1) || d > SEA_ULT.range) return null;
  const circle = CIRCLE_ULTS.includes(kind), mid = s.center > 0;
  if (circle ? d <= s.reach * 0.8 : mid ? Math.abs(d - s.center) <= s.reach * 0.3 : d <= s.reach * SEA_ULT.natural) return null;
  const ux = dx / d, uz = dz / d;
  const cx = circle || mid ? fleetX : tx, cz = circle || mid ? fleetZ : tz;
  const ahead = mid ? s.center : circle ? 0 : Math.min(s.reach * 0.45, d * 0.8);
  return { x: cx - ux * ahead, z: cz - uz * ahead, yaw: Math.atan2(dx, dz), cx, cz };
}

export type SeaGeistEffect = (typeof SEA_GEIST)[number]['effect'];

/** Familie eines Kampfstils auf See */
export function seaFamily(style: string): SeaArtFamily {
  if (style === 'priester') return 'priester';
  const st = (ACTION_STYLES as Record<string, { faji?: boolean; visual?: string } | undefined>)[style];
  if (st?.faji) return 'faji';
  if (st?.visual === 'faust' || style === 'sturmfaust' || style === 'erdspalter') return 'faust';
  return 'klinge';
}

/** Schaden einer Form am Steuer (Form 1 – 10) */
export function seaArtDamage(atk: number, level: number, slot: number): number {
  const s = Math.max(1, Math.min(10, Math.round(slot)));
  return Math.max(1, atk) * (SEA_ART.dmgBase + s * SEA_ART.dmgSlot + (s >= 6 ? 0.35 : 0)) * (1 + Math.max(1, level) * SEA_ART.dmgLevel);
}

/** Abklingzeit einer Form am Steuer aus der Abklingzeit der Form (s) */
export function seaArtCd(formCd: number): number {
  return Math.max(SEA_ART.cdMin, (Number.isFinite(formCd) ? formCd : 6) * SEA_ART.cdK);
}

/** Schaden eines Geistes-Faji am Steuer (Donner trifft hart, das Beben breit und schwächer) */
export function seaGeistDamage(atk: number, level: number, effect: SeaGeistEffect): number {
  const base = seaArtDamage(atk, level, 6);
  return effect === 'thunder' ? base * 2.2 : effect === 'quake' ? base * 1.1 : 0;
}
