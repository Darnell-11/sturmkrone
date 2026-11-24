// Vorausschauende Lenkung und Seekampf-Zustandsmaschine der KI-Schiffe (Phase 4.3). Rein, deterministisch, ohne three.js und ohne `Math.random`:
// alles, was ein Server ebenso rechnen könnte. Der Zustand eines KI-Schiffs (`AiNavState`) ist nur Zahlen und Zeichenketten (JSON-tauglich) und
// getrennt vom Netz; `NavalSystem.ai` füllt je Schiff ein `SteerSelf`/`SteerTarget` (vorab angelegte Arbeitsobjekte) und setzt das `SteerCommand` um.
//
// Warum Schiffe früher im Kreis fuhren: wer auf einen Punkt zusteuert, der INNERHALB seines Wendekreises liegt (Abstand der Kreismitte kleiner als R),
// erreicht ihn nie – er umkreist ihn mit vollem Segel für immer (Wegpunkte, Formationsplatz der Begleiter, Rückzug). Die Lösung ist Physik, kein Zufall:
// `seekPoint` prüft den echten Wendekreis (`shipMotion.turnRadius`: Fahrt ÷ größte Drehrate) und refft die Segel (0,25 … 0,45), bis der Kreis klein genug ist.
import { clamp, clamp01, distToSegment, lerp, wrapAngle } from '../core/mathUtil';
import { RAM, RAM_MIN_TIER } from '../data/balanceConfig';
import { escortSpeed, slotSpeed } from '../data/playerFleet';
import type { Blocker } from '../world/islandGround';
import { heavyOf, turnRadius, windSpeedK } from './shipMotion';

const D2R = Math.PI / 180;

/** Alle Stellschrauben der KI-Lenkung an einem Ort */
export const STEER = {
  /** Fühler: Winkel zum Bug in Bogenmaß (positiv = Backbord, links) und Gewicht in der Ausweich-Lenkung */
  rayAngles: [0, 22 * D2R, -22 * D2R, 52 * D2R, -52 * D2R] as readonly number[],
  rayWeight: [1, 0.8, 0.8, 0.5, 0.5] as readonly number[],
  /** Messpunkte je Fühler und Abstand zwischen zwei Messungen (s) */
  samples: 6,
  senseEvery: 0.1,
  /** Mindest-Haltezeit eines Manövers (s): zwischen `lockMin` und `lockMax`, deterministisch je Schiff und Wechsel */
  lockMin: 4,
  lockMax: 6,
  /** Kritischer Schaden: darunter Rückzug; erst darüber (`recovered`) wieder Angriff */
  critical: 0.22,
  recovered: 0.3,
  /** Segelanteil beim Reffen im Wendekreis (flach … tief) und Haltezeit des Reffens (s) */
  slowMax: 0.45,
  slowMin: 0.25,
  slowHold: 3,
  rudderGain: 2.2,
  /** Gefechtsabstand je Klasse (m) und Schussweite als Vielfaches davon */
  standoffMin: 65,
  standoffMax: 130,
  fireReach: 1.2,
  /** Härteste Schussweite der KI (m) und die Entfernung, ab der ihre Streuung wächst: auf 25 m bis zum Vierfachen (siehe `aiSpreadK`) */
  fireMax: 140,
  spreadFrom: 115,
  spreadSpan: 25,
  spreadMax: 4,
  /** Anmarsch → Umkreisen bei Abstand ≤ Gefechtsabstand × orbitEnter, zurück bei > × orbitLeave */
  orbitEnter: 1.25,
  orbitLeave: 2.4,
  /** Rammangriff: Bugwinkel (Einleiten, Abbruch), Mindest-Rumpf, größtes Massenverhältnis Ziel : Rammer, Reichweite (m), Anteil des Höchsttempos, Pause (s) */
  ramAngle: 35 * D2R,
  ramAbort: 55 * D2R,
  ramHull: 0.45,
  ramMass: 2.4,
  ramRange: 170,
  ramSpeed: 0.7,
  ramRetry: 18,
  /** Seitenwechsel der Breitseite frühestens alle … s; ein Schiff mit Rammsporn nimmt nach so vielen Sekunden Umkreisen Anlauf */
  sideEvery: 12,
  ramRunEvery: 10,
  /** Ein Anlauf (APPROACH eines rammfähigen Schiffs im Nahbereich) dauert höchstens so lange, bis der Bug herumgekommen sein muss */
  ramRunMax: 11,
  /** Abstand zum Weltrand, ab dem er als Hindernis gilt (m) */
  edge: 120,
} as const;

// ---------- Zustand (serialisierbar) ----------

export type AiManeuver = 'TRANSIT' | 'APPROACH' | 'BROADSIDE_ORBIT' | 'RAM_CHARGE' | 'DISENGAGE';

/**
 * Zustand der KI-Lenkung eines Schiffs: nur Zahlen, Zeichenketten und kleine Listen (`JSON.stringify` verlustfrei), keine Verweise auf Netze oder Schiffe.
 * `targetShipId` ist die `entityId` des Ziels; die Seewelt löst sie auf.
 */
export interface AiNavState {
  shipId: string;
  seed: number;
  aiState: AiManeuver;
  /** Restzeit (s), in der das Manöver nicht freiwillig gewechselt wird (4 … 6 s) */
  stateLockTimer: number;
  /** Zuletzt angesteuerter Kurs (Weltwinkel) und Segelanteil 0 … 1 */
  desiredCourse: number;
  desiredSailFrac: number;
  targetShipId: string | null;
  /** Breitseite zum Ziel: +1 = Ziel an Backbord (links, Bug + 90°), −1 = Steuerbord */
  side: 1 | -1;
  sideT: number;
  stateTime: number;
  ramCooldown: number;
  rammed: boolean;
  /** Reffen im Wendekreis: Resthaltezeit und Tiefe 0 … 1 */
  slowT: number;
  slowDepth: number;
  /** Ausweichrichtung (+1 = nach rechts) und Haltezeit */
  avoidSide: -1 | 0 | 1;
  avoidT: number;
  /** Ausweg aus einer Sackgasse (alle Fühler dicht): Restzeit und Zielkurs (Weltwinkel) zum offenen Wasser */
  escT: number;
  escHeading: number;
  /** Ankerplatz (Weltkoordinaten) und der Wunschplatz, für den er gesucht wurde: Begleitschiffe halten beim Anlegen des Flaggschiffs Abstand zu Stegen und Küste */
  anchorSet: boolean;
  anchorX: number;
  anchorZ: number;
  anchorWx: number;
  anchorWz: number;
  /** Das Schiff steht auf seinem Ankerplatz (Hysterese: hält ab 8 m, löst sich erst jenseits von 14 m) */
  anchorHeld: boolean;
  senseT: number;
  /** Freiheit je Fühler 0 … 1 (1 = frei bis zur Reichweite), Reihenfolge wie `STEER.rayAngles` */
  rays: number[];
  /** Abstand (m) bis zum ersten Hindernis im Vorausbereich (±22°) */
  hitDist: number;
  lastHeading: number;
  headingRate: number;
  started: boolean;
  /** Zähler für den deterministischen Zufall */
  seq: number;
  /** Fahrtziel: bester Abstand, Zeit ohne Fortschritt, Hinweis „neues Ziel wählen“ */
  progressRef: number;
  stuckT: number;
  replan: boolean;
}

export function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministische Zahl 0 … 1 aus Schiffs-Seed und Zähler */
export function hash01(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n + 1, 0x9E3779B1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createAiNav(shipId: string): AiNavState {
  const seed = hashSeed(shipId);
  return {
    shipId, seed, aiState: 'TRANSIT', stateLockTimer: 0, desiredCourse: 0, desiredSailFrac: 0.55, targetShipId: null,
    side: hash01(seed, 0) < 0.5 ? 1 : -1, sideT: 99, stateTime: 0, ramCooldown: 0, rammed: false,
    slowT: 0, slowDepth: 0, avoidSide: 0, avoidT: 0, escT: 0, escHeading: 0, anchorSet: false, anchorX: 0, anchorZ: 0, anchorWx: 0, anchorWz: 0, anchorHeld: false, senseT: 0, rays: [1, 1, 1, 1, 1], hitDist: 9999,
    lastHeading: 0, headingRate: 0, started: false, seq: 1, progressRef: 1e9, stuckT: 0, replan: false,
  };
}

// ---------- Eingaben und Ausgabe (Arbeitsobjekte, werden wiederverwendet) ----------

/** Das lenkende Schiff, wie die Lenkung es braucht (Zahlen in Weltmetern, Bogenmaß, m/s, Sekunden) */
export interface SteerSelf {
  id: string;
  x: number; z: number; heading: number; speed: number;
  L: number; W: number;
  /** Klassenindex 0 (Schaluppe) … 6 (Leviathan) */
  classTier: number;
  /** Rumpfpunkte (Höchstwert): Masse beim Rammen */
  mass: number;
  hullFrac: number; sailFrac: number;
  /** Rumpf-Stufe 1 … 5 (`ship.evo.hullTier`): Rammsporn ab `RAM_MIN_TIER` */
  hullTier: number;
  turnMult: number; turnK: number; perfTurn: number;
  /** Höchsttempo bei vollem Tuch ohne Wind und ohne Deckel (m/s) */
  vFull: number;
  upwindK: number;
  /** Tempo-Deckel der KI (m/s) */
  speedCap: number;
  /** Restzeit des Nachladens je Seite (s) */
  reloadL: number; reloadR: number;
  /** Zieht sich nie zurück (Legenden, Wachschiffe, Begleiter, Geisterschiffe, Übungsschiff) */
  brave: boolean;
  /** Der Spielablauf wertet Rammstöße dieses Schiffs aus (nicht in KI-gegen-KI-Seeschlachten) */
  canRam: boolean;
  /** Muss fliehen, ohne selbst geschwächt zu sein (Händler in Bedrängnis) */
  flee: boolean;
}

export interface SteerTarget {
  id: string;
  x: number; z: number; heading: number; speed: number;
  L: number; W: number; mass: number;
  /** Kampfunfähig (Enterphase): ein Rammstoß lohnt nicht */
  disabled: boolean;
}

export interface SteerEnv { windDir: number; windStrength: number }

export interface SteerCommand {
  /** Ruder −1 … 1 (positiv = nach rechts, wie `Ship.steer`) */
  turn: number;
  /** Segelanteil 0 … 1 (`Ship.aiSail`) */
  sail: number;
  state: AiManeuver;
  /** Breitseite zum Ziel (+1 = links) */
  side: 1 | -1;
  /** Winkel des Ziels zum Bug (positiv = links) und Abstand (m); ohne Ziel 0 und 9999 */
  rel: number;
  dist: number;
  /** Gefechtsabstand der Klasse (m) */
  standoff: number;
  /** Fahrtziel erreicht (nur `cruise`) */
  arrived: boolean;
  /** Das Schiff liegt auf seinem Ankerplatz und soll stehen (Tempo auf 0): nur `anchor` */
  hold: boolean;
}

export const newSteerSelf = (): SteerSelf => ({
  id: '', x: 0, z: 0, heading: 0, speed: 0, L: 30, W: 8, classTier: 0, mass: 100, hullFrac: 1, sailFrac: 1, hullTier: 1,
  turnMult: 1, turnK: 1, perfTurn: 1, vFull: 14, upwindK: 1, speedCap: 99, reloadL: 0, reloadR: 0, brave: false, canRam: true, flee: false,
});
export const newSteerTarget = (): SteerTarget => ({ id: '', x: 0, z: 0, heading: 0, speed: 0, L: 30, W: 8, mass: 100, disabled: false });
export const newSteerCommand = (): SteerCommand => ({ turn: 0, sail: 0.55, state: 'TRANSIT', side: 1, rel: 0, dist: 9999, standoff: 90, arrived: false, hold: false });

// ---------- Rechenhelfer (rein, einzeln testbar) ----------

/** Gefechtsabstand je Klasse: Schaluppe 65 m … Leviathan 130 m */
export const standoffOf = (classTier: number): number => lerp(STEER.standoffMin, STEER.standoffMax, clamp01(classTier / 6));
/** Größte Entfernung, aus der die KI ihre Breitseite abfeuert: 20 % über dem Gefechtsabstand, nie über `STEER.fireMax` (140 m) */
export const fireRangeOf = (classTier: number): number => Math.min(standoffOf(classTier) * STEER.fireReach, STEER.fireMax);

/**
 * Faktor auf die Streuung der KI-Kanonen (Richtung und Entfernung der Kugel): bis 115 m 1, danach linear bis `spreadMax` (4) bei 140 m. Kämpfe auf
 * dem Gefechtsabstand der großen Klassen (bis 130 m) bleiben dadurch fair: wer weit entfernt feuert, trifft seltener.
 */
export const aiSpreadK = (dist: number): number => 1 + (STEER.spreadMax - 1) * clamp01((dist - STEER.spreadFrom) / STEER.spreadSpan);

/** Höchsttempo (m/s) in Fahrtrichtung `heading` bei Segelanteil `sail`: Windfaktor, Deckel der KI */
export function speedAtSail(self: SteerSelf, sail: number, heading: number, env: SteerEnv): number {
  return Math.min(self.vFull * sail * windSpeedK(heading, env.windDir, env.windStrength, self.upwindK), self.speedCap);
}

/** Segelanteil 0 … 1, mit dem das Schiff in Richtung `heading` das Tempo `v` (m/s) hält (Wind eingerechnet; ohne Deckel, den `Ship.speedCap` ohnehin setzt) */
export function sailForSpeed(self: SteerSelf, v: number, heading: number, env: SteerEnv): number {
  return clamp01(v / Math.max(0.1, self.vFull * windSpeedK(heading, env.windDir, env.windStrength, self.upwindK)));
}

/** Wendekreis (m) bei Fahrt `speed` */
export const radiusAt = (self: SteerSelf, speed: number): number => turnRadius(self.L, self.turnMult, self.turnK, self.perfTurn, speed);

/**
 * Ankunftsradius für Fahrtziele: mindestens 30 m, 0,8 Schiffslängen und das 2,3fache des Wendekreises beim engsten Reffen. Damit liegt jedes Ziel
 * jenseits davon außerhalb des engsten Kreises (größter Abstand eines Punktes im Kreis ist 2R): gerefft ist es immer erreichbar.
 */
export function arriveRadius(self: SteerSelf): number {
  const v = Math.min(self.vFull * STEER.slowMin, self.speedCap);
  return Math.max(30, self.L * 0.8, 2.3 * radiusAt(self, v));
}

export interface Point { x: number; z: number; t: number }

/**
 * Abfangpunkt: wo das Schiff das Ziel trifft, wenn es mit seiner (windabhängigen) Reisegeschwindigkeit geradeaus darauf zufährt. Die Rechnung läuft
 * dreimal, weil das Tempo vom Kurs abhängt: Rückenwind trägt weiter, Gegenwind bremst. `t` = Zeit bis zum Treffen (s, höchstens 25).
 */
export function interceptPoint(self: SteerSelf, tgt: SteerTarget, env: SteerEnv, out: Point): Point {
  const tvx = Math.sin(tgt.heading) * tgt.speed, tvz = Math.cos(tgt.heading) * tgt.speed;
  const dx = tgt.x - self.x, dz = tgt.z - self.z;
  let heading = Math.atan2(dx, dz);
  let t = 0;
  for (let it = 0; it < 3; it++) {
    const vTop = speedAtSail(self, 1, heading, env);
    const vs = Math.max(2, lerp(self.speed, vTop, 0.6));
    const A = tvx * tvx + tvz * tvz - vs * vs, B = 2 * (dx * tvx + dz * tvz), C = dx * dx + dz * dz;
    let tt = Math.sqrt(C) / vs;
    if (Math.abs(A) > 1e-6) {
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const s = Math.sqrt(disc), r1 = (-B - s) / (2 * A), r2 = (-B + s) / (2 * A);
        const lo = Math.min(r1, r2), hi = Math.max(r1, r2);
        tt = lo > 0 ? lo : hi > 0 ? hi : tt;
      }
    } else if (B < 0) tt = -C / B;
    t = clamp(tt, 0, 25);
    heading = Math.atan2(dx + tvx * t, dz + tvz * t);
  }
  out.x = tgt.x + tvx * t; out.z = tgt.z + tvz * t; out.t = t;
  return out;
}

const _ic: Point = { x: 0, z: 0, t: 0 };

/** Die festen Voraussetzungen eines Rammangriffs: Rammsporn (Rumpf-Stufe ≥ 4), Stoß wird gewertet, genug Rumpf, keine Pause, Ziel nicht kampfunfähig und nicht viel schwerer */
export function ramEligible(self: SteerSelf, tgt: SteerTarget, cooldown: number): boolean {
  return self.canRam && self.hullTier >= RAM_MIN_TIER && self.hullFrac >= STEER.ramHull && cooldown <= 0 && !tgt.disabled && tgt.mass <= self.mass * STEER.ramMass;
}

/**
 * Darf ein Rammangriff beginnen? Nur Schiffe mit Rammsporn (`hullTier >= RAM_MIN_TIER`), genug Rumpf, einem Ziel in annehmbarer Größe, hoher Fahrt, nach der
 * Pause, einem Bugwinkel unter 35° zum Abfangpunkt in Reichweite UND einem Ziel, das der Wendekreis noch hergibt (erforderlicher Radius `d / 2 sin α` ≥ R).
 */
export function ramWindow(self: SteerSelf, tgt: SteerTarget, cooldown: number, env: SteerEnv): boolean {
  if (!ramEligible(self, tgt, cooldown)) return false;
  if (self.speed < Math.max(RAM.minSpeed * 2, speedAtSail(self, 1, self.heading, env) * STEER.ramSpeed)) return false;
  interceptPoint(self, tgt, env, _ic);
  const dx = _ic.x - self.x, dz = _ic.z - self.z, d = Math.hypot(dx, dz);
  if (d > STEER.ramRange || d < 1) return false;
  const alpha = Math.abs(wrapAngle(Math.atan2(dx, dz) - self.heading));
  if (alpha >= STEER.ramAngle) return false;
  const need = alpha > 0.02 ? d / (2 * Math.sin(alpha)) : Infinity;
  return need >= radiusAt(self, self.speed) * 1.05;
}

/** Der Rammstoß hat getroffen (`NavalSystem.tryRam` meldet es): Pause, das Manöver darf sofort enden */
export function noteRam(nav: AiNavState): void {
  nav.ramCooldown = STEER.ramRetry;
  nav.rammed = true;
  nav.stateLockTimer = 0;
}

/** Neues Fahrtziel gesetzt: Fortschrittszähler und Neuplanung zurücksetzen */
export function resetGoal(nav: AiNavState): void {
  nav.progressRef = 1e9; nav.stuckT = 0; nav.replan = false;
}

// ---------- Welt ----------

/** Was die Fühler von der Welt brauchen (`IslandGround` erfüllt es): Inseln samt Böschung, Stege, feste Hindernisse der Raid-Instanz */
export interface SteerWorld {
  shipClearance(x: number, z: number, W: number, reach?: number): number;
  readonly piers: readonly { ax: number; az: number; bx: number; bz: number; hw: number }[];
  readonly shipBlockers: readonly Blocker[];
}

interface Obstacle { id: string; x: number; z: number; vx: number; vz: number; r: number }

// ---------- Die Lenkung ----------

export class PredictiveMaritimeSteering {
  private readonly obs: Obstacle[] = [];
  private nObs = 0;
  private readonly edgeR2: number;
  /** Arbeitsobjekte: nichts je Bild neu anlegen */
  private readonly ic: Point = { x: 0, z: 0, t: 0 };
  private readonly rayHit = [0, 0, 0, 0, 0];

  constructor(private readonly world: SteerWorld, private readonly env: SteerEnv, worldRadius: number) {
    const e = worldRadius - STEER.edge;
    this.edgeR2 = e * e;
  }

  // ----- Hindernis-Schiffe -----

  /** Vor jedem Durchgang aller KI-Schiffe: Liste der anderen Schiffe leeren … */
  clearObstacles(): void { this.nObs = 0; }

  /** … und jedes Schiff (Spieler, KI) eintragen: Lage, Geschwindigkeit (m/s, Weltachsen) und Hüllenradius */
  addObstacle(id: string, x: number, z: number, vx: number, vz: number, r: number): void {
    let o = this.obs[this.nObs];
    if (!o) { o = { id, x, z, vx, vz, r }; this.obs[this.nObs] = o; } else { o.id = id; o.x = x; o.z = z; o.vx = vx; o.vz = vz; o.r = r; }
    this.nObs++;
  }

  // ----- Fühler -----

  /** Ist der Punkt (px, pz) für dieses Schiff gesperrt? `t` = Sekunden bis dorthin (Schiffe werden entsprechend vorausberechnet), `ships` = andere Schiffe zählen */
  private blocked(px: number, pz: number, t: number, self: SteerSelf, margin: number, ignoreId: string | null, ships: boolean): boolean {
    if (px * px + pz * pz > this.edgeR2) return true;
    if (this.world.shipClearance(px, pz, self.W, margin + 2) < margin) return true;
    const piers = this.world.piers;
    for (let i = 0; i < piers.length; i++) {
      const p = piers[i];
      if (distToSegment(px, pz, p.ax, p.az, p.bx, p.bz) < p.hw + self.W * 0.5 + margin * 0.6) return true;
    }
    const bl = this.world.shipBlockers;
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      const dx = px - b.x, dz = pz - b.z;
      if (dx * dx + dz * dz > (b.r + self.W + margin + 2) ** 2) continue;
      if (b.hw === undefined && b.hd === undefined) { if (dx * dx + dz * dz < (b.r + self.W * 0.5 + margin * 0.5) ** 2) return true; continue; }
      const c = Math.cos(b.yaw ?? 0), s = Math.sin(b.yaw ?? 0);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < (b.hw ?? 0) + self.W * 0.5 + 1 + margin * 0.5 && Math.abs(lz) < (b.hd ?? 0) + self.W * 0.5 + 1 + margin * 0.5) return true;
    }
    if (ships) {
      const tt = Math.min(t, 4);
      for (let i = 0; i < this.nObs; i++) {
        const o = this.obs[i];
        if (o.id === self.id || o.id === ignoreId) continue;
        const r = o.r + self.W * 0.5 + margin * 0.5;
        const dx = px - (o.x + o.vx * tt), dz = pz - (o.z + o.vz * tt);
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    return false;
  }

  /** Reichweite der Fühler (m): wächst mit Länge und Tempo und ist nie kürzer, als der Wendekreis zum Wegdrehen braucht */
  private rangeOf(self: SteerSelf): number {
    const v = Math.max(self.speed, 2);
    return Math.max(self.L * 1.2 + v * 2.6, radiusAt(self, v) * 1.6 + self.L * 0.6, 40);
  }

  /**
   * Fünf Fühler (0°, ±22°, ±52°) von der Bugspitze aus: je sechs Messpunkte bis zur Reichweite gegen Küste samt Böschung, Stege, Mauern und andere
   * Schiffe (auf ihre Ankunftszeit vorausberechnet) und den Weltrand. Höchstens alle `senseEvery` Sekunden; das Ergebnis liegt in `nav.rays/hitDist`.
   */
  private sense(nav: AiNavState, self: SteerSelf, ignoreId: string | null, dt: number): void {
    nav.senseT -= dt;
    if (nav.senseT > 0) return;
    nav.senseT = STEER.senseEvery;
    const v = Math.max(self.speed, 2);
    const range = this.rangeOf(self), step = range / STEER.samples;
    const margin = 3 + self.L * 0.18;
    const bow = self.L * 0.44;
    const bx = self.x + Math.sin(self.heading) * bow, bz = self.z + Math.cos(self.heading) * bow;
    for (let i = 0; i < 5; i++) {
      const a = self.heading + STEER.rayAngles[i];
      const sx = Math.sin(a), sz = Math.cos(a);
      let hit = range;
      for (let k = 1; k <= STEER.samples; k++) {
        const d = step * k;
        if (this.blocked(bx + sx * d, bz + sz * d, d / v, self, margin, ignoreId, true)) { hit = d - step * 0.5; break; }
      }
      this.rayHit[i] = hit;
      nav.rays[i] = hit / range;
    }
    nav.hitDist = Math.min(this.rayHit[0], this.rayHit[1], this.rayHit[2]);
  }

  /** Liegt auf der Strecke (self → Ziel) nichts im Weg? (nur feste Hindernisse; Schiffe bewegen sich) */
  pathClear(self: SteerSelf, gx: number, gz: number): boolean {
    const dx = gx - self.x, dz = gz - self.z, d = Math.hypot(dx, dz);
    const margin = 15 + self.L * 0.18;
    const step = Math.max(24, self.L);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      if (this.blocked(self.x + dx * f, self.z + dz * f, 0, self, margin, null, false)) return false;
    }
    return true;
  }

  /**
   * Fahrtziel prüfen: liegt die Strecke frei, bleibt es; sonst dreht die Richtung (abwechselnd 36°, 72°, 108° … je Seite) bei gleichem Abstand, bis sie
   * frei ist. Findet sich nichts, geht es geradeaus. Liefert, ob das Ziel unverändert frei war. Deterministisch.
   */
  reachableGoal(self: SteerSelf, gx: number, gz: number, out: { x: number; z: number }): boolean {
    if (this.pathClear(self, gx, gz)) { out.x = gx; out.z = gz; return true; }
    const dx = gx - self.x, dz = gz - self.z, d = Math.max(80, Math.hypot(dx, dz)), base = Math.atan2(dx, dz);
    for (let k = 1; k <= 9; k++) {
      const a = base + ((k & 1) ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 5);
      const px = self.x + Math.sin(a) * d, pz = self.z + Math.cos(a) * d;
      if (this.pathClear(self, px, pz)) { out.x = px; out.z = pz; return false; }
    }
    out.x = self.x + Math.sin(self.heading) * d * 0.5; out.z = self.z + Math.cos(self.heading) * d * 0.5;
    return false;
  }

  // ----- Rudder, Zielen, Ausweichen -----

  private track(nav: AiNavState, self: SteerSelf, dt: number): void {
    nav.stateLockTimer = Math.max(0, nav.stateLockTimer - dt);
    nav.stateTime += dt;
    nav.ramCooldown = Math.max(0, nav.ramCooldown - dt);
    nav.sideT += dt;
    if (!nav.started) { nav.started = true; nav.lastHeading = self.heading; nav.headingRate = 0; return; }
    const rate = dt > 1e-6 ? wrapAngle(self.heading - nav.lastHeading) / dt : 0;
    nav.headingRate += (rate - nav.headingRate) * Math.min(1, dt * 8);
    nav.lastHeading = self.heading;
  }

  /** Ruder auf einen Winkelfehler (`rel` = Ziel − Bug, positiv = links): proportional mit Vorhalt auf die Drehgeschwindigkeit, damit das träge Ruder nicht überschwingt */
  private rudder(nav: AiNavState, self: SteerSelf, relIn: number): number {
    let rel = relIn;
    // Ziel genau hinten: in der laufenden Drehrichtung bleiben (kein Hin und Her an der Winkelnaht)
    if (Math.abs(rel) > 2.8 && Math.abs(nav.headingRate) > 0.04) rel = Math.abs(rel) * (nav.headingRate > 0 ? 1 : -1);
    const lead = 0.45 + 0.9 * heavyOf(self.L);
    const u = -(rel - nav.headingRate * lead) * STEER.rudderGain;
    return u < -1 ? -1 : u > 1 ? 1 : u;
  }

  /**
   * Auf einen Punkt zusteuern. Liegt er im Wendekreis (Abstand von der Kreismitte < R) oder in einem spitzen Winkel knapp außerhalb, werden die Segel auf
   * 0,25 … 0,45 gerefft und gehalten, bis der Kreis klein genug ist: das Schiff kreist nicht mehr. Schreibt `turn` und `sail` (ohne Ausweichen).
   */
  private seekPoint(nav: AiNavState, self: SteerSelf, gx: number, gz: number, sailNom: number, arriveR: number, dt: number, out: SteerCommand): void {
    const dx = gx - self.x, dz = gz - self.z, dist = Math.hypot(dx, dz);
    out.arrived = dist <= arriveR;
    const rel = wrapAngle(Math.atan2(dx, dz) - self.heading);
    const a = dist * Math.cos(rel), c = dist * Math.sin(rel);
    const R = Math.max(1, radiusAt(self, Math.max(self.speed, 1.5)));
    const sgn = c >= 0 ? 1 : -1;
    // Das Ruder baut die Drehung erst auf: die Kreismitte liegt um den Weg während des Aufbaus weiter vorn
    const lag = self.speed * (1 / (1.5 - 0.8 * heavyOf(self.L))) * 0.4;
    const inside = Math.hypot(a - lag, c - sgn * R) / R;
    if (inside < 1 || (inside < 1.3 && Math.abs(rel) > 0.9)) { nav.slowT = STEER.slowHold; nav.slowDepth = clamp01((1.3 - inside) / 0.7); }
    else nav.slowT = Math.max(0, nav.slowT - dt);
    let sail = sailNom;
    if (nav.slowT > 0) sail = Math.min(sail, lerp(STEER.slowMax, STEER.slowMin, nav.slowDepth));
    out.turn = this.rudder(nav, self, rel);
    out.sail = sail;
  }

  /** Auf einen Kurs (Weltwinkel) zusteuern; große Kursänderungen nehmen Fahrt heraus (engerer Kreis) */
  private seekHeading(nav: AiNavState, self: SteerSelf, des: number, sailNom: number, out: SteerCommand): void {
    const rel = wrapAngle(des - self.heading);
    out.turn = this.rudder(nav, self, rel);
    out.sail = Math.abs(rel) > 1.3 ? Math.min(sailNom, 0.5) : sailNom;
  }

  /** Freiraum (m) an einem Punkt: Küste samt Böschung, Stege, andere Schiffe (jetziger Standort) und Weltrand; positiv = frei */
  private openness(px: number, pz: number, self: SteerSelf, reach: number): number {
    let c = this.world.shipClearance(px, pz, self.W, reach);
    const piers = this.world.piers;
    for (let i = 0; i < piers.length; i++) {
      const p = piers[i];
      c = Math.min(c, distToSegment(px, pz, p.ax, p.az, p.bx, p.bz) - p.hw - self.W * 0.5);
    }
    for (let i = 0; i < this.nObs; i++) {
      const o = this.obs[i];
      if (o.id === self.id) continue;
      c = Math.min(c, Math.hypot(px - o.x, pz - o.z) - o.r - self.W * 0.5);
    }
    return Math.min(c, (Math.sqrt(this.edgeR2) - Math.hypot(px, pz)));
  }

  /**
   * Weg ins offene Wasser: 16 Richtungen rund um das Schiff, je drei Messpunkte bis zur Reichweite; gewählt wird die mit dem größten kleinsten Freiraum,
   * bei Gleichstand die mit der kleineren Kursänderung. Wird nur aus einer Sackgasse heraus gebraucht (selten), darum ohne Zwischenspeicher.
   */
  private openHeading(self: SteerSelf): number {
    const reach = Math.max(self.L * 1.5, radiusAt(self, Math.max(self.speed, 2)) * 1.5 + 20, 60);
    let best = self.heading, bestScore = -1e9;
    for (let k = 0; k < 16; k++) {
      const a = self.heading + (k / 16) * Math.PI * 2;
      const sx = Math.sin(a), sz = Math.cos(a);
      let c = 1e9;
      for (let j = 1; j <= 3; j++) c = Math.min(c, this.openness(self.x + sx * reach * (j / 3), self.z + sz * reach * (j / 3), self, reach));
      const score = c - Math.abs(wrapAngle(a - self.heading)) * 4;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  /**
   * Küsten-, Steg- und Schiffsvermeidung über die Fühler: Hindernisse links drücken nach rechts und umgekehrt. Ein Hindernis voraus wählt EINE Seite
   * (die offenere, bei Gleichstand die des Ziels, sonst nach dem Schiffs-Seed) und bleibt dabei, bis es 1,5 s lang frei war: kein Zaudern vor einem
   * Steg. Je näher, desto stärker die Mischung mit dem Zielkurs; reicht der Platz zum Wegdrehen nicht mehr (Wendekreis + halbe Länge), werden die Segel
   * gerefft. Sind voraus und beide Seiten dicht (Bucht, Sackgasse), dreht das Schiff mit wenig Fahrt zum offenen Wasser und meldet `replan`.
   */
  private avoid(nav: AiNavState, self: SteerSelf, relGoal: number, dt: number, out: SteerCommand): void {
    const r = nav.rays;
    const o0 = 1 - r[0], oL1 = 1 - r[1], oR1 = 1 - r[2], oL2 = 1 - r[3], oR2 = 1 - r[4];
    const threat = Math.max(o0, oL1 * 0.9, oR1 * 0.9, oL2 * 0.6, oR2 * 0.6);
    // Hindernisgrad in Richtung des Ziels: zwischen den Fühlern (−52°, −22°, 0°, 22°, 52°) linear gemischt, außerhalb des Fächers zählt der äußere Fühler.
    // Führt der Zielkurs vom Hindernis weg (Rückzug, Wenden zum Ziel), darf das Ausweichen ihn nicht überstimmen.
    const gA = clamp(relGoal, -STEER.rayAngles[3], STEER.rayAngles[3]) / D2R;
    let goalObs: number;
    if (gA >= 22) goalObs = lerp(oL1, oL2, (gA - 22) / 30);
    else if (gA >= 0) goalObs = lerp(o0, oL1, gA / 22);
    else if (gA >= -22) goalObs = lerp(o0, oR1, -gA / 22);
    else goalObs = lerp(oR1, oR2, (-gA - 22) / 30);
    // Sackgasse: voraus und zu beiden Seiten kaum Platz
    if (nav.escT > 0) {
      nav.escT -= dt;
      if (threat < 0.25 && nav.escT < 2.2) nav.escT = 0;
    } else if (r[0] < 0.65 && r[1] < 0.75 && r[2] < 0.75 && goalObs > 0.3) {
      nav.escHeading = this.openHeading(self);
      nav.escT = 3;
      nav.replan = true;
    }
    if (nav.escT > 0) {
      out.turn = this.rudder(nav, self, wrapAngle(nav.escHeading - self.heading));
      out.sail = Math.min(out.sail, STEER.slowMin + 0.05);
      return;
    }
    if (threat < 0.001) { nav.avoidT = Math.max(0, nav.avoidT - dt); if (nav.avoidT <= 0) nav.avoidSide = 0; return; }
    nav.avoidT = 1.5;
    let u = (oL1 * STEER.rayWeight[1] + oL2 * STEER.rayWeight[3]) - (oR1 * STEER.rayWeight[2] + oR2 * STEER.rayWeight[4]);
    if (o0 > 0.05) {
      if (nav.avoidSide === 0) {
        const roomL = r[1] + r[3], roomR = r[2] + r[4];
        if (Math.abs(roomL - roomR) > 0.15) nav.avoidSide = roomL > roomR ? -1 : 1;
        else if (Math.abs(relGoal) > 0.05) nav.avoidSide = relGoal > 0 ? -1 : 1;
        else nav.avoidSide = hash01(nav.seed, 7) < 0.5 ? -1 : 1;
      }
      u += nav.avoidSide * o0 * STEER.rayWeight[0];
    }
    out.turn = lerp(out.turn, clamp(u * 1.4, -1, 1), clamp01(threat * 1.6) * lerp(0.25, 1, clamp01(goalObs * 1.6)));
    // Fahrt drosseln, wenn der Platz zum Wegdrehen knapp wird
    const stop = radiusAt(self, Math.max(self.speed, 2)) + self.L * 0.5 + 10;
    if (nav.hitDist < stop * 1.8) out.sail = Math.min(out.sail, lerp(1, STEER.slowMin + 0.05, clamp01((stop * 1.8 - nav.hitDist) / (stop * 1.3))));
  }

  private finish(nav: AiNavState, self: SteerSelf, out: SteerCommand): void {
    out.hold = false;
    if (!(out.turn === out.turn)) out.turn = 0;
    out.turn = clamp(out.turn, -1, 1);
    out.sail = clamp(out.sail, 0, 1);
    out.state = nav.aiState;
    out.side = nav.side;
    nav.desiredSailFrac = out.sail;
    nav.desiredCourse = wrapAngle(self.heading - out.turn * 0.6);
  }

  // ----- Fahrt zu einem Ort (Streife, Händler, Formation) -----

  /**
   * Ohne Gegner: zu einem Ort fahren. Beendet jedes Gefechtsmanöver sofort (Ziel verloren); ein Rückzug (`DISENGAGE`) hält noch seine Haltezeit
   * lang seinen Kurs. `ignoreId` = Schiff, das nicht ausgewichen wird (Formationsführer). `out.arrived` = innerhalb von `arriveR`.
   */
  cruise(nav: AiNavState, self: SteerSelf, gx: number, gz: number, sailNom: number, arriveR: number, ignoreId: string | null, dt: number, out: SteerCommand): void {
    if (this.beginPassive(nav, self, ignoreId, dt, out)) return;
    this.seekPoint(nav, self, gx, gz, sailNom, arriveR, dt, out);
    // Fortschritt: kommt das Schiff in 12 s nicht 3 m näher (Bucht, Sackgasse), soll der Aufrufer ein neues Ziel wählen
    const dist = Math.hypot(gx - self.x, gz - self.z);
    if (dist < nav.progressRef - 3) { nav.progressRef = dist; nav.stuckT = 0; } else nav.stuckT += dt;
    if (nav.stuckT > 12) nav.replan = true;
    this.avoid(nav, self, wrapAngle(Math.atan2(gx - self.x, gz - self.z) - self.heading), dt, out);
    this.finish(nav, self, out);
  }

  /**
   * Gemeinsamer Anfang aller Fahrten ohne Gegner (`cruise`, `escort`, `anchor`): Zeit mitführen, messen, Gefechtsmanöver beenden. Ein Rückzug hält noch seine
   * Haltezeit lang den Kurs (liefert dann true: der Aufrufer ist fertig).
   */
  private beginPassive(nav: AiNavState, self: SteerSelf, ignoreId: string | null, dt: number, out: SteerCommand): boolean {
    this.track(nav, self, dt);
    this.sense(nav, self, ignoreId, dt);
    out.rel = 0; out.dist = 9999; out.standoff = standoffOf(self.classTier); out.arrived = false;
    if (nav.aiState === 'DISENGAGE' && nav.stateLockTimer > 0) {
      this.seekHeading(nav, self, nav.desiredCourse, 1, out);
      this.avoid(nav, self, 0, dt, out);
      this.finish(nav, self, out);
      return true;
    }
    if (nav.aiState !== 'TRANSIT') { nav.aiState = 'TRANSIT'; nav.stateLockTimer = 0; nav.stateTime = 0; }
    nav.targetShipId = null;
    return false;
  }

  /**
   * Formation halten (Begleitschiffe der Flotte): zum Platz `(px, pz)` am bewegten Flaggschiff. Das Wunschtempo folgt dem Flaggschiff und wird sanft um den
   * Rückstand korrigiert (`escortSpeed`); weit weg geht es mit allem Tuch zum Platz (mit der Wendekreis-Prüfung von `seekPoint`), nahe dran läuft das Schiff
   * parallel zum Flaggschiff und gleicht den seitlichen Fehler mit kleinen Kursänderungen aus: ruhig, ohne Kreisen. Das Flaggschiff bleibt ein Hindernis der Fühler.
   */
  escort(nav: AiNavState, self: SteerSelf, px: number, pz: number, flag: { heading: number; speed: number; yawRate?: number; side?: number }, rush: boolean, dt: number, out: SteerCommand): void {
    if (this.beginPassive(nav, self, null, dt, out)) return;
    const dx = px - self.x, dz = pz - self.z, dist = Math.hypot(dx, dz);
    const behind = dx * Math.sin(flag.heading) + dz * Math.cos(flag.heading);
    // Steht das Flaggschiff (Tempo unter 2 m/s), gibt es kein Parallelfahren und nichts zu überholen: die Schiffe fahren ihren Platz an und bleiben dort stehen (wie beim Ankern)
    if (flag.speed < 2 && !rush) { this.park(nav, self, px, pz, dt, out); return; }
    nav.anchorHeld = false;
    // Liegt der Platz achteraus (Flaggschiff dreht ein, Kiellinie): nie kehrtmachen und hinterherjagen, sondern bremsen und parallel weiterfahren, bis der Platz wieder neben dem Schiff liegt.
    // Nur beim Sammeln (rush) kehrt das Schiff um.
    const astern = behind < -0.4 * self.L && !rush;
    // rush (Sammeln): mit allem Tuch zurück, bis der Platz fast erreicht ist
    const vWant = !astern && (dist > 90 || (rush && dist > 40)) ? speedAtSail(self, 1, self.heading, this.env) : escortSpeed(slotSpeed(flag.speed, flag.yawRate ?? 0, flag.side ?? 0), behind);
    const sail = sailForSpeed(self, vWant, self.heading, this.env);
    if (dist > Math.max(40, arriveRadius(self)) && !astern) this.seekPoint(nav, self, px, pz, sail, 10, dt, out);
    else {
      const lat = dx * Math.cos(flag.heading) - dz * Math.sin(flag.heading);
      this.seekHeading(nav, self, flag.heading + clamp(lat * 0.03, -0.5, 0.5), sail, out);
      out.arrived = dist < 12;
    }
    this.avoid(nav, self, wrapAngle(Math.atan2(dx, dz) - self.heading), dt, out);
    this.finish(nav, self, out);
  }

  /**
   * Ankern: das Flaggschiff liegt am Steg oder vor einer Küste, die Begleitschiffe halten mindestens `minClear` Meter Abstand zu allen Stegen, zur Küste (samt
   * Böschung) und zu anderen Schiffen. Der Ankerplatz ist der nächste solche Punkt zum Wunschplatz; das Schiff fährt ihn mit einem Tempo an, das mit dem
   * Abstand sinkt, und steht dort (`out.hold`: Tempo 0). Kein Anrennen gegen Stege, kein Kreisen um Inseln.
   */
  anchor(nav: AiNavState, self: SteerSelf, wantX: number, wantZ: number, minClear: number, dt: number, out: SteerCommand): void {
    if (this.beginPassive(nav, self, null, dt, out)) return;
    const reach = minClear + 70;
    // Der Platz wird mit 10 m Reserve gesucht: das Schiff bleibt bis 8 m daneben stehen und hält trotzdem `minClear` ein
    if (!nav.anchorSet || Math.hypot(wantX - nav.anchorWx, wantZ - nav.anchorWz) > 60 || this.openness(nav.anchorX, nav.anchorZ, self, reach) < minClear) this.findAnchor(nav, self, wantX, wantZ, minClear + 10);
    this.park(nav, self, nav.anchorX, nav.anchorZ, dt, out);
  }

  /**
   * Einen Punkt anfahren und dort stehen bleiben (Ankerplatz, Platz neben einem stehenden Flaggschiff): der Anflug ist kritisch gedämpft, das Tempo folgt dem Abstand mit
   * einem Viertel der Verzögerung des Schiffs (wie `stepMotion`, schwere Schiffe bremsen träge), so rollt es nicht über den Punkt hinaus und kreist nicht um ihn.
   * Halten ab 8 m, lösen erst jenseits von 14 m (`out.hold`: Tempo 0).
   */
  private park(nav: AiNavState, self: SteerSelf, px: number, pz: number, dt: number, out: SteerCommand): void {
    const dx = px - self.x, dz = pz - self.z, dist = Math.hypot(dx, dz);
    const hold = nav.anchorHeld ? dist < 14 : dist < 8;
    nav.anchorHeld = hold;
    const decel = 0.45 * (1.25 - 0.7 * heavyOf(self.L));
    const vWant = Math.min(dist * decel * 0.25, speedAtSail(self, 1, self.heading, this.env));
    this.seekPoint(nav, self, px, pz, hold ? 0 : sailForSpeed(self, vWant, self.heading, this.env), 6, dt, out);
    this.avoid(nav, self, wrapAngle(Math.atan2(dx, dz) - self.heading), dt, out);
    if (hold) { out.sail = 0; out.turn = 0; }
    this.finish(nav, self, out);
    out.hold = hold;
  }

  /** Nächster Punkt zum Wunschplatz mit mindestens `minClear` Freiraum: Ringe von 20 m bis 440 m, je 16 Richtungen; im ersten Ring mit Treffer gewinnt der Punkt, der dem Schiff am nächsten liegt */
  private findAnchor(nav: AiNavState, self: SteerSelf, wx: number, wz: number, minClear: number): void {
    const reach = minClear + 60;
    nav.anchorWx = wx; nav.anchorWz = wz; nav.anchorSet = true;
    let fb = this.openness(wx, wz, self, reach), fbX = wx, fbZ = wz;
    if (fb >= minClear) { nav.anchorX = wx; nav.anchorZ = wz; return; }
    const phase = hash01(nav.seed, 11) * (Math.PI / 8);
    for (let r = 20; r <= 440; r += 20) {
      let bd = Infinity, bx = 0, bz = 0;
      for (let k = 0; k < 16; k++) {
        const a = phase + k * (Math.PI / 8);
        const px = wx + Math.sin(a) * r, pz = wz + Math.cos(a) * r;
        const o = this.openness(px, pz, self, reach);
        if (o > fb) { fb = o; fbX = px; fbZ = pz; }
        if (o >= minClear) { const d = (px - self.x) ** 2 + (pz - self.z) ** 2; if (d < bd) { bd = d; bx = px; bz = pz; } }
      }
      if (bd < Infinity) { nav.anchorX = bx; nav.anchorZ = bz; return; }
    }
    nav.anchorX = fbX; nav.anchorZ = fbZ;
  }

  // ----- Seekampf -----

  private lockFor(nav: AiNavState): number {
    return STEER.lockMin + (STEER.lockMax - STEER.lockMin) * hash01(nav.seed, nav.seq++);
  }

  private enter(nav: AiNavState, state: AiManeuver): void {
    if (nav.aiState !== state) { nav.aiState = state; nav.stateTime = 0; nav.rammed = false; nav.senseT = 0; }
    nav.stateLockTimer = this.lockFor(nav);
  }

  /** Breitseite wählen: die Seite, zu der das Schiff am wenigsten drehen muss; eine nachladende Seite zählt wie 0,8 rad mehr */
  private chooseSide(nav: AiNavState, self: SteerSelf, tgt: SteerTarget): void {
    const rel = wrapAngle(Math.atan2(tgt.x - self.x, tgt.z - self.z) - self.heading);
    const costL = Math.abs(wrapAngle(rel - Math.PI / 2)) + (self.reloadL > 1.5 ? 0.8 : 0);
    const costR = Math.abs(wrapAngle(rel + Math.PI / 2)) + (self.reloadR > 1.5 ? 0.8 : 0);
    nav.side = costL <= costR ? 1 : -1;
    nav.sideT = 0;
  }

  /**
   * Im Gefecht gegen ein Ziel: Zustandsmaschine mit 4 … 6 s Mindest-Haltezeit.
   * - `APPROACH`: windbewusster Abfangkurs auf den Gefechtsabstand.
   * - `BROADSIDE_ORBIT`: paralleler Kurs auf Kanonenreichweite; Seitenwechsel nur, wenn die eigene Seite nachlädt und die andere bereit ist.
   * - `RAM_CHARGE`: nur mit Rammsporn (Rumpf-Stufe ≥ 4), günstigem Bugwinkel (< 35°) und hoher Fahrt.
   * - `DISENGAGE`: Rückzug bei kritischem Rumpf- oder Segelschaden (< 22 %) oder Flucht-Befehl.
   * Schnelle Übergänge, die die Haltezeit übergehen: Gefecht beginnt, Rückzug wegen Schaden, Rammstoß erfolgt.
   */
  fight(nav: AiNavState, self: SteerSelf, tgt: SteerTarget, dt: number, out: SteerCommand): void {
    this.track(nav, self, dt);
    nav.targetShipId = tgt.id;
    const env = this.env;
    const dx = tgt.x - self.x, dz = tgt.z - self.z, dist = Math.hypot(dx, dz);
    const od = standoffOf(self.classTier);
    const bearing = Math.atan2(dx, dz);
    const rel = wrapAngle(bearing - self.heading);
    out.rel = rel; out.dist = dist; out.standoff = od; out.arrived = false;

    // ----- Zustandswechsel -----
    const critical = self.hullFrac < STEER.critical || self.sailFrac < STEER.critical;
    const healed = self.hullFrac >= STEER.recovered && self.sailFrac >= STEER.recovered;
    const mustFlee = self.flee || (!self.brave && (nav.aiState === 'DISENGAGE' ? !healed : critical));
    const st = nav.aiState;
    if (mustFlee) {
      if (st !== 'DISENGAGE') this.enter(nav, 'DISENGAGE');
    } else if (st === 'TRANSIT') {
      // Gefecht beginnt: kein Warten auf eine Haltezeit
      this.chooseSide(nav, self, tgt);
      this.enter(nav, dist <= od * STEER.orbitEnter ? 'BROADSIDE_ORBIT' : 'APPROACH');
    } else if (st === 'DISENGAGE') {
      if (nav.stateLockTimer <= 0) { this.chooseSide(nav, self, tgt); this.enter(nav, dist <= od * STEER.orbitEnter ? 'BROADSIDE_ORBIT' : 'APPROACH'); }
    } else if (st === 'RAM_CHARGE') {
      const alpha = Math.abs(rel);
      const lost = alpha > STEER.ramAbort || tgt.disabled || self.hullFrac < STEER.ramHull - 0.05 || nav.stateTime > 14;
      if (nav.rammed || (nav.stateLockTimer <= 0 && lost)) {
        nav.ramCooldown = Math.max(nav.ramCooldown, STEER.ramRetry);
        this.chooseSide(nav, self, tgt);
        this.enter(nav, dist > od * STEER.orbitLeave ? 'APPROACH' : 'BROADSIDE_ORBIT');
      }
    } else if (nav.stateLockTimer <= 0) {
      if (ramWindow(self, tgt, nav.ramCooldown, env)) this.enter(nav, 'RAM_CHARGE');
      else if (st === 'APPROACH' && dist <= od * STEER.orbitEnter && !(ramEligible(self, tgt, nav.ramCooldown) && nav.stateTime < STEER.ramRunMax)) {
        // ein Anlauf, der nicht zum Stoß kam, wird erst nach einer halben Pause wiederholt
        if (ramEligible(self, tgt, nav.ramCooldown)) nav.ramCooldown = Math.max(nav.ramCooldown, STEER.ramRetry * 0.5);
        this.chooseSide(nav, self, tgt); this.enter(nav, 'BROADSIDE_ORBIT');
      }
      else if (st === 'BROADSIDE_ORBIT' && (dist > od * STEER.orbitLeave || (nav.stateTime > STEER.ramRunEvery && ramEligible(self, tgt, nav.ramCooldown)))) this.enter(nav, 'APPROACH');
      else if (st === 'BROADSIDE_ORBIT' && nav.sideT > STEER.sideEvery && dist > od * 0.75 && dist < od * 1.6) {
        // Seitenwechsel: die eigene Seite lädt noch lange nach, die andere ist feuerbereit
        const cur = nav.side > 0 ? self.reloadL : self.reloadR, other = nav.side > 0 ? self.reloadR : self.reloadL;
        if (cur > 2 && other < 0.4) { nav.side = nav.side > 0 ? -1 : 1; nav.sideT = 0; nav.stateLockTimer = this.lockFor(nav); }
      }
    }

    // ----- Manöver -----
    // Wer rammen will (Anlauf oder Angriff), weicht dem Ziel nicht aus; allen anderen ist es ein Hindernis
    this.sense(nav, self, nav.aiState === 'RAM_CHARGE' || (nav.aiState === 'APPROACH' && ramEligible(self, tgt, nav.ramCooldown)) ? tgt.id : null, dt);
    switch (nav.aiState) {
      case 'APPROACH': {
        // Abfangpunkt mit Wind, dann auf den Gefechtsabstand davor bleiben (nie in den Rumpf)
        const ic = interceptPoint(self, tgt, env, this.ic);
        const ix = ic.x - self.x, iz = ic.z - self.z, il = Math.hypot(ix, iz) || 1;
        // Wer rammen darf, hält direkt auf das Ziel zu (Anlauf); alle anderen bleiben auf Gefechtsabstand davor (liegt der Punkt hinter dem Schiff, dreht es ab)
        const stay = ramEligible(self, tgt, nav.ramCooldown) ? 0 : od * 0.9;
        this.seekPoint(nav, self, ic.x - (ix / il) * stay, ic.z - (iz / il) * stay, 1, 12, dt, out);
        break;
      }
      case 'RAM_CHARGE': {
        const ic = interceptPoint(self, tgt, env, this.ic);
        this.seekPoint(nav, self, ic.x, ic.z, 1, 8, dt, out);
        break;
      }
      case 'DISENGAGE': {
        let away = Math.atan2(self.x - tgt.x, self.z - tgt.z);
        const r = Math.hypot(self.x, self.z), edge = Math.sqrt(this.edgeR2) - 230;
        if (r > edge) away += wrapAngle(Math.atan2(-self.x, -self.z) - away) * clamp01((r - edge) / 200);
        this.seekHeading(nav, self, away, 1, out);
        break;
      }
      default: this.orbit(nav, self, tgt, dist, od, out);
    }
    this.avoid(nav, self, rel, dt, out);
    this.finish(nav, self, out);
  }

  /** Parallelkurs: das Ziel bleibt mit der Breitseite in Kanonenreichweite, der Abstand regelt den Winkel, ein bewegtes Ziel gibt die Fahrtrichtung vor */
  private orbit(nav: AiNavState, self: SteerSelf, tgt: SteerTarget, dist: number, od: number, out: SteerCommand): void {
    const lead = Math.min(1.5, dist / Math.max(self.speed, 4));
    const bx = tgt.x + Math.sin(tgt.heading) * tgt.speed * lead - self.x, bz = tgt.z + Math.cos(tgt.heading) * tgt.speed * lead - self.z;
    const bearing = Math.atan2(bx, bz);
    const bias = clamp((dist - od) / (od * 0.5), -1, 1);
    const orbitHeading = bearing - nav.side * (Math.PI / 2) * (1 - 0.75 * bias);
    let des = orbitHeading;
    if (tgt.speed > 2) {
      // Parallelkurs: Fahrtrichtung des Ziels oder ihr Gegenteil, je nachdem, was näher am Umkreisungskurs liegt
      const same = wrapAngle(tgt.heading - orbitHeading), opp = wrapAngle(tgt.heading + Math.PI - orbitHeading);
      des = orbitHeading + (Math.abs(same) <= Math.abs(opp) ? same : opp) * 0.55 * (1 - Math.abs(bias)) * clamp01(tgt.speed / 6);
    }
    // Praktisch im Ziel (nach einem Stoß): die Peilung taugt nichts mehr, der Kurs bleibt, bis die Rümpfe getrennt sind
    if (dist < 8) des = self.heading;
    // Tempo: ein stehendes Ziel wird mit knapp halber Fahrt umkreist, ein fahrendes begleitet; zu weit weg = aufholen, zu nah = bremsen
    const vTop = speedAtSail(self, 1, self.heading, this.env);
    const want = Math.max(0.45 * vTop, tgt.speed + clamp((dist - od) * 0.12, -4, 7));
    const sail = clamp(want / Math.max(0.1, self.vFull * windSpeedK(des, this.env.windDir, this.env.windStrength, self.upwindK)), 0.3, 1);
    this.seekHeading(nav, self, des, sail, out);
  }
}
