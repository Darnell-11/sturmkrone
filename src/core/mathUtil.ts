// Kleine, reine Rechenhelfer (kein three.js, keine Zustände): die eine Quelle für Begrenzen, Winkel und Glättung.
// Vorher gab es Kopien in docking, dockingSystem, dockingFx, shipHull2, vroid, glow, glbGear, audio, musicDirector, flagCloth,
// enemyBrain, raidWorld, compass und mehreren Stellen mit dem Muster `Math.max(0, Math.min(1, x))`.

/** v auf lo … hi begrenzen */
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** v auf 0 … 1 begrenzen */
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Linear zwischen a und b (t = 0 … 1) */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Winkel auf (−π, π] bringen (kürzeste Drehung von 0 aus) */
export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Kleinster Abstand zweier Richtungen (immer ≥ 0, höchstens π) */
export const angleDiff = (a: number, b: number): number => Math.abs(wrapAngle(a - b));

/** Weiche S-Kurve für t = 0 … 1 (0 und 1 laufen sanft ein und aus) */
export const smooth01 = (t: number): number => { const k = clamp01(t); return k * k * (3 - 2 * k); };

/** Weiche Treppe: 0 bis a, 1 ab b, dazwischen S-Kurve (wie GLSL smoothstep) */
export const smoothstep = (a: number, b: number, x: number): number => smooth01((x - a) / (b - a));

/** Abstand eines Punktes (px, pz) von der Strecke a → b in der Ebene */
export const distToSegment = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? clamp01(((px - ax) * vx + (pz - az) * vz) / l2) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
};

/** Zufälliges Element (rnd = Zufallsquelle 0 … 1, für deterministische Aufrufe austauschbar) */
export const pickOne = <T>(list: readonly T[], rnd: () => number = Math.random): T => list[Math.floor(rnd() * list.length) % list.length];
