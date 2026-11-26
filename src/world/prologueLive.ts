// Phase 4.7D – Welt-Seite der 7-Szenen-Kino-Inszenierung (der Ablauf steht rein in story/prologueDirector.ts, die Daten in data/prologue.ts).
//
// 1. Pre-Warm (`prepare`, hinter dem Ladescreen): Grünmarkt bauen, „Die Schwarze Krone“ aufstellen, Schwarzbart (1,65 ×) und seine Crew,
//    die sieben Admirals-Flaggschiffe und die Marine-Fregatten, Meeresgrund – Texturen einzeln hochladen, alle Programme parallel übersetzen
//    (compileAsync), dann jede Schlüssel-Einstellung zwei Bilder lang zeichnen (Schatten- und Tiefenprogramme), die Musik im
//    OfflineAudioContext rendern. Erst danach beginnt Szene 1 – kein Bildeinbruch beim Szenenwechsel oder am Strand.
// 2. Regie in Echtzeit (`frame`): Taktschläge → Untertitel, Musik, Umgebungsklang, Kamera-Einstellung, Licht, Effekte, Balken, Zeitlupe.
// 3. Logik in Spielzeit (`update`): die Schwarze Krone jagt (die Figur läuft an Deck mit), Crew, Grünmarkt, Fall ins Wasser, Sinken.
// 4. Kamera (`camera`): Catmull-Rom-Pfade (CatmullRomCurve3) je Einstellung, Dolly-Zoom, Strahl-Ritt, Ego-Sicht.
// Effekte nur aus CataclysmFx/AnimeVfxForge, GlowSystem und TroopRenderer – kein neues Shader-Programm. Je Bild entsteht nichts Neues.
import { CatmullRomCurve3, Color, Group, Object3D, Vector3, type PerspectiveCamera, type Scene, type Texture } from 'three';
import {
  ADMIRALS, BEAM_RIDE, DECK_CREW, admiralLook, DECK_OBJECTIVE, EYELIDS, EYE_BLUR, FLAGSHIP, FLEET, GRADES, GRUENMARKT, JUDGMENT_NAME, PROLOGUE_LINES,
  PROLOGUE_WEATHER, RAID_TROOPS, SCHWARZBART, SCHWARZBART_FACE, SCORE_SYNC, SHOTS, linenLook,
  type AmbienceId, type GradeDef, type GradeId, type PrologueLine, type ScoreCue, type ShotDef, type ShotFrame, type V3,
} from '../data/prologue';
import { PrologueDirector, PrologueOut, type PrologueEvent, type PrologueGeo } from '../story/prologueDirector';
import { Character } from '../entities/character/character';
import type { CharacterAssets } from '../entities/character/assets';
import type { CharacterLook } from '../data/characterParts';
import type { Ship } from '../entities/ship/ship';
import type { EnemyShip, NavalSystem } from '../naval/naval';
import type { CataclysmFx } from '../combat/cataclysmFx';
import type { AnimeVfxForge } from '../graphics/animeVfxForge';
import type { DeckGround } from './islandGround';
import type { PlayerFoot } from '../entities/player/playerFoot';
import type { Environment } from './environment';
import { TroopRenderer, type TroopView } from '../entities/troops/troopRender';
import { GruenmarktStage, buildSeabed, frameToWorld, gmCoastZ, type StageFrame } from './prologueStage';
import { bowDeck, crownBearing, fleetFacing, type FleetPose } from './prologueGeo';
import { CineDamp, CINE_DAMP, SHOT_ARC_DIVISIONS, punchOffset, shotEase, smoothMax, smoother } from '../graphics/cineSmooth';
import { PrologueScorePlayer, renderScore } from '../audio/prologueScore';
import { audio } from '../audio/audio';
import { glowHub } from '../render/glow';
import { disposeObject } from '../render/dispose';
import { buildShip } from '../entities/ship/shipBuilder';
import { splitShipModel } from '../entities/ship/shipSplit';

/** Anzeige des Prologs (Game) */
export interface PrologueUi {
  loading(k: number): void;
  line(l: PrologueLine): void;
  banner(title: string, sub: string): void;
  goal(text: string): void;
  blackout(k: number): void;
  letterbox(k: number): void;
  eyelids(k: number): void;
  blur(px: number): void;
  skip(on: boolean): void;
  /** Szene 7 beginnt: die Einführung „Ankerglück“ aufbauen (private Instanz, Strand, Schiff verstaut) – die Figur liegt im Sand */
  beach(): void;
  /** Prolog vorbei bzw. übersprungen (die Seewelt hat die Bühne schon abgebaut) */
  finished(skipped: boolean): void;
}

/** Was der Prolog von der Seewelt braucht */
export interface PrologueHost {
  readonly scene: Scene;
  ship(): Ship;
  naval(): NavalSystem | null;
  fx(): CataclysmFx;
  vfx(): AnimeVfxForge;
  env(): Environment;
  assets(): CharacterAssets | null;
  foot(): PlayerFoot | null;
  player(): Character | null;
  deck(): DeckGround | null;
  /** Flaggschiff aufstellen: eigenes Schiff an (x, z) als „Die Schwarze Krone“, Figur an Deck (Leinen) */
  stageShip(x: number, z: number, heading: number, look: CharacterLook): void;
  /** freie See (weit von Inseln); `away` = so weit weg von diesem Punkt */
  /** freie See; `dir` = bevorzugte Richtung vom Punkt `away` aus (rad, wie `atan2(dx, dz)`) */
  openSea(away: { x: number; z: number } | null, minD: number, dir?: number): { x: number; z: number };
  setControl(on: boolean): void;
  placeFoot(x: number, z: number, yaw: number): void;
  /** Figur an eine Stelle setzen, ohne ihre Animation anzurühren (Sturz, Sinken, Liegen) */
  poseFoot(x: number, y: number, z: number, yaw: number): void;
  /** Figur mit dem fahrenden Deck mitnehmen (Welt-Versatz); `fresh` = sie hat sich in diesem Schritt nicht selbst bewegt */
  shiftFoot(dx: number, dz: number, fresh: boolean): void;
  groundY(x: number, z: number, y: number): number;
  waterY(x: number, z: number): number;
  impact(frames: number): void;
  shake(k: number): void;
  /** Programme eines Objekts parallel übersetzen (mit Lichtern und Zielpuffer der Szene) */
  warmAsync(o: Object3D): Promise<void>;
  uploadTexture(t: Texture): boolean;
  setTrench(ax: number, az: number, bx: number, bz: number, hw: number, depth: number): void;
  /** Träger echter Punktlichter (Laternen und Brände von Grünmarkt) an- bzw. abmelden */
  lightCarriers(list: Object3D[], on: boolean): void;
  playerId(): string;
  /** Schiff des Spielstands (Schaluppe am Strand) vorab bauen, übersetzen und hochladen */
  prebuildHome(): Promise<void>;
  /** der Prolog ist vorbei (oder übersprungen), die Bühne ist abgebaut */
  finished(skipped: boolean): void;
}

const TAU = Math.PI * 2;
const _v = new Vector3();
const _w = new Vector3();
const _p = { x: 0, y: 0, z: 0 };
const _hd = new Vector3();
const _bow = { x: 0, y: 0, z: 0 };
const _q = { x: 0, y: 0, z: 0 };
const C_WHITE = new Color(1, 1, 1);
const C_DARK = new Color(SCHWARZBART.aura);
const C_INK = new Color(SCHWARZBART.auraInk);
const C_GOLD = new Color('#FFE08A');
const C_FIRE = new Color('#FF7A2A');
const C_EMBER = new Color('#FFB040');
const C_SMOKE = new Color(0.12, 0.1, 0.1);
const C_FOAM = new Color(0.9, 0.97, 1);
const C_BUBBLE = new Color(0.75, 0.95, 1);
const C_RAY = new Color(0.55, 0.85, 1);
const C_RAY_WARM = new Color(1, 0.9, 0.62);
const C_FRONT = new Color(0.035, 0.04, 0.06);
const ADM_COL = ADMIRALS.map((a) => new Color(a.color));
const smooth = (k: number) => { const x = k < 0 ? 0 : k > 1 ? 1 : k; return x * x * (3 - 2 * x); };
/** 4.7D.1: Verläufe ohne Knick (Quintik, Sinus-Bögen) aus graphics/cineSmooth.ts */
const ease = (k: number, e: ShotDef['ease']) => shotEase(k, e);
/** Plätze der Admirale in der Schlachtreihe (−3 … 3) */
const ADM_SLOTS = ADMIRALS.map((a) => a.slot);
const keyed = (keys: readonly (readonly [number, number])[], t: number): number => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i]; return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0)); }
  return keys[keys.length - 1][1];
};

/** Vorbereitete Fahrt: Pfad und Blickpunkte als Catmull-Rom-Kurven im Rahmen (lokal), Abstand zum Dolly-Motiv am Anfang */
interface Shot { def: ShotDef; path: CatmullRomCurve3; look: CatmullRomCurve3; d0: number }

/** Lichtstimmung zwischen zwei Gradings */
interface GradeBlend { from: GradeDef; to: GradeDef; t: number; d: number }

/** Ambience-Vorgaben je Abschnitt */
const AMB: Readonly<Record<AmbienceId, { waves: number; wind: number; rain: number; town: number; gulls: number; deep: number; sailwind: number; bow: number; creak: number }>> = {
  hafen: { waves: 0.75, wind: 0.18, rain: 0, town: 0.85, gulls: 0.7, deep: 0, sailwind: 0, bow: 0, creak: 0.1 },
  stille: { waves: 0, wind: 0, rain: 0, town: 0, gulls: 0, deep: 0, sailwind: 0, bow: 0, creak: 0 },
  sturm: { waves: 0.6, wind: 0.85, rain: 0.2, town: 0, gulls: 0, deep: 0.3, sailwind: 0, bow: 0, creak: 0 },
  krieg: { waves: 0.6, wind: 0.8, rain: 0.3, town: 0, gulls: 0, deep: 0.4, sailwind: 0, bow: 0, creak: 0 },
  see: { waves: 1, wind: 1, rain: 1, town: 0, gulls: 0, deep: 0.5, sailwind: 0.9, bow: 0.9, creak: 0.8 },
  tiefe: { waves: 0, wind: 0, rain: 0, town: 0, gulls: 0, deep: 1, sailwind: 0, bow: 0, creak: 0 },
  strand: { waves: 0.85, wind: 0.12, rain: 0, town: 0, gulls: 0, deep: 0, sailwind: 0, bow: 0, creak: 0 },
};

/** 4.7E: Abbruch-Marke der Vorbereitung (Prolog beendet, während noch vorgewärmt wurde) */
const PREP_ABORTED = Symbol('prolog-abgebrochen');

export class PrologueLive {
  readonly director = new PrologueDirector();
  private readonly out = new PrologueOut();
  private readonly geo: PrologueGeo = { reached: false };
  /** Vorbereitung hinter dem Ladescreen läuft (0 … 1) */
  preparing = true;
  prepK = 0;
  private ended = false;
  private silent = false;
  private paused = false;
  /** Rahmen: Grünmarkt (Stadt) und hohe See (Sturmjagd) */
  readonly town: StageFrame = { x: 0, z: 0, h: 0 };
  readonly sea: StageFrame = { x: 0, z: 0, h: 0 };
  private stage: GruenmarktStage | null = null;
  private schwarzbart: Character | null = null;
  private readonly sb = { x: 0, y: 0, z: 0, yaw: 0, under: false, sink: 0 };
  private readonly admirals: EnemyShip[] = [];
  private readonly frigates: EnemyShip[] = [];
  private crew: TroopRenderer | null = null;
  private readonly crewViews: (TroopView & { tx: number; tz: number; run: boolean; gunner: boolean })[] = [];
  private raidMarine: TroopRenderer | null = null;
  private raidWehr: TroopRenderer | null = null;
  private readonly raidViews: { m: TroopView[]; w: TroopView[] } = { m: [], w: [] };
  private seabed: Group | null = null;
  private score: PrologueScorePlayer | null = null;
  private readonly shots = new Map<string, Shot>();
  private shotId = '';
  private shotV = 0;
  private shotT = 0;
  private readonly camPos = new Vector3();
  private readonly camLook = new Vector3();
  /** Brennpunkt für Licht und Schatten (die Seewelt nimmt ihn, solange die Regie die Kamera führt) */
  readonly focus = new Vector3();
  private fov = 50;
  private fovPunch = 0;
  private gradeB: GradeBlend = { from: GRADES.aus, to: GRADES.aus, t: 0, d: 0 };
  private readonly preload: Texture[] = [];
  /** Silhouetten im Nebel: leuchtet Admiral i schon? Zeit bis zum nächsten Lichthof */
  private readonly glowOn = ADMIRALS.map(() => false);
  private glowT = 0;
  private auraK = 1;
  /** Strahl (Szene 5): Startpunkt, Richtung, Zeit seit dem Schuss */
  private readonly beam = { t: -1, x: 0, y: 0, z: 0, dx: 0, dz: 1, len: 0, split: false, trenchT: -1, ax: 0, az: 0, bx: 0, bz: 0 };
  private readonly convergence = new Vector3();
  private chargeT = -1;
  /** Fall der Figur (Szene 5) und Sinken (Szene 6) */
  private readonly fall = { t: -1, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, yaw: 0, splashed: false, sinkY: 0 };
  /** Ego-Sicht (Szene 7): Kopf, Blick */
  private readonly pov = { x: 0, y: 0, z: 0, yaw: 0, t: 0 };
  private readonly deckGoal = { lx: 0, lz: 0, x: 0, z: 0, set: false };
  /** Deck der Schwarzen Krone (bleibt gültig, auch wenn die Figur gerade nicht darauf steht) */
  private ownDg: DeckGround | null = null;
  private goalRingT = 0;
  private deckStart = { lx: 0, lz: 0 };
  private readonly carriers: Object3D[] = [];
  private fxT = 0;
  private bubbleT = 0;
  private rayT = 0;
  private sprayT = 0;
  private moving = false;
  private lastShip = { x: 0, z: 0 };
  /** Untertitel-Verlauf (Prüfungen) */
  readonly shown: string[] = [];
  private seed = 0x51a7;

  constructor(private readonly host: PrologueHost, private readonly ui: PrologueUi, seed = 0x51a7) { this.seed = seed >>> 0 || 1; }

  get active(): boolean { return !this.ended; }
  /** Steuerung frei (Szene 4 nach dem „An die Kanonen!“) */
  get playable(): boolean { return !this.preparing && this.director.playable; }
  get phase(): string { return this.preparing ? 'laden' : this.director.scene; }
  get sceneNr(): number { return this.preparing ? 0 : this.director.sceneNr; }
  get state() { return this.director.state; }
  get bars(): number { return this.preparing ? 1 : this.director.bars; }
  get timeScale(): number { return this.preparing ? 1 : this.director.timeScale; }
  /** Die Figur wird gerade von der Regie geführt (Fall, Sinken, Ego-Sicht) */
  get scriptedFoot(): boolean {
    if (this.ended || this.preparing) return false;
    const sc = this.director.scene, st = this.director.state;
    // nach „gefechtsbereit“ (hockt hinter der Kanone), im Sturz, unter Wasser und am Strand führt die Regie die Figur
    return this.fall.t >= 0 || sc === 'urteil' || sc === 'schwur' || sc === 'erwachen' || (sc === 'gegenangriff' && st.readyAt >= 0);
  }
  /** Ziel der Deck-Szene (Welt) für Kompass und Auftragspfeil; null außerhalb */
  get goal(): { x: number; z: number } | null { return this.playable && this.deckGoal.set ? { x: this.deckGoal.x, z: this.deckGoal.z } : null; }
  /** Zahlen für Prüfungen */
  get stats() {
    return {
      scene: this.director.scene, sceneT: this.director.state.sceneT, shot: this.shotId, grade: this.gradeB.to === GRADES.aus ? 'aus' : (Object.keys(GRADES) as GradeId[]).find((k) => GRADES[k] === this.gradeB.to) ?? '',
      houses: this.stage?.houseTotal ?? 0, burning: this.stage?.burning ?? 0, razed: this.stage?.razed ?? false, folk: this.stage?.folkCount ?? 0,
      admirals: this.admirals.length, frigates: this.frigates.length, crew: this.crewViews.reduce((s, v) => s + v.heads, 0),
      split: !!this.host.ship().split, trench: this.beam.trenchT >= 0, seabed: !!this.seabed?.visible, underwater: this.sb.under,
      shipFire: this.host.ship().fire, score: this.score?.ready ?? false, fov: this.fov,
    };
  }

  private rnd(): number { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  // ---------------------------------------------------------------------------------------------------------------
  // 1. Pre-Warm hinter dem Ladescreen
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Alles vorbereiten (asynchron, über viele Bilder): Bühnen, Figuren, Schiffe, Texturen, Programme, Schlüssel-Bilder, Musik. Der Ladescreen
   * zeigt den Fortschritt; erst danach beginnt Szene 1 aus dem Schwarz.
   */
  async prepare(playerLook: CharacterLook): Promise<void> {
    // 4.7E: wird der Prolog während des Vorwärmens abgebrochen (Menü, Überspringen, Laden eines Stands), endet die Vorbereitung still –
    // vorher lief sie auf der schon abgebauten Bühne weiter (TypeError „warmAll“ von null)
    try { await this.prepareSteps(playerLook); } catch (e) { if (e !== PREP_ABORTED) throw e; }
  }

  private async prepareSteps(playerLook: CharacterLook): Promise<void> {
    const h = this.host, ui = this.ui;
    const slice = { t: performance.now() };
    const yieldFrame = () => new Promise<void>((r, j) => requestAnimationFrame(() => (this.ended ? j(PREP_ABORTED) : r())));
    const maybeYield = async () => { if (performance.now() - slice.t > 10) { await yieldFrame(); slice.t = performance.now(); } };
    // nach einem Abbruch keine Ladeanzeige mehr (späte Rückmeldungen des parallelen Vorübersetzens würden sie sonst wieder einblenden)
    const prog = (k: number) => { if (this.ended) return; this.prepK = Math.max(this.prepK, k); ui.loading(this.prepK); };
    ui.loading(0);
    ui.blackout(1);
    audio.scoreActive(true);
    audio.prologueAmbience(AMB.stille, true);
    // Musik im Hintergrund rendern (eigene Fäden des OfflineAudioContext), parallel zum Aufbau
    let audioK = 0;
    const scoreP = renderScore((k) => { audioK = k; });
    // ---- Rahmen: Grünmarkt blickt zur untergehenden Sonne (die Sturmfront verschluckt sie), die Sturmjagd liegt weit davon ----
    const env = h.env();
    const a = h.openSea(null, 0);
    const sun = env.palette.sunDir;
    this.town.x = a.x; this.town.z = a.z;
    this.town.h = Math.atan2(sun.x, sun.z) || 0.6;
    // 4.7D.1: die Krone liegt hinter der Stadt – in der Gewitterfront zeigen die Bugs der Admirale damit auf Grünmarkt UND auf sie
    const b = h.openSea(a, 2600, crownBearing(this.town));
    this.sea.x = b.x; this.sea.z = b.z; this.sea.h = Math.atan2(a.x - b.x, a.z - b.z) + Math.PI;
    // ---- Flaggschiff, Figur an Deck ----
    h.stageShip(this.sea.x, this.sea.z, this.sea.h, linenLook(playerLook));
    h.setControl(false);
    this.ownDg = h.deck();
    const ship = h.ship();
    ship.fire = 0;
    ship.unsinkable = true;
    ship.throttle = 0; ship.speed = 0;
    prog(0.04);
    await yieldFrame();
    // ---- Grünmarkt ----
    this.stage = new GruenmarktStage(h.scene, this.town, h.assets());
    {
      const it = this.stage.build();
      let n = 0;
      for (let r = it.next(); !r.done; r = it.next()) { n++; prog(0.04 + Math.min(0.26, n * 0.008)); await maybeYield(); }
    }
    prog(0.3);
    // echte Lichter der Hafenlaternen (Abendstunde) – der LampPool wählt die nächsten
    for (const [, x, z] of GRUENMARKT.props.filter((p) => p[0] === 'laterne')) {
      const c = new Object3D();
      frameToWorld(this.town, x, 3.4, z, _p);
      c.position.set(_p.x, _p.y, _p.z);
      c.userData.fire = false; c.userData.fixed = true; c.userData.lightK = 1.15; c.userData.seed = this.rnd();
      h.scene.add(c);
      c.updateMatrixWorld(true);
      this.carriers.push(c);
    }
    h.lightCarriers(this.carriers, true);
    await yieldFrame();
    // ---- Schwarzbart und seine Crew ----
    this.spawnSchwarzbart();
    this.spawnCrew();
    prog(0.36);
    await yieldFrame();
    // ---- die sieben Admirals-Flaggschiffe und die Marine-Fregatten (Texturen einzeln hochladen) ----
    this.spawnFleets();
    prog(0.42);
    {
      const nav = h.naval();
      if (nav) for (const e of [...this.admirals, ...this.frigates]) nav.pendingTextures(e.ship, this.preload);
      const total = Math.max(1, this.preload.length);
      while (this.preload.length) {
        h.uploadTexture(this.preload.pop()!);
        prog(0.42 + 0.14 * (1 - this.preload.length / total));
        await yieldFrame();
        slice.t = performance.now();
      }
    }
    prog(0.56);
    // ---- Meeresgrund (unter dem Graben der Schiffsteilung) ----
    this.seabed = buildSeabed(620, BEAM_RIDE.half + 4, BEAM_RIDE.depth + 2);
    this.seabed.visible = true;
    h.scene.add(this.seabed);
    // ---- Fahrten vorbereiten (Catmull-Rom-Kurven, einmal angelegt) ----
    for (const [id, def] of Object.entries(SHOTS)) this.shots.set(id, this.makeShot(def));
    // ---- Probe-Teilung: eine Kopie der Schwarzen Krone der Länge nach geteilt (die Hälften brauchen eigene Programm-Varianten) ----
    const splitCopy = buildShip(ship.cls, ship.look, true, ship.evo);
    splitShipModel(splitCopy.group, 'length', ship.cls.L, ship.cls.W, splitCopy.deckY, 7);
    {
      const rx = Math.cos(ship.heading), rz = -Math.sin(ship.heading);
      splitCopy.group.position.set(ship.x + rx * 70, 0, ship.z + rz * 70);
      splitCopy.group.rotation.y = ship.heading;
    }
    h.scene.add(splitCopy.group);
    await yieldFrame();
    // ---- alle Programme parallel übersetzen (auch was erst später erscheint: Ruinen, Raid-Truppen, Hälften) ----
    this.stage.warmAll(true);
    if (this.raidMarine) this.raidMarine.visible = true;
    if (this.raidWehr) this.raidWehr.visible = true;
    const groups: Object3D[] = [this.stage.group, this.seabed, ship.model.group, splitCopy.group];
    if (this.schwarzbart) groups.push(this.schwarzbart.holder);
    if (this.crew) groups.push(this.crew.root);
    if (this.raidMarine) groups.push(this.raidMarine.root);
    for (const e of [...this.admirals, ...this.frigates]) groups.push(e.ship.model.group);
    let done = 0;
    await Promise.all(groups.map((g) => h.warmAsync(g).then(() => { prog(0.56 + 0.16 * (++done / groups.length)); })));
    if (this.ended) throw PREP_ABORTED;
    prog(0.72);
    // ---- Schlüssel-Einstellungen je zwei Bilder zeichnen: Schatten-, Tiefen- und Nachbearbeitungs-Programme, Kaskaden, letzte Uploads ----
    this.warmEffects();
    // der Blitz des Wetters (Band ohne Normalen, nie im Bildausschnitt verworfen) wird sonst erst beim ersten Einschlag in Szene 2 übersetzt
    {
      const env = h.env();
      frameToWorld(this.town, 0, 0, FLEET.silhouetteZ, _p);
      env.weather.strikeAt(_v.set(this.town.x, 0, this.town.z), _p.x, _p.z);
      env.weather.flash = 0;
    }
    // je Einstellung mit der Aufstellung der Flotte, die dort zu sehen ist: Silhouetten draußen (1 – 2), Angriffslinie vor dem Hafen samt Fregatten
    // (3), Schlachtreihe vor der Schwarzen Krone (4 – 6) – sonst zeichnet die Grafikkarte die nahen Schiffe und ihre Schatten-Kaskaden beim
    // Szenenwechsel zum ersten Mal (Puffer-Bindungen, Uniforms): gemessen 0,6 s mit 30 – 38 ms je Bild am Beginn von Szene 3
    type Layout = 'draussen' | 'angriff' | 'voraus';
    const views: [string, GradeId, number, Layout][] = [
      ['s1_bucht', 'gold', 0, 'draussen'], ['s1_bucht', 'gold', 0.6, 'draussen'], ['s1_kai', 'gold', 0.5, 'draussen'], ['s2_vertigo', 'sturm', 0.5, 'draussen'],
      ['s3_salve', 'brand', 0.1, 'angriff'], ['s3_salve', 'brand', 0.8, 'angriff'], ['s3_pier', 'brand', 0.5, 'angriff'], ['s3_strasse', 'brand', 0.5, 'angriff'], ['s3_luft', 'brand', 0.5, 'angriff'],
      ['s4_held', 'nachtsturm', 0.1, 'voraus'], ['s4_held', 'nachtsturm', 0.8, 'voraus'], ['s4_schrei', 'nachtsturm', 0.5, 'voraus'], ['s4_jagd', 'nachtsturm', 0.2, 'voraus'], ['s4_jagd', 'nachtsturm', 0.8, 'voraus'], ['s5_aufladung', 'spektrum', 0.5, 'voraus'],
      ['s5_oben', 'spektrum', 0.5, 'voraus'], ['s6_schwarzbart', 'tiefe', 0.5, 'voraus'], ['s1_bucht', 'gold', 0, 'draussen'],
    ];
    let layout: Layout | '' = '';
    for (let i = 0; i < views.length; i++) {
      if (views[i][3] !== layout) {
        layout = views[i][3];
        if (layout === 'angriff') this.placeAttackLine();
        else if (layout === 'voraus') { for (const e of this.frigates) e.ship.model.group.visible = false; this.placeAhead(); }
        else { this.placeSilhouettes(); for (const e of this.frigates) e.ship.model.group.visible = true; }
        this.showAdmirals(true);
      }
      this.setShot(views[i][0], 0);
      this.shotT = (this.shots.get(views[i][0])?.def.dur ?? 0) * views[i][2];
      this.setGrade(views[i][1], 0);
      if (views[i][0] === 's6_schwarzbart') this.placeUnderwater();
      // je Einstellung drei Bilder: Schatten-Kaskaden, Punktlicht-Schatten der Laternen und Brände, Nachbearbeitung
      await yieldFrame(); await yieldFrame(); await yieldFrame();
      prog(0.72 + 0.12 * ((i + 1) / views.length));
    }
    this.sb.under = false;
    this.seabed.visible = false;
    splitCopy.group.removeFromParent();
    disposeObject(splitCopy.group);
    this.stage.warmAll(false);
    if (this.raidMarine) this.raidMarine.visible = false;
    if (this.raidWehr) this.raidWehr.visible = false;
    this.setGrade('aus', 0);
    // ---- die Schaluppe für den Strand von Ankerglück (Szene 7) schon jetzt bauen, übersetzen und hochladen ----
    await h.prebuildHome();
    if (this.ended) throw PREP_ABORTED;
    prog(0.86);
    // ---- Musik fertig rendern ----
    while (audioK < 1) { prog(0.84 + 0.14 * audioK); await yieldFrame(); }
    const buffers = await scoreP;
    if (this.ended) throw PREP_ABORTED;
    const so = audio.scoreOut();
    if (so && buffers.size) this.score = new PrologueScorePlayer(so.ctx, so.out, buffers, so.impulse);
    prog(1);
    if (this.ended) return;
    // ---- los: Ladescreen weg, Szene 1 blendet aus dem Schwarz auf ----
    this.resetForStart();
    await yieldFrame();
    ui.loading(-1);
    ui.skip(true);
    this.preparing = false;
  }

  /** Einen Satz jedes Effekt-Bausteins einmal zeichnen lassen (unsichtbar weit unten): Puffer und Programme stehen vor dem ersten Einsatz */
  private warmEffects() {
    const v = this.host.vfx();
    const x = this.sea.x, z = this.sea.z;
    v.burst('spark', x, -300, z, 2, 1, C_WHITE, { life: 0.05 });
    v.burst('ember', x, -300, z, 2, 1, C_WHITE, { life: 0.05 });
    v.burst('drop', x, -300, z, 2, 1, C_WHITE, { life: 0.05 });
    v.burst('smoke', x, -300, z, 2, 1, C_WHITE, { life: 0.05 });
    v.pressureRing(x, -300, z, 0, false, 1, C_WHITE, 0.05);
  }

  /** Nach dem Vorwärmen: Bühne in den Anfangszustand (Grünmarkt im Abendlicht, Schiffe an ihren Plätzen) */
  private resetForStart() {
    const env = this.host.env();
    env.weather.hold({ ...PROLOGUE_WEATHER.klar }, true);
    if (GRADES.gold.time !== null) env.time = GRADES.gold.time;
    env.timeSpeed = 0;
    this.placeSilhouettes();
    for (const e of this.frigates) e.ship.model.group.visible = false;
    // die Admirals-Flaggschiffe sind im friedlichen Abend nicht zu sehen: erst in der Gewitterfront leuchten sie plötzlich auf (Szene 2)
    this.showAdmirals(false);
    if (this.stage) this.stage.visible = true;
    this.shotId = '';
  }

  private makeShot(def: ShotDef): Shot {
    const v = (p: V3) => new Vector3(p[0], p[1], p[2]);
    const path = new CatmullRomCurve3(def.path.map(v), false, 'centripetal');
    const look = new CatmullRomCurve3((def.look.length > 1 ? def.look : [def.look[0], def.look[0]]).map(v), false, 'centripetal');
    // 4.7D.1: feine Bogenlängen-Tabelle (gleichmäßiges Tempo ohne Mikro-Ruckeln)
    path.arcLengthDivisions = SHOT_ARC_DIVISIONS; look.arcLengthDivisions = SHOT_ARC_DIVISIONS;
    path.updateArcLengths(); look.updateArcLengths();
    const d0 = def.dolly ? Math.hypot(def.path[0][0] - def.dolly[0], def.path[0][1] - def.dolly[1], def.path[0][2] - def.dolly[2]) : 0;
    return { def, path, look, d0 };
  }

  private spawnSchwarzbart() {
    const h = this.host, assets = h.assets();
    if (!assets) return;
    const base = { ...linenLook({}), ...SCHWARZBART.look } as CharacterLook;
    const c = new Character(assets, base, true);
    c.holder.scale.setScalar(SCHWARZBART.scale);
    c.presence({ build: SCHWARZBART.build, stance: SCHWARZBART.stance, face: SCHWARZBART_FACE.ruhe, breath: 0.75 });
    c.setGlowColor(SCHWARZBART.eyeGlow);
    // Effekt-Materialien (glühende Augen, Aura) sofort anlegen: sie werden im Ladescreen mit vorgewärmt – sonst entstand ihr Programm erst
    // beim Schrei in Szene 4 (gemessen 0,9 s Stillstand auf der Handy-Stufe)
    c.enableFx();
    c.playClip('Melee_2H_Idle', { loop: true, fade: 0 });
    h.scene.add(c.holder);
    this.schwarzbart = c;
    this.placeSchwarzbart();
  }

  /** Schwarzbart steht vorn auf dem Achterdeck und blickt nach vorn in den Sturm */
  private placeSchwarzbart() {
    const c = this.schwarzbart, dg = this.ownDg ?? this.host.deck(), ship = this.host.ship();
    if (!c || !dg || this.sb.under) return;
    const q = ship.model.quarter;
    const lz = q ? q.z1 - 1.6 : ship.model.helm.z + 2.2;
    const p = dg.world(0, lz);
    this.sb.x = p.x; this.sb.z = p.z; this.sb.yaw = ship.heading;
    this.sb.y = this.host.groundY(p.x, p.z, ship.model.deckY + 8);
    if (!Number.isFinite(this.sb.y)) this.sb.y = ship.model.deckY + (q?.top ?? 2.5);
    c.place(this.sb.x, this.sb.y, this.sb.z, this.sb.yaw);
  }

  /** Schwarzbarts Piraten-Crew: Geschützmannschaften an jeder Kanone, Läufer mittschiffs, Takler – instanziert, nicht die Truppen der Figur */
  private spawnCrew() {
    const ship = this.host.ship();
    const tr = new TroopRenderer(ship.model.group, true, { palette: RAID_TROOPS.crew, cap: 90 });
    this.crew = tr;
    const deckY = ship.model.deckY;
    const L = ship.cls.L, W = ship.cls.W;
    // freie Kanone des Schiffsjungen: Backbord-Mündung mittschiffs (nächste zu DECK_CREW.freeGunAt)
    const want = DECK_CREW.freeGunAt * L;
    let free = -1, best = Infinity;
    const guns = ship.model.muzzlesL.filter((m) => m.y < deckY + 1.6);
    guns.forEach((m, i) => { const d = Math.abs(m.z - want); if (d < best) { best = d; free = i; } });
    let seed = 1;
    const add = (lx: number, lz: number, yaw: number, gunner: boolean, run: boolean) => {
      const v = { typ: 'schwert' as const, heads: 1, x: run ? lx * 0.15 : lx, y: deckY + 0.1, z: run ? lz * 0.6 : lz, yaw, move: 0, pulse: 0, seed: seed++ * 0.137, compact: 1, tx: lx, tz: lz, run, gunner };
      this.crewViews.push(v);
    };
    const side = (list: Vector3[], sgn: number, skip: number) => {
      list.filter((m) => m.y < deckY + 1.6).forEach((m, i) => {
        if (i === skip) return;
        for (let k = 0; k < DECK_CREW.perGun; k++) {
          const lx = m.x - sgn * (1.5 + k * 0.9), lz = m.z + (k ? 0.7 : -0.5);
          add(lx, lz, sgn > 0 ? Math.PI / 2 : -Math.PI / 2, true, (i + k) % 2 === 0);
        }
      });
    };
    side(ship.model.muzzlesL, 1, free);
    side(ship.model.muzzlesR, -1, -1);
    for (let k = 0; k < DECK_CREW.extra; k++) add((this.rnd() - 0.5) * W * 0.5, (this.rnd() - 0.3) * L * 0.6, this.rnd() * TAU, false, false);
    // Ziel des Schiffsjungen: hinter der freien Kanone (Deck-Innenseite)
    const fm = guns[free] ?? new Vector3(W * 0.4, deckY, 0);
    this.deckGoal.lx = fm.x - 1.9; this.deckGoal.lz = fm.z;
    this.deckStart = { lx: DECK_CREW.startSide * W * 0.5, lz: DECK_CREW.startAt * L };
    tr.visible = true;
    // Raid-Truppen von Grünmarkt (Szene 3): Marine gegen Bürgerwehr (Welt-Koordinaten)
    this.raidMarine = new TroopRenderer(this.host.scene, true, { palette: RAID_TROOPS.marine, cap: 60 });
    this.raidWehr = new TroopRenderer(this.host.scene, true, { palette: RAID_TROOPS.wehr, cap: 40 });
    this.raidMarine.visible = false; this.raidWehr.visible = false;
  }

  /** Admirals-Flaggschiffe (riesig, Bühnen-Maßstab) und Marine-Fregatten; alle stehen still, die Regie setzt sie je Szene um */
  private spawnFleets() {
    const nav = this.host.naval();
    if (!nav) return;
    for (const a of ADMIRALS) {
      const e = nav.spawnStage(this.town.x, this.town.z, 0, FLEET.admiralTier, 'marine', a.name, 40, 'legende', true, admiralLook(a));
      e.ship.frozen = 1e9; e.ship.ceasefire = 1e9; e.ship.unsinkable = true;
      e.ship.model.group.scale.setScalar(FLEET.scale);
      this.admirals.push(e);
    }
    for (let i = 0; i < FLEET.frigates; i++) {
      const e = nav.spawnStage(this.town.x, this.town.z, 0, FLEET.frigateTier, 'marine', 'Marine-Fregatte', 20, 'jaeger');
      e.ship.frozen = 1e9; e.ship.ceasefire = 1e9; e.ship.unsinkable = true;
      this.frigates.push(e);
    }
    this.placeSilhouettes();
  }

  /** Schiff an einen Platz im Rahmen setzen (lokal x, z; Bug zeigt nach `yaw` im Rahmen) */
  private placeShip(e: EnemyShip, f: StageFrame, lx: number, lz: number, yaw: number) {
    frameToWorld(f, lx, 0, lz, _p);
    e.ship.place(_p.x, _p.z, f.h + yaw);
  }

  /** 4.7D.1: Schiff in eine berechnete Lage setzen (Bug frontal auf das Ziel) */
  private poseShip(e: EnemyShip, p: FleetPose) { e.ship.place(p.x, p.z, p.heading); }
  private readonly fleetPoses: FleetPose[] = [];

  /** Admirals-Flaggschiffe zeigen bzw. verbergen (Programme und Texturen sind vorgewärmt; ein Schiff erscheint mit seiner Silhouette) */
  private showAdmirals(on: boolean, only = -1) {
    for (let i = 0; i < this.admirals.length; i++) if (only < 0 || only === i) this.admirals[i].ship.model.group.visible = on;
  }

  /**
   * Szene 2: weit draußen vor Grünmarkt. 4.7D.1: jeder Bug zeigt frontal auf die Schwarze Krone, die hinter der Stadt liegt (`crownBearing`) –
   * von den Dächern aus sieht man die sieben Galionsfiguren auf sich zukommen, die äußeren Schiffe leicht eingedreht wie ein Fächer.
   */
  private placeSilhouettes() {
    const crown = this.host.ship();
    fleetFacing(this.town, ADM_SLOTS, FLEET.silhouetteGap, FLEET.silhouetteZ, 26, crown.x, crown.z, this.fleetPoses);
    this.admirals.forEach((e, i) => this.poseShip(e, this.fleetPoses[i]));
    this.frigates.forEach((e, i) => this.placeShip(e, this.town, (i - 1) * 60, FLEET.silhouetteZ + 60, Math.PI));
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 2. Regie in Echtzeit
  // ---------------------------------------------------------------------------------------------------------------

  /** Pausenmenü: Regie und Musik halten an */
  pause(on: boolean) {
    if (on === this.paused) return;
    this.paused = on;
    this.score?.pause(on);
  }

  /** Je gezeichnetem Bild (Echtzeit) */
  frame(realDt: number) {
    if (this.ended || this.preparing || this.paused) return;
    const dt = Math.min(0.1, realDt);
    const n = this.director.step(dt, this.geo, this.out);
    for (let i = 0; i < n; i++) this.onEvent(this.out.events[i]);
    if (this.ended) return;
    this.shotT += dt;
    // unter Wasser fällt kein Regen (an der Oberfläche peitscht er weiter)
    if (this.sb.under) this.host.env().weather.p.rain = 0;
    this.stepGrade(dt);
    this.stepSilhouettes(dt);
    this.stepCharge(dt);
    this.stepBeam(dt);
    this.stepPov();
    this.syncScore();
    const ui = this.ui;
    ui.letterbox(this.director.bars);
    ui.blackout(this.director.blackout);
    if (this.fovPunch > 0) this.fovPunch = Math.max(0, this.fovPunch - dt * 2.2);
  }

  private onEvent(e: PrologueEvent) {
    switch (e.type) {
      case 'scene': this.onScene(e.id); break;
      case 'line': this.say(e.id); break;
      case 'music': this.music(e.id, e.v, e.d); break;
      case 'amb': audio.prologueAmbience(AMB[e.id as AmbienceId] ?? AMB.stille, e.id === 'stille'); break;
      case 'shot': this.setShot(e.id, e.v); break;
      case 'grade': this.setGrade(e.id as GradeId, e.d); break;
      case 'fx': this.effect(e.id, e.v); break;
      case 'play': this.host.setControl(true); this.ui.goal(DECK_OBJECTIVE); break;
      case 'hint': this.say('hinweis'); this.ui.goal(DECK_OBJECTIVE); break;
      case 'auto': this.autoToGun(); break;
      case 'ready': this.onReady(); break;
      case 'done': this.finish(false); break;
      default: break;
    }
  }

  private say(id: string) {
    const l = PROLOGUE_LINES[id];
    if (!l) return;
    this.shown.push(id);
    this.ui.line(l);
    // Rufe zeigt der Gesichtsausdruck (weit offener Mund), gesprochene Zeilen bewegen Mund und Hände
    if (this.schwarzbart && l.who === SCHWARZBART.name && !l.narr && !l.shout) this.schwarzbart.talk(l.hold * 0.7, 0.9);
  }

  private music(id: string, v: number, d: number) {
    const s = this.score;
    if (!s) return;
    if (id === 'stop') { s.cut(); return; }
    const cue = id as ScoreCue;
    if (v > 0 && !s.playing(cue)) s.start(cue, 0, v, d);
    else if (v <= 0) s.fade(cue, 0, d);
    else s.fade(cue, v, d);
  }

  /** Musik der Regie folgen lassen (die Regie ist die Uhr) */
  private syncScore() {
    const s = this.score;
    if (!s) return;
    const st = this.director.state;
    for (const c of ['hafen', 'untergang', 'gegenangriff', 'engel', 'schwur', 'hoffnung'] as ScoreCue[]) {
      if (!st.cues[c].on) continue;
      s.sync(c, this.director.cuePos(c), this.director.cueGain(c));
    }
  }

  private onScene(id: string) {
    this.shotT = 0;
    switch (id) {
      case 'gruenmarkt': break;
      case 'vernichtung': this.placeAttackLine(); break;
      case 'gegenangriff': this.toSea(); break;
      case 'urteil': this.host.setControl(false); this.ui.goal(''); break;
      case 'erwachen': break;
      default: break;
    }
  }

  // ---------- Licht ----------

  private setGrade(id: GradeId, d: number) {
    const env = this.host.env();
    const g = GRADES[id] ?? GRADES.aus;
    this.gradeB = { from: this.currentGrade(), to: g, t: 0, d };
    if (g.time !== null) env.time = g.time;
    this.applyGrade(d <= 0 ? 1 : 0);
  }

  /** Stand der laufenden Überblendung als Ausgangspunkt der nächsten (nur bei einem Wechsel, nicht je Bild) */
  private currentGrade(): GradeDef {
    const b = this.gradeB;
    if (b.d <= 0 || b.t >= b.d) return b.to;
    const g = this.host.env().grade, hex = (c: Color) => `#${c.getHexString()}`;
    return {
      time: null, horizon: hex(g.horizon), zenith: hex(g.zenith), fog: hex(g.fog), light: hex(g.light), lightK: g.lightK, amb: hex(g.amb), ambK: g.ambK,
      sea: hex(g.sea), seaK: g.seaK, fogFar: g.fogFar, fogShape: g.fogShape, exposure: g.exposure, k: g.k,
    };
  }

  private readonly cA = new Color();
  private readonly cB = new Color();
  private applyGrade(k: number) {
    const env = this.host.env(), gr = env.grade, b = this.gradeB;
    const mix = (out: Color, a: string, c: string) => out.copy(this.cA.set(a)).lerp(this.cB.set(c), k);
    const n = (a: number, c: number) => a + (c - a) * k;
    gr.k = n(b.from.k, b.to.k);
    mix(gr.horizon, b.from.horizon, b.to.horizon); mix(gr.zenith, b.from.zenith, b.to.zenith); mix(gr.fog, b.from.fog, b.to.fog);
    mix(gr.light, b.from.light, b.to.light); mix(gr.amb, b.from.amb, b.to.amb); mix(gr.sea, b.from.sea, b.to.sea);
    gr.lightK = n(b.from.lightK, b.to.lightK); gr.ambK = n(b.from.ambK, b.to.ambK); gr.seaK = n(b.from.seaK, b.to.seaK);
    gr.fogFar = b.to.fogFar > 0 && b.from.fogFar > 0 ? n(b.from.fogFar, b.to.fogFar) : b.to.fogFar > 0 ? b.to.fogFar : b.from.fogFar * (1 - k);
    gr.fogShape = b.to.fogShape >= 0 && b.from.fogShape >= 0 ? n(b.from.fogShape, b.to.fogShape) : b.to.fogShape >= 0 ? b.to.fogShape : k < 1 ? b.from.fogShape : -1;
    gr.exposure = n(b.from.exposure, b.to.exposure);
  }

  private stepGrade(dt: number) {
    const b = this.gradeB;
    if (b.t < b.d) b.t = Math.min(b.d, b.t + dt);
    this.applyGrade(b.d <= 0 ? 1 : smooth(b.t / b.d));
    // Sieben-Farben-Spektrum: das Licht wandert durch die Farben der Admirale, solange die Aufladung läuft
    if (b.to === GRADES.spektrum && this.chargeT >= 0) {
      const gr = this.host.env().grade, i = Math.floor(this.chargeT * 2.4) % ADM_COL.length;
      gr.light.lerp(ADM_COL[i], 0.35);
      gr.horizon.lerp(ADM_COL[(i + 3) % ADM_COL.length], 0.12);
    }
  }

  // ---------- Effekte je Taktschlag ----------

  private effect(id: string, v: number) {
    const h = this.host, env = h.env();
    switch (id) {
      case 'windDreht': {
        this.stage?.lookUp();
        env.weather.hold({ ...PROLOGUE_WEATHER.klar, wind: 0.55, clouds: 0.5, waves: 0.75 }, false);
        break;
      }
      case 'front': env.weather.hold({ ...PROLOGUE_WEATHER.front }, false); break;
      case 'silhouette': {
        this.glowOn[v] = true;
        this.showAdmirals(true, v);
        const e = this.admirals[v];
        if (e) {
          // das Licht flammt hinter der Hülle auf (weicher Lichtblitz), ein fernes Grollen
          const fx = h.fx(), b = fx.brush, y = h.waterY(e.ship.x, e.ship.z) + 24;
          b.reset().at(e.ship.x, y, e.ship.z).size(40, 40, 1, 150, 150, 1).span(0.9).col(ADM_COL[v], 2.6).fade(0.05, 0.7);
          fx.emit('ember');
          audio.play('boom', 0.35, { x: e.ship.x, z: e.ship.z });
        }
        break;
      }
      case 'blitz': {
        const e = this.admirals[(v * 3 + 1) % Math.max(1, this.admirals.length)];
        const f = this.director.scene === 'gegenangriff' || this.director.scene === 'urteil' ? this.sea : this.town;
        if (e) {
          frameToWorld(f, 0, 0, 0, _p);
          const dx = e.ship.x - _p.x, dz = e.ship.z - _p.z, d = Math.hypot(dx, dz) || 1;
          env.weather.strikeAt(_v.set(_p.x, 0, _p.z), e.ship.x + (dx / d) * 120 + (this.rnd() - 0.5) * 140, e.ship.z + (dz / d) * 120 + (this.rnd() - 0.5) * 140);
          audio.play('thunder', 0.85);
        }
        break;
      }
      case 'todBlitz': {
        for (let k = 0; k < 3; k++) { const e = this.admirals[(k * 2 + 1) % 7]; if (e) env.weather.strikeAt(_v.set(this.town.x, 0, this.town.z), e.ship.x + (this.rnd() - 0.5) * 90, e.ship.z + 60 + this.rnd() * 80); }
        this.auraK = 1.8;
        for (let i = 0; i < 7; i++) this.glowOn[i] = true;
        this.showAdmirals(true);
        h.impact(2);
        h.shake(0.6);
        this.fovPunch = 1;
        audio.play('thunderClap', 1);
        break;
      }
      case 'angriff': this.stage?.flee(); this.raidWehrForm(); break;
      case 'salve': this.salvo(v); break;
      case 'element': this.element(v); break;
      case 'brand': for (const i of GRUENMARKT.burn) this.stage?.ignite(i); audio.play('fireRoar', 0.8); this.addFireCarriers(); break;
      case 'landkampf': this.landBattle(); break;
      case 'einsturz': { const pair = GRUENMARKT.collapse[v]; if (pair) for (const i of pair) { this.stage?.collapse(i); this.blastAtHouse(i, 1.2); } audio.play('quakeRumble', 0.9); break; }
      case 'strahlen': this.sevenBeams(); break;
      case 'verwuestung': this.raze(); break;
      case 'flaggschiff': this.startChase(); break;
      case 'schrei': this.scream(); break;
      case 'kontrolle': this.control(); break;
      case 'kanonen': this.toGuns(); break;
      case 'aufladung': this.startCharge(); break;
      case 'strahl': this.fireBeam(); break;
      case 'spaltung': this.splitShip(); break;
      case 'sturz': this.startFall(); break;
      case 'eintauchen': this.underwater(true); break;
      case 'wrack': this.placeUnderwater(); break;
      case 'sammeln': this.gather(); break;
      case 'druckwelle': this.oathShock(); break;
      case 'zurueck': this.recoil(v); break;
      case 'sinken': this.startSinking(); break;
      case 'strand': this.toBeach(); break;
      case 'aufstehen': this.standUp(); break;
      default: break;
    }
  }

  // ---------- Szene 2: Silhouetten im Nebel ----------

  /**
   * Leuchtende Admirals-Silhouetten: hinter jedem Schiff (von der Kamera aus) ein weicher, farbiger Lichthof, nahe am Deck ein hellerer Kern –
   * die dunklen Schattenhüllen stehen davor. Dazu die schwarze Nebel- und Gewitterfront aus riesigen Rauchbänken. Alle 0,45 s nachgelegt.
   */
  private stepSilhouettes(dt: number) {
    const sc = this.director.scene;
    const lit = sc === 'sturmfront' || sc === 'vernichtung' || sc === 'gegenangriff' || sc === 'urteil' || sc === 'schwur';
    if (!lit) return;
    if (sc === 'sturmfront') this.pushFront(dt);
    this.glowT -= dt;
    if (this.glowT > 0) return;
    this.glowT = 0.45;
    if (this.auraK > 1) this.auraK = Math.max(1, this.auraK - 0.2);
    const fx = this.host.fx(), b = fx.brush;
    const cam = this.camPos;
    for (let i = 0; i < this.admirals.length; i++) {
      if (!this.glowOn[i]) continue;
      const e = this.admirals[i];
      const wy = this.host.waterY(e.ship.x, e.ship.z);
      const dx = e.ship.x - cam.x, dz = e.ship.z - cam.z, d = Math.hypot(dx, dz) || 1;
      const far = Math.min(2.2, Math.max(0.7, d / 420));
      const k = this.auraK * (sc === 'schwur' ? 0.75 : 1);
      // Lichthof hinter der Hülle (weiche Leuchtscheibe, zur Kamera gedreht)
      const bx = e.ship.x + (dx / d) * 60, bz = e.ship.z + (dz / d) * 60;
      b.reset().at(bx, wy + 30 * FLEET.scale * 0.7, bz).size(95 * k * far, 95 * k * far, 1, 110 * k * far, 110 * k * far, 1).span(1.1).col(ADM_COL[i], 2.2 * k).fade(0.3, 0.4);
      fx.emit('ember');
      // heller Kern über dem Deck (die Kraft, die man nicht erkennt)
      b.reset().at(e.ship.x + (dx / d) * 8, wy + 16 * FLEET.scale, e.ship.z + (dz / d) * 8).size(26 * k * far, 26 * k * far, 1, 32 * k * far, 32 * k * far, 1).span(1.0).col(ADM_COL[i], 3.2 * k).fade(0.25, 0.4);
      fx.emit('ember');
    }
    // Nebel- und Gewitterfront: riesige, dunkle Rauchbänke um und hinter der Schlachtreihe (Szenen 2 – 3)
    if (sc === 'sturmfront' || sc === 'vernichtung') {
      const f = this.town;
      // wenige große Bänke weit hinter der Reihe (Füllrate: große, sich überlagernde Flächen kosten am meisten)
      for (let k = 0; k < 2; k++) {
        const lx = (this.rnd() - 0.5) * 1200, lz = FLEET.silhouetteZ + 140 + this.rnd() * 380, ly = 50 + this.rnd() * 120;
        frameToWorld(f, lx, ly, lz, _p);
        const sz = 150 + this.rnd() * 90;
        b.reset().at(_p.x, ly, _p.z).vel((this.rnd() - 0.5) * 3, 0, (this.rnd() - 0.5) * 3).rot(0, 0, this.rnd() * 6).spin(0, 0, (this.rnd() - 0.5) * 0.08)
          .size(sz * 0.85, sz * 0.85, 1, sz, sz, 1).span(6).col(C_FRONT, 1).fade(0.35, 0.3);
        fx.emit('smoke');
      }
    }
  }

  /** Szene 2: die Front zieht schnell auf – Wolkendecke, Dunkel und Regen in wenigen Sekunden (statt der üblichen zwölf) */
  private pushFront(dt: number) {
    const p = this.host.env().weather.p, F = PROLOGUE_WEATHER.front, k = Math.min(1, dt / 2.6);
    p.clouds += (F.clouds - p.clouds) * k; p.cloudDark += (F.cloudDark - p.cloudDark) * k; p.grey += (F.grey - p.grey) * k;
    p.light += (F.light - p.light) * k; p.visibility += (F.visibility - p.visibility) * k; p.wind += (F.wind - p.wind) * k;
  }

  // ---------- Szene 3: die Vernichtung ----------

  /** Die Admirale rücken vor (Angriffslinie), die Fregatten liegen vor dem Hafen */
  private placeAttackLine() {
    this.showAdmirals(true);
    this.admirals.forEach((e, i) => this.placeShip(e, this.town, ADMIRALS[i].slot * FLEET.attackGap, FLEET.attackZ + Math.abs(ADMIRALS[i].slot) * 14, Math.PI / 2 * (ADMIRALS[i].slot >= 0 ? 1 : -1)));
    this.frigates.forEach((e, i) => { e.ship.model.group.visible = true; this.placeShip(e, this.town, (i - 1) * 70, FLEET.frigateZ + i * 12, Math.PI / 2 * (i % 2 ? 1 : -1)); });
    this.host.env().weather.hold({ ...PROLOGUE_WEATHER.front, rain: 0.5, lightning: 0 }, false);
  }

  private salvo(v: number) {
    const h = this.host, vfx = h.vfx(), fx = h.fx(), b = fx.brush;
    const ships = [...this.frigates, ...this.admirals.slice(2, 5)];
    for (let k = 0; k < ships.length; k++) {
      const e = ships[(k + v) % ships.length];
      const s = e.ship;
      frameToWorld(this.town, 0, 0, -10, _q);
      const dx = _q.x - s.x, dz = _q.z - s.z, d = Math.hypot(dx, dz) || 1;
      const sx = s.x + (dx / d) * s.cls.W * 0.7, sz = s.z + (dz / d) * s.cls.W * 0.7, sy = h.waterY(s.x, s.z) + s.model.deckY + 1;
      vfx.burst('spark', sx, sy, sz, 14, 12, C_FIRE, { up: 1, size: 0.6, life: 0.3, dirX: dx / d, dirZ: dz / d, focus: 0.7 });
      vfx.burst('smoke', sx, sy, sz, 6, 4, C_SMOKE, { up: 1, size: 4, life: 3 });
      s.kick(0.08 * (k % 2 ? 1 : -1));
      // Kugel fliegt (sichtbarer Glutball), Einschlag an einem Haus oder Steg
      const hi = (v * 5 + k * 3) % Math.max(1, this.stage?.houseTotal ?? 1);
      const tgt = this.stage?.housePos(hi, _p);
      if (!tgt) continue;
      const tx = tgt.x + (this.rnd() - 0.5) * 6, ty = tgt.y, tz = tgt.z + (this.rnd() - 0.5) * 6;
      const T = 0.55 + k * 0.08;
      b.reset().at(sx, sy, sz).vel((tx - sx) / T, (ty - sy) / T + 9.8 * T * 0.5, (tz - sz) / T).size(0.55, 0.55, 0.55).span(T).col(C_EMBER, 3).fade(0.01, 0.05);
      b.grav = 9.8;
      fx.emit('orb');
      this.delayed(T, () => { this.explode(tx, ty, tz, 1.1); this.stage?.ignite(hi); if (k === 1) this.stage?.sinkBoat(v + k); if (k === 2) this.stage?.knockDown(v); });
    }
    audio.play('broadside', 0.9);
  }

  /** Elementar-/Faji-Angriff eines Admirals über die Piers (je Admiral eine eigene Effektsprache) */
  private element(i: number) {
    const h = this.host, vfx = h.vfx(), fx = h.fx(), b = fx.brush;
    const e = this.admirals[i];
    if (!e) return;
    const col = ADM_COL[i];
    const ink = vfx.inkOf(col);
    const sx = e.ship.x, sz = e.ship.z, sy = h.waterY(sx, sz) + e.ship.model.deckY * FLEET.scale + 6;
    // Ziel: ein Steg bzw. die Kaimauer
    const pier = GRUENMARKT.piers[i % GRUENMARKT.piers.length];
    frameToWorld(this.town, pier[0] + (this.rnd() - 0.5) * 10, 1.6, gmCoastZ(pier[0]) + pier[1] * 0.5, _p);
    const tx = _p.x, ty = _p.y, tz = _p.z;
    const yaw = Math.atan2(tx - sx, tz - sz);
    switch (i) {
      case 0: // Purpurrot – Höllenglut: Feuerwand fegt über den Steg
        b.reset().at(tx, ty - 1, tz).rot(yaw).size(4, 3, 4, 26, 10, 26).span(1.1).col(ink, 1).fade(0.05, 0.4); fx.emit('arcInk');
        b.reset().at(tx, ty - 0.6, tz).rot(yaw).size(3, 2, 3, 24, 9, 24).span(1).col(col, 2.4).fade(0.05, 0.45); fx.emit('arc');
        vfx.burst('ember', tx, ty, tz, 40, 12, C_FIRE, { up: 8, size: 0.5 });
        audio.play('fireRoar', 0.9, { x: tx, z: tz });
        break;
      case 1: // Abgrund-Violett – Tiefseeflut: Strudelsäule aus dem Hafenbecken
        vfx.funnel(tx, ty - 2, tz, 22, 7, col, ink, 1.6);
        vfx.burst('drop', tx, ty, tz, 34, 10, C_FOAM, { up: 9, size: 0.4 });
        audio.play('tidalRoar', 0.9, { x: tx, z: tz });
        break;
      case 2: // Sonnengold – Donnerurteil: Blitze schlagen in die Stege
        for (let k = 0; k < 4; k++) vfx.bolt(tx + (this.rnd() - 0.5) * 16, ty + 70, tz + (this.rnd() - 0.5) * 16, tx + (this.rnd() - 0.5) * 8, ty, tz + (this.rnd() - 0.5) * 8, col, 2.4, 0.3, { branches: 3, impact: 1 });
        audio.play('thunderClap', 0.9, { x: tx, z: tz });
        break;
      case 3: // Gletscher-Cyan – Ewiger Frost: Eislanzen-Salve, Frostring
        for (let k = 0; k < 6; k++) { b.reset().at(sx, sy, sz).rot(yaw + (this.rnd() - 0.5) * 0.3, -0.12).vel((tx - sx) * 1.4, (ty - sy) * 1.4, (tz - sz) * 1.4).size(0.7, 0.7, 4).span(0.7).col(col, 2.2).fade(0.02, 0.1); fx.emit('shard'); }
        this.delayed(0.65, () => { vfx.burst('ice', tx, ty, tz, 40, 10, col, { up: 4, size: 0.6 }); vfx.pressureRing(tx, ty, tz, 0, false, 16, col, 0.7); audio.play('iceShatter', 1, { x: tx, z: tz }); });
        break;
      case 4: // Sturm-Smaragd – Orkanklinge: Windsicheln schneiden über die Piers
        for (let k = 0; k < 3; k++) vfx.slash(tx, ty + 1.2 + k * 0.8, tz, yaw + Math.PI / 2, 0, k * 0.4, 9 + k * 2, col, ink, { life: 0.5, vx: Math.sin(yaw) * 8, vz: Math.cos(yaw) * 8, delay: k * 0.12 });
        audio.play('windHowl', 0.9, { x: tx, z: tz });
        break;
      case 5: // Obsidian-Magenta – Mondbann: Mondsicheln aus der Höhe
        for (let k = 0; k < 3; k++) vfx.slash(tx + (k - 1) * 6, ty + 8, tz, yaw, -1.1, 0, 10, col, ink, { life: 0.6, vy: -14, delay: k * 0.15 });
        audio.play('moonChime', 0.9, { x: tx, z: tz });
        break;
      default: // Strahlendes Weißgold – Sonnenlanze: Lichtlanze vom Schiff in den Hafen
        b.reset().at(sx, sy, sz).rot(yaw, Math.PI / 2 - Math.atan2(sy - ty, Math.hypot(tx - sx, tz - sz))).size(1.4, Math.hypot(tx - sx, ty - sy, tz - sz), 1.4, 2.6, Math.hypot(tx - sx, ty - sy, tz - sz), 2.6).span(0.6).col(col, 3).fade(0.02, 0.3);
        fx.emit('column');
        audio.play('sunChoir', 0.9, { x: tx, z: tz });
        break;
    }
    this.delayed(i === 3 ? 0.7 : 0.25, () => this.explode(tx, ty, tz, 0.9));
    this.stage?.sinkBoat(i);
    this.stage?.knockDown(i + 3);
  }

  private raidWehrForm() {
    if (!this.raidWehr) return;
    this.raidViews.w.length = 0;
    for (let k = 0; k < 4; k++) {
      frameToWorld(this.town, -24 + k * 16, 0, -7, _p);
      this.raidViews.w.push({ typ: k % 2 ? 'musketier' : 'schwert', heads: 6, x: _p.x, y: 1.75, z: _p.z, yaw: this.town.h, move: 0, pulse: 0, seed: 0.3 + k * 0.21, compact: 1 });
    }
    this.raidWehr.visible = true;
  }

  private landBattle() {
    if (!this.raidMarine) return;
    this.raidViews.m.length = 0;
    for (let k = 0; k < 5; k++) {
      frameToWorld(this.town, -30 + k * 15, 0, 4, _p);
      this.raidViews.m.push({ typ: k % 2 ? 'musketier' : 'schwert', heads: 8, x: _p.x, y: 1.6, z: _p.z, yaw: this.town.h + Math.PI, move: 1, pulse: 0, seed: 0.7 + k * 0.13, compact: 1 });
    }
    this.raidMarine.visible = true;
    audio.play('horn', 0.6);
  }

  /** Die sieben Admirale schlagen gleichzeitig zu: farbige Säulen aus dem Himmel auf Grünmarkt */
  private sevenBeams() {
    const h = this.host, fx = h.fx(), b = fx.brush, vfx = h.vfx();
    for (let i = 0; i < 7; i++) {
      frameToWorld(this.town, (i - 3) * 16 + (this.rnd() - 0.5) * 6, 0, -14 - (i % 3) * 14, _p);
      const y = Math.max(1.6, h.groundY(_p.x, _p.z, 40));
      b.reset().at(_p.x, y, _p.z).size(2, 90, 2, 6, 90, 6).span(1.2, i * 0.08).col(ADM_COL[i], 2.8).fade(0.05, 0.5);
      fx.emit('column');
      vfx.pressureRing(_p.x, y + 0.5, _p.z, 0, false, 22, ADM_COL[i], 0.8);
      this.delayed(0.15 + i * 0.08, () => this.explode(_p.x, y, _p.z, 1.3));
    }
    h.shake(0.7);
    h.impact(2);
    audio.play('eruption', 1);
  }

  private raze() {
    this.stage?.raze();
    const h = this.host;
    for (let i = 0; i < (this.stage?.houseTotal ?? 0); i += 2) { const p = this.stage?.housePos(i, _q); if (p) this.delayed(i * 0.05, () => this.explode(p.x, p.y, p.z, 1.4)); }
    h.shake(0.9);
    audio.play('quakeRumble', 1);
    audio.play('boom', 1);
  }

  private blastAtHouse(i: number, k: number) { const p = this.stage?.housePos(i, _q); if (p) this.explode(p.x, p.y, p.z, k); }

  /** Explosion: Feuerball, Splitter, Rauch, Druckring, Ton */
  private explode(x: number, y: number, z: number, k: number) {
    const vfx = this.host.vfx(), fx = this.host.fx(), b = fx.brush;
    vfx.burst('ember', x, y, z, Math.round(22 * k), 10 * k, C_FIRE, { up: 6 * k, size: 0.45 });
    vfx.burst('splinter', x, y, z, Math.round(10 * k), 8 * k, C_SMOKE, { up: 6, size: 0.4 });
    vfx.burst('smoke', x, y + 1, z, Math.round(6 * k), 2.5, C_SMOKE, { up: 2, size: 3.6 * k, life: 3.2 });
    b.reset().at(x, y, z).size(0.5, 0.5, 0.5, 5 * k, 5 * k, 5 * k).span(0.45).col(C_FIRE, 2.6).fade(0.01, 0.5);
    fx.emit('orb');
    audio.play('boom', 0.75 * k, { x, z });
  }

  /** Brände von Grünmarkt als echte Lichtträger (der LampPool wählt die nächsten) */
  private addFireCarriers() {
    const st = this.stage;
    if (!st) return;
    const add: Object3D[] = [];
    for (const i of GRUENMARKT.burn.slice(0, 6)) {
      const p = st.housePos(i, _q);
      if (!p) continue;
      const c = new Object3D();
      c.position.set(p.x, p.y + 2, p.z);
      c.userData.fire = true; c.userData.fixed = true; c.userData.lightK = 1.9; c.userData.seed = this.rnd();
      this.host.scene.add(c);
      c.updateMatrixWorld(true);
      add.push(c);
      this.carriers.push(c);
    }
    this.host.lightCarriers(add, true);
  }

  // ---------- Szene 4: Gegenangriff im Sturm ----------

  /** Schnitt auf die See: Grünmarkt verborgen, die Admirale voraus, Sturm, die Schwarze Krone jagt los */
  private toSea() {
    const env = this.host.env();
    if (this.stage) this.stage.visible = false;
    this.host.lightCarriers(this.carriers, false);
    if (this.raidMarine) this.raidMarine.visible = false;
    if (this.raidWehr) this.raidWehr.visible = false;
    for (const e of this.frigates) e.ship.model.group.visible = false;
    this.showAdmirals(true);
    env.weather.hold({ ...PROLOGUE_WEATHER.sturm, lightning: 0 }, true);
    this.placeAhead();
  }

  /** Schlachtreihe voraus (Rahmen = aktuelle Lage der Schwarzen Krone) */
  private placeAhead() {
    const ship = this.host.ship();
    // 4.7D.1: Bug und Galionsfigur frontal auf die Schwarze Krone (vorher zeigten die Hecks zur Krone); die Reihe weicht in Szene 4 im
    // gleichen Tempo zurück, ohne zu drehen – die Ausrichtung bleibt dabei exakt
    const f = { x: ship.x, z: ship.z, h: ship.heading };
    fleetFacing(f, ADM_SLOTS, FLEET.aheadGap, FLEET.aheadZ, 18, ship.x, ship.z, this.fleetPoses);
    this.admirals.forEach((e, i) => this.poseShip(e, this.fleetPoses[i]));
  }

  private startChase() {
    const h = this.host, ship = h.ship(), dg = h.deck() ?? this.ownDg;
    this.ownDg = dg;
    this.moving = true;
    this.lastShip.x = ship.x; this.lastShip.z = ship.z;
    if (dg) { const p = dg.world(this.deckStart.lx, this.deckStart.lz); h.placeFoot(p.x, p.z, ship.heading + Math.PI * 0.85); }
    this.placeSchwarzbart();
    for (let i = 0; i < 7; i++) this.glowOn[i] = true;
    this.auraK = 0.7;
    if (this.crew) this.crew.visible = true;
  }

  private scream() {
    const c = this.schwarzbart, h = this.host, vfx = h.vfx();
    if (c) {
      c.setMood(SCHWARZBART_FACE.schrei, 1);
      // stehender Kampfschrei mit erhobenem Arm (die Spott-Animation der Skelette ließ ihn in die Hocke gehen und 2,6 m hochspringen)
      c.playClip('Ranged_Magic_Raise', { loop: false, fade: 0.12, onDone: () => c.playClip('Melee_2H_Idle', { loop: true, fade: 0.3 }) });
      vfx.pressureRing(this.sb.x, this.sb.y + 2.4, this.sb.z, this.sb.yaw, true, 9, C_DARK, 0.6);
      vfx.auraSwirl(this.sb.x, this.sb.y + 2, this.sb.z, C_DARK, C_INK, 1.6, 0.5);
      Character.blastAll(this.sb.x, this.sb.y + 2, this.sb.z, 12, 1);
    }
    h.shake(0.55);
    h.impact(1);
    this.fovPunch = 1;
    audio.play('roar', 1);
  }

  /** Die Kamera geht an die Spielfigur (Fußkamera): Schiffsjunge an Deck */
  private control() {
    const sc = this.director.scene;
    if (sc === 'erwachen') {
      const p = this.host.player();
      if (p) p.holder.visible = true;
      this.ui.eyelids(0); this.ui.blur(0);
      this.finish(false);
      return;
    }
    this.host.setControl(false);
  }

  /** „An die Kanonen!“: die Läufer rennen an ihre Geschütze, das Ziel des Schiffsjungen leuchtet */
  private toGuns() {
    for (const v of this.crewViews) if (v.run) v.move = 1;
    const dg = this.ownDg ?? this.host.deck();
    if (dg) { const p = dg.world(this.deckGoal.lx, this.deckGoal.lz); this.deckGoal.x = p.x; this.deckGoal.z = p.z; this.deckGoal.set = true; }
    this.schwarzbart?.setMood(SCHWARZBART_FACE.blick, 1);
    audio.play('horn', 0.7);
  }

  private onReady() {
    const f = this.host.foot();
    this.host.setControl(false);
    this.ui.goal('');
    this.say('bereit');
    // gefechtsbereit: in die Hocke hinter die Kanone, Blick nach außenbords
    if (f) this.host.player()?.playClip('Crouching', { loop: true, fade: 0.2 });
  }

  /** Zeit abgelaufen: die Figur steht an ihrer Kanone */
  private autoToGun() {
    const dg = this.ownDg ?? this.host.deck(), ship = this.host.ship();
    if (dg) { const p = dg.world(this.deckGoal.lx, this.deckGoal.lz); this.host.placeFoot(p.x, p.z, ship.heading + Math.PI / 2); }
  }

  // ---------- Szene 5: der Sieben-Farben-Strahl ----------

  private startCharge() {
    const ship = this.host.ship();
    this.chargeT = 0;
    // Bündelung vor der Schlachtreihe, in Deckshöhe der Schwarzen Krone
    const f = { x: ship.x, z: ship.z, h: ship.heading };
    frameToWorld(f, 0, 0, FLEET.aheadZ - 46, _p);
    this.convergence.set(_p.x, ship.model.deckY + 9, _p.z);
    for (let i = 0; i < 7; i++) this.glowOn[i] = true;
    this.auraK = 1.4;
    audio.play('cineDrop', 0.9);
  }

  private stepCharge(dt: number) {
    if (this.chargeT < 0) return;
    const t0 = this.chargeT;
    this.chargeT += dt;
    if (this.director.scene !== 'urteil' || this.beam.t >= 0) { if (this.beam.t >= 0) this.chargeT = -1; return; }
    if (Math.floor(this.chargeT / 0.1) === Math.floor(t0 / 0.1)) return;
    const h = this.host, vfx = h.vfx(), fx = h.fx(), b = fx.brush, c = this.convergence;
    const k = Math.min(1, this.chargeT / SCORE_SYNC.beam);
    for (let i = 0; i < this.admirals.length; i++) {
      const e = this.admirals[i];
      // 4.7D.1: jede Aura steigt vom VORDEREN Deck auf (Bug zeigt zur Krone) und strömt von dort in den Kern
      const p = bowDeck(e.ship.x, e.ship.z, e.ship.heading, e.ship.cls.L, e.ship.model.deckY, FLEET.scale, _bow);
      const y = h.waterY(p.x, p.z) + p.y;
      vfx.bolt(p.x, y, p.z, c.x, c.y, c.z, ADM_COL[i], 1.6 + k * 1.6, 0.14, { branches: 1 });
      if (Math.floor(this.chargeT * 2) !== Math.floor(t0 * 2)) vfx.spiral(p.x, y - 3, p.z, 5, 16 + k * 14, ADM_COL[i], 0.6, 2, 6);
    }
    // Kern: sieben farbige Schalen um einen kleinen weißen Kern, die gegeneinander rotieren und wachsen; dazu Farbbänder, die einströmen
    for (let i = 0; i < 7; i++) {
      const r = 1.6 + k * 4.6 + i * 0.55;
      b.reset().at(c.x, c.y, c.z).rot(this.chargeT * (1 + i * 0.3), i * 0.45, i * 0.8).spin(2.5 + i * 0.6, 1.2).size(r, r * 0.92, r, r * 1.12, r * 1.04, r * 1.12).span(0.25).col(ADM_COL[i], 0.75 + 0.55 * k).fade(0.04, 0.12);
      fx.emit('orb');
    }
    b.reset().at(c.x, c.y, c.z).size(0.6 + k * 1.6, 0.6 + k * 1.6, 0.6 + k * 1.6).span(0.2).col(C_WHITE, 1.6 + k).fade(0.02, 0.1);
    fx.emit('orb');
    if (Math.floor(this.chargeT * 3) !== Math.floor(t0 * 3)) { const i = Math.floor(this.chargeT * 3) % 7; vfx.spiral(c.x, c.y - 4 - k * 3, c.z, 3 + k * 4, 8 + k * 6, ADM_COL[i], 0.5, 2, 9); }
    if (k > 0.5) vfx.burst('spark', c.x, c.y, c.z, 6, 14 * k, ADM_COL[Math.floor(this.chargeT * 10) % 7], { up: 0, size: 0.5, life: 0.3 });
  }

  /** Der Strahl löst sich: vom Kern durch die Schwarze Krone, Bug bis Heck, und weit darüber hinaus */
  private fireBeam() {
    const h = this.host, ship = h.ship();
    const c = this.convergence;
    const fx = Math.sin(ship.heading), fz = Math.cos(ship.heading);
    // Richtung: vom Kern zurück zur Schwarzen Krone (gegen ihre Fahrtrichtung)
    this.beam.t = 0; this.beam.x = c.x; this.beam.y = c.y; this.beam.z = c.z; this.beam.dx = -fx; this.beam.dz = -fz;
    this.beam.len = Math.hypot(ship.x - c.x, ship.z - c.z) + ship.cls.L * 0.5 + 260;
    this.beam.split = false;
    // 4.7D.1: im Schussmoment entladen sich die sieben Auren sichtbar von den Bugdecks in den Kern – der Strahl kommt von vorn aus der Reihe
    {
      const vfx = h.vfx();
      for (let i = 0; i < this.admirals.length; i++) {
        const e = this.admirals[i];
        const p = bowDeck(e.ship.x, e.ship.z, e.ship.heading, e.ship.cls.L, e.ship.model.deckY, FLEET.scale, _bow);
        const y = h.waterY(p.x, p.z) + p.y;
        vfx.bolt(p.x, y, p.z, c.x, c.y, c.z, ADM_COL[i], 4.2, 0.32, { branches: 2 });
        vfx.pressureRing(p.x, y, p.z, e.ship.heading, true, 9, ADM_COL[i], 0.4);
      }
    }
    h.impact(3);
    h.shake(1);
    this.fovPunch = 1;
    this.ui.banner(JUDGMENT_NAME, 'Die sieben Admirale bündeln ihre Kräfte');
    audio.play('thunderClap', 1); audio.play('eruption', 1);
    this.moving = false;
    ship.speed = 0;
  }

  /** Kopf des Strahls (Welt) zur Zeit seit dem Schuss */
  private beamHead(out: Vector3): Vector3 {
    const b = this.beam, s = Math.min(b.len, Math.max(0, b.t) * BEAM_RIDE.speed);
    const ship = this.host.ship();
    // der Strahl senkt sich auf Deckshöhe: so teilt er das Schiff mittig der Länge nach
    const yDeck = ship.model.deckY + 0.8;
    const k = Math.min(1, s / Math.max(1, this.beam.len - ship.cls.L - 260));
    return out.set(b.x + b.dx * s, b.y + (yDeck - b.y) * smooth(k), b.z + b.dz * s);
  }

  private stepBeam(dt: number) {
    const b = this.beam;
    if (b.t < 0) return;
    const t0 = b.t;
    b.t += dt * (this.director.timeScale < 1 ? 0.6 : 1);
    const h = this.host, fx = h.fx(), br = fx.brush, vfx = h.vfx();
    const head = this.beamHead(_w);
    // Strahlkörper: sieben farbige Schichten um einen weißen Kern, vom Kern bis zum Kopf (alle 0,05 s nachgelegt)
    if (Math.floor(b.t / 0.05) !== Math.floor(t0 / 0.05) && b.t < 3.2) {
      const len = Math.hypot(head.x - b.x, head.y - b.y, head.z - b.z);
      const yaw = Math.atan2(b.dx, b.dz), pitch = Math.PI / 2 + Math.atan2(head.y - b.y, Math.hypot(head.x - b.x, head.z - b.z));
      for (let i = 0; i < 7; i++) {
        const r = 2.2 + (6 - i) * 0.55;
        br.reset().at(b.x, b.y, b.z).rot(yaw, pitch).spin(0, 0, 4 + i).size(r, len, r, r * 1.1, len, r * 1.1).span(0.12).col(ADM_COL[i], 1.6).fade(0.01, 0.06);
        fx.emit('column');
      }
      br.reset().at(b.x, b.y, b.z).rot(yaw, pitch).size(1.2, len, 1.2).span(0.12).col(C_WHITE, 3.2).fade(0.01, 0.06);
      fx.emit('column');
      vfx.machCone(head.x, head.y, head.z, b.dx, 0, b.dz, 14, 6, C_WHITE, 0.08);
    }
    // Gischt entlang der Schneise
    if (Math.floor(b.t / 0.08) !== Math.floor(t0 / 0.08) && b.t < 2.4) vfx.burst('drop', head.x, h.waterY(head.x, head.z) + 0.5, head.z, 16, 12, C_FOAM, { up: 10, size: 0.5 });
    // der Kopf erreicht den Bug: das Schiff zerteilt sich (Regie-Takt `spaltung` setzt Graben und Zerteilung)
    const ship = h.ship();
    const dBow = (ship.x + Math.sin(ship.heading) * ship.cls.L * 0.5 - b.x) * b.dx + (ship.z + Math.cos(ship.heading) * ship.cls.L * 0.5 - b.z) * b.dz;
    const sHead = Math.max(0, b.t) * BEAM_RIDE.speed;
    if (!b.split && sHead >= dBow) this.splitShip();
    // Graben: öffnet sich hinter dem Kopf, steht, schließt sich nach der Szene
    if (b.trenchT >= 0) {
      b.trenchT += dt;
      const open = smooth(b.trenchT / BEAM_RIDE.open);
      const close = this.director.scene === 'schwur' ? 1 - smooth((this.director.state.sceneT - 6) / 4) : 1;
      h.setTrench(b.ax, b.az, b.bx, b.bz, BEAM_RIDE.half, BEAM_RIDE.depth * open * Math.max(0, close));
      if (this.seabed) this.seabed.visible = open > 0.2 && close > 0.05 && !this.sb.under;
      // schäumende Grabenwände
      this.sprayT -= dt;
      if (this.sprayT <= 0 && close > 0.3) {
        this.sprayT = 0.07;
        const u = this.rnd(), side = this.rnd() < 0.5 ? -1 : 1;
        const x = b.ax + (b.bx - b.ax) * u + b.dz * side * BEAM_RIDE.half * 1.05, z = b.az + (b.bz - b.az) * u - b.dx * side * BEAM_RIDE.half * 1.05;
        vfx.burst('drop', x, -2, z, 8, 7, C_FOAM, { up: 6, size: 0.6, life: 1.2 });
        if (this.rnd() < 0.4) vfx.burst('mist', x, 1, z, 3, 2, C_FOAM, { up: 2, size: 5, life: 2.4 });
      }
    }
  }

  /** Die Schwarze Krone teilt sich der Länge nach; das Meer spaltet sich bis auf den Grund */
  private splitShip() {
    const b = this.beam, h = this.host, ship = h.ship();
    if (b.split) return;
    b.split = true;
    if (!ship.split) ship.splitApart('length', 7);
    ship.fire = 0;
    ship.sinking = 0.02;
    // Graben entlang der Schneise: vom Kern bis weit hinter das Heck
    b.ax = b.x + b.dx * 20; b.az = b.z + b.dz * 20;
    b.bx = b.x + b.dx * b.len; b.bz = b.z + b.dz * b.len;
    b.trenchT = 0;
    if (this.seabed) {
      this.seabed.position.set(b.ax, 0, b.az);
      this.seabed.rotation.y = Math.atan2(b.dx, b.dz);
      this.seabed.scale.set(1, 1, Math.max(0.2, Math.hypot(b.bx - b.ax, b.bz - b.az) / 620));
    }
    h.impact(2);
    h.shake(1);
    audio.play('impactCrack', 1); audio.play('sink', 1);
    // die Crew wird über Bord geschleudert
    if (this.crew) {
      for (const v of this.crewViews) {
        const side = v.tx >= 0 ? 1 : -1;
        this.crew.fall(v, v.heads, { flingX: side, flingZ: 0, flingP: 9 + this.rnd() * 5 });
        v.heads = 0;
      }
    }
    // Schwarzbart taumelt
    this.schwarzbart?.playClip('Hit_B', { loop: false, fade: 0.08 });
  }

  /** Slow-Motion-Sturz: Trümmer, Crew und die Figur fallen ins Wasser */
  private startFall() {
    const h = this.host, f = h.foot(), ship = h.ship();
    const vfx = h.vfx();
    for (let k = 0; k < 6; k++) vfx.burst('splinter', ship.x + (this.rnd() - 0.5) * 20, ship.model.deckY + 2, ship.z + (this.rnd() - 0.5) * 30, 14, 9, C_SMOKE, { up: 7, size: 0.6, life: 3 });
    if (!f) return;
    const fx = this.fall;
    fx.t = 0; fx.splashed = false;
    fx.x0 = f.x; fx.y0 = f.y; fx.z0 = f.z;
    const side = this.deckGoal.lx >= 0 ? 1 : -1;
    const rx = Math.cos(ship.heading) * side, rz = -Math.sin(ship.heading) * side;
    fx.x1 = f.x + rx * (ship.cls.W * 0.5 + 9); fx.z1 = f.z + rz * (ship.cls.W * 0.5 + 9);
    fx.y1 = h.waterY(fx.x1, fx.z1) - 1.4;
    fx.yaw = Math.atan2(rx, rz);
    fx.sinkY = fx.y1;
    h.player()?.playClip('Death_A', { loop: false, fade: 0.15 });
    h.player()?.setMood('ko', 1);
    audio.heartbeat(0.7);
  }

  /** Unter Wasser: Kamera taucht ab (Licht und Klang der Tiefe) */
  private underwater(on: boolean) {
    this.sb.under = on;
    if (on && this.seabed) this.seabed.visible = false;
    if (on) audio.play('splash', 1);
  }

  // ---------- Szene 6: Schwarzbarts Schwur ----------

  /** Schwarzbart im sinkenden Wrack unter Wasser, Luftblasen steigen */
  private placeUnderwater() {
    const c = this.schwarzbart, ship = this.host.ship();
    if (!c) return;
    this.sb.under = true;
    this.sb.sink = 0;
    // neben der Steuerbord-Hälfte, 9 m unter der Oberfläche
    const rx = Math.cos(ship.heading), rz = -Math.sin(ship.heading);
    this.sb.x = ship.x - rx * 6; this.sb.z = ship.z - rz * 6;
    this.sb.y = -9;
    this.sb.yaw = ship.heading + Math.PI / 2;
    c.place(this.sb.x, this.sb.y, this.sb.z, this.sb.yaw);
    c.setMood('erschoepft', 1);
    c.playClip('Ranged_Magic_Raise', { loop: false, fade: 0.3 });
    c.holder.visible = true;
  }

  private gather() {
    const c = this.schwarzbart, vfx = this.host.vfx();
    if (!c) return;
    c.setMood(SCHWARZBART_FACE.schwur, 1);
    c.playClip('Ranged_Magic_Summon', { loop: false, fade: 0.15 });
    vfx.auraSwirl(this.sb.x, this.sb.y + 2.2, this.sb.z, C_DARK, C_INK, 2.2, 0.6);
    vfx.burst('drop', this.sb.x, this.sb.y + 1, this.sb.z, 30, 3, C_BUBBLE, { up: 2.5, grav: -4, size: 0.2, life: 2.5, spread: 2 });
  }

  /** „ES WIRD JEMAND KOMMEN, DER EUCH AUFHÄLT!“ – schwarze Willenskraft-Druckwelle */
  private oathShock() {
    const h = this.host, vfx = h.vfx(), fx = h.fx(), b = fx.brush, c = this.schwarzbart;
    c?.setMood(SCHWARZBART_FACE.schrei, 1);
    const x = this.sb.x, y = this.sb.y + 2.4, z = this.sb.z;
    for (let k = 0; k < 3; k++) {
      vfx.pressureRing(x, y, z, 0, false, 18 + k * 14, C_DARK, 0.7 + k * 0.2);
      b.reset().at(x, y - 2, z).size(2, 4, 2, 40 + k * 20, 14, 40 + k * 20).span(0.9 + k * 0.2, k * 0.1).col(C_INK, 1).fade(0.02, 0.5);
      fx.emit('arcInk');
    }
    vfx.pressureRing(x, y, z, this.sb.yaw, true, 14, C_DARK, 0.8);
    vfx.corona(x, y, z, this.sb.yaw, 6, C_DARK, C_WHITE, 0.9);
    vfx.burst('drop', x, y, z, 80, 9, C_BUBBLE, { up: 4, grav: -5, size: 0.25, life: 3, spread: 3 });
    h.impact(3);
    h.shake(1);
    this.fovPunch = 1;
    audio.play('voidRumble', 1);
    audio.play('roar', 0.9);
  }

  /** Admiral i: die Aura weicht zurück, das Schiff krängt unter der Druckwelle */
  private recoil(i: number) {
    const e = this.admirals[i], h = this.host;
    if (!e) return;
    this.glowOn[i] = true;
    e.ship.kick(0.32);
    const y = h.waterY(e.ship.x, e.ship.z);
    h.vfx().pressureRing(e.ship.x, y + 6, e.ship.z, 0, false, 46, C_DARK, 0.6);
    const fx = h.fx(), b = fx.brush;
    // die Aura bricht ein: Säule und Lichthof schrumpfen
    b.reset().at(e.ship.x, y + 4, e.ship.z).size(7, 70, 7, 1.5, 12, 1.5).span(0.75).col(ADM_COL[i], 2).fade(0.02, 0.4);
    fx.emit('column');
    b.reset().at(e.ship.x, y + 20, e.ship.z).size(40, 34, 40, 8, 6, 8).span(0.75).col(ADM_COL[i], 1).fade(0.02, 0.4);
    fx.emit('orb');
    if (i === 6) this.auraK = 0.35;
  }

  private startSinking() {
    const f = this.host.foot();
    if (!f) return;
    this.fall.t = Math.max(this.fall.t, 2);
    this.fall.splashed = true;
    this.fall.sinkY = Math.min(f.y, -2.5);
  }

  // ---------- Szene 7: Erwachen am Strand von Ankerglück ----------

  private toBeach() {
    const h = this.host;
    // Prolog-Bühne weg, Einführung an: das Spiel setzt die Figur in den Sand von Ankerglück (Morgen, klar)
    this.fall.t = -1;
    this.sb.under = false;
    h.setTrench(0, 0, 0, 0, 0, 0);
    this.beam.t = -1; this.beam.trenchT = -1;
    this.chargeT = -1;
    this.clearSea();
    // die geteilte Schwarze Krone ist Geschichte: kein Wrack-Zustand bleibt am Schiff des Spielstands hängen
    h.ship().clearWreck();
    this.ui.beach();
    const f = h.foot(), p = h.player();
    if (f) {
      const yaw = f.yaw;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      this.pov.x = f.x + fx * 0.75; this.pov.z = f.z + fz * 0.75;
      this.pov.y = h.groundY(f.x, f.z, f.y + 2) + 0.28;
      if (!Number.isFinite(this.pov.y)) this.pov.y = f.y + 0.3;
      this.pov.yaw = yaw;
    }
    this.pov.t = 0;
    if (p) { p.playClip('Lie_Idle', { loop: true, fade: 0 }); p.setMood('erschoepft', 1); p.holder.visible = false; }
    this.ui.eyelids(1); this.ui.blur(EYE_BLUR[0][1]);
    audio.scoreActive(false);
    this.score?.dispose(0.3);
    this.score = null;
  }

  private stepPov() {
    if (this.director.scene !== 'erwachen') return;
    const t = this.director.state.sceneT;
    this.pov.t = t;
    this.ui.eyelids(keyed(EYELIDS, t));
    this.ui.blur(keyed(EYE_BLUR, t));
  }

  private standUp() {
    const p = this.host.player();
    if (!p) return;
    p.holder.visible = true;
    p.setMood('erschoepft', 0.6);
    p.playClip('Lie_StandUp', { loop: false, fade: 0.1, onDone: () => p.playClip('Idle_A', { loop: true, fade: 0.3 }) });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 3. Logik in Spielzeit
  // ---------------------------------------------------------------------------------------------------------------

  /** Logikschritt (Spielzeit, mit Zeitlupe) */
  update(dt: number) {
    if (this.ended) return;
    const h = this.host, ship = h.ship(), f = h.foot();
    // das Flaggschiff geht im Sturm nicht unter, bis der Strahl es teilt; die Figur verliert den Prolog nie
    if (!ship.split) { ship.hull = ship.maxHull; ship.fire = 0; }
    if (f && f.hp < f.maxHp * 0.6) f.hp = f.maxHp * 0.6;
    // Sturmjagd: die Schwarze Krone fährt geradeaus, die Figur läuft auf dem Deck mit
    if (this.moving && !ship.split) {
      ship.prev.x = ship.x; ship.prev.z = ship.z; ship.prev.heading = ship.heading;
      ship.speed = FLAGSHIP.speed;
      const dx = Math.sin(ship.heading) * FLAGSHIP.speed * dt, dz = Math.cos(ship.heading) * FLAGSHIP.speed * dt;
      ship.x += dx; ship.z += dz;
      if (f && this.fall.t < 0) h.shiftFoot(dx, dz, this.scriptedFoot);
      // die Admirale weichen im gleichen Tempo aus (Abstand bleibt)
      for (const e of this.admirals) { e.ship.prev.x = e.ship.x; e.ship.prev.z = e.ship.z; e.ship.x += dx; e.ship.z += dz; }
      this.convergence.x += dx; this.convergence.z += dz;
      if (this.deckGoal.set) { this.deckGoal.x += dx; this.deckGoal.z += dz; }
      // Gischt am Bug
      this.fxT -= dt;
      if (this.fxT <= 0) {
        this.fxT = 0.18;
        const bx = ship.x + Math.sin(ship.heading) * ship.cls.L * 0.48, bz = ship.z + Math.cos(ship.heading) * ship.cls.L * 0.48;
        h.vfx().burst('drop', bx, h.waterY(bx, bz) + 1, bz, 10, 7, C_FOAM, { up: 6, size: 0.5, life: 1 });
      }
    } else if (!this.preparing && this.director.scene !== 'urteil' && this.director.scene !== 'schwur' && !ship.split) { ship.speed = 0; ship.throttle = 0; }
    // Deck: steht die Figur an ihrer Kanone?
    if (f && this.deckGoal.set && this.director.playable) {
      this.geo.reached = Math.hypot(f.x - this.deckGoal.x, f.z - this.deckGoal.z) < 1.7;
      this.goalRingT -= dt;
      if (this.goalRingT <= 0) {
        this.goalRingT = 0.7;
        const fx = h.fx(), b = fx.brush;
        const y = h.groundY(this.deckGoal.x, this.deckGoal.z, ship.model.deckY + 3) + 0.08;
        b.reset().at(this.deckGoal.x, y, this.deckGoal.z).size(0.4, 1, 0.4, 1.6, 1, 1.6).span(0.7).col(C_GOLD, 2).fade(0.05, 0.3).spin(2);
        fx.emit('ring');
      }
    }
    // über die Reling gesprungen oder vom Deck gefallen: zurück an Deck (im Sturm gibt es kein Schwimmen)
    if (f && this.director.playable && this.ownDg && (!h.deck() || f.y < h.waterY(f.x, f.z) + 0.3)) {
      const p = this.ownDg.world(this.deckStart.lx, this.deckStart.lz);
      h.placeFoot(p.x, p.z, ship.heading);
      this.say('hinweis');
    }
    this.stepCrew(dt);
    this.stepRaid(dt);
    this.stage?.update(dt, (x, z) => h.waterY(x, z));
    this.stepSchwarzbart(dt);
    this.stepFall(dt);
    this.stepUnderwater(dt);
    this.stepDelayed(dt);
  }

  private stepCrew(dt: number) {
    const tr = this.crew;
    if (!tr) return;
    for (const v of this.crewViews) {
      if (v.move > 0) {
        const dx = v.tx - v.x, dz = v.tz - v.z, d = Math.hypot(dx, dz);
        if (d < 0.15) { v.move = 0; v.x = v.tx; v.z = v.tz; v.yaw = v.tx >= 0 ? Math.PI / 2 : -Math.PI / 2; continue; }
        const s = Math.min(d, 5.5 * dt);
        v.x += (dx / d) * s; v.z += (dz / d) * s;
        v.yaw = Math.atan2(dx, dz);
      }
      if (v.gunner && v.move === 0 && this.director.scene === 'gegenangriff' && this.rnd() < dt * 0.3) v.pulse = 1;
      if (v.pulse > 0) v.pulse = Math.max(0, v.pulse - dt * 2);
    }
    tr.update(this.crewViews, this.director.state.t, dt);
  }

  private stepRaid(dt: number) {
    if (this.raidMarine?.root.visible) {
      for (const v of this.raidViews.m) {
        // landeinwärts gegen die Bürgerwehr
        v.x -= Math.sin(this.town.h) * dt * 1.6; v.z -= Math.cos(this.town.h) * dt * 1.6;
        if (this.rnd() < dt * 2) v.pulse = 1;
        if (v.pulse > 0) v.pulse = Math.max(0, v.pulse - dt * 2.5);
      }
      for (const v of this.raidViews.w) {
        if (this.rnd() < dt * 1.5) v.pulse = 1;
        if (v.pulse > 0) v.pulse = Math.max(0, v.pulse - dt * 2.5);
        // Verluste der Bürgerwehr
        if (v.heads > 0 && this.rnd() < dt * 0.6) { this.raidWehr!.fall(v, 1, { flingX: Math.sin(this.town.h), flingZ: Math.cos(this.town.h), flingP: 4 }); v.heads--; }
      }
      this.raidMarine.update(this.raidViews.m, this.director.state.t, dt);
    }
    if (this.raidWehr?.root.visible) this.raidWehr.update(this.raidViews.w, this.director.state.t, dt);
  }

  private stepSchwarzbart(dt: number) {
    const c = this.schwarzbart;
    if (!c) return;
    if (this.sb.under) {
      // sinkt langsam, die Luftblasen steigen
      this.sb.sink += dt;
      const y = this.sb.y - this.sb.sink * 0.25;
      c.place(this.sb.x, y, this.sb.z, this.sb.yaw);
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) { this.bubbleT = 0.18; this.host.vfx().burst('drop', this.sb.x + (this.rnd() - 0.5) * 1.2, y + 2.6, this.sb.z + (this.rnd() - 0.5) * 1.2, 3, 0.8, C_BUBBLE, { up: 2.2, grav: -3.5, size: 0.14, life: 2.6 }); }
    } else if (!this.preparing && this.director.scene !== 'gruenmarkt' && this.director.scene !== 'sturmfront' && this.director.scene !== 'vernichtung') {
      if (!this.host.ship().split) this.placeSchwarzbart();
    }
    c.update(dt);
    // dunkle Aura um den Kapitän an Bord
    if (!this.sb.under && this.director.scene === 'gegenangriff' && Math.floor(this.director.state.t * 5) !== Math.floor((this.director.state.t - dt) * 5)) {
      this.host.vfx().auraSwirl(this.sb.x, this.sb.y + 2.2, this.sb.z, C_DARK, C_INK, 0.7, 0.18);
    }
  }

  /** Sturz der Figur (Bogen ins Wasser) und Sinken in die Tiefe */
  private stepFall(dt: number) {
    const F = this.fall;
    if (F.t < 0) return;
    const h = this.host;
    F.t += dt;
    if (F.t < 1.6) {
      const k = F.t / 1.6;
      const y = F.y0 + (F.y1 - F.y0) * k + Math.sin(k * Math.PI) * 5;
      h.poseFoot(F.x0 + (F.x1 - F.x0) * k, y, F.z0 + (F.z1 - F.z0) * k, F.yaw);
      return;
    }
    if (!F.splashed) {
      F.splashed = true;
      const wy = h.waterY(F.x1, F.z1);
      h.vfx().surfaceHit(F.x1, wy, F.z1, 3, C_WHITE, 1);
      h.vfx().burst('drop', F.x1, wy + 0.5, F.z1, 30, 7, C_FOAM, { up: 7, size: 0.35 });
      audio.play('splash', 1, { x: F.x1, z: F.z1 });
    }
    // langsam in die Tiefe sinken
    F.sinkY -= dt * (this.director.scene === 'schwur' ? 0.55 : 0.8);
    h.poseFoot(F.x1, F.sinkY, F.z1, F.yaw);
  }

  /** Unterwasser: Lichtstrahlen fallen von oben, Blasen steigen um die Kamera */
  private stepUnderwater(dt: number) {
    const sc = this.director.scene;
    if (!this.sb.under && !(sc === 'urteil' && this.director.state.sceneT > 16.4)) return;
    const vfx = this.host.vfx(), fx = this.host.fx(), b = fx.brush;
    this.rayT -= dt;
    if (this.rayT <= 0) {
      this.rayT = 0.35;
      const warm = sc === 'schwur' && this.director.state.sceneT > 15.2;
      const cx = this.camLook.x + (this.rnd() - 0.5) * 18, cz = this.camLook.z + (this.rnd() - 0.5) * 18;
      b.reset().at(cx, 2, cz).rot(this.rnd() * TAU, Math.PI + 0.25 + this.rnd() * 0.2).size(0.6, 30, 0.6, 1.4 + this.rnd(), 34, 1.4).span(2.4).col(warm ? C_RAY_WARM : C_RAY, 0.55).fade(0.8, 0.9);
      fx.emit('column');
    }
    this.bubbleT -= dt * 0.5;
    if (this.bubbleT <= 0) { this.bubbleT = 0.25; vfx.burst('drop', this.camLook.x + (this.rnd() - 0.5) * 6, this.camLook.y - 3, this.camLook.z + (this.rnd() - 0.5) * 6, 4, 1, C_BUBBLE, { up: 2, grav: -3, size: 0.12, life: 3 }); }
  }

  // ---------- kleine Zeitgeber (Einschläge nach Flugzeit) ----------
  private readonly timers: { t: number; f: () => void }[] = [];
  private delayed(t: number, f: () => void) { if (this.timers.length < 64) this.timers.push({ t, f }); }
  private stepDelayed(dt: number) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t > 0) continue;
      this.timers.splice(i, 1);
      tm.f();
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 4. Kamera
  // ---------------------------------------------------------------------------------------------------------------

  private setShot(id: string, v = 0) {
    this.shotId = id;
    this.shotV = v;
    this.shotT = 0;
    // 4.7D.1: jede neue Einstellung ist ein Schnitt – die Glättung übernimmt den ersten Stand ohne Übergang
    this.damp.cut();
    // neue Kopf-Nahaufnahme: der geglättete Kopf springt an den echten (sonst gleitet die Kamera vom letzten Stand heran)
    this.headFresh = true;
  }

  /** Rahmen einer Einstellung (Welt) */
  private frameOf(f: ShotFrame, out: { x: number; z: number; h: number; y: number }) {
    const ship = this.host.ship();
    switch (f) {
      case 'stadt': out.x = this.town.x; out.z = this.town.z; out.h = this.town.h; out.y = 0; break;
      case 'schiff': out.x = ship.x; out.z = ship.z; out.h = ship.heading; out.y = 0; break;
      case 'kapitaen': out.x = this.sb.x; out.z = this.sb.z; out.h = ship.heading; out.y = this.sb.y; break;
      case 'kern': out.x = this.convergence.x; out.z = this.convergence.z; out.h = ship.heading + Math.PI; out.y = this.convergence.y; break;
      case 'tiefe': out.x = this.sb.x; out.z = this.sb.z; out.h = this.sb.yaw; out.y = this.sb.y - this.sb.sink * 0.25; break;
      case 'figur': { const p = this.host.foot(); out.x = p?.x ?? ship.x; out.z = p?.z ?? ship.z; out.h = ship.heading; out.y = p?.y ?? 0; break; }
      case 'kopf': out.x = this.headS.x; out.z = this.headS.z; out.h = ship.heading; out.y = this.headS.y; break;
    }
    return out;
  }

  /**
   * Kopf-Knochen Schwarzbarts, geglättet (Nahaufnahmen folgen dem Gesicht ohne Zittern); `fresh` springt sofort. Geglättet wird die Lage
   * RELATIV zu seinem Standort an Deck – das Schiff fährt 8,5 m/s, eine Glättung in Weltkoordinaten hing über einen Meter hinterher.
   */
  private readonly headS = new Vector3();
  private readonly headRel = new Vector3();
  private headFresh = true;
  private followHead(dt: number) {
    const b = this.schwarzbart?.sockets?.bone('head');
    if (b) { b.getWorldPosition(_hd); _hd.x -= this.sb.x; _hd.y -= this.sb.y; _hd.z -= this.sb.z; } else _hd.set(0, 2.97, 0);
    if (this.headFresh || !Number.isFinite(this.headRel.x + this.headRel.y + this.headRel.z)) { this.headRel.copy(_hd); this.headFresh = false; }
    else this.headRel.lerp(_hd, 1 - Math.exp(-Math.max(0, dt) * 7));
    this.headS.set(this.sb.x + this.headRel.x, this.sb.y + this.headRel.y, this.sb.z + this.headRel.z);
  }
  private readonly fr = { x: 0, z: 0, h: 0, y: 0 };
  /** 4.7D.1: Glättung der Regie-Kamera (Blickrichtung, Sichtfeld) und ob sie im letzten Bild führte (sonst ist das nächste Bild ein Schnitt) */
  private readonly damp = new CineDamp();
  private camLive = false;
  private camWas = false;

  /** Kamera setzen, solange die Regie sie führt (alles außer dem spielbaren Teil der Deck-Szene); liefert true, wenn übernommen */
  camera(cam: PerspectiveCamera, frameDt: number): boolean {
    this.camLive = this.camWas;
    this.camWas = false;
    if (this.ended) return false;
    if (!this.preparing && this.playable) return false;
    const sc = this.director.scene;
    // nach „gefechtsbereit“ bis zum Schnitt: Fußkamera
    if (!this.preparing && sc === 'gegenangriff' && this.director.state.play) return false;
    const id = this.shotId;
    if (!id) return false;
    this.camWas = true;
    const shot = this.shots.get(id);
    if (shot?.def.frame === 'kopf') this.followHead(frameDt);
    if (shot) this.splineCam(shot, cam);
    else if (!this.dynamicCam(id, cam)) return false;
    // 4.7D.1: butterweich – war die Regie-Kamera im letzten Bild nicht aktiv (Deck-Szene, Strand), ist das hier ein Schnitt; innerhalb einer
    // Einstellung folgen Blickrichtung und Sichtfeld einer kritisch gedämpften Feder (der Ort bleibt exakt: der Strahl-Ritt fährt 210 m/s)
    if (!this.camLive) this.damp.cut();
    this.camLive = true;
    const D = this.damp;
    D.step(frameDt, this.camLook.x - this.camPos.x, this.camLook.y - this.camPos.y, this.camLook.z - this.camPos.z, this.fov);
    const reach = Math.max(1, this.camPos.distanceTo(this.camLook));
    cam.position.copy(this.camPos);
    // Sichtfeld-Stoß als gedämpfte Schwingung (vorher sprang er beim Umschlag in einem Bild um 6,5°)
    cam.fov = D.fov + punchOffset(this.fovPunch);
    cam.lookAt(this.camPos.x + D.dx * reach, this.camPos.y + D.dy * reach, this.camPos.z + D.dz * reach);
    cam.updateProjectionMatrix();
    // Licht und Schatten folgen dem Blick (Grünmarkt liegt weit weg von der Figur)
    this.focus.copy(this.camLook);
    void frameDt;
    return true;
  }

  private splineCam(s: Shot, cam: PerspectiveCamera) {
    const d = s.def;
    const u = ease(this.shotT / d.dur, d.ease);
    s.path.getPointAt(u, _v);
    s.look.getPointAt(Math.min(1, u), _w);
    const f = this.frameOf(d.frame, this.fr);
    frameToWorld({ x: f.x, z: f.z, h: f.h }, _v.x, _v.y, _v.z, _p);
    this.camPos.set(_p.x, _p.y + f.y, _p.z);
    frameToWorld({ x: f.x, z: f.z, h: f.h }, _w.x, _w.y, _w.z, _p);
    this.camLook.set(_p.x, _p.y + f.y, _p.z);
    if (d.dolly) {
      // Vertigo: das Motiv bleibt gleich groß, während die Kamera zurückfährt – das Sichtfeld wird enger, der Hintergrund wächst
      const dd = Math.hypot(_v.x - d.dolly[0], _v.y - d.dolly[1], _v.z - d.dolly[2]);
      const t0 = Math.tan((d.fov[0] * Math.PI) / 360) * (s.d0 / Math.max(0.5, dd));
      this.fov = Math.max(d.fov[1], Math.min(d.fov[0], (Math.atan(t0) * 360) / Math.PI));
      if (dd < s.d0) this.fov = d.fov[0] + (d.fov[1] - d.fov[0]) * u;
    } else this.fov = d.fov[0] + (d.fov[1] - d.fov[0]) * u;
    if (d.shake) {
      const t = this.director.state.t, k = d.shake * 0.35;
      this.camPos.x += Math.sin(t * 23.1) * k; this.camPos.y += Math.sin(t * 19.7 + 1) * k * 0.6; this.camPos.z += Math.cos(t * 21.3) * k;
    }
    // die Kamera taucht nie unter die Wellen (außer unter Wasser)
    // 4.7D.1: weiche Untergrenze (eine Welle hebt die Kamera ohne Knick an)
    if (!this.sb.under) { const wy = this.host.waterY(this.camPos.x, this.camPos.z) + 0.8; this.camPos.y = smoothMax(this.camPos.y, wy, CINE_DAMP.waterSoft); }
    void cam;
  }

  /** Eigene Fahrten: Strahl-Ritt, Fall, Admirals-Schnitte, Sinken, Ego-Sicht, Aufstehen */
  private dynamicCam(id: string, cam: PerspectiveCamera): boolean {
    const h = this.host, ship = h.ship();
    void cam;
    switch (id) {
      case 's5_ritt': {
        // direkt hinter dem Kopf des Strahls, mitten durch die Schwarze Krone von Bug bis Heck
        const head = this.beamHead(_w);
        const b = this.beam;
        // knapp über dem Strahlkörper (sein Radius ist bis 5,5 m) und leicht seitlich: man sieht ihn vor sich ins Schiff schlagen
        this.camPos.set(head.x - b.dx * BEAM_RIDE.behind + b.dz * 3.5, head.y + BEAM_RIDE.above, head.z - b.dz * BEAM_RIDE.behind - b.dx * 3.5);
        this.camLook.set(head.x + b.dx * 46, head.y - 1.5, head.z + b.dz * 46);
        this.fov = 76;
        return true;
      }
      case 's5_fall': {
        const f = h.foot();
        const px = f?.x ?? ship.x, py = f?.y ?? 0, pz = f?.z ?? ship.z;
        // außenbords auf der Fallseite: die Figur stürzt vor den auseinanderbrechenden Hälften auf die Kamera zu
        const ox = Math.sin(this.fall.yaw), oz = Math.cos(this.fall.yaw);
        const a = this.shotT * 0.1;
        const under = this.fall.splashed && this.director.state.sceneT > 16.4;
        const cx = px + ox * 9 + Math.cos(this.fall.yaw) * (3 + a * 6), cz = pz + oz * 9 - Math.sin(this.fall.yaw) * (3 + a * 6);
        this.camPos.set(cx, under ? py + 0.6 : Math.max(h.waterY(cx, cz) + 0.9, py + 0.8), cz);
        this.camLook.set(px, py + 0.3, pz);
        this.fov = 52;
        return true;
      }
      case 's6_admiral': {
        // Untersicht an der Wasserlinie: das Schiff des Admirals als Schattenhülle vor dem Himmel, die Aura weicht zurück
        const e = this.admirals[this.shotV];
        if (!e) return false;
        const dx = ship.x - e.ship.x, dz = ship.z - e.ship.z, d = Math.hypot(dx, dz) || 1;
        const k = Math.sin(Math.min(1, this.shotT / 0.8) * Math.PI / 2);
        const dist = 175 - 22 * k;
        // seitlich nach AUSSEN versetzt (weg von der Mitte der Schlachtreihe): so steht nie ein Nachbarschiff zwischen Kamera und Admiral
        const mid = this.admirals[ADMIRALS.findIndex((a) => a.slot === 0)] ?? e;
        const px = dz / d, pz = -dx / d;
        const out = (e.ship.x - mid.ship.x) * px + (e.ship.z - mid.ship.z) * pz;
        const side = Math.abs(out) > 1 ? Math.sign(out) : this.shotV % 2 ? 1 : -1;
        this.camPos.set(e.ship.x + (dx / d) * dist + px * side * 30, h.waterY(e.ship.x, e.ship.z) + 3, e.ship.z + (dz / d) * dist + pz * side * 30);
        this.camLook.set(e.ship.x, h.waterY(e.ship.x, e.ship.z) + 24, e.ship.z);
        this.fov = 38 - 4 * k;
        this.sb.under = false;
        h.env().weather.p.rain = 1;
        return true;
      }
      case 's6_sinken': {
        // über der sinkenden Figur, Blick hinab in die Tiefe; die Lichtstrahlen fallen an ihr vorbei
        const f = h.foot();
        const px = f?.x ?? ship.x, py = f?.y ?? -6, pz = f?.z ?? ship.z;
        this.sb.under = true;
        const a = this.shotT * 0.18;
        this.camPos.set(px + Math.sin(a) * 1.4, py + 4.2, pz + Math.cos(a) * 1.4);
        this.camLook.set(px, py - 1, pz);
        this.fov = 52;
        return true;
      }
      case 's7_pov': {
        // Ego-Sicht: aus den Augen der liegenden Figur in den Morgenhimmel, leichtes Atmen
        const P = this.pov, t = this.director.state.sceneT;
        this.camPos.set(P.x, P.y + Math.sin(t * 1.3) * 0.015, P.z);
        const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
        this.camLook.set(P.x + fx * 2.4 + Math.sin(t * 0.4) * 0.3, P.y + 7, P.z + fz * 2.4);
        this.fov = 64;
        return true;
      }
      case 's7_auf': {
        // die Sicht steigt auf und zieht sich aus dem Kopf zurück in die Verfolger-Sicht
        const P = this.pov, f = h.foot();
        const k = smoother(this.shotT / 2.4);
        const px = f?.x ?? P.x, py = f?.y ?? P.y, pz = f?.z ?? P.z;
        const back = Math.sin(P.yaw), backz = Math.cos(P.yaw);
        const tx = px - back * 4.4, ty = py + 2.4, tz = pz - backz * 4.4;
        this.camPos.set(P.x + (tx - P.x) * k, P.y + (ty - P.y) * k, P.z + (tz - P.z) * k);
        this.camLook.set(P.x + back * 2 * (1 - k) + px * k - P.x * k, (P.y + 4) * (1 - k) + (py + 1.4) * k, P.z + backz * 2 * (1 - k) + pz * k - P.z * k);
        this.fov = 64 - 8 * k;
        return true;
      }
      default: return false;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Ende
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Zu einer Szene springen (Prüfungen, Entwicklung): ab Szene 4 steht die Sturmjagd (Grünmarkt verborgen, Flotte voraus), ab Szene 5 sind
   * die Geschütze besetzt. Die Musik beginnt mit dem nächsten Einsatz der Szene.
   */
  jump(id: 'gegenangriff' | 'urteil' | 'schwur' | 'erwachen') {
    if (this.preparing || this.ended) return;
    if (id !== 'erwachen') { this.toSea(); this.startChase(); }
    if (id === 'urteil' || id === 'schwur') { this.toGuns(); this.director.state.readyAt = 0; }
    this.score?.cut();
    this.director.jumpTo(id, this.out);
    for (let i = 0; i < this.out.n; i++) this.onEvent(this.out.events[i]);
    if (id === 'schwur') { this.splitShip(); this.startFall(); this.underwater(true); this.placeUnderwater(); }
  }

  /** Abbrechen ohne Meldung (Rückkehr ins Hauptmenü) */
  abort() {
    if (this.ended) return;
    this.silent = true;
    this.finish(true);
  }

  /** Prolog überspringen (Schaltfläche) */
  skip() {
    if (this.ended) return;
    this.director.skip(this.out);
    this.finish(true);
  }

  /** Bühne auf hoher See abbauen (Szene 7 beginnt am Strand) */
  private clearSea() {
    const nav = this.host.naval();
    if (nav) for (const e of [...this.admirals, ...this.frigates]) if (nav.enemies.includes(e)) nav.removeEventShip(e);
    this.admirals.length = 0; this.frigates.length = 0;
    if (this.crew) { this.crew.dispose(); this.crew = null; }
    this.crewViews.length = 0;
    for (const t of [this.raidMarine, this.raidWehr]) t?.dispose();
    this.raidMarine = null; this.raidWehr = null;
    if (this.schwarzbart) { this.schwarzbart.holder.removeFromParent(); this.schwarzbart.dispose(); this.schwarzbart = null; }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
    this.host.lightCarriers(this.carriers, false);
    for (const c of this.carriers) c.removeFromParent();
    this.carriers.length = 0;
    if (this.seabed) { this.seabed.removeFromParent(); disposeObject(this.seabed); this.seabed = null; }
    this.timers.length = 0;
    const env = this.host.env();
    env.weather.hold(null);
    env.grade.k = 0;
    env.timeSpeed = 1;
    this.moving = false;
  }

  private finish(skipped: boolean) {
    if (this.ended) return;
    this.ended = true;
    const h = this.host;
    this.clearSea();
    h.setTrench(0, 0, 0, 0, 0, 0);
    glowHub.removeOwner(this);
    const ship = h.ship();
    ship.clearWreck();
    this.score?.dispose(skipped ? 0.5 : 1.2);
    this.score = null;
    audio.scoreActive(false);
    audio.prologueAmbience(null);
    const p = h.player();
    if (p) p.holder.visible = true;
    this.ui.loading(-1);
    this.ui.letterbox(0); this.ui.blackout(0); this.ui.eyelids(0); this.ui.blur(0); this.ui.goal('');
    if (!this.silent) h.finished(skipped);
  }
}

