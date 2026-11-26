// Phase 4.6B: acht Faji-Künste (Formen 1 – 7), Sturm-Erwachen, drei Willenskraft-Auren, Impact-Frames (seit 4.6I: Doppel-Impact-Frame der
// 3-Akt-Kino-Regie, siehe tests/ultimateCinematics.test.ts), alle 14 Kataklysmus-Ultimates samt Schiffs-Zweiteilung, Iaijutsu-Schnitt,
// Ozean-Teilung, Schwarzem-Loch-Sog und Endboss-Deckel.
import { describe, expect, it } from 'vitest';
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import {
  ActionCombatEngine, createFighter, makeInput,
  type ActionBody, type ActionInput, type ActionTarget, type ActionWorld, type HitContext,
} from '../src/combat/actionCombatEngine';
import { ACTION_STYLES, ALL_MOVES, FAJI_ARTS, lastHitEnd, type ActionHit, type ActionMove, type ActionStyleId } from '../src/data/actionStyles';
import {
  AURA, FAJI_ART_IDS, FORM_THRESHOLDS, FORM_UNLOCK, KING_WAVE, MASTER_FORM, WILL, WILL_AURAS, cleanFaji, formOf, formPower, formProgress,
} from '../src/data/fajiArts';
import {
  BOSS_SHIP_SPLIT, ULTIMATES, ULTIMATE_ORDER, ULT_CHARGE, UltimateBossLedger, canSplitShip, ultimateBossCap,
} from '../src/data/cataclysms';
import { FIGHT_MODEL, KAISER_BOSS_HIT_CAP, RAID_BOSS_HIT_CAP, ULTIMATE_BOSS_CAP } from '../src/data/balanceConfig';
import { AnimeImpactRig, IMPACT } from '../src/graphics/animeImpactRig';
import { ULTIMATE_CINEMATICS, cineTiming } from '../src/graphics/ultimateCinematics';
import { cutPlane, splitShipModel, updateShipSplit } from '../src/entities/ship/shipSplit';
import { trenchCPU } from '../src/world/ocean';

const DT = 1 / 60;

interface Foe {
  id: string; x: number; y: number; z: number; radius: number; alive: boolean; mass: boolean; boss: boolean; air: boolean; vy: number;
  hits: number; firstHitTick: number;
}

/** Spielzeug-Welt: ebener Boden, Gegner als Kreise; merkt sich jeden Treffer samt HitContext */
class World implements ActionWorld {
  foes: Foe[] = [];
  log: { id: string; move: string; h: ActionHit; formK: number; penAdd: number; ultimate: boolean; chained: number; tick: number }[] = [];
  drags = 0;
  shots: { kind: string; radius: number }[] = [];
  now = 0;
  foe(x: number, z: number, o: Partial<Foe> = {}): Foe {
    const f: Foe = { id: `f${this.foes.length}`, x, y: 0, z, radius: 0.45, alive: true, mass: false, boss: false, air: false, vy: 0, hits: 0, firstHitTick: -1, ...o };
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
      t.id = f.id; t.x = f.x; t.y = f.y; t.z = f.z; t.radius = f.radius; t.height = 1.8; t.yaw = 0;
      t.alive = f.alive; t.airborne = f.air; t.mass = f.mass; t.broken = false; t.boss = f.boss; t.ref = i;
    });
    return n;
  }
  hit(t: ActionTarget, h: ActionHit, m: ActionMove, c: HitContext): number {
    const f = this.foes[t.ref];
    f.hits++;
    if (f.firstHitTick < 0) f.firstHitTick = this.now;
    this.log.push({ id: f.id, move: m.id, h, formK: c.formK, penAdd: c.penAdd, ultimate: c.ultimate, chained: c.chained, tick: this.now });
    if (h.launch > 0 && !f.boss) { f.vy = h.launch; f.air = true; }
    return 1;
  }
  drag(t: ActionTarget, cx: number, cz: number, step: number): void {
    const f = this.foes[t.ref];
    const dx = cx - f.x, dz = cz - f.z, d = Math.hypot(dx, dz);
    if (d > 0.5) { const k = Math.min(step, d - 0.5) / d; f.x += dx * k; f.z += dz * k; t.x = f.x; t.z = f.z; this.drags++; }
  }
  shoot(h: ActionHit): void { if (h.projectile) this.shots.push({ kind: h.projectile.kind, radius: h.projectile.radius }); }
  step(dt: number) {
    this.now++;
    for (const f of this.foes) if (f.air) { f.vy -= 22 * dt; f.y += f.vy * dt; if (f.y <= 0) { f.y = 0; f.vy = 0; f.air = false; } }
  }
}

function setup(style: ActionStyleId) {
  const w = new World();
  const eng = new ActionCombatEngine(createFighter('faji-test', style));
  return { w, eng, inp: makeInput(), f: eng.f };
}

function tick(eng: ActionCombatEngine, w: World, inp: ActionInput, press: Partial<ActionInput> = {}) {
  Object.assign(inp, { light: false, heavy: false, jump: false, dash: false, skill: 0, blockPressed: false, awaken: false, aura: false }, press);
  eng.step(inp, w, DT);
  w.step(DT);
  return eng.events;
}

/** n Bilder laufen, Ereignisse aller Bilder sammeln */
function run(eng: ActionCombatEngine, w: World, inp: ActionInput, n: number, press: Partial<ActionInput> = {}): string[] {
  const seen: string[] = [];
  for (let i = 0; i < n; i++) {
    const ev = tick(eng, w, inp, i === 0 ? press : {});
    for (let k = 0; k < ev.n; k++) seen.push(ev.items[k].type);
  }
  return seen;
}

/** Erwachen herbeiführen: Willenskraft füllen, Taste drücken */
function awaken(eng: ActionCombatEngine, w: World, inp: ActionInput): string[] {
  eng.addWill(WILL.max);
  return run(eng, w, inp, 4, { awaken: true });
}

const model = FIGHT_MODEL.hitsPerSec * FIGHT_MODEL.comboMult;

// ---------------------------------------------------------------------------------------------------------------

describe('Faji-Künste: acht waffenlose Künste mit Formen 1 – 7', () => {
  it('acht Künste mit deutscher Bezeichnung, Element, Kette, Verzweigungen, Luft-Kette, Meteor, Finisher und vier Form-Techniken', () => {
    expect(FAJI_ARTS).toEqual(['schwarzloch', 'feuer', 'eis', 'wasser', 'wind', 'blitz', 'sonne', 'mond']);
    expect(FAJI_ART_IDS).toEqual(FAJI_ARTS);
    for (const id of FAJI_ARTS) {
      const s = ACTION_STYLES[id];
      expect(s.faji, id).toBe(true);
      expect(s.element, id).toBe(id);
      expect(s.label.length, id).toBeGreaterThan(3);
      expect(s.light).toHaveLength(5);
      expect(s.branch).toHaveLength(4);
      expect(s.air).toHaveLength(3);
      expect(s.meteor.meteor).toBe(true);
      expect(s.finisher.hits.length).toBeGreaterThan(0);
      // 4.7B: zehn Formen; die ersten vier tragen noch ihre alte Formstufe (nur Anzeige), frei werden alle über den Klassenbaum
      expect(s.skills).toHaveLength(10);
      expect(s.skills.slice(0, 4).map((k) => k.formMin), id).toEqual([...FORM_UNLOCK]);
      for (const k of s.skills) { expect(k.label.length).toBeGreaterThan(3); expect(k.desc.length).toBeGreaterThan(10); expect(k.cd).toBeGreaterThan(0); }
      // rein energetisch: kein Schwert in der Hand
      expect(s.visual, id).toBe('effekt');
    }
  });

  it('Formen 1 – 7 aus der Meisterschaft; Fortschritt, Stärke und Freischaltung der Techniken', () => {
    expect(FORM_THRESHOLDS).toHaveLength(MASTER_FORM);
    for (let i = 0; i < MASTER_FORM; i++) {
      expect(formOf(FORM_THRESHOLDS[i])).toBe(i + 1);
      if (i > 0) expect(formOf(FORM_THRESHOLDS[i] - 1)).toBe(i);
    }
    expect(formOf(1e9)).toBe(7);
    expect(formProgress(0)).toBe(0);
    expect(formProgress(FORM_THRESHOLDS[6])).toBe(1);
    expect(formProgress((FORM_THRESHOLDS[1] + FORM_THRESHOLDS[2]) / 2)).toBeCloseTo(0.5, 2);
    // Stärke wächst bis zur Meisterform, danach nicht weiter
    for (let f = 2; f <= 7; f++) expect(formPower(f).dmg).toBeGreaterThan(formPower(f - 1).dmg);
    expect(formPower(9).dmg).toBe(formPower(7).dmg);
    expect(formPower(7).dmg).toBeLessThanOrEqual(1.6);
  });

  it('4.7B: gesperrte Formen melden den Knoten des Klassenbaums, freie wirken mit dem Schaden ihrer Meisterschafts-Form', () => {
    const { w, eng, inp } = setup('feuer');
    w.foe(0, 3);
    eng.setForm(1);
    eng.setClass(1, false);
    let seen = run(eng, w, inp, 2, { skill: 2 });
    expect(seen).toContain('locked');
    expect(eng.f.skillCd[1]).toBe(0);
    eng.setClass(2, false);
    eng.setForm(2);
    seen = run(eng, w, inp, 90, { skill: 2 });
    expect(seen).toContain('skill');
    const hit = w.log.find((l) => l.move === 'feuer.k2');
    expect(hit).toBeTruthy();
    expect(hit!.formK).toBeCloseTo(formPower(2).dmg, 5);
    // die Kette selbst hängt nicht an der Form (4.7C: L1 ist eine Feuerlanze – ein Geschoss; der Finisher trifft mit Faktor 1)
    const g = setup('feuer');
    g.w.foe(0, 6.5);
    g.eng.setForm(7);
    run(g.eng, g.w, g.inp, 30, { light: true });
    expect(g.w.shots.length).toBeGreaterThan(0);
    for (let i = 0; i < 6; i++) run(g.eng, g.w, g.inp, 12, { light: true });
    run(g.eng, g.w, g.inp, 40);
    expect(g.w.log.find((l) => l.move === 'feuer.l5')?.formK).toBe(1);
  });

  it('Balance: Ketten-DPS nahe dem Kampfmodell, Form-Techniken in der 1. Form höchstens +30 %, in der Meisterform höchstens +50 %', () => {
    for (const id of FAJI_ARTS) {
      const s = ACTION_STYLES[id];
      let time = 0, dmg = 0;
      s.light.forEach((m, i) => {
        time += i === s.light.length - 1 ? lastHitEnd(m) : m.cancel;
        dmg += m.hits.reduce((a, h) => a + h.dmg * (h.projectile ? h.projectile.count : 1), 0);
      });
      const dps = dmg / time;
      expect(dps / model, `${id} Kette ${dps.toFixed(2)}`).toBeGreaterThan(0.85);
      expect(dps / model, `${id} Kette ${dps.toFixed(2)}`).toBeLessThan(1.45);
      for (const [form, cap] of [[1, 0.3], [7, 0.5]] as const) {
        let gain = 0;
        const k = formPower(form).dmg;
        for (const sk of s.skills) gain += Math.max(0, sk.hits.reduce((a, h) => a + h.dmg * (h.projectile ? h.projectile.count : 1), 0) * k - sk.dur * dps) / sk.cd;
        expect(gain / dps, `${id} Techniken Form ${form}`).toBeLessThan(cap);
      }
    }
  });

  it('Schwarzes Loch zieht Gegner zusammen und bannt Auren (Sog + Unterdrückung)', () => {
    const { w, eng, inp } = setup('schwarzloch');
    eng.setForm(1);
    const a = w.foe(3, 6), b = w.foe(-3, 6.5), c = w.foe(0, 9);
    const d0 = Math.hypot(a.x, a.z - 6) + Math.hypot(b.x, b.z - 6) + Math.hypot(c.x, c.z - 6);
    run(eng, w, inp, 70, { skill: 1 });
    const d1 = Math.hypot(a.x, a.z - 6) + Math.hypot(b.x, b.z - 6) + Math.hypot(c.x, c.z - 6);
    expect(w.drags).toBeGreaterThan(0);
    expect(d1).toBeLessThan(d0 * 0.75);
    expect(ACTION_STYLES.schwarzloch.skills[3].hits.some((h) => h.status === 'suppress')).toBe(true);
  });

  it('Blitz springt als Kettenblitz durch Truppen-Formationen (jeder Sprung ein eigener Treffer)', () => {
    const { w, eng, inp } = setup('blitz');
    eng.setForm(4);
    // Formation: Verband-Köpfe in einer Reihe 3 m auseinander
    for (let i = 0; i < 7; i++) w.foe(i % 2 ? 1 : -1, 4 + i * 3, { mass: true });
    const seen = run(eng, w, inp, 80, { skill: 3 });
    expect(seen.filter((s) => s === 'chain').length).toBeGreaterThanOrEqual(3);
    expect(w.log.some((l) => l.chained >= 3)).toBe(true);
    expect(new Set(w.log.filter((l) => l.move === 'blitz.k3').map((l) => l.id)).size).toBeGreaterThanOrEqual(5);
  });

  it('Feuer brennt, Eis verlangsamt und friert ein, Sonne brennt Rüstung und Heilung durch, Wasser kontert, Wind hebt in die Luft', () => {
    const has = (id: ActionStyleId, st: string) => [...ACTION_STYLES[id].light, ...ACTION_STYLES[id].skills].some((m) => m.hits.some((h) => h.status === st));
    expect(has('feuer', 'burn')).toBe(true);
    expect(has('eis', 'slow')).toBe(true);
    expect(has('eis', 'freeze')).toBe(true);
    expect(has('sonne', 'sunder')).toBe(true);
    expect(ACTION_STYLES.sonne.penBonus).toBeGreaterThanOrEqual(1);
    expect(ACTION_STYLES.sonne.skills.some((k) => k.hits.some((h) => h.pen >= 3))).toBe(true);
    expect(ACTION_STYLES.wasser.skills[0].counter).toBeGreaterThan(0);
    expect(ACTION_STYLES.wind.skills[1].hits.some((h) => h.launch >= 8)).toBe(true);
    expect(ACTION_STYLES.wind.jumps).toBe(3);
  });

  it('Mond: bei jedem Schlag fliegen Sicheln in wachsender Größe mit', () => {
    const s = ACTION_STYLES.mond;
    const radii = s.light.map((m) => m.hits.find((h) => h.projectile?.kind === 'crescent')?.projectile?.radius ?? 0);
    for (const r of radii) expect(r).toBeGreaterThan(0);
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThan(radii[i - 1]);
    const { w, eng, inp } = setup('mond');
    w.foe(0, 2);
    for (let i = 0; i < 5; i++) run(eng, w, inp, 30, { light: true });
    expect(w.shots.filter((x) => x.kind === 'crescent').length).toBeGreaterThanOrEqual(3);
  });

  it('Spielstand der Künste wird bereinigt: Standard-Kunst, Meisterschaft begrenzt, ungültige Aura → keine', () => {
    const d = cleanFaji(undefined);
    expect(d.equipped).toBe('feuer');
    expect(Object.keys(d.mastery).sort()).toEqual([...FAJI_ART_IDS].sort());
    const c = cleanFaji({ equipped: 'quatsch', mastery: { feuer: 120.7, eis: -5, mond: 'x' }, aura: 9 });
    expect(c.equipped).toBe('feuer');
    expect(c.mastery.feuer).toBe(120);
    expect(c.mastery.eis).toBe(0);
    expect(c.mastery.mond).toBe(0);
    expect(c.aura).toBe(0);
    expect(cleanFaji({ equipped: null, aura: 2 })).toMatchObject({ equipped: null, aura: 2 });
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('Sturm-Erwachen und die drei Willenskraft-Auren', () => {
  it('Willenskraft füllt sich mit Treffern; voll meldet sie sich, die Erwachen-Taste startet 18 s Burst mit +20 % Angriffstempo', () => {
    const { w, eng, inp, f } = setup('saebel');
    w.foe(0, 1.8);
    for (let i = 0; i < 6; i++) run(eng, w, inp, 26, { light: true });
    expect(f.will).toBeGreaterThan(0);
    expect(eng.awakened).toBe(false);
    // ohne volle Leiste: nichts
    expect(run(eng, w, inp, 2, { awaken: true })).toContain('notReady');
    eng.addWill(WILL.max);
    expect(eng.events.has('willFull') || f.will >= WILL.max).toBe(true);
    const seen = run(eng, w, inp, 3, { awaken: true });
    expect(seen).toContain('awaken');
    expect(f.awakenT).toBeGreaterThan(WILL.awakenDur - 0.2);
    expect(f.will).toBe(0);
    expect(WILL.awakenSpeed).toBeCloseTo(1.2, 5);
    // +20 % Angriffstempo: der erste Kettenschlag läuft in derselben Zeit 1,2-mal so weit
    const a = setup('saebel'); a.w.foe(0, 1.8);
    const b = setup('saebel'); b.w.foe(0, 1.8); b.eng.addWill(WILL.max); run(b.eng, b.w, b.inp, 3, { awaken: true }); run(b.eng, b.w, b.inp, 30);
    tick(a.eng, a.w, a.inp, { light: true }); tick(b.eng, b.w, b.inp, { light: true });
    for (let i = 0; i < 6; i++) { tick(a.eng, a.w, a.inp); tick(b.eng, b.w, b.inp); }
    expect(b.f.moveT / a.f.moveT).toBeCloseTo(1.2, 1);
  });

  it('im Erwachen begleitet eine Energiewelle jeden normalen Schlag (trifft auch weiter entfernte Gegner), nach 18 s endet es', () => {
    const { w, eng, inp, f } = setup('zweihaender');
    const far = w.foe(0, 8);
    w.foe(0, 1.8);
    awaken(eng, w, inp);
    const seen = run(eng, w, inp, 40, { light: true });
    expect(seen).toContain('awakenWave');
    expect(far.hits).toBeGreaterThan(0);
    run(eng, w, inp, Math.ceil(WILL.awakenDur / DT) + 10);
    expect(f.awakenT).toBe(0);
    expect(f.ultReady).toBe(false);
  });

  it('Aura-Taste wechselt reihum: keine → Sturmblick → Eisenwille → Königsdruck → keine', () => {
    const { w, eng, inp, f } = setup('saebel');
    expect(WILL_AURAS.map((a) => a.label)).toEqual(['Keine Aura', 'Sturmblick', 'Eisenwille', 'Königsdruck']);
    const seq: number[] = [];
    for (let i = 0; i < 4; i++) { run(eng, w, inp, 2, { aura: true }); seq.push(f.aura); }
    expect(seq).toEqual([1, 2, 3, 0]);
  });

  it('Sturmblick verlängert das Fenster des Sturm-Schritts; Eisenwille gibt eine Waffenstufe Durchschlag', () => {
    const late = ACTION_STYLES.saebel.perfectWindow + AURA.sightWindow * 0.5;
    const tryDodge = (aura: 0 | 1) => {
      const { w, eng, inp, f } = setup('saebel');
      f.aura = aura;
      tick(eng, w, inp, { dash: true });
      // Treffer `late` Sekunden nach dem Dash-Beginn
      for (let t = 0; t < late - DT / 2; t += DT) tick(eng, w, inp);
      return eng.incoming({ id: 'a', x: 0, z: 3, yaw: Math.PI, radius: 0.5 }, 0, -1, w);
    };
    expect(tryDodge(0)).not.toBe('perfect');
    expect(['perfect', 'counter']).toContain(tryDodge(1));
    const { w, eng, inp, f } = setup('saebel');
    w.foe(0, 1.8);
    f.aura = 2;
    run(eng, w, inp, 30, { light: true });
    expect(w.log[0].penAdd).toBe(AURA.ironPen);
  });

  it('Königsdruck: eine weite Willens-Druckwelle schleudert Horden fort, beim Erwachen besonders weit', () => {
    const { w, eng, inp, f } = setup('saebel');
    for (let i = 0; i < 6; i++) w.foe(Math.sin(i) * 8, Math.cos(i) * 8, { mass: true });
    f.aura = 3;
    const seen = run(eng, w, inp, Math.ceil(AURA.kingEvery / DT) + 5);
    expect(seen).toContain('kingWave');
    expect(w.log.some((l) => l.h === KING_WAVE)).toBe(true);
    // beim Erwachen: Radius 20 m
    const far = w.foe(0, 18, { mass: true });
    awaken(eng, w, inp);
    expect(far.hits).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('Aufladen und Anime-Impact-Frames (4.6I: Akt 1 und Treffermoment der Kino-Regie)', () => {
  it('Aufladen in Spielzeit 0,105 s füllt Akt 1 (0,30 – 0,35 s echt) in einer Zeitlupe um 0,3', () => {
    expect(ULT_CHARGE).toBeCloseTo(0.105, 6);
    for (const id of ULTIMATE_ORDER) {
      const spec = ULTIMATES[id]!.ultimate!;
      const tm = cineTiming(ULTIMATE_CINEMATICS[spec.kind], spec);
      expect(tm.s1 * ULTIMATE_CINEMATICS[spec.kind].dur[0], id).toBeCloseTo(ULT_CHARGE, 6);
      expect(tm.s1, id).toBeGreaterThan(0.28);
      expect(tm.s1, id).toBeLessThan(0.36);
    }
  });

  it('Doppel-Impact-Frame im Treffermoment: 2 – 4 Bilder, erst invertiert, dann Tusche; solange welche ausstehen, steht die Zeit', () => {
    const rig = new AnimeImpactRig();
    expect(rig.active).toBe(false);
    rig.impact(3);
    expect(rig.framesLeft).toBe(3);
    expect([rig.frame(), rig.frame(), rig.frame(), rig.frame()]).toEqual(['invert', 'ink', 'ink', 'none']);
    expect(rig.framesLeft).toBe(0);
    rig.impact(9);
    let n = 0;
    while (rig.frame() !== 'none') n++;
    expect(n).toBe(IMPACT.framesMax);
    rig.impact(0);
    n = 0;
    while (rig.frame() !== 'none') n++;
    expect(n).toBe(IMPACT.framesMin);
    rig.impact(Number.NaN);
    expect(rig.framesLeft).toBe(IMPACT.framesMin);
    rig.reset();
    expect(rig.active).toBe(false);
    expect(rig.impacts).toBe(4);
  });

  it('Ultimate: während des Aufladens steht der Angriff still (Figur unverwundbar), danach kommt der Einschlag zur festen Zeit', () => {
    const { w, eng, inp, f } = setup('zweihaender');
    w.foe(0, 6);
    awaken(eng, w, inp);
    const seen = run(eng, w, inp, 1, { awaken: true });
    expect(seen).toContain('ultimate');
    // gesetzt auf die Aufladezeit (0,105 s Spielzeit), im selben Bild läuft schon ein Takt davon ab
    expect(f.cineT).toBeLessThanOrEqual(ULT_CHARGE);
    expect(f.cineT).toBeGreaterThan(ULT_CHARGE - 2 * DT);
    // die Zwischensequenz läuft in Spielzeit 0,105 s: in dieser Zeit rückt der Angriff nicht vor
    run(eng, w, inp, 5);
    expect(f.moveT).toBe(0);
    expect(eng.incoming({ id: 'x', x: 0, z: 2, yaw: Math.PI, radius: 0.5 }, 0, -1, w)).toBe('dodged');
    const after = run(eng, w, inp, 60);
    expect(after).toContain('ultStrike');
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('Alle 15 Kataklysmus-Ultimates (4.7B: mit dem Erzengel-Himmelsgericht des Priesters)', () => {
  it('15 Ultimates mit deutschem Namen, eigener Art, Einschlag innerhalb des Angriffs, 2 – 4 Impact-Frames', () => {
    expect(ULTIMATE_ORDER).toHaveLength(15);
    expect(new Set(ULTIMATE_ORDER).size).toBe(15);
    const kinds = new Set<string>();
    for (const id of ULTIMATE_ORDER) {
      const u = ULTIMATES[id]!;
      expect(u, id).toBeTruthy();
      expect(ACTION_STYLES[id].ultimate).toBe(u);
      expect(ALL_MOVES).toContain(u);
      expect(u.label.length, id).toBeGreaterThan(12);
      const spec = u.ultimate!;
      kinds.add(spec.kind);
      expect(spec.strikeAt).toBeGreaterThan(0);
      expect(spec.strikeAt).toBeLessThan(u.dur);
      expect(spec.frames).toBeGreaterThanOrEqual(2);
      expect(spec.frames).toBeLessThanOrEqual(4);
      expect(spec.charge).toBeCloseTo(ULT_CHARGE, 6);
      expect(['face', 'low', 'side', 'sky']).toContain(spec.shot);
      expect(u.hits.length).toBeGreaterThan(0);
      // Faji-Ultimates erst in der 7. Form
      expect(u.formMin).toBe(FAJI_ARTS.includes(id) || id === 'priester' ? 7 : 1);
    }
    expect(kinds.size).toBe(15);
    expect(ULTIMATES.zweihaender!.label).toBe('Himmelsspalter: Horizont-Zäsur');
    expect(ULTIMATES.mond!.label).toContain('Blutmond-Finsternis');
  });

  it('jedes Ultimate nur im Sturm-Erwachen und einmal je Erwachen; 4.7B: erst mit Knoten 60 des Klassenbaums', () => {
    for (const id of ULTIMATE_ORDER) {
      const { w, eng, inp } = setup(id);
      w.foe(0, 5);
      eng.setForm(FAJI_ARTS.includes(id) ? 6 : 1);
      eng.setClass(10, false);
      awaken(eng, w, inp);
      let seen = run(eng, w, inp, 2, { awaken: true });
      expect(seen, id).toContain('locked');
      eng.setClass(10, true);
      seen = run(eng, w, inp, 2, { awaken: true });
      expect(seen, id).toContain('ultimate');
      const rest = run(eng, w, inp, 240);
      expect(rest, id).toContain('ultStrike');
      // zweites Mal im selben Erwachen: nichts
      expect(run(eng, w, inp, 3, { awaken: true }), id).not.toContain('ultimate');
      expect(w.log.some((l) => l.ultimate), id).toBe(true);
    }
  });

  it('Zweihänder: 180 m breite Energiewelle zerteilt Kriegsschiffe der Stufen 1 – 4, Boss-Schiffe erst unter 15 %', () => {
    const spec = ULTIMATES.zweihaender!.ultimate!;
    expect(spec.width).toBe(180);
    expect(spec.splitShips).toBe('cross');
    for (const tier of [1, 2, 3, 4] as const) expect(canSplitShip({ tier, boss: false, hullFrac: 1, friendly: false }, 'cross')).toBe(true);
    expect(canSplitShip({ tier: 5, boss: false, hullFrac: 1, friendly: false }, 'cross')).toBe(false);
    expect(BOSS_SHIP_SPLIT).toBe(0.15);
    expect(canSplitShip({ tier: 5, boss: true, hullFrac: 0.14, friendly: false }, 'cross')).toBe(true);
    expect(canSplitShip({ tier: 5, boss: true, hullFrac: 0.2, friendly: false }, 'cross')).toBe(false);
    expect(canSplitShip({ tier: 1, boss: false, hullFrac: 1, friendly: true }, 'cross')).toBe(false);
    expect(canSplitShip({ tier: 1, boss: false, hullFrac: 1, friendly: false }, '')).toBe(false);
  });

  it('echte Zweiteilung: Bug- und Heckhälfte aus den Netzen des Schiffs (gleiche Materialien), sie kippen nach innen weg', () => {
    const { root, mat, tris } = toyShip();
    const st = splitShipModel(root, 'cross', 30, 6, 2.5, 1);
    expect(st.sliced).toBeGreaterThanOrEqual(1);
    expect(st.partsA).toBeGreaterThan(0);
    expect(st.partsB).toBeGreaterThan(0);
    // alle Dreiecke bleiben erhalten, verteilt auf zwei Hälften; Materialien unverändert
    let after = 0, mats = 0;
    root.traverse((o) => { const m = o as Mesh; if (m.isMesh) { after += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3; if (m.material === mat) mats++; } });
    expect(after).toBe(tris);
    expect(mats).toBeGreaterThanOrEqual(4);
    // Bug (A) liegt vorn, Heck (B) hinten
    root.updateMatrixWorld(true);
    const zOf = (g: Group) => { let s = 0, n = 0; g.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.geometry.computeBoundingBox(); const c = m.geometry.boundingBox!.getCenter(m.position.clone()).applyMatrix4(m.matrixWorld); s += c.z; n++; } }); return s / n; };
    expect(zOf(st.a)).toBeGreaterThan(0);
    expect(zOf(st.b)).toBeLessThan(0);
    for (let i = 0; i < 60; i++) updateShipSplit(st, 1 / 60);
    expect(st.a.rotation.x).toBeLessThan(-0.1);
    expect(st.b.rotation.x).toBeGreaterThan(0.1);
    expect(st.a.position.z - st.b.position.z).toBeGreaterThan(0.5);
  });

  it('Doppelklinge: Klingen-Zyklon sägt sich der Länge nach durch (Backbord und Steuerbord rollen auseinander)', () => {
    const u = ULTIMATES.doppel!;
    expect(u.ultimate!.splitShips).toBe('length');
    expect(u.dashTo).toBeGreaterThanOrEqual(30);
    expect(u.through).toBe(true);
    expect(u.hits.length).toBeGreaterThanOrEqual(12);
    expect(cutPlane('length')).toEqual({ nx: 1, ny: 0, nz: 0 });
    const { root } = toyShip();
    const st = splitShipModel(root, 'length', 30, 6, 2.5, 2);
    for (let i = 0; i < 60; i++) updateShipSplit(st, 1 / 60);
    expect(st.a.rotation.z).toBeLessThan(-0.1);
    expect(st.b.rotation.z).toBeGreaterThan(0.1);
    expect(st.a.position.x).toBeGreaterThan(st.b.position.x);
  });

  it('Langklinge: Iaijutsu – im Vorstoß nur markiert, beim Einrasten der Klinge zerbricht alles Durchquerte im selben Moment', () => {
    const { w, eng, inp } = setup('langklinge');
    const line = [4, 9, 14, 19, 24].map((z) => w.foe(0, z));
    awaken(eng, w, inp);
    const evs: string[] = [];
    let sheathTick = -1;
    tick(eng, w, inp, { awaken: true });
    for (let i = 0; i < 200; i++) {
      const ev = tick(eng, w, inp);
      for (let k = 0; k < ev.n; k++) { evs.push(ev.items[k].type); if (ev.items[k].type === 'sheath') { sheathTick = w.now - 1; expect(ev.items[k].a).toBe(5); } }
    }
    expect(evs).toContain('sheath');
    for (const f of line) { expect(f.hits).toBeGreaterThan(0); expect(f.firstHitTick).toBe(sheathTick); }
    expect(ULTIMATES.langklinge!.ultimate!.splitShips).toBe('diagonal');
    expect(ULTIMATES.langklinge!.ultimate!.frames).toBe(4);
  });

  it('Erdspalter: das Meer teilt sich zu einem Graben (Tiefe in der Mitte, Wälle am Rand, spitze Enden)', () => {
    const spec = ULTIMATES.erdspalter!.ultimate!;
    expect(spec.kind).toBe('oceanSplit');
    expect(spec.trench).toBeGreaterThanOrEqual(8);
    const t = { ax: 0, az: 0, bx: 0, bz: 110, hw: 8, depth: spec.trench, soft: 6 };
    expect(trenchCPU(0, 55, t)).toBeCloseTo(-spec.trench, 3);
    expect(trenchCPU(3, 55, t)).toBeCloseTo(-spec.trench, 3);
    expect(trenchCPU(-60, 55, t)).toBe(0);
    expect(trenchCPU(8 + 6 * 0.9, 55, t)).toBeGreaterThan(0); // Wasserwall am Rand
    expect(Math.abs(trenchCPU(0, 0.5, t))).toBeLessThan(spec.trench * 0.2); // Enden laufen spitz zu
    expect(trenchCPU(0, 55, { ...t, depth: 0 })).toBe(0);
    // Truppen fliegen hoch
    expect(ULTIMATES.erdspalter!.hits.some((h) => h.launch >= 8)).toBe(true);
  });

  it('Schwarzes Loch: Ereignishorizont saugt Gegner ins Zentrum, Schiffe werden angesaugt und radial zerbrochen', () => {
    const spec = ULTIMATES.schwarzloch!.ultimate!;
    expect(spec.shipPull).toBeGreaterThan(0);
    expect(spec.splitShips).toBe('radial');
    const { w, eng, inp } = setup('schwarzloch');
    eng.setForm(7);
    const foes = [w.foe(8, 18), w.foe(-9, 10), w.foe(0, 25)];
    const center = { x: 0, z: spec.center };
    const d0 = foes.reduce((a, f) => a + Math.hypot(f.x - center.x, f.z - center.z), 0);
    awaken(eng, w, inp);
    run(eng, w, inp, 1, { awaken: true });
    run(eng, w, inp, 150);
    const d1 = foes.reduce((a, f) => a + Math.hypot(f.x - center.x, f.z - center.z), 0);
    expect(w.drags).toBeGreaterThan(20);
    expect(d1).toBeLessThan(d0 * 0.5);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('Endboss-Schutz: kein Ultimate tötet einen vollen Endboss', () => {
  it('Deckel je Bossart: Raid-Endboss 8 % (oder eigener), Kaiser 5 %, andere Bosse 20 %, normale Gegner ohne Deckel', () => {
    expect(ultimateBossCap({ raid: 'boss' })).toBe(RAID_BOSS_HIT_CAP);
    expect(ultimateBossCap({ raid: 'boss', hitCap: KAISER_BOSS_HIT_CAP })).toBe(KAISER_BOSS_HIT_CAP);
    expect(ultimateBossCap({ boss: true })).toBe(ULTIMATE_BOSS_CAP);
    expect(ultimateBossCap({})).toBeNull();
    expect(ULTIMATE_BOSS_CAP).toBeLessThan(0.5);
  });

  it('alle Treffer eines Ultimates zusammen bleiben unter dem Deckel; das nächste Wirken beginnt neu', () => {
    for (const id of ULTIMATE_ORDER) {
      const u = ULTIMATES[id]!;
      const L = new UltimateBossLedger();
      const maxHp = 50000;
      let hp = maxHp;
      // jeder Treffer würde allein 40 % nehmen
      for (const _h of u.hits) for (let r = 0; r < 3; r++) {
        const d = L.allow(7, 'boss', RAID_BOSS_HIT_CAP, maxHp, maxHp * 0.4);
        hp -= d;
        L.record(d);
      }
      expect(maxHp - hp, id).toBeLessThanOrEqual(maxHp * RAID_BOSS_HIT_CAP + 1);
      expect(hp, id).toBeGreaterThan(0);
      expect(L.dealtTo('boss')).toBeCloseTo(maxHp - hp, 3);
      // neues Wirken: wieder ein Treffer frei, normale Gegner ungedeckelt
      expect(L.allow(8, 'boss', RAID_BOSS_HIT_CAP, maxHp, 99999)).toBe(Math.floor(maxHp * RAID_BOSS_HIT_CAP));
      expect(L.allow(8, 'matrose', null, 100, 777)).toBe(777);
    }
  });

  it('Ultimate-Treffer brechen sofort die Haltung (HitContext meldet „Ultimate“)', () => {
    const { w, eng, inp } = setup('erdspalter');
    w.foe(0, 8, { boss: true });
    awaken(eng, w, inp);
    run(eng, w, inp, 1, { awaken: true });
    run(eng, w, inp, 120);
    const u = w.log.filter((l) => l.move === 'erdspalter.u');
    expect(u.length).toBeGreaterThan(0);
    expect(u.every((l) => l.ultimate)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------

/** Spielzeug-Schiff: unterteilter Rumpf (wird zerschnitten), Deck, zwei Masten, Kanonen vorn und hinten – ein gemeinsames Material */
function toyShip(): { root: Group; mat: MeshBasicMaterial; tris: number } {
  const root = new Group();
  const mat = new MeshBasicMaterial();
  const hull = new Mesh(new BoxGeometry(6, 3, 30, 2, 2, 24), mat);
  hull.position.y = 0.5;
  const deck = new Mesh(new BoxGeometry(5.6, 0.2, 28, 1, 1, 20), mat);
  deck.position.y = 2.1;
  const mastF = new Mesh(new CylinderGeometry(0.2, 0.25, 14, 8), mat); mastF.position.set(0, 9, 8);
  const mastA = new Mesh(new CylinderGeometry(0.2, 0.25, 14, 8), mat); mastA.position.set(0, 9, -8);
  const sub = new Group();
  const gunF = new Mesh(new BoxGeometry(0.6, 0.6, 1.6), mat); gunF.position.set(2.6, 1.6, 10);
  const gunA = new Mesh(new BoxGeometry(0.6, 0.6, 1.6), mat); gunA.position.set(-2.6, 1.6, -11);
  sub.add(gunF, gunA);
  root.add(hull, deck, mastF, mastA, sub);
  let tris = 0;
  root.traverse((o) => { const m = o as Mesh; if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3; });
  return { root, mat, tris };
}
