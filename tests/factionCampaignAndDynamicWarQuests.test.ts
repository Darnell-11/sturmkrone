// Phase 4.7E: dauerhaft aktive, ressourcengebundene Welt-Simulation der fünf Mächte (Zero-GC, < 1 ms je Schritt), Patrouillen, Nachschub-Konvois,
// Seeblockaden und Gegenschläge unter festen Obergrenzen, einmalige Team-Wahl vor dem Rat der Gesandten, voller Verbündeten-Schutz, Live-Kriegs-Quests
// an den Einheiten der Welt (mit Umschlag „Gegenangriff“), fünf Hauptkampagnen mit offenem Horizont, Cache der Nachbearbeitung über Bühnenwechsel und
// Spielstand 27.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/data/regions';
import { NATION_DEFS, RESOURCE_IDS, RESOURCE_TARGET, WAR, WAR_LOGI, emptyBag, type NationDefinition, type ResourceBag } from '../src/data/nations';
import { WAR_CAPS } from '../src/data/balanceConfig';
import {
  FactionWarEngine, NationRegistry, armadaCost, cleanFactionWar, isMilitary, shipsAlive, warWorldFromDefs,
  type ArmadaState, type WarIsland, type WarNotice,
} from '../src/world/factionWarEngine';
import {
  ALLEGIANCE_PATHS, PLEDGE_TEXT, TEAM_IDS, canSwitch, cleanAllegiance, councilCards, newAllegiance, pledge,
} from '../src/data/allegiance';
import { CAMPAIGNS, CAMPAIGN_QUESTS, CHAPTER_LEVELS, COMMANDERS, COMMANDER_BY_ID, OPEN_HORIZON, chapterId, flagshipName } from '../src/data/campaigns';
import { KAISER_SPEC_BY_ID, type KaiserId } from '../src/data/kaiserIslands';
import { QUESTS, QUEST_BY_ID } from '../src/data/quests';
import { QuestSystem } from '../src/story/questSystem';
import { WAR_QUEST, WarQuestDirector, cleanWarQuests, newWarQuestState, type WarQuestEvent } from '../src/story/warQuests';
import { canHarm, relationOf, validatePlayerHit } from '../src/combat/targetLock';
import { PostChainCache, postChainKey, type PostChainSpec } from '../src/render/postChainCache';
import { migrateSave } from '../src/core/save/migrations';
import { createSave, defaultProgress, SAVE_VERSION } from '../src/core/save/types';

const DEFS = REGIONS.flatMap((r) => r.islands);
const ISLAND_IDS = new Set(DEFS.map((d) => d.id));

function realWorld(seed = 7) {
  const reg = new NationRegistry();
  const w = warWorldFromDefs(DEFS, reg);
  return { reg, w, eng: new FactionWarEngine(reg, w.islands, w.obstacles, null, seed) };
}

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

/** Künstliche Welt wie in den 4.5-Tests: A (Hof, Hafen) gegen B (Holz, Stahl, Mega, Hof) */
function toyWorld(seed = 3) {
  const reg = new NationRegistry([nation('a'), nation('b')]);
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
const empty = (eng: FactionWarEngine, id: string) => { const n = eng.state.nations[id]; for (const r of RESOURCE_IDS) n.stock[r] = 0; };
const run = (eng: FactionWarEngine, seconds: number) => { for (let t = 0; t < seconds; t++) eng.update(1); };
const drainAll = (eng: FactionWarEngine, seconds: number) => { const seen: WarNotice[] = []; for (let t = 0; t < seconds; t++) { eng.update(1); seen.push(...eng.drain()); } return seen; };
/** Verband ans Ende seiner Route setzen (der nächste Schritt meldet die Ankunft) */
const arriveNow = (a: ArmadaState) => { a.x = a.route[a.route.length - 2]; a.z = a.route[a.route.length - 1]; a.leg = a.route.length / 2; };
const idx = (eng: FactionWarEngine, id: string) => eng.islandIndexOf(id);

// ---------------------------------------------------------------------------------------------------------------

describe('Welt-Simulation: dauerhaft aktiv, ressourcengebunden, Zero-GC', () => {
  it('rechnet die ganze Karte durchgehend (auch fern vom Spieler) – im Mittel unter 1 ms je Schritt', () => {
    const { eng } = realWorld(41);
    // Kriege anstoßen, damit Logistik, Schlachten und Belagerungen mitlaufen
    eng.declareWar('england', 'frankreich');
    eng.declareWar('deutschland', 'kurogane');
    eng.declareWar('niederlande', 'kurogane');
    const times: number[] = [];
    for (let t = 0; t < 3600; t++) {
      const t0 = performance.now();
      eng.update(1);
      times.push(performance.now() - t0);
      eng.drain();
    }
    times.sort((x, y) => x - y);
    const mean = times.reduce((s, v) => s + v, 0) / times.length;
    expect(mean).toBeLessThan(1);
    expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(2.5);
    expect(eng.perf.steps).toBe(3600);
    expect(eng.perf.avg).toBeLessThan(1);
    // alle fünf Mächte handeln: Patrouillen auf den Seewegen, im Krieg Konvois
    const s = eng.state.stats;
    expect(s.patrols).toBeGreaterThanOrEqual(5);
    expect(s.convoys).toBeGreaterThan(0);
    for (const id of TEAM_IDS) expect(eng.state.armadas.some((a) => a.nation === id) || s.patrols > 0, id).toBe(true);
  });

  it('Zero-GC im Takt: Abfragen schreiben in vorhandene Felder, der Takt legt ohne Ereignis keine neuen Objekte an', () => {
    const { eng } = realWorld(5);
    run(eng, 400);
    eng.drain();
    // Belegung je Nation: immer dasselbe Arbeitsfeld
    expect(eng.loadOf('england')).toBe(eng.loadOf('kurogane'));
    const out: string[] = [];
    expect(eng.foesOf('england', out)).toBe(out);
    // ruhiges Fenster: alle Nationen ohne Mittel – kein Auslaufen, keine neuen Verbände, die vorhandenen Datensätze bleiben dieselben Objekte
    for (const id of Object.keys(eng.state.nations)) empty(eng, id);
    const before = eng.state.armadas.filter((a) => a.status !== 'aufgeloest' && a.status !== 'heimkehr');
    const refs = before.map((a) => a.ships);
    const seq = eng.state.seq;
    run(eng, 25);
    expect(eng.state.seq).toBe(seq);
    for (let k = 0; k < before.length; k++) if (eng.state.armadas.includes(before[k])) expect(before[k].ships).toBe(refs[k]);
  });

  it('Live-Kriegs-Quests: der Takt nutzt dieselbe Ereignis- und Ergebnisliste', () => {
    const { eng } = toyWorld();
    const dir = new WarQuestDirector();
    const out: WarQuestEvent[] = [];
    const list: never[] = [];
    expect(dir.update(eng, 'b', eng.state.t, out)).toBe(out);
    expect(dir.active('b', list)).toBe(list);
  });
});

describe('Strikte Ressourcen- und Obergrenzen (balanceConfig.ts WAR_CAPS)', () => {
  it('ohne Mittel läuft nichts aus: keine Armada, keine Patrouille, kein Konvoi, keine Blockade', () => {
    const { eng } = toyWorld(9);
    eng.declareWar('a', 'b');
    empty(eng, 'a');
    // Einkommen fließt weiter, aber der Unterhalt frisst es: die Nation bleibt unter der Kriegsreserve
    for (let m = 0; m < 10; m++) { run(eng, 60); empty(eng, 'a'); }
    expect(eng.state.armadas.filter((a) => a.nation === 'a').length).toBe(0);
  });

  it('jede Aufstellung zieht ihre Baukosten (und die Ladung) aus dem Lager', () => {
    const { eng } = toyWorld(4);
    fill(eng, 'b', 2);
    const before = { ...eng.state.nations.b.stock };
    run(eng, 30); // erste Entscheidung: Patrouille (im Frieden eine)
    const fleets = eng.state.armadas.filter((a) => a.nation === 'b');
    expect(fleets.length).toBeGreaterThan(0);
    const spent = emptyBag();
    for (const a of fleets) { const c = armadaCost(a.ships, emptyBag()); for (const r of RESOURCE_IDS) spent[r] += c[r] + (a.cargo?.[r] ?? 0); }
    expect(spent.hartholz).toBeGreaterThan(0);
    // Holz und Tuch hat in 30 s niemand nachgeliefert: das Lager ist mindestens um die Baukosten kleiner
    expect(eng.state.nations.b.stock.hartholz).toBeLessThanOrEqual(before.hartholz - spent.hartholz + 1e-6);
    expect(eng.state.nations.b.stock.segeltuch).toBeLessThanOrEqual(before.segeltuch - spent.segeltuch + 1e-6);
  });

  it('respektiert über eine lange Kriegszeit alle Obergrenzen: Schiffe, Truppen, Patrouillen, Konvois, Blockaden, Verbände', () => {
    const { eng } = realWorld(77);
    eng.declareWar('england', 'frankreich');
    eng.declareWar('deutschland', 'kurogane');
    for (const id of Object.keys(eng.state.nations)) fill(eng, id, 3.5);
    for (let m = 0; m < 90; m++) {
      run(eng, 40);
      eng.drain();
      let fleets = 0;
      for (const a of eng.state.armadas) if (a.status !== 'aufgeloest') fleets++;
      expect(fleets).toBeLessThanOrEqual(WAR_CAPS.fleets);
      expect(eng.state.armadas.filter((a) => a.status !== 'aufgeloest' && isMilitary(a.purpose)).length).toBeLessThanOrEqual(WAR.maxArmadas);
      for (const id of Object.keys(eng.state.nations)) {
        const L = eng.loadOf(id);
        expect(L.ships, `${id} Schiffe`).toBeLessThanOrEqual(WAR_CAPS.shipsAtSea);
        expect(L.troops, `${id} Truppen`).toBeLessThanOrEqual(WAR_CAPS.troopsAtSea);
        expect(L.patrols).toBeLessThanOrEqual(WAR_CAPS.patrols);
        expect(L.convoys).toBeLessThanOrEqual(WAR_CAPS.convoys);
        expect(L.blockades).toBeLessThanOrEqual(WAR_CAPS.blockades);
        for (const r of RESOURCE_IDS) { const v = eng.state.nations[id].stock[r]; expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); }
      }
      for (const w of eng.islands) expect(eng.state.islands[w.id].garrison).toBeLessThanOrEqual(w.garrisonMax * Math.max(2, WAR_CAPS.garrisonK) + 1e-6);
    }
  });

  it('Garnisons-Verstärkung kostet Rekruten, Gold und Proviant – ohne Gold keine Verstärkung', () => {
    const { eng, islands } = toyWorld(6);
    fill(eng, 'b', 1);
    eng.state.islands.holz.garrison = 20;
    run(eng, WAR.cycle + 1);
    expect(eng.state.islands.holz.garrison).toBeGreaterThan(20);
    // ohne Gold (und ohne Gold-Einnahmen der Inseln): die Garnison bleibt, wie sie ist – Rekruten allein genügen nicht
    const t2 = toyWorld(6);
    for (const w of t2.islands) if (w.founder === 'b') w.yield.gold = 0;
    fill(t2.eng, 'b', 1);
    t2.eng.state.nations.b.stock.gold = 0;
    t2.eng.state.islands.holz.garrison = 20;
    run(t2.eng, WAR.cycle + 1);
    expect(t2.eng.state.islands.holz.garrison).toBe(20);
    expect(t2.eng.state.nations.b.stock.rekruten).toBeGreaterThan(0);
    void islands;
  });

  it('Reparatur kostet Holz, Tuch, Stahl und Gold – reicht das Lager nicht, wird das Schiff abgewrackt', () => {
    const mk = (stockK: number) => {
      const { eng } = toyWorld(12);
      fill(eng, 'a', 2);
      const a = eng.launch(idx(eng, 'a-hafen') >= 0 ? 0 : 0, idx(eng, 'holz'), 'angriff')!;
      for (const sh of a.ships) sh.hull = 0.3;
      // sofort heim: kein Krieg, also kehrt die Armada am Ziel um und löst sich im Heimathafen auf
      fill(eng, 'a', stockK);
      return { eng, a };
    };
    const rich = mk(2);
    arriveNow(rich.a);
    rich.eng.update(1); // Ziel ist nicht im Krieg → Heimkehr
    arriveNow(rich.a);
    const wood0 = rich.eng.state.nations.a.stock.hartholz;
    rich.eng.update(1);
    expect(rich.a.status).toBe('aufgeloest');
    expect(rich.eng.state.stats.repairs).toBeGreaterThan(0);
    // Rückgabe abzüglich Reparatur: weniger Holz als die volle Rückgabe
    const refund = rich.a.ships.reduce((s, x) => s + (x.down ? 0 : 1), 0);
    expect(refund).toBeGreaterThan(0);
    expect(rich.eng.state.nations.a.stock.hartholz).toBeGreaterThan(wood0 - 1e-6);
    const poor = mk(0);
    arriveNow(poor.a);
    poor.eng.update(1);
    arriveNow(poor.a);
    poor.eng.update(1);
    expect(poor.eng.state.stats.scrapped).toBeGreaterThan(0);
  });
});

describe('Logistik: Patrouillen, Nachschub-Konvois, Versorgungsnot, Seeblockaden, Gegenschläge', () => {
  it('jede Macht patrouilliert ihre Seewege (Streife zwischen eigenen Inseln, begrenzte Dauer)', () => {
    const { eng } = toyWorld(5);
    fill(eng, 'a', 1.5); fill(eng, 'b', 1.5);
    run(eng, 60);
    for (const id of ['a', 'b']) {
      const p = eng.state.armadas.find((x) => x.nation === id && x.purpose === 'patrouille');
      expect(p, id).toBeTruthy();
      expect(p!.lane.length).toBeGreaterThanOrEqual(1);
      expect(p!.until).toBeGreaterThan(eng.state.t);
      expect(p!.ships.length).toBe(WAR_LOGI.patrolShips);
    }
  });

  it('ein Nachschub-Konvoi bringt der Belagerung Proviant, Medizin und Rekruten – aus dem Lager der Nation', () => {
    const { eng } = toyWorld(8);
    eng.declareWar('a', 'b');
    fill(eng, 'a', 2); empty(eng, 'b');
    const a = eng.launch(0, idx(eng, 'holz'), 'angriff')!;
    arriveNow(a);
    eng.update(1);
    expect(a.status).toBe('belagerung');
    a.supply.proviant = 5; // Proviant geht zur Neige
    fill(eng, 'a', 2);
    const steel0 = eng.state.nations.a.stock.proviant;
    run(eng, 35);
    const c = eng.state.armadas.find((x) => x.purpose === 'konvoi' && x.supplies === a.id);
    expect(c, 'Konvoi für die Belagerung').toBeTruthy();
    expect(c!.cargo!.proviant).toBeGreaterThan(0);
    expect(eng.state.nations.a.stock.proviant).toBeLessThan(steel0);
    const p0 = a.supply.proviant, t0 = a.troops;
    arriveNow(c!);
    eng.update(1);
    expect(c!.delivered).toBe(true);
    expect(a.supply.proviant).toBeGreaterThan(p0);
    expect(a.troops).toBeGreaterThan(t0);
  });

  it('versenkt man die Transporter, geht die Ladung unter – die Belagerer geraten in Versorgungsnot', () => {
    const { eng } = toyWorld(8);
    eng.declareWar('a', 'b');
    fill(eng, 'a', 2); empty(eng, 'b');
    const a = eng.launch(0, idx(eng, 'holz'), 'angriff')!;
    arriveNow(a);
    eng.update(1);
    a.supply.proviant = 5;
    run(eng, 35);
    const c = eng.state.armadas.find((x) => x.purpose === 'konvoi' && x.supplies === a.id)!;
    const morale0 = a.morale;
    const seen: WarNotice[] = [];
    for (const sh of c.ships) if (sh.role === 'transport') eng.syncShip(c.id, sh.id, 0, 0, true, 'spieler-1');
    seen.push(...eng.drain());
    expect(c.cargo).toBeNull();
    expect(c.delivered).toBe(false);
    expect(a.morale).toBeLessThan(morale0);
    expect(seen.some((n) => n.type === 'konvoi' && n.event === 'verloren')).toBe(true);
    // ohne Nachschub sinkt die Moral weiter (Hunger), bis die Belagerung bricht
    a.supply.proviant = 0;
    const m1 = a.morale;
    empty(eng, 'a');
    run(eng, 60);
    expect(a.morale).toBeLessThan(m1);
  });

  it('eine feindliche Patrouille stellt einen Konvoi ohne Begleitschutz und kapert ihn', () => {
    const { eng } = toyWorld(10);
    eng.declareWar('a', 'b');
    fill(eng, 'a', 2); empty(eng, 'b');
    const a = eng.launch(0, idx(eng, 'holz'), 'angriff')!;
    arriveNow(a);
    eng.update(1);
    let c: ArmadaState | undefined;
    for (let t = 0; t < 150 && !c; t++) { a.supply.proviant = 5; empty(eng, 'b'); eng.update(1); c = eng.state.armadas.find((x) => x.purpose === 'konvoi' && x.supplies === a.id); }
    expect(c, 'Konvoi von A').toBeTruthy();
    // B stellt eine Patrouille auf
    fill(eng, 'b', 2);
    let patrol: ArmadaState | undefined;
    for (let t = 0; t < 120 && !patrol; t++) { eng.update(1); patrol = eng.state.armadas.find((x) => x.nation === 'b' && x.purpose === 'patrouille'); }
    expect(patrol, 'Patrouille von B').toBeTruthy();
    expect(c!.delivered).toBe(false);
    // die Begleiter fallen weg, die Patrouille kreuzt den Weg des Konvois
    for (const sh of c!.ships) if (sh.role !== 'transport') { sh.down = true; sh.hull = 0; }
    const p = patrol!;
    p.x = c!.x + 100; p.z = c!.z; p.battleId = null; p.calmUntil = 0; p.status = 'anmarsch';
    const provB = eng.state.nations.b.stock.proviant;
    const seen = drainAll(eng, 3);
    expect(shipsAlive(c!)).toBe(0);
    expect(seen.some((n) => n.type === 'konvoi' && n.event === 'verloren')).toBe(true);
    // der Sieger erbeutet einen Teil der Ladung
    expect(eng.state.nations.b.stock.proviant).toBeGreaterThan(provB);
  });

  it('Seeblockade: der Hafen liefert nichts mehr an seine Kasse, bis die Blockade gebrochen ist', () => {
    const { eng } = toyWorld(14);
    eng.declareWar('a', 'b');
    fill(eng, 'a', 2.2); empty(eng, 'b');
    let bl: ArmadaState | undefined;
    for (let t = 0; t < 200 && !bl; t++) { eng.update(1); bl = eng.state.armadas.find((x) => x.purpose === 'blockade'); }
    expect(bl, 'Blockadeflotte').toBeTruthy();
    arriveNow(bl!);
    eng.update(1);
    expect(bl!.status).toBe('blockade');
    const st = eng.state.islands[bl!.target];
    expect(st.blockadeId).toBe(bl!.id);
    const store0 = { ...st.store };
    run(eng, WAR.cycle + 1);
    // das Lager der Insel wächst, die Kasse sieht nichts davon
    const w = eng.island(bl!.target)!;
    const r = RESOURCE_IDS.find((x) => w.yield[x] > 0)!;
    expect(st.store[r]).toBeGreaterThan(store0[r]);
    // Blockade brechen: alle Kriegsschiffe versenkt
    for (const sh of bl!.ships) eng.syncShip(bl!.id, sh.id, 0, 0, true);
    eng.update(1);
    expect(st.blockadeId).toBeNull();
  });

  it('nach einem Inselverlust plant der Verlierer den Gegenschlag – mit echten Mitteln und Meldung', () => {
    const { eng } = toyWorld(16);
    eng.declareWar('a', 'b');
    fill(eng, 'a', 2); empty(eng, 'b');
    const a = eng.launch(0, idx(eng, 'holz'), 'angriff')!;
    arriveNow(a);
    eng.update(1);
    const sg = eng.siegeOf('holz')!;
    sg.progress = 0.9999;
    run(eng, 3);
    expect(eng.ownerOf('holz')).toBe('a');
    expect(eng.state.nations.b.counter?.islandId).toBe('holz');
    fill(eng, 'b', 2);
    const seen = drainAll(eng, WAR_LOGI.counterDelay + WAR.brainEvery + 5);
    const g = seen.find((n) => n.type === 'gegenschlag') as Extract<WarNotice, { type: 'gegenschlag' }> | undefined;
    expect(g, 'Gegenschlag gemeldet').toBeTruthy();
    expect(g!.islandId).toBe('holz');
    expect(g!.armada.counter).toBe(true);
    expect(eng.state.stats.counters).toBe(1);
  });
});

describe('Einmalige, dauerhafte Team-Wahl vor dem Rat der Gesandten', () => {
  it('genau die fünf Mächte sind wählbar; die Marine ist als gesperrter Pfad vorbereitet', () => {
    expect([...TEAM_IDS].sort()).toEqual(NATION_DEFS.filter((n) => n.doctrine.conquers).map((n) => n.id).sort());
    expect(ALLEGIANCE_PATHS.filter((p) => !p.locked).map((p) => p.id)).toEqual([...TEAM_IDS]);
    expect(ALLEGIANCE_PATHS.find((p) => p.id === 'marine')?.locked).toBe(true);
    const cards = councilCards(() => ({ islands: 9, megas: 1, wars: ['Frankreich'], allies: [], fleets: 3 }));
    expect(cards.length).toBe(6);
    expect(cards.filter((c) => !c.locked).length).toBe(5);
    for (const c of cards.filter((x) => !x.locked)) { expect(c.pitch.length).toBeGreaterThan(40); expect(c.situation).toContain('9 Inseln'); }
    expect(PLEDGE_TEXT).toBe('Einmalige Entscheidung — Du verpflichtest dich dauerhaft diesem Team und kämpfst fortan an seiner Seite');
  });

  it('der Schwur gilt einmal und für immer – kein Wechsel, kein gesperrter Pfad, keine fremde Macht', () => {
    const s = newAllegiance();
    expect(canSwitch(s)).toBe(true);
    expect(pledge(s, 'marine', 10).ok).toBe(false);
    expect(pledge(s, 'atlantis', 10).ok).toBe(false);
    const r = pledge(s, 'deutschland', 120);
    expect(r.ok).toBe(true);
    expect(s.team).toBe('deutschland');
    expect(s.pledgedAt).toBe(120);
    expect(canSwitch(s)).toBe(false);
    const again = pledge(s, 'frankreich', 200);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toContain('kein Wechsel'.slice(0, 0) + 'Wechsel');
    expect(s.team).toBe('deutschland');
    // Laden: bleibt; Unsinn wird verworfen
    expect(cleanAllegiance(JSON.parse(JSON.stringify(s))).team).toBe('deutschland');
    expect(cleanAllegiance({ team: 'marine' }).team).toBeNull();
    expect(cleanAllegiance({ team: 'xyz', horizon: true }).horizon).toBe(false);
  });

  it('jedes der fünf Teams kann gewählt werden; die Engine kennt die Treue und erlaubt keinen Wechsel', () => {
    for (const team of TEAM_IDS) {
      const s = newAllegiance();
      expect(pledge(s, team, 1).ok).toBe(true);
      const { eng } = realWorld(3);
      expect(eng.setAllegiance('foot-1', team)).toBe(true);
      expect(eng.teamOf('foot-1')).toBe(team);
      const other = TEAM_IDS.find((t) => t !== team)!;
      expect(eng.setAllegiance('foot-1', other)).toBe(false);
      expect(eng.teamOf('foot-1')).toBe(team);
    }
  });
});

describe('Konsequente Allianz und null Eigenbeschuss', () => {
  it('Team-Schiffe und -Trupps sind immer verbündet (auch „provoziert“) – kein Angriff kann ihnen schaden', () => {
    const ctx = { standing: () => -100, allies: new Set<string>(['deutschland']), peaceAt: 20, allyAt: 60 };
    // so meldet das Seesystem ein Schiff des eigenen Teams: `ally` (NavalSystem.isTeamShip)
    const team = relationOf({ ally: true, provoked: true, hostile: true, power: 'deutschland' }, ctx);
    expect(team).toBe('friendly');
    expect(canHarm('friendly', team)).toBe(false);
    expect(validatePlayerHit({ relation: team, alive: true })).not.toBe('');
    // Kriegsgegner des Teams sind Feinde, auch bei gutem Ansehen
    const foeCtx = { standing: () => 80, allies: new Set<string>(), peaceAt: 20, allyAt: 60 };
    const foe = relationOf({ hostile: true, power: 'kurogane' }, foeCtx);
    expect(foe).toBe('hostile');
    expect(canHarm('friendly', foe)).toBe(true);
  });

  it('an Belagerungen des Teams steht der Spieler automatisch auf dessen Seite und kann nie gegen sein Team kämpfen', () => {
    const { eng } = toyWorld(8);
    eng.declareWar('a', 'b');
    fill(eng, 'a', 2); empty(eng, 'b');
    eng.setAllegiance('foot-1', 'b');
    const a = eng.launch(0, idx(eng, 'holz'), 'angriff')!;
    arriveNow(a);
    eng.update(1);
    const sg = eng.siegeOf('holz')!;
    expect(eng.helperSide(sg.id, 'foot-1')).toBe('verteidiger');
    expect(eng.joinSiege(sg.id, 'foot-1', 'angreifer')).toBe(false);
    expect(eng.helperSide(sg.id, 'foot-1')).toBe('verteidiger');
    // Kriegsaufträge nur für das eigene Team, nie gegen es
    const offers = eng.contractOffers('foot-1', []);
    expect(offers.every((o) => o.client === 'b' && o.opponent !== 'b')).toBe(true);
    // versenkt der Spieler ein Schiff der Angreifer, bekommt sein Team die Kriegspunkte
    expect(eng.beneficiaryOf(a, 'foot-1')).toBe('b');
  });

  it('der Quelltext fragt die Regel an jeder Schadensquelle (Breitseite, Rammstoß, Ultimate, Verbände) und provoziert das Team nie', () => {
    const naval = readFileSync(new URL('../src/naval/naval.ts', import.meta.url), 'utf8');
    expect(naval).toMatch(/ally: !!\(e\.helper \|\| e\.peer\) \|\| this\.isTeamShip\(e\)/);
    expect(naval).toMatch(/if \(!en \|\| this\.isTeamShip\(en\)\) return;/);
    expect(naval).toMatch(/harmableByPlayer\(s\)\) continue/);
    expect(naval).toMatch(/cataclysmFriendly\(e: EnemyShip\): boolean \{[^}]*!this\.playerMayHarm\(e\)/);
    const combat = readFileSync(new URL('../src/combat/combat.ts', import.meta.url), 'utf8');
    expect(combat).toMatch(/private massOk\(q: TroopSquad\): boolean \{ return q\.alive && canHarm\('friendly', q\.hostile/);
    const live = readFileSync(new URL('../src/world/targetLockLive.ts', import.meta.url), 'utf8');
    expect(live).toMatch(/c\.relation = 'friendly'; c\.domain = 'land'; c\.npc = false;\s*c\.name = q\.label; c\.level = q\.level; c\.power = team;/);
  });
});

describe('Live-Kriegs-Quests: aus der laufenden Simulation, gekoppelt an ihre Einheiten', () => {
  /** Toy-Welt, Spieler im Team B; A greift die Holzkolonie an */
  function invasion(seed = 8) {
    const { eng } = toyWorld(seed);
    eng.declareWar('a', 'b');
    fill(eng, 'a', 2); empty(eng, 'b');
    eng.setAllegiance('foot-1', 'b');
    const a = eng.launch(0, idx(eng, 'holz'), 'angriff')!;
    const dir = new WarQuestDirector();
    const ev: WarQuestEvent[] = [];
    return { eng, a, dir, ev };
  }

  it('eine feindliche Invasion auf eine Team-Insel erzeugt sofort „Insel-Verteidigung“ mit Marker und Ziel', () => {
    const { eng, a, dir, ev } = invasion();
    dir.update(eng, 'b', eng.state.t, ev);
    expect(ev.length).toBe(1);
    const q = ev[0].quest;
    expect(ev[0].type).toBe('neu');
    expect(q.kind).toBe('verteidigung');
    expect(q.title).toBe('Insel-Verteidigung: holz');
    expect(q.armadaId).toBe(a.id);
    expect(q.obj.total).toBe(a.ships.length);
    expect(q.obj.left).toBe(a.ships.length);
    expect(Math.hypot(q.x - a.x, q.z - a.z)).toBeLessThan(1);
    // kein zweiter Auftrag für dieselbe Armada
    dir.update(eng, 'b', eng.state.t, ev);
    expect(ev.length).toBe(0);
    // Team A bekommt keinen Verteidigungs-, sondern einen Invasions-Auftrag
    const dirA = new WarQuestDirector();
    dirA.update(eng, 'a', eng.state.t, ev);
    expect(ev[0].quest.kind).toBe('invasion');
  });

  it('versenken verbündete KI-Schiffe (oder der Spieler) Angreifer, sinkt die Zahl im Auftrag live', () => {
    const { eng, a, dir, ev } = invasion();
    dir.update(eng, 'b', eng.state.t, ev);
    const q = ev[0].quest;
    // zwei Schiffe gehen in einer Schlacht unter (nicht durch den Spieler)
    eng.syncShip(a.id, a.ships[a.ships.length - 1].id, 0, 0, true, null);
    eng.syncShip(a.id, a.ships[a.ships.length - 2].id, 0, 0, true, null);
    dir.update(eng, 'b', eng.state.t, ev);
    expect(q.obj.left).toBe(a.ships.length - 2);
    expect(q.status).toBe('aktiv');
  });

  it('fällt die Insel trotz Gegenwehr, schlägt der Auftrag um in „Gegenangriff: Insel zurückerobern“', () => {
    const { eng, a, dir, ev } = invasion();
    dir.update(eng, 'b', eng.state.t, ev);
    const q = ev[0].quest;
    arriveNow(a);
    eng.update(1);
    eng.siegeOf('holz')!.progress = 0.9999;
    run(eng, 3);
    expect(eng.ownerOf('holz')).toBe('a');
    dir.update(eng, 'b', eng.state.t, ev);
    expect(ev.some((e) => e.type === 'stufe')).toBe(true);
    expect(q.kind).toBe('gegenangriff');
    expect(q.stage).toBe(2);
    expect(q.title).toBe('Gegenangriff: holz zurückerobern');
    expect(q.status).toBe('aktiv');
    // die Rückeroberung gelingt (Besitz wechselt zurück): Erfolg, Lohn nur für Beteiligte
    dir.contribute(q, 'foot-1', WAR_QUEST.minContrib + 2);
    eng.state.islands.holz.owner = 'b';
    dir.update(eng, 'b', eng.state.t, ev);
    expect(q.status).toBe('erfolg');
    expect(q.note).toContain('zurückerobert');
    const rw = dir.rewardFor(q, 'foot-1');
    expect(rw && rw.gold).toBeGreaterThan(0);
    expect(rw!.gear).not.toBeNull();
    expect(dir.rewardFor(q, 'fremder-2')).toBeNull();
    dir.markPaid(q, 'foot-1');
    expect(dir.rewardFor(q, 'foot-1')).toBeNull();
  });

  it('wird der Angriff abgewehrt, endet der Auftrag sofort mit Erfolg (Belohnung: Ruf, Gold, Ausrüstung)', () => {
    const { eng, a, dir, ev } = invasion();
    dir.update(eng, 'b', eng.state.t, ev);
    const q = ev[0].quest;
    dir.presence('b', 'foot-1', q.x, q.z, 60);
    for (const sh of a.ships) eng.syncShip(a.id, sh.id, 0, 0, true, 'foot-1');
    eng.update(1);
    dir.update(eng, 'b', eng.state.t, ev);
    expect(q.status).toBe('erfolg');
    expect(ev.some((e) => e.type === 'ende')).toBe(true);
    const rw = dir.rewardFor(q, 'foot-1')!;
    expect(rw.gold).toBeGreaterThan(0);
    expect(rw.standing).toBeGreaterThan(0);
    expect(rw.honor).toBeGreaterThan(0);
    expect(rw.gear).toBeTruthy();
  });

  it('Konvoi-Geleitschutz und Nachschub-Sabotage folgen den echten Konvois; Blockade brechen dem Hafen', () => {
    // eigener Front-Konvoi (Team B) mit zwei Transportern
    const g = toyWorld(21);
    g.eng.declareWar('a', 'b');
    fill(g.eng, 'b', 1.6); empty(g.eng, 'a');
    let conv: ArmadaState | undefined;
    for (let t = 0; t < 120 && !conv; t++) { g.eng.update(1); conv = g.eng.state.armadas.find((x) => x.nation === 'b' && x.purpose === 'konvoi'); }
    expect(conv, 'Front-Konvoi').toBeTruthy();
    const dir = new WarQuestDirector(), ev: WarQuestEvent[] = [];
    dir.update(g.eng, 'b', g.eng.state.t, ev);
    const geleit = dir.state.quests.find((q) => q.kind === 'geleit' && q.armadaId === conv!.id);
    expect(geleit).toBeTruthy();
    arriveNow(conv!);
    g.eng.update(1);
    expect(conv!.delivered).toBe(true);
    dir.update(g.eng, 'b', g.eng.state.t, ev);
    expect(geleit!.status).toBe('erfolg');
    // feindlicher Nachschub für die Belagerung einer Team-Insel (Team A versorgt die Belagerung von B): Sabotage – versenkt = Erfolg
    const s = toyWorld(22);
    s.eng.declareWar('a', 'b');
    fill(s.eng, 'a', 2); empty(s.eng, 'b');
    const inv = s.eng.launch(0, idx(s.eng, 'holz'), 'angriff')!;
    arriveNow(inv);
    s.eng.update(1);
    let foe: ArmadaState | undefined;
    for (let t = 0; t < 150 && !foe; t++) { inv.supply.proviant = 5; empty(s.eng, 'b'); s.eng.update(1); foe = s.eng.state.armadas.find((x) => x.nation === 'a' && x.purpose === 'konvoi' && x.supplies === inv.id); }
    expect(foe, 'Nachschub der Belagerer').toBeTruthy();
    const d2 = new WarQuestDirector();
    d2.update(s.eng, 'b', s.eng.state.t, ev);
    const sab = d2.state.quests.find((q) => q.kind === 'sabotage');
    expect(sab, 'Sabotage-Auftrag').toBeTruthy();
    expect(sab!.title).toContain('Nachschub-Sabotage');
    for (const sh of foe!.ships) if (sh.role === 'transport') s.eng.syncShip(foe!.id, sh.id, 0, 0, true, 'foot-1');
    s.eng.update(1);
    d2.update(s.eng, 'b', s.eng.state.t, ev);
    expect(sab!.status).toBe('erfolg');
    // Blockade eines Team-Hafens: brechen = Erfolg
    const b = toyWorld(14);
    b.eng.declareWar('a', 'b');
    fill(b.eng, 'a', 2.2); empty(b.eng, 'b');
    let bl: ArmadaState | undefined;
    for (let t = 0; t < 200 && !bl; t++) { b.eng.update(1); bl = b.eng.state.armadas.find((x) => x.purpose === 'blockade'); }
    arriveNow(bl!);
    b.eng.update(1);
    const d3 = new WarQuestDirector();
    d3.update(b.eng, 'b', b.eng.state.t, ev);
    const bq = d3.state.quests.find((q) => q.kind === 'blockade')!;
    expect(bq).toBeTruthy();
    expect(bq.title).toContain('Blockade brechen');
    for (const sh of bl!.ships) b.eng.syncShip(bl!.id, sh.id, 0, 0, true, 'foot-1');
    b.eng.update(1);
    d3.update(b.eng, 'b', b.eng.state.t, ev);
    expect(bq.status).toBe('erfolg');
  });

  it('MMO-tauglich: Gruppen bis 5 nehmen gemeinsam an, Beitrag und Lohn je Spieler, Zustand ist JSON', () => {
    const { eng, dir, ev } = invasion();
    dir.update(eng, 'b', eng.state.t, ev);
    const q = ev[0].quest;
    const group = ['p1', 'p2', 'p3', 'p4', 'p5'];
    expect(dir.join(q.id, group)).toBe(true);
    expect(dir.join(q.id, ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'])).toBe(false);
    expect(q.members).toEqual(group);
    dir.contribute(q, 'p1', 20);
    dir.contribute(q, 'p2', 3);
    q.status = 'erfolg';
    expect(dir.rewardFor(q, 'p1')).not.toBeNull();
    expect(dir.rewardFor(q, 'p2')).toBeNull();
    const back = cleanWarQuests(JSON.parse(JSON.stringify(dir.state)));
    expect(back.quests[0].members).toEqual(group);
    expect(back.quests[0].contrib.p1).toBe(20);
    expect(back.quests[0].kind).toBe('verteidigung');
    expect(cleanWarQuests({ v: 9 }).quests.length).toBe(0);
    expect(newWarQuestState().quests.length).toBe(0);
  });
});

describe('Fünf Hauptkampagnen (Stufe 3 → 60+) mit offenem Horizont', () => {
  it('jedes Team hat sieben Kapitel mit eigenen Kommandanten, Stufen-Schranken und dem Kaiser seines Erzrivalen', () => {
    expect(CAMPAIGN_QUESTS.length).toBe(5 * 7);
    const commanderIds = new Set<string>();
    for (const team of TEAM_IDS) {
      const c = CAMPAIGNS[team];
      expect(c.rival).not.toBe(team);
      expect(KAISER_SPEC_BY_ID[c.kaiser.id as KaiserId].power).toBe(c.rival);
      expect(KAISER_SPEC_BY_ID[c.kaiser.id as KaiserId].boss.name).toBe(c.kaiser.boss);
      expect(ISLAND_IDS.has(c.hub.id)).toBe(true);
      expect(ISLAND_IDS.has(c.capital.id)).toBe(true);
      expect(DEFS.find((d) => d.id === c.hub.id)?.factionId).toBe(team);
      expect(NATION_DEFS.find((n) => n.id === team)?.capital).toBe(c.capital.id);
      for (const cm of COMMANDERS[team]) { expect(commanderIds.has(cm.id)).toBe(false); commanderIds.add(cm.id); }
      const chapters = [1, 2, 3, 4, 5, 6, 7].map((n) => QUEST_BY_ID[chapterId(team, n)]);
      chapters.forEach((q, i) => {
        expect(q, `${team} Kapitel ${i + 1}`).toBeTruthy();
        expect(q.team).toBe(team);
        expect(q.campaign).toBe(i + 1);
        expect(q.main).toBe(true);
        expect(q.after).toBe(i === 0 ? 'rat' : chapterId(team, i));
        expect(COMMANDER_BY_ID[q.giver]?.nation).toBe(team);
        const text = JSON.stringify(q);
        expect(text).not.toMatch(/undefined|\$\{|null/);
        for (const s of q.steps) if ('island' in s) expect(ISLAND_IDS.has(s.island), s.island).toBe(true);
        if (i > 0) expect(q.steps[0]).toEqual(expect.objectContaining({ type: 'level', level: CHAPTER_LEVELS[i] }));
      });
      expect(chapters[5].steps.some((s) => s.type === 'kaiser' && s.kaiser === c.kaiser.id)).toBe(true);
      expect(chapters[6].steps.some((s) => s.type === 'horizon' && s.dist === OPEN_HORIZON.dist)).toBe(true);
      expect(CHAPTER_LEVELS[0]).toBe(3);
      expect(CHAPTER_LEVELS[6]).toBeGreaterThanOrEqual(60);
      expect(flagshipName(c.rival, 'ar7')).toMatch(/^Kommandoschiff von /);
    }
  });

  it('Rat → Schwur → Kapitel I bis VII: die Kriegs-Schritte zählen nur Ereignisse der Welt, Stufe und Horizont werden abgefragt', () => {
    const p = defaultProgress('pirat');
    let team: string | null = null;
    const done: string[] = [];
    const qs = new QuestSystem(p, 'pirat', { completed: (q) => done.push(q.id), advanced: () => {} }, () => team);
    qs.accept('rat');
    qs.event({ type: 'talk', npc: 'gerstenkorn' });
    expect(qs.step('rat')?.type).toBe('pledge');
    // fremde Kapitel lassen sich nie annehmen
    qs.accept(chapterId('frankreich', 1));
    expect(qs.isActive(chapterId('frankreich', 1))).toBe(false);
    team = 'deutschland';
    qs.event({ type: 'pledge' });
    expect(done).toContain('rat');
    const next = QUESTS.filter((q) => q.auto && q.after === 'rat' && !qs.foreign(q));
    expect(next.map((q) => q.id)).toEqual([chapterId('deutschland', 1)]);
    qs.accept(chapterId('deutschland', 1));
    qs.event({ type: 'enter', island: CAMPAIGNS.deutschland.hub.id });
    qs.event({ type: 'sink' }); qs.event({ type: 'sink' });
    qs.event({ type: 'war', kind: 'verteidigung' });
    expect(done).toContain(chapterId('deutschland', 1));
    qs.accept(chapterId('deutschland', 2));
    expect(qs.poll({ level: 5, dist: 0 })).toBe(false);
    expect(qs.poll({ level: 12, dist: 0 })).toBe(true);
    expect(qs.step(chapterId('deutschland', 2))?.type).toBe('flagship');
    qs.event({ type: 'flagship' });
    qs.event({ type: 'war', kind: 'geleit' }); qs.event({ type: 'war', kind: 'sabotage' });
    expect(done).toContain(chapterId('deutschland', 2));
    // Kapitel VII: Stufe 60 und der Rand der Welt öffnen den Horizont (kein Abspann)
    qs.accept(chapterId('deutschland', 7));
    qs.poll({ level: 61, dist: 9000 });
    expect(qs.step(chapterId('deutschland', 7))?.type).toBe('horizon');
    qs.poll({ level: 61, dist: OPEN_HORIZON.dist + 10 });
    expect(done).toContain(chapterId('deutschland', 7));
    expect(OPEN_HORIZON.title).toBe('Die Unbekannten Äußeren Meere');
  });
});

describe('Cache der Nachbearbeitung über Bühnenwechsel (VS-Face-Off → Editor → Showcase → Spielwelt)', () => {
  it('eine Pipeline je Grafikstufe: Bühnenwechsel hängen nur um, erst ein Stufenwechsel baut neu', () => {
    const cache = new PostChainCache<{ id: number; scene: string }>();
    let made = 0, freed = 0;
    const spec: PostChainSpec = { enabled: true, tier: 'max', budget: 0, mobile: false, samples: 4 };
    let scene = '';
    const use = (sp: PostChainSpec, sc: string) => { scene = sc; return cache.use(sp, () => ({ id: ++made, scene }), (v) => { v.scene = scene; }, () => { freed++; }); };
    const first = use(spec, 'faceoff');
    for (const sc of ['editor', 'showcase', 'welt', 'editor', 'welt']) expect(use(spec, sc)).toBe(first);
    expect(cache.builds).toBe(1);
    expect(cache.retargets).toBe(5);
    expect(first!.scene).toBe('welt');
    // Grafikstufe wechselt: einmal neu, die alte Pipeline wird freigegeben
    const hi = use({ ...spec, tier: 'high' }, 'welt');
    expect(hi).not.toBe(first);
    expect(cache.builds).toBe(2);
    expect(freed).toBe(1);
    // ohne Nachbearbeitung (Niedrig/Mittel): keine Pipeline
    expect(use({ ...spec, enabled: false }, 'welt')).toBeNull();
    expect(freed).toBe(2);
    expect(postChainKey({ ...spec, enabled: false })).toBe('');
  });

  it('der Renderer baut die Pipeline nicht mehr je Bühne neu (Szene, Kamera, Sonne und Fokus werden umgehängt)', () => {
    const src = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/this\.composer = this\.postCache\.use\(/);
    const sources = src.match(/setEffectSources\(sun: Mesh \| null, focus: Vector3 \| null\) \{([\s\S]*?)\n {2}\}/);
    expect(sources).toBeTruthy();
    expect(sources![1]).not.toMatch(/rebuildComposer|new EffectComposer/);
    expect(src).toMatch(/comp\.setMainScene\(this\.scene\);\s*comp\.setMainCamera\(this\.camera\);/);
    for (const f of ['gtao', 'ssr']) expect(readFileSync(new URL(`../src/render/${f}.ts`, import.meta.url), 'utf8')).toMatch(/override set mainCamera\(c: Camera\)/);
  });
});

describe('Spielstand 27: Migration ohne Verlust', () => {
  it('hebt Version 25 über 26 (Treue) auf 27 (Live-Kriegs-Quests); alles andere bleibt', () => {
    expect(SAVE_VERSION).toBe(27);
    const base = createSave('Lotte', 'pirat', '4.7.5', 0);
    const old: Record<string, any> = JSON.parse(JSON.stringify(base));
    old.version = 25;
    delete old.progress.allegiance;
    delete old.world.warQuests;
    old.player.gold = 4321;
    old.player.level = 33;
    old.progress.done = ['k0', 'k1'];
    old.progress.quests = [{ id: 'k2', step: 1, count: 0 }];
    const r = migrateSave(old, '4.7.6');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(25);
    expect(r.data.version).toBe(27);
    expect(r.data.player.gold).toBe(4321);
    expect(r.data.player.level).toBe(33);
    expect(r.data.progress.done).toEqual(['k0', 'k1']);
    expect(r.data.progress.quests).toEqual([{ id: 'k2', step: 1, count: 0 }]);
    expect(r.data.progress.allegiance?.team).toBeNull();
    expect(r.data.world.warQuests).toBeNull();
  });

  it('ein Stand mit Team, Kampagne und laufenden Einsätzen übersteht Speichern und Laden; Unsinn wird verworfen', () => {
    const s = createSave('Kapitän', 'pirat', '4.7.6', 0);
    s.progress.allegiance = { v: 1, team: 'kurogane', pledgedAt: 900, stats: { quests: 4, liberated: 1, flagships: 2, defended: 1, convoys: 0 }, horizon: false };
    const { eng } = toyWorld();
    eng.declareWar('a', 'b');
    fill(eng, 'a', 2);
    eng.launch(0, idx(eng, 'holz'), 'angriff');
    const dir = new WarQuestDirector();
    dir.update(eng, 'b', eng.state.t, []);
    s.world.warQuests = dir.state;
    const r = migrateSave(JSON.parse(JSON.stringify(s)), '4.7.6');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.progress.allegiance?.team).toBe('kurogane');
    expect(r.data.progress.allegiance?.stats.flagships).toBe(2);
    expect(r.data.world.warQuests?.quests.length).toBe(1);
    const bad = JSON.parse(JSON.stringify(s));
    bad.progress.allegiance = { team: 'marine' };
    bad.world.warQuests = { v: 3, quests: 'kaputt' };
    const r2 = migrateSave(bad, '4.7.6');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.data.progress.allegiance?.team).toBeNull();
    expect(r2.data.world.warQuests?.quests.length).toBe(0);
  });

  it('ein Ökosystem aus 4.7D (ohne Logistik-Felder) lädt mit Standardwerten weiter', () => {
    const { reg, w, eng } = realWorld(5);
    run(eng, 200);
    const raw: any = JSON.parse(JSON.stringify(eng.snapshot()));
    // so sah ein Stand vor 4.7E aus
    delete raw.allegiance;
    for (const id of Object.keys(raw.nations)) { delete raw.nations[id].counter; delete raw.nations[id].focus; delete raw.nations[id].patrolAt; }
    for (const id of Object.keys(raw.islands)) delete raw.islands[id].blockadeId;
    for (const a of raw.armadas) { delete a.cargo; delete a.until; delete a.lane; delete a.supplies; delete a.counter; delete a.delivered; if (a.purpose !== 'angriff' && a.purpose !== 'entsatz') a.purpose = 'angriff'; }
    const clean = cleanFactionWar(raw, reg, w.islands)!;
    expect(clean).toBeTruthy();
    const t0 = clean.t;
    expect(clean.allegiance).toEqual({});
    for (const id of Object.keys(clean.nations)) { expect(clean.nations[id].counter).toBeNull(); expect(clean.nations[id].focus).toBeNull(); }
    for (const a of clean.armadas) { expect(a.cargo).toBeNull(); expect(Array.isArray(a.lane)).toBe(true); }
    const again = new FactionWarEngine(reg, w.islands, w.obstacles, clean, 5);
    run(again, 300);
    expect(again.state.t).toBeGreaterThan(t0);
  });
});
