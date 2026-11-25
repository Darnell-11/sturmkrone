// Phase 4.5A: Ökosystem der Mächte (world/factionWarEngine.ts) – Register und Erweiterbarkeit, Produktion und Verbrauch, Nutzen-KI bei Rohstoffmangel,
// Anti-Hegemon-Koalition, Großschlacht und Nachschub, Belagerung und Besitzerwechsel (Engine, WorldStreamer, Märkte), Spielstand 20, cameraNearFade.
import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/data/regions';
import { NATION_DEFS, RESOURCE_IDS, RESOURCE_TARGET, WAR, emptyBag, type NationDefinition, type ResourceBag } from '../src/data/nations';
import {
  FactionWarEngine, NationRegistry, armadaCost, armadaFire, cleanFactionWar, warWorldFromDefs, warshipsAlive,
  type ArmadaState, type WarIsland, type WarNotice,
} from '../src/world/factionWarEngine';
import { WorldStreamer, type StreamHost } from '../src/world/worldStreamer';
import { buyGood, marketPrice, sellGood, warDemandK, type MarketSite } from '../src/core/economyEngine';
import { WAR_DEMAND, emptyEconomy, profileOf } from '../src/data/economy';
import { migrateSave } from '../src/core/save/migrations';
import { createSave, SAVE_VERSION } from '../src/core/save/types';
import { cameraNearFade, FOOT_ARM, NEAR_FADE, NearFade } from '../src/graphics/cameraRig';

const DEFS = REGIONS.flatMap((r) => r.islands);

/** Die echte Welt: alle Inseln der Karte, alle sechs Mächte */
function realWorld(seed = 7) {
  const reg = new NationRegistry();
  const w = warWorldFromDefs(DEFS, reg);
  return { reg, w, eng: new FactionWarEngine(reg, w.islands, w.obstacles, null, seed) };
}

/** Eine Nation für die künstliche Welt */
const nation = (id: string, o: Partial<NationDefinition> = {}): NationDefinition => ({
  id, name: id.toUpperCase(), adjective: id, color: '#888888', heraldry: 'england', capital: `${id}-hof`, exports: ['tee'], startStock: 1,
  doctrine: { aggression: 0.7, trade: 0.5, conquers: true, wResource: 1.2, wStrategic: 1, wMega: 1 }, ...o,
});

/** Eine Insel der künstlichen Welt */
function isle(id: string, x: number, z: number, founder: string | null, o: Partial<WarIsland> & { y?: Partial<ResourceBag> } = {}): WarIsland {
  const y = emptyBag();
  for (const r of RESOURCE_IDS) y[r] = o.y?.[r] ?? 0;
  return {
    id, name: id, x, z, r: 80, ring: 2, tier: o.tier ?? 'hafen', founder, conquerable: o.conquerable ?? true, protected: o.protected ?? false,
    produces: o.produces ?? true, mega: o.mega ?? false, strategic: o.strategic ?? 0.4, yield: y, garrisonMax: o.garrisonMax ?? 70,
  };
}

/**
 * Künstliche Welt: Nation A hält ihren Hof und einen Hafen, Nation B hält eine Holzkolonie (Osten), eine Stahlmine (Westen), eine Mega-Insel (Süden)
 * und ihren Hof; beide Höfe sind geschützt. A und B sind Rivalen.
 */
function toyWorld(seed = 3, nationsOverride?: NationDefinition[]) {
  const reg = new NationRegistry(nationsOverride ?? [nation('a'), nation('b')]);
  const islands = [
    isle('a-hof', 0, -2600, 'a', { tier: 'hauptstadt', protected: true, conquerable: false, y: { gold: 300, proviant: 40, rekruten: 20, kanonenstahl: 6, hartholz: 6, segeltuch: 6, medizin: 2 } }),
    isle('a-hafen', 0, 0, 'a', { y: { gold: 60, proviant: 10 } }),
    isle('holz', 1600, 300, 'b', { y: { hartholz: 14, gold: 10 } }),
    isle('stahl', -1600, 300, 'b', { y: { kanonenstahl: 14, gold: 10 } }),
    isle('mega', 0, 1900, 'b', { tier: 'mega', mega: true, strategic: 1, garrisonMax: 160, y: { gold: 80, proviant: 12 } }),
    isle('b-hof', 0, 4200, 'b', { tier: 'hauptstadt', protected: true, conquerable: false, y: { gold: 300, proviant: 40, rekruten: 20, kanonenstahl: 6, hartholz: 6, segeltuch: 6, medizin: 2 } }),
  ];
  const eng = new FactionWarEngine(reg, islands, [], null, seed);
  const r = eng.relation('a', 'b')!;
  r.state = 'rivalitaet'; r.trust = -40;
  return { reg, islands, eng };
}

const fill = (eng: FactionWarEngine, id: string, k: number) => { const n = eng.state.nations[id]; for (const r of RESOURCE_IDS) n.stock[r] = RESOURCE_TARGET[r] * k; };
const run = (eng: FactionWarEngine, seconds: number) => { for (let t = 0; t < seconds; t++) eng.update(1); };

// ---------------------------------------------------------------------------------------------------------------

describe('NationRegistry: datengetrieben und erweiterbar', () => {
  it('führt die sechs Mächte als Definitionen ohne feste Weichen; jede hat Lehre, Exporte und eine geschützte Hauptstadt', () => {
    const reg = new NationRegistry();
    expect(reg.list().map((n) => n.id)).toEqual(['england', 'niederlande', 'deutschland', 'frankreich', 'kurogane', 'marine']);
    for (const n of NATION_DEFS) {
      expect(n.exports.length).toBeGreaterThan(0);
      expect(n.doctrine.aggression).toBeGreaterThan(0);
      expect(n.capital).toBeTruthy();
    }
    // die Marine erobert keine Kolonien (Ordnungsmacht), alle anderen schon
    expect(reg.get('marine')!.doctrine.conquers).toBe(false);
    expect(NATION_DEFS.filter((n) => n.doctrine.conquers).length).toBe(5);
  });

  it('schützt das neutrale Zentrum, Weißwacht und die Raid-Festungen; Kolonien, Grenzfesten und alle 6 Mega-Inseln sind eroberbar', () => {
    const { w } = realWorld();
    const by = new Map(w.islands.map((i) => [i.id, i]));
    for (const id of ['albion', 'adlerstein', 'yamikura', 'oranjehaven', 'soleilmont', 'weisswacht']) {
      const i = by.get(id)!;
      expect(i.protected, id).toBe(true);
      expect(i.conquerable, id).toBe(false);
    }
    // Ankerglück und die Bernsteinsee (Ring 1) gehören niemandem bzw. sind nicht eroberbar
    for (const d of DEFS.filter((x) => (x.ring ?? 1) <= 1)) expect(by.get(d.id)?.conquerable ?? false, d.id).toBe(false);
    const megas = w.islands.filter((i) => i.mega);
    expect(megas.length).toBe(6);
    for (const m of megas) expect(m.conquerable, m.id).toBe(true);
    for (const id of ['grenzwacht_nordkap', 'grenzwacht_kanalwacht', 'grenzwacht_suedwall']) expect(by.get(id)!.conquerable, id).toBe(true);
    for (const id of ['koenigshafen', 'eisenfels', 'banda', 'aschezahn', 'sonnenweinkap']) expect(by.get(id)!.conquerable, id).toBe(true);
    // Piratenlager und Legenden-Inseln bleiben Abenteuerwelt
    for (const id of ['graueklippe', 'geisterriff', 'glutberg']) expect(by.get(id)?.conquerable ?? false, id).toBe(false);
  });

  it('eine neue Nation braucht nur einen Eintrag: Zustand, Beziehungen und Wirtschaft ergänzen sich (auch in einem alten Stand)', () => {
    const { eng: base } = realWorld();
    const old = base.snapshot();
    const reg = new NationRegistry();
    reg.register(nation('nordbund', { heraldry: 'deutschland', capital: null, exports: ['hartholz'] }));
    const w = warWorldFromDefs(DEFS, reg);
    const state = cleanFactionWar(old, reg, w.islands)!;
    const eng = new FactionWarEngine(reg, w.islands, w.obstacles, state, 1);
    expect(eng.state.nations.nordbund).toBeDefined();
    expect(eng.state.relations.length).toBe((7 * 6) / 2);
    expect(eng.stateOf('nordbund', 'england')).toBe('neutral');
    // ein Hafen fällt an die neue Nation: sie bekommt seine Erträge
    eng.state.islands.koenigshafen.owner = 'nordbund';
    eng.reindex();
    const gold0 = eng.state.nations.nordbund.stock.gold;
    run(eng, WAR.cycle + 1);
    expect(eng.state.nations.nordbund.income.gold).toBeGreaterThan(0);
    expect(eng.state.nations.nordbund.islands).toBe(1);
    expect(eng.state.nations.nordbund.stock.gold).not.toBe(gold0);
  });
});

describe('Ressourcen-Kreislauf: Produktion und Kriegskosten', () => {
  it('gehaltene Inseln füllen die Kasse ihrer Schutzmacht; eine belagerte Insel liefert nicht', () => {
    const { eng } = toyWorld();
    const b0 = eng.state.nations.b.stock.hartholz;
    run(eng, WAR.cycle + 1);
    const inc = eng.state.nations.b.income.hartholz;
    expect(inc).toBeCloseTo(14 + 6, 5); // Holzkolonie + Hof
    expect(eng.state.nations.b.stock.hartholz).toBeGreaterThan(b0 - 10);
    // Belagerung der Holzkolonie: das Holz bleibt im Insellager (Beute für den Sieger), die Kasse sieht es nicht
    eng.state.islands.holz.siegeId = 'fake';
    const store0 = eng.state.islands.holz.store.hartholz;
    run(eng, WAR.cycle);
    expect(eng.state.nations.b.income.hartholz).toBeCloseTo(6, 5);
    expect(eng.state.islands.holz.store.hartholz).toBeGreaterThan(store0 + 10);
  });

  it('der Aufmarsch einer Armada verbraucht die Kosten ihrer Schiffe, Truppen und des Nachschubs', () => {
    const { eng } = toyWorld();
    fill(eng, 'a', 2);
    const before = { ...eng.state.nations.a.stock };
    const a = eng.launch(0, 2, 'angriff')!;
    expect(a).toBeTruthy();
    expect(a.ships.length).toBeGreaterThanOrEqual(WAR.minShips);
    expect(a.ships.length).toBeLessThanOrEqual(WAR.maxShips);
    expect(a.ships[0].role).toBe('kommando');
    expect(a.ships[0].cls).toBeGreaterThanOrEqual(4);
    expect(a.ships[0].hullTier).toBeGreaterThanOrEqual(4);
    const transports = a.ships.filter((s) => s.role === 'transport').length;
    expect(transports).toBeGreaterThanOrEqual(1);
    expect(transports).toBeLessThanOrEqual(2);
    const cost = armadaCost(a.ships, emptyBag());
    for (const r of RESOURCE_IDS) expect(eng.state.nations.a.stock[r]).toBeCloseTo(before[r] - cost[r], 5);
    expect(a.supply.proviant).toBeGreaterThan(0);
    expect(a.troops).toBeGreaterThan(50);
  });

  it('ohne Mittel keine Armada; fällt eine Rohstoff-Insel, sinkt die Nachrüst-Kapazität des Verlierers', () => {
    const { eng } = toyWorld();
    for (const r of RESOURCE_IDS) eng.state.nations.a.stock[r] = 10;
    expect(eng.launch(0, 2, 'angriff')).toBeNull();
    run(eng, WAR.cycle + 1);
    const steelWith = eng.state.nations.b.income.kanonenstahl;
    eng.state.islands.stahl.owner = 'a';
    eng.reindex();
    run(eng, WAR.cycle);
    expect(eng.state.nations.b.income.kanonenstahl).toBeLessThan(steelWith - 10);
    expect(eng.state.nations.a.income.kanonenstahl).toBeGreaterThan(10);
  });
});

describe('NationBrain: Nutzen-KI', () => {
  it('bei Holzmangel greift sie die Holzkolonie an, bei Stahlmangel die Stahlmine', () => {
    // echter Mangel (unter dem Wohlfühl-Vorrat), aber noch genug für den Bau der Schiffe
    const wood = toyWorld(11);
    fill(wood.eng, 'a', 1.3);
    wood.eng.state.nations.a.stock.hartholz = RESOURCE_TARGET.hartholz * 0.62;
    const iA = 0;
    expect(wood.eng.utility(iA, 2)).toBeGreaterThan(wood.eng.utility(iA, 3));
    run(wood.eng, 40);
    const tw = wood.eng.state.armadas.find((x) => x.nation === 'a');
    expect(tw?.target).toBe('holz');
    expect(wood.eng.atWar('a', 'b')).toBe(true);

    const steel = toyWorld(11);
    fill(steel.eng, 'a', 1.3);
    steel.eng.state.nations.a.stock.kanonenstahl = RESOURCE_TARGET.kanonenstahl * 0.62;
    expect(steel.eng.utility(iA, 3)).toBeGreaterThan(steel.eng.utility(iA, 2));
    run(steel.eng, 40);
    expect(steel.eng.state.armadas.find((x) => x.nation === 'a')?.target).toBe('stahl');
  });

  it('mit voller Kriegskasse und ohne Mangel plant sie die Großoffensive auf die Mega-Insel', () => {
    const { eng } = toyWorld(5);
    fill(eng, 'a', 1.9);
    expect(eng.readiness(eng.state.nations.a)).toBeGreaterThan(0.9);
    expect(eng.utility(0, 4)).toBeGreaterThan(eng.utility(0, 2));
    run(eng, 40);
    const a = eng.state.armadas.find((x) => x.nation === 'a');
    expect(a?.target).toBe('mega');
    expect(a!.ships.length).toBeGreaterThanOrEqual(8);
  });

  it('greift nie geschützte Inseln, Verbündete oder Handelspartner an; Waffenstillstand sperrt den Krieg', () => {
    const { eng } = toyWorld(5);
    fill(eng, 'a', 1.9);
    expect(eng.utility(0, 5)).toBe(-Infinity); // Hof der Nation B
    const r = eng.relation('a', 'b')!;
    r.state = 'handelspakt';
    for (let k = 0; k < eng.islands.length; k++) expect(eng.utility(0, k)).toBe(-Infinity);
    r.state = 'neutral'; r.truceUntil = eng.state.t + 999;
    expect(eng.mayDeclare('a', 'b', false)).toBe(false);
  });

  it('eine Ordnungsmacht (keine Eroberungen) holt nur ihre eigenen Inseln zurück', () => {
    const { eng } = toyWorld(5, [nation('a', { doctrine: { aggression: 0.7, trade: 0.5, conquers: false, wResource: 1, wStrategic: 1, wMega: 1 } }), nation('b')]);
    fill(eng, 'a', 1.9);
    for (let k = 0; k < eng.islands.length; k++) expect(eng.utility(0, k)).toBe(-Infinity);
    // die Holzkolonie war ursprünglich A gegründet: Rückeroberung ist erlaubt
    (eng.islands[2] as { founder: string | null }).founder = 'a';
    expect(eng.utility(0, 2)).toBeGreaterThan(-Infinity);
  });
});

describe('Diplomatie: Handelspakte, Waffenstillstand, Anti-Hegemon-Koalition', () => {
  it('Nationen mit sich ergänzenden Überschüssen schließen einen Handelspakt (+20 % Ertrag) und tauschen', () => {
    const { eng } = toyWorld(2);
    const r = eng.relation('a', 'b')!;
    r.state = 'neutral'; r.trust = 0;
    fill(eng, 'a', 1); fill(eng, 'b', 1);
    eng.state.nations.a.stock.kanonenstahl = RESOURCE_TARGET.kanonenstahl * 2;
    eng.state.nations.a.stock.hartholz = RESOURCE_TARGET.hartholz * 0.5;
    eng.state.nations.b.stock.hartholz = RESOURCE_TARGET.hartholz * 2;
    eng.state.nations.b.stock.kanonenstahl = RESOURCE_TARGET.kanonenstahl * 0.5;
    expect(eng.complementary('a', 'b')).toBe(true);
    const seen: WarNotice[] = [];
    for (let t = 0; t < WAR.diplomacyEvery + 2; t++) { eng.update(1); seen.push(...eng.drain()); }
    expect(r.state).toBe('handelspakt');
    expect(seen.some((n) => n.type === 'handelspakt')).toBe(true);
    expect(eng.yieldK('a')).toBeCloseTo(1 + WAR.pactBonus, 6);
    expect(eng.pactCount('b')).toBe(1);
  });

  it('Kriegsmüdigkeit führt zum Waffenstillstand mit Reparationen des Schwächeren', () => {
    const { eng } = toyWorld(2);
    eng.declareWar('a', 'b');
    const r = eng.relation('a', 'b')!;
    r.weariness = WAR.weary + 1;
    r.since = eng.state.t - WAR.minWar - 1;
    fill(eng, 'a', 1); fill(eng, 'b', 1.5);
    const goldA = eng.state.nations.a.stock.gold, goldB = eng.state.nations.b.stock.gold;
    const seen: WarNotice[] = [];
    for (let t = 0; t < WAR.diplomacyEvery + 2; t++) { eng.update(1); seen.push(...eng.drain()); }
    expect(r.state).toBe('neutral');
    expect(r.truceUntil).toBeGreaterThan(eng.state.t);
    const cf = seen.find((n) => n.type === 'waffenstillstand') as Extract<WarNotice, { type: 'waffenstillstand' }> | undefined;
    expect(cf).toBeTruthy();
    expect(cf!.gold).toBeGreaterThan(0);
    // der Zahler hat weniger, der Empfänger mehr (abzüglich Unterhalt)
    const payer = cf!.payer, payee = payer === 'a' ? 'b' : 'a';
    expect(eng.state.nations[payer].stock.gold).toBeLessThan((payer === 'a' ? goldA : goldB) - cf!.gold * 0.9);
    expect(eng.state.nations[payee].stock.gold).toBeGreaterThan((payee === 'a' ? goldA : goldB) - 400);
  });

  it('überschreitet eine Macht 34 % der Gesamtressourcen, verbünden sich die Bedrohten und greifen gemeinsam an', () => {
    const { eng, reg } = realWorld(9);
    const h = eng.state.nations.england;
    for (const r of RESOURCE_IDS) h.stock[r] = RESOURCE_TARGET[r] * 8;
    const seen: WarNotice[] = [];
    for (let t = 0; t < WAR.diplomacyEvery + 2; t++) { eng.update(1); seen.push(...eng.drain()); }
    expect(eng.hegemon).toBe('england');
    const c = eng.state.coalitions.find((x) => x.against === 'england');
    expect(c).toBeTruthy();
    expect(c!.members.length).toBeGreaterThanOrEqual(2);
    expect(c!.members).not.toContain('england');
    expect(seen.some((n) => n.type === 'koalition')).toBe(true);
    for (let i = 0; i < c!.members.length; i++) {
      const m = c!.members[i];
      // gemeinsamer Schlag: alle planen zur selben Zeit
      expect(eng.state.nations[m].nextBrainAt).toBeLessThanOrEqual(c!.strikeAt + reg.count);
      for (let j = i + 1; j < c!.members.length; j++) expect(eng.stateOf(m, c!.members[j])).toBe('allianz');
      const rh = eng.relation(m, 'england')!;
      if (rh.truceUntil <= eng.state.t) expect(rh.state).toBe('krieg');
    }
  });

  it('Hegemon auch durch mehr als drei Mega-Inseln; die Koalition löst sich auf, wenn die Gefahr vorüber ist', () => {
    const { eng } = realWorld(4);
    const megas = eng.islands.filter((i) => i.mega).slice(0, 4);
    for (const m of megas) eng.state.islands[m.id].owner = 'frankreich';
    eng.reindex();
    run(eng, WAR.diplomacyEvery + 2);
    expect(eng.hegemon).toBe('frankreich');
    expect(eng.state.coalitions.some((c) => c.against === 'frankreich')).toBe(true);
    // Mega-Inseln zurück: nach 5 Minuten unter der Schwelle löst sich das Bündnis
    for (const m of megas) eng.state.islands[m.id].owner = m.founder;
    eng.reindex();
    run(eng, 400);
    expect(eng.state.coalitions.some((c) => c.against === 'frankreich')).toBe(false);
  });
});

/** Zwei Armadas im Krieg dicht beieinander (künstliche Welt) */
function clash(seed: number, sizeA: number, sizeB: number) {
  const { eng } = toyWorld(seed);
  fill(eng, 'a', 3); fill(eng, 'b', 3);
  eng.declareWar('a', 'b');
  const A = eng.launch(0, 2, 'angriff', sizeA)!;
  const B = eng.launch(1, 1, 'angriff', sizeB)!;
  // dicht nebeneinander auf offener See
  A.x = 800; A.z = 150; B.x = 900; B.z = 160;
  return { eng, A, B };
}

describe('Großschlacht und Nachschub', () => {
  it('zwei feindliche Armadas liefern sich eine Seeschlacht; die stärkere behauptet das Feld', () => {
    const { eng, A, B } = clash(21, 10, 6);
    const seen: WarNotice[] = [];
    for (let t = 0; t < 600 && !seen.some((n) => n.type === 'schlachtEnde'); t++) { eng.update(1); seen.push(...eng.drain()); }
    const start = seen.find((n) => n.type === 'schlacht');
    const end = seen.find((n) => n.type === 'schlachtEnde') as Extract<WarNotice, { type: 'schlachtEnde' }> | undefined;
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
    expect(end!.battle.winner).toBe('a');
    expect(end!.battle.sunkB).toBeGreaterThan(0);
    expect(B.status === 'heimkehr' || B.status === 'aufgeloest').toBe(true);
    expect(warshipsAlive(A)).toBeGreaterThan(0);
  });

  it('ist deterministisch: gleicher Startwert, gleicher Verlauf', () => {
    const a = clash(33, 8, 8), b = clash(33, 8, 8);
    run(a.eng, 300); run(b.eng, 300);
    expect(JSON.stringify(a.eng.snapshot())).toBe(JSON.stringify(b.eng.snapshot()));
  });

  it('ein versenkter Nachschub-Transporter lässt die Belagerungsmoral drastisch sinken; fehlt der Nachschub ganz, bricht die Belagerung ab', () => {
    const { eng } = toyWorld(8);
    fill(eng, 'a', 3);
    eng.declareWar('a', 'b');
    const a = eng.launch(0, 2, 'angriff', 9)!;
    a.x = a.route[a.route.length - 2]; a.z = a.route[a.route.length - 1]; a.leg = a.route.length / 2;
    run(eng, 2);
    const sg = eng.siegeById(a.siegeId)!;
    expect(sg).toBeTruthy();
    const m0 = sg.morale;
    const tr = a.ships.filter((s) => s.role === 'transport');
    expect(tr.length).toBe(2);
    eng.sink(a, tr[0]);
    expect(m0 - sg.morale).toBeGreaterThanOrEqual(WAR.transportMoraleLoss - 1e-9);
    eng.sink(a, tr[1]);
    expect(sg.transportsLost).toBe(2);
    // ohne Nachschub: Moral sinkt weiter, bis die Belagerung zerfällt
    const seen: WarNotice[] = [];
    for (let t = 0; t < 400 && !sg.ended; t++) { eng.update(1); seen.push(...eng.drain()); }
    expect(sg.ended).toBe(true);
    expect(sg.outcome).toBe('abgebrochen');
    expect(eng.ownerOf('holz')).toBe('b');
  });
});

describe('Belagerung und Besitzerwechsel', () => {
  it('hält die Belagerung rund 12 Minuten durch, wechselt die Insel den Besitzer und der Sieger erbeutet einen Teil der Vorräte', () => {
    const { eng } = toyWorld(13);
    fill(eng, 'a', 3);
    // die Verteidiger haben Gold und Proviant (kein Waffenstillstand aus Not), aber weder Holz noch Stahl für einen Entsatz: geprüft wird die reine Belagerung
    for (const r of RESOURCE_IDS) eng.state.nations.b.stock[r] = 10;
    eng.state.nations.b.stock.gold = RESOURCE_TARGET.gold * 2;
    eng.state.nations.b.stock.proviant = RESOURCE_TARGET.proviant * 2;
    eng.declareWar('a', 'b');
    // Lager der Holzkolonie füllen (Beute)
    eng.state.islands.holz.store.hartholz = 200;
    const a = eng.launch(0, 2, 'angriff', 8)!;
    a.x = a.route[a.route.length - 2]; a.z = a.route[a.route.length - 1]; a.leg = a.route.length / 2;
    const seen: WarNotice[] = [];
    let fellAt = -1, woodGain = 0, storeBefore = 0;
    for (let t = 0; t < 1500 && fellAt < 0; t++) {
      const w0 = eng.state.nations.a.stock.hartholz;
      storeBefore = eng.state.islands.holz.store.hartholz;
      eng.update(1);
      for (const n of eng.drain()) { seen.push(n); if (n.type === 'gefallen') { fellAt = t; woodGain = eng.state.nations.a.stock.hartholz - w0; } }
    }
    expect(fellAt).toBeGreaterThan(400);
    expect(fellAt).toBeLessThan(1200);
    expect(eng.ownerOf('holz')).toBe('a');
    expect(eng.ownerChanged('holz')).toBe(true);
    expect(eng.unrest('holz')).toBeGreaterThan(0.9);
    const fell = seen.find((n) => n.type === 'gefallen') as Extract<WarNotice, { type: 'gefallen' }>;
    expect(fell.from).toBe('b');
    expect(fell.loot).toBeGreaterThan(0);
    // Beute: die Hälfte des Insellagers (das während der Belagerung weiter gewachsen ist) geht im Augenblick der Eroberung an den Sieger
    expect(storeBefore).toBeGreaterThan(200);
    expect(woodGain).toBeGreaterThan(storeBefore * 0.5 - 20);
    expect(eng.state.islands.holz.store.hartholz).toBeLessThan(1);
    expect(eng.state.islands.holz.garrison).toBeGreaterThan(0);
  });

  it('der WorldStreamer kleidet eine stehende Insel nach dem Besitzerwechsel neu ein – entladene Inseln lesen den Besitzer beim nächsten Aufbau', () => {
    const log: string[] = [];
    const host: StreamHost = {
      showHorizon: (i) => log.push(`h+${i}`), hideHorizon: (i) => log.push(`h-${i}`),
      buildActive: function* (i) { log.push(`b${i}`); yield; },
      commitActive: (i) => log.push(`c${i}`), disposeActive: (i) => log.push(`d${i}`),
      restyleActive: (i) => log.push(`r${i}`),
    };
    const s = new WorldStreamer(host, () => 0);
    const near = s.addIsland({ id: 'nah', x: 0, z: 0, r: 80 });
    const far = s.addIsland({ id: 'fern', x: 9000, z: 0, r: 80 });
    s.forceSyncAround(0, 0);
    expect(s.levelOf(near)).toBe(2);
    expect(s.levelOf(far)).toBe(0);
    expect(s.restyle(near)).toBe(true);
    expect(s.restyle(far)).toBe(false);
    log.length = 0;
    s.beginInterest(); s.addInterest(0, 0); s.update();
    expect(log.filter((x) => x.startsWith('r'))).toEqual([`r${near}`]);
    expect(s.stats.restyles).toBe(1);
    // doppelt angemeldet zählt einmal, ohne Gastgeber-Hilfe gibt es kein Neu-Einkleiden
    s.restyle(near); s.restyle(near);
    log.length = 0;
    s.update(); s.update();
    expect(log.filter((x) => x.startsWith('r')).length).toBe(1);
  });

  it('Kriegswirtschaft: belagerte und frisch eroberte Inseln zahlen mehr für Stahl, Holz, Medizin und Segeltuch; Feinde verhängen ein Embargo', () => {
    const profile = profileOf({ id: 'koenigshafen', region: 'nebel', factionId: 'england' });
    const base: MarketSite = { id: 'koenigshafen', name: 'Königshafen', profile, war: { borderDist: 9999, occupied: false, fort: false } };
    const siege: MarketSite = { ...base, war: { ...base.war, siege: true } };
    const fresh: MarketSite = { ...base, war: { ...base.war, unrest: 1 } };
    for (const g of WAR_DEMAND.goods) {
      expect(marketPrice(siege, g, 100) / marketPrice(base, g, 100)).toBeCloseTo(1 + WAR_DEMAND.siege, 5);
      expect(marketPrice(fresh, g, 100) / marketPrice(base, g, 100)).toBeCloseTo(1 + WAR_DEMAND.unrest, 5);
    }
    expect(marketPrice(siege, 'gewuerze', 100)).toBeCloseTo(marketPrice(base, 'gewuerze', 100), 6);
    expect(warDemandK({ borderDist: 0, occupied: false, fort: false, siege: true, unrest: 1 }, 'kanonenstahl')).toBeLessThanOrEqual(WAR_DEMAND.max);
    // Embargo: die Engine nennt die Exportwaren der Kriegsgegner, der Markt handelt sie nicht
    const { eng } = realWorld();
    eng.declareWar('england', 'frankreich');
    const emb = eng.embargoGoods('england', []);
    expect(emb).toEqual(expect.arrayContaining(['wein', 'seide', 'fechtklingen']));
    const site: MarketSite = { ...base, embargo: emb, embargoBy: 'Frankreich' };
    const eco = emptyEconomy(0);
    const b = buyGood(eco, site, 0, 'wein', 5, 10000, 4);
    expect(b.ok).toBe(false);
    expect(b.message).toContain('Embargo gegen Frankreich');
    eco.cargo.wein = { n: 5, cost: 200 };
    expect(sellGood(eco, site, 0, 'wein', 5).ok).toBe(false);
    expect(buyGood(eco, site, 0, 'tee', 2, 10000, 4).ok).toBe(true);
  });
});

describe('Spielstand 20 (seit 4.5C 21) und Erhalt über Laden und Speichern', () => {
  it('ältere Stände bekommen ein leeres Ökosystem (es entsteht beim Spielstart), ein gespeichertes übersteht den Rundlauf', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(21); // 4.6E: Talente heben auf 22
    const old = { ...createSave('Alt', 'pirat', '4.4.4'), version: 19 } as Record<string, any>;
    delete old.world.factionWar;
    const r = migrateSave(old, '4.5.0');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.version).toBe(SAVE_VERSION);
    expect(r.data.world.factionWar).toBeNull();
    // Rundlauf: Engine → JSON → Säubern → Engine
    const { eng, reg, w } = realWorld(12);
    fill(eng, 'deutschland', 2);
    eng.declareWar('deutschland', 'england');
    eng.state.islands.koenigshafen.owner = 'deutschland';
    eng.reindex();
    run(eng, 90);
    const json = JSON.parse(JSON.stringify(eng.snapshot()));
    const save = createSave('Neu', 'marine', '4.5.0');
    save.world.factionWar = json;
    const r2 = migrateSave(JSON.parse(JSON.stringify(save)), '4.5.0');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const clean = cleanFactionWar(r2.data.world.factionWar, reg, w.islands)!;
    expect(clean.islands.koenigshafen.owner).toBe('deutschland');
    expect(clean.relations.find((x) => (x.a === 'deutschland' && x.b === 'england'))?.state).toBe('krieg');
    expect(clean.armadas.length).toBe(eng.state.armadas.length);
    expect(clean.armadas.every((a) => a.live === false)).toBe(true);
  });

  it('kaputte oder manipulierte Stände: unbrauchbar → neu; eine Hauptstadt lässt sich nicht verschenken', () => {
    const { reg, w, eng } = realWorld();
    expect(cleanFactionWar(null, reg, w.islands)).toBeNull();
    expect(cleanFactionWar({ v: 9 }, reg, w.islands)).toBeNull();
    const s = eng.snapshot();
    s.islands.albion.owner = 'kurogane';
    s.islands.kronenklippe.owner = 'gibtsnicht';
    (s.nations.england.stock as unknown as Record<string, unknown>).gold = 'viel';
    const c = cleanFactionWar(s, reg, w.islands)!;
    expect(c.islands.albion.owner).toBe('england');
    expect(c.islands.kronenklippe.owner).toBe('england');
    expect(Number.isFinite(c.nations.england.stock.gold)).toBe(true);
  });

  it('läuft lange ohne zu entgleisen: Vorräte endlich und begrenzt, höchstens 8 Armadas, kein Kern ohne Besitzer', () => {
    const { eng } = realWorld(99);
    for (let m = 0; m < 120; m++) {
      run(eng, 60);
      eng.drain();
      expect(eng.state.armadas.filter((a) => a.status !== 'aufgeloest').length).toBeLessThanOrEqual(WAR.maxArmadas);
    }
    for (const id in eng.state.nations) for (const r of RESOURCE_IDS) {
      const v = eng.state.nations[id].stock[r];
      expect(Number.isFinite(v), `${id}.${r}`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    for (const id of ['albion', 'adlerstein', 'yamikura', 'oranjehaven', 'soleilmont', 'weisswacht']) expect(eng.ownerChanged(id)).toBe(false);
    for (const a of eng.state.armadas as ArmadaState[]) expect(Number.isFinite(armadaFire(a))).toBe(true);
  });
});

describe('cameraNearFade (Kamera-Feinschliff aus 4.4.4)', () => {
  it('blendet die Figur ab 0,70 m Abstand weich aus und beim kürzesten Arm ganz', () => {
    expect(NEAR_FADE.start).toBeCloseTo(0.7, 6);
    expect(NEAR_FADE.end).toBeCloseTo(FOOT_ARM.hardMin, 6);
    expect(cameraNearFade(5)).toBe(0);
    expect(cameraNearFade(0.7)).toBe(0);
    expect(cameraNearFade(FOOT_ARM.hardMin)).toBe(1);
    expect(cameraNearFade(0.1)).toBe(1);
    let last = -1;
    for (let d = 0.8; d >= 0.3; d -= 0.01) { const f = cameraNearFade(d); expect(f).toBeGreaterThanOrEqual(last - 1e-12); last = f; }
    const mid = cameraNearFade((NEAR_FADE.start + NEAR_FADE.end) / 2);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
  });

  it('geglättet: schnell hinein, ruhig heraus, ohne NaN', () => {
    const f = new NearFade();
    let v = 0;
    for (let i = 0; i < 20; i++) v = f.update(0.4, 1 / 60);
    expect(v).toBeGreaterThan(0.95);
    for (let i = 0; i < 6; i++) v = f.update(3, 1 / 60);
    expect(v).toBeGreaterThan(0.2);
    for (let i = 0; i < 120; i++) v = f.update(3, 1 / 60);
    expect(v).toBe(0);
    expect(Number.isFinite(f.update(Number.NaN, 1 / 60))).toBe(true);
  });
});
