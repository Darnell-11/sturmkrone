import { audio } from '../audio/audio';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  SrcAlphaFactor,
  ZeroFactor,
  Line,
  LineBasicMaterial,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShaderMaterial,
  PlaneGeometry,
  CanvasTexture,
  SphereGeometry,
  Vector3,
  type Camera,
  type Scene,
} from 'three';
import type { CombatFx } from '../combat/fx';
import { AMMO, DEFAULT_SHIP_LOOK, HULL_COLORS, SAIL_COLORS, SHIP_CLASSES, type AmmoId, type NavalRole } from '../data/ships';
import { WORLD_RADIUS } from '../data/world';
import { Ship, type SeaEnv } from '../entities/ship/ship';
import { toon } from '../render/toon';
import type { CombatOverlay } from '../ui/combatOverlay';
import type { IslandGround } from '../world/islandGround';
import type { ParticleSystem } from '../world/particles';

const G = 9.8;
const BALL_SPEED = 46;

export interface EnemyShip {
  ship: Ship;
  role: NavalRole;
  level: number;
  state: 'patrol' | 'engage' | 'flee';
  wander: { x: number; z: number };
  aiT: number;
  name?: string;
  companion?: boolean;
  /** Legende der Rangliste */
  legendId?: string;
  /** Geisterschiff (nur nachts im Nebelarchipel) */
  ghost?: boolean;
  /** Umkreisungsrichtung und Nachladezeit (KI wie in 1.0) */
  orbit?: number;
  reload?: number;
  /** Hinweis „jetzt entern“ schon gezeigt */
  weakNoted?: boolean;
  /** Übungsschiff aus der Einführung (wie in 1.0): angeschlagen, schießt schwächer */
  training?: boolean;
}

/** Verlauf für Faji-Wellen: hell in der Mitte, mit Schlieren in Laufrichtung */
const WAVE_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  const v = g.createLinearGradient(0, 0, 0, 64);
  v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(0.5, 'rgba(255,255,255,1)'); v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v; g.fillRect(0, 0, 128, 64);
  g.globalCompositeOperation = 'destination-in';
  const h = g.createLinearGradient(0, 0, 128, 0);
  h.addColorStop(0, 'rgba(255,255,255,0.15)'); h.addColorStop(0.85, 'rgba(255,255,255,1)'); h.addColorStop(1, 'rgba(255,255,255,0.6)');
  g.fillStyle = h; g.fillRect(0, 0, 128, 64);
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
  for (let i = 0; i < 6; i++) { const y = 18 + i * 5.5; g.beginPath(); g.moveTo(10 + i * 9, y); g.lineTo(120, y); g.stroke(); }
  return new CanvasTexture(c);
})();

interface Ball { mesh: Mesh; vel: Vector3; owner: Ship; dmg: number; ammo: AmmoId; life: number }
interface Crate { mesh: Mesh; x: number; z: number; gold: number; shard: boolean; t: number }

export interface NavalHooks {
  shake(a: number): void;
  hitstop(t: number): void;
  message(t: string): void;
  sunk(e: EnemyShip): void;
  loot(gold: number, shard: boolean): void;
}


/** Feindschiffe, Kanonenkugeln, Beute und Faji auf See. */
export class NavalSystem {
  enemies: EnemyShip[] = [];
  player: Ship | null = null;
  playerFaction: 'pirat' | 'marine' = 'pirat';
  playerLevel = 1;
  playerRank = 0;
  /** Zusätzliches Ziel für Kanonenkugeln (Seeungeheuer) */
  extraTarget: { hitTest(p: Vector3): boolean; damage(n: number): void } | null = null;
  /** Kanonenschaden des Spielers */
  canDmg = 14;
  reloadMult = 1;
  private balls: Ball[] = [];
  private crates: Crate[] = [];
  private spawnT = 3;
  private ballGeo = new SphereGeometry(0.3, 8, 6);
  // Zielfächer wie in 1.0: hell links und rechts, rot, sobald ein Gegner darin ist
  private fanGroup = new Group();
  private fans: Mesh[] = [];
  private fanMats = [0, 1].map(() => new ShaderMaterial({
    uniforms: { uColor: { value: new Color(0xffffff) }, uOpacity: { value: 0.06 }, uIn: { value: 8 }, uOut: { value: 72 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // Weicher Verlauf nach außen, heller Rand – wie ein Lichtkegel auf dem Wasser
    fragmentShader: 'uniform vec3 uColor; uniform float uOpacity, uIn, uOut; varying vec3 vP; void main(){ float t = clamp((length(vP.xz) - uIn) / (uOut - uIn), 0.0, 1.0); float a = smoothstep(0.0, 0.25, t) * (1.0 - smoothstep(0.82, 1.0, t)) * (0.4 + 0.6 * t) * uOpacity; gl_FragColor = vec4(uColor, a); }',
    transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
    // Alpha-Kanal nicht verändern: er markiert Wasser für Konturen und Schattierung
    blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
  }));
  private fanRange = 0;
  private rings = [0, 1].map(() => {
    const m = new Mesh(new RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide, fog: false, blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor }));
    m.visible = false;
    m.renderOrder = 4;
    return m;
  });
  private aimT = 0;
  /** Sichtbare Faji-Wellen vom eigenen Schiff zum Ziel (wie seaWave in 1.0) */
  private waves: { mesh: Mesh; t: number; max: number }[] = [];
  private trainCd = 0;

  constructor(private scene: Scene, private env: SeaEnv, private fx: CombatFx, private overlay: CombatOverlay, private spray: ParticleSystem, private sparks: ParticleSystem, private ground: IslandGround, private hooks: NavalHooks) {
    this.fanGroup.renderOrder = 3;
    scene.add(this.fanGroup, ...this.rings);
  }

  // ---------- Zielhilfe (wie in 1.0) ----------

  /** Nächster Gegner im Feuerfächer einer Seite (side +1 links, −1 rechts) */
  sideTarget(side: number, range: number): Ship | null {
    const p = this.player;
    if (!p) return null;
    const dir = p.heading + side * Math.PI / 2;
    let best: Ship | null = null, bd = range * 1.08;
    for (const e of this.enemies) {
      const s = e.ship;
      if (e.companion || !s.alive || s.sinking) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < 6 || d > bd) continue;
      const a = ((Math.atan2(s.x - p.x, s.z - p.z) - dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (Math.abs(a) > 0.62) continue;
      bd = d; best = s;
    }
    return best;
  }

  /** Liegt gerade ein Gegner im Feuerfächer dieser Seite? (für die Knöpfe „Links“/„Rechts“) */
  inFan(side: number, range: number) { return !!this.sideTarget(side, range); }

  /**
   * Übungsschiff für die Einführung: taucht vor dem Bug auf, wenn die aktuelle Aufgabe Versenken
   * oder Entern verlangt. Zum Entern ist es schon angeschlagen. Gibt das Schiff zurück, wenn es neu ist.
   */
  ensureTraining(board: boolean): EnemyShip | null {
    const p = this.player;
    if (!p || this.trainCd > 0 || this.enemies.some((e) => e.training && e.ship.alive)) return null;
    this.trainCd = 4;
    for (let tries = 0; tries < 10; tries++) {
      const a = p.heading + (Math.random() - 0.5) * 1.2;
      const x = p.x + Math.sin(a) * 150, z = p.z + Math.cos(a) * 150;
      if (Math.hypot(x, z) > WORLD_RADIUS - 150 || this.ground.islandAt(x, z, 40)) continue;
      const foe: 'pirat' | 'marine' = this.playerFaction === 'pirat' ? 'marine' : 'pirat';
      const ship = new Ship(this.scene, 0, DEFAULT_SHIP_LOOK(foe), foe);
      ship.x = x; ship.z = z; ship.heading = Math.atan2(p.x - x, p.z - z) + Math.PI / 2;
      ship.prev = { x, z, heading: ship.heading };
      ship.hull = ship.maxHull * (board ? 0.3 : 0.7);
      const e: EnemyShip = { ship, role: 'patrouille', level: 1, state: 'patrol', wander: { x, z }, aiT: 0, name: 'Übungsschiff', training: true };
      this.enemies.push(e);
      return e;
    }
    return null;
  }

  /** Fächer und Zielringe jeden Frame nachführen */
  updateAim(dt: number, show: boolean, range: number, readyL: boolean, readyR: boolean) {
    const p = this.player;
    this.aimT += dt;
    this.fanGroup.visible = show && !!p;
    for (const r of this.rings) r.visible = false;
    if (!show || !p) return;
    if (Math.abs(range - this.fanRange) > 0.5) {
      this.fanRange = range;
      for (const f of this.fans) { this.fanGroup.remove(f); f.geometry.dispose(); }
      this.fans = [1, -1].map((s, i) => {
        const start = s > 0 ? -0.62 : Math.PI - 0.62;
        const inner = p.cls.W * 0.6 + 4;
        this.fanMats[i].uniforms.uIn.value = inner;
        this.fanMats[i].uniforms.uOut.value = range;
        const m = new Mesh(new RingGeometry(inner, range, 40, 1, start, 1.24).rotateX(-Math.PI / 2), this.fanMats[i]);
        m.renderOrder = 3;
        this.fanGroup.add(m);
        return m;
      });
    }
    this.fanGroup.position.set(p.x, 1.15, p.z);
    this.fanGroup.rotation.y = p.heading;
    const near = this.enemies.some((e) => !e.companion && e.ship.alive && e.role !== 'haendler' && Math.hypot(e.ship.x - p.x, e.ship.z - p.z) < range * 1.8);
    [1, -1].forEach((side, i) => {
      const t = this.sideTarget(side, range);
      const m = this.fanMats[i];
      const ready = side > 0 ? readyL : readyR;
      if (t) {
        m.uniforms.uColor.value.setHex(0xff6a4a);
        m.uniforms.uOpacity.value = ready ? 0.15 + Math.sin(this.aimT * 8) * 0.04 : 0.07;
        const ring = this.rings[i];
        ring.visible = true;
        ring.position.set(t.x, 1.5, t.z);
        ring.scale.setScalar(t.cls.L * 0.7 + Math.sin(this.aimT * 6) * 0.4);
      } else {
        m.uniforms.uColor.value.setHex(0xffffff);
        m.uniforms.uOpacity.value = near ? 0.06 : 0;
      }
    });
  }

  /** Lebensbalken über beschädigten Feindschiffen (wie in 1.0) */
  private barPos = new Vector3();
  updateBars(camera: Camera, show: boolean) {
    const p = this.player;
    for (const e of this.enemies) {
      const s = e.ship;
      const vis = show && !e.companion && s.alive && !s.sinking && s.hull < s.maxHull && !!p && Math.hypot(s.x - p.x, s.z - p.z) < 320;
      this.barPos.set(s.x, s.model.deckY + s.cls.mh + 3, s.z);
      this.overlay.setBar(e, vis ? this.barPos : null, vis ? s.hull / s.maxHull : -1, e.role === 'legende' || !!e.ghost, camera, vis && this.isWeak(e) ? 'ENTERN' : '');
    }
  }

  /** Spieler-Breitseite: zielt automatisch auf den Gegner im Fächer (mit Vorhalt) */
  playerBroadside(ship: Ship, side: number, range: number, dmg: number, ammo: AmmoId) {
    this.broadside(ship, side, range, dmg, ammo, this.sideTarget(side, range));
    this.hooks.shake(0.3);
  }

  // ---------- Feuern ----------

  /** Breitseite: alle Kanonen einer Seite; mit Ziel wird Vorhalt berechnet */
  broadside(ship: Ship, side: number, range: number, dmg: number, ammo: AmmoId, target: Ship | null = null) {
    const muzzles = side > 0 ? ship.model.muzzlesL : ship.model.muzzlesR;
    audio.play('broadside', ship === this.player ? 1 : 0.8, { x: ship.x, z: ship.z });
    const left = new Vector3(Math.cos(ship.heading), 0, -Math.sin(ship.heading)).multiplyScalar(side);
    const speed = BALL_SPEED * AMMO[ammo].speed;
    const n = muzzles.length;
    muzzles.forEach((m, i) => {
      const w = m.clone().applyMatrix4(ship.model.group.matrixWorld);
      let dir: Vector3, r: number, carry = 1;
      if (target) {
        const T = Math.hypot(target.x - w.x, target.z - w.z) / speed;
        const lo = n > 1 ? (i / (n - 1) - 0.5) * target.cls.L * 0.6 : 0;
        const ex = target.x + Math.sin(target.heading) * (target.speed * T + lo);
        const ez = target.z + Math.cos(target.heading) * (target.speed * T + lo);
        dir = new Vector3(ex - w.x, 0, ez - w.z);
        r = dir.length() * (0.97 + Math.random() * 0.06);
        dir.normalize().applyAxisAngle(new Vector3(0, 1, 0), (Math.random() - 0.5) * 0.03);
        carry = 0;
      } else {
        dir = left.clone().applyAxisAngle(new Vector3(0, 1, 0), (Math.random() - 0.5) * 0.08);
        r = range * AMMO[ammo].range * (0.92 + Math.random() * 0.1);
      }
      const t = r / speed;
      const vel = dir.multiplyScalar(speed).add(new Vector3(Math.sin(ship.heading) * ship.speed * 0.5 * carry, 0.5 * G * t - (w.y - 0.6) / t, Math.cos(ship.heading) * ship.speed * 0.5 * carry));
      setTimeout(() => this.spawnBall(w, vel, ship, dmg, ammo), i * 40);
    });
  }

  /** Bugkanone nach vorn */
  bowShot(ship: Ship, dmg: number, ammo: AmmoId) {
    const f = new Vector3(Math.sin(ship.heading), 0, Math.cos(ship.heading));
    audio.play('boom', 1, { x: ship.x, z: ship.z });
    const from = new Vector3(ship.x, ship.model.deckY + 0.6, ship.z).addScaledVector(f, ship.cls.L / 2);
    this.spawnBall(from, f.multiplyScalar(BALL_SPEED + ship.speed).setY(6), ship, dmg * 0.8, ammo);
  }

  private spawnBall(pos: Vector3, vel: Vector3, owner: Ship, dmg: number, ammo: AmmoId) {
    const mat = ammo === 'brand' ? new MeshBasicMaterial({ color: new Color(4, 1.6, 0.4) }) : toon({ color: AMMO[ammo].color, spec: 1 });
    const m = new Mesh(this.ballGeo, mat);
    m.position.copy(pos);
    this.scene.add(m);
    this.balls.push({ mesh: m, vel, owner, dmg, ammo, life: 6 });
    // Mündungsfeuer
    this.sparks.emit(5, pos.x, pos.y, pos.z, { speed: 4, up: 1, life: 0.35, color: new Color(3.5, 1.6, 0.4), gravity: 0, spread: 0.3 });
    this.fx.hit(pos, 'punch', '#FFB45A');
    this.spray.emit(10, pos.x, pos.y, pos.z, { speed: 2, up: 1.5, life: 1.2, color: new Color(0.75, 0.75, 0.78), gravity: -0.5, spread: 1 });
    if (owner === this.player) this.hooks.shake(0.18);
  }

  // ---------- Spawnen ----------

  private zoneLevel(x: number, z: number) { return Math.max(1, Math.min(10, 1 + Math.floor(Math.hypot(x, z) / 260))); }

  private spawnEnemy(px: number, pz: number) {
    const lvl = Math.max(this.zoneLevel(px, pz), Math.floor(this.playerLevel * 0.8));
    const roll = Math.random();
    const role: NavalRole = roll < 0.42 ? 'patrouille' : roll < 0.67 ? 'jaeger' : 'haendler';
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = 240 + Math.random() * 80;
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (Math.hypot(x, z) > WORLD_RADIUS - 150 || this.ground.islandAt(x, z, 40)) continue;
      const foe: 'pirat' | 'marine' = role === 'haendler' ? (Math.random() < 0.5 ? 'pirat' : 'marine') : this.playerFaction === 'pirat' ? 'marine' : 'pirat';
      const tier = Math.max(0, Math.min(5, Math.floor(lvl / 2) + Math.floor(Math.random() * 2) - (role === 'haendler' ? 0 : 1)));
      const look = DEFAULT_SHIP_LOOK(foe);
      if (role === 'haendler') { look.hull = HULL_COLORS[Math.floor(Math.random() * 3)]; look.sail = SAIL_COLORS[Math.floor(Math.random() * 3)]; look.flag = 'anker'; look.flagColor = '#2F6E4F'; look.figurehead = 'keine'; }
      const ship = new Ship(this.scene, tier, look, foe);
      ship.x = x; ship.z = z; ship.heading = Math.random() * Math.PI * 2;
      ship.prev = { x, z, heading: ship.heading };
      this.enemies.push({ ship, role, level: lvl, state: 'patrol', wander: { x, z }, aiT: 0 });
      return;
    }
  }

  /** Legende der Rangliste in ihrem Heimatgewässer auftauchen lassen */
  spawnLegend(l: { id: string; n: string; lvl: number; tier: number; col: string; faction: 'pirat' | 'marine' }, x: number, z: number, levelBonus = 0) {
    if (this.enemies.some((e) => e.legendId === l.id && e.ship.alive)) return null;
    const look = DEFAULT_SHIP_LOOK(l.faction);
    look.sail = l.col; look.flagColor = l.col; look.lanterns = true;
    const ship = new Ship(this.scene, Math.min(6, l.tier + 1), look, l.faction, 300 + l.lvl * 40);
    ship.x = x; ship.z = z;
    const p = this.player;
    ship.heading = p ? Math.atan2(p.x - x, p.z - z) : 0;
    ship.prev = { x, z, heading: ship.heading };
    const e: EnemyShip = { ship, role: 'legende', level: l.lvl + levelBonus, state: 'engage', wander: { x, z }, aiT: 0, name: l.n, legendId: l.id };
    this.enemies.push(e);
    return e;
  }

  /** Geisterschiff: durchscheinend, leuchtend, jagt den Spieler */
  spawnGhost(px: number, pz: number, level: number) {
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2, d = 220 + Math.random() * 80;
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (this.ground.islandAt(x, z, 40)) continue;
      const look = DEFAULT_SHIP_LOOK('pirat');
      look.hull = '#2A3A3A'; look.sail = '#BFEFE4'; look.stripe = '#7FE0C8'; look.flagColor = '#1E1A20'; look.lanterns = true;
      const ship = new Ship(this.scene, Math.min(4, 1 + Math.floor(level / 3)), look, 'pirat', 120);
      ship.model.group.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh || Array.isArray(m.material)) return;
        const mat = m.material.clone() as MeshBasicMaterial;
        mat.transparent = true; mat.opacity = 0.62; mat.depthWrite = false;
        if ('emissive' in mat) (mat as unknown as { emissive: Color }).emissive.set('#1E5A50');
        m.material = mat;
      });
      ship.x = x; ship.z = z; ship.heading = Math.atan2(px - x, pz - z);
      ship.prev = { x, z, heading: ship.heading };
      this.enemies.push({ ship, role: 'jaeger', level, state: 'engage', wander: { x, z }, aiT: 0, name: 'Geisterschiff', ghost: true });
      this.spray.emit(60, x, 1, z, { speed: 3, up: 4, life: 2.5, color: new Color(0.6, 1, 0.9), gravity: -0.5, spread: 8 });
      return true;
    }
    return false;
  }

  /** Bei Tagesanbruch lösen sich Geisterschiffe auf */
  clearGhosts() {
    for (const e of this.enemies) if (e.ghost && e.ship.alive) {
      this.spray.emit(60, e.ship.x, 2, e.ship.z, { speed: 3, up: 5, life: 2.5, color: new Color(0.6, 1, 0.9), gravity: -0.5, spread: 8 });
      e.ship.dispose();
      e.ship.sinking = 99;
    }
  }

  /** Begleitschiffe ab höheren Rängen */
  private ensureCompanions() {
    const want = this.playerRank >= 8 ? 2 : this.playerRank >= 5 ? 1 : 0;
    const have = this.enemies.filter((e) => e.companion && e.ship.alive).length;
    const p = this.player;
    if (!p || have >= want) return;
    const look = { ...p.look };
    const ship = new Ship(this.scene, Math.max(0, Math.min(3, Math.floor(this.playerRank / 3))), look, this.playerFaction);
    ship.x = p.x - Math.sin(p.heading) * 40 + (have ? 20 : -20);
    ship.z = p.z - Math.cos(p.heading) * 40;
    ship.heading = p.heading;
    ship.prev = { x: ship.x, z: ship.z, heading: ship.heading };
    this.enemies.push({ ship, role: 'patrouille', level: this.playerLevel, state: 'engage', wander: { x: 0, z: 0 }, aiT: 0, companion: true });
    this.hooks.message('Ein Begleitschiff schließt sich deiner Flotte an!');
  }

  // ---------- Schleife ----------

  update(dt: number, active: boolean) {
    const p = this.player;
    this.trainCd -= dt;
    if (p && active) {
      this.spawnT -= dt;
      const hostile = this.enemies.filter((e) => !e.companion && e.ship.alive).length;
      const cap = Math.min(4, 2 + Math.floor(this.zoneLevel(p.x, p.z) / 3));
      if (this.spawnT <= 0 && hostile < cap) { this.spawnT = 10 + Math.random() * 6; this.spawnEnemy(p.x, p.z); }
      this.ensureCompanions();
    }
    for (const e of this.enemies) this.ai(e, dt);
    // Weit entfernte entfernen, gesunkene aufräumen
    for (const e of this.enemies) {
      if (e.ship.sinking > 7 || (p && !e.companion && Math.hypot(e.ship.x - p.x, e.ship.z - p.z) > 1200)) { e.ship.dispose(); this.overlay.setBar(e, null, -1, false, null as unknown as Camera); }
    }
    this.enemies = this.enemies.filter((e) => e.ship.sinking <= 7 && !(p && !e.companion && Math.hypot(e.ship.x - p.x, e.ship.z - p.z) > 1200));
    this.updateBalls(dt);
    this.updateCrates(dt);
    for (const w of this.waves) {
      w.t += dt;
      const k = w.t / w.max;
      (w.mesh.material as MeshBasicMaterial).opacity = Math.max(0, 1 - k) * 0.95;
      w.mesh.scale.y = 1 + k * 0.6;
      if (k >= 1) { w.mesh.removeFromParent(); w.mesh.geometry.dispose(); (w.mesh.material as MeshBasicMaterial).dispose(); }
    }
    this.waves = this.waves.filter((w) => w.t < w.max);
  }

  /** Leuchtende Welle vom eigenen Schiff zum Ziel, mit Gischt am Einschlag */
  private seaWave(t: Ship, color: string, big = false) {
    const p = this.player;
    if (!p) return;
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    const m = new Mesh(new PlaneGeometry(d, big ? 22 : 9).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: WAVE_TEX, color: new Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.95, depthWrite: false, side: DoubleSide, fog: false, blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor }));
    m.position.set(p.x + dx / 2, 1.6, p.z + dz / 2);
    m.rotation.y = Math.atan2(-dz, dx);
    m.renderOrder = 6;
    this.scene.add(m);
    this.waves.push({ mesh: m, t: 0, max: 0.55 });
    this.spray.emit(big ? 70 : 35, t.x, 1, t.z, { speed: big ? 9 : 6, up: big ? 12 : 8, life: 1.4, color: new Color(color).lerp(new Color(1, 1, 1), 0.5), spread: t.cls.W });
  }

  private ai(e: EnemyShip, dt: number) {
    const s = e.ship;
    const p = this.player;
    if (!s.alive) return;
    e.aiT -= dt;
    let turn = 0;
    const steerTo = (tx: number, tz: number) => {
      const want = Math.atan2(tx - s.x, tz - s.z);
      const diff = ((want - s.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      return Math.max(-1, Math.min(1, -diff * 2));
    };
    // Ziel: Begleiter kämpfen gegen Feinde, Feinde gegen den Spieler (und Begleiter)
    let target: Ship | null = null;
    if (e.companion) {
      let best = 260;
      for (const o of this.enemies) if (!o.companion && o.ship.alive && o.role !== 'haendler') { const d = Math.hypot(o.ship.x - s.x, o.ship.z - s.z); if (d < best) { best = d; target = o.ship; } }
    } else if (p?.alive && e.role !== 'haendler') target = p;
    const dist = target ? Math.hypot(target.x - s.x, target.z - s.z) : 9999;

    if (e.companion && !target && p) {
      // In Formation hinter dem Spieler
      const fx = p.x - Math.sin(p.heading) * 35 + Math.cos(p.heading) * 18, fz = p.z - Math.cos(p.heading) * 35 - Math.sin(p.heading) * 18;
      turn = steerTo(fx, fz);
      s.sailLevel = Math.hypot(fx - s.x, fz - s.z) > 30 ? 2 : 1;
    } else if (e.role === 'haendler') {
      const threatened = p && (Math.hypot(p.x - s.x, p.z - s.z) < 120 || s.hull < s.maxHull);
      s.speedCap = 11 - Math.max(0, SHIP_CLASSES.indexOf(s.cls)) * 0.4;
      if (threatened && p) { turn = steerTo(s.x * 2 - p.x, s.z * 2 - p.z); s.sailLevel = 2; e.state = 'flee'; }
      else { if (e.aiT <= 0 || Math.hypot(e.wander.x - s.x, e.wander.z - s.z) < 30) { e.aiT = 20; e.wander = { x: s.x + (Math.random() - 0.5) * 600, z: s.z + (Math.random() - 0.5) * 600 }; } turn = steerTo(e.wander.x, e.wander.z); s.sailLevel = 1; }
    } else if (target && !e.companion && dist < (e.role === 'legende' ? 480 : 320)) {
      // Wie in 1.0: in Breitseitenabstand umkreisen, feuern, sobald eine Seite zeigt
      e.state = 'engage';
      const tier = Math.max(0, SHIP_CLASSES.indexOf(s.cls));
      s.speedCap = (14.5 - tier * 0.4 + (e.role === 'legende' ? 2 : 0) + (e.ghost ? 1 : 0)) * (this.isWeak(e) ? 0.45 : 1);
      if (this.isWeak(e) && !e.weakNoted) { e.weakNoted = true; this.hooks.message(`${e.name ?? 'Das Schiff'} ist schwer angeschlagen – fahr heran und entere es!`); }
      s.sailLevel = 2;
      const toP = Math.atan2(target.x - s.x, target.z - s.z);
      let des: number;
      if (tier === 0 && dist > 80) des = toP;
      else {
        const od = 46 + s.cls.L * 0.5;
        const orbit = e.orbit ?? (e.orbit = Math.random() < 0.5 ? 1 : -1);
        const bias = Math.max(-1, Math.min(1, (dist - od) / 45));
        des = toP + orbit * Math.PI / 2 - orbit * bias * Math.PI / 2 * 0.8;
      }
      turn = steerTo(s.x + Math.sin(des) * 50, s.z + Math.cos(des) * 50);
      e.reload = (e.reload ?? Math.random() * 2) - dt;
      const rng = 52 + tier * 6;
      if (dist < rng && e.reload <= 0 && s.ceasefire <= 0 && s.frozen <= 0) {
        for (const side of [-1, 1]) {
          const d = ((s.heading + side * Math.PI / 2 - toP + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          if (Math.abs(d) > 0.4) continue;
          const lv = e.level;
          const dmg = (6 + tier * 2) * (1 + 0.12 * (lv - 1) + 0.004 * (lv - 1) * (lv - 1)) * (e.role === 'legende' ? 1.4 : 1);
          this.broadside(s, side, dist, dmg, e.role === 'legende' && Math.random() < 0.3 ? 'brand' : 'kugel', target);
          e.reload = (2.4 + Math.random()) / Math.sqrt(lv * 0.5 + 0.5);
          break;
        }
      }
    } else if (target && dist < 420) {
      e.state = s.hull < s.maxHull * 0.2 && e.role !== 'legende' && !e.companion ? 'flee' : 'engage';
      if (e.state === 'flee') { turn = steerTo(s.x * 2 - target.x, s.z * 2 - target.z); s.sailLevel = 2; }
      else {
        // Breitseite: Ziel quer zum eigenen Kurs halten
        const bearing = Math.atan2(target.x - s.x, target.z - s.z);
        const rel = ((bearing - s.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        const side = rel > 0 ? 1 : -1;
        if (dist > 85) turn = steerTo(target.x, target.z);
        else if (dist < 35) turn = steerTo(s.x * 2 - target.x, s.z * 2 - target.z);
        else turn = Math.max(-1, Math.min(1, -(Math.abs(rel) - Math.PI / 2) * side * 1.6));
        s.sailLevel = dist > 120 ? 2 : 1;
        const aligned = Math.abs(Math.abs(rel) - Math.PI / 2) < 0.3;
        const ready = side > 0 ? s.reloadL <= 0 : s.reloadR <= 0;
        if (aligned && ready && dist < 95 && s.ceasefire <= 0 && s.frozen <= 0) {
          const lead = target.pos.add(new Vector3(Math.sin(target.heading), 0, Math.cos(target.heading)).multiplyScalar(target.speed * dist / BALL_SPEED));
          const range = Math.hypot(lead.x - s.x, lead.z - s.z);
          const dmg = e.companion ? this.canDmg * 0.6 : (7 + e.level * 2.4) * (e.role === 'legende' ? 1.6 : 1);
          this.broadside(s, side, range, dmg, e.role === 'legende' && Math.random() < 0.3 ? 'brand' : 'kugel');
          const reload = 3.2 - Math.min(1.2, e.level * 0.08);
          if (side > 0) s.reloadL = reload; else s.reloadR = reload;
        }
      }
    } else {
      e.state = 'patrol';
      if (!e.companion) s.speedCap = 10;
      if (e.aiT <= 0 || Math.hypot(e.wander.x - s.x, e.wander.z - s.z) < 40) {
        e.aiT = 25;
        const a = Math.random() * Math.PI * 2;
        e.wander = { x: s.x + Math.cos(a) * 400, z: s.z + Math.sin(a) * 400 };
      }
      turn = steerTo(e.wander.x, e.wander.z);
      s.sailLevel = 1;
    }
    // Inseln und Weltrand ausweichen
    const ahead = { x: s.x + Math.sin(s.heading) * s.cls.L * 1.6, z: s.z + Math.cos(s.heading) * s.cls.L * 1.6 };
    if (this.ground.islandAt(ahead.x, ahead.z, 20) || Math.hypot(ahead.x, ahead.z) > WORLD_RADIUS - 120) turn = 1;
    s.steer(dt, turn, this.env);
    const isl = this.ground.islandAt(s.x, s.z, s.cls.W);
    if (isl) { const a = Math.atan2(s.z - isl.z, s.x - isl.x); s.x = isl.x + Math.cos(a) * (isl.r + s.cls.W); s.z = isl.z + Math.sin(a) * (isl.r + s.cls.W); }
  }

  private shipsForHit(): Ship[] {
    const list = this.enemies.map((e) => e.ship);
    if (this.player) list.push(this.player);
    return list;
  }

  private updateBalls(dt: number) {
    for (const b of this.balls) {
      b.life -= dt;
      b.vel.y -= G * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      const p = b.mesh.position;
      if (b.ammo === 'brand' && Math.random() < dt * 30) this.sparks.emit(1, p.x, p.y, p.z, { speed: 0.3, up: 0.5, life: 0.4, color: new Color(3, 1.2, 0.3), gravity: -1, spread: 0.1 });
      for (const s of this.shipsForHit()) {
        if (s === b.owner || !s.alive) continue;
        if (Math.hypot(p.x - s.x, p.z - s.z) > s.cls.L * 0.6 + 2) continue;
        // In Schiffskoordinaten prüfen
        const local = s.model.group.worldToLocal(p.clone());
        if (Math.abs(local.z) > s.cls.L / 2 || Math.abs(local.x) > s.model.halfWidth(local.z) + 0.4) continue;
        if (local.y < -1.2 || local.y > s.model.deckY + s.cls.mh) continue;
        const sailHit = local.y > s.model.deckY + 2.5;
        this.hitShip(s, b, local, sailHit);
        b.life = 0;
        break;
      }
      if (b.life > 0 && b.owner === this.player && this.extraTarget?.hitTest(p)) {
        b.life = 0;
        this.extraTarget.damage(b.dmg);
        audio.play('heavy', 1, p);
        this.fx.hit(p.clone(), 'heavy', '#9FE8FF');
        this.overlay.number(p.clone().setY(p.y + 1.5), Math.round(b.dmg), 'hit');
        this.hooks.hitstop(0.03);
      }
      if (b.life > 0 && p.y < this.env.heightAt(p.x, p.z)) {
        b.life = 0;
        audio.play('splash', 0.9, p);
        this.spray.emit(30, p.x, p.y + 0.2, p.z, { speed: 3, up: 9, life: 1.4, color: new Color(0.95, 0.98, 1) });
      }
      if (b.life <= 0) b.mesh.removeFromParent();
    }
    this.balls = this.balls.filter((b) => b.life > 0);
  }

  private hitShip(s: Ship, b: Ball, local: Vector3, sailHit: boolean) {
    const ammo: AmmoId = sailHit ? 'kette' : b.ammo;
    const dmg = s.damage(b.dmg, ammo, sailHit ? null : local);
    const p = b.mesh.position.clone();
    audio.play('crack', 1, p);
    this.fx.hit(p, 'heavy', b.ammo === 'brand' ? '#FF7A2A' : '#FFD08A');
    this.sparks.emit(14, p.x, p.y, p.z, { speed: 6, up: 5, life: 0.9, color: new Color(0.55, 0.36, 0.2), gravity: 14, spread: 0.3 });
    if (dmg > 0) this.overlay.number(p.clone().setY(p.y + 1.5), dmg, s === this.player ? 'hurt' : 'hit');
    if (s === this.player) { this.hooks.shake(0.45); this.overlay.hurt(); }
    else if (b.owner === this.player) this.hooks.hitstop(0.03);
    if (!s.alive) this.sink(s);
  }

  private sink(s: Ship) {
    if (s.sinking > 0) return;
    s.sinking = 0.01;
    audio.play('sink', 1, s);
    const e = this.enemies.find((x) => x.ship === s);
    if (s === this.player) return;
    this.fx.shockwave(new Vector3(s.x, 0.5, s.z), s.cls.L * 0.6, '#FFB45A');
    this.spray.emit(60, s.x, 1, s.z, { speed: 6, up: 10, life: 2, color: new Color(0.95, 0.98, 1), spread: s.cls.W });
    if (e && !e.companion) {
      this.hooks.sunk(e);
      const n = 2 + Math.floor(s.cls.L / 12);
      for (let i = 0; i < n; i++) this.spawnCrate(s.x + (Math.random() - 0.5) * s.cls.W * 2, s.z + (Math.random() - 0.5) * s.cls.L * 0.8, Math.round((20 + e.level * 12) * (e.role === 'haendler' ? 2 : e.role === 'legende' ? 4 : 1) / n * (0.7 + Math.random() * 0.6)), Math.random() < (e.role === 'legende' ? 0.8 : 0.08));
    }
  }

  private spawnCrate(x: number, z: number, gold: number, shard: boolean) {
    const m = new Mesh(new BoxGeometry(1.2, 0.9, 1.2), shard ? new MeshBasicMaterial({ color: new Color(1.6, 0.9, 2.6) }) : toon('#8A5A2B'));
    m.position.set(x, 0, z);
    this.scene.add(m);
    this.crates.push({ mesh: m, x, z, gold, shard, t: 0 });
  }

  private updateCrates(dt: number) {
    const p = this.player;
    for (const c of this.crates) {
      c.t += dt;
      // Beute treibt zum Schiff (wie in 1.0)
      if (p) { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz) || 1; if (d < p.cls.L * 2.2) { const k = Math.min(d, 26 * dt); c.x += (dx / d) * k; c.z += (dz / d) * k; } }
      c.mesh.position.set(c.x, this.env.heightAt(c.x, c.z) + 0.1, c.z);
      c.mesh.rotation.set(Math.sin(c.t * 1.3) * 0.2, c.t * 0.3, Math.cos(c.t) * 0.2);
      if (p && Math.hypot(p.x - c.x, p.z - c.z) < p.cls.W + 6) {
        c.t = -1;
        this.hooks.loot(c.gold, c.shard);
        if (c.shard) audio.play('shard');
        this.overlay.number(new Vector3(c.x, 3, c.z), c.shard ? 'Faji-Splitter!' : `+${c.gold} Gold`, c.shard ? 'info' : 'gold');
      }
      if (c.t > 120) c.t = -1;
      if (c.t < 0) c.mesh.removeFromParent();
    }
    this.crates = this.crates.filter((c) => c.t >= 0);
  }

  // ---------- Entern ----------

  /** Gegner, das gerade geentert werden kann */
  /** Angeschlagen genug zum Entern? */
  isWeak(e: EnemyShip) {
    const s = e.ship;
    return s.hull < s.maxHull * 0.35 || s.crew < 0.3 || (e.role === 'haendler' && s.hull < s.maxHull * 0.6);
  }

  boardable(): EnemyShip | null {
    const p = this.player;
    // wie in 1.0: kein Tempolimit, angeschlagene Schiffe (unter 35 %) in Reichweite
    if (!p) return null;
    let best: EnemyShip | null = null, bd = Infinity;
    for (const e of this.enemies) {
      const s = e.ship;
      if (e.companion || !s.alive || s.sinking > 0) continue;
      if (!this.isWeak(e)) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < (s.cls.L + p.cls.L) / 2 + 20 && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Erobertes Schiff entfernen */
  capture(e: EnemyShip) {
    e.ship.hull = 0;
    e.ship.sinking = 0.01;
    this.hooks.sunk(e);
    this.spawnCrate(e.ship.x, e.ship.z, Math.round((60 + e.level * 25) * (e.role === 'legende' ? 4 : 1)), e.role === 'legende');
  }

  // ---------- Faji auf See ----------

  private nearest(range: number): EnemyShip | null {
    const p = this.player;
    if (!p) return null;
    let best: EnemyShip | null = null, bd = range;
    for (const e of this.enemies) { if (e.companion || !e.ship.alive) continue; const d = Math.hypot(e.ship.x - p.x, e.ship.z - p.z); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  private inRange(range: number) {
    const p = this.player!;
    return this.enemies.filter((e) => !e.companion && e.ship.alive && Math.hypot(e.ship.x - p.x, e.ship.z - p.z) < range);
  }

  private strikeFx(s: Ship, color: string) {
    const top = new Vector3(s.x, 60, s.z), bot = new Vector3(s.x, s.model.deckY, s.z);
    const line = new Line(new BufferGeometry().setFromPoints([top, bot]), new LineBasicMaterial({ color: new Color(color).multiplyScalar(4) }));
    this.scene.add(line);
    setTimeout(() => line.removeFromParent(), 180);
    this.fx.shockwave(bot.setY(0.5), s.cls.L * 0.5, color);
  }

  /** Wirkung einer Fähigkeit auf See. Liefert false, wenn kein Ziel da ist. */
  castSea(kind: string, level: number, power: number, color: string): boolean {
    const p = this.player;
    if (!p) return false;
    const dmg = power * (1.4 + level * 0.3);
    const hit = (e: EnemyShip, d: number) => {
      const real = e.ship.damage(d, 'kugel', null);
      this.overlay.number(new Vector3(e.ship.x, 6, e.ship.z), real, 'crit');
      if (!e.ship.alive) this.sink(e.ship);
    };
    switch (kind) {
      case 'salvo': {
        const t = this.nearest(160);
        const yaw = t ? Math.atan2(t.ship.x - p.x, t.ship.z - p.z) : p.heading;
        for (let i = 0; i < 8; i++) {
          const dir = new Vector3(Math.sin(yaw + (i - 3.5) * 0.06), 0, Math.cos(yaw + (i - 3.5) * 0.06));
          const d = t ? Math.hypot(t.ship.x - p.x, t.ship.z - p.z) : 80;
          const vel = dir.multiplyScalar(BALL_SPEED).setY(0.5 * G * (d / BALL_SPEED));
          setTimeout(() => this.spawnBall(new Vector3(p.x, p.model.deckY + 1, p.z), vel, p, dmg * 0.4, 'brand'), i * 60);
        }
        return true;
      }
      case 'freeze': { const t = this.nearest(150); if (!t) return false; t.ship.frozen = 4 + level; this.seaWave(t.ship, '#8FE8FF'); this.strikeFx(t.ship, '#8FE8FF'); hit(t, dmg * 0.5); return true; }
      case 'strike': { const t = this.nearest(160); if (!t) return false; this.strikeFx(t.ship, color); this.hooks.shake(0.35); hit(t, dmg * 1.3); return true; }
      case 'wind': p.boost = 5; this.fx.shockwave(new Vector3(p.x, 0.4, p.z), 30, color); for (const e of this.inRange(70)) { e.ship.x += (e.ship.x - p.x) * 0.3; e.ship.z += (e.ship.z - p.z) * 0.3; } return true;
      case 'wave': { const list = this.inRange(130); if (!list.length) return false; this.fx.shockwave(new Vector3(p.x, 0.4, p.z), 60, color); for (const e of list) { this.seaWave(e.ship, color, true); hit(e, dmg * 0.8); e.ship.x += (e.ship.x - p.x) * 0.25; e.ship.z += (e.ship.z - p.z) * 0.25; } return true; }
      case 'repair': p.repair(0.3 + level * 0.05); this.fx.shockwave(new Vector3(p.x, 0.4, p.z), 20, '#7CE07A'); this.overlay.number(new Vector3(p.x, 6, p.z), 'Repariert!', 'heal'); return true;
      case 'ceasefire': for (const e of this.inRange(160)) e.ship.ceasefire = 6 + level; this.fx.shockwave(new Vector3(p.x, 0.4, p.z), 80, color); return true;
      case 'reload': p.reloadL = p.reloadR = 0; this.reloadMult = 0.5; setTimeout(() => { this.reloadMult = 1; }, 8000); return true;
      case 'cleave': {
        // wie in 1.0: der Hieb fliegt zum nächsten Feindschiff und trifft alles auf der Linie
        const t = this.nearest(170);
        if (!t) return false;
        const yaw = Math.atan2(t.ship.x - p.x, t.ship.z - p.z);
        const f = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        this.fx.smear(new Vector3(p.x, p.model.deckY + 2, p.z).addScaledVector(f, 10), yaw, 0.1, 30, 0.6, color);
        for (const e of this.inRange(170)) {
          const rel = new Vector3(e.ship.x - p.x, 0, e.ship.z - p.z);
          const along = rel.dot(f);
          const off = rel.clone().addScaledVector(f, -along).length();
          if (along > 0 && off < e.ship.cls.W + 6) { this.seaWave(e.ship, color, level >= 3); hit(e, dmg * 1.6); }
        }
        this.hooks.shake(0.3);
        return true;
      }
      case 'meteor': { const list = this.inRange(160); if (!list.length) return false; list.forEach((e, i) => setTimeout(() => { this.strikeFx(e.ship, '#FF9A3A'); hit(e, dmg); e.ship.fire = 8; }, 300 + i * 250)); return true; }
      case 'still': for (const e of this.inRange(160)) { e.ship.frozen = 4; this.strikeFx(e.ship, color); } return true;
    }
    return false;
  }

  clear() {
    for (const e of this.enemies) e.ship.dispose();
    this.enemies = [];
    for (const b of this.balls) b.mesh.removeFromParent();
    this.balls = [];
  }
}
