// Phase 4.6J – MMO-Ziel-Erfassung, Ziel-Fenster, Zielhilfe und Verbündeten-Schutz, entkoppelte Schiffs-Zerlegung ohne Bild-Spitze,
// Akt-2-Bildregelung der Kino-Regie und die Trennung von Monitor-Auflösung und Grafikstufen.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import {
  RELATION_RING, TARGET, TargetPool, aimYaw, broadsideSide, canHarm, cleanTargetState, cycleTarget, frameView, newFrameView, newTargetState,
  pickTarget, relationOf, ringTone, setTarget, validatePlayerHit, type RelationContext, type TargetCandidate,
} from '../src/combat/targetLock';
import { ActionCombatEngine, createFighter, makeInput, type ActionTarget, type ActionWorld } from '../src/combat/actionCombatEngine';
import { ACTION_TUNING } from '../src/data/actionStyles';
import { ACTION_GROUPS, ACTION_IDS, ACTION_LABELS, DEFAULT_KEYS, DEFAULT_PAD } from '../src/data/actions';
import { TOUCH_FOOT, TOUCH_SEA } from '../src/data/touchLayout';
import { SPLIT_FRAME_MS, beginShipSplit, cancelShipSplit, pendingShipSplits, pumpShipSplits, splitShipModel, updateShipSplit } from '../src/entities/ship/shipSplit';
import { releaseIndexOnly } from '../src/render/dispose';
import { RESOLUTION, RESOLUTION_LABEL, RESOLUTION_MODES, renderPixelRatio, renderSize } from '../src/render/resolution';
import { QUALITY_IDS, QUALITY_TIERS, tierFeatures } from '../src/data/qualityTiers';
import { SETTINGS_TAB_KEYS, defaultSettings, sanitizeSettings } from '../src/core/settings';
import { GRADE_BLEND, ULTIMATE_CINEMATICS, UltimateCinematics } from '../src/graphics/ultimateCinematics';
import { SKYFALL_ULTIMATE, ULTIMATES, ULTIMATE_ORDER } from '../src/data/cataclysms';
import type { ActionMove, CataclysmKind, UltimateSpec } from '../src/data/actionKit';

const DT = 1 / 60;

// ---------------------------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------------------------

function cand(pool: TargetPool, o: Partial<TargetCandidate>): TargetCandidate {
  const c = pool.next()!;
  Object.assign(c, {
    id: 'x', kind: 'fighter', relation: 'hostile', domain: 'land', npc: false, x: 0, y: 0, z: 0, radius: 0.5, height: 1.8, name: 'Matrose', level: 5,
    power: 'marine', nation: 'Die Marine', crest: '#ffffff', category: 'Matrose', hp: 100, maxHp: 100, posture: -1, broken: false, alive: true, prio: 1, ref: null,
  }, o);
  return c;
}

const CTX = (st: Record<string, number> = {}, allies: string[] = []): RelationContext => ({ standing: (p) => st[p] ?? 0, allies: new Set(allies), peaceAt: 20, allyAt: 60 });

/** kleine Kampfwelt für die Engine (Kreise auf ebenem Boden) */
class FoeWorld implements ActionWorld {
  foes: { id: string; x: number; z: number; alive: boolean }[] = [];
  height() { return 0; }
  move(b: { x: number; z: number }, dx: number, dz: number) { b.x += dx; b.z += dz; }
  teleport(b: { x: number; z: number }, x: number, z: number) { b.x = x; b.z = z; return true; }
  targets(x: number, z: number, r: number, out: ActionTarget[]): number {
    let n = 0;
    this.foes.forEach((f, i) => {
      if (n >= out.length || Math.hypot(f.x - x, f.z - z) > r + 0.45) return;
      const t = out[n++];
      t.id = f.id; t.x = f.x; t.y = 0; t.z = f.z; t.radius = 0.45; t.height = 1.8; t.yaw = 0; t.alive = f.alive; t.airborne = false; t.mass = false;
      t.broken = false; t.boss = false; t.elite = false; t.attacking = false; t.ref = i;
    });
    return n;
  }
  drag() { /* fest */ }
  hit() { return 1; }
  shoot() { /* keine Geschosse */ }
}

function bigShip(segments = 120): { root: Group; tris: number } {
  const root = new Group();
  const mat = new MeshBasicMaterial();
  const hull = new Mesh(new BoxGeometry(6, 3, 30, 24, 24, segments), mat);
  hull.position.y = 0.5;
  const deck = new Mesh(new BoxGeometry(5.6, 0.2, 28, 8, 1, segments), mat);
  deck.position.y = 2.1;
  const mast = new Mesh(new CylinderGeometry(0.2, 0.25, 14, 16, 8), mat); mast.position.set(0, 9, 6);
  root.add(hull, deck, mast);
  let tris = 0;
  root.traverse((o) => { const m = o as Mesh; if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3; });
  return { root, tris };
}

const countTris = (root: Group) => { let n = 0; root.traverse((o) => { const m = o as Mesh; if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3; }); return n; };

const ALL: ActionMove[] = [...ULTIMATE_ORDER.map((id) => ULTIMATES[id]!), SKYFALL_ULTIMATE];
const specOf = (kind: CataclysmKind): UltimateSpec => ALL.find((m) => m.ultimate!.kind === kind)!.ultimate!;

// ---------------------------------------------------------------------------------------------------------------
// 1. Ziel-Auswahl: Tab, Umschalt+Tab, Klick/Tipp
// ---------------------------------------------------------------------------------------------------------------

describe('MMO-Ziel-Erfassung: Durchschalten und Anklicken', () => {
  it('Tab wählt im Gefecht nur Feinde – Boss und Elite zuerst, dann nach Nähe und Bildmitte; Umschalt+Tab geht zurück', () => {
    const pool = new TargetPool(16);
    cand(pool, { id: 'npc', kind: 'npc', relation: 'neutral', npc: true, x: 0, z: 3, prio: 0 });
    cand(pool, { id: 'm1', x: 1, z: 6 });
    cand(pool, { id: 'boss', kind: 'boss', x: -2, z: 14, prio: 3 });
    cand(pool, { id: 'elite', kind: 'elite', x: 3, z: 10, prio: 2 });
    cand(pool, { id: 'off', ally: undefined, relation: 'friendly', kind: 'officer', x: 0, z: 2 } as Partial<TargetCandidate>);
    const view = { x: 0, z: 0, yaw: 0, range: TARGET.cycleLand };
    const seq: string[] = [];
    let cur = '';
    for (let i = 0; i < 4; i++) { const k = cycleTarget(pool, cur, 1, view); cur = pool.items[k].id; seq.push(cur); }
    expect(seq.slice(0, 3)).toEqual(['boss', 'elite', 'm1']);
    expect(seq[3]).toBe('boss');
    // rückwärts
    expect(pool.items[cycleTarget(pool, 'boss', -1, view)].id).toBe('m1');
    expect(pool.items[cycleTarget(pool, '', -1, view)].id).toBe('m1');
    // keine Bewohner/Verbündeten, solange Feinde in Sicht sind
    expect(seq).not.toContain('npc');
    expect(seq).not.toContain('off');
  });

  it('ohne Feinde (Hafen) schaltet Tab durch Bewohner, Offiziere und Schiffe; nur ein Ziel → Tab löst die Erfassung', () => {
    const pool = new TargetPool(8);
    cand(pool, { id: 'ilse', kind: 'npc', relation: 'neutral', npc: true, x: 0, z: 4, prio: 0.4 });
    cand(pool, { id: 'koch', kind: 'npc', relation: 'neutral', npc: true, x: 2, z: 9, prio: 0 });
    const view = { x: 0, z: 0, yaw: 0, range: TARGET.cycleLand };
    const a = cycleTarget(pool, '', 1, view);
    expect(pool.items[a].id).toBe('ilse');
    expect(pool.items[cycleTarget(pool, 'ilse', 1, view)].id).toBe('koch');
    const one = new TargetPool(4);
    cand(one, { id: 'solo', x: 0, z: 5 });
    expect(cycleTarget(one, '', 1, view)).toBe(0);
    expect(cycleTarget(one, 'solo', 1, view)).toBe(-1);
  });

  it('Sichtfeld: an Land zählt nur, was vor der Kamera liegt; auf See auch Schiffe querab (Breitseiten-Ziele)', () => {
    const pool = new TargetPool(4);
    cand(pool, { id: 'hinten', x: 0, z: -20 });
    cand(pool, { id: 'quer', kind: 'ship', domain: 'sea', x: -120, z: 20, radius: 12 });
    expect(cycleTarget(pool, '', 1, { x: 0, z: 0, yaw: 0, range: TARGET.cycleLand })).toBe(-1);
    const k = cycleTarget(pool, '', 1, { x: 0, z: 0, yaw: 0, range: TARGET.cycleSea, half: TARGET.viewHalfSea });
    expect(pool.items[k].id).toBe('quer');
  });

  it('Anklicken/Antippen: Kreis um die Bildschirm-Lage, vorderstes Ziel gewinnt, hinter der Kamera nie', () => {
    const pool = new TargetPool(4);
    cand(pool, { id: 'vorn' }); cand(pool, { id: 'hinten' }); cand(pool, { id: 'rueck' });
    const sx = [500, 505, 500], sy = [300, 302, 300], sr = [30, 40, 60], sd = [8, 20, -5];
    expect(pickTarget(pool, sx, sy, sr, sd, 512, 310)).toBe(0);
    expect(pickTarget(pool, sx, sy, sr, sd, 545, 300)).toBe(1);
    expect(pickTarget(pool, sx, sy, sr, sd, 900, 900)).toBe(-1);
    // ganz kleine (ferne) Ziele bleiben anklickbar
    expect(pickTarget(pool, [100], [100], [2], [400], 100 + TARGET.pickMinPx, 100)).toBe(0);
  });

  it('Zustand ist JSON, wird beim Laden/Empfangen gesäubert', () => {
    const pool = new TargetPool(2);
    const c = cand(pool, { id: 'enemy-7', kind: 'boss' });
    const st = setTarget(newTargetState(), c, 'tab', 12.5);
    const back = cleanTargetState(JSON.parse(JSON.stringify(st)));
    expect(back).toEqual(st);
    expect(cleanTargetState({ id: 5, kind: 'drache' })).toEqual(newTargetState());
    expect(cleanTargetState({ id: 'ship-2', kind: 'drache', relation: 'freund' }).kind).toBe('');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Freund und Feind, Treffer-Prüfung
// ---------------------------------------------------------------------------------------------------------------

describe('Freund/Feind-Regeln und Verbündeten-Schutz', () => {
  it('relationOf: eigen/verbündet > provoziert/feindlich > Bündnis > Bewohner > Ansehen', () => {
    expect(relationOf({ own: true, provoked: true }, CTX())).toBe('friendly');
    expect(relationOf({ ally: true }, CTX())).toBe('friendly');
    expect(relationOf({ power: 'marine', provoked: true }, CTX({}, ['marine']))).toBe('hostile');
    expect(relationOf({ power: 'marine' }, CTX({}, ['marine']))).toBe('friendly');
    expect(relationOf({ civilian: true, power: 'england' }, CTX({ england: -50 }))).toBe('neutral');
    expect(relationOf({ power: 'england' }, CTX({ england: 25 }))).toBe('neutral');
    expect(relationOf({ power: 'england' }, CTX({ england: 70 }))).toBe('friendly');
    expect(relationOf({ power: 'england' }, CTX({ england: -10 }))).toBe('hostile');
    expect(relationOf({}, null)).toBe('hostile');
  });

  it('kein Eigenbeschuss: der Spieler (und seine Leute) können Verbündete nie treffen, Neutrale schon (sie werden provoziert)', () => {
    expect(canHarm('friendly', 'friendly')).toBe(false);
    expect(canHarm('friendly', 'hostile')).toBe(true);
    expect(canHarm('friendly', 'neutral')).toBe(true);
    expect(canHarm('hostile', 'hostile')).toBe(false);
    expect(canHarm('neutral', 'neutral')).toBe(true);
    expect(validatePlayerHit({ relation: 'friendly', alive: true })).toMatch(/Verbündete/);
    expect(validatePlayerHit({ relation: 'hostile', alive: false })).toMatch(/besiegt/);
    expect(validatePlayerHit({ relation: 'hostile', alive: true }, 80, 60)).toMatch(/Reichweite/);
    expect(validatePlayerHit({ relation: 'hostile', alive: true }, 40, 60)).toBe('');
  });

  it('Ringfarben: Rot Feind, Gelb neutral, Grün verbündet, Blau Bewohner – gleiche Werte in tokens.css', () => {
    expect(ringTone({ relation: 'hostile', npc: false })).toBe('hostile');
    expect(ringTone({ relation: 'neutral', npc: true })).toBe('npc');
    const css = readFileSync('src/ui/css/tokens.css', 'utf8').toLowerCase();
    for (const [k, v] of Object.entries(RELATION_RING)) expect(css).toContain(`--target-${k}: ${v.toLowerCase()}`);
  });

  it('Seesystem und Kampfsystem fragen die reine Regel (Kugeln, Rammen, Ultimates, Verbände)', () => {
    const naval = readFileSync('src/naval/naval.ts', 'utf8');
    expect(naval).toMatch(/b\.owner === this\.player && !this\.harmableByPlayer\(s\)/);
    expect(naval).toMatch(/f === p && !this\.playerMayHarm\(e\)/);
    expect(naval).toMatch(/cataclysmFriendly[\s\S]{0,200}!this\.playerMayHarm\(e\)/);
    expect(naval).toMatch(/relationOf\(/);
    const combat = readFileSync('src/combat/combat.ts', 'utf8');
    expect(combat).toMatch(/massOk\(q: TroopSquad\)[^\n]*canHarm\('friendly'/);
    expect((combat.match(/this\.massOk\(q\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Ziel-Fenster
// ---------------------------------------------------------------------------------------------------------------

describe('Ziel-Fenster (Target Frame)', () => {
  it('Name, „Stufe X“, Macht mit Wappenfarbe, Kategorie, Leben – Haltung nur bei Elite und Bossen', () => {
    const pool = new TargetPool(4);
    const boss = cand(pool, { id: 'kaiser', kind: 'boss', name: 'Kaiser der Glutsee', level: 72, nation: 'Kurogane', crest: '#c03030', category: 'Endboss · Kaiser', hp: 39000, maxHp: 39000, posture: 0.6, prio: 3 });
    const v = frameView(boss, newFrameView());
    expect(v.visible).toBe(true);
    expect(v.levelText).toBe('Stufe 72');
    expect(v.nation).toBe('Kurogane');
    expect(v.crest).toBe('#c03030');
    expect(v.category).toBe('Endboss · Kaiser');
    expect(v.hpText).toBe('39.000 / 39.000');
    expect(v.posture).toBeCloseTo(0.6);
    expect(v.relationText).toBe('Feind');
    const fighter = cand(pool, { id: 'm', posture: 0.3 });
    expect(frameView(fighter, newFrameView()).posture).toBe(-1);
    const npc = cand(pool, { id: 'n', kind: 'npc', relation: 'neutral', npc: true, level: 0, hp: 0, maxHp: 0, name: 'Ilse Tauwerk', category: 'Hafenmeisterin' });
    const nv = frameView(npc, newFrameView());
    expect(nv.levelText).toBe('');
    expect(nv.hpText).toBe('');
    expect(nv.relationText).toBe('Bewohner');
    expect(nv.tone).toBe('npc');
  });

  it('Zero-GC: unveränderte Lebenspunkte bauen keinen neuen Text; Änderung schon; Gebrochen zeigt die volle Leiste', () => {
    const pool = new TargetPool(2);
    const c = cand(pool, { id: 'e', kind: 'elite', hp: 500, maxHp: 1000, posture: 0.4 });
    const v = newFrameView();
    frameView(c, v);
    const t1 = v.hpText;
    frameView(c, v);
    expect(v.hpText).toBe(t1);
    c.hp = 420;
    frameView(c, v);
    expect(v.hpText).toBe('420 / 1.000');
    c.broken = true;
    expect(frameView(c, v).broken).toBe(true);
    c.alive = false;
    expect(frameView(c, v).visible).toBe(false);
  });

  it('Ziel-Fenster hängt oben im HUD (Zone tc) und schreibt nur Änderungen ins DOM', () => {
    const src = readFileSync('src/ui/targetFrame.ts', 'utf8');
    expect(src).toMatch(/if \(k !== this\.hp\)/);
    expect(src).toMatch(/v\.hpText !== this\.hpLabel/);
    const game = readFileSync('src/core/game.ts', 'utf8');
    expect(game).toMatch(/new TargetFrame\(zone\.tc\)/);
    const css = readFileSync('src/ui/css/hud.css', 'utf8');
    expect(css).toMatch(/\.hud-target\[data-tone='npc'\]/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Zielhilfe: Kampfkünste, Assists, Breitseiten
// ---------------------------------------------------------------------------------------------------------------

describe('Zielhilfe auf das angewählte Ziel', () => {
  it('Kampfkunst dreht sofort zum angewählten Ziel – auch wenn es hinter der Figur steht und ein anderer Gegner näher ist', () => {
    const w = new FoeWorld();
    w.foes.push({ id: 'nah', x: 0, z: 2.5, alive: true }, { id: 'ziel', x: 0, z: -8, alive: true });
    const eng = new ActionCombatEngine(createFighter('foot-t', 'saebel', 0, 0, 0, 0));
    const inp = makeInput();
    for (let i = 0; i < 5; i++) eng.step(inp, w, DT);
    inp.softLockId = 'ziel';
    inp.skill = 1;
    eng.step(inp, w, DT);
    inp.skill = 0;
    expect(eng.f.lockId).toBe('ziel');
    expect(Math.abs(Math.atan2(Math.sin(eng.f.yaw - Math.PI), Math.cos(eng.f.yaw - Math.PI)))).toBeLessThan(0.05);
  });

  it('außer Reichweite oder bei normalen Hieben greift die Zielhilfe nicht (der Kegel-Magnet bleibt)', () => {
    const w = new FoeWorld();
    w.foes.push({ id: 'fern', x: 0, z: TARGET.artAim + 6, alive: true }, { id: 'nah', x: 0, z: 2, alive: true });
    const eng = new ActionCombatEngine(createFighter('foot-t', 'saebel', 0, 0, 0, 0));
    const inp = makeInput();
    for (let i = 0; i < 5; i++) eng.step(inp, w, DT);
    inp.softLockId = 'fern';
    inp.skill = 1;
    eng.step(inp, w, DT);
    expect(eng.f.lockId).not.toBe('fern');
    expect(TARGET.artAim).toBeGreaterThan(ACTION_TUNING.magnetRange);
  });

  it('aimYaw und Breitseiten-Seite: Backbord (+1) / Steuerbord (−1) wie NavalSystem, nur in Reichweite und im erweiterten Fächer', () => {
    expect(aimYaw(0, 0, { x: 0, z: 10, radius: 0.5, alive: true }, 20)).toBeCloseTo(0);
    expect(Number.isNaN(aimYaw(0, 0, { x: 0, z: 50, radius: 0.5, alive: true }, 20))).toBe(true);
    // Kurs Nord (0): Backbord-Breitseite feuert nach +x (links = (cos h, −sin h) · Seite)
    expect(broadsideSide(0, 0, 0, 80, 10, 100)).toBe(1);
    expect(broadsideSide(0, 0, 0, -80, 10, 100)).toBe(-1);
    expect(broadsideSide(0, 0, 0, 0, 80, 100)).toBe(0);
    expect(broadsideSide(0, 0, 0, 200, 0, 100)).toBe(0);
    const naval = readFileSync('src/naval/naval.ts', 'utf8');
    expect(naval).toMatch(/const at = this\.aimTarget;[\s\S]{0,220}broadsideSide\(/);
    expect(naval).toMatch(/bowShot[\s\S]{0,500}this\.aimTarget/);
    const sea = readFileSync('src/world/seaWorld.ts', 'utf8');
    // Offiziers-Assists nehmen das angewählte Feind-Ziel als Mitte
    expect(sea).toMatch(/lock: \(\) => \{[\s\S]{0,400}t\.sel\.relation === 'hostile'/);
  });

  it('Tasten: Tab = nächstes Ziel, Umschalt+Tab = voriges, rechter Stick-Klick am Gamepad, Ziel-Knopf am Handy (zu Fuß und auf See)', () => {
    expect(ACTION_IDS).toContain('targetNext');
    expect(ACTION_IDS).toContain('targetPrev');
    expect(DEFAULT_KEYS.targetNext).toEqual(['Tab']);
    expect(DEFAULT_KEYS.lockon).not.toContain('Tab');
    expect(DEFAULT_PAD.targetNext).toEqual([11]);
    expect(ACTION_LABELS.targetPrev).toMatch(/Umschalt \+ Tab/);
    expect(ACTION_GROUPS.some((g) => g.actions.includes('targetNext') && g.actions.includes('targetPrev'))).toBe(true);
    expect(TOUCH_FOOT.some((b) => b.action === 'targetNext')).toBe(true);
    expect(TOUCH_SEA.some((b) => b.action === 'targetNext')).toBe(true);
    // Knöpfe am Handy überlappen nicht
    for (const L of [TOUCH_FOOT, TOUCH_SEA]) for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      const d = Math.hypot((a.right + a.size / 2) - (b.right + b.size / 2), (a.bottom + a.size / 2) - (b.bottom + b.size / 2));
      expect(d, `${a.action}/${b.action}`).toBeGreaterThan((a.size + b.size) / 2 - 2);
    }
    const input = readFileSync('src/core/input/input.ts', 'utf8');
    expect(input).toMatch(/e\.shiftKey && !this\.held\.has\(e\.code\) && this\.keyMap\.get\(e\.code\)\?\.includes\('targetNext'\)/);
    expect(input).toMatch(/flushShift\(false\)/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 5. Schiffs-Zerlegung ohne Bild-Spitze
// ---------------------------------------------------------------------------------------------------------------

describe('Schiffs-Zerlegung über mehrere Bilder (kein 20 – 35-ms-Bild mehr)', () => {
  it('Auftrag: jedes Bild höchstens das Budget (plus ein Teilstück), Ergebnis gleich der Zerlegung in einem Zug', () => {
    const sync = bigShip();
    const ref = splitShipModel(sync.root, 'cross', 30, 6, 2.5, 3);
    const job = bigShip();
    const st = beginShipSplit(job.root, 'cross', 30, 6, 2.5, 3);
    expect(st.ready).toBe(false);
    expect(pendingShipSplits()).toBe(1);
    // vor dem Fertigwerden bewegt sich nichts (jeder Zwischenstand sieht aus wie das ganze Schiff)
    updateShipSplit(st, 0.5);
    expect(st.t).toBe(0);
    let frames = 0;
    while (pendingShipSplits() && frames < 400) { pumpShipSplits(0.25); frames++; if (!st.ready) { updateShipSplit(st, 1 / 60); expect(st.a.rotation.x).toBe(0); } }
    expect(st.ready).toBe(true);
    expect(frames).toBeGreaterThan(1);
    expect(st.frames).toBe(frames);
    expect(st.sliced).toBe(ref.sliced);
    expect(countTris(job.root)).toBe(sync.tris);
    expect(countTris(job.root)).toBe(countTris(sync.root));
    // danach kippen die Hälften wie gewohnt
    for (let i = 0; i < 60; i++) updateShipSplit(st, 1 / 60);
    expect(st.a.rotation.x).toBeLessThan(-0.1);
    expect(st.b.rotation.x).toBeGreaterThan(0.1);
  });

  it('Standard-Budget im Spiel: unter 4 ms je Bild, meist 2 – 3 Bilder; mehrere Schiffe laufen nacheinander', () => {
    expect(SPLIT_FRAME_MS).toBeLessThanOrEqual(3);
    const ships = [bigShip(60), bigShip(60)];
    const sts = ships.map((s, i) => beginShipSplit(s.root, i ? 'length' : 'cross', 30, 6, 2.5, i + 1, 0, i ? 4 : 2));
    let frames = 0;
    while (pendingShipSplits() && frames < 200) { pumpShipSplits(); frames++; }
    expect(sts.every((s) => s.ready)).toBe(true);
    for (const s of sts) expect(s.maxStepMs).toBeLessThan(SPLIT_FRAME_MS + 6);
  });

  it('abgebaute Schiffe: der Auftrag verfällt, Teile hängen nirgends fest', () => {
    const s = bigShip(40);
    const st = beginShipSplit(s.root, 'cross', 30, 6, 2.5, 1);
    pumpShipSplits(0.05);
    const src = readFileSync('src/entities/ship/ship.ts', 'utf8');
    expect(src).toMatch(/if \(this\.split && !this\.split\.ready\) cancelShipSplit\(this\.split\)/);
    expect(src).toMatch(/beginShipSplit\(/);
    // abbauen → verwerfen: der nächste Pump-Durchlauf räumt ihn ab, ohne weiterzuarbeiten
    expect(pendingShipSplits()).toBe(1);
    cancelShipSplit(st);
    expect(pendingShipSplits()).toBe(0);
    pumpShipSplits();
    expect(st.ready).toBe(false);
  });

  it('das Original gibt nur seinen Index frei – die Eckpunkt-Puffer der Hälften bleiben (kein Neu-Hochladen)', () => {
    const g = new BufferGeometry();
    const pos = new BufferAttribute(new Float32Array(9), 3);
    g.setAttribute('position', pos);
    g.setIndex([0, 1, 2]);
    const half = new BufferGeometry();
    half.setAttribute('position', pos);
    let removed: unknown[] = [];
    g.addEventListener('dispose', (e) => { removed = Object.values((e.target as BufferGeometry).attributes); });
    releaseIndexOnly(g);
    expect(removed).toEqual([]);
    expect(half.getAttribute('position')).toBe(pos);
  });

  it('die Seewelt pumpt die Aufträge je gezeichnetem Bild (auch im Standbild der Impact-Frames)', () => {
    const sea = readFileSync('src/world/seaWorld.ts', 'utf8');
    expect(sea).toMatch(/pumpShipSplits\(\);/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 6. Akt-2-Kontrast der Kino-Regie
// ---------------------------------------------------------------------------------------------------------------

describe('Akt 2: weniger Überstrahlung bei Himmelsspalter und Sintflutdrache', () => {
  it('beide haben eine Akt-2-Bildregelung (Belichtung und Bloom gedämpft), die übrigen bleiben unverändert', () => {
    for (const k of ['horizonCut', 'floodDragon'] as CataclysmKind[]) {
      const g = ULTIMATE_CINEMATICS[k].grade2!;
      expect(g.exposure).toBeLessThan(0.9);
      expect(g.exposure).toBeGreaterThan(0.6);
      expect(g.bloom).toBeLessThan(0.5);
    }
    expect(Object.values(ULTIMATE_CINEMATICS).filter((d) => d.grade2).length).toBe(2);
  });

  it('Ablauf: in Akt 2 gedämpft, im Treffermoment (unter dem invertierten Bild) und danach wieder 1', () => {
    for (const k of ['horizonCut', 'floodDragon'] as CataclysmKind[]) {
      const cine = new UltimateCinematics();
      cine.start(k, specOf(k));
      let minExp = 1, minBloom = 1, during = 0;
      for (let i = 0; i < 240 && cine.active; i++) {
        if (cine.phase === 'build' && cine.t > 0.3) cine.impact();
        cine.update(DT, 0);
        if (cine.phase === 'build' && cine.t > GRADE_BLEND) { minExp = Math.min(minExp, cine.exposureK); minBloom = Math.min(minBloom, cine.bloomK); during++; }
        if (cine.phase === 'prep') { expect(cine.exposureK).toBe(1); expect(cine.bloomK).toBe(1); }
        if (cine.phase === 'return') { expect(cine.exposureK).toBe(1); expect(cine.bloomK).toBe(1); }
      }
      expect(during).toBeGreaterThan(3);
      expect(minExp).toBeCloseTo(ULTIMATE_CINEMATICS[k].grade2!.exposure, 2);
      expect(minBloom).toBeCloseTo(ULTIMATE_CINEMATICS[k].grade2!.bloom, 2);
      expect(cine.exposureK).toBe(1);
      expect(cine.bloomK).toBe(1);
    }
  });

  it('Effekte: Klingenwelle mit Tusche-Mantel und gedämpften Wänden, Drachenwelle leiser; Spiel setzt Belichtung und Bloom', () => {
    const dir = readFileSync('src/world/cataclysmDirector.ts', 'utf8');
    expect(dir).toMatch(/180 m breite Energiewand[\s\S]{0,700}fx\.emit\('arcInk'\)/);
    expect(dir).toMatch(/col\(k === 1 \? WHITE : c\.col, k === 1 \? 0\.4 : 0\.7\)/);
    const game = readFileSync('src/core/game.ts', 'utf8');
    expect(game).toMatch(/\* cine\.exposureK\)/);
    expect(game).toMatch(/setBloomK\(cine\.bloomK\)/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 7. Auflösung getrennt von den Grafikstufen
// ---------------------------------------------------------------------------------------------------------------

describe('Monitor-Auflösung unabhängig von den Grafikstufen', () => {
  it('Automatisch = 100 % native Pixeldichte, gedeckelt auf DPR 2; Leistung = 85 %', () => {
    expect(renderPixelRatio('auto', 1440, 900, 1)).toBe(1);
    expect(renderPixelRatio('auto', 1440, 900, 1.25)).toBe(1.25);
    expect(renderPixelRatio('auto', 390, 844, 3)).toBe(2);
    expect(renderPixelRatio('perf85', 1440, 900, 1)).toBeCloseTo(0.85);
    expect(renderPixelRatio('perf85', 390, 844, 3)).toBeCloseTo(1.7);
  });

  it('feste Auflösungen: 1080p/1440p/4K treffen die Zielhöhe (Querformat), höchstens 4K-Pixel', () => {
    expect(renderSize('1080p', 1440, 900, 1).h).toBe(1080);
    expect(renderSize('1440p', 1440, 900, 1).h).toBe(1440);
    expect(renderSize('4k', 1440, 900, 1).h).toBe(2160);
    expect(renderSize('1080p', 2560, 1440, 1)).toEqual({ w: 1920, h: 1080 });
    const k4 = renderSize('4k', 3840, 2160, 2);
    expect(k4.w * k4.h).toBeLessThanOrEqual(RESOLUTION.maxPixels + 4000);
    // Hochformat: die kürzere Seite bekommt die Zielhöhe bzw. die längere 16/9 davon
    expect(renderSize('1080p', 390, 844, 3).w).toBeLessThanOrEqual(1080);
  });

  it('die Grafikstufe ändert die Auflösung nie – sie hat kein Pixelverhältnis mehr; der Renderer fragt nur die Einstellung', () => {
    for (const q of QUALITY_IDS) {
      const c = QUALITY_TIERS[q] as unknown as Record<string, unknown>;
      expect('pixelRatio' in c).toBe(false);
      expect('supersample' in c).toBe(false);
      expect('maxPixels' in c).toBe(false);
    }
    // gleiche Eingaben, jede Stufe: gleiche Auflösung (die Funktion kennt keine Stufe)
    expect(renderPixelRatio.length).toBe(4);
    const r = readFileSync('src/render/renderer.ts', 'utf8');
    expect(r).toMatch(/return renderPixelRatio\(this\.resolution, innerWidth, innerHeight, window\.devicePixelRatio \|\| 1\);/);
    expect(r).not.toMatch(/c\.supersample/);
  });

  it('Grafikstufen steuern Schatten, Bloom/AO, Wasser-Spiegelungen, Bewuchs-Sichtweite und Stoffphysik-Distanz (aufsteigend)', () => {
    const f = QUALITY_IDS.map((q) => tierFeatures(q));
    for (let i = 1; i < f.length; i++) {
      expect(f[i].shadowTexels).toBeGreaterThanOrEqual(f[i - 1].shadowTexels);
      expect(f[i].ao).toBeGreaterThanOrEqual(f[i - 1].ao);
      expect(f[i].waterReflections).toBeGreaterThanOrEqual(f[i - 1].waterReflections);
      expect(f[i].vegetation).toBeGreaterThan(f[i - 1].vegetation);
      expect(f[i].cloth).toBeGreaterThanOrEqual(f[i - 1].cloth);
    }
    expect(f[0].bloom).toBe(false);
    expect(f[f.length - 1].bloom).toBe(true);
    expect(f[0].shadowTexels).toBe(0);
    expect(f[0].waterReflections).toBe(0);
    expect(f[f.length - 1].waterReflections).toBe(2);
    expect(f[f.length - 1].cloth).toBeGreaterThan(f[0].cloth * 2);
  });

  it('Einstellung „Auflösung / Bildschärfe“: Standard Automatisch, gesäubert, im Reiter Grafik, deutsche Namen', () => {
    expect(defaultSettings().resolution).toBe('auto');
    expect(sanitizeSettings({ resolution: '4k' }).resolution).toBe('4k');
    expect(sanitizeSettings({ resolution: '8k' }).resolution).toBe('auto');
    expect(sanitizeSettings(null).resolution).toBe('auto');
    expect(SETTINGS_TAB_KEYS.grafik).toContain('resolution');
    expect(RESOLUTION_MODES).toEqual(['auto', '1080p', '1440p', '4k', 'perf85']);
    expect(RESOLUTION_LABEL.auto).toBe('Automatisch (Monitor)');
    expect(RESOLUTION_LABEL.perf85).toBe('Leistung (85 %)');
    const menus = readFileSync('src/ui/menus.ts', 'utf8');
    expect(menus).toMatch(/<h3>Auflösung \/ Bildschärfe<\/h3>/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 8. Wasser ohne Raster in der Ferne
// ---------------------------------------------------------------------------------------------------------------

describe('Ozean: kein Kachel-/Gitter-Muster in der Ferne', () => {
  it('Ferne See als Wellenspektrum (kein Wertrauschen-Raster), gedrehte Farbfelder, Kachel-Brechung, Höhenschattierung nur nah', () => {
    const o = readFileSync('src/world/ocean.ts', 'utf8');
    expect(o).not.toMatch(/vec2 fp = vSkW\.xz \* 0\.05 \+ skOsc/);
    expect(o).toMatch(/for \(int i = 0; i < 12; i\+\+\)[\s\S]{0,200}2\.39996/);
    expect(o).toMatch(/smoothstep\(2\.5, 5\.0, len \/ max\(foot, 1e-3\)\)/);
    expect(o).toMatch(/vec2 skWarp = /);
    expect(o).toMatch(/rq \/ 61\.7/);
    expect(o).toMatch(/float skHgtK = 1\.0 - smoothstep\(140\.0, 520\.0, camD\)/);
    expect(o).toMatch(/sk-ocean32-/);
  });
});
