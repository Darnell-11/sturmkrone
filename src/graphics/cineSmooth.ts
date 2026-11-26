// Phase 4.7D.1 – butterweiche Kamera der Prolog-Regie (rein: kein three.js, keine Speicheranforderung je Bild).
//
// Die Fahrten selbst laufen weiter auf Catmull-Rom-Bahnen (`SHOTS`, `CatmullRomCurve3` mit Bogenlängen-Parameter). Hier stehen die Bausteine,
// die aus „weich“ „butterweich“ machen:
//  - `shotEase`: Verläufe ohne Knick – Ein-/Auslauf als Quintik (Beschleunigung an beiden Enden 0), Sinus-Bögen statt Parabeln für `in`/`out`
//    (kleinere Endgeschwindigkeit am Schnitt), `linear` bleibt gleichförmig (Kamerafahrten, die bis zum Schnitt laufen).
//  - `smoothDamp`: kritisch gedämpfte Feder (kein Überschwingen) für Blickrichtung, Sichtfeld und Neigung INNERHALB einer Einstellung; jeder
//    Schnitt setzt sie zurück (harte Schnitte bleiben hart). Gedämpft wird die Blick-RICHTUNG, nie der Ort: eine Kamera, die dem Strahl mit
//    210 m/s folgt, hinge mit gedämpftem Ort 30 m hinterher.
//  - `smoothMax`: weiche Untergrenze (Kamera nie unter den Wellen) ohne Knick, wenn eine Welle die Kamera anhebt.
//  - `punchOffset`: Sichtfeld-Stoß als gedämpfte Schwingung – vorher sprang das Sichtfeld beim Umschlag von „eng“ zu „weit“ in einem Bild um 6,5°.
import type { ShotEase } from '../data/prologue';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Quintischer Ein- und Auslauf (Geschwindigkeit und Beschleunigung an beiden Enden 0) */
export const smoother = (x: number): number => { const k = clamp01(x); return k * k * k * (k * (k * 6 - 15) + 10); };

/** Verlauf einer Fahrt 0 … 1 (stetig, an beiden Enden ohne Sprung) */
export function shotEase(k: number, e: ShotEase): number {
  const x = clamp01(k);
  switch (e) {
    case 'linear': return x;
    case 'in': return 1 - Math.cos((x * Math.PI) / 2);
    case 'out': return Math.sin((x * Math.PI) / 2);
    default: return smoother(x);
  }
}

/** Steigung eines Verlaufs (Prüfungen: Ein- und Auslauf ohne Ruck) */
export function easeSlope(k: number, e: ShotEase, h = 1e-4): number {
  const a = Math.max(0, k - h), b = Math.min(1, k + h);
  return (shotEase(b, e) - shotEase(a, e)) / Math.max(1e-9, b - a);
}

/** Geschwindigkeit einer gedämpften Größe (vorab angelegt, je Bild überschrieben) */
export interface DampVel { v: number }

/**
 * Kritisch gedämpfte Feder (Game Programming Gems 4, „SmoothDamp“): läuft ohne Überschwingen auf `target` zu und folgt einem bewegten Ziel
 * stetig; `smoothTime` ≈ Zeit bis zum Ziel (s). Bildraten-unabhängig.
 */
export function smoothDamp(cur: number, target: number, vel: DampVel, smoothTime: number, dt: number): number {
  if (dt <= 0) return cur;
  const st = Math.max(1e-4, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * exp;
  let out = target + (change + temp) * exp;
  // nie über das Ziel hinaus
  if ((target - cur > 0) === (out > target)) { out = target; vel.v = (out - target) / dt; }
  return out;
}

/** Weiches Maximum (polynomisch, stetig differenzierbar): wie `max(a, b)`, aber ohne Knick im Bereich `k` */
export function smoothMax(a: number, b: number, k: number): number {
  if (k <= 0) return Math.max(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
}

/**
 * Sichtfeld-Stoß (Grad) aus dem abklingenden Puls `p` (1 → 0): erst zieht das Bild kurz zusammen, dann atmet es weit aus und kommt zur Ruhe –
 * eine gedämpfte Schwingung, beginnt und endet bei 0 (kein Sprung im ersten und letzten Bild).
 */
export function punchOffset(p: number, amp = 6): number {
  const u = 1 - clamp01(p);
  if (u <= 0 || u >= 1) return 0;
  return -amp * Math.sin(2 * Math.PI * u) * Math.pow(1 - u, 1.5) * Math.min(1, u * 12);
}

/**
 * Auflösung der Bogenlängen-Tabelle der Catmull-Rom-Fahrten (`curve.arcLengthDivisions`): three.js nimmt 200 Stützstellen und rechnet dazwischen
 * linear – auf langen Fahrten mit ungleich langen Abschnitten schwankte das Tempo dadurch von Bild zu Bild um bis zu einem Drittel (Mikro-Ruckeln).
 * Einmal beim Anlegen gesetzt, nie je Bild.
 */
export const SHOT_ARC_DIVISIONS = 2400;

/** Zeiten der Dämpfung innerhalb einer Einstellung (s) */
export const CINE_DAMP = { dir: 0.09, fov: 0.12, roll: 0.15, waterSoft: 0.9 } as const;

/**
 * Glättung der Regie-Kamera: Blickrichtung (Einheitsvektor), Sichtfeld. `cut()` übernimmt den nächsten Stand sofort (Schnitt), sonst folgt
 * die Kamera gedämpft. Alles in festen Feldern – keine Speicheranforderung je Bild.
 */
export class CineDamp {
  dx = 0; dy = 0; dz = 1; fov = 50;
  private readonly vx: DampVel = { v: 0 };
  private readonly vy: DampVel = { v: 0 };
  private readonly vz: DampVel = { v: 0 };
  private readonly vf: DampVel = { v: 0 };
  private fresh = true;

  /** Nächster Stand ist ein Schnitt: ohne Übergang übernehmen */
  cut() { this.fresh = true; }

  /** Ein Bild: Ziel-Blickrichtung (beliebige Länge) und Ziel-Sichtfeld; Ergebnis in `dx/dy/dz` (Einheitsvektor) und `fov` */
  step(dt: number, tx: number, ty: number, tz: number, tfov: number) {
    const l = Math.hypot(tx, ty, tz) || 1;
    const nx = tx / l, ny = ty / l, nz = tz / l;
    if (this.fresh || !Number.isFinite(this.dx + this.dy + this.dz + this.fov)) {
      this.dx = nx; this.dy = ny; this.dz = nz; this.fov = tfov;
      this.vx.v = this.vy.v = this.vz.v = this.vf.v = 0;
      this.fresh = false;
      return;
    }
    const x = smoothDamp(this.dx, nx, this.vx, CINE_DAMP.dir, dt);
    const y = smoothDamp(this.dy, ny, this.vy, CINE_DAMP.dir, dt);
    const z = smoothDamp(this.dz, nz, this.vz, CINE_DAMP.dir, dt);
    const m = Math.hypot(x, y, z) || 1;
    this.dx = x / m; this.dy = y / m; this.dz = z / m;
    this.fov = smoothDamp(this.fov, tfov, this.vf, CINE_DAMP.fov, dt);
  }
}
