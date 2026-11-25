// Sechs Mega-Inseln der offenen Welt (4.3.6): je eine riesige, mehrteilige Hauptinsel in den fünf Kuchenstücken der Mächte (Ring 2 – 3) und ein neutrales
// Kaiser-Atoll im Sturmgürtel (Ring 3). Reine Daten und Regeln ohne three.js (JSON-tauglich): Lage, Küste, Hügel, Bauplätze aus Bausteinen, Wege,
// Spalten (Kanäle, Lavaspalten, Klüfte, Meeresarme) mit Brücken, Kampf-Bezirke mit Elite-Trupps, ein umherziehender Insel-Kommandant, die Beute
// und die vorgelagerten Schären, Leuchtturm-Felsen und Riff-Passagen. data/regions.ts trägt Inseln und Schären in die Meere ein, data/settlements.ts
// die Siedlungen (`MEGA_SITES`); gebaut werden sie wie alle Siedlungs-Inseln (world/settlement.ts, Spalten in world/megaRifts.ts).
import type { IslandDef, IslandKind } from './regions';
import type { PowerId } from './factions';
import type { EnemyKind } from './combat';
import type { GoodId } from './economy';
import type { ClusterDef, RiftDef, SiteDef, StructureDef, StructureType } from './settlements';
import { HOME, S, scatterOf, themeItems, type SiteBiome, type Theme } from './openWorld';
import { dangerOfDistance, type DangerTier } from './balanceConfig';

/** Die fünf Kaiser-Inseln in Ring 5 (Phase 4.5D, data/kaiserIslands.ts): sie benutzen dieselben Daten wie die Mega-Inseln (Küste, Bauplätze, Spalten, Bezirke) */
export type KaiserId = 'britannia' | 'batavia' | 'kaiserdom' | 'solis' | 'tenkoku';
export type MegaId = 'kronenklippe' | 'goudenstad' | 'drachenamboss' | 'chateausoleil' | 'kuroganeschlund' | 'sturmkroneruinen' | KaiserId;
export const MEGA_IDS: readonly MegaId[] = ['kronenklippe', 'goudenstad', 'drachenamboss', 'chateausoleil', 'kuroganeschlund', 'sturmkroneruinen'];

/** Bausteine nur der Mega-Inseln (zusätzlich zu denen der Themen-Inseln) */
export type MegaTheme =
  | 'zitadelle' | 'exerzierplatz' | 'mole' | 'kontorviertel' | 'lagerviertel' | 'wehrmauer' | 'terrassengarten' | 'palast' | 'amphitheater'
  | 'dojo' | 'korsarenlager' | 'tempel' | 'schatzkammer' | 'statuenhain' | 'ruinenkai' | 'erzterrassen' | 'deckung';

export interface MegaPlot { theme: Theme | MegaTheme; deg?: number; d?: number; at?: [number, number]; turn?: number }

export type DistrictKind = 'garnison' | 'engpass' | 'hof' | 'arena' | 'mine' | 'lager' | 'tempel';
export interface MegaDistrictDef {
  id: string;
  name: string;
  kind: DistrictKind;
  /** Mitte in Inselkoordinaten und Umkreis (m), in dem die Elite-Trupps patrouillieren */
  at: [number, number];
  r: number;
  squad: EnemyKind[];
  /** Stufe über der Gefahrenstufe der Insel */
  lvl: number;
}
export interface MegaCommanderDef { name: string; title: string; lvl: number; guard: EnemyKind[]; route: string[] }
export interface SkerrySpec { name: string; /** Peilung von der Inselmitte (Grad) und Abstand (m) */ deg: number; dist: number; r: number; kind: 'lighthouse' | 'quiet'; info: string }

export interface MegaIslandSpec {
  id: MegaId;
  name: string;
  /** Beiname (Karte, Inselschild) */
  title: string;
  power: PowerId | null;
  deg: number;
  dist: number;
  r: number;
  kind: Extract<IslandKind, 'harbor' | 'ruin'>;
  biome: SiteBiome;
  coast: SiteDef['coast'];
  hills: SiteDef['hills'];
  grass: number;
  villagers: number;
  label: string;
  info: string;
  plots: MegaPlot[];
  /** Wege zusätzlich zu den selbst verlegten (Serpentinen, Marmorwege) */
  roads?: SiteDef['roads'];
  rifts: (Omit<RiftDef, 'cross'> & { crossAt: [number, number][] })[];
  districts: MegaDistrictDef[];
  commander: MegaCommanderDef;
  skerries: SkerrySpec[];
  /** Gefahrenstufe der Insel, wenn sie von der ihres Ortes abweicht (4.5D: die Sturmkrone-Ruinen bleiben Stufe 4, obwohl sie in Ring 3 liegen) */
  tier?: DangerTier;
  /** Was die Bezirke als Regionalware hergeben */
  goods: GoodId[];
}

export const C = (a: number, f: number, p: number) => ({ a, f, p });
/** Feine Grundwellen jeder Küste (die großen Buchten kommen je Insel dazu) */
export const fine = (p: number) => [C(0.028, 7, p), C(0.013, 13, p * 1.7 + 0.4)];

// ---------- Die sechs Inseln ----------

export const MEGA_ISLANDS: readonly MegaIslandSpec[] = [
  {
    id: 'kronenklippe', name: 'Kronenklippe', title: 'Albion-Bastion', power: 'england', deg: 3, dist: 7800, r: 400, kind: 'harbor', biome: 'kreide',
    coast: [...fine(1.1), C(0.08, 2, 4.4), C(0.05, 3, 0.6)],
    hills: [{ x: 0, z: 258, r: 112, h: 0.24 }, { x: -175, z: -95, r: 120, h: 0.2 }, { x: 170, z: -70, r: 100, h: 0.22 }, { x: 10, z: -215, r: 85, h: 0.12 }],
    grass: 0.86, villagers: 8, label: 'Albion-Bastion der Krone',
    info: 'Weiße Kreideklippen, zwei Häfen und eine Zitadelle jenseits der Kronenkluft, nur über die steinerne Bogenbrücke zu erreichen. Abtrünnige der Kronengarde halten Garnison, Brücke und Zitadellenhof.',
    plots: [
      { theme: 'hafen', deg: 150, d: 0.8 }, { theme: 'mole', deg: 212, d: 0.82 }, { theme: 'zitadelle', at: [0, 262] }, { theme: 'exerzierplatz', at: [-150, -20] },
      { theme: 'batterie', deg: 100, d: 0.85 }, { theme: 'batterie', deg: 258, d: 0.85 }, { theme: 'leuchtfeuer', deg: 24, d: 0.86 }, { theme: 'dorf', at: [135, -150] },
      { theme: 'kontorviertel', at: [-30, -250] }, { theme: 'deckung', at: [0, 100] }, { theme: 'deckung', at: [-120, -195], turn: 40 }, { theme: 'wachturm', deg: 322, d: 0.7 },
    ],
    rifts: [{ kind: 'kluft', w: 16, name: 'Kronenkluft', bridge: 'stein', pts: [[-460, 150], [-220, 138], [0, 150], [210, 140], [460, 158]], crossAt: [[0, 150]] }],
    districts: [
      { id: 'garnison', name: 'Hafen-Garnison', kind: 'garnison', at: [-125, -205], r: 46, squad: ['hauptmann', 'musketier', 'musketier', 'schildtraeger', 'schlaeger'], lvl: 0 },
      { id: 'engpass', name: 'Brücken-Engpass', kind: 'engpass', at: [0, 105], r: 34, squad: ['schildtraeger', 'schildtraeger', 'musketier', 'fajiwirker'], lvl: 1 },
      { id: 'hof', name: 'Zitadellen-Hof', kind: 'hof', at: [0, 262], r: 42, squad: ['hauptmann', 'schildtraeger', 'musketier', 'fajiwirker', 'schlaeger'], lvl: 2 },
    ],
    commander: { name: 'Kommodore Ashcombe', title: 'Abtrünniger der Kronengarde', lvl: 3, guard: ['hauptmann', 'musketier'], route: ['garnison', 'engpass', 'hof'] },
    goods: ['tuch', 'tee', 'marineausruestung'],
    skerries: [
      { name: 'Kreidenadel', deg: 30, dist: 720, r: 34, kind: 'lighthouse', info: 'Ein weißer Felszahn mit Leuchtfeuer vor der Kronenklippe.' },
      { name: 'Möwenschäre', deg: 110, dist: 760, r: 30, kind: 'quiet', info: 'Kahle Kreideschäre voller Möwen.' },
      { name: 'Kronenschäre', deg: 250, dist: 730, r: 34, kind: 'quiet', info: 'Ein flacher Kreidefelsen im Schatten der Bastion.' },
      { name: 'Seehundbank', deg: 160, dist: 900, r: 30, kind: 'quiet', info: 'Bei Ebbe liegen hier die Seehunde.' },
      ...reef('Albionriff', 300, 680, 'Riff-Passage: Felsen der Einfahrt.'),
    ],
  },
  {
    id: 'goudenstad', name: 'Gouden Stad', title: 'Handelsmetropole der Kompanie', power: 'niederlande', deg: 196, dist: 8040, r: 380, kind: 'harbor', biome: 'festland',
    coast: [...fine(2.3), C(0.06, 2, 1.2), C(0.04, 4, 3.1)],
    hills: [{ x: -165, z: -160, r: 70, h: 0.1 }, { x: 185, z: -140, r: 60, h: 0.08 }, { x: -160, z: 230, r: 60, h: 0.08 }],
    grass: 0.9, villagers: 10, label: 'Handelsmetropole der Kompanie',
    info: 'Kanäle, Zugbrücken und Backsteinspeicher: die reichste Stadt der Kompanie mit zwei befestigten Hafenmolen. Im Kontor-Viertel und an den Molen herrscht ein Schmugglersyndikat.',
    plots: [
      { theme: 'hafen', deg: 40, d: 0.82 }, { theme: 'kontor', deg: 78, d: 0.8 }, { theme: 'lagerviertel', at: [150, 175] }, { theme: 'kontorviertel', at: [-150, 160] },
      { theme: 'lagerviertel', at: [-50, 285] }, { theme: 'leuchtfeuer', deg: 330, d: 0.86 }, { theme: 'mole', deg: 160, d: 0.83 }, { theme: 'mole', deg: 202, d: 0.83 },
      { theme: 'kontorviertel', at: [125, -150] }, { theme: 'dorf', at: [-160, -110] }, { theme: 'batterie', deg: 252, d: 0.85 }, { theme: 'deckung', at: [90, 74] },
      { theme: 'deckung', at: [0, -262] },
    ],
    rifts: [
      { kind: 'kanal', w: 12, name: 'Herengracht', bridge: 'holz', pts: [[-440, 40], [-200, 30], [0, 40], [200, 50], [440, 40]], crossAt: [[-210, 31], [-60, 37], [90, 44], [235, 49]] },
      { kind: 'kanal', w: 10, name: 'Keizersgracht', bridge: 'stein', pts: [[0, 40], [10, 200], [0, 440]], crossAt: [[5, 120], [7, 300]] },
    ],
    districts: [
      { id: 'kontor', name: 'Kontor-Garnison', kind: 'garnison', at: [125, -150], r: 46, squad: ['hauptmann', 'musketier', 'schlaeger', 'schlaeger', 'schildtraeger'], lvl: 0 },
      { id: 'engpass', name: 'Grachten-Engpass', kind: 'engpass', at: [90, 72], r: 32, squad: ['schildtraeger', 'musketier', 'musketier', 'fajiwirker'], lvl: 1 },
      { id: 'mole', name: 'Molen-Bastion', kind: 'hof', at: [0, -268], r: 42, squad: ['hauptmann', 'schildtraeger', 'schildtraeger', 'musketier', 'fajiwirker'], lvl: 2 },
    ],
    commander: { name: 'Syndikus Van der Roek', title: 'Herr des Schwarzen Kontors', lvl: 3, guard: ['hauptmann', 'schlaeger'], route: ['kontor', 'engpass', 'mole'] },
    goods: ['gewuerze', 'stoffe', 'luxusgueter'],
    skerries: [
      { name: 'Lichtboje Oranje', deg: 20, dist: 720, r: 34, kind: 'lighthouse', info: 'Leuchtfeuer der Kompanie an der Einfahrt nach Gouden Stad.' },
      { name: 'Grachtenschäre', deg: 82, dist: 740, r: 30, kind: 'quiet', info: 'Eine Sandschäre, auf der die Lotsen warten.' },
      { name: 'Tulpeninsel', deg: 290, dist: 760, r: 32, kind: 'quiet', info: 'Ein Garteneiland der reichen Kaufleute.' },
      { name: 'Kaapse Klip', deg: 140, dist: 800, r: 30, kind: 'quiet', info: 'Nackter Fels, den die Kompanie als Seezeichen bemalt.' },
      ...reef('Zandrif', 112, 690, 'Riff-Passage der Sandbänke.'),
    ],
  },
  {
    id: 'drachenamboss', name: 'Drachenamboss', title: 'Hanse-Bergfestung', power: 'deutschland', deg: 66, dist: 7680, r: 360, kind: 'harbor', biome: 'klippe',
    coast: [...fine(0.4), C(0.1, 3, 2.2), C(0.05, 5, 5.1)],
    hills: [{ x: 0, z: 10, r: 180, h: 0.3 }, { x: -140, z: 115, r: 80, h: 0.24 }, { x: 135, z: -120, r: 78, h: 0.2 }],
    grass: 0.5, villagers: 7, label: 'Hanse-Bergfestung',
    info: 'Ein schwarzes Felsmassiv voller Erzstollen. Serpentinen führen durch zwei Wehrmauern hinauf zur Gipfelfestung. Aufständische Bergknappen halten Minen, Tor und Gipfel.',
    plots: [
      { theme: 'hafen', deg: 240, d: 0.82 }, { theme: 'werft', deg: 282, d: 0.8 }, { theme: 'giesserei', at: [-160, -150], turn: 30 }, { theme: 'erzterrassen', at: [-80, 110] },
      { theme: 'erzterrassen', at: [95, -20], turn: 60 }, { theme: 'festung', at: [0, 10] }, { theme: 'wehrmauer', at: [-120, -70], turn: 20 }, { theme: 'wehrmauer', at: [-40, -110], turn: -30 },
      { theme: 'dorf', at: [-215, 55] }, { theme: 'batterie', deg: 200, d: 0.85 }, { theme: 'wachturm', deg: 60, d: 0.78 }, { theme: 'leuchtfeuer', deg: 128, d: 0.86 },
      { theme: 'deckung', at: [-125, -100] },
    ],
    roads: [
      // Serpentinen vom Hafen durch beide Wehrmauern zur Gipfelfestung
      { w: 3.4, surface: 'stein', pts: [[-235, -145], [-185, -95], [-120, -70], [-150, -30], [-80, -50], [-40, -110], [-20, -60], [-60, -20], [-20, -10], [0, 10]] },
    ],
    rifts: [{ kind: 'kluft', w: 12, name: 'Drachenschlucht', bridge: 'stein', pts: [[165, 440], [152, 220], [96, 110]], crossAt: [[140, 197]] }],
    districts: [
      { id: 'minen', name: 'Erzminen-Terrassen', kind: 'mine', at: [-80, 110], r: 42, squad: ['schlaeger', 'schlaeger', 'musketier', 'schildtraeger', 'hauptmann'], lvl: 0 },
      { id: 'tor', name: 'Serpentinen-Tor', kind: 'engpass', at: [-120, -85], r: 34, squad: ['schildtraeger', 'schildtraeger', 'musketier', 'musketier'], lvl: 1 },
      { id: 'gipfel', name: 'Gipfelfestung', kind: 'hof', at: [0, 10], r: 42, squad: ['hauptmann', 'fajiwirker', 'musketier', 'schildtraeger', 'schlaeger'], lvl: 2 },
    ],
    commander: { name: 'Bergvogt Eisenhart', title: 'Herr des Drachenambosses', lvl: 3, guard: ['hauptmann', 'schildtraeger'], route: ['minen', 'tor', 'gipfel'] },
    goods: ['kanonenstahl', 'werkzeuge', 'schmiedekohle'],
    skerries: [
      { name: 'Ambossnadel', deg: 350, dist: 690, r: 34, kind: 'lighthouse', info: 'Ein schwarzer Felsturm mit dem Leuchtfeuer der Hanse.' },
      { name: 'Schlackeschäre', deg: 25, dist: 720, r: 30, kind: 'quiet', info: 'Hierher kippen die Gießer ihre Schlacke.' },
      { name: 'Erzklippe', deg: 120, dist: 700, r: 34, kind: 'quiet', info: 'Ein Felsen mit rostroten Erzadern.' },
      { name: 'Rabenschäre', deg: 190, dist: 760, r: 30, kind: 'quiet', info: 'Kahler Granit, auf dem die Raben sitzen.' },
      ...reef('Kohlenriff', 300, 650, 'Riff-Passage aus schwarzen Felsen.'),
    ],
  },
  {
    id: 'chateausoleil', name: 'Château Soleil', title: 'Sonnenpalast-Insel', power: 'frankreich', deg: 292, dist: 7440, r: 370, kind: 'harbor', biome: 'weinland',
    coast: [...fine(3.3), C(0.07, 2, 0.2), C(0.04, 3, 2.6)],
    hills: [{ x: 0, z: 35, r: 120, h: 0.15 }, { x: -150, z: 150, r: 80, h: 0.12 }, { x: 140, z: -150, r: 70, h: 0.1 }],
    grass: 0.9, villagers: 9, label: 'Sonnenpalast der Armada Royale',
    info: 'Terrassengärten, Marmorwege und ein Palast auf dem Sonnenhügel, dazu eine Arena und eine doppelte Küstenbastion. Die Duellanten-Liga des Klingenprinzen hält Arena, Gärten und Palasthof.',
    plots: [
      { theme: 'hafen', deg: 120, d: 0.82 }, { theme: 'kontor', deg: 150, d: 0.8 }, { theme: 'palast', at: [0, 40] }, { theme: 'terrassengarten', at: [-105, 145] },
      { theme: 'terrassengarten', at: [115, 125], turn: 20 }, { theme: 'amphitheater', at: [-160, -110] }, { theme: 'batterie', deg: 300, d: 0.85 }, { theme: 'batterie', deg: 322, d: 0.85 },
      { theme: 'weinberg', at: [105, -170] }, { theme: 'dorf', at: [-35, -225] }, { theme: 'leuchtfeuer', deg: 22, d: 0.86 }, { theme: 'deckung', at: [-60, 120], turn: 30 },
    ],
    roads: [
      { w: 4.2, surface: 'marmor', pts: [[255, -120], [170, -70], [90, -20], [30, 10], [0, 40]] },
      { w: 3.6, surface: 'marmor', pts: [[0, 40], [-50, 95], [-105, 145]] },
      { w: 3.6, surface: 'marmor', pts: [[0, 40], [60, 90], [115, 125]] },
    ],
    rifts: [{ kind: 'kanal', w: 10, name: 'Grand Canal', bridge: 'marmor', pts: [[420, -20], [250, -14], [150, -6], [95, 0]], crossAt: [[225, -13]] }],
    districts: [
      { id: 'arena', name: 'Arena der Duellanten', kind: 'arena', at: [-160, -110], r: 40, squad: ['hauptmann', 'schlaeger', 'schlaeger', 'fajiwirker', 'musketier'], lvl: 0 },
      { id: 'garten', name: 'Garten-Terrassen', kind: 'engpass', at: [-100, 140], r: 40, squad: ['musketier', 'musketier', 'schildtraeger', 'fajiwirker'], lvl: 1 },
      { id: 'palast', name: 'Palast-Hof', kind: 'hof', at: [0, 40], r: 42, squad: ['hauptmann', 'schildtraeger', 'schlaeger', 'musketier', 'fajiwirker'], lvl: 2 },
    ],
    commander: { name: 'Duc de Valcourt', title: 'Klingenprinz von Soleil', lvl: 3, guard: ['hauptmann', 'schlaeger'], route: ['arena', 'garten', 'palast'] },
    goods: ['wein', 'seide', 'fechtklingen'],
    skerries: [
      { name: 'Phare Doré', deg: 88, dist: 700, r: 34, kind: 'lighthouse', info: 'Das vergoldete Leuchtfeuer der Armada Royale.' },
      { name: 'Lavendelschäre', deg: 30, dist: 720, r: 30, kind: 'quiet', info: 'Lavendel wächst bis an den Rand dieser kleinen Schäre.' },
      { name: 'Muschelklippe', deg: 165, dist: 760, r: 30, kind: 'quiet', info: 'Perlmuschelbänke unter weißem Fels.' },
      { name: 'Rosenfels', deg: 250, dist: 720, r: 32, kind: 'quiet', info: 'Ein rötlicher Felsen mit wilden Rosen.' },
      ...reef('Perlenriff', 200, 660, 'Riff-Passage über Perlenbänken.'),
    ],
  },
  {
    id: 'kuroganeschlund', name: 'Kurogane-Schlund', title: 'Vulkan-Festung', power: 'kurogane', deg: 142, dist: 7320, r: 420, kind: 'harbor', biome: 'glut',
    coast: [...fine(4.4), C(0.09, 3, 1.7), C(0.05, 5, 0.3)],
    // der Kraterrand der Caldera: sieben Hügel im Kreis, dazwischen Pässe; im Becken die Lavaspalten
    hills: [0, 52, 104, 158, 212, 264, 314].map((b) => ({ x: Math.round(Math.sin((b * Math.PI) / 180) * 205), z: Math.round(Math.cos((b * Math.PI) / 180) * 205), r: 82, h: 0.3 })),
    grass: 0.32, villagers: 6, label: 'Vulkan-Festung der Kurogane',
    info: 'Ein zerklüfteter Krater: glühende Lavaspalten, über die nur Obsidianbrücken führen, Dojo-Höfe im Becken und ein Korsarenlager am Strand. Kaigun-Taishō Akagane zieht mit seiner Leibwache durch den Schlund.',
    plots: [
      { theme: 'hafen', deg: 322, d: 0.82 }, { theme: 'werft', deg: 285, d: 0.8 }, { theme: 'korsarenlager', deg: 140, d: 0.76 }, { theme: 'dojo', at: [-90, 62] },
      { theme: 'dojo', at: [92, -62], turn: 180 }, { theme: 'wachturm', deg: 30, d: 0.8 }, { theme: 'batterie', deg: 350, d: 0.85 }, { theme: 'leuchtfeuer', deg: 200, d: 0.86 },
      { theme: 'dorf', at: [-235, 230] }, { theme: 'mine', at: [250, -170], turn: 120 }, { theme: 'deckung', at: [100, 52] },
    ],
    rifts: [
      { kind: 'lava', w: 10, name: 'Glutspalte', bridge: 'obsidian', pts: [[-160, -42], [-50, -12], [50, 20], [160, 62]], crossAt: [[-95, -24], [95, 37]] },
      { kind: 'lava', w: 8, name: 'Ascheader', bridge: 'obsidian', pts: [[-32, -165], [0, -60], [10, 40], [42, 155]], crossAt: [[-14, -105], [26, 98]] },
    ],
    districts: [
      { id: 'lager', name: 'Korsaren-Lager', kind: 'lager', at: polarPt(140, 318), r: 42, squad: ['hauptmann', 'schlaeger', 'schlaeger', 'musketier', 'matrose'], lvl: 0 },
      { id: 'bruecken', name: 'Obsidian-Brücken', kind: 'engpass', at: [95, 50], r: 30, squad: ['schildtraeger', 'fajiwirker', 'musketier', 'musketier'], lvl: 1 },
      { id: 'dojo', name: 'Dojo-Hof', kind: 'hof', at: [-90, 62], r: 38, squad: ['hauptmann', 'fajiwirker', 'schlaeger', 'schildtraeger', 'schlaeger'], lvl: 2 },
    ],
    commander: { name: 'Kaigun-Taishō Akagane', title: 'Herr des Schlunds', lvl: 3, guard: ['hauptmann', 'fajiwirker'], route: ['lager', 'bruecken', 'dojo'] },
    goods: ['schwefel', 'obsidian', 'medizin'],
    skerries: [
      { name: 'Glutnadel', deg: 330, dist: 760, r: 34, kind: 'lighthouse', info: 'Ein Feuerturm auf schwarzem Basalt.' },
      { name: 'Aschenschäre', deg: 40, dist: 770, r: 30, kind: 'quiet', info: 'Graue Asche bedeckt diese Schäre knöcheltief.' },
      { name: 'Schwefelklippe', deg: 100, dist: 740, r: 32, kind: 'quiet', info: 'Gelber Dampf steigt aus den Spalten.' },
      { name: 'Obsidianzahn', deg: 250, dist: 780, r: 30, kind: 'quiet', info: 'Ein Zahn aus schwarzem Glas.' },
      ...reef('Drachenriff', 180, 720, 'Riff-Passage über heißen Quellen.'),
    ],
  },
  {
    id: 'sturmkroneruinen', name: 'Sturmkrone-Ruinen', title: 'Das Verlorene Kaiser-Atoll', power: null, deg: 96, dist: 9960, r: 440, kind: 'ruin', biome: 'klippe', tier: 4,
    coast: [...fine(5.5), C(0.06, 4, 2.9), C(0.04, 2, 0.9)],
    hills: [{ x: 0, z: 0, r: 105, h: 0.18 }, { x: 250, z: 250, r: 90, h: 0.2 }, { x: -250, z: 250, r: 90, h: 0.22 }, { x: -255, z: -240, r: 90, h: 0.2 }, { x: 250, z: -250, r: 90, h: 0.18 }],
    grass: 0.55, villagers: 0, label: 'Versunkenes Tempel-Archipel',
    info: 'Das Herz eines versunkenen Kaiserreichs: Felsinseln, durch Meeresarme getrennt und nur über uralte Brücken verbunden, mit Statuen, Tempeln und einer Schatzkammer. Steinerne Elite-Wächter hüten jeden Stein.',
    plots: [
      { theme: 'ruinenkai', deg: 240, d: 0.84 }, { theme: 'ruinenkai', deg: 300, d: 0.84 }, { theme: 'tempel', at: [0, 0] }, { theme: 'schatzkammer', at: [-250, -232] },
      { theme: 'statuenhain', at: [250, 250] }, { theme: 'statuenhain', at: [-250, 250] }, { theme: 'ruinen', at: [252, -250] }, { theme: 'leuchtfeuer', deg: 20, d: 0.86 },
      { theme: 'deckung', at: polarPt(232, 228), turn: 225 },
    ],
    rifts: [
      // Kaiserring um den Tempelberg und vier Meeresarme bis an die Küste: fünf Felsinseln, verbunden durch uralte Brücken
      { kind: 'sund', w: 16, name: 'Kaiserring', bridge: 'ruine', pts: ringPts(165, 24), crossAt: [polarPt(45, 165), polarPt(135, 165), polarPt(225, 165), polarPt(315, 165)] },
      ...[0, 90, 180, 270].map((b) => ({ kind: 'sund' as const, w: 14, name: 'Meeresarm', bridge: 'ruine', pts: [polarPt(b, 165), polarPt(b, 320), polarPt(b, 520)], crossAt: [polarPt(b, 300)] })),
    ],
    districts: [
      { id: 'tempel', name: 'Tempel-Arena', kind: 'tempel', at: [0, 0], r: 46, squad: ['hauptmann', 'fajiwirker', 'fajiwirker', 'schildtraeger', 'schlaeger'], lvl: 1 },
      { id: 'bruecke', name: 'Brücken-Engpass', kind: 'engpass', at: polarPt(225, 208), r: 30, squad: ['schildtraeger', 'schildtraeger', 'fajiwirker', 'musketier'], lvl: 0 },
      { id: 'schatz', name: 'Schatzkammer-Wacht', kind: 'hof', at: [-250, -232], r: 38, squad: ['hauptmann', 'fajiwirker', 'schildtraeger', 'schlaeger', 'musketier'], lvl: 2 },
    ],
    commander: { name: 'Der Steinerne Kaiserwächter', title: 'Hüter der Sturmkrone', lvl: 3, guard: ['fajiwirker', 'hauptmann'], route: ['bruecke', 'tempel', 'schatz'] },
    goods: ['luxusgueter', 'obsidian', 'seide'],
    skerries: [
      { name: 'Kronenfeuer', deg: 30, dist: 780, r: 34, kind: 'lighthouse', info: 'Ein uralter Feuerturm aus Kaiserstein, wieder entzündet.' },
      { name: 'Wächterfels', deg: 150, dist: 790, r: 32, kind: 'quiet', info: 'Eine umgestürzte Wächterstatue ragt aus dem Fels.' },
      { name: 'Säulenschäre', deg: 210, dist: 760, r: 30, kind: 'quiet', info: 'Drei Säulen stehen noch im Meer.' },
      { name: 'Kaiserzahn', deg: 300, dist: 780, r: 34, kind: 'quiet', info: 'Ein Fels in Form einer Krone.' },
      ...reef('Sturmriff', 272, 750, 'Riff-Passage zum Kaiserkai.'),
    ],
  },
];

/** Riff-Passage: drei Felsen in einer Reihe, schräg nach außen (genug Fahrwasser zwischen ihnen; nie kleiner als 30 m Radius, darunter hält die Schiffskollision nicht) */
function reef(name: string, deg: number, dist: number, info: string): SkerrySpec[] {
  return [0, 1, 2].map((k) => ({ name: `${name} ${['I', 'II', 'III'][k]}`, deg: deg + k * 11, dist: dist + k * 120, r: 30, kind: 'quiet' as const, info }));
}

export function polarPt(deg: number, d: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [Math.round(Math.sin(a) * d), Math.round(Math.cos(a) * d)];
}
export function ringPts(r: number, n: number): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => polarPt((i / n) * 360, r));
}

export const MEGA_BY_ID: Record<MegaId, MegaIslandSpec> = Object.fromEntries(MEGA_ISLANDS.map((m) => [m.id, m])) as Record<MegaId, MegaIslandSpec>;
/** Weitere Inseln nach dem Muster der Mega-Inseln eintragen (die Kaiser-Inseln, data/kaiserIslands.ts, beim Laden ihres Moduls) */
export function registerMegaSpec(m: MegaIslandSpec): void { MEGA_BY_ID[m.id] = m; }
export const isMegaId = (id: string): id is MegaId => id in MEGA_BY_ID;

// ---------- Bausteine der Mega-Inseln ----------

/** Mauerzug aus Zinnenmauer-Modulen (je 6 m) von (x0, z0) nach (x1, z1); Lücken um die Punkte in `gaps` (halbe Breite 5 m) */
export function wallLine(x0: number, z0: number, x1: number, z1: number, gaps: [number, number][] = []): StructureDef[] {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 6.1));
  const yaw = (Math.atan2(x1 - x0, z1 - z0) * 180) / Math.PI - 90;
  const out: StructureDef[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (gaps.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 5)) continue;
    out.push(S('zinnenmauer', x, z, yaw));
  }
  return out;
}

/** Zaun- oder Mauergeviert mit Tor an der Vorderseite */
function pen(t: 'zaun' | 'mauer', cx: number, cz: number, w: number, d: number): StructureDef[] {
  const g = 3;
  return [
    S(t, cx, cz - d / 2, 0, w), S(t, cx - w / 2, cz, 90, d), S(t, cx + w / 2, cz, 90, d),
    S(t, cx - (w / 4 + g / 4), cz + d / 2, 0, w / 2 - g / 2), S(t, cx + (w / 4 + g / 4), cz + d / 2, 0, w / 2 - g / 2),
  ];
}

export const V = (t: StructureType, x: number, z: number, yaw: number, v: string): StructureDef => ({ t, x, z, yaw, v });

/** Bauten eines Mega-Bausteins (+z = vorn) und der Freiraum, den er braucht */
export function megaItems(theme: Theme | MegaTheme, b: SiteBiome): { items: StructureDef[]; clear: number } {
  const H = HOME[b];
  switch (theme) {
    case 'zitadelle': return { clear: 42, items: [
      ...wallLine(-21, -18, 21, -18), ...wallLine(-21, -18, -21, 18), ...wallLine(21, -18, 21, 18), ...wallLine(-21, 18, -8, 18), ...wallLine(8, 18, 21, 18),
      S('torhaus', 0, 18, 0), S('zinnenturm', -22, -19), S('zinnenturm', 22, -19), S('zinnenturm', -22, 19), S('zinnenturm', 22, 19),
      S('bergfried', 0, -5), S('kapelle', -12, 2, 90), S('brunnen', 9, 6), S('kisten', 12, -8, 10), S('faesser', -8, 10, 0),
      V('fahne', -5, 11, 0, 'krone'), V('fahne', 5, 11, 0, 'krone'), S('laterne', -3, 13, 0), S('laterne', 3, 13, 0),
    ] };
    case 'exerzierplatz': return { clear: 30, items: [
      ...pen('zaun', 0, -4, 32, 24), V('fahne', 0, -14, 0, 'krone'), V('fahne', -12, -14, 0, 'krone'), V('fahne', 12, -14, 0, 'krone'),
      S('heu', -9, -6), S('heu', -3, -6), S('heu', 3, -6), S('heu', 9, -6), S('kisten', -13, 5, 10), S('faesser', 13, 5, 0), S('holzhuette', -18, -24, 20), S('holzhuette', 18, -24, -20),
      S('laterne', -4, 9, 0), S('laterne', 4, 9, 0),
    ] };
    case 'mole': return { clear: 34, items: [
      S('steg', -6, 0, 0, 40), S('steg', 11, 0, 0, 30), ...wallLine(-34, -9, -12, -9), ...wallLine(17, -9, 34, -9), S('zinnenturm', -37, -9), S('zinnenturm', 37, -9),
      S('kran', 2, 3, 0), S('lagerhaus', 0, -22, 0), S('kisten', -16, -2, 10), S('faesser', 22, -2, 0), S('laterne', -3, 6, 0), S('laterne', 8, 6, 0), S('laterne', 16, -14, 0),
    ] };
    case 'kontorviertel': return { clear: 38, items: [
      S('lagerhaus', -18, -6, 0), S('lagerhaus', 0, -8, 0), S('lagerhaus', 18, -6, 0), S(H, -24, -32, 30), S(H, -8, -36, 0), S(H, 8, -36, 0), S(H, 24, -32, -30),
      S('marktstand', -12, -20, 0), S('marktstand', -4, -21, 0), S('marktstand', 4, -21, 0), S('marktstand', 12, -20, 0), S('brunnen', 0, -27),
      S('laterne', -10, 4, 0), S('laterne', 10, 4, 0), S('laterne', -16, -26, 0), S('laterne', 16, -26, 0), S('kisten', 6, 5, 10), S('faesser', -6, 5, 0),
    ] };
    case 'lagerviertel': return { clear: 32, items: [
      S('lagerhaus', -10, 0, 0), S('lagerhaus', 10, 0, 0), S('lagerhaus', -10, -18, 0), S('lagerhaus', 10, -18, 0), S('kran', 0, 8, 0), S('kran', 0, -9, 90),
      S('kisten', -18, 10, 0), S('kisten', 18, 10, 30), S('kisten', 0, -28, 0), S('faesser', -4, 10, 0), S('faesser', 20, -28, 0), S('laterne', 6, 9, 0), S('laterne', -6, -28, 0),
    ] };
    case 'wehrmauer': return { clear: 26, items: [
      ...wallLine(-30, 0, -8, 0), ...wallLine(8, 0, 30, 0), S('torhaus', 0, 0, 0), S('zinnenturm', -32, 0), S('zinnenturm', 32, 0),
      S('kisten', -10, -6, 0), S('faesser', 10, -6, 0), S('laterne', -3, 4, 0), S('laterne', 3, 4, 0),
    ] };
    case 'terrassengarten': return { clear: 32, items: [
      S('feld', -9, 0, 0, 14), S('feld', 9, 0, 0, 14), S('feld', -9, -8, 0, 14), S('feld', 9, -8, 0, 14), S('feld', -9, -16, 0, 14), S('feld', 9, -16, 0, 14),
      S('mauer', -12, 4.5, 0, 10), S('mauer', 12, 4.5, 0, 10), S('mauer', -12, -12, 0, 10), S('mauer', 12, -12, 0, 10),
      V('statue', 0, -27, 0, 'koenigin'), S('brunnen', 0, -6), S('laterne', -3, 6, 0), S('laterne', 3, 6, 0), S(H, -20, -26, 30),
    ] };
    case 'palast': return { clear: 42, items: [
      S('bergfried', 0, -8), S('zinnenturm', -17, -8), S('zinnenturm', 17, -8), S(H, -14, 9, 0), S(H, 14, 9, 0), S('kapelle', 0, -27, 0),
      S('brunnen', 0, 14), V('statue', -8, 22, 0, 'koenig'), V('statue', 8, 22, 0, 'koenig'), V('fahne', -22, 14, 0, 'lilie'), V('fahne', 22, 14, 0, 'lilie'),
      S('laterne', -4, 20, 0), S('laterne', 4, 20, 0), S('laterne', -20, -20, 0), S('laterne', 20, -20, 0),
    ] };
    case 'amphitheater': {
      const items: StructureDef[] = [];
      for (const a of [40, 90, 140, 220, 270, 320]) { const r = (a * Math.PI) / 180; items.push(S('saeulen', Math.sin(r) * 20, Math.cos(r) * 20, a + 90)); }
      for (const a of [65, 115, 180, 245, 295]) { const r = (a * Math.PI) / 180; items.push(S('mauer', Math.sin(r) * 25, Math.cos(r) * 25, a + 90, 9)); }
      items.push(V('statue', 0, -16, 0, 'krieger'), S('feuer', -7, -10), S('feuer', 7, -10), S('laterne', -4, 24, 0), S('laterne', 4, 24, 0));
      return { clear: 34, items };
    }
    case 'dojo': return { clear: 30, items: [
      S('pagode', 0, -10, 0), S('zaun', -13, 4, 90, 16), S('zaun', 13, 4, 90, 16), S('zaun', -8, 12, 0, 8), S('zaun', 8, 12, 0, 8),
      S('laterne', -5, 13, 0), S('laterne', 5, 13, 0), S('laterne', -12, -4, 0), S('laterne', 12, -4, 0), S('feuer', -6, 2), S('feuer', 6, 2), S('kisten', 16, -12, 0), V('fahne', 0, 8, 0, 'kurogane'),
    ] };
    case 'korsarenlager': return { clear: 28, items: [
      S('holzhuette', -12, -8, 30), S('holzhuette', 0, -15, 0), S('holzhuette', 12, -8, -30), S('feuer', 0, -2), S('feuer', -9, 6), S('kisten', 6, 4, 10), S('kisten', -4, 8, 40),
      S('kisten', 14, 3, 0), S('faesser', -14, 3, 0), S('faesser', 9, -2, 0), S('boot', 12, 10, 80), S('netz', -14, 10, 20), S('zaun', 0, -24, 0, 14), V('fahne', 0, -20, 0, 'korsar'),
    ] };
    case 'tempel': return { clear: 38, items: [
      S('ruine', 0, -4, 0), S('saeulen', -15, -4, 90), S('saeulen', 15, -4, 90), S('saeulen', -15, 12, 90), S('saeulen', 15, 12, 90), S('ruinenbogen', 0, 18, 0),
      V('statue', -8, 22, 0, 'waechter'), V('statue', 8, 22, 0, 'waechter'), V('statue', 0, -22, 0, 'kaiser'), S('feuer', -5, 10), S('feuer', 5, 10),
    ] };
    case 'schatzkammer': return { clear: 24, items: [
      ...themeItems('schatz', b).items, V('statue', 0, -12, 0, 'kaiser'), S('saeulen', -9, -4, 90), S('saeulen', 9, -4, 90), S('feuer', -4, 8), S('feuer', 4, 8),
    ] };
    case 'statuenhain': return { clear: 22, items: [
      V('statue', -10, -4, 20, 'waechter'), V('statue', 0, -11, 0, 'kaiser'), V('statue', 10, -4, -20, 'waechter'), S('saeulen', 0, 7, 0), S('feuer', -5, 2), S('feuer', 5, 2),
    ] };
    case 'ruinenkai': return { clear: 26, items: [
      S('steg', 0, 0, 0, 28), S('ruine', -13, -12, 20), S('saeulen', 11, -10, 0), S('ruinenbogen', 0, -18, 0), S('kisten', 6, 3, 10), S('laterne', -3, 6, 0), S('laterne', 4, 6, 0), S('boot', -10, 8, 80),
    ] };
    case 'erzterrassen': return { clear: 30, items: [
      ...themeItems('mine', b).items, S('kran', 12, -22, 0), S('mauer', -9, -19, 0, 12), S('mauer', 9, -19, 0, 10), S('kisten', -14, -24, 0), S('feuer', -2, -26), S('holzhuette', -20, -12, 50),
    ] };
    case 'deckung': return { clear: 14, items: [
      S('mauer', -6, 2, 10, 6), S('mauer', 6, -2, -15, 6), S('mauer', 0, -8, 0, 5), S('kisten', -9, -6, 20), S('faesser', 9, 6, 0), S('kisten', 2, 7, -10),
    ] };
    default: return themeItems(theme, b);
  }
}

// ---------- Wege ----------

const segX = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean => {
  const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
};

/** Kreuzt die Strecke A → B eine Spalte? Dann der nächste Übergang dieser Spalte (die Brücke), sonst null */
export function riftCrossingFor(a: [number, number], b: [number, number], rifts: MegaIslandSpec['rifts']): [number, number] | null {
  let best: [number, number] | null = null, bd = Infinity;
  for (const r of rifts) {
    let hit = false;
    for (let i = 1; i < r.pts.length && !hit; i++) if (segX(a[0], a[1], b[0], b[1], r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1])) hit = true;
    if (!hit) continue;
    for (const c of r.crossAt) { const d = Math.hypot(c[0] - (a[0] + b[0]) / 2, c[1] - (a[1] + b[1]) / 2); if (d < bd) { bd = d; best = c; } }
  }
  return best;
}

/** Mittelpunkt eines Bauplatzes (gleiche Rechnung wie world/settlement.ts) */
export function megaPlotCenter(m: Pick<MegaIslandSpec, 'r' | 'coast'>, p: MegaPlot): [number, number] {
  if (p.at) return p.at;
  const th = ((p.deg ?? 0) * Math.PI) / 180;
  let k = 1;
  const a = Math.atan2(Math.cos(th), Math.sin(th));
  for (const w of m.coast) k += w.a * Math.sin(w.f * a + w.p);
  const e = m.r * k * (p.d ?? 0.7);
  return [Math.sin(th) * e, Math.cos(th) * e];
}

/**
 * Wege der Insel: vom ersten Hafen aus ein Baum über alle Bauplätze (jeder Platz hängt am nächsten, der schon verbunden ist). Kreuzt ein Weg eine
 * Spalte, führt er über ihre nächste Brücke. Dazu die Wege aus den Daten (Serpentinen, Marmorwege).
 */
export function megaRoads(m: MegaIslandSpec): SiteDef['roads'] {
  const centers = m.plots.map((p) => megaPlotCenter(m, p));
  const done = [0];
  const left = centers.map((_, i) => i).filter((i) => i !== 0);
  const roads: SiteDef['roads'] = [];
  while (left.length) {
    let bi = 0, bj = 0, bd = Infinity;
    for (const i of left) for (const j of done) { const d = Math.hypot(centers[i][0] - centers[j][0], centers[i][1] - centers[j][1]); if (d < bd) { bd = d; bi = i; bj = j; } }
    left.splice(left.indexOf(bi), 1);
    done.push(bi);
    const a = centers[bj], b = centers[bi];
    const via = riftCrossingFor(a, b, m.rifts);
    const pts: [number, number][] = via ? [[a[0] * 0.97, a[1] * 0.97], via, [b[0] * 0.97, b[1] * 0.97]] : [[a[0] * 0.97, a[1] * 0.97], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [b[0] * 0.97, b[1] * 0.97]];
    roads.push({ w: 3, pts, surface: m.biome === 'kreide' || m.biome === 'klippe' ? 'stein' : 'erde' });
  }
  return [...roads, ...(m.roads ?? [])];
}

// ---------- Siedlungen ----------

/** Die Siedlungsdaten einer Mega-Insel */
export function megaSite(m: MegaIslandSpec): SiteDef {
  const clusters: ClusterDef[] = m.plots.map((pl, i) => {
    const t = megaItems(pl.theme, m.biome);
    return { name: `${m.name} · ${pl.theme}`, ...(pl.at ? { at: pl.at } : { deg: pl.deg ?? 0, d: pl.d ?? 0.7 }), turn: pl.turn, clear: t.clear * (i === 0 ? 1 : 0.92), items: t.items };
  });
  return {
    label: m.label,
    coast: m.coast,
    hills: m.hills,
    grass: m.grass,
    clusters,
    roads: megaRoads(m),
    rifts: m.rifts.map((r) => ({ kind: r.kind, w: r.w, pts: r.pts, cross: r.crossAt.map((c) => polylineT(r.pts, c)), bridge: r.bridge, name: r.name })),
    scatter: scatterOf(m.biome).map((l) => ({ ...l, perHa: l.flora === 'gras' || l.flora === 'halme' || l.flora === 'blume' ? l.perHa * 0.6 : l.perHa })),
    villagers: m.villagers,
    themed: m.power !== null,
  };
}

/** Anteil der Länge eines Linienzugs, an dem der Punkt `c` am nächsten liegt */
export function polylineT(pts: readonly [number, number][], c: [number, number]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let acc = 0, best = 0, bd = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((c[0] - ax) * dx + (c[1] - az) * dz) / (l * l)));
    const d = Math.hypot(c[0] - (ax + dx * t), c[1] - (az + dz * t));
    if (d < bd) { bd = d; best = (acc + l * t) / (total || 1); }
    acc += l;
  }
  return best;
}

export const MEGA_SITES: Record<string, SiteDef> = Object.fromEntries(MEGA_ISLANDS.map((m) => [m.id, megaSite(m)]));

// ---------- Inseln und Schären als Insel-Definitionen ----------

const polarWorld = (deg: number, dist: number) => ({ x: Math.round(Math.sin((deg * Math.PI) / 180) * dist), z: Math.round(Math.cos((deg * Math.PI) / 180) * dist) });

/** Die Mega-Inseln (fertige Weltkoordinaten) */
export function megaIslandDefs(): IslandDef[] {
  return MEGA_ISLANDS.map((m) => ({
    id: m.id, name: m.name, ...polarWorld(m.deg, m.dist), r: m.r, hill: 0.2, kind: m.kind, palms: 0, rocks: 0, info: m.info, biome: m.biome,
    site: m.id, placed: true, themePower: m.power, mega: true, level: megaLevel(m.tier ?? dangerOfDistance(m.dist), 1), dangerTier: m.tier,
  }));
}

/** Die vorgelagerten Schären, Leuchtturm-Felsen und Riff-Passagen (je Insel 7) */
export function skerryDefs(): IslandDef[] {
  const out: IslandDef[] = [];
  for (const m of MEGA_ISLANDS) {
    const c = polarWorld(m.deg, m.dist);
    m.skerries.forEach((s, i) => {
      const a = (s.deg * Math.PI) / 180;
      const reef = s.r < 15;
      out.push({
        id: `${m.id}_schaere${i + 1}`, name: s.name, x: Math.round(c.x + Math.sin(a) * s.dist), z: Math.round(c.z + Math.cos(a) * s.dist), r: s.r,
        hill: s.kind === 'lighthouse' ? 0.3 : reef ? 0.45 : 0.25, kind: s.kind, palms: m.biome === 'atoll' || m.biome === 'tropisch' ? 2 : 0, rocks: reef ? 1 : 2,
        info: s.info, biome: m.biome === 'weinland' || m.biome === 'festland' ? 'klippe' : m.biome, placed: true, skerry: true, themePower: m.power,
      });
    });
  }
  return out;
}

// ---------- Kampf-Bezirke und Insel-Kommandant (rein) ----------

/** Wie lange ein geräumter Bezirk ruhig bleibt und wann ein besiegter Kommandant wiederkehrt (Spielzeit, s) */
export const MEGA_COMBAT = {
  districtCooldown: 900,
  commanderCooldown: 1500,
  /** Ab diesem Abstand zur Bezirksmitte (zusätzlich zum Umkreis) ziehen die Trupps auf: man sieht sie patrouillieren, bevor sie angreifen */
  wakeMargin: 70,
  /** Der Kommandant wechselt alle so viele Sekunden zum nächsten Bezirk seiner Runde (solange er nicht kämpft) */
  roamEvery: 28,
} as const;

/** Stufe der Gegner: Gefahrenstufe der Insel (3 – 4) bestimmt die Grundstufe, dazu der Aufschlag des Bezirks */
export function megaLevel(dangerTier: number, lvl: number): number {
  const base = dangerTier >= 4 ? 14 : dangerTier === 3 ? 10 : 7;
  return base + lvl;
}

export interface DistrictRt { id: string; state: 'ruhig' | 'aktiv' | 'geraeumt'; until: number }
export interface MegaRuntime { id: MegaId; districts: DistrictRt[]; commander: { state: 'fern' | 'unterwegs' | 'besiegt'; until: number; leg: number; roamT: number } }

export function newMegaRuntime(id: MegaId): MegaRuntime {
  return { id, districts: MEGA_BY_ID[id].districts.map((d) => ({ id: d.id, state: 'ruhig', until: 0 })), commander: { state: 'fern', until: 0, leg: 0, roamT: 0 } };
}

/** Bezirksmitte in Weltkoordinaten */
export function districtWorld(m: MegaIslandSpec, d: MegaDistrictDef, out: { x: number; z: number }): { x: number; z: number } {
  const c = polarWorld(m.deg, m.dist);
  out.x = c.x + d.at[0]; out.z = c.z + d.at[1];
  return out;
}

const _dw = { x: 0, z: 0 };

/**
 * Welche Bezirke ziehen jetzt auf? (Spieler zu Fuß bei (px, pz), Spielzeit `now`.) Ruhige Bezirke im Weckabstand werden aktiv; geräumte nach ihrer
 * Ruhezeit wieder ruhig. Liefert die Indizes der neu aufziehenden Bezirke in `out` (vorher geleert). Rein, ohne neue Objekte.
 */
export function districtsToWake(rt: MegaRuntime, px: number, pz: number, now: number, out: number[]): number[] {
  out.length = 0;
  const m = MEGA_BY_ID[rt.id];
  for (let i = 0; i < rt.districts.length; i++) {
    const d = rt.districts[i];
    if (d.state === 'geraeumt' && now >= d.until) d.state = 'ruhig';
    if (d.state !== 'ruhig') continue;
    districtWorld(m, m.districts[i], _dw);
    if (Math.hypot(px - _dw.x, pz - _dw.z) <= m.districts[i].r + MEGA_COMBAT.wakeMargin) { d.state = 'aktiv'; out.push(i); }
  }
  return out;
}

/** Ein Bezirk ist geräumt (alle Trupps gefallen): Ruhezeit beginnt */
export function clearDistrict(rt: MegaRuntime, i: number, now: number): void {
  const d = rt.districts[i];
  d.state = 'geraeumt'; d.until = now + MEGA_COMBAT.districtCooldown;
}

/** Erscheint der Kommandant? Sobald der erste Bezirk der Insel aufzieht (und er nicht gerade besiegt ruht) */
export function commanderShouldAppear(rt: MegaRuntime, now: number): boolean {
  const c = rt.commander;
  if (c.state === 'besiegt' && now >= c.until) c.state = 'fern';
  return c.state === 'fern' && rt.districts.some((d) => d.state === 'aktiv');
}

/** Nächstes Ziel der Runde des Kommandanten (Bezirk), solange er nicht kämpft: alle `roamEvery` Sekunden weiter */
export function commanderRoam(rt: MegaRuntime, dt: number, fighting: boolean): number {
  const c = rt.commander, m = MEGA_BY_ID[rt.id];
  if (c.state !== 'unterwegs' || fighting) return -1;
  c.roamT += dt;
  if (c.roamT < MEGA_COMBAT.roamEvery) return -1;
  c.roamT = 0;
  c.leg = (c.leg + 1) % m.commander.route.length;
  return m.districts.findIndex((d) => d.id === m.commander.route[c.leg]);
}

// ---------- Spielstand (4.4A) ----------

/**
 * Ruhezeiten der Mega-Inseln im Spielstand: je Insel die verbleibenden Sekunden je Bezirk (0 = bereit) und des besiegten Kommandanten. Relativ
 * gespeichert, weil die Spieluhr der Welt beim Laden neu beginnt. Fehlt das Feld (ältere Stände), ist alles bereit wie bisher.
 */
export type MegaSaveState = Partial<Record<MegaId, { d: number[]; c: number }>>;

/** Was gespeichert wird: nur laufende Ruhezeiten (geräumte Bezirke, besiegter Kommandant) */
export function megaToSave(rts: Iterable<MegaRuntime>, now: number): MegaSaveState {
  const out: MegaSaveState = {};
  for (const rt of rts) {
    const d = rt.districts.map((x) => (x.state === 'geraeumt' ? Math.max(0, Math.round(x.until - now)) : 0));
    const c = rt.commander.state === 'besiegt' ? Math.max(0, Math.round(rt.commander.until - now)) : 0;
    if (c > 0 || d.some((v) => v > 0)) out[rt.id] = { d, c };
  }
  return out;
}

/** Gespeicherte Ruhezeiten säubern: nur bekannte Inseln, Zahlen 0 … volle Ruhezeit, Bezirksliste in der Länge der Insel */
export function cleanMegaSave(x: unknown): MegaSaveState {
  const out: MegaSaveState = {};
  if (!x || typeof x !== 'object') return out;
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (!isMegaId(k) || !v || typeof v !== 'object') continue;
    const r = v as { d?: unknown; c?: unknown };
    const n = MEGA_BY_ID[k].districts.length;
    const num = (q: unknown, max: number) => (typeof q === 'number' && Number.isFinite(q) ? Math.max(0, Math.min(max, Math.round(q))) : 0);
    const d = Array.from({ length: n }, (_, i) => num(Array.isArray(r.d) ? r.d[i] : 0, MEGA_COMBAT.districtCooldown));
    const c = num(r.c, MEGA_COMBAT.commanderCooldown);
    if (c > 0 || d.some((q) => q > 0)) out[k] = { d, c };
  }
  return out;
}

/** Laufzeit-Zustände aus dem Spielstand (Spieluhr `now`): geräumte Bezirke und besiegte Kommandanten ruhen weiter */
export function megaFromSave(saved: MegaSaveState | null | undefined, now: number): MegaRuntime[] {
  const out: MegaRuntime[] = [];
  for (const [k, v] of Object.entries(cleanMegaSave(saved))) {
    const id = k as MegaId, rt = newMegaRuntime(id);
    v!.d.forEach((left, i) => { if (left > 0) { rt.districts[i].state = 'geraeumt'; rt.districts[i].until = now + left; } });
    if (v!.c > 0) { rt.commander.state = 'besiegt'; rt.commander.until = now + v!.c; }
    out.push(rt);
  }
  return out;
}

// ---------- Beute ----------

export interface MegaLoot { gold: number; xp: number; fame: number; goods: { good: GoodId; units: number }[]; shards: number; seals: { power: PowerId; n: number } | null; chest: boolean; warlord: boolean }

/**
 * Beute eines geräumten Bezirks (Schatztruhe mit Gold, Regionalware der Insel, Relikt-Splitter) oder des Kommandanten (dazu Boss-Siegel der Macht der Insel,
 * beim Kaiser-Atoll der Macht des Sektors, und mit 60 % ein Stück der Kriegsherren-Beute). `rnd` = Zufall 0 … 1.
 */
export function rollMegaLoot(m: Pick<MegaIslandSpec, 'goods' | 'power'>, level: number, commander: boolean, sector: PowerId, rnd: () => number): MegaLoot {
  const goods = m.goods.slice(0, commander ? 3 : 2).map((g) => ({ good: g, units: (commander ? 4 : 2) + Math.floor(rnd() * 3) }));
  const power = m.power ?? sector;
  return {
    gold: Math.round((commander ? 1400 : 380) + level * (commander ? 90 : 28) + rnd() * (commander ? 400 : 120)),
    // Zusatz zum normalen Abschuss-Lohn der Gegner: etwa eine knappe Stufe für den Kommandanten, ein Drittel für einen Bezirk (alle 15 bzw. 25 Minuten wieder)
    xp: (commander ? 300 : 120) + level * (commander ? 20 : 8),
    fame: commander ? 60 + level : 12 + Math.round(level / 2),
    goods,
    shards: commander ? 2 + Math.floor(rnd() * 3) : rnd() < 0.5 ? 1 : 0,
    seals: commander ? { power, n: 1 } : null,
    chest: true,
    warlord: commander && rnd() < 0.6,
  };
}
