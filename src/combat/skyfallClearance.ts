// Phase 4.6H – Himmelssturz: Einschläge nie auf dem eigenen Deck.
//
// Das 15. Ultimate („Himmelssturz“, seit 4.93A ein Meteoriten-Kataklysmus aus Vorhut und Koloss) schlägt 6 bis 36 m vor der Figur ein. An Deck eines
// großen Schiffs lagen diese Punkte noch auf dem eigenen Deck (Offenpunkt 4.6E). Jetzt wird die ganze Einschlag-Gruppe – Meteoriten, Planet und
// die Trefferflächen der Engine – entlang der Blickrichtung so weit nach vorn geschoben, bis jeder Einschlagpunkt mindestens
// `SKYFALL_SHIP_CLEAR` Meter vom Rumpf jedes eigenen Schiffs (Flaggschiff und Begleiter) entfernt liegt. Rein: ohne three.js, ohne Zufall.

/**
 * Mindestabstand (m) jedes Einschlagpunkts zum Rumpf eines eigenen Schiffs. 4.93A: der Koloss-Meteorit reißt einen Krater von 34 m Radius –
 * der Abstand wuchs von 28 auf 36 m.
 */
export const SKYFALL_SHIP_CLEAR = 36;
/** Einschlagpunkte des Himmelssturzes vor der Figur (m): nächster Vorhut-Meteorit, Koloss (Mittelpunkt), fernster Vorhut-Meteorit */
export const SKYFALL_OFFSETS: readonly number[] = [6, 20, 36];
/** Weiter als so viele Meter wird nie geschoben (dann gilt der weiteste Wert) */
export const SKYFALL_MAX_SHIFT = 200;

/** Grundriss eines Schiffs: Mitte, Kurs (rad, vorn = (sin, cos)), Länge und Breite (m) */
export interface ShipFootprint { x: number; z: number; heading: number; L: number; W: number }

/** Abstand eines Punkts zum Rumpf-Rechteck (0 = auf oder über dem Deck) */
export function hullClearance(px: number, pz: number, s: ShipFootprint): number {
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  const dx = px - s.x, dz = pz - s.z;
  const along = dx * fx + dz * fz;
  const across = dx * fz - dz * fx;
  const ex = Math.max(0, Math.abs(across) - s.W * 0.5);
  const ez = Math.max(0, Math.abs(along) - s.L * 0.5);
  return Math.hypot(ex, ez);
}

/** Kleinster Abstand eines Punkts zu allen eigenen Schiffen (Infinity ohne Schiffe) */
export function fleetClearance(px: number, pz: number, ships: readonly ShipFootprint[]): number {
  let best = Infinity;
  for (let i = 0; i < ships.length; i++) { const c = hullClearance(px, pz, ships[i]); if (c < best) best = c; }
  return best;
}

/**
 * Verschiebung (m, ≥ 0) der Einschlag-Gruppe entlang der Blickrichtung `yaw` ab (x, z), damit jeder Einschlagpunkt (`offsets` vor der Figur)
 * mindestens `min` Meter von jedem Schiff entfernt liegt. 0 = nichts zu tun (an Land oder auf freier See). Sucht in halben Metern und
 * verfeinert danach (keine Speicheranforderung).
 */
export function skyfallShift(x: number, z: number, yaw: number, ships: readonly ShipFootprint[], min = SKYFALL_SHIP_CLEAR, offsets: readonly number[] = SKYFALL_OFFSETS, maxShift = SKYFALL_MAX_SHIFT): number {
  if (!ships.length) return 0;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const ok = (s: number): boolean => {
    for (let i = 0; i < offsets.length; i++) {
      const d = offsets[i] + s;
      if (fleetClearance(x + fx * d, z + fz * d, ships) < min) return false;
    }
    return true;
  };
  if (ok(0)) return 0;
  let s = 0.5;
  while (s < maxShift && !ok(s)) s += 0.5;
  if (s >= maxShift) return maxShift;
  // verfeinern: kleinste Verschiebung im letzten halben Meter (Abstand wächst stetig nach vorn)
  let lo = s - 0.5, hi = s;
  for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
  return hi;
}
