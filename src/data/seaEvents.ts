// Das lebendige Meer (Phase 4.3C): alle Zahlen und Texte der Welt-Ereignisse, Handelskonvois, Meeresströmungen und Wetterzellen an EINEM Ort.
// Reine, JSON-taugliche Daten ohne three.js. Die Regeln stehen in world/worldEventDirector.ts (Ereignisse), world/tradeConvoys.ts (Konvois),
// world/oceanCurrents.ts (Windstraßen) und world/weatherCells.ts (Wetterfronten); die Kalibrierung der Weltbosse in data/balanceConfig.ts.
//
// Grundsatz „Opt-In“: Kein Ereignis taucht neben dem Spieler auf und greift ihn an. Alles erscheint weit weg (mindestens `DIRECTOR.spawnMin`),
// ist am Horizont an einem Signal zu erkennen (Goldrakete, Rauchfahne, Möwenschwarm, Gewitterwirbel) und wird erst feindlich, wenn der Spieler
// hinfährt (Zone der Blockade, Reichweite eines Weltbosses) oder selbst zuerst schießt.
import type { RingId } from './worldRings';
import type { FactionId } from './factions';
import type { GoodId } from './economy';
import type { ShipEvolution } from './shipEvolution';

// ---------- Director ----------

export type WorldEventKind = 'schatzgaleone' | 'blockade' | 'treibgut' | 'weltboss';
export const WORLD_EVENT_KINDS: readonly WorldEventKind[] = ['schatzgaleone', 'blockade', 'treibgut', 'weltboss'];

/** Signal am Horizont, an dem man ein Ereignis von weitem erkennt */
export type BeaconKind = 'goldrakete' | 'rauchfahne' | 'moewen' | 'gewitterwirbel';

export const DIRECTOR = {
  /** So viele Ereignisse laufen gleichzeitig auf der Weltkarte (Weltbosse zählen mit) */
  minActive: 4,
  maxActive: 6,
  /** Mindestabstand zweier Ereignisse (m, Mitte zu Mitte) */
  minSpacing: 1600,
  /** Abstand zu jedem Spieler beim Erscheinen (m): nie näher (kein Überfall), möglichst in Sichtweite der Horizont-Signale */
  spawnMin: 1100,
  spawnMax: 4000,
  /** Freiraum zur Küste (m über dem Platzbedarf `r · 1,45`) */
  islandClear: 140,
  /** Ruhe zwischen zwei neuen Ereignissen (s); fehlen noch welche zum Minimum, geht es schneller */
  spawnGap: 30,
  bootstrapGap: 2,
  /** Planungstakt (s) */
  tick: 1,
  /** Schiffe eines Ereignisses werden ab diesem Abstand zum Spieler echt (m) und jenseits von `dematerialize` wieder zu reinen Daten */
  materialize: 1500,
  dematerialize: 2300,
  /** Bis hierhin sind die Horizont-Signale zu sehen (m) */
  beaconRange: 5200,
  /** Ein beendetes Ereignis bleibt so lange in der Liste (s), damit Anzeige und Mehrspieler-Abgleich das Ende sehen */
  linger: 4,
} as const;

export interface WorldEventDef {
  kind: WorldEventKind;
  name: string;
  beacon: BeaconKind;
  /** Gewicht bei der Wahl des nächsten Ereignisses */
  weight: number;
  /** Wartezeit (s): ein beendetes Ereignis gibt seinen Platz erst danach wieder frei (Weltbosse: je Boss) */
  cooldown: number;
  /** Lebensdauer (s, von … bis); die Galeone lebt so lange wie ihre Fahrt */
  life: readonly [number, number];
  /** Ringe der offenen Welt, in denen es vorkommt */
  rings: readonly RingId[];
  /** Plätze dieser Art: höchstens so viele laufen gleichzeitig oder warten nach ihrem Ende */
  max: number;
  /** Zone (m): wer hineinfährt, wird angegriffen (Blockade) bzw. weckt den Boss; 0 = nur wer zuerst schießt */
  zone: number;
  info: string;
}

export const WORLD_EVENT_DEFS: Record<WorldEventKind, WorldEventDef> = {
  schatzgaleone: {
    kind: 'schatzgaleone', name: 'Schatz-Galeone', beacon: 'goldrakete', weight: 2, cooldown: 300, life: [900, 1800], rings: [2, 3, 4], max: 2, zone: 0,
    info: 'Ein gepanzertes Schatzschiff mit Begleitschutz auf langer Fahrt. Alle paar Sekunden steigt eine goldene Leuchtrakete auf. Wer es aufbringt, erbeutet Gold, Luxuswaren und Relikt-Splitter.',
  },
  blockade: {
    kind: 'blockade', name: 'Hafen-Blockade', beacon: 'rauchfahne', weight: 2, cooldown: 360, life: [1200, 1800], rings: [2, 3, 4], max: 2, zone: 420,
    info: 'Eine fremde Flotte sperrt einen Hafen: dichte schwarze Rauchfahne vor der Küste. Solange sie liegt, kosten Waren dort das Doppelte und die Schnellreise ist gesperrt.',
  },
  treibgut: {
    kind: 'treibgut', name: 'Treibgut-Feld', beacon: 'moewen', weight: 3, cooldown: 120, life: [600, 960], rings: [1, 2, 3, 4], max: 3, zone: 0,
    info: 'Kreisende Möwen über treibenden Trümmern: bergbare Kisten mit Planken, Segeltuch, Handelswaren und manchmal einer Schatzkarte.',
  },
  weltboss: {
    kind: 'weltboss', name: 'Weltboss', beacon: 'gewitterwirbel', weight: 1.6, cooldown: 900, life: [1500, 2400], rings: [4], max: 3, zone: 380,
    info: 'Ein Gewitterwirbel über der Tiefsee und ein tiefes Nebelhorn: dort zieht ein Weltboss seine Bahn.',
  },
};

/** Wer einen Hafen einer Macht blockiert, wenn es nicht die Kurogane-Schwarzsegler sind: ihr Rivale */
export const BLOCKADE_RIVAL: Record<FactionId, FactionId> = {
  england: 'frankreich', frankreich: 'england', niederlande: 'england', deutschland: 'niederlande', kurogane: 'niederlande', marine: 'kurogane',
};

// ---------- Weltbosse ----------

export type WorldBossId = 'klabautermann' | 'ryujin' | 'leviathan';
export const WORLD_BOSS_IDS: readonly WorldBossId[] = ['klabautermann', 'ryujin', 'leviathan'];

export interface WorldBossDef {
  id: WorldBossId;
  name: string;
  title: string;
  /** Schiff (Rumpf, Breitseiten, Entern) oder Seeungeheuer (Kanonenkugeln treffen den Körper) */
  form: 'schiff' | 'ungeheuer';
  /** Gegnerstufe: bestimmt Gefahrenstufe (`dangerOfLevel`, immer 4 – 5) und Schaden über `dangerScale` */
  level: number;
  /** Schiffsklasse (Index in SHIP_CLASSES); das Ungeheuer rechnet mit dem Leviathan-Rumpf */
  classTier: number;
  /** Faktor auf den Rumpf über der Kalibrierung `worldBossHull` (data/balanceConfig.ts) */
  hullK: number;
  evo: ShipEvolution;
  /** Siegel dieser Macht; null = Macht des Sektors, in dem der Boss fällt */
  sealPower: FactionId | null;
  /** Eigene Wetterzelle, die mit dem Boss zieht */
  cell: 'nebelbank' | 'gewitter';
  /** Aussehen (Schiffs-Bosse) */
  look?: { hull: string; stripe: string; sail: string; flagColor: string; power?: FactionId; ghost?: boolean };
  attacks: readonly string[];
  info: string;
}

export const WORLD_BOSSES: Record<WorldBossId, WorldBossDef> = {
  klabautermann: {
    id: 'klabautermann', name: 'Der Fliegende Klabautermann', title: 'Geister-Linienschiff', form: 'schiff', level: 16, classTier: 5, hullK: 1.15,
    evo: { hullTier: 5, sailTier: 4, cannonTier: 4 }, sealPower: null, cell: 'nebelbank',
    look: { hull: '#26332F', stripe: '#7FE0C8', sail: '#BFEFE4', flagColor: '#1E1A20', ghost: true },
    attacks: ['Spektral-Breitseiten (Rumpf und Mannschaft)', 'Nebelbank, die mit ihm zieht', 'Deck-Drehbassen'],
    info: 'Ein gepanzertes Linienschiff aus einer anderen Zeit, halb durchscheinend, immer in seinem eigenen Nebel. Seine Breitseiten leuchten geisterhaft grün und reißen ganze Mannschaften von Deck.',
  },
  ryujin: {
    id: 'ryujin', name: 'Kurogane-Flaggschiff „Ryujin“', title: 'Schweres Kriegsschiff der Stufe 5', form: 'schiff', level: 19, classTier: 6, hullK: 1.1,
    evo: { hullTier: 5, sailTier: 5, cannonTier: 5 }, sealPower: 'kurogane', cell: 'gewitter',
    look: { hull: '#1E1A20', stripe: '#C0392B', sail: '#2A2228', flagColor: '#C0392B', power: 'kurogane' },
    attacks: ['Rammsporn (panzerbrechend)', 'Deck-Drehbassen', 'Schwere Breitseiten'],
    info: 'Das Flaggschiff der Kurogane: schwarzer Rumpf, rote Segelnähte, ein Rammsporn aus Stahl und Drehbassen an jeder Reling. Es jagt im Gewitter.',
  },
  leviathan: {
    id: 'leviathan', name: 'Der Tiefsee-Leviathan', title: 'Gigantisches Seeungeheuer', form: 'ungeheuer', level: 21, classTier: 6, hullK: 1.25,
    evo: { hullTier: 5, sailTier: 5, cannonTier: 5 }, sealPower: null, cell: 'gewitter',
    attacks: ['Tentakel-Schläge (rote Warnringe auf dem Wasser)', 'Wellenstöße, die Schiffe wegdrücken', 'Abtauchen und Auftauchen'],
    info: 'Ein Ungeheuer aus der Tiefe, größer als jedes Schiff. Vor jedem Tentakelschlag färbt sich das Wasser rot; seine Wellenstöße schieben selbst einen Leviathan zur Seite.',
  },
};

/** Beute eines Weltbosses: garantiert Siegel (wie Endbosse, `SEAL_DROP`), Relikt-Splitter und ein Stück der Stufe 4 */
export const WORLD_BOSS_LOOT = { gold: 4200, goldPerLevel: 160, shardBonus: 1, xp: 2600, fame: 220, standing: 6, honor: 25 } as const;

// ---------- Handelskonvois ----------

export const CONVOY = {
  /** Höchstens so viele Konvois zugleich auf der Weltkarte und Pause zwischen zwei neuen (s) */
  max: 5,
  spawnGap: 70,
  bootstrapGap: 6,
  /** Abstand Abfahrt → Ziel (m) */
  minTrip: 900,
  maxTrip: 3800,
  /** Reisetempo als reine Daten (m/s; echte Schiffe fahren mit ihrer Physik) */
  speed: 7.5,
  /** Ladung: Wert zu Grundpreisen je Konvoi (Gold) */
  cargoValue: 2400,
  /** Eskorten je Gefahrenstufe (1 … 5) */
  escorts: [1, 1, 2, 2, 2] as readonly number[],
  /** Klasse des Frachters und der Eskorten je Gefahrenstufe */
  freighterClass: [2, 3, 3, 4, 4] as readonly number[],
  escortClass: [1, 2, 2, 3, 3] as readonly number[],
  /** Chance, dass ein Konvoi unterwegs von Korsaren bedroht wird; abseits des Spielers gehen so viele davon verloren */
  threatChance: 0.3,
  lostFar: 0.5,
  /** Korsaren je Überfall */
  corsairs: [1, 2, 2, 2, 3] as readonly number[],
  /** Belohnung für die Verteidigung: Gold je Gefahrenstufe, Ansehen und Ehre bei der Macht des Konvois */
  defendGold: 380,
  defendStanding: 5,
  defendHonor: 12,
  /** Ankunftsradius am Ziel (m) */
  arrive: 160,
} as const;

// ---------- Treibgut ----------

export type CrateKind = 'planken' | 'segeltuch' | 'ware' | 'karte';
export const FLOTSAM = {
  crates: [5, 8] as readonly [number, number],
  /** Chance einer Schatzkarte je Feld */
  mapChance: 0.35,
  /** Anteil der Kisten mit Handelsware, Planken, Segeltuch */
  goodsShare: 0.4,
  /** Bergungsradius um den Rumpf (m) */
  pickup: 9,
  /** Ausdehnung des Feldes (m) */
  spread: 70,
} as const;

// ---------- Meeresströmungen (Windstraßen) ----------

/** +35 % Fahrt in Strömungsrichtung (Kern der Strömung, Kurs innerhalb von etwa ±20°) */
export const CURRENT_BOOST = 0.35;

export interface CurrentLaneDef {
  id: string;
  name: string;
  /** Häfen, zwischen denen die Strömung läuft (Insel-Kennungen); sie fließt von `from` nach `to` */
  from: string;
  to: string;
  /** Breite des Bandes (m) */
  width: number;
}

/** Windstraßen zwischen den wichtigsten Handels-Archipelen der Ringe 1 – 3 (abwechselnd hinaus und herein) */
export const CURRENT_LANES: readonly CurrentLaneDef[] = [
  { id: 'bernsteinpassat', name: 'Bernstein-Passat', from: 'ankerglueck', to: 'nebelhafen', width: 150 },
  { id: 'albionstrom', name: 'Albion-Strom', from: 'nebelhafen', to: 'koenigshafen', width: 150 },
  { id: 'hansestrom', name: 'Hansestrom', from: 'kiefernhafen', to: 'ankerglueck', width: 150 },
  { id: 'bernsteinkuestenstrom', name: 'Ostsee-Drift', from: 'kiefernhafen', to: 'bernsteinkueste', width: 140 },
  { id: 'eisenstrom', name: 'Eisenstrom', from: 'donnergiesserei', to: 'eisenfels', width: 140 },
  { id: 'glutstrom', name: 'Glutstrom', from: 'ankerglueck', to: 'glutheim', width: 150 },
  { id: 'aschestrom', name: 'Asche-Drift', from: 'aschezahn', to: 'glutheim', width: 140 },
  { id: 'gewuerzstrom', name: 'Gewürzstrom', from: 'banda', to: 'donnerbucht', width: 150 },
  { id: 'grachtenstrom', name: 'Grachten-Drift', from: 'banda', to: 'nieuwhoorn', width: 140 },
  { id: 'weinstrom', name: 'Weinstraße', from: 'ankerglueck', to: 'letzterhafen', width: 150 },
  { id: 'lilienstrom', name: 'Lilien-Drift', from: 'sonnenweinkap', to: 'letzterhafen', width: 140 },
];

// ---------- Wetterzellen ----------

export type WeatherCellKind = 'gewitter' | 'nebelbank' | 'flaute';

/** Wetterwerte (wie WeatherDef in data/world.ts), die eine Zelle in ihrem Kern setzt */
export interface CellParams { clouds: number; cloudDark: number; visibility: number; grey: number; rain: number; waves: number; wind: number; lightning: number; light: number }

export interface WeatherCellDef {
  kind: WeatherCellKind;
  label: string;
  icon: string;
  /** Radius (m), Zuggeschwindigkeit (m/s), Lebensdauer (s) je von … bis */
  r: readonly [number, number];
  speed: readonly [number, number];
  life: readonly [number, number];
  weight: number;
  params: CellParams;
  /** Faktor auf die Fahrt im Kern (Flaute: kaum Wind in den Segeln) */
  speedK: number;
  /** Faktor auf die Sichtweite der KI-Schiffe im Kern (Nebel: man sieht einander später) */
  sightK: number;
  info: string;
}

export const WEATHER_CELL_DEFS: Record<WeatherCellKind, WeatherCellDef> = {
  gewitter: {
    kind: 'gewitter', label: 'Gewitterfront', icon: '⛈', r: [420, 680], speed: [2.2, 3.6], life: [900, 1500], weight: 2,
    params: { clouds: 1, cloudDark: 0.86, visibility: 0.46, grey: 0.75, rain: 0.95, waves: 2.45, wind: 0.95, lightning: 6, light: 0.42 },
    speedK: 0.95, sightK: 0.8,
    info: 'Schwarze Wolkentürme, Blitze und hoher Seegang: gesetztes Tuch reißt leichter.',
  },
  nebelbank: {
    kind: 'nebelbank', label: 'Nebelbank', icon: '🌫', r: [480, 760], speed: [1.2, 2.2], life: [1000, 1600], weight: 2,
    params: { clouds: 0.62, cloudDark: 0.2, visibility: 0.16, grey: 0.82, rain: 0, waves: 0.7, wind: 0.12, lightning: 0, light: 0.62 },
    speedK: 1, sightK: 0.45,
    info: 'Dichter Nebel: die Sicht schrumpft auf wenige Schiffslängen, Gegner entdecken dich erst spät.',
  },
  flaute: {
    kind: 'flaute', label: 'Flaute', icon: '≈', r: [520, 820], speed: [0.8, 1.6], life: [900, 1400], weight: 1.5,
    params: { clouds: 0.22, cloudDark: 0, visibility: 1, grey: 0, rain: 0, waves: 0.42, wind: 0.02, lightning: 0, light: 1.05 },
    speedK: 0.55, sightK: 1,
    info: 'Windstille: das Meer liegt glatt, die Segel hängen schlaff – nur Strömungen tragen noch.',
  },
};

export const WEATHER_CELLS = {
  /** So viele Wetterzellen ziehen gleichzeitig über die Welt (Bosszellen kommen dazu) */
  count: 6,
  spawnGap: 40,
  /** Abstand neuer Zellen zum Spieler (m): nie direkt über ihm, gern in Sichtweite */
  spawnMin: 1300,
  spawnMax: 4200,
  /** Ein- und Ausblenden einer Zelle (s) */
  fade: 60,
  /** Kern: bis hierhin (Anteil des Radius) volle Stärke */
  core: 0.55,
} as const;

/** Waren, die ein Treibgut-Feld führen kann (Handel der Region kommt dazu) */
export const FLOTSAM_GOODS: readonly GoodId[] = ['stoffe', 'tuch', 'tee', 'wein', 'gewuerze', 'werkzeuge'];
