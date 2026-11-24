// Ökonomie: Handelswaren und Marktprofile, Elastizität und Erholung, Frachtraum, Kriegspreise und Kontrollen, Tarife, Unterhalt, Werft.
import { describe, expect, it } from 'vitest';
import {
  AMMO_UNLOCK, BAG_K, CARGO_CAP, CONTRABAND, GOODS, GOOD_BY_ID, MARKET, PROFILES, TARIFF, UPKEEP, bagMax, cargoCap, cleanEconomy, emptyEconomy, profileOf,
  type GoodId,
} from '../src/data/economy';
import {
  buyGood, cargoFree, cargoUsed, decayHeat, inspectCargo, marketAt, marketPrice, moraleEfficiency, quoteBuy, quoteSell, recordLedger, roleOf, sellGood,
  stepUpkeep, tariffOf, trendOf, upkeepOf, warCargo, warPremium, yardRepairCost, type MarketSite,
} from '../src/core/economyEngine';
import { SHIP_CLASSES } from '../src/data/ships';
import { shopGate } from '../src/data/crafting';
import { TIER_DEFS } from '../src/data/balanceConfig';
import { applyRepair, createShipSim, needsRepair, stepPassiveRepair, SEA_REPAIR_CAP, crewEffects } from '../src/naval/shipSim';
import { createSave, SAVE_VERSION } from '../src/core/save/types';
import { migrateSave } from '../src/core/save/migrations';
import type { EntityId } from '../src/sim/entityId';

const calm = { borderDist: 5000, occupied: false, fort: false };
const site = (profileKey: string | null, war = calm, id = 'x'): MarketSite => ({ id, name: id, profile: profileKey ? profileOf({ id, factionId: profileKey, region: profileKey }) : { produce: [], demand: [] }, war });

describe('Waren und Marktprofile', () => {
  it('alle geforderten Waren existieren, Kriegswaren sind markiert', () => {
    for (const id of ['kanonenstahl', 'werkzeuge', 'schwefel', 'obsidian', 'schmiedekohle', 'gewuerze', 'stoffe', 'luxusgueter', 'tuch', 'tee', 'marineausruestung', 'wein', 'seide', 'fechtklingen', 'schiesspulver', 'waffenkisten', 'medizin']) expect(GOOD_BY_ID[id], id).toBeDefined();
    expect(GOODS.filter((g) => g.war).map((g) => g.id).sort()).toEqual(['medizin', 'schiesspulver', 'waffenkisten']);
    expect(new Set(GOODS.map((g) => g.id)).size).toBe(GOODS.length);
    for (const g of GOODS) { expect(g.base).toBeGreaterThan(0); expect(g.vol).toBeGreaterThan(0); }
  });

  it('die Spezialitäten der Regionen und Mächte stimmen mit dem Entwurf überein', () => {
    expect(PROFILES.nordwacht.produce).toEqual(expect.arrayContaining(['kanonenstahl', 'werkzeuge']));
    expect(PROFILES.glutring.produce).toEqual(expect.arrayContaining(['schwefel', 'obsidian', 'schmiedekohle']));
    expect(PROFILES.niederlande.produce).toEqual(expect.arrayContaining(['gewuerze', 'stoffe', 'luxusgueter']));
    expect(PROFILES.england.produce).toEqual(expect.arrayContaining(['tuch', 'tee', 'marineausruestung']));
    expect(PROFILES.frankreich.produce).toEqual(expect.arrayContaining(['wein', 'seide', 'fechtklingen']));
  });

  it('jede Ware wird irgendwo erzeugt und irgendwo gebraucht; nichts wird am selben Ort erzeugt und verlangt', () => {
    for (const g of GOODS) {
      expect(Object.values(PROFILES).some((p) => p.produce.includes(g.id)), `erzeugt: ${g.id}`).toBe(true);
      expect(Object.values(PROFILES).some((p) => p.demand.includes(g.id)), `gebraucht: ${g.id}`).toBe(true);
    }
    for (const k of Object.keys(PROFILES)) { const p = profileOf({ id: 'i', factionId: k }); for (const g of p.produce) expect(p.demand.includes(g)).toBe(false); }
    // Region und Macht werden vereinigt
    const p = profileOf({ id: 'i', region: 'nordwacht', factionId: 'england' });
    expect(p.produce).toEqual(expect.arrayContaining(['kanonenstahl', 'tuch']));
    expect(profileOf({ id: 'ankerglueck', factionId: null })).toEqual({ produce: [], demand: [] });
  });
});

describe('Markt-Elastizität und Erholung', () => {
  const S = site('niederlande');
  it('Überschuss ist billig, Bedarf teuer, normale Waren zum Grundpreis', () => {
    const e = emptyEconomy(); const m = marketAt(e, S, 0);
    const price = (g: GoodId) => marketPrice(S, g, m.stock[g]!);
    expect(price('gewuerze')).toBeLessThan(GOOD_BY_ID.gewuerze.base * 0.9);
    expect(price('kanonenstahl')).toBeGreaterThan(GOOD_BY_ID.kanonenstahl.base * 1.15);
    expect(price('tee')).toBeCloseTo(GOOD_BY_ID.tee.base, 5);
    expect(roleOf(S.profile, 'gewuerze')).toBe('produce');
    expect(trendOf(price('gewuerze'), 'gewuerze')).toBe('billig');
    expect(trendOf(price('kanonenstahl'), 'kanonenstahl')).toBe('teuer');
    expect(trendOf(price('tee'), 'tee')).toBe('normal');
  });

  it('Aufkaufen lässt den Preis steigen, Verkaufen lässt ihn fallen, jedes weitere Stück ist teurer bzw. billiger', () => {
    const e = emptyEconomy(); const m = marketAt(e, S, 0);
    const stock = m.stock.gewuerze!;
    const one = quoteBuy(S, stock, 'gewuerze', 1).total, ten = quoteBuy(S, stock, 'gewuerze', 10).total, hundred = quoteBuy(S, stock, 'gewuerze', 100).total;
    expect(ten / 10).toBeGreaterThan(one - 1);
    expect(hundred / 100).toBeGreaterThan(ten / 10);
    expect(quoteBuy(S, stock, 'gewuerze', 100).stockAfter).toBeCloseTo(stock - 100);
    const s1 = quoteSell(S, 40, 'kanonenstahl', 1).total, s50 = quoteSell(S, 40, 'kanonenstahl', 50);
    expect(s50.avg).toBeLessThan(s1);
    expect(s50.stockAfter).toBe(90);
    // Preis ist begrenzt: kein Ausverkauf-Wucher und kein Verschenken
    for (const st of [0, 0.001, 1e5]) { const p = marketPrice(S, 'tee', st); expect(p).toBeGreaterThanOrEqual(GOOD_BY_ID.tee.base * MARKET.minK - 1e-9); expect(p).toBeLessThanOrEqual(GOOD_BY_ID.tee.base * MARKET.maxK + 1e-9); }
  });

  it('der Vorrat erholt sich mit der Spielzeit zum Gleichgewicht (keine Hintergrundrechnung nötig)', () => {
    const e = emptyEconomy();
    const gold = 1e6;
    buyGood(e, S, 0, 'gewuerze', 150, gold, 6);
    const low = e.markets.x.stock.gewuerze!;
    expect(low).toBeLessThan(MARKET.eqStock.produce - 100);
    const half = marketAt(e, S, MARKET.tau).stock.gewuerze!;
    expect(half).toBeGreaterThan(low);
    expect(half).toBeLessThan(MARKET.eqStock.produce);
    const later = marketAt(e, S, MARKET.tau * 8).stock.gewuerze!;
    expect(Math.abs(later - MARKET.eqStock.produce)).toBeLessThan(2);
    // dasselbe in einem Schritt oder in vielen: gleiches Ergebnis (stetige Rechnung)
    const a = emptyEconomy(), b = emptyEconomy();
    buyGood(a, S, 0, 'gewuerze', 100, gold, 6); buyGood(b, S, 0, 'gewuerze', 100, gold, 6);
    for (let t = 100; t <= 1000; t += 100) marketAt(a, S, t);
    expect(marketAt(a, S, 1000).stock.gewuerze!).toBeCloseTo(marketAt(b, S, 1000).stock.gewuerze!, 6);
  });

  it('Händlerspanne: im selben Markt hin und zurück kostet Gold; zwischen Überschuss und Bedarf lohnt sich Handel, aber nicht unbegrenzt', () => {
    const e = emptyEconomy(); const gold = 1e6;
    const b = buyGood(e, S, 0, 'gewuerze', 10, gold, 6);
    const back = sellGood(e, S, 0, 'gewuerze', 10);
    expect(back.gold).toBeLessThan(-b.gold);
    // Gewürze: niederländischer Überschuss → englischer Bedarf
    const buyHere = site('niederlande', calm, 'nl'), sellThere = site('england', calm, 'en');
    const e2 = emptyEconomy();
    const cost = -buyGood(e2, buyHere, 0, 'gewuerze', 20, gold, 6).gold;
    const income = sellGood(e2, sellThere, 0, 'gewuerze', 20).gold;
    expect(income).toBeGreaterThan(cost * 1.05);        // lohnt sich, aber mit schmaler Spanne (siehe tests/economyBalance.test.ts)
    // wer 400 Stück auf einmal in den Bedarfsmarkt kippt, drückt den Preis weit unter den Anfangspreis
    const first = quoteSell(sellThere, 40, 'gewuerze', 1).total;
    expect(quoteSell(sellThere, 40, 'gewuerze', 400).avg).toBeLessThan(first * 0.6);
  });
});

describe('Frachtraum', () => {
  it('wächst mit der Schiffsklasse, eine Zahl je Klasse', () => {
    expect(CARGO_CAP.length).toBe(SHIP_CLASSES.length);
    expect(BAG_K.length).toBe(SHIP_CLASSES.length);
    for (let i = 1; i < CARGO_CAP.length; i++) { expect(CARGO_CAP[i]).toBeGreaterThan(CARGO_CAP[i - 1]); expect(BAG_K[i]).toBeGreaterThanOrEqual(BAG_K[i - 1]); }
    expect(cargoCap(6)).toBeGreaterThan(cargoCap(0) * 10);
    expect(cargoCap(-4)).toBe(CARGO_CAP[0]);
    expect(cargoCap(99)).toBe(CARGO_CAP[6]);
    expect(bagMax(8, 0)).toBe(8);
    expect(bagMax(8, 6)).toBe(24);
  });

  it('Kaufen ist durch Frachtraum, Gold und Vorrat begrenzt und rechnet das Volumen der Ware', () => {
    const S2 = site('nordwacht');
    const e = emptyEconomy();
    // Kanonenstahl braucht 2 Platz: in der Schaluppe (30) passen höchstens 15
    const r = buyGood(e, S2, 0, 'kanonenstahl', 999, 1e9, 0);
    expect(r.units).toBe(15);
    expect(cargoUsed(e)).toBeCloseTo(30);
    expect(cargoFree(e, 0)).toBe(0);
    expect(buyGood(e, S2, 0, 'werkzeuge', 1, 1e9, 0).ok).toBe(false);
    // dasselbe Schiff mit mehr Raum nimmt mehr
    expect(buyGood(emptyEconomy(), S2, 0, 'kanonenstahl', 999, 1e9, 6).units).toBeGreaterThan(100);
    // Gold begrenzt
    const poor = buyGood(emptyEconomy(), S2, 0, 'kanonenstahl', 15, 100, 6);
    expect(poor.units).toBeLessThan(5);
    expect(-poor.gold).toBeLessThanOrEqual(100);
    expect(buyGood(emptyEconomy(), S2, 0, 'kanonenstahl', 5, 3, 6).ok).toBe(false);
    // Vorrat begrenzt: niemand kauft mehr, als da ist
    expect(buyGood(emptyEconomy(), site('niederlande'), 0, 'kanonenstahl', 999, 1e9, 6).units).toBeLessThanOrEqual(MARKET.eqStock.demand);
  });

  it('Verkaufen gibt Platz frei und kennt den Gewinn; nichts zu verkaufen = kein Handel', () => {
    const e = emptyEconomy();
    const S2 = site('nordwacht');
    buyGood(e, S2, 0, 'werkzeuge', 10, 1e9, 3);
    const used = cargoUsed(e);
    expect(sellGood(e, S2, 0, 'werkzeuge', 4).units).toBe(4);
    expect(cargoUsed(e)).toBeLessThan(used);
    expect(e.cargo.werkzeuge!.n).toBe(6);
    expect(sellGood(e, S2, 0, 'werkzeuge', 99).units).toBe(6);
    expect(e.cargo.werkzeuge).toBeUndefined();
    expect(sellGood(e, S2, 0, 'werkzeuge', 1).ok).toBe(false);
  });
});

describe('Kriegspreise, Schmuggel und Kontrollen', () => {
  it('Kriegsware kostet an Grenzen, auf besetzten Inseln und in Festungen mehr; nur sie', () => {
    const far = site('deutschland', calm), border = site('deutschland', { ...calm, borderDist: 100 }), occ = site('deutschland', { ...calm, occupied: true }), fort = site('deutschland', { ...calm, fort: true });
    const price = (S: MarketSite, g: GoodId) => marketPrice(S, g, MARKET.eqStock.normal);
    expect(price(border, 'medizin')).toBeGreaterThan(price(far, 'medizin') * 1.4);
    expect(price(occ, 'medizin')).toBeGreaterThan(price(far, 'medizin') * 1.8);
    expect(price(fort, 'medizin')).toBeGreaterThan(price(far, 'medizin') * 1.3);
    expect(price(border, 'tee')).toBe(price(far, 'tee'));
    expect(warPremium({ borderDist: 0, occupied: true, fort: true })).toBeLessThanOrEqual(MARKET.warMax);
    expect(warPremium(calm)).toBe(1);
    expect(warPremium({ borderDist: 50, occupied: false, fort: false })).toBeGreaterThan(warPremium({ borderDist: 600, occupied: false, fort: false }));
  });

  it('Handel mit Kriegsware zu Kriegspreisen erhöht den Fahndungsdruck, friedlicher Handel nicht; der Druck sinkt mit der Zeit', () => {
    const war = site('deutschland', { ...calm, occupied: true }, 'w');
    const e = emptyEconomy();
    buyGood(e, war, 0, 'schiesspulver', 20, 1e9, 6);
    expect(e.heat).toBeGreaterThan(5);
    const h = e.heat;
    const peace = emptyEconomy();
    buyGood(peace, site('deutschland', calm), 0, 'schiesspulver', 20, 1e9, 6);
    expect(peace.heat).toBe(0);
    buyGood(peace, war, 0, 'tee', 20, 1e9, 6);
    expect(peace.heat).toBe(0);
    decayHeat(e, 60);
    expect(e.heat).toBeCloseTo(h - 60 * CONTRABAND.heatDecay);
    decayHeat(e, 1e6);
    expect(e.heat).toBe(0);
    const big = emptyEconomy(); big.heat = 99;
    buyGood(big, war, 0, 'waffenkisten', 50, 1e9, 6);
    expect(big.heat).toBeLessThanOrEqual(CONTRABAND.heatMax);
  });

  it('Kontrollen: nur mit Kriegsware, nur in Häfen einer Macht, öfter bei hohem Druck und bei der Marine', () => {
    const load = () => { const e = emptyEconomy(); buyGood(e, site('deutschland'), 0, 'waffenkisten', 10, 1e9, 6); return e; };
    const clean = emptyEconomy(); buyGood(clean, site('deutschland'), 0, 'tee', 10, 1e9, 6);
    expect(inspectCargo(clean, { lawful: true, marine: true, rnd: () => 0 }).checked).toBe(false);
    expect(inspectCargo(load(), { lawful: false, marine: false, rnd: () => 0 }).checked).toBe(false);
    const e = load();
    const worth = warCargo(e).value;
    const r = inspectCargo(e, { lawful: true, marine: false, rnd: () => 0 });
    expect(r.checked).toBe(true);
    expect(r.seized).toBe(10);
    expect(r.fine).toBe(Math.round(worth * CONTRABAND.fine));
    expect(warCargo(e).units).toBe(0);
    // der Würfel entscheidet: 0,9 ist über dem Höchstmaß 0,85 → nie kontrolliert
    expect(inspectCargo(load(), { lawful: true, marine: true, rnd: () => 0.9 }).checked).toBe(false);
    // höhere Hitze und Marine erhöhen die Chance: ein Würfel von 0,2 trifft nur dann
    const cold = load(), hot = load(); hot.heat = 90;
    expect(inspectCargo(cold, { lawful: true, marine: false, rnd: () => 0.2 }).checked).toBe(false);
    const hotRes = inspectCargo(hot, { lawful: true, marine: false, rnd: () => 0.2 });
    expect(hotRes.checked).toBe(true);
    expect(hotRes.hunters).toBe(true);
    const warm = load(); warm.heat = 10;
    expect(inspectCargo(warm, { lawful: true, marine: false, rnd: () => 0.14 }).checked).toBe(false);
    const warm2 = load(); warm2.heat = 10;
    expect(inspectCargo(warm2, { lawful: true, marine: true, rnd: () => 0.14 }).checked).toBe(true);
  });
});

describe('Hafen-Tarife', () => {
  it('Ansehen und Ehre senken die Preise bis −25 %, nie darüber', () => {
    expect(tariffOf(0, 0, true).factor).toBe(1);
    expect(tariffOf(19, 0, true).factor).toBe(1);
    expect(tariffOf(20, 0, true).factor).toBeCloseTo(0.95);
    expect(tariffOf(80, 0, true).factor).toBeCloseTo(0.8);
    expect(tariffOf(80, 100, true).factor).toBeCloseTo(0.75);
    expect(tariffOf(100, 99999, true).factor).toBeGreaterThanOrEqual(1 - TARIFF.maxDiscount - 1e-9);
    let prev = 2;
    for (let s = 0; s <= 100; s += 5) { const f = tariffOf(s, 0, true).factor; expect(f).toBeLessThanOrEqual(prev); prev = f; }
  });

  it('feindliches Ansehen: Schwarzmarkt-Zuschlag +35 %, ab −60 Hafensperre; Freihäfen kennen keinen Tarif', () => {
    const bm = tariffOf(-10, 0, true);
    expect(bm.factor).toBeCloseTo(1.35);
    expect(bm.kind).toBe('schwarzmarkt');
    expect(bm.closed).toBe(false);
    expect(tariffOf(-59, 0, true).closed).toBe(false);
    expect(tariffOf(-60, 0, true).closed).toBe(true);
    expect(tariffOf(-60, 0, true).kind).toBe('gesperrt');
    expect(tariffOf(-100, 500, false)).toEqual({ factor: 1, closed: false, kind: 'normal', discount: 0 });
    expect(tariffOf(0, 0, true).kind).toBe('normal');
    expect(tariffOf(60, 0, true).kind).toBe('rabatt');
  });

  it('der Tarif wirkt auf Kauf (teurer) und Verkauf (weniger Erlös)', () => {
    const S = site('niederlande');
    const stock = MARKET.eqStock.produce;
    expect(quoteBuy(S, stock, 'gewuerze', 5, 1.35).total).toBeGreaterThan(quoteBuy(S, stock, 'gewuerze', 5, 1).total * 1.3);
    expect(quoteBuy(S, stock, 'gewuerze', 5, 0.75).total).toBeLessThan(quoteBuy(S, stock, 'gewuerze', 5, 1).total * 0.8);
    expect(quoteSell(S, stock, 'gewuerze', 5, 1.35).total).toBeLessThan(quoteSell(S, stock, 'gewuerze', 5, 1).total * 0.8);
    // Rabatt-Hafen: niedrigere Preise in beide Richtungen, Hin und Zurück kostet trotzdem immer Gold (kein Handel im Kreis)
    for (const t of [0.75, 0.9, 1, 1.35]) {
      const b = quoteBuy(S, stock, 'gewuerze', 1, t).total, back = quoteSell(S, stock - 1, 'gewuerze', 1, t).total;
      expect(back, `Tarif ${t}`).toBeLessThan(b);
    }
  });
});

describe('Unterhalt (Sold und Proviant)', () => {
  const crew = { tier: 3, seamen: 48, troops: 0, officers: 3 };
  it('wächst mit Schiffsklasse, Köpfen, Truppen und Offizieren; Leviathan weit teurer als Schaluppe', () => {
    expect(UPKEEP.hull.length).toBe(SHIP_CLASSES.length);
    for (let i = 1; i < UPKEEP.hull.length; i++) expect(UPKEEP.hull[i]).toBeGreaterThan(UPKEEP.hull[i - 1]);
    const small = upkeepOf({ tier: 0, seamen: 16, troops: 0, officers: 1 }), big = upkeepOf({ tier: 6, seamen: 104, troops: 100, officers: 5 });
    expect(big.daily).toBeGreaterThan(small.daily * 15);
    const u = upkeepOf(crew);
    expect(u.daily).toBeCloseTo(48 * UPKEEP.seaman + 3 * UPKEEP.officer + UPKEEP.hull[3]);
    expect(u.perPeriod * UPKEEP.periodsPerDay).toBeCloseTo(u.daily);
    expect(upkeepOf({ ...crew, troops: 50 }).daily - u.daily).toBeCloseTo(50 * UPKEEP.trooper);
    expect(upkeepOf({ tier: -5, seamen: -3, troops: -1, officers: -1 }).daily).toBe(UPKEEP.hull[0]);
  });

  it('zahlt am Zahltag, solange das Gold reicht: Moral bleibt oben', () => {
    const e = emptyEconomy(0);
    const r = stepUpkeep(e, UPKEEP.period, 1e6, crew);
    expect(r.spent).toBe(Math.round(upkeepOf(crew).perPeriod));
    expect(r.events[0].type).toBe('paid');
    expect(e.morale).toBe(1);
    expect(e.arrears).toBe(0);
    expect(e.nextPay).toBe(UPKEEP.period * 2);
    expect(stepUpkeep(e, UPKEEP.period + 10, 1e6, crew).spent).toBe(0);          // noch kein neuer Zahltag
  });

  it('reicht das Gold nicht: Teilzahlung, Rückstand, Moral sinkt (nie unter den Boden), Vorwarnung vorher genau einmal', () => {
    const e = emptyEconomy(0);
    const due = upkeepOf(crew).perPeriod;
    const w = stepUpkeep(e, UPKEEP.period - 30, 1, crew);
    expect(w.events.map((x) => x.type)).toEqual(['warn']);
    expect(stepUpkeep(e, UPKEEP.period - 20, 1, crew).events).toEqual([]);          // nicht doppelt
    const r = stepUpkeep(e, UPKEEP.period, 10, crew);
    expect(r.spent).toBe(10);
    expect(r.missed).toBe(1);
    expect(r.events[0]).toMatchObject({ type: 'short', paid: 10 });
    expect(e.arrears).toBeCloseTo(due - 10, 0);
    expect(e.morale).toBeCloseTo(1 - UPKEEP.moraleMiss);
    for (let i = 2; i < 12; i++) stepUpkeep(e, UPKEEP.period * i, 0, crew);
    expect(e.morale).toBe(UPKEEP.moraleMin);
    expect(e.arrears).toBeGreaterThan(due * 5);
    // gezahlt wird, was da ist – nie mehr als das Gold
    const e2 = emptyEconomy(0);
    expect(stepUpkeep(e2, UPKEEP.period, 3, crew).spent).toBeLessThanOrEqual(3);
  });

  it('Rückstand wird bei Gold nachgezahlt, die Moral erholt sich; lange Zeitsprünge werden nicht nachträglich abgerechnet', () => {
    const e = emptyEconomy(0);
    stepUpkeep(e, UPKEEP.period, 0, crew); stepUpkeep(e, UPKEEP.period * 2, 0, crew);
    expect(e.arrears).toBeGreaterThan(0);
    const low = e.morale;
    const r = stepUpkeep(e, UPKEEP.period * 3, 1e6, crew);
    expect(e.arrears).toBe(0);
    expect(r.spent).toBeGreaterThan(upkeepOf(crew).perPeriod * 2);
    expect(e.morale).toBeGreaterThan(low);
    const jump = emptyEconomy(0);
    const res = stepUpkeep(jump, UPKEEP.period * 500, 1e9, crew);
    expect(res.events.length).toBeLessThanOrEqual(UPKEEP.maxCatchUp);
    expect(res.spent).toBeLessThanOrEqual(Math.ceil(upkeepOf(crew).perPeriod * UPKEEP.maxCatchUp) + 1);
    expect(jump.nextPay).toBeGreaterThan(UPKEEP.period * 500);
  });

  it('Moral wirkt auf die Crew: 55 – 100 % Wirksamkeit, die Nachladezeit wächst', () => {
    expect(moraleEfficiency(1)).toBe(1);
    expect(moraleEfficiency(0)).toBeCloseTo(UPKEEP.moraleBase);
    expect(moraleEfficiency(UPKEEP.moraleMin)).toBeGreaterThan(UPKEEP.moraleBase);
    expect(moraleEfficiency(-3)).toBeCloseTo(UPKEEP.moraleBase);
    expect(crewEffects(moraleEfficiency(0.2)).reloadMult).toBeGreaterThan(crewEffects(1).reloadMult);
  });
});

describe('Werft und Reparatur auf See', () => {
  const cost = (tier: number, hullFrac: number, sailFrac = 1) => { const c = SHIP_CLASSES[tier]; return yardRepairCost({ L: c.L, W: c.W, hullMax: c.hp, hullFrac, sailMax: c.hp * 0.8, sailFrac }); };
  it('Werftkosten wachsen mit der Schiffsklasse und überproportional mit dem Schadensgrad', () => {
    expect(cost(3, 1)).toBe(0);
    for (let t = 1; t < SHIP_CLASSES.length; t++) expect(cost(t, 0.5)).toBeGreaterThan(cost(t - 1, 0.5));
    expect(cost(6, 0.2)).toBeGreaterThan(cost(0, 0.2) * 5);
    expect(cost(3, 0.5)).toBeGreaterThan(cost(3, 0.75) * 2);
    expect(cost(3, 0.5, 0.2)).toBeGreaterThan(cost(3, 0.5, 1));
    // Tarif und Rabatt
    const c = SHIP_CLASSES[3];
    const f = (tariff: number) => yardRepairCost({ L: c.L, W: c.W, hullMax: c.hp, hullFrac: 0.5, sailMax: 300, sailFrac: 0.5, tariff });
    expect(f(1.35)).toBeGreaterThan(f(1) * 1.3);
    expect(f(0.8)).toBeLessThan(f(1) * 0.85);
  });

  it('Notfall-Reparatur auf See stellt höchstens 75 % her, die Werft 100 %', () => {
    const s = createShipSim('ship-eco' as EntityId, 400, 400, 6);
    s.hull = 100;
    s.sail.hp = 0;
    for (let i = 0; i < 20; i++) applyRepair(s, 'planken');
    expect(s.hull).toBeCloseTo(400 * SEA_REPAIR_CAP);
    expect(s.sail.hp).toBeCloseTo(s.sail.max * SEA_REPAIR_CAP);
    expect(needsRepair(s, 'planken')).toBe(false);
    expect(needsRepair(s, 'segeltuch')).toBe(false);
    expect(needsRepair(s, 'hafen')).toBe(true);
    applyRepair(s, 'hafen');
    expect(s.hull).toBe(400);
    expect(s.sail.hp).toBe(s.sail.max);
  });

  it('auch die passive Reparatur der Crew hört bei 75 % auf', () => {
    const s = createShipSim('ship-eco2' as EntityId, 400, 400, 6);
    s.hull = 200; s.sinceHit = 100;
    for (let i = 0; i < 100000; i++) stepPassiveRepair(s, 1, crewEffects(1), 3);
    expect(s.hull).toBeCloseTo(400 * SEA_REPAIR_CAP);
  });
});

describe('Munition, Beutel und Spielstand 16', () => {
  it('Spezialmunition hat Stufe und Preis; Stufe 2 braucht Rang 2, Stufe 3 Rang 4 und Ansehen', () => {
    expect(AMMO_UNLOCK.kugel.price).toBe(0);
    for (const id of ['kette', 'kartaetsche', 'brand'] as const) expect(AMMO_UNLOCK[id].price).toBeGreaterThan(0);
    expect(AMMO_UNLOCK.brand.price).toBeGreaterThan(AMMO_UNLOCK.kette.price);
    expect(shopGate({ tier: AMMO_UNLOCK.kette.tier, playerRank: 1, standing: 0 }).ok).toBe(false);
    expect(shopGate({ tier: AMMO_UNLOCK.kette.tier, playerRank: TIER_DEFS[2].rankMin, standing: 0 }).ok).toBe(true);
    expect(shopGate({ tier: AMMO_UNLOCK.brand.tier, playerRank: 9, standing: 0 })).toEqual({ ok: false, kind: 'rep', needStanding: 20 });
    expect(shopGate({ tier: AMMO_UNLOCK.brand.tier, playerRank: 4, standing: 20 }).ok).toBe(true);
  });

  it('cleanEconomy säubert fremde Daten und übersteht JSON', () => {
    const dirty = { markets: { a: { stock: { tee: 5, kaputt: 3, wein: 'x' }, t: -4 }, b: 7 }, ledger: { a: { name: 'Hafen', t: 10, buy: { tee: 55, x: 1 }, sell: {} } }, cargo: { tee: { n: 3.7, cost: 100 }, wein: { n: 0, cost: 5 }, x: { n: 4, cost: 4 } }, nextPay: 'bald', morale: 9, heat: -3, ammo: ['brand', 'kanone', 'brand'] };
    const e = cleanEconomy(dirty, 100);
    expect(e.markets.a.stock).toEqual({ tee: 5, wein: 0 });
    expect(e.markets.b).toBeUndefined();
    expect(e.markets.a.t).toBe(0);
    expect(e.ledger.a.buy).toEqual({ tee: 55 });
    expect(e.cargo).toEqual({ tee: { n: 3, cost: 100 } });
    expect(e.nextPay).toBe(100 + UPKEEP.period);
    expect(e.morale).toBe(1);
    expect(e.heat).toBe(0);
    expect(e.ammo).toEqual(['kugel', 'brand']);
    expect(cleanEconomy(JSON.parse(JSON.stringify(e)), 100)).toEqual(e);
    expect(cleanEconomy(null, 5)).toEqual(emptyEconomy(5));
    expect(cleanEconomy('x', 0)).toEqual(emptyEconomy(0));
  });

  it('das Kontor merkt sich die Preise besuchter Häfen', () => {
    const e = emptyEconomy();
    recordLedger(e, site('england', calm, 'albion'), 500, 0.9);
    expect(e.ledger.albion.t).toBe(500);
    expect(Object.keys(e.ledger.albion.buy).length).toBe(GOODS.length);
    expect(e.ledger.albion.buy.tee!).toBeLessThan(e.ledger.albion.buy.gewuerze!);
    for (const g of GOODS) expect(e.ledger.albion.buy[g.id]!).toBeGreaterThan(e.ledger.albion.sell[g.id]!);
  });

  it('Migration 15 → 16: Wirtschaft entsteht, Munition folgt dem Rang, nichts wird rückwirkend abgerechnet', () => {
    const s = createSave('Alt', 'pirat', 'x');
    const old = { ...s, version: 15 } as Record<string, any>;
    delete old.progress.economy;
    old.meta = { ...old.meta, playTime: 5000 };
    old.player = { ...old.player, fame: 800 };      // Rang 4
    const r = migrateSave(old, 'x');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.version).toBe(SAVE_VERSION);
    expect(r.migratedFrom).toBe(15);
    const eco = r.data.progress.economy!;
    expect(eco.nextPay).toBe(5000 + UPKEEP.period);
    expect(eco.arrears).toBe(0);
    expect(eco.ammo).toEqual(['kugel', 'kette', 'kartaetsche', 'brand']);
    const rookie = migrateSave({ ...old, player: { ...old.player, fame: 0 } }, 'x');
    expect(rookie.ok && rookie.data.progress.economy!.ammo).toEqual(['kugel']);
    expect(createSave('Neu', 'marine', 'x').progress.economy).toEqual(emptyEconomy());
  });
});
