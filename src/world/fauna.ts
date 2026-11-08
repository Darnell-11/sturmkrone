import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { IslandDef, IslandStyle } from '../data/regions';
import { toon } from '../render/toon';
import type { ParticleSystem } from './particles';
import { hashId, seeded } from './waves';

// Wiederverwendete Farben (kein neues Objekt pro Bild)
const FOAM_COL = new Color(0.95, 0.98, 1);
const FIREFLY_COL = new Color(1.3, 2.2, 0.5);
const TMP_COL = new Color();

interface Spot { x: number; y: number; z: number }
interface FIsland { x: number; z: number; r: number; style: IslandStyle; trees: Spot[]; bushes: Spot[]; edge: (a: number) => number }
interface Crab { isl: FIsland; a: number; d: number; dir: number; moveT: number; waitT: number; bob: number }
interface Turtle { isl: FIsland; a: number; t: number; speed: number }
interface Bird { isl: FIsland; tree: Spot; ang: number; rad: number; h: number; speed: number; col: Color; glow: boolean }
interface Fish { x: number; z: number; dir: number; t: number }

const MAX_CRABS = 120, MAX_TURTLES = 24, MAX_BIRDS = 140, MAX_FISH = 8;
const NEAR = 170;

const BIRD_COLORS: Partial<Record<IslandStyle, string[]>> = {
  tropisch: ['#C8382E', '#2E6EC8', '#E8B83A', '#3E9E4A'],
  nebel: ['#1C1C22', '#2A2A30'],
  nord: ['#3A3A44', '#6A5A4A', '#C8C8C8'],
  sturm: ['#2A2E36'],
  schlund: ['#7FE8FF', '#B890FF'],
};

/**
 * Leben auf und an den Inseln: Krabben huschen über den Strand, Schildkröten kriechen ans Ufer,
 * Vögel kreisen um die Bäume (Papageien, Krähen, im Schlundriff leuchtende Falter),
 * Fische springen vor der Küste und nachts tanzen Glühwürmchen über den Büschen.
 * Berechnet wird nur in der Nähe der Spielfigur.
 */
export class IslandFauna {
  private islands: FIsland[] = [];
  private crabs: Crab[] = [];
  private turtles: Turtle[] = [];
  private birds: Bird[] = [];
  private fish: Fish[] = [];
  private crabMesh: InstancedMesh;
  private turtleMesh: InstancedMesh;
  private birdMesh: InstancedMesh;
  private fishMesh: InstancedMesh;
  private dummy = new Object3D();
  private t = 0;
  private fishT = 3;
  spray: ParticleSystem | null = null;
  sparks: ParticleSystem | null = null;

  constructor(scene: Scene) {
    // Krabbe: flacher Panzer und zwei Scheren
    const body = new SphereGeometry(0.22, 8, 5); body.scale(1.3, 0.45, 1);
    const clawL = new BoxGeometry(0.12, 0.08, 0.16); clawL.translate(-0.22, 0.02, 0.2);
    const clawR = new BoxGeometry(0.12, 0.08, 0.16); clawR.translate(0.22, 0.02, 0.2);
    for (const g of [body, clawL, clawR]) { g.deleteAttribute('uv'); }
    this.crabMesh = new InstancedMesh(mergeGeometries([body.toNonIndexed(), clawL.toNonIndexed(), clawR.toNonIndexed()])!, toon('#C8502E'), MAX_CRABS);
    // Schildkröte: Panzerkuppel und Kopf
    const shell = new SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); shell.scale(1, 0.6, 1.25);
    const head = new SphereGeometry(0.16, 6, 4); head.translate(0, 0.08, 0.8);
    const fl = new BoxGeometry(1.4, 0.06, 0.3); fl.translate(0, 0.04, 0.3);
    for (const g of [shell, head, fl]) g.deleteAttribute('uv');
    this.turtleMesh = new InstancedMesh(mergeGeometries([shell.toNonIndexed(), head.toNonIndexed(), fl.toNonIndexed()])!, toon('#5E7A4A'), MAX_TURTLES);
    // Vogel: zwei Flügeldreiecke (wie die Möwen), einfarbig je Tier
    const bg = new BufferGeometry();
    bg.setAttribute('position', new Float32BufferAttribute([0, 0, 0.25, -0.7, 0.08, -0.08, 0, 0, -0.25, 0, 0, 0.25, 0, 0, -0.25, 0.7, 0.08, -0.08], 3));
    this.birdMesh = new InstancedMesh(bg, new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide }), MAX_BIRDS);
    // springender Fisch
    const fg = new SphereGeometry(0.25, 6, 4); fg.scale(0.5, 0.6, 1.6);
    this.fishMesh = new InstancedMesh(fg, toon({ color: '#9FB4C4', spec: 1 }), MAX_FISH);
    for (const m of [this.crabMesh, this.turtleMesh, this.birdMesh, this.fishMesh]) {
      m.count = 0;
      m.frustumCulled = false;
      m.userData.noOutline = true;
      scene.add(m);
    }
    this.crabMesh.castShadow = this.turtleMesh.castShadow = true;
  }

  addIsland(def: IslandDef, x: number, z: number, r: number, trees: Spot[], bushes: Spot[], style: IslandStyle, edge: (a: number) => number = () => r) {
    const rnd = seeded(hashId(def.id) ^ 0x51ed27);
    const isl: FIsland = { x, z, r, style, trees, bushes, edge };
    this.islands.push(isl);
    const crabs = style === 'glut' || style === 'schlund' ? 0 : style === 'nord' || style === 'sturm' ? 2 : 3 + Math.floor(rnd() * 4);
    for (let i = 0; i < crabs && this.crabs.length < MAX_CRABS; i++) this.crabs.push({ isl, a: rnd() * Math.PI * 2, d: 0.9 + rnd() * 0.08, dir: rnd() < 0.5 ? 1 : -1, moveT: 0, waitT: rnd() * 3, bob: rnd() * 6 });
    const turtles = style === 'tropisch' && (def.kind === 'quiet' || def.kind === 'treasure') ? 2 + Math.floor(rnd() * 2) : 0;
    for (let i = 0; i < turtles && this.turtles.length < MAX_TURTLES; i++) this.turtles.push({ isl, a: rnd() * Math.PI * 2, t: rnd() * 40, speed: 0.15 + rnd() * 0.1 });
    const cols = BIRD_COLORS[style];
    if (cols && trees.length) {
      const n = Math.min(trees.length + 1, style === 'tropisch' ? 6 : 4);
      for (let i = 0; i < n && this.birds.length < MAX_BIRDS; i++) {
        const tree = trees[Math.floor(rnd() * trees.length)];
        const glow = style === 'schlund';
        const col = new Color(cols[Math.floor(rnd() * cols.length)]);
        if (glow) col.multiplyScalar(2.5);
        this.birds.push({ isl, tree, ang: rnd() * Math.PI * 2, rad: 2 + rnd() * 4, h: (glow ? 2 : 6) + rnd() * 4, speed: (0.8 + rnd() * 0.8) * (rnd() < 0.5 ? 1 : -1), col, glow });
      }
    }
  }

  update(dt: number, px: number, pz: number, night: number, ground: (x: number, z: number) => number, water: (x: number, z: number) => number) {
    this.t += dt;
    const near = (i: FIsland) => Math.hypot(i.x - px, i.z - pz) < NEAR + i.r;
    const d = this.dummy;

    // Krabben: kurze Seitwärts-Sprints, Pause, flüchten vor der Spielfigur
    let n = 0;
    for (const c of this.crabs) {
      if (!near(c.isl)) continue;
      const cd = c.isl.edge(c.a) * c.d;
      const wx = c.isl.x + Math.cos(c.a) * cd, wz = c.isl.z + Math.sin(c.a) * cd;
      const scared = Math.hypot(wx - px, wz - pz) < 3.5;
      if (c.moveT > 0) {
        c.moveT -= dt;
        c.a += (c.dir * (scared ? 3.2 : 1.6) / cd) * dt;
        c.bob += dt * 30;
      } else if ((c.waitT -= dt) <= 0 || scared) {
        c.moveT = 0.4 + Math.random() * 0.9;
        c.waitT = 1 + Math.random() * 4;
        if (Math.random() < 0.4 || scared) c.dir = scared ? (Math.sin(Math.atan2(wz - pz, wx - px) - c.a) > 0 ? 1 : -1) : -c.dir;
      }
      const y = ground(wx, wz);
      d.position.set(wx, (Number.isFinite(y) ? y : 1.3) + 0.06 + Math.abs(Math.sin(c.bob)) * 0.03, wz);
      d.rotation.set(0, Math.atan2(Math.cos(c.a), Math.sin(c.a)), 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.crabMesh.setMatrixAt(n++, d.matrix);
      if (n >= MAX_CRABS) break;
    }
    this.crabMesh.count = n;
    this.crabMesh.instanceMatrix.needsUpdate = true;

    // Schildkröten: kriechen langsam zwischen Strand und Wasser hin und her
    n = 0;
    for (const tt of this.turtles) {
      if (!near(tt.isl)) continue;
      tt.t += dt * tt.speed;
      const k = (Math.sin(tt.t) + 1) / 2; // 0 = an Land, 1 = im Wasser
      const dd = tt.isl.edge(tt.a) * (0.9 + k * 0.17);
      const wx = tt.isl.x + Math.cos(tt.a) * dd, wz = tt.isl.z + Math.sin(tt.a) * dd;
      const g = ground(wx, wz), w = water(wx, wz);
      const y = Math.max(Number.isFinite(g) ? g : -9, w - 0.25);
      d.position.set(wx, y, wz);
      d.rotation.set(0, Math.atan2(Math.cos(tt.a), Math.sin(tt.a)) + (Math.cos(tt.t) > 0 ? 0 : Math.PI), Math.sin(this.t * 2 + tt.a) * 0.05);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.turtleMesh.setMatrixAt(n++, d.matrix);
    }
    this.turtleMesh.count = n;
    this.turtleMesh.instanceMatrix.needsUpdate = true;

    // Vögel kreisen um Baumkronen; Falter tanzen dicht über dem Boden
    n = 0;
    for (const b of this.birds) {
      if (!near(b.isl)) continue;
      b.ang += (b.speed / b.rad) * dt * (b.glow ? 0.6 : 1);
      const bx = b.tree.x + Math.cos(b.ang) * b.rad, bz = b.tree.z + Math.sin(b.ang) * b.rad;
      const flap = Math.sin(this.t * (b.glow ? 14 : 9) + b.ang * 5);
      d.position.set(bx, b.tree.y + b.h + Math.sin(this.t * 0.7 + b.ang) * (b.glow ? 0.6 : 1.2), bz);
      d.rotation.set(0, -b.ang + (b.speed > 0 ? 0 : Math.PI), flap * 0.5);
      d.scale.set(b.glow ? 0.35 : 0.55, 1 + flap * 0.6, b.glow ? 0.35 : 0.55);
      d.updateMatrix();
      this.birdMesh.setMatrixAt(n, d.matrix);
      // Falter leuchten nachts heller
      this.birdMesh.setColorAt(n, b.glow ? TMP_COL.copy(b.col).multiplyScalar(0.6 + night * 0.8) : b.col);
      n++;
    }
    this.birdMesh.count = n;
    this.birdMesh.instanceMatrix.needsUpdate = true;
    if (this.birdMesh.instanceColor) this.birdMesh.instanceColor.needsUpdate = true;

    // Fische springen vor nahen Küsten
    this.fishT -= dt;
    if (this.fishT <= 0) {
      this.fishT = 2.5 + Math.random() * 5;
      const close = this.islands.filter((i) => Math.hypot(i.x - px, i.z - pz) < 220 + i.r);
      if (close.length && this.fish.length < MAX_FISH) {
        const i = close[Math.floor(Math.random() * close.length)];
        const a = Math.random() * Math.PI * 2, dd = i.edge(a) * (1.3 + Math.random() * 0.5);
        this.fish.push({ x: i.x + Math.cos(a) * dd, z: i.z + Math.sin(a) * dd, dir: Math.random() * Math.PI * 2, t: 0 });
      }
    }
    n = 0;
    for (const f of this.fish) {
      f.t += dt;
      const k = f.t / 0.9;
      const w = water(f.x, f.z);
      if (f.t < dt * 1.5 || (k >= 1 && k - dt / 0.9 < 1)) this.spray?.emit(5, f.x, w + 0.1, f.z, { speed: 1, up: 2.2, life: 0.6, color: FOAM_COL, spread: 0.2 });
      const fx = f.x + Math.sin(f.dir) * k * 1.8, fz = f.z + Math.cos(f.dir) * k * 1.8;
      d.position.set(fx, w - 0.3 + Math.sin(Math.min(1, k) * Math.PI) * 1.4, fz);
      d.rotation.set(-Math.cos(Math.min(1, k) * Math.PI) * 0.9, f.dir, 0, 'YXZ');
      d.scale.setScalar(k < 1 ? 1 : 0.001);
      d.updateMatrix();
      this.fishMesh.setMatrixAt(n++, d.matrix);
    }
    this.fish = this.fish.filter((f) => f.t < 1.1);
    this.fishMesh.count = n;
    this.fishMesh.instanceMatrix.needsUpdate = true;

    // Glühwürmchen über den Büschen (nachts)
    if (night > 0.45 && this.sparks) {
      for (const i of this.islands) {
        if (!i.bushes.length || Math.hypot(i.x - px, i.z - pz) > 120 + i.r) continue;
        if (Math.random() < dt * Math.min(6, i.bushes.length) * night) {
          const b = i.bushes[Math.floor(Math.random() * i.bushes.length)];
          this.sparks.emit(1, b.x + (Math.random() - 0.5) * 2, b.y + 0.6 + Math.random(), b.z + (Math.random() - 0.5) * 2, { speed: 0.25, up: 0.25, life: 3, color: FIREFLY_COL, gravity: -0.05, spread: 0.6 });
        }
      }
    }
  }
}
