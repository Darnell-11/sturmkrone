// Eigene Musikstücke als Notendaten (MIDI-Nummern, 0 = Pause).
// Der Bernsteinsee-Shanty stammt aus Sturmkrone 1.0 und bekommt eine Gegenstimme.

export type SongId = 'menu' | 'sea' | 'harbor' | 'night' | 'battle' | 'boss' | 'victory' | 'north' | 'ember' | 'storm' | 'abyss';

export interface Bar {
  mel: number[];
  /** Gegenstimme (Flöte) in jeder zweiten Wiederholung */
  alt?: (number | 0)[];
  bass: [number, number];
  chord?: number[];
}

export interface Song {
  id: SongId;
  /** Sekunden pro Schritt (Achtelnote) */
  tempo: number;
  /** Schritte pro Takt: 6 = 6/8-Shanty, 8 = 4/4 */
  steps: 6 | 8;
  lead: 'squeeze' | 'flute' | 'brass';
  transpose?: number;
  bars: Bar[];
}

const D = [62, 66, 69], G = [55, 59, 62], A = [57, 61, 64], Bm = [59, 62, 66], Em = [52, 55, 59], C = [60, 64, 67], F = [53, 57, 60], Dm = [62, 65, 69], E = [52, 56, 59], Am = [57, 60, 64];

const SEA: Bar[] = [
  { mel: [69, 0, 69, 74, 0, 72], alt: [77, 0, 0, 76, 0, 0], bass: [50, 57], chord: Dm },
  { mel: [67, 0, 64, 67, 0, 72], alt: [74, 0, 0, 72, 0, 0], bass: [48, 55], chord: C },
  { mel: [69, 0, 74, 72, 0, 69], alt: [77, 0, 0, 79, 0, 0], bass: [50, 57], chord: Dm },
  { mel: [64, 0, 67, 65, 0, 64], alt: [72, 0, 0, 69, 0, 0], bass: [45, 52], chord: A },
  { mel: [74, 0, 72, 69, 0, 67], alt: [81, 0, 0, 79, 0, 0], bass: [50, 57], chord: Dm },
  { mel: [65, 0, 67, 69, 0, 72], alt: [74, 0, 0, 76, 0, 0], bass: [53, 60], chord: F },
  { mel: [74, 0, 76, 74, 0, 72], alt: [79, 0, 0, 78, 0, 0], bass: [48, 55], chord: C },
  { mel: [69, 0, 67, 64, 0, 62], alt: [74, 0, 0, 0, 0, 0], bass: [45, 50], chord: A },
];

export const SONGS: Record<SongId, Song> = {
  menu: { id: 'menu', tempo: 0.24, steps: 6, lead: 'squeeze', bars: SEA },
  sea: { id: 'sea', tempo: 0.19, steps: 6, lead: 'squeeze', bars: SEA },
  harbor: {
    id: 'harbor', tempo: 0.16, steps: 6, lead: 'squeeze',
    bars: [
      { mel: [67, 71, 74, 72, 71, 69], bass: [43, 50], chord: G },
      { mel: [72, 76, 74, 72, 71, 69], bass: [48, 55], chord: C },
      { mel: [71, 74, 79, 78, 76, 74], alt: [83, 0, 0, 81, 0, 0], bass: [43, 50], chord: G },
      { mel: [74, 72, 71, 69, 67, 66], bass: [50, 57], chord: D },
      { mel: [67, 71, 74, 79, 78, 79], alt: [83, 0, 0, 86, 0, 0], bass: [43, 50], chord: G },
      { mel: [76, 74, 72, 71, 72, 74], bass: [48, 55], chord: C },
      { mel: [74, 0, 71, 69, 0, 66], bass: [50, 57], chord: D },
      { mel: [67, 0, 0, 67, 0, 0], bass: [43, 50], chord: G },
    ],
  },
  night: {
    id: 'night', tempo: 0.27, steps: 6, lead: 'flute',
    bars: [
      { mel: [64, 0, 67, 71, 0, 69], bass: [40, 47], chord: Em },
      { mel: [67, 0, 66, 64, 0, 0], bass: [48, 55], chord: C },
      { mel: [62, 0, 66, 69, 0, 67], bass: [50, 57], chord: D },
      { mel: [66, 0, 64, 62, 0, 0], bass: [47, 54], chord: Bm },
      { mel: [64, 0, 67, 72, 0, 71], bass: [40, 47], chord: Em },
      { mel: [69, 0, 67, 66, 0, 64], bass: [45, 52], chord: Am },
      { mel: [66, 0, 67, 69, 0, 71], bass: [47, 54], chord: Bm },
      { mel: [64, 0, 0, 0, 0, 0], bass: [40, 47], chord: Em },
    ],
  },
  battle: {
    id: 'battle', tempo: 0.135, steps: 8, lead: 'squeeze',
    bars: [
      { mel: [69, 0, 72, 69, 76, 0, 74, 72], bass: [45, 52], chord: Am },
      { mel: [72, 0, 69, 72, 77, 76, 74, 72], bass: [41, 48], chord: F },
      { mel: [71, 0, 67, 71, 74, 0, 72, 71], bass: [43, 50], chord: G },
      { mel: [68, 71, 76, 0, 74, 72, 71, 68], bass: [40, 47], chord: E },
      { mel: [69, 72, 76, 81, 79, 76, 74, 72], bass: [45, 52], chord: Am },
      { mel: [77, 0, 76, 74, 72, 74, 76, 77], bass: [41, 48], chord: F },
      { mel: [74, 0, 77, 74, 72, 71, 69, 71], bass: [38, 45], chord: Dm },
      { mel: [76, 0, 0, 74, 72, 71, 68, 64], bass: [40, 47], chord: E },
    ],
  },
  boss: {
    id: 'boss', tempo: 0.15, steps: 8, lead: 'brass', transpose: -3,
    bars: [
      { mel: [69, 0, 0, 72, 0, 0, 71, 0], bass: [45, 52], chord: Am },
      { mel: [69, 0, 0, 68, 0, 0, 0, 0], bass: [40, 47], chord: E },
      { mel: [69, 0, 0, 72, 0, 0, 76, 0], bass: [45, 52], chord: Am },
      { mel: [77, 0, 0, 76, 0, 74, 0, 0], bass: [41, 48], chord: F },
      { mel: [74, 0, 0, 77, 0, 0, 76, 0], bass: [38, 45], chord: Dm },
      { mel: [72, 0, 0, 71, 0, 0, 69, 0], bass: [45, 52], chord: Am },
      { mel: [71, 0, 72, 74, 0, 76, 0, 77], bass: [40, 47], chord: E },
      { mel: [76, 0, 0, 0, 68, 0, 0, 0], bass: [40, 47], chord: E },
    ],
  },
  // Nordwacht: getragener Seemannschor in d-Moll
  north: {
    id: 'north', tempo: 0.23, steps: 6, lead: 'squeeze', transpose: -2,
    bars: [
      { mel: [62, 0, 65, 69, 0, 67], alt: [74, 0, 0, 72, 0, 0], bass: [38, 45], chord: Dm },
      { mel: [65, 0, 64, 62, 0, 0], alt: [72, 0, 0, 69, 0, 0], bass: [46, 53], chord: [58, 62, 65] },
      { mel: [60, 0, 64, 67, 0, 65], bass: [48, 55], chord: C },
      { mel: [64, 0, 62, 60, 0, 0], bass: [45, 52], chord: Am },
      { mel: [62, 0, 65, 70, 0, 69], alt: [77, 0, 0, 76, 0, 0], bass: [46, 53], chord: [58, 62, 65] },
      { mel: [67, 0, 65, 64, 0, 62], bass: [48, 55], chord: C },
      { mel: [64, 0, 65, 67, 0, 69], bass: [45, 52], chord: A },
      { mel: [62, 0, 0, 0, 0, 0], bass: [38, 45], chord: Dm },
    ],
  },
  // Glutring: treibender Tanz in e-Phrygisch
  ember: {
    id: 'ember', tempo: 0.15, steps: 6, lead: 'squeeze',
    bars: [
      { mel: [64, 65, 64, 0, 67, 65], bass: [40, 47], chord: Em },
      { mel: [64, 0, 62, 60, 62, 64], bass: [41, 48], chord: F },
      { mel: [67, 69, 67, 0, 71, 69], bass: [43, 50], chord: [55, 59, 62] },
      { mel: [67, 65, 64, 65, 64, 0], bass: [40, 47], chord: Em },
      { mel: [71, 72, 71, 0, 69, 67], alt: [76, 0, 0, 77, 0, 0], bass: [45, 52], chord: Am },
      { mel: [69, 0, 67, 65, 67, 69], bass: [41, 48], chord: F },
      { mel: [67, 65, 64, 62, 60, 62], bass: [38, 45], chord: Dm },
      { mel: [64, 0, 0, 64, 0, 0], bass: [40, 47], chord: Em },
    ],
  },
  // Sturmgürtel: wild und schnell
  storm: {
    id: 'storm', tempo: 0.14, steps: 8, lead: 'squeeze', transpose: 2,
    bars: [
      { mel: [69, 72, 76, 72, 69, 72, 76, 79], bass: [45, 52], chord: Am },
      { mel: [77, 76, 74, 72, 74, 72, 71, 69], bass: [41, 48], chord: F },
      { mel: [67, 71, 74, 71, 67, 71, 74, 77], bass: [43, 50], chord: G },
      { mel: [76, 74, 72, 71, 72, 71, 69, 68], bass: [40, 47], chord: E },
    ],
  },
  // Schlundriff: tief, weit, geheimnisvoll
  abyss: {
    id: 'abyss', tempo: 0.3, steps: 6, lead: 'flute', transpose: -5,
    bars: [
      { mel: [69, 0, 0, 72, 0, 71], bass: [45, 52], chord: Am },
      { mel: [69, 0, 0, 0, 0, 0], bass: [41, 48], chord: F },
      { mel: [67, 0, 0, 71, 0, 72], bass: [43, 50], chord: G },
      { mel: [76, 0, 0, 75, 0, 0], bass: [40, 47], chord: E },
    ],
  },
  victory: {
    id: 'victory', tempo: 0.16, steps: 6, lead: 'squeeze',
    bars: [
      { mel: [74, 0, 78, 81, 0, 78], bass: [50, 57], chord: D },
      { mel: [79, 0, 76, 74, 0, 0], bass: [43, 50], chord: G },
      { mel: [73, 0, 76, 79, 0, 76], bass: [45, 52], chord: A },
      { mel: [74, 0, 0, 0, 0, 0], bass: [50, 57], chord: D },
    ],
  },
};
