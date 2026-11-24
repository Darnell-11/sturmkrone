// Der Tiefsee-Leviathan (Weltboss, Phase 4.3C, Modell neu in 4.3D): ein gigantisches Seeungeheuer der Außenmeere. Alles besteht aus Instanz-Netzen (wenige
// Zeichenaufrufe) und wird einmal beim Start gebaut und nur ein- und ausgeblendet (`activate`/`deactivate`): kein Aufbau mitten im Spiel.
//   • Rücken: 16 Körperglieder im Bogen, je vier Schuppenplatten (Rücken und Flanken) und ein Flossenstachel, der nach hinten geneigt steht
//   • Tentakel: acht Bögen, die aus dem Wasser steigen, sich wellenförmig wiegen und wieder eintauchen; Leuchtpunkte entlang jedes Bogens
//   • Kopf: Schädel, Kiefer, Hörnerkranz, zwei große glimmende Tiefsee-Augen und Leuchtorgane (Materialien einmal gebaut und geteilt)
// Angriffe: Tentakel-Schläge mit rotem Warnring auf dem Wasser (1,8 s Vorwarnung), Wellenstöße, die Schiffe wegdrücken, Abtauchen und Auftauchen.
// Kanonenkugeln treffen Kopf, Körper und Tentakel (`hitTest`); jeder Treffer nimmt höchstens `WORLD_BOSS_HIT_CAP` des Lebens (`damage`). Den Schaden am
// Spielerschiff deckelt der Gastgeber pro Salve (`capVolley`, data/balanceConfig.ts).
// Je Bild entsteht nichts Neues: Matrizen, Vektoren und Quaternionen sind Modulvariablen, Schläge liegen in einem festen Vorrat, es gibt keine Abschlüsse.
import {
  BufferGeometry, Color, ConeGeometry, CustomBlending, DoubleSide, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, OneFactor, Quaternion,
  RingGeometry, SphereGeometry, SrcAlphaFactor, Vector3, ZeroFactor, type Material, type Scene,
} from 'three';
import { toon } from '../render/toon';
import { disposeObject, markShared } from '../render/dispose';
import { sharedGeo } from '../render/geoCache';
import { capBossHit, dangerScale } from '../data/balanceConfig';
import type { Ship } from '../entities/ship/ship';

export interface LeviathanHooks {
  shake(a: number): void;
  splash(x: number, z: number, big: boolean): void;
  /** Schaden am Spielerschiff (der Gastgeber deckelt die Salve) und optional ein Stoß (m/s, Weltachsen) */
  hitShip(dmg: number, pushX: number, pushZ: number): void;
  roar(): void;
}

/** Körperglieder im Bogen, Schuppen je Glied, Tentakel und Glieder je Tentakel, Leuchtpunkte je Tentakel, gleichzeitige Warnringe */
const LEVIATHAN_SEGS = 16;
const LEVIATHAN_TSEG = 12;
export const LEVIATHAN = { SEGS: LEVIATHAN_SEGS, PLATES: 4, TENT: 8, TSEG: LEVIATHAN_TSEG, GLOWS: 3, TELE: 3 } as const;
const { SEGS, PLATES, TENT, TSEG, GLOWS, TELE } = LEVIATHAN;

const _m = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _a = new Vector3();
const _dir = new Vector3();
const _tan = new Vector3();
const UP = new Vector3(0, 1, 0);
/** Mittellinien von Körper und Tentakel (feste Felder, je Bild überschrieben) */
const _bp = new Float32Array(LEVIATHAN_SEGS * 3);
const _br = new Float32Array(LEVIATHAN_SEGS);
const _tp = new Float32Array(LEVIATHAN_TSEG * 3);
const KEEP_ALPHA = { blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor } as const;
/** Winkel der vier Schuppenplatten je Glied (rad, von oben zur Seite: − innen, + außen) */
const PLATE_ANGLE = [-0.95, -0.32, 0.32, 0.95] as const;

/** Geteilte Materialien und Netze: einmal gebaut, nie freigegeben (`markShared`) */
interface LevKit {
  skin: Material; scale: Material; belly: Material; bone: Material; tent: Material; dark: Material;
  eye: MeshBasicMaterial; photo: MeshBasicMaterial; horn: MeshBasicMaterial;
  sphere: BufferGeometry; plate: BufferGeometry; cone: BufferGeometry; small: BufferGeometry; eyeBall: BufferGeometry; jaw: BufferGeometry; horn3: BufferGeometry;
}
let kit: LevKit | null = null;
function levKit(): LevKit {
  if (kit) return kit;
  kit = {
    skin: markShared(toon('#3A6680')), scale: markShared(toon('#2C5468')), belly: markShared(toon('#8CC0C8')), bone: markShared(toon('#B9D4D6')),
    tent: markShared(toon('#46778C')), dark: markShared(toon('#10222C')),
    eye: markShared(new MeshBasicMaterial({ color: new Color(3.6, 1.6, 0.5), toneMapped: false })),
    photo: markShared(new MeshBasicMaterial({ color: new Color(0.5, 2.6, 3.4), toneMapped: false })),
    horn: markShared(new MeshBasicMaterial({ color: new Color(0.9, 2.4, 3.2), toneMapped: false })),
    sphere: sharedGeo('lev:sphere', () => new SphereGeometry(1, 16, 12)),
    plate: sharedGeo('lev:plate', () => new SphereGeometry(1, 8, 6)),
    cone: sharedGeo('lev:cone', () => new ConeGeometry(0.5, 1, 7)),
    small: sharedGeo('lev:small', () => new SphereGeometry(1, 8, 6)),
    eyeBall: sharedGeo('lev:eye', () => new SphereGeometry(1, 14, 10)),
    jaw: sharedGeo('lev:jaw', () => new ConeGeometry(5.2, 13, 10)),
    horn3: sharedGeo('lev:horn', () => new ConeGeometry(1.6, 9, 7)),
  };
  return kit;
}

/** Ein Tentakel-Schlag; die Einträge liegen im festen Vorrat `pool` und werden nur ein- und ausgeschaltet */
interface Slam { x: number; z: number; t: number; tent: number; hit: boolean; ring: Mesh; on: boolean }

export class LeviathanBoss {
  readonly group = new Group();
  private readonly body: InstancedMesh;
  private readonly plates: InstancedMesh;
  private readonly spikes: InstancedMesh;
  private readonly tents: InstancedMesh;
  private readonly glows: InstancedMesh;
  private readonly head = new Group();
  private readonly eyes: Mesh[] = [];
  private readonly rings: Mesh[] = [];
  private readonly wave: Mesh;
  /** Fester Vorrat der Schläge (einer je Warnring) und die gerade laufenden daraus */
  private readonly pool: Slam[] = [];
  private readonly slams: Slam[] = [];
  /** Schlag je Tentakel in diesem Bild (null = keiner), damit die Haltung ohne Suche auskommt */
  private readonly slamOf: (Slam | null)[] = [];
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
    const k = levKit();
    this.body = new InstancedMesh(k.sphere, k.skin, SEGS);
    this.plates = new InstancedMesh(k.plate, k.scale, SEGS * PLATES);
    this.spikes = new InstancedMesh(k.cone, k.bone, SEGS);
    this.tents = new InstancedMesh(k.sphere, k.tent, TENT * TSEG);
    this.glows = new InstancedMesh(k.small, k.photo, TENT * GLOWS);
    for (const im of [this.body, this.plates, this.spikes, this.tents, this.glows]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage); im.frustumCulled = false; im.castShadow = im !== this.glows; im.userData.noOutline = true;
    }
    // Kopf: Schädel, Kiefer, Hörnerkranz, große Augen mit Pupille, Leuchtorgane an Stirn und Kiefer
    const skull = new Mesh(k.sphere, k.skin);
    skull.scale.set(8, 6.2, 11.6);
    const jaw = new Mesh(k.jaw, k.belly);
    jaw.rotation.x = Math.PI / 2;
    jaw.position.set(0, -3, 9.4);
    this.head.add(skull, jaw);
    for (const s of [-1, 1]) {
      const eye = new Mesh(k.eyeBall, k.eye);
      eye.scale.setScalar(2);
      eye.position.set(s * 5.2, 2.6, 7.4);
      const pupil = new Mesh(k.eyeBall, k.dark);
      pupil.scale.set(0.55, 1.5, 0.5);
      pupil.position.set(s * 5.6, 2.6, 9.2);
      this.eyes.push(eye);
      this.head.add(eye, pupil);
      // drei Hörner je Seite: vorn niedrig, hinten hoch
      for (let h = 0; h < 3; h++) {
        const horn = new Mesh(k.horn3, h === 0 ? k.horn : k.bone);
        horn.position.set(s * (4.2 + h * 0.5), 6.4 - h * 0.7, -1.6 - h * 3.2);
        horn.scale.setScalar(1 - h * 0.18);
        horn.rotation.set(-0.6 - h * 0.12, 0, s * (0.45 + h * 0.12));
        this.head.add(horn);
      }
      // Leuchtorgane entlang des Kiefers
      for (let p = 0; p < 3; p++) {
        const ph = new Mesh(k.small, k.photo);
        ph.scale.setScalar(0.55 - p * 0.08);
        ph.position.set(s * (3.2 - p * 0.5), -2.4 + p * 0.2, 6.6 + p * 3.4);
        this.head.add(ph);
      }
    }
    this.head.traverse((o) => { o.castShadow = o !== this.head; o.userData.noOutline = true; });
    const ringMat = () => new MeshBasicMaterial({ color: new Color(2.6, 0.25, 0.15), transparent: true, depthWrite: false, side: DoubleSide, fog: false, toneMapped: false, ...KEEP_ALPHA });
    for (let i = 0; i < TELE; i++) {
      const r = new Mesh(new RingGeometry(0.78, 1, 48).rotateX(-Math.PI / 2), ringMat());
      r.visible = false; r.renderOrder = 4; r.userData.noOutline = true;
      this.rings.push(r);
      this.pool.push({ x: 0, z: 0, t: 0, tent: 0, hit: false, ring: r, on: false });
      this.group.add(r);
    }
    for (let i = 0; i < TENT; i++) this.slamOf.push(null);
    this.wave = new Mesh(new RingGeometry(0.975, 1, 128).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: new Color(0.95, 1.15, 1.3), transparent: true, depthWrite: false, side: DoubleSide, fog: false, toneMapped: false, ...KEEP_ALPHA }));
    this.wave.visible = false; this.wave.renderOrder = 4; this.wave.userData.noOutline = true;
    this.group.add(this.body, this.plates, this.spikes, this.tents, this.glows, this.head, this.wave);
    this.group.name = 'leviathan';
    scene.add(this.group);
  }

  get alive() { return this.hp > 0; }
  get frac() { return this.hp / Math.max(1, this.maxHp); }
  get headPos() { return this.head.position; }
  /** Aufgetaucht genug, um getroffen zu werden und anzugreifen */
  get surfaced() { return this.sub > 0.5; }

  private static park(im: InstancedMesh, at: Vector3) {
    _m.makeTranslation(at.x, -3000, at.z);
    for (let i = 0; i < im.count; i++) im.setMatrixAt(i, _m);
    im.instanceMatrix.needsUpdate = true;
  }

  /** Beim Laden einmal zeigen, damit die Shader vorübersetzt werden */
  prewarm(at: Vector3) {
    this.group.visible = true;
    this.group.position.set(0, 0, 0);
    this.head.position.set(at.x, -3000, at.z);
    for (const im of [this.body, this.plates, this.spikes, this.tents, this.glows]) LeviathanBoss.park(im, at);
    for (const r of this.rings) { r.visible = true; r.position.set(at.x, -3000, at.z); }
    this.wave.visible = true; this.wave.position.set(at.x, -3000, at.z);
  }

  private clearSlams() {
    for (let i = 0; i < this.pool.length; i++) { this.pool[i].on = false; this.pool[i].ring.visible = false; }
    this.slams.length = 0;
  }

  /** Erscheinen lassen (Lage, Leben, Stufe für den Schaden) */
  activate(x: number, z: number, maxHp: number, frac: number, level: number) {
    this.active = true;
    this.x = x; this.z = z;
    this.maxHp = Math.max(1, maxHp);
    this.hp = this.maxHp * Math.max(0, Math.min(1, frac));
    this.dmgBase = 9 * dangerScale(level).dmg;
    this.sub = 0; this.diving = 0; this.slamT = 4; this.waveT = 9; this.waveR = -1; this.diveT = 18;
    // nach dem Vorwärmen (alles sichtbar) sind Warnringe und Welle frei
    this.clearSlams();
    this.wave.visible = false;
    this.group.visible = true;
  }

  /** Abtauchen ohne Kampf (die Seewelt baut das Ereignis zu Daten ab) */
  deactivate() {
    this.active = false;
    this.group.visible = false;
    this.clearSlams();
    this.wave.visible = false;
  }

  /** Trifft eine Kanonenkugel den Körper? (nur aufgetaucht) */
  hitTest(p: Vector3): boolean {
    if (!this.active || !this.alive || this.sub < 0.45) return false;
    if (this.head.position.distanceTo(p) < 12) return true;
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

  /** Eine Slam-Stelle aus dem Vorrat nehmen (kein neues Objekt); null, wenn alle Ringe belegt sind */
  private takeSlam(): Slam | null {
    for (let i = 0; i < this.pool.length; i++) if (!this.pool[i].on) return this.pool[i];
    return null;
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
    let tx = goal ? goal.x : this.x, tz = goal ? goal.z : this.z, speed = 3;
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
      if (this.slamT <= 0) {
        const sl = this.takeSlam();
        if (sl) {
          this.slamT = (this.frac < 0.4 ? 2.6 : 3.8) + Math.random() * 1.4;
          const lead = 1.8;
          sl.x = ship.x + Math.sin(ship.heading) * ship.speed * lead + (Math.random() - 0.5) * 8;
          sl.z = ship.z + Math.cos(ship.heading) * ship.speed * lead + (Math.random() - 0.5) * 8;
          sl.t = 0; sl.tent = this.slams.length % TENT; sl.hit = false; sl.on = true; sl.ring.visible = true;
          this.slams.push(sl);
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
      if (s.t > 2.6) {
        s.ring.visible = false; s.on = false;
        // Abtausch mit dem letzten Eintrag: nichts wird neu angelegt
        const last = this.slams.length - 1;
        if (i !== last) this.slams[i] = this.slams[last];
        this.slams.length = last;
      }
    }
    this.pose(heightAt, ship);
    this.glimmer();
  }

  /** Augen und Leuchtorgane glimmen: Helligkeit in den geteilten Materialien (Farbe wird gesetzt, nichts angelegt) */
  private glimmer() {
    const k = levKit();
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.3);
    const rage = this.alive ? 1 + (1 - this.frac) * 0.7 : 0.25;
    const hurt = this.flash > 0 ? 1.8 : 1;
    k.eye.color.setRGB((2.4 + pulse * 1.6) * rage * hurt, (1.0 + pulse * 0.9) * rage * hurt, 0.3 * rage);
    const p2 = 0.5 + 0.5 * Math.sin(this.t * 1.6 + 1.3);
    k.photo.color.setRGB(0.3 + p2 * 0.5, 1.8 + p2 * 1.4, 2.6 + p2 * 1.2);
  }

  /** Körper als Bogen mit Schuppen und Stacheln, Kopf zum Schiff, Tentakel als wiegende Bögen (einer je Schlag hebt sich über dem Warnring und fällt) */
  private pose(heightAt: (x: number, z: number) => number, ship: Ship | null) {
    this.ang += 0.006 + (this.alive ? 0.004 : 0);
    const R = 46;
    const sub = this.sub;
    // 1. Mittellinie des Körpers (Punkte und Radien in festen Feldern)
    for (let i = 0; i < SEGS; i++) {
      const a = this.ang - i * 0.17;
      const x = this.x + Math.cos(a) * R, z = this.z + Math.sin(a) * R;
      const arch = Math.sin((i / (SEGS - 1)) * Math.PI) * 13 + Math.sin(this.t * 1.6 + i * 0.6) * 1.2;
      _bp[i * 3] = x; _bp[i * 3 + 1] = heightAt(x, z) + sub * (arch + 1) - (1 - sub) * 18; _bp[i * 3 + 2] = z;
      _br[i] = 6.4 - i * 0.26;
    }
    // 2. Glieder entlang der Mittellinie gestreckt (keine Lücken), darauf Schuppen und Stacheln
    for (let i = 0; i < SEGS; i++) {
      const x = _bp[i * 3], y = _bp[i * 3 + 1], z = _bp[i * 3 + 2], r = _br[i];
      const j0 = i > 0 ? i - 1 : i, j1 = i < SEGS - 1 ? i + 1 : i;
      _tan.set(_bp[j1 * 3] - _bp[j0 * 3], _bp[j1 * 3 + 1] - _bp[j0 * 3 + 1], _bp[j1 * 3 + 2] - _bp[j0 * 3 + 2]);
      const span = _tan.length() / (j1 - j0);
      _tan.normalize();
      _q.setFromUnitVectors(UP, _tan);
      _m.compose(_v.set(x, y, z), _q, _s.set(r, Math.max(r * 1.05, span * 0.78), r * 0.92));
      this.body.setMatrixAt(i, _m);
      // nach außen (waagerecht, quer zur Körperrichtung)
      _a.set(_tan.z, 0, -_tan.x).normalize();
      if (_a.x * (x - this.x) + _a.z * (z - this.z) < 0) _a.multiplyScalar(-1);
      // Schuppenplatten rund um den Rücken: je eine Platte pro Winkel, flach auf der Haut
      for (let p = 0; p < PLATES; p++) {
        const th = PLATE_ANGLE[p];
        _dir.set(_a.x * Math.sin(th), Math.cos(th), _a.z * Math.sin(th));
        _q.setFromUnitVectors(UP, _dir);
        _m.compose(_v.set(x + _dir.x * r * 0.9, y + _dir.y * r * 0.84, z + _dir.z * r * 0.9), _q, _s.set(r * 0.66, r * 0.18, Math.max(r * 0.5, span * 0.42)));
        this.plates.setMatrixAt(i * PLATES + p, _m);
      }
      // Flossenstachel auf dem Kamm: nach oben und leicht nach hinten, größer in der Mitte
      _dir.set(0, 1, 0).addScaledVector(_tan, 0.38).normalize();
      _q.setFromUnitVectors(UP, _dir);
      const hh = r * (0.9 + Math.sin((i / (SEGS - 1)) * Math.PI) * 0.7);
      const lift = r * 0.88 + hh * 0.4;
      _m.compose(_v.set(x + _dir.x * lift, y + _dir.y * lift, z + _dir.z * lift), _q, _s.set(r * 0.5, hh, r * 0.5));
      this.spikes.setMatrixAt(i, _m);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.plates.instanceMatrix.needsUpdate = true;
    this.spikes.instanceMatrix.needsUpdate = true;
    const ha = this.ang + 0.24;
    const hx = this.x + Math.cos(ha) * R, hz = this.z + Math.sin(ha) * R;
    this.head.position.set(hx, heightAt(hx, hz) + sub * 12 - (1 - sub) * 22 + Math.sin(this.t * 1.5) * 1, hz);
    const look = ship && sub > 0.3 ? Math.atan2(ship.x - hx, ship.z - hz) : Math.atan2(-Math.sin(ha), Math.cos(ha));
    this.head.rotation.set(-0.12, look, 0);
    this.head.scale.setScalar(this.flash > 0 ? 1.05 : 1);
    // Tentakel: acht Bögen um den Körper; jeder steigt aus dem Wasser, wölbt sich nach außen und taucht wieder ein; Welle läuft von der Wurzel zur Spitze
    for (let i = 0; i < TENT; i++) this.slamOf[i] = null;
    for (let i = 0; i < this.slams.length; i++) this.slamOf[this.slams[i].tent] = this.slams[i];
    let n = 0, g = 0;
    for (let k = 0; k < TENT; k++) {
      const slam = this.slamOf[k];
      const base = this.ang * 0.5 + (k / TENT) * Math.PI * 2;
      const cb = Math.cos(base), sb = Math.sin(base);
      const bx = slam ? slam.x : this.x + cb * (26 + (k % 2) * 9), bz = slam ? slam.z : this.z + sb * (26 + (k % 2) * 9);
      const out = slam ? 0 : 1;
      const rise = slam ? Math.sin(Math.min(1, slam.t / 1.8) * Math.PI * 0.5) * (slam.t < 1.8 ? 1 : Math.max(0, 1 - (slam.t - 1.8) / 0.35)) : sub;
      const arcH = 15 + (k % 3) * 3.2, arcLen = 17 + (k % 4) * 2.4;
      const ground = heightAt(bx, bz);
      // Punkte des Bogens
      for (let j = 0; j < TSEG; j++) {
        const f = j / (TSEG - 1);
        // Seitenwiegen und senkrechte Welle: je weiter außen, desto stärker
        const sway = Math.sin(this.t * 1.3 + k * 1.7 + f * 5.2) * (1.5 + 4 * f);
        const rip = Math.sin(this.t * 2.2 - f * 6.5 + k) * 1.5 * f;
        const reach = out * f * arcLen;
        _tp[j * 3] = bx + cb * reach - sb * sway;
        _tp[j * 3 + 1] = ground - 6 + rise * (Math.sin(f * Math.PI * (slam ? 0.5 : 1)) * (slam ? 26 : arcH) + 6 + rip * (slam ? 0 : 1)) - (1 - rise) * 10;
        _tp[j * 3 + 2] = bz + sb * reach + cb * sway;
      }
      // Glieder entlang des Bogens gestreckt, Leuchtpunkte bei 30 %, 55 % und 80 %
      for (let j = 0; j < TSEG; j++) {
        const f = j / (TSEG - 1);
        const j0 = j > 0 ? j - 1 : j, j1 = j < TSEG - 1 ? j + 1 : j;
        _tan.set(_tp[j1 * 3] - _tp[j0 * 3], _tp[j1 * 3 + 1] - _tp[j0 * 3 + 1], _tp[j1 * 3 + 2] - _tp[j0 * 3 + 2]);
        const span = _tan.length() / (j1 - j0);
        if (span > 1e-4) _tan.multiplyScalar(1 / (span * (j1 - j0))); else _tan.set(0, 1, 0);
        _q2.setFromUnitVectors(UP, _tan);
        const r = 2.5 * (1 - f * 0.72);
        const x = _tp[j * 3], y = _tp[j * 3 + 1], z = _tp[j * 3 + 2];
        _m.compose(_v.set(x, y, z), _q2, _s.set(r, Math.max(r, span * 0.68), r));
        this.tents.setMatrixAt(n++, _m);
        if (j === 3 || j === 6 || j === 9) {
          const gl = 0.5 + 0.5 * Math.sin(this.t * 2.6 + k * 0.9 + j);
          const gr = (0.45 + 0.25 * gl) * (1 - f * 0.4);
          _m.compose(_v.set(x, y + r * 0.85, z), _q2.identity(), _s.set(gr, gr, gr));
          this.glows.setMatrixAt(g++, _m);
        }
      }
    }
    this.tents.instanceMatrix.needsUpdate = true;
    this.glows.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    // geteilte Netze und Materialien bleiben (markShared); Warnringe, Welle und die Instanzpuffer werden freigegeben
    disposeObject(this.group);
  }
}
