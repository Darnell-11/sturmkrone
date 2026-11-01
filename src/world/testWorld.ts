import {
  BackSide,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Input } from '../core/input/input';
import type { QualityConfig } from '../data/qualityTiers';
import { buildTestBoat } from '../entities/testBoat';
import { ParticleSystem } from './particles';
import { seeded, waveHeight } from './waves';

const WORLD_RADIUS = 1400;
const MAX_SPEED = 16;
const GRAVITY = 9.8;

interface Ball { mesh: Mesh; vel: Vector3; alive: boolean }
interface Flash { mesh: Mesh; life: number }

const DAY = { top: new Color(0x2f86d6), horizon: new Color(0xcfeeff), sun: new Color(0xfff1d6), sunI: 2.6, hemiI: 1.1 };
const NIGHT = { top: new Color(0x050b1f), horizon: new Color(0x1c3058), sun: new Color(0x9fb8ff), sunI: 0.6, hemiI: 0.7 };

/**
 * Testszene für Meilenstein 0: prüft Spielschleife, Eingabe, Qualitätsstufen und Speichern.
 * Bewusst schlicht – die eigentliche Grafik (Toon-Material, Gerstner-Ozean, Himmel) kommt in Meilenstein 1.
 */
export class TestWorld {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(55, 1, 0.3, 1000);

  /** Wird vom Spiel genutzt, um kurze Meldungen anzuzeigen */
  onMessage: (text: string) => void = () => {};

  private sun = new DirectionalLight(0xffffff, 2.6);
  private hemi = new HemisphereLight(0xdff3ff, 0x2a5a6a, 1.1);
  private skyMat: ShaderMaterial;
  private sky: Mesh;
  private ocean!: Mesh;
  private oceanBase!: Float32Array;
  private oceanCell = 8;
  private farSea: Mesh;
  private boat: Group;
  private lantern: Mesh;
  private buoys: { g: Group; x: number; z: number; lamp: Mesh }[] = [];
  private balls: Ball[] = [];
  private flashes: Flash[] = [];
  private spray: ParticleSystem;
  private sparks: ParticleSystem;

  // Logik-Zustand (feste Schritte) und Vorzustand für weiche Darstellung
  private time = 0;
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
  private night = 0;
  private nightTarget = 0;
  private shake = 0;
  private edgeWarned = false;

  // Kamera
  private camYaw = 0;
  private camPitch = 0.32;
  private camDist = 22;
  private camIdle = 0;
  private menuOrbit = 0;

  private tmp = new Vector3();
  private config: QualityConfig | null = null;

  constructor() {
    const s = this.scene;
    s.fog = new Fog(DAY.horizon.clone(), 80, 500);

    this.sun.position.set(60, 90, 40);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 260;
    s.add(this.sun, this.sun.target, this.hemi);

    this.skyMat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: DAY.top.clone() },
        horizon: { value: DAY.horizon.clone() },
        sunDir: { value: new Vector3(0.5, 0.6, 0.35).normalize() },
        sunCol: { value: DAY.sun.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 c = mix(horizon, top, pow(h, 0.5));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          c += sunCol * (smoothstep(0.9990, 0.9995, s) * 6.0 + pow(s, 32.0) * 0.35);
          if (vDir.y < 0.0) c = horizon;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new Mesh(new SphereGeometry(400, 32, 16), this.skyMat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    s.add(this.sky);

    this.farSea = new Mesh(
      new PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({ color: 0x0f6a8c, roughness: 0.4 }),
    );
    this.farSea.position.y = -0.9;
    s.add(this.farSea);

    this.buildOcean(1);

    const b = buildTestBoat();
    this.boat = b.group;
    this.lantern = b.lantern;
    s.add(this.boat);

    this.buildIslands();
    this.buildBuoys();

    const ballGeo = new SphereGeometry(0.28, 10, 8);
    const ballMat = new MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.4, metalness: 0.6 });
    for (let i = 0; i < 40; i++) {
      const m = new Mesh(ballGeo, ballMat);
      m.visible = false;
      m.castShadow = true;
      s.add(m);
      this.balls.push({ mesh: m, vel: new Vector3(), alive: false });
    }
    const flashGeo = new SphereGeometry(1, 12, 8);
    for (let i = 0; i < 12; i++) {
      const m = new Mesh(flashGeo, new MeshBasicMaterial({ color: new Color(6, 3.2, 1), transparent: true }));
      m.visible = false;
      s.add(m);
      this.flashes.push({ mesh: m, life: 0 });
    }
    this.spray = new ParticleSystem(s, false, 0.8);
    this.sparks = new ParticleSystem(s, true, 0.5);
  }

  // ---------- Aufbau ----------

  private buildOcean(detail: number) {
    if (this.ocean) {
      this.scene.remove(this.ocean);
      this.ocean.geometry.dispose();
    }
    const size = 640;
    const seg = Math.round(80 * detail);
    this.oceanCell = size / seg;
    const geo = new PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
    this.oceanBase = (geo.attributes.position.array as Float32Array).slice();
    geo.setAttribute('color', new BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, flatShading: true });
    this.ocean = new Mesh(geo, mat);
    this.ocean.receiveShadow = true;
    this.ocean.frustumCulled = false;
    this.scene.add(this.ocean);
  }

  private buildIslands() {
    const rnd = seeded(2024);
    const sand = new MeshStandardMaterial({ color: 0xf1d9a0, roughness: 0.95 });
    const grass = new MeshStandardMaterial({ color: 0x6dbb4c, roughness: 0.9, flatShading: true });
    const trunk = new MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 });
    const leaf = new MeshStandardMaterial({ color: 0x3f9a3a, roughness: 0.8, flatShading: true });
    const stone = new MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.7 });
    const red = new MeshStandardMaterial({ color: 0xa8322a, roughness: 0.7 });

    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2 + rnd() * 0.5;
      const dist = 140 + rnd() * 700;
      const r = 14 + rnd() * 26;
      const isl = new Group();
      isl.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
      const beach = new Mesh(new CylinderGeometry(r, r * 1.25, 3, 28), sand);
      beach.position.y = 0.2;
      const hill = new Mesh(new SphereGeometry(r * 0.75, 14, 8), grass);
      hill.scale.y = 0.35 + rnd() * 0.3;
      hill.position.y = 1.4;
      isl.add(beach, hill);
      const palms = 2 + Math.floor(rnd() * 4);
      for (let k = 0; k < palms; k++) {
        const pa = rnd() * Math.PI * 2;
        const pr = r * (0.3 + rnd() * 0.5);
        const palm = new Group();
        palm.position.set(Math.cos(pa) * pr, 1.5, Math.sin(pa) * pr);
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
      }
      if (i === 0) {
        // Leuchtturm als Orientierung (Bloom-Test bei Nacht)
        const tower = new Mesh(new CylinderGeometry(1.6, 2.4, 16, 12), stone);
        tower.position.set(0, 9, 0);
        const band = new Mesh(new CylinderGeometry(1.95, 2.05, 2, 12), red);
        band.position.set(0, 10, 0);
        const lamp = new Mesh(new SphereGeometry(1.4, 16, 10), new MeshBasicMaterial({ color: new Color(6, 5, 2.5) }));
        lamp.position.set(0, 18, 0);
        isl.add(tower, band, lamp);
      }
      isl.traverse((o) => {
        if ((o as Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      this.scene.add(isl);
    }
  }

  private buildBuoys() {
    const rnd = seeded(77);
    const body = new MeshStandardMaterial({ color: 0xf3e6c8, roughness: 0.6 });
    for (let i = 0; i < 14; i++) {
      const g = new Group();
      const x = (rnd() - 0.5) * 500;
      const z = (rnd() - 0.5) * 500;
      const m = new Mesh(new ConeGeometry(0.9, 2.2, 10), body);
      m.position.y = 0.6;
      m.castShadow = true;
      const col = i % 2 ? new Color(4, 0.5, 0.4) : new Color(0.5, 4, 0.8);
      const lamp = new Mesh(new SphereGeometry(0.3, 10, 8), new MeshBasicMaterial({ color: col }));
      lamp.position.y = 1.9;
      g.add(m, lamp);
      this.scene.add(g);
      this.buoys.push({ g, x, z, lamp });
    }
  }

  // ---------- Grafikstufe ----------

  applyQuality(c: QualityConfig) {
    const detailChanged = !this.config || this.config.detail !== c.detail;
    this.config = c;
    const fog = this.scene.fog as Fog;
    fog.near = c.viewDistance * 0.18;
    fog.far = c.viewDistance;
    this.camera.far = c.viewDistance * 1.2;
    this.camera.updateProjectionMatrix();
    this.sky.scale.setScalar((c.viewDistance * 0.95) / 400);

    const sh = this.sun.shadow;
    this.sun.castShadow = c.shadows.enabled;
    if (c.shadows.enabled && sh.mapSize.x !== c.shadows.mapSize) {
      sh.mapSize.set(c.shadows.mapSize, c.shadows.mapSize);
      sh.map?.dispose();
      (sh as any).map = null;
    }
    // Größere Schattenkarte = größerer Bereich bei gleicher Schärfe
    const ext = c.shadows.mapSize >= 4096 ? 70 : c.shadows.mapSize >= 2048 ? 50 : 36;
    const sc = sh.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
    sc.updateProjectionMatrix();
    sh.radius = c.shadows.soft ? 3 : 1;

    this.spray.scale = c.particles;
    this.sparks.scale = c.particles;
    if (detailChanged) this.buildOcean(c.detail);
  }

  // ---------- Spielstand ----------

  getState() {
    return { boat: { x: this.x, z: this.z, heading: this.heading }, night: this.nightTarget > 0.5 };
  }

  setState(s: { boat: { x: number; z: number; heading: number } | null; night: boolean }) {
    if (s.boat) {
      this.x = s.boat.x;
      this.z = s.boat.z;
      this.heading = s.boat.heading;
    } else {
      this.x = 0;
      this.z = -60;
      this.heading = 0;
    }
    this.prev = { x: this.x, z: this.z, heading: this.heading };
    this.speed = 0;
    this.night = this.nightTarget = s.night ? 1 : 0;
    this.camYaw = 0;
    this.balls.forEach((b) => { b.alive = false; b.mesh.visible = false; });
  }

  // ---------- Logik (feste Schritte) ----------

  update(dt: number, input: Input) {
    this.time += dt;
    this.prev = { x: this.x, z: this.z, heading: this.heading };

    const mv = input.move();
    // Steuern: oben = Fahrt aufnehmen, unten = bremsen/rückwärts, links/rechts = drehen
    const target = mv.y >= 0 ? mv.y * MAX_SPEED : mv.y * 5;
    const boostMul = this.boost > 0 ? 1.8 : 1;
    this.speed += (target * boostMul - this.speed) * Math.min(1, dt * (mv.y < 0 ? 1.2 : 0.7));
    const turn = 0.35 + 0.65 * Math.min(1, Math.abs(this.speed) / 8);
    this.heading -= mv.x * 1.2 * turn * dt;
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;

    // Vorläufiger Weltrand (der echte Wasserfall kommt in Meilenstein 1)
    const d = Math.hypot(this.x, this.z);
    if (d > WORLD_RADIUS) {
      this.x *= WORLD_RADIUS / d;
      this.z *= WORLD_RADIUS / d;
      this.speed *= 0.9;
      if (!this.edgeWarned) { this.edgeWarned = true; this.onMessage('Hier endet die Testwelt – kehr um!'); }
    } else if (d < WORLD_RADIUS - 100) this.edgeWarned = false;

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
    if (input.pressed('interact')) {
      this.nightTarget = this.nightTarget > 0.5 ? 0 : 1;
      this.onMessage(this.nightTarget ? 'Die Nacht bricht herein …' : 'Ein neuer Morgen.');
    }

    // Kamera: Maus/Touch-Ziehen und rechter Stick
    const ld = input.lookDelta();
    const la = input.lookAxis();
    const lx = ld.x * 0.006 + la.x * 2.2 * dt;
    const ly = ld.y * 0.004 + la.y * 1.4 * dt;
    if (lx || ly) this.camIdle = 0; else this.camIdle += dt;
    this.camYaw -= lx;
    this.camPitch = MathUtils.clamp(this.camPitch + ly, 0.08, 1.1);
    if (this.camIdle > 2.5) this.camYaw *= 1 - Math.min(1, dt * 1.2); // Kamera kehrt langsam hinter das Schiff zurück
    this.camDist = MathUtils.clamp(this.camDist + input.zoomDelta() * 2, 12, 45);

    this.night += (this.nightTarget - this.night) * Math.min(1, dt * 1.5);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.updateBalls(dt);
    this.spray.update(dt);
    this.sparks.update(dt);
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = Math.max(0, f.life / 0.18);
      f.mesh.scale.setScalar(0.4 + (1 - k) * 1.6);
      (f.mesh.material as MeshBasicMaterial).opacity = k;
      if (f.life <= 0) f.mesh.visible = false;
    }
  }

  /** Im Menü: Schiff treibt, Kamera kreist langsam */
  idle(dt: number) {
    this.time += dt;
    this.prev = { x: this.x, z: this.z, heading: this.heading };
    this.menuOrbit += dt * 0.08;
    this.night += (this.nightTarget - this.night) * Math.min(1, dt * 1.5);
    this.spray.update(dt);
    this.sparks.update(dt);
  }

  private fwd(h = this.heading) { return new Vector3(Math.sin(h), 0, Math.cos(h)); }

  private spawnBall(pos: Vector3, vel: Vector3) {
    const b = this.balls.find((x) => !x.alive);
    if (!b) return;
    b.alive = true;
    b.mesh.visible = true;
    b.mesh.position.copy(pos);
    b.vel.copy(vel);
    this.muzzle(pos, vel);
  }

  private muzzle(pos: Vector3, vel: Vector3) {
    const f = this.flashes.find((x) => x.life <= 0);
    if (f) {
      f.life = 0.18;
      f.mesh.visible = true;
      f.mesh.position.copy(pos);
    }
    const dir = vel.clone().normalize();
    this.sparks.emit(10, pos.x + dir.x, pos.y, pos.z + dir.z, { speed: 3, up: 2, life: 0.35, color: new Color(3, 1.6, 0.5), gravity: 2 });
    this.spray.emit(14, pos.x, pos.y, pos.z, { speed: 2, up: 1.5, life: 1.0, color: new Color(0.75, 0.75, 0.78), gravity: -0.6, spread: 1 });
    this.shake = Math.max(this.shake, 0.25);
  }

  private fireBow() {
    const f = this.fwd();
    const pos = new Vector3(this.x, 2.2 + waveHeight(this.x, this.z, this.time), this.z).addScaledVector(f, 5.6);
    const vel = f.clone().multiplyScalar(48 + Math.max(0, this.speed)).setY(7);
    this.spawnBall(pos, vel);
  }

  /** side: +1 = backbord (links), −1 = steuerbord (rechts) */
  private fireBroadside(side: number) {
    const f = this.fwd();
    const left = new Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading)).multiplyScalar(side);
    const y = 1.8 + waveHeight(this.x, this.z, this.time);
    for (let i = -1; i <= 1; i++) {
      const pos = new Vector3(this.x, y, this.z).addScaledVector(f, i * 2.4).addScaledVector(left, 1.9);
      const vel = left.clone().multiplyScalar(42).addScaledVector(f, this.speed).setY(6 + Math.random() * 1.5);
      this.spawnBall(pos, vel);
    }
  }

  private updateBalls(dt: number) {
    for (const b of this.balls) {
      if (!b.alive) continue;
      b.vel.y -= GRAVITY * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      const p = b.mesh.position;
      if (p.y < waveHeight(p.x, p.z, this.time)) {
        b.alive = false;
        b.mesh.visible = false;
        this.spray.emit(36, p.x, p.y + 0.2, p.z, { speed: 3.5, up: 9, life: 1.4, color: new Color(0.95, 0.98, 1) });
      }
    }
  }

  // ---------- Darstellung (jeder Frame) ----------

  render(alpha: number, frameDt: number, inMenu: boolean) {
    const x = MathUtils.lerp(this.prev.x, this.x, alpha);
    const z = MathUtils.lerp(this.prev.z, this.z, alpha);
    const h = this.prev.heading + (this.heading - this.prev.heading) * alpha;
    const t = this.time;

    // Schiff schaukelt auf den Wellen
    const wy = waveHeight(x, z, t);
    const f = this.fwd(h);
    const ahead = waveHeight(x + f.x * 4, z + f.z * 4, t);
    const behind = waveHeight(x - f.x * 4, z - f.z * 4, t);
    const side = waveHeight(x + f.z * 1.5, z - f.x * 1.5, t);
    this.boat.position.set(x, wy - 0.15, z);
    this.boat.rotation.set(Math.atan2(behind - ahead, 8), h, Math.atan2(side - wy, 1.5) * 0.6, 'YXZ');

    // Kielwasser
    if (Math.abs(this.speed) > 3 && Math.random() < frameDt * 30) {
      this.spray.emit(2, x - f.x * 5.2, wy + 0.1, z - f.z * 5.2, { speed: 1, up: 1.2, life: 1.2, color: new Color(0.95, 0.98, 1), gravity: 3 });
    }

    this.updateOcean(x, z, t);
    for (const b of this.buoys) {
      const by = waveHeight(b.x, b.z, t);
      b.g.position.set(b.x, by - 0.3, b.z);
      b.g.rotation.z = Math.sin(t * 1.3 + b.x) * 0.15;
      b.lamp.visible = this.night > 0.3 || Math.sin(t * 3 + b.z) > 0;
    }
    this.farSea.position.x = x;
    this.farSea.position.z = z;

    // Tag/Nacht
    const n = this.night;
    const u = this.skyMat.uniforms;
    (u.top.value as Color).copy(DAY.top).lerp(NIGHT.top, n);
    (u.horizon.value as Color).copy(DAY.horizon).lerp(NIGHT.horizon, n);
    (u.sunCol.value as Color).copy(DAY.sun).lerp(NIGHT.sun, n);
    (this.scene.fog as Fog).color.copy(u.horizon.value as Color);
    this.sun.intensity = MathUtils.lerp(DAY.sunI, NIGHT.sunI, n);
    this.sun.color.copy(DAY.sun).lerp(NIGHT.sun, n);
    this.hemi.intensity = MathUtils.lerp(DAY.hemiI, NIGHT.hemiI, n);
    this.lantern.scale.setScalar(1 + n * 0.6);

    // Sonne folgt dem Schiff, damit der Schattenbereich passt
    const sd = (u.sunDir.value as Vector3);
    this.sun.position.set(x + sd.x * 120, sd.y * 120, z + sd.z * 120);
    this.sun.target.position.set(x, 0, z);

    // Kamera
    const cam = this.camera;
    if (inMenu) {
      const a = this.menuOrbit;
      cam.position.set(x + Math.sin(a) * 30, 9 + Math.sin(a * 2) * 1.5, z + Math.cos(a) * 30);
      cam.lookAt(x, 4, z);
    } else {
      const yaw = h + Math.PI + this.camYaw;
      const dist = this.camDist + (this.boost > 0 ? 4 : 0);
      const cp = Math.cos(this.camPitch);
      this.tmp.set(x + Math.sin(yaw) * dist * cp, wy * 0.3 + 3 + Math.sin(this.camPitch) * dist, z + Math.cos(yaw) * dist * cp);
      cam.position.lerp(this.tmp, Math.min(1, frameDt * 8));
      if (this.shake > 0) {
        const s = this.shake * this.shake * 0.6;
        cam.position.x += (Math.random() - 0.5) * s;
        cam.position.y += (Math.random() - 0.5) * s;
      }
      cam.lookAt(x, 3.5, z);
    }
    this.sky.position.copy(cam.position);
  }

  private updateOcean(cx: number, cz: number, t: number) {
    const cell = this.oceanCell;
    const ox = Math.round(cx / cell) * cell;
    const oz = Math.round(cz / cell) * cell;
    this.ocean.position.set(ox, 0, oz);
    const pos = this.ocean.geometry.attributes.position as BufferAttribute;
    const col = this.ocean.geometry.attributes.color as BufferAttribute;
    const arr = pos.array as Float32Array;
    const carr = col.array as Float32Array;
    const base = this.oceanBase;
    const n = this.night;
    const deepR = MathUtils.lerp(0.02, 0.01, n), deepG = MathUtils.lerp(0.28, 0.06, n), deepB = MathUtils.lerp(0.45, 0.16, n);
    const midR = MathUtils.lerp(0.05, 0.02, n), midG = MathUtils.lerp(0.55, 0.14, n), midB = MathUtils.lerp(0.62, 0.26, n);
    for (let i = 0; i < arr.length; i += 3) {
      const wx = base[i] + ox;
      const wz = base[i + 2] + oz;
      const y = waveHeight(wx, wz, t);
      arr[i + 1] = y;
      const k = MathUtils.clamp((y + 1.1) / 2.3, 0, 1);
      const foam = y > 0.95 ? 0.6 : 0;
      carr[i] = MathUtils.lerp(deepR, midR, k) + foam;
      carr[i + 1] = MathUtils.lerp(deepG, midG, k) + foam;
      carr[i + 2] = MathUtils.lerp(deepB, midB, k) + foam;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}
