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
import type { CataclysmKind, UltimateSpec } from '../data/actionKit';
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
  horizonCut: 1.6, sevenSeas: 1.6, sawCyclone: 2.1, iaiWorldBreak: 1.4, fistStorm: 1.8, oceanSplit: 6.2, blackHole: 2.6, fireDragons: 2.4,
  glacier: 2.4, floodDragon: 2.4, vacuumStorm: 2.4, thunderJudgment: 2.0, sunDance: 2.2, bloodMoon: 2.4,
};

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
  readonly stats = { strikes: 0, splits: 0, disabled: 0, shipHits: 0, pulls: 0, trench: 0, waves: 0, chains: 0 };
  private seed = 1;

  constructor(private host: CataclysmHost) {}

  private color(hex: string): Color { let c = HEXC.get(hex); if (!c) { c = new Color(hex); HEXC.set(hex, c); } return c; }
  get active(): boolean { return this.charge.on || this.casts.some((c) => c.on); }

  // ---------- Aufladen (Mini-Zwischensequenz) ----------

  /** Ultimate ausgelöst: Energie sammelt sich (läuft in Spielzeit, also fast stillstehend in der Zeitlupe; die Effekte bekommen Echtzeit-Dauer) */
  beginCharge(spec: UltimateSpec, f: FighterState, realDur: number) {
    const c = this.charge;
    c.on = true; c.t = 0; c.dur = realDur; c.x = f.x; c.y = f.y; c.z = f.z; c.yaw = f.yaw; c.kind = spec.kind; c.f = f; c.tick = 0;
    c.col.copy(this.color(spec.color)); c.acc.copy(this.color(spec.accent));
    this.riftCol.copy(c.col);
    this.chargeHex = spec.accent;
    const fx = this.host.fx, b = fx.brush;
    // (Lebensdauern in Spielzeit: in der Zeitlupe vergehen davon nur 0,105 s, der Rest nach dem Einschlag)
    // Lichtsäule aus dem aufreißenden Himmel auf die Figur
    // schmal genug, dass die Gesichts-Einstellung (1,35 m) außerhalb steht
    b.reset().at(f.x, f.y, f.z).size(0.15, 140, 0.15, 0.8, 140, 0.8).span(1).col(c.col, 0.75).fade(0.12, 0.4);
    fx.emit('column');
    b.reset().at(f.x, f.y + 0.05, f.z).size(1, 1, 1, 6, 1, 6).span(0.8).col(c.acc, 1.6).fade(0.1, 0.5).spin(2.4);
    fx.emit('ring');
    // Bodensiegel
    this.host.combatFx?.sigil(V.set(f.x, f.y + 0.05, f.z), 4.5, '#' + c.col.getHexString(), 1.6);
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
      // Aura-Blitze um die Figur
      if (rnd() < 0.35) this.boltBetween(c.x + (rnd() - 0.5) * 2.4, c.y + rnd() * 2.4, c.z + (rnd() - 0.5) * 2.4, c.x + (rnd() - 0.5) * 3.4, c.y + 0.5 + rnd() * 2.5, c.z + (rnd() - 0.5) * 3.4, c.acc, 2.4, 0.02, 0.25);
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
    this.stats.strikes++;
    this.host.shake(1.1);
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
      case 'fireDragons': {
        b.reset().at(c.x, c.y + 9, c.z).size(0.5, 0.5, 0.5, 3.4, 3.4, 3.4).span(2.3).col(c.acc, 2.4).fade(0.1, 0.3).flicker = 0.25;
        fx.emit('orb');
        b.reset().at(c.x, c.y + 9, c.z).size(0.5, 0.5, 0.5, 2.6, 2.6, 2.6).span(2.3).col(c.col, 3).fade(0.1, 0.3);
        fx.emit('orb');
        break;
      }
      case 'sunDance': {
        b.reset().at(c.x, c.y + 15, c.z).size(0.5, 0.5, 0.5, 4.2, 4.2, 4.2).span(2.1).col(c.col, 3.2).fade(0.08, 0.3).flicker = 0.12;
        fx.emit('orb');
        b.reset().at(c.x, c.y + 15, c.z).rot(0, Math.PI / 2, 0).size(4, 1, 4, 9, 1, 9).span(2.1).col(c.acc, 1.8).fade(0.08, 0.4).spin(0, 0, 1.5);
        fx.emit('ring');
        break;
      }
      case 'bloodMoon': {
        // riesiger Blutmond hinter der Figur am Himmel
        const mx = c.x - fwdX * 70, mz = c.z - fwdZ * 70;
        b.reset().at(mx, c.y + 42, mz).size(4, 4, 4, 22, 22, 22).span(2.3).col(c.col, 1.6).fade(0.1, 0.35);
        fx.emit('orb');
        b.reset().at(mx, c.y + 42, mz).rot(c.yaw, Math.PI / 2, 0).size(20, 1, 20, 30, 1, 30).span(2.3).col(c.acc, 1.4).fade(0.1, 0.35);
        fx.emit('ring');
        break;
      }
      case 'thunderJudgment': {
        this.host.lightning?.(c.x + fwdX * 14, c.z + fwdZ * 14);
        break;
      }
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
      const r = c.kind === 'sevenSeas' ? 170 : c.kind === 'sawCyclone' || c.kind === 'iaiWorldBreak' ? s.reach + 60 : s.reach + (c.kind === 'blackHole' ? 40 : 30);
      nav.cataclysmShips(c.kind === 'blackHole' ? c.cx : c.x, c.kind === 'blackHole' ? c.cz : c.z, r, this.ships);
      if (c.kind === 'iaiWorldBreak') this.iaiShips(c);
    }
  }

  // ---------- Zeitachsen ----------

  /** Je Bild: `dt` Spielzeit (Effekte verlangsamen in der Zeitlupe mit), `realDt` Echtzeit (Aufladen, Himmel) */
  update(dt: number, realDt: number) {
    this.stepCharge(realDt);
    for (const c of this.casts) if (c.on) this.stepCast(c, dt);
    this.stepAura(dt);
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
      case 'sevenSeas': {
        // sieben goldene Geister-Geschütze erscheinen im Bogen hinter der Figur und feuern drei Salven
        if (c.step === 0) {
          c.step = 1;
          for (let i = 0; i < 7; i++) {
            const a = c.yaw + Math.PI + (i - 3) * 0.42;
            const px = c.x + Math.sin(a) * 9, pz = c.z + Math.cos(a) * 9, py = c.y + 3.5 + Math.abs(i - 3) * 0.9;
            b.reset().at(px, py, pz).rot(c.yaw, -0.25, 0).size(0.2, 0.2, 0.2, 2.6, 2.6, 2.6).span(1.55).col(GOLD, 1.7).fade(0.12, 0.25).flicker = 0.15;
            fx.emit('cannon');
            b.reset().at(px, py, pz).rot(0, Math.PI / 2, 0).size(0.5, 1, 0.5, 2, 1, 2).span(0.5).col(c.acc, 1.6).fade(0.05, 0.6);
            fx.emit('ring');
          }
        }
        for (let v = 0; v < 3; v++) {
          const at = 0.35 + v * 0.32;
          if (t0 < at && t >= at) this.volley(c, v);
        }
        break;
      }
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
      case 'fistStorm': {
        if (f && t < 1.5 && c.tick > 0.025) {
          c.tick = 0;
          // Zehntausend Hiebe: Faust-Abdrücke (helle Stoßkugeln und kleine Sicheln) im Kegel vor der Figur
          for (let i = 0; i < 5; i++) {
            const a = f.yaw + (rnd() - 0.5) * 1.3, d = 1.5 + rnd() * (s.reach * 0.55);
            const px = f.x + Math.sin(a) * d, pz = f.z + Math.cos(a) * d, py = f.y + 0.6 + rnd() * 2;
            b.reset().at(px, py, pz).size(0.2, 0.2, 0.2, 0.9, 0.9, 0.9).span(0.12).col(i % 2 ? c.col : c.acc, 2.6).fade(0.01, 0.7);
            fx.emit('orb');
            if (i < 2) { b.reset().at(px, py, pz).rot(a, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2).size(0.6, 1, 0.6, 1.6, 1, 1.6).span(0.14).col(WHITE, 2).fade(0.01, 0.6); fx.emit('blade'); }
          }
        }
        if (t0 < 1.55 && t >= 1.55 && f) {
          b.reset().at(f.x, f.y - 1, f.z).rot(f.yaw).size(2, 4, 2, s.reach, 10, s.reach).span(0.6).col(c.col, 2.2).fade(0.02, 0.6);
          fx.emit('arc');
          this.host.combatFx?.shockwave(V.set(f.x + Math.sin(f.yaw) * 6, f.y + 0.1, f.z + Math.cos(f.yaw) * 6), 12, '#' + c.acc.getHexString());
          this.areaShips(c, f.x, f.z, s.reach, 1.3);
        }
        break;
      }
      case 'oceanSplit': this.stepOcean(c, t0, t); break;
      case 'blackHole': this.stepBlackHole(c, t0, t, dt); break;
      case 'fireDragons': {
        if (c.tick > 0.03 && t < 1.9) {
          c.tick = 0;
          // drei Feuerdrachen auf Spiralbahnen: je Bild ein Glied an jedem Kopf
          for (let k = 0; k < 3; k++) {
            const u = t / 1.9;
            const a = c.yaw + (k - 1) * 0.55 + Math.sin(t * 5 + k * 2) * 0.35;
            const d = 2 + u * s.reach;
            const px = c.x + Math.sin(a) * d, pz = c.z + Math.cos(a) * d, py = c.y + 2 + Math.sin(t * 7 + k) * 1.6 + u * 2;
            b.reset().at(px, py, pz).size(1.8, 1.8, 1.8, 0.4, 0.4, 0.4).span(0.5).col(k === 1 ? c.acc : c.col, 2.4).fade(0.02, 0.7).flicker = 0.3;
            fx.emit('orb');
          }
        }
        if (t0 < 0.15 && t >= 0.15) { b.reset().at(c.x, c.y + 0.1, c.z).size(2, 1, 2, s.reach, 1, s.reach).span(1.2).col(c.col, 2).fade(0.05, 0.6); fx.emit('ring'); }
        if (t0 < 0.6 && t >= 0.6) this.areaShips(c, c.x + fwdX * s.reach * 0.5, c.z + fwdZ * s.reach * 0.5, s.reach * 0.7, 1, 'fire');
        break;
      }
      case 'glacier': {
        // Eis-Stacheln wachsen ringförmig nach außen, dann zerbricht der Gletscher
        const rings = 6;
        while (c.step < rings && t >= c.step * 0.09) {
          const r = 3 + (c.step / (rings - 1)) * (s.reach - 3);
          const n = Math.round(6 + r * 0.9);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
            const px = c.x + Math.sin(a) * r, pz = c.z + Math.cos(a) * r;
            const gy = this.host.groundY(px, pz, c.y);
            const h = 1.5 + rnd() * 4.5 * (1 - c.step / rings * 0.5);
            b.reset().at(px, gy - 0.3, pz).rot(rnd() * 6, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5).size(0.4, 0.1, 0.4, 1.2 + rnd(), h, 1.2 + rnd()).span(1.6 - c.step * 0.05).col(i % 3 ? FROST : c.acc, 1.6).fade(0.04, 0.2);
            b.ease = 1;
            fx.emit('shard');
          }
          c.step++;
        }
        if (t0 < 1.2 && t >= 1.2) {
          for (let i = 0; i < 70; i++) {
            const a = rnd() * Math.PI * 2, r = rnd() * s.reach;
            b.reset().at(c.x + Math.sin(a) * r, c.y + 0.5 + rnd() * 3, c.z + Math.cos(a) * r).vel(Math.sin(a) * (4 + rnd() * 8), 3 + rnd() * 8, Math.cos(a) * (4 + rnd() * 8)).spin(rnd() * 10, rnd() * 10).size(0.4, 0.9, 0.4, 0.15, 0.3, 0.15).span(1 + rnd() * 0.5).col(FROST, 2).fade(0.01, 0.4);
            b.grav = 16;
            fx.emit('shard');
          }
          b.reset().at(c.x, c.y + 0.1, c.z).size(3, 1, 3, s.reach * 1.1, 1, s.reach * 1.1).span(0.8).col(WHITE, 2.2).fade(0.02, 0.7);
          fx.emit('ring');
          this.areaShips(c, c.x, c.z, s.reach, 1, 'freeze');
        }
        break;
      }
      case 'floodDragon': {
        if (c.tick > 0.025 && t < 1.6) {
          c.tick = 0;
          const u = t / 1.6;
          const d = 2 + u * s.reach;
          const sw = Math.sin(t * 9) * 4;
          const px = c.x + fwdX * d + fwdZ * sw, pz = c.z + fwdZ * d - fwdX * sw, py = c.y + 2.5 + Math.sin(t * 6) * 1.8;
          b.reset().at(px, py, pz).size(2.4, 2.4, 2.4, 0.6, 0.6, 0.6).span(0.7).col(c.col, 1.8).fade(0.02, 0.7);
          fx.emit('orb');
          b.reset().at(px, py, pz).size(1.2, 1.2, 1.2, 0.3, 0.3, 0.3).span(0.5).col(WHITE, 1.6).fade(0.02, 0.7);
          fx.emit('orb');
          if (rnd() < 0.5) {
            const side = rnd() < 0.5 ? 1 : -1;
            const wx = c.x + fwdX * d + fwdZ * side * s.width * 0.35, wz = c.z + fwdZ * d - fwdX * side * s.width * 0.35;
            b.reset().at(wx, this.host.waterY(wx, wz) - 0.5, wz).rot(c.yaw + Math.PI / 2).size(5, 1, 1, 9, 8 + rnd() * 4, 1).span(0.9).col(SPRAY, 1.1).fade(0.05, 0.6);
            fx.emit('wall');
          }
        }
        if (t0 < 0.8 && t >= 0.8) this.areaShips(c, c.x + fwdX * s.reach * 0.5, c.z + fwdZ * s.reach * 0.5, s.reach * 0.6, 1.1, 'shove');
        break;
      }
      case 'vacuumStorm': {
        if (c.tick > 0.035 && t < 2) {
          c.tick = 0;
          const k = 1 - t / 2.4;
          for (let i = 0; i < 3; i++) {
            const h = rnd() * 18;
            const r = (4 + (s.reach - 4) * k) * (0.35 + h / 26);
            b.reset().at(c.x, c.y + h, c.z).size(r, 1, r, r * 0.7, 1, r * 0.7).span(0.4).col(i ? c.col : c.acc, 1.4).fade(0.1, 0.6).spin(9 + rnd() * 4);
            b.vy = 4;
            fx.emit('ring');
          }
          const a = rnd() * Math.PI * 2;
          b.reset().at(c.x + Math.sin(a) * s.reach * k, c.y + rnd() * 6, c.z + Math.cos(a) * s.reach * k).rot(a + Math.PI / 2).size(2, 1, 2, 3.4, 1, 3.4).span(0.3).col(WHITE, 1.8).fade(0.02, 0.6).spin(10);
          b.vx = -Math.sin(a) * 18; b.vz = -Math.cos(a) * 18; b.vy = 6;
          fx.emit('blade');
        }
        if (t0 < 1 && t >= 1) this.areaShips(c, c.x, c.z, s.reach, 1);
        break;
      }
      case 'thunderJudgment': {
        // drei Wellen riesiger Blitze aus dem Himmel
        for (let v = 0; v < 3; v++) {
          const at = 0.05 + v * 0.36;
          if (t0 < at && t >= at) {
            const n = 7 + v * 2;
            for (let i = 0; i < n; i++) {
              const a = rnd() * Math.PI * 2, r = rnd() * s.reach;
              const px = c.x + Math.sin(a) * r, pz = c.z + Math.cos(a) * r;
              const gy = this.host.groundY(px, pz, c.y);
              this.boltBetween(px + (rnd() - 0.5) * 8, gy + 70, pz + (rnd() - 0.5) * 8, px, gy, pz, i % 3 ? c.col : WHITE, 9, 0.35, 0.2);
              b.reset().at(px, gy + 0.1, pz).size(0.5, 1, 0.5, 4, 1, 4).span(0.45).col(c.acc, 2).fade(0.02, 0.6);
              fx.emit('ring');
            }
            if (v === 1) this.host.lightning?.(c.x - fwdX * 10, c.z - fwdZ * 10);
            this.host.shake(0.8);
            this.areaShips(c, c.x, c.z, s.reach, 0.5);
          }
        }
        break;
      }
      case 'sunDance': {
        if (c.tick > 0.05 && t < 1.8) {
          c.tick = 0;
          // fünf Sonnensäulen tanzen im Kreis
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 + t * 2.2;
            const r = s.reach * (0.4 + 0.25 * Math.sin(t * 3 + k));
            const px = c.x + Math.sin(a) * r, pz = c.z + Math.cos(a) * r;
            b.reset().at(px, this.host.groundY(px, pz, c.y) - 0.2, pz).size(2.2, 60, 2.2, 1.4, 60, 1.4).span(0.16).col(k % 2 ? c.col : c.acc, 2.2).fade(0.2, 0.5);
            fx.emit('column');
          }
        }
        if (t0 < 1.85 && t >= 1.85) {
          b.reset().at(c.x, c.y - 0.2, c.z).size(2, 80, 2, 7, 80, 7).span(0.6).col(WHITE, 2.6).fade(0.02, 0.6);
          fx.emit('column');
          b.reset().at(c.x, c.y + 0.1, c.z).size(3, 1, 3, s.reach * 1.2, 1, s.reach * 1.2).span(0.7).col(c.col, 2.2).fade(0.02, 0.7);
          fx.emit('ring');
          this.areaShips(c, c.x, c.z, s.reach, 1.2);
        }
        break;
      }
      case 'bloodMoon': {
        if (c.tick > 0.07 && t < 1.9) {
          c.tick = 0;
          // Sicheln verschiedener Größen fliegen in alle Richtungen
          for (let i = 0; i < 4; i++) {
            const a = rnd() * Math.PI * 2;
            const sz = 1.6 + rnd() * 7;
            const sp = 20 + rnd() * 18;
            b.reset().at(c.x, c.y + 0.8 + rnd() * 2.5, c.z).rot(a, 0, (rnd() - 0.5) * 1.2).size(sz * 0.5, 1, sz * 0.5, sz, 1, sz).span(s.reach / sp).col(i % 2 ? c.col : c.acc, 2.2).fade(0.02, 0.4);
            b.vx = Math.sin(a) * sp; b.vz = Math.cos(a) * sp;
            fx.emit('blade');
          }
        }
        if (t0 < 1.9 && t >= 1.9) this.areaShips(c, c.x, c.z, s.reach, 1.2);
        break;
      }
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
    this.rift = 0;
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
      if (t0 < 0.05) {
        // Wasserwände an beiden Rändern
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
    } else if (t0 < 0.02) {
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
  private shipStrike(c: Cast, e: EnemyShip, cut: 'cross' | 'length' | 'diagonal' | 'radial') {
    const nav = this.host.naval;
    if (!nav || c.hit.includes(e)) return;
    c.hit.push(e);
    const r = nav.cataclysmSplit(e, cut, c.seed + c.hit.length);
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

  /** Säbel: Salve der Geister-Geschütze auf Schiffe in Reichweite oder auf den Zielkreis */
  private volley(c: Cast, v: number) {
    const s = c.spec!, fx = this.host.fx, b = fx.brush;
    const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
    for (let i = 0; i < 7; i++) {
      const a = c.yaw + Math.PI + (i - 3) * 0.42;
      const mx = c.x + Math.sin(a) * 9 + fwdX * 1.4, mz = c.z + Math.cos(a) * 9 + fwdZ * 1.4, my = c.y + 3.5 + Math.abs(i - 3) * 0.9;
      const ship = this.ships.length ? this.ships[(i + v) % this.ships.length] : null;
      let tx: number, tz: number, ty: number;
      if (ship) { tx = ship.ship.x + (rnd() - 0.5) * ship.ship.cls.W; tz = ship.ship.z + (rnd() - 0.5) * ship.ship.cls.L * 0.5; ty = ship.ship.model.deckY; }
      else { const ra = rnd() * Math.PI * 2, rr = rnd() * s.reach * 0.35; tx = c.cx + Math.sin(ra) * rr; tz = c.cz + Math.cos(ra) * rr; ty = this.host.groundY(tx, tz, c.y); }
      // Mündungsfeuer, Kugelbahn als goldener Strahl, Einschlag
      b.reset().at(mx, my, mz).size(0.3, 0.3, 0.3, 1.6, 1.6, 1.6).span(0.18).col(WHITE, 3).fade(0.01, 0.7);
      fx.emit('orb');
      this.boltBetween(mx, my, mz, tx, ty + 0.5, tz, GOLD, 5, 0.22, 0.4);
      b.reset().at(tx, ty + 0.3, tz).size(0.5, 1, 0.5, 6, 1, 6).span(0.5).col(c.acc, 2).fade(0.01, 0.6);
      fx.emit('ring');
      b.reset().at(tx, ty + 1, tz).size(0.5, 0.5, 0.5, 3.2, 3.2, 3.2).span(0.35).col(GOLD, 2.4).fade(0.01, 0.7);
      fx.emit('orb');
    }
    this.host.shake(0.7);
    if (v === 2) for (const e of this.ships) if (!c.hit.includes(e)) { c.hit.push(e); this.shipDamage(c, e, 0.9); }
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
  eyeGlow(lx: number, ly: number, lz: number, rx: number, ry: number, rz: number, k: number, color: Color) {
    if (k < 0.02) return;
    const fx = this.host.fx, b = fx.brush;
    const s = 0.035 + 0.05 * k;
    b.reset().at(lx, ly, lz).size(s, s, s).span(0.03).col(color, 3 * k).fade(0, 0);
    fx.emit('orb');
    b.reset().at(rx, ry, rz).size(s, s, s).span(0.03).col(color, 3 * k).fade(0, 0);
    fx.emit('orb');
  }

  /** Farbe des laufenden Aufladens (Augen) */
  get chargeColor(): Color { return this.charge.on ? this.charge.acc : this.casts.find((c) => c.on)?.acc ?? WHITE; }
  /** Dieselbe Farbe als Text (Aura-Glühen des Overlays; einmal je Ultimate gebildet) */
  chargeHex = '#ffffff';
}
