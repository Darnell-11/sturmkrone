// Phase 4.6C – Rückstoß-Physik der Gegner als reine Regel (ohne three.js, getestet): schlittern mit Bremsspur, an Wänden und Relings
// abprallen oder über eine Kante (Reling, Stegrand, Klippe) fliegen, wenn dahinter Tiefe liegt. `Enemy.knockPhysics` wendet sie an.

/**
 * Ab diesem Tempo (m/s) schlittern Gegner mit Bremsspur, prallen an Wänden und Relings ab (Rückprall-Anteil) oder fliegen über eine
 * Kante, wenn dahinter mehr als `dropMin` m Tiefe liegt; ins Wasser gefallen = besiegt.
 */
export const KNOCKBACK = {
  skidMin: 3.2,
  skidEvery: 0.07,
  bounceMin: 4.5,
  restitution: 0.45,
  /** Restanteil des Tempos parallel zur Wand nach dem Aufprall */
  wallDrag: 0.85,
  slamStun: 0.45,
  overboardMin: 6.5,
  dropMin: 1.5,
  /** so weit hinter der Berührung (m) wird die Tiefe gemessen */
  probe: 1.6,
  /** frontal genug gegen die Wand (Kosinus zwischen Flugrichtung und Wand-Normale) */
  intoMin: 0.35,
  /** Abflug über die Kante: Mindest-Steigtempo und -Fahrt (m/s) */
  lift: 4.8,
  launch: 7.5,
  /** Wasserlinie (m): Boden darunter (offenes Meer, Hafenbecken, Flachwasser am Strand) zählt als Wasser – wer dort hineinfällt, ist besiegt */
  seaLevel: 0.25,
} as const;

export type KnockOutcome = 'none' | 'skid' | 'bounce' | 'overboard';

/**
 * Was passiert mit einem Gegner, der mit (vx, vz) schlittert? `hit` = die Bewegung stieß an (Kontakt-Normale nx, nz zeigt von der Wand weg),
 * `beyond` = Bodenhöhe hinter der Berührung (−∞ = Wasser/kein Boden), `y` = eigene Höhe, `canOverboard` = darf über Bord gehen
 * (nie Bosse, Raid-Hauptmänner, Dachschützen).
 */
export function knockOutcome(vx: number, vz: number, hit: boolean, nx: number, nz: number, beyond: number, y: number, canOverboard: boolean): KnockOutcome {
  const sp = Math.hypot(vx, vz);
  if (sp < KNOCKBACK.skidMin) return 'none';
  if (!hit || sp < KNOCKBACK.bounceMin) return 'skid';
  const into = (vx * nx + vz * nz) / sp;
  if (into > -KNOCKBACK.intoMin) return 'skid';
  if (sp >= KNOCKBACK.overboardMin && canOverboard && !(beyond > y - KNOCKBACK.dropMin)) return 'overboard';
  return 'bounce';
}

/** Abprallen: Geschwindigkeit an der Wand-Normale spiegeln (Rückprall-Anteil), parallel etwas bremsen; schreibt in `out` */
export function bounceVelocity(vx: number, vz: number, nx: number, nz: number, out: { vx: number; vz: number }): { vx: number; vz: number } {
  const vn = vx * nx + vz * nz;
  out.vx = (vx - (1 + KNOCKBACK.restitution) * vn * nx) * KNOCKBACK.wallDrag;
  out.vz = (vz - (1 + KNOCKBACK.restitution) * vn * nz) * KNOCKBACK.wallDrag;
  return out;
}

/** Abflug über die Kante: Richtung beibehalten, mindestens `launch` m/s Fahrt und `lift` m/s Steigen */
export function overboardLaunch(vx: number, vz: number, vy: number, out: { vx: number; vy: number; vz: number }): { vx: number; vy: number; vz: number } {
  const sp = Math.hypot(vx, vz) || 1;
  const v = Math.max(sp, KNOCKBACK.launch);
  out.vx = (vx / sp) * v; out.vz = (vz / sp) * v;
  out.vy = Math.max(vy, KNOCKBACK.lift);
  return out;
}

/** Ist der Gegner unter die Wasserlinie gefallen, ohne trockenen Boden unter sich? (über Bord → besiegt; auch im flachen Hafenwasser) */
export const inWater = (y: number, ground: number): boolean => !(ground > KNOCKBACK.seaLevel) && y < KNOCKBACK.seaLevel;
