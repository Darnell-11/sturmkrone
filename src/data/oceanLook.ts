// Farbe des Meeres nach Wassertiefe (Phase 4.4C) – rein, ohne three.js: dieselben Zahlen erzeugen den GLSL-Code des Meeres (world/ocean.ts) und
// die Rechnung auf der CPU (Tests, Werkzeuge). Die Tiefe kommt ohne eigenen Tiefen-Durchgang aus dem Küstenabstandsfeld (`Ocean.setIslands`): in
// Strandlagunen kristallklares Smaragd-Türkis, über der Böschung Azur, auf offener See sattes Kobaltblau.

/** Übergänge der Wasserfarbe: Tiefe in Metern (lagoon, shallow, mid) bzw. Küstenabstand in Metern (abyss, offene See) */
export const OCEAN_DEPTH = {
  /** Smaragd-Lagune → Türkis (flache Strandlagunen bis etwa 2,5 m) */
  lagoon: [0.4, 2.6] as const,
  /** Türkis → Azur (unter etwa 6 m bleibt das Wasser türkis) */
  shallow: [5.0, 10.0] as const,
  /** Azur → Tiefblau über der Böschung */
  mid: [9.0, 30.0] as const,
  /** Tiefblau → Kobalt der offenen See (Küstenabstand; das Feld reicht 255 m weit) */
  abyss: [150, 250] as const,
};

/** Tönung von Lagune und offener See gegenüber den Tageszeit-Farben (siehe Environment): Anteil und Zielfarbe (linear) */
export const OCEAN_TINT = {
  lagoon: { k: 0.42, rgb: [0.08, 0.8, 0.6] as const },
  abyss: { k: 0.55, rgb: [0.03, 0.13, 0.42] as const },
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** GLSL-gleiches smoothstep */
export function smoothstepGl(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/**
 * Wassertiefe (m) aus dem Küstenabstand `sd` (m, 0 … 255) und dem Sandbank-Anteil `bank` (0 … 1) – dieselbe Formel wie im Meeres-Shader:
 * flache Lagune am Strand, dann Böschung, ab etwa 235 m volle Tiefe.
 */
export function seaDepthAt(sd: number, bank = 0): number {
  return Math.max(0.1 + sd * 0.042 + smoothstepGl(52, 235, sd) * 24 - bank * (1.1 + sd * 0.028), 0.08);
}

/** Gewichte der fünf Wasserfarben (Summe 1) für Tiefe und Küstenabstand, wie im Shader gemischt */
export interface SeaWeights { lagoon: number; shallow: number; mid: number; deep: number; abyss: number }

export function seaWeights(depth: number, sd: number, out: SeaWeights = { lagoon: 0, shallow: 0, mid: 0, deep: 0, abyss: 0 }): SeaWeights {
  const t1 = smoothstepGl(OCEAN_DEPTH.lagoon[0], OCEAN_DEPTH.lagoon[1], depth);
  const t2 = smoothstepGl(OCEAN_DEPTH.shallow[0], OCEAN_DEPTH.shallow[1], depth);
  const t3 = smoothstepGl(OCEAN_DEPTH.mid[0], OCEAN_DEPTH.mid[1], depth);
  const t4 = smoothstepGl(OCEAN_DEPTH.abyss[0], OCEAN_DEPTH.abyss[1], sd);
  // verschachtelte Mischung: mix(mix(mix(mix(L, S, t1), M, t2), D, t3), A, t4)
  const notA = 1 - t4;
  out.abyss = t4;
  out.deep = t3 * notA;
  out.mid = t2 * (1 - t3) * notA;
  out.shallow = t1 * (1 - t2) * (1 - t3) * notA;
  out.lagoon = (1 - t1) * (1 - t2) * (1 - t3) * notA;
  return out;
}

export type Rgb = [number, number, number];
export interface SeaColors { lagoon: Rgb; shallow: Rgb; mid: Rgb; deep: Rgb; abyss: Rgb }

/** Wasserfarbe (ohne Meeresgrund, Licht und Schaum) an einer Stelle – CPU-Zwilling des Shaders */
export function seaColorAt(sd: number, cols: SeaColors, out: Rgb = [0, 0, 0], bank = 0): Rgb {
  const w = seaWeights(seaDepthAt(sd, bank), sd);
  for (let c = 0; c < 3; c++) out[c] = cols.lagoon[c] * w.lagoon + cols.shallow[c] * w.shallow + cols.mid[c] * w.mid + cols.deep[c] * w.deep + cols.abyss[c] * w.abyss;
  return out;
}

const f = (n: number) => n.toFixed(4);
/** GLSL der Farbmischung (setzt skZ = Tiefe, sd = Küstenabstand und die Uniforms uLagoon, uShallow, uMid, uDeep, uAbyss voraus) */
export const SEA_COLOR_GLSL = /* glsl */ `
          vec3 skWater = mix(uLagoon, uShallow, smoothstep(${f(OCEAN_DEPTH.lagoon[0])}, ${f(OCEAN_DEPTH.lagoon[1])}, skZ));
          skWater = mix(skWater, uMid, smoothstep(${f(OCEAN_DEPTH.shallow[0])}, ${f(OCEAN_DEPTH.shallow[1])}, skZ));
          skWater = mix(skWater, uDeep, smoothstep(${f(OCEAN_DEPTH.mid[0])}, ${f(OCEAN_DEPTH.mid[1])}, skZ));
          skWater = mix(skWater, uAbyss, smoothstep(${f(OCEAN_DEPTH.abyss[0])}, ${f(OCEAN_DEPTH.abyss[1])}, sd));
`;
