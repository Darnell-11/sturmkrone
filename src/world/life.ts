import { plankTexture, sailTexture } from '../render/textures';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  type Scene,
} from 'three';
import type { IslandDef } from '../data/regions';
import { addOutlines } from '../render/outline';
import { toon } from '../render/toon';
import type { ParticleSystem } from './particles';
import { markShared } from '../render/dispose';
import { toonPbr } from '../render/pbrMaps';
import { keepIf } from '../core/arrays';
import { DolphinModel } from './dolphin';
import { createGulls } from './gull';

const GULLS = 28;

interface Floater { g: Group; x: number; z: number; kind: 'raft' | 'bottle'; t: number }
/** Delfin neben dem Schiff: Lage relativ zum Schiff (seitlich und längs), Sprung-Takt und Schwimmphase */
interface Dolphin { m: DolphinModel; t: number; side: number; lat: number; along: number; off: number; period: number; jump: number; air: boolean; life: number; idx: number }
const DOLPHIN_SPRAY = new Color(0.95, 0.98, 1);
interface Boat { g: Group; cx: number; cz: number; r: number; a: number; speed: number }
export interface DigSpot { island: string; x: number; z: number; marker: Mesh }

/** Möwen, Delfine, Wal, Fischerboote, Schiffbrüchige, Flaschenpost und Grabstellen. */
export class SeaLife {
  private gulls: InstancedMesh;
  private gullFlap: import('three').InstancedBufferAttribute;
  private gullData: { cx: number; cz: number; r: number; h: number; a: number; s: number; ph: number; fl: number }[] = [];
  private dolphins: Dolphin[] = [];
  private dolphinPool: DolphinModel[] = [];
  private boats: Boat[] = [];
  private floaters: Floater[] = [];
  digs: DigSpot[] = [];
  private whale: Group;
  private whaleT = 20;
  private dolphinT = 6;
  private dummy = new Object3D();
  private t = 0;

  constructor(private scene: Scene, islands: IslandDef[], private spray: ParticleSystem) {
    // Möwen: kleines Modell mit schlagenden Flügeln (Flügelschlag auf der Grafikkarte)
    const swarm = createGulls(GULLS);
    this.gulls = swarm.mesh;
    this.gullFlap = swarm.flap;
    scene.add(this.gulls);
    const homes = islands.filter((i) => i.kind !== 'camp');
    for (let i = 0; i < GULLS; i++) {
      const h = homes[i % homes.length];
      this.gullData.push({ cx: h.x, cz: h.z, r: h.r * (0.6 + Math.random()), h: 12 + Math.random() * 14, a: Math.random() * Math.PI * 2, s: (0.25 + Math.random() * 0.3) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6.28, fl: 0.5 });
    }

    // Wal
    this.whale = new Group();
    const body = new Mesh(new SphereGeometry(1, 16, 10), toon('#3A4A5A'));
    body.scale.set(3, 1.6, 9);
    const tail = new Mesh(new BoxGeometry(5, 0.3, 1.6), toon('#3A4A5A'));
    tail.position.z = -9;
    this.whale.add(body, tail);
    addOutlines(this.whale);
    this.whale.visible = false;
    scene.add(this.whale);

    // Fischerboote vor der Stadt
    const town = islands.find((i) => i.kind === 'town');
    if (town) for (let i = 0; i < 3; i++) this.boats.push(this.makeBoat(town.x + (i - 1) * 60, town.z - town.r - 70 - i * 20, 25 + i * 10));
  }

  private makeBoat(cx: number, cz: number, r: number): Boat {
    const g = new Group();
    const hull = new Mesh(new BoxGeometry(1.8, 0.8, 5), toon({ color: '#9A6A3B', map: plankTexture(), ...toonPbr(plankTexture(), { strength: 1.2, rough: 0.82, roughVar: 0.2, ao: 0.7 }) }));
    hull.position.y = 0.3;
    const mast = new Mesh(new CylinderGeometry(0.06, 0.08, 4, 6), toon('#5A3A22'));
    mast.position.y = 2.4;
    const sail = new Mesh(new PlaneGeometry(2.2, 2.6), toon({ color: 0xffffff, side: DoubleSide, map: sailTexture(['#E8DCC0', '#C9A27A', '#D9C8A8'][Math.floor(Math.random() * 3)], null, Math.floor(Math.random() * 999)), unique: true }));
    sail.position.set(0.05, 2.6, -0.4);
    sail.rotation.y = Math.PI / 2;
    sail.userData.noOutline = true;
    g.add(hull, mast, sail);
    addOutlines(g);
    this.scene.add(g);
    return { g, cx, cz, r, a: Math.random() * Math.PI * 2, speed: 0.08 + Math.random() * 0.05 };
  }

  private addDolphin(): DolphinModel {
    const m = new DolphinModel();
    this.scene.add(m.group);
    return m;
  }

  /** Schiffbrüchiger auf einem Floß oder eine Flaschenpost */
  spawnFloater(kind: 'raft' | 'bottle', x: number, z: number) {
    const g = new Group();
    if (kind === 'raft') {
      for (let i = 0; i < 5; i++) { const log = new Mesh(new CylinderGeometry(0.25, 0.25, 3, 6), toon('#8A5A2B')); log.rotation.z = Math.PI / 2; log.position.z = (i - 2) * 0.5; g.add(log); }
      const person = new Mesh(new CylinderGeometry(0.3, 0.35, 1.3, 8), toon('#E8BE96'));
      person.position.y = 0.9;
      const head = new Mesh(new SphereGeometry(0.3, 10, 8), toon('#E8BE96'));
      head.position.y = 1.8;
      const flag = new Mesh(new PlaneGeometry(0.9, 0.6), toon({ color: '#FFFFFF', side: DoubleSide }));
      flag.position.set(0.8, 2.4, 0);
      flag.userData.noOutline = true;
      g.add(person, head, flag);
    } else {
      const bottle = new Mesh(new CylinderGeometry(0.18, 0.22, 0.8, 8), new MeshBasicMaterial({ color: new Color(0.6, 1.4, 0.8), transparent: true, opacity: 0.85, depthWrite: false }));
      bottle.rotation.z = 1.2;
      const cork = new Mesh(new CylinderGeometry(0.1, 0.1, 0.2, 6), toon('#C8A27A'));
      cork.position.set(0.45, 0.17, 0);
      g.add(bottle, cork);
    }
    addOutlines(g);
    this.scene.add(g);
    this.floaters.push({ g, x, z, kind, t: Math.random() * 10 });
  }

  /** Grabstelle (rotes X) auf einer Insel */
  addDig(island: IslandDef, groundAt: (x: number, z: number) => number) {
    if (this.digs.some((d) => d.island === island.id)) return;
    const a = (island.x * 13 + island.z * 7) % (Math.PI * 2);
    const x = island.x + Math.cos(a) * island.r * 0.55, z = island.z + Math.sin(a) * island.r * 0.55;
    const marker = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ color: new Color(2.2, 0.3, 0.2), transparent: true, depthWrite: false, map: xTexture() }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, groundAt(x, z) + 0.08, z);
    this.scene.add(marker);
    this.digs.push({ island: island.id, x, z, marker });
  }

  removeDig(d: DigSpot) {
    d.marker.removeFromParent();
    this.digs = this.digs.filter((x) => x !== d);
  }

  /** Floß/Flasche in Reichweite des Schiffs: einsammeln */
  collect(x: number, z: number, range: number): Floater['kind'][] {
    const got: Floater['kind'][] = [];
    this.floaters = this.floaters.filter((f) => {
      if (Math.hypot(f.x - x, f.z - z) < range) { got.push(f.kind); f.g.removeFromParent(); return false; }
      return true;
    });
    return got;
  }

  count(kind: Floater['kind']) { return this.floaters.filter((f) => f.kind === kind).length; }

  nearest(kind: Floater['kind'], x: number, z: number) {
    let best: { x: number; z: number } | null = null, bd = Infinity;
    for (const f of this.floaters) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (f.kind === kind && d < bd) { bd = d; best = { x: f.x, z: f.z }; }
    }
    return best;
  }

  update(dt: number, heightAt: (x: number, z: number) => number, ship: { x: number; z: number; heading: number; speed: number }, sailing: boolean) {
    this.t += dt;
    // Möwen: Kreisen mit Höhenwellen, Schräglage in der Kurve und Neigung beim Steigen; im Wechsel Gleitflug und Flügelschlag.
    // Eine Gruppe begleitet das Schiff in lockerer Formation vor und neben dem Bug.
    const fa = this.gullFlap.array as Float32Array;
    this.gullData.forEach((d, i) => {
      d.a += d.s * dt;
      const follow = i < 6 && sailing;
      let x: number, z: number, y: number, yaw: number, roll: number, vy: number, spd: number;
      if (follow) {
        const sh = Math.sin(ship.heading), ch = Math.cos(ship.heading);
        const ahead = 6 + (i % 3) * 7 + Math.sin(this.t * 0.4 + i) * 9;
        const side = (i % 2 ? 1 : -1) * (6 + Math.floor(i / 2) * 4) + Math.sin(this.t * 0.3 + i * 2) * 5;
        x = ship.x + sh * ahead + ch * side;
        z = ship.z + ch * ahead - sh * side;
        y = 7 + i * 1.4 + Math.sin(this.t * 0.6 + i) * 2.2;
        vy = 1.32 * Math.cos(this.t * 0.6 + i);
        spd = Math.max(8, ship.speed);
        yaw = ship.heading + Math.sin(this.t * 0.5 + i) * 0.25;
        roll = -Math.cos(this.t * 0.5 + i) * 0.22;
      } else {
        const r = d.r * (1 + 0.15 * Math.sin(this.t * 0.2 + i));
        const sg = d.s > 0 ? 1 : -1;
        x = d.cx + Math.cos(d.a) * r; z = d.cz + Math.sin(d.a) * r;
        y = d.h + Math.sin(this.t * 0.7 + i) * 2.2;
        vy = 1.54 * Math.cos(this.t * 0.7 + i);
        spd = Math.max(5, r * Math.abs(d.s));
        const vx = -Math.sin(d.a) * sg, vz = Math.cos(d.a) * sg;
        yaw = Math.atan2(vx, vz);
        // Mitte des Kreises liegt seitlich: zur Kurveninnenseite neigen (lokale +x-Seite liegt links vom Flugweg)
        const cxv = -Math.cos(d.a), czv = -Math.sin(d.a);
        const turn = vz * cxv - vx * czv;
        roll = -0.4 * Math.sign(turn);
      }
      // Wechsel zwischen Gleiten und Schlagen; beim Steigen schlagen sie kräftiger
      const cyc = Math.sin(this.t * 0.35 + d.ph + i * 1.7);
      const want = Math.min(1, Math.max(0.12, 0.12 + 0.88 * Math.min(1, Math.max(0, (cyc + 0.2) / 0.6)) + Math.max(0, vy) * 0.25));
      d.fl += (want - d.fl) * Math.min(1, dt * 2.5);
      d.ph += dt * (7 + (i % 4) * 0.9) * (0.35 + 0.65 * d.fl);
      fa[i * 2] = d.ph;
      fa[i * 2 + 1] = d.fl;
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(-Math.atan2(vy, spd), yaw, roll, 'YXZ');
      this.dummy.scale.setScalar(0.95);
      this.dummy.updateMatrix();
      this.gulls.setMatrixAt(i, this.dummy.matrix);
    });
    this.gulls.instanceMatrix.needsUpdate = true;
    this.gullFlap.needsUpdate = true;

    // Delfine begleiten das Schiff, tauchen in Bögen auf und springen (Bahn aus Wurfparabel, Neigung folgt der Flugbahn)
    this.dolphinT -= dt;
    if (sailing && ship.speed > 4 && this.dolphinT <= 0 && this.dolphins.length === 0) {
      this.dolphinT = 14 + Math.random() * 16;
      const n = 2 + Math.floor(Math.random() * 2);
      const side = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const m = this.dolphinPool[i] ?? (this.dolphinPool[i] = this.addDolphin());
        const period = 2.1 + Math.random() * 0.5;
        this.dolphins.push({ m, t: 0, side, lat: 9 + i * 3.2 + Math.random() * 2, along: 4 - i * 5 + Math.random() * 3, off: Math.random() * period, period, jump: 0.5, air: false, life: 0, idx: i });
        m.group.visible = true;
      }
    }
    for (const d of this.dolphins) {
      d.t += dt;
      d.life += dt;
      // Höhe der Körpermitte über dem Wasser: Sprung als Parabel, dazwischen Auftauchen mit der Rückenflosse
      const hAt = (tt: number) => {
        const ph = ((tt + d.off) % d.period) / d.period;
        if (ph < d.jump) { const u = ph / d.jump; return -0.7 + (2.9 + 0.35 * d.idx) * 4 * u * (1 - u); }
        const v = (ph - d.jump) / (1 - d.jump);
        return -0.7 + 0.5 * Math.sin(Math.PI * v);
      };
      const f = ship;
      const sh = Math.sin(f.heading), ch = Math.cos(f.heading);
      const lat = d.side * (d.lat + Math.sin(d.life * 0.6 + d.idx * 2) * 1.4);
      const al = d.along + Math.sin(d.life * 0.45 + d.idx) * 2.5;
      const x = f.x + sh * al + ch * lat;
      const z = f.z + ch * al - sh * lat;
      const wy = heightAt(x, z);
      const y = hAt(d.t);
      const sp = Math.max(6, f.speed);
      const slope = (hAt(d.t + 0.06) - y) / 0.06;
      // sinkt am Ende wieder ab und verschwindet unter Wasser
      const sink = d.life > 11 ? (d.life - 11) * 1.6 : 0;
      d.m.group.position.set(x, wy + y - sink, z);
      d.m.group.rotation.set(-Math.atan2(slope, sp), f.heading + Math.sin(d.life * 0.8 + d.idx) * 0.06, Math.sin(d.life * 1.1 + d.idx) * 0.08, 'YXZ');
      const above = y > 0.2;
      d.m.swim(d.life, above ? 1 : 0.55);
      if (above !== d.air) {
        d.air = above;
        // Gischt beim Auftauchen und Eintauchen
        this.spray.emit(above ? 6 : 10, x, wy + 0.1, z, { speed: 0.9, up: above ? 2.5 : 3.8, life: 0.7, color: DOLPHIN_SPRAY, gravity: 11, spread: 0.7, size: 0.4 });
      }
    }
    for (const d of this.dolphins) if (d.life > 12.5) d.m.group.visible = false;
    keepIf(this.dolphins, (d) => d.life <= 12.5);

    // Wal taucht in der Ferne auf und bläst eine Fontäne
    this.whaleT -= dt;
    if (this.whaleT <= 0 && sailing) {
      this.whaleT = 40 + Math.random() * 40;
      const a = Math.random() * Math.PI * 2;
      this.whale.userData = { x: ship.x + Math.cos(a) * 90, z: ship.z + Math.sin(a) * 90, t: 0, dir: Math.random() * Math.PI * 2 };
      this.whale.visible = true;
    }
    if (this.whale.visible) {
      const w = this.whale.userData;
      w.t += dt;
      w.x += Math.sin(w.dir) * 3 * dt; w.z += Math.cos(w.dir) * 3 * dt;
      const k = Math.sin(Math.min(1, w.t / 10) * Math.PI);
      this.whale.position.set(w.x, heightAt(w.x, w.z) - 2.4 + k * 1.6, w.z);
      this.whale.rotation.y = w.dir;
      if (w.t > 3 && w.t < 6 && Math.random() < dt * 25) this.spray.emit(4, w.x, this.whale.position.y + 2, w.z, { speed: 0.6, up: 9, life: 1.2, color: new Color(0.95, 0.98, 1), spread: 0.2 });
      if (w.t > 10) this.whale.visible = false;
    }

    // Fischerboote
    for (const b of this.boats) {
      b.a += b.speed * dt;
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r;
      b.g.position.set(x, heightAt(x, z) - 0.1, z);
      b.g.rotation.set(Math.sin(this.t * 1.3 + b.cx) * 0.06, -b.a, Math.sin(this.t + b.cz) * 0.08, 'YXZ');
    }
    // Treibgut schaukelt
    for (const f of this.floaters) {
      f.t += dt;
      f.g.position.set(f.x, heightAt(f.x, f.z) + 0.05, f.z);
      f.g.rotation.set(Math.sin(f.t * 1.4) * 0.12, f.t * 0.2, Math.cos(f.t * 1.1) * 0.12);
    }
    for (const d of this.digs) d.marker.rotation.z += dt * 0.6;
  }
}

let X_TEX: CanvasTexture | null = null;
function xTexture() {
  if (X_TEX) return X_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#fff';
  g.lineWidth = 12;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(12, 12); g.lineTo(52, 52); g.moveTo(52, 12); g.lineTo(12, 52); g.stroke();
  X_TEX = markShared(new CanvasTexture(c));
  return X_TEX;
}
