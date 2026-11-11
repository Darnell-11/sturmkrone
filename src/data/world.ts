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
  { h: 0, name: 'Nacht', zenith: 0x040d2c, horizon: 0x1c3158, light: 0x8aa6f4, lightI: 0.85, ambientSky: 0x5a72b8, ambientGround: 0x0e1a30, ambientI: 0.78, seaDeep: 0x062648, seaShallow: 0x1a7090, cloudLit: 0x566ba0, cloudShade: 0x1c2542, rim: 0x9db4ff, stars: 1 },
  { h: 4.8, name: 'Nacht', zenith: 0x060f2e, horizon: 0x22385e, light: 0x8aa6f4, lightI: 0.8, ambientSky: 0x5a72b8, ambientGround: 0x0e1a30, ambientI: 0.75, seaDeep: 0x07284a, seaShallow: 0x1b7292, cloudLit: 0x566ba0, cloudShade: 0x1c2542, rim: 0x9db4ff, stars: 1 },
  { h: 6.2, name: 'Morgenrot', zenith: 0x3a62a0, horizon: 0xf2a878, light: 0xffc08a, lightI: 1.75, ambientSky: 0xa4b0d0, ambientGround: 0x323c4a, ambientI: 0.72, seaDeep: 0x0a3a62, seaShallow: 0x2a8f9e, cloudLit: 0xf2c4a6, cloudShade: 0x6e6888, rim: 0xffc898, stars: 0.15 },
  { h: 8.5, name: 'Tag', zenith: 0x2f689e, horizon: 0xbcd4e0, light: 0xfff0d8, lightI: 2.45, ambientSky: 0xc8dcea, ambientGround: 0x2a4652, ambientI: 0.86, seaDeep: 0x07456e, seaShallow: 0x27a6b2, cloudLit: 0xf4f2ee, cloudShade: 0x8592a8, rim: 0xfff0dc, stars: 0 },
  // Mittagssonne: hoch, fast weiß, kräftig – kurze, harte Schatten und tiefblauer Zenit
  { h: 12.5, name: 'Mittag', zenith: 0x1f66b8, horizon: 0xbcd8ea, light: 0xfff2dc, lightI: 2.55, ambientSky: 0xc0d8ec, ambientGround: 0x2c4a56, ambientI: 0.82, seaDeep: 0x05508a, seaShallow: 0x2ac0cc, cloudLit: 0xfbfaf6, cloudShade: 0x8a98ae, rim: 0xfff4e6, stars: 0 },
  { h: 16, name: 'Tag', zenith: 0x2f689e, horizon: 0xc2d6e0, light: 0xffecd0, lightI: 2.35, ambientSky: 0xc8dcea, ambientGround: 0x2a4652, ambientI: 0.82, seaDeep: 0x07456e, seaShallow: 0x27a6b2, cloudLit: 0xf4efe6, cloudShade: 0x8592a8, rim: 0xfff0dc, stars: 0 },
  { h: 18.4, name: 'Abendrot', zenith: 0x3a3f90, horizon: 0xff7436, light: 0xff8a44, lightI: 2.15, ambientSky: 0xd096a4, ambientGround: 0x3a2634, ambientI: 0.78, seaDeep: 0x183a6a, seaShallow: 0x3c8498, cloudLit: 0xffa662, cloudShade: 0x6a4478, rim: 0xffa66a, stars: 0.08 },
  { h: 19.8, name: 'Dämmerung', zenith: 0x161e4e, horizon: 0x8c4a7c, light: 0xc88ab0, lightI: 1.05, ambientSky: 0x786a9e, ambientGround: 0x181828, ambientI: 0.68, seaDeep: 0x0a2040, seaShallow: 0x22607a, cloudLit: 0x9a6c9c, cloudShade: 0x2c2650, rim: 0xc09cff, stars: 0.6 },
  { h: 21.2, name: 'Nacht', zenith: 0x040d2c, horizon: 0x1c3158, light: 0x8aa6f4, lightI: 0.85, ambientSky: 0x5a72b8, ambientGround: 0x0e1a30, ambientI: 0.78, seaDeep: 0x062648, seaShallow: 0x1a7090, cloudLit: 0x566ba0, cloudShade: 0x1c2542, rim: 0x9db4ff, stars: 1 },
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
