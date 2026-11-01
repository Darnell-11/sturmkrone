import { MathUtils, Vector3 } from 'three';
import type { Input } from '../../core/input/input';
import { STYLE_ANIMS, type StyleId } from '../../data/animations';
import { PLAYER_BASE, STYLE_ATTACKS, type AttackDef } from '../../data/combat';
import type { CombatSystem, PlayerTarget } from '../../combat/combat';
import type { CombatFx } from '../../combat/fx';
import type { CombatOverlay } from '../../ui/combatOverlay';
import type { IslandGround } from '../../world/islandGround';
import type { Character } from '../character/character';
import type { Enemy } from '../enemy';

const WALK = 2.4;
const RUN = 6.2;
const ROLL_SPEED = 10;
const ROLL_TIME = 0.42;
const CHARGE_TIME = 0.85;

type FootState = 'move' | 'roll' | 'attack' | 'block' | 'charge' | 'hurt' | 'down';

/** Farbe der Schmier-Bögen und Funken je Kampfstil */
const STYLE_COLOR: Record<StyleId, string> = {
  faust: '#FFB45A', saebel: '#BFE8FF', langklinge: '#D8F0FF', zweihaender: '#FFD8A8', doppel: '#C8FFE8', effekt: '#D8A8FF',
};

export interface FootDeps {
  combat: CombatSystem | null;
  fx: CombatFx | null;
  overlay: CombatOverlay | null;
  onDown: () => void;
}

/** Steuerung und Kampf zu Fuß. */
export class PlayerFoot implements PlayerTarget {
  x = 0;
  z = 0;
  y = 0;
  yaw = 0;
  prev = { x: 0, z: 0, y: 0, yaw: 0 };
  state: FootState = 'move';
  speed = 0;
  hp = 100;
  maxHp = 100;
  /** Schadensfaktor (Waffe, Fähigkeiten, Crew) */
  dmgMult = 1;
  onFoot = false;
  private rollT = 0;
  private iframes = 0;
  private rollDir = { x: 0, z: 1 };
  private combo = 0;
  private comboQueued = false;
  private comboWindow = 0;
  private locomotion = '';
  private attack: AttackDef | null = null;
  private swingId = 0;
  private fired = false;
  private smeared = false;
  private chargeT = 0;
  private hurtT = 0;
  private blockSince = 99;
  private flip = false;
  private kx = 0;
  private kz = 0;

  constructor(private char: Character, public style: StyleId, private deps: FootDeps) {}

  get active() { return this.onFoot && this.state !== 'down'; }

  place(x: number, z: number, yaw: number, ground: IslandGround) {
    this.x = x; this.z = z; this.yaw = yaw;
    const h = ground.height(x, z);
    this.y = Number.isFinite(h) ? h : 0;
    this.prev = { x, z, y: this.y, yaw };
    this.state = 'move';
    this.locomotion = '';
    this.kx = this.kz = 0;
  }

  /** Volle Heilung (nach K.O. oder Rast) */
  revive() { this.hp = this.maxHp; this.state = 'move'; this.locomotion = ''; }

  receiveHit(dmg: number, dirX: number, dirZ: number, knock: number, _from: Enemy | null): 'hit' | 'blocked' | 'parried' | 'dodged' {
    if (!this.active) return 'dodged';
    if (this.iframes > 0) return 'dodged';
    if (this.state === 'block') {
      // Von vorn? Dann Block bzw. perfekte Parade
      const facing = Math.sin(this.yaw) * -dirX + Math.cos(this.yaw) * -dirZ;
      if (facing > 0.2) {
        if (this.blockSince < PLAYER_BASE.parryWindow) {
          this.char.play('parry', { restart: true, fade: 0.04, onDone: () => this.toMove() });
          this.state = 'attack';
          this.attack = null;
          return 'parried';
        }
        this.hp -= dmg * (1 - PLAYER_BASE.blockReduce);
        this.kx += dirX * knock * 0.4; this.kz += dirZ * knock * 0.4;
        this.char.play('blockHit', { restart: true, fade: 0.04, onDone: () => { if (this.state === 'block') this.char.play('block', { fade: 0.1 }); } });
        if (this.hp <= 0) this.goDown();
        return 'blocked';
      }
    }
    this.hp -= dmg;
    this.kx += dirX * knock;
    this.kz += dirZ * knock;
    if (this.hp <= 0) { this.goDown(); return 'hit'; }
    this.state = 'hurt';
    this.hurtT = knock > 6 ? 0.55 : 0.3;
    this.attack = null;
    this.char.play(knock > 6 ? 'hitHeavy' : 'hit', { restart: true, fade: 0.04 });
    return 'hit';
  }

  private goDown() {
    this.hp = 0;
    this.state = 'down';
    this.attack = null;
    this.char.play('deathLong', { restart: true, fade: 0.08 });
    this.deps.onDown();
  }

  update(dt: number, input: Input, camYaw: number, ground: IslandGround, lockYaw: number | null) {
    this.prev = { x: this.x, z: this.z, y: this.y, yaw: this.yaw };
    this.iframes -= dt;
    this.comboWindow -= dt;
    this.blockSince += dt;
    const mv = input.move();
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let dx = fx * mv.y + rx * mv.x;
    let dz = fz * mv.y + rz * mv.x;
    const dl = Math.hypot(dx, dz);
    if (dl > 0.001) { dx /= dl; dz /= dl; }
    const attackYaw = lockYaw ?? (dl > 0.001 ? Math.atan2(dx, dz) : this.yaw);
    const atks = STYLE_ATTACKS[this.style];
    const canAct = this.state === 'move' || this.state === 'block';

    if (this.state === 'down') {
      this.speed = 0;
      this.applyMove(dt, 0, 0, ground);
      return;
    }

    // Eingaben
    if (input.pressed('dodge') && (canAct || this.state === 'attack' && this.char.progress > 0.45 || this.state === 'hurt' && this.hurtT < 0.15)) {
      this.state = 'roll';
      this.rollT = ROLL_TIME;
      this.iframes = PLAYER_BASE.rollIframes;
      this.rollDir = dl > 0.001 ? { x: dx, z: dz } : { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
      this.yaw = Math.atan2(this.rollDir.x, this.rollDir.z);
      this.char.play(dl > 0.001 ? 'roll' : 'dodgeBack', { fade: 0.06, restart: true });
      if (dl <= 0.001) this.yaw += Math.PI;
      this.locomotion = '';
      this.attack = null;
      this.deps.fx?.puff(new Vector3(this.x, this.y, this.z), 10);
      this.deps.overlay?.speedlines(0.35);
    }
    if (input.pressed('attack') && this.state !== 'roll' && this.state !== 'hurt' && this.state !== 'charge') {
      if (this.state === 'attack') this.comboQueued = true;
      else this.startAttack(atks.combo[this.nextCombo(atks.combo.length)], attackYaw);
    }
    if (input.pressed('heavy') && canAct) {
      this.state = 'charge';
      this.chargeT = 0;
      this.yaw = attackYaw;
      this.char.playClip(atks.charge.clip, { loop: false, speed: 0.15, fade: 0.1, restart: true });
      this.locomotion = '';
    }
    if (input.pressed('block')) this.blockSince = 0;
    if (canAct) {
      const blocking = input.down('block');
      if (blocking && this.state !== 'block') { this.state = 'block'; this.char.play('block', { fade: 0.08 }); this.locomotion = ''; }
      else if (!blocking && this.state === 'block') this.toMove();
    }

    // Zustände
    let vx = 0, vz = 0;
    switch (this.state) {
      case 'roll': {
        this.rollT -= dt;
        const k = Math.max(0.25, this.rollT / ROLL_TIME);
        vx = this.rollDir.x * ROLL_SPEED * k;
        vz = this.rollDir.z * ROLL_SPEED * k;
        if (this.rollT <= 0) this.toMove();
        break;
      }
      case 'charge':
        this.chargeT += dt;
        if (lockYaw !== null) this.yaw = lockYaw;
        if (Math.random() < dt * 30) this.deps.fx?.puff(new Vector3(this.x + (Math.random() - 0.5), this.y + Math.random() * 1.8, this.z + (Math.random() - 0.5)), 2);
        if (!input.down('heavy') || this.chargeT >= CHARGE_TIME) {
          const full = this.chargeT >= CHARGE_TIME * 0.8;
          this.state = 'move';
          this.startAttack(full ? atks.charge : atks.heavy, this.yaw);
          if (full) { this.deps.overlay?.speedlines(1); this.deps.overlay?.showCutin(`${STYLE_ANIMS[this.style].label}!`, STYLE_COLOR[this.style]); }
        }
        break;
      case 'attack':
        this.processAttack(dt);
        if (this.attack) {
          const p = this.char.progress;
          const lunge = this.attack.lunge ?? 2;
          if (p < this.attack.hitStart + 0.05) { vx = Math.sin(this.yaw) * lunge; vz = Math.cos(this.yaw) * lunge; }
        }
        break;
      case 'block':
        if (lockYaw !== null) this.yaw = lockYaw;
        else if (dl > 0.001) this.turnTo(Math.atan2(dx, dz), dt, 6);
        vx = dx * mag * WALK * 0.5;
        vz = dz * mag * WALK * 0.5;
        break;
      case 'hurt':
        this.hurtT -= dt;
        if (this.hurtT <= 0) this.toMove();
        break;
      case 'move':
        if (mag > 0.05) {
          const sp = mag > 0.7 ? RUN : WALK * (mag / 0.7) + 0.6;
          vx = dx * sp;
          vz = dz * sp;
          this.turnTo(lockYaw !== null && mag < 0.7 ? lockYaw : Math.atan2(dx, dz), dt, 12);
        } else if (lockYaw !== null) this.turnTo(lockYaw, dt, 8);
        break;
    }
    this.speed = Math.hypot(vx, vz);
    this.applyMove(dt, vx, vz, ground);

    if (this.state === 'move') {
      const want = this.speed < 0.1 ? 'idle' : this.speed > 4 ? 'run' : 'walk';
      if (want !== this.locomotion) {
        this.locomotion = want;
        if (want === 'idle') this.char.playClip(STYLE_ANIMS[this.style].idle.clip, { loop: true, fade: 0.25 });
        else this.char.play(want === 'run' ? 'run' : 'walk', { fade: 0.2 });
      }
    }
  }

  private applyMove(dt: number, vx: number, vz: number, ground: IslandGround) {
    this.kx *= Math.pow(0.01, dt);
    this.kz *= Math.pow(0.01, dt);
    const c = ground.constrain(this.x + (vx + this.kx) * dt, this.z + (vz + this.kz) * dt);
    this.x = c.x;
    this.z = c.z;
    const h = ground.height(this.x, this.z);
    const targetY = Number.isFinite(h) ? h : this.y;
    this.y += (targetY - this.y) * Math.min(1, dt * 15);
  }

  private turnTo(want: number, dt: number, rate: number) {
    const diff = MathUtils.euclideanModulo(want - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
    this.yaw += diff * Math.min(1, dt * rate);
  }

  private nextCombo(n: number) {
    if (this.comboWindow <= 0) this.combo = 0;
    const i = this.combo % n;
    this.combo++;
    return i;
  }

  private startAttack(def: AttackDef, yaw: number) {
    this.state = 'attack';
    this.attack = def;
    this.yaw = yaw;
    this.comboQueued = false;
    this.locomotion = '';
    this.fired = false;
    this.smeared = false;
    this.flip = !this.flip;
    this.swingId++;
    this.deps.combat?.beginSwing(this.swingId);
    const a = this.char.playClip(def.clip, { loop: false, speed: def.speed, fade: 0.06, restart: true, onDone: () => this.endAttack() });
    if (!a) this.endAttack();
  }

  private processAttack(_dt: number) {
    const def = this.attack;
    if (!def) return;
    const p = this.char.progress;
    const color = STYLE_COLOR[this.style];
    if (!this.smeared && p >= def.hitStart - 0.06 && !def.projectile && def.fx !== 'punch') {
      this.smeared = true;
      const tilt = def.smearTilt ?? (def.fx === 'heavy' ? 1.45 : 0.4);
      this.deps.fx?.smear(new Vector3(this.x, this.y + 1.05, this.z), this.yaw, tilt, def.range, def.arc, color, this.flip);
    }
    if (p >= def.hitStart && p <= def.hitEnd) {
      if (def.projectile) {
        if (!this.fired) { this.fired = true; this.deps.combat?.shoot(def, this.x, this.y, this.z, this.yaw, this.dmgMult); }
      } else {
        this.deps.combat?.swing(this.swingId, def, this.x, this.y, this.z, this.yaw, this.dmgMult, color);
      }
    }
    if (p >= def.hitStart && def.fx === 'heavy' && !this.fired && !def.projectile) {
      this.fired = true;
      const front = new Vector3(this.x + Math.sin(this.yaw) * 1.6, this.y, this.z + Math.cos(this.yaw) * 1.6);
      this.deps.fx?.shockwave(front, def.range * 1.3, color);
      this.deps.fx?.crack(front, def.range * 1.2);
    }
    // Kombo früh fortsetzen, sobald der Treffer raus ist
    if (this.comboQueued && p > def.hitEnd + 0.12) this.endAttack();
  }

  private endAttack() {
    if (this.state !== 'attack') return;
    this.attack = null;
    this.comboWindow = 0.55;
    this.state = 'move';
    this.locomotion = '';
    if (this.comboQueued) {
      const atks = STYLE_ATTACKS[this.style];
      this.startAttack(atks.combo[this.nextCombo(atks.combo.length)], this.yaw);
    }
  }

  private toMove() { this.state = 'move'; this.locomotion = ''; this.attack = null; }
}
