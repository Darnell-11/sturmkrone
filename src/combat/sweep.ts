// Gesweepte Kampf-Kollision für Vorwärts-Impulse (Ausfallschritt, Rolle, Rückstoß) beliebiger Kämpfer.
// Reine Rechnung ohne three.js: arbeitet auf Zahlen (`SweepBody`) und einem `SweepGround` (Höhe + Hindernis-Auflösung), also für
// jede `entityId` gleich – Spieler, Gegner, Crew, später entfernte Mitspieler.
//
// Ablauf: Der Weg eines Bilds wird in Teilschritte von höchstens `SWEEP.maxSubStep` (0,15 m) zerlegt. Jeder Teilschritt prüft
//  1. den Boden: kleine Höhensprünge (Stufen bis 0,45 m) und Rampen unter 42° steigt die Figur hinauf, steilere Hänge und Felsen sind Wände;
//  2. die Kapsel (Kreis mit Figurenradius, senkrecht gezogen) gegen alle Hindernisse des Bodens (Gebäude-OBBs, Mauern, Zäune, Felsen);
//  3. die Gleitrichtung: Die Auflösung schiebt die Kapsel entlang der Wand-Normale heraus, bei schrägem Winkel gleitet sie also
//     an der Wand entlang. Trifft der Impuls fast senkrecht, bleibt er für den Rest der Aktion gesperrt.
// Weil jeder Teilschritt kürzer ist als der Figurenradius, kann eine Kapsel auch dünne Zäune nicht „überspringen“; zusätzlich
// prüft ein Abschluss, dass die Endposition außerhalb aller Hindernisse liegt (sonst zurück auf den letzten sicheren Punkt).
import type { DashIntent } from '../sim/intents';

export const SWEEP = {
  /** Längster Teilschritt (m) */
  maxSubStep: 0.15,
  /** Höchster Höhensprung, den eine Figur im Gehen nimmt (Stufen, Stegkanten, Türschwellen) */
  stepHeight: 0.45,
  /** Steilste begehbare Rampe in Grad (Schiffstreppen: 30°) */
  maxSlopeDeg: 42,
  /** Messstrecke vor der Figur für die Steigung (m): Stufen verschmieren, Felswände nicht */
  slopeProbe: 0.6,
  /** Höhensprünge darunter zählen als Bodenrauschen und werden nie geprüft */
  noiseStep: 0.04,
  /** Cosinus des Einfallswinkels zur Wand-Normale, ab dem ein Impuls als frontaler Aufprall gilt und endet (≈ 35°) */
  headOnCos: 0.82,
  /** Weniger als dieser Anteil des geplanten Wegs in Stoßrichtung nach einem Kontakt: Ecke oder Klemme, Impuls endet */
  minProgress: 0.22,
} as const;

const TAN_SLOPE = Math.tan((SWEEP.maxSlopeDeg * Math.PI) / 180);

/** Boden, auf dem gesweept wird (jede `Ground` der Welt erfüllt das) */
export interface SweepGround {
  /** `y` = Höhenhinweis des Läufers (wo mehrere Flächen übereinanderliegen: Gangway über dem Steg) */
  height(x: number, z: number, y?: number): number;
  /** Position außerhalb aller Hindernisse und innerhalb des begehbaren Gebiets (schiebt entlang der Kontakt-Normale heraus) */
  constrain(x: number, z: number, radius?: number, y?: number): { x: number; z: number };
}

/** Körper, der bewegt wird: Lage am Boden und Kapselradius (die Kapsel ist senkrecht, im Grundriss ein Kreis) */
export interface SweepBody {
  x: number;
  y: number;
  z: number;
  readonly radius: number;
}

/** Zustand der Blockade eines Impulses (serialisierbar, je Kämpfer einer) */
export interface DashLatch {
  /** Kennung des Impulses, für den `blocked` gilt */
  id: number;
  blocked: boolean;
}

export function makeDashLatch(): DashLatch { return { id: -1, blocked: false }; }

/** Ergebnis eines Bilds; das Objekt wird wiederverwendet (nach dem Aufruf sofort lesen) */
export interface SweepResult {
  /** Zurückgelegte Strecke (m) */
  moved: number;
  /** Eine Wand (Gebäude, Mauer, Zaun, Fels, Küste, Reling) wurde berührt */
  hit: boolean;
  /** Der Impuls ist beendet (frontal an einer Wand, in der Ecke oder am Steilhang) */
  blocked: boolean;
  /** Normale der letzten Berührung (zeigt von der Wand weg) */
  nx: number;
  nz: number;
  /** Eine Stufe oder Rampe wurde hinaufgestiegen */
  climbed: boolean;
  /** Ein Steilhang oder eine zu hohe Kante hat gestoppt */
  steep: boolean;
  /** Höhe des Bodens an der Endposition */
  groundY: number;
  /** Anzahl der Teilschritte */
  steps: number;
}

export function makeSweepResult(): SweepResult {
  return { moved: 0, hit: false, blocked: false, nx: 0, nz: 0, climbed: false, steep: false, groundY: 0, steps: 0 };
}

const _res = makeSweepResult();
const _n = { x: 0, z: 0 };

function groundAt(g: SweepGround, x: number, z: number, fallback: number): number {
  const h = g.height(x, z, fallback);
  return Number.isFinite(h) ? h : fallback;
}

/** Horizontale Hangnormale (zeigt bergab) aus vier Höhenproben; false bei ebenem Boden */
function slopeNormal(g: SweepGround, x: number, z: number, h: number, out: { x: number; z: number }): boolean {
  const e = 0.15;
  const gx = (groundAt(g, x + e, z, h) - groundAt(g, x - e, z, h)) / (2 * e);
  const gz = (groundAt(g, x, z + e, h) - groundAt(g, x, z - e, h)) / (2 * e);
  const l = Math.hypot(gx, gz);
  if (l < 1e-4) return false;
  out.x = -gx / l; out.z = -gz / l;
  return true;
}

/**
 * Darf der Körper von (x0,z0) nach (x1,z1) steigen? Prüft Höhensprung und Steigung.
 * Liefert 0 = ja, 1 = zu hohe Kante, 2 = zu steiler Hang.
 */
function climbCheck(g: SweepGround, h0: number, x1: number, z1: number, dirX: number, dirZ: number, step: number): number {
  const h1 = groundAt(g, x1, z1, h0);
  const dh = h1 - h0;
  if (dh <= SWEEP.noiseStep) return 0;
  if (dh > SWEEP.stepHeight) return 1;
  // Steigung über eine längere Strecke: eine Stufe (dh ≤ 0,45 auf 0,75 m) bleibt flach, eine Felswand wird steil
  const hp = groundAt(g, x1 + dirX * SWEEP.slopeProbe, z1 + dirZ * SWEEP.slopeProbe, h1);
  return (hp - h0) / (step + SWEEP.slopeProbe) > TAN_SLOPE ? 2 : 0;
}

/**
 * Bewegt den Körper um (dx, dz) in Teilschritten. Mit `impulse` gelten die strengen Regeln (Steilhang = Wand, frontaler Aufprall
 * beendet); ohne gleitet er nur an Hindernissen entlang (normales Gehen, Rückstoß). Verändert `body.x/z` (und `y` nur über das Ergebnis:
 * die Höhe selbst glättet der Aufrufer, `groundY` liefert das Ziel).
 */
export function sweepMove(body: SweepBody & { x: number; z: number }, dx: number, dz: number, g: SweepGround, impulse: boolean, out: SweepResult = _res): SweepResult {
  out.moved = 0; out.hit = false; out.blocked = false; out.climbed = false; out.steep = false; out.nx = 0; out.nz = 0; out.steps = 0;
  const len = Math.hypot(dx, dz);
  let h0 = groundAt(g, body.x, body.z, body.y);
  out.groundY = h0;
  if (len < 1e-6) {
    // Stillstand: trotzdem aus Hindernissen und anderen Kämpfern herausschieben (Gegner schieben sich auseinander)
    if (!impulse) { const c = g.constrain(body.x, body.z, body.radius, h0); body.x = c.x; body.z = c.z; }
    return out;
  }
  const dirX = dx / len, dirZ = dz / len;
  // Teilschritte kürzer als der Radius: nie über einen dünnen Zaun hinweg
  const maxStep = Math.min(SWEEP.maxSubStep, Math.max(0.05, body.radius * 0.6));
  const n = Math.max(1, Math.ceil(len / maxStep));
  const step = len / n;
  const startX = body.x, startZ = body.z;
  let safeX = startX, safeZ = startZ;
  for (let i = 0; i < n; i++) {
    out.steps++;
    let sx = dirX * step, sz = dirZ * step;
    let cx = body.x + sx, cz = body.z + sz;
    // 1. Boden: Stufe, Rampe oder Wand?
    const climb = impulse ? climbCheck(g, h0, cx, cz, dirX, dirZ, step) : 0;
    if (climb !== 0) {
      out.steep = true;
      // entlang des Hangs gleiten (Hangnormale), sonst stehen bleiben
      const slid = slopeNormal(g, cx, cz, h0, _n);
      if (!slid) { out.hit = true; out.blocked = true; break; }
      const into = sx * _n.x + sz * _n.z;
      out.nx = _n.x; out.nz = _n.z; out.hit = true;
      if (into < 0) { sx -= _n.x * into; sz -= _n.z * into; }
      const tl = Math.hypot(sx, sz);
      // frontal gegen die Wand: Impuls endet; sonst Gleiten nur, wenn auch die Gleitrichtung begehbar ist
      if (-into / step > SWEEP.headOnCos || tl < 1e-4) { out.blocked = true; break; }
      cx = body.x + sx; cz = body.z + sz;
      if (climbCheck(g, h0, cx, cz, sx / tl, sz / tl, tl) !== 0) { out.blocked = true; break; }
    }
    // 2. Kapsel gegen die Hindernisse: herausschieben entlang der Kontakt-Normale
    const c = g.constrain(cx, cz, body.radius, h0);
    const px = c.x - cx, pz = c.z - cz;
    const pl = Math.hypot(px, pz);
    if (pl > 1e-4) {
      out.hit = true;
      out.nx = px / pl; out.nz = pz / pl;
      const into = (dirX * out.nx + dirZ * out.nz);
      // frontaler Aufprall beendet den Impuls (der Körper steht an der Wand, nicht darin)
      if (impulse && -into > SWEEP.headOnCos) {
        body.x = c.x; body.z = c.z;
        out.blocked = true;
        break;
      }
    }
    const nh = groundAt(g, c.x, c.z, h0);
    if (nh > h0 + SWEEP.noiseStep) out.climbed = true;
    body.x = c.x; body.z = c.z;
    safeX = c.x; safeZ = c.z;
    h0 = nh;
  }
  // 3. Abschluss: wirklich frei? (Eckklemme: mehrere Hindernisse schieben gegeneinander)
  const fin = g.constrain(body.x, body.z, body.radius, h0);
  if (Math.hypot(fin.x - body.x, fin.z - body.z) > 1e-3) { body.x = safeX; body.z = safeZ; out.blocked = impulse; out.hit = true; }
  else { body.x = fin.x; body.z = fin.z; }
  out.moved = Math.hypot(body.x - startX, body.z - startZ);
  out.groundY = groundAt(g, body.x, body.z, h0);
  if (impulse && out.hit && !out.blocked && len > 0.02 && ((body.x - startX) * dirX + (body.z - startZ) * dirZ) < len * SWEEP.minProgress) out.blocked = true;
  return out;
}

/**
 * Wertet einen `DashIntent` für ein Logikbild aus. Ist der Impuls einmal blockiert (frontal an einer Wand), bewegt er sich für
 * dieselbe `intent.id` nicht mehr: Ein Ausfallschritt gegen ein Haus endet dort und läuft auch nicht beim nächsten Bild weiter.
 */
export function resolveDash(body: SweepBody & { x: number; z: number }, latch: DashLatch, intent: DashIntent, g: SweepGround, dt: number, out: SweepResult = _res): SweepResult {
  if (latch.id !== intent.id) { latch.id = intent.id; latch.blocked = false; }
  if (latch.blocked || intent.speed <= 0) {
    out.moved = 0; out.hit = false; out.blocked = latch.blocked; out.climbed = false; out.steep = false; out.nx = 0; out.nz = 0; out.steps = 0;
    out.groundY = groundAt(g, body.x, body.z, body.y);
    return out;
  }
  const r = sweepMove(body, intent.dirX * intent.speed * dt, intent.dirZ * intent.speed * dt, g, true, out);
  // Rückstoß wird nicht gesperrt (er klingt ohnehin von selbst ab), Hiebe und Rollen schon
  if (r.blocked && intent.kind !== 'knockback') latch.blocked = true;
  return r;
}
