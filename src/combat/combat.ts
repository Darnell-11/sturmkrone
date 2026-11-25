import type { SmokeSystem } from '../world/smoke';
import { audio } from '../audio/audio';
import type { AllyTarget } from '../entities/ally';
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Camera,
  type Scene,
  type Object3D,
} from 'three';
import { ENEMIES, type AttackDef, type BossMech, type EnemyAttack, type EnemyKind, type ZoneSpec } from '../data/combat';
import { rollLoot, type LootDrop } from '../data/loot';
import { LootSystem } from './loot';
import { ZoneSystem, zoneContains, type WarnZone } from './zones';
import type { Faction } from '../core/save/types';
import type { FactionId } from '../data/factions';
import type { CharacterAssets } from '../entities/character/assets';
import { Enemy, type EnemyWorld, type HitInfo } from '../entities/enemy';
import { addOutlines } from '../render/outline';
import { toon } from '../render/toon';
import type { BossView, CombatOverlay } from '../ui/combatOverlay';
import type { DeckGround, Ground, WalkIsland } from '../world/islandGround';
import type { CombatFx } from './fx';
import type { AbilityTarget } from '../faji/abilities';
import type { Element, Status } from '../data/skills';
import { markShared } from '../render/dispose';
import { navForIsland, type NavGrid } from '../ai/navGrid';
import { attackVolume, Hurtbox, LogicFrame, OBB, weaponSegments, ZONE_MULT, type Zone } from './hitbox';
import type { Character } from '../entities/character/character';
import type { TroopSquad } from '../entities/troops/squad';
import type { EntityId } from '../sim/entityId';
import { sharedGeo } from '../render/geoCache';
import { clamp01 } from '../core/mathUtil';

export interface PlayerTarget {
  /** Kennung der Spielfigur (Schlüssel der Bedrohungstabellen) */
  readonly entityId: EntityId;
  /** Seestein-Ketten: Bewegung für `dur` Sekunden auf den Faktor `slow` gebremst (0 … 1 = so viel Tempo geht verloren) */
  bind?(dur: number, slow: number): void;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly yaw: number;
  readonly active: boolean;
  /** Treffer auf den Spieler; liefert, was passiert ist */
  receiveHit(dmg: number, dirX: number, dirZ: number, knock: number, from: Enemy | null, elemental?: boolean): 'hit' | 'blocked' | 'parried' | 'dodged';
}

// feste Hilfsobjekte für Treffertests (keine Speicheranforderung im Kampf)
const VOL = new OBB();
const HB_TARGET = new Hurtbox();
const HIT_P = new Vector3();
const SEG_A = new Vector3(), SEG_B = new Vector3(), SEG_D = new Vector3();
/** Teststrecken je Schlag: je Klinge/Glied die echte Strecke und ihr Schwertwind */
const MAX_SEGS = 8;
const PL_FRAME = new LogicFrame();
/** Ziel einer Fähigkeit (Spielfigur als Ort): wird vor jeder Nutzung neu gefüllt */
const ENT = { x: 0, y: 0, z: 0, radius: 0.35 };
type Spot = { x: number; y: number; z: number; radius: number };
/** Wie stark ein Hieb die Formation eines Verbands trifft (er trifft viele Köpfe auf einmal) */
const MASS_CLEAVE = 2.4;
/** Aura-Ringe der Hauptmänner: ein Ring je Aura, geteilte Netze */
const AURA_MATS = new Map<string, MeshBasicMaterial>();
function auraMat(id: string, color: string): MeshBasicMaterial {
  let m = AURA_MATS.get(id);
  if (!m) { m = markShared(new MeshBasicMaterial({ color: new Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: 2, fog: false })); AURA_MATS.set(id, m); }
  return m;
}

export interface CombatHooks {
  heal(n: number): void;
  hitstop(seconds: number, scale?: number): void;
  shake(amount: number): void;
  /** Wirksamer Treffer: kurzer Standbild-Moment (30–40 ms) und Kamerastoß in Trefferrichtung (0 … 1,5) */
  impact(dirX: number, dirZ: number, strength: number): void;
  kill(e: Enemy): void;
  gold(n: number): void;
  message(t: string): void;
  /** Beute aufgehoben (Säule eingesaugt): Spielstand und Anzeige */
  loot(d: LootDrop): void;
  /** Filmreifer Fokus (Parade, Finisher): die Kamera rückt kurz näher (0 … 1) */
  focus?(strength: number): void;
}

interface Projectile { mesh: Mesh; vel: Vector3; life: number; radius: number; dmg: number; knock: number; team: 'player' | 'enemy'; from: Enemy | null; pierce: boolean; hit: Set<object>; color: string; poise: number; trail: number }
interface Aoe { x: number; z: number; y: number; r: number; t: number; dmg: number; knock: number; from: Enemy }
interface Coin { mesh: Mesh; x: number; y: number; z: number; vy: number; vx: number; vz: number; value: number; t: number }

/** Übungspuppe: nimmt Treffer, fällt nie um */
class Dummy {
  readonly group = new Group();
  wobble = 0;
  readonly radius = 0.5;
  readonly hurt = new Hurtbox();
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
    // Trefferzonen: Kopf (Kugel), Sack (Rumpf), Pfahl (Beine)
    this.hurt.head.setUpright(x, y + 1.85, z, 0, 0.26, 0.25, 0.26);
    this.hurt.torso.setUpright(x, y + 1.2, z, 0, 0.38, 0.47, 0.38);
    this.hurt.legs.setUpright(x, y + 0.4, z, 0, 0.12, 0.4, 0.12);
    this.hurt.center.copy(this.hurt.torso.c);
  }
  update(dt: number) {
    this.wobble *= Math.pow(0.02, dt);
    this.group.rotation.z = Math.sin(performance.now() * 0.02) * this.wobble * 0.15;
  }
}

/** Nahkampf, Fernkampf, Trefferlogik und Gegner – alles auf der aktuellen Insel. */
export class CombatSystem implements EnemyWorld {
  enemies: Enemy[] = [];
  /** Crew an deiner Seite (Gegner greifen auch sie an) */
  allies: AllyTarget[] = [];
  private targets = new Map<Enemy, { t: AllyTarget | null; until: number }>();
  lock: Enemy | null = null;
  player: PlayerTarget | null = null;
  playerPos: Vector3 | null = null;
  // feste Vektoren für Ziel und Spielerposition (pro Bild nur neu gesetzt, nicht neu angelegt)
  private plVec = new Vector3();
  private tgVec = new Vector3();
  private barVec = new Vector3();
  private engagedTmp: Enemy[] = [];
  playerActive = false;
  /** Verbände der Verteidiger (Raid): zählen als Ziele für Hiebe, Geschosse und Fähigkeiten und als Gegner der eigenen Trupps */
  mass: TroopSquad[] = [];
  /** Alle Gegner einschließlich Verbände für die Trupps (jedes Bild neu gefüllt, ohne neue Liste) */
  readonly foes: (Enemy | TroopSquad)[] = [];
  /** Endboss beginnt eine neue Phase / ruft Verstärkung (setzt der Raid) */
  onBossPhase: ((e: Enemy, phase: number) => void) | null = null;
  onSummon: ((e: Enemy, mech: Extract<BossMech, { kind: 'summon' }>) => void) | null = null;
  private dtLast = 1 / 60;
  private threatFor: Enemy | null = null;
  private readonly threatOk = (id: EntityId): boolean => {
    const e = this.threatFor, t = this.entityAt(id);
    return !!e && !!t && Math.hypot(t.x - e.x, t.z - e.z) < 70;
  };
  private tauntAt = new Map<EntityId, number>();
  private auraFx = new Map<Enemy, Mesh>();
  /** Neue Gegner vorwärmen (Shader übersetzen, bevor die Kamera sie zeigt): setzt die Welt */
  onSpawn: ((o: Object3D) => void) | null = null;
  /** Basis-Angriffswert des Spielers */
  atk = 12;
  critChance = 0.1;
  /** Waffenstufe der Spielfigur (1 … 5): Durchschlag gegen die Rüstung der Gegner (`Enemy.takeHit`) */
  attackTier = 1;
  /** Boni aus Fähigkeiten und Synergien */
  mods = { critMult: 1.6, lifesteal: 0, burnOnHit: false, fearWeak: 0, playerLevel: 1, frostParry: false, skillMult: 1 };
  private dots = new Map<Enemy, { burn: number; poison: number; dps: number; tick: number }>();
  private dummies: Dummy[] = [];
  private projectiles: Projectile[] = [];
  /** Rauch für Einschläge und Geschossspuren (setzt die Welt) */
  smoke: SmokeSystem | null = null;
  private aoes: Aoe[] = [];
  /** Warnflächen der Boss-Angriffe und Beute-Säulen */
  readonly zones: ZoneSystem;
  readonly loot: LootSystem;
  private zoneHit = new WeakMap<Enemy, number>();
  private coins: Coin[] = [];
  private tokens = new Set<Enemy>();
  private now = 0;
  private swings = new Map<number, Set<object>>();
  private island: WalkIsland | null = null;
  private outline = true;
  /** Begehbarkeits-Netz der aktuellen Insel (null an Deck) */
  nav: NavGrid | null = null;
  /** Blickrichtung des Ziels, das der gerade aktualisierte Gegner verfolgt (NaN bei Crew-Zielen) */
  targetYaw = NaN;
  // Klingen-Sweep: Klingenlage im letzten Logikschritt (je Strecke Anfang und erweiterte Spitze)
  private sweepId = -1;
  private sweepN = 0;
  private sweepPrev = Array.from({ length: MAX_SEGS * 2 }, () => new Vector3());
  private sweepCur = Array.from({ length: MAX_SEGS * 2 }, () => new Vector3());
  private sweepR = new Float32Array(MAX_SEGS);

  constructor(
    private scene: Scene,
    private fx: CombatFx,
    private overlay: CombatOverlay,
    private assets: CharacterAssets,
    private groundRef: Ground,
    private hooks: CombatHooks,
  ) {
    this.zones = new ZoneSystem(scene);
    this.loot = new LootSystem(scene, fx);
    this.loot.onPickup = (d) => hooks.loot(d);
  }

  setOutline(v: boolean) { this.outline = v; }

  // ---------- EnemyWorld ----------

  requestToken(e: Enemy) {
    for (const t of this.tokens) if (!t.alive) this.tokens.delete(t);
    const big = e.def.boss || e.def.raid === 'captain';
    const max = big ? 3 : 2;
    if (this.tokens.has(e)) return true;
    if (this.tokens.size >= max && !big) return false;
    this.tokens.add(e);
    return true;
  }
  releaseToken(e: Enemy) { this.tokens.delete(e); }
  attackersNear(e: Enemy) {
    const p = this.playerPos;
    if (!p) return 0;
    let n = 0;
    for (const t of this.tokens) if (t !== e && t.alive && Math.hypot(t.x - p.x, t.z - p.z) < 6) n++;
    return n;
  }

  /** Trefferzonen eines Gegners (je Logikschritt einmal aus den Knochen) */
  private hurtOf(e: Enemy): Hurtbox {
    if (e.hurt.stamp !== this.now) { e.hurt.fromCharacter(e.char, e.x, e.y, e.z, e.yaw, e.def.scale); e.hurt.stamp = this.now; }
    return e.hurt;
  }
  ground(x: number, z: number, y?: number) { const h = this.groundRef.height(x, z, y); return Number.isFinite(h) ? h : 0; }
  constrain(x: number, z: number, r: number, self?: Enemy) {
    // Gegner untereinander und vom Spieler fernhalten (sich selbst überspringen!)
    for (const o of this.enemies) {
      if (!o.alive || o === self) continue;
      const dx = x - o.x, dz = z - o.z;
      const d = Math.hypot(dx, dz);
      const min = r + o.radius;
      if (d > 0.001 && d < min) { x = o.x + (dx / d) * min; z = o.z + (dz / d) * min; }
    }
    // Nicht in Crew hineinlaufen
    if (self) for (const a of this.allies) {
      if (!a.alive) continue;
      const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz), min = r + a.radius;
      if (d > 0.001 && d < min) { x = a.x + (dx / d) * min; z = a.z + (dz / d) * min; }
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
    return this.groundRef.constrain(x, z, r, self?.y);
  }

  /** Boss beginnt eine neue Phase: Brüllen mit Schockring, Banner, Kamerawackeln */
  bossPhase(e: Enemy, phase: number) {
    e.guardT = 0; e.counterT = 0;
    this.onBossPhase?.(e, phase);
    const at = new Vector3(e.x, this.ground(e.x, e.z), e.z);
    this.fx.shockwave(at, 10, '#FF5A3C');
    this.fx.crack(at, 8);
    this.fx.sigil(at, 6, '#FF3A2A', 2.2);
    this.hooks.shake(0.9);
    this.hooks.hitstop(0.2, 0.1);
    this.overlay.impactFrame();
    this.overlay.showCutin(phase >= 3 ? 'Letzter Atem!' : 'Der Zorn erwacht!', '#FF3A2A');
    if (e.def.phases !== 2) this.overlay.showBanner(e.name ?? e.def.label, phase >= 3 ? 'Phase 3 – er gibt nichts mehr auf' : 'Phase 2 – neue Angriffe');
  }

  /** Haltebalken des Bosses leer: Break (er taumelt, +50 % Schaden) */
  bossBreak(e: Enemy) {
    this.overlay.number(e.head, 'BREAK!', 'crit');
    this.overlay.impactFrame();
    this.overlay.speedlines(0.8);
    this.fx.shockwave(new Vector3(e.x, this.ground(e.x, e.z), e.z), 4, '#FFD166');
    this.hooks.shake(0.6);
    this.hooks.hitstop(0.14, 0.08);
  }

  // ---------- Ziele über Kennungen ----------

  /** Ort und Radius eines Ziels über seine Kennung (Spielfigur, Offizier, Trupp); null, wenn gefallen oder nicht im Kampf */
  private entityAt(id: EntityId | null): Spot | null {
    if (!id) return null;
    const pl = this.player;
    if (pl && pl.entityId === id) { if (!pl.active) return null; ENT.x = pl.x; ENT.y = pl.y; ENT.z = pl.z; ENT.radius = 0.35; return ENT; }
    for (const a of this.allies) if (a.alive && a.entityId === id) return a;
    return null;
  }

  /** Alle Ziele in Reichweite eines Gegners: Spielfigur und Crew (je als eigener Ort) */
  private victims(e: Enemy, range = 40): Spot[] {
    const out: Spot[] = [];
    const pl = this.player;
    if (pl?.active && Math.hypot(pl.x - e.x, pl.z - e.z) < range) out.push({ x: pl.x, y: pl.y, z: pl.z, radius: 0.35 });
    for (const a of this.allies) if (a.alive && Math.hypot(a.x - e.x, a.z - e.z) < range) out.push(a);
    return out;
  }

  /** Das Ziel eines Gegners: das aus der Bedrohungstabelle, sonst das, was ihm das Kampfsystem gerade als Ziel hinlegt */
  private targetSpot(e: Enemy): Spot | null {
    const t = this.entityAt(e.targetEntityId);
    if (t) return { x: t.x, y: t.y, z: t.z, radius: t.radius };
    const p = this.playerPos;
    return p ? { x: p.x, y: p.y, z: p.z, radius: 0.35 } : null;
  }

  enemyTelegraph(e: Enemy, atk: EnemyAttack) {
    const tg = this.targetSpot(e);
    if (atk.mech) this.mechTelegraph(e, atk.mech);
    if (atk.zones && tg) {
      const phaseK = e.def.boss && e.phase >= 3 ? 0.7 : 1;
      const dmg = e.strength * atk.dmg * 1.3;
      const list = this.victims(e);
      for (const zs of atk.zones) this.spawnZones(e, atk, zs, tg, list, phaseK, dmg);
      if (atk.label) this.overlay.number(e.head.setY(e.y + 3.4 * e.def.scale), atk.label, 'info');
    } else if (atk.label) this.overlay.number(e.head.setY(e.y + 3.4 * e.def.scale), atk.label, 'info');
    if (atk.aoe && this.playerPos) {
      const at = atk.aoe.delay > 0 ? this.playerPos.clone() : new Vector3(e.x + Math.sin(e.yaw) * 1.8, e.y, e.z + Math.cos(e.yaw) * 1.8);
      at.y = this.ground(at.x, at.z);
      const total = atk.windup + (atk.aoe.delay > 0 ? atk.aoe.delay : 0.35);
      this.fx.telegraph(at, atk.aoe.radius, total);
      this.aoes.push({ x: at.x, z: at.z, y: at.y, r: atk.aoe.radius, t: total, dmg: e.strength * atk.dmg * 1.3, knock: atk.knock, from: e });
    }
  }

  /** Warnflächen einer Angriffs-Zone anlegen: am Gegner, beim Ziel, hinter dem Ziel, bei jedem Ziel oder verstreut */
  private spawnZones(e: Enemy, atk: EnemyAttack, zs: ZoneSpec, tg: Spot, list: Spot[], phaseK: number, dmg: number) {
    const at = zs.at ?? 'self';
    const base = atk.windup * phaseK + (zs.extra ?? 0.35);
    const sticky = (at !== 'self' && at !== 'player') || (zs.extra ?? 0) >= 0.8;
    const solo = at === 'scatter' || at === 'allies' || at === 'target' || at === 'behind';
    const put = (cx: number, cz: number, yaw: number, delay: number) =>
      this.zones.spawn(e, zs, cx, cz, this.ground(cx, cz), yaw, base + delay, dmg, atk.knock, e.atkSeq, { sticky, solo });
    if (at === 'scatter') {
      const n = Math.max(1, zs.count ?? 3), v = list.length ? list : [tg];
      for (let i = 0; i < n; i++) {
        const t = v[i % v.length], a = Math.random() * Math.PI * 2;
        // jedes Ziel bekommt zuerst eine Fläche in seiner Nähe, die übrigen fallen verstreut
        const d = i < v.length ? 1.2 : (zs.scatter ?? 8) * Math.sqrt(Math.random());
        put(t.x + Math.cos(a) * d, t.z + Math.sin(a) * d, 0, i * (zs.stagger ?? 0.25));
      }
    } else if (at === 'allies') {
      (list.length ? list : [tg]).forEach((t, i) => put(t.x, t.z, 0, i * (zs.stagger ?? 0.1)));
    } else if (at === 'behind') {
      const dx = tg.x - e.x, dz = tg.z - e.z, d = Math.hypot(dx, dz) || 1;
      const cx = tg.x + (dx / d) * 2.4, cz = tg.z + (dz / d) * 2.4;
      e.blinkTo = { x: cx, z: cz };
      put(cx, cz, Math.atan2(-dx, -dz) + (zs.turn ?? 0), 0);
    } else if (at === 'player' || at === 'target') put(tg.x, tg.z, e.yaw + (zs.turn ?? 0), 0);
    else put(e.x, e.z, e.yaw + (zs.turn ?? 0), 0);
  }

  /** Besondere Boss-Fähigkeit beim Ausholen: Deckung und Konterhaltung beginnen sofort, Verstärkung und Sprung folgen beim Hieb */
  private mechTelegraph(e: Enemy, mech: BossMech) {
    const at = new Vector3(e.x, this.ground(e.x, e.z), e.z);
    switch (mech.kind) {
      case 'guard':
        e.guardT = mech.dur; e.guardArc = mech.arc;
        this.fx.sigil(at, 4.2, '#9FD8FF', 1.4);
        this.overlay.number(e.head, 'Deckung – von der Seite!', 'info');
        break;
      case 'counter':
        e.counterT = mech.dur; e.counterDmg = mech.dmg; e.counterRadius = mech.radius;
        this.fx.sigil(at, 3.6, '#FFD27A', 1.2);
        break;
      case 'signal':
        this.flare(at, mech.color);
        break;
      case 'summon':
        this.fx.sigil(at, 6, '#FFD27A', 1.8);
        break;
      case 'blink':
        e.blinkTo = null;
        this.fx.sigil(at, 3.4, '#8A4AFF', 1.0);
        break;
      default: break;
    }
  }

  /** Leuchtspur gen Himmel (Artillerie-Signal) */
  private flare(at: Vector3, color: string) {
    for (let i = 0; i < 7; i++) this.fx.puffColor(new Vector3(at.x, at.y + 2 + i * 2.2, at.z), color);
    this.fx.shockwave(at, 3.2, color);
  }

  /** Besondere Boss-Fähigkeit beim Hieb */
  private mechStrike(e: Enemy, mech: BossMech) {
    const here = new Vector3(e.x, this.ground(e.x, e.z), e.z);
    switch (mech.kind) {
      case 'summon':
        this.fx.shockwave(here, 7, '#FFD27A');
        this.hooks.shake(0.5);
        this.onSummon?.(e, mech);
        break;
      case 'blink': {
        const to = e.blinkTo;
        if (!to) break;
        this.fx.shockwave(here, 4.5, '#8A4AFF');
        const c = this.constrain(to.x, to.z, e.radius, e);
        e.x = c.x; e.z = c.z; e.y = this.ground(c.x, c.z);
        const tg = this.targetSpot(e);
        if (tg) e.yaw = Math.atan2(tg.x - e.x, tg.z - e.z);
        e.char.place(e.x, e.y, e.z, e.yaw);
        e.blinkTo = null;
        this.fx.shockwave(new Vector3(e.x, e.y, e.z), 5.5, '#8A4AFF');
        this.hooks.shake(0.35);
        break;
      }
      case 'lunge': {
        // Weg ≈ Anfangstempo / 3,9 (der Schwung klingt mit 0,02^s ab)
        const v = mech.dist * 3.9;
        e.vx += Math.sin(e.yaw) * v; e.vz += Math.cos(e.yaw) * v;
        this.fx.shockwave(here, 3, '#FFE7B0');
        break;
      }
      default: break;
    }
  }

  /** Gegenschlag der Konterhaltung: kurze Warnfläche am Angreifer, die fast sofort einschlägt */
  private riposte(e: Enemy) {
    const r = e.riposteReq;
    if (!r) return;
    e.riposteReq = null;
    const spec: ZoneSpec = { shape: 'circle', size: r.r };
    this.zones.spawn(e, spec, r.x, r.z, this.ground(r.x, r.z), 0, 0.28, e.strength * r.dmg * 1.3, 10, e.atkSeq, { sticky: true, solo: true });
    this.overlay.number(e.head.setY(e.y + 3.2 * e.def.scale), 'Konter!', 'crit');
    this.fx.shockwave(new Vector3(e.x, e.y, e.z), 3, '#FFD27A');
  }

  enemyStrike(e: Enemy, atk: EnemyAttack) {
    // Hieb des Gegners ist dort zu hören, wo er steht
    if (!atk.projectile) audio.play('swing', 0.75, { x: e.x, y: e.y + 1.2, z: e.z });
    if (atk.mech) this.mechStrike(e, atk.mech);
    if (atk.aoe || atk.zones || atk.mech?.kind === 'summon') return; // Schaden kommt über den Warnkreis bzw. die Warnfläche
    if (atk.projectile) {
      const p = this.playerPos;
      const from = new Vector3(e.x + Math.sin(e.yaw) * 0.8, e.y + 1.3, e.z + Math.cos(e.yaw) * 0.8);
      const dir = p ? new Vector3(p.x - from.x, p.y + 1 - from.y, p.z - from.z).normalize() : new Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw));
      this.spawnProjectile(from, dir.multiplyScalar(atk.projectile.speed), atk.projectile.radius, e.strength * atk.dmg, atk.knock, 'enemy', e, false, atk.projectile.color, 0);
      this.fx.hit(from, 'punch', atk.projectile.color);
      return;
    }
    const tg = this.targets.get(e)?.t;
    // Hiebvolumen (OBB) vor dem Gegner; getroffen wird, was eine Trefferzone hineinragen lässt
    attackVolume(VOL, e.x, e.y, e.z, e.yaw, atk.range * e.def.scale + 0.25, atk.arc + 0.25, e.def.scale);
    if (tg) {
      if (!tg.alive) return;
      const ax = tg.x - e.x, az = tg.z - e.z, ad = Math.hypot(ax, az);
      if (!HB_TARGET.fromUpright(tg.x, tg.y, tg.z, Math.atan2(-ax, -az), 1).overlap(VOL)) return;
      tg.receive(e.strength * atk.dmg, ax / (ad || 1), az / (ad || 1));
      this.fx.hit(new Vector3(tg.x, tg.y + 1.1, tg.z), atk.fx === 'heavy' ? 'heavy' : 'slash', '#FF8A6A');
      return;
    }
    const pl = this.player;
    if (!pl || !pl.active) return;
    const dx = pl.x - e.x, dz = pl.z - e.z;
    const d = Math.hypot(dx, dz);
    if (!HB_TARGET.fromUpright(pl.x, pl.y, pl.z, pl.yaw, 1).overlap(VOL)) return;
    this.hitPlayer(e.strength * atk.dmg, dx / (d || 1), dz / (d || 1), atk.knock, e, atk.fx === 'heavy', atk.fx === 'magic');
  }

  /** Ein Verband der Verteidiger trifft die Spielfigur (Hieb oder Salve) */
  strikePlayer(dmg: number, dirX: number, dirZ: number, heavy: boolean) { this.hitPlayer(dmg, dirX, dirZ, heavy ? 8 : 4, null, heavy); }

  private hitPlayer(dmg: number, dirX: number, dirZ: number, knock: number, from: Enemy | null, heavy: boolean, elemental = false) {
    const pl = this.player;
    if (!pl || !pl.active) return;
    if (from && from.level < this.mods.playerLevel) dmg *= 1 - this.mods.fearWeak;
    const res = pl.receiveHit(dmg, dirX, dirZ, knock, from, elemental);
    const pos = new Vector3(pl.x, pl.y + 1.2, pl.z);
    if (res === 'parried') {
      from?.parried(this);
      if (from && this.mods.frostParry) from.stun(2.5, true);
      this.overlay.number(pos.clone().setY(pos.y + 0.6), 'Parade!', 'info');
      this.fx.hit(pos.clone().addScaledVector(new Vector3(-dirX, 0, -dirZ), 0.6), 'heavy', '#FFFFFF', true);
      this.overlay.impactFrame();
      this.overlay.speedlines(0.8);
      this.hooks.hitstop(0.35, 0.15);
      this.hooks.shake(0.4);
      this.hooks.focus?.(0.75);
    } else if (res === 'blocked') {
      this.fx.hit(pos.clone().addScaledVector(new Vector3(-dirX, 0, -dirZ), 0.5), 'punch', '#9FD8FF');
      this.overlay.number(pos, 'Geblockt', 'info');
      this.hooks.shake(0.15);
    } else if (res === 'hit') {
      this.overlay.number(pos, dmg, 'hurt');
      this.overlay.hurt();
      this.fx.hit(pos, heavy ? 'heavy' : 'slash', '#FF6A4A');
      // Kamera wird vom Treffer weggestoßen (gleiche Richtung wie der Spieler)
      this.hooks.impact(dirX, dirZ, heavy ? 1.3 : 0.8);
      this.hooks.shake(heavy ? 0.6 : 0.3);
      this.hooks.hitstop(heavy ? 0.1 : 0.05);
    } else {
      this.overlay.number(pos, 'Ausgewichen', 'info');
    }
  }

  // ---------- Spieler greift an ----------

  /** Neuer Schlag: eigene Trefferliste, damit jeder Gegner nur einmal getroffen wird */
  beginSwing(id: number) { const pl = this.player; audio.play('swing', 1, pl ? { x: pl.x, y: pl.y + 1.2, z: pl.z } : undefined); this.swings.set(id, new Set()); if (this.swings.size > 8) this.swings.delete(this.swings.keys().next().value!); }

  /**
   * Während des Trefferfensters jeden Logikschritt aufrufen.
   * Mit Figur: Sweep entlang der Klinge (bzw. Unterarm/Unterschenkel beim Faustkampf). Die Klinge wird zwischen
   * letztem und aktuellem Schritt in Teilschritten abgetastet; jede Lage ist eine Strecke vom Griff bis zur Spitze,
   * verlängert um die Schwertwind-Reichweite des Angriffs. Getroffen wird die erste Zone (Kopf, Rumpf, Beine),
   * die die Strecke schneidet. Rundum-Wellen und Faji-Stöße ohne Klinge nutzen ein Angriffsvolumen (OBB).
   */
  swing(id: number, def: AttackDef, x: number, y: number, z: number, yaw: number, mult: number, color: string, ch?: Character, early = false): number {
    const done = this.swings.get(id) ?? new Set<object>();
    this.swings.set(id, done);
    let hits = 0;
    const segs = ch ? weaponSegments(ch) : [];
    const volume = !ch || !segs.length || def.fx === 'magic' || (def.arc > 6 && def.fx === 'heavy');
    let n = 0;
    if (!volume) {
      PL_FRAME.set(ch!.holder, x, y, z, yaw);
      for (const s of segs) {
        if (n + 2 > MAX_SEGS) break;
        const a = PL_FRAME.apply(s.a, SEG_A);
        const b = PL_FRAME.apply(s.b, SEG_B);
        const len = SEG_D.subVectors(b, a).length() || 1;
        // 1. die Klinge selbst (bei Gliedmaßen etwas über die Hand bzw. den Fuß hinaus)
        this.sweepCur[n * 2].copy(a);
        this.sweepCur[n * 2 + 1].copy(a).addScaledVector(SEG_D, (len + s.ext) / len);
        this.sweepR[n] = s.r;
        n++;
        // 2. Schwertwind: von der Spitze waagrecht nach außen bis zur Reichweite des Angriffs, auf Körperhöhe
        const tip = this.sweepCur[n * 2 - 1];
        let rx = tip.x - x, rz = tip.z - z;
        let rl = Math.hypot(rx, rz);
        if (rl < 0.15) { rx = SEG_D.x; rz = SEG_D.z; rl = Math.hypot(rx, rz) || 1; }
        // (immer vorhanden, damit die Zahl der Strecken von Schritt zu Schritt gleich bleibt)
        // Fäuste und Füße: nur ausgestreckt (Schlag, Tritt) reicht der Wind weiter – ein Standbein trifft nicht
        const limbK = s.ext > 0 ? clamp01((rl - 0.4) / 0.3) : 1;
        const reach = Math.max(0.05, (def.range - rl) * limbK);
        const wy = Math.min(y + 1.75, Math.max(y + 0.45, tip.y));
        this.sweepCur[n * 2].copy(tip);
        this.sweepCur[n * 2 + 1].set(tip.x + (rx / rl) * reach, wy, tip.z + (rz / rl) * reach);
        this.sweepR[n] = s.r * 1.6;
        n++;
      }
      if (this.sweepId !== id || this.sweepN !== n) {
        for (let i = 0; i < n * 2; i++) this.sweepPrev[i].copy(this.sweepCur[i]);
        this.sweepId = id; this.sweepN = n;
      }
    } else {
      // Volumen-Angriffe treffen nur im eigentlichen Trefferfenster
      if (early) return 0;
      attackVolume(VOL, x, y, z, yaw, def.range, def.arc);
    }
    const test = (obj: Enemy | Dummy, tx: number, tz: number, r: number) => {
      if (done.has(obj)) return;
      const dx = tx - x, dz = tz - z;
      const d = Math.hypot(dx, dz);
      if (d > def.range + r + 1.2) return;
      // grobe Richtung: nur im Schlagbogen (die Verlängerung soll beim Ausholen nicht nach hinten treffen)
      const ang = Math.abs(((Math.atan2(dx, dz) - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (ang > def.arc / 2 + 0.6 && d > r + 1) return;
      const h = obj instanceof Dummy ? obj.hurt : this.hurtOf(obj);
      let zone: Zone | null = null;
      if (volume) { zone = h.overlap(VOL); if (zone) HIT_P.copy(zone === 'kopf' ? h.head.c : zone === 'beine' ? h.legs.c : h.torso.c); }
      else {
        for (let k = 0; k < n && !zone; k++) {
          const pa = this.sweepPrev[k * 2], pb = this.sweepPrev[k * 2 + 1], ca = this.sweepCur[k * 2], cb = this.sweepCur[k * 2 + 1];
          const steps = Math.min(8, Math.max(1, Math.ceil(pb.distanceTo(cb) / 0.2)));
          for (let st = steps; st >= 0 && !zone; st--) {
            const t = st / steps;
            SEG_A.lerpVectors(pa, ca, t);
            SEG_B.lerpVectors(pb, cb, t);
            const res = h.sweep(SEG_A, SEG_B, this.sweepR[k], HIT_P);
            if (res) zone = res.zone;
          }
        }
      }
      if (!zone) return;
      done.add(obj);
      this.applyHit(obj, def, dx / (d || 1), dz / (d || 1), mult * ZONE_MULT[zone], color, zone, HIT_P);
      hits++;
    };
    for (const e of this.enemies) if (e.alive) test(e, e.x, e.z, e.radius);
    for (const dm of this.dummies) test(dm, dm.x, dm.z, dm.radius);
    // Verbände der Verteidiger: jeder Schwung trifft jeden Verband in Reichweite einmal (er trifft viele Köpfe)
    if (this.mass.length && !early) {
      for (const q of this.mass) {
        if (!q.alive || done.has(q)) continue;
        const dx = q.x - x, dz = q.z - z, d = Math.hypot(dx, dz), fr = q.sepRadius() * 0.7;
        if (d > def.range + fr + 0.8) continue;
        const ang = Math.abs(((Math.atan2(dx, dz) - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (ang > def.arc / 2 + 0.7 && d > fr + 1.2) continue;
        done.add(q);
        this.massHit(q, def, dx / (d || 1), dz / (d || 1), mult, color);
        hits++;
      }
    }
    for (let i = 0; i < n * 2; i++) this.sweepPrev[i].copy(this.sweepCur[i]);
    return hits;
  }

  /** Hieb des Spielers gegen einen Verband: Schaden mit Schwung-Bonus, Funken, Zahl und Treffer-Rückmeldung */
  private massHit(q: TroopSquad, def: AttackDef, dirX: number, dirZ: number, mult: number, color: string) {
    const crit = Math.random() < this.critChance;
    const dmg = Math.round(this.atk * def.dmg * mult * MASS_CLEAVE * (crit ? this.mods.critMult : 1) * (0.92 + Math.random() * 0.16));
    if (this.mods.lifesteal > 0) this.hooks.heal(dmg * this.mods.lifesteal * 0.2);
    const before = q.heads;
    q.receive(dmg, dirX, dirZ);
    const pos = new Vector3(q.x - dirX * 0.8, q.y + 1.2, q.z - dirZ * 0.8);
    this.fx.hit(pos, def.fx, color, crit || def.fx === 'heavy');
    this.overlay.number(pos.clone().setY(pos.y + 0.5), q.heads < before ? `${dmg} (−${before - q.heads})` : dmg, crit ? 'crit' : 'hit');
    this.overlay.addCombo();
    this.hooks.impact(dirX, dirZ, 0.7);
    this.hooks.hitstop(def.hitstop * 0.5);
    this.hooks.shake(def.shake * 0.8);
    if (q.heads <= 0) this.onSquadDown(q);
  }

  private onSquadDown(q: TroopSquad) {
    this.hooks.gold(Math.round(q.maxHeads * (3 + this.mods.playerLevel * 0.4)));
    this.fx.shockwave(new Vector3(q.x, q.y, q.z), 4, '#FFD27A');
  }

  /** Treffer auf ein Ziel der eigenen Trupps: Einzelgegner (mit Rückmeldung) oder ein Verband der Verteidiger */
  foeHit(e: Enemy | TroopSquad, dmg: number, dirX: number, dirZ: number, color: string, heavy: boolean, srcId?: EntityId) {
    if ('squadId' in e) {
      if (!e.alive) return;
      e.receive(dmg, dirX, dirZ);
      if (heavy || Math.random() < 0.25) this.fx.hit(new Vector3(e.x, e.y + 1.1, e.z), heavy ? 'heavy' : 'slash', color);
      if (e.heads <= 0) this.onSquadDown(e);
      return;
    }
    this.allyHit(e, dmg, dirX, dirZ, color, heavy, srcId);
  }

  /** Crew-Hieb: Angriffsvolumen vor dem Crewmitglied gegen die Trefferzonen des Gegners */
  allyReach(x: number, y: number, z: number, yaw: number, range: number, e: Enemy) {
    attackVolume(VOL, x, y, z, yaw, range, 2.2);
    return this.hurtOf(e).overlap(VOL) !== null;
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

  private applyHit(obj: object, def: AttackDef, dirX: number, dirZ: number, mult: number, color: string, zone: Zone = 'rumpf', at?: Vector3) {
    const crit = Math.random() < this.critChance;
    const dmg = Math.round(this.atk * def.dmg * mult * (crit ? this.mods.critMult : 1) * (0.92 + Math.random() * 0.16));
    if (this.mods.lifesteal > 0) this.hooks.heal(dmg * this.mods.lifesteal);
    const heavy = def.fx === 'heavy' || def.poise >= 30;
    const head = zone === 'kopf';
    if (obj instanceof Dummy) {
      obj.wobble = Math.min(1.5, obj.wobble + 0.6);
      const pos = at ? at.clone() : new Vector3(obj.x, obj.group.position.y + 1.4, obj.z);
      this.fx.hit(pos, def.fx, color, crit || heavy);
      this.overlay.number(pos.clone().setY(Math.max(pos.y, obj.group.position.y + 1.4)), dmg, crit || head ? 'crit' : 'hit');
      this.overlay.addCombo();
      this.hooks.impact(dirX, dirZ, crit || heavy ? 1 : 0.6);
      this.hooks.hitstop(def.hitstop);
      this.hooks.shake(def.shake);
      return;
    }
    const e = obj as Enemy;
    const res = e.takeHit({ dmg, poise: def.poise, knock: def.knock, launch: def.launch, dirX, dirZ, heavy, src: this.player?.entityId, ranged: def.fx === 'magic' } as HitInfo, this.now, this);
    const pos = e.head.setY(e.y + 1.3 * e.def.scale);
    // Funken genau dort, wo die Klinge die Trefferzone schneidet
    const contact = at ? at.clone() : pos;
    if (res === 'blocked') {
      this.fx.hit(contact, 'punch', '#9FD8FF');
      this.overlay.number(pos, 'Abgewehrt', 'info');
      this.hooks.shake(0.1);
      return;
    }
    this.fx.hit(contact, def.fx, color, crit || heavy || res === 'kill');
    this.overlay.number(pos, dmg, crit || head ? 'crit' : 'hit');
    // Wucht je Stil: Faustschläge drücken eine kleine Welle über den Boden, schwere Hiebe schlagen Funken
    if (def.fx === 'punch') {
      const gy = this.ground(e.x, e.z);
      this.fx.shockwave(new Vector3(e.x, gy, e.z), crit ? 2.6 : 1.6, crit ? '#FFD08A' : '#FFFFFF');
      this.smoke?.puff(e.x - dirX * 0.4, gy + 0.3, e.z - dirZ * 0.4, { n: 2, size: 0.4, grow: 1.8, life: 0.8, tone: 0.85, vx: dirX * 2, vz: dirZ * 2, spread: 0.6, rise: 0.2, alpha: 0.45, wind: 0.2 });
    } else if (heavy && def.fx !== 'magic') {
      this.sparksBurst(pos, '#FFD08A', 16, dirX, dirZ);
      if ((def.clip ?? '').includes('Unarmed') || (def.clip ?? '').includes('Kick')) this.overlay.speedlines(0.5);
    }
    if (this.mods.burnOnHit && def.fx !== 'magic' && def.fx !== 'punch' && res !== 'kill') this.applyStatus(e, 'burn', 3, dmg * 0.6);
    this.overlay.addCombo();
    if (res === 'stagger') { this.overlay.number(pos.clone().setY(pos.y + 0.7), 'Haltung gebrochen!', 'info'); this.overlay.speedlines(0.6); }
    // Spuren am Boden: Brandfleck bei Treffern mit Wucht, kleiner Riss bei Kritischen und Kills
    if (crit || res === 'kill' || heavy) {
      const gd = new Vector3(e.x + dirX * 0.6, this.ground(e.x, e.z), e.z + dirZ * 0.6);
      if (def.fx === 'magic' || def.fx === 'slash') this.fx.burn(gd, heavy ? 2 : 1.3, '#5a4a40');
      else if (def.fx !== 'heavy') this.fx.crack(gd, 1.8);
    }
    if (heavy) {
      const g = new Vector3(e.x, this.ground(e.x, e.z), e.z);
      this.fx.shockwave(g, 4);
      if (def.fx === 'heavy') this.fx.crack(g, 3.5);
    }
    if ((crit && heavy) || res === 'kill' && e.def.elite) this.overlay.impactFrame();
    this.hooks.impact(dirX, dirZ, res === 'kill' || crit || heavy ? 1.2 : 0.7);
    this.hooks.hitstop(res === 'kill' ? def.hitstop * 1.8 : def.hitstop);
    this.hooks.shake(def.shake + (res === 'kill' ? 0.2 : 0));
    if (res === 'kill') this.onKill(e);
  }

  /** Funkenregen in eine Richtung (oder rundum) */
  private sparksBurst(pos: Vector3, color: string, n: number, dx = 0, dz = 0) {
    const k = Math.max(1, Math.round(n / 14));
    for (let i = 0; i < k; i++) this.fx.hit(pos.clone().add(new Vector3(dx * (0.3 + i * 0.35), 0.1 * i, dz * (0.3 + i * 0.35))), 'punch', color, i === 0 && n > 30);
  }

  private onKill(e: Enemy) {
    this.overlay.number(e.head, 'K.O.!', 'info');
    if (this.lock === e) this.lock = null;
    this.tokens.delete(e);
    const n = 3 + Math.floor(Math.random() * 3);
    const [g0, g1] = e.def.gold;
    const total = Math.round((g0 + Math.random() * (g1 - g0)) * (1 + 0.2 * (e.level - 1)));
    for (let i = 0; i < n; i++) this.spawnCoin(e.x, e.y + 1, e.z, Math.max(1, Math.round(total / n)));
    // Beute-Säulen: Seltenheit nach Gegnerart (Elite besser, Bosse vier Stück, mindestens eine epische)
    if (e.def.raid !== 'boss') for (const d of rollLoot({ boss: e.def.boss, elite: e.def.elite, level: e.level, gold: e.def.gold })) this.loot.drop(e.x, e.y + 1, e.z, d, e.def.boss ? 4 : 2.2);
    this.hooks.kill(e);
    if (e.def.boss) {
      // Todesstoß: eine halbe Sekunde Zeitlupe mit Schockring, dann Siegesbild und Fanfare
      const name = e.name ?? e.def.label;
      this.hooks.hitstop(0.5, 0.15);
      this.hooks.shake(1.1);
      this.fx.shockwave(new Vector3(e.x, e.y + 0.2, e.z), 7, '#FFD27A');
      this.overlay.impactFrame();
      this.overlay.setBoss(null);
      setTimeout(() => this.overlay.victory(e.def.raid === 'boss' ? 'Endboss besiegt!' : 'Legende besiegt!', name, [`${total} Gold`, 'Beute fällt als Lichtsäulen']), 520);
    }
  }

  /** Einschlag einer Warnfläche: Druckwelle, Risse, Schaden für alle darin (Spielfigur, Offiziere, Trupps) – je Angriff höchstens einmal, Streuflächen einzeln */
  private detonate(z: WarnZone) {
    const s = z.spec;
    const at = new Vector3(z.x, z.y, z.z);
    const fx = this.fx;
    if (s.shape === 'line') {
      const n = Math.max(2, Math.round(s.size / 3.5));
      for (let i = 1; i <= n; i++) {
        const k = (i / n) * s.size;
        const p = new Vector3(z.x + Math.sin(z.yaw) * k, z.y, z.z + Math.cos(z.yaw) * k);
        p.y = this.ground(p.x, p.z);
        fx.shockwave(p, (s.width ?? 2) * 0.9, '#FF9A6A');
        if (i % 2) fx.crack(p, 3);
      }
    } else if (s.shape === 'cone') {
      const p = new Vector3(z.x + Math.sin(z.yaw) * s.size * 0.5, z.y, z.z + Math.cos(z.yaw) * s.size * 0.5);
      fx.shockwave(p, s.size * 0.6, '#FF9A6A');
      fx.crack(p, s.size * 0.5);
    } else {
      fx.shockwave(at, s.size * 1.1, z.propKind === 'rune' ? '#B06AFF' : z.propKind === 'kette' ? '#7FA8D8' : '#FF9A6A');
      fx.crack(at, s.size * 0.9);
      if (z.propKind === 'fass' || z.propKind === 'granate') this.smoke?.puff(z.x, z.y + 0.6, z.z, { n: 4, size: 1.2, grow: 4, life: 1.6, tone: 0.3, spread: 1.6, rise: 1.2, alpha: 0.6, wind: 0.3 });
    }
    this.hooks.shake(0.5);
    if (!z.from.alive) return;
    // Crew und Trupps in der Fläche leiden mit (Trupps stärker: die Fläche trifft viele Köpfe auf einmal)
    for (const a of this.allies) {
      if (!a.alive || !zoneContains(z, a.x, a.z, a.radius)) continue;
      const dx = a.x - z.x, dz = a.z - z.z, d = Math.hypot(dx, dz) || 1;
      a.receive(z.dmg * ('squadId' in a ? 2.2 : 0.55), dx / d, dz / d);
    }
    const pl = this.player;
    if (!pl?.active || (!z.solo && this.zoneHit.get(z.from) === z.seq)) return;
    if (!zoneContains(z, pl.x, pl.z, 0.3)) return;
    if (!z.solo) this.zoneHit.set(z.from, z.seq);
    const dx = pl.x - z.x, dz = pl.z - z.z;
    const d = Math.hypot(dx, dz) || 1;
    this.hitPlayer(z.dmg, dx / d, dz / d, z.knock, z.from, true);
    if (s.bind) { pl.bind?.(s.bind.dur, s.bind.slow); this.overlay.number(new Vector3(pl.x, pl.y + 2.2, pl.z), 'Gefesselt!', 'info'); }
  }

  private spawnProjectile(from: Vector3, vel: Vector3, radius: number, dmg: number, knock: number, team: 'player' | 'enemy', src: Enemy | null, pierce: boolean, color: string, poise: number) {
    const m = new Mesh(new SphereGeometry(radius * 0.5, 12, 8), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(3), transparent: true, blending: AdditiveBlending, depthWrite: false }));
    const halo = new Mesh(new SphereGeometry(radius, 12, 8), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(1.4), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }));
    m.add(halo);
    m.position.copy(from);
    this.scene.add(m);
    this.projectiles.push({ mesh: m, vel, life: 2.2, radius, dmg, knock, team, from: src, pierce, hit: new Set(), color, poise, trail: 0 });
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
    for (const q of this.mass) {
      if (!q.alive) continue;
      list.push({
        x: q.x, y: q.y, z: q.z, radius: q.sepRadius() * 0.7, alive: true,
        hit: (dmg, _status, _dur, dx, dz) => this.massAbility(q, dmg * this.mods.skillMult, dx, dz),
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

  private massAbility(q: TroopSquad, dmg: number, dx: number, dz: number) {
    const amount = Math.round(dmg * MASS_CLEAVE * 0.8);
    q.receive(amount, dx, dz);
    const pos = new Vector3(q.x, q.y + 1.6, q.z);
    this.overlay.number(pos, amount, 'hit');
    this.overlay.addCombo();
    if (q.heads <= 0) this.onSquadDown(q);
  }

  private abilityHit(e: Enemy, dmg: number, status: Status | undefined, dur: number, dx: number, dz: number, el: Element) {
    const crit = Math.random() < this.critChance;
    const amount = Math.round(dmg * (crit ? this.mods.critMult : 1));
    const res = e.takeHit({ dmg: amount, poise: 25, knock: status === 'launch' ? 2 : 4, dirX: dx, dirZ: dz, heavy: true, src: this.player?.entityId, ranged: true } as HitInfo, this.now, this);
    const pos = e.head.setY(e.y + 1.4 * e.def.scale);
    this.overlay.number(pos, amount, crit ? 'crit' : 'hit');
    this.overlay.addCombo();
    if (res !== 'blocked') this.hooks.impact(dx, dz, res === 'kill' ? 1 : 0.6);
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

  /** Auswahlwert eines Gegners für die Erfassung: nah und in Blickrichtung der Kamera ist besser */
  private lockScore(e: Enemy, x: number, z: number, camYaw: number) {
    const dx = e.x - x, dz = e.z - z;
    const ang = Math.abs(((Math.atan2(dx, dz) - camYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return Math.hypot(dx, dz) + ang * 6;
  }

  /** Das Ziel ist gefallen: den nächsten Gegner in Reichweite erfassen (oder die Erfassung beenden) */
  retarget(x: number, z: number, camYaw: number) {
    let best: Enemy | null = null, bs = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || Math.hypot(e.x - x, e.z - z) > 14) continue;
      const s = this.lockScore(e, x, z, camYaw);
      if (s < bs) { bs = s; best = e; }
    }
    this.lock = best;
  }

  /** Ziel erfassen oder zum nächsten wechseln (der Reihe nach, wer der Kamerarichtung am nächsten liegt) */
  toggleLock(x: number, z: number, camYaw: number) {
    if (this.lock) {
      let best: Enemy | null = null, bs = Infinity;
      for (const e of this.enemies) {
        if (!e.alive || e === this.lock || Math.hypot(e.x - x, e.z - z) >= 22) continue;
        const s = this.lockScore(e, x, z, camYaw);
        if (s < bs) { bs = s; best = e; }
      }
      this.lock = best;
      return;
    }
    this.lock = this.nearestInCone(x, z, camYaw, 22, Math.PI * 0.6) ?? this.nearestInCone(x, z, camYaw, 22, Math.PI);
  }

  // ---------- Inseln ----------

  /** Gegnerlager einer Insel aufbauen */
  enterIsland(isl: WalkIsland, kinds: EnemyKind[], level: number, faction: Faction, bossName?: string, opts: { power?: FactionId; spread?: number } = {}) {
    this.leaveIsland();
    this.island = isl;
    this.nav = navForIsland(isl);
    const spot = { x: 0, z: 0 };
    kinds.forEach((k, i) => {
      const a = (i / kinds.length) * Math.PI * 2 + Math.random() * 0.4;
      // `spread`: große Festungsinseln halten die Garnison im Hof statt über die ganze Insel verstreut
      const r = isl.r * (k === 'legende' ? 0.15 * (opts.spread ?? 1) : (0.35 + Math.random() * 0.3) * (opts.spread ?? 1));
      // nicht in einem Haus oder Felsen erscheinen
      this.nav!.snap(isl.x + Math.cos(a) * r, isl.z + Math.sin(a) * r, ENEMIES[k].radius * ENEMIES[k].scale, spot);
      const e = new Enemy(this.assets, k, level, faction, spot.x, spot.z, this.outline, k === 'legende' ? bossName : undefined, opts.power);
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
  enterDeck(deck: DeckGround, kinds: EnemyKind[], level: number, faction: Faction, bossName?: string, power?: FactionId) {
    this.leaveIsland();
    this.nav = null;
    kinds.forEach((k, i) => {
      const p = deck.spot((Math.random() - 0.5) * 1.6, 0.2 + (i / Math.max(1, kinds.length - 1)) * 0.7 - 0.1);
      const e = new Enemy(this.assets, k, level, faction, p.x, p.z, this.outline, k === 'legende' ? bossName : undefined, power);
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
    // Verweise auf entfernte Gegner lösen: sonst bleiben sie im Speicher, und Brand/Gift schadet unsichtbar weiter
    this.targets.clear();
    this.dots.clear();
    this.swings.clear();
    for (const p of this.projectiles) { p.mesh.removeFromParent(); p.mesh.geometry.dispose(); (p.mesh.material as MeshBasicMaterial).dispose(); }
    this.projectiles = [];
    // liegengebliebene Münzen sammelt die Crew beim Ablegen ein (nichts geht verloren)
    let left = 0;
    for (const c of this.coins) { c.mesh.removeFromParent(); if (c.t >= 0) left += c.value; }
    if (left > 0) this.hooks.gold(left);
    this.coins = [];
    // Beute-Säulen, die noch liegen, nimmt die Crew mit (nichts geht verloren); Warnflächen verschwinden
    this.loot.collectAll();
    this.zones.clear();
    for (const m of this.auraFx.values()) m.removeFromParent();
    this.auraFx.clear();
    this.tauntAt.clear();
    this.lock = null;
    this.island = null;
    this.nav = null;
    this.sweepId = -1;
    this.aoes = [];
    this.overlay.clearBars();
    this.overlay.setBoss(null);
  }

  /**
   * Hauptmänner und Endbosse wählen ihr Ziel über die Bedrohungstabelle: Schaden und Nähe erzeugen Bedrohung, Spott (Tank-Offiziere) zieht
   * das Ziel für kurze Zeit, ein Wechsel braucht 110 % (Nahkampf) bzw. 130 % (Fernkampf) der Bedrohung des bisherigen Ziels.
   * Liefert die Crew-Figur oder null (= die Spielfigur); `e.targetEntityId` nennt in beiden Fällen die Kennung.
   */
  private pickByThreat(e: Enemy): AllyTarget | null {
    const th = e.threat!;
    const pl = this.player, dt = this.dtLast;
    if (pl?.active) th.touch(pl.entityId, Math.hypot(pl.x - e.x, pl.z - e.z), dt);
    for (const a of this.allies) {
      if (!a.alive || !a.entityId) continue;
      const d = Math.hypot(a.x - e.x, a.z - e.z);
      th.touch(a.entityId, d, dt);
      // Tank-Offizier: spottet alle 6 s, wenn er nah am Gegner steht
      if (a.taunt && d < 10 && (this.tauntAt.get(a.entityId) ?? 0) <= this.now) { this.tauntAt.set(a.entityId, this.now + 6); th.taunt(a.entityId, 2.6); }
    }
    // gültig ist, wer noch im Kampf steht und nicht weiter als 70 m entfernt ist (Gefallene und Abgereiste zählen nicht mehr)
    this.threatFor = e;
    let id = th.pick(this.threatOk);
    if (!id && pl?.active) { id = pl.entityId; th.add(id, 1); th.pick(this.threatOk); }
    e.targetEntityId = id;
    if (!id || (pl && id === pl.entityId)) return null;
    const ally = this.allies.find((a) => a.entityId === id) ?? null;
    if (ally) this.targets.set(e, { t: ally, until: this.now + 0.4 });
    return ally;
  }

  /** Boss-Leiste: Name, Titel, Leben, Phasenmarken, Haltebalken und wer gerade das Ziel des Bosses ist (Bedrohungstabelle) */
  private bossView(b: Enemy): BossView {
    let aggro: BossView['aggro'] = null;
    const pl = this.player;
    if (b.threat) {
      const ranked = b.threat.ranked();
      const top = ranked[0]?.value ?? 0;
      const mine = pl ? ranked.find((r) => r.id === pl.entityId)?.value ?? 0 : 0;
      const id = b.targetEntityId;
      const target = id && pl && id === pl.entityId ? 'Du' : this.allies.find((a) => a.entityId === id)?.label ?? 'Verbündeter';
      if (target) aggro = { target, mine: target === 'Du', share: top > 0 ? Math.min(1.5, mine / top) : 0 };
    }
    return { name: b.name ?? b.def.label, title: b.def.title, frac: b.hp / b.maxHp, brk: b.breakFrac, broken: b.brokenT > 0, phase: b.phase, marks: b.phaseMarks, aggro };
  }

  private pickTarget(e: Enemy): AllyTarget | null {
    if (!e.alive) return null;
    if (e.threat) {
      const t = this.pickByThreat(e);
      if (!t) this.targets.delete(e);
      return t;
    }
    const cur = this.targets.get(e);
    if (cur && cur.until > this.now && (!cur.t || cur.t.alive)) return cur.t;
    let t: AllyTarget | null = null;
    const alive = this.allies.filter((a) => a.alive);
    if (alive.length) {
      const tank = alive.find((a) => a.taunt && Math.hypot(a.x - e.x, a.z - e.z) < 7);
      const idx = this.enemies.indexOf(e);
      if (tank && Math.random() < 0.7) t = tank;
      else if (idx % 3 === 1 || !this.playerActive) {
        let bd = 14;
        for (const a of alive) { const d = Math.hypot(a.x - e.x, a.z - e.z); if (d < bd) { bd = d; t = a; } }
      }
    }
    this.targets.set(e, { t, until: this.now + 2 + Math.random() * 2 });
    return t;
  }

  /** Treffer durch die Crew */
  allyHit(e: Enemy, dmg: number, dirX: number, dirZ: number, color: string, heavy: boolean, srcId?: EntityId) {
    if (!e.alive) return;
    const res = e.takeHit({ dmg: Math.round(dmg), poise: heavy ? 22 : 10, knock: heavy ? 3 : 1.5, dirX, dirZ, heavy, src: srcId } as HitInfo, this.now, this);
    const pos = e.head.setY(e.y + 1.4 * e.def.scale);
    this.fx.hit(pos.clone(), heavy ? 'heavy' : 'slash', color);
    if (res === 'blocked') this.overlay.number(pos, 'Abgewehrt', 'info');
    else this.overlay.number(pos, Math.round(dmg), 'hit');
    if (res === 'kill') this.onKill(e);
  }

  get activeIsland() { return this.island; }
  get hostilesLeft() { return this.enemies.filter((e) => e.alive).length + this.mass.filter((q) => q.alive).length; }
  /** Lebende Gegner des Lagers (ohne die eines Weltereignisses): nur sie zählen für „Insel befreit“ */
  get campLeft() { return this.enemies.filter((e) => e.alive && !e.tag).length; }
  tagLeft(tag: string) { return this.enemies.filter((e) => e.alive && e.tag === tag).length; }

  /** Weltereignis auf einer sonst ruhigen Insel: Begehbarkeits-Netz bereitstellen (ohne Gegner) */
  beginEvent(isl: WalkIsland) {
    if (!this.island) { this.island = isl; this.nav = navForIsland(isl); }
  }

  /**
   * Gegner zusätzlich zu den vorhandenen erscheinen lassen (Weltereignisse). at: Mittelpunkt, spread: Streuung in Metern;
   * die Gegner greifen sofort an.
   */
  spawnWave(kinds: EnemyKind[], level: number, faction: Faction, tag: string, at: { x: number; z: number }, spread: number, opts: { power?: FactionId; name?: string; def?: import('../data/combat').EnemyDef; /** patrouillieren statt sofort anzugreifen (Mega-Inseln) */ calm?: boolean } = {}): Enemy[] {
    const nav = this.nav;
    const out: Enemy[] = [];
    const spot = { x: 0, z: 0 };
    kinds.forEach((k, i) => {
      const a = (i / kinds.length) * Math.PI * 2;
      const px = at.x + Math.cos(a) * spread * (0.4 + (i % 2) * 0.5), pz = at.z + Math.sin(a) * spread * (0.4 + (i % 2) * 0.5);
      if (nav) nav.snap(px, pz, ENEMIES[k].radius * ENEMIES[k].scale, spot); else { spot.x = px; spot.z = pz; }
      const e = new Enemy(this.assets, k, level, faction, spot.x, spot.z, this.outline, k === 'legende' || opts.def ? opts.name : undefined, opts.power, { def: opts.def });
      e.tag = tag;
      e.y = this.ground(e.x, e.z);
      if (!opts.calm) e.alert();
      this.scene.add(e.char.holder);
      this.onSpawn?.(e.char.holder);
      this.enemies.push(e);
      out.push(e);
    });
    return out;
  }

  // ---------- Auren der Hauptmänner ----------

  /**
   * Auren: jeder lebende Hauptmann (und Boss mit Aura) stärkt die Gegner und Verbände in seinem Umkreis. Faktoren werden jedes Bild neu
   * gesetzt (Schlachtruf: mehr Schaden, Bollwerk: weniger erlittener Schaden, Eilmarsch: Tempo, Feldscher: Heilung) und mit einem Bodenring gezeigt.
   */
  private applyAuras(dt: number) {
    void dt;
    let any = false;
    for (const e of this.enemies) if (e.def.aura && e.alive) { any = true; break; }
    if (!any && !this.auraFx.size) return;
    for (const e of this.enemies) { e.auraDmg = 1; e.auraTaken = 1; e.auraSpeed = 1; e.auraRegen = 0; }
    for (const q of this.mass) { q.auraDmg = 1; q.auraTaken = 1; q.auraSpeed = 1; }
    for (const c of this.enemies) {
      const A = c.def.aura;
      if (!A || !c.alive) continue;
      const r2 = A.radius * A.radius;
      for (const e of this.enemies) {
        if (!e.alive || e === c) continue;
        const dx = e.x - c.x, dz = e.z - c.z;
        if (dx * dx + dz * dz > r2) continue;
        if (A.dmg) e.auraDmg = Math.max(e.auraDmg, A.dmg);
        if (A.taken) e.auraTaken = Math.min(e.auraTaken, A.taken);
        if (A.speed) e.auraSpeed = Math.max(e.auraSpeed, A.speed);
        if (A.regen) e.auraRegen = Math.max(e.auraRegen, A.regen);
      }
      for (const q of this.mass) {
        if (!q.alive) continue;
        const dx = q.x - c.x, dz = q.z - c.z;
        if (dx * dx + dz * dz > r2) continue;
        if (A.dmg) q.auraDmg = Math.max(q.auraDmg, A.dmg);
        if (A.taken) q.auraTaken = Math.min(q.auraTaken, A.taken);
        if (A.speed) q.auraSpeed = Math.max(q.auraSpeed, A.speed);
      }
    }
    // Ringe: einer je Hauptmann, am Boden; verschwindet mit ihm
    for (const [e, m] of this.auraFx) {
      if (e.alive && this.enemies.includes(e)) continue;
      m.removeFromParent(); this.auraFx.delete(e);
    }
    for (const c of this.enemies) {
      const A = c.def.aura;
      if (!A || !c.alive) continue;
      let m = this.auraFx.get(c);
      if (!m) {
        m = new Mesh(sharedGeo('aura:ring', () => new RingGeometry(0.93, 1, 72).rotateX(-Math.PI / 2)), auraMat(A.id, A.color));
        m.renderOrder = 2; m.frustumCulled = false; m.userData.noOutline = true;
        this.scene.add(m);
        this.auraFx.set(c, m);
      }
      m.position.set(c.x, c.y + 0.12, c.z);
      m.scale.setScalar(A.radius * (0.985 + 0.015 * Math.sin(this.now * 3)));
    }
  }

  // ---------- Schleife ----------

  update(dt: number, camera: Camera) {
    this.now += dt;
    this.dtLast = dt;
    const pl = this.player;
    this.playerActive = !!pl && pl.active;
    this.playerPos = pl ? this.plVec.set(pl.x, pl.y, pl.z) : null;

    // Ein kämpfender Gegner alarmiert das ganze Lager
    const engaged = this.engagedTmp;
    engaged.length = 0;
    for (const e of this.enemies) if (e.engaged) engaged.push(e);
    if (engaged.length) for (const e of this.enemies) if (!e.engaged && engaged.some((o) => Math.hypot(o.x - e.x, o.z - e.z) < 32)) e.alert();
    // Jeder Gegner wählt ein Ziel: Spielfigur oder Crew (Tanks ziehen Gegner an)
    const plPos = this.playerPos, plAct = this.playerActive;
    for (const e of this.enemies) {
      const tg = this.pickTarget(e);
      if (tg) { this.playerPos = this.tgVec.set(tg.x, tg.y, tg.z); this.playerActive = true; this.targetYaw = NaN; }
      else { this.playerPos = plPos; this.playerActive = plAct; this.targetYaw = pl ? pl.yaw : NaN; }
      e.update(dt, this);
    }
    this.playerPos = plPos; this.playerActive = plAct;
    for (const e of this.enemies) if (e.riposteReq) this.riposte(e);
    this.applyAuras(dt);
    this.foes.length = 0;
    for (const e of this.enemies) if (e.alive) this.foes.push(e);
    for (const q of this.mass) if (q.alive) this.foes.push(q);
    for (const d of this.dummies) d.update(dt);
    this.updateDots(dt);

    // Geschosse
    for (const p of this.projectiles) {
      p.life -= dt;
      SEG_A.copy(p.mesh.position);
      p.mesh.position.addScaledVector(p.vel, dt);
      const pos = p.mesh.position;
      // leuchtende Spur: Funken und ein Hauch farbiger Rauch in der Elementfarbe
      p.trail -= dt;
      if (p.trail <= 0) {
        p.trail = p.team === 'player' ? 0.035 : 0.06;
        this.fx.puffColor(pos, p.color);
        if (p.team === 'player') this.smoke?.puff(pos.x, pos.y, pos.z, { size: p.radius * 0.6, grow: p.radius * 2.2, life: 0.7, tone: new Color(p.color).lerp(new Color(1, 1, 1), 0.4), spread: 0.2, rise: 0.3, alpha: 0.35, glow: 0.3, wind: 0.3 });
      }
      if (pos.y < this.ground(pos.x, pos.z) + 0.1 && Number.isFinite(this.groundRef.height(pos.x, pos.z))) p.life = 0;
      if (p.team === 'enemy' && pl?.active) {
        if (Math.hypot(pos.x - pl.x, pos.z - pl.z) < p.radius + 3 && HB_TARGET.fromUpright(pl.x, pl.y, pl.z, pl.yaw, 1).sweep(SEG_A, pos, p.radius * 0.8, HIT_P)) {
          const d = Math.hypot(p.vel.x, p.vel.z) || 1;
          this.hitPlayer(p.dmg, p.vel.x / d, p.vel.z / d, p.knock, p.from, false);
          p.life = 0;
        }
      } else if (p.team === 'player') {
        for (const e of this.enemies) {
          if (!e.alive || p.hit.has(e)) continue;
          if (Math.hypot(pos.x - e.x, pos.z - e.z) > p.radius + e.radius + 3) continue;
          const res = this.hurtOf(e).sweep(SEG_A, pos, p.radius, HIT_P);
          if (res) {
            p.hit.add(e);
            const d = Math.hypot(p.vel.x, p.vel.z) || 1;
            this.applyHit(e, { dmg: p.dmg / this.atk, poise: p.poise, knock: p.knock, fx: 'magic', hitstop: 0.05, shake: 0.15 } as AttackDef, p.vel.x / d, p.vel.z / d, ZONE_MULT[res.zone], p.color, res.zone, HIT_P);
            if (!p.pierce) { p.life = 0; break; }
          }
        }
        for (const q of this.mass) {
          if (!q.alive || p.hit.has(q)) continue;
          const fr = q.sepRadius() * 0.7;
          if (Math.hypot(pos.x - q.x, pos.z - q.z) < p.radius + fr + 0.4) {
            p.hit.add(q);
            const d = Math.hypot(p.vel.x, p.vel.z) || 1;
            const dmg = Math.round(p.dmg * MASS_CLEAVE * 0.7);
            q.receive(dmg, p.vel.x / d, p.vel.z / d);
            this.fx.hit(pos.clone(), 'magic', p.color);
            this.overlay.number(new Vector3(q.x, q.y + 1.6, q.z), dmg, 'hit');
            if (q.heads <= 0) this.onSquadDown(q);
            if (!p.pierce) { p.life = 0; break; }
          }
        }
        for (const d of this.dummies) {
          if (p.hit.has(d)) continue;
          if (Math.hypot(pos.x - d.x, pos.z - d.z) < p.radius + d.radius + 3 && d.hurt.sweep(SEG_A, pos, p.radius, HIT_P)) {
            p.hit.add(d);
            this.applyHit(d, { dmg: p.dmg / this.atk, poise: 0, knock: 0, fx: 'magic', hitstop: 0.04, shake: 0.1 } as AttackDef, 0, 0, 1, p.color);
            if (!p.pierce) { p.life = 0; break; }
          }
        }
      }
      if (p.life <= 0) {
        this.fx.hit(pos.clone(), 'magic', p.color, p.radius > 1);
        if (p.team === 'player') {
          // Einschlag: Druckwelle, farbige Wolke, Funkenregen – größer bei aufgeladenen Geschossen
          const g = this.ground(pos.x, pos.z);
          this.fx.shockwave(new Vector3(pos.x, Number.isFinite(g) ? g : pos.y - 1, pos.z), 1.5 + p.radius * 3, p.color);
          this.smoke?.puff(pos.x, pos.y, pos.z, { n: p.radius > 1 ? 6 : 3, size: p.radius, grow: p.radius * 4.5, life: 1.6, tone: new Color(p.color).lerp(new Color(1, 1, 1), 0.3), spread: 1.4, rise: 0.6, alpha: 0.55, glow: 0.6, wind: 0.4 });
          this.sparksBurst(pos, p.color, p.radius > 1 ? 40 : 18);
          if (p.radius > 1) { this.hooks.shake(0.35); this.overlay.speedlines(0.5); }
        }
        p.mesh.removeFromParent();
        p.mesh.geometry.dispose();
        (p.mesh.material as MeshBasicMaterial).dispose();
      }
    }
    { let n = 0; for (const p of this.projectiles) if (p.life > 0) this.projectiles[n++] = p; this.projectiles.length = n; }

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
    { let n = 0; for (const a of this.aoes) if (a.t > 0) this.aoes[n++] = a; this.aoes.length = n; }

    // Warnflächen der Bosse: verfallen, wenn der Angriff unterbrochen wird (Break, Tod, Phasenwechsel); sonst Einschlag
    // Langlebige Flächen (Streuflächen, Fässer, Ketten, Konter) schlagen auch ein, wenn der Boss schon den nächsten Angriff begonnen hat:
    // sie verfallen nur mit seinem Tod, bei einem Break (Unterbrechung) und beim Phasenwechsel
    this.zones.update(dt, (z) => {
      const e = z.from;
      if (!e.alive) return false;
      if (z.sticky) return e.brokenT <= 0 && e.state !== 'transition';
      return e.atkSeq === z.seq && (e.state === 'windup' || e.state === 'attack' || e.state === 'recover');
    }, (z) => this.detonate(z));
    // Beute-Säulen: fallen, leuchten, werden vom Spieler magnetisch eingesaugt
    this.loot.update(dt, pl && pl.active ? pl : null, (x, z) => this.ground(x, z));

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
    { let n = 0; for (const c of this.coins) if (c.t >= 0) this.coins[n++] = c; this.coins.length = n; }

    // Tote Gegner entfernen
    // Tote Gegner entfernen – samt aller Verweise (Ziele der Crew, Brand/Gift, Angriffsplätze)
    let n = 0;
    for (const e of this.enemies) {
      if (e.removable) {
        e.dispose();
        this.overlay.setBar(e, null, -1, false, camera);
        this.targets.delete(e); this.dots.delete(e); this.tokens.delete(e);
        if (this.lock === e) this.lock = null;
      } else this.enemies[n++] = e;
    }
    this.enemies.length = n;
    if (this.lock && (!this.lock.alive || !pl || Math.hypot(this.lock.x - pl.x, this.lock.z - pl.z) > 28)) this.lock = null;

    // Anzeigen
    const boss = this.enemies.find((e) => e.def.boss && e.alive);
    this.overlay.setBoss(boss ? this.bossView(boss) : null);
    for (const e of this.enemies) {
      const show = e.alive && !e.def.boss && (this.now - e.lastHit < 5 || e === this.lock || e.def.elite);
      this.overlay.setBar(e, show ? e.headInto(this.barVec) : null, show ? e.hp / e.maxHp : -1, !!e.def.elite, camera, '', e.char.holder, 2.2 * e.def.scale);
    }
    this.overlay.setReticle(this.lock?.alive ? this.lock.headInto(this.barVec).setY(this.lock.y + 1.2 * this.lock.def.scale) : null, camera);
  }
}

const COIN_GEO = markShared(new CylinderGeometry(0.16, 0.16, 0.04, 14).rotateX(Math.PI / 2));
const COIN_MAT = toon({ color: 0xffc83a, spec: 1, emissive: 0x4a3000 });
