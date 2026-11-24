// Prüft die KI-Lenkung (naval/shipSteering.ts) gegen die ECHTE Fahrphysik (naval/shipMotion.ts `stepMotion`, dieselbe Rechnung wie `Ship.steer`), mit echtem
// `IslandGround` für Küsten und Stege. Alles deterministisch (kein Zufall, feste Zeitschritte), also ohne Flackern.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clamp01, distToSegment, wrapAngle } from '../src/core/mathUtil';
import { RAM_MIN_TIER } from '../src/data/balanceConfig';
import { evoStats, evolutionOfTier } from '../src/data/shipEvolution';
import { SEA_SPEED, SHIP_CLASSES } from '../src/data/ships';
import { newMotion, stepMotion, turnRadius, windSpeedK, maxYawRate, type Motion, type MotionParams } from '../src/naval/shipMotion';
import { createShipSim, crewEffects, stepSailSet } from '../src/naval/shipSim';
import {
  PredictiveMaritimeSteering, STEER, arriveRadius, createAiNav, fireRangeOf, hash01, interceptPoint, newSteerCommand, newSteerSelf, newSteerTarget, noteRam, radiusAt,
  ramWindow, standoffOf, type AiManeuver, type AiNavState, type Point, type SteerCommand, type SteerEnv, type SteerSelf, type SteerTarget,
} from '../src/naval/shipSteering';
import { IslandGround, shelfOf, type WalkIsland } from '../src/world/islandGround';

const DT = 1 / 60;
const ENV: SteerEnv = { windDir: 0.6, windStrength: 0.4 };
const WORLD_R = 6000;
const FX = crewEffects(1);
const TIERS = [0, 1, 2, 3, 4, 5, 6];

/** Insel wie im Spiel (Küstenlinie aus zwei Sinus-Termen, Strandböschung nach `shelfOf`); nur die Felder, die Küste und Schiffskontakt brauchen */
function island(x: number, z: number, r: number): WalkIsland {
  return { x, z, r, coast: [{ a: 0.06, f: 3, p: 0.4 }, { a: 0.04, f: 5, p: 1.1 }], shelf: shelfOf(r), hills: [], blockers: [] } as unknown as WalkIsland;
}

// ---------- Prüfaufbau: ein Schiff, echte Physik, echte Lenkung ----------

interface Rig {
  tier: number;
  self: SteerSelf;
  mp: MotionParams;
  m: Motion;
  sailSet: ReturnType<typeof createShipSim>;
  st: PredictiveMaritimeSteering;
  nav: AiNavState;
  cmd: SteerCommand;
  ground: IslandGround;
  tgt: SteerTarget;
  /** fremde Schiffe (Kennung, Lage, Fahrt): werden vor jedem Schritt als Hindernisse eingetragen */
  others: { id: string; x: number; z: number; vx: number; vz: number; r: number }[];
  time: number;
}

interface RigOpts { x?: number; z?: number; heading?: number; speed?: number; hullTier?: number; evoTier?: number; cap?: number; ground?: IslandGround; id?: string }

function rig(tier: number, o: RigOpts = {}): Rig {
  const cls = SHIP_CLASSES[tier];
  const evo = evolutionOfTier(o.evoTier ?? 3);
  const st = evoStats(evo);
  const self = newSteerSelf();
  self.id = o.id ?? `schiff-${tier}`; self.L = cls.L; self.W = cls.W; self.classTier = tier; self.mass = cls.hp;
  self.hullTier = o.hullTier ?? evo.hullTier; self.turnK = st.turnK; self.vFull = cls.spd * SEA_SPEED * st.speedK; self.upwindK = st.upwindK;
  self.speedCap = o.cap ?? 14.5 - tier * 0.4;
  const ground = o.ground ?? new IslandGround();
  const m = newMotion(o.x ?? 0, o.z ?? 0, o.heading ?? 0, o.speed ?? 10);
  const sim = createShipSim(self.id, cls.hp, cls.hp, cls.crew);
  sim.sailSet = 0.55;
  const tgt = newSteerTarget();
  tgt.mass = cls.hp;
  return {
    tier, self, m, mp: { L: cls.L, turnMult: 1, turnK: st.turnK, perfTurn: 1, perfAccel: 1, accelK: st.accelK }, sailSet: sim,
    st: new PredictiveMaritimeSteering(ground, ENV, WORLD_R), nav: createAiNav(self.id), cmd: newSteerCommand(), ground, tgt, others: [], time: 0,
  };
}

/** Ein 60-Hz-Schritt: Zustand ins `SteerSelf`, `drive` ruft Lenkung (cruise/fight), dann Segel, Tempo und Bewegung wie `Ship.steer` */
function tick(r: Rig, drive: (r: Rig) => void, sailOverride?: number): void {
  const { self, m } = r;
  self.x = m.x; self.z = m.z; self.heading = m.heading; self.speed = m.speed;
  self.reloadL = Math.max(0, self.reloadL - DT); self.reloadR = Math.max(0, self.reloadR - DT);
  r.st.clearObstacles();
  for (const o of r.others) r.st.addObstacle(o.id, o.x, o.z, o.vx, o.vz, o.r);
  drive(r);
  stepSailSet(r.sailSet, sailOverride ?? r.cmd.sail, DT, FX);
  const target = Math.min(self.vFull * r.sailSet.sailSet * windSpeedK(m.heading, ENV.windDir, ENV.windStrength, self.upwindK), self.speedCap);
  stepMotion(m, r.cmd.turn, target, r.mp, DT);
  for (const o of r.others) { o.x += o.vx * DT; o.z += o.vz * DT; }
  r.time += DT;
}

const cruiseTo = (gx: number, gz: number, sail = 0.55, arrive?: number, ignore: string | null = null) => (r: Rig) => r.st.cruise(r.nav, r.self, gx, gz, sail, arrive ?? arriveRadius(r.self), ignore, DT, r.cmd);

/** Zählt die gesamte Kursänderung (Betrag, Bogenmaß) */
class Turned { total = 0; private last: number; constructor(h: number) { this.last = h; } add(h: number) { this.total += Math.abs(wrapAngle(h - this.last)); this.last = h; } }

/** Die alte Lenkung: Vollruder auf den Punkt (`-diff * 2`, begrenzt) */
function legacyTurn(m: Motion, gx: number, gz: number): number {
  const want = Math.atan2(gx - m.x, gz - m.z);
  const diff = ((want - m.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return Math.max(-1, Math.min(1, -diff * 2));
}

/** Quelltext ohne Zeilen- und Blockkommentare (für die Prüfung auf verbotene Muster) */
const stripComments = (src: string): string => src.replace(new RegExp('//.*$', 'gm'), '').replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), '');

/** Kontakt der drei Prüfpunkte (Bug, Mitte, Heck) wie `pushShip` sie sieht: kleinster Abstand zur Kontaktgrenze */
function minContact(r: Rig): number {
  let best = 1e9;
  for (const k of [0.44, 0, -0.44]) best = Math.min(best, r.ground.shipClearance(r.m.x + Math.sin(r.m.heading) * r.self.L * k, r.m.z + Math.cos(r.m.heading) * r.self.L * k, r.self.W));
  return best;
}

// ---------- 1. Fahrphysik ----------

describe('Fahrphysik (shipMotion): eine Quelle für Spieler, KI und Tests', () => {
  it('stepMotion rechnet Zeile für Zeile wie die frühere Ship.steer-Bewegung', () => {
    // Die alte Rechnung, unverändert hier festgehalten
    const legacy = (s: Motion, turn: number, target: number, L: number, p: MotionParams, dt: number) => {
      const m = clamp01((L - 15) / 59);
      s.speed += (target - s.speed) * Math.min(1, dt * (target < s.speed ? 0.45 : 0.62 * p.perfAccel * p.accelK) * (1.25 - 0.7 * m));
      s.turnInput += (turn - s.turnInput) * Math.min(1, dt * 4);
      const maxRate = (0.58 - 0.33 * m) * p.turnMult * p.turnK * p.perfTurn * (0.3 + 0.7 * Math.min(1, s.speed / 8));
      s.yawRate += (s.turnInput * maxRate - s.yawRate) * Math.min(1, dt * (1.5 - 0.8 * m));
      s.heading -= s.yawRate * dt;
      s.speed -= s.speed * Math.min(0.5, Math.abs(s.yawRate) * 0.07 * dt);
      let dc = s.heading - s.course;
      dc = wrapAngle(dc);
      if (Math.abs(dc) > 1.0) { s.course = s.heading; dc = 0; }
      s.course += dc * Math.min(1, dt * (3.2 - 1.6 * m));
      s.x += Math.sin(s.course) * s.speed * dt;
      s.z += Math.cos(s.course) * s.speed * dt;
    };
    let seed = 12345;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (const tier of TIERS) {
      const cls = SHIP_CLASSES[tier];
      const p: MotionParams = { L: cls.L, turnMult: 1 + rnd() * 0.3, turnK: 0.85 + rnd() * 0.3, perfTurn: 0.4 + rnd() * 0.6, perfAccel: 0.5 + rnd() * 0.5, accelK: 0.8 + rnd() * 0.45 };
      const a = newMotion(10, -20, 0.4, 6), b = newMotion(10, -20, 0.4, 6);
      let turn = 0, target = 8;
      for (let i = 0; i < 4000; i++) {
        if (i % 90 === 0) { turn = rnd() * 2 - 1; target = rnd() * 16; }
        stepMotion(a, turn, target, p, DT);
        legacy(b, turn, target, cls.L, p, DT);
      }
      for (const k of ['x', 'z', 'heading', 'speed', 'course', 'turnInput', 'yawRate'] as const) expect(a[k]).toBeCloseTo(b[k], 9);
    }
  });

  it('Wendekreis: je langsamer, desto enger; schwere Schiffe wenden weiter', () => {
    for (const tier of TIERS) {
      const L = SHIP_CLASSES[tier].L;
      let prev = 0;
      for (const v of [2, 4, 6, 8, 10, 12, 14]) {
        const R = turnRadius(L, 1, 1, 1, v);
        expect(R).toBeGreaterThan(prev);
        prev = R;
      }
    }
    for (let t = 1; t < 7; t++) expect(turnRadius(SHIP_CLASSES[t].L, 1, 1, 1, 10)).toBeGreaterThan(turnRadius(SHIP_CLASSES[t - 1].L, 1, 1, 1, 10));
    // zerfetzte Segel (perfTurn) und schlechtere Segelstufe machen den Kreis weiter
    expect(turnRadius(40, 1, 1, 0.5, 10)).toBeGreaterThan(turnRadius(40, 1, 1, 1, 10));
  });

  it('Der vorhergesagte Wendekreis stimmt mit dem gefahrenen überein (Vollruder, Schaluppe, Fregatte, Leviathan)', () => {
    for (const tier of [0, 3, 6]) {
      const r = rig(tier, { speed: 10 });
      const pts: { x: number; z: number }[] = [];
      for (let i = 0; i < 60 * 70; i++) {
        stepMotion(r.m, 1, 10, r.mp, DT);
        if (i > 60 * 50 && i % 6 === 0) pts.push({ x: r.m.x, z: r.m.z });
      }
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
      const measured = pts.reduce((s, p) => s + Math.hypot(p.x - cx, p.z - cz), 0) / pts.length;
      const predicted = turnRadius(r.self.L, 1, r.mp.turnK, 1, r.m.speed);
      expect(measured / predicted).toBeGreaterThan(0.75);
      expect(measured / predicted).toBeLessThan(1.25);
    }
  });

  it('maxYawRate und windSpeedK: Rückenwind schneller, bessere Segel verlieren am Wind weniger', () => {
    expect(maxYawRate(30, 1, 1, 1, 0)).toBeCloseTo(maxYawRate(30, 1, 1, 1, 8) * 0.3, 9);
    expect(windSpeedK(0.6, 0.6, 0.4, 1)).toBeGreaterThan(windSpeedK(0.6 + Math.PI, 0.6, 0.4, 1));
    expect(windSpeedK(0.6 + Math.PI, 0.6, 0.4, 0.4)).toBeGreaterThan(windSpeedK(0.6 + Math.PI, 0.6, 0.4, 1));
    expect(windSpeedK(1.2, 0.6, 0.4, 1, true)).toBe(1);
  });
});

// ---------- 2. Kein Kreisen ----------

describe('Kein Endlos-Kreisen: nahe Ziele innerhalb des Wendekreises', () => {
  it('der Ankunftsradius liegt immer jenseits des engsten Kreises (gerefft ist jedes Ziel erreichbar)', () => {
    for (const tier of TIERS) {
      const { self } = rig(tier);
      const slow = radiusAt(self, Math.min(self.vFull * STEER.slowMin, self.speedCap));
      expect(arriveRadius(self)).toBeGreaterThanOrEqual(2.3 * slow - 1e-9);
      expect(arriveRadius(self)).toBeGreaterThanOrEqual(30);
      expect(arriveRadius(self)).toBeGreaterThanOrEqual(self.L * 0.8);
    }
  });

  it('Ziel im Wendekreis, enger Ankunftsradius: die alte Lenkung kreist über zwei Mal, die neue braucht höchstens 2/3 Umdrehung und refft', () => {
    for (const tier of TIERS) {
      const base = rig(tier, { speed: 10 });
      const Rfull = turnRadius(base.self.L, 1, base.mp.turnK, 1, 10);
      const arr = Math.max(8, 0.4 * Rfull);
      const gx = Rfull * 0.9, gz = 0;             // Mitte des Vollruder-Kreises: der Punkt liegt tief darin
      // alt
      const old = rig(tier, { speed: 10 });
      const oldTurn = new Turned(old.m.heading);
      let oldAt = -1;
      for (let i = 0; i < 60 * 120 && oldAt < 0; i++) {
        tick(old, () => { old.cmd.turn = legacyTurn(old.m, gx, gz); old.cmd.sail = 0.9; });
        oldTurn.add(old.m.heading);
        if (Math.hypot(gx - old.m.x, gz - old.m.z) < arr) oldAt = old.time;
      }
      // neu
      const neu = rig(tier, { speed: 10 });
      const newTurn = new Turned(neu.m.heading);
      let newAt = -1, minSail = 1;
      for (let i = 0; i < 60 * 120 && newAt < 0; i++) {
        tick(neu, cruiseTo(gx, gz, 0.9, arr));
        newTurn.add(neu.m.heading);
        minSail = Math.min(minSail, neu.cmd.sail);
        if (neu.cmd.arrived) newAt = neu.time;
      }
      expect(oldAt).toBeGreaterThan(0);
      expect(oldTurn.total).toBeGreaterThan(3.5 * Math.PI);          // Grundfehler: mehr als eine volle Runde (erst die abnehmende Fahrt beendet sie)
      expect(newAt).toBeGreaterThan(0);
      expect(newTurn.total).toBeLessThan(1.6 * Math.PI);
      expect(newAt).toBeLessThan(oldAt * 0.5);
      expect(minSail).toBeGreaterThanOrEqual(STEER.slowMin - 1e-9);
      expect(minSail).toBeLessThanOrEqual(STEER.slowMax);
    }
  });

  it('Ziele rund um das Schiff knapp außerhalb des Ankunftsradius: immer erreicht, nie mehr als eine Dreiviertelrunde Kursänderung zu viel', () => {
    for (const tier of TIERS) for (const phi of [60, 90, 120, 150, 180]) for (const side of [1, -1]) {
      const r = rig(tier, { speed: 10 });
      const D = arriveRadius(r.self) * 1.15, ph = (phi * Math.PI) / 180;
      const gx = side * Math.sin(ph) * D, gz = Math.cos(ph) * D;
      const tr = new Turned(r.m.heading);
      let at = -1;
      for (let i = 0; i < 60 * 60 && at < 0; i++) { tick(r, cruiseTo(gx, gz, 0.9)); tr.add(r.m.heading); if (r.cmd.arrived) at = r.time; }
      expect(at, `Klasse ${tier}, ${phi}°, Seite ${side}`).toBeGreaterThan(0);
      expect(at).toBeLessThan(35);
      // höchstens eine Halbrunde plus ein Viertel (Ziel liegt höchstens 180° neben dem Bug)
      expect(tr.total).toBeLessThan(1.75 * Math.PI);
    }
  });

  it('liegt das Ziel im Wendekreis, wird auf 0,25 … 0,45 gerefft; liegt es weit voraus, bleibt das Segel oben', () => {
    for (const tier of TIERS) {
      const r = rig(tier, { speed: 10 });
      const R = turnRadius(r.self.L, 1, r.mp.turnK, 1, 10);
      let minSail = 1;
      for (let i = 0; i < 90; i++) { tick(r, cruiseTo(R * 0.9, 0, 0.9, 5)); minSail = Math.min(minSail, r.cmd.sail); }
      expect(minSail).toBeGreaterThanOrEqual(STEER.slowMin - 1e-9);
      expect(minSail).toBeLessThanOrEqual(STEER.slowMax + 1e-9);
      const far = rig(tier, { speed: 10 });
      let farMin = 1;
      for (let i = 0; i < 300; i++) { tick(far, cruiseTo(0, 900, 0.9, 20)); farMin = Math.min(farMin, far.cmd.sail); }
      expect(farMin).toBeCloseTo(0.9, 6);
    }
  });

  it('Reffen flattert nicht: das Segel wechselt bei einem Ziel im Kreis höchstens wenige Male zwischen Reffen und Setzen', () => {
    for (const tier of [2, 4, 6]) {
      const r = rig(tier, { speed: 10 });
      const R = turnRadius(r.self.L, 1, r.mp.turnK, 1, 10);
      let flips = 0, lowNow = false;
      for (let i = 0; i < 60 * 30; i++) {
        tick(r, cruiseTo(R * 0.9, 0, 0.9, 8));
        const low = r.cmd.sail < 0.6;
        if (i > 0 && low !== lowNow) flips++;
        lowNow = low;
      }
      expect(flips).toBeLessThanOrEqual(6);
    }
  });
});

// ---------- 3. Küsten, Stege, Schiffe ----------

describe('Fühler: Küsten, Stege und Schiffe', () => {
  it('fünf Fühler bei 0°, ±22° und ±52°', () => {
    expect(STEER.rayAngles.map((a) => Math.round((a * 180) / Math.PI))).toEqual([0, 22, -22, 52, -52]);
    expect(createAiNav('x').rays).toHaveLength(5);
  });

  it('die Reichweite wächst mit Länge und Tempo und deckt den Wendekreis ab: so weit sieht der Mittelfühler eine Küste', () => {
    // Das Schiff steht fest bei (0, 0); eine Insel rückt Meter für Meter heran, bis der Mittelfühler sie sieht
    const detect = (tier: number, speed: number) => {
      for (let d = 900; d > 60; d -= 4) {
        const g = new IslandGround(); g.add(island(0, d, 100));
        const r = rig(tier, { ground: g, speed });
        r.self.speed = speed;
        r.st.cruise(r.nav, r.self, 0, 2000, 0.55, 60, null, DT, r.cmd);
        if (r.nav.rays[0] < 1) return d - 100;       // Abstand bis zur Küste
      }
      return 0;
    };
    expect(detect(6, 10)).toBeGreaterThan(detect(0, 10));
    expect(detect(3, 14)).toBeGreaterThan(detect(3, 4));
    // die Sicht reicht immer weiter als der Weg, den das Schiff zum Wegdrehen braucht (Wendekreis + halbe Länge)
    for (const tier of TIERS) for (const v of [4, 8, 12]) {
      const need = turnRadius(SHIP_CLASSES[tier].L, 1, 1, 1, v) + SHIP_CLASSES[tier].L * 0.5;
      expect(detect(tier, v), `Klasse ${tier}, ${v} m/s`).toBeGreaterThan(need);
    }
  });

  it('Insel liegt auf dem Weg zum Ziel: alle Klassen fahren drum herum, ohne Grundberührung, und kommen an', () => {
    for (const tier of TIERS) for (const offX of [-90, 0, 90]) {
      const g = new IslandGround(); g.add(island(0, 400, 160));
      const r = rig(tier, { x: offX, z: 0, ground: g });
      let contacts = 0, worst = 1e9, at = -1;
      for (let i = 0; i < 60 * 200 && at < 0; i++) {
        tick(r, cruiseTo(0, 900));
        if (g.pushShip(r.m.x, r.m.z, r.m.heading, r.self.L, r.self.W).hit) contacts++;
        worst = Math.min(worst, minContact(r));
        if (r.cmd.arrived) at = r.time;
      }
      expect(at, `Klasse ${tier}, Start x=${offX}`).toBeGreaterThan(0);
      expect(contacts).toBe(0);
      expect(worst).toBeGreaterThan(0);
    }
  });

  it('Küste voraus bei hoher Fahrt: die Fahrt wird rechtzeitig gedrosselt, bevor der Platz zum Wegdrehen fehlt', () => {
    for (const tier of [0, 3, 6]) {
      const g = new IslandGround(); g.add(island(0, 330, 200));
      const r = rig(tier, { ground: g, speed: 12 });
      r.sailSet.sailSet = 1;
      let minSail = 1, firstBrakeDist = -1, contacts = 0;
      for (let i = 0; i < 60 * 40; i++) {
        tick(r, cruiseTo(0, 1100, 1, 60));
        if (r.cmd.sail < 0.9 && firstBrakeDist < 0) firstBrakeDist = r.nav.hitDist;
        minSail = Math.min(minSail, r.cmd.sail);
        if (g.pushShip(r.m.x, r.m.z, r.m.heading, r.self.L, r.self.W).hit) contacts++;
      }
      expect(minSail).toBeLessThan(0.5);
      expect(contacts).toBe(0);
      // gebremst wird, solange noch mehr als ein Wendekreis Platz ist
      expect(firstBrakeDist).toBeGreaterThan(radiusAt(r.self, 6));
    }
  });

  it('Inselkette mit V-förmigen Buchten quer zum Weg, Ziel genau dahinter: keine Grundberührung (Ausweg aus der Sackgasse), und die Lenkung verlangt ein neues Ziel', () => {
    const g = new IslandGround();
    for (let k = 0; k < 6; k++) g.add(island(k * 300 - 750, 450, 170));   // überlappende Inseln: zwischen ihnen entstehen spitze Buchten
    for (const tier of [1, 4, 6]) {
      const r = rig(tier, { ground: g, x: 0, z: -100 });
      let contacts = 0, at = -1;
      for (let i = 0; i < 60 * 120 && at < 0; i++) {
        tick(r, cruiseTo(0, 1100));
        if (g.pushShip(r.m.x, r.m.z, r.m.heading, r.self.L, r.self.W).hit) contacts++;
        if (r.cmd.arrived) at = r.time;
      }
      expect(contacts, `Klasse ${tier}`).toBe(0);
      // Ankunft oder Neuplanung: entweder da, oder die Lenkung meldet, dass ein neues Ziel nötig ist
      expect(at > 0 || r.nav.replan).toBe(true);
    }
  });

  it('Hafensteg quer zum Kurs: die Hülle berührt ihn nie', () => {
    for (const tier of TIERS) {
      const g = new IslandGround();
      g.piers.push({ ax: -60, az: 260, bx: 60, bz: 260, hw: 2.4, y: 1.5 });
      const r = rig(tier, { ground: g, x: 0, z: 0 });
      let closest = 1e9;
      for (let i = 0; i < 60 * 60; i++) {
        tick(r, cruiseTo(0, 700, 0.55, 60));
        closest = Math.min(closest, distToSegment(r.m.x, r.m.z, -60, 260, 60, 260) - 2.4 - r.self.W / 2);
      }
      expect(closest, `Klasse ${tier}`).toBeGreaterThan(0);
    }
  });

  it('Schiff kreuzt den Kurs: Ausweichen ohne Rumpfberührung', () => {
    for (const tier of [1, 3, 5]) {
      const r = rig(tier, { x: 0, z: 0, heading: 0 });
      const rad = SHIP_CLASSES[3].L * 0.32;
      r.others.push({ id: 'fremd', x: -140, z: 240, vx: 7, vz: 0, r: rad });
      let closest = 1e9;
      for (let i = 0; i < 60 * 50; i++) {
        tick(r, cruiseTo(0, 700, 0.55, 60));
        closest = Math.min(closest, Math.hypot(r.m.x - r.others[0].x, r.m.z - r.others[0].z));
      }
      expect(closest, `Klasse ${tier}`).toBeGreaterThan(rad + r.self.W / 2);
    }
  });

  it('Weltrand: wer darauf zufährt, wendet vor der Grenze', () => {
    for (const tier of [0, 3, 6]) {
      const r = rig(tier, { x: WORLD_R - 600, z: 0, heading: Math.PI / 2, speed: 10 });
      let far = 0;
      for (let i = 0; i < 60 * 80; i++) { tick(r, cruiseTo(WORLD_R + 800, 0)); far = Math.max(far, Math.hypot(r.m.x, r.m.z)); }
      expect(far, `Klasse ${tier}`).toBeLessThan(WORLD_R - STEER.edge + 20);
    }
  });

  it('bei Gleichstand wählt das Ausweichen die Seite des Ziels und bleibt dabei (kein Hin und Her)', () => {
    const g = new IslandGround(); g.add(island(0, 300, 150));
    const r = rig(3, { ground: g, speed: 10 });
    let signChanges = 0, last = 0;
    for (let i = 0; i < 60 * 25; i++) {
      tick(r, cruiseTo(150, 800, 0.55, 60));
      if (r.nav.avoidSide !== 0) { if (last !== 0 && r.nav.avoidSide !== last) signChanges++; last = r.nav.avoidSide; }
    }
    expect(signChanges).toBe(0);
  });

  it('reachableGoal: ein Ziel hinter einer Insel wird auf freie Strecke gedreht; freie Ziele bleiben unverändert', () => {
    const g = new IslandGround(); g.add(island(0, 300, 150));
    const r = rig(3, { ground: g, x: 0, z: 0 });
    const out = { x: 0, z: 0 };
    r.self.x = 0; r.self.z = 0;
    expect(r.st.reachableGoal(r.self, 300, 100, out)).toBe(true);
    expect(out).toEqual({ x: 300, z: 100 });
    expect(r.st.reachableGoal(r.self, 0, 700, out)).toBe(false);
    expect(r.st.pathClear(r.self, out.x, out.z)).toBe(true);
    expect(Math.hypot(out.x, out.z)).toBeGreaterThan(79);
  });
});

// ---------- 4. Zustandsmaschine ----------

interface FightLog { states: { t: number; s: AiManeuver }[]; dwell: number[]; flips: number; /** Ruderwechsel binnen 1,5 s nach dem vorigen: Flattern */ chatter: number; dist: number[]; rig: Rig }

/** Gefecht gegen ein Ziel, das geradeaus fährt (Tempo `tv`, Kurs `th`); Aufzeichnung der Zustände, Haltezeiten und Ruderwechsel */
function fight(tier: number, o: { hullTier?: number; seconds?: number; tv?: number; th?: number; tx?: number; tz?: number; self?: Partial<SteerSelf>; start?: RigOpts; beforeTick?: (r: Rig, t: number) => void } = {}): FightLog {
  const r = rig(tier, { hullTier: o.hullTier, speed: 8, heading: 0.3, ...o.start });
  Object.assign(r.self, o.self);
  Object.assign(r.tgt, { id: 'ziel', x: o.tx ?? 40, z: o.tz ?? 380, heading: o.th ?? 1.2, speed: o.tv ?? 0 });
  r.sailSet.sailSet = 0.7;
  const log: FightLog = { states: [], dwell: [], flips: 0, chatter: 0, dist: [], rig: r };
  let last: AiManeuver | '' = '', since = 0, lastSign = 0, lastFlip = -99;
  for (let i = 0; i < 60 * (o.seconds ?? 150); i++) {
    o.beforeTick?.(r, r.time);
    r.tgt.x += Math.sin(r.tgt.heading) * r.tgt.speed * DT; r.tgt.z += Math.cos(r.tgt.heading) * r.tgt.speed * DT;
    r.others = [{ id: 'ziel', x: r.tgt.x, z: r.tgt.z, vx: Math.sin(r.tgt.heading) * r.tgt.speed, vz: Math.cos(r.tgt.heading) * r.tgt.speed, r: SHIP_CLASSES[tier].L * 0.32 }];
    tick(r, () => r.st.fight(r.nav, r.self, r.tgt, DT, r.cmd));
    if (r.cmd.state !== last) { if (last) log.dwell.push(r.time - since); log.states.push({ t: r.time, s: r.cmd.state }); last = r.cmd.state; since = r.time; }
    const sg = Math.abs(r.cmd.turn) > 0.35 ? Math.sign(r.cmd.turn) : 0;
    if (sg !== 0) { if (lastSign !== 0 && sg !== lastSign) { log.flips++; if (r.time - lastFlip < 1.5) log.chatter++; lastFlip = r.time; } lastSign = sg; }
    log.dist.push(Math.hypot(r.tgt.x - r.m.x, r.tgt.z - r.m.z));
  }
  return log;
}
const visited = (l: FightLog) => new Set(l.states.map((x) => x.s));

describe('Seekampf-Zustandsmaschine', () => {
  it('Gefechtsabstand je Klasse: 65 m (Schaluppe) bis 130 m (Leviathan), Schussweite etwas darüber', () => {
    expect(standoffOf(0)).toBe(65);
    expect(standoffOf(6)).toBe(130);
    for (let t = 1; t < 7; t++) expect(standoffOf(t)).toBeGreaterThan(standoffOf(t - 1));
    for (const t of TIERS) { expect(fireRangeOf(t)).toBeGreaterThan(standoffOf(t)); expect(standoffOf(t)).toBeGreaterThanOrEqual(65); expect(standoffOf(t)).toBeLessThanOrEqual(130); }
  });

  it('Anmarsch, dann Umkreisen: der Abstand pendelt sich auf den Gefechtsabstand ein (stehendes und fahrendes Ziel)', () => {
    for (const tv of [0, 6]) for (const tier of TIERS) {
      const l = fight(tier, { tv, hullTier: 3 });
      expect(l.states[0].s).toBe('APPROACH');
      expect(visited(l).has('BROADSIDE_ORBIT')).toBe(true);
      expect(visited(l).has('RAM_CHARGE')).toBe(false);
      const od = standoffOf(tier);
      const late = l.dist.slice(60 * 50);
      expect(Math.min(...late), `Klasse ${tier}, Ziel ${tv} m/s`).toBeGreaterThan(od * 0.7);
      expect(Math.max(...late), `Klasse ${tier}, Ziel ${tv} m/s`).toBeLessThan(od * 1.5);
    }
  });

  it('Parallelkurs: gegen ein fahrendes Ziel zeigt der Bug nach einer Weile (fast) in oder gegen dessen Fahrtrichtung', () => {
    for (const tier of [1, 3, 5]) {
      const l = fight(tier, { tv: 6, th: 1.2, hullTier: 3, seconds: 120 });
      const r = l.rig;
      const d = Math.abs(wrapAngle(r.m.heading - r.tgt.heading));
      expect(Math.min(d, Math.PI - d)).toBeLessThan(0.75);
    }
  });

  it('Mindest-Haltezeit: jedes Manöver wird 4 bis 6 s gehalten, und es gibt kein hektisches Ruderwechseln', () => {
    for (const tier of TIERS) for (const tv of [0, 6]) {
      // mit Rammsporn (Anlauf, Kehrtwenden) und ohne (reines Umkreisen)
      const ramm = fight(tier, { tv, hullTier: 4 });
      const plain = fight(tier, { tv, hullTier: 3 });
      // abgeschlossene Manöver (alle außer dem letzten): nie kürzer als 4 s
      for (const d of [...ramm.dwell, ...plain.dwell]) expect(d).toBeGreaterThanOrEqual(STEER.lockMin - 0.02);
      expect(plain.flips, `Klasse ${tier}, Ziel ${tv} m/s`).toBeLessThanOrEqual(4);
      expect(ramm.chatter, `Klasse ${tier}, Ziel ${tv} m/s, Rammsporn`).toBeLessThanOrEqual(1);
      expect(plain.chatter, `Klasse ${tier}, Ziel ${tv} m/s`).toBe(0);
    }
  });

  it('die Haltezeit liegt je Wechsel zwischen 4 und 6 s, deterministisch aus Schiffs-Seed und Zähler', () => {
    const seen = new Set<number>();
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const r = rig(2, { id });
      r.tgt.id = 'ziel'; r.tgt.x = 0; r.tgt.z = 500;
      tick(r, () => r.st.fight(r.nav, r.self, r.tgt, DT, r.cmd));
      expect(r.nav.stateLockTimer).toBeGreaterThanOrEqual(STEER.lockMin - DT);
      expect(r.nav.stateLockTimer).toBeLessThanOrEqual(STEER.lockMax);
      seen.add(Math.round(r.nav.stateLockTimer * 100));
    }
    expect(seen.size).toBeGreaterThan(3);
    for (let n = 0; n < 50; n++) { const h = hash01(12345, n); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1); expect(hash01(12345, n)).toBe(h); }
  });

  it('Seitenwechsel nur, wenn die eigene Seite noch lange nachlädt und die andere feuerbereit ist', () => {
    const probe = (rl: number, rr: number, side: 1 | -1) => {
      const r = rig(3, { speed: 9, heading: 0 });
      const od = standoffOf(3);
      Object.assign(r.tgt, { id: 'ziel', x: -od * (side > 0 ? -1 : 1), z: 0, heading: 0, speed: 0 });
      // Ziel steht seitlich auf der Seite `side`: rechts von Bug 0 ist −x, links +x
      r.tgt.x = side > 0 ? od : -od;
      r.nav.aiState = 'BROADSIDE_ORBIT'; r.nav.side = side; r.nav.stateLockTimer = 0; r.nav.sideT = 99; r.nav.started = true;
      r.self.reloadL = rl; r.self.reloadR = rr;
      r.st.clearObstacles();
      // einen einzelnen Entscheidungsschritt ohne Zeitablauf (dt winzig, damit die Nachladezeiten gleich bleiben)
      r.st.fight(r.nav, r.self, r.tgt, 1e-4, r.cmd);
      return r.nav.side;
    };
    expect(probe(5, 0, 1)).toBe(-1);       // links lädt noch 5 s, rechts bereit → wechseln
    expect(probe(0, 5, -1)).toBe(1);       // umgekehrt
    expect(probe(0, 0, 1)).toBe(1);        // beide bereit → bleiben
    expect(probe(5, 5, 1)).toBe(1);        // beide laden → bleiben
    expect(probe(1, 0, 1)).toBe(1);        // eigene Seite fast fertig → bleiben
    expect(probe(5, 1, 1)).toBe(1);        // andere noch nicht bereit → bleiben
  });

  it('Rückzug: unter 22 % Rumpf oder Segel dreht das Schiff sofort ab, auch innerhalb der Haltezeit, und nutzt das ganze verbleibende Tuch', () => {
    for (const [hull, sail] of [[0.2, 1], [1, 0.2], [0.1, 0.1]] as const) for (const tier of [0, 3, 6]) {
      const l = fight(tier, { tv: 0, tx: 0, tz: 150, seconds: 30, start: { heading: 0, speed: 8 }, self: { hullFrac: hull, sailFrac: sail } });
      const r = l.rig;
      expect(l.states[0].s).toBe('DISENGAGE');
      expect(l.states.every((x) => x.s === 'DISENGAGE')).toBe(true);
      // Kehrtwende (Wendekreis bis 45 m), danach wächst der Abstand stetig: nach 30 s deutlich weiter weg, in den letzten 10 s um mindestens 80 m
      const n = l.dist.length;
      expect(l.dist[n - 1], `Klasse ${tier}, Rumpf ${hull}, Segel ${sail}`).toBeGreaterThan(l.dist[0] + 90);
      expect(l.dist[n - 1] - l.dist[n - 600], `Klasse ${tier}, Rumpf ${hull}, Segel ${sail}`).toBeGreaterThan(80);
      expect(r.cmd.sail).toBeGreaterThan(0.95);
    }
    // aus dem Anmarsch heraus, mitten in der Haltezeit
    const l = fight(3, { tv: 0, seconds: 40, beforeTick: (r, t) => { if (t > 6 && t < 6.05) { r.self.hullFrac = 0.15; r.nav.stateLockTimer = 5; } } });
    const dis = l.states.find((x) => x.s === 'DISENGAGE');
    expect(dis).toBeDefined();
    expect(dis!.t).toBeLessThan(6.2);
  });

  it('Rückzug wird erst nach Erholung (≥ 30 %) und abgelaufener Haltezeit beendet; mutige Schiffe fliehen nie', () => {
    const healed = fight(3, { tv: 0, seconds: 60, beforeTick: (r, t) => { r.self.hullFrac = t < 10 ? 0.15 : t < 20 ? 0.26 : 0.5; } });
    const dis = healed.states.filter((x) => x.s === 'DISENGAGE');
    expect(dis.length).toBeGreaterThan(0);
    const out = healed.states.find((x, i) => i > 0 && x.s !== 'DISENGAGE' && healed.states[i - 1].s === 'DISENGAGE');
    expect(out).toBeDefined();
    expect(out!.t).toBeGreaterThan(20);                     // bei 26 % noch kein Wiederangriff
    const brave = fight(3, { tv: 0, seconds: 30, self: { hullFrac: 0.1, sailFrac: 0.1, brave: true } });
    expect(visited(brave).has('DISENGAGE')).toBe(false);
    const flee = fight(3, { tv: 0, seconds: 20, self: { flee: true } });
    expect(visited(flee).has('DISENGAGE')).toBe(true);
  });

  it('nach dem Rückzug-Befehl läuft ohne Ziel (cruise) die Flucht noch ihre Haltezeit weiter, dann beginnt die Fahrt', () => {
    const l = fight(2, { tv: 0, seconds: 8, self: { flee: true } });
    const r = l.rig;
    expect(r.nav.aiState).toBe('DISENGAGE');
    const course = r.nav.desiredCourse;
    r.self.flee = false;
    let t0 = 0;
    for (let i = 0; i < 60 * 8; i++) {
      tick(r, cruiseTo(0, -900));
      if (r.cmd.state === 'TRANSIT') { t0 = r.time; break; }
    }
    expect(t0).toBeGreaterThan(0);
    expect(Number.isFinite(course)).toBe(true);
  });
});

// ---------- 5. Rammangriff ----------

describe('RAM_CHARGE nur mit Rammsporn (Rumpf-Stufe ≥ 4)', () => {
  /** Ein Schiff, das mit hoher Fahrt auf ein Ziel zuhält: ideale Voraussetzungen für einen Rammstoß */
  function ideal(hullTier: number) {
    const r = rig(3, { hullTier, speed: 12, heading: 0 });
    r.self.speed = 12;
    Object.assign(r.tgt, { id: 'ziel', x: 4, z: 110, heading: 0.5, speed: 2, mass: r.self.mass });
    return r;
  }

  it('Fenster: nur Rumpf-Stufe 4 und 5 dürfen rammen, wenn sonst alles stimmt', () => {
    for (const ht of [1, 2, 3, 4, 5]) {
      const r = ideal(ht);
      expect(ramWindow(r.self, r.tgt, 0, ENV), `Stufe ${ht}`).toBe(ht >= RAM_MIN_TIER);
    }
    expect(RAM_MIN_TIER).toBe(4);
  });

  it('jede einzelne Bedingung zählt: Rumpf, Winkel, Fahrt, Pause, Masse, Reichweite, kampfunfähig, kein Ramm-Recht, Wendekreis', () => {
    const base = ideal(4);
    expect(ramWindow(base.self, base.tgt, 0, ENV)).toBe(true);
    const bad = (mut: (r: Rig) => void, cooldown = 0) => { const r = ideal(4); mut(r); return ramWindow(r.self, r.tgt, cooldown, ENV); };
    expect(bad((r) => { r.self.hullFrac = 0.3; })).toBe(false);                                            // zu wenig Rumpf
    expect(bad((r) => { r.tgt.x = 120; r.tgt.z = 100; })).toBe(false);                                     // Bugwinkel > 35°
    expect(bad((r) => { r.self.speed = 3; })).toBe(false);                                                 // zu langsam
    expect(bad(() => undefined, 5)).toBe(false);                                                           // Pause läuft
    expect(bad((r) => { r.tgt.mass = r.self.mass * 5; })).toBe(false);                                     // Ziel viel zu schwer
    expect(bad((r) => { r.tgt.z = 400; })).toBe(false);                                                    // zu weit
    expect(bad((r) => { r.tgt.disabled = true; })).toBe(false);                                            // kampfunfähig
    expect(bad((r) => { r.self.canRam = false; })).toBe(false);                                            // Stoß wird nicht gewertet (KI gegen KI)
    expect(bad((r) => { r.tgt.x = 10; r.tgt.z = 14; r.tgt.speed = 0; r.self.speed = 12; })).toBe(false);  // Ziel liegt im Wendekreis
  });

  it('im Gefecht löst nur ein Schiff mit Rumpf-Stufe ≥ 4 RAM_CHARGE aus (alle Klassen, stehendes Ziel voraus)', () => {
    for (const tier of TIERS) for (const ht of [1, 2, 3, 4, 5]) {
      const l = fight(tier, { hullTier: ht, tv: 0, tx: 0, tz: 420, start: { heading: 0, speed: 8 }, seconds: 80 });
      expect(visited(l).has('RAM_CHARGE'), `Klasse ${tier}, Rumpf ${ht}`).toBe(ht >= RAM_MIN_TIER);
    }
  });

  it('aus dem Umkreisen heraus nimmt ein Schiff mit Rammsporn Anlauf (Ziel steht quer), eines ohne bleibt beim Umkreisen', () => {
    for (const tier of [0, 3, 6]) {
      const mit = fight(tier, { hullTier: 4, tv: 0, tx: 0, tz: 160, start: { heading: 0, speed: 8 }, seconds: 90 });
      const ohne = fight(tier, { hullTier: 3, tv: 0, tx: 0, tz: 160, start: { heading: 0, speed: 8 }, seconds: 90 });
      expect(visited(ohne).has('RAM_CHARGE'), `Klasse ${tier} ohne Sporn`).toBe(false);
      // ohne Sporn: nach dem Anmarsch nur noch Umkreisen (kein Anlauf, kein Zustandswechsel mehr)
      expect(ohne.states.filter((x) => x.s === 'APPROACH').length).toBeLessThanOrEqual(1);
      // mit Sporn: Anlauf (APPROACH aus dem Umkreisen) und mindestens ein Rammangriff, aber nie öfter als die Pause erlaubt
      const runs = mit.states.filter((x) => x.s === 'RAM_CHARGE');
      expect(runs.length, `Klasse ${tier} mit Sporn`).toBeGreaterThanOrEqual(1);
      for (let i = 1; i < runs.length; i++) expect(runs[i].t - runs[i - 1].t).toBeGreaterThanOrEqual(STEER.ramRetry * 0.5);
    }
  });

  it('RAM_CHARGE läuft auf den Abfangpunkt, mit vollem Segel, und endet nach dem Stoß (noteRam) sofort ins Umkreisen', () => {
    const l = fight(3, { hullTier: 5, tv: 0, tx: 0, tz: 420, start: { heading: 0, speed: 8 }, seconds: 40, beforeTick: (r) => {
      if (r.cmd.state === 'RAM_CHARGE' && !r.nav.rammed && Math.hypot(r.tgt.x - r.m.x, r.tgt.z - r.m.z) < 40) noteRam(r.nav);
    } });
    const ram = l.states.find((x) => x.s === 'RAM_CHARGE');
    expect(ram).toBeDefined();
    const after = l.states.find((x) => x.t > ram!.t && x.s !== 'RAM_CHARGE');
    expect(after?.s).toBe('BROADSIDE_ORBIT');
    expect(l.rig.nav.ramCooldown).toBeGreaterThan(0);
    // kein zweiter Anlauf innerhalb der Pause
    expect(l.states.filter((x) => x.s === 'RAM_CHARGE').length).toBe(1);
  });

  it('Rückzug hat Vorrang vor dem Anlauf', () => {
    const l = fight(3, { hullTier: 5, tv: 0, tx: 0, tz: 420, start: { heading: 0, speed: 8 }, seconds: 40, self: { hullFrac: 0.2 } });
    expect(visited(l).has('RAM_CHARGE')).toBe(false);
    expect(visited(l).has('DISENGAGE')).toBe(true);
  });
});

// ---------- 6. Abfangkurs mit Wind ----------

describe('Abfangkurs unter Berücksichtigung von Wind und Fahrt', () => {
  const ic = (): Point => ({ x: 0, z: 0, t: 0 });

  it('der Abfangpunkt liegt auf der Bahn des Ziels und wird zur berechneten Zeit erreicht', () => {
    for (const tier of [0, 3, 6]) {
      const r = rig(tier, { speed: 10, heading: 0 });
      r.self.speed = 10;
      Object.assign(r.tgt, { x: 300, z: 200, heading: -2.4, speed: 7 });
      const p = interceptPoint(r.self, r.tgt, ENV, ic());
      const onTrack = Math.hypot(p.x - (r.tgt.x + Math.sin(r.tgt.heading) * r.tgt.speed * p.t), p.z - (r.tgt.z + Math.cos(r.tgt.heading) * r.tgt.speed * p.t));
      expect(onTrack).toBeLessThan(1e-6);
      const dist = Math.hypot(p.x - r.self.x, p.z - r.self.z);
      // Fahrt für den Weg: zwischen aktuellem Tempo und Höchsttempo (Mischung 60 %)
      const vTop = Math.min(r.self.vFull * windSpeedK(Math.atan2(p.x - r.self.x, p.z - r.self.z), ENV.windDir, ENV.windStrength, r.self.upwindK), r.self.speedCap);
      const v = 10 * 0.4 + vTop * 0.6;
      expect(dist / v).toBeCloseTo(p.t, 0);
    }
  });

  it('Rückenwind erreicht ein Ziel schneller als Gegenwind bei gleicher Entfernung', () => {
    const r = rig(3, { speed: 10 });
    r.self.vFull = 14; r.self.speedCap = 99;             // Deckel weg, damit der Wind zählt
    Object.assign(r.tgt, { x: 0, z: 0, speed: 0 });
    const down: SteerEnv = { windDir: 0, windStrength: 0.8 };         // Wind weht nach +z: Ziel in +z liegt im Rückenwind
    r.tgt.z = 150;
    const tDown = interceptPoint(r.self, r.tgt, down, ic()).t;
    r.tgt.z = -150;
    const tUp = interceptPoint(r.self, r.tgt, down, ic()).t;
    expect(tDown).toBeLessThan(tUp);
    // ein Ziel, das wegläuft, schneller als wir fahren können: kein Abfang, aber ein endlicher, begrenzter Wert
    r.tgt.z = 400; r.tgt.heading = 0; r.tgt.speed = 40;
    const far = interceptPoint(r.self, r.tgt, down, ic());
    expect(Number.isFinite(far.x) && Number.isFinite(far.z)).toBe(true);
    expect(far.t).toBeLessThanOrEqual(25);
  });
});

// ---------- 7. Zustand, Determinismus, Leistung ----------

describe('Zustand: serialisierbar, deterministisch, ohne Zuweisungen', () => {
  it('AiNavState übersteht JSON verlustfrei (kein NaN, keine Verweise) – auch nach langem Gefecht', () => {
    const l = fight(4, { hullTier: 4, tv: 5, seconds: 120 });
    const nav = l.rig.nav;
    const copy = JSON.parse(JSON.stringify(nav)) as AiNavState;
    expect(copy).toEqual(nav);
    for (const v of Object.values(nav)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    expect(typeof nav.targetShipId === 'string' || nav.targetShipId === null).toBe(true);
    expect(['TRANSIT', 'APPROACH', 'BROADSIDE_ORBIT', 'RAM_CHARGE', 'DISENGAGE']).toContain(nav.aiState);
    expect(nav.desiredSailFrac).toBeGreaterThanOrEqual(0);
    expect(nav.desiredSailFrac).toBeLessThanOrEqual(1);
    expect(Number.isFinite(nav.desiredCourse)).toBe(true);
    expect(nav.targetShipId).toBe('ziel');
  });

  it('gleiche Eingabe, gleiche Fahrt: zwei Läufe stimmen bit-genau überein', () => {
    const run = () => {
      const g = new IslandGround(); g.add(island(0, 350, 150));
      const r = rig(4, { ground: g, id: 'det' });
      for (let i = 0; i < 60 * 60; i++) tick(r, cruiseTo(0, 800));
      const l = fight(5, { hullTier: 5, tv: 4, seconds: 60 });
      return [r.m.x, r.m.z, r.m.heading, r.nav.desiredCourse, l.rig.m.x, l.rig.m.z, l.rig.m.heading, l.states.map((s) => s.s + s.t.toFixed(3)).join()];
    };
    expect(run()).toEqual(run());
  });

  it('die Wahl der Zustände hängt am Schiffs-Seed: andere Kennung, andere (aber feste) Haltezeit', () => {
    const lock = (id: string) => { const n = createAiNav(id); return STEER.lockMin + (STEER.lockMax - STEER.lockMin) * hash01(n.seed, n.seq); };
    expect(lock('alpha')).toBe(lock('alpha'));
    expect(lock('alpha')).not.toBe(lock('beta'));
  });

  it('keine Zuweisungen je Schritt: Arbeitslisten und Ausgabe behalten ihre Identität', () => {
    const g = new IslandGround(); g.add(island(0, 350, 150));
    const r = rig(3, { ground: g });
    const rays = r.nav.rays, cmd = r.cmd;
    for (let i = 0; i < 600; i++) tick(r, cruiseTo(0, 800));
    expect(r.nav.rays).toBe(rays);
    expect(r.cmd).toBe(cmd);
  });

  it('Quelltext: reine Datei ohne three.js, Zufall und neue Vektoren; Seewelt hat die alte Lenkung nicht mehr', () => {
    const src = readFileSync('src/naval/shipSteering.ts', 'utf8');
    const motion = readFileSync('src/naval/shipMotion.ts', 'utf8');
    for (const raw of [src, motion]) {
      const s = stripComments(raw);
      expect(s).not.toMatch(/from 'three'/);
      expect(s).not.toMatch(/Math\.random/);
      expect(s).not.toMatch(/new (Vector[234]|Matrix[34]|Quaternion|Euler|Color)\b/);
    }
    const naval = readFileSync('src/naval/naval.ts', 'utf8');
    expect(naval).not.toMatch(/const steerTo = /);
    expect(naval).not.toMatch(/e\.orbit|e\.reload\b/);
    expect(naval).toMatch(/this\.steering\.fight\(/);
    expect(naval).toMatch(/this\.steering\.cruise\(/);
    expect(naval).toMatch(/noteRam\(rammer\.nav\)/);
    // Ship.steer benutzt die gemeinsame Physik
    const ship = readFileSync('src/entities/ship/ship.ts', 'utf8');
    expect(ship).toMatch(/stepMotion\(/);
    expect(ship).toMatch(/windSpeedK\(/);
  });
});
