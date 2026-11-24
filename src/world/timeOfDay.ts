import { Color, MathUtils, Vector3 } from 'three';
import { TIME_KEYS, type TimeKey } from '../data/world';

type ColorKey = Exclude<keyof TimeKey, 'h' | 'name' | 'lightI' | 'ambientI' | 'stars'>;
const COLOR_KEYS: ColorKey[] = ['zenith', 'horizon', 'light', 'ambientSky', 'ambientGround', 'seaDeep', 'seaMid', 'seaShallow', 'cloudLit', 'cloudShade', 'rim'];

export interface Palette {
  name: string;
  zenith: Color; horizon: Color; light: Color; ambientSky: Color; ambientGround: Color;
  seaDeep: Color; seaMid: Color; seaShallow: Color; cloudLit: Color; cloudShade: Color; rim: Color;
  lightI: number; ambientI: number; stars: number;
  sunDir: Vector3; moonDir: Vector3;
  /** Sichtbarkeit von Sonne bzw. Mond über dem Horizont (0 … 1) */
  sunVis: number; moonVis: number;
  /** Richtung des Hauptlichts (Sonne am Tag, Mond in der Nacht) */
  lightDir: Vector3;
  /** Helligkeit des Hauptlichts beim Wechsel Sonne ↔ Mond: geht kurz auf 0, damit Schatten nicht springen */
  lightK: number;
  /** Mittagshöhe der Sonne 0 … 1: steuert Farbtemperatur, Fülllicht und Schattenhärte */
  noon: number;
}

export function createPalette(): Palette {
  return {
    name: '', zenith: new Color(), horizon: new Color(), light: new Color(), ambientSky: new Color(), ambientGround: new Color(),
    seaDeep: new Color(), seaMid: new Color(), seaShallow: new Color(), cloudLit: new Color(), cloudShade: new Color(), rim: new Color(),
    lightI: 1, ambientI: 1, stars: 0, sunDir: new Vector3(), moonDir: new Vector3(), sunVis: 1, moonVis: 0, lightDir: new Vector3(), lightK: 1, noon: 0,
  };
}

const tmpA = new Color();
const tmpB = new Color();

function celestial(hour: number, peakDeg: number, out: Vector3) {
  // 6 Uhr Osten (+X), 12 Uhr hoch im Süden, 18 Uhr Westen
  const t = ((hour - 6) / 12) * Math.PI;
  const el = Math.sin(t) * MathUtils.degToRad(peakDeg);
  const az = t;
  out.set(Math.cos(az) * Math.cos(el), Math.sin(el), -0.35 + Math.sin(az) * 0.25 * Math.cos(el)).normalize();
  return out;
}

/** Berechnet die Farbstimmung für eine Uhrzeit (0 … 24). */
export function samplePalette(hour: number, out: Palette): Palette {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < TIME_KEYS.length - 1 && TIME_KEYS[i + 1].h <= h) i++;
  const a = TIME_KEYS[i];
  const b = TIME_KEYS[(i + 1) % TIME_KEYS.length];
  const span = (b.h > a.h ? b.h : b.h + 24) - a.h;
  const k = span > 0 ? MathUtils.smoothstep((h - a.h) / span, 0, 1) : 0;
  for (const key of COLOR_KEYS) {
    tmpA.setHex(a[key]);
    tmpB.setHex(b[key]);
    out[key].copy(tmpA).lerp(tmpB, k);
  }
  out.lightI = MathUtils.lerp(a.lightI, b.lightI, k);
  out.ambientI = MathUtils.lerp(a.ambientI, b.ambientI, k);
  out.stars = MathUtils.lerp(a.stars, b.stars, k);
  out.name = k < 0.5 ? a.name : b.name;

  celestial(h, 68, out.sunDir);
  celestial(h + 12, 52, out.moonDir);
  out.sunVis = MathUtils.smoothstep(out.sunDir.y, -0.04, 0.06);
  out.moonVis = MathUtils.smoothstep(out.moonDir.y, -0.04, 0.08) * (1 - out.sunVis);
  // Mittagskurve: steht die Sonne hoch, wird ihr Licht goldener (#fff3d1) und etwas schwächer, das Himmelsfüllicht bleibt lichtblau –
  // so bleiben kräftige Schatten und die Texturen von Stein, Holz und Gras erhalten, statt in weiß-blauem Licht auszuwaschen
  out.noon = MathUtils.smoothstep(out.sunDir.y, 0.6, 0.93) * out.sunVis;
  out.light.lerp(tmpA.setRGB(1, 0.9, 0.64), 0.3 * out.noon);
  out.ambientSky.lerp(tmpA.setRGB(0.4, 0.66, 0.96), 0.22 * out.noon);
  out.lightI *= 1 - 0.06 * out.noon;
  out.ambientI *= 1 - 0.04 * out.noon;
  // Hauptlicht nie ganz flach, damit Schatten nicht endlos lang werden
  out.lightDir.copy(out.sunVis >= 0.5 || out.sunDir.y > out.moonDir.y ? out.sunDir : out.moonDir);
  // Übergabe Sonne ↔ Mond: das Hauptlicht blendet um den Wechsel herum aus und wieder ein,
  // so dreht sich die Schattenrichtung unsichtbar (vorher sprangen alle Schatten schlagartig)
  out.lightK = MathUtils.smoothstep(Math.abs(out.sunDir.y - out.moonDir.y), 0.0, 0.14);
  if (out.lightDir.y < 0.25) { out.lightDir.y = 0.25; out.lightDir.normalize(); }
  return out;
}

/** Die vier Phasen des Tages (4.4C): Morgengrauen, Hochmittag, Goldene Stunde (bis Abendrot) und Sternen-/Mondnacht */
export type DayPhase = 'morgengrauen' | 'mittag' | 'goldeneStunde' | 'nacht';
export const DAY_PHASES: readonly DayPhase[] = ['morgengrauen', 'mittag', 'goldeneStunde', 'nacht'];

/** Mitten der Phasen (Uhrzeit) – die Gewichte laufen zwischen benachbarten Mitten weich (Kosinus) über */
export const PHASE_CENTERS: Record<DayPhase, number> = { morgengrauen: 5.8, mittag: 12.5, goldeneStunde: 17.9, nacht: 0.5 };

/**
 * Anteile der vier Phasen an einer Uhrzeit (Summe 1, stetig über den ganzen Tag). `out` wird überschrieben (keine Zuweisungen je Bild).
 * Zwischen zwei benachbarten Phasenmitten blendet eine Kosinus-Kurve über; außerhalb der Nachbarschaft ist eine Phase 0.
 */
export function phaseWeights(hour: number, out: Record<DayPhase, number>): Record<DayPhase, number> {
  const h = ((hour % 24) + 24) % 24;
  out.morgengrauen = 0; out.mittag = 0; out.goldeneStunde = 0; out.nacht = 0;
  const order = DAY_PHASES;
  for (let i = 0; i < order.length; i++) {
    const a = order[i], b = order[(i + 1) % order.length];
    const ha = PHASE_CENTERS[a];
    let hb = PHASE_CENTERS[b];
    if (hb <= ha) hb += 24;
    let x = h;
    if (x < ha) x += 24;
    if (x >= ha && x <= hb) {
      const t = (x - ha) / (hb - ha);
      const k = 0.5 - 0.5 * Math.cos(Math.PI * t);
      out[a] = 1 - k;
      out[b] = k;
      return out;
    }
  }
  out.mittag = 1;
  return out;
}

/** Vorherrschende Phase */
export function dayPhase(hour: number): DayPhase {
  const w = phaseWeights(hour, { morgengrauen: 0, mittag: 0, goldeneStunde: 0, nacht: 0 });
  let best: DayPhase = 'mittag';
  for (const p of DAY_PHASES) if (w[p] > w[best]) best = p;
  return best;
}

/** "08:30" */
export function formatClock(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
