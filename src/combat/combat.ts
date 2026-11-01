import { audio } from '../audio/audio';
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  type Camera,
  type Scene,
} from 'three';
import { ENEMIES, type AttackDef, type EnemyAttack, type EnemyKind } from '../data/combat';
import type { Faction } from '../core/save/types';
import type { CharacterAssets } from '../entities/character/assets';
import { Enemy, type EnemyWorld, type HitInfo } from '../entities/enemy';
import { addOutlines } from '../render/outline';
import { toon } from '../render/toon';
import type { CombatOverlay } from '../ui/combatOverlay';
import type { DeckGround, Ground, WalkIsland } from '../world/islandGround';
import type { CombatFx } from './fx';
import type { AbilityTarget } from '../faji/abilities';
import type { Element, Status } from '../data/skills';

export interface PlayerTarget {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly yaw: number;
  readonly active: boolean;
  /** Treffer auf den Spieler; liefert, was passiert ist */
  receiveHit(dmg: number, dirX: number, dirZ: number, knock: number, from: Enemy | null): 'hit' | 'blocked' | 'parried' | 'dodged';
}

export interface CombatHooks {
  heal(n: number): void;
  hitstop(seconds: number, scale?: number): void;
  shake(amount: number): void;
  kill(e: Enemy): void;
  gold(n: number): void;
  message(t: string): void;
}

interface Projectile { mesh: Mesh; vel: Vector3; life: number; radius: number; dmg: number; knock: number; team: 'player' | 'enemy'; from: Enemy | null; pierce: boolean; hit: Set<object>; color: string; poise: number }
interface Aoe { x: number; z: number; y: number; r: number; t: number; dmg: number; knock: number; from: Enemy }
interface Coin { mesh: Mesh; x: number; y: number; z: number; vy: number; vx: number; vz: number; value: number; t: number }

/** Übungspuppe: nimmt Treffer, fällt nie um */
class Dummy {
  readonly group = new Group();
  wobble = 0;
  readonly radius = 0.5;
  constructor(readonly x: number, readonly z: number, y: number) {
    const post = new Mesh(new CylinderGeometry(0.08, 0.1, 1.9, 8), toon(0x8a5a2b));
    post.position.y = 0.95;
    const sack = new Mesh(new CylinderGeometry(0.32, 0.36, 0.9, 12), toon(0xd9b98a));
    sack.position.y = 1.2;
    const head = new Mesh(new SphereGeometry(0.24, 12, 10), toon(0xd9b98a));
    head.position.y = 1.85;
    const arm = new Mesh(new CylinderGeometry(0.06, 0.06, 1.2, 6), toon(0x8a5a2b));
    arm.rotation.z = Math.PI / 2;
    arm.position.y = 1.45;
    this.group.add(post, sack, head, arm);
    addOutlines(this.group);
    this.group.position.set(x, y, z);
    this.group.traverse((o) => { o.castShadow = true; });
  }
  update(dt: number) {
    this.wobble *= Math.pow(0.02, dt);
    this.group.rotation.z = Math.sin(performance.now() * 0.02) * this.wobble * 0.15;
  }
}

/** Nahkampf, Fernkampf, Trefferlogik und Gegner – alles auf der aktuellen Insel. */
export class CombatSystem implements EnemyWorld {
  enemies: Enemy[] = [];
  lock: Enemy | null = null;
  player: PlayerTarget | null = null;
  playerPos: Vector3 | null = null;
  playerActive = false;
  /** Basis-Angriffswert des Spielers */
  atk = 12;
  critChance = 0.1;
  /** Boni aus Fähigkeiten und Synergien */
  mods = { critMult: 1.6, lifesteal: 0, burnOnHit: false, fearWeak: 0, playerLevel: 1, frostParry: false, skillMult: 1 };
  private dots = new Map<Enemy, { burn: number; poison: number; dps: number; tick: number }>();
  private dummies: Dummy[] = [];
  private projectiles: Projectile[] = [];
  private aoes: Aoe[] = [];
  private coins: Coin[] = [];
  private tokens = new Set<Enemy>();
  private now = 0;
  private swings = new Map<number, Set<object>>();
  private island: WalkIsland | null = null;
  private outline = true;

  constructor(
    private scene: Scene,
    private fx: CombatFx,
    private overlay: CombatOverlay,
    private assets: CharacterAssets,
    private groundRef: Ground,
    private hooks: CombatHooks,
  ) {}

  setOutline(v: boolean) { this.outline = v; }

  // ---------- EnemyWorld ----------

  requestToken(e: Enemy) {
    for (const t of this.tokens) if (!t.alive) this.tokens.delete(t);
    const max = e.def.boss ? 3 : 2;
    if (this.tokens.has(e)) return true;
    if (this.tokens.size >= max && !e.def.boss) return false;
    this.tokens.add(e);
    return true;
  }
  releaseToken(e: Enemy) { this.tokens.delete(e); }
  ground(x: number, z: number) { const h = this.groundRef.height(x, z); return Number.isFinite(h) ? h : 0; }
  constrain(x: number, z: number, r: number, self?: Enemy) {
    // Gegner untereinander und vom Spieler fernhalten (sich selbst überspringen!)
    for (const o of this.enemies) {
      if (!o.alive || o === self) continue;
      const dx = x - o.x, dz = z - o.z;
      const d = Math.hypot(dx, dz);
      const min = r + o.radius;
      if (d > 0.001 && d < min) { x = o.x + (dx / d) * min; z = o.z + (dz / d) * min; }
    }
    // Nicht in die Spielfigur hineinlaufen
    const pl = this.player;
    if (self && pl?.active) {
      const dx = x - pl.x, dz = z - pl.z;
      const d = Math.hypot(dx, dz);
      const min = r + 0.45;
      if (d < min) {
        const nx = d > 0.001 ? dx / d : Math.sin(self.yaw + Math.PI), nz = d > 0.001 ? dz / d : Math.cos(self.yaw + Math.PI);
        x = pl.x + nx * min; z = pl.z + nz * min;
      }
    }
    return this.groundRef.constrain(x, z, r);
  }

  enemyTelegraph(e: Enemy, atk: EnemyAttack) {
    if (atk.aoe && this.playerPos) {
      const at = atk.aoe.delay > 0 ? this.playerPos.clone() : new Vector3(e.x + Math.sin(e.yaw) * 1.8, e.y, e.z + Math.cos(e.yaw) * 1.8);
      at.y = this.ground(at.x, at.z);
      const total = atk.windup + (atk.aoe.delay > 0 ? atk.aoe.delay : 0.35);
      this.fx.telegraph(at, atk.aoe.radius, total);
      this.aoes.push({ x: at.x, z: at.z, y: at.y, r: atk.aoe.radius, t: total, dmg: e.dmg * atk.dmg * 1.3, knock: atk.knock, from: e });
    }
  }

  enemyStrike(e: Enemy, atk: EnemyAttack) {
    if (atk.aoe) return; // Schaden kommt über den Warnkreis
    if (atk.projectile) {
      const p = this.playerPos;
      const from = new Vector3(e.x + Math.sin(e.yaw) * 0.8, e.y + 1.3, e.z + Math.cos(e.yaw) * 0.8);
      const dir = p ? new Vector3(p.x - from.x, p.y + 1 - from.y, p.z - from.z).normalize() : new Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw));
      this.spawnProjectile(from, dir.multiplyScalar(atk.projectile.speed), atk.projectile.radius, e.dmg * atk.dmg, atk.knock, 'enemy', e, false, atk.projectile.color, 0);
      this.fx.hit(from, 'punch', atk.projectile.color);
      return;
    }
    const pl = this.player;
    if (!pl || !pl.active) return;
    const dx = pl.x - e.x, dz = pl.z - e.z;
    const d = Math.hypot(dx, dz);
    if (d > atk.range * e.def.scale + 0.4) return;
    const ang = Math.abs(((Math.atan2(dx, dz) - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (ang > atk.arc / 2 + 0.2) return;
    this.hitPlayer(e.dmg * atk.dmg, dx / (d || 1), dz / (d || 1), atk.knock, e, atk.fx === 'heavy');
  }

  private hitPlayer(dmg: number, dirX: number, dirZ: number, knock: number, from: Enemy | null, heavy: boolean) {
    const pl = this.player;
    if (!pl || !pl.active) return;
    if (from && from.level < this.mods.playerLevel) dmg *= 1 - this.mods.fearWeak;
    const res = pl.receiveHit(dmg, dirX, dirZ, knock, from);
    const pos = new Vector3(pl.x, pl.y + 1.2, pl.z);
    if (res === 'parried') {
      from?.parried();
      if (from && this.mods.frostParry) from.stun(2.5, true);
      this.overlay.number(pos.clone().setY(pos.y + 0.6), 'Parade!', 'info');
      this.fx.hit(pos.clone().addScaledVector(new Vector3(-dirX, 0, -dirZ), 0.6), 'heavy', '#FFFFFF', true);
      this.overlay.impactFrame();
      this.overlay.speedlines(0.8);
      this.hooks.hitstop(0.35, 0.15);
      this.hooks.shake(0.4);
    } else if (res === 'blocked') {
      this.fx.hit(pos.clone().addScaledVector(new Vector3(-dirX, 0, -dirZ), 0.5), 'punch', '#9FD8FF');
      this.overlay.number(pos, 'Geblockt', 'info');
      this.hooks.shake(0.15);
    } else if (res === 'hit') {
      this.overlay.number(pos, dmg, 'hurt');
      this.overlay.hurt();
      this.fx.hit(pos, heavy ? 'heavy' : 'slash', '#FF6A4A');
      this.hooks.shake(heavy ? 0.6 : 0.3);
      this.hooks.hitstop(heavy ? 0.1 : 0.05);
    } else {
      this.overlay.number(pos, 'Ausgewichen', 'info');
    }
  }

  // ---------- Spieler greift an ----------

  /** Neuer Schlag: eigene Trefferliste, damit jeder Gegner nur einmal getroffen wird */
  beginSwing(id: number) { audio.play('swing'); this.swings.set(id, new Set()); if (this.swings.size > 8) this.swings.delete(this.swings.keys().next().value!); }

  /** Während des Trefferfensters jeden Frame aufrufen */
  swing(id: number, def: AttackDef, x: number, _y: number, z: number, yaw: number, mult: number, color: string): number {
    const done = this.swings.get(id) ?? new Set<object>();
    this.swings.set(id, done);
    let hits = 0;
    const targets: { obj: object; x: number; z: number; r: number }[] = [
      ...this.enemies.filter((e) => e.alive).map((e) => ({ obj: e as object, x: e.x, z: e.z, r: e.radius })),
      ...this.dummies.map((d) => ({ obj: d as object, x: d.x, z: d.z, r: d.radius })),
    ];
    for (const t of targets) {
      if (done.has(t.obj)) continue;
      const dx = t.x - x, dz = t.z - z;
      const d = Math.hypot(dx, dz);
      if (d > def.range + t.r) continue;
      const ang = Math.abs(((Math.atan2(dx, dz) - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (ang > def.arc / 2 + 0.15 && d > t.r + 0.6) continue;
      done.add(t.obj);
      this.applyHit(t.obj, def, dx / (d || 1), dz / (d || 1), mult, color);
      hits++;
    }
    return hits;
  }

  /** Fernangriff des Spielers (Faji-Geschosse) */
  shoot(def: AttackDef, x: number, y: number, z: number, yaw: number, mult: number) {
    const pr = def.projectile!;
    audio.play('whoosh', 0.7);
    let dir = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const tgt = this.lock?.alive ? this.lock : this.nearestInCone(x, z, yaw, def.range, 0.6);
    if (tgt) dir = new Vector3(tgt.x - x, tgt.y + 1.1 - (y + 1.3), tgt.z - z).normalize();
    const from = new Vector3(x, y + 1.3, z).addScaledVector(new Vector3(Math.sin(yaw), 0, Math.cos(yaw)), 0.8);
    this.spawnProjectile(from, dir.multiplyScalar(pr.speed), pr.radius, this.atk * def.dmg * mult, def.knock, 'player', null, !!pr.pierce, pr.color, def.poise);
    this.fx.hit(from, 'magic', pr.color);
  }

  private applyHit(obj: object, def: AttackDef, dirX: number, dirZ: number, mult: number, color: string) {
    const crit = Math.random() < this.critChance;
    const dmg = Math.round(this.atk * def.dmg * mult * (crit ? this.mods.critMult : 1) * (0.92 + Math.random() * 0.16));
    if (this.mods.lifesteal > 0) this.hooks.heal(dmg * this.mods.lifesteal);
    const heavy = def.fx === 'heavy' || def.poise >= 30;
    if (obj instanceof Dummy) {
      obj.wobble = Math.min(1.5, obj.wobble + 0.6);
      const pos = new Vector3(obj.x, obj.group.position.y + 1.4, obj.z);
      this.fx.hit(pos, def.fx, color, crit || heavy);
      this.overlay.number(pos, dmg, crit ? 'crit' : 'hit');
      this.overlay.addCombo();
      this.hooks.hitstop(def.hitstop);
      this.hooks.shake(def.shake);
      return;
    }
    const e = obj as Enemy;
    const res = e.takeHit({ dmg, poise: def.poise, knock: def.knock, launch: def.launch, dirX, dirZ, heavy } as HitInfo, this.now);
    const pos = e.head.setY(e.y + 1.3 * e.def.scale);
    if (res === 'blocked') {
      this.fx.hit(pos, 'punch', '#9FD8FF');
      this.overlay.number(pos, 'Abgewehrt', 'info');
      this.hooks.shake(0.1);
      return;
    }
    this.fx.hit(pos, def.fx, color, crit || heavy || res === 'kill');
    this.overlay.number(pos, dmg, crit ? 'crit' : 'hit');
    if (this.mods.burnOnHit && def.fx !== 'magic' && def.fx !== 'punch' && res !== 'kill') this.applyStatus(e, 'burn', 3, dmg * 0.6);
    this.overlay.addCombo();
    if (res === 'stagger') { this.overlay.number(pos.clone().setY(pos.y + 0.7), 'Haltung gebrochen!', 'info'); this.overlay.speedlines(0.6); }
    if (heavy) {
      const g = new Vector3(e.x, this.ground(e.x, e.z), e.z);
      this.fx.shockwave(g, 4);
      if (def.fx === 'heavy') this.fx.crack(g, 3.5);
    }
    if ((crit && heavy) || res === 'kill' && e.def.elite) this.overlay.impactFrame();
    this.hooks.hitstop(res === 'kill' ? def.hitstop * 1.8 : def.hitstop);
    this.hooks.shake(def.shake + (res === 'kill' ? 0.2 : 0));
    if (res === 'kill') this.onKill(e);
  }

  private onKill(e: Enemy) {
    this.overlay.number(e.head, 'K.O.!', 'info');
    if (this.lock === e) this.lock = null;
    this.tokens.delete(e);
    const n = 3 + Math.floor(Math.random() * 3);
    const [g0, g1] = e.def.gold;
    const total = Math.round((g0 + Math.random() * (g1 - g0)) * (1 + 0.2 * (e.level - 1)));
    for (let i = 0; i < n; i++) this.spawnCoin(e.x, e.y + 1, e.z, Math.max(1, Math.round(total / n)));
    this.hooks.kill(e);
    if (e.def.boss) {
      this.overlay.showBanner('Legende besiegt!', e.name ?? e.def.label);
      this.overlay.setBoss(null);
    }
  }

  private spawnProjectile(from: Vector3, vel: Vector3, radius: number, dmg: number, knock: number, team: 'player' | 'enemy', src: Enemy | null, pierce: boolean, color: string, poise: number) {
    const m = new Mesh(new SphereGeometry(radius * 0.5, 12, 8), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(3), transparent: true, blending: AdditiveBlending, depthWrite: false }));
    const halo = new Mesh(new SphereGeometry(radius, 12, 8), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(1.4), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }));
    m.add(halo);
    m.position.copy(from);
    this.scene.add(m);
    this.projectiles.push({ mesh: m, vel, life: 2.2, radius, dmg, knock, team, from: src, pierce, hit: new Set(), color, poise });
  }

  private spawnCoin(x: number, y: number, z: number, value: number) {
    const m = new Mesh(COIN_GEO, COIN_MAT);
    m.position.set(x, y, z);
    this.scene.add(m);
    const a = Math.random() * Math.PI * 2;
    this.coins.push({ mesh: m, x, y, z, vy: 5 + Math.random() * 3, vx: Math.cos(a) * 2.5, vz: Math.sin(a) * 2.5, value, t: 0 });
  }

  // ---------- Faji-Fähigkeiten ----------

  /** Gegner und Puppen als Ziele für Fähigkeiten */
  abilityTargets(): AbilityTarget[] {
    const list: AbilityTarget[] = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      list.push({
        x: e.x, y: e.y, z: e.z, radius: e.radius, alive: true,
        hit: (dmg, status, dur, dx, dz, el) => this.abilityHit(e, dmg * this.mods.skillMult, status, dur, dx, dz, el),
        shove: (dx, dz) => { const c = this.constrain(e.x + dx, e.z + dz, e.radius, e); e.x = c.x; e.z = c.z; },
      });
    }
    for (const d of this.dummies) {
      list.push({
        x: d.x, y: d.group.position.y, z: d.z, radius: d.radius, alive: true,
        hit: (dmg) => {
          d.wobble = Math.min(1.5, d.wobble + 0.6);
          this.overlay.number(new Vector3(d.x, d.group.position.y + 1.6, d.z), Math.round(dmg * this.mods.skillMult), 'hit');
          this.overlay.addCombo();
        },
      });
    }
    return list;
  }

  private abilityHit(e: Enemy, dmg: number, status: Status | undefined, dur: number, dx: number, dz: number, el: Element) {
    const crit = Math.random() < this.critChance;
    const amount = Math.round(dmg * (crit ? this.mods.critMult : 1));
    const res = e.takeHit({ dmg: amount, poise: 25, knock: status === 'launch' ? 2 : 4, dirX: dx, dirZ: dz, heavy: true } as HitInfo, this.now);
    const pos = e.head.setY(e.y + 1.4 * e.def.scale);
    this.overlay.number(pos, amount, crit ? 'crit' : 'hit');
    this.overlay.addCombo();
    if (this.mods.lifesteal > 0) this.hooks.heal(amount * this.mods.lifesteal);
    if (res === 'kill') { this.onKill(e); return; }
    if (status) this.applyStatus(e, status, dur, amount);
    void el;
  }

  applyStatus(e: Enemy, status: Status, dur: number, dmg: number) {
    switch (status) {
      case 'burn':
      case 'poison': {
        const d = this.dots.get(e) ?? { burn: 0, poison: 0, dps: 0, tick: 0 };
        d[status] = Math.max(d[status], dur);
        d.dps = Math.max(d.dps, dmg * 0.25);
        this.dots.set(e, d);
        break;
      }
      case 'freeze': e.stun(dur, true); break;
      case 'stun': e.stun(dur); break;
      case 'fear': e.fear(dur); if (e.level < this.mods.playerLevel && !e.def.elite && Math.random() < 0.3) e.stun(dur); break;
      case 'slow': e.slowT = Math.max(e.slowT, dur); break;
      case 'launch': e.launch(8); break;
    }
  }

  private updateDots(dt: number) {
    for (const [e, d] of this.dots) {
      if (!e.alive) { this.dots.delete(e); continue; }
      d.burn -= dt; d.poison -= dt; d.tick -= dt;
      const pos = new Vector3(e.x, e.y + 1, e.z);
      if (d.burn > 0 && Math.random() < dt * 25) this.fx.puffColor(pos, '#FF7A2A');
      if (d.poison > 0 && Math.random() < dt * 20) this.fx.puffColor(pos, '#8AD84A');
      if (d.tick <= 0 && (d.burn > 0 || d.poison > 0)) {
        d.tick = 0.6;
        const amount = Math.max(1, Math.round(d.dps * 0.6));
        this.overlay.number(e.head, amount, d.burn > 0 ? 'gold' : 'heal');
        if (e.dot(amount) === 'kill') this.onKill(e);
      }
      if (d.burn <= 0 && d.poison <= 0) this.dots.delete(e);
    }
  }

  // ---------- Zielerfassung ----------

  nearestInCone(x: number, z: number, yaw: number, range: number, cone: number): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - x, dz = e.z - z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const ang = Math.abs(((Math.atan2(dx, dz) - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (ang > cone) continue;
      const score = d + ang * 6;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  /** Ziel erfassen oder zum nächsten wechseln */
  toggleLock(x: number, z: number, camYaw: number) {
    if (this.lock) {
      const others = this.enemies.filter((e) => e.alive && e !== this.lock && Math.hypot(e.x - x, e.z - z) < 22);
      this.lock = others.length ? others.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0] : null;
      return;
    }
    this.lock = this.nearestInCone(x, z, camYaw, 22, Math.PI * 0.6) ?? this.nearestInCone(x, z, camYaw, 22, Math.PI);
  }

  // ---------- Inseln ----------

  /** Gegnerlager einer Insel aufbauen */
  enterIsland(isl: WalkIsland, kinds: EnemyKind[], level: number, faction: Faction, bossName?: string) {
    this.leaveIsland();
    this.island = isl;
    kinds.forEach((k, i) => {
      const a = (i / kinds.length) * Math.PI * 2 + Math.random() * 0.4;
      const r = isl.r * (k === 'legende' ? 0.15 : 0.35 + Math.random() * 0.3);
      const e = new Enemy(this.assets, k, level, faction, isl.x + Math.cos(a) * r, isl.z + Math.sin(a) * r, this.outline, k === 'legende' ? bossName : undefined);
      e.y = this.ground(e.x, e.z);
      this.scene.add(e.char.holder);
      this.enemies.push(e);
    });
    const boss = this.enemies.find((e) => e.def.boss);
    if (boss) this.overlay.showCutin(boss.name ?? ENEMIES.legende.label, '#A8322A');
  }

  /** Boden wechseln (Insel ↔ Schiffsdeck beim Entern) */
  setGround(g: Ground) { this.groundRef = g; }

  /** Deckkampf beim Entern: Crew auf dem feindlichen Deck */
  enterDeck(deck: DeckGround, kinds: EnemyKind[], level: number, faction: Faction, bossName?: string) {
    this.leaveIsland();
    kinds.forEach((k, i) => {
      const p = deck.spot((Math.random() - 0.5) * 1.6, 0.2 + (i / Math.max(1, kinds.length - 1)) * 0.7 - 0.1);
      const e = new Enemy(this.assets, k, level, faction, p.x, p.z, this.outline, k === 'legende' ? bossName : undefined);
      e.y = deck.height();
      e.alert();
      this.scene.add(e.char.holder);
      this.enemies.push(e);
    });
  }

  addDummy(x: number, z: number) {
    const d = new Dummy(x, z, this.ground(x, z));
    this.scene.add(d.group);
    this.dummies.push(d);
  }

  leaveIsland() {
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.tokens.clear();
    this.lock = null;
    this.island = null;
    for (const a of this.aoes) void a;
    this.aoes = [];
    this.overlay.clearBars();
    this.overlay.setBoss(null);
  }

  get activeIsland() { return this.island; }
  get hostilesLeft() { return this.enemies.filter((e) => e.alive).length; }

  // ---------- Schleife ----------

  update(dt: number, camera: Camera) {
    this.now += dt;
    const pl = this.player;
    this.playerActive = !!pl && pl.active;
    this.playerPos = pl ? new Vector3(pl.x, pl.y, pl.z) : null;

    // Ein kämpfender Gegner alarmiert das ganze Lager
    const engaged = this.enemies.filter((e) => e.engaged);
    if (engaged.length) for (const e of this.enemies) if (!e.engaged && engaged.some((o) => Math.hypot(o.x - e.x, o.z - e.z) < 32)) e.alert();
    for (const e of this.enemies) e.update(dt, this);
    for (const d of this.dummies) d.update(dt);
    this.updateDots(dt);

    // Geschosse
    for (const p of this.projectiles) {
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const pos = p.mesh.position;
      if (pos.y < this.ground(pos.x, pos.z) + 0.1 && Number.isFinite(this.groundRef.height(pos.x, pos.z))) p.life = 0;
      if (p.team === 'enemy' && pl?.active) {
        if (Math.hypot(pos.x - pl.x, pos.z - pl.z) < p.radius + 0.4 && Math.abs(pos.y - (pl.y + 1)) < 1.2) {
          const d = Math.hypot(p.vel.x, p.vel.z) || 1;
          this.hitPlayer(p.dmg, p.vel.x / d, p.vel.z / d, p.knock, p.from, false);
          p.life = 0;
        }
      } else if (p.team === 'player') {
        for (const e of this.enemies) {
          if (!e.alive || p.hit.has(e)) continue;
          if (Math.hypot(pos.x - e.x, pos.z - e.z) < p.radius + e.radius && Math.abs(pos.y - (e.y + 1)) < 1.5) {
            p.hit.add(e);
            const d = Math.hypot(p.vel.x, p.vel.z) || 1;
            this.applyHit(e, { dmg: p.dmg / this.atk, poise: p.poise, knock: p.knock, fx: 'magic', hitstop: 0.05, shake: 0.15 } as AttackDef, p.vel.x / d, p.vel.z / d, 1, p.color);
            if (!p.pierce) { p.life = 0; break; }
          }
        }
        for (const d of this.dummies) {
          if (p.hit.has(d)) continue;
          if (Math.hypot(pos.x - d.x, pos.z - d.z) < p.radius + d.radius) {
            p.hit.add(d);
            this.applyHit(d, { dmg: p.dmg / this.atk, poise: 0, knock: 0, fx: 'magic', hitstop: 0.04, shake: 0.1 } as AttackDef, 0, 0, 1, p.color);
            if (!p.pierce) { p.life = 0; break; }
          }
        }
      }
      if (p.life <= 0) {
        this.fx.hit(pos.clone(), 'magic', p.color);
        p.mesh.removeFromParent();
        p.mesh.geometry.dispose();
        (p.mesh.material as MeshBasicMaterial).dispose();
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);

    // Flächenangriffe
    for (const a of this.aoes) {
      a.t -= dt;
      if (a.t <= 0) {
        const g = new Vector3(a.x, a.y, a.z);
        this.fx.shockwave(g, a.r * 1.2, '#FF9A6A');
        this.fx.crack(g, a.r * 1.4);
        this.hooks.shake(0.5);
        if (pl?.active && a.from.alive && Math.hypot(pl.x - a.x, pl.z - a.z) < a.r + 0.3) {
          const dx = pl.x - a.x, dz = pl.z - a.z;
          const d = Math.hypot(dx, dz) || 1;
          this.hitPlayer(a.dmg, dx / d, dz / d, a.knock, a.from, true);
        }
      }
    }
    this.aoes = this.aoes.filter((a) => a.t > 0);

    // Münzen
    for (const c of this.coins) {
      c.t += dt;
      c.vy -= 20 * dt;
      c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
      const g = this.ground(c.x, c.z) + 0.25;
      if (c.y < g) { c.y = g; c.vy = Math.abs(c.vy) * 0.3; c.vx *= 0.5; c.vz *= 0.5; }
      if (pl?.active && c.t > 0.5) {
        const d = Math.hypot(pl.x - c.x, pl.z - c.z);
        if (d < 4) { c.x += (pl.x - c.x) * dt * 8; c.z += (pl.z - c.z) * dt * 8; }
        if (d < 0.7) { c.t = -1; this.hooks.gold(c.value); this.overlay.number(new Vector3(c.x, c.y + 1, c.z), `+${c.value}`, 'gold'); }
      }
      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.y += dt * 6;
      if (c.t > 30) c.t = -1;
      if (c.t < 0) c.mesh.removeFromParent();
    }
    this.coins = this.coins.filter((c) => c.t >= 0);

    // Tote Gegner entfernen
    for (const e of this.enemies) if (e.removable) { e.dispose(); this.overlay.setBar(e, null, -1, false, camera); }
    this.enemies = this.enemies.filter((e) => !e.removable);
    if (this.lock && (!this.lock.alive || !pl || Math.hypot(this.lock.x - pl.x, this.lock.z - pl.z) > 28)) this.lock = null;

    // Anzeigen
    const boss = this.enemies.find((e) => e.def.boss && e.alive);
    this.overlay.setBoss(boss ? boss.name ?? boss.def.label : null, boss ? boss.hp / boss.maxHp : 0);
    for (const e of this.enemies) {
      const show = e.alive && !e.def.boss && (this.now - e.lastHit < 5 || e === this.lock || e.def.elite);
      this.overlay.setBar(e, show ? e.head : null, show ? e.hp / e.maxHp : -1, !!e.def.elite, camera);
    }
    this.overlay.setReticle(this.lock?.alive ? this.lock.head.setY(this.lock.y + 1.2 * this.lock.def.scale) : null, camera);
  }
}

const COIN_GEO = new CylinderGeometry(0.16, 0.16, 0.04, 14).rotateX(Math.PI / 2);
const COIN_MAT = toon({ color: 0xffc83a, spec: 1, emissive: 0x4a3000 });
