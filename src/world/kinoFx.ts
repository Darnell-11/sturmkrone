// Phase 4.93A – Welt-Effekte der Kino-Endgame-Regie (Kategorie 1: beide Faustkämpfer-Pfade, dazu das Stufe-101-Ultimate „Himmelssturz“).
// Alles Sichtbare entsteht aus den Blender-Netzen des Effekt-Pools (`shockcone`, `barrage`, `fissure…`, `colossus…`, `shard…`) und den
// Bausteinen der `AnimeVfxForge` – dieselben beiden Shader-Programme wie bisher, nichts entsteht im Kampf (Instanz-Pools).
//
// Formen: drei Auslöser je Form – `formBuild` (Phase 1: zusammenströmende Spirale), `formRelease` (Phase 2: die Kraft löst sich und fliegt
// zum Ziel) und `formImpact` (Phase 3 + 4: Einschlag, Krater bzw. Gischt, Nachbeben). Zu Fuß ruft die Welt sie im Takt der Engine, am
// Steuerrad und für Mitspieler spielt `playForm` die ganze Form über eine kleine Warteschlange in Spielzeit ab.
// Ultimates: die Zeitachsen `stepFistStorm` („Sturmfaust der Tausend Blitze“), `stepWorldSplit` („Weltenbrecher-Erdspalter“) und
// `stepSkyfall` („Himmelssturz“) ersetzen die früheren Platzhalter-Zeitachsen der Kataklysmus-Regie.
import { Color } from 'three';
import { SHARD_ROCK_PRIMS, SHARD_TAIL_PRIMS, type CataclysmFx } from '../combat/cataclysmFx';
import type { AnimeVfxForge, BoltOpts, BurstOpts } from '../graphics/animeVfxForge';
import type { BrawlerStyleId, DirectorTimeline } from '../graphics/endgameDirector';
import { SKYFALL_COLOSSUS, SKYFALL_SHARDS, SKYFALL_TIMES } from '../data/cataclysms';
import type { ShipCut } from '../data/actionKit';
import type { EnemyShip } from '../naval/naval';
import type { Cast } from './cataclysmDirector';

/** Maße der Blender-Netze (normiert): Kegel-Radius und -Länge, Bündel-Radius und -Länge, Breite der Spalte */
const CONE_R = 1.3, CONE_L = 1.4, BARR_R = 0.9, BARR_L = 1.68, FISS_W = 0.66;

const WHITE = new Color(1, 1, 1);
const SPRAY = new Color('#DDF4FF');
const DUST = new Color(0.6, 0.54, 0.46);
const SMOKE = new Color(0.05, 0.045, 0.04);
const ROCK = new Color(0.34, 0.3, 0.27);
const TMP = new Color();
const TMP2 = new Color();

interface Pal { core: Color; acc: Color; ink: Color; rock: Color }
/** Blitz & Vakuum (blau-weiß), Tektonik (gold-bernstein), Kosmos (glutrot-violett) */
const PAL_STURM: Pal = { core: new Color('#7FD0FF'), acc: new Color('#EAF8FF'), ink: new Color(0.015, 0.045, 0.11), rock: new Color(0.6, 0.78, 1) };
const PAL_ERD: Pal = { core: new Color('#FFC860'), acc: new Color('#E08A2A'), ink: new Color(0.1, 0.045, 0.008), rock: new Color(1, 0.74, 0.5) };
const PAL_KOSMOS: Pal = { core: new Color('#FF7A3A'), acc: new Color('#B07DFF'), ink: new Color(0.06, 0.02, 0.1), rock: new Color(1, 0.7, 0.52) };
/**
 * Gestein der Meteoriten (Koloss, Vorhut): dunkler, rötlicher Basalt – die eingebrannte Glut der Furchen (Kanal R der Netze) leuchtet damit
 * gelb-orange, die Flächen bleiben fast schwarz. Mit dem hellen Schollen-Ton wirkten die Brocken wie graue Kiesel.
 */
const METEOR = new Color(0.62, 0.3, 0.19);
/** Tiefsee-Spalte: das Leuchten unter der Wasserfläche */
const DEEP = new Color('#5AD8FF');
const MAGMA = new Color('#FF8A2A');
const VIOLET = new Color('#9A5AFF');

export const palOf = (style: string): Pal => (style === 'erdspalter' ? PAL_ERD : style === 'kosmos' ? PAL_KOSMOS : PAL_STURM);

/** Was die Kino-Effekte von der Welt brauchen */
export interface KinoSurface {
  isLand(x: number, z: number): boolean;
  groundY(x: number, z: number, y: number): number;
  waterY(x: number, z: number): number;
}

/** Was die Ultimate-Zeitachsen von der Kataklysmus-Regie brauchen (Schiffe laufen nur über deren Regeln) */
export interface KinoBridge {
  readonly ships: readonly EnemyShip[];
  threat(x: number, y: number, z: number): void;
  mark(c: Cast, e: EnemyShip): void;
  shipStrike(c: Cast, e: EnemyShip, cut: Exclude<ShipCut, ''>, lift?: number, sections?: number): void;
  shipDamage(c: Cast, e: EnemyShip, k: number): void;
  wreck(e: EnemyShip, masts: number, char: number, glow?: number): void;
  areaShips(c: Cast, x: number, z: number, r: number, k: number, extra?: '' | 'fire' | 'freeze' | 'shove'): void;
  nearestUnhit(c: Cast, x: number, z: number, r: number): EnemyShip | null;
  pull(e: EnemyShip, x: number, z: number, step: number): void;
  setTrench(ax: number, az: number, bx: number, bz: number, hw: number, depth: number): void;
  shake(k: number): void;
  cracks(n: number): void;
}

/** Art der Entladung einer Form (Phase 2) – je Pfad zehn */
type Rel =
  | 'cone' | 'sickles' | 'dome' | 'dash' | 'skyBolt' | 'vortex' | 'barrage' | 'cage' | 'avatar' | 'beam'
  | 'fan' | 'armor' | 'ram' | 'hammer' | 'pillars' | 'salvo' | 'rift' | 'giant' | 'quake' | 'airball' | 'slam';
export const FORM_RELEASE: Readonly<Record<BrawlerStyleId, readonly Rel[]>> = {
  sturmfaust: ['cone', 'sickles', 'dome', 'dash', 'skyBolt', 'vortex', 'barrage', 'cage', 'avatar', 'beam'],
  erdspalter: ['cone', 'fan', 'armor', 'ram', 'hammer', 'pillars', 'salvo', 'rift', 'giant', 'quake'],
};
const relOf = (tl: DirectorTimeline): Rel =>
  tl.kind === 'auto' ? (tl.style === 'erdspalter' ? 'slam' : 'airball') : FORM_RELEASE[tl.style === 'erdspalter' ? 'erdspalter' : 'sturmfaust'][Math.max(0, Math.min(9, tl.slot - 1))];

/** Ausstehender Schritt einer abgespielten Form (vorab angelegt) */
interface Pending {
  /** Schritt: 1 Entladung einer Form, 2 Einschlag einer Form */
  on: boolean; t: number; step: 1 | 2; tl: DirectorTimeline | null;
  ox: number; oy: number; oz: number; tx: number; ty: number; tz: number; yaw: number; scale: number; sea: boolean; done: ((tl: DirectorTimeline) => void) | null;
}

const rnd = Math.random;

// Wiederverwendete Options-Objekte für alles, was je Bild oder in dichter Folge ausgestoßen wird (Aufladung, Faust-Glut, Umkreisung,
// Nachbeben): diese Pfade fordern keinen Speicher an. Die Effekt-Schmiede liest die Werte sofort und hält das Objekt nicht fest.
const BOLT_O: BoltOpts = { depth: 3, branches: 1, jitter: 0.2 };
const bo = (depth: number, branches: number, jitter: number): BoltOpts => { BOLT_O.depth = depth; BOLT_O.branches = branches; BOLT_O.jitter = jitter; return BOLT_O; };
const BURST_O: BurstOpts = {};
const bu = (up: number, size?: number, life?: number, spread?: number, grav?: number, delay?: number): BurstOpts => {
  BURST_O.up = up; BURST_O.size = size; BURST_O.life = life; BURST_O.spread = spread; BURST_O.grav = grav; BURST_O.delay = delay;
  return BURST_O;
};
const smooth = (k: number) => { const v = k < 0 ? 0 : k > 1 ? 1 : k; return v * v * (3 - 2 * v); };

export class KinoFx {
  /** Zähler für Prüfungen */
  readonly stats = { cones: 0, barrages: 0, fissures: 0, colossi: 0, shards: 0, builds: 0, releases: 0, impacts: 0, queued: 0, fistGlows: 0, deflects: 0, orbitBolts: 0, domes: 0, fountains: 0, vanguard: 0, gravity: 0 };
  /** Teilchenfaktor der Grafikstufe */
  detail = 1;
  private readonly q: Pending[] = Array.from({ length: 10 }, () => ({ on: false, t: 0, step: 1 as const, tl: null, ox: 0, oy: 0, oz: 0, tx: 0, ty: 0, tz: 0, yaw: 0, scale: 1, sea: false, done: null }));
  /** Einschläge der Vorhut (Himmelssturz): ausstehende Schiffs-Treffer je Einschlag und ihr Ort */
  private readonly shardHit = new Uint8Array(6);
  private readonly shardX = new Float32Array(6);
  private readonly shardZ = new Float32Array(6);
  private readonly shardY = new Float32Array(6);

  constructor(private readonly fx: CataclysmFx, private readonly vfx: AnimeVfxForge, private readonly surf: KinoSurface, private readonly shakeCam: (k: number) => void) {}

  private n(k: number): number { return Math.max(1, Math.round(k * this.detail)); }
  private yOf(x: number, z: number, y: number): number { return this.surf.isLand(x, z) ? this.surf.groundY(x, z, y) : this.surf.waterY(x, z); }

  // ---------------------------------------------------------------------------------------------------------------
  // Netz-Bausteine (je drei Schichten: Tusche-Mantel, leuchtender Kern, weißglühende Mitte bzw. festes Gestein + Glut)
  // ---------------------------------------------------------------------------------------------------------------

  /** Gestaffelte Mach-Luftdruckkegel: Spitze in Richtung (yaw, pitch), Ursprung des Netzes an (x, y, z); fliegt mit (vx, vy, vz) */
  cone(x: number, y: number, z: number, yaw: number, pitch: number, radius: number, length: number, p: Pal, life: number, k = 2, delay = 0, vx = 0, vy = 0, vz = 0, spin = 5) {
    const fx = this.fx, b = fx.brush, sr = radius / CONE_R, sl = length / CONE_L;
    b.reset().at(x, y, z).rot(yaw, pitch, 0).vel(vx, vy, vz).spin(0, 0, spin * 0.6).size(sr * 0.5, sr * 0.5, sl * 0.55, sr * 1.14, sr * 1.14, sl * 1.08).span(life * 1.25, delay).col(p.ink, 1).fade(0.03, 0.5);
    fx.emit('shockconeInk');
    b.reset().at(x, y, z).rot(yaw, pitch, 0.4).vel(vx, vy, vz).spin(0, 0, spin).size(sr * 0.42, sr * 0.42, sl * 0.5, sr, sr, sl).span(life, delay).col(p.core, k).fade(0.02, 0.5);
    fx.emit('shockcone');
    b.reset().at(x, y, z).rot(yaw, pitch, 1.3).vel(vx, vy, vz).spin(0, 0, -spin * 1.4).size(sr * 0.25, sr * 0.25, sl * 0.45, sr * 0.62, sr * 0.62, sl * 0.92).span(life * 0.75, delay).col(WHITE, k * 0.6).fade(0.02, 0.55);
    fx.emit('shockcone');
    this.stats.cones++;
  }

  /** Bündel aus 16 Phantom-Faust- und Blitz-Projektilen, fliegt in Richtung (yaw, pitch) mit `speed` */
  barrage(x: number, y: number, z: number, yaw: number, pitch: number, radius: number, length: number, p: Pal, life: number, k = 2, delay = 0, speed = 0, roll = 0) {
    const fx = this.fx, b = fx.brush, sr = radius / BARR_R, sl = length / BARR_L;
    const cp = Math.cos(pitch), vx = Math.sin(yaw) * cp * speed, vy = -Math.sin(pitch) * speed, vz = Math.cos(yaw) * cp * speed;
    b.reset().at(x, y, z).rot(yaw, pitch, roll).vel(vx, vy, vz).spin(0, 0, 0.9).size(sr * 1.12, sr * 1.12, sl * 1.05).span(life * 1.1, delay).col(p.ink, 1).fade(0.05, 0.4);
    fx.emit('barrageInk');
    b.reset().at(x, y, z).rot(yaw, pitch, roll).vel(vx, vy, vz).spin(0, 0, 0.9).size(sr * 0.8, sr * 0.8, sl * 0.8, sr, sr, sl).span(life, delay).col(p.core, k).fade(0.04, 0.35);
    b.flicker = 0.12;
    fx.emit('barrage');
    this.stats.barrages++;
  }

  /**
   * Tektonische Spalte ab (x, y, z) in Richtung yaw: reißt in `grow` s auf (`length` m lang, `width` m breit) und steht dann `life` s.
   * `rock` = Schollenplatten mitzeichnen (an Land), `glow` = Farbe der Glut (Magma bzw. Tiefsee-Leuchten).
   */
  fissure(x: number, y: number, z: number, yaw: number, length: number, width: number, glow: Color, rock: Color | null, life: number, grow = 0.3, k = 1.8, delay = 0) {
    const fx = this.fx, b = fx.brush, sw = width / FISS_W, h = sw * 1.1, g = Math.max(0.06, grow);
    if (rock) {
      // aufreißen (wächst nach vorn), dann stehen – das feste Gestein dunkelt am Ende ab wie erkaltende Lava
      b.reset().at(x, y + 0.02, z).rot(yaw).size(sw, h, length * 0.06, sw, h, length).span(g, delay).col(rock, 1).fade(0.02, 0);
      fx.emit('fissureRock');
      b.reset().at(x, y + 0.02, z).rot(yaw).size(sw, h, length).span(Math.max(0.2, life - g), delay + g).col(rock, 1).fade(0, 0.3);
      fx.emit('fissureRock');
    }
    b.reset().at(x, y + 0.04, z).rot(yaw).size(sw, h, length * 0.06, sw, h, length).span(g, delay).col(glow, k * 1.3).fade(0.02, 0);
    fx.emit('fissureGlow');
    b.reset().at(x, y + 0.04, z).rot(yaw).size(sw, h, length).span(Math.max(0.2, life - g), delay + g).col(glow, k).fade(0, 0.65);
    b.flicker = 0.14;
    fx.emit('fissureGlow');
    this.stats.fissures++;
  }

  /** Koloss-Meteorit von Start nach Ziel in `life` s (Spielzeit): festes, gefurchtes Gestein mit glühenden Adern, zwei Schichten Plasma-Bugkegel */
  colossus(sx: number, sy: number, sz: number, tx: number, ty: number, tz: number, size: number, life: number, p: Pal, delay = 0) {
    const fx = this.fx, b = fx.brush;
    const vx = (tx - sx) / life, vy = (ty - sy) / life, vz = (tz - sz) / life;
    const yaw = Math.atan2(vx, vz), pitch = Math.atan2(-vy, Math.hypot(vx, vz));
    b.reset().at(sx, sy, sz).rot(yaw, pitch, 0).vel(vx, vy, vz).spin(0, 0, 0.9).size(size, size, size).span(life, delay).col(METEOR, 1).fade(0.05, 0.01);
    b.ease = 0;
    fx.emit('colossusRock');
    // Plasma-Hülle: um ein Drittel der Größe nach hinten versetzt – die Stirn des Brockens bricht dunkel mit glühenden Furchen aus dem Feuer
    // hervor, die Hülle flammt um Flanken und Heck. (Als Bugwelle VOR dem Brocken überstrahlte der Paraboloid das Gestein von jeder Seite
    // zu einem pastellfarbenen Fleck.) Die violette Außenschicht liegt noch weiter hinten, nur als Hauch.
    const sp = Math.hypot(vx, vy, vz) || 1, ux = vx / sp, uy = vy / sp, uz = vz / sp;
    const o1 = size * 0.34, o2 = size * 0.5;
    b.reset().at(sx - ux * o1, sy - uy * o1, sz - uz * o1).rot(yaw, pitch, 0).vel(vx, vy, vz).spin(0, 0, 2.2).size(size * 0.9, size * 0.9, size, size, size, size).span(life, delay).col(p.core, 0.85).fade(0.06, 0.02);
    b.flicker = 0.18;
    fx.emit('colossusPlasma');
    b.reset().at(sx - ux * o2, sy - uy * o2, sz - uz * o2).rot(yaw, pitch, 0.5).vel(vx, vy, vz).spin(0, 0, -1.5).size(size * 1.05, size * 1.05, size * 1.1, size * 1.16, size * 1.16, size * 1.2).span(life, delay).col(p.acc, 0.3).fade(0.08, 0.02);
    fx.emit('colossusPlasma');
    this.stats.colossi++;
  }

  /** Vorhut-Brocken `i` (0 … 4) von Start nach Ziel in `life` s, nach `delay` s: spitzes Gestein mit langem Feuerschweif */
  shard(i: number, sx: number, sy: number, sz: number, tx: number, ty: number, tz: number, size: number, life: number, delay: number, p: Pal) {
    const fx = this.fx, b = fx.brush, k = ((i % 5) + 5) % 5;
    const vx = (tx - sx) / life, vy = (ty - sy) / life, vz = (tz - sz) / life;
    const yaw = Math.atan2(vx, vz), pitch = Math.atan2(-vy, Math.hypot(vx, vz));
    b.reset().at(sx, sy, sz).rot(yaw, pitch, 0).vel(vx, vy, vz).spin(0, 0, 2.6).size(size, size, size).span(life, delay).col(METEOR, 1).fade(0.04, 0.01);
    b.ease = 0;
    fx.emit(SHARD_ROCK_PRIMS[k]);
    b.reset().at(sx, sy, sz).rot(yaw, pitch, 0).vel(vx, vy, vz).spin(0, 0, 3.4).size(size * 0.8, size * 0.8, size, size, size, size).span(life, delay).col(p.core, 1.5).fade(0.05, 0.02);
    b.flicker = 0.2;
    fx.emit(SHARD_TAIL_PRIMS[k]);
    this.stats.shards++;
  }

  /** Felsnadel bzw. Wassersäule, die aus dem Boden wächst (Tektonik-Fessel, Beben-Salve): Vorhut-Brocken senkrecht gestellt */
  private pillar(i: number, x: number, y: number, z: number, height: number, life: number, delay: number, p: Pal, sea: boolean) {
    const fx = this.fx, b = fx.brush;
    if (sea) {
      b.reset().at(x, y - 0.2, z).rot(rnd() * 6).size(height * 0.22, height * 0.2, height * 0.22, height * 0.3, height, height * 0.3).span(life, delay).col(SPRAY, 1).fade(0.03, 0.4);
      fx.emit('splash');
      this.vfx.burst('drop', x, y + 0.4, z, 5, 4, SPRAY, { up: height * 1.6, size: 0.3, delay });
      return;
    }
    const w = height * 0.9;
    b.reset().at(x, y - height * 0.3, z).rot(rnd() * 6, -Math.PI / 2, rnd() * 6).size(w, w, height * 0.2, w, w, height).span(life, delay).col(p.rock, 1).fade(0.02, 0.25);
    fx.emit(SHARD_ROCK_PRIMS[i % 5]);
    this.vfx.burst('rock', x, y + 0.2, z, 3, 4, ROCK, { up: 5, size: 0.22, delay });
  }

  /** Glühende Fäuste (je Bild an beiden Händen; lebt etwa anderthalb Bilder): Glutpunkte und feine Funken – keine Kugel */
  fistGlow(x: number, y: number, z: number, style: string, k: number, life: number) {
    const fx = this.fx, b = fx.brush, p = palOf(style);
    b.reset().at(x, y, z).rot(0, 0, rnd() * 6).size(0.3 + 0.22 * k, 0.3 + 0.22 * k, 1).span(life).col(p.core, 2.2 * k).fade(0, 0.4);
    fx.emit('ember');
    b.reset().at(x, y, z).rot(0, 0, rnd() * 6).size(0.14 + 0.08 * k, 0.14 + 0.08 * k, 1).span(life).col(WHITE, 2 * k).fade(0, 0.4);
    fx.emit('ember');
    if (rnd() < 0.3 * k) this.vfx.burst('spark', x, y, z, 1, 2.2, p.acc, bu(1.2, 0.1, 0.22));
    this.stats.fistGlows++;
  }

  /** Ein Angriff zu Fuß prallt an einem Schiffsrumpf ab: Funkenfächer und Druckring, keine Wirkung */
  deflect(x: number, y: number, z: number, yaw: number, size: number) {
    this.vfx.pressureRing(x, y, z, yaw, true, size, WHITE, 0.3);
    this.vfx.burst('spark', x, y, z, 14, 12, WHITE, { up: 3, size: 0.3, spread: size * 0.6 });
    this.stats.deflects++;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Formen: Aufbau, Entladung, Einschlag
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Phase 1 – Aufbau: spiralförmig zusammenströmende Partikel und sich zuziehende Energiebänder um die Figur bzw. die Bugreling.
   * `timeK` = Spielzeit je Echtzeit-Sekunde (Akt 1 der Ultimates läuft in Zeitlupe: die Lebensdauern folgen der Spielzeit).
   */
  formBuild(tl: DirectorTimeline, x: number, y: number, z: number, yaw: number, scale = 1, sea = false, timeK = 1) {
    const fx = this.fx, b = fx.brush, p = palOf(tl.style);
    const k = tl.kind === 'auto' ? 0.5 : tl.kind === 'ultimate' ? 1.5 : 0.6 + tl.slot * 0.07;
    const T1 = Math.max(0.03, tl.t1 * timeK);
    const R = (1.8 + k * 1.6) * scale, H = (1.6 + k * 1.4) * scale, life = T1 + 0.06 * timeK;
    // zwei gegenläufige Bänder ziehen sich zur Figur zusammen, dahinter ein Tusche-Band
    b.reset().at(x, y, z).rot(rnd() * 6).spin(9).size(R, H * 0.35, R, 0.4 * scale, H, 0.4 * scale).span(life).col(p.ink, 1).fade(0.1, 0.4);
    fx.emit('ribbonInk');
    for (let i = 0; i < 2; i++) {
      b.reset().at(x, y, z).rot(i * Math.PI + rnd()).spin(i ? -12 : 12).size(R * 0.9, H * 0.3, R * 0.9, 0.3 * scale, H, 0.3 * scale).span(life).col(i ? p.acc : p.core, 2 * k).fade(0.08, 0.45);
      fx.emit('ribbon');
    }
    // Teilchen strömen auf Spiralbahnen heran (innen schneller: Sog)
    const cnt = this.n(8 + k * 12);
    for (let i = 0; i < cnt; i++) {
      const a = (i / cnt) * Math.PI * 2 + rnd() * 0.5, r = R * (0.8 + rnd() * 0.9), h = (0.2 + rnd() * 1.9) * scale;
      const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      const fly = Math.max(0.03, T1 * (0.75 + rnd() * 0.25)), inv = 1 / fly;
      const tx = Math.cos(a) * r * 0.9 * inv, tz = -Math.sin(a) * r * 0.9 * inv;
      b.reset().at(px, y + h, pz).vel((x - px) * inv + tx, (y + 1.2 * scale - (y + h)) * inv, (z - pz) * inv + tz).size(0.1 * scale, 0.42 * scale, 1, 0.04 * scale, 0.14 * scale, 1).span(fly).col(i % 2 ? p.core : p.acc, 2.6).fade(0.15, 0.3);
      b.drag = 2.2 / Math.max(0.05, timeK);
      fx.emit(tl.style === 'erdspalter' ? 'ember' : 'spark');
    }
    b.reset().at(x, y + 0.08, z).rot(rnd() * 6).spin(4).size(R, 1, R, 0.7 * scale, 1, 0.7 * scale).span(life).col(p.core, 1.5).fade(0.1, 0.4);
    fx.emit('ring');
    if (tl.style === 'erdspalter') this.vfx.burst(sea ? 'drop' : 'rock', x, y + 0.1, z, 3 + tl.slot * 0.4, 1.6 * scale, sea ? SPRAY : ROCK, { up: 3.2 * scale, size: (sea ? 0.14 : 0.1) * scale, life: life, spread: R * 0.8, grav: 4 });
    void yaw;
    this.stats.builds++;
  }

  /**
   * Phase 2 – Entladung: die Kraft löst sich am Ursprung (ox, oy, oz) und erreicht das Ziel (tx, ty, tz) genau am Ende der Phase.
   * `scale` > 1 auf See (Maßstab der Schiffe).
   */
  formRelease(tl: DirectorTimeline, ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, yaw: number, scale = 1, sea = false) {
    const fx = this.fx, b = fx.brush, vf = this.vfx, p = palOf(tl.style);
    const D = Math.max(0.05, tl.t2 - tl.t1);
    const dx0 = tx - ox, dz0 = tz - oz, dist = Math.max(0.5, Math.hypot(dx0, dz0));
    const dx = dx0 / dist, dz = dz0 / dist, sp = dist / D;
    const hy = oy + 1.2 * scale;
    const k = tl.kind === 'auto' ? 1.5 : 1.7 + tl.slot * 0.07;
    switch (relOf(tl)) {
      case 'airball': {
        // Vakuum-Stoß: komprimierte blaue Luftdruckkugel – ein kurzer, dichter Kegel, der bis 18 m weit schießt
        const far = Math.max(dist, 18 * scale), v = far / (D + 0.22);
        this.cone(ox + dx * 0.9 * scale, hy, oz + dz * 0.9 * scale, yaw, 0, 0.7 * scale, 1.9 * scale, p, D + 0.22, k, 0, dx * v, 0, dz * v, 9);
        vf.pressureRing(ox + dx * 0.9 * scale, hy, oz + dz * 0.9 * scale, yaw, true, 0.9 * scale, p.acc, 0.22, dx * v * 0.5, dz * v * 0.5);
        break;
      }
      case 'slam': {
        // Erd-Schmetterschlag: die Faust fährt nieder – ein breiter Kegel nach unten vor der Figur
        this.cone(tx, ty + 2.4 * scale, tz, yaw, Math.PI / 2, 1.3 * scale, 2.6 * scale, p, D + 0.05, k, 0, 0, -(1.2 * scale) / D, 0, 3);
        break;
      }
      case 'cone': {
        // Vakuum-Jab bzw. Rammstoß: Mach-Kegel fliegt zum Ziel, Gischt bzw. Staub springt entlang der Bahn auf
        const heavy = tl.style === 'erdspalter';
        const r = (heavy ? 1.7 : 0.95) * scale, len = (heavy ? 3.4 : 4.4) * scale;
        this.cone(ox + dx * scale, hy, oz + dz * scale, yaw, 0, r, len, p, D + 0.1, k, 0, dx * sp, 0, dz * sp, heavy ? 3 : 8);
        vf.pressureRing(ox + dx * scale, hy, oz + dz * scale, yaw, true, r * 0.9, p.acc, 0.26, dx * sp * 0.4, dz * sp * 0.4);
        this.trail(ox, oy, oz, dx, dz, dist, D, scale, 4);
        break;
      }
      case 'sickles': {
        // Zwillings-Blitztritt: zwei gekreuzte blau-weiße Luftklingen-Sicheln
        for (let i = 0; i < 2; i++) {
          vf.slash(ox + dx * 0.6 * scale, hy, oz + dz * 0.6 * scale, yaw, -0.95, i ? -0.8 : 0.8, 2.3 * scale, i ? WHITE : p.core, p.ink, { life: D + 0.12, vx: dx * sp, vz: dz * sp, sparks: 5, k: 1.2, delay: i * D * 0.3 });
        }
        this.trail(ox, oy, oz, dx, dz, dist, D, scale, 3);
        break;
      }
      case 'dome': {
        // Windmühlen-Parade: vier Kegel kreisen als Kuppel um die Figur bzw. das Schiff, zwei Druckringe laufen gegenläufig
        const R = 2.4 * scale;
        for (let i = 0; i < 4; i++) {
          b.reset().at(ox, oy + 0.2 * scale, oz).rot(yaw + i * (Math.PI / 2), -0.95, 0).spin(7, 0, 4).size(R / CONE_R * 0.6, R / CONE_R * 0.6, (R * 1.5) / CONE_L * 0.6, R / CONE_R, R / CONE_R, (R * 1.5) / CONE_L).span(D + 0.3).col(i % 2 ? p.acc : p.core, k * 0.8).fade(0.08, 0.45);
          fx.emit('shockcone');
        }
        b.reset().at(ox, oy + 0.2 * scale, oz).rot(yaw, -0.95, 0).spin(-5, 0, 0).size(R / CONE_R * 1.1, R / CONE_R * 1.1, (R * 1.5) / CONE_L * 1.05).span(D + 0.4).col(p.ink, 1).fade(0.08, 0.45);
        fx.emit('shockconeInk');
        for (let i = 0; i < 2; i++) { b.reset().at(ox, oy + (0.6 + i * 1.1) * scale, oz).rot(rnd() * 6).spin(i ? -9 : 9).size(R * 0.5, 1, R * 0.5, R * 1.25, 1, R * 1.25).span(D + 0.25).col(p.acc, 1.6).fade(0.06, 0.5); fx.emit('ring'); }
        vf.auraSwirl(ox, oy, oz, p.core, p.acc, 1.6 * scale, D + 0.2);
        this.stats.domes++;
        break;
      }
      case 'dash': {
        // Schallmauer-Schritt: blaue Blitz-Nachbilder entlang des Vorstoßes, Mach-Kegel an der Spitze
        for (let i = 0; i < 3; i++) vf.silhouette(ox + dx * dist * (i / 3), oy, oz + dz * dist * (i / 3), yaw, p.core, D + 0.1 + i * 0.05);
        this.cone(ox + dx * scale, hy, oz + dz * scale, yaw, 0, 1.0 * scale, 3.2 * scale, p, D + 0.12, k, 0, dx * sp, 0, dz * sp, 9);
        this.trail(ox, oy, oz, dx, dz, dist, D, scale, 4);
        break;
      }
      case 'skyBolt': {
        // Donner-Fallkick: blaue Blitzsäule vom Himmel auf das Ziel, ein Kegel stürzt mit herab
        const top = ty + 34 * scale;
        vf.bolt(tx + (rnd() - 0.5) * 3, top, tz + (rnd() - 0.5) * 3, tx, ty + 0.2, tz, p.core, 0.5 * scale, D + 0.16, { depth: 5, branches: 3, jitter: 0.1 });
        vf.bolt(tx, top, tz, tx, ty + 0.2, tz, WHITE, 0.22 * scale, D + 0.1, { depth: 4, branches: 1, jitter: 0.06 });
        b.reset().at(tx, ty - 0.5, tz).size(0.5 * scale, top - ty, 0.5 * scale, 1.5 * scale, top - ty, 1.5 * scale).span(D + 0.2).col(p.core, 1.4).fade(0.1, 0.5);
        fx.emit('column');
        this.cone(tx, ty + 11 * scale, tz, yaw, Math.PI / 2, 1.5 * scale, 4.2 * scale, p, D + 0.04, k, 0, 0, -(10 * scale) / D, 0, 7);
        break;
      }
      case 'vortex': {
        // Zyklon-Sog: Unterdruck-Trichter am Ziel, Teilchen stürzen von außen hinein
        vf.funnel(tx, ty, tz, 6.5 * scale, 3.4 * scale, p.core, p.ink, D + 0.3);
        const cnt = this.n(14);
        for (let i = 0; i < cnt; i++) {
          const a = rnd() * Math.PI * 2, r = (5 + rnd() * 4) * scale, px = tx + Math.sin(a) * r, pz = tz + Math.cos(a) * r, inv = 1 / (D * (0.6 + rnd() * 0.4));
          b.reset().at(px, ty + (0.3 + rnd() * 2) * scale, pz).vel((tx - px) * inv + Math.cos(a) * r * inv, 1.5, (tz - pz) * inv - Math.sin(a) * r * inv).size(0.12 * scale, 0.5 * scale, 1, 0.04 * scale, 0.16 * scale, 1).span(D * 0.9).col(i % 2 ? p.acc : SPRAY, 2.2).fade(0.1, 0.3);
          b.drag = 1.6;
          fx.emit(sea ? 'drop' : 'spark');
        }
        break;
      }
      case 'barrage': {
        // Hundert-Fäuste-Maschinengewehr: drei versetzte Bündel (24 Fäuste und mehr) trommeln aufs Ziel
        const fly = Math.max(0.1, D * 0.46), v = Math.max(1, dist - 1.5 * scale) / fly;
        for (let i = 0; i < 3; i++) this.barrage(ox + dx * 1.2 * scale, hy + (i - 1) * 0.25 * scale, oz + dz * 1.2 * scale, yaw + (i - 1) * 0.06, 0, 1.5 * scale, 4.6 * scale, p, fly, k, i * D * 0.26, v, i * 0.8);
        vf.pressureRing(ox + dx * 1.2 * scale, hy, oz + dz * 1.2 * scale, yaw, true, 1.5 * scale, WHITE, 0.3, dx * v * 0.3, dz * v * 0.3);
        this.trail(ox, oy, oz, dx, dz, dist, D, scale, 3);
        break;
      }
      case 'cage': {
        // Kugelblitz-Käfig: drei Großkreise schließen sich zur Hochspannungs-Kuppel, Kettenblitze springen über
        const R = 6 * scale, cy = ty + R * 0.35;
        for (let i = 0; i < 3; i++) {
          b.reset().at(tx, cy, tz).rot(yaw + i * 1.05, Math.PI / 2, i * 0.6).spin(i % 2 ? -3 : 3, 0, 1.2).size(R * 0.35, 1, R * 0.35, R, 1, R).span(D + 0.35).col(i === 1 ? WHITE : p.core, 1.7).fade(0.1, 0.4);
          b.flicker = 0.3;
          fx.emit('ring');
        }
        for (let i = 0; i < this.n(5); i++) {
          const a0 = rnd() * Math.PI * 2, a1 = a0 + 1.4 + rnd() * 1.6;
          vf.bolt(tx + Math.sin(a0) * R * 0.9, ty + rnd() * R * 0.8, tz + Math.cos(a0) * R * 0.9, tx + Math.sin(a1) * R * 0.9, ty + rnd() * R * 0.8, tz + Math.cos(a1) * R * 0.9, i % 2 ? p.core : WHITE, 0.2 * scale, D + 0.1 + rnd() * 0.15, { depth: 4, branches: 1, jitter: 0.16 });
        }
        this.stats.domes++;
        break;
      }
      case 'avatar': {
        // Sturm-Avatar-Schlag: eine riesige Blitz-Faust (dichtes Bündel hinter einem Stoßkegel) stürzt schräg von oben aufs Ziel
        const sx = tx - dx * 7 * scale, sy = ty + 10 * scale, sz = tz - dz * 7 * scale;
        const L = Math.hypot(tx - sx, ty - sy, tz - sz), v = L / D, pit = Math.atan2(sy - ty, 7 * scale);
        this.barrage(sx, sy, sz, yaw, pit, 2.6 * scale, 8.5 * scale, p, D + 0.02, k, 0, v, 0.3);
        this.cone(sx, sy, sz, yaw, pit, 2.4 * scale, 5 * scale, p, D + 0.02, k, 0, dx * Math.cos(pit) * v, -Math.sin(pit) * v, dz * Math.cos(pit) * v, 5);
        break;
      }
      case 'beam': {
        // Kaiser-Vakuumkanone: langer komprimierter Luft- und Blitzstrahl – ein gestreckter Kegel, darin ein Faust-/Blitz-Bündel, Blitze entlang
        const len = dist * 1.02;
        this.cone(ox + dx * (len * 0.3), hy, oz + dz * (len * 0.3), yaw, 0, 1.9 * scale, len * 1.05, p, D + 0.35, k + 0.3, 0, dx * 4, 0, dz * 4, 10);
        this.barrage(ox + dx * scale, hy, oz + dz * scale, yaw, 0, 1.3 * scale, 9 * scale, p, D + 0.1, k, 0, Math.max(1, dist - 6 * scale) / (D + 0.08), 0.2);
        for (let i = 0; i < 2; i++) vf.bolt(ox + dx * scale, hy + (i - 0.5) * 0.6, oz + dz * scale, tx, ty + 1.2 * scale, tz, i ? WHITE : p.core, (0.3 - i * 0.14) * scale, D + 0.3, { depth: 5, branches: 2 - i * 2, jitter: 0.05 });
        this.trail(ox, oy, oz, dx, dz, dist, D, scale, 6);
        break;
      }
      case 'fan': {
        // Felsbrecher-Fächer: drei breite Erdschock-Wellen laufen als glühende Risse über Boden bzw. Wasser
        for (let i = -1; i <= 1; i++) {
          const a = yaw + i * 0.42, ax = Math.sin(a), az = Math.cos(a);
          this.fissure(ox + ax * 1.2 * scale, oy, oz + az * 1.2 * scale, a, dist, 1.9 * scale, sea ? DEEP : p.core, null, D + 0.5, D, 1.7);
          this.cone(ox + ax * scale, oy + 0.5 * scale, oz + az * scale, a, 0, 1.25 * scale, 2.6 * scale, p, D + 0.08, k, 0, ax * sp, 0, az * sp, 2);
          this.trail(ox, oy, oz, ax, az, dist, D, scale, 3);
        }
        break;
      }
      case 'armor': {
        // Eisenkörper-Bollwerk: gold-schwarze Rüstungsaura schließt sich
        vf.spiral(ox, oy, oz, 0.95 * scale, 2.6 * scale, p.core, D + 0.5, 3, 9);
        vf.corona(ox, oy + 1.2 * scale, oz, yaw, 1.05 * scale, p.core, p.acc, D + 0.4);
        b.reset().at(ox, oy, oz).rot(rnd() * 6).spin(-6).size(0.7 * scale, 0.6 * scale, 0.7 * scale, 1.1 * scale, 2.4 * scale, 1.1 * scale).span(D + 0.6).col(p.ink, 1).fade(0.08, 0.4);
        fx.emit('ribbonInk');
        break;
      }
      case 'ram': {
        // Koloss-Ansturm: der Druckkegel schiebt sich vor der Schulter her
        this.cone(ox + dx * 1.2 * scale, oy + 1.0 * scale, oz + dz * 1.2 * scale, yaw, 0, 1.8 * scale, 3.2 * scale, p, D + 0.1, k, 0, dx * sp, 0, dz * sp, 3);
        this.trail(ox, oy, oz, dx, dz, dist, D, scale, 5);
        break;
      }
      case 'hammer': {
        // Titanen-Hammer: beide Fäuste fallen – ein Kegel stürzt senkrecht auf das Ziel
        this.cone(tx, ty + 5.5 * scale, tz, yaw, Math.PI / 2, 1.9 * scale, 3.6 * scale, p, D + 0.04, k, 0, 0, -(4.2 * scale) / D, 0, 3);
        b.reset().at(tx, ty + 0.1, tz).rot(rnd() * 6).size(4.5 * scale, 1, 4.5 * scale, 1.2 * scale, 1, 1.2 * scale).span(D + 0.05).col(p.acc, 1.5).fade(0.1, 0.3);
        fx.emit('ring');
        break;
      }
      case 'pillars': {
        // Tektonik-Fessel: der Boden um das Ziel reißt ringförmig auf
        b.reset().at(tx, ty + 0.1, tz).rot(rnd() * 6).spin(2).size(1 * scale, 1, 1 * scale, 3.6 * scale, 1, 3.6 * scale).span(D + 0.2).col(p.core, 1.6).fade(0.05, 0.4);
        fx.emit('shock');
        vf.burst(sea ? 'drop' : 'dust', tx, ty + 0.2, tz, 6, 2.5 * scale, sea ? SPRAY : DUST, { up: 1.5, size: 0.7 * scale, spread: 3 * scale });
        break;
      }
      case 'salvo': {
        // Beben-Salve: fünf seismische Schläge laufen auf das Ziel zu (der sechste ist der Einschlag)
        for (let i = 0; i < 5; i++) {
          const d = (dist * (i + 1)) / 6, px = ox + dx * d, pz = oz + dz * d, py = this.yOf(px, pz, oy), dl = (D * i) / 5;
          this.pillar(i, px, py, pz, (1.6 + i * 0.25) * scale, 0.55, dl, p, sea);
          vf.surfaceHit(px, py, pz, 1.3 * scale, p.core, 0.8, dl);
          this.fissure(px - dz * 1.2 * scale, py, pz + dx * 1.2 * scale, yaw + Math.PI / 2, 2.4 * scale, 1.1 * scale, sea ? DEEP : p.core, null, 0.5, 0.1, 1.6, dl);
        }
        break;
      }
      case 'rift': {
        // Magma-Grabenbruch: die Spalte reißt vom Kapitän aus bis unter das Ziel auf und bleibt glühend stehen
        const land = this.surf.isLand(ox + dx * dist * 0.5, oz + dz * dist * 0.5);
        this.fissure(ox + dx * 1.4 * scale, this.yOf(ox, oz, oy), oz + dz * 1.4 * scale, yaw, dist * 1.05, 3.8 * scale, land ? MAGMA : DEEP, land ? p.rock : null, tl.total - tl.t1 + 1.3, D, 1.9);
        this.trail(ox, oy, oz, dx, dz, dist, D, scale, 6);
        break;
      }
      case 'giant': {
        // Giganten-Faust: eine 20 m große goldene Energie-Faust stürzt senkrecht aus den Wolken
        const H = 44 * scale, big = scale > 1 ? scale * 0.75 : 1;
        b.reset().at(tx, ty + H, tz).rot(rnd() * 6).spin(1.5).size(3 * big, 1, 3 * big, 13 * big, 1, 13 * big).span(D + 0.4).col(p.core, 1.6).fade(0.1, 0.4);
        fx.emit('ring');
        this.barrage(tx, ty + H, tz, yaw, Math.PI / 2, 5.5 * big, 20 * big, p, D + 0.02, k, 0, (H - 6 * big) / D, 0.4);
        this.cone(tx, ty + H - 4 * big, tz, yaw, Math.PI / 2, 5 * big, 9 * big, p, D + 0.02, k, 0, 0, -(H - 6 * big) / D, 0, 2);
        break;
      }
      case 'quake': {
        // Weltbeben-Stoß: die Fäuste fahren nieder, der Boden zieht sich zusammen
        this.cone(ox, oy + 3 * scale, oz, yaw, Math.PI / 2, 1.6 * scale, 3 * scale, p, D + 0.04, k, 0, 0, -(2 * scale) / D, 0, 3);
        b.reset().at(ox, oy + 0.1, oz).rot(rnd() * 6).size(11 * scale, 1, 11 * scale, 1.5 * scale, 1, 1.5 * scale).span(D + 0.05).col(p.acc, 1.6).fade(0.1, 0.3);
        fx.emit('ring');
        break;
      }
      default: break;
    }
    this.stats.releases++;
  }

  /** Gischt- bzw. Staubfahnen entlang einer Bahn (gestaffelt mit der Flugzeit) */
  private trail(ox: number, oy: number, oz: number, dx: number, dz: number, dist: number, D: number, scale: number, n: number) {
    for (let i = 1; i <= n; i++) {
      const d = (i / n) * dist, px = ox + dx * d, pz = oz + dz * d;
      const land = this.surf.isLand(px, pz), py = land ? this.surf.groundY(px, pz, oy) : this.surf.waterY(px, pz);
      this.vfx.burst(land ? 'dust' : 'drop', px, py + 0.2, pz, land ? 2 : 5, (land ? 1.6 : 4) * scale, land ? DUST : SPRAY, { up: (land ? 0.8 : 5) * scale, size: (land ? 0.8 : 0.35) * scale, delay: (d / dist) * D, life: land ? 0.7 : 0.8 });
    }
  }

  /**
   * Phase 3 + 4 – Einschlag und Nachbeben am Ziel: Stoßkrone, gestaffelte Druckringe, Krater bzw. Gischt, je nach Form Risse, Felsnadeln,
   * Blitze; danach Glut, Staub und Restladungen.
   */
  formImpact(tl: DirectorTimeline, x: number, y: number, z: number, yaw: number, scale = 1, sea = false) {
    const fx = this.fx, b = fx.brush, vf = this.vfx, p = palOf(tl.style);
    const land = !sea && this.surf.isLand(x, z);
    const gy = land ? this.surf.groundY(x, z, y) : sea ? y : this.surf.waterY(x, z);
    const slot = tl.kind === 'auto' ? 2 : tl.slot;
    const tier = slot >= 8 ? 3 : slot >= 5 ? 2 : 1;
    const R = (2.4 + slot * 0.6) * scale;
    const rel = relOf(tl), erd = tl.style === 'erdspalter';
    const fwX = Math.sin(yaw), fwZ = Math.cos(yaw);
    // Stoßkrone: Kegel schießt aus dem Einschlag nach oben
    this.cone(x, gy + 0.1, z, yaw, -Math.PI / 2, R * 0.36, R * 0.85, p, 0.3 + tier * 0.06, 1.7 + tier * 0.2, 0, 0, R * 1.2, 0, 6);
    for (let k = 1; k <= 1 + tier; k++) {
      const r = R * (0.4 + k * (0.6 / (1 + tier)));
      b.reset().at(x, gy + 0.14, z).rot(rnd() * 6).size(1, 1, 1, r, 1, r).span(0.3 + k * 0.1, (k - 1) * 0.05).col(k % 2 ? p.acc : WHITE, 2).fade(0.01, 0.6);
      fx.emit('shock');
    }
    vf.pressureRing(x, gy + 1.0 * scale, z, yaw, true, R * 0.42, p.core, 0.3);
    vf.surfaceHit(x, gy, z, R * 0.34, p.core, 1 + tier * 0.25);
    switch (rel) {
      case 'airball': case 'cone': case 'ram': case 'barrage': case 'beam': {
        // gerichteter Durchschlag: ein Kegel bricht in Schlagrichtung aus dem Ziel
        this.cone(x, gy + 1.1 * scale, z, yaw, 0, R * 0.42, R * 1.1, p, 0.28, 2, 0, fwX * R * 2.4, 0, fwZ * R * 2.4, 6);
        if (rel === 'beam') for (let i = 1; i <= 3; i++) vf.surfaceHit(x - fwX * R * i * 0.9, gy, z - fwZ * R * i * 0.9, R * 0.2, p.core, 0.8, i * 0.03);
        break;
      }
      case 'sickles': {
        for (let i = 0; i < 2; i++) vf.slash(x, gy + 1.1 * scale, z, yaw, -1.1, i ? -0.8 : 0.8, R * 0.7, i ? WHITE : p.core, p.ink, { life: 0.22, sparks: 6, k: 1.3 });
        break;
      }
      case 'dome': case 'armor': case 'quake': {
        // radial: sechs flache Kegel laufen nach außen (Kuppel zerplatzt, Konter-Druckwelle, Weltbeben)
        const n = rel === 'quake' ? 8 : 5;
        for (let i = 0; i < n; i++) {
          const a = yaw + (i / n) * Math.PI * 2;
          this.cone(x + Math.sin(a) * R * 0.25, gy + 0.7 * scale, z + Math.cos(a) * R * 0.25, a, 0, R * 0.3, R * 0.7, p, 0.36, 1.8, 0, Math.sin(a) * R * 2.2, 0, Math.cos(a) * R * 2.2, 3);
        }
        if (rel === 'quake') {
          const L = 12 * scale;
          for (let i = 0; i < 6; i++) {
            const a = yaw + (i / 6) * Math.PI * 2 + 0.3;
            this.fissure(x + Math.sin(a) * 1.2 * scale, gy, z + Math.cos(a) * 1.2 * scale, a, L, 2.6 * scale, land ? MAGMA : DEEP, land ? p.rock : null, tl.total - tl.t2 + 1.4, 0.22, 1.9, i * 0.02);
          }
          for (let k = 2; k <= 5; k++) { b.reset().at(x, gy + 0.2, z).rot(rnd() * 6).size(2, 1, 2, L * (0.3 + k * 0.2), 1, L * (0.3 + k * 0.2)).span(0.5 + k * 0.1, k * 0.06).col(k % 2 ? WHITE : p.core, 1.9).fade(0.01, 0.6); fx.emit('shock'); }
        }
        break;
      }
      case 'skyBolt': case 'avatar': case 'cage': {
        // Blitze fahren nach: aus dem Himmel in den Einschlag, vom Einschlag über den Boden
        vf.bolt(x + (rnd() - 0.5) * 2, gy + 30 * scale, z + (rnd() - 0.5) * 2, x, gy + 0.2, z, WHITE, 0.4 * scale, 0.22, { depth: 5, branches: 3, jitter: 0.12 });
        for (let i = 0; i < this.n(2 + tier); i++) {
          const a = rnd() * Math.PI * 2, r = R * (0.6 + rnd() * 0.6);
          vf.bolt(x, gy + 0.4, z, x + Math.sin(a) * r, this.yOf(x + Math.sin(a) * r, z + Math.cos(a) * r, gy) + 0.2, z + Math.cos(a) * r, p.core, 0.16 * scale, 0.2 + rnd() * 0.15, { depth: 3, branches: 1, jitter: 0.2 });
        }
        if (rel === 'cage') for (let i = 0; i < 3; i++) { b.reset().at(x, gy + R * 0.35, z).rot(yaw + i * 1.05, Math.PI / 2, i * 0.6).size(R * 0.9, 1, R * 0.9, R * 1.5, 1, R * 1.5).span(0.3).col(WHITE, 2).fade(0.01, 0.7); fx.emit('ring'); }
        break;
      }
      case 'vortex': {
        vf.funnel(x, gy, z, 4 * scale, 2.2 * scale, p.core, p.ink, 0.3);
        vf.pressureRing(x, gy + 0.4 * scale, z, 0, false, R, p.acc, 0.4);
        break;
      }
      case 'dash': {
        vf.silhouette(x, gy, z, yaw, WHITE, 0.3);
        this.cone(x, gy + 1.1 * scale, z, yaw, 0, R * 0.5, R * 1.2, p, 0.26, 2.1, 0, fwX * R * 2.6, 0, fwZ * R * 2.6, 9);
        break;
      }
      case 'fan': {
        for (let i = -1; i <= 1; i++) vf.surfaceHit(x + Math.sin(yaw + i * 0.42) * R * 0.5, gy, z + Math.cos(yaw + i * 0.42) * R * 0.5, R * 0.22, p.core, 0.9, 0.02 * (i + 1));
        break;
      }
      case 'slam': case 'hammer': case 'giant': case 'salvo': {
        // sternförmige Risse im Boden bzw. Gischt-Risse im Wasser, Brocken fliegen
        const n = rel === 'giant' ? 6 : rel === 'slam' ? 4 : 5, L = (rel === 'giant' ? 9 : rel === 'slam' ? 6 : 6.5) * scale;
        const rock = land && rel !== 'slam';
        for (let i = 0; i < n; i++) {
          const a = yaw + (i / n) * Math.PI * 2 + 0.2;
          this.fissure(x + Math.sin(a) * 0.5 * scale, gy, z + Math.cos(a) * 0.5 * scale, a, L, (rel === 'giant' ? 2.4 : 1.5) * scale, land ? MAGMA : DEEP, rock ? p.rock : null, tl.total - tl.t2 + 1.2, 0.18, 1.8, i * 0.015);
        }
        if (rel !== 'slam') for (let i = 0; i < this.n(3 + tier); i++) this.pillar(i, x + (rnd() - 0.5) * R, gy, z + (rnd() - 0.5) * R, (1.2 + rnd() * 1.4) * scale, 0.7 + rnd() * 0.3, rnd() * 0.08, p, !land);
        break;
      }
      case 'pillars': {
        // Tektonik-Fessel: sechs Felsnadeln bzw. Wassersäulen kesseln das Ziel ein und bleiben stehen
        for (let i = 0; i < 6; i++) {
          const a = yaw + (i / 6) * Math.PI * 2, r = 3.3 * scale;
          const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
          this.pillar(i, px, this.yOf(px, pz, gy), pz, (4.2 + (i % 2) * 1.2) * scale, tl.total - tl.t2 + 1.4, i * 0.02, p, !land);
        }
        break;
      }
      case 'rift': {
        // der Graben flammt auf: Glut schlägt entlang der Spalte hoch, Schollen kippen
        for (let i = 0; i < 5; i++) {
          const d = (i - 2) * R * 0.5, px = x + fwX * d, pz = z + fwZ * d;
          vf.burst('ember', px, gy + 0.4, pz, 5, 2.5 * scale, land ? MAGMA : DEEP, { up: 7 * scale, size: 0.3 * scale, spread: 1.5 * scale, delay: i * 0.03 });
          if (land) this.pillar(i, px + fwZ * 1.8 * scale, gy, pz - fwX * 1.8 * scale, 1.6 * scale, 0.9, i * 0.03, p, false);
        }
        break;
      }
      default: break;
    }
    // Teilchen des Einschlags und das Nachbeben (verzögerte Wellen)
    const kind = erd ? (land ? 'rock' : 'drop') : 'spark';
    vf.burst(kind, x, gy + 0.5 * scale, z, 8 + slot * 2, (6 + slot) * scale, erd ? (land ? ROCK : SPRAY) : p.acc, { up: (5 + slot * 0.5) * scale, size: (erd ? 0.3 : 0.2) * scale, spread: R * 0.3 });
    vf.burst(erd ? 'ember' : 'spark', x, gy + 0.4, z, 6 + slot * 2, 5 * scale, p.core, { up: 4.5 * scale, size: 0.16 * scale, life: 0.9, delay: 0.18, spread: R * 0.35 });
    vf.burst(land ? 'dust' : 'mist', x, gy + 0.3, z, 2 + tier, 2.4 * scale, land ? DUST : SPRAY, { up: land ? 1 : 2.5, size: (land ? 1.2 : 1.5) * scale, life: 1, delay: 0.3, spread: R * 0.4 });
    if (!erd && tier >= 2) vf.burst('spark', x, gy + 0.2, z, 6 + slot, 3 * scale, WHITE, { up: 1.5, size: 0.12 * scale, life: 0.5, delay: 0.45, spread: R * 0.7 });
    this.stats.impacts++;
  }

  /**
   * Ganze Form in Spielzeit abspielen (am Steuerrad, für Mitspieler): Aufbau sofort am Ursprung, Entladung nach `t1`, Einschlag nach `t2`.
   * `done` wird im Treffermoment gerufen (Schaden, Impact-Frame der eigenen Aktion).
   */
  playForm(tl: DirectorTimeline, ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, yaw: number, scale: number, sea: boolean, done: ((tl: DirectorTimeline) => void) | null = null) {
    this.formBuild(tl, ox, oy, oz, yaw, scale, sea);
    this.enqueue(1, tl, tl.t1, ox, oy, oz, tx, ty, tz, yaw, scale, sea, null);
    this.enqueue(2, tl, tl.t2, ox, oy, oz, tx, ty, tz, yaw, scale, sea, done);
  }

  /** Schritt einer Warteschlangen-Zeile ausführen */
  private fire(s: Pending) {
    const tl = s.tl;
    if (!tl) return;
    if (s.step === 1) this.formRelease(tl, s.ox, s.oy, s.oz, s.tx, s.ty, s.tz, s.yaw, s.scale, s.sea);
    else { this.formImpact(tl, s.tx, s.ty, s.tz, s.yaw, s.scale, s.sea); const d = s.done; s.done = null; d?.(tl); }
  }

  private enqueue(step: 1 | 2, tl: DirectorTimeline, t: number, ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, yaw: number, scale: number, sea: boolean, done: ((tl: DirectorTimeline) => void) | null) {
    let s: Pending | null = null;
    for (const k of this.q) if (!k.on) { s = k; break; }
    if (!s) {
      // alle Plätze belegt: der Schritt, der als nächster fällig wäre, fällt sofort (ein Einschlag geht nie verloren)
      s = this.q[0];
      for (const k of this.q) if (k.t < s.t) s = k;
      this.fire(s);
    }
    s.on = true; s.t = t; s.step = step; s.tl = tl;
    s.ox = ox; s.oy = oy; s.oz = oz; s.tx = tx; s.ty = ty; s.tz = tz; s.yaw = yaw; s.scale = scale; s.sea = sea; s.done = done;
    this.stats.queued++;
  }

  /** Je Bild (Spielzeit): ausstehende Entladungen und Einschläge abgespielter Formen */
  update(dt: number) {
    for (const s of this.q) {
      if (!s.on) continue;
      s.t -= dt;
      if (s.t > 0 || !s.tl) continue;
      s.on = false;
      this.fire(s);
    }
  }

  /** Alles Ausstehende verwerfen (Szenenwechsel) */
  reset() { for (const s of this.q) { s.on = false; s.done = null; } this.shardHit.fill(0); }

  // ---------------------------------------------------------------------------------------------------------------
  // Ultimates – Akt 1 (Aufladung, je 45 ms in Echtzeit) und gemeinsame Einschlags-Bilder (auch für Mitspieler)
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Akt 1 eines Kino-Ultimates im Echtzeit-Takt: `u` = Anteil des Akts, `g` = Spielzeit je Echtzeit (Lebensdauern), Hände (r, l) und Kopf
   * der Figur, `sea` = die Figur steht an Deck (Blitze tanzen um die Masten).
   */
  chargeTick(kind: 'fistStorm' | 'oceanSplit' | 'skyfall', x: number, y: number, z: number, yaw: number, u: number, g: number, rx: number, ry: number, rz: number, lx: number, ly: number, lz: number, sea: boolean) {
    const fx = this.fx, b = fx.brush, vf = this.vfx;
    if (kind === 'fistStorm') {
      const p = PAL_STURM;
      // blaue Blitze tanzen um die Fäuste und springen zu Boden bzw. an den Masten empor
      for (let s = 0; s < 2; s++) {
        const hx = s ? lx : rx, hy = s ? ly : ry, hz = s ? lz : rz;
        this.fistGlow(hx, hy, hz, 'sturmfaust', 0.7 + 0.5 * u, 0.06 * g);
        if (rnd() < 0.55) { const a = rnd() * Math.PI * 2, r = 0.9 + rnd() * 1.6; vf.bolt(hx, hy, hz, x + Math.sin(a) * r, y + rnd() * 0.4, z + Math.cos(a) * r, rnd() < 0.5 ? p.core : WHITE, 0.07, 0.1 * g, bo(3, 1, 0.22)); }
      }
      if (sea && rnd() < 0.5) { const a = rnd() * Math.PI * 2, r = 3 + rnd() * 6; vf.bolt(x + Math.sin(a) * r, y + 6 + rnd() * 14, z + Math.cos(a) * r, x + Math.sin(a) * r * 0.8, y + 0.5, z + Math.cos(a) * r * 0.8, p.core, 0.16, 0.14 * g, bo(4, 2, 0.12)); }
      if (rnd() < 0.3) vf.auraSwirl(x, y, z, p.core, p.acc, 1.2, 0.3 * g);
    } else if (kind === 'oceanSplit') {
      const p = PAL_ERD;
      // beide Fäuste glühen tektonisch-golden, der Boden bebt: Steine bzw. Tropfen springen hoch, Risse glimmen unter den Füßen
      for (let s = 0; s < 2; s++) this.fistGlow(s ? lx : rx, s ? ly : ry, s ? lz : rz, 'erdspalter', 0.8 + 0.7 * u, 0.06 * g);
      const a = rnd() * Math.PI * 2, r = 0.8 + rnd() * 2.6, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r, land = this.surf.isLand(px, pz);
      vf.burst(land ? 'rock' : 'drop', px, this.surf.groundY(px, pz, y) + 0.1, pz, 2, 1.2, land ? ROCK : SPRAY, bu(3.8, land ? 0.09 : 0.13, 0.35 * g, undefined, 6));
      if (rnd() < 0.25) this.fissure(x + Math.sin(a) * 0.4, y, z + Math.cos(a) * 0.4, a, 2.2 + rnd() * 1.6, 0.9, sea ? DEEP : p.core, null, 0.45 * g, 0.12 * g, 1.5);
      if (rnd() < 0.3) vf.burst('dust', x, y + 0.1, z, 1, 1.5, DUST, bu(0.4, 0.6, 0.4 * g, 1.6));
    } else {
      const p = PAL_KOSMOS;
      // Schwerkraft-Umkehr: lila Gravitations-Ringe breiten sich aus, Kiesel und Wassertropfen schweben schwerelos nach oben
      if (rnd() < 0.42) {
        b.reset().at(x, y + 0.1 + rnd() * 0.3, z).rot(rnd() * 6).size(1.2, 1, 1.2, 9 + 14 * u, 1, 9 + 14 * u).span(0.6 * g).col(rnd() < 0.5 ? VIOLET : p.acc, 1.7).fade(0.06, 0.6);
        fx.emit('ring');
        this.stats.gravity++;
      }
      const cnt = this.n(3);
      for (let i = 0; i < cnt; i++) {
        const a = rnd() * Math.PI * 2, r = 1 + rnd() * 11, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r, land = this.surf.isLand(px, pz);
        const py = land ? this.surf.groundY(px, pz, y) : this.surf.waterY(px, pz);
        if (land) {
          const s = 0.06 + rnd() * 0.12;
          b.reset().at(px, py + 0.1, pz).rot(rnd() * 6, rnd() * 6, rnd() * 6).spin(rnd() * 2, rnd() * 2).vel(0, (0.7 + rnd() * 1.6) / g, 0).size(s, s, s).span(0.9 * g).col(ROCK, 1).fade(0.1, 0.3);
          fx.emit('rock');
        } else {
          b.reset().at(px, py + 0.1, pz).vel(0, (0.9 + rnd() * 1.8) / g, 0).size(0.12, 0.2, 1).span(0.9 * g).col(SPRAY, 1).fade(0.1, 0.4);
          fx.emit('drop');
        }
      }
      this.fistGlow(rx, ry, rz, 'kosmos', 0.5 + 0.6 * u, 0.06 * g);
      if (rnd() < 0.35) vf.bolt(rx, ry, rz, rx + (rnd() - 0.5) * 2.4, ry + 1.5 + rnd() * 2.5, rz + (rnd() - 0.5) * 2.4, VIOLET, 0.07, 0.1 * g, bo(3, 1, 0.25));
    }
    void yaw;
  }

  /** Sturmfaust der Tausend Blitze – ein Blitzeinschlag der Umkreisung (Nummer i von n) um (cx, cz) mit Radius R */
  orbitBolt(i: number, n: number, cx: number, cy: number, cz: number, R: number, yaw: number): { x: number; z: number } {
    const p = PAL_STURM, vf = this.vfx;
    const a = yaw + (i / n) * Math.PI * 6 + (i % 3) * 0.2, r = R * (0.8 + (i % 4) * 0.09);
    const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r, y = this.yOf(x, z, cy);
    // 24 Einschläge in 0,6 s: je Blitz 16 Glieder und ein Ast (mit 32 Gliedern und zwei Ästen lebten bis zu 1 650 Effekt-Teile zugleich
    // und kosteten 8 ms je Bild); etwas dicker gezeichnet, Krater und Gestein nur an jedem zweiten Einschlag, sonst ein Stoßring
    vf.bolt(x + (rnd() - 0.5) * 6, y + 46, z + (rnd() - 0.5) * 6, x, y + 0.2, z, i % 3 ? p.core : WHITE, 0.36, 0.16, bo(4, 1, 0.1));
    if (i % 2 === 0) vf.surfaceHit(x, y, z, 1.5, p.core, 0.7);
    else { const b = this.fx.brush; b.reset().at(x, y + 0.1, z).rot(rnd() * 6).size(0.3, 1, 0.3, 2.9, 1, 2.9).span(0.4).col(p.core, 1.4).fade(0.01, 0.65); this.fx.emit('shock'); }
    // Leuchtspur zum nächsten Einschlag: der Blitz „läuft“ um das Ziel
    const a2 = yaw + ((i + 1) / n) * Math.PI * 6, x2 = cx + Math.sin(a2) * r, z2 = cz + Math.cos(a2) * r;
    vf.bolt(x, y + 1, z, x2, this.yOf(x2, z2, cy) + 1, z2, p.acc, 0.14, 0.12, bo(2, 0, 0.14));
    this.stats.orbitBolts++;
    ORBIT.x = x; ORBIT.z = z;
    return ORBIT;
  }

  /** Sturmfaust der Tausend Blitze – der Zentralschlag: eine riesige Kugelblitz-Kuppel sprengt auf */
  stormDome(x: number, y: number, z: number, yaw: number, R: number) {
    const fx = this.fx, b = fx.brush, vf = this.vfx, p = PAL_STURM;
    // Kuppel aus Großkreisen, die aufplatzen, und einer Krone aus Kegeln nach allen Seiten
    for (let i = 0; i < 4; i++) {
      b.reset().at(x, y + R * 0.2, z).rot(yaw + i * 0.8, Math.PI / 2, i * 0.5).spin(i % 2 ? -2 : 2, 0, 1).size(R * 0.2, 1, R * 0.2, R * 1.25, 1, R * 1.25).span(0.75).col(i % 2 ? WHITE : p.core, 2).fade(0.02, 0.6);
      b.flicker = 0.25;
      fx.emit('ring');
    }
    for (let i = 0; i < 8; i++) {
      const a = yaw + (i / 8) * Math.PI * 2;
      this.cone(x, y + 1.5, z, a, -0.6, R * 0.22, R * 0.75, p, 0.55, 2.1, i * 0.01, Math.sin(a) * R * 1.3, R * 0.9, Math.cos(a) * R * 1.3, 4);
    }
    this.cone(x, y + 0.2, z, yaw, -Math.PI / 2, R * 0.4, R * 1.3, p, 0.7, 2.3, 0, 0, R * 1.6, 0, 7);
    for (let k = 1; k <= 5; k++) { b.reset().at(x, y + 0.2, z).rot(rnd() * 6).size(2, 1, 2, R * (0.5 + k * 0.38), 1, R * (0.5 + k * 0.38)).span(0.5 + k * 0.12, k * 0.05).col(k % 2 ? p.acc : WHITE, 2.1).fade(0.01, 0.6); fx.emit('shock'); }
    for (let i = 0; i < this.n(7); i++) {
      const a = rnd() * Math.PI * 2, r = R * (0.5 + rnd() * 0.9), el = rnd() * 1.1;
      vf.bolt(x, y + 2, z, x + Math.sin(a) * r * Math.cos(el), y + 2 + Math.sin(el) * r, z + Math.cos(a) * r * Math.cos(el), i % 2 ? p.core : WHITE, 0.36, 0.3 + rnd() * 0.3, bo(3, 1, 0.18));
    }
    vf.bolt(x, y + 70, z, x, y + 0.2, z, WHITE, 1.2, 0.4, bo(5, 3, 0.08));
    vf.surfaceHit(x, y, z, R * 0.45, p.core, 2.4);
    vf.pressureRing(x, y + 2, z, 0, false, R * 1.5, p.acc, 0.7);
    vf.burst('spark', x, y + 2, z, 34, 26, p.acc, bu(9, 0.55, undefined, R * 0.4));
    vf.burst('spark', x, y + 1, z, 18, 9, WHITE, bu(3, 0.24, 1, R, undefined, 0.35));
    this.stats.domes++;
  }

  /** Weltenbrecher-Erdspalter an Land: ein glühender Magma-Graben reißt von (x, z) aus `length` m weit auf */
  magmaTrench(x: number, y: number, z: number, yaw: number, length: number, width: number, life: number) {
    const fx = this.fx, b = fx.brush, vf = this.vfx, p = PAL_ERD;
    const fwX = Math.sin(yaw), fwZ = Math.cos(yaw);
    // Hauptgraben in zwei Stücken (folgt dem Gelände), dazu schräge Nebenspalten
    const half = length * 0.5;
    for (let s = 0; s < 2; s++) {
      const px = x + fwX * half * s, pz = z + fwZ * half * s;
      this.fissure(px, this.surf.groundY(px, pz, y), pz, yaw, half * 1.04, width, MAGMA, p.rock, life, 0.3, 2, s * 0.22);
    }
    for (let i = 0; i < 6; i++) {
      const d = length * (0.12 + i * 0.14), side = i % 2 ? 1 : -1, a = yaw + side * (0.55 + rnd() * 0.5);
      const px = x + fwX * d, pz = z + fwZ * d;
      this.fissure(px, this.surf.groundY(px, pz, y), pz, a, width * (1.2 + rnd()), width * 0.42, MAGMA, p.rock, life * 0.8, 0.2, 1.7, 0.12 + i * 0.05);
    }
    // Schockwelle voran, Glut und Rauch entlang des Grabens
    this.cone(x, y + 1.2, z, yaw, 0, width * 0.5, width * 1.5, p, 0.5, 2, 0, fwX * length * 2, 0, fwZ * length * 2, 3);
    const n = Math.max(4, Math.round(length / 7));
    for (let i = 0; i < n; i++) {
      const d = (length * (i + 0.5)) / n, px = x + fwX * d, pz = z + fwZ * d, gy = this.surf.groundY(px, pz, y), dl = (d / length) * 0.42;
      vf.burst('ember', px, gy + 0.4, pz, 5, 3, MAGMA, { up: 9, size: 0.4, spread: width * 0.3, delay: dl });
      vf.burst('rock', px, gy + 0.3, pz, 4, 8, ROCK, { up: 10, size: 0.5, spread: width * 0.4, delay: dl });
      if (i % 2 === 0) vf.burst('smoke', px, gy + 0.8, pz, 2, 1.2, SMOKE, { up: 3, size: 2.4, life: 1.8, delay: dl + 0.2, spread: width * 0.3 });
      if (i % 3 === 0) this.pillar(i, px + fwZ * width * 0.55, gy, pz - fwX * width * 0.55, 2 + rnd() * 2, life * 0.6, dl, p, false);
    }
    b.reset().at(x, y + 0.2, z).rot(rnd() * 6).size(2, 1, 2, width * 3, 1, width * 3).span(0.6).col(p.core, 2).fade(0.01, 0.6);
    fx.emit('shock');
    vf.surfaceHit(x, y, z, width * 0.7, p.core, 2);
  }

  /** Weltenbrecher-Erdspalter auf See: Gischtkronen und Tiefsee-Leuchten entlang des Grabens (das Meer selbst teilt `setTrench`) */
  seaSplit(x: number, z: number, yaw: number, from: number, length: number, halfWidth: number, depth: number) {
    const fx = this.fx, b = fx.brush, vf = this.vfx, p = PAL_ERD;
    const fwX = Math.sin(yaw), fwZ = Math.cos(yaw);
    const n = Math.max(5, Math.round((length - from) / 9));
    for (let i = 0; i < n; i++) {
      const d = from + ((length - from) * (i + 0.5)) / n, dl = ((d - from) / Math.max(1, length - from)) * 0.3;
      for (let side = -1; side <= 1; side += 2) {
        const px = x + fwX * d + fwZ * side * (halfWidth + 1.5), pz = z + fwZ * d - fwX * side * (halfWidth + 1.5), wy = this.surf.waterY(px, pz);
        const h = depth * (0.9 + rnd() * 0.8) + 3;
        b.reset().at(px, wy - 0.5, pz).rot(rnd() * 6).size(3, h * 0.2, 3, 6.5, h, 6.5).span(1.5 + rnd() * 0.5, dl).col(SPRAY, 1).fade(0.03, 0.5);
        fx.emit('splash');
        vf.burst('drop', px, wy + 1, pz, 6, 6, SPRAY, { up: h * 1.3, size: 0.45, spread: 3, delay: dl });
        if (i % 2 === 0) vf.burst('mist', px, wy + 2, pz, 2, 2, SPRAY, { up: 2.5, size: 3.2, life: 1.4, delay: dl + 0.1 });
      }
      // leuchtende Tiefsee-Spalte am Grund des Grabens
      const cx = x + fwX * d, cz = z + fwZ * d;
      if (i % 2 === 0) this.fissure(cx, -depth + 0.4, cz, yaw, ((length - from) / n) * 2.1, halfWidth * 1.3, DEEP, null, 3, 0.3, 2, dl);
    }
    const sx = x + fwX * from, sz = z + fwZ * from;
    this.cone(sx, this.surf.waterY(sx, sz) + 1.5, sz, yaw, 0, halfWidth * 0.8, halfWidth * 2.4, p, 0.5, 2, 0, fwX * length * 2.2, 0, fwZ * length * 2.2, 3);
    this.stats.fountains++;
  }

  /** Himmelssturz – Einschlag eines Vorhut-Meteoriten: Feuer- bzw. Gischtfontäne, Stoßkrone, Krater mit glühenden Rissen */
  shardImpact(x: number, y: number, z: number, yaw: number) {
    const fx = this.fx, b = fx.brush, vf = this.vfx, p = PAL_KOSMOS;
    const land = this.surf.isLand(x, z);
    this.cone(x, y + 0.2, z, yaw, -Math.PI / 2, 3.4, 9, p, 0.45, 2, 0, 0, 16, 0, 5);
    for (let k = 1; k <= 3; k++) { b.reset().at(x, y + 0.2, z).rot(rnd() * 6).size(1, 1, 1, 5 + k * 5, 1, 5 + k * 5).span(0.4 + k * 0.1, k * 0.04).col(k % 2 ? p.core : WHITE, 2).fade(0.01, 0.6); fx.emit('shock'); }
    b.reset().at(x, y - 0.5, z).size(2, 4, 2, 5, 26, 5).span(0.85).col(land ? MAGMA : SPRAY, land ? 1.7 : 1).fade(0.02, 0.5);
    fx.emit(land ? 'column' : 'splash');
    vf.surfaceHit(x, y, z, 6.5, p.core, 1.7);
    for (let i = 0; i < 4; i++) { const a = yaw + i * (Math.PI / 2) + 0.4; this.fissure(x + Math.sin(a), y, z + Math.cos(a), a, 8, 1.8, land ? MAGMA : DEEP, land ? p.rock : null, 2, 0.16, 1.8, i * 0.01); }
    vf.burst(land ? 'rock' : 'drop', x, y + 0.5, z, 10, 15, land ? ROCK : SPRAY, { up: 12, size: land ? 0.7 : 0.5, spread: 3 });
    vf.burst('ember', x, y + 1, z, 16, 12, p.core, { up: 8, size: 0.45, spread: 3 });
    vf.burst('smoke', x, y + 2, z, 3, 2, SMOKE, { up: 4, size: 4, life: 1.8, spread: 3 });
    this.stats.vanguard++;
  }

  /**
   * Himmelssturz – der Kataklysmus: Wasser- bzw. Lava-Fontäne (`SKYFALL_COLOSSUS.fountain` m hoch), aufgerissener Krater aus sechs Spalten,
   * Stoßkrone, gestaffelte Druckwellen, Gestein, Glut und Rauch.
   */
  cataclysm(x: number, y: number, z: number, yaw: number, reach: number) {
    const fx = this.fx, b = fx.brush, vf = this.vfx, p = PAL_KOSMOS;
    const land = this.surf.isLand(x, z), F = SKYFALL_COLOSSUS.fountain, C = SKYFALL_COLOSSUS.crater;
    const col = land ? MAGMA : SPRAY;
    // Fontäne in drei Schichten: breiter Fuß, hohe Säule, weißglühender bzw. schaumweißer Kern
    b.reset().at(x, y - 2, z).size(9, F * 0.12, 9, 24, F * 0.55, 24).span(1.5).col(col, land ? 1.5 : 0.9).fade(0.02, 0.5);
    fx.emit(land ? 'column' : 'splash');
    b.reset().at(x, y - 2, z).size(5, F * 0.2, 5, 13, F, 13).span(1.35).col(col, land ? 1.9 : 1).fade(0.02, 0.5);
    fx.emit('column');
    b.reset().at(x, y - 2, z).size(2, F * 0.25, 2, 6, F * 1.04, 6).span(1.1).col(WHITE, 1.8).fade(0.02, 0.55);
    fx.emit('column');
    if (!land) { b.reset().at(x, y - 1, z).rot(rnd() * 6).size(12, 6, 12, C * 1.1, 34, C * 1.1).span(1.6).col(SPRAY, 1).fade(0.03, 0.45); fx.emit('splash'); }
    // Stoßkrone und acht Kegel nach außen
    this.cone(x, y + 0.5, z, yaw, -Math.PI / 2, C * 0.5, F * 0.5, p, 0.9, 2.2, 0, 0, F * 0.7, 0, 5);
    for (let i = 0; i < 8; i++) { const a = yaw + (i / 8) * Math.PI * 2; this.cone(x, y + 2, z, a, -0.25, C * 0.24, C * 0.8, p, 0.7, 2, i * 0.012, Math.sin(a) * reach * 1.3, 6, Math.cos(a) * reach * 1.3, 3); }
    // Krater: sechs breite Spalten sternförmig, dazwischen kürzere Risse
    for (let i = 0; i < 6; i++) {
      const a = yaw + (i / 6) * Math.PI * 2 + 0.26;
      this.fissure(x + Math.sin(a) * 3, land ? this.surf.groundY(x + Math.sin(a) * 3, z + Math.cos(a) * 3, y) : y, z + Math.cos(a) * 3, a, C, 7.5, land ? MAGMA : DEEP, land ? p.rock : null, 3, 0.26, 2, i * 0.02);
      const a2 = a + Math.PI / 6;
      this.fissure(x + Math.sin(a2) * 5, y, z + Math.cos(a2) * 5, a2, C * 0.55, 3.6, land ? MAGMA : DEEP, land ? p.rock : null, 2.4, 0.2, 1.8, 0.06 + i * 0.02);
    }
    for (let k = 1; k <= 6; k++) { b.reset().at(x, y + 0.3, z).rot(rnd() * 6).size(4, 1, 4, reach * (0.35 + k * 0.28), 1, reach * (0.35 + k * 0.28)).span(0.7 + k * 0.14, k * 0.06).col(k % 2 ? p.core : k % 3 ? WHITE : p.acc, 2.2).fade(0.01, 0.6); fx.emit('shock'); }
    vf.pressureRing(x, y + 3, z, 0, false, reach * 1.4, p.core, 0.9);
    vf.surfaceHit(x, y, z, Math.min(24, C * 0.6), p.core, 2.8);
    vf.burst(land ? 'rock' : 'drop', x, y + 1, z, 30, 30, land ? ROCK : SPRAY, { up: 26, size: land ? 1.4 : 0.9, spread: C * 0.4 });
    vf.burst('ember', x, y + 3, z, 60, 34, p.core, { up: 22, size: 0.8, spread: C * 0.4 });
    vf.burst('smoke', x, y + 4, z, 14, 5, SMOKE, { up: 9, size: 9, spread: C * 0.5, life: 2.6 });
    vf.burst('ember', x, y + 8, z, 40, 10, p.acc, { up: 4, size: 0.5, life: 1.8, delay: 0.5, spread: reach * 0.7, grav: 5 });
    this.stats.fountains++;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Ultimates – Welt-Zeitachsen (Spielzeit nach dem Einschlag der Engine); Schiffe nur über die Kataklysmus-Regie
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * „Sturmfaust der Tausend Blitze“: bis zum Treffermoment (`lag`) umkreisen 24 Blitzeinschläge das Ziel (Schiffe werden gezeichnet), dann
   * sprengt der Zentralschlag die Kugelblitz-Kuppel auf – das Zielschiff zerbricht, die übrigen nehmen schweren Schaden.
   */
  stepFistStorm(d: KinoBridge, c: Cast, t0: number, t: number) {
    const s = c.spec!, L = Math.max(0.1, c.lag), N = 24;
    const cy = this.yOf(c.cx, c.cz, c.y);
    // Radius der Umkreisung: um das Zielschiff herum (halbe Länge + Luft), an Land der Wirkungsradius
    let R = Math.max(7, Math.min(s.reach * 0.38, 12));
    const tgt = d.ships.length ? this.closest(d.ships, c.cx, c.cz) : null;
    if (tgt) R = Math.max(R, tgt.ship.cls.L * 0.55 + 4);
    if (t < L) {
      const i0 = t0 <= 0 ? -1 : Math.floor((t0 / L) * N), i1 = Math.min(N - 1, Math.floor((t / L) * N));
      for (let i = i0 + 1; i <= i1; i++) {
        const o = this.orbitBolt(i, N, c.cx, cy, c.cz, R, c.yaw);
        d.threat(o.x, cy + 3, o.z);
        // getroffene Rümpfe: Blitzspuren, Splitter – zerbrochen wird erst im Treffermoment
        for (const e of d.ships) if (e.ship.sinking <= 0 && Math.hypot(e.ship.x - o.x, e.ship.z - o.z) < e.ship.cls.L * 0.5 + 3) { d.mark(c, e); if (i % 4 === 0) e.ship.punchHoles(1); }
        if (i % 6 === 0) this.shakeCam(0.35);
      }
    }
    // der Zentralschlag: kurz vor dem Treffermoment löst sich ein Bündel aus Phantom-Fäusten und Blitzen vom Kapitän und rast ins Ziel
    const TB = Math.max(0.02, L - 0.16);
    if (t0 < TB && t >= TB) {
      const dx = c.cx - c.x, dz = c.cz - c.z, dist = Math.max(2, Math.hypot(dx, dz)), yaw = Math.atan2(dx, dz);
      const k = Math.max(1, Math.min(3, dist / 30));
      this.barrage(c.x + (dx / dist) * 1.5, c.y + 1.3, c.z + (dz / dist) * 1.5, yaw, 0, 1.6 * k, 5.2 * k, PAL_STURM, L - TB + 0.03, 2.2, 0, dist / (L - TB), 0.2);
      this.cone(c.x + (dx / dist) * 1.5, c.y + 1.3, c.z + (dz / dist) * 1.5, yaw, 0, 1.3 * k, 4 * k, PAL_STURM, L - TB + 0.03, 2, 0, (dx / dist) * dist / (L - TB), 0, (dz / dist) * dist / (L - TB), 8);
    }
    if (t0 < L && t >= L) {
      this.stormDome(c.cx, cy, c.cz, c.yaw, Math.max(R * 1.6, 16));
      d.shake(1.5);
      // das Zielschiff (und was die Kuppel umschließt) zerbricht, der weitere Umkreis nimmt schweren Schaden und wird weggedrückt
      for (const e of d.ships) {
        if (e.ship.sinking > 0) continue;
        const dist = Math.hypot(e.ship.x - c.cx, e.ship.z - c.cz) - e.ship.cls.L * 0.5;
        if (dist <= R * 1.25) { d.wreck(e, 2, 0.5, 0.4); d.shipStrike(c, e, 'radial', 3, 3); }
      }
      d.areaShips(c, c.cx, c.cz, s.reach * 1.6 + 20, 0.9, 'shove');
    }
    // Nachbeben: Restladungen zucken über Boden bzw. Wasser
    if (t > L + 0.08 && t < L + 1.1 && c.tick > 0.07) {
      c.tick = 0;
      const a = rnd() * Math.PI * 2, r = R * (0.4 + rnd() * 1.4), a2 = a + (rnd() - 0.5) * 1.6, r2 = r * (0.5 + rnd() * 0.8);
      const x0 = c.cx + Math.sin(a) * r, z0 = c.cz + Math.cos(a) * r, x1 = c.cx + Math.sin(a2) * r2, z1 = c.cz + Math.cos(a2) * r2;
      this.vfx.bolt(x0, this.yOf(x0, z0, cy) + 0.3, z0, x1, this.yOf(x1, z1, cy) + 0.3, z1, rnd() < 0.5 ? PAL_STURM.core : WHITE, 0.12, 0.14, bo(3, 1, 0.25));
    }
  }

  /**
   * „Weltenbrecher-Erdspalter“: der Zentralschlag fährt in Akt 2 nieder; im Treffermoment reißt an Land ein glühender Magma-Graben auf,
   * auf See teilt die Schockwelle das Meer bis zum Grund (Graben `setTrench`) und zerbricht das Zielschiff in zwei Hälften.
   */
  stepWorldSplit(d: KinoBridge, c: Cast, t0: number, t: number, dur: number) {
    const s = c.spec!, L = Math.max(0.05, c.lag);
    const fwX = Math.sin(c.yaw), fwZ = Math.cos(c.yaw), f0 = c.from;
    if (t < L) d.threat(c.x + fwX * Math.max(20, f0 + 10), this.yOf(c.x + fwX * 20, c.z + fwZ * 20, c.y) + 1, c.z + fwZ * Math.max(20, f0 + 10));
    if (t0 === 0 && t > 0) {
      // der Schlag fährt nieder: Kegel senkrecht auf den Punkt vor den Fäusten, der Boden zieht sich zusammen
      const px = c.x + fwX * 1.6, pz = c.z + fwZ * 1.6;
      this.cone(px, c.y + 4.2, pz, c.yaw, Math.PI / 2, 1.9, 3.8, PAL_ERD, L + 0.03, 2.1, 0, 0, -3.2 / L, 0, 3);
      const fx = this.fx, b = fx.brush;
      b.reset().at(px, c.y + 0.12, pz).rot(rnd() * 6).size(9, 1, 9, 1.2, 1, 1.2).span(L + 0.03).col(PAL_ERD.acc, 1.7).fade(0.1, 0.3);
      fx.emit('ring');
    }
    const decisive = t0 < L && t >= L;
    if (c.trench) {
      // der Graben öffnet sich im Treffermoment schlagartig, steht und schließt sich in der letzten Sekunde
      const u = t - L;
      const open = u <= 0 ? 0 : smooth(u / 0.22), close = 1 - smooth((t - (dur - 1.15)) / 1.1);
      const depth = s.trench * Math.min(open, close);
      const ax = c.x + fwX * f0, az = c.z + fwZ * f0, bx = c.x + fwX * s.reach, bz = c.z + fwZ * s.reach;
      d.setTrench(ax, az, bx, bz, s.width * 0.5, depth);
      // Schiffe im Graben stürzen zur Grabenmitte
      if (u > 0.04 && t < dur - 1.3) for (const e of d.ships) {
        if (e.ship.sinking > 0) continue;
        const ex = e.ship.x - c.x, ez = e.ship.z - c.z;
        const along = ex * fwX + ez * fwZ, across = ex * fwZ - ez * fwX;
        if (along < f0 - 4 || along > s.reach || Math.abs(across) > s.width * 0.5 + e.ship.cls.W) continue;
        d.pull(e, c.x + fwX * along, c.z + fwZ * along, 3 * (t - t0));
      }
      if (decisive) {
        this.seaSplit(c.x, c.z, c.yaw, f0, s.reach, s.width * 0.5, s.trench);
        // jedes Schiff auf der Linie zerbricht quer in zwei Hälften (Bug und Heck kippen in den Graben)
        for (const e of d.ships) {
          const ex = e.ship.x - c.x, ez = e.ship.z - c.z;
          const along = ex * fwX + ez * fwZ, across = Math.abs(ex * fwZ - ez * fwX);
          if (along > f0 - 4 - e.ship.cls.L * 0.5 && along < s.reach + e.ship.cls.L * 0.5 && across < s.width * 0.5 + e.ship.cls.W) {
            if (!c.marked.includes(e)) c.marked.push(e);
            d.shipStrike(c, e, 'cross', 0, 2);
            const mx = c.x + fwX * along, mz = c.z + fwZ * along, wy = this.surf.waterY(mx, mz);
            this.vfx.burst('splinter', mx, wy + 1.5, mz, 14, 9, WHITE, { up: 6, size: 0.45, spread: e.ship.cls.W });
            this.vfx.pressureRing(mx, wy + 2, mz, c.yaw, true, e.ship.cls.W * 1.2, WHITE, 0.4);
          }
        }
        d.shake(1.5);
      }
      // Gischt fällt von den Wänden, solange der Graben steht
      if (t > L + 0.2 && t < dur - 1 && c.tick > 0.09) {
        c.tick = 0;
        const dd = f0 + 2 + rnd() * (s.reach - f0 - 4), side = rnd() < 0.5 ? -1 : 1;
        const wx = c.x + fwX * dd + fwZ * side * s.width * 0.5, wz = c.z + fwZ * dd - fwX * side * s.width * 0.5;
        this.vfx.burst('drop', wx, 2, wz, 4, 4, SPRAY, bu(4, 0.3, undefined, 3));
        if (rnd() < 0.4) this.vfx.burst('mist', wx, 1.5, wz, 1, 1.5, SPRAY, bu(1.5, 3, 1.1));
      }
    } else if (decisive) {
      // an Land: der Magma-Graben reißt auf (so weit das Land reicht, höchstens 70 m)
      let len = 12;
      for (let k = 2; k <= 14; k++) { const dd = k * 5; if (!this.surf.isLand(c.x + fwX * dd, c.z + fwZ * dd)) break; len = dd; }
      this.magmaTrench(c.x + fwX * 2.2, c.y, c.z + fwZ * 2.2, c.yaw, Math.min(70, len), 9, dur - L);
      d.cracks(5);
      d.shake(1.5);
    }
    // Nachbeben an Land: Glut steigt aus dem Graben
    if (!c.trench && t > L + 0.15 && t < dur - 0.6 && c.tick > 0.1) {
      c.tick = 0;
      const dd = 3 + rnd() * 50, px = c.x + fwX * dd, pz = c.z + fwZ * dd;
      if (this.surf.isLand(px, pz)) this.vfx.burst('ember', px, this.surf.groundY(px, pz, c.y) + 0.4, pz, 3, 2, MAGMA, bu(6, 0.35, undefined, 3));
    }
  }

  /** Einschlagsort des Vorhut-Meteoriten i: ein Begleitschiff (wenn es eins gibt), sonst die Umgebung um den Mittelpunkt */
  private shardTarget(d: KinoBridge, c: Cast, i: number, main: EnemyShip | null, out: { x: number; y: number; z: number }) {
    let n = 0;
    for (const e of d.ships) {
      if (e === main || e.ship.sinking > 0) continue;
      if (n === i) { out.x = e.ship.x; out.z = e.ship.z; out.y = this.surf.waterY(out.x, out.z); return; }
      n++;
    }
    const o = SKYFALL_SHARDS[i % SKYFALL_SHARDS.length];
    const fwX = Math.sin(c.yaw), fwZ = Math.cos(c.yaw);
    out.x = c.cx + fwX * o[0] + fwZ * o[1]; out.z = c.cz + fwZ * o[0] - fwX * o[1];
    out.y = this.yOf(out.x, out.z, c.y);
  }

  /** Startbilder des Himmelssturzes (Einschlag der Engine = Beginn von Stufe 2): Einschlagsorte der Vorhut festlegen, Brocken auf den Weg schicken */
  beginSkyfall(d: KinoBridge, c: Cast) {
    this.shardHit.fill(0);
    const main = d.ships.length ? this.closest(d.ships, c.cx, c.cz) : null;
    const fwX = Math.sin(c.yaw), fwZ = Math.cos(c.yaw);
    const fly = 0.42;
    for (let i = 0; i < SKYFALL_TIMES.shards.length; i++) {
      this.shardTarget(d, c, i, main, P3);
      this.shardX[i] = P3.x; this.shardZ[i] = P3.z; this.shardY[i] = P3.y;
      // schräge Bahn von weit vorn oben, über Kreuz von links und rechts: die Kamera hinter der Figur sieht die Feuerschweife über den Himmel ziehen
      const side = i % 2 ? 1 : -1;
      const sx = P3.x + fwX * 120 - fwZ * side * 60, sz = P3.z + fwZ * 120 + fwX * side * 60, sy = P3.y + 150;
      this.shard(i, sx, sy, sz, P3.x, P3.y, P3.z, SHARD_SIZE, fly, Math.max(0, SKYFALL_TIMES.shards[i] - fly), PAL_KOSMOS);
    }
  }

  /**
   * „Himmelssturz“ ab dem Einschlag der Engine: Stufe 2 – fünf Vorhut-Meteoriten schlagen ein (Umgebung, Begleitschiffe); Stufe 3 – der
   * 45 m große Koloss rast mit Plasma-Bugwelle herab (die Kamera folgt seinem Ort); Stufe 4 – Kataklysmus: Fontäne, Krater, Schiffe zerbrechen.
   */
  stepSkyfall(d: KinoBridge, c: Cast, t0: number, t: number, dur: number) {
    const s = c.spec!;
    const T = SKYFALL_TIMES, TC = T.colossus, TS = T.colossusFrom;
    const fwX = Math.sin(c.yaw), fwZ = Math.cos(c.yaw);
    const gy = this.yOf(c.cx, c.cz, c.y);
    // ----- Stufe 2: Vorhut-Bombardement -----
    for (let i = 0; i < T.shards.length; i++) {
      const ti = T.shards[i];
      if (t < ti && t >= ti - 0.42 && t < TS) {
        // Kamera-Anker: der gerade stürzende Brocken
        const u = 1 - (ti - t) / 0.42, side = i % 2 ? 1 : -1;
        const sx = this.shardX[i] + fwX * 120 - fwZ * side * 60, sz = this.shardZ[i] + fwZ * 120 + fwX * side * 60, sy = this.shardY[i] + 150;
        if (i === 0 || t >= T.shards[i - 1]) d.threat(sx + (this.shardX[i] - sx) * u, sy + (this.shardY[i] - sy) * u, sz + (this.shardZ[i] - sz) * u);
      }
      if (t0 < ti && t >= ti) {
        this.shardImpact(this.shardX[i], this.shardY[i], this.shardZ[i], c.yaw);
        this.shardHit[i] = 1;
        d.shake(0.9);
      }
      // Begleitschiffe am Einschlag: zerschmettert bzw. schwer getroffen – je Bild höchstens eines
      if (this.shardHit[i] && t0 >= ti) {
        const e = d.nearestUnhit(c, this.shardX[i], this.shardZ[i], 12);
        if (e && e !== this.mainShip(d, c)) { e.ship.fire = Math.max(e.ship.fire, 10); d.wreck(e, 2, 0.6, 0.6); d.shipStrike(c, e, 'radial', 4, 3); }
        this.shardHit[i] = 0;
      }
    }
    // ----- Stufe 3: der Koloss -----
    const fly = TC - TS;
    // Start hoch am Himmel, weit voraus – er stürzt der Figur schräg entgegen
    const sx = c.cx + fwX * 330, sz = c.cz + fwZ * 330, sy = gy + 420;
    if (t0 < TS && t >= TS) {
      this.colossus(sx, sy, sz, c.cx, gy + SKYFALL_COLOSSUS.size * 0.2, c.cz, SKYFALL_COLOSSUS.size, fly, PAL_KOSMOS);
      d.shake(0.6);
    }
    if (t >= TS && t < TC) {
      const u = (t - TS) / fly;
      const px = sx + (c.cx - sx) * u, py = sy + (gy + SKYFALL_COLOSSUS.size * 0.2 - sy) * u, pz = sz + (c.cz - sz) * u;
      d.threat(px, py, pz);
      if (c.tick > 0.05) {
        c.tick = 0;
        // Rauch- und Glutspur hinter dem Koloss
        const bx = px + fwX * 34, by = py + 40, bz = pz + fwZ * 34;
        this.vfx.burst('smoke', bx, by, bz, 2, 2, TMP.setRGB(0.07, 0.04, 0.08), bu(2, 16, 1.3, 14));
        this.vfx.burst('ember', bx, by, bz, 5, 9, PAL_KOSMOS.core, bu(2, 1.3, 0.9, 18));
      }
    }
    // ----- Stufe 4: Kataklysmus -----
    if (t0 < TC && t >= TC) {
      this.cataclysm(c.cx, gy, c.cz, c.yaw, s.reach);
      if (!this.surf.isLand(c.cx, c.cz)) c.trench = true;
      d.cracks(5);
      d.shake(1.9);
      this.shardHit[5] = 1;
    }
    if (this.shardHit[5] && t0 >= TC) {
      // Schiffe im Kollisionsradius: radial zerschmettert (je Bild eins), danach trifft die Druckwelle den Rest
      const e = d.nearestUnhit(c, c.cx, c.cz, s.reach);
      if (e) { e.ship.fire = Math.max(e.ship.fire, 12); d.wreck(e, 3, 0.85, 0.8); d.shipStrike(c, e, 'radial', 6, 4); }
      else { this.shardHit[5] = 0; d.areaShips(c, c.cx, c.cz, s.reach + 40, 0.8, 'shove'); }
    }
    // Meerestrichter unter der Fontäne: öffnet sich und schließt sich zum Ende der Welt-Zeitachse
    if (c.trench) {
      const R = SKYFALL_COLOSSUS.crater * 0.6;
      const open = Math.min(1, (t - TC) / 0.2), close = Math.min(1, Math.max(0, dur - t) / 1.1);
      d.setTrench(c.cx - fwX * R, c.cz - fwZ * R, c.cx + fwX * R, c.cz + fwZ * R, R * 1.1, 8 * Math.min(open, close));
    }
    // Nachglühen: Glut regnet, Rauchsäulen steigen aus dem Krater
    if (t > TC + 0.12 && t < dur - 0.4 && c.tick > 0.07) {
      c.tick = 0;
      const a = rnd() * Math.PI * 2, r = rnd() * s.reach * 0.7;
      const px = c.cx + Math.sin(a) * r, pz = c.cz + Math.cos(a) * r;
      this.vfx.burst('ember', px, gy + 0.5, pz, 3, 3, rnd() < 0.5 ? PAL_KOSMOS.core : PAL_KOSMOS.acc, bu(6, 0.5, undefined, 2));
      if (rnd() < 0.3) this.vfx.burst('smoke', px, gy + 1, pz, 1, 1.2, TMP2.setRGB(0.05, 0.04, 0.05), bu(5, 5, 2));
    }
  }

  private mainShip(d: KinoBridge, c: Cast): EnemyShip | null { return d.ships.length ? this.closest(d.ships, c.cx, c.cz) : null; }

  private closest(list: readonly EnemyShip[], x: number, z: number): EnemyShip | null {
    let best: EnemyShip | null = null, bd = 1e9;
    for (const e of list) { if (e.ship.sinking > 0) continue; const dd = Math.hypot(e.ship.x - x, e.ship.z - z); if (dd < bd) { bd = dd; best = e; } }
    return best;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Mitspieler: dasselbe Ultimate als reine Darstellung (kein Schaden, keine Schiffe, keine Kamera) – von außen komplett sichtbar
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Kino-Ultimate eines Mitspielers je Bild darstellen: `t0` → `t` = Zeit auf seiner Zeitachse (echte s ab Start), Kapitän an (ox, oy, oz) mit
   * Blick `yaw`, Ziel (tx, ty, tz). Phase 1: Aufbau und Aufladung am Kapitän (blaue Blitze um die Fäuste, tektonisches Glühen bzw.
   * Gravitations-Ringe); Phase 2: 24 umkreisende Blitzeinschläge und das Faust-Bündel, der niederfahrende Zentralschlag bzw. fünf
   * Vorhut-Meteoriten und der Koloss; Treffermoment: Kugelblitz-Kuppel, Magma-Graben bzw. geteiltes Meer, Kataklysmus; danach das Nachbeben.
   */
  remoteUlt(tl: DirectorTimeline, ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, yaw: number, sea: boolean, t0: number, t: number) {
    const kind = tl.cataclysm;
    if (kind !== 'fistStorm' && kind !== 'oceanSplit' && kind !== 'skyfall') return;
    const T1 = tl.t1, T2 = tl.t2, D = Math.max(0.1, T2 - T1);
    const fwX = Math.sin(yaw), fwZ = Math.cos(yaw);
    const gy = this.yOf(tx, tz, ty);
    if (t0 <= 0 && t > 0) this.formBuild(tl, ox, oy, oz, yaw, sea ? 2 : 1, sea);
    // ----- Phase 1: Aufladung am Kapitän (alle 45 ms) -----
    if (t < T1 && Math.floor(t / 0.045) !== Math.floor(t0 / 0.045)) {
      const sx = Math.cos(yaw) * 0.3, sz = -Math.sin(yaw) * 0.3, hy = oy + (kind === 'skyfall' ? 2.05 : 1.3);
      this.chargeTick(kind, ox, oy, oz, yaw, t / T1, 1, ox - sx + fwX * 0.25, hy, oz - sz + fwZ * 0.25, ox + sx + fwX * 0.25, hy, oz + sz + fwZ * 0.25, sea);
    }
    if (kind === 'fistStorm') {
      const N = 24, R = sea ? 22 : 10;
      if (t >= T1 && t0 < T2) {
        const i0 = t0 < T1 ? -1 : Math.floor(((t0 - T1) / D) * N), i1 = Math.min(N - 1, Math.floor(((t - T1) / D) * N));
        for (let i = i0 + 1; i <= i1; i++) this.orbitBolt(i, N, tx, gy, tz, R, yaw);
      }
      const TB = Math.max(T1, T2 - 0.16);
      if (t0 < TB && t >= TB) {
        const dx = tx - ox, dz = tz - oz, dist = Math.max(2, Math.hypot(dx, dz)), ya = Math.atan2(dx, dz), k = Math.max(1, Math.min(3, dist / 30)), fly = Math.max(0.05, T2 - TB);
        this.barrage(ox + (dx / dist) * 1.5, oy + 1.3, oz + (dz / dist) * 1.5, ya, 0, 1.6 * k, 5.2 * k, PAL_STURM, fly + 0.03, 2.2, 0, dist / fly, 0.2);
        this.cone(ox + (dx / dist) * 1.5, oy + 1.3, oz + (dz / dist) * 1.5, ya, 0, 1.3 * k, 4 * k, PAL_STURM, fly + 0.03, 2, 0, (dx / dist) * dist / fly, 0, (dz / dist) * dist / fly, 8);
      }
      if (t0 < T2 && t >= T2) this.stormDome(tx, gy, tz, yaw, Math.max(R * 1.6, 16));
      if (t > T2 + 0.08 && t < T2 + 1.1 && Math.floor(t / 0.07) !== Math.floor(t0 / 0.07)) {
        const a = rnd() * Math.PI * 2, r = R * (0.4 + rnd() * 1.4), a2 = a + (rnd() - 0.5) * 1.6, r2 = r * (0.5 + rnd() * 0.8);
        const x0 = tx + Math.sin(a) * r, z0 = tz + Math.cos(a) * r, x1 = tx + Math.sin(a2) * r2, z1 = tz + Math.cos(a2) * r2;
        this.vfx.bolt(x0, this.yOf(x0, z0, gy) + 0.3, z0, x1, this.yOf(x1, z1, gy) + 0.3, z1, rnd() < 0.5 ? PAL_STURM.core : WHITE, 0.12, 0.14, bo(3, 1, 0.25));
      }
    } else if (kind === 'oceanSplit') {
      const px = ox + fwX * 1.6, pz = oz + fwZ * 1.6;
      if (t0 < T1 && t >= T1) {
        // der Zentralschlag fährt nieder: Kegel senkrecht vor den Fäusten, der Boden zieht sich zusammen
        this.cone(px, oy + 4.2, pz, yaw, Math.PI / 2, 1.9, 3.8, PAL_ERD, D + 0.03, 2.1, 0, 0, -3.2 / D, 0, 3);
        const fx = this.fx, b = fx.brush;
        b.reset().at(px, oy + 0.12, pz).rot(rnd() * 6).size(9, 1, 9, 1.2, 1, 1.2).span(D + 0.03).col(PAL_ERD.acc, 1.7).fade(0.1, 0.3);
        fx.emit('ring');
      }
      const water = sea || !this.surf.isLand(ox + fwX * 12, oz + fwZ * 12);
      if (t0 < T2 && t >= T2) {
        if (water) this.seaSplit(ox, oz, yaw, sea ? 14 : 4, Math.max(60, Math.hypot(tx - ox, tz - oz) + 20), 8, 9);
        else {
          let len = 12;
          for (let k = 2; k <= 14; k++) { const dd = k * 5; if (!this.surf.isLand(ox + fwX * dd, oz + fwZ * dd)) break; len = dd; }
          this.magmaTrench(ox + fwX * 2.2, oy, oz + fwZ * 2.2, yaw, Math.min(70, len), 9, tl.total - T2);
        }
      }
      if (!water && t > T2 + 0.15 && t < tl.total - 0.4 && Math.floor(t / 0.1) !== Math.floor(t0 / 0.1)) {
        const dd = 3 + rnd() * 50, ex = ox + fwX * dd, ez = oz + fwZ * dd;
        if (this.surf.isLand(ex, ez)) this.vfx.burst('ember', ex, this.surf.groundY(ex, ez, oy) + 0.4, ez, 3, 2, MAGMA, bu(6, 0.35, undefined, 3));
      }
    } else {
      // Himmelssturz: Zeiten der Welt-Zeitachse (ab dem Einschlag der Engine) auf Phase 2 gestreckt
      const TS = SKYFALL_TIMES, k = D / TS.colossus, flyS = 0.42;
      const g0 = t0 < T1 ? -1 : (t0 - T1) / k, g = t < T1 ? -1 : (t - T1) / k;
      if (t0 < T1 && t >= T1) {
        // Stufe 2: fünf Vorhut-Brocken gehen auf den Weg – über Kreuz von weit vorn oben
        for (let i = 0; i < TS.shards.length; i++) {
          const o = SKYFALL_SHARDS[i % SKYFALL_SHARDS.length], px = tx + fwX * o[0] + fwZ * o[1], pz = tz + fwZ * o[0] - fwX * o[1], side = i % 2 ? 1 : -1;
          const py = this.yOf(px, pz, ty);
          this.shard(i, px + fwX * 120 - fwZ * side * 60, py + 150, pz + fwZ * 120 + fwX * side * 60, px, py, pz, SHARD_SIZE, flyS, Math.max(0, TS.shards[i] * k - flyS), PAL_KOSMOS);
        }
      }
      // Einschläge der Vorhut (die Orte folgen fest aus Ziel und Blickrichtung – mehrere Himmelsstürze zugleich stören sich nicht)
      if (g >= 0) for (let i = 0; i < TS.shards.length; i++) if (g0 < TS.shards[i] && g >= TS.shards[i]) {
        const o = SKYFALL_SHARDS[i % SKYFALL_SHARDS.length], px = tx + fwX * o[0] + fwZ * o[1], pz = tz + fwZ * o[0] - fwX * o[1];
        this.shardImpact(px, this.yOf(px, pz, ty), pz, yaw);
      }
      // Stufe 3: der Koloss rast herab, Rauch- und Glutspur hinter ihm
      const sx = tx + fwX * 330, sz = tz + fwZ * 330, sy = gy + 420, ey = gy + SKYFALL_COLOSSUS.size * 0.2, fly = (TS.colossus - TS.colossusFrom) * k;
      if (g0 < TS.colossusFrom && g >= TS.colossusFrom) this.colossus(sx, sy, sz, tx, ey, tz, SKYFALL_COLOSSUS.size, fly, PAL_KOSMOS);
      if (g >= TS.colossusFrom && t < T2 && Math.floor(t / 0.05) !== Math.floor(t0 / 0.05)) {
        const u = (g - TS.colossusFrom) / (TS.colossus - TS.colossusFrom);
        const bx = sx + (tx - sx) * u + fwX * 34, by = sy + (ey - sy) * u + 40, bz = sz + (tz - sz) * u + fwZ * 34;
        this.vfx.burst('smoke', bx, by, bz, 2, 2, TMP.setRGB(0.07, 0.04, 0.08), bu(2, 16, 1.3, 14));
        this.vfx.burst('ember', bx, by, bz, 5, 9, PAL_KOSMOS.core, bu(2, 1.3, 0.9, 18));
      }
      // Stufe 4: Kataklysmus und Nachglühen
      if (t0 < T2 && t >= T2) this.cataclysm(tx, gy, tz, yaw, 46);
      if (t > T2 + 0.12 && t < tl.total - 0.3 && Math.floor(t / 0.07) !== Math.floor(t0 / 0.07)) {
        const a = rnd() * Math.PI * 2, r = rnd() * 32, ex = tx + Math.sin(a) * r, ez = tz + Math.cos(a) * r;
        this.vfx.burst('ember', ex, gy + 0.5, ez, 3, 3, rnd() < 0.5 ? PAL_KOSMOS.core : PAL_KOSMOS.acc, bu(6, 0.5, undefined, 2));
        if (rnd() < 0.3) this.vfx.burst('smoke', ex, gy + 1, ez, 1, 1.2, TMP2.setRGB(0.05, 0.04, 0.05), bu(5, 5, 2));
      }
    }
  }
}

/** Länge eines Vorhut-Brockens (m; sein Feuerschweif ist rund dreimal so lang) */
const SHARD_SIZE = 13;
const ORBIT = { x: 0, z: 0 };
const P3 = { x: 0, y: 0, z: 0 };
