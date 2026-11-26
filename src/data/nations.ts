// Nationen-Ökosystem (Phase 4.5A): reine, JSON-taugliche Daten der Mächte für die FactionWarEngine (world/factionWarEngine.ts).
// Ohne three.js. Jede Macht ist ein Eintrag in `NATION_DEFS` (Lehre der KI, Neigungen, Exportwaren, Heraldik-Quelle); die Engine kennt keine
// einzelne Macht beim Namen – eine neue Nation (größere Karten) ist ein neuer Eintrag hier und ein `registry.register(def)`, sonst nichts.
import { FACTIONS, type FactionId } from './factions';
import { PROFILES, type GoodId } from './economy';

// ---------- Ressourcen ----------

export const RESOURCE_IDS = ['gold', 'kanonenstahl', 'hartholz', 'segeltuch', 'proviant', 'medizin', 'rekruten'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export type ResourceBag = Record<ResourceId, number>;
export const RESOURCE_COUNT = RESOURCE_IDS.length;

export const RESOURCE_LABEL: Record<ResourceId, string> = {
  gold: 'Gold', kanonenstahl: 'Kanonenstahl', hartholz: 'Hartholz', segeltuch: 'Segeltuch', proviant: 'Proviant', medizin: 'Medizin', rekruten: 'Rekruten',
};

/** Kriegsrohstoffe (ohne Gold): Knappheit treibt die Zielwahl der KI */
export const WAR_RESOURCES: readonly ResourceId[] = ['kanonenstahl', 'hartholz', 'segeltuch', 'proviant', 'medizin', 'rekruten'];

export const emptyBag = (): ResourceBag => ({ gold: 0, kanonenstahl: 0, hartholz: 0, segeltuch: 0, proviant: 0, medizin: 0, rekruten: 0 });

/** Wert einer Einheit für die Machtbilanz (Gold = 1): bestimmt den Anteil an den Gesamtressourcen (Anti-Hegemon-Schwelle) */
export const RESOURCE_VALUE: ResourceBag = { gold: 1, kanonenstahl: 6, hartholz: 4, segeltuch: 4, proviant: 1.5, medizin: 7, rekruten: 5 };

/** Wohlfühl-Vorrat einer Nation: darunter wird es knapp (Zielwahl), darüber ist es Überschuss (Handelspakte) */
export const RESOURCE_TARGET: ResourceBag = { gold: 6000, kanonenstahl: 400, hartholz: 450, segeltuch: 350, proviant: 600, medizin: 160, rekruten: 300 };

/** Obergrenze der Vorräte (Lagerhäuser): verhindert, dass lange Friedenszeiten unendliche Kassen füllen */
export const RESOURCE_CAP: ResourceBag = { gold: 25000, kanonenstahl: 1600, hartholz: 1800, segeltuch: 1400, proviant: 2400, medizin: 650, rekruten: 1200 };

/**
 * Grundverbrauch je Zyklus: Hof, Verwaltung und die Reserveflotte im Hafen (Wartung kostet Stahl, Holz und Tuch), dazu je gehaltener Insel Sold und
 * Verpflegung. So halten sich die Vorräte nahe am Wohlfühl-Vorrat, und wer einen Rohstoff nicht selbst herstellt, gerät in Mangel (Rohstoffkriege).
 */
export const STATE_UPKEEP: ResourceBag = { gold: 70, kanonenstahl: 8, hartholz: 7, segeltuch: 6, proviant: 15, medizin: 1.5, rekruten: 0 };
export const ISLAND_UPKEEP: Partial<ResourceBag> = { gold: 14, proviant: 2 };

/** Faktor auf die Insel-Erträge je Rohstoff: Kriegsrohstoffe sind knapp, Gold fließt aus Handel und Steuern reichlicher */
export const YIELD_K: ResourceBag = { gold: 1, kanonenstahl: 0.6, hartholz: 0.6, segeltuch: 0.6, proviant: 0.75, medizin: 0.6, rekruten: 0.8 };

/** Kriegsreserve: so viel muss nach dem Auslaufen einer Armada noch im Lager sein (Anteil des Wohlfühl-Vorrats) */
export const WAR_RESERVE: Partial<ResourceBag> = { gold: 0.25, proviant: 0.25 };

// ---------- Erträge der Inseln ----------

/** Größenklasse einer gehaltenen Insel für Grundertrag und Garnison */
export type IslandTier = 'aussenposten' | 'siedlung' | 'hafen' | 'festung' | 'mega' | 'hauptstadt';

/** Grundertrag je Zyklus (`WAR.cycle` Sekunden Spielzeit) nach Größenklasse */
export const BASE_YIELD: Record<IslandTier, Partial<ResourceBag>> = {
  aussenposten: { gold: 6, proviant: 2, rekruten: 0.8 },
  siedlung: { gold: 14, proviant: 7, rekruten: 2 },
  hafen: { gold: 26, proviant: 6, rekruten: 2.5, hartholz: 0.5, segeltuch: 0.5 },
  festung: { gold: 12, proviant: 2, rekruten: 3.5, kanonenstahl: 0.6 },
  mega: { gold: 60, proviant: 14, rekruten: 6, hartholz: 2, kanonenstahl: 1.5, segeltuch: 1.5, medizin: 0.6 },
  hauptstadt: { gold: 90, proviant: 18, rekruten: 9, hartholz: 3, kanonenstahl: 3, segeltuch: 2, medizin: 1 },
};

/**
 * Was eine Ware, die eine Insel im Überschuss herstellt (Marktprofil, data/economy.ts `profileOf`/`ISLAND_PROFILES`), je Zyklus zur Kriegskasse
 * ihrer Schutzmacht beiträgt: Erz- und Stahlminen liefern Kanonenstahl, Holzkolonien Hartholz, Tuchmanufakturen Segeltuch, Handelskontore Gold.
 */
export const GOOD_YIELD: Record<GoodId, Partial<ResourceBag>> = {
  kanonenstahl: { kanonenstahl: 5 },
  hartholz: { hartholz: 6 },
  werkzeuge: { kanonenstahl: 1.5, hartholz: 1 },
  schmiedekohle: { kanonenstahl: 2 },
  schwefel: { gold: 4, kanonenstahl: 0.5 },
  obsidian: { gold: 5 },
  gewuerze: { gold: 8, proviant: 1.5 },
  stoffe: { segeltuch: 2.5, gold: 2 },
  tuch: { segeltuch: 5 },
  tee: { proviant: 2, gold: 3 },
  wein: { proviant: 2, gold: 4 },
  seide: { gold: 8, segeltuch: 1 },
  luxusgueter: { gold: 12 },
  marineausruestung: { segeltuch: 2, kanonenstahl: 1.5, gold: 3 },
  fechtklingen: { kanonenstahl: 1, gold: 6 },
  schiesspulver: { kanonenstahl: 1, gold: 4 },
  waffenkisten: { kanonenstahl: 2, gold: 4 },
  medizin: { medizin: 4 },
};

/** Anteil des Profil-Ertrags für Inseln ohne eigenen Markt (sie folgen nur dem Profil ihrer Macht oder Region) */
export const PROFILE_ONLY_K = 0.4;

/** Grundbesatzung (Garnison) je Größenklasse; herrenlose Mega-Inseln verteidigen Piraten und Glücksritter */
export const GARRISON_BASE: Record<IslandTier, number> = { aussenposten: 30, siedlung: 45, hafen: 70, festung: 110, mega: 160, hauptstadt: 220 };
export const NEUTRAL_GARRISON = 90;

/** Strategischer Wert für die Großoffensive (Meerengen = Grenzfesten auf den Grenzlinien, Mega-Inseln) */
export const STRATEGIC_VALUE: Record<IslandTier, number> = { aussenposten: 0.2, siedlung: 0.35, hafen: 0.55, festung: 0.9, mega: 1, hauptstadt: 0 };

// ---------- Schiffe und Armadas ----------

export type ArmadaRole = 'kommando' | 'linie' | 'fregatte' | 'transport';

export const ROLE_LABEL: Record<ArmadaRole, string> = { kommando: 'Kommandoschiff', linie: 'Linienschiff', fregatte: 'Fregatte', transport: 'Nachschub-Transporter' };

/**
 * Kosten der Indienststellung je Schiffsklasse (0 Schaluppe … 6 Leviathan): Gold, Kanonenstahl, Hartholz, Segeltuch, Proviant, Rekruten (Mannschaft).
 * Die Flotte einer Macht liegt im Frieden in Reserve; eine Armada mobilisiert sie (Kosten) und gibt Überlebende bei der Heimkehr zum Teil zurück.
 */
export const SHIP_COST: readonly Partial<ResourceBag>[] = [
  { gold: 120, kanonenstahl: 6, hartholz: 10, segeltuch: 6, proviant: 10, rekruten: 4 },
  { gold: 180, kanonenstahl: 10, hartholz: 14, segeltuch: 8, proviant: 14, rekruten: 6 },
  { gold: 260, kanonenstahl: 14, hartholz: 18, segeltuch: 10, proviant: 20, rekruten: 8 },
  { gold: 330, kanonenstahl: 20, hartholz: 24, segeltuch: 14, proviant: 26, rekruten: 11 },
  { gold: 420, kanonenstahl: 24, hartholz: 30, segeltuch: 18, proviant: 32, rekruten: 13 },
  { gold: 560, kanonenstahl: 32, hartholz: 38, segeltuch: 22, proviant: 38, rekruten: 16 },
  { gold: 820, kanonenstahl: 46, hartholz: 54, segeltuch: 30, proviant: 50, rekruten: 22 },
];

/** Bauplan einer Armada: Klasse und Ausbaustufen-Band je Rolle */
export const ROLE_PLAN: Record<ArmadaRole, { cls: readonly [number, number]; evo: readonly [number, number] }> = {
  kommando: { cls: [4, 5], evo: [4, 5] },
  linie: { cls: [5, 5], evo: [3, 4] },
  fregatte: { cls: [3, 3], evo: [3, 4] },
  transport: { cls: [4, 4], evo: [2, 3] },
};

/** Truppen (Landungskorps) je Schiff: Transporter tragen die Hauptlast */
export const TROOPS_PER_SHIP: Record<ArmadaRole, number> = { kommando: 14, linie: 10, fregatte: 6, transport: 42 };
/** Nachschub, den ein Transporter lädt (Proviant, Medizin) */
export const TRANSPORT_SUPPLY = { proviant: 70, medizin: 18 } as const;

// ---------- Diplomatie ----------

export type DiplomacyState = 'allianz' | 'handelspakt' | 'neutral' | 'rivalitaet' | 'krieg';
export const DIPLOMACY_LABEL: Record<DiplomacyState, string> = {
  allianz: 'Allianz', handelspakt: 'Handelspakt', neutral: 'Neutral', rivalitaet: 'Rivalität', krieg: 'Offener Krieg',
};

/** Lehre der KI: Gewichte der Nutzen-Bewertung und Grundhaltung */
export interface NationDoctrine {
  /** Lust auf Eroberung (0 … 1): Schwelle der Kriegserklärung, Gewicht von Großoffensiven */
  aggression: number;
  /** Neigung zu Handelspakten (0 … 1) */
  trade: number;
  /** Erobert Kolonien anderer Mächte (false: nur Rückeroberung eigener Inseln und Koalitionskriege, z. B. die Marine als Ordnungsmacht) */
  conquers: boolean;
  /** Gewichte der Zielwahl */
  wResource: number;
  wStrategic: number;
  wMega: number;
}

export interface NationDefinition {
  /** Schlüssel der Nation (bestehende Mächte: ihre FactionId) */
  id: string;
  name: string;
  adjective: string;
  /** Farbe für Karte, Meldungen und Banner (Fallback) */
  color: string;
  /** Heraldik, Uniform und Schiffsaussehen: eine Macht aus data/factions.ts (neue Nationen leihen sich eine bestehende oder bekommen später eigene) */
  heraldry: FactionId;
  /** Hauptstadt (Insel-Kennung): wird nie angegriffen, liefert den Grundertrag einer Hauptstadt */
  capital: string | null;
  doctrine: NationDoctrine;
  /** Typische Exportwaren: verfeindete Häfen verhängen ein Embargo auf genau diese Waren */
  exports: GoodId[];
  /** Startvorrat als Vielfaches von `RESOURCE_TARGET` */
  startStock: number;
  /** Festes Einkommen je Zyklus unabhängig von Inseln (die Marine: Ordnungsabgabe der Mächte für Grenzwacht und Weltpolizei) */
  stipend?: Partial<ResourceBag>;
}

const exportsOf = (f: FactionId): GoodId[] => [...(PROFILES[f]?.produce ?? [])];

/** Die sechs Mächte der heutigen Karte */
export const NATION_DEFS: NationDefinition[] = [
  { id: 'england', name: FACTIONS.england.name, adjective: FACTIONS.england.adjective, color: FACTIONS.england.color, heraldry: 'england', capital: 'albion', exports: exportsOf('england'), startStock: 1.1,
    doctrine: { aggression: 0.62, trade: 0.55, conquers: true, wResource: 1, wStrategic: 1.1, wMega: 1.1 } },
  { id: 'niederlande', name: FACTIONS.niederlande.name, adjective: FACTIONS.niederlande.adjective, color: FACTIONS.niederlande.color, heraldry: 'niederlande', capital: 'oranjehaven', exports: exportsOf('niederlande'), startStock: 1.25,
    doctrine: { aggression: 0.42, trade: 0.9, conquers: true, wResource: 1.3, wStrategic: 0.8, wMega: 0.9 } },
  { id: 'deutschland', name: FACTIONS.deutschland.name, adjective: FACTIONS.deutschland.adjective, color: FACTIONS.deutschland.color, heraldry: 'deutschland', capital: 'adlerstein', exports: exportsOf('deutschland'), startStock: 1,
    doctrine: { aggression: 0.55, trade: 0.6, conquers: true, wResource: 1.1, wStrategic: 1.2, wMega: 0.9 } },
  { id: 'frankreich', name: FACTIONS.frankreich.name, adjective: FACTIONS.frankreich.adjective, color: FACTIONS.frankreich.color, heraldry: 'frankreich', capital: 'soleilmont', exports: exportsOf('frankreich'), startStock: 1.05,
    doctrine: { aggression: 0.6, trade: 0.5, conquers: true, wResource: 0.9, wStrategic: 1, wMega: 1.3 } },
  { id: 'kurogane', name: FACTIONS.kurogane.name, adjective: FACTIONS.kurogane.adjective, color: FACTIONS.kurogane.color, heraldry: 'kurogane', capital: 'yamikura', exports: exportsOf('kurogane'), startStock: 0.95,
    doctrine: { aggression: 0.85, trade: 0.15, conquers: true, wResource: 1.2, wStrategic: 0.9, wMega: 1.2 } },
  { id: 'marine', name: FACTIONS.marine.name, adjective: FACTIONS.marine.adjective, color: FACTIONS.marine.color, heraldry: 'marine', capital: 'weisswacht', exports: exportsOf('marine'), startStock: 1.2,
    stipend: { gold: 150, proviant: 25, hartholz: 6, segeltuch: 4, medizin: 1 },
    doctrine: { aggression: 0.35, trade: 0.4, conquers: false, wResource: 0.6, wStrategic: 1.3, wMega: 0.6 } },
];

/**
 * Startbeziehungen (ungeordnete Paare, Schlüssel `a|b` alphabetisch); fehlt ein Paar, gilt `neutral` mit Vertrauen 0. Wer welche Insel hält,
 * bestimmt die Engine aus den Inseldaten; hier stehen nur die alten Feindschaften und Verträge.
 */
export const START_RELATIONS: Record<string, { state: DiplomacyState; trust: number }> = {
  'england|frankreich': { state: 'rivalitaet', trust: -35 },
  'deutschland|niederlande': { state: 'handelspakt', trust: 30 },
  'england|niederlande': { state: 'neutral', trust: 10 },
  'kurogane|marine': { state: 'rivalitaet', trust: -50 },
  'england|kurogane': { state: 'rivalitaet', trust: -30 },
  'frankreich|kurogane': { state: 'neutral', trust: -15 },
  'deutschland|kurogane': { state: 'rivalitaet', trust: -25 },
  'kurogane|niederlande': { state: 'rivalitaet', trust: -20 },
  'deutschland|frankreich': { state: 'neutral', trust: -5 },
};

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

// ---------- Zahlen der Engine ----------

export const WAR = {
  /** Wirtschaftszyklus (s Spielzeit): Erträge, Unterhalt, Verstärkung der Garnisonen */
  cycle: 60,
  /** Diplomatie und Hegemon-Prüfung alle … s */
  diplomacyEvery: 30,
  /** Jede Nation entscheidet alle … s (versetzt) über neue Offensiven und Entsatz */
  brainEvery: 30,
  /** Bewegung, Gefechte und Belagerungen in Schritten von … s (Hintergrund-Simulation) */
  step: 1,
  /** Reichweite (m) einer Offensive ab der nächsten eigenen Insel: seit 4.5D 6 800 m, damit die Mächte über die weite Welt (15 600 m) bis in die Königs-Meere greifen */
  reach: 6800,
  /** Gleichzeitige Offensiven je Nation (Entsatz zählt nicht) */
  maxOffensives: 2,
  /** Armadas insgesamt (Rechenzeit, Übersicht) */
  maxArmadas: 8,
  /** Größe einer Armada (Schiffe) */
  minShips: 6,
  maxShips: 10,
  /** Tempo der Armada in der Hintergrund-Simulation (m/s) */
  speed: 7,
  /** Zwei feindliche Armadas treffen aufeinander unter … m; Ankunft an der Zielinsel unter Küstenradius + … m */
  engageDist: 520,
  arriveDist: 260,
  /** Seeschlacht: Schadensfaktor je Sekunde, Rückzug unter diesem Anteil der Anfangs-Feuerkraft (wenn der Gegner deutlich stärker ist) */
  battleK: 0.9,
  retreatAt: 0.3,
  retreatRatio: 1.8,
  /** Höchstdauer einer Großschlacht (s): danach zieht sich die schwächere Seite zurück (kein endloses Patt, auch nicht in 3D) */
  battleMax: 420,
  /** Wahrscheinlichkeit, dass eine Salve den Transporter trifft (sonst das vorderste Kriegsschiff) */
  transportHit: 0.18,
  /** Belagerung: Dauer bei ausgeglichener Lage (s), Moral-Verlust je versenktem Transporter, Abbruch unter dieser Moral */
  siegeSeconds: 720,
  transportMoraleLoss: 0.38,
  siegeBreakMorale: 0.2,
  /** Verbrauch der Belagerung je Minute: Proviant je 10 Truppen, Medizin je 10 Truppen; ohne Nachschub sinkt die Moral um … je Sekunde */
  siegeProviant: 1.2,
  siegeMedizin: 0.35,
  starveMorale: 0.004,
  /** Abnutzung je Sekunde (Anteil der Gegenstärke): Garnison gegen Landungskorps */
  garrisonLoss: 0.0009,
  attackerLoss: 0.0007,
  /** Küstenfeuer: Rumpfverlust der Belagerer je Sekunde, je 100 Garnison (Festungen doppelt) */
  coastFire: 0.00012,
  /** Beute: Anteil des Insellagers, den der Sieger erbeutet */
  lootShare: 0.5,
  /** Frisch eroberte Inseln liefern so lange (s) nur die Hälfte (Unruhe) und zahlen Kriegspreise */
  unrest: 900,
  /** Ein Krieg dauert mindestens so lange (s), bevor ein Waffenstillstand möglich ist */
  minWar: 180,
  /** Notkauf auf dem Weltmarkt je Zyklus: fehlt ein Rohstoff (unter `shortAt`) und ist Gold da, kauft die Nation bis zu `units` Einheiten zum `priceK`-fachen Wert */
  marketBuy: { units: 30, priceK: 3, goldFloor: 0.5 },
  /** Handelspakt: Ertragsbonus und Austausch je Diplomatie-Schritt (Anteil des Überschusses) */
  pactBonus: 0.2,
  pactShare: 0.1,
  /** Überschuss ab … × Wohlfühl-Vorrat, Knappheit unter … × */
  surplusAt: 1.4,
  shortAt: 0.6,
  /** Anti-Hegemon-Schwelle: Anteil an den Gesamtressourcen, gehaltene Mega-Inseln; Auflösung unter dem Anteil `hegemonRelease` */
  hegemonShare: 0.34,
  hegemonMegas: 3,
  hegemonRelease: 0.28,
  /** Kriegsmüdigkeit: Grundzuwachs je Diplomatie-Schritt im Krieg, je versenktem Schiff, je verlorener Insel; ab `weary` Waffenstillstand */
  wearyBase: 0.6,
  wearyShip: 1.5,
  wearyIsland: 8,
  weary: 70,
  /** Waffenstillstand: Dauer (s), Reparationen (Anteil der Kasse des Verlierers, höchstens) */
  truce: 1200,
  reparationShare: 0.25,
  reparationMax: 4000,
  /** Rückgabe beim Auflösen einer heimgekehrten Armada (Anteil der Baukosten je überlebendem Schiff) */
  refund: 0.4,
  /** Garnisonen werden je Zyklus um so viele Truppen aufgefüllt (kostet Rekruten) */
  reinforce: 4,
  /** Entsatz: höchstens einer je Insel in diesem Abstand (s), und nur mit Aussicht (Feuerkraft mindestens dieser Anteil der Belagerer) */
  reliefGap: 300,
  reliefOdds: 0.55,

  // ---------- 4.5B: Eingreifen des Spielers, Kontrollpunkte, Bündnisse, Kriegsaufträge ----------

  /** Ein versenktes Kommandoschiff (Flaggschiff der Armada) senkt die Moral der Belagerung um … */
  flagshipMoraleLoss: 0.22,
  /** Kontrollpunkte: Fangradius (m), Zeit (s) für einen ganzen Wechsel von −1 nach +1 bei klarer Übermacht, Wirkung auf den Fortschritt
   *  (Faktor `1 + pointK · Mittel`: alle beim Angreifer ×2,6, alle beim Verteidiger −0,6 = der Fortschritt läuft zurück) */
  pointRadius: 16,
  pointSeconds: 40,
  pointK: 1.6,
  /** Wie viele Köpfe die Spielfigur und ein Offizier an einem Kontrollpunkt zählen */
  playerPresence: 10,
  officerPresence: 4,
  /** Landkampf in Spielernähe: so viele Soldaten der Engine steht ein sichtbarer Kopf; aus der Reserve landet höchstens alle … s ein neuer Trupp je Seite */
  troopsPerHead: 2.5,
  reinforceEvery: 12,
  /** Hält der Verteidiger alle Punkte und fällt der Fortschritt auf 0, ist die Belagerung abgewehrt */
  repelAt: -0.95,
  /** Kriegspunkte des Spielers: versenktes Kommandoschiff, Transporter, anderes Kriegsschiff; eroberter Kontrollpunkt; aufgeriebener Trupp; Blockadebrecher-Lieferung */
  kp: { kommando: 40, transport: 30, schiff: 15, punkt: 20, trupp: 6, lieferung: 45 },
  /** Sofort-Lohn je Kriegspunkt (Gold) und Ansehen je … Kriegspunkte bei der begünstigten Macht */
  kpGold: 4,
  kpStanding: 15,
  /** Zweier-Bündnis: Vertrauen im Handelspakt, Dauer (s; verlängert sich, solange ein gemeinsamer Gegner bleibt) */
  allianceTrust: 45,
  allianceTime: 2400,
  /** Kriegsaufträge: Laufzeit (s), höchstens … gleichzeitig je Spieler, nötige Kriegspunkte für Entsatz und Invasion */
  contractTime: 900,
  maxContracts: 2,
  contractMerit: 60,
  /** Blockadebrecher: Wirkung der Lieferung (Garnison +, Moral der Belagerer −, Fortschritt −) */
  delivery: { garrison: 25, morale: 0.12, progress: 0.12 },
} as const;

// ---------- 4.7E: Logistik der Mächte (Patrouillen, Nachschub-Konvois, Seeblockaden, Gegenschläge, Reparaturen) ----------

/**
 * Zahlen der dauerhaft laufenden Welt-Simulation (4.7E). Alles, was hier aufgestellt wird, kostet echte Vorräte der Nation (Bau wie eine Armada,
 * dazu die Ladung) und zählt gegen die Obergrenzen `WAR_CAPS` (data/balanceConfig.ts).
 */
export const WAR_LOGI = {
  /** Patrouille: Schiffe, Dauer einer Streife (s), Sichtweite für das Abfangen feindlicher Konvois und Blockaden (m), Abstand zwischen zwei Aufstellungen je Nation (s) */
  patrolShips: 3,
  patrolTime: 780,
  patrolSight: 1500,
  patrolGap: 75,
  /** Nachschub-Konvoi zur Belagerung: aufgebrochen, wenn der Proviant der Belagerer unter diesen Anteil ihres Startvorrats fällt; höchstens einer je Armada */
  siegeLow: 0.55,
  /** Ladung je Transporter (Belagerungs-Nachschub bzw. Front-Konvoi zur Garnison einer bedrohten Insel) */
  siegeCargo: { proviant: 80, medizin: 22, rekruten: 34 } as Partial<ResourceBag>,
  frontCargo: { rekruten: 36, proviant: 50, kanonenstahl: 10, hartholz: 8 } as Partial<ResourceBag>,
  /** Front-Konvois je Nation höchstens alle … s (nur im Krieg) */
  frontGap: 240,
  /** Moral der Belagerer: + bei Ankunft eines Konvois, − bei seinem Verlust */
  deliverMorale: 0.12,
  lostMorale: 0.14,
  /** Anteil der Ladung, den der Sieger beim Kapern eines Konvois erbeutet */
  captureShare: 0.3,
  /** Seeblockade: Schiffe, Dauer (s), Abstand zwischen zwei Blockaden je Nation (s), nötige Bereitschaft (0 … 1) */
  blockadeShips: 4,
  blockadeTime: 600,
  blockadeGap: 420,
  blockadeReady: 0.5,
  /** Gegenschlag nach einem Inselverlust: frühestens nach … s, verfällt nach … s */
  counterDelay: 75,
  counterWindow: 1500,
  /** Reparatur: volle Reparatur eines Schiffs kostet diesen Anteil seiner Baukosten (Holz, Tuch, Stahl, Gold); Patrouillen reparieren ab diesem Rumpf im Heimathafen */
  repairK: 0.5,
  repairBelow: 0.7,
  /** Garnisons-Verstärkung: Gold und Proviant je Mann (dazu der Rekrut) */
  garrisonGold: 2,
  garrisonProviant: 1,
} as const;

export const PURPOSE_LABEL = { angriff: 'Armada', entsatz: 'Entsatzflotte', patrouille: 'Patrouille', konvoi: 'Nachschub-Konvoi', blockade: 'Blockadeflotte' } as const;

// ---------- Kriegsaufträge (4.5B) ----------

export type ContractKind = 'entsatz' | 'invasion' | 'abfangen' | 'blockade';

/** Grundlohn je Auftragsart (Gold, Boss-Siegel, Ehre, Ansehen beim Auftraggeber, Ansehensverlust beim Gegner) und Beschreibung */
export const CONTRACT_DEFS: Record<ContractKind, { title: string; gold: number; seals: number; honor: number; standing: number; foeStanding: number; text: string }> = {
  entsatz: { title: 'Belagerung entsetzen', gold: 950, seals: 1, honor: 30, standing: 12, foeStanding: -6, text: 'Kämpfe an der Seite der Verteidiger: versenke Kommandoschiff und Transporter, halte die Kontrollpunkte an Land, bis die Belagerung zusammenbricht.' },
  invasion: { title: 'Invasions-Armada anführen', gold: 1000, seals: 1, honor: 30, standing: 12, foeStanding: -8, text: 'Segle mit der Armada, erobere an Land Hafen-Barrikade, Marktplatz und Garnisons-Hof und bring die Insel zu Fall.' },
  abfangen: { title: 'Nachschubkonvoi abfangen', gold: 700, seals: 1, honor: 20, standing: 8, foeStanding: -5, text: 'Versenke einen Nachschub-Transporter der Armada, bevor er Truppen und Proviant an Land bringt.' },
  blockade: { title: 'Blockadebrecher-Lieferung', gold: 800, seals: 1, honor: 25, standing: 10, foeStanding: -4, text: 'Brich durch den Belagerungsring und bring 6 Medizin (oder 8 Kanonenstahl) im Frachtraum bis vor den Hafen der belagerten Insel.' },
};

/** Ladung für den Blockadebrecher: die erste Ware, von der genug an Bord ist, wird abgeliefert */
export const BLOCKADE_CARGO: readonly { good: 'medizin' | 'kanonenstahl'; n: number }[] = [{ good: 'medizin', n: 6 }, { good: 'kanonenstahl', n: 8 }];

/** Zuschlag auf den Lohn nach Größe der Zielinsel */
export const CONTRACT_TIER_K: Record<IslandTier, number> = { aussenposten: 0, siedlung: 0.25, hafen: 0.5, festung: 0.8, mega: 1.2, hauptstadt: 1 };

/** Namen der Kontrollpunkte einer Belagerung (2 bei kleinen Inseln, 3 bei Häfen, Festungen und Mega-Inseln) */
export const SIEGE_POINT_NAMES = { barrikade: 'Hafen-Barrikade', markt: 'Marktplatz', hof: 'Garnisons-Hof' } as const;
export type SiegePointKind = keyof typeof SIEGE_POINT_NAMES;
