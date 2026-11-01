import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Line,
  LineBasicMaterial,
  MathUtils,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { ENEMIES, enemyScale, type EnemyAttack, type EnemyDef, type EnemyKind } from '../data/combat';
import { randomLook, type NpcRole } from '../data/characterParts';
import type { Faction } from '../core/save/types';
import type { CharacterAssets } from './character/assets';
import { Character } from './character/character';
import { enemyWeapons } from './character/weapons';
import { toon } from '../render/toon';

export type EnemyState = 'idle' | 'chase' | 'strafe' | 'windup' | 'attack' | 'recover' | 'hit' | 'stagger' | 'air' | 'down' | 'dead';

/** Was das Kampfsystem einem Gegner zur Verfügung stellt */
export interface EnemyWorld {
  playerPos: Vector3 | null;
  playerActive: boolean;
  /** Darf dieser Gegner jetzt angreifen? (höchstens zwei gleichzeitig) */
  requestToken(e: Enemy): boolean;
  releaseToken(e: Enemy): void;
  enemyStrike(e: Enemy, atk: EnemyAttack): void;
  enemyTelegraph(e: Enemy, atk: EnemyAttack): void;
  ground(x: number, z: number): number;
  constrain(x: number, z: number, r: number, self?: Enemy): { x: number; z: number };
}

export interface HitInfo {
  dmg: number;
  poise: number;
  knock: number;
  launch?: number;
  dirX: number;
  dirZ: number;
  heavy: boolean;
}

const EXCL_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '900 56px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = '#1b1410';
  g.strokeText('!', 32, 34);
  g.fillStyle = '#ffffff';
  g.fillText('!', 32, 34);
  return new CanvasTexture(c);
})();

export class Enemy {
  readonly char: Character;
  readonly def: EnemyDef;
  x: number;
  z: number;
  y = 0;
  yaw = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  hp: number;
  maxHp: number;
  poise: number;
  dmg: number;
  state: EnemyState = 'idle';
  hasToken = false;
  /** Zuletzt getroffen (für Lebensbalken) */
  lastHit = -99;
  private timer = 0;
  private atk: EnemyAttack | null = null;
  private struck = false;
  private flash = 0;
  private marker: Sprite;
  private aim: Line | null = null;
  private strafeDir = Math.random() < 0.5 ? -1 : 1;
  private phase = 1;
  private normalMat: any = null;
  private aggro = false;

  constructor(assets: CharacterAssets, readonly kind: EnemyKind, readonly level: number, faction: Faction, x: number, z: number, outline: boolean, readonly name?: string) {
    this.def = ENEMIES[kind];
    const sc = enemyScale(level);
    this.maxHp = this.hp = Math.round(this.def.hp * sc.hp);
    this.dmg = this.def.dmg * sc.dmg;
    this.poise = this.def.poise;
    this.x = x;
    this.z = z;
    const role: NpcRole = faction === 'marine' ? (this.def.elite ? 'offizier' : 'marine') : this.def.role === 'offizier' ? 'pirat' : this.def.role;
    const look = randomLook(Math.random, role);
    if (kind === 'schlaeger') { look.body = 'kraeftig'; look.gloves = true; }
    if (this.def.elite) { look.coat = 'kapitaen'; look.coatColor = faction === 'marine' ? '#14284A' : '#4A1418'; }
    this.char = new Character(assets, look, outline);
    this.char.holder.scale.setScalar(this.def.scale);
    const w = enemyWeapons(this.def.weapon);
    this.char.hold('r', w.right);
    this.char.hold('l', w.left);
    this.marker = new Sprite(new SpriteMaterial({ map: EXCL_TEX, color: new Color(4, 1.2, 0.8), depthTest: false, transparent: true, blending: AdditiveBlending }));
    this.marker.scale.setScalar(0.7);
    this.marker.position.y = 2.4;
    this.marker.visible = false;
    this.char.holder.add(this.marker);
    this.yaw = Math.random() * Math.PI * 2;
    this.char.play('idle');
  }

  slowT = 0;
  fearT = 0;
  frozenT = 0;

  get alive() { return this.state !== 'dead'; }
  get engaged() { return this.alive && this.state !== 'idle'; }

  /** Schaden ohne Reaktion (Brand, Gift) */
  dot(dmg: number): 'hit' | 'kill' {
    if (!this.alive) return 'hit';
    this.hp -= dmg;
    this.aggro = true;
    if (this.hp <= 0) { this.hp = 0; this.die({ dmg, poise: 0, knock: 0, dirX: 0, dirZ: 0, heavy: false }); return 'kill'; }
    return 'hit';
  }

  /** Betäuben bzw. einfrieren */
  stun(dur: number, freeze = false) {
    if (!this.alive || this.state === 'air') return;
    this.cancelAttack();
    if (this.hasToken) this.hasToken = false;
    this.state = 'stagger';
    this.timer = dur * (this.def.boss ? 0.5 : 1);
    if (freeze) { this.frozenT = this.timer; this.char.mixer.timeScale = 0; }
    else this.char.play('stun', { fade: 0.05, restart: true });
  }

  fear(dur: number) { if (this.alive && !this.def.boss) { this.fearT = dur; this.cancelAttack(); this.toChase(); } }

  launch(v: number) {
    if (!this.alive || this.def.boss || this.def.poise >= 100) return;
    this.cancelAttack();
    this.vy = v;
    this.state = 'air';
    this.char.play('hitHeavy', { restart: true, fade: 0.05 });
  }
  /** Vom Lager alarmiert */
  alert() { if (this.state === 'idle') { this.aggro = true; } }
  get radius() { return this.def.radius * this.def.scale; }
  get pos() { return new Vector3(this.x, this.y, this.z); }
  /** Kopfhöhe für Balken und Zahlen */
  get head() { return new Vector3(this.x, this.y + 2.2 * this.def.scale, this.z); }

  /** Treffer durch den Spieler. Rückgabe: ob geblockt wurde */
  takeHit(h: HitInfo, now: number): 'hit' | 'blocked' | 'stagger' | 'kill' {
    if (!this.alive) return 'hit';
    this.aggro = true;
    this.lastHit = now;
    // Schildträger: Angriffe von vorn prallen ab (außer schwere)
    if (this.def.frontBlock && !h.heavy && this.state !== 'stagger') {
      const facing = Math.sin(this.yaw) * -h.dirX + Math.cos(this.yaw) * -h.dirZ;
      if (facing > 0.4) {
        this.poise -= h.poise * 0.5;
        this.char.play('blockHit', { restart: true, fade: 0.05, onDone: () => this.toChase() });
        if (this.poise > 0) return 'blocked';
      }
    }
    this.hp -= h.dmg;
    this.flash = 0.09;
    this.cancelAttack();
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(h);
      return 'kill';
    }
    this.poise -= h.poise;
    this.vx += h.dirX * h.knock;
    this.vz += h.dirZ * h.knock;
    if (h.launch && !this.def.boss && this.def.poise < 100) {
      this.vy = h.launch;
      this.state = 'air';
      this.char.play('hitHeavy', { restart: true, fade: 0.05 });
      return 'hit';
    }
    if (this.poise <= 0) {
      this.poise = this.def.poise;
      this.state = 'stagger';
      this.timer = this.def.boss ? 1.6 : 1.4;
      this.char.play('stun', { fade: 0.08, restart: true });
      return 'stagger';
    }
    // Schwere Gegner zucken bei leichten Treffern nur kurz
    if (this.def.poise >= 70 && !h.heavy && this.state === 'attack') return 'hit';
    this.state = 'hit';
    this.timer = 0.35;
    this.char.play(h.heavy ? 'hitHeavy' : 'hit', { fade: 0.04, restart: true });
    return 'hit';
  }

  /** Perfekte Parade des Spielers: Gegner taumelt */
  parried() {
    this.cancelAttack();
    this.state = 'stagger';
    this.timer = 1.6;
    this.poise = this.def.poise;
    this.char.play('stun', { fade: 0.05, restart: true });
  }

  private die(h: HitInfo) {
    this.state = 'dead';
    this.vx = h.dirX * (h.knock + 3);
    this.vz = h.dirZ * (h.knock + 3);
    this.vy = 3;
    this.marker.visible = false;
    this.char.play(Math.random() < 0.5 ? 'death' : 'deathLong', { fade: 0.05, restart: true });
    this.timer = 4;
  }

  private cancelAttack() {
    this.atk = null;
    this.marker.visible = false;
    if (this.aim) { this.aim.removeFromParent(); this.aim = null; }
  }

  private toChase() { if (this.alive && this.state !== 'air' && this.state !== 'dead') { this.state = 'chase'; this.char.play('run', { fade: 0.2 }); } }

  /** Zeit nach dem Tod bis zum Entfernen */
  get removable() { return this.state === 'dead' && this.timer <= 0; }

  update(dt: number, w: EnemyWorld) {
    this.timer -= dt;
    this.flash -= dt;
    this.slowT -= dt;
    this.fearT -= dt;
    if (this.frozenT > 0) {
      this.frozenT -= dt;
      if (this.frozenT <= 0) this.char.mixer.timeScale = 1;
    }
    const p = w.playerPos;
    const dx = p ? p.x - this.x : 0, dz = p ? p.z - this.z : 0;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    const def = this.def;
    // Boss-Phasen
    if (def.boss) {
      const frac = this.hp / this.maxHp;
      const ph = frac < 0.3 ? 3 : frac < 0.65 ? 2 : 1;
      if (ph !== this.phase) { this.phase = ph; this.dmg *= 1.15; }
    }
    const speed = def.speed * (def.boss ? 1 + (this.phase - 1) * 0.15 : 1) * (this.slowT > 0 ? 0.45 : 1);

    let mvx = 0, mvz = 0;
    const face = (target: number, rate = 8) => {
      const diff = MathUtils.euclideanModulo(target - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
      this.yaw += diff * Math.min(1, dt * rate);
    };

    if (!w.playerActive && this.state !== 'dead' && this.state !== 'air') {
      if (this.hasToken) { w.releaseToken(this); this.hasToken = false; }
      if (this.state !== 'idle') { this.state = 'idle'; this.cancelAttack(); this.char.play('idle', { fade: 0.4 }); }
      this.aggro = false;
    }

    switch (this.state) {
      case 'idle':
        if (w.playerActive && (dist < 20 || this.aggro)) this.toChase();
        break;
      case 'chase':
      case 'strafe': {
        if (this.fearT > 0) {
          // Furcht: wegrennen
          face(toPlayer + Math.PI);
          mvx = -Math.sin(toPlayer) * speed; mvz = -Math.cos(toPlayer) * speed;
          if (this.char.playing !== 'Running_A') this.char.play('run', { fade: 0.15 });
          break;
        }
        face(toPlayer);
        const want = def.keep;
        const ranged = want > 4;
        if (dist > want + 0.6) { mvx = Math.sin(toPlayer) * speed; mvz = Math.cos(toPlayer) * speed; }
        else if (ranged && dist < want - 3) { mvx = -Math.sin(toPlayer) * speed * 0.8; mvz = -Math.cos(toPlayer) * speed * 0.8; }
        const inRange = dist < (ranged ? 24 : want + 1.4);
        if (inRange && this.timer <= 0) {
          if (w.requestToken(this)) {
            this.hasToken = true;
            this.startWindup(w);
            break;
          }
          // Kein Platz zum Angreifen: seitlich umkreisen
          this.state = 'strafe';
          this.timer = 0.8 + Math.random() * 1.2;
          if (Math.random() < 0.3) this.strafeDir *= -1;
        }
        if (this.state === 'strafe' && dist < want + 3) {
          const side = toPlayer + (Math.PI / 2) * this.strafeDir;
          mvx += Math.sin(side) * speed * 0.45;
          mvz += Math.cos(side) * speed * 0.45;
        }
        const moving = Math.hypot(mvx, mvz) > 0.3;
        const anim = moving ? (Math.hypot(mvx, mvz) > 2.6 ? 'run' : 'walk') : 'idle';
        if (this.char.playing !== (anim === 'run' ? 'Running_A' : anim === 'walk' ? 'Walking_A' : 'Idle_A')) this.char.play(anim, { fade: 0.2 });
        break;
      }
      case 'windup':
        face(toPlayer, 5);
        if (this.timer <= 0 && this.atk) {
          this.state = 'attack';
          this.marker.visible = false;
          this.struck = false;
          const a = this.char.playClip(this.atk.clip, { loop: false, speed: this.atk.speed * (def.boss ? 1 + (this.phase - 1) * 0.1 : 1), fade: 0.05, restart: true, onDone: () => this.endAttack(w) });
          if (!a) this.endAttack(w);
          if (this.aim) { this.aim.removeFromParent(); this.aim = null; }
        } else if (this.aim && p) {
          const pos = this.aim.geometry.attributes.position;
          pos.setXYZ(0, this.x, this.y + 1.4, this.z);
          pos.setXYZ(1, p.x, p.y + 1, p.z);
          pos.needsUpdate = true;
        }
        break;
      case 'attack':
        if (this.atk && !this.struck && this.char.progress >= this.atk.hitAt) {
          this.struck = true;
          w.enemyStrike(this, this.atk);
        }
        if (this.atk && this.char.progress < this.atk.hitAt) { mvx = Math.sin(this.yaw) * 1.5; mvz = Math.cos(this.yaw) * 1.5; }
        break;
      case 'recover':
        if (this.timer <= 0) this.toChase();
        break;
      case 'hit':
        if (this.timer <= 0) this.toChase();
        break;
      case 'stagger':
        if (this.timer <= 0) this.toChase();
        break;
      case 'air':
        this.vy -= 22 * dt;
        this.y += this.vy * dt;
        {
          const g = w.ground(this.x, this.z);
          if (this.y <= g && this.vy < 0) {
            this.y = g;
            this.vy = 0;
            this.state = 'down';
            this.timer = 0.9;
            this.char.play('lie', { fade: 0.1 });
          }
        }
        break;
      case 'down':
        if (this.timer <= 0) { this.state = 'recover'; this.timer = 0.5; this.char.play('spawn', { fade: 0.15, restart: true }); }
        break;
      case 'dead':
        this.vy -= 18 * dt;
        this.y = Math.max(w.ground(this.x, this.z), this.y + this.vy * dt);
        break;
    }

    // Bewegung, Rückstoß, Boden
    this.vx *= Math.pow(0.02, dt);
    this.vz *= Math.pow(0.02, dt);
    const c = w.constrain(this.x + (mvx + this.vx) * dt, this.z + (mvz + this.vz) * dt, this.radius, this);
    this.x = c.x;
    this.z = c.z;
    if (this.state !== 'air' && this.state !== 'dead') {
      const g = w.ground(this.x, this.z);
      this.y += ((Number.isFinite(g) ? g : this.y) - this.y) * Math.min(1, dt * 15);
    }
    this.char.holder.position.set(this.x, this.y, this.z);
    this.char.holder.rotation.y = this.yaw;
    this.char.update(dt);
    this.updateFlash();
  }

  private startWindup(w: EnemyWorld) {
    const opts = this.def.attacks;
    const p = w.playerPos;
    const dist = p ? Math.hypot(p.x - this.x, p.z - this.z) : 99;
    // Passenden Angriff wählen: Fernkampf auf Distanz, sonst zufällig
    const usable = opts.filter((a) => a.range >= dist - 0.5 || a.projectile || a.aoe);
    this.atk = (usable.length ? usable : opts)[Math.floor(Math.random() * (usable.length || opts.length))];
    this.state = 'windup';
    this.timer = this.atk.windup * (this.def.boss && this.phase === 3 ? 0.7 : 1);
    this.marker.visible = true;
    (this.marker.material as SpriteMaterial).color.set(this.atk.aoe || this.atk.windup > 0.7 ? new Color(5, 0.6, 0.3) : new Color(4, 3.2, 0.6));
    // Ausholen: Anfang der Angriffsanimation sehr langsam
    this.char.playClip(this.atk.clip, { loop: false, speed: 0.12, fade: 0.1, restart: true });
    if (this.atk.projectile && this.def.weapon === 'muskete') {
      const g = new BufferGeometry().setFromPoints([this.pos, this.pos]);
      this.aim = new Line(g, new LineBasicMaterial({ color: new Color(4, 0.4, 0.3), transparent: true, opacity: 0.8 }));
      this.aim.frustumCulled = false;
      this.char.holder.parent?.add(this.aim);
    }
    w.enemyTelegraph(this, this.atk);
  }

  private endAttack(w: EnemyWorld) {
    if (this.state !== 'attack') return;
    this.atk = null;
    if (this.hasToken) { w.releaseToken(this); this.hasToken = false; }
    this.state = 'recover';
    this.timer = 0.5 + Math.random() * 0.6;
    this.char.play('idle', { fade: 0.2 });
  }

  private updateFlash() {
    const mesh = (this.char as any).mesh;
    if (!mesh) return;
    const want = this.flash > 0 ? FLASH_MAT : this.frozenT > 0 ? FROST_MAT : null;
    if (want) {
      if (!this.normalMat) this.normalMat = mesh.material;
      mesh.material = want;
    } else if (this.normalMat) {
      mesh.material = this.normalMat;
      this.normalMat = null;
    }
  }

  dispose() {
    this.cancelAttack();
    this.char.dispose();
  }
}

const FLASH_MAT = toon({ color: 0xffffff, emissive: 0xffffff });
const FROST_MAT = toon({ color: 0xbff0ff, emissive: 0x2a6a8a, spec: 1 });
