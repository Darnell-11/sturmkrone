// Grundwerte der Welt. Regionen und echte Inseln kommen in Meilenstein 6.

/** Radius der Meeresscheibe in Metern. Dahinter stürzt das Meer als Wasserfall in die Tiefe. */
export const WORLD_RADIUS = 2000;
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
  { dir: 20, length: 110, amp: 0.75, steep: 0.55 },
  { dir: -35, length: 64, amp: 0.42, steep: 0.6 },
  { dir: 75, length: 37, amp: 0.22, steep: 0.65 },
  { dir: 145, length: 21, amp: 0.11, steep: 0.6 },
  { dir: 5, length: 11, amp: 0.05, steep: 0.5 },
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
  seaShallow: number;
  cloudLit: number;
  cloudShade: number;
  rim: number;
  stars: number;
}

/** Farbstimmungen über den Tag. Dazwischen wird weich überblendet. */
export const TIME_KEYS: TimeKey[] = [
  { h: 0, name: 'Nacht', zenith: 0x040a1e, horizon: 0x16284a, light: 0x8fa8ff, lightI: 0.55, ambientSky: 0x5b70b0, ambientGround: 0x0a1424, ambientI: 0.6, seaDeep: 0x04182e, seaShallow: 0x0f4a5e, cloudLit: 0x4a5a84, cloudShade: 0x1c2440, rim: 0x9fb4ff, stars: 1 },
  { h: 4.8, name: 'Nacht', zenith: 0x060e26, horizon: 0x1c2f55, light: 0x8fa8ff, lightI: 0.5, ambientSky: 0x5b70b0, ambientGround: 0x0a1424, ambientI: 0.55, seaDeep: 0x05192f, seaShallow: 0x104b60, cloudLit: 0x4a5a84, cloudShade: 0x1c2440, rim: 0x9fb4ff, stars: 1 },
  { h: 6.2, name: 'Morgen', zenith: 0x3d6db5, horizon: 0xffb38a, light: 0xffc49a, lightI: 1.6, ambientSky: 0xb7c6ef, ambientGround: 0x3a4a5a, ambientI: 0.85, seaDeep: 0x0d4f7a, seaShallow: 0x2fa7b8, cloudLit: 0xffd3b8, cloudShade: 0x8a7fa8, rim: 0xffd2a8, stars: 0.15 },
  { h: 8.5, name: 'Tag', zenith: 0x2a7fd6, horizon: 0xbfe8ff, light: 0xfff2dc, lightI: 2.6, ambientSky: 0xdff3ff, ambientGround: 0x2f5a6a, ambientI: 1.05, seaDeep: 0x0b6a96, seaShallow: 0x33c4d2, cloudLit: 0xffffff, cloudShade: 0xa9bcd8, rim: 0xfff4e0, stars: 0 },
  { h: 16, name: 'Tag', zenith: 0x2a7fd6, horizon: 0xc8ecff, light: 0xfff0d6, lightI: 2.5, ambientSky: 0xdff3ff, ambientGround: 0x2f5a6a, ambientI: 1.0, seaDeep: 0x0b6a96, seaShallow: 0x33c4d2, cloudLit: 0xffffff, cloudShade: 0xa9bcd8, rim: 0xfff4e0, stars: 0 },
  { h: 18.4, name: 'Abendrot', zenith: 0x3a4f9a, horizon: 0xff8a5c, light: 0xff9a5a, lightI: 1.9, ambientSky: 0xe0a8b8, ambientGround: 0x3a2a3a, ambientI: 0.85, seaDeep: 0x1a3f6e, seaShallow: 0x3f8fa8, cloudLit: 0xffb07a, cloudShade: 0x7a5a8a, rim: 0xffb080, stars: 0.05 },
  { h: 19.8, name: 'Dämmerung', zenith: 0x141c4a, horizon: 0x6a4a7a, light: 0xc890b0, lightI: 0.8, ambientSky: 0x7a6aa0, ambientGround: 0x141424, ambientI: 0.65, seaDeep: 0x0a1e3e, seaShallow: 0x1f5a70, cloudLit: 0x8a6a9a, cloudShade: 0x2a2448, rim: 0xc0a0ff, stars: 0.5 },
  { h: 21.2, name: 'Nacht', zenith: 0x040a1e, horizon: 0x16284a, light: 0x8fa8ff, lightI: 0.55, ambientSky: 0x5b70b0, ambientGround: 0x0a1424, ambientI: 0.6, seaDeep: 0x04182e, seaShallow: 0x0f4a5e, cloudLit: 0x4a5a84, cloudShade: 0x1c2440, rim: 0x9fb4ff, stars: 1 },
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
  klar: { label: 'Klar', clouds: 0.3, cloudDark: 0, visibility: 1, grey: 0, rain: 0, waves: 1, wind: 0.3, lightning: 0, light: 1, weight: 5 },
  bewoelkt: { label: 'Bewölkt', clouds: 0.85, cloudDark: 0.25, visibility: 0.85, grey: 0.3, rain: 0, waves: 1.25, wind: 0.5, lightning: 0, light: 0.75, weight: 3 },
  nebel: { label: 'Nebel', clouds: 0.6, cloudDark: 0.15, visibility: 0.22, grey: 0.75, rain: 0, waves: 0.7, wind: 0.1, lightning: 0, light: 0.7, weight: 1.5 },
  regen: { label: 'Regen', clouds: 1, cloudDark: 0.55, visibility: 0.55, grey: 0.6, rain: 0.65, waves: 1.6, wind: 0.65, lightning: 0, light: 0.55, weight: 1.5 },
  sturm: { label: 'Sturm', clouds: 1, cloudDark: 0.85, visibility: 0.4, grey: 0.8, rain: 1, waves: 2.6, wind: 1, lightning: 7, light: 0.38, weight: 0.8 },
};
