// Handelskonvois (Phase 4.3C, `TradeConvoySystem`): ein schwer beladener Frachter mit ein bis zwei Eskorten segelt von einer Insel, die eine Ware
// im Überschuss herstellt, zu einer, die sie braucht (Marktprofile aus data/economy.ts, `ISLAND_PROFILES` eingeschlossen). Rein, deterministisch
// (Würfel wird übergeben), JSON-tauglich – ohne three.js. Fern vom Spieler reisen Konvois als reine Daten entlang ihrer Route; in seiner Nähe
// macht die Seewelt echte Schiffe daraus, die mit `PredictiveMaritimeSteering` (naval/shipSteering.ts) dieselbe Route abfahren.
//
// Echte Wirtschaft (schließt die Lücke aus 4.1B): Kommt ein Konvoi an, wächst der Vorrat (`MarketState.stock`) des Zielhafens und der Knappheitspreis
// sinkt (`deliverConvoy`). Wird er abgefangen, bleibt der Hafen knapp, und der Frachter führt genau die Ware seiner Region (`convoyLoot`, an Grenzen
// dazu Kriegsware). Wer einen bedrohten Konvoi gegen Korsaren verteidigt, bekommt Gold, Ansehen und Ehre bei seiner Macht (`defenseReward`).
import { CONVOY } from '../data/seaEvents';
import { DANGER, clampTier, type DangerTier } from '../data/balanceConfig';
import { GOOD_BY_ID, MARKET, type EconomyState, type GoodId, type MarketProfile } from '../data/economy';
import { marketAt, marketPrice, type MarketSite, type SalvageDrop } from '../core/economyEngine';
import type { FactionId } from '../data/factions';
import { routeAround, type RouteObstacle } from './oceanCurrents';
import { ISLAND_REACH } from '../data/regions';

/** Hafen, den Konvois anlaufen (aus Inseldaten und Marktprofil) */
export interface ConvoySite {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  ring: number;
  dangerTier: number;
  factionId: FactionId | null;
  profile: MarketProfile;
}

/** Rolle eines Schiffs eines Ereignisses oder Konvois */
export type SeaShipRole = 'frachter' | 'eskorte' | 'korsar' | 'galeone' | 'wache' | 'boss' | 'schmuggler';

/**
 * Ein Schiff als reine Daten: so steht es im Spielstand und im Mehrspieler-Abgleich. Ist es „echt“ (`live` des Konvois bzw. Ereignisses), schreibt
 * die Seewelt Lage, Rumpf und Zustand laufend zurück.
 */
export interface SeaShipRec {
  id: string;
  role: SeaShipRole;
  classTier: number;
  /** Rumpf und Segel 0 … 1 */
  hull: number;
  sail: number;
  /** Versenkt oder kampfunfähig (zählt als erledigt), durch den Spieler, geentert */
  down: boolean;
  byPlayer: boolean;
  boarded: boolean;
  x: number;
  z: number;
  heading: number;
  /** Platz in der Formation (0 = Führer) */
  slot: number;
}

export type ConvoyStatus = 'unterwegs' | 'bedroht' | 'angekommen' | 'gepluendert' | 'verloren';

export interface ConvoyState {
  id: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  power: FactionId | null;
  dangerTier: DangerTier;
  level: number;
  good: GoodId;
  units: number;
  /** Route (flach x, z, …) und der nächste Wegpunkt */
  route: number[];
  leg: number;
  x: number;
  z: number;
  heading: number;
  /** Fortschritt 0 … 1 (Anteil der Strecke) und Länge (m) */
  progress: number;
  length: number;
  status: ConvoyStatus;
  /** Ab diesem Fortschritt greifen Korsaren an (−1 = nie); `threatDone` = der Überfall ist vorbei (abgewehrt oder gelungen) */
  threatAt: number;
  threatDone: boolean;
  ships: SeaShipRec[];
  corsairs: SeaShipRec[];
  /** Die Seewelt fährt echte Schiffe (setzt der Gastgeber) */
  live: boolean;
  /** Der Spieler hat auf den Konvoi selbst geschossen (dann zählt keine Verteidigung) */
  playerHitConvoy: boolean;
  startedAt: number;
  endedAt: number;
}

export type ConvoyNotice =
  | { type: 'convoyArrived'; convoy: ConvoyState }
  | { type: 'convoyThreat'; convoy: ConvoyState }
  | { type: 'convoyDefended'; convoy: ConvoyState; reward: DefenseReward }
  | { type: 'convoyPlundered'; convoy: ConvoyState; byPlayer: boolean; boarded: boolean };

// ---------- Hilfen ----------

const freighterOf = (c: ConvoyState): SeaShipRec | undefined => c.ships.find((s) => s.role === 'frachter');
export const convoyFreighter = freighterOf;

/** Stufe eines Konvois aus der Gefahr der Strecke (erste Gegnerstufe des Bandes + 1) */
export const convoyLevel = (t: DangerTier): number => DANGER[t].levelMin + 1;

/** Ladung eines Konvois: so viele Einheiten der Ware, wie der Ladungswert zu Grundpreisen hergibt (mindestens 8) */
export const convoyUnits = (good: GoodId): number => Math.max(8, Math.round(CONVOY.cargoValue / GOOD_BY_ID[good].base));

/** Länge einer Route (m) */
export function routeLength(route: readonly number[]): number {
  let L = 0;
  for (let k = 2; k < route.length; k += 2) L += Math.hypot(route[k] - route[k - 2], route[k + 1] - route[k - 1]);
  return L;
}

// ---------- Wirtschaft ----------

export interface Delivery { good: GoodId; units: number; stockBefore: number; stockAfter: number; priceBefore: number; priceAfter: number }

/**
 * Ein Konvoi kommt an: der Vorrat der Ware im Zielhafen wächst um die Ladung (höchstens auf 5 000), der Preis fällt entsprechend der Elastizität.
 * Schreibt den echten `MarketState` im Spielstand (`eco.markets[site.id]`); die Erholung zum Gleichgewicht läuft danach wie immer lazy in `marketAt`.
 */
export function deliverConvoy(eco: EconomyState, site: MarketSite, now: number, good: GoodId, units: number): Delivery {
  const m = marketAt(eco, site, now);
  const before = m.stock[good] ?? 0;
  const after = Math.min(5000, before + Math.max(0, units));
  m.stock[good] = after;
  return { good, units: after - before, stockBefore: before, stockAfter: after, priceBefore: marketPrice(site, good, before), priceAfter: marketPrice(site, good, after) };
}

const WAR_GOODS: readonly GoodId[] = ['schiesspulver', 'waffenkisten', 'medizin'];

/**
 * Beute eines abgefangenen Frachters: seine Ladung (die Ware seiner Herkunftsregion; geentert ganz, versenkt treiben 65 % herüber), nahe einer
 * Sektorgrenze dazu ein Posten Kriegsware (ein Viertel des Ladungswerts). Menge begrenzt erst `applySalvage` (Frachtraum).
 */
export function convoyLoot(c: Pick<ConvoyState, 'good' | 'units'>, borderDist: number, boarded: boolean, rnd: () => number): SalvageDrop[] {
  const out: SalvageDrop[] = [{ good: c.good, units: Math.max(1, Math.round(c.units * (boarded ? 1 : 0.65))) }];
  if (borderDist < MARKET.warBorderDist) {
    const g = WAR_GOODS[Math.floor(rnd() * WAR_GOODS.length) % WAR_GOODS.length];
    out.push({ good: g, units: Math.max(2, Math.round((CONVOY.cargoValue * 0.25) / GOOD_BY_ID[g].base)) });
  }
  return out;
}

export interface DefenseReward { gold: number; standing: number; honor: number; power: FactionId | null }

/** Lohn für einen verteidigten Konvoi: Gold je Gefahrenstufe, Ansehen und Ehre bei der Macht des Konvois */
export function defenseReward(c: Pick<ConvoyState, 'dangerTier' | 'power'>): DefenseReward {
  return { gold: CONVOY.defendGold * c.dangerTier, standing: CONVOY.defendStanding, honor: CONVOY.defendHonor, power: c.power };
}

// ---------- System ----------

interface TradePair { a: number; b: number; goods: GoodId[]; dist: number; mx: number; mz: number }

/**
 * Planung und Reise der Konvois. Die Häfen und Inseln kommen beim Start (rein, aus den Inseldaten), der Zustand jedes Konvois ist ein `ConvoyState`
 * in der Liste des Directors (`WorldEventState.convoys`).
 */
export class TradeConvoySystem {
  private readonly pairs: TradePair[] = [];
  private readonly obstacles: RouteObstacle[];

  constructor(readonly sites: readonly ConvoySite[], islands: readonly { x: number; z: number; r: number }[]) {
    this.obstacles = islands.map((i) => ({ x: i.x, z: i.z, c: i.r * ISLAND_REACH + 70 }));
    for (let a = 0; a < sites.length; a++) for (let b = 0; b < sites.length; b++) {
      if (a === b) continue;
      const A = sites[a], B = sites[b];
      const dist = Math.hypot(A.x - B.x, A.z - B.z);
      if (dist < CONVOY.minTrip || dist > CONVOY.maxTrip) continue;
      const goods = A.profile.produce.filter((g) => B.profile.demand.includes(g));
      if (goods.length) this.pairs.push({ a, b, goods, dist, mx: (A.x + B.x) / 2, mz: (A.z + B.z) / 2 });
    }
  }

  get tradePairs(): number { return this.pairs.length; }

  /** Route von Hafen A nach Hafen B: Start und Ende vor den Häfen, dazwischen um alle Inseln herum (Wegpunkte etwa alle 240 m) */
  planRoute(A: ConvoySite, B: ConvoySite): number[] {
    const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d;
    const a0 = A.r * ISLAND_REACH + 110, b0 = B.r * ISLAND_REACH + 110;
    const r = routeAround(A.x + ux * a0, A.z + uz * a0, B.x - ux * b0, B.z - uz * b0, this.obstacles, 60);
    const out: number[] = [];
    const every = 4;
    for (let k = 0; k < r.xs.length; k++) if (k % every === 0 || k === r.xs.length - 1) out.push(r.xs[k], r.zs[k]);
    return out;
  }

  /**
   * Handel wählen: ein Paar Hafen → Hafen mit einer Ware, die A erzeugt und B braucht. Mit `near` werden Paare bevorzugt, deren Mitte in Sichtweite
   * liegt (70 %): so fährt das Leben dort, wo jemand zusieht – die übrigen Konvois handeln irgendwo auf der Karte.
   */
  pickTrade(rnd: () => number, near: readonly { x: number; z: number }[] = [], busy: readonly string[] = []): { from: ConvoySite; to: ConvoySite; good: GoodId } | null {
    // eine Strecke fährt nie doppelt (Schlüssel `von>nach`)
    const open = busy.length ? this.pairs.filter((p) => !busy.includes(`${this.sites[p.a].id}>${this.sites[p.b].id}`)) : this.pairs;
    if (!open.length) return null;
    let pool = open;
    if (near.length && rnd() < 0.7) {
      const close = open.filter((p) => near.some((n) => Math.hypot(p.mx - n.x, p.mz - n.z) < 3200));
      if (close.length) pool = close;
    }
    const p = pool[Math.floor(rnd() * pool.length) % pool.length];
    const good = p.goods[Math.floor(rnd() * p.goods.length) % p.goods.length];
    return { from: this.sites[p.a], to: this.sites[p.b], good };
  }

  /** Neuen Konvoi anlegen (noch nicht in der Liste) */
  create(id: string, now: number, rnd: () => number, near: readonly { x: number; z: number }[] = [], busy: readonly string[] = []): ConvoyState | null {
    const tr = this.pickTrade(rnd, near, busy);
    if (!tr) return null;
    const { from, to, good } = tr;
    const route = this.planRoute(from, to);
    if (route.length < 4) return null;
    const dangerTier = clampTier(Math.max(from.dangerTier, to.dangerTier));
    const level = convoyLevel(dangerTier);
    const power = from.factionId ?? to.factionId;
    const x = route[0], z = route[1];
    const heading = Math.atan2(route[2] - x, route[3] - z);
    const ships: SeaShipRec[] = [];
    const ti = dangerTier - 1;
    ships.push(shipRec(`${id}-f`, 'frachter', CONVOY.freighterClass[ti], x, z, heading, 0));
    for (let k = 0; k < CONVOY.escorts[ti]; k++) ships.push(shipRec(`${id}-e${k}`, 'eskorte', CONVOY.escortClass[ti], x, z, heading, k + 1));
    const threat = rnd() < CONVOY.threatChance;
    return {
      id, from: from.id, to: to.id, fromName: from.name, toName: to.name, power, dangerTier, level, good, units: convoyUnits(good),
      route, leg: 1, x, z, heading, progress: 0, length: routeLength(route), status: 'unterwegs',
      threatAt: threat ? 0.25 + rnd() * 0.5 : -1, threatDone: !threat, ships, corsairs: [], live: false, playerHitConvoy: false, startedAt: now, endedAt: -1,
    };
  }

  /** Korsaren für einen Überfall (Daten; die Seewelt macht echte Schiffe daraus, wenn der Konvoi echt ist) */
  spawnCorsairs(c: ConvoyState): void {
    if (c.corsairs.length) return;
    const n = CONVOY.corsairs[c.dangerTier - 1];
    for (let k = 0; k < n; k++) {
      // seitlich voraus, 380 m vom Konvoi: sie kommen sichtbar heran
      const a = c.heading + (k % 2 ? 1 : -1) * (0.9 + k * 0.25);
      c.corsairs.push(shipRec(`${c.id}-k${k}`, 'korsar', Math.max(1, CONVOY.escortClass[c.dangerTier - 1]), c.x + Math.sin(a) * 380, c.z + Math.cos(a) * 380, a + Math.PI, k));
    }
  }

  /**
   * Ein Schritt eines Konvois (`dt` s). Als reine Daten fährt er die Route mit `CONVOY.speed` ab; ist er echt, kommen Lage und Zustand von den
   * Schiffen, und hier wird nur ausgewertet. Liefert höchstens eine Meldung.
   */
  step(c: ConvoyState, dt: number, rnd: () => number): ConvoyNotice | null {
    if (c.status === 'angekommen' || c.status === 'gepluendert' || c.status === 'verloren') return null;
    const fr = freighterOf(c);
    if (!fr) return null;
    if (!c.live) {
      advanceOnRoute(c, CONVOY.speed * dt);
      for (const s of c.ships) if (!s.down) { s.x = c.x; s.z = c.z; s.heading = c.heading; }
    } else { c.x = fr.x; c.z = fr.z; c.heading = fr.heading; updateLeg(c); }
    c.progress = progressOf(c);
    // Frachter erledigt: vom Spieler (geplündert) oder von Korsaren (verloren)
    if (fr.down) {
      const byPlayer = fr.byPlayer || fr.boarded;
      c.status = byPlayer ? 'gepluendert' : 'verloren';
      return { type: 'convoyPlundered', convoy: c, byPlayer, boarded: fr.boarded };
    }
    // Überfall
    if (!c.threatDone && c.threatAt >= 0 && c.progress >= c.threatAt) {
      if (!c.live) {
        // fern vom Spieler entscheidet der Würfel: die Hälfte der überfallenen Konvois geht verloren, die anderen schlagen die Korsaren selbst ab
        c.threatDone = true;
        if (rnd() < CONVOY.lostFar) { c.status = 'verloren'; fr.down = true; return { type: 'convoyPlundered', convoy: c, byPlayer: false, boarded: false }; }
        return null;
      }
      if (c.status !== 'bedroht') { c.status = 'bedroht'; this.spawnCorsairs(c); return { type: 'convoyThreat', convoy: c }; }
    }
    if (c.status === 'bedroht' && c.corsairs.length && c.corsairs.every((k) => k.down)) {
      c.status = 'unterwegs';
      c.threatDone = true;
      const helped = c.corsairs.some((k) => k.byPlayer || k.boarded);
      if (helped && !c.playerHitConvoy) return { type: 'convoyDefended', convoy: c, reward: defenseReward(c) };
    }
    // Ankunft
    const ex = c.route[c.route.length - 2], ez = c.route[c.route.length - 1];
    if (Math.hypot(ex - c.x, ez - c.z) < CONVOY.arrive && c.status !== 'bedroht') {
      c.status = 'angekommen';
      return { type: 'convoyArrived', convoy: c };
    }
    return null;
  }
}

function shipRec(id: string, role: SeaShipRole, classTier: number, x: number, z: number, heading: number, slot: number): SeaShipRec {
  return { id, role, classTier, hull: 1, sail: 1, down: false, byPlayer: false, boarded: false, x, z, heading, slot };
}
export { shipRec as newShipRec };

/** Auf einer Route `dist` Meter weiterfahren (Lage, Kurs, nächster Wegpunkt) */
export function advanceOnRoute(c: { route: number[]; leg: number; x: number; z: number; heading: number }, dist: number): void {
  let left = dist;
  while (left > 0 && c.leg < c.route.length / 2) {
    const tx = c.route[c.leg * 2], tz = c.route[c.leg * 2 + 1];
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) c.heading = Math.atan2(dx, dz);
    if (d <= left) { c.x = tx; c.z = tz; left -= d; c.leg++; }
    else { c.x += (dx / d) * left; c.z += (dz / d) * left; left = 0; }
  }
}

/** Echte Schiffe: Wegpunkt weiterschalten, sobald der Frachter ihn passiert hat (Ankunftsradius 90 m) */
export function updateLeg(c: { route: number[]; leg: number; x: number; z: number }): void {
  while (c.leg < c.route.length / 2 - 1 && Math.hypot(c.route[c.leg * 2] - c.x, c.route[c.leg * 2 + 1] - c.z) < 90) c.leg++;
}

/** Anteil der zurückgelegten Strecke (über die Wegpunkte, ohne Allokation) */
export function progressOf(c: { route: number[]; leg: number; x: number; z: number; length?: number }): number {
  const total = c.length ?? routeLength(c.route);
  if (total <= 0 || c.leg >= c.route.length / 2) return 1;
  let done = 0;
  for (let k = 1; k < c.leg && k < c.route.length / 2; k++) done += Math.hypot(c.route[k * 2] - c.route[k * 2 - 2], c.route[k * 2 + 1] - c.route[k * 2 - 1]);
  const pk = Math.min(c.leg, c.route.length / 2 - 1);
  const px = c.route[(pk - 1) * 2], pz = c.route[(pk - 1) * 2 + 1];
  done += Math.min(Math.hypot(c.route[pk * 2] - px, c.route[pk * 2 + 1] - pz), Math.hypot(c.x - px, c.z - pz));
  return Math.max(0, Math.min(1, done / total));
}
