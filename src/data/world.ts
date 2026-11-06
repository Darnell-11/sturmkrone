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
  // lange Dünung aus einer anderen Richtung: das Meer hebt und senkt sich unregelmäßig wie echte See
  { dir: -62, length: 170, amp: 0.38, steep: 0.3 },
  { dir: 20, length: 110, amp: 0.75, steep: 0.55 },
  { dir: -35, length: 64, amp: 0.42, steep: 0.6 },
  { dir: 75, length: 37, amp: 0.22, steep: 0.65 },
  { dir: 145, length: 21, amp: 0.11, steep: 0.6 },
  { dir: 112, length: 15.5, amp: 0.07, steep: 0.6 },
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
  // Ernster, düsterer Anime-Look: dunstiges Himmelsblau statt Bonbonblau, weniger Umgebungslicht (mehr Kontrast),
  // schwere graublaue Wolkenschatten, tiefes Abendrot und dunkle, aber lesbare Nächte
  { h: 0, name: 'Nacht', zenith: 0x03081a, horizon: 0x121f3a, light: 0x7f98e8, lightI: 0.5, ambientSky: 0x4a5c94, ambientGround: 0x080f1c, ambientI: 0.52, seaDeep: 0x03132a, seaShallow: 0x0c3c4e, cloudLit: 0x3e4c70, cloudShade: 0x151b32, rim: 0x8fa4f0, stars: 1 },
  { h: 4.8, name: 'Nacht', zenith: 0x050c22, horizon: 0x18294c, light: 0x7f98e8, lightI: 0.46, ambientSky: 0x4a5c94, ambientGround: 0x080f1c, ambientI: 0.5, seaDeep: 0x04142b, seaShallow: 0x0d3d50, cloudLit: 0x3e4c70, cloudShade: 0x151b32, rim: 0x8fa4f0, stars: 1 },
  { h: 6.2, name: 'Morgen', zenith: 0x34588e, horizon: 0xe8a07a, light: 0xffbe90, lightI: 1.5, ambientSky: 0xa4b0d0, ambientGround: 0x323c4a, ambientI: 0.72, seaDeep: 0x0a3a62, seaShallow: 0x2a8f9e, cloudLit: 0xf2c4a6, cloudShade: 0x6e6888, rim: 0xffc898, stars: 0.15 },
  { h: 8.5, name: 'Tag', zenith: 0x2f689e, horizon: 0xbcd4e0, light: 0xfff0d8, lightI: 2.45, ambientSky: 0xc8dcea, ambientGround: 0x2a4652, ambientI: 0.86, seaDeep: 0x07456e, seaShallow: 0x27a6b2, cloudLit: 0xf4f2ee, cloudShade: 0x8592a8, rim: 0xfff0dc, stars: 0 },
  { h: 16, name: 'Tag', zenith: 0x2f689e, horizon: 0xc2d6e0, light: 0xffecd0, lightI: 2.35, ambientSky: 0xc8dcea, ambientGround: 0x2a4652, ambientI: 0.82, seaDeep: 0x07456e, seaShallow: 0x27a6b2, cloudLit: 0xf4efe6, cloudShade: 0x8592a8, rim: 0xfff0dc, stars: 0 },
  { h: 18.4, name: 'Abendrot', zenith: 0x2e3c78, horizon: 0xe8703e, light: 0xff8a48, lightI: 1.85, ambientSky: 0xc08c98, ambientGround: 0x30222e, ambientI: 0.7, seaDeep: 0x14325a, seaShallow: 0x347888, cloudLit: 0xf09a62, cloudShade: 0x5e4270, rim: 0xffa070, stars: 0.05 },
  { h: 19.8, name: 'Dämmerung', zenith: 0x10163c, horizon: 0x583a66, light: 0xb880a0, lightI: 0.75, ambientSky: 0x625688, ambientGround: 0x10101e, ambientI: 0.56, seaDeep: 0x081834, seaShallow: 0x1a4c60, cloudLit: 0x765a88, cloudShade: 0x221d3c, rim: 0xb090f0, stars: 0.5 },
  { h: 21.2, name: 'Nacht', zenith: 0x03081a, horizon: 0x121f3a, light: 0x7f98e8, lightI: 0.5, ambientSky: 0x4a5c94, ambientGround: 0x080f1c, ambientI: 0.52, seaDeep: 0x03132a, seaShallow: 0x0c3c4e, cloudLit: 0x3e4c70, cloudShade: 0x151b32, rim: 0x8fa4f0, stars: 1 },
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
  // mehr Wolken und häufiger raues Wetter – die See ist kein Urlaubsort
  klar: { label: 'Klar', clouds: 0.45, cloudDark: 0.05, visibility: 1, grey: 0, rain: 0, waves: 1.1, wind: 0.4, lightning: 0, light: 1, weight: 4 },
  bewoelkt: { label: 'Bewölkt', clouds: 0.9, cloudDark: 0.35, visibility: 0.82, grey: 0.35, rain: 0, waves: 1.35, wind: 0.55, lightning: 0, light: 0.72, weight: 3.5 },
  nebel: { label: 'Nebel', clouds: 0.6, cloudDark: 0.2, visibility: 0.22, grey: 0.75, rain: 0, waves: 0.7, wind: 0.1, lightning: 0, light: 0.66, weight: 1.5 },
  regen: { label: 'Regen', clouds: 1, cloudDark: 0.6, visibility: 0.52, grey: 0.6, rain: 0.65, waves: 1.7, wind: 0.7, lightning: 0.6, light: 0.52, weight: 2 },
  sturm: { label: 'Sturm', clouds: 1, cloudDark: 0.88, visibility: 0.4, grey: 0.8, rain: 1, waves: 2.7, wind: 1, lightning: 8, light: 0.36, weight: 1 },
};
