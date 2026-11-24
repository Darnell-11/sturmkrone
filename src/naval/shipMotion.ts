// Fahrphysik eines Schiffs ohne three.js: Drehrate, Wendekreis, Wind und ein Schritt der Bewegung (Tempo, Ruder, Drift).
// Das ist die EINE Quelle: `Ship.steer` ruft `stepMotion` auf, die KI (`naval/shipSteering.ts`) rechnet mit `maxYawRate`/`turnRadius`
// den echten Wendekreis aus, und die Tests fahren dieselbe Physik. Reine Zahlen, JSON-tauglich, kein Zufall.
import { clamp01, wrapAngle } from '../core/mathUtil';

/** Trägheit nach Länge: 0 = Schaluppe (15 m und kürzer), 1 = Leviathan (74 m) */
export const heavyOf = (L: number): number => clamp01((L - 15) / 59);

/**
 * Höchste Drehgeschwindigkeit (rad/s) bei vollem Ruder: sinkt mit der Schiffsgröße, hängt an Steuermann (`turnMult`), Segel-Stufe (`turnK`) und
 * Segelzustand (`perfTurn`) und fällt unter 8 m/s Fahrt auf 30 % (ohne Fahrt greift das Ruder kaum).
 */
export function maxYawRate(L: number, turnMult: number, turnK: number, perfTurn: number, speed: number): number {
  const m = heavyOf(L);
  return (0.58 - 0.33 * m) * turnMult * turnK * perfTurn * (0.3 + 0.7 * Math.min(1, speed / 8));
}

/** Wendekreis-Radius (m) im Beharrungszustand: Fahrt geteilt durch die höchste Drehrate. Je langsamer das Schiff, desto enger der Kreis. */
export function turnRadius(L: number, turnMult: number, turnK: number, perfTurn: number, speed: number): number {
  return Math.max(0, speed) / Math.max(1e-4, maxYawRate(L, turnMult, turnK, perfTurn, speed));
}

/**
 * Faktor des Winds auf das Tempo (Rückenwind schneller, Gegenwind langsamer). `fixed` = Gashebel des Spielers: dort hängt das Tempo nur vom
 * Hebel ab. `upwindK` (Segel-Stufe) lässt bessere Segel am Wind weniger verlieren.
 */
export function windSpeedK(heading: number, windDir: number, windStrength: number, upwindK: number, fixed = false): number {
  const rel = Math.cos(heading - windDir);
  const k0 = fixed ? 1 : 0.96 + 0.24 * (rel * 0.5 + 0.5) + windStrength * 0.05;
  return 1 - (1 - k0) * upwindK;
}

/** Zustand der Bewegung (Weltachsen, Meter, Bogenmaß): x/z, Bug (`heading`), Fahrtrichtung (`course` folgt dem Bug), Ruderlage und Drehgeschwindigkeit */
export interface Motion {
  x: number; z: number; heading: number; speed: number; course: number;
  turnInput: number; yawRate: number; courseOk: boolean;
}

export interface MotionParams {
  L: number; turnMult: number; turnK: number; perfTurn: number; perfAccel: number; accelK: number;
}

export const newMotion = (x = 0, z = 0, heading = 0, speed = 0): Motion => ({ x, z, heading, speed, course: heading, turnInput: 0, yawRate: 0, courseOk: true });

/**
 * Ein Zeitschritt: Tempo nähert sich dem Zieltempo (schwere Schiffe träge), das Ruder baut Drehgeschwindigkeit nur langsam auf, Kurven kosten Fahrt, und
 * die Fahrtrichtung folgt dem Bug mit Verzögerung (das Schiff schiebt in Kurven seitlich über das Wasser). `turn` −1 … 1: positiv = nach rechts
 * (der Bug dreht zu kleineren Winkeln). Schiebt `m` an Ort und Stelle, ohne Zuweisung.
 */
export function stepMotion(m: Motion, turn: number, targetSpeed: number, p: MotionParams, dt: number): void {
  const heavy = heavyOf(p.L);
  m.speed += (targetSpeed - m.speed) * Math.min(1, dt * (targetSpeed < m.speed ? 0.45 : 0.62 * p.perfAccel * p.accelK) * (1.25 - 0.7 * heavy));
  m.turnInput += (turn - m.turnInput) * Math.min(1, dt * 4);
  const maxRate = maxYawRate(p.L, p.turnMult, p.turnK, p.perfTurn, m.speed);
  m.yawRate += (m.turnInput * maxRate - m.yawRate) * Math.min(1, dt * (1.5 - 0.8 * heavy));
  m.heading -= m.yawRate * dt;
  m.speed -= m.speed * Math.min(0.5, Math.abs(m.yawRate) * 0.07 * dt);
  if (!m.courseOk) { m.course = m.heading; m.courseOk = true; }
  let dc = wrapAngle(m.heading - m.course);
  if (Math.abs(dc) > 1.0) { m.course = m.heading; dc = 0; }
  m.course += dc * Math.min(1, dt * (3.2 - 1.6 * heavy));
  m.x += Math.sin(m.course) * m.speed * dt;
  m.z += Math.cos(m.course) * m.speed * dt;
}
