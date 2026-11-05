import { BoxGeometry, Color, CylinderGeometry, Euler, InstancedMesh, Matrix4, Quaternion, Vector3, type Scene } from 'three';
import { toon } from '../render/toon';

/**
 * Holzsplitter, Planken und Fässer: fliegen bei Treffern davon, klatschen ins Wasser
 * und treiben danach eine Weile auf den Wellen, bevor sie versinken.
 */

interface Piece {
  kind: 0 | 1; // 0 = Planke/Splitter, 1 = Fass
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
  wx: number; wy: number; wz: number;
  sx: number; sy: number; sz: number;
  life: number;
  floating: boolean;
  bob: number;
  col: number;
}

const MAX_PLANKS = 260;
const MAX_BARRELS = 40;

export class DebrisSystem {
  private planks: InstancedMesh;
  private barrels: InstancedMesh;
  private pieces: Piece[] = [];
  private m = new Matrix4();
  private q = new Quaternion();
  private e = new Euler();
  private p = new Vector3();
  private s = new Vector3();
  private c = new Color();
  scale = 1;
  /** Kleiner Spritzer, wenn ein Stück ins Wasser fällt */
  onSplash: (x: number, z: number, big: boolean) => void = () => {};

  constructor(scene: Scene) {
    this.planks = new InstancedMesh(new BoxGeometry(1, 1, 1), toon('#FFFFFF'), MAX_PLANKS);
    this.barrels = new InstancedMesh(new CylinderGeometry(0.42, 0.42, 1.1, 10), toon('#FFFFFF'), MAX_BARRELS);
    for (const im of [this.planks, this.barrels]) {
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = true;
      im.userData.noOutline = true;
      scene.add(im);
    }
  }

  /** Splitter bei einem Treffer: kleine Stücke in Richtung (dx, dz) */
  splinters(x: number, y: number, z: number, dx: number, dz: number, n: number, color: string) {
    const count = Math.round(n * Math.min(1.3, this.scale));
    for (let i = 0; i < count; i++) {
      const sp = 4 + Math.random() * 8;
      this.add(0, x, y, z,
        dx * sp + (Math.random() - 0.5) * 6, 3 + Math.random() * 7, dz * sp + (Math.random() - 0.5) * 6,
        0.08 + Math.random() * 0.12, 0.05 + Math.random() * 0.06, 0.4 + Math.random() * 0.7, 9 + Math.random() * 6, color);
    }
  }

  /** Wrackteile eines sinkenden Schiffs: Planken, Balken und Fässer */
  wreck(x: number, z: number, len: number, width: number, heading: number, color: string) {
    const n = Math.round((10 + len * 0.7) * Math.min(1.3, this.scale));
    const fx = Math.sin(heading), fz = Math.cos(heading);
    for (let i = 0; i < n; i++) {
      const along = (Math.random() - 0.5) * len * 0.9, side = (Math.random() - 0.5) * width;
      const px = x + fx * along + fz * side, pz = z + fz * along - fx * side;
      const big = Math.random() < 0.25;
      this.add(0, px, 1 + Math.random() * 2, pz,
        (Math.random() - 0.5) * 7, 2 + Math.random() * 6, (Math.random() - 0.5) * 7,
        big ? 0.35 : 0.18 + Math.random() * 0.1, big ? 0.3 : 0.07, big ? 2.5 + Math.random() * 2.5 : 0.9 + Math.random() * 1.4, 26 + Math.random() * 14, color);
    }
    const nb = 2 + Math.floor(len / 14);
    for (let i = 0; i < nb; i++) {
      this.add(1, x + (Math.random() - 0.5) * width, 1.5, z + (Math.random() - 0.5) * len * 0.6,
        (Math.random() - 0.5) * 5, 3 + Math.random() * 4, (Math.random() - 0.5) * 5, 1, 1, 1, 32 + Math.random() * 12, '#8A5A2B');
    }
  }

  private add(kind: 0 | 1, x: number, y: number, z: number, vx: number, vy: number, vz: number, sx: number, sy: number, sz: number, life: number, color: string) {
    const list = kind === 0 ? this.pieces.filter((p) => p.kind === 0) : this.pieces.filter((p) => p.kind === 1);
    const cap = kind === 0 ? MAX_PLANKS : MAX_BARRELS;
    if (list.length >= cap) {
      // ältestes Stück gleicher Art ersetzen
      const old = list.reduce((a, b) => (a.life < b.life ? a : b));
      this.pieces.splice(this.pieces.indexOf(old), 1);
    }
    // leichte Farbabweichung je Stück
    const col = this.c.set(color).multiplyScalar(0.75 + Math.random() * 0.35).getHex();
    this.pieces.push({
      kind, x, y, z, vx, vy, vz,
      rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
      wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 10, wz: (Math.random() - 0.5) * 14,
      sx, sy, sz, life, floating: false, bob: Math.random() * 10, col,
    });
  }

  update(dt: number, heightAt: (x: number, z: number) => number, wind: { x: number; z: number }) {
    let ip = 0, ib = 0;
    const keep: Piece[] = [];
    for (const p of this.pieces) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const wy = heightAt(p.x, p.z);
      if (!p.floating) {
        p.vy -= 9.8 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
        if (p.y < wy && p.vy < 0) {
          p.floating = true;
          if (p.vy < -5) this.onSplash(p.x, p.z, p.kind === 1 || p.sz > 2);
          p.vx *= 0.25; p.vz *= 0.25;
          // flach auf dem Wasser liegen
          p.rx = p.kind === 0 ? 0 : Math.PI / 2; p.rz = 0;
          if (p.sx < 0.15) p.life = Math.min(p.life, 4 + Math.random() * 3);
        }
      } else {
        p.bob += dt;
        p.vx = p.vx * Math.exp(-0.4 * dt) + wind.x * 0.04 * dt;
        p.vz = p.vz * Math.exp(-0.4 * dt) + wind.z * 0.04 * dt;
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.ry += p.wy * 0.05 * dt;
        const sinkK = p.life < 2.5 ? (2.5 - p.life) * 0.5 : 0;
        p.y = wy + (p.kind === 1 ? 0.05 : 0.02) - sinkK;
        // auf den Wellen kippeln
        const tilt = Math.sin(p.bob * 1.7) * 0.12;
        this.e.set((p.kind === 1 ? Math.PI / 2 : 0) + tilt, p.ry, Math.cos(p.bob * 1.3) * 0.1);
      }
      if (!p.floating) this.e.set(p.rx, p.ry, p.rz);
      this.q.setFromEuler(this.e);
      this.p.set(p.x, p.y, p.z);
      this.s.set(p.sx, p.sy, p.sz);
      this.m.compose(this.p, this.q, this.s);
      this.c.setHex(p.col);
      if (p.kind === 0) { if (ip < MAX_PLANKS) { this.planks.setMatrixAt(ip, this.m); this.planks.setColorAt(ip, this.c); ip++; } }
      else if (ib < MAX_BARRELS) { this.barrels.setMatrixAt(ib, this.m); this.barrels.setColorAt(ib, this.c); ib++; }
      keep.push(p);
    }
    this.pieces = keep;
    this.planks.count = ip;
    this.barrels.count = ib;
    this.planks.instanceMatrix.needsUpdate = true;
    this.barrels.instanceMatrix.needsUpdate = true;
    if (this.planks.instanceColor) this.planks.instanceColor.needsUpdate = true;
    if (this.barrels.instanceColor) this.barrels.instanceColor.needsUpdate = true;
  }

  clear() { this.pieces = []; this.planks.count = 0; this.barrels.count = 0; }
}
