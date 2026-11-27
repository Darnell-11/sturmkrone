// Phase 4.7C – Wasserlaufen zu Fuß, begrenzt durch die Ausdauer. Wer das Meer betritt oder hineinspringt, läuft und gleitet über die
// Oberfläche; das kostet laufend Ausdauer (Stehen wenig, Gehen mehr, Laufen am meisten, Dashes wie an Land). Bei 0 endet der Wasserlauf und
// die Figur schwimmt – langsam, ohne Angriffe –, bis sich die Ausdauer erholt hat oder sie an Land bzw. an Bord klettert. Jedes Absinken
// bringt „Seemüdigkeit“: die Höchst-Ausdauer auf dem Wasser sinkt, bis die Figur wieder festen Boden unter den Füßen hat. So reicht der
// Wasserlauf für Küstenkämpfe, Hafen-Überquerungen und nahe Schiffe, aber nicht, um von Insel zu Insel zu rennen.
// Reine Zahlen und Regeln ohne three.js (getestet in tests/classCombosAndOpenWorldWaterWalk.test.ts).

export const WATER_WALK = {
  /** Ausdauer je Sekunde auf dem Wasser: Stehen, Gehen, Laufen (Höchst-Ausdauer 100, an Land +34/s Erholung) */
  drainStand: 3,
  drainWalk: 5,
  drainRun: 8,
  /** Erholung je Sekunde beim Schwimmen; ab diesem Anteil der (gekappten) Höchst-Ausdauer steigt die Figur wieder aufs Wasser */
  swimRegen: 6,
  resumeAt: 0.6,
  /** Seemüdigkeit je Absinken (Anteil der Höchst-Ausdauer); darunter bleibt nur Schwimmen */
  fatigueStep: 0.25,
  minCap: 0.2,
  /** Schwimmen: so tief (m) unter der Oberfläche liegen die Füße, Tempo-Faktor, Ausdauer für einen Sprung aus dem Wasser */
  swimDepth: 1.15,
  swimSpeedK: 0.3,
  jumpCost: 15,
  /** Boden tiefer als das unter der Wasseroberfläche (m) zählt als Wasser */
  wetDepth: 0.12,
  /** Takt der Kräuselringe (s): Stehen, Gehen, Laufen, Schwimmen */
  stepStand: 0.9, stepWalk: 0.32, stepRun: 0.22, stepSwim: 0.6,
} as const;

/**
 * 4.9: Ausdauer leer auf dem Wasser → kein langes Schwimmen mehr: nach einer kurzen Erschöpfungs- und Gischt-Blende steht die Figur sauber an
 * Deck des eigenen Schiffs (gibt es noch keins – Einführung auf Ankerglück –, am landseitigen Ende des nächsten Stegs bzw. am Strand) und hat
 * wieder Grund-Ausdauer. Zeiten in s (Spielzeit), Ausdauer als Anteil der Höchst-Ausdauer.
 */
export const WATER_RESCUE = { fade: 0.85, hold: 0.35, out: 0.6, stamina: 0.6, pierRange: 900 } as const;

export type RescueKind = 'deck' | 'pier' | 'shore';

/** Wohin nach der Erschöpfung? Eigenes Schiff zuerst; ohne (verstaut, Raid, Entern) der nächste Steg, sonst der Strand */
export function rescueKind(o: { shipReady: boolean; pierDist: number }): RescueKind {
  if (o.shipReady) return 'deck';
  return o.pierDist <= WATER_RESCUE.pierRange ? 'pier' : 'shore';
}

/** Landseitiges Ende eines Stegs (das Ende näher an der Inselmitte), etwas auf den Steg hinein versetzt */
export function pierLandEnd(p: { ax: number; az: number; bx: number; bz: number }, isleX: number, isleZ: number, out: { x: number; z: number; yaw: number }): { x: number; z: number; yaw: number } {
  const da = Math.hypot(p.ax - isleX, p.az - isleZ), db = Math.hypot(p.bx - isleX, p.bz - isleZ);
  const lx = da <= db ? p.ax : p.bx, lz = da <= db ? p.az : p.bz, sx = da <= db ? p.bx : p.ax, sz = da <= db ? p.bz : p.az;
  const len = Math.hypot(sx - lx, sz - lz) || 1;
  const k = Math.min(3, len * 0.25) / len;
  out.x = lx + (sx - lx) * k; out.z = lz + (sz - lz) * k;
  // Blick zur Insel
  out.yaw = Math.atan2(lx - sx, lz - sz);
  return out;
}

/** Zustand des Wasserlaufs (JSON-taugliche Zahlen, je Spielfigur) */
export interface WaterWalkState {
  /** steht bzw. läuft gerade auf dem Wasser (oder schwimmt) */
  onWater: boolean;
  swimming: boolean;
  /** Seemüdigkeit 0 … 1 (setzt sich an Land bzw. an Bord zurück) */
  fatigue: number;
}

export const newWaterWalk = (): WaterWalkState => ({ onWater: false, swimming: false, fatigue: 0 });

/** Höchst-Ausdauer auf dem Wasser nach der Seemüdigkeit */
export const waterCap = (s: WaterWalkState, max: number): number => max * Math.max(0, 1 - s.fatigue);

/** Ausdauer-Verbrauch je Sekunde auf dem Wasser (Auslenkung 0 … 1 der Laufrichtung) */
export function waterDrain(mag: number): number {
  return mag > 0.7 ? WATER_WALK.drainRun : mag > 0.05 ? WATER_WALK.drainWalk : WATER_WALK.drainStand;
}

/** Ist an (x, z) Wasser unter den Füßen? (Bodenhöhe `ground` darf −∞ sein; `water` = Oberfläche, NaN = kein Meer) */
export const isWater = (ground: number, water: number): boolean => water === water && !(ground > water - WATER_WALK.wetDepth);

/**
 * Ein Logikschritt Wasserlauf. `stamina` wird verändert zurückgegeben; `ev` meldet Übergänge: 'sink' (Ausdauer leer → schwimmen),
 * 'rise' (erholt → wieder auf dem Wasser), '' sonst. An Land setzt sich alles zurück.
 */
export function stepWaterWalk(s: WaterWalkState, onWater: boolean, stamina: number, max: number, mag: number, dt: number): { stamina: number; ev: '' | 'sink' | 'rise' } {
  if (!onWater) {
    s.onWater = false;
    s.swimming = false;
    s.fatigue = 0;
    return { stamina, ev: '' };
  }
  s.onWater = true;
  const cap = waterCap(s, max);
  if (!s.swimming) {
    stamina = Math.min(stamina, cap) - waterDrain(mag) * dt;
    if (stamina <= 0) {
      s.swimming = true;
      s.fatigue = Math.min(1, s.fatigue + WATER_WALK.fatigueStep);
      return { stamina: 0, ev: 'sink' };
    }
    return { stamina, ev: '' };
  }
  stamina = Math.min(waterCap(s, max), stamina + WATER_WALK.swimRegen * dt);
  const capNow = waterCap(s, max);
  if (capNow >= max * WATER_WALK.minCap && stamina >= capNow * WATER_WALK.resumeAt) {
    s.swimming = false;
    return { stamina, ev: 'rise' };
  }
  return { stamina, ev: '' };
}

/**
 * Wie weit (m) die Figur auf dem Wasser kommt, bevor nur noch Schwimmen bleibt (Laufen mit `speed` m/s, Schwimmen mit dem Tempo-Faktor):
 * für die Abstimmung und die Prüfung „nicht von Insel zu Insel“.
 */
export function waterRange(speed: number, max = 100): { walk: number; swim: number; cycles: number } {
  const s = newWaterWalk();
  let st = max, walk = 0, swim = 0, cycles = 0;
  const dt = 1 / 30;
  for (let i = 0; i < 30 * 600 && cycles < 20; i++) {
    const before = s.swimming;
    const r = stepWaterWalk(s, true, st, max, 1, dt);
    st = r.stamina;
    if (r.ev === 'sink') cycles++;
    if (before) swim += speed * WATER_WALK.swimSpeedK * dt; else walk += speed * dt;
    if (s.swimming && waterCap(s, max) < max * WATER_WALK.minCap) break;
  }
  return { walk, swim, cycles };
}
