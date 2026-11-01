import { Color, ConeGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3, type Scene } from 'three';
import { addOutlines } from '../render/outline';
import { toon } from '../render/toon';
import type { Ship } from '../entities/ship/ship';

/** Lage des Tiefenschlunds im Schlundriff */
export const ABYSS_LAIR = { x: -1607, z: 522 };

export interface SeaBossHooks {
  shake(a: number): void;
  splash(x: number, z: number, big: boolean): void;
  hitPlayer(dmg: number): void;
  roar(): void;
}

interface Lob { mesh: Mesh; vel: Vector3; life: number }

/** Der Tiefenschlund: eine riesige Seeschlange, die auftaucht, abtaucht und Wasserkugeln schleudert. */
export class SeaBoss {
  readonly group = new Group();
  private segs: Mesh[] = [];
  private head = new Group();
  private lobs: Lob[] = [];
  private lobGeo = new SphereGeometry(1.1, 10, 8);
  private lobMat = new MeshBasicMaterial({ color: new Color(0.6, 2.2, 3.5) });
  maxHp: number;
  hp: number;
  /** 0 = abgetaucht, 1 = aufgetaucht */
  private sub = 0;
  private ang = 0;
  private cx: number;
  private cz: number;
  private attackT = 3;
  private diveT = 14;
  private diving = 0;
  private t = 0;
  private flash = 0;
  dead = false;

  constructor(private scene: Scene, level: number) {
    this.cx = ABYSS_LAIR.x;
    this.cz = ABYSS_LAIR.z;
    this.maxHp = this.hp = 600 * level;
    const skin = toon('#24425E');
    const belly = toon('#6FA8B8');
    const spike = new MeshBasicMaterial({ color: new Color(2.2, 0.8, 3.6) });
    for (let i = 0; i < 12; i++) {
      const r = 3.4 - i * 0.18;
      const m = new Mesh(new SphereGeometry(r, 14, 10), i % 2 ? skin : skin);
      const b = new Mesh(new SphereGeometry(r * 0.85, 10, 8), belly);
      b.position.y = -r * 0.35;
      b.scale.set(0.9, 0.6, 1.05);
      m.add(b);
      const sp = new Mesh(new ConeGeometry(r * 0.35, r * 1.1, 5), spike);
      sp.position.y = r * 0.95;
      sp.userData.noOutline = true;
      m.add(sp);
      this.segs.push(m);
      this.group.add(m);
    }
    // Kopf
    const skull = new Mesh(new SphereGeometry(4, 16, 12), skin);
    skull.scale.set(1, 0.8, 1.4);
    const jaw = new Mesh(new ConeGeometry(2.6, 6, 8), belly);
    jaw.rotation.x = Math.PI / 2;
    jaw.position.set(0, -1.4, 4.4);
    const eyeMat = new MeshBasicMaterial({ color: new Color(4, 3.2, 0.6) });
    for (const s of [-1, 1]) {
      const eye = new Mesh(new SphereGeometry(0.7, 10, 8), eyeMat);
      eye.position.set(s * 2.2, 1.2, 3.4);
      eye.userData.noOutline = true;
      const horn = new Mesh(new ConeGeometry(0.8, 4.5, 6), spike);
      horn.position.set(s * 2, 3.4, -0.8);
      horn.rotation.set(-0.6, 0, s * 0.4);
      horn.userData.noOutline = true;
      this.head.add(eye, horn);
    }
    this.head.add(skull, jaw);
    this.group.add(this.head);
    addOutlines(this.group);
    this.group.traverse((o) => { o.castShadow = true; });
    scene.add(this.group);
    this.group.visible = false;
  }

  get alive() { return !this.dead && this.hp > 0; }
  get frac() { return this.hp / this.maxHp; }
  get headPos() { return this.head.position; }

  /** Trifft eine Kanonenkugel den Körper? */
  hitTest(p: Vector3): boolean {
    if (this.sub < 0.4 || !this.alive) return false;
    if (this.head.position.distanceTo(p) < 5.5) return true;
    return this.segs.some((s) => s.position.distanceTo(p) < 3.8);
  }

  damage(n: number) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - n);
    this.flash = 0.1;
    if (this.hp <= 0) this.dead = true;
  }

  update(dt: number, heightAt: (x: number, z: number) => number, ship: Ship | null, h: SeaBossHooks) {
    this.t += dt;
    this.flash -= dt;
    const near = !!ship && Math.hypot(ship.x - this.cx, ship.z - this.cz) < 260;
    // Auftauchen, wenn das Schiff nah ist; zwischendurch abtauchen
    const wantUp = near && this.alive && this.diving <= 0 ? 1 : 0;
    const before = this.sub;
    this.sub += (wantUp - this.sub) * Math.min(1, dt * (this.dead ? 0.4 : 0.9));
    if (before < 0.3 && this.sub >= 0.3) { h.roar(); h.splash(this.head.position.x, this.head.position.z, true); h.shake(0.6); }
    this.group.visible = this.sub > 0.02;
    if (this.alive && near) {
      this.diveT -= dt;
      if (this.diveT <= 0 && this.diving <= 0) { this.diving = 4; this.diveT = 16 + Math.random() * 6; }
      if (this.diving > 0) {
        this.diving -= dt;
        // Unter Wasser zum Schiff schwimmen und dort wieder auftauchen
        if (ship) { this.cx += (ship.x - this.cx) * dt * 0.25; this.cz += (ship.z - this.cz) * dt * 0.25; }
        if (this.diving <= 0 && ship && Math.hypot(ship.x - this.head.position.x, ship.z - this.head.position.z) < 18) h.hitPlayer(40);
      }
    }
    // Körper als Bogen auf einer Kreisbahn
    this.ang += dt * (this.alive ? 0.35 : 0.05);
    const R = 34;
    for (let i = 0; i < this.segs.length; i++) {
      const a = this.ang - i * 0.16;
      const x = this.cx + Math.cos(a) * R, z = this.cz + Math.sin(a) * R;
      const arch = Math.sin((i / (this.segs.length - 1)) * Math.PI) * 7 + Math.sin(this.t * 2 + i * 0.6) * 0.8;
      const y = heightAt(x, z) + (this.sub * (arch + 1) - (1 - this.sub) * 10);
      this.segs[i].position.set(x, y, z);
    }
    // Das Schiff wird vom Körper weggedrückt statt hindurchzufahren
    if (ship && this.sub > 0.4) for (const sg of this.segs) {
      const dx = ship.x - sg.position.x, dz = ship.z - sg.position.z, d = Math.hypot(dx, dz), min = 4 + ship.cls.W * 0.6;
      if (d > 0.01 && d < min) { ship.x = sg.position.x + (dx / d) * min; ship.z = sg.position.z + (dz / d) * min; ship.speed *= 0.9; }
    }
    const ha = this.ang + 0.22;
    const hx = this.cx + Math.cos(ha) * R, hz = this.cz + Math.sin(ha) * R;
    this.head.position.set(hx, heightAt(hx, hz) + this.sub * 6.5 - (1 - this.sub) * 12 + Math.sin(this.t * 1.7) * 0.6, hz);
    // Blick zum Schiff (oder entlang der Bahn)
    const look = ship && near ? Math.atan2(ship.x - hx, ship.z - hz) : Math.atan2(-Math.sin(ha), Math.cos(ha));
    this.head.rotation.set(-0.15, look, 0);
    // Angriff: drei Wasserkugeln im Bogen
    if (this.alive && near && this.sub > 0.8 && ship) {
      this.attackT -= dt;
      if (this.attackT <= 0) {
        this.attackT = (this.frac < 0.4 ? 2.4 : 3.6) + Math.random();
        for (let k = 0; k < (this.frac < 0.4 ? 5 : 3); k++) {
          const lead = 1.6 + k * 0.25;
          const tx = ship.x + Math.sin(ship.heading) * ship.speed * lead + (k - 1) * 6;
          const tz = ship.z + Math.cos(ship.heading) * ship.speed * lead + (Math.random() - 0.5) * 6;
          const from = this.head.position.clone().add(new Vector3(0, 2, 0));
          const T = 1.8 + k * 0.15;
          const vel = new Vector3((tx - from.x) / T, (0 - from.y + 0.5 * 9.8 * T * T) / T, (tz - from.z) / T);
          const m = new Mesh(this.lobGeo, this.lobMat);
          m.position.copy(from);
          this.scene.add(m);
          this.lobs.push({ mesh: m, vel, life: T + 0.5 });
        }
      }
    }
    for (const l of this.lobs) {
      l.life -= dt;
      l.vel.y -= 9.8 * dt;
      l.mesh.position.addScaledVector(l.vel, dt);
      const p = l.mesh.position;
      if (p.y < heightAt(p.x, p.z)) {
        l.life = 0;
        h.splash(p.x, p.z, false);
        if (ship && Math.hypot(ship.x - p.x, ship.z - p.z) < ship.cls.W + 4) h.hitPlayer(22);
      }
      if (l.life <= 0) l.mesh.removeFromParent();
    }
    this.lobs = this.lobs.filter((l) => l.life > 0);
    // Treffer-Aufblitzen
    const s = this.flash > 0 ? 1.06 : 1;
    this.head.scale.setScalar(s);
  }

  dispose() {
    this.group.removeFromParent();
    for (const l of this.lobs) l.mesh.removeFromParent();
  }
}
