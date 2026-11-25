// Spieler-Flotte (Phase 4.2D): Plätze nach Rang, Spielstand und Migration, Sold, Formation auf See, Ankern beim Anlegen, KI-gegen-KI-Rammen, Streuung der KI-Kanonen und die
// Gamepad-Kombinationen der Flottenbefehle. Die Seefahrt läuft mit der echten Physik (`stepMotion`) und echtem `IslandGround`; alles deterministisch.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { distToSegment, wrapAngle } from '../src/core/mathUtil';
import { createSave, SAVE_VERSION } from '../src/core/save/types';
import { migrateSave } from '../src/core/save/migrations';
import { stepUpkeep, upkeepOf } from '../src/core/economyEngine';
import { ACTION_GROUPS, ACTION_IDS, DEFAULT_KEYS, PAD_CHORDS, PAD_CHORD_MOD, padActionDown, type ActionId } from '../src/data/actions';
import { emptyEconomy, UPKEEP } from '../src/data/economy';
import {
  FLEET_MAX, FLEET_ORDERS, FLEET_ORDER_ACTIONS, FLEET_UNLOCK_RANKS, FORMATION_SLOTS, TOWED_HP, activateShip, activeCount, assignShip, assignableClasses, cleanFleet, dockShip, emptyFleet, escortSpeed,
  fleetCrewHeads, fleetIdOf, fleetShip, fleetShipUpkeep, fleetSlots, fleetUpkeepDaily, fleetUpkeepList, formationOffset, formationPoint, formationSlotOf, hasFreeSlot, releaseShip, shipUpkeepDaily,
  towShip, type FleetCtx, type FleetState, type FormationSlot,
} from '../src/data/playerFleet';
import { FAME_THRESHOLDS, rankIndex } from '../src/data/ranks';
import { DEFAULT_SHIP_LOOK, SEA_SPEED, SHIP_CLASSES } from '../src/data/ships';
import { evoStats, evolutionOfTier, newShipEvolution, shipEvolutionTier } from '../src/data/shipEvolution';
import { newMotion, stepMotion, windSpeedK, type Motion, type MotionParams } from '../src/naval/shipMotion';
import { createShipSim, crewEffects, stepSailSet } from '../src/naval/shipSim';
import { aiMayRam, ramContact, ramDamage, ramImpulse, type Kin } from '../src/naval/ramming';
import {
  PredictiveMaritimeSteering, STEER, aiSpreadK, arriveRadius, createAiNav, fireRangeOf, newSteerCommand, newSteerSelf, newSteerTarget, noteRam, standoffOf, type SteerCommand, type SteerEnv, type SteerSelf,
} from '../src/naval/shipSteering';
import { IslandGround, shelfOf, type WalkIsland } from '../src/world/islandGround';

const DT = 1 / 60;
const ENV: SteerEnv = { windDir: 0.6, windStrength: 0.4 };
const FX = crewEffects(1);
const TIERS = [0, 1, 2, 3, 4, 5, 6];
const LOOK = DEFAULT_SHIP_LOOK('pirat');

// ---------- Prüfaufbau (wie in shipSteering.test.ts: echte Physik, echte Lenkung) ----------

function island(x: number, z: number, r: number): WalkIsland {
  return { x, z, r, coast: [{ a: 0.06, f: 3, p: 0.4 }, { a: 0.04, f: 5, p: 1.1 }], shelf: shelfOf(r), hills: [], blockers: [] } as unknown as WalkIsland;
}

interface Rig { tier: number; self: SteerSelf; mp: MotionParams; m: Motion; sim: ReturnType<typeof createShipSim>; st: PredictiveMaritimeSteering; nav: ReturnType<typeof createAiNav>; cmd: SteerCommand; ground: IslandGround; time: number }

function rig(tier: number, o: { x?: number; z?: number; heading?: number; speed?: number; id?: string; ground?: IslandGround; hullTier?: number } = {}): Rig {
  const cls = SHIP_CLASSES[tier];
  const evo = evolutionOfTier(3);
  const st = evoStats(evo);
  const self = newSteerSelf();
  self.id = o.id ?? `schiff-${tier}`; self.L = cls.L; self.W = cls.W; self.classTier = tier; self.mass = cls.hp;
  self.hullTier = o.hullTier ?? evo.hullTier; self.turnK = st.turnK; self.vFull = cls.spd * SEA_SPEED * st.speedK; self.upwindK = st.upwindK; self.speedCap = 14.5 - tier * 0.4;
  const ground = o.ground ?? new IslandGround();
  const sim = createShipSim(self.id, cls.hp, cls.hp, cls.crew);
  sim.sailSet = 0.55;
  return {
    tier, self, m: newMotion(o.x ?? 0, o.z ?? 0, o.heading ?? 0, o.speed ?? 10), sim, ground, time: 0,
    mp: { L: cls.L, turnMult: 1, turnK: st.turnK, perfTurn: 1, perfAccel: 1, accelK: st.accelK },
    st: new PredictiveMaritimeSteering(ground, ENV, 6000), nav: createAiNav(self.id), cmd: newSteerCommand(),
  };
}

/** Ein 60-Hz-Schritt eines Schiffs: Zustand ins `SteerSelf`, die Lenkung (`drive`), Segel, Tempo und Bewegung wie `Ship.steer` (bei `hold` Tempo 0 wie in `NavalSystem.aiFleet`) */
function step(r: Rig, drive: () => void): void {
  const { self, m } = r;
  self.x = m.x; self.z = m.z; self.heading = m.heading; self.speed = m.speed;
  drive();
  stepSailSet(r.sim, r.cmd.sail, DT, FX);
  let target = Math.min(self.vFull * r.sim.sailSet * windSpeedK(m.heading, ENV.windDir, ENV.windStrength, self.upwindK), self.speedCap);
  if (r.cmd.hold) target = 0;
  stepMotion(m, r.cmd.turn, target, r.mp, DT);
  if (r.cmd.hold && m.speed < 0.6) m.speed = 0;
  r.time += DT;
}

/** Rumpf als Kapsel: Mittellinie von Heck bis Bug (um die halbe Breite gekürzt) mit dem Radius der halben Breite – genauer als ein Kreis um die Mitte */
interface Hull { x: number; z: number; heading: number; L: number; W: number }
function segDist(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): number {
  const cross = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = cross(cx, cz, dx, dz, ax, az), d2 = cross(cx, cz, dx, dz, bx, bz), d3 = cross(ax, az, bx, bz, cx, cz), d4 = cross(ax, az, bx, bz, dx, dz);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(distToSegment(ax, az, cx, cz, dx, dz), distToSegment(bx, bz, cx, cz, dx, dz), distToSegment(cx, cz, ax, az, bx, bz), distToSegment(dx, dz, ax, az, bx, bz));
}
function capsuleGap(a: Hull, b: Hull): number {
  const ha = Math.max(0, (a.L - a.W) / 2), hb = Math.max(0, (b.L - b.W) / 2);
  const ax = Math.sin(a.heading) * ha, az = Math.cos(a.heading) * ha, bx = Math.sin(b.heading) * hb, bz = Math.cos(b.heading) * hb;
  return segDist(a.x - ax, a.z - az, a.x + ax, a.z + az, b.x - bx, b.z - bz, b.x + bx, b.z + bz) - (a.W + b.W) / 2;
}
const hullOf = (r: { m: Motion; tier: number }): Hull => ({ x: r.m.x, z: r.m.z, heading: r.m.heading, L: SHIP_CLASSES[r.tier].L, W: SHIP_CLASSES[r.tier].W });

const kin = (r: { m: Motion; tier: number }): Kin => ({ x: r.m.x, z: r.m.z, heading: r.m.heading, course: r.m.course, speed: r.m.speed, L: SHIP_CLASSES[r.tier].L, W: SHIP_CLASSES[r.tier].W });

const ctx = (o: Partial<FleetCtx> = {}): FleetCtx => ({ owned: [0, 1, 2, 3], flagship: 3, evo: { '0': newShipEvolution(), '1': newShipEvolution(), '2': evolutionOfTier(2), '3': evolutionOfTier(3) }, look: LOOK, slots: 3, ...o });

// ---------- 1. Plätze nach Rang ----------

describe('Flotten-Plätze nach Ruhm-Rang', () => {
  it('Rang 0–3: kein Platz, 4–5: einer, 6–7: zwei, ab 8: drei (höchstens vier eigene Schiffe auf See)', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(fleetSlots)).toEqual([0, 0, 0, 0, 1, 1, 2, 2, 3, 3]);
    expect(FLEET_UNLOCK_RANKS).toEqual([4, 6, 8]);
    expect(FLEET_MAX + 1).toBe(4);
    expect(fleetSlots(99)).toBe(3);
    expect(fleetSlots(-3)).toBe(0);
    expect(fleetSlots(Number.NaN)).toBe(0);
  });

  it('die Ränge passen zu den Ruhm-Schwellen des Spiels (Rang 4 beginnt bei 800 Ruhm)', () => {
    expect(rankIndex(FAME_THRESHOLDS[4] - 1)).toBe(3);
    expect(fleetSlots(rankIndex(FAME_THRESHOLDS[4] - 1))).toBe(0);
    expect(fleetSlots(rankIndex(FAME_THRESHOLDS[4]))).toBe(1);
    expect(fleetSlots(rankIndex(FAME_THRESHOLDS[6]))).toBe(2);
    expect(fleetSlots(rankIndex(FAME_THRESHOLDS[8]))).toBe(3);
  });

  it('Einsetzen braucht einen freien Platz; ohne Rang gibt es keinen', () => {
    const f = emptyFleet();
    expect(assignShip(f, 1, ctx({ slots: 0 }))).toMatchObject({ ok: false });
    expect(f.ships).toHaveLength(0);
    expect(assignShip(f, 1, ctx({ slots: 1 }))).toEqual({ ok: true });
    expect(assignShip(f, 2, ctx({ slots: 1 }))).toMatchObject({ ok: false });
    expect(assignShip(f, 2, ctx({ slots: 2 }))).toEqual({ ok: true });
    expect(activeCount(f)).toBe(2);
    expect(hasFreeSlot(f, 2)).toBe(false);
    expect(hasFreeSlot(f, 3)).toBe(true);
  });

  it('Regeln: nicht das Flaggschiff, nur Besitz, jede Klasse einmal; Einmotten gibt den Platz frei, Aktivieren braucht ihn', () => {
    const f = emptyFleet();
    expect(assignShip(f, 3, ctx())).toMatchObject({ ok: false });          // Flaggschiff
    expect(assignShip(f, 5, ctx())).toMatchObject({ ok: false });          // nicht im Besitz
    expect(assignShip(f, 9, ctx())).toMatchObject({ ok: false });          // gibt es nicht
    expect(assignShip(f, 1.5, ctx())).toMatchObject({ ok: false });
    expect(assignShip(f, 1, ctx({ slots: 1 }))).toEqual({ ok: true });
    expect(assignShip(f, 1, ctx({ slots: 3 }))).toMatchObject({ ok: false });   // schon dabei
    expect(dockShip(f, fleetIdOf(1))).toEqual({ ok: true });
    expect(fleetShip(f, fleetIdOf(1))!.status).toBe('docked');
    expect(activeCount(f)).toBe(0);
    expect(assignShip(f, 2, ctx({ slots: 1 }))).toEqual({ ok: true });
    expect(activateShip(f, fleetIdOf(1), 1)).toMatchObject({ ok: false });       // Platz belegt
    expect(dockShip(f, fleetIdOf(2))).toEqual({ ok: true });
    expect(activateShip(f, fleetIdOf(1), 1)).toEqual({ ok: true });
    expect(releaseShip(f, fleetIdOf(1))).toEqual({ ok: true });
    expect(fleetShip(f, fleetIdOf(1))).toBeUndefined();
    expect(releaseShip(f, 'fleet-9')).toMatchObject({ ok: false });
    expect(assignableClasses([0, 1, 2, 3], 3, f)).toEqual([0, 1]);       // 2 liegt noch eingemottet in der Flotte
  });

  it('ein Untergang schleppt das Schiff in den Hafen: eingemottet, kaum Rumpf, nie verloren', () => {
    const f = emptyFleet();
    assignShip(f, 2, ctx());
    towShip(f, fleetIdOf(2));
    const s = fleetShip(f, fleetIdOf(2))!;
    expect(s.status).toBe('docked');
    expect(s.hp).toBe(TOWED_HP);
    expect(s.sailHp).toBe(TOWED_HP);
    expect(activeCount(f)).toBe(0);
  });
});

// ---------- 2. Spielstand ----------

describe('Spielstand 18: Flotte', () => {
  const V = '4.2.3';
  it('Version 18; ein Stand der Version 17 bekommt eine leere Flotte, alles andere bleibt', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(18);
    const old = { ...createSave('Alt', 'pirat', V), version: 17 } as Record<string, any>;
    delete old.fleet;
    old.player.gold = 777;
    const r = migrateSave(old, V);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(17);
    expect(r.data.version).toBe(SAVE_VERSION);
    expect(r.data.fleet).toEqual({ ships: [], order: 'hold' });
    expect(r.data.player.gold).toBe(777);
  });

  it('ein neuer Stand hat eine leere Flotte; ein Stand ohne Feld wird ergänzt (fehlendes Feld ist erlaubt)', () => {
    expect(createSave('X', 'marine', V).fleet).toEqual(emptyFleet());
    const d = { ...createSave('X', 'pirat', V) } as Record<string, any>;
    delete d.fleet;
    const r = migrateSave(d, V);
    expect(r.ok && r.data.fleet).toEqual(emptyFleet());
  });

  it('Bereinigung: nur besessene Klassen außer dem Flaggschiff, einmal je Klasse, Werte begrenzt, Ausbaustufen aus ship.evo', () => {
    const save = createSave('X', 'pirat', V);
    save.player.fame = FAME_THRESHOLDS[6];                    // Rang 6: zwei Plätze
    save.ship.owned = [0, 1, 2, 3];
    save.ship.tier = 3;
    save.ship.evo = { '0': evolutionOfTier(1), '1': evolutionOfTier(2), '2': evolutionOfTier(4), '3': evolutionOfTier(3) };
    (save as Record<string, any>).fleet = {
      order: 'blödsinn',
      ships: [
        { shipClass: 2, status: 'active', hp: 7, sailHp: -3, evo: { hullTier: 1, sailTier: 1, cannonTier: 1 } },   // Werte außerhalb, Stufen aus ship.evo
        { shipClass: 2, status: 'active', hp: 0.5, sailHp: 0.5 },                                                    // doppelt
        { shipClass: 3, status: 'active' },                                                                          // Flaggschiff
        { shipClass: 5, status: 'active' },                                                                          // nicht im Besitz
        { shipClass: 'x' }, null, 42, { shipClass: -1 },
        { shipClass: 1, status: 'active', hp: 0.4, sailHp: 0.9 },
        { shipClass: 0, status: 'active', hp: 0.3, sailHp: 0.3 },                                                    // dritter aktiver: nur zwei Plätze
      ],
    };
    const r = migrateSave(JSON.parse(JSON.stringify(save)), V);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = r.data.fleet!;
    expect(f.order).toBe('hold');
    expect(f.ships.map((s) => s.shipClass)).toEqual([2, 1, 0]);
    expect(f.ships.map((s) => s.status)).toEqual(['active', 'active', 'docked']);
    expect(f.ships[0].hp).toBe(1);
    expect(f.ships[0].sailHp).toBe(0);
    expect(f.ships[0].evo).toEqual(evolutionOfTier(4));            // aus ship.evo, nicht aus dem Eintrag
    expect(f.ships[1].hp).toBeCloseTo(0.4, 9);
    expect(f.ships.every((s) => s.hp >= 0.05 && s.hp <= 1 && s.sailHp >= 0 && s.sailHp <= 1)).toBe(true);
    expect(activeCount(f)).toBe(2);
  });

  it('JSON-Rundlauf ohne Verlust, auch nach Einsetzen, Einmotten und Abschleppen', () => {
    const f: FleetState = emptyFleet();
    const c = ctx();
    assignShip(f, 0, c); assignShip(f, 1, c); assignShip(f, 2, c);
    dockShip(f, fleetIdOf(1)); towShip(f, fleetIdOf(2)); f.order = 'attack';
    expect(JSON.parse(JSON.stringify(f))).toEqual(f);
    expect(cleanFleet(JSON.parse(JSON.stringify(f)), c)).toEqual(f);
  });

  it('wer das Flaggschiff wechselt: das alte Flaggschiff taugt als Begleiter, das neue verschwindet aus der Flotte (Bereinigung)', () => {
    const f = emptyFleet();
    assignShip(f, 2, ctx());
    // jetzt wird Klasse 2 Flaggschiff
    const clean = cleanFleet(f, ctx({ flagship: 2 }));
    expect(clean.ships).toHaveLength(0);
    expect(assignableClasses([0, 1, 2, 3], 2, clean)).toEqual([0, 1, 3]);
  });
});

// ---------- 3. Sold ----------

describe('Sold und Wartung der Flotte (Unterhalt)', () => {
  const fleet = (statuses: ('active' | 'docked')[]): FleetState => {
    const f = emptyFleet();
    statuses.forEach((s, i) => { assignShip(f, i, ctx({ owned: [0, 1, 2, 3, 4], flagship: 4, slots: 3 })); if (s === 'docked') dockShip(f, fleetIdOf(i)); });
    return f;
  };
  const base = { tier: 4, seamen: 60, troops: 0, officers: 2, evoTier: 3 };

  it('ein Begleitschiff kostet Sold der Seeleute plus Wartung der Klasse (mit Aufschlag der Ausbaustufe)', () => {
    for (const tier of TIERS) {
      const u = fleetShipUpkeep({ shipClass: tier, evo: newShipEvolution() });
      expect(u.seamen).toBeCloseTo(fleetCrewHeads(tier) * UPKEEP.seaman, 9);
      expect(u.hull).toBeCloseTo(UPKEEP.hull[tier], 9);
      expect(u.daily).toBeCloseTo(u.seamen + u.hull, 9);
    }
    const hi = fleetShipUpkeep({ shipClass: 3, evo: evolutionOfTier(5) }), lo = fleetShipUpkeep({ shipClass: 3, evo: evolutionOfTier(1) });
    expect(hi.hull).toBeGreaterThan(lo.hull);
    expect(hi.seamen).toBe(lo.seamen);
  });

  it('dieselbe Rechnung wie beim Flaggschiff (kein zweiter Weg): shipUpkeepDaily = upkeepOf ohne Offiziere und Truppen', () => {
    for (const tier of TIERS) for (const evoTier of [1, 3, 5]) {
      const a = shipUpkeepDaily({ tier, seamen: 40, evoTier });
      const b = upkeepOf({ tier, seamen: 40, troops: 0, officers: 0, evoTier });
      expect(a.daily).toBeCloseTo(b.daily, 9);
    }
  });

  it('nur aktive Schiffe zahlen; eingemottete kosten nichts; der Gesamtsold steigt um genau ihre Summe', () => {
    const all = fleet(['active', 'active', 'docked']);
    expect(fleetUpkeepList(all)).toHaveLength(2);
    const without = upkeepOf(base).daily;
    const withFleet = upkeepOf({ ...base, fleet: fleetUpkeepList(all) });
    expect(withFleet.fleet).toBeCloseTo(fleetUpkeepDaily(all), 9);
    expect(withFleet.daily).toBeCloseTo(without + fleetUpkeepDaily(all), 9);
    expect(upkeepOf({ ...base, fleet: fleetUpkeepList(fleet(['docked', 'docked'])) }).daily).toBeCloseTo(without, 9);
    expect(upkeepOf({ ...base, fleet: [] }).fleet).toBe(0);
    expect(upkeepOf(base).fleet).toBe(0);
  });

  it('der Zahltag zieht den Flotten-Sold mit ab (und die Moral sinkt, wenn das Gold nicht reicht)', () => {
    const eco = emptyEconomy(0);
    const input = { ...base, fleet: fleetUpkeepList(fleet(['active', 'active'])) };
    const per = upkeepOf(input).perPeriod;
    const plain = upkeepOf(base).perPeriod;
    expect(per).toBeGreaterThan(plain);
    const r = stepUpkeep(eco, eco.nextPay, 1e6, input);
    expect(r.spent).toBe(Math.round(per));
    const poor = emptyEconomy(0);
    const r2 = stepUpkeep(poor, poor.nextPay, Math.round(plain), input);
    expect(r2.missed).toBe(1);
    expect(poor.morale).toBeLessThan(1);
  });
});

// ---------- 4. Formation: Geometrie ----------

describe('Formation: Plätze rund um das Flaggschiff', () => {
  it('Backbord-Flanke, Steuerbord-Flanke, Nachhut – in dieser Reihenfolge', () => {
    expect(FORMATION_SLOTS).toEqual(['port', 'starboard', 'rear']);
    expect([0, 1, 2, 3, 9].map(formationSlotOf)).toEqual(['port', 'starboard', 'rear', 'rear', 'rear']);
  });

  it('kein Rumpf berührt den anderen: für alle Klassenpaare und Plätze bleiben mindestens 10 m Luft (Flagg- und Begleitschiffe, auch untereinander)', () => {
    const gap = (a: { x: number; z: number; L: number; W: number }, b: { x: number; z: number; L: number; W: number }) =>
      Math.max(Math.abs(a.x - b.x) - (a.W + b.W) / 2, Math.abs(a.z - b.z) - (a.L + b.L) / 2);
    for (const fl of SHIP_CLASSES) for (const ow of SHIP_CLASSES) for (const ow2 of SHIP_CLASSES) {
      const place = (slot: FormationSlot, own: { L: number; W: number }) => { const o = formationOffset(slot, fl, own); return { x: o.side, z: o.ahead, L: own.L, W: own.W }; };
      const flag = { x: 0, z: 0, L: fl.L, W: fl.W };
      const p = place('port', ow), s = place('starboard', ow2), r = place('rear', ow);
      for (const q of [p, s, r]) expect(gap(flag, q)).toBeGreaterThanOrEqual(10);
      expect(gap(p, s)).toBeGreaterThanOrEqual(10);
      expect(gap(p, r)).toBeGreaterThanOrEqual(10);
      expect(gap(s, r)).toBeGreaterThanOrEqual(10);
    }
  });

  it('die Abstände wachsen mit der Größe des Flaggschiffs und des Begleiters', () => {
    const small = { L: 18, W: 5.8 }, big = { L: 74, W: 19 };
    expect(formationOffset('port', big, small).side).toBeGreaterThan(formationOffset('port', small, small).side);
    expect(formationOffset('port', small, big).side).toBeGreaterThan(formationOffset('port', small, small).side);
    expect(Math.abs(formationOffset('rear', big, small).ahead)).toBeGreaterThan(Math.abs(formationOffset('rear', small, small).ahead));
    expect(formationOffset('port', small, small).side).toBeCloseTo(-formationOffset('starboard', small, small).side, 9);
    expect(formationOffset('rear', small, small).side).toBe(0);
  });

  it('Weltkoordinaten: Backbord ist links vom Bug (Bug = (sin h, cos h)), die Nachhut liegt achteraus', () => {
    for (const h of [0, 0.7, -2.1, Math.PI]) {
      const flag = { x: 100, z: -50, heading: h, L: 38, W: 10 }, own = { L: 30, W: 8.4 };
      const fwd = { x: Math.sin(h), z: Math.cos(h) }, left = { x: Math.cos(h), z: -Math.sin(h) };
      for (const slot of FORMATION_SLOTS) {
        const p = formationPoint(slot, flag, own), o = formationOffset(slot, flag, own);
        const dx = p.x - flag.x, dz = p.z - flag.z;
        expect(dx * fwd.x + dz * fwd.z).toBeCloseTo(o.ahead, 9);
        expect(dx * left.x + dz * left.z).toBeCloseTo(o.side, 9);
      }
    }
  });

  it('Wunschtempo: folgt dem Flaggschiff, holt höchstens 4 m/s auf, bremst bei einem Platz achteraus bis zum Stillstand, nie unter 0', () => {
    expect(escortSpeed(10, 0)).toBe(10);
    expect(escortSpeed(10, 100)).toBe(14);
    expect(escortSpeed(10, -8)).toBe(8);
    expect(escortSpeed(10, -100)).toBe(0);
    expect(escortSpeed(1, -100)).toBe(0);
    expect(escortSpeed(0, 0)).toBe(0);
    let prev = -Infinity;
    for (let b = -30; b <= 30; b += 5) { const v = escortSpeed(10, b); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });
});

// ---------- 5. Formation auf See (Fahrt mit der echten Physik) ----------

describe('Formation auf See: ruhig, kollisionsfrei, kein Kreisfahren', () => {
  it('zwei Begleitschiffe folgen dem Flaggschiff über Geradeaus, eine Kurve und wieder Geradeaus, ohne ein Schiff zu berühren', () => {
    // Begleiter-Klassen (1 bis 3 Schiffe), je Kurve nach rechts (Steuerbord innen) und nach links (Backbord innen)
    const cases = [[1, 2], [0, 5], [2, 2], [1, 3, 4]].flatMap((tiers) => [1, -1].map((dir) => ({ tiers, dir })));
    for (const { tiers, dir } of cases) {
      const flagTier = 3;
      const fc = SHIP_CLASSES[flagTier];
      const flag = newMotion(0, 0, 0, 9);
      const fmp: MotionParams = { L: fc.L, turnMult: 1, turnK: 1, perfTurn: 1, perfAccel: 1, accelK: 1 };
      const pose = { x: 0, z: 0, heading: 0, L: fc.L, W: fc.W };
      const pt = { x: 0, z: 0 };
      const off = { side: 0, ahead: 0 };
      const mo = { speed: 9, yawRate: 0 };
      const comps = tiers.map((t, i) => {
        formationPoint(FORMATION_SLOTS[i], pose, SHIP_CLASSES[t], pt);
        // Start 60 m hinter dem eigenen Platz
        return rig(t, { x: pt.x, z: pt.z - 60, heading: 0, speed: 9, id: `fleet-${t}-${i}` });
      });
      const turned = comps.map((c) => ({ last: c.m.heading, total: 0 }));
      let flagTurned = 0, flagLast = flag.heading;
      let minGap = Infinity, rams = 0;
      const errs: { t: number; e: number[] }[] = [];
      const total = 130;
      for (let i = 0; i < 60 * total; i++) {
        const t = i / 60;
        const rudder = t >= 50 && t < 58 ? 0.4 * dir : 0;
        stepMotion(flag, rudder, 9, fmp, DT);
        flagTurned += Math.abs(wrapAngle(flag.heading - flagLast)); flagLast = flag.heading;
        pose.x = flag.x; pose.z = flag.z; pose.heading = flag.heading;
        mo.speed = flag.speed; mo.yawRate = -flag.yawRate;          // Motion.yawRate: positiv = nach rechts; die Formation rechnet positiv = nach links
        const errNow: number[] = [];
        comps.forEach((c, k) => {
          // dritte Fahrzeug-Nachhut: Innenschiffe in der Kurve fahren dahinter (wie `NavalSystem.aiFleet`)
          const behindRear = comps.length > 2 && k !== 2 ? 0.5 * (SHIP_CLASSES[comps[2].tier].L + SHIP_CLASSES[c.tier].L) + 20 : 0;
          formationPoint(FORMATION_SLOTS[k], pose, SHIP_CLASSES[c.tier], pt, mo, behindRear, off);
          const sx = pt.x, sz = pt.z;
          const ef = { heading: flag.heading, speed: flag.speed, yawRate: mo.yawRate, side: off.side };
          c.st.clearObstacles();
          c.st.addObstacle('flag', flag.x, flag.z, Math.sin(flag.course) * flag.speed, Math.cos(flag.course) * flag.speed, fc.L * 0.32);
          comps.forEach((o, j) => { if (j !== k) c.st.addObstacle(o.self.id, o.m.x, o.m.z, Math.sin(o.m.course) * o.m.speed, Math.cos(o.m.course) * o.m.speed, SHIP_CLASSES[o.tier].L * 0.32); });
          step(c, () => c.st.escort(c.nav, c.self, sx, sz, ef, false, DT, c.cmd));
          turned[k].total += Math.abs(wrapAngle(c.m.heading - turned[k].last)); turned[k].last = c.m.heading;
          errNow.push(Math.hypot(c.m.x - sx, c.m.z - sz));
          if (ramContact(kin(c), { x: flag.x, z: flag.z, heading: flag.heading, course: flag.course, speed: flag.speed, L: fc.L, W: fc.W }).hit) rams++;
          minGap = Math.min(minGap, capsuleGap(hullOf(c), { x: flag.x, z: flag.z, heading: flag.heading, L: fc.L, W: fc.W }));
        });
        for (let a = 0; a < comps.length; a++) for (let b = a + 1; b < comps.length; b++) minGap = Math.min(minGap, capsuleGap(hullOf(comps[a]), hullOf(comps[b])));
        if (i % 60 === 0) errs.push({ t, e: errNow });
      }
      const at = (sec: number) => errs.find((x) => x.t >= sec)!.e;
      const label = `Begleiter ${tiers}, Kurve ${dir > 0 ? 'rechts' : 'links'}`;
      expect(rams, label).toBe(0);
      expect(minGap, label).toBeGreaterThan(0);
      // nach dem Aufschließen sitzen sie auf ihrem Platz (Geradeaus), nach der Kurve wieder
      for (const e of at(48)) expect(e, label).toBeLessThan(25);
      for (const e of at(total - 1)) expect(e, label).toBeLessThan(25);
      // kein Kreisfahren: die Gesamt-Kursänderung bleibt in der Nähe der des Flaggschiffs
      for (const tr of turned) expect(tr.total, label).toBeLessThan(flagTurned + 1.2 * Math.PI);
    }
  });

  it('bleibt das Flaggschiff stehen (Anker, Flaute, Befehl), rücken die Begleiter auf ihre Plätze und stehen dort still (kein Verharren neben dem Platz)', () => {
    for (const tiers of [[1, 2], [0, 5], [2, 4]]) {
      const fc = SHIP_CLASSES[3];
      const flag = newMotion(0, 0, 0, 9);
      const fmp: MotionParams = { L: fc.L, turnMult: 1, turnK: 1, perfTurn: 1, perfAccel: 1, accelK: 1 };
      const pose = { x: 0, z: 0, heading: 0, L: fc.L, W: fc.W }, pt = { x: 0, z: 0 };
      const comps = tiers.map((t, i) => { formationPoint(FORMATION_SLOTS[i], pose, SHIP_CLASSES[t], pt); return rig(t, { x: pt.x + (i ? -30 : 30), z: pt.z + (i ? 70 : -70), heading: i ? 2.4 : -0.8, speed: 8, id: `still-${t}-${i}` }); });
      let minGap = Infinity;
      for (let i = 0; i < 60 * 150; i++) {
        const t = i / 60;
        stepMotion(flag, 0, t < 30 ? 9 : 0, fmp, DT);              // nach 30 s bleibt das Flaggschiff stehen
        pose.x = flag.x; pose.z = flag.z; pose.heading = flag.heading;
        comps.forEach((c, k) => {
          formationPoint(FORMATION_SLOTS[k], pose, SHIP_CLASSES[c.tier], pt);
          const sx = pt.x, sz = pt.z;
          c.st.clearObstacles();
          c.st.addObstacle('flag', flag.x, flag.z, 0, 0, fc.L * 0.32);
          comps.forEach((o, j) => { if (j !== k) c.st.addObstacle(o.self.id, o.m.x, o.m.z, 0, 0, SHIP_CLASSES[o.tier].L * 0.32); });
          step(c, () => c.st.escort(c.nav, c.self, sx, sz, { heading: flag.heading, speed: flag.speed }, false, DT, c.cmd));
          minGap = Math.min(minGap, capsuleGap(hullOf(c), { x: flag.x, z: flag.z, heading: flag.heading, L: fc.L, W: fc.W }));
        });
        if (i === 60 * 149) comps.forEach((c, k) => {
          formationPoint(FORMATION_SLOTS[k], pose, SHIP_CLASSES[c.tier], pt);
          expect(Math.hypot(c.m.x - pt.x, c.m.z - pt.z), `Begleiter ${tiers} Schiff ${k}: Abstand zum Platz`).toBeLessThan(15);
          expect(c.m.speed, `Begleiter ${tiers} Schiff ${k}: Tempo`).toBeLessThan(1);
        });
      }
      expect(minGap, `Begleiter ${tiers}`).toBeGreaterThan(0);
    }
  });

  it('die Tempoanpassung ist sanft: das Segel springt nicht zwischen den Extremen', () => {
    const fc = SHIP_CLASSES[3];
    const flag = newMotion(0, 0, 0, 9);
    const fmp: MotionParams = { L: fc.L, turnMult: 1, turnK: 1, perfTurn: 1, perfAccel: 1, accelK: 1 };
    const c = rig(2, { x: 40, z: -30, heading: 0, speed: 9, id: 'sanft' });
    const pose = { x: 0, z: 0, heading: 0, L: fc.L, W: fc.W }, pt = { x: 0, z: 0 };
    let jumps = 0, last = c.cmd.sail;
    for (let i = 0; i < 60 * 70; i++) {
      stepMotion(flag, 0, 9, fmp, DT);
      pose.x = flag.x; pose.z = flag.z; pose.heading = flag.heading;
      formationPoint('port', pose, SHIP_CLASSES[2], pt);
      c.st.clearObstacles();
      step(c, () => c.st.escort(c.nav, c.self, pt.x, pt.z, { heading: flag.heading, speed: flag.speed }, false, DT, c.cmd));
      if (i > 60 * 20 && Math.abs(c.cmd.sail - last) > 0.2) jumps++;
      last = c.cmd.sail;
    }
    expect(jumps).toBeLessThanOrEqual(2);
  });

  it('Sammeln (rush): die Begleiter kommen mit allem Tuch zurück und sind schneller als in der Formation', () => {
    const time = (rush: boolean) => {
      const fc = SHIP_CLASSES[3];
      const flag = newMotion(0, 0, 0, 6);
      const fmp: MotionParams = { L: fc.L, turnMult: 1, turnK: 1, perfTurn: 1, perfAccel: 1, accelK: 1 };
      const c = rig(2, { x: 0, z: -260, heading: 0, speed: 6, id: 'sammeln' });
      const pose = { x: 0, z: 0, heading: 0, L: fc.L, W: fc.W }, pt = { x: 0, z: 0 };
      for (let i = 0; i < 60 * 120; i++) {
        stepMotion(flag, 0, 6, fmp, DT);
        pose.x = flag.x; pose.z = flag.z; pose.heading = flag.heading;
        formationPoint('port', pose, SHIP_CLASSES[2], pt);
        c.st.clearObstacles();
        step(c, () => c.st.escort(c.nav, c.self, pt.x, pt.z, { heading: flag.heading, speed: flag.speed }, rush, DT, c.cmd));
        if (Math.hypot(c.m.x - pt.x, c.m.z - pt.z) < 20) return c.time;
      }
      return Infinity;
    };
    expect(time(true)).toBeLessThan(time(false));
    expect(time(true)).toBeLessThan(120);
  });
});

// ---------- 6. Ankern beim Anlegen ----------

describe('Ankern: Begleitschiffe halten ≥ 45 m Abstand zu Stegen und Küste und stehen still', () => {
  /** Hafen: eine Insel mit Küste bei z ≈ 360, ein Steg von der Küste 60 m aufs Meer, das Flaggschiff liegt an seinem Ende */
  const harbor = () => {
    const g = new IslandGround();
    g.add(island(0, 600, 250));
    g.piers.push({ ax: 0, az: 352, bx: 0, bz: 292, hw: 2.4, y: 1.5, id: 'pier-1' });
    return g;
  };
  const minClearAt = (g: IslandGround, x: number, z: number, W: number) => {
    let c = g.shipClearance(x, z, W, 400);
    for (const p of g.piers) c = Math.min(c, distToSegment(x, z, p.ax, p.az, p.bx, p.bz) - p.hw - W / 2);
    return c;
  };

  it('alle sieben Klassen: zwei Begleiter laufen auf den Steg zu und bleiben mit ≥ 45 m Abstand stehen (Tempo 0), ohne Steg oder Küste zu berühren', () => {
    for (const tier of TIERS) {
      const g = harbor();
      const flagPos = { x: 14, z: 292, L: 38, W: 10 };
      const wants = [{ x: 14 + 40, z: 292 - 20 }, { x: 14 - 40, z: 292 - 20 }];
      const comps = wants.map((w, i) => rig(tier, { x: -260 - i * 60, z: 0, heading: Math.atan2(w.x + 260, w.z), speed: 10, ground: g, id: `anker-${tier}-${i}` }));
      let worst = Infinity;
      const turned = comps.map((c) => ({ last: c.m.heading, total: 0 }));
      for (let i = 0; i < 60 * 150; i++) {
        comps.forEach((c, k) => {
          c.st.clearObstacles();
          c.st.addObstacle('flag', flagPos.x, flagPos.z, 0, 0, flagPos.L * 0.32);
          comps.forEach((o, j) => { if (j !== k) c.st.addObstacle(o.self.id, o.m.x, o.m.z, Math.sin(o.m.course) * o.m.speed, Math.cos(o.m.course) * o.m.speed, SHIP_CLASSES[o.tier].L * 0.32); });
          step(c, () => c.st.anchor(c.nav, c.self, wants[k].x, wants[k].z, 45, DT, c.cmd));
          worst = Math.min(worst, minClearAt(g, c.m.x, c.m.z, SHIP_CLASSES[tier].W));
          turned[k].total += Math.abs(wrapAngle(c.m.heading - turned[k].last)); turned[k].last = c.m.heading;
        });
      }
      for (const [k, c] of comps.entries()) {
        const W = SHIP_CLASSES[tier].W;
        expect(c.m.speed, `Klasse ${tier} Schiff ${k}: Tempo`).toBeLessThan(0.1);
        expect(c.cmd.hold, `Klasse ${tier} Schiff ${k}: hold`).toBe(true);
        expect(minClearAt(g, c.m.x, c.m.z, W), `Klasse ${tier} Schiff ${k}: Abstand`).toBeGreaterThanOrEqual(45 - 0.5);
        expect(turned[k].total, `Klasse ${tier} Schiff ${k}: kein Kreisen`).toBeLessThan(3 * Math.PI);
      }
      expect(worst, `Klasse ${tier}: nie Steg oder Küste berührt`).toBeGreaterThan(0);
      // die beiden Schiffe liegen nicht aufeinander
      expect(Math.hypot(comps[0].m.x - comps[1].m.x, comps[0].m.z - comps[1].m.z)).toBeGreaterThan(0.3 * (SHIP_CLASSES[tier].L * 2));
    }
  });

  it('ein Schiff, das auf offener See schon weit genug weg ist, bleibt dort (der Ankerplatz ist der Wunschplatz selbst)', () => {
    const g = harbor();
    const c = rig(2, { x: 0, z: -400, heading: 0, speed: 0, ground: g, id: 'frei' });
    for (let i = 0; i < 60 * 60; i++) { c.st.clearObstacles(); step(c, () => c.st.anchor(c.nav, c.self, 10, -380, 45, DT, c.cmd)); }
    expect(c.nav.anchorSet).toBe(true);
    expect(Math.hypot(c.nav.anchorX - 10, c.nav.anchorZ + 380)).toBeLessThan(1e-9);
    expect(c.cmd.hold).toBe(true);
    expect(c.m.speed).toBe(0);
  });

  it('legt das Flaggschiff ab, ist der Wunschplatz neu: der Ankerplatz wird neu gesucht (kein Festkleben am alten)', () => {
    const g = harbor();
    const c = rig(3, { x: -100, z: 150, heading: 0.4, speed: 6, ground: g, id: 'neu' });
    c.st.clearObstacles();
    step(c, () => c.st.anchor(c.nav, c.self, 40, 270, 45, DT, c.cmd));
    const first = { x: c.nav.anchorX, z: c.nav.anchorZ };
    step(c, () => c.st.anchor(c.nav, c.self, 40, 270, 45, DT, c.cmd));
    expect({ x: c.nav.anchorX, z: c.nav.anchorZ }).toEqual(first);                 // gleicher Wunsch: bleibt
    step(c, () => c.st.anchor(c.nav, c.self, 600, -300, 45, DT, c.cmd));
    expect(Math.hypot(c.nav.anchorX - 600, c.nav.anchorZ + 300)).toBeLessThan(1e-9);  // neuer Wunsch weit weg auf offener See: der Platz selbst
  });
});

// ---------- 7. KI gegen KI: Rammen mit Gegenstoß ----------

describe('KI-vs.-KI-Rammen in Seeschlachten', () => {
  it('nur ein Schiff im Rammangriff (RAM_CHARGE) mit Rumpf-Stufe ≥ 4, das selbst noch kämpft, gegen ein Ziel, das noch kämpft', () => {
    const ok = { aiState: 'RAM_CHARGE', hullTier: 4, disabled: false };
    expect(aiMayRam(ok, { disabled: false })).toBe(true);
    expect(aiMayRam({ ...ok, hullTier: 5 }, { disabled: false })).toBe(true);
    for (const ht of [1, 2, 3]) expect(aiMayRam({ ...ok, hullTier: ht }, { disabled: false })).toBe(false);
    for (const st of ['TRANSIT', 'APPROACH', 'BROADSIDE_ORBIT', 'DISENGAGE', undefined]) expect(aiMayRam({ ...ok, aiState: st }, { disabled: false })).toBe(false);
    expect(aiMayRam({ ...ok, disabled: true }, { disabled: false })).toBe(false);
    expect(aiMayRam(ok, { disabled: true })).toBe(false);
  });

  it('der Stoß wirkt auf beide Rümpfe (Gegenstoß), die Schiffe prallen auseinander, das Manöver endet sofort', () => {
    // A (Rumpf 4) rammt B im Duell: Kontaktprüfung, Schaden, Abprall und noteRam wie in NavalSystem.tryRam
    const A = rig(3, { x: 0, z: 0, heading: 0, speed: 12, hullTier: 4, id: 'A' });
    const B = rig(3, { x: 0, z: 140, heading: Math.PI, speed: 0, hullTier: 4, id: 'B' });
    const tgt = newSteerTarget();
    Object.assign(tgt, { id: 'B', x: B.m.x, z: B.m.z, heading: B.m.heading, speed: 0, L: SHIP_CLASSES[3].L, W: SHIP_CLASSES[3].W, mass: SHIP_CLASSES[3].hp });
    A.sim.sailSet = 0.7;
    let hit = false, contactDist = 0, hullA = SHIP_CLASSES[3].hp, hullB = SHIP_CLASSES[3].hp, after = 0, distAfter = 0, shoveBefore = 0;
    for (let i = 0; i < 60 * 60 && !hit; i++) {
      A.st.clearObstacles();
      step(A, () => A.st.fight(A.nav, A.self, tgt, DT, A.cmd));
      if (A.nav.aiState === 'RAM_CHARGE') {
        const c = ramContact(kin(A), kin(B));
        if (c.hit) {
          hit = true; contactDist = Math.hypot(A.m.x - B.m.x, A.m.z - B.m.z);
          const d = ramDamage(c.relSpeed, A.self.mass, 4);
          hullB -= d.target; hullA -= d.self;
          const imp = ramImpulse(c, A.self.mass, B.self.mass);
          // Abprall: A wird gegen seine Stoßrichtung gedrückt, B in Stoßrichtung; die Rümpfe werden getrennt
          shoveBefore = imp.shoveA.x * Math.sin(A.m.heading) + imp.shoveA.z * Math.cos(A.m.heading);
          A.m.x += imp.sepA.x; A.m.z += imp.sepA.z; B.m.x += imp.sepB.x; B.m.z += imp.sepB.z;
          A.m.speed *= 0.55;
          noteRam(A.nav);
          expect(d.target).toBeGreaterThan(0);
          expect(d.self).toBeGreaterThan(0);                       // der Rammer nimmt den Gegenstoß ab
          expect(d.self).toBeLessThan(d.target);                   // Rammsporn: viel weniger als das Ziel
          expect(shoveBefore).toBeLessThan(0);                     // zurück, gegen die eigene Fahrtrichtung
        }
      }
    }
    expect(hit).toBe(true);
    expect(hullB).toBeLessThan(SHIP_CLASSES[3].hp);
    expect(hullA).toBeLessThan(SHIP_CLASSES[3].hp);
    // nächster Schritt: sofort Umkreisen, nie ein zweiter Anlauf in der Pause
    A.st.clearObstacles();
    step(A, () => A.st.fight(A.nav, A.self, tgt, DT, A.cmd));
    after = A.nav.aiState === 'BROADSIDE_ORBIT' ? 1 : 0;
    expect(after).toBe(1);
    expect(A.nav.ramCooldown).toBeGreaterThan(0);
    for (let i = 0; i < 60 * 12; i++) { A.st.clearObstacles(); step(A, () => A.st.fight(A.nav, A.self, tgt, DT, A.cmd)); }
    distAfter = Math.hypot(A.m.x - B.m.x, A.m.z - B.m.z);
    expect(distAfter).toBeGreaterThan(contactDist);
  });

  it('Schiffe einer Seeschlacht dürfen rammen (canRam im Duell), wenn sie zum Ziel hin ausgerichtet sind; auf den Spieler zielende Schlachtschiffe nicht', () => {
    // Die Regel in der Seewelt: canRam = !training && (!battle || duel) – hier als Quelltext-Prüfung, weil die Seewelt ohne Szene nicht läuft
    const naval = readFileSync('src/naval/naval.ts', 'utf8');
    expect(naval).toMatch(/ramOk = !e\.battle && !e\.training/);
    expect(naval).toMatch(/this\.fillSteerSelf\(e, self, false, !e\.training\)/);
    expect(naval).toMatch(/aiMayRam\(/);
    expect(naval).toMatch(/this\.battleFoe\(e\)/);
    expect(naval).toMatch(/e\.nav\?\.aiState !== 'RAM_CHARGE'/);
  });
});

// ---------- 8. Streuung und Reichweite der KI-Kanonen ----------

describe('Breitseiten-Reichweite und Streuung (4.2D-1)', () => {
  it('die Streuung ist bis 115 m normal, wächst dann linear und liegt bei 140 m beim Vierfachen', () => {
    expect(aiSpreadK(0)).toBe(1);
    expect(aiSpreadK(115)).toBe(1);
    expect(aiSpreadK(127.5)).toBeCloseTo(2.5, 9);
    expect(aiSpreadK(140)).toBeCloseTo(4, 9);
    expect(aiSpreadK(500)).toBe(4);
    let prev = 0;
    for (let d = 0; d <= 200; d += 5) { const k = aiSpreadK(d); expect(k).toBeGreaterThanOrEqual(prev); prev = k; }
    expect(STEER.spreadFrom).toBe(115);
  });

  it('die Schussweite ist höchstens 140 m und liegt für alle Klassen über dem Gefechtsabstand', () => {
    for (const t of TIERS) {
      expect(fireRangeOf(t)).toBeLessThanOrEqual(140);
      expect(fireRangeOf(t)).toBeGreaterThan(standoffOf(t));
    }
    expect(fireRangeOf(6)).toBe(140);
    expect(fireRangeOf(0)).toBeCloseTo(78, 9);
  });

  it('der Quelltext streut KI-Schützen jenseits von 115 m stärker, der Spieler zielt wie bisher', () => {
    const naval = readFileSync('src/naval/naval.ts', 'utf8');
    expect(naval).toMatch(/ship === this\.player \? 1 : aiSpreadK\(/);
  });
});

// ---------- 9. Eingabe: Flottenbefehle ----------

describe('Flottenbefehle: Tasten und Gamepad-Kombination', () => {
  const pad = (...down: number[]) => { const b: boolean[] = new Array(17).fill(false); for (const i of down) b[i] = true; return b; };

  it('drei Befehle mit eigenen Aktionen, in genau einer Gruppe der Tastenbelegung', () => {
    expect(FLEET_ORDERS.map((o) => o.id)).toEqual(['hold', 'attack', 'rally']);
    expect(FLEET_ORDERS.map((o) => o.label)).toEqual(['Formation halten', 'Feuer frei / Angreifen', 'Sammeln / Rückzug']);
    for (const o of FLEET_ORDERS) {
      const a = FLEET_ORDER_ACTIONS[o.id];
      expect(ACTION_IDS).toContain(a);
      expect(ACTION_GROUPS.filter((g) => g.actions.includes(a))).toHaveLength(1);
    }
  });

  it('Standardtasten 5, 6, 7: sie teilen eine Taste nur mit den Truppenbefehlen (die gelten nur zu Fuß, die Flotte nur auf See)', () => {
    expect(FLEET_ORDERS.map((o) => DEFAULT_KEYS[FLEET_ORDER_ACTIONS[o.id]])).toEqual([['Digit5'], ['Digit6'], ['Digit7']]);
    const footOnly = new Set<string>(['cmdSturm', 'cmdFollow', 'cmdHold']);
    for (const o of FLEET_ORDERS) {
      const a = FLEET_ORDER_ACTIONS[o.id];
      for (const other of ACTION_IDS) if (other !== a && !footOnly.has(other)) for (const c of DEFAULT_KEYS[a]) expect(DEFAULT_KEYS[other as ActionId], `${a} gegen ${other}`).not.toContain(c);
    }
  });

  it('Gamepad: R3 gehalten + Kreuz löst den Befehl aus; das Kreuz allein nicht; R3 allein nicht', () => {
    const [hold, attack, rally] = FLEET_ORDERS.map((o) => FLEET_ORDER_ACTIONS[o.id]);
    expect(padActionDown(hold, pad(PAD_CHORD_MOD, 14))).toBe(true);
    expect(padActionDown(attack, pad(PAD_CHORD_MOD, 12))).toBe(true);
    expect(padActionDown(rally, pad(PAD_CHORD_MOD, 15))).toBe(true);
    expect(padActionDown(hold, pad(14))).toBe(false);
    expect(padActionDown(hold, pad(PAD_CHORD_MOD))).toBe(false);
    expect(padActionDown(hold, pad(PAD_CHORD_MOD, 12))).toBe(false);          // falsche Richtung
    // der Befehl ist nur ein Befehl: nie zwei zugleich (die Kombinationen zu Fuß, 4.6B, lösen keinen Flottenbefehl aus)
    for (const o of FLEET_ORDERS) {
      const btn = PAD_CHORDS[FLEET_ORDER_ACTIONS[o.id]]!;
      expect(FLEET_ORDERS.filter((q) => padActionDown(FLEET_ORDER_ACTIONS[q.id], pad(PAD_CHORD_MOD, btn)))).toHaveLength(1);
    }
    for (const a of ['awaken', 'aura'] as const) expect(FLEET_ORDERS.filter((q) => padActionDown(FLEET_ORDER_ACTIONS[q.id], pad(PAD_CHORD_MOD, PAD_CHORDS[a]!)))).toHaveLength(0);
  });

  it('solange R3 gehalten wird, steuert das Kreuz nicht mit (kein Gegenlenken beim Befehl); ohne R3 steuert es wie immer', () => {
    expect(padActionDown('left', pad(14))).toBe(true);
    expect(padActionDown('up', pad(12))).toBe(true);
    expect(padActionDown('left', pad(PAD_CHORD_MOD, 14))).toBe(false);
    expect(padActionDown('up', pad(PAD_CHORD_MOD, 12))).toBe(false);
    expect(padActionDown('right', pad(PAD_CHORD_MOD, 15))).toBe(false);
    // unten gehört seit 4.6B dem Sturm-Erwachen (zu Fuß, R3 + ▼): auch dabei lenkt das Kreuz nicht mit
    expect(padActionDown('down', pad(PAD_CHORD_MOD, 13))).toBe(false);
    expect(padActionDown('awaken', pad(PAD_CHORD_MOD, 13))).toBe(true);
    expect(padActionDown('down', pad(13))).toBe(true);
    // alle anderen Tasten bleiben unberührt (Angriff = A)
    expect(padActionDown('attack', pad(0))).toBe(true);
    expect(padActionDown('attack', pad(PAD_CHORD_MOD, 0))).toBe(true);
  });

  it('keine Kombination kollidiert mit der Haltetaste', () => {
    for (const b of Object.values(PAD_CHORDS) as number[]) expect(b).not.toBe(PAD_CHORD_MOD);
    // drei Flottenbefehle (See) und zwei Kombinationen zu Fuß (Sturm-Erwachen, Aura): alle verschieden
    expect(new Set(Object.values(PAD_CHORDS)).size).toBe(5);
  });
});

// ---------- 10. Verdrahtung (Quelltext) ----------

describe('Verdrahtung der Flotte', () => {
  const src = (f: string) => readFileSync(f, 'utf8');
  it('die alte automatische Begleiter-Erzeugung nach Rang ist weg; die Seewelt kennt Flotte, Anker und Verlust', () => {
    const naval = src('src/naval/naval.ts');
    expect(naval).not.toMatch(/ensureCompanions/);
    expect(naval).not.toMatch(/playerRank >= 8 \? 2/);
    expect(naval).toMatch(/ensureFleet\(\)/);
    expect(naval).toMatch(/setFleet\(/);
    expect(naval).toMatch(/this\.steering\.anchor\(/);
    expect(naval).toMatch(/this\.steering\.escort\(/);
    expect(src('src/world/seaWorld.ts')).toMatch(/fleetAnchored = this\.mode !== 'sail' \|\| !!this\.ship\.moored \|\| !!this\.docking\.ladderId/);
    expect(src('src/raid/raidRules.ts')).not.toMatch(/ownEscortsForRank/);
  });

  it('kein Beschuss unter Freunden: Kugeln von Begleitern treffen weder das Flaggschiff noch andere Begleiter', () => {
    expect(src('src/naval/naval.ts')).toMatch(/this\.friendly\.has\(b\.owner\) && this\.friendly\.has\(s\)/);
  });

  it('die Werft hat den Reiter „Flotte“ und den Knopf „Vorschau zurücksetzen“', () => {
    const menus = src('src/ui/menus.ts');
    expect(menus).toMatch(/data-a="pvreset"/);
    expect(menus).toMatch(/Vorschau zurücksetzen/);
    expect(menus).toMatch(/showFleet\(/);
    expect(menus).toMatch(/yardTabs\('yard'\)/);
    expect(menus).toMatch(/yardTabs\('fleet'\)/);
    expect(menus).toMatch(/data-a="fleet"/);
  });

  it('nichts Neues je Bild in den reinen Dateien', () => {
    const strip = (s: string) => s.replace(new RegExp('//.*$', 'gm'), '').replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), '');
    for (const f of ['src/data/playerFleet.ts', 'src/naval/shipSteering.ts']) {
      const s = strip(src(f));
      expect(s).not.toMatch(/from 'three'/);
      expect(s).not.toMatch(/Math\.random/);
      expect(s).not.toMatch(/new (Vector[234]|Matrix[34]|Quaternion|Euler|Color)\b/);
    }
  });

  it('SHIP_CLASSES-Kenngrößen, auf die die Flotte rechnet, sind aufsteigend (Besatzung und Wartung wachsen mit der Klasse)', () => {
    for (let t = 1; t < 7; t++) {
      expect(fleetCrewHeads(t)).toBeGreaterThan(fleetCrewHeads(t - 1));
      expect(fleetShipUpkeep({ shipClass: t, evo: newShipEvolution() }).daily).toBeGreaterThan(fleetShipUpkeep({ shipClass: t - 1, evo: newShipEvolution() }).daily);
    }
    expect(shipEvolutionTier(evolutionOfTier(4))).toBe(4);
    expect(arriveRadius(newSteerSelf())).toBeGreaterThan(0);
  });
});
