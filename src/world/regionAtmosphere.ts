// Regions-Atmosphäre (Phase 4.4C): jede Region tönt Himmel, Nebel, Licht und Meer leicht in ihrer Stimmung – Nebelarchipel graugrün und dunstig,
// Nordwacht kühl, Glutring mit Ascheschein, Sturmgürtel schiefergrau und gedämpft, Schlundriff violett. Dazu Brennpunkte wie die Vulkan-Festung
// Kurogane-Schlund, deren Lavaglut den Himmel von unten anleuchtet. Rein und ohne three.js: `atmosphereAt` schreibt in ein vorhandenes Objekt
// (keine Zuweisungen je Bild); Environment übernimmt die Werte in Uniforms – keine neuen Shader-Varianten.
import { BERNSTEINSEE, REGIONS } from '../data/regions';
import { MEGA_ISLANDS } from '../data/megaIslands';

export type Rgb3 = [number, number, number];

/** Stimmung einer Region oder eines Brennpunkts (Farben linear 0 … 1, Anteile 0 … 1) */
export interface AtmoProfile {
  /** Tönung von Horizont und Zenit */
  sky: Rgb3; skyK: number;
  /** Tönung des Nebels (zusätzlich zur Horizontfarbe) */
  fog: Rgb3; fogK: number;
  /** Tönung und Stärke des Hauptlichts */
  light: Rgb3; lightK: number; lightMul: number;
  /** Sichtweite als Faktor (< 1 = dunstiger) */
  haze: number;
  /** Schein von unten (Lava, Glutfelder): Himmel am Horizont, Wolken-Unterseiten, Bodenlicht */
  glow: Rgb3; glowK: number;
  /** Tönung des Meeres */
  sea: Rgb3; seaK: number;
}

const NONE: AtmoProfile = { sky: [0, 0, 0], skyK: 0, fog: [0, 0, 0], fogK: 0, light: [1, 1, 1], lightK: 0, lightMul: 1, haze: 1, glow: [0, 0, 0], glowK: 0, sea: [0, 0, 0], seaK: 0 };

/** Stimmungen der Sektoren (Schlüssel = Regions-Kennung, data/regions.ts) */
export const REGION_ATMO: Record<string, AtmoProfile> = {
  nebel: { sky: [0.55, 0.66, 0.6], skyK: 0.32, fog: [0.6, 0.7, 0.64], fogK: 0.38, light: [0.86, 0.92, 0.88], lightK: 0.25, lightMul: 0.9, haze: 0.78, glow: [0, 0, 0], glowK: 0, sea: [0.1, 0.32, 0.32], seaK: 0.28 },
  nord: { sky: [0.62, 0.76, 0.92], skyK: 0.18, fog: [0.66, 0.78, 0.9], fogK: 0.2, light: [0.86, 0.92, 1.0], lightK: 0.2, lightMul: 0.96, haze: 0.94, glow: [0, 0, 0], glowK: 0, sea: [0.06, 0.24, 0.42], seaK: 0.22 },
  glut: { sky: [0.78, 0.55, 0.42], skyK: 0.26, fog: [0.56, 0.44, 0.38], fogK: 0.3, light: [1.0, 0.82, 0.62], lightK: 0.2, lightMul: 0.94, haze: 0.86, glow: [1.0, 0.36, 0.12], glowK: 0.12, sea: [0.12, 0.22, 0.26], seaK: 0.2 },
  sturm: { sky: [0.36, 0.42, 0.55], skyK: 0.3, fog: [0.42, 0.47, 0.56], fogK: 0.34, light: [0.78, 0.84, 0.96], lightK: 0.25, lightMul: 0.82, haze: 0.82, glow: [0, 0, 0], glowK: 0, sea: [0.06, 0.16, 0.24], seaK: 0.3 },
  schlund: { sky: [0.36, 0.28, 0.58], skyK: 0.28, fog: [0.4, 0.34, 0.54], fogK: 0.32, light: [0.86, 0.8, 1.0], lightK: 0.22, lightMul: 0.9, haze: 0.86, glow: [0.48, 0.3, 0.95], glowK: 0.08, sea: [0.1, 0.1, 0.3], seaK: 0.3 },
};

/** Brennpunkt: Stimmung um einen Ort (volle Stärke bis `r`, auslaufend bis `r + fade`) */
export interface AtmoSpot { id: string; x: number; z: number; r: number; fade: number; p: AtmoProfile }

const polar = (deg: number, dist: number) => ({ x: Math.sin((deg * Math.PI) / 180) * dist, z: Math.cos((deg * Math.PI) / 180) * dist });
const kurogane = MEGA_ISLANDS.find((m) => m.id === 'kuroganeschlund');
const kPos = kurogane ? polar(kurogane.deg, kurogane.dist) : { x: 0, z: 0 };

/** Brennpunkte: die Lavaspalten von Kurogane-Schlund werfen ihren Ascheschein weit über das Meer */
export const ATMO_SPOTS: AtmoSpot[] = kurogane ? [{
  id: 'kuroganeschlund', x: kPos.x, z: kPos.z, r: kurogane.r + 250, fade: 1500,
  p: { sky: [0.62, 0.38, 0.3], skyK: 0.3, fog: [0.46, 0.33, 0.3], fogK: 0.42, light: [1.0, 0.74, 0.52], lightK: 0.28, lightMul: 0.9, haze: 0.74, glow: [1.0, 0.3, 0.08], glowK: 0.42, sea: [0.14, 0.12, 0.14], seaK: 0.3 },
}] : [];

/** Ergebnis an einem Ort (wird überschrieben, nie neu angelegt) */
export interface AtmoState {
  sky: Rgb3; skyK: number; fog: Rgb3; fogK: number; light: Rgb3; lightK: number; lightMul: number; haze: number; glow: Rgb3; glowK: number; sea: Rgb3; seaK: number;
  /** Gewichte je Quelle (Regions-Kennung oder Brennpunkt) zum Nachsehen */
  region: string;
}

export function createAtmoState(): AtmoState {
  return { sky: [0, 0, 0], skyK: 0, fog: [0, 0, 0], fogK: 0, light: [1, 1, 1], lightK: 0, lightMul: 1, haze: 1, glow: [0, 0, 0], glowK: 0, sea: [0, 0, 0], seaK: 0, region: '' };
}

const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** Breite der weichen Sektorgrenze (Grad) */
export const SECTOR_FEATHER = 9;

/** Anteil eines Winkels (Grad, 0 = Norden, im Uhrzeigersinn) an einem Kuchenstück [a0, a1) mit weicher Grenze */
export function sectorWeight(deg: number, a0: number, a1: number): number {
  // auf die Mitte des Stücks beziehen (ohne Sprung am Umlauf)
  const mid = (a0 + a1) / 2, half = (a1 - a0) / 2;
  let d = deg - mid;
  d -= 360 * Math.round(d / 360);
  return 1 - smooth(half - SECTOR_FEATHER, half + SECTOR_FEATHER, Math.abs(d));
}

/** Farbsumme durch die Summe der Anteile teilen (gewichtetes Mittel); ohne Anteil die Ersatzfarbe */
function norm(sum: Rgb3, k: number, dst: Rgb3, fallback: Rgb3 | null) {
  if (k > 1e-5) { dst[0] = sum[0] / k; dst[1] = sum[1] / k; dst[2] = sum[2] / k; } else if (fallback) { dst[0] = fallback[0]; dst[1] = fallback[1]; dst[2] = fallback[2]; } else { dst[0] = dst[1] = dst[2] = 0; }
}

// Sammelfelder (ohne Zuweisungen je Aufruf)
const acc = { sky: [0, 0, 0] as Rgb3, fog: [0, 0, 0] as Rgb3, light: [0, 0, 0] as Rgb3, glow: [0, 0, 0] as Rgb3, sea: [0, 0, 0] as Rgb3 };

function addProfile(p: AtmoProfile, w: number, out: AtmoState) {
  if (w <= 0) return;
  const a = acc;
  const kS = w * p.skyK, kF = w * p.fogK, kL = w * p.lightK, kG = w * p.glowK, kW = w * p.seaK;
  for (let c = 0; c < 3; c++) {
    a.sky[c] += p.sky[c] * kS; a.fog[c] += p.fog[c] * kF; a.light[c] += p.light[c] * kL; a.glow[c] += p.glow[c] * kG; a.sea[c] += p.sea[c] * kW;
  }
  out.skyK += kS; out.fogK += kF; out.lightK += kL; out.glowK += kG; out.seaK += kW;
  out.lightMul -= w * (1 - p.lightMul);
  out.haze -= w * (1 - p.haze);
}

/**
 * Stimmung an einem Ort: die Bernsteinsee (Startmeer) bleibt unverfälscht; dahinter wächst die Stimmung des Sektors herein (weiche Grenzen von
 * ±9° zwischen den Sektoren), Brennpunkte kommen dazu. Farben sind gewichtete Mittel, die Anteile Summen (höchstens 1).
 */
export function atmosphereAt(x: number, z: number, out: AtmoState): AtmoState {
  out.skyK = out.fogK = out.lightK = out.glowK = out.seaK = 0;
  out.lightMul = 1; out.haze = 1;
  acc.sky.fill(0); acc.fog.fill(0); acc.light.fill(0); acc.glow.fill(0); acc.sea.fill(0);
  // Sektoren: erst außerhalb der Bernsteinsee, über 450 m eingeblendet
  const home = Math.hypot(x - BERNSTEINSEE.x, z - BERNSTEINSEE.z);
  const radial = smooth(BERNSTEINSEE.r - 60, BERNSTEINSEE.r + 450, home);
  let best = 0;
  out.region = BERNSTEINSEE.id;
  if (radial > 0) {
    let deg = (Math.atan2(x, z) * 180) / Math.PI;
    if (deg < -36) deg += 360;
    for (const r of REGIONS) {
      const p = REGION_ATMO[r.id];
      if (!p || !r.arc) continue;
      const w = sectorWeight(deg, r.arc[0], r.arc[1]) * radial;
      addProfile(p, w, out);
      if (w > best) { best = w; out.region = r.id; }
    }
  }
  for (const s of ATMO_SPOTS) {
    const d = Math.hypot(x - s.x, z - s.z);
    const w = 1 - smooth(s.r, s.r + s.fade, d);
    addProfile(s.p, w, out);
    // Brennpunkte sind genauer als der Sektor: bei Gleichstand gewinnen sie
    if (w > 0 && w >= best) { best = w; out.region = s.id; }
  }
  // Farben normieren (gewichtete Mittel), Anteile begrenzen
  norm(acc.sky, out.skyK, out.sky, null);
  norm(acc.fog, out.fogK, out.fog, null);
  norm(acc.light, out.lightK, out.light, NONE.light);
  norm(acc.glow, out.glowK, out.glow, null);
  norm(acc.sea, out.seaK, out.sea, null);
  out.skyK = Math.min(1, out.skyK); out.fogK = Math.min(1, out.fogK); out.lightK = Math.min(1, out.lightK); out.glowK = Math.min(1, out.glowK); out.seaK = Math.min(1, out.seaK);
  out.lightMul = Math.max(0.5, out.lightMul);
  out.haze = Math.max(0.45, out.haze);
  return out;
}
