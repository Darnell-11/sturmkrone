// Phase 4.6D – AnimeVfxForge: sechs prozedurale Texturen, ein Shader-Programm für alle durchscheinenden Effekt-Schichten, die
// verbindliche 3-Schicht-Komposition (dunkler Mantel, Energiekern, Partikel/Oberfläche) für Ketten, Techniken, Ausweichen, Clash und alle
// 14 Ultimates, physische Schiffs-Zerstörung (Sektionen, Masten, Verkohlen, Anheben), das Ultimate-Banner über dem HUD.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AdditiveBlending, BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, NormalBlending, PerspectiveCamera, Scene, Vector3, type InstancedMesh } from 'three';
import { ActionCombatEngine, createFighter, makeInput, type ActionBody, type ActionInput, type ActionTarget, type ActionWorld, type HitContext } from '../src/combat/actionCombatEngine';
import { ACTION_STYLES, type ActionHit, type ActionMove, type ActionStyleId } from '../src/data/actionStyles';
import { ULTIMATES, ULTIMATE_ORDER } from '../src/data/cataclysms';
import { CataclysmFx, FX_CAP, FX_PRIMS, PRIM_LOOK, type FxPrim } from '../src/combat/cataclysmFx';
import { AnimeVfxForge, INK_LEVELS, VFX_TEX_KEYS, VFX_TEX_SIZE, VFX_TEX_WRAP, vfxTexturePixels, vfxTextures } from '../src/graphics/animeVfxForge';
import { CATACLYSM_DUR, CataclysmDirector, type CataclysmHost } from '../src/world/cataclysmDirector';
import { splitShipModel, updateShipSplit } from '../src/entities/ship/shipSplit';
import type { NavalSystem } from '../src/naval/naval';

const DT = 1 / 60;
const ALL_STYLES = Object.keys(ACTION_STYLES) as ActionStyleId[];

// ---------------------------------------------------------------------------------------------------------------
// Texturen
// ---------------------------------------------------------------------------------------------------------------

describe('Die sechs prozeduralen Anime-VFX-Texturen', () => {
  it('sechs scharfe 256×256-Texturen mit klarer Form: deckende Kerne, freie Flächen, helle Mitte', () => {
    expect(VFX_TEX_KEYS).toEqual(['slashArc', 'flameBrush', 'lightningJagged', 'waterFoam', 'runeCrack', 'emberSpark']);
    for (const key of VFX_TEX_KEYS) {
      const px = vfxTexturePixels(key);
      expect(px.length, key).toBe(VFX_TEX_SIZE * VFX_TEX_SIZE * 4);
      let cover = 0, solid = 0, maxL = 0, minA = 255;
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i + 3];
        if (a > 25) cover++;
        if (a > 200) solid++;
        if (a > 100 && px[i] > maxL) maxL = px[i];
        if (a < minA) minA = a;
      }
      const n = VFX_TEX_SIZE * VFX_TEX_SIZE;
      expect(cover / n, key).toBeGreaterThan(0.02);
      expect(cover / n, key).toBeLessThan(0.92);
      expect(solid, key).toBeGreaterThan(50);
      expect(maxL, key).toBeGreaterThan(240);
      expect(minA, key).toBeLessThan(10);
    }
  });

  it('rein und deterministisch: jeder Start erzeugt dieselben Pixel', () => {
    for (const key of VFX_TEX_KEYS) expect(vfxTexturePixels(key, 64)).toEqual(vfxTexturePixels(key, 64));
  });

  it('Fließ-Texturen (Flamme, Blitz, Gischt) kacheln nahtlos in Laufrichtung (UV-Lauf ohne Sprung)', () => {
    const S = VFX_TEX_SIZE;
    for (const key of VFX_TEX_KEYS) {
      const [ws, wt] = VFX_TEX_WRAP[key];
      if (!ws && !wt) continue;
      const px = vfxTexturePixels(key);
      const at = (x: number, y: number) => px[(y * S + x) * 4 + 3];
      let edge = 0, inner = 0;
      for (let i = 0; i < S; i++) {
        if (wt) { edge += Math.abs(at(i, 0) - at(i, S - 1)); inner += Math.abs(at(i, 0) - at(i, 1)); }
        if (ws) { edge += Math.abs(at(0, i) - at(S - 1, i)); inner += Math.abs(at(0, i) - at(1, i)); }
      }
      // der Sprung über die Naht ist nicht größer als zwischen zwei Nachbarzeilen
      expect(edge, key).toBeLessThan(inner * 2.5 + 400);
    }
  });

  it('Funken-Atlas: Rauten-Funke, Glut, Eiskristall und Wassertropfen – jede Zelle trägt eine eigene Form, Ränder frei', () => {
    const px = vfxTexturePixels('emberSpark');
    const S = VFX_TEX_SIZE, h = S / 2;
    const cells = [[0, 1], [1, 1], [0, 0], [1, 0]];
    const sums: number[] = [];
    for (const [cx, cy] of cells) {
      let sum = 0, border = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) {
        const a = px[(((cy * h + y) * S) + cx * h + x) * 4 + 3];
        sum += a;
        if (x < 3 || y < 3 || x > h - 4 || y > h - 4) border = Math.max(border, a);
      }
      sums.push(sum);
      expect(border).toBeLessThan(20);
    }
    for (const s of sums) expect(s).toBeGreaterThan(20000);
    expect(new Set(sums.map((s) => Math.round(s / 1000))).size).toBe(4);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Materialien und Programme
// ---------------------------------------------------------------------------------------------------------------

/** Merkmale, aus denen three.js das Shader-Programm eines Effekt-Netzes bildet */
function programKey(m: InstancedMesh): string {
  const mat = m.material as MeshBasicMaterial;
  const g = m.geometry;
  const opaque = mat.transparent === false && mat.blending === NormalBlending;
  return [mat.type, !!mat.map, mat.vertexColors, mat.side, mat.fog, opaque, mat.alphaTest > 0, !!g.attributes.normal, !!g.attributes.uv, g.attributes.color?.itemSize, !!m.instanceColor].join('|');
}

describe('Ein Programm für alle durchscheinenden Schichten (keine neuen Shader)', () => {
  const fx = new CataclysmFx(new Scene());
  const meshes: InstancedMesh[] = [];
  for (const p of FX_PRIMS) meshes.push(...fx.meshesOf(p));

  it('jede Grundform trägt eine der sechs Texturen – kein glattes Einzel-Primitiv mehr', () => {
    const tex = vfxTextures();
    const sources = new Set<unknown>(VFX_TEX_KEYS.map((k) => tex[k].source));
    for (const m of meshes) {
      const mat = m.material as MeshBasicMaterial;
      expect(mat.map, m.name).toBeTruthy();
      expect(sources.has(mat.map!.source), m.name).toBe(true);
      expect(mat.vertexColors, m.name).toBe(true);
      expect(mat.side, m.name).toBe(DoubleSide);
      expect(mat.fog, m.name).toBe(false);
      expect(m.geometry.attributes.uv, m.name).toBeTruthy();
      expect(m.geometry.attributes.normal, m.name).toBeUndefined();
    }
  });

  it('durchscheinend = additiv oder normal, ohne Tiefenschreiben; höchstens zwei Programm-Schlüssel (durchscheinend und fest)', () => {
    const keys = new Set<string>();
    for (const m of meshes) {
      const mat = m.material as MeshBasicMaterial;
      keys.add(programKey(m));
      if (mat.transparent) {
        expect(mat.depthWrite, m.name).toBe(false);
        expect([AdditiveBlending, NormalBlending]).toContain(mat.blending);
      }
    }
    expect(keys.size).toBeLessThanOrEqual(2);
  });

  it('dunkle Mäntel mischen normal und blenden über vier Deckkraft-Stufen aus (gleiche Textur, gleiches Programm)', () => {
    for (const p of FX_PRIMS) {
      const ms = fx.meshesOf(p);
      if (PRIM_LOOK[p].blend !== 'ink') { expect(ms.length, p).toBe(1); continue; }
      expect(ms.length, p).toBe(INK_LEVELS.length);
      ms.forEach((m, i) => {
        const mat = m.material as MeshBasicMaterial;
        expect(mat.blending, p).toBe(NormalBlending);
        expect(mat.opacity, p).toBeCloseTo(INK_LEVELS[i]);
        expect(programKey(m)).toBe(programKey(ms[0]));
      });
    }
  });

  it('ein Mantel wandert beim Ausblenden durch die Stufen und verschwindet (Zero-GC: Netze bleiben, nur Zähler)', () => {
    const f2 = new CataclysmFx(new Scene());
    const before = f2.group.children.length;
    f2.brush.reset().at(0, 0, 0).span(1).fade(0, 1).col(new MeshBasicMaterial().color, 1);
    f2.emit('smoke');
    const seen = new Set<number>();
    for (let i = 0; i < 70; i++) {
      f2.update(DT);
      f2.meshesOf('smoke').forEach((m, k) => { if (m.count) seen.add(k); });
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 20; i++) f2.update(DT);
    expect(f2.count('smoke')).toBe(0);
    expect(f2.group.children.length).toBe(before);
  });

  it('Funken folgen ihrer Flugbahn und zeigen ihre Fläche zur Kamera', () => {
    const f3 = new CataclysmFx(new Scene());
    const cam = new PerspectiveCamera();
    cam.position.set(0, 2, -10);
    cam.lookAt(0, 0, 0);
    f3.setCamera(cam);
    f3.brush.reset().at(0, 0, 0).vel(6, 0, 0).size(0.1, 0.5, 1).span(1).fade(0, 0);
    f3.emit('spark');
    f3.update(DT);
    const m = f3.meshesOf('spark')[0];
    const e = m.instanceMatrix.array;
    const ay = new Vector3(e[4], e[5], e[6]).normalize(), az = new Vector3(e[8], e[9], e[10]).normalize();
    expect(ay.x).toBeGreaterThan(0.99);
    const toCam = cam.position.clone().sub(new Vector3(e[12], e[13], e[14])).normalize();
    expect(az.dot(toCam)).toBeGreaterThan(0.9);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3-Schicht-Regel der Schmiede
// ---------------------------------------------------------------------------------------------------------------

const INK_PRIMS = FX_PRIMS.filter((p) => PRIM_LOOK[p].blend === 'ink');
const ADD_PRIMS = FX_PRIMS.filter((p) => PRIM_LOOK[p].blend === 'add');
const PARTICLES: FxPrim[] = ['spark', 'ember', 'ice', 'drop', 'smoke', 'rock'];
const SURFACE: FxPrim[] = ['shock', 'crater', 'foam', 'splash'];

/** Teile je Grundform, die ein Aufruf ausstößt */
function emitted(fx: CataclysmFx, fn: () => void): Map<FxPrim, number> {
  const before = new Map(FX_PRIMS.map((p) => [p, fx.count(p)] as const));
  fn();
  const out = new Map<FxPrim, number>();
  for (const p of FX_PRIMS) { const d = fx.count(p) - before.get(p)!; if (d > 0) out.set(p, d); }
  return out;
}
const has = (m: Map<FxPrim, number>, list: FxPrim[]) => list.some((p) => m.has(p));

function forgeRig(land: boolean) {
  const fx = new CataclysmFx(new Scene());
  const vf = new AnimeVfxForge(fx);
  vf.surface = { isLand: () => land, groundY: () => 0, waterY: () => 0 };
  return { fx, vf };
}

describe('Verbindliche 3-Schicht-Komposition', () => {
  const col = new MeshBasicMaterial().color.set('#FF7A3A');
  const ink = new MeshBasicMaterial().color.set('#100404');

  it('Klingen- und Faustbogen, Fraktal-Blitz, Spirale, Trichter, Korona, Glas, Silhouette, Druckring: dunkler Mantel + Energiekern (+ Partikel)', () => {
    const { fx, vf } = forgeRig(true);
    const cases: [string, () => void, boolean][] = [
      ['slash', () => vf.slash(0, 1, 0, 0, -1, 0, 2.5, col, ink, { sparks: 6 }), true],
      ['fist', () => vf.slash(0, 1, 0, 0, -1, 0.5, 2, col, ink, { fist: true, sparks: 4 }), true],
      ['bolt', () => vf.bolt(0, 20, 0, 0, 0, 0, col, 0.3, 0.5, { depth: 5, branches: 10, impact: 3 }), true],
      ['spiral', () => vf.spiral(0, 0, 0, 1.2, 4, col, 0.5), true],
      ['funnel', () => vf.funnel(0, 0, 0, 30, 10, col, ink, 1), false],
      ['corona', () => vf.corona(0, 10, 0, 0, 5, col, col, 1), false],
      ['glass', () => vf.glass(0, 2, 0, 0, 6, 2, col), false],
      ['silhouette', () => vf.silhouette(0, 0, 0, 0, col), true],
      ['ring', () => vf.pressureRing(0, 1, 0, 0, true, 4, col), false],
    ];
    for (const [name, fn, particles] of cases) {
      const m = emitted(fx, fn);
      expect(has(m, INK_PRIMS), `${name}: dunkler Mantel`).toBe(true);
      expect(has(m, ADD_PRIMS), `${name}: Energiekern`).toBe(true);
      if (particles) expect(has(m, PARTICLES), `${name}: Partikel`).toBe(true);
    }
  });

  it('Fraktal-Blitz: mehrgliedrige Hauptader (32 Glieder) mit zehn und mehr Nebenblitzen', () => {
    const { fx, vf } = forgeRig(false);
    const m = emitted(fx, () => vf.bolt(0, 40, 0, 0, 0, 0, col, 0.6, 1, { depth: 5, branches: 12 }));
    expect(vf.stats.branches).toBeGreaterThanOrEqual(10);
    expect(m.get('jag')!).toBeGreaterThan(40);
    expect(m.get('jagInk')!).toBeGreaterThan(40);
  });

  it('Oberflächen-Reaktion: an Land Krater, Runen-Schockring, Gestein und Staub; auf See Gischtring, Krone und Tropfen', () => {
    const land = forgeRig(true);
    const ml = emitted(land.fx, () => land.vf.surfaceHit(0, 0, 0, 3, col, 1));
    for (const p of ['crater', 'shock', 'rock', 'smoke', 'spark'] as FxPrim[]) expect(ml.has(p), `Land ${p}`).toBe(true);
    const sea = forgeRig(false);
    const ms = emitted(sea.fx, () => sea.vf.surfaceHit(0, 0, 0, 3, col, 1));
    for (const p of ['foam', 'splash', 'drop', 'shock'] as FxPrim[]) expect(ms.has(p), `See ${p}`).toBe(true);
    expect(ms.has('crater')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Kampfbewegungen: Ketten, Techniken, Meteor, Ausweichen, Clash
// ---------------------------------------------------------------------------------------------------------------

class World implements ActionWorld {
  foes: { x: number; z: number }[] = [];
  height(): number { return 0; }
  move(b: ActionBody, dx: number, dz: number): void { b.x += dx; b.z += dz; }
  teleport(b: ActionBody, x: number, z: number): boolean { b.x = x; b.z = z; return true; }
  targets(x: number, z: number, r: number, out: ActionTarget[]): number {
    let n = 0;
    this.foes.forEach((f, i) => {
      if (n >= out.length || Math.hypot(f.x - x, f.z - z) > r + 0.5) return;
      const t = out[n++];
      t.id = `f${i}`; t.x = f.x; t.y = 0; t.z = f.z; t.radius = 0.45; t.height = 1.8; t.yaw = Math.PI; t.alive = true; t.airborne = false; t.mass = false; t.broken = false; t.boss = false; t.elite = false; t.attacking = false; t.ref = i;
    });
    return n;
  }
  hit(_t: ActionTarget, _h: ActionHit, _m: ActionMove, _c: HitContext): number { return 1; }
  drag(): void {}
  shoot(): void {}
}
function tick(eng: ActionCombatEngine, w: World, inp: ActionInput, press: Partial<ActionInput> = {}) {
  Object.assign(inp, { light: false, heavy: false, jump: false, dash: false, skill: 0, blockPressed: false, awaken: false, aura: false }, press);
  eng.step(inp, w, DT);
  return eng.events;
}

function directorRig(land = false) {
  const fx = new CataclysmFx(new Scene());
  const host: CataclysmHost = {
    fx, combatFx: null, naval: null, debris: null,
    isLand: () => land, groundY: () => 0, waterY: () => 0,
    setTrench: () => {}, setRift: () => {}, shake: () => {},
  };
  return { fx, d: new CataclysmDirector(host) };
}

describe('Ketten, Techniken, Meteor, Ausweichen und Clash in drei Schichten', () => {
  it('die Engine meldet jeden Kettenschlag (L1 – L5) und jede Luft-Kette als `slash`, Techniken weiter als `swing`', () => {
    for (const id of ['saebel', 'sturmfaust', 'feuer'] as ActionStyleId[]) {
      const w = new World();
      w.foes.push({ x: 0, z: 2 });
      const eng = new ActionCombatEngine(createFighter('slash-test', id));
      const inp = makeInput();
      let slashes = 0, swings = 0;
      for (let k = 0; k < 5; k++) {
        for (let i = 0; i < 26; i++) {
          const ev = tick(eng, w, inp, i === 0 ? { light: true } : {});
          for (let j = 0; j < ev.n; j++) { if (ev.items[j].type === 'slash') slashes++; if (ev.items[j].type === 'swing') swings++; }
        }
      }
      expect(slashes, id).toBeGreaterThanOrEqual(5);
      expect(swings, id).toBe(0);
    }
  });

  it('Kettenbögen aller 14 Stile: Tusche-Mantel, leuchtende Sichel, Richtungsfunken; die Richtung wechselt je Stufe', () => {
    const { fx, d } = directorRig();
    for (const id of ALL_STYLES) {
      const st = ACTION_STYLES[id];
      const f = createFighter('chain', id);
      st.light.forEach((mv, step) => {
        const m = emitted(fx, () => d.slashFx(mv.hits[0], f, st.color, st.element, step, st.visual === 'faust' || st.faji, false));
        expect(m.has('sickleInk'), `${id} L${step + 1}`).toBe(true);
        expect(m.has('sickle'), `${id} L${step + 1}`).toBe(true);
        expect(m.has('spark'), `${id} L${step + 1}`).toBe(true);
      });
    }
  });

  it('alle aktiven Kampfkünste (Tasten 1 – 4: 6 physische Stile, Faji-Wirken und 8 Faji-Künste): jede Technik in drei Schichten mit Oberflächen- bzw. Partikel-Reaktion', () => {
    let skills = 0;
    for (const id of ALL_STYLES) {
      const st = ACTION_STYLES[id];
      expect(st.skills.length, id).toBe(4);
      for (const k of st.skills) {
        const { fx, d } = directorRig(true);
        const f = createFighter('skill', id);
        const m = emitted(fx, () => { for (const h of k.hits) d.swingFx(h, f, k.color || st.color, k.vfx || st.element, !!k.meteor); });
        skills++;
        expect(has(m, INK_PRIMS), `${k.id}: Mantel`).toBe(true);
        expect(has(m, ADD_PRIMS), `${k.id}: Kern`).toBe(true);
        expect(has(m, [...PARTICLES, ...SURFACE]), `${k.id}: Partikel/Oberfläche`).toBe(true);
      }
    }
    expect(skills).toBe(ALL_STYLES.length * 4);
    expect(skills).toBeGreaterThanOrEqual(56);
  });

  it('Meteor-Sturz: mehrstufiger Krater mit Schockwellen, Gestein fliegt, Energie-Spirale', () => {
    const { fx, d } = directorRig(true);
    const st = ACTION_STYLES.saebel;
    const f = createFighter('meteor', 'saebel');
    const m = emitted(fx, () => d.swingFx(st.meteor.hits[0], f, st.color, st.element, true));
    expect(m.get('shock')!).toBeGreaterThanOrEqual(4);
    expect(m.has('crater')).toBe(true);
    expect(m.get('rock')!).toBeGreaterThan(5);
    expect(m.has('ribbon') && m.has('ribbonInk')).toBe(true);
  });

  it('Sturm-Schritt und Sturm-Verfolgung: Blitz-Silhouetten an Absprung- und Zielpunkt, Plasma-Ader dazwischen; Dash mit Nachbild-Band', () => {
    const { fx, d } = directorRig();
    const m = emitted(fx, () => d.stormStepFx(0, 0, 0, 3, 0, 4, 0.5, '#8AC8FF'));
    expect(d.vfx.stats.silhouettes).toBe(2);
    expect(m.get('jag')!).toBeGreaterThan(20);
    expect(m.has('jagInk')).toBe(true);
    const dash = emitted(fx, () => d.dashFx(0, 0, 0, 0, 0, 6, '#8AC8FF', true));
    expect(dash.has('ribbon') && dash.has('ribbonInk') && dash.has('spark')).toBe(true);
  });

  it('Klingen-Clash: Funkengarben in beide Richtungen, Rauchkranz, doppelter Druckring mit dunklem Saum', () => {
    const { fx, d } = directorRig();
    const m = emitted(fx, () => d.clash(0, 1.3, 1, 0));
    expect(m.get('spark')!).toBeGreaterThan(30);
    expect(m.has('smoke') && m.has('crater') && m.get('shock')! >= 2).toBe(true);
  });

  it('Treffer und Hochschleudern: Funken in Schlagrichtung, Staub bzw. Gischt; Spirale um den geschleuderten Gegner', () => {
    const land = directorRig(true);
    const ml = emitted(land.fx, () => land.d.hitImpact(0, 1.2, 0, 0, 1, '#FFE3B0', 'klinge', false, false));
    expect(ml.has('spark') && ml.has('smoke')).toBe(true);
    const sea = directorRig(false);
    const ms = emitted(sea.fx, () => sea.d.hitImpact(0, 1.2, 0, 0, 1, '#FFE3B0', 'klinge', false, false));
    expect(ms.has('drop')).toBe(true);
    const heavy = emitted(land.fx, () => land.d.hitImpact(0, 1.2, 0, 1, 0, '#FFE3B0', 'erde', true, false));
    expect(heavy.has('crater') && heavy.has('rock')).toBe(true);
    const up = emitted(land.fx, () => land.d.launchFx(0, 1, 0, '#7AE8C8'));
    expect(up.has('ribbon') && up.has('ribbonInk') && up.has('ember')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Alle 14 Ultimates: Schichten und physische Zerstörung
// ---------------------------------------------------------------------------------------------------------------

interface FakeShip {
  ship: {
    x: number; z: number; heading: number; cls: { L: number; W: number }; model: { deckY: number }; sinking: number; maxHull: number; hull: number; fire: number; frozen: number;
    shoveX: number; shoveZ: number; holes: number; masts: number; charK: number; glow: number;
    punchHoles(n: number): void; blowMasts(n?: number): void; char(k: number, glow?: number): void;
  };
}

function ultRig(land: boolean) {
  const fx = new CataclysmFx(new Scene());
  const ships: FakeShip[] = [];
  const rec = { splits: [] as string[], lifts: [] as number[], sections: [] as number[], pulls: 0, hits: 0 };
  const nav = {
    cataclysmShips(x: number, z: number, r: number, out: FakeShip[]) { out.length = 0; for (const e of ships) if (e.ship.sinking <= 0 && Math.hypot(e.ship.x - x, e.ship.z - z) - e.ship.cls.L * 0.5 <= r) out.push(e); return out.length; },
    cataclysmFriendly() { return false; },
    cataclysmSplit(e: FakeShip, cut: string, _s: number, lift = 0, sections = 2) { rec.splits.push(cut); rec.lifts.push(lift); rec.sections.push(sections); e.ship.sinking = 0.01; return 'split'; },
    cataclysmHit() { rec.hits++; return 1; },
    cataclysmPull(e: FakeShip, cx: number, cz: number, step: number) { rec.pulls++; const dx = cx - e.ship.x, dz = cz - e.ship.z, d = Math.hypot(dx, dz); if (d > 0.5) { e.ship.x += (dx / d) * Math.min(step, d - 0.5); e.ship.z += (dz / d) * Math.min(step, d - 0.5); } },
    cataclysmBlast() { return true; },
  };
  const host: CataclysmHost = {
    fx, combatFx: null, naval: nav as unknown as NavalSystem, debris: null,
    isLand: () => land, groundY: () => 0, waterY: () => 0, setTrench: () => {}, setRift: () => {}, shake: () => {}, darken: () => {},
  };
  const ship = (x: number, z: number, heading = Math.PI / 2) => {
    const e: FakeShip = { ship: {
      x, z, heading, cls: { L: 30, W: 7 }, model: { deckY: 2.5 }, sinking: 0, maxHull: 1000, hull: 1000, fire: 0, frozen: 0, shoveX: 0, shoveZ: 0, holes: 0, masts: 0, charK: 0, glow: 0,
      punchHoles(n: number) { this.holes += n; }, blowMasts(n = 2) { this.masts += n; }, char(k: number, glow = 0) { this.charK = Math.max(this.charK, k); this.glow = Math.max(this.glow, glow); },
    } };
    ships.push(e);
    return e;
  };
  return { fx, d: new CataclysmDirector(host), rec, ship, ships };
}

function castUlt(id: ActionStyleId, land: boolean, place: (r: ReturnType<typeof ultRig>) => void) {
  const r = ultRig(land);
  place(r);
  const f = createFighter('ult', id);
  const spec = ULTIMATES[id]!.ultimate!;
  const seen = new Map<FxPrim, number>();
  const tally = () => { for (const p of FX_PRIMS) seen.set(p, Math.max(seen.get(p) ?? 0, r.fx.count(p))); };
  r.d.beginCharge(spec, f, 0.75);
  for (let i = 0; i < 45; i++) { r.d.update(spec.charge / 45, DT); tally(); }
  for (let i = 0; i < Math.round(spec.strikeAt * 60); i++) { r.d.update(DT, DT); tally(); }
  r.d.strike(spec, f, 0, 0);
  for (let i = 0; i < Math.round((CATACLYSM_DUR[spec.kind] + 0.5) * 60); i++) { r.d.update(DT, DT); tally(); }
  let over = 0;
  for (const p of FX_PRIMS) if ((seen.get(p) ?? 0) > FX_CAP[p]) over++;
  for (let i = 0; i < 60 * 8; i++) r.d.update(DT, DT);
  return { ...r, seen, over, left: r.fx.alive };
}

describe('Alle 14 Ultimates: 3-Schicht-Inszenierung und physische Zerstörung', () => {
  it('jedes Ultimate zeigt dunkle Mäntel, texturierte Energiekerne und Partikelstürme; Pools bleiben in ihren Plätzen und leeren sich', () => {
    for (const id of ULTIMATE_ORDER) {
      const r = castUlt(id, false, (x) => { x.ship(0, 30); });
      const used = [...r.seen.entries()].filter(([, n]) => n > 0).map(([p]) => p);
      expect(used.some((p) => INK_PRIMS.includes(p)), `${id}: Mantel`).toBe(true);
      expect(used.some((p) => ADD_PRIMS.includes(p)), `${id}: Kern`).toBe(true);
      expect(used.some((p) => PARTICLES.includes(p)), `${id}: Partikel`).toBe(true);
      expect(r.over, id).toBe(0);
      expect(r.left, id).toBe(0);
    }
  });

  it('Säbel: dunkle Sturmwolke statt violetter Überstrahlung, gold-rote Akzente, Masten abgesprengt, Löcher, Brand, Kentern', () => {
    expect(ULTIMATES.saebel!.ultimate!.accent.toUpperCase()).not.toBe('#B04AFF');
    const r = castUlt('saebel', false, (x) => { x.ship(0, 60); x.ship(30, 80); });
    expect(r.seen.get('cloud')!).toBeGreaterThan(0);
    expect(r.ships.every((e) => e.ship.masts > 0)).toBe(true);
    expect(r.ships.some((e) => e.ship.holes > 0 && e.ship.fire > 0)).toBe(true);
    expect(r.rec.splits).toContain('capsize');
  });

  it('Doppelklinge: schwarz-smaragdgrüne Kreissäge zerlegt Schiffe der Länge nach in vier Sektionen, Masten und Segel zerfetzt', () => {
    const r = castUlt('doppel', false, (x) => { x.ship(0, 25, 0); });
    expect(r.rec.splits).toContain('length');
    expect(Math.max(...r.rec.sections)).toBe(4);
    expect(r.ships[0].ship.masts).toBeGreaterThan(0);
    expect(r.seen.get('sickleInk')!).toBeGreaterThan(4);
  });

  it('Langklinge: 3D-Glas-Schnittflächen reißen beim Einrasten auf, Schiffe zerbrechen schräg', () => {
    const r = castUlt('langklinge', false, (x) => { x.ship(0, 20, 0); });
    expect(r.seen.get('glass')!).toBeGreaterThan(8);
    expect(r.rec.splits).toContain('diagonal');
  });

  it('Sturmfaust: breitere Kegel-Flut (auch Schiffe 35° neben der Blickrichtung), Splitter, das Schiff wird zurückgehämmert und versenkt', () => {
    const r = castUlt('sturmfaust', false, (x) => { x.ship(Math.sin(0.6) * 40, Math.cos(0.6) * 40); });
    expect(r.rec.splits).toContain('sink');
    expect(Math.hypot(r.ships[0].ship.shoveX, r.ships[0].ship.shoveZ)).toBeGreaterThan(5);
    expect(r.seen.get('rock')!).toBeGreaterThan(5);
  });

  it('Erdspalter: 3D-Luft-Risse, schäumende Grabenkanten, Schiffe stürzen zur Grabenmitte; an Land Krater und Felsschollen', () => {
    const sea = castUlt('erdspalter', false, (x) => { x.ship(8, 50); });
    expect(sea.seen.get('glass')!).toBeGreaterThan(3);
    expect(sea.seen.get('splash')!).toBeGreaterThan(0);
    expect(sea.rec.pulls).toBeGreaterThan(5);
    const land = castUlt('erdspalter', true, () => {});
    expect(land.seen.get('crater')!).toBeGreaterThan(0);
    expect(land.seen.get('rock')!).toBeGreaterThan(10);
  });

  it('Schwarzes Loch: dunkle Akkretionsscheibe, Spiral-Sog, radiale Zerquetschung, Kollaps sprengt nach außen', () => {
    const r = castUlt('schwarzloch', false, (x) => { x.ship(0, 40); });
    expect(r.rec.pulls).toBeGreaterThan(10);
    expect(r.rec.splits).toContain('radial');
    expect(r.seen.get('crater')!).toBeGreaterThan(0);
    expect(r.seen.get('ribbonInk')!).toBeGreaterThan(0);
  });

  it('Feuer: Drache aus Flammenbändern mit Glut-Rauch, brennende Decks, verkohlter Rumpf, Magmarisse an Land', () => {
    const r = castUlt('feuer', false, (x) => { x.ship(5, 40); });
    expect(r.ships[0].ship.fire).toBeGreaterThanOrEqual(10);
    expect(r.ships[0].ship.charK).toBeGreaterThan(0.5);
    expect(r.seen.get('ribbon')!).toBeGreaterThan(2);
    expect(r.seen.get('ribbonInk')!).toBeGreaterThan(0);
    const land = castUlt('feuer', true, () => {});
    expect(land.seen.get('crater')!).toBeGreaterThan(0);
  });

  it('Eis: Meer gefriert, Gletschersäulen spießen Schiffe auf und heben sie an, Splittersturm aus Eiskristallen', () => {
    const r = castUlt('eis', false, (x) => { x.ship(0, 20); });
    expect(r.ships[0].ship.frozen).toBeGreaterThan(0);
    expect(r.rec.splits).toContain('cross');
    expect(Math.max(...r.rec.lifts)).toBeGreaterThan(4);
    expect(r.seen.get('ice')!).toBeGreaterThan(40);
  });

  it('Wasser: Flutwelle hebt Schiffe auf den Kamm, rollt sie kieloben, Fontänen begraben sie', () => {
    const r = castUlt('wasser', false, (x) => { x.ship(0, 30); });
    expect(r.rec.splits).toContain('capsize');
    expect(r.seen.get('splash')!).toBeGreaterThan(2);
    expect(r.seen.get('drop')!).toBeGreaterThan(15);
  });

  it('Wind: dunkel-smaragdgrüner Trichter, kreisende Tusche-Sicheln, Schiffe hochgerissen, zerfetzt und hinausgeschleudert', () => {
    const r = castUlt('wind', false, (x) => { x.ship(0, 40); });
    expect(r.seen.get('funnelInk')!).toBeGreaterThan(0);
    expect(r.seen.get('sickleInk')!).toBeGreaterThan(5);
    expect(r.rec.splits).toContain('cross');
    expect(Math.max(...r.rec.lifts)).toBeGreaterThan(4);
    expect(Math.max(...r.rec.sections)).toBeGreaterThanOrEqual(3);
  });

  it('Blitz: mehrgliedriger Fraktal-Hauptblitz mit 10+ Ästen, Masten gesprengt, Schiffe verkohlt, Plasma-Gischtringe', () => {
    const r = castUlt('blitz', false, (x) => { x.ship(0, 40); x.ship(-30, 60); });
    expect(r.d.vfx.stats.branches).toBeGreaterThanOrEqual(10);
    expect(r.seen.get('jag')!).toBeGreaterThan(60);
    expect(r.ships.every((e) => e.ship.masts > 0 && e.ship.charK > 0.4)).toBe(true);
    expect(r.seen.get('foam')!).toBeGreaterThan(0);
  });

  it('Sonne: Korona mit dunklem Hitze-Kontrastring, glühende Wracks in der Licht-Schneise', () => {
    const r = castUlt('sonne', false, (x) => { x.ship(0, 30); });
    expect(r.d.vfx.stats.coronas).toBeGreaterThan(0);
    expect(r.ships[0].ship.glow).toBeGreaterThan(0);
    expect(r.ships[0].ship.charK).toBeGreaterThan(0.5);
    expect(r.rec.splits).toContain('sink');
  });

  it('Mond: dunkler Blutmond-Halo, Tusche-Mondsicheln mit Schattenschweif, Schiffe in mehrere treibende Teile zerschnitten', () => {
    const r = castUlt('mond', false, (x) => { x.ship(0, 30); });
    expect(r.seen.get('sickleInk')!).toBeGreaterThan(30);
    expect(r.rec.splits).toContain('cross');
    expect(Math.max(...r.rec.sections)).toBe(4);
  });

  it('Zweihänder: 3-Schicht-Energiesichel mit Tusche-Schweif, Schiffe in Bug und Heck mit Explosionen, glühende Schnittfurche an Land', () => {
    const sea = castUlt('zweihaender', false, (x) => { x.ship(0, 60); });
    expect(sea.rec.splits).toContain('cross');
    expect(sea.seen.get('sickleInk')!).toBeGreaterThan(0);
    expect(sea.seen.get('rock')!).toBeGreaterThan(5);
    const land = castUlt('zweihaender', true, () => {});
    expect(land.seen.get('crater')!).toBeGreaterThan(3);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Schiffs-Sektionen am Modell
// ---------------------------------------------------------------------------------------------------------------

function toyShip(): Group {
  const root = new Group();
  const mat = new MeshBasicMaterial();
  const hull = new Mesh(new BoxGeometry(6, 3, 30, 2, 2, 24), mat); hull.position.y = 0.5;
  const deck = new Mesh(new BoxGeometry(5.6, 0.2, 28, 2, 1, 20), mat); deck.position.y = 2.1;
  const mastF = new Mesh(new CylinderGeometry(0.2, 0.25, 14, 8), mat); mastF.position.set(0, 9, 8);
  const mastA = new Mesh(new CylinderGeometry(0.2, 0.25, 14, 8), mat); mastA.position.set(0, 9, -8);
  root.add(hull, deck, mastF, mastA);
  return root;
}
const tris = (root: Group) => { let n = 0; root.traverse((o) => { const m = o as Mesh; if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3; }); return n; };

describe('Schiffe in mehrere Sektionen', () => {
  it('der Länge nach in vier Sektionen (Klingen-Zyklon): alle Dreiecke bleiben, die Teile driften auseinander und sinken versetzt', () => {
    const root = toyShip();
    const t0 = tris(root);
    const st = splitShipModel(root, 'length', 30, 6, 2.5, 3, 0, 4);
    expect(st.sections).toBe(4);
    expect(st.subs).toHaveLength(4);
    expect(tris(root)).toBe(t0);
    for (let i = 0; i < 90; i++) updateShipSplit(st, 1 / 60);
    const gaps = st.subs.map((s) => Math.hypot(s.g.position.x, s.g.position.z));
    for (const g of gaps) expect(g).toBeGreaterThan(0.5);
    expect(st.subs.some((s) => s.g.position.y < -0.05)).toBe(true);
  });

  it('quer mit Anhub (Gletschersäule): beide Hälften steigen zuerst und brechen dann auseinander', () => {
    const root = toyShip();
    const st = splitShipModel(root, 'cross', 30, 6, 2.5, 1, 5, 2);
    for (let i = 0; i < 45; i++) updateShipSplit(st, 1 / 60);
    expect(st.a.position.y).toBeGreaterThan(2);
    expect(st.b.position.y).toBeGreaterThan(2);
  });

  it('radial: nach dem Zerquetschen sprengt der Kollaps die Hälften nach außen', () => {
    const root = toyShip();
    const st = splitShipModel(root, 'radial', 30, 6, 2.5, 1);
    for (let i = 0; i < 60; i++) updateShipSplit(st, 1 / 60);
    const near = st.a.position.z - st.b.position.z;
    for (let i = 0; i < 60; i++) updateShipSplit(st, 1 / 60);
    expect(st.a.position.z - st.b.position.z).toBeGreaterThan(near + 2);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// HUD: Ultimate-Banner über dem Auftragsfenster
// ---------------------------------------------------------------------------------------------------------------

describe('HUD: schräges Ultimate-Banner', () => {
  const css = (name: string) => readFileSync(new URL(`../src/ui/css/${name}.css`, import.meta.url), 'utf8');
  it('eigene Schicht über dem HUD (Auftragsfenster), unter den Menüs; lässt Zeiger durch', () => {
    const tokens = css('tokens');
    const z = (name: string) => Number(tokens.match(new RegExp(`--${name}:\\s*(\\d+)`))![1]);
    expect(z('z-cutin')).toBeGreaterThan(z('z-hud'));
    expect(z('z-cutin')).toBeLessThan(z('z-screen'));
    const hud = css('hud');
    expect(hud).toMatch(/\.cbt-cutin-layer \{[^}]*z-index: var\(--z-cutin\)[^}]*pointer-events: none !important/);
  });
  it('die Schrift skaliert mit der Titellänge (clamp), lange Titel brechen nicht um', () => {
    const hud = css('hud');
    const rule = hud.match(/\.cbt-cutin b \{([^}]*)\}/)![1];
    expect(rule).toMatch(/clamp\([^;]*var\(--len/);
    expect(rule).toMatch(/white-space: nowrap/);
    const src = readFileSync(new URL('../src/ui/combatOverlay.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/setProperty\('--len'/);
    // Faustregel: 88vw / (Zeichen × 0,66) – die längsten Titel passen auf 1280 px und auf ein Handy mit 390 px
    for (const t of ['7. Form: Blutmond-Finsternis', '7. Form: Zenit-Sonnentanz', '7. Form: Donnergott-Urteil', 'Souverän-Orkan: Sieben-Meere-Zäsur']) {
      for (const vw of [390, 1280]) {
        const fontPx = Math.min(51.2, Math.max(12.8, (0.88 * vw) / (t.length * 0.66)));
        expect(t.length * fontPx * 0.66, `${t} @${vw}`).toBeLessThanOrEqual(vw * 0.9);
      }
    }
  });
});
