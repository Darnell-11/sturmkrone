import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Input } from '../core/input/input';
import type { StyleId } from '../data/animations';
import type { CharacterLook, NpcRole } from '../data/characterParts';
import type { QualityConfig } from '../data/qualityTiers';
import { EDGE_WALL } from '../data/world';
import type { CharacterAssets } from '../entities/character/assets';
import { Character } from '../entities/character/character';
import { weaponsFor } from '../entities/character/weapons';
import { Npc } from '../entities/npc';
import { PlayerFoot } from '../entities/player/playerFoot';
import { buildTestBoat } from '../entities/testBoat';
import { addOutlines } from '../render/outline';
import { toon } from '../render/toon';
import { Environment, type EnvState } from './environment';
import { IslandGround, type WalkIsland } from './islandGround';
import type { IslandShape } from './ocean';
import { ParticleSystem } from './particles';
import { seeded } from './waves';

const MAX_SPEED = 16;
const GRAVITY = 9.8;
const WAKE_INTERVAL = 0.22;
/** Steuerposition am Heck des Testboots (lokal) */
const HELM = new Vector3(0, 1.3, -3.0);

interface Ball { mesh: Mesh; vel: Vector3; alive: boolean }
interface Flash { mesh: Mesh; life: number }
interface WakePoint { x: number; z: number; age: number; strength: number }

export type SeaMode = 'sail' | 'foot';
export interface SeaState { boat: { x: number; z: number; heading: number } | null; env: EnvState }

/**
 * Testwelt: Schiff, Inseln, Spielfigur zu Fuß, Bewohner und die komplette Umgebung.
 * Echte Regionen, Städte und Schiffe folgen in den Meilensteinen 5 und 6.
 */
export class SeaWorld {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(55, 1, 0.3, 2600);
  readonly env: Environment;
  /** Punkt, auf den Kamera, Schatten und Tiefenunschärfe zielen */
  readonly focus = new Vector3();
  /** Inseln (Mittelpunkt und Radius) – für Karte und Flachwasser */
  readonly islands: IslandShape[];
  readonly ground = new IslandGround();
  mode: SeaMode = 'sail';
  /** Text der Kontextaktion (z. B. „An Land gehen“) oder null */
  contextLabel: string | null = null;

  onMessage: (text: string) => void = () => {};
  onModeChange: (mode: SeaMode) => void = () => {};

  private boat: Group;
  private lantern: Mesh;
  private buoys: { g: Group; x: number; z: number; lamp: Mesh }[] = [];
  private lamps: Mesh[] = [];
  private balls: Ball[] = [];
  private flashes: Flash[] = [];
  private spray: ParticleSystem;
  private sparks: ParticleSystem;
  private wake: WakePoint[] = [];
  private wakeTimer = 0;

  private player: Character | null = null;
  private foot: PlayerFoot | null = null;
  private npcs: Npc[] = [];
  private anchor = { x: 0, z: 0 };
  private outlineNpcs = true;

  private x = 0;
  private z = 0;
  private heading = 0;
  private prev = { x: 0, z: 0, heading: 0 };
  private speed = 0;
  private boost = 0;
  private boostCd = 0;
  private cdBow = 0;
  private cdLeft = 0;
  private cdRight = 0;
  private shake = 0;
  private edgeWarned = false;

  private camYaw = 0;
  private camPitch = 0.3;
  private camDist = 22;
  private camIdle = 0;
  private footYaw = 0;
  private footPitch = 0.32;
  private footDist = 7;
  private menuOrbit = 0;
  private tmp = new Vector3();

  constructor() {
    this.env = new Environment(this.scene);
    const b = buildTestBoat();
    this.boat = b.group;
    this.lantern = b.lantern;
    this.scene.add(this.boat);

    this.islands = this.buildIslands();
    this.env.setIslands(this.islands);
    this.buildBuoys();

    const ballGeo = new SphereGeometry(0.28, 10, 8);
    const ballMat = toon({ color: 0x2a2a2e, spec: 1 });
    for (let i = 0; i < 40; i++) {
      const m = new Mesh(ballGeo, ballMat);
      m.visible = false;
      m.castShadow = true;
      this.scene.add(m);
      this.balls.push({ mesh: m, vel: new Vector3(), alive: false });
    }
    const flashGeo = new SphereGeometry(1, 12, 8);
    for (let i = 0; i < 12; i++) {
      const m = new Mesh(flashGeo, new MeshBasicMaterial({ color: new Color(6, 3.2, 1), transparent: true }));
      m.visible = false;
      this.scene.add(m);
      this.flashes.push({ mesh: m, life: 0 });
    }
    this.spray = new ParticleSystem(this.scene, false, 0.8);
    this.sparks = new ParticleSystem(this.scene, true, 0.5);
  }

  // ---------- Aufbau ----------

  private buildIslands(): IslandShape[] {
    const rnd = seeded(2024);
    const shapes: IslandShape[] = [];
    // Startinsel direkt vor dem Schiff, dann zufällige Inseln drumherum
    const specs: { x: number; z: number; r: number; hill: number; palms: number; tower: boolean }[] = [
      { x: 0, z: 70, r: 40, hill: 0.22, palms: 6, tower: false },
    ];
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + rnd() * 0.4;
      const dist = 200 + rnd() * 1450;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      if (Math.hypot(x, z - 70) < 160) continue;
      specs.push({ x, z, r: 14 + rnd() * 30, hill: 0.35 + rnd() * 0.35, palms: 2 + Math.floor(rnd() * 4), tower: specs.length === 1 });
    }

    const sand = toon(0xf1d9a0);
    const grass = toon({ color: 0x6dbb4c, flatShading: true });
    const trunk = toon(0x8a5a2b);
    const leaf = toon({ color: 0x3f9a3a, flatShading: true });
    const stone = toon(0xe8e2d4);
    const red = toon(0xa8322a);
    const rock = toon({ color: 0x8a8378, flatShading: true });

    for (const s of specs) {
      const { r } = s;
      const isl = new Group();
      isl.position.set(s.x, 0, s.z);
      const walk: WalkIsland = { x: s.x, z: s.z, r, beachY: 1.3, hillR: r * 0.75, hillScale: s.hill, hillY: 1.2, blockers: [] };
      shapes.push({ x: s.x, z: s.z, r: r * 1.15 });
      const beach = new Mesh(new CylinderGeometry(r, r * 1.25, 3, 36), sand);
      beach.position.y = -0.2;
      const hill = new Mesh(new SphereGeometry(r * 0.75, 18, 10), grass);
      hill.scale.y = s.hill;
      hill.position.y = 1.2;
      isl.add(beach, hill);
      if (rnd() < 0.5 && !s.tower) {
        const rk = new Mesh(new ConeGeometry(r * 0.22, r * 0.7, 6), rock);
        rk.position.set(r * 0.45, 1.2 + r * 0.25, -r * 0.3);
        isl.add(rk);
        walk.blockers.push({ x: s.x + r * 0.45, z: s.z - r * 0.3, r: r * 0.22 });
      }
      for (let k = 0; k < s.palms; k++) {
        const pa = rnd() * Math.PI * 2;
        const pr = r * (0.3 + rnd() * 0.55);
        const palm = new Group();
        const px = Math.cos(pa) * pr, pz = Math.sin(pa) * pr;
        const d = Math.hypot(px, pz);
        const baseY = Math.max(1.3, d < r * 0.75 ? 1.2 + Math.sqrt((r * 0.75) ** 2 - d * d) * s.hill : 1.3);
        palm.position.set(px, baseY - 0.1, pz);
        palm.rotation.z = (rnd() - 0.5) * 0.4;
        const t = new Mesh(new CylinderGeometry(0.25, 0.4, 7, 6), trunk);
        t.position.y = 3.5;
        palm.add(t);
        for (let l = 0; l < 6; l++) {
          const f = new Mesh(new ConeGeometry(0.9, 4.2, 4), leaf);
          f.position.y = 7;
          f.rotation.set(Math.PI / 2.4, (l / 6) * Math.PI * 2, 0, 'YXZ');
          f.scale.z = 0.25;
          palm.add(f);
        }
        isl.add(palm);
        walk.blockers.push({ x: s.x + px, z: s.z + pz, r: 0.45 });
      }
      if (s.tower) {
        const tower = new Mesh(new CylinderGeometry(1.6, 2.4, 16, 12), stone);
        tower.position.set(0, 9, 0);
        const band = new Mesh(new CylinderGeometry(1.95, 2.05, 2, 12), red);
        band.position.set(0, 10, 0);
        const lamp = new Mesh(new SphereGeometry(1.4, 16, 10), new MeshBasicMaterial({ color: new Color(6, 5, 2.5) }));
        lamp.position.set(0, 18, 0);
        lamp.userData.noOutline = true;
        this.lamps.push(lamp);
        isl.add(tower, band, lamp);
        walk.blockers.push({ x: s.x, z: s.z, r: 2.5 });
      }
      isl.traverse((o) => {
        if ((o as Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      addOutlines(isl);
      this.scene.add(isl);
      this.ground.add(walk);
    }
    return shapes;
  }

  private buildBuoys() {
    const rnd = seeded(77);
    const body = toon(0xf3e6c8);
    const bandMat = toon(0xa8322a);
    for (let i = 0; i < 14; i++) {
      const g = new Group();
      let x = (rnd() - 0.5) * 500;
      let z = (rnd() - 0.5) * 500;
      if (this.ground.islandAt(x, z, 20)) { x += 120; z -= 80; }
      const m = new Mesh(new ConeGeometry(0.9, 2.2, 10), body);
      m.position.y = 0.6;
      const band = new Mesh(new CylinderGeometry(0.62, 0.72, 0.4, 10), bandMat);
      band.position.y = 0.7;
      m.castShadow = true;
      const col = i % 2 ? new Color(4, 0.5, 0.4) : new Color(0.5, 4, 0.8);
      const lamp = new Mesh(new SphereGeometry(0.3, 10, 8), new MeshBasicMaterial({ color: col }));
      lamp.position.y = 1.9;
      lamp.userData.noOutline = true;
      g.add(m, band, lamp);
      addOutlines(g);
      this.scene.add(g);
      this.buoys.push({ g, x, z, lamp });
    }
  }

  /** Spielfigur und Bewohner erzeugen, sobald die Figuren-Daten geladen sind */
  setCharacters(assets: CharacterAssets, look: CharacterLook, style: StyleId) {
    this.player?.dispose();
    this.player = new Character(assets, look, true);
    this.scene.add(this.player.holder);
    this.foot = new PlayerFoot(this.player, style);
    this.equip(style);
    this.attachToHelm();

    if (!this.npcs.length) {
      const rng = seeded(4242);
      const home = this.ground.islands[0];
      const roles: NpcRole[] = ['fischer', 'haendler', 'pirat', 'koch', 'schmied', 'wirt', 'buerger', 'pirat', 'buerger'];
      for (const role of roles) {
        const n = new Npc(assets, home, this.ground, role, rng, this.outlineNpcs);
        this.scene.add(n.char.holder);
        this.npcs.push(n);
      }
    }
  }

  /** Aussehen und Kampfstil der Spielfigur ändern */
  updatePlayer(look: CharacterLook, style: StyleId) {
    if (!this.player || !this.foot) return;
    this.player.setLook(look);
    this.foot.style = style;
    this.equip(style);
    if (this.mode === 'sail') this.player.play('steer', { fade: 0.01 });
  }

  private equip(style: StyleId) {
    if (!this.player) return;
    const w = weaponsFor(style);
    this.player.hold('r', w.right);
    this.player.hold('l', w.left);
  }

  private attachToHelm() {
    if (!this.player) return;
    this.boat.add(this.player.holder);
    this.player.holder.position.copy(HELM);
    this.player.holder.rotation.set(0, 0, 0);
    this.player.play('steer', { fade: 0.2 });
  }

  applyQuality(c: QualityConfig) {
    this.env.applyQuality(c);
    this.spray.scale = c.particles;
    this.sparks.scale = c.particles;
  }

  // ---------- Spielstand ----------

  getState(): SeaState {
    return { boat: { x: this.x, z: this.z, heading: this.heading }, env: this.env.getState() };
  }

  setState(s: Partial<SeaState>) {
    if (s.boat) {
      this.x = s.boat.x; this.z = s.boat.z; this.heading = s.boat.heading;
    } else {
      this.x = 0; this.z = -60; this.heading = 0;
    }
    if (s.env) this.env.setState(s.env);
    this.prev = { x: this.x, z: this.z, heading: this.heading };
    this.speed = 0;
    this.camYaw = 0;
    this.wake = [];
    this.balls.forEach((b) => { b.alive = false; b.mesh.visible = false; });
    if (this.mode === 'foot') this.setMode('sail');
  }

  /** Testwerkzeug: Schiff an eine Position setzen */
  teleport(x: number, z: number, heading: number) {
    this.setState({ boat: { x, z, heading } });
  }

  private setMode(m: SeaMode) {
    this.mode = m;
    if (m === 'sail') this.attachToHelm();
    this.onModeChange(m);
  }

  // ---------- Logik ----------

  update(dt: number, input: Input) {
    this.prev = { x: this.x, z: this.z, heading: this.heading };
    this.env.update(dt, this.focus);

    if (this.mode === 'sail') this.updateSail(dt, input);
    else this.updateFoot(dt, input);

    this.updateContext(input);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.updateWake(dt);
    this.updateBalls(dt);
    this.spray.update(dt);
    this.sparks.update(dt);
    this.updateNpcs(dt);
    this.player?.update(dt);
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = Math.max(0, f.life / 0.18);
      f.mesh.scale.setScalar(0.4 + (1 - k) * 1.6);
      (f.mesh.material as MeshBasicMaterial).opacity = k;
      if (f.life <= 0) f.mesh.visible = false;
    }
  }

  private updateSail(dt: number, input: Input) {
    const mv = input.move();
    const storm = this.env.weather.p.waves;
    const target = mv.y >= 0 ? mv.y * MAX_SPEED : mv.y * 5;
    const boostMul = this.boost > 0 ? 1.8 : 1;
    this.speed += (target * boostMul - this.speed) * Math.min(1, dt * (mv.y < 0 ? 1.2 : 0.7));
    const turn = 0.35 + 0.65 * Math.min(1, Math.abs(this.speed) / 8);
    this.heading -= mv.x * 1.2 * turn * dt;
    let nx = this.x + Math.sin(this.heading) * this.speed * dt;
    let nz = this.z + Math.cos(this.heading) * this.speed * dt;
    if (storm > 1.5) {
      nx += Math.sin(this.env.clock * 0.3) * (storm - 1.5) * 0.6 * dt;
      nz += Math.cos(this.env.clock * 0.23) * (storm - 1.5) * 0.6 * dt;
    }
    // Nicht auf Inseln auffahren
    const isl = this.ground.islandAt(nx, nz, 7);
    if (isl) {
      const a = Math.atan2(nz - isl.z, nx - isl.x);
      nx = isl.x + Math.cos(a) * (isl.r + 7);
      nz = isl.z + Math.sin(a) * (isl.r + 7);
      if (Math.abs(this.speed) > 6) { this.shake = Math.max(this.shake, 0.5); this.onMessage('Auf Grund gelaufen!'); }
      this.speed *= 0.5;
    }
    this.x = nx;
    this.z = nz;

    const d = Math.hypot(this.x, this.z);
    if (d > EDGE_WALL) {
      this.x *= EDGE_WALL / d;
      this.z *= EDGE_WALL / d;
      this.speed *= 0.85;
      this.shake = Math.max(this.shake, 0.3);
      if (!this.edgeWarned) { this.edgeWarned = true; this.onMessage('Der Weltrand! Weiter trägt dich keine Strömung.'); }
    } else if (d < EDGE_WALL - 150) this.edgeWarned = false;

    this.boost = Math.max(0, this.boost - dt);
    this.boostCd = Math.max(0, this.boostCd - dt);
    this.cdBow = Math.max(0, this.cdBow - dt);
    this.cdLeft = Math.max(0, this.cdLeft - dt);
    this.cdRight = Math.max(0, this.cdRight - dt);

    if (input.pressed('dodge') && this.boostCd <= 0) {
      this.boost = 2;
      this.boostCd = 4;
      this.shake = Math.max(this.shake, 0.5);
      this.onMessage('Volle Fahrt!');
    }
    if (input.pressed('attack') && this.cdBow <= 0) { this.cdBow = 0.5; this.fireBow(); }
    if (input.pressed('fireLeft') && this.cdLeft <= 0) { this.cdLeft = 1.5; this.fireBroadside(1); }
    if (input.pressed('fireRight') && this.cdRight <= 0) { this.cdRight = 1.5; this.fireBroadside(-1); }

    const ld = input.lookDelta();
    const la = input.lookAxis();
    const lx = ld.x * 0.006 + la.x * 2.2 * dt;
    const ly = ld.y * 0.004 + la.y * 1.4 * dt;
    if (lx || ly) this.camIdle = 0; else this.camIdle += dt;
    this.camYaw -= lx;
    this.camPitch = MathUtils.clamp(this.camPitch + ly, 0.06, 1.1);
    if (this.camIdle > 2.5) this.camYaw *= 1 - Math.min(1, dt * 1.2);
    this.camDist = MathUtils.clamp(this.camDist + input.zoomDelta() * 2, 12, 45);
    this.focus.set(this.x, 0, this.z);
  }

  private updateFoot(dt: number, input: Input) {
    const f = this.foot;
    if (!f || !this.player) return;
    const ld = input.lookDelta();
    const la = input.lookAxis();
    this.footYaw -= ld.x * 0.006 + la.x * 2.4 * dt;
    this.footPitch = MathUtils.clamp(this.footPitch + ld.y * 0.004 + la.y * 1.5 * dt, 0.05, 1.2);
    this.footDist = MathUtils.clamp(this.footDist + input.zoomDelta() * 0.8, 3.5, 14);
    f.update(dt, input, this.footYaw, this.ground);
    // Kamera folgt beim Rennen sanft hinter die Figur
    if (f.speed > 4 && !(ld.x || la.x)) {
      const diff = MathUtils.euclideanModulo(f.yaw - this.footYaw + Math.PI, Math.PI * 2) - Math.PI;
      if (Math.abs(diff) < 2.2) this.footYaw += diff * Math.min(1, dt * 0.8);
    }
    this.focus.set(f.x, f.y, f.z);
    // Boot liegt vor Anker und schaukelt nur
    this.speed = 0;
  }

  private updateContext(input: Input) {
    this.contextLabel = null;
    if (!this.player || !this.foot) return;
    if (this.mode === 'sail') {
      const isl = this.ground.islandAt(this.x, this.z, 30);
      if (isl && Math.abs(this.speed) < 7) {
        this.contextLabel = 'An Land gehen';
        if (input.pressed('interact')) this.disembark(isl);
      }
    } else {
      const d = Math.hypot(this.foot.x - this.anchor.x, this.foot.z - this.anchor.z);
      if (d < 6) {
        this.contextLabel = 'An Bord gehen';
        if (input.pressed('interact')) this.embark();
      }
    }
  }

  private disembark(isl: WalkIsland) {
    if (!this.player || !this.foot) return;
    const p = this.ground.shorePoint(isl, this.x, this.z);
    this.anchor = { x: p.x, z: p.z };
    this.speed = 0;
    this.scene.add(this.player.holder);
    this.foot.place(p.x, p.z, Math.atan2(isl.x - p.x, isl.z - p.z), this.ground);
    this.footYaw = this.foot.yaw;
    this.setMode('foot');
    this.onMessage('Land unter den Füßen!');
  }

  private embark() {
    this.setMode('sail');
    this.onMessage('Leinen los!');
  }

  private updateNpcs(dt: number) {
    const p = this.mode === 'foot' && this.foot ? new Vector3(this.foot.x, 0, this.foot.z) : null;
    const cam = this.camera.position;
    for (const n of this.npcs) n.update(dt, p, Math.hypot(cam.x - n.x, cam.z - n.z));
  }

  /** Im Menü: Schiff treibt, Zeit und Wetter laufen weiter */
  idle(dt: number) {
    this.prev = { x: this.x, z: this.z, heading: this.heading };
    this.env.update(dt, this.focus);
    this.menuOrbit += dt * 0.08;
    this.updateWake(dt);
    this.spray.update(dt);
    this.sparks.update(dt);
    this.updateNpcs(dt);
    this.player?.update(dt);
  }

  private updateWake(dt: number) {
    for (const w of this.wake) w.age += dt;
    this.wake = this.wake.filter((w) => w.age < 6);
    this.wakeTimer -= dt;
    if (this.wakeTimer <= 0 && Math.abs(this.speed) > 1.5) {
      this.wakeTimer = WAKE_INTERVAL;
      const f = this.fwd();
      this.wake.unshift({ x: this.x - f.x * 4.6, z: this.z - f.z * 4.6, age: 0, strength: Math.min(1, Math.abs(this.speed) / 10) });
    }
    this.env.ocean.setWake(this.wake);
  }

  private fwd(h = this.heading) { return new Vector3(Math.sin(h), 0, Math.cos(h)); }

  private spawnBall(pos: Vector3, vel: Vector3) {
    const b = this.balls.find((x) => !x.alive);
    if (!b) return;
    b.alive = true;
    b.mesh.visible = true;
    b.mesh.position.copy(pos);
    b.vel.copy(vel);
    const f = this.flashes.find((x) => x.life <= 0);
    if (f) { f.life = 0.18; f.mesh.visible = true; f.mesh.position.copy(pos); }
    const dir = vel.clone().normalize();
    this.sparks.emit(10, pos.x + dir.x, pos.y, pos.z + dir.z, { speed: 3, up: 2, life: 0.35, color: new Color(3, 1.6, 0.5), gravity: 2 });
    this.spray.emit(14, pos.x, pos.y, pos.z, { speed: 2, up: 1.5, life: 1.0, color: new Color(0.75, 0.75, 0.78), gravity: -0.6, spread: 1 });
    this.shake = Math.max(this.shake, 0.25);
  }

  private fireBow() {
    const f = this.fwd();
    const pos = new Vector3(this.x, 2.2 + this.env.heightAt(this.x, this.z), this.z).addScaledVector(f, 5.6);
    this.spawnBall(pos, f.clone().multiplyScalar(48 + Math.max(0, this.speed)).setY(7));
  }

  /** side: +1 = backbord (links), −1 = steuerbord (rechts) */
  private fireBroadside(side: number) {
    const f = this.fwd();
    const left = new Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading)).multiplyScalar(side);
    const y = 1.8 + this.env.heightAt(this.x, this.z);
    for (let i = -1; i <= 1; i++) {
      const pos = new Vector3(this.x, y, this.z).addScaledVector(f, i * 2.4).addScaledVector(left, 1.9);
      this.spawnBall(pos, left.clone().multiplyScalar(42).addScaledVector(f, this.speed).setY(6 + Math.random() * 1.5));
    }
  }

  private updateBalls(dt: number) {
    for (const b of this.balls) {
      if (!b.alive) continue;
      b.vel.y -= GRAVITY * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      const p = b.mesh.position;
      if (p.y < this.env.heightAt(p.x, p.z)) {
        b.alive = false;
        b.mesh.visible = false;
        this.spray.emit(36, p.x, p.y + 0.2, p.z, { speed: 3.5, up: 9, life: 1.4, color: new Color(0.95, 0.98, 1) });
      }
    }
  }

  // ---------- Darstellung ----------

  render(alpha: number, frameDt: number, inMenu: boolean) {
    const x = MathUtils.lerp(this.prev.x, this.x, alpha);
    const z = MathUtils.lerp(this.prev.z, this.z, alpha);
    const h = this.prev.heading + (this.heading - this.prev.heading) * alpha;
    const env = this.env;

    const wy = env.heightAt(x, z);
    const f = this.fwd(h);
    const ahead = env.heightAt(x + f.x * 4, z + f.z * 4);
    const behind = env.heightAt(x - f.x * 4, z - f.z * 4);
    const sideH = env.heightAt(x + f.z * 1.6, z - f.x * 1.6);
    const sideH2 = env.heightAt(x - f.z * 1.6, z + f.x * 1.6);
    this.boat.position.set(x, wy - 0.2, z);
    this.boat.rotation.set(Math.atan2(behind - ahead, 8), h, Math.atan2(sideH - sideH2, 3.2) * 0.8, 'YXZ');

    if (Math.abs(this.speed) > 3 && Math.random() < frameDt * 30) {
      this.spray.emit(2, x - f.x * 5.2, wy + 0.1, z - f.z * 5.2, { speed: 1, up: 1.2, life: 1.2, color: new Color(0.95, 0.98, 1), gravity: 3 });
    }
    if (ahead - wy > 0.4 && Math.random() < frameDt * 20 && this.mode === 'sail') {
      this.spray.emit(6, x + f.x * 5, wy + 0.6, z + f.z * 5, { speed: 2.5, up: 4, life: 1, color: new Color(0.95, 0.98, 1) });
    }

    const pal = env.palette;
    const night = 1 - pal.sunVis;
    for (const b of this.buoys) {
      b.g.position.set(b.x, env.heightAt(b.x, b.z) - 0.3, b.z);
      b.g.rotation.z = Math.sin(env.clock * 1.3 + b.x) * 0.15;
      b.lamp.visible = night > 0.3 || Math.sin(env.clock * 3 + b.z) > 0;
    }
    this.lantern.scale.setScalar(0.8 + night * 0.8);
    for (const l of this.lamps) l.scale.setScalar(0.6 + night * 0.7);

    const cam = this.camera;
    if (this.mode === 'foot' && this.foot && this.player && !inMenu) {
      const p = this.foot;
      const px = MathUtils.lerp(p.prev.x, p.x, alpha);
      const pz = MathUtils.lerp(p.prev.z, p.z, alpha);
      const py = MathUtils.lerp(p.prev.y, p.y, alpha);
      const pyaw = p.prev.yaw + (MathUtils.euclideanModulo(p.yaw - p.prev.yaw + Math.PI, Math.PI * 2) - Math.PI) * alpha;
      this.player.holder.position.set(px, py, pz);
      this.player.holder.rotation.set(0, pyaw, 0);
      const cp = Math.cos(this.footPitch);
      this.tmp.set(px - Math.sin(this.footYaw) * this.footDist * cp, py + 1.4 + Math.sin(this.footPitch) * this.footDist, pz - Math.cos(this.footYaw) * this.footDist * cp);
      cam.position.lerp(this.tmp, Math.min(1, frameDt * 10));
      const gy = this.ground.height(cam.position.x, cam.position.z);
      const floor = Math.max(env.heightAt(cam.position.x, cam.position.z) + 0.8, Number.isFinite(gy) ? gy + 0.6 : -99);
      if (cam.position.y < floor) cam.position.y = floor;
      cam.lookAt(px, py + 1.3, pz);
      this.focus.set(px, py + 1, pz);
    } else if (inMenu) {
      const a = this.menuOrbit;
      cam.position.set(x + Math.sin(a) * 30, 9 + Math.sin(a * 2) * 1.5, z + Math.cos(a) * 30);
      cam.lookAt(x, 4, z);
      this.focus.set(x, wy + 2, z);
    } else {
      const yaw = h + Math.PI + this.camYaw;
      const dist = this.camDist + (this.boost > 0 ? 4 : 0);
      const cp = Math.cos(this.camPitch);
      this.tmp.set(x + Math.sin(yaw) * dist * cp, Math.max(wy + 2, 3 + Math.sin(this.camPitch) * dist), z + Math.cos(yaw) * dist * cp);
      cam.position.lerp(this.tmp, Math.min(1, frameDt * 8));
      const camWater = env.heightAt(cam.position.x, cam.position.z) + 1.2;
      if (cam.position.y < camWater) cam.position.y = camWater;
      cam.lookAt(x, 3.5 + wy * 0.3, z);
      this.focus.set(x, wy + 2, z);
    }
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.6;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    env.render(cam, this.focus);
  }
}
