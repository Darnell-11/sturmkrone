// Phase 4.5B: Eingreifen in den Krieg der Mächte – Kontrollpunkte an Land (Fortschritt, Abwehr, Kriegspunkte), See-Eingriff auf die Moral
// (Kommandoschiff, Transporter), Zweier-Bündnisse (gemeinsame Kriegserklärung, Entsatz für den Partner), Kriegsaufträge (Angebote, Abschluss,
// Lohn, Lieferung, Ablauf), Spielstand aus 4.5.0 ohne Verlust und gebündelte, überlappungsfreie Kampf-Symbole auf der Weltkarte.
import { describe, expect, it } from 'vitest';
import { CONTRACT_DEFS, RESOURCE_IDS, RESOURCE_TARGET, WAR, emptyBag, type NationDefinition, type ResourceBag } from '../src/data/nations';
import {
  FactionWarEngine, NationRegistry, cleanFactionWar, pointsMean, siegePoints,
  type ArmadaState, type FactionWarState, type WarIsland, type WarNotice,
} from '../src/world/factionWarEngine';
import { MarkClusters, WAR_CLUSTER_PX, WAR_LABEL_ZOOM, fitScale } from '../src/ui/mapView';
import { defaultLayers, drawWorldMap, lastLabels, MAP_LAYERS } from '../src/ui/worldMapDraw';
import { REGIONS } from '../src/data/regions';
import type { WorldMapData } from '../src/ui/minimap';
import { migrateSave } from '../src/core/save/migrations';
import { createSave } from '../src/core/save/types';

const P = 'spieler-1';

const nation = (id: string, o: Partial<NationDefinition> = {}): NationDefinition => ({
  id, name: id.toUpperCase(), adjective: id, color: '#888888', heraldry: 'england', capital: `${id}-hof`, exports: ['tee'], startStock: 1,
  doctrine: { aggression: 0.7, trade: 0.5, conquers: true, wResource: 1.2, wStrategic: 1, wMega: 1 }, ...o,
});

function isle(id: string, x: number, z: number, founder: string | null, o: Partial<WarIsland> & { y?: Partial<ResourceBag> } = {}): WarIsland {
  const y = emptyBag();
  for (const r of RESOURCE_IDS) y[r] = o.y?.[r] ?? 0;
  return {
    id, name: id, x, z, r: 80, ring: 2, tier: o.tier ?? 'hafen', founder, conquerable: o.conquerable ?? true, protected: o.protected ?? false,
    produces: o.produces ?? true, mega: o.mega ?? false, strategic: o.strategic ?? 0.4, yield: y, garrisonMax: o.garrisonMax ?? 70,
  };
}

const fill = (eng: FactionWarEngine, id: string, k: number) => { const n = eng.state.nations[id]; for (const r of RESOURCE_IDS) n.stock[r] = RESOURCE_TARGET[r] * k; };
const run = (eng: FactionWarEngine, seconds: number, seen?: WarNotice[]) => { for (let t = 0; t < seconds; t++) { eng.update(1); const n = eng.drain(); if (seen) seen.push(...n); } };
/** Die KI schläft (nur die Regeln, die der Test anstößt, laufen) */
const sleep = (eng: FactionWarEngine) => { for (const id in eng.state.nations) eng.state.nations[id].nextBrainAt = 1e9; };

/** A greift den Hafen von B an; die Armada steht schon vor der Insel. B hat Gold und Proviant (kein Waffenstillstand aus Not), aber keine Kriegslager */
function siegeWorld(seed = 5, size = 8) {
  const reg = new NationRegistry([nation('a'), nation('b')]);
  const islands = [
    isle('a-hof', 0, -2600, 'a', { tier: 'hauptstadt', protected: true, conquerable: false, y: { gold: 300, proviant: 40, rekruten: 20 } }),
    isle('a-hafen', 0, 0, 'a', { y: { gold: 60, proviant: 10 } }),
    isle('b-hafen', 1600, 300, 'b', { y: { hartholz: 14, gold: 10 } }),
    isle('b-hof', 0, 4200, 'b', { tier: 'hauptstadt', protected: true, conquerable: false, y: { gold: 300, proviant: 40, rekruten: 20 } }),
  ];
  const eng = new FactionWarEngine(reg, islands, [], null, seed);
  sleep(eng);
  fill(eng, 'a', 3);
  for (const r of RESOURCE_IDS) eng.state.nations.b.stock[r] = 10;
  eng.state.nations.b.stock.gold = RESOURCE_TARGET.gold * 2;
  eng.state.nations.b.stock.proviant = RESOURCE_TARGET.proviant * 2;
  eng.declareWar('a', 'b');
  const a = eng.launch(0, 2, 'angriff', size)!;
  a.x = a.route[a.route.length - 2]; a.z = a.route[a.route.length - 1]; a.leg = a.route.length / 2;
  run(eng, 2);
  const sg = eng.siegeById(a.siegeId)!;
  return { reg, islands, eng, a, sg };
}

// ---------------------------------------------------------------------------------------------------------------

describe('Kontrollpunkte an Land', () => {
  it('eine Belagerung legt Hafen-Barrikade, Marktplatz und Garnisons-Hof an (kleine Inseln zwei); umkämpft bleibt der Fortschritt wie in 4.5A', () => {
    const { eng, sg } = siegeWorld();
    expect(sg).toBeTruthy();
    expect(sg.points.map((p) => p.name)).toEqual(['Hafen-Barrikade', 'Marktplatz', 'Garnisons-Hof']);
    for (const p of sg.points) { expect(p.hold).toBe(0); expect(Math.hypot(p.x - 1600, p.z - 300)).toBeLessThan(80); }
    expect(pointsMean(sg)).toBe(0);
    const small = siegePoints({ x: 0, z: 0, r: 60, tier: 'siedlung' }, 0);
    expect(small.map((p) => p.kind)).toEqual(['barrikade', 'markt']);
    // ohne Kämpfer vor Ort ändert sich kein Punkt (Hintergrund-Rechnung wie bisher)
    run(eng, 60);
    expect(sg.points.every((p) => p.hold === 0)).toBe(true);
    expect(sg.progress).toBeGreaterThan(0);
  });

  it('wer im Fangradius die Übermacht hat, erobert den Punkt; alle Punkte beim Angreifer beschleunigen die Belagerung auf das 2,6-Fache', () => {
    const { eng, sg } = siegeWorld(6);
    const base = eng.siegeRate(sg);
    const seen: WarNotice[] = [];
    for (let t = 0; t < WAR.pointSeconds; t++) { eng.controlStep(sg.id, [20, 20, 20], [0, 0, 0], 1); seen.push(...eng.drain()); }
    expect(sg.points.every((p) => p.hold === 1)).toBe(true);
    expect(seen.filter((n) => n.type === 'punkt' && n.side === 'angreifer').length).toBe(3);
    expect(eng.siegeRate(sg) / base).toBeCloseTo(1 + WAR.pointK, 5);
    // ausgeglichene Kräfte: der Punkt bewegt sich nicht
    const p0 = sg.points[0].hold;
    eng.controlStep(sg.id, [10, 0, 0], [10, 0, 0], 5);
    expect(sg.points[0].hold).toBe(p0);
  });

  it('hält der Verteidiger mit dem Spieler alle Punkte, läuft der Fortschritt zurück und die Belagerung wird abgewehrt; eroberte Punkte bringen Kriegspunkte', () => {
    const { eng, sg } = siegeWorld(7);
    sg.progress = 0.3;
    expect(eng.joinSiege(sg.id, P, 'verteidiger')).toBe(true);
    expect(eng.helperSide(sg.id, P)).toBe('verteidiger');
    const seen: WarNotice[] = [];
    // die Spielfigur steht an allen drei Punkten (Bitmaske 0b111) und kämpft mit der Garnison
    for (let t = 0; t < WAR.pointSeconds; t++) { eng.controlStep(sg.id, [2, 2, 2], [14, 14, 14], 1, { playerId: P, side: 'verteidiger', at: 0b111 }); seen.push(...eng.drain()); }
    expect(sg.points.every((p) => p.hold === -1)).toBe(true);
    expect(eng.meritOf(P, 'b')).toBe(3 * WAR.kp.punkt);
    expect(seen.filter((n) => n.type === 'kriegspunkte').length).toBe(3);
    expect(eng.siegeRate(sg)).toBeLessThan(0);
    run(eng, 900, seen);
    expect(sg.ended).toBe(true);
    expect(sg.outcome).toBe('abgebrochen');
    expect(eng.ownerOf('b-hafen')).toBe('b');
  });
});

describe('Eingreifen auf See', () => {
  it('versenkt der Spieler das Kommandoschiff, bricht die Moral um 22 % ein und die Belagerten schreiben ihm 40 Kriegspunkte gut', () => {
    const { eng, a, sg } = siegeWorld(8);
    const m0 = sg.morale;
    const flag = a.ships.find((s) => s.role === 'kommando')!;
    eng.syncShip(a.id, flag.id, 0, 0.4, true, P);
    expect(m0 - sg.morale).toBeCloseTo(WAR.flagshipMoraleLoss, 6);
    expect(eng.meritOf(P, 'b')).toBe(WAR.kp.kommando);
    const n = eng.drain().find((x) => x.type === 'kriegspunkte') as Extract<WarNotice, { type: 'kriegspunkte' }>;
    expect(n.nation).toBe('b');
    expect(n.reason).toBe('Kommandoschiff versenkt');
    // ohne Treffer des Spielers: keine Punkte
    const other = a.ships.find((s) => s.role !== 'kommando' && s.role !== 'transport')!;
    eng.syncShip(a.id, other.id, 0, 0, true, null);
    expect(eng.meritOf(P, 'b')).toBe(WAR.kp.kommando);
  });

  it('„Nachschubkonvoi abfangen“: ein vom Spieler versenkter Transporter erfüllt den Auftrag und kostet die Belagerung Moral', () => {
    const { eng, a, sg } = siegeWorld(9);
    const offer = eng.contractOffers(P, []).find((o) => o.kind === 'abfangen')!;
    expect(offer.client).toBe('b');
    const c = eng.acceptContract(P, offer.offerId)!;
    const m0 = sg.morale;
    const tr = a.ships.find((s) => s.role === 'transport')!;
    eng.syncShip(a.id, tr.id, 0, 0, true, P);
    expect(m0 - sg.morale).toBeGreaterThanOrEqual(WAR.transportMoraleLoss - 1e-9);
    const seen: WarNotice[] = [];
    run(eng, 1, seen);
    expect(c.status).toBe('erfuellt');
    expect(seen.some((n) => n.type === 'auftrag' && n.contract.id === c.id)).toBe(true);
    expect(eng.meritOf(P, 'b')).toBe(WAR.kp.transport);
  });
});

describe('Zweier-Bündnisse', () => {
  /** Drei Mächte: A und B handeln miteinander (Vertrauen hoch), beide sind Rivalen von C */
  function triad(seed = 11) {
    const reg = new NationRegistry([nation('a'), nation('b'), nation('c')]);
    const islands = [
      isle('a-hof', -1800, 0, 'a', { tier: 'hauptstadt', protected: true, conquerable: false, y: { gold: 300, proviant: 40, rekruten: 20 } }),
      isle('a-hafen', -900, 0, 'a', { y: { gold: 60, proviant: 10 } }),
      isle('b-hof', 1800, 0, 'b', { tier: 'hauptstadt', protected: true, conquerable: false, y: { gold: 300, proviant: 40, rekruten: 20 } }),
      isle('b-hafen', 400, 900, 'b', { y: { gold: 60, proviant: 10 } }),
      isle('c-hof', 0, 3200, 'c', { tier: 'hauptstadt', protected: true, conquerable: false, y: { gold: 300, proviant: 40, rekruten: 20 } }),
      isle('c-hafen', 0, 2200, 'c', { y: { gold: 60, proviant: 10 } }),
    ];
    const eng = new FactionWarEngine(reg, islands, [], null, seed);
    sleep(eng);
    for (const id of ['a', 'b', 'c']) fill(eng, id, 2);
    const ab = eng.relation('a', 'b')!; ab.state = 'handelspakt'; ab.trust = 50;
    const ac = eng.relation('a', 'c')!; ac.state = 'rivalitaet'; ac.trust = -40;
    const bc = eng.relation('b', 'c')!; bc.state = 'rivalitaet'; bc.trust = -40;
    return { eng, reg };
  }

  it('bewährte Handelspartner mit gemeinsamem Gegner schließen ein Militärbündnis; erklärt einer den Krieg, zieht der andere mit', () => {
    const { eng } = triad();
    const seen: WarNotice[] = [];
    run(eng, WAR.diplomacyEvery + 1, seen);
    expect(eng.stateOf('a', 'b')).toBe('allianz');
    expect(eng.bilateral('a', 'b')).toBe(true);
    expect(seen.some((n) => n.type === 'buendnis')).toBe(true);
    expect(eng.state.stats.alliances).toBe(1);
    seen.length = 0;
    eng.declareWar('a', 'c');
    seen.push(...eng.drain());
    expect(eng.atWar('a', 'c')).toBe(true);
    expect(eng.atWar('b', 'c')).toBe(true);
    const joint = seen.find((n) => n.type === 'krieg' && n.a === 'b') as Extract<WarNotice, { type: 'krieg' }>;
    expect(joint.ally).toBe('a');
    // nie gegen den eigenen Partner
    expect(eng.mayDeclare('a', 'b', true)).toBe(false);
  });

  it('Bündnisfall: wird eine Insel des Partners belagert, schickt der Verbündete eine Entsatzflotte und tritt dafür in den Krieg', () => {
    const { eng, reg } = triad(12);
    const ab = eng.relation('a', 'b')!; ab.state = 'allianz'; ab.allianceUntil = 1e9;
    eng.declareWar('c', 'b', false);
    expect(eng.atWar('a', 'c')).toBe(false);
    const c = eng.launch(reg.indexOf('c'), eng.islandIndexOf('b-hafen'), 'angriff', WAR.minShips)!;
    c.x = c.route[c.route.length - 2]; c.z = c.route[c.route.length - 1]; c.leg = c.route.length / 2;
    run(eng, 2);
    expect(eng.besieged('b-hafen')).toBe(true);
    // die KI von A wacht auf
    eng.state.nations.a.nextBrainAt = eng.state.t;
    const seen: WarNotice[] = [];
    run(eng, 2, seen);
    const relief = eng.state.armadas.find((x: ArmadaState) => x.nation === 'a' && x.purpose === 'entsatz');
    expect(relief?.target).toBe('b-hafen');
    expect(eng.atWar('a', 'c')).toBe(true);
    expect(seen.some((n) => n.type === 'krieg' && n.a === 'a' && n.ally === 'b')).toBe(true);
  });

  it('ein Bündnis ohne gemeinsamen Gegner läuft aus und wird wieder zum Handelspakt; das Ende einer Koalition lässt es bestehen', () => {
    const { eng } = triad(13);
    const ab = eng.relation('a', 'b')!; ab.state = 'allianz'; ab.allianceUntil = eng.state.t + 5;
    for (const k of ['a', 'b']) { const r = eng.relation(k, 'c')!; r.state = 'neutral'; r.trust = 10; }
    const seen: WarNotice[] = [];
    run(eng, WAR.diplomacyEvery + 1, seen);
    expect(eng.stateOf('a', 'b')).toBe('handelspakt');
    expect(seen.some((n) => n.type === 'buendnisEnde')).toBe(true);
  });
});

describe('Kriegsaufträge', () => {
  it('Angebote entstehen aus den laufenden Aktionen; Annehmen stellt den Spieler auf die Seite des Auftraggebers; höchstens zwei zugleich', () => {
    const { eng, sg } = siegeWorld(14);
    const offers = eng.contractOffers(P, []);
    const kinds = offers.map((o) => `${o.kind}:${o.client}`).sort();
    expect(kinds).toEqual(['abfangen:b', 'blockade:b', 'entsatz:b', 'invasion:a']);
    for (const o of offers) {
      expect(o.reward.gold).toBeGreaterThanOrEqual(CONTRACT_DEFS[o.kind].gold);
      expect(o.reward.seals).toBeGreaterThanOrEqual(1);
      expect(o.title).toContain('b-hafen');
    }
    const c = eng.acceptContract(P, offers.find((o) => o.kind === 'entsatz')!.offerId)!;
    expect(c.side).toBe('verteidiger');
    expect(eng.helperSide(sg.id, P)).toBe('verteidiger');
    // schon angenommen: kein zweites Mal im Angebot
    expect(eng.contractOffers(P, []).some((o) => o.offerId === c.offerId)).toBe(false);
    expect(eng.acceptContract(P, offers.find((o) => o.kind === 'blockade')!.offerId)).toBeTruthy();
    expect(eng.acceptContract(P, offers.find((o) => o.kind === 'abfangen')!.offerId)).toBeNull();
    // ein anderer Spieler bekommt dieselben Angebote (Mehrspieler-tauglich)
    expect(eng.contractOffers('spieler-2', []).length).toBe(4);
  });

  it('„Belagerung entsetzen“: genug Kriegspunkte und die Belagerung bricht → erfüllt mit Lohn; ohne Beitrag scheitert er', () => {
    const { eng, sg } = siegeWorld(15);
    const offer = eng.contractOffers(P, []).find((o) => o.kind === 'entsatz')!;
    const mine = eng.acceptContract(P, offer.offerId)!;
    const lazy = eng.acceptContract('spieler-2', offer.offerId)!;
    const half = eng.acceptContract('spieler-3', offer.offerId)!;
    eng.awardMerit(P, 'b', WAR.contractMerit, 'Test', 'b-hafen');
    eng.awardMerit('spieler-3', 'b', WAR.contractMerit * 0.75, 'Test', 'b-hafen');
    expect(mine.merit).toBe(WAR.contractMerit);
    expect(lazy.merit).toBe(0);
    // die Moral der Belagerer bricht (zum Beispiel nach versenkten Transportern)
    sg.morale = 0; eng.armadaById(sg.armadaId)!.morale = 0;
    const seen: WarNotice[] = [];
    run(eng, 2, seen);
    expect(sg.ended).toBe(true);
    expect(mine.status).toBe('erfuellt');
    expect(mine.reward.gold).toBe(Math.round((CONTRACT_DEFS.entsatz.gold * 1.5) / 10) * 10);
    expect(lazy.status).toBe('gescheitert');
    expect(lazy.note).toContain('zu wenig');
    // ab der Hälfte: Teil-Lohn im Verhältnis des Beitrags, ohne Boss-Siegel
    expect(half.status).toBe('erfuellt');
    expect(half.reward.gold).toBe(Math.round((mine.reward.gold * 0.75) / 10) * 10);
    expect(half.reward.seals).toBe(0);
    expect(half.note).toContain('Teil-Lohn');
    expect(seen.filter((n) => n.type === 'auftrag').length).toBe(3);
  });

  it('„Invasions-Armada anführen“ ist erfüllt, wenn die Insel fällt; die Blockadebrecher-Lieferung senkt Fortschritt und Moral', () => {
    const w1 = siegeWorld(16);
    const inv = w1.eng.acceptContract(P, w1.eng.contractOffers(P, []).find((o) => o.kind === 'invasion')!.offerId)!;
    expect(inv.side).toBe('angreifer');
    expect(w1.eng.helperSide(w1.sg.id, P)).toBe('angreifer');
    w1.eng.awardMerit(P, 'a', WAR.contractMerit, 'Test', 'b-hafen');
    w1.sg.progress = 0.9999;
    run(w1.eng, 3);
    expect(w1.eng.ownerOf('b-hafen')).toBe('a');
    expect(inv.status).toBe('erfuellt');

    const w2 = siegeWorld(17);
    const bl = w2.eng.acceptContract(P, w2.eng.contractOffers(P, []).find((o) => o.kind === 'blockade')!.offerId)!;
    w2.sg.progress = 0.5;
    const m0 = w2.sg.morale, g0 = w2.sg.garrison;
    expect(w2.eng.deliverBlockade(P, bl.id)).toBe(true);
    expect(w2.sg.progress).toBeCloseTo(0.5 - WAR.delivery.progress, 6);
    expect(m0 - w2.sg.morale).toBeCloseTo(WAR.delivery.morale, 6);
    expect(w2.sg.garrison - g0).toBeCloseTo(WAR.delivery.garrison, 6);
    // Verluste an Land kommen als Differenz: die Lieferung bleibt erhalten
    w2.eng.siegeLosses(w2.sg.id, 10, 5);
    expect(w2.sg.garrison - g0).toBeCloseTo(WAR.delivery.garrison - 5, 6);
    expect(bl.status).toBe('erfuellt');
    expect(w2.eng.meritOf(P, 'b')).toBe(WAR.kp.lieferung);
    expect(w2.eng.deliverBlockade(P, bl.id)).toBe(false);
  });

  it('abgelaufene Aufträge scheitern, aufgegebene enden sofort; beendete verschwinden nach zehn Minuten', () => {
    const { eng } = siegeWorld(18);
    const offers = eng.contractOffers(P, []);
    const c1 = eng.acceptContract(P, offers.find((o) => o.kind === 'entsatz')!.offerId)!;
    const c2 = eng.acceptContract(P, offers.find((o) => o.kind === 'blockade')!.offerId)!;
    c1.deadline = eng.state.t + 1;
    run(eng, 3);
    expect(c1.status).toBe('gescheitert');
    expect(c1.note).toBe('Zeit abgelaufen');
    expect(eng.abandonContract(P, c2.id)?.status).toBe('aufgegeben');
    // die Belagerung darf in der Zwischenzeit nicht fallen: Garnison stark halten
    run(eng, 610);
    expect(eng.state.contracts.length).toBe(0);
  });
});

describe('Spielstand: 4.5.0-Stände laden ohne Verlust', () => {
  it('ohne Kontrollpunkte, Aufträge und Bündnisdauer: Besitz, Armadas und Belagerung bleiben, die neuen Felder entstehen; der Rundlauf behält alles', () => {
    const { reg, islands, eng, sg } = siegeWorld(19);
    eng.state.islands['a-hafen'].garrison = 33;
    // so sah ein Stand aus 4.5.0 aus
    const old = JSON.parse(JSON.stringify(eng.snapshot())) as Record<string, any>;
    delete old.contracts; delete old.merit; delete old.stats.alliances; delete old.stats.contracts;
    for (const r of old.relations) delete r.allianceUntil;
    for (const g of old.sieges) { delete g.points; delete g.helpers; }
    const save = { ...createSave('Alt', 'pirat', '4.5.0'), version: 20 } as Record<string, any>;
    save.world.factionWar = old;
    const r = migrateSave(JSON.parse(JSON.stringify(save)), '4.5.1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.version).toBe(20);
    expect(r.data.world.factionWar).toBeTruthy();
    const clean = cleanFactionWar(r.data.world.factionWar, reg, islands)!;
    expect(clean).toBeTruthy();
    expect(clean.islands['a-hafen'].garrison).toBe(33);
    expect(clean.armadas.length).toBe(eng.state.armadas.length);
    const sg2 = clean.sieges.find((g) => g.id === sg.id)!;
    expect(sg2.progress).toBeCloseTo(sg.progress, 9);
    expect(sg2.points.length).toBe(3);
    expect(sg2.helpers).toEqual([]);
    expect(clean.contracts).toEqual([]);
    expect(clean.merit).toEqual({});
    expect(clean.stats.alliances).toBe(0);
    for (const r of clean.relations) expect(r.allianceUntil).toBe(0);
    // mit Aufträgen, Punkten, Kriegspunkten und Bündnis: der Rundlauf über JSON ändert nichts
    const e2 = new FactionWarEngine(reg, islands, [], clean, 1);
    e2.acceptContract(P, e2.contractOffers(P, []).find((o) => o.kind === 'entsatz')!.offerId);
    e2.controlStep(sg.id, [5, 0, 0], [0, 0, 0], 3, { playerId: P, side: 'angreifer', at: 1 });
    e2.awardMerit(P, 'b', 12, 'Test', 'b-hafen');
    const snap = e2.snapshot();
    const back = cleanFactionWar(JSON.parse(JSON.stringify(snap)) as FactionWarState, reg, islands)!;
    expect(back.contracts).toEqual(snap.contracts);
    expect(back.merit).toEqual(snap.merit);
    expect(back.sieges.find((g) => g.id === sg.id)!.points).toEqual(snap.sieges.find((g) => g.id === sg.id)!.points);
    expect(back.sieges.find((g) => g.id === sg.id)!.helpers).toEqual(snap.sieges.find((g) => g.id === sg.id)!.helpers);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Weltkarte

/** Zeichenfläche ohne Browser: zeichnet nichts, merkt sich Texte; Textbreite = 6,5 px je Zeichen */
function fakeCtx(texts: string[]): CanvasRenderingContext2D {
  const grad = { addColorStop() {} };
  const target: Record<string, unknown> = {
    measureText: (t: string) => ({ width: t.length * 6.5 }),
    fillText: (t: string) => { texts.push(t); },
    createRadialGradient: () => grad, createLinearGradient: () => grad,
  };
  return new Proxy(target, {
    get: (o, k: string) => (k in o ? o[k] : () => undefined),
    set: (o, k: string, v) => { o[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

/** Ein dichtes Kriegsgebiet mitten in der Karte: sechs Belagerungen und drei Großschlachten auf engem Raum */
function warMap(): WorldMapData {
  const DEFS = REGIONS.flatMap((r) => r.islands);
  const near = DEFS.filter((i) => Math.hypot(i.x, i.z) < 2600 && !i.skerry).slice(0, 6);
  return {
    islands: DEFS, regions: REGIONS, known: () => true, islandMarks: new Map(),
    markers: { player: { x: 4000, z: 4000, heading: 0 }, enemies: [], target: null, digs: [] },
    wars: {
      armadas: [{ x: 300, z: 300, heading: 1, color: '#3F63C8', name: 'Armada Frankreich', ships: 8, relief: false, tx: near[0].x, tz: near[0].z }],
      sieges: near.map((i, k) => ({ id: i.id, x: i.x, z: i.z, r: i.r, color: k % 2 ? '#E0373F' : '#3F63C8', name: `Belagerung von ${i.name}`, progress: 0.1 * (k + 1), points: 'Kontrollpunkte: 1 Angreifer, 1 Verteidiger, 1 umkämpft' })),
      battles: [{ x: 200, z: -150, name: 'Großschlacht England ⚔ Frankreich' }, { x: 260, z: -120, name: 'Großschlacht Kurogane ⚔ Deutschland' }, { x: -400, z: 500, name: 'Großschlacht Niederlande ⚔ Kurogane' }],
      alliances: [{ ax: 0, az: 9000, bx: 7000, bz: 0, color: '#E8CB7C', coalition: false }],
      conquered: [{ x: near[1].x, z: near[1].z, r: near[1].r, color: '#E0373F' }],
    },
  };
}

function overlaps(): number {
  const L = lastLabels(), a: number[] = [], b: number[] = [];
  let bad = 0;
  for (let i = 0; i < L.count; i++) for (let j = i + 1; j < L.count; j++) {
    L.at(i, a); L.at(j, b);
    if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) bad++;
  }
  return bad;
}

describe('Weltkarte: Krieg & Frontlinien ohne Textüberlappung', () => {
  it('Bündeln: kein Paar von Kampf-Symbolen liegt näher als der Mindestabstand, jede Marke gehört zu genau einem Bündel', () => {
    const c = new MarkClusters(64);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let round = 0; round < 20; round++) {
      const n = 5 + Math.floor(rnd() * 40);
      const xs = new Float32Array(n), ys = new Float32Array(n);
      for (let i = 0; i < n; i++) { xs[i] = rnd() * 360; ys[i] = rnd() * 240; }
      const k = c.build(xs, ys, n, WAR_CLUSTER_PX);
      let sum = 0;
      for (let a = 0; a < k; a++) {
        sum += c.count[a];
        for (let b = a + 1; b < k; b++) expect(Math.hypot(c.cx[a] - c.cx[b], c.cy[a] - c.cy[b])).toBeGreaterThanOrEqual(WAR_CLUSTER_PX - 1e-3);
      }
      expect(sum).toBe(n);
      for (let i = 0; i < n; i++) { expect(c.of[i]).toBeGreaterThanOrEqual(0); expect(c.of[i]).toBeLessThan(k); }
    }
  });

  it('der Filter „Krieg & Frontlinien“ ist eine eigene Ebene; unter 1,25× gebündelte Symbole ohne Text, bei 2,5× volle Texte – nie überlappend', () => {
    expect(MAP_LAYERS.some((l) => l.id === 'war' && l.label === 'Krieg & Frontlinien')).toBe(true);
    expect(defaultLayers().war).toBe(true);
    const d = warMap();
    const W = 1440, H = 900;
    // 1,00×: Gesamtansicht
    let texts: string[] = [];
    drawWorldMap(fakeCtx(texts), W, H, 1, { cx: 0, cz: 0, scale: fitScale(W, H) }, d, { selected: null, layers: defaultLayers(), fog: null, zoom: 1 });
    expect(texts.some((t) => t.startsWith('Belagerung von') || t.startsWith('Großschlacht'))).toBe(false);
    expect(texts.some((t) => t.startsWith('×'))).toBe(true);
    expect(overlaps()).toBe(0);
    // angeklickte Insel: ihr Belagerungstext trotz Bündelung
    texts = [];
    const sel = d.wars!.sieges[2].id!;
    drawWorldMap(fakeCtx(texts), W, H, 1, { cx: 0, cz: 0, scale: fitScale(W, H) }, d, { selected: sel, layers: defaultLayers(), fog: null, zoom: 1 });
    expect(texts.filter((t) => t.startsWith('Belagerung von')).length).toBe(1);
    expect(overlaps()).toBe(0);
    // 2,50×: volle Texte um die Kartenmitte
    texts = [];
    drawWorldMap(fakeCtx(texts), W, H, 1, { cx: 0, cz: 0, scale: fitScale(W, H) * 2.5 }, d, { selected: null, layers: defaultLayers(), fog: null, zoom: 2.5 });
    expect(2.5).toBeGreaterThanOrEqual(WAR_LABEL_ZOOM);
    expect(texts.filter((t) => t.startsWith('Belagerung von')).length).toBeGreaterThan(0);
    expect(texts.some((t) => t.startsWith('Großschlacht'))).toBe(true);
    expect(overlaps()).toBe(0);
    // Ebene aus: weder Symbole noch Texte des Krieges
    texts = [];
    drawWorldMap(fakeCtx(texts), W, H, 1, { cx: 0, cz: 0, scale: fitScale(W, H) * 2.5 }, d, { selected: null, layers: { ...defaultLayers(), war: false }, fog: null, zoom: 2.5 });
    expect(texts.some((t) => t.startsWith('Belagerung von') || t.startsWith('×'))).toBe(false);
  });
});
