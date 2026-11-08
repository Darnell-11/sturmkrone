import { Color, MathUtils, Vector3 } from 'three';
import { TIME_KEYS, type TimeKey } from '../data/world';

type ColorKey = Exclude<keyof TimeKey, 'h' | 'name' | 'lightI' | 'ambientI' | 'stars'>;
const COLOR_KEYS: ColorKey[] = ['zenith', 'horizon', 'light', 'ambientSky', 'ambientGround', 'seaDeep', 'seaShallow', 'cloudLit', 'cloudShade', 'rim'];

export interface Palette {
  name: string;
  zenith: Color; horizon: Color; light: Color; ambientSky: Color; ambientGround: Color;
  seaDeep: Color; seaShallow: Color; cloudLit: Color; cloudShade: Color; rim: Color;
  lightI: number; ambientI: number; stars: number;
  sunDir: Vector3; moonDir: Vector3;
  /** Sichtbarkeit von Sonne bzw. Mond über dem Horizont (0 … 1) */
  sunVis: number; moonVis: number;
  /** Richtung des Hauptlichts (Sonne am Tag, Mond in der Nacht) */
  lightDir: Vector3;
  /** Helligkeit des Hauptlichts beim Wechsel Sonne ↔ Mond: geht kurz auf 0, damit Schatten nicht springen */
  lightK: number;
}

export function createPalette(): Palette {
  return {
    name: '', zenith: new Color(), horizon: new Color(), light: new Color(), ambientSky: new Color(), ambientGround: new Color(),
    seaDeep: new Color(), seaShallow: new Color(), cloudLit: new Color(), cloudShade: new Color(), rim: new Color(),
    lightI: 1, ambientI: 1, stars: 0, sunDir: new Vector3(), moonDir: new Vector3(), sunVis: 1, moonVis: 0, lightDir: new Vector3(), lightK: 1,
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
  // Hauptlicht nie ganz flach, damit Schatten nicht endlos lang werden
  out.lightDir.copy(out.sunVis >= 0.5 || out.sunDir.y > out.moonDir.y ? out.sunDir : out.moonDir);
  // Übergabe Sonne ↔ Mond: das Hauptlicht blendet um den Wechsel herum aus und wieder ein,
  // so dreht sich die Schattenrichtung unsichtbar (vorher sprangen alle Schatten schlagartig)
  out.lightK = MathUtils.smoothstep(Math.abs(out.sunDir.y - out.moonDir.y), 0.0, 0.14);
  if (out.lightDir.y < 0.25) { out.lightDir.y = 0.25; out.lightDir.normalize(); }
  return out;
}

/** "08:30" */
export function formatClock(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
