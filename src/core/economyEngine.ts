// Ökonomie-Engine: Märkte (Angebot, Nachfrage, Elastizität, Kriegspreise), Frachtraum, Schmuggel-Kontrollen, Hafen-Tarife, Unterhalt (Sold)
// und Werft-Kosten. Reine Funktionen auf `EconomyState` (data/economy.ts): ohne three.js, ohne Zufall außer über einen übergebenen
// Würfel (`rnd`), ohne Uhr außer der Spielzeit in Sekunden. Damit sind alle Regeln testbar und ein Server kann dieselben Märkte führen.
import {
  CARGO_CAP, CONTRABAND, GOODS, GOOD_BY_ID, MARKET, TARIFF, UPKEEP, WAR_DEMAND, cargoCap, profileOf,
  type EconomyState, type GoodId, type MarketProfile, type MarketState,
} from '../data/economy';
import { clamp } from './mathUtil';
import { EVO_UPKEEP_MAX } from '../data/balanceConfig';
import { shipUpkeepDaily } from '../data/playerFleet';

export { cargoCap, CARGO_CAP };

// ---------- Märkte ----------

type Role = 'produce' | 'normal' | 'demand';
export const roleOf = (p: MarketProfile, g: GoodId): Role => (p.produce.includes(g) ? 'produce' : p.demand.includes(g) ? 'demand' : 'normal');
export const eqStockOf = (p: MarketProfile, g: GoodId): number => MARKET.eqStock[roleOf(p, g)];
export const eqPriceOf = (p: MarketProfile, g: GoodId): number => MARKET.eqPrice[roleOf(p, g)];

/**
 * Märkte eines Orts: Schlüssel der Insel, Profil und Kriegslage (siehe `warPremium`); `priceK` = Faktor auf alle Preise (Hafen-Blockade des
 * lebendigen Meeres, Phase 4.3C: 2 = doppelte Handelspreise, solange die Blockade liegt; fehlt = 1)
 */
export interface MarketSite {
  id: string; name: string; profile: MarketProfile; war: WarSite; priceK?: number;
  /** Embargo (4.5A): Waren der Mächte, mit denen der Hafenherr im Krieg liegt, werden hier weder gekauft noch verkauft; `embargoBy` = Namen für die Meldung */
  embargo?: readonly GoodId[];
  embargoBy?: string;
}
/** Kriegslage eines Hafens: Grenze, Besatzung, Festung; seit 4.5A Belagerung und Unruhe nach einer Eroberung (0 … 1) */
export interface WarSite { borderDist: number; occupied: boolean; fort: boolean; siege?: boolean; unrest?: number }

/** Aufschlag des Kriegsbedarfs (1 = keiner) auf Kanonenstahl, Hartholz, Medizin und Segeltuch einer belagerten oder frisch eroberten Insel */
export function warDemandK(w: WarSite, g: GoodId): number {
  if (!WAR_DEMAND.goods.includes(g)) return 1;
  const k = 1 + (w.siege ? WAR_DEMAND.siege : 0) + WAR_DEMAND.unrest * Math.max(0, Math.min(1, w.unrest ?? 0));
  return Math.min(WAR_DEMAND.max, k);
}

/** Liegt auf dieser Ware hier ein Embargo? */
export const embargoed = (site: MarketSite, g: GoodId): boolean => !!site.embargo?.includes(g);

/**
 * Preisaufschlag auf Kriegsware (1 = kein): nahe einer Sektorgrenze, auf besetzten/belagerten Inseln und in Festungen.
 * Gilt nur für Kriegsware (`war`); alle anderen Waren kennen keinen Kriegspreis.
 */
export function warPremium(w: WarSite): number {
  const k = 1 + (w.borderDist < MARKET.warBorderDist ? MARKET.warBorder * (1 - w.borderDist / MARKET.warBorderDist * 0.5) : 0) + (w.occupied ? MARKET.warOccupied : 0) + (w.fort ? MARKET.warFort : 0);
  return Math.min(MARKET.warMax, k);
}

/** Markt anlegen (Gleichgewicht) oder bis `now` zum Gleichgewicht zurückfließen lassen: Erholung ohne jede Hintergrundrechnung */
export function marketAt(eco: EconomyState, site: MarketSite, now: number): MarketState {
  let m = eco.markets[site.id];
  if (!m) {
    m = { stock: {}, t: now };
    for (const g of GOODS) m.stock[g.id] = eqStockOf(site.profile, g.id);
    eco.markets[site.id] = m;
    return m;
  }
  const dt = Math.max(0, now - m.t);
  if (dt > 0) {
    const f = 1 - Math.exp(-dt / MARKET.tau);
    for (const g of GOODS) {
      const eq = eqStockOf(site.profile, g.id);
      const cur = m.stock[g.id] ?? eq;
      m.stock[g.id] = cur + (eq - cur) * f;
    }
    m.t = now;
  }
  return m;
}

/** Marktpreis einer Ware bei diesem Vorrat (ohne Spanne und Tarif): Grundpreis · Gleichgewichtsfaktor · (Vorrat/Gleichgewicht)^−Elastizität · Kriegsaufschlag */
export function marketPrice(site: MarketSite, g: GoodId, stock: number): number {
  const def = GOOD_BY_ID[g];
  const eq = eqStockOf(site.profile, g);
  const ratio = Math.max(0.05, stock) / eq;
  const k = clamp(Math.pow(ratio, -MARKET.elasticity), MARKET.minK, MARKET.maxK);
  const war = def.war ? warPremium(site.war) : 1;
  return def.base * eqPriceOf(site.profile, g) * k * war * warDemandK(site.war, g) * (site.priceK ?? 1);
}

export interface Quote { units: number; total: number; avg: number; stockAfter: number }

/**
 * Handels-Talente (Phase 4.6E, Baum „Handelsimperium“): Einkaufs-Rabatt, Verkaufs-Aufschlag, mehr Frachtraum, weniger Fahndungsdruck.
 * Die Stückpreise behalten die Regel „Hin und Zurück im selben Hafen kostet immer Gold“: der Erlös bleibt unter 97 % des Hafen-Einkaufspreises,
 * der Einkauf über 103 % des Erlöses (`talentUnitPrices`). Ohne Talente sind die Preise genau die alten.
 */
export interface TradeTalent { buy: number; sell: number; cargo: number; smuggle: number }
export const NO_TRADE_TALENT: TradeTalent = { buy: 0, sell: 0, cargo: 0, smuggle: 0 };

/** Stückpreise beim Kaufen und Verkaufen zum Marktpreis `p` mit Tarif und Handels-Talenten */
export function talentUnitPrices(p: number, tariff: number, tal: TradeTalent = NO_TRADE_TALENT): { buy: number; sell: number } {
  const buyBase = p * (1 + MARKET.spread) * tariff;
  const sell = Math.min(p * (1 - MARKET.spread) * sellK(tariff) * (1 + Math.max(0, tal.sell)), buyBase * 0.97);
  const buy = Math.max(buyBase * (1 - Math.max(0, tal.buy)), sell * 1.03);
  return { buy, sell };
}

/** Kaufen: Stück für Stück, der Preis steigt mit jedem Stück (sinkender Vorrat). `tariff` ≥ 0,5 wirkt auf den Preis. */
export function quoteBuy(site: MarketSite, stock: number, g: GoodId, n: number, tariff = 1, tal: TradeTalent = NO_TRADE_TALENT): Quote {
  let s = stock, total = 0, units = 0;
  for (let i = 0; i < n && s >= 1; i++) {
    total += talentUnitPrices(marketPrice(site, g, s), tariff, tal).buy;
    s -= 1; units++;
  }
  return { units, total: Math.round(total), avg: units ? total / units : 0, stockAfter: s };
}

/**
 * Faktor auf den Erlös beim Verkaufen: ein Rabatt-Hafen (Tarif < 1) hat insgesamt niedrigere Preise (× Tarif), ein feindlicher (Tarif > 1)
 * zahlt weniger aus (÷ Tarif). So kostet Hin- und Rückweg im selben Hafen immer Gold, auch mit Rabatt (kein Handel im Kreis).
 */
export const sellK = (tariff: number): number => (tariff < 1 ? Math.max(0.5, tariff) : 1 / tariff);

/** Verkaufen: der Vorrat wächst, der Preis fällt mit jedem Stück. */
export function quoteSell(site: MarketSite, stock: number, g: GoodId, n: number, tariff = 1, tal: TradeTalent = NO_TRADE_TALENT): Quote {
  let s = stock, total = 0, units = 0;
  for (let i = 0; i < n; i++) {
    total += talentUnitPrices(marketPrice(site, g, s), tariff, tal).sell;
    s += 1; units++;
  }
  return { units, total: Math.round(total), avg: units ? total / units : 0, stockAfter: s };
}

export type Trend = 'billig' | 'normal' | 'teuer';
/** Preis-Pfeil: unter 90 % des Grundpreises „billig“ (kaufen), über 110 % „teuer“ (verkaufen) */
export function trendOf(price: number, g: GoodId): Trend {
  const r = price / GOOD_BY_ID[g].base;
  return r < 0.9 ? 'billig' : r > 1.1 ? 'teuer' : 'normal';
}

// ---------- Frachtraum und Handel ----------

export const cargoUsed = (eco: EconomyState): number => GOODS.reduce((a, g) => a + (eco.cargo[g.id]?.n ?? 0) * g.vol, 0);
/** Frachtraum der Klasse mit Talent-Bonus (Handelsimperium) */
export const cargoCapOf = (tier: number, cargoBonus = 0): number => Math.round(cargoCap(tier) * (1 + Math.max(0, cargoBonus)));
export const cargoFree = (eco: EconomyState, tier: number, cargoBonus = 0): number => Math.max(0, cargoCapOf(tier, cargoBonus) - cargoUsed(eco));
export const cargoCount = (eco: EconomyState, g: GoodId): number => eco.cargo[g]?.n ?? 0;
/** Kriegsware im Laderaum: Einheiten und Wert zu Grundpreisen */
export function warCargo(eco: EconomyState): { units: number; value: number } {
  let units = 0, value = 0;
  for (const g of GOODS) if (g.war) { const n = eco.cargo[g.id]?.n ?? 0; units += n; value += n * g.base; }
  return { units, value };
}

export interface TradeResult { ok: boolean; units: number; gold: number; message: string }

/** Ware kaufen: begrenzt durch Gold, Vorrat und freien Frachtraum; schreibt Vorrat, Fracht und (bei Kriegspreisen) die Fahndungs-Hitze */
export function buyGood(eco: EconomyState, site: MarketSite, now: number, g: GoodId, n: number, gold: number, tier: number, tariff = 1, tal: TradeTalent = NO_TRADE_TALENT): TradeResult {
  const def = GOOD_BY_ID[g];
  if (!def || n <= 0) return { ok: false, units: 0, gold: 0, message: '' };
  if (embargoed(site, g)) return { ok: false, units: 0, gold: 0, message: `Embargo${site.embargoBy ? ` gegen ${site.embargoBy}` : ''}: ${def.n} wird hier weder gekauft noch verkauft.` };
  const m = marketAt(eco, site, now);
  const stock = m.stock[g] ?? 0;
  const room = Math.floor(cargoFree(eco, tier, tal.cargo) / def.vol + 1e-9);
  if (room <= 0) return { ok: false, units: 0, gold: 0, message: 'Dein Frachtraum ist voll.' };
  if (stock < 1) return { ok: false, units: 0, gold: 0, message: `${def.n} ist hier ausverkauft.` };
  // so viele Stück, wie Gold, Platz und Vorrat erlauben
  let want = Math.min(Math.floor(n), room, Math.floor(stock));
  let q = quoteBuy(site, stock, g, want, tariff, tal);
  while (want > 0 && q.total > gold) { want--; q = quoteBuy(site, stock, g, want, tariff, tal); }
  if (want <= 0) return { ok: false, units: 0, gold: 0, message: `Dafür fehlt das Gold (${def.n} kostet hier ${Math.ceil(talentUnitPrices(marketPrice(site, g, stock), tariff, tal).buy)} Gold).` };
  m.stock[g] = q.stockAfter;
  const c = (eco.cargo[g] ??= { n: 0, cost: 0 });
  c.n += q.units; c.cost += q.total;
  addHeat(eco, site, g, q.units, tal.smuggle);
  return { ok: true, units: q.units, gold: -q.total, message: `${q.units} × ${def.n} gekauft (${q.total} Gold).` };
}

/** Ware verkaufen */
export function sellGood(eco: EconomyState, site: MarketSite, now: number, g: GoodId, n: number, tariff = 1, tal: TradeTalent = NO_TRADE_TALENT): TradeResult {
  const def = GOOD_BY_ID[g];
  const have = eco.cargo[g]?.n ?? 0;
  if (!def || n <= 0 || have <= 0) return { ok: false, units: 0, gold: 0, message: `Du hast kein ${def?.n ?? 'Gut'} geladen.` };
  if (embargoed(site, g)) return { ok: false, units: 0, gold: 0, message: `Embargo${site.embargoBy ? ` gegen ${site.embargoBy}` : ''}: ${def.n} wird hier weder gekauft noch verkauft.` };
  const m = marketAt(eco, site, now);
  const units = Math.min(Math.floor(n), have);
  const q = quoteSell(site, m.stock[g] ?? 0, g, units, tariff, tal);
  m.stock[g] = q.stockAfter;
  const c = eco.cargo[g]!;
  const costShare = c.cost * (units / have);
  c.n -= units; c.cost -= costShare;
  if (c.n <= 0) delete eco.cargo[g];
  addHeat(eco, site, g, units, tal.smuggle);
  const profit = q.total - Math.round(costShare);
  return { ok: true, units, gold: q.total, message: `${units} × ${def.n} verkauft (${q.total} Gold, ${profit >= 0 ? 'Gewinn' : 'Verlust'} ${Math.abs(profit)}).` };
}

/** Kriegsware zu Kriegspreisen zu handeln zieht Fahnder an */
function addHeat(eco: EconomyState, site: MarketSite, g: GoodId, units: number, smuggle = 0) {
  const def = GOOD_BY_ID[g];
  if (!def.war || warPremium(site.war) < 1.3) return;
  eco.heat = Math.min(CONTRABAND.heatMax, eco.heat + units * def.vol * CONTRABAND.heatPerUnit * (1 - Math.min(0.9, Math.max(0, smuggle))));
}

export const decayHeat = (eco: EconomyState, dt: number) => { if (eco.heat > 0) eco.heat = Math.max(0, eco.heat - dt * CONTRABAND.heatDecay); };

/** Preisübersicht des besuchten Hafens im Kontor merken */
export function recordLedger(eco: EconomyState, site: MarketSite, now: number, tariff: number, tal: TradeTalent = NO_TRADE_TALENT): void {
  const m = marketAt(eco, site, now);
  const buy: Partial<Record<GoodId, number>> = {}, sell: Partial<Record<GoodId, number>> = {};
  for (const g of GOODS) {
    const p = talentUnitPrices(marketPrice(site, g.id, m.stock[g.id] ?? eqStockOf(site.profile, g.id)), tariff, tal);
    buy[g.id] = Math.round(p.buy);
    sell[g.id] = Math.round(p.sell);
  }
  eco.ledger[site.id] = { name: site.name, t: now, buy, sell };
}

export { profileOf };

// ---------- Kontrollen ----------

export interface InspectResult { checked: boolean; seized: number; fine: number; hunters: boolean }

/**
 * Anlegen in einem Hafen einer Macht: mit Kriegsware an Bord kann kontrolliert werden. Chance = 5 % + Hitze/150 (Marine ×1,5), höchstens 85 %.
 * Bei einer Kontrolle wird ALLE Kriegsware beschlagnahmt und ein Viertel ihres Werts als Strafe fällig; ab Hitze 60 rücken Kopfgeldjäger aus.
 */
export function inspectCargo(eco: EconomyState, o: { lawful: boolean; marine: boolean; rnd?: () => number }): InspectResult {
  const none = { checked: false, seized: 0, fine: 0, hunters: false };
  const w = warCargo(eco);
  if (!o.lawful || w.units <= 0) return none;
  const chance = Math.min(CONTRABAND.checkMax, (CONTRABAND.baseCheck + eco.heat / 150) * (o.marine ? CONTRABAND.marineK : 1));
  if ((o.rnd ?? Math.random)() >= chance) return none;
  for (const g of GOODS) if (g.war) delete eco.cargo[g.id];
  const hunters = eco.heat >= CONTRABAND.huntersAt;
  eco.heat = Math.max(0, eco.heat - 25);
  return { checked: true, seized: w.units, fine: Math.round(w.value * CONTRABAND.fine), hunters };
}

// ---------- Zölle und Tarife ----------

export interface Tariff { factor: number; closed: boolean; kind: 'rabatt' | 'normal' | 'schwarzmarkt' | 'gesperrt'; discount: number }

/**
 * Hafen-Tarif einer Macht: gutes Ansehen und hohe Ehre senken die Preise (bis −25 %), feindliches Ansehen (< 0) bringt den
 * Schwarzmarkt-Zuschlag (+35 %), ab −60 sperrt die Macht den Hafen. Freihäfen (`lawful` = false) haben immer den Grundpreis.
 */
export function tariffOf(standing: number, honor: number, lawful: boolean): Tariff {
  if (!lawful) return { factor: 1, closed: false, kind: 'normal', discount: 0 };
  if (standing < 0) return { factor: 1 + TARIFF.blackMarket, closed: standing <= TARIFF.closedBelow, kind: standing <= TARIFF.closedBelow ? 'gesperrt' : 'schwarzmarkt', discount: -TARIFF.blackMarket };
  let d = 0;
  for (const [min, v] of TARIFF.discounts) if (standing >= min) d = v;
  d += Math.min(TARIFF.honorMax, (Math.max(0, honor) / TARIFF.honorFull) * TARIFF.honorMax);
  d = Math.min(TARIFF.maxDiscount, d);
  return { factor: 1 - d, closed: false, kind: d > 0 ? 'rabatt' : 'normal', discount: d };
}

// ---------- Unterhalt ----------

export interface UpkeepInput {
  tier: number; seamen: number; troops: number; officers: number;
  /** Gesamtstufe der Schiffs-Evolution 1 … 5 (data/shipEvolution.ts): erhöht die Wartung des Schiffs um bis zu +35 % */
  evoTier?: number;
  /** Aktive Begleitschiffe der Flotte (data/playerFleet.ts `fleetUpkeepList`): Klasse, Seeleute-Köpfe und Gesamtstufe je Schiff; eingemottete zahlen nichts */
  fleet?: readonly { tier: number; seamen: number; evoTier: number }[];
  /** Faktor auf den gesamten Unterhalt (Talente „Kontorkette“, „Reederei“: unter 1); fehlt er, gilt 1 */
  k?: number;
}
export interface Upkeep { seamen: number; troops: number; officers: number; hull: number; /** Sold und Wartung aller aktiven Begleitschiffe */ fleet: number; daily: number; perPeriod: number }

/** Sold und Proviant: Köpfe der Seeleute und Truppen, Offiziere und Wartung der Schiffsklasse, je Ingame-Tag und je Zahltag */
export function upkeepOf(i: UpkeepInput): Upkeep {
  const evoK = 1 + EVO_UPKEEP_MAX * (clamp(Math.round(i.evoTier ?? 1), 1, 5) - 1) / 4;
  const hull = UPKEEP.hull[clamp(Math.floor(i.tier), 0, UPKEEP.hull.length - 1)] * evoK;
  const seamen = Math.max(0, i.seamen) * UPKEEP.seaman, troops = Math.max(0, i.troops) * UPKEEP.trooper, officers = Math.max(0, i.officers) * UPKEEP.officer;
  let fleet = 0;
  for (const f of i.fleet ?? []) fleet += shipUpkeepDaily(f).daily;
  const k = Math.max(0.5, Math.min(1, i.k ?? 1));
  const daily = (seamen + troops + officers + hull + fleet) * k;
  return { seamen: seamen * k, troops: troops * k, officers: officers * k, hull: hull * k, fleet: fleet * k, daily, perPeriod: daily / UPKEEP.periodsPerDay };
}

export type UpkeepEvent =
  | { type: 'warn'; due: number }
  | { type: 'paid'; paid: number; due: number }
  | { type: 'short'; paid: number; due: number; arrears: number };

/** Moral → Wirksamkeit der Crew (Nachladen, Segeln, Reparatur): 0,55 … 1 */
export const moraleEfficiency = (m: number): number => UPKEEP.moraleBase + (1 - UPKEEP.moraleBase) * clamp(m, 0, 1);

/**
 * Zahltage abrechnen. Reicht das Gold nicht, wird gezahlt, was da ist; der Rest bleibt als Rückstand stehen, die Moral sinkt und die
 * Offiziere verlieren Treue (`loyaltyLoss` je ausgebliebenem Zahltag, anzuwenden vom Aufrufer). Gezahlte Zahltage heben die Moral wieder.
 * Liefert das ausgegebene Gold (positiv). Mehr als `maxCatchUp` versäumte Zahltage am Stück werden nicht nachträglich abgerechnet.
 */
export function stepUpkeep(eco: EconomyState, now: number, gold: number, input: UpkeepInput): { spent: number; events: UpkeepEvent[]; missed: number } {
  const events: UpkeepEvent[] = [];
  const per = upkeepOf(input).perPeriod;
  let spent = 0, missed = 0, loops = 0;
  if (!eco.warned && now >= eco.nextPay - UPKEEP.warnLead && now < eco.nextPay && gold < per + eco.arrears) {
    eco.warned = true;
    events.push({ type: 'warn', due: Math.ceil(per + eco.arrears) });
  }
  while (now >= eco.nextPay) {
    if (loops++ >= UPKEEP.maxCatchUp) { eco.nextPay = now + UPKEEP.period; break; }
    const due = per + eco.arrears;
    const pay = Math.max(0, Math.min(due, gold - spent));
    spent += pay;
    eco.arrears = Math.max(0, due - pay);
    if (eco.arrears < 0.5) {
      eco.arrears = 0;
      eco.morale = Math.min(1, eco.morale + UPKEEP.moralePaid);
      events.push({ type: 'paid', paid: Math.round(pay), due: Math.round(due) });
    } else {
      eco.morale = Math.max(UPKEEP.moraleMin, eco.morale - UPKEEP.moraleMiss);
      missed++;
      events.push({ type: 'short', paid: Math.round(pay), due: Math.round(due), arrears: Math.round(eco.arrears) });
    }
    eco.nextPay += UPKEEP.period;
    eco.warned = false;
  }
  return { spent: Math.round(spent), events, missed };
}

// ---------- Werft ----------

/** Kosten der Reparatur in der Werft: wachsen mit der Schiffsgröße (Länge · Breite) und mit dem Schadensgrad (stärker beschädigt = teurer je Punkt) */
export function yardRepairCost(o: { L: number; W: number; hullMax: number; hullFrac: number; sailMax: number; sailFrac: number; tariff?: number }): number {
  const classK = Math.pow((o.L * o.W) / (18 * 5.8), 0.4);
  const hullMiss = Math.max(0, 1 - o.hullFrac), sailMiss = Math.max(0, 1 - o.sailFrac);
  const hull = hullMiss * o.hullMax * 0.6 * (1 + 0.8 * hullMiss);
  const sail = sailMiss * o.sailMax * 0.9 * (1 + 0.8 * sailMiss);
  return Math.ceil((hull + sail) * classK * (o.tariff ?? 1));
}

// ---------- Schiffsbeute (Handelswaren) ----------

export interface SalvageIn {
  role: 'haendler' | 'patrouille' | 'jaeger' | 'legende';
  /** Weltmacht des Schiffs (data/factions.ts); fehlt bei freien Schiffen */
  power?: string | null;
  level: number;
  /** Abstand zur nächsten Sektorgrenze (m): nahe der Grenze führen Kriegsschiffe seltene Kriegsware */
  borderDist: number;
  /** Geentert (Ladung unversehrt, +30 %) oder versenkt (nur 65 % treiben herüber) */
  boarded: boolean;
}
export interface SalvageDrop { good: GoodId; units: number }

const WAR_GOODS: GoodId[] = ['schiesspulver', 'waffenkisten', 'medizin'];
const GENERIC: GoodId[] = ['stoffe', 'tuch', 'tee', 'wein', 'werkzeuge', 'gewuerze'];

/**
 * Was ein besiegtes Schiff an Handelsgütern trägt: Händler führen die Erzeugnisse ihrer Macht (2 – 3 Posten), Kriegsschiffe Marine-Ausrüstung
 * und Kriegsware (1 – 2 Posten), Legenden Luxusgüter; nahe einer Sektorgrenze kommt mit etwas Glück ein Posten Kriegsware dazu. Menge: ein
 * Wertbudget (30 + 12 · Stufe Gold zu Grundpreisen) je Schiff, verteilt auf die Posten.
 */
export function rollSalvage(i: SalvageIn, rnd: () => number = Math.random): SalvageDrop[] {
  const profile = profileOf({ id: 'ship', factionId: i.power ?? null });
  const pick = (list: readonly GoodId[]) => list[Math.floor(rnd() * list.length) % list.length];
  const goods: GoodId[] = [];
  if (i.role === 'legende') goods.push('luxusgueter', rnd() < 0.5 ? 'seide' : 'fechtklingen');
  else if (i.role === 'haendler') {
    const src = profile.produce.length ? profile.produce.filter((g) => !GOOD_BY_ID[g].war) : GENERIC;
    const n = 2 + (rnd() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) { const g = pick(src.length ? src : GENERIC); if (!goods.includes(g)) goods.push(g); }
    if (i.borderDist < MARKET.warBorderDist && rnd() < 0.3) goods.push(pick(WAR_GOODS));
  } else {
    goods.push(rnd() < 0.55 ? pick(WAR_GOODS) : 'marineausruestung');
    if (rnd() < 0.5) goods.push(pick(profile.produce.length ? profile.produce : GENERIC));
    if (i.borderDist < MARKET.warBorderDist && rnd() < 0.5 && !goods.some((g) => GOOD_BY_ID[g].war)) goods.push(pick(WAR_GOODS));
  }
  // Wertbudget je Schiff (Gold zu Grundpreisen): 30 + 12 · Stufe, geentert ×1,3, versenkt ×0,65, Legenden ×3; verteilt auf die Posten
  const budget = (30 + 12 * Math.max(1, i.level)) * (i.boarded ? 1.3 : 0.65) * (i.role === 'legende' ? 3 : 1);
  const per = budget / Math.max(1, goods.length);
  const out: SalvageDrop[] = [];
  for (const g of goods) {
    const units = Math.max(1, Math.round((per / GOOD_BY_ID[g].base) * (0.8 + rnd() * 0.4)));
    out.push({ good: g, units });
  }
  return out;
}

export interface SalvageResult { taken: SalvageDrop[]; lost: number; heat: number }

/** Beute an Bord nehmen: nur so viel, wie der freie Frachtraum fasst (der Rest geht verloren); Kriegsware erhöht den Fahndungsdruck */
export function applySalvage(eco: EconomyState, drops: readonly SalvageDrop[], tier: number, tal: TradeTalent = NO_TRADE_TALENT): SalvageResult {
  const taken: SalvageDrop[] = [];
  let lost = 0, heat = 0;
  for (const d of drops) {
    const def = GOOD_BY_ID[d.good];
    const room = Math.floor(cargoFree(eco, tier, tal.cargo) / def.vol + 1e-9);
    const n = Math.max(0, Math.min(d.units, room));
    lost += d.units - n;
    if (n <= 0) continue;
    const c = (eco.cargo[d.good] ??= { n: 0, cost: 0 });
    c.n += n;
    taken.push({ good: d.good, units: n });
    if (def.war) heat += n * def.vol * CONTRABAND.heatPerUnit * 0.5 * (1 - Math.min(0.9, Math.max(0, tal.smuggle)));
  }
  eco.heat = Math.min(CONTRABAND.heatMax, eco.heat + heat);
  return { taken, lost, heat };
}

/** Ware aus dem Frachtraum verbrauchen (Werft-Material): nur wenn genug da ist; der Einstandspreis sinkt anteilig. Liefert, ob es geklappt hat. */
export function takeCargo(eco: EconomyState, good: GoodId, n: number): boolean {
  const c = eco.cargo[good];
  if (!c || n <= 0 || c.n < n) return false;
  const share = c.cost * (n / c.n);
  c.n -= n;
  c.cost -= share;
  if (c.n <= 0) delete eco.cargo[good];
  return true;
}
