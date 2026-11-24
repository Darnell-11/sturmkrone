// Der Tiefsee-Leviathan (Weltboss, Phase 4.3C): ein gigantisches Seeungeheuer der Außenmeere. Körper und Tentakel sind Instanz-Netze (wenige
// Zeichenaufrufe), alles wird einmal beim Start gebaut und nur ein- und ausgeblendet (`activate`/`deactivate`): kein Aufbau mitten im Spiel.
// Angriffe: Tentakel-Schläge mit rotem Warnring auf dem Wasser (1,8 s Vorwarnung), Wellenstöße, die Schiffe wegdrücken, Abtauchen und Auftauchen.
// Kanonenkugeln treffen Kopf, Körper und Tentakel (`hitTest`); jeder Treffer nimmt höchstens `WORLD_BOSS_HIT_CAP` des Lebens (`damage`). Den Schaden am
// Spielerschiff deckelt der Gastgeber pro Salve (`capVolley`, data/balanceConfig.ts).
import {
  Color, ConeGeometry, CustomBlending, DoubleSide, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, OneFactor, Quaternion,
  RingGeometry, SphereGeometry, SrcAlphaFactor, Vector3, ZeroFactor, type Scene,
} from 'three';
import { toon } from '../render/toon';
import { capBossHit, dangerScale } from '../data/balanceConfig';
import type { Ship } from '../entities/ship/ship';

export interface LeviathanHooks {
  shake(a: number): void;
  splash(x: number, z: number, big: boolean): void;
  /** Schaden am Spielerschiff (der Gastgeber deckelt die Salve) und optional ein Stoß (m/s, Weltachsen) */
  hitShip(dmg: number, pushX: number, pushZ: number): void;
  roar(): void;
}

const SEGS = 14;
const TENT = 6;
const TSEG = 9;
const TELE = 3;
const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _a = new Vector3();
const UP = new Vector3(0, 1, 0);
const KEEP_ALPHA = { blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor } as const;

interface Slam { x: number; z: number; t: number; tent: number; hit: boolean; ring: Mesh }

export class LeviathanBoss {
  readonly group = new Group();
  private readonly body: InstancedMesh;
  private readonly tents: InstancedMesh;
  private readonly head = new Group();
  private readonly rings: Mesh[] = [];
  private readonly wave: Mesh;
  private slams: Slam[] = [];
  maxHp = 1;
  hp = 1;
  /** Lage der Körpermitte (folgt der Bahn) */
  x = 0;
  z = 0;
  private sub = 0;
  private ang = 0;
  private t = 0;
  private slamT = 4;
  private waveT = 9;
  private waveR = -1;
  private wavePrev = 0;
  private diveT = 18;
  private diving = 0;
  private flash = 0;
  private dmgBase = 40;
  active = false;

  constructor(scene: Scene) {
    const skin = toon('#3A6680');
    this.body = new InstancedMesh(new SphereGeometry(1, 16, 12), skin, SEGS);
    this.tents = new InstancedMesh(new SphereGeometry(1, 10, 8), toon('#46778C'), TENT * TSEG);
    for (const im of [this.body, this.tents]) { im.instanceMatrix.setUsage(DynamicDrawUsage); im.frustumCulled = false; im.castShadow = true; im.userData.noOutline = true; }
    // Kopf: Schädel, Kiefer, leuchtende Augen, Hörner
    const belly = toon('#8CC0C8');
    const skull = new Mesh(new SphereGeometry(8, 18, 14), skin);
    skull.scale.set(1, 0.78, 1.45);
    const jaw = new Mesh(new ConeGeometry(5.2, 13, 10), belly);
    jaw.rotation.x = Math.PI / 2;
    jaw.position.set(0, -3, 9.4);
    const eyeMat = new MeshBasicMaterial({ color: new Color(3.6, 1.2, 0.5), toneMapped: false });
    const spike = new MeshBasicMaterial({ color: new Color(0.9, 2.4, 3.2), toneMapped: false });
    for (const s of [-1, 1]) {
      const eye = new Mesh(new SphereGeometry(1.4, 10, 8), eyeMat);
      eye.position.set(s * 4.6, 2.4, 7.2);
      const horn = new Mesh(new ConeGeometry(1.6, 9, 7), spike);
      horn.position.set(s * 4.2, 6.6, -1.6);
      horn.rotation.set(-0.6, 0, s * 0.45);
      this.head.add(eye, horn);
    }
    this.head.add(skull, jaw);
    this.head.traverse((o) => { o.castShadow = true; o.userData.noOutline = true; });
    const ringMat = () => new MeshBasicMaterial({ color: new Color(2.6, 0.25, 0.15), transparent: true, depthWrite: false, side: DoubleSide, fog: false, toneMapped: false, ...KEEP_ALPHA });
    for (let i = 0; i < TELE; i++) {
      const r = new Mesh(new RingGeometry(0.78, 1, 48).rotateX(-Math.PI / 2), ringMat());
      r.visible = false; r.renderOrder = 4; r.userData.noOutline = true;
      this.rings.push(r);
      this.group.add(r);
    }
    this.wave = new Mesh(new RingGeometry(0.975, 1, 128).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: new Color(0.95, 1.15, 1.3), transparent: true, depthWrite: false, side: DoubleSide, fog: false, toneMapped: false, ...KEEP_ALPHA }));
    this.wave.visible = false; this.wave.renderOrder = 4; this.wave.userData.noOutline = true;
    this.group.add(this.body, this.tents, this.head, this.wave);
    this.group.name = 'leviathan';
    scene.add(this.group);
  }

  get alive() { return this.hp > 0; }
  get frac() { return this.hp / Math.max(1, this.maxHp); }
  get headPos() { return this.head.position; }
  /** Aufgetaucht genug, um getroffen zu werden und anzugreifen */
  get surfaced() { return this.sub > 0.5; }

  /** Beim Laden einmal zeigen, damit die Shader vorübersetzt werden */
  prewarm(at: Vector3) {
    this.group.visible = true;
    this.group.position.set(0, 0, 0);
    this.head.position.set(at.x, -3000, at.z);
    for (let i = 0; i < SEGS; i++) { _m.makeTranslation(at.x, -3000, at.z); this.body.setMatrixAt(i, _m); }
    for (let i = 0; i < TENT * TSEG; i++) { _m.makeTranslation(at.x, -3000, at.z); this.tents.setMatrixAt(i, _m); }
    for (const r of this.rings) { r.visible = true; r.position.set(at.x, -3000, at.z); }
    this.wave.visible = true; this.wave.position.set(at.x, -3000, at.z);
  }

  /** Erscheinen lassen (Lage, Leben, Stufe für den Schaden) */
  activate(x: number, z: number, maxHp: number, frac: number, level: number) {
    this.active = true;
    this.x = x; this.z = z;
    this.maxHp = Math.max(1, maxHp);
    this.hp = this.maxHp * Math.max(0, Math.min(1, frac));
    this.dmgBase = 9 * dangerScale(level).dmg;
    this.sub = 0; this.diving = 0; this.slamT = 4; this.waveT = 9; this.waveR = -1; this.diveT = 18;
    for (const s of this.slams) s.ring.visible = false;
    this.slams.length = 0;
    // nach dem Vorwärmen (alles sichtbar) sind Warnringe und Welle frei
    for (const r of this.rings) r.visible = false;
    this.wave.visible = false;
    this.group.visible = true;
  }

  /** Abtauchen ohne Kampf (die Seewelt baut das Ereignis zu Daten ab) */
  deactivate() {
    this.active = false;
    this.group.visible = false;
    for (const s of this.slams) s.ring.visible = false;
    this.slams.length = 0;
    this.wave.visible = false;
  }

  /** Trifft eine Kanonenkugel den Körper? (nur aufgetaucht) */
  hitTest(p: Vector3): boolean {
    if (!this.active || !this.alive || this.sub < 0.45) return false;
    if (this.head.position.distanceTo(p) < 11) return true;
    for (let i = 0; i < SEGS; i++) { this.body.getMatrixAt(i, _m); _a.setFromMatrixPosition(_m); _s.setFromMatrixScale(_m); if (_a.distanceTo(p) < _s.x + 1.2) return true; }
    for (let i = 0; i < TENT * TSEG; i += 2) { this.tents.getMatrixAt(i, _m); _a.setFromMatrixPosition(_m); _s.setFromMatrixScale(_m); if (_a.distanceTo(p) < _s.x + 1) return true; }
    return false;
  }

  /** Schaden nehmen (Anti-One-Shot: höchstens `WORLD_BOSS_HIT_CAP` des Lebens je Treffer); liefert den angerichteten Schaden */
  damage(n: number): number {
    if (!this.alive) return 0;
    const d = Math.min(this.hp, capBossHit(n, this.maxHp));
    this.hp -= d;
    this.flash = 0.12;
    return d;
  }

  /**
   * Ein Schritt (`dt` s): Bahn (`goal` = nächster Wegpunkt, ohne Spieler), Auftauchen, Angriffe gegen `ship`, Körper und Tentakel. `engage` = der Spieler ist
   * in der Zone oder hat zuerst geschossen (Opt-In: sonst zieht das Ungeheuer nur seine Bahn).
   */
  update(dt: number, heightAt: (x: number, z: number) => number, ship: Ship | null, goal: { x: number; z: number } | null, engage: boolean, h: LeviathanHooks) {
    if (!this.active) return;
    this.t += dt;
    this.flash -= dt;
    const live = this.alive;
    const dShip = ship ? Math.hypot(ship.x - this.x, ship.z - this.z) : 1e9;
    const fight = live && engage && !!ship && dShip < 900;
    // Bahn: ohne Kampf zum Wegpunkt; im Kampf hält es 70 – 110 m Abstand zum Schiff und umkreist es
    let tx = goal?.x ?? this.x, tz = goal?.z ?? this.z, speed = 3;
    if (fight && ship) {
      const a = Math.atan2(this.x - ship.x, this.z - ship.z) + 0.35;
      tx = ship.x + Math.sin(a) * 90; tz = ship.z + Math.cos(a) * 90; speed = 7;
    }
    if (live) {
      const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
      if (d > 2) { const k = Math.min(d, speed * dt) / d; this.x += dx * k; this.z += dz * k; }
    }
    // Auf- und Abtauchen
    const wantUp = live && (fight || dShip < 500) && this.diving <= 0 ? 1 : 0;
    const before = this.sub;
    this.sub += ((live ? wantUp : 0) - this.sub) * Math.min(1, dt * (live ? 0.8 : 0.35));
    if (before < 0.3 && this.sub >= 0.3) { h.roar(); h.splash(this.x, this.z, true); h.shake(0.7); }
    if (fight) {
      this.diveT -= dt;
      if (this.diveT <= 0 && this.diving <= 0) { this.diving = 4; this.diveT = 20 + Math.random() * 6; }
      if (this.diving > 0) {
        this.diving -= dt;
        // unter Wasser zum Schiff: taucht nahe am Bug wieder auf
        if (ship) { this.x += (ship.x - this.x) * dt * 0.3; this.z += (ship.z - this.z) * dt * 0.3; }
      }
    }
    // Angriffe
    if (fight && ship && this.sub > 0.8) {
      this.slamT -= dt;
      if (this.slamT <= 0 && this.slams.length < TELE) {
        this.slamT = (this.frac < 0.4 ? 2.6 : 3.8) + Math.random() * 1.4;
        const lead = 1.8;
        const sx = ship.x + Math.sin(ship.heading) * ship.speed * lead + (Math.random() - 0.5) * 8;
        const sz = ship.z + Math.cos(ship.heading) * ship.speed * lead + (Math.random() - 0.5) * 8;
        const ring = this.rings.find((r) => !this.slams.some((q) => q.ring === r));
        if (ring) {
          ring.visible = true;
          this.slams.push({ x: sx, z: sz, t: 0, tent: this.slams.length % TENT, hit: false, ring });
        }
      }
      this.waveT -= dt;
      if (this.waveT <= 0 && this.waveR < 0) { this.waveT = 9 + Math.random() * 4; this.waveR = 4; this.wavePrev = 0; h.splash(this.x, this.z, true); }
    }
    // Wellenstoß: Ring breitet sich aus, wer ihn kreuzt, wird weggedrückt
    if (this.waveR >= 0) {
      this.wavePrev = this.waveR;
      this.waveR += dt * 48;
      if (ship && dShip > this.wavePrev && dShip <= this.waveR) {
        const nx = (ship.x - this.x) / Math.max(1, dShip), nz = (ship.z - this.z) / Math.max(1, dShip);
        h.hitShip(this.dmgBase * 3.2, nx * 9, nz * 9);
        h.shake(0.5);
      }
      this.wave.visible = true;
      this.wave.position.set(this.x, heightAt(this.x, this.z) + 0.4, this.z);
      this.wave.scale.setScalar(this.waveR);
      (this.wave.material as MeshBasicMaterial).opacity = 0.5 * (1 - this.waveR / 300);
      if (this.waveR > 300) { this.waveR = -1; this.wave.visible = false; }
    }
    // Tentakel-Schläge: Warnring (1,8 s), dann Schlag
    for (let i = this.slams.length - 1; i >= 0; i--) {
      const s = this.slams[i];
      s.t += dt;
      const k = Math.min(1, s.t / 1.8);
      s.ring.position.set(s.x, heightAt(s.x, s.z) + 0.3, s.z);
      s.ring.scale.setScalar(16 * (0.55 + 0.45 * k));
      (s.ring.material as MeshBasicMaterial).opacity = 0.25 + 0.65 * k * (0.75 + 0.25 * Math.sin(this.t * 18));
      if (!s.hit && s.t >= 1.8) {
        s.hit = true;
        h.splash(s.x, s.z, true);
        h.shake(0.45);
        if (ship && Math.hypot(ship.x - s.x, ship.z - s.z) < 17 + ship.cls.W * 0.5) h.hitShip(this.dmgBase * 9, 0, 0);
      }
      if (s.t > 2.6) { s.ring.visible = false; this.slams.splice(i, 1); }
    }
    this.pose(heightAt, ship);
  }

  /** Körper als Bogen, Kopf zum Schiff, Tentakel wiegen sich (einer schlägt zu) */
  private pose(heightAt: (x: number, z: number) => number, ship: Ship | null) {
    this.ang += 0.006 + (this.alive ? 0.004 : 0);
    const R = 46;
    const sub = this.sub;
    for (let i = 0; i < SEGS; i++) {
      const a = this.ang - i * 0.17;
      const x = this.x + Math.cos(a) * R, z = this.z + Math.sin(a) * R;
      const r = 6.4 - i * 0.28;
      const arch = Math.sin((i / (SEGS - 1)) * Math.PI) * 13 + Math.sin(this.t * 1.6 + i * 0.6) * 1.2;
      const y = heightAt(x, z) + sub * (arch + 1) - (1 - sub) * 18;
      _m.compose(_v.set(x, y, z), _q.identity(), _s.set(r, r * 0.92, r * 1.05));
      this.body.setMatrixAt(i, _m);
    }
    this.body.instanceMatrix.needsUpdate = true;
    const ha = this.ang + 0.24;
    const hx = this.x + Math.cos(ha) * R, hz = this.z + Math.sin(ha) * R;
    this.head.position.set(hx, heightAt(hx, hz) + sub * 12 - (1 - sub) * 22 + Math.sin(this.t * 1.5) * 1, hz);
    const look = ship && sub > 0.3 ? Math.atan2(ship.x - hx, ship.z - hz) : Math.atan2(-Math.sin(ha), Math.cos(ha));
    this.head.rotation.set(-0.12, look, 0);
    this.head.scale.setScalar(this.flash > 0 ? 1.05 : 1);
    // Tentakel: fünf um den Körper, wiegend; einer je Schlag hebt sich über dem Warnring und fällt
    let n = 0;
    for (let k = 0; k < TENT; k++) {
      const slam = this.slams.find((s) => s.tent === k);
      const base = this.ang * 0.5 + (k / TENT) * Math.PI * 2;
      const bx = slam ? slam.x : this.x + Math.cos(base) * 28, bz = slam ? slam.z : this.z + Math.sin(base) * 28;
      const out = slam ? 0 : 1;
      const rise = slam ? Math.sin(Math.min(1, slam.t / 1.8) * Math.PI * 0.5) * (slam.t < 1.8 ? 1 : Math.max(0, 1 - (slam.t - 1.8) / 0.35)) : sub;
      for (let j = 0; j < TSEG; j++) {
        const f = j / (TSEG - 1);
        const sway = Math.sin(this.t * 1.3 + k * 1.7 + f * 2.2) * 4 * f;
        const reach = out * f * 16;
        const x = bx + Math.cos(base) * reach + Math.cos(base + Math.PI / 2) * sway;
        const z = bz + Math.sin(base) * reach + Math.sin(base + Math.PI / 2) * sway;
        const y = heightAt(bx, bz) - 6 + rise * (Math.sin(f * Math.PI * (slam ? 0.5 : 0.85)) * (slam ? 26 : 15) + 6) - (1 - rise) * 10;
        const r = 2.6 * (1 - f * 0.7);
        _q.setFromAxisAngle(UP, base);
        _m.compose(_v.set(x, y, z), _q, _s.set(r, r, r * 1.5));
        this.tents.setMatrixAt(n++, _m);
      }
    }
    this.tents.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
  }
}
