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

/** Was die Regie von der Welt braucht (SeaWorld baut es) */
export interface CataclysmHost {
  readonly fx: CataclysmFx;
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
  /** Meeresgraben aktiv */
  trench: boolean;
  seed: number;
}

const V = new Vector3();
const WHITE = new Color(1, 1, 1);
const GOLD = new Color('#FFD27A');
const DARK = new Color(0, 0, 0);
const FROST = new Color('#BFEFFF');
const SPRAY = new Color('#DDF4FF');
const TMP = new Color();
const HEXC = new Map<string, Color>();
const smooth = (k: number) => { const v = k < 0 ? 0 : k > 1 ? 1 : k; return v * v * (3 - 2 * v); };
const rnd = Math.random;

/** Dauer eines Ultimates in der Welt (s nach dem Einschlag) */
export const CATACLYSM_DUR: Record<CataclysmKind, number> = {
  horizonCut: 1.6, sevenSeas: 2.2, sawCyclone: 2.1, iaiWorldBreak: 1.4, fistStorm: 1.9, oceanSplit: 6.2, blackHole: 2.6, fireDragons: 2.9,
  glacier: 2.7, floodDragon: 2.7, vacuumStorm: 2.7, thunderJudgment: 2.6, sunDance: 2.5, bloodMoon: 2.7,
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
    case 'sunDance': return s.reach + 80;
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
    col: new Color(), acc: new Color(), step: 0, tick: 0, hit: [], trench: false, seed: 1,
  }));
  /** Aufladen (Zwischensequenz) */
  private charge = { on: false, t: 0, dur: 0.75, x: 0, y: 0, z: 0, yaw: 0, col: new Color(), acc: new Color(), kind: 'horizonCut' as CataclysmKind, f: null as FighterState | null, tick: 0 };
  private rift = 0;
  private riftCol = new Color();
  private readonly ships: EnemyShip[] = [];
  /** Aura des Sturm-Erwachens: Farbe und Takt */
  private auraF: FighterState | null = null;
  private auraT = 0;
  private auraCol = new Color();
  private auraAcc = new Color();
  /** Zahlen für Prüfungen */
  readonly stats = { strikes: 0, splits: 0, disabled: 0, shipHits: 0, pulls: 0, trench: 0, waves: 0, chains: 0, swings: 0, clashes: 0 };
  private seed = 1;
  /** Säbel: Mündungen der Geister-Armada (x, y, z je Geschütz), beim Aufladen hinter die Figur gestellt */
  private readonly armada = new Float32Array(3 * 16);
  private armadaN = 0;
  /** Zeit zwischen Zwischensequenz und Einschlag (Spielzeit): Säbel-Blitze beim Sprung, Aufstieg in die Gewitterwolke */
  private readonly pre = { on: false, t: 0, tick: 0, kind: 'horizonCut' as CataclysmKind, f: null as FighterState | null, acc: new Color(), cloudY: 0 };
  /** Verdunkeln des Bildes (Blutmond, Gewitter, Schwarzes Loch) */
  private dark = 0;
  /** Teilchenfaktor der Grafikstufe (setzt SeaWorld): Stürme aus hunderten Teilen werden auf schwachen Geräten dünner */
  detailK = 1;

  constructor(private host: CataclysmHost) {}

  private color(hex: string): Color { let c = HEXC.get(hex); if (!c) { c = new Color(hex); HEXC.set(hex, c); } return c; }
  get active(): boolean { return this.charge.on || this.casts.some((c) => c.on); }

  // ---------- Aufladen (Mini-Zwischensequenz) ----------

  /** Ultimate ausgelöst: Energie sammelt sich (läuft in Spielzeit, also fast stillstehend in der Zeitlupe; die Effekte bekommen Echtzeit-Dauer) */
  /** `shot` = tatsächliche Einstellung der Sequenz (an Deck wird aus der Untersicht die Nahaufnahme, siehe `SeaWorld.ultimateBegins`) */
  beginCharge(spec: UltimateSpec, f: FighterState, realDur: number, shot: UltimateSpec['shot'] = spec.shot) {
    const c = this.charge;
    c.on = true; c.t = 0; c.dur = realDur; c.x = f.x; c.y = f.y; c.z = f.z; c.yaw = f.yaw; c.kind = spec.kind; c.f = f; c.tick = 0;
    c.col.copy(this.color(spec.color)); c.acc.copy(this.color(spec.accent));
    this.riftCol.copy(c.col);
    this.chargeHex = spec.accent;
    const fx = this.host.fx, b = fx.brush;
    // (Lebensdauern in Spielzeit: in der Zeitlupe vergehen davon nur 0,105 s, der Rest nach dem Einschlag)
    // Lichtsäule aus dem aufreißenden Himmel auf die Figur. Bei der Nahaufnahme stand sie zwischen Kamera und Gesicht und überstrahlte es
    // (4.6C): dort schlägt sie erst zum Einschlag herab, die Sequenz zeigt das Gesicht mit leuchtenden Augen klar
    b.reset().at(f.x, f.y, f.z).size(0.15, 140, 0.15, 0.8, 140, 0.8).span(1, shot === 'face' ? spec.charge * 0.92 : 0).col(c.col, 0.75).fade(0.12, 0.4);
    fx.emit('column');
    b.reset().at(f.x, f.y + 0.05, f.z).size(1, 1, 1, 6, 1, 6).span(0.8).col(c.acc, 1.6).fade(0.1, 0.5).spin(2.4);
    fx.emit('ring');
    // Bodensiegel
    this.host.combatFx?.sigil(V.set(f.x, f.y + 0.05, f.z), 4.5, '#' + c.col.getHexString(), 1.6);
    const pr = this.pre;
    pr.on = true; pr.t = 0; pr.tick = 0; pr.kind = spec.kind; pr.f = f; pr.acc.copy(c.acc); pr.cloudY = f.y + 20;
    const life = spec.charge + spec.strikeAt + CATACLYSM_DUR[spec.kind] * 0.75;
    if (spec.kind === 'sevenSeas') {
      // Geister-Armada: drei Reihen goldener Schiffsgeschütze erscheinen im Bogen hinter der Figur
      this.armadaN = 0;
      for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) {
        const a = f.yaw + Math.PI + (i - 2) * 0.34;
        const r = 10 + row * 4;
        const gx = f.x + Math.sin(a) * r, gz = f.z + Math.cos(a) * r, gy = f.y + 5 + row * 3.4 + Math.abs(i - 2) * 0.6;
        b.reset().at(gx, gy, gz).rot(f.yaw, -0.18, 0).size(0.2, 0.2, 0.2, 2.6 + row * 0.4, 2.6 + row * 0.4, 2.6 + row * 0.4).span(life, spec.charge * 0.85).col(row === 1 ? c.acc : GOLD, 1.7).fade(0.08, 0.15);
        b.flicker = 0.12;
        fx.emit('cannon');
        const k = this.armadaN++;
        this.armada[k * 3] = gx + Math.sin(f.yaw) * 2.6; this.armada[k * 3 + 1] = gy; this.armada[k * 3 + 2] = gz + Math.cos(f.yaw) * 2.6;
      }
    } else if (spec.kind === 'thunderJudgment') {
      // die Gewitterwolke über dem Schlachtfeld, zu der die Figur aufsteigt (Unterseite ~19,4 m über dem Start: die Kamera folgt der Figur
      // bis gut 16 m hinauf und darf nie in die Wolke geraten)
      b.reset().at(f.x, f.y + 21, f.z).rot(rnd() * 6).size(4, 3, 4, 34, 26, 34).span(life, spec.charge * 0.6).col(TMP.setRGB(0.36, 0.38, 0.47), 1).fade(0.15, 0.25);
      b.ease = 1;
      fx.emit('cloud');
      b.reset().at(f.x, f.y + 19.1, f.z).rot(rnd() * 6).size(3, 1, 3, 26, 1, 26).span(life, spec.charge * 0.6).col(c.acc, 0.6).fade(0.15, 0.25).spin(0.4);
      b.flicker = 0.5;
      fx.emit('ring');
    }
  }

  /** Je Bild in ECHTZEIT während des Aufladens (die Spielzeit steht fast): Energie strömt heran, Aura-Blitze, Luft-Risse */
  private stepCharge(realDt: number) {
    const c = this.charge;
    if (!c.on) return;
    c.t += realDt;
    const f = c.f;
    if (f) { c.x = f.x; c.y = f.y; c.z = f.z; }
    const fx = this.host.fx, b = fx.brush;
    const u = Math.min(1, c.t / c.dur);
    this.rift = Math.max(this.rift, smooth(u * 1.6));
    c.tick += realDt;
    while (c.tick > 0.035) {
      c.tick -= 0.035;
      // Energie-Funken strömen von außen auf die Figur zu (Lebensdauer in Spielzeit: die Zeitlupe verlangsamt sie, darum klein)
      const a = rnd() * Math.PI * 2, r = 5 + rnd() * 6, h = 0.3 + rnd() * 3;
      const px = c.x + Math.sin(a) * r, pz = c.z + Math.cos(a) * r;
      const k = 0.14 / 0.16;
      b.reset().at(px, c.y + h, pz).vel((c.x - px) * 6 * k, (c.y + 1.2 - (c.y + h)) * 6 * k, (c.z - pz) * 6 * k).size(0.16, 0.16, 0.16, 0.05, 0.05, 0.05).span(0.024).col(rnd() < 0.5 ? c.col : c.acc, 3).fade(0.2, 0.3);
      fx.emit('orb');
      // Aura-Blitze um die Figur: auf einem Ring außerhalb der Nahaufnahme (1,2 m), sonst zucken sie vor dem Gesicht und überstrahlen es
      if (rnd() < 0.35) {
        const a0 = rnd() * Math.PI * 2, r0 = 1.6 + rnd() * 1.2, a1 = a0 + (rnd() - 0.5) * 1.2, r1 = 1.6 + rnd() * 1.6;
        this.boltBetween(c.x + Math.sin(a0) * r0, c.y + rnd() * 2.4, c.z + Math.cos(a0) * r0, c.x + Math.sin(a1) * r1, c.y + 0.5 + rnd() * 2.5, c.z + Math.cos(a1) * r1, c.acc, 2.4, 0.02, 0.25);
      }
      // Luft-Risse: helle, scharfe Linien, die in der Luft stehen bleiben
      if (rnd() < 0.18) {
        const ra = rnd() * Math.PI * 2, rr = 2 + rnd() * 4;
        const x0 = c.x + Math.sin(ra) * rr, z0 = c.z + Math.cos(ra) * rr, y0 = c.y + 0.6 + rnd() * 3;
        this.boltBetween(x0, y0, z0, x0 + (rnd() - 0.5) * 2.5, y0 + (rnd() - 0.5) * 2.5, z0 + (rnd() - 0.5) * 2.5, WHITE, 3, 0.12, 0.6);
      }
    }
    if (c.t >= c.dur + 0.2) c.on = false;
  }

  // ---------- Einschlag ----------

  /** Einschlag eines Ultimates (Ereignis `ultStrike`; beim Iaijutsu ist das zugleich das Einrasten der Klinge) */
  strike(spec: UltimateSpec, f: FighterState, startX?: number, startZ?: number) {
    let c = this.casts.find((k) => !k.on);
    if (!c) c = this.casts[0];
    c.on = true; c.kind = spec.kind; c.spec = spec; c.f = f; c.t = 0; c.step = 0; c.tick = 0; c.hit.length = 0; c.trench = false;
    c.x = f.x; c.y = f.y; c.z = f.z; c.yaw = f.yaw;
    c.cx = f.x + Math.sin(f.yaw) * spec.center; c.cz = f.z + Math.cos(f.yaw) * spec.center;
    c.sx = startX ?? f.x; c.sz = startZ ?? f.z;
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
    this.begin(c);
  }

  /** Startbilder je Ultimate */
  private begin(c: Cast) {
    const fx = this.host.fx, b = fx.brush, s = c.spec!;
    const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
    switch (c.kind) {
      case 'horizonCut': {
        // 180 m breite Energiewand rast über den Horizont (drei Schichten: weißer Kern, Farbe, Saum)
        b.reset().at(c.x, c.y - 2, c.z).rot(c.yaw).size(6, 8, 6, s.reach, 30, s.reach).span(0.95).col(WHITE, 2.6).fade(0.03, 0.45);
        fx.emit('arc');
        b.reset().at(c.x, c.y - 4, c.z).rot(c.yaw).size(5, 12, 5, s.reach * 0.97, 44, s.reach * 0.97).span(1.1).col(c.col, 2).fade(0.03, 0.5);
        fx.emit('arc');
        b.reset().at(c.x, c.y - 1, c.z).rot(c.yaw).size(4, 4, 4, s.reach * 1.02, 16, s.reach * 1.02).span(1.2).col(c.acc, 2.2).fade(0.03, 0.55);
        fx.emit('arc');
        // Horizontlinie: flache Sichel bis zum Rand
        b.reset().at(c.x, c.y + 1.4, c.z).rot(c.yaw).size(6, 1, 6, s.reach * 1.05, 1, s.reach * 1.05).span(0.9).col(WHITE, 3).fade(0.02, 0.5);
        fx.emit('blade');
        break;
      }
      case 'oceanSplit': {
        // Meer oder Land? Stichproben entlang der Linie
        let water = 0;
        for (let i = 1; i <= 8; i++) { const d = (s.reach * i) / 8; if (!this.host.isLand(c.x + fwdX * d, c.z + fwdZ * d)) water++; }
        c.trench = water >= 4;
        if (c.trench) this.stats.trench++;
        break;
      }
      case 'blackHole': {
        const cy = c.y + 3;
        b.reset().at(c.cx, cy, c.cz).size(0.2, 0.2, 0.2, 4.6, 4.6, 4.6).span(2.5).col(DARK, 1).fade(0.12, 0.12);
        fx.emit('void');
        b.reset().at(c.cx, cy, c.cz).rot(0, 0.35, 0).size(2, 1, 2, 10, 1, 10).span(2.5).col(c.col, 2.4).fade(0.1, 0.15).spin(4.5);
        fx.emit('ring');
        b.reset().at(c.cx, cy, c.cz).rot(0, -0.25, 0.2).size(3, 1, 3, 14, 1, 14).span(2.5).col(c.acc.r > 0.2 ? c.acc : c.col, 1.4).fade(0.1, 0.15).spin(-3);
        fx.emit('ring');
        // dritte, steile Ebene der Akkretionsscheibe (kein Lichthof über dem Kern: der Abgrund bleibt schwarz)
        b.reset().at(c.cx, cy, c.cz).rot(0.6, 1.2, 0).size(4, 1, 4, 7.5, 1, 7.5).span(2.5).col(WHITE, 1.1).fade(0.1, 0.15).spin(0, 0, 5);
        b.flicker = 0.3;
        fx.emit('ring');
        break;
      }
      case 'sevenSeas': case 'fistStorm': case 'fireDragons': case 'glacier': case 'floodDragon': case 'vacuumStorm':
      case 'thunderJudgment': case 'sunDance': case 'bloodMoon':
        this.beginUlt(c);
        break;
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
        break;
      }
      default: break;
    }
    // Schiffe im Wirkungsbereich einsammeln (zerteilt/getroffen wird im Takt der Zeitachse)
    const nav = this.host.naval;
    if (nav) {
      const r = shipReach(c.kind, s);
      nav.cataclysmShips(c.kind === 'blackHole' ? c.cx : c.x, c.kind === 'blackHole' ? c.cz : c.z, r, this.ships);
      if (c.kind === 'iaiWorldBreak') this.iaiShips(c);
    }
  }

  // ---------- Zeitachsen ----------

  /** Je Bild: `dt` Spielzeit (Effekte verlangsamen in der Zeitlupe mit), `realDt` Echtzeit (Aufladen, Himmel) */
  update(dt: number, realDt: number) {
    this.stepCharge(realDt);
    this.stepPre(dt);
    for (const c of this.casts) if (c.on) this.stepCast(c, dt);
    this.stepAura(dt);
    // Verdunkeln: Blutmond-Finsternis, Gewitterwolke, Schwarzes Loch (weich hinein und heraus)
    let dk = 0;
    for (const c of this.casts) {
      if (!c.on) continue;
      const env = Math.min(1, c.t / 0.25) * Math.min(1, Math.max(0, CATACLYSM_DUR[c.kind] - c.t) / 0.6);
      const k = c.kind === 'bloodMoon' ? 0.6 : c.kind === 'thunderJudgment' ? 0.42 : c.kind === 'blackHole' ? 0.28 : 0;
      dk = Math.max(dk, k * env);
    }
    if (this.pre.on && this.pre.kind === 'thunderJudgment') dk = Math.max(dk, 0.3);
    this.dark += (dk - this.dark) * Math.min(1, realDt * 5);
    if (this.dark < 0.002) this.dark = 0;
    this.host.darken?.(this.dark);
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
    switch (c.kind) {
      case 'horizonCut': {
        // Wellenfront wie die Energiewand: zerteilt Schiffe beim Durchgang (Bug und Heck), sonst schwerer Schaden
        const front = s.reach * (1 - (1 - Math.min(1, t / 0.95)) ** 2);
        for (const e of this.ships) {
          if (c.hit.includes(e)) continue;
          const dx = e.ship.x - c.x, dz = e.ship.z - c.z;
          const along = dx * fwdX + dz * fwdZ, across = Math.abs(dx * fwdZ - dz * fwdX);
          if (along < -e.ship.cls.L * 0.5 || across > s.width * 0.5 + e.ship.cls.L * 0.5 || along > front) continue;
          this.shipStrike(c, e, 'cross');
        }
        if (c.tick > 0.05 && t < 0.9) {
          c.tick = 0;
          // Gischt und Funken an der Front
          const fr = front;
          for (let i = 0; i < 3; i++) {
            const a = c.yaw + (rnd() - 0.5) * 2.4;
            const px = c.x + Math.sin(a) * fr, pz = c.z + Math.cos(a) * fr;
            b.reset().at(px, this.host.waterY(px, pz), pz).rot(a).size(4, 2, 1, 10, 7 + rnd() * 5, 1).span(0.6).col(SPRAY, 0.5).fade(0.05, 0.6);
            fx.emit('wall');
          }
        }
        break;
      }
      case 'sevenSeas': this.stepSevenSeas(c, t0, t); break;
      case 'sawCyclone': {
        if (f && t < 1.9) {
          // Der Klingen-Wirbel zieht entlang der Blickrichtung voran (volle Reichweite in 1,7 s); die Figur dasht mit, soweit der Boden
          // es erlaubt – steht sie an Deck an der Reling, sägt der Wirbel allein weiter
          const prog = Math.min(1, t / 1.7);
          const pd = Math.hypot(f.x - c.x, f.z - c.z);
          const d = Math.max(pd, s.reach * prog);
          const wx = c.x + fwdX * d, wz = c.z + fwdZ * d;
          const wy = d > pd + 2 ? this.host.waterY(wx, wz) : f.y;
          if (c.tick > 0.03) {
            c.tick = 0;
            for (let i = 0; i < 3; i++) {
              const a = rnd() * Math.PI * 2;
              b.reset().at(wx, wy + 0.3 + rnd() * 3, wz).rot(a, 0, (rnd() - 0.5) * 0.5).size(2.6, 1, 2.6, 4.4, 1, 4.4).span(0.18).col(i ? c.col : WHITE, 2.4).fade(0.02, 0.6).spin(18);
              fx.emit('blade');
            }
            b.reset().at(wx, wy + 0.2, wz).size(2.5, 1, 2.5, 4.8, 1, 4.8).span(0.3).col(c.acc, 1.5).fade(0.05, 0.6).vel(0, 6, 0);
            fx.emit('ring');
          }
          // Schiffe, durch die sich der Wirbel sägt: der Länge nach
          for (const e of this.ships) {
            if (c.hit.includes(e)) continue;
            if (this.capsuleNear(e, wx, wz, s.width * 0.5)) this.shipStrike(c, e, 'length');
          }
        }
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
      case 'sunDance': this.stepSunDance(c, t0, t); break;
      case 'bloodMoon': this.stepBloodMoon(c, t0, t); break;
      default: break;
    }
    if (t >= CATACLYSM_DUR[c.kind]) this.end(c);
  }

  private end(c: Cast) {
    c.on = false;
    if (c.trench) { this.host.setTrench(0, 0, 0, 0, 0, 0); c.trench = false; }
  }

  /** Alles abbrechen (Szenenwechsel, Raid-Start) */
  reset() {
    for (const c of this.casts) if (c.on) this.end(c);
    this.charge.on = false;
    this.pre.on = false;
    this.rift = 0;
    this.dark = 0;
    this.host.darken?.(0);
    this.auraF = null;
    this.host.setRift(0, 0, 0, 0, this.riftCol);
    this.host.fx.clear();
  }

  // ---------- Erdspalter: Ozean-Teilung oder aufgerissener Boden ----------

  private stepOcean(c: Cast, t0: number, t: number) {
    const s = c.spec!;
    const fx = this.host.fx, b = fx.brush;
    const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
    const ax = c.x + fwdX * 4, az = c.z + fwdZ * 4, bx = c.x + fwdX * s.reach, bz = c.z + fwdZ * s.reach;
    if (c.trench) {
      // Graben öffnet sich (0,35 s), steht, schließt sich (1,2 s)
      const open = smooth(t / 0.35), close = 1 - smooth((t - 4.8) / 1.2);
      const depth = s.trench * Math.min(open, close);
      this.host.setTrench(ax, az, bx, bz, s.width * 0.5, depth);
      if (t0 === 0 && t > 0) {
        // Wasserwände an beiden Rändern (genau einmal: früher feuerte die Bedingung in mehreren kleinen Zeitlupen-Schritten)
        const n = Math.round(s.reach / 6);
        for (let i = 0; i < n; i++) {
          const d = 6 + ((s.reach - 8) * i) / n;
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
        const d = 6 + rnd() * (s.reach - 8), side = rnd() < 0.5 ? -1 : 1;
        const wx = c.x + fwdX * d + fwdZ * side * s.width * 0.5, wz = c.z + fwdZ * d - fwdX * side * s.width * 0.5;
        b.reset().at(wx, 1, wz).rot(c.yaw).vel(-fwdZ * side * 3, -2, fwdX * side * 3).size(4, 3, 1, 6, 7, 1).span(0.8).col(SPRAY, 0.4).fade(0.1, 0.6);
        fx.emit('wall');
      }
      // Schiffe im Graben: schwerer Schaden (sie sinken mit dem Wasser ab: heightAt kennt den Graben)
      if (t0 < 0.3 && t >= 0.3) for (const e of this.ships) {
        const dx = e.ship.x - c.x, dz = e.ship.z - c.z;
        const along = dx * fwdX + dz * fwdZ, across = Math.abs(dx * fwdZ - dz * fwdX);
        if (along > -e.ship.cls.L * 0.5 && along < s.reach + e.ship.cls.L * 0.5 && across < s.width * 0.5 + e.ship.cls.W) this.shipDamage(c, e, 1.2);
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
        if (i % 3 === 0) this.host.combatFx?.crack(V.set(c.x + fwdX * d, this.host.groundY(c.x + fwdX * d, c.z + fwdZ * d, c.y) + 0.05, c.z + fwdZ * d), 3.5);
      }
      this.host.shake(1.3);
    }
  }

  // ---------- Schwarzes Loch ----------

  private stepBlackHole(c: Cast, t0: number, t: number, dt: number) {
    const s = c.spec!;
    const fx = this.host.fx, b = fx.brush;
    const cy = c.y + 3;
    if (t < 2.2) {
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
      // Schiffe und Trümmer ansaugen; was den Kern erreicht, zerbricht (radial)
      const nav = this.host.naval;
      const pullR = s.reach + 30;
      if (nav) for (const e of this.ships) {
        if (c.hit.includes(e) || e.ship.sinking > 0) continue;
        const d = Math.hypot(e.ship.x - c.cx, e.ship.z - c.cz);
        if (d > pullR + e.ship.cls.L * 0.5) continue;
        nav.cataclysmPull(e, c.cx, c.cz, s.shipPull * dt * (1.3 - Math.min(1, d / pullR) * 0.6));
        this.stats.pulls++;
        if (d < 6 + e.ship.cls.L * 0.35 || t > 2.05) this.shipStrike(c, e, 'radial');
      }
      this.host.debris?.pull(c.cx, cy, c.cz, s.reach, 14 * dt);
    }
    if (t0 < 2.15 && t >= 2.15) {
      // Kollaps: Lichtblitz und Druckring
      b.reset().at(c.cx, cy, c.cz).size(1, 1, 1, 14, 14, 14).span(0.45).col(WHITE, 2.4).fade(0.01, 0.8);
      fx.emit('orb');
      b.reset().at(c.cx, cy - 2.5, c.cz).size(4, 1, 4, s.reach, 1, s.reach).span(0.8).col(c.col, 2.2).fade(0.01, 0.7);
      fx.emit('ring');
      this.host.shake(1.2);
    }
  }

  // ---------- Schiffe ----------

  /** Zerteilen, wenn erlaubt; sonst schwerer Schaden (Boss-Schiffe über 15 %, Legenden) */
  private shipStrike(c: Cast, e: EnemyShip, cut: Exclude<ShipCut, ''>, lift = 0) {
    const nav = this.host.naval;
    if (!nav || c.hit.includes(e)) return;
    c.hit.push(e);
    const r = nav.cataclysmSplit(e, cut, c.seed + c.hit.length, lift);
    if (r === 'split') {
      this.stats.splits++;
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
        for (let i = 0; i < 14; i++) {
          const d = 5 + (len - 5) * (i / 13), px = c.x + fwdX * d + (rnd() - 0.5) * 6, pz = c.z + fwdZ * d + (rnd() - 0.5) * 6;
          const gy = this.host.groundY(px, pz, c.y);
          this.boltBetween(px + (rnd() - 0.5) * 8, gy + 60, pz + (rnd() - 0.5) * 8, px, gy, pz, i % 2 ? GOLD : c.acc, 9, 0.45, 0.3);
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
        this.areaShips(c, c.x, c.z, s.reach, 0.4, 'freeze');
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
      case 'sunDance': {
        // Sonne im Zenit über der Figur
        b.reset().at(c.x, c.y + 16, c.z).size(0.5, 0.5, 0.5, 4.6, 4.6, 4.6).span(2.4).col(c.col, 3.2).fade(0.08, 0.3);
        b.flicker = 0.12;
        fx.emit('orb');
        this.sound('sunChoir', 1, c.x, c.y, c.z);
        break;
      }
      case 'bloodMoon': {
        // riesiger Blutmond mit Halo hinter der Figur am verdunkelten Himmel
        const mx = c.x - fwdX * 70, mz = c.z - fwdZ * 70;
        b.reset().at(mx, c.y + 44, mz).size(4, 4, 4, 24, 24, 24).span(2.6).col(c.col, 1.7).fade(0.1, 0.3);
        fx.emit('orb');
        b.reset().at(mx, c.y + 44, mz).rot(c.yaw, Math.PI / 2, 0).size(22, 1, 22, 34, 1, 34).span(2.6).col(c.acc, 1.5).fade(0.1, 0.3).spin(0, 0, 0.6);
        fx.emit('ring');
        b.reset().at(mx, c.y + 44, mz).rot(c.yaw, Math.PI / 2, 0).size(30, 1, 30, 44, 1, 44).span(2.6).col(c.col, 0.8).fade(0.1, 0.3).spin(0, 0, -0.4);
        fx.emit('ring');
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
      const at = 0.05 + v * 0.26;
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
        this.boltBetween(mx, my, mz, tx, ty + 0.5, tz, i % 3 ? GOLD : c.acc, 6, 0.24, 0.35);
        this.explode(tx, ty, tz, 2.4, i % 2 ? GOLD : c.acc, !ship && this.host.isLand(tx, tz), 160);
      }
      this.sound('ghostVolley', 1, c.cx, c.y, c.cz);
      this.host.shake(0.8);
      // letzte Salve: Kriegsschiffe kentern (jedes zweite) oder brechen auseinander, alle anderen nehmen schweren Schaden
      if (v === 2) this.ships.forEach((e, i) => this.shipStrike(c, e, i % 2 ? 'cross' : 'capsize'));
    }
  }

  /** Sturmfaust – Zehntausend-Hiebe-Orkan: eine Kegel-Flut aus hunderten Geister-Fäusten und Überschall-Druckringen */
  private stepFistStorm(c: Cast, t0: number, t: number) {
    const s = c.spec!, f = c.f, fx = this.host.fx, b = fx.brush;
    if (f && t < 1.5 && c.tick > 0.016) {
      c.tick = 0;
      const fwX = Math.sin(f.yaw), fwZ = Math.cos(f.yaw);
      const n = Math.round(9 * this.detailK);
      for (let i = 0; i < n; i++) {
        const a = f.yaw + (rnd() - 0.5) * 1.25, up = (rnd() - 0.4) * 0.5, sp = 30 + rnd() * 18;
        const sz = 0.55 + rnd() * 1.1;
        const ox = f.x + fwX * 0.8 + (rnd() - 0.5) * 1.6, oy = f.y + 0.7 + rnd() * 1.6, oz = f.z + fwZ * 0.8 + (rnd() - 0.5) * 1.6;
        b.reset().at(ox, oy, oz).rot(a, -up, (rnd() - 0.5) * 0.8).size(sz, sz, sz, sz * 1.25, sz * 1.25, sz * 1.6).vel(Math.sin(a) * sp, up * sp * 0.5, Math.cos(a) * sp).span((s.reach * (0.45 + rnd() * 0.55)) / sp).col(i % 3 ? c.col : c.acc, 2.2).fade(0.02, 0.35);
        b.ease = 0;
        fx.emit('fist');
      }
      // Überschall-Druckring vor der Figur
      if (rnd() < 0.35) {
        b.reset().at(f.x + fwX * 1.5, f.y + 1.2, f.z + fwZ * 1.5).rot(f.yaw, Math.PI / 2, 0).size(0.6, 1, 0.6, 3.6, 1, 3.6).vel(fwX * 26, 0, fwZ * 26).span(0.42).col(WHITE, 1.6).fade(0.02, 0.6);
        fx.emit('ring');
      }
      // Einschläge im Kegel
      const ia = f.yaw + (rnd() - 0.5) * 1.2, id = 4 + rnd() * s.reach;
      const ix = f.x + Math.sin(ia) * id, iz = f.z + Math.cos(ia) * id;
      b.reset().at(ix, this.host.groundY(ix, iz, f.y) + 0.8 + rnd(), iz).size(0.3, 0.3, 0.3, 1.4, 1.4, 1.4).span(0.14).col(WHITE, 2.4).fade(0.01, 0.6);
      fx.emit('orb');
      // durchlöcherte Schiffe im Kegel
      for (const e of this.ships) {
        if (e.ship.sinking > 0) continue;
        const dx = e.ship.x - f.x, dz = e.ship.z - f.z, d = Math.hypot(dx, dz);
        if (d > s.reach * 1.5 + e.ship.cls.L * 0.5 || (dx * fwX + dz * fwZ) / Math.max(1, d) < 0.55) continue;
        if (rnd() < 0.25) e.ship.punchHoles(1);
      }
    }
    if (t0 < 1.55 && t >= 1.55 && f) {
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
        if (d > s.reach * 1.5 + e.ship.cls.L * 0.5 || (dx * fwX + dz * fwZ) / Math.max(1, d) < 0.5) continue;
        e.ship.punchHoles(4);
        this.shipStrike(c, e, 'sink');
      }
    }
  }

  /** Feuer – Purpur-Sonneninferno: ein Feuerdrachen-Wirbelsturm fegt über Land und Meer, Lavarisse bleiben zurück, Schiffe brennen */
  private stepFireDragons(c: Cast, t0: number, t: number) {
    const s = c.spec!, fx = this.host.fx, b = fx.brush;
    const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
    const u = Math.min(1, t / 2.3);
    const d = 3 + u * (s.reach + 12);
    const sway = Math.sin(t * 2.6) * 6;
    const wx = c.x + fwdX * d + fwdZ * sway, wz = c.z + fwdZ * d - fwdX * sway;
    const wy = this.host.groundY(wx, wz, c.y);
    if (t < 2.4 && c.tick > 0.03) {
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
      // Spur: Lavarisse an Land, Dampf auf dem Wasser
      if (this.host.isLand(wx, wz)) { if (rnd() < 0.35) { this.host.combatFx?.crack(V.set(wx, wy + 0.05, wz), 3.4); this.host.combatFx?.burn(V.set(wx, wy + 0.05, wz), 3); } }
      else if (rnd() < 0.5) { b.reset().at(wx + (rnd() - 0.5) * 6, wy, wz + (rnd() - 0.5) * 6).rot(rnd() * 6).size(4, 2, 1, 7, 9, 1).span(1).col(SPRAY, 0.35).fade(0.1, 0.6); fx.emit('wall'); }
    }
    // Schiffe am Wirbel fangen Feuer
    for (const e of this.ships) {
      if (c.hit.includes(e) || e.ship.sinking > 0) continue;
      if (Math.hypot(e.ship.x - wx, e.ship.z - wz) - e.ship.cls.L * 0.5 > s.width * 0.6) continue;
      c.hit.push(e);
      e.ship.fire = Math.max(e.ship.fire, 14);
      this.shipDamage(c, e, 1.1);
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
    if (t0 < 1.2 && t >= 1.2) {
      // Zerspringen: zweites Impact-Bild, Splitterwolke, Druckring
      this.host.impactFrames?.(3);
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
    const u = Math.min(1, t / 1.7);
    const d = 2 + u * (s.reach + 8);
    if (t0 === 0 && t > 0) {
      // die Welle selbst: drei Schichten einer gebogenen Wasserwand, die mit dem Drachen voranrollt
      const sp = (s.reach + 6) / 1.7;
      for (let k = 0; k < 3; k++) {
        b.reset().at(c.x - fwdX * 2, c.y - 1.5 + k * 0.4, c.z - fwdZ * 2).rot(c.yaw).size(4, 4, 4, s.width * 0.55 + k * 2, 13 - k * 3, s.width * 0.55 + k * 2).vel(fwdX * sp, 0, fwdZ * sp).span(1.9).col(k === 1 ? WHITE : c.col, k === 1 ? 0.9 : 1.4).fade(0.08, 0.35);
        b.ease = 1;
        fx.emit('arc');
      }
    }
    if (t < 1.8 && c.tick > 0.024) {
      c.tick = 0;
      // Drachenkopf auf dem Wellenkamm: Wasserkugeln als Leib, zwei Hörner, Gischt an den Flanken
      const sw = Math.sin(t * 8) * 3.5;
      const hx = c.x + fwdX * d + fwdZ * sw, hz = c.z + fwdZ * d - fwdX * sw, hy = c.y + 9 + Math.sin(t * 6) * 1.5;
      b.reset().at(hx, hy, hz).size(2.8, 2.8, 2.8, 0.8, 0.8, 0.8).span(0.8).col(c.col, 1.8).fade(0.02, 0.7);
      fx.emit('orb');
      b.reset().at(hx, hy, hz).size(1.4, 1.4, 1.4, 0.4, 0.4, 0.4).span(0.5).col(WHITE, 1.6).fade(0.02, 0.7);
      fx.emit('orb');
      if (rnd() < 0.3) for (const side of [-1, 1]) { b.reset().at(hx + fwdZ * side * 1.4, hy + 1.6, hz - fwdX * side * 1.4).rot(c.yaw, -0.6, side * 0.4).size(0.6, 2.6, 0.6).span(0.25).col(WHITE, 1.4).fade(0.02, 0.6); fx.emit('shard'); }
      for (const side of [-1, 1]) {
        const wx = c.x + fwdX * d + fwdZ * side * s.width * 0.4, wz = c.z + fwdZ * d - fwdX * side * s.width * 0.4;
        b.reset().at(wx, this.host.waterY(wx, wz) - 0.5, wz).rot(c.yaw + Math.PI / 2).size(6, 2, 1, 10, 9 + rnd() * 5, 1).span(0.9).col(SPRAY, 0.5).fade(0.05, 0.6);
        fx.emit('wall');
      }
    }
    // Schiffe, die die Welle erreicht: gehoben und gekentert (Kriegsschiffe bis Stufe 4), sonst schwer getroffen und fortgeschoben
    for (const e of this.ships) {
      if (c.hit.includes(e) || e.ship.sinking > 0) continue;
      const dx = e.ship.x - c.x, dz = e.ship.z - c.z;
      const along = dx * fwdX + dz * fwdZ, across = Math.abs(dx * fwdZ - dz * fwdX);
      if (along > d || along < -e.ship.cls.L || across > s.width * 0.6 + e.ship.cls.L * 0.5) continue;
      e.ship.shoveX += fwdX * 7; e.ship.shoveZ += fwdZ * 7;
      this.shipStrike(c, e, 'capsize', 4.5);
    }
  }

  /** Wind – Vakuum-Himmelssturm: ein monumentaler Tornado mit Dutzenden Vakuum-Sicheln reißt alles hoch und zerschneidet es */
  private stepVacuumStorm(c: Cast, t0: number, t: number) {
    const s = c.spec!, fx = this.host.fx, b = fx.brush;
    if (t < 2.2 && c.tick > 0.028) {
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
        b.reset().at(c.x + Math.sin(a) * r, c.y + h, c.z + Math.cos(a) * r).rot(ta, 0, (rnd() - 0.5) * 1.6).size(sz * 0.5, 1, sz * 0.5, sz, 1, sz).span(0.4 + rnd() * 0.3).col(i % 2 ? WHITE : c.acc, 2).fade(0.02, 0.5).spin(12);
        b.vx = Math.sin(ta) * sp + Math.sin(a) * 4; b.vz = Math.cos(ta) * sp + Math.cos(a) * 4; b.vy = 3 + rnd() * 5;
        fx.emit('blade');
      }
      // Trümmer und Gischt werden emporgerissen
      this.host.debris?.pull(c.x, c.y + 10, c.z, s.reach + 10, 0.6);
      if (rnd() < 0.4) { const a = rnd() * 6.28, r = rnd() * s.reach; const px = c.x + Math.sin(a) * r, pz = c.z + Math.cos(a) * r; b.reset().at(px, this.host.waterY(px, pz), pz).rot(a).size(3, 2, 1, 5, 14, 1).span(0.8).col(SPRAY, 0.35).fade(0.1, 0.6); b.vy = 6; fx.emit('wall'); }
    }
    // Schiffe im Sog des Tornados werden herangezogen und am Ende zerschnitten
    const nav = this.host.naval;
    if (nav && t < 2) for (const e of this.ships) if (!c.hit.includes(e) && e.ship.sinking <= 0) nav.cataclysmPull(e, c.x, c.z, 4 * (t - t0));
    if (t0 < 1.9 && t >= 1.9) {
      const n = Math.round(30 * this.detailK);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        b.reset().at(c.x, c.y + 1 + rnd() * 6, c.z).rot(a, 0, (rnd() - 0.5)).size(2, 1, 2, 5, 1, 5).vel(Math.sin(a) * 34, 0, Math.cos(a) * 34).span(0.8).col(WHITE, 2.2).fade(0.02, 0.5);
        fx.emit('blade');
      }
      this.host.shake(1);
      for (const e of this.ships) {
        if (Math.hypot(e.ship.x - c.x, e.ship.z - c.z) - e.ship.cls.L * 0.5 > s.reach + 14) continue;
        this.shipStrike(c, e, 'cross');
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
    // drei Wellen: Kettenblitze von der Säule auf alle Schiffe, eins zum nächsten
    for (let v = 0; v < 3; v++) {
      const at = 0.15 + v * 0.42;
      if (!(t0 < at && t >= at)) continue;
      let lx = px, ly = gy + 6, lz = pz;
      for (const e of this.ships) {
        if (e.ship.sinking > 0) continue;
        const ex = e.ship.x, ey = e.ship.model.deckY + 4, ez = e.ship.z;
        this.boltBetween(lx, ly, lz, ex, ey, ez, v % 2 ? c.acc : WHITE, 6, 0.3, 0.4);
        this.boltBetween(ex + (rnd() - 0.5) * 4, c.y + 20, ez + (rnd() - 0.5) * 4, ex, ey - 3, ez, c.col, 7, 0.3, 0.3);
        lx = ex; ly = ey; lz = ez;
        e.ship.fire = Math.max(e.ship.fire, 8);
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
    if (t < 2 && c.tick > 0.04) {
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
    if (t0 < 0.35 && t >= 0.35) {
      // Licht-Schneise: ein liegender Lichtstrahl durch das Schlachtfeld, verbrannte Erde und Dampf entlang
      const len = s.reach + 34;
      b.reset().at(ox + fwdX * 2, oy + 1.2, oz + fwdZ * 2).rot(c.yaw, Math.PI / 2, 0).size(1, len, 1, 3.4, len, 3.4).span(1.4).col(WHITE, 2.6).fade(0.02, 0.5);
      b.ease = 0;
      fx.emit('column');
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
        this.shipStrike(c, e, 'sink');
      }
    }
    if (t0 < 1.85 && t >= 1.85) {
      b.reset().at(ox, oy - 0.2, oz).size(2, 80, 2, 7, 80, 7).span(0.6).col(WHITE, 2.6).fade(0.02, 0.6);
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
    if (t < 2 && c.tick > 0.016) {
      c.tick = 0;
      const n = Math.round(6 * this.detailK);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const sz = 1.2 + rnd() * rnd() * 9;
        const sp = 18 + rnd() * 22;
        b.reset().at(ox, oy + 0.6 + rnd() * 3.5, oz).rot(a, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 1.6).size(sz * 0.5, 1, sz * 0.5, sz, 1, sz).span((s.reach + 10) / sp).col(i % 2 ? c.col : c.acc, 2.3).fade(0.02, 0.4);
        b.vx = Math.sin(a) * sp; b.vz = Math.cos(a) * sp; b.vy = (rnd() - 0.3) * 4;
        fx.emit('blade');
      }
    }
    for (let v = 0; v < 2; v++) {
      const at = 0.7 + v * 1.1;
      if (!(t0 < at && t >= at)) continue;
      b.reset().at(ox, oy + 0.2, oz).size(2, 1, 2, s.reach + 14, 1, s.reach + 14).span(0.8).col(c.col, 2).fade(0.02, 0.7);
      fx.emit('ring');
      for (const e of this.ships) {
        if (Math.hypot(e.ship.x - ox, e.ship.z - oz) - e.ship.cls.L * 0.5 > s.reach + 30) continue;
        e.ship.punchHoles(2);
        if (v === 1) this.shipStrike(c, e, 'cross'); else if (!c.hit.includes(e)) this.shipDamage(c, e, 0.3);
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
    if (p.kind === 'sevenSeas') {
      // golden-purpurne Säbel-Blitze um die springende Figur
      for (let i = 0; i < 2; i++) {
        const a0 = rnd() * Math.PI * 2, r0 = 1.5 + rnd(), a1 = a0 + (rnd() - 0.5) * 1.4, r1 = 1.6 + rnd() * 1.4;
        this.boltBetween(f.x + Math.sin(a0) * r0, f.y + 0.4 + rnd() * 1.6, f.z + Math.cos(a0) * r0, f.x + Math.sin(a1) * r1, f.y + rnd() * 3, f.z + Math.cos(a1) * r1, i ? GOLD : p.acc, 2.6, 0.08, 0.5);
      }
    } else if (p.kind === 'thunderJudgment') {
      // Blitze zwischen Figur und Wolke, die Figur steigt hinein (Fußpunkte auf einem Ring um die Figur, nicht vor dem Gesicht)
      const a = rnd() * Math.PI * 2, r = 1.6 + rnd() * 1.2, r2 = 4 + rnd() * 6;
      this.boltBetween(f.x + Math.sin(a) * r, f.y + 1, f.z + Math.cos(a) * r, f.x + Math.sin(a) * r2, p.cloudY + rnd() * 2, f.z + Math.cos(a) * r2, rnd() < 0.5 ? WHITE : p.acc, 3.5, 0.1, 0.5);
    }
  }

  // ---------- 4.6C: Schwungfenster der Kampfkünste, Klingen-Clash ----------

  /**
   * Sichtbare Wucht jedes Schwungfensters einer Technik, Verzweigung, eines Finishers oder Meteors: Linien werden zu Klingenwellen mit
   * Elementen am Boden entlang (Felsen, Eis-Stacheln, Flammen, Wasser, Blitze), Kreise zu Eruptionen, Bögen zu sichtbaren Sichelschnitten.
   */
  swingFx(h: ActionHit, f: FighterState, colorHex: string, element: string) {
    const fx = this.host.fx, b = fx.brush;
    const col = this.color(colorHex);
    const el = h.vfx || element;
    const ec = ELEMENT_COL[el] ? this.color(ELEMENT_COL[el]) : col;
    const fwdX = Math.sin(f.yaw), fwdZ = Math.cos(f.yaw);
    const dur = Math.max(0.12, h.t1 - h.t0);
    this.stats.swings++;
    if (h.projectile) {
      b.reset().at(f.x + fwdX * 0.9, f.y + 1.3, f.z + fwdZ * 0.9).size(0.2, 0.2, 0.2, 1.3, 1.3, 1.3).span(0.16).col(ec, 2.4).fade(0.01, 0.7);
      fx.emit('orb');
      return;
    }
    if (h.shape === 'line') {
      const sp = h.range / (dur + 0.12);
      const w = Math.max(1.2, h.width);
      b.reset().at(f.x + fwdX * 0.8, f.y + 0.7, f.z + fwdZ * 0.8).rot(f.yaw).size(w * 0.5, 1, w * 0.5, w * 0.95, 1, w * 0.95).vel(fwdX * sp, 0, fwdZ * sp).span(dur + 0.12).col(ec, 2.4).fade(0.02, 0.4);
      fx.emit('blade');
      b.reset().at(f.x + fwdX * 0.8, f.y + 1.1, f.z + fwdZ * 0.8).rot(f.yaw, 0, Math.PI / 2).size(w * 0.4, 1, w * 0.4, w * 0.8, 1, w * 0.8).vel(fwdX * sp, 0, fwdZ * sp).span(dur + 0.12).col(WHITE, 1.8).fade(0.02, 0.4);
      fx.emit('blade');
      const n = Math.min(9, Math.max(3, Math.round(h.range / 2)));
      for (let i = 0; i < n; i++) {
        const d = ((i + 1) / n) * h.range, px = f.x + fwdX * d, pz = f.z + fwdZ * d;
        const gy = this.host.groundY(px, pz, f.y);
        this.elementBurst(el, px, gy, pz, ec, 0.7, d / sp);
      }
      return;
    }
    if (h.shape === 'circle') {
      const cx = f.x + fwdX * h.offset, cz = f.z + fwdZ * h.offset;
      const gy = this.host.groundY(cx, cz, f.y);
      b.reset().at(cx, gy + 0.12, cz).size(0.6, 1, 0.6, h.range * 1.05, 1, h.range * 1.05).span(0.45).col(ec, 2).fade(0.01, 0.6);
      fx.emit('ring');
      const n = Math.min(8, Math.max(3, Math.round(h.range)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.4, r = h.range * (0.35 + rnd() * 0.6);
        this.elementBurst(el, cx + Math.sin(a) * r, gy, cz + Math.cos(a) * r, ec, 0.8, rnd() * 0.08);
      }
      this.elementBurst(el, cx, gy, cz, ec, 1.3, 0);
      return;
    }
    // Bogen: sichtbarer Sichelschnitt (voller Kreis = drei Sicheln rundum)
    const full = h.arc >= 5;
    const k = full ? 3 : 1;
    for (let i = 0; i < k; i++) {
      const a = f.yaw + (full ? (i * Math.PI * 2) / 3 : 0);
      const r = Math.max(1.6, h.range * 0.9);
      b.reset().at(f.x, f.y + 0.9 + rnd() * 0.5, f.z).rot(a, 0, (rnd() - 0.5) * 0.9).size(r * 0.6, 1, r * 0.6, r, 1, r).span(0.18).col(i ? ec : WHITE, 2.2).fade(0.01, 0.6).spin(full ? 14 : 0);
      fx.emit('blade');
    }
    if (h.range >= 6) this.elementBurst(el, f.x + fwdX * h.range * 0.6, this.host.groundY(f.x + fwdX * h.range * 0.6, f.z + fwdZ * h.range * 0.6, f.y), f.z + fwdZ * h.range * 0.6, ec, 0.9, 0.05);
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
        break;
      }
      case 'eis': {
        b.reset().at(x, y - 0.3, z).rot(rnd() * 6, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4).size(0.2, 0.1, 0.2, 0.7 * k, (1.6 + rnd() * 1.8) * k, 0.7 * k).span(0.9, delay).col(col, 1.6).fade(0.04, 0.2);
        fx.emit('shard');
        break;
      }
      case 'feuer': case 'sonne': {
        b.reset().at(x, y + 0.4, z).vel(0, 3 + rnd() * 2, 0).size(0.9 * k, 0.9 * k, 0.9 * k, 0.2, 0.2, 0.2).span(0.55, delay).col(col, 2.4).fade(0.02, 0.6);
        b.flicker = 0.3;
        fx.emit('orb');
        if (el === 'sonne') { b.reset().at(x, y - 0.2, z).size(0.3, 9 * k, 0.3, 0.6, 9 * k, 0.6).span(0.35, delay).col(col, 1.8).fade(0.1, 0.5); fx.emit('column'); }
        break;
      }
      case 'wasser': {
        b.reset().at(x, y - 0.2, z).rot(rnd() * 6).size(1.5 * k, 1, 1, 2.6 * k, (2.5 + rnd() * 2) * k, 1).span(0.6, delay).col(col, 0.8).fade(0.05, 0.6);
        fx.emit('wall');
        break;
      }
      case 'blitz': {
        if (delay <= 0.02) this.boltBetween(x + (rnd() - 0.5) * 2, y + 7 * k, z + (rnd() - 0.5) * 2, x, y, z, col, 3.5 * k, 0.16, 0.5);
        else { b.reset().at(x, y + 0.5, z).size(0.3, 0.3, 0.3, 1.1 * k, 1.1 * k, 1.1 * k).span(0.2, delay).col(WHITE, 2.6).fade(0.01, 0.6); fx.emit('orb'); }
        break;
      }
      case 'wind': {
        b.reset().at(x, y + 0.3, z).size(0.4, 1, 0.4, 1.8 * k, 1, 1.8 * k).span(0.4, delay).col(col, 1.4).fade(0.05, 0.6).spin(12);
        b.vy = 5;
        fx.emit('ring');
        break;
      }
      case 'mond': case 'void': case 'schwarzloch': {
        b.reset().at(x, y + 0.6 + rnd(), z).rot(rnd() * 6, 0, (rnd() - 0.5) * 1.4).size(0.6 * k, 1, 0.6 * k, 1.5 * k, 1, 1.5 * k).span(0.3, delay).col(col, 2.2).fade(0.02, 0.5);
        fx.emit('blade');
        break;
      }
      default: {
        // Klinge und Faust: heller Funkenstoß mit Staub
        b.reset().at(x, y + 0.6, z).size(0.2, 0.2, 0.2, 0.9 * k, 0.9 * k, 0.9 * k).span(0.16, delay).col(col, 2.4).fade(0.01, 0.6);
        fx.emit('orb');
        b.reset().at(x, y + 0.08, z).size(0.3, 1, 0.3, 1.6 * k, 1, 1.6 * k).span(0.3, delay).col(col, 1.4).fade(0.01, 0.6);
        fx.emit('ring');
      }
    }
  }

  /** Klingen-Clash: Funkenfontäne zwischen den Klingen, senkrechter Druckring, Lichtblitz */
  clash(x: number, y: number, z: number, yaw: number) {
    const fx = this.host.fx, b = fx.brush;
    const n = Math.round(40 * this.detailK);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, sp = 5 + rnd() * 11;
      b.reset().at(x, y, z).vel(Math.sin(a) * sp * 0.7, 4 + rnd() * 9, Math.cos(a) * sp * 0.7).spin(rnd() * 14, rnd() * 14).size(0.12, 0.35, 0.12, 0.04, 0.12, 0.04).span(0.5 + rnd() * 0.4).col(i % 3 ? GOLD : WHITE, 2.8).fade(0.01, 0.4);
      b.grav = 18;
      fx.emit('shard');
    }
    b.reset().at(x, y, z).rot(yaw, Math.PI / 2, 0).size(0.4, 1, 0.4, 4.2, 1, 4.2).span(0.32).col(WHITE, 2.4).fade(0.01, 0.6);
    fx.emit('ring');
    b.reset().at(x, y, z).size(0.2, 0.2, 0.2, 1.8, 1.8, 1.8).span(0.12).col(WHITE, 3).fade(0.01, 0.8);
    fx.emit('orb');
    this.stats.clashes++;
  }

  // ---------- kleine Effekte der Faji-Künste ----------

  /** Blitz-Strahl zwischen zwei Punkten (Grundform `bolt`, entlang +Y ausgerichtet) */
  boltBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number, col: Color, width: number, life: number, flicker = 0.3) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.05) return;
    // Drehung: +Y auf (dx, dy, dz) – Gieren um Y, dann Nicken um X
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.acos(Math.max(-1, Math.min(1, dy / len)));
    const b = this.host.fx.brush;
    b.reset().at(ax, ay, az).rot(yaw, pitch, 0).size(width * 0.1 * (rnd() < 0.5 ? -1 : 1), len, width * 0.1).span(life).col(col, 2.2).fade(0.01, 0.6);
    b.flicker = flicker;
    this.host.fx.emit('bolt');
  }

  /** Energiewelle des Sturm-Erwachens: eine Sichel fliegt mit jedem normalen Schlag nach vorn */
  awakenWave(f: FighterState, color: string, accent: string) {
    const fx = this.host.fx, b = fx.brush;
    const c = this.color(color), a = this.color(accent);
    const fwdX = Math.sin(f.yaw), fwdZ = Math.cos(f.yaw);
    b.reset().at(f.x + fwdX * 0.8, f.y + 1.1, f.z + fwdZ * 0.8).rot(f.yaw, 0, (rnd() - 0.5) * 0.9).size(1.4, 1, 1.4, 3.4, 1, 3.4).span(0.32).col(c, 2.4).fade(0.02, 0.5);
    b.vx = fwdX * 26; b.vz = fwdZ * 26;
    fx.emit('blade');
    b.reset().at(f.x + fwdX * 0.6, f.y + 1.1, f.z + fwdZ * 0.6).rot(f.yaw, 0, (rnd() - 0.5) * 0.9).size(1, 1, 1, 2.6, 1, 2.6).span(0.28).col(a, 2).fade(0.02, 0.5);
    b.vx = fwdX * 22; b.vz = fwdZ * 22;
    fx.emit('blade');
    this.stats.waves++;
  }

  /** Kettenblitz zwischen zwei Zielen */
  chain(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: string) {
    const c = this.color(color);
    this.boltBetween(ax, ay, az, bx, by, bz, c, 3.2, 0.22, 0.4);
    this.boltBetween(ax, ay, az, bx, by, bz, WHITE, 1.6, 0.16, 0.6);
    this.stats.chains++;
  }

  /** Willens-Druckwelle des Königsdrucks */
  kingWave(x: number, y: number, z: number, r: number) {
    const fx = this.host.fx, b = fx.brush;
    b.reset().at(x, y + 0.2, z).size(1, 1, 1, r, 1, r).span(0.6).col(GOLD, 1.8).fade(0.02, 0.7);
    fx.emit('ring');
    b.reset().at(x, y + 1.2, z).rot(0, 0, 0).size(1, 1, 1, r * 0.8, 1, r * 0.8).span(0.5).col(TMP.setRGB(1, 0.85, 0.5), 1.2).fade(0.02, 0.7);
    fx.emit('ring');
  }

  /** Aura des Sturm-Erwachens (an/aus); läuft in `update` als aufsteigende Flammen-Funken */
  setAwakenAura(f: FighterState | null, color = '#ffffff', accent = '#ffffff') {
    this.auraF = f;
    if (f) { this.auraCol.copy(this.color(color)); this.auraAcc.copy(this.color(accent)); }
  }

  private stepAura(dt: number) {
    const f = this.auraF;
    if (!f) return;
    if (f.awakenT <= 0) { this.auraF = null; return; }
    this.auraT += dt;
    const fx = this.host.fx, b = fx.brush;
    while (this.auraT > 0.045) {
      this.auraT -= 0.045;
      const a = rnd() * Math.PI * 2, r = 0.35 + rnd() * 0.35;
      b.reset().at(f.x + Math.sin(a) * r, f.y + rnd() * 1.6, f.z + Math.cos(a) * r).vel(0, 2.2 + rnd() * 1.6, 0).size(0.18, 0.18, 0.18, 0.04, 0.04, 0.04).span(0.55).col(rnd() < 0.5 ? this.auraCol : this.auraAcc, 2.2).fade(0.1, 0.6);
      fx.emit('orb');
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
