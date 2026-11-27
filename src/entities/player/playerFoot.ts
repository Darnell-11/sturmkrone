// Steuerung und Kampf zu Fuß (seit 4.6A über die Action-Kampf-Engine). Die Simulation (Bewegung in 3D, Sprünge, Dashes, Kombo-Baum,
// Treffer, Haltung, perfektes Ausweichen) steht rein in `combat/actionCombatEngine.ts`; diese Klasse ist ihr Anschluss an die Welt
// (Boden, Kampfsystem) und an die Darstellung (Clips im Takt der Engine, Effekte, Klang). Öffentliche Felder bleiben wie vorher
// (Leben, Ausdauer, Lage, Werte der Fähigkeiten), damit Welt, Faji und HUD nichts davon merken.
import { Vector3, type AnimationAction } from 'three';
import type { Input } from '../../core/input/input';
import type { StyleId } from '../../data/animations';
import { PLAYER_BASE } from '../../data/combat';
import type { CombatSystem, PlayerHitResult, PlayerTarget } from '../../combat/combat';
import type { CombatFx } from '../../combat/fx';
import type { ActionFx } from '../../combat/actionFx';
import type { CombatOverlay } from '../../ui/combatOverlay';
import type { Ground } from '../../world/islandGround';
import type { Character } from '../character/character';
import type { Enemy } from '../enemy';
import { makeDashLatch, makeSweepResult, sweepMove } from '../../combat/sweep';
import { mintEntityId, type EntityId } from '../../sim/entityId';
import { PLAYER_HIT_CAP, damageFactor, dangerOfLevel } from '../../data/balanceConfig';
import {
  ActionCombatEngine, KIND_OF_CODE, createFighter, makeInput,
  type ActionBody, type ActionTarget, type ActionWorld, type AttackerInfo, type FighterState, type HitContext,
} from '../../combat/actionCombatEngine';
import {
  ACTION_STYLES, ACTION_TUNING, actionStyleOf, visualStyleOf,
  type ActionHit, type ActionMove, type ActionStyleId, type UltimateSpec,
} from '../../data/actionStyles';
import { AURA, MASTERY, WILL_AURAS, type AuraId } from '../../data/fajiArts';
import { ART_ACTIONS, GEIST_ACTIONS } from '../../data/actions';
import { WATER_WALK, isWater, newWaterWalk, stepWaterWalk } from '../../data/waterWalk';
import { CLOTH_IMPULSE, SHEATH, type ExpressionId } from '../../data/characterRig';
import { Character as CharacterCls } from '../character/character';
import { decisiveHit } from '../../graphics/formCinema';

/** Zustand für Welt und HUD (wie vor 4.6A) */
type FootState = 'move' | 'roll' | 'attack' | 'block' | 'charge' | 'hurt' | 'down';

/** Überblendzeiten (s): kurz genug, dass Treffer auf dem Takt der Engine sitzen */
const FADE = { move: 0.1, chain: 0.07, dodge: 0.08, locomotion: 0.2, idle: 0.2, block: 0.12, hurt: 0.08, air: 0.12, land: 0.08 };
/** Weiter entfernte Angreifer (Schützen): Sturm-Schritt ohne Sprung hinter sie */
const TELEPORT_MAX = 14;

export interface FootDeps {
  combat: CombatSystem | null;
  fx: CombatFx | null;
  overlay: CombatOverlay | null;
  onDown: () => void;
  /** Stil gewechselt: Waffe in die Hände, Fähigkeiten-Werte neu rechnen */
  onSwap?: (style: StyleId, action: ActionStyleId) => void;
  /** Nachbilder und Leuchtstreifen (Pool der Welt) */
  actionFx?: ActionFx | null;
  /** Kamerawackeln, Zeitlupe, Fokus-Puls (Welt) */
  shake?: (k: number) => void;
  slowmo?: (t: number, scale: number) => void;
  focus?: (k: number) => void;
  /** Tastenkappe für „Schwer“ (Finisher-Hinweis) */
  heavyKey?: () => string;
  /** Tastenkappe für „Sturm-Erwachen“ (Hinweis bei voller Willenskraft) */
  awakenKey?: () => string;
  /** Ultimate ausgelöst: Mini-Zwischensequenz (Kamera, Zeitlupe nur lokal) */
  onUltimate?: (mv: ActionMove, spec: UltimateSpec, f: FighterState) => void;
  /** Einschlag eines Ultimates: Impact-Frames und Welt-Effekt (Schiffe zerteilen, Meer spalten, Sog …) */
  onUltStrike?: (mv: ActionMove, spec: UltimateSpec, f: FighterState) => void;
  /** Sturm-Erwachen beginnt (true) oder verklingt (false) */
  onAwaken?: (on: boolean) => void;
  /** Meisterschaft einer Faji-Kunst gewonnen (Punkte) */
  onMastery?: (style: ActionStyleId, pts: number) => void;
  /** Energiewelle des Erwachens, Kettenblitz, Königsdruck (Effekte der Welt) */
  onAwakenWave?: (f: FighterState, color: string, accent: string) => void;
  onChain?: (ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: string) => void;
  onKingWave?: (x: number, y: number, z: number, r: number) => void;
  /** 4.7B: Heilung (Anteil der Höchst-LP, Radius für Verbündete) und Geistes-Faji (Kraft 1 … 4, Radius/Wert, Treffer) */
  onHeal?: (frac: number, radius: number, f: FighterState) => void;
  onGeist?: (kind: number, b: number, c: number, f: FighterState) => void;
  /** 4.7C: Wasserlauf – Kräuselringe und Fontänen (0 Stehen, 1 Gehen, 2 Laufen, 3 Schwimmen, 4 Eintauchen/Auftauchen) */
  onWater?: (x: number, y: number, z: number, kind: number) => void;
  /** 4.9: Ausdauer auf dem Wasser leer – die Welt blendet über und setzt die Figur an Deck bzw. an Land */
  onExhausted?: (x: number, y: number, z: number) => void;
  /** 4.6C: Sturm-Verfolgung (alter Ort), Klingen-Clash (Ort der gekreuzten Klingen), Schwungfenster einer Technik, Staub-/Wasserspur des Momentums */
  onChase?: (ox: number, oy: number, oz: number, f: FighterState) => void;
  onClash?: (x: number, y: number, z: number, yaw: number) => void;
  onSwing?: (mv: ActionMove, h: ActionHit, f: FighterState) => void;
  /** 4.91: Start einer Form (Platz 1 … 10; Akt 1 der Regie) und Treffermoment ihres stärksten Treffers (Akt 2 + 3) */
  onSkill?: (slot: number, mv: ActionMove | null, f: FighterState) => void;
  onFormHit?: (slot: number, mv: ActionMove, h: ActionHit, f: FighterState) => void;
  /** 4.6D: Kettenschlag (L1 – L5, Luft-Kette): Klingen-/Faustbogen; `step` wechselt die Schlagrichtung */
  onSlash?: (mv: ActionMove, h: ActionHit, f: FighterState, step: number) => void;
  /** 4.6D: Dash am Boden oder in der Luft (Weg von A nach B), Sturm-Schritt (Blitz-Silhouetten an Absprung- und Zielpunkt) */
  onDash?: (ax: number, ay: number, az: number, bx: number, by: number, bz: number, f: FighterState, air: boolean) => void;
  onStormStep?: (ox: number, oy: number, oz: number, f: FighterState) => void;
  /** 4.6E: Talent-Entladungen – Nachbeben des Ultimates (Mittelpunkt, Radius) und Element-Entladung beim Sturm-Schritt */
  onAftershock?: (x: number, z: number, r: number, f: FighterState) => void;
  onStormBurst?: (x: number, z: number, r: number, f: FighterState) => void;
  trail?: (x: number, y: number, z: number, k: number) => void;
  /** Impact-Frames der Anime-Pipeline (invertiert, dann Tusche; 2 – 4 gezeichnete Bilder) */
  impactFrames?: (n: number) => void;
}

/** Anschluss der Engine an Boden und Kampfsystem (ein Objekt, je Bild nur der Boden neu gesetzt) */
class FootWorld implements ActionWorld {
  ground: Ground | null = null;
  private readonly latch = makeDashLatch();
  private readonly res = makeSweepResult();
  constructor(private foot: PlayerFoot) {}

  /**
   * 4.7C: Boden mit Wasseroberfläche – über dem Meer läuft die Spielfigur auf dem Wasser (beim Schwimmen um `swimDepth` tiefer, im
   * Flachwasser nie unter den Grund).
   */
  height(x: number, z: number, y: number): number {
    const h = this.ground ? this.ground.height(x, z, y) : 0;
    const wy = this.foot.waterY;
    if (isWater(h, wy)) return this.foot.water.swimming ? Math.max(h, wy - WATER_WALK.swimDepth) : wy;
    return h;
  }

  /** Fester Boden ohne Wasser (Land, Steg, Deck, Brücke; −∞ über dem Meer) */
  solidHeight(x: number, z: number, y: number): number { return this.ground ? this.ground.height(x, z, y) : 0; }

  /**
   * 4.7C: die Spielfigur ist ein freier Läufer – keine unsichtbaren Grenzen an Strand, Kai, Steg und Reling. Höhenhinweis sind ihre Füße
   * (im Sprung über Zaun und niedriger Mauer zählt die Sprunghöhe), der Boden kennt das Wasser.
   */
  private feetY = 0;
  private readonly freeG = {
    height: (x: number, z: number, y?: number) => this.height(x, z, y ?? this.feetY),
    constrain: (x: number, z: number, r?: number, y?: number) => this.ground!.constrain(x, z, r, Math.max(y ?? -Infinity, this.feetY), true),
  };

  move(b: ActionBody, dx: number, dz: number, impulse: boolean, id: number): void {
    if (!this.ground) return;
    this.feetY = b.y;
    const g = this.freeG;
    if (impulse) {
      // Vorwärts-Impuls (Dash, Magnet-Schritt, Vorstoß): Teilschritte, Wände stoppen, Stufen und Rampen hinauf (combat/sweep.ts)
      if (this.latch.id !== id) { this.latch.id = id; this.latch.blocked = false; }
      if (this.latch.blocked) return;
      if (sweepMove(b, dx, dz, g, true, this.res).blocked) this.latch.blocked = true;
      return;
    }
    if (Math.abs(dx) + Math.abs(dz) > 0.15) { sweepMove(b, dx, dz, g, false, this.res); return; }
    const c = g.constrain(b.x + dx, b.z + dz, b.radius, b.y);
    b.x = c.x; b.z = c.z;
  }

  teleport(b: ActionBody, x: number, z: number): boolean {
    const g = this.ground;
    if (!g) return false;
    const h = this.height(x, z, b.y + 0.4);
    if (!Number.isFinite(h) || Math.abs(h - b.y) > 2.6) return false;
    const c = g.constrain(x, z, b.radius, h, true);
    if (Math.hypot(c.x - x, c.z - z) > 0.7) return false;
    b.x = c.x; b.z = c.z;
    return true;
  }

  targets(x: number, z: number, r: number, out: ActionTarget[]): number { const c = this.foot.combat; return c ? c.actionTargets(x, z, r, out) : 0; }
  hit(t: ActionTarget, h: ActionHit, m: ActionMove, ctx: HitContext): number { const c = this.foot.combat; return c ? c.actionHit(t, h, m, ctx, this.foot.dmgMult) : 0; }
  drag(t: ActionTarget, cx: number, cz: number, step: number): void { this.foot.combat?.actionDrag(t, cx, cz, step); }
  shoot(h: ActionHit, _m: ActionMove, f: FighterState): void { this.foot.combat?.actionShoot(h, f.x, f.y, f.z, f.yaw, this.foot.dmgMult, f.lockId); }
}

export class PlayerFoot implements PlayerTarget {
  /** Kennung dieser Spielfigur: Absichten und Bedrohungstabellen nennen sie */
  readonly entityId: EntityId = mintEntityId('foot');
  /** Kapselradius für die Kollision */
  readonly radius = 0.35;
  /** Zustand der Engine (JSON-taugliche Daten) und die Engine selbst */
  readonly fighter: FighterState;
  readonly engine: ActionCombatEngine;
  private readonly inp = makeInput();
  private readonly world: FootWorld;
  prev = { x: 0, z: 0, y: 0, yaw: 0 };
  /** Tempo (m/s) für Kamera und Welt */
  speed = 0;
  hp = 100;
  maxHp = 100;
  /** Darstellungs-Stil (Waffe in der Hand, Faji-Passiven) */
  style: StyleId;
  /** Seestein-Ketten (Boss-Fähigkeit): Restzeit und Tempoverlust (0 … 1) */
  private bindT = 0;
  private bindSlow = 0;
  bind(dur: number, slow: number) { this.bindT = Math.max(this.bindT, dur); this.bindSlow = Math.max(this.bindSlow, Math.min(0.85, slow)); }
  /** Schadensfaktor (Waffe, Fähigkeiten, Crew) */
  dmgMult = 1;
  /** Schadensreduktion 0 … 0,85, Ausweichchance, Tempo, Unverwundbarkeit (Fähigkeiten) */
  reduce = 0;
  gearReduce = 0;
  gearArmor = 0;
  gearResist = 0;
  dodgeChance = 0;
  speedMult = 1;
  invuln = false;
  parryBonus = 0;
  secondWind = 0;
  private secondWindUsed = false;
  onFoot = false;
  /** Springen ruht, solange auf derselben Taste eine Handlung ansteht (Gamepad X: Sprechen, Anlegen …) */
  jumpBlocked = false;
  /** 4.7B: Form bzw. Geistes-Kraft aus der Aktionsleiste (Klick, Antippen) für den nächsten Logikschritt (0 = keine) */
  formQueued = 0;
  geistQueued = 0;
  /** 4.7B: Heilkraft aus dem Klassenbaum (Faktor auf jede eigene Heilung) */
  healK = 1;
  /** 4.7C: Wasseroberfläche unter der Figur (setzt die Welt je Bild; NaN = kein Meer) und Zustand des Wasserlaufs */
  waterY = Number.NaN;
  readonly water = newWaterWalk();
  private waterStepT = 0;
  private waterNoteT = 0;
  /** Steht bzw. schwimmt die Figur gerade im Meer? */
  get onWater(): boolean { return this.water.onWater; }
  get swimming(): boolean { return this.water.swimming; }
  readonly maxStamina = ACTION_TUNING.stamina;

  // Darstellung
  private anim = '';
  private moveAction: AnimationAction | null = null;
  private moveShown = -1;
  private realSpeed = 0;
  private landT = 0;
  private trailOn = false;
  private noteT = 0;
  private readonly att: AttackerInfo = { id: '', x: 0, z: 0, yaw: 0, radius: 0.5 };
  private readonly finP = { x: 0, y: 0, z: 0 };
  private readonly tmpV = new Vector3();
  /** Höhe vor dem Logikschritt (Sturm-Verfolgung: Nachbild am alten Ort), Takt der Momentum-Spur */
  private preY = 0;
  private trailT = 0;
  /** Zähler der Kettenschläge (4.6D: die Bögen wechseln je Schlag die Richtung) */
  private slashStep = 0;
  /** Färbung der Figur (Fesseln > Erwachen > Eisenwille): Schlüssel der gesetzten Färbung, Pulszeit */
  private tintKey = '';
  private pulseT = 0;
  /** nach einem Treffer-Aufleuchten die Färbung neu setzen (das Aufleuchten überschreibt ihre Farbe) */
  private flashT = 0;
  private willNoteT = 0;
  /** Rig (4.6F): Schmerz-Ausdruck nach einem Treffer, zuletzt gesetzter Ausdruck, Kampfnähe (alle 0,25 s geprüft), Handhaltung der Faust */
  private hurtFaceT = 0;
  private moodShown: ExpressionId | '' = '';
  private engagedT = 0;
  private engaged = false;
  /** 4.6G: Sekunden ohne Kampf (danach steckt die Figur die Klinge auf den Rücken) */
  private calmT = 0;
  /** zuletzt gezeigter Stand-Clip (wechselt mit dem Wegstecken) */
  private idleShown = '';
  /** 4.6G: Kampfnähe 0 … 1 (1 im Kampf, klingt nach drei ruhigen Sekunden ab) – verstärkt Aura und Energie-Säume */
  get combatK() { return this.calmT < 0.5 ? 1 : Math.max(0, 1 - (this.calmT - 0.5) / 3); }
  private fistShown = '';
  private glowStyle = '';

  constructor(private char: Character, style: StyleId, private deps: FootDeps, action?: ActionStyleId) {
    this.style = style;
    this.fighter = createFighter(this.entityId, action ?? actionStyleOf(style));
    this.engine = new ActionCombatEngine(this.fighter);
    this.world = new FootWorld(this);
  }

  get combat(): CombatSystem | null { return this.deps.combat; }
  /** Aktueller Action-Stil (einer der sechs physischen Stile oder Faji-Wirken) */
  get actionStyle(): ActionStyleId { return this.fighter.style; }
  get x() { return this.fighter.x; }
  set x(v: number) { this.fighter.x = v; }
  get y() { return this.fighter.y; }
  set y(v: number) { this.fighter.y = v; }
  get z() { return this.fighter.z; }
  set z(v: number) { this.fighter.z = v; }
  get yaw() { return this.fighter.yaw; }
  set yaw(v: number) { this.fighter.yaw = v; }
  get stamina() { return this.fighter.stamina; }
  set stamina(v: number) { this.fighter.stamina = v; }
  get staminaFlash() { return this.fighter.staminaFlash; }
  /** In der Luft (Sprung, Fall, Luft-Kombo) */
  get airborne() { return !this.fighter.grounded; }
  /** Willenskraft-Aura (0 keine, 1 Sturmblick, 2 Eisenwille, 3 Königsdruck) – das Kampfsystem liest sie */
  get aura(): AuraId { return this.fighter.aura; }
  /** Aura von außen setzen (Spielstand, Menü) */
  setAura(a: AuraId) { this.fighter.aura = a; this.tintKey = ''; }
  /** Sturm-Erwachen aktiv */
  get awakened() { return this.fighter.awakenT > 0; }
  /** Läuft gerade ein Ultimate (Aufladen oder Einschlag)? Welt und Kamera fragen das */
  get inUltimate() { return this.fighter.phase === 'move' && this.fighter.moveKind === 'ultimate'; }
  /**
   * 4.6I: Stand des Ultimate-Clips in Akt 1 der Kino-Regie (Anteil des ganzen Clips; −1 = Engine). Solange die Engine das Aufladen hält,
   * zeigt die Figur damit die Aushol-Pose desselben Clips (Anziehen, Ausfallschritt, Hand zum Himmel), die nahtlos in den Angriff übergeht.
   */
  cineClip = -1;

  get state(): FootState {
    switch (this.fighter.phase) {
      case 'dash': return 'roll';
      case 'move': case 'cast': return 'attack';
      case 'block': return 'block';
      case 'hurt': return 'hurt';
      case 'down': return 'down';
      default: return 'move';
    }
  }

  /** 4.7A: Zähler für die Einführung (Kampfkünste insgesamt, davon Techniken einer Faji-Kunst) */
  /** Zähler für Einführung und Prüfungen; 4.9: `salvo` = abgefeuerte Element-Geschosse (Faji-Salven) */
  readonly tally = { skills: 0, artSkills: 0, geist: 0, salvo: 0 };

  get active() { return this.onFoot && this.fighter.phase !== 'down'; }
  /** Kann gerade eine Faji-Fähigkeit gewirkt werden? */
  get canCast() { const p = this.fighter.phase; return this.active && this.fighter.grounded && (p === 'ground' || p === 'block'); }

  /** 4.91: die Figur am Ort zu einer Richtung drehen (Ultimate vom Steuer schaut zum Ziel) */
  face(yaw: number) {
    if (!Number.isFinite(yaw)) return;
    this.engine.f.yaw = yaw;
    this.prev.yaw = yaw;
  }

  place(x: number, z: number, yaw: number, ground: Ground) {
    const h = ground.height(x, z);
    const y = Number.isFinite(h) ? h : 0;
    this.world.ground = ground;
    this.engine.place(x, y, z, yaw);
    this.prev = { x, z, y, yaw };
    this.water.onWater = false; this.water.swimming = false; this.water.fatigue = 0;
    this.anim = '';
    this.moveShown = -1;
    this.realSpeed = 0;
  }

  /**
   * Skriptete Bewegung (Leiter, Reling): Lage direkt setzen, Eingabe ruht. Die Darstellung gleitet von der letzten zur neuen Lage
   * (`prev`), die Beine laufen im Gehen-Takt, solange `moving` gilt.
   */
  drive(x: number, y: number, z: number, yaw: number, moving: boolean, speed = 1.3) {
    const pv = this.prev;
    pv.x = this.x; pv.z = this.z; pv.y = this.y; pv.yaw = this.yaw;
    this.engine.drive(x, y, z, yaw);
    this.speed = 0;
    this.realSpeed = moving ? speed : 0;
    const want = moving ? 'walk' : 'idle';
    if (want !== this.anim) {
      this.anim = want;
      if (moving) this.char.play('walk', { fade: FADE.locomotion });
      else this.char.playClip(ACTION_STYLES[this.fighter.style].idleClip, { loop: true, fade: FADE.idle });
    }
    if (moving) this.char.setLocoSpeed(speed);
  }

  /**
   * 4.7D: Lage setzen, ohne die Animation anzurühren – die Regie spielt eigene Clips (Sturz ins Wasser, Sinken, Liegen am Strand).
   * Die Darstellung gleitet von der letzten zur neuen Lage.
   */
  pose(x: number, y: number, z: number, yaw: number) {
    const pv = this.prev;
    pv.x = this.x; pv.z = this.z; pv.y = this.y; pv.yaw = this.yaw;
    this.engine.drive(x, y, z, yaw);
    this.speed = 0;
    this.realSpeed = 0;
    this.anim = 'script';
  }

  /**
   * 4.7D: mit einem fahrenden Deck mitnehmen (Welt-Versatz in m). Laufen, Sprünge und Ketten laufen ungestört weiter. `fresh` = die Figur
   * hat sich in diesem Schritt nicht selbst bewegt (dann beginnt das Gleiten der Darstellung hier).
   */
  carry(dx: number, dz: number, fresh: boolean) {
    if (fresh) { const pv = this.prev; pv.x = this.x; pv.z = this.z; pv.y = this.y; pv.yaw = this.yaw; }
    this.fighter.x += dx;
    this.fighter.z += dz;
  }

  /**
   * Stil wechseln – jederzeit, auch mitten in der Kette (Wechselschlag: der nächste Schlag des neuen Stils setzt sofort an und trifft
   * 1,6-fach). Gibt zurück, ob gewechselt wurde.
   */
  swapTo(style: ActionStyleId, _yawHint: number | null = null): boolean {
    if (!this.active) return false;
    const r = this.engine.switchStyle(style, this.inp);
    if (!r) return false;
    this.style = visualStyleOf(style);
    this.deps.onSwap?.(this.style, style);
    const st = ACTION_STYLES[style];
    const at = this.tmpV.set(this.x, this.y + 0.1, this.z);
    this.deps.fx?.shockwave(at, r === 'swap' ? 2.4 : 1.6, st.color);
    at.y += 1;
    this.deps.fx?.puffColor(at, st.color);
    at.y += 1.3;
    this.deps.overlay?.number(at, r === 'swap' ? 'Wechselschlag!' : `${st.label} · ${st.title}`, r === 'swap' ? 'crit' : 'info');
    if (r === 'swap') this.deps.overlay?.speedlines(0.6);
    this.moveShown = -1;
    if (r === 'instant' && this.fighter.phase === 'ground') this.anim = '';
    return true;
  }

  /** Volle Heilung (nach K.O. oder Rast) */
  revive() { this.hp = this.maxHp; this.engine.revive(); this.anim = ''; this.secondWindUsed = false; }

  /** Zauber-/Technik-Animation der Faji-Fähigkeiten (Wirkung kommt aus der Fähigkeit); ein Dash bricht sie ab */
  cast(clip: string, speed: number, yaw: number | null) {
    const a = this.char.playClip(clip, { loop: false, speed, fade: 0.15, restart: true });
    const dur = a ? a.getClip().duration / Math.max(0.1, speed) : 0.6;
    this.engine.beginCast(dur * 0.9, yaw);
    this.anim = 'cast';
    this.moveShown = -1;
  }

  receiveHit(dmg: number, dirX: number, dirZ: number, knock: number, from: Enemy | null, elemental = false): PlayerHitResult {
    if (!this.active || this.invuln) return 'dodged';
    let att: AttackerInfo | null = null;
    if (from && Math.hypot(from.x - this.x, from.z - this.z) < TELEPORT_MAX) {
      att = this.att;
      att.id = from.entityId; att.x = from.x; att.z = from.z; att.yaw = from.yaw; att.radius = from.radius;
    }
    const ox = this.x, oy = this.y, oz = this.z;
    const r = this.engine.incoming(att, dirX, dirZ, this.world);
    if (r === 'perfect' || r === 'counter') { this.stormStepFx(ox, oy, oz, r === 'counter'); return 'perfect'; }
    if (r === 'dodged' || r === 'none') return 'dodged';
    if (Math.random() < this.dodgeChance) return 'dodged';
    // Angreifer ohne Gegner-Objekt (Verbände, Geschütze der Festungen) zählen als Stufe 4
    // Eisenwille: 10 % weniger Schaden (zählt zur gemeinsamen Minderung, die `damageFactor` bei 85 % deckelt)
    const iron = this.fighter.aura === 2 ? AURA.ironReduce : 0;
    // Talente (4.6E): Haltung im Angriff und Rüstung aus den Bäumen (gedeckelt, `TALENT_CAP.reduce`)
    dmg *= damageFactor(elemental ? this.gearResist : this.gearArmor, from ? dangerOfLevel(from.level) : 4, this.reduce + this.gearReduce + iron + this.engine.talentReduce);
    // nie durch einen einzigen Treffer tot: ein Treffer nimmt höchstens 40 % der Lebenspunkte
    dmg = Math.min(dmg, this.maxHp * PLAYER_HIT_CAP);
    if (r === 'parry') {
      this.char.play('parry', { restart: true, fade: 0.04 });
      this.anim = 'parry';
      return 'parried';
    }
    if (r === 'block') {
      this.hp -= dmg * (1 - PLAYER_BASE.blockReduce);
      this.engine.shove(dirX * knock * 0.4, dirZ * knock * 0.4);
      this.char.play('blockHit', { restart: true, fade: 0.04, onDone: () => { if (this.fighter.phase === 'block') this.char.play('block', { fade: 0.1 }); } });
      if (this.hp <= 0) this.goDown();
      return 'blocked';
    }
    // Hyper-Armor: Schaden ja (etwas weniger), Unterbrechung nein
    this.hp -= r === 'armor' ? dmg * 0.75 : dmg;
    this.secondWindCheck();
    this.char.hitFlash('#FF5A3C', knock > 6 ? 1.3 : 1);
    // 4.6F: kurzer Schmerz im Gesicht, Mantel und Haar fliegen vom Treffer weg
    this.hurtFaceT = knock > 6 ? 0.7 : 0.4;
    this.char.kick(dirX * Math.min(6, knock * 0.5), 0.6, dirZ * Math.min(6, knock * 0.5));
    this.flashT = 0.18;
    if (this.hp <= 0) { this.goDown(); return 'hit'; }
    if (r === 'armor') { this.engine.shove(dirX * knock * 0.15, dirZ * knock * 0.15); return 'hit'; }
    this.engine.hurt(knock > 6 ? 0.5 : 0.28, dirX * knock, dirZ * knock);
    this.char.play(knock > 6 ? 'hitHeavy' : 'hit', { restart: true, fade: FADE.hurt });
    this.anim = 'hurt';
    this.moveShown = -1;
    this.setTrail(false);
    return 'hit';
  }

  private secondWindCheck() {
    if (this.secondWind > 0 && !this.secondWindUsed && this.hp > 0 && this.hp < this.maxHp * 0.25) {
      this.secondWindUsed = true;
      this.hp += this.maxHp * this.secondWind;
      this.deps.overlay?.number(this.tmpV.set(this.x, this.y + 2.2, this.z), 'Zweiter Atem!', 'heal');
    }
  }

  /** Sturm-Schritt: Blitz-Nachbild am alten Ort, Leuchtstreifen zum neuen, Funken (die Zeitlupe setzt das Kampfsystem) */
  private stormStepFx(ox: number, oy: number, oz: number, counter: boolean) {
    const st = ACTION_STYLES[this.fighter.style];
    const fx = this.deps.actionFx;
    fx?.afterimage(ox, oy, oz, st.accent, 0.5, 1.05);
    fx?.afterimage((ox + this.x) / 2, (oy + this.y) / 2, (oz + this.z) / 2, st.color, 0.32, 1);
    fx?.streak(ox, oy + 1.1, oz, this.x, this.y + 1.1, this.z, st.accent, 0.12, 0.35);
    const at = this.tmpV.set(this.x, this.y + 1.1, this.z);
    this.deps.fx?.hit(at, 'magic', st.accent, true);
    at.y = this.y + 0.1;
    this.deps.fx?.shockwave(at, 2.6, st.accent);
    if (counter) this.deps.overlay?.number(at.set(this.x, this.y + 2.6, this.z), 'Mondspiegel!', 'crit');
    this.deps.onStormStep?.(ox, oy, oz, this.fighter);
    this.moveShown = -1;
    this.anim = '';
  }

  /**
   * 4.7C: Wasserlauf – Ausdauer zieht ab (Stehen < Gehen < Laufen), bei 0 schwimmt die Figur, erholt sich langsam und steigt wieder aufs
   * Wasser; Seemüdigkeit senkt die Höchst-Ausdauer bis zum nächsten festen Boden. Dazu Kräuselringe und Fontänen unter den Füßen.
   */
  private stepWater(dt: number, mag: number) {
    const f = this.fighter, W = this.water, wy = this.waterY;
    const over = isWater(this.world.solidHeight(f.x, f.z, f.y), wy);
    if (!over) { if (W.onWater) this.waterStepT = 0; stepWaterWalk(W, false, f.stamina, this.maxStamina, mag, dt); return; }
    // in der Luft über dem Meer: nichts zieht ab, nichts setzt sich zurück
    if (!f.grounded) return;
    const was = W.onWater;
    const r = stepWaterWalk(W, true, f.stamina, this.maxStamina, mag, dt);
    f.stamina = r.stamina;
    // keine Erholung der Engine auf dem Wasser (sie gilt nur an Land); beim Schwimmen erholt sich die Ausdauer langsam (Regel oben)
    f.staminaPause = Math.max(f.staminaPause, 0.2);
    const ov = this.deps.overlay;
    this.waterNoteT -= dt;
    if (!was) {
      this.deps.onWater?.(f.x, wy, f.z, 4);
      if (ov && this.waterNoteT <= 0) { this.waterNoteT = 20; ov.number(this.tmpV.set(f.x, f.y + 2.4, f.z), 'Wasserlauf – kostet Ausdauer', 'info'); }
    }
    if (r.ev === 'sink') {
      this.deps.onWater?.(f.x, wy, f.z, 4);
      ov?.number(this.tmpV.set(f.x, f.y + 2.2, f.z), 'Erschöpft!', 'hurt');
      this.deps.onExhausted?.(f.x, wy, f.z);
    } else if (r.ev === 'rise') {
      this.deps.onWater?.(f.x, wy, f.z, 4);
      ov?.number(this.tmpV.set(f.x, f.y + 2.4, f.z), 'Wieder auf dem Wasser', 'info');
    }
    this.waterStepT -= dt;
    if (this.waterStepT <= 0) {
      const kind = W.swimming ? 3 : mag > 0.7 ? 2 : mag > 0.05 ? 1 : 0;
      this.waterStepT = kind === 3 ? WATER_WALK.stepSwim : kind === 2 ? WATER_WALK.stepRun : kind === 1 ? WATER_WALK.stepWalk : WATER_WALK.stepStand;
      this.deps.onWater?.(f.x, wy, f.z, kind);
    }
  }

  private goDown() {
    this.hp = 0;
    this.engine.down();
    this.setTrail(false);
    this.char.play('deathLong', { restart: true, fade: 0.08 });
    this.anim = 'down';
    this.deps.onDown();
  }

  update(dt: number, input: Input, camYaw: number, ground: Ground, lockYaw: number | null, lockId = '', softId = '') {
    const f = this.fighter;
    this.world.ground = ground;
    const pv = this.prev;
    pv.x = f.x; pv.z = f.z; pv.y = f.y; pv.yaw = f.yaw;
    if (this.bindT > 0) { this.bindT -= dt; if (this.bindT <= 0) this.bindSlow = 0; }
    this.updateTint(dt);
    f.speedK = this.speedMult * (this.bindT > 0 ? 1 - this.bindSlow : 1);
    // Eingabe: Stick relativ zur Kamera in Weltrichtung
    const mv = input.move();
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let dx = fx * mv.y + rx * mv.x, dz = fz * mv.y + rz * mv.x;
    const dl = Math.hypot(dx, dz);
    const inp = this.inp;
    if (dl > 0.001) { dx /= dl; dz /= dl; inp.moveX = dx; inp.moveZ = dz; inp.mag = mag; }
    else { inp.moveX = Math.sin(f.yaw); inp.moveZ = Math.cos(f.yaw); inp.mag = 0; }
    inp.camYaw = camYaw;
    inp.light = input.pressed('attack');
    inp.heavy = input.pressed('heavy');
    inp.jump = input.pressed('jump') && !(this.jumpBlocked && input.pressed('interact'));
    inp.dash = input.pressed('dodge');
    // 4.7B: zehn Formen (1 – 5, Umschalt + 1 – 5, Touch-Seiten, Klick in der Leiste über `queueForm`)
    inp.skill = 0;
    for (let i = 0; i < 10; i++) if (input.pressed(ART_ACTIONS[i])) { inp.skill = i + 1; break; }
    if (!inp.skill && this.formQueued) inp.skill = this.formQueued;
    this.formQueued = 0;
    // 4.7B Geistes-Faji Q/R/T/G – R nur, wenn gerade keine Handlung (Kontextplakette) auf derselben Taste ansteht
    inp.geist = 0;
    for (let i = 0; i < 4; i++) {
      if (!input.pressed(GEIST_ACTIONS[i])) continue;
      if (i === 1 && this.jumpBlocked && input.pressed('interact')) continue;
      inp.geist = i + 1; break;
    }
    if (!inp.geist && this.geistQueued) inp.geist = this.geistQueued;
    this.geistQueued = 0;
    inp.blockHeld = input.down('block');
    inp.blockPressed = input.pressed('block');
    inp.hardLockId = lockYaw === null ? '' : lockId;
    inp.hardLockYaw = lockYaw === null ? NaN : lockYaw;
    // 4.6J: angewähltes Ziel (Tab, Klick): Kampfkünste und Ultimate richten sich darauf aus
    inp.softLockId = softId;
    inp.awaken = input.pressed('awaken');
    inp.aura = input.pressed('aura');
    // 4.7C: schwimmend kein Kampf und kein Dash, langsamer; ein Sprung aus dem Wasser kostet Ausdauer (zum Hinaufklettern an Steg und Bordwand)
    if (this.water.swimming) {
      inp.light = inp.heavy = inp.dash = inp.awaken = false;
      inp.skill = 0; inp.geist = 0;
      if (inp.jump) { if (f.stamina >= WATER_WALK.jumpCost) f.stamina -= WATER_WALK.jumpCost; else inp.jump = false; }
      f.speedK *= WATER_WALK.swimSpeedK;
    }
    this.preY = f.y;
    this.engine.step(inp, this.world, dt);
    this.stepWater(dt, inp.mag);
    this.handleEvents();
    this.animate(dt);
    this.rigInputs(dt, lockId);
    // Tatsächliches Tempo (nicht das befohlene): an Wänden laufen die Füße sonst auf der Stelle
    const moved = dt > 0 ? Math.hypot(f.x - pv.x, f.z - pv.z) / dt : 0;
    this.speed = moved;
    this.realSpeed += (Math.min(moved, 9) - this.realSpeed) * Math.min(1, dt * 18);
    this.char.lean(f.yaw, Math.min(this.speed, this.realSpeed + 0.3), dt);
    // Momentum-Spur (4.6C): treibt ein Schlag die Figur vor, zieht sie Bodenstaub bzw. eine Wasserspur hinter sich her
    const pm = f.phase === 'move' ? this.engine.move : null;
    if (pm && pm.push > 0 && f.grounded && moved > 2.6) {
      this.trailT -= dt;
      if (this.trailT <= 0) { this.trailT = 0.045; this.deps.trail?.(f.x, f.y, f.z, Math.min(1, moved / 9)); }
    } else this.trailT = 0;
    if (f.phase === 'ground' && this.onFoot) this.char.footsteps(f.x, f.y, f.z);
    // Haltungsbruch-Finisher: Hinweis über dem taumelnden Ziel
    const ov = this.deps.overlay;
    if (ov) {
      const ft = f.finisherId && f.phase !== 'move' ? this.engine.target(f.finisherId) : null;
      if (ft) { this.finP.x = ft.x; this.finP.y = ft.y + ft.height + 0.55; this.finP.z = ft.z; ov.setFinisherPrompt(this.finP, this.deps.heavyKey?.() ?? ''); }
      else ov.setFinisherPrompt(null);
    }
    this.noteT = Math.max(0, this.noteT - dt);
  }

  /** Ereignisse der Engine: Clips, Effekte, Klang, Texte */
  private handleEvents() {
    const ev = this.engine.events;
    const f = this.fighter;
    const st = this.engine.style;
    const fx = this.deps.fx, afx = this.deps.actionFx, ov = this.deps.overlay;
    for (let i = 0; i < ev.n; i++) {
      const e = ev.items[i];
      switch (e.type) {
        case 'move': {
          const mv = this.engine.moveAt(e.a);
          if (!mv) break;
          const kind = KIND_OF_CODE[e.b];
          this.startClip(mv, kind === 'light' || kind === 'swap' || kind === 'air');
          if (mv.afterimage) afx?.afterimage(f.x, f.y, f.z, mv.color || st.accent, 0.3);
          if (kind === 'meteor') { ov?.speedlines(0.5); }
          break;
        }
        case 'skill': {
          this.tally.skills++;
          if (st.faji) this.tally.artSkills++;
          this.deps.onSkill?.(e.a, this.engine.moveAt(f.moveIdx), f);
          if (!this.engine.moveAt(f.moveIdx)?.cutin && ov) ov.number(this.tmpV.set(f.x, f.y + 2.5, f.z), e.s, 'info');
          break;
        }
        case 'cutin': ov?.showCutin(e.s, this.engine.moveAt(e.a)?.color || st.accent); ov?.speedlines(0.8); break;
        case 'aftershock': this.deps.onAftershock?.(e.b, e.c, e.a, f); this.deps.shake?.(0.7); break;
        case 'stormBurst': this.deps.onStormBurst?.(e.b, e.c, e.a, f); break;
        case 'jump': {
          // 4.6F: Stoff hinkt dem Absprung nach; beim Luftsprung schlägt der Mantel nach unten und gegen die Richtung
          if (e.a >= 2) this.char.kick(-Math.sin(f.yaw) * 2, -CLOTH_IMPULSE.airJump, -Math.cos(f.yaw) * 2);
          else this.char.kick(0, -CLOTH_IMPULSE.jump, 0);
          const at = this.tmpV.set(f.x, f.y, f.z);
          if (e.a >= 2) { fx?.shockwave(at, 1.8, st.color); afx?.afterimage(f.x, f.y - 0.3, f.z, st.color, 0.25, 0.9); }
          else fx?.puff(at, 6);
          this.char.playClip('Jump_Start', { loop: false, speed: e.a >= 2 ? 2.2 : 1.7, fade: FADE.air, restart: true });
          this.anim = 'jump';
          this.moveShown = -1;
          this.setTrail(false);
          break;
        }
        case 'land': {
          // 4.6F: federndes In-die-Knie-Gehen (Aufprall in m/s)
          this.char.land(e.a);
          if (e.a > 7) { fx?.puff(this.tmpV.set(f.x, f.y, f.z), 10); this.deps.shake?.(Math.min(0.35, e.a * 0.02)); }
          if (f.phase === 'ground' && e.a > 5) { this.char.playClip('Jump_Land', { loop: false, speed: 1.6, fade: FADE.land, restart: true }); this.anim = 'land'; this.landT = 0.25; }
          break;
        }
        case 'fall': if (f.phase === 'air') { this.char.playClip('Jump_Idle', { loop: true, fade: FADE.air }); this.anim = 'fall'; } break;
        case 'wallKick': {
          // 4.6H Wandsprung: Staub und Nachbild an der Wand (hinter der Figur, entgegen der Wandnormale), Mantel schlägt nach unten
          const at = this.tmpV.set(f.x - e.b * 0.4, f.y + 0.6, f.z - e.c * 0.4);
          fx?.puff(at, 5);
          afx?.afterimage(f.x - e.b * 0.25, f.y - 0.2, f.z - e.c * 0.25, st.color, 0.22, 0.8);
          this.char.kick(e.b * 2, -CLOTH_IMPULSE.airJump, e.c * 2);
          break;
        }
        case 'ledge': {
          // 4.6H Kantengriff: kurzes Hochziehen (Landung oben), Staub an der Kante
          fx?.puff(this.tmpV.set(f.x, f.y, f.z), 4);
          this.char.playClip('Jump_Land', { loop: false, speed: 1.9, fade: FADE.land, restart: true });
          this.anim = 'land';
          this.landT = 0.2;
          break;
        }
        case 'dash': {
          const back = e.b === 1;
          this.char.playClip(back ? 'Dodge_Backward' : 'Dodge_Forward', { loop: false, speed: 0.38 / Math.max(0.12, f.dashDur), fade: FADE.dodge, restart: true });
          this.anim = 'dash';
          this.moveShown = -1;
          this.setTrail(false);
          ov?.speedlines(e.a ? 0.55 : 0.35);
          fx?.puff(this.tmpV.set(f.x, f.y, f.z), e.a ? 4 : 10);
          // 4.6F: Mantel und Haar wehen gegen die Dash-Richtung
          this.char.kick(-f.dashX * CLOTH_IMPULSE.dash, 0.4, -f.dashZ * CLOTH_IMPULSE.dash);
          // Rotations-Dash (Doppelklinge, Sturmfaust) und Luft-Dash: Nachbild am Start
          if (e.a || st.dashSpeed >= 18) afx?.afterimage(f.x, f.y, f.z, st.accent, 0.3, 0.95);
          // 4.6D: leuchtendes Nachbild-Band entlang des Dash-Wegs (Länge = Tempo × Dauer)
          {
            const len = Math.max(1, f.dashSpeed * f.dashDur * 0.8);
            this.deps.onDash?.(f.x, f.y, f.z, f.x + f.dashX * len, f.y, f.z + f.dashZ * len, f, !!e.a);
          }
          break;
        }
        case 'impact': {
          const at = this.tmpV.set(f.x, f.y, f.z);
          fx?.shockwave(at, e.a * 1.3, st.accent);
          fx?.crack(at, e.a * 1.1);
          CharacterCls.blastAll(f.x, f.y + 0.4, f.z, e.a * 1.6 + 2, CLOTH_IMPULSE.blast * 0.8);
          fx?.sigil(at, e.a, st.color, 0.9);
          ov?.impactFrame();
          this.deps.shake?.(0.7);
          break;
        }
        case 'hitConfirm': {
          const mv = this.engine.move;
          if (mv && mv.afterimage && afx) afx.afterimage(f.x + Math.sin(f.yaw) * 0.5, f.y, f.z + Math.cos(f.yaw) * 0.5, mv.color || st.accent, 0.22, 0.95);
          if (mv && mv.finisher && e.c === mv.hits.length - 1) { ov?.finisher(); ov?.speedlines(0.9); }
          // Meisterschaft der Faji-Kunst: Treffer zählen, Form-Techniken und Ultimates doppelt, Finisher extra, im Erwachen ×2
          if (st.faji && this.deps.onMastery) {
            const per = f.moveKind === 'skill' || f.moveKind === 'ultimate' ? MASTERY.skillHit : MASTERY.hit;
            const pts = (e.a * per + (f.moveKind === 'finisher' ? MASTERY.finisher : 0)) * (f.awakenT > 0 ? MASTERY.awakenK : 1);
            if (pts > 0) this.deps.onMastery(f.style, pts);
          }
          break;
        }
        case 'notReady':
          if (this.noteT <= 0 && ov) {
            this.noteT = 0.6;
            ov.number(this.tmpV.set(f.x, f.y + 2.3, f.z), e.a === 5 ? 'Willenskraft noch nicht voll' : 'Noch nicht bereit', 'info');
          }
          break;
        case 'locked':
          if (this.noteT <= 0 && ov) {
            this.noteT = 0.8;
            // 4.7B: Formen und Ultimate werden im Klassenbaum frei (Form k an Knoten 1, 6, 12 … 54; Ultimate an Knoten 60)
            const txt = e.a === 11
              ? (e.b > 0 ? `Ultimate erst mit Knoten ${e.b} des Klassenbaums` : 'Kein Ultimate')
              : `Form ${e.a}: erst mit Knoten ${e.b} des Klassenbaums`;
            ov.number(this.tmpV.set(f.x, f.y + 2.3, f.z), txt, 'info');
          }
          break;
        case 'heal': {
          // 4.7B: Heilung (Priester-Formen, Himmelsgericht, Lebensstrom-Fokus): selbst und Verbündete im Radius, mit der Heilkraft des Baums
          const k = e.a * this.healK;
          const before = this.hp;
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * k);
          if (ov && this.hp > before) ov.number(this.tmpV.set(f.x, f.y + 2.2, f.z), `+${Math.round(this.hp - before)}`, 'heal');
          this.deps.onHeal?.(k, e.b, f);
          break;
        }
        case 'geist': {
          // 4.7B Geistes-Faji: b = −1 gesperrt, −2 noch nicht bereit; sonst Darstellung
          if (e.b < 0) {
            if (this.noteT <= 0 && ov) { this.noteT = 0.7; ov.number(this.tmpV.set(f.x, f.y + 2.3, f.z), e.b === -1 ? 'Geistes-Faji noch nicht erwacht' : 'Noch nicht bereit', 'info'); }
            break;
          }
          this.tally.geist++;
          this.deps.onGeist?.(e.a, e.b, e.c, f);
          const at = this.tmpV.set(f.x, f.y + 0.1, f.z);
          if (e.a === 3) { fx?.shockwave(at, e.b * 0.7, '#9A6AFF'); fx?.crack(at, e.b * 0.35); this.deps.shake?.(0.55); CharacterCls.blastAll(f.x, f.y + 0.3, f.z, e.b + 2, CLOTH_IMPULSE.blast * 0.8); }
          if (e.a === 4) {
            fx?.shockwave(at, Math.min(12, e.b * 0.6), '#FFD27A'); fx?.crack(at, e.b * 0.5); fx?.sigil(at, 4, '#FFD27A', 1.6);
            ov?.showCutin('Königsdruck', '#FFD27A'); ov?.impactFrame(); this.deps.shake?.(1.0);
            CharacterCls.blastAll(f.x, f.y + 0.3, f.z, e.b + 4, CLOTH_IMPULSE.blast);
          }
          if (e.a === 1) { ov?.number(this.tmpV.set(f.x, f.y + 2.6, f.z), 'Willens-Entfesselung!', 'crit'); afx?.afterimage(f.x, f.y, f.z, '#FFD27A', 0.5, 1.1); }
          if (e.a === 2) ov?.number(this.tmpV.set(f.x, f.y + 2.6, f.z), 'Lebensstrom-Fokus', 'info');
          break;
        }
        case 'willFull':
          if (ov && this.willNoteT <= 0) {
            this.willNoteT = 4;
            const k = this.deps.awakenKey?.() ?? '';
            ov.number(this.tmpV.set(f.x, f.y + 2.7, f.z), k ? `Willenskraft voll! [${k}] Sturm-Erwachen` : 'Willenskraft voll!', 'crit');
          }
          break;
        case 'awaken': {
          const at = this.tmpV.set(f.x, f.y + 0.1, f.z);
          fx?.shockwave(at, 6, st.accent);
          fx?.sigil(at, 3.2, st.color, 1.4);
          at.y += 1.1;
          fx?.puffColor(at, st.color);
          afx?.afterimage(f.x, f.y, f.z, st.accent, 0.6, 1.15);
          ov?.showCutin('Sturm-Erwachen', st.accent);
          ov?.speedlines(1);
          ov?.impactFrame();
          this.deps.shake?.(0.9);
          this.deps.focus?.(1);
          this.deps.onAwaken?.(true);
          this.tintKey = '';
          // 4.6F: die Druckwelle des Erwachens reißt an Mänteln und Haaren ringsum
          CharacterCls.blastAll(f.x, f.y + 0.3, f.z, 9, CLOTH_IMPULSE.blast);
          break;
        }
        case 'awakenEnd':
          ov?.number(this.tmpV.set(f.x, f.y + 2.4, f.z), 'Das Erwachen verklingt', 'info');
          this.deps.onAwaken?.(false);
          this.tintKey = '';
          break;
        case 'aura': {
          const a = WILL_AURAS[e.a] ?? WILL_AURAS[0];
          ov?.number(this.tmpV.set(f.x, f.y + 2.5, f.z), e.a ? `Aura: ${a.label}` : 'Aura abgelegt', e.a ? 'crit' : 'info');
          if (e.a) fx?.shockwave(this.tmpV.set(f.x, f.y + 0.1, f.z), 2.8, a.color);
          this.tintKey = '';
          break;
        }
        case 'kingWave': {
          const at = this.tmpV.set(f.x, f.y + 0.1, f.z);
          fx?.shockwave(at, Math.min(9, e.a * 0.45), '#FFD27A');
          this.deps.onKingWave?.(f.x, f.y, f.z, e.a);
          CharacterCls.blastAll(f.x, f.y + 0.3, f.z, Math.min(18, e.a * 0.6 + 3), CLOTH_IMPULSE.blast * 0.7);
          if (e.b > 0) { this.deps.shake?.(0.45); if (e.a > 16 && ov) ov.number(at.set(f.x, f.y + 2.8, f.z), 'Königsdruck!', 'crit'); }
          break;
        }
        case 'awakenWave': this.deps.onAwakenWave?.(f, st.color, st.accent); break;
        case 'chain': {
          const pool = this.engine.pool;
          const b = pool[e.a], a = e.b >= 0 ? pool[e.b] : null;
          if (b && a) this.deps.onChain?.(a.x, a.y + a.height * 0.6, a.z, b.x, b.y + b.height * 0.6, b.z, st.accent);
          break;
        }
        case 'ultimate': {
          const mv = this.engine.moveAt(e.a);
          if (mv?.ultimate) {
            this.deps.onUltimate?.(mv, mv.ultimate, f);
            afx?.afterimage(f.x, f.y, f.z, mv.ultimate.accent, 0.8, 1.2);
            fx?.sigil(this.tmpV.set(f.x, f.y + 0.05, f.z), 4, mv.ultimate.color, 1.6);
          }
          break;
        }
        case 'ultStrike': {
          const mv = this.engine.moveAt(e.a);
          if (mv?.ultimate) {
            this.deps.onUltStrike?.(mv, mv.ultimate, f);
            this.deps.shake?.(1.2);
            CharacterCls.blastAll(f.x, f.y + 0.5, f.z, 22, CLOTH_IMPULSE.blast);
          }
          break;
        }
        case 'chase': {
          // Sturm-Verfolgung: Blitz-Nachbild am alten Ort, Leuchtstreifen bis zum Ziel in der Luft
          const ox = e.b, oz = e.c, oy = this.preY;
          afx?.afterimage(ox, oy, oz, st.accent, 0.5, 1.05);
          afx?.streak(ox, oy + 1.1, oz, f.x, f.y + 1.1, f.z, st.accent, 0.14, 0.4);
          ov?.number(this.tmpV.set(f.x, f.y + 2.4, f.z), 'Sturm-Verfolgung!', 'crit');
          ov?.speedlines(0.8);
          this.deps.onChase?.(ox, oy, oz, f);
          this.char.playClip('Jump_Idle', { loop: true, fade: 0.05 });
          this.anim = 'fall';
          this.moveShown = -1;
          break;
        }
        case 'clash':
          // Klingen-Clash: Funkenfontäne zwischen den Klingen (Text, Hit-Stop und Druckring setzt das Kampfsystem)
          this.deps.onClash?.(f.x + Math.sin(f.yaw) * 1.1, f.y + 1.35, f.z + Math.cos(f.yaw) * 1.1, f.yaw);
          this.deps.impactFrames?.(2);
          ov?.speedlines(0.7);
          break;
        case 'swing': {
          const mv = this.engine.moveAt(e.a);
          const h = mv?.hits[e.b];
          if (h?.projectile) this.tally.salvo++;
          if (mv && h) this.deps.onSwing?.(mv, h, f);
          // 4.91: Treffermoment einer Form = Schwungfenster ihres stärksten Treffers
          if (mv && h && f.moveKind === 'skill') {
            const slot = this.engine.formSlot(mv);
            if (slot > 0 && e.b === decisiveHit(mv.hits)) this.deps.onFormHit?.(slot, mv, h, f);
          }
          break;
        }
        case 'slash': {
          const mv = this.engine.moveAt(e.a);
          const h = mv?.hits[e.b];
          if (mv && h) this.deps.onSlash?.(mv, h, f, this.slashStep++);
          break;
        }
        case 'sheath':
          // Iaijutsu: die Klinge rastet ein – alles Durchquerte zerbricht zugleich
          if (ov) ov.number(this.tmpV.set(f.x, f.y + 2.6, f.z), e.a > 0 ? `Klick. ${e.a}× Weltenbruch` : 'Klick.', 'crit');
          ov?.impactFrame();
          break;
        case 'buff':
          if (ov) ov.number(this.tmpV.set(f.x, f.y + 2.6, f.z), e.s === 'hyper' ? 'Unbeugsam! Hyper-Armor' : e.s === 'crit' ? 'Sturmkrone! Krit +25 %' : 'Stärkung!', 'crit');
          break;
        default: break;
      }
    }
  }

  /**
   * Färbung der Figur: Seestein-Fesseln (blau) vor Sturm-Erwachen (pulsierende Aura in der Stilfarbe) vor Eisenwille (dunkler Metallglanz).
   * Setzt die Färbung nur bei einem Wechsel (der Puls des Erwachens läuft über die Stärke).
   */
  private updateTint(dt: number) {
    const f = this.fighter;
    this.willNoteT = Math.max(0, this.willNoteT - dt);
    // Schlüssel ohne neue Zeichenketten je Bild: die Stil-Kennung selbst steht für „Erwachen in diesem Stil“
    let key: string = '', col = '#ffffff', amt = 0, pulse = false;
    if (this.bindT > 0) { key = 'bind'; col = '#7FA8D8'; amt = 0.55; }
    else if (f.awakenT > 0) {
      this.pulseT += dt;
      key = f.style; col = ACTION_STYLES[f.style].accent; pulse = true;
      amt = 0.32 + 0.16 * Math.sin(this.pulseT * 7.5);
      // die letzten 3 s flackert die Aura (Ende kündigt sich an)
      if (f.awakenT < 3 && Math.sin(this.pulseT * 26) > 0.4) amt *= 0.35;
    } else if (f.aura === 2) { key = 'iron'; col = '#4A5A70'; amt = 0.42; }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.tintKey = '#'; }
    if (key !== this.tintKey) { this.tintKey = key; this.char.setTint(col, amt); }
    else if (pulse) this.char.setTintAmount(amt);
  }

  /** Clip eines Angriffs starten; die Zeit hält danach `syncClip` an der Engine fest */
  private startClip(mv: ActionMove, chain: boolean) {
    this.moveAction = this.char.playSynced(mv.clip, chain ? FADE.chain : FADE.move);
    this.moveShown = this.fighter.moveSeq;
    this.anim = 'move';
    this.syncClip(mv);
  }

  private syncClip(mv: ActionMove) {
    const a = this.moveAction;
    if (!a) return;
    const d = a.getClip().duration;
    if (this.cineClip >= 0 && this.fighter.cineT > 0 && mv.ultimate) {
      a.time = Math.min(d - 0.001, Math.max(0, this.cineClip) * d);
      a.timeScale = 0;
      return;
    }
    const u = Math.max(0, Math.min(0.999, this.fighter.moveT / mv.dur));
    a.time = Math.min(d - 0.001, (mv.clipFrom + (mv.clipTo - mv.clipFrom) * u) * d);
    a.timeScale = 0;
  }

  private setTrail(on: boolean, color?: string) {
    if (on === this.trailOn && !on) return;
    this.trailOn = on;
    this.char.setTrail(on, color);
  }

  /** Darstellung je Zustand: Angriff (Clip im Takt der Engine), Luft, Dash, Laufen */
  private animate(dt: number) {
    const f = this.fighter;
    const st = ACTION_STYLES[f.style];
    this.landT = Math.max(0, this.landT - dt);
    if (f.phase === 'move') {
      const mv = this.engine.move;
      if (!mv) return;
      if (this.moveShown !== f.moveSeq) this.startClip(mv, true);
      else this.syncClip(mv);
      // Lichtschweif an der Klinge: vom Ausholen bis kurz nach dem letzten Treffer
      let swing = false;
      for (const h of mv.hits) if (!h.projectile && f.moveT >= h.t0 - 0.1 && f.moveT <= h.t1 + 0.08) { swing = true; break; }
      this.setTrail(swing, mv.color || st.color);
      return;
    }
    if (this.trailOn) this.setTrail(false);
    if (f.phase === 'air') {
      if (this.anim !== 'jump' && this.anim !== 'fall') { this.char.playClip('Jump_Idle', { loop: true, fade: FADE.air }); this.anim = 'fall'; }
      else if (this.anim === 'jump' && f.vy < 0.5) { this.char.playClip('Jump_Idle', { loop: true, fade: 0.2 }); this.anim = 'fall'; }
      return;
    }
    if (f.phase === 'block') {
      if (this.anim !== 'block') { this.char.play('block', { fade: FADE.block }); this.anim = 'block'; }
      return;
    }
    if (f.phase !== 'ground') return;
    if (this.anim === 'land' && this.landT > 0 && this.realSpeed < 1.5) return;
    if (this.anim === 'parry' && this.char.progress < 0.85) return;
    // Laufen: Schwellen mit Hysterese, damit Gehen/Rennen/Stehen an der Grenze nicht flackern
    const cur = this.anim;
    const sp = this.realSpeed;
    const want = cur === 'idle'
      ? (sp > 0.25 ? (sp > 3.0 ? 'run' : 'walk') : 'idle')
      : cur === 'run' ? (sp < 2.4 ? (sp < 0.15 ? 'idle' : 'walk') : 'run')
        : cur === 'walk' ? (sp > 3.0 ? 'run' : sp < 0.15 ? 'idle' : 'walk')
          : (sp > 3.0 ? 'run' : sp > 0.25 ? 'walk' : 'idle');
    // 4.6G: mit weggesteckter Klinge steht die Figur locker (Idle_A) statt in der Zweihand-Kampfhaltung mit leeren Händen
    const idleClip = this.char.sheathed && st.idleClip === 'Melee_2H_Idle' ? 'Idle_A' : st.idleClip;
    if (want === 'idle' && this.anim === 'idle' && idleClip !== this.idleShown) { this.idleShown = idleClip; this.char.playClip(idleClip, { loop: true, fade: 0.45 }); }
    if (want !== this.anim) {
      this.anim = want;
      if (want === 'idle') { this.idleShown = idleClip; this.char.playClip(idleClip, { loop: true, fade: FADE.idle }); }
      else this.char.play(want === 'run' ? 'run' : 'walk', { fade: FADE.locomotion });
    }
    if (want !== 'idle') this.char.setLocoSpeed(this.realSpeed);
  }

  /**
   * Rig der Spielfigur (4.6F): Boden unter den Füßen, Ausdruck (entspannt, Kampf-Blick, Schmerz, entschlossenes Grinsen mit Augen-Leuchten
   * im Sturm-Erwachen und bei Ultimates), Kampf-Bereitschaft, Blick zum erfassten oder nächsten Gegner, Fäuste im Faustkampf.
   */
  private rigInputs(dt: number, lockId: string) {
    const f = this.fighter, ch = this.char;
    ch.setGrounded(f.grounded);
    this.hurtFaceT = Math.max(0, this.hurtFaceT - dt);
    // Kampfnähe: Ziel erfasst, eigener Angriff, oder ein wacher Gegner in 12 m (alle 0,25 s geprüft)
    this.engagedT -= dt;
    if (this.engagedT <= 0) {
      this.engagedT = 0.25;
      let near = false;
      const es = this.deps.combat?.enemies;
      if (es) for (let i = 0; i < es.length; i++) { const e = es[i]; if (e.alive && Math.abs(e.x - f.x) < 12 && Math.abs(e.z - f.z) < 12) { near = true; break; } }
      this.engaged = near;
    }
    const fight = this.engaged || f.phase === 'move' || f.phase === 'block' || !!lockId;
    const st = ACTION_STYLES[f.style];
    const mood: ExpressionId = f.phase === 'down' ? 'ko'
      : f.awakenT > 0 || this.inUltimate ? 'entschlossen'
        : this.hurtFaceT > 0 ? 'schmerz'
          : fight ? 'kampf' : 'hafen';
    if (mood !== this.moodShown) { this.moodShown = mood; ch.setMood(mood); }
    if (this.glowStyle !== f.style) { this.glowStyle = f.style; ch.setGlowColor(st.accent); }
    ch.setReady(fight && f.phase !== 'move' ? 1 : 0);
    // 4.6G: nach einigen ruhigen Sekunden wandert die Klinge auf den Rücken; jede Kampfhandlung zieht sie im selben Bild
    if (fight || f.awakenT > 0 || this.inUltimate || f.phase === 'down') this.calmT = 0; else this.calmT += dt;
    ch.sheathe(this.calmT > SHEATH.calmAfter);
    // Blick: erfasstes Ziel, sonst der nächste Gegner in 10 m
    const t = lockId ? this.engine.target(lockId) : null;
    if (t) ch.lookAt(t.x, t.y + t.height * 0.85, t.z);
    else if (this.engaged) {
      let best: { x: number; y: number; z: number } | null = null, bd = 100;
      const es = this.deps.combat?.enemies;
      if (es) for (let i = 0; i < es.length; i++) { const e = es[i]; if (!e.alive) continue; const d = (e.x - f.x) ** 2 + (e.z - f.z) ** 2; if (d < bd) { bd = d; best = e; } }
      if (best) ch.lookAt(best.x, best.y + 1.5, best.z); else ch.lookAt(null);
    } else ch.lookAt(null);
    // Faustkampf: geballte Fäuste im Kampf, sonst entspannt (Waffen halten ihren Griff selbst)
    if (this.style === 'faust') {
      const want = fight ? 'faust' : 'offen';
      if (want !== this.fistShown) { this.fistShown = want; ch.setHandPose('l', want); ch.setHandPose('r', want); }
    } else this.fistShown = '';
  }

  /** Beim Verlassen der Insel/K.O.: laufende Effekte beenden */
  stopEffects() {
    this.setTrail(false);
    this.deps.overlay?.setFinisherPrompt(null);
  }
}
