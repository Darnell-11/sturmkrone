import { describe, expect, it } from 'vitest';
import {
  ActionCombatEngine, createFighter, hasPostureBar, hitPosture, breakPosture, inShape, makeInput, makePosture, postureFrac, stepPosture,
  type ActionBody, type ActionInput, type ActionTarget, type ActionWorld, type HitContext,
} from '../src/combat/actionCombatEngine';
import {
  ACTION_STYLES, ACTION_TUNING as T, ALL_MOVES, PHYSICAL_STYLES, POSTURE, lastHitEnd, moveIndex,
  type ActionHit, type ActionMove, type ActionStyleId,
} from '../src/data/actionStyles';
import { FIGHT_MODEL } from '../src/data/balanceConfig';

const DT = 1 / 60;

/** Gegner in der Test-Welt: Kreis mit Höhe, einfache Flugbahn (Hochschleudern, Jonglieren) */
interface Foe {
  id: string; x: number; y: number; z: number; yaw: number; radius: number; vy: number; air: boolean; alive: boolean; mass: boolean; boss: boolean;
  hp: number; hits: number; airHits: number; launched: number; posture: ReturnType<typeof makePosture> | null; guard: boolean; guardBroken: boolean;
}

interface Plat { x0: number; x1: number; z0: number; z1: number; y: number }

/** Test-Welt: ebener Boden auf Höhe 0, Plattformen (wie Brücken/Achterdecks mit Höhenhinweis), runde Wände, einfache Gegner */
class TestWorld implements ActionWorld {
  floor = 0;
  plats: Plat[] = [];
  walls: { x: number; z: number; r: number }[] = [];
  foes: Foe[] = [];
  log: { id: string; move: string; h: ActionHit; crit: number; finisher: boolean }[] = [];
  shots = 0;

  foe(x: number, z: number, o: Partial<Foe> = {}): Foe {
    const f: Foe = { id: `f${this.foes.length}`, x, y: 0, z, yaw: Math.PI, radius: 0.45, vy: 0, air: false, alive: true, mass: false, boss: false, hp: 1e9, hits: 0, airHits: 0, launched: 0, posture: null, guard: false, guardBroken: false, ...o };
    this.foes.push(f);
    return f;
  }

  height(x: number, z: number, y: number): number {
    for (const p of this.plats) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && Math.abs(p.y - y) <= 0.75) return p.y;
    return this.floor;
  }

  private push(b: ActionBody) {
    for (const w of this.walls) {
      const dx = b.x - w.x, dz = b.z - w.z, d = Math.hypot(dx, dz), min = w.r + b.radius;
      if (d < min && d > 1e-6) { b.x = w.x + (dx / d) * min; b.z = w.z + (dz / d) * min; }
    }
  }

  move(b: ActionBody, dx: number, dz: number): void { b.x += dx; b.z += dz; this.push(b); }

  teleport(b: ActionBody, x: number, z: number): boolean {
    for (const w of this.walls) if (Math.hypot(x - w.x, z - w.z) < w.r + b.radius) return false;
    b.x = x; b.z = z;
    return true;
  }

  targets(x: number, z: number, r: number, out: ActionTarget[]): number {
    let n = 0;
    this.foes.forEach((f, i) => {
      if (n >= out.length || Math.hypot(f.x - x, f.z - z) > r + f.radius) return;
      const t = out[n++];
      t.id = f.id; t.x = f.x; t.y = f.y; t.z = f.z; t.radius = f.radius; t.height = 1.8; t.yaw = f.yaw;
      t.alive = f.alive; t.airborne = f.air; t.mass = f.mass; t.broken = !!f.posture && f.posture.brokenT > 0; t.boss = f.boss; t.ref = i;
    });
    return n;
  }

  drag(t: ActionTarget, cx: number, cz: number, step: number): void {
    const f = this.foes[t.ref];
    const dx = cx - f.x, dz = cz - f.z, d = Math.hypot(dx, dz);
    if (d > 1e-3) { const k = Math.min(step, d) / d; f.x += dx * k; f.z += dz * k; }
  }

  hit(t: ActionTarget, h: ActionHit, m: ActionMove, ctx: HitContext): number {
    const f = this.foes[t.ref];
    if (f.guard && !h.breakGuard) return 0;
    if (f.guard && h.breakGuard) { f.guard = false; f.guardBroken = true; }
    this.log.push({ id: f.id, move: m.id, h, crit: ctx.crit, finisher: ctx.finisher });
    f.hits++;
    if (f.air) f.airHits++;
    f.hp -= h.dmg;
    if (f.posture && hitPosture(f.posture, h.poise * ctx.postureK)) breakPosture(f.posture, POSTURE.staggerElite);
    if (h.launch > 0 && !f.boss) { f.vy = h.launch; f.air = true; f.launched++; }
    else if (f.air && h.juggle > 0) f.vy = Math.max(f.vy * 0.3, h.juggle);
    return 1;
  }

  shoot(): void { this.shots++; }

  stepFoes(dt: number) {
    for (const f of this.foes) {
      if (!f.air) continue;
      f.vy -= 22 * dt;
      f.y += f.vy * dt;
      if (f.y <= this.floor) { f.y = this.floor; f.vy = 0; f.air = false; }
    }
  }
}

function setup(style: ActionStyleId = 'saebel', x = 0, z = 0) {
  const w = new TestWorld();
  const eng = new ActionCombatEngine(createFighter('foot-test', style, x, 0, z, 0));
  const inp = makeInput();
  return { w, eng, inp, f: eng.f };
}

/** Ein Logikbild: Eingabe setzen (Knöpfe nur für dieses Bild), Engine und Gegner vorrücken */
function tick(eng: ActionCombatEngine, w: TestWorld, inp: ActionInput, press: Partial<ActionInput> = {}) {
  Object.assign(inp, { light: false, heavy: false, jump: false, dash: false, skill: 0, blockPressed: false }, press);
  eng.step(inp, w, DT);
  w.stepFoes(DT);
  return eng.events;
}

function frames(eng: ActionCombatEngine, w: TestWorld, inp: ActionInput, n: number, press: Partial<ActionInput> = {}) {
  for (let i = 0; i < n; i++) tick(eng, w, inp, i === 0 ? press : {});
}

/** So lange laufen, bis der laufende Angriff seinen Ansatzpunkt erreicht hat (höchstens `max` Bilder) */
function untilCancel(eng: ActionCombatEngine, w: TestWorld, inp: ActionInput, max = 120) {
  for (let i = 0; i < max; i++) {
    const m = eng.move;
    if (!m || eng.f.moveT >= m.cancel) return;
    tick(eng, w, inp);
  }
}

/** Taste drücken und bis zum Ansatzpunkt des neuen Angriffs laufen */
function pressAndRun(eng: ActionCombatEngine, w: TestWorld, inp: ActionInput, press: Partial<ActionInput>) {
  tick(eng, w, inp, press);
  untilCancel(eng, w, inp);
}

const moveOf = (id: string) => ALL_MOVES[moveIndex(id)];

describe('Action-Kampf: freie 3D-Bewegung ohne Arena', () => {
  it('Kampf erzeugt keine Wände: mitten unter Gegnern läuft die Figur ungehindert 60 m weit', () => {
    const { w, eng, inp, f } = setup();
    for (let i = 0; i < 12; i++) w.foe(Math.cos(i) * 4, Math.sin(i) * 4);
    pressAndRun(eng, w, inp, { light: true });
    inp.moveX = 1; inp.moveZ = 0; inp.mag = 1;
    frames(eng, w, inp, 600);
    expect(f.x).toBeGreaterThan(55);
    expect(f.phase).toBe('ground');
  });

  it('Animation-Cancel: jeder Schlag lässt sich jederzeit per Dash oder Sprung abbrechen', () => {
    const { w, eng, inp, f } = setup('zweihaender');
    w.foe(0, 2.5);
    tick(eng, w, inp, { light: true });
    expect(f.phase).toBe('move');
    tick(eng, w, inp);
    expect(f.moveT).toBeLessThan(eng.move!.hits[0].t0);
    let ev = tick(eng, w, inp, { dash: true });
    expect(ev.has('cancel')).toBe(true);
    expect(f.phase).toBe('dash');
    expect(f.moveIdx).toBe(-1);
    frames(eng, w, inp, 30);
    tick(eng, w, inp, { heavy: true });
    expect(f.phase).toBe('move');
    ev = tick(eng, w, inp, { jump: true });
    expect(ev.has('cancel')).toBe(true);
    expect(f.phase).toBe('air');
    expect(f.grounded).toBe(false);
  });

  it('Doppelsprung trägt höher als ein Sprung; Zweihänder hat zwei, Doppelklinge drei Sprünge', () => {
    const single = setup('zweihaender');
    tick(single.eng, single.w, single.inp, { jump: true });
    let top1 = 0;
    for (let i = 0; i < 90; i++) { tick(single.eng, single.w, single.inp); top1 = Math.max(top1, single.f.y); }
    expect(single.f.grounded).toBe(true);

    const dbl = setup('zweihaender');
    tick(dbl.eng, dbl.w, dbl.inp, { jump: true });
    frames(dbl.eng, dbl.w, dbl.inp, 18);
    expect(tick(dbl.eng, dbl.w, dbl.inp, { jump: true }).has('jump')).toBe(true);
    let top2 = 0;
    for (let i = 0; i < 12; i++) { tick(dbl.eng, dbl.w, dbl.inp); top2 = Math.max(top2, dbl.f.y); }
    expect(dbl.f.jumps).toBe(2);
    expect(tick(dbl.eng, dbl.w, dbl.inp, { jump: true }).has('jump')).toBe(false);
    for (let i = 0; i < 90; i++) { tick(dbl.eng, dbl.w, dbl.inp); top2 = Math.max(top2, dbl.f.y); }
    expect(top2).toBeGreaterThan(top1 * 1.6);

    const dop = setup('doppel');
    tick(dop.eng, dop.w, dop.inp, { jump: true });
    frames(dop.eng, dop.w, dop.inp, 15);
    tick(dop.eng, dop.w, dop.inp, { jump: true });
    frames(dop.eng, dop.w, dop.inp, 12);
    expect(tick(dop.eng, dop.w, dop.inp, { jump: true }).has('jump')).toBe(true);
    expect(dop.f.jumps).toBe(3);
  });

  it('Air-Dash: hält die Höhe, schießt waagrecht voran; Doppelklinge zwei, andere ein Luft-Dash je Flug', () => {
    const { w, eng, inp, f } = setup('saebel');
    tick(eng, w, inp, { jump: true });
    frames(eng, w, inp, 14);
    const y0 = f.y, x0 = f.x;
    inp.moveX = 1; inp.moveZ = 0; inp.mag = 1;
    const ev = tick(eng, w, inp, { dash: true });
    expect(ev.has('dash')).toBe(true);
    expect(ev.items[0].a).toBe(1);
    frames(eng, w, inp, 14);
    expect(Math.abs(f.y - y0)).toBeLessThan(0.05);
    expect(f.x - x0).toBeGreaterThan(2.8);
    frames(eng, w, inp, 2);
    expect(tick(eng, w, inp, { dash: true }).has('dash')).toBe(false);

    const d = setup('doppel');
    tick(d.eng, d.w, d.inp, { jump: true });
    frames(d.eng, d.w, d.inp, 10);
    d.inp.moveX = 1; d.inp.moveZ = 0; d.inp.mag = 1;
    tick(d.eng, d.w, d.inp, { dash: true });
    frames(d.eng, d.w, d.inp, 14);
    expect(tick(d.eng, d.w, d.inp, { dash: true }).has('dash')).toBe(true);
    expect(d.f.airDashes).toBe(2);
    for (let i = 0; i < 120 && !d.f.grounded; i++) tick(d.eng, d.w, d.inp);
    expect(d.f.grounded).toBe(true);
    expect(d.f.airDashes).toBe(0);
  });

  it('Klippen- und Decksprünge: von einer Kante fällt die Figur frei, auf einer erhöhten Fläche landet sie wieder', () => {
    const { w, eng, inp, f } = setup();
    w.plats.push({ x0: -3, x1: 3, z0: -3, z1: 3, y: 2.2 });
    eng.place(0, 2.2, 0, 0);
    // auf der Plattform (Brücke) springen und wieder auf ihr landen – nicht durch sie hindurch in die Tiefe
    tick(eng, w, inp, { jump: true });
    for (let i = 0; i < 120 && !f.grounded; i++) tick(eng, w, inp);
    expect(f.grounded).toBe(true);
    expect(f.y).toBeCloseTo(2.2, 1);
    // über die Kante laufen: freier Fall bis auf den Boden darunter
    inp.moveX = 0; inp.moveZ = 1; inp.mag = 1;
    let fell = false;
    for (let i = 0; i < 200; i++) { if (tick(eng, w, inp).has('fall')) fell = true; if (f.z > 4 && f.grounded) break; }
    expect(fell).toBe(true);
    expect(f.y).toBeCloseTo(0, 1);
    // aus dem Lauf auf die Plattform hinaufspringen (Deck/Klippe): oben landen
    eng.place(0, 0, -6, 0);
    inp.moveX = 0; inp.moveZ = 1; inp.mag = 1;
    frames(eng, w, inp, 20);
    tick(eng, w, inp, { jump: true });
    frames(eng, w, inp, 14);
    tick(eng, w, inp, { jump: true });
    for (let i = 0; i < 120 && !f.grounded; i++) tick(eng, w, inp);
    expect(f.grounded).toBe(true);
    expect(f.y).toBeCloseTo(2.2, 1);
  });
});

describe('Action-Kampf: Soft-Lock und Magnet-Schritt', () => {
  it('richtet sich auf den nächsten Gegner im Kegel aus und gleitet heran, ohne hindurchzulaufen', () => {
    const { w, eng, inp, f } = setup('saebel');
    const foe = w.foe(1.2, 4.0);
    inp.moveX = 0; inp.moveZ = 1; inp.mag = 0.5;
    tick(eng, w, inp, { light: true });
    inp.mag = 0;
    expect(f.lockId).toBe(foe.id);
    expect(Math.abs(f.yaw - Math.atan2(1.2, 4))).toBeLessThan(0.05);
    untilCancel(eng, w, inp);
    const d = Math.hypot(foe.x - f.x, foe.z - f.z);
    expect(d).toBeLessThan(2.4);
    expect(d).toBeGreaterThan(foe.radius + 0.6);
    expect(foe.hits).toBe(1);
  });

  it('gleitet höchstens 3,5 m weit (kein Luftschlagen über das halbe Schlachtfeld)', () => {
    const { w, eng, inp, f } = setup('langklinge');
    w.foe(0, 6.8);
    tick(eng, w, inp, { light: true });
    for (let i = 0; i < 30; i++) tick(eng, w, inp);
    expect(f.z).toBeLessThanOrEqual(T.magnetMax + 0.05);
    expect(f.z).toBeGreaterThan(3.0);
  });

  it('Kameradrehung, Sprung und Dash lösen das weiche Ziel sofort', () => {
    const { w, eng, inp, f } = setup();
    w.foe(0, 3);
    tick(eng, w, inp, { light: true });
    expect(f.lockId).not.toBe('');
    inp.camYaw = 0.2; // 0,2 rad in einem Bild = 12 rad/s
    const ev = tick(eng, w, inp);
    expect(ev.has('lockLost')).toBe(true);
    expect(f.lockId).toBe('');
    // während der Sperre wird kein neues Ziel gegriffen
    frames(eng, w, inp, 20);
    tick(eng, w, inp, { light: true });
    expect(f.lockId).toBe('');
    frames(eng, w, inp, 40);
    tick(eng, w, inp, { light: true });
    expect(f.lockId).not.toBe('');
    tick(eng, w, inp, { jump: true });
    expect(f.lockId).toBe('');
    for (let i = 0; i < 90 && !f.grounded; i++) tick(eng, w, inp);
    tick(eng, w, inp, { light: true });
    expect(f.lockId).not.toBe('');
    tick(eng, w, inp, { dash: true });
    expect(f.lockId).toBe('');
  });
});

describe('Action-Kampf: Eingabepuffer und Kombos', () => {
  it('reines Drücken von Leicht ergibt die volle Kette mit Flächen-Finisher, der Truppen wegschleudert', () => {
    for (const id of PHYSICAL_STYLES) {
      const { w, eng, inp } = setup(id);
      w.foe(0, 2.2);
      const seen: string[] = [];
      for (let i = 0; i < 400 && seen.length < ACTION_STYLES[id].light.length; i++) {
        const ev = tick(eng, w, inp, { light: i % 6 === 0 });
        for (let k = 0; k < ev.n; k++) if (ev.items[k].type === 'move') seen.push(ev.items[k].s);
      }
      const st = ACTION_STYLES[id];
      expect(seen, id).toEqual(st.light.map((m) => m.id));
      expect(st.light.length).toBeGreaterThanOrEqual(id === 'doppel' ? 7 : 5);
      const fin = st.light[st.light.length - 1];
      expect(fin.finisher, id).toBe(true);
      expect(fin.hits.some((h) => h.fling > 0), id).toBe(true);
    }
  });

  it('Puffer 160 ms: zu früh gedrückt (im Fenster) wird nachgeholt, viel zu früh verfällt', () => {
    const a = setup('saebel');
    a.w.foe(0, 2.2);
    tick(a.eng, a.w, a.inp, { light: true });
    const m1 = a.eng.move!;
    while (a.f.moveT < m1.cancel - 0.13) tick(a.eng, a.w, a.inp);
    tick(a.eng, a.w, a.inp, { light: true });
    expect(a.f.moveId).toBe(m1.id);
    for (let i = 0; i < 12; i++) tick(a.eng, a.w, a.inp);
    expect(a.f.moveId).toBe(ACTION_STYLES.saebel.light[1].id);

    const b = setup('zweihaender');
    b.w.foe(0, 2.5);
    tick(b.eng, b.w, b.inp, { light: true });
    const m = b.eng.move!;
    expect(m.cancel).toBeGreaterThan(0.25);
    tick(b.eng, b.w, b.inp, { light: true }); // gut 0,3 s vor dem Ansatzpunkt
    for (let i = 0; i < 60; i++) tick(b.eng, b.w, b.inp);
    expect(b.f.lightIdx).toBe(1);
    expect(b.f.moveId === '' || b.f.moveId === m.id).toBe(true);
  });

  it('L → S ist der Schildbrecher-Stoß und knackt Blockhaltung', () => {
    const { w, eng, inp } = setup('saebel');
    const foe = w.foe(0, 2.4, { guard: true });
    pressAndRun(eng, w, inp, { light: true });
    expect(foe.hits).toBe(0);
    tick(eng, w, inp, { heavy: true });
    expect(eng.f.moveId).toBe('saebel.b1');
    expect(eng.move!.label).toBe('Schildbrecher-Stoß');
    frames(eng, w, inp, 30);
    expect(foe.guardBroken).toBe(true);
    expect(foe.hits).toBeGreaterThan(0);
  });

  it('L → L → S Orkan-Launcher: bis zu 12 Gegner hoch, dann 3er-Luft-Kombo mit verlangsamtem Fall und Meteor mit Druckwelle', () => {
    const { w, eng, inp, f } = setup('saebel');
    for (let i = 0; i < 15; i++) w.foe(Math.cos(i * 0.42) * 1.1, 1.3 + Math.sin(i * 0.42) * 1.1);
    pressAndRun(eng, w, inp, { light: true });
    pressAndRun(eng, w, inp, { light: true });
    tick(eng, w, inp, { heavy: true });
    expect(eng.move!.label).toBe('Orkan-Launcher');
    untilCancel(eng, w, inp);
    const up = w.foes.filter((x) => x.launched > 0);
    expect(up.length).toBe(12);
    expect(f.grounded).toBe(false);
    // Luft-Kette: drei Leichte in der Luft
    const airMoves: string[] = [];
    let hovered = false;
    for (let i = 0; i < 200 && airMoves.length < 3; i++) {
      const ev = tick(eng, w, inp, { light: i % 5 === 0 });
      for (let k = 0; k < ev.n; k++) if (ev.items[k].type === 'move') airMoves.push(ev.items[k].s);
      if (f.hover > 0) hovered = true;
    }
    expect(airMoves).toEqual(ACTION_STYLES.saebel.air.map((m) => m.id));
    untilCancel(eng, w, inp);
    frames(eng, w, inp, 3);
    expect(hovered).toBe(true);
    const juggled = w.foes.filter((x) => x.airHits >= 2);
    expect(juggled.length).toBeGreaterThan(0);
    expect(f.grounded).toBe(false);
    // Meteor-Sturzangriff: Schwer in der Luft, Einschlag beim Aufprall
    tick(eng, w, inp, { heavy: true });
    expect(f.moveKind).toBe('meteor');
    let impact = false;
    for (let i = 0; i < 120; i++) { if (tick(eng, w, inp).has('impact')) { impact = true; break; } }
    expect(impact).toBe(true);
    expect(f.grounded).toBe(true);
    expect(w.log.some((l) => l.move === 'saebel.m')).toBe(true);
  });

  it('L ×3 → S ist der 360°-Feger (trifft rundum), L ×4 → S die Langstrecken-Schockwelle (14 m+)', () => {
    const a = setup('zweihaender');
    const front = a.w.foe(0, 2.6);
    const back = a.w.foe(0, -3.6);
    const side = a.w.foe(4.2, 0);
    for (let i = 0; i < 3; i++) pressAndRun(a.eng, a.w, a.inp, { light: true });
    tick(a.eng, a.w, a.inp, { heavy: true });
    expect(a.eng.move!.label).toBe('360°-Massenschlacht-Feger');
    const before = back.hits + side.hits;
    frames(a.eng, a.w, a.inp, 70);
    expect(back.hits + side.hits - before).toBeGreaterThanOrEqual(2);
    void front;

    const b = setup('langklinge');
    b.w.foe(0, 2.5);
    const far = b.w.foe(0.6, 14);
    for (let i = 0; i < 4; i++) pressAndRun(b.eng, b.w, b.inp, { light: true });
    tick(b.eng, b.w, b.inp, { heavy: true });
    expect(b.eng.move!.label).toBe('Langstrecken-Schockwelle');
    expect(b.eng.move!.hits[0].shape).toBe('line');
    expect(b.eng.move!.hits[0].range).toBeGreaterThanOrEqual(14);
    frames(b.eng, b.w, b.inp, 50);
    expect(far.hits).toBe(1);
  });
});

describe('Action-Kampf: Perfektes Ausweichen (Sturm-Schritt)', () => {
  const attacker = (x: number, z: number, yaw: number) => ({ id: 'boss', x, z, yaw, radius: 0.7 });

  it('ein Dash bis 180 ms vor dem Treffer teleportiert hinter den Rücken des Angreifers und öffnet ein Konterfenster', () => {
    const { w, eng, inp, f } = setup('saebel');
    const boss = w.foe(0, 3, { id: 'boss', radius: 0.7, yaw: Math.PI });
    tick(eng, w, inp, { dash: true });
    frames(eng, w, inp, 9); // 150 ms nach dem Dash
    const r = eng.incoming(attacker(boss.x, boss.z, boss.yaw), 0, -1, w);
    expect(r).toBe('perfect');
    // hinter dem Angreifer: auf der Seite, die seinem Blick abgewandt ist
    const fx = Math.sin(boss.yaw), fz = Math.cos(boss.yaw);
    expect((f.x - boss.x) * fx + (f.z - boss.z) * fz).toBeLessThan(-0.8);
    expect(Math.abs(Math.atan2(boss.x - f.x, boss.z - f.z) - f.yaw)).toBeLessThan(0.01);
    expect(f.counterT).toBeGreaterThan(1);
    expect(f.lockId).toBe('boss');
    // Konter: der nächste Treffer ist ein garantierter Krit
    frames(eng, w, inp, 30);
    pressAndRun(eng, w, inp, { light: true });
    const hit = w.log.find((l) => l.id === 'boss');
    expect(hit?.crit).toBe(T.counterCrit);
  });

  it('später als 180 ms ist es nur ein Ausweichen, danach ein Treffer; die Langklinge hat ein längeres Fenster', () => {
    const a = setup('saebel');
    tick(a.eng, a.w, a.inp, { dash: true });
    frames(a.eng, a.w, a.inp, 11); // ~200 ms
    expect(a.eng.incoming(attacker(0, 3, Math.PI), 0, -1, a.w)).toBe('dodged');
    frames(a.eng, a.w, a.inp, 30);
    expect(a.eng.incoming(attacker(0, 3, Math.PI), 0, -1, a.w)).toBe('hit');

    const b = setup('langklinge');
    tick(b.eng, b.w, b.inp, { dash: true });
    frames(b.eng, b.w, b.inp, 14); // ~250 ms
    expect(ACTION_STYLES.langklinge.perfectWindow).toBeGreaterThan(T.perfectWindow);
    expect(b.eng.incoming(attacker(0, 3, Math.PI), 0, -1, b.w)).toBe('perfect');
  });

  it('versperrter Rücken (Wand): Sturm-Schritt weicht zur Seite aus, nie in die Wand', () => {
    const { w, eng, inp, f } = setup('saebel');
    w.walls.push({ x: 0, z: 5.2, r: 1.2 });
    tick(eng, w, inp, { dash: true });
    frames(eng, w, inp, 4);
    expect(eng.incoming(attacker(0, 3, Math.PI), 0, -1, w)).toBe('perfect');
    expect(Math.hypot(f.x - 0, f.z - 5.2)).toBeGreaterThanOrEqual(1.2 + f.radius - 1e-6);
  });

  it('Hyper-Armor: schwere Finisher des Zweihänders werden nicht unterbrochen', () => {
    const { w, eng, inp } = setup('zweihaender');
    w.foe(0, 2.6);
    for (let i = 0; i < 4; i++) pressAndRun(eng, w, inp, { light: true });
    tick(eng, w, inp, { light: true });
    expect(eng.move!.hyper).toBe(true);
    frames(eng, w, inp, 3);
    expect(eng.incoming(attacker(0, 3, Math.PI), 0, -1, w)).toBe('armor');
  });
});

describe('Action-Kampf: Haltung (Posture) und Haltungsbruch-Finisher', () => {
  it('Elite, Kommandanten und Endbosse haben eine Haltungsleiste, normale Gegner nicht', () => {
    expect(hasPostureBar({ elite: true })).toBe(true);
    expect(hasPostureBar({ boss: true })).toBe(true);
    expect(hasPostureBar({ raid: 'captain' })).toBe(true);
    expect(hasPostureBar({})).toBe(false);
  });

  it('Haltungsschaden bricht die Leiste, das Ziel taumelt, danach lädt sie sich wieder auf', () => {
    const p = makePosture(100);
    expect(hitPosture(p, 60)).toBe(false);
    expect(postureFrac(p)).toBeCloseTo(0.4);
    expect(hitPosture(p, 50)).toBe(true);
    breakPosture(p, 2);
    expect(postureFrac(p)).toBe(0);
    expect(hitPosture(p, 10)).toBe(false);
    let ended = false;
    for (let i = 0; i < 130; i++) if (stepPosture(p, DT)) ended = true;
    expect(ended).toBe(true);
    expect(postureFrac(p)).toBe(1);
    hitPosture(p, 50);
    for (let i = 0; i < 60; i++) stepPosture(p, DT);
    expect(p.value).toBe(50);
    for (let i = 0; i < 6 * 60; i++) stepPosture(p, DT);
    expect(p.value).toBeGreaterThan(70);
  });

  it('Boss-Haltungsbruch: Kette bricht die Leiste, Schwer löst den filmreifen Finisher aus', () => {
    const { w, eng, inp, f } = setup('zweihaender');
    const boss = w.foe(0, 2.8, { id: 'boss', boss: true, radius: 0.7, posture: makePosture(160) });
    for (let i = 0; i < 300 && boss.posture!.brokenT <= 0; i++) tick(eng, w, inp, { light: i % 8 === 0 });
    expect(boss.posture!.brokenT).toBeGreaterThan(0);
    frames(eng, w, inp, 2);
    expect(f.finisherId).toBe('boss');
    for (let i = 0; i < 60 && f.moveKind !== 'finisher'; i++) tick(eng, w, inp, { heavy: i % 10 === 0 });
    expect(f.moveKind).toBe('finisher');
    expect(f.iframes).toBeGreaterThan(0.5);
    const ev = eng.events;
    void ev;
    frames(eng, w, inp, 80);
    expect(w.log.some((l) => l.finisher && l.id === 'boss')).toBe(true);
  });
});

describe('Action-Kampf: die sechs physischen Stile', () => {
  it('jeder Stil hat Kette, vier Verzweigungen, Luft-Kette, Meteor, Finisher und vier Techniken mit Abklingzeit', () => {
    expect(PHYSICAL_STYLES).toEqual(['zweihaender', 'saebel', 'doppel', 'langklinge', 'sturmfaust', 'erdspalter']);
    for (const id of PHYSICAL_STYLES) {
      const s = ACTION_STYLES[id];
      expect(s.physical).toBe(true);
      expect(s.branch.map((b) => b.label)).toEqual(['Schildbrecher-Stoß', 'Orkan-Launcher', '360°-Massenschlacht-Feger', 'Langstrecken-Schockwelle']);
      expect(s.air.length).toBeGreaterThanOrEqual(3);
      expect(s.air.length).toBeLessThanOrEqual(4);
      expect(s.meteor.meteor).toBe(true);
      expect(s.skills.map((k) => k.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      for (const k of s.skills) { expect(k.cd).toBeGreaterThan(0); expect(k.label.length).toBeGreaterThan(2); }
      expect(s.branch[1].hits[0].launch).toBeGreaterThan(9);
      expect(s.branch[1].hits[0].maxTargets).toBe(12);
      expect(s.branch[2].hits.every((h) => h.arc >= 6.2 || h.shape === 'circle')).toBe(true);
      // Trefferfenster liegen innerhalb der Dauer, Ansatzpunkt nach dem ersten Fenster
      for (const m of [...s.light, ...s.branch, s.heavy, ...s.air, s.finisher, ...s.skills]) {
        for (const h of m.hits) { expect(h.t0).toBeGreaterThanOrEqual(0); expect(h.t1).toBeLessThanOrEqual(m.dur + 1e-9); expect(h.t1).toBeGreaterThan(h.t0); }
        if (m.hits.length) expect(m.cancel).toBeGreaterThanOrEqual(m.hits[0].t0);
      }
    }
    // Eigenheiten
    expect(ACTION_STYLES.doppel.jumps).toBe(3);
    expect(ACTION_STYLES.doppel.airDashes).toBe(2);
    expect(ACTION_STYLES.doppel.dashSpeed).toBeGreaterThan(ACTION_STYLES.saebel.dashSpeed);
    expect(ACTION_STYLES.saebel.critMult).toBeGreaterThan(2);
    expect(ACTION_STYLES.langklinge.penBonus).toBeGreaterThan(0);
    expect(ACTION_STYLES.zweihaender.light.at(-1)!.hyper).toBe(true);
    expect(ACTION_STYLES.zweihaender.postureK).toBeGreaterThanOrEqual(Math.max(...PHYSICAL_STYLES.map((s) => ACTION_STYLES[s].postureK)));
    expect(ACTION_STYLES.erdspalter.skills.some((k) => k.hits.some((h) => h.pull))).toBe(true);
    expect(ACTION_STYLES.sturmfaust.light.every((m) => m.dur <= 0.7)).toBe(true);
  });

  it('alle vier Techniken jedes Stils lassen sich auslösen, treffen und gehen in die Abklingzeit', () => {
    for (const id of PHYSICAL_STYLES) {
      for (let slot = 1; slot <= 4; slot++) {
        const { w, eng, inp, f } = setup(id);
        const foe = w.foe(0.4, 2.4);
        const sk = ACTION_STYLES[id].skills[slot - 1];
        const ev = tick(eng, w, inp, { skill: slot });
        expect(ev.has('skill'), `${id} ${slot}`).toBe(true);
        expect(f.moveId).toBe(sk.id);
        expect(f.skillCd[slot - 1]).toBeCloseTo(sk.cd, 1);
        for (let i = 0; i < 160 && f.phase !== 'ground'; i++) tick(eng, w, inp);
        if (sk.hits.length) expect(foe.hits, `${id} ${sk.label}`).toBeGreaterThan(0);
        // auf Abklingzeit: verworfen
        expect(tick(eng, w, inp, { skill: slot }).has('notReady')).toBe(true);
      }
    }
  });

  it('Stilwechsel jederzeit: mitten in der Kette als Wechselschlag (1,6-fach), sonst sofort', () => {
    const { w, eng, inp, f } = setup('saebel');
    w.foe(0, 2.2);
    expect(eng.switchStyle('erdspalter')).toBe('instant');
    expect(f.style).toBe('erdspalter');
    pressAndRun(eng, w, inp, { light: true });
    expect(eng.switchStyle('doppel', inp)).toBe('swap');
    expect(f.style).toBe('doppel');
    expect(f.moveKind).toBe('swap');
    expect(f.moveBonus).toBeCloseTo(1.6);
    expect(f.moveId.startsWith('doppel.l')).toBe(true);
  });

  it('Kampfwerte bleiben im Balance-Rahmen: Ketten-DPS nahe dem Kampfmodell, Techniken höchstens +30 %', () => {
    const model = FIGHT_MODEL.hitsPerSec * FIGHT_MODEL.comboMult;
    for (const id of PHYSICAL_STYLES) {
      const s = ACTION_STYLES[id];
      // Kette beim Durchdrücken: jeder Schritt bis zum Ansatzpunkt, der Finisher bis zu seinem letzten Treffer
      let time = 0, dmg = 0;
      s.light.forEach((m, i) => {
        time += i === s.light.length - 1 ? lastHitEnd(m) : m.cancel;
        dmg += m.hits.reduce((a, h) => a + h.dmg, 0);
      });
      const dps = dmg / time;
      expect(dps / model, `${id} Kette ${dps.toFixed(2)}`).toBeGreaterThan(0.85);
      expect(dps / model, `${id} Kette ${dps.toFixed(2)}`).toBeLessThan(1.45);
      // Techniken auf Abklingzeit: Zusatzschaden gegenüber der Kette in derselben Zeit
      let gain = 0;
      for (const k of s.skills) gain += Math.max(0, k.hits.reduce((a, h) => a + h.dmg, 0) - k.dur * dps) / k.cd;
      expect(gain / dps, `${id} Techniken`).toBeLessThan(0.3);
    }
  });
});

describe('Action-Kampf: Determinismus und Leistung', () => {
  const script = (eng: ActionCombatEngine, w: TestWorld, inp: ActionInput) => {
    for (let i = 0; i < 900; i++) {
      inp.moveX = Math.sin(i * 0.01); inp.moveZ = Math.cos(i * 0.01); inp.mag = i % 200 < 120 ? 1 : 0;
      inp.camYaw = i % 300 === 0 ? inp.camYaw + 0.3 : inp.camYaw;
      tick(eng, w, inp, { light: i % 7 === 0, heavy: i % 53 === 0, jump: i % 97 === 0, dash: i % 61 === 0, skill: i % 131 === 0 ? 1 + (i % 4) : 0 });
    }
  };

  it('gleiche Eingaben ergeben denselben Zustand (Server-tauglich, JSON-Daten)', () => {
    const runOnce = () => {
      const s = setup('doppel');
      for (let i = 0; i < 10; i++) s.w.foe(Math.cos(i) * 5, Math.sin(i) * 5);
      script(s.eng, s.w, s.inp);
      return JSON.stringify(s.f) + JSON.stringify(s.w.foes);
    };
    const a = runOnce(), b = runOnce();
    expect(a).toBe(b);
    expect(() => JSON.parse(a.slice(0, a.indexOf('}[') + 1))).not.toThrow();
  });

  it('Flächen-Kombos gegen 100+ Ziele bleiben weit unter dem Bildbudget und legen keine neuen Ziel-/Ereignisobjekte an', () => {
    const { w, eng, inp } = setup('zweihaender');
    for (let i = 0; i < 140; i++) w.foe(Math.cos(i * 0.7) * (2 + (i % 12)), Math.sin(i * 0.7) * (2 + (i % 12)), { mass: i % 3 === 0 });
    const pool = eng.pool, ev0 = eng.events.items[0];
    const t0 = performance.now();
    script(eng, w, inp);
    const ms = (performance.now() - t0) / 900;
    expect(eng.pool).toBe(pool);
    expect(eng.events.items[0]).toBe(ev0);
    expect(eng.poolN).toBeLessThanOrEqual(pool.length);
    expect(ms).toBeLessThan(1.5);
  });

  it('Trefferformen: Bogen, Kreis und Linie mit Höhenband', () => {
    const f = { x: 0, y: 0, z: 0, yaw: 0 };
    const t = { id: 't', x: 0, y: 0, z: 2, radius: 0.4, height: 1.8, yaw: 0, alive: true, airborne: false, mass: false, broken: false, boss: false, ref: 0 };
    const arc = { ...moveOf('saebel.l1').hits[0] };
    expect(inShape(f, arc, t)).toBe(true);
    expect(inShape(f, arc, { ...t, z: -2 })).toBe(false);
    expect(inShape(f, arc, { ...t, y: 5 })).toBe(false);
    const line = moveOf('langklinge.b4').hits[0];
    expect(inShape(f, line, { ...t, z: 15 })).toBe(true);
    expect(inShape(f, line, { ...t, x: 3, z: 8 })).toBe(false);
    const ring = moveOf('erdspalter.k1').hits[1];
    expect(inShape(f, ring, { ...t, z: 1 })).toBe(false);
    expect(inShape(f, ring, { ...t, z: 4.5 })).toBe(true);
  });
});

describe('Action-Kampf: Fighter-HUD am Handy', () => {
  it('Touch-Gruppe zu Fuß: Sprung, Dash und die vier Kampfkünste sind da, kein Knopf überlappt einen anderen', async () => {
    const { TOUCH_FOOT } = await import('../src/data/touchLayout');
    const acts = TOUCH_FOOT.map((b) => b.action);
    for (const a of ['attack', 'heavy', 'jump', 'dodge', 'art1', 'art2', 'art3', 'art4']) expect(acts).toContain(a);
    for (let i = 0; i < TOUCH_FOOT.length; i++) for (let j = i + 1; j < TOUCH_FOOT.length; j++) {
      const a = TOUCH_FOOT[i], b = TOUCH_FOOT[j];
      const d = Math.hypot(a.right + a.size / 2 - (b.right + b.size / 2), a.bottom + a.size / 2 - (b.bottom + b.size / 2));
      expect(d, `${a.action} / ${b.action}`).toBeGreaterThanOrEqual((a.size + b.size) / 2);
    }
    // die Gruppe bleibt in der rechten Hälfte eines 390 px breiten Handys (links liegt der Lauf-Stick) bis auf schmale Randknöpfe
    for (const b of TOUCH_FOOT) expect(b.right + b.size, b.action).toBeLessThanOrEqual(280);
  });
});
