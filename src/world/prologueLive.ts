// Phase 4.7A – Welt-Seite des Gewitter-Prologs: Bühne (Nacht-Gewitter auf hoher See, das brennende schwarze Flaggschiff „Schwarze Krone“),
// Kapitän Schwarzbart (1,65 ×) mit dunklen Schockwellen, Marine-Enterer gegen Piraten-Trupps an Deck, Kanoneneinschläge und brennende Trümmer
// mit Warnringen, die sieben Admirals-Flaggschiffe und ihr Vereintes Urteil mit Doppel-Impact-Frame, der Sturz über Bord und die Schwarzblende.
// Der Ablauf steht rein in story/prologueDirector.ts; hier wird er nur umgesetzt. Alles Sichtbare kommt aus den vorhandenen Pools
// (CataclysmFx/AnimeVfxForge, GlowSystem-Flammen, TroopRenderer, Wetter) – kein neues Shader-Programm. Je Bild entsteht nichts Neues.
import { Color, Object3D, Vector3, type PerspectiveCamera, type Scene, type Texture } from 'three';
import { ADMIRALS, JUDGMENT_NAME, PROLOGUE, PROLOGUE_LINES, PROLOGUE_WEATHER, SCHWARZBART, linenLook } from '../data/prologue';
import { PrologueOut, newPrologueState, prologueBars, prologueIntensity, prologuePlayable, skipPrologue, stepPrologue, type PrologueEvent, type PrologueGeo, type PrologueState } from '../story/prologueDirector';
import { Character } from '../entities/character/character';
import type { CharacterAssets } from '../entities/character/assets';
import type { CharacterLook } from '../data/characterParts';
import type { Ship } from '../entities/ship/ship';
import type { EnemyShip, NavalSystem } from '../naval/naval';
import type { CombatSystem } from '../combat/combat';
import type { CrewAboard } from './crewAboard';
import type { CataclysmFx } from '../combat/cataclysmFx';
import type { AnimeVfxForge } from '../graphics/animeVfxForge';
import type { DeckGround } from './islandGround';
import type { PlayerFoot } from '../entities/player/playerFoot';
import type { Weather } from './weather';
import { glowHub, makeEmitter } from '../render/glow';
import { audio } from '../audio/audio';

/** Anzeige des Prologs (Game: Titelkarte, Untertitel, Admirals-Banner, Schwarzblende) und sein Ende */
export interface PrologueUi {
  line(who: string, text: string, title?: boolean): void;
  banner(title: string, sub: string): void;
  blackout(k: number): void;
  /** Prolog vorbei bzw. übersprungen (die Seewelt hat die Bühne schon abgebaut) */
  finished(skipped: boolean): void;
}

/** Was der Prolog von der Seewelt braucht */
export interface PrologueHost {
  readonly scene: Scene;
  ship(): Ship;
  naval(): NavalSystem | null;
  combat(): CombatSystem | null;
  crew(): CrewAboard | null;
  fx(): CataclysmFx;
  vfx(): AnimeVfxForge;
  weather(): Weather;
  assets(): CharacterAssets | null;
  foot(): PlayerFoot | null;
  /** Deck des eigenen Schiffs (nach `stage`) */
  deck(): DeckGround | null;
  /** Bühne aufbauen: Schiff an (x, z) setzen und zum Flaggschiff machen, Nacht und Sturm, Figur an Deck */
  stage(x: number, z: number, heading: number, look: CharacterLook): void;
  /** freie See für die Bühne (weit von Inseln) */
  openSea(): { x: number; z: number };
  /** Figur frei steuern (Deck) oder Steuerung ruhen lassen (Kino) */
  setControl(on: boolean): void;
  /** Spielfigur an eine Stelle setzen (Boden) bzw. frei in die Luft (Sturz über Bord) */
  placeFoot(x: number, z: number, yaw: number): void;
  driveFoot(x: number, y: number, z: number, yaw: number): void;
  groundY(x: number, z: number, y: number): number;
  /** Boden-Verbund der Seewelt (Trupps, Gegner) */
  ground(): Parameters<CrewAboard['spawnSquads']>[5];
  waterY(x: number, z: number): number;
  impact(frames: number): void;
  shake(k: number): void;
  /** Programme eines neuen Objekts im Hintergrund vorübersetzen (solange es sichtbar ist) – kein Stocken, wenn es später erscheint */
  warm(o: Object3D): void;
  /** Untertitel / Ruf, Titelkarte, Admirals-Banner, Schwarzblende */
  line(who: string, text: string, title?: boolean): void;
  banner(title: string, sub: string): void;
  blackout(k: number): void;
  playerId(): string;
  /** der Prolog ist vorbei (oder übersprungen): Bühne abbauen, Einführung beginnen */
  finished(skipped: boolean): void;
}

const _v = new Vector3();
const _w = new Vector3();
const _a = { x: 0, y: 0, z: 0 };
const C_WARN = new Color('#FF3A24');
const C_FIRE = new Color('#FF7A2A');
const C_EMBER = new Color('#FFB040');
const C_SMOKE = new Color(0.12, 0.1, 0.1);
const C_DARK = new Color(SCHWARZBART.aura);
const C_INK = new Color(SCHWARZBART.auraInk);
const C_WHITE = new Color(1, 1, 1);
const C_GOLD = new Color('#FFE08A');
const ADM_COL = ADMIRALS.map((a) => new Color(a.color));

/** Wann eine Schockwelle das Marine-Schiff erreicht (s) */
const SHOCK_TRAVEL = 0.55;

export class PrologueLive {
  readonly state: PrologueState;
  private readonly out = new PrologueOut();
  private readonly geo: PrologueGeo = { lx: 0, lz: 0, startLz: 0, goalLz: 0, halfW: 4 };
  private schwarzbart: Character | null = null;
  private sbX = 0; private sbZ = 0; private sbYaw = 0;
  private sbFallT = -1;
  /** Marine-Schiffe, die Schwarzbart zerschmettert, und die sieben Admirals-Flaggschiffe */
  private readonly targets: EnemyShip[] = [];
  private readonly admirals: EnemyShip[] = [];
  private readonly shockAt: number[] = [];
  private readonly fireAnchors: Object3D[] = [];
  private readonly convergence = new Vector3();
  private chargeT = -1;
  private thrownT = -1;
  private readonly thrownFrom = new Vector3();
  private readonly thrownTo = new Vector3();
  private thrownYaw = 0;
  private splashed = false;
  private ended = false;
  private seed: number;
  /** freie Kamera der Kino-Phasen */
  private camT = 0;
  /** Texturen der Bühnen-Schiffe, die unter der Schwarzblende der Einleitung einzeln hochgeladen werden */
  private readonly preload: Texture[] = [];

  constructor(private readonly host: PrologueHost, seed = 0x51a7) {
    this.seed = seed >>> 0 || 1;
    this.state = newPrologueState(this.seed);
  }

  get active(): boolean { return !this.ended; }
  get playable(): boolean { return prologuePlayable(this.state); }
  get bars(): number { return prologueBars(this.state); }
  get phase() { return this.state.phase; }
  /** Die Figur fliegt gerade über Bord (die Seewelt lässt sie dann ganz in Ruhe) */
  get scriptedFoot(): boolean { return this.thrownT >= 0 && !this.ended; }

  private rnd(): number { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  // ---------------------------------------------------------------------------------------------------------------
  // Aufbau
  // ---------------------------------------------------------------------------------------------------------------

  begin(playerLook: CharacterLook) {
    const h = this.host;
    const sea = h.openSea();
    const heading = 0.6;
    h.stage(sea.x, sea.z, heading, linenLook(playerLook));
    const ship = h.ship();
    const w = h.weather();
    w.hold({ ...PROLOGUE_WEATHER }, true);
    ship.fire = 1e9;
    ship.unsinkable = true;
    ship.throttle = 0; ship.speed = 0;
    const dg = h.deck();
    const L = ship.cls.L, q = ship.model.quarter;
    this.geo.startLz = L * 0.3;
    this.geo.goalLz = q ? q.z1 - 2.5 : ship.model.helm.z + 2;
    this.geo.halfW = ship.cls.W * 0.42;
    // Schiffsjunge am Bug (vor dem Vorderkastell), Blick zum Heck
    if (dg) { const p = dg.world(0, this.geo.startLz); h.placeFoot(p.x, p.z, heading + Math.PI); }
    h.setControl(false);
    h.blackout(1);
    this.spawnSchwarzbart();
    this.spawnFires();
    this.spawnBattle();
    this.spawnTargets();
    // die sieben Admirals-Flaggschiffe entstehen gleich mit (unsichtbar bis zu ihrem Auftritt): kein Bau mitten im Finale
    this.spawnAdmirals();
    // ihre gemalten Segel und Rümpfe laden unter der Schwarzblende (je Bild eine Textur), nicht beim ersten Auftritt
    const nav = h.naval();
    if (nav) for (const e of [...this.targets, ...this.admirals]) nav.pendingTextures(e.ship, this.preload);
    audio.prologue(prologueIntensity(this.state));
  }

  private spawnSchwarzbart() {
    const h = this.host, assets = h.assets(), dg = h.deck(), ship = h.ship();
    if (!assets || !dg) return;
    const base = { ...linenLook({}), ...SCHWARZBART.look } as CharacterLook;
    const c = new Character(assets, base, true);
    c.holder.scale.setScalar(SCHWARZBART.scale);
    const lz = ship.model.helm.z + 2.2;
    const p = dg.world(0, lz);
    this.sbX = p.x; this.sbZ = p.z; this.sbYaw = ship.heading;
    c.place(p.x, h.groundY(p.x, p.z, ship.model.deckY + 6), p.z, this.sbYaw);
    c.playClip('Melee_2H_Idle', { loop: true, fade: 0.2 });
    h.scene.add(c.holder);
    this.schwarzbart = c;
  }

  /** Brennende Kanonendecks: echte 3D-Flammen (GlowSystem) an festen Punkten des Decks */
  private spawnFires() {
    const ship = this.host.ship();
    const L = ship.cls.L, hw = ship.cls.W * 0.38;
    const spots: [number, number][] = [[-hw, L * 0.22], [hw * 0.8, L * 0.12], [-hw * 0.6, -L * 0.02], [hw, -L * 0.1], [-hw, L * 0.05], [hw * 0.5, L * 0.28]];
    for (const [lx, lz] of spots) {
      const o = new Object3D();
      o.position.set(lx, ship.model.deckY + 0.2, lz);
      ship.model.group.add(o);
      this.fireAnchors.push(o);
      glowHub.add(makeEmitter('fire', 0, 0, 0, { obj: o, size: 1.6 + this.rnd() * 0.8, owner: this }));
    }
  }

  /** Krieg an Deck: Marine-Enterer (echte Gegner) gegen Piraten-Trupps (instanzierte Soldaten) */
  private spawnBattle() {
    const h = this.host, dg = h.deck(), c = h.combat(), crew = h.crew(), ship = h.ship();
    if (!dg) return;
    if (c) c.enterDeck(dg, ['matrose', 'schildtraeger', 'matrose', 'musketier', 'matrose'], 3, 'marine', undefined, 'marine');
    if (crew) {
      const p = dg.world(0, ship.cls.L * 0.05);
      crew.spawnSquads(h.scene, { schwert: 16, musketier: 8 }, 4, h.playerId(), { x: p.x, z: p.z, yaw: ship.heading + Math.PI }, h.ground(), null);
      if (c) c.allies = crew.targets();
    }
  }

  /** Drei Marine-Kriegsschiffe, die Schwarzbart nacheinander zerschmettert */
  private spawnTargets() {
    const nav = this.host.naval(), ship = this.host.ship();
    if (!nav) return;
    const spots: [number, number][] = [[-1, 0.15], [1, -0.2], [-1, -0.45]];
    for (let i = 0; i < spots.length; i++) {
      const [side, along] = spots[i];
      const h = ship.heading, d = 70 + i * 18;
      const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
      const e = nav.spawnStage(ship.x + rx * side * d + fx * along * ship.cls.L, ship.z + rz * side * d + fz * along * ship.cls.L, h + (side > 0 ? Math.PI : 0), 2, 'marine', 'Marine-Kriegsschiff', 3, 'jaeger');
      // Bühne: liegt beigedreht, die Breitseiten inszeniert der Prolog (Mündungsfeuer zu jedem Kanoneneinschlag an Deck)
      e.ship.frozen = 1e9; e.ship.ceasefire = 1e9;
      this.targets.push(e);
      this.shockAt.push(-1);
    }
  }

  /** Die sieben Admirals-Flaggschiffe im Halbkreis vor dem Bug (erscheinen in Akt 1) */
  private spawnAdmirals() {
    const nav = this.host.naval(), ship = this.host.ship();
    if (!nav || this.admirals.length) return;
    const h = ship.heading;
    for (const a of ADMIRALS) {
      const ang = h + a.angle;
      const e = nav.spawnStage(ship.x + Math.sin(ang) * a.dist, ship.z + Math.cos(ang) * a.dist, ang + Math.PI, 4, 'marine', a.name, 12, 'legende');
      e.ship.frozen = 1e9; e.ship.ceasefire = 1e9;
      // erst vorübersetzen (nur sichtbare Objekte zählen), dann bis zum Auftritt verbergen: sonst stockt das Bild beim ersten Admiral (2 × 250 – 360 ms)
      this.host.warm(e.ship.model.group);
      e.ship.model.group.visible = false;
      this.admirals.push(e);
    }
    this.convergence.set(ship.x, ship.model.deckY + 46, ship.z);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Schritt
  // ---------------------------------------------------------------------------------------------------------------

  /** Logikschritt (Spielzeit) */
  update(dt: number) {
    if (this.ended) return;
    const h = this.host, ship = h.ship(), f = h.foot();
    // das Flaggschiff liegt still im Sturm und geht nicht unter; die Figur verliert den Prolog nie
    ship.throttle = 0; ship.speed = 0; ship.hull = ship.maxHull;
    if (f && f.hp < f.maxHp * PROLOGUE.hpFloor) f.hp = f.maxHp * PROLOGUE.hpFloor;
    // Lage der Figur im Schiffsraum
    if (f) {
      const c = Math.cos(ship.heading), s = Math.sin(ship.heading), dx = f.x - ship.x, dz = f.z - ship.z;
      this.geo.lx = dx * c - dz * s;
      this.geo.lz = dx * s + dz * c;
      const dg = h.deck();
      this.geo.reached = !!dg && dg.onQuarter(f.x, f.z, f.y);
    }
    const n = stepPrologue(this.state, dt, this.geo, this.out);
    for (let i = 0; i < n; i++) this.onEvent(this.out.events[i]);
    if (this.ended) return;
    // aus dem Schwarz in den Sturm (während des Aufbaus der Bühne bleibt das Bild schwarz); solange Texturen ausstehen, bleibt es schwarz
    if (this.preload.length) { const t = this.preload.pop()!; h.naval()?.uploadTexture(t); }
    if (this.state.phase === 'intro') h.blackout(this.preload.length ? 1 : Math.max(0, 1 - this.state.phaseT / 1.4));
    h.setControl(this.playable);
    this.stepShocks(dt);
    this.stepCharge(dt);
    this.stepThrown(dt);
    this.stepFirestorm(dt);
    this.stepSchwarzbart(dt);
    audio.prologue(prologueIntensity(this.state));
  }

  private onEvent(e: PrologueEvent) {
    const h = this.host;
    switch (e.type) {
      case 'phase': this.onPhase(e.text); break;
      case 'line': { const l = PROLOGUE_LINES[e.text]; if (l) h.line(l.who, l.text, e.text === 'title'); break; }
      case 'hazard': this.warn(e); break;
      case 'detonate': this.detonate(e); break;
      case 'shock': this.shock(e.id); break;
      case 'strike': { const p = this.local(e.lx, e.lz, 0); h.weather().strikeAt(_w.set(p.x, 0, p.z), p.x, p.z); audio.play('thunder', 0.9, { x: p.x, z: p.z }); break; }
      case 'admiral': this.admiralArrives(e.id); break;
      case 'charge': this.chargeT = 0; break;
      case 'judgment': this.judgment(); break;
      case 'fall': this.sbFallT = 0; this.schwarzbart?.playClip('Death_A', { loop: false, fade: 0.1 }); break;
      case 'thrown': this.throw(); break;
      case 'heartbeat': audio.heartbeat(1 - e.id * 0.12); break;
      case 'done': this.finish(false); break;
      default: break;
    }
  }

  private onPhase(p: string) {
    const h = this.host;
    if (p === 'deck') h.setControl(true);
    if (p === 'assemble') {
      // die Zeit lief ab: die Figur steht jetzt beim Kapitän
      const dg = h.deck(), ship = h.ship();
      if (this.state.auto && dg) { const q = dg.world(1.6, this.geo.goalLz); h.placeFoot(q.x, q.z, ship.heading); }
      h.setControl(false);
      this.clearDeckBattle();
      this.spawnAdmirals();
      this.camT = 0;
    }
    if (p === 'blackout') h.blackout(1);
    if (p !== 'deck') this.camT = 0;
  }

  /** Warnring (rot, wächst bis zum Einschlag); Trümmer fallen brennend von oben */
  private warn(e: PrologueEvent) {
    const fx = this.host.fx(), b = fx.brush;
    const p = this.local(e.lx, e.lz, 0.08);
    b.reset().at(p.x, p.y, p.z).size(e.r * 0.3, 1, e.r * 0.3, e.r, 1, e.r).span(e.warn).col(C_WARN, 1.5).fade(0.05, 0.05).spin(2);
    fx.emit('ring');
    if (e.kind === 'cannon') this.muzzle(e.id);
    if (e.kind === 'debris') {
      // brennendes Rahenstück fällt aus der Takelage
      b.reset().at(p.x, p.y + 16, p.z).vel(0, -16 / Math.max(0.2, e.warn) + 4, 0).rot(this.rnd() * 6, this.rnd() * 6, 0).spin(3, 2).size(0.5, 0.5, 3.2).span(e.warn).col(C_SMOKE, 1).fade(0.01, 0.02);
      b.grav = 8;
      fx.emit('rock');
      this.host.vfx().burst('ember', p.x, p.y + 15, p.z, 6, 2, C_EMBER, { up: -2, size: 0.3, life: e.warn });
    }
  }

  /** Mündungsfeuer an einem der Marine-Schiffe (die Kugel ist unterwegs, solange der Warnring wächst) */
  private muzzle(seq: number) {
    let alive = 0;
    for (const t of this.targets) if (t.ship.alive && t.ship.sinking <= 0) alive++;
    if (!alive) return;
    let k = seq % alive;
    const ship = this.host.ship();
    for (const t of this.targets) {
      if (!t.ship.alive || t.ship.sinking > 0) continue;
      if (k-- > 0) continue;
      const s = t.ship, dx = ship.x - s.x, dz = ship.z - s.z, d = Math.hypot(dx, dz) || 1;
      const x = s.x + (dx / d) * s.cls.W * 0.55, z = s.z + (dz / d) * s.cls.W * 0.55, y = this.host.waterY(s.x, s.z) + s.model.deckY + 0.8;
      const vfx = this.host.vfx();
      vfx.burst('spark', x, y, z, 10, 9, C_FIRE, { up: 1, size: 0.4, life: 0.25 });
      vfx.burst('smoke', x, y, z, 5, 3, C_SMOKE, { up: 1, size: 2.6, life: 2.6 });
      audio.play('boom', 0.55, { x, z });
      return;
    }
  }

  private detonate(e: PrologueEvent) {
    const h = this.host, vfx = h.vfx(), fx = h.fx(), b = fx.brush;
    const p = this.local(e.lx, e.lz, 0.2);
    const big = e.kind === 'cannon';
    vfx.burst('ember', p.x, p.y, p.z, big ? 26 : 14, big ? 9 : 6, C_FIRE, { up: big ? 6 : 4, size: 0.35 });
    vfx.burst('splinter', p.x, p.y, p.z, big ? 12 : 8, 7, C_SMOKE, { up: 5, size: 0.35 });
    vfx.burst('smoke', p.x, p.y + 0.5, p.z, big ? 6 : 4, 2, C_SMOKE, { up: 1.5, size: big ? 2.2 : 1.5, life: 2.2 });
    b.reset().at(p.x, p.y, p.z).size(0.4, 1, 0.4, e.r * 1.4, 1, e.r * 1.4).span(0.35).col(C_FIRE, 2.2).fade(0.01, 0.5);
    fx.emit('shock');
    audio.play(big ? 'boom' : 'crack', big ? 1 : 0.7, { x: p.x, z: p.z });
    h.shake(big ? 0.45 : 0.25);
    // Treffer der Figur: Rückstoß weg vom Einschlag, nie tödlich
    const f = h.foot();
    if (!f) return;
    const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz);
    if (d > e.r) return;
    f.receiveHit(f.maxHp * e.dmg, d > 0.01 ? dx / d : 1, d > 0.01 ? dz / d : 0, e.knock, null);
  }

  /** Schwarzbart entfesselt eine dunkle Schockwelle gegen Marine-Schiff `i` */
  private shock(i: number) {
    const sb = this.schwarzbart, t = this.targets[i];
    if (sb) sb.playClip('Ranged_Magic_Shoot', { loop: false, fade: 0.08, onDone: () => sb.playClip('Melee_2H_Idle', { loop: true, fade: 0.25 }) });
    if (!t) return;
    this.shockAt[i] = 0;
    const vfx = this.host.vfx(), fx = this.host.fx(), b = fx.brush;
    const y = this.host.ship().model.deckY + 3;
    // dunkler Mantel, purpurner Kern, Druckringe um Schwarzbart
    vfx.pressureRing(this.sbX, y, this.sbZ, 0, false, 9, C_DARK, 0.5);
    vfx.corona(this.sbX, y, this.sbZ, this.sbYaw, 3.2, C_DARK, C_WHITE, 0.6);
    const yaw = Math.atan2(t.ship.x - this.sbX, t.ship.z - this.sbZ);
    b.reset().at(this.sbX, y - 1, this.sbZ).rot(yaw).size(3, 4, 3, 30, 12, 30).span(SHOCK_TRAVEL + 0.2).col(C_INK, 1).fade(0.02, 0.4);
    fx.emit('arcInk');
    b.reset().at(this.sbX, y - 0.6, this.sbZ).rot(yaw).size(2.5, 3, 2.5, 28, 9, 28).span(SHOCK_TRAVEL + 0.15).col(C_DARK, 1.35).fade(0.02, 0.45);
    fx.emit('arc');
    audio.play('boom', 1, { x: this.sbX, z: this.sbZ });
    this.host.shake(0.35);
  }

  private stepShocks(dt: number) {
    const nav = this.host.naval();
    for (let i = 0; i < this.targets.length; i++) {
      if (this.shockAt[i] < 0) continue;
      const t0 = this.shockAt[i];
      this.shockAt[i] += dt;
      if (t0 < SHOCK_TRAVEL && this.shockAt[i] >= SHOCK_TRAVEL) {
        const e = this.targets[i];
        if (nav && e.ship.alive) {
          const r = nav.cataclysmSplit(e, i === 1 ? 'length' : 'cross', 7 + i);
          if (r !== 'split') nav.cataclysmHit(e, e.ship.maxHull * 2, 6);
        }
        this.host.vfx().surfaceHit(e.ship.x, this.host.waterY(e.ship.x, e.ship.z), e.ship.z, 9, C_DARK, 1.4);
        this.host.shake(0.3);
        this.shockAt[i] = -1;
      }
    }
  }

  private admiralArrives(i: number) {
    const a = ADMIRALS[i], e = this.admirals[i];
    this.host.banner(a.name, `${a.title} · ${a.power}`);
    if (!e) return;
    e.ship.model.group.visible = true;
    const fx = this.host.fx(), b = fx.brush, vfx = this.host.vfx();
    const y = this.host.waterY(e.ship.x, e.ship.z) + e.ship.model.deckY;
    // Aura-Säule in der Farbe der Kraft auf dem Flaggschiff des Admirals
    b.reset().at(e.ship.x, y, e.ship.z).size(1.6, 6, 1.6, 4.6, 70, 4.6).span(PROLOGUE.assemble + PROLOGUE.charge).col(ADM_COL[i], 2.5).fade(0.15, 0.1);
    fx.emit('column');
    vfx.pressureRing(e.ship.x, y, e.ship.z, 0, false, 14, ADM_COL[i], 0.6);
    audio.play('boom', 0.6, { x: e.ship.x, z: e.ship.z });
  }

  /** Akt 2: sieben Strahlen steigen auf und bündeln sich über dem Flaggschiff */
  private stepCharge(dt: number) {
    if (this.chargeT < 0 || this.state.phase !== 'charge') { if (this.state.phase !== 'charge') this.chargeT = -1; return; }
    const t0 = this.chargeT;
    this.chargeT += dt;
    const vfx = this.host.vfx(), fx = this.host.fx(), b = fx.brush;
    const c = this.convergence;
    // alle 0,12 s ein Blitz-Strahl je Admiral zur Bündelung, der Kern wächst
    if (Math.floor(this.chargeT / 0.12) !== Math.floor(t0 / 0.12)) {
      for (let i = 0; i < this.admirals.length; i++) {
        const e = this.admirals[i];
        const y = this.host.waterY(e.ship.x, e.ship.z) + e.ship.model.deckY + 30;
        vfx.bolt(e.ship.x, y, e.ship.z, c.x, c.y, c.z, ADM_COL[i], 2.4, 0.16);
      }
      const k = Math.min(1, this.chargeT / PROLOGUE.charge);
      b.reset().at(c.x, c.y, c.z).size(2 + k * 8, 2 + k * 8, 2 + k * 8, 3 + k * 10, 3 + k * 10, 3 + k * 10).span(0.3).col(C_GOLD, 1.6 + k).fade(0.05, 0.6);
      fx.emit('orb');
      // Schwarzbart hält mit dunkler Aura dagegen
      if (this.schwarzbart) vfx.auraSwirl(this.sbX, this.host.ship().model.deckY + 2, this.sbZ, C_DARK, C_WHITE, 1.2, 0.2);
    }
    if (t0 < 1.7 && this.chargeT >= 1.7 && this.schwarzbart) this.schwarzbart.playClip('Ranged_Magic_Raise', { loop: false, fade: 0.1 });
  }

  /** Akt 3: der gebündelte Strahl schlägt ein – Doppel-Impact-Frame, Feuersturm */
  private judgment() {
    const h = this.host, ship = h.ship(), vfx = h.vfx(), fx = h.fx(), b = fx.brush;
    const c = this.convergence;
    const y = ship.model.deckY;
    b.reset().at(this.sbX, y, this.sbZ).size(5, 60, 5, 9, 60, 9).span(0.9).col(C_GOLD, 3).fade(0.01, 0.5);
    fx.emit('column');
    vfx.bolt(c.x, c.y, c.z, this.sbX, y + 2, this.sbZ, C_WHITE, 6, 0.6);
    vfx.pressureRing(this.sbX, y + 1, this.sbZ, 0, false, 40, C_GOLD, 0.9);
    vfx.burst('ember', this.sbX, y + 2, this.sbZ, 60, 18, C_FIRE, { up: 12, size: 0.5 });
    vfx.burst('smoke', this.sbX, y + 2, this.sbZ, 14, 6, C_SMOKE, { up: 4, size: 4, life: 4 });
    vfx.surfaceHit(this.sbX, y, this.sbZ, 12, C_GOLD, 1.6);
    h.impact(PROLOGUE.impactFrames);
    h.shake(1);
    audio.play('boom', 1); audio.play('thunderClap', 1);
    h.banner(JUDGMENT_NAME, 'Die sieben Admirale richten Kapitän Schwarzbart');
    // Feuersturm über das ganze Deck
    for (let i = 0; i < 8; i++) {
      const o = new Object3D();
      o.position.set((this.rnd() - 0.5) * ship.cls.W * 0.7, y + 0.3, ship.model.helm.z + (this.rnd() - 0.2) * ship.cls.L * 0.35);
      ship.model.group.add(o);
      this.fireAnchors.push(o);
      glowHub.add(makeEmitter('fire', 0, 0, 0, { obj: o, size: 3 + this.rnd() * 1.4, owner: this }));
    }
  }

  /** Feuersturm nach dem Einschlag: Glutfontänen und schwarzer Rauch über dem Achterdeck (alle 0,12 s ein Herd) */
  private stormT = 0;
  private stepFirestorm(dt: number) {
    const ph = this.state.phase;
    if (ph !== 'impact' && ph !== 'overboard') return;
    this.stormT -= dt;
    if (this.stormT > 0) return;
    this.stormT = 0.12;
    const ship = this.host.ship(), vfx = this.host.vfx();
    const p = this.local((this.rnd() - 0.5) * ship.cls.W * 0.75, ship.model.helm.z + (this.rnd() - 0.3) * ship.cls.L * 0.45, 0.3);
    vfx.burst('ember', p.x, p.y, p.z, 12, 7, C_FIRE, { up: 8, size: 0.5 });
    vfx.burst('smoke', p.x, p.y + 1.2, p.z, 3, 2.5, C_SMOKE, { up: 3.5, size: 3.8, life: 3.6 });
  }

  private stepSchwarzbart(dt: number) {
    const sb = this.schwarzbart;
    if (!sb) return;
    const ship = this.host.ship(), dg = this.host.deck();
    // er steht auf dem Achterdeck und schwankt mit dem Schiff
    if (dg) { const p = dg.world(0, ship.model.helm.z + 2.2); this.sbX = p.x; this.sbZ = p.z; }
    this.sbYaw = ship.heading;
    let y = this.host.groundY(this.sbX, this.sbZ, ship.model.deckY + 6);
    if (this.sbFallT >= 0) {
      // fällt im Feuersturm: sinkt in die Flammen und verschwindet
      this.sbFallT += dt;
      y -= Math.max(0, this.sbFallT - 1.2) * 1.4;
      if (this.sbFallT > 2.6) sb.holder.visible = false;
      if (Math.floor(this.sbFallT * 8) !== Math.floor((this.sbFallT - dt) * 8)) this.host.vfx().burst('ember', this.sbX, y + 1.5, this.sbZ, 8, 3, C_FIRE, { up: 4, size: 0.4 });
    }
    sb.place(this.sbX, y, this.sbZ, this.sbYaw);
    sb.update(dt);
    // dunkle Aura um den Kapitän (Deck und Finale)
    if (this.sbFallT < 0 && Math.floor(this.state.t * 6) !== Math.floor((this.state.t - dt) * 6)) this.host.vfx().auraSwirl(this.sbX, y + 1.6, this.sbZ, C_DARK, C_INK, 0.8, 0.18);
  }

  /** Die Druckwelle schleudert die Figur über die Reling in die See */
  private throw() {
    const h = this.host, f = h.foot(), ship = h.ship();
    if (!f) return;
    const side = this.geo.lx >= 0 ? 1 : -1;
    const rx = Math.cos(ship.heading), rz = -Math.sin(ship.heading);
    this.thrownFrom.set(f.x, f.y, f.z);
    const d = ship.cls.W * 0.5 + 9;
    this.thrownTo.set(f.x + rx * side * d, h.waterY(f.x + rx * side * d, f.z + rz * side * d) - 1.2, f.z + rz * side * d);
    this.thrownYaw = Math.atan2(rx * side, rz * side);
    this.thrownT = 0;
    this.splashed = false;
    h.shake(0.8);
  }

  private stepThrown(dt: number) {
    if (this.thrownT < 0) return;
    this.thrownT += dt;
    const k = Math.min(1, this.thrownT / 1.25);
    const a = this.thrownFrom, b = this.thrownTo;
    const y = a.y + (b.y - a.y) * k + Math.sin(k * Math.PI) * 6;
    this.host.driveFoot(a.x + (b.x - a.x) * k, y, a.z + (b.z - a.z) * k, this.thrownYaw);
    if (k >= 1 && !this.splashed) {
      this.splashed = true;
      const wy = this.host.waterY(b.x, b.z);
      this.host.vfx().surfaceHit(b.x, wy, b.z, 3, C_WHITE, 1);
      this.host.vfx().burst('drop', b.x, wy + 0.5, b.z, 26, 6, C_WHITE, { up: 7, size: 0.3 });
      audio.play('splash', 1, { x: b.x, z: b.z });
    }
    if (this.state.phase === 'overboard') this.host.blackout(Math.max(0, (this.state.phaseT - 1.4) / (PROLOGUE.overboard - 1.4)));
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Kamera der Kino-Phasen
  // ---------------------------------------------------------------------------------------------------------------

  /** Kamera setzen, solange der Prolog Regie führt (nicht auf dem Deck); liefert true, wenn sie übernommen wurde */
  camera(cam: PerspectiveCamera, frameDt: number): boolean {
    if (this.ended || this.playable) return false;
    this.camT += frameDt;
    const ship = this.host.ship(), st = this.state;
    const h = ship.heading, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    const sx = ship.x, sz = ship.z, dy = ship.model.deckY;
    const f = this.host.foot();
    const u = Math.min(1, st.phaseT / Math.max(0.1, st.phase === 'intro' ? PROLOGUE.intro : 4));
    switch (st.phase) {
      case 'intro': {
        // Kranfahrt aus dem Sturm heran: halb seitlich, hoch über dem brennenden Schiff, dann tiefer zum Bug
        const a = -0.9 + u * 1.3, r = 120 - 70 * u;
        cam.position.set(sx + (Math.sin(h + a + Math.PI) * r), dy + 34 - 22 * u, sz + (Math.cos(h + a + Math.PI) * r));
        _v.set(sx + fx * ship.cls.L * 0.15 * u, dy + 4, sz + fz * ship.cls.L * 0.15 * u);
        cam.fov = 52;
        break;
      }
      case 'assemble': {
        // hinter Schwarzbart auf dem Achterdeck, Blick über das Schiff zu den sieben Flaggen am Horizont
        cam.position.set(this.sbX - fx * 13 + rx * 3, dy + 10 + u * 2, this.sbZ - fz * 13 + rz * 3);
        _v.set(sx + fx * 210, dy + 14, sz + fz * 210);
        cam.fov = 58;
        break;
      }
      case 'charge': {
        // Untersicht vom Deck: die Strahlen bündeln sich über dem Flaggschiff
        const px = f ? f.x : sx, pz = f ? f.z : sz, py = f ? f.y : dy;
        cam.position.set(px - fx * 4 + rx * 1.5, py + 1.1, pz - fz * 4 + rz * 1.5);
        _v.copy(this.convergence);
        cam.fov = 66;
        break;
      }
      case 'impact': {
        // weite Einstellung von der Seite auf Einschlag und Feuersturm
        cam.position.set(sx + rx * 62 - fx * 20, dy + 18, sz + rz * 62 - fz * 20);
        _v.set(this.sbX, dy + 6, this.sbZ);
        cam.fov = 54;
        break;
      }
      case 'overboard':
      case 'blackout': {
        // außenbords knapp über dem Wasser: die Figur fliegt über die Reling auf die Kamera zu und schlägt in die See
        const px = f ? f.x : sx, pz = f ? f.z : sz, py = f ? f.y : dy;
        const side = this.geo.lx >= 0 ? 1 : -1, out = ship.cls.W * 0.5 + 20 - Math.abs(this.geo.lx);
        const cx = px + rx * side * out - fx * 6, cz = pz + rz * side * out - fz * 6;
        cam.position.set(cx, this.host.waterY(cx, cz) + 3.4, cz);
        _v.set(px, py + 0.6, pz);
        cam.fov = 56;
        break;
      }
      default: return false;
    }
    cam.lookAt(_v);
    cam.updateProjectionMatrix();
    return true;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Ende
  // ---------------------------------------------------------------------------------------------------------------

  /** Abbrechen ohne Meldung (Rückkehr ins Hauptmenü): Bühne abbauen, keine Einführung beginnen */
  abort() {
    if (this.ended) return;
    this.silent = true;
    this.finish(true);
  }
  private silent = false;

  /** Prolog überspringen (Schaltfläche) */
  skip() {
    if (this.ended) return;
    skipPrologue(this.state, this.out);
    this.finish(true);
  }

  private clearDeckBattle() {
    const c = this.host.combat(), crew = this.host.crew();
    c?.leaveIsland();
    crew?.clearSquads();
    if (c) c.allies = [];
  }

  private finish(skipped: boolean) {
    if (this.ended) return;
    this.ended = true;
    const h = this.host, nav = h.naval();
    this.clearDeckBattle();
    if (nav) for (const e of [...this.targets, ...this.admirals]) if (nav.enemies.includes(e)) nav.removeEventShip(e);
    this.targets.length = 0; this.admirals.length = 0;
    glowHub.removeOwner(this);
    for (const o of this.fireAnchors) o.removeFromParent();
    this.fireAnchors.length = 0;
    if (this.schwarzbart) { this.schwarzbart.holder.removeFromParent(); this.schwarzbart.dispose(); this.schwarzbart = null; }
    h.weather().hold(null);
    const ship = h.ship();
    ship.fire = 0;
    audio.prologue(null);
    h.blackout(0);
    if (!this.silent) h.finished(skipped);
  }

  /** Punkt im Schiffsraum (lx quer, lz längs) auf dem Deck in die Welt */
  private local(lx: number, lz: number, lift: number): { x: number; y: number; z: number } {
    const dg = this.host.deck(), ship = this.host.ship();
    if (dg) dg.anchorInto(lx, lz, lift, _a);
    else { _a.x = ship.x; _a.y = ship.model.deckY; _a.z = ship.z; }
    const gy = this.host.groundY(_a.x, _a.z, _a.y + 1);
    if (Number.isFinite(gy)) _a.y = gy + lift;
    return _a;
  }
}
