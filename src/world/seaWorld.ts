import { audio } from '../audio/audio';
import { CrewAboard } from './crewAboard';
import type { CrewDef } from '../data/crew';
import type { AllyWorld } from '../entities/ally';
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  MathUtils,
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
import type { QualityConfig } from '../data/qualityTiers';
import { EDGE_WALL } from '../data/world';
import type { CharacterAssets } from '../entities/character/assets';
import { Character } from '../entities/character/character';
import { weaponsFor } from '../entities/character/weapons';
import { Npc } from '../entities/npc';
import { PlayerFoot } from '../entities/player/playerFoot';
import { addOutlines } from '../render/outline';
import { toon } from '../render/toon';
import { Environment, type EnvState } from './environment';
import { coastK, coastMax, IslandGround, makeIslandShape, type WalkIsland } from './islandGround';
import type { IslandShape } from './ocean';
import { ParticleSystem } from './particles';
import { hashId, seeded } from './waves';
import { dressIsland } from './islandDress';
import { IslandFauna } from './fauna';
import { texDetail } from '../render/texDetail';
import type { IslandStyle } from '../data/regions';
import { CombatFx } from '../combat/fx';
import { CombatSystem } from '../combat/combat';
import type { EnemyKind } from '../data/combat';
import type { Faction } from '../core/save/types';
import type { CombatOverlay } from '../ui/combatOverlay';
import type { Enemy } from '../entities/enemy';
import { FajiController } from '../faji/fajiController';
import type { SkillState } from '../core/save/types';
import { Ship, type SeaEnv } from '../entities/ship/ship';
import { AMMO, AMMO_IDS, DEFAULT_SHIP_LOOK, SHIP_CLASSES, type AmmoId, type ShipLook } from '../data/ships';
import { NavalSystem, type EnemyShip } from '../naval/naval';
import { DeckGround, type Ground } from './islandGround';
import { actAt, ELEMENT_COLORS } from '../data/skills';
import { BERNSTEINSEE, REGIONS, regionAt, seaLevelAt, type IslandDef, type RegionDef } from '../data/regions';
import { SmokeSystem } from './smoke';
import { setElementSmoke } from '../faji/elementFx';
import { DebrisSystem } from './debris';
import { islandLabel, islandTerrain, outpost, plant, styleKit, volcano } from './islandStyle';
import type { Sprite } from 'three';
import { ABYSS_LAIR, SeaBoss } from '../naval/seaBoss';
import { buildTown, mergeByMaterial, type TownBuild } from './town';
import { SeaLife } from './life';
import { TOWN_NPCS, type TownNpcDef } from '../data/quests';

/** Gegnerlager je Inselstufe */
const CAMP_BY_LEVEL: EnemyKind[][] = [
  ['matrose', 'matrose', 'musketier'],
  ['matrose', 'matrose', 'schildtraeger', 'musketier'],
  ['matrose', 'schildtraeger', 'musketier', 'fajiwirker', 'matrose'],
  ['matrose', 'schildtraeger', 'musketier', 'fajiwirker', 'schlaeger'],
  ['hauptmann', 'matrose', 'schildtraeger', 'musketier', 'fajiwirker', 'schlaeger'],
];

const WAKE_INTERVAL = 0.22;

/** Inselstil einer Region */
const styleOf = (regionId?: string): IslandStyle => REGIONS.find((r) => r.id === regionId)?.style ?? 'tropisch';

interface WakePoint { x: number; z: number; age: number; strength: number }

export type SeaMode = 'sail' | 'foot';
export interface SeaState { boat: { x: number; z: number; heading: number } | null; env: EnvState }

/**
 * Testwelt: Schiff, Inseln, Spielfigur zu Fuß, Bewohner und die komplette Umgebung.
 * Echte Regionen, Städte und Schiffe folgen in den Meilensteinen 5 und 6.
 */
export class SeaWorld {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(55, 1, 0.3, 2600);
  readonly env: Environment;
  /** Punkt, auf den Kamera, Schatten und Tiefenunschärfe zielen */
  readonly focus = new Vector3();
  /** Inseln (Mittelpunkt und Radius) – für Karte und Flachwasser */
  readonly islands: IslandShape[];
  readonly ground = new IslandGround();
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
  onTalk: (npc: TownNpcDef) => void = () => {};
  onDig: (island: string) => void = () => {};
  onEnterIsland: (def: IslandDef) => void = () => {};
  onIslandCleared: (id: string) => void = () => {};
  /** Braucht ein laufender Auftrag diese Insel freigekämpft? Dann ignoriert sie die Ruhezeit */
  questWantsClear: (id: string) => boolean = () => false;
  /** Auf einer bewohnten Insel gelandet (Geschenk der Dorfbewohner) */
  onVillage: (id: string) => void = () => {};
  private assets: CharacterAssets | null = null;
  /** Dorfbewohner der ruhigen Inseln, nur solange man dort an Land ist */
  private visitors: Npc[] = [];
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
  /** Aktueller Boden: Inseln oder (beim Entern) das feindliche Deck */
  private readonly groundProxy: Ground = {
    height: (x, z) => (this.deckGround ?? this.ground).height(x, z),
    constrain: (x, z, r) => (this.deckGround ?? this.ground).constrain(x, z, r),
  };
  private boardDone = 0;
  /** Angeforderte Trefferpause (vom Spiel in Echtzeit abgearbeitet) */
  hitstop = { t: 0, scale: 0.05 };
  combat: CombatSystem | null = null;
  playerFaction: Faction = 'pirat';
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
  private clearedNow = false;
  onCrewLine: (who: CrewDef, text: string) => void = () => {};
  private sailCd = 0;
  private boarding: EnemyShip | null = null;
  private deckGround: DeckGround | null = null;
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
  private piers: { ax: number; az: number; bx: number; bz: number; hw: number }[] = [];
  private lamps: Mesh[] = [];
  /** Inselgruppen (für das Ausblenden jenseits der Sichtweite) */
  private islandGroups: { g: Group; x: number; z: number; r: number }[] = [];
  private viewDist = 800;
  /** Lagerfeuer auf den Inseln (Rauch und Glut) */
  private campfires: { x: number; y: number; z: number }[] = [];
  /** Krabben, Schildkröten, Vögel, Glühwürmchen und springende Fische */
  readonly fauna: IslandFauna;
  private spray: ParticleSystem;
  private sparks: ParticleSystem;
  /** Pulverdampf, Schornsteine, Vulkane, Rauchsäulen */
  readonly smoke: SmokeSystem;
  /** Splitter, Planken und Fässer */
  readonly debris: DebrisSystem;
  private wake: WakePoint[] = [];
  private wakeTimer = 0;

  private player: Character | null = null;
  private foot: PlayerFoot | null = null;
  private npcs: Npc[] = [];
  private anchor = { x: 0, z: 0 };
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
  private footYaw = 0;
  private footPitch = 0.32;
  private footDist = 7;
  private menuOrbit = 0;
  private tmp = new Vector3();

  constructor() {
    this.env = new Environment(this.scene);
    this.ship = new Ship(this.scene, 0, DEFAULT_SHIP_LOOK('pirat'), 'pirat');
    this.boat = this.ship.model.group;

    this.fauna = new IslandFauna(this.scene);
    this.islands = this.buildIslands();
    this.env.setIslands(this.islands);
    this.buildBuoys();
    this.spray = new ParticleSystem(this.scene, false, 0.8);
    this.sparks = new ParticleSystem(this.scene, true, 0.32);
    this.dust = new ParticleSystem(this.scene, false, 0.7);
    this.fauna.spray = this.spray;
    this.fauna.sparks = this.sparks;
    this.smoke = new SmokeSystem(this.scene);
    setElementSmoke(this.smoke);
    this.debris = new DebrisSystem(this.scene);
    this.debris.onSplash = (x, z, big) => {
      this.spray.emit(big ? 14 : 5, x, this.env.heightAt(x, z) + 0.1, z, { speed: big ? 2.5 : 1.5, up: big ? 5 : 3, life: 0.8, color: new Color(0.95, 0.98, 1), spread: 0.3 });
    };
  }

  /** Wind als Vektor (m/s) für Rauch und Treibgut */
  private windVec() {
    const k = 1.5 + this.env.weather.p.wind * 7;
    return { x: Math.sin(this.env.windDir) * k, z: Math.cos(this.env.windDir) * k };
  }

  private updateAir(dt: number) {
    const w = this.windVec();
    this.smoke.wind = w;
    this.smoke.update(dt);
    this.debris.update(dt, (x, z) => this.env.heightAt(x, z), w);
  }

  // ---------- Aufbau ----------

  private buildIslands(): IslandShape[] {
    const rnd = seeded(2024);
    const shapes: IslandShape[] = [];
    // Alle Regionen sind handgemacht: Bernsteinsee in der Mitte, fünf Meere im Ring
    const specs = REGIONS.flatMap((reg) => reg.islands.map((d) => ({
      x: d.x, z: d.z, r: d.r, hill: d.hill, palms: d.palms, tower: d.kind === 'lighthouse', def: d, kit: styleKit(reg.style ?? 'tropisch'),
    })));
    this.islandDefs = specs.map((s) => s.def);
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
      const simple = town || s.def.kind === 'harbor' || s.tower || s.def.region === 'glut';
      const form = makeIslandShape(r, s.hill, shapeRnd, simple);
      const walk: WalkIsland = { x: s.x, z: s.z, r, beachY: 1.3, hillY: 1.2, coast: form.coast, hills: form.hills.map((h) => ({ ...h, x: s.x + h.x, z: s.z + h.z })), blockers: [] };
      shapes.push({ x: s.x, z: s.z, r: r * coastMax(form.coast) * 1.1, coast: form.coast, base: r * 1.1 });
      const kit = s.kit;
      const glow = new Set<Mesh>(this.lamps);
      // Grasfläche: üppig bis fast an den Strand oder karg mit viel Sand – je nach Region und Inselart
      const style = styleOf(s.def.region);
      const lushK = style === 'tropisch' || style === 'nord' ? 1 : style === 'nebel' ? 0.8 : style === 'schlund' ? 0.6 : 0.35;
      const grassFrac = town ? 0.8 : s.def.kind === 'treasure' ? 0.35 + shapeRnd() * 0.25 : (0.45 + shapeRnd() * 0.4) * lushK + (1 - lushK) * 0.2;
      const terrain = islandTerrain(kit, r, form.coast, form.hills, grassFrac, shapeRnd);
      isl.add(terrain.beach, ...terrain.hills);
      /** Bodenhöhe in Inselkoordinaten – dieselbe Rechnung wie beim Laufen */
      const solo = new IslandGround();
      solo.add(walk);
      const hAt = (lx: number, lz: number) => Math.max(-2, solo.height(s.x + lx, s.z + lz));
      const hillTop = Math.max(...walk.hills.map((h) => h.r * h.h));
      const rocks = s.def.rocks ?? (rnd() < 0.4 && !s.tower && !town ? 1 : 0);
      for (let k = 0; k < rocks; k++) {
        const a = rnd() * Math.PI * 2, rr = r * (0.35 + rnd() * 0.3);
        const size = r * (0.1 + rnd() * 0.08);
        // Felsgruppe statt Pyramide: eine schiefe Felsnadel mit Brocken drumherum, jede anders
        const rk = new Group();
        const tall = size * (1.2 + rnd() * 1.2) * kit.rockScale;
        const spire = new Mesh(new DodecahedronGeometry(size, 0), kit.rock);
        spire.scale.set(0.8 + rnd() * 0.4, tall / size, 0.8 + rnd() * 0.4);
        spire.position.y = tall * 0.45;
        spire.rotation.set((rnd() - 0.5) * 0.25, rnd() * 3, (rnd() - 0.5) * 0.25);
        rk.add(spire);
        for (let b = 0; b < 2 + Math.floor(rnd() * 3); b++) {
          const bs = size * (0.3 + rnd() * 0.4);
          const boulder = new Mesh(new DodecahedronGeometry(bs, 0), kit.rock);
          const ba = rnd() * Math.PI * 2;
          boulder.position.set(Math.cos(ba) * size * 1.1, bs * 0.5, Math.sin(ba) * size * 1.1);
          boulder.rotation.set(rnd(), rnd(), rnd());
          boulder.scale.y = 0.7;
          rk.add(boulder);
        }
        rk.position.set(Math.cos(a) * rr, hAt(Math.cos(a) * rr, Math.sin(a) * rr) - 0.3, Math.sin(a) * rr);
        isl.add(rk);
        walk.blockers.push({ x: s.x + Math.cos(a) * rr, z: s.z + Math.sin(a) * rr, r: size });
      }
      for (let k = 0; k < s.palms; k++) {
        const pa = town ? (k / s.palms) * Math.PI * 2 + rnd() * 0.2 : rnd() * Math.PI * 2;
        const pr = r * (town ? 0.84 + rnd() * 0.08 : 0.3 + rnd() * 0.55);
        const palm = plant(kit, rnd);
        palm.traverse((o) => { if (o.userData.noOutline) glow.add(o as Mesh); });
        const px = Math.cos(pa) * pr, pz = Math.sin(pa) * pr;
        palm.position.set(px, hAt(px, pz) - 0.1, pz);
        palm.rotation.z = (rnd() - 0.5) * (kit.flora === 'palme' ? 0.4 : 0.15);
        palm.rotation.y = rnd() * Math.PI * 2;
        isl.add(palm);
        walk.blockers.push({ x: s.x + px, z: s.z + pz, r: 0.45 });
      }
      if (s.tower) {
        const tower = new Mesh(new CylinderGeometry(1.6, 2.4, 16, 12), stone);
        tower.position.set(0, 9, 0);
        const band = new Mesh(new CylinderGeometry(1.95, 2.05, 2, 12), red);
        band.position.set(0, 10, 0);
        const lamp = new Mesh(new SphereGeometry(1.4, 16, 10), new MeshBasicMaterial({ color: new Color(6, 5, 2.5) }));
        lamp.position.set(0, 18, 0);
        lamp.userData.noOutline = true;
        this.lamps.push(lamp);
        isl.add(tower, band, lamp);
        walk.blockers.push({ x: s.x, z: s.z, r: 2.5 });
      }
      // Vulkan-Glut auf den Hügeln des Glutrings
      if (s.def.region === 'glut' && s.def.kind !== 'harbor' && s.def.kind !== 'treasure') {
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
        isl.add(outpost(r, facing, lanterns));
        const fx = Math.sin(facing), fz = Math.cos(facing);
        this.piers.push({ ax: s.x + fx * (r - 5), az: s.z + fz * (r - 5), bx: s.x + fx * (r + 17), bz: s.z + fz * (r + 17), hw: 1.5 });
        for (const l of lanterns) glow.add(l);
      }
      // Natur, Bauten und Treibgut passend zu Region und Inselart
      if (!town) {
        const dressed = dressIsland({ group: isl, def: s.def, kit, walk, hAt, glow, density: texDetail.density, style: styleOf(s.def.region) });
        this.campfires.push(...dressed.fires.map((f) => ({ x: s.x + f.x, y: f.y, z: s.z + f.z })));
        this.fauna.addIsland(s.def, s.x, s.z, r, dressed.trees.map((t) => ({ x: s.x + t.x, y: t.y, z: s.z + t.z })), dressed.bushes.map((b) => ({ x: s.x + b.x, y: b.y, z: s.z + b.z })), styleOf(s.def.region), (ang) => r * coastK(form.coast, ang));
      }
      this.scene.add(isl);
      this.islandGroups.push({ g: isl, x: s.x, z: s.z, r });
      mergeByMaterial(isl, glow);
      // Namensschild (wie in 1.0): erscheint, sobald die Insel entdeckt ist
      const label = islandLabel(s.def.name, s.def.kind, s.def.level);
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
        this.piers.push({ ax: s.x, az: s.z - r + 5, bx: s.x, bz: s.z - r - 41, hw: 2.5 });
        this.town = buildTown(s.def, walk, (x, z) => { const h = this.ground.height(x, z); return Number.isFinite(h) ? h : 1.3; });
        this.scene.add(this.town.group);
      }
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
    }
  }

  /** Spielfigur und Bewohner erzeugen, sobald die Figuren-Daten geladen sind */
  setCharacters(assets: CharacterAssets, look: CharacterLook, style: StyleId, overlay?: CombatOverlay) {
    this.assets = assets;
    this.player?.dispose();
    this.player = new Character(assets, look, true);
    this.scene.add(this.player.holder);
    if (overlay) this.overlay = overlay;
    if (!this.combat && this.overlay) {
      this.fx = new CombatFx(this.scene, this.sparks, this.dust);
      this.naval = new NavalSystem(this.scene, this.seaEnv, this.fx, this.overlay, this.spray, this.sparks, this.ground, {
        shake: (a) => { this.shake = Math.max(this.shake, a); },
        hitstop: (t) => { this.hitstop.t = Math.max(this.hitstop.t, t); this.hitstop.scale = 0.05; },
        message: (t) => this.onMessage(t),
        sunk: (e) => this.onShipSunk(e),
        loot: (g, shard) => this.onLoot(g, shard),
      });
      this.naval.player = this.ship;
      this.naval.smoke = this.smoke;
      this.naval.debris = this.debris;
      this.combat = new CombatSystem(this.scene, this.fx, this.overlay, assets, this.groundProxy, {
        heal: (n) => { if (this.foot) this.foot.hp = Math.min(this.foot.maxHp, this.foot.hp + n); },
        hitstop: (t, scale = 0.05) => { this.hitstop.t = Math.max(this.hitstop.t, t); this.hitstop.scale = Math.min(this.hitstop.scale, scale); },
        shake: (a) => { this.shake = Math.max(this.shake, a); },
        kill: (e) => this.onKill(e),
        gold: (n) => this.onGold(n),
        message: (t) => this.onMessage(t),
      });
      this.combat.smoke = this.smoke;
      const home = this.ground.islands[0];
      this.combat.addDummy(home.x + 6, home.z - home.r * 0.55);
      this.combat.addDummy(home.x - 6, home.z - home.r * 0.55);
    }
    this.combat?.leaveIsland();
    this.foot = new PlayerFoot(this.player, style, {
      combat: this.combat, fx: this.fx, overlay: this.overlay,
      onDown: () => { this.downT = 3.2; this.onPlayerDown(); },
    });
    if (this.combat) this.combat.player = this.foot;
    this.style = style;
    this.faji = null;
    this.equip(style);
    this.attachToHelm();

    if (!this.npcs.length) {
      const rng = seeded(4242);
      const home = this.ground.islands[0];
      // Ladenbesitzer und wichtige Bewohner an festen Plätzen
      for (const d of TOWN_NPCS) {
        const n = new Npc(assets, home, this.ground, d.role, rng, this.outlineNpcs);
        n.pin(home.x + d.x, home.z + d.z, d.yaw);
        n.townDef = d;
        this.scene.add(n.char.holder);
        this.npcs.push(n);
      }
      const roles: NpcRole[] = ['fischer', 'haendler', 'pirat', 'koch', 'buerger', 'pirat', 'buerger', 'buerger', 'fischer', 'haendler'];
      for (const role of roles) {
        const n = new Npc(assets, home, this.ground, role, rng, this.outlineNpcs);
        this.scene.add(n.char.holder);
        this.npcs.push(n);
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
      const a = Math.random() * Math.PI * 2, d = 150 + Math.random() * 650;
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

  private equip(style: StyleId) {
    if (!this.player) return;
    const w = weaponsFor(style, this.weaponLook);
    this.player.hold('r', w.right);
    this.player.hold('l', w.left);
  }

  private attachToHelm() {
    if (!this.player) return;
    this.boat = this.ship.model.group;
    this.boat.add(this.player.holder);
    this.player.holder.position.copy(this.ship.model.helm);
    this.player.holder.scale.setScalar(1);
    this.player.holder.rotation.set(0, 0, 0);
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
    // Inseln im Nebel jenseits der Sichtweite gar nicht erst zeichnen (spart auf Handys viele Zeichenaufrufe)
    const vd = this.viewDist * 1.05;
    for (const i of this.islandGroups) i.g.visible = Math.hypot(i.x - cp.x, i.z - cp.z) < vd + i.r * 1.2;
    const home = BERNSTEINSEE.islands[0];
    if (this.town) this.town.group.visible = Math.hypot(home.x - cp.x, home.z - cp.z) < vd + home.r * 1.5;
  }

  applyQuality(c: QualityConfig) {
    this.figureDist = c.viewDistance * 0.14;
    this.viewDist = c.viewDistance;
    this.env.applyQuality(c);
    this.spray.scale = c.particles;
    this.sparks.scale = c.particles;
    this.dust.scale = c.particles;
    this.smoke.scale = c.particles;
    this.debris.scale = c.particles;
    if (this.fx) this.fx.scale = c.particles;
  }

  // ---------- Spielstand ----------

  getState(): SeaState {
    return { boat: { x: this.x, z: this.z, heading: this.heading }, env: this.env.getState() };
  }

  setState(s: Partial<SeaState>) {
    if (s.boat) {
      this.x = s.boat.x; this.z = s.boat.z; this.heading = s.boat.heading;
    } else {
      this.x = 0; this.z = 12; this.heading = 0;
    }
    if (s.env) this.env.setState(s.env);
    this.speed = 0;
    this.camYaw = 0;
    this.wake = [];
    const sh = this.ship;
    sh.x = this.x; sh.z = this.z; sh.heading = this.heading; sh.speed = 0; sh.sailLevel = 1; sh.throttle = 0.5; this.seaYaw = this.heading;
    sh.prev = { x: sh.x, z: sh.z, heading: sh.heading };
    this.naval?.clear();
    if (this.mode === 'foot') {
      this.combat?.leaveIsland();
      if (this.foot) { this.foot.onFoot = false; this.foot.revive(); }
      this.downT = 0;
      if (this.ownDeck) { this.ownDeck = false; this.deckGround = null; this.setSailFade(this.ship, false); }
      this.setMode('sail');
    }
  }

  /** Eigenes Schiff: Klasse, Aussehen, Munition, Zustand (aus Spielstand oder Werft) */
  setShip(tier: number, look: ShipLook, ammo: AmmoId, hullFrac: number, faction: Faction) {
    const onBoard = this.player && this.player.holder.parent === this.ship.model.group;
    if (onBoard) this.scene.add(this.player!.holder);
    this.ship.rebuild(tier, look, this.hullBonus);
    (this.ship as any).faction = faction;
    this.ship.ammo = ammo;
    this.ship.hull = Math.max(1, this.ship.maxHull * Math.max(0.05, Math.min(1, hullFrac)));
    this.ship.x = this.x; this.ship.z = this.z; this.ship.heading = this.heading;
    this.ship.prev = { x: this.x, z: this.z, heading: this.heading };
    this.boat = this.ship.model.group;
    if (this.naval) this.naval.player = this.ship;
    if (this.mode === 'sail') this.attachToHelm();
    this.crew?.setDeck(this.ship, this.crewHired);
  }

  /** Crew an Bord und Landtrupp einstellen */
  setCrew(hired: string[], party: string[], loyalty: Record<string, number>, level: number, allyBuff: number) {
    this.crewHired = [...hired];
    this.crewParty = [...party];
    this.crewLoyalty = loyalty;
    this.crewLevel = level;
    this.allyBuff = allyBuff;
    this.crew?.setDeck(this.ship, this.crewHired);
  }

  private spawnParty(yaw: number) {
    if (!this.crew || !this.foot || !this.combat) return;
    this.crew.spawnAllies(this.scene, this.crewParty, this.crewLevel, this.crewLoyalty, this.foot.x, this.foot.z, yaw, this.groundProxy, this.allyBuff);
    this.combat.allies = this.crew.allies;
    this.clearedNow = false;
  }

  /** Lebenspunkte und Angriffskraft der Spielfigur (aus Stufe und Ausrüstung) */
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
      setTimeout(() => {
        this.fx?.shockwave(p, 6 + i * 4, color);
        this.sparks.emit(60, p.x, p.y + 0.5, p.z, { speed: 3, up: 12, life: 1.6, color: new Color(color).multiplyScalar(3), gravity: -2, spread: 1.2 });
        this.shake = Math.max(this.shake, 0.6);
        if (i === 3) { this.overlay?.impactFrame(); this.overlay?.speedlines(1); }
      }, 400 + i * 650);
    }
  }

  /** Volle Heilung (Stufenaufstieg, Rast) */
  healPlayer() { if (this.foot) this.foot.hp = this.foot.maxHp; }

  get playerHp() { return this.foot ? { hp: this.foot.hp, max: this.foot.maxHp } : null; }

  /** Heilt um einen Anteil der Lebenspunkte (Proviant) */
  healFrac(f: number) {
    if (!this.foot) return;
    this.foot.hp = Math.min(this.foot.maxHp, this.foot.hp + this.foot.maxHp * f);
    const p = new Vector3(this.foot.x, this.foot.y + 1, this.foot.z);
    if (this.mode === 'foot') this.sparks.emit(24, p.x, p.y, p.z, { speed: 1.5, up: 3, life: 1, color: new Color(0.6, 3, 0.8), gravity: -1, spread: 0.6 });
  }

  /** Position der Spielfigur (an Land) oder des Schiffs, dazu die Blickrichtung */
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
    const n = this.npcs.find((m) => m.townDef?.id === id);
    return n ? { x: n.x, z: n.z } : null;
  }

  private _allyWorld: AllyWorld | null = null;
  private get allyWorld(): AllyWorld {
    return this._allyWorld ??= {
      enemies: () => this.combat?.enemies ?? [],
      hit: (e, dmg, dx, dz, col, heavy) => this.combat?.allyHit(e, dmg, dx, dz, col, heavy),
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
      splash: (x, z, big) => { this.spray.emit(big ? 80 : 30, x, 0.5, z, { speed: big ? 8 : 4, up: big ? 14 : 9, life: 1.6, color: new Color(0.95, 0.98, 1), spread: big ? 6 : 1.5 }); audio.play('splash', big ? 1.4 : 1, { x, z }); },
      hitPlayer: (dmg) => { this.ship.damage(dmg, 'kugel', null); this.shake = Math.max(this.shake, 0.5); this.overlay?.hurt(); this.overlay?.number(new Vector3(this.ship.x, 4, this.ship.z), dmg, 'hurt'); },
      roar: () => audio.play('roar'),
    });
    const show = b.alive && nearLair && this.mode === 'sail';
    this.overlay?.setBoss(show ? 'Der Tiefenschlund' : null, b.frac);
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
    }
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
  /** Nachladezeit wie in 1.0 */
  get reloadTime() { return 1.9 * (this.naval?.reloadMult ?? 1); }

  /** Kampfnähe 0 … 1 (für die Musik) */
  get threat() {
    if (this.mode === 'foot') return this.combat && this.combat.hostilesLeft > 0 && this.combat.enemies.some((e) => e.alive && e.engaged) ? 1 : this.combat?.hostilesLeft ? 0.4 : 0;
    const f = this.nearestFoe(this.x, this.z, 220);
    return f ? Math.max(0, Math.min(1, 1.3 - Math.hypot(f.x - this.x, f.z - this.z) / 160)) : 0;
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
  get enemyShips() {
    return (this.naval?.enemies ?? []).filter((e) => e.ship.alive && !e.ship.sinking).map((e) => ({ x: e.ship.x, z: e.ship.z, legend: e.role === 'legende', ally: !!e.companion }));
  }

  /** Nächstes Treibgut einer Art */
  nearestFloater(kind: 'raft' | 'bottle') { return this.life?.nearest(kind, this.x, this.z) ?? null; }

  /** Testwerkzeug: Schiff an eine Position setzen */
  teleport(x: number, z: number, heading: number) {
    this.setState({ boat: { x, z, heading } });
  }

  private setMode(m: SeaMode) {
    this.mode = m;
    if (m === 'sail') this.attachToHelm();
    this.onModeChange(m);
  }

  // ---------- Logik ----------

  update(dt: number, input: Input) {
    this.env.update(dt, this.focus);

    if (this.cinematic > 0) this.cinematic -= dt;
    else if (this.mode === 'sail') this.updateSail(dt, input);
    else this.updateFoot(dt, input);

    this.updateContext(input);
    this.updateWorldEvents();
    this.life?.update(dt, (x, z) => this.env.heightAt(x, z), this.ship, this.mode === 'sail');
    if (this.town?.crystal) { this.town.crystal.rotation.y += dt; this.town.crystal.position.y += Math.sin(this.env.clock * 2) * dt * 0.3; }
    // Vulkane: dicke Aschesäulen mit Glut am Krater, weithin sichtbar
    if (Math.random() < dt * 3) for (const p of this.smokeVents) if (Math.hypot(p.x - this.x, p.z - this.z) < 900) this.smoke.puff(p.x, p.y, p.z, { size: 5, grow: 26, life: 14, tone: 0.28, vy: 5, spread: 1.5, rise: 0.5, drag: 0.5, alpha: 0.65, glow: 0.6, wind: 0.8, jitter: 3 });
    // Lagerfeuer auf den Inseln: dünne Rauchfahne und Funken
    for (const f of this.campfires) {
      const dd = Math.hypot(f.x - this.playerPos.x, f.z - this.playerPos.z);
      if (dd > 450) continue;
      if (Math.random() < dt * 2.5) this.smoke.puff(f.x, f.y + 0.6, f.z, { size: 0.4, grow: 3, life: 5, tone: 0.34, vy: 1.8, spread: 0.12, rise: 0.7, alpha: 0.32, glow: 0.4, wind: 0.6 });
      if (dd < 120 && Math.random() < dt * 8) this.sparks.emit(1, f.x, f.y + 0.3, f.z, { speed: 0.4, up: 2.5, life: 0.9, color: new Color(3.2, 1.3, 0.3), gravity: -1.5, spread: 0.4 });
    }
    // Schornsteine der Hafenstadt
    if (this.town && Math.random() < dt * 5) for (const p of this.town.smoke) if (Math.hypot(p.x - this.x, p.z - this.z) < 400) this.smoke.puff(p.x, p.y, p.z, { size: 0.5, grow: 3.5, life: 6, tone: 0.62, vy: 1.2, spread: 0.15, rise: 0.3, alpha: 0.5, wind: 0.7 });
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.updateWake(dt);
    this.naval?.update(dt, this.mode === 'sail' && this.cinematic <= 0);
    this.regen(dt);
    this.checkZone();
    if (this.crystal) {
      const c = this.crystal;
      c.mesh.rotation.y += dt * 1.5;
      c.mesh.position.y = c.y + Math.sin(this.env.clock * 2) * 0.3;
      if (Math.random() < dt * 8) this.sparks.emit(1, c.x + (Math.random() - 0.5) * 1.5, c.y - 1, c.z + (Math.random() - 0.5) * 1.5, { speed: 0.3, up: 2.5, life: 1, color: new Color(1.4, 0.8, 2.4), gravity: -1, spread: 0.2 });
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
        this.embark();
        this.onMessage('Deine Crew hat dich an Bord gezogen.');
      }
    }
    // Eigenes Schiff gesunken: Crew flickt es notdürftig am Start
    if (this.ship.sinking > 4) {
      this.ship.sinking = 0;
      this.ship.repair(0.5);
      this.naval?.clear();
      this.teleport(0, 12, 0);
      this.onMessage('Dein Schiff ist gesunken! Die Crew hat es zurück in den Hafen geschleppt.');
      this.onPlayerDown();
    }
    if (this.ship.hull <= 0 && this.ship.sinking === 0) this.ship.sinking = 0.01;
  }

  get seaEnv(): SeaEnv {
    const env = this.env;
    return { heightAt: (x, z) => env.heightAt(x, z), windDir: env.windDir, windStrength: env.weather.p.wind, time: env.clock };
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
    s.throttle = th;
    if ((before < 0.95 && th >= 0.95) || (before > 0.05 && th <= 0.05)) { this.onMessage(th > 0.5 ? 'Volle Fahrt!' : 'Anker geworfen'); audio.play('sail'); }
    this.sailCd -= dt;
    this.faji?.tick(dt);
    s.steer(dt, mv.x, this.seaEnv, this.shipSpeedMult);
    const storm = this.env.weather.p.waves;
    if (storm > 1.5) {
      s.x += Math.sin(this.env.clock * 0.3) * (storm - 1.5) * 0.6 * dt;
      s.z += Math.cos(this.env.clock * 0.23) * (storm - 1.5) * 0.6 * dt;
    }
    // Nicht auf Inseln auffahren
    const isl = this.ground.islandAt(s.x, s.z, s.cls.W + 3);
    if (isl) {
      const o = this.ground.pushOut(isl, s.x, s.z, s.cls.W + 3);
      s.x = o.x; s.z = o.z;
      if (s.speed > 6) { this.shake = Math.max(this.shake, 0.5); this.onMessage('Auf Grund gelaufen!'); s.damage(s.speed * 1.5, 'kugel', null); }
      s.speed *= 0.4;
    }
    this.collidePiers(s);
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
    if (input.pressed('dodge') && this.boostCd <= 0) {
      s.boost = 2.5;
      this.boostCd = 8;
      this.shake = Math.max(this.shake, 0.5);
      this.overlay?.speedlines(0.6);
      this.onMessage('Volle Kraft voraus!');
    }
    if (input.pressed('heavy')) {
      s.ammo = AMMO_IDS[(AMMO_IDS.indexOf(s.ammo) + 1) % AMMO_IDS.length];
      this.onMessage(`Munition: ${AMMO[s.ammo].n} – ${AMMO[s.ammo].d}`);
    }
    const nav = this.naval;
    if (nav && s.alive) {
      if (input.pressed('attack') && this.cdBow <= 0) { this.cdBow = 1.2; nav.bowShot(s, nav.canDmg, s.ammo); }
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
    this.camYaw -= lx;
    this.camPitch = MathUtils.clamp(this.camPitch + ly, 0.06, 1.1);
    if (this.camIdle > 2.5) this.camYaw *= 1 - Math.min(1, dt * 1.2);
    this.camDist = MathUtils.clamp(this.camDist + input.zoomDelta() * 2, 12, 45);
    this.focus.set(this.x, 0, this.z);
  }

  private updateFoot(dt: number, input: Input) {
    const f = this.foot;
    if (!f || !this.player) return;
    const ld = input.lookDelta();
    const la = input.lookAxis();
    this.footYaw -= ld.x * 0.006 + la.x * 2.4 * dt;
    this.footPitch = MathUtils.clamp(this.footPitch + ld.y * 0.004 + la.y * 1.5 * dt, 0.05, 1.2);
    this.footDist = MathUtils.clamp(this.footDist + input.zoomDelta() * 0.8, 3.5, 14);
    const c = this.combat;
    if (c && input.pressed('lockon')) c.toggleLock(f.x, f.z, this.footYaw);
    const lock = c?.lock?.alive ? c.lock : null;
    const lockYaw = lock ? Math.atan2(lock.x - f.x, lock.z - f.z) : null;
    f.update(dt, input, this.footYaw, this.groundProxy, lockYaw);
    // Entern: Deck geräumt?
    if (this.boarding && c && c.hostilesLeft === 0 && this.boardDone === 0) {
      this.boardDone = 2.6;
      this.overlay?.showBanner('Schiff erobert!', 'Die Beute gehört dir');
      this.naval?.capture(this.boarding);
      this.onBoardWon(this.boarding);
    }
    if (this.boardDone > 0) { this.boardDone -= dt; if (this.boardDone <= 0) this.embark(); }
    this.faji?.update(dt, input, this.style, lockYaw);
    if (lockYaw !== null && !(ld.x || la.x)) {
      // Erfasstes Ziel: Kamera hinter die Figur, Blick aufs Ziel
      const diff = MathUtils.euclideanModulo(lockYaw - this.footYaw + Math.PI, Math.PI * 2) - Math.PI;
      this.footYaw += diff * Math.min(1, dt * 4);
    } else if (f.speed > 4 && !(ld.x || la.x)) {
      const diff = MathUtils.euclideanModulo(f.yaw - this.footYaw + Math.PI, Math.PI * 2) - Math.PI;
      if (Math.abs(diff) < 2.2) this.footYaw += diff * Math.min(1, dt * 0.8);
    }
    this.focus.set(f.x, f.y, f.z);
    // Boot liegt vor Anker und schaukelt nur
    this.speed = 0;
  }

  private updateContext(input: Input) {
    this.contextLabel = null;
    if (!this.player || !this.foot) return;
    if (this.mode === 'sail') {
      const prey = this.naval?.boardable();
      const isl = this.ground.islandAt(this.x, this.z, 30 + this.ship.cls.W);
      if (prey) {
        this.contextLabel = 'Entern!';
        if (input.pressed('interact')) this.board(prey);
      } else if (isl) {
        const def = this.islandDefs[this.ground.islands.indexOf(isl)];
        if (def?.kind === 'town' || def?.kind === 'harbor') {
          this.contextLabel = 'Hafen';
          if (input.pressed('interact')) { this.ship.throttle = 0; this.onHarbor(def); }
        } else {
          this.contextLabel = 'An Land gehen';
          if (input.pressed('interact')) this.disembark(isl);
        }
      } else {
        // wie in 1.0: aufs eigene Deck gehen
        this.contextLabel = 'An Deck gehen';
        if (input.pressed('interact')) this.goDeck();
      }
    } else if (this.ownDeck) {
      const f = this.foot;
      const hand = this.crew?.deckHandNear(f.x, f.z, 1.9) ?? null;
      const dg = this.deckGround;
      const atRail = dg ? dg.railDistance(f.x, f.z) < 0.9 : false;
      if (this.fishing) {
        const fi = this.fishing;
        this.contextLabel = fi.bite > 0 ? 'Einholen!' : 'Angel einholen';
        if (input.pressed('interact')) {
          if (fi.bite > 0) { this.player.play('fishCatch', { restart: true, onDone: () => this.player?.play('idle') }); audio.play('splash'); this.onFish(true); }
          else { this.player.play('idle', { fade: 0.2 }); this.onFish(false); }
          this.fishing = null;
        }
      } else if (hand) {
        this.contextLabel = `Mit ${hand.name.split(' ')[0]} reden`;
        if (input.pressed('interact')) this.onCrewLine(hand, hand.lines[Math.floor(Math.random() * hand.lines.length)]);
      } else if (atRail && this.threat < 0.1) {
        this.contextLabel = 'Angeln';
        if (input.pressed('interact')) {
          this.fishing = { wait: 2.5 + Math.random() * 5, bite: 0 };
          this.player.play('fishCast', { restart: true, onDone: () => this.player?.play('fishIdle', { fade: 0.2 }) });
          audio.play('whoosh', 0.6);
        }
      } else {
        this.contextLabel = 'Ans Steuer';
        if (input.pressed('interact')) this.toHelm();
      }
    } else if (this.boarding) {
      this.contextLabel = 'Zurück an Bord';
      if (input.pressed('interact')) this.embark();
    } else {
      const f = this.foot;
      const cr = this.crystal && Math.hypot(this.crystal.x - f.x, this.crystal.z - f.z) < 3.2 && !this.combat?.hostilesLeft ? this.crystal : null;
      const dig = this.life?.digs.find((dd) => Math.hypot(dd.x - f.x, dd.z - f.z) < 2.6);
      if (cr) {
        this.contextLabel = 'Faji-Kristall erwecken';
        if (input.pressed('interact')) {
          this.player.play('cheer', { restart: true, loop: false, onDone: () => this.player?.play('idle') });
          this.fx?.shockwave(new Vector3(cr.x, f.y, cr.z), 8, '#C77DFF');
          this.sparks.emit(60, cr.x, cr.y, cr.z, { speed: 7, up: 6, life: 1.2, color: new Color(1.4, 0.8, 2.4), spread: 0.5 });
          cr.mesh.removeFromParent();
          this.crystal = null;
          this.onCrystal(cr.id);
        }
        return;
      }
      const npc = this.npcs.find((n) => n.townDef && Math.hypot(n.x - f.x, n.z - f.z) < 3.2);
      const d = Math.hypot(f.x - this.anchor.x, f.z - this.anchor.z);
      if (dig) {
        this.contextLabel = 'Graben';
        if (input.pressed('interact')) {
          this.player.play('pickup', { restart: true, onDone: () => this.player?.play('idle') });
          this.fx?.shockwave(new Vector3(dig.x, f.y, dig.z), 3, '#E3B04B');
          this.dust.emit(30, dig.x, f.y + 0.3, dig.z, { speed: 3, up: 5, life: 1, color: new Color(0.9, 0.8, 0.6) });
          this.life?.removeDig(dig);
          this.onDig(dig.island);
        }
      } else if (npc?.townDef) {
        this.contextLabel = `Sprechen: ${npc.townDef.name}`;
        if (input.pressed('interact')) {
          npc.yaw = Math.atan2(f.x - npc.x, f.z - npc.z);
          npc.char.play('talk', { restart: true, onDone: () => npc.char.play('idle') });
          this.onTalk(npc.townDef);
        }
      } else if (d < 6) {
        this.contextLabel = 'An Bord gehen';
        if (input.pressed('interact')) this.embark();
      }
    }
  }

  /** Inseln in der Nähe und geräumte Lager melden (für Aufträge) */
  private updateWorldEvents() {
    const near = this.islandDefs.findIndex((d) => Math.hypot(d.x - this.x, d.z - this.z) < d.r + 45);
    const id = near >= 0 ? this.islandDefs[near].id : null;
    // Inseln entdecken (Sichtweite wie in 1.0, Ausguck weiter) und Schilder zeigen
    const disc = 280 * this.rangeMult;
    const px = this.mode === 'foot' && this.foot ? this.foot.x : this.x, pz = this.mode === 'foot' && this.foot ? this.foot.z : this.z;
    for (const l of this.labels) {
      const d = Math.hypot(l.x - px, l.z - pz);
      if (!this.discovered.has(l.id) && d < disc + l.r) { this.discovered.add(l.id); this.onDiscover(l.id); }
      l.sprite.visible = this.discovered.has(l.id) && d < 760 && d > l.r + 25;
    }
    const reg = regionAt(this.x, this.z);
    if (reg.id !== this.lastRegion) { this.lastRegion = reg.id; this.onEnterRegion(reg); }
    if (id && id !== this.lastIsland) this.onEnterIsland(this.islandDefs[near]);
    this.lastIsland = id;
    const c = this.combat;
    if (c?.activeIsland && !this.boarding) {
      const left = c.hostilesLeft;
      if (left === 0 && this.hostilesBefore > 0) {
        const def = this.islandDefs[this.ground.islands.indexOf(c.activeIsland)];
        if (def) { this.onIslandCleared(def.id); this.overlay?.showBanner('Insel befreit!', def.name); }
      }
      this.hostilesBefore = left;
    } else this.hostilesBefore = 0;
    // Treibgut einsammeln
    if (this.mode === 'sail' && this.life) {
      for (const k of this.life.collect(this.x, this.z, this.ship.cls.W + 9)) {
        if (k === 'raft') { this.onRescue(); setTimeout(() => this.spawnFloaterSomewhere('raft'), 60000); }
        else { this.onBottle(); setTimeout(() => this.spawnFloaterSomewhere('bottle'), 90000); }
      }
    }
  }

  /** Auf dem eigenen Deck unterwegs (wie in 1.0) */
  private ownDeck = false;

  /** Stege sind schmale Hindernisse: das Schiff legt seitlich an, statt hindurchzufahren (Bug, Mitte, Heck prüfen) */
  private collidePiers(s: Ship) {
    for (const p of this.piers) {
      const vx = p.bx - p.ax, vz = p.bz - p.az;
      const len2 = vx * vx + vz * vz;
      for (const k of [-0.42, 0, 0.42]) {
        const px = s.x + Math.sin(s.heading) * s.cls.L * k, pz = s.z + Math.cos(s.heading) * s.cls.L * k;
        const t = Math.max(0, Math.min(1, ((px - p.ax) * vx + (pz - p.az) * vz) / len2));
        const cx = p.ax + vx * t, cz = p.az + vz * t;
        let dx = px - cx, dz = pz - cz;
        let d = Math.hypot(dx, dz);
        const min = p.hw + s.cls.W * 0.5 + 0.6;
        if (d >= min) continue;
        if (d < 1e-3) { dx = -vz; dz = vx; d = Math.hypot(dx, dz); }
        s.x += (dx / d) * (min - d);
        s.z += (dz / d) * (min - d);
        s.speed *= 0.8;
      }
    }
  }

  private goDeck() {
    if (!this.player || !this.foot) return;
    this.ownDeck = true;
    this.ship.throttle = 0;
    this.deckGround = new DeckGround(this.ship);
    this.scene.add(this.player.holder);
    // mittschiffs, Blick zum Heck: die Kamera steht über dem freien Vorschiff
    const start = this.deckGround.spot(0, 0.3);
    this.footDist = 6.5;
    this.footPitch = 0.55;
    this.foot.place(start.x, start.z, this.ship.heading + Math.PI, this.groundProxy);
    this.foot.onFoot = true;
    this.footYaw = this.ship.heading + Math.PI;
    this.setSailFade(this.ship, true);
    this.setMode('foot');
  }

  private toHelm() {
    this.ownDeck = false;
    this.deckGround = null;
    this.fishing = null;
    if (this.foot) this.foot.onFoot = false;
    this.setSailFade(this.ship, false);
    this.setMode('sail');
  }

  /** Segel beim Entern durchsichtig (wie in 1.0), damit sie die Kamera nicht verdecken */
  private setSailFade(ship: Ship, fade: boolean) {
    for (const s of ship.model.sails) {
      const m = s.material as { transparent: boolean; opacity: number; depthWrite: boolean; needsUpdate: boolean };
      m.transparent = fade;
      m.opacity = fade ? 0.22 : 1;
      m.depthWrite = !fade;
      m.needsUpdate = true;
    }
  }

  /** An der nächsten Insel an Land gehen (Hafenmenü) */
  goAshore() {
    const isl = this.ground.islandAt(this.x, this.z, 40 + this.ship.cls.W);
    if (isl && this.mode === 'sail') this.disembark(isl);
  }

  private disembark(isl: WalkIsland) {
    if (!this.player || !this.foot) return;
    const p = this.ground.shorePoint(isl, this.x, this.z);
    this.anchor = { x: p.x, z: p.z };
    this.speed = 0;
    this.scene.add(this.player.holder);
    this.foot.place(p.x, p.z, Math.atan2(isl.x - p.x, isl.z - p.z), this.ground);
    this.foot.onFoot = true;
    this.footYaw = this.foot.yaw;
    this.setMode('foot');
    this.spawnCamp(isl);
    this.spawnParty(this.foot.yaw);
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
      (['fischer', 'buerger', 'buerger'] as NpcRole[]).forEach((role) => {
        const n = new Npc(this.assets!, isl, this.ground, role, Math.random, this.outlineNpcs);
        this.scene.add(n.char.holder);
        this.visitors.push(n);
      });
      this.onMessage(`${where}: ${def.info}`);
      this.onVillage(def.id);
      return;
    }
    if (def.kind !== 'camp' && def.kind !== 'boss' && def.kind !== 'ruin') { this.onMessage(`${where}: ${def.info}`); return; }
    const until = this.cleared.get(idx) ?? 0;
    if (until > this.env.clock && !this.questWantsClear(def.id)) { this.onMessage(`${where} ist ruhig – fürs Erste.`); return; }
    const enemyFaction: Faction = this.playerFaction === 'pirat' ? 'marine' : 'pirat';
    if (def.kind === 'boss') {
      const lv = def.level ?? 6;
      c.enterIsland(isl, lv >= 9 ? ['legende', 'hauptmann', 'fajiwirker', 'musketier', 'schildtraeger', 'schlaeger'] : ['legende', 'matrose', 'musketier', 'schildtraeger'], lv, enemyFaction, def.boss ?? 'Die Legende');
      this.onMessage(`${where}: ${def.boss ?? 'Eine Legende'} erwartet dich!`);
      return;
    }
    if (def.kind === 'ruin') {
      const lv = def.level ?? 5;
      c.enterIsland(isl, ['fajiwirker', 'fajiwirker', 'schlaeger', 'musketier', 'schildtraeger', ...(lv >= 12 ? ['hauptmann' as const] : [])], lv, enemyFaction);
      this.onMessage(`${where}: Faji-Wirker hüten die Ruine! (Stufe ${lv})`);
      return;
    }
    const level = def.level ?? 1;
    c.enterIsland(isl, CAMP_BY_LEVEL[Math.min(CAMP_BY_LEVEL.length - 1, level - 1)], level, enemyFaction);
    this.onMessage(`${where}: Feindliches Lager! (Stufe ${level})`);
  }

  /** Entern: über einen Enterhaken aufs feindliche Deck */
  private board(e: EnemyShip) {
    if (!this.player || !this.foot || !this.combat) return;
    this.boarding = e;
    this.boardDone = 0;
    this.ship.speed = 0; this.ship.sailLevel = 0;
    e.ship.speed = 0; e.ship.sailLevel = 0; e.ship.frozen = 999;
    this.deckGround = new DeckGround(e.ship);
    const crewN = Math.max(2, Math.min(7, Math.round(e.ship.cls.crew * (0.4 + e.ship.crew * 0.6))));
    const kinds: EnemyKind[] = [];
    if (e.role === 'legende') kinds.push('legende');
    else if (e.ship.cls.L > 25) kinds.push('hauptmann');
    const pool: EnemyKind[] = e.level >= 4 ? ['matrose', 'schildtraeger', 'musketier', 'schlaeger', 'fajiwirker'] : ['matrose', 'matrose', 'musketier', 'schildtraeger'];
    while (kinds.length < crewN) kinds.push(pool[Math.floor(Math.random() * pool.length)]);
    const enemyFaction: Faction = e.ship.faction;
    this.combat.enterDeck(this.deckGround, kinds, e.level, enemyFaction, e.name);
    this.scene.add(this.player.holder);
    // Mitte des Decks, Blick zum Heck: die Kamera steht dann über dem freien Vorschiff statt hinter dem Steuerrad
    const start = this.deckGround.spot(0, 0.2);
    this.footDist = 6;
    this.footPitch = 0.5;
    this.foot.place(start.x, start.z, e.ship.heading + Math.PI, this.groundProxy);
    this.foot.onFoot = true;
    this.footYaw = e.ship.heading + Math.PI;
    this.setSailFade(e.ship, true);
    this.overlay?.showCutin('Entern!', '#A8322A');
    this.overlay?.speedlines(1);
    audio.play('board');
    this.setMode('foot');
    this.spawnParty(e.ship.heading);
  }

  private embark() {
    if (this.boarding) {
      this.setSailFade(this.boarding.ship, false);
      this.boarding.ship.frozen = 0;
      this.boarding = null;
      this.boardDone = 0;
      this.deckGround = null;
      this.combat?.leaveIsland();
    }
    const c = this.combat;
    if (c?.activeIsland) {
      const idx = this.ground.islands.indexOf(c.activeIsland);
      if (c.hostilesLeft === 0) this.cleared.set(idx, this.env.clock + 300);
      c.leaveIsland();
    }
    if (this.foot) this.foot.onFoot = false;
    for (const n of this.visitors) { n.char.holder.removeFromParent(); n.char.dispose(); }
    this.visitors = [];
    this.crew?.clearAllies();
    if (this.combat) this.combat.allies = [];
    this.setMode('sail');
    this.onMessage('Leinen los!');
  }

  private updateNpcs(dt: number) {
    const p = this.mode === 'foot' && this.foot ? new Vector3(this.foot.x, 0, this.foot.z) : null;
    const cam = this.camera.position;
    for (const n of this.npcs) n.update(dt, p, Math.hypot(cam.x - n.x, cam.z - n.z));
    for (const n of this.visitors) n.update(dt, p, Math.hypot(cam.x - n.x, cam.z - n.z));
  }

  /** Im Menü: Schiff treibt, Zeit und Wetter laufen weiter */
  idle(dt: number) {
    this.env.update(dt, this.focus);
    this.menuOrbit += dt * 0.08;
    this.updateWake(dt);
    this.spray.update(dt);
    this.sparks.update(dt);
    this.dust.update(dt);
    this.updateAir(dt);
    this.fx?.update(dt);
    this.updateNpcs(dt);
    this.player?.update(dt);
  }

  private updateWake(dt: number) {
    for (const w of this.wake) w.age += dt;
    this.wake = this.wake.filter((w) => w.age < 6);
    this.wakeTimer -= dt;
    if (this.wakeTimer <= 0 && Math.abs(this.speed) > 1.5) {
      this.wakeTimer = WAKE_INTERVAL;
      const f = this.fwd();
      const back = this.ship.cls.L * 0.42;
      this.wake.unshift({ x: this.x - f.x * back, z: this.z - f.z * back, age: 0, strength: Math.min(1, Math.abs(this.speed) / 10) });
    }
    this.env.ocean.setWake(this.wake);
  }

  private fwd(h = this.heading) { return new Vector3(Math.sin(h), 0, Math.cos(h)); }

  // ---------- Darstellung ----------

  render(alpha: number, frameDt: number, inMenu: boolean) {
    this.cullFigures();
    const s = this.ship;
    const x = MathUtils.lerp(s.prev.x, s.x, alpha);
    const z = MathUtils.lerp(s.prev.z, s.z, alpha);
    const h = s.prev.heading + (s.heading - s.prev.heading) * alpha;
    const env = this.env;
    const pal = env.palette;
    const night = 1 - pal.sunVis;
    const sea = this.seaEnv;

    const wy = env.heightAt(x, z);
    const f = this.fwd(h);
    s.render(alpha, sea, night, frameDt);
    for (const e of this.naval?.enemies ?? []) e.ship.render(alpha, sea, night, frameDt);
    const L = s.cls.L;
    if (s.speed > 3 && Math.random() < frameDt * 30) {
      this.spray.emit(2, x - f.x * L * 0.5, wy + 0.1, z - f.z * L * 0.5, { speed: 1, up: 1.2, life: 1.2, color: new Color(0.95, 0.98, 1), gravity: 3, spread: s.cls.W * 0.4 });
    }
    if (s.speed > 6 && Math.random() < frameDt * 18 && this.mode === 'sail') {
      this.spray.emit(5, x + f.x * L * 0.5, wy + 0.6, z + f.z * L * 0.5, { speed: 2.5, up: 4, life: 1, color: new Color(0.95, 0.98, 1) });
    }
    for (const b of this.buoys) {
      b.g.position.set(b.x, env.heightAt(b.x, b.z) - 0.3, b.z);
      b.g.rotation.z = Math.sin(env.clock * 1.3 + b.x) * 0.15;
      b.lamp.visible = night > 0.3 || Math.sin(env.clock * 3 + b.z) > 0;
    }
    for (const l of this.lamps) l.scale.setScalar(0.6 + night * 0.7);
    if (this.town) for (const l of this.town.lights) l.visible = night > 0.2;

    const cam = this.camera;
    if (this.mode === 'foot' && this.foot && this.player && !inMenu) {
      const p = this.foot;
      const px = MathUtils.lerp(p.prev.x, p.x, alpha);
      const pz = MathUtils.lerp(p.prev.z, p.z, alpha);
      const py = MathUtils.lerp(p.prev.y, p.y, alpha);
      const pyaw = p.prev.yaw + (MathUtils.euclideanModulo(p.yaw - p.prev.yaw + Math.PI, Math.PI * 2) - Math.PI) * alpha;
      this.player.holder.position.set(px, py, pz);
      this.player.holder.rotation.set(0, pyaw, 0);
      const cp = Math.cos(this.footPitch);
      this.tmp.set(px - Math.sin(this.footYaw) * this.footDist * cp, py + 1.4 + Math.sin(this.footPitch) * this.footDist, pz - Math.cos(this.footYaw) * this.footDist * cp);
      cam.position.lerp(this.tmp, Math.min(1, frameDt * 10));
      const gy = this.ground.height(cam.position.x, cam.position.z);
      const floor = Math.max(env.heightAt(cam.position.x, cam.position.z) + 0.8, Number.isFinite(gy) ? gy + 0.6 : -99);
      if (cam.position.y < floor) cam.position.y = floor;
      cam.lookAt(px, py + 1.3, pz);
      this.focus.set(px, py + 1, pz);
    } else if (inMenu) {
      const a = this.menuOrbit;
      cam.position.set(x + Math.sin(a) * 30, 9 + Math.sin(a * 2) * 1.5, z + Math.cos(a) * 30);
      cam.lookAt(x, 4, z);
      this.focus.set(x, wy + 2, z);
    } else {
      // Kampfkamera wie in 1.0: das nächste Feindschiff kommt mit ins Bild
      const portrait = innerHeight > innerWidth;
      const foe = this.nearestFoe(x, z, this.seaRange * 1.7);
      const want = foe ? Math.atan2(foe.x - x, foe.z - z) : h;
      this.seaYaw += (MathUtils.euclideanModulo(want - this.seaYaw + Math.PI, Math.PI * 2) - Math.PI) * Math.min(1, frameDt * (foe ? 1.4 : 1.8));
      const sep = foe ? Math.hypot(foe.x - x, foe.z - z) : 0;
      // Abstand und Höhe wie in 1.0 (Hochformat weiter weg), Zoom und Neigung vom Spieler
      const yaw = this.seaYaw + Math.PI + this.camYaw;
      const zoom = this.camDist / 22;
      const back = ((portrait ? 22 : 16) + L * 1.45 + sep * 0.3 + (s.boost > 0 ? 4 : 0)) * zoom;
      const up = ((portrait ? 12 : 8) + L * 0.6 + sep * (portrait ? 0.5 : 0.32)) * zoom * (0.6 + this.camPitch * 1.3);
      this.tmp.set(x + Math.sin(yaw) * back, Math.max(wy + 2, up), z + Math.cos(yaw) * back);
      cam.position.lerp(this.tmp, Math.min(1, frameDt * 3));
      const camWater = env.heightAt(cam.position.x, cam.position.z) + 1.2;
      if (cam.position.y < camWater) cam.position.y = camWater;
      if (foe) cam.lookAt(x + (foe.x - x) * 0.45, 2, z + (foe.z - z) * 0.45);
      else cam.lookAt(x + Math.sin(this.seaYaw) * (12 + L), 2, z + Math.cos(this.seaYaw) * (12 + L));
      // Die Kamera rollt leicht mit dem Schiff: Dünung und Rückstoß der Breitseiten werden spürbar
      const g = s.model.group.rotation;
      const rel = this.seaYaw + this.camYaw - h;
      // (Kamera-Z zeigt nach hinten, Schiffs-Z nach vorn – daher das Minus)
      cam.rotateZ(-(g.z * Math.cos(rel) - g.x * Math.sin(rel)) * 0.3);
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
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.6;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    env.render(cam, this.focus);
  }
}
