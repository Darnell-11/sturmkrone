import { describe, expect, it } from 'vitest';
import { SHIP_CLASSES } from '../src/data/ships';
import {
  BRIDGE_CLEARANCE, DOCK_MAX_ANGLE, mooringGap, DOCK_MAX_SPEED, MAX_BRIDGE_DEG, PLANK_MAX_DH, berthPose, berthSeparation, berthsFor, boardGap, bowDir, bridgeTypeFor, deckGate, freeOf, frameHeight, lineAngle,
  makeRoute, minRun, overhang, pickBerth, pierAxes, pierCoords, pierPoint, planGangway, planPlank, plankCount, planPull, pullPose, routeDone, setFrame, slopeDeg, stepRoute, type BridgeDef, type PierLine,
} from '../src/world/docking';
import { CompositeGround, DeckGround, IslandGround, type Pier } from '../src/world/islandGround';
import type { BufferGeometry as Geo } from 'three';

// ---------- Messwerte aus docs/DOCKING_BOARDING_PLAN.md (Deckshöhe über dem Rumpfursprung; die Wasserlinie liegt 0,25 m tiefer) ----------
const DECK_Y = [2.15, 2.15, 2.46, 3.82, 4.28, 6.2, 7.17];
const deckWorld = (tier: number) => DECK_Y[tier] - 0.25;

/** Hafensteg Ankerglück (46 m, hw 2,4, y 1,65) und Außenposten-Steg (32 m, hw 1,5, y 1,45) wie in seaWorld */
const TOWN_PIER: PierLine = { id: 'pier-town', ax: 0, az: 0, bx: 0, bz: -46, hw: 2.4, y: 1.65 };
const OUTPOST_PIER: PierLine = { id: 'pier-outpost', ax: 100, az: 100, bx: 100 + 32, bz: 100, hw: 1.5, y: 1.45 };
const VILLAGE_PIER: PierLine = { id: 'pier-village', ax: -50, az: 20, bx: -50 + 15.5, bz: 20 + 15.5, hw: 1.5, y: 1.45 };
const PIERS = [TOWN_PIER, OUTPOST_PIER, VILLAGE_PIER];

/** Schiff-Attrappe für DeckGround: einfacher Rumpf (halbe Breite W/2), Matrix = Einheit mit Hubhöhe `heave` */
function fakeShip(id: string, tier: number, x: number, z: number, heading: number) {
  const cls = SHIP_CLASSES[tier];
  const m = new Array(16).fill(0); m[0] = m[5] = m[10] = m[15] = 1;
  const ship = {
    entityId: id, x, z, heading, cls: { L: cls.L },
    model: {
      deckY: DECK_Y[tier],
      group: { position: { y: 0 }, matrixWorld: { elements: m }, updateMatrixWorld() { /* Einheitsmatrix */ } },
      halfWidth: () => cls.W / 2,
      blockers: [] as { cx: number; cz: number; hx: number; hz: number }[],
    },
  };
  // Wasserlinie 0,25 m unter dem Rumpfursprung: Ruhelage y = −0,25
  m[13] = -0.25;
  return { ship, m, cls };
}

describe('Liegeplätze: Abstand, Ausrichtung und Überhang', () => {
  it('Achsabstand = halbe Stegbreite + halbe Schiffsbreite + 0,35 m', () => {
    for (const p of PIERS) for (const c of SHIP_CLASSES) {
      const a = pierAxes(p);
      for (const side of [1, -1] as const) {
        const pose = berthPose(p, side, a.len / 2, 1, c.W);
        const q = pierCoords(p, pose.x, pose.z);
        expect(Math.abs(q.l)).toBeCloseTo(p.hw + c.W / 2 + mooringGap(c.W), 6);
        expect(Math.sign(q.l)).toBe(side);
        expect(q.u).toBeCloseTo(a.len / 2, 6);
        expect(berthSeparation(p.hw, c.W)).toBeCloseTo(Math.abs(q.l), 6);
      }
    }
  });

  it('das Schiff liegt parallel zum Steg (Bug in Stegrichtung oder dagegen)', () => {
    for (const p of PIERS) {
      const a = pierAxes(p);
      for (const dir of [1, -1] as const) {
        const pose = berthPose(p, 1, a.len / 2, dir, 10);
        expect(lineAngle(pose.heading, Math.atan2(a.ux, a.uz))).toBeLessThan(1e-9);
        expect(bowDir(p, pose.heading)).toBe(dir);
      }
    }
  });

  it('Überhang-Regel: Linienschiff (58 m) und Leviathan (74 m) liegen am 32-m-Außenposten-Steg, Bug und Heck stehen frei über', () => {
    const len = pierAxes(OUTPOST_PIER).len;
    expect(len).toBeCloseTo(32, 6);
    for (const tier of [5, 6]) {
      const c = SHIP_CLASSES[tier];
      expect(c.L).toBeGreaterThan(len);
      // Fahrt langsam und fast parallel nahe dem Liegeplatz: der Liegeplatz wird trotzdem angeboten (nicht L <= Steglänge prüfen)
      const side = berthsFor(OUTPOST_PIER, c.W, 1)[0];
      const b = pickBerth(OUTPOST_PIER, { x: side.x + 4, z: side.z + 5, heading: Math.atan2(1, 0) + 0.2, speed: 1.2, L: c.L, W: c.W });
      expect(b).not.toBeNull();
      const o = overhang(len, c.L, b!.u);
      expect(o.bow).toBeGreaterThan(0);
      expect(o.stern).toBeGreaterThan(0);
      // symmetrisch über dem Gangway-Punkt (Stegmitte)
      expect(Math.abs(o.bow - o.stern)).toBeLessThan(1e-6);
      expect(o.bow).toBeCloseTo(c.L / 2 - len / 2, 6);
    }
    // kleine Schiffe liegen innerhalb
    expect(overhang(len, SHIP_CLASSES[0].L, len / 2)).toEqual({ bow: 0, stern: 0 });
  });

  it('Anlegen wird nur bei Tempo < 2,5 m/s und Winkel < 25° angeboten', () => {
    const c = SHIP_CLASSES[3];
    const base = berthsFor(TOWN_PIER, c.W, -1)[0];
    const ok = { x: base.x, z: base.z + 6, heading: base.heading, speed: 1.0, L: c.L, W: c.W };
    expect(pickBerth(TOWN_PIER, ok)).not.toBeNull();
    expect(pickBerth(TOWN_PIER, { ...ok, speed: DOCK_MAX_SPEED + 0.2 })).toBeNull();
    expect(pickBerth(TOWN_PIER, { ...ok, heading: base.heading + DOCK_MAX_ANGLE + 0.05 })).toBeNull();
    expect(pickBerth(TOWN_PIER, { ...ok, heading: base.heading + DOCK_MAX_ANGLE - 0.05 })).not.toBeNull();
    // zu weit seitlich: kein Angebot
    expect(pickBerth(TOWN_PIER, { ...ok, x: base.x + 80 })).toBeNull();
  });
});

describe('Gangway: Höhe und Steigung', () => {
  for (const [name, pier] of [['Hafensteg', TOWN_PIER], ['Außenposten', OUTPOST_PIER], ['Dorfsteg', VILLAGE_PIER]] as const) {
    it(`alle sieben Klassen am ${name}: Steigung unter ${MAX_BRIDGE_DEG}°, Fuß auf den Bohlen, Länge passt zum Höhenunterschied`, () => {
      const len = pierAxes(pier).len;
      SHIP_CLASSES.forEach((c, tier) => {
        for (const side of [1, -1] as const) {
          const plan = planGangway({ pierHw: pier.hw, pierY: pier.y, pierLen: len, side, shipHalfW: c.W / 2 * 0.85 - 0.35, inset: 0.5, deckY: deckWorld(tier), uTop: len / 2, shipW: c.W });
          expect(plan.deg).toBeLessThan(MAX_BRIDGE_DEG);
          expect(plan.footU).toBeGreaterThanOrEqual(0.8 - 1e-9);
          expect(plan.footU).toBeLessThanOrEqual(len - 0.8 + 1e-9);
          expect(Math.abs(plan.footL)).toBeLessThan(pier.hw);
          // Länge im Raum = Hypotenuse aus Grundriss und Höhe; mindestens so lang, wie die Neigung es verlangt
          expect(plan.length).toBeCloseTo(Math.hypot(plan.run, plan.dh), 6);
          if (Math.abs(plan.dh) > 1) expect(plan.run).toBeGreaterThanOrEqual(minRun(plan.dh) - 1e-6);
          expect(plan.dh).toBeCloseTo(deckWorld(tier) - pier.y, 6);
        }
      });
    });
  }

  it('Höhenunterschiede: Schaluppe ≈ 0,45 m … Leviathan ≈ 5,3 m (Steghöhe 1,45–1,65 m)', () => {
    expect(deckWorld(0) - 1.65).toBeLessThan(0.5);
    expect(deckWorld(6) - 1.45).toBeGreaterThan(5.3);
    // das größte Schiff braucht die längste Gangway
    const len = 32;
    const lens = SHIP_CLASSES.map((c, t) => planGangway({ pierHw: 1.5, pierY: 1.45, pierLen: len, side: 1, shipHalfW: c.W / 2 * 0.85 - 0.35, inset: 0.5, deckY: deckWorld(t), uTop: len / 2, shipW: c.W }).length);
    expect(lens[6]).toBeGreaterThan(lens[3]);
    expect(lens[3]).toBeGreaterThan(lens[0]);
  });
});

describe('Enterplanken und Leitern', () => {
  it('Planke: Neigung bleibt unter dem Limit, auch wenn der Spalt zu kurz ist (Enden rücken nach innen)', () => {
    // Schaluppe ↔ Fregatte: Δh ≈ 1,67 m bei nur ≈ 1,5 m Grundriss
    const dh = deckWorld(3) - deckWorld(0);
    expect(dh).toBeLessThanOrEqual(PLANK_MAX_DH);
    const natural = 0.6 + 2 * 0.15 * (SHIP_CLASSES[0].W / 2);
    const plan = planPlank(dh, natural);
    expect(plan.deg).toBeLessThan(MAX_BRIDGE_DEG);
    expect(plan.extend).toBeGreaterThan(0);
    expect(plan.run).toBeCloseTo(natural + 2 * plan.extend, 6);
    for (const dh2 of [0, 0.5, 1.2, PLANK_MAX_DH]) expect(planPlank(dh2, 1.5).deg).toBeLessThan(MAX_BRIDGE_DEG);
  });

  it('Brückenart: bis 1,8 m Planken, darüber Leitern; Anzahl 2 (kleine) oder 3 (ab 30 m)', () => {
    expect(bridgeTypeFor(1.8)).toBe('planks');
    expect(bridgeTypeFor(-1.8)).toBe('planks');
    expect(bridgeTypeFor(1.81)).toBe('ladders');
    expect(bridgeTypeFor(deckWorld(4) - deckWorld(0))).toBe('ladders'); // Schaluppe entert Galeone
    expect(plankCount(24)).toBe(2);
    expect(plankCount(30)).toBe(3);
  });

  it('Abstand beim Heranziehen: halbe Breiten + 1,6 m', () => {
    expect(boardGap(5.8, 12.5)).toBeCloseTo(5.8 / 2 + 12.5 / 2 + 1.6, 9);
  });
});

describe('CompositeGround', () => {
  /** Hafenszene: Insel (Steg `TOWN_PIER`), Schiff `tier` am Liegeplatz, Gangway nach `planGangway` */
  function scene(tier: number, pier: PierLine = TOWN_PIER) {
    const island = new IslandGround();
    island.piers = [pier as Pier];
    const c = SHIP_CLASSES[tier];
    const len = pierAxes(pier).len;
    const pose = berthPose(pier, 1, len / 2, 1, c.W);
    const sh = fakeShip('ship-A', tier, pose.x, pose.z, pose.heading);
    const dg = new DeckGround(sh.ship);
    const comp = new CompositeGround(island);
    comp.setDecks(dg);
    // Landestelle: Schiffsmitte, zur Steg-Seite hin
    const w = Math.max(0.3, c.W / 2 * 0.85 - 0.35);
    const ax = Math.cos(pose.heading), az = -Math.sin(pose.heading);
    const toPier = ((pier.ax + pierAxes(pier).ux * len / 2 - pose.x) * ax + (pier.az + pierAxes(pier).uz * len / 2 - pose.z) * az) >= 0 ? 1 : -1;
    const lx = toPier * (w - 0.5);
    const plan = planGangway({ pierHw: pier.hw, pierY: pier.y, pierLen: len, side: 1, shipHalfW: w, inset: 0.5, deckY: deckWorld(tier), uTop: len / 2, shipW: c.W });
    const foot = pierPoint(pier, plan.footU, plan.footL);
    const def: BridgeDef = {
      id: 'gangway', kind: 'gangway',
      a: { ref: 'world', x: foot.x, z: foot.z, y: pier.y + 0.06 },
      b: { ref: 'ship', shipId: 'ship-A', lx, lz: 0, dy: 0.06 },
      hw: 0.85, freeA: 0.05, freeB: 0.45, out: 1,
    };
    const rt = comp.addBridge(def);
    return { comp, rt, dg, sh, island, plan, pier, c };
  }

  it('die Brücke liegt bündig: Fuß auf Steghöhe, Landestelle auf Deckshöhe, Neigung unter 38°', () => {
    for (let tier = 0; tier < SHIP_CLASSES.length; tier++) {
      const { rt, pier } = scene(tier);
      expect(rt.ok).toBe(true);
      expect(rt.f.ay).toBeCloseTo(pier.y + 0.06, 6);
      expect(rt.f.by).toBeCloseTo(deckWorld(tier) + 0.06, 6);
      expect(slopeDeg(rt.f)).toBeLessThan(MAX_BRIDGE_DEG);
    }
  });

  it('Live-Höheninterpolation: hebt sich das Deck mit der Welle, folgt die Landestelle, der Fuß bleibt auf dem Steg', () => {
    const { comp, rt, sh, pier } = scene(4);
    const by0 = rt.f.by, deg0 = slopeDeg(rt.f);
    sh.m[13] = -0.25 + 0.4; // Welle hebt das Schiff um 40 cm
    comp.update();
    expect(rt.f.by).toBeCloseTo(by0 + 0.4, 6);
    expect(rt.f.ay).toBeCloseTo(pier.y + 0.06, 6);
    expect(slopeDeg(rt.f)).toBeGreaterThan(deg0);
    // Rollen: das Deck neigt sich (m[1] koppelt x in die Höhe)
    sh.m[13] = -0.25; sh.m[1] = 0.05;
    comp.update();
    expect(Number.isFinite(rt.f.by)).toBe(true);
    expect(slopeDeg(rt.f)).toBeLessThan(MAX_BRIDGE_DEG);
    // der Wert in der Mitte der Brücke ist die Mischung aus beiden Enden
    const mid = frameHeight(rt.f, rt.f.len / 2);
    expect(mid).toBeCloseTo((rt.f.ay + rt.f.by) / 2, 6);
  });

  it('Läufer mit Höhenhinweis gehen vom Steg über die Brücke aufs Deck, ohne Sprung (Höhe stetig, Schritt ≤ 0,45 m)', () => {
    for (const tier of [0, 3, 6]) {
      const { comp, rt } = scene(tier);
      const f = rt.f;
      let x = f.ax - f.ux * 1.5, z = f.az - f.uz * 1.5;
      let y = comp.height(x, z);
      expect(Number.isFinite(y)).toBe(true);
      let maxStep = 0, last = y, onBridge = 0;
      for (let i = 0; i < 400; i++) {
        const nx = x + f.ux * 0.05, nz = z + f.uz * 0.05;
        const c = comp.constrain(nx, nz, 0.35, y);
        x = c.x; z = c.z;
        const h = comp.height(x, z, y);
        y += (h - y) * 0.8;
        maxStep = Math.max(maxStep, Math.abs(y - last)); last = y;
        if (comp.onBridge(x, z, y)) onBridge++;
        if ((x - f.ax) * f.ux + (z - f.az) * f.uz > f.len + 1.5) break;
      }
      // am Ende auf dem Deck: Höhe = Deckshöhe
      expect(y).toBeCloseTo(deckWorld(tier), 0);
      expect(comp.deckAtPoint(x, z)).not.toBeNull();
      expect(onBridge).toBeGreaterThan(10);
      expect(maxStep).toBeLessThanOrEqual(0.45);
    }
  });

  it('Geländer: seitlich wird am Streifen begrenzt (Gangway-Kollider), Deck und Steg bleiben frei', () => {
    const { comp, rt } = scene(5);
    const f = rt.f;
    const smid = f.len * 0.5;
    const y = frameHeight(f, smid);
    // der Läufer drängt in kleinen Schritten seitlich aus dem Streifen (so läuft der Sweep: Teilschritte ≤ 0,15 m)
    let x = f.ax + f.ux * smid, z = f.az + f.uz * smid;
    for (let i = 0; i < 40; i++) { const c = comp.constrain(x - f.uz * 0.1, z + f.ux * 0.1, 0.35, y); x = c.x; z = c.z; }
    const l = (x - f.ax) * -f.uz + (z - f.az) * f.ux;
    expect(Math.abs(l)).toBeLessThanOrEqual(0.85 + 1e-6);
    expect(Math.abs(l)).toBeGreaterThan(0.3);
    // die Längsstellung bleibt (er wird nicht aus der Brücke geworfen)
    expect(Math.abs((x - f.ax) * f.ux + (z - f.az) * f.uz - smid)).toBeLessThan(1e-6);
  });

  it('unter der Rampe ist die Stegfläche gesperrt (nicht quer in die Gangway laufen), unter großer lichter Höhe nicht', () => {
    const { comp, rt, pier } = scene(6);
    const f = rt.f;
    // Stelle mit lichter Höhe 1 m (Läufer auf Steghöhe unter der Rampe)
    const s = (1.0 + 0.06) / Math.tan(f.slope) ;
    const x = f.ax + f.ux * s, z = f.az + f.uz * s;
    const h = frameHeight(f, s);
    expect(h - pier.y).toBeGreaterThan(0.75);
    expect(h - pier.y).toBeLessThan(BRIDGE_CLEARANCE);
    const c = comp.constrain(x, z, 0.35, pier.y);
    const lat = (c.x - f.ax) * -f.uz + (c.z - f.az) * f.ux;
    expect(Math.abs(lat)).toBeGreaterThanOrEqual(0.85 + 0.2);
    // weiter oben (lichte Höhe ≥ 2,1 m) darf man unter der Rampe durchgehen
    const sHi = (BRIDGE_CLEARANCE + 0.3) / Math.tan(f.slope);
    const px = f.ax + f.ux * sHi, pz = f.az + f.uz * sHi;
    const c2 = comp.constrain(px, pz, 0.35, pier.y);
    const base = comp.island.constrain(px, pz, 0.35);
    expect(Math.hypot(c2.x - base.x, c2.z - base.z)).toBeLessThan(1e-9);
  });

  it('bis zu zwei Decks gleichzeitig: eigenes Schiff und geentertes Schiff, nie mehr', () => {
    const island = new IslandGround();
    const comp = new CompositeGround(island);
    const a = fakeShip('A', 2, 0, 0, 0), b = fakeShip('B', 3, 12, 0, 0), c = fakeShip('C', 1, 30, 0, 0);
    comp.setDecks(new DeckGround(a.ship), new DeckGround(b.ship), new DeckGround(c.ship));
    expect(comp.deckCount).toBe(2);
    expect(comp.deckOf('A')).not.toBeNull();
    expect(comp.deckOf('C')).toBeNull();
    // in jedem Rumpf zuständig das passende Deck, dazwischen (Spalt) keines
    expect(comp.deckAtPoint(0, 0)?.shipId).toBe('A');
    expect(comp.deckAtPoint(12, 0)?.shipId).toBe('B');
    expect(comp.deckAtPoint(6, 0)).toBeNull();
    // ohne Hinweis hält das Deck Läufer im Rumpf (Gegner fallen nicht ins Wasser)
    const inside = comp.constrain(0, 0, 0.35);
    expect(Math.hypot(inside.x, inside.z)).toBeLessThan(1e-6);
    const pushed = comp.constrain(3.7, 0, 0.45); // an der Bordwand: zurück ins begehbare Deck
    expect(Math.abs(pushed.x)).toBeLessThan(3.7);
  });

  it('Enterplanke zwischen zwei Decks: Höhe wechselt stetig von Deck zu Deck, Läufer gehen hinüber', () => {
    const island = new IslandGround();
    const comp = new CompositeGround(island);
    const cA = SHIP_CLASSES[0], cB = SHIP_CLASSES[3];
    const gap = boardGap(cA.W, cB.W);
    const A = fakeShip('A', 0, 0, 0, 0), B = fakeShip('B', 3, gap, 0, 0);
    comp.setDecks(new DeckGround(A.ship), new DeckGround(B.ship));
    const wA = cA.W / 2 * 0.85 - 0.35, wB = cB.W / 2 * 0.85 - 0.35;
    const dh = deckWorld(3) - deckWorld(0);
    const natural = (gap - wB + 0.5) - (wA - 0.5);
    const plan = planPlank(dh, natural);
    const ext = plan.extend;
    // +x ist die Seite von B (Heading 0: lokales x = Welt-x)
    const rt = comp.addBridge({
      id: 'plank-0', kind: 'plank',
      a: { ref: 'ship', shipId: 'A', lx: wA - 0.5 - ext, lz: 0, dy: 0.1 },
      b: { ref: 'ship', shipId: 'B', lx: -(wB - 0.5 - ext), lz: 0, dy: 0.1 },
      hw: 0.85, freeA: 0.5 + ext - 0.05, freeB: 0.5 + ext - 0.05, out: 1,
    });
    expect(slopeDeg(rt.f)).toBeLessThan(MAX_BRIDGE_DEG);
    expect(rt.f.ay).toBeCloseTo(deckWorld(0) + 0.1, 6);
    expect(rt.f.by).toBeCloseTo(deckWorld(3) + 0.1, 6);
    // Läufer: von A nach B
    let x = rt.f.ax - 0.8, z = 0, y = comp.height(x, z);
    expect(y).toBeCloseTo(deckWorld(0), 1);
    let guard = 0;
    while (x < rt.f.bx + 1.0 && guard++ < 600) {
      const c = comp.constrain(x + 0.06, z, 0.35, y);
      x = c.x; z = c.z;
      y += (comp.height(x, z, y) - y) * 0.8;
    }
    expect(x).toBeGreaterThan(rt.f.bx);
    expect(y).toBeCloseTo(deckWorld(3), 0);
    expect(comp.deckAtPoint(x, z)?.shipId).toBe('B');
  });

  it('Brücken lassen sich abbauen (Cleanup): nach `clearBridges` gilt wieder der Boden darunter', () => {
    const { comp, rt, pier } = scene(2);
    const f = rt.f;
    const s = f.len * 0.5;
    const x = f.ax + f.ux * s, z = f.az + f.uz * s;
    const hBridge = comp.height(x, z, frameHeight(f, s));
    comp.clearBridges();
    expect(comp.bridges.length).toBe(0);
    const hGround = comp.height(x, z, frameHeight(f, s));
    expect(hBridge).toBeGreaterThan(pier.y);
    expect(hGround === -Infinity || hGround <= pier.y + 1e-9).toBe(true);
  });
});

describe('Laufwege über Brücken (Offiziere, Trupps) mit Nachrück-Fallback', () => {
  it('ein Läufer folgt Wegpunkten über die Gangway bis auf den Steg', () => {
    const island = new IslandGround();
    island.piers = [TOWN_PIER as Pier];
    const c = SHIP_CLASSES[4], len = 46;
    const pose = berthPose(TOWN_PIER, 1, len / 2, 1, c.W);
    const sh = fakeShip('S', 4, pose.x, pose.z, pose.heading);
    const comp = new CompositeGround(island);
    comp.setDecks(new DeckGround(sh.ship));
    const w = Math.max(0.3, c.W / 2 * 0.85 - 0.35);
    const ax = Math.cos(pose.heading), az = -Math.sin(pose.heading);
    const sgn = ((TOWN_PIER.ax - pose.x) * ax + (TOWN_PIER.az - pose.z) * az) >= 0 ? 1 : -1;
    const plan = planGangway({ pierHw: 2.4, pierY: 1.65, pierLen: len, side: 1, shipHalfW: w, inset: 0.5, deckY: deckWorld(4), uTop: len / 2, shipW: c.W });
    const foot = pierPoint(TOWN_PIER, plan.footU, plan.footL);
    const rt = comp.addBridge({ id: 'g', kind: 'gangway', a: { ref: 'world', x: foot.x, z: foot.z, y: 1.71 }, b: { ref: 'ship', shipId: 'S', lx: sgn * (w - 0.5), lz: 0, dy: 0.06 }, hw: 0.85, freeA: 0.05, freeB: 0.45, out: 1 });
    const f = rt.f;
    // Start an Deck (innerhalb der Landestelle), Weg: Vorpunkt, Landestelle, Fuß, Nachpunkt
    const route = makeRoute([{ x: f.bx + f.ux, z: f.bz + f.uz }, { x: f.bx, z: f.bz }, { x: f.ax, z: f.az }, { x: f.ax - f.ux * 1.8, z: f.az - f.uz * 1.8 }]);
    const body = { x: f.bx + f.ux * 1.4, y: deckWorld(4), z: f.bz + f.uz * 1.4, radius: 0.6 };
    let t = 0;
    while (!routeDone(route) && t < 40) { stepRoute(body, route, 1 / 60, 4.2, comp, 1.5); t += 1 / 60; }
    expect(routeDone(route)).toBe(true);
    expect(Math.hypot(body.x - (f.ax - f.ux * 1.8), body.z - (f.az - f.uz * 1.8))).toBeLessThan(0.5);
    // unten auf den Bohlen
    expect(body.y).toBeCloseTo(1.65, 0);
  });

  it('bleibt ein Läufer an der Kante hängen, rückt er nach und springt zuletzt zum Wegpunkt (auf der Brückenlinie)', () => {
    let blocked = true;
    const wall = {
      height: () => 0,
      constrain: (x: number, z: number) => (blocked ? { x: 0, z: 0 } : { x, z }), // alles zieht zum Startpunkt zurück
    };
    const route = makeRoute([{ x: 6, z: 0 }]);
    const body = { x: 0, y: 0, z: 0, radius: 0.5 };
    let nudged = false, t = 0;
    while (!routeDone(route) && t < 12) { if (stepRoute(body, route, 1 / 30, 3, wall, 1.5).nudged) nudged = true; t += 1 / 30; }
    expect(nudged).toBe(true);
    expect(route.nudges).toBeGreaterThan(0);
    expect(routeDone(route)).toBe(true);
    expect(Math.hypot(body.x - 6, body.z)).toBeLessThan(0.4);
    blocked = false;
  });

  it('Klettern: Läufer folgen der Leiterlinie von unten nach oben', () => {
    const lad = { x: 0, z: 0, y: 0 };
    const g = {
      height: () => 0, constrain: (x: number, z: number) => ({ x, z }),
      ladderAt: (_: string, t: number, o: { x: number; y: number; z: number }) => { o.x = 1 + t; o.z = 2; o.y = t * 5; Object.assign(lad, o); return true; },
      ladderLength: () => 5.2,
    };
    const route = makeRoute([{ x: 2, z: 2, climb: 'l', up: true }, { x: 3, z: 2 }]);
    const body = { x: 1, y: 0, z: 2, radius: 0.4 };
    let maxY = 0, t = 0;
    while (!routeDone(route) && t < 20) { stepRoute(body, route, 1 / 60, 4, g, 1.5); maxY = Math.max(maxY, body.y); t += 1 / 60; }
    expect(maxY).toBeCloseTo(5, 1);
    expect(routeDone(route)).toBe(true);
  });
});

describe('Deck-Zugang für Crew und Truppen', () => {
  it('der Zugang liegt auf freier Fläche und wird auf beiden Seiten freigehalten', () => {
    const blockers = [{ cx: 0, cz: 0, hx: 0.6, hz: 0.6 }, { cx: 2, cz: 0.5, hx: 0.5, hz: 0.5 }];
    const model = { halfWidth: () => 5, blockers, quarter: { z1: -9, stairLen: 4.6 }, fore: { z0: 11, stairLen: 2.4 } };
    const z = deckGate(model, 38);
    for (const s of [-1, 1]) expect(freeOf(blockers, s * 3.5, z, 0.7)).toBe(true);
    expect(z).toBeGreaterThan(-9);
    expect(z).toBeLessThan(11);
  });
});

describe('Pfad-Sicht: Frames', () => {
  it('Frame-Neigung und Länge folgen den Ankern', () => {
    const f = setFrame({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, len: 1, ux: 1, uz: 0, slope: 0 }, 0, 1, 0, 6, 5, 0);
    expect(f.len).toBeCloseTo(6, 9);
    expect(slopeDeg(f)).toBeCloseTo(Math.atan2(4, 6) * 180 / Math.PI, 6);
  });
});

describe('DockingFx: Cleanup (Taue, Planken, Leitern, Poller)', () => {
  it('alles Temporäre wird beim Einholen entfernt und die eigenen Geometrien werden freigegeben', async () => {
    const { Scene, BufferGeometry } = await import('three');
    const { DockingFx } = await import('../src/world/dockingFx');
    const island = new IslandGround();
    const comp = new CompositeGround(island);
    const a = fakeShip('A', 2, 0, 0, 0), b = fakeShip('B', 3, 12, 0, 0);
    comp.setDecks(new DeckGround(a.ship), new DeckGround(b.ship));
    const scene = new Scene();
    const fx = new DockingFx(scene);
    // Entsorgungen der eigenen Brückengeometrien zählen
    const disposed: Geo[] = [];
    const orig = BufferGeometry.prototype.dispose;
    BufferGeometry.prototype.dispose = function (this: Geo) { disposed.push(this); orig.call(this); };
    try {
      const rt1 = comp.addBridge({ id: 'p0', kind: 'plank', a: { ref: 'ship', shipId: 'A', lx: 1, lz: 0, dy: 0.1 }, b: { ref: 'ship', shipId: 'B', lx: -1, lz: 0, dy: 0.1 }, hw: 0.85, freeA: 0.5, freeB: 0.5, out: 1 });
      const rt2 = comp.addBridge({ id: 'l0', kind: 'ladder', a: { ref: 'ship', shipId: 'A', lx: 1, lz: 2, dy: 0 }, b: { ref: 'ship', shipId: 'B', lx: -1, lz: 2, dy: 0.9 }, hw: 0.55, freeA: 0, freeB: 0, out: 1 }, false);
      fx.addBridge(rt1, 'plank');
      fx.addBridge(rt2, 'siege');
      fx.addRope('r0', (o) => { o.x = 0; o.y = 2; o.z = 0; }, (o) => { o.x = 5; o.y = 2; o.z = 0; });
      fx.addRope('h0', (o) => { o.x = 0; o.y = 2; o.z = 0; }, (o) => { o.x = 5; o.y = 2; o.z = 0; }, { hook: true, t: 0.5 });
      fx.addPost(3, 1, 3);
      expect(fx.counts).toEqual({ bridges: 2, ropes: 2, posts: 1 });
      fx.update(1 / 60);
      fx.update(1 / 60);
      const before = scene.children[0].children.length;
      expect(before).toBeGreaterThan(5);
      fx.clear();
      expect(fx.counts).toEqual({ bridges: 0, ropes: 0, posts: 0 });
      expect(scene.children[0].children.length).toBe(0);
      // je Brücke 2–3 verschmolzene Geometrien (Belag/Latten/Geländer bzw. Holme/Sprossen/Haken) wurden freigegeben
      expect(disposed.length).toBeGreaterThanOrEqual(5);
      fx.dispose();
      expect(scene.children.length).toBe(0);
    } finally { BufferGeometry.prototype.dispose = orig; }
  });
});


describe('Heranziehen beim Entern (planPull, pullPose)', () => {
  const ship = (x: number, z: number, heading: number, W = 8) => ({ x, z, heading, cls: { W } });
  const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  /** Welche Bordwand des Gegners (Schiffs-x-Vorzeichen) liegt am Ende dem Angreifer zu? */
  const facingSide = (b: { x: number; z: number; heading: number }, a: { x: number; z: number }) => (((a.x - b.x) * Math.cos(b.heading) + (a.z - b.z) * -Math.sin(b.heading)) >= 0 ? 1 : -1);

  it('endet parallel längsseits im Achsabstand boardGap, Angreifer behält seinen Kurs', () => {
    for (const ang of [0, 40, 90, 135, 180, 225, 300]) for (const off of [[0, 30], [24, 4], [-22, 8], [18, -26]]) {
      const a = ship(0, 0, 0.3), b = ship(off[0], off[1], 0.3 + (ang * Math.PI) / 180, 10);
      const pl = planPull(a, b);
      const q = pullPose(pl, 1);
      expect(Math.hypot(q.bx - q.ax, q.bz - q.az)).toBeCloseTo(boardGap(8, 10), 6);
      // genau querab: der Verbindungsvektor steht senkrecht auf dem Kurs des Angreifers
      const dot = (q.bx - q.ax) * Math.sin(0.3) + (q.bz - q.az) * Math.cos(0.3);
      expect(Math.abs(dot)).toBeLessThan(1e-6);
      // Gegner liegt parallel oder gegenläufig, nie schräg; die Drehung beträgt höchstens 90°
      expect(Math.abs(Math.sin(wrapA(q.bh - 0.3)))).toBeLessThan(1e-6);
      expect(Math.abs(pl.dh)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    }
  });

  it('wählt die Hakenseite so, dass die Taue nach dem Drehen auf der zugewandten Bordwand liegen', () => {
    for (const ang of [0, 60, 120, 180, 240, 300]) for (const off of [[0, 30], [24, 4], [-22, 8], [18, -26], [-20, 25]]) {
      const a = ship(0, 0, 0.3), b = ship(off[0], off[1], 0.3 + (ang * Math.PI) / 180);
      const side = ((b.x - a.x) * Math.cos(a.heading) + (b.z - a.z) * -Math.sin(a.heading)) >= 0 ? 1 : -1;
      const par = Math.cos(a.heading - b.heading) > 0;
      const sideB = par ? -side : side;                           // so rechnet DockingSystem.startBoarding
      const pl = planPull(a, b);
      const q = pullPose(pl, 1);
      expect(facingSide({ x: q.bx, z: q.bz, heading: q.bh }, { x: q.ax, z: q.az })).toBe(sideB);
    }
  });

  it('dauert 3 bis 6,5 s, wächst monoton und überspringt nichts: der Fortschritt springt nie um mehr als 4 % je Bild', () => {
    for (const d of [0, 6, 14, 30, 60, 120]) {
      const pl = planPull(ship(0, 0, 0), ship(8 + d, d * 0.3, 1.2));
      expect(pl.T).toBeGreaterThanOrEqual(3);
      expect(pl.T).toBeLessThanOrEqual(6.5);
      let prev = pullPose(pl, 0);
      expect(prev.p).toBe(0);
      for (let t = 1 / 60; t <= pl.T + 1e-9; t += 1 / 60) {
        const q = pullPose(pl, t / pl.T);
        expect(q.p - prev.p).toBeLessThan(0.04);
        expect(q.p).toBeGreaterThanOrEqual(prev.p - 0.012);       // nur die kleine Zugwelle darf kurz zurückfedern
        prev = q;
      }
      expect(pullPose(pl, 1).p).toBeCloseTo(1, 9);
    }
  });

  it('dreht den Gegner früher fertig als er fährt (zuletzt liegt er nur noch seitlich an)', () => {
    const pl = planPull(ship(0, 0, 0), ship(20, 15, Math.PI / 2));
    const q = pullPose(pl, 0.75);
    expect(Math.abs(wrapA(q.bh - pl.hB))).toBeLessThan(0.05);
    expect(q.p).toBeLessThan(0.97);
  });
});
