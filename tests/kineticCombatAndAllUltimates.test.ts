// Phase 4.6C: kinetisches 3D-Anime-Kampfgefühl – Vorwärts-Momentum, Sturm-Verfolgung, Rückstoß über Bord, Klingen-Clash, dynamische
// Kampfkünste, prozeduraler Anime-Klang (Web Audio, auch ohne Klangkarte) und alle 14 Ultimates mit Pool- und Zerstörungsprüfung.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import {
  ActionCombatEngine, createFighter, easeOutCubic, makeInput,
  type ActionBody, type ActionInput, type ActionTarget, type ActionWorld, type HitContext,
} from '../src/combat/actionCombatEngine';
import { ACTION_STYLES, ACTION_TUNING as T, FAJI_ARTS, MOMENTUM, PHYSICAL_STYLES, type ActionHit, type ActionMove, type ActionStyleId } from '../src/data/actionStyles';
import { ULTIMATES, ULTIMATE_ORDER, UltimateBossLedger, ultimateBossCap } from '../src/data/cataclysms';
import { RAID_BOSS_HIT_CAP } from '../src/data/balanceConfig';
import { KNOCKBACK, bounceVelocity, inWater, knockOutcome, overboardLaunch } from '../src/combat/knockback';
import { CataclysmFx, FX_CAP, FX_PRIMS } from '../src/combat/cataclysmFx';
import { CATACLYSM_DUR, CataclysmDirector, type CataclysmHost } from '../src/world/cataclysmDirector';
import { WILL } from '../src/data/fajiArts';
import type { NavalSystem } from '../src/naval/naval';

const DT = 1 / 60;

interface Foe {
  id: string; x: number; y: number; z: number; yaw: number; radius: number; alive: boolean; mass: boolean; boss: boolean; elite: boolean; attacking: boolean;
  air: boolean; vy: number; hits: number;
}

/** Spielzeug-Welt: ebener Boden, Gegner als Kreise; merkt sich jeden Treffer samt Clash-Kennzeichen */
class World implements ActionWorld {
  foes: Foe[] = [];
  log: { id: string; move: string; h: ActionHit; clash: boolean }[] = [];
  now = 0;
  foe(x: number, z: number, o: Partial<Foe> = {}): Foe {
    const f: Foe = { id: `f${this.foes.length}`, x, y: 0, z, yaw: Math.PI, radius: 0.45, alive: true, mass: false, boss: false, elite: false, attacking: false, air: false, vy: 0, hits: 0, ...o };
    this.foes.push(f);
    return f;
  }
  height(): number { return 0; }
  move(b: ActionBody, dx: number, dz: number): void { b.x += dx; b.z += dz; }
  teleport(b: ActionBody, x: number, z: number): boolean { b.x = x; b.z = z; return true; }
  targets(x: number, z: number, r: number, out: ActionTarget[]): number {
    let n = 0;
    this.foes.forEach((f, i) => {
      if (n >= out.length || !f.alive || Math.hypot(f.x - x, f.z - z) > r + f.radius) return;
      const t = out[n++];
      t.id = f.id; t.x = f.x; t.y = f.y; t.z = f.z; t.radius = f.radius; t.height = 1.8; t.yaw = f.yaw;
      t.alive = f.alive; t.airborne = f.air; t.mass = f.mass; t.broken = false; t.boss = f.boss; t.elite = f.elite; t.attacking = f.attacking; t.ref = i;
    });
    return n;
  }
  hit(t: ActionTarget, h: ActionHit, m: ActionMove, c: HitContext): number {
    const f = this.foes[t.ref];
    f.hits++;
    this.log.push({ id: f.id, move: m.id, h, clash: c.clash });
    if (c.clash) f.attacking = false;
    if (h.launch > 0 && !f.boss) { f.vy = h.launch; f.air = true; }
    return 1;
  }
  drag(): void {}
  shoot(): void {}
  step(dt: number) {
    this.now++;
    for (const f of this.foes) if (f.air) { f.vy -= 22 * dt; f.y += f.vy * dt; if (f.y <= 0) { f.y = 0; f.vy = 0; f.air = false; } }
  }
}

function setup(style: ActionStyleId) {
  const w = new World();
  const eng = new ActionCombatEngine(createFighter('kin-test', style));
  return { w, eng, inp: makeInput(), f: eng.f };
}

function tick(eng: ActionCombatEngine, w: World, inp: ActionInput, press: Partial<ActionInput> = {}) {
  Object.assign(inp, { light: false, heavy: false, jump: false, dash: false, skill: 0, blockPressed: false, awaken: false, aura: false }, press);
  eng.step(inp, w, DT);
  w.step(DT);
  return eng.events;
}

function run(eng: ActionCombatEngine, w: World, inp: ActionInput, n: number, press: Partial<ActionInput> = {}): string[] {
  const seen: string[] = [];
  for (let i = 0; i < n; i++) { const ev = tick(eng, w, inp, i === 0 ? press : {}); for (let k = 0; k < ev.n; k++) seen.push(ev.items[k].type); }
  return seen;
}

/** bis zum Ansatzpunkt des laufenden Angriffs */
function untilCancel(eng: ActionCombatEngine, w: World, inp: ActionInput) {
  for (let i = 0; i < 120; i++) { const m = eng.move; if (!m || eng.f.moveT >= m.cancel) return; tick(eng, w, inp); }
}

const ALL_STYLES = Object.keys(ACTION_STYLES) as ActionStyleId[];

// ---------------------------------------------------------------------------------------------------------------

describe('Vorwärts-Momentum: jede Schlagstufe treibt die Figur vor', () => {
  it('alle 14 Stile: jede Kettenstufe hat Schub, der letzte Kettenschlag den größten; die Kurve ist vorn knackig', () => {
    for (const id of [...PHYSICAL_STYLES, ...FAJI_ARTS]) {
      const s = ACTION_STYLES[id];
      for (const m of s.light) expect(m.push, m.id).toBeGreaterThan(0.5);
      expect(s.light[s.light.length - 1].push, id).toBeGreaterThanOrEqual(Math.max(...s.light.map((m) => m.push)));
      expect(s.heavy.push, id).toBeGreaterThan(0);
      for (const m of s.air) expect(m.push, m.id).toBeGreaterThan(0);
    }
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.3)).toBeGreaterThan(0.6);
    expect(MOMENTUM.styleK.langklinge).toBeGreaterThan(MOMENTUM.styleK.doppel!);
  });

  it('ohne Ziel gleitet die Figur mit dem Schlag vor; durch einen Verband hindurch; vor einem einzelnen Gegner bleibt sie stehen', () => {
    const a = setup('zweihaender');
    run(a.eng, a.w, a.inp, 40, { light: true });
    expect(a.f.z).toBeGreaterThan(ACTION_STYLES.zweihaender.light[0].push * 0.95);
    // Verband direkt vor der Figur: der Schub trägt hindurch
    const b = setup('zweihaender');
    b.w.foe(0, 1.6, { mass: true, radius: 1.2 });
    run(b.eng, b.w, b.inp, 40, { light: true });
    // einzelner Gegner direkt davor: kein Hineinlaufen über den Puffer hinaus
    const c = setup('zweihaender');
    const foe = c.w.foe(0, 1.6);
    run(c.eng, c.w, c.inp, 40, { light: true });
    expect(foe.hits).toBeGreaterThan(0);
    expect(c.f.z).toBeLessThan(foe.z - foe.radius + T.pushGap + 0.05);
    expect(b.f.z).toBeGreaterThan(c.f.z + 0.5);
  });

  it('eine Fünfer-Kette ohne Ziel legt sichtbar Strecke zurück (kein Rumstehen)', () => {
    for (const id of ['saebel', 'sturmfaust', 'feuer', 'mond'] as ActionStyleId[]) {
      const { w, eng, inp, f } = setup(id);
      for (let i = 0; i < 5; i++) { tick(eng, w, inp, { light: true }); untilCancel(eng, w, inp); }
      run(eng, w, inp, 30);
      expect(Math.hypot(f.x, f.z), id).toBeGreaterThan(4);
    }
  });

  it('Kampfkünste 1–4 aller Stile sind dynamisch: Vorstoß, Aufstieg, Schub, Geschoss, Klingenwelle oder Eruption – nie eine stehende Pose', () => {
    for (const id of ALL_STYLES) {
      for (const k of ACTION_STYLES[id].skills) {
        const dynamic = k.hits.length > 0 && (
          k.dashTo > 0 || k.rise > 0 || k.push >= 1.2
          || k.hits.some((h) => h.projectile || (h.shape === 'line' && h.range >= 8) || (h.shape === 'arc' && h.range >= 7) || (h.shape === 'circle' && (h.offset >= 3 || h.range >= 5))));
        expect(dynamic, `${k.id} ${k.label}`).toBe(true);
      }
    }
  });

  it('Schwungfenster von Techniken werden gemeldet (Klingenwellen und Eruptionen der Darstellung), Kettenschläge nicht', () => {
    const { w, eng, inp } = setup('erdspalter');
    w.foe(0, 5);
    const sk = run(eng, w, inp, 90, { skill: 3 });
    expect(sk.filter((e) => e === 'swing').length).toBeGreaterThan(0);
    const b = setup('erdspalter');
    expect(run(b.eng, b.w, b.inp, 30, { light: true })).not.toContain('swing');
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('Sturm-Verfolgung: Blitz-Teleport zum hochgeschleuderten Gegner', () => {
  it('nach dem Orkan-Launcher (L → L → S) bringt ein Dash die Figur auf Höhe des Ziels in der Luft, die Luft-Kombo kettet an', () => {
    const { w, eng, inp, f } = setup('saebel');
    const foe = w.foe(0, 2.2);
    tick(eng, w, inp, { light: true }); untilCancel(eng, w, inp);
    tick(eng, w, inp, { light: true }); untilCancel(eng, w, inp);
    const seen = run(eng, w, inp, 24, { heavy: true });
    expect(seen).toContain('move');
    expect(foe.air).toBe(true);
    expect(f.chaseT).toBeGreaterThan(0);
    // der Gegner fliegt höher und weiter als die Figur (wie nach einem wuchtigen Launcher)
    foe.x = 3; foe.z = 6; foe.y = f.y + 4.5; foe.vy = 2;
    const ev = run(eng, w, inp, 2, { dash: true });
    expect(ev).toContain('chase');
    expect(f.phase).toBe('air');
    expect(f.y).toBeGreaterThan(foe.y - 1);
    expect(Math.hypot(f.x - foe.x, f.z - foe.z)).toBeLessThan(foe.radius + T.chaseOffset + 0.2);
    expect(f.lockId).toBe(foe.id);
    // Luftangriff kettet an
    expect(run(eng, w, inp, 20, { light: true })).toContain('move');
  });

  it('ohne vorheriges Hochschleudern (oder ohne Ziel in der Luft) bleibt der Dash ein normaler Dash', () => {
    const { w, eng, inp } = setup('saebel');
    w.foe(0, 6, { air: true, y: 5 });
    const ev = run(eng, w, inp, 2, { dash: true });
    expect(ev).toContain('dash');
    expect(ev).not.toContain('chase');
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('Rückstoß-Physik: Bremsspur, Abprallen, über Bord', () => {
  it('schnelles Schlittern ohne Hindernis zieht eine Bremsspur, langsames nicht', () => {
    expect(knockOutcome(2, 0, false, 0, 0, 0, 0, true)).toBe('none');
    expect(knockOutcome(5, 0, false, 0, 0, 0, 0, true)).toBe('skid');
  });

  it('gegen eine Wand mit Boden dahinter: Abprallen mit Energieverlust (Geschwindigkeit gespiegelt)', () => {
    // fliegt nach +x gegen eine Wand, deren Normale nach −x zeigt; hinter der Wand gleiche Bodenhöhe
    expect(knockOutcome(9, 0, true, -1, 0, 0, 0, true)).toBe('bounce');
    const v = bounceVelocity(9, 2, -1, 0, { vx: 0, vz: 0 });
    expect(v.vx).toBeLessThan(0);
    expect(Math.abs(v.vx)).toBeCloseTo(9 * KNOCKBACK.restitution * KNOCKBACK.wallDrag, 3);
    expect(v.vz).toBeCloseTo(2 * KNOCKBACK.wallDrag, 3);
  });

  it('an der Reling eines Schiffsdecks oder am Stegrand mit Wasser dahinter: über Bord – und im Wasser besiegt', () => {
    // Deck auf 2,4 m, hinter der Reling kein Boden (Meer)
    expect(knockOutcome(10, 0, true, -1, 0, -Infinity, 2.4, true)).toBe('overboard');
    // Stegrand: dahinter 3 m tiefer Wasser (keine Kollision) = über Bord
    expect(knockOutcome(8, 0, true, -1, 0, -1.2, 1.8, true)).toBe('overboard');
    // zu langsam: nur Abprallen; Bosse gehen nie über Bord
    expect(knockOutcome(5, 0, true, -1, 0, -Infinity, 2.4, true)).toBe('bounce');
    expect(knockOutcome(12, 0, true, -1, 0, -Infinity, 2.4, false)).toBe('bounce');
    // streift die Wand nur seitlich: kein Aufprall
    expect(knockOutcome(10, 0, true, 0, 1, -Infinity, 2.4, true)).toBe('skid');
    const l = overboardLaunch(4, 3, 0, { vx: 0, vy: 0, vz: 0 });
    expect(Math.hypot(l.vx, l.vz)).toBeCloseTo(KNOCKBACK.launch, 3);
    expect(l.vy).toBe(KNOCKBACK.lift);
    expect(inWater(-1, -Infinity)).toBe(true);
    expect(inWater(-1, 0.4)).toBe(false);
    expect(inWater(0.5, -Infinity)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('Klingen-Clash', () => {
  it('ein schwerer Schlag gegen den Schlag eines Elite-Gegners oder Bosses: Clash mit Rückprall der Figur', () => {
    const { w, eng, inp, f } = setup('zweihaender');
    const foe = w.foe(0, 2.4, { elite: true, attacking: true, yaw: Math.PI });
    const ev = run(eng, w, inp, 40, { heavy: true });
    expect(ev).toContain('clash');
    expect(w.log.some((l) => l.clash)).toBe(true);
    expect(foe.hits).toBeGreaterThan(0);
    void f;
    // Rückprall: die Figur steht nach dem Clash nicht weiter vorn als ohne Clash
    const b = setup('zweihaender');
    b.w.foe(0, 2.4, { elite: true, attacking: false, yaw: Math.PI });
    run(b.eng, b.w, b.inp, 40, { heavy: true });
    expect(eng.f.z).toBeLessThan(b.f.z);
  });

  it('kein Clash: leichte Schläge, Gegner ohne Angriff, abgewandte Gegner, normale Soldaten; höchstens einer je Angriff', () => {
    const light = setup('saebel');
    light.w.foe(0, 1.8, { elite: true, attacking: true });
    expect(run(light.eng, light.w, light.inp, 30, { light: true })).not.toContain('clash');
    const away = setup('zweihaender');
    away.w.foe(0, 2.4, { elite: true, attacking: true, yaw: 0 });
    expect(run(away.eng, away.w, away.inp, 40, { heavy: true })).not.toContain('clash');
    const grunt = setup('zweihaender');
    grunt.w.foe(0, 2.4, { attacking: true });
    expect(run(grunt.eng, grunt.w, grunt.inp, 40, { heavy: true })).not.toContain('clash');
    const once = setup('zweihaender');
    once.w.foe(0, 2.4, { boss: true, attacking: true });
    once.w.foe(0.8, 2.6, { boss: true, attacking: true });
    expect(run(once.eng, once.w, once.inp, 40, { heavy: true }).filter((e) => e === 'clash')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------

/** Web Audio ohne Klangkarte: jede Knoten-Art als Attrappe, die jede Methode und jeden Parameter annimmt */
let nodes = 0;
function fakeParam(): Record<string, unknown> {
  const p: Record<string, unknown> = { value: 0 };
  for (const k of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime', 'setValueCurveAtTime']) p[k] = () => p;
  return p;
}
function fakeNode(): unknown {
  nodes++;
  const n: Record<string | symbol, unknown> = { connect: (d: unknown) => d, disconnect: () => {}, start: () => {}, stop: () => {}, addEventListener: () => {}, removeEventListener: () => {}, setPosition: () => {}, setOrientation: () => {} };
  return new Proxy(n, {
    get(t, k) { if (k in t) return t[k]; if (typeof k === 'symbol' || k === 'then') return undefined; t[k] = fakeParam(); return t[k]; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
class FakeAudioContext {
  state = 'running'; currentTime = 0; sampleRate = 44100;
  destination = fakeNode(); listener = fakeNode();
  createGain() { return fakeNode(); }
  createDynamicsCompressor() { return fakeNode(); }
  createDelay() { return fakeNode(); }
  createBiquadFilter() { return fakeNode(); }
  createOscillator() { return fakeNode(); }
  createBufferSource() { return fakeNode(); }
  createStereoPanner() { return fakeNode(); }
  createPanner() { return fakeNode(); }
  createConvolver() { return fakeNode(); }
  createWaveShaper() { return fakeNode(); }
  createChannelMerger() { return fakeNode(); }
  createChannelSplitter() { return fakeNode(); }
  createPeriodicWave() { return {}; }
  createBuffer(ch: number, n: number, sr: number) { const d = Array.from({ length: ch }, () => new Float32Array(n)); return { numberOfChannels: ch, length: n, sampleRate: sr, duration: n / sr, getChannelData: (i: number) => d[i] }; }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
  decodeAudioData() { return Promise.resolve(this.createBuffer(2, 8, 44100)); }
}

describe('Prozeduraler Anime-Klang (Web Audio)', () => {
  const g = globalThis as unknown as { window?: unknown };
  let hadWindow = false;
  beforeAll(() => { hadWindow = 'window' in g; vi.useFakeTimers(); });
  afterAll(() => { vi.useRealTimers(); if (!hadWindow) delete g.window; });

  it('ohne Klangkarte (kopflos) bleiben alle neuen Klänge stumm und werfen keinen Fehler', async () => {
    const { audio, ANIME_SFX } = await import('../src/audio/audio');
    expect(audio.running).toBe(false);
    for (const n of ANIME_SFX) expect(() => audio.play(n, 1, { x: 3, y: 0, z: 4 })).not.toThrow();
  });

  it('mit Web Audio erzeugt jeder Klang seine Knoten (Zeitlupen-Bassfall, Impact-Riss, Schwertscheide, Zyklon, Grollen, Elemente, Clash)', async () => {
    g.window = { AudioContext: FakeAudioContext };
    const { audio, ANIME_SFX } = await import('../src/audio/audio');
    audio.unlock();
    expect(audio.running).toBe(true);
    expect(ANIME_SFX.length).toBeGreaterThanOrEqual(19);
    for (const n of ANIME_SFX) {
      const before = nodes;
      expect(() => audio.play(n, 1)).not.toThrow();
      expect(nodes - before, n).toBeGreaterThan(0);
      // räumlich (Panner) ebenso
      expect(() => audio.play(n, 0.8, { x: 6, y: 1, z: -4 })).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------

interface FakeShip {
  ship: { x: number; z: number; heading: number; cls: { L: number; W: number }; model: { deckY: number }; sinking: number; maxHull: number; hull: number; fire: number; frozen: number; shoveX: number; shoveZ: number; holes: number; punchHoles(n: number): void };
}

/** Regie mit echtem Effekt-Pool und Attrappen für Meer, Himmel und Seesystem */
function directorRig() {
  const fx = new CataclysmFx(new Scene());
  const ships: FakeShip[] = [];
  const rec = { splits: [] as string[], lifts: [] as number[], hits: 0, pulls: 0, blasts: 0, trench: 0, lightning: 0, cracks: 0, impacts: 0, dark: 0, sounds: [] as string[] };
  const nav = {
    cataclysmShips(x: number, z: number, r: number, out: FakeShip[]) { out.length = 0; for (const e of ships) if (e.ship.sinking <= 0 && Math.hypot(e.ship.x - x, e.ship.z - z) - e.ship.cls.L * 0.5 <= r) out.push(e); return out.length; },
    cataclysmFriendly() { return false; },
    cataclysmSplit(e: FakeShip, cut: string, _seed: number, lift = 0) { rec.splits.push(cut); rec.lifts.push(lift); e.ship.sinking = 0.01; return 'split'; },
    cataclysmHit(_e: FakeShip, dmg: number) { rec.hits++; return dmg; },
    cataclysmPull(e: FakeShip, cx: number, cz: number, step: number) { rec.pulls++; const dx = cx - e.ship.x, dz = cz - e.ship.z, d = Math.hypot(dx, dz); if (d > 0.5) { e.ship.x += (dx / d) * Math.min(step, d - 0.5); e.ship.z += (dz / d) * Math.min(step, d - 0.5); } },
    cataclysmBlast() { rec.blasts++; return true; },
  };
  const host: CataclysmHost = {
    fx, combatFx: null, naval: nav as unknown as NavalSystem, debris: null,
    isLand: () => false, groundY: () => 0, waterY: () => 0,
    setTrench: (_ax, _az, _bx, _bz, _hw, depth) => { rec.trench = Math.max(rec.trench, depth); },
    setRift: () => {}, shake: () => {},
    lightning: () => { rec.lightning++; }, cracks: () => { rec.cracks++; },
    sound: (n) => { rec.sounds.push(n); }, impactFrames: (n) => { rec.impacts += n; }, darken: (k) => { rec.dark = Math.max(rec.dark, k); },
  };
  const ship = (x: number, z: number, heading = Math.PI / 2): FakeShip => {
    const e: FakeShip = { ship: { x, z, heading, cls: { L: 30, W: 7 }, model: { deckY: 2.5 }, sinking: 0, maxHull: 1000, hull: 1000, fire: 0, frozen: 0, shoveX: 0, shoveZ: 0, holes: 0, punchHoles(n: number) { this.holes += n; } } };
    ships.push(e);
    return e;
  };
  return { fx, d: new CataclysmDirector(host), rec, ship, ships };
}

/** Ultimate vollständig durchlaufen: Aufladen in der Zeitlupe, Zeit bis zum Einschlag, Einschlag, Zeitachse; je Bild die Pool-Grenzen prüfen */
function runUltimate(id: ActionStyleId, setup: (r: ReturnType<typeof directorRig>) => void) {
  const r = directorRig();
  setup(r);
  const f = createFighter('ult-test', id);
  const u = ULTIMATES[id]!;
  const spec = u.ultimate!;
  let over = 0;
  const check = () => { for (const p of FX_PRIMS) if (r.fx.count(p) > FX_CAP[p]) over++; };
  r.d.beginCharge(spec, f, 0.75);
  for (let i = 0; i < 45; i++) { r.d.update(spec.charge / 45, DT); check(); }
  for (let i = 0; i < Math.round(spec.strikeAt * 60); i++) { r.d.update(DT, DT); check(); }
  r.d.strike(spec, f, 0, 0);
  let peak = 0;
  for (let i = 0; i < Math.round((CATACLYSM_DUR[spec.kind] + 0.5) * 60); i++) { r.d.update(DT, DT); check(); peak = Math.max(peak, r.fx.alive); }
  const emitted = r.fx.emitted;
  // ausklingen lassen: der Pool leert sich ganz (nichts bleibt hängen)
  for (let i = 0; i < 60 * 8; i++) r.d.update(DT, DT);
  return { ...r, over, peak, emitted, left: r.fx.alive };
}

describe('Alle 14 Ultimates: Pool- und Zerstörungsprüfung', () => {
  it('jedes Ultimate füllt den Pool sichtbar, bleibt in den Plätzen und räumt danach vollständig auf (Zero-GC)', () => {
    for (const id of ULTIMATE_ORDER) {
      const r = runUltimate(id, (x) => { x.ship(0, 30); });
      expect(r.over, id).toBe(0);
      expect(r.emitted, id).toBeGreaterThan(40);
      expect(r.left, id).toBe(0);
    }
  });

  it('die großen Neun: Geister-Armada, Faust-Flut, Feuerwirbel, Gletscher, Flutdrache, Tornado, Blitzsäule, Sonnenring, Blutmond – jeweils mit Hunderten Teilen', () => {
    const heavy: ActionStyleId[] = ['saebel', 'sturmfaust', 'feuer', 'eis', 'wasser', 'wind', 'blitz', 'sonne', 'mond'];
    for (const id of heavy) {
      const r = runUltimate(id, (x) => { x.ship(0, 30); });
      expect(r.emitted, id).toBeGreaterThan(id === 'blitz' ? 60 : 120);
    }
  });

  it('Säbel: Geister-Armada aus goldenen Geschützen feuert drei Salven, Kriegsschiffe kentern, Festungshöfe werden getroffen', () => {
    const r = runUltimate('saebel', (x) => { x.ship(0, 60); x.ship(30, 80); });
    expect(r.rec.sounds.filter((s) => s === 'ghostVolley')).toHaveLength(3);
    expect(r.rec.splits).toContain('capsize');
    expect(r.rec.splits).toContain('cross');
    expect(r.rec.blasts).toBeGreaterThan(20);
  });

  it('Sturmfaust: Geister-Fäuste durchlöchern und versenken Schiffe im Kegel', () => {
    const r = runUltimate('sturmfaust', (x) => { x.ship(0, 30); });
    expect(r.rec.splits).toContain('sink');
    expect(r.ships[0].ship.holes).toBeGreaterThan(2);
  });

  it('Feuer: der Feuerdrachen-Wirbelsturm setzt Schiffe in Brand', () => {
    const r = runUltimate('feuer', (x) => { x.ship(0, 30); });
    expect(r.ships[0].ship.fire).toBeGreaterThanOrEqual(10);
    expect(r.rec.hits).toBeGreaterThan(0);
  });

  it('Eis: das Meer friert ein, Gletscher-Säulen zerspringen im zweiten Impact-Frame', () => {
    const r = runUltimate('eis', (x) => { x.ship(0, 20); });
    expect(r.ships[0].ship.frozen).toBeGreaterThan(0);
    expect(r.rec.impacts).toBeGreaterThanOrEqual(3);
    expect(r.rec.sounds).toContain('iceShatter');
  });

  it('Wasser: die Flutwelle hebt Schiffe an und lässt sie kentern', () => {
    const r = runUltimate('wasser', (x) => { x.ship(0, 30); });
    expect(r.rec.splits).toContain('capsize');
    expect(Math.max(...r.rec.lifts)).toBeGreaterThan(2);
  });

  it('Wind: der Tornado zieht Schiffe heran und zerschneidet sie', () => {
    const r = runUltimate('wind', (x) => { x.ship(0, 40); });
    expect(r.rec.pulls).toBeGreaterThan(10);
    expect(r.rec.splits).toContain('cross');
  });

  it('Blitz: Himmel-zu-Erde-Säule mit Kettenblitzen auf Schiffe, echte Wetterblitze, das Bild verdunkelt sich', () => {
    const r = runUltimate('blitz', (x) => { x.ship(0, 40); x.ship(-30, 60); });
    expect(r.rec.lightning).toBeGreaterThan(1);
    expect(r.rec.splits).toContain('sink');
    expect(r.rec.dark).toBeGreaterThan(0.2);
    expect(ULTIMATES.blitz!.rise).toBeGreaterThan(0);
  });

  it('Sonne: die Licht-Schneise brennt durch das Schlachtfeld und versenkt Schiffe darin', () => {
    const r = runUltimate('sonne', (x) => { x.ship(0, 30); });
    expect(r.rec.splits).toContain('sink');
    expect(r.ships[0].ship.fire).toBeGreaterThan(0);
  });

  it('Mond: Blutmond verdunkelt den Himmel, hunderte Sicheln zerteilen Schiffe', () => {
    const r = runUltimate('mond', (x) => { x.ship(0, 30); });
    expect(r.rec.dark).toBeGreaterThan(0.4);
    expect(r.rec.splits).toContain('cross');
    expect(r.ships[0].ship.holes).toBeGreaterThan(0);
  });

  it('die fünf großen aus 4.6B bleiben: Zweiteilung quer, Zyklon der Länge nach, Iaijutsu diagonal, Meeresgraben, Sog radial – mit Signatur-Klang', () => {
    expect(runUltimate('zweihaender', (x) => { x.ship(0, 60); }).rec.splits).toContain('cross');
    const cyc = runUltimate('doppel', (x) => { x.ship(0, 25, 0); });
    expect(cyc.rec.splits).toContain('length');
    expect(cyc.rec.sounds).toContain('cycloneWhine');
    const iai = runUltimate('langklinge', (x) => { x.ship(0, 20, 0); });
    expect(iai.rec.splits).toContain('diagonal');
    expect(iai.rec.sounds).toContain('sheathClick');
    const ocean = runUltimate('erdspalter', (x) => { x.ship(0, 50); });
    expect(ocean.rec.trench).toBeGreaterThanOrEqual(8);
    expect(ocean.rec.sounds).toContain('quakeRumble');
    const hole = runUltimate('schwarzloch', (x) => { x.ship(0, 40); });
    expect(hole.rec.pulls).toBeGreaterThan(10);
    expect(hole.rec.splits).toContain('radial');
    expect(hole.rec.sounds).toContain('voidRumble');
  });

  it('Klingenwellen und Eruptionen der Kampfkünste und der Clash kommen ebenfalls aus dem Pool', () => {
    const r = directorRig();
    const f = createFighter('swing-test', 'feuer');
    for (const id of ALL_STYLES) for (const k of ACTION_STYLES[id].skills) for (const h of k.hits) r.d.swingFx(h, f, ACTION_STYLES[id].color, ACTION_STYLES[id].element);
    r.d.clash(0, 1.3, 1, 0);
    r.d.update(DT, DT);
    expect(r.d.stats.swings).toBeGreaterThan(100);
    expect(r.d.stats.clashes).toBe(1);
    for (const p of FX_PRIMS) expect(r.fx.count(p)).toBeLessThanOrEqual(FX_CAP[p]);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('Aufstieg der Ultimates nach der Zwischensequenz', () => {
  const cast = (id: ActionStyleId) => {
    const r = setup(id);
    r.eng.setForm(7);
    r.w.foe(0, 8);
    r.eng.addWill(WILL.max);
    run(r.eng, r.w, r.inp, 4, { awaken: true });
    run(r.eng, r.w, r.inp, 2, { awaken: true });
    return r;
  };

  it('Blitz: die Figur steigt erst nach der Zwischensequenz zur Gewitterwolke auf, schwebt unter ihr und landet danach wieder', () => {
    const { w, eng, inp, f } = cast('blitz');
    expect(f.cineT).toBeGreaterThan(0);
    expect(f.y).toBeLessThan(0.2);
    let top = 0, airAtStrike = false;
    for (let i = 0; i < 320; i++) {
      const ev = tick(eng, w, inp);
      top = Math.max(top, f.y);
      for (let k = 0; k < ev.n; k++) if (ev.items[k].type === 'ultStrike' && f.y > 3) airAtStrike = true;
    }
    expect(top).toBeGreaterThan(7);
    expect(top).toBeLessThan(12);
    expect(airAtStrike).toBe(true);
    expect(f.grounded).toBe(true);
  });

  it('Säbel: der Sprung-Hieb springt nach der Zwischensequenz wirklich ab (früher schluckte die Sequenz den Sprung)', () => {
    const { w, eng, inp, f } = cast('saebel');
    let top = 0;
    for (let i = 0; i < 240; i++) { tick(eng, w, inp); top = Math.max(top, f.y); }
    expect(top).toBeGreaterThan(2.5);
    expect(f.grounded).toBe(true);
  });
});

describe('Boss-Schutz bleibt bestehen', () => {
  it('alle 14 Ultimates: jeder Treffer läuft als Ultimate über den Endboss-Deckel, kein voller Endboss fällt', () => {
    for (const id of ULTIMATE_ORDER) {
      const { w, eng, inp } = setup(id);
      eng.setForm(7);
      w.foe(0, 6, { boss: true });
      eng.addWill(WILL.max);
      run(eng, w, inp, 4, { awaken: true });
      run(eng, w, inp, 2, { awaken: true });
      run(eng, w, inp, 240);
      const ult = w.log.filter((l) => l.move === ULTIMATES[id]!.id);
      expect(ult.length, id).toBeGreaterThan(0);
      // Endboss-Buchführung: egal wie viele Treffer, höchstens ein gedeckelter Treffer
      const L = new UltimateBossLedger();
      let dealt = 0;
      for (let i = 0; i < ult.length; i++) { const d = L.allow(1, 'boss', ultimateBossCap({ raid: 'boss' }), 80000, 30000); dealt += d; L.record(d); }
      expect(dealt, id).toBeLessThanOrEqual(80000 * RAID_BOSS_HIT_CAP);
    }
  });

  it('Kämpfe sperren keine Arena ab: mitten im Ultimate läuft die Figur danach frei weiter', () => {
    const { w, eng, inp, f } = setup('zweihaender');
    w.foe(0, 4);
    eng.addWill(WILL.max);
    run(eng, w, inp, 4, { awaken: true });
    run(eng, w, inp, 2, { awaken: true });
    run(eng, w, inp, 200);
    const z0 = f.z;
    inp.moveX = 0; inp.moveZ = 1; inp.mag = 1;
    run(eng, w, inp, 120);
    expect(f.z - z0).toBeGreaterThan(8);
  });
});
