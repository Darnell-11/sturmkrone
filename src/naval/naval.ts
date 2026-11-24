import { audio } from '../audio/audio';
import {
  IcosahedronGeometry,
  BoxGeometry,
  Color,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  SrcAlphaFactor,
  ZeroFactor,
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
import { AMMO, DEFAULT_SHIP_LOOK, factionShipLook, HULL_COLORS, SAIL_COLORS, SEA_SPEED, SHIP_CLASSES, type AmmoId, type NavalRole, type ShipLook } from '../data/ships';
import { BORDER_FORTS, BORDERS, FACTIONS, borderDistance, marineStance, sectorAt, type FactionId } from '../data/factions';
import { BATTLE, battleSite, compassWord, nextDelay, sideSize, type BattleSite } from './battleRules';
import { cannotBeSunk } from './shipSim';
import { PredictiveMaritimeSteering, aiSpreadK, arriveRadius, createAiNav, fireRangeOf, newSteerCommand, newSteerSelf, newSteerTarget, noteRam, resetGoal, type AiNavState, type SteerCommand, type SteerSelf, type SteerTarget } from './shipSteering';
import { distToSegment, wrapAngle } from '../core/mathUtil';
import { FLEET_ANCHOR_CLEAR, FLEET_DMG_K, FLEET_ORDER_RANGE, FLEET_RECALL_DIST, formationPoint, formationSlotOf, type FleetOrder, type FleetShipRecord, type FlagMotion, type FlagPose, type FormationOffset } from '../data/playerFleet';
import { aiCannon, aiHullFactor, dangerOfLevel } from '../data/balanceConfig';
import { portIndices, aiEvolution, evoStats } from '../data/shipEvolution';
import { aiMayRam, hasSwivels, ramContact, ramDamage, ramImpulse, swivelCooldown, swivelDamage, swivelTarget, type Kin } from './ramming';
import { RAM, SWIVEL } from '../data/balanceConfig';
import { REP, hasService, isHostile, isPeaceful, judgeBattle, newStats, type BattleStats } from '../data/reputation';
import { WORLD_RADIUS } from '../data/world';
import { Ship, type SeaEnv } from '../entities/ship/ship';
import type { SwivelMount } from '../entities/ship/shipEvoParts';
import { cloneToon, toon } from '../render/toon';
import type { CombatOverlay } from '../ui/combatOverlay';
import type { IslandGround } from '../world/islandGround';
import type { ParticleSystem } from '../world/particles';
import type { SmokeSystem } from '../world/smoke';
import type { DebrisSystem } from '../world/debris';
import { BERNSTEINSEE, regionAt, seaLevelAt } from '../data/regions';
import { ElementFx } from '../faji/elementFx';
import { ELEMENT_COLORS, type ActiveDef, type Element } from '../data/skills';
import { markShared } from '../render/dispose';
import { keepIf } from '../core/arrays';

const G = 9.8;
const BALL_SPEED = 46;

/** Ab dieser Entfernung zum Spieler (Meter) bekommen Schüsse und Treffer der KI untereinander nur den kleinen Rauchfleck */
const FAR_FX = 240;
/** Hilfsvektoren der Drehbassen-Darstellung (nichts in der Spielschleife neu anlegen) */
const _mz = new Vector3();
const AXIS_UP = new Vector3(0, 1, 0);
const SWIVEL_FLASH = new Color(4, 2, 0.5);
const SWIVEL_TRACER = new Color(3.4, 2.2, 0.6);
/** Schwenkzeit vor dem Schuss und Haltezeit auf dem Ziel (Sekunden) */
const SWIVEL_AIM_T = 0.4;
const SWIVEL_HOLD_T = 2.4;

export interface EnemyShip {
  ship: Ship;
  role: NavalRole;
  level: number;
  state: 'patrol' | 'engage' | 'flee';
  wander: { x: number; z: number };
  aiT: number;
  name?: string;
  companion?: boolean;
  /** Begleitschiff der Spieler-Flotte (Kennung `fleet-<Klasse>` aus dem Spielstand, data/playerFleet.ts); Söldner-Begleiter im Raid haben keine */
  fleetId?: string;
  /** Legende der Rangliste */
  legendId?: string;
  /** Geisterschiff (nur nachts im Nebelarchipel) */
  ghost?: boolean;
  /** Zustand der KI-Lenkung (Manöver, Haltezeit, Kurs, Segel, Ziel-Kennung): reine Daten, siehe naval/shipSteering.ts */
  nav?: AiNavState;
  /** Hinweis „jetzt entern“ schon gezeigt */
  weakNoted?: boolean;
  /** Übungsschiff aus der Einführung (wie in 1.0): angeschlagen, schießt schwächer */
  training?: boolean;
  /** Durch Entern erobert (nicht versenkt) */
  captured?: boolean;
  /** Weltmacht des Schiffs (data/factions.ts): bestimmt Rumpf, Segelmuster und Flagge; Marine-Schiffe können friedlich sein (siehe Ansehen) */
  power?: FactionId;
  /** Marine-Patrouillenboot einer Grenzfestung (BORDER_FORTS-ID): kreuzt auf der Grenzlinie */
  station?: string;
  /** Der Spieler hat auf dieses Marine-Schiff geschossen: es ist ab jetzt feindlich */
  provoked?: boolean;
  /** Wachschiff einer Raid-Instanz bzw. Schiff einer Rückeroberungs-Flotte: hält seine Station, wird nie entfernt */
  raid?: 'guard' | 'recon';
  /** Rückeroberungs-Flotte (Besatzung): Kennung der Insel, die sie zurückholen will */
  reconId?: string;
  home?: { x: number; z: number };
  /** Kennung in der Raid-Sitzung (RaidGuardDef.guardId) */
  guardId?: string;
  /** Teilnehmer einer Seeschlacht an der Grenze (KI gegen KI): Nummer der Schlacht und Seite (0, 1; 2 = Marine-Patrouille, die eingreift) */
  battle?: { id: number; side: 0 | 1 | 2 };
  /** Marine-Schiff, das dem Spieler (Dienststatus) gegen feindliche Schiffe hilft */
  helper?: boolean;
  /** Kopfgeldjäger oder Fahnder einer Macht, hinter dem Spieler her */
  hunter?: boolean;
  /** Zeitpunkt des letzten Treffers durch den Spieler (Takt des Seesystems) */
  lastPlayerHit?: number;
  /** Schiff wurde für Enterphase und Nur-Entern-Regel eingerichtet (Ship.canDisable / noKill) */
  armed?: boolean;
  /** Der Abschuss (Enterphase oder Untergang) zählt schon in der Bilanz der Seeschlacht */
  countedSunk?: boolean;
  /** Zeit des letzten Hinweises „nur Entern“ */
  noKillHint?: number;
  /** Wird gerade vom Spieler geentert (setzt die Seewelt): Schüsse anderer Schiffe richten nichts an, eine Seeschlacht läuft weiter, bis der Enterkampf entschieden ist */
  boarded?: boolean;
}

/** Eine laufende Seeschlacht zwischen zwei Mächten an einer Grenzlinie */
export interface SeaBattle {
  id: number;
  site: BattleSite;
  t: number;
  stats: BattleStats;
  marineDone: boolean;
  smokeT: number;
  announced: boolean;
  /** Der Spieler hat mindestens einmal getroffen */
  engaged: boolean;
  /** Gegen welche Seite die Marine kämpft (bevorzugt die der Schwarzsegel) */
  marineFoe: 0 | 1;
  ended?: boolean;
}

/** Markierung einer laufenden Seeschlacht für Kompass und Weltkarte */
export interface BattleMark { id: number; x: number; z: number; a: FactionId; b: FactionId; left: [number, number]; borderIndex: number }

/** Ergebnis einer Seeschlacht an das Spiel (nur wenn der Spieler eingegriffen hat): Bilanz und Grund des Endes */
export interface BattleResult { id: number; stats: BattleStats; reason: 'besiegt' | 'zeit' | 'verlassen'; sides: [FactionId, FactionId] }

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
  return markShared(new CanvasTexture(c));
})();

interface Ball { mesh: Mesh; vel: Vector3; /** null: Kugel einer Küstenbatterie */ owner: Ship | null; dmg: number; ammo: AmmoId; life: number; trail: number }

/** Bauwerke, die Kugeln der eigenen Flotte treffen können (Seetor, Mauern, Batterien der Raid-Insel) */
export interface BallTarget { hitBall(p: Vector3, dmg: number, ammo: AmmoId): boolean }
interface Crate { mesh: Mesh; x: number; z: number; gold: number; shard: boolean; t: number }

export interface NavalHooks {
  shake(a: number): void;
  hitstop(t: number): void;
  message(t: string): void;
  sunk(e: EnemyShip): void;
  loot(gold: number, shard: boolean): void;
  /** Ein Schiff der Spieler-Flotte ist gesunken: das Spiel schleppt es in den Hafen (eingemottet, kaum Rumpf) */
  fleetLost?(fleetShipId: string): void;
  /** Seeschlacht beginnt in der Nähe (Meldung) bzw. endet (nur wenn der Spieler eingegriffen hat: Auswertung) */
  battleStart?(m: BattleMark, where: string): void;
  battleEnd?(r: BattleResult): void;
}


/** Feindschiffe, Kanonenkugeln, Beute und Faji auf See. */
export class NavalSystem {
  enemies: EnemyShip[] = [];
  player: Ship | null = null;
  playerFaction: 'pirat' | 'marine' = 'pirat';
  playerLevel = 1;
  playerRank = 0;
  /** Ansehen bei einer Weltmacht (setzt die Welt aus dem Spielstand); Marine: ab 20 verbündet, unter 0 feindlich */
  standingOf: (id: FactionId) => number = () => 0;
  /** Raid-Instanz aktiv: keine natürlichen Begegnungen, keine Grenzpatrouillen, Wachschiffe bleiben bestehen */
  raidMode = false;
  /** Anzahl Begleitschiffe im Raid (eigene plus Söldner); null = nach Rang wie sonst */
  raidEscorts: number | null = null;
  /** Laufende Seeschlachten an den Grenzlinien (höchstens eine zugleich) */
  battles: SeaBattle[] = [];
  /** Seeschlachten aus: für Prüfungen und Raids */
  battlesOn = true;
  /** Detailstufe der Grafikstufe (Teilchenfaktor: 0,35 Low, 0,6 Mid, ab 1 High): bestimmt Schiffe je Seite und Aufwand der Schlachteffekte */
  detail = 1;
  private battleId = 0;
  private battleT = nextDelay(true);
  private clock = 0;
  /** Kopfgeld auf den Spieler je Macht (setzt das Spiel aus dem Spielstand): zieht Kopfgeldjäger an */
  bountyOf: (id: FactionId) => number = () => 0;
  private huntT = 90;
  /** Bauwerke der Raid-Insel, die Kugeln der eigenen Flotte treffen */
  raidTargets: BallTarget | null = null;
  /** Zusätzliches Ziel für Kanonenkugeln (Seeungeheuer) */
  extraTarget: { hitTest(p: Vector3): boolean; damage(n: number): void } | null = null;
  /** Kanonenschaden des Spielers */
  canDmg = 14;
  reloadMult = 1;
  /** Pulverdampf, Rauchsäulen und Wrackteile (setzt die Welt) */
  smoke: SmokeSystem | null = null;
  debris: DebrisSystem | null = null;
  private balls: Ball[] = [];
  private crates: Crate[] = [];
  private spawnT = 20;
  private ballGeo = new SphereGeometry(0.3, 8, 6);
  // Beutekisten und Brandkugeln teilen sich Netz und Material (vorher je Stück neu angelegt und nie freigegeben)
  private crateGeo = new BoxGeometry(1.2, 0.9, 1.2);
  private shardMat = new MeshBasicMaterial({ color: new Color(1.6, 0.9, 2.6) });
  private fireMat = new MeshBasicMaterial({ color: new Color(4, 1.6, 0.4) });
  // Zielfächer wie in 1.0: hell links und rechts, rot, sobald ein Gegner darin ist
  private fanGroup = new Group();
  private fans: Mesh[] = [];
  private fanMats = [0, 1].map(() => new ShaderMaterial({
    uniforms: { uColor: { value: new Color(0xffffff) }, uOpacity: { value: 0.06 }, uIn: { value: 8 }, uOut: { value: 72 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // Weicher Verlauf nach außen, heller Rand – wie ein Lichtkegel auf dem Wasser
    // kaum sichtbare Fläche, dafür ein feiner heller Saum am Rand der Reichweite (wirkt nicht wie ein grauer Schleier)
    fragmentShader: 'uniform vec3 uColor; uniform float uOpacity, uIn, uOut; varying vec3 vP; void main(){ float t = clamp((length(vP.xz) - uIn) / (uOut - uIn), 0.0, 1.0); float fill = smoothstep(0.0, 0.3, t) * (1.0 - smoothstep(0.85, 0.97, t)) * (0.2 + 0.5 * t) * 0.45; float rim = smoothstep(0.9, 0.965, t) * (1.0 - smoothstep(0.975, 1.0, t)) * 1.6; gl_FragColor = vec4(uColor, (fill + rim) * uOpacity); }',
    transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
    // Alpha-Kanal nicht verändern: er markiert Wasser für Konturen und Schattierung
    blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
  }));
  private fanRange = 0;
  private rings = [0, 1].map(() => {
    // dezenter Messingring statt grellem Rot – wirkt wie eine Markierung auf der Seekarte
    const m = new Mesh(new RingGeometry(0.93, 1, 64).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: new Color(1.5, 1.05, 0.45), transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide, fog: false, blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor }));
    m.visible = false;
    m.renderOrder = 4;
    return m;
  });
  private aimT = 0;
  /** Sichtbare Faji-Wellen vom eigenen Schiff zum Ziel (wie seaWave in 1.0) */
  private waves: { mesh: Mesh; t: number; max: number }[] = [];
  private trainCd = 0;

  /** Elementeffekte der Faji-Kräfte auf See (dieselbe Effektsprache wie an Land, nur in Schiffsgröße) */
  private efx: ElementFx;
  /** Fallende Meteore und fliegende Druckschläge */
  private shots: { mesh: Mesh; from: Vector3; to: Vector3; t: number; dur: number; arc: number; trail: Element; done: () => void }[] = [];
  /** Verzögerte Treffer in Spielzeit (stehen in der Pause still, anders als setTimeout) */
  private timers: { t: number; fn: () => void }[] = [];
  private later(sec: number, fn: () => void) { this.timers.push({ t: sec, fn }); }
  /** Vorausschauende KI-Lenkung (Fühler, Wendekreis, Gefechts-Zustandsmaschine) */
  private readonly steering: PredictiveMaritimeSteering;
  /** Schiffe auf der Seite des Spielers (Flaggschiff, Begleiter, Marine-Helfer): ihre Kugeln treffen einander nie (je Schritt in `registerObstacles` gefüllt) */
  private readonly friendly = new Set<Ship>();

  constructor(private scene: Scene, private env: SeaEnv, private fx: CombatFx, private overlay: CombatOverlay, private spray: ParticleSystem, private sparks: ParticleSystem, private ground: IslandGround, private hooks: NavalHooks) {
    this.efx = new ElementFx(scene, fx, sparks, { shake: (a) => hooks.shake(a), hitstop: (t) => hooks.hitstop(t), speedlines: (v) => overlay.speedlines(v) });
    this.steering = new PredictiveMaritimeSteering(ground, env, WORLD_RADIUS);
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
      const ship = new Ship(this.scene, 0, DEFAULT_SHIP_LOOK(foe), foe, 0, false, aiEvolution('rookie', 1));
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
        m.uniforms.uColor.value.setHex(0xffc27a);
        m.uniforms.uOpacity.value = ready ? 0.32 + Math.sin(this.aimT * 5) * 0.06 : 0.12;
        const ring = this.rings[i];
        ring.visible = true;
        ring.position.set(t.x, 1.5, t.z);
        ring.scale.setScalar(t.cls.L * 0.7 + Math.sin(this.aimT * 4) * 0.3);
        (ring.material as MeshBasicMaterial).opacity = ready ? 0.55 : 0.25;
      } else {
        m.uniforms.uColor.value.setHex(0xfff2dc);
        m.uniforms.uOpacity.value = near ? 0.05 : 0;
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
      this.overlay.setBar(e, vis ? this.barPos : null, vis ? s.hull / s.maxHull : -1, e.role === 'legende' || !!e.ghost, camera, vis && this.isWeak(e) ? 'ENTERN' : '', s.model.group, s.model.deckY + s.cls.mh + 3);
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
    const all = side > 0 ? ship.model.muzzlesL : ship.model.muzzlesR;
    // Stückpforten: Kanonen-Stufe 1 bestückt nur die Hälfte, Stufe 2 drei Viertel, ab Stufe 3 alle
    const muzzles = portIndices(all.length, ship.portsOf(all.length)).map((i) => all[i]);
    audio.play('broadside', ship === this.player ? 1 : 0.8, { x: ship.x, z: ship.z });
    const left = new Vector3(Math.cos(ship.heading), 0, -Math.sin(ship.heading)).multiplyScalar(side);
    const speed = BALL_SPEED * AMMO[ammo].speed;
    const n = muzzles.length;
    // Rückstoß: das Schiff krängt von der feuernden Seite weg und schaukelt zurück
    ship.kick(side * (0.035 + Math.min(0.05, n * 0.006)));
    muzzles.forEach((m, i) => {
      const w = m.clone().applyMatrix4(ship.model.group.matrixWorld);
      let dir: Vector3, r: number, carry = 1;
      if (target) {
        const T = Math.hypot(target.x - w.x, target.z - w.z) / speed;
        const lo = n > 1 ? (i / (n - 1) - 0.5) * target.cls.L * 0.6 : 0;
        const ex = target.x + Math.sin(target.heading) * (target.speed * T + lo);
        const ez = target.z + Math.cos(target.heading) * (target.speed * T + lo);
        dir = new Vector3(ex - w.x, 0, ez - w.z);
        // KI-Schützen streuen jenseits von 115 m immer stärker (bis ×4 bei 140 m); der Spieler zielt wie bisher
        const sk = ship === this.player ? 1 : aiSpreadK(dir.length());
        r = dir.length() * (1 + (Math.random() * 0.06 - 0.03) * sk);
        dir.normalize().applyAxisAngle(new Vector3(0, 1, 0), (Math.random() - 0.5) * 0.03 * sk);
        carry = 0;
      } else {
        const sk = ship === this.player ? 1 : aiSpreadK(range);
        dir = left.clone().applyAxisAngle(new Vector3(0, 1, 0), (Math.random() - 0.5) * 0.08 * sk);
        r = range * AMMO[ammo].range * (0.97 + (Math.random() - 0.5) * 0.1 * sk);
      }
      const t = r / speed;
      const vel = dir.multiplyScalar(speed).add(new Vector3(Math.sin(ship.heading) * ship.speed * 0.5 * carry, 0.5 * G * t - (w.y - 0.6) / t, Math.cos(ship.heading) * ship.speed * 0.5 * carry));
      // gestaffelt in Spielzeit (setTimeout lief in der Pause weiter und feuerte auch nach dem Untergang)
      this.later((i * 40) / 1000, () => { if (ship.alive) this.spawnBall(w, vel, ship, dmg, ammo); });
    });
  }

  /** Küstenbatterie feuert auf ein Schiff (mit Vorhalt, leichte Streuung); die Kugel gehört keinem Schiff */
  fireBattery(from: Vector3, target: Ship, dmg: number) {
    const T = Math.hypot(target.x - from.x, target.z - from.z) / BALL_SPEED;
    const ex = target.x + Math.sin(target.heading) * target.speed * T, ez = target.z + Math.cos(target.heading) * target.speed * T;
    const dir = new Vector3(ex - from.x, 0, ez - from.z);
    const r = dir.length() * (0.95 + Math.random() * 0.1);
    dir.normalize().applyAxisAngle(new Vector3(0, 1, 0), (Math.random() - 0.5) * 0.05);
    const t = Math.max(0.2, r / BALL_SPEED);
    const vel = dir.multiplyScalar(BALL_SPEED).setY(0.5 * G * t - (from.y - 0.6) / t);
    audio.play('boom', 1, { x: from.x, z: from.z });
    this.spawnBall(from.clone(), vel, null, dmg, 'kugel');
  }

  /**
   * Wachschiff einer Raid-Instanz: stark gepanzert (Rumpf, Segel-HP und Mannschaft über den Klassenwerten), hält seine Station und
   * greift ab 520 m an. `kind` skaliert mit der Gruppe: je weiterer Spieler 60 % mehr Rumpf.
   */
  spawnGuard(d: { guardId: string; tier: number; x: number; z: number; heading: number; hull: number; sail: number; crew: number; name: string }, look: ShipLook, level: number, power: FactionId, groupScale = 1): EnemyShip {
    const cls = SHIP_CLASSES[Math.max(0, Math.min(SHIP_CLASSES.length - 1, d.tier))];
    const ship = new Ship(this.scene, d.tier, look, power === 'marine' ? 'marine' : 'pirat', Math.round(cls.hp * (d.hull * groupScale - 1 + level * 0.03)), false, aiEvolution('raid', dangerOfLevel(level)));
    ship.sim.sail.max = Math.round(ship.sim.sail.max * d.sail * groupScale);
    ship.sim.sail.hp = ship.sim.sail.max;
    const m = ship.sim.crew.pools.matrosen;
    if (m) { m.max = Math.round(m.max * d.crew); m.n = m.max; }
    ship.x = d.x; ship.z = d.z; ship.heading = d.heading;
    ship.prev = { x: d.x, z: d.z, heading: d.heading };
    const e: EnemyShip = { ship, role: 'jaeger', level, state: 'patrol', wander: { x: d.x, z: d.z }, aiT: 0, name: d.name, power, raid: 'guard', home: { x: d.x, z: d.z }, guardId: d.guardId };
    this.enemies.push(e);
    return e;
  }

  /**
   * Rückeroberungs-Flotte der ursprünglichen Macht (Besatzung einer Festungsinsel): `count` Kriegsschiffe laufen in Linie vor die Insel,
   * halten dort Station und greifen alles in 520 m an. Die Schiffe bleiben bestehen, bis sie versenkt sind (`reconAlive`). Stärke je Schiff:
   * Rumpf etwa ×1,5 und Mannschaft ×1,3 über der Klasse (Wachschiffe der Belagerung: ×2,1).
   */
  spawnReconFleet(o: { islandId: string; x: number; z: number; heading: number; homeX: number; homeZ: number; count: number; level: number; power: FactionId; look: ShipLook; name: string }): EnemyShip[] {
    const out: EnemyShip[] = [];
    const tiers = [4, 4, 5, 4, 6, 4];
    // quer zur Fahrtrichtung in einer Linie, 70 m Abstand
    const nx = Math.cos(o.heading), nz = -Math.sin(o.heading);
    for (let i = 0; i < o.count; i++) {
      const off = (i - (o.count - 1) / 2) * 70;
      const tier = tiers[i % tiers.length];
      const cls = SHIP_CLASSES[Math.max(0, Math.min(SHIP_CLASSES.length - 1, tier))];
      const ship = new Ship(this.scene, tier, { ...o.look }, o.power === 'marine' ? 'marine' : 'pirat', Math.round(cls.hp * (2.0 - 1 + o.level * 0.03)), false, aiEvolution('raid', dangerOfLevel(o.level)));
      ship.sim.sail.max = Math.round(ship.sim.sail.max * 1.5);
      ship.sim.sail.hp = ship.sim.sail.max;
      const m = ship.sim.crew.pools.matrosen;
      if (m) { m.max = Math.round(m.max * 1.3); m.n = m.max; }
      ship.x = o.x + nx * off; ship.z = o.z + nz * off; ship.heading = o.heading;
      ship.prev = { x: ship.x, z: ship.z, heading: o.heading };
      const hx = o.homeX + nx * off, hz = o.homeZ + nz * off;
      const e: EnemyShip = { ship, role: 'jaeger', level: o.level, state: 'patrol', wander: { x: hx, z: hz }, aiT: 0, name: `${o.name} ${i + 1}`, power: o.power, raid: 'recon', home: { x: hx, z: hz }, reconId: o.islandId };
      this.enemies.push(e);
      out.push(e);
    }
    return out;
  }

  /** Wie viele Schiffe der Rückeroberungs-Flotte einer Insel sind noch im Gefecht? */
  reconAlive(islandId: string): number {
    let n = 0;
    for (const e of this.enemies) if (e.reconId === islandId && e.ship.alive && !e.captured) n++;
    return n;
  }

  /** Rückeroberungs-Flotte einer Insel abziehen (die Besatzung endet oder die Flotte hat gesiegt) */
  clearRecon(islandId: string) {
    keepIf(this.enemies, (e) => {
      if (e.reconId !== islandId) return true;
      e.ship.dispose();
      this.overlay.setBar(e, null, -1, false, null);
      return false;
    });
  }

  /** Bugkanone nach vorn */
  bowShot(ship: Ship, dmg: number, ammo: AmmoId) {
    const f = new Vector3(Math.sin(ship.heading), 0, Math.cos(ship.heading));
    audio.play('boom', 1, { x: ship.x, z: ship.z });
    const from = new Vector3(ship.x, ship.model.deckY + 0.6, ship.z).addScaledVector(f, ship.cls.L / 2);
    this.spawnBall(from, f.multiplyScalar(BALL_SPEED + ship.speed).setY(6), ship, dmg * 0.8, ammo);
  }

  private spawnBall(pos: Vector3, vel: Vector3, owner: Ship | null, dmg: number, ammo: AmmoId) {
    const mat = ammo === 'brand' ? this.fireMat : toon({ color: AMMO[ammo].color, spec: 1 });
    const m = new Mesh(this.ballGeo, mat);
    m.position.copy(pos);
    this.scene.add(m);
    this.balls.push({ mesh: m, vel, owner, dmg, ammo, life: 6, trail: 0 });
    // Mündungsfeuer
    const h = Math.hypot(vel.x, vel.z) || 1;
    const dx = vel.x / h, dz = vel.z / h;
    // Schüsse fremder Schiffe weit weg vom Spieler (Seeschlacht am Horizont): nur eine kleine Pulverwolke, die Rauchsäule trägt das Bild
    const pl = this.player;
    if (owner !== pl && pl && Math.hypot(pos.x - pl.x, pos.z - pl.z) > FAR_FX) {
      this.smoke?.puff(pos.x + dx * 1.2, pos.y, pos.z + dz * 1.2, { n: 1, size: 2.4, grow: 9, life: 5, tone: 0.84, vx: dx * 8, vy: 0.5, vz: dz * 8, spread: 1, rise: 0.3, drag: 1.4, alpha: 0.5, wind: 0.9, jitter: 0.8 });
      return;
    }
    this.sparks.emit(8, pos.x + dx * 0.6, pos.y, pos.z + dz * 0.6, { speed: 6, up: 1, life: 0.3, color: new Color(4, 1.9, 0.5), gravity: 0, spread: 0.3 });
    this.fx.hit(pos.clone().addScaledVector(new Vector3(dx, 0, dz), 0.8), 'punch', '#FFB45A', true);
    if (this.smoke) {
      // dichter Pulverdampf, der aus der Stückpforte schießt und dann mit dem Wind abzieht
      this.smoke.puff(pos.x + dx * 1.2, pos.y, pos.z + dz * 1.2, { n: 4, size: 1.6, grow: 8, life: 6, tone: 0.86, vx: dx * 12, vy: 0.5, vz: dz * 12, spread: 1.1, rise: 0.3, drag: 1.6, alpha: 0.62, glow: 0.25, wind: 0.9, jitter: 0.6 });
      this.smoke.puff(pos.x + dx * 5, pos.y + 0.4, pos.z + dz * 5, { n: 2, size: 3, grow: 11, life: 8, tone: 0.82, vx: dx * 4, vy: 0.4, vz: dz * 4, spread: 0.8, rise: 0.2, drag: 1.1, alpha: 0.38, wind: 1, jitter: 1.5 });
    } else this.spray.emit(10, pos.x, pos.y, pos.z, { speed: 2, up: 1.5, life: 1.2, color: new Color(0.75, 0.75, 0.78), gravity: -0.5, spread: 1 });
    if (owner === this.player) this.hooks.shake(0.18);
  }

  // ---------- Spawnen ----------

  private zoneLevel(x: number, z: number) { return seaLevelAt(x, z); }

  /**
   * Ein Schiff segelt am Horizont herein (nicht direkt vor der Nase) und folgt seiner eigenen Route.
   * Heimatnahe Gewässer: vor allem Händler; weiter draußen mehr Patrouillen und Jäger.
   * Ab und zu fährt ein Händler mit Begleitschutz.
   */
  private spawnEnemy(px: number, pz: number, forceRole?: NavalRole, near?: { x: number; z: number; heading: number }, forcePower?: FactionId, hunter = false) {
    // Stärke hängt am Meer, nicht an der eigenen Stufe: wer aufsteigt, wird in alten Gewässern
    // spürbar überlegen – und muss sich in neue Meere erst hineinkämpfen.
    const zone = this.zoneLevel(px, pz);
    const lvl = Math.max(1, zone + Math.floor(Math.random() * 3) - 1);
    const roll = Math.random();
    const merchantShare = zone <= 2 ? 0.45 : zone <= 6 ? 0.32 : 0.22;
    const hunterShare = zone <= 2 ? 0.15 : zone <= 6 ? 0.3 : 0.42;
    const role: NavalRole = forceRole ?? (roll < merchantShare ? 'haendler' : roll < merchantShare + hunterShare ? 'jaeger' : 'patrouille');
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = 420 + Math.random() * 140;
      const x = near ? near.x - Math.sin(near.heading) * 28 + (Math.random() - 0.5) * 20 : px + Math.cos(a) * d;
      const z = near ? near.z - Math.cos(near.heading) * 28 + (Math.random() - 0.5) * 20 : pz + Math.sin(a) * d;
      if (Math.hypot(x, z) > WORLD_RADIUS - 150 || this.ground.islandAt(x, z, 40)) continue;
      let foe: 'pirat' | 'marine' = role === 'haendler' ? (Math.random() < 0.5 ? 'pirat' : 'marine') : this.playerFaction === 'pirat' ? 'marine' : 'pirat';
      const tier = Math.max(0, Math.min(role === 'haendler' ? 3 : 5, Math.floor(lvl / 2) + Math.floor(Math.random() * 2) - (role === 'haendler' ? 0 : 1)));
      // Die Macht des Meeres (Kuchenstück, Besitzer der nächsten Insel, Marine an den Grenzlinien) bestimmt, wessen Schiff hier fährt
      // Sektor-Treue: in jedem Kuchenstück fahren hauptsächlich Kriegs- UND Handelsschiffe der Macht des Sektors (Farben, Segelmuster, Flagge,
      // Galionsfigur aus data/factions.ts), die man schon von weitem erkennt; Handelsschiffe sind kleiner und flüchten
      const power = forcePower ?? this.powerAt(x, z);
      const useFaction = !!power;
      const look = useFaction ? factionShipLook(power!) : DEFAULT_SHIP_LOOK(foe);
      if (useFaction) foe = power === 'marine' ? 'marine' : power === 'kurogane' ? 'pirat' : foe;
      if (role === 'haendler' && !useFaction) { look.hull = HULL_COLORS[Math.floor(Math.random() * 3)]; look.sail = SAIL_COLORS[Math.floor(Math.random() * 3)]; look.flag = 'anker'; look.flagColor = '#2F6E4F'; look.figurehead = 'keine'; }
      // erfahrene Crews halten mehr aus (sonst wären Schiffe in hohen Meeren aus Papier)
      const ship = new Ship(this.scene, tier, look, foe, Math.round(SHIP_CLASSES[tier].hp * (aiHullFactor(lvl) - 1)), false, aiEvolution(near ? 'eskorte' : hunter ? 'jaeger' : role === 'legende' ? 'flaggschiff' : role, dangerOfLevel(lvl)));
      // Route: quer durch das Gebiet, am Spieler vorbei statt direkt auf ihn zu
      const toP = Math.atan2(px - x, pz - z);
      const heading = near ? near.heading : toP + (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.7);
      ship.x = x; ship.z = z; ship.heading = heading;
      ship.prev = { x, z, heading: ship.heading };
      const far = 900;
      const wander = { x: x + Math.sin(heading) * far, z: z + Math.cos(heading) * far };
      const e: EnemyShip = { ship, role, level: lvl, state: 'patrol', wander, aiT: 60, power: useFaction ? power! : undefined };
      if (useFaction) e.name = hunter ? (power === 'marine' ? 'Marine-Fahndungsschiff' : `Kopfgeldjäger von ${FACTIONS[power!].name}`) : `${FACTIONS[power!].name}-${role === 'haendler' ? 'Handelsschiff' : 'Kriegsschiff'}`;
      if (hunter) { e.hunter = true; e.provoked = true; e.state = 'engage'; }
      this.enemies.push(e);
      // Händler mit Begleitschutz
      if (role === 'haendler' && !near && zone >= 2 && Math.random() < 0.35) this.spawnEnemy(px, pz, 'patrouille', { x, z, heading }, power ?? undefined);
      return e;
    }
    return null;
  }

  /**
   * Welche Macht fährt an diesem Punkt? Außerhalb der Bernsteinsee das Kuchenstück (data/factions.ts), an den Grenzlinien (±420 m) oft die
   * Marine; in der Bernsteinsee der Besitzer der nächsten Insel (bis 800 m), sonst keine (die alten Schiffe). Händler tragen nur Niederlande.
   */
  private powerAt(x: number, z: number): FactionId | null {
    if (regionAt(x, z) === BERNSTEINSEE) {
      let best: FactionId | null = null, bd = 800;
      for (const i of BERNSTEINSEE.islands) {
        if (!i.factionId) continue;
        const d = Math.hypot(i.x - x, i.z - z) - i.r;
        if (d < bd) { bd = d; best = i.factionId; }
      }
      return best;
    }
    const bd = borderDistance(x, z);
    if (bd.dist < 420 && Math.random() < 0.35) return 'marine';
    const own = sectorAt(x, z).factionId;
    // dicht an der Grenzlinie fährt manchmal ein Schiff der Nachbarmacht (Handel und Streifen über die Linie)
    if (bd.dist < 700 && Math.random() < 0.16) { const [a, b] = BORDERS[bd.borderIndex].between; return own === a ? b : a; }
    return own;
  }

  /** Marine-Schiffe greifen nur an, wenn das Ansehen unter 0 liegt oder man auf sie geschossen hat */
  private peaceful(e: EnemyShip): boolean {
    if (e.provoked || e.companion || e.raid || e.hunter || !e.power) return false;
    if (e.power === 'marine') return marineStance(this.standingOf('marine')) !== 'feindlich';
    // andere Mächte: friedliche Durchfahrt im Sektor ab gutem Ansehen (Ehre aus Seeschlachten)
    return isPeaceful(this.standingOf(e.power));
  }

  /** Dienststatus bei der Marine: ihre Schiffe helfen im Kampf */
  private marineService(): boolean { return hasService(this.standingOf('marine')); }

  private patrolT = 0;
  /**
   * Marine-Patrouillenboote bei den fünf Grenzfestungen: je Festung zwei Boote, die auf der Grenzlinie kreuzen, solange der Spieler
   * näher als 560 m ist (weiter weg werden Schiffe ohnehin entfernt). Sie fahren Marine-Weiß mit blauen Streifen.
   */
  private ensureBorderPatrols(dt: number) {
    const p = this.player;
    if (!p) return;
    this.patrolT -= dt;
    if (this.patrolT > 0) return;
    this.patrolT = 3;
    for (const f of BORDER_FORTS) {
      const a = (BORDERS[f.borderIndex].deg * Math.PI) / 180;
      const fx = Math.sin(a) * f.radius, fz = Math.cos(a) * f.radius;
      if (Math.hypot(p.x - fx, p.z - fz) > 560) continue;
      let have = this.enemies.reduce((n, e) => n + (e.station === f.id && e.ship.alive && !e.ship.sinking ? 1 : 0), 0);
      for (let tries = 0; have < 2 && tries < 8; tries++) {
        // auf der dem Spieler zugewandten Seite der Festung, 150 bis 300 m von ihr entfernt, mit etwas Versatz quer zur Linie
        const toward = Math.sign((p.x - fx) * Math.sin(a) + (p.z - fz) * Math.cos(a)) || 1;
        const t = f.radius + toward * (150 + Math.random() * 150 + have * 90), off = (Math.random() - 0.5) * 110;
        const x = Math.sin(a) * t + Math.cos(a) * off, z = Math.cos(a) * t - Math.sin(a) * off;
        if (this.ground.islandAt(x, z, 40) || Math.hypot(x, z) > WORLD_RADIUS - 150) continue;
        const lvl = f.level, tier = Math.max(2, Math.min(4, Math.floor(lvl / 3)));
        const ship = new Ship(this.scene, tier, factionShipLook('marine'), 'marine', Math.round(SHIP_CLASSES[tier].hp * (aiHullFactor(lvl) - 1)), false, aiEvolution('grenze', dangerOfLevel(lvl)));
        ship.x = x; ship.z = z; ship.heading = a + (Math.random() < 0.5 ? 0 : Math.PI);
        ship.prev = { x, z, heading: ship.heading };
        this.enemies.push({ ship, role: 'patrouille', level: lvl, state: 'patrol', wander: { x, z }, aiT: 0, power: 'marine', station: f.id, name: 'Marine-Patrouillenboot' });
        have++;
      }
    }
  }

  // ---------- Seeschlachten (KI gegen KI) ----------

  /** Das Ziel eines Schiffs in einer Seeschlacht: das nächste Schiff der Gegenseite (die Marine: Schwarzsegel bzw. die gewählte Seite) */
  private battleFoe(e: EnemyShip): Ship | null {
    const me = e.battle!, s = e.ship;
    const bt = this.battles.find((x) => x.id === me.id);
    let best = 520, foe: Ship | null = null;
    for (const o of this.enemies) {
      const ob = o.battle;
      if (o === e || !ob || ob.id !== me.id || !o.ship.alive || o.ship.sinking > 0 || o.boarded || o.ship.disabled) continue;
      const d = Math.hypot(o.ship.x - s.x, o.ship.z - s.z);
      let hostile: boolean;
      if (me.side === 2) hostile = ob.side !== 2 && (o.power === 'kurogane' || (bt ? bt.marineFoe === ob.side : true));
      else if (ob.side === 2) hostile = d < 240;                                // die Flotten wehren sich gegen die Marine in der Nähe
      else hostile = ob.side !== me.side;
      if (hostile && d < best) { best = d; foe = o.ship; }
    }
    return foe;
  }

  /** Ziel für ein Marine-Schiff mit Dienststatus: ein feindliches Schiff in der Nähe des Spielers (keine Marine, keine Händler, keine Schiffe einer Seeschlacht) */
  private helperFoe(e: EnemyShip, p: Ship): Ship | null {
    const s = e.ship;
    let best = 420, foe: Ship | null = null;
    for (const o of this.enemies) {
      if (o === e || o.companion || o.battle || o.role === 'haendler' || o.power === 'marine' || !o.ship.alive || o.ship.sinking > 0 || o.ship.disabled) continue;
      if (this.peaceful(o)) continue;
      if (Math.hypot(o.ship.x - p.x, o.ship.z - p.z) > 380) continue;
      const d = Math.hypot(o.ship.x - s.x, o.ship.z - s.z);
      if (d < best) { best = d; foe = o.ship; }
    }
    return foe;
  }

  /** Treffer des Spielers auf ein Schiff einer Seeschlacht: Bilanz führen */
  private noteBattleHit(s: Ship, dealt: number) {
    const e = this.enemies.find((o) => o.ship === s);
    if (!e?.battle || e.battle.side === 2 || dealt <= 0) return;
    const bt = this.battles.find((x) => x.id === e.battle!.id);
    if (!bt) return;
    bt.stats.dmg[e.battle.side] += dealt;
    if (!bt.engaged) { bt.engaged = true; this.hooks.message('Du greifst in die Seeschlacht ein – die Flotten werden sich merken, wen du beschießt.'); }
  }

  /** Neue Seeschlacht an der Grenzlinie: zwei Flotten zu 2 bis 3 Kriegsschiffen, 130 m auseinander, beiderseits der Linie */
  private startBattle(site: BattleSite) {
    const p = this.player!;
    const zone = this.zoneLevel(site.x, site.z);
    const lvl = Math.max(2, zone + Math.floor(Math.random() * 3) - 1);
    const id = ++this.battleId;
    const powers: [FactionId, FactionId] = [site.a, site.b];
    // schwächere Geräte (Low, Mid): höchstens zwei Schiffe je Seite (sechs Schiffe samt Rauch kosten dort mehr als die halbe Bildzeit)
    const cap = this.detail < 1 ? 2 : 3;
    const sizes = [Math.min(cap, sideSize()), Math.min(cap, sideSize())];
    // auf Low (Teilchenfaktor unter 0,5) fährt eine Seite nur mit einem Schiff: drei Schiffe statt vier
    if (this.detail < 0.5) sizes[Math.random() < 0.5 ? 0 : 1] = 1;
    const hulls: number[] = [0, 0], counts = [0, 0];
    for (const side of [0, 1] as const) {
      for (let i = 0; i < sizes[side]; i++) {
        const spread = (i - (sizes[side] - 1) / 2) * 52 + (Math.random() - 0.5) * 16;
        const dir = side === 0 ? -1 : 1;
        const x = site.x + site.across.x * dir * BATTLE.split + site.along.x * spread, z = site.z + site.across.z * dir * BATTLE.split + site.along.z * spread;
        if (Math.hypot(x, z) > WORLD_RADIUS - 150 || this.ground.islandAt(x, z, 40)) continue;
        const power = powers[side];
        const tier = Math.max(1, Math.min(4, Math.floor(lvl / 2) + Math.floor(Math.random() * 2)));
        const foe: 'pirat' | 'marine' = power === 'kurogane' ? 'pirat' : 'marine';
        const ship = new Ship(this.scene, tier, factionShipLook(power), foe, Math.round(SHIP_CLASSES[tier].hp * (aiHullFactor(lvl) - 1)), false, aiEvolution('grenze', dangerOfLevel(lvl)));
        ship.x = x; ship.z = z;
        // beide Flotten fahren erst aufeinander zu, dann in Breitseitenabstand umeinander
        ship.heading = Math.atan2(-site.across.x * dir, -site.across.z * dir) + (Math.random() - 0.5) * 0.4;
        ship.prev = { x, z, heading: ship.heading };
        this.enemies.push({ ship, role: 'patrouille', level: lvl, state: 'engage', wander: { x, z }, aiT: 0, name: `${FACTIONS[power].name}-Kriegsschiff`, power, battle: { id, side } });
        hulls[side] += ship.maxHull; counts[side]++;
      }
    }
    if (!counts[0] || !counts[1]) {
      // kein Platz für beide Seiten: wieder abbauen
      keepIf(this.enemies, (e) => { if (e.battle?.id !== id) return true; e.ship.dispose(); return false; });
      this.battleT = 8;
      return;
    }
    const marineFoe: 0 | 1 = powers[0] === 'kurogane' ? 0 : powers[1] === 'kurogane' ? 1 : Math.random() < 0.5 ? 0 : 1;
    const b: SeaBattle = { id, site, t: 0, stats: newStats(site.a, site.b, hulls[0] / counts[0], hulls[1] / counts[1]), marineDone: false, smokeT: 0, announced: false, engaged: false, marineFoe };
    this.battles.push(b);
    const m = this.battleMark(b);
    if (m) this.hooks.battleStart?.(m, compassWord(p.x, p.z, m.x, m.z));
  }

  /** Marine-Patrouille greift ein: ein bis zwei Boote aus 380 m Entfernung, bevorzugt gegen die Schwarzsegel */
  private marineStep(b: SeaBattle) {
    const site = b.site, n = 1 + (this.detail >= 1 && Math.random() < 0.4 ? 1 : 0);
    const dir = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const x = site.x + site.across.x * dir * 380 + site.along.x * (i - 0.5) * 70, z = site.z + site.across.z * dir * 380 + site.along.z * (i - 0.5) * 70;
      if (Math.hypot(x, z) > WORLD_RADIUS - 150 || this.ground.islandAt(x, z, 40)) continue;
      const lvl = Math.max(2, this.zoneLevel(x, z));
      const tier = Math.max(2, Math.min(4, Math.floor(lvl / 3) + 1));
      const ship = new Ship(this.scene, tier, factionShipLook('marine'), 'marine', Math.round(SHIP_CLASSES[tier].hp * (aiHullFactor(lvl) - 1)), false, aiEvolution('grenze', dangerOfLevel(lvl)));
      ship.x = x; ship.z = z; ship.heading = Math.atan2(site.x - x, site.z - z);
      ship.prev = { x, z, heading: ship.heading };
      this.enemies.push({ ship, role: 'patrouille', level: lvl, state: 'engage', wander: { x, z }, aiT: 0, name: 'Marine-Patrouillenboot', power: 'marine', battle: { id: b.id, side: 2 } });
    }
    this.hooks.message('Marine-Patrouillenboote greifen in die Seeschlacht ein!');
  }

  /** Markierung einer Schlacht: Schwerpunkt ihrer lebenden Schiffe und Zahl der Überlebenden je Seite; null, wenn keine mehr da ist */
  private battleMark(b: SeaBattle): BattleMark | null {
    let x = 0, z = 0, n = 0;
    const left: [number, number] = [0, 0];
    for (const e of this.enemies) {
      if (e.battle?.id !== b.id || !e.ship.alive || e.ship.sinking > 0) continue;
      x += e.ship.x; z += e.ship.z; n++;
      if (e.battle.side !== 2 && !e.ship.disabled) left[e.battle.side]++;
    }
    return n ? { id: b.id, x: x / n, z: z / n, a: b.site.a, b: b.site.b, left, borderIndex: b.site.borderIndex } : null;
  }

  /** Alle laufenden Schlachten für Kompass und Weltkarte */
  battleMarks(): BattleMark[] {
    const out: BattleMark[] = [];
    for (const b of this.battles) { const m = this.battleMark(b); if (m) out.push(m); }
    return out;
  }

  private updateBattles(dt: number, active: boolean) {
    this.clock += dt;
    const p = this.player;
    if (!p) return;
    if (active && this.battlesOn && !this.raidMode && !this.battles.length) {
      this.battleT -= dt;
      if (this.battleT <= 0) {
        const site = battleSite(p.x, p.z);
        if (site) this.startBattle(site); else this.battleT = 6;
      }
    }
    if (!this.battles.length) return;
    for (const b of this.battles) {
      b.t += dt;
      const m = this.battleMark(b);
      if (!b.marineDone && b.t >= BATTLE.marineAfter) { b.marineDone = true; if (Math.random() < BATTLE.marineChance) this.marineStep(b); }
      // Rauchsäule über der Schlacht: von weitem sichtbar, dichter, je länger sie dauert
      b.smokeT -= dt;
      if (m && b.smokeT <= 0 && this.smoke && Math.hypot(m.x - p.x, m.z - p.z) < 3200) {
        b.smokeT = this.detail < 1 ? 1.1 : 0.7;
        this.smoke.puff(m.x + (Math.random() - 0.5) * 40, 10, m.z + (Math.random() - 0.5) * 40, { n: 1, size: 3.2, grow: 18, life: 12, tone: 0.2, vy: 8, spread: 3, rise: 2.4, drag: 0.5, alpha: 0.66, wind: 1.2, jitter: 12, glow: 0.35 });
      }
      let reason: BattleResult['reason'] | null = null;
      if (!m) reason = 'verlassen';
      else if (m.left[0] === 0 || m.left[1] === 0) reason = 'besiegt';
      else if (b.t > BATTLE.duration) reason = 'zeit';
      // mitten im Enterkampf bleibt die Schlacht bestehen: die Prise zählt erst, wenn sie erobert ist
      if (reason && !this.enemies.some((o) => o.battle?.id === b.id && o.boarded)) this.finishBattle(b, reason);
    }
    keepIf(this.battles, (b) => !b.ended);
  }

  private finishBattle(b: SeaBattle, reason: BattleResult['reason']) {
    b.ended = true;
    // Überlebende lösen sich aus dem Gefecht und segeln weiter (ihre Macht bleibt dieselbe)
    for (const e of this.enemies) {
      if (e.battle?.id !== b.id) continue;
      e.battle = undefined;
      e.state = 'patrol';
      const a = Math.random() * Math.PI * 2;
      e.wander = { x: e.ship.x + Math.cos(a) * 700, z: e.ship.z + Math.sin(a) * 700 };
      e.aiT = 30;
    }
    this.battleT = nextDelay(false);
    if (b.engaged) this.hooks.battleEnd?.({ id: b.id, stats: b.stats, reason, sides: [b.site.a, b.site.b] });
  }

  /** Nach einem Doppelspiel: die Jäger kommen bald */
  callHunters() { this.huntT = Math.min(this.huntT, 14); }

  /** Eine Schlacht ohne Wartezeit beginnen (Prüfungen, Weltwerkstatt); liefert false, wenn keine Grenze in der Nähe liegt */
  forceBattle(): boolean {
    const p = this.player;
    if (!p || this.battles.length) return false;
    const site = battleSite(p.x, p.z);
    if (!site) return false;
    this.startBattle(site);
    return this.battles.length > 0;
  }

  /**
   * Kopfgeldjäger und Fahnder: wer bei einer Macht Kopfgeld hat, den jagen ihre Schiffe (höchstens zwei zugleich, im Abstand von
   * etwa 70 bis 120 Sekunden; je höher das Kopfgeld, desto wahrscheinlicher).
   */
  private updateHunters(dt: number) {
    const p = this.player;
    if (!p) return;
    this.huntT -= dt;
    if (this.huntT > 0) return;
    this.huntT = 70 + Math.random() * 50;
    if (this.enemies.filter((e) => e.hunter && e.ship.alive).length >= 2) return;
    let pick: FactionId | null = null, w = 0;
    for (const f of Object.keys(FACTIONS) as FactionId[]) {
      const b = this.bountyOf(f);
      if (b <= 0) continue;
      w += b;
      if (Math.random() * w < b) pick = f;
    }
    if (!pick || Math.random() > Math.min(0.9, w / 1100)) return;
    const e = this.spawnEnemy(p.x, p.z, 'jaeger', undefined, pick, true);
    if (e) this.hooks.message(`${e.name ?? 'Ein Jäger'} hat deine Spur aufgenommen!`);
  }

  /** Gegner bekommen die Enterphase; Legenden (auch Marine-Legenden) und die zwei größten Klassen sind nur durch Entern zu besiegen */
  private arm(e: EnemyShip) {
    e.armed = true;
    const s = e.ship;
    if (e.companion || s === this.player) return;
    s.canDisable = true;
    s.noKill = cannotBeSunk({ tier: Math.max(0, SHIP_CLASSES.indexOf(s.cls)), legend: e.role === 'legende' || !!e.legendId });
  }

  /** Beginn der Enterphase (Wirkung auf die Welt: Knall, Trümmer, Meldung, Bilanz der Schlacht) */
  private onDisabled(e: EnemyShip, byPlayer: boolean) {
    const s = e.ship;
    const p = new Vector3(s.x, s.model.deckY + 2, s.z);
    audio.play('sink', 0.7, s);
    this.fx.shockwave(new Vector3(s.x, 0.5, s.z), s.cls.L * 0.5, '#FF9A3A');
    this.sparks.emit(60, s.x, s.model.deckY + 1, s.z, { speed: 9, up: 9, life: 1.3, color: new Color(3.5, 1.4, 0.35), gravity: 6, spread: s.cls.W });
    this.debris?.splinters(p.x, p.y, p.z, 0, 1, 24, s.look.hull);
    this.smoke?.puff(p.x, p.y, p.z, { n: 8, size: 3, grow: 14, life: 9, tone: 0.2, vy: 3, spread: 2.5, rise: 1.6, alpha: 0.8, glow: 0.9, jitter: s.cls.L * 0.25 });
    this.hooks.shake(byPlayer ? 0.6 : 0.25);
    if (!byPlayer) return;
    const bt = e.battle && e.battle.side !== 2 ? this.battles.find((x) => x.id === e.battle!.id) : undefined;
    if (bt && e.battle && !e.countedSunk) { e.countedSunk = true; bt.engaged = true; bt.stats.sunk[e.battle.side as 0 | 1]++; }
    const name = e.name ?? 'Das Schiff';
    this.overlay.showBanner('Kampfunfähig!', s.noKill ? 'Dieses Schiff geht durch Kanonen nie unter – entere es!' : 'Entere es oder gib ihm den Gnadenstoß');
    this.hooks.message(s.noKill ? `${name} ist besiegt – nur Entern kann es noch erledigen (Kanonen und Kräfte richten nichts mehr aus).` : `${name} ist besiegt: entere es – oder ein weiterer Treffer versenkt es.`);
  }

  /** Sichtweite, ab der ein Schiff angreift (vorher segelt es seine Route) – einmal im Gefecht, bleibt es länger dran */
  private sight(e: EnemyShip) {
    const base = e.hunter ? 1100 : e.raid ? 520 : e.role === 'legende' ? 480 : e.role === 'jaeger' ? 300 : e.ghost ? 320 : 220;
    return e.state === 'engage' ? Math.max(base, 420) : base;
  }

  /** Legende der Rangliste in ihrem Heimatgewässer auftauchen lassen */
  spawnLegend(l: { id: string; n: string; lvl: number; tier: number; col: string; faction: 'pirat' | 'marine' }, x: number, z: number, levelBonus = 0) {
    if (this.enemies.some((e) => e.legendId === l.id && e.ship.alive)) return null;
    const look = DEFAULT_SHIP_LOOK(l.faction);
    look.sail = l.col; look.flagColor = l.col; look.lanterns = true;
    const ship = new Ship(this.scene, Math.min(6, l.tier + 1), look, l.faction, 300 + l.lvl * 40, false, aiEvolution('flaggschiff', dangerOfLevel(l.lvl)));
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
      const ship = new Ship(this.scene, Math.min(4, 1 + Math.floor(level / 3)), look, 'pirat', 120, false, aiEvolution('grenze', dangerOfLevel(level)));
      ship.model.group.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh || Array.isArray(m.material)) return;
        // Kopie behält Anime-Shading und Schatten-Schalter (ein einfaches clone() verliert beides)
        const mat = cloneToon(m.material) as MeshBasicMaterial;
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

  // ---------- Spieler-Flotte (data/playerFleet.ts) ----------

  /** Aktive Begleitschiffe des Spielers in der Reihenfolge der Formationsplätze (Einträge aus dem Spielstand) und ihr Befehl */
  private fleetRecords: FleetShipRecord[] = [];
  fleetOrder: FleetOrder = 'hold';
  /** Das Flaggschiff liegt am Steg oder vor der Küste (Bordleiter) oder der Spieler ist von Bord: die Flotte ankert auf Abstand (setzt die Seewelt je Bild) */
  fleetAnchored = false;
  private readonly fleetPt = { x: 0, z: 0 };
  /** Bewegung des Flaggschiffs für die Formation (Tempo, Drehgeschwindigkeit des Bugs, geglättet) und Arbeitsobjekte */
  private readonly flagMo: FlagMotion = { speed: 0, yawRate: 0 };
  private flagPrevH = Number.NaN;
  private readonly slotOff: FormationOffset = { side: 0, ahead: 0 };
  private readonly escortFlag = { heading: 0, speed: 0, yawRate: 0, side: 0 };
  private readonly flagPoseTmp: FlagPose = { x: 0, z: 0, heading: 0, L: 0, W: 0 };

  /**
   * Die aktiven Begleitschiffe und den Befehl setzen (Spielstand, Werft, Befehlstasten). Schiffe, die nicht mehr aktiv sind, verlassen die Szene (gesunkene
   * beenden ihren Untergang erst); neue laufen in `ensureFleet` aus. `reset`: alle Flottenschiffe entfernen (anderer Spielstand).
   */
  setFleet(records: readonly FleetShipRecord[], order: FleetOrder, reset = false) {
    this.fleetRecords = records.filter((r) => r.status === 'active');
    this.fleetOrder = order;
    keepIf(this.enemies, (e) => {
      if (!e.fleetId) return true;
      if (!reset && (e.ship.sinking > 0 || this.fleetRecords.some((r) => r.fleetShipId === e.fleetId))) return true;
      e.ship.dispose();
      this.overlay.setBar(e, null, -1, false, null);
      return false;
    });
  }

  /** Zustand der ausgelaufenen Flottenschiffe (Rumpf und Segel als Anteil) für Spielstand und Anzeige */
  fleetStatus(): { id: string; hp: number; sailHp: number; alive: boolean }[] {
    const out: { id: string; hp: number; sailHp: number; alive: boolean }[] = [];
    for (const e of this.enemies) if (e.fleetId) out.push({ id: e.fleetId, hp: e.ship.maxHull > 0 ? Math.max(0, e.ship.hull / e.ship.maxHull) : 0, sailHp: e.ship.sail, alive: e.ship.alive && e.ship.sinking <= 0 });
    return out;
  }

  /** Das Schiff einer Flotten-Kennung (falls ausgelaufen) */
  fleetShipOf(id: string): Ship | null { return this.enemies.find((e) => e.fleetId === id)?.ship ?? null; }

  /** Offenes Wasser für ein Schiff der Breite `W`: `clear` Meter Abstand zur Küste (samt Böschung) und zu allen Stegen */
  private freeWater(x: number, z: number, W: number, clear: number): boolean {
    if (this.ground.shipClearance(x, z, W, clear + 10) < clear) return false;
    for (const q of this.ground.piers) if (distToSegment(x, z, q.ax, q.az, q.bx, q.bz) - q.hw - W * 0.5 < clear) return false;
    return true;
  }

  /** Drehgeschwindigkeit des Flaggschiffs aus dem Kurs der letzten Schritte (rad/s, positiv = der Bug dreht nach Backbord), über ~0,3 s geglättet */
  private updateFlagMotion(dt: number) {
    const p = this.player, f = this.flagMo;
    if (!p || dt <= 1e-6) return;
    if (Number.isFinite(this.flagPrevH)) f.yawRate += (wrapAngle(p.heading - this.flagPrevH) / dt - f.yawRate) * Math.min(1, dt * 3.5);
    this.flagPrevH = p.heading;
    f.speed = p.speed;
  }

  private flagPose(p: Ship): FlagPose {
    const f = this.flagPoseTmp;
    f.x = p.x; f.z = p.z; f.heading = p.heading; f.L = p.cls.L; f.W = p.cls.W;
    return f;
  }

  /** Flottenschiffe auslaufen lassen (jedes fehlende, auf seinem Platz der Formation) und im Raid die bezahlten Söldner-Begleiter, die über die eigene Flotte hinausgehen */
  private ensureFleet() {
    const p = this.player;
    if (!p) return;
    for (let i = 0; i < this.fleetRecords.length; i++) {
      const rec = this.fleetRecords[i];
      if (!this.enemies.some((e) => e.fleetId === rec.fleetShipId)) this.spawnFleetShip(rec, i, p);
    }
    const want = Math.max(0, (this.raidEscorts ?? 0) - this.fleetRecords.length);
    const have = this.enemies.filter((e) => e.companion && !e.fleetId && e.ship.alive).length;
    if (have >= want) return;
    const look = { ...p.look };
    const ship = new Ship(this.scene, Math.max(0, Math.min(3, Math.floor(this.playerRank / 3))), look, this.playerFaction);
    ship.x = p.x - Math.sin(p.heading) * 40 + (have ? 20 : -20);
    ship.z = p.z - Math.cos(p.heading) * 40;
    ship.heading = p.heading;
    ship.prev = { x: ship.x, z: ship.z, heading: ship.heading };
    this.enemies.push({ ship, role: 'patrouille', level: this.playerLevel, state: 'engage', wander: { x: 0, z: 0 }, aiT: 0, companion: true });
    this.hooks.message('Ein Söldner-Begleitschiff schließt sich deiner Flotte an!');
  }

  private spawnFleetShip(rec: FleetShipRecord, idx: number, p: Ship) {
    const cls = SHIP_CLASSES[rec.shipClass];
    if (!cls) return;
    const hullBonus = Math.round(cls.hp * (evoStats(rec.evo).hullHpK - 1));
    const ship = new Ship(this.scene, rec.shipClass, { ...rec.look }, this.playerFaction, hullBonus, false, { ...rec.evo });
    ship.hull = ship.maxHull * Math.max(0.05, rec.hp);
    ship.sail = rec.sailHp;
    // Ausfahrt auf dem eigenen Platz der Formation; liegt der an Land oder am Steg, auf der Nachhut oder weiter hinter dem Flaggschiff
    const pt = this.fleetPt, pose = this.flagPose(p);
    let ok = false;
    // liegt das Flaggschiff fest, laufen sie gleich mit dem Ankerabstand aus
    const clear = this.fleetAnchored ? FLEET_ANCHOR_CLEAR : 20;
    for (const slot of [formationSlotOf(idx), 'rear' as const]) { formationPoint(slot, pose, cls, pt); ok = this.freeWater(pt.x, pt.z, cls.W, clear); if (ok) break; }
    for (let back = 100; !ok && back <= 600; back += 100) { pt.x = p.x - Math.sin(p.heading) * back; pt.z = p.z - Math.cos(p.heading) * back; ok = this.freeWater(pt.x, pt.z, cls.W, clear); }
    ship.place(pt.x, pt.z, p.heading);
    ship.speed = p.speed;
    this.enemies.push({ ship, role: 'patrouille', level: this.playerLevel, state: 'patrol', wander: { x: 0, z: 0 }, aiT: 0, companion: true, fleetId: rec.fleetShipId, name: cls.n });
  }

  /** Kanonenschaden eines Begleitschiffs: wie beim Flaggschiff aus Stufe, Klasse und Kanonen-Ausbau, aber `FLEET_DMG_K` schwächer (ohne Offiziers-Fähigkeiten) */
  private fleetDamage(e: EnemyShip): number {
    const tier = Math.max(0, SHIP_CLASSES.indexOf(e.ship.cls));
    return (12 + this.playerLevel * 1.4) * (1 + tier * 0.06) * evoStats(e.ship.evo).cannonDmgK * FLEET_DMG_K;
  }

  /** Nächster Gegner eines Begleitschiffs je Befehl: feindlich (weder friedlich noch Händler noch kampfunfähig), in Reichweite des Schiffs und an der Leine des Flaggschiffs */
  private fleetFoe(e: EnemyShip, p: Ship, order: FleetOrder): Ship | null {
    const r = FLEET_ORDER_RANGE[order], s = e.ship;
    let best = r.self, foe: Ship | null = null;
    for (const o of this.enemies) {
      if (o.companion || o.helper || o.boarded || o.role === 'haendler' || !o.ship.alive || o.ship.sinking > 0 || o.ship.disabled || this.peaceful(o)) continue;
      if (Math.hypot(o.ship.x - p.x, o.ship.z - p.z) > r.leash) continue;
      const d = Math.hypot(o.ship.x - s.x, o.ship.z - s.z);
      if (d < best) { best = d; foe = o.ship; }
    }
    return foe;
  }

  /** Breitseite auf ein Ziel, wenn die Seite zeigt (quer zum Kurs, ±0,3 rad), geladen ist und es in Schussweite steht; `dmg` null = Wert der KI-Stufe */
  private duelFire(e: EnemyShip, target: Ship, dist: number, tier: number, dmgOverride: number | null) {
    const s = e.ship;
    const rel = wrapAngle(Math.atan2(target.x - s.x, target.z - s.z) - s.heading);
    const side = rel > 0 ? 1 : -1;
    const aligned = Math.abs(Math.abs(rel) - Math.PI / 2) < 0.3;
    const ready = side > 0 ? s.reloadL <= 0 : s.reloadR <= 0;
    if (!aligned || !ready || dist >= fireRangeOf(tier) || s.ceasefire > 0 || s.frozen > 0) return;
    // Vorhalt ohne Vektor: das Ziel läuft, während die Kugel fliegt
    const lt = dist / BALL_SPEED;
    const range = Math.hypot(target.x + Math.sin(target.heading) * target.speed * lt - s.x, target.z + Math.cos(target.heading) * target.speed * lt - s.z);
    const cal = aiCannon(e.level, e.role === 'legende');
    this.broadside(s, side, range, dmgOverride ?? cal.dmg, e.role === 'legende' && Math.random() < 0.3 ? 'brand' : 'kugel');
    const reload = cal.reload * s.reloadScale;
    if (side > 0) s.reloadL = reload; else s.reloadR = reload;
  }

  /**
   * Ein Flottenschiff des Spielers: ankern, wenn das Flaggschiff festgemacht hat; sonst je Befehl – `hold` Formation und Selbstverteidigung, `attack` Gegner in Reichweite
   * angreifen (Breitseite, ab Rumpf-Stufe 4 Rammsporn), `rally` mit allem Tuch zurück auf den Platz, ohne zu feuern. Nachzügler weit hinten werden auf ihren Platz gesetzt.
   */
  private aiFleet(e: EnemyShip, nav: AiNavState, dt: number): number {
    const s = e.ship, p = this.player!;
    const self = this.steerSelf, tgt = this.steerTgt, cmd = this.steerCmd, goal = this.steerGoal;
    const idx = Math.max(0, this.fleetRecords.findIndex((r) => r.fleetShipId === e.fleetId));
    // Platz in der Formation; in einer engen Kurve fällt die Innenseite in die Kiellinie zurück (hinter die Nachhut, wenn dort schon ein Schiff fährt)
    const rear = this.fleetRecords[2];
    const behindRear = rear && idx !== 2 ? 0.5 * (SHIP_CLASSES[rear.shipClass].L + s.cls.L) + 20 : 0;
    formationPoint(formationSlotOf(idx), this.flagPose(p), s.cls, goal, this.flagMo, behindRear, this.slotOff);
    const gx = goal.x, gz = goal.z;
    s.speedCap = null;
    if (Math.hypot(p.x - s.x, p.z - s.z) > FLEET_RECALL_DIST && this.freeWater(gx, gz, s.cls.W, 20)) { s.place(gx, gz, p.heading); s.speed = p.speed; }
    this.fillSteerSelf(e, self);
    if (this.fleetAnchored) {
      this.steering.anchor(nav, self, gx, gz, FLEET_ANCHOR_CLEAR, dt, cmd);
      s.aiSail = cmd.sail;
      if (cmd.hold) { s.speedCap = 0; if (s.speed < 0.6) s.speed = 0; }
      e.state = 'patrol';
      return cmd.turn;
    }
    nav.anchorSet = false;
    const order = this.fleetOrder;
    const foe = order === 'rally' ? null : this.fleetFoe(e, p, order);
    const tier = Math.max(0, SHIP_CLASSES.indexOf(s.cls));
    if (foe && order === 'attack') {
      this.fillSteerTarget(foe, tgt);
      this.stagger(nav, s);
      this.steering.fight(nav, self, tgt, dt, cmd);
      s.aiSail = cmd.sail;
      e.state = cmd.state === 'DISENGAGE' ? 'flee' : 'engage';
      if (cmd.state !== 'DISENGAGE') this.duelFire(e, foe, cmd.dist, tier, this.fleetDamage(e));
      return cmd.turn;
    }
    const ef = this.escortFlag;
    ef.heading = p.heading; ef.speed = p.speed; ef.yawRate = this.flagMo.yawRate; ef.side = this.slotOff.side;
    this.steering.escort(nav, self, gx, gz, ef, order === 'rally', dt, cmd);
    s.aiSail = cmd.sail;
    // Steht das Flaggschiff, steht die Flotte auf ihren Plätzen (Tempo 0)
    if (cmd.hold) { s.speedCap = 0; if (s.speed < 0.6) s.speed = 0; }
    e.state = 'patrol';
    if (foe) this.duelFire(e, foe, Math.hypot(foe.x - s.x, foe.z - s.z), tier, this.fleetDamage(e));
    return cmd.turn;
  }

  // ---------- Schleife ----------

  update(dt: number, active: boolean) {
    const p = this.player;
    this.trainCd -= dt;
    if (p && active) {
      // Begegnungen statt Dauerbeschuss: nach einem Gefecht kehrt erst Ruhe ein, neue Schiffe kommen vom Horizont
      const fighting = this.enemies.some((e) => !e.companion && !e.battle && e.ship.alive && !e.ship.sinking && e.state === 'engage' && e.role !== 'haendler');
      if (!fighting) this.spawnT -= dt;
      else this.spawnT = Math.max(this.spawnT, 20 + Math.random() * 10);
      const zone = this.zoneLevel(p.x, p.z);
      // nur Schiffe in der Nähe zählen (vorbeigesegelte nicht), Händler halb
      const present = this.enemies.reduce((n, e) => n + (!e.companion && !e.battle && !e.hunter && e.ship.alive && !e.legendId && !e.station && Math.hypot(e.ship.x - p.x, e.ship.z - p.z) < 650 ? (e.role === 'haendler' ? 0.5 : 1) : 0), 0);
      const cap = zone <= 2 ? 2 : zone <= 6 ? 3 : 4;
      if (!this.raidMode && this.spawnT <= 0 && present < cap) {
        this.spawnT = (zone <= 2 ? 30 : 25) + Math.random() * 30;
        this.spawnEnemy(p.x, p.z);
      }
      this.ensureFleet();
      if (!this.raidMode) { this.ensureBorderPatrols(dt); this.updateHunters(dt); }
    }
    this.updateBattles(dt, !!p && active);
    for (const e of this.enemies) {
      if (!e.armed) this.arm(e);
      // Wer lange ohne Spieler brennt (kein Kommandoschiff), geht nach 150 s weit weg vom Spieler von selbst unter
      if (e.ship.disabled && !e.ship.noKill && !e.boarded && e.ship.disabledFor > 150 && e.ship.sinking <= 0 && (!p || Math.hypot(e.ship.x - p.x, e.ship.z - p.z) > 350)) { e.ship.hull = 0; this.sink(e.ship); }
    }
    this.registerObstacles();
    this.updateFlagMotion(dt);
    for (const e of this.enemies) this.ai(e, dt);
    for (const e of this.enemies) this.damageFx(e.ship, dt);
    if (p) this.damageFx(p, dt);
    // Weit entfernte entfernen, gesunkene aufräumen
    const gone = (e: EnemyShip) => e.ship.sinking > 9 || (!!p && !e.companion && !e.raid && Math.hypot(e.ship.x - p.x, e.ship.z - p.z) > (e.battle ? 1900 : e.state === 'engage' || e.legendId ? 1200 : 900));
    keepIf(this.enemies, (e) => {
      if (!gone(e)) return true;
      e.ship.dispose();
      this.overlay.setBar(e, null, -1, false, null);
      return false;
    });
    if (p && active) { this.updateRamming(); this.updateSwivels(dt); }
    this.updateBalls(dt);
    this.updateCrates(dt);
    this.efx.update(dt);
    this.updateShots(dt);
    if (this.timers.length) {
      // nur wenn wirklich etwas fällig ist, eine kleine Liste bilden (sonst kein neues Array pro Schritt)
      let anyDue = false;
      for (const x of this.timers) { x.t -= dt; if (x.t <= 0) anyDue = true; }
      if (anyDue) {
        const due = this.timers.filter((x) => x.t <= 0);
        keepIf(this.timers, (x) => x.t > 0);
        for (const x of due) x.fn();
      }
    }
    for (const w of this.waves) {
      w.t += dt;
      const k = w.t / w.max;
      (w.mesh.material as MeshBasicMaterial).opacity = Math.max(0, 1 - k) * 0.95;
      w.mesh.scale.y = 1 + k * 0.6;
      if (k >= 1) { w.mesh.removeFromParent(); w.mesh.geometry.dispose(); (w.mesh.material as MeshBasicMaterial).dispose(); }
    }
    keepIf(this.waves, (w) => w.t < w.max);
  }

  // ---------- Rammsporn und Deck-Drehbassen (Schiffs-Evolution, naval/ramming.ts) ----------

  private ramCd = new Map<string, number>();
  private swivelCd = new Map<string, number>();
  /** Zielzustand der Drehbassen je Schiff: Ziel, Zeitpunkt des Schusses, bis wann sie noch auf das Ziel zeigen */
  private swivelAim = new Map<string, { t: Ship; fireAt: number; until: number; fired: boolean }>();

  private kin(s: Ship): Kin { return { x: s.x, z: s.z, heading: s.heading, course: s.course, speed: s.speed, L: s.cls.L, W: s.cls.W }; }
  /** Schiff, das den Spieler angreifen darf: im Gefecht, Jäger, gereizt oder Raid-Wache (friedliche Schiffe rammen und beschießen nie von selbst) */
  private hostileAI(e: EnemyShip) { return e.state === 'engage' || !!e.hunter || !!e.provoked || !!e.raid; }

  /** Der Spieler hat ein Schiff gerammt oder mit Drehbassen beschossen: Marine und Mächte werden feindlich (wie bei Kanonenschüssen) */
  private provokeBy(s: Ship, how: string) {
    const en = this.enemies.find((o) => o.ship === s);
    if (!en) return;
    if (en.power === 'marine' && !en.provoked) { en.provoked = true; if (!en.companion) this.hooks.message(`${how} ein Schiff der Marine – sie wird dich jagen!`); }
    else if (en.power && !en.provoked && !en.companion) en.provoked = true;
    en.lastPlayerHit = this.clock;
  }

  /** Folgen eines Treffers ohne Kugel: Untergang oder Enterphase auslösen */
  private afterHit(s: Ship, wasDisabled: boolean, byPlayer: boolean) {
    if (!s.alive) { this.sink(s); return; }
    const en = this.enemies.find((o) => o.ship === s);
    if (en && !wasDisabled && s.disabled) this.onDisabled(en, byPlayer);
  }

  /**
   * Rammen: Freunde (Spieler, Begleiter) gegen Gegner und kampfbereite Gegner gegen Freunde. Der Bug-Kegel prüft `ramContact`; Schaden und Eigenschaden
   * rechnet `ramDamage` (Rumpf-Stufe ≥ 4 = Rammsporn: voller Schaden, nur 30 % Eigenschaden gegenüber einem Schiff ohne Sporn, Stufe 5 panzerbrechend).
   */
  private updateRamming() {
    const p = this.player;
    if (!p) return;
    const live = (s: Ship) => s.alive && s.sinking <= 0 && !s.moored;
    const friends: Ship[] = [p, ...this.enemies.filter((e) => (e.companion || e.helper) && live(e.ship)).map((e) => e.ship)].filter(live);
    const foes = this.enemies.filter((e) => !e.companion && !e.helper && !e.battle && !e.boarded && live(e.ship));
    for (const f of friends) for (const e of foes) {
      this.tryRam(f, e.ship);
      if (this.hostileAI(e) && !e.ship.disabled) this.tryRam(e.ship, f);
    }
    // KI gegen KI: ein Schiff einer Seeschlacht im Rammangriff (Rumpf-Stufe ≥ 4, `RAM_CHARGE`) stößt sein Kampfziel; beide Rümpfe nehmen Schaden und prallen ab (Gegenstoß)
    for (const e of this.enemies) {
      if (!e.battle || !live(e.ship) || e.nav?.aiState !== 'RAM_CHARGE') continue;
      const foe = this.battleFoe(e);
      if (foe && live(foe) && aiMayRam({ aiState: e.nav.aiState, hullTier: e.ship.evo.hullTier, disabled: e.ship.disabled }, foe)) this.tryRam(e.ship, foe);
    }
    // Pausen vergangener Paare aufräumen
    if (this.ramCd.size > 64) for (const [k, t] of this.ramCd) if (t < this.clock) this.ramCd.delete(k);
  }

  private tryRam(a: Ship, b: Ship) {
    if (a.speed < RAM.minSpeed * 0.5 && b.speed < RAM.minSpeed * 0.5) return;
    if (Math.hypot(a.x - b.x, a.z - b.z) > (a.cls.L + b.cls.L) * 0.6) return;
    const key = `${a.entityId}>${b.entityId}`;
    if ((this.ramCd.get(key) ?? -1) > this.clock) return;
    const c = ramContact(this.kin(a), this.kin(b));
    if (!c.hit) return;
    this.ramCd.set(key, this.clock + RAM.cooldown);
    const d = ramDamage(c.relSpeed, a.maxHull, a.evo.hullTier);
    const fx = Math.sin(a.heading), fz = Math.cos(a.heading), tfx = Math.sin(b.heading), tfz = Math.cos(b.heading);
    const ex = c.x - b.x, ez = c.z - b.z;
    const local = new Vector3(ex * tfz - ez * tfx, 0, ex * tfx + ez * tfz);
    const wasB = b.disabled, wasA = a.disabled;
    const byPlayer = a === this.player;
    const dealt = b.ramHit(d.target, d.pen, local);
    const rammer = this.enemies.find((o) => o.ship === a);
    if (rammer?.nav) noteRam(rammer.nav);
    const self = a.ramHit(d.self, null, new Vector3(0, 0, a.cls.L * 0.5));
    a.speed *= RAM.rammerSlow;
    b.speed *= RAM.targetSlow;
    // Abprall: Hüllen auseinanderschieben und das Zielschiff seitlich wegdrücken, der Rammer federt zurück (Massen = Rumpfpunkte)
    const imp = ramImpulse(c, a.maxHull, b.maxHull);
    a.x += imp.sepA.x; a.z += imp.sepA.z; b.x += imp.sepB.x; b.z += imp.sepB.z;
    a.shoveX += imp.shoveA.x; a.shoveZ += imp.shoveA.z; b.shoveX += imp.shoveB.x; b.shoveZ += imp.shoveB.z;
    this.debris?.splinters(c.x, 1.3, c.z, fx, fz, d.ram ? 18 : 9, b.look.hull);
    this.smoke?.puff(c.x, 1.5, c.z, { n: 3, size: 1.8, grow: 6, life: 3, tone: 0.5, spread: 1.2, rise: 0.8, alpha: 0.7 });
    this.sparks.emit(d.ram ? 16 : 8, c.x, 1.4, c.z, { speed: 6, up: 4, life: 0.8, color: new Color(0.55, 0.36, 0.2), gravity: 14, spread: 0.4 });
    audio.play('crack', 1, { x: c.x, z: c.z });
    if (a === this.player || b === this.player) {
      this.hooks.shake(d.ram && byPlayer ? 0.75 : 0.55);
      this.hooks.hitstop(0.07);
      if (b === this.player || (a === this.player && self > 0)) this.overlay.hurt();
      if (dealt > 0) this.overlay.number(new Vector3(c.x, 3, c.z), Math.round(dealt), b === this.player ? 'hurt' : 'hit');
      if (self > 0) this.overlay.number(new Vector3(a.x, 3.6, a.z), Math.round(self), a === this.player ? 'hurt' : 'hit');
      if (byPlayer) this.hooks.message(d.ram ? `Rammstoß! ${Math.round(dealt)} Rumpfschaden, dein Rammsporn hält.` : `Zusammenstoß! Ohne Rammsporn leidet dein Schiff selbst (${Math.round(self)} Rumpfschaden).`);
    }
    if (byPlayer) { this.provokeBy(b, 'Du hast gerammt:'); this.noteBattleHit(b, dealt); }
    this.afterHit(b, wasB, byPlayer);
    this.afterHit(a, wasA, false);
  }

  /**
   * Deck-Drehbassen (Kanonen-Stufe ≥ 4): feuern von selbst Kartätschen auf feindliche Schiffe im Umkreis von 45 m (Crew, etwas Tuch, wenig Rumpf),
   * mit eigener Pause je Schiff. Friedliche und kampfunfähige Schiffe sowie geenterte werden verschont.
   */
  private updateSwivels(dt: number) {
    const p = this.player;
    if (!p) return;
    if (this.swivelAim.size > 64) for (const [k, v] of this.swivelAim) if (v.until < this.clock) this.swivelAim.delete(k);
    const live = (s: Ship) => s.alive && s.sinking <= 0 && !s.moored;
    type Shooter = { ship: Ship; e: EnemyShip | null };
    const shooters: Shooter[] = [];
    if (live(p) && !p.disabled) shooters.push({ ship: p, e: null });
    for (const e of this.enemies) if (live(e.ship) && !e.ship.disabled && !e.boarded) shooters.push({ ship: e.ship, e });
    for (const sh of shooters) {
      const s = sh.ship;
      if (!hasSwivels(s.evo.cannonTier)) continue;
      // Zielen in jedem Bild: auf das letzte Ziel, solange es gilt, sonst zurück in die Ruhestellung; der Schuss fällt, sobald die Rohre schwenken konnten
      const st = this.swivelAim.get(s.entityId);
      const tgt = st && st.until > this.clock && st.t.alive && st.t.sinking <= 0 ? st.t : null;
      this.aimSwivels(s, tgt, dt);
      if (st && !st.fired && tgt) {
        if (this.clock >= st.fireAt) { st.fired = true; this.fireSwivels(s, tgt, sh.e, p); }
        continue;
      }
      const friend = sh.e === null || sh.e.companion || sh.e.helper;
      if (!friend && !this.hostileAI(sh.e!)) continue;
      if ((this.swivelCd.get(s.entityId) ?? 0) > this.clock) continue;
      const foeShips: Ship[] = friend
        ? this.enemies.filter((o) => !o.companion && !o.helper && !o.battle && !o.boarded && live(o.ship) && !o.ship.disabled && this.hostileAI(o)).map((o) => o.ship)
        : [p, ...this.enemies.filter((o) => (o.companion || o.helper) && live(o.ship)).map((o) => o.ship)].filter((x) => live(x));
      const k = swivelTarget({ x: s.x, z: s.z, L: s.cls.L }, foeShips.map((t) => ({ x: t.x, z: t.z, L: t.cls.L })));
      if (k < 0) continue;
      this.swivelCd.set(s.entityId, this.clock + swivelCooldown(s.evo.cannonTier) * (0.9 + Math.random() * 0.2));
      // Ziel merken: die Drehbassen schwenken sofort, der Schuss fällt nach `SWIVEL_AIM_T` Sekunden (die Pause läuft ab jetzt)
      this.swivelAim.set(s.entityId, { t: foeShips[k], fireAt: this.clock + SWIVEL_AIM_T, until: this.clock + SWIVEL_HOLD_T, fired: false });
    }
  }

  /** Schwenkt die Drehbassen eines Schiffs auf das Ziel (nur Rohre an der Zielseite) oder zurück nach außen; setzt nur Drehwinkel, nichts wird neu angelegt */
  private aimSwivels(s: Ship, t: Ship | null, dt: number) {
    const ms = s.model.swivels;
    if (!ms.length) return;
    let lx = 0, lz = 0;
    if (t) {
      // Ziel im Schiffskoordinatensystem (+x = Backbord, +z = voraus)
      const dx = t.x - s.x, dz = t.z - s.z, c = Math.cos(s.heading), sn = Math.sin(s.heading);
      lx = dx * c - dz * sn; lz = dx * sn + dz * c;
    }
    const k = 1 - Math.exp(-9 * dt);
    for (const m of ms) {
      let want = 0;
      if (t && m.side * lx > 0) want = Math.max(-1.25, Math.min(1.25, Math.atan2(-m.side * (lz - m.z), m.side * (lx - m.x))));
      const r = m.mount.rotation;
      r.y += (want - r.y) * k;
      m.aim = r.y;
    }
  }

  /** Mündung einer Drehbasse in Weltkoordinaten (mit dem aktuellen Halterwinkel) */
  private swivelMuzzle(s: Ship, m: SwivelMount, out: Vector3): Vector3 {
    out.copy(m.muzzle).applyAxisAngle(AXIS_UP, m.mount.rotation.y).add(m.mount.position);
    return s.model.group.localToWorld(out);
  }

  /** Der Schuss: Schaden auf das Ziel (Kartätsche auf Rumpf), Mündungsfeuer, Pulverdampf und Leuchtspuren, Meldungen und Folgen */
  private fireSwivels(s: Ship, t: Ship, e: EnemyShip | null, p: Ship) {
    const dx = t.x - s.x, dz = t.z - s.z, dl = Math.hypot(dx, dz) || 1;
    const base = swivelDamage(e && !e.companion ? aiCannon(e.level).dmg : this.canDmg * (e ? 0.6 : 1));
    const local = new Vector3((Math.random() - 0.5) * t.cls.W * 0.8, 0, (Math.random() - 0.5) * t.cls.L * 0.6);
    const wasT = t.disabled;
    const dealt = t.damage(base, 'kartaetsche', local, 'hull', SWIVEL.pen);
    this.swivelFx(s, t, dx / dl, dz / dl);
    audio.play('crack', 0.45, { x: s.x, z: s.z });
    if (s === p || t === p) {
      if (dealt > 0) this.overlay.number(new Vector3(t.x, 3.2, t.z), Math.round(dealt), t === p ? 'hurt' : 'hit');
      if (t === p) this.overlay.hurt();
    }
    if (s === p) { this.provokeBy(t, 'Deine Drehbassen haben auf'); this.noteBattleHit(t, dealt); }
    this.afterHit(t, wasT, s === p);
  }

  /** Darstellung eines Drehbassen-Schusses: jede Drehbasse an der Zielseite blitzt, qualmt und schickt eine Reihe glühender Kartätschenkugeln zum Ziel */
  private swivelFx(s: Ship, t: Ship, nx: number, nz: number) {
    const pl = this.player;
    const far = !!pl && s !== pl && t !== pl && Math.hypot(s.x - pl.x, s.z - pl.z) > FAR_FX;
    const lx = nx * Math.cos(s.heading) - nz * Math.sin(s.heading);       // Zielseite im Schiffssystem
    let n = 0;
    for (const m of s.model.swivels) {
      if (m.side * lx <= 0) continue;
      const w = this.swivelMuzzle(s, m, _mz);
      n++;
      const ox = t.x - w.x, oz = t.z - w.z, ol = Math.hypot(ox, oz) || 1, ux = ox / ol, uz = oz / ol;
      if (far) { if (n === 1) this.smoke?.puff(w.x, w.y, w.z, { n: 1, size: 1.6, grow: 6, life: 4, tone: 0.84, vx: ux * 6, vz: uz * 6, spread: 0.6, rise: 0.3, drag: 1.4, alpha: 0.45, wind: 0.9, jitter: 0.5 }); continue; }
      this.sparks.emit(6, w.x + ux * 0.4, w.y, w.z + uz * 0.4, { speed: 4, up: 0.8, life: 0.22, color: SWIVEL_FLASH, gravity: 0, spread: 0.25 });
      if (n === 1) this.fx.hit(new Vector3(w.x + ux * 0.7, w.y, w.z + uz * 0.7), 'punch', '#FFB45A', true);
      this.smoke?.puff(w.x + ux * 0.6, w.y, w.z + uz * 0.6, { n: 2, size: 0.8, grow: 3.4, life: 2.2, tone: 0.78, vx: ux * 5, vy: 0.3, vz: uz * 5, spread: 0.4, rise: 0.5, drag: 1.4, alpha: 0.5, wind: 0.9, jitter: 0.3 });
      // Leuchtspur: fünf schnelle Funken entlang der Schusslinie bis kurz vor die Bordwand des Ziels, nach hinten breiter (Kartätschenstreuung)
      const reach = Math.max(2, Math.min(SWIVEL.range, ol - t.cls.W * 0.45));
      for (let i = 0; i < 5; i++) {
        const d = reach * (i + 0.5) / 5;
        this.sparks.emit(1, w.x + ux * d, w.y, w.z + uz * d, { speed: 0, up: 0, life: 0.2, color: SWIVEL_TRACER, gravity: 0, spread: 0.1 + d * 0.035, size: 0.55, vx: ux * 70, vz: uz * 70 });
      }
    }
    if (n === 0 && !far) {
      // ohne sichtbare Rohre (Sicherheitsnetz): wie bisher aus Schiffsmitte in Zielrichtung
      const mx = s.x + nx * s.cls.W * 0.4, mz = s.z + nz * s.cls.W * 0.4;
      this.smoke?.puff(mx, 2.2, mz, { n: 2, size: 0.9, grow: 3.5, life: 1.6, tone: 0.6, vx: nx * 4, vz: nz * 4, spread: 0.6, rise: 0.6, alpha: 0.6 });
      this.sparks.emit(6, mx, 2.2, mz, { speed: 5, up: 1.5, life: 0.4, color: SWIVEL_FLASH, gravity: 8, spread: 0.5 });
    }
  }

  /** Rauch und Glut über beschädigten, brennenden und sinkenden Schiffen – von weitem sichtbar */
  private damageFx(s: Ship, dt: number) {
    const sm = this.smoke;
    if (!sm || (!s.alive && s.sinking <= 0) || s.sinking > 8) return;
    const frac = s.maxHull > 0 ? s.hull / s.maxHull : 0;
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const deck = s.model.group.position.y + s.model.deckY;
    const at = () => { const k = (Math.random() - 0.5) * s.cls.L * 0.6; return { x: s.x + fx * k, z: s.z + fz * k }; };
    if (s.disabled && s.sinking <= 0) {
      // Enterphase: das ganze Deck brennt – Flammenzungen an mehreren Stellen, dicker schwarzer Qualm, Funkenflug
      for (let k = 0; k < 3; k++) {
        if (Math.random() < dt * 14) {
          const q = at();
          sm.puff(q.x, deck + 0.4, q.z, { n: 1, size: 1.3, grow: 5, life: 1.3, tone: new Color(1.0, 0.5, 0.12), vy: 4, spread: 0.5, rise: 2.2, drag: 0.6, alpha: 0.9, glow: 2, wind: 0.6, jitter: s.cls.W * 0.28 });
        }
      }
      if (Math.random() < dt * 12) {
        const q = at();
        sm.puff(q.x, deck + 1.2, q.z, { size: 2.2, grow: 16, life: 10, tone: 0.1, vy: 3, spread: 0.6, rise: 1.8, drag: 0.8, alpha: 0.85, glow: 0.4, wind: 1.1, jitter: s.cls.W * 0.3 });
      }
      if (Math.random() < dt * 24) {
        const q = at();
        this.sparks.emit(3, q.x, deck + 0.6, q.z, { speed: 1.2, up: 6, life: 1.1, color: new Color(3.4, 1.3, 0.3), gravity: -2.5, spread: s.cls.W * 0.35 });
      }
      if (s.crashed) {
        s.crashed = false;
        this.debris?.splinters(s.x, deck + 1, s.z, 0, 1, 20, s.look.hull);
        this.spray.emit(40, s.x, 1, s.z, { speed: 6, up: 8, life: 1.6, color: new Color(0.95, 0.98, 1), spread: s.cls.W });
        audio.play('crack', 0.9, s);
      }
      return;
    }
    if (s.fire > 0 || s.sinking > 0) {
      if (Math.random() < dt * 9) {
        const q = at();
        sm.puff(q.x, deck + 0.8, q.z, { size: 1.8, grow: 13, life: 8, tone: 0.16, vy: 2.5, spread: 0.6, rise: 1.5, drag: 0.9, alpha: 0.75, glow: 0.9, wind: 1, jitter: s.cls.W * 0.25 });
      }
      if (Math.random() < dt * 18) {
        const q = at();
        this.sparks.emit(2, q.x, deck + 0.5, q.z, { speed: 0.8, up: 4.5, life: 0.9, color: new Color(3.2, 1.3, 0.3), gravity: -2.5, spread: s.cls.W * 0.3 });
      }
    } else if (frac < 0.55) {
      // je schlimmer der Schaden, desto dichter der Qualm
      if (Math.random() < dt * (1.5 + (0.55 - frac) * 10)) {
        const q = at();
        sm.puff(q.x, deck + 0.5, q.z, { size: 1, grow: 6, life: 5, tone: frac < 0.3 ? 0.3 : 0.5, vy: 1.5, spread: 0.4, rise: 1, alpha: 0.5, wind: 1, jitter: s.cls.W * 0.2 });
      }
    }
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

  // ---------- KI-Lenkung (naval/shipSteering.ts) ----------

  /** Arbeitsobjekte der Lenkung: nichts davon wird je Bild neu angelegt */
  private readonly steerSelf = newSteerSelf();
  private readonly steerTgt = newSteerTarget();
  private readonly steerCmd = newSteerCommand();
  private readonly steerGoal = { x: 0, z: 0 };

  /** Das lenkende Schiff für die Lenkung beschreiben (Zahlen aus Schiff, Ausbaustufen und Segelzustand) */
  private fillSteerSelf(e: EnemyShip, o: SteerSelf, flee = false, ramOk = !e.battle && !e.training) {
    const s = e.ship;
    o.id = s.entityId; o.x = s.x; o.z = s.z; o.heading = s.heading; o.speed = s.speed;
    o.L = s.cls.L; o.W = s.cls.W; o.classTier = Math.max(0, SHIP_CLASSES.indexOf(s.cls)); o.mass = s.maxHull;
    o.hullFrac = s.maxHull > 0 ? s.hull / s.maxHull : 0; o.sailFrac = s.sail; o.hullTier = s.evo.hullTier;
    o.turnMult = s.turnMult; o.turnK = s.evoS.turnK; o.perfTurn = s.perf.turn;
    o.vFull = s.cls.spd * SEA_SPEED * s.evoS.speedK * s.perf.speed;
    o.upwindK = s.evoS.upwindK; o.speedCap = s.speedCap ?? 99;
    o.reloadL = s.reloadL; o.reloadR = s.reloadR;
    // Wer nie flieht: Legenden, Wachschiffe und Rückeroberungsflotten, Begleiter, Geisterschiffe, das Übungsschiff der Einführung
    o.brave = e.role === 'legende' || !!e.raid || (!!e.companion && !e.fleetId) || !!e.ghost || !!e.training;
    // Rammstöße wertet `updateRamming` aus: Spieler gegen Feinde, Begleiter und Helfer gegen Feinde und – seit 4.3.1 – die Schiffe einer Seeschlacht gegeneinander
    // (Ziel = anderes Schlachtschiff). Zielt ein Schlachtschiff auf den Spieler, gilt der Stoß nicht: dort fehlt die Auswertung
    o.canRam = ramOk;
    o.flee = flee;
  }

  private fillSteerTarget(t: Ship, o: SteerTarget) {
    o.id = t.entityId; o.x = t.x; o.z = t.z; o.heading = t.heading; o.speed = t.speed;
    o.L = t.cls.L; o.W = t.cls.W; o.mass = t.maxHull; o.disabled = t.disabled;
  }

  /** Befehl der Lenkung umsetzen: stufenloses Segel, Zustand für den Rest des Spiels; liefert das Ruder */
  private applyCmd(e: EnemyShip, cmd: SteerCommand, setState = true): number {
    e.ship.aiSail = cmd.sail;
    if (setState) e.state = cmd.state === 'TRANSIT' ? 'patrol' : cmd.state === 'DISENGAGE' ? 'flee' : 'engage';
    return cmd.turn;
  }

  /** Ein Gefecht beginnt: die Seiten laden unterschiedlich weit nach, damit nicht alle Schiffe gleichzeitig feuern */
  private stagger(nav: AiNavState, s: Ship) {
    if (nav.aiState !== 'TRANSIT') return;
    const w = Math.random() * 2;
    if (s.reloadL < w) s.reloadL = w;
    if (s.reloadR < w) s.reloadR = w;
  }

  /** Neuer Weg für Streifen und Händler: auf freier Strecke (Küsten, Stege, Mauern, Weltrand), sonst gedreht; setzt den Fortschritt zurück */
  private setWander(e: EnemyShip, nav: AiNavState, self: SteerSelf, x: number, z: number) {
    this.steering.reachableGoal(self, x, z, this.steerGoal);
    e.wander.x = this.steerGoal.x; e.wander.z = this.steerGoal.z;
    resetGoal(nav);
  }

  /** Alle Schiffe außer den Flottenschiffen des Spielers: Streifen, Händler, Feinde, Seeschlachten und Söldner-Begleiter. Liefert das Ruder. */
  private aiGeneral(e: EnemyShip, nav: AiNavState, dt: number): number {
    const s = e.ship;
    const p = this.player;
    const self = this.steerSelf, tgt = this.steerTgt, cmd = this.steerCmd;
    let turn = 0;
    // Ziel: Begleiter kämpfen gegen Feinde, Feinde gegen den Spieler (und Begleiter); Schiffe einer Seeschlacht gegeneinander
    let target: Ship | null = null;
    /** Schiff gegen Schiff (Seeschlacht, Marine-Hilfe): kämpft wie ein Begleiter gegen sein Ziel */
    let duel = false;
    if (e.battle) {
      const foe = this.battleFoe(e);
      const dp = p?.alive ? Math.hypot(p.x - s.x, p.z - s.z) : 9999;
      // wer vom Spieler beschossen wurde (oder ihm feindlich gesinnt ist), wendet sich ihm zu, sobald er nah ist
      if (p?.alive && dp < 220 && (e.provoked || (!!e.power && isHostile(this.standingOf(e.power))))) target = p;
      else if (foe) { target = foe; duel = true; }
    } else if (!e.companion && !e.raid && !e.hunter && e.power === 'marine' && p?.alive && this.marineService() && this.peaceful(e)) {
      // Dienststatus: die Marine hilft im Kampf gegen Schiffe, die den Spieler bedrohen
      const foe = this.helperFoe(e, p);
      e.helper = !!foe;
      if (foe) { target = foe; duel = true; }
    } else if (e.companion) {
      let best = 260;
      for (const o of this.enemies) if (!o.companion && o.ship.alive && !o.ship.disabled && o.role !== 'haendler') { const d = Math.hypot(o.ship.x - s.x, o.ship.z - s.z); if (d < best) { best = d; target = o.ship; } }
    } else if (p?.alive && e.role !== 'haendler' && !this.peaceful(e)) target = p;
    const dist = target ? Math.hypot(target.x - s.x, target.z - s.z) : 9999;

    if (e.companion && !target && p) {
      // In Formation hinter dem Spieler (der Platz liegt oft im Wendekreis: die Lenkung refft, statt zu kreisen)
      const fx = p.x - Math.sin(p.heading) * 35 + Math.cos(p.heading) * 18, fz = p.z - Math.cos(p.heading) * 35 - Math.sin(p.heading) * 18;
      this.fillSteerSelf(e, self);
      this.steering.cruise(nav, self, fx, fz, Math.hypot(fx - s.x, fz - s.z) > 30 ? 1 : 0.55, 12, p.entityId, dt, cmd);
      turn = this.applyCmd(e, cmd, false);
    } else if (e.role === 'haendler') {
      const threatened = !!p && (Math.hypot(p.x - s.x, p.z - s.z) < 120 || s.hull < s.maxHull);
      s.speedCap = 11 - Math.max(0, SHIP_CLASSES.indexOf(s.cls)) * 0.4;
      this.fillSteerSelf(e, self, threatened);
      if (threatened && p) {
        // Flucht: weg vom Spieler mit allem Tuch, mindestens 4 bis 6 s lang
        this.fillSteerTarget(p, tgt);
        this.steering.fight(nav, self, tgt, dt, cmd);
      } else {
        const ar = Math.max(30, arriveRadius(self));
        if (e.aiT <= 0 || nav.replan || Math.hypot(e.wander.x - s.x, e.wander.z - s.z) < ar) { e.aiT = 20; this.setWander(e, nav, self, s.x + (Math.random() - 0.5) * 600, s.z + (Math.random() - 0.5) * 600); }
        this.steering.cruise(nav, self, e.wander.x, e.wander.z, 0.55, ar, null, dt, cmd);
      }
      turn = this.applyCmd(e, cmd);
    } else if (target && !e.companion && !duel && dist < this.sight(e)) {
      // Wie in 1.0: in Breitseitenabstand umkreisen, feuern, sobald eine Seite zeigt – jetzt mit Zustandsmaschine (Anmarsch, Umkreisen, Rammen, Rückzug)
      const tier = Math.max(0, SHIP_CLASSES.indexOf(s.cls));
      s.speedCap = (14.5 - tier * 0.4 + (e.role === 'legende' ? 2 : 0) + (e.ghost ? 1 : 0)) * (this.isWeak(e) ? 0.45 : 1);
      if (this.isWeak(e) && !e.weakNoted) { e.weakNoted = true; this.hooks.message(`${e.name ?? 'Das Schiff'} ist schwer angeschlagen – fahr heran und entere es!`); }
      this.fillSteerSelf(e, self);
      this.fillSteerTarget(target, tgt);
      this.stagger(nav, s);
      this.steering.fight(nav, self, tgt, dt, cmd);
      turn = this.applyCmd(e, cmd);
      if (cmd.state !== 'DISENGAGE' && dist < fireRangeOf(tier) && s.ceasefire <= 0 && s.frozen <= 0) {
        const toP = Math.atan2(target.x - s.x, target.z - s.z);
        for (let k = 0; k < 2; k++) {
          const side = k === 0 ? -1 : 1;
          if ((side > 0 ? s.reloadL : s.reloadR) > 0) continue;
          if (Math.abs(wrapAngle(s.heading + side * Math.PI / 2 - toP)) > 0.4) continue;
          const lv = e.level;
          const dmg = (6 + tier * 2) * (1 + 0.12 * (lv - 1) + 0.004 * (lv - 1) * (lv - 1)) * (e.role === 'legende' ? 1.4 : 1);
          this.broadside(s, side, dist, dmg, e.role === 'legende' && Math.random() < 0.3 ? 'brand' : 'kugel', target);
          const reload = (2.4 + Math.random()) / Math.sqrt(lv * 0.5 + 0.5) * s.reloadScale;
          if (side > 0) s.reloadL = reload; else s.reloadR = reload;
          break;
        }
      }
    } else if (target && (e.companion || duel) && dist < 420) {
      const tier = Math.max(0, SHIP_CLASSES.indexOf(s.cls));
      this.fillSteerSelf(e, self, false, !e.training);
      this.fillSteerTarget(target, tgt);
      this.stagger(nav, s);
      this.steering.fight(nav, self, tgt, dt, cmd);
      turn = this.applyCmd(e, cmd);
      // Breitseite: Ziel quer zum eigenen Kurs, Schuss nur, wenn die Seite zeigt und geladen ist
      if (cmd.state !== 'DISENGAGE') this.duelFire(e, target, dist, tier, e.companion ? this.canDmg * 0.6 : null);
    } else {
      if (!e.companion) s.speedCap = 10;
      this.fillSteerSelf(e, self);
      const ar = Math.max(40, arriveRadius(self));
      if (e.aiT <= 0 || nav.replan || Math.hypot(e.wander.x - s.x, e.wander.z - s.z) < ar) {
        e.aiT = 25;
        const st = e.station ? BORDER_FORTS.find((f) => f.id === e.station) : null;
        let wx: number, wz: number;
        if (st) {
          // Grenzstreife: auf der Grenzlinie hin und her, 200 bis 700 m beiderseits der Festung
          const a = (BORDERS[st.borderIndex].deg * Math.PI) / 180, t = st.radius + (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 500), off = (Math.random() - 0.5) * 120;
          wx = Math.sin(a) * t + Math.cos(a) * off; wz = Math.cos(a) * t - Math.sin(a) * off;
        } else if (e.raid && e.home) {
          // Wachschiff: kreuzt vor seiner Station
          const a = Math.random() * Math.PI * 2;
          wx = e.home.x + Math.cos(a) * 120; wz = e.home.z + Math.sin(a) * 120;
        } else {
          const a = Math.random() * Math.PI * 2;
          wx = s.x + Math.cos(a) * 400; wz = s.z + Math.sin(a) * 400;
        }
        this.setWander(e, nav, self, wx, wz);
      }
      this.steering.cruise(nav, self, e.wander.x, e.wander.z, 0.55, ar, null, dt, cmd);
      turn = this.applyCmd(e, cmd);
    }
    return turn;
  }

  private ai(e: EnemyShip, dt: number) {
    const s = e.ship;
    const p = this.player;
    if (!s.alive) return;
    // Enterphase: das Schiff treibt brennend und wehrlos (keine Geschütze, kein Fahrtziel)
    if (s.disabled) { e.state = 'patrol'; s.sailLevel = 0; s.throttle = 0; s.aiSail = null; s.steer(dt, 0, this.env); return; }
    e.aiT -= dt;
    const nav = e.nav ?? (e.nav = createAiNav(s.entityId));
    const turn = e.fleetId && p?.alive ? this.aiFleet(e, nav, dt) : this.aiGeneral(e, nav, dt);
    // Inseln, Stege, Schiffe und Weltrand weicht die Lenkung selbst aus (Fühler); `pushShip` bleibt die letzte Sicherung gegen Grundberührung
    s.steer(dt, turn, this.env);
    const o = this.ground.pushShip(s.x, s.z, s.heading, s.cls.L, s.cls.W);
    if (o.hit) { s.x = o.x; s.z = o.z; }
  }

  /** Vor dem Durchlauf der KI: alle lebenden Schiffe (auch den Spieler) als Hindernisse für die Fühler eintragen */
  private registerObstacles() {
    const st = this.steering;
    st.clearObstacles();
    this.friendly.clear();
    if (this.player) this.friendly.add(this.player);
    for (const e of this.enemies) if (e.companion || e.helper) this.friendly.add(e.ship);
    for (const e of this.enemies) {
      const s = e.ship;
      if (s.alive) st.addObstacle(s.entityId, s.x, s.z, Math.sin(s.course) * s.speed, Math.cos(s.course) * s.speed, Math.max(s.cls.W * 0.5, s.cls.L * 0.32));
    }
    const p = this.player;
    if (p?.alive) st.addObstacle(p.entityId, p.x, p.z, Math.sin(p.course) * p.speed, Math.cos(p.course) * p.speed, Math.max(p.cls.W * 0.5, p.cls.L * 0.32));
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
      // feine Rauchspur hinter der Kugel
      b.trail -= dt;
      if (this.smoke && b.trail <= 0) {
        b.trail = 0.07;
        this.smoke.puff(p.x, p.y, p.z, { size: 0.35, grow: 1.6, life: 1.3, tone: b.ammo === 'brand' ? 0.4 : 0.9, spread: 0.15, rise: 0.2, alpha: 0.35, wind: 0.5 });
      }
      for (const s of this.shipsForHit()) {
        if (s === b.owner || !s.alive) continue;
        // Kein Beschuss unter Freunden: Begleitschiffe feuern oft quer über das Flaggschiff hinweg
        if (b.owner && this.friendly.has(b.owner) && this.friendly.has(s)) continue;
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
      // Raid: Kugeln der eigenen Flotte gegen Seetor, Mauern und Batterien
      if (b.life > 0 && this.raidTargets && b.owner && (b.owner === this.player || this.enemies.some((e) => e.companion && e.ship === b.owner)) && this.raidTargets.hitBall(p, b.dmg, b.ammo)) b.life = 0;
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
        // Wassersäule: schmaler, hoher Strahl, breiter Kranz und feiner Sprühnebel
        this.spray.emit(26, p.x, p.y + 0.2, p.z, { speed: 1.2, up: 14, life: 1.6, color: new Color(0.95, 0.98, 1), spread: 0.6 });
        this.spray.emit(18, p.x, p.y + 0.2, p.z, { speed: 5, up: 5, life: 1.1, color: new Color(0.9, 0.96, 1), spread: 0.8 });
        this.smoke?.puff(p.x, p.y + 1.5, p.z, { n: 2, size: 1.2, grow: 4.5, life: 1.8, tone: 1.05, vy: 3, spread: 0.6, rise: -1.2, drag: 2, alpha: 0.5, wind: 0.6 });
      }
      if (b.life <= 0) b.mesh.removeFromParent();
    }
    keepIf(this.balls, (b) => b.life > 0);
  }

  private hitShip(s: Ship, b: Ball, local: Vector3, sailHit: boolean) {
    // Schüsse auf ein Marine-Schiff: es wird feindlich, das Ansehen leidet beim Versenken (siehe Game.onShipSunk)
    if (b.owner === this.player) {
      const en = this.enemies.find((o) => o.ship === s);
      if (en?.power === 'marine' && !en.provoked) { en.provoked = true; if (!en.companion) this.hooks.message('Du hast auf ein Schiff der Marine geschossen – sie wird dich jagen!'); }
      // Wer auf das Schiff einer Macht schießt, hat sich ihr Wohlwollen verspielt: auch friedliche Schiffe greifen nun an
      else if (en?.power && !en.provoked && !en.companion) en.provoked = true;
      if (en) en.lastPlayerHit = this.clock;
    }
    // Treffer im Tuch zählen als Segelzone: die Munition bleibt, was sie ist (Kettenkugeln zerfetzen am stärksten)
    // Schiffe in einer Seeschlacht zerlegen sich nicht in Sekunden: Schüsse der KI untereinander wirken gedämpft, damit der Spieler Zeit zum Eingreifen hat
    const target = b.owner !== this.player && s !== this.player ? this.enemies.find((o) => o.ship === s) : undefined;
    const foeBattle = !!b.owner && !!target?.battle;
    // wer gerade geentert wird, geht den anderen Schiffen nicht unter den Füßen des Spielers verloren
    // Kampfunfähige Schiffe erledigt nur der Spieler (Gnadenstoß); Schüsse anderer Schiffe prallen auf Wrack und Flammen
    if (target?.ship.disabled && b.owner !== this.player) {
      this.smoke?.puff(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, { n: 1, size: 1.2, grow: 5, life: 2.4, tone: 0.3, spread: 0.8, rise: 1, alpha: 0.6 });
      return;
    }
    const wasDisabled = s.disabled;
    const dmg = s.damage(b.dmg * (target?.boarded ? 0 : foeBattle ? BATTLE.aiDamage : 1), b.ammo, sailHit ? null : local, sailHit ? 'sail' : 'hull', b.owner?.penTier ?? 3);
    const en2 = this.enemies.find((o) => o.ship === s);
    if (en2 && !wasDisabled && s.disabled) this.onDisabled(en2, b.owner === this.player);
    // Schiffe, die nie untergehen: weitere Treffer wirken nicht, der Hinweis kommt höchstens alle 8 s
    else if (en2 && wasDisabled && s.noKill && s.disabledFor >= 2 && b.owner === this.player && this.clock - (en2.noKillHint ?? -99) > 8) { en2.noKillHint = this.clock; this.hooks.message('Dieses Schiff geht durch Kanonen nie unter – nur Entern besiegt es!'); }
    if (b.owner === this.player) this.noteBattleHit(s, dmg);
    const p = b.mesh.position.clone();
    // Treffer weit weg vom Spieler, an denen er nicht beteiligt ist: ein Rauchfleck genügt (kein Ton, keine Funken, keine Splitter)
    const pl = this.player;
    if (foeBattle && pl && Math.hypot(p.x - pl.x, p.z - pl.z) > FAR_FX) {
      this.smoke?.puff(p.x, p.y, p.z, { n: 1, size: 1.4, grow: 5, life: 2.8, tone: 0.5, spread: 0.8, rise: 0.8, alpha: 0.6 });
      if (!s.alive) this.sink(s);
      return;
    }
    audio.play('crack', 1, p);
    this.fx.hit(p, 'heavy', b.ammo === 'brand' ? '#FF7A2A' : '#FFD08A');
    this.sparks.emit(10, p.x, p.y, p.z, { speed: 6, up: 5, life: 0.9, color: new Color(0.55, 0.36, 0.2), gravity: 14, spread: 0.3 });
    // Holzsplitter fliegen in Schussrichtung weiter, dazu eine Staub- und Rauchwolke
    const h = Math.hypot(b.vel.x, b.vel.z) || 1;
    this.debris?.splinters(p.x, p.y, p.z, b.vel.x / h, b.vel.z / h, sailHit ? 2 : 9, sailHit ? s.look.sail : s.look.hull);
    this.smoke?.puff(p.x, p.y, p.z, { n: 2, size: 0.9, grow: 4.5, life: 2.6, tone: b.ammo === 'brand' ? 0.25 : 0.55, vx: b.vel.x / h * 2, vz: b.vel.z / h * 2, spread: 0.8, rise: 0.8, alpha: 0.7, glow: b.ammo === 'brand' ? 0.8 : 0.3 });
    // die Zahlen der KI-Schlacht würden nur den Bildschirm füllen: sie zeigen nur, was der Spieler austeilt oder einsteckt
    if (dmg > 0 && !foeBattle) this.overlay.number(p.clone().setY(p.y + 1.5), dmg, s === this.player ? 'hurt' : 'hit');
    if (s === this.player) { this.hooks.shake(0.45); this.overlay.hurt(); }
    else if (b.owner === this.player) this.hooks.hitstop(0.03);
    if (!s.alive) this.sink(s);
  }

  private sink(s: Ship) {
    if (s.sinking > 0) return;
    s.sinking = 0.01;
    audio.play('sink', 1, s);
    const e = this.enemies.find((x) => x.ship === s);
    // Wrackteile, Fässer und eine Rauchwolke – auch beim eigenen Schiff
    this.debris?.wreck(s.x, s.z, s.cls.L, s.cls.W, s.heading, s.look.hull);
    this.smoke?.puff(s.x, s.model.deckY + 1, s.z, { n: 8, size: 3, grow: 14, life: 8, tone: 0.3, vy: 2, spread: 2.5, rise: 1.2, alpha: 0.75, glow: 0.7, jitter: s.cls.L * 0.3 });
    if (s === this.player) return;
    this.fx.shockwave(new Vector3(s.x, 0.5, s.z), s.cls.L * 0.6, '#FFB45A');
    this.spray.emit(60, s.x, 1, s.z, { speed: 6, up: 10, life: 2, color: new Color(0.95, 0.98, 1), spread: s.cls.W });
    this.sparks.emit(50, s.x, s.model.deckY + 1, s.z, { speed: 9, up: 9, life: 1.2, color: new Color(3.5, 1.4, 0.35), gravity: 6, spread: s.cls.W });
    if (e?.fleetId) this.hooks.fleetLost?.(e.fleetId);
    if (e && !e.companion) {
      // Seeschlacht: versenkt der Spieler beide Seiten, gibt es maximalen Doppel-Loot (×2,5); was die KI versenkt, zählt nicht als Abschuss des Spielers
      const byPlayer = e.lastPlayerHit !== undefined && this.clock - e.lastPlayerHit < 10;
      let lootK = 1;
      const bt = e.battle ? this.battles.find((x) => x.id === e.battle!.id) : undefined;
      if (bt && e.battle && e.battle.side !== 2) {
        if (byPlayer && !e.countedSunk) { e.countedSunk = true; bt.stats.sunk[e.battle.side]++; }
        lootK = judgeBattle(bt.stats).kind === 'both' ? REP.both.lootMult : byPlayer ? 1 : 0.7;
      }
      if (!e.battle || byPlayer) this.hooks.sunk(e);
      // Beute: deutlich mehr als früher (weniger, aber bedeutendere Gefechte); Händler sind am reichsten
      const n = 2 + Math.floor(s.cls.L / 12) + (lootK > 1 ? 2 : 0);
      const total = (45 + e.level * 26) * lootK * (1 + Math.max(0, SHIP_CLASSES.indexOf(s.cls)) * 0.25) * (e.role === 'haendler' ? 2.6 : e.role === 'legende' ? 4 : 1);
      for (let i = 0; i < n; i++) this.spawnCrate(s.x + (Math.random() - 0.5) * s.cls.W * 2, s.z + (Math.random() - 0.5) * s.cls.L * 0.8, Math.round(total / n * (0.7 + Math.random() * 0.6)), Math.random() < (e.role === 'legende' ? 0.8 : 0.14 / n));
    }
  }

  private spawnCrate(x: number, z: number, gold: number, shard: boolean) {
    const m = new Mesh(this.crateGeo, shard ? this.shardMat : toon('#8A5A2B'));
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
    keepIf(this.crates, (c) => c.t >= 0);
  }

  // ---------- Entern ----------

  /** Gegner, das gerade geentert werden kann */
  /** Angeschlagen genug zum Entern? */
  isWeak(e: EnemyShip) {
    const s = e.ship;
    return s.disabled || s.hull < s.maxHull * 0.35 || s.crew < 0.3 || (e.role === 'haendler' && s.hull < s.maxHull * 0.6);
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

  /**
   * Erobertes Schiff: die Prise wird versenkt, die Beute treibt herüber.
   * Belohnung und Legenden-Sieg vergibt das Spiel über onBoardWon – nicht zusätzlich als „versenkt“
   * (sonst zählte eine geenterte Legende gleichzeitig als Sieg und als Revanche).
   */
  capture(e: EnemyShip) {
    const bt = e.battle && e.battle.side < 2 ? this.battles.find((x) => x.id === e.battle!.id) : undefined;
    if (bt && e.battle) { bt.engaged = true; if (!e.countedSunk) { e.countedSunk = true; bt.stats.sunk[e.battle.side as 0 | 1]++; } }
    e.captured = true;
    e.boarded = false;
    e.ship.hull = 0;
    e.ship.sinking = 0.01;
    // Doppelspiel in einer Seeschlacht: auch die Prise bringt den Doppel-Loot
    const lootK = bt && judgeBattle(bt.stats).kind === 'both' ? REP.both.lootMult : 1;
    audio.play('sink', 0.8, e.ship);
    this.debris?.wreck(e.ship.x, e.ship.z, e.ship.cls.L * 0.6, e.ship.cls.W, e.ship.heading, e.ship.look.hull);
    this.spawnCrate(e.ship.x, e.ship.z, Math.round((90 + e.level * 34) * lootK * (1 + Math.max(0, SHIP_CLASSES.indexOf(e.ship.cls)) * 0.25) * (e.role === 'legende' ? 4 : e.role === 'haendler' ? 2.8 : 1.2)), e.role === 'legende' || lootK > 1 || Math.random() < 0.18);
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

  /** Mitte eines Schiffs auf Deckhöhe (dort schlagen Faji-Kräfte ein) */
  private deckPos(sh: Ship) { return new Vector3(sh.x, sh.model.deckY * 0.6, sh.z); }

  /** Geschoss von a nach b (Meteor aus dem Himmel, Druckschlag übers Wasser), ruft am Ziel done() */
  private shoot(from: Vector3, to: Vector3, el: Element, size: number, dur: number, arc: number, done: () => void) {
    const c = new Color(ELEMENT_COLORS[el]);
    const hot = el === 'meteor' || el === 'feuer';
    const mesh = new Mesh(new SphereGeometry(size, 14, 10), new MeshBasicMaterial({ color: hot ? new Color(3, 1.4, 0.4) : c.clone().multiplyScalar(2.4), transparent: true, opacity: hot ? 1 : 0.75, depthWrite: false }));
    if (hot) {
      // glühender Gesteinskern in der Flamme
      const core = new Mesh(new IcosahedronGeometry(size * 0.7, 0), toon({ color: '#3A2418', flatShading: true }));
      mesh.add(core);
    }
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.shots.push({ mesh, from: from.clone(), to: to.clone(), t: 0, dur, arc, trail: el, done });
  }

  private updateShots(dt: number) {
    for (const s of this.shots) {
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      s.mesh.position.lerpVectors(s.from, s.to, k);
      s.mesh.position.y += Math.sin(k * Math.PI) * s.arc;
      s.mesh.rotation.x += dt * 6; s.mesh.rotation.y += dt * 4;
      const hot = s.trail === 'meteor' || s.trail === 'feuer';
      if (Math.random() < dt * 50) {
        const q = s.mesh.position;
        this.sparks.emit(3, q.x, q.y, q.z, { speed: 2, up: 1, life: 0.7, color: new Color(ELEMENT_COLORS[s.trail]).multiplyScalar(2.2), gravity: hot ? -2 : 0, spread: 0.8 });
        if (hot) this.smoke?.puff(q.x, q.y, q.z, { n: 1, size: 2.5, grow: 6, life: 2.4, tone: 0.2, vy: 1, spread: 1, rise: 0.4, alpha: 0.7, glow: 0.8 });
      }
      if (k >= 1) {
        s.mesh.removeFromParent();
        s.mesh.traverse((o) => { const m = o as Mesh; m.geometry?.dispose(); if (m.material && !(m.material as { userData?: { toon?: boolean } }).userData?.toon) (m.material as MeshBasicMaterial).dispose(); });
        s.done();
      }
    }
    keepIf(this.shots, (s) => s.t < s.dur);
  }

  /**
   * Wirkung einer Fähigkeit auf See. Liefert false, wenn kein Ziel da ist.
   * Jede Kraft trifft mit ihrer eigenen Effektsprache in Schiffsgröße: Blitze aus dem Himmel, fallende Meteore,
   * Felsen aus dem Meer, Strudel, Druckwellen, fliegende Klingenhiebe.
   */
  castSea(a: ActiveDef, level: number, power: number): boolean {
    const p = this.player;
    const kind = a.sea;
    if (!p || !kind) return false;
    const el = a.el;
    const color = ELEMENT_COLORS[el];
    // stärkere Kräfte (Ultimates) treffen auf See auch härter
    const mult = Math.min(3, Math.max(0.75, a.dmg(level) / 1.6));
    const dmg = power * (1.4 + level * 0.3) * mult;
    const big = a.ult ? 1.35 : 1;
    const hit = (e: EnemyShip, d: number) => {
      if (!e.ship.alive) return;
      const was = e.ship.disabled;
      const real = e.ship.damage(d, 'kugel', null);
      this.overlay.number(new Vector3(e.ship.x, e.ship.model.deckY + 6, e.ship.z), real, 'crit');
      e.lastPlayerHit = this.clock;
      if (!was && e.ship.disabled) this.onDisabled(e, true);
      else if (was && e.ship.noKill && e.ship.disabledFor >= 2 && this.clock - (e.noKillHint ?? -99) > 8) { e.noKillHint = this.clock; this.hooks.message('Dieses Schiff geht durch Kräfte nie unter – nur Entern besiegt es!'); }
      if (!e.ship.alive) this.sink(e.ship);
    };
    const own = new Vector3(p.x, p.model.deckY + 1.5, p.z);
    switch (kind) {
      case 'salvo': {
        const t = this.nearest(160);
        const yaw = t ? Math.atan2(t.ship.x - p.x, t.ship.z - p.z) : p.heading;
        const n = a.shape === 'dash' ? 12 : 8;
        for (let i = 0; i < n; i++) {
          const dir = new Vector3(Math.sin(yaw + (i - (n - 1) / 2) * 0.05), 0, Math.cos(yaw + (i - (n - 1) / 2) * 0.05));
          const d = t ? Math.hypot(t.ship.x - p.x, t.ship.z - p.z) : 80;
          const vel = dir.multiplyScalar(BALL_SPEED).setY(0.5 * G * (d / BALL_SPEED));
          this.later((i * 60) / 1000, () => this.spawnBall(new Vector3(p.x, p.model.deckY + 1, p.z), vel, p, dmg * 0.4, 'brand'));
        }
        this.efx.impact(own, 'feuer', 1.2);
        return true;
      }
      case 'freeze': {
        const t = this.nearest(150); if (!t) return false;
        const light = a.shape === 'bolt';
        t.ship.frozen = (light ? 2 : 4) + level;
        this.seaWave(t.ship, '#8FE8FF');
        this.efx.impact(this.deckPos(t.ship).setY(0.3), 'eis', (light ? 2.4 : 3.2) * big);
        hit(t, dmg * (light ? 0.7 : 0.5));
        return true;
      }
      case 'strike': {
        const list = a.shape === 'rain' ? this.inRange(170) : [this.nearest(160)].filter((e): e is EnemyShip => !!e);
        if (!list.length) return false;
        list.forEach((e, i) => this.later((i * 180) / 1000, () => {
          this.efx.impact(this.deckPos(e.ship), 'blitz', 3.2 * big);
          this.hooks.shake(0.4);
          hit(e, dmg * (a.shape === 'rain' ? 1.1 : 1.3));
          e.ship.crew = Math.max(0, e.ship.crew - 0.08);
        }));
        return true;
      }
      case 'wind': {
        p.boost = 5;
        this.fx.shockwave(new Vector3(p.x, 0.4, p.z), 30, color);
        this.efx.impact(new Vector3(p.x, 0.5, p.z), 'sturm', 3);
        for (const e of this.inRange(70)) { e.ship.x += (e.ship.x - p.x) * 0.3; e.ship.z += (e.ship.z - p.z) * 0.3; }
        return true;
      }
      case 'wave': {
        const list = this.inRange(130); if (!list.length) return false;
        this.fx.shockwave(new Vector3(p.x, 0.4, p.z), 60, color);
        for (const e of list) {
          this.seaWave(e.ship, color, true);
          this.efx.impact(this.deckPos(e.ship).setY(0.2), 'flut', 3.2 * big);
          hit(e, dmg * 0.8);
          e.ship.x += (e.ship.x - p.x) * 0.25; e.ship.z += (e.ship.z - p.z) * 0.25;
        }
        return true;
      }
      case 'repair': {
        p.repair(0.3 + level * 0.05);
        this.fx.shockwave(new Vector3(p.x, 0.4, p.z), 20, '#7CE07A');
        this.efx.impact(own, 'licht', 2.2);
        this.overlay.number(new Vector3(p.x, 6, p.z), 'Repariert!', 'heal');
        return true;
      }
      case 'ceasefire': {
        const list = this.inRange(160);
        for (const e of list) { e.ship.ceasefire = (a.ult ? 6 : 4) + level; this.efx.impact(this.deckPos(e.ship), 'geist', 2); }
        this.fx.shockwave(new Vector3(p.x, 0.4, p.z), 80, color);
        return true;
      }
      case 'reload': {
        p.reloadL = p.reloadR = 0; this.reloadMult = 0.5; this.later((8000) / 1000, () => { this.reloadMult = 1; });
        this.efx.impact(own, el, 1.6);
        return true;
      }
      case 'cleave': {
        // wie in 1.0: der Hieb fliegt zum nächsten Feindschiff und trifft alles auf der Linie
        const t = this.nearest(170);
        if (!t) return false;
        const yaw = Math.atan2(t.ship.x - p.x, t.ship.z - p.z);
        const f = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const blade = el === 'klinge' || el === 'licht' || el === 'schatten';
        if (blade) {
          // riesige Klingenwelle, bei Kreuzschnitt zwei gekreuzte
          const n = Math.max(1, Math.min(2, a.count ?? 1));
          for (let i = 0; i < n; i++) this.fx.smear(new Vector3(p.x, p.model.deckY + 2, p.z).addScaledVector(f, 10), yaw + (n > 1 ? (i - 0.5) * 0.5 : 0), 0.1, 30 * big, 0.6, color);
        } else {
          // Faust oder Aura: sichtbarer Druckschlag, der übers Wasser fliegt
          this.shoot(own, this.deckPos(t.ship), el, 1.6 * big, 0.35, 2, () => {});
          for (let i = 1; i <= 4; i++) this.later((i * 60) / 1000, () => this.fx.shockwave(new Vector3(p.x, 0.4, p.z).addScaledVector(f, i * 14), 6 + i * 2, color));
        }
        const d0 = Math.hypot(t.ship.x - p.x, t.ship.z - p.z) || 1;
        for (const e of this.inRange(170)) {
          const rel = new Vector3(e.ship.x - p.x, 0, e.ship.z - p.z);
          const along = rel.dot(f);
          const off = rel.clone().addScaledVector(f, -along).length();
          if (along > 0 && off < e.ship.cls.W + 6) {
            this.later((blade ? Math.min(1.5, along / d0) * 200 : 350) / 1000, () => {
              this.seaWave(e.ship, color, level >= 3);
              this.efx.impact(this.deckPos(e.ship), el, 2.4 * big);
              hit(e, dmg * 1.6);
            });
          }
        }
        this.hooks.shake(0.3);
        return true;
      }
      case 'meteor': case 'rain': {
        const list = this.inRange(170); if (!list.length) return false;
        const meteors = kind === 'meteor';
        const per = meteors && a.ult ? 2 : 1;
        let i = 0;
        for (const e of list) for (let k = 0; k < per; k++) {
          const delay = 200 + i++ * 260;
          this.later((delay) / 1000, () => {
            if (!e.ship.alive) return;
            const to = this.deckPos(e.ship).add(new Vector3((Math.random() - 0.5) * e.ship.cls.W, 0, (Math.random() - 0.5) * e.ship.cls.L * 0.5));
            if (meteors) {
              // Meteor stürzt schräg aus dem Himmel, Glut- und Rauchschweif, dann Einschlag mit Krater, Feuer und Splittern
              const away = new Vector3(to.x - p.x, 0, to.z - p.z).normalize();
              const from = to.clone().addScaledVector(away, -90).setY(150);
              this.shoot(from, to, 'meteor', 2.6 * big, 0.85, 0, () => {
                if (!e.ship.alive) return;
                this.efx.impact(to, 'meteor', 3.4 * big);
                this.seaWave(e.ship, '#FF9A3A', true);
                this.debris?.splinters(to.x, to.y, to.z, 0, 0, 14, '#6A4A2A');
                this.hooks.shake(0.6);
                hit(e, dmg / per);
                e.ship.fire = Math.max(e.ship.fire, 8);
              });
            } else {
              this.efx.impact(to, el, 3 * big);
              this.hooks.shake(0.35);
              hit(e, dmg * 0.9);
              if (el === 'feuer') e.ship.fire = Math.max(e.ship.fire, 6);
            }
          });
        }
        return true;
      }
      case 'still': {
        const list = this.inRange(160);
        for (const e of list) { e.ship.frozen = a.ult ? 5 : 4; e.ship.ceasefire = 3; this.efx.impact(this.deckPos(e.ship), el, 2.6); }
        this.fx.shockwave(new Vector3(p.x, 0.4, p.z), 120, color);
        this.efx.impact(own, el, 2.5);
        return true;
      }
      case 'shock': {
        // Druckwelle ums eigene Schiff: trifft alle nahen Schiffe und stößt sie weg
        const r = a.ult ? 140 : 95;
        const list = this.inRange(r); if (!list.length) return false;
        this.fx.shockwave(new Vector3(p.x, 0.4, p.z), r * 0.7, color);
        this.efx.impact(new Vector3(p.x, 0.4, p.z), el === 'klinge' ? 'sturm' : el, 2.6 * big);
        for (const e of list) {
          const d = Math.hypot(e.ship.x - p.x, e.ship.z - p.z) || 1;
          this.later(((d / r) * 300) / 1000, () => {
            this.seaWave(e.ship, color, !!a.ult);
            this.efx.impact(this.deckPos(e.ship), el, 2 * big);
            hit(e, dmg * (a.count && a.count > 1 ? 1.2 : 1));
            e.ship.x += ((e.ship.x - p.x) / d) * 14; e.ship.z += ((e.ship.z - p.z) / d) * 14;
            if (a.status === 'stun') e.ship.frozen = Math.max(e.ship.frozen, 1.5);
          });
        }
        this.hooks.shake(0.5);
        return true;
      }
      case 'brace': {
        // Faji-Panzer ums eigene Schiff
        p.shield = Math.max(p.shield, (a.dur ?? 5) + 2);
        p.shieldK = a.buff?.invuln ? 0.9 : Math.min(0.8, Math.max(0.45, a.buff?.reduce ?? 0.5));
        if (a.heal) p.repair(a.heal * 0.5);
        this.fx.shockwave(new Vector3(p.x, 0.4, p.z), p.cls.L, color);
        this.efx.impact(own, el, 2);
        this.overlay.number(new Vector3(p.x, p.model.deckY + 7, p.z), 'Faji-Panzer!', 'info');
        return true;
      }
      case 'barrage': {
        const t = this.nearest(140); if (!t) return false;
        const n = 7;
        for (let i = 0; i < n; i++) this.later((i * 90) / 1000, () => {
          if (!t.ship.alive) return;
          const to = this.deckPos(t.ship).add(new Vector3((Math.random() - 0.5) * t.ship.cls.W, Math.random() * 3, (Math.random() - 0.5) * t.ship.cls.L * 0.6));
          this.shoot(own.clone().add(new Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)), to, el, 0.9, 0.25, 1, () => {
            this.fx.shockwave(to.clone().setY(0.6), 5, color);
            this.efx.impact(to, el, 1.2);
            if (Math.random() < 0.5) this.debris?.splinters(to.x, to.y, to.z, 0, 0, 4, '#6A4A2A');
            hit(t, (dmg * 1.5) / n);
          });
        });
        this.hooks.shake(0.25);
        return true;
      }
      case 'quake': {
        // Felsen brechen unter dem Schiff aus dem Meer und halten es fest
        const t = this.nearest(150); if (!t) return false;
        const at = this.deckPos(t.ship).setY(0.2);
        this.efx.impact(at, 'erde', 3.2 * big);
        this.seaWave(t.ship, '#C9A26B', true);
        t.ship.frozen = Math.max(t.ship.frozen, 2.5);
        this.debris?.splinters(at.x, t.ship.model.deckY, at.z, 0, 0, 10, '#6A4A2A');
        this.hooks.shake(0.45);
        hit(t, dmg * 1.25);
        return true;
      }
      case 'pull': {
        // Strudel beim nächsten Schiff: zieht alle Schiffe in der Nähe zusammen und zerrt am Rumpf
        const t = this.nearest(160); if (!t) return false;
        const c = new Vector3(t.ship.x, 0.3, t.ship.z);
        const list = this.enemies.filter((e) => !e.companion && e.ship.alive && Math.hypot(e.ship.x - c.x, e.ship.z - c.z) < (a.ult ? 90 : 60));
        this.efx.impact(c, el, 3.4 * big);
        this.fx.shockwave(c, a.ult ? 40 : 28, color);
        for (const e of list) {
          e.ship.x += (c.x - e.ship.x) * 0.45; e.ship.z += (c.z - e.ship.z) * 0.45;
          e.ship.frozen = Math.max(e.ship.frozen, a.ult ? 3 : 1.8);
          for (let k = 0; k < 3; k++) this.later((300 + k * 350) / 1000, () => hit(e, dmg * (a.ult ? 0.5 : 0.35)));
        }
        this.hooks.shake(0.4);
        return true;
      }
      case 'poison': {
        const t = this.nearest(150); if (!t) return false;
        this.efx.impact(this.deckPos(t.ship), 'gift', 3.2);
        t.ship.crew = Math.max(0, t.ship.crew - 0.3);
        t.ship.ceasefire = Math.max(t.ship.ceasefire, 3 + level);
        for (let k = 0; k < 4; k++) this.later((400 + k * 600) / 1000, () => hit(t, dmg * 0.3));
        return true;
      }
    }
    return false;
  }

  clear() {
    // auch Lebensbalken, Beutekisten und Faji-Wellen entfernen (blieben sonst nach dem Untergang stehen)
    for (const e of this.enemies) { e.ship.dispose(); this.overlay.setBar(e, null, -1, false, null as unknown as Camera); }
    this.enemies = [];
    for (const b of this.balls) b.mesh.removeFromParent();
    this.balls = [];
    for (const c of this.crates) c.mesh.removeFromParent();
    this.crates = [];
    for (const w of this.waves) { w.mesh.removeFromParent(); w.mesh.geometry.dispose(); (w.mesh.material as MeshBasicMaterial).dispose(); }
    this.waves = [];
  }
}
