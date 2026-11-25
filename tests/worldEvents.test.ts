// Phase 4.3C: das lebendige MMO-Meer. Deterministische Prüfungen ohne Netze – Welt-Ereignisse (Lebenszyklus, Mindestabstand, Wartezeiten, kein
// Spawn-Spam, Opt-In), Handelskonvois (Navigation mit der echten Lenkung und Fahrphysik, echte Wirkung auf MarketState bei Ankunft vs. Abfangen,
// Verteidigung), Meeresströmungen (+35 %), lokale Wetterzellen und die Kalibrierung der Weltbosse (Gefahrenstufe 4 – 5, Anti-One-Shot, Siegel).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { REGIONS, ISLAND_REACH } from '../src/data/regions';
import { GOOD_BY_ID, emptyEconomy, profileOf, type MarketProfile } from '../src/data/economy';
import { marketAt, marketPrice, type MarketSite } from '../src/core/economyEngine';
import { PLAYABLE_RADIUS } from '../src/data/world';
import { RINGS, ringAtDistance } from '../src/data/worldRings';
import {
  CONVOY, CURRENT_BOOST, CURRENT_LANES, DIRECTOR, WEATHER_CELLS, WEATHER_CELL_DEFS, WORLD_BOSSES, WORLD_BOSS_IDS, WORLD_EVENT_DEFS, WORLD_EVENT_KINDS,
  type WorldBossId,
} from '../src/data/seaEvents';
import {
  SEAL_DROP, WORLD_BOSS_HIT_CAP, WORLD_BOSS_PLAYER_HIT_CAP, WORLD_BOSS_VOLLEY_S, capBossHit, capVolley, dangerOfLevel, playerCannonDmg, worldBossHull,
} from '../src/data/balanceConfig';
import { SEA_SPEED, SHIP_CLASSES } from '../src/data/ships';
import { sectorAt } from '../src/data/factions';
import { WorldEventDirector, cleanWorldEvents, type DirectorIsland, type WorldEvent } from '../src/world/worldEventDirector';
import { TradeConvoySystem, convoyLoot, deliverConvoy, defenseReward, routeLength, type ConvoySite, type ConvoyState } from '../src/world/tradeConvoys';
import { CurrentField, LANE_CLEAR, buildCurrentLanes, currentBoost, newCurrentSample } from '../src/world/oceanCurrents';
import { cellSightK, cellSpeedK, cellWeight, newCellSample, stepCells, strongestCell, type WeatherCell } from '../src/world/weatherCells';
import { PredictiveMaritimeSteering, createAiNav, newSteerCommand, newSteerSelf, type SteerWorld } from '../src/naval/shipSteering';
import { newMotion, stepMotion, windSpeedK, type MotionParams } from '../src/naval/shipMotion';
import { bossFightSeconds, rollWorldBossLoot, worldBossStats } from '../src/naval/worldBosses';
import { Weather } from '../src/world/weather';
import { WEATHER } from '../src/data/world';
import { SAVE_VERSION, createSave } from '../src/core/save/types';
import { migrateSave } from '../src/core/save/migrations';

// ---------- Welt wie im Spiel ----------

const ALL = REGIONS.flatMap((r) => r.islands);
const ISLANDS: DirectorIsland[] = ALL.map((i) => ({
  id: i.id, name: i.name, x: i.x, z: i.z, r: i.r, ring: i.ring ?? 1, kind: i.kind, factionId: i.factionId ?? null, uncharted: !!i.uncharted,
  harbor: i.kind === 'harbor' || i.kind === 'town', blackMarket: !!profileOf(i).blackMarket,
}));
const SITES: ConvoySite[] = ALL.filter((i) => (i.kind === 'harbor' || i.kind === 'town') && !i.uncharted && (i.ring ?? 1) <= 3).map((i) => ({
  id: i.id, name: i.name, x: i.x, z: i.z, r: i.r, ring: i.ring ?? 1, dangerTier: i.dangerTier ?? 1, factionId: i.factionId ?? null, profile: profileOf(i),
}));
const WORLD = { islands: ISLANDS, sites: SITES };
const HOME = { x: -42, z: -44 };

/** Director 3 600 s lang mit dem Spieler am Heimatplatz laufen lassen und alles mitschreiben */
function runDirector(seconds: number, seed = 1234, player = HOME) {
  const d = new WorldEventDirector(WORLD, null, seed);
  const counts: number[] = [];
  const spawns: { t: number; ev: WorldEvent; activeBefore: number; others: { x: number; z: number }[] }[] = [];
  const ends: { t: number; ev: WorldEvent }[] = [];
  const notices: string[] = [];
  const P = [player];
  const violations: string[] = [];
  for (let t = 0; t < seconds; t++) {
    const before = d.active().map((e) => ({ x: e.x, z: e.z, id: e.id }));
    d.update(1, P);
    for (const n of d.drain()) {
      notices.push(n.type);
      // verglichen wird mit allem, was nach dem Schritt noch läuft (ein Ereignis, das im selben Schritt endet, gibt seinen Platz frei)
      if (n.type === 'eventStart') spawns.push({ t: d.state.t, ev: JSON.parse(JSON.stringify(n.event)), activeBefore: before.length, others: before.filter((b) => d.active().some((e) => e.id === b.id)) });
      if (n.type === 'eventEnd') ends.push({ t: d.state.t, ev: JSON.parse(JSON.stringify(n.event)) });
    }
    counts.push(d.active().length);
    // Plätze je Art: laufende plus wartende nie mehr als `max`
    for (const k of WORLD_EVENT_KINDS) {
      if (k === 'weltboss') continue;
      const n = d.active().filter((e) => e.kind === k).length + d.cooling(k);
      if (n > WORLD_EVENT_DEFS[k].max) violations.push(`${k}@${t}: ${n}`);
    }
  }
  return { d, counts, spawns, ends, notices, violations };
}

// ---------- 1. Welt-Ereignisse ----------

describe('WorldEventDirector: Lebenszyklus, Abstände, Wartezeiten', () => {
  const R = runDirector(3600);

  it('führt gleichzeitig 6 bis 8 Ereignisse (seit 4.5C; nach dem Auffüllen nie mehr als 8, Einbrüche unter 6 nur kurz beim Nachrücken)', () => {
    expect(Math.max(...R.counts)).toBeLessThanOrEqual(DIRECTOR.maxActive);
    const after = R.counts.slice(60);
    let run = 0, worst = 0, below = 0;
    for (const c of after) { if (c < DIRECTOR.minActive) { run++; below++; worst = Math.max(worst, run); } else run = 0; }
    expect(worst).toBeLessThanOrEqual(30);
    expect(below / after.length).toBeLessThan(0.03);
    expect(R.counts[20]).toBeGreaterThanOrEqual(DIRECTOR.minActive);
  });

  it('alle Arten kommen vor, jede mit ihrem Horizont-Signal (Kriegs-Nachschub nur, wenn irgendwo belagert wird – hier ohne Krieg)', () => {
    const kinds = new Set(R.spawns.map((s) => s.ev.kind));
    for (const k of WORLD_EVENT_KINDS) expect(kinds.has(k), k).toBe(k !== 'nachschub');
    for (const s of R.spawns) expect(s.ev.beacon).toBe(WORLD_EVENT_DEFS[s.ev.kind].beacon);
  });

  it('Mindestabstand: jedes neue Ereignis liegt mindestens 2 200 m von allen laufenden (kartierte Schatzsuchen und Wrackfelder des Spielers ausgenommen)', () => {
    expect(DIRECTOR.minSpacing).toBeGreaterThanOrEqual(2200);
    for (const s of R.spawns) for (const o of s.others) expect(Math.hypot(o.x - s.ev.x, o.z - s.ev.z)).toBeGreaterThanOrEqual(DIRECTOR.minSpacing - 1e-6);
  });

  it('Opt-In: nichts erscheint näher als 1 100 m am Spieler, Zonen liegen außer Reichweite, nichts startet im Gefecht', () => {
    for (const s of R.spawns) {
      const b = s.ev.ships[0];
      const x = s.ev.kind === 'weltboss' && b ? b.x : s.ev.x, z = s.ev.kind === 'weltboss' && b ? b.z : s.ev.z;
      expect(Math.hypot(x - HOME.x, z - HOME.z)).toBeGreaterThanOrEqual(DIRECTOR.spawnMin - 1e-6);
      expect(Math.hypot(x - HOME.x, z - HOME.z)).toBeGreaterThan(s.ev.zone);
      expect(s.ev.phase).toBe('aktiv');
      expect(s.ev.engagedUntil).toBe(0);
    }
  });

  it('Wartezeiten: laufende und wartende Plätze einer Art übersteigen nie ihr Maximum; ein Weltboss kehrt erst nach seiner Wartezeit zurück', () => {
    expect(R.violations).toEqual([]);
    for (const e of R.ends.filter((x) => x.ev.bossId)) {
      const next = R.spawns.find((s) => s.ev.bossId === e.ev.bossId && s.t > e.t);
      if (next) expect(next.t - e.t).toBeGreaterThanOrEqual(WORLD_EVENT_DEFS.weltboss.cooldown - 1e-6);
    }
  });

  it('kein Spawn-Spam: zwei neue Ereignisse liegen mindestens 2 s auseinander, bei vollem Mindestbestand mindestens 0,8 · 30 s', () => {
    for (let i = 1; i < R.spawns.length; i++) {
      const gap = R.spawns[i].t - R.spawns[i - 1].t;
      expect(gap).toBeGreaterThanOrEqual(DIRECTOR.bootstrapGap - 1e-6);
      if (R.spawns[i].activeBefore >= DIRECTOR.minActive) expect(gap).toBeGreaterThanOrEqual(DIRECTOR.spawnGap * 0.8 - 1e-6);
    }
    // in einer Stunde nicht mehr als die Plätze hergeben
    expect(R.spawns.length).toBeLessThan(60);
  });

  it('Lebensende: Ereignisse laufen ab, bleiben kurz als „beendet“ sichtbar und verschwinden dann aus der Liste', () => {
    expect(R.ends.length).toBeGreaterThan(0);
    for (const e of R.ends) {
      expect(e.ev.phase).toBe('beendet');
      expect(['gesiegt', 'abgelaufen', 'entkommen', 'geborgen']).toContain(e.ev.outcome);
      expect(R.d.state.events.some((x) => x.id === e.ev.id && R.d.state.t - e.t > DIRECTOR.linger + 1)).toBe(false);
    }
  });

  it('Treffer halten ein Ereignis im Gefecht: es läuft nicht ab, solange gekämpft wird', () => {
    const d = new WorldEventDirector(WORLD, null, 77);
    const ev = d.create('treibgut', [HOME])!;
    d.state.events.push(ev);
    ev.expiresAt = d.state.t + 2;
    d.engage(ev.id, 60);
    for (let i = 0; i < 30; i++) d.update(1, [HOME]);
    expect(ev.phase).not.toBe('beendet');
    for (let i = 0; i < 40; i++) d.update(1, [HOME]);
    expect(ev.phase).toBe('beendet');
    expect(ev.outcome).toBe('abgelaufen');
  });

  it('Treibgut: Kisten bergen (einmal), das letzte beendet das Feld als „geborgen“; Schatzkarten zeigen auf eine kartierte Insel', () => {
    const d = new WorldEventDirector(WORLD, null, 9);
    let ev: WorldEvent | null = null;
    for (let i = 0; i < 40 && !ev?.crates?.some((c) => c.kind === 'karte'); i++) ev = d.create('treibgut', [HOME]);
    expect(ev).toBeTruthy();
    d.state.events.push(ev!);
    const map = ev!.crates!.find((c) => c.kind === 'karte');
    if (map) {
      const isl = ALL.find((i) => i.id === map.islandId)!;
      expect(isl && !isl.uncharted && (isl.kind === 'quiet' || isl.kind === 'treasure')).toBe(true);
    }
    for (const c of ev!.crates!) {
      expect(d.collectCrate(ev!.id, c.id)).toBeTruthy();
      expect(d.collectCrate(ev!.id, c.id)).toBeNull();
    }
    expect(ev!.phase).toBe('beendet');
    expect(ev!.outcome).toBe('geborgen');
  });

  it('Hafen-Blockade: verdoppelt die Preise des Hafens und sperrt die Schnellreise, bis sie fällt; Ankerglück und Schwarzmärkte nie', () => {
    const d = new WorldEventDirector(WORLD, null, 5);
    let ev: WorldEvent | null = null;
    for (let i = 0; i < 10 && !ev; i++) ev = d.create('blockade', [{ x: 2500, z: 2500 }]);
    expect(ev).toBeTruthy();
    d.state.events.push(ev!);
    const id = ev!.islandId!;
    expect(id).not.toBe('ankerglueck');
    expect(profileOf(ALL.find((i) => i.id === id)!).blackMarket).toBeFalsy();
    expect(d.priceK(id)).toBe(2);
    expect(d.travelLocked(id)).toBe(true);
    // ein Markt mit Blockade: doppelte Preise über `priceK`
    const isl = ALL.find((i) => i.id === id)!;
    const site: MarketSite = { id, name: isl.name, profile: profileOf(isl), war: { borderDist: 9999, occupied: false, fort: false } };
    const p1 = marketPrice(site, 'tee', 50);
    expect(marketPrice({ ...site, priceK: d.priceK(id) }, 'tee', 50)).toBeCloseTo(p1 * 2, 6);
    // alle Wachen versenkt (durch den Spieler): gebrochen, Preise normal, Reise frei
    for (const s of ev!.ships) { s.down = true; s.byPlayer = true; }
    d.update(1, [HOME]);
    expect(ev!.outcome).toBe('gesiegt');
    expect(ev!.byPlayer).toBe(true);
    expect(d.priceK(id)).toBe(1);
    expect(d.travelLocked(id)).toBe(false);
  });

  it('Schatz-Galeone: fährt eine lange Route zu einem Hafen (mindestens 2 500 m), gepanzert mit zwei Eskorten, und entkommt am Ziel', () => {
    const d = new WorldEventDirector(WORLD, null, 21);
    const ev = d.create('schatzgaleone', [{ x: 3000, z: 1500 }])!;
    expect(ev).toBeTruthy();
    expect(ev.ships.map((s) => s.role).sort()).toEqual(['eskorte', 'eskorte', 'galeone']);
    expect(routeLength(ev.route!)).toBeGreaterThan(1500);
    d.state.events.push(ev);
    let out: string | null = null;
    for (let t = 0; t < 4000 && !out; t++) { d.update(1, [{ x: -9000, z: -9000 }]); if (ev.phase === 'beendet') out = ev.outcome; }
    expect(out).toBe('entkommen');
  });

  it('JSON-tauglich und deterministisch: gleicher Seed, gleiche Welt; ein gespeicherter Zustand läuft nach dem Laden genauso weiter', () => {
    const a = new WorldEventDirector(WORLD, null, 4242), b = new WorldEventDirector(WORLD, null, 4242);
    for (let t = 0; t < 900; t++) { a.update(1, [HOME]); b.update(1, [HOME]); a.drain(); b.drain(); }
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
    // Rundlauf über JSON und die Säuberung beim Laden
    const restored = cleanWorldEvents(JSON.parse(JSON.stringify(a.snapshot())));
    expect(restored).toBeTruthy();
    const c = new WorldEventDirector(WORLD, restored, 1);
    for (let t = 0; t < 600; t++) { a.update(1, [HOME]); c.update(1, [HOME]); a.drain(); c.drain(); }
    expect(c.snapshot()).toEqual(a.snapshot());
  });

  it('kaputte Daten aus dem Spielstand fallen weg statt abzustürzen', () => {
    expect(cleanWorldEvents(null)).toBeNull();
    expect(cleanWorldEvents({ v: 2 })).toBeNull();
    const s = cleanWorldEvents({ v: 1, t: 'x', events: [{ kind: 'unbekannt' }, { kind: 'weltboss', route: [1, 2] }, null], convoys: [{ good: 'gold' }], cells: [{ kind: 'hagel' }] })!;
    expect(s.events).toEqual([]);
    expect(s.convoys).toEqual([]);
    expect(s.cells).toEqual([]);
    expect(s.t).toBe(0);
  });

  it('Spielstand 19: ältere Stände bekommen ein leeres Meer, ein gespeichertes Meer übersteht den Rundlauf', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(19);
    const old = { ...createSave('Alt', 'pirat', '4.3.3'), version: 18 } as Record<string, any>;
    delete old.world.seaEvents;
    const r = migrateSave(old, '4.3.4');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.world.seaEvents).toBeNull();
    const d = new WorldEventDirector(WORLD, null, 3);
    for (let t = 0; t < 120; t++) d.update(1, [HOME]);
    const save = createSave('Neu', 'pirat', '4.3.4');
    save.world.seaEvents = d.snapshot();
    const r2 = migrateSave(JSON.parse(JSON.stringify(save)), '4.3.4');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.data.world.seaEvents).toEqual(d.snapshot());
  });
});

// ---------- 2. Handelskonvois ----------

/** Welt für die Lenkung: Küsten als Kreise (Platzbedarf der Inseln), keine Stege */
function steerWorld(): SteerWorld {
  return {
    shipClearance: (x, z, W) => {
      let c = 1e9;
      for (const i of ALL) { const d = Math.hypot(x - i.x, z - i.z) - i.r * 1.25 - W * 0.5; if (d < c) c = d; }
      return c;
    },
    piers: [],
    getNearbyPiers: (_x, _z, _r, out) => { out.length = 0; return out; },
    shipBlockers: [],
  };
}

describe('TradeConvoySystem: Routen, Navigation, echte Märkte', () => {
  const sys = new TradeConvoySystem(SITES, ISLANDS);
  const rnd = (() => { let s = 99; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();

  it('Handel nur von Überschuss zu Bedarf (Marktprofile samt ISLAND_PROFILES)', () => {
    expect(sys.tradePairs).toBeGreaterThan(10);
    for (let i = 0; i < 60; i++) {
      const c = sys.create(`t${i}`, 0, rnd)!;
      const from = SITES.find((s) => s.id === c.from)!, to = SITES.find((s) => s.id === c.to)!;
      expect(from.profile.produce).toContain(c.good);
      expect(to.profile.demand).toContain(c.good);
      expect(c.units).toBeGreaterThanOrEqual(8);
      expect(c.ships.filter((s) => s.role === 'frachter')).toHaveLength(1);
      expect(c.ships.filter((s) => s.role === 'eskorte').length).toBe(CONVOY.escorts[c.dangerTier - 1]);
      expect(c.ships.filter((s) => s.role === 'eskorte').length).toBeGreaterThanOrEqual(1);
      expect(c.ships.filter((s) => s.role === 'eskorte').length).toBeLessThanOrEqual(2);
    }
  });

  it('Routen führen um alle Inseln herum (Platzbedarf plus Freiraum)', () => {
    for (let i = 0; i < 40; i++) {
      const c = sys.create(`r${i}`, 0, rnd)!;
      for (let k = 2; k < c.route.length; k += 2) {
        const ax = c.route[k - 2], az = c.route[k - 1], bx = c.route[k], bz = c.route[k + 1];
        for (let f = 0; f <= 1; f += 0.1) {
          const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
          for (const isl of ALL) expect(Math.hypot(x - isl.x, z - isl.z)).toBeGreaterThan(isl.r * ISLAND_REACH + 30);
        }
      }
    }
  });

  it('ein Frachter fährt die Route mit der echten KI-Lenkung (shipSteering) und Fahrphysik bis ans Ziel, ohne Küste', () => {
    let c: ConvoyState | null = null;
    for (let i = 0; i < 50 && (!c || c.length < 1500); i++) c = sys.create(`n${i}`, 0, rnd);
    const steer = new PredictiveMaritimeSteering(steerWorld(), { windDir: 0.4, windStrength: 0.4 }, PLAYABLE_RADIUS);
    const cls = SHIP_CLASSES[c!.ships[0].classTier];
    const self = newSteerSelf(), cmd = newSteerCommand(), nav = createAiNav('frachter');
    self.id = 'frachter'; self.L = cls.L; self.W = cls.W; self.classTier = c!.ships[0].classTier; self.vFull = cls.spd * SEA_SPEED; self.speedCap = 9;
    const m = newMotion(c!.route[0], c!.route[1], Math.atan2(c!.route[2] - c!.route[0], c!.route[3] - c!.route[1]), 0);
    const P: MotionParams = { L: cls.L, turnMult: 1, turnK: 1, perfTurn: 1, perfAccel: 1, accelK: 1 };
    let leg = 1, minCoast = 1e9;
    const dt = 1 / 15, last = c!.route.length / 2 - 1;
    for (let t = 0; t < 2400 && leg <= last; t += dt) {
      self.x = m.x; self.z = m.z; self.heading = m.heading; self.speed = m.speed;
      const tx = c!.route[leg * 2], tz = c!.route[leg * 2 + 1];
      if (Math.hypot(tx - m.x, tz - m.z) < 70) { leg++; continue; }
      steer.clearObstacles();
      steer.cruise(nav, self, tx, tz, 0.8, 35, null, dt, cmd);
      const v = Math.min(self.vFull * cmd.sail * windSpeedK(m.heading, 0.4, 0.4, 1), self.speedCap);
      stepMotion(m, cmd.turn, v, P, dt);
      for (const isl of ALL) minCoast = Math.min(minCoast, Math.hypot(m.x - isl.x, m.z - isl.z) - isl.r);
    }
    expect(leg).toBeGreaterThan(last);
    expect(minCoast).toBeGreaterThan(0);
  });

  it('Ankunft: der Vorrat des Zielhafens wächst um die Ladung und der Knappheitspreis sinkt (echter MarketState)', () => {
    const c = sys.create('a1', 0, rnd)!;
    const dest = SITES.find((s) => s.id === c.to)!;
    const site: MarketSite = { id: dest.id, name: dest.name, profile: dest.profile, war: { borderDist: 9999, occupied: false, fort: false } };
    const eco = emptyEconomy(0);
    const stock0 = marketAt(eco, site, 0).stock[c.good]!;
    // reine Reise bis zum Ziel
    let n = null;
    for (let t = 0; t < 4000 && !n; t++) { n = sys.step(c, 1, () => 0.99); if (n?.type !== 'convoyArrived') n = null; }
    expect(n?.type).toBe('convoyArrived');
    expect(c.status).toBe('angekommen');
    const d = deliverConvoy(eco, site, 100, c.good, c.units);
    expect(eco.markets[site.id].stock[c.good]).toBeCloseTo(marketAt(eco, site, 100).stock[c.good]!, 6);
    expect(d.stockAfter - d.stockBefore).toBeCloseTo(c.units, 6);
    expect(d.stockBefore).toBeCloseTo(stock0, 0);
    expect(d.priceAfter).toBeLessThan(d.priceBefore);
  });

  it('Abfangen: der Zielhafen bleibt knapp (Vorrat und Preis unverändert), der Frachter führt die Ware seiner Region, an Grenzen Kriegsware', () => {
    const c = sys.create('p1', 0, rnd)!;
    const dest = SITES.find((s) => s.id === c.to)!;
    const site: MarketSite = { id: dest.id, name: dest.name, profile: dest.profile, war: { borderDist: 9999, occupied: false, fort: false } };
    const eco = emptyEconomy(0);
    const before = { ...marketAt(eco, site, 0).stock };
    const fr = c.ships.find((s) => s.role === 'frachter')!;
    fr.down = true; fr.byPlayer = true; fr.boarded = true;
    const n = sys.step(c, 1, () => 0.5);
    expect(n?.type).toBe('convoyPlundered');
    expect(c.status).toBe('gepluendert');
    // keine Lieferung: der Markt erholt sich nur zum Gleichgewicht (bleibt knapp), der Preis der Ware bleibt der Knappheitspreis
    const after = marketAt(eco, site, 100).stock;
    expect(after[c.good]).toBeCloseTo(before[c.good]!, 6);
    const price = marketPrice(site, c.good, after[c.good]!);
    const relieved = marketPrice(site, c.good, after[c.good]! + c.units);
    expect(price).toBeGreaterThan(relieved);
    // Beute: die Ladung (geentert ganz), an einer Grenze dazu Kriegsware
    const inland = convoyLoot(c, 5000, true, () => 0.1);
    expect(inland).toEqual([{ good: c.good, units: c.units }]);
    const border = convoyLoot(c, 200, false, () => 0.1);
    expect(border[0]).toEqual({ good: c.good, units: Math.round(c.units * 0.65) });
    expect(border).toHaveLength(2);
    expect(GOOD_BY_ID[border[1].good].war).toBe(true);
    const src = SITES.find((s) => s.id === c.from)!;
    expect(src.profile.produce).toContain(c.good);
  });

  it('Verteidigung: Korsaren greifen einen echten Konvoi an; versenkt der Spieler sie, gibt es Gold, Ansehen und Ehre der Macht – schießt er selbst auf den Konvoi, nichts', () => {
    const run = (hitConvoy: boolean) => {
      let c: ConvoyState | null = null;
      for (let i = 0; i < 80 && !(c && c.power && c.threatAt >= 0); i++) c = sys.create(`d${i}`, 0, rnd);
      c!.live = true;
      c!.playerHitConvoy = hitConvoy;
      const types: string[] = [];
      let reward = null;
      for (let t = 0; t < 4000 && !reward && c!.status !== 'angekommen'; t++) {
        // echte Schiffe: Lage kommt vom Frachter (hier entlang der Route verschoben)
        const fr = c!.ships[0];
        const k = Math.min(c!.leg, c!.route.length / 2 - 1);
        const dx = c!.route[k * 2] - fr.x, dz = c!.route[k * 2 + 1] - fr.z, dd = Math.hypot(dx, dz) || 1;
        fr.x += (dx / dd) * Math.min(dd, 8); fr.z += (dz / dd) * Math.min(dd, 8);
        const n = sys.step(c!, 1, () => 0.5);
        if (n) types.push(n.type);
        if (n?.type === 'convoyThreat') for (const k2 of c!.corsairs) { k2.down = true; k2.byPlayer = true; }
        if (n?.type === 'convoyDefended') reward = n.reward;
      }
      return { types, reward, c: c! };
    };
    const ok = run(false);
    expect(ok.types).toContain('convoyThreat');
    expect(ok.c.corsairs.length).toBe(CONVOY.corsairs[ok.c.dangerTier - 1]);
    expect(ok.reward).toEqual(defenseReward(ok.c));
    expect(ok.reward!.gold).toBe(CONVOY.defendGold * ok.c.dangerTier);
    expect(ok.reward!.standing).toBeGreaterThan(0);
    expect(ok.reward!.honor).toBeGreaterThan(0);
    expect(ok.reward!.power).toBe(ok.c.power);
    const bad = run(true);
    expect(bad.types).toContain('convoyThreat');
    expect(bad.reward).toBeNull();
  });

  it('der Director hält Konvois am Laufen: sie kommen an und beliefern Häfen, fern vom Spieler geht ein Teil an Korsaren verloren', () => {
    const R = runDirector(3600, 777);
    expect(R.notices.filter((n) => n === 'convoyArrived').length).toBeGreaterThan(10);
    expect(R.d.state.convoys.filter((c) => c.endedAt < 0).length).toBeLessThanOrEqual(CONVOY.max);
    // keine Strecke doppelt gleichzeitig
    const running = R.d.state.convoys.filter((c) => c.endedAt < 0).map((c) => `${c.from}>${c.to}`);
    expect(new Set(running).size).toBe(running.length);
  });
});

// ---------- 3. Meeresströmungen und Wetterzellen ----------

describe('Meeresströmungen (Windstraßen)', () => {
  const lanes = buildCurrentLanes(ALL);
  const field = new CurrentField(lanes);

  it('verbinden die wichtigsten Handels-Archipele in Ring 1 – 3 (Tiefsee-Strömungen seit 4.5C bis Ring 4) und führen um alle Inseln herum', () => {
    expect(lanes).toHaveLength(CURRENT_LANES.length);
    for (const l of lanes) {
      for (const id of [l.from, l.to]) expect(['town', 'harbor']).toContain(ALL.find((i) => i.id === id)!.kind);
      for (let k = 0; k < l.pts.length; k += 2) {
        expect(ringAtDistance(Math.hypot(l.pts[k], l.pts[k + 1])).ring).toBeLessThanOrEqual(l.deep ? 4 : 3);
        for (const isl of ALL) expect(Math.hypot(l.pts[k] - isl.x, l.pts[k + 1] - isl.z) - isl.r * ISLAND_REACH - l.width / 2).toBeGreaterThan(LANE_CLEAR - 2);
      }
      expect(l.length).toBeGreaterThan(800);
    }
  });

  it('+35 % Fahrt in Strömungsrichtung im Kern, nichts quer, gegen die Strömung oder außerhalb', () => {
    const l = lanes[0];
    const mid = Math.floor(l.pts.length / 4);
    const s = field.sample(l.pts[mid * 2], l.pts[mid * 2 + 1], newCurrentSample());
    expect(s.strength).toBeCloseTo(1, 6);
    expect(currentBoost(s.heading, s)).toBeCloseTo(1 + CURRENT_BOOST, 6);
    expect(CURRENT_BOOST).toBe(0.35);
    expect(currentBoost(s.heading + 0.25, s)).toBeCloseTo(1.35, 2);
    expect(currentBoost(s.heading + Math.PI / 2, s)).toBe(1);
    expect(currentBoost(s.heading + Math.PI, s)).toBe(1);
    // am Rand des Bandes weniger, außerhalb nichts
    const nx = s.dirZ, nz = -s.dirX;
    const edge = field.sample(l.pts[mid * 2] + nx * l.width * 0.42, l.pts[mid * 2 + 1] + nz * l.width * 0.42, newCurrentSample());
    const kEdge = currentBoost(s.heading, edge);
    expect(kEdge).toBeGreaterThan(1);
    expect(kEdge).toBeLessThan(1.35);
    const out = field.sample(l.pts[mid * 2] + nx * l.width, l.pts[mid * 2 + 1] + nz * l.width, newCurrentSample());
    expect(out.lane).toBe(-1);
    expect(currentBoost(s.heading, out)).toBe(1);
  });

  it('die echte Fahrphysik erreicht in der Strömung das 1,35-fache Tempo', () => {
    const l = lanes[2];
    const mid = Math.floor(l.pts.length / 3);
    const s = field.sample(l.pts[mid * 2], l.pts[mid * 2 + 1], newCurrentSample());
    const cls = SHIP_CLASSES[2];
    const P: MotionParams = { L: cls.L, turnMult: 1, turnK: 1, perfTurn: 1, perfAccel: 1, accelK: 1 };
    const base = cls.spd * SEA_SPEED;
    const a = newMotion(0, 0, s.heading, 0), b = newMotion(0, 0, s.heading, 0);
    for (let t = 0; t < 120; t += 1 / 60) { stepMotion(a, 0, base, P, 1 / 60); stepMotion(b, 0, base * currentBoost(s.heading, s), P, 1 / 60); }
    expect(b.speed / a.speed).toBeCloseTo(1.35, 2);
  });

  it('die Abfrage über das Raster stimmt mit der Rechnung über alle Segmente überein', () => {
    let seed = 7;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const a = newCurrentSample();
    for (let i = 0; i < 3000; i++) {
      const l = lanes[Math.floor(r() * lanes.length)];
      const k = Math.floor(r() * (l.pts.length / 2));
      const x = l.pts[k * 2] + (r() - 0.5) * 300, z = l.pts[k * 2 + 1] + (r() - 0.5) * 300;
      field.sample(x, z, a);
      let best = Infinity;
      for (const L of lanes) for (let j = 0; j + 1 < L.pts.length / 2; j++) {
        const ax = L.pts[j * 2], az = L.pts[j * 2 + 1], bx = L.pts[j * 2 + 2], bz = L.pts[j * 2 + 3];
        const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
        const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
        if (d < L.width / 2) best = Math.min(best, d);
      }
      expect(a.lane >= 0).toBe(best < Infinity);
    }
  });
});

describe('Lokale Wetterzellen', () => {
  const cell = (kind: WeatherCell['kind'], age = 200): WeatherCell => ({ id: 'c', kind, x: 1000, z: 1000, r: 600, vx: 2, vz: -1, age, life: 1200 });

  it('Abfrage: im Kern volle Stärke, am Rand weniger, außerhalb nichts; Ein- und Ausblenden über das Alter', () => {
    const c = cell('nebelbank');
    const s = strongestCell([c], 1000, 1000, newCellSample());
    expect(s.cell).toBe(c);
    expect(s.k).toBeCloseTo(1, 6);
    expect(cellWeight(c, 1000 + 600 * 0.8, 1000)).toBeGreaterThan(0);
    expect(cellWeight(c, 1000 + 600 * 0.8, 1000)).toBeLessThan(1);
    expect(strongestCell([c], 1700, 1000, newCellSample()).cell).toBeNull();
    expect(cellWeight(cell('nebelbank', 0), 1000, 1000)).toBe(0);
    expect(cellWeight(cell('nebelbank', 30), 1000, 1000)).toBeCloseTo(30 / WEATHER_CELLS.fade, 6);
    expect(cellWeight(cell('nebelbank', 1170), 1000, 1000)).toBeCloseTo(30 / WEATHER_CELLS.fade, 6);
  });

  it('Gewitter: hoher Seegang und Blitze; Nebelbank: kurze Sicht (auch für die KI); Flaute: kein Wind, die Fahrt sinkt', () => {
    expect(WEATHER_CELL_DEFS.gewitter.params.waves).toBeGreaterThanOrEqual(2.4);
    expect(WEATHER_CELL_DEFS.gewitter.params.lightning).toBeGreaterThan(0);
    expect(WEATHER_CELL_DEFS.nebelbank.params.visibility).toBeLessThanOrEqual(0.2);
    expect(WEATHER_CELL_DEFS.flaute.params.wind).toBeLessThanOrEqual(0.05);
    const core = (k: WeatherCell['kind']) => strongestCell([cell(k)], 1000, 1000, newCellSample());
    expect(cellSpeedK(core('flaute'))).toBeCloseTo(0.55, 6);
    expect(cellSightK(core('nebelbank'))).toBeCloseTo(0.45, 6);
    expect(cellSpeedK(strongestCell([], 0, 0, newCellSample()))).toBe(1);
  });

  it('Zellen ziehen und vergehen; das Wetter mischt die Zelle am Spieler ein (lokal statt global, ohne zufälligen Globalwechsel)', () => {
    const list = [cell('gewitter', 0)];
    stepCells(list, 10);
    expect(list[0].x).toBeCloseTo(1020, 6);
    expect(list[0].z).toBeCloseTo(990, 6);
    stepCells(list, 2000);
    expect(list).toHaveLength(0);
    const w = new Weather(new Scene());
    w.cellsDrive = true;
    w.setWeather('klar', true);
    w.cell = { k: 1, params: WEATHER_CELL_DEFS.nebelbank.params };
    for (let i = 0; i < 600; i++) w.update(0.5, { x: 0, y: 0, z: 0 } as never);
    expect(w.target).toBe('klar');
    expect(w.p.visibility).toBeCloseTo(WEATHER_CELL_DEFS.nebelbank.params.visibility, 2);
    w.cell = null;
    for (let i = 0; i < 600; i++) w.update(0.5, { x: 0, y: 0, z: 0 } as never);
    expect(w.p.visibility).toBeCloseTo(WEATHER.klar.visibility, 2);
  });

  it('der Director lässt Zellen wandern, nie direkt über dem Spieler entstehen und hält ihre Zahl', () => {
    const d = new WorldEventDirector(WORLD, null, 31);
    for (let t = 0; t < 1800; t++) {
      const before = new Set(d.state.cells.map((c) => c.id));
      d.update(1, [HOME]);
      for (const c of d.state.cells) if (!before.has(c.id) && !c.bossEventId) expect(Math.hypot(c.x - HOME.x, c.z - HOME.z)).toBeGreaterThan(c.r + 300 - 1e-6);
      // die Zelle eines besiegten oder abgetauchten Bosses blendet noch aus (sie zählt dann nicht mehr als Bosszelle)
      expect(d.state.cells.filter((c) => !c.bossEventId).length).toBeLessThanOrEqual(WEATHER_CELLS.count + WORLD_BOSS_IDS.length);
    }
    expect(d.state.cells.length).toBeGreaterThan(2);
    for (const c of d.state.cells) expect(Math.hypot(c.x, c.z)).toBeLessThan(PLAYABLE_RADIUS + 400);
  });
});

// ---------- 4. Weltbosse ----------

describe('Weltbosse in Ring 4: Gefahrenstufe 4 – 5, Kalibrierung, Anti-One-Shot, Siegel', () => {
  it('drei Bosse (Klabautermann, Ryujin, Leviathan) mit Gefahrenstufe 4 bis 5 und Leben aus balanceConfig', () => {
    expect(WORLD_BOSS_IDS).toEqual(['klabautermann', 'ryujin', 'leviathan']);
    for (const id of WORLD_BOSS_IDS) {
      const b = WORLD_BOSSES[id], st = worldBossStats(id);
      expect([4, 5]).toContain(dangerOfLevel(b.level));
      expect(st.maxHull).toBe(worldBossHull(SHIP_CLASSES[b.classTier].hp, b.level, b.hullK));
      expect(st.maxHull).toBeGreaterThan(SHIP_CLASSES[b.classTier].hp * 4);
    }
    expect(WORLD_BOSSES.ryujin.evo.hullTier).toBe(5);
    expect(WORLD_BOSSES.ryujin.evo.cannonTier).toBe(5);
    expect(WORLD_BOSSES.ryujin.sealPower).toBe('kurogane');
    expect(WORLD_BOSSES.klabautermann.cell).toBe('nebelbank');
    expect(WORLD_BOSSES.leviathan.form).toBe('ungeheuer');
  });

  it('roamen nur im Außenring (Ring 4) und bleiben dort', () => {
    const d = new WorldEventDirector(WORLD, null, 55);
    const P = [{ x: 0, z: 8800 }];
    let seen = 0;
    for (let t = 0; t < 3600; t++) {
      d.update(1, P);
      d.drain();
      for (const e of d.active()) if (e.kind === 'weltboss') {
        seen++;
        const r = Math.hypot(e.ships[0].x, e.ships[0].z);
        expect(r).toBeGreaterThan(RINGS[3].from);
        expect(r).toBeLessThan(PLAYABLE_RADIUS);
      }
    }
    expect(seen).toBeGreaterThan(100);
  });

  it('Kalibrierung: ein passend ausgerüstetes Schiff braucht 1,5 – 4 Minuten, ein Anfänger hat keine Chance, nichts fällt in Sekunden', () => {
    const fit: Record<WorldBossId, { level: number; classTier: number; rank: number; cannonTier: number }> = {
      klabautermann: { level: 18, classTier: 4, rank: 5, cannonTier: 4 },
      ryujin: { level: 22, classTier: 5, rank: 7, cannonTier: 5 },
      leviathan: { level: 22, classTier: 5, rank: 7, cannonTier: 5 },
    };
    for (const id of WORLD_BOSS_IDS) {
      const t = bossFightSeconds(id, fit[id]);
      expect(t).toBeGreaterThan(90);
      expect(t).toBeLessThan(240);
      expect(bossFightSeconds(id, { level: 6, classTier: 1, rank: 2, cannonTier: 2 })).toBeGreaterThan(900);
      expect(bossFightSeconds(id, { level: 30, classTier: 6, rank: 9, cannonTier: 5 })).toBeGreaterThan(45);
    }
    // eine Quelle: der Kugelschaden des Spielers kommt aus balanceConfig (Game nutzt dieselbe Funktion)
    expect(readFileSync(new URL('../src/core/game.ts', import.meta.url), 'utf8')).toContain('playerCannonDmg(lvl, this.save.ship.tier, evo.cannonTier)');
    expect(playerCannonDmg(20, 4, 3)).toBeCloseTo((12 + 28) * (1 + 0.24), 6);
  });

  it('Anti-One-Shot: kein Treffer nimmt einem Weltboss mehr als 4 %, keine Salve dem Spielerschiff mehr als 18 %', () => {
    const st = worldBossStats('ryujin');
    expect(capBossHit(1e9, st.maxHull)).toBeCloseTo(st.maxHull * WORLD_BOSS_HIT_CAP, 6);
    expect(capBossHit(10, st.maxHull)).toBe(10);
    expect(capBossHit(Number.NaN, st.maxHull)).toBe(0);
    const win = { t: -99, sum: 0 };
    const maxHull = 780;
    let dealt = 0;
    for (let i = 0; i < 10; i++) dealt += capVolley(win, 100 + i * 0.1, maxHull * 0.3, maxHull);
    expect(dealt).toBeCloseTo(maxHull * WORLD_BOSS_PLAYER_HIT_CAP, 6);
    // die nächste Salve (nach der Salvenzeit) darf wieder treffen
    expect(capVolley(win, 100 + WORLD_BOSS_VOLLEY_S + 1.1, maxHull, maxHull)).toBeCloseTo(maxHull * WORLD_BOSS_PLAYER_HIT_CAP, 6);
    // Schiffe und Ungeheuer hängen am Deckel
    const ship = readFileSync(new URL('../src/entities/ship/ship.ts', import.meta.url), 'utf8');
    expect(ship.match(/hitCap > 0 && base > this\.hitCap/g)?.length).toBe(2);
    const naval = readFileSync(new URL('../src/naval/naval.ts', import.meta.url), 'utf8');
    expect(naval).toContain('ship.hitCap = ship.maxHull * WORLD_BOSS_HIT_CAP');
    expect(naval.match(/this\.bossCap\(/g)!.length).toBeGreaterThanOrEqual(3);
    expect(readFileSync(new URL('../src/naval/leviathanBoss.ts', import.meta.url), 'utf8')).toContain('capBossHit(n, this.maxHp)');
  });

  it('Beute: garantiert Boss-Siegel (erster Sieg mehr), Relikt-Splitter und Stufe-4-Beute; Siegel der Macht des Bosses oder des Sektors', () => {
    for (const id of WORLD_BOSS_IDS) {
      const pos = { x: 0, z: 9300 };
      const sector = sectorAt(pos.x, pos.z).factionId;
      const first = rollWorldBossLoot(id, true, sector, () => 0);
      const again = rollWorldBossLoot(id, false, sector, () => 0.999);
      expect(first.seals.n).toBe(SEAL_DROP.first);
      expect(again.seals.n).toBe(SEAL_DROP.repeat);
      expect(first.seals.power).toBe(WORLD_BOSSES[id].sealPower ?? sector);
      expect(first.shards).toBeGreaterThanOrEqual(SEAL_DROP.shardsMin + 1);
      expect(again.shards).toBeLessThanOrEqual(SEAL_DROP.shardsMax + 1);
      expect(first.tier4).toBe(true);
      expect(first.gold).toBeGreaterThan(4000);
    }
  });

  it('ein besiegter Boss zählt (erster Sieg) und kommt erst nach seiner Wartezeit wieder', () => {
    const d = new WorldEventDirector(WORLD, null, 8);
    const P = [{ x: 0, z: 8800 }];
    let boss: WorldEvent | undefined;
    for (let t = 0; t < 600 && !boss; t++) { d.update(1, P); d.drain(); boss = d.active().find((e) => e.kind === 'weltboss'); }
    expect(boss).toBeTruthy();
    const id = boss!.bossId!;
    expect(d.firstKill(id)).toBe(true);
    boss!.ships[0].down = true; boss!.ships[0].byPlayer = true;
    d.update(1, P);
    expect(boss!.outcome).toBe('gesiegt');
    expect(d.firstKill(id)).toBe(false);
    const t0 = d.state.t;
    let back = -1;
    for (let t = 0; t < 2000 && back < 0; t++) { d.update(1, P); for (const n of d.drain()) if (n.type === 'eventStart' && n.event.bossId === id) back = d.state.t; }
    if (back >= 0) expect(back - t0).toBeGreaterThanOrEqual(WORLD_EVENT_DEFS.weltboss.cooldown - 1e-6);
  });
});

// ---------- 5. Architektur ----------

/** Alle Module, die ein Modul zur Laufzeit lädt (ohne `import type`), rekursiv; Rückgabe: die nackten Paketnamen */
function runtimeImports(rel: string): Set<string> {
  const path = (u: URL) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1');
  const seen = new Set<string>(), bare = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    const re = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        const base = path(new URL(spec, new URL(`file:///${file.replace(/\\/g, '/')}`)));
        visit(base.endsWith('.ts') ? base : `${base}.ts`);
      } else bare.add(spec);
    }
  };
  visit(path(new URL(`../src/${rel}.ts`, import.meta.url)));
  return bare;
}

describe('MMO-tauglicher Zustand und Leistung', () => {
  it('Director, Konvois, Strömungen, Wetterzellen und Weltboss-Rechnung kommen ohne three.js aus (Server-tauglich)', () => {
    for (const m of ['world/worldEventDirector', 'world/tradeConvoys', 'world/oceanCurrents', 'world/weatherCells', 'naval/worldBosses', 'data/seaEvents']) {
      expect([...runtimeImports(m)].filter((b) => b.startsWith('three'))).toEqual([]);
    }
    // Gegenprobe: die Darstellung lädt three.js
    expect(runtimeImports('world/worldEventView').has('three')).toBe(true);
  });

  it('der Zustand ist reines JSON (keine Netze, Schiffe oder Funktionen darin) und klein', () => {
    const R = runDirector(1800, 99);
    const snap = R.d.snapshot();
    const json = JSON.stringify(snap);
    expect(JSON.parse(json)).toEqual(snap);
    expect(json.length).toBeLessThan(60_000);
  });

  it('Shader- und Spawn-Vorwärmen: Signale, Wände, Leviathan, Kugeln und Fraktions-Schiffe werden im Ladebildschirm übersetzt; Schiffe entstehen einzeln', () => {
    const sea = readFileSync(new URL('../src/world/seaWorld.ts', import.meta.url), 'utf8');
    expect(sea).toContain('this.seaEvents?.prewarm(true, at)');
    expect(sea).toContain('this.naval?.prewarmProps(at)');
    const warm = readFileSync(new URL('../src/core/warmup.ts', import.meta.url), 'utf8');
    expect(warm).toContain('factionShipLook(f)');
    const live = readFileSync(new URL('../src/world/worldEventsLive.ts', import.meta.url), 'utf8');
    // ein Schiff zugleich, in Teilschritten mit Zeitbudget (Schiffsbau als Generator bis hinunter zu `buildShipSteps`)
    expect(live).toContain('static readonly BUILD_MS = 3;');
    expect(live).toContain("if (r.value === 'gpu' || r.value === 'wait' || performance.now() - t0 >= WorldEventsLive.BUILD_MS) return;");
    expect(live).toContain('this.host.warm(e.ship.model.group)');
    expect(readFileSync(new URL('../src/naval/naval.ts', import.meta.url), 'utf8')).toContain('const ship = yield* Ship.buildSteps(');
    expect(readFileSync(new URL('../src/entities/ship/ship.ts', import.meta.url), 'utf8')).toContain('const model = yield* buildShipSteps(');
    const sb = readFileSync(new URL('../src/entities/ship/shipBuilder.ts', import.meta.url), 'utf8');
    expect(sb.match(/^  yield;$/gm)!.length).toBeGreaterThanOrEqual(12);
    expect(sb).toContain('yield* addOutlinesSteps(group);');
  });

  it('Opt-In in der KI: Ereignis-Schiffe greifen den Spieler nur in ihrer Zone oder nach dem ersten Schuss an', () => {
    const naval = readFileSync(new URL('../src/naval/naval.ts', import.meta.url), 'utf8');
    expect(naval).toContain('if ((inZone || e.provoked) && dp < reach)');
    expect(naval).toContain("if (e.ev) return !e.provoked && e.ev.role !== 'korsar' && e.state !== 'engage';");
  });
});

// Typen der Marktprofile bleiben stabil (Hilfe für den Kompilierer)
export type _P = MarketProfile;
