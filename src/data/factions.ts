// Weltmächte: fünf Großmächte mit je einem Kuchenstück der runden Karte, dazu die Marine als Ordnungsmacht ohne eigenen Sektor.
// Alles hier ist reine Daten (JSON-tauglich, ohne three.js): `factionId`, `islandId`, `sectorIndex` sind die Schlüssel, über die
// Inselbesitz, Schiffs-Heraldik und Grenzfestungen später auch von einem Welt-Server (Shards) gelesen werden können.
// Nicht zu verwechseln mit `Faction` ('pirat' | 'marine') in core/save: das ist das Lager der SPIELFIGUR (Rang, Quests),
// `FactionId` hier ist die Zugehörigkeit von Inseln, Festungen und Schiffen der Welt.

import type { FigureheadId } from './figureheads';

export const FACTION_IDS = ['england', 'niederlande', 'deutschland', 'frankreich', 'kurogane', 'marine'] as const;
export type FactionId = (typeof FACTION_IDS)[number];
/** Die fünf Mächte mit Kuchenstück (alle außer der Marine) */
export type PowerId = Exclude<FactionId, 'marine'>;

/** Bild der Zeichen (Segel, Flagge, Banner): data/… liefert nur die Kennung, gemalt wird in render/heraldry.ts */
export type EmblemId = 'georgskreuz' | 'voc' | 'adler' | 'lilie' | 'klinge' | 'anker';
/** Muster auf dem Segeltuch */
export type SailPatternId = 'schlicht' | 'union' | 'streifen' | 'schwarzweiss' | 'lilien' | 'daemon' | 'marine';
/** Bauart der Festungen: bestimmt Farben und die zusätzlichen Blender-Bausteine (public/models/factions/) */
export type FortStyle = 'sternfestung' | 'kontor' | 'bastion' | 'barock' | 'burg' | 'zitadelle';

export interface FactionDef {
  id: FactionId;
  name: string;
  /** Beiname und Adjektiv für Texte („englisch“) */
  epithet: string;
  adjective: string;
  /** Nummer des Kuchenstücks (0 … 4, im Uhrzeigersinn ab Norden) oder null (Marine) */
  sector: number | null;
  /** Hauptfarbe für Karte, Kompass und Texte */
  color: string;
  /** Farbpalette der Heraldik: Haupt-, Zweit-, Zier- und Dunkelfarbe */
  palette: { primary: string; secondary: string; accent: string; dark: string; light: string };
  /** Uniform der Soldaten (CharacterLook-Felder) und der Offiziere; `gear` sind optionale Beute-Sets (data/gear.ts) */
  uniform: {
    outfitColor: string; accentColor: string; pantsColor: string; coatColor: string; hat: string; hatColor: string; hatAccent?: string;
    shoesColor: string; officerCoat: string; officerHat: string; gear?: string[]; masks?: boolean; blades?: 1 | 2;
  };
  /** Festungen und Siedlungen: Bauart, Mauerwerk, Dach, Tuch, Laternenfarbe */
  fort: { style: FortStyle; wall: string; wallDetail?: 'stone' | 'plaster' | 'tile'; stone: string; stonelight: string; roof: string; roofDetail?: 'tile'; cloth: string; cloth2: string; wood: string; lantern: string; lanternGlow: boolean };
  /** Schiffe: Rumpf, Zierstreifen, Segeltuch, Muster, Zeichen, Flaggengrund, Galionsfigur, Rumpfform */
  ship: { hull: string; stripe: string; sail: string; pattern: SailPatternId; emblem: EmblemId; flagColor: string; figurehead: FigureheadId; fullness: number };
  /** Kurzbeschreibung für Karte und Logbuch */
  info: string;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  england: {
    id: 'england', name: 'England', epithet: 'Royal Navy · Empire', adjective: 'englisch', sector: 0, color: '#E0373F',
    palette: { primary: '#B4202A', secondary: '#14284A', accent: '#E3B04B', dark: '#4A2E1A', light: '#F4EFE0' },
    uniform: { outfitColor: '#1B2A55', accentColor: '#B4202A', pantsColor: '#EDE8DA', coatColor: '#B4202A', hat: 'dreispitz', hatColor: '#14284A', shoesColor: '#1E1A20', officerCoat: '#B4202A', officerHat: 'zweispitz', gear: ['kueste'] },
    fort: { style: 'sternfestung', wall: '#E6DEC8', wallDetail: 'plaster', stone: '#CFC8B4', stonelight: '#EFE9D8', roof: '#46525E', cloth: '#B4202A', cloth2: '#14284A', wood: '#5A3A22', lantern: '#FFD9A0', lanternGlow: false },
    ship: { hull: '#5A3A1E', stripe: '#E3B04B', sail: '#FBF7EA', pattern: 'union', emblem: 'georgskreuz', flagColor: '#14284A', figurehead: 'loewe', fullness: 0 },
    info: 'Die Royal Navy hält den Nebelarchipel: Kalkstein-Sternfestungen, rotblaue Uniformen und dunkle Kriegsschiffe mit weißen Segeln.',
  },
  niederlande: {
    id: 'niederlande', name: 'Niederlande', epithet: 'Handelskompanie · VOC', adjective: 'niederländisch', sector: 3, color: '#E8761E',
    palette: { primary: '#E8761E', secondary: '#F4F1E6', accent: '#1B2E5C', dark: '#2A3B63', light: '#F4F1E6' },
    uniform: { outfitColor: '#F4F1E6', accentColor: '#E8761E', pantsColor: '#1B2E5C', coatColor: '#1B2E5C', hat: 'dreispitz', hatColor: '#1B2E5C', shoesColor: '#2A1E14', officerCoat: '#E8761E', officerHat: 'zweispitz' },
    fort: { style: 'kontor', wall: '#A8553A', wallDetail: 'tile', stone: '#8E4632', stonelight: '#D9C9A8', roof: '#3C4654', roofDetail: 'tile', cloth: '#E8761E', cloth2: '#1B2E5C', wood: '#4A3A2A', lantern: '#FFC878', lanternGlow: false },
    ship: { hull: '#1B2E5C', stripe: '#E8761E', sail: '#F4F1E6', pattern: 'streifen', emblem: 'voc', flagColor: '#E8761E', figurehead: 'loewe', fullness: 1 },
    info: 'Die Handelskompanie beherrscht den Sturmgürtel: Backstein-Kontore, Hafenkräne und bauchige Galleonen in Orange, Weiß und Blau.',
  },
  deutschland: {
    id: 'deutschland', name: 'Deutschland', epithet: 'Brandenburg-Preußische Marine · Hanse', adjective: 'deutsch', sector: 1, color: '#8D95A6',
    palette: { primary: '#1B2F5B', secondary: '#121214', accent: '#D4A82A', dark: '#1F1710', light: '#F2F0E8' },
    uniform: { outfitColor: '#121214', accentColor: '#D4A82A', pantsColor: '#F2F0E8', coatColor: '#1B2F5B', hat: 'helm', hatColor: '#26262C', hatAccent: '#D4A82A', shoesColor: '#121214', officerCoat: '#1B2F5B', officerHat: 'zweispitz' },
    fort: { style: 'bastion', wall: '#8E9094', wallDetail: 'stone', stone: '#6E7076', stonelight: '#A9AAAE', roof: '#2C323C', cloth: '#121214', cloth2: '#F2F0E8', wood: '#3A2A1C', lantern: '#FFD9A0', lanternGlow: false },
    ship: { hull: '#2A1D12', stripe: '#D4A82A', sail: '#F2F0E8', pattern: 'schwarzweiss', emblem: 'adler', flagColor: '#121214', figurehead: 'adler', fullness: 0 },
    info: 'Nordwacht gehört der Preußischen Marine: massive Granit- und Backsteinbastionen, dunkle Eichenschiffe mit schwarz-weißen Segeln und dem Adler im Banner.',
  },
  frankreich: {
    id: 'frankreich', name: 'Frankreich', epithet: 'Armada Royale', adjective: 'französisch', sector: 4, color: '#3F63C8',
    palette: { primary: '#2A4BA6', secondary: '#F6F3EA', accent: '#D8B23A', dark: '#1B2C66', light: '#F6F3EA' },
    uniform: { outfitColor: '#F3F0E6', accentColor: '#D8B23A', pantsColor: '#F3F0E6', coatColor: '#2A4BA6', hat: 'zweispitz', hatColor: '#2A4BA6', hatAccent: '#D8B23A', shoesColor: '#1E1A20', officerCoat: '#2A4BA6', officerHat: 'zweispitz' },
    fort: { style: 'barock', wall: '#DCC590', wallDetail: 'plaster', stone: '#C9B07A', stonelight: '#EBDCB4', roof: '#3B4F86', cloth: '#2A4BA6', cloth2: '#D8B23A', wood: '#6A4A2E', lantern: '#FFE0A0', lanternGlow: false },
    ship: { hull: '#F1ECDD', stripe: '#D8B23A', sail: '#2A4BA6', pattern: 'lilien', emblem: 'lilie', flagColor: '#F6F3EA', figurehead: 'meerfrau', fullness: 0 },
    info: 'Die Armada Royale segelt im Schlundriff: prunkvolle Sandstein-Zitadellen, weiß-goldene Schiffe und königsblaue Segel mit Lilien.',
  },
  kurogane: {
    id: 'kurogane', name: 'Kurogane', epithet: 'Die dunkle Eigenmacht', adjective: 'kuroganisch', sector: 2, color: '#B0187A',
    palette: { primary: '#0E0E12', secondary: '#B01818', accent: '#E03030', dark: '#07070A', light: '#3A3A44' },
    uniform: { outfitColor: '#0E0E12', accentColor: '#B01818', pantsColor: '#16161C', coatColor: '#0E0E12', hat: 'helm_samurai', hatColor: '#101014', hatAccent: '#B01818', shoesColor: '#07070A', officerCoat: '#B01818', officerHat: 'helm_drache', gear: ['ronin'], masks: true, blades: 2 },
    fort: { style: 'burg', wall: '#1E1816', stone: '#2C282A', stonelight: '#4A4448', roof: '#120E10', cloth: '#B01818', cloth2: '#0E0E12', wood: '#1A1210', lantern: '#FF3A22', lanternGlow: true },
    ship: { hull: '#0C0A0E', stripe: '#9A1414', sail: '#8E1010', pattern: 'daemon', emblem: 'klinge', flagColor: '#0E0E12', figurehead: 'kraken', fullness: 0 },
    info: 'Kurogane beherrscht den Glutring: Festungen aus geschwärztem Holz und Vulkangestein mit glühend roten Laternen und pechschwarze Kriegsschiffe mit blutroten Segeln.',
  },
  marine: {
    id: 'marine', name: 'Die Marine', epithet: 'Weltpolizei · Ordnungsmacht', adjective: 'der Marine', sector: null, color: '#E8EEF8',
    palette: { primary: '#F7F8FA', secondary: '#16306A', accent: '#E3B04B', dark: '#10224A', light: '#FFFFFF' },
    uniform: { outfitColor: '#FFFFFF', accentColor: '#16306A', pantsColor: '#FFFFFF', coatColor: '#16306A', hat: 'marine', hatColor: '#FFFFFF', hatAccent: '#E3B04B', shoesColor: '#1E1A20', officerCoat: '#16306A', officerHat: 'zweispitz', gear: ['marine'] },
    fort: { style: 'zitadelle', wall: '#F2F0E6', wallDetail: 'plaster', stone: '#E2DECF', stonelight: '#FFFFFF', roof: '#16306A', cloth: '#FFFFFF', cloth2: '#16306A', wood: '#5A4A3A', lantern: '#FFF0C8', lanternGlow: false },
    ship: { hull: '#F2F4F6', stripe: '#16306A', sail: '#FFFFFF', pattern: 'marine', emblem: 'anker', flagColor: '#FFFFFF', figurehead: 'adler', fullness: 0 },
    info: 'Die Marine hält die Grenzen zwischen den Mächten: weiße Kalkstein-Zitadellen mit hohen Wachtürmen, weiße Kriegsschiffe mit blauen Streifen.',
  },
};

// ---------- Sektoren (Kuchenstücke) ----------

/** Ein Kuchenstück: Winkel in Grad, 0 = Norden (+z), im Uhrzeigersinn (+x liegt bei 90°). Deckt sich mit den Meeren in data/regions.ts. */
export interface SectorDef {
  sectorIndex: number;
  factionId: PowerId;
  /** Meer (RegionDef.id), das in diesem Kuchenstück liegt */
  regionId: string;
  fromDeg: number;
  toDeg: number;
}

export const SECTOR_COUNT = 5;
export const SECTOR_SPAN = 360 / SECTOR_COUNT;

/** Die fünf Kuchenstücke zu je 72°: Nebelarchipel (England), Nordwacht (Deutschland), Glutring (Kurogane), Sturmgürtel (Niederlande), Schlundriff (Frankreich) */
export const SECTORS: SectorDef[] = [
  { sectorIndex: 0, factionId: 'england', regionId: 'nebel', fromDeg: -36, toDeg: 36 },
  { sectorIndex: 1, factionId: 'deutschland', regionId: 'nord', fromDeg: 36, toDeg: 108 },
  { sectorIndex: 2, factionId: 'kurogane', regionId: 'glut', fromDeg: 108, toDeg: 180 },
  { sectorIndex: 3, factionId: 'niederlande', regionId: 'sturm', fromDeg: 180, toDeg: 252 },
  { sectorIndex: 4, factionId: 'frankreich', regionId: 'schlund', fromDeg: 252, toDeg: 324 },
];

/** Winkel eines Punkts in Grad, 0 = Norden, im Uhrzeigersinn, Wertebereich −36 … 324 (so beginnt das erste Kuchenstück bei −36°) */
export function bearingDeg(x: number, z: number): number {
  let deg = (Math.atan2(x, z) * 180) / Math.PI;
  if (deg >= 324) deg -= 360;
  if (deg < -36) deg += 360;
  return deg;
}

/** Nummer des Kuchenstücks an einem Punkt (0 … 4). Gilt über die ganze Scheibe, auch im Kernmeer um Ankerglück. */
export function sectorIndexAt(x: number, z: number): number {
  const d = bearingDeg(x, z);
  return Math.min(SECTOR_COUNT - 1, Math.max(0, Math.floor((d + 36) / SECTOR_SPAN)));
}

export const sectorAt = (x: number, z: number): SectorDef => SECTORS[sectorIndexAt(x, z)];

/** Die fünf Grenzlinien zwischen den Kuchenstücken: Linie i trennt Sektor i−1 von Sektor i (bei i = 0 der letzte vom ersten) */
export interface BorderDef { borderIndex: number; deg: number; between: [PowerId, PowerId] }
export const BORDERS: BorderDef[] = SECTORS.map((s, i) => ({
  borderIndex: i,
  deg: s.fromDeg,
  between: [SECTORS[(i + SECTOR_COUNT - 1) % SECTOR_COUNT].factionId, s.factionId] as [PowerId, PowerId],
}));

/** Abstand eines Punkts von der nächsten Grenzlinie in Metern (nur sinnvoll weit genug vom Mittelpunkt) und deren Nummer */
export function borderDistance(x: number, z: number): { borderIndex: number; dist: number } {
  const d = Math.hypot(x, z);
  const bd = bearingDeg(x, z);
  let best = 0, bestAng = 999;
  for (const b of BORDERS) {
    let da = Math.abs(((bd - b.deg + 540) % 360) - 180);
    if (da > 180) da = 360 - da;
    if (da < bestAng) { bestAng = da; best = b.borderIndex; }
  }
  return { borderIndex: best, dist: d * Math.sin((bestAng * Math.PI) / 180) };
}

// ---------- Inselbesitz ----------

/**
 * Wem gehört welche Insel (islandId → factionId). Ankerglück bleibt unabhängig (null: neutrale Startinsel).
 * Die Meere im Ring gehören ganz der Macht ihres Kuchenstücks. Die Inseln der Bernsteinsee liegen in allen Kuchenstücken und
 * sind Außenposten der drei Seemächte England, Niederlande und Frankreich (je vier): wer in ein anderes Stück hineinragt, ist
 * eine Kolonie (`exclave`). Glutring = Kurogane und Nordwacht = Deutschland sind fest.
 */
export const BERNSTEIN_OWNERS: Record<string, PowerId> = {
  moewennest: 'england', sonnenstrand: 'england', kraehenfels: 'england', bernsteinbucht: 'england',
  leuchtfeuer: 'niederlande', gruenmark: 'niederlande', palmenkueste: 'niederlande', sturmklippe: 'niederlande',
  faehrholm: 'frankreich', rabenriff: 'frankreich', muschelruh: 'frankreich', sturmzahn: 'frankreich',
};

/** Besitzer einer Insel nach ID, sonst null (unabhängig oder unbekannt). Für Inseln in den Ringmeeren: regionOwner(regionId). */
export function islandOwner(islandId: string, regionId?: string): FactionId | null {
  if (BERNSTEIN_OWNERS[islandId]) return BERNSTEIN_OWNERS[islandId];
  if (islandId === 'ankerglueck') return null;
  const s = SECTORS.find((x) => x.regionId === regionId);
  return s ? s.factionId : null;
}

/** Ist die Insel eine Kolonie (Besitzer ≠ Macht des Kuchenstücks, in dem sie liegt)? */
export function isExclave(owner: FactionId | null, x: number, z: number): boolean {
  return owner !== null && owner !== 'marine' && sectorAt(x, z).factionId !== owner;
}

// ---------- Marine: Grenzfestungen und Hauptquartier ----------

/** Marine-Grenzfestung auf einer der fünf Grenzlinien (Lage in Weltkoordinaten legt data/regions.ts fest) */
export interface BorderFortDef { id: string; name: string; borderIndex: number; radius: number; r: number; level: number; info: string }

/** Abstand vom Mittelpunkt (Meter) auf der jeweiligen Grenzlinie. Feinjustiert gegen die Inseln der Nachbarmeere (siehe Test). */
export const BORDER_FORTS: BorderFortDef[] = [
  { id: 'grenzwacht_nordkap', name: 'Grenzfeste Nordkap', borderIndex: 1, radius: 3813, r: 92, level: 12, info: 'Marine-Grenzfestung zwischen England und Deutschland: Geschützwälle, Wachtürme und Patrouillenboote.' },
  { id: 'grenzwacht_schwarzwacht', name: 'Grenzfeste Schwarzwacht', borderIndex: 2, radius: 3877, r: 92, level: 14, info: 'Marine-Grenzfestung zwischen Deutschland und Kurogane: hier endet die Ordnung, hinter der Linie beginnt die Dunkelheit.' },
  { id: 'grenzwacht_suedwall', name: 'Grenzfeste Südwall', borderIndex: 3, radius: 3877, r: 92, level: 15, info: 'Marine-Grenzfestung zwischen Kurogane und den Niederlanden: Hafenkräne der Kompanie auf der einen, Schwarzsegel auf der anderen Seite.' },
  { id: 'grenzwacht_westgischt', name: 'Grenzfeste Westgischt', borderIndex: 4, radius: 3813, r: 92, level: 16, info: 'Marine-Grenzfestung zwischen den Niederlanden und Frankreich: Gischt schlägt gegen die weißen Mauern.' },
  { id: 'grenzwacht_kanalwacht', name: 'Grenzfeste Kanalwacht', borderIndex: 0, radius: 3813, r: 92, level: 13, info: 'Marine-Grenzfestung zwischen Frankreich und England: der Kanal gehört der Marine.' },
];

/** Endgame-Inseln am Außenrand der Kaiser-Meere (Ring 4, seit 4.3B bei 9 500 m, das Marine-Hauptquartier bei 9 700 m): je Kuchenstück eine große Festungsinsel der Macht, dazu das Marine-Hauptquartier */
export interface CitadelDef { id: string; name: string; factionId: FactionId; sectorIndex: number | null; deg: number; dist: number; r: number; level: number; boss: string; info: string }

export const CITADELS: CitadelDef[] = [
  { id: 'albion', name: 'Albion', factionId: 'england', sectorIndex: 0, deg: 0, dist: 11855, r: 330, level: 17, boss: 'Lord-Admiral Blackwood', info: 'Die Admiralitätsfestung der Royal Navy: eine gewaltige Kalkstein-Sternfestung über den Klippen des Nebelmeers.' },
  { id: 'adlerstein', name: 'Adlerstein', factionId: 'deutschland', sectorIndex: 1, deg: 72, dist: 11855, r: 330, level: 18, boss: 'Großkomtur von Eisenstein', info: 'Der Granit-Hort der Preußischen Marine: Bastionen, Kasematten und der schwarze Adler über jedem Tor.' },
  { id: 'yamikura', name: 'Yamikura', factionId: 'kurogane', sectorIndex: 2, deg: 144, dist: 11855, r: 330, level: 20, boss: 'Schattenfürst Kurogane', info: 'Die Burg der dunklen Klinge: geschwungene Dächer aus Pech, rote Laternen und Vulkanfels.' },
  { id: 'oranjehaven', name: 'Oranjehaven', factionId: 'niederlande', sectorIndex: 3, deg: 216, dist: 11855, r: 330, level: 18, boss: 'Generalgouverneur Van Der Berg', info: 'Das Hauptkontor der Handelskompanie: Backsteinspeicher, Kräne und eine Flotte bauchiger Galleonen.' },
  { id: 'soleilmont', name: 'Soleilmont', factionId: 'frankreich', sectorIndex: 4, deg: 288, dist: 11855, r: 330, level: 19, boss: 'Marquis-Amiral De Valois', info: 'Die Sonnenzitadelle der Armada Royale: Barockpavillons, Terrassengärten und goldene Kuppeln.' },
  { id: 'weisswacht', name: 'Weißwacht', factionId: 'marine', sectorIndex: null, deg: 180, dist: 12109, r: 380, level: 22, boss: 'Großadmiral Valken, Oberster Gefängniswärter', info: 'Hafenstadt und Gefängnisfestung der Marine am Rand der Welt: weiße Zitadellen, hohe Wachtürme und tief unten die Zellen der gefährlichsten Piraten.' },
];

// ---------- Ansehen bei der Marine ----------

/** Haltung der Marine zum Spieler: aus Ansehen (−100 … +100) und Lager. Reine Daten, keine Abhängigkeit von three.js. */
export type MarineStance = 'verbuendet' | 'neutral' | 'feindlich';

/** Ab diesem Ansehen ist die Marine verbündet (kein Angriff, Hauptquartier nicht angreifbar), darunter feindlich */
export const MARINE_ALLY_AT = 20;
export const MARINE_HOSTILE_BELOW = 0;
export const STANDING_MIN = -100;
export const STANDING_MAX = 100;
/** Startansehen: Marine-Anwärter beginnen als Freunde, Piraten gelten als Gesetzlose */
export const START_MARINE_STANDING = { marine: 60, pirat: -40 } as const;

export function marineStance(standing: number): MarineStance {
  return standing >= MARINE_ALLY_AT ? 'verbuendet' : standing < MARINE_HOSTILE_BELOW ? 'feindlich' : 'neutral';
}

/** Ansehensänderungen (Marine) durch Taten auf See: Marine-Schiff versenkt/geentert, Schiff der Kurogane versenkt */
export const STANDING_EVENTS = { marineShipSunk: -8, marineShipBoarded: -5, kuroganeShipSunk: 2, bountyPaid: 10 } as const;

export const clampStanding = (v: number) => Math.max(STANDING_MIN, Math.min(STANDING_MAX, Math.round(v)));

/** Beschreibung der Haltung für Texte */
export const STANCE_LABEL: Record<MarineStance, string> = { verbuendet: 'verbündet', neutral: 'neutral', feindlich: 'feindlich' };
