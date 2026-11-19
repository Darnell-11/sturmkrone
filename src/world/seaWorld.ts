import { audio } from '../audio/audio';
import { CrewAboard, type CrossingPlan, type LandingPlan } from './crewAboard';
import type { CommandState, TroopRoster } from '../data/troops';
import { rosterTotal } from '../data/troops';
import type { TroopSquad, TroopWorld } from '../entities/troops/squad';
import type { CrewDef } from '../data/crew';
import type { AllyWorld } from '../entities/ally';
import { navForIsland } from '../ai/navGrid';
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  MathUtils,
  Quaternion,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Input } from '../core/input/input';
import type { StyleId } from '../data/animations';
import type { CharacterLook, NpcRole } from '../data/characterParts';
import { CAMERA_PLANES, type QualityConfig } from '../data/qualityTiers';
import { EDGE_WALL, HOME_SPAWN, WORLD_SCALE } from '../data/world';
import type { CharacterAssets } from '../entities/character/assets';
import { LampPool, lampShared } from '../render/lamps';
import { installMatrixSkip } from '../render/matrixSkip';
import { GlowSystem, glowHub, makeEmitter, type GlowPlaced } from '../render/glow';
import { Character } from '../entities/character/character';
import { shieldFor, weaponsFor } from '../entities/character/weapons';
import { Npc } from '../entities/npc';
import { PlayerFoot } from '../entities/player/playerFoot';
import { addOutlines } from '../render/outline';
import { toon } from '../render/toon';
import { Environment, type EnvState } from './environment';
import { coastK, coastMax, fitHills, inBox, IslandGround, makeIslandShape, shelfOf, WATERLINE, type WalkIsland } from './islandGround';
import type { IslandShape } from './ocean';
import { ParticleSystem } from './particles';
import { hashId, seeded } from './waves';
import { dressIsland, plantFactionBanners } from './islandDress';
import { SITES } from '../data/settlements';
import { buildSite } from './settlement';
import { setSiteNight } from './architecture';
import { cachedProto, floraProto, Scatter, type Biome, type VegChunk } from './vegetation';
import { Object3D, type Material } from 'three';
import { IslandFauna } from './fauna';
import { texDetail } from '../render/texDetail';
import type { IslandStyle } from '../data/regions';
import { CombatFx } from '../combat/fx';
import { CombatSystem } from '../combat/combat';
import type { LootDrop } from '../data/loot';
import { EVENT, WorldEvents } from './events';
import type { EnemyKind } from '../data/combat';
import type { Faction } from '../core/save/types';
import type { CombatOverlay } from '../ui/combatOverlay';
import type { Enemy } from '../entities/enemy';
import { FajiController } from '../faji/fajiController';
import type { SkillState } from '../core/save/types';
import { Ship, type SeaEnv } from '../entities/ship/ship';
import { AMMO, AMMO_IDS, DEFAULT_SHIP_LOOK, factionShipLook, SHIP_CLASSES, TITLE_SHIP, type AmmoId, type ShipLook } from '../data/ships';
import { TitleDirector } from './titleDirector';
import { NavalSystem, type BattleMark, type BattleResult, type EnemyShip } from '../naval/naval';
import { CompositeGround, DeckGround, type Ground, type Pier } from './islandGround';
import { DockingSystem } from './dockingSystem';
import type { BoardingPhase } from './docking';
import { hasArch } from './envModels';
import { actAt, ELEMENT_COLORS } from '../data/skills';
import { BERNSTEINSEE, REGIONS, regionAt, seaLevelAt, type IslandDef, type RegionDef } from '../data/regions';
import { FACTIONS, marineStance, type FactionId } from '../data/factions';
import { RaidDirector, type RaidEnd, type RaidHostWorld, type RaidView } from '../raid/raidDirector';
import { Garrison, makePlayerBanner, playerPalette } from './garrison';
import type { RaidWorld } from '../raid/raidWorld';
import type { RaidPartyContext } from '../raid/raidTypes';
import type { LootOwned } from '../raid/raidLoot';
import { MARINE_SERVICE_STANDING } from '../raid/raidRules';
import { SmokeSystem } from './smoke';
import { setElementSmoke } from '../faji/elementFx';
import { distToSegment, wrapAngle } from '../core/mathUtil';
import { DebrisSystem } from './debris';
import { islandLabel, islandTerrain, OUTPOST_PIER, outpost, plant, ROCK_TYPES, rockFormation, styleKit, volcano } from './islandStyle';
import type { Sprite } from 'three';
import { ABYSS_LAIR, SeaBoss } from '../naval/seaBoss';
import { buildTown, mergeByMaterial, type TownBuild } from './town';
import { updateBeams } from './lighthouseBeam';
import { updateFountains } from './fountain';
import { SeaLife } from './life';
import { warmupShaders } from '../core/warmup';
import { clamp01 } from '../core/mathUtil';
import type { WebGLRenderer } from 'three';
import { TOWN_NPCS, VILLAGE_NPCS, type TownNpcDef } from '../data/quests';

// Feste Partikelfarben (die Partikel kopieren die Farbe – so entsteht pro Bild kein neues Objekt)
const FOAM_COL = new Color(0.95, 0.98, 1);
const SPLASH_COL = new Color(0.78, 0.84, 0.9);
const WHEEL_L = new Vector3();
const WHEEL_R = new Vector3();
const EMBER_COL = new Color(3.2, 1.3, 0.3);
const CRYSTAL_COL = new Color(1.4, 0.8, 2.4);
const DIG_COL = new Color(0.9, 0.8, 0.6);

/** Gegnerlager je Inselstufe */
const CAMP_BY_LEVEL: EnemyKind[][] = [
  ['matrose', 'matrose', 'musketier'],
  ['matrose', 'matrose', 'schildtraeger', 'musketier'],
  ['matrose', 'schildtraeger', 'musketier', 'fajiwirker', 'matrose'],
  ['matrose', 'schildtraeger', 'musketier', 'fajiwirker', 'schlaeger'],
  ['hauptmann', 'matrose', 'schildtraeger', 'musketier', 'fajiwirker', 'schlaeger'],
];


/** Inselstil einer Region */
const styleOf = (regionId?: string): IslandStyle => REGIONS.find((r) => r.id === regionId)?.style ?? 'tropisch';

interface WakePoint { x: number; z: number; age: number; strength: number; dx: number; dz: number; hw: number; spd: number }

export type SeaMode = 'sail' | 'foot';
export interface SeaState { boat: { x: number; z: number; heading: number } | null; env: EnvState }

/**
 * Testwelt: Schiff, Inseln, Spielfigur zu Fuß, Bewohner und die komplette Umgebung.
 * Echte Regionen, Städte und Schiffe folgen in den Meilensteinen 5 und 6.
 */
/** Standbild bei wirksamen Treffern (Sekunden) */
const HIT_STOP = 0.035;

export class SeaWorld {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(55, 1, CAMERA_PLANES.near, CAMERA_PLANES.far);
  readonly env: Environment;
  /** Punkt, auf den Kamera, Schatten und Tiefenunschärfe zielen */
  readonly focus = new Vector3();
  /** Inseln (Mittelpunkt und Radius) – für Karte und Flachwasser */
  islands: IslandShape[] = [];
  readonly ground = new IslandGround();
  /** Gemeinsamer Boden: Insel + Stege, aktive Decks (eigenes, geentertes) und Brücken (Gangway, Planken, Leitern, Watweg) */
  readonly composite = new CompositeGround(this.ground);
  mode: SeaMode = 'sail';
  /** Text der Kontextaktion (z. B. „An Land gehen“) oder null */
  contextLabel: string | null = null;

  onMessage: (text: string) => void = () => {};
  onModeChange: (mode: SeaMode) => void = () => {};
  onKill: (e: Enemy) => void = () => {};
  onGold: (n: number) => void = () => {};
  onPlayerDown: () => void = () => {};
  onShipSunk: (e: EnemyShip) => void = () => {};
  onLoot: (gold: number, shard: boolean) => void = () => {};
  onBoardWon: (e: EnemyShip) => void = () => {};
  /** Seeschlacht an einer Grenze beginnt in der Nähe / endet (nur wenn der Spieler eingriff: Bilanz); Kopfgeld je Macht kommt aus dem Spielstand */
  onBattleStart: (m: BattleMark, where: string) => void = () => {};
  onBattleEnd: (r: BattleResult) => void = () => {};
  bountyOf: (id: FactionId) => number = () => 0;
  onTalk: (npc: TownNpcDef) => void = () => {};
  onDig: (island: string) => void = () => {};
  onEnterIsland: (def: IslandDef) => void = () => {};
  onIslandCleared: (id: string) => void = () => {};
  /** Beute aufgehoben (Beute-Säule): Spielstand und Anzeige setzt das Spiel */
  onLootDrop: (d: LootDrop) => void = () => {};
  /** Zufällige Zonen-Ereignisse (Invasion, Elite-Jäger) */
  private events = new WorldEvents({
    banner: (t, s) => this.overlay?.showBanner(t, s),
    cutin: (t, c) => this.overlay?.showCutin(t, c),
    message: (t) => this.onMessage(t),
    gold: (n) => this.onGold(n),
    drop: (x, z, d) => { const g = this.ground.height(x, z); this.combat?.loot.drop(x, (Number.isFinite(g) ? g : 0) + 1, z, d, 3); },
  });
  /** Braucht ein laufender Auftrag diese Insel freigekämpft? Dann ignoriert sie die Ruhezeit */
  questWantsClear: (id: string) => boolean = () => false;
  /** Auf einer bewohnten Insel gelandet (Geschenk der Dorfbewohner) */
  onVillage: (id: string) => void = () => {};
  private assets: CharacterAssets | null = null;
  /** Dorfbewohner der ruhigen Inseln, nur solange man dort an Land ist */
  private visitors: Npc[] = [];
  private hullList: { x: number; z: number; h: number; L: number; W: number; speed: number; vis: number; trail?: boolean }[] = [];
  /** Faji-Kristall einer Ruine erweckt */
  onCrystal: (id: string) => void = () => {};
  onRescue: () => void = () => {};
  onHarbor: (def: IslandDef) => void = () => {};
  onEnterRegion: (r: RegionDef) => void = () => {};
  onSeaBossDown: () => void = () => {};
  onDiscover: (islandId: string) => void = () => {};
  /** Angeln: true = Fang, false = abgebrochen oder zu spät */
  onFish: (caught: boolean) => void = () => {};
  /** Leerer Fähigkeitsplatz: Faji-Baum öffnen */
  onOpenSkills: () => void = () => {};
  private fishing: { wait: number; bite: number } | null = null;
  /** Soll der Tiefenschlund erscheinen (Kapitel 7)? */
  bossWanted = false;
  seaBoss: SeaBoss | null = null;
  private bossGone = 0;
  private lastRegion = '';
  onBottle: () => void = () => {};
  private lastIsland: string | null = null;
  private hostilesBefore = 0;
  /** Der Boden der Welt für alle Läufer: `CompositeGround` (Insel, Stege, Decks und Brücken in einer Pipeline) */
  private readonly groundProxy: Ground = {
    height: (x, z, y) => this.composite.height(x, z, y),
    constrain: (x, z, r, y) => this.composite.constrain(x, z, r, y),
    ladderAt: (id, t, o) => this.composite.ladderAt(id, t, o),
    ladderLength: (id) => this.composite.ladderLength(id),
  };
  /** Angeforderte Trefferpause (vom Spiel in Echtzeit abgearbeitet) */
  /** Trefferpause: t = Zeitlupe (Sekunden), freeze = echtes Standbild (Sekunden, läuft in Echtzeit ab) */
  hitstop = { t: 0, scale: 0.05, freeze: 0 };
  /** Kamerastoß: Feder-gedämpfter Versatz, angestoßen in Trefferrichtung */
  private kick = new Vector3();
  private kickV = new Vector3();
  private shakeAx = new Vector3();
  private shakeDir = 0;
  private shakePh = 0;
  combat: CombatSystem | null = null;
  /** Neue Figuren und Objekte für das Zeichnen vorbereiten (setzt das Spiel: Shader parallel übersetzen) */
  warmHook: ((o: Object3D) => void) | null = null;
  playerFaction: Faction = 'pirat';
  /** Ansehen bei einer Weltmacht (−100 … 100); setzt das Spiel aus dem Spielstand (progress.standing). Marine: ab 20 verbündet, unter 0 feindlich. */
  standingOf: (id: FactionId) => number = () => 0;
  /** Laufende Belagerung (instanzierter Raid): solange gesetzt, ist die Hauptkarte pausiert und nur die Raid-Insel ist da */
  raid: RaidDirector | null = null;
  /** Hauptkarte während eines Raids (Inseln, Definitionen, Stege, Küstenformen, Rauch- und Feuerstellen) */
  private mainSaved: { islands: WalkIsland[]; defs: IslandDef[]; piers: Pier[]; shapes: IslandShape[]; vents: { x: number; y: number; z: number }[]; fires: { x: number; y: number; z: number }[]; chimneys: { x: number; y: number; z: number }[] } | null = null;
  private raidHostObj: RaidHostWorld | null = null;
  private raidMsgCd = 0;
  /** Oberfläche des Raids: Ziele und Hinweise (null = kein Raid) */
  onRaidView: (v: RaidView | null) => void = () => {};
  /** Der Raid ist zu Ende (Sieg oder Rückzug): die Welt ist schon wiederhergestellt */
  onRaidEnd: (info: RaidEnd) => void = () => {};
  /** Anfrage, eine Festungsinsel zu belagern (Kontext-Taste an der Küste der Endgame-Inseln und des Marine-Hauptquartiers) */
  onRaidRequest: (def: IslandDef) => void = () => {};
  private fx: CombatFx | null = null;
  private overlay: CombatOverlay | null = null;
  private dust: ParticleSystem;
  faji: FajiController | null = null;
  private style: StyleId = 'saebel';
  private cleared = new Map<number, number>();
  private downT = 0;
  private cinematic = 0;

  private boat: Group;
  /** Das eigene Schiff */
  ship: Ship;
  naval: NavalSystem | null = null;
  /** Tempo-Bonus (Crew, Ausbauten) */
  shipSpeedMult = 1;
  /** Rumpf-Bonus (Zimmermann, Ausbauten) */
  hullBonus = 0;
  /** Reichweite der Breitseiten (Ausguck) */
  rangeMult = 1;
  crew: CrewAboard | null = null;
  private crewHired: string[] = [];
  private crewParty: string[] = [];
  private crewLoyalty: Record<string, number> = {};
  private crewLevel = 1;
  private allyBuff = 1;
  /** Massentruppen an Bord (Truppentyp → Köpfe) und Kapazität; Überlebende kommen über `onTroopsReturn` zurück ins Spiel */
  private crewTroops: TroopRoster = {};
  private clearedNow = false;
  /** Nach dem Gefecht: die überlebenden Truppen (Bestand je Typ) – das Spiel zieht Verluste vom Schiffs-Pool ab und speichert */
  onTroopsReturn: (survivors: TroopRoster, before: TroopRoster) => void = () => {};
  private troopsBefore: TroopRoster = {};
  onCrewLine: (who: CrewDef, text: string) => void = () => {};
  private sailCd = 0;
  private boarding: EnemyShip | null = null;
  /** Das Deck, auf dem die Spielfigur gerade steht (aus der Lage abgeleitet; null auf Insel, Steg und Brücke) */
  private deckGround: DeckGround | null = null;
  /** Deck des eigenen Schiffs (bleibt bestehen, bis das Schiff umgebaut wird) und das des geenterten Schiffs */
  private ownDG: DeckGround | null = null;
  private preyDG: DeckGround | null = null;
  /** Anlegen, Gangway, Leitern und Enterbrücken */
  docking!: DockingSystem;
  /** Das Gefecht auf dem Feindschiff ist gewonnen (Brücken werden eingeholt, sobald die Spielfigur wieder an Bord ist) */
  private boardWon = false;
  private boardBack = 0;
  private boardRetreat = false;
  private homeSent = false;
  /** Wartet das Spiel noch auf die Rückkehr der Spielfigur aufs eigene Deck (nach Landgang) */
  private landed = false;
  private climbPose = { x: 0, y: 0, z: 0, yaw: 0 };
  /** Steht die Spielfigur auf einem Schiffsdeck (Entern, an Bord)? */
  get onDeck() { return !!this.deckGround || this.mode === 'sail'; }
  /** Inseldaten (gleiche Reihenfolge wie ground.islands) */
  islandDefs: IslandDef[] = [];
  town: TownBuild | null = null;
  life: SeaLife | null = null;
  private buoys: { g: Group; x: number; z: number; lamp: Mesh }[] = [];
  /** Inselschilder; entdeckte Inseln (IDs) setzt das Spiel */
  private labels: { sprite: Sprite; x: number; z: number; r: number; id: string }[] = [];
  discovered = new Set<string>();
  /** Rauchende Vulkankrater */
  private smokeVents: { x: number; y: number; z: number }[] = [];
  /** Stege als Strecke a→b mit halber Breite (Schiffskollision) */
  private piers: Pier[] = [];
  private lamps: Mesh[] = [];
  /** Inselgruppen (für das Ausblenden jenseits der Sichtweite) */
  private islandGroups: { g: Group; x: number; z: number; r: number; id: string }[] = [];
  private viewDist = 800;
  /** Lagerfeuer auf den Inseln (Rauch und Glut) */
  private campfires: { x: number; y: number; z: number }[] = [];
  /** Schornsteine der Dörfer */
  private chimneys: { x: number; y: number; z: number }[] = [];
  /** Kacheln mit Gras, Blumen, Farn und Büschen: jenseits ihrer Sichtweite ausgeblendet */
  private vegChunks: VegChunk[] = [];
  private vegLod = 1;
  /** Dorfmitte der handgebauten Länder (dort schlendern die Bewohner) */
  private villages = new Map<string, { x: number; z: number; r: number }>();
  /** Krabben, Schildkröten, Vögel, Glühwürmchen und springende Fische */
  readonly fauna: IslandFauna;
  private spray: ParticleSystem;
  private sparks: ParticleSystem;
  /** Pulverdampf, Schornsteine, Vulkane, Rauchsäulen */
  readonly smoke: SmokeSystem;
  /** Splitter, Planken und Fässer */
  readonly debris: DebrisSystem;
  private wake: WakePoint[] = [];

  private player: Character | null = null;
  private foot: PlayerFoot | null = null;
  private npcs: Npc[] = [];
  private outlineNpcs = true;

  private x = 0;
  private z = 0;
  private heading = 0;
  private speed = 0;
  private boostCd = 0;
  private cdBow = 0;
  private shake = 0;
  private edgeWarned = false;

  private camYaw = 0;
  private camPitch = 0.3;
  private camDist = 22;
  /** Blickrichtung der Seekamera (folgt Schiff oder Gegner) */
  private seaYaw = 0;
  private camIdle = 0;
  /** Geglättete Seekamera: Blickwinkel, Abstand, Höhe und Ankerpunkt werden einzeln nachgeführt (sonst schneidet die Kamera beim Umschwenken durchs Schiff) */
  private lampPool!: LampPool;
  private glow!: GlowSystem;
  private glowNight = 0;
  /** Unsichtbare feste Träger für echte Lichter an Feuern und Fackeln (LampPool wählt die nächsten) */
  private fireCarriers: Object3D[] = [];
  private windowCarriers = 0;
  private lampList: Object3D[] = [];
  private camAz = 0;
  /** Kameraradius und Höhenwinkel der Schiffskamera (geglättet) */
  private camR = 0;
  private camE = 0;
  /** Draufsicht 0 … 1: wächst, wenn man über den größten Zoom hinaus herauszoomt (Ziel und geglätteter Wert) */
  private camTop = 0;
  private camTopS = 0;
  /** Segel gerade durchsichtig (zu Fuß an Deck oder in der Draufsicht)? */
  private sailFaded = false;
  private camAx = 0;
  private camAz2 = 0;
  private camSailInit = false;
  private footYaw = 0;
  /** Zielerfassung: Überblendfaktor 0 … 1 und letzte Richtung zum Ziel (für den Kamera-Ausschnitt) */
  private prevLock: { alive: boolean } | null = null;
  private lockK = 0;
  private lockDX = 0;
  private lockDZ = 0;
  private footPitch = 0.32;
  private footDist = 7;
  /** Titelbild: Kamerafahrt des Prachtschiffs in drei Stimmungen (siehe titleDirector.ts) */
  readonly title: TitleDirector;
  private tmp = new Vector3();
  private fwdTmp = new Vector3();
  private npcTmp = new Vector3();

  /** Inseln-Aufbau als Generator: je Insel ein Schritt (siehe buildSteps) */
  private islandSteps: Generator<number, IslandShape[]>;

  /**
   * deferred = true: die Inseln werden NICHT im Konstruktor gebaut, sondern stückweise über `buildSteps()` (Ladebildschirm:
   * der Browser bleibt dazwischen ansprechbar und der Balken bewegt sich). Ohne Angabe läuft alles wie bisher in einem Zug.
   */
  constructor(deferred = false) {
    installMatrixSkip(this.scene);
    this.env = new Environment(this.scene);
    this.ship = new Ship(this.scene, 0, DEFAULT_SHIP_LOOK('pirat'), 'pirat', 0, true);
    this.boat = this.ship.model.group;
    this.docking = new DockingSystem({
      scene: this.scene, ground: this.ground, composite: this.composite, ship: this.ship,
      ownDeck: () => this.ownDeckGround(),
      waterY: (x, z) => this.env.heightAt(x, z),
      say: (t) => this.onMessage(t),
      onBoard: (ph) => this.onBoardPhase(ph),
      bump: (x, y, z) => { this.shake = Math.max(this.shake, 0.5); audio.play('crack', 0.7, { x, y, z }); this.spray.emit(26, x, this.env.heightAt(x, z), z, { speed: 5, up: 4.5, life: 1.1, color: new Color(0.85, 0.92, 0.95), gravity: 12, spread: 3.5 }); },
    });
    this.ship.onRepaired = (r) => {
      this.onMessage(r.sail > 0.5 || r.hull > 0.5 ? `Geflickt: Segel +${Math.round(r.sail)} HP${r.hull > 0.5 ? `, Rumpf +${Math.round(r.hull)}` : ''}.` : 'Fertig geflickt.');
      audio.play('level', 0.4);
    };

    this.fauna = new IslandFauna(this.scene);
    this.lampPool = new LampPool(this.scene, 6);
    glowHub.clear();
    this.glow = new GlowSystem(this.scene);
    this.ground.piers = this.piers;
    this.islandSteps = this.buildIslands();
    this.islandSteps.next(); // legt islandDefs an
    this.spray = new ParticleSystem(this.scene, false, 0.8);
    this.sparks = new ParticleSystem(this.scene, true, 0.32);
    this.dust = new ParticleSystem(this.scene, false, 0.7);
    this.fauna.spray = this.spray;
    this.fauna.sparks = this.sparks;
    this.smoke = new SmokeSystem(this.scene);
    setElementSmoke(this.smoke);
    this.debris = new DebrisSystem(this.scene);
    this.debris.onSplash = (x, z, big) => {
      this.spray.emit(big ? 14 : 5, x, this.env.heightAt(x, z) + 0.1, z, { speed: big ? 2.5 : 1.5, up: big ? 5 : 3, life: 0.8, color: FOAM_COL, spread: 0.3 });
    };
    // Meereswerte für die Fahrphysik im Titelbild: ohne Sturmschaden an den Segeln (dort reißt nichts), ein Objekt für alle Schritte
    const titleSea: SeaEnv = { heightAt: (x, z) => this.env.heightAt(x, z), windDir: 0, windStrength: 0, storm: 0, time: 0 };
    this.title = new TitleDirector({
      env: this.env,
      ship: this.ship,
      seaEnv: () => { titleSea.windDir = this.env.windDir; titleSea.windStrength = this.env.weather.p.wind; titleSea.time = this.env.clock; return titleSea; },
      sea: (x, z) => this.env.heightAt(x, z),
      free: (x, z, r) => !this.ground.islandAt(x, z, r) && !this.piers.some((p) => distToSegment(x, z, p.ax, p.az, p.bx, p.bz) < r + p.hw),
      moved: (cut) => {
        const s = this.ship;
        this.x = s.x; this.z = s.z; this.heading = s.heading; this.speed = s.speed;
        if (cut) { this.wake = []; this.env.ocean.setWake(this.wake); this.seaYaw = s.heading; }
      },
    });
    if (!deferred) for (const _ of this.buildSteps()) { /* alles in einem Zug */ }
  }

  /** Inseln, Städte und Bojen aufbauen: liefert nach jeder Insel den Fortschritt 0 … 1 (der Aufrufer gibt dem Browser dazwischen Luft) */
  *buildSteps(): Generator<number, void> {
    let r = this.islandSteps.next();
    while (!r.done) { yield r.value; r = this.islandSteps.next(); }
    this.islands = r.value;
    this.env.setIslands(this.islands);
    this.buildBuoys();
  }

  /** Wind als Vektor (m/s) für Rauch und Treibgut */
  private windVec() {
    const k = 1.5 + this.env.weather.p.wind * 7;
    return { x: Math.sin(this.env.windDir) * k, z: Math.cos(this.env.windDir) * k };
  }

  /** Verzögerte Ereignisse in Spielzeit (stehen in der Pause still, verschwinden mit der Welt) */
  private timers: { t: number; fn: () => void }[] = [];
  private later(sec: number, fn: () => void) { this.timers.push({ t: sec, fn }); }
  private runTimers(dt: number) {
    if (!this.timers.length) return;
    const due: (() => void)[] = [];
    let n = 0;
    for (const t of this.timers) { t.t -= dt; if (t.t <= 0) due.push(t.fn); else this.timers[n++] = t; }
    this.timers.length = n;
    for (const fn of due) fn();
  }

  private updateAir(dt: number) {
    this.runTimers(dt);
    const w = this.windVec();
    this.smoke.wind = w;
    this.glow.wind = w;
    this.smoke.update(dt);
    this.debris.update(dt, (x, z) => this.env.heightAt(x, z), w);
    this.rainSplashes(dt);
  }

  private splashAcc = 0;
  /** Regentropfen spritzen rund um die Spielfigur auf Boden, Deck und Wasser auf */
  private rainSplashes(dt: number) {
    const rain = this.env.weather.p.rain;
    if (rain < 0.2) { this.splashAcc = 0; return; }
    this.splashAcc += dt * (rain - 0.1) * 70;
    if (this.splashAcc < 1) return;
    const pp = this.playerPos;
    const g = this.groundProxy;
    while (this.splashAcc >= 1) {
      this.splashAcc -= 1;
      const a = Math.random() * Math.PI * 2, r = 1.5 + Math.sqrt(Math.random()) * 13;
      const x = pp.x + Math.sin(a) * r, z = pp.z + Math.cos(a) * r;
      const gy = g.height(x, z), wy = this.env.heightAt(x, z);
      const y = Number.isFinite(gy) ? Math.max(gy, wy) : wy;
      // Aufprall: auf Wasser ein Ring (und nur ein feiner Spritzer), auf festem Grund (Deck, Sand, Steg) ein kleiner Spritzkranz mit Streuung
      const water = !Number.isFinite(gy) || gy <= wy + 0.02;
      if (water) {
        this.env.weather.addRing(x, wy, z);
        this.spray.emit(1, x, y + 0.04, z, { speed: 0.6, up: 1.4, life: 0.24, color: SPLASH_COL, gravity: 14, spread: 0.03, size: 0.22 });
        // weiter draußen nur Ringe: die Wasserfläche wirkt bis zum Horizont vom Regen aufgewühlt
        const fa = Math.random() * Math.PI * 2, fr = 14 + Math.sqrt(Math.random()) * 26;
        const fx = pp.x + Math.sin(fa) * fr, fz = pp.z + Math.cos(fa) * fr;
        if (!Number.isFinite(g.height(fx, fz))) this.env.weather.addRing(fx, this.env.heightAt(fx, fz), fz);
      } else {
        const big = Math.random() < 0.25;
        this.spray.emit(big ? 3 : 2, x, y + 0.04, z, { speed: big ? 1.3 : 0.9, up: big ? 2.4 : 1.8, life: big ? 0.36 : 0.28, color: SPLASH_COL, gravity: 14, spread: big ? 0.08 : 0.04, size: big ? 0.36 : 0.3 });
      }
    }
  }

  // ---------- Aufbau ----------

  private *buildIslands(): Generator<number, IslandShape[]> {
    const rnd = seeded(2024);
    const shapes: IslandShape[] = [];
    // Alle Regionen sind handgemacht: Bernsteinsee in der Mitte, fünf Meere im Ring
    const specs = REGIONS.flatMap((reg) => reg.islands.map((d) => ({
      x: d.x, z: d.z, r: d.r, hill: d.hill, palms: d.palms, tower: d.kind === 'lighthouse', def: d, kit: styleKit(d.biome ?? reg.style ?? 'tropisch'),
    })));
    this.islandDefs = specs.map((s) => s.def);
    yield 0;
    let built = 0;
    const stone = toon(0xe8e2d4);
    const red = toon(0xa8322a);

    for (const s of specs) {
      const { r } = s;
      const isl = new Group();
      isl.position.set(s.x, 0, s.z);
      const town = s.def.kind === 'town';
      // Jede Insel bekommt ihre eigene Form: langgezogen, gelappt, sichelförmig oder rund, mit 1–3 Hügeln.
      // Stadt, Häfen, Leuchtturm und Vulkane bleiben schlicht (ihre Bauten stehen um die Mitte).
      const shapeRnd = seeded(hashId(s.def.id));
      // schlicht (rund, ein Hügel in der Mitte) nur noch dort, wo ein Bauwerk die Mitte braucht: Stadt, Leuchtturm, Vulkan
      const volcanic = s.def.region === 'glut' && s.def.kind !== 'harbor' && s.def.kind !== 'treasure' && s.def.kind !== 'citadel' && s.def.kind !== 'marinefort';
      const simple = town || s.tower || volcanic;
      // Handgebaute Länder (Festland, neue Inseln) bringen Küste und Hügel aus ihren Daten mit
      const site = s.def.site ? SITES[s.def.site] : null;
      const form = site ? { coast: site.coast, hills: fitHills(r, site.coast, site.hills) } : makeIslandShape(r, s.hill, shapeRnd, simple);
      const walk: WalkIsland = { x: s.x, z: s.z, r, beachY: 1.3, hillY: 1.2, coast: form.coast, hills: form.hills.map((h) => ({ ...h, x: s.x + h.x, z: s.z + h.z })), shelf: shelfOf(r), blockers: [],
        // Relief: die Stadt bleibt fast eben, Dörfer und Wildnis rollen (Meter Ausschlag)
        reliefAmp: town ? 0.1 : site ? 0.55 : s.def.kind === 'harbor' || s.def.kind === 'quiet' ? 0.4 : 0.5, reliefSeed: hashId(s.def.id) & 0xffff };
      // Brandung und Flachwasser beginnen an der echten Wasserlinie (Böschung je nach Inselgröße)
      const wl = 1 + walk.shelf * WATERLINE;
      shapes.push({ x: s.x, z: s.z, r: r * coastMax(form.coast) * wl, coast: form.coast, base: r * wl });
      const kit = s.kit;
      const glow = new Set<Mesh>(this.lamps);
      // Grasfläche: üppig bis fast an den Strand oder karg mit viel Sand – je nach Region und Inselart
      const style = s.def.biome ?? styleOf(s.def.region);
      const lushK = style === 'tropisch' || style === 'nord' ? 1 : style === 'nebel' ? 0.8 : style === 'schlund' ? 0.6 : 0.35;
      const grassFrac = site ? site.grass : town ? 0.8 : s.def.kind === 'citadel' || s.def.kind === 'marinefort' ? 0.8 : s.def.kind === 'treasure' ? 0.35 + shapeRnd() * 0.25 : (0.45 + shapeRnd() * 0.4) * lushK + (1 - lushK) * 0.2;
      /** Bodenhöhe in Inselkoordinaten – dieselbe Rechnung wie beim Laufen */
      const solo = new IslandGround();
      solo.add(walk);
      const terrain = islandTerrain(kit, r, form.coast, form.hills, grassFrac, shapeRnd, town || site ? 0 : 0.45 + shapeRnd() * 0.55, walk.shelf, (lx, lz) => { const v = solo.height(s.x + lx, s.z + lz); return Number.isFinite(v) ? v : -1.7; });
      isl.add(terrain.beach, ...terrain.hills);
      // ab jetzt zählt die Wiesendecke zur Laufhöhe (Figuren, Häuser, Pflanzen stehen auf ihr); das Mesh ist schon gebaut
      walk.lift = terrain.liftAt;
      // Gelände-Meshes nicht mit anderem verschmelzen: sie werden nach dem Aufbau an eingeebnete Standflächen angepasst (terrain.refresh)
      glow.add(terrain.beach);
      for (const m of terrain.hills) glow.add(m);
      const hAt = (lx: number, lz: number) => Math.max(-2, solo.height(s.x + lx, s.z + lz));
      const hillTop = Math.max(...walk.hills.map((h) => h.r * h.h));
      // Eingeebnete Standflächen unter Bauten (siehe Pad in islandGround.ts); das Gelände-Mesh wird nach dem Aufbau nachgeführt
      walk.pads = [];
      const padBounds: [number, number, number, number][] = [];
      walk.addPad = (wx, wz, w, d, yaw, blend = 2.4, round = false) => {
        let sum = 0, n = 0;
        const c = Math.cos(yaw), sn = Math.sin(yaw);
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
          const lx = (i / 4 - 0.5) * w, lz = (j / 4 - 0.5) * d;
          const h = solo.islandHeight(walk, wx + lx * c + lz * sn, wz - lx * sn + lz * c, false, true);
          if (Number.isFinite(h)) { sum += h; n++; }
        }
        if (!n) return 0;
        const y = sum / n;
        const hw = round ? w / 2 : w / 2, hd = round ? w / 2 : d / 2;
        const R = Math.hypot(hw, hd) + blend;
        walk.pads!.push({ x: wx, z: wz, hw, hd, yaw, blend, y, r2: R * R, round });
        padBounds.push([wx - s.x - R, wz - s.z - R, wx - s.x + R, wz - s.z + R]);
        return y;
      };
      // Bäume, Sträucher, Gras und Felsen der Insel: gesammelt und am Ende als InstancedMesh gebaut
      const veg = new Scatter();
      const rocks = s.def.rocks ?? (rnd() < 0.4 && !s.tower && !town ? 1 : 0);
      const rockPick = hashId(s.def.id + 'fels');
      for (let k = 0; k < rocks; k++) {
        const a = rnd() * Math.PI * 2, rr = r * (0.35 + rnd() * 0.3);
        // Felsformation in menschlichem Maß (vorher überall dieselbe Felsnadel, bis über 30 m hoch):
        // jede Insel hat eine Hauptform aus ihrem Namen, dazwischen einzelne andere
        const size = Math.min(6.5, r * (0.065 + rnd() * 0.04));
        const kinds = ROCK_TYPES[style];
        const type = rnd() < 0.65 ? kinds[rockPick % kinds.length] : kinds[Math.floor(rnd() * kinds.length)];
        const f = rockFormation(type, kit, rnd, size);
        const fx = Math.cos(a) * rr, fz = Math.sin(a) * rr;
        f.g.position.set(fx, hAt(fx, fz) - 0.3, fz);
        isl.add(f.g);
        for (const b of f.blocks) walk.blockers.push({ x: s.x + fx + b.x, z: s.z + fz + b.z, r: b.r });
      }
      for (let k = 0; k < s.palms; k++) {
        const pa = town ? (k / s.palms) * Math.PI * 2 + rnd() * 0.2 : rnd() * Math.PI * 2;
        const pr = r * (town ? 0.84 + rnd() * 0.08 : 0.3 + rnd() * 0.55);
        const px = Math.cos(pa) * pr, pz = Math.sin(pa) * pr;
        // Tropen: geschwungene Palmen mit Kokosnüssen (die geraden Stangenpalmen der alten Karte sind Geschichte)
        const proto = style === 'tropisch' ? floraProto('tropisch', 'palme', Math.floor(rnd() * 4)) : cachedProto(`kit:${style}:plant:${Math.floor(rnd() * 4)}`, (prnd) => plant(kit, prnd), { collide: 0.45 });
        veg.add(proto, px, hAt(px, pz) - 0.1, pz, rnd() * Math.PI * 2, 1, 1, 0, (rnd() - 0.5) * (kit.flora === 'palme' ? 0.4 : 0.15));
        walk.blockers.push({ x: s.x + px, z: s.z + pz, r: 0.45 });
      }
      if (s.tower && !hasArch('leuchtturm')) {
        const tower = new Mesh(new CylinderGeometry(1.6, 2.4, 16, 12), stone);
        tower.position.set(0, 9, 0);
        const band = new Mesh(new CylinderGeometry(1.95, 2.05, 2, 12), red);
        band.position.set(0, 10, 0);
        const lamp = new Mesh(new SphereGeometry(1.4, 16, 10), new MeshBasicMaterial({ color: new Color(6, 5, 2.5) }));
        lamp.position.set(0, 18, 0);
        lamp.userData.noOutline = true;
        this.lamps.push(lamp);
        glowHub.add(makeEmitter('lamp', 0, 0, 0, { obj: lamp, size: 3.2 }));
        isl.add(tower, band, lamp);
        walk.blockers.push({ x: s.x, z: s.z, r: 2.5 });
      }
      // Vulkan-Glut auf den Hügeln des Glutrings
      if (volcanic) {
        const v = volcano(kit, r, 1.2 + r * 0.75 * s.hill * 0.5, s.def.kind === 'boss');
        isl.add(v.g);
        v.g.traverse((o) => { if (o.userData.noOutline) glow.add(o as Mesh); });
        walk.blockers.push({ x: s.x, z: s.z, r: v.radius * 0.95 });
        this.smokeVents.push({ x: s.x, y: v.top + 1, z: s.z });
      }
      // Außenposten-Hafen in den Regionen
      if (s.def.kind === 'harbor') {
        const lanterns: Mesh[] = [];
        const facing = Math.atan2(-s.x, -s.z);
        // Hafeninseln haben jetzt eine eigene Küstenform: der Steg setzt an der echten Wasserlinie an
        const e = r * coastK(form.coast, Math.atan2(Math.cos(facing), Math.sin(facing)));
        isl.add(outpost(e, facing, lanterns));
        const fx = Math.sin(facing), fz = Math.cos(facing);
        this.piers.push({ ax: s.x + fx * (e + OUTPOST_PIER.from), az: s.z + fz * (e + OUTPOST_PIER.from), bx: s.x + fx * (e + OUTPOST_PIER.to), bz: s.z + fz * (e + OUTPOST_PIER.to), hw: 1.5, y: 1.45 });
        for (const l of lanterns) { glow.add(l); glowHub.add(makeEmitter('lamp', 0, 0, 0, { obj: l, size: 0.8, glint: true })); }
        // Pfähle beiderseits und Laternenmast sind fest (Positionen wie in outpost())
        for (let d = e + 2; d <= e + OUTPOST_PIER.to - 1; d += 5) for (const sd of [-1, 1]) walk.blockers.push({ x: s.x + fx * d + fz * 1.6 * sd, z: s.z + fz * d - fx * 1.6 * sd, r: 0.22 });
        walk.blockers.push({ x: s.x + fx * (e + OUTPOST_PIER.to - 3) + fz * 1.2, z: s.z + fz * (e + OUTPOST_PIER.to - 3) - fx * 1.2, r: 0.16 });
      }
      // Natur, Bauten und Treibgut passend zu Region und Inselart
      if (site) {
        // Dörfer, Höfe, Türme und Ruinen mit Kollisions-Gitter, danach der Bewuchs des Bioms
        const built = buildSite({ group: isl, def: s.def, site, biome: style as Biome, walk, hAt, veg, density: texDetail.density });
        plantFactionBanners(isl, s.def, walk, hAt);
        this.campfires.push(...built.fires.map((f) => ({ x: s.x + f.x, y: f.y, z: s.z + f.z })));
        this.addGlows(built.glows, s.x, s.z);
        this.chimneys.push(...built.chimneys.map((f) => ({ x: s.x + f.x, y: f.y, z: s.z + f.z })));
        this.piers.push(...built.piers);
        this.villages.set(s.def.id, built.village);
        this.fauna.addIsland(s.def, s.x, s.z, r, built.trees.map((t) => ({ x: s.x + t.x, y: t.y, z: s.z + t.z })), built.bushes.map((b) => ({ x: s.x + b.x, y: b.y, z: s.z + b.z })), style, (ang) => r * coastK(form.coast, ang));
      } else if (!town) {
        const dressed = dressIsland({ group: isl, def: s.def, kit, walk, hAt, glow, density: texDetail.density, style, veg, liftAt: terrain.liftAt });
        this.campfires.push(...dressed.fires.map((f) => ({ x: s.x + f.x, y: f.y, z: s.z + f.z })));
        if (dressed.patrols.length) this.patrolRoutes.set(s.def.id, dressed.patrols.map((r) => r.map((p) => ({ x: s.x + p.x, z: s.z + p.z }))));
        this.addGlows(dressed.glows, s.x, s.z);
        this.fauna.addIsland(s.def, s.x, s.z, r, dressed.trees.map((t) => ({ x: s.x + t.x, y: t.y, z: s.z + t.z })), dressed.bushes.map((b) => ({ x: s.x + b.x, y: b.y, z: s.z + b.z })), style, (ang) => r * coastK(form.coast, ang));
      }
      // Gelände unter den Bauten einebnen: Mesh an die Standflächen anpassen (Laufhöhe folgt automatisch)
      if (walk.pads.length) {
        const Hn = (lx: number, lz: number) => { const v = solo.islandHeight(walk, s.x + lx, s.z + lz, false, true); return Number.isFinite(v) ? v : -1.7; };
        terrain.refresh(Hn, padBounds);
        padBounds.length = 0;
      }
      this.scene.add(isl);
      this.islandGroups.push({ g: isl, x: s.x, z: s.z, r, id: s.def.id });
      mergeByMaterial(isl, glow);
      // Fenster und Lampen der Dörfer (ein gemeinsames Leuchtmaterial): weder Kontur noch Schatten
      isl.traverse((o) => {
        const mm = (o as Mesh).material as Material | Material[] | undefined;
        if (mm && !Array.isArray(mm) && mm.userData.glow) o.userData.noOutline = true;
      });
      // instanzierter Bewuchs erst nach dem Verschmelzen (InstancedMesh darf nicht mit verschmolzen werden)
      this.vegChunks.push(...veg.build(isl));
      // Namensschild (wie in 1.0): erscheint, sobald die Insel entdeckt ist
      const label = islandLabel(s.def.name, s.def.kind, s.def.level, site?.label, s.def.factionId ? FACTIONS[s.def.factionId].name : undefined);
      label.position.set(s.x, 1.2 + hillTop + 22, s.z);
      label.visible = false;
      this.scene.add(label);
      this.labels.push({ sprite: label, x: s.x, z: s.z, r, id: s.def.id });
      isl.traverse((o) => {
        if ((o as Mesh).isMesh && !o.userData.noOutline) { o.castShadow = true; o.receiveShadow = true; }
      });
      addOutlines(isl);
      this.ground.add(walk);
      if (town) {
        // Steg nach Süden (siehe buildTown): ragt weit über den Inselrand hinaus
        this.piers.push({ ax: s.x, az: s.z - r + 5, bx: s.x, bz: s.z - r - 75, hw: 2.4, y: 1.65 });
        this.town = buildTown(s.def, walk, (x, z) => { const h = this.ground.height(x, z); return Number.isFinite(h) ? h : 1.3; });
        this.scene.add(this.town.group);
        walk.walkways = this.town.streets;
        if (padBounds.length) {
          const Hn2 = (lx: number, lz: number) => { const v = solo.islandHeight(walk, s.x + lx, s.z + lz, false, true); return Number.isFinite(v) ? v : -1.7; };
          terrain.refresh(Hn2, padBounds);
          padBounds.length = 0;
        }
        // Wiese und Strand von Ankerglück: Gras, Blumen, Büsche, Treibholz – nur abseits von Straßen und Bauten
        {
          const tv = new Scatter();
          const trnd = seeded(hashId(s.def.id) ^ 0x51ed);
          const dens = Math.max(0.4, Math.min(1.6, texDetail.density));
          const near = (px: number, pz: number, rr: number) => {
            const wx = s.x + px, wz = s.z + pz;
            if (Math.hypot(px, pz) < 17.8 + rr) return true; // Marktplatz
            for (const st of walk.walkways ?? []) {
              for (let i = 1; i < st.pts.length; i++) {
                const [ax, az] = st.pts[i - 1], [bx, bz] = st.pts[i];
                const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
                const t = clamp01(((wx - ax) * dx + (wz - az) * dz) / l2);
                if (Math.hypot(wx - (ax + dx * t), wz - (az + dz * t)) < st.w / 2 + 0.9 + rr) return true;
              }
            }
            return walk.blockers.some((b) => (b.hw !== undefined ? inBox(b, wx, wz, rr + 0.5) : Math.hypot(wx - b.x, wz - b.z) < b.r + rr + 0.3));
          };
          const put = (kind: 'gras' | 'blume' | 'busch' | 'halme' | 'treibholz', n: number, d0: number, d1: number, rr: number, sc: [number, number], minH: number, maxH = 99) => {
            for (let i = 0; i < n; i++) {
              const a = trnd() * Math.PI * 2, d = r * coastK(form.coast, a) * (d0 + trnd() * (d1 - d0));
              const x = Math.cos(a) * d, z = Math.sin(a) * d, h = hAt(x, z);
              if (h < minH || h > maxH || near(x, z, rr)) continue;
              const k = sc[0] + trnd() * (sc[1] - sc[0]);
              veg_add(floraProto('tropisch', kind, Math.floor(trnd() * 3)), x, h, z, trnd() * 6.28, k, k * (0.85 + trnd() * 0.3));
            }
          };
          const veg_add = (p: ReturnType<typeof floraProto>, x: number, y: number, z: number, yaw: number, sx: number, sy: number) => tv.add(p, x, y, z, yaw, sx, sy);
          put('gras', Math.round(r * 34 * dens), 0.1, 0.92, 0.2, [0.9, 1.7], 1.0);
          put('blume', Math.round(r * 8 * dens), 0.15, 0.8, 0.2, [0.9, 1.5], 1.0);
          put('busch', Math.round(r * 0.9 * dens), 0.2, 0.85, 0.9, [0.8, 1.3], 1.0);
          put('halme', Math.round(r * 7 * dens), 0.7, 0.97, 0.3, [0.9, 1.6], 0.8, 1.6);
          put('treibholz', 3, 0.9, 0.98, 1.2, [0.85, 1.35], 0.5, 1.4);
          this.vegChunks.push(...tv.build(isl));
        }
        this.addGlows(this.town.glows.map((g2) => ({ ...g2, x: g2.x, z: g2.z })), s.x, s.z);
        // Laternen der Hafenstadt: Lichthof und Bodenlicht (Glas-Kugeln aus town.ts; Fensterflächen leuchten selbst)
        this.town.group.updateMatrixWorld(true);
        const tq = new Quaternion();
        for (const l of this.town.lights) {
          const v = l.getWorldPosition(new Vector3());
          if ((l.geometry as { type?: string }).type === 'SphereGeometry') {
            const em = glowHub.add(makeEmitter('lamp', v.x, v.y, v.z, { size: 1.25, ground: v.y - 2.3, pool: 10 }));
            // Straßenlaterne: auch ein echtes, weiches Licht (der LampPool nimmt die nächsten)
            const c = new Object3D();
            c.userData.seed = em.seed; c.userData.fire = false; c.userData.fixed = true; c.userData.lightK = 1.9;
            c.position.set(v.x, v.y - 0.1, v.z);
            this.scene.add(c);
            c.updateMatrixWorld(true);
            this.fireCarriers.push(c);
            continue;
          }
          // Fensterflächen: Hof und Lichtfleck auf dem Boden vor dem Fenster (Blickrichtung aus der Drehung der Fläche)
          const n = new Vector3(0, 0, 1).applyQuaternion(l.getWorldQuaternion(tq));
          glowHub.add(makeEmitter('window', v.x, v.y, v.z, { size: 0.5, ground: v.y < 3.2 ? v.y - 1.9 : null, pool: 2.8, pdx: n.x * 1.3, pdz: n.z * 1.3 }));
        }
      }
      yield ++built / specs.length;
    }
    return shapes;
  }

  private buildBuoys() {
    const rnd = seeded(77);
    const body = toon(0xf3e6c8);
    const bandMat = toon(0xa8322a);
    for (let i = 0; i < 14; i++) {
      const g = new Group();
      let x = (rnd() - 0.5) * 500;
      let z = (rnd() - 0.5) * 500;
      if (this.ground.islandAt(x, z, 20)) { x += 120; z -= 80; }
      const m = new Mesh(new ConeGeometry(0.9, 2.2, 10), body);
      m.position.y = 0.6;
      const band = new Mesh(new CylinderGeometry(0.62, 0.72, 0.4, 10), bandMat);
      band.position.y = 0.7;
      m.castShadow = true;
      const col = i % 2 ? new Color(4, 0.5, 0.4) : new Color(0.5, 4, 0.8);
      const lamp = new Mesh(new SphereGeometry(0.3, 10, 8), new MeshBasicMaterial({ color: col }));
      lamp.position.y = 1.9;
      lamp.userData.noOutline = true;
      g.add(m, band, lamp);
      addOutlines(g);
      this.scene.add(g);
      this.buoys.push({ g, x, z, lamp });
      glowHub.add(makeEmitter('lamp', 0, 0, 0, { obj: lamp, size: 0.55, glint: true, color: i % 2 ? new Color(3.4, 0.5, 0.4) : new Color(0.5, 3.4, 0.8) }));
    }
  }

  /** Spielfigur und Bewohner erzeugen, sobald die Figuren-Daten geladen sind */
  /** Shader aller Figuren- und Effektarten vorkompilieren (beim Laden, hinter dem Ladebildschirm) */
  async warmup(renderer: WebGLRenderer, renderFrame: () => void, progress: (k: number) => void, onBlocking?: (on: boolean) => void, precompile?: () => Promise<void>) {
    if (!this.assets || !this.fx) { progress(1); return; }
    // Partikelsysteme einmal anstoßen (Puffer, Attribute, erste Aktualisierung), dann sofort ablaufen lassen
    const at = this.camera.position;
    this.spray.emit(24, at.x, 0.5, at.z + 8, { speed: 3, up: 5, life: 0.6, color: FOAM_COL, spread: 1 });
    this.dust.emit(12, at.x, 0.5, at.z + 8, { speed: 2, up: 3, life: 0.6, color: DIG_COL, spread: 1 });
    this.sparks.emit(12, at.x, 0.5, at.z + 8, { speed: 4, up: 4, life: 0.6, color: EMBER_COL, spread: 1 });
    await warmupShaders({ renderer, scene: this.scene, camera: this.camera, assets: this.assets, fx: this.fx, particles: this.sparks, renderFrame, onBlocking, precompile }, progress);
    this.spray.update(10); this.dust.update(10);
  }

  setCharacters(assets: CharacterAssets, look: CharacterLook, style: StyleId, overlay?: CombatOverlay) {
    for (const _ of this.setCharactersSteps(assets, look, style, overlay)) { /* in einem Zug */ }
  }

  /** Wie setCharacters, liefert aber nach jeder Figur den Fortschritt 0 … 1 (Ladebildschirm) */
  *setCharactersSteps(assets: CharacterAssets, look: CharacterLook, style: StyleId, overlay?: CombatOverlay): Generator<number, void> {
    this.assets = assets;
    this.player?.dispose();
    this.player = new Character(assets, look, true);
    this.scene.add(this.player.holder);
    if (overlay) this.overlay = overlay;
    if (!this.combat && this.overlay) {
      this.fx = new CombatFx(this.scene, this.sparks, this.dust);
      this.fx.decals.ground = (x, z) => this.groundProxy.height(x, z);
      this.naval = new NavalSystem(this.scene, this.seaEnv, this.fx, this.overlay, this.spray, this.sparks, this.ground, {
        shake: (a) => { this.shake = Math.max(this.shake, a); },
        hitstop: (t) => { this.hitstop.t = Math.max(this.hitstop.t, t); this.hitstop.scale = 0.05; },
        message: (t) => this.onMessage(t),
        sunk: (e) => this.onShipSunk(e),
        loot: (g, shard) => this.onLoot(g, shard),
        battleStart: (m, w) => this.onBattleStart(m, w),
        battleEnd: (r) => this.onBattleEnd(r),
      });
      this.naval.player = this.ship;
      this.naval.bountyOf = (id) => this.bountyOf(id);
      this.naval.standingOf = (id) => this.standingOf(id);
      this.naval.smoke = this.smoke;
      this.naval.detail = this.smoke.scale;
      this.naval.debris = this.debris;
      this.combat = new CombatSystem(this.scene, this.fx, this.overlay, assets, this.groundProxy, {
        heal: (n) => { if (this.foot) this.foot.hp = Math.min(this.foot.maxHp, this.foot.hp + n); },
        hitstop: (t, scale = 0.05) => { this.hitstop.t = Math.max(this.hitstop.t, t); this.hitstop.scale = Math.min(this.hitstop.scale, scale); },
        shake: (a) => { this.shake = Math.max(this.shake, a); },
        impact: (dx, dz, k) => this.impact(dx, dz, k),
        kill: (e) => this.onKill(e),
        gold: (n) => this.onGold(n),
        message: (t) => this.onMessage(t),
        loot: (d) => this.onLootDrop(d),
      });
      this.combat.smoke = this.smoke;
      this.combat.onSpawn = (o) => this.warmHook?.(o);
      const home = this.ground.islands[0];
      this.combat.addDummy(home.x + 6, home.z - home.r * 0.55);
      this.combat.addDummy(home.x - 6, home.z - home.r * 0.55);
    }
    this.combat?.leaveIsland();
    this.events.cancel();
    this.foot = new PlayerFoot(this.player, style, {
      combat: this.combat, fx: this.fx, overlay: this.overlay,
      onDown: () => { this.downT = 3.2; this.onPlayerDown(); },
      onSwap: (st) => { this.style = st; this.equip(st); this.onWeaponSwapped(st); },
    });
    if (this.combat) this.combat.player = this.foot;
    this.style = style;
    this.faji = null;
    this.equip(style);
    this.attachToHelm();
    yield 0.1;

    if (!this.npcs.length) {
      const rng = seeded(4242);
      const home = this.ground.islands[0];
      const roles: NpcRole[] = ['fischer', 'haendler', 'pirat', 'koch', 'buerger', 'pirat', 'buerger', 'buerger', 'fischer', 'haendler'];
      const total = TOWN_NPCS.length + roles.length;
      let made = 0;
      // Ladenbesitzer und wichtige Bewohner an festen Plätzen
      for (const d of TOWN_NPCS) {
        const n = new Npc(assets, home, this.ground, d.role, rng, this.outlineNpcs);
        n.pin(home.x + d.x, home.z + d.z, d.yaw);
        n.townDef = d;
        this.scene.add(n.char.holder);
        this.npcs.push(n);
        yield 0.1 + 0.85 * (++made / total);
      }
      for (const role of roles) {
        const n = new Npc(assets, home, this.ground, role, rng, this.outlineNpcs);
        this.scene.add(n.char.holder);
        this.npcs.push(n);
        yield 0.1 + 0.85 * (++made / total);
      }
    }
    if (!this.crew) this.crew = new CrewAboard(assets, true);
    if (!this.life) {
      this.life = new SeaLife(this.scene, this.islandDefs, this.spray);
      for (let i = 0; i < 2; i++) this.spawnFloaterSomewhere('raft');
      this.spawnFloaterSomewhere('bottle');
    }
  }

  /** Floß oder Flasche irgendwo in der Bernsteinsee, nicht auf Inseln */
  private spawnFloaterSomewhere(kind: 'raft' | 'bottle') {
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, d = 150 + Math.random() * 650 * WORLD_SCALE;
      const x = BERNSTEINSEE.x + Math.cos(a) * d, z = BERNSTEINSEE.z + Math.sin(a) * d;
      if (!this.ground.islandAt(x, z, 40)) { this.life?.spawnFloater(kind, x, z); return; }
    }
  }

  /** Grabstellen für Schatzkarten und Schatz-Aufträge setzen */
  setDigs(islandIds: string[]) {
    if (!this.life) return;
    for (const d of [...this.life.digs]) if (!islandIds.includes(d.island)) this.life.removeDig(d);
    for (const id of new Set(islandIds)) {
      if (this.life.digs.some((d) => d.island === id)) continue;
      const def = this.islandDefs.find((i) => i.id === id);
      if (def) this.life.addDig(def, (x, z) => { const h = this.ground.height(x, z); return Number.isFinite(h) ? h : 1.3; });
    }
  }

  /** Fähigkeiten der Spielfigur einrichten (nach dem Laden eines Spielstands) */
  setSkills(skills: SkillState, level: number) {
    if (!this.player || !this.foot || !this.combat || !this.fx || !this.overlay) return;
    this.faji = new FajiController(skills, this.foot, this.player, this.combat, this.fx, this.sparks, this.scene, this.groundProxy, this.overlay,
      (a) => { this.shake = Math.max(this.shake, a); },
      (t) => { this.hitstop.t = Math.max(this.hitstop.t, t); this.hitstop.scale = 0.05; });
    this.faji.refresh(level, this.style);
    this.faji.onEmpty = () => this.onOpenSkills();
  }

  /** Waffe wechselt (Wechselschlag oder Ruhe): Spiel rechnet Fähigkeiten-Werte neu */
  onWeaponSwapped: (style: StyleId) => void = () => {};

  /** Waffenwechsel zu Fuß; false, wenn gerade nicht möglich */
  swapWeapon(style: StyleId): boolean {
    if (this.mode !== 'foot' || !this.foot) return false;
    return this.foot.swapTo(style, null);
  }

  /** Kampfstil der Spielfigur im Moment */
  get currentStyle(): StyleId { return this.style; }

  /** Aussehen und Kampfstil der Spielfigur ändern */
  updatePlayer(look: CharacterLook, style: StyleId) {
    if (!this.player || !this.foot) return;
    this.player.setLook(look);
    this.foot.style = style;
    this.style = style;
    this.equip(style);
    if (this.mode === 'sail') this.player.play('steer', { fade: 0.01 });
  }

  /** Aussehen der gekauften Klinge */
  weaponLook: { blade: string; glow?: boolean } = { blade: '#C9D2DA' };
  setWeaponLook(look: { blade: string; glow?: boolean }) {
    if (look.blade === this.weaponLook.blade && look.glow === this.weaponLook.glow) return;
    this.weaponLook = look;
    this.equip(this.style);
  }

  /** Schild in der Nebenhand (Farbe) oder null; wird nur getragen, wenn der Kampfstil die linke Hand frei lässt */
  private offhand: string | null = null;
  setOffhand(color: string | null) {
    if (color === this.offhand) return;
    this.offhand = color;
    this.equip(this.style);
  }

  private equip(style: StyleId) {
    if (!this.player) return;
    // Am Steuer sind die Hände am Rad: keine Waffe in der Hand (sie kommt beim Verlassen des Ruders wieder)
    if (this.mode === 'sail') { this.player.hold('r', null, 0.8); this.player.hold('l', null, 0.8); return; }
    const w = weaponsFor(style, this.weaponLook);
    this.player.hold('r', w.right);
    this.player.hold('l', w.left ?? (this.offhand && style !== 'zweihaender' && style !== 'langklinge' ? shieldFor(this.offhand) : null));
  }

  private attachToHelm() {
    if (!this.player) return;
    this.boat = this.ship.model.group;
    this.boat.add(this.player.holder);
    this.player.holder.position.copy(this.ship.model.helm);
    this.player.holder.scale.setScalar(1);
    this.player.holder.rotation.set(0, 0, 0);
    this.player.hold('r', null, 0.8);
    this.player.hold('l', null, 0.8);
    this.player.play('steer', { fade: 0.2 });
  }

  /** Figuren weiter weg als das werden nicht gezeichnet (je Grafikstufe) */
  private figureDist = 110;
  private cullFigures() {
    const cp = this.camera.position;
    const lim = this.figureDist * this.figureDist;
    const set = (h: { position: Vector3; visible: boolean } | undefined) => { if (h) h.visible = (h.position.x - cp.x) ** 2 + (h.position.z - cp.z) ** 2 < lim; };
    for (const n of this.npcs) set(n.char.holder);
    for (const e of this.combat?.enemies ?? []) set(e.char.holder);
    for (const a of this.crew?.allies ?? []) set(a.char.holder);
    // Raid: die Hauptkarte ruht (Inseln, Bewuchs, Stadt unsichtbar; matrixSkip überspringt unsichtbare Teilbäume), nur die Instanz wird gezeichnet
    if (this.raid) {
      for (const i of this.islandGroups) i.g.visible = false;
      for (const c of this.vegChunks) c.mesh.visible = false;
      if (this.town) this.town.group.visible = false;
      this.raid.world?.cull(cp.x, cp.z, this.vegLod);
      return;
    }
    // Inseln im Nebel jenseits der Sichtweite gar nicht erst zeichnen (spart auf Handys viele Zeichenaufrufe)
    const vd = this.viewDist * 1.05;
    for (const i of this.islandGroups) i.g.visible = Math.hypot(i.x - cp.x, i.z - cp.z) < vd + i.r * 1.2;
    // Gras, Blumen und Büsche nur in der Nähe zeichnen (Kacheln mit eigener Sichtweite)
    for (const c of this.vegChunks) {
      const dx = c.x - cp.x, dz = c.z - cp.z, lim = c.max * this.vegLod + c.r;
      c.mesh.visible = dx * dx + dz * dz < lim * lim;
    }
    const home = BERNSTEINSEE.islands[0];
    if (this.town) this.town.group.visible = Math.hypot(home.x - cp.x, home.z - cp.z) < vd + home.r * 1.5;
  }

  applyQuality(c: QualityConfig) {
    this.figureDist = c.figureDistance;
    this.lampPool.setCount(c.lamps);
    this.lampPool.setShadows(c.shadows.enabled && c.shadows.cascades >= 2);
    this.glow.quality = c.lamps > 0 ? 1 : 0.5;
    this.glow.heat = !!c.post.heat;
    this.viewDist = c.viewDistance;
    // Sparstufen des Leistungs-Wächters kürzen die Sichtweite von Gras, Büschen und Blumen (weniger Zeichenaufrufe)
    this.vegLod = Math.max(0.4, Math.min(1.25, c.viewDistance / 800)) * (1 - 0.17 * (c.budget ?? 0));
    this.env.applyQuality(c);
    this.spray.scale = c.particles;
    this.sparks.scale = c.particles;
    this.dust.scale = c.particles;
    this.smoke.scale = c.particles;
    if (this.naval) this.naval.detail = c.particles;
    this.debris.scale = c.particles;
    if (this.fx) this.fx.scale = c.particles;
  }

  // ---------- Spielstand ----------

  getState(): SeaState {
    // Während eines Raids gilt als Lage des Schiffs der Ausgangsort (die Instanz wird nie gespeichert)
    const o = this.raid?.originPos;
    return { boat: o ? { x: o.x, z: o.z, heading: o.heading } : { x: this.x, z: this.z, heading: this.heading }, env: this.env.getState() };
  }

  setState(s: Partial<SeaState>) {
    if (s.boat) {
      this.x = s.boat.x; this.z = s.boat.z; this.heading = s.boat.heading;
      // nie an Land aufwachen (alte Spielstände nach dem Umbau der Karte, Teleport): an die nächste Küste hinaus
      const isl = this.ground.islandAt(this.x, this.z, 14);
      if (isl) { const p = this.ground.pushOut(isl, this.x, this.z, isl.r * 0.14 + 18); this.x = p.x; this.z = p.z; }
    } else {
      this.x = HOME_SPAWN.x; this.z = HOME_SPAWN.z; this.heading = HOME_SPAWN.heading;
    }
    if (s.env) this.env.setState(s.env);
    this.speed = 0;
    this.camYaw = 0;
    this.camTop = this.camTopS = 0;
    this.wake = [];
    const sh = this.ship;
    sh.x = this.x; sh.z = this.z; sh.heading = this.heading; sh.speed = 0; sh.sailLevel = 1; sh.throttle = 0.5; this.seaYaw = this.heading;
    sh.prev = { x: sh.x, z: sh.z, heading: sh.heading };
    this.naval?.clear();
    this.docking.reset();
    if (this.boarding) this.boarding.boarded = false;
    this.boarding = null; this.preyDG = null; this.boardWon = false; this.boardRetreat = false; this.homeSent = false; this.landed = false;
    if (this.mode === 'foot') {
      this.combat?.leaveIsland();
      this.crew?.clearAllies();
      this.endLandCombat();
      if (this.combat) this.combat.allies = [];
      this.events.cancel();
      if (this.foot) { this.foot.onFoot = false; this.foot.revive(); }
      this.downT = 0;
      if (this.ownDeck) { this.ownDeck = false; this.deckGround = null; this.setSailFade(this.ship, false); }
      this.setMode('sail');
    }
  }

  /** Eigenes Schiff: Klasse, Aussehen, Munition, Zustand (aus Spielstand oder Werft) */
  setShip(tier: number, look: ShipLook, ammo: AmmoId, hullFrac: number, faction: Faction, sailFrac?: number, crewFrac?: number, troopHeads?: number) {
    // neues Schiffsmodell: Deck und Brücken hängen am alten – abbauen und danach (falls es am Steg lag) neu festmachen
    const wasMoored = !!this.ship.moored && this.mode === 'sail';
    this.docking?.reset();
    this.ownDG = null;
    const onBoard = this.player && this.player.holder.parent === this.ship.model.group;
    if (onBoard) this.scene.add(this.player!.holder);
    this.ship.rebuild(tier, look, this.hullBonus);
    (this.ship as any).faction = faction;
    this.ship.ammo = ammo;
    this.ship.hull = Math.max(1, this.ship.maxHull * Math.max(0.05, Math.min(1, hullFrac)));
    if (sailFrac !== undefined) this.ship.sail = sailFrac;
    if (crewFrac !== undefined) this.ship.crew = crewFrac;
    if (troopHeads !== undefined) this.ship.setTroopHeads(troopHeads);
    this.ship.x = this.x; this.ship.z = this.z; this.ship.heading = this.heading;
    this.ship.prev = { x: this.x, z: this.z, heading: this.heading };
    this.boat = this.ship.model.group;
    if (this.naval) this.naval.player = this.ship;
    if (this.mode === 'sail') this.attachToHelm();
    this.crew?.setDeck(this.ship, this.crewHired, this.crewTroops);
    if (wasMoored) { const b = this.docking.findBerth(); if (b) this.docking.moor(b); }
  }

  /** Crew an Bord und Landtrupp einstellen (`party` = die Offiziere, die auf dieser Schiffsklasse mitkämpfen; `troops` = Massentruppen an Bord) */
  setCrew(hired: string[], party: string[], loyalty: Record<string, number>, level: number, allyBuff: number, troops: TroopRoster = this.crewTroops) {
    this.crewHired = [...hired];
    this.crewParty = [...party];
    this.crewLoyalty = loyalty;
    this.crewLevel = level;
    this.allyBuff = allyBuff;
    this.crewTroops = { ...troops };
    // während eines Gefechts steht der Bestand am Ort des Kampfes (die Deck-Anzeige bleibt ausgeblendet, bis die Truppen zurück sind)
    this.crew?.setDeck(this.ship, this.crewHired, this.crew.squadsActive ? {} : this.crewTroops);
  }

  /** Bestand der Massentruppen an Bord ändern (Anheuern, Verluste, Rückkehr): die Deck-Anzeige folgt */
  setTroops(troops: TroopRoster) {
    this.crewTroops = { ...troops };
    if (this.crew && !this.crew.squadsActive) this.crew.setDeckTroops(this.ship, this.crewTroops);
  }

  /** Befehl an Offiziere und Trupps: Sturmangriff, Folgen, Position halten */
  orderTroops(c: CommandState) {
    this.crew?.setCommand(c);
    const label = c === 'sturm' ? 'Sturmangriff!' : c === 'folgen' ? 'Folgt mir!' : 'Position halten!';
    if (this.foot && this.mode === 'foot') this.overlay?.number(new Vector3(this.foot.x, this.foot.y + 2.6, this.foot.z), label, 'info');
  }

  /** Für die Anzeige: Offiziere (im Einsatz / Plätze) und Truppen (Köpfe im Einsatz oder an Bord / Kapazität), aktueller Befehl */
  get crewHud() {
    const c = this.crew;
    const inField = !!c && (c.allies.length > 0 || c.squadsActive);
    return {
      officers: c ? (inField ? c.allies.length : this.crewParty.length) : 0,
      troops: c?.squadsActive ? c.squadHeads : rosterTotal(this.crewTroops),
      troopMax: this.ship.troopMax,
      command: c?.command ?? 'sturm',
      /** Befehlstasten 1–3 sind belegt, solange Trupps im Einsatz sind */
      commands: !!c && c.squadsActive,
    };
  }

  /** Trupps im Einsatz? */
  get squadsActive() { return !!this.crew?.squadsActive; }

  private spawnParty(yaw: number, plan: LandingPlan | null = null, cross?: CrossingPlan) {
    if (!this.crew || !this.foot || !this.combat) return;
    const bs = this.ship.boarding;
    this.crew.spawnAllies(this.scene, this.crewParty, this.crewLevel, this.crewLoyalty, this.foot.x, this.foot.z, yaw, this.groundProxy, this.allyBuff, bs, cross);
    // Massentruppen gehen mit: über Gangway, Enterplanken und Leitern zu Fuß (`cross`), an der Küste ohne Steg im Beiboot (`plan`)
    this.troopsBefore = { ...this.crewTroops };
    if ((plan || cross) && rosterTotal(this.crewTroops) > 0) this.crew.spawnSquads(this.scene, this.crewTroops, this.crewLevel, this.playerEntityId, { x: this.foot.x, z: this.foot.z, yaw }, this.groundProxy, plan, cross);
    this.combat.allies = this.crew.targets();
    this.clearedNow = false;
  }

  /** Landetrupp-Plan für die Küste ohne Steg: Start am Schiff (Bordwand zum Ziel hin), Übersetzen im Beiboot */
  private landingPlan(tx: number, tz: number, boat: boolean, ship: Ship = this.ship): LandingPlan {
    const dx = tx - ship.x, dz = tz - ship.z, d = Math.hypot(dx, dz) || 1;
    const out = ship.cls.W / 2 + 2.2;
    const fx = ship.x + (dx / d) * out, fz = ship.z + (dz / d) * out;
    return { fromX: fx, fromZ: fz, fromY: this.env.heightAt(fx, fz), boat };
  }

  /**
   * Kampf an Land/Deck beendet: Überlebende der Truppen melden (Verluste bleiben), danach gehen Offiziere und Trupps über die Brücke
   * (`home`) aufs Schiff zurück und verschwinden dort; ohne Brücke (Küste, Notfall) werden sie sofort abgebaut.
   */
  private endLandCombat(home: CrossingPlan | null = null) {
    const c = this.crew;
    if (!c) return;
    if (c.squads.length) {
      const left = c.survivors();
      const before = this.troopsBefore;
      this.troopsBefore = {};
      this.crewTroops = left;
      this.onTroopsReturn(left, before);
      if (!home) c.clearSquads();
      c.setDeckTroops(this.ship, this.crewTroops);
    } else if (!home) c.clearSquads();
    if (home) c.beginHome(home);
    else { c.clearAllies(); if (this.combat) this.combat.allies = []; }
  }

  /** Was Trupps von der Welt sehen (Gegner, Treffer, Boden, Netz) */
  private _troopWorld: TroopWorld | null = null;
  private get troopWorld(): TroopWorld {
    return this._troopWorld ??= {
      enemies: () => this.combat?.foes ?? [],
      hit: (e, dmg, dx, dz, col, heavy, src) => this.combat?.foeHit(e as Enemy | TroopSquad, dmg, dx, dz, col, heavy, src),
      ground: this.groundProxy,
      nav: () => {
        if (this.deckGround || !this.foot) return null;
        const isl = this.ground.islandAt(this.foot.x, this.foot.z, 4);
        return isl ? navForIsland(isl) : null;
      },
      shot: (x, y, z, tx, tz) => {
        const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz) || 1;
        this.sparks.emit(7, x + (dx / d) * 0.9, y, z + (dz / d) * 0.9, { speed: 3, up: 0.6, life: 0.35, color: new Color(1.0, 0.82, 0.5).multiplyScalar(3), gravity: -0.5, spread: 0.5 });
        audio.play('swing', 0.35, { x, y, z });
      },
      text: (x, y, z, t) => this.overlay?.number(new Vector3(x, y, z), t, 'hurt'),
    };
  }

  /** Lebenspunkte und Angriffskraft der Spielfigur (aus Stufe und Ausrüstung) */
  setGearReduce(r: number) { if (this.foot) this.foot.gearReduce = r; }

  setPlayerPower(maxHp: number, atk: number) {
    if (this.foot) {
      const frac = this.foot.maxHp > 0 ? this.foot.hp / this.foot.maxHp : 1;
      this.foot.maxHp = maxHp;
      this.foot.hp = Math.max(1, Math.round(maxHp * frac));
    }
    if (this.combat) this.combat.atk = atk;
  }

  /** Faji-Erwachen: kurze Zwischensequenz mit kreisender Kamera und Aura */
  awaken(color: string) {
    this.cinematic = 3.6;
    const p = this.mode === 'foot' && this.foot ? new Vector3(this.foot.x, this.foot.y, this.foot.z) : new Vector3(this.x, 1.3, this.z);
    this.player?.play('summon', { restart: true, fade: 0.1 });
    for (let i = 0; i < 4; i++) {
      this.later((400 + i * 650) / 1000, () => {
        this.fx?.shockwave(p, 6 + i * 4, color);
        this.sparks.emit(60, p.x, p.y + 0.5, p.z, { speed: 3, up: 12, life: 1.6, color: new Color(color).multiplyScalar(3), gravity: -2, spread: 1.2 });
        this.shake = Math.max(this.shake, 0.6);
        if (i === 3) { this.overlay?.impactFrame(); this.overlay?.speedlines(1); }
      });
    }
  }

  /** Volle Heilung (Stufenaufstieg, Rast) */
  healPlayer() { if (this.foot) this.foot.hp = this.foot.maxHp; }

  get playerHp() { return this.foot ? { hp: this.foot.hp, max: this.foot.maxHp } : null; }
  /** Ausdauer zu Fuß (null auf See): Anteil 0 … 1 und ob „zu wenig“ gerade blinkt */
  get playerStamina() { return this.foot && this.foot.onFoot ? { frac: this.foot.stamina / this.foot.maxStamina, flash: this.foot.staminaFlash > 0 } : null; }

  /** Heilt um einen Anteil der Lebenspunkte (Proviant) */
  healFrac(f: number) {
    if (!this.foot) return;
    this.foot.hp = Math.min(this.foot.maxHp, this.foot.hp + this.foot.maxHp * f);
    const p = new Vector3(this.foot.x, this.foot.y + 1, this.foot.z);
    if (this.mode === 'foot') this.sparks.emit(24, p.x, p.y, p.z, { speed: 1.5, up: 3, life: 1, color: new Color(0.6, 3, 0.8), gravity: -1, spread: 0.6 });
  }

  /** Position der Spielfigur (an Land) oder des Schiffs, dazu die Blickrichtung */
  private lockVec = new Vector3();
  /** Brustposition des erfassten Gegners (für die Tiefenunschärfe); null = kein Lock-on */
  get lockFocus(): Vector3 | null {
    const l = this.mode === 'foot' ? this.combat?.lock : null;
    if (!l || !l.alive) return null;
    return this.lockVec.copy(l.char.holder.position).setY(l.char.holder.position.y + 1.3);
  }

  /** Höhe der Spielfigur zu Fuß (für den 3D-Hörer) */
  get playerFootY() { return this.foot?.y ?? 0; }

  get playerPos() {
    if (this.mode === 'foot' && this.foot) return { x: this.foot.x, z: this.foot.z, heading: this.foot.yaw };
    return { x: this.x, z: this.z, heading: this.heading };
  }

  /** Blickrichtung der Kamera auf der Wasserebene (Bogenmaß wie heading) */
  get cameraYaw() {
    this.camera.getWorldDirection(this.tmp);
    return Math.atan2(this.tmp.x, this.tmp.z);
  }

  /** Weltposition einer Stadtbewohnerin/eines Stadtbewohners */
  npcPos(id: string) {
    const n = this.npcs.find((m) => m.townDef?.id === id) ?? this.visitors.find((m) => m.townDef?.id === id);
    return n ? { x: n.x, z: n.z } : null;
  }

  /** Lebende Gegner an Land (für Minikarte und Kompass) */
  footEnemies(): { x: number; z: number; boss: boolean }[] {
    const out: { x: number; z: number; boss: boolean }[] = [];
    for (const e of this.combat?.enemies ?? []) if (e.alive) out.push({ x: e.x, z: e.z, boss: !!e.def.boss });
    return out;
  }

  /** Sprechende in der Nähe (Stadt und Dörfer), nächste zuerst */
  talkables(x: number, z: number, maxDist: number): { npc: Npc; dist: number }[] {
    const out: { npc: Npc; dist: number }[] = [];
    for (const n of this.npcs) if (n.townDef) { const d = Math.hypot(n.x - x, n.z - z); if (d < maxDist) out.push({ npc: n, dist: d }); }
    for (const n of this.visitors) if (n.townDef) { const d = Math.hypot(n.x - x, n.z - z); if (d < maxDist) out.push({ npc: n, dist: d }); }
    return out.sort((a, b) => a.dist - b.dist);
  }

  private _allyWorld: AllyWorld | null = null;
  private get allyWorld(): AllyWorld {
    return this._allyWorld ??= {
      enemies: () => this.combat?.enemies ?? [],
      hit: (e, dmg, dx, dz, col, heavy, src) => this.combat?.allyHit(e, dmg, dx, dz, col, heavy, src),
      status: (e, s, dur) => this.combat?.applyStatus(e, s, dur, 0),
      healPlayer: (f) => {
        if (!this.foot) return;
        const n = Math.round(this.foot.maxHp * f);
        this.foot.hp = Math.min(this.foot.maxHp, this.foot.hp + n);
        this.overlay?.number(new Vector3(this.foot.x, this.foot.y + 2, this.foot.z), `+${n}`, 'heal');
      },
      reviveCrew: () => this.crew?.reviveAll(0.5),
      shockwave: (p, r, c) => this.fx?.shockwave(p, r, c),
      sparks: (p, c, n) => this.sparks.emit(n, p.x, p.y, p.z, { speed: 2, up: 4, life: 1, color: new Color(c).multiplyScalar(2.5), gravity: -1, spread: 0.8 }),
      text: (p, t) => this.overlay?.number(p, t, 'info'),
      ground: this.groundProxy,
      nav: () => {
        if (this.deckGround || !this.foot) return null;
        const isl = this.ground.islandAt(this.foot.x, this.foot.z, 4);
        return isl ? navForIsland(isl) : null;
      },
      reach: (x, y, z, yaw, range, e) => this.combat?.allyReach(x, y, z, yaw, range, e) ?? false,
    };
  }

  private updateSeaBoss(dt: number) {
    const nearLair = Math.hypot(this.x - ABYSS_LAIR.x, this.z - ABYSS_LAIR.z) < 420;
    if (!this.seaBoss && this.bossWanted && nearLair) {
      this.seaBoss = new SeaBoss(this.scene, 15);
      if (this.naval) this.naval.extraTarget = this.seaBoss;
    }
    const b = this.seaBoss;
    if (!b) return;
    b.update(dt, (x, z) => this.env.heightAt(x, z), this.mode === 'sail' ? this.ship : null, {
      shake: (a) => { this.shake = Math.max(this.shake, a); },
      splash: (x, z, big) => { this.spray.emit(big ? 80 : 30, x, 0.5, z, { speed: big ? 8 : 4, up: big ? 14 : 9, life: 1.6, color: FOAM_COL, spread: big ? 6 : 1.5 }); audio.play('splash', big ? 1.4 : 1, { x, z }); },
      hitPlayer: (dmg) => { this.ship.damage(dmg, 'kugel', null); this.shake = Math.max(this.shake, 0.5); this.overlay?.hurt(); this.overlay?.number(new Vector3(this.ship.x, 4, this.ship.z), dmg, 'hurt'); },
      roar: () => audio.play('roar'),
    });
    const show = b.alive && nearLair && this.mode === 'sail';
    this.overlay?.setBoss(show ? { name: 'Der Tiefenschlund', title: 'Herr der Tiefe', frac: b.frac } : null);
    if (b.dead && this.bossGone === 0) {
      this.bossGone = 8;
      this.overlay?.setBoss(null);
      this.overlay?.impactFrame();
      this.shake = Math.max(this.shake, 1);
      this.onSeaBossDown();
    }
    if (this.bossGone > 0) {
      this.bossGone -= dt;
      if (this.bossGone <= 0) { b.dispose(); this.seaBoss = null; if (this.naval) this.naval.extraTarget = null; this.bossWanted = false; this.bossGone = -1; }
    }
    if (!nearLair && !this.bossWanted && b.alive) { b.dispose(); this.seaBoss = null; if (this.naval) this.naval.extraTarget = null; }
  }

  /** Landtrupp kämpfen lassen, Crew an Deck beleben */
  private updateCrew(dt: number) {
    const crew = this.crew;
    if (!crew) return;
    if (this.mode === 'foot' && this.foot && crew.allies.length && this.combat) {
      const cleared = this.combat.hostilesLeft === 0;
      if (cleared && !this.clearedNow) { this.clearedNow = true; crew.reviveAll(1); }
      for (const a of crew.allies) {
        const say = a.update(dt, { x: this.foot.x, z: this.foot.z, yaw: this.foot.yaw }, this.allyWorld, cleared);
        if (say) this.overlay?.number(new Vector3(a.x, a.y + 2.4 * (a.def.big ?? 1), a.z), say, 'info');
      }
      crew.separateAllies(dt, this.groundProxy);
    }
    if (this.mode === 'foot' && this.foot && crew.squads.length) {
      crew.updateSquads(dt, this.env.clock, { x: this.foot.x, z: this.foot.z, yaw: this.foot.yaw }, this.troopWorld, (x, z) => this.env.heightAt(x, z));
    }
    crew.purgeHome();
    if (!crew.homing && !crew.allies.length && !crew.squads.length && this.combat && this.combat.allies.length) this.combat.allies = [];
    crew.updateDeckTroops(this.env.clock, dt);
    const line = crew.updateDeck(dt, this.mode === 'sail' && this.camDist < 30, this.mode === 'sail' && this.threat < 0.2, this.env.clock);
    if (line) this.onCrewLine(line.who, line.text);
  }

  /** Reichweite der Breitseiten wie in 1.0 (72 + 3 je Schiffsklasse, Ausguck mehr) */
  /** Faji-Kristall auf einer befreiten Ruine (wie in 1.0) */
  private crystal: { mesh: Mesh; x: number; z: number; y: number; id: string } | null = null;
  showCrystal(id: string) {
    const def = this.islandDefs.find((i) => i.id === id);
    if (!def || this.crystal?.id === id) return;
    this.crystal?.mesh.removeFromParent();
    const h = this.ground.height(def.x, def.z);
    const y = (Number.isFinite(h) ? h : 1.3) + 2.6;
    const m = new Mesh(new OctahedronGeometry(1.1, 0), new MeshBasicMaterial({ color: new Color(1.8, 1.0, 3.2) }));
    const halo = new Mesh(new SphereGeometry(1.9, 16, 12), new MeshBasicMaterial({ color: new Color(0.8, 0.45, 1.6), transparent: true, opacity: 0.25, depthWrite: false }));
    m.add(halo);
    m.position.set(def.x, y, def.z);
    this.scene.add(m);
    this.crystal = { mesh: m, x: def.x, z: def.z, y, id };
    this.onMessage('Ein Faji-Kristall leuchtet in der Mitte der Insel!');
  }

  private calmT = 0;
  /** Wie in 1.0: in ruhigen Momenten heilen Schiff und Spielfigur langsam */
  private regen(dt: number) {
    const calm = this.threat < 0.05 && !this.bossNear && !(this.mode === 'foot' && this.combat?.hostilesLeft);
    if (!calm) { this.calmT = 0; return; }
    this.calmT += dt;
    if (this.calmT < 4) return;
    const s = this.ship;
    if (s.alive && !s.sinking && s.hull < s.maxHull) s.hull = Math.min(s.maxHull, s.hull + s.maxHull * 0.02 * dt);
    const f = this.foot;
    if (f && f.hp > 0 && f.hp < f.maxHp) f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.05 * dt);
  }

  private lastZone = 0;
  /** Warnung beim Einfahren in Gewässer, die deutlich über der eigenen Stufe liegen (wie in 1.0) */
  private checkZone() {
    if (this.mode !== 'sail' || !this.naval) return;
    const zone = seaLevelAt(this.x, this.z);
    if (zone === this.lastZone) return;
    if (this.lastZone && zone > this.lastZone && zone >= this.naval.playerLevel + 3) this.onMessage(`Gefährliche Gewässer (Stufe ${zone})!`);
    this.lastZone = zone;
  }

  /** Übungsschiff für die Einführung (Aufgaben „Versenken“ und „Entern“) */
  ensureTraining(board: boolean) {
    if (this.mode !== 'sail' || this.cinematic > 0) return;
    const e = this.naval?.ensureTraining(board);
    if (!e) return;
    this.onMessage(board
      ? 'Ein angeschlagenes Übungsschiff! Fahr nah heran und drück „Entern!“ – dann kämpfst du an Deck.'
      : 'Ein Übungsschiff! Bring es seitlich in einen der Fächer und feuere mit „Links“ oder „Rechts“.');
  }

  /** Lichtsäule und Ring am Ziel der aktuellen Aufgabe (wie in 1.0) */
  private beacon: Group | null = null;
  private beaconTarget: { x: number; z: number; r: number } | null = null;
  setBeacon(t: { x: number; z: number; r: number } | null) { this.beaconTarget = t; }
  private updateBeacon(dt: number) {
    const t = this.beaconTarget;
    const pos = this.playerPos;
    const show = !!t && Math.hypot(t.x - pos.x, t.z - pos.z) > t.r + 40;
    if (!show) { if (this.beacon) this.beacon.visible = false; return; }
    if (!this.beacon) {
      const g = new Group();
      const mat = new MeshBasicMaterial({ color: new Color(1.6, 1.25, 0.5), transparent: true, opacity: 0.32, depthWrite: false, fog: false });
      const column = new Mesh(new CylinderGeometry(2.2, 3.2, 140, 16, 1, true), mat);
      column.position.y = 70;
      const ring = new Mesh(new CylinderGeometry(1, 1, 0.6, 48, 1, true), new MeshBasicMaterial({ color: new Color(1.8, 1.4, 0.5), transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
      ring.position.y = 1.2;
      g.add(column, ring);
      g.userData.ring = ring;
      g.renderOrder = 5;
      this.scene.add(g);
      this.beacon = g;
    }
    const b = this.beacon;
    b.visible = true;
    b.position.set(t!.x, 0, t!.z);
    const ring = b.userData.ring as Mesh;
    ring.scale.set(t!.r * 1.15, 1, t!.r * 1.15).multiplyScalar(1 + Math.sin(this.env.clock * 3) * 0.04);
    b.rotation.y += dt * 0.3;
  }

  /** Liegt ein Gegner im Feuerfächer dieser Seite? (Knopf-Hervorhebung) */
  fanHot(side: number) { return this.mode === 'sail' && !!this.naval?.inFan(side, this.seaRange); }

  get seaRange() { return (75 + Math.max(0, SHIP_CLASSES.indexOf(this.ship.cls)) * 6) * this.rangeMult; }
  /** Kennung der lokalen Spielfigur (jede Absicht nennt ihren Urheber; ein Server vergibt später weitere) */
  get playerEntityId(): string { return this.foot?.entityId ?? 'foot-local'; }
  /** Nachladezeit wie in 1.0 */
  get reloadTime() { return 1.9 * (this.naval?.reloadMult ?? 1) * this.ship.reloadScale; }

  /** Entermanöver läuft (Haken, Heranziehen, Gefecht an Deck): für die Musik */
  get isBoarding() { return !!this.boarding; }

  /** Lage der Belagerung für die Musik (null: keine Instanz) */
  get musicRaid() { return this.raid?.musicState() ?? null; }

  /** Kampfnähe 0 … 1 (für die Musik) */
  get threat() {
    if (this.mode === 'foot') return this.combat && this.combat.hostilesLeft > 0 && this.combat.enemies.some((e) => e.alive && e.engaged) ? 1 : this.combat?.hostilesLeft ? 0.4 : 0;
    const f = this.nearestFoe(this.x, this.z, 220);
    return f ? clamp01(1.3 - Math.hypot(f.x - this.x, f.z - this.z) / 160) : 0;
  }

  /** Legende oder Boss in der Nähe? */
  get bossNear() {
    if (this.mode === 'foot') return !!this.combat?.enemies.some((e) => e.alive && e.kind === 'legende');
    if (this.seaBoss?.alive && Math.hypot(this.x - ABYSS_LAIR.x, this.z - ABYSS_LAIR.z) < 300) return true;
    return !!this.naval?.enemies.some((e) => e.role === 'legende' && e.ship.alive && Math.hypot(e.ship.x - this.x, e.ship.z - this.z) < 200);
  }

  /** Nächstes feindliches Schiff (für die Kampfkamera) */
  private nearestFoe(x: number, z: number, range: number) {
    let best: { x: number; z: number } | null = null, bd = range;
    for (const e of this.naval?.enemies ?? []) {
      if (e.companion || !e.ship.alive || e.ship.sinking || (e.role === 'haendler' && e.state !== 'engage')) continue;
      const d = Math.hypot(e.ship.x - x, e.ship.z - z);
      if (d < bd) { bd = d; best = e.ship; }
    }
    return best;
  }

  /** Lebende Feindschiffe (für Karte und Auftragspfeil) */
  /** Laufende Seeschlachten für Kompass und Weltkarte */
  get battleMarks(): BattleMark[] { return this.naval?.battleMarks() ?? []; }

  get enemyShips() {
    return (this.naval?.enemies ?? []).filter((e) => e.ship.alive && !e.ship.sinking).map((e) => ({ x: e.ship.x, z: e.ship.z, legend: e.role === 'legende', ally: !!e.companion }));
  }

  /** Nächstes Treibgut einer Art */
  nearestFloater(kind: 'raft' | 'bottle') { return this.life?.nearest(kind, this.x, this.z) ?? null; }

  /** Testwerkzeug: Schiff an eine Position setzen */
  teleport(x: number, z: number, heading: number) {
    this.setState({ boat: { x, z, heading } });
  }

  /** Zurück zum Heimatplatz vor dem Steg von Ankerglück (siehe HOME_SPAWN) */
  teleportHome() {
    this.teleport(HOME_SPAWN.x, HOME_SPAWN.z, HOME_SPAWN.heading);
  }

  private setMode(m: SeaMode) {
    this.mode = m;
    if (m === 'sail') this.attachToHelm();
    else this.equip(this.style);
    this.onModeChange(m);
  }

  // ---------- Logik ----------

  update(dt: number, input: Input) {
    this.env.update(dt, this.focus);

    if (this.cinematic > 0) this.cinematic -= dt;
    else if (this.mode === 'sail') this.updateSail(dt, input);
    else this.updateFoot(dt, input);

    // Anlegen, Gangway, Enterhaken und Brücken vorrücken; danach feststellen, wo die Spielfigur steht (Deck, Brücke, Land)
    // Entern: verschwindet oder sinkt das Feindschiff mitten im Heranziehen oder Kampf (Weltwechsel, Raid-Start, Absturz anderer Systeme),
    // bricht der Ablauf sauber ab: Brücken und zweites Deck weg, die Figur steht wieder an Bord (kein Hängenbleiben in der Enter-Kamera)
    if (this.boarding && !this.boardWon) {
      const be = this.boarding;
      if (!this.naval?.enemies.includes(be) || be.ship.sinking > 0 || !be.ship.alive || !Number.isFinite(be.ship.x + be.ship.z)) {
        this.onMessage('Das Feindschiff ist gesunken – die Crew zieht dich zurück an Bord.');
        this.rescueToShip();
      }
    }
    this.docking.update(dt);
    this.updateWhere(dt);
    this.updateContext(input);
    this.raidMsgCd -= dt;
    if (!this.raid) {
      this.updateWorldEvents();
      this.life?.update(dt, (x, z) => this.env.heightAt(x, z), this.ship, this.mode === 'sail');
    }
    if (this.town?.crystal) { this.town.crystal.rotation.y += dt; this.town.crystal.position.y += Math.sin(this.env.clock * 2) * dt * 0.3; }
    // Vulkane: dicke Aschesäulen mit Glut am Krater, weithin sichtbar
    if (Math.random() < dt * 3) for (const p of this.smokeVents) if (Math.hypot(p.x - this.x, p.z - this.z) < 900) this.smoke.puff(p.x, p.y, p.z, { size: 5, grow: 26, life: 14, tone: 0.28, vy: 5, spread: 1.5, rise: 0.5, drag: 0.5, alpha: 0.65, glow: 0.6, wind: 0.8, jitter: 3 });
    // Lagerfeuer auf den Inseln: dünne Rauchfahne und Funken
    for (const f of this.campfires) {
      const dd = Math.hypot(f.x - this.playerPos.x, f.z - this.playerPos.z);
      if (dd > 450) continue;
      if (Math.random() < dt * 2.5) this.smoke.puff(f.x, f.y + 0.6, f.z, { size: 0.4, grow: 3, life: 5, tone: 0.34, vy: 1.8, spread: 0.12, rise: 0.7, alpha: 0.32, glow: 0.4, wind: 0.6 });
      if (dd < 120 && Math.random() < dt * 8) this.sparks.emit(1, f.x, f.y + 0.3, f.z, { speed: 0.4, up: 2.5, life: 0.9, color: EMBER_COL, gravity: -1.5, spread: 0.4 });
    }
    // Schornsteine der Hafenstadt
    if (this.town && Math.random() < dt * 5) for (const p of this.town.smoke) if (Math.hypot(p.x - this.x, p.z - this.z) < 400) this.smoke.puff(p.x, p.y, p.z, { size: 0.5, grow: 3.5, life: 6, tone: 0.62, vy: 1.2, spread: 0.15, rise: 0.3, alpha: 0.5, wind: 0.7 });
    // Schornsteine der Dörfer auf dem Festland und den Inseln
    if (this.chimneys.length && Math.random() < dt * 5) {
      const pp = this.playerPos;
      for (const p of this.chimneys) if (Math.hypot(p.x - pp.x, p.z - pp.z) < 420) this.smoke.puff(p.x, p.y, p.z, { size: 0.5, grow: 3.5, life: 6, tone: 0.62, vy: 1.2, spread: 0.15, rise: 0.3, alpha: 0.5, wind: 0.7 });
    }
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.updateWake(dt);
    this.naval?.update(dt, this.mode === 'sail' && this.cinematic <= 0);
    this.raid?.update(dt);
    this.updateGarrisons(dt);
    this.regen(dt);
    this.checkZone();
    if (this.crystal) {
      const c = this.crystal;
      c.mesh.rotation.y += dt * 1.5;
      c.mesh.position.y = c.y + Math.sin(this.env.clock * 2) * 0.3;
      if (Math.random() < dt * 8) this.sparks.emit(1, c.x + (Math.random() - 0.5) * 1.5, c.y - 1, c.z + (Math.random() - 0.5) * 1.5, { speed: 0.3, up: 2.5, life: 1, color: CRYSTAL_COL, gravity: -1, spread: 0.2 });
    }
    this.updateBeacon(dt);
    this.naval?.updateBars(this.camera, this.mode === 'sail');
    this.naval?.updateAim(dt, this.mode === 'sail' && this.cinematic <= 0 && this.ship.alive, this.seaRange, this.ship.reloadL <= 0, this.ship.reloadR <= 0);
    this.spray.update(dt);
    this.sparks.update(dt);
    this.dust.update(dt);
    this.updateAir(dt);
    {
      const pp = this.playerPos;
      updateFountains(dt, clamp01(0.18 + 0.82 * this.env.palette.sunVis));
      // Leuchtturm: nur abends und nachts oder bei schlechter Sicht (Nebel, Regen, Sturm); klarer Tag = aus
      const wp = this.env.weather.p, bad = Math.max(wp.grey * 1.25, wp.rain * 1.2, wp.lightning);
      updateBeams(dt, clamp01((0.75 - this.env.palette.sunVis) * 2.2), clamp01((bad - 0.3) / 0.35));
      this.fauna.update(dt, pp.x, pp.z, 1 - this.env.palette.sunVis, (x, z) => this.ground.height(x, z), (x, z) => this.env.heightAt(x, z));
    }
    this.updateNpcs(dt);
    this.combat?.update(dt, this.camera);
    this.updateCrew(dt);
    // Angeln: Warten auf den Biss, dann kurzes Zeitfenster
    if (this.fishing) {
      const f = this.fishing;
      if (!this.ownDeck || Math.abs(this.ship.speed) > 2.5) { this.fishing = null; if (this.mode === 'foot') this.player?.play('idle'); }
      else if (f.bite > 0) { f.bite -= dt; if (f.bite <= 0) { this.fishing = null; this.player?.play('idle'); this.onFish(false); } }
      else { f.wait -= dt; if (f.wait <= 0) { f.bite = 1.3; this.player?.play('fishReel', { fade: 0.1 }); audio.play('splash', 0.7); this.onMessage('Biss! Schnell einholen!'); } }
    }
    this.updateSeaBoss(dt);
    this.fx?.update(dt);
    this.player?.update(dt);
    // Nach K.O. bringt die Crew dich an Bord
    if (this.downT > 0) {
      this.downT -= dt;
      if (this.downT <= 0) {
        this.foot?.revive();
        this.rescueToShip();
        this.onMessage('Deine Crew hat dich an Bord gezogen.');
      }
    }
    // Eigenes Schiff gesunken: Crew flickt es notdürftig am Start
    if (this.ship.sinking > 4) {
      this.ship.sinking = 0;
      this.ship.repair(0.5);
      this.ship.ensureCrew(0.6);
      if (this.raid && !this.raid.over) {
        // Raid: das Flaggschiff ist gesunken, die Flotte zieht sich zurück (die Instanz wird abgebaut, das Schiff kehrt zum Ausgangsort zurück)
        this.raid.retreat('Dein Flaggschiff ist gesunken – die Flotte zieht sich zurück.');
        this.onPlayerDown();
      } else if (!this.raid) {
        this.naval?.clear();
        this.teleportHome();
        this.onMessage('Dein Schiff ist gesunken! Die Crew hat es zurück in den Hafen geschleppt.');
        this.onPlayerDown();
      }
    }
    if (this.ship.hull <= 0 && this.ship.sinking === 0) this.ship.sinking = 0.01;
  }

  get seaEnv(): SeaEnv {
    const env = this.env;
    // Sturmstärke: Wellenhöhe ab Regenwetter (1,7) bis Sturm (2,7)
    const storm = clamp01((env.weather.p.waves - 1.8) / 0.9);
    // Sichtbarkeit der Sonne wie am Himmel (dichte Wolken verdecken sie): sonst glühen Segel und Flaggen im Unwetter, als schiene sie dahinter
    return { heightAt: (x, z) => env.heightAt(x, z), windDir: env.windDir, windStrength: env.weather.p.wind, storm, time: env.clock, sunDir: env.palette.sunDir, sunVis: env.palette.sunVis * (1 - env.weather.p.grey * 0.9) };
  }

  private updateSail(dt: number, input: Input) {
    const s = this.ship;
    const mv = input.move();
    // Fahrstufen mit Vor/Zurück (Tippen), Steuern mit Links/Rechts
    // Gashebel wie in 1.0: Tasten halten = mehr/weniger Fahrt, Stick nach vorn/hinten = direkt
    const before = s.throttle ?? 0.5;
    let th = before;
    if (input.lastDevice === 'keyboard') {
      if (input.down('up')) th = Math.min(1, th + dt * 0.8);
      if (input.down('down')) th = Math.max(0, th - dt * 0.8);
    } else if (Math.hypot(mv.x, mv.y) > 0.2) th = MathUtils.clamp(0.5 + mv.y * 0.65, 0, 1);
    // Festgemacht oder beim Entern herangezogen: Fahrt gesperrt (das Schiff bewegt der Ablauf in `docking`)
    const locked = !!s.moored || !!this.docking.session;
    s.throttle = locked ? 0 : th;
    if (!locked && ((before < 0.95 && th >= 0.95) || (before > 0.05 && th <= 0.05))) { this.onMessage(th > 0.5 ? 'Volle Fahrt!' : 'Anker geworfen'); audio.play('sail'); }
    this.sailCd -= dt;
    this.faji?.tick(dt);
    if (locked) s.settle();
    else s.steer(dt, mv.x, this.seaEnv, this.shipSpeedMult);
    const storm = this.env.weather.p.waves;
    if (!locked && storm > 1.5) {
      s.x += Math.sin(this.env.clock * 0.3) * (storm - 1.5) * 0.6 * dt;
      s.z += Math.cos(this.env.clock * 0.23) * (storm - 1.5) * 0.6 * dt;
    }
    // Nicht auf Inseln auffahren
    const o = locked ? { hit: false, x: s.x, z: s.z } : this.ground.pushShip(s.x, s.z, s.heading, s.cls.L, s.cls.W);
    if (o.hit) {
      s.x = o.x; s.z = o.z;
      if (s.speed > 6) { this.shake = Math.max(this.shake, 0.5); this.onMessage('Auf Grund gelaufen!'); s.damage(s.speed * 1.5, 'kugel', null); }
      s.speed *= 0.4;
    }
    if (!locked) this.collidePiers(s);
    const d = Math.hypot(s.x, s.z);
    if (d > EDGE_WALL) {
      s.x *= EDGE_WALL / d;
      s.z *= EDGE_WALL / d;
      s.speed *= 0.85;
      this.shake = Math.max(this.shake, 0.3);
      if (!this.edgeWarned) { this.edgeWarned = true; this.onMessage('Der Weltrand! Weiter trägt dich keine Strömung.'); }
    } else if (d < EDGE_WALL - 150) this.edgeWarned = false;
    this.x = s.x; this.z = s.z; this.heading = s.heading; this.speed = s.speed;

    this.boostCd = Math.max(0, this.boostCd - dt);
    this.cdBow = Math.max(0, this.cdBow - dt);
    if (!locked && input.pressed('dodge') && this.boostCd <= 0) {
      s.boost = 2.5;
      this.boostCd = 8;
      this.shake = Math.max(this.shake, 0.5);
      this.overlay?.speedlines(0.6);
      this.onMessage('Volle Kraft voraus!');
    }
    if (!locked && input.pressed('heavy')) {
      this.selectAmmo(AMMO_IDS[(AMMO_IDS.indexOf(s.ammo) + 1) % AMMO_IDS.length]);
    }
    const nav = this.naval;
    if (nav && s.alive && !locked) {
      if (input.pressed('attack') && this.cdBow <= 0) { this.cdBow = 1.2 * s.reloadScale; nav.bowShot(s, nav.canDmg, s.ammo); }
      // Breitseiten wie in 1.0: antippen (oder halten) = feuern, gezielt wird automatisch
      for (const [act, side] of [['fireLeft', 1], ['fireRight', -1]] as const) {
        const ready = side > 0 ? s.reloadL <= 0 : s.reloadR <= 0;
        if ((input.pressed(act) || input.down(act)) && ready) {
          nav.playerBroadside(s, side, this.seaRange, nav.canDmg, s.ammo);
          const r = this.reloadTime;
          if (side > 0) s.reloadL = r; else s.reloadR = r;
        }
      }
      // Faji auf See
      const slot = (['skill1', 'skill2', 'skill3'] as const).findIndex((a) => input.pressed(a));
      if (slot >= 0 && this.faji) {
        const { def, why } = this.faji.useSea(slot);
        if (why === 'leer') this.onOpenSkills();
        else if (why === 'land' && def) this.onMessage(`${def.n} wirkt nur an Land.`);
        else if (why === 'faji') this.onMessage('Zu wenig Faji.');
        else if (!why && def?.act?.sea) {
          const lvl = this.faji.levelOf(def.id);
          const ok = nav.castSea(actAt(def, lvl) ?? def.act, lvl, this.combat?.atk ?? 14);
          if (ok) {
            this.faji.commitSea(def);
            if (def.act.ult || def.act.cost >= 40) this.overlay?.showCutin(`${def.n}!`, ELEMENT_COLORS[def.act.el]);
            else this.overlay?.number(new Vector3(this.x, 9, this.z), def.n, 'info');
          } else this.onMessage('Kein Ziel in Reichweite.');
        }
      }
    }

    const ld = input.lookDelta();
    const la = input.lookAxis();
    const lx = ld.x * 0.006 + la.x * 2.2 * dt;
    const ly = ld.y * 0.004 + la.y * 1.4 * dt;
    if (lx || ly) this.camIdle = 0; else this.camIdle += dt;
    // Winkel immer in −π … π halten: sonst dreht die Kamera nach langem Drehen auf dem Rückweg ganze Runden zurück
    this.camYaw = wrapAngle(this.camYaw - lx);
    this.camPitch = MathUtils.clamp(this.camPitch + ly, 0.06, 1.1);
    // Blickwinkel bleibt, wo der Spieler ihn hingedreht hat; erst nach langer Ruhe und nur unter Fahrt schwenkt er sanft hinter das Schiff zurück
    if (this.camIdle > 8 && this.speed > 3) this.camYaw *= 1 - Math.min(1, dt * 0.5);
    // Zoom: Rauszoomen bis zum Maximum, danach kippt die Kamera Stück für Stück in die Draufsicht; Reinzoomen kippt zuerst zurück
    const zd = input.zoomDelta() * 2;
    if (zd > 0) {
      const room = 45 - this.camDist;
      const used = Math.min(zd, room);
      this.camDist += used;
      this.camTop = Math.min(1, this.camTop + (zd - used) / 16);
    } else if (zd < 0) {
      const back = Math.min(-zd, this.camTop * 16);
      this.camTop -= back / 16;
      this.camDist = Math.max(12, this.camDist + zd + back);
    }
    this.focus.set(this.x, 0, this.z);
  }

  private updateFoot(dt: number, input: Input) {
    const f = this.foot;
    if (!f || !this.player) return;
    // Das eigene Schiff wird zu Fuß nicht gesteuert: stillhalten, sonst zittert es zwischen alter und neuer Lage
    this.ship.settle();
    this.speed = 0;
    const ld = input.lookDelta();
    const la = input.lookAxis();
    this.footYaw -= ld.x * 0.006 + la.x * 2.4 * dt;
    this.footPitch = MathUtils.clamp(this.footPitch + ld.y * 0.004 + la.y * 1.5 * dt, 0.05, 1.2);
    this.footDist = MathUtils.clamp(this.footDist + input.zoomDelta() * 0.8, 3.5, 14);
    const c = this.combat;
    if (c && input.pressed('lockon')) c.toggleLock(f.x, f.z, this.footYaw);
    // Ziel gefallen: zum nächsten Gegner in Reichweite wechseln statt die Erfassung zu verlieren
    if (c && !c.lock && this.prevLock && !this.prevLock.alive) c.retarget(f.x, f.z, this.footYaw);
    this.prevLock = c?.lock ?? null;
    const lock = c?.lock?.alive ? c.lock : null;
    const lockYaw = lock ? Math.atan2(lock.x - f.x, lock.z - f.z) : null;
    // weiche Zielerfassung: Überblendfaktor und Richtung zum Ziel (für Kamera-Ausschnitt)
    this.lockK += ((lock ? 1 : 0) - this.lockK) * (1 - Math.exp(-dt * 4));
    if (lock) { this.lockDX = lock.x - f.x; this.lockDZ = lock.z - f.z; }
    if (this.docking.isClimbing) {
      // Klettern (Strickleiter, Enterleiter): die Figur folgt der Leiter, Eingaben ruhen
      const cp = this.climbPose;
      if (this.docking.stepClimb(dt, cp)) f.drive(cp.x, cp.y, cp.z, cp.yaw, true);
    } else f.update(dt, input, this.footYaw, this.groundProxy, lockYaw);
    // Entern: Deck geräumt?
    this.updateBoardVictory(dt);
    this.faji?.update(dt, input, this.style, lockYaw);
    if (lockYaw !== null && !(ld.x || la.x)) {
      // Erfasstes Ziel: Kamera hinter die Figur, Blick aufs Ziel
      const diff = MathUtils.euclideanModulo(lockYaw - this.footYaw + Math.PI, Math.PI * 2) - Math.PI;
      this.footYaw += diff * (1 - Math.exp(-dt * 5));
      // Neigung: bei höher stehendem Ziel etwas flacher blicken, bei tiefer stehendem steiler (bleibt in Bildschirmmitte)
      if (!ld.y && !la.y) this.footPitch += (MathUtils.clamp(0.4 + (f.y - lock!.y) * 0.05, 0.22, 0.62) - this.footPitch) * (1 - Math.exp(-dt * 3));
    } else if (f.speed > 4 && !(ld.x || la.x)) {
      const diff = MathUtils.euclideanModulo(f.yaw - this.footYaw + Math.PI, Math.PI * 2) - Math.PI;
      if (Math.abs(diff) < 2.2) this.footYaw += diff * Math.min(1, dt * 0.8);
    }
    this.focus.set(f.x, f.y, f.z);
    this.updateEvents(dt);
    // Boot liegt vor Anker und schaukelt nur
    this.speed = 0;
  }

  /** Zonen-Ereignisse: nur zu Fuß auf einer Insel ohne Lager (kein Boss, keine Ruine), lebendig und ab Stufe 2 */
  private updateEvents(dt: number) {
    const c = this.combat, f = this.foot;
    if (!c || !f) return;
    const isl = c.activeIsland ?? this.ground.islandAt(f.x, f.z);
    const def = isl ? this.islandDefs[this.ground.islands.indexOf(isl)] : null;
    const allowed = !!isl && !!def && def.kind !== 'boss' && def.kind !== 'ruin' && !this.boarding && !this.ownDeck
      && f.onFoot && f.state !== 'down' && this.downT <= 0 && c.campLeft === 0 && c.mods.playerLevel >= EVENT.minLevel;
    this.events.update(dt, { allowed, combat: c, isl, level: c.mods.playerLevel, faction: this.playerFaction, px: f.x, pz: f.z });
  }

  private updateContext(input: Input) {
    this.contextLabel = null;
    if (!this.player || !this.foot) return;
    const ship = this.ship;
    if (this.mode === 'sail') {
      // Enterhaken, Heranziehen und Gleiten an den Liegeplatz laufen von selbst
      if (this.docking.session) return;
      const dock = ship.moored;
      if (dock) {
        // Festgemacht: im Hafen öffnet die Taste das Hafenmenü, sonst geht es über die Gangway an Land (Ablegen steht am Steuerrad)
        if (dock.phase !== 'moored') return;
        const isl = this.ground.islandAt(this.x, this.z, 30 + ship.cls.W);
        const def = isl ? this.islandDefs[this.ground.islands.indexOf(isl)] : null;
        if (def && (def.kind === 'town' || def.kind === 'harbor')) {
          this.contextLabel = 'Hafen';
          if (input.pressed('interact')) this.onHarbor(def);
        } else {
          this.contextLabel = 'An Land gehen';
          if (input.pressed('interact')) this.goAshore();
        }
        return;
      }
      const prey = this.naval?.boardable();
      if (prey) {
        this.contextLabel = 'Entern!';
        if (input.pressed('interact')) this.board(prey);
        return;
      }
      if (this.docking.ladderId) {
        this.contextLabel = 'Anker lichten';
        if (input.pressed('interact')) { this.docking.raiseLadder(); this.onMessage('Anker gelichtet – die Leiter ist eingeholt.'); }
        return;
      }
      const berth = this.docking.findBerth();
      if (berth) {
        this.contextLabel = 'Anlegen';
        if (input.pressed('interact')) this.docking.moor(berth);
        return;
      }
      const isl = this.ground.islandAt(this.x, this.z, 30 + ship.cls.W);
      if (isl) {
        const def = this.islandDefs[this.ground.islands.indexOf(isl)];
        if (this.raidContext(def, input)) return;
        if (this.docking.canDropLadder()) {
          this.contextLabel = 'Ankern & Leiter auswerfen';
          if (input.pressed('interact')) this.goAshore();
        } else if (def?.kind === 'town' || def?.kind === 'harbor') {
          this.contextLabel = 'Hafen';
          if (input.pressed('interact')) { ship.throttle = 0; this.onHarbor(def); }
        } else {
          this.contextLabel = 'An Land gehen';
          if (input.pressed('interact')) this.goAshore();
        }
      } else {
        // Ruder loslassen: man bleibt am Rad stehen und geht zu Fuß weiter
        this.contextLabel = 'Ruder verlassen';
        if (input.pressed('interact')) this.goDeck();
      }
      return;
    }
    const f = this.foot;
    if (this.docking.isClimbing) return;
    // Leiter in Reichweite (Strickleiter am Ufer, Enterleitern): hinauf oder hinab klettern
    const lad = this.fishing ? null : this.docking.ladderNear(f.x, f.y, f.z);
    if (lad) {
      const coast = lad.id === 'ladder-coast';
      this.contextLabel = lad.atBottom ? (coast ? 'An Bord klettern' : 'Leiter hinaufklettern') : (coast ? 'Zum Ufer hinabklettern' : 'Leiter hinabklettern');
      if (input.pressed('interact')) {
        this.player.play('walk', { fade: 0.15 });
        this.docking.climb(lad.id, lad.atBottom, () => this.player?.play('idle', { fade: 0.2 }));
      }
      return;
    }
    if (this.ownDeck) {
      const hand = this.crew?.deckHandNear(f.x, f.z, 1.9) ?? null;
      const dg = this.deckGround;
      const onOwn = !!dg && dg === this.ownDG;
      const atRail = dg ? dg.railDistance(f.x, f.z) < 0.9 : false;
      if (this.fishing) {
        const fi = this.fishing;
        this.contextLabel = fi.bite > 0 ? 'Einholen!' : 'Angel einholen';
        if (input.pressed('interact')) {
          if (fi.bite > 0) { this.player.play('fishCatch', { restart: true, onDone: () => this.player?.play('idle') }); audio.play('splash'); this.onFish(true); }
          else { this.player.play('idle', { fade: 0.2 }); this.onFish(false); }
          this.fishing = null;
        }
      } else if (onOwn && !this.boarding && dg!.onQuarter(f.x, f.z) && dg!.distTo(f.x, f.z, 0, ship.model.helm.z) < 1.5) {
        // am Steuerrad: festgemacht = Ablegen (Gangway und Taue werden eingeholt), vor Anker = Anker lichten, sonst ans Steuer
        this.contextLabel = ship.moored ? 'Ablegen' : this.docking.ladderId ? 'Anker lichten' : 'Ans Steuer';
        if (input.pressed('interact')) {
          const out = (this.crew?.allies.length ?? 0) > 0 || (this.crew?.squads.length ?? 0) > 0;
          if (out) this.onMessage('Deine Crew ist noch nicht wieder an Bord.');
          else {
            if (ship.moored) this.docking.castOff();
            else if (this.docking.ladderId) { this.docking.raiseLadder(); this.onMessage('Anker gelichtet – die Leiter ist eingeholt.'); }
            this.toHelm();
          }
        }
      } else if (this.boarding && onOwn && !this.boardWon && !this.boardRetreat) {
        this.contextLabel = 'Rückzug: Brücken einholen';
        if (input.pressed('interact')) { this.boardRetreat = true; this.sendCrewHome(); this.onMessage('Rückzug! Die Crew holt die Brücken ein.'); }
      } else if (hand && onOwn) {
        this.contextLabel = `Mit ${hand.name.split(' ')[0]} reden`;
        if (input.pressed('interact')) this.onCrewLine(hand, hand.lines[Math.floor(Math.random() * hand.lines.length)]);
      } else if (atRail && onOwn && !this.boarding && this.threat < 0.1) {
        this.contextLabel = 'Angeln';
        if (input.pressed('interact')) {
          this.fishing = { wait: 2.5 + Math.random() * 5, bite: 0 };
          this.player.play('fishCast', { restart: true, onDone: () => this.player?.play('fishIdle', { fade: 0.2 }) });
          audio.play('whoosh', 0.6);
        }
      }
    } else {
      const cr = this.crystal && Math.hypot(this.crystal.x - f.x, this.crystal.z - f.z) < 3.2 && !this.combat?.hostilesLeft ? this.crystal : null;
      const dig = this.life?.digs.find((dd) => Math.hypot(dd.x - f.x, dd.z - f.z) < 2.6);
      if (cr) {
        this.contextLabel = 'Faji-Kristall erwecken';
        if (input.pressed('interact')) {
          this.player.play('cheer', { restart: true, loop: false, onDone: () => this.player?.play('idle') });
          this.fx?.shockwave(new Vector3(cr.x, f.y, cr.z), 8, '#C77DFF');
          this.sparks.emit(60, cr.x, cr.y, cr.z, { speed: 7, up: 6, life: 1.2, color: CRYSTAL_COL, spread: 0.5 });
          cr.mesh.removeFromParent();
          this.crystal = null;
          this.onCrystal(cr.id);
        }
        return;
      }
      const npc = this.talkables(f.x, f.z, 3.2)[0]?.npc;
      if (dig) {
        this.contextLabel = 'Graben';
        if (input.pressed('interact')) {
          this.player.play('pickup', { restart: true, onDone: () => this.player?.play('idle') });
          this.fx?.shockwave(new Vector3(dig.x, f.y, dig.z), 3, '#E3B04B');
          this.dust.emit(30, dig.x, f.y + 0.3, dig.z, { speed: 3, up: 5, life: 1, color: DIG_COL });
          this.life?.removeDig(dig);
          this.onDig(dig.island);
        }
      } else if (npc?.townDef) {
        this.contextLabel = `Sprechen: ${npc.townDef.name}`;
        if (input.pressed('interact') || input.pressed('talk')) {
          npc.yaw = Math.atan2(f.x - npc.x, f.z - npc.z);
          npc.char.play('talk', { restart: true, onDone: () => npc.char.play('idle') });
          this.onTalk(npc.townDef);
        }
      }
    }
  }

  /** Inseln in der Nähe und geräumte Lager melden (für Aufträge) */
  private updateWorldEvents() {
    // Ankunft an der echten Küstenlinie messen (wie das Hafenmenü), nicht an einem Kreis – sonst ließ sich bei
    // langgestreckten Inseln der Hafen öffnen, bevor die Ankunft zählte
    const isl = this.ground.islandAt(this.x, this.z, 45);
    let near = isl ? this.ground.islands.indexOf(isl) : -1;
    if (near < 0) near = this.islandDefs.findIndex((d) => Math.hypot(d.x - this.x, d.z - this.z) < d.r + 45);
    const id = near >= 0 ? this.islandDefs[near].id : null;
    // Inseln entdecken (Sichtweite wie in 1.0, Ausguck weiter) und Schilder zeigen
    const disc = 280 * this.rangeMult;
    const px = this.mode === 'foot' && this.foot ? this.foot.x : this.x, pz = this.mode === 'foot' && this.foot ? this.foot.z : this.z;
    for (const l of this.labels) {
      const d = Math.hypot(l.x - px, l.z - pz);
      if (!this.discovered.has(l.id) && d < disc + l.r) { this.discovered.add(l.id); this.onDiscover(l.id); }
      l.sprite.visible = !this.raid && this.discovered.has(l.id) && d < 760 && d > l.r + 25;
    }
    const reg = regionAt(this.x, this.z);
    if (reg.id !== this.lastRegion) { this.lastRegion = reg.id; this.onEnterRegion(reg); }
    if (id && id !== this.lastIsland) this.onEnterIsland(this.islandDefs[near]);
    this.lastIsland = id;
    const c = this.combat;
    if (c?.activeIsland && !this.boarding) {
      // nur Lager-Gegner zählen (Gegner eines Weltereignisses nicht: sie dürfen „Insel befreit“ nicht auslösen)
      const left = c.campLeft;
      if (left === 0 && this.hostilesBefore > 0) {
        const def = this.islandDefs[this.ground.islands.indexOf(c.activeIsland)];
        if (def) { this.onIslandCleared(def.id); this.overlay?.showBanner('Insel befreit!', def.name); }
      }
      this.hostilesBefore = left;
    } else this.hostilesBefore = 0;
    // Treibgut einsammeln
    if (this.mode === 'sail' && this.life) {
      for (const k of this.life.collect(this.x, this.z, this.ship.cls.W + 9)) {
        if (k === 'raft') { this.onRescue(); this.later(60, () => this.spawnFloaterSomewhere('raft')); }
        else { this.onBottle(); this.later(90, () => this.spawnFloaterSomewhere('bottle')); }
      }
    }
  }

  /** Auf dem eigenen Deck unterwegs (wie in 1.0) */
  private ownDeck = false;

  /**
   * Stege: das Schiff legt seitlich an. Die Hülle (Rechteck aus Länge und Breite) wird von der Stegkante abgehalten, nicht mehr
   * ruckartig gestoppt: das Schiff gleitet daran entlang, dreht sich sanft parallel zum Steg und verliert nur wenig Fahrt.
   */
  private collidePiers(s: Ship) {
    for (const p of this.piers) {
      const vx = p.bx - p.ax, vz = p.bz - p.az;
      const len = Math.hypot(vx, vz) || 1;
      const ux = vx / len, uz = vz / len;
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      let worst = 0, wnx = 0, wnz = 0;
      for (const k of [-0.46, -0.3, -0.15, 0, 0.15, 0.3, 0.46]) {
        const px = s.x + fx * s.cls.L * k, pz = s.z + fz * s.cls.L * k;
        const t = clamp01(((px - p.ax) * ux + (pz - p.az) * uz) / len);
        const cx = p.ax + vx * t, cz = p.az + vz * t;
        let dx = px - cx, dz = pz - cz;
        let d = Math.hypot(dx, dz);
        const min = p.hw + s.cls.W * 0.5 + 0.35;
        if (d >= min) continue;
        if (d < 1e-3) { dx = -uz; dz = ux; d = 1; }
        const pen = min - d;
        if (pen > worst) { worst = pen; wnx = dx / d; wnz = dz / d; }
      }
      if (worst <= 0) continue;
      s.x += wnx * worst;
      s.z += wnz * worst;
      // Fahrt nur so weit bremsen, wie das Schiff auf die Kante zuhält
      const into = Math.max(0, -(fx * wnx + fz * wnz)) * Math.sign(s.speed || 1);
      s.speed *= 1 - 0.35 * Math.min(1, into * 1.2) - 0.01;
      // sanft parallel zum Steg drehen
      let target = Math.atan2(ux, uz);
      let da = wrapAngle(target - s.heading);
      if (Math.abs(da) > Math.PI / 2) { target += Math.PI; da = wrapAngle(target - s.heading); }
      s.heading += da * Math.min(0.06, 0.02 + worst * 0.05);
    }
  }

  /** Deck des eigenen Schiffs; wird beim Umbau des Schiffs neu angelegt */
  private ownDeckGround(): DeckGround {
    if (!this.ownDG) { this.ownDG = new DeckGround(this.ship); this.composite.setDecks(this.ownDG, this.preyDG); }
    return this.ownDG;
  }

  private goDeck() {
    if (!this.player || !this.foot) return;
    this.ownDeck = true;
    this.landed = false;
    this.ship.throttle = 0;
    const dg = this.ownDeckGround();
    this.deckGround = dg;
    this.scene.add(this.player.holder);
    // Der Steuermann bleibt am Steuerrad stehen (kein Versetzen): von dort läuft man selbst die Treppe hinunter aufs Hauptdeck
    const start = dg.world(0, this.ship.model.helm.z - 0.15);
    this.footDist = 6.5;
    this.footPitch = 0.55;
    this.foot.place(start.x, start.z, this.ship.heading, this.groundProxy);
    this.foot.onFoot = true;
    this.footYaw = this.ship.heading;
    this.setSailFade(this.ship, true);
    this.setMode('foot');
  }

  private toHelm() {
    this.ownDeck = false;
    this.landed = false;
    this.deckGround = null;
    this.fishing = null;
    if (this.foot) this.foot.onFoot = false;
    this.setSailFade(this.ship, false);
    this.setMode('sail');
  }

  /** Segel beim Entern durchsichtig (wie in 1.0), damit sie die Kamera nicht verdecken */
  private setSailFade(ship: Ship, fade: boolean) {
    if (ship === this.ship) this.sailFaded = fade;
    for (const s of ship.model.sails) {
      const m = s.material as { transparent: boolean; opacity: number; depthWrite: boolean; needsUpdate: boolean };
      m.transparent = fade;
      m.opacity = fade ? 0.12 : 1;
      m.depthWrite = !fade;
      m.needsUpdate = true;
    }
  }

  /** Ablegen vom Steg (Hafenmenü, Steuerrad); vor Anker: Anker lichten. Nur am Steuer (See-Modus). */
  castOff() {
    if (this.mode !== 'sail') return;
    // Offiziere und Trupps, die noch an Land oder auf der Gangway sind, bleiben nicht zurück: erst heimkehren lassen
    if ((this.crew?.allies.length ?? 0) > 0 || (this.crew?.squads.length ?? 0) > 0) { this.onMessage('Deine Crew ist noch nicht wieder an Bord.'); return; }
    if (this.ship.moored) this.docking.castOff();
    else if (this.docking.ladderId) { this.docking.raiseLadder(); this.onMessage('Anker gelichtet – die Leiter ist eingeholt.'); }
  }

  /**
   * An Land gehen (Hafenmenü, Kontext-Taste): Liegt das Schiff am Steg, läuft man von Bord über die Gangway. Vor einer Küste ohne Steg
   * wirft die Crew den Anker und lässt die Strickleiter an der ufernäheren Bordseite herab. Sonst muss das Schiff näher heran.
   * Es gibt kein Versetzen: die Figur steht am Steuerrad und geht selbst.
   */
  goAshore() {
    if (this.mode !== 'sail') return;
    {
      // Festungsinseln der Weltmächte und das Marine-Hauptquartier werden belagert, nicht einfach betreten; im Raid gilt die Landungsregel
      const isl0 = this.ground.islandAt(this.x, this.z, 30 + this.ship.cls.W);
      const d0 = isl0 ? this.islandDefs[this.ground.islands.indexOf(isl0)] : undefined;
      if (!this.raid && d0 && this.isRaidIsland(d0) && !this.occupied.has(d0.id)) { this.onRaidRequest(d0); return; }
      if (this.raid && !this.ship.moored) {
        const l = this.raid.landing(this.x, this.z);
        if (!l.ok) { this.onMessage(l.reason); return; }
      }
    }
    const dock = this.ship.moored;
    if (dock) {
      if (dock.phase !== 'moored') { this.onMessage('Das Schiff legt gerade an …'); return; }
      this.onMessage('Die Gangway ist ausgefahren – lauf an Land.');
      this.goDeck();
      return;
    }
    if (this.docking.ladderId || this.docking.dropLadder()) {
      this.onMessage('Die Strickleiter hängt an der Bordwand – klettere hinab ins flache Wasser.');
      this.goDeck();
      return;
    }
    this.onMessage('Zu weit vom Ufer: lege an einem Steg an oder fahre näher an den Strand heran.');
  }

  /** Die Spielfigur hat Gangway oder Watweg verlassen und steht an Land: Insel-Ereignisse beginnen, Offiziere und Trupps folgen über die Brücke */
  private arriveAshore() {
    const f = this.foot;
    if (!f) return;
    const isl = this.ground.islandAt(f.x, f.z, 8) ?? this.ground.islandAt(this.x, this.z, 60);
    this.ownDeck = false;
    this.landed = true;
    this.fishing = null;
    this.setSailFade(this.ship, false);
    if (!isl) return;
    if (this.raid) this.raid.onAshore(this.ship.x, this.ship.z);
    else this.spawnCamp(isl);
    // Steg: Offiziere und Trupps laufen von ihren Plätzen an Deck über die Gangway; Küste ohne Steg: Truppen im Beiboot
    const bridged = this.ship.moored?.phase === 'moored';
    this.spawnParty(f.yaw, bridged ? null : this.landingPlan(f.x, f.z, true), bridged ? this.crossOut() : undefined);
  }

  /** Laufwege für das Verlassen des Schiffs über die Gangway (Start am Deck-Ende) */
  private crossOut(): CrossingPlan {
    return { routeFor: () => { const g = this.docking.gangway; return g ? this.docking.routeAcross(g.def.id, false) : null; } };
  }

  /** Laufwege für die Rückkehr aufs Schiff über die Gangway (Start am Stegfuß) */
  private crossIn(): CrossingPlan {
    return { routeFor: () => { const g = this.docking.gangway; return g ? this.docking.routeAcross(g.def.id, true) : null; } };
  }

  /** Laufwege über die Enterbrücken, reihum auf die Planken/Leitern verteilt: `toEnemy` = vom eigenen aufs Feindschiff */
  private crossBoard(toEnemy: boolean): CrossingPlan {
    const own = this.ship.entityId;
    return {
      routeFor: (i) => {
        const list = this.docking.bridgeList;
        if (!list.length) return null;
        const it = list[i % list.length];
        const b = this.composite.bridge(it.id);
        if (!b) return null;
        const aOwn = b.def.a.ref === 'ship' && b.def.a.shipId === own;
        return this.docking.routeAcross(it.id, toEnemy ? aOwn : !aOwn);
      },
    };
  }

  /** Die Spielfigur steht nach dem Landgang wieder auf dem eigenen Deck (über Gangway oder Strickleiter) */
  private returnedToShip() {
    this.landed = false;
    this.ownDeck = true;
    const c = this.combat;
    if (c?.activeIsland) {
      const idx = this.ground.islands.indexOf(c.activeIsland);
      if (c.hostilesLeft === 0) this.cleared.set(idx, this.env.clock + 300);
      c.leaveIsland();
    }
    this.events.cancel();
    this.foot?.stopEffects();
    for (const n of this.visitors) { n.dispose(); n.char.holder.removeFromParent(); n.char.dispose(); }
    this.visitors = [];
    // Offiziere und Trupps gehen über die Gangway zurück (an der Küste ohne Steg verschwinden sie ohne Weg)
    this.endLandCombat(this.ship.moored?.phase === 'moored' ? this.crossIn() : null);
    this.setSailFade(this.ship, true);
    this.onMessage('Wieder an Bord. Am Steuerrad kannst du ablegen.');
  }

  // ---------- Besatzung (Insel in der Hand des Spielers) ----------

  /** Rundgänge der Wachen je Festungsinsel (Weltkoordinaten), beim Aufbau der Inseln gesammelt */
  private patrolRoutes = new Map<string, { x: number; z: number }[][]>();
  /** Besetzte Inseln: Flagge des Spielers und die Wachen (nur solange der Spieler in der Nähe ist) */
  private occupied = new Map<string, { look: ShipLook; level: number; garrison: Garrison | null }>();
  isOccupied(id: string) { return this.occupied.has(id); }
  get occupiedIds(): string[] { return [...this.occupied.keys()]; }

  /** Insel besetzen (look = Flagge des Spielers) oder wieder freigeben (null): Banner tauschen, Wachen auf- bzw. abziehen */
  setOccupied(id: string, look: ShipLook | null, level = 15) {
    const had = this.occupied.get(id);
    if (!look) {
      if (had) { had.garrison?.dispose(); this.occupied.delete(id); }
      this.swapBanners(id, null);
      return;
    }
    if (had) { had.look = look; had.level = level; } else this.occupied.set(id, { look, level, garrison: null });
    this.swapBanners(id, look);
  }

  /** Zwillinge der Banner (Flagge des Spielers) je besetzter Insel */
  private bannerTwins = new Map<string, Object3D[]>();

  /**
   * Banner der Macht gegen die Flagge des Spielers tauschen (und zurück). Die Banner-Meshes sind beim Verschmelzen der Insel eigene Netze geblieben
   * und tragen die Lage ihres Banners (`userData.bannerPose`); die Zwillinge stehen am selben Platz im selben Maß.
   */
  private swapBanners(id: string, look: ShipLook | null) {
    const grp = this.islandGroups.find((i) => i.id === id);
    if (!grp) return;
    for (const t of this.bannerTwins.get(id) ?? []) t.removeFromParent();
    this.bannerTwins.delete(id);
    const poses = new Set<{ x: number; y: number; z: number; yaw: number; k: number }>();
    grp.g.traverse((o) => { const p = o.userData.bannerPose; if (p) { poses.add(p); o.visible = !look; } });
    if (!look) return;
    const twins: Object3D[] = [];
    for (const p of poses) {
      const t = makePlayerBanner(look, p.k);
      t.position.set(p.x, p.y, p.z);
      t.rotation.y = p.yaw;
      grp.g.add(t);
      twins.push(t);
    }
    this.bannerTwins.set(id, twins);
  }

  /** Wachen der besetzten Inseln: erscheinen, wenn der Spieler näher als 520 m ist, verschwinden jenseits von 780 m */
  private updateGarrisons(dt: number) {
    if (!this.occupied.size || this.raid) return;
    const pp = this.playerPos;
    for (const [id, o] of this.occupied) {
      const idx = this.islandDefs.findIndex((d) => d.id === id);
      const def = this.islandDefs[idx];
      if (!def) continue;
      const d = Math.hypot(def.x - pp.x, def.z - pp.z);
      if (!o.garrison && d < 520 && this.assets && this.combat) {
        const routes = this.patrolRoutes.get(id);
        const isl = this.ground.islands[idx];
        if (routes?.length && isl) o.garrison = new Garrison(this.scene, playerPalette(o.look), routes, o.level, this.playerEntityId, this.garrisonWorld(isl), navForIsland(isl));
      } else if (o.garrison && d > 780) { o.garrison.dispose(); o.garrison = null; }
      if (o.garrison) o.garrison.update(dt, this.env.clock, { x: pp.x, z: pp.z, yaw: 0 });
    }
  }

  /** Was die Wachen von der Welt sehen: Boden und Begehbarkeits-Netz ihrer Insel (auch wenn der Spieler auf dem Schiff steht), Gegner, Treffer */
  private garrisonWorld(isl: WalkIsland): TroopWorld {
    const base = this.troopWorld;
    return { ...base, nav: () => navForIsland(isl) };
  }

  /** Rückeroberungs-Flotte der ursprünglichen Macht aufbauen (Besatzung); Anzahl der Schiffe, die tatsächlich erscheinen */
  spawnRecon(def: IslandDef, o: { x: number; z: number; heading: number; homeX: number; homeZ: number; count: number; level: number }): number {
    const n = this.naval;
    if (!n || !def.factionId) return 0;
    const fid = def.factionId;
    return n.spawnReconFleet({ islandId: def.id, ...o, power: fid, look: factionShipLook(fid), name: `${FACTIONS[fid].name}-Rückeroberungsflotte` }).length;
  }
  reconAlive(id: string): number { return this.naval?.reconAlive(id) ?? 0; }
  clearRecon(id: string) { this.naval?.clearRecon(id); }

  // ---------- Belagerungs-Raids ----------

  /** Ist das eine Insel, die belagert wird (Endgame-Festung oder Marine-Hauptquartier)? */
  isRaidIsland(def: IslandDef) { return def.kind === 'citadel' || def.marine === 'hq'; }

  /**
   * Kontext-Taste an einer Raid-Insel. Ohne Raid: „Belagerung vorbereiten“ (Marine mit hohem Dienststatus: „Hafen“, ihr sicherer Stützpunkt).
   * Im Raid: an der Küste nur dort an Land, wo eine Landungsbucht freigegeben ist. Liefert true, wenn die Taste hier behandelt wurde.
   */
  private raidContext(def: IslandDef | undefined, input: Input): boolean {
    if (!def) return false;
    if (!this.raid) {
      if (!this.isRaidIsland(def)) return false;
      const safe = (def.marine === 'hq' && this.standingOf('marine') >= MARINE_SERVICE_STANDING) || this.occupied.has(def.id);
      this.contextLabel = safe ? 'Hafen' : 'Belagerung vorbereiten';
      if (input.pressed('interact')) { this.ship.throttle = 0; this.onRaidRequest(def); }
      return true;
    }
    if (this.docking.canDropLadder()) {
      const l = this.raid.landing(this.x, this.z);
      if (l.ok) {
        this.contextLabel = 'Ankern & Leiter auswerfen';
        if (input.pressed('interact')) this.goAshore();
      } else if (this.raidMsgCd <= 0) { this.raidMsgCd = 7; this.onMessage(l.reason); }
    }
    return true;
  }

  /** Belagerung beginnen: Instanz bauen, Hauptkarte pausieren, Flotte vor die Küste. false, wenn gerade nicht möglich */
  startRaid(def: IslandDef, ctx: RaidPartyContext, opts: { level: number; playerId: string; firstClear: boolean; conquestsBefore?: number; owned?: () => LootOwned }): boolean {
    if (this.raid || !this.naval || !this.combat || !this.assets) return false;
    const align = def.factionId === 'marine' ? 'marine' : this.playerFaction === 'pirat' ? 'marine' : 'pirat';
    this.raid = new RaidDirector(this.raidHost(), def, ctx, { ...opts, align });
    this.raid.begin();
    return true;
  }

  /** Belagerung ohne Abschluss verwerfen (Spiel beenden, anderer Spielstand): baut alles ab, ruft aber `onRaidEnd` nicht auf */
  abortRaid() {
    const r = this.raid;
    if (!r) return;
    this.raid = null;
    r.dispose();
    this.onRaidView(null);
  }

  /** Rückzug aus der Belagerung (Pausenmenü) */
  retreatRaid(why = 'Rückzug befohlen: die Flotte zieht sich zurück.') { this.raid?.retreat(why); }

  private raidHost(): RaidHostWorld {
    return this.raidHostObj ??= {
      scene: this.scene, ground: this.ground, naval: this.naval!, combat: this.combat!, smoke: this.smoke, sparks: this.sparks, debris: this.debris,
      playerShip: this.ship,
      shipPos: () => ({ x: this.ship.x, z: this.ship.z, heading: this.ship.heading }),
      footOnIsland: () => {
        const f = this.foot;
        if (this.mode !== 'foot' || !f || this.deckGround) return null;
        return this.ground.islandAt(f.x, f.z, 6) ? { x: f.x, y: f.y, z: f.z } : null;
      },
      message: (t) => this.onMessage(t),
      banner: (t, s) => this.overlay?.showBanner(t, s),
      cutin: (t) => this.overlay?.showCutin(t, '#A8322A'),
      teleportShip: (x, z, h) => this.teleport(x, z, h),
      suspendMain: (w, def) => this.suspendMain(w, def),
      resumeMain: () => this.resumeMain(),
      setRaidPiers: (p) => { this.piers.length = 0; this.piers.push(...p); this.docking.clearBerthCache(); },
      setWeather: (id) => { this.env.weather.auto = false; this.env.weather.setWeather(id, false); },
      view: (v) => this.onRaidView(v),
      ended: (i) => { this.raid = null; this.onRaidEnd(i); },
    };
  }

  /** Hauptkarte pausieren: Inseln, Definitionen, Stege, Küstenformen und Dampfquellen tauschen gegen die Raid-Insel (Ausblenden besorgt `cullFigures`) */
  private suspendMain(w: RaidWorld, def: IslandDef) {
    this.mainSaved = {
      islands: this.ground.islands.splice(0), defs: this.islandDefs, piers: this.piers.splice(0), shapes: this.islands,
      vents: this.smokeVents, fires: this.campfires, chimneys: this.chimneys,
    };
    this.ground.islands.push(w.walk);
    this.islandDefs = [def];
    this.smokeVents = []; this.campfires = []; this.chimneys = [];
    this.env.setIslands([w.shape]);
    this.docking.clearBerthCache();
  }

  /** Hauptkarte wieder einsetzen (Raid-Insel ist schon aus der Szene entfernt oder wird es sofort) */
  private resumeMain() {
    const m = this.mainSaved;
    if (!m) return;
    this.ground.islands.length = 0;
    this.ground.islands.push(...m.islands);
    this.islandDefs = m.defs;
    this.piers.length = 0;
    this.piers.push(...m.piers);
    this.smokeVents = m.vents; this.campfires = m.fires; this.chimneys = m.chimneys;
    this.env.setIslands(m.shapes);
    this.docking.clearBerthCache();
    this.mainSaved = null;
    this.cullFigures();
  }

  /**
   * Festungsinseln der Weltmächte (`citadel`) und der Marine (`marinefort`: Grenzfestungen und Hauptquartier Weißwacht).
   * Marine: bei gutem Ansehen (verbündet) oder im Lager der Marine kein Angriff, das Hauptquartier lässt sich nicht angreifen; neutral:
   * die Wachen beobachten nur; feindlich (Piratenstatus, schlechtes Ansehen): die Garnison greift an. Die Festungen der fünf Mächte
   * halten immer ihre Garnison in der Uniform der Macht, der Kommandant wartet im Hof.
   */
  private spawnFortress(isl: WalkIsland, def: IslandDef, idx: number) {
    const c = this.combat;
    if (!c) return;
    const fid: FactionId = def.factionId ?? 'marine';
    const F = FACTIONS[fid];
    const hq = def.marine === 'hq';
    if (def.kind === 'marinefort') {
      const stance = marineStance(this.standingOf('marine'));
      if (stance === 'verbuendet') {
        this.onMessage(hq ? `${def.name}: Die Marine grüßt dich. Das Hauptquartier ist für Verbündete tabu – hier wird nicht gekämpft.` : `${def.name}: Die Marine lässt dich passieren. Verbündete werden nicht angegriffen.`);
        return;
      }
      if (stance === 'neutral') { this.onMessage(`${def.name}: Die Wachen mustern dich misstrauisch. Ärger gibt es nur, wenn du ihn suchst.`); return; }
    }
    if (this.occupied.has(def.id)) { this.onMessage(`${def.name} ist in deiner Hand: Deine Wachen halten Burg und Stadt.`); return; }
    const until = this.cleared.get(idx) ?? 0;
    if (until > this.env.clock && !this.questWantsClear(def.id)) { this.onMessage(`${def.name} ist ruhig – fürs Erste.`); return; }
    const lv = def.level ?? 12;
    const garrison: EnemyKind[] = ['hauptmann', 'hauptmann', 'fajiwirker', 'musketier', 'musketier', 'schildtraeger', 'schildtraeger', 'schlaeger'];
    const kinds: EnemyKind[] = def.boss ? ['legende', ...garrison] : garrison;
    // Marine-Soldaten sind „marine“ (Beute, Entern), alle anderen Mächte stehen gegen das Lager des Spielers
    const align: Faction = fid === 'marine' ? 'marine' : this.playerFaction === 'pirat' ? 'marine' : 'pirat';
    c.enterIsland(isl, kinds, lv, align, def.boss, { power: fid, spread: 0.3 });
    this.onMessage(def.boss ? `${def.name}: ${def.boss} erwartet dich – ${F.name} verteidigt seine Festung! (Stufe ${lv})` : `${def.name}: ${F.name}-Garnison! (Stufe ${lv})`);
  }

  /** Was auf der Insel passiert: Stadt, Lager, Legende oder Ruhe */
  private spawnCamp(isl: WalkIsland) {
    const c = this.combat;
    const idx = this.ground.islands.indexOf(isl);
    const def = this.islandDefs[idx];
    if (!c || !def) return;
    const where = `${def.name}`;
    if (def.kind === 'town') { this.onMessage(`Willkommen in ${where}! Sprich mit den Leuten – und probier deine Kombos an den Puppen.`); return; }
    if (def.kind === 'harbor') { this.onMessage(`${where}: ${def.info}`); return; }
    if (def.kind === 'quiet' && this.assets) {
      // ein kleines Dorf wie in 1.0: Leute schlendern umher und begrüßen die Crew
      // handgebaute Länder: mehr Leute, und sie bleiben rund um ihr Dorf
      const site = def.site ? SITES[def.site] : null;
      const v = this.villages.get(def.id);
      const home: WalkIsland = v ? { ...isl, x: v.x, z: v.z, r: v.r } : isl;
      const folk: NpcRole[] = ['fischer', 'buerger', 'buerger', 'haendler', 'koch', 'fischer', 'buerger', 'haendler'];
      // benannte Dorfbewohner: sprechen, geben Aufträge (E)
      for (const d of VILLAGE_NPCS[def.id] ?? []) {
        const n = new Npc(this.assets!, home, this.ground, d.role, Math.random, this.outlineNpcs);
        n.townDef = d;
        this.scene.add(n.char.holder);
        this.visitors.push(n);
      }
      folk.slice(0, Math.max(1, (site ? site.villagers : 3) - (VILLAGE_NPCS[def.id]?.length ?? 0))).forEach((role) => {
        const n = new Npc(this.assets!, home, this.ground, role, Math.random, this.outlineNpcs);
        this.scene.add(n.char.holder);
        this.visitors.push(n);
      });
      this.onMessage(`${where}: ${def.info}`);
      this.onVillage(def.id);
      return;
    }
    if (def.kind === 'marinefort' || def.kind === 'citadel') { this.spawnFortress(isl, def, idx); return; }
    if (def.kind !== 'camp' && def.kind !== 'boss' && def.kind !== 'ruin') { this.onMessage(`${where}: ${def.info}`); return; }
    const until = this.cleared.get(idx) ?? 0;
    if (until > this.env.clock && !this.questWantsClear(def.id)) { this.onMessage(`${where} ist ruhig – fürs Erste.`); return; }
    const enemyFaction: Faction = this.playerFaction === 'pirat' ? 'marine' : 'pirat';
    if (def.kind === 'boss') {
      const lv = def.level ?? 6;
      c.enterIsland(isl, lv >= 9 ? ['legende', 'hauptmann', 'fajiwirker', 'musketier', 'schildtraeger', 'schlaeger'] : ['legende', 'matrose', 'musketier', 'schildtraeger'], lv, enemyFaction, def.boss ?? 'Die Legende', { power: def.factionId ?? undefined });
      this.onMessage(`${where}: ${def.boss ?? 'Eine Legende'} erwartet dich!`);
      return;
    }
    if (def.kind === 'ruin') {
      const lv = def.level ?? 5;
      c.enterIsland(isl, ['fajiwirker', 'fajiwirker', 'schlaeger', 'musketier', 'schildtraeger', ...(lv >= 12 ? ['hauptmann' as const] : [])], lv, enemyFaction, undefined, { power: def.factionId ?? undefined });
      this.onMessage(`${where}: Faji-Wirker hüten die Ruine! (Stufe ${lv})`);
      return;
    }
    const level = def.level ?? 1;
    c.enterIsland(isl, CAMP_BY_LEVEL[Math.min(CAMP_BY_LEVEL.length - 1, level - 1)], level, enemyFaction, undefined, { power: def.factionId ?? undefined });
    this.onMessage(`${where}: Feindliches Lager! (Stufe ${level})`);
  }

  /**
   * Entern (Black Flag): Enterhaken fliegen, die Crew zieht beide Schiffe Bord an Bord, dann schlagen Planken (Deckshöhe bis 1,8 m
   * Unterschied) oder Leitern über. Der Ablauf steckt in `DockingSystem`; hier bleibt das Gefecht.
   */
  private board(e: EnemyShip) {
    if (!this.player || !this.foot || !this.combat || this.docking.session) return;
    this.boarding = e;
    e.boarded = true;
    this.boardWon = false;
    this.boardRetreat = false;
    this.homeSent = false;
    this.boardBack = 0;
    this.ship.speed = 0; this.ship.sailLevel = 0; this.ship.throttle = 0;
    e.ship.speed = 0; e.ship.sailLevel = 0; e.ship.frozen = 999; e.ship.ceasefire = 120;
    this.preyDG = new DeckGround(e.ship);
    this.docking.startBoarding(e.ship, this.preyDG);
    this.overlay?.showCutin('Entern!', '#A8322A');
    this.overlay?.speedlines(1);
    audio.play('board');
  }

  /** Phasenwechsel des Enterkampfs (aus `DockingSystem`) */
  private onBoardPhase(ph: BoardingPhase) {
    const e = this.boarding;
    if (!e) return;
    if (ph === 'hooks') this.onMessage('Enterhaken fliegen! Die Crew zieht die Schiffe zusammen …');
    else if (ph === 'bridging') { this.onMessage(this.docking.session?.bridgeType === 'ladders' ? 'Belagerungsleitern haken sich an der Bordwand fest!' : 'Enterplanken schlagen auf die Reling!'); audio.play('board', 0.7); }
    else if (ph === 'fight') this.startBoardFight(e);
    else if (ph === 'done') this.endBoardCleanup(e);
  }

  /** Die Brücken stehen: Besatzung des Feindschiffs erscheint, die Spielfigur geht von ihrem Steuerrad aus los */
  private startBoardFight(e: EnemyShip) {
    if (!this.player || !this.foot || !this.combat || !this.preyDG) return;
    // Massentruppen an Bord fordern mehr Gegner (je 14 Köpfe einer), damit das Entern mit ihnen ein Gefecht bleibt; höchstens 12 Gegner
    const extra = Math.min(5, Math.round(rosterTotal(this.crewTroops) / 14));
    const crewN = Math.max(2, Math.min(7, Math.round(e.ship.cls.crew * (0.4 + e.ship.crew * 0.6)))) + extra;
    const kinds: EnemyKind[] = [];
    if (e.role === 'legende') kinds.push('legende');
    else if (e.ship.cls.L > 25) kinds.push('hauptmann');
    const pool: EnemyKind[] = e.level >= 4 ? ['matrose', 'schildtraeger', 'musketier', 'schlaeger', 'fajiwirker'] : ['matrose', 'matrose', 'musketier', 'schildtraeger'];
    while (kinds.length < crewN) kinds.push(pool[Math.floor(Math.random() * pool.length)]);
    this.combat.enterDeck(this.preyDG, kinds, e.level, e.ship.faction, e.name, e.power);
    this.goDeck();
    // steiler von oben: bei den größeren Schiffen stand sonst ein Mast mitten im Bild
    this.footPitch = 0.78;
    this.setSailFade(e.ship, true);
    this.onMessage(this.docking.session?.bridgeType === 'ladders' ? 'Zu den Leitern und hinauf aufs Feindschiff!' : 'Lauf über die Planken aufs Feindschiff!');
    this.spawnParty(this.ship.heading, null, this.crossBoard(true));
  }

  /** Enterkampf entschieden: Beute und Rückweg */
  private updateBoardVictory(dt: number) {
    const c = this.combat, f = this.foot;
    const e = this.boarding;
    if (!e || !c || !f || this.docking.session?.phase !== 'fight') return;
    if (!this.boardWon && c.hostilesLeft === 0) {
      this.boardWon = true;
      this.overlay?.showBanner('Schiff erobert!', 'Lauf zurück an Bord – die Beute gehört dir');
      this.onBoardWon(e);
      this.sendCrewHome();
    }
    if (!(this.boardWon || this.boardRetreat) || !this.ownDG || this.deckGround !== this.ownDG) { this.boardBack = 0; return; }
    // wieder auf dem eigenen Deck: die Crew holt Planken und Leitern ein (nach dem Heimkehren der Offiziere und Trupps, spätestens nach 8 s)
    this.boardBack += dt;
    if (this.boardBack > 0.6 && (!this.crew?.homing || this.boardBack > 8)) this.docking.endBoarding();
  }

  /** Offiziere und Trupps gehen über die Brücken zurück aufs eigene Schiff */
  private sendCrewHome() {
    if (this.homeSent) return;
    this.homeSent = true;
    this.endLandCombat(this.crossBoard(false));
  }

  /** Brücken sind abgebaut: Feindschiff freigeben (oder erobern), Gefecht beenden */
  private endBoardCleanup(e: EnemyShip) {
    this.setSailFade(e.ship, false);
    e.boarded = false;
    e.ship.frozen = 0;
    e.ship.ceasefire = 0;
    const won = this.boardWon;
    this.boarding = null;
    this.boardWon = false; this.boardRetreat = false; this.homeSent = false; this.boardBack = 0;
    this.preyDG = null;
    this.combat?.leaveIsland();
    this.events.cancel();
    if (!this.crew?.homing) { this.crew?.clearAllies(); this.endLandCombat(null); if (this.combat) this.combat.allies = []; }
    if (won) this.naval?.capture(e);
    this.onMessage(won ? 'Brücken eingeholt – die Prise geht unter, die Beute treibt herüber.' : 'Brücken eingeholt.');
  }

  /**
   * Notfall (K.O. der Spielfigur): die Crew zieht dich an Bord, Brücken und Leitern werden sofort eingeholt. Ein Erzähl-Sprung,
   * kein Laufweg: nur hier, nicht beim Landgang, Entern oder Anlegen.
   */
  private rescueToShip() {
    if (this.boarding) { this.docking.abortBoarding(); }
    const c = this.combat;
    if (c?.activeIsland) {
      const idx = this.ground.islands.indexOf(c.activeIsland);
      if (c.hostilesLeft === 0) this.cleared.set(idx, this.env.clock + 300);
      c.leaveIsland();
    }
    this.events.cancel();
    if (this.foot) { this.foot.stopEffects(); this.foot.onFoot = false; }
    for (const n of this.visitors) { n.dispose(); n.char.holder.removeFromParent(); n.char.dispose(); }
    this.visitors = [];
    this.crew?.clearAllies();
    this.endLandCombat(null);
    if (this.combat) this.combat.allies = [];
    this.ownDeck = false;
    this.landed = false;
    this.deckGround = null;
    this.setSailFade(this.ship, false);
    this.setMode('sail');
  }

  /** Wo steht die Spielfigur? Leitet das Deck unter ihr ab und löst Landung und Rückkehr aus (zu Fuß über Gangway, Watweg oder Planke) */
  private updateWhere(_dt: number) {
    const f = this.foot;
    if (this.mode !== 'foot' || !f) return;
    this.deckGround = this.composite.deckAtPoint(f.x, f.z);
    if (this.docking.isClimbing || this.cinematic > 0 || this.downT > 0 || this.boarding) return;
    const onOwn = !!this.ownDG && this.deckGround === this.ownDG;
    if (this.ownDeck && !onOwn && !this.composite.onBridge(f.x, f.z, f.y) && (this.ship.moored || this.docking.ladderId)) {
      if (Number.isFinite(this.ground.height(f.x, f.z))) this.arriveAshore();
    } else if (this.landed && onOwn) this.returnedToShip();
  }

  private updateNpcs(dt: number) {
    const p = this.mode === 'foot' && this.foot ? this.npcTmp.set(this.foot.x, 0, this.foot.z) : null;
    const cam = this.camera.position;
    for (const n of this.npcs) n.update(dt, p, Math.hypot(cam.x - n.x, cam.z - n.z));
    for (const n of this.visitors) n.update(dt, p, Math.hypot(cam.x - n.x, cam.z - n.z));
  }

  /**
   * Startbildschirm: das Prachtschiff (Galeone im Gold der Sturmkrone) segelt durch drei Stimmungen, Zeit und Wetter gehören der Regie
   * (siehe titleDirector.ts). Das Schiff steht auf einem neuen Platz und das eigene Schiff kommt beim Spielstart aus dem Spielstand zurück.
   */
  titleMood() {
    this.setState({ boat: null });
    this.setShip(TITLE_SHIP.tier, TITLE_SHIP.look, 'kugel', 1, 'pirat', 1, 1);
    // Inselschilder gehören zum Spiel (nach „Zurück zum Titel“ blieben die zuletzt gezeigten stehen und sähen aus der Ferne wie dunkle Striche aus)
    for (const l of this.labels) l.sprite.visible = false;
    this.title.start();
  }

  /** Beim Betreten des Spiels läuft der Tag wieder, das Wetter wechselt wieder von selbst */
  leaveTitle() {
    this.title.stop();
    this.title.releaseCamera(this.camera);
    this.env.timeSpeed = 1;
    this.env.weather.auto = true;
  }

  /** Munition wählen (Taste und Knopf der Schiffstafel) */
  selectAmmo(id: AmmoId) {
    this.ship.ammo = id;
    this.onMessage(`Munition: ${AMMO[id].n} – ${AMMO[id].d}`);
  }

  /** Im Menü: Wellen, Gischt und Leben laufen weiter; Schiff, Zeit und Wetter führt die Regie (`title`) in `render` */
  idle(dt: number) {
    this.env.update(dt, this.focus);
    this.updateWake(dt);
    this.spray.update(dt);
    this.sparks.update(dt);
    this.dust.update(dt);
    this.updateAir(dt);
    this.fx?.update(dt);
    this.updateNpcs(dt);
    this.player?.update(dt);
    // Möwen kreisen, Fischerboote fahren und Treibgut schaukelt schon im Startbildschirm
    this.life?.update(dt, (x, z) => this.env.heightAt(x, z), this.ship, false);
  }

  private updateWake(dt: number) {
    // Altes Kielwasser an Ort und Stelle entfernen (kein neues Array pro Bild)
    let n = 0;
    for (const w of this.wake) { w.age += dt; if (w.age < 6) this.wake[n++] = w; }
    this.wake.length = n;
    // Spurpunkt alle 2,4 m Fahrweg (nicht nach Zeit): dichte, gleichmäßige Bahn, die in Kurven sauber mitbiegt
    if (Math.abs(this.speed) > 1.5) {
      const f = this.fwd();
      const back = this.ship.cls.L * 0.42;
      const px = this.x - f.x * back, pz = this.z - f.z * back;
      const last = this.wake[0];
      if (!last || Math.hypot(px - last.x, pz - last.z) >= 2.4) {
        // Spurpunkt am Heck: bleibt im Wasser liegen; Richtung = tatsächliche Fahrtrichtung (Abdrift in Kurven)
        const cs = this.ship.course;
        this.wake.unshift({ x: px, z: pz, age: 0, strength: Math.min(1, Math.abs(this.speed) / 10), dx: Math.sin(cs), dz: Math.cos(cs), hw: this.ship.cls.W * 0.5, spd: Math.abs(this.speed) });
        if (this.wake.length > 32) this.wake.length = 32;
      }
    }
    this.env.ocean.setWake(this.wake);
  }

  /** Fahrtrichtung (in einen wiederverwendeten Vektor – sofort benutzen, nicht aufheben) */
  /** Wirksamer Treffer: 30–40 ms Standbild und ein Kamerastoß in Trefferrichtung, der federnd zurückschwingt */
  impact(dirX: number, dirZ: number, strength: number) {
    this.hitstop.freeze = Math.max(this.hitstop.freeze, HIT_STOP);
    // gerichtetes Wackeln: Schwingung entlang der Trefferachse (quer zur Blickrichtung wirkt sie am stärksten)
    this.shakeAx.set(dirX, 0, dirZ);
    this.shakeDir = Math.min(1.2, Math.max(this.shakeDir, strength * 0.55));
    const k = Math.min(1.5, strength);
    this.kickV.x += dirX * k * 2.4;
    this.kickV.z += dirZ * k * 2.4;
    this.kickV.y -= k * 1.1;
  }

  private fwd(h = this.heading) { return this.fwdTmp.set(Math.sin(h), 0, Math.cos(h)); }

  // ---------- Darstellung ----------

  render(alpha: number, frameDt: number, inMenu: boolean) {
    // Titelbild: die Regie fährt das Schiff (in Echtzeit je Bild, nicht in den 60-Hz-Schritten: auch auf schnellen Bildschirmen ruckelfrei)
    if (inMenu) {
      if (!this.title.active) this.title.start();
      this.title.update(frameDt);
    }
    this.cullFigures();
    const s = this.ship;
    const x = MathUtils.lerp(s.prev.x, s.x, alpha);
    const z = MathUtils.lerp(s.prev.z, s.z, alpha);
    const h = s.prev.heading + (s.heading - s.prev.heading) * alpha;
    const env = this.env;
    const pal = env.palette;
    // Lichter gehen bei Nacht an und im Unwetter schon am Tag (dunkle Wolken)
    const night = Math.max(1 - pal.sunVis, Math.min(1, Math.max(0, env.weather.p.grey - 0.4) * 2.2));
    const sea = this.seaEnv;
    lampShared.set(night);
    this.glowNight = night;

    const wy = env.heightAt(x, z);
    const f = this.fwd(h);
    s.render(alpha, sea, night, frameDt);
    // Steuermann lehnt sich beim Drehen des Rades in die Kurve
    if (this.mode === 'sail' && this.player && this.boat === s.model.group) {
      this.player.holder.rotation.z = -s.steerAmount * 0.12;
      // Hände greifen das drehende Steuerrad (Griffe auf 10 und 2 Uhr, drehen mit dem Rad mit)
      s.model.group.updateMatrixWorld(true);
      const wheel = s.model.wheel;
      wheel.updateMatrixWorld(true);
      wheel.localToWorld(WHEEL_L.set(0.3, 0.5, -0.07));
      wheel.localToWorld(WHEEL_R.set(-0.3, 0.5, -0.07));
      this.player.reach('l', WHEEL_L);
      this.player.reach('r', WHEEL_R);
    }
    for (const e of this.naval?.enemies ?? []) e.ship.render(alpha, sea, night, frameDt);
    // Gangway, Planken, Leitern und Taue folgen der bewegten Bordwand (Matrizen der Schiffe sind jetzt aktuell)
    this.docking.frame(frameDt);
    // Das Wasser zeichnet Rumpfschaum und Bugwelle: eigenes Schiff zuerst, dann die nächsten (höchstens sechs, nur in Sichtweite)
    {
      const hulls = this.hullList;
      hulls.length = 0;
      const add = (sh: Ship) => { if (sh.alive) hulls.push({ x: sh.hullFx.x, z: sh.hullFx.z, h: sh.hullFx.h, L: sh.cls.L, W: sh.cls.W, speed: sh.hullFx.speed, vis: 1 - clamp01((Math.hypot(sh.hullFx.x - x, sh.hullFx.z - z) - 220) / 140) }); };
      add(s);
      if (hulls.length && this.wake.length > 1) hulls[0].trail = true;
      const near = (this.naval?.enemies ?? []).map((e) => e.ship).filter((sh) => sh !== s && sh.alive && Math.hypot(sh.hullFx.x - x, sh.hullFx.z - z) < 360);
      near.sort((p, q) => Math.hypot(p.hullFx.x - x, p.hullFx.z - z) - Math.hypot(q.hullFx.x - x, q.hullFx.z - z));
      for (let i = 0; i < near.length && hulls.length < 6; i++) add(near[i]);
      this.env.ocean.setHulls(hulls);
    }
    const L = s.cls.L;
    // Gischt wird dort geschleudert, wo der Rumpf das Wasser verdrängt: von den Bugflanken seitlich weg, am Heck feiner Wirbel
    if (s.speed > 2.5 && this.mode === 'sail') {
      const sp = Math.min(1, s.hullFx.speed);
      const W = s.cls.W;
      const rx = f.z, rz = -f.x;
      const flank = (side: number) => {
        if (Math.random() > frameDt * (14 + 70 * sp)) return;
        const back = L * (0.02 + Math.random() * 0.22);
        const px = x + f.x * (L * 0.5 - back) + rx * side * W * 0.42;
        const pz = z + f.z * (L * 0.5 - back) + rz * side * W * 0.42;
        this.spray.emit(2, px, this.env.heightAt(px, pz) + 0.15, pz, { speed: 0.3, up: 1.8 + 3.2 * sp, life: 0.55 + 0.4 * sp, color: FOAM_COL, gravity: 11, spread: 0.3, size: 0.22, vx: rx * side * (1.5 + 4 * sp) + f.x * sp, vz: rz * side * (1.5 + 4 * sp) + f.z * sp });
      };
      flank(1); flank(-1);
      if (Math.random() < frameDt * 40 * sp) {
        const px = x + f.x * L * 0.52, pz = z + f.z * L * 0.52;
        this.spray.emit(2, px, this.env.heightAt(px, pz) + 0.2, pz, { speed: 0.9, up: 2.5 + 3 * sp, life: 0.5, color: FOAM_COL, gravity: 10, spread: W * 0.3, size: 0.4, vx: f.x * 2 * sp, vz: f.z * 2 * sp });
      }
      if (Math.random() < frameDt * 26 * sp) {
        const px = x - f.x * L * 0.48, pz = z - f.z * L * 0.48;
        this.spray.emit(1, px, this.env.heightAt(px, pz) + 0.1, pz, { speed: 0.6, up: 0.9, life: 1.1, color: FOAM_COL, gravity: 3, spread: W * 0.6, size: 0.55 });
      }
    }
    for (const b of this.buoys) {
      b.g.position.set(b.x, env.heightAt(b.x, b.z) - 0.3, b.z);
      b.g.rotation.z = Math.sin(env.clock * 1.3 + b.x) * 0.15;
      b.lamp.visible = night > 0.3 || Math.sin(env.clock * 3 + b.z) > 0;
    }
    for (const l of this.lamps) l.scale.setScalar(0.6 + night * 0.7);
    setSiteNight(night);
    if (this.town) for (const l of this.town.lights) l.visible = night > 0.2;

    const cam = this.camera;
    if (this.mode === 'foot' && this.foot && this.player && !inMenu) {
      this.camSailInit = false;
      // Segel aus der Draufsicht wieder undurchsichtig machen (zu Fuß an Land oder im Menü sieht man sonst durch sie hindurch)
      if (this.sailFaded && !this.ownDeck) this.setSailFade(this.ship, false);
      const p = this.foot;
      const px = MathUtils.lerp(p.prev.x, p.x, alpha);
      const pz = MathUtils.lerp(p.prev.z, p.z, alpha);
      const py = MathUtils.lerp(p.prev.y, p.y, alpha);
      const pyaw = p.prev.yaw + (MathUtils.euclideanModulo(p.yaw - p.prev.yaw + Math.PI, Math.PI * 2) - Math.PI) * alpha;
      this.player.holder.position.set(px, py, pz);
      this.player.holder.rotation.set(0, pyaw, 0);
      // In der Kapitänskajüte: steilere, nähere Kamera über der Figur (das Dach ist ausgeblendet), Kajütenlicht an
      const inCab = !!this.deckGround?.inCabin;
      const cabLight = this.ship.model.cabinLight;
      if (cabLight) cabLight.intensity += ((inCab ? 4.5 : 0) - cabLight.intensity) * Math.min(1, frameDt * 6);
      const fPitch = inCab ? Math.max(this.footPitch, 0.95) : this.footPitch;
      const cp = Math.cos(fPitch);
      // Zielerfassung: Kamera rückt mit wachsendem Abstand zum Ziel zurück und blickt ein Stück zu ihm hin (Figur und Ziel im Bild)
      const ld = Math.hypot(this.lockDX, this.lockDZ);
      const lk = this.lockK * (ld > 0.01 ? 1 : 0);
      const dist = Math.min(this.footDist + lk * MathUtils.clamp((ld - 5) * 0.3, 0, 3.5), inCab ? 4.8 : 99);
      const shift = ld > 0.01 ? (lk * Math.min(3.2, ld * 0.28)) / ld : 0;
      this.tmp.set(px - Math.sin(this.footYaw) * dist * cp, py + 1.4 + Math.sin(fPitch) * dist, pz - Math.cos(this.footYaw) * dist * cp);
      cam.position.lerp(this.tmp, Math.min(1, frameDt * 10));
      const gy = this.ground.height(cam.position.x, cam.position.z);
      const floor = Math.max(env.heightAt(cam.position.x, cam.position.z) + 0.8, Number.isFinite(gy) ? gy + 0.6 : -99);
      if (cam.position.y < floor) cam.position.y = floor;
      cam.lookAt(px + this.lockDX * shift, py + 1.3, pz + this.lockDZ * shift);
      this.focus.set(px, py + 1, pz);
    } else if (inMenu) {
      this.camSailInit = false;
      // Segel aus der Draufsicht wieder undurchsichtig machen (zu Fuß an Land oder im Menü sieht man sonst durch sie hindurch)
      if (this.sailFaded && !this.ownDeck) this.setSailFade(this.ship, false);
      // Titelbild: die Kamerafahrt der Regie; auf breiten Bildschirmen steht das Schiff links neben dem Menü, im Hochformat darüber
      this.title.frame(cam, innerWidth / innerHeight);
      this.focus.set(x, wy + 2, z);
    } else {
      // Kampfkamera wie in 1.0: das nächste Feindschiff kommt mit ins Bild
      const portrait = innerHeight > innerWidth;
      const foe = this.nearestFoe(x, z, this.seaRange * 1.7);
      const want = foe ? Math.atan2(foe.x - x, foe.z - z) : h;
      this.seaYaw += (MathUtils.euclideanModulo(want - this.seaYaw + Math.PI, Math.PI * 2) - Math.PI) * Math.min(1, frameDt * (foe ? 1.4 : 1.8));
      const sep = foe ? Math.hypot(foe.x - x, foe.z - z) : 0;
      // Abstand und Höhe wie in 1.0 (Hochformat weiter weg), Zoom und Neigung vom Spieler. Echte Umlaufbahn: Radius R und Höhenwinkel E um den Schiffsmittelpunkt
      const wantAz = this.seaYaw + Math.PI + this.camYaw;
      const zoom = this.camDist / 22;
      const back0 = ((portrait ? 22 : 16) + L * 1.45 + sep * 0.3 + (s.boost > 0 ? 4 : 0)) * zoom;
      const up0 = ((portrait ? 12 : 8) + L * 0.6 + sep * (portrait ? 0.5 : 0.32)) * zoom * 0.99;
      const wantR = Math.hypot(back0, up0);
      // Grundwinkel (bei Standardneigung 0,3) plus Neigung des Spielers: steil nach oben bis fast senkrecht
      const wantE = MathUtils.clamp(Math.atan2(up0, back0) + (this.camPitch - 0.3) * 1.3, 0.1, 1.32);
      this.camTopS += (this.camTop - this.camTopS) * Math.min(1, frameDt * 3);
      const tk = this.camTopS * this.camTopS * (3 - 2 * this.camTopS); // weiches Überblenden
      if (!this.camSailInit) { this.camAz = wantAz; this.camR = wantR; this.camE = wantE; this.camAx = x; this.camAz2 = z; this.camSailInit = true; }
      // Winkel auf dem kürzesten Weg nachführen, Radius und Höhenwinkel weich, der Ankerpunkt folgt dem Schiff mit leichter Verzögerung (Fahrtgefühl)
      this.camAz += (MathUtils.euclideanModulo(wantAz - this.camAz + Math.PI, Math.PI * 2) - Math.PI) * Math.min(1, frameDt * 5);
      this.camR += (wantR - this.camR) * Math.min(1, frameDt * 3);
      this.camE += (wantE - this.camE) * Math.min(1, frameDt * 3);
      const lag = Math.min(1, frameDt * 7);
      this.camAx += (x - this.camAx) * lag;
      this.camAz2 += (z - this.camAz2) * lag;
      if (Math.hypot(x - this.camAx, z - this.camAz2) > 40) { this.camAx = x; this.camAz2 = z; }
      // Draufsicht: Höhenwinkel fast senkrecht, aus ungefähr derselben Entfernung wie beim größten Zoom (nur wenig höher, damit mehr Meer ins Bild kommt)
      const E = MathUtils.lerp(this.camE, 1.5, tk);
      const R = this.camR * (1 + 0.12 * tk);
      // in der Draufsicht verdecken die Segel das Deck: durchsichtig
      const wantFade = tk > 0.5;
      if (wantFade !== this.sailFaded) this.setSailFade(this.ship, wantFade);
      const pivotY = 1.5;
      const ce = Math.cos(E);
      this.tmp.set(this.camAx + Math.sin(this.camAz) * ce * R, pivotY + Math.sin(E) * R, this.camAz2 + Math.cos(this.camAz) * ce * R);
      cam.position.copy(this.tmp);
      const camWater = env.heightAt(cam.position.x, cam.position.z) + 1.2;
      if (cam.position.y < camWater) cam.position.y = camWater;
      // Blick: immer in Blickrichtung der Kamera vor das Schiff (das Schiff steht im unteren Bilddrittel); mit Gegner Richtung Feind, in der Draufsicht genau auf das Schiff.
      // (Früher zeigte der Blick immer in Fahrtrichtung, auch bei seitlich gedrehter Kamera – das Schiff wanderte aus dem Bild und die Kamera „drehte ein“.)
      const vx = -Math.sin(this.camAz), vz = -Math.cos(this.camAz);
      // Je steiler der Blick von oben, desto weniger weit vor dem Schiff (sonst wandert es unten aus dem Bild)
      const aheadK = MathUtils.clamp(Math.cos(E) / Math.cos(Math.atan2(up0, back0)), 0, 1.15);
      const ahead = (foe ? sep * 0.45 : 12 + L) * aheadK * (1 - tk);
      cam.lookAt(x + vx * ahead, 2, z + vz * ahead);
      // Die Kamera rollt leicht mit dem Schiff: Dünung und Rückstoß der Breitseiten werden spürbar (in der Draufsicht nicht)
      const g = s.model.group.rotation;
      const rel = this.camAz + Math.PI - h;
      // (Kamera-Z zeigt nach hinten, Schiffs-Z nach vorn – daher das Minus)
      cam.rotateZ(-(g.z * Math.cos(rel) - g.x * Math.sin(rel)) * 0.3 * (1 - tk));
      this.focus.set(x, wy + 2, z);
    }
    if (this.cinematic > 0 && !inMenu) {
      // Zwischensequenz: Kamera kreist nah um die Figur
      const p = this.mode === 'foot' && this.foot ? new Vector3(this.foot.x, this.foot.y, this.foot.z) : new Vector3(x, wy + 1.3, z);
      const a = (3.6 - this.cinematic) * 1.1;
      const r = 4.5 + this.cinematic * 0.8;
      cam.position.set(p.x + Math.sin(a) * r, p.y + 1.2 + (3.6 - this.cinematic) * 0.5, p.z + Math.cos(a) * r);
      cam.lookAt(p.x, p.y + 1.3, p.z);
    }
    // Kamerastoß: gedämpfte Feder (läuft in Echtzeit, auch während des Standbilds)
    {
      const dt = Math.min(frameDt, 0.05);
      const K = 240, C = 15;
      this.kickV.x += (-K * this.kick.x - C * this.kickV.x) * dt;
      this.kickV.y += (-K * this.kick.y - C * this.kickV.y) * dt;
      this.kickV.z += (-K * this.kick.z - C * this.kickV.z) * dt;
      this.kick.addScaledVector(this.kickV, dt);
      if (inMenu) { this.kick.set(0, 0, 0); this.kickV.set(0, 0, 0); }
      cam.position.add(this.kick);
    }
    if (this.shakeDir > 0.001) {
      this.shakePh += frameDt * 62;
      const o = Math.sin(this.shakePh) * this.shakeDir * this.shakeDir * 0.22;
      cam.position.addScaledVector(this.shakeAx, o);
      this.shakeDir = Math.max(0, this.shakeDir - frameDt * 4.5);
    }
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.6;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    // Laternen: die nächsten Träger bekommen echtes Licht
    {
      const list = this.lampList;
      list.length = 0;
      for (const ch of Character.lamped) if (ch.lamp && ch.holder.visible) list.push(ch.lamp);
      for (const c of this.fireCarriers) list.push(c);
      this.lampPool.update(frameDt, cam.position.distanceTo(this.focus) < 60 ? this.focus : cam.position, list);
    }
    // Dach der Kajüte nur ausgeblendet, solange jemand drinnen steht (nach Sprüngen, Landgang oder Schiffswechsel wieder sichtbar)
    if (!this.deckGround?.inCabin) { const roof = this.ship.model.cabinRoof; if (roof && !roof.visible) roof.visible = true; }
    // Lichtschein und Flammen aller Lampen und Feuer (nach der Kamera, damit nichts hinterherhinkt)
    // nachts liegt immer ein leichter Dunst in der Luft: Lichthöfe wachsen und werden weicher, unter Laternen zeichnen sich Lichtkegel ab
    this.glow.mist = Math.min(1, Math.max(env.weather.p.rain * 0.9, (1 - env.weather.p.visibility) * 0.9, this.glowNight * 0.24));
    this.glow.update(frameDt, cam, this.glowNight, env.weather.p.rain);
    env.render(cam, this.focus);
  }

  /** Lichtquellen einer Insel anmelden (Inselkoordinaten + Versatz); Feuer und Fackeln bekommen zusätzlich ein echtes Licht */
  private addGlows(list: GlowPlaced[], ox: number, oz: number) {
    for (const g of list) {
      const x = ox + g.x, z = oz + g.z;
      const em = glowHub.add(makeEmitter(g.kind, x, g.y, z, { ground: g.ground, size: g.size, pool: g.pool, pdx: g.pdx, pdz: g.pdz, glint: g.glint }));
      // Fenster: nur die unteren (mit Bodenlicht) und davon jedes zweite bekommen ein echtes Licht, sonst gäbe es hunderte Träger
      if (g.kind === 'window' && (g.ground === null || (this.windowCarriers++ & 1))) continue;
      const c = new Object3D();
      c.userData.seed = em.seed;
      const soft = g.kind === 'lamp' || g.kind === 'window';
      // Laternen und Fenster leuchten als weiche, warme Punktlichter (kein Feuer): der LampPool wählt die nächsten und blendet sie weich über
      c.position.set(x, soft ? g.y - 0.1 : g.y + Math.max(0.6, (g.size ?? 1) * 0.5), z);
      c.userData.fire = !soft; c.userData.fixed = true; c.userData.lightK = g.kind === 'fire' ? 1.7 : g.kind === 'lamp' ? 1.15 : g.kind === 'window' ? 0.55 : 0.3;
      this.scene.add(c);
      c.updateMatrixWorld(true);
      this.fireCarriers.push(c);
    }
  }
}
