// Seekarten-Schnellreise (Phase 4.3D): von der Weltkarte aus in einen entdeckten, friedlichen Hafen springen. Rein (ohne three.js, ohne DOM): die Regeln und
// Kosten stehen hier, das Setzen von Schiff und Flotte besorgt die Seewelt, Gold und Proviant bucht das Spiel.
//
// Damit Handelsrouten nicht durch Teleport umgangen werden, gilt die Reise nur, wenn
//   • der Hafen entdeckt ist und ein Hafen (Stadt oder Hafen mit Markt) ist,
//   • keine Blockade (Welt-Ereignis, 4.3C) davor liegt und das Ansehen bei der Hafenmacht über −60 liegt,
//   • kein Kampf läuft, du nicht in Sturmzone oder Sturmsee segelst und kein Fahndungsdruck besteht (Hitze, Jäger auf der Spur),
//   • kein Handelsgut im Frachtraum liegt (jede Ware des Kontors ist Regionalware),
//   • du auf See bist (nicht zu Fuß, nicht in einer Belagerung) und Gold und Proviant für die Strecke hast.
import type { IslandKind } from '../data/regions';

export const FAST_TRAVEL = {
  /** Gold je Kilometer Luftlinie (vor dem Hafen-Tarif) und Mindestpreis */
  goldPerKm: 22,
  minGold: 30,
  /** Proviant (die Schnellleisten-Rationen) je Kilometer, aufgerundet, mindestens 1 */
  provisionsPerKm: 0.4,
  minProvisions: 1,
  /** Ab dieser Hitze (Fahndungsdruck durch Kriegsware) ist die Reise gesperrt */
  heatLock: 25,
  /** Ansehen bei der Hafenmacht muss größer sein als dieser Wert (die Macht sperrt sonst ihre Häfen) */
  standingAbove: -60,
  /** Abstand der Begleitschiffe zu allen Stegen nach der Ankunft (m) */
  arrivalClear: 45,
} as const;

/** Häfen mit Markt: Hafen und Stadt (Festungen, Lager und Leuchttürme sind keine Ziele) */
export const isTravelPort = (kind: IslandKind): boolean => kind === 'harbor' || kind === 'town';

export type TravelBlock =
  | 'undiscovered' | 'noPort' | 'blockade' | 'standing' | 'combat' | 'storm' | 'wanted' | 'cargo' | 'notSailing' | 'here' | 'gold' | 'provisions';

export interface TravelCtx {
  dest: { id: string; name: string; kind: IslandKind; x: number; z: number };
  discovered: boolean;
  from: { x: number; z: number };
  /** Ansehen bei der Macht des Zielhafens (0 für Freihäfen) */
  standing: number;
  /** Hafen-Tarif (Faktor 0,75 … 1,35) */
  tariff: number;
  blockade: boolean;
  /** Kampf läuft (Gegner in der Nähe, Seeschlacht, Boss) */
  inCombat: boolean;
  /** Sturmzone (Sturmgürtel), Sturmwetter, Gewitterzelle oder Sturmsee hinter dem Rand */
  inStorm: boolean;
  heat: number;
  /** Jäger oder Kopfgeldjäger sind dir auf der Spur */
  hunted: boolean;
  /** Einheiten Handelsware im Frachtraum */
  cargoUnits: number;
  sailing: boolean;
  gold: number;
  provisions: number;
}

export interface TravelQuote {
  ok: boolean;
  dist: number;
  gold: number;
  provisions: number;
  /** Erster Grund, der die Reise sperrt (null = frei) */
  lock: TravelBlock | null;
  /** Alle Hinweise auf Deutsch, für den Tooltip der Karte (leer = frei) */
  reasons: string[];
}

export const travelDistance = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Kosten: Gold nach Entfernung und Hafen-Tarif, Proviant nach Entfernung */
export function travelCost(dist: number, tariff: number): { gold: number; provisions: number } {
  const km = Math.max(0, dist) / 1000;
  const t = Math.max(0.5, Math.min(2, Number.isFinite(tariff) ? tariff : 1));
  return {
    gold: Math.max(FAST_TRAVEL.minGold, Math.ceil(km * FAST_TRAVEL.goldPerKm * t)),
    provisions: Math.max(FAST_TRAVEL.minProvisions, Math.ceil(km * FAST_TRAVEL.provisionsPerKm)),
  };
}

const TEXT: Record<TravelBlock, (c: TravelCtx, q: { gold: number; provisions: number }) => string> = {
  undiscovered: () => 'Noch nicht entdeckt: segle erst einmal hin.',
  noPort: () => 'Nur Häfen und Städte mit Markt sind Reiseziele.',
  blockade: (c) => `Blockade vor ${c.dest.name}: die Schnellreise ist gesperrt, bis jemand sie bricht.`,
  standing: (c) => `Die Hafenmacht von ${c.dest.name} hat dich verfemt (Ansehen unter −60): kein Zutritt.`,
  combat: () => 'Im Kampf gesperrt: erst die Gegner loswerden.',
  storm: () => 'In Sturmzone oder Sturmsee gesperrt: fahre erst in ruhige Gewässer.',
  wanted: () => 'Fahndungsdruck: Jäger sind dir auf der Spur. Warte, bis es ruhiger wird.',
  cargo: (c) => `Handelsware im Frachtraum (${Math.round(c.cargoUnits)} Einheiten): verkaufe sie erst, sonst ließen sich Handelsrouten umgehen.`,
  notSailing: () => 'Nur vom Schiff aus auf See möglich.',
  here: () => 'Du bist schon dort.',
  gold: (_c, q) => `Dafür fehlt Gold (${q.gold} nötig).`,
  provisions: (_c, q) => `Dafür fehlt Proviant (${q.provisions} nötig).`,
};

/** Hier gilt: wer „dort“ ist, braucht keine Reise (innerhalb dieser Strecke zum Zielhafen) */
const HERE = 160;

/**
 * Darf der Spieler reisen? Alle Sperren werden gesammelt (der Tooltip zeigt sie alle), `lock` ist die erste in der Reihenfolge: Ziel, Hafenmacht, Lage
 * des Spielers, Fracht, zuletzt Gold und Proviant.
 */
export function travelQuote(c: TravelCtx): TravelQuote {
  const dist = travelDistance(c.from, c.dest);
  const cost = travelCost(dist, c.tariff);
  const why: TravelBlock[] = [];
  if (!c.discovered) why.push('undiscovered');
  else if (!isTravelPort(c.dest.kind)) why.push('noPort');
  else {
    if (c.blockade) why.push('blockade');
    if (c.standing <= FAST_TRAVEL.standingAbove) why.push('standing');
  }
  if (!c.sailing) why.push('notSailing');
  if (c.inCombat) why.push('combat');
  if (c.inStorm) why.push('storm');
  if (c.hunted || c.heat >= FAST_TRAVEL.heatLock) why.push('wanted');
  if (c.cargoUnits > 0) why.push('cargo');
  if (c.discovered && dist <= HERE && why.length === 0) why.push('here');
  // Kosten erst nennen, wenn sonst alles frei ist (sonst wäre der Hinweis „Gold fehlt“ zweitrangig)
  if (why.length === 0) {
    if (c.gold < cost.gold) why.push('gold');
    if (c.provisions < cost.provisions) why.push('provisions');
  }
  return { ok: why.length === 0, dist, gold: cost.gold, provisions: cost.provisions, lock: why[0] ?? null, reasons: why.map((k) => TEXT[k](c, cost)) };
}

// ---------- Anlegeplatz ----------

export interface BerthPier { ax: number; az: number; bx: number; bz: number; hw: number }
export interface BerthIsland { x: number; z: number; r: number }

/**
 * Platz auf offenem Wasser vor dem Zielhafen: von der Spitze des ersten Stegs (oder der Küste zum Weltmittelpunkt hin) ein Stück seewärts, dann in
 * Ringen um die Spitze, bis `clear(x, z)` offenes Wasser meldet. `heading` zeigt auf den Hafen. Liefert null, wenn nichts frei ist.
 * `gap` = Abstand zur Stegspitze (Schiffslänge, damit der Bug nicht in den Planken steht).
 */
export function findBerth(isl: BerthIsland, piers: readonly BerthPier[], gap: number, clear: (x: number, z: number) => boolean, out: { x: number; z: number; heading: number }): { x: number; z: number; heading: number } | null {
  // Spitze: das Stegende, das am weitesten von der Inselmitte liegt; ohne Steg die Küste zum Weltmittelpunkt hin
  let tx: number, tz: number;
  if (piers.length > 0) {
    const p = piers[0];
    const da = Math.hypot(p.ax - isl.x, p.az - isl.z), db = Math.hypot(p.bx - isl.x, p.bz - isl.z);
    if (da > db) { tx = p.ax; tz = p.az; } else { tx = p.bx; tz = p.bz; }
  } else {
    const d = Math.hypot(isl.x, isl.z) || 1;
    tx = isl.x - (isl.x / d) * isl.r; tz = isl.z - (isl.z / d) * isl.r;
  }
  // seewärts: von der Inselmitte durch die Spitze
  let ox = tx - isl.x, oz = tz - isl.z;
  const ol = Math.hypot(ox, oz) || 1;
  ox /= ol; oz /= ol;
  const base = Math.atan2(oz, ox);
  const ring = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI];
  for (let rad = Math.max(60, gap); rad <= Math.max(60, gap) + 360; rad += 60) {
    for (let k = 0; k < ring.length; k++) {
      const a = base + ring[k];
      const x = tx + Math.cos(a) * rad, z = tz + Math.sin(a) * rad;
      if (!clear(x, z)) continue;
      out.x = x; out.z = z; out.heading = Math.atan2(isl.x - x, isl.z - z);
      return out;
    }
  }
  return null;
}
