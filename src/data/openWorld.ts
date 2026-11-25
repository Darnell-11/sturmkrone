// Die 24 Themen-Inseln der offenen Welt (Phase 4.3B): je vier in den fünf Kuchenstücken der Mächte und vier unkartierte Geheim-Inseln.
// Reine Daten (ohne three.js, JSON-tauglich): Lage (Winkel und Abstand), Größe, Art, Biom, Thema und die Siedlungen als `SiteDef`
// (data/settlements.ts), aus Bausteinen zusammengesetzt. Jede Insel trägt mindestens einen Steg (Liegeplatz), ihre Wege laufen vom Steg zu
// jedem Bauplatz, und ihr Markt steht in data/economy.ts (`ISLAND_PROFILES`). data/regions.ts trägt die Inseln in die Meere ein.
import type { IslandDef, IslandKind, IslandStyle } from './regions';
import type { PowerId } from './factions';
import type { ClusterDef, RiftDef, ScatterLayer, SiteDef, StructureDef, StructureType } from './settlements';

/** Biome, für die es eine Bewuchs-Palette gibt (world/vegetation.ts `Biome`): nur sie taugen für Siedlungs-Inseln */
export type SiteBiome = Extract<IslandStyle, 'festland' | 'tropisch' | 'klippe' | 'nord' | 'glut' | 'kreide' | 'atoll' | 'weinland'>;
export const SITE_BIOMES: readonly SiteBiome[] = ['festland', 'tropisch', 'klippe', 'nord', 'glut', 'kreide', 'atoll', 'weinland'];

/** Bausteine einer Siedlung (je ein Platz auf der Insel) */
export type Theme =
  | 'hafen' | 'werft' | 'kontor' | 'plantage' | 'weinberg' | 'parfum' | 'mine' | 'giesserei' | 'batterie' | 'festung'
  | 'wachturm' | 'leuchtfeuer' | 'schwarzmarkt' | 'perlen' | 'dorf' | 'ruinen' | 'schatz'
  // Phase 4.5C: Holzfäller-Lager mit Sägemühle (Hartholz-Forste) und Segeltuch-Manufaktur mit Flachsfeldern
  | 'forst' | 'manufaktur';

/** Ein Bauplatz: Thema und Lage (Richtung in Grad, Abstand als Anteil des Küstenradius; oder fest in Metern) */
export interface PlotSpec { theme: Theme; deg?: number; d?: number; at?: [number, number]; turn?: number }

export interface ThemeIslandSpec {
  id: string;
  name: string;
  /** Besitzende Macht (Kuchenstück), null = unkartiert und herrenlos */
  power: PowerId | null;
  /** Lage: Winkel in Grad (0 = Norden, im Uhrzeigersinn) und Abstand vom Weltmittelpunkt in Metern */
  deg: number;
  dist: number;
  r: number;
  kind: IslandKind;
  biome: SiteBiome;
  /** Unterzeile des Inselschilds */
  label: string;
  /** Küstenform: rund, langgezogen, gelappt (Buchten) oder sichelförmig */
  shape: 'rund' | 'lang' | 'gelappt' | 'sichel';
  /** Hügel in Metern ab Inselmitte (Radius r, Höhe = r · h); leer = ein flacher Hügel in der Mitte */
  hills?: { x: number; z: number; r: number; h: number }[];
  grass: number;
  plots: PlotSpec[];
  villagers: number;
  level?: number;
  uncharted?: boolean;
  info: string;
  /** Archipel-Form (4.5D): Doppelinsel (ein Meeresarm teilt die Insel, zwei Brücken) oder Atoll mit Lagune (ein Steg führt hinüber) */
  archipel?: 'doppel' | 'lagune';
  /** Spalten mit Brücken (aus `archipel` errechnet, data/settlements.ts `RiftDef`) */
  rifts?: (Omit<RiftDef, 'cross'> & { crossAt: [number, number][] })[];
}

// ---------- Die 24 Inseln der Phase 4.3B ----------

export const THEME_ISLANDS_43B: readonly ThemeIslandSpec[] = [
  // ----- England (Kuchenstück −36° … 36°) -----
  {
    id: 'koenigshafen', name: 'Königshafen', power: 'england', deg: 18, dist: 5460, r: 118, kind: 'harbor', biome: 'festland', label: 'Tee- und Handelskolonie',
    shape: 'gelappt', grass: 0.85, villagers: 6,
    hills: [{ x: -20, z: -30, r: 48, h: 0.16 }, { x: 40, z: 20, r: 30, h: 0.12 }],
    plots: [{ theme: 'kontor', deg: 200, d: 0.74 }, { theme: 'plantage', at: [-20, -28], turn: 20 }, { theme: 'dorf', deg: 80, d: 0.62 }],
    info: 'Die reichste Teekolonie der Krone: Lagerhäuser am Kai, Teegärten auf den Hügeln und ein Kontor, das Gewürze und Wein sucht.',
  },
  {
    id: 'kreideklippe', name: 'Kreideklippe', power: 'england', deg: -18, dist: 7440, r: 124, kind: 'harbor', biome: 'kreide', label: 'Marine-Werft und Tuch-Manufaktur',
    shape: 'lang', grass: 0.8, villagers: 5,
    hills: [{ x: 30, z: -40, r: 56, h: 0.34 }, { x: -40, z: -10, r: 36, h: 0.22 }],
    plots: [{ theme: 'werft', deg: 160, d: 0.76 }, { theme: 'hafen', deg: 230, d: 0.76 }, { theme: 'dorf', at: [-30, 20], turn: 200 }],
    info: 'Weiße Kalksteinfelsen über einer Werft der Royal Navy. In der Manufaktur weben sie Segeltuch für die halbe Flotte.',
  },
  {
    id: 'nebelriff', name: 'Nebelriff', power: 'england', deg: 22, dist: 9120, r: 84, kind: 'quiet', biome: 'klippe', label: 'Wachturm-Atoll im Sturmgürtel',
    shape: 'sichel', grass: 0.5, villagers: 3,
    plots: [{ theme: 'leuchtfeuer', at: [0, 4] }, { theme: 'wachturm', deg: 120, d: 0.6 }, { theme: 'hafen', deg: 220, d: 0.78 }],
    info: 'Ein Leuchtfeuer der Krone auf einem Riff mitten im Sturmgürtel. Die Wächter tauschen Medizin gegen Pulver und Tee.',
  },
  {
    id: 'georgskap', name: 'St.-Georgs-Kap', power: 'england', deg: -10, dist: 10580, r: 96, kind: 'camp', biome: 'kreide', label: 'Küstenbatterie',
    shape: 'rund', grass: 0.7, villagers: 0, level: 16,
    hills: [{ x: 0, z: -10, r: 46, h: 0.28 }],
    plots: [{ theme: 'batterie', deg: 0, d: 0.7 }, { theme: 'batterie', deg: 140, d: 0.68 }, { theme: 'festung', at: [0, -12] }, { theme: 'hafen', deg: 220, d: 0.8 }],
    info: 'Ein Fels voller Geschütze, der die Einfahrt zum Kaiser-Meer bewacht. Die Besatzung schießt zuerst und fragt nie.',
  },
  // ----- Deutschland / Hanse (36° … 108°) -----
  {
    id: 'bernsteinkueste', name: 'Bernsteinküste', power: 'deutschland', deg: 60, dist: 5590, r: 120, kind: 'harbor', biome: 'nord', label: 'Kiefernwald- und Werftkolonie',
    shape: 'lang', grass: 0.88, villagers: 6,
    hills: [{ x: 10, z: -30, r: 52, h: 0.18 }],
    plots: [{ theme: 'werft', deg: 250, d: 0.76 }, { theme: 'hafen', deg: 200, d: 0.76 }, { theme: 'dorf', at: [20, -20], turn: 160 }],
    info: 'Dunkle Kiefernwälder bis an den Strand. Die Hanse schlägt hier das Hartholz für ihre Werften und braucht Tuch und Tee.',
  },
  {
    id: 'eisenfels', name: 'Eisenfels', power: 'deutschland', deg: 84, dist: 7680, r: 108, kind: 'harbor', biome: 'klippe', label: 'Erz- und Kanonenstahl-Mine',
    shape: 'gelappt', grass: 0.45, villagers: 4,
    hills: [{ x: 10, z: 10, r: 50, h: 0.4 }, { x: -36, z: -24, r: 28, h: 0.3 }],
    plots: [{ theme: 'mine', at: [-10, -30], turn: 180 }, { theme: 'hafen', deg: 250, d: 0.78 }, { theme: 'giesserei', deg: 320, d: 0.66 }],
    info: 'Schwarzer Fels voller Erzadern. Aus den Stollen kommt Kanonenstahl, in die Stollen gehen Werkzeug und Medizin.',
  },
  {
    id: 'nordsturmklippe', name: 'Nordsturmklippe', power: 'deutschland', deg: 54, dist: 9360, r: 92, kind: 'camp', biome: 'nord', label: 'Granit-Vorposten der Hanse',
    shape: 'rund', grass: 0.62, villagers: 0, level: 15,
    hills: [{ x: 0, z: 0, r: 44, h: 0.3 }],
    plots: [{ theme: 'festung', at: [0, -4] }, { theme: 'wachturm', deg: 60, d: 0.7 }, { theme: 'hafen', deg: 230, d: 0.8 }],
    info: 'Ein rauer Granitvorposten im Sturmgürtel. Die Garnison hält die Seewege der Hanse frei – mit allen Mitteln.',
  },
  {
    id: 'donnergiesserei', name: 'Donnergießerei', power: 'deutschland', deg: 96, dist: 5840, r: 112, kind: 'harbor', biome: 'nord', label: 'Artillerie-Gießerei',
    shape: 'sichel', grass: 0.7, villagers: 5,
    hills: [{ x: -20, z: -20, r: 44, h: 0.2 }],
    plots: [{ theme: 'giesserei', at: [-10, -20] }, { theme: 'hafen', deg: 270, d: 0.76 }, { theme: 'dorf', deg: 30, d: 0.62 }],
    info: 'Tag und Nacht donnern die Hämmer: hier entstehen die Rohre der Hanse-Artillerie. Kohle und Schwefel sind immer knapp.',
  },
  // ----- Kurogane (108° … 180°) -----
  {
    id: 'aschezahn', name: 'Aschezahn', power: 'kurogane', deg: 128, dist: 5710, r: 112, kind: 'harbor', biome: 'glut', label: 'Schwefel- und Obsidian-Mine',
    shape: 'gelappt', grass: 0.4, villagers: 4,
    hills: [{ x: 14, z: -10, r: 52, h: 0.42 }],
    plots: [{ theme: 'mine', at: [10, -32], turn: 160 }, { theme: 'hafen', deg: 300, d: 0.78 }, { theme: 'dorf', deg: 220, d: 0.66 }],
    info: 'Ein Zahn aus Asche und Obsidian. In gelbem Dampf schürfen Kuroganes Bergleute Schwefel und schwarzes Glas.',
  },
  {
    id: 'schattenbucht', name: 'Schattenbucht', power: 'kurogane', deg: 160, dist: 7560, r: 90, kind: 'harbor', biome: 'glut', label: 'Schwarzmarkt der Gesetzlosen',
    shape: 'sichel', grass: 0.42, villagers: 5,
    plots: [{ theme: 'schwarzmarkt', deg: 330, d: 0.76 }, { theme: 'dorf', at: [0, -14] }],
    info: 'In der Bucht fragt niemand nach Flaggen. Waffen, Pulver und Obsidian wechseln den Besitzer – keine Macht kontrolliert die Fracht.',
  },
  {
    id: 'drachenwirbel', name: 'Drachenwirbel', power: 'kurogane', deg: 132, dist: 9120, r: 100, kind: 'camp', biome: 'glut', label: 'Zerklüftete Vulkanfelsen',
    shape: 'gelappt', grass: 0.36, villagers: 0, level: 15,
    hills: [{ x: -10, z: 10, r: 46, h: 0.5 }, { x: 34, z: -30, r: 26, h: 0.4 }],
    plots: [{ theme: 'wachturm', deg: 40, d: 0.66 }, { theme: 'ruinen', at: [-20, -30], turn: 150 }, { theme: 'hafen', deg: 300, d: 0.8 }],
    info: 'Felsnadeln wie Drachenzähne, dazwischen Wirbel aus heißem Dampf. Kuroganes Wächter lauern zwischen den Graten.',
  },
  {
    id: 'blutmondriff', name: 'Blutmond-Riff', power: 'kurogane', deg: 164, dist: 10710, r: 98, kind: 'camp', biome: 'glut', label: 'Korsaren-Bastion',
    shape: 'rund', grass: 0.4, villagers: 0, level: 17,
    hills: [{ x: 0, z: -6, r: 44, h: 0.26 }],
    plots: [{ theme: 'festung', at: [0, -8] }, { theme: 'batterie', deg: 30, d: 0.7 }, { theme: 'hafen', deg: 330, d: 0.8 }],
    info: 'Wenn der Mond rot aufgeht, laufen die Korsaren aus. Ihre Bastion auf dem Riff hat noch keine Flotte genommen.',
  },
  // ----- Niederlande / Handelskompanie (180° … 252°) -----
  {
    id: 'banda', name: 'Gewürzinsel Banda', power: 'niederlande', deg: 198, dist: 5590, r: 122, kind: 'harbor', biome: 'tropisch', label: 'Terrassen-Gewürzplantage',
    shape: 'gelappt', grass: 0.82, villagers: 6,
    hills: [{ x: 0, z: -10, r: 60, h: 0.2 }, { x: 0, z: -10, r: 34, h: 0.36 }],
    plots: [{ theme: 'plantage', at: [0, -24] }, { theme: 'plantage', at: [-34, 10], turn: 90 }, { theme: 'hafen', deg: 20, d: 0.76 }],
    info: 'Muskat und Pfeffer wachsen auf Terrassen bis zum Gipfel. Das Kontor der Kompanie kauft Werkzeug und Medizin.',
  },
  {
    id: 'nieuwhoorn', name: 'Grachtenstadt Nieuw-Hoorn', power: 'niederlande', deg: 232, dist: 7320, r: 128, kind: 'harbor', biome: 'festland', label: 'Kontor-Handelszentrum',
    shape: 'rund', grass: 0.86, villagers: 7,
    hills: [{ x: 30, z: -30, r: 40, h: 0.12 }],
    plots: [{ theme: 'kontor', deg: 50, d: 0.72 }, { theme: 'hafen', deg: 100, d: 0.76 }, { theme: 'dorf', at: [-20, -20], turn: 230 }],
    info: 'Kanäle, Brücken und Backsteinspeicher: das Handelszentrum der Kompanie im Riffgürtel. Hier wird alles gekauft und alles verkauft.',
  },
  {
    id: 'sandbankatoll', name: 'Sandbank-Atoll', power: 'niederlande', deg: 206, dist: 9120, r: 80, kind: 'harbor', biome: 'atoll', label: 'Schmugglerhafen',
    shape: 'sichel', grass: 0.38, villagers: 4,
    plots: [{ theme: 'schwarzmarkt', deg: 30, d: 0.74 }, { theme: 'perlen', deg: 200, d: 0.7 }],
    info: 'Eine Sandbank, die bei Ebbe wächst. Die Kompanie schaut weg, solange die Schmuggler ihre Spitzel gut bezahlen.',
  },
  {
    id: 'goldkueste', name: 'Goldküste Oranje', power: 'niederlande', deg: 238, dist: 10580, r: 116, kind: 'harbor', biome: 'tropisch', label: 'Luxus- und Seidenkontor',
    shape: 'lang', grass: 0.7, villagers: 6,
    hills: [{ x: -20, z: -24, r: 46, h: 0.18 }],
    plots: [{ theme: 'kontor', deg: 60, d: 0.74 }, { theme: 'dorf', at: [-24, -24], turn: 240 }],
    info: 'Goldene Strände und Seidenballen bis unter die Dächer. Das reichste Kontor der Kompanie liegt mitten im Kaiser-Meer.',
  },
  // ----- Frankreich (252° … 324°) -----
  {
    id: 'sonnenweinkap', name: 'Sonnenwein-Kap', power: 'frankreich', deg: 310, dist: 4320, r: 110, kind: 'harbor', biome: 'weinland', label: 'Wein- und Seidenhafen',
    shape: 'lang', grass: 0.84, villagers: 6,
    hills: [{ x: -10, z: -20, r: 50, h: 0.18 }],
    plots: [{ theme: 'weinberg', at: [-10, -24] }, { theme: 'hafen', deg: 150, d: 0.76 }, { theme: 'dorf', deg: 250, d: 0.6 }],
    info: 'Weinberge in der Abendsonne über einem Hafen voller Fässer und Seidenballen. Wer Hartholz und Tee bringt, wird gut bezahlt.',
  },
  {
    id: 'korallenbucht', name: 'Korallenbucht', power: 'frankreich', deg: 276, dist: 7080, r: 88, kind: 'harbor', biome: 'atoll', label: 'Perlen- und Luxus-Atoll',
    shape: 'sichel', grass: 0.4, villagers: 5,
    plots: [{ theme: 'perlen', deg: 60, d: 0.72 }, { theme: 'hafen', deg: 300, d: 0.78 }],
    info: 'Eine rosa Korallenbucht, in der Perlentaucher nach Glanz suchen. Ihr Schmuck geht in die Salons von Soleilmont.',
  },
  {
    id: 'fleuratoll', name: 'Fleur-Atoll', power: 'frankreich', deg: 300, dist: 9240, r: 94, kind: 'harbor', biome: 'weinland', label: 'Parfüm- und Gewürzinsel',
    shape: 'gelappt', grass: 0.78, villagers: 5,
    plots: [{ theme: 'parfum', at: [0, -16] }, { theme: 'hafen', deg: 100, d: 0.78 }],
    info: 'Lavendelfelder und Gewürzbeete, deren Duft man auf See riecht. Die Parfümeure brauchen Seide und Tuch für ihre Flakons.',
  },
  {
    id: 'bastionlumiere', name: 'Bastion Lumière', power: 'frankreich', deg: 264, dist: 10710, r: 98, kind: 'camp', biome: 'kreide', label: 'Weiße Prunkfestung',
    shape: 'rund', grass: 0.72, villagers: 0, level: 17,
    hills: [{ x: 0, z: -8, r: 46, h: 0.24 }],
    plots: [{ theme: 'festung', at: [0, -10] }, { theme: 'batterie', deg: 90, d: 0.7 }, { theme: 'hafen', deg: 30, d: 0.8 }],
    info: 'Weiße Mauern mit vergoldeten Zinnen: die Armada Royale zeigt, was sie hat. Ihre Garnison ist so stolz wie gefährlich.',
  },
  // ----- Unkartiert (herrenlos, abseits der Routen in Ring 3 und 4) -----
  {
    id: 'fluesterlagune', name: 'Flüsterlagune', power: null, deg: 44, dist: 11600, r: 74, kind: 'harbor', biome: 'atoll', label: 'Versteckter Schmugglerhafen',
    shape: 'sichel', grass: 0.36, villagers: 4, uncharted: true,
    plots: [{ theme: 'schwarzmarkt', deg: 200, d: 0.74 }, { theme: 'schatz', at: [0, -10] }],
    info: 'Eine Lagune hinter einem Riffkranz, auf keiner Karte. Der Händler hier fragt nicht, woher die Ware stammt.',
  },
  {
    id: 'versunkenekrone', name: 'Versunkene Krone', power: null, deg: -26, dist: 8520, r: 70, kind: 'ruin', biome: 'klippe', label: 'Alte Ruinen-Insel',
    shape: 'gelappt', grass: 0.5, villagers: 0, uncharted: true, level: 14,
    plots: [{ theme: 'ruinen', at: [0, -6] }, { theme: 'schatz', deg: 120, d: 0.6 }, { theme: 'leuchtfeuer', deg: 220, d: 0.78 }],
    info: 'Säulen eines Königreichs, das das Meer verschluckt hat. Zwischen den Steinen glimmen Relikt-Splitter.',
  },
  {
    id: 'knochenriff', name: 'Knochenriff', power: null, deg: 118, dist: 11730, r: 62, kind: 'treasure', biome: 'atoll', label: 'Schatz-Atoll',
    shape: 'sichel', grass: 0.3, villagers: 0, uncharted: true, level: 18,
    plots: [{ theme: 'schatz', at: [0, -6] }, { theme: 'leuchtfeuer', deg: 300, d: 0.78 }],
    info: 'Weiße Walknochen ragen aus dem Korallensand. Unter einem von ihnen liegt eine Truhe, sagen die Alten.',
  },
  {
    id: 'sternenfall', name: 'Sternenfall', power: null, deg: 222, dist: 9960, r: 68, kind: 'ruin', biome: 'klippe', label: 'Krater der alten Warte',
    shape: 'rund', grass: 0.46, villagers: 0, uncharted: true, level: 16,
    hills: [{ x: 0, z: 0, r: 30, h: 0.3 }],
    plots: [{ theme: 'ruinen', at: [-14, -10], turn: 40 }, { theme: 'schatz', at: [14, 8] }, { theme: 'leuchtfeuer', deg: 40, d: 0.78 }],
    info: 'Hier soll ein Stern ins Meer gefallen sein. Die Warte, die ihn bewachte, ist eingestürzt; ihre Splitter leuchten noch.',
  },
];

// ---------- Die 36 Inseln der Phase 4.5C (Ringe 2 bis 5) ----------
//
// Rohstoff-Minen für Kanonenstahl, Hartholz-Forste, Segeltuch-Manufakturen, Gewürz- und Wein-Kolonien, Leuchtturm-Atolle, Vorposten der Mächte in den
// Königs- und Kaiser-Meeren und drei weitere unkartierte Geheim-Inseln. Die Lage ist so gewählt, dass jede Insel den Platzbedarf der Welt einhält,
// 700 m von den Grenzlinien bleibt und die fünf Bauplätze der Kaiser-Zitadellen in Ring 5 frei lässt (tests/expandedOpenWorld.test.ts).

const FORST_HILLS = (r: number) => [{ x: -10, z: -20, r: r * 0.42, h: 0.18 }];

export const EXPANSION_ISLANDS: readonly ThemeIslandSpec[] = [
  // ----- England (Kuchenstück −36° … 36°) -----
  {
    id: 'eichenhain', name: 'Eichenhain', power: 'england', deg: 24, dist: 4750, r: 112, kind: 'harbor', biome: 'festland', label: 'Hartholz-Forst der Krone',
    shape: 'gelappt', grass: 0.9, villagers: 4, hills: FORST_HILLS(112),
    plots: [{ theme: 'forst', at: [-6, -30] }, { theme: 'hafen', deg: 210, d: 0.76 }, { theme: 'dorf', deg: 90, d: 0.6 }],
    info: 'Uralte Eichen bis an den Strand. Die Krone schlägt hier das Hartholz für ihre Fregatten und zahlt gut für Werkzeug und Tee.',
  },
  {
    id: 'webersund', name: 'Webersund', power: 'england', deg: -22, dist: 5600, r: 104, kind: 'harbor', biome: 'kreide', label: 'Segeltuch-Manufaktur der Krone',
    shape: 'lang', grass: 0.82, villagers: 5, hills: [{ x: 20, z: -34, r: 44, h: 0.2 }],
    plots: [{ theme: 'manufaktur', at: [0, -22] }, { theme: 'hafen', deg: 160, d: 0.76 }, { theme: 'plantage', deg: 300, d: 0.6, turn: 30 }],
    info: 'In langen Hallen weben sie das feste Segeltuch, das jede Fregatte der Krone trägt. Auf den Kreidehängen wächst der Flachs dafür.',
  },
  {
    id: 'zinnfels', name: 'Zinnfels', power: 'england', deg: 28, dist: 8200, r: 100, kind: 'harbor', biome: 'klippe', label: 'Erz- und Kanonenstahl-Mine',
    shape: 'gelappt', grass: 0.45, villagers: 4, hills: [{ x: 10, z: 6, r: 46, h: 0.38 }, { x: -34, z: -24, r: 26, h: 0.28 }],
    plots: [{ theme: 'mine', at: [-8, -30], turn: 180 }, { theme: 'hafen', deg: 220, d: 0.78 }, { theme: 'giesserei', deg: 310, d: 0.64 }],
    info: 'Ein Felsklotz voller Zinn- und Eisenadern. Die Stollen der Krone liefern Kanonenstahl für die Geschütze von Albion.',
  },
  {
    id: 'nordlichtatoll', name: 'Nordlicht-Atoll', power: 'england', deg: -20, dist: 11200, r: 80, kind: 'harbor', biome: 'atoll', label: 'Leuchtturm-Atoll der Königs-Meere',
    shape: 'sichel', grass: 0.36, villagers: 3,
    plots: [{ theme: 'leuchtfeuer', at: [0, 4] }, { theme: 'perlen', deg: 200, d: 0.72 }],
    info: 'Ein Ring aus Korallen und Sand, gekrönt von einem Leuchtfeuer, das die Einfahrt nach Albion weist. Die Wärter tauschen Perlen gegen Proviant.',
  },
  {
    id: 'kronwacht', name: 'Kronwacht', power: 'england', deg: 22, dist: 12300, r: 92, kind: 'camp', biome: 'kreide', label: 'Vorposten der Admiralität',
    shape: 'rund', grass: 0.7, villagers: 0, level: 19, hills: [{ x: 0, z: -8, r: 44, h: 0.26 }],
    plots: [{ theme: 'festung', at: [0, -10] }, { theme: 'batterie', deg: 60, d: 0.7 }, { theme: 'hafen', deg: 220, d: 0.8 }],
    info: 'Ein weißer Vorposten, der die Seewege nach Albion bewacht. Die Garnison hält jedes Segel für einen Feind.',
  },
  {
    id: 'sturmhorn', name: 'Sturmhorn', power: 'england', deg: -16, dist: 14000, r: 84, kind: 'harbor', biome: 'klippe', label: 'Leuchtfeuer an der Sturm-Barriere',
    shape: 'sichel', grass: 0.5, villagers: 3,
    plots: [{ theme: 'leuchtfeuer', at: [0, 4] }, { theme: 'wachturm', deg: 120, d: 0.6 }, { theme: 'hafen', deg: 220, d: 0.78 }],
    info: 'Das letzte Leuchtfeuer vor der Sturm-Barriere. Seine Wärter hören nachts das Donnern des Weltrands.',
  },
  {
    id: 'greifenhorst', name: 'Greifenhorst', power: 'england', deg: 20, dist: 13900, r: 96, kind: 'camp', biome: 'kreide', label: 'Bastion der Kaiser-Meere',
    shape: 'rund', grass: 0.68, villagers: 0, level: 24, hills: [{ x: 0, z: -10, r: 46, h: 0.28 }],
    plots: [{ theme: 'festung', at: [0, -12] }, { theme: 'batterie', deg: 0, d: 0.7 }, { theme: 'hafen', deg: 220, d: 0.8 }],
    info: 'Auf diesem Kreidefelsen hält die Krone ihre äußerste Bastion. Wer hier anlegt, hat sich mit der Elite der Royal Navy angelegt.',
  },
  // ----- Deutschland / Hanse (36° … 108°) -----
  {
    id: 'harzwald', name: 'Harzwald', power: 'deutschland', deg: 46, dist: 6200, r: 116, kind: 'harbor', biome: 'nord', label: 'Hartholz-Forst und Werft der Hanse',
    shape: 'lang', grass: 0.9, villagers: 5, hills: FORST_HILLS(116),
    plots: [{ theme: 'forst', at: [10, -28] }, { theme: 'werft', deg: 250, d: 0.76 }, { theme: 'hafen', deg: 190, d: 0.76 }],
    info: 'Kiefern und Eichen, so weit das Auge reicht. Das Harz duftet bis aufs Meer, und die Werft der Hanse verbaut jeden Stamm.',
  },
  {
    id: 'kohlenstieg', name: 'Kohlenstieg', power: 'deutschland', deg: 88, dist: 5000, r: 104, kind: 'harbor', biome: 'klippe', label: 'Kohle- und Stahlmine',
    shape: 'gelappt', grass: 0.42, villagers: 4, hills: [{ x: 10, z: 8, r: 48, h: 0.4 }],
    plots: [{ theme: 'mine', at: [-10, -30], turn: 180 }, { theme: 'giesserei', deg: 320, d: 0.64 }, { theme: 'hafen', deg: 240, d: 0.78 }],
    info: 'Schwarze Stollen, glühende Essen: aus Kohle und Erz wird hier Kanonenstahl für die Bastionen der Hanse.',
  },
  {
    id: 'seilerhafen', name: 'Seilerhafen', power: 'deutschland', deg: 46, dist: 8600, r: 108, kind: 'harbor', biome: 'nord', label: 'Seil- und Segeltuch-Manufaktur',
    shape: 'rund', grass: 0.84, villagers: 5, hills: [{ x: 20, z: -30, r: 40, h: 0.16 }],
    plots: [{ theme: 'manufaktur', at: [0, -20] }, { theme: 'hafen', deg: 230, d: 0.76 }, { theme: 'dorf', deg: 40, d: 0.6 }],
    info: 'Auf den Reeperbahnen drehen sie Taue, in den Hallen weben sie Segeltuch. Ohne Seilerhafen läge die halbe Hanse-Flotte still.',
  },
  {
    id: 'granitwacht', name: 'Granitwacht', power: 'deutschland', deg: 56, dist: 12200, r: 94, kind: 'camp', biome: 'klippe', label: 'Granit-Bastion vor Adlerstein',
    shape: 'rund', grass: 0.5, villagers: 0, level: 20, hills: [{ x: 0, z: 0, r: 44, h: 0.32 }],
    plots: [{ theme: 'festung', at: [0, -4] }, { theme: 'wachturm', deg: 60, d: 0.7 }, { theme: 'hafen', deg: 230, d: 0.8 }],
    info: 'Ein Klotz aus Granit mit Kasematten und Geschützen. Wer nach Adlerstein will, muss an der Granitwacht vorbei.',
  },
  {
    id: 'bakenriff', name: 'Bakenriff', power: 'deutschland', deg: 92, dist: 11200, r: 80, kind: 'harbor', biome: 'klippe', label: 'Leuchtfeuer der Hanse',
    shape: 'sichel', grass: 0.46, villagers: 3,
    plots: [{ theme: 'leuchtfeuer', at: [0, 4] }, { theme: 'hafen', deg: 220, d: 0.78 }],
    info: 'Eine Feuerbake auf einem Riffbogen. Die Lotsen der Hanse führen von hier die Geleitzüge durch die Königs-Meere.',
  },
  {
    id: 'eisgrat', name: 'Eisgrat', power: 'deutschland', deg: 52, dist: 14300, r: 98, kind: 'harbor', biome: 'nord', label: 'Erzgrat am Rand der Welt',
    shape: 'gelappt', grass: 0.5, villagers: 4, hills: [{ x: 8, z: -10, r: 46, h: 0.42 }],
    plots: [{ theme: 'mine', at: [8, -30], turn: 160 }, { theme: 'hafen', deg: 230, d: 0.78 }, { theme: 'wachturm', deg: 40, d: 0.7 }],
    info: 'Ein vereister Grat voller Erz, so nah an der Sturm-Barriere, dass die Gischt auf den Halden gefriert.',
  },
  {
    id: 'sturmbastei', name: 'Sturmbastei', power: 'deutschland', deg: 92, dist: 13800, r: 96, kind: 'camp', biome: 'nord', label: 'Kaiser-Bastei der Hanse',
    shape: 'rund', grass: 0.6, villagers: 0, level: 24, hills: [{ x: 0, z: -6, r: 44, h: 0.3 }],
    plots: [{ theme: 'festung', at: [0, -6] }, { theme: 'batterie', deg: 30, d: 0.7 }, { theme: 'hafen', deg: 330, d: 0.8 }],
    info: 'Die äußerste Bastei der Hanse, gebaut gegen Sturm und Feind. Ihre Geschütze reichen bis an den Weltrand.',
  },
  // ----- Kurogane (108° … 180°) -----
  {
    id: 'russhafen', name: 'Rußhafen', power: 'kurogane', deg: 118, dist: 4900, r: 106, kind: 'harbor', biome: 'glut', label: 'Stahlschmiede der Schwarzsegel',
    shape: 'gelappt', grass: 0.38, villagers: 4, hills: [{ x: 12, z: -8, r: 50, h: 0.42 }],
    plots: [{ theme: 'mine', at: [10, -32], turn: 160 }, { theme: 'giesserei', deg: 40, d: 0.64 }, { theme: 'hafen', deg: 300, d: 0.78 }],
    info: 'Ruß liegt auf jedem Dach. In den Essen Kuroganes wird Erz zu Kanonenstahl für die pechschwarzen Kriegsschiffe.',
  },
  {
    id: 'jadeterrassen', name: 'Jadeterrassen', power: 'kurogane', deg: 168, dist: 6000, r: 112, kind: 'harbor', biome: 'tropisch', label: 'Tee- und Gewürzterrassen',
    shape: 'gelappt', grass: 0.84, villagers: 6, hills: [{ x: 0, z: -10, r: 56, h: 0.2 }, { x: 0, z: -10, r: 32, h: 0.34 }],
    plots: [{ theme: 'plantage', at: [0, -24] }, { theme: 'plantage', at: [-34, 8], turn: 90 }, { theme: 'hafen', deg: 20, d: 0.76 }],
    info: 'Grüne Teeterrassen bis zum Gipfel, dazwischen Pfeffer und Ingwer. Selbst Kurogane braucht Händler – und Werkzeug.',
  },
  {
    id: 'rotlaternenriff', name: 'Rotlaternen-Riff', power: 'kurogane', deg: 170, dist: 9200, r: 86, kind: 'harbor', biome: 'glut', label: 'Signalfeuer der Schwarzsegel',
    shape: 'sichel', grass: 0.36, villagers: 3,
    plots: [{ theme: 'leuchtfeuer', at: [0, 4] }, { theme: 'wachturm', deg: 120, d: 0.6 }, { theme: 'hafen', deg: 300, d: 0.78 }],
    info: 'Rote Laternen auf schwarzem Fels: das Signalfeuer der Schwarzsegel. Wer es sieht, weiß, wessen Meer er befährt.',
  },
  {
    id: 'schwertfels', name: 'Schwertfels', power: 'kurogane', deg: 124, dist: 11300, r: 96, kind: 'camp', biome: 'glut', label: 'Klingen-Bastion',
    shape: 'rund', grass: 0.38, villagers: 0, level: 20, hills: [{ x: 0, z: -6, r: 44, h: 0.3 }],
    plots: [{ theme: 'festung', at: [0, -8] }, { theme: 'batterie', deg: 30, d: 0.7 }, { theme: 'hafen', deg: 330, d: 0.8 }],
    info: 'Ein Fels wie eine Klinge. Kuroganes Elite übt hier zwischen Lavaspalten und Geschützen.',
  },
  {
    id: 'mondsichelatoll', name: 'Mondsichel-Atoll', power: 'kurogane', deg: 124, dist: 14000, r: 80, kind: 'harbor', biome: 'atoll', label: 'Leuchtturm-Atoll am Weltrand',
    shape: 'sichel', grass: 0.34, villagers: 3,
    plots: [{ theme: 'leuchtfeuer', at: [0, 4] }, { theme: 'perlen', deg: 200, d: 0.72 }],
    info: 'Eine silberne Sichel im dunklen Meer. Das Leuchtfeuer brennt rot, und die Taucher holen schwarze Perlen aus der Tiefe.',
  },
  {
    id: 'drachenmaul', name: 'Drachenmaul', power: 'kurogane', deg: 166, dist: 13700, r: 98, kind: 'camp', biome: 'glut', label: 'Vulkan-Bastion der Kaiser-Meere',
    shape: 'gelappt', grass: 0.34, villagers: 0, level: 25, hills: [{ x: -10, z: 10, r: 46, h: 0.48 }],
    plots: [{ theme: 'festung', at: [0, -8] }, { theme: 'batterie', deg: 30, d: 0.7 }, { theme: 'hafen', deg: 330, d: 0.8 }],
    info: 'Ein feuerspeiender Krater mit einer Festung im Schlund. Hier wachen Kuroganes grimmigste Kriegsherren.',
  },
  // ----- Niederlande / Handelskompanie (180° … 252°) -----
  {
    id: 'muskatbucht', name: 'Muskatbucht', power: 'niederlande', deg: 244, dist: 5650, r: 114, kind: 'harbor', biome: 'tropisch', label: 'Gewürz-Kolonie',
    shape: 'gelappt', grass: 0.84, villagers: 6, hills: [{ x: 0, z: -10, r: 58, h: 0.2 }, { x: 0, z: -10, r: 32, h: 0.34 }],
    plots: [{ theme: 'plantage', at: [0, -24] }, { theme: 'plantage', at: [-34, 8], turn: 90 }, { theme: 'hafen', deg: 20, d: 0.76 }],
    info: 'Muskatbäume in langen Reihen und ein Hafen, der nach Zimt riecht. Die Kompanie bewacht jede Nuss wie Gold.',
  },
  {
    id: 'segelmacherhof', name: 'Segelmacherhof', power: 'niederlande', deg: 208, dist: 5200, r: 110, kind: 'harbor', biome: 'festland', label: 'Segeltuch-Manufaktur der Kompanie',
    shape: 'rund', grass: 0.86, villagers: 5, hills: [{ x: 26, z: -30, r: 40, h: 0.14 }],
    plots: [{ theme: 'manufaktur', at: [0, -20] }, { theme: 'hafen', deg: 60, d: 0.76 }, { theme: 'dorf', deg: 300, d: 0.6 }],
    info: 'Windmühlen treiben die Webstühle, und aus den Hallen rollt Segeltuch für die bauchigen Galleonen der Kompanie.',
  },
  {
    id: 'teakholm', name: 'Teakholm', power: 'niederlande', deg: 224, dist: 8600, r: 112, kind: 'harbor', biome: 'tropisch', label: 'Teakholz-Forst der Kompanie',
    shape: 'lang', grass: 0.86, villagers: 5, hills: FORST_HILLS(112),
    plots: [{ theme: 'forst', at: [0, -28] }, { theme: 'werft', deg: 30, d: 0.76 }, { theme: 'hafen', deg: 90, d: 0.76 }],
    info: 'Teak und Mahagoni, schwer und unverwüstlich. Die Kompanie lässt hier Stämme für ihre Werften schlagen.',
  },
  {
    id: 'zimtinsel', name: 'Zimtinsel', power: 'niederlande', deg: 246, dist: 9400, r: 100, kind: 'harbor', biome: 'tropisch', label: 'Zimt- und Pfefferkolonie',
    shape: 'gelappt', grass: 0.8, villagers: 5, hills: [{ x: 0, z: -14, r: 46, h: 0.2 }],
    plots: [{ theme: 'plantage', at: [0, -22] }, { theme: 'kontor', deg: 60, d: 0.74 }],
    info: 'Zimtrinde trocknet auf jedem Dach. Das Kontor kauft Werkzeug und Kanonenstahl, um die Plantage gegen Korsaren zu halten.',
  },
  {
    id: 'lotsenbake', name: 'Lotsenbake', power: 'niederlande', deg: 200, dist: 11300, r: 78, kind: 'harbor', biome: 'atoll', label: 'Leuchtturm-Atoll der Kompanie',
    shape: 'sichel', grass: 0.36, villagers: 3,
    plots: [{ theme: 'leuchtfeuer', at: [0, 4] }, { theme: 'perlen', deg: 200, d: 0.72 }],
    info: 'Die Lotsen der Kompanie warten hier auf Galleonen, die den Weg nach Oranjehaven suchen.',
  },
  {
    id: 'kapderstuerme', name: 'Kap der Stürme', power: 'niederlande', deg: 236, dist: 13800, r: 100, kind: 'camp', biome: 'klippe', label: 'Bollwerk der Kompanie',
    shape: 'gelappt', grass: 0.5, villagers: 0, level: 24, hills: [{ x: 0, z: -8, r: 46, h: 0.3 }],
    plots: [{ theme: 'festung', at: [0, -8] }, { theme: 'batterie', deg: 30, d: 0.7 }, { theme: 'hafen', deg: 330, d: 0.8 }],
    info: 'Am Kap brechen die Wellen der Sturm-Barriere. Die Kompanie hält hier ein Bollwerk, das kein Schiff ungefragt passiert.',
  },
  {
    id: 'perlenhorn', name: 'Perlenhorn', power: 'niederlande', deg: 198, dist: 14100, r: 82, kind: 'harbor', biome: 'atoll', label: 'Perlenfischer am Weltrand',
    shape: 'sichel', grass: 0.34, villagers: 3,
    plots: [{ theme: 'leuchtfeuer', at: [0, 4] }, { theme: 'perlen', deg: 200, d: 0.72 }],
    info: 'Die tiefsten Perlenbänke der Welt liegen hier. Die Taucher sagen, unten leuchte das Meer.',
  },
  // ----- Frankreich (252° … 324°) -----
  {
    id: 'clairvin', name: 'Clair-Vin', power: 'frankreich', deg: 270, dist: 4750, r: 110, kind: 'harbor', biome: 'weinland', label: 'Wein-Kolonie',
    shape: 'lang', grass: 0.84, villagers: 6, hills: [{ x: -10, z: -20, r: 50, h: 0.18 }],
    plots: [{ theme: 'weinberg', at: [-10, -24] }, { theme: 'hafen', deg: 150, d: 0.76 }, { theme: 'dorf', deg: 250, d: 0.6 }],
    info: 'Rebstöcke an sonnigen Hängen und Keller voller Fässer. Der Wein von Clair-Vin fließt an jeder Tafel der Armada.',
  },
  {
    id: 'voileblanche', name: 'Voile Blanche', power: 'frankreich', deg: 316, dist: 5900, r: 104, kind: 'harbor', biome: 'kreide', label: 'Segeltuch-Manufaktur der Armada',
    shape: 'rund', grass: 0.8, villagers: 5, hills: [{ x: 20, z: -30, r: 40, h: 0.18 }],
    plots: [{ theme: 'manufaktur', at: [0, -20] }, { theme: 'hafen', deg: 160, d: 0.76 }, { theme: 'dorf', deg: 40, d: 0.6 }],
    info: 'Weißes Tuch für königsblaue Segel: die Manufaktur färbt und webt für die ganze Armada Royale.',
  },
  {
    id: 'boisroyal', name: 'Bois-Royal', power: 'frankreich', deg: 262, dist: 8600, r: 112, kind: 'harbor', biome: 'festland', label: 'Hartholz-Forst der Armada',
    shape: 'gelappt', grass: 0.9, villagers: 5, hills: FORST_HILLS(112),
    plots: [{ theme: 'forst', at: [0, -28] }, { theme: 'werft', deg: 200, d: 0.76 }, { theme: 'hafen', deg: 140, d: 0.76 }],
    info: 'Der königliche Wald: jede Eiche ist gezählt und gehört der Armada. Ihre Stämme werden zu Kielen und Masten.',
  },
  {
    id: 'etoiledemer', name: 'Étoile-de-Mer', power: 'frankreich', deg: 310, dist: 11200, r: 78, kind: 'harbor', biome: 'atoll', label: 'Leuchtturm-Atoll der Armada',
    shape: 'sichel', grass: 0.36, villagers: 3,
    plots: [{ theme: 'leuchtfeuer', at: [0, 4] }, { theme: 'perlen', deg: 200, d: 0.72 }],
    info: 'Ein Atoll in Sternform mit einem vergoldeten Leuchtturm. Von hier aus segeln die Kuriere nach Soleilmont.',
  },
  {
    id: 'ferroir', name: 'Ferroir', power: 'frankreich', deg: 268, dist: 12300, r: 100, kind: 'harbor', biome: 'klippe', label: 'Stahl- und Waffenschmiede',
    shape: 'gelappt', grass: 0.44, villagers: 4, hills: [{ x: 10, z: 8, r: 46, h: 0.38 }],
    plots: [{ theme: 'mine', at: [-10, -30], turn: 180 }, { theme: 'giesserei', deg: 300, d: 0.64 }, { theme: 'hafen', deg: 220, d: 0.78 }],
    info: 'Eisen aus dem Fels, Klingen aus der Esse: Ferroir schmiedet Kanonenstahl und die feinsten Degen der Armada.',
  },
  {
    id: 'fortaurore', name: 'Fort Aurore', power: 'frankreich', deg: 304, dist: 13800, r: 98, kind: 'camp', biome: 'kreide', label: 'Morgenrot-Festung',
    shape: 'rund', grass: 0.7, villagers: 0, level: 24, hills: [{ x: 0, z: -8, r: 46, h: 0.24 }],
    plots: [{ theme: 'festung', at: [0, -10] }, { theme: 'batterie', deg: 90, d: 0.7 }, { theme: 'hafen', deg: 30, d: 0.8 }],
    info: 'Wenn die Sonne über der Sturm-Barriere aufgeht, glühen die Mauern von Fort Aurore golden. Seine Garnison schläft nie.',
  },
  // ----- Unkartiert (herrenlos, abseits der Routen in Ring 3 bis 5) -----
  {
    id: 'irrlichtbucht', name: 'Irrlichtbucht', power: null, deg: 314, dist: 9700, r: 72, kind: 'harbor', biome: 'atoll', label: 'Verborgene Schmugglerbucht',
    shape: 'sichel', grass: 0.34, villagers: 4, uncharted: true,
    plots: [{ theme: 'schwarzmarkt', deg: 200, d: 0.74 }, { theme: 'schatz', at: [0, -10] }],
    info: 'Irrlichter tanzen über einer Lagune, die auf keiner Karte steht. Wer hierher findet, handelt ohne Fragen.',
  },
  {
    id: 'ankerfriedhof', name: 'Ankerfriedhof', power: null, deg: 158, dist: 12600, r: 70, kind: 'ruin', biome: 'klippe', label: 'Friedhof der Anker',
    shape: 'gelappt', grass: 0.46, villagers: 0, uncharted: true, level: 21,
    plots: [{ theme: 'ruinen', at: [0, -6] }, { theme: 'schatz', deg: 120, d: 0.6 }, { theme: 'leuchtfeuer', deg: 220, d: 0.78 }],
    info: 'Hunderte rostige Anker ragen aus dem Fels, als hätte das Meer seine Toten hier abgelegt. Darunter soll ein Schatz liegen.',
  },
  {
    id: 'letzteslicht', name: 'Das Letzte Licht', power: null, deg: 200, dist: 15000, r: 68, kind: 'ruin', biome: 'klippe', label: 'Warte am Weltrand',
    shape: 'rund', grass: 0.44, villagers: 0, uncharted: true, level: 25, hills: [{ x: 0, z: 0, r: 30, h: 0.3 }],
    plots: [{ theme: 'ruinen', at: [-14, -10], turn: 40 }, { theme: 'schatz', at: [14, 8] }, { theme: 'leuchtfeuer', deg: 40, d: 0.78 }],
    info: 'Eine eingestürzte Warte direkt vor der Sturm-Barriere. Ihr Feuer brannte, bevor es Kaiser gab.',
  },
];

// ---------- Phase 4.5D: zwölf Inseln der Ringe 2 – 4 werden zu mittelgroßen Archipelen ----------
//
// Sieben Doppelinseln (ein Meeresarm teilt die Insel, zwei Holz- oder Steinbrücken verbinden die Hälften) und fünf Atolle mit Lagune (ein langer Steg
// führt über das Wasser). 380 – 540 m Durchmesser statt 140 – 230 m. Die Bauplätze wachsen mit (Abstände ab der Mitte mal Vergrößerung), die Lage des
// Meeresarms bzw. der Lagune wird so gedreht, dass kein Bauplatz im Wasser steht (tests/kaiserCitadels.test.ts).

export interface ArchipelSpec { r: number; form: 'doppel' | 'lagune'; plots?: PlotSpec[] }

export const ARCHIPELS: Record<string, ArchipelSpec> = {
  webersund: { r: 232, form: 'doppel' },
  harzwald: { r: 252, form: 'doppel' },
  seilerhafen: { r: 240, form: 'doppel' },
  jadeterrassen: { r: 246, form: 'doppel', plots: [{ theme: 'plantage', deg: 195, d: 0.55 }, { theme: 'plantage', deg: 245, d: 0.6, turn: 90 }, { theme: 'hafen', deg: 20, d: 0.76 }] },
  teakholm: { r: 250, form: 'doppel' },
  muskatbucht: { r: 240, form: 'doppel' },
  boisroyal: { r: 256, form: 'doppel' },
  nordlichtatoll: { r: 200, form: 'lagune', plots: [{ theme: 'leuchtfeuer', deg: 20, d: 0.8 }, { theme: 'perlen', deg: 200, d: 0.74 }] },
  rotlaternenriff: { r: 212, form: 'lagune', plots: [{ theme: 'leuchtfeuer', deg: 30, d: 0.8 }, { theme: 'wachturm', deg: 120, d: 0.72 }, { theme: 'hafen', deg: 300, d: 0.8 }] },
  lotsenbake: { r: 196, form: 'lagune', plots: [{ theme: 'leuchtfeuer', deg: 20, d: 0.8 }, { theme: 'perlen', deg: 200, d: 0.74 }] },
  etoiledemer: { r: 196, form: 'lagune', plots: [{ theme: 'leuchtfeuer', deg: 20, d: 0.8 }, { theme: 'perlen', deg: 200, d: 0.74 }] },
  irrlichtbucht: { r: 190, form: 'lagune', plots: [{ theme: 'schwarzmarkt', deg: 200, d: 0.76 }, { theme: 'schatz', deg: 20, d: 0.66 }] },
};

const BRIDGE_OF: Record<SiteBiome, 'holz' | 'stein'> = { festland: 'holz', tropisch: 'holz', nord: 'holz', atoll: 'holz', glut: 'stein', klippe: 'stein', kreide: 'stein', weinland: 'stein' };

/** Abstand eines Punkts von einer Strecke */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Meeresarm bzw. Lagune einer Archipel-Insel: Richtung so gedreht, dass alle Bauplätze möglichst weit vom Wasser liegen */
export function archipelRifts(spec: ThemeIslandSpec): NonNullable<ThemeIslandSpec['rifts']> {
  const coast = coastOf(spec);
  const centers = spec.plots.map((pl) => plotCenter(spec, pl, coast));
  const r = spec.r, lag = spec.archipel === 'lagune';
  const w = lag ? Math.round(r * 0.3) : Math.round(r * 0.12);
  const reach = lag ? r * 0.36 : r * 1.4;
  let best = 0, bestD = -Infinity;
  for (let a = 0; a < 180; a += 7.5) {
    const t = (a * Math.PI) / 180, ux = Math.sin(t), uz = Math.cos(t);
    let m = Infinity;
    for (const [x, z] of centers) m = Math.min(m, segDist(x, z, -ux * reach, -uz * reach, ux * reach, uz * reach));
    if (m > bestD + 0.5) { bestD = m; best = a; }
  }
  const t = (best * Math.PI) / 180, ux = Math.sin(t), uz = Math.cos(t), nx = uz, nz = -ux;
  const bend = lag ? r * 0.04 : r * 0.08 * (hash01(spec.id, 9) < 0.5 ? -1 : 1);
  const at = (k: number): [number, number] => [Math.round(ux * reach * k + nx * bend * (1 - k * k)), Math.round(uz * reach * k + nz * bend * (1 - k * k))];
  const pts = [-1, -0.5, 0, 0.5, 1].map(at);
  // Lagune: ein breites, geschlossenes Wasserbecken in der Mitte, ein Holzsteg quer hinüber
  if (lag) return [{ kind: 'sund', w, name: 'Lagune', bridge: 'holz', pts, crossAt: [at(0)] }];
  // Doppelinsel: ein leicht geschwungener Meeresarm von Küste zu Küste, zwei Brücken
  return [{ kind: 'sund', w, name: 'Meeresarm', bridge: BRIDGE_OF[spec.biome], pts, crossAt: [at(-0.22), at(0.22)] }];
}

/** Eine Themen-Insel zum Archipel ausbauen: größer, Bauplätze und Hügel wachsen mit, dazu Meeresarm oder Lagune */
function toArchipel(spec: ThemeIslandSpec, A: ArchipelSpec): ThemeIslandSpec {
  const k = A.r / spec.r;
  const plots = A.plots ?? spec.plots.map((p) => (p.at ? { ...p, at: [Math.round(p.at[0] * k), Math.round(p.at[1] * k)] as [number, number] } : p));
  const hills = spec.hills?.map((h) => ({ x: Math.round(h.x * k), z: Math.round(h.z * k), r: Math.round(h.r * k), h: h.h }));
  const out: ThemeIslandSpec = { ...spec, r: A.r, plots, hills, archipel: A.form, villagers: spec.villagers + 2 };
  out.rifts = archipelRifts(out);
  return out;
}

/** Alle Themen-Inseln (4.3B und 4.5C; zwölf davon seit 4.5D als Archipel) */
export const THEME_ISLANDS: readonly ThemeIslandSpec[] = [...THEME_ISLANDS_43B, ...EXPANSION_ISLANDS.map((s) => (ARCHIPELS[s.id] ? toArchipel(s, ARCHIPELS[s.id]) : s))];

// ---------- Siedlungen aus Bausteinen ----------

export const S = (t: StructureType, x: number, z: number, yaw = 0, len?: number): StructureDef => ({ t, x, z, yaw, len });

/** Wohnhaus je Biom */
export const HOME: Record<SiteBiome, StructureType> = {
  festland: 'fachwerkhaus', tropisch: 'kolonialhaus', klippe: 'steinhaus', nord: 'fachwerkhaus', glut: 'steinhaus', kreide: 'steinhaus', atoll: 'stelzenhuette', weinland: 'kolonialhaus',
};

/** Mauerring mit Tor (vorn, +z): fünf Mauerstücke, wie `pen` in data/settlements.ts */
function ring(t: 'zinnenmauer' | 'mauer', cx: number, cz: number, w: number, d: number): StructureDef[] {
  const g = 3;
  return [
    S(t, cx, cz - d / 2, 0, w), S(t, cx - w / 2, cz, 90, d), S(t, cx + w / 2, cz, 90, d),
    S(t, cx - (w / 4 + g / 4), cz + d / 2, 0, w / 2 - g / 2), S(t, cx + (w / 4 + g / 4), cz + d / 2, 0, w / 2 - g / 2),
  ];
}

/** Bauten eines Bausteins im Siedlungsraster (+z = vorn, zur Küste) und der Freiraum, den er braucht */
export function themeItems(theme: Theme, b: SiteBiome): { items: StructureDef[]; clear: number } {
  const H = HOME[b];
  switch (theme) {
    case 'hafen': return { clear: 30, items: [
      S('steg', 0, 0, 0, 30), S('lagerhaus', -12, -9, 0), S('lagerhaus', 13, -10, 0), S('kran', -5, 5, 0),
      S('marktstand', -4, -19, 0), S('marktstand', 6, -19, 0), S('kisten', 7, 4, 20), S('faesser', -9, 3, 0), S('fass', 9.5, 7),
      S('laterne', -3, 8, 0), S('laterne', 4, 10, 0), S(H, -18, -26, 30), S(H, 18, -27, -30), S('brunnen', 1, -26),
    ] };
    case 'werft': return { clear: 28, items: [
      S('steg', -8, 0, 0, 30), S('steg', 9, 0, 0, 30), S('kran', -3, 3, 0), S('kran', 4, 3, 0), S('lagerhaus', 0, -15, 0),
      S('boot', -15, 5, 80), S('boot', 15, 6, 100), S('kisten', -6, -6, 10), S('faesser', 7, -6, 0), S('holzhuette', -17, -15, 30),
      S('laterne', 1, 7, 0), S('fass', -10, -3),
    ] };
    case 'kontor': return { clear: 34, items: [
      S('steg', -6, 0, 0, 32), S('steg', 10, 0, 0, 28), S('lagerhaus', -16, -10, 0), S('lagerhaus', 0, -12, 0), S('lagerhaus', 16, -10, 0),
      S('kran', -2, 4, 0), S('kran', 14, 3, 0), S('marktstand', -8, -24, 0), S('marktstand', 2, -24, 0), S('marktstand', 12, -24, 0),
      S(H, -22, -32, 30), S(H, -8, -36, 0), S(H, 8, -36, 0), S(H, 22, -32, -30), S('brunnen', 2, -30),
      S('laterne', -4, 8, 0), S('laterne', 6, 8, 0), S('laterne', -14, -20, 0), S('laterne', 16, -20, 0), S('kisten', 6, 4, 10), S('faesser', -11, 3, 0),
    ] };
    case 'plantage': return { clear: 24, items: [
      S('feld', 0, -2, 0, 18), S('feld', 0, -9, 0, 18), S('feld', 0, -16, 0, 18), S('feld', 0, -23, 0, 16),
      S('scheune', -16, -12, 90), S(H, 16, -10, -90), S('heu', -14, 2), S('faesser', 12, 3, 0), S('laterne', 0, 5, 0),
    ] };
    case 'weinberg': return { clear: 26, items: [
      S('feld', -9, -2, 0, 14), S('feld', 9, -2, 0, 14), S('feld', -9, -9, 0, 14), S('feld', 9, -9, 0, 14), S('feld', -9, -16, 0, 14), S('feld', 9, -16, 0, 14),
      S('gasthaus', 0, -30, 0), S(H, -20, -26, 30), S('faesser', 9, -26, 0), S('fass', 13, -23), S('laterne', 0, -21, 0),
    ] };
    case 'parfum': return { clear: 24, items: [
      S('feld', -8, 0, 0, 12), S('feld', 8, 0, 0, 12), S('feld', -8, -7, 0, 12), S('feld', 8, -7, 0, 12),
      S(H, -14, -20, 30), S(H, 14, -20, -30), S('marktstand', 0, -16, 0), S('brunnen', 0, -24), S('laterne', 4, -12, 0), S('faesser', -5, -14, 0),
    ] };
    case 'mine': return { clear: 22, items: [
      S('steinturm', 0, -10), S('ruine', -12, -14, 20), S('kisten', 6, -2, 10), S('kisten', 9, -5, -20), S('faesser', -6, -2, 0),
      S('feuer', 2, 4), S('feuer', -10, 2), S('holzhuette', 15, -15, -40), S('holzhuette', -18, -2, 60), S('zaun', 0, 8, 0, 14), S('laterne', 4, 6, 0),
    ] };
    case 'giesserei': return { clear: 24, items: [
      S('lagerhaus', 0, -10, 0), S('steinhaus', -14, -6, 30), S('steinhaus', 14, -6, -30), S('feuer', -4, 2), S('feuer', 4, 2), S('feuer', 0, -21),
      S('kisten', -8, 6, 0), S('faesser', 8, 6, 0), S('kran', 10, -19, 0), S('laterne', 0, 8, 0),
    ] };
    case 'batterie': return { clear: 18, items: [
      S('zinnenmauer', 0, 3, 0, 18), S('zinnenturm', -11, 1), S('zinnenturm', 11, 1), S('kisten', -5, -5, 0), S('faesser', 5, -5, 0),
      S('fass', -2, -8), S('feuer', 0, -7), S('laterne', -8, -3, 0),
    ] };
    case 'festung': return { clear: 26, items: [
      ...ring('zinnenmauer', 0, -2, 30, 26), S('torhaus', 0, 11, 0), S('zinnenturm', -15, -15), S('zinnenturm', 15, -15), S('zinnenturm', -15, 11), S('zinnenturm', 15, 11),
      S('bergfried', 0, -6), S('kapelle', -9, -10, 90), S('kisten', 8, 2, 0), S('faesser', -7, 3, 0), S('laterne', 3, 7, 0), S('laterne', -3, 7, 0),
    ] };
    case 'wachturm': return { clear: 14, items: [
      S('wachturm', 0, 0), S('mauer', -6, 4, 30, 8), S('feuer', 4, 4), S('kisten', -4, -4, 0), S('laterne', 2, 6, 0), S('fass', 5, -3),
    ] };
    case 'leuchtfeuer': return { clear: 14, items: [
      S('leuchtturm', 0, 0), S('holzhuette', -9, -6, 30), S('kisten', 6, 3, 0), S('fass', 7, -2), S('laterne', -3, 6, 0), S('steg', 0, 6, 0, 20),
    ] };
    case 'schwarzmarkt': return { clear: 26, items: [
      S('steg', 0, 0, 0, 28), S('stelzenhuette', -13, -4, 25), S('stelzenhuette', 13, -5, -25), S('stelzenhuette', 0, -16, 0),
      S('marktstand', -5, -5, 10), S('marktstand', 5, -5, -10), S('marktstand', -9, -14, 30), S('feuer', 0, -7),
      S('boot', -11, 8, 80), S('boot', 11, 9, 100), S('netz', -16, 6, 20), S('kisten', -6, 5, 0), S('kisten', 7, 4, 30), S('faesser', 3, -11, 0),
      S('laterne', -3, 6, 0), S('laterne', 4, -12, 0),
    ] };
    case 'perlen': return { clear: 24, items: [
      S('steg', 0, 0, 0, 24), S('stelzenhuette', -14, -3, 25), S('stelzenhuette', -5, -9, 8), S('stelzenhuette', 6, -9, -10), S('stelzenhuette', 15, -2, -28),
      S('boot', -9, 9, 80), S('boot', 9, 10, 100), S('boot', 15, 6, 120), S('netz', -16, 8, 20), S('netz', 17, 9, -25),
      S('marktstand', 0, -16, 0), S('feuer', 0, -3), S('laterne', -6, 5, 0), S('laterne', 7, 5, 0),
    ] };
    case 'dorf': return { clear: 22, items: [
      S(H, -10, -4, 30), S(H, 10, -5, -30), S(H, 0, -16, 0), S('brunnen', 0, -4), S('feuer', -4, 6), S('laterne', 4, 5, 0), S('laterne', -6, -12, 0), S('heu', 14, 6),
    ] };
    case 'ruinen': return { clear: 20, items: [
      S('ruine', 0, 0, 0), S('ruinenbogen', 0, 11, 0), S('saeulen', -10, 2, 0), S('saeulen', 10, -3, 90), S('saeulen', -6, -10, 30),
      S('mauer', -9, -12, 12, 9), S('mauer', 10, 10, 80, 7),
    ] };
    case 'schatz': return { clear: 12, items: [S('ruine', 0, 0, 0), S('saeulen', 7, 3, 45), S('kisten', -5, 4, 0), S('kisten', -3, 6.5, 30), S('feuer', 3, 6), S('fass', 6, -4)] };
    // Holzfäller-Lager: Sägemühle (Scheune), Hütten der Holzfäller, Stammkran, Holzstapel (Kisten), Zaun ums Lager
    case 'forst': return { clear: 24, items: [
      S('scheune', 0, -9, 0), S('holzhuette', -14, -3, 30), S('holzhuette', 14, -4, -30), S('kran', 6, 4, 0),
      S('kisten', -6, 4, 0), S('kisten', -9.5, 6, 30), S('kisten', 11, 6, -20), S('faesser', 10, -14, 0), S('feuer', -2, 6), S('laterne', 2, 8, 0),
      S('zaun', 0, -19, 0, 20), S('heu', -16, -13),
    ] };
    // Segeltuch-Manufaktur: zwei Webhallen (Lagerhäuser), Färberei (Steinhaus), Flachsfelder zur Küste, Stände für die Tuchballen
    case 'manufaktur': return { clear: 28, items: [
      S('lagerhaus', -10, -8, 0), S('lagerhaus', 10, -8, 0), S('steinhaus', 0, -22, 0), S('feld', -10, 6, 0, 12), S('feld', 10, 6, 0, 12),
      S('marktstand', -4, -16, 0), S('marktstand', 5, -16, 0), S('kisten', -17, -2, 10), S('faesser', 17, -2, 0), S('brunnen', 0, -13),
      S('laterne', -4, 10, 0), S('laterne', 5, 10, 0),
    ] };
  }
}

/** Gewachsenes je Biom: Bäume in Hainen, Büsche, Gras, Blumen, Felsen */
export function scatterOf(b: SiteBiome): ScatterLayer[] {
  switch (b) {
    case 'kreide': return [
      { flora: 'laubbaum', perHa: 14, zone: [0.08, 0.8], size: [0.75, 1.2], grove: [40, 0.55], space: 2.6 },
      { flora: 'busch', perHa: 30, zone: [0.05, 0.86], size: [0.7, 1.3], grove: [30, 0.45], space: 1.3 },
      { flora: 'gras', perHa: 420, zone: [0.02, 0.8], size: [0.7, 1.4], space: 0.3 },
      { flora: 'halme', perHa: 70, zone: [0.6, 0.95], size: [0.7, 1.3], grove: [20, 0.5], space: 0.4 },
      { flora: 'blume', perHa: 80, zone: [0.03, 0.78], size: [0.8, 1.3], grove: [20, 0.55], space: 0.3 },
      { flora: 'fels', perHa: 14, zone: [0.3, 1.08], size: [0.8, 2.4], space: 2 },
      { flora: 'fels', perHa: 8, zone: [0.15, 0.8], size: [0.5, 1.4], slope: true, space: 1.6 },
    ];
    case 'atoll': return [
      { flora: 'palme', perHa: 80, zone: [0.25, 0.95], size: [0.8, 1.35], grove: [28, 0.38], space: 2.2 },
      { flora: 'busch', perHa: 40, zone: [0.05, 0.66], size: [0.7, 1.3], grove: [24, 0.42], space: 1.3 },
      { flora: 'farn', perHa: 60, zone: [0.05, 0.6], size: [0.8, 1.4], grove: [22, 0.42], space: 0.8 },
      { flora: 'gras', perHa: 260, zone: [0.02, 0.42], size: [0.7, 1.2], space: 0.3 },
      { flora: 'halme', perHa: 90, zone: [0.6, 0.92], size: [0.7, 1.2], grove: [16, 0.5], space: 0.4 },
      { flora: 'blume', perHa: 90, zone: [0.03, 0.42], size: [0.9, 1.4], grove: [18, 0.5], space: 0.3 },
      { flora: 'fels', perHa: 12, zone: [0.6, 1.08], size: [0.6, 1.6], space: 2 },
    ];
    case 'weinland': return [
      { flora: 'laubbaum', perHa: 10, zone: [0.08, 0.84], size: [0.7, 1.1], grove: [36, 0.55], space: 2.6 },
      { flora: 'busch', perHa: 40, zone: [0.05, 0.86], size: [0.7, 1.3], grove: [26, 0.45], space: 1.3 },
      { flora: 'gras', perHa: 440, zone: [0.02, 0.8], size: [0.7, 1.4], space: 0.3 },
      { flora: 'halme', perHa: 90, zone: [0.04, 0.92], size: [0.8, 1.4], grove: [22, 0.5], space: 0.4 },
      { flora: 'blume', perHa: 120, zone: [0.03, 0.8], size: [0.8, 1.3], grove: [18, 0.5], space: 0.3 },
      { flora: 'fels', perHa: 12, zone: [0.2, 1.06], size: [0.6, 1.8], space: 2 },
    ];
    case 'nord': return [
      { flora: 'windkiefer', perHa: 40, zone: [0.08, 0.86], size: [0.8, 1.3], grove: [34, 0.46], space: 2.4 },
      { flora: 'birke', perHa: 12, zone: [0.1, 0.86], size: [0.8, 1.2], grove: [30, 0.6], space: 2.2 },
      { flora: 'busch', perHa: 30, zone: [0.05, 0.86], size: [0.7, 1.3], space: 1.3 },
      { flora: 'farn', perHa: 40, zone: [0.05, 0.8], size: [0.7, 1.3], grove: [30, 0.5], space: 0.9 },
      { flora: 'gras', perHa: 360, zone: [0.02, 0.78], size: [0.7, 1.4], space: 0.3 },
      { flora: 'halme', perHa: 70, zone: [0.6, 0.95], size: [0.7, 1.3], grove: [20, 0.5], space: 0.4 },
      { flora: 'fels', perHa: 16, zone: [0.2, 1.08], size: [0.6, 2], space: 2 },
    ];
    case 'glut': return [
      { flora: 'basalt', perHa: 34, zone: [0.7, 1.07], size: [0.8, 1.6], grove: [22, 0.36], space: 2.4 },
      { flora: 'basaltblock', perHa: 30, zone: [0.1, 1.04], size: [0.6, 1.5], space: 1.5 },
      { flora: 'windkiefer', perHa: 10, zone: [0.1, 0.8], size: [0.7, 1.1], grove: [26, 0.55], space: 2.4 },
      { flora: 'busch', perHa: 14, zone: [0.05, 0.8], size: [0.6, 1.1], space: 1.3 },
      { flora: 'gras', perHa: 160, zone: [0.02, 0.6], size: [0.6, 1.2], space: 0.3 },
      { flora: 'halme', perHa: 90, zone: [0.05, 0.86], size: [0.8, 1.4], grove: [20, 0.45], space: 0.4 },
      { flora: 'fels', perHa: 22, zone: [0.3, 1.1], size: [0.7, 2.2], space: 2 },
    ];
    case 'tropisch': return [
      { flora: 'palme', perHa: 70, zone: [0.25, 0.94], size: [0.8, 1.35], grove: [32, 0.38], space: 2.2 },
      { flora: 'banane', perHa: 14, zone: [0.1, 0.7], size: [0.8, 1.2], grove: [26, 0.5], space: 2 },
      { flora: 'busch', perHa: 40, zone: [0.05, 0.7], size: [0.7, 1.4], grove: [28, 0.42], space: 1.3 },
      { flora: 'farn', perHa: 80, zone: [0.05, 0.72], size: [0.8, 1.5], grove: [24, 0.42], space: 0.8 },
      { flora: 'gras', perHa: 340, zone: [0.02, 0.5], size: [0.7, 1.3], space: 0.3 },
      { flora: 'blume', perHa: 120, zone: [0.03, 0.5], size: [0.9, 1.5], grove: [20, 0.5], space: 0.3 },
      { flora: 'fels', perHa: 10, zone: [0.5, 1.08], size: [0.6, 1.8], space: 2 },
    ];
    case 'klippe': return [
      { flora: 'basalt', perHa: 40, zone: [0.72, 1.07], size: [0.8, 1.6], grove: [22, 0.34], space: 2.4 },
      { flora: 'basaltblock', perHa: 50, zone: [0.1, 1.05], size: [0.6, 1.5], space: 1.5 },
      { flora: 'windkiefer', perHa: 24, zone: [0.1, 0.84], size: [0.8, 1.3], grove: [26, 0.5], space: 2.4 },
      { flora: 'busch', perHa: 24, zone: [0.05, 0.8], size: [0.6, 1.1], space: 1.3 },
      { flora: 'gras', perHa: 260, zone: [0.02, 0.5], size: [0.7, 1.4], space: 0.3 },
      { flora: 'halme', perHa: 100, zone: [0.05, 0.86], size: [0.8, 1.5], grove: [20, 0.45], space: 0.4 },
      { flora: 'fels', perHa: 22, zone: [0.3, 1.1], size: [0.7, 2.4], space: 2 },
    ];
    default: return [
      { flora: 'laubbaum', perHa: 24, zone: [0.06, 0.86], size: [0.75, 1.25], grove: [50, 0.5], space: 2.6 },
      { flora: 'birke', perHa: 8, zone: [0.1, 0.88], size: [0.8, 1.3], grove: [40, 0.62], space: 2.2 },
      { flora: 'busch', perHa: 22, zone: [0.04, 0.9], size: [0.7, 1.5], grove: [50, 0.42], space: 1.4 },
      { flora: 'farn', perHa: 22, zone: [0.05, 0.86], size: [0.7, 1.3], grove: [50, 0.52], space: 0.9 },
      { flora: 'gras', perHa: 460, zone: [0.02, 0.8], size: [0.7, 1.5], space: 0.3 },
      { flora: 'halme', perHa: 50, zone: [0.6, 0.95], size: [0.7, 1.2], grove: [26, 0.5], space: 0.4 },
      { flora: 'blume', perHa: 70, zone: [0.03, 0.8], size: [0.8, 1.3], grove: [28, 0.6], space: 0.3 },
      { flora: 'fels', perHa: 6, zone: [0.1, 1.06], size: [0.6, 2.2], space: 2 },
    ];
  }
}

/** Kleine Zahl 0 … 1 aus einer Kennung (FNV), für Phasen der Küstenlinie */
export function hash01(id: string, k: number): number {
  let h = 2166136261 ^ k;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Küstenlinie aus der Form und der Kennung (gleich bei jedem Start) */
export function coastOf(spec: Pick<ThemeIslandSpec, 'id' | 'shape'>): SiteDef['coast'] {
  const p = (k: number) => hash01(spec.id, k) * Math.PI * 2;
  const base = [{ a: 0.03, f: 7, p: p(1) }, { a: 0.014, f: 13, p: p(2) }];
  switch (spec.shape) {
    case 'lang': return [...base, { a: 0.14, f: 2, p: p(3) }, { a: 0.04, f: 3, p: p(4) }];
    case 'gelappt': return [...base, { a: 0.09, f: 3, p: p(3) }, { a: 0.05, f: 5, p: p(4) }];
    case 'sichel': return [...base, { a: 0.14, f: 1, p: p(3) }, { a: 0.06, f: 2, p: p(4) }];
    default: return [...base, { a: 0.05, f: 4, p: p(3) }];
  }
}

function coastFactor(coast: SiteDef['coast'], a: number): number { let k = 1; for (const w of coast) k += w.a * Math.sin(w.f * a + w.p); return k; }

/** Mittelpunkt eines Bauplatzes in Metern ab Inselmitte (gleiche Rechnung wie world/settlement.ts) */
export function plotCenter(spec: ThemeIslandSpec, plot: PlotSpec, coast: SiteDef['coast']): [number, number] {
  if (plot.at) return plot.at;
  const th = ((plot.deg ?? 0) * Math.PI) / 180;
  const e = spec.r * coastFactor(coast, Math.atan2(Math.cos(th), Math.sin(th))) * (plot.d ?? 0.7);
  return [Math.sin(th) * e, Math.cos(th) * e];
}

/** Die Siedlungsdaten einer Themen-Insel: Küste, Hügel, Bauplätze, Wege vom ersten Steg-Platz zu jedem anderen, Bewuchs */
export function themeSite(spec: ThemeIslandSpec): SiteDef {
  const coast = coastOf(spec);
  const clusters: ClusterDef[] = spec.plots.map((pl, i) => {
    const t = themeItems(pl.theme, spec.biome);
    return { name: `${spec.name} · ${pl.theme}`, ...(pl.at ? { at: pl.at } : { deg: pl.deg ?? 0, d: pl.d ?? 0.7 }), turn: pl.turn, clear: t.clear * (i === 0 ? 1 : 0.9), items: t.items };
  });
  // Wege: vom Platz mit Steg (sonst vom ersten) über die Inselmitte zu jedem weiteren Platz
  const centers = spec.plots.map((pl) => plotCenter(spec, pl, coast));
  const hub = Math.max(0, spec.plots.findIndex((pl) => ['hafen', 'werft', 'kontor', 'schwarzmarkt', 'perlen'].includes(pl.theme)));
  const roads: SiteDef['roads'] = [];
  const [hx, hz] = centers[hub];
  centers.forEach(([x, z], i) => {
    if (i === hub) return;
    const mx = (hx + x) * 0.35, mz = (hz + z) * 0.35;
    // Archipel (4.5D): kreuzt der Weg den Meeresarm oder die Lagune, führt er über die nächste Brücke
    const via = spec.rifts ? crossingFor([hx * 0.86, hz * 0.86], [x * 0.92, z * 0.92], spec.rifts) : null;
    roads.push({ w: i === 1 ? 3.2 : 2.6, pts: via ? [[hx * 0.86, hz * 0.86], via, [x * 0.92, z * 0.92]] : [[hx * 0.86, hz * 0.86], [mx, mz], [x * 0.92, z * 0.92]] });
  });
  return {
    label: spec.label,
    coast,
    hills: spec.hills ?? [{ x: 0, z: 0, r: spec.r * 0.4, h: 0.12 }],
    grass: spec.grass,
    clusters,
    roads,
    ...(spec.rifts ? { rifts: spec.rifts.map((rf) => ({ kind: rf.kind, w: rf.w, pts: rf.pts, cross: rf.crossAt.map((c) => tAlong(rf.pts, c)), bridge: rf.bridge, name: rf.name })) } : {}),
    scatter: scatterOf(spec.biome),
    villagers: spec.villagers,
    themed: true,
  };
}

/** Schneiden sich die Strecken A–B und C–D? */
const segCross = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean => {
  const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
};

/** Kreuzt die Strecke A → B eine Spalte, dann die nächste Brücke dieser Spalte (sonst null) */
function crossingFor(a: [number, number], b: [number, number], rifts: NonNullable<ThemeIslandSpec['rifts']>): [number, number] | null {
  let best: [number, number] | null = null, bd = Infinity;
  for (const r of rifts) {
    let hit = false;
    for (let i = 1; i < r.pts.length && !hit; i++) if (segCross(a[0], a[1], b[0], b[1], r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1])) hit = true;
    if (!hit) continue;
    for (const c of r.crossAt) { const d = Math.hypot(c[0] - (a[0] + b[0]) / 2, c[1] - (a[1] + b[1]) / 2); if (d < bd) { bd = d; best = c; } }
  }
  return best;
}

/** Anteil der Länge eines Linienzugs am nächsten Punkt zu `c` (wie `polylineT` in data/megaIslands.ts) */
function tAlong(pts: readonly [number, number][], c: [number, number]): number {
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

/** Alle Siedlungen der Themen-Inseln (Schlüssel = Insel-Kennung) */
export const THEME_SITES: Record<string, SiteDef> = Object.fromEntries(THEME_ISLANDS.map((s) => [s.id, themeSite(s)]));

/** Die Themen-Inseln als Insel-Definitionen (Lage in fertigen Weltkoordinaten) */
export function themeIslandDefs(): IslandDef[] {
  return THEME_ISLANDS.map((s) => {
    const a = (s.deg * Math.PI) / 180;
    return {
      // `+ 0` macht aus −0 eine 0 (sonst überlebt der Blueprint den JSON-Rundlauf nicht)
      id: s.id, name: s.name, x: Math.round(Math.sin(a) * s.dist) + 0, z: Math.round(Math.cos(a) * s.dist) + 0, r: s.r, hill: 0.15, kind: s.kind, palms: 0, rocks: 0,
      level: s.level, info: s.info, biome: s.biome, site: s.id, placed: true, uncharted: s.uncharted, themePower: s.power,
    };
  });
}
