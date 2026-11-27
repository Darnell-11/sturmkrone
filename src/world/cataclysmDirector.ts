// Phase 4.6B – Regie der 14 Kataklysmus-Ultimates in der Welt: Aufladen (Mini-Zwischensequenz: Wolken reißen auf, Lichtsäule, Aura-Blitze,
// Luft-Risse, Energie strömt heran), Einschlag und die Welt-Wirkung je Ultimate – Schiffe zerteilen (Himmelsspalter quer, Klingen-Zyklon der
// Länge nach, Iaijutsu diagonal, Schwarzes Loch radial), Meer spalten (Erdspalter), Schiffe und Trümmer ansaugen (Schwarzes Loch) – dazu die
// kleinen Effekte der Faji-Künste (Energiewelle des Sturm-Erwachens, Kettenblitz, Königsdruck, Aura).
// Treffer auf Kämpfer und Verbände macht die Engine (combat/actionCombatEngine.ts); Schiffe laufen über die Regeln von NavalSystem
// (`cataclysmSplit`, `cataclysmHit`, `cataclysmPull`). Alles Sichtbare kommt aus dem Pool `CataclysmFx` (nichts entsteht im Kampf).
import { Color, Vector3 } from 'three';
import type { CataclysmFx } from '../combat/cataclysmFx';
import type { CombatFx } from '../combat/fx';
import type { EnemyShip, NavalSystem } from '../naval/naval';
import type { ActionHit, CataclysmKind, ShipCut, UltimateSpec } from '../data/actionKit';
import type { Sfx } from '../audio/audio';
import type { FighterState } from '../combat/actionCombatEngine';
import type { DebrisSystem } from './debris';
import { AnimeVfxForge } from '../graphics/animeVfxForge';
import { SKYFALL_TIMES } from '../data/cataclysms';
import { ULTIMATE_CINEMATICS, type CinePoint } from '../graphics/ultimateCinematics';
import type { FormCinema } from '../graphics/formCinema';

/** Was die Regie von der Welt braucht (SeaWorld baut es) */
export interface CataclysmHost {
  readonly fx: CataclysmFx;
  /** 4.6D: Schmiede der 3-Schicht-Effekte (fehlt sie, legt die Regie eine eigene auf `fx` an) */
  readonly vfx?: AnimeVfxForge;
  readonly combatFx: CombatFx | null;
  readonly naval: NavalSystem | null;
  readonly debris: DebrisSystem | null;
  /** Land an (x, z)? (Erdspalter: Felsen statt Meeresgraben) */
  isLand(x: number, z: number): boolean;
  /** Boden- bzw. Wasserhöhe */
  groundY(x: number, z: number, y: number): number;
  waterY(x: number, z: number): number;
  /** Meeresgraben setzen (Tiefe 0 = aus) */
  setTrench(ax: number, az: number, bx: number, bz: number, hw: number, depth: number): void;
  /** Wolken-Teilung: Stärke 0 … 1 über dem Punkt (x, y, z) */
  setRift(x: number, y: number, z: number, k: number, color: Color): void;
  shake(k: number): void;
  /** echter Wetter-Blitz (Donnergott-Urteil) */
  lightning?(x: number, z: number): void;
  /** Glas-Risse über dem Bild (Iaijutsu) */
  cracks?(n: number): void;
  /** 4.6C: Klang an einem Ort (Web Audio), weitere Impact-Frames (Gletscher zerspringt), Verdunkeln des Bildes 0 … 1 (Blutmond, Gewitter) */
  sound?(name: Sfx, vol: number, x: number, y: number, z: number): void;
  impactFrames?(n: number): void;
  darken?(k: number): void;
  /** 4.6E Himmelssturz: die Spielkamera blickt zum Himmel (0 … 1; stürzende Meteoriten und der Planet sind im Bild) */
  skyLook?(k: number): void;
  /**
   * 4.6I: der ENTSCHEIDENDE Treffer eines Ultimates (Beginn von Akt 3 der Kino-Regie): die Welt zeigt Doppel-Impact-Frame, Stoß und Klang.
   * Rückgabe true = die Welt hat die Impact-Bilder übernommen; fehlt der Haken (Prüfungen), zeigt die Regie sie selbst über `impactFrames`.
   */
  decisive?(): boolean;
  /**
   * 4.6I: Abstand (m) entlang der Blickrichtung, ab dem die Ozean-Teilung beginnen darf: hinter dem Bug bzw. der Bordwand des eigenen
   * Schiffs – beginnt der Graben darunter, sinkt das eigene Schiff mit Figur und Kamera hinein (das Wasser schließt erst nach 6 s).
   * Ohne Haken 4 m.
   */
  trenchStart?(x: number, z: number, dirX: number, dirZ: number): number;
  /** 4.91: Kamera-Annäherung der Formen und Geistes-Faji (Fokus-Puls auf das Sichtfeld, Stärke 0 … 1, Dauer in s) */
  focus?(k: number, dur: number): void;
  /** 4.91: Akt 2 einer Form bzw. eines Geistes-Faji – die Welt hält die Zeit an (Hit-Stop) und zeigt die Impact-Bilder */
  formStop?(c: FormCinema): void;
}

/** 4.91: ein ausstehender Treffermoment einer Form (Geschoss im Flug) – vorab angelegt, nichts Neues je Bild */
interface FormHit {
  on: boolean; t: number; c: FormCinema | null;
  x: number; y: number; z: number; yaw: number; col: string; acc: string; el: string; scale: number;
}

/** Ein laufendes Ultimate */
interface Cast {
  on: boolean;
  kind: CataclysmKind;
  spec: UltimateSpec | null;
  f: FighterState | null;
  /** Zeit seit dem Einschlag (Spielzeit) */
  t: number;
  /** Ursprung, Blickrichtung, Mittelpunkt (center vor der Figur) */
  x: number; y: number; z: number; yaw: number; cx: number; cz: number;
  /** Start des Vorstoßes (Iaijutsu, Zyklon) */
  sx: number; sz: number;
  col: Color; acc: Color;
  /** Merker je Ultimate: Schritt der Zeitachse, Ausstoß-Takt */
  step: number; tick: number;
  /** schon getroffene Schiffe (je Wirken einmal) */
  hit: EnemyShip[];
  /** Meeresgraben aktiv; `from` = Beginn des Grabens vor der Figur (m) */
  trench: boolean;
  from: number;
  seed: number;
  /** 4.6H: Himmelssturz an Deck – Einschlag-Gruppe so weit nach vorn geschoben (m), dass sie 28 m vom eigenen Rumpf bleibt */
  shift: number;
  /**
   * 4.6I: Spielzeit vom Einschlag bis zum entscheidenden Treffer (`UltimateSpec.lag`); `decided` = er ist gefallen. Bis dahin werden Schiffe,
   * die die Gefahr erreicht, nur gezeichnet (`marked`) und brechen im Treffermoment alle zugleich (Doppel-Impact-Frame).
   */
  lag: number;
  decided: boolean;
  marked: EnemyShip[];
  /** Ort der laufenden Gefahr (Wellenfront, Säge, Wirbel, Drachenkopf) für die Kino-Kamera */
  tx: number; ty: number; tz: number;
}

const V = new Vector3();
const WHITE = new Color(1, 1, 1);
const GOLD = new Color('#FFD27A');
/** 4.7B Geistes-Faji: Tusche-Schwarz der Willens-Aura, dunkles Glutgold, Smaragd des Lebensstroms, Violett und Schwarz der Blitze, Stein */
const WILL_INK = new Color(0.05, 0.035, 0.01);
const WILL_EMBER = new Color(0.45, 0.24, 0.02);
const EMERALD = new Color('#3AE89A');
const VIOLET = new Color('#9A6AFF');
const BLACK_BOLT = new Color(0.32, 0.12, 0.5);
const STONE = new Color(0.55, 0.48, 0.4);
const DARK = new Color(0, 0, 0);
const FROST = new Color('#BFEFFF');
const SPRAY = new Color('#DDF4FF');
const TMP = new Color();
const INK = new Color();
const INK2 = new Color();
const CRIMSON = new Color('#FF3A2A');
const STARGOLD = new Color('#FFE6A8');
const STARBLUE = new Color('#BFD8FF');
/** Ort eines Meteors (Himmelssturz), vorab angelegt; ausstehende Schiffs-Treffer je Einschlag (Meteor 1, Meteor 2, Planet) und ihr Ort */
const SKY_P = { x: 0, y: 0, z: 0 };
const SKY_HIT = new Uint8Array(3);
const SKY_HX = new Float32Array(2);
const SKY_HZ = new Float32Array(2);
const EMBER = new Color('#FF8A3A');
const ICE = new Color('#CFF4FF');
const HEXC = new Map<string, Color>();
/** Neigungen der Klingenbögen je Kettenstufe (Tusche-Schnitte wechseln die Richtung: schräg, gegenläufig, waagrecht, steil, Wirbel) */
const SLASH_ROLL = [-0.55, 0.62, -0.38, -1.15, 0.9, 0.42, -0.7];
const smooth = (k: number) => { const v = k < 0 ? 0 : k > 1 ? 1 : k; return v * v * (3 - 2 * v); };
const rnd = Math.random;

/** Dauer eines Ultimates in der Welt (s nach dem Einschlag) */
export const CATACLYSM_DUR: Record<CataclysmKind, number> = {
  // 4.6I: kürzer – der Höhepunkt liegt jetzt im Treffermoment der Kino-Regie (~0,3 s nach dem Einschlag), danach klingt die Welt aus
  horizonCut: 1.6, sevenSeas: 1.4, sawCyclone: 1.2, iaiWorldBreak: 1.4, fistStorm: 1.1, oceanSplit: 6.2, blackHole: 1.3, fireDragons: 2.2,
  glacier: 1.8, floodDragon: 1.6, vacuumStorm: 1.9, thunderJudgment: 2.0, sunDance: 1.8, bloodMoon: 1.6, skyfall: 2.6, himmelsgericht: 1.8,
};

/** Signatur-Klang je Ultimate beim Einschlag (die neun ausgebauten setzen ihre eigenen Klänge in der Zeitachse) */
const STRIKE_SOUND: Partial<Record<CataclysmKind, Sfx>> = {
  horizonCut: 'bladeWave', sawCyclone: 'cycloneWhine', iaiWorldBreak: 'sheathClick', oceanSplit: 'quakeRumble', blackHole: 'voidRumble',
};

/** Farben der Elemente (Klingenwellen und Eruptionen der Kampfkünste) */
export const ELEMENT_COL: Readonly<Record<string, string>> = {
  feuer: '#FF7A3A', eis: '#BFEFFF', blitz: '#FFF3A0', wind: '#E8FFF4', wasser: '#5AC8FF', sonne: '#FFE88A', mond: '#E0D0FF',
  void: '#B07DFF', schwarzloch: '#B07DFF', erde: '#E0B88A', klinge: '#FFF1D6', koenig: '#FFD27A',
};

/** Reichweite, in der ein Ultimate Schiffe einsammelt (m um die Figur bzw. den Mittelpunkt) */
function shipReach(kind: CataclysmKind, s: UltimateSpec): number {
  switch (kind) {
    case 'sevenSeas': return 170;
    case 'sawCyclone': case 'iaiWorldBreak': return s.reach + 60;
    case 'blackHole': return s.reach + 40;
    case 'fistStorm': return s.reach * 1.5 + 40;
    case 'fireDragons': return s.reach + 50;
    case 'floodDragon': return s.reach + 40;
    case 'vacuumStorm': return s.reach + 60;
    case 'thunderJudgment': return s.reach + 70;
    case 'sunDance': case 'himmelsgericht': return s.reach + 80;
    case 'bloodMoon': return s.reach + 40;
    default: return s.reach + 30;
  }
}

/** Schaden eines Ultimates an Schiffen, die es nicht zerteilt (Anteil am Höchst-Rumpf; Weltboss-Deckel und Panzerung wirken über Ship.damage) */
export const ULT_SHIP_DMG = 0.28;
/** Durchschlag gegen Rumpf-Panzerung */
export const ULT_SHIP_PEN = 5;

export class CataclysmDirector {
  private readonly casts: Cast[] = Array.from({ length: 3 }, () => ({
    on: false, kind: 'horizonCut' as CataclysmKind, spec: null, f: null, t: 0, x: 0, y: 0, z: 0, yaw: 0, cx: 0, cz: 0, sx: 0, sz: 0,
    col: new Color(), acc: new Color(), step: 0, tick: 0, hit: [], trench: false, from: 4, seed: 1, shift: 0,
    lag: 0, decided: false, marked: [], tx: 0, ty: 0, tz: 0,
  }));
  /**
   * Aufladen (Akt 1 der Kino-Regie). `gk` = Spielzeit je Echtzeit-Sekunde in Akt 1 (Zeitlupe): Effekte der Vorbereitung leben in Spielzeit,
   * ihre Dauer wird daraus umgerechnet. `tick2`: Takt der Pose-Effekte, `once`: Einmal-Effekte der Pose gesetzt.
   */
  private charge = { on: false, t: 0, dur: 0.33, gk: 0.32, x: 0, y: 0, z: 0, yaw: 0, col: new Color(), acc: new Color(), kind: 'horizonCut' as CataclysmKind, f: null as FighterState | null, tick: 0, tick2: 0, once: false, aura: new Color(), auraInk: new Color(), spec: null as UltimateSpec | null };
  /**
   * 4.6I: Bezugspunkte der Figur für die Pose-Effekte von Akt 1 (Hände, Kopf; setzt die Welt je Bild). `on` = gültig.
   */
  readonly poseAt = { on: false, rx: 0, ry: 0, rz: 0, lx: 0, ly: 0, lz: 0, hx: 0, hy: 0, hz: 0 };
  /** 4.6I: Gefahr (Akt 2) und Treffer-/Zerstörungspunkt (Akt 3) für die Kino-Kamera */
  private readonly threatPt: CinePoint = { x: 0, y: 0, z: 0 };
  private readonly impactPt: CinePoint = { x: 0, y: 0, z: 0 };
  private impactShip: EnemyShip | null = null;
  private rift = 0;
  private riftCol = new Color();
  private readonly ships: EnemyShip[] = [];
  /** Aura des Sturm-Erwachens: Farbe und Takt */
  private auraF: FighterState | null = null;
  private auraT = 0;
  private auraCol = new Color();
  private auraAcc = new Color();
  /** Zahlen für Prüfungen */
  readonly stats = { strikes: 0, splits: 0, disabled: 0, shipHits: 0, pulls: 0, trench: 0, waves: 0, chains: 0, swings: 0, clashes: 0, slashes: 0, impacts: 0, masts: 0, charred: 0, sections: 0, meteors: 0, planets: 0, aftershocks: 0, bursts: 0, decisive: 0, marked: 0, cones: 0, vortices: 0, poseFx: 0, threats: 0, queued: 0, trails: 0, landSpectacles: 0, formCharges: 0, formImpacts: 0, formQueued: 0, anchored: 0, bridges: 0 };
  /**
   * 4.6I: höchstens ein Schiffs-Schnitt je gezeichnetem Bild. Zerlegen, Konturen und Hochladen kosten je Schiff 10 – 20 ms; brachen mehrere Schiffe
   * im selben Bild (Blutmond, Schwarzes Loch, Gletscher im Treffermoment), stand das Bild 40 – 60 ms. Weitere Schnitte warten in diesem Ring und
   * folgen in den nächsten Bildern – mitten im Standbild der Impact-Frames.
   */
  private readonly splitQ: { c: Cast | null; e: EnemyShip | null; cut: Exclude<ShipCut, ''>; seed: number; lift: number; sections: number }[] =
    Array.from({ length: 12 }, () => ({ c: null, e: null, cut: 'cross' as Exclude<ShipCut, ''>, seed: 0, lift: 0, sections: 2 }));
  private splitHead = 0;
  private splitN = 0;
  /** Schnitte, die in diesem Bild noch sofort erlaubt sind */
  private splitBudget = 1;
  private seed = 1;
  /** Säbel: Mündungen der Geister-Armada (x, y, z je Geschütz), beim Aufladen hinter die Figur gestellt */
  private readonly armada = new Float32Array(3 * 16);
  private armadaN = 0;
  /** Zeit zwischen Zwischensequenz und Einschlag (Spielzeit): Säbel-Blitze beim Sprung, Aufstieg in die Gewitterwolke */
  private readonly pre = { on: false, t: 0, tick: 0, kind: 'horizonCut' as CataclysmKind, f: null as FighterState | null, acc: new Color(), cloudY: 0, sx: 0, sy: 0, sz: 0, lx: 0, lz: 0, strikeAt: 0.4 };
  /** Verdunkeln des Bildes (Blutmond, Gewitter, Schwarzes Loch) */
  private dark = 0;
  /** Teilchenfaktor der Grafikstufe (setzt SeaWorld): Stürme aus hunderten Teilen werden auf schwachen Geräten dünner */
  detailK = 1;

  /** 3-Schicht-Effekte (dunkler Mantel, Energiekern, Partikel und Oberflächen-Reaktion) */
  readonly vfx: AnimeVfxForge;

  constructor(private host: CataclysmHost) {
    this.vfx = host.vfx ?? new AnimeVfxForge(host.fx);
    if (!this.vfx.surface) this.vfx.surface = { isLand: (x, z) => host.isLand(x, z), groundY: (x, z, y) => host.groundY(x, z, y), waterY: (x, z) => host.waterY(x, z) };
  }

  /** Tusche-Farbe zu einer Energiefarbe (dunkler Mantel) */
  private ink(c: Color, out = INK): Color { return this.vfx.inkOf(c, out); }

  private color(hex: string): Color { let c = HEXC.get(hex); if (!c) { c = new Color(hex); HEXC.set(hex, c); } return c; }
  get active(): boolean { return this.charge.on || this.casts.some((c) => c.on); }

  // ---------- Akt 1: Vorbereitung & Aufladung ----------

  /**
   * Ultimate ausgelöst: Energie sammelt sich (Akt 1 der Kino-Regie). Läuft in Spielzeit, also in der Zeitlupe von Akt 1 (`realDur` echte s ≙
   * `spec.charge` Spielzeit); die Pose-Effekte bekommen Echtzeit-Dauern über `gk`. `shot` bleibt für ältere Aufrufe (ohne Bedeutung seit 4.6I).
   */
  beginCharge(spec: UltimateSpec, f: FighterState, realDur: number, shot: UltimateSpec['shot'] = spec.shot) {
    void shot;
    const c = this.charge;
    c.on = true; c.t = 0; c.dur = Math.max(0.05, realDur); c.x = f.x; c.y = f.y; c.z = f.z; c.yaw = f.yaw; c.kind = spec.kind; c.f = f; c.tick = 0; c.tick2 = 0; c.once = false; c.spec = spec;
    c.gk = Math.max(0.05, spec.charge / c.dur);
    c.col.copy(this.color(spec.color)); c.acc.copy(this.color(spec.accent));
    const cine = ULTIMATE_CINEMATICS[spec.kind];
    c.aura.copy(cine?.aura ? this.color(cine.aura) : c.acc);
    if (cine?.auraInk) c.auraInk.copy(this.color(cine.auraInk)); else this.ink(c.aura, c.auraInk);
    this.riftCol.copy(c.col);
    this.chargeHex = cine?.aura ?? spec.accent;
    const fx = this.host.fx, b = fx.brush;
    const fwX = Math.sin(f.yaw), fwZ = Math.cos(f.yaw), lfX = Math.cos(f.yaw), lfZ = -Math.sin(f.yaw);
    // Lichtsäule aus dem aufreißenden Himmel: erst zum Einschlag (Akt 2) – in den Nahaufnahmen von Akt 1 stünde sie zwischen Kamera und Figur
    b.reset().at(f.x, f.y, f.z).size(0.15, 140, 0.15, 0.8, 140, 0.8).span(1, spec.charge * 0.95).col(c.col, 0.75).fade(0.12, 0.4);
    fx.emit('column');
    b.reset().at(f.x, f.y + 0.05, f.z).size(1, 1, 1, 6, 1, 6).span(0.8).col(c.acc, 1.6).fade(0.1, 0.5).spin(2.4);
    fx.emit('ring');
    // Bodensiegel
    this.host.combatFx?.sigil(V.set(f.x, f.y + 0.05, f.z), 4.5, '#' + c.col.getHexString(), 1.6);
    const pr = this.pre;
    pr.on = true; pr.t = 0; pr.tick = 0; pr.kind = spec.kind; pr.f = f; pr.acc.copy(c.acc); pr.cloudY = f.y + 20;
    pr.sx = f.x; pr.sy = f.y; pr.sz = f.z; pr.lx = f.x; pr.lz = f.z; pr.strikeAt = spec.strikeAt;
    const life = spec.charge + spec.strikeAt + spec.lag + CATACLYSM_DUR[spec.kind] * 0.75;
    // Gefahr und Treffer: erste Schätzung (Mittelpunkt der Wirkung vor der Figur), die Kino-Kamera prüft damit schon ihre Sichtlinien
    const ahead = spec.center > 0 ? spec.center : Math.min(30, spec.reach * 0.35);
    this.impactShip = null;
    this.impactPt.x = f.x + fwX * ahead; this.impactPt.z = f.z + fwZ * ahead; this.impactPt.y = this.host.groundY(this.impactPt.x, this.impactPt.z, f.y) + 1;
    this.threatPt.x = this.impactPt.x; this.threatPt.y = this.impactPt.y + 4; this.threatPt.z = this.impactPt.z;
    // Himmel der Choreografie: spiralförmig aufreißende Wolkendecke über dem Wirkungsort (Sterne, Sturm, Böen)
    if (cine && (cine.sky === 'starSpiral' || cine.sky === 'stormSpiral' || cine.sky === 'gale')) {
      const sx = f.x + fwX * (ahead * 0.6 + 12), sz = f.z + fwZ * (ahead * 0.6 + 12);
      const ink = cine.sky === 'starSpiral' ? TMP.setRGB(0.05, 0.03, 0.09) : cine.sky === 'gale' ? TMP.setRGB(0.04, 0.07, 0.06) : TMP.setRGB(0.08, 0.07, 0.09);
      this.vfx.skyVortex(sx, f.y + 58, sz, 46, c.acc, ink, life, cine.sky === 'gale' ? 0.9 : 0.55, spec.charge * 0.35);
      this.stats.vortices++;
    }
    if (spec.kind === 'sevenSeas') {
      // 4.6I Geister-Armada: zwei Flügel goldener Schiffsgeschütze links und rechts hinter dem Kapitän, die in Akt 2 nacheinander in
      // Stellung gehen (gestaffelt erscheinend), alle nach vorn auf das Ziel gerichtet
      this.armadaN = 0;
      for (const side of [-1, 1]) for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
        const back = 3 + row * 3.5 + i * 1.2, out = 6 + i * 3.1 + row * 1.5;
        const gx = f.x - fwX * back + lfX * side * out, gz = f.z - fwZ * back + lfZ * side * out, gy = f.y + 4 + row * 3.2 + i * 0.7;
        const k = this.armadaN++;
        const delay = spec.charge * 0.9 + k * (spec.strikeAt * 0.045);
        b.reset().at(gx, gy, gz).rot(f.yaw - side * 0.08, -0.16, 0).size(0.2, 0.2, 0.2, 2.6 + row * 0.4, 2.6 + row * 0.4, 2.6 + row * 0.4).span(life, delay).col(row === 1 ? c.acc : GOLD, 1.7).fade(0.08, 0.15);
        b.flicker = 0.12;
        fx.emit('cannon');
        // Erscheinen: goldener Lichtring an der Lafette
        b.reset().at(gx, gy, gz).rot(f.yaw, Math.PI / 2, 0).size(0.4, 1, 0.4, 3.2, 1, 3.2).span(0.18, delay).col(GOLD, 2).fade(0.01, 0.6);
        fx.emit('ring');
        this.armada[k * 3] = gx + fwX * 2.6; this.armada[k * 3 + 1] = gy; this.armada[k * 3 + 2] = gz + fwZ * 2.6;
      }
      // 4.6D: dunkle Sturmwolke über dem Sprung (Kontrast für das Gold; keine violette Überstrahlung mehr aus großer Höhe)
      b.reset().at(f.x - Math.sin(f.yaw) * 6, f.y + 24, f.z - Math.cos(f.yaw) * 6).rot(rnd() * 6).size(4, 3, 4, 30, 20, 30).span(life, spec.charge * 0.6).col(TMP.setRGB(0.17, 0.15, 0.17), 1).fade(0.15, 0.25);
      b.ease = 1;
      fx.emit('cloud');
    } else if (spec.kind === 'skyfall') {
      // 4.6E Himmelssturz: der Himmel reißt zur Sternennacht auf – ein Kuppelfeld aus Sternen über der Figur, ein violetter Riss im Zenit
      this.starfield(f.x, f.y, f.z, f.yaw, life, spec.charge * 0.5);
      b.reset().at(f.x, f.y + 70, f.z).rot(f.yaw, Math.PI / 2, 0).size(2, 1, 40, 6, 1, 90).span(life, spec.charge * 0.4).col(c.acc, 1.6).fade(0.15, 0.3);
      b.flicker = 0.2;
      fx.emit('ribbon');
    } else if (spec.kind === 'thunderJudgment') {
      // die Gewitterwolke über dem Schlachtfeld, zu der die Figur aufsteigt (Unterseite ~19,4 m über dem Start: die Kamera folgt der Figur
      // bis gut 16 m hinauf und darf nie in die Wolke geraten); 4.6D: dunkler, damit die Blitze leuchten
      b.reset().at(f.x, f.y + 21, f.z).rot(rnd() * 6).size(4, 3, 4, 34, 26, 34).span(life, spec.charge * 0.6).col(TMP.setRGB(0.21, 0.22, 0.29), 1).fade(0.15, 0.25);
      b.ease = 1;
      fx.emit('cloud');
      b.reset().at(f.x, f.y + 19.1, f.z).rot(rnd() * 6).size(3, 1, 3, 26, 1, 26).span(life, spec.charge * 0.6).col(c.acc, 0.6).fade(0.15, 0.25).spin(0.4);
      b.flicker = 0.5;
      fx.emit('ring');
    } else if (spec.kind === 'bloodMoon') {
      // 4.6I: der Blutmond steht schon in Akt 1 hinter der Figur am sich verdunkelnden Himmel (vorher erst beim Einschlag)
      this.bloodMoonSky(f.x, f.y, f.z, f.yaw, c.col, c.acc, life, spec.charge * 0.25);
    }
  }

  /** Blutmond mit Halo und dunklem Tusche-Mantel hinter der Figur (Akt 1 bis zum Ende des Ultimates) */
  private bloodMoonSky(x: number, y: number, z: number, yaw: number, col: Color, acc: Color, life: number, delay: number) {
    const fx = this.host.fx, b = fx.brush;
    const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
    const mx = x - fwdX * 70, mz = z - fwdZ * 70;
    b.reset().at(mx, y + 44, mz).size(4, 4, 4, 24, 24, 24).span(life, delay).col(col, 1.7).fade(0.1, 0.3);
    fx.emit('orb');
    b.reset().at(mx, y + 44, mz).rot(yaw, Math.PI / 2, 0).size(22, 1, 22, 34, 1, 34).span(life, delay).col(acc, 1.5).fade(0.1, 0.3).spin(0, 0, 0.6);
    fx.emit('ring');
    b.reset().at(mx, y + 44, mz).rot(yaw, Math.PI / 2, 0).size(30, 1, 30, 44, 1, 44).span(life, delay).col(col, 0.8).fade(0.1, 0.3).spin(0, 0, -0.4);
    fx.emit('ring');
    // 4.6D: dunkler Blutmond-Halo hinter dem Mond (Tusche-Mantel am Himmel)
    b.reset().at(mx - fwdX * 2, y + 44, mz - fwdZ * 2).rot(yaw, Math.PI / 2, 0).size(20, 1, 20, 52, 1, 52).span(life, delay).col(TMP.setRGB(0.08, 0.0, 0.02), 1).fade(0.1, 0.3).spin(0, 0, 0.2);
    fx.emit('crater');
  }

  /** Je Bild in ECHTZEIT während des Aufladens (Akt 1): Energie strömt heran, Aura-Blitze, Luft-Risse und die Effekte der Pose */
  private stepCharge(realDt: number) {
    const c = this.charge;
    if (!c.on) return;
    c.t += realDt;
    const f = c.f;
    if (f) { c.x = f.x; c.y = f.y; c.z = f.z; }
    const fx = this.host.fx, b = fx.brush;
    const u = Math.min(1, c.t / c.dur);
    // Lebensdauer in Spielzeit für eine gewünschte Echtzeit (Zeitlupe von Akt 1)
    const g = c.gk;
    this.rift = Math.max(this.rift, smooth(u * 1.6));
    c.tick += realDt;
    while (c.tick > 0.035) {
      c.tick -= 0.035;
      // Energie-Funken strömen von außen auf die Figur zu (Flugzeit ~0,18 s echt)
      const a = rnd() * Math.PI * 2, r = 5 + rnd() * 6, h = 0.3 + rnd() * 3;
      const px = c.x + Math.sin(a) * r, pz = c.z + Math.cos(a) * r;
      const k = 1 / (0.18 * g);
      b.reset().at(px, c.y + h, pz).vel((c.x - px) * k, (c.y + 1.2 - (c.y + h)) * k, (c.z - pz) * k).size(0.16, 0.16, 0.16, 0.05, 0.05, 0.05).span(0.17 * g).col(rnd() < 0.5 ? c.col : c.acc, 3).fade(0.2, 0.3);
      fx.emit('orb');
      // Aura-Blitze um die Figur: auf einem Ring außerhalb der Nahaufnahme (1,6 m), sonst zucken sie vor dem Gesicht und überstrahlen es
      if (rnd() < 0.35) {
        const a0 = rnd() * Math.PI * 2, r0 = 1.6 + rnd() * 1.2, a1 = a0 + (rnd() - 0.5) * 1.2, r1 = 1.6 + rnd() * 1.6;
        this.boltBetween(c.x + Math.sin(a0) * r0, c.y + rnd() * 2.4, c.z + Math.cos(a0) * r0, c.x + Math.sin(a1) * r1, c.y + 0.5 + rnd() * 2.5, c.z + Math.cos(a1) * r1, c.acc, 2.4, 0.15 * g, 0.25);
      }
      // Luft-Risse: helle, scharfe Linien, die in der Luft stehen bleiben
      if (rnd() < 0.18) {
        const ra = rnd() * Math.PI * 2, rr = 2 + rnd() * 4;
        const x0 = c.x + Math.sin(ra) * rr, z0 = c.z + Math.cos(ra) * rr, y0 = c.y + 0.6 + rnd() * 3;
        this.boltBetween(x0, y0, z0, x0 + (rnd() - 0.5) * 2.5, y0 + (rnd() - 0.5) * 2.5, z0 + (rnd() - 0.5) * 2.5, WHITE, 3, 0.45 * g, 0.6);
      }
      // lokale Aura der Vorbereitung (aufsteigende Glut, Lichtring)
      this.vfx.auraSwirl(c.x, c.y, c.z, c.aura, c.acc, 1, 0.3 * g);
    }
    // Effekte der Pose (Hände, Klinge, Kranz): im festen Echtzeit-Takt
    c.tick2 += realDt;
    if (this.poseAt.on) while (c.tick2 > 0.045) { c.tick2 -= 0.045; this.poseFx(u, g); }
    else if (c.tick2 > 0.045) c.tick2 = 0;
    if (c.t >= c.dur + 0.2) c.on = false;
  }

  /** Pose-Effekte von Akt 1 je Ultimate (an Händen, Klinge, Schultern, Füßen) */
  private poseFx(u: number, g: number) {
    const c = this.charge;
    const fx = this.host.fx, b = fx.brush, p = this.poseAt, vf = this.vfx;
    const fwX = Math.sin(c.yaw), fwZ = Math.cos(c.yaw);
    this.stats.poseFx++;
    switch (c.kind) {
      case 'skyfall': {
        // kosmisch-violette Blitze zucken vom Mantel (Schultern, Rücken) nach außen weg, Sternenstaub steigt die Hand hinauf
        const a = c.yaw + Math.PI + (rnd() - 0.5) * 2.6, r = 1.3 + rnd() * 1.6;
        this.boltBetween(c.x - fwX * 0.2, c.y + 1.3 + rnd() * 0.3, c.z - fwZ * 0.2, c.x + Math.sin(a) * r, c.y + 0.6 + rnd() * 2, c.z + Math.cos(a) * r, c.acc, 2.6, 0.12 * g, 0.5);
        vf.burst('ember', p.rx, p.ry, p.rz, 2, 1.5, STARGOLD, { up: 3, spread: 0.2, size: 0.12, life: 0.25 * g });
        break;
      }
      case 'horizonCut': {
        // schwarz-smaragdgrün umhüllte Klinge: dunkles Band und Smaragd-Spirale um Griff und Klinge
        if (!c.once) { c.once = true; vf.spiral(p.rx, p.ry - 0.4, p.rz, 0.32, 1.6, c.aura, c.dur * g, 3, 10); }
        b.reset().at(p.rx, p.ry - 0.2, p.rz).rot(rnd() * 6).spin(9).size(0.25, 0.8, 0.25, 0.42, 1.8, 0.42).span(0.12 * g).col(c.auraInk, 1).fade(0.05, 0.5);
        fx.emit('ribbonInk');
        vf.burst('spark', p.rx, p.ry, p.rz, 2, 3, c.aura, { up: 1.5, size: 0.18, life: 0.2 * g });
        break;
      }
      case 'iaiWorldBreak': {
        // stilles Glimmen am Griff, Staub wirbelt flach um die Füße
        if (rnd() < 0.5) vf.burst('spark', p.rx, p.ry, p.rz, 1, 0.6, WHITE, { up: 0.3, size: 0.08, life: 0.18 * g });
        vf.burst('dust', c.x, c.y + 0.1, c.z, 1, 2.4, TMP.setRGB(0.6, 0.6, 0.62), { up: 0.2, size: 0.5, life: 0.35 * g, spread: 1.2 });
        break;
      }
      case 'sawCyclone': {
        // gekreuzte Klingen: zwei Sicheln kreuzen sich vor der Brust, Funken sprühen
        if (!c.once) {
          c.once = true;
          vf.slash(c.x + fwX * 0.5, c.y + 1.5, c.z + fwZ * 0.5, c.yaw, -1.2, 0.8, 0.95, c.col, this.ink(c.acc), { life: c.dur * g, sparks: 4, k: 0.75 });
          vf.slash(c.x + fwX * 0.5, c.y + 1.5, c.z + fwZ * 0.5, c.yaw, -1.2, -0.8, 0.95, c.acc, this.ink(c.acc), { life: c.dur * g, sparks: 4, k: 0.75 });
        }
        vf.burst('spark', p.rx, p.ry, p.rz, 2, 5, c.acc, { up: 2, size: 0.16, life: 0.2 * g });
        break;
      }
      case 'sevenSeas': {
        // golden-rote Säbel-Blitze um die springende Figur
        const a0 = rnd() * Math.PI * 2, r0 = 1.4 + rnd(), a1 = a0 + (rnd() - 0.5) * 1.4, r1 = 1.6 + rnd() * 1.4;
        this.boltBetween(c.x + Math.sin(a0) * r0, c.y + 0.4 + rnd() * 1.8, c.z + Math.cos(a0) * r0, c.x + Math.sin(a1) * r1, c.y + rnd() * 3, c.z + Math.cos(a1) * r1, rnd() < 0.5 ? GOLD : CRIMSON, 2.6, 0.15 * g, 0.5);
        if (rnd() < 0.5) this.boltBetween(p.rx, p.ry, p.rz, p.rx + (rnd() - 0.5) * 1.2, p.ry + 0.4 + rnd(), p.rz + (rnd() - 0.5) * 1.2, GOLD, 1.6, 0.1 * g, 0.6);
        break;
      }
      case 'fistStorm': {
        // glühende Fäuste: Glutkern an beiden Händen, Funken, ein Druckring vor der Schlagfaust
        for (let s = 0; s < 2; s++) {
          const hx = s ? p.lx : p.rx, hy = s ? p.ly : p.ry, hz = s ? p.lz : p.rz;
          b.reset().at(hx, hy, hz).size(0.16, 0.16, 0.16, 0.26, 0.26, 0.26).span(0.08 * g).col(c.col, 2.4).fade(0.01, 0.5);
          b.flicker = 0.3;
          fx.emit('orb');
          vf.burst('ember', hx, hy, hz, 1, 1.2, c.acc, { up: 1.2, size: 0.14, life: 0.2 * g });
        }
        if (u > 0.6 && rnd() < 0.4) vf.pressureRing(p.rx + fwX * 0.3, p.ry, p.rz + fwZ * 0.3, c.yaw, true, 0.8, WHITE, 0.16 * g);
        break;
      }
      case 'oceanSplit': {
        // der Boden bebt: Steine und Tropfen springen um die Füße hoch
        const a = rnd() * Math.PI * 2, r = 0.8 + rnd() * 2.2;
        const px = c.x + Math.sin(a) * r, pz = c.z + Math.cos(a) * r;
        const land = this.host.isLand(px, pz);
        vf.burst(land ? 'rock' : 'drop', px, this.host.groundY(px, pz, c.y) + 0.1, pz, 2, 1.2, land ? TMP.setRGB(0.42, 0.37, 0.32) : SPRAY, { up: 3.5, size: land ? 0.08 : 0.12, life: 0.35 * g, grav: 6 });
        if (rnd() < 0.3) vf.burst('dust', c.x, c.y + 0.1, c.z, 1, 1.5, TMP.setRGB(0.55, 0.5, 0.42), { up: 0.4, size: 0.6, life: 0.4 * g, spread: 1.6 });
        break;
      }
      case 'blackHole': {
        // finstere Sphäre in der Handfläche: schwarzer Kern, heller Ereignisring, Lichtverzerrung (Glas-Splitter), einströmende Funken
        const s = 0.12 + 0.1 * u;
        b.reset().at(p.rx, p.ry + 0.12, p.rz).size(s, s, s).span(0.06 * g).col(DARK, 1).fade(0.01, 0.01);
        fx.emit('void');
        b.reset().at(p.rx, p.ry + 0.12, p.rz).rot(rnd() * 6, 0.35, 0).size(s * 1.6, 1, s * 1.6, s * 2.1, 1, s * 2.1).span(0.06 * g).col(c.col, 2.4).fade(0.01, 0.5);
        fx.emit('ring');
        if (rnd() < 0.35) vf.glass(p.rx, p.ry + 0.12, p.rz, c.yaw, 1, 0.25, c.col, 0.2 * g);
        const a = rnd() * Math.PI * 2, r = 0.6 + rnd() * 0.5;
        b.reset().at(p.rx + Math.sin(a) * r, p.ry + 0.12 + (rnd() - 0.5) * 0.6, p.rz + Math.cos(a) * r).vel(-Math.sin(a) * r / (0.15 * g), 0, -Math.cos(a) * r / (0.15 * g)).size(0.05, 0.05, 0.05, 0.01, 0.01, 0.01).span(0.15 * g).col(WHITE, 2.4).fade(0.1, 0.3);
        fx.emit('orb');
        break;
      }
      case 'fireDragons': {
        // wirbelnde Flammen-Spiralen um beide Arme
        for (let s = 0; s < 2; s++) {
          const hx = s ? p.lx : p.rx, hy = s ? p.ly : p.ry, hz = s ? p.lz : p.rz;
          b.reset().at(hx, hy - 0.45, hz).rot(rnd() * 6).spin(s ? -11 : 11).size(0.12, 0.4, 0.12, 0.24, 0.9, 0.24).span(0.12 * g).col(s ? c.acc : c.col, 2.2).fade(0.05, 0.5);
          fx.emit('ribbon');
          vf.burst('ember', hx, hy, hz, 1, 1.4, s ? c.acc : EMBER, { up: 2, size: 0.15, life: 0.25 * g });
        }
        break;
      }
      case 'glacier': {
        // Frost an den Händen, Eiskristalle in der Luft, Raureif am Boden
        vf.burst('ice', p.rx, p.ry, p.rz, 1, 1, ICE, { up: 0.5, size: 0.12, life: 0.3 * g });
        vf.burst('ice', p.lx, p.ly, p.lz, 1, 1, ICE, { up: 0.5, size: 0.12, life: 0.3 * g });
        if (rnd() < 0.3) vf.burst('mist', c.x, c.y + 0.2, c.z, 1, 1, FROST, { up: 0.3, size: 0.8, life: 0.4 * g, spread: 1.4 });
        break;
      }
      case 'floodDragon': {
        // ein Wasserstrudel steigt um die Figur auf
        if (!c.once) { c.once = true; vf.spiral(c.x, c.y, c.z, 1.3, 3.2, c.col, c.dur * g * 1.2, 3, 9); }
        vf.burst('drop', c.x + (rnd() - 0.5) * 2, c.y + rnd() * 2.6, c.z + (rnd() - 0.5) * 2, 2, 2.5, SPRAY, { up: 2.5, size: 0.14, life: 0.3 * g, grav: 4 });
        break;
      }
      case 'vacuumStorm': {
        // klingenartige Windböen kreisen um die Figur und ziehen sich zusammen
        const a = rnd() * Math.PI * 2, r = 2.6 - 1.4 * u + rnd() * 0.6, ta = a + Math.PI / 2;
        vf.slash(c.x + Math.sin(a) * r, c.y + 0.6 + rnd() * 1.8, c.z + Math.cos(a) * r, ta, 0, (rnd() - 0.5) * 1.4, 0.7 + rnd() * 0.6, rnd() < 0.5 ? WHITE : c.acc, TMP.setRGB(0.01, 0.07, 0.05), { life: 0.14 * g, spin: 14, sparks: 0, vx: -Math.sin(a) * 3, vz: -Math.cos(a) * 3 });
        break;
      }
      case 'thunderJudgment': {
        // Raketen-Aufstieg: Blitze schlagen unter der Figur in den Boden, Funkenschweif nach unten
        const a = rnd() * Math.PI * 2, r = 0.8 + rnd() * 1.4;
        const gy = this.host.groundY(c.x + Math.sin(a) * r, c.z + Math.cos(a) * r, c.y);
        this.boltBetween(c.x, c.y + 0.2, c.z, c.x + Math.sin(a) * r, gy, c.z + Math.cos(a) * r, rnd() < 0.5 ? WHITE : c.acc, 2.6, 0.1 * g, 0.5);
        vf.burst('spark', c.x, c.y + 0.3, c.z, 3, 6, c.col, { dirX: 0, dirY: -1, dirZ: 0, focus: 0.7, up: 0, size: 0.18, life: 0.2 * g });
        break;
      }
      case 'sunDance': case 'himmelsgericht': {
        // blendender Sonnen-Kranz entzündet sich hinter den Schultern (dunkler Hitze-Kontrastring, kein Weiß)
        if (!c.once) { c.once = true; vf.corona(c.x - fwX * 0.45, c.y + 1.55, c.z - fwZ * 0.45, c.yaw, 0.75, c.col, c.acc, c.dur * g * 1.4); }
        vf.burst('ember', c.x - fwX * 0.4 + (rnd() - 0.5) * 1.2, c.y + 1.3 + rnd() * 0.8, c.z - fwZ * 0.4 + (rnd() - 0.5) * 1.2, 1, 1.2, c.acc, { up: 1.5, size: 0.14, life: 0.3 * g });
        break;
      }
      case 'bloodMoon': {
        // die Hand zieht einen karmesinroten Halbkreis (senkrechte Sichel folgt der Hand), dunkle Tusche-Schweife
        b.reset().at(p.rx, p.ry, p.rz).size(0.1, 0.1, 0.1, 0.03, 0.03, 0.03).span(0.35 * g).col(CRIMSON, 2.4).fade(0.01, 0.6);
        fx.emit('orb');
        if (!c.once && u > 0.35) {
          c.once = true;
          vf.slash(c.x + fwX * 0.4, c.y + 1.35, c.z + fwZ * 0.4, c.yaw, -1.45, 0.4, 0.95, CRIMSON, TMP.setRGB(0.05, 0, 0.02), { life: 0.5 * g, sparks: 4, k: 1.3 });
        }
        break;
      }
      default: break;
    }
  }

  // ---------- Kino-Kamera: Gefahr und Treffer ----------

  /** 4.6I: Ort der entstehenden Gefahr (Akt 2: Meteor, Wellenfront, Säge, Wirbel, Drachenkopf, Blitzspitze) – schreibt in `out` */
  cineThreat(out: CinePoint): CinePoint {
    const p = this.threatPt;
    out.x = p.x; out.y = p.y; out.z = p.z;
    return out;
  }

  /** 4.6I: Treffer- und Zerstörungspunkt (Akt 3: erstes getroffenes Schiff, Einschlag, Kollaps) – schreibt in `out` */
  cineImpact(out: CinePoint): CinePoint {
    const s = this.impactShip;
    if (s) { out.x = s.ship.x; out.y = s.ship.model.deckY + 1; out.z = s.ship.z; return out; }
    const p = this.impactPt;
    out.x = p.x; out.y = p.y; out.z = p.z;
    return out;
  }

  /** Gefahr setzen (Akt 2) */
  private threat(x: number, y: number, z: number) { const p = this.threatPt; p.x = x; p.y = y; p.z = z; this.stats.threats++; }

  /** Treffer-Schiff: das erste gezeichnete bzw. das nächste vor der Figur (sonst bleibt der Mittelpunkt der Wirkung) */
  private pickImpactShip(c: Cast) {
    let best: EnemyShip | null = null, bd = 1e9;
    const fwX = Math.sin(c.yaw), fwZ = Math.cos(c.yaw);
    const list = c.marked.length ? c.marked : this.ships;
    for (const e of list) {
      const dx = e.ship.x - c.x, dz = e.ship.z - c.z, d = Math.hypot(dx, dz);
      const front = (dx * fwX + dz * fwZ) > -e.ship.cls.L * 0.3 ? 0 : 60;
      if (d + front < bd) { bd = d + front; best = e; }
    }
    this.impactShip = best;
    if (!best) {
      const ahead = c.spec!.center > 0 ? c.spec!.center + c.shift : Math.min(30, c.spec!.reach * 0.35);
      this.impactPt.x = c.x + fwX * ahead; this.impactPt.z = c.z + fwZ * ahead;
      this.impactPt.y = this.host.groundY(this.impactPt.x, this.impactPt.z, c.y) + 1;
    }
  }

  /** Schiff in Akt 2 zeichnen (die Gefahr erreicht es): Lichtschnitt quer über den Rumpf, Funken – zerbrochen wird erst im Treffermoment */
  private mark(c: Cast, e: EnemyShip) {
    if (c.marked.includes(e) || c.hit.includes(e)) return;
    c.marked.push(e);
    this.stats.marked++;
    const s = e.ship, fx = this.host.fx, b = fx.brush;
    const yaw = c.kind === 'sawCyclone' ? s.heading : s.heading + Math.PI / 2;
    b.reset().at(s.x, s.model.deckY * 0.6, s.z).rot(yaw, 0, Math.PI / 2).size(0.6, 1, 0.6, s.cls.L * 0.55, 1, s.cls.L * 0.55).span(0.5).col(WHITE, 2.4).fade(0.01, 0.4);
    b.flicker = 0.3;
    fx.emit('blade');
    this.vfx.burst('spark', s.x, s.model.deckY, s.z, 10, 9, c.acc, { up: 4, spread: s.cls.W, size: 0.3 });
    this.vfx.burst('splinter', s.x, s.model.deckY, s.z, 5, 5, WHITE, { up: 3, size: 0.3, spread: s.cls.W });
  }

  /** Der entscheidende Treffer: Akt 3 der Kino-Regie (die Welt zeigt Doppel-Impact-Frame, Stoß, Klang) */
  /**
   * 4.9: Energiespur eines eigenen Geschosses (Faji-Formen) in drei Schichten aus den Pools: Tusche-Mantel (normal gemischt), leuchtender Kern
   * mit weißer Mitte (additiv), Funken entgegen der Flugrichtung. Lebt nur kurz (die Spur entsteht alle 35 ms neu).
   */
  projTrail(x: number, y: number, z: number, vx: number, vy: number, vz: number, colorHex: string, radius: number) {
    const fx = this.host.fx, b = fx.brush;
    const col = this.color(colorHex);
    const r = Math.max(0.25, radius);
    this.vfx.burst('smoke', x, y, z, 1, 0.3, this.ink(col), { size: r * 1.2, life: 0.22 });
    b.reset().at(x, y, z).size(r * 0.55, r * 0.55, r * 0.55, r * 0.2, r * 0.2, r * 0.2).span(0.12).col(col, 2.6).fade(0.005, 0.7);
    fx.emit('orb');
    b.reset().at(x, y, z).size(r * 0.25, r * 0.25, r * 0.25, r * 0.08, r * 0.08, r * 0.08).span(0.08).col(WHITE, 2.4).fade(0.005, 0.7);
    fx.emit('orb');
    const sp = Math.hypot(vx, vy, vz) || 1;
    this.vfx.burst('spark', x, y, z, 2, 3, col, { dirX: -vx / sp, dirY: -vy / sp, dirZ: -vz / sp, focus: 0.6, life: 0.25, size: r * 0.25 });
    this.stats.trails++;
  }

  /**
   * 4.9: Ultimates an Land so gewaltig wie über dem Meer – im entscheidenden Treffer: verdunkelter Himmel, fünf Energiesäulen, gestaffelte
   * radiale Druckringe, glühende Risse und Krater nach außen. Über Wasser übernimmt das Meer (Graben, Wellen, Schiffe) diese Rolle.
   */
  private landSpectacle(c: Cast) {
    const s = c.spec;
    if (!s) return;
    const mid = c.kind === 'blackHole' || c.kind === 'skyfall';
    const reach = Math.min(18, s.reach * 0.3);
    const x = mid ? c.cx : c.x + Math.sin(c.yaw) * reach, z = mid ? c.cz : c.z + Math.cos(c.yaw) * reach;
    if (!this.host.isLand(x, z)) return;
    const fx = this.host.fx, b = fx.brush, vf = this.vfx;
    const y = this.host.groundY(x, z, c.y);
    this.host.darken?.(0.6);
    for (let i = 0; i < 5; i++) {
      const a = c.yaw + i * 1.2566, r = 6 + (i % 2) * 5, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      vf.spiral(px, this.host.groundY(px, pz, y), pz, 1.4, 22, c.col, 1.1, 3, 8);
    }
    for (let k = 1; k <= 4; k++) {
      b.reset().at(x, y + 0.15, z).rot(rnd() * 6).size(1, 1, 1, 8 + k * 9, 1, 8 + k * 9).span(0.45 + k * 0.12, k * 0.07).col(k % 2 ? c.acc : WHITE, 2).fade(0.01, 0.6);
      fx.emit('shock');
    }
    for (let i = 0; i < 6; i++) {
      const a = c.yaw + i * (Math.PI / 3), d = 7 + (i % 3) * 4, px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
      vf.surfaceHit(px, this.host.groundY(px, pz, y), pz, 2.4, c.col, 1.3, 0.05 * i);
    }
    vf.surfaceHit(x, y, z, Math.min(14, s.reach * 0.2), c.col, 2);
    this.host.shake(1.4);
    this.stats.landSpectacles++;
  }

  private decide(c: Cast) {
    if (c.decided) return;
    c.decided = true;
    this.stats.decisive++;
    this.landSpectacle(c);
    this.pickImpactShip(c);
    const taken = this.host.decisive?.() ?? false;
    if (!taken) this.host.impactFrames?.(c.spec?.frames ?? 2);
  }

  // ---------- Einschlag ----------

  /** Einschlag eines Ultimates (Ereignis `ultStrike`; beim Iaijutsu ist das zugleich das Einrasten der Klinge) */
  strike(spec: UltimateSpec, f: FighterState, startX?: number, startZ?: number, shift = 0, anchor: { x: number; z: number; yaw: number; cx: number; cz: number } | null = null) {
    let c = this.casts.find((k) => !k.on);
    if (!c) c = this.casts[0];
    c.on = true; c.kind = spec.kind; c.spec = spec; c.f = f; c.t = 0; c.step = 0; c.tick = 0; c.hit.length = 0; c.trench = false; c.from = 4;
    c.x = f.x; c.y = f.y; c.z = f.z; c.yaw = f.yaw;
    // 4.6I: der entscheidende Treffer fällt `lag` nach dem Einschlag (Ende von Akt 2), bis dahin werden Schiffe nur gezeichnet
    c.lag = Math.max(0, spec.lag || 0); c.decided = false; c.marked.length = 0;
    c.tx = f.x; c.ty = f.y + 2; c.tz = f.z;
    // 4.6H: nur der Himmelssturz wird verschoben (Meteoriten und Planet nie auf dem eigenen Deck); dieselbe Verschiebung gilt in der Engine
    c.shift = spec.kind === 'skyfall' && !anchor ? Math.max(0, shift) : 0;
    c.cx = f.x + Math.sin(f.yaw) * (spec.center + c.shift); c.cz = f.z + Math.cos(f.yaw) * (spec.center + c.shift);
    c.sx = startX ?? f.x; c.sz = startZ ?? f.z;
    if (anchor) {
      // 4.91 Ultimate am Steuer: die Wirkung entsteht am angewählten Ziel (bis 650 m) – eine Energiebahn trägt sie von der Figur dorthin
      this.bridge(f, anchor.x, anchor.z, spec);
      c.x = anchor.x; c.z = anchor.z; c.yaw = anchor.yaw; c.cx = anchor.cx; c.cz = anchor.cz;
      c.sx = anchor.x - Math.sin(anchor.yaw) * 8; c.sz = anchor.z - Math.cos(anchor.yaw) * 8;
      c.tx = anchor.x; c.tz = anchor.z;
      this.stats.anchored++;
    }
    c.col.copy(this.color(spec.color)); c.acc.copy(this.color(spec.accent));
    c.seed = this.seed++;
    this.charge.on = false;
    this.pre.on = false;
    this.stats.strikes++;
    this.host.shake(1.1);
    const sig = STRIKE_SOUND[spec.kind];
    if (sig) this.sound(sig, 1, f.x, f.y, f.z);
    // Kern-Blitz und Druckring am Einschlag (klein: die Kamera steht nach der Zwischensequenz noch nah)
    const fx = this.host.fx, b = fx.brush;
    b.reset().at(f.x, f.y + 1.2, f.z).size(0.3, 0.3, 0.3, 1.8, 1.8, 1.8).span(0.22).col(WHITE, 2).fade(0.02, 0.8);
    fx.emit('orb');
    b.reset().at(f.x, f.y + 0.1, f.z).size(2, 1, 2, Math.min(60, spec.reach * 0.6), 1, Math.min(60, spec.reach * 0.6)).span(0.7).col(c.acc, 2).fade(0.02, 0.7);
    fx.emit('ring');
    // 4.6D: Einschlag-Krater bzw. Gischtkrone an der Figur, Energie-Spirale steigt auf
    this.vfx.surfaceHit(f.x, f.y, f.z, 3.2, c.col, 1.2);
    this.vfx.spiral(f.x, f.y, f.z, 2.2, 7, c.col, 0.7, 3, 8);
    this.begin(c);
    this.pickImpactShip(c);
    // Einschlag = Treffermoment (Blitz-Zäsur, Klick der Scheide, Hauptblitz): Akt 3 beginnt sofort
    if (c.lag <= 0) this.decide(c);
  }

  /**
   * 4.91: Energiebahn eines Ultimates am Steuer von der Figur zum Ziel – drei Schichten (Tusche-Mantel, leuchtender Kern, weißer Faden),
   * aufspritzende Gischt entlang der Bahn und ein Druckring am Ziel. Nur Bausteine aus den Pools.
   */
  private bridge(f: FighterState, ax: number, az: number, spec: UltimateSpec) {
    const vf = this.vfx, col = this.color(spec.color), acc = this.color(spec.accent);
    const ay = this.host.waterY(ax, az) + 2.5, oy = f.y + 1.3;
    vf.bolt(f.x, oy, f.z, ax, ay, az, this.ink(col), 1.6, 0.55, { depth: 4, branches: 1, jitter: 0.03 });
    vf.bolt(f.x, oy, f.z, ax, ay, az, col, 0.9, 0.5, { depth: 4, branches: 2, jitter: 0.05 });
    vf.bolt(f.x, oy, f.z, ax, ay, az, WHITE, 0.32, 0.42, { depth: 3, branches: 0, jitter: 0.02 });
    const d = Math.hypot(ax - f.x, az - f.z), n = Math.min(10, Math.max(3, Math.round(d / 60)));
    for (let i = 1; i <= n; i++) {
      const k = i / n, px = f.x + (ax - f.x) * k, pz = f.z + (az - f.z) * k;
      vf.burst('drop', px, this.host.waterY(px, pz) + 0.3, pz, 5, 6, SPRAY, { up: 7, size: 0.5, life: 0.8, delay: k * 0.25 });
    }
    vf.pressureRing(ax, ay, az, 0, false, 16, acc, 0.5);
    this.stats.bridges++;
  }

  /** Startbilder je Ultimate */
  private begin(c: Cast) {
    const fx = this.host.fx, b = fx.brush, s = c.spec!;
    const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
    // Schiffe im Wirkungsbereich einsammeln (zerteilt/getroffen wird im Takt der Zeitachse) – 4.6D: vor den Startbildern, damit auch
    // Wirkungen beim Einschlag (Gletscher friert ein) die Schiffe dieses Wirkens treffen und nicht die Liste des vorigen
    const nav = this.host.naval;
    if (nav) {
      const mid = c.kind === 'blackHole' || c.kind === 'skyfall';
      nav.cataclysmShips(mid ? c.cx : c.x, mid ? c.cz : c.z, shipReach(c.kind, s), this.ships);
      if (c.kind === 'iaiWorldBreak') this.iaiShips(c);
    } else this.ships.length = 0;
    switch (c.kind) {
      case 'horizonCut': {
        // 180 m breite Energiewand rast über den Horizont (drei Schichten: weißer Kern, Farbe, Saum)
        // 4.6J: gedämpft, niedriger und mit dunklem Smaragd-Mantel – die hohen, hellen Wände legten in Akt 2 einen weißen Schleier über das
        // ganze Bild, die Klingenwelle selbst war nicht mehr zu erkennen; jetzt hebt sich ihre Kante als scharfe Linie vor dem Mantel ab
        b.reset().at(c.x, c.y - 2.2, c.z).rot(c.yaw).size(6.2, 8, 6.2, s.reach * 1.01, 24, s.reach * 1.01).span(0.95).col(this.ink(c.acc), 0.85).fade(0.03, 0.45);
        fx.emit('arcInk');
        b.reset().at(c.x, c.y - 2, c.z).rot(c.yaw).size(6, 8, 6, s.reach, 22, s.reach).span(0.95).col(WHITE, 1.15).fade(0.03, 0.45);
        fx.emit('arc');
        b.reset().at(c.x, c.y - 4, c.z).rot(c.yaw).size(5, 12, 5, s.reach * 0.97, 30, s.reach * 0.97).span(1.1).col(c.col, 1.05).fade(0.03, 0.5);
        fx.emit('arc');
        b.reset().at(c.x, c.y - 1, c.z).rot(c.yaw).size(4, 4, 4, s.reach * 1.02, 12, s.reach * 1.02).span(1.2).col(c.acc, 1.3).fade(0.03, 0.55);
        fx.emit('arc');
        // Horizontlinie: flache Sichel bis zum Rand – die eigentliche Klingenkante, hell und schmal
        b.reset().at(c.x, c.y + 1.4, c.z).rot(c.yaw).size(6, 1, 6, s.reach * 1.05, 1, s.reach * 1.05).span(0.9).col(WHITE, 2.2).fade(0.02, 0.5);
        fx.emit('blade');
        // 4.6D: 3-Schicht-Energiesichel mit dunklem Tusche-Schweif
        b.reset().at(c.x, c.y + 1.2, c.z).rot(c.yaw).size(5, 1, 5, s.reach * 1.1, 1, s.reach * 1.1).span(1.15).col(this.ink(c.acc), 1).fade(0.02, 0.5);
        fx.emit('sickleInk');
        b.reset().at(c.x, c.y + 1.3, c.z).rot(c.yaw).size(5, 1, 5, s.reach * 1.04, 1, s.reach * 1.04).span(0.95).col(c.col, 1.6).fade(0.02, 0.5);
        fx.emit('sickle');
        break;
      }
      case 'oceanSplit': {
        // Meer oder Land? Stichproben entlang der Linie
        let water = 0;
        for (let i = 1; i <= 8; i++) { const d = (s.reach * i) / 8; if (!this.host.isLand(c.x + fwdX * d, c.z + fwdZ * d)) water++; }
        c.trench = water >= 4;
        // 4.6I: der Graben beginnt hinter dem eigenen Schiff (sonst versinkt es mit Figur und Kamera darin)
        c.from = Math.max(4, Math.min(s.reach * 0.5, this.host.trenchStart?.(c.x, c.z, fwdX, fwdZ) ?? 4));
        if (c.trench) this.stats.trench++;
        break;
      }
      case 'blackHole': {
        const cy = c.y + 3;
        // 4.6I: die Scheibe lebt bis zum Kollaps (entscheidender Treffer), danach sprengt sie nach außen
        const L = c.lag + 0.14;
        b.reset().at(c.cx, cy, c.cz).size(0.2, 0.2, 0.2, 4.6, 4.6, 4.6).span(L).col(DARK, 1).fade(0.12, 0.12);
        fx.emit('void');
        b.reset().at(c.cx, cy, c.cz).rot(0, 0.35, 0).size(2, 1, 2, 10, 1, 10).span(L).col(c.col, 2.4).fade(0.1, 0.15).spin(4.5);
        fx.emit('ring');
        b.reset().at(c.cx, cy, c.cz).rot(0, -0.25, 0.2).size(3, 1, 3, 14, 1, 14).span(L).col(c.acc.r > 0.2 ? c.acc : c.col, 1.4).fade(0.1, 0.15).spin(-3);
        fx.emit('ring');
        // dritte, steile Ebene der Akkretionsscheibe (kein Lichthof über dem Kern: der Abgrund bleibt schwarz)
        b.reset().at(c.cx, cy, c.cz).rot(0.6, 1.2, 0).size(4, 1, 4, 7.5, 1, 7.5).span(L).col(WHITE, 1.1).fade(0.1, 0.15).spin(0, 0, 5);
        b.flicker = 0.3;
        fx.emit('ring');
        // 4.6D: dunkel-violette Scheibe hinter dem Leuchtband (Tusche-Mantel) und gewundene Materie-Ströme
        b.reset().at(c.cx, cy, c.cz).rot(0, 0.35, 0).spin(3).size(3, 1, 3, 15, 1, 15).span(L).col(TMP.setRGB(0.06, 0.02, 0.1), 1).fade(0.08, 0.15);
        fx.emit('crater');
        for (let i = 0; i < 3; i++) { b.reset().at(c.cx, cy - 2, c.cz).rot((i / 3) * Math.PI * 2, 0.25).spin(5).size(4, 2, 4, 13, 4, 13).span(L).col(i ? c.col : c.acc.r > 0.2 ? c.acc : c.col, 1.6).fade(0.1, 0.2); fx.emit('ribbon'); }
        b.reset().at(c.cx, cy - 2, c.cz).spin(4).size(5, 2, 5, 15, 4.5, 15).span(L).col(TMP.setRGB(0.05, 0.02, 0.08), 1).fade(0.1, 0.2);
        fx.emit('ribbonInk');
        break;
      }
      case 'sevenSeas': case 'fistStorm': case 'fireDragons': case 'glacier': case 'floodDragon': case 'vacuumStorm':
      case 'thunderJudgment': case 'sunDance': case 'himmelsgericht': case 'bloodMoon':
        this.beginUlt(c);
        break;
      case 'skyfall': this.beginSkyfall(c); break;
      case 'iaiWorldBreak': {
        // die Klinge rastet ein: Schnitt-Linien entlang des Vorstoßes, dann zerbricht alles zugleich (Glas-Splitter)
        const dx = c.x - c.sx, dz = c.z - c.sz, len = Math.max(4, Math.hypot(dx, dz));
        const n = Math.min(14, Math.round(len / 2.4));
        for (let i = 0; i < n; i++) {
          const k = (i + 0.5) / n;
          const px = c.sx + dx * k + (rnd() - 0.5) * 3, pz = c.sz + dz * k + (rnd() - 0.5) * 3, py = c.y + 0.4 + rnd() * 2.4;
          b.reset().at(px, py, pz).rot(rnd() * Math.PI, (rnd() - 0.5) * 1.4, (rnd() - 0.5) * 1.4).size(2, 1, 2, 4.5, 1, 4.5).span(0.5).col(WHITE, 3).fade(0.01, 0.6);
          fx.emit('blade');
          for (let q = 0; q < 6; q++) {
            b.reset().at(px, py, pz).vel((rnd() - 0.5) * 12, rnd() * 8, (rnd() - 0.5) * 12).spin((rnd() - 0.5) * 12, (rnd() - 0.5) * 12).size(0.25, 0.6, 0.25, 0.1, 0.25, 0.1).span(0.9 + rnd() * 0.4).col(q % 2 ? c.col : WHITE, 2.2).fade(0.01, 0.5);
            b.grav = 14;
            fx.emit('shard');
          }
        }
        this.host.cracks?.(5 + Math.round(rnd() * 3));
        // 4.6D: im Moment des Einrastens reißen 3D-Glas-Schnittflächen in der Luft auf, feine Raum-Schnittlinien entlang des Vorstoßes
        const ng = Math.min(9, Math.max(3, Math.round(len / 4)));
        for (let i = 0; i < ng; i++) {
          const k = (i + 0.5) / ng;
          this.vfx.glass(c.sx + dx * k, c.y + 1.2, c.sz + dz * k, c.yaw, 4, 2.6, i % 2 ? c.col : c.acc, 1.1);
        }
        for (let i = 0; i < 3; i++) this.vfx.slash(c.sx + dx * 0.5, c.y + 1 + i * 0.5, c.sz + dz * 0.5, Math.atan2(dx, dz), 0, (i - 1) * 0.6, len * 0.55, WHITE, this.ink(c.acc), { life: 0.5, sparks: 6, k: 1.4 });
        break;
      }
      default: break;
    }
  }

  // ---------- Zeitachsen ----------

  /** Je Bild: `dt` Spielzeit (Effekte verlangsamen in der Zeitlupe mit), `realDt` Echtzeit (Aufladen, Himmel) */
  update(dt: number, realDt: number) {
    // 4.6I: ein Schiffs-Schnitt je Bild; ein wartender kommt zuerst dran (auch im Standbild, dt = 0)
    this.splitBudget = 1;
    if (this.splitN > 0) this.drainSplit();
    this.stepCharge(realDt);
    this.stepPre(dt);
    for (const c of this.casts) if (c.on) this.stepCast(c, dt);
    this.stepAura(dt);
    // Verdunkeln: Blutmond-Finsternis, Gewitterwolke, Schwarzes Loch (weich hinein und heraus)
    let dk = 0;
    for (const c of this.casts) {
      if (!c.on) continue;
      const env = Math.min(1, c.t / 0.25) * Math.min(1, Math.max(0, CATACLYSM_DUR[c.kind] - c.t) / 0.6);
      // 4.6D: auch Säbel (Sturmwolke) und Sonne (Hitze-Kontrast) dunkeln leicht ab – die Energie leuchtet vor dunklem Grund
      // 4.6I: auch Flutdrache, Tornado, Feuerdrache und Klingenwand dunkeln den Himmel ab (Sturmwolken): ihre durchscheinenden Kerne
      // blichen vor dem hellen Taghimmel aus, die Tusche-Bilder wurden fast ganz weiß
      const k = c.kind === 'bloodMoon' ? 0.6 : c.kind === 'skyfall' ? 0.55 : c.kind === 'thunderJudgment' ? 0.42 : c.kind === 'blackHole' ? 0.28 : c.kind === 'sevenSeas' ? 0.3
        : c.kind === 'floodDragon' ? 0.5 : c.kind === 'vacuumStorm' ? 0.3 : c.kind === 'fireDragons' ? 0.26 : c.kind === 'horizonCut' ? 0.22 : c.kind === 'sunDance' || c.kind === 'himmelsgericht' ? 0.15 : 0;
      dk = Math.max(dk, k * env);
    }
    if (this.pre.on && this.pre.kind === 'thunderJudgment') dk = Math.max(dk, 0.3);
    // 4.7B Königsdruck: der Himmel verdunkelt sich kurz
    if (this.kingDarkT > 0) dk = Math.max(dk, 0.42 * Math.min(1, this.kingDarkT / 0.5));
    // 4.91: Akt 1 der Formen und Geistes-Faji (Aufladung) dunkelt den Himmel je nach Stufe ab
    if (this.formDarkT > 0) dk = Math.max(dk, this.formDarkK * Math.min(1, this.formDarkT / 0.35));
    // 4.6I: Himmelsreaktion der Vorbereitung – die Blutmond-Finsternis und die aufreißenden Sturmspiralen dunkeln schon in Akt 1 ab
    if (this.charge.on) { const cine = ULTIMATE_CINEMATICS[this.charge.kind]; if (cine?.sky === 'eclipse') dk = Math.max(dk, this.charge.kind === 'bloodMoon' ? 0.45 : 0.25); else if (cine?.sky === 'stormSpiral' || cine?.sky === 'gale') dk = Math.max(dk, 0.2); }
    // Himmelssturz: der Himmel reißt schon in der Zwischensequenz zur Sternennacht auf
    if ((this.pre.on && this.pre.kind === 'skyfall') || (this.charge.on && this.charge.kind === 'skyfall')) dk = Math.max(dk, 0.45);
    this.dark += (dk - this.dark) * Math.min(1, realDt * 5);
    if (this.dark < 0.002) this.dark = 0;
    this.host.darken?.(this.dark);
    // Himmelssturz: Blick zum Himmel, solange Meteoriten und Planet stürzen; zum Kollaps senkt sich die Kamera wieder auf den Einschlag
    let sky = 0;
    for (const c of this.casts) if (c.on && c.kind === 'skyfall') sky = Math.max(sky, smooth(c.t / 0.15) * (1 - smooth((c.t - 0.3) / 0.25)));
    this.host.skyLook?.(sky);
    // Wolken-Teilung klingt nach dem Ultimate langsam ab
    const want = this.charge.on ? this.rift : this.casts.some((c) => c.on) ? 1 : 0;
    this.rift += (want - this.rift) * Math.min(1, realDt * (want > this.rift ? 6 : 0.9));
    if (this.rift < 0.002) this.rift = 0;
    const src = this.charge.on ? this.charge : this.casts.find((c) => c.on) ?? this.charge;
    this.host.setRift(src.x, src.y, src.z, this.rift, this.riftCol);
    this.host.fx.update(dt);
  }

  private stepCast(c: Cast, dt: number) {
    const s = c.spec!;
    const t0 = c.t;
    c.t += dt;
    const t = c.t;
    const fx = this.host.fx, b = fx.brush;
    const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
    const f = c.f;
    c.tick += dt;
    // 4.6I: entscheidender Treffer genau `lag` nach dem Einschlag (die Zeitachsen unten zerbrechen dann die gezeichneten Schiffe)
    const decisive = c.lag > 0 && t0 < c.lag && t >= c.lag;
    const before = c.lag > 0 && t < c.lag;
    switch (c.kind) {
      case 'horizonCut': {
        // Wellenfront wie die Energiewand: zeichnet in Akt 2 jedes Schiff, das sie durchschneidet; im Treffermoment kippen Bug und Heck aller
        // gezeichneten Schiffe zugleich auseinander, danach zerteilt sie beim Durchgang sofort
        const front = s.reach * (1 - (1 - Math.min(1, t / 0.95)) ** 2);
        if (before) this.threat(c.x + fwdX * front, c.y + 2.5, c.z + fwdZ * front);
        for (const e of this.ships) {
          if (c.hit.includes(e)) continue;
          const dx = e.ship.x - c.x, dz = e.ship.z - c.z;
          const along = dx * fwdX + dz * fwdZ, across = Math.abs(dx * fwdZ - dz * fwdX);
          if (along < -e.ship.cls.L * 0.5 || across > s.width * 0.5 + e.ship.cls.L * 0.5 || along > front) continue;
          if (before) this.mark(c, e); else this.shipStrike(c, e, 'cross');
        }
        if (decisive) for (const e of c.marked) this.shipStrike(c, e, 'cross');
        if (c.tick > 0.05 && t < 0.9) {
          c.tick = 0;
          // Gischt und Funken an der Front
          const fr = front;
          // 4.6J: in Akt 2 weniger und niedrigere Gischtwände (sie standen als weiße Säulen vor der Klingenwelle)
          const nSpray = before ? 1 : 3;
          for (let i = 0; i < nSpray; i++) {
            const a = c.yaw + (rnd() - 0.5) * 2.4;
            const px = c.x + Math.sin(a) * fr, pz = c.z + Math.cos(a) * fr;
            b.reset().at(px, this.host.waterY(px, pz), pz).rot(a).size(4, 2, 1, 10, (before ? 4 : 7) + rnd() * (before ? 3 : 5), 1).span(0.6).col(SPRAY, before ? 0.3 : 0.5).fade(0.05, 0.6);
            fx.emit('wall');
            this.vfx.burst('spark', px, this.host.groundY(px, pz, c.y) + 1, pz, 3, 9, c.col, { up: 4 });
          }
          // 4.6D: glühende Schnittfurche: wo die Mitte der Klinge Land berührt, bleibt eine Magma-Spur (Krater, Glutring, Risse)
          const mx = c.x + fwdX * fr, mz = c.z + fwdZ * fr;
          if (this.host.isLand(mx, mz)) {
            const gy = this.host.groundY(mx, mz, c.y);
            b.reset().at(mx, gy + 0.05, mz).rot(c.yaw).size(1.2, 1, 3.5, 2.2, 1, 6).span(3.5).col(this.ink(EMBER), 1).fade(0.02, 0.3);
            fx.emit('crater');
            b.reset().at(mx, gy + 0.08, mz).rot(c.yaw).size(0.8, 1, 2.5, 1.6, 1, 5).span(2.8).col(EMBER, 1.8).fade(0.02, 0.4);
            fx.emit('shock');
            this.vfx.burst('ember', mx, gy + 0.3, mz, 4, 2, EMBER, { up: 3, size: 0.25 });
            this.host.combatFx?.burn(V.set(mx, gy + 0.05, mz), 3.2, '#ff7a3a');
          }
        }
        break;
      }
      case 'sevenSeas': this.stepSevenSeas(c, t0, t); break;
      case 'sawCyclone': {
        if (f && t < 1.0) {
          // Der Klingen-Wirbel rast entlang der Blickrichtung voran (4.6I: volle Reichweite bis zum Treffermoment, ~0,3 s – Überschall); die
          // Figur dasht mit, soweit der Boden es erlaubt – steht sie an Deck an der Reling, sägt der Wirbel allein weiter
          const prog = smooth(Math.min(1, t / Math.max(0.12, c.lag)));
          const pd = Math.hypot(f.x - c.x, f.z - c.z);
          const d = Math.max(pd, s.reach * prog);
          const wx = c.x + fwdX * d, wz = c.z + fwdZ * d;
          const wy = d > pd + 2 ? this.host.waterY(wx, wz) : f.y;
          if (before) this.threat(wx, wy + 1.6, wz);
          if (c.tick > 0.03) {
            c.tick = 0;
            // 4.6D: rotierende 360°-Kreissäge aus überlappenden schwarz-smaragdgrünen Sicheln in mehreren Höhen
            for (let i = 0; i < 4; i++) {
              const a = rnd() * Math.PI * 2, hy = wy + 0.3 + rnd() * 3.4, rl = (rnd() - 0.5) * 0.5;
              b.reset().at(wx, hy, wz).rot(a, 0, rl).size(2.8, 1, 2.8, 4.8, 1, 4.8).span(0.22).col(TMP.setRGB(0.01, 0.06, 0.035), 1).fade(0.02, 0.6).spin(18);
              fx.emit('sickleInk');
              b.reset().at(wx, hy, wz).rot(a, 0, rl).size(2.6, 1, 2.6, 4.4, 1, 4.4).span(0.18).col(i % 2 ? c.acc : i ? c.col : WHITE, 2.4).fade(0.02, 0.6).spin(18);
              fx.emit('sickle');
            }
            b.reset().at(wx, wy + 0.2, wz).size(2.5, 1, 2.5, 4.8, 1, 4.8).span(0.3).col(c.acc, 1.5).fade(0.05, 0.6).vel(0, 6, 0);
            fx.emit('ring');
            this.vfx.burst('spark', wx, wy + 1.5, wz, 5, 14, c.acc, { up: 2, spread: 3 });
            if (rnd() < 0.3) this.vfx.surfaceHit(wx, wy, wz, 2.4, c.acc, 0.6);
          }
          // Schiffe, durch die sich der Wirbel sägt: Segel und Masten zerfetzt, im Treffermoment der Länge nach in vier sinkende Sektionen
          for (const e of this.ships) {
            if (c.hit.includes(e) || c.marked.includes(e)) continue;
            if (this.capsuleNear(e, wx, wz, s.width * 0.5)) {
              this.wreck(e, 2, 0);
              if (before) this.mark(c, e); else this.shipStrike(c, e, 'length', 0, 4);
            }
          }
        }
        if (decisive) for (const e of c.marked) this.shipStrike(c, e, 'length', 0, 4);
        break;
      }
      case 'iaiWorldBreak': {
        // Nachglühen der Schnitte; die Splitter fallen
        if (c.step === 0) { c.step = 1; for (const e of this.ships) this.shipStrike(c, e, 'diagonal'); }
        break;
      }
      case 'fistStorm': this.stepFistStorm(c, t0, t); break;
      case 'oceanSplit': this.stepOcean(c, t0, t); break;
      case 'blackHole': this.stepBlackHole(c, t0, t, dt); break;
      case 'fireDragons': this.stepFireDragons(c, t0, t); break;
      case 'glacier': this.stepGlacier(c, t0, t); break;
      case 'floodDragon': this.stepFloodDragon(c, t0, t); break;
      case 'vacuumStorm': this.stepVacuumStorm(c, t0, t); break;
      case 'thunderJudgment': this.stepThunder(c, t0, t); break;
      case 'sunDance': case 'himmelsgericht': this.stepSunDance(c, t0, t); break;
      case 'bloodMoon': this.stepBloodMoon(c, t0, t); break;
      case 'skyfall': this.stepSkyfall(c, t0, t, dt); break;
      default: break;
    }
    if (decisive || (c.lag > 0 && !c.decided && t >= c.lag)) this.decide(c);
    if (t >= CATACLYSM_DUR[c.kind]) this.end(c);
  }

  private end(c: Cast) {
    c.on = false;
    if (c.trench) { this.host.setTrench(0, 0, 0, 0, 0, 0); c.trench = false; }
  }

  /** Alles abbrechen (Szenenwechsel, Raid-Start) */
  reset() {
    for (const c of this.casts) if (c.on) this.end(c);
    for (const q of this.splitQ) { q.c = null; q.e = null; }
    this.splitN = 0;
    this.charge.on = false;
    this.pre.on = false;
    this.rift = 0;
    this.dark = 0;
    this.host.darken?.(0);
    this.host.skyLook?.(0);
    this.auraF = null;
    this.willF = null;
    this.kingDarkT = 0;
    this.formDarkT = 0;
    for (const q of this.formQ) q.on = false;
    this.host.setRift(0, 0, 0, 0, this.riftCol);
    this.host.fx.clear();
  }

  // ---------- Erdspalter: Ozean-Teilung oder aufgerissener Boden ----------

  private stepOcean(c: Cast, t0: number, t: number) {
    const s = c.spec!;
    const fx = this.host.fx, b = fx.brush;
    const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
    const f0 = c.from;
    const ax = c.x + fwdX * f0, az = c.z + fwdZ * f0, bx = c.x + fwdX * s.reach, bz = c.z + fwdZ * s.reach;
    const L = c.lag, before = L > 0 && t < L, decisive = L > 0 && t0 < L && t >= L;
    const td = Math.max(28, f0 + 12);
    if (before) this.threat(c.x + fwdX * td, this.host.waterY(c.x + fwdX * td, c.z + fwdZ * td) - (c.trench ? 2 : -1), c.z + fwdZ * td);
    if (c.trench) {
      // Graben öffnet sich in Akt 2 (bis kurz vor dem Treffermoment), steht, schließt sich (1,2 s)
      const open = smooth(t / Math.max(0.12, L * 0.9 || 0.35)), close = 1 - smooth((t - 4.8) / 1.2);
      const depth = s.trench * Math.min(open, close);
      this.host.setTrench(ax, az, bx, bz, s.width * 0.5, depth);
      // 4.6D: Schiffe im Graben stürzen zur Grabenmitte hinab und prallen zusammen (4.6I: in Akt 2 schnell, damit der Zusammenprall im
      // Treffermoment liegt)
      const nav = this.host.naval;
      if (nav && t > 0.04 && t < 4.6) for (const e of this.ships) {
        if (e.ship.sinking > 0) continue;
        const dx = e.ship.x - c.x, dz = e.ship.z - c.z;
        const along = dx * fwdX + dz * fwdZ, across = dx * fwdZ - dz * fwdX;
        if (along < f0 - 4 || along > s.reach || Math.abs(across) > s.width * 0.5 + e.ship.cls.W) continue;
        nav.cataclysmPull(e, c.x + fwdX * along, c.z + fwdZ * along, (before ? 14 : 2.2) * (t - t0));
      }
      if (t0 === 0 && t > 0) {
        // 3D-Luft-Risse über dem Faustschlag
        this.vfx.glass(c.x + fwdX * 3, c.y + 2, c.z + fwdZ * 3, c.yaw, 8, 3.2, c.col, 1);
        // Wasserwände an beiden Rändern (genau einmal: früher feuerte die Bedingung in mehreren kleinen Zeitlupen-Schritten)
        const n = Math.round((s.reach - f0 + 4) / 6);
        for (let i = 0; i < n; i++) {
          const d = f0 + 2 + ((s.reach - f0 - 4) * i) / n;
          for (const side of [-1, 1]) {
            const wx = c.x + fwdX * d + fwdZ * side * (s.width * 0.5 + 1.5), wz = c.z + fwdZ * d - fwdX * side * (s.width * 0.5 + 1.5);
            const h = s.trench * (0.55 + rnd() * 0.35) + 2;
            b.reset().at(wx, -s.trench * 0.7, wz).rot(c.yaw + (rnd() - 0.5) * 0.2).size(6.5, 1, 1, 7.5, h, 1).span(5.4 + rnd() * 0.4, i * 0.012).col(SPRAY, 0.38).fade(0.06, 0.3);
            b.ease = 1;
            b.flicker = 0.15;
            fx.emit('wall');
          }
        }
        this.host.shake(1.3);
      }
      // Gischt fällt von den Wänden
      if (t < 5 && c.tick > 0.06) {
        c.tick = 0;
        const d = f0 + 2 + rnd() * (s.reach - f0 - 4), side = rnd() < 0.5 ? -1 : 1;
        const wx = c.x + fwdX * d + fwdZ * side * s.width * 0.5, wz = c.z + fwdZ * d - fwdX * side * s.width * 0.5;
        b.reset().at(wx, 1, wz).rot(c.yaw).vel(-fwdZ * side * 3, -2, fwdX * side * 3).size(4, 3, 1, 6, 7, 1).span(0.8).col(SPRAY, 0.4).fade(0.1, 0.6);
        fx.emit('wall');
        // schäumende Kanten: Gischt-Kronen und Tropfen an den Grabenwänden
        b.reset().at(wx, 0.5, wz).rot(rnd() * 6).size(1.5, 1.5, 1.5, 4, 5, 4).span(0.9).col(SPRAY, 1).fade(0.03, 0.5);
        fx.emit('splash');
        this.vfx.burst('drop', wx, 3, wz, 4, 4, SPRAY, { up: 4, spread: 3, size: 0.3 });
      }
      // Treffermoment: die Schiffe prallen im Graben zusammen – schwerer Schaden (sie sinken mit dem Wasser ab: heightAt kennt den Graben),
      // Splitter und Funken fliegen an der Aufprallstelle
      if (decisive || (L <= 0 && t0 < 0.3 && t >= 0.3)) for (const e of this.ships) {
        const dx = e.ship.x - c.x, dz = e.ship.z - c.z;
        const along = dx * fwdX + dz * fwdZ, across = Math.abs(dx * fwdZ - dz * fwdX);
        if (along > f0 - 4 - e.ship.cls.L * 0.5 && along < s.reach + e.ship.cls.L * 0.5 && across < s.width * 0.5 + e.ship.cls.W) {
          if (!c.marked.includes(e)) c.marked.push(e);
          this.shipDamage(c, e, 1.2);
          const mx = c.x + fwdX * along, mz = c.z + fwdZ * along, wy = this.host.waterY(mx, mz);
          this.vfx.burst('splinter', mx, wy + 1.5, mz, 14, 9, WHITE, { up: 6, size: 0.45, spread: e.ship.cls.W });
          this.vfx.burst('spark', mx, wy + 2, mz, 10, 10, c.acc, { up: 4, size: 0.3 });
          this.vfx.pressureRing(mx, wy + 2, mz, c.yaw, true, e.ship.cls.W * 1.2, WHITE, 0.4);
        }
        this.host.shake(1.2);
      }
    } else if (t0 === 0 && t > 0) {
      // an Land: der Boden reißt auf, Felsen heben sich, Platten kippen
      const n = Math.round(s.reach / 3.2);
      for (let i = 0; i < n; i++) {
        const d = 3 + ((s.reach - 3) * i) / n;
        for (const side of [-1, 1]) {
          const off = side * (1.5 + rnd() * s.width * 0.45);
          const px = c.x + fwdX * d + fwdZ * off, pz = c.z + fwdZ * d - fwdX * off;
          const gy = this.host.groundY(px, pz, c.y);
          const sz = 0.8 + rnd() * 1.8 * (1 - i / n * 0.4);
          b.reset().at(px, gy - sz * 1.6, pz).rot(rnd() * 6, side * (0.2 + rnd() * 0.4), (rnd() - 0.5) * 0.6).size(sz, sz, sz).span(4.2, i * 0.018).col(WHITE, 1).fade(0.01, 0.15);
          b.vy = sz * 4.2; b.drag = 4;
          fx.emit('rock');
        }
        if (i % 3 === 0) {
          const cx = c.x + fwdX * d, cz = c.z + fwdZ * d, cy = this.host.groundY(cx, cz, c.y);
          this.host.combatFx?.crack(V.set(cx, cy + 0.05, cz), 3.5);
          this.vfx.surfaceHit(cx, cy, cz, 2.6, c.col, 1, i * 0.018);
        }
      }
      this.vfx.glass(c.x + fwdX * 3, c.y + 2, c.z + fwdZ * 3, c.yaw, 8, 3.2, c.col, 1);
      this.host.shake(1.3);
    }
  }

  // ---------- Schwarzes Loch ----------

  private stepBlackHole(c: Cast, t0: number, t: number, dt: number) {
    const s = c.spec!;
    const fx = this.host.fx, b = fx.brush;
    const cy = c.y + 3;
    const L = c.lag > 0 ? c.lag : 2.15;
    if (t < L) this.threat(c.cx, cy, c.cz);
    if (t < L) {
      if (c.tick > 0.03) {
        c.tick = 0;
        // Spiralarme: Splitter und Funken stürzen ins Zentrum
        for (let i = 0; i < 4; i++) {
          const a = rnd() * Math.PI * 2, r = 8 + rnd() * (s.reach * 0.45);
          const px = c.cx + Math.sin(a) * r, pz = c.cz + Math.cos(a) * r;
          const ta = a + 1.1;
          b.reset().at(px, cy + (rnd() - 0.5) * 4, pz).vel((c.cx - px) * 1.4 + Math.sin(ta) * 9, (cy - (cy + 0)) * 1.4, (c.cz - pz) * 1.4 + Math.cos(ta) * 9).spin(rnd() * 8, rnd() * 8).size(0.5, 1.1, 0.5, 0.05, 0.1, 0.05).span(0.7).col(i % 2 ? c.col : WHITE, 1.8).fade(0.05, 0.3);
          fx.emit('shard');
        }
      }
      // Schiffe und Trümmer ansaugen (4.6I: in Akt 2 stark, damit der Sog in der Weitwinkel-Kamera sichtbar wird); was den Kern erreicht,
      // wird gezeichnet und im Kollaps radial zerquetscht
      const nav = this.host.naval;
      const pullR = s.reach + 30;
      if (nav) for (const e of this.ships) {
        if (c.hit.includes(e) || e.ship.sinking > 0) continue;
        const d = Math.hypot(e.ship.x - c.cx, e.ship.z - c.cz);
        if (d > pullR + e.ship.cls.L * 0.5) continue;
        // spiralförmig: der Zielpunkt eilt dem Zentrum quer voraus (die Schiffe kreisen hinein)
        const ta = Math.atan2(e.ship.x - c.cx, e.ship.z - c.cz) + 0.9, tr = d * 0.55;
        nav.cataclysmPull(e, c.cx + Math.sin(ta) * tr, c.cz + Math.cos(ta) * tr, s.shipPull * dt * 3 * (1.3 - Math.min(1, d / pullR) * 0.6));
        this.stats.pulls++;
        if (d < 6 + e.ship.cls.L * 0.35) this.mark(c, e);
      }
      this.host.debris?.pull(c.cx, cy, c.cz, s.reach, 14 * dt);
    }
    if (t0 < L && t >= L) {
      // Kollaps (entscheidender Treffer): alles im Sog wird radial zerquetscht
      for (const e of this.ships) {
        if (c.hit.includes(e) || e.ship.sinking > 0) continue;
        if (Math.hypot(e.ship.x - c.cx, e.ship.z - c.cz) <= s.reach + 30 + e.ship.cls.L * 0.5) this.shipStrike(c, e, 'radial');
      }
      // Kollaps: Lichtblitz und Druckring
      b.reset().at(c.cx, cy, c.cz).size(1, 1, 1, 14, 14, 14).span(0.45).col(WHITE, 2.4).fade(0.01, 0.8);
      fx.emit('orb');
      b.reset().at(c.cx, cy - 2.5, c.cz).size(4, 1, 4, s.reach, 1, s.reach).span(0.8).col(c.col, 2.2).fade(0.01, 0.7);
      fx.emit('ring');
      // 4.6D: der Kollaps sprengt alles nach außen: Druckringe, Splitter, Funken (die zerquetschten Rümpfe fliegen auseinander)
      this.vfx.pressureRing(c.cx, cy, c.cz, 0, false, s.reach * 0.8, c.col, 0.7);
      this.vfx.burst('spark', c.cx, cy, c.cz, 30, 22, c.col, { up: 2, size: 0.5 });
      this.vfx.burst('splinter', c.cx, cy, c.cz, 18, 16, WHITE, { up: 6, size: 0.45, spread: 4 });
      this.host.shake(1.2);
    }
  }

  // ---------- 4.6E: Himmelssturz – Zwillings-Meteoriten & Planeten-Kollaps ----------

  /**
   * Sternenhimmel: ein Band aus Sternen (leuchtende Punkte, flackernd) 150 – 260 m vor der Figur, flach über dem Horizont bis gut 45° hoch –
   * dort, wohin die Kamera hinter der Figur blickt (eine Kuppel genau über der Figur sah sie nie)
   */
  private starfield(x: number, y: number, z: number, yaw: number, life: number, delay = 0) {
    const fx = this.host.fx, b = fx.brush;
    const n = Math.round(90 * this.detailK);
    for (let i = 0; i < n; i++) {
      const a = yaw + (rnd() - 0.5) * 3.4, el = 0.05 + rnd() * rnd() * 0.75, r = 150 + rnd() * 110;
      const sx = x + Math.cos(el) * Math.sin(a) * r, sz = z + Math.cos(el) * Math.cos(a) * r, sy = y + Math.sin(el) * r;
      const s = 0.45 + rnd() * rnd() * 1.4;
      b.reset().at(sx, sy, sz).size(s * 0.3, s * 0.3, s * 0.3, s, s, s).span(life, delay + rnd() * 0.15).col(rnd() < 0.2 ? STARGOLD : rnd() < 0.3 ? STARBLUE : WHITE, 2.6).fade(0.1, 0.35);
      b.flicker = 0.35;
      fx.emit('orb');
    }
  }

  /** Startbilder: Lichtriss vom Himmel, Sternenkuppel (falls die Sequenz kurz war), Kometenschweif-Vorboten */
  private beginSkyfall(c: Cast) {
    const fx = this.host.fx, b = fx.brush, s = c.spec!;
    SKY_HIT.fill(0);
    this.starfield(c.x, c.y, c.z, c.yaw, CATACLYSM_DUR.skyfall, 0);
    // Riss im Himmel über dem Einschlag: drei Lichtsäulen (Kern weiß, Farbe, Akzent), darunter ein Runenring
    b.reset().at(c.cx, c.y - 1, c.cz).size(0.6, 160, 0.6, 3, 160, 3).span(0.5).col(WHITE, 2.4).fade(0.02, 0.6);
    fx.emit('column');
    b.reset().at(c.cx, c.y - 1, c.cz).size(2, 160, 2, 8, 160, 8).span(0.8).col(c.acc, 1.8).fade(0.04, 0.6);
    fx.emit('column');
    b.reset().at(c.cx, this.host.groundY(c.cx, c.cz, c.y) + 0.1, c.cz).size(4, 1, 4, s.reach * 0.9, 1, s.reach * 0.9).span(1.0).col(c.acc, 1.6).fade(0.05, 0.6).spin(1.2);
    fx.emit('ring');
    this.sound('voidRumble', 1, c.cx, c.y, c.cz);
  }

  /** Ort eines Meteors zur Zeit u (0 Start hoch am Himmel, 1 Einschlag): schräge Bahn von weit vorn, über Kreuz von links und rechts */
  private meteorAt(c: Cast, k: number, u: number, out: { x: number; y: number; z: number }) {
    const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
    // Einschlag 11 m bzw. 22 m vor der Figur (SKYFALL_OFFSETS), an Deck um `shift` weiter vorn
    const d = (k === 0 ? 11 : 22) + c.shift, side = k === 0 ? -1 : 1;
    const ix = c.x + fwdX * d, iz = c.z + fwdZ * d;
    const iy = this.host.groundY(ix, iz, c.y);
    // Start: 80 m hoch, 110 m weiter vorn und 45 m seitlich – die Kamera hinter der Figur sieht die Kometenschweife über den Himmel ziehen
    const sx = ix + fwdX * 110 - fwdZ * side * 45, sz = iz + fwdZ * 110 + fwdX * side * 45, sy = iy + 80;
    const e = u * u;
    out.x = sx + (ix - sx) * e; out.y = sy + (iy - sy) * e; out.z = sz + (iz - sz) * e;
  }

  private stepSkyfall(c: Cast, t0: number, t: number, dt: number) {
    const s = c.spec!, fx = this.host.fx, b = fx.brush;
    const P = SKY_P;
    const T1 = SKYFALL_TIMES.meteor1, T2 = SKYFALL_TIMES.meteor2, TP = SKYFALL_TIMES.planet;
    // Zwillings-Meteoriten (4.6I): beide stürzen in Akt 2 aus dem aufgerissenen Himmel (Start 0 / 0,04 s), Einschlag 0,3 s (= Treffermoment
    // der Kino-Regie) und 0,36 s; Kopf, pfeilförmiger Mach-Kegel, Kometenschweif (Kern additiv), dunkler Rauchmantel, Glut
    for (let k = 0; k < 2; k++) {
      const ts = k === 0 ? 0 : 0.04, ti = k === 0 ? T1 : T2;
      if (t >= ts && t0 < ti) {
        const u = Math.min(1, (t - ts) / (ti - ts));
        this.meteorAt(c, k, u, P);
        // Flugrichtung aus der Bahn (kurz voraus): der Mach-Kegel zeigt mit der Spitze voran
        const hx = P.x, hy = P.y, hz = P.z;
        this.meteorAt(c, k, Math.min(1, u + 0.04), P);
        const vx = P.x - hx, vy = P.y - hy, vz = P.z - hz;
        P.x = hx; P.y = hy; P.z = hz;
        if (k === 0 && t < T1) this.threat(hx, hy, hz);
        if (u < 0.97) { this.vfx.machCone(hx, hy, hz, vx, vy, vz, 11, 3.4, k ? c.acc : GOLD, 0.05); this.stats.cones++; }
        // Kopf: weißglühender Kern in Farbe, je Bild ein kurzlebiges Glied des Schweifs
        b.reset().at(P.x, P.y, P.z).size(2.6, 2.6, 2.6, 1.2, 1.2, 1.2).span(0.12).col(WHITE, 3).fade(0.01, 0.4);
        fx.emit('orb');
        b.reset().at(P.x, P.y, P.z).size(4.2, 4.2, 4.2, 1.4, 1.4, 1.4).span(0.35).col(k ? c.acc : c.col, 2.2).fade(0.01, 0.6);
        fx.emit('orb');
        b.reset().at(P.x, P.y + 1.5, P.z).size(3, 3, 3, 6, 6, 6).span(0.9).col(TMP.setRGB(0.06, 0.04, 0.08), 1).fade(0.05, 0.5);
        fx.emit('smoke');
        if (rnd() < 0.6) this.vfx.burst('ember', P.x, P.y, P.z, 2, 4, k ? c.acc : GOLD, { up: 1, spread: 1.5, size: 0.45 });
      }
      if (t0 < ti && t >= ti) {
        this.meteorAt(c, k, 1, P);
        this.stats.meteors++;
        b.reset().at(P.x, P.y + 2, P.z).size(1, 1, 1, 9, 9, 9).span(0.35).col(WHITE, 2.6).fade(0.01, 0.8);
        fx.emit('orb');
        this.vfx.surfaceHit(P.x, P.y, P.z, 8, k ? c.acc : c.col, 1.8);
        this.vfx.pressureRing(P.x, P.y + 1, P.z, 0, false, 16, c.col, 0.55);
        this.vfx.burst('rock', P.x, P.y + 0.5, P.z, 10, 16, TMP.setRGB(0.3, 0.26, 0.24), { up: 12, size: 0.8, spread: 3 });
        this.vfx.burst('spark', P.x, P.y + 1, P.z, 24, 20, k ? c.acc : GOLD, { up: 6, size: 0.45 });
        // Feuer- und Gischtfontäne (4.6I): eine hohe Säule aus Glut bzw. Wasser schießt am Einschlag empor
        const land = this.host.isLand(P.x, P.z);
        b.reset().at(P.x, P.y - 0.5, P.z).size(2.5, 4, 2.5, 6, 26, 6).span(0.9).col(land ? EMBER : SPRAY, land ? 1.8 : 1).fade(0.02, 0.5);
        fx.emit(land ? 'column' : 'splash');
        if (land) this.host.combatFx?.crack(V.set(P.x, P.y + 0.05, P.z), 7);
        // der erste Einschlag ist der Treffermoment (Doppel-Impact-Frame über die Kino-Regie); ohne Regie zeigt die Welt ihn selbst
        if (k === 0 && c.lag <= 0) this.host.impactFrames?.(2);
        this.host.shake(1.2);
        this.sound('impactCrack', 1, P.x, P.y, P.z);
        // Schiffe am Einschlag: radial zerschmettert (bis Stufe 4), sonst schwerer Schaden mit Brand – je Bild höchstens eins (Zerlegen
        // und Verkohlen kosten Zeit: nie alle Rümpfe im selben Bild)
        SKY_HIT[k] = 1;
        SKY_HX[k] = P.x; SKY_HZ[k] = P.z;
      }
      if (SKY_HIT[k] && t0 >= ti) {
        const e = this.nearestUnhit(c, SKY_HX[k], SKY_HZ[k], 12);
        if (e) { e.ship.fire = Math.max(e.ship.fire, 10); this.wreck(e, 2, 0.6, 0.6); this.shipStrike(c, e, 'radial', 4, 3); }
        else SKY_HIT[k] = 0;
      }
    }
    // Planet: erscheint hinter den Meteoriten hoch am Himmel (gleich beim Aufreißen), stürzt herab und kollidiert noch in Akt 3
    const gy = this.host.groundY(c.cx, c.cz, c.y);
    const R = 9 * (1 + Math.max(0, s.reach / 40 - 1) * 0.5);
    if (t >= 0 && t0 < TP) {
      const u = Math.min(1, t / TP), e = u * u;
      // schräg von vorn oben (130 m voraus, 110 m hoch) auf den Mittelpunkt: im Bild der Kamera hinter der Figur
      const fwX = Math.sin(c.yaw), fwZ = Math.cos(c.yaw);
      const px = c.cx + fwX * 130 * (1 - e), pz = c.cz + fwZ * 130 * (1 - e);
      const py = gy + R + 110 * (1 - e);
      if (c.step === 0) { c.step = 1; this.stats.planets++; }
      if (c.tick > 0.03) {
        c.tick = 0;
        // Körper (fest, dunkel violett), Lichthof (additiv), Planetenring (geneigt): je Takt neu am Ort des Sturzes
        b.reset().at(px, py, pz).rot(t * 0.8, 0.3, 0).size(R, R, R, R, R, R).span(0.05).col(TMP.setRGB(0.22, 0.14, 0.34), 1).fade(0.01, 0.01);
        fx.emit('void');
        b.reset().at(px, py, pz).size(R * 1.35, R * 1.35, R * 1.35, R * 1.5, R * 1.5, R * 1.5).span(0.08).col(c.acc, 1.6).fade(0.01, 0.5);
        fx.emit('orb');
        b.reset().at(px, py, pz).rot(c.yaw, 0.45, 0.25).size(R * 1.6, 1, R * 1.6, R * 1.9, 1, R * 1.9).span(0.08).col(c.col, 2).fade(0.01, 0.5);
        fx.emit('ring');
        // Feuerschweif hinter dem Planeten (er reißt die Luft auf) und dunkler Rauch entlang der Bahn
        b.reset().at(px + fwX * R * 1.2 + (rnd() - 0.5) * R, py + R * 0.9, pz + fwZ * R * 1.2 + (rnd() - 0.5) * R).size(R * 0.5, R * 0.5, R * 0.5, R * 1.2, R * 1.2, R * 1.2).span(0.6).col(TMP.setRGB(0.07, 0.05, 0.09), 1).fade(0.05, 0.5);
        fx.emit('smoke');
        this.vfx.burst('ember', px + fwX * R, py + R * 0.5, pz + fwZ * R, 3, 6, GOLD, { up: 6, spread: R * 0.8, size: 0.6 });
      }
    }
    if (t0 < TP && t >= TP) {
      // Kollision: weißer Blitz, schwarz-weiße Tusche-Impact-Frames, Druckringe, Krater bzw. Meerestrichter, Gestein und Glut
      this.stats.planets++;
      b.reset().at(c.cx, gy + 3, c.cz).size(4, 4, 4, R * 2.6, R * 2.6, R * 2.6).span(0.5).col(WHITE, 3).fade(0.01, 0.8);
      fx.emit('orb');
      b.reset().at(c.cx, gy + 0.3, c.cz).size(4, 1, 4, s.reach * 1.25, 1, s.reach * 1.25).span(1.0).col(c.col, 2.3).fade(0.01, 0.7);
      fx.emit('ring');
      b.reset().at(c.cx, gy + 0.2, c.cz).size(3, 1, 3, s.reach * 0.9, 1, s.reach * 0.9).span(1.3).col(c.acc, 2).fade(0.05, 0.6);
      fx.emit('ring');
      this.vfx.pressureRing(c.cx, gy + 2, c.cz, 0, false, s.reach * 1.1, c.col, 0.8);
      this.vfx.pressureRing(c.cx, gy + 4, c.cz, c.yaw, true, R * 2.2, c.acc, 0.5);
      this.vfx.surfaceHit(c.cx, gy, c.cz, Math.min(22, R * 1.8), c.col, 2.6);
      this.vfx.burst('rock', c.cx, gy + 1, c.cz, 26, 26, TMP.setRGB(0.28, 0.24, 0.22), { up: 18, size: 1.2, spread: R });
      this.vfx.burst('spark', c.cx, gy + 2, c.cz, 50, 30, GOLD, { up: 8, size: 0.6, spread: R });
      this.vfx.burst('smoke', c.cx, gy + 3, c.cz, 12, 4, TMP.setRGB(0.05, 0.04, 0.06), { up: 6, size: 6, spread: R, life: 2.4 });
      if (this.host.isLand(c.cx, c.cz)) {
        this.host.combatFx?.crack(V.set(c.cx, gy + 0.05, c.cz), R * 1.6);
        this.host.combatFx?.burn(V.set(c.cx, gy + 0.05, c.cz), R * 1.2);
      } else c.trench = true;
      this.host.impactFrames?.(3);
      this.host.cracks?.(4);
      this.host.shake(1.7);
      this.sound('quakeRumble', 1, c.cx, gy, c.cz);
      this.sound('impactCrack', 1, c.cx, gy, c.cz);
      SKY_HIT[2] = 1;
    }
    // Schiffe im Kollisionsradius: radial zerschmettert (bis Stufe 4), in Brand – je Bild eins; danach trifft die Druckwelle den Rest
    if (SKY_HIT[2] && t0 >= TP) {
      const e = this.nearestUnhit(c, c.cx, c.cz, s.reach);
      if (e) { e.ship.fire = Math.max(e.ship.fire, 12); this.wreck(e, 3, 0.85, 0.8); this.shipStrike(c, e, 'radial', 6, 4); }
      else { SKY_HIT[2] = 0; this.areaShips(c, c.cx, c.cz, s.reach + 30, 0.8, 'shove'); }
    }
    // Meerestrichter: öffnet sich nach der Kollision und schließt sich langsam (Schiffe sinken mit, `trenchCPU`)
    if (c.trench) {
      const open = Math.min(1, (t - TP) / 0.2), close = Math.min(1, Math.max(0, CATACLYSM_DUR.skyfall - t) / 1.2);
      const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw), L = R * 0.8;
      this.host.setTrench(c.cx - fwdX * L, c.cz - fwdZ * L, c.cx + fwdX * L, c.cz + fwdZ * L, R * 1.1, 7 * Math.min(open, close));
      this.stats.trench++;
    }
    // Nachglühen: Glut regnet, Rauchsäulen steigen aus dem Krater
    if (t > TP + 0.1 && t < CATACLYSM_DUR.skyfall - 0.4 && c.tick > 0.06) {
      c.tick = 0;
      const a = rnd() * Math.PI * 2, r = rnd() * s.reach * 0.6;
      this.vfx.burst('ember', c.cx + Math.sin(a) * r, gy + 0.5, c.cz + Math.cos(a) * r, 3, 3, rnd() < 0.5 ? GOLD : c.acc, { up: 5, spread: 2, size: 0.4 });
      if (rnd() < 0.3) this.vfx.burst('smoke', c.cx + Math.sin(a) * r, gy + 1, c.cz + Math.cos(a) * r, 1, 1.2, TMP.setRGB(0.05, 0.04, 0.05), { up: 4, size: 4, life: 1.8 });
    }
    void dt;
  }

  /** Nächstes noch nicht getroffenes, schwimmendes Schiff dieses Wirkens im Umkreis r um (x, z) – Rumpfmitte minus halbe Länge */
  private nearestUnhit(c: Cast, x: number, z: number, r: number): EnemyShip | null {
    let best: EnemyShip | null = null, bd = r;
    for (const e of this.ships) {
      if (c.hit.includes(e) || e.ship.sinking > 0) continue;
      const d = Math.hypot(e.ship.x - x, e.ship.z - z) - e.ship.cls.L * 0.5;
      if (d <= bd) { bd = d; best = e; }
    }
    return best;
  }

  /** 4.6E: Nachbeben eines Ultimates (Ultimate-Evolution): Druckring, Gestein bzw. Gischt, Risse */
  aftershockFx(x: number, z: number, r: number, color: string) {
    const fx = this.host.fx, b = fx.brush, col = this.color(color);
    const y = this.host.groundY(x, z, 0);
    this.stats.aftershocks++;
    b.reset().at(x, y + 0.2, z).size(2, 1, 2, r * 1.15, 1, r * 1.15).span(0.6).col(col, 2.1).fade(0.01, 0.7);
    fx.emit('ring');
    this.vfx.pressureRing(x, y + 1, z, 0, false, r, col, 0.5);
    this.vfx.surfaceHit(x, y, z, Math.min(10, r * 0.5), col, 1.2);
    this.vfx.burst('rock', x, y + 0.5, z, 8, 10, TMP.setRGB(0.3, 0.27, 0.24), { up: 8, size: 0.6, spread: r * 0.4 });
    if (this.host.isLand(x, z)) this.host.combatFx?.crack(V.set(x, y + 0.05, z), r * 0.6);
    this.host.shake(0.8);
    this.sound('quakeRumble', 0.7, x, y, z);
  }

  /** 4.6E: Element-Entladung beim Sturm-Schritt (Synergie): Ring und Funken in der Stilfarbe am neuen Ort der Figur */
  stormBurstFx(x: number, y: number, z: number, r: number, color: string, element: string) {
    const fx = this.host.fx, b = fx.brush, col = this.color(color);
    this.stats.bursts++;
    b.reset().at(x, y + 0.15, z).size(1, 1, 1, r * 1.1, 1, r * 1.1).span(0.35).col(col, 2.4).fade(0.01, 0.7);
    fx.emit('ring');
    this.vfx.pressureRing(x, y + 1, z, 0, false, r, col, 0.35);
    this.vfx.burst(element === 'eis' ? 'ice' : element === 'feuer' || element === 'sonne' ? 'ember' : 'spark', x, y + 1, z, 16, 10, col, { up: 3, size: 0.4 });
  }

  // ---------- Schiffe ----------

  /** Zerteilen, wenn erlaubt; sonst schwerer Schaden (Boss-Schiffe über 15 %, Legenden) */
  private shipStrike(c: Cast, e: EnemyShip, cut: Exclude<ShipCut, ''>, lift = 0, sections = 2) {
    const nav = this.host.naval;
    if (!nav || c.hit.includes(e)) return;
    c.hit.push(e);
    const seed = c.seed + c.hit.length;
    if (this.splitBudget <= 0 && this.splitN < this.splitQ.length) {
      const q = this.splitQ[(this.splitHead + this.splitN) % this.splitQ.length];
      q.c = c; q.e = e; q.cut = cut; q.seed = seed; q.lift = lift; q.sections = sections;
      this.splitN++;
      this.stats.queued++;
      return;
    }
    this.splitBudget--;
    this.doSplit(c, e, cut, seed, lift, sections);
  }

  /** Den ältesten wartenden Schnitt ausführen */
  private drainSplit() {
    const q = this.splitQ[this.splitHead];
    this.splitHead = (this.splitHead + 1) % this.splitQ.length;
    this.splitN--;
    const c = q.c, e = q.e;
    q.c = null; q.e = null;
    if (!c || !e) return;
    this.splitBudget--;
    this.doSplit(c, e, q.cut, q.seed, q.lift, q.sections);
  }

  private doSplit(c: Cast, e: EnemyShip, cut: Exclude<ShipCut, ''>, seed: number, lift: number, sections: number) {
    const nav = this.host.naval;
    if (!nav) return;
    const r = nav.cataclysmSplit(e, cut, seed, lift, sections);
    if (r === 'split') {
      this.stats.splits++;
      if (sections > 2) this.stats.sections++;
      this.cutFlash(c, e);
      return;
    }
    if (r === 'disabled') { this.stats.disabled++; return; }
    this.shipDamage(c, e, 1);
  }

  private shipDamage(c: Cast, e: EnemyShip, k: number) {
    const nav = this.host.naval;
    if (!nav) return;
    nav.cataclysmHit(e, e.ship.maxHull * ULT_SHIP_DMG * k, ULT_SHIP_PEN);
    this.stats.shipHits++;
    const fx = this.host.fx, b = fx.brush;
    b.reset().at(e.ship.x, e.ship.model.deckY + 2, e.ship.z).size(1, 1, 1, e.ship.cls.W * 1.2, e.ship.cls.W * 1.2, e.ship.cls.W * 1.2).span(0.4).col(c.acc, 2).fade(0.01, 0.7);
    fx.emit('orb');
  }

  /** Leuchtender Schnitt durch das Schiff im Moment der Teilung */
  private cutFlash(c: Cast, e: EnemyShip) {
    const s = e.ship, fx = this.host.fx, b = fx.brush;
    const y = s.model.deckY * 0.5;
    const yaw = c.kind === 'sawCyclone' ? s.heading : s.heading + Math.PI / 2;
    b.reset().at(s.x, y, s.z).rot(yaw, 0, Math.PI / 2).size(1, 1, 1, s.cls.L * 0.7, 1, s.cls.L * 0.7).span(0.6).col(WHITE, 3).fade(0.01, 0.7);
    fx.emit('blade');
    b.reset().at(s.x, y, s.z).size(1, 1, 1, s.cls.W * 1.5, s.cls.W * 1.5, s.cls.W * 1.5).span(0.5).col(c.col, 2.4).fade(0.01, 0.7);
    fx.emit('orb');
    this.host.combatFx?.shockwave(V.set(s.x, 0.6, s.z), s.cls.L * 0.5, '#' + c.acc.getHexString());
    // 4.6D: Explosionen an der Bruchstelle – Holzsplitter, Glut, schwarzer Rauch, Gischtkrone an der Wasserlinie
    const wy = this.host.waterY(s.x, s.z);
    this.vfx.burst('splinter', s.x, s.model.deckY, s.z, 14, 9, WHITE, { up: 8, size: 0.4, spread: s.cls.W });
    this.vfx.burst('ember', s.x, s.model.deckY + 1, s.z, 8, 4, EMBER, { up: 4, spread: s.cls.W, size: 0.3 });
    this.vfx.burst('smoke', s.x, s.model.deckY + 1.5, s.z, 6, 2, TMP.setRGB(0.05, 0.045, 0.04), { up: 2.5, size: 2.4, spread: s.cls.W, life: 1.6 });
    this.vfx.surfaceHit(s.x, wy, s.z, s.cls.W * 0.9, c.col, 1.3);
  }

  /** 4.6D: Masten absprengen, Rumpf verkohlen (glow > 0: glühendes Wrack), dazu Glut und Rauch auf Deck */
  private wreck(e: EnemyShip, masts: number, char: number, glow = 0) {
    const s = e.ship;
    if (masts > 0) { s.blowMasts(masts); this.stats.masts++; }
    if (char > 0) {
      s.char(char, glow);
      this.stats.charred++;
      this.vfx.burst('ember', s.x, s.model.deckY + 1, s.z, 10, 3, glow > 0 ? GOLD : EMBER, { up: 4, spread: s.cls.L * 0.5, size: 0.35 });
      this.vfx.burst('smoke', s.x, s.model.deckY + 2, s.z, 5, 1.5, TMP.setRGB(0.04, 0.035, 0.03), { up: 3, spread: s.cls.L * 0.4, size: 2.6, life: 2 });
    }
  }

  /** Alle eingesammelten Schiffe im Umkreis treffen (je Wirken einmal), mit Zusatzwirkung */
  private areaShips(c: Cast, x: number, z: number, r: number, k: number, extra: '' | 'fire' | 'freeze' | 'shove' = '') {
    for (const e of this.ships) {
      if (c.hit.includes(e) || e.ship.sinking > 0) continue;
      if (Math.hypot(e.ship.x - x, e.ship.z - z) - e.ship.cls.L * 0.5 > r) continue;
      c.hit.push(e);
      this.shipDamage(c, e, k);
      if (extra === 'fire') e.ship.fire = Math.max(e.ship.fire, 10);
      else if (extra === 'freeze') e.ship.frozen = Math.max(e.ship.frozen, 4);
      else if (extra === 'shove') { const dx = e.ship.x - c.x, dz = e.ship.z - c.z, d = Math.hypot(dx, dz) || 1; e.ship.shoveX += (dx / d) * 6; e.ship.shoveZ += (dz / d) * 6; }
    }
  }

  /** Rumpf als Kapsel (Bug–Heck) nahe am Punkt? */
  private capsuleNear(e: EnemyShip, x: number, z: number, r: number): boolean {
    const s = e.ship, hx = Math.sin(s.heading) * s.cls.L * 0.45, hz = Math.cos(s.heading) * s.cls.L * 0.45;
    const ax = s.x - hx, az = s.z - hz, abx = 2 * hx, abz = 2 * hz;
    const u = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / Math.max(1e-4, abx * abx + abz * abz)));
    return Math.hypot(x - ax - abx * u, z - az - abz * u) < r + s.cls.W * 0.5;
  }

  /**
   * Iaijutsu: nur Schiffe, deren Rumpf die Schnittlinie kreuzt. Die Linie läuft vom Start des Vorstoßes in seine Richtung über die volle
   * Reichweite (34 m) – auch wenn die Figur an Deck schon an der Reling stehen blieb, reißt der Schnitt weiter.
   */
  private iaiShips(c: Cast) {
    const s = c.spec!;
    const keep: EnemyShip[] = [];
    let dx = c.x - c.sx, dz = c.z - c.sz;
    let len = Math.hypot(dx, dz);
    if (len < 3) { dx = Math.sin(c.yaw); dz = Math.cos(c.yaw); len = 1; }
    const k0 = Math.max(len, s.reach) / len;
    dx *= k0; dz *= k0;
    for (const e of this.ships) {
      let near = false;
      for (let k = 0; k <= 12 && !near; k++) { const u = k / 12; near = this.capsuleNear(e, c.sx + dx * u, c.sz + dz * u, s.width * 0.5 + 2); }
      if (near) keep.push(e);
    }
    this.ships.length = 0;
    for (const e of keep) this.ships.push(e);
  }

  // ---------- 4.6C: die neun ausgebauten Ultimates ----------

  /** Klang der Regie an einem Ort (Web-Audio, Signaturen je Ultimate) */
  private sound(name: Sfx, vol: number, x: number, y: number, z: number) { this.host.sound?.(name, vol, x, y, z); }

  /** Startbilder der ausgebauten Ultimates (Einschlag) */
  private beginUlt(c: Cast) {
    const fx = this.host.fx, b = fx.brush, s = c.spec!;
    const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
    switch (c.kind) {
      case 'sevenSeas': {
        // Blitz-Zäsur: ein golden-purpurner Schnitt vom Himmel bis zum Boden, die Länge der Blickrichtung entlang
        const len = s.reach + 14;
        b.reset().at(c.x, c.y - 2, c.z).rot(c.yaw).size(4, 10, 4, len, 34, len).span(0.8).col(WHITE, 2.6).fade(0.02, 0.5);
        fx.emit('arc');
        b.reset().at(c.x, c.y - 3, c.z).rot(c.yaw).size(4, 14, 4, len * 0.97, 48, len * 0.97).span(0.95).col(c.acc, 2.1).fade(0.02, 0.55);
        fx.emit('arc');
        for (let i = 0; i < 12; i++) {
          const d = 5 + (len - 5) * (i / 11), px = c.x + fwdX * d + (rnd() - 0.5) * 6, pz = c.z + fwdZ * d + (rnd() - 0.5) * 6;
          const gy = this.host.groundY(px, pz, c.y);
          // 4.6D: golden-rote Fraktal-Blitze mit Ästen und dunklem Mantel, Einschlag mit Krater bzw. Gischt
          this.vfx.bolt(px + (rnd() - 0.5) * 8, gy + 55, pz + (rnd() - 0.5) * 8, px, gy, pz, i % 2 ? GOLD : CRIMSON, 0.32, 0.45, { depth: 4, branches: 2, jitter: 0.13, impact: i % 3 === 0 ? 2.4 : 0 });
          if (this.host.isLand(px, pz)) this.host.combatFx?.crack(V.set(px, gy + 0.05, pz), 3.2);
        }
        this.sound('thunderClap', 1, c.x + fwdX * 20, c.y, c.z + fwdZ * 20);
        break;
      }
      case 'fistStorm':
        this.sound('fistBarrage', 1, c.x, c.y, c.z);
        break;
      case 'fireDragons': {
        // Sonne über dem Wirbel: purpur-orangefarbener Kern, darunter der Feuerdrachen-Wirbelsturm (Zeitachse)
        b.reset().at(c.x, c.y + 14, c.z).size(0.5, 0.5, 0.5, 4.2, 4.2, 4.2).span(2.7).col(c.acc, 2.4).fade(0.1, 0.3);
        b.flicker = 0.25;
        fx.emit('orb');
        b.reset().at(c.x, c.y + 14, c.z).size(0.5, 0.5, 0.5, 3.2, 3.2, 3.2).span(2.7).col(c.col, 3).fade(0.1, 0.3);
        fx.emit('orb');
        this.sound('fireRoar', 1, c.x, c.y, c.z);
        break;
      }
      case 'glacier': {
        // das Meer und das Schlachtfeld frieren schlagartig ein: Eisscholle über dem Wasser, Raureif an Land
        const wy = this.host.waterY(c.x, c.z);
        b.reset().at(c.x, wy + 0.08, c.z).rot(rnd() * 6).size(2, 1, 2, s.reach * 1.15, 1, s.reach * 1.15).span(CATACLYSM_DUR.glacier + 2.5).col(TMP.setRGB(0.78, 0.92, 1), 1).fade(0.04, 0.25);
        b.ease = 1;
        fx.emit('disc');
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2, r = s.reach * (0.3 + 0.6 * rnd());
          const px = c.x + Math.sin(a) * r, pz = c.z + Math.cos(a) * r;
          if (this.host.isLand(px, pz)) this.host.combatFx?.frost(V.set(px, this.host.groundY(px, pz, c.y) + 0.05, pz), 3 + rnd() * 3);
        }
        // eingefroren im Eis (die Schiffe bleiben für das Aufspießen frei: kein Eintrag in c.hit)
        for (const e of this.ships) if (Math.hypot(e.ship.x - c.x, e.ship.z - c.z) - e.ship.cls.L * 0.5 <= s.reach) e.ship.frozen = Math.max(e.ship.frozen, 4);
        this.sound('iceShatter', 0.7, c.x, c.y, c.z);
        break;
      }
      case 'floodDragon':
        this.sound('tidalRoar', 1, c.x, c.y, c.z);
        break;
      case 'vacuumStorm':
        this.sound('windHowl', 1, c.x, c.y, c.z);
        break;
      case 'thunderJudgment': {
        this.host.lightning?.(c.x + fwdX * 14, c.z + fwdZ * 14);
        this.sound('thunderClap', 1, c.x, c.y + 10, c.z);
        break;
      }
      case 'sunDance': case 'himmelsgericht': {
        // Sonne im Zenit über der Figur, mehrschichtige Korona mit dunklem Hitze-Kontrastring (4.6D: ohne weiße Überstrahlung)
        b.reset().at(c.x, c.y + 16, c.z).size(0.5, 0.5, 0.5, 4.6, 4.6, 4.6).span(2.4).col(c.col, 2.3).fade(0.08, 0.3);
        b.flicker = 0.12;
        fx.emit('orb');
        this.vfx.corona(c.x, c.y + 16, c.z, c.yaw, 6.5, c.col, c.acc, 2.4);
        this.sound('sunChoir', 1, c.x, c.y, c.z);
        break;
      }
      case 'bloodMoon': {
        // 4.6I: der Blutmond steht seit Akt 1 am Himmel (`beginCharge`); hier nur der Klang des Einschlags
        void fwdX; void fwdZ;
        this.sound('moonChime', 1, c.x, c.y, c.z);
        break;
      }
      default: break;
    }
  }

  /** Einschlag-Explosion an Land oder auf See (Kanonen, Fäuste, Eruptionen): Druckring, Glut, Gesteinsbrocken bzw. Gischt */
  private explode(x: number, y: number, z: number, size: number, col: Color, land: boolean, blast = 0) {
    const fx = this.host.fx, b = fx.brush;
    b.reset().at(x, y + 0.8, z).size(0.4, 0.4, 0.4, size * 0.9, size * 0.9, size * 0.9).span(0.3).col(col, 2.6).fade(0.01, 0.7);
    fx.emit('orb');
    this.vfx.surfaceHit(x, y, z, size * 0.8, col, 0.8);
    this.vfx.burst('smoke', x, y + 1, z, 2, 1.2, TMP.setRGB(0.05, 0.045, 0.04), { up: 1.8, size: size * 0.7, life: 1.1 });
    b.reset().at(x, y + 0.15, z).size(0.5, 1, 0.5, size * 2.2, 1, size * 2.2).span(0.5).col(col, 1.8).fade(0.01, 0.6);
    fx.emit('ring');
    if (land) {
      for (let i = 0; i < 4; i++) {
        const a = rnd() * Math.PI * 2, sp = 4 + rnd() * 6;
        b.reset().at(x, y + 0.4, z).vel(Math.sin(a) * sp, 6 + rnd() * 6, Math.cos(a) * sp).spin(rnd() * 8, rnd() * 8).size(0.25 + rnd() * 0.4, 0.25 + rnd() * 0.4, 0.25 + rnd() * 0.4).span(1.2 + rnd() * 0.5).col(WHITE, 1).fade(0.01, 0.3);
        b.grav = 20;
        fx.emit('rock');
      }
      this.host.combatFx?.crack(V.set(x, y + 0.05, z), size * 0.9);
      this.host.combatFx?.burn(V.set(x, y + 0.05, z), size * 0.8);
    } else {
      b.reset().at(x, y, z).rot(rnd() * 6).size(size, 1, 1, size * 1.6, size * 2.6, 1).span(0.8).col(SPRAY, 0.5).fade(0.05, 0.6);
      fx.emit('wall');
    }
    if (blast > 0) this.host.naval?.cataclysmBlast(x, y + 1, z, blast);
  }

  /** Säbel – Souverän-Orkan: Geister-Armada feuert drei Salven konzentriertes Sperrfeuer, Kriegsschiffe kentern oder zerbrechen */
  private stepSevenSeas(c: Cast, t0: number, t: number) {
    const s = c.spec!;
    for (let v = 0; v < 3; v++) {
      // 4.6I: drei Salven dicht hintereinander – die erste im Impact-Frame, die dritte bricht die Kriegsschiffe noch in Akt 3
      const at = 0.001 + v * 0.08;
      if (!(t0 < at && t >= at)) continue;
      const n = this.armadaN;
      for (let i = 0; i < n; i++) {
        const mx = this.armada[i * 3], my = this.armada[i * 3 + 1], mz = this.armada[i * 3 + 2];
        const ship = this.ships.length ? this.ships[(i + v) % this.ships.length] : null;
        let tx: number, tz: number, ty: number;
        if (ship) { tx = ship.ship.x + (rnd() - 0.5) * ship.ship.cls.W; tz = ship.ship.z + (rnd() - 0.5) * ship.ship.cls.L * 0.6; ty = ship.ship.model.deckY; }
        else { const ra = rnd() * Math.PI * 2, rr = rnd() * s.reach * 0.6; tx = c.cx + Math.sin(ra) * rr; tz = c.cz + Math.cos(ra) * rr; ty = this.host.groundY(tx, tz, c.y); }
        const fx = this.host.fx, b = fx.brush;
        b.reset().at(mx, my, mz).size(0.3, 0.3, 0.3, 2.2, 2.2, 2.2).span(0.16).col(WHITE, 3).fade(0.01, 0.7);
        fx.emit('orb');
        // 4.6D: sichtbare Leuchtspur der Geister-Kugel (fast gerade Plasma-Ader mit dunklem Saum), Mündungsfeuer mit Rauch
        this.vfx.bolt(mx, my, mz, tx, ty + 0.5, tz, i % 3 ? GOLD : CRIMSON, 0.22, 0.26, { depth: 2, jitter: 0.015, flicker: 0.15 });
        this.vfx.burst('smoke', mx, my, mz, 2, 1.5, TMP.setRGB(0.06, 0.05, 0.04), { size: 1.4, life: 0.9 });
        this.explode(tx, ty, tz, 2.4, i % 2 ? GOLD : CRIMSON, !ship && this.host.isLand(tx, tz), 160);
        if (ship && ship.ship.sinking <= 0) { ship.ship.punchHoles(1); ship.ship.fire = Math.max(ship.ship.fire, 10); }
      }
      this.sound('ghostVolley', 1, c.cx, c.y, c.cz);
      this.host.shake(0.8);
      // zweite Salve: Masten abgesprengt; letzte: Kriegsschiffe kentern brennend (jedes zweite) oder brechen auseinander
      if (v === 1) for (const e of this.ships) if (e.ship.sinking <= 0) this.wreck(e, 2, 0.4);
      if (v === 2) this.ships.forEach((e, i) => this.shipStrike(c, e, i % 2 ? 'cross' : 'capsize'));
    }
  }

  /** Sturmfaust – Zehntausend-Hiebe-Orkan: eine Kegel-Flut aus hunderten Geister-Fäusten und Überschall-Druckringen */
  private stepFistStorm(c: Cast, t0: number, t: number) {
    const s = c.spec!, f = c.f, fx = this.host.fx, b = fx.brush;
    const L = c.lag > 0 ? c.lag : 1.55;
    if (f && t < L) this.threat(f.x + Math.sin(f.yaw) * 14, f.y + 1.5, f.z + Math.cos(f.yaw) * 14);
    if (f && t < L + 0.12 && c.tick > 0.016) {
      c.tick = 0;
      const fwX = Math.sin(f.yaw), fwZ = Math.cos(f.yaw);
      const n = Math.round(9 * this.detailK);
      for (let i = 0; i < n; i++) {
        // 4.6D: breiterer Kegel (ganze Schiffsverbände)
        const a = f.yaw + (rnd() - 0.5) * 1.7, up = (rnd() - 0.4) * 0.5, sp = 30 + rnd() * 18;
        const sz = 0.55 + rnd() * 1.1;
        const ox = f.x + fwX * 0.8 + (rnd() - 0.5) * 1.6, oy = f.y + 0.7 + rnd() * 1.6, oz = f.z + fwZ * 0.8 + (rnd() - 0.5) * 1.6;
        b.reset().at(ox, oy, oz).rot(a, -up, (rnd() - 0.5) * 0.8).size(sz, sz, sz, sz * 1.25, sz * 1.25, sz * 1.6).vel(Math.sin(a) * sp, up * sp * 0.5, Math.cos(a) * sp).span((s.reach * (0.45 + rnd() * 0.55)) / sp).col(i % 3 ? c.col : c.acc, 2.2).fade(0.02, 0.35);
        b.ease = 0;
        fx.emit('fist');
      }
      // Überschall-Druckringe (senkrecht, mit dunklem Saum) fliegen voraus
      if (rnd() < 0.35) this.vfx.pressureRing(f.x + fwX * 1.5, f.y + 1.2, f.z + fwZ * 1.5, f.yaw, true, 3.6, WHITE, 0.42, fwX * 26, fwZ * 26);
      // Einschläge im Kegel: Lichtkern, Krater bzw. Gischt
      const ia = f.yaw + (rnd() - 0.5) * 1.6, id = 4 + rnd() * s.reach * 1.2;
      const ix = f.x + Math.sin(ia) * id, iz = f.z + Math.cos(ia) * id;
      const iy = this.host.groundY(ix, iz, f.y);
      b.reset().at(ix, iy + 0.8 + rnd(), iz).size(0.3, 0.3, 0.3, 1.4, 1.4, 1.4).span(0.14).col(WHITE, 2.4).fade(0.01, 0.6);
      fx.emit('orb');
      if (rnd() < 0.3) this.vfx.surfaceHit(ix, iy, iz, 1.6, c.col, 0.5);
      // durchlöcherte Schiffe im (breiteren) Kegel: Splitter fliegen, das Schiff wird zurückgehämmert
      for (const e of this.ships) {
        if (e.ship.sinking > 0) continue;
        const dx = e.ship.x - f.x, dz = e.ship.z - f.z, d = Math.hypot(dx, dz);
        if (d > s.reach * 1.9 + e.ship.cls.L * 0.5 || (dx * fwX + dz * fwZ) / Math.max(1, d) < 0.3) continue;
        if (rnd() < 0.25) { e.ship.punchHoles(1); this.vfx.burst('splinter', e.ship.x, e.ship.model.deckY * 0.6, e.ship.z, 4, 7, WHITE, { up: 5, size: 0.35, spread: e.ship.cls.W }); }
        e.ship.shoveX += fwX * 0.35; e.ship.shoveZ += fwZ * 0.35;
      }
    }
    if (t0 < L && t >= L && f) {
      const fwX = Math.sin(f.yaw), fwZ = Math.cos(f.yaw);
      b.reset().at(f.x, f.y - 1, f.z).rot(f.yaw).size(2, 4, 2, s.reach * 1.2, 12, s.reach * 1.2).span(0.6).col(c.col, 2.2).fade(0.02, 0.6);
      fx.emit('arc');
      for (let k = 0; k < 3; k++) {
        b.reset().at(f.x + fwX * 2, f.y + 1.2, f.z + fwZ * 2).rot(f.yaw, Math.PI / 2, 0).size(1, 1, 1, 6 + k * 3, 1, 6 + k * 3).vel(fwX * (18 + k * 8), 0, fwZ * (18 + k * 8)).span(0.6).col(k ? c.acc : WHITE, 1.8).fade(0.02, 0.6);
        fx.emit('ring');
      }
      this.host.combatFx?.shockwave(V.set(f.x + fwX * 6, f.y + 0.1, f.z + fwZ * 6), 12, '#' + c.acc.getHexString());
      this.sound('impactCrack', 1, f.x, f.y, f.z);
      // die Faust-Flut versenkt: Kriegsschiffe bis Stufe 4 gehen durchlöchert unter, die übrigen nehmen schweren Schaden
      for (const e of this.ships) {
        const dx = e.ship.x - f.x, dz = e.ship.z - f.z, d = Math.hypot(dx, dz);
        if (d > s.reach * 1.9 + e.ship.cls.L * 0.5 || (dx * fwX + dz * fwZ) / Math.max(1, d) < 0.3) continue;
        e.ship.punchHoles(4);
        e.ship.shoveX += fwX * 9; e.ship.shoveZ += fwZ * 9;
        this.vfx.burst('splinter', e.ship.x, e.ship.model.deckY, e.ship.z, 16, 10, WHITE, { up: 7, size: 0.4, spread: e.ship.cls.W });
        this.shipStrike(c, e, 'sink');
      }
    }
  }

  /** Feuer – Purpur-Sonneninferno: ein Feuerdrachen-Wirbelsturm fegt über Land und Meer, Lavarisse bleiben zurück, Schiffe brennen */
  private stepFireDragons(c: Cast, t0: number, t: number) {
    const s = c.spec!, fx = this.host.fx, b = fx.brush;
    const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
    const L = c.lag, before = L > 0 && t < L, decisive = L > 0 && t0 < L && t >= L;
    // 4.6I: der Wirbel windet sich schneller voran (Kamera-Schwenk entlang des Drachen in Akt 2)
    const u = Math.min(1, t / 1.5);
    const d = 3 + u * (s.reach + 12);
    const sway = Math.sin(t * 3.4) * 6;
    const wx = c.x + fwdX * d + fwdZ * sway, wz = c.z + fwdZ * d - fwdX * sway;
    const wy = this.host.groundY(wx, wz, c.y);
    if (before) this.threat(wx, wy + 9, wz);
    if (t < 1.7 && c.tick > 0.03) {
      c.tick = 0;
      // Wirbel: aufsteigende Feuerringe, darin die Drachen auf Spiralbahnen
      for (let k = 0; k < 2; k++) {
        const h = rnd() * 26, r = 3 + h * 0.32;
        b.reset().at(wx, wy + h, wz).size(r, 1, r, r * 1.2, 1, r * 1.2).span(0.35).col(k ? c.col : c.acc, 1.9).fade(0.1, 0.6).spin(7 + rnd() * 3);
        b.vy = 6;
        fx.emit('ring');
      }
      for (let k = 0; k < 3; k++) {
        const a = t * 5.5 + (k * Math.PI * 2) / 3, h = 4 + ((t * 9 + k * 7) % 22), r = 3.5 + h * 0.3;
        b.reset().at(wx + Math.sin(a) * r, wy + h, wz + Math.cos(a) * r).size(2.2, 2.2, 2.2, 0.4, 0.4, 0.4).span(0.55).col(k === 1 ? c.acc : c.col, 2.5).fade(0.02, 0.6);
        b.flicker = 0.3;
        fx.emit('orb');
      }
      b.reset().at(wx, wy - 0.2, wz).size(2.4, 30, 2.4, 3.6, 30, 3.6).span(0.12).col(c.col, 1.3).fade(0.3, 0.5);
      fx.emit('column');
      // 4.6D: der sich windende Feuerdrache – geschichtete Flammenbänder um den Wirbel, dahinter dunkler Glut-Rauch, Glut stiebt
      for (let k = 0; k < 2; k++) {
        const h0 = 2 + rnd() * 16;
        b.reset().at(wx, wy + h0, wz).rot(t * 4 + k * Math.PI).spin(5 + k).size(3.5, 3, 3.5, 6.5 + h0 * 0.2, 9, 6.5 + h0 * 0.2).span(0.5).col(k ? c.acc : c.col, 2.2).fade(0.05, 0.5);
        fx.emit('ribbon');
      }
      b.reset().at(wx, wy + 2 + rnd() * 10, wz).rot(t * 4).spin(4).size(4.5, 4, 4.5, 8.5, 12, 8.5).span(0.6).col(TMP.setRGB(0.07, 0.025, 0.015), 1).fade(0.06, 0.5);
      fx.emit('ribbonInk');
      this.vfx.burst('ember', wx, wy + 4, wz, 4, 4, EMBER, { up: 6, spread: 6, size: 0.35 });
      this.vfx.burst('smoke', wx, wy + 12, wz, 1, 2, TMP.setRGB(0.06, 0.03, 0.02), { up: 4, spread: 6, size: 4, life: 1.4 });
      // Spur: glühende Magmarisse an Land, Dampf auf dem Wasser
      if (this.host.isLand(wx, wz)) {
        if (rnd() < 0.35) {
          this.host.combatFx?.crack(V.set(wx, wy + 0.05, wz), 3.4); this.host.combatFx?.burn(V.set(wx, wy + 0.05, wz), 3);
          b.reset().at(wx, wy + 0.05, wz).rot(rnd() * 6).size(1.2, 1, 1.2, 3.2, 1, 3.2).span(3).col(this.ink(EMBER), 1).fade(0.02, 0.3); fx.emit('crater');
          b.reset().at(wx, wy + 0.08, wz).rot(rnd() * 6).size(1, 1, 1, 2.8, 1, 2.8).span(2.5).col(EMBER, 2).fade(0.02, 0.4); fx.emit('shock');
        }
      } else if (rnd() < 0.5) { b.reset().at(wx + (rnd() - 0.5) * 6, wy, wz + (rnd() - 0.5) * 6).rot(rnd() * 6).size(4, 2, 1, 7, 9, 1).span(1).col(SPRAY, 0.35).fade(0.1, 0.6); fx.emit('wall'); }
    }
    // Schiffe am Wirbel (breitere Schneise): lichterloh brennende Deck-Infernos, der Rumpf verkohlt. 4.6I: im Treffermoment trifft die
    // Feuerwalze die ganze Schneise zugleich (verkohlte Rümpfe, Lavarisse), danach brennt der Wirbel weiter, was er erreicht
    const burn = (e: EnemyShip) => {
      c.hit.push(e);
      e.ship.fire = Math.max(e.ship.fire, 14);
      this.wreck(e, 0, 0.85);
      this.shipDamage(c, e, 1.1);
    };
    if (decisive) {
      const len = s.reach + 14;
      for (const e of this.ships) {
        if (c.hit.includes(e) || e.ship.sinking > 0) continue;
        const dx = e.ship.x - c.x, dz = e.ship.z - c.z;
        const along = dx * fwdX + dz * fwdZ, across = Math.abs(dx * fwdZ - dz * fwdX);
        if (along < -e.ship.cls.L * 0.5 || along > len + e.ship.cls.L * 0.5 || across > s.width * 0.95 + e.ship.cls.L * 0.5) continue;
        burn(e);
      }
      // Lavarisse entlang der Schneise (an Land), Dampfwände auf dem Wasser
      for (let i = 1; i <= 8; i++) {
        const dd = (len * i) / 8, lx = c.x + fwdX * dd, lz = c.z + fwdZ * dd, ly = this.host.groundY(lx, lz, c.y);
        if (this.host.isLand(lx, lz)) {
          this.host.combatFx?.crack(V.set(lx, ly + 0.05, lz), 3.6); this.host.combatFx?.burn(V.set(lx, ly + 0.05, lz), 3.2);
          b.reset().at(lx, ly + 0.06, lz).rot(c.yaw).size(1.2, 1, 3, 2.4, 1, 6).span(2.4).col(EMBER, 2).fade(0.02, 0.4); fx.emit('shock');
        } else { b.reset().at(lx, ly, lz).rot(c.yaw + Math.PI / 2).size(4, 2, 1, 8, 9, 1).span(1).col(SPRAY, 0.4).fade(0.1, 0.6); fx.emit('wall'); }
      }
    }
    for (const e of this.ships) {
      if (c.hit.includes(e) || e.ship.sinking > 0) continue;
      if (Math.hypot(e.ship.x - wx, e.ship.z - wz) - e.ship.cls.L * 0.5 > s.width * 0.95) continue;
      if (before) { this.mark(c, e); e.ship.fire = Math.max(e.ship.fire, 6); } else burn(e);
    }
    if (t0 < 0.15 && t >= 0.15) { b.reset().at(c.x, c.y + 0.1, c.z).size(2, 1, 2, s.reach, 1, s.reach).span(1.2).col(c.col, 2).fade(0.05, 0.6); fx.emit('ring'); }
  }

  /** Eis – Ewiger Gletscher-Kataklysmus: riesige Gletscher-Säulen schießen aus Boden und Wasser und zerspringen im Impact-Frame */
  private stepGlacier(c: Cast, t0: number, t: number) {
    const s = c.spec!, fx = this.host.fx, b = fx.brush;
    const rings = 6;
    while (c.step < rings && t >= c.step * 0.08) {
      const r = 4 + (c.step / (rings - 1)) * (s.reach + 6 - 4);
      const n = Math.round((7 + r * 0.7) * this.detailK);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
        const px = c.x + Math.sin(a) * r, pz = c.z + Math.cos(a) * r;
        const gy = this.host.groundY(px, pz, c.y);
        const big = rnd() < 0.3;
        const h = big ? 8 + rnd() * 8 : 2.5 + rnd() * 5;
        const w = big ? 2.2 + rnd() * 1.8 : 0.9 + rnd() * 1.2;
        b.reset().at(px, gy - 0.6, pz).rot(rnd() * 6, (rnd() - 0.5) * 0.45, (rnd() - 0.5) * 0.45).size(w * 0.3, 0.1, w * 0.3, w, h, w).span(1.25 - c.step * 0.03).col(i % 3 ? FROST : c.acc, 1.5).fade(0.03, 0.08);
        b.ease = 1;
        fx.emit('shard');
      }
      c.step++;
    }
    const L = c.lag > 0 ? c.lag : 1.2;
    // 4.6D: unter jedem Kriegsschiff brechen riesige Gletschersäulen hervor, spießen es auf und heben es an (4.6I: früh in Akt 2, gesehen aus
    // der tiefen Untersicht); zerbersten lässt sie erst der Treffermoment
    if (t < L && this.ships.length) { const e0 = this.ships[0]; this.threat(e0.ship.x, this.host.waterY(e0.ship.x, e0.ship.z) + 6, e0.ship.z); }
    else if (t < L) this.threat(c.x + Math.sin(c.yaw) * 12, c.y + 5, c.z + Math.cos(c.yaw) * 12);
    if (t0 < 0.1 && t >= 0.1) {
      for (const e of this.ships) {
        if (e.ship.sinking > 0) continue;
        const sx = e.ship.x, sz = e.ship.z, wy = this.host.waterY(sx, sz);
        for (let i = 0; i < 5; i++) {
          const a = rnd() * Math.PI * 2, r = rnd() * e.ship.cls.W * 0.6, h = 9 + rnd() * 7, w = 1.6 + rnd() * 1.6;
          b.reset().at(sx + Math.sin(a) * r, wy - 2, sz + Math.cos(a) * r).rot(rnd() * 6, (rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.35).size(w * 0.3, 0.2, w * 0.3, w, h, w).span(Math.max(0.45, L - 0.1 + 0.3)).col(i % 2 ? FROST : c.acc, 1.6).fade(0.03, 0.1);
          b.ease = 1;
          fx.emit('shard');
        }
        this.vfx.burst('ice', sx, wy + 1, sz, 14, 7, ICE, { up: 7, spread: e.ship.cls.W, size: 0.45 });
        this.vfx.surfaceHit(sx, wy, sz, e.ship.cls.W, FROST, 1.2);
        e.ship.frozen = Math.max(e.ship.frozen, 4);
        this.mark(c, e);
      }
    }
    if (t0 < L && t >= L) {
      // Zerspringen im Treffermoment (die Kino-Regie zeigt den Doppel-Impact-Frame): die angehobenen Schiffe brechen, Splitterwolke, Druckring
      if (c.lag <= 0) this.host.impactFrames?.(3);
      for (const e of c.marked) this.shipStrike(c, e, 'cross', 5.5);
      this.vfx.burst('ice', c.x, c.y + 3, c.z, 60, 12, ICE, { up: 6, spread: s.reach, size: 0.5 });
      const n = Math.round(110 * this.detailK);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = rnd() * (s.reach + 4);
        b.reset().at(c.x + Math.sin(a) * r, c.y + 0.5 + rnd() * 9, c.z + Math.cos(a) * r).vel(Math.sin(a) * (5 + rnd() * 10), 3 + rnd() * 10, Math.cos(a) * (5 + rnd() * 10)).spin(rnd() * 10, rnd() * 10).size(0.5, 1.1, 0.5, 0.15, 0.35, 0.15).span(1 + rnd() * 0.6).col(i % 4 ? FROST : WHITE, 2).fade(0.01, 0.4);
        b.grav = 16;
        fx.emit('shard');
      }
      b.reset().at(c.x, c.y + 0.1, c.z).size(3, 1, 3, (s.reach + 4) * 1.15, 1, (s.reach + 4) * 1.15).span(0.8).col(WHITE, 2.2).fade(0.02, 0.7);
      fx.emit('ring');
      this.sound('iceShatter', 1, c.x, c.y, c.z);
      this.host.shake(1.1);
      for (const e of this.ships) if (!c.hit.includes(e)) this.shipDamage(c, e, 0.8);
      this.areaShips(c, c.x, c.z, s.reach + 6, 0.9, 'freeze');
    }
  }

  /** Wasser – Tiefsee-Sintflutdrache: eine türmende Flutwelle in Drachenform rollt über Inseln und Meer, Schiffe steigen und kentern */
  private stepFloodDragon(c: Cast, t0: number, t: number) {
    const s = c.spec!, fx = this.host.fx, b = fx.brush;
    const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
    // 4.6I: in Akt 2 türmt sich die Drachenwelle vor der Figur auf (6 m voraus), im Treffermoment schlägt sie vorwärts über die Schiffe
    const L = c.lag > 0 ? c.lag : 0;
    const rise = L > 0 ? smooth(t / L) : 1;
    const d = t < L ? 6 : 6 + Math.min(s.reach + 2, (t - L) * 95);
    if (t0 === 0 && t > 0) {
      // die Welle selbst: drei Schichten einer gebogenen Wasserwand, die sich aufbäumt
      // 4.6J: leiser (0,7 statt 1,4 bzw. 0,4 statt 0,9): die drei additiven Schichten deckten die Untersicht in Akt 2 weiß zu
      for (let k = 0; k < 3; k++) {
        b.reset().at(c.x + fwdX * 4, c.y - 1.5 + k * 0.4, c.z + fwdZ * 4).rot(c.yaw).size(4, 2, 4, s.width * 0.55 + k * 2, 13 - k * 3, s.width * 0.55 + k * 2).span(Math.max(0.2, L + 0.06)).col(k === 1 ? WHITE : c.col, k === 1 ? 0.4 : 0.7).fade(0.08, 0.2);
        b.ease = 0;
        fx.emit('arc');
      }
      // 4.6I: dunkler Tiefsee-Mantel hinter den leuchtenden Schichten (3-Schicht-Regel): vor dem hellen Taghimmel blieb die Wand sonst unsichtbar
      for (let k = 0; k < 2; k++) {
        b.reset().at(c.x + fwdX * 4.5, c.y - 1.7, c.z + fwdZ * 4.5).rot(c.yaw).size(4.2, 2, 4.2, s.width * 0.57 + k * 2.5, 12.5 - k * 3, s.width * 0.57 + k * 2.5).span(Math.max(0.2, L + 0.06)).col(this.ink(c.col), 1 - k * 0.15).fade(0.08, 0.2);
        b.ease = 0;
        fx.emit('arcInk');
      }
    }
    if (L > 0 && t0 < L && t >= L) {
      // Brandung: die Wand stürzt vorwärts über die Schiffe
      const sp = 95;
      for (let k = 0; k < 3; k++) {
        b.reset().at(c.x + fwdX * 5, c.y - 1.5 + k * 0.4, c.z + fwdZ * 5).rot(c.yaw).size(s.width * 0.55 + k * 2, 13 - k * 3, s.width * 0.55 + k * 2, s.width * 0.62 + k * 2, 8 - k * 2, s.width * 0.62 + k * 2).vel(fwdX * sp, 0, fwdZ * sp).span((s.reach + 4) / sp + 0.15).col(k === 1 ? WHITE : c.col, k === 1 ? 0.9 : 1.4).fade(0.02, 0.35);
        b.ease = 1;
        fx.emit('arc');
      }
      for (let k = 0; k < 2; k++) {
        b.reset().at(c.x + fwdX * 5.5, c.y - 1.7, c.z + fwdZ * 5.5).rot(c.yaw).size(s.width * 0.57 + k * 2.5, 12.5 - k * 3, s.width * 0.57 + k * 2.5, s.width * 0.64 + k * 2.5, 7.5 - k * 2, s.width * 0.64 + k * 2.5).vel(fwdX * sp, 0, fwdZ * sp).span((s.reach + 4) / sp + 0.15).col(this.ink(c.col), 0.9 - k * 0.3).fade(0.02, 0.35);
        b.ease = 1;
        fx.emit('arcInk');
      }
      // alle Schiffe in der Bahn werden gehoben und kentern zugleich
      for (const e of this.ships) {
        if (c.hit.includes(e) || e.ship.sinking > 0) continue;
        const dx = e.ship.x - c.x, dz = e.ship.z - c.z;
        const along = dx * fwdX + dz * fwdZ, across = Math.abs(dx * fwdZ - dz * fwdX);
        if (along > s.reach + 8 || along < -e.ship.cls.L || across > s.width * 0.6 + e.ship.cls.L * 0.5) continue;
        this.mark(c, e);
      }
    }
    if (t < 1.3 && c.tick > 0.024) {
      c.tick = 0;
      // Drachenkopf auf dem Wellenkamm: Wasserkugeln als Leib, zwei Hörner, Gischt an den Flanken
      const sw = Math.sin(t * 8) * 3.5;
      const hx = c.x + fwdX * d + fwdZ * sw, hz = c.z + fwdZ * d - fwdX * sw, hy = c.y + 2 + 7 * rise + Math.sin(t * 6) * 1.5;
      if (t < L) this.threat(hx, hy, hz);
      // 4.6J: in Akt 2 deutlich gedämpfter Drachenkopf (die übereinanderliegenden Kugeln wurden zu einer weißen Scheibe); jedes zweite Mal
      // ein dunkler Tiefsee-Wirbel statt des weißen Kerns – Kopf und Leib bekommen so eine lesbare Silhouette
      const dim = t < L ? 0.5 : 1;
      b.reset().at(hx, hy, hz).size(2.8, 2.8, 2.8, 0.8, 0.8, 0.8).span(0.8).col(c.col, 1.8 * dim).fade(0.02, 0.7);
      fx.emit('orb');
      c.step++;
      if (t >= L || (c.step & 1) === 0) {
        b.reset().at(hx, hy, hz).size(1.4, 1.4, 1.4, 0.4, 0.4, 0.4).span(0.5).col(WHITE, 1.6 * dim).fade(0.02, 0.7);
        fx.emit('orb');
      } else {
        b.reset().at(hx - fwdX * 0.6, hy - 0.4, hz - fwdZ * 0.6).rot(c.yaw + t * 3).spin(5).size(2.2, 3.2, 2.2, 2.6, 4, 2.6).span(0.45).col(TMP.setRGB(0.005, 0.03, 0.08), 1).fade(0.04, 0.5);
        fx.emit('ribbonInk');
      }
      if (rnd() < 0.3) for (const side of [-1, 1]) { b.reset().at(hx + fwdZ * side * 1.4, hy + 1.6, hz - fwdX * side * 1.4).rot(c.yaw, -0.6, side * 0.4).size(0.6, 2.6, 0.6).span(0.25).col(WHITE, 1.4).fade(0.02, 0.6); fx.emit('shard'); }
      // 4.6D: Drachenleib aus gewundenen Wasserbändern hinter dem Kopf, schäumende Gischtkrone auf dem Kamm, Tropfenschauer
      b.reset().at(hx - fwdX * 4, hy - 7, hz - fwdZ * 4).rot(c.yaw + t * 3).spin(4).size(2.5, 5, 2.5, 4.5, 9, 4.5).span(0.55).col(c.col, 1.9 * (t < L ? 0.6 : 1)).fade(0.05, 0.5);
      fx.emit('ribbon');
      b.reset().at(hx - fwdX * 4.5, hy - 7.5, hz - fwdZ * 4.5).rot(c.yaw + t * 3).spin(4).size(3, 5, 3, 5.4, 10, 5.4).span(0.6).col(TMP.setRGB(0.01, 0.04, 0.1), 1).fade(0.05, 0.5);
      fx.emit('ribbonInk');
      b.reset().at(c.x + fwdX * d, this.host.waterY(c.x + fwdX * d, c.z + fwdZ * d), c.z + fwdZ * d).rot(rnd() * 6).size(3, 2, 3, s.width * 0.4, 6, s.width * 0.4).span(0.6).col(SPRAY, 1).fade(0.04, 0.5);
      fx.emit('splash');
      this.vfx.burst('drop', hx, hy, hz, 6, 6, SPRAY, { up: 3, spread: 4, size: 0.3 });
      for (const side of [-1, 1]) {
        const wx = c.x + fwdX * d + fwdZ * side * s.width * 0.4, wz = c.z + fwdZ * d - fwdX * side * s.width * 0.4;
        b.reset().at(wx, this.host.waterY(wx, wz) - 0.5, wz).rot(c.yaw + Math.PI / 2).size(6, 2, 1, 10, 9 + rnd() * 5, 1).span(0.9).col(SPRAY, 0.5).fade(0.05, 0.6);
        fx.emit('wall');
      }
    }
    // Schiffe, die die Welle erreicht: gehoben und gekentert (Kriegsschiffe bis Stufe 4), sonst schwer getroffen und fortgeschoben
    for (const e of this.ships) {
      if (c.hit.includes(e) || e.ship.sinking > 0 || t < L) continue;
      const dx = e.ship.x - c.x, dz = e.ship.z - c.z;
      const along = dx * fwdX + dz * fwdZ, across = Math.abs(dx * fwdZ - dz * fwdX);
      if (!c.marked.includes(e) && (along > d || along < -e.ship.cls.L || across > s.width * 0.6 + e.ship.cls.L * 0.5)) continue;
      e.ship.shoveX += fwdX * 7; e.ship.shoveZ += fwdZ * 7;
      this.shipStrike(c, e, 'capsize', 4.5);
      // auf den Wellenkamm gehoben, kieloben gerollt, unter Wasserfontänen begraben
      const wy = this.host.waterY(e.ship.x, e.ship.z);
      for (let k = 0; k < 3; k++) { b.reset().at(e.ship.x + (rnd() - 0.5) * e.ship.cls.W, wy, e.ship.z + (rnd() - 0.5) * e.ship.cls.L * 0.6).rot(rnd() * 6).size(2, 3, 2, 4.5, 11 + rnd() * 5, 4.5).span(1.1, k * 0.12).col(SPRAY, 1).fade(0.03, 0.5); fx.emit('splash'); }
      this.vfx.burst('drop', e.ship.x, wy + 2, e.ship.z, 22, 7, SPRAY, { up: 9, spread: e.ship.cls.W, size: 0.35 });
    }
  }

  /** Wind – Vakuum-Himmelssturm: ein monumentaler Tornado mit Dutzenden Vakuum-Sicheln reißt alles hoch und zerschneidet es */
  private stepVacuumStorm(c: Cast, t0: number, t: number) {
    const s = c.spec!, fx = this.host.fx, b = fx.brush;
    // 4.6D: gewaltiger dunkel-smaragdgrüner Trichter (Mantel, Kern, gewundene Bänder)
    if (t0 === 0 && t > 0) this.vfx.funnel(c.x, c.y - 1, c.z, 46, s.reach * 0.8, c.acc, TMP.setRGB(0.01, 0.07, 0.05), CATACLYSM_DUR.vacuumStorm - 0.2);
    const L = c.lag > 0 ? c.lag : 1.9;
    if (t < L) this.threat(c.x, c.y + 14, c.z);
    if (t < CATACLYSM_DUR.vacuumStorm - 0.3 && c.tick > 0.028) {
      c.tick = 0;
      const k = 1 - Math.min(1, t / 2.6) * 0.5;
      for (let i = 0; i < 3; i++) {
        const h = rnd() * 42;
        const r = (3 + h * 0.55) * k;
        b.reset().at(c.x, c.y + h, c.z).size(r, 1, r, r * 0.8, 1, r * 0.8).span(0.45).col(i ? c.col : c.acc, 1.3).fade(0.1, 0.6).spin(11 + rnd() * 4);
        b.vy = 7;
        fx.emit('ring');
      }
      // Vakuum-Sicheln auf Umlaufbahnen in allen Höhen, nach außen schleudernd
      const n = Math.round(4 * this.detailK);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = 3 + rnd() * s.reach, h = 0.5 + rnd() * 18, sz = 1.2 + rnd() * 3.2;
        const ta = a + Math.PI / 2, sp = 14 + rnd() * 10;
        const px = c.x + Math.sin(a) * r, py = c.y + h, pz = c.z + Math.cos(a) * r, rl = (rnd() - 0.5) * 1.6, life = 0.4 + rnd() * 0.3;
        const vx = Math.sin(ta) * sp + Math.sin(a) * 4, vz = Math.cos(ta) * sp + Math.cos(a) * 4, vy = 3 + rnd() * 5;
        this.vfx.slash(px, py, pz, ta, 0, rl, sz, i % 2 ? WHITE : c.acc, TMP.setRGB(0.01, 0.07, 0.05), { life, vx, vy, vz, spin: 12, sparks: 1 });
      }
      // Trümmer und Gischt werden emporgerissen
      this.host.debris?.pull(c.x, c.y + 10, c.z, s.reach + 10, 0.6);
      if (rnd() < 0.4) { const a = rnd() * 6.28, r = rnd() * s.reach; const px = c.x + Math.sin(a) * r, pz = c.z + Math.cos(a) * r; b.reset().at(px, this.host.waterY(px, pz), pz).rot(a).size(3, 2, 1, 5, 14, 1).span(0.8).col(SPRAY, 0.35).fade(0.1, 0.6); b.vy = 6; fx.emit('wall'); }
    }
    // Schiffe im Sog des Tornados werden herangezogen (4.6I: in Akt 2 stark) und im Treffermoment zerschnitten und weggeschleudert
    const nav = this.host.naval;
    if (nav && t < L + 0.1) for (const e of this.ships) if (!c.hit.includes(e) && e.ship.sinking <= 0) nav.cataclysmPull(e, c.x, c.z, (t < L ? 14 : 4) * (t - t0));
    if (t0 < L && t >= L) {
      const n = Math.round(30 * this.detailK);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        b.reset().at(c.x, c.y + 1 + rnd() * 6, c.z).rot(a, 0, (rnd() - 0.5)).size(2, 1, 2, 5, 1, 5).vel(Math.sin(a) * 34, 0, Math.cos(a) * 34).span(0.8).col(WHITE, 2.2).fade(0.02, 0.5);
        fx.emit('blade');
      }
      this.host.shake(1);
      for (const e of this.ships) {
        if (Math.hypot(e.ship.x - c.x, e.ship.z - c.z) - e.ship.cls.L * 0.5 > s.reach + 14) continue;
        // hochgerissen, zerfetzt und nach außen geschleudert
        const dx = e.ship.x - c.x, dz = e.ship.z - c.z, d = Math.hypot(dx, dz) || 1;
        e.ship.shoveX += (dx / d) * 10; e.ship.shoveZ += (dz / d) * 10;
        this.vfx.burst('splinter', e.ship.x, e.ship.model.deckY + 3, e.ship.z, 12, 12, WHITE, { up: 9, size: 0.4, spread: e.ship.cls.W });
        this.shipStrike(c, e, 'cross', 6.5, 3);
      }
    }
  }

  /** Blitz – Donnergott-Urteil: aus der Gewitterwolke fährt eine kolossale Himmel-zu-Erde-Blitzsäule, Kettenblitze springen auf Gegner und Schiffe */
  private stepThunder(c: Cast, t0: number, t: number) {
    const s = c.spec!, fx = this.host.fx, b = fx.brush;
    const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
    const px = c.x + fwdX * 14, pz = c.z + fwdZ * 14;
    const gy = this.host.groundY(px, pz, c.y);
    if (t0 === 0 && t > 0) {
      // die Säule: weißglühender Kern, blauer Mantel, Druckringe am Boden – schlägt breit ein und zieht sich zum gleißenden Strahl zusammen
      // (früher wuchs sie bis zum Ende und überstrahlte das Bild über eine Sekunde lang)
      b.reset().at(px, gy - 0.5, pz).size(7, 90, 7, 1.4, 90, 1.4).span(1.05).col(WHITE, 2.2).fade(0.02, 0.45);
      b.flicker = 0.35;
      fx.emit('column');
      b.reset().at(px, gy - 0.5, pz).size(12, 90, 12, 3, 90, 3).span(1.15).col(c.acc, 0.95).fade(0.02, 0.45);
      b.flicker = 0.25;
      fx.emit('column');
      for (let k = 0; k < 3; k++) { b.reset().at(px, gy + 0.2, pz).size(2, 1, 2, 14 + k * 9, 1, 14 + k * 9).span(0.6 + k * 0.2).col(k ? c.acc : WHITE, 2).fade(0.02, 0.6); fx.emit('ring'); }
      this.explode(px, gy, pz, 4, WHITE, this.host.isLand(px, pz), 220);
      // 4.6D: der Hauptblitz – 32 gezackte Glieder aus der Wolke bis zum Boden, zwölf verästelte Nebenblitze, dunkler Plasmamantel
      this.vfx.bolt(px + (rnd() - 0.5) * 4, c.y + 20, pz + (rnd() - 0.5) * 4, px, gy + 0.2, pz, WHITE, 0.75, 1.0, { depth: 5, branches: 12, jitter: 0.1, impact: 6, flicker: 0.25 });
      this.vfx.bolt(px, c.y + 20, pz, px, gy + 0.2, pz, c.acc, 1.3, 0.9, { depth: 4, branches: 4, jitter: 0.09, flicker: 0.3 });
      // konzentrische Plasma-Gischtringe über das Meer (an Land: Runen-Schockwellen)
      for (let k = 0; k < 3; k++) {
        b.reset().at(px, gy + 0.1, pz).rot(rnd() * 6).size(4, 1, 4, 22 + k * 16, 1, 22 + k * 16).span(0.9 + k * 0.2, k * 0.12).col(k % 2 ? c.acc : WHITE, 1.05 - k * 0.2).fade(0.02, 0.6);
        fx.emit('shock');
        if (!this.host.isLand(px, pz)) { b.reset().at(px, gy + 0.06, pz).rot(rnd() * 6).size(5, 1, 5, 24 + k * 16, 1, 24 + k * 16).span(1.2 + k * 0.2, k * 0.12).col(SPRAY, 1).fade(0.02, 0.5); fx.emit('foam'); }
      }
    }
    if (t < 1.6 && c.tick > 0.05) {
      c.tick = 0;
      // Blitze rund um die Säule aus der Wolke
      for (let i = 0; i < 2; i++) {
        const a = rnd() * Math.PI * 2, r = 4 + rnd() * s.reach;
        const bx = px + Math.sin(a) * r, bz = pz + Math.cos(a) * r;
        const by = this.host.groundY(bx, bz, c.y);
        this.boltBetween(bx + (rnd() - 0.5) * 6, c.y + 20, bz + (rnd() - 0.5) * 6, bx, by, bz, i ? c.col : WHITE, 8, 0.25, 0.3);
      }
    }
    // drei Wellen: Kettenblitze von der Säule auf alle Schiffe, eins zum nächsten (4.6I: die erste im Impact-Frame – Masten gesprengt –,
    // die dritte versenkt sie noch in Akt 3)
    for (let v = 0; v < 3; v++) {
      const at = 0.001 + v * 0.08;
      if (!(t0 < at && t >= at)) continue;
      let lx = px, ly = gy + 6, lz = pz;
      for (const e of this.ships) {
        if (e.ship.sinking > 0) continue;
        const ex = e.ship.x, ey = e.ship.model.deckY + 4, ez = e.ship.z;
        this.boltBetween(lx, ly, lz, ex, ey, ez, v % 2 ? c.acc : WHITE, 6, 0.3, 0.4);
        this.vfx.bolt(ex + (rnd() - 0.5) * 4, c.y + 20, ez + (rnd() - 0.5) * 4, ex, ey - 3, ez, c.col, 0.3, 0.32, { depth: 4, branches: 2, jitter: 0.12, impact: 3 });
        lx = ex; ly = ey; lz = ez;
        e.ship.fire = Math.max(e.ship.fire, 8);
        // erste Welle sprengt die Masten, jede weitere verkohlt den Rumpf tiefer
        if (v === 0) this.wreck(e, 3, 0.45); else this.wreck(e, 0, 0.45 + v * 0.25);
        if (v === 2) this.shipStrike(c, e, 'sink'); else if (!c.hit.includes(e)) this.shipDamage(c, e, 0.35);
      }
      this.host.lightning?.(px + (rnd() - 0.5) * 30, pz + (rnd() - 0.5) * 30);
      this.sound('thunderClap', 0.9, px, gy, pz);
      this.host.shake(0.9);
    }
  }

  /** Sonne – Zenit-Sonnentanz: ein greller, rotierender Sonnen-Feuerring um die Figur, eine riesige Licht-Schneise brennt durch das Schlachtfeld */
  private stepSunDance(c: Cast, t0: number, t: number) {
    const s = c.spec!, f = c.f, fx = this.host.fx, b = fx.brush;
    const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
    const ox = f ? f.x : c.x, oy = f ? f.y : c.y, oz = f ? f.z : c.z;
    const L = c.lag > 0 ? c.lag : 0.35;
    if (t < L) this.threat(ox, oy + 1.2, oz);
    if (t < 1.5 && c.tick > 0.04) {
      c.tick = 0;
      // Feuerring: drei Bahnen in Hüfthöhe, dazu Flammenkugeln auf dem Ring
      for (let k = 0; k < 2; k++) {
        const r = 6 + k * 2.5;
        b.reset().at(ox, oy + 1 + k * 0.6, oz).rot(t * 4 * (k ? -1 : 1)).size(r, 1, r, r * 1.05, 1, r * 1.05).span(0.12).col(k ? c.acc : c.col, 2.6).fade(0.2, 0.4);
        fx.emit('ring');
      }
      for (let k = 0; k < 4; k++) {
        const a = t * 6 + (k * Math.PI) / 2, r = 7;
        b.reset().at(ox + Math.sin(a) * r, oy + 1.2, oz + Math.cos(a) * r).size(1.4, 1.4, 1.4, 0.3, 0.3, 0.3).span(0.4).col(c.acc, 2.6).fade(0.02, 0.6);
        b.flicker = 0.3;
        fx.emit('orb');
      }
    }
    if (t0 < L && t >= L) {
      // Licht-Schneise (Treffermoment): ein liegender Lichtstrahl durch das Schlachtfeld, verbrannte Erde und Dampf entlang
      const len = s.reach + 34;
      b.reset().at(ox + fwdX * 2, oy + 1.2, oz + fwdZ * 2).rot(c.yaw, Math.PI / 2, 0).size(1, len, 1, 3.4, len, 3.4).span(1.4).col(c.col, 2.1).fade(0.02, 0.5);
      b.ease = 0;
      fx.emit('column');
      // dunkler Hitze-Saum entlang der Schneise (Kontrast statt Weiß), Glut regnet
      b.reset().at(ox + fwdX * 2, oy + 0.15, oz + fwdZ * 2).rot(c.yaw).size(4, 1, len * 0.5, 9, 1, len * 0.5).span(1.6).col(this.ink(c.acc), 1).fade(0.02, 0.4);
      b.ease = 0;
      fx.emit('crater');
      for (let i = 0; i < 6; i++) { const d = rnd() * len; this.vfx.burst('ember', ox + fwdX * d, oy + 1, oz + fwdZ * d, 4, 3, c.acc, { up: 4, spread: 4, size: 0.3 }); }
      b.reset().at(ox + fwdX * 2, oy + 1.2, oz + fwdZ * 2).rot(c.yaw, Math.PI / 2, 0).size(3, len, 3, 6, len, 6).span(1.5).col(c.col, 1.6).fade(0.02, 0.5);
      fx.emit('column');
      for (let i = 1; i <= 10; i++) {
        const d = (len * i) / 10, sx = ox + fwdX * d, sz = oz + fwdZ * d;
        const sy = this.host.groundY(sx, sz, oy);
        if (this.host.isLand(sx, sz)) this.host.combatFx?.burn(V.set(sx, sy + 0.05, sz), 3.6);
        else { b.reset().at(sx, sy, sz).rot(c.yaw + Math.PI / 2).size(4, 2, 1, 8, 10, 1).span(1.1).col(SPRAY, 0.4).fade(0.1, 0.6); fx.emit('wall'); }
      }
      this.sound('impactCrack', 0.8, ox, oy, oz);
      // Schiffe in der Schneise: brennen und gehen unter (bis Stufe 4), sonst schwerer Schaden
      for (const e of this.ships) {
        const dx = e.ship.x - ox, dz = e.ship.z - oz;
        const along = dx * fwdX + dz * fwdZ, across = Math.abs(dx * fwdZ - dz * fwdX);
        if (along < -e.ship.cls.L * 0.5 || along > len + e.ship.cls.L * 0.5 || across > 6 + e.ship.cls.W) continue;
        e.ship.fire = Math.max(e.ship.fire, 14);
        // Rüstung geschmolzen: glühendes Wrack
        this.wreck(e, 1, 0.9, 1);
        this.shipStrike(c, e, 'sink');
      }
    }
    if (t0 < 1.2 && t >= 1.2) {
      b.reset().at(ox, oy - 0.2, oz).size(2, 80, 2, 7, 80, 7).span(0.6).col(c.col, 2.1).fade(0.02, 0.6);
      fx.emit('column');
      b.reset().at(ox, oy + 0.1, oz).size(3, 1, 3, s.reach * 1.3, 1, s.reach * 1.3).span(0.7).col(c.col, 2.2).fade(0.02, 0.7);
      fx.emit('ring');
      this.areaShips(c, ox, oz, s.reach, 1.1, 'fire');
    }
  }

  /** Mond – Blutmond-Finsternis: verdunkelter Himmel, ein Sturm aus hunderten rot-violetten Mondsicheln in allen Größen */
  private stepBloodMoon(c: Cast, t0: number, t: number) {
    const s = c.spec!, f = c.f, fx = this.host.fx, b = fx.brush;
    const ox = f ? f.x : c.x, oy = f ? f.y : c.y, oz = f ? f.z : c.z;
    const L = c.lag > 0 ? c.lag : 1.8;
    const fwX = Math.sin(c.yaw), fwZ = Math.cos(c.yaw);
    if (t < L) this.threat(ox + fwX * 10, oy + 8, oz + fwZ * 10);
    // 4.6I: in Akt 2 regnet ein Sichel-Sturm mit dunklen Tusche-Schweifen vom Himmel auf das Schlachtfeld
    if (t < L + 0.05 && c.tick > 0.016) {
      const n = Math.round(3 * this.detailK);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = rnd() * (s.reach + 14);
        const px = ox + fwX * 8 + Math.sin(a) * r, pz = oz + fwZ * 8 + Math.cos(a) * r, py = oy + 26 + rnd() * 10;
        const sp = 55 + rnd() * 20, sz = 1.4 + rnd() * rnd() * 5;
        this.vfx.slash(px, py, pz, a, -1.3, (rnd() - 0.5) * 0.8, sz, rnd() < 0.5 ? c.col : CRIMSON, TMP.setRGB(0.04, 0.0, 0.015), { life: (py - oy) / sp, vy: -sp, vx: (rnd() - 0.5) * 6, vz: (rnd() - 0.5) * 6, sparks: 0 });
      }
    }
    if (t < 1.3 && c.tick > 0.016) {
      c.tick = 0;
      const n = Math.round(6 * this.detailK);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const sz = 1.2 + rnd() * rnd() * 9;
        const sp = 18 + rnd() * 22;
        // 4.6D: rasiermesserscharfe Tusche-Mondsichel – schwarzer Schattenschweif hinter karmesinrotem Kern
        this.vfx.slash(ox, oy + 0.6 + rnd() * 3.5, oz, a, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 1.6, sz, i % 2 ? c.col : CRIMSON, TMP.setRGB(0.04, 0.0, 0.015),
          { life: (s.reach + 10) / sp, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: (rnd() - 0.3) * 4, sparks: 0 });
      }
    }
    for (let v = 0; v < 2; v++) {
      // 4.6I: erste Welle durchlöchert in Akt 2, die zweite viertelt die Schiffe im Treffermoment
      const at = v === 0 ? Math.min(0.12, L * 0.4) : L;
      if (!(t0 < at && t >= at)) continue;
      b.reset().at(ox, oy + 0.2, oz).size(2, 1, 2, s.reach + 14, 1, s.reach + 14).span(0.8).col(c.col, 2).fade(0.02, 0.7);
      fx.emit('ring');
      for (const e of this.ships) {
        if (Math.hypot(e.ship.x - ox, e.ship.z - oz) - e.ship.cls.L * 0.5 > s.reach + 30) continue;
        e.ship.punchHoles(2);
        // in mehrere treibende Teile zerschnitten
        if (v === 1) this.shipStrike(c, e, 'cross', 0, 4); else if (!c.hit.includes(e)) this.shipDamage(c, e, 0.3);
      }
      this.host.shake(0.8);
    }
  }

  /** Vor dem Einschlag (Spielzeit zwischen Zwischensequenz und Einschlag): Säbel-Blitze beim Sprung, Aufstieg in die Gewitterwolke */
  private stepPre(dt: number) {
    const p = this.pre;
    if (!p.on) return;
    p.t += dt;
    if (p.t > 3) { p.on = false; return; }
    const f = p.f;
    if (!f) return;
    p.tick += dt;
    if (p.tick < 0.03) return;
    p.tick = 0;
    if (p.kind === 'iaiWorldBreak') {
      // 4.6I Überschall-Dash: hinter der Figur bleibt ein feiner, leuchtender Raumriss stehen (bricht beim Einrasten auf)
      const dx = f.x - p.lx, dz = f.z - p.lz, dl = Math.hypot(dx, dz);
      if (dl > 0.4) {
        this.vfx.bolt(p.lx, f.y + 1.1, p.lz, f.x, f.y + 1.1, f.z, WHITE, 0.05, 0.9, { depth: 2, jitter: 0.02, flicker: 0.1 });
        p.lx = f.x; p.lz = f.z;
      }
      this.threat(f.x, f.y + 1.1, f.z);
    } else if (p.kind === 'sevenSeas') {
      this.threat(f.x, f.y + 4, f.z);
      // golden-purpurne Säbel-Blitze um die springende Figur
      for (let i = 0; i < 2; i++) {
        const a0 = rnd() * Math.PI * 2, r0 = 1.5 + rnd(), a1 = a0 + (rnd() - 0.5) * 1.4, r1 = 1.6 + rnd() * 1.4;
        this.boltBetween(f.x + Math.sin(a0) * r0, f.y + 0.4 + rnd() * 1.6, f.z + Math.cos(a0) * r0, f.x + Math.sin(a1) * r1, f.y + rnd() * 3, f.z + Math.cos(a1) * r1, i ? GOLD : CRIMSON, 2.6, 0.08, 0.5);
      }
    } else if (p.kind === 'thunderJudgment') {
      // Blitze zwischen Figur und Wolke, die Figur steigt hinein (Fußpunkte auf einem Ring um die Figur, nicht vor dem Gesicht)
      const a = rnd() * Math.PI * 2, r = 1.6 + rnd() * 1.2, r2 = 4 + rnd() * 6;
      this.boltBetween(f.x + Math.sin(a) * r, f.y + 1, f.z + Math.cos(a) * r, f.x + Math.sin(a) * r2, p.cloudY + rnd() * 2, f.z + Math.cos(a) * r2, rnd() < 0.5 ? WHITE : p.acc, 3.5, 0.1, 0.5);
      // 4.6I: der zwölfästige Fraktal-Hauptblitz stürzt aus der Wolke herab – seine Spitze erreicht den Boden genau zum Einschlag
      const fwX = Math.sin(f.yaw), fwZ = Math.cos(f.yaw);
      const gx = p.sx + fwX * 14, gz = p.sz + fwZ * 14, gy = this.host.groundY(gx, gz, p.sy);
      const u = Math.min(1, p.t / Math.max(0.1, p.strikeAt)), e = u * u;
      const tipY = p.cloudY + (gy - p.cloudY) * e;
      this.vfx.bolt(gx + (rnd() - 0.5) * 3, p.cloudY, gz + (rnd() - 0.5) * 3, gx, tipY, gz, WHITE, 0.45, 0.06, { depth: 4, branches: Math.round(12 * e), jitter: 0.12, flicker: 0.3 });
      this.threat(gx, tipY, gz);
    }
  }

  // ---------- 4.6C: Schwungfenster der Kampfkünste, Klingen-Clash ----------

  /**
   * Sichtbare Wucht jedes Schwungfensters einer Technik, Verzweigung, eines Finishers oder Meteors: Linien werden zu Klingenwellen mit
   * Elementen am Boden entlang (Felsen, Eis-Stacheln, Flammen, Wasser, Blitze), Kreise zu Eruptionen, Bögen zu sichtbaren Sichelschnitten.
   */
  swingFx(h: ActionHit, f: FighterState, colorHex: string, element: string, meteor = false, soft = false) {
    const fx = this.host.fx, b = fx.brush, vf = this.vfx;
    const col = this.color(colorHex);
    const el = h.vfx || element;
    const ec = ELEMENT_COL[el] ? this.color(ELEMENT_COL[el]) : col;
    const ink = this.ink(ec);
    const fwdX = Math.sin(f.yaw), fwdZ = Math.cos(f.yaw);
    const dur = Math.max(0.12, h.t1 - h.t0);
    this.stats.swings++;
    if (h.projectile) {
      // Mündung: Kern-Glut, dunkler Rauchkranz, Funkengarbe in Schussrichtung
      const mx = f.x + fwdX * 0.9, my = f.y + 1.3, mz = f.z + fwdZ * 0.9;
      b.reset().at(mx, my, mz).size(0.2, 0.2, 0.2, 1.3, 1.3, 1.3).span(0.16).col(ec, 2.4).fade(0.01, 0.7);
      fx.emit('orb');
      // 4.9: Lichtblitz (kurz, weiß) und Druckwelle quer zur Schussrichtung
      b.reset().at(mx, my, mz).size(0.4, 0.4, 0.4, 2.4, 2.4, 2.4).span(0.07).col(WHITE, 2.6).fade(0.005, 0.5);
      fx.emit('orb');
      vf.pressureRing(mx, my, mz, f.yaw, true, 0.95, ec, 0.24);
      vf.burst('smoke', mx, my, mz, 3, 1.2, ink, { size: 0.8, life: 0.5 });
      vf.burst('spark', mx, my, mz, 8, 11, ec, { dirX: fwdX, dirY: 0.1, dirZ: fwdZ, focus: 0.75, up: 0.5 });
      return;
    }
    if (h.shape === 'line') {
      // Klingenwelle in drei Schichten: Tusche-Sichel, leuchtende Sichel mit Schneide, Funken; Element-Ausbrüche am Boden entlang
      const sp = h.range / (dur + 0.12);
      const w = Math.max(1.2, h.width);
      vf.slash(f.x + fwdX * 0.8, f.y + 0.9, f.z + fwdZ * 0.8, f.yaw, 0, 0, w * 0.95, ec, ink, { life: dur + 0.14, vx: fwdX * sp, vz: fwdZ * sp, sparks: 4 });
      vf.slash(f.x + fwdX * 0.8, f.y + 1.1, f.z + fwdZ * 0.8, f.yaw, -1.15, 0, w * 0.8, WHITE, ink, { life: dur + 0.12, vx: fwdX * sp, vz: fwdZ * sp, sparks: 0, k: 0.8 });
      const n = Math.min(9, Math.max(3, Math.round(h.range / 2)));
      for (let i = 0; i < n; i++) {
        const d = ((i + 1) / n) * h.range, px = f.x + fwdX * d, pz = f.z + fwdZ * d;
        const gy = this.host.groundY(px, pz, f.y);
        this.elementBurst(el, px, gy, pz, ec, 0.7, d / sp);
      }
      vf.surfaceHit(f.x + fwdX * h.range, f.y, f.z + fwdZ * h.range, Math.max(1.2, w * 0.6), ec, 0.8, (h.range * 0.9) / sp);
      // 4.9: Lichtblitz am Ansatz, Energiespur dicht über dem Boden, Druckwelle am Ende der Welle
      b.reset().at(f.x + fwdX * 0.9, f.y + 1, f.z + fwdZ * 0.9).size(0.4, 0.4, 0.4, 2, 2, 2).span(0.06).col(WHITE, 2.4).fade(0.005, 0.5);
      fx.emit('orb');
      const ex = f.x + fwdX * h.range, ez = f.z + fwdZ * h.range, ey = this.host.groundY(ex, ez, f.y);
      vf.bolt(f.x + fwdX * 0.8, f.y + 0.55, f.z + fwdZ * 0.8, ex, ey + 0.5, ez, ec, 0.16, dur + 0.16, { depth: 3, branches: 0, jitter: 0.03 });
      b.reset().at(ex, ey + 0.12, ez).rot(f.yaw).size(0.5, 1, 0.5, Math.max(2, w * 1.6), 1, Math.max(2, w * 1.6)).span(0.32, (h.range * 0.9) / sp).col(ec, 2).fade(0.01, 0.6);
      fx.emit('shock');
      return;
    }
    if (h.shape === 'circle') {
      const cx = f.x + fwdX * h.offset, cz = f.z + fwdZ * h.offset;
      const gy = this.host.groundY(cx, cz, f.y);
      // Eruption: Flammen-/Energiekranz, Krater bzw. Gischt mit Partikeln; Meteor = mehrstufiger Krater mit Schockwellen
      b.reset().at(cx, gy + 0.12, cz).size(0.6, 1, 0.6, h.range * 1.05, 1, h.range * 1.05).span(0.45).col(ec, 2).fade(0.01, 0.6);
      fx.emit('ring');
      // 4.9: Lichtblitz in der Mitte und eine flache Druckwelle, die über den Kranz hinausläuft
      b.reset().at(cx, gy + 0.8, cz).size(0.5, 0.5, 0.5, Math.min(4, h.range * 0.7), Math.min(4, h.range * 0.7), Math.min(4, h.range * 0.7)).span(0.07).col(WHITE, 2.4).fade(0.005, 0.5);
      fx.emit('orb');
      vf.pressureRing(cx, gy + 0.25, cz, 0, false, h.range * 1.35, ec, 0.38);
      // 4.7C: heilende Wellen (Priester) reißen den Boden nicht auf – nur Lichtring und Funken
      if (!soft) vf.surfaceHit(cx, gy, cz, h.range * (meteor ? 0.9 : 0.6), ec, meteor ? 1.8 : 1);
      if (meteor) {
        for (let k = 1; k <= 3; k++) { b.reset().at(cx, gy + 0.1, cz).rot(rnd() * 6).size(1, 1, 1, h.range * (0.8 + k * 0.55), 1, h.range * (0.8 + k * 0.55)).span(0.35 + k * 0.12, k * 0.05).col(k === 2 ? WHITE : ec, 2).fade(0.01, 0.6); fx.emit('shock'); }
        vf.burst(this.host.isLand(cx, cz) ? 'rock' : 'drop', cx, gy + 0.3, cz, 16, 8, this.host.isLand(cx, cz) ? TMP.setRGB(0.55, 0.5, 0.46) : SPRAY, { up: 9, size: 0.28 });
        vf.spiral(cx, gy, cz, h.range * 0.45, 3.5, ec, 0.45, 2, 9);
      }
      const n = Math.min(8, Math.max(3, Math.round(h.range)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.4, r = h.range * (0.35 + rnd() * 0.6);
        this.elementBurst(el, cx + Math.sin(a) * r, gy, cz + Math.cos(a) * r, ec, 0.8, rnd() * 0.08);
      }
      this.elementBurst(el, cx, gy, cz, ec, 1.3, 0);
      return;
    }
    // Bogen: Sichelschnitt in drei Schichten (voller Kreis = drei Sicheln rundum, als Wirbel)
    const full = h.arc >= 5;
    const k = full ? 3 : 1;
    const r = Math.max(1.6, h.range * 0.9);
    for (let i = 0; i < k; i++) {
      const a = f.yaw + (full ? (i * Math.PI * 2) / 3 : 0);
      // nie ganz waagrecht: flach liegende Sicheln sieht die Kamera hinter der Figur nur als Strich
      const rl = (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.5);
      vf.slash(f.x, f.y + 0.9 + rnd() * 0.5, f.z, a, full ? -0.35 : -0.95, rl, r, i ? ec : WHITE, ink, { life: 0.2, spin: full ? 14 : 0, sparks: 4 });
    }
    if (h.range >= 6) this.elementBurst(el, f.x + fwdX * h.range * 0.6, this.host.groundY(f.x + fwdX * h.range * 0.6, f.z + fwdZ * h.range * 0.6, f.y), f.z + fwdZ * h.range * 0.6, ec, 0.9, 0.05);
  }

  /**
   * 4.6D: Kettenschlag (L1 – L5, Luft-Kette, Stilwechsel): scharf verjüngter Klingen- bzw. Faustbogen in drei Schichten, Richtung je
   * Stufe wechselnd (schräg, gegenläufig, waagrecht, steil), Funken entlang der Bahn; Kreis-Treffer mit Bodenring.
   */
  slashFx(h: ActionHit, f: FighterState, colorHex: string, element: string, step: number, fist: boolean, air: boolean) {
    const vf = this.vfx;
    const col = this.color(colorHex);
    const el = h.vfx || element;
    const ec = ELEMENT_COL[el] && el !== 'klinge' ? this.color(ELEMENT_COL[el]) : col;
    const ink = this.ink(ec);
    const fwdX = Math.sin(f.yaw), fwdZ = Math.cos(f.yaw);
    const roll = SLASH_ROLL[step % SLASH_ROLL.length] + (air ? (step % 2 ? 0.7 : -0.7) : 0);
    const r = Math.max(1.3, h.range * (fist ? 0.75 : 0.95));
    if (h.shape === 'circle') {
      const cx = f.x + fwdX * h.offset, cz = f.z + fwdZ * h.offset;
      vf.surfaceHit(cx, f.y, cz, Math.max(1, h.range * 0.55), ec, 0.7);
    }
    const full = h.arc >= 5;
    const n = full ? 2 : 1;
    for (let i = 0; i < n; i++) {
      // aufgerichtet (vorn angehoben): die Sichel steht als Bogen vor der Figur und ist von der Kamera dahinter voll zu sehen
      vf.slash(f.x + fwdX * 0.15, f.y + (air ? 1.1 : 0.95), f.z + fwdZ * 0.15, f.yaw + (full ? i * Math.PI : 0), air ? -0.75 : -1.0, roll, r, i ? WHITE : ec, ink,
        { life: fist ? 0.14 : 0.17, fist, spin: full ? (step % 2 ? -16 : 16) : 0, sparks: fist ? 3 : 5 });
    }
    this.stats.slashes++;
  }

  /** 4.6D: Treffer am Gegner – Funken in Schlagrichtung, Staub bzw. Gischt an den Füßen; schwere Treffer mit Krater/Gischtring */
  hitImpact(x: number, y: number, z: number, dirX: number, dirZ: number, colorHex: string, element: string, heavy: boolean, crit: boolean) {
    const vf = this.vfx;
    const col = ELEMENT_COL[element] && element !== 'klinge' ? this.color(ELEMENT_COL[element]) : this.color(colorHex);
    vf.burst('spark', x, y, z, heavy || crit ? 9 : 5, heavy ? 13 : 9, col, { dirX, dirY: 0.25, dirZ, focus: 0.65, up: 1.5 });
    if (heavy || crit) vf.surfaceHit(x, y - 1.2, z, heavy ? 1.4 : 0.9, col, 0.6);
    else {
      const s = vf.surface, land = s ? s.isLand(x, z) : true;
      if (land) vf.burst('dust', x, y - 1.1, z, 2, 1.6, TMP.setRGB(0.62, 0.55, 0.45), { up: 0.8, size: 0.7, life: 0.6 });
      else vf.burst('drop', x, (s ? s.waterY(x, z) : y - 1.2) + 0.1, z, 4, 2.5, SPRAY, { up: 3.5, size: 0.18 });
    }
    this.stats.impacts++;
  }

  /** 4.6D: Hochschleudern (Launcher): aufsteigende Wind-/Energiespirale um den Gegner */
  launchFx(x: number, y: number, z: number, colorHex: string) {
    this.vfx.spiral(x, y - 0.3, z, 1.1, 4.2, this.color(colorHex), 0.55, 3, 10);
  }

  /** 4.6D: Dash: leuchtendes Nachbild-Band entlang des Wegs (in der Luft mit Funkenschweif) */
  dashFx(ax: number, ay: number, az: number, bx: number, by: number, bz: number, colorHex: string, air: boolean) {
    const c = this.color(colorHex);
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, by - ay, dz);
    if (len < 0.4) return;
    const fx = this.host.fx, b = fx.brush;
    const yaw = Math.atan2(dx, dz);
    // flaches Band: Helix mit winzigem Radius, der Länge nach gelegt
    b.reset().at(ax, ay + 1, az).rot(yaw, Math.PI / 2, 0).size(0.12, len, 0.5, 0.05, len, 0.2).span(0.3).col(this.ink(c), 1).fade(0.01, 0.6);
    fx.emit('ribbonInk');
    b.reset().at(ax, ay + 1, az).rot(yaw, Math.PI / 2, 0).size(0.1, len, 0.4, 0.04, len, 0.15).span(0.26).col(c, 2.2).fade(0.01, 0.6);
    fx.emit('ribbon');
    if (air) this.vfx.burst('spark', bx, by + 1, bz, 6, 5, c, { dirX: -dx / len, dirY: 0, dirZ: -dz / len, focus: 0.6, up: 0.5 });
  }

  /** 4.6D: Sturm-Schritt (perfektes Ausweichen): scharfe Blitz-Silhouetten am Absprung- und Zielpunkt, Plasma-Ader dazwischen */
  stormStepFx(ox: number, oy: number, oz: number, x: number, y: number, z: number, yaw: number, colorHex: string) {
    const c = this.color(colorHex);
    this.vfx.silhouette(ox, oy, oz, yaw, c, 0.4);
    this.vfx.silhouette(x, y, z, yaw, WHITE, 0.26);
    this.vfx.bolt(ox, oy + 1.1, oz, x, y + 1.1, z, c, 0.12, 0.28, { depth: 3, jitter: 0.08 });
    this.vfx.pressureRing(x, y + 0.08, z, 0, false, 2.6, c, 0.4);
  }

  /** Ein Element-Ausbruch an einem Ort (Felsen, Eis, Flamme, Wasser, Blitz, Wind, Sonne, Mond, Finsternis, Klinge) */
  private elementBurst(el: string, x: number, y: number, z: number, col: Color, k: number, delay: number) {
    const fx = this.host.fx, b = fx.brush;
    switch (el) {
      case 'erde': case 'koenig': {
        const sz = (0.6 + rnd() * 0.7) * k;
        b.reset().at(x, y - sz * 1.4, z).rot(rnd() * 6, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5).size(sz, sz, sz).span(1.4, delay).col(WHITE, 1).fade(0.01, 0.2);
        b.vy = sz * 4.5; b.drag = 4;
        fx.emit('rock');
        b.reset().at(x, y + 0.05, z).rot(rnd() * 6).size(sz * 0.6, 1, sz * 0.6, sz * 1.9, 1, sz * 1.9).span(1.3, delay).col(this.ink(col, INK2), 1).fade(0.02, 0.4);
        fx.emit('crater');
        this.vfx.burst('dust', x, y + 0.3, z, 2, 2, TMP.setRGB(0.62, 0.55, 0.45), { up: 1, size: 0.9, life: 0.8, delay });
        break;
      }
      case 'eis': {
        b.reset().at(x, y - 0.3, z).rot(rnd() * 6, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4).size(0.2, 0.1, 0.2, 0.7 * k, (1.6 + rnd() * 1.8) * k, 0.7 * k).span(0.9, delay).col(col, 1.6).fade(0.04, 0.2);
        fx.emit('shard');
        this.vfx.burst('ice', x, y + 0.4, z, 3, 3.5, ICE, { up: 3, size: 0.28, delay });
        break;
      }
      case 'feuer': case 'sonne': {
        b.reset().at(x, y + 0.4, z).vel(0, 3 + rnd() * 2, 0).size(0.9 * k, 0.9 * k, 0.9 * k, 0.2, 0.2, 0.2).span(0.55, delay).col(col, 2.4).fade(0.02, 0.6);
        b.flicker = 0.3;
        fx.emit('orb');
        b.reset().at(x, y + 0.1, z).rot(rnd() * 6).spin(4).size(0.4 * k, 0.6 * k, 0.4 * k, 0.8 * k, 2.2 * k, 0.8 * k).span(0.5, delay).col(col, 2).fade(0.03, 0.55);
        fx.emit('ribbon');
        this.vfx.burst('ember', x, y + 0.5, z, 3, 2, el === 'sonne' ? col : EMBER, { up: 3, size: 0.22, delay });
        if (el === 'sonne') { b.reset().at(x, y - 0.2, z).size(0.3, 9 * k, 0.3, 0.6, 9 * k, 0.6).span(0.35, delay).col(col, 1.8).fade(0.1, 0.5); fx.emit('column'); }
        break;
      }
      case 'wasser': {
        b.reset().at(x, y - 0.2, z).rot(rnd() * 6).size(1.5 * k, 1, 1, 2.6 * k, (2.5 + rnd() * 2) * k, 1).span(0.6, delay).col(col, 0.8).fade(0.05, 0.6);
        fx.emit('wall');
        b.reset().at(x, y - 0.1, z).rot(rnd() * 6).size(0.4 * k, 0.4 * k, 0.4 * k, 1.1 * k, 1.8 * k, 1.1 * k).span(0.6, delay).col(SPRAY, 1).fade(0.02, 0.5);
        fx.emit('splash');
        this.vfx.burst('drop', x, y + 0.3, z, 3, 3, SPRAY, { up: 4, size: 0.2, delay });
        break;
      }
      case 'blitz': {
        if (delay <= 0.02) this.vfx.bolt(x + (rnd() - 0.5) * 2, y + 7 * k, z + (rnd() - 0.5) * 2, x, y, z, col, 0.1 * k, 0.18, { depth: 3, branches: 1, jitter: 0.12 });
        else { b.reset().at(x, y + 0.5, z).size(0.3, 0.3, 0.3, 1.1 * k, 1.1 * k, 1.1 * k).span(0.2, delay).col(WHITE, 2.6).fade(0.01, 0.6); fx.emit('orb'); }
        this.vfx.burst('spark', x, y + 0.3, z, 3, 6, col, { up: 3, delay });
        break;
      }
      case 'wind': {
        b.reset().at(x, y + 0.3, z).size(0.4, 1, 0.4, 1.8 * k, 1, 1.8 * k).span(0.4, delay).col(col, 1.4).fade(0.05, 0.6).spin(12);
        b.vy = 5;
        fx.emit('ring');
        b.reset().at(x, y, z).rot(rnd() * 6).spin(11).size(0.5 * k, 0.8 * k, 0.5 * k, 1.2 * k, 2.4 * k, 1.2 * k).span(0.45, delay).col(col, 1.6).fade(0.03, 0.55);
        fx.emit('ribbon');
        break;
      }
      case 'mond': case 'void': case 'schwarzloch': {
        const yy = y + 0.6 + rnd(), yw = rnd() * 6, rl = (rnd() - 0.5) * 1.4;
        b.reset().at(x, yy, z).rot(yw, 0, rl).size(0.7 * k, 1, 0.7 * k, 1.7 * k, 1, 1.7 * k).span(0.36, delay).col(this.ink(col, INK2), 1).fade(0.02, 0.5);
        fx.emit('sickleInk');
        b.reset().at(x, yy, z).rot(yw, 0, rl).size(0.6 * k, 1, 0.6 * k, 1.5 * k, 1, 1.5 * k).span(0.3, delay).col(col, 2.2).fade(0.02, 0.5);
        fx.emit('sickle');
        break;
      }
      default: {
        // Klinge und Faust: heller Funkenstoß, Runen-Druckring, Staub
        b.reset().at(x, y + 0.6, z).size(0.2, 0.2, 0.2, 0.9 * k, 0.9 * k, 0.9 * k).span(0.16, delay).col(col, 2.4).fade(0.01, 0.6);
        fx.emit('orb');
        b.reset().at(x, y + 0.08, z).rot(rnd() * 6).size(0.3, 1, 0.3, 1.6 * k, 1, 1.6 * k).span(0.3, delay).col(col, 1.6).fade(0.01, 0.6);
        fx.emit('shock');
        this.vfx.burst('spark', x, y + 0.5, z, 3, 7, col, { up: 2.5, delay });
      }
    }
  }

  /** Klingen-Clash: Funkenfontäne zwischen den Klingen, senkrechter Druckring, Lichtblitz */
  clash(x: number, y: number, z: number, yaw: number) {
    const fx = this.host.fx, b = fx.brush, vf = this.vfx;
    // Funkengarbe: zwei Fontänen quer zur Schlagrichtung, Splitterregen, Lichtkern mit dunklem Rauchkranz
    const sx = Math.cos(yaw), sz = -Math.sin(yaw);
    vf.burst('spark', x, y, z, 26, 13, GOLD, { dirX: sx, dirY: 0.45, dirZ: sz, focus: 0.55, up: 3, size: 0.4 });
    vf.burst('spark', x, y, z, 26, 13, GOLD, { dirX: -sx, dirY: 0.45, dirZ: -sz, focus: 0.55, up: 3, size: 0.4 });
    const n = Math.round(18 * this.detailK);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, sp = 5 + rnd() * 11;
      b.reset().at(x, y, z).vel(Math.sin(a) * sp * 0.7, 4 + rnd() * 9, Math.cos(a) * sp * 0.7).spin(rnd() * 14, rnd() * 14).size(0.12, 0.35, 0.12, 0.04, 0.12, 0.04).span(0.5 + rnd() * 0.4).col(i % 3 ? GOLD : WHITE, 2.8).fade(0.01, 0.4);
      b.grav = 18;
      fx.emit('shard');
    }
    vf.burst('smoke', x, y, z, 4, 2, TMP.setRGB(0.05, 0.04, 0.03), { size: 1.2, life: 0.6 });
    vf.pressureRing(x, y, z, yaw, true, 4.2, WHITE, 0.34);
    vf.pressureRing(x, y, z, yaw, true, 6.5, GOLD, 0.48);
    b.reset().at(x, y, z).size(0.2, 0.2, 0.2, 1.8, 1.8, 1.8).span(0.12).col(WHITE, 3).fade(0.01, 0.8);
    fx.emit('orb');
    this.stats.clashes++;
  }

  // ---------- kleine Effekte der Faji-Künste ----------

  /** Blitz-Strahl zwischen zwei Punkten (Grundform `bolt`, entlang +Y ausgerichtet) */
  boltBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number, col: Color, width: number, life: number, flicker = 0.3) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (len < 0.05) return;
    // 4.6D: gezackte Fraktal-Ader (Plasma-Textur, dunkler Mantel) statt eines glatten Streifens; lange Blitze mit mehr Gliedern
    this.vfx.bolt(ax, ay, az, bx, by, bz, col, Math.max(0.035, width * 0.022), life, { depth: len > 30 ? 4 : len > 6 ? 3 : 2, jitter: 0.12, flicker, branches: len > 20 ? 1 : 0 });
  }

  /** Energiewelle des Sturm-Erwachens: eine Sichel fliegt mit jedem normalen Schlag nach vorn */
  awakenWave(f: FighterState, color: string, accent: string) {
    const c = this.color(color), a = this.color(accent);
    const fwdX = Math.sin(f.yaw), fwdZ = Math.cos(f.yaw);
    const roll = (rnd() - 0.5) * 0.9;
    this.vfx.slash(f.x + fwdX * 0.8, f.y + 1.1, f.z + fwdZ * 0.8, f.yaw, -0.9, roll, 3.4, c, this.ink(a), { life: 0.32, vx: fwdX * 26, vz: fwdZ * 26, sparks: 3 });
    this.vfx.slash(f.x + fwdX * 0.6, f.y + 1.1, f.z + fwdZ * 0.6, f.yaw, -0.9, roll, 2.6, a, this.ink(a), { life: 0.28, vx: fwdX * 22, vz: fwdZ * 22, sparks: 0, k: 0.8 });
    this.stats.waves++;
  }

  /** Kettenblitz zwischen zwei Zielen */
  chain(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: string) {
    const c = this.color(color);
    this.vfx.bolt(ax, ay, az, bx, by, bz, c, 0.09, 0.24, { depth: 3, jitter: 0.14, branches: 1 });
    this.vfx.burst('spark', bx, by, bz, 5, 6, c, { up: 2 });
    this.stats.chains++;
  }

  // ---------- 4.7B Geistes-Faji (nur vorhandene Bausteine: Ringe, Säulen, Splitter, Tusche, Funken – keine neuen Shader) ----------

  /** Figur mit Willens-Entfesselung (schwarz-goldene Aura läuft in `stepAura`, solange `willT` > 0) */
  private willF: FighterState | null = null;
  private willT = 0;
  /** Königsdruck: Restzeit der Himmelsverdunkelung (s) */
  private kingDarkT = 0;
  /** 4.91: Abdunkeln der Form-Aufladung (Restzeit, Stärke) und ausstehende Treffermomente von Form-Geschossen */
  private formDarkT = 0;
  private formDarkK = 0;
  private readonly formQ: FormHit[] = Array.from({ length: 6 }, () => ({ on: false, t: 0, c: null, x: 0, y: 0, z: 0, yaw: 0, col: '#fff', acc: '#fff', el: '', scale: 1 }));

  /**
   * 4.91 – Akt 1 einer Form bzw. eines Geistes-Faji (beim Start): der Himmel verdunkelt sich, eine Energiesäule mit weißem Kern steigt auf,
   * Aura-Wirbel und eine Spirale umkreisen die Figur, Funken steigen; die Kamera rückt über den Fokus-Puls heran. `scale` > 1 auf See.
   */
  formCharge(c: FormCinema, x: number, y: number, z: number, colorHex: string, accentHex: string, scale = 1) {
    const fx = this.host.fx, b = fx.brush, vf = this.vfx;
    const col = this.color(colorHex), acc = this.color(accentHex);
    if (c.darken > 0) { this.formDarkK = Math.max(this.formDarkT > 0 ? this.formDarkK : 0, c.darken); this.formDarkT = 0.55 + c.tier * 0.2; }
    if (c.pillar > 0) {
      const h = c.pillar * (scale > 1 ? 1.4 : 1), w = (0.8 + c.tier * 0.35) * scale;
      b.reset().at(x, y - 0.5, z).size(w * 0.3, h, w * 0.3, w, h, w).span(0.45 + c.tier * 0.12).col(col, 1.6).fade(0.06, 0.5);
      fx.emit('column');
      b.reset().at(x, y - 0.5, z).size(w * 0.12, h * 1.05, w * 0.12, w * 0.36, h * 1.05, w * 0.36).span(0.4 + c.tier * 0.1).col(WHITE, 2.2).fade(0.06, 0.45);
      fx.emit('column');
    }
    for (let i = 0; i < c.swirls; i++) vf.auraSwirl(x, y, z, col, acc, (0.8 + i * 0.35) * scale, 0.35 + i * 0.1);
    vf.spiral(x, y, z, 0.9 * scale, Math.max(2.4, c.pillar * 0.35) * scale, col, 0.5 + c.tier * 0.1, 1 + c.tier, 8);
    vf.burst('spark', x, y + 0.6, z, 6 + c.tier * 6, 2.4 * scale, acc, { up: 4 * scale, size: 0.12 * scale, life: 0.7, spread: 0.6 * scale });
    b.reset().at(x, y + 0.08, z).size(1, 1, 1, (1.6 + c.tier) * scale, 1, (1.6 + c.tier) * scale).span(0.4).col(acc, 1.7).fade(0.02, 0.6);
    fx.emit('ring');
    this.host.focus?.(c.focus, 0.35 + c.tier * 0.15);
    this.stats.formCharges++;
  }

  /**
   * 4.91 – Akt 2 und 3 einer Form bzw. eines Geistes-Faji (im Treffermoment): die Welt hält die Zeit an und zeigt die Impact-Bilder
   * (`formStop`), danach Kernblitz, gestaffelte radiale Druckwellen, Risse im Boden bzw. Gischt-Risse im Wasser, Element-Eruption und
   * zwei Wellen Nachbeben-Funken. Boden bzw. Wasser bestimmt die Oberfläche der Effekte (`surfaceHit`).
   */
  formImpact(c: FormCinema, x: number, y: number, z: number, yaw: number, colorHex: string, accentHex: string, element: string, scale = 1) {
    const fx = this.host.fx, b = fx.brush, vf = this.vfx;
    const col = this.color(colorHex), acc = this.color(accentHex);
    const land = this.host.isLand(x, z);
    const gy = land ? this.host.groundY(x, z, y) : this.host.waterY(x, z);
    const R = c.shock * scale;
    this.host.formStop?.(c);
    // Kernblitz mit weißer Mitte
    b.reset().at(x, gy + 1.1 * scale, z).size(0.3, 0.3, 0.3, (1.2 + c.tier * 0.6) * scale, (1.2 + c.tier * 0.6) * scale, (1.2 + c.tier * 0.6) * scale).span(0.2).col(WHITE, 2.4).fade(0.01, 0.7);
    fx.emit('orb');
    // gestaffelte radiale Druckwellen (abwechselnd Akzent und Weiß), dazu ein stehender Ring in Schlagrichtung
    for (let k = 1; k <= c.rings; k++) {
      const r = R * (0.35 + k * (0.65 / c.rings));
      b.reset().at(x, gy + 0.15, z).rot(rnd() * 6).size(1, 1, 1, r, 1, r).span(0.32 + k * 0.1, (k - 1) * 0.06).col(k % 2 ? acc : WHITE, 2).fade(0.01, 0.6);
      fx.emit('shock');
    }
    vf.pressureRing(x, gy + 0.4 * scale, z, 0, false, R, acc, 0.45);
    vf.pressureRing(x, gy + 1.1 * scale, z, yaw, true, R * 0.45, col, 0.32);
    // Risse: Krater/Runen und Gestein an Land, Gischtkronen im Wasser – sternförmig nach außen
    for (let i = 0; i < c.cracks; i++) {
      const a = yaw + (i / Math.max(1, c.cracks)) * Math.PI * 2 + (rnd() - 0.5) * 0.4, d = R * (0.3 + rnd() * 0.45);
      const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
      const py = land ? this.host.groundY(px, pz, gy) : this.host.waterY(px, pz);
      vf.surfaceHit(px, py, pz, (0.9 + c.tier * 0.3) * scale, col, 0.9, 0.03 * i);
    }
    vf.surfaceHit(x, gy, z, R * 0.32, col, 1 + c.tier * 0.2);
    this.elementBurst(element, x, gy + 0.6, z, col, (0.7 + c.tier * 0.3) * scale, 0);
    // Nachbeben: zwei verzögerte Wellen aus Funken bzw. Glut, an Land Staub, auf See Tropfen
    const kind = element === 'eis' ? 'ice' : element === 'feuer' || element === 'sonne' ? 'ember' : 'spark';
    vf.burst(kind, x, gy + 0.4, z, c.after, 5 * scale, acc, { up: 4.5 * scale, size: 0.14 * scale, life: 1, delay: 0.18, spread: R * 0.25 });
    vf.burst(land ? 'dust' : 'drop', x, gy + 0.3, z, Math.max(2, c.after >> 2), 2.6 * scale, land ? TMP.setRGB(0.6, 0.54, 0.46) : SPRAY, { up: land ? 1 : 5 * scale, size: land ? 1 * scale : 0.3 * scale, life: 0.9, delay: 0.42, spread: R * 0.3 });
    if (c.tier === 3) {
      // Stufe 3: ein Blitz fährt aus dem verdunkelten Himmel in den Einschlag
      vf.bolt(x + (rnd() - 0.5) * 2, gy + 26 * scale, z + (rnd() - 0.5) * 2, x, gy + 0.3, z, WHITE, 0.3 * scale, 0.22, { depth: 5, branches: 3, jitter: 0.12 });
    }
    this.host.shake(c.shake);
    this.stats.formImpacts++;
  }

  /** 4.91: Treffermoment eines Form-Geschosses vormerken (fällt nach `delay` s Spielzeit am Einschlagsort) */
  queueFormImpact(delay: number, c: FormCinema, x: number, y: number, z: number, yaw: number, colorHex: string, accentHex: string, element: string, scale = 1) {
    let q = this.formQ.find((k) => !k.on);
    if (!q) q = this.formQ.reduce((a, k) => (k.t < a.t ? k : a), this.formQ[0]);
    q.on = true; q.t = Math.max(0, delay); q.c = c; q.x = x; q.y = y; q.z = z; q.yaw = yaw; q.col = colorHex; q.acc = accentHex; q.el = element; q.scale = scale;
    this.stats.formQueued++;
  }

  private stepFormQueue(dt: number) {
    for (const q of this.formQ) {
      if (!q.on) continue;
      q.t -= dt;
      if (q.t > 0 || !q.c) continue;
      q.on = false;
      this.formImpact(q.c, q.x, q.y, q.z, q.yaw, q.col, q.acc, q.el, q.scale);
    }
  }

  /**
   * Geistes-Kraft darstellen: 1 Willens-Entfesselung (schwarz-goldene Aura), 2 Lebensstrom-Fokus (smaragd-goldene Ströme), 3 Erwachter Wille
   * (mehrschichtige Schockwelle mit schwarzen Blitzen), 4 Königsdruck (Druckkuppel, dunkler Himmel, Bodenrisse, schwebende Splitter)
   */
  geistFx(kind: number, f: FighterState, r: number) {
    const fx = this.host.fx, b = fx.brush, vf = this.vfx;
    const x = f.x, y = f.y, z = f.z;
    if (kind === 1) {
      this.willF = f; this.willT = 0;
      vf.corona(x, y + 1.25, z, f.yaw, 1.1, GOLD, WILL_INK, 0.7);
      b.reset().at(x, y + 0.12, z).size(1, 1, 1, 4.2, 1, 4.2).span(0.55).col(GOLD, 1.6).fade(0.02, 0.6);
      fx.emit('ring');
      b.reset().at(x, y + 0.1, z).spin(3).size(1.2, 1.4, 1.2, 3.4, 2.2, 3.4).span(0.6).col(WILL_INK, 1).fade(0.05, 0.4);
      fx.emit('ribbonInk');
      vf.burst('ember', x, y + 1, z, 18, 3.5, GOLD, { up: 3, size: 0.2, life: 0.7, spread: 0.6 });
      this.stats.waves++;
    } else if (kind === 2) {
      // smaragd-goldene Lebensströme steigen spiralförmig auf
      for (let i = 0; i < 3; i++) {
        b.reset().at(x, y + 0.1, z).rot((i / 3) * Math.PI * 2, 0).spin(4).size(0.6, 0.6, 0.6, 1.6, 2.6, 1.6).span(0.9).col(i === 1 ? GOLD : EMERALD, 1.8).fade(0.1, 0.5);
        fx.emit('ribbon');
      }
      vf.burst('spark', x, y + 0.5, z, 28, 2.6, EMERALD, { up: 4.5, size: 0.22, life: 1.0, spread: 0.7 });
      vf.burst('ember', x, y + 0.4, z, 14, 2, GOLD, { up: 3.5, size: 0.18, life: 0.9, spread: 0.5 });
      b.reset().at(x, y + 0.1, z).size(1, 1, 1, 2.6, 1, 2.6).span(0.7).col(EMERALD, 1.6).fade(0.02, 0.7);
      fx.emit('ring');
    } else if (kind === 3) {
      // drei Schichten Schockwelle, dazu schwarze Blitze rundum
      for (let i = 0; i < 3; i++) vf.pressureRing(x, y + 0.6 + i * 0.35, z, 0, false, r * (0.45 + i * 0.28), i === 1 ? VIOLET : GOLD, 0.35 + i * 0.12);
      b.reset().at(x, y + 0.12, z).size(1, 1, 1, r, 1, r).span(0.5).col(VIOLET, 1.8).fade(0.02, 0.6);
      fx.emit('ring');
      b.reset().at(x, y + 0.1, z).size(1, 1, 1, r * 0.9, 1, r * 0.9).span(0.45).col(WILL_INK, 1).fade(0.02, 0.5);
      fx.emit('shock');
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rnd() * 0.5, d = r * (0.6 + rnd() * 0.4);
        vf.bolt(x, y + 1.2, z, x + Math.sin(a) * d, y + 0.2, z + Math.cos(a) * d, BLACK_BOLT, 0.12, 0.3, { depth: 3, jitter: 0.2, branches: 2 });
      }
      vf.burst('dust', x, y + 0.3, z, 6, r * 0.5, TMP.setRGB(0.5, 0.45, 0.4), { up: 0.6, size: 1, life: 0.6, spread: r * 0.3 });
      this.stats.waves++;
    } else if (kind === 4) {
      // Druckkuppel: liegende und stehende Ringe, Säule, dunkler Himmel, schwebende Splitter
      this.kingDarkT = 1.8;
      this.kingWave(x, y, z, r);
      for (let i = 0; i < 4; i++) vf.pressureRing(x, y + 2 + i * 0.2, z, (i / 4) * Math.PI, true, r * 0.55, i % 2 ? GOLD : WILL_INK, 0.6);
      vf.pressureRing(x, y + 0.8, z, 0, false, r, GOLD, 0.7);
      b.reset().at(x, y + 0.1, z).size(1, 1, 1, r * 1.05, 1, r * 1.05).span(0.8).col(WILL_INK, 1).fade(0.02, 0.6);
      fx.emit('shock');
      b.reset().at(x, y - 1, z).size(0.5, 40, 0.5, 2.4, 40, 2.4).span(0.7).col(GOLD, 1.6).fade(0.04, 0.5);
      fx.emit('column');
      for (let i = 0; i < 18; i++) {
        const a = rnd() * Math.PI * 2, d = 2 + rnd() * r * 0.7;
        b.reset().at(x + Math.sin(a) * d, y + 0.2, z + Math.cos(a) * d).vel(0, 1.5 + rnd() * 2.5, 0).spin(rnd() * 3, rnd() * 3).size(0.3, 0.6, 0.3, 0.2, 0.4, 0.2).span(1.4 + rnd() * 0.6).col(i % 3 ? STONE : GOLD, 1.3).fade(0.1, 0.5);
        b.grav = -0.5;
        fx.emit('shard');
      }
      this.stats.waves++;
    }
  }

  /**
   * 4.7C Wasserlauf: konzentrische Anime-Kräuselringe und Fontänen unter den Füßen (nur vorhandene Bausteine: Schaumring, Gischt, Tropfen).
   * `kind` 0 Stehen (ein ruhiger Ring), 1 Gehen, 2 Laufen (Fontäne höher, Tropfen), 3 Schwimmen (flache Ringe), 4 Eintauchen/Auftauchen.
   */
  waterStepFx(x: number, y: number, z: number, kind: number) {
    const fx = this.host.fx, b = fx.brush;
    const rings = kind === 4 ? 3 : kind === 0 || kind === 3 ? 1 : 2;
    for (let k = 0; k < rings; k++) {
      const r = (kind === 2 ? 1.9 : kind === 4 ? 2.4 : 1.4) + k * 1.2;
      b.reset().at(x, y + 0.05, z).rot(rnd() * 6).size(0.3, 1, 0.3, r, 1, r).span(0.75 + k * 0.25, k * 0.09).col(SPRAY, 0.95 - k * 0.22).fade(0.02, 0.62);
      fx.emit('foam');
    }
    if (kind === 1 || kind === 2 || kind === 4) {
      const h = kind === 4 ? 2.6 : kind === 2 ? 1.5 : 0.9;
      b.reset().at(x, y - 0.05, z).rot(rnd() * 6).size(0.2, 0.3, 0.2, kind === 4 ? 1.5 : 0.7, h, kind === 4 ? 1.5 : 0.7).span(kind === 4 ? 0.7 : 0.42).col(SPRAY, 1).fade(0.03, 0.5);
      fx.emit('splash');
      this.vfx.burst('drop', x, y + 0.2, z, kind === 4 ? 12 : kind === 2 ? 7 : 3, kind === 4 ? 4 : 2.6, SPRAY, { up: kind === 4 ? 4.5 : 3, size: 0.12, life: 0.55, spread: 0.3 });
    }
  }

  /** Willens-Druckwelle des Königsdrucks */
  kingWave(x: number, y: number, z: number, r: number) {
    const fx = this.host.fx, b = fx.brush;
    b.reset().at(x, y + 0.2, z).size(1, 1, 1, r, 1, r).span(0.6).col(GOLD, 1.8).fade(0.02, 0.7);
    fx.emit('ring');
    this.vfx.pressureRing(x, y + 1.2, z, 0, false, r * 0.8, TMP.setRGB(1, 0.85, 0.5), 0.5);
    this.vfx.burst('dust', x, y + 0.3, z, 4, r * 0.5, TMP.setRGB(0.62, 0.55, 0.45), { up: 0.6, size: 1.2, life: 0.7, spread: r * 0.3 });
  }

  /** Aura des Sturm-Erwachens (an/aus); läuft in `update` als aufsteigende Flammen-Funken */
  setAwakenAura(f: FighterState | null, color = '#ffffff', accent = '#ffffff') {
    this.auraF = f;
    if (f) { this.auraCol.copy(this.color(color)); this.auraAcc.copy(this.color(accent)); }
  }

  private stepAura(dt: number) {
    // 4.7B Willens-Entfesselung: schwarz-goldene Funken, solange die Kraft wirkt
    const w = this.willF;
    if (w) {
      if (w.willT <= 0) this.willF = null;
      else {
        this.willT += dt;
        const fx = this.host.fx, b = fx.brush;
        while (this.willT > 0.06) {
          this.willT -= 0.06;
          const a = rnd() * Math.PI * 2, r = 0.3 + rnd() * 0.3;
          b.reset().at(w.x + Math.sin(a) * r, w.y + rnd() * 1.7, w.z + Math.cos(a) * r).vel(0, 1.6 + rnd(), 0).size(0.22, 0.22, 1, 0.05, 0.05, 1).span(0.5).col(rnd() < 0.55 ? GOLD : WILL_EMBER, 2).fade(0.1, 0.6);
          fx.emit('ember');
        }
      }
    }
    if (this.kingDarkT > 0) this.kingDarkT = Math.max(0, this.kingDarkT - dt);
    if (this.formDarkT > 0) this.formDarkT = Math.max(0, this.formDarkT - dt);
    this.stepFormQueue(dt);
    const f = this.auraF;
    if (!f) return;
    if (f.awakenT <= 0) { this.auraF = null; return; }
    this.auraT += dt;
    const fx = this.host.fx, b = fx.brush;
    while (this.auraT > 0.045) {
      this.auraT -= 0.045;
      const a = rnd() * Math.PI * 2, r = 0.35 + rnd() * 0.35;
      b.reset().at(f.x + Math.sin(a) * r, f.y + rnd() * 1.6, f.z + Math.cos(a) * r).vel(0, 2.2 + rnd() * 1.6, 0).rot(0, 0, rnd() * 6).size(0.26, 0.26, 1, 0.06, 0.06, 1).span(0.55).col(rnd() < 0.5 ? this.auraCol : this.auraAcc, 2.2).fade(0.1, 0.6);
      b.flicker = 0.3;
      fx.emit('ember');
      if (rnd() < 0.08) this.boltBetween(f.x + (rnd() - 0.5), f.y + 0.4 + rnd() * 1.4, f.z + (rnd() - 0.5), f.x + (rnd() - 0.5) * 1.6, f.y + 0.6 + rnd() * 1.6, f.z + (rnd() - 0.5) * 1.6, this.auraAcc, 1.6, 0.08, 0.5);
    }
  }

  /** Augen-Leuchten in der Zwischensequenz (zwei kurze Lichtpunkte je Bild) */
  /**
   * Augen-Leuchten (je gezeichnetem Bild). `life` = Lebensdauer in Spielzeit, etwa anderthalb Bilder: früher lebte jeder Glanzpunkt 0,03 s
   * Spielzeit – in der Zeitlupe (0,14) dreizehn Bilder lang –, die Punkte stapelten sich additiv und überstrahlten das ganze Gesicht (4.6C).
   */
  eyeGlow(lx: number, ly: number, lz: number, rx: number, ry: number, rz: number, k: number, color: Color, life = 0.03) {
    if (k < 0.02) return;
    const fx = this.host.fx, b = fx.brush;
    const s = 0.022 + 0.026 * k;
    b.reset().at(lx, ly, lz).size(s, s, s).span(life).col(color, 2.4 * k).fade(0, 0);
    fx.emit('orb');
    b.reset().at(rx, ry, rz).size(s, s, s).span(life).col(color, 2.4 * k).fade(0, 0);
    fx.emit('orb');
  }

  /** Farbe des laufenden Aufladens (Augen) */
  get chargeColor(): Color { return this.charge.on ? this.charge.acc : this.casts.find((c) => c.on)?.acc ?? WHITE; }
  /** Dieselbe Farbe als Text (Aura-Glühen des Overlays; einmal je Ultimate gebildet) */
  chargeHex = '#ffffff';
}
