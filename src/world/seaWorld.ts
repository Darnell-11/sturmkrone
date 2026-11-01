import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
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
import { IslandGround, type WalkIsland } from './islandGround';
import type { IslandShape } from './ocean';
import { ParticleSystem } from './particles';
import { seeded } from './waves';
import { CombatFx } from '../combat/fx';
import { CombatSystem } from '../combat/combat';
import type { EnemyKind } from '../data/combat';
import type { Faction } from '../core/save/types';
import type { CombatOverlay } from '../ui/combatOverlay';
import type { Enemy } from '../entities/enemy';
import { FajiController } from '../faji/fajiController';
import type { SkillState } from '../core/save/types';
import { Ship, type SeaEnv } from '../entities/ship/ship';
import { AMMO, AMMO_IDS, DEFAULT_SHIP_LOOK, SAIL_LEVELS, type AmmoId, type ShipLook } from '../data/ships';
import { NavalSystem, type EnemyShip } from '../naval/naval';
import { DeckGround, type Ground } from './islandGround';
import { ELEMENT_COLORS } from '../data/skills';

/** Gegnerlager je Inselstufe */
const CAMP_BY_LEVEL: EnemyKind[][] = [
  ['matrose', 'matrose', 'musketier'],
  ['matrose', 'matrose', 'schildtraeger', 'musketier'],
  ['matrose', 'schildtraeger', 'musketier', 'fajiwirker', 'matrose'],
  ['matrose', 'schildtraeger', 'musketier', 'fajiwirker', 'schlaeger'],
  ['hauptmann', 'matrose', 'schildtraeger', 'musketier', 'fajiwirker', 'schlaeger'],
];

const WAKE_INTERVAL = 0.22;

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
  private sailCd = 0;
  private aimSide = 0;
  private aimT = 0;
  private boarding: EnemyShip | null = null;
  private deckGround: DeckGround | null = null;
  private buoys: { g: Group; x: number; z: number; lamp: Mesh }[] = [];
  private lamps: Mesh[] = [];
  private spray: ParticleSystem;
  private sparks: ParticleSystem;
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

    this.islands = this.buildIslands();
    this.env.setIslands(this.islands);
    this.buildBuoys();
    this.spray = new ParticleSystem(this.scene, false, 0.8);
    this.sparks = new ParticleSystem(this.scene, true, 0.5);
    this.dust = new ParticleSystem(this.scene, false, 0.9);
  }

  // ---------- Aufbau ----------

  private buildIslands(): IslandShape[] {
    const rnd = seeded(2024);
    const shapes: IslandShape[] = [];
    // Startinsel direkt vor dem Schiff, dann zufällige Inseln drumherum
    const specs: { x: number; z: number; r: number; hill: number; palms: number; tower: boolean }[] = [
      { x: 0, z: 70, r: 40, hill: 0.22, palms: 6, tower: false },
    ];
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + rnd() * 0.4;
      const dist = 200 + rnd() * 1450;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      if (Math.hypot(x, z - 70) < 160) continue;
      specs.push({ x, z, r: 18 + rnd() * 26, hill: 0.14 + rnd() * 0.16, palms: 2 + Math.floor(rnd() * 4), tower: specs.length === 1 });
    }

    const sand = toon(0xf1d9a0);
    const grass = toon({ color: 0x6dbb4c, flatShading: true });
    const trunk = toon(0x8a5a2b);
    const leaf = toon({ color: 0x3f9a3a, flatShading: true });
    const stone = toon(0xe8e2d4);
    const red = toon(0xa8322a);
    const rock = toon({ color: 0x8a8378, flatShading: true });

    for (const s of specs) {
      const { r } = s;
      const isl = new Group();
      isl.position.set(s.x, 0, s.z);
      const walk: WalkIsland = { x: s.x, z: s.z, r, beachY: 1.3, hillR: r * 0.75, hillScale: s.hill, hillY: 1.2, blockers: [] };
      shapes.push({ x: s.x, z: s.z, r: r * 1.15 });
      const beach = new Mesh(new CylinderGeometry(r, r * 1.25, 3, 36), sand);
      beach.position.y = -0.2;
      const hill = new Mesh(new SphereGeometry(r * 0.75, 18, 10), grass);
      hill.scale.y = s.hill;
      hill.position.y = 1.2;
      isl.add(beach, hill);
      if (rnd() < 0.5 && !s.tower) {
        const rk = new Mesh(new ConeGeometry(r * 0.22, r * 0.7, 6), rock);
        rk.position.set(r * 0.45, 1.2 + r * 0.25, -r * 0.3);
        isl.add(rk);
        walk.blockers.push({ x: s.x + r * 0.45, z: s.z - r * 0.3, r: r * 0.22 });
      }
      for (let k = 0; k < s.palms; k++) {
        const pa = rnd() * Math.PI * 2;
        const pr = r * (0.3 + rnd() * 0.55);
        const palm = new Group();
        const px = Math.cos(pa) * pr, pz = Math.sin(pa) * pr;
        const d = Math.hypot(px, pz);
        const baseY = Math.max(1.3, d < r * 0.75 ? 1.2 + Math.sqrt((r * 0.75) ** 2 - d * d) * s.hill : 1.3);
        palm.position.set(px, baseY - 0.1, pz);
        palm.rotation.z = (rnd() - 0.5) * 0.4;
        const t = new Mesh(new CylinderGeometry(0.25, 0.4, 7, 6), trunk);
        t.position.y = 3.5;
        palm.add(t);
        for (let l = 0; l < 6; l++) {
          const f = new Mesh(new ConeGeometry(0.9, 4.2, 4), leaf);
          f.position.y = 7;
          f.rotation.set(Math.PI / 2.4, (l / 6) * Math.PI * 2, 0, 'YXZ');
          f.scale.z = 0.25;
          palm.add(f);
        }
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
      isl.traverse((o) => {
        if ((o as Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      addOutlines(isl);
      this.scene.add(isl);
      this.ground.add(walk);
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
      this.combat = new CombatSystem(this.scene, this.fx, this.overlay, assets, this.groundProxy, {
        heal: (n) => { if (this.foot) this.foot.hp = Math.min(this.foot.maxHp, this.foot.hp + n); },
        hitstop: (t, scale = 0.05) => { this.hitstop.t = Math.max(this.hitstop.t, t); this.hitstop.scale = Math.min(this.hitstop.scale, scale); },
        shake: (a) => { this.shake = Math.max(this.shake, a); },
        kill: (e) => this.onKill(e),
        gold: (n) => this.onGold(n),
        message: (t) => this.onMessage(t),
      });
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
      const roles: NpcRole[] = ['fischer', 'haendler', 'pirat', 'koch', 'schmied', 'wirt', 'buerger', 'pirat', 'buerger'];
      for (const role of roles) {
        const n = new Npc(assets, home, this.ground, role, rng, this.outlineNpcs);
        this.scene.add(n.char.holder);
        this.npcs.push(n);
      }
    }
  }

  /** Fähigkeiten der Spielfigur einrichten (nach dem Laden eines Spielstands) */
  setSkills(skills: SkillState, level: number) {
    if (!this.player || !this.foot || !this.combat || !this.fx || !this.overlay) return;
    this.faji = new FajiController(skills, this.foot, this.player, this.combat, this.fx, this.sparks, this.scene, this.groundProxy, this.overlay,
      (a) => { this.shake = Math.max(this.shake, a); },
      (t) => { this.hitstop.t = Math.max(this.hitstop.t, t); this.hitstop.scale = 0.05; });
    this.faji.refresh(level, this.style);
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

  private equip(style: StyleId) {
    if (!this.player) return;
    const w = weaponsFor(style);
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

  applyQuality(c: QualityConfig) {
    this.env.applyQuality(c);
    this.spray.scale = c.particles;
    this.sparks.scale = c.particles;
    this.dust.scale = c.particles;
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
      this.x = 0; this.z = -60; this.heading = 0;
    }
    if (s.env) this.env.setState(s.env);
    this.speed = 0;
    this.camYaw = 0;
    this.wake = [];
    const sh = this.ship;
    sh.x = this.x; sh.z = this.z; sh.heading = this.heading; sh.speed = 0; sh.sailLevel = 1;
    sh.prev = { x: sh.x, z: sh.z, heading: sh.heading };
    this.naval?.clear();
    if (this.mode === 'foot') {
      this.combat?.leaveIsland();
      if (this.foot) { this.foot.onFoot = false; this.foot.revive(); }
      this.downT = 0;
      this.setMode('sail');
    }
  }

  /** Eigenes Schiff: Klasse, Aussehen, Munition, Zustand (aus Spielstand oder Werft) */
  setShip(tier: number, look: ShipLook, ammo: AmmoId, hullFrac: number, faction: Faction) {
    const onBoard = this.player && this.player.holder.parent === this.ship.model.group;
    if (onBoard) this.scene.add(this.player!.holder);
    this.ship.rebuild(tier, look);
    (this.ship as any).faction = faction;
    this.ship.ammo = ammo;
    this.ship.hull = Math.max(1, this.ship.maxHull * Math.max(0.05, Math.min(1, hullFrac)));
    this.ship.x = this.x; this.ship.z = this.z; this.ship.heading = this.heading;
    this.ship.prev = { x: this.x, z: this.z, heading: this.heading };
    this.boat = this.ship.model.group;
    if (this.naval) this.naval.player = this.ship;
    if (this.mode === 'sail') this.attachToHelm();
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
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.updateWake(dt);
    this.naval?.update(dt, this.mode === 'sail' && this.cinematic <= 0);
    this.spray.update(dt);
    this.sparks.update(dt);
    this.dust.update(dt);
    this.updateNpcs(dt);
    this.combat?.update(dt, this.camera);
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
      this.teleport(0, -60, 0);
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
    if (input.pressed('up') && s.sailLevel < 2) { s.sailLevel++; this.onMessage(SAIL_LEVELS[s.sailLevel].n); }
    if (input.pressed('down') && s.sailLevel > 0) { s.sailLevel--; this.onMessage(SAIL_LEVELS[s.sailLevel].n); }
    // Stick/Touch: kräftig nach vorn = volle Fahrt, zurück = Anker
    if (input.lastDevice !== 'keyboard') {
      if (mv.y > 0.75 && s.sailLevel < 2 && this.sailCd <= 0) { s.sailLevel = 2; this.sailCd = 0.6; }
      else if (mv.y < -0.75 && s.sailLevel > 0 && this.sailCd <= 0) { s.sailLevel--; this.sailCd = 0.6; }
    }
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
      const a = Math.atan2(s.z - isl.z, s.x - isl.x);
      s.x = isl.x + Math.cos(a) * (isl.r + s.cls.W + 3);
      s.z = isl.z + Math.sin(a) * (isl.r + s.cls.W + 3);
      if (s.speed > 6) { this.shake = Math.max(this.shake, 0.5); this.onMessage('Auf Grund gelaufen!'); s.damage(s.speed * 1.5, 'kugel', null); }
      s.speed *= 0.4;
    }
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
      // Breitseiten: halten zum Zielen (Reichweite wächst), loslassen zum Feuern
      for (const [act, side] of [['fireLeft', 1], ['fireRight', -1]] as const) {
        const ready = side > 0 ? s.reloadL <= 0 : s.reloadR <= 0;
        if (input.down(act) && ready) {
          this.aimSide = side;
          this.aimT = Math.min(1.2, this.aimT + dt);
          nav.showAim(side, 45 + this.aimT * 55);
        } else if (this.aimSide === side) {
          if (ready) {
            nav.broadside(s, side, 45 + this.aimT * 55, nav.canDmg, s.ammo);
            const r = 2.4 * nav.reloadMult;
            if (side > 0) s.reloadL = r; else s.reloadR = r;
          }
          this.aimSide = 0; this.aimT = 0;
          nav.hideAim();
        }
      }
      // Faji auf See
      const slot = (['skill1', 'skill2', 'skill3'] as const).findIndex((a) => input.pressed(a));
      if (slot >= 0 && this.faji) {
        const def = this.faji.useSea(slot);
        if (def?.act?.sea) {
          const ok = nav.castSea(def.act.sea, this.faji.levelOf(def.id), this.combat?.atk ?? 14, ELEMENT_COLORS[def.act.el]);
          if (ok) { this.faji.commitSea(def); if (def.act.ult) this.overlay?.showCutin(`${def.n}!`, ELEMENT_COLORS[def.act.el]); }
          else this.onMessage('Kein Ziel in Reichweite.');
        } else if (def) this.onMessage(`${def.n} wirkt nur an Land.`);
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
      } else if (isl && Math.abs(this.speed) < 7) {
        this.contextLabel = 'An Land gehen';
        if (input.pressed('interact')) this.disembark(isl);
      }
    } else if (this.boarding) {
      this.contextLabel = 'Zurück an Bord';
      if (input.pressed('interact')) this.embark();
    } else {
      const d = Math.hypot(this.foot.x - this.anchor.x, this.foot.z - this.anchor.z);
      if (d < 6) {
        this.contextLabel = 'An Bord gehen';
        if (input.pressed('interact')) this.embark();
      }
    }
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
  }

  /** Gegnerlager der Insel (Startinsel ist friedlich, die fernste Insel gehört einer Legende) */
  private spawnCamp(isl: WalkIsland) {
    const c = this.combat;
    const idx = this.ground.islands.indexOf(isl);
    if (!c || idx <= 0) { this.onMessage(idx === 0 ? 'Willkommen auf der Startinsel! Probier deine Kombos an den Puppen.' : 'Land unter den Füßen!'); return; }
    const until = this.cleared.get(idx) ?? 0;
    if (until > this.env.clock) { this.onMessage('Diese Insel ist ruhig – fürs Erste.'); return; }
    let far = 1;
    this.ground.islands.forEach((i, k) => { if (Math.hypot(i.x, i.z) > Math.hypot(this.ground.islands[far].x, this.ground.islands[far].z)) far = k; });
    const enemyFaction: Faction = this.playerFaction === 'pirat' ? 'marine' : 'pirat';
    if (idx === far) {
      c.enterIsland(isl, ['legende', 'matrose', 'musketier'], 6, enemyFaction, this.playerFaction === 'pirat' ? 'Kapitän Jorin Weiß' : 'Bram Eisenzahn');
      this.onMessage('Eine Legende erwartet dich!');
      return;
    }
    const level = Math.max(1, Math.min(8, 1 + Math.floor(Math.hypot(isl.x, isl.z) / 320)));
    c.enterIsland(isl, CAMP_BY_LEVEL[Math.min(CAMP_BY_LEVEL.length - 1, level - 1)], level, enemyFaction);
    this.onMessage(`Feindliches Lager! (Stufe ${level})`);
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
    const start = this.deckGround.spot(0, -0.35);
    this.footDist = 5.5;
    this.footPitch = 0.42;
    this.foot.place(start.x, start.z, e.ship.heading, this.groundProxy);
    this.foot.onFoot = true;
    this.footYaw = e.ship.heading;
    this.overlay?.showCutin('Entern!', '#A8322A');
    this.overlay?.speedlines(1);
    this.setMode('foot');
  }

  private embark() {
    if (this.boarding) {
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
    this.setMode('sail');
    this.onMessage('Leinen los!');
  }

  private updateNpcs(dt: number) {
    const p = this.mode === 'foot' && this.foot ? new Vector3(this.foot.x, 0, this.foot.z) : null;
    const cam = this.camera.position;
    for (const n of this.npcs) n.update(dt, p, Math.hypot(cam.x - n.x, cam.z - n.z));
  }

  /** Im Menü: Schiff treibt, Zeit und Wetter laufen weiter */
  idle(dt: number) {
    this.env.update(dt, this.focus);
    this.menuOrbit += dt * 0.08;
    this.updateWake(dt);
    this.spray.update(dt);
    this.sparks.update(dt);
    this.dust.update(dt);
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
      this.wake.unshift({ x: this.x - f.x * 4.6, z: this.z - f.z * 4.6, age: 0, strength: Math.min(1, Math.abs(this.speed) / 10) });
    }
    this.env.ocean.setWake(this.wake);
  }

  private fwd(h = this.heading) { return new Vector3(Math.sin(h), 0, Math.cos(h)); }

  // ---------- Darstellung ----------

  render(alpha: number, frameDt: number, inMenu: boolean) {
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
    if (s.fire > 0 && Math.random() < frameDt * 40) {
      const k = (Math.random() - 0.5) * L * 0.6;
      this.sparks.emit(2, x + f.x * k, wy + s.model.deckY + 0.5, z + f.z * k, { speed: 0.6, up: 4, life: 0.8, color: new Color(3, 1.2, 0.3), gravity: -2, spread: s.cls.W * 0.3 });
    }
    for (const b of this.buoys) {
      b.g.position.set(b.x, env.heightAt(b.x, b.z) - 0.3, b.z);
      b.g.rotation.z = Math.sin(env.clock * 1.3 + b.x) * 0.15;
      b.lamp.visible = night > 0.3 || Math.sin(env.clock * 3 + b.z) > 0;
    }
    for (const l of this.lamps) l.scale.setScalar(0.6 + night * 0.7);

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
      const yaw = h + Math.PI + this.camYaw;
      const dist = (this.camDist + (s.boost > 0 ? 4 : 0)) * Math.max(1, L / 17);
      const cp = Math.cos(this.camPitch);
      this.tmp.set(x + Math.sin(yaw) * dist * cp, Math.max(wy + 2, 3 + Math.sin(this.camPitch) * dist), z + Math.cos(yaw) * dist * cp);
      cam.position.lerp(this.tmp, Math.min(1, frameDt * 8));
      const camWater = env.heightAt(cam.position.x, cam.position.z) + 1.2;
      if (cam.position.y < camWater) cam.position.y = camWater;
      cam.lookAt(x, 3.5 + wy * 0.3, z);
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
