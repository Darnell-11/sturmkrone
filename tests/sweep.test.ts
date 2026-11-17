import { describe, expect, it } from 'vitest';
import { makeDashLatch, makeSweepResult, resolveDash, sweepMove, SWEEP, type SweepGround } from '../src/combat/sweep';
import { boxBlocker, DeckGround, IslandGround, type Blocker, type WalkIsland } from '../src/world/islandGround';
import type { DashIntent } from '../src/sim/intents';

/** Flache Insel mit den gegebenen Hindernissen (Höhe 1,3 überall im Inland) */
function island(blockers: Blocker[]): IslandGround {
  const g = new IslandGround();
  const i = { x: 0, z: 0, r: 300, coast: [], hills: [], beachY: 1.3, hillY: 1.3, shelf: 0.1, blockers } as unknown as WalkIsland;
  g.add(i);
  return g;
}

const body = (x: number, z: number, radius = 0.35) => ({ x, y: 1.3, z, radius });

/** Abstand des Mittelpunkts zum Rand des gedrehten Quaders (0 = innen): Kapsel frei, wenn ≥ Radius */
function boxDist(b: Blocker, x: number, z: number): number {
  const c = Math.cos(b.yaw ?? 0), s = Math.sin(b.yaw ?? 0);
  const dx = x - b.x, dz = z - b.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const ex = Math.max(0, Math.abs(lx) - (b.hw ?? 0)), ez = Math.max(0, Math.abs(lz) - (b.hd ?? 0));
  return Math.hypot(ex, ez);
}
const free = (b: Blocker, x: number, z: number, r = 0.35) => boxDist(b, x, z) >= r - 2e-3;
const dash = (id: number, dirX: number, dirZ: number, speed: number, kind: DashIntent['kind'] = 'lunge'): DashIntent => ({ type: 'dash', entityId: 'foot-1', kind, id, dirX, dirZ, speed });

/** Läuft einen Impuls über mehrere Logikbilder; liefert die Lage nach jedem Bild */
function run(b: ReturnType<typeof body>, g: SweepGround, it: DashIntent, frames: number, dt = 1 / 60) {
  const latch = makeDashLatch();
  const out = makeSweepResult();
  const path: { x: number; z: number; blocked: boolean; hit: boolean }[] = [];
  for (let i = 0; i < frames; i++) {
    resolveDash(b, latch, it, g, dt, out);
    path.push({ x: b.x, z: b.z, blocked: out.blocked, hit: out.hit });
  }
  return { path, latch };
}

describe('Kampf-Kollision: Wände', () => {
  const house = boxBlocker(10, 0, 6, 6, 0);   // x 7 … 13, z −3 … 3

  it('ein Ausfallschritt gegen eine Hauswand endet davor und dringt nie ein', () => {
    const g = island([house]);
    for (const speed of [5, 9, 20, 40]) {
      const b = body(0, 0);
      const { path } = run(b, g, dash(1, 1, 0, speed), 150);
      for (const p of path) expect(free(house, p.x, p.z), `speed ${speed}`).toBe(true);
      expect(b.x).toBeLessThanOrEqual(7 - 0.35 + 1e-3);
      expect(b.x).toBeGreaterThan(7 - 0.35 - 0.2);
    }
  });

  it('auch ein sehr großes Bild (dt 0,25 s) springt nicht durch die Wand', () => {
    const g = island([house]);
    const b = body(4, 0);
    resolveDash(b, makeDashLatch(), dash(1, 1, 0, 30, 'roll'), g, 0.25);
    expect(free(house, b.x, b.z)).toBe(true);
    expect(b.x).toBeLessThan(7);
  });

  it('dünne Zäune (10 cm) werden nicht übersprungen', () => {
    const fence = boxBlocker(6, 0, 0.1, 8, 0);
    const g = island([fence]);
    for (const dt of [1 / 60, 1 / 20, 0.1]) {
      const b = body(0, 0);
      run(b, g, dash(1, 1, 0, 25), Math.ceil(0.8 / dt), dt);
      expect(b.x, `dt ${dt}`).toBeLessThan(6 - 0.05);
    }
  });

  it('jeder Teilschritt ist höchstens 0,15 m lang', () => {
    const calls: { x: number; z: number }[] = [];
    const base = island([]);
    const g: SweepGround = { height: (x, z) => base.height(x, z), constrain: (x, z, r) => { calls.push({ x, z }); return base.constrain(x, z, r); } };
    const b = body(0, 0);
    resolveDash(b, makeDashLatch(), dash(1, 1, 0, 30, 'roll'), g, 0.1);   // 3 m in einem Bild
    expect(calls.length).toBeGreaterThanOrEqual(3 / SWEEP.maxSubStep);
    let px = 0;
    for (const c of calls.slice(0, -1)) { expect(c.x - px).toBeLessThanOrEqual(SWEEP.maxSubStep + 1e-6); px = c.x; }
  });

  it('bei schrägem Winkel gleitet der Impuls an der Wand entlang statt zu stoppen', () => {
    const g = island([house]);
    const b = body(4, -1);
    const a = Math.atan2(1.2, 1);   // etwa 50° zur Wand-Normale: schräg genug zum Gleiten, aber gegen die Wand gerichtet
    const { path } = run(b, g, dash(1, Math.cos(a), Math.sin(a), 8), 16);   // endet vor der Hausecke (z = 3)
    expect(b.x).toBeLessThanOrEqual(7 - 0.35 + 1e-3);
    expect(b.z).toBeGreaterThan(0.5);           // an der Wand entlanggeglitten
    for (const p of path) expect(free(house, p.x, p.z)).toBe(true);
  });

  it('ein flach einfallender Impuls (60° zur Normale) gleitet weit', () => {
    const g = island([house]);
    const b = body(6, -2.5);
    const a = (60 * Math.PI) / 180;
    run(b, g, dash(1, Math.cos(a), Math.sin(a), 9), 30);
    expect(b.z).toBeGreaterThan(1);
    expect(free(house, b.x, b.z)).toBe(true);
  });

  it('frontaler Aufprall sperrt den Impuls bis zur nächsten Aktion', () => {
    const g = island([house]);
    const b = body(5, 0);
    const it = dash(7, 1, 0, 9);
    const { path, latch } = run(b, g, it, 30);
    expect(latch.blocked).toBe(true);
    const x = b.x;
    // gleiche Kennung: bleibt stehen, auch wenn die Richtung sich dreht
    resolveDash(b, latch, { ...it, dirX: -1 }, g, 1 / 60);
    expect(b.x).toBe(x);
    expect(path.some((p) => p.blocked)).toBe(true);
    // neue Aktion: bewegt sich wieder
    resolveDash(b, latch, { ...it, id: 8, dirX: -1 }, g, 1 / 60);
    expect(b.x).toBeLessThan(x);
  });

  it('Ecken: ein Impuls in eine Ecke aus zwei Wänden klemmt nicht im Inneren', () => {
    const a = boxBlocker(10, 0, 6, 6, 0);
    const c = boxBlocker(10, 6.8, 6, 6, 0);   // Spalt von 0,8 m zwischen den Häusern (zu eng für Radius 0,35 + Wände)
    const g = island([a, c]);
    const b = body(4, 3.4);
    run(b, g, dash(1, 1, 0, 12), 40);
    for (const h of [a, c]) expect(free(h, b.x, b.z)).toBe(true);
  });

  it('gedrehte Häuser (45°) halten ebenfalls', () => {
    const rot = boxBlocker(10, 0, 5, 5, Math.PI / 4);
    const g = island([rot]);
    for (const ang of [0, 0.4, -0.7, 1.2]) {
      const b = body(0, 0);
      const { path } = run(b, g, dash(1, Math.cos(ang), Math.sin(ang), 12, 'roll'), 60);
      for (const p of path) expect(free(rot, p.x, p.z), `winkel ${ang}`).toBe(true);
    }
  });

  it('Kreis-Hindernisse (Fels, Fass) werden umglitten', () => {
    const g = island([{ x: 6, z: 0.2, r: 1 }]);
    const b = body(0, 0);
    run(b, g, dash(1, 1, 0, 9), 40);
    expect(Math.hypot(b.x - 6, b.z - 0.2)).toBeGreaterThanOrEqual(1.35 - 1e-3);
  });
});

describe('Kampf-Kollision: Stufen, Rampen, Steilhänge', () => {
  /** Boden aus einer Höhenfunktion ohne Hindernisse */
  const flat = (h: (x: number, z: number) => number): SweepGround => ({ height: h, constrain: (x, z) => ({ x, z }) });

  it('eine Treppe aus 30-cm-Stufen wird flüssig hinaufgelaufen', () => {
    const g = flat((x) => (x < 2 ? 0 : Math.min(3, Math.floor((x - 2) / 0.5 + 1) * 0.3)));
    const b = body(0, 0);
    b.y = 0;
    const out = makeSweepResult();
    let climbed = false;
    const latch = makeDashLatch();
    for (let i = 0; i < 40; i++) { resolveDash(b, latch, dash(1, 1, 0, 6), g, 1 / 60, out); climbed ||= out.climbed; }
    expect(latch.blocked).toBe(false);
    expect(climbed).toBe(true);
    expect(b.x).toBeGreaterThan(3.5);
  });

  it('eine 0,45-m-Stufe geht, 0,6 m ist eine Wand', () => {
    const step = (h: number) => flat((x) => (x < 2 ? 0 : h));
    const ok = body(0, 0); ok.y = 0;
    run(ok, step(0.45), dash(1, 1, 0, 6), 40);
    expect(ok.x).toBeGreaterThan(3);
    const wall = body(0, 0); wall.y = 0;
    const r = run(wall, step(0.6), dash(1, 1, 0, 6), 40);
    expect(wall.x).toBeLessThan(2);
    expect(r.latch.blocked).toBe(true);
  });

  it('eine Rampe von 30° (Schiffstreppe) und 40° geht, 55° ist ein Fels', () => {
    for (const [deg, passes] of [[30, true], [40, true], [55, false], [70, false]] as const) {
      const t = Math.tan((deg * Math.PI) / 180);
      const g = flat((x) => (x < 2 ? 0 : (x - 2) * t));
      const b = body(0, 0); b.y = 0;
      const out = makeSweepResult();
      const latch = makeDashLatch();
      for (let i = 0; i < 60; i++) resolveDash(b, latch, dash(1, 1, 0, 5), g, 1 / 60, out);
      expect(b.x > 3.5, `${deg}°`).toBe(passes);
      if (!passes) expect(latch.blocked, `${deg}°`).toBe(true);
    }
  });

  it('ein Impuls gegen einen Steilhang gleitet an dessen Falllinie entlang', () => {
    // Fels in x-Richtung (60°), Gleiten in z
    const g = flat((x) => (x < 2 ? 0 : (x - 2) * 1.73));
    const b = body(0, 0); b.y = 0;
    const a = (50 * Math.PI) / 180;   // schräg gegen den Hang
    run(b, g, dash(1, Math.cos(a), Math.sin(a), 6), 40);
    expect(b.x).toBeLessThan(2.1);
    expect(b.z).toBeGreaterThan(0.5);
  });
});

describe('Kampf-Kollision: Schiffsdeck', () => {
  const quarter = { z0: -12, z1: -8, top: 1.7, stairX: [-1.5, 1.5], stairW: 1.2, stairLen: 1.7 / 0.58, flare: 0, doorHalf: 0.6, cabin: undefined as never };
  const ship = {
    x: 0, z: 0, heading: 0, cls: { L: 30 },
    model: {
      deckY: 1, halfWidth: () => 4, quarter: { ...quarter, cabin: undefined } as never, fore: null,
      group: { position: { y: 0 }, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, updateMatrixWorld() {} },
    },
  };

  it('die Treppe zum Achterdeck läuft sich flüssig (30°), die Kastellwand daneben hält', () => {
    const g = new DeckGround(ship as never);
    const b = body(1.5, -4.2); b.y = g.height(1.5, -4.2);
    const out = makeSweepResult();
    const latch = makeDashLatch();
    for (let i = 0; i < 90; i++) resolveDash(b, latch, dash(1, 0, -1, 4), g, 1 / 60, out);
    expect(latch.blocked).toBe(false);
    expect(b.z).toBeLessThan(-8.5);            // oben angekommen
    expect(out.groundY).toBeCloseTo(g.height(b.x, b.z), 3);
    expect(g.height(b.x, b.z) - g.height(1.5, -4.2)).toBeGreaterThan(1.6);
    // seitlich neben der Treppe (Wand des Kastells): stoppt
    const w = body(3, -4.2); w.y = g.height(3, -4.2);
    run(w, g, dash(2, 0, -1, 9), 60);
    expect(w.z).toBeGreaterThanOrEqual(-8 + 0.35 + 0.07 - 1e-3);   // an der Kastellwand zum Stehen gekommen
  });

  it('die Reling hält einen Ausfallschritt über Bord auf', () => {
    const g = new DeckGround(ship as never);
    const b = body(0, 0); b.y = g.height(0, 0);
    run(b, g, dash(1, 1, 0, 12), 40);
    expect(Math.abs(b.x)).toBeLessThanOrEqual(4 * 0.85 + 1e-3);
  });
});

describe('Kampf-Kollision: Zufallstest gegen Häuser', () => {
  it('2000 zufällige Impulse laufen nie in ein Gebäude', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const blockers: Blocker[] = [];
    for (let i = 0; i < 14; i++) blockers.push(boxBlocker((rnd() - 0.5) * 60, (rnd() - 0.5) * 60, 2 + rnd() * 6, 2 + rnd() * 6, rnd() * Math.PI));
    const g = island(blockers);
    let violations = 0;
    for (let n = 0; n < 2000; n++) {
      // Startpunkt frei von Hindernissen wählen
      let x = 0, z = 0, ok = false;
      for (let t = 0; t < 30 && !ok; t++) {
        x = (rnd() - 0.5) * 70; z = (rnd() - 0.5) * 70;
        const c = g.constrain(x, z, 0.35);
        ok = Math.hypot(c.x - x, c.z - z) < 1e-6;
      }
      if (!ok) continue;
      const a = rnd() * Math.PI * 2;
      const b = body(x, z);
      const latch = makeDashLatch();
      const it = dash(n, Math.cos(a), Math.sin(a), 4 + rnd() * 30, 'roll');
      for (let f = 0; f < 30; f++) {
        resolveDash(b, latch, it, g, rnd() < 0.2 ? 0.1 : 1 / 60);
        for (const h of blockers) if (!free(h, b.x, b.z)) violations++;
      }
    }
    expect(violations).toBe(0);
  });
});

describe('sweepMove ohne Impuls', () => {
  it('Stillstand schiebt trotzdem aus Hindernissen heraus', () => {
    const g = island([boxBlocker(0, 0, 4, 4, 0)]);
    const b = body(1.9, 0);
    sweepMove(b, 0, 0, g, false);
    expect(free(boxBlocker(0, 0, 4, 4, 0), b.x, b.z)).toBe(true);
  });
});
