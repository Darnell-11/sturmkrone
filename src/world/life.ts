import { plankTexture, sailTexture } from '../render/textures';
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
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

const GULLS = 28;

interface Floater { g: Group; x: number; z: number; kind: 'raft' | 'bottle'; t: number }
interface Dolphin { m: Group; t: number; x: number; z: number; dir: number }
interface Boat { g: Group; cx: number; cz: number; r: number; a: number; speed: number }
export interface DigSpot { island: string; x: number; z: number; marker: Mesh }

/** Möwen, Delfine, Wal, Fischerboote, Schiffbrüchige, Flaschenpost und Grabstellen. */
export class SeaLife {
  private gulls: InstancedMesh;
  private gullData: { cx: number; cz: number; r: number; h: number; a: number; s: number }[] = [];
  private dolphins: Dolphin[] = [];
  private boats: Boat[] = [];
  private floaters: Floater[] = [];
  digs: DigSpot[] = [];
  private whale: Group;
  private whaleT = 20;
  private dolphinT = 6;
  private dummy = new Object3D();
  private t = 0;

  constructor(private scene: Scene, islands: IslandDef[], private spray: ParticleSystem) {
    // Möwe: zwei Flügel als Dreiecke
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([0, 0, 0.3, -1, 0.1, -0.1, 0, 0, -0.3, 0, 0, 0.3, 0, 0, -0.3, 1, 0.1, -0.1], 3));
    g.computeVertexNormals();
    this.gulls = new InstancedMesh(g, new MeshBasicMaterial({ color: '#F4F4F0', side: DoubleSide }), GULLS);
    this.gulls.frustumCulled = false;
    scene.add(this.gulls);
    const homes = islands.filter((i) => i.kind !== 'camp');
    for (let i = 0; i < GULLS; i++) {
      const h = homes[i % homes.length];
      this.gullData.push({ cx: h.x, cz: h.z, r: h.r * (0.6 + Math.random()), h: 12 + Math.random() * 14, a: Math.random() * Math.PI * 2, s: (0.25 + Math.random() * 0.3) * (Math.random() < 0.5 ? -1 : 1) });
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

  private makeDolphin(): Group {
    const g = new Group();
    const body = new Mesh(new SphereGeometry(0.5, 12, 8), toon('#7A8C9A'));
    body.scale.set(0.8, 0.8, 2.6);
    const fin = new Mesh(new ConeGeometry(0.25, 0.6, 4), toon('#7A8C9A'));
    fin.position.set(0, 0.5, 0);
    const tail = new Mesh(new BoxGeometry(1, 0.1, 0.4), toon('#7A8C9A'));
    tail.position.z = -1.3;
    g.add(body, fin, tail);
    addOutlines(g);
    return g;
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
      const bottle = new Mesh(new CylinderGeometry(0.18, 0.22, 0.8, 8), new MeshBasicMaterial({ color: new Color(0.6, 1.4, 0.8), transparent: true, opacity: 0.85 }));
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
    // Möwen kreisen, eine Gruppe folgt dem Schiff
    this.gullData.forEach((d, i) => {
      d.a += d.s * dt;
      const follow = i < 6 && sailing;
      const cx = follow ? ship.x : d.cx, cz = follow ? ship.z : d.cz;
      const r = follow ? 14 + i * 2 : d.r;
      const x = cx + Math.cos(d.a) * r, z = cz + Math.sin(d.a) * r;
      const flap = Math.sin(this.t * (8 + i % 3) + i) * 0.5;
      this.dummy.position.set(x, d.h + Math.sin(this.t + i) * 1.5, z);
      this.dummy.rotation.set(0, -d.a + (d.s > 0 ? 0 : Math.PI), flap * 0.6);
      this.dummy.scale.set(0.9, 1 + flap, 0.9);
      this.dummy.updateMatrix();
      this.gulls.setMatrixAt(i, this.dummy.matrix);
    });
    this.gulls.instanceMatrix.needsUpdate = true;

    // Delfine springen neben dem Schiff
    this.dolphinT -= dt;
    if (sailing && ship.speed > 4 && this.dolphinT <= 0 && this.dolphins.length < 3) {
      this.dolphinT = 9 + Math.random() * 12;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
        const m = this.makeDolphin();
        this.scene.add(m);
        const side = Math.random() < 0.5 ? -1 : 1;
        this.dolphins.push({ m, t: -i * 0.4, x: ship.x + Math.cos(ship.heading) * side * (10 + i * 3), z: ship.z - Math.sin(ship.heading) * side * (10 + i * 3), dir: ship.heading });
      }
    }
    for (const d of this.dolphins) {
      d.t += dt;
      d.x += Math.sin(d.dir) * 11 * dt;
      d.z += Math.cos(d.dir) * 11 * dt;
      const ph = (d.t % 1.6) / 1.6;
      const wy = heightAt(d.x, d.z);
      const y = wy - 1 + Math.sin(ph * Math.PI) * 3;
      d.m.position.set(d.x, y, d.z);
      d.m.rotation.set(-Math.cos(ph * Math.PI) * 0.9, d.dir, 0, 'YXZ');
      if (ph < 0.03 || (ph > 0.97 && ph < 1)) this.spray.emit(6, d.x, wy, d.z, { speed: 1.5, up: 3, life: 0.8, color: new Color(0.95, 0.98, 1) });
      if (d.t > 9) d.m.removeFromParent();
    }
    this.dolphins = this.dolphins.filter((d) => d.t <= 9);

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
