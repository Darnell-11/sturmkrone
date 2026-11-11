// Schiffe, Munition und Anpassung. Werte aus 1.0 übernommen und erweitert.

export interface ShipClass {
  id: string;
  n: string;
  /** Länge, Breite, Masthöhe in Metern */
  L: number;
  W: number;
  mh: number;
  /** Mastpositionen als Anteil der Länge (vorn positiv) */
  masts: number[];
  hp: number;
  /** Kanonen pro Seite */
  can: number;
  spd: number;
  crew: number;
  price: number;
  /** Benötigter Rang (Index) */
  rank: number;
  /** Decks (1–3) für das Aussehen */
  decks: number;
}

/**
 * Tempo-Faktor aller Schiffe auf See (eigene und feindliche, damit Verfolgung und Flucht gleich bleiben).
 * 2.9.27: Die Welt wurde doppelt so weit, die Fahrten zu lang – darum 30 % schneller.
 * 2.9.47: Auf 0,95 gesenkt: 1,3 war bei einer 18-m-Schaluppe über 50 Knoten und ließ das Wasser wie einen Fluss vorbeiziehen.
 */
export const SEA_SPEED = 0.95;

// Größer als in 1.0: schon die Schaluppe wirkt wie ein echtes Schiff, späte Klassen sind gewaltig
export const SHIP_CLASSES: ShipClass[] = [
  { id: 'schaluppe', n: 'Schaluppe', L: 18, W: 5.8, mh: 13, masts: [0.06], hp: 120, can: 2, spd: 22, crew: 2, price: 0, rank: 0, decks: 1 },
  { id: 'brigg', n: 'Brigg', L: 24, W: 7.2, mh: 16, masts: [0.18, -0.14], hp: 200, can: 3, spd: 23, crew: 4, price: 1200, rank: 2, decks: 1 },
  { id: 'korvette', n: 'Korvette', L: 30, W: 8.4, mh: 19, masts: [0.2, -0.15], hp: 290, can: 4, spd: 24, crew: 5, price: 2600, rank: 3, decks: 1 },
  { id: 'fregatte', n: 'Fregatte', L: 38, W: 10, mh: 23, masts: [0.26, 0.03, -0.17], hp: 400, can: 5, spd: 23, crew: 6, price: 4800, rank: 4, decks: 2 },
  { id: 'galeone', n: 'Galeone', L: 46, W: 12.5, mh: 27, masts: [0.27, 0.04, -0.16], hp: 560, can: 6, spd: 21.5, crew: 8, price: 8500, rank: 5, decks: 2 },
  { id: 'linienschiff', n: 'Linienschiff', L: 58, W: 15, mh: 32, masts: [0.28, 0.06, -0.14], hp: 780, can: 8, spd: 21, crew: 10, price: 15000, rank: 7, decks: 3 },
  { id: 'leviathan', n: 'Leviathan', L: 74, W: 19, mh: 38, masts: [0.31, 0.14, -0.02, -0.15], hp: 1100, can: 10, spd: 20, crew: 13, price: 30000, rank: 9, decks: 3 },
];

export type AmmoId = 'kugel' | 'kette' | 'kartaetsche' | 'brand';

export interface AmmoDef { n: string; d: string; hull: number; sail: number; crew: number; fire: number; range: number; speed: number; color: string }

export const AMMO: Record<AmmoId, AmmoDef> = {
  kugel: { n: 'Kugeln', d: 'Standard: schwerer Rumpfschaden', hull: 1, sail: 0.3, crew: 0.3, fire: 0, range: 1, speed: 1, color: '#2A2A2E' },
  kette: { n: 'Kettenkugeln', d: 'Zerfetzen Segel: Gegner werden langsam', hull: 0.35, sail: 1.6, crew: 0.2, fire: 0, range: 0.8, speed: 0.9, color: '#6A6A72' },
  kartaetsche: { n: 'Kartätschen', d: 'Schrot gegen die Crew: erleichtert das Entern', hull: 0.3, sail: 0.4, crew: 1.8, fire: 0, range: 0.6, speed: 1.1, color: '#9A8A6A' },
  brand: { n: 'Brandkugeln', d: 'Setzen Schiffe in Brand – Schaden über Zeit', hull: 0.6, sail: 0.6, crew: 0.4, fire: 1, range: 0.9, speed: 0.95, color: '#FF7A2A' },
};

export const AMMO_IDS = Object.keys(AMMO) as AmmoId[];

export const HULL_COLORS = ['#8A5A2B', '#5A3A1E', '#3A2A1E', '#1E1A20', '#7A1F1A', '#14284A', '#2F4A3A', '#E8DCC0'];
export const SAIL_COLORS = ['#F6EAD0', '#FFFFFF', '#1E1A20', '#A8322A', '#E8B33A', '#1F4E79', '#4A2E6E', '#2F6E4F'];
export const STRIPE_COLORS = ['#1F4E79', '#A8322A', '#E3B04B', '#F3E6C8', '#1E1A20', '#2F8F9D', '#6E8B3D', '#4A2E6E'];
export const FLAGS = { totenkopf: 'Grinsender Schädel', krone: 'Sturmkrone', anker: 'Anker', welle: 'Welle', stern: 'Stern', marine: 'Marine-Wappen' } as const;
export const FIGUREHEADS = { keine: 'Keine', loewe: 'Löwe', drache: 'Seedrache', adler: 'Adler', meerfrau: 'Wellenfrau', kraken: 'Krake' } as const;
export type FlagId = keyof typeof FLAGS;
export type FigureheadId = keyof typeof FIGUREHEADS;

export interface ShipLook {
  hull: string;
  stripe: string;
  sail: string;
  flag: FlagId;
  flagColor: string;
  figurehead: FigureheadId;
  lanterns: boolean;
}

export const DEFAULT_SHIP_LOOK = (faction: 'pirat' | 'marine'): ShipLook => faction === 'pirat'
  ? { hull: '#8A5A2B', stripe: '#A8322A', sail: '#F6EAD0', flag: 'totenkopf', flagColor: '#1E1A20', figurehead: 'drache', lanterns: true }
  : { hull: '#E8DCC0', stripe: '#14284A', sail: '#FFFFFF', flag: 'marine', flagColor: '#1F4E79', figurehead: 'adler', lanterns: true };

/** Fahrstufen: Anteil der Segel */
export const SAIL_LEVELS = [
  { n: 'Anker', k: 0 },
  { n: 'Halbe Fahrt', k: 0.55 },
  { n: 'Volle Fahrt', k: 1 },
];

/** Gegnerische Schiffstypen auf See */
export type NavalRole = 'patrouille' | 'haendler' | 'jaeger' | 'legende';
