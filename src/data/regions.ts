// Handgemachte Regionen. Meilenstein 6: die Bernsteinsee. Weitere Regionen folgen nach demselben Muster.

export type IslandKind = 'town' | 'camp' | 'quiet' | 'treasure' | 'lighthouse' | 'boss';

export interface IslandDef {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  /** Hügelhöhe als Faktor */
  hill: number;
  kind: IslandKind;
  palms: number;
  rocks?: number;
  /** Stufe des Lagers */
  level?: number;
  /** Kurzbeschreibung für Karte und Logbuch */
  info: string;
}

export interface RegionDef {
  id: string;
  name: string;
  /** Mittelpunkt und Radius auf der Weltkarte */
  x: number;
  z: number;
  r: number;
  color: string;
  islands: IslandDef[];
}

export const BERNSTEINSEE: RegionDef = {
  id: 'bernsteinsee',
  name: 'Bernsteinsee',
  x: 0, z: 150, r: 950,
  color: '#E8B33A',
  islands: [
    { id: 'ankerglueck', name: 'Ankerglück', x: 0, z: 160, r: 78, hill: 0.12, kind: 'town', palms: 14, info: 'Hafenstadt der Bernsteinsee: Taverne, Werft, Schmiede, Markt und Faji-Schrein.' },
    { id: 'muschelruh', name: 'Muschelruh', x: -260, z: 40, r: 30, hill: 0.2, kind: 'treasure', palms: 5, info: 'Ruhige Muschelinsel. Man munkelt von vergrabenem Gold.' },
    { id: 'kraehenfels', name: 'Krähenfels', x: 320, z: 260, r: 34, hill: 0.25, kind: 'camp', palms: 3, rocks: 3, level: 1, info: 'Ein Lager von Halsabschneidern hat sich hier eingenistet.' },
    { id: 'moewennest', name: 'Möwennest', x: -160, z: 420, r: 26, hill: 0.3, kind: 'quiet', palms: 4, info: 'Hunderte Möwen nisten auf den Klippen.' },
    { id: 'leuchtfeuer', name: 'Leuchtfeuer', x: 180, z: -160, r: 24, hill: 0.15, kind: 'lighthouse', palms: 2, info: 'Der alte Leuchtturm weist Schiffen den Weg nach Ankerglück.' },
    { id: 'rabenriff', name: 'Rabenriff', x: -480, z: -220, r: 38, hill: 0.22, kind: 'camp', palms: 4, rocks: 2, level: 2, info: 'Schwer bewachtes Lager am Riff.' },
    { id: 'bernsteinbucht', name: 'Bernsteinbucht', x: 520, z: -40, r: 44, hill: 0.18, kind: 'camp', palms: 6, level: 3, info: 'Ein Hauptmann hält die Bucht besetzt.' },
    { id: 'sonnenstrand', name: 'Sonnenstrand', x: 60, z: 560, r: 32, hill: 0.12, kind: 'quiet', palms: 8, info: 'Der schönste Strand der Bernsteinsee. Schildkröten legen hier ihre Eier.' },
    { id: 'sturmzahn', name: 'Sturmzahn', x: -620, z: 380, r: 46, hill: 0.28, kind: 'boss', palms: 3, rocks: 4, level: 5, info: 'Hier herrscht eine Legende der Bernsteinsee.' },
  ],
};

export const REGIONS: RegionDef[] = [BERNSTEINSEE];

/** Namen für entferntere Inseln außerhalb der Bernsteinsee (bis die Regionen gebaut sind) */
export const OUTER_NAMES = ['Nebelkap', 'Salzhorn', 'Kupferstrand', 'Seufzerinsel', 'Teerklippe', 'Dornensand', 'Walknochen', 'Kielbruch', 'Donnerbucht', 'Grauwacht', 'Perlenriff', 'Glutberg', 'Eulenstein', 'Mondsichel'];

// ---------- Ausrüstung (aus 1.0) ----------

export interface WeaponDef { n: string; dmg: number; price: number; rank: number; col: string; glow?: boolean }
export const WEAPONS: WeaponDef[] = [
  { n: 'Rostiger Säbel', dmg: 0, price: 0, rank: 0, col: '#8C8C8C' },
  { n: 'Stahlklinge', dmg: 6, price: 220, rank: 0, col: '#C9D2DA' },
  { n: 'Damastklinge', dmg: 14, price: 750, rank: 2, col: '#9FB4C8' },
  { n: 'Sturmklinge', dmg: 25, price: 1900, rank: 4, col: '#7FD6FF', glow: true },
  { n: 'Gezeitenklinge', dmg: 40, price: 4800, rank: 6, col: '#FFD166', glow: true },
  { n: 'Himmelsschneide', dmg: 60, price: 11000, rank: 8, col: '#FF8AD8', glow: true },
];

export interface ArmorDef { n: string; hp: number; price: number; rank: number }
export const ARMOR: ArmorDef[] = [
  { n: 'Leinenhemd', hp: 0, price: 0, rank: 0 },
  { n: 'Lederweste', hp: 40, price: 200, rank: 0 },
  { n: 'Kettenhemd', hp: 95, price: 700, rank: 2 },
  { n: 'Gezeitenpanzer', hp: 170, price: 2300, rank: 5 },
  { n: 'Faji-Harnisch', hp: 280, price: 6500, rank: 7 },
];

export const POTION = { n: 'Proviant', price: 25, heal: 0.4, max: 10 };
/** Faji-Punkt im Schrein: Preis steigt mit jedem Kauf */
export const SHRINE_PRICE = (bought: number) => 300 + bought * 250;
/** Übernachten in der Taverne */
export const REST_PRICE = 20;
