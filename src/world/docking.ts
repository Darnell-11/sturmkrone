import { angleDiff, clamp01, wrapAngle } from '../core/mathUtil';
// Anlegen, Gangway, Leitern und Enterbrücken: reine Daten und Geometrie ohne three.js.
// `DockingState` und `BoardingSession` sind JSON-taugliche Simulationsdaten (später Server/Mehrspieler); die Meshes (`dockingFx.ts`)
// und der Boden (`CompositeGround`) lesen sie nur. Alles Maße in Metern, Winkel im Bogenmaß wie `heading` (0 = +z, wächst zu +x).

/** Steilste Neigung einer begehbaren Brücke (Gangway, Planke): unter dem Rampenlimit des Sweeps (42°) mit Reserve für das Schaukeln */
export const MAX_BRIDGE_DEG = 38;
/** Entwurfswinkel beim Planen (Reserve bis MAX_BRIDGE_DEG für Wellengang an den Ankern) */
export const PLAN_BRIDGE_DEG = 33;
/** Höhenunterschied der Decks, bis zu dem Enterplanken reichen; darüber Belagerungs-/Enterleitern */
export const PLANK_MAX_DH = 1.8;
/** Abstand Bordwand – Stegkante beim Festmachen */
export const MOOR_GAP = 0.9;
/** Anlegen wird ab diesem Tempo (m/s) und Winkel zum Steg (rad) angeboten */
export const DOCK_MAX_SPEED = 2.5;
export const DOCK_MAX_ANGLE = (50 * Math.PI) / 180;
/** Höhe, bis zu der ein Läufer auf eine Brücke „aufsteigt“ (Schaukeln, Stufe) */
export const BRIDGE_STEP = 0.75;
/** Lichte Höhe unter einer Brücke, ab der man darunter durchgehen darf (sonst ist die Fläche darunter gesperrt) */
export const BRIDGE_CLEARANCE = 2.1;

export type DockingPhase = 'gliding' | 'moored' | 'departing';

/** Zustand „Schiff liegt an einem Steg“ – nur Daten (keine Meshes) */
export interface DockingState {
  shipId: string;
  pierId: string;
  /** Seite des Stegs, an der das Schiff liegt (+1 = links der Stegrichtung a → b, −1 = rechts) */
  side: 1 | -1;
  /** Position der Schiffsmitte längs des Stegs in m ab `a` (Gangway-Punkt; Bug und Heck dürfen überstehen) */
  u: number;
  /** Richtung des Buges längs des Stegs: +1 = Richtung b, −1 = Richtung a */
  dir: 1 | -1;
  phase: DockingPhase;
}

export type BoardingPhase = 'hooks' | 'pulling' | 'bridging' | 'fight' | 'retracting' | 'done';
export type BridgeType = 'planks' | 'ladders';

/** Zustand eines Enterkampfs – nur Daten */
export interface BoardingSession {
  attackerShipId: string;
  targetShipId: string;
  phase: BoardingPhase;
  bridgeType: BridgeType;
}

/** Steg als reine Strecke (Weltkoordinaten) mit Kennung */
export interface PierLine { id: string; ax: number; az: number; bx: number; bz: number; hw: number; y: number }

export interface Vec2 { x: number; z: number }

/** Einheitsvektor längs des Stegs und seine linke Normale (wie `clampToPier` in islandGround) */
export function pierAxes(p: PierLine) {
  const vx = p.bx - p.ax, vz = p.bz - p.az, len = Math.hypot(vx, vz) || 1;
  return { ux: vx / len, uz: vz / len, nx: -vz / len, nz: vx / len, len };
}

/** Längs- und Querkoordinate eines Weltpunkts bezogen auf einen Steg (u ab `a`, l positiv links) */
export function pierCoords(p: PierLine, x: number, z: number) {
  const a = pierAxes(p);
  return { u: (x - p.ax) * a.ux + (z - p.az) * a.uz, l: (x - p.ax) * a.nx + (z - p.az) * a.nz, len: a.len };
}

/** Weltpunkt aus Steg-Koordinaten */
export function pierPoint(p: PierLine, u: number, l: number, out: Vec2 = { x: 0, z: 0 }): Vec2 {
  const a = pierAxes(p);
  out.x = p.ax + a.ux * u + a.nx * l;
  out.z = p.az + a.uz * u + a.nz * l;
  return out;
}

/** Abstand der Schiffsachse von der Stegachse beim Festmachen: halbe Stegbreite + halbe Schiffsbreite + Fender */
export function berthSeparation(pierHw: number, shipW: number): number { return pierHw + shipW / 2 + mooringGap(shipW); }

/** Luft zwischen Bordwand und Stegkante: Grundwert plus 10 % der Schiffsbreite (große Schiffe wölben sich weiter aus, brauchen mehr Abstand) */
export function mooringGap(shipW: number): number { return MOOR_GAP + 0.1 * shipW; }

/** Lage des Schiffs (Mitte, Kurs) an einem Liegeplatz */
export function berthPose(p: PierLine, side: 1 | -1, u: number, dir: 1 | -1, shipW: number, out: { x: number; z: number; heading: number } = { x: 0, z: 0, heading: 0 }) {
  const a = pierAxes(p);
  const sep = berthSeparation(p.hw, shipW);
  out.x = p.ax + a.ux * u + a.nx * side * sep;
  out.z = p.az + a.uz * u + a.nz * side * sep;
  out.heading = Math.atan2(a.ux * dir, a.uz * dir);
  return out;
}

/**
 * Überhang-Regel: Das Schiff wird MITTIG über den Gangway-Punkt (Stegmitte) gelegt, nicht nach seiner Länge geprüft. Bug und Heck
 * dürfen über den Steg hinausragen (Linienschiff 58 m an einem 32-m-Außenposten-Steg: 13 m Überstand an jedem Ende).
 */
export function berthU(pierLen: number): number { return pierLen / 2; }

/** Überstand von Bug und Heck über die Stegenden (m, 0 = liegt innerhalb) bei Schiffsmitte `u` */
export function overhang(pierLen: number, shipL: number, u: number): { bow: number; stern: number } {
  return { bow: Math.max(0, u + shipL / 2 - pierLen), stern: Math.max(0, shipL / 2 - u) };
}

/** Liegeplatz einer Seite eines Stegs (Daten: ohne Meshes) */
export interface Berth { pierId: string; side: 1 | -1; u: number; dir: 1 | -1; x: number; z: number; heading: number; /** Schiffs-z des Zugangs (Gangway-Landestelle) an Deck; fehlt = Deckmitte */ gz?: number }

/** Alle Liegeplätze eines Stegs für ein Schiff: beide Seiten, Bug jeweils in die zum Schiff passende Richtung `dir` */
export function berthsFor(p: PierLine, shipW: number, dir: 1 | -1): Berth[] {
  const u = berthU(pierAxes(p).len);
  return ([1, -1] as const).map((side) => {
    const pose = berthPose(p, side, u, dir, shipW);
    return { pierId: p.id, side, u, dir, x: pose.x, z: pose.z, heading: pose.heading };
  });
}

/** Winkel zwischen zwei Richtungen als Gerade (0 … π/2): Steg und Schiff dürfen auch gegenläufig liegen */
export function lineAngle(h1: number, h2: number): number {
  const d = angleDiff(h1, h2);
  return Math.min(d, Math.PI - d);
}

/** Läuft der Bug längs des Stegs in Richtung b (+1) oder a (−1)? */
export function bowDir(p: PierLine, heading: number): 1 | -1 {
  const a = pierAxes(p);
  return Math.sin(heading) * a.ux + Math.cos(heading) * a.uz >= 0 ? 1 : -1;
}

/** Kandidat für „Anlegen“: Tempo, Winkel und Lage zum Steg prüfen; liefert den Liegeplatz oder null */
export function pickBerth(p: PierLine, ship: { x: number; z: number; heading: number; speed: number; L: number; W: number }, reach = 60): Berth | null {
  if (Math.abs(ship.speed) >= DOCK_MAX_SPEED) return null;
  const a = pierAxes(p);
  const heading = Math.atan2(a.ux, a.uz);
  const c = pierCoords(p, ship.x, ship.z);
  // Seitlich an der Stegspitze (oder dahinter, vom Wasser her) darf das Schiff in beliebiger Lage herankommen: es dreht sich beim Gleiten parallel
  const nearTip = c.u > c.len - 10;
  if (!nearTip && lineAngle(ship.heading, heading) >= DOCK_MAX_ANGLE) return null;
  const sep = berthSeparation(p.hw, ship.W);
  // seitlich nah genug (bis `reach` m vom Liegeplatz), längs über dem Steg (Schiffsmitte zwischen den Stegenden plus Überstand)
  if (Math.abs(Math.abs(c.l) - sep) > reach) return null;
  // (große Schiffe, die die Küste vom Strand fernhält, liegen bei der Anfahrt weit hinter der Stegspitze: ihre Mitte darf bis L/2 darüber hinaus sein)
  if (c.u < -ship.L * 0.25 || c.u > c.len + ship.L * 0.5 + 90) return null; // auch von ganz vorn (hinter der Stegspitze) seitlich heranfahren
  const side: 1 | -1 = c.l >= 0 ? 1 : -1;
  const dir = bowDir(p, ship.heading);
  const u = berthU(c.len);
  const pose = berthPose(p, side, u, dir, ship.W);
  return { pierId: p.id, side, u, dir, x: pose.x, z: pose.z, heading: pose.heading };
}

// ---------- Brücken ----------

export type BridgeKind = 'gangway' | 'plank' | 'ladder' | 'wade';

/** Befestigungspunkt einer Brücke: fest in der Welt oder am Deck eines Schiffs (Schiffskoordinaten; die Höhe folgt dem Deck) */
export type Anchor =
  | { ref: 'world'; x: number; z: number; y: number }
  | { ref: 'ship'; shipId: string; lx: number; lz: number; dy: number };

/** Serialisierbare Beschreibung einer Brücke */
export interface BridgeDef {
  id: string;
  kind: BridgeKind;
  /** Anfang (Land/unteres Ende) und Ende (Deck/oberes Ende) */
  a: Anchor;
  b: Anchor;
  /** halbe Breite des Laufstreifens */
  hw: number;
  /** Länge (m, im Grundriss) der freien Enden: dort liegt die Brücke über begehbarem Deck/Boden und begrenzt seitlich nicht (Geländer nur dazwischen) */
  freeA: number;
  freeB: number;
  /** Eingefahren/Ausgefahren 0 … 1 (Animation; nur ausgefahrene Brücken sind begehbar) */
  out: number;
}

/** Laufende Lage einer Brücke (aus den Ankern je Logikbild berechnet, ohne Allokationen) */
export interface BridgeFrame {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  /** Länge im Grundriss, Einheitsrichtung a → b */
  len: number; ux: number; uz: number;
  /** Neigung in Rad (positiv = steigt von a nach b) */
  slope: number;
}

export function makeFrame(): BridgeFrame { return { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, len: 1, ux: 1, uz: 0, slope: 0 }; }

/** Frame aus zwei Punkten füllen */
export function setFrame(f: BridgeFrame, ax: number, ay: number, az: number, bx: number, by: number, bz: number): BridgeFrame {
  f.ax = ax; f.ay = ay; f.az = az; f.bx = bx; f.by = by; f.bz = bz;
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  f.len = Math.max(1e-3, len);
  f.ux = len > 1e-6 ? dx / len : 1;
  f.uz = len > 1e-6 ? dz / len : 0;
  f.slope = Math.atan2(by - ay, f.len);
  return f;
}

export function slopeDeg(f: BridgeFrame): number { return Math.abs(f.slope) * 180 / Math.PI; }
/** Länge der Brücke im Raum */
export function spanLength(f: BridgeFrame): number { return Math.hypot(f.len, f.by - f.ay); }

/** Längs- (s ab a) und Querkoordinate (l, links positiv) eines Weltpunkts */
export function frameCoords(f: BridgeFrame, x: number, z: number, out: { s: number; l: number }) {
  const dx = x - f.ax, dz = z - f.az;
  out.s = dx * f.ux + dz * f.uz;
  out.l = dx * -f.uz + dz * f.ux;
  return out;
}

/** Höhe der Brücke bei Längskoordinate s (ohne Begrenzung auf 0 … len) */
export function frameHeight(f: BridgeFrame, s: number): number {
  const t = clamp01(s / f.len);
  return f.ay + (f.by - f.ay) * t;
}

/** Waagerechte Länge, die eine Rampe für `dh` Höhenunterschied mindestens braucht, ohne `deg` zu überschreiten */
export function minRun(dh: number, deg = PLAN_BRIDGE_DEG): number { return Math.abs(dh) / Math.tan((deg * Math.PI) / 180); }

// ---------- Gangway ----------

export interface GangwayInput {
  /** Halbe Stegbreite, Bohlenhöhe, Länge des Stegs */
  pierHw: number; pierY: number; pierLen: number;
  /** Seite des Schiffs (+1 links der Stegachse, −1 rechts) */
  side: 1 | -1;
  /** Halbe Schiffsbreite an der Gangway-Stelle und Abstand der Deck-Landestelle von der Bordkante nach innen */
  shipHalfW: number; inset: number;
  /** Deckshöhe an der Landestelle (Welt, Ruhelage) */
  deckY: number;
  /** Längsposition der Landestelle auf dem Steg (u ab a) */
  uTop: number;
  /** Schiffsbreite gesamt (für den Liegeabstand) */
  shipW: number;
}

export interface GangwayPlan {
  /** Fußpunkt auf den Bohlen und Landestelle an Deck in Steg-Koordinaten (u längs, l quer) */
  footU: number; footL: number; topU: number; topL: number;
  /** Höhenunterschied, Grundrisslänge, Raumlänge, Neigung in Grad */
  dh: number; run: number; length: number; deg: number;
  /** Läuft der Fuß in Richtung Stegwurzel (−1) oder -spitze (+1) von der Landestelle weg? */
  alongDir: 1 | -1;
}

/**
 * Gangway planen: Der Fuß steht auf den Bohlen (nahe der Stegmitte), die Landestelle an Deck liegt hinter der Reling. Quer überbrückt
 * sie nur Stegbreite plus Spalt; fehlt die Länge für die Neigung (große Schiffe), läuft die Gangway schräg längs des Stegs –
 * Länge = Höhenunterschied / tan(33°), also unter dem Limit von 38°.
 */
export function planGangway(g: GangwayInput): GangwayPlan {
  const dh = g.deckY - g.pierY;
  const sep = berthSeparation(g.pierHw, g.shipW);
  // Landestelle quer: Schiffsachse minus Abstand der Landestelle von der Schiffsmitte (zum Steg hin)
  const topL = g.side * (sep - (g.shipHalfW - g.inset));
  const footL = g.side * Math.min(g.pierHw * 0.15, 0.4);
  const dl = Math.abs(topL - footL);
  const need = Math.max(minRun(dh), 2.0);
  const run = Math.max(need, dl);
  const du = Math.sqrt(Math.max(0, run * run - dl * dl));
  // Fuß in Richtung Wurzel, wenn dort Platz ist, sonst zur Spitze; bleibt mindestens 0,8 m von den Enden
  let alongDir: 1 | -1 = -1;
  let footU = g.uTop - du;
  if (footU < 0.8) { alongDir = 1; footU = g.uTop + du; }
  footU = Math.max(0.8, Math.min(g.pierLen - 0.8, footU));
  const realRun = Math.hypot(g.uTop - footU, topL - footL);
  const length = Math.hypot(realRun, dh);
  return { footU, footL, topU: g.uTop, topL, dh, run: realRun, length, deg: Math.atan2(Math.abs(dh), realRun) * 180 / Math.PI, alongDir };
}

// ---------- Enterplanken und Leitern ----------

/**
 * Planke über den Spalt zwischen zwei Decks: gleiche Abstände auf beiden Seiten. Reicht der natürliche Grundriss (Spalt + beide
 * Randstreifen) für die Neigung nicht, werden die Enden gleichmäßig nach innen auf die Decks gelegt (Rest-Auflage auf dem Deck).
 * Rückgabe: Grundrisslänge, Verlängerung je Ende, Neigung.
 */
export function planPlank(dh: number, natural: number): { run: number; extend: number; deg: number } {
  const need = minRun(dh);
  const run = Math.max(natural, need);
  const extend = Math.max(0, (run - natural) / 2);
  return { run, extend, deg: Math.atan2(Math.abs(dh), run) * 180 / Math.PI };
}

/** Wie viele Planken: kleine Schiffe zwei, ab 30 m Länge drei */
export function plankCount(shortL: number): number { return shortL >= 30 ? 3 : 2; }

/** Brückenart nach Deckshöhenunterschied */
export function bridgeTypeFor(dh: number): BridgeType { return Math.abs(dh) <= PLANK_MAX_DH ? 'planks' : 'ladders'; }

/**
 * Abstand der beiden Schiffsachsen nach dem Heranziehen (Enterhaken): halbe Breiten plus 0,6 m. Dieselbe Zahl gilt für Anlegen
 * an Schiffe wie für den Steg-Fender nur mit `MOOR_GAP`.
 */
export function boardGap(w1: number, w2: number): number { return w1 / 2 + w2 / 2 + 1.6; }

// ---------- Heranziehen beim Entern ----------

/** Sanftes Anfahren und Abbremsen (0 … 1) */
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);

/** Geplanter Zug: Start- und Endlage beider Schiffe, Dauer und Fortschritt (reine Zahlen) */
export interface PullPlan {
  t: number; T: number;
  a0: { x: number; z: number }; af: { x: number; z: number };
  b0: { x: number; z: number; h: number }; bf: { x: number; z: number };
  /** Zielkurs des Gegners und Drehung dahin (kürzester Weg) */
  hB: number; dh: number;
  bumped: boolean;
}

/**
 * Heranziehen planen: Das Ziel liegt am Ende parallel längsseits (Achsabstand `gap`), der Angreifer rückt 30 % der Strecke entgegen.
 * Dauer 3 bis 6,5 s je nach Strecke, nie länger – das Heranziehen wird also nie übersprungen oder abgeschnitten.
 * Gleichlauf (`par`): ist der Gegner eher mit dem Bug in Richtung des Angreifers gedreht, dreht er auf Gegenkurs, sonst auf gleichen Kurs
 * (nie mehr als 90° Drehung).
 */
export function planPull(a: { x: number; z: number; heading: number; cls: { W: number } }, b: { x: number; z: number; heading: number; cls: { W: number } }): PullPlan {
  const side = ((b.x - a.x) * Math.cos(a.heading) + (b.z - a.z) * -Math.sin(a.heading)) >= 0 ? 1 : -1;
  const gap = boardGap(a.cls.W, b.cls.W);
  const ax = Math.cos(a.heading) * side, az = -Math.sin(a.heading) * side;
  const par = Math.cos(a.heading - b.heading) > 0;
  const hB = par ? a.heading : a.heading + Math.PI;
  const k = 0.3;
  const gx = a.x + ax * gap, gz = a.z + az * gap;
  const dAx = (k / (1 - k)) * (gx - b.x), dAz = (k / (1 - k)) * (gz - b.z);
  const af = { x: a.x + dAx, z: a.z + dAz };
  const bf = { x: af.x + ax * gap, z: af.z + az * gap };
  const dist = Math.hypot(bf.x - b.x, bf.z - b.z);
  const dh = wrapAngle(hB - b.heading);
  const T = Math.max(3, Math.min(6.5, 2.6 + dist * 0.09 + Math.abs(dh) * 0.8));
  return { t: 0, T, a0: { x: a.x, z: a.z }, af, b0: { x: b.x, z: b.z, h: b.heading }, bf, hB, dh, bumped: false };
}

/** Lage beider Schiffe beim Fortschritt `u` (0 … 1) des Zugs: Drehung früher fertig als die Fahrt, damit der Gegner zuletzt nur seitlich anliegt */
export function pullPose(pl: PullPlan, u: number) {
  const base = easeInOut(clamp01(u));
  // die Crew holt im Takt ein: kleine Wellen, die zum Ende ausklingen
  const surge = Math.sin(u * Math.PI * 7) * 0.014 * (1 - u) * clamp01(u * 5);
  const p = clamp01(base + surge);
  const r = easeOut(clamp01(u / 0.72));
  return {
    p,
    ax: pl.a0.x + (pl.af.x - pl.a0.x) * p, az: pl.a0.z + (pl.af.z - pl.a0.z) * p,
    bx: pl.b0.x + (pl.bf.x - pl.b0.x) * p, bz: pl.b0.z + (pl.bf.z - pl.b0.z) * p,
    bh: pl.b0.h + pl.dh * r,
  };
}

// ---------- Deck: Arbeitsbereich und Zugang ----------

/** Was von einem Schiffsmodell für die Deckplanung gebraucht wird (reine Zahlen, kein three.js) */
export interface DeckModelLike {
  halfWidth(z: number): number;
  blockers: { cx: number; cz: number; hx: number; hz: number }[];
  quarter?: { z1: number; stairLen: number } | null;
  fore?: { z0: number; stairLen: number } | null;
}

/** Hauptdeck-Arbeitsbereich (Schiffs-z): hinter dem Achterdeck-Aufgang bis vor das Vorderkastell – derselbe Bereich wie in `CrewAboard` */
export function mainDeckRange(m: DeckModelLike, L: number): { lo: number; hi: number } {
  return { lo: m.quarter ? m.quarter.z1 + m.quarter.stairLen + 1.0 : -L / 2 + L * 0.28, hi: m.fore ? m.fore.z0 - m.fore.stairLen - 1.0 : L * 0.4 };
}

/** Punkt (x,z) frei von festen Aufbauten (mit Abstand)? */
export function freeOf(blockers: { cx: number; cz: number; hx: number; hz: number }[], x: number, z: number, margin: number): boolean {
  for (const b of blockers) if (Math.abs(x - b.cx) < b.hx + margin && Math.abs(z - b.cz) < b.hz + margin) return false;
  return true;
}

/** Abstand der Landestelle von der Bordkante (nach innen), Breite des freizuhaltenden Zugangs */
export const GATE_INSET = 0.5;
export const GATE_HALF = 1.5;

/** Begehbare halbe Breite des Hauptdecks (wie `DeckGround.constrain`: 85 % der Rumpfbreite) */
export function deckWalkHalf(m: DeckModelLike, lz: number, r = 0.35): number { return Math.max(0.3, m.halfWidth(lz) * 0.85 - r); }

/**
 * Zugang (Gangway, Leiter) am Hauptdeck: Schiffs-z der Stelle, an der beide Bordseiten bis 3 m ins Deck frei von festen Aufbauten sind,
 * nächst der Mitte des Arbeitsbereichs. Gilt für beide Seiten gleich, damit Crew und Truppen ihn unabhängig von der Seite freihalten.
 */
export function deckGate(m: DeckModelLike, L: number): number {
  const { lo, hi } = mainDeckRange(m, L);
  const mid = (lo + hi) / 2;
  const ok = (z: number) => {
    const w = deckWalkHalf(m, z);
    for (const s of [-1, 1]) for (const dx of [0, 1.2, 2.4, 3.2]) { const x = w - GATE_INSET - dx; if (x < 0.9) break; if (!freeOf(m.blockers, s * x, z, 0.7)) return false; }
    return true;
  };
  for (let k = 0; k <= 60; k++) {
    for (const sg of k === 0 ? [1] : [1, -1]) {
      const z = mid + sg * k * 0.3;
      if (z >= lo && z <= hi && ok(z)) return z;
    }
  }
  return mid;
}

/**
 * Mögliche Zugänge am Hauptdeck: Mitte, achterster und vorderster freier Platz. Große Schiffe, die über das Stegende überstehen, legen
 * die Gangway weiter achtern oder vorn an, damit die Landestelle noch auf den Bohlen liegt.
 */
export function deckGates(m: DeckModelLike, L: number): { mid: number; aft: number; fore: number } {
  const { lo, hi } = mainDeckRange(m, L);
  const ok = (z: number) => {
    const w = deckWalkHalf(m, z);
    for (const s of [-1, 1]) for (const dx of [0, 1.2, 2.4, 3.2]) { const x = w - GATE_INSET - dx; if (x < 0.9) break; if (!freeOf(m.blockers, s * x, z, 0.7)) return false; }
    return true;
  };
  let aft = lo, fore = hi;
  for (let z = lo; z <= hi; z += 0.3) if (ok(z)) { aft = z; break; }
  for (let z = hi; z >= lo; z -= 0.3) if (ok(z)) { fore = z; break; }
  return { mid: deckGate(m, L), aft, fore };
}

/** Rechtecke (Schiffskoordinaten), die Deck-Crew und Truppen freihalten: die Zugänge (Mitte, achtern, vorn) auf beiden Seiten */
export function gateKeepOut(m: DeckModelLike, L: number): { cx: number; cz: number; hx: number; hz: number }[] {
  const g = deckGates(m, L);
  const zs = [g.mid, g.aft, g.fore].filter((z, i, a) => a.findIndex((q) => Math.abs(q - z) < 1.2) === i);
  const out: { cx: number; cz: number; hx: number; hz: number }[] = [];
  for (const z of zs) { const w = deckWalkHalf(m, z); for (const s of [-1, 1]) out.push({ cx: s * (w - GATE_INSET - 1.0), cz: z, hx: 2.2, hz: GATE_HALF }); }
  return out;
}

// ---------- Laufwege (Offiziere, Trupps) ----------

/** Wegpunkt: Gehen, oder Klettern an der Leiter `climb` (aufwärts `up` = vom Fuß zur Spitze); x/z = Ziel nach dem Klettern */
export interface RoutePoint { x: number; z: number; climb?: string; up?: boolean }

/** Laufweg über Brücken: je Wegpunkt zum nächsten; Wächter gegen Hängenbleiben */
export interface Route {
  pts: RoutePoint[];
  i: number;
  /** Zeit ohne nennenswerten Fortschritt (s) und letzter Abstand zum Ziel */
  stuck: number;
  /** Ab dieser `stuck`-Zeit folgt der nächste Nachrück-Schritt */
  nextNudge: number;
  lastD: number;
  /** Fortschritt eines Kletter-Abschnitts 0 … 1 */
  k: number;
  /** Anzahl der Nachrück-Eingriffe (für Tests/Anzeige) */
  nudges: number;
}

export function makeRoute(pts: RoutePoint[]): Route { return { pts, i: 0, stuck: 0, nextNudge: ROUTE_STUCK_NUDGE, lastD: Infinity, k: 0, nudges: 0 }; }
export function routeDone(r: Route): boolean { return r.i >= r.pts.length; }

/** Zustand der Laufweg-Bewegung */
export interface RouteBody { x: number; y: number; z: number; radius: number }
export interface RouteGround {
  height(x: number, z: number, y?: number): number;
  constrain(x: number, z: number, r?: number, y?: number): { x: number; z: number };
  /** Lage auf einer Leiter bei Anteil t (0 = Fuß, 1 = Spitze) und ihre Raumlänge; false, wenn es sie nicht (mehr) gibt */
  ladderAt?(id: string, t: number, out: { x: number; y: number; z: number }): boolean;
  ladderLength?(id: string): number;
}

/** Von einem Schritt gemeldet */
export interface RouteStep { moving: boolean; climbing: boolean; nudged: boolean; heading: number }
const _step: RouteStep = { moving: false, climbing: false, nudged: false, heading: 0 };
const _lp = { x: 0, y: 0, z: 0 };

/** Nach dieser Zeit ohne Fortschritt rückt der Läufer ein Stück nach (Fallback), nach der längeren springt er zum Wegpunkt */
export const ROUTE_STUCK_NUDGE = 0.9;
export const ROUTE_STUCK_SNAP = 2.6;

/**
 * Eine Zeitscheibe auf dem Laufweg. Gehen: auf den nächsten Wegpunkt zu, Boden-Constrain mit Höhenhinweis (Brücke!). Klettern: entlang
 * der Leiter mit `climbSpeed` (m/s im Raum); die Lage liefert `ladderAt` (folgt den Ankern der beiden Schiffe). Bleibt der Läufer an
 * einer schmalen Brückenkante hängen (kein Fortschritt), rückt er zuerst ein Stück auf der Linie nach, danach springt er zum Wegpunkt
 * (höchstens wenige Meter, immer auf der Brückenmitte).
 */
export function stepRoute(b: RouteBody, r: Route, dt: number, speed: number, g: RouteGround, climbSpeed = 1.5, out: RouteStep = _step): RouteStep {
  out.moving = false; out.climbing = false; out.nudged = false; out.heading = 0;
  if (routeDone(r)) return out;
  const p = r.pts[r.i];
  if (p.climb !== undefined) {
    const len = g.ladderLength?.(p.climb) ?? 0;
    if (!g.ladderAt || len <= 0) { r.i++; r.k = 0; return out; }
    r.k = Math.min(1, r.k + (climbSpeed / len) * dt);
    g.ladderAt(p.climb, p.up === false ? 1 - r.k : r.k, _lp);
    b.x = _lp.x; b.z = _lp.z; b.y = _lp.y;
    out.moving = true; out.climbing = true;
    out.heading = Math.atan2(p.x - b.x, p.z - b.z);
    if (r.k >= 1) { r.i++; r.k = 0; r.stuck = 0; r.lastD = Infinity; b.x = p.x; b.z = p.z; }
    return out;
  }
  const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
  out.heading = Math.atan2(dx, dz);
  if (d < 0.3) { r.i++; r.stuck = 0; r.lastD = Infinity; return out; }
  const step = Math.min(d, speed * dt);
  const c = g.constrain(b.x + (dx / d) * step, b.z + (dz / d) * step, b.radius, b.y);
  b.x = c.x; b.z = c.z;
  const h = g.height(b.x, b.z, b.y);
  if (Number.isFinite(h)) b.y += (h - b.y) * Math.min(1, dt * 12);
  out.moving = true;
  // Wächter: kein Fortschritt zum Wegpunkt → nachrücken
  const nd = Math.hypot(p.x - b.x, p.z - b.z);
  if (nd < r.lastD - speed * dt * 0.25) { r.stuck = Math.max(0, r.stuck - dt); r.nextNudge = ROUTE_STUCK_NUDGE; r.lastD = nd; }
  else {
    r.stuck += dt;
    if (r.stuck > ROUTE_STUCK_SNAP) {
      b.x = p.x; b.z = p.z;
      const hh = g.height(b.x, b.z, b.y);
      if (Number.isFinite(hh)) b.y = hh;
      r.nudges++; r.stuck = 0; r.nextNudge = ROUTE_STUCK_NUDGE; r.lastD = Infinity; out.nudged = true;
    } else if (r.stuck > r.nextNudge) {
      const k = Math.min(1.6, nd) / Math.max(nd, 1e-3);
      const nx = b.x + (p.x - b.x) * k * 0.5, nz = b.z + (p.z - b.z) * k * 0.5;
      const c2 = g.constrain(nx, nz, b.radius * 0.6, b.y);
      b.x = c2.x; b.z = c2.z;
      r.nudges++; r.nextNudge = r.stuck + 0.7; out.nudged = true;
    }
  }
  return out;
}
