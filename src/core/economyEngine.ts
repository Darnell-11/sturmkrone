// Ökonomie-Engine: Märkte (Angebot, Nachfrage, Elastizität, Kriegspreise), Frachtraum, Schmuggel-Kontrollen, Hafen-Tarife, Unterhalt (Sold)
// und Werft-Kosten. Reine Funktionen auf `EconomyState` (data/economy.ts): ohne three.js, ohne Zufall außer über einen übergebenen
// Würfel (`rnd`), ohne Uhr außer der Spielzeit in Sekunden. Damit sind alle Regeln testbar und ein Server kann dieselben Märkte führen.
import {
  CARGO_CAP, CONTRABAND, GOODS, GOOD_BY_ID, MARKET, TARIFF, UPKEEP, cargoCap, profileOf,
  type EconomyState, type GoodId, type MarketProfile, type MarketState,
} from '../data/economy';
import { clamp } from './mathUtil';

export { cargoCap, CARGO_CAP };

// ---------- Märkte ----------

type Role = 'produce' | 'normal' | 'demand';
export const roleOf = (p: MarketProfile, g: GoodId): Role => (p.produce.includes(g) ? 'produce' : p.demand.includes(g) ? 'demand' : 'normal');
export const eqStockOf = (p: MarketProfile, g: GoodId): number => MARKET.eqStock[roleOf(p, g)];
export const eqPriceOf = (p: MarketProfile, g: GoodId): number => MARKET.eqPrice[roleOf(p, g)];

/** Märkte eines Orts: Schlüssel der Insel, Profil und Kriegslage (siehe `warPremium`) */
export interface MarketSite { id: string; name: string; profile: MarketProfile; war: WarSite }
export interface WarSite { borderDist: number; occupied: boolean; fort: boolean }

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
  return def.base * eqPriceOf(site.profile, g) * k * war;
}

export interface Quote { units: number; total: number; avg: number; stockAfter: number }

/** Kaufen: Stück für Stück, der Preis steigt mit jedem Stück (sinkender Vorrat). `tariff` ≥ 0,5 wirkt auf den Preis. */
export function quoteBuy(site: MarketSite, stock: number, g: GoodId, n: number, tariff = 1): Quote {
  let s = stock, total = 0, units = 0;
  for (let i = 0; i < n && s >= 1; i++) {
    total += marketPrice(site, g, s) * (1 + MARKET.spread) * tariff;
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
export function quoteSell(site: MarketSite, stock: number, g: GoodId, n: number, tariff = 1): Quote {
  let s = stock, total = 0, units = 0;
  for (let i = 0; i < n; i++) {
    total += marketPrice(site, g, s) * (1 - MARKET.spread) * sellK(tariff);
    s += 1; units++;
  }
  return { units, total: Math.round(total), avg: units ? total / units : 0, stockAfter: s };
}

export type Trend = 'billig' | 'normal' | 'teuer';
/** Preis-Pfeil: unter 85 % des Grundpreises „billig“ (kaufen), über 115 % „teuer“ (verkaufen) */
export function trendOf(price: number, g: GoodId): Trend {
  const r = price / GOOD_BY_ID[g].base;
  return r < 0.85 ? 'billig' : r > 1.15 ? 'teuer' : 'normal';
}

// ---------- Frachtraum und Handel ----------

export const cargoUsed = (eco: EconomyState): number => GOODS.reduce((a, g) => a + (eco.cargo[g.id]?.n ?? 0) * g.vol, 0);
export const cargoFree = (eco: EconomyState, tier: number): number => Math.max(0, cargoCap(tier) - cargoUsed(eco));
export const cargoCount = (eco: EconomyState, g: GoodId): number => eco.cargo[g]?.n ?? 0;
/** Kriegsware im Laderaum: Einheiten und Wert zu Grundpreisen */
export function warCargo(eco: EconomyState): { units: number; value: number } {
  let units = 0, value = 0;
  for (const g of GOODS) if (g.war) { const n = eco.cargo[g.id]?.n ?? 0; units += n; value += n * g.base; }
  return { units, value };
}

export interface TradeResult { ok: boolean; units: number; gold: number; message: string }

/** Ware kaufen: begrenzt durch Gold, Vorrat und freien Frachtraum; schreibt Vorrat, Fracht und (bei Kriegspreisen) die Fahndungs-Hitze */
export function buyGood(eco: EconomyState, site: MarketSite, now: number, g: GoodId, n: number, gold: number, tier: number, tariff = 1): TradeResult {
  const def = GOOD_BY_ID[g];
  if (!def || n <= 0) return { ok: false, units: 0, gold: 0, message: '' };
  const m = marketAt(eco, site, now);
  const stock = m.stock[g] ?? 0;
  const room = Math.floor(cargoFree(eco, tier) / def.vol + 1e-9);
  if (room <= 0) return { ok: false, units: 0, gold: 0, message: 'Dein Frachtraum ist voll.' };
  if (stock < 1) return { ok: false, units: 0, gold: 0, message: `${def.n} ist hier ausverkauft.` };
  // so viele Stück, wie Gold, Platz und Vorrat erlauben
  let want = Math.min(Math.floor(n), room, Math.floor(stock));
  let q = quoteBuy(site, stock, g, want, tariff);
  while (want > 0 && q.total > gold) { want--; q = quoteBuy(site, stock, g, want, tariff); }
  if (want <= 0) return { ok: false, units: 0, gold: 0, message: `Dafür fehlt das Gold (${def.n} kostet hier ${Math.ceil(marketPrice(site, g, stock) * (1 + MARKET.spread) * tariff)} Gold).` };
  m.stock[g] = q.stockAfter;
  const c = (eco.cargo[g] ??= { n: 0, cost: 0 });
  c.n += q.units; c.cost += q.total;
  addHeat(eco, site, g, q.units);
  return { ok: true, units: q.units, gold: -q.total, message: `${q.units} × ${def.n} gekauft (${q.total} Gold).` };
}

/** Ware verkaufen */
export function sellGood(eco: EconomyState, site: MarketSite, now: number, g: GoodId, n: number, tariff = 1): TradeResult {
  const def = GOOD_BY_ID[g];
  const have = eco.cargo[g]?.n ?? 0;
  if (!def || n <= 0 || have <= 0) return { ok: false, units: 0, gold: 0, message: `Du hast kein ${def?.n ?? 'Gut'} geladen.` };
  const m = marketAt(eco, site, now);
  const units = Math.min(Math.floor(n), have);
  const q = quoteSell(site, m.stock[g] ?? 0, g, units, tariff);
  m.stock[g] = q.stockAfter;
  const c = eco.cargo[g]!;
  const costShare = c.cost * (units / have);
  c.n -= units; c.cost -= costShare;
  if (c.n <= 0) delete eco.cargo[g];
  addHeat(eco, site, g, units);
  const profit = q.total - Math.round(costShare);
  return { ok: true, units, gold: q.total, message: `${units} × ${def.n} verkauft (${q.total} Gold, ${profit >= 0 ? 'Gewinn' : 'Verlust'} ${Math.abs(profit)}).` };
}

/** Kriegsware zu Kriegspreisen zu handeln zieht Fahnder an */
function addHeat(eco: EconomyState, site: MarketSite, g: GoodId, units: number) {
  const def = GOOD_BY_ID[g];
  if (!def.war || warPremium(site.war) < 1.3) return;
  eco.heat = Math.min(CONTRABAND.heatMax, eco.heat + units * def.vol * CONTRABAND.heatPerUnit);
}

export const decayHeat = (eco: EconomyState, dt: number) => { if (eco.heat > 0) eco.heat = Math.max(0, eco.heat - dt * CONTRABAND.heatDecay); };

/** Preisübersicht des besuchten Hafens im Kontor merken */
export function recordLedger(eco: EconomyState, site: MarketSite, now: number, tariff: number): void {
  const m = marketAt(eco, site, now);
  const buy: Partial<Record<GoodId, number>> = {}, sell: Partial<Record<GoodId, number>> = {};
  for (const g of GOODS) {
    const p = marketPrice(site, g.id, m.stock[g.id] ?? eqStockOf(site.profile, g.id));
    buy[g.id] = Math.round(p * (1 + MARKET.spread) * tariff);
    sell[g.id] = Math.round(p * (1 - MARKET.spread) * sellK(tariff));
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

export interface UpkeepInput { tier: number; seamen: number; troops: number; officers: number }
export interface Upkeep { seamen: number; troops: number; officers: number; hull: number; daily: number; perPeriod: number }

/** Sold und Proviant: Köpfe der Seeleute und Truppen, Offiziere und Wartung der Schiffsklasse, je Ingame-Tag und je Zahltag */
export function upkeepOf(i: UpkeepInput): Upkeep {
  const hull = UPKEEP.hull[clamp(Math.floor(i.tier), 0, UPKEEP.hull.length - 1)];
  const seamen = Math.max(0, i.seamen) * UPKEEP.seaman, troops = Math.max(0, i.troops) * UPKEEP.trooper, officers = Math.max(0, i.officers) * UPKEEP.officer;
  const daily = seamen + troops + officers + hull;
  return { seamen, troops, officers, hull, daily, perPeriod: daily / UPKEEP.periodsPerDay };
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
