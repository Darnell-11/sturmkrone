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
import { BOSS, ENEMIES, enemyScale, type EnemyAttack, type EnemyDef, type EnemyKind } from '../data/combat';
import { randomLook, type NpcRole } from '../data/characterParts';
import { gearForNpc } from '../data/gear';
import type { Faction } from '../core/save/types';
import type { CharacterAssets } from './character/assets';
import { Character } from './character/character';
import { enemyWeapons } from './character/weapons';
import { markShared } from '../render/dispose';
import { NavAgent, type NavGrid } from '../ai/navGrid';
import { ENEMY_TREE, perceive, type BrainCtx } from '../ai/enemyBrain';
import { Hurtbox } from '../combat/hitbox';

export type EnemyState = 'idle' | 'patrol' | 'suspicious' | 'chase' | 'strafe' | 'flank' | 'retreat' | 'windup' | 'attack' | 'recover' | 'hit' | 'stagger' | 'air' | 'down' | 'dead' | 'transition';

/** Zustände, in denen der Verhaltensbaum entscheidet (alle anderen gehören zu Angriffen und Treffer-Reaktionen) */
const FREE: ReadonlySet<EnemyState> = new Set(['idle', 'patrol', 'suspicious', 'chase', 'strafe', 'flank', 'retreat']);
/** Zustände ohne Kampf (zählen nicht als „im Gefecht“ für den Lager-Alarm) */
const CALM: ReadonlySet<EnemyState> = new Set(['idle', 'patrol', 'suspicious']);

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
  /** Begehbarkeits-Netz der Insel (null an Deck: dort ist alles frei) */
  readonly nav: NavGrid | null;
  /** Blickrichtung des aktuellen Ziels (NaN, wenn unbekannt) */
  readonly targetYaw: number;
  /** Wie viele andere Gegner greifen das Ziel von e gerade an? */
  attackersNear(e: Enemy): number;
  /** Boss beginnt Phase 2 oder 3 (Brüllen, Schockring, Banner) */
  bossPhase(e: Enemy, phase: number): void;
  /** Haltebalken des Bosses leer: „Break“ */
  bossBreak(e: Enemy): void;
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
  return markShared(new CanvasTexture(c));
})();
/** Fragezeichen über dem Kopf: Gegner hat etwas bemerkt, sucht aber noch */
const QUEST_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '900 52px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = '#1b1410';
  g.strokeText('?', 32, 34);
  g.fillStyle = '#ffffff';
  g.fillText('?', 32, 34);
  return markShared(new CanvasTexture(c));
})();
const BRAIN: BrainCtx = { w: null as unknown as EnemyWorld, nav: null, dt: 0, tx: 0, tz: 0, tYaw: NaN, dist: 0, toT: 0, los: false };
const STEER = { x: 0, z: 0 };

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
  timer = 0;
  private atk: EnemyAttack | null = null;
  private struck = false;
  private flash = 0;
  private marker: Sprite;
  private aim: Line | null = null;
  private strafeDir = Math.random() < 0.5 ? -1 : 1;
  /** Boss-Phase 1 … 3 (nach Lebensanteil) */
  phase = 1;
  /** Break: Restzeit, in der der Boss taumelt und mehr Schaden nimmt */
  brokenT = 0;
  /** Nummer des laufenden Angriffs: Warnflächen verfallen, wenn er abgebrochen wird */
  atkSeq = 0;
  /** Sekunden seit dem letzten Treffer (Aufladen des Haltebalkens) */
  private sinceHit = 99;
  /** Zuletzt gewählter Angriff (der Boss wiederholt sich nicht) */
  private lastAtk: EnemyAttack | null = null;
  /** Zugehörigkeit zu einem Weltereignis (Invasion, Elite) – null = normaler Gegner */
  tag: string | null = null;
  // ---------- Verhaltensbaum (Tafel) ----------
  /** Hat das Ziel erkannt und kämpft */
  aggro = false;
  /** Verdacht 0 … 1 (bei 1: Alarm) */
  suspicion = 0;
  /** Letzte bekannte Position des Ziels und Zeit ohne Sicht */
  lkX = 0;
  lkZ = 0;
  unseenT = 0;
  /** Lagerplatz (Patrouille kreist darum) */
  homeX: number;
  homeZ: number;
  patrolWait = Math.random() * 2;
  /** Zielpunkt für Patrouille, Flanke und Rückzug */
  readonly spot = { x: 0, z: 0 };
  /** Seite beim Flankieren (−1 links, 1 rechts) */
  flankSide = Math.random() < 0.5 ? -1 : 1;
  /** Rückzug ab diesem Lebensanteil (Legenden nie, Elite später), einmal je Kampf */
  readonly retreatAt: number;
  retreatT = 0;
  retreatDone = false;
  /** Zuletzt ausgeführtes Blatt des Baums (Anzeige und Tests) */
  btLeaf = '';
  private markerT = 0;
  private lookT = 0;
  private lookYaw = 0;
  readonly agent = new NavAgent();
  /** Trefferzonen (Kopf, Rumpf, Beine), je Logikschritt höchstens einmal aus den Knochen berechnet */
  readonly hurt = new Hurtbox();
  // Bewegungsabsicht des aktuellen Schritts
  private goal = false;
  private gx = 0;
  private gz = 0;
  private gSpeed = 0;
  private gStop = 0.2;
  private faceTarget = false;
  private faceYaw = 0;
  private strafeK = 0;

  constructor(assets: CharacterAssets, readonly kind: EnemyKind, readonly level: number, faction: Faction, x: number, z: number, outline: boolean, readonly name?: string) {
    this.def = ENEMIES[kind];
    const sc = enemyScale(level);
    this.maxHp = this.hp = Math.round(this.def.hp * sc.hp);
    this.dmg = this.def.dmg * sc.dmg;
    this.poise = this.def.poise;
    this.x = x;
    this.z = z;
    this.homeX = this.spot.x = x;
    this.homeZ = this.spot.z = z;
    this.retreatAt = this.def.boss ? 0 : this.def.elite ? 0.15 : kind === 'schlaeger' ? 0.12 : 0.25;
    const role: NpcRole = faction === 'marine' ? (this.def.elite ? 'offizier' : 'marine') : this.def.role === 'offizier' ? 'pirat' : this.def.role;
    const look = randomLook(Math.random, role);
    if (kind === 'schlaeger') { look.body = 'kraeftig'; look.gloves = true; }
    if (this.def.elite) { look.coat = 'kapitaen'; look.coatColor = faction === 'marine' ? '#14284A' : '#4A1418'; }
    // Ausrüstung nach Stufe: Eliten und Bosse tragen ganze Sets, einfache Gegner gelegentlich einzelne Teile
    const gear = gearForNpc(level, this.def.boss ? 'boss' : this.def.elite ? 'elite' : 'normal', faction === 'marine');
    if (gear.length) look.extra = gear;
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
    // Treffer-Randlicht und Auflösen gleich beim Erscheinen vorbereiten (kein Ruckler beim ersten Treffer)
    this.char.enableFx();
  }

  slowT = 0;
  fearT = 0;
  frozenT = 0;

  get alive() { return this.state !== 'dead'; }
  get engaged() { return this.alive && !CALM.has(this.state); }

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
    if (!this.alive || this.state === 'air' || this.state === 'transition') return;
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
  alert() { if (!this.aggro && this.alive) this.becomeAlert(); }

  /** Ziel erkannt: Ausrufezeichen und in den Kampf */
  becomeAlert() {
    if (this.aggro) return;
    this.aggro = true;
    this.suspicion = 1;
    this.bark('alert');
  }

  /** Kurzes Zeichen über dem Kopf: ! (Alarm), ? (Verdacht), Rückzug */
  bark(kind: 'alert' | 'suspect' | 'retreat') {
    if (this.state === 'windup') return;
    const m = this.marker.material as SpriteMaterial;
    m.map = kind === 'suspect' ? QUEST_TEX : EXCL_TEX;
    m.color.set(kind === 'alert' ? new Color(4, 1.2, 0.8) : kind === 'suspect' ? new Color(3.5, 3, 1.2) : new Color(1.4, 2.2, 4));
    this.marker.visible = true;
    this.markerT = kind === 'suspect' ? 0.3 : 0.9;
  }

  /** Verschnaufen nach dem Rückzug: etwas Leben zurück */
  recover(frac: number) { this.hp = Math.min(this.maxHp, this.hp + this.maxHp * frac); }

  // ---------- Absichten für einen Logikschritt (setzt der Verhaltensbaum) ----------
  goTo(x: number, z: number, speedK: number, faceTarget: boolean, faceYaw: number, stop = 0.2) {
    this.goal = true; this.gx = x; this.gz = z; this.gSpeed = speedK; this.gStop = stop;
    this.faceTarget = faceTarget; this.faceYaw = faceYaw;
  }
  stand(faceYaw: number) { this.goal = false; this.faceTarget = true; this.faceYaw = faceYaw; }
  strafe(faceYaw: number, k: number) { this.faceTarget = true; this.faceYaw = faceYaw; this.strafeK = k; }
  lookAround(dt: number) {
    this.goal = false;
    this.lookT -= dt;
    if (this.lookT <= 0) { this.lookT = 1.2 + Math.random() * 1.6; this.lookYaw = this.yaw + (Math.random() - 0.5) * 2.4; }
    this.faceTarget = true; this.faceYaw = this.lookYaw;
  }
  get radius() { return this.def.radius * this.def.scale; }
  get pos() { return new Vector3(this.x, this.y, this.z); }
  /** Kopfhöhe für Balken und Zahlen */
  get head() { return new Vector3(this.x, this.y + 2.2 * this.def.scale, this.z); }
  /** Kopfposition in einen vorhandenen Vektor (für Anzeigen, die jedes Bild laufen) */
  headInto(out: Vector3) { return out.set(this.x, this.y + 2.2 * this.def.scale, this.z); }

  /** Treffer durch den Spieler. Rückgabe: ob geblockt wurde */
  takeHit(h: HitInfo, now: number, w?: EnemyWorld): 'hit' | 'blocked' | 'stagger' | 'kill' {
    if (!this.alive) return 'hit';
    this.aggro = true;
    this.lastHit = now;
    this.sinceHit = 0;
    // Phasenwechsel: der Boss brüllt und ist unverwundbar
    if (this.state === 'transition') return 'blocked';
    // Break: Schwachstelle offen, mehr Schaden
    if (this.brokenT > 0) h = { ...h, dmg: h.dmg * BOSS.breakDmg };
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
    if (!this.aggro) this.becomeAlert();
    // Fresnel-Randlicht: schwere Treffer heller und wärmer
    this.char.hitFlash(h.heavy ? '#FFD9A0' : '#FFFFFF', h.heavy ? 1.3 : 1);
    // Bosse haben Standfestigkeit im Angriff: normale Treffer unterbrechen sie nicht, nur der Break
    if (!this.def.boss) this.cancelAttack();
    if (this.hp <= 0) {
      this.hp = 0;
      this.cancelAttack();
      this.die(h);
      return 'kill';
    }
    // Boss: Haltebalken leer = Break (langes Taumeln, +50 % Schaden), dann lädt er sich neu
    if (this.def.boss) {
      if (this.brokenT <= 0) this.poise -= h.poise * 0.8;
      this.vx += h.dirX * h.knock * 0.3;
      this.vz += h.dirZ * h.knock * 0.3;
      if (this.poise <= 0 && this.brokenT <= 0) {
        this.poise = 0;
        this.brokenT = BOSS.breakTime;
        this.cancelAttack();
        if (this.hasToken) { w?.releaseToken(this); this.hasToken = false; }
        this.state = 'stagger';
        this.timer = BOSS.breakTime;
        this.char.play('stun', { fade: 0.08, restart: true });
        w?.bossBreak(this);
        return 'stagger';
      }
      if (this.state === 'stagger' || this.state === 'attack' || this.state === 'windup') return 'hit';
      this.state = 'hit';
      this.timer = 0.25;
      this.char.play(h.heavy ? 'hitHeavy' : 'hit', { fade: 0.04, restart: true });
      return 'hit';
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
  parried(w?: EnemyWorld) {
    if (this.state === 'transition') return;
    this.cancelAttack();
    this.state = 'stagger';
    this.timer = 1.6;
    if (this.def.boss) {
      // Perfekte Parade nimmt dem Boss 40 % des Haltebalkens; ist er leer, folgt der Break
      this.poise = Math.max(0, this.poise - this.def.poise * 0.4);
      if (this.hasToken) { w?.releaseToken(this); this.hasToken = false; }
      if (this.poise <= 0 && this.brokenT <= 0) { this.brokenT = BOSS.breakTime; this.timer = BOSS.breakTime; w?.bossBreak(this); }
    } else this.poise = this.def.poise;
    this.char.play('stun', { fade: 0.05, restart: true });
  }

  /** Haltebalken 0 … 1 (0 im Break) */
  get breakFrac() { return this.brokenT > 0 ? 0 : Math.max(0, Math.min(1, this.poise / this.def.poise)); }

  /** Phase 2 oder 3 beginnt: Brüllen, kurz unverwundbar, danach neue Angriffe */
  private beginTransition(w: EnemyWorld) {
    this.cancelAttack();
    if (this.hasToken) { w.releaseToken(this); this.hasToken = false; }
    this.state = 'transition';
    this.timer = BOSS.transition;
    this.poise = this.def.poise;
    this.brokenT = 0;
    this.lastAtk = null;
    this.char.play('cheer', { fade: 0.1, restart: true });
    w.bossPhase(this, this.phase);
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
    this.char.setTrail(false);
    this.atk = null;
    this.marker.visible = false;
    if (this.aim) { this.aim.removeFromParent(); this.aim = null; }
  }

  private toChase() { if (this.alive && this.state !== 'air' && this.state !== 'dead') { this.state = 'chase'; this.aggro = true; } }

  /** Zeit nach dem Tod bis zum Entfernen */
  get removable() { return this.state === 'dead' && this.timer <= 0; }

  /** Zeit im aktuellen Zustand (Wächter gegen hängende Angriffe und Flüge) */
  private stateT = 0;
  private stateWas: EnemyState = 'idle';

  update(dt: number, w: EnemyWorld) {
    if (this.state !== this.stateWas) { this.stateWas = this.state; this.stateT = 0; } else this.stateT += dt;
    // Softlock-Wächter: Angriff endet über das Animationsende, Flug über die Landung – beides abgesichert
    if (this.state === 'attack' && this.stateT > 5) this.endAttack(w);
    else if (this.state === 'windup' && this.stateT > 4) { this.cancelAttack(); if (this.hasToken) { w.releaseToken(this); this.hasToken = false; } this.toChase(); }
    else if (this.state === 'air' && this.stateT > 6) { this.vy = 0; this.y = w.ground(this.x, this.z); this.state = 'down'; this.timer = 0.6; this.char.play('lie', { fade: 0.1 }); }
    this.timer -= dt;
    this.sinceHit += dt;
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
    if (def.boss && this.alive) {
      const frac = this.hp / this.maxHp;
      const ph = frac < BOSS.phaseAt[1] ? 3 : frac < BOSS.phaseAt[0] ? 2 : 1;
      if (ph > this.phase && this.state !== 'air') { this.phase = ph; this.dmg *= 1.15; this.beginTransition(w); }
      // Break läuft ab, danach ist der Haltebalken wieder voll; sonst lädt er sich nach 3 s ohne Treffer langsam auf
      if (this.brokenT > 0) {
        this.brokenT -= dt;
        if (this.brokenT <= 0) { this.brokenT = 0; this.poise = this.def.poise; }
      } else if (this.poise < this.def.poise && w.playerActive && this.sinceHit > 3) this.poise = Math.min(this.def.poise, this.poise + this.def.poise * BOSS.breakRegen * dt);
    }
    const speed = def.speed * (def.boss ? 1 + (this.phase - 1) * 0.15 : 1) * (this.slowT > 0 ? 0.45 : 1);

    let mvx = 0, mvz = 0;
    const face = (target: number, rate = 8) => {
      const diff = MathUtils.euclideanModulo(target - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
      this.yaw += diff * Math.min(1, dt * rate);
    };

    if (!w.playerActive && this.state !== 'dead' && this.state !== 'air') {
      if (this.hasToken) { w.releaseToken(this); this.hasToken = false; }
      if (this.state === 'windup' || this.state === 'attack') { this.state = 'idle'; this.cancelAttack(); }
      this.aggro = false;
    }
    this.markerT -= dt;
    if (this.markerT <= 0 && this.marker.visible && this.state !== 'windup') this.marker.visible = false;

    if (FREE.has(this.state)) {
      // ---------- Verhaltensbaum: Wahrnehmung, dann Entscheidung ----------
      const c = BRAIN;
      c.w = w; c.nav = w.nav; c.dt = dt;
      c.tx = p ? p.x : this.x; c.tz = p ? p.z : this.z; c.tYaw = w.targetYaw;
      c.dist = dist; c.toT = toPlayer;
      // Sichtlinie nur prüfen, wenn sie etwas ändern kann (nah genug)
      c.los = !!p && dist < 30 && (!w.nav || w.nav.lineClear(this.x, this.z, p.x, p.z, 0.05));
      const wasSuspect = this.suspicion > 0.3;
      perceive(this, c);
      if (!this.aggro && !wasSuspect && this.suspicion > 0.3) this.bark('suspect');
      this.goal = false; this.strafeK = 0; this.faceTarget = false;
      ENEMY_TREE.tick(this, c);
      if (FREE.has(this.state)) {
        if (this.goal) {
          const rest = this.agent.steer(w.nav, this.x, this.z, this.gx, this.gz, this.radius, dt, STEER);
          if (rest > this.gStop) {
            const k = speed * this.gSpeed * Math.min(1, 0.35 + (rest - this.gStop));
            mvx = STEER.x * k; mvz = STEER.z * k;
          }
        }
        if (this.strafeK > 0) {
          if (Math.random() < dt * 0.25) this.strafeDir *= -1;
          const side = this.faceYaw + (Math.PI / 2) * this.strafeDir;
          mvx += Math.sin(side) * speed * this.strafeK;
          mvz += Math.cos(side) * speed * this.strafeK;
        }
        const sp = Math.hypot(mvx, mvz);
        if (this.faceTarget) face(this.faceYaw);
        else if (sp > 0.3) face(Math.atan2(mvx, mvz), 6);
        const anim = sp > 0.3 ? (sp > 2.6 ? 'run' : 'walk') : 'idle';
        if (this.char.playing !== (anim === 'run' ? 'Running_A' : anim === 'walk' ? 'Walking_A' : 'Idle_A')) this.char.play(anim, { fade: 0.2 });
        if (sp > 0.3) this.char.setLocoSpeed(sp / Math.max(0.6, this.def.scale));
      }
    }

    switch (this.state) {
      case 'transition':
        // Brüllen: Blick zum Spieler, Rückstoß gegen alles ringsum kommt aus bossPhase
        face(toPlayer, 4);
        if (this.timer <= 0) this.toChase();
        break;
      case 'windup':
        // Warnflächen „am Boss“ zeigen dorthin, wo er beim Ausholen hinsah: er dreht sich danach nicht mehr mit
        if (!(this.atk?.zones && this.atk.zones.some((z) => z.at !== 'player'))) face(toPlayer, 5);
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
        // roter Schweif beim Nahkampfhieb (Warnung und Wucht)
        this.char.setTrail(!!this.atk && !this.atk.projectile && this.char.progress < this.atk.hitAt + 0.15, '#FF6A4A');
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
        // nach dem Fallen in Glut auflösen (4 s nach dem Tod wird die Figur entfernt)
        this.char.setDissolve(Math.min(1, Math.max(0, (2.7 - this.timer) / 1.8)));
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
    this.char.place(this.x, this.y, this.z, this.yaw);
    this.char.update(dt);
    this.updateFlash();
  }

  /** Angriff beginnen (Ausholen mit Warnzeichen) – ruft der Verhaltensbaum */
  startWindup(w: EnemyWorld) {
    this.markerT = 0;
    (this.marker.material as SpriteMaterial).map = EXCL_TEX;
    // Bosse: eigene Angriffe je Phase
    const opts = (this.def.boss && this.def.phaseAttacks?.[this.phase as 2 | 3]) || this.def.attacks;
    const p = w.playerPos;
    const dist = p ? Math.hypot(p.x - this.x, p.z - this.z) : 99;
    // Passenden Angriff wählen: Fernkampf auf Distanz, sonst zufällig (Bosse wiederholen sich nicht)
    let usable = opts.filter((a) => a.range >= dist - 0.5 || a.projectile || a.aoe || a.zones);
    if (this.def.boss && usable.length > 1) usable = usable.filter((a) => a !== this.lastAtk);
    this.atk = (usable.length ? usable : opts)[Math.floor(Math.random() * (usable.length || opts.length))];
    this.lastAtk = this.atk;
    this.atkSeq++;
    this.state = 'windup';
    this.timer = this.atk.windup * (this.def.boss && this.phase === 3 ? 0.7 : 1);
    this.marker.visible = true;
    (this.marker.material as SpriteMaterial).color.set(this.atk.aoe || this.atk.windup > 0.7 ? new Color(5, 0.6, 0.3) : new Color(4, 3.2, 0.6));
    // Ausholen: Anfang der Angriffsanimation sehr langsam
    this.char.playClip(this.atk.clip, { loop: false, speed: 0.12, fade: 0.15, restart: true });
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
    this.char.setTrail(false);
    this.atk = null;
    if (this.hasToken) { w.releaseToken(this); this.hasToken = false; }
    this.state = 'recover';
    this.timer = 0.5 + Math.random() * 0.6;
    this.char.play('idle', { fade: 0.2 });
  }

  /** Eingefroren: eisblaue Färbung über das Randlicht (der Treffer-Blitz läuft im Effekt-Shader) */
  private updateFlash() {
    if (this.frozenT > 0) this.char.setTint('#9FE6FF', 0.85);
    // Boss ab Phase 2: dauerhaft gerötete Ränder (entfesselt), in Phase 3 stärker
    else if (this.def.boss && this.phase >= 2 && this.alive) this.char.setTint('#FF3A2A', this.phase >= 3 ? 0.42 : 0.28);
    else this.char.setTint('#9FE6FF', 0);
  }

  dispose() {
    this.cancelAttack();
    this.hasToken = false;
    this.char.dispose();
  }
}

