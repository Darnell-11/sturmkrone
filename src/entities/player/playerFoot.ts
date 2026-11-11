import { MathUtils, Vector3, type AnimationAction } from 'three';
import type { Input } from '../../core/input/input';
import { STYLE_ANIMS, type StyleId } from '../../data/animations';
import { FINISHERS, PLAYER_BASE, STAMINA, STYLE_ATTACKS, type AttackDef } from '../../data/combat';
import type { CombatSystem, PlayerTarget } from '../../combat/combat';
import type { CombatFx } from '../../combat/fx';
import type { CombatOverlay } from '../../ui/combatOverlay';
import type { Ground } from '../../world/islandGround';
import type { Character } from '../character/character';
import type { Enemy } from '../enemy';
import type { DecalHandle } from '../../render/decals';

const WALK = 2.4;
const RUN = 6.2;
const ROLL_SPEED = 10;
const ROLL_TIME = 0.42;
const CHARGE_TIME = 0.85;
/**
 * Überblendzeiten der Animationen (Sekunden): weich, aber ohne Verzögerung der Trefferzeitpunkte –
 * die Clips laufen beim Überblenden bereits, nur ihr Gewicht steigt.
 */
const FADE = { attack: 0.15, combo: 0.12, dodge: 0.15, cast: 0.15, locomotion: 0.2, idle: 0.2, block: 0.12, hurt: 0.08 };
/** Eingabepuffer: so lange (Sekunden) bleibt ein zu früh gedrückter Angriff/eine Rolle gültig */
const BUFFER = 0.25;

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
  /** Waffe gewechselt: neue Waffen in die Hände, Fähigkeiten-Werte neu rechnen */
  onSwap?: (style: StyleId) => void;
}

/** Steuerung und Kampf zu Fuß. */
/** Vorlauf des Klingen-Sweeps vor dem Trefferfenster (Anteil der Animation) */
const SWEEP_LEAD = 0.2;
/** Nachlauf: manche Hiebe (Abwärts-Chops, Tritte) treffen erst kurz nach dem Fenster */
const SWEEP_TAIL = 0.22;

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
  /** Schadensreduktion 0 … 0,85, Ausweichchance, Tempo, Unverwundbarkeit (Fähigkeiten) */
  reduce = 0;
  /** Schadensminderung durch Ausrüstung und Stärkungen (zusätzlich zu den Faji-Passiven) */
  gearReduce = 0;
  dodgeChance = 0;
  speedMult = 1;
  invuln = false;
  parryBonus = 0;
  secondWind = 0;
  private secondWindUsed = false;
  onFoot = false;
  private rollT = 0;
  private iframes = 0;
  private rollDir = { x: 0, z: 1 };
  private combo = 0;
  private comboQueued = false;
  private chaining = false;
  /** Zeitpunkt der letzten noch nicht ausgeführten Eingaben (Logikzeit), -1 = keine */
  private buf = { attack: -1, dodge: -1, heavy: -1 };
  private clock = 0;
  private comboWindow = 0;
  private locomotion = '';
  private attack: AttackDef | null = null;
  private attackAction: AnimationAction | null = null;
  /** Ziel des laufenden Angriffs (Zielhilfe ohne Erfassung) */
  private aim: Enemy | null = null;
  private swingId = 0;
  private fired = false;
  private smeared = false;
  private chargeT = 0;
  private hurtT = 0;
  private blockSince = 99;
  private flip = false;
  private kx = 0;
  private kz = 0;
  /** Gemessenes, geglättetes Lauftempo (m/s) für die Schrittgeschwindigkeit */
  private realSpeed = 0;
  /** Ausdauer (Rolle, schwere Hiebe); staminaPause = Sekunden bis zum Aufladen, staminaFlash = Anzeige „zu wenig“ */
  stamina = STAMINA.max;
  readonly maxStamina = STAMINA.max;
  private staminaPause = 0;
  staminaFlash = 0;
  /** Art des laufenden Hiebs: leicht (Kombo), schwer oder Kombo-Finisher */
  private kind: 'light' | 'heavy' | 'finisher' = 'light';
  private finFx = false;
  /** Wechsel-Abklingzeit und Schadensfaktor des laufenden Hiebs (Wechselschlag) */
  private swapCd = 0;
  private swMult = 1;

  private spend(cost: number) {
    this.stamina = Math.max(0, this.stamina - cost);
    this.staminaPause = STAMINA.delay;
  }

  constructor(private char: Character, public style: StyleId, private deps: FootDeps) {}

  get active() { return this.onFoot && this.state !== 'down'; }

  place(x: number, z: number, yaw: number, ground: Ground) {
    this.x = x; this.z = z; this.yaw = yaw;
    const h = ground.height(x, z);
    this.y = Number.isFinite(h) ? h : 0;
    this.prev = { x, z, y: this.y, yaw };
    this.state = 'move';
    this.locomotion = '';
    this.kx = this.kz = 0;
    this.realSpeed = 0;
    this.stamina = STAMINA.max;
    this.combo = 0;
  }

  /**
   * Waffenwechsel. Aus Ruhe oder Lauf: die Waffen wechseln sofort, ein Ring und Funken zeigen es an.
   * Mitten in der Kombo (Schlag läuft oder Kombo-Fenster offen): Wechselschlag – der nächste Hieb der neuen Waffe
   * setzt ohne Pause an (kurze Überblendung), trifft 1,6-fach und führt die Kombo mit der neuen Waffe weiter.
   * Gibt zurück, ob gewechselt wurde.
   */
  swapTo(style: StyleId, yawHint: number | null): boolean {
    if (!this.active || this.swapCd > 0 || this.state === 'roll' || this.state === 'hurt' || this.state === 'charge') return false;
    if (style === this.style) return false;
    if (this.stamina < STAMINA.need) { this.staminaFlash = 0.35; return false; }
    const mid = this.state === 'attack' || (this.comboWindow > 0 && this.combo > 0);
    this.spend(STAMINA.swap);
    this.swapCd = 0.4;
    this.style = style;
    this.deps.onSwap?.(style);
    const at = new Vector3(this.x, this.y, this.z);
    this.deps.fx?.puffColor(at.clone().setY(this.y + 1.1), STYLE_COLOR[style]);
    if (!mid) {
      this.deps.fx?.shockwave(at.clone().setY(this.y + 0.1), 1.6, STYLE_COLOR[style]);
      this.deps.overlay?.number(new Vector3(this.x, this.y + 2.3, this.z), 'Waffe gewechselt', 'info');
      return true;
    }
    const atks = STYLE_ATTACKS[style];
    const def = atks.combo[this.combo % atks.combo.length];
    this.buf.attack = -1;
    this.comboQueued = false;
    this.chaining = true;
    this.combo = Math.min(this.combo + 1, 2);
    this.comboWindow = 0.9;
    this.startAttack(def, yawHint ?? this.yaw, 'light', 1.6);
    this.deps.fx?.shockwave(at.clone().setY(this.y + 0.1), 2.4, STYLE_COLOR[style]);
    this.deps.overlay?.number(new Vector3(this.x, this.y + 2.3, this.z), 'Wechselschlag!', 'crit');
    this.deps.overlay?.speedlines(0.6);
    return true;
  }

  /** Volle Heilung (nach K.O. oder Rast) */
  revive() { this.hp = this.maxHp; this.state = 'move'; this.locomotion = ''; this.secondWindUsed = false; }

  /** Kann gerade eine Fähigkeit gewirkt werden? */
  get canCast() { return this.active && (this.state === 'move' || this.state === 'block'); }

  /** Zauber-/Technik-Animation abspielen (Wirkung kommt aus der Fähigkeit) */
  cast(clip: string, speed: number, yaw: number | null) {
    if (yaw !== null) this.yaw = yaw;
    this.state = 'attack';
    this.attack = null;
    this.locomotion = '';
    const a = this.char.playClip(clip, { loop: false, speed, fade: FADE.cast, restart: true, onDone: () => this.endAttack() });
    if (!a) this.toMove();
  }

  receiveHit(dmg: number, dirX: number, dirZ: number, knock: number, _from: Enemy | null): 'hit' | 'blocked' | 'parried' | 'dodged' {
    if (!this.active) return 'dodged';
    if (this.iframes > 0 || this.invuln) return 'dodged';
    if (Math.random() < this.dodgeChance) return 'dodged';
    dmg *= 1 - Math.min(0.85, this.reduce + this.gearReduce);
    if (this.state === 'block') {
      // Von vorn? Dann Block bzw. perfekte Parade
      const facing = Math.sin(this.yaw) * -dirX + Math.cos(this.yaw) * -dirZ;
      if (facing > 0.2) {
        if (this.blockSince < PLAYER_BASE.parryWindow * (1 + this.parryBonus)) {
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
    if (this.secondWind > 0 && !this.secondWindUsed && this.hp > 0 && this.hp < this.maxHp * 0.25) {
      this.secondWindUsed = true;
      this.hp += this.maxHp * this.secondWind;
      this.deps.overlay?.number(new Vector3(this.x, this.y + 2.2, this.z), 'Zweiter Atem!', 'heal');
    }
    // Treffer: Ränder der Figur leuchten kurz rot auf
    this.char.hitFlash('#FF5A3C', knock > 6 ? 1.3 : 1);
    if (this.hp <= 0) { this.goDown(); return 'hit'; }
    this.state = 'hurt';
    this.hurtT = knock > 6 ? 0.55 : 0.3;
    this.attack = null;
    this.char.play(knock > 6 ? 'hitHeavy' : 'hit', { restart: true, fade: FADE.hurt });
    return 'hit';
  }

  private goDown() {
    this.hp = 0;
    this.state = 'down';
    this.attack = null;
    this.char.play('deathLong', { restart: true, fade: 0.08 });
    this.deps.onDown();
  }

  /** Zeit im aktuellen Zustand (Wächter gegen Zustände, die nie enden) */
  private stateT = 0;
  private stateWas: FootState = 'move';

  update(dt: number, input: Input, camYaw: number, ground: Ground, lockYaw: number | null) {
    // Softlock-Wächter: Parade, Fähigkeiten und Schläge enden über das „Animation fertig“-Ereignis. Geht es verloren
    // (andere Animation dazwischen, fehlender Clip), wäre die Figur sonst dauerhaft gesperrt.
    if (this.state !== this.stateWas) { this.stateWas = this.state; this.stateT = 0; } else this.stateT += dt;
    if ((this.state === 'attack' && this.stateT > 4) || ((this.state === 'roll' || this.state === 'hurt') && this.stateT > 2)) this.toMove();
    const pv = this.prev;
    pv.x = this.x; pv.z = this.z; pv.y = this.y; pv.yaw = this.yaw;
    this.iframes -= dt;
    this.swapCd -= dt;
    this.comboWindow -= dt;
    this.blockSince += dt;
    this.clock += dt;
    // Ausdauer: nach kurzer Pause laden, im Stand schneller
    this.staminaFlash = Math.max(0, this.staminaFlash - dt);
    if (this.staminaPause > 0) this.staminaPause -= dt;
    else if (this.stamina < STAMINA.max) this.stamina = Math.min(STAMINA.max, this.stamina + dt * (this.state === 'move' && this.realSpeed < 0.5 ? STAMINA.regenIdle : STAMINA.regen));
    // Eingaben puffern: was zu früh kommt (mitten in Rolle, Treffer oder Schlag), wird nachgeholt, sobald es geht
    // Während einer Rolle oder Trefferreaktion zählt die Eingabe ab deren Ende (sonst verfiele sie bei langen Rollen)
    const busy = this.state === 'roll' ? Math.max(0, this.rollT) : this.state === 'hurt' ? Math.max(0, this.hurtT) : 0;
    if (input.pressed('attack')) this.buf.attack = this.clock + busy;
    if (input.pressed('dodge')) this.buf.dodge = this.clock + busy;
    if (input.pressed('heavy')) this.buf.heavy = this.clock + busy;
    const wants = (k: 'attack' | 'dodge' | 'heavy') => this.buf[k] >= 0 && this.clock - Math.min(this.clock, this.buf[k]) <= BUFFER;
    const mv = input.move();
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let dx = fx * mv.y + rx * mv.x;
    let dz = fz * mv.y + rz * mv.x;
    const dl = Math.hypot(dx, dz);
    if (dl > 0.001) { dx /= dl; dz /= dl; }
    const wantYaw = lockYaw ?? (dl > 0.001 ? Math.atan2(dx, dz) : this.yaw);
    // Zielhilfe: ohne Erfassung zum nächsten Gegner in Blickrichtung (ohne Stickrichtung: rundum) drehen
    const aimAt = lockYaw === null ? this.deps.combat?.nearestInCone(this.x, this.z, wantYaw, 5.5, dl > 0.001 ? 1.2 : Math.PI) ?? null : null;
    const attackYaw = aimAt ? Math.atan2(aimAt.x - this.x, aimAt.z - this.z) : wantYaw;
    const atks = STYLE_ATTACKS[this.style];
    const canAct = this.state === 'move' || this.state === 'block';

    if (this.state === 'down') {
      this.speed = 0;
      this.applyMove(dt, 0, 0, ground);
      return;
    }

    // Eingaben
    // Rolle: auch aus dem Ausschwung eines Schlags, kurz vor Ende einer Trefferreaktion oder direkt nach der letzten Rolle
    const canRoll = canAct || this.state === 'attack' && this.char.progress > 0.45 || this.state === 'hurt' && this.hurtT < 0.15 || this.state === 'roll' && this.rollT < 0.06;
    if (wants('dodge') && canRoll && this.stamina < STAMINA.need) this.staminaFlash = 0.35;
    if (wants('dodge') && canRoll && this.stamina >= STAMINA.need) {
      this.spend(STAMINA.roll);
      this.buf.dodge = -1;
      this.buf.attack = this.buf.attack > this.clock - 0.05 ? this.buf.attack : -1;
      this.state = 'roll';
      this.rollT = ROLL_TIME;
      this.iframes = PLAYER_BASE.rollIframes;
      this.rollDir = dl > 0.001 ? { x: dx, z: dz } : { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
      this.yaw = Math.atan2(this.rollDir.x, this.rollDir.z);
      this.char.play(dl > 0.001 ? 'roll' : 'dodgeBack', { fade: FADE.dodge, restart: true });
      if (dl <= 0.001) this.yaw += Math.PI;
      this.locomotion = '';
      this.attack = null;
      this.deps.fx?.puff(new Vector3(this.x, this.y, this.z), 10);
      this.deps.overlay?.speedlines(0.35);
    }
    if (wants('attack') && this.state !== 'roll' && this.state !== 'hurt' && this.state !== 'charge') {
      this.buf.attack = -1;
      if (this.state === 'attack') this.comboQueued = true;
      else { this.aim = aimAt; this.startAttack(atks.combo[this.nextCombo(atks.combo.length)], attackYaw); }
    }
    // Nach dem Treffer bricht Laufen den Ausschwung ab – man ist nie lange festgenagelt
    if (this.state === 'attack' && this.attack && !this.comboQueued && mag > 0.35 && this.char.progress > this.attack.hitEnd + 0.15) {
      this.toMove();
    }
    // Leicht → Leicht → Schwer: aus dem zweiten Hieb (sobald er „sitzt“) oder kurz danach wird der schwere Hieb zum Finisher
    const atkNow = this.attack;
    const finisherReady = this.combo >= 2 && (
      (this.state === 'attack' && this.kind === 'light' && !!atkNow && this.char.progress > atkNow.hitStart - 0.05)
      || (canAct && this.comboWindow > 0));
    if (wants('heavy') && (finisherReady || canAct)) {
      if (this.stamina < STAMINA.need) this.staminaFlash = 0.35;
      else if (finisherReady) {
        this.buf.heavy = -1;
        this.spend(STAMINA.finisher);
        this.combo = 0;
        this.comboWindow = 0;
        this.comboQueued = false;
        this.aim = aimAt;
        this.chaining = true;
        this.startAttack(FINISHERS[this.style], attackYaw, 'finisher');
      } else {
        this.buf.heavy = -1;
        this.spend(STAMINA.heavy);
        this.state = 'charge';
        this.chargeT = 0;
        this.yaw = attackYaw;
        this.aim = aimAt;
        this.char.playClip(atks.charge.clip, { loop: false, speed: 0.15, fade: FADE.attack, restart: true });
        this.locomotion = '';
      }
    }
    if (input.pressed('block')) this.blockSince = 0;
    if (canAct) {
      const blocking = input.down('block');
      if (blocking && this.state !== 'block') { this.state = 'block'; this.char.play('block', { fade: FADE.block }); this.locomotion = ''; }
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
      case 'charge': {
        this.chargeT += dt;
        if (lockYaw !== null) this.yaw = lockYaw;
        // Auflade-Aura: wachsendes Siegel am Boden, aufsteigende Funken, flirrende Luft
        const fx = this.deps.fx;
        if (fx) {
          const k = Math.min(1, this.chargeT / CHARGE_TIME);
          const col = STYLE_COLOR[this.style];
          if (!this.aura) {
            this.aura = fx.sigil(new Vector3(this.x, this.y, this.z), 1.6, col, 99);
            fx.decals.hold(this.aura, true);
            this.auraHeat = fx.heat(new Vector3(this.x, this.y + 1, this.z), 1.6, 0.3, 99);
            this.auraHeat.held = true;
          }
          fx.decals.move(this.aura, this.x, this.y, this.z, 1.6 + k * 1.8);
          this.auraHeat!.x = this.x; this.auraHeat!.y = this.y + 1; this.auraHeat!.z = this.z; this.auraHeat!.k = 0.3 + k * 0.5;
          if (Math.random() < dt * (12 + k * 30)) fx.rise(new Vector3(this.x, this.y, this.z), col, 1, 0.9);
        }
        if (Math.random() < dt * 30) this.deps.fx?.puff(new Vector3(this.x + (Math.random() - 0.5), this.y + Math.random() * 1.8, this.z + (Math.random() - 0.5)), 2);
        if (!input.down('heavy') || this.chargeT >= CHARGE_TIME) {
          const full = this.chargeT >= CHARGE_TIME * 0.8;
          this.state = 'move';
          this.startAttack(full ? atks.charge : atks.heavy, this.yaw, 'heavy');
          if (full) { this.deps.overlay?.speedlines(1); this.deps.overlay?.showCutin(`${STYLE_ANIMS[this.style].label}!`, STYLE_COLOR[this.style]); }
          this.endAura();
        }
        break;
      }
      case 'attack':
        this.processAttack(dt);
        if (this.attack) {
          const p = this.char.progress;
          let lunge = this.attack.lunge ?? 2;
          const tgt = this.aim?.alive ? this.aim : null;
          if (tgt) {
            // auf das Ziel zugleiten, aber davor stehen bleiben statt hindurchzulaufen
            const gap = Math.hypot(tgt.x - this.x, tgt.z - this.z) - tgt.radius - this.attack.range * 0.55;
            lunge = gap <= 0 ? 0 : Math.min(9, Math.max(lunge, gap * 5));
            this.turnTo(Math.atan2(tgt.x - this.x, tgt.z - this.z), dt, 14);
          }
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
          const sp = (mag > 0.7 ? RUN : WALK * (mag / 0.7) + 0.6) * this.speedMult;
          vx = dx * sp;
          vz = dz * sp;
          this.turnTo(lockYaw !== null && mag < 0.7 ? lockYaw : Math.atan2(dx, dz), dt, 12);
        } else if (lockYaw !== null) this.turnTo(lockYaw, dt, 8);
        break;
    }
    this.speed = Math.hypot(vx, vz);
    this.applyMove(dt, vx, vz, ground);
    // Neigung nach dem tatsächlichen Tempo: an einer Wand lehnt sich die Figur nicht ins Leere
    this.char.lean(this.yaw, Math.min(this.speed, this.realSpeed + 0.3), dt);
    // Lichtschweif an der Waffe: während des Hiebs (vom Ausholen bis kurz nach dem Treffer) und beim Wirken
    {
      const a = this.attack;
      const p = this.char.progress;
      const swing = this.state === 'attack' && (a ? !a.projectile && p >= a.hitStart - 0.14 && p <= a.hitEnd + 0.1 : true);
      this.char.setTrail(swing, STYLE_COLOR[this.style]);
    }
    if (this.state === 'move' && this.onFoot) this.char.footsteps(this.x, this.y, this.z);

    // Tatsächliches Tempo (nicht das befohlene): an Wänden oder Hängen laufen die Füße sonst auf der Stelle
    const moved = dt > 0 ? Math.hypot(this.x - pv.x, this.z - pv.z) / dt : this.speed;
    this.realSpeed += (Math.min(moved, this.speed * 1.5 + 0.5) - this.realSpeed) * Math.min(1, dt * 18);

    if (this.state === 'move') {
      // Schwellen mit Hysterese, damit Gehen/Rennen/Stehen an der Grenze nicht flackern
      const cur = this.locomotion;
      const sp = this.realSpeed;
      const want = cur === 'idle' || cur === ''
        ? (sp > 0.25 ? (sp > 3.4 ? 'run' : 'walk') : 'idle')
        : cur === 'run' ? (sp < 2.7 ? (sp < 0.15 ? 'idle' : 'walk') : 'run')
          : (sp > 3.4 ? 'run' : sp < 0.15 ? 'idle' : 'walk');
      if (want !== this.locomotion) {
        this.locomotion = want;
        if (want === 'idle') this.char.playClip(STYLE_ANIMS[this.style].idle.clip, { loop: true, fade: FADE.idle });
        else this.char.play(want === 'run' ? 'run' : 'walk', { fade: FADE.locomotion });
      }
      if (want !== 'idle') this.char.setLocoSpeed(this.realSpeed);
    }
  }

  private applyMove(dt: number, vx: number, vz: number, ground: Ground) {
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

  private startAttack(def: AttackDef, yaw: number, kind: 'light' | 'heavy' | 'finisher' = 'light', mult = 1) {
    this.swMult = mult;
    this.state = 'attack';
    this.attack = def;
    this.kind = kind;
    this.finFx = false;
    // schwere Hiebe unterbrechen die Leicht-Kette (der Zähler beginnt neu)
    if (kind === 'heavy') this.combo = 0;
    this.yaw = yaw;
    this.comboQueued = false;
    this.locomotion = '';
    this.fired = false;
    this.smeared = false;
    this.flip = !this.flip;
    this.swingId++;
    this.deps.combat?.beginSwing(this.swingId);
    // Kombo-Folgeschlag etwas knapper überblenden als der erste Schlag aus dem Stand/Lauf
    const fade = this.chaining ? FADE.combo : FADE.attack;
    this.chaining = false;
    const a = this.char.playClip(def.clip, { loop: false, speed: def.speed, fade, restart: true, onDone: () => this.endAttack() });
    this.attackAction = a;
    if (!a) this.endAttack();
  }

  private processAttack(_dt: number) {
    const def = this.attack;
    if (!def) return;
    const p = this.char.progress;
    const color = STYLE_COLOR[this.style];
    // Takt wie im Anime: schnell ausholen, den Hieb sichtbar durchziehen, zügig zurück
    if (this.attackAction) this.attackAction.timeScale = def.speed * (p < def.hitStart - 0.08 ? 1.35 : p <= def.hitEnd ? 0.9 : 1.2);
    if (!this.smeared && p >= def.hitStart - 0.06 && !def.projectile && def.fx !== 'punch') {
      this.smeared = true;
      const tilt = def.smearTilt ?? (def.fx === 'heavy' ? 1.45 : 0.4);
      this.deps.fx?.smear(new Vector3(this.x, this.y + 1.05, this.z), this.yaw, tilt, def.range, def.arc, color, this.flip);
    }
    if (p >= def.hitStart && p <= def.hitEnd && def.projectile) {
      if (!this.fired) { this.fired = true; this.deps.combat?.shoot(def, this.x, this.y, this.z, this.yaw, this.dmgMult * this.swMult); }
    } else if (!def.projectile && p >= def.hitStart - SWEEP_LEAD && p <= def.hitEnd + SWEEP_TAIL) {
      // Klingen-Sweep beginnt etwas vor dem Trefferfenster: viele Animationen ziehen die Klinge früher durch,
      // getroffen wird dort, wo sie sichtbar die Trefferzone schneidet
      this.deps.combat?.swing(this.swingId, def, this.x, this.y, this.z, this.yaw, this.dmgMult * this.swMult, color, this.char, p < def.hitStart || p > def.hitEnd);
    }
    // Finisher: Schockring, Bodenrisse, Impact-Frame und Speedlines beim Durchziehen
    if (this.kind === 'finisher' && !this.finFx && p >= def.hitStart - 0.02) {
      this.finFx = true;
      const fx = this.deps.fx;
      const at = new Vector3(this.x + Math.sin(this.yaw) * 1.2, this.y, this.z + Math.cos(this.yaw) * 1.2);
      fx?.shockwave(at, def.range * 1.6, color);
      fx?.crack(at, def.range * 1.3);
      fx?.sigil(new Vector3(this.x, this.y, this.z), def.range * 1.1, color, 0.9);
      this.deps.overlay?.impactFrame();
      this.deps.overlay?.speedlines(1);
      this.deps.overlay?.finisher();
    }
    if (p >= def.hitStart && def.fx === 'heavy' && this.kind !== 'finisher' && !this.fired && !def.projectile) {
      this.fired = true;
      const front = new Vector3(this.x + Math.sin(this.yaw) * 1.6, this.y, this.z + Math.cos(this.yaw) * 1.6);
      this.deps.fx?.shockwave(front, def.range * 1.3, color);
      this.deps.fx?.crack(front, def.range * 1.2);
    }
    // Kombo früh fortsetzen, sobald der Treffer raus ist
    if (this.comboQueued && p > def.hitEnd + SWEEP_TAIL + 0.02) this.endAttack();
  }

  private endAttack() {
    if (this.state !== 'attack') return;
    this.attack = null;
    this.attackAction = null;
    this.comboWindow = 0.55;
    this.state = 'move';
    this.locomotion = '';
    if (this.comboQueued) {
      const atks = STYLE_ATTACKS[this.style];
      this.chaining = true;
      this.startAttack(atks.combo[this.nextCombo(atks.combo.length)], this.yaw);
    }
  }

  private toMove() { this.state = 'move'; this.locomotion = ''; this.attack = null; this.attackAction = null; this.endAura(); }

  // Auflade-Aura (Siegel + Hitze), solange der schwere Angriff aufgeladen wird
  private aura: DecalHandle | null = null;
  private auraHeat: { x: number; y: number; z: number; k: number; held: boolean; life: number; t: number } | null = null;
  /** Beim Verlassen der Insel/K.O.: laufende Effekte (Aura, Schweif) beenden */
  stopEffects() {
    this.endAura();
    this.char.setTrail(false);
    if (this.state === 'charge') this.toMove();
  }

  private endAura() {
    if (this.aura) { this.deps.fx?.decals.hold(this.aura, false, 0.35); this.aura = null; }
    if (this.auraHeat) { this.auraHeat.held = false; this.auraHeat.life = this.auraHeat.t + 0.3; this.auraHeat = null; }
  }
}
