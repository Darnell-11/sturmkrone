import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import type { CombatFx } from '../combat/fx';
import { AMMO, DEFAULT_SHIP_LOOK, HULL_COLORS, SAIL_COLORS, type AmmoId, type NavalRole } from '../data/ships';
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
}

interface Ball { mesh: Mesh; vel: Vector3; owner: Ship; dmg: number; ammo: AmmoId; life: number }
interface Crate { mesh: Mesh; x: number; z: number; gold: number; shard: boolean; t: number }

export interface NavalHooks {
  shake(a: number): void;
  hitstop(t: number): void;
  message(t: string): void;
  sunk(e: EnemyShip): void;
  loot(gold: number, shard: boolean): void;
}

const LEGEND_SHIPS = { pirat: ['Bram Eisenzahn', 'Yuna Glutauge', 'Orla Dorn', 'Rotbart Varga'], marine: ['Kapitän Jorin Weiß', 'Kommodore Ilsa Brandt', 'Vizeadmiralin Nadja Sturmfeld', 'Admiral Kasimir Eisgrau'] };

/** Feindschiffe, Kanonenkugeln, Beute und Faji auf See. */
export class NavalSystem {
  enemies: EnemyShip[] = [];
  player: Ship | null = null;
  playerFaction: 'pirat' | 'marine' = 'pirat';
  playerLevel = 1;
  playerRank = 0;
  /** Kanonenschaden des Spielers */
  canDmg = 14;
  reloadMult = 1;
  private balls: Ball[] = [];
  private crates: Crate[] = [];
  private spawnT = 3;
  private aim: Points;
  private ballGeo = new SphereGeometry(0.3, 8, 6);

  constructor(private scene: Scene, private env: SeaEnv, private fx: CombatFx, private overlay: CombatOverlay, private spray: ParticleSystem, private sparks: ParticleSystem, private ground: IslandGround, private hooks: NavalHooks) {
    const pts = new Float32Array(40 * 3);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.aim = new Points(g, new PointsMaterial({ color: new Color(3, 2.2, 0.6), size: 0.9, transparent: true, opacity: 0.85, depthWrite: false, blending: AdditiveBlending }));
    this.aim.frustumCulled = false;
    this.aim.visible = false;
    scene.add(this.aim);
  }

  // ---------- Zielhilfe ----------

  /** Flugbahn einer Breitseite anzeigen (side +1 links, −1 rechts) */
  showAim(side: number, range: number) {
    const p = this.player;
    if (!p) { this.aim.visible = false; return; }
    const pos = this.aim.geometry.attributes.position;
    const left = new Vector3(Math.cos(p.heading), 0, -Math.sin(p.heading)).multiplyScalar(side);
    const start = new Vector3(p.x, p.model.deckY, p.z).addScaledVector(left, p.cls.W / 2);
    const t = range / BALL_SPEED;
    const vy = 0.5 * G * t;
    for (let i = 0; i < 40; i++) {
      const tt = (i / 39) * t;
      pos.setXYZ(i, start.x + left.x * BALL_SPEED * tt + Math.sin(p.heading) * p.speed * tt, start.y + vy * tt - 0.5 * G * tt * tt, start.z + left.z * BALL_SPEED * tt + Math.cos(p.heading) * p.speed * tt);
    }
    pos.needsUpdate = true;
    this.aim.visible = true;
  }

  hideAim() { this.aim.visible = false; }

  // ---------- Feuern ----------

  /** Breitseite: alle Kanonen einer Seite */
  broadside(ship: Ship, side: number, range: number, dmg: number, ammo: AmmoId) {
    const muzzles = side > 0 ? ship.model.muzzlesL : ship.model.muzzlesR;
    const left = new Vector3(Math.cos(ship.heading), 0, -Math.sin(ship.heading)).multiplyScalar(side);
    const r = range * AMMO[ammo].range;
    const t = r / (BALL_SPEED * AMMO[ammo].speed);
    muzzles.forEach((m, i) => {
      const w = m.clone().applyMatrix4(ship.model.group.matrixWorld);
      const spread = (Math.random() - 0.5) * 0.06;
      const dir = left.clone().applyAxisAngle(new Vector3(0, 1, 0), spread);
      const vel = dir.multiplyScalar(BALL_SPEED * AMMO[ammo].speed).add(new Vector3(Math.sin(ship.heading) * ship.speed, 0.5 * G * t + (Math.random() - 0.5), Math.cos(ship.heading) * ship.speed));
      setTimeout(() => this.spawnBall(w, vel, ship, dmg, ammo), i * 70);
    });
  }

  /** Bugkanone nach vorn */
  bowShot(ship: Ship, dmg: number, ammo: AmmoId) {
    const f = new Vector3(Math.sin(ship.heading), 0, Math.cos(ship.heading));
    const from = new Vector3(ship.x, ship.model.deckY + 0.6, ship.z).addScaledVector(f, ship.cls.L / 2);
    this.spawnBall(from, f.multiplyScalar(BALL_SPEED + ship.speed).setY(6), ship, dmg * 0.8, ammo);
  }

  private spawnBall(pos: Vector3, vel: Vector3, owner: Ship, dmg: number, ammo: AmmoId) {
    const mat = ammo === 'brand' ? new MeshBasicMaterial({ color: new Color(4, 1.6, 0.4) }) : toon({ color: AMMO[ammo].color, spec: 1 });
    const m = new Mesh(this.ballGeo, mat);
    m.position.copy(pos);
    this.scene.add(m);
    this.balls.push({ mesh: m, vel, owner, dmg, ammo, life: 6 });
    this.fx.hit(pos, 'punch', '#FFB45A');
    this.spray.emit(10, pos.x, pos.y, pos.z, { speed: 2, up: 1.5, life: 1.2, color: new Color(0.75, 0.75, 0.78), gravity: -0.5, spread: 1 });
    if (owner === this.player) this.hooks.shake(0.18);
  }

  // ---------- Spawnen ----------

  private zoneLevel(x: number, z: number) { return Math.max(1, Math.min(10, 1 + Math.floor(Math.hypot(x, z) / 260))); }

  private spawnEnemy(px: number, pz: number) {
    const lvl = Math.max(this.zoneLevel(px, pz), Math.floor(this.playerLevel * 0.8));
    const roll = Math.random();
    const role: NavalRole = roll < 0.42 ? 'patrouille' : roll < 0.67 ? 'jaeger' : roll < 0.95 || lvl < 4 ? 'haendler' : 'legende';
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = 380 + Math.random() * 220;
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (Math.hypot(x, z) > WORLD_RADIUS - 150 || this.ground.islandAt(x, z, 40)) continue;
      const foe: 'pirat' | 'marine' = role === 'haendler' ? (Math.random() < 0.5 ? 'pirat' : 'marine') : this.playerFaction === 'pirat' ? 'marine' : 'pirat';
      const tier = role === 'legende' ? Math.min(6, 3 + Math.floor(lvl / 3)) : Math.max(0, Math.min(5, Math.floor(lvl / 2) + Math.floor(Math.random() * 2) - (role === 'haendler' ? 0 : 1)));
      const look = DEFAULT_SHIP_LOOK(foe);
      if (role === 'haendler') { look.hull = HULL_COLORS[Math.floor(Math.random() * 3)]; look.sail = SAIL_COLORS[Math.floor(Math.random() * 3)]; look.flag = 'anker'; look.flagColor = '#2F6E4F'; look.figurehead = 'keine'; }
      const ship = new Ship(this.scene, tier, look, foe, role === 'legende' ? 500 : 0);
      ship.x = x; ship.z = z; ship.heading = Math.random() * Math.PI * 2;
      ship.prev = { x, z, heading: ship.heading };
      const names = LEGEND_SHIPS[foe];
      this.enemies.push({ ship, role, level: lvl, state: 'patrol', wander: { x, z }, aiT: 0, name: role === 'legende' ? names[Math.floor(Math.random() * names.length)] : undefined });
      if (role === 'legende') this.overlay.showCutin(`${this.enemies[this.enemies.length - 1].name} taucht auf!`, '#A8322A');
      return;
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
    if (p && active) {
      this.spawnT -= dt;
      const hostile = this.enemies.filter((e) => !e.companion && e.ship.alive).length;
      const cap = Math.min(4, 2 + Math.floor(this.zoneLevel(p.x, p.z) / 3));
      if (this.spawnT <= 0 && hostile < cap) { this.spawnT = 8 + Math.random() * 8; this.spawnEnemy(p.x, p.z); }
      this.ensureCompanions();
    }
    for (const e of this.enemies) this.ai(e, dt);
    // Weit entfernte entfernen, gesunkene aufräumen
    for (const e of this.enemies) {
      if (e.ship.sinking > 7 || (p && !e.companion && Math.hypot(e.ship.x - p.x, e.ship.z - p.z) > 1200)) e.ship.dispose();
    }
    this.enemies = this.enemies.filter((e) => e.ship.sinking <= 7 && !(p && !e.companion && Math.hypot(e.ship.x - p.x, e.ship.z - p.z) > 1200));
    this.updateBalls(dt);
    this.updateCrates(dt);
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
      if (threatened && p) { turn = steerTo(s.x * 2 - p.x, s.z * 2 - p.z); s.sailLevel = 2; e.state = 'flee'; }
      else { if (e.aiT <= 0 || Math.hypot(e.wander.x - s.x, e.wander.z - s.z) < 30) { e.aiT = 20; e.wander = { x: s.x + (Math.random() - 0.5) * 600, z: s.z + (Math.random() - 0.5) * 600 }; } turn = steerTo(e.wander.x, e.wander.z); s.sailLevel = 1; }
    } else if (target && dist < (e.role === 'jaeger' || e.companion ? 420 : 260)) {
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
      if (b.life > 0 && p.y < this.env.heightAt(p.x, p.z)) {
        b.life = 0;
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
      c.mesh.position.set(c.x, this.env.heightAt(c.x, c.z) + 0.1, c.z);
      c.mesh.rotation.set(Math.sin(c.t * 1.3) * 0.2, c.t * 0.3, Math.cos(c.t) * 0.2);
      if (p && Math.hypot(p.x - c.x, p.z - c.z) < p.cls.W + 6) {
        c.t = -1;
        this.hooks.loot(c.gold, c.shard);
        this.overlay.number(new Vector3(c.x, 3, c.z), c.shard ? 'Faji-Splitter!' : `+${c.gold} Gold`, c.shard ? 'info' : 'gold');
      }
      if (c.t > 120) c.t = -1;
      if (c.t < 0) c.mesh.removeFromParent();
    }
    this.crates = this.crates.filter((c) => c.t >= 0);
  }

  // ---------- Entern ----------

  /** Gegner, das gerade geentert werden kann */
  boardable(): EnemyShip | null {
    const p = this.player;
    if (!p || p.speed > 9) return null;
    for (const e of this.enemies) {
      const s = e.ship;
      if (e.companion || !s.alive || s.sinking > 0) continue;
      const weak = s.hull < s.maxHull * 0.35 || s.crew < 0.3 || e.role === 'haendler' && s.hull < s.maxHull * 0.6;
      if (weak && Math.hypot(s.x - p.x, s.z - p.z) < (s.cls.L + p.cls.L) / 2 + 14) return e;
    }
    return null;
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
      case 'freeze': { const t = this.nearest(150); if (!t) return false; t.ship.frozen = 4 + level; this.strikeFx(t.ship, '#8FE8FF'); hit(t, dmg * 0.5); return true; }
      case 'strike': { const t = this.nearest(160); if (!t) return false; this.strikeFx(t.ship, color); hit(t, dmg * 1.3); return true; }
      case 'wind': p.boost = 5; this.fx.shockwave(new Vector3(p.x, 0.4, p.z), 30, color); for (const e of this.inRange(70)) { e.ship.x += (e.ship.x - p.x) * 0.3; e.ship.z += (e.ship.z - p.z) * 0.3; } return true;
      case 'wave': { const list = this.inRange(130); this.fx.shockwave(new Vector3(p.x, 0.4, p.z), 60, color); for (const e of list) { hit(e, dmg * 0.8); e.ship.x += (e.ship.x - p.x) * 0.25; e.ship.z += (e.ship.z - p.z) * 0.25; } return true; }
      case 'repair': p.repair(0.3 + level * 0.05); this.fx.shockwave(new Vector3(p.x, 0.4, p.z), 20, '#7CE07A'); this.overlay.number(new Vector3(p.x, 6, p.z), 'Repariert!', 'heal'); return true;
      case 'ceasefire': for (const e of this.inRange(160)) e.ship.ceasefire = 6 + level; this.fx.shockwave(new Vector3(p.x, 0.4, p.z), 80, color); return true;
      case 'reload': p.reloadL = p.reloadR = 0; this.reloadMult = 0.5; setTimeout(() => { this.reloadMult = 1; }, 8000); return true;
      case 'cleave': {
        const f = new Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
        this.fx.smear(new Vector3(p.x, p.model.deckY + 2, p.z).addScaledVector(f, 10), p.heading, 0.1, 30, 0.6, color);
        for (const e of this.inRange(170)) {
          const rel = new Vector3(e.ship.x - p.x, 0, e.ship.z - p.z);
          const along = rel.dot(f);
          const off = rel.clone().addScaledVector(f, -along).length();
          if (along > 0 && off < e.ship.cls.W + 6) { hit(e, dmg * 1.6); this.strikeFx(e.ship, color); }
        }
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
