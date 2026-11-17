// Grundwerte der Welt. Regionen und echte Inseln kommen in Meilenstein 6.

/**
 * Längenfaktor der Welt gegenüber der ersten Karte (bis 2.9.26): 2 = doppelter Radius = vierfache Fläche.
 * Alle Inselabstände, Regionen und Grenzen leiten sich daraus ab (siehe data/regions.ts).
 */
export const WORLD_SCALE = 2;
/** Radius der Meeresscheibe in Metern. Dahinter stürzt das Meer als Wasserfall in die Tiefe. */
export const WORLD_RADIUS = 2000 * WORLD_SCALE;
/** Unsichtbare Wand: so nah dürfen Schiffe an die Kante */
export const EDGE_WALL = WORLD_RADIUS - 70;

export interface WaveDef {
  /** Richtung in Grad (0 = +X) */
  dir: number;
  /** Wellenlänge in Metern */
  length: number;
  /** Höhe (Amplitude) in Metern bei ruhiger See */
  amp: number;
  /** Spitzheit 0 … 1 (höher = schärfere Kämme) */
  steep: number;
}

/** Gerstner-Wellen, von groß nach klein. Höhe wird mit dem Wetter skaliert. */
export const WAVES: WaveDef[] = [
  // lange Dünung aus einer anderen Richtung: das Meer hebt und senkt sich unregelmäßig wie echte See
  { dir: -62, length: 170, amp: 0.38, steep: 0.25 },
  { dir: 20, length: 110, amp: 0.75, steep: 0.45 },
  { dir: -35, length: 64, amp: 0.42, steep: 0.49 },
  { dir: 75, length: 37, amp: 0.22, steep: 0.53 },
  { dir: 145, length: 21, amp: 0.11, steep: 0.49 },
  { dir: 112, length: 15.5, amp: 0.07, steep: 0.49 },
  { dir: 5, length: 11, amp: 0.05, steep: 0.41 },
  // mittlere Windsee und Kabbelwasser: bricht die großen Muster auf und lässt das Meer lebendig arbeiten
  { dir: -12, length: 46, amp: 0.17, steep: 0.51 },
  { dir: 52, length: 27, amp: 0.1, steep: 0.51 },
  { dir: -78, length: 8.5, amp: 0.034, steep: 0.41 },
];

/** Echte Minuten für einen ganzen Tag im Spiel */
export const DAY_MINUTES = 24;

export interface TimeKey {
  /** Uhrzeit 0 … 24 */
  h: number;
  name: string;
  zenith: number;
  horizon: number;
  /** Farbe der Sonne bzw. des Mondlichts */
  light: number;
  lightI: number;
  ambientSky: number;
  ambientGround: number;
  ambientI: number;
  seaDeep: number;
  /** Mitteltiefes Wasser: Azur zwischen Türkis (flach) und Saphir (tief) */
  seaMid: number;
  seaShallow: number;
  cloudLit: number;
  cloudShade: number;
  rim: number;
  stars: number;
}

/**
 * Farbstimmungen über den Tag. Dazwischen wird weich überblendet.
 * Karibik: sattes Azurblau im Zenit, warmes Türkis-Gold am Horizont, goldenes Sonnenlicht (#fff3d1), lichtblaues Himmelslicht und
 * ein warmer Sand-Türkis-Rückstrahl vom Boden. Das Meer geht von leuchtendem Türkis (flach) über Azur in Saphirblau (tief).
 * Abend und Nacht bleiben Abend und Nacht, aber der Abend ist golden-orange statt grau-violett.
 */
export const TIME_KEYS: TimeKey[] = [
  { h: 0, name: 'Nacht', zenith: 0x040d2c, horizon: 0x1c3158, light: 0x8aa6f4, lightI: 0.85, ambientSky: 0x5a72b8, ambientGround: 0x0e1a30, ambientI: 0.78, seaDeep: 0x062648, seaMid: 0x0b3a64, seaShallow: 0x1a7090, cloudLit: 0x566ba0, cloudShade: 0x1c2542, rim: 0x9db4ff, stars: 1 },
  { h: 4.8, name: 'Nacht', zenith: 0x060f2e, horizon: 0x22385e, light: 0x8aa6f4, lightI: 0.8, ambientSky: 0x5a72b8, ambientGround: 0x0e1a30, ambientI: 0.75, seaDeep: 0x07284a, seaMid: 0x0c3c68, seaShallow: 0x1b7292, cloudLit: 0x566ba0, cloudShade: 0x1c2542, rim: 0x9db4ff, stars: 1 },
  { h: 6.2, name: 'Morgenrot', zenith: 0x3f7fcb, horizon: 0xffc08a, light: 0xffd2a0, lightI: 1.8, ambientSky: 0xb7cde8, ambientGround: 0x8a7a62, ambientI: 0.8, seaDeep: 0x0a4f82, seaMid: 0x1a8fb8, seaShallow: 0x3cc9b4, cloudLit: 0xffd9bf, cloudShade: 0x8d90b8, rim: 0xffd0a0, stars: 0.1 },
  { h: 8.5, name: 'Tag', zenith: 0x1f86dc, horizon: 0xd9f2e4, light: 0xfff3d1, lightI: 2.55, ambientSky: 0xa8d3f5, ambientGround: 0x9ad0b4, ambientI: 1.14, seaDeep: 0x0a6aa6, seaMid: 0x0e93c9, seaShallow: 0x2dd4bf, cloudLit: 0xffffff, cloudShade: 0x9db8dc, rim: 0xfff3d1, stars: 0 },
  // Mittagssonne: hoch, goldweiß, kräftig – kurze Schatten, tiefes Azur im Zenit, türkis-heller Horizont
  { h: 12.5, name: 'Mittag', zenith: 0x1272dc, horizon: 0xc9f1e8, light: 0xfff3d1, lightI: 2.65, ambientSky: 0xa0d2f8, ambientGround: 0x9cd3b6, ambientI: 1.14, seaDeep: 0x066fae, seaMid: 0x0aa0dc, seaShallow: 0x33e0c8, cloudLit: 0xffffff, cloudShade: 0x9db8dc, rim: 0xfff6dc, stars: 0 },
  { h: 16, name: 'Tag', zenith: 0x2084dc, horizon: 0xe2f0d4, light: 0xffeccb, lightI: 2.45, ambientSky: 0xa8d3f5, ambientGround: 0x9ad0b4, ambientI: 1.12, seaDeep: 0x0a6aa6, seaMid: 0x0e93c9, seaShallow: 0x2dd4bf, cloudLit: 0xfffaf0, cloudShade: 0x9db8dc, rim: 0xfff0d0, stars: 0 },
  { h: 18.4, name: 'Abendrot', zenith: 0x2f63b4, horizon: 0xff9a48, light: 0xff9a52, lightI: 2.2, ambientSky: 0xe0b0a8, ambientGround: 0x6a5248, ambientI: 0.85, seaDeep: 0x14487c, seaMid: 0x2a7ea2, seaShallow: 0x4fb4a2, cloudLit: 0xffb070, cloudShade: 0x8a5a80, rim: 0xffa862, stars: 0.06 },
  { h: 19.8, name: 'Dämmerung', zenith: 0x1a2f7a, horizon: 0xc06888, light: 0xd890b8, lightI: 1.1, ambientSky: 0x8c76a8, ambientGround: 0x201c30, ambientI: 0.7, seaDeep: 0x0c2a52, seaMid: 0x1a5a7c, seaShallow: 0x2a7088, cloudLit: 0xb87aa4, cloudShade: 0x34305c, rim: 0xd0a8ff, stars: 0.6 },
  { h: 21.2, name: 'Nacht', zenith: 0x040d2c, horizon: 0x1c3158, light: 0x8aa6f4, lightI: 0.85, ambientSky: 0x5a72b8, ambientGround: 0x0e1a30, ambientI: 0.78, seaDeep: 0x062648, seaMid: 0x0b3a64, seaShallow: 0x1a7090, cloudLit: 0x566ba0, cloudShade: 0x1c2542, rim: 0x9db4ff, stars: 1 },
];

export const WEATHER_IDS = ['klar', 'bewoelkt', 'nebel', 'regen', 'sturm'] as const;
export type WeatherId = (typeof WEATHER_IDS)[number];

export interface WeatherDef {
  label: string;
  /** Anteil sichtbarer Wolken 0 … 1 */
  clouds: number;
  /** Verdunkelung der Wolken 0 … 1 */
  cloudDark: number;
  /** Sichtweite als Anteil der normalen Sichtweite */
  visibility: number;
  /** Graufärbung von Himmel und Nebel 0 … 1 */
  grey: number;
  rain: number;
  /** Wellenhöhe als Vielfaches */
  waves: number;
  /** Windstärke 0 … 1 (Regenschräge, Wolkenzug) */
  wind: number;
  /** Blitze pro Minute */
  lightning: number;
  /** Lichtstärke als Vielfaches */
  light: number;
  /** Relative Häufigkeit beim zufälligen Wetterwechsel */
  weight: number;
}

export const WEATHER: Record<WeatherId, WeatherDef> = {
  // Karibik: meist sonnig mit Passat-Schäfchenwolken und sanften Wellen; Regen, Nebel und Sturm bleiben, kommen aber seltener
  klar: { label: 'Klar', clouds: 0.5, cloudDark: 0, visibility: 1, grey: 0, rain: 0, waves: 0.9, wind: 0.4, lightning: 0, light: 1, weight: 8 },
  bewoelkt: { label: 'Bewölkt', clouds: 0.9, cloudDark: 0.3, visibility: 0.84, grey: 0.3, rain: 0, waves: 1.25, wind: 0.55, lightning: 0, light: 0.76, weight: 3 },
  nebel: { label: 'Nebel', clouds: 0.6, cloudDark: 0.2, visibility: 0.22, grey: 0.75, rain: 0, waves: 0.7, wind: 0.1, lightning: 0, light: 0.66, weight: 1 },
  regen: { label: 'Regen', clouds: 1, cloudDark: 0.6, visibility: 0.52, grey: 0.6, rain: 0.65, waves: 1.7, wind: 0.7, lightning: 0.6, light: 0.52, weight: 1.6 },
  sturm: { label: 'Sturm', clouds: 1, cloudDark: 0.88, visibility: 0.4, grey: 0.8, rain: 1, waves: 2.7, wind: 1, lightning: 8, light: 0.36, weight: 0.8 },
};
