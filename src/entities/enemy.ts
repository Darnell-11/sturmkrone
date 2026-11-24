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
import { DANGER_POISE, RAID_BOSS_HIT_CAP, dangerOfLevel, enemyArmorRating, mitigation } from '../data/balanceConfig';
import { BOSS, ENEMIES, enemyScale, type EnemyAttack, type EnemyDef, type EnemyKind } from '../data/combat';
import { randomLook, type NpcRole } from '../data/characterParts';
import { gearForNpc, gearFromSet } from '../data/gear';
import type { FactionId } from '../data/factions';
import { applyFactionUniform } from '../data/factionLook';
import type { Faction } from '../core/save/types';
import type { CharacterAssets } from './character/assets';
import { Character } from './character/character';
import { enemyWeapons } from './character/weapons';
import { markShared } from '../render/dispose';
import { NavAgent, type NavGrid } from '../ai/navGrid';
import { ENEMY_TREE, perceive, type BrainCtx } from '../ai/enemyBrain';
import { Hurtbox } from '../combat/hitbox';
import { sweepMove, type SweepGround } from '../combat/sweep';
import { mintEntityId, type EntityId } from '../sim/entityId';
import { ThreatTable } from '../combat/threat';
import { clamp01 } from '../core/mathUtil';

export type EnemyState = 'idle' | 'patrol' | 'suspicious' | 'chase' | 'strafe' | 'flank' | 'retreat' | 'windup' | 'attack' | 'recover' | 'hit' | 'stagger' | 'air' | 'down' | 'dead' | 'transition';

/** Zustände, in denen der Verhaltensbaum entscheidet (alle anderen gehören zu Angriffen und Treffer-Reaktionen) */
const FREE: ReadonlySet<EnemyState> = new Set(['idle', 'patrol', 'suspicious', 'chase', 'strafe', 'flank', 'retreat']);
/** Zustände ohne Kampf (zählen nicht als „im Gefecht“ für den Lager-Alarm) */
const CALM: ReadonlySet<EnemyState> = new Set(['idle', 'patrol', 'suspicious']);

/** Was das Kampfsystem einem Gegner zur Verfügung stellt */
export interface EnemyWorld {
  /** Waffenstufe der Spielfigur (data/items.ts WEAPONS[…].tier): so gut durchschlägt sie die Rüstung der Gegner */
  attackTier?: number;
  playerPos: Vector3 | null;
  playerActive: boolean;
  /** Darf dieser Gegner jetzt angreifen? (höchstens zwei gleichzeitig) */
  requestToken(e: Enemy): boolean;
  releaseToken(e: Enemy): void;
  enemyStrike(e: Enemy, atk: EnemyAttack): void;
  enemyTelegraph(e: Enemy, atk: EnemyAttack): void;
  ground(x: number, z: number, y?: number): number;
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
  /** Urheber des Treffers (Spielfigur, Offizier, Trupp): speist die Bedrohungstabelle der Hauptmänner und Bosse */
  src?: EntityId;
  /** Fernkampf (Geschosse, Fähigkeiten): braucht 130 % Bedrohung, um das Ziel eines Bosses abzulösen */
  ranged?: boolean;
  /** Waffenstufe des Angreifers (1 … 5) für die Rüstungskurve; fehlt sie, gilt `EnemyWorld.attackTier` */
  tier?: number;
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

/** Wartezeit (s) einer Boss-Fähigkeit zwischen zwei Einsätzen, falls die Daten keine nennen */
const MECH_CD: Record<string, number> = { summon: 26, guard: 20, counter: 15, blink: 7, lunge: 4, signal: 8 };

export class Enemy {
  readonly char: Character;
  readonly def: EnemyDef;
  /** Bedrohungstabelle (Hauptmänner und Endbosse): wer zuletzt wie viel Schaden gemacht hat, bestimmt das Ziel; null bei normalen Gegnern */
  readonly threat: ThreatTable | null;
  /** Ziel der Fähigkeiten dieses Gegners: Kennung aus der Bedrohungstabelle (Spielfigur, Offizier, Trupp oder später ein Mitspieler) */
  /** Boss: Lebensanteile, bei denen die nächste Phase beginnt (für Marken in der Boss-Leiste) */
  get phaseMarks(): number[] {
    const pa = this.def.phaseAt ?? BOSS.phaseAt;
    return (this.def.phases ?? 3) >= 3 ? [pa[0], pa[1]] : [pa[0]];
  }
  targetEntityId: EntityId | null = null;
  /** Aura-Faktoren durch Hauptmänner in der Nähe (1 = keine): Schaden, erlittener Schaden, Tempo; Heilung je Sekunde (Anteil) */
  auraDmg = 1;
  auraTaken = 1;
  auraSpeed = 1;
  auraRegen = 0;
  /** Frontale Deckung (Eisenstein): Treffer aus diesem Bogen vor dem Gegner prallen ab, solange `guardT` läuft */
  guardT = 0;
  guardArc = 0;
  /** Konterhaltung (De Valois): der nächste Treffer löst einen Gegenschlag auf den Angreifer aus */
  counterT = 0;
  counterDmg = 1.5;
  counterRadius = 3;
  riposteReq: { x: number; z: number; dmg: number; r: number } | null = null;
  /** Landepunkt des Schattensprungs (Kurogane), gesetzt beim Ausholen */
  blinkTo: { x: number; z: number } | null = null;
  /** Wann welche Fähigkeit wieder bereit ist (Spielzeit des Gegners) */
  private readonly atkCd = new Map<EnemyAttack, number>();
  private clock = 0;
  /** Angriffswert mit Aura */
  get strength() { return this.dmg * this.auraDmg; }
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

  /** Kennung dieses Gegners (gleiche Pipeline wie jede andere Kämpfer-Entität) */
  readonly entityId: EntityId = mintEntityId('enemy');
  private sweepG: SweepGround | null = null;
  private sweepW: EnemyWorld | null = null;
  /** Boden für die gesweepte Bewegung: Höhe und Hindernisse der Welt, mit Abstand zu anderen Kämpfern */
  private sweepGround(w: EnemyWorld): SweepGround {
    if (!this.sweepG || this.sweepW !== w) {
      this.sweepW = w;
      this.sweepG = { height: (x, z) => w.ground(x, z, this.y), constrain: (x, z, r) => w.constrain(x, z, r ?? this.radius, this) };
    }
    return this.sweepG;
  }

  constructor(assets: CharacterAssets, readonly kind: EnemyKind, readonly level: number, faction: Faction, x: number, z: number, outline: boolean, readonly name?: string, readonly power?: FactionId, opts: { def?: EnemyDef } = {}) {
    // Haltung wächst mit der Gefahrenstufe (Bosse und Raid-Gegner haben eigene, schon hohe Werte)
    const baseDef = opts.def ?? ENEMIES[kind];
    const pf = baseDef.boss || baseDef.raid ? 1 : DANGER_POISE[dangerOfLevel(level)];
    this.def = pf === 1 ? baseDef : { ...baseDef, poise: Math.round(baseDef.poise * pf) };
    this.threat = this.def.raid ? new ThreatTable() : null;
    const sc = enemyScale(level);
    this.maxHp = this.hp = Math.round(this.def.hp * sc.hp);
    this.dmg = this.def.dmg * sc.dmg;
    this.poise = this.def.poise;
    this.x = x;
    this.z = z;
    this.homeX = this.spot.x = x;
    this.homeZ = this.spot.z = z;
    this.retreatAt = this.def.boss || this.def.raid ? 0 : this.def.elite ? 0.15 : kind === 'schlaeger' ? 0.12 : 0.25;
    const role: NpcRole = faction === 'marine' ? (this.def.elite ? 'offizier' : 'marine') : this.def.role === 'offizier' ? 'pirat' : this.def.role;
    const look = randomLook(Math.random, role);
    if (kind === 'schlaeger') { look.body = 'kraeftig'; look.gloves = true; }
    if (this.def.elite) { look.coat = 'kapitaen'; look.coatColor = faction === 'marine' ? '#14284A' : '#4A1418'; }
    // Ausrüstung nach Stufe: Eliten und Bosse tragen ganze Sets, einfache Gegner gelegentlich einzelne Teile
    // Besetzte Inseln und Festungen: Soldaten tragen die Uniform ihrer Weltmacht (data/factionLook.ts), sonst gilt die Ausrüstung nach Stufe
    const rank = this.def.boss ? 'boss' : this.def.elite ? 'elite' : 'normal';
    if (power) applyFactionUniform(look, power, rank);
    else {
      const gear = gearForNpc(level, rank, faction === 'marine');
      if (gear.length) look.extra = gear;
    }
    // Raid-Boss: eigenes Beute-Set (Helm, Waffen, Rock aus Blender, public/models/bosses/) über der Uniform der Macht
    if (this.def.kit) look.extra = [...(look.extra ?? []), ...gearFromSet(this.def.kit, 'boss')];
    this.char = new Character(assets, look, outline);
    this.char.holder.scale.setScalar(this.def.scale);
    const w = enemyWeapons(this.def.weapon);
    // Boss-Waffen sind Blender-Modelle am Beute-Set (Haupt- und Nebenhand): die Standardwaffe weicht ihnen (Character.hold nimmt das Set-Modell)
    if (this.def.kit && w.right) { w.right.userData.swordSkin = true; this.char.hold('r', w.right); this.char.hold('l', null); }
    else { this.char.hold('r', w.right); this.char.hold('l', w.left); }
    this.marker = new Sprite(new SpriteMaterial({ map: EXCL_TEX, color: new Color(4, 1.2, 0.8), depthTest: false, transparent: true, blending: AdditiveBlending }));
    this.marker.scale.setScalar(0.7);
    this.marker.position.y = 2.4;
    this.marker.visible = false;
    this.char.holder.add(this.marker);
    this.yaw = Math.random() * Math.PI * 2;
    this.char.play('idle');
    // Treffer-Randlicht und Auflösen gleich beim Erscheinen vorbereiten (kein Ruckler beim ersten Treffer)
    this.char.enableFx();
    // Boss-Silhouette (4.4B): Raid-Bosse, Hauptmänner und Legenden tragen ein deutlich kräftigeres Kantenlicht
    const heroK = this.def.raid === 'boss' || this.def.boss ? 1.9 : this.def.raid === 'captain' || this.def.elite ? 1.45 : 1;
    if (heroK > 1) this.char.setHeroRim(heroK);
  }

  slowT = 0;
  fearT = 0;
  frozenT = 0;
  /** Dachschütze (Raid): steht fest in Höhe y auf einem Dach, bewegt sich nicht, fällt beim Tod zu Boden */
  perch: { y: number } | null = null;

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

  fear(dur: number) { if (this.alive && !this.def.boss && this.def.raid !== 'captain') { this.fearT = dur; this.cancelAttack(); this.toChase(); } }

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
    // Konterhaltung: jeder Treffer löst stattdessen einen Gegenschlag auf den Angreifer aus (Rückstoß und Schaden), die Haltung endet
    if (this.counterT > 0) {
      this.counterT = 0;
      this.riposteReq = { x: this.x - h.dirX * 1.7, z: this.z - h.dirZ * 1.7, dmg: this.counterDmg, r: this.counterRadius };
      this.char.hitFlash('#FFD27A', 1.3);
      if (h.src) this.threat?.add(h.src, h.dmg * 0.3);
      return 'blocked';
    }
    // Frontale Deckung: von vorn prallt alles ab; Flanke und Rücken bleiben offen
    if (this.guardT > 0) {
      const facing = Math.sin(this.yaw) * -h.dirX + Math.cos(this.yaw) * -h.dirZ;
      if (facing > Math.cos(this.guardArc / 2)) {
        this.char.hitFlash('#9FD8FF', 0.9);
        if (h.src) this.threat?.add(h.src, h.dmg * 0.3);
        return 'blocked';
      }
    }
    // Rüstung der Raid-Gegner und Aura „Bollwerk“ eines Hauptmanns in der Nähe
    // Rüstung nach Gefahrenstufe (asymptotische Kurve, data/balanceConfig.ts): die Waffenstufe des Angreifers entscheidet, wie viel durchkommt
    const tier = h.tier ?? w?.attackTier ?? 1;
    const soak = (1 - mitigation(enemyArmorRating(this.kind, this.level), tier)) * (1 - (this.def.armor ?? 0)) * this.auraTaken;
    if (soak !== 1) h = { ...h, dmg: h.dmg * soak };
    // Break: Schwachstelle offen, mehr Schaden
    if (this.brokenT > 0) h = { ...h, dmg: h.dmg * BOSS.breakDmg };
    // Anti-One-Shot: ein Raid-Endboss verliert durch einen einzelnen Treffer höchstens 8 % seiner Lebenspunkte
    if (this.def.raid === 'boss') h = { ...h, dmg: Math.min(h.dmg, this.maxHp * RAID_BOSS_HIT_CAP) };
    if (h.src && this.threat) this.threat.add(h.src, h.dmg, { ranged: !!h.ranged });
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
  get breakFrac() { return this.brokenT > 0 ? 0 : clamp01(this.poise / this.def.poise); }

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
    else if (this.state === 'air' && this.stateT > 6) { this.vy = 0; this.y = w.ground(this.x, this.z, this.y); this.state = 'down'; this.timer = 0.6; this.char.play('lie', { fade: 0.1 }); }
    this.timer -= dt;
    this.clock += dt;
    this.guardT = Math.max(0, this.guardT - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    this.threat?.update(dt);
    if (this.auraRegen > 0 && this.alive && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * this.auraRegen * dt);
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
      const pa = def.phaseAt ?? BOSS.phaseAt;
      const ph = (def.phases ?? 3) >= 3 && frac < pa[1] ? 3 : frac < pa[0] ? 2 : 1;
      if (ph > this.phase && this.state !== 'air') { this.phase = ph; this.dmg *= 1.15; this.beginTransition(w); }
      // Break läuft ab, danach ist der Haltebalken wieder voll; sonst lädt er sich nach 3 s ohne Treffer langsam auf
      if (this.brokenT > 0) {
        this.brokenT -= dt;
        if (this.brokenT <= 0) { this.brokenT = 0; this.poise = this.def.poise; }
      } else if (this.poise < this.def.poise && w.playerActive && this.sinceHit > 3) this.poise = Math.min(this.def.poise, this.poise + this.def.poise * BOSS.breakRegen * dt);
    }
    const speed = def.speed * (def.boss ? 1 + (this.phase - 1) * 0.15 : 1) * (this.slowT > 0 ? 0.45 : 1) * this.auraSpeed * (this.guardT > 0 ? 0.6 : 1);

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
        if (!(this.atk?.zones && this.atk.zones.some((z) => z.at === undefined || z.at === 'self'))) face(toPlayer, 5);
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
          const g = w.ground(this.x, this.z, this.y);
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
        this.y = Math.max(w.ground(this.x, this.z, this.y), this.y + this.vy * dt);
        // nach dem Fallen in Glut auflösen (4 s nach dem Tod wird die Figur entfernt)
        this.char.setDissolve(clamp01((2.7 - this.timer) / 1.8));
        break;
    }

    // Bewegung, Rückstoß, Boden
    if (this.perch && this.state !== 'dead' && this.state !== 'air') { mvx = 0; mvz = 0; this.vx = 0; this.vz = 0; }
    this.vx *= Math.pow(0.02, dt);
    this.vz *= Math.pow(0.02, dt);
    // Rückstoß und Schritte als gesweepte Bewegung: kein Wanddurchbruch bei hohem Tempo (Teilschritte ≤ 0,15 m)
    sweepMove(this, (mvx + this.vx) * dt, (mvz + this.vz) * dt, this.sweepGround(w), false);
    if (this.state !== 'air' && this.state !== 'dead') {
      const g = this.perch ? this.perch.y : w.ground(this.x, this.z, this.y);
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
    // Boss-Fähigkeiten mit Wartezeit (Verstärkung, Deckung, Konter, Sprung, Streuflächen): nur wenn bereit
    const ready = usable.filter((a) => (this.atkCd.get(a) ?? 0) <= this.clock);
    if (ready.length) usable = ready;
    this.atk = (usable.length ? usable : opts)[Math.floor(Math.random() * (usable.length || opts.length))];
    this.lastAtk = this.atk;
    const cd = this.atk.mech ? MECH_CD[this.atk.mech.kind] ?? 0 : this.atk.zones?.some((z) => z.at === 'scatter') ? 7 : 0;
    if (cd > 0) this.atkCd.set(this.atk, this.clock + cd);
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
    else if (this.guardT > 0) this.char.setTint('#8FC8FF', 0.7);
    else if (this.counterT > 0) this.char.setTint('#FFD27A', 0.75);
    // Boss ab Phase 2: dauerhaft gerötete Ränder (entfesselt), in Phase 3 stärker
    else if (this.def.boss && this.phase >= 2 && this.alive) this.char.setTint('#FF3A2A', this.phase >= 3 ? 0.42 : 0.28);
    else this.char.setTint('#9FE6FF', 0);
  }

  dispose() {
    this.cancelAttack();
    this.threat?.clear();
    this.hasToken = false;
    this.char.dispose();
  }
}

