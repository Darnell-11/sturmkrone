// Handgemachte Regionen: die Bernsteinsee in der Mitte, fünf weitere Meere im Ring bis zum Weltrand.

export type IslandKind = 'town' | 'harbor' | 'camp' | 'ruin' | 'quiet' | 'treasure' | 'lighthouse' | 'boss';
/** Aussehen der Inseln einer Region */
export type IslandStyle = 'tropisch' | 'nebel' | 'nord' | 'glut' | 'sturm' | 'schlund';

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
  /** Name des Bosses (Boss-Inseln) */
  boss?: string;
  /** Region (wird beim Aufbau gesetzt) */
  region?: string;
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
  /** Einleitung beim ersten Besuch */
  desc?: string;
  style?: IslandStyle;
  /** Wetter, das hier vorherrscht */
  weather?: 'klar' | 'bewoelkt' | 'nebel' | 'regen' | 'sturm';
  /** Musikstück auf See */
  song?: 'sea' | 'night' | 'north' | 'ember' | 'storm' | 'abyss';
  /** Empfohlene Stufe */
  level?: number;
  /** Winkelbereich im Ring (Grad, 0 = Norden) */
  arc?: [number, number];
}

export const BERNSTEINSEE: RegionDef = {
  id: 'bernsteinsee',
  name: 'Bernsteinsee',
  x: 0, z: 150, r: 950,
  color: '#E8B33A',
  desc: 'Tropisches Startmeer mit der Hafenstadt Ankerglück.',
  style: 'tropisch', song: 'sea', level: 1,
  islands: [
    { id: 'ankerglueck', name: 'Ankerglück', x: 0, z: 160, r: 78, hill: 0.12, kind: 'town', palms: 14, info: 'Hafenstadt der Bernsteinsee: Taverne, Werft, Schmiede, Markt und Faji-Schrein.' },
    { id: 'muschelruh', name: 'Muschelruh', x: -260, z: 40, r: 30, hill: 0.2, kind: 'treasure', palms: 5, info: 'Ruhige Muschelinsel. Man munkelt von vergrabenem Gold.' },
    { id: 'kraehenfels', name: 'Krähenfels', x: 320, z: 260, r: 34, hill: 0.25, kind: 'camp', palms: 3, rocks: 3, level: 1, info: 'Ein Lager von Halsabschneidern hat sich hier eingenistet.' },
    { id: 'moewennest', name: 'Möwennest', x: -160, z: 420, r: 26, hill: 0.3, kind: 'quiet', palms: 4, info: 'Hunderte Möwen nisten auf den Klippen.' },
    { id: 'leuchtfeuer', name: 'Leuchtfeuer', x: 180, z: -160, r: 24, hill: 0.15, kind: 'lighthouse', palms: 2, info: 'Der alte Leuchtturm weist Schiffen den Weg nach Ankerglück.' },
    { id: 'rabenriff', name: 'Rabenriff', x: -480, z: -220, r: 38, hill: 0.22, kind: 'camp', palms: 4, rocks: 2, level: 2, info: 'Schwer bewachtes Lager am Riff.' },
    { id: 'bernsteinbucht', name: 'Bernsteinbucht', x: 520, z: -40, r: 44, hill: 0.18, kind: 'camp', palms: 6, level: 3, info: 'Ein Hauptmann hält die Bucht besetzt.' },
    { id: 'sonnenstrand', name: 'Sonnenstrand', x: 60, z: 560, r: 32, hill: 0.12, kind: 'quiet', palms: 8, info: 'Der schönste Strand der Bernsteinsee. Schildkröten legen hier ihre Eier.' },
    { id: 'sturmzahn', name: 'Sturmzahn', x: -620, z: 380, r: 46, hill: 0.28, kind: 'boss', palms: 3, rocks: 4, level: 5, info: 'Hier herrscht eine Legende der Bernsteinsee.', boss: 'Grimmbart, der Herr von Sturmzahn' },
  ],
};

/** Insel im Ring: Winkel (Grad, 0 = Norden) und Abstand vom Weltmittelpunkt */
function ring(id: string, name: string, deg: number, dist: number, r: number, kind: IslandKind, info: string, o: Partial<IslandDef> = {}): IslandDef {
  const a = (deg * Math.PI) / 180;
  return { id, name, x: Math.round(Math.sin(a) * dist), z: Math.round(Math.cos(a) * dist), r, hill: 0.2, kind, palms: 4, info, ...o };
}

export const NEBELARCHIPEL: RegionDef = {
  id: 'nebel', name: 'Nebelarchipel', x: 0, z: 1450, r: 500, color: '#9FB4A8', arc: [-36, 36],
  desc: 'Ewiger Nebel, versunkene Ruinen – und nachts segeln hier Geisterschiffe.',
  style: 'nebel', weather: 'nebel', song: 'night', level: 4,
  islands: [
    ring('nebelhafen', 'Nebelhafen', -10, 1170, 40, 'harbor', 'Ein Fischerdorf auf Stelzen. Laternen gegen den Nebel.', { hill: 0.12, palms: 3 }),
    ring('graueklippe', 'Graue Klippe', 16, 1360, 34, 'camp', 'Schmuggler verstecken sich im Nebel.', { level: 5, rocks: 3 }),
    ring('versunkenertempel', 'Versunkener Tempel', -24, 1500, 38, 'ruin', 'Uralte Säulen ragen aus dem Wasser. Faji-Wirker hüten etwas.', { level: 6, rocks: 4 }),
    ring('seufzerinsel', 'Seufzerinsel', 28, 1610, 28, 'quiet', 'Der Wind seufzt hier wie ein Mensch.'),
    ring('geisterriff', 'Geisterriff', 2, 1740, 44, 'boss', 'Ein Wrack auf dem Riff. Sein Kapitän ist nie gegangen.', { level: 7, rocks: 5, boss: 'Kapitän Moderherz' }),
  ],
};

export const NORDWACHT: RegionDef = {
  id: 'nord', name: 'Nordwacht', x: 1380, z: 450, r: 500, color: '#7FA8C8', arc: [36, 108],
  desc: 'Kühle Kiefernküsten unter der großen Seefestung.',
  style: 'nord', weather: 'bewoelkt', song: 'north', level: 6,
  islands: [
    ring('kiefernhafen', 'Kiefernhafen', 62, 1170, 38, 'harbor', 'Holzfäller und Walfänger. Es riecht nach Harz.', { hill: 0.15 }),
    ring('eulenstein', 'Eulenstein', 90, 1260, 26, 'quiet', 'Nachts rufen hier Hunderte Eulen.'),
    ring('baerenfels', 'Bärenfels', 56, 1560, 34, 'camp', 'Ein Lager in den Felsen. Bärenfelle über den Zelten.', { level: 7, rocks: 3 }),
    ring('wolfsklippe', 'Wolfsklippe', 74, 1730, 30, 'treasure', 'Ein Leuchtfeuer aus Knochen. Hier soll Beute vergraben sein.'),
    ring('festungnordwacht', 'Festung Nordwacht', 84, 1470, 52, 'boss', 'Die mächtigste Seefestung der Welt.', { level: 9, rocks: 2, boss: 'Kommandant Eisenfaust' }),
  ],
};

export const GLUTRING: RegionDef = {
  id: 'glut', name: 'Glutring', x: 850, z: -1200, r: 500, color: '#E8643A', arc: [108, 180],
  desc: 'Vulkaninseln, Aschewolken und die Schmiedestadt Glutheim. Hier wohnt das Feuer-Faji.',
  style: 'glut', weather: 'bewoelkt', song: 'ember', level: 8,
  islands: [
    ring('glutheim', 'Glutheim', 136, 1180, 42, 'harbor', 'Schmiedestadt am Fuß des Vulkans. Die Essen glühen Tag und Nacht.', { hill: 0.14 }),
    ring('ascheinsel', 'Ascheinsel', 126, 1430, 34, 'camp', 'Unter grauer Asche liegt ein Räuberlager.', { level: 9, rocks: 3 }),
    ring('glutberg', 'Glutberg', 152, 1500, 50, 'boss', 'Ein feuerspeiender Berg. Auf dem Gipfel wartet die Flammenwirkerin.', { level: 11, hill: 0.45, rocks: 4, boss: 'Ignara, die Flammenwirkerin' }),
    ring('funkenriff', 'Funkenriff', 164, 1700, 32, 'camp', 'Glühende Felsen, fauchende Quellen und ein Piratennest.', { level: 10, rocks: 4 }),
    ring('obsidianstrand', 'Obsidianstrand', 142, 1790, 26, 'treasure', 'Schwarzer Glassand. Man munkelt von Schätzen.'),
  ],
};

export const STURMGUERTEL: RegionDef = {
  id: 'sturm', name: 'Sturmgürtel', x: -850, z: -1200, r: 500, color: '#6A7AA8', arc: [180, 252],
  desc: 'Hier tobt der Sturm ohne Ende. Nur die stärksten Legenden segeln diese Wellen.',
  style: 'sturm', weather: 'sturm', song: 'storm', level: 10,
  islands: [
    ring('donnerbucht', 'Donnerbucht', 208, 1190, 38, 'harbor', 'Eine geschützte Bucht im Auge des Sturms.', { hill: 0.14 }),
    ring('gischtzahn', 'Gischtzahn', 226, 1420, 36, 'camp', 'Felszähne, an denen Schiffe zerschellen. Und Plünderer warten.', { level: 11, rocks: 5 }),
    ring('seemannsgrab', 'Seemannsgrab', 198, 1560, 32, 'ruin', 'Ein Friedhof gesunkener Schiffe. Etwas regt sich darin.', { level: 12, rocks: 3 }),
    ring('blitzspitze', 'Blitzspitze', 216, 1660, 46, 'boss', 'Ein Felsturm, in den ständig Blitze schlagen.', { level: 13, hill: 0.4, rocks: 5, boss: 'Voltar, der Blitzrufer' }),
    ring('kielbruch', 'Kielbruch', 236, 1780, 26, 'treasure', 'Gestrandete Kiele wie Walknochen. Und eine Truhe darunter.'),
  ],
};

export const SCHLUNDRIFF: RegionDef = {
  id: 'schlund', name: 'Schlundriff am Weltrand', x: -1300, z: 450, r: 520, color: '#4A3A7A', arc: [252, 324],
  desc: 'Das letzte Meer vor dem Abgrund. Tief unten schläft der Tiefenschlund – und oben glänzt die Sturmkrone.',
  style: 'schlund', weather: 'nebel', song: 'abyss', level: 13,
  islands: [
    ring('letzterhafen', 'Letzter Hafen', 282, 1150, 36, 'harbor', 'Der letzte Hafen vor dem Weltrand. Wer weitersegelt, kommt selten zurück.', { hill: 0.12 }),
    ring('korallenkranz', 'Korallenkranz', 298, 1400, 34, 'camp', 'Leuchtende Korallen und finstere Gestalten.', { level: 13, rocks: 3 }),
    ring('tiefentor', 'Tiefentor', 274, 1600, 38, 'ruin', 'Ein Tor aus Kristall. Dahinter beginnt die Tiefe.', { level: 14, rocks: 4 }),
    ring('schlundkrone', 'Schlundkrone', 290, 1790, 48, 'boss', 'Auf dieser Insel ruht die Sturmkrone – bewacht vom Hüter der Tiefe.', { level: 15, hill: 0.35, rocks: 5, boss: 'Der Hüter der Tiefe' }),
  ],
};

export const REGIONS: RegionDef[] = [BERNSTEINSEE, NEBELARCHIPEL, NORDWACHT, GLUTRING, STURMGUERTEL, SCHLUNDRIFF];
for (const r of REGIONS) for (const i of r.islands) i.region = r.id;

/**
 * Inseln deutlich größer und unterschiedlicher als in 1.0: der Faktor wird aus dem Namen gewürfelt
 * (gleich bei jedem Start). Danach werden zu enge Nachbarn verkleinert, damit sich nichts überschneidet.
 */
const SIZE_BY_KIND: Record<IslandKind, [number, number]> = {
  town: [1.15, 1.15], harbor: [1.35, 1.5], lighthouse: [1.4, 1.6], camp: [1.4, 2.1],
  ruin: [1.5, 2.1], boss: [1.6, 2.2], quiet: [1.2, 2.3], treasure: [1.1, 1.9],
};
function nameHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
/** Platzbedarf einer Insel inklusive Küstenausbuchtungen und Brandung */
export const ISLAND_REACH = 1.45;
{
  const all = REGIONS.flatMap((r) => r.islands);
  for (const i of all) {
    const [lo, hi] = SIZE_BY_KIND[i.kind];
    i.r = Math.round(i.r * (lo + nameHash(i.id) * (hi - lo)));
  }
  for (let pass = 0; pass < 6; pass++) {
    for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
      const A = all[a], B = all[b];
      const need = (A.r + B.r) * ISLAND_REACH + 50;
      const d = Math.hypot(A.x - B.x, A.z - B.z);
      if (d >= need) continue;
      const k = Math.max(0.6, (d - 50) / ((A.r + B.r) * ISLAND_REACH));
      if (A.kind !== 'town') A.r = Math.round(A.r * k);
      if (B.kind !== 'town') B.r = Math.round(B.r * k);
    }
  }
}

/** In welcher Region liegt ein Punkt? */
export function regionAt(x: number, z: number): RegionDef {
  if (Math.hypot(x - BERNSTEINSEE.x, z - BERNSTEINSEE.z) < BERNSTEINSEE.r) return BERNSTEINSEE;
  let deg = (Math.atan2(x, z) * 180) / Math.PI;
  if (deg > 324) deg -= 360;
  if (deg < -36) deg += 360;
  return REGIONS.find((r) => r.arc && deg >= r.arc[0] && deg < r.arc[1]) ?? BERNSTEINSEE;
}

/**
 * Stärke der Schiffe auf offener See an einem Punkt.
 * Bernsteinsee: 1 vor Ankerglück bis 4 am Rand. Äußere Meere: Stufe der Region, nach außen bis +2.
 */
export function seaLevelAt(x: number, z: number): number {
  const reg = regionAt(x, z);
  if (reg === BERNSTEINSEE) {
    const home = BERNSTEINSEE.islands[0];
    return Math.max(1, Math.min(4, 1 + Math.floor(Math.hypot(x - home.x, z - home.z) / 260)));
  }
  const out = Math.max(0, Math.min(2, Math.floor((Math.hypot(x, z) - 1150) / 280)));
  return (reg.level ?? 1) + out;
}

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

/**
 * Waffenlinien je Kampfstil: gleiche Stufen, Preise und Schadenswerte wie WEAPONS,
 * aber eigene Namen, eigenes Aussehen und ein kleiner Stilbonus.
 */
export interface WeaponLine { title: string; names: string[]; stat: (w: WeaponDef, tier: number) => string; flavor: string }
export const WEAPON_LINES: Record<'faust' | 'schwert' | 'effekt', WeaponLine> = {
  schwert: {
    title: 'Klingen',
    names: WEAPONS.map((w) => w.n),
    stat: (w) => `+${w.dmg} Schaden${w.glow ? ' · leuchtet' : ''}`,
    flavor: 'Grete schmiedet dir jede Klingenform – Säbel, Langklinge, Zweihänder oder Doppelklingen.',
  },
  faust: {
    title: 'Kampfhandschuhe',
    names: ['Lederwickel', 'Eisenknöchel', 'Stahlfäuste', 'Sturmfäuste', 'Gezeitenfäuste', 'Himmelsfäuste'],
    stat: (w, t) => `+${w.dmg} Schlagkraft · +${t * 2} % Volltreffer${w.glow ? ' · leuchtet' : ''}`,
    flavor: 'Beschlagene Handschuhe: jeder Schlag sitzt härter, Volltreffer werden häufiger.',
  },
  effekt: {
    title: 'Faji-Foki',
    names: ['Holzamulett', 'Bernsteinfokus', 'Runenstein', 'Sturmkristall', 'Gezeitenperle', 'Himmelsauge'],
    stat: (w, t) => `+${w.dmg} Faji-Kraft · +${t * 5} % Faji-Erholung${w.glow ? ' · leuchtet' : ''}`,
    flavor: 'Ein Fokus bündelt dein Faji: stärkere Geschosse, schneller wieder bereit.',
  },
};

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
