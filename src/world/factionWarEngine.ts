// FactionWarEngine (Phase 4.5A): das autonome Ökosystem der Mächte – Staats- und Kriegskassen, Produktion aus gehaltenen Inseln, eine
// Nutzen-KI je Nation (Zielwahl, Kriegserklärung, Entsatz), Diplomatie (Allianz, Handelspakt, Neutral, Rivalität, Offener Krieg) mit Vertrauen,
// Kriegsmüdigkeit, Waffenstillständen und Anti-Hegemon-Koalitionen, Armadas aus 6 – 10 Schiffen, Großschlachten auf See und Belagerungen.
//
// Rein, deterministisch und JSON-tauglich: kein three.js, kein `Math.random` (eigener Zufallsgenerator im Zustand), keine Netze. Der ganze Zustand
// (`FactionWarState`) steht im Spielstand (`SaveData.world.factionWar`, Version 20) und ist für den Abgleich über einen Welt-Server vorbereitet
// (Phase 4.8). Die Seewelt (world/factionWarLive.ts) macht in Spielernähe echte Schiffe und Truppen daraus und schreibt Rumpf, Lage und Verluste
// zurück; entschieden wird hier. Läuft eine Schlacht fern vom Spieler (entladene Chunks), rechnet die Engine sie aus Flottenstärke, Ausbaustufen
// (`ship.evo`) und Nachschub selbst aus.
//
// Erweiterbar: alle Mächte kommen aus dem `NationRegistry` (data/nations.ts `NATION_DEFS`); im Kern steht keine einzige Macht beim Namen. Eine neue
// Nation ist ein `register(def)` – der Zustand ergänzt sich beim Laden (`ensureNations`).
//
// Keine Zuweisungen pro Takt: Bewegung, Gefechte, Belagerungen, Nutzen-Bewertung und Abfragen laufen über Indizes und vorab angelegte Arbeitsfelder.
// Neue Objekte entstehen nur bei Ereignissen (Armada, Schlacht, Belagerung, Meldung).
import {
  BASE_YIELD, GARRISON_BASE, GOOD_YIELD, ISLAND_UPKEEP, NATION_DEFS, NEUTRAL_GARRISON, PROFILE_ONLY_K, RESOURCE_CAP, RESOURCE_IDS, RESOURCE_TARGET, STATE_UPKEEP,
  WAR_RESERVE, YIELD_K,
  RESOURCE_VALUE, ROLE_PLAN, SHIP_COST, START_RELATIONS, STRATEGIC_VALUE, TRANSPORT_SUPPLY, TROOPS_PER_SHIP, WAR, WAR_RESOURCES, emptyBag, pairKey,
  CONTRACT_DEFS, CONTRACT_TIER_K, SIEGE_POINT_NAMES,
  type ArmadaRole, type ContractKind, type DiplomacyState, type IslandTier, type NationDefinition, type ResourceBag, type ResourceId, type SiegePointKind,
} from '../data/nations';
import { ISLAND_PROFILES, profileOf, type GoodId } from '../data/economy';
import { SHIP_CLASSES } from '../data/ships';
import type { IslandDef } from '../data/regions';
import { routeAround, type RouteObstacle } from './oceanCurrents';
import { advanceOnRoute } from './tradeConvoys';

// ---------------------------------------------------------------------------------------------------------------
// Register der Nationen
// ---------------------------------------------------------------------------------------------------------------

/** Alle Nationen als reines Register: Definitionen in fester Reihenfolge, Nachschlagen über die Kennung */
export class NationRegistry {
  private readonly defs: NationDefinition[] = [];
  private readonly idx = new Map<string, number>();
  constructor(defs: readonly NationDefinition[] = NATION_DEFS) { for (const d of defs) this.register(d); }

  /** Nation eintragen (oder eine bestehende Definition ersetzen); liefert ihre Nummer */
  register(def: NationDefinition): number {
    const have = this.idx.get(def.id);
    if (have !== undefined) { this.defs[have] = def; return have; }
    this.defs.push(def);
    this.idx.set(def.id, this.defs.length - 1);
    return this.defs.length - 1;
  }
  get count(): number { return this.defs.length; }
  at(i: number): NationDefinition { return this.defs[i]; }
  get(id: string | null | undefined): NationDefinition | undefined { const i = id ? this.idx.get(id) : undefined; return i === undefined ? undefined : this.defs[i]; }
  indexOf(id: string | null | undefined): number { if (!id) return -1; const i = this.idx.get(id); return i === undefined ? -1 : i; }
  has(id: string): boolean { return this.idx.has(id); }
  list(): readonly NationDefinition[] { return this.defs; }
}

// ---------------------------------------------------------------------------------------------------------------
// Inseln
// ---------------------------------------------------------------------------------------------------------------

/** Was die Engine von einer Insel braucht (unveränderlich, aus den Inseldaten berechnet) */
export interface WarIsland {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  ring: number;
  tier: IslandTier;
  /** Gründer (Besitzer beim Weltstart, Nation-Kennung) */
  founder: string | null;
  /** Darf den Besitzer wechseln (Kolonien, Grenzfesten, Mega-Inseln) */
  conquerable: boolean;
  /** Geschützt: das neutrale Zentrum (Ankerglück und die Bernsteinsee), Hauptstädte, Marine-Hauptquartier und Raid-Festungen */
  protected: boolean;
  /** Liefert Erträge an ihren Besitzer */
  produces: boolean;
  mega: boolean;
  /** Strategischer Wert (0 … 1): Meerengen und Mega-Inseln sind Ziele für Großoffensiven */
  strategic: number;
  /** Ertrag je Zyklus bei voller Produktion */
  yield: ResourceBag;
  /** Volle Garnison */
  garrisonMax: number;
}

const ISLAND_LOOT_KINDS = new Set(['camp', 'ruin', 'treasure', 'boss']);

/** Größenklasse einer Insel für Ertrag, Garnison und strategischen Wert */
export function islandTier(def: IslandDef, capital: boolean): IslandTier {
  if (capital) return 'hauptstadt';
  if (def.mega) return 'mega';
  if (def.marine === 'border' || def.kind === 'marinefort' || def.kind === 'citadel') return 'festung';
  if (def.kind === 'harbor' || def.kind === 'town') return 'hafen';
  if (def.site) return 'siedlung';
  return 'aussenposten';
}

/**
 * Inseldaten → `WarIsland`. Eroberbar sind Kolonien (Häfen, Siedlungen, Themen-Inseln, ruhige Außenposten), die Grenzfesten der Marine und alle
 * Mega-Inseln; geschützt sind Ankerglück samt Bernsteinsee (Ring 1, das neutrale Zentrum), alle Hauptstädte (die Raid-Festungen und das
 * Marine-Hauptquartier Weißwacht). Piratenlager, Ruinen, Schatz- und Legenden-Inseln gehören zur Abenteuerwelt und wechseln nie den Besitzer.
 */
export function warIslandOf(def: IslandDef, registry: NationRegistry): WarIsland {
  let capital = false;
  for (const n of registry.list()) if (n.capital === def.id) { capital = true; break; }
  const founder = def.factionId && registry.has(def.factionId) ? def.factionId : null;
  const tier = islandTier(def, capital);
  const theme = def.themePower !== undefined && !!def.site && !def.mega;
  const adventure = ISLAND_LOOT_KINDS.has(def.kind) && !theme && !def.mega;
  const protectedIsl = capital || def.id === 'ankerglueck' || (def.ring ?? 1) <= 1 || def.kind === 'citadel' || def.marine === 'hq';
  const conquerable = !protectedIsl && !def.skerry && !def.uncharted && !adventure && (founder !== null || !!def.mega);
  const produces = (founder !== null || !!def.mega) && !def.skerry && !adventure;
  // Ertrag: Grundertrag der Größenklasse plus die Waren, die die Insel im Überschuss herstellt
  const y = emptyBag();
  const base = BASE_YIELD[tier];
  for (const r of RESOURCE_IDS) y[r] = base[r] ?? 0;
  if (produces) {
    const own = !!ISLAND_PROFILES[def.id] || def.kind === 'harbor' || def.kind === 'town';
    const k = own ? 1 : PROFILE_ONLY_K;
    const prof = profileOf({ id: def.id, region: def.region, factionId: def.factionId });
    for (const g of prof.produce) {
      const gy = GOOD_YIELD[g as GoodId];
      for (const r of RESOURCE_IDS) y[r] += (gy[r] ?? 0) * k;
    }
  } else for (const r of RESOURCE_IDS) y[r] = 0;
  for (const r of RESOURCE_IDS) y[r] *= YIELD_K[r];
  return {
    id: def.id, name: def.name, x: def.x, z: def.z, r: def.r, ring: def.ring ?? 1, tier, founder,
    conquerable, protected: protectedIsl, produces, mega: !!def.mega,
    strategic: STRATEGIC_VALUE[tier], yield: y,
    garrisonMax: founder === null && def.mega ? NEUTRAL_GARRISON : GARRISON_BASE[tier],
  };
}

/** Alle Inseln, die für das Ökosystem zählen (erobernswert oder produzierend), dazu die Hindernisse für Routen (alle Inseln) */
export function warWorldFromDefs(defs: readonly IslandDef[], registry: NationRegistry, reach = 1.45): { islands: WarIsland[]; obstacles: RouteObstacle[] } {
  const islands: WarIsland[] = [];
  const obstacles: RouteObstacle[] = [];
  for (const d of defs) {
    obstacles.push({ x: d.x, z: d.z, c: d.r * reach + 70 });
    const w = warIslandOf(d, registry);
    if (w.conquerable || w.produces) islands.push(w);
  }
  return { islands, obstacles };
}

// ---------------------------------------------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------------------------------------------

export interface NationState {
  id: string;
  stock: ResourceBag;
  /** Ertrag des letzten Zyklus (Anzeige) */
  income: ResourceBag;
  /** Kampfkraft: Feuerkraft der Reserve (aus den Vorräten) plus Garnisonen (Bewertung der KI, Waffenstillstand) */
  strength: number;
  /** Anteil an den Gesamtressourcen 0 … 1 */
  share: number;
  /** Gehaltene Inseln und Mega-Inseln */
  islands: number;
  megas: number;
  nextBrainAt: number;
  shipsLost: number;
  islandsLost: number;
  islandsWon: number;
  hegemon: boolean;
}

export interface IslandWarState {
  owner: string | null;
  garrison: number;
  /** Insellager: Erträge sammeln sich hier und gehen je Zyklus an die Kasse; belagerte Inseln liefern nicht (Beute für den Sieger) */
  store: ResourceBag;
  /** Spielzeit der letzten Eroberung (−1 = nie): Unruhe und Kriegspreise */
  conqueredAt: number;
  siegeId: string | null;
  /** Letzter Entsatz für diese Insel (Spielzeit): höchstens alle `WAR.reliefGap` Sekunden */
  reliefAt: number;
}

export interface ArmadaShip {
  id: string;
  role: ArmadaRole;
  /** Klassenindex 0 (Schaluppe) … 6 (Leviathan) */
  cls: number;
  hullTier: number;
  sailTier: number;
  cannonTier: number;
  /** Rumpf und Segel 0 … 1 */
  hull: number;
  sail: number;
  down: boolean;
  /** Platz in der Formation (0 = Kommandoschiff) */
  slot: number;
}

export type ArmadaPurpose = 'angriff' | 'entsatz';
export type ArmadaStatus = 'anmarsch' | 'gefecht' | 'belagerung' | 'heimkehr' | 'aufgeloest';

export interface ArmadaState {
  id: string;
  nation: string;
  purpose: ArmadaPurpose;
  /** Ziel- und Heiminsel */
  target: string;
  home: string;
  x: number;
  z: number;
  heading: number;
  /** Route (flach x, z, …) und nächster Wegpunkt */
  route: number[];
  leg: number;
  status: ArmadaStatus;
  /** Status vor dem Gefecht (danach geht es dort weiter) */
  resume: ArmadaStatus;
  ships: ArmadaShip[];
  /** Landungskorps (Truppen) und geladener Nachschub */
  troops: number;
  supply: { proviant: number; medizin: number };
  morale: number;
  /** Feuerkraft beim Auslaufen (Rückzugs-Schwelle) */
  firepower0: number;
  createdAt: number;
  endedAt: number;
  battleId: string | null;
  siegeId: string | null;
  /** Teil einer Koalitions-Offensive gegen den Hegemon */
  coalition: boolean;
  /** Geschlagen: bis zu dieser Spielzeit stellt sich die Armada keiner neuen Schlacht (sie zieht sich zurück) */
  calmUntil: number;
  /** Echte Schiffe in der Seewelt (Lage und Rumpf kommen von dort) */
  live: boolean;
}

export type BattleReason = 'sieg' | 'rueckzug' | 'vernichtet';

export interface GrandBattleState {
  id: string;
  x: number;
  z: number;
  /** Armadas beider Seiten und ihre Nationen */
  a: string;
  b: string;
  nationA: string;
  nationB: string;
  /** Schlacht vor einer belagerten Insel (Entsatz) */
  islandId: string | null;
  startedAt: number;
  t: number;
  live: boolean;
  ended: boolean;
  endedAt: number;
  winner: string | null;
  reason: BattleReason | null;
  sunkA: number;
  sunkB: number;
}

export type SiegeOutcome = 'erobert' | 'abgebrochen';
export type SiegeSide = 'angreifer' | 'verteidiger';

/**
 * Taktischer Kontrollpunkt einer Belagerung (4.5B): Hafen-Barrikade, Marktplatz, Garnisons-Hof. `hold` −1 (Verteidiger) … +1 (Angreifer), 0 = umkämpft.
 * Die Lage steht in Weltkoordinaten (die Seewelt rückt sie auf begehbaren Boden); verschoben wird der Wert nur von echten Kämpfern vor Ort
 * (`controlStep`), in der Hintergrund-Rechnung bleibt er stehen.
 */
export interface SiegePoint {
  kind: SiegePointKind;
  name: string;
  x: number;
  z: number;
  hold: number;
}

export interface SiegeState {
  id: string;
  islandId: string;
  attacker: string;
  defender: string | null;
  armadaId: string;
  /** Fortschritt 0 … 1 (1 = die Insel fällt), Moral der Belagerer 0 … 1 */
  progress: number;
  morale: number;
  /** Landungskorps und Garnison */
  troops: number;
  garrison: number;
  startedAt: number;
  t: number;
  transportsLost: number;
  /** Ruht, solange die Belagerungsflotte in einer Seeschlacht steht */
  paused: boolean;
  live: boolean;
  ended: boolean;
  endedAt: number;
  outcome: SiegeOutcome | null;
  /** Kontrollpunkte an Land (4.5B) */
  points: SiegePoint[];
  /** Spieler, die an dieser Belagerung Partei ergriffen haben (Mehrspieler-tauglich: je Spieler eine Seite) */
  helpers: { playerId: string; side: SiegeSide }[];
}

export type ContractStatus = 'aktiv' | 'erfuellt' | 'gescheitert' | 'aufgegeben';
export interface ContractReward { gold: number; seals: number; honor: number; standing: number; foeStanding: number }

/** Angebot eines Kriegsauftrags (aus den laufenden Aktionen der Engine abgeleitet, nicht gespeichert) */
export interface ContractOffer {
  /** Kennung des Angebots: Art und Bezug (`entsatz:bl12`, `invasion:ar7` …) */
  offerId: string;
  kind: ContractKind;
  title: string;
  text: string;
  /** Auftraggeber und Gegner (Nationen) */
  client: string;
  opponent: string | null;
  islandId: string;
  islandName: string;
  siegeId: string | null;
  armadaId: string | null;
  /** Seite an Land, auf die der Auftrag den Spieler stellt */
  side: SiegeSide | null;
  /** Nötige Kriegspunkte (Entsatz, Invasion) bzw. Zahl der Ziele (versenkte Transporter, Lieferung) */
  need: number;
  goal: number;
  reward: ContractReward;
}

/** Angenommener Kriegsauftrag eines Spielers (im Zustand, Spielstand und Welt-Server) */
export interface WarContract {
  id: string;
  offerId: string;
  kind: ContractKind;
  playerId: string;
  client: string;
  opponent: string | null;
  islandId: string;
  siegeId: string | null;
  armadaId: string | null;
  side: SiegeSide | null;
  acceptedAt: number;
  deadline: number;
  /** Gesammelte Kriegspunkte für den Auftraggeber an dieser Insel, erreichte Ziele */
  merit: number;
  need: number;
  done: number;
  goal: number;
  status: ContractStatus;
  endedAt: number;
  /** Warum der Auftrag endete (Anzeige) */
  note: string;
  reward: ContractReward;
}

export interface RelationState {
  a: string;
  b: string;
  state: DiplomacyState;
  /** Vertrauen −100 … 100 */
  trust: number;
  /** Kriegsmüdigkeit dieses Konflikts 0 … 100 */
  weariness: number;
  since: number;
  /** Waffenstillstand bis (Spielzeit); bis dahin kein neuer Krieg */
  truceUntil: number;
  /** Koalition, zu der dieses Bündnis gehört */
  coalition: string | null;
  /** Zweier-Militärbündnis (4.5B) gilt bis zu dieser Spielzeit (0 = keines; verlängert sich, solange ein gemeinsamer Gegner bleibt) */
  allianceUntil: number;
}

export interface CoalitionState {
  id: string;
  /** Der Hegemon, gegen den sich die Koalition richtet */
  against: string;
  members: string[];
  formedAt: number;
  /** Gemeinsamer Angriffszeitpunkt der Mitglieder */
  strikeAt: number;
  /** Seit wann der Hegemon unter der Auflösungsschwelle liegt (−1 = darüber) */
  calmSince: number;
}

export interface FactionWarState {
  v: 1;
  /** Uhr der Engine (s Spielzeit) */
  t: number;
  seq: number;
  rng: number;
  nations: Record<string, NationState>;
  islands: Record<string, IslandWarState>;
  relations: RelationState[];
  armadas: ArmadaState[];
  battles: GrandBattleState[];
  sieges: SiegeState[];
  coalitions: CoalitionState[];
  nextCycleAt: number;
  nextDiplomacyAt: number;
  hegemon: string | null;
  stats: { wars: number; battles: number; conquests: number; ceasefires: number; pacts: number; coalitions: number; armadas: number; alliances: number; contracts: number };
  /** Angenommene Kriegsaufträge aller Spieler (4.5B) */
  contracts: WarContract[];
  /** Kriegspunkte je Spieler und begünstigter Nation (4.5B) */
  merit: Record<string, Record<string, number>>;
}

export type WarNotice =
  /** `ally`: die Nation zieht als Verbündete von `ally` mit in den Krieg (Bündnisfall) */
  | { type: 'krieg'; a: string; b: string; ally?: string }
  | { type: 'buendnis'; a: string; b: string }
  | { type: 'buendnisEnde'; a: string; b: string }
  | { type: 'punkt'; siegeId: string; islandId: string; name: string; side: SiegeSide; nation: string | null }
  | { type: 'kriegspunkte'; playerId: string; nation: string; kp: number; reason: string }
  | { type: 'auftrag'; contract: WarContract }
  | { type: 'waffenstillstand'; a: string; b: string; payer: string; gold: number }
  | { type: 'handelspakt'; a: string; b: string }
  | { type: 'koalition'; against: string; members: string[] }
  | { type: 'koalitionEnde'; against: string }
  | { type: 'armada'; armada: ArmadaState }
  | { type: 'schlacht'; battle: GrandBattleState }
  | { type: 'schlachtEnde'; battle: GrandBattleState }
  | { type: 'belagerung'; siege: SiegeState }
  | { type: 'transport'; armada: ArmadaState; siegeId: string | null }
  | { type: 'gefallen'; islandId: string; from: string | null; to: string; loot: number }
  | { type: 'belagerungEnde'; siege: SiegeState };

/** Wie lange beendete Schlachten, Belagerungen und Armadas noch in der Liste stehen (Karte, Meldungen) */
const LINGER = 120;
/** Höchstens so viele Hintergrund-Schritte je Aufruf (nach langen Pausen wird nicht stundenlang nachgerechnet) */
const MAX_STEPS = 30;
/** So lange (s) bleibt ein beendeter Kriegsauftrag im Zustand (Anzeige des Ausgangs) */
const CONTRACT_LINGER = 600;

// ---------------------------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------------------------

function nextRandom(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number) => clamp(v, 0, 1);

/** Trefferpunkte eines Schiffs nach Klasse und Rumpf-Stufe */
export const shipHp = (s: ArmadaShip): number => SHIP_CLASSES[clamp(s.cls, 0, 6)].hp * (0.8 + 0.12 * s.hullTier);
/** Feuerkraft eines Schiffs: Kanonen nach Klasse, Kanonen-Stufe, Zustand des Rumpfs */
export const shipFire = (s: ArmadaShip): number => (s.down ? 0 : SHIP_CLASSES[clamp(s.cls, 0, 6)].can * (0.75 + 0.12 * s.cannonTier) * (0.45 + 0.55 * clamp01(s.hull)));

/** Feuerkraft einer Armada (Moral wirkt mit) */
export function armadaFire(a: ArmadaState): number {
  let f = 0;
  for (let i = 0; i < a.ships.length; i++) f += shipFire(a.ships[i]);
  return f * (0.6 + 0.4 * clamp01(a.morale));
}

/** Lebende Kriegsschiffe (ohne Transporter) */
export function warshipsAlive(a: ArmadaState): number {
  let n = 0;
  for (let i = 0; i < a.ships.length; i++) { const s = a.ships[i]; if (!s.down && s.role !== 'transport') n++; }
  return n;
}
export function shipsAlive(a: ArmadaState): number {
  let n = 0;
  for (let i = 0; i < a.ships.length; i++) if (!a.ships[i].down) n++;
  return n;
}

/** Kosten einer Armada aus ihren Schiffen, Truppen und Nachschub (in `out`) */
export function armadaCost(ships: readonly { role: ArmadaRole; cls: number; hullTier: number; sailTier: number; cannonTier: number }[], out: ResourceBag): ResourceBag {
  for (const r of RESOURCE_IDS) out[r] = 0;
  for (const s of ships) {
    const c = SHIP_COST[clamp(s.cls, 0, 6)];
    const evoK = 1 + 0.1 * ((s.hullTier + s.sailTier + s.cannonTier) / 3 - 3);
    for (const r of RESOURCE_IDS) out[r] += (c[r] ?? 0) * evoK;
    out.rekruten += TROOPS_PER_SHIP[s.role] * 0.5;
    if (s.role === 'transport') { out.proviant += TRANSPORT_SUPPLY.proviant; out.medizin += TRANSPORT_SUPPLY.medizin; }
  }
  return out;
}

const valueOf = (b: ResourceBag): number => {
  let v = 0;
  for (const r of RESOURCE_IDS) v += b[r] * RESOURCE_VALUE[r];
  return v;
};

// ---------------------------------------------------------------------------------------------------------------
// Neuer Zustand
// ---------------------------------------------------------------------------------------------------------------

export function newWarState(registry: NationRegistry, islands: readonly WarIsland[], seed = 0x4a5e5): FactionWarState {
  const s: FactionWarState = {
    v: 1, t: 0, seq: 0, rng: seed >>> 0, nations: {}, islands: {}, relations: [], armadas: [], battles: [], sieges: [], coalitions: [],
    nextCycleAt: WAR.cycle, nextDiplomacyAt: WAR.diplomacyEvery, hegemon: null,
    stats: { wars: 0, battles: 0, conquests: 0, ceasefires: 0, pacts: 0, coalitions: 0, armadas: 0, alliances: 0, contracts: 0 },
    contracts: [], merit: {},
  };
  for (const i of islands) s.islands[i.id] = { owner: i.founder, garrison: i.garrisonMax, store: emptyBag(), conqueredAt: -1, siegeId: null, reliefAt: -1e9 };
  ensureNations(s, registry);
  return s;
}

/** Nationen ergänzen, die im Register stehen, aber noch nicht im Zustand (neue Nationen nach einem Update, ältere Spielstände) */
export function ensureNations(s: FactionWarState, registry: NationRegistry): void {
  for (let i = 0; i < registry.count; i++) {
    const def = registry.at(i);
    if (s.nations[def.id]) continue;
    const stock = emptyBag();
    for (const r of RESOURCE_IDS) stock[r] = RESOURCE_TARGET[r] * def.startStock;
    s.nations[def.id] = {
      id: def.id, stock, income: emptyBag(), strength: 0, share: 0, islands: 0, megas: 0, nextBrainAt: s.t + 20 + i * 4.5,
      shipsLost: 0, islandsLost: 0, islandsWon: 0, hegemon: false,
    };
  }
  for (let i = 0; i < registry.count; i++) for (let j = i + 1; j < registry.count; j++) {
    const a = registry.at(i).id, b = registry.at(j).id;
    const lo = a < b ? a : b, hi = a < b ? b : a;
    if (s.relations.some((r) => r.a === lo && r.b === hi)) continue;
    const st = START_RELATIONS[pairKey(a, b)];
    s.relations.push({ a: lo, b: hi, state: st?.state ?? 'neutral', trust: st?.trust ?? 0, weariness: 0, since: s.t, truceUntil: 0, coalition: null, allianceUntil: 0 });
  }
}

/**
 * Kontrollpunkte einer Belagerung (4.5B), deterministisch aus Insel und Anmarschrichtung der Flotte: die Hafen-Barrikade an der Küste auf der Seite
 * der Flotte, der Marktplatz im Ort, der Garnisons-Hof im Inneren auf der abgewandten Seite (nur Häfen, Festungen, Mega-Inseln und Hauptstädte).
 */
export function siegePoints(w: Pick<WarIsland, 'x' | 'z' | 'r' | 'tier'>, fromAngle: number): SiegePoint[] {
  const three = w.tier === 'hafen' || w.tier === 'festung' || w.tier === 'mega' || w.tier === 'hauptstadt';
  const put = (kind: SiegePointKind, ang: number, rk: number): SiegePoint => ({
    kind, name: SIEGE_POINT_NAMES[kind], x: w.x + Math.sin(ang) * w.r * rk, z: w.z + Math.cos(ang) * w.r * rk, hold: 0,
  });
  const out = [put('barrikade', fromAngle, 0.6), put('markt', fromAngle + 0.95, 0.3)];
  if (three) out.push(put('hof', fromAngle + Math.PI * 0.8, 0.32));
  return out;
}

/** Mittel der Kontrollpunkte (−1 alle beim Verteidiger … +1 alle beim Angreifer; ohne Punkte 0) */
export function pointsMean(sg: Pick<SiegeState, 'points'>): number {
  const p = sg.points;
  if (!p || !p.length) return 0;
  let m = 0;
  for (let i = 0; i < p.length; i++) m += p[i].hold;
  return m / p.length;
}

// ---------------------------------------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------------------------------------

export interface WarInterest { x: number; z: number }

export class FactionWarEngine {
  state: FactionWarState;
  readonly registry: NationRegistry;
  readonly islands: readonly WarIsland[];
  private readonly obstacles: readonly RouteObstacle[];
  private readonly islandIndex = new Map<string, number>();
  /** Zustand je Insel in der Reihenfolge von `islands` (Verweise in `state.islands`) */
  private isl: IslandWarState[] = [];
  /** Beziehung je Nationen-Paar: Index in `state.relations` (Matrix N × N) */
  private rel: Int32Array = new Int32Array(0);
  private notices: WarNotice[] = [];
  private acc = 0;
  private readonly rnd = () => nextRandom(this.state);
  // Arbeitsfelder (keine Zuweisung je Takt)
  private readonly bag = emptyBag();
  private readonly bag2 = emptyBag();

  private value: Float64Array = new Float64Array(0);
  private neighbor: Float64Array = new Float64Array(0);
  private readonly planScratch: { role: ArmadaRole; cls: number; hullTier: number; sailTier: number; cannonTier: number }[] = [];

  constructor(registry: NationRegistry, islands: readonly WarIsland[], obstacles: readonly RouteObstacle[] = [], state?: FactionWarState | null, seed = 0x4a5e5) {
    this.registry = registry;
    this.islands = islands;
    this.obstacles = obstacles;
    islands.forEach((w, i) => this.islandIndex.set(w.id, i));
    this.state = state ?? newWarState(registry, islands, seed);
    this.reindex();
  }

  /** Nach dem Laden oder dem Eintragen neuer Nationen: Indizes und fehlende Einträge neu aufbauen */
  reindex(): void {
    const s = this.state;
    ensureNations(s, this.registry);
    for (const w of this.islands) if (!s.islands[w.id]) s.islands[w.id] = { owner: w.founder, garrison: w.garrisonMax, store: emptyBag(), conqueredAt: -1, siegeId: null, reliefAt: -1e9 };
    this.isl = this.islands.map((w) => s.islands[w.id]);
    const N = this.registry.count;
    this.rel = new Int32Array(N * N).fill(-1);
    s.relations.forEach((r, k) => {
      const i = this.registry.indexOf(r.a), j = this.registry.indexOf(r.b);
      if (i < 0 || j < 0) return;
      this.rel[i * N + j] = k; this.rel[j * N + i] = k;
    });

    this.value = new Float64Array(N);
    this.neighbor = new Float64Array(N * N);
    this.recount();
  }

  /** Neue Meldungen abholen (die Liste wird geleert) */
  drain(): WarNotice[] {
    if (!this.notices.length) return this.notices;
    const out = this.notices;
    this.notices = [];
    return out;
  }

  // ---------- Abfragen ----------

  islandIndexOf(id: string): number { const i = this.islandIndex.get(id); return i === undefined ? -1 : i; }
  island(id: string): WarIsland | undefined { const i = this.islandIndex.get(id); return i === undefined ? undefined : this.islands[i]; }
  /** Besitzer einer Insel (Nation-Kennung); unbekannte Inseln: null */
  ownerOf(islandId: string): string | null { return this.state.islands[islandId]?.owner ?? null; }
  /** Hat die Insel einen anderen Besitzer als beim Weltstart? */
  ownerChanged(islandId: string): boolean { const w = this.island(islandId); return !!w && this.ownerOf(islandId) !== w.founder; }

  relation(a: string, b: string): RelationState | null {
    const i = this.registry.indexOf(a), j = this.registry.indexOf(b);
    if (i < 0 || j < 0 || i === j) return null;
    const k = this.rel[i * this.registry.count + j];
    return k >= 0 ? this.state.relations[k] : null;
  }
  stateOf(a: string | null, b: string | null): DiplomacyState {
    if (!a || !b) return 'neutral';
    if (a === b) return 'allianz';
    return this.relation(a, b)?.state ?? 'neutral';
  }
  atWar(a: string | null, b: string | null): boolean { return !!a && !!b && a !== b && this.stateOf(a, b) === 'krieg'; }

  siegeOf(islandId: string): SiegeState | null {
    const id = this.state.islands[islandId]?.siegeId;
    if (!id) return null;
    for (const sg of this.state.sieges) if (sg.id === id && !sg.ended) return sg;
    return null;
  }
  besieged(islandId: string): boolean { return !!this.siegeOf(islandId); }
  /** Anteil der Unruhe nach einer Eroberung (1 = gerade erobert, 0 = vorbei) */
  unrest(islandId: string): number {
    const st = this.state.islands[islandId];
    if (!st || st.conqueredAt < 0) return 0;
    return clamp01(1 - (this.state.t - st.conqueredAt) / WAR.unrest);
  }

  armadaById(id: string | null): ArmadaState | null {
    if (!id) return null;
    for (const a of this.state.armadas) if (a.id === id) return a;
    return null;
  }
  battleById(id: string | null): GrandBattleState | null {
    if (!id) return null;
    for (const b of this.state.battles) if (b.id === id) return b;
    return null;
  }
  siegeById(id: string | null): SiegeState | null {
    if (!id) return null;
    for (const s of this.state.sieges) if (s.id === id) return s;
    return null;
  }

  /** Armadas im Umkreis (ohne aufgelöste); schreibt in `out` */
  armadasNear(x: number, z: number, r: number, out: ArmadaState[]): ArmadaState[] {
    out.length = 0;
    const r2 = r * r;
    for (const a of this.state.armadas) {
      if (a.status === 'aufgeloest') continue;
      const dx = a.x - x, dz = a.z - z;
      if (dx * dx + dz * dz <= r2) out.push(a);
    }
    return out;
  }

  /** Ware, auf die die Häfen dieser Nation ein Embargo legen: die Exportwaren aller Mächte, mit denen sie im Krieg liegt (in `out`) */
  embargoGoods(owner: string | null, out: GoodId[]): GoodId[] {
    out.length = 0;
    if (!owner) return out;
    for (let i = 0; i < this.registry.count; i++) {
      const d = this.registry.at(i);
      if (d.id === owner || !this.atWar(owner, d.id)) continue;
      for (const g of d.exports) if (!out.includes(g)) out.push(g);
    }
    return out;
  }

  /** Zahl der Handelspakte einer Nation (Konvoi-Sicherung) */
  pactCount(nation: string | null): number {
    if (!nation) return 0;
    let n = 0;
    for (const r of this.state.relations) if ((r.a === nation || r.b === nation) && (r.state === 'handelspakt' || r.state === 'allianz')) n++;
    return n;
  }

  /** Hegemon (Nation über der Machtschwelle) oder null */
  get hegemon(): string | null { return this.state.hegemon; }

  // ---------- Takt ----------

  /** Weiterrechnen um `dt` Sekunden Spielzeit; `interest` = Lage der Spieler (nur für Abfragen der Seewelt, die Regeln gelten überall gleich) */
  update(dt: number, _interest: readonly WarInterest[] = []): void {
    if (!(dt > 0)) return;
    const s = this.state;
    this.acc += dt;
    let n = 0;
    while (this.acc >= WAR.step && n < MAX_STEPS) {
      this.acc -= WAR.step;
      n++;
      s.t += WAR.step;
      this.stepWorld(WAR.step);
      if (s.t >= s.nextCycleAt) { s.nextCycleAt += WAR.cycle; this.economyCycle(); }
      if (s.t >= s.nextDiplomacyAt) { s.nextDiplomacyAt += WAR.diplomacyEvery; this.diplomacy(); }
      this.brains();
    }
    if (n >= MAX_STEPS) this.acc = Math.min(this.acc, WAR.step);
  }

  private stepWorld(dt: number): void {
    this.moveArmadas(dt);
    this.engage();
    this.stepBattles(dt);
    this.stepSieges(dt);
    this.stepContracts();
    this.prune();
  }

  // ---------- Armadas ----------

  private moveArmadas(dt: number): void {
    const s = this.state;
    for (let k = 0; k < s.armadas.length; k++) {
      const a = s.armadas[k];
      if (a.status !== 'anmarsch' && a.status !== 'heimkehr') continue;
      if (a.battleId) continue;
      if (!shipsAlive(a)) { this.dissolve(a, false); continue; }
      if (!a.live) advanceOnRoute(a, WAR.speed * dt);
      const last = a.route.length / 2;
      const atEnd = a.leg >= last || (a.live && a.leg >= last - 1 && Math.hypot(a.route[a.route.length - 2] - a.x, a.route[a.route.length - 1] - a.z) < WAR.arriveDist);
      if (!atEnd) continue;
      if (a.status === 'heimkehr') { this.dissolve(a, true); continue; }
      this.arrive(a);
    }
  }

  /** Ankunft am Ziel: Angriff → Belagerung beginnen, Entsatz → bleibt vor der Insel (die Schlacht beginnt über `engage`), sonst heim */
  private arrive(a: ArmadaState): void {
    const w = this.island(a.target);
    const st = this.state.islands[a.target];
    if (!w || !st) { this.goHome(a); return; }
    if (a.purpose === 'entsatz') {
      // Entsatz vor der Insel: die Belagerungsflotte stellt sich (gleich, auf welcher Seite der Insel sie liegt)
      const sg = this.siegeOf(a.target);
      const besieger = sg ? this.armadaById(sg.armadaId) : null;
      if (!sg || !besieger || besieger.status === 'aufgeloest') { this.goHome(a); return; }
      if (!a.battleId && !besieger.battleId && this.atWar(a.nation, besieger.nation)) this.startBattle(a, besieger);
      else if (!this.atWar(a.nation, besieger.nation)) this.goHome(a);
      return;
    }
    const owner = st.owner;
    if (owner === a.nation || (owner && this.stateOf(owner, a.nation) === 'allianz') || (owner && !this.atWar(owner, a.nation)) || st.siegeId) { this.goHome(a); return; }
    this.beginSiege(a, w, st);
  }

  private goHome(a: ArmadaState): void {
    if (a.status === 'aufgeloest') return;
    a.status = 'heimkehr';
    a.siegeId = null;
    const h = this.island(a.home);
    const ang = h ? Math.atan2(a.x - h.x, a.z - h.z) : 0;
    const tx = h ? h.x + Math.sin(ang) * (h.r * 1.6 + 60) : a.x, tz = h ? h.z + Math.cos(ang) * (h.r * 1.6 + 60) : a.z;
    a.route = this.path(a.x, a.z, tx, tz);
    a.leg = 1;
  }

  /** Armada auflösen: heimgekehrte Schiffe gehen in die Reserve (ein Teil der Baukosten kommt zurück), Truppen und Nachschub zurück ins Lager */
  private dissolve(a: ArmadaState, home: boolean): void {
    if (a.status === 'aufgeloest') return;
    a.status = 'aufgeloest';
    a.endedAt = this.state.t;
    a.live = false;
    const n = this.state.nations[a.nation];
    if (!n || !home) return;
    const back = this.bag;
    for (const r of RESOURCE_IDS) back[r] = 0;
    for (const sh of a.ships) {
      if (sh.down) continue;
      const c = SHIP_COST[clamp(sh.cls, 0, 6)];
      // Reparatur kostet Holz und Tuch: wer zerschossen heimkommt, bekommt weniger zurück
      const k = WAR.refund * (0.4 + 0.6 * clamp01(sh.hull));
      for (const r of RESOURCE_IDS) back[r] += (c[r] ?? 0) * k;
    }
    back.rekruten += a.troops * 0.8;
    back.proviant += a.supply.proviant;
    back.medizin += a.supply.medizin;
    this.addStock(n, back);
  }

  /** Feindliche Armadas, die einander nahe kommen, liefern sich eine Großschlacht; ein Entsatz vor der belagerten Insel stellt die Belagerer */
  private engage(): void {
    const s = this.state;
    const L = s.armadas.length;
    for (let i = 0; i < L; i++) {
      const a = s.armadas[i];
      if (a.battleId || a.status === 'aufgeloest' || !this.canFight(a)) continue;
      for (let j = i + 1; j < L; j++) {
        const b = s.armadas[j];
        if (b.battleId || b.status === 'aufgeloest' || a.nation === b.nation || !this.canFight(b)) continue;
        if (!this.atWar(a.nation, b.nation)) continue;
        const dx = a.x - b.x, dz = a.z - b.z;
        const reach = WAR.engageDist;
        if (dx * dx + dz * dz > reach * reach) continue;
        this.startBattle(a, b);
        break;
      }
    }
  }

  /** Stellt sich eine Armada einer Schlacht? Nicht, solange sie geschlagen abzieht oder unter die Rückzugs-Schwelle zerschossen ist */
  private canFight(a: ArmadaState): boolean {
    if (this.state.t < a.calmUntil || !warshipsAlive(a)) return false;
    return armadaFire(a) >= a.firepower0 * WAR.retreatAt;
  }

  private startBattle(a: ArmadaState, b: ArmadaState): GrandBattleState {
    const s = this.state;
    const islandId = a.status === 'belagerung' ? a.target : b.status === 'belagerung' ? b.target : null;
    const bt: GrandBattleState = {
      id: `gs${++s.seq}`, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, a: a.id, b: b.id, nationA: a.nation, nationB: b.nation, islandId,
      startedAt: s.t, t: 0, live: false, ended: false, endedAt: -1, winner: null, reason: null, sunkA: 0, sunkB: 0,
    };
    for (const x of [a, b]) {
      x.resume = x.status === 'gefecht' ? x.resume : x.status;
      x.status = 'gefecht';
      x.battleId = bt.id;
      if (x.siegeId) { const sg = this.siegeById(x.siegeId); if (sg) sg.paused = true; }
    }
    s.battles.push(bt);
    s.stats.battles++;
    this.notices.push({ type: 'schlacht', battle: bt });
    return bt;
  }

  private stepBattles(dt: number): void {
    const s = this.state;
    for (let k = 0; k < s.battles.length; k++) {
      const bt = s.battles[k];
      if (bt.ended) continue;
      bt.t += dt;
      const a = this.armadaById(bt.a), b = this.armadaById(bt.b);
      if (!a || !b) { this.endBattle(bt, a, b, a ? a.nation : b ? b.nation : null, 'vernichtet'); continue; }
      // Die Seewelt baut gerade echte Schiffe einer Seite (bis zu 25 s): kurz warten statt in den Daten weiterzurechnen (sonst stünden in der Welt
      // Schiffe, die in den Daten schon gesunken sind); danach rechnet die Engine in jedem Fall weiter
      const building = !bt.live && (a.live || b.live) && bt.t < 25;
      if (!bt.live && !building) {
        // Hintergrund: beide Seiten feuern gleichzeitig (deterministisch, Zufall nur für die Wahl des getroffenen Schiffs)
        const fa = armadaFire(a), fb = armadaFire(b);
        bt.sunkB += this.damage(b, fa * WAR.battleK * dt);
        bt.sunkA += this.damage(a, fb * WAR.battleK * dt);
      }
      const wa = warshipsAlive(a), wb = warshipsAlive(b);
      if (!wa || !wb) { this.endBattle(bt, a, b, wa ? a.nation : wb ? b.nation : null, 'vernichtet'); continue; }
      // Rückzug: wer unter 30 % seiner Anfangs-Feuerkraft fällt, während der Gegner deutlich stärker ist, dreht ab
      const fa = armadaFire(a), fb = armadaFire(b);
      if (fa < a.firepower0 * WAR.retreatAt && fb > fa * WAR.retreatRatio) { this.endBattle(bt, a, b, b.nation, 'rueckzug'); continue; }
      if (fb < b.firepower0 * WAR.retreatAt && fa > fb * WAR.retreatRatio) { this.endBattle(bt, a, b, a.nation, 'rueckzug'); continue; }
      // zu lange ohne Entscheidung: die Seite mit weniger Feuerkraft (relativ zum Anfang) dreht ab
      if (bt.t > WAR.battleMax) { const winA = fa / Math.max(1, a.firepower0) >= fb / Math.max(1, b.firepower0); this.endBattle(bt, a, b, winA ? a.nation : b.nation, 'rueckzug'); continue; }
    }
  }

  /** Schaden auf eine Armada verteilen; liefert die Zahl der dabei gesunkenen Schiffe */
  private damage(a: ArmadaState, dmg: number): number {
    let left = dmg, sunk = 0;
    for (let guard = 0; left > 1e-6 && guard < 12; guard++) {
      let target: ArmadaShip | null = null;
      if (this.rnd() < WAR.transportHit) for (const sh of a.ships) if (!sh.down && sh.role === 'transport') { target = sh; break; }
      // sonst das hinterste Kriegsschiff der Linie: die Begleiter schirmen das Kommandoschiff ab, es fällt zuletzt
      if (!target) for (const sh of a.ships) if (!sh.down && sh.role !== 'transport' && (!target || sh.slot > target.slot)) target = sh;
      if (!target) for (const sh of a.ships) if (!sh.down) { target = sh; break; }
      if (!target) break;
      const hp = shipHp(target);
      const take = Math.min(left, target.hull * hp);
      target.hull -= take / hp;
      left -= take;
      if (target.hull <= 1e-4) { target.hull = 0; if (this.sink(a, target)) sunk++; }
    }
    return sunk;
  }

  /** Ein Schiff sinkt (aus der Hintergrund-Rechnung oder von der Seewelt gemeldet); liefert true, wenn es vorher schwamm */
  sink(a: ArmadaState, sh: ArmadaShip): boolean {
    if (sh.down) return false;
    sh.down = true;
    sh.hull = 0;
    const n = this.state.nations[a.nation];
    if (n) n.shipsLost++;
    // Kriegsmüdigkeit beider Seiten des Konflikts wächst mit jedem versenkten Schiff
    const foe = this.foeOf(a);
    if (foe) { const r = this.relation(a.nation, foe); if (r) r.weariness = Math.min(100, r.weariness + WAR.wearyShip); }
    if (sh.role === 'kommando') {
      // das Flaggschiff sinkt: die Führung fehlt, die Moral der ganzen Armada (und ihrer Belagerung) bricht ein (4.5B)
      a.morale = Math.max(0, a.morale - WAR.flagshipMoraleLoss);
      const sg = this.siegeById(a.siegeId);
      if (sg) sg.morale = a.morale;
    }
    if (sh.role === 'transport') {
      // Nachschub verloren: Moral der Belagerung sinkt drastisch, die Ladung geht mit unter
      const left = this.transportsLeft(a);
      const share = left + 1 > 0 ? 1 / (left + 1) : 1;
      a.supply.proviant *= 1 - share;
      a.supply.medizin *= 1 - share;
      a.troops *= 1 - share * 0.55;
      a.morale = Math.max(0, a.morale - WAR.transportMoraleLoss);
      const sg = this.siegeById(a.siegeId);
      if (sg) { sg.morale = a.morale; sg.troops = a.troops; sg.transportsLost++; }
      this.notices.push({ type: 'transport', armada: a, siegeId: a.siegeId });
    }
    return true;
  }

  private transportsLeft(a: ArmadaState): number {
    let n = 0;
    for (const sh of a.ships) if (!sh.down && sh.role === 'transport') n++;
    return n;
  }

  /** Gegner einer Armada: die Nation in ihrer Schlacht, sonst der Besitzer ihres Ziels */
  private foeOf(a: ArmadaState): string | null {
    const bt = this.battleById(a.battleId);
    if (bt) return bt.nationA === a.nation ? bt.nationB : bt.nationA;
    return this.state.islands[a.target]?.owner ?? null;
  }

  private endBattle(bt: GrandBattleState, a: ArmadaState | null, b: ArmadaState | null, winner: string | null, reason: BattleReason): void {
    if (bt.ended) return;
    bt.ended = true;
    bt.endedAt = this.state.t;
    bt.winner = winner;
    bt.reason = reason;
    for (const x of [a, b]) {
      if (!x) continue;
      x.battleId = null;
      const won = winner === x.nation;
      if (!won || !warshipsAlive(x)) {
        x.calmUntil = this.state.t + 150;
        // besiegt: die Belagerung bricht ab, die Reste fahren heim
        if (x.siegeId) { const sg = this.siegeById(x.siegeId); if (sg) this.endSiege(sg, 'abgebrochen'); }
        if (warshipsAlive(x) || shipsAlive(x)) this.goHome(x); else this.dissolve(x, false);
        continue;
      }
      x.status = x.resume === 'gefecht' ? 'anmarsch' : x.resume;
      if (x.siegeId) { const sg = this.siegeById(x.siegeId); if (sg) sg.paused = false; }
      // Entsatz erfolgreich: die belagerte Insel ist frei, die Flotte kehrt heim
      if (x.purpose === 'entsatz' && x.status !== 'heimkehr') this.goHome(x);
    }
    this.notices.push({ type: 'schlachtEnde', battle: bt });
  }

  // ---------- Belagerungen ----------

  private beginSiege(a: ArmadaState, w: WarIsland, st: IslandWarState): void {
    const s = this.state;
    const sg: SiegeState = {
      id: `bl${++s.seq}`, islandId: w.id, attacker: a.nation, defender: st.owner, armadaId: a.id, progress: 0, morale: a.morale,
      troops: a.troops, garrison: st.owner ? st.garrison : Math.max(st.garrison, NEUTRAL_GARRISON), startedAt: s.t, t: 0, transportsLost: 0,
      paused: false, live: a.live, ended: false, endedAt: -1, outcome: null,
      points: siegePoints(w, Math.atan2(a.x - w.x, a.z - w.z)), helpers: [],
    };
    s.sieges.push(sg);
    st.siegeId = sg.id;
    a.status = 'belagerung';
    a.siegeId = sg.id;
    this.notices.push({ type: 'belagerung', siege: sg });
  }

  private stepSieges(dt: number): void {
    const s = this.state;
    for (let k = 0; k < s.sieges.length; k++) {
      const sg = s.sieges[k];
      if (sg.ended) continue;
      const a = this.armadaById(sg.armadaId);
      if (!a || a.status === 'aufgeloest' || a.status === 'heimkehr') { this.endSiege(sg, 'abgebrochen'); continue; }
      if (sg.paused) continue;
      sg.t += dt;
      const w = this.island(sg.islandId);
      // Verbrauch: Proviant und Medizin je 10 Mann und Minute; ohne Nachschub sinkt die Moral
      const per = (sg.troops / 10) * (dt / 60);
      a.supply.proviant -= WAR.siegeProviant * per;
      a.supply.medizin -= WAR.siegeMedizin * per;
      if (a.supply.proviant < 0) { a.supply.proviant = 0; a.morale = Math.max(0, a.morale - WAR.starveMorale * dt); }
      const noMed = a.supply.medizin <= 0;
      if (noMed) a.supply.medizin = 0;
      sg.morale = a.morale;
      // Abnutzung: Garnison gegen Landungskorps (ohne Medizin verliert das Korps schneller)
      if (!sg.live) {
        const g0 = sg.garrison;
        sg.garrison = Math.max(0, sg.garrison - sg.troops * WAR.garrisonLoss * dt);
        sg.troops = Math.max(0, sg.troops - g0 * WAR.attackerLoss * dt * (noMed ? 1.5 : 1));
      }
      a.troops = sg.troops;
      // Küstenfeuer der Verteidiger: ein Schiff je Takt nimmt Schaden (Festungen und Mega-Inseln schießen doppelt)
      if (sg.garrison > 0 && !a.live) {
        const fort = w && (w.tier === 'festung' || w.tier === 'mega') ? 2 : 1;
        const sh = a.ships[(Math.floor(sg.t) + a.ships.length) % a.ships.length];
        if (sh && !sh.down) { sh.hull -= WAR.coastFire * (sg.garrison / 100) * fort * dt * 6; if (sh.hull <= 0) this.sink(a, sh); }
      }
      sg.progress = clamp01(sg.progress + this.siegeRate(sg) * dt);
      if (sg.morale < WAR.siegeBreakMorale || sg.troops < 5) { this.endSiege(sg, 'abgebrochen'); this.goHome(a); continue; }
      // abgewehrt: der Verteidiger hält alle Kontrollpunkte und hat den Fortschritt ganz zurückgedrängt (4.5B)
      if (sg.progress <= 0 && pointsMean(sg) <= WAR.repelAt) { this.endSiege(sg, 'abgebrochen'); this.goHome(a); continue; }
      if (sg.progress >= 1) this.conquer(sg, a);
    }
  }

  /**
   * Fortschritt der Belagerung je Sekunde (kann negativ sein): Kräfteverhältnis Landungskorps gegen Garnison, Moral, eine Garnison ohne Leute fällt
   * schneller – und die Kontrollpunkte an Land: alle beim Angreifer ×2,6, umkämpft ×1, alle beim Verteidiger −0,6 (der Fortschritt läuft zurück).
   */
  siegeRate(sg: SiegeState): number {
    const ratio = clamp(0.6 + 0.4 * (sg.troops / (sg.garrison + 20)), 0.6, 1.4);
    const moraleK = clamp(0.4 + 0.8 * sg.morale, 0.3, 1.2);
    return (1 / WAR.siegeSeconds) * ratio * moraleK * (sg.garrison <= 0.5 ? 1.6 : 1) * (1 + WAR.pointK * pointsMean(sg));
  }

  /** Geschätzte Restzeit (s) bis zum Fall der Insel; Infinity, wenn der Fortschritt steht oder zurückläuft */
  siegeEta(sg: SiegeState): number {
    const r = this.siegeRate(sg);
    return r > 1e-9 && !sg.paused ? (1 - sg.progress) / r : Infinity;
  }

  private endSiege(sg: SiegeState, outcome: SiegeOutcome): void {
    if (sg.ended) return;
    sg.ended = true;
    sg.endedAt = this.state.t;
    sg.outcome = outcome;
    sg.paused = false;
    const st = this.state.islands[sg.islandId];
    if (st && st.siegeId === sg.id) {
      st.siegeId = null;
      if (outcome === 'abgebrochen') st.garrison = Math.max(st.garrison * 0.6, Math.min(sg.garrison, this.island(sg.islandId)?.garrisonMax ?? sg.garrison));
    }
    const a = this.armadaById(sg.armadaId);
    if (a && a.siegeId === sg.id) a.siegeId = null;
    this.notices.push({ type: 'belagerungEnde', siege: sg });
  }

  /** Die Insel fällt: neuer Besitzer, Beute aus dem Insellager, ein Teil des Landungskorps bleibt als Garnison */
  private conquer(sg: SiegeState, a: ArmadaState): void {
    const s = this.state;
    const st = s.islands[sg.islandId];
    const w = this.island(sg.islandId);
    if (!st || !w) { this.endSiege(sg, 'abgebrochen'); return; }
    const from = st.owner;
    const winner = s.nations[a.nation];
    let loot = 0;
    if (winner) {
      const b = this.bag;
      for (const r of RESOURCE_IDS) { b[r] = st.store[r] * WAR.lootShare; loot += b[r] * RESOURCE_VALUE[r]; }
      this.addStock(winner, b);
      winner.islandsWon++;
    }
    for (const r of RESOURCE_IDS) st.store[r] = 0;
    st.owner = a.nation;
    st.conqueredAt = s.t;
    st.garrison = Math.min(w.garrisonMax, sg.troops * 0.5 + 10);
    a.troops = Math.max(0, sg.troops * 0.5 - 10);
    if (from) {
      const n = s.nations[from];
      if (n) n.islandsLost++;
      const r = this.relation(from, a.nation);
      if (r) { r.weariness = Math.min(100, r.weariness + WAR.wearyIsland); r.trust = Math.max(-100, r.trust - 12); }
    }
    s.stats.conquests++;
    sg.progress = 1;
    this.endSiege(sg, 'erobert');
    this.notices.push({ type: 'gefallen', islandId: w.id, from, to: a.nation, loot: Math.round(loot) });
    this.goHome(a);
    this.recount();
  }

  private prune(): void {
    const s = this.state;
    const t = s.t;
    for (let i = s.armadas.length - 1; i >= 0; i--) { const a = s.armadas[i]; if (a.status === 'aufgeloest' && t - a.endedAt > LINGER) s.armadas.splice(i, 1); }
    for (let i = s.battles.length - 1; i >= 0; i--) { const b = s.battles[i]; if (b.ended && t - b.endedAt > LINGER) s.battles.splice(i, 1); }
    for (let i = s.sieges.length - 1; i >= 0; i--) { const g = s.sieges[i]; if (g.ended && t - g.endedAt > LINGER) s.sieges.splice(i, 1); }
    // beendete Aufträge stehen noch zehn Minuten im Fenster (Ausgang lesen), dann gehen sie
    for (let i = s.contracts.length - 1; i >= 0; i--) { const c = s.contracts[i]; if (c.status !== 'aktiv' && t - c.endedAt > CONTRACT_LINGER) s.contracts.splice(i, 1); }
  }

  // ---------- Wirtschaft ----------

  private addStock(n: NationState, b: ResourceBag): void {
    for (const r of RESOURCE_IDS) n.stock[r] = clamp(n.stock[r] + b[r], 0, RESOURCE_CAP[r]);
  }

  /** Ertragsfaktor einer Nation (Handelspakte) */
  yieldK(nation: string): number { return this.pactCount(nation) > 0 ? 1 + WAR.pactBonus : 1; }

  /**
   * Ein Wirtschaftszyklus: jede gehaltene Insel füllt ihr Lager (frisch eroberte zur Hälfte, Handelspakte +20 %) und liefert es an die Kasse – eine
   * belagerte Insel liefert nicht. Danach Unterhalt der Armadas (Proviant, Sold) und Auffüllen der Garnisonen (kostet Rekruten).
   */
  private economyCycle(): void {
    const s = this.state;
    for (const id in s.nations) { const n = s.nations[id]; for (const r of RESOURCE_IDS) n.income[r] = 0; }
    for (let i = 0; i < this.islands.length; i++) {
      const w = this.islands[i], st = this.isl[i];
      const owner = st.owner ? s.nations[st.owner] : null;
      if (!owner || !w.produces) continue;
      const k = this.yieldK(owner.id) * (this.unrest(w.id) > 0 ? 0.5 : 1);
      for (const r of RESOURCE_IDS) st.store[r] += w.yield[r] * k;
      if (st.siegeId) continue;
      for (const r of RESOURCE_IDS) { owner.income[r] += st.store[r]; owner.stock[r] = Math.min(RESOURCE_CAP[r], owner.stock[r] + st.store[r]); st.store[r] = 0; }
    }
    // Grundverbrauch: Hof, Verwaltung, Reserveflotte und je gehaltener Insel Sold und Verpflegung; festes Einkommen (Ordnungsabgabe der Marine);
    // Notkauf auf dem Weltmarkt, wenn ein Kriegsrohstoff fehlt und die Kasse es hergibt
    for (let i = 0; i < this.registry.count; i++) {
      const def = this.registry.at(i);
      const n = s.nations[def.id];
      if (!n) continue;
      for (const r of RESOURCE_IDS) {
        const plus = def.stipend?.[r] ?? 0;
        n.income[r] += plus;
        n.stock[r] = clamp(n.stock[r] + plus - STATE_UPKEEP[r] - (ISLAND_UPKEEP[r] ?? 0) * n.islands, 0, RESOURCE_CAP[r]);
      }
      const mb = WAR.marketBuy;
      for (const r of WAR_RESOURCES) {
        if (n.stock[r] >= RESOURCE_TARGET[r] * WAR.shortAt || n.stock.gold < RESOURCE_TARGET.gold * mb.goldFloor) continue;
        const price = RESOURCE_VALUE[r] * mb.priceK;
        const units = Math.min(mb.units, (n.stock.gold - RESOURCE_TARGET.gold * mb.goldFloor) / price);
        if (units <= 0) continue;
        n.stock[r] += units;
        n.stock.gold -= units * price;
      }
    }
    // Unterhalt der Armadas: Proviant und Sold je Schiff
    for (const a of s.armadas) {
      if (a.status === 'aufgeloest') continue;
      const n = s.nations[a.nation];
      if (!n) continue;
      const alive = shipsAlive(a);
      n.stock.proviant = Math.max(0, n.stock.proviant - 1.2 * alive);
      n.stock.gold = Math.max(0, n.stock.gold - 5 * alive);
    }
    // Garnisonen: Verpflegung und Verstärkung
    for (let i = 0; i < this.islands.length; i++) {
      const w = this.islands[i], st = this.isl[i];
      const n = st.owner ? s.nations[st.owner] : null;
      if (!n) continue;
      n.stock.proviant = Math.max(0, n.stock.proviant - st.garrison * 0.01);
      if (!st.siegeId && st.garrison < w.garrisonMax && n.stock.rekruten >= WAR.reinforce) {
        const add = Math.min(WAR.reinforce, w.garrisonMax - st.garrison);
        st.garrison += add;
        n.stock.rekruten -= add;
      }
    }
    this.recount();
  }

  /** Zählungen je Nation: Inseln, Mega-Inseln, Anteil an den Gesamtressourcen, Kampfkraft */
  private recount(): void {
    const s = this.state;
    const N = this.registry.count;
    let total = 0;
    for (let i = 0; i < N; i++) {
      const n = s.nations[this.registry.at(i).id];
      if (!n) { this.value[i] = 0; continue; }
      n.islands = 0; n.megas = 0;
      this.value[i] = valueOf(n.stock);
      total += this.value[i];
    }
    for (let i = 0; i < this.islands.length; i++) {
      const st = this.isl[i];
      const n = st.owner ? s.nations[st.owner] : null;
      if (!n) continue;
      n.islands++;
      if (this.islands[i].mega) n.megas++;
    }
    for (let i = 0; i < N; i++) {
      const n = s.nations[this.registry.at(i).id];
      if (!n) continue;
      n.share = total > 0 ? this.value[i] / total : 0;
      // Kampfkraft: Reserve (Kanonenstahl, Hartholz, Gold) plus Garnisonen der eigenen Inseln
      let g = 0;
      for (let k = 0; k < this.islands.length; k++) if (this.isl[k].owner === n.id) g += this.isl[k].garrison;
      n.strength = n.stock.kanonenstahl * 0.6 + n.stock.hartholz * 0.4 + n.stock.gold * 0.02 + g * 0.5 + n.islands * 8;
    }
  }

  // ---------- Diplomatie ----------

  /** Abstand der nächsten Inseln je Nationen-Paar (Nachbarschaft für Grenzreibung) */
  private updateNeighbors(): void {
    const N = this.registry.count;
    const nb = this.neighbor;
    nb.fill(1e9);
    for (let i = 0; i < this.islands.length; i++) {
      const oi = this.registry.indexOf(this.isl[i].owner);
      if (oi < 0) continue;
      const wi = this.islands[i];
      for (let j = i + 1; j < this.islands.length; j++) {
        const oj = this.registry.indexOf(this.isl[j].owner);
        if (oj < 0 || oj === oi) continue;
        const wj = this.islands[j];
        const d = Math.hypot(wi.x - wj.x, wi.z - wj.z);
        if (d < nb[oi * N + oj]) { nb[oi * N + oj] = d; nb[oj * N + oi] = d; }
      }
    }
  }

  /**
   * Ergänzen sich die Vorräte zweier Nationen? Beide haben Überschüsse in verschiedenen Rohstoffen (Gold zählt als Zahlungsmittel mit), und
   * mindestens einer dieser Überschüsse deckt einen Bedarf des Partners (unter dem Wohlfühl-Vorrat).
   */
  complementary(a: string, b: string): boolean {
    const A = this.state.nations[a], B = this.state.nations[b];
    if (!A || !B) return false;
    let need = false, surA = -1, surB = -1;
    for (let k = 0; k < RESOURCE_IDS.length; k++) {
      const r = RESOURCE_IDS[k];
      const t = RESOURCE_TARGET[r];
      const sa = A.stock[r] > t * WAR.surplusAt, sb = B.stock[r] > t * WAR.surplusAt;
      if (sa && surA < 0) surA = k;
      if (sb && (surB < 0 || surB === surA)) surB = k;
      if (r !== 'gold' && ((sa && B.stock[r] < t) || (sb && A.stock[r] < t))) need = true;
    }
    return need && surA >= 0 && surB >= 0 && surA !== surB;
  }

  private setRelation(r: RelationState, st: DiplomacyState): void {
    if (r.state === st) return;
    r.state = st;
    r.since = this.state.t;
    if (st !== 'krieg') r.weariness = 0;
    if (st !== 'allianz') { r.coalition = null; r.allianceUntil = 0; }
  }

  /**
   * Krieg erklären (ohne Prüfung der Regeln; die KI ruft `mayDeclare` vorher). Gemeinsame Kriegserklärung (4.5B): die Partner eines Zweier-Bündnisses
   * ziehen mit, sofern sie dürfen (kein Waffenstillstand, kein Pakt und kein Bündnis mit dem Gegner); `ally` = Bündnisfall für diese Nation.
   */
  declareWar(a: string, b: string, chain = true, ally: string | null = null): boolean {
    const r = this.relation(a, b);
    if (!r || r.state === 'krieg') return false;
    this.setRelation(r, 'krieg');
    r.trust = Math.min(r.trust, -40);
    this.state.stats.wars++;
    this.notices.push(ally ? { type: 'krieg', a, b, ally } : { type: 'krieg', a, b });
    if (!chain) return true;
    for (let i = 0; i < this.registry.count; i++) {
      const c = this.registry.at(i).id;
      if (c === a || c === b || !this.bilateral(a, c) || this.atWar(c, b) || !this.mayDeclare(c, b, true)) continue;
      this.declareWar(c, b, false, a);
    }
    return true;
  }

  /** Zweier-Militärbündnis zwischen `a` und `b` (nicht nur Koalitionspartner gegen einen Hegemon) */
  bilateral(a: string, b: string): boolean {
    const r = this.relation(a, b);
    return !!r && r.state === 'allianz' && r.allianceUntil > this.state.t;
  }

  /** Haben beide einen gemeinsamen Gegner (Krieg oder Rivalität mit derselben dritten Macht)? */
  commonFoe(a: string, b: string): string | null {
    for (let i = 0; i < this.registry.count; i++) {
      const c = this.registry.at(i).id;
      if (c === a || c === b) continue;
      const sa = this.stateOf(a, c), sb = this.stateOf(b, c);
      if ((sa === 'krieg' || sa === 'rivalitaet') && (sb === 'krieg' || sb === 'rivalitaet')) return c;
    }
    return null;
  }

  /** Darf `a` gegen `b` in den Krieg ziehen? (kein Waffenstillstand, keine Allianz, kein Pakt; Rivalität oder Koalition) */
  mayDeclare(a: string, b: string, coalitionTarget: boolean): boolean {
    const r = this.relation(a, b);
    if (!r) return false;
    if (r.state === 'krieg') return true;
    if (r.truceUntil > this.state.t) return false;
    if (r.state === 'allianz' || r.state === 'handelspakt') return false;
    if (coalitionTarget) return true;
    const da = this.registry.get(a);
    return r.state === 'rivalitaet' || (!!da && da.doctrine.aggression > 0.7 && r.trust < -20);
  }

  private diplomacy(): void {
    const s = this.state;
    // Anteile frisch zählen (Vorräte ändern sich auch zwischen den Wirtschaftszyklen: Armadas, Beute, Reparationen)
    this.recount();
    this.updateNeighbors();
    this.hegemonCheck();
    const N = this.registry.count;
    for (const r of s.relations) {
      const A = s.nations[r.a], B = s.nations[r.b];
      if (!A || !B) continue;
      const ia = this.registry.indexOf(r.a), ib = this.registry.indexOf(r.b);
      const neighbors = ia >= 0 && ib >= 0 && this.neighbor[ia * N + ib] < 2600;
      switch (r.state) {
        case 'krieg': {
          r.weariness = Math.min(100, r.weariness + WAR.wearyBase);
          // Koalitionskriege gegen den Hegemon enden nicht aus Müdigkeit, solange er Hegemon ist
          const coalitionWar = s.hegemon === r.a ? this.inCoalitionAgainst(r.b, r.a) : s.hegemon === r.b ? this.inCoalitionAgainst(r.a, r.b) : false;
          if (s.t - r.since >= WAR.minWar && ((r.weariness >= WAR.weary && !coalitionWar) || this.starving(A) || this.starving(B))) this.ceasefire(r);
          break;
        }
        case 'handelspakt':
        case 'allianz': {
          r.trust = Math.min(100, r.trust + 1);
          this.exchange(A, B);
          if (r.state === 'handelspakt') {
            // Zweier-Bündnis (4.5B): bewährte Handelspartner mit einem gemeinsamen Gegner schließen ein Militärbündnis
            if (r.trust >= WAR.allianceTrust && r.truceUntil <= s.t && this.commonFoe(r.a, r.b)) {
              this.setRelation(r, 'allianz');
              r.allianceUntil = s.t + WAR.allianceTime;
              s.stats.alliances++;
              this.notices.push({ type: 'buendnis', a: r.a, b: r.b });
            }
          } else if (!r.coalition && r.allianceUntil <= s.t) {
            // abgelaufen: verlängern, solange der gemeinsame Gegner bleibt, sonst bleibt der Handelspakt
            if (this.commonFoe(r.a, r.b)) r.allianceUntil = s.t + WAR.allianceTime;
            else { this.setRelation(r, 'handelspakt'); this.notices.push({ type: 'buendnisEnde', a: r.a, b: r.b }); }
          }
          break;
        }
        case 'neutral': {
          // Grenzreibung: Nachbarn verlieren langsam Vertrauen (Gleichgewicht bei −35 → Rivalität), Ferne nähern sich der Gleichgültigkeit
          r.trust += (0 - r.trust) * 0.02 - (neighbors ? 0.7 : 0);
          const da = this.registry.get(r.a)!, db = this.registry.get(r.b)!;
          if (r.truceUntil <= s.t && r.trust >= -10 && (da.doctrine.trade + db.doctrine.trade) / 2 >= 0.35 && this.complementary(r.a, r.b)) {
            this.setRelation(r, 'handelspakt');
            r.trust = Math.max(r.trust, 15);
            s.stats.pacts++;
            this.notices.push({ type: 'handelspakt', a: r.a, b: r.b });
          } else if (r.trust <= -30) this.setRelation(r, 'rivalitaet');
          break;
        }
        case 'rivalitaet': {
          r.trust = Math.min(0, r.trust + (neighbors ? 0.1 : 0.5));
          if (r.trust > -5) this.setRelation(r, 'neutral');
          break;
        }
      }
      r.trust = clamp(r.trust, -100, 100);
    }
  }

  /** Leere Kassen oder Speicher: der Krieg ist nicht mehr zu führen */
  private starving(n: NationState): boolean { return n.stock.proviant < RESOURCE_TARGET.proviant * 0.15 || n.stock.gold < RESOURCE_TARGET.gold * 0.1; }

  /** Handelspakt: ein Teil des Überschusses fließt dorthin, wo der Partner Mangel hat (in beide Richtungen) */
  private exchange(A: NationState, B: NationState): void {
    for (const r of WAR_RESOURCES) {
      const t = RESOURCE_TARGET[r];
      if (A.stock[r] > t * WAR.surplusAt && B.stock[r] < t) { const q = (A.stock[r] - t) * WAR.pactShare; A.stock[r] -= q; B.stock[r] += q; }
      else if (B.stock[r] > t * WAR.surplusAt && A.stock[r] < t) { const q = (B.stock[r] - t) * WAR.pactShare; B.stock[r] -= q; A.stock[r] += q; }
    }
  }

  /** Waffenstillstand: der Schwächere zahlt Reparationen, Armadas gegeneinander kehren um, Belagerungen enden */
  ceasefire(r: RelationState): void {
    const s = this.state;
    const A = s.nations[r.a], B = s.nations[r.b];
    if (!A || !B || r.state !== 'krieg') return;
    // der Schwächere zahlt (Kampfkraft aus Reserve und Garnisonen)
    const payer = A.strength <= B.strength ? A : B, payee = payer === A ? B : A;
    const gold = Math.round(Math.min(WAR.reparationMax, payer.stock.gold * WAR.reparationShare));
    payer.stock.gold -= gold;
    payee.stock.gold = Math.min(RESOURCE_CAP.gold, payee.stock.gold + gold);
    this.setRelation(r, 'neutral');
    r.truceUntil = s.t + WAR.truce;
    r.trust = -10;
    s.stats.ceasefires++;
    for (const a of s.armadas) {
      if (a.status === 'aufgeloest') continue;
      const foe = this.foeOf(a);
      if ((a.nation === r.a && foe === r.b) || (a.nation === r.b && foe === r.a)) {
        const bt = this.battleById(a.battleId);
        if (bt && !bt.ended) this.endBattle(bt, this.armadaById(bt.a), this.armadaById(bt.b), null, 'rueckzug');
        const sg = this.siegeById(a.siegeId);
        if (sg) this.endSiege(sg, 'abgebrochen');
        this.goHome(a);
      }
    }
    this.notices.push({ type: 'waffenstillstand', a: r.a, b: r.b, payer: payer.id, gold });
  }

  /** Hegemon bestimmen und Koalitionen bilden oder auflösen */
  private hegemonCheck(): void {
    const s = this.state;
    let best: NationState | null = null;
    for (const id in s.nations) {
      const n = s.nations[id];
      n.hegemon = false;
      if (n.share > WAR.hegemonShare || n.megas > WAR.hegemonMegas) if (!best || n.share > best.share) best = n;
    }
    s.hegemon = best ? best.id : null;
    if (best) best.hegemon = true;
    // bestehende Koalitionen: auflösen, wenn ihr Hegemon lange genug unter der Schwelle liegt
    for (let i = s.coalitions.length - 1; i >= 0; i--) {
      const c = s.coalitions[i];
      const h = s.nations[c.against];
      const calm = !h || (h.share < WAR.hegemonRelease && h.megas <= WAR.hegemonMegas);
      if (!calm) { c.calmSince = -1; continue; }
      if (c.calmSince < 0) c.calmSince = s.t;
      if (s.t - c.calmSince < 300) continue;
      // Koalitionspartner gehen auseinander; ein eigenes Zweier-Bündnis bleibt bestehen
      for (const r of s.relations) if (r.coalition === c.id) { if (r.allianceUntil > s.t) r.coalition = null; else this.setRelation(r, r.trust >= 20 ? 'handelspakt' : 'neutral'); }
      s.coalitions.splice(i, 1);
      this.notices.push({ type: 'koalitionEnde', against: c.against });
    }
    if (!best) return;
    for (const c of s.coalitions) if (c.against === best.id) return;
    // Anti-Hegemon-Koalition: alle bedrohten Rivalen (nicht die Verbündeten des Hegemons) schließen ein Verteidigungsbündnis
    const members: string[] = [];
    for (let i = 0; i < this.registry.count; i++) {
      const id = this.registry.at(i).id;
      if (id === best.id) continue;
      if (this.stateOf(id, best.id) === 'allianz') continue;
      members.push(id);
    }
    if (members.length < 2) return;
    const c: CoalitionState = { id: `ko${++s.seq}`, against: best.id, members, formedAt: s.t, strikeAt: s.t + 45, calmSince: -1 };
    s.coalitions.push(c);
    s.stats.coalitions++;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const r = this.relation(members[i], members[j]);
        if (!r) continue;
        if (r.state === 'krieg') this.ceasefire(r);
        this.setRelation(r, 'allianz');
        r.coalition = c.id;
        r.trust = Math.max(r.trust, 10);
      }
      const rh = this.relation(members[i], best.id);
      if (rh && rh.state !== 'krieg' && rh.truceUntil <= s.t) this.declareWar(members[i], best.id);
      // gemeinsamer Schlag: alle Mitglieder planen zur selben Zeit
      const n = s.nations[members[i]];
      if (n) n.nextBrainAt = Math.min(n.nextBrainAt, c.strikeAt + i * 0.5);
    }
    this.notices.push({ type: 'koalition', against: best.id, members: members.slice() });
  }

  /** Steht `nation` in einer Koalition gegen `target`? */
  inCoalitionAgainst(nation: string, target: string | null): boolean {
    if (!target) return false;
    for (const c of this.state.coalitions) if (c.against === target && c.members.includes(nation)) return true;
    return false;
  }

  // ---------- KI der Nationen ----------

  private brains(): void {
    const s = this.state;
    for (let i = 0; i < this.registry.count; i++) {
      const id = this.registry.at(i).id;
      const n = s.nations[id];
      if (!n || s.t < n.nextBrainAt) continue;
      n.nextBrainAt = s.t + WAR.brainEvery;
      this.think(i);
    }
  }

  /** Knappheit 0 … 1 eines Kriegsrohstoffs */
  shortage(n: NationState, r: ResourceId): number { return clamp01(1 - n.stock[r] / RESOURCE_TARGET[r]); }

  /** Bereitschaft 0 … 1 für Großoffensiven: volle Kriegskasse und volle Kriegslager */
  readiness(n: NationState): number {
    let war = 0;
    for (const r of WAR_RESOURCES) war += clamp(n.stock[r] / RESOURCE_TARGET[r], 0, 1.5) / 1.5;
    war /= WAR_RESOURCES.length;
    return clamp01((n.stock.gold / RESOURCE_TARGET.gold - 0.5) / 0.8) * war;
  }

  /**
   * Nutzen einer Zielinsel für eine Nation (−∞ = kommt nicht in Frage): Rohstoffbedarf × Ertrag der Insel, strategischer Wert und Mega-Insel bei
   * hoher Bereitschaft, Rückeroberung, Koalitionsziel, laufender Krieg; abzüglich Entfernung, Garnison und Kriegsmüdigkeit.
   */
  utility(nationIdx: number, islandIdx: number): number {
    const s = this.state;
    const def = this.registry.at(nationIdx);
    const n = s.nations[def.id];
    const w = this.islands[islandIdx], st = this.isl[islandIdx];
    if (!n || !w.conquerable || w.protected || st.owner === def.id || st.siegeId) return -Infinity;
    const owner = st.owner;
    const coalitionTarget = this.inCoalitionAgainst(def.id, owner);
    const reclaim = w.founder === def.id;
    if (!def.doctrine.conquers && !reclaim && !coalitionTarget) return -Infinity;
    if (owner && !this.mayDeclare(def.id, owner, coalitionTarget)) return -Infinity;
    if (!owner && !w.mega) return -Infinity;
    // schon ein eigenes Ziel dort?
    if (this.hasArmada(def.id, w.id, null)) return -Infinity;
    // Reichweite: ab der nächsten eigenen Insel
    let dmin = 1e9;
    for (let k = 0; k < this.islands.length; k++) {
      if (this.isl[k].owner !== def.id) continue;
      const d = Math.hypot(this.islands[k].x - w.x, this.islands[k].z - w.z);
      if (d < dmin) dmin = d;
    }
    if (dmin > WAR.reach) return -Infinity;
    let need = 0;
    for (const r of WAR_RESOURCES) need += this.shortage(n, r) * w.yield[r] / 5;
    need += this.shortage(n, 'gold') * w.yield.gold / 40;
    const ready = this.readiness(n);
    const d = def.doctrine;
    const rel = owner ? this.relation(def.id, owner) : null;
    let u = d.wResource * need
      + d.wStrategic * w.strategic * ready
      + d.wMega * (w.mega ? 0.9 : 0) * ready
      + (reclaim ? 0.45 : 0)
      + (coalitionTarget ? 0.7 : 0)
      + (rel?.state === 'krieg' ? 0.25 : 0)
      - 0.5 * (dmin / WAR.reach)
      - 0.35 * clamp(st.garrison / 140, 0, 2)
      - (rel ? rel.weariness / 150 : 0);
    if (!owner) u += 0.15; // herrenlose Mega-Insel
    return u;
  }

  /** Schwelle, ab der eine Nation losschlägt (aggressive Mächte früher) */
  threshold(nationIdx: number): number { return 0.95 - 0.45 * this.registry.at(nationIdx).doctrine.aggression; }

  /** Entscheidung einer Nation: Entsatz für belagerte eigene Inseln, sonst die beste Offensive (wenn bezahlbar) */
  private think(i: number): void {
    const s = this.state;
    const def = this.registry.at(i);
    const n = s.nations[def.id];
    if (!n) return;
    if (s.armadas.length - this.countStatus('aufgeloest') >= WAR.maxArmadas) return;
    // 1. Entsatz: eine eigene Insel wird belagert und noch kein Entsatz ist unterwegs
    for (let k = 0; k < this.islands.length; k++) {
      const st = this.isl[k];
      if (st.owner !== def.id || !st.siegeId) continue;
      if (this.hasArmada(def.id, this.islands[k].id, 'entsatz') || s.t - st.reliefAt < WAR.reliefGap) continue;
      // nur mit Aussicht: die Entsatzflotte muss gut die Hälfte der Feuerkraft der Belagerer aufbringen
      const sg = this.siegeById(st.siegeId);
      const foe = sg ? this.armadaById(sg.armadaId) : null;
      const plan = this.planFor(i, k, WAR.minShips + 1);
      let fp = 0;
      for (const p of plan) fp += SHIP_CLASSES[p.cls].can * (0.75 + 0.12 * p.cannonTier);
      if (foe && fp < armadaFire(foe) * WAR.reliefOdds) continue;
      if (this.launch(i, k, 'entsatz', WAR.minShips + 1)) { st.reliefAt = s.t; return; }
    }
    // 1b. Bündnisfall (4.5B): wird eine Insel des Zweier-Verbündeten belagert, schickt auch der Partner eine Entsatzflotte (und tritt dafür in den Krieg)
    for (let k = 0; k < this.islands.length; k++) {
      const st = this.isl[k];
      const owner = st.owner;
      if (!owner || owner === def.id || !st.siegeId || !this.bilateral(def.id, owner)) continue;
      if (this.hasArmada(def.id, this.islands[k].id, 'entsatz') || this.reachOf(def.id, this.islands[k]) > WAR.reach) continue;
      const sg = this.siegeById(st.siegeId);
      const foe = sg ? this.armadaById(sg.armadaId) : null;
      if (!sg || !foe || foe.nation === def.id) continue;
      const atWar = this.atWar(def.id, foe.nation);
      if (!atWar && !this.mayDeclare(def.id, foe.nation, true)) continue;
      const plan = this.planFor(i, k, WAR.minShips + 1);
      let fp = 0;
      for (const p of plan) fp += SHIP_CLASSES[p.cls].can * (0.75 + 0.12 * p.cannonTier);
      if (fp < armadaFire(foe) * WAR.reliefOdds || !this.affordPlan(n, plan)) continue;
      if (!atWar) this.declareWar(def.id, foe.nation, false, owner);
      if (this.launch(i, k, 'entsatz', WAR.minShips + 1)) return;
    }
    // 2. Offensive
    let running = 0;
    for (const a of s.armadas) if (a.nation === def.id && a.purpose === 'angriff' && a.status !== 'aufgeloest' && a.status !== 'heimkehr') running++;
    let coalition = false;
    for (const c of s.coalitions) if (s.t >= c.strikeAt && c.members.includes(def.id)) { coalition = true; break; }
    if (running >= WAR.maxOffensives + (coalition ? 1 : 0)) return;
    let best = -1, bu = this.threshold(i) - (coalition ? 0.2 : 0);
    for (let k = 0; k < this.islands.length; k++) {
      const u = this.utility(i, k);
      if (u > bu) { bu = u; best = k; }
    }
    if (best < 0) return;
    const target = this.isl[best].owner;
    const coalitionTarget = this.inCoalitionAgainst(def.id, target);
    if (target && !this.atWar(def.id, target)) {
      if (!this.mayDeclare(def.id, target, coalitionTarget)) return;
      // erst die Mittel, dann der Krieg: wer die Armada nicht bezahlen kann, erklärt auch keinen Krieg
      if (!this.affordPlan(n, this.planFor(i, best))) return;
      this.declareWar(def.id, target);
    }
    this.launch(i, best, 'angriff', 0, coalitionTarget);
  }

  /** Abstand von der nächsten eigenen Insel der Nation zu `w` (m; 1e9 ohne eigene Inseln) */
  private reachOf(nation: string, w: WarIsland): number {
    let dmin = 1e9;
    for (let k = 0; k < this.islands.length; k++) {
      if (this.isl[k].owner !== nation) continue;
      const d = Math.hypot(this.islands[k].x - w.x, this.islands[k].z - w.z);
      if (d < dmin) dmin = d;
    }
    return dmin;
  }

  /** Hat die Nation schon eine Armada (dieses Zwecks) zu dieser Insel unterwegs? */
  private hasArmada(nation: string, target: string, purpose: ArmadaPurpose | null): boolean {
    const list = this.state.armadas;
    for (let k = 0; k < list.length; k++) {
      const a = list[k];
      if (a.nation === nation && a.target === target && a.status !== 'aufgeloest' && (!purpose || a.purpose === purpose)) return true;
    }
    return false;
  }

  private countStatus(st: ArmadaStatus): number {
    let n = 0;
    for (const a of this.state.armadas) if (a.status === st) n++;
    return n;
  }

  /** Größe einer Armada für dieses Ziel (6 – 10 Schiffe): Bereitschaft, Mega-Inseln und Festungen brauchen mehr */
  private planSize(n: NationState, w: WarIsland): number {
    const ready = this.readiness(n);
    return clamp(WAR.minShips + Math.round(3 * ready) + (w.mega ? 1 : 0) + (w.tier === 'festung' ? 1 : 0), WAR.minShips, WAR.maxShips);
  }

  /** Bauplan in den Arbeitsfeldern (1 Kommandoschiff Klasse 4 – 5 / Ausbau 4 – 5, Linienschiffe und Fregatten, 1 – 2 bewaffnete Transporter) */
  private planFor(nationIdx: number, islandIdx: number, size = 0): typeof this.planScratch {
    const n = this.state.nations[this.registry.at(nationIdx).id];
    const w = this.islands[islandIdx];
    const total = size || this.planSize(n, w);
    const plan = this.planScratch;
    plan.length = 0;
    const transports = total >= 8 ? 2 : 1;
    const rich = n.stock.kanonenstahl > RESOURCE_TARGET.kanonenstahl * 0.8;
    this.planShip(plan, 'kommando', nationIdx, islandIdx, 1);
    for (let k = 0; k < transports; k++) this.planShip(plan, 'transport', nationIdx, islandIdx, 10 + k);
    for (let k = plan.length; k < total; k++) this.planShip(plan, (k % 2 === 0) === rich ? 'linie' : 'fregatte', nationIdx, islandIdx, 20 + k);
    return plan;
  }

  /** Stufe im Band einer Rolle (deterministisch aus Nation, Ziel und Platz) */
  private band(r: ArmadaRole, which: 'cls' | 'evo', nationIdx: number, islandIdx: number, salt: number): number {
    const [lo, hi] = ROLE_PLAN[r][which];
    return lo === hi ? lo : lo + (hash(nationIdx, islandIdx, salt) < 0.5 ? 0 : 1) * (hi - lo);
  }

  private planShip(plan: typeof this.planScratch, role: ArmadaRole, nationIdx: number, islandIdx: number, salt: number): void {
    const evo = this.band(role, 'evo', nationIdx, islandIdx, salt);
    const sail = clamp(evo - (role === 'transport' ? 0 : 1) + (hash(nationIdx, salt, 3) < 0.5 ? 1 : 0), 1, 5);
    plan.push({ role, cls: this.band(role, 'cls', nationIdx, islandIdx, salt + 7), hullTier: evo, sailTier: sail, cannonTier: evo });
  }

  /** Bezahlbar – und nach dem Auslaufen bleibt die Kriegsreserve an Gold und Proviant (sonst zwänge die Not nach drei Minuten zum Waffenstillstand) */
  private affordPlan(n: NationState, plan: readonly { role: ArmadaRole; cls: number; hullTier: number; sailTier: number; cannonTier: number }[]): boolean {
    const c = armadaCost(plan, this.bag2);
    for (const r of RESOURCE_IDS) if (n.stock[r] - c[r] < (WAR_RESERVE[r] ?? 0) * RESOURCE_TARGET[r]) return false;
    return true;
  }

  /** Armada aufstellen und auslaufen lassen; false, wenn nicht bezahlbar oder kein Hafen in Reichweite */
  launch(nationIdx: number, islandIdx: number, purpose: ArmadaPurpose, size = 0, coalition = false): ArmadaState | null {
    const s = this.state;
    const def = this.registry.at(nationIdx);
    const n = s.nations[def.id];
    const w = this.islands[islandIdx];
    if (!n || !w) return null;
    let plan = this.planFor(nationIdx, islandIdx, size);
    if (!this.affordPlan(n, plan)) {
      plan = this.planFor(nationIdx, islandIdx, WAR.minShips);
      if (!this.affordPlan(n, plan)) return null;
    }
    // Heimathafen: die nächste eigene Insel (bevorzugt Häfen)
    let home = -1, hd = 1e9;
    for (let k = 0; k < this.islands.length; k++) {
      if (this.isl[k].owner !== def.id) continue;
      const iw = this.islands[k];
      const d = Math.hypot(iw.x - w.x, iw.z - w.z) - (iw.tier === 'hafen' || iw.tier === 'hauptstadt' || iw.tier === 'mega' ? 400 : 0);
      if (d < hd) { hd = d; home = k; }
    }
    if (home < 0) return null;
    const cost = armadaCost(plan, this.bag2);
    for (const r of RESOURCE_IDS) n.stock[r] -= cost[r];
    const hw = this.islands[home];
    const ang = Math.atan2(w.x - hw.x, w.z - hw.z);
    const sx = hw.x + Math.sin(ang) * (hw.r * 1.6 + 80), sz = hw.z + Math.cos(ang) * (hw.r * 1.6 + 80);
    const tAng = Math.atan2(sx - w.x, sz - w.z);
    const tx = w.x + Math.sin(tAng) * (w.r * 1.45 + 140), tz = w.z + Math.cos(tAng) * (w.r * 1.45 + 140);
    const id = `ar${++s.seq}`;
    const ships: ArmadaShip[] = plan.map((p, k) => ({ id: `${id}-${k}`, role: p.role, cls: p.cls, hullTier: p.hullTier, sailTier: p.sailTier, cannonTier: p.cannonTier, hull: 1, sail: 1, down: false, slot: k }));
    let troops = 0, transports = 0;
    for (const p of plan) { troops += TROOPS_PER_SHIP[p.role]; if (p.role === 'transport') transports++; }
    const a: ArmadaState = {
      id, nation: def.id, purpose, target: w.id, home: hw.id, x: sx, z: sz, heading: ang, route: this.path(sx, sz, tx, tz), leg: 1,
      status: 'anmarsch', resume: 'anmarsch', ships, troops, supply: { proviant: TRANSPORT_SUPPLY.proviant * transports, medizin: TRANSPORT_SUPPLY.medizin * transports },
      morale: 1, firepower0: 0, createdAt: s.t, endedAt: -1, battleId: null, siegeId: null, coalition, calmUntil: 0, live: false,
    };
    a.firepower0 = armadaFire(a);
    s.armadas.push(a);
    s.stats.armadas++;
    this.notices.push({ type: 'armada', armada: a });
    return a;
  }

  /** Weg um Inseln (Wegpunkte etwa alle 200 m) */
  private path(ax: number, az: number, bx: number, bz: number): number[] {
    const r = routeAround(ax, az, bx, bz, this.obstacles, 60);
    const out: number[] = [];
    for (let k = 0; k < r.xs.length; k++) if (k % 3 === 0 || k === r.xs.length - 1) out.push(r.xs[k], r.zs[k]);
    if (out.length < 4) out.push(bx, bz);
    return out;
  }

  // ---------- Rückmeldungen der Seewelt (echte Schiffe in Spielernähe) ----------

  /** Die Seewelt fährt diese Armada mit echten Schiffen (oder nicht mehr) */
  setLive(armadaId: string, live: boolean): void {
    const a = this.armadaById(armadaId);
    if (!a) return;
    a.live = live;
    // wird eine Seite wieder zu Daten, rechnet die Engine die Schlacht weiter
    if (!live) { const bt = this.battleById(a.battleId); if (bt) bt.live = false; }
  }

  /**
   * Die Seewelt übernimmt eine Großschlacht (beide Seiten fahren als echte Schiffe, alle Bauaufträge sind erledigt) oder gibt sie zurück. Solange sie
   * nicht übernommen ist, rechnet die Engine weiter – eine Schlacht bleibt nie stehen, nur weil Schiffe noch gebaut werden.
   */
  setBattleLive(battleId: string, live: boolean): void {
    const bt = this.battleById(battleId);
    if (bt && !bt.ended) bt.live = live;
  }

  /** Echte Trupps kämpfen an Land (Verluste meldet `siegeLosses`); sonst rechnet die Engine die Abnutzung */
  setSiegeLive(siegeId: string, live: boolean): void {
    const sg = this.siegeById(siegeId);
    if (sg) sg.live = live;
  }

  /** Ist die Schlacht dieser Armada gerade in der Seewelt (beide Seiten echt)? */
  battleLive(battleId: string | null): boolean { return !!this.battleById(battleId)?.live; }

  /** Lage der Armada (Führungsschiff) und Zustand eines Schiffs aus der Seewelt übernehmen */
  syncArmada(armadaId: string, x: number, z: number, heading: number): void {
    const a = this.armadaById(armadaId);
    if (!a || !Number.isFinite(x + z + heading)) return;
    a.x = x; a.z = z; a.heading = heading;
    // Wegpunkt weiterschalten, sobald die echte Flotte ihn passiert hat
    while (a.leg < a.route.length / 2 - 1 && Math.hypot(a.route[a.leg * 2] - x, a.route[a.leg * 2 + 1] - z) < 140) a.leg++;
  }
  /** `by` = Spieler, der das Schiff versenkt hat (letzter Treffer kurz davor): er bekommt Kriegspunkte bei der begünstigten Macht (4.5B) */
  syncShip(armadaId: string, shipId: string, hull: number, sail: number, down: boolean, by: string | null = null): void {
    const a = this.armadaById(armadaId);
    if (!a) return;
    for (const sh of a.ships) {
      if (sh.id !== shipId) continue;
      if (Number.isFinite(hull)) sh.hull = clamp01(hull);
      if (Number.isFinite(sail)) sh.sail = clamp01(sail);
      if (down && !sh.down) {
        const beneficiary = this.beneficiaryOf(a);
        this.sink(a, sh);
        const bt = this.battleById(a.battleId);
        if (bt) { if (bt.a === a.id) bt.sunkA++; else bt.sunkB++; }
        if (by) this.creditSink(by, a, sh, beneficiary);
      }
      return;
    }
  }

  /** Wem nützt es, wenn diese Armada Schiffe verliert? Dem Gegner in ihrer Schlacht, sonst den Belagerten (Entsatz: dem Belagerer), sonst dem Herrn ihres Ziels */
  beneficiaryOf(a: ArmadaState): string | null {
    const bt = this.battleById(a.battleId);
    let n: string | null = bt && !bt.ended ? (bt.nationA === a.nation ? bt.nationB : bt.nationA) : null;
    if (!n && a.purpose === 'entsatz') n = this.siegeOf(a.target)?.attacker ?? null;
    if (!n) n = this.state.islands[a.target]?.owner ?? null;
    return n && n !== a.nation ? n : null;
  }

  /** Versenkt vom Spieler: Kriegspunkte (Kommandoschiff 40, Transporter 30, sonst 15) und Fortschritt im Auftrag „Nachschubkonvoi abfangen“ */
  private creditSink(playerId: string, a: ArmadaState, sh: ArmadaShip, beneficiary: string | null): void {
    const kp = sh.role === 'kommando' ? WAR.kp.kommando : sh.role === 'transport' ? WAR.kp.transport : WAR.kp.schiff;
    const label = sh.role === 'kommando' ? 'Kommandoschiff versenkt' : sh.role === 'transport' ? 'Nachschub-Transporter versenkt' : 'Kriegsschiff versenkt';
    if (sh.role === 'transport') {
      for (const c of this.state.contracts) if (c.status === 'aktiv' && c.playerId === playerId && c.kind === 'abfangen' && c.armadaId === a.id) c.done++;
    }
    if (beneficiary) this.awardMerit(playerId, beneficiary, kp, label, a.siegeId ? this.siegeById(a.siegeId)?.islandId ?? a.target : a.target);
  }

  /**
   * Kriegspunkte gutschreiben (4.5B): Konto des Spielers bei der begünstigten Nation, laufende Aufträge dieser Nation an dieser Insel sammeln mit; die
   * Meldung `kriegspunkte` zahlt das Spiel sofort aus (Gold, Ansehen).
   */
  awardMerit(playerId: string, nation: string | null, kp: number, reason: string, islandId: string | null = null): void {
    if (!nation || !(kp > 0) || !this.registry.has(nation)) return;
    const acc = (this.state.merit[playerId] ??= {});
    acc[nation] = (acc[nation] ?? 0) + kp;
    for (const c of this.state.contracts) if (c.status === 'aktiv' && c.playerId === playerId && c.client === nation && (!islandId || c.islandId === islandId)) c.merit += kp;
    this.notices.push({ type: 'kriegspunkte', playerId, nation, kp, reason });
  }

  /** Kriegspunkte eines Spielers bei einer Nation */
  meritOf(playerId: string, nation: string): number { return this.state.merit[playerId]?.[nation] ?? 0; }

  // ---------- Kontrollpunkte an Land (4.5B) ----------

  /**
   * Ein Schritt um die Kontrollpunkte: `att[i]`/`def[i]` = Kampfkraft (Köpfe, Spielfigur, Offiziere) der Angreifer bzw. Verteidiger im Fangradius von
   * Punkt i. Wer die Übermacht hat, schiebt `hold` zu seiner Seite (ein ganzer Wechsel dauert `pointSeconds` bei klarer Übermacht); erreicht ein Punkt
   * ±1, wechselt er die Hand (Meldung). `present` = Spieler und seine Seite samt Bitmaske der Punkte, an denen er steht: erobert seine Seite dort
   * einen Punkt, bekommt er Kriegspunkte. Liefert die Bitmaske der Punkte, die gerade die Hand gewechselt haben.
   */
  controlStep(siegeId: string, att: ArrayLike<number>, def: ArrayLike<number>, dt: number, present: { playerId: string; side: SiegeSide; at: number } | null = null): number {
    const sg = this.siegeById(siegeId);
    if (!sg || sg.ended || !(dt > 0)) return 0;
    let flips = 0;
    for (let i = 0; i < sg.points.length; i++) {
      const p = sg.points[i];
      const a = Math.max(0, att[i] ?? 0), d = Math.max(0, def[i] ?? 0);
      if (a + d <= 0) continue;
      const push = (a - d) / (a + d);
      const before = p.hold;
      p.hold = clamp(p.hold + (push * dt * 2) / WAR.pointSeconds, -1, 1);
      let side: SiegeSide | null = null;
      if (p.hold >= 1 && before < 1) side = 'angreifer';
      else if (p.hold <= -1 && before > -1) side = 'verteidiger';
      if (!side) continue;
      flips |= 1 << i;
      const nation = side === 'angreifer' ? sg.attacker : sg.defender;
      this.notices.push({ type: 'punkt', siegeId: sg.id, islandId: sg.islandId, name: p.name, side, nation });
      if (present && present.side === side && present.at & (1 << i)) this.awardMerit(present.playerId, nation, WAR.kp.punkt, `${p.name} erobert`, sg.islandId);
    }
    return flips;
  }

  /** Spieler ergreift an einer Belagerung Partei (oder wechselt die Seite) */
  joinSiege(siegeId: string, playerId: string, side: SiegeSide): boolean {
    const sg = this.siegeById(siegeId);
    if (!sg || sg.ended) return false;
    const h = sg.helpers.find((x) => x.playerId === playerId);
    if (h) h.side = side; else sg.helpers.push({ playerId, side });
    return true;
  }
  /** Seite des Spielers an dieser Belagerung (null: hat keine Partei ergriffen) */
  helperSide(siegeId: string, playerId: string): SiegeSide | null {
    const sg = this.siegeById(siegeId);
    return sg?.helpers.find((x) => x.playerId === playerId)?.side ?? null;
  }

  // ---------- Kriegsaufträge (4.5B) ----------

  /** Lohn eines Auftrags nach Art und Größe der Zielinsel */
  private rewardOf(kind: ContractKind, w: WarIsland): ContractReward {
    const d = CONTRACT_DEFS[kind], k = CONTRACT_TIER_K[w.tier];
    return {
      gold: Math.round((d.gold * (1 + k)) / 10) * 10, seals: d.seals + (w.mega || w.tier === 'festung' ? 1 : 0),
      honor: Math.round(d.honor * (1 + 0.5 * k)), standing: d.standing, foeStanding: d.foeStanding,
    };
  }

  private offer(kind: ContractKind, ref: string, client: string, opponent: string | null, w: WarIsland, siegeId: string | null, armadaId: string | null, side: SiegeSide | null, need: number, goal: number): ContractOffer {
    const d = CONTRACT_DEFS[kind];
    return { offerId: `${kind}:${ref}`, kind, title: `${d.title}: ${w.name}`, text: d.text, client, opponent, islandId: w.id, islandName: w.name, siegeId, armadaId, side, need, goal, reward: this.rewardOf(kind, w) };
  }

  /**
   * Angebote für einen Spieler, abgeleitet aus den laufenden Aktionen der Engine: je Belagerung „Belagerung entsetzen“ und „Blockadebrecher-Lieferung“
   * für den Belagerten, je Angriffs-Armada „Invasions-Armada anführen“ für den Angreifer und – solange sie Transporter führt – „Nachschubkonvoi abfangen“
   * für den Herrn des Ziels. Was der Spieler schon angenommen hat, fehlt. Schreibt in `out`.
   */
  contractOffers(playerId: string, out: ContractOffer[]): ContractOffer[] {
    out.length = 0;
    const s = this.state;
    const taken = (offerId: string) => s.contracts.some((c) => c.playerId === playerId && c.offerId === offerId);
    const push = (o: ContractOffer) => { if (!taken(o.offerId)) out.push(o); };
    for (const sg of s.sieges) {
      if (sg.ended || !sg.defender) continue;
      const w = this.island(sg.islandId);
      if (!w) continue;
      push(this.offer('entsatz', sg.id, sg.defender, sg.attacker, w, sg.id, sg.armadaId, 'verteidiger', WAR.contractMerit, 0));
      push(this.offer('blockade', sg.id, sg.defender, sg.attacker, w, sg.id, sg.armadaId, 'verteidiger', 0, 1));
    }
    for (const a of s.armadas) {
      if (a.purpose !== 'angriff' || (a.status !== 'anmarsch' && a.status !== 'belagerung' && a.status !== 'gefecht')) continue;
      const w = this.island(a.target);
      if (!w) continue;
      const owner = this.state.islands[a.target]?.owner ?? null;
      push(this.offer('invasion', a.id, a.nation, owner, w, a.siegeId, a.id, 'angreifer', WAR.contractMerit, 0));
      if (owner && owner !== a.nation && this.transportsLeft(a) > 0) push(this.offer('abfangen', a.id, owner, a.nation, w, a.siegeId, a.id, null, 0, 1));
    }
    return out;
  }

  /** Angebot annehmen (höchstens `WAR.maxContracts` laufende je Spieler); stellt den Spieler bei Entsatz und Invasion auf die Seite seines Auftraggebers */
  acceptContract(playerId: string, offerId: string): WarContract | null {
    const s = this.state;
    let running = 0;
    for (const c of s.contracts) if (c.playerId === playerId && c.status === 'aktiv') running++;
    if (running >= WAR.maxContracts) return null;
    const list = this.contractOffers(playerId, []);
    const o = list.find((x) => x.offerId === offerId);
    if (!o) return null;
    const c: WarContract = {
      id: `ka${++s.seq}`, offerId: o.offerId, kind: o.kind, playerId, client: o.client, opponent: o.opponent, islandId: o.islandId, siegeId: o.siegeId,
      armadaId: o.armadaId, side: o.side, acceptedAt: s.t, deadline: s.t + WAR.contractTime, merit: 0, need: o.need, done: 0, goal: o.goal,
      status: 'aktiv', endedAt: -1, note: '', reward: { ...o.reward },
    };
    s.contracts.push(c);
    s.stats.contracts++;
    if (c.siegeId && c.side) this.joinSiege(c.siegeId, playerId, c.side);
    return c;
  }

  /** Auftrag aufgeben (das Spiel zieht etwas Ansehen ab) */
  abandonContract(playerId: string, contractId: string): WarContract | null {
    const c = this.state.contracts.find((x) => x.id === contractId && x.playerId === playerId && x.status === 'aktiv');
    if (!c) return null;
    this.finishContract(c, 'aufgegeben', 'Aufgegeben');
    return c;
  }

  /**
   * Blockadebrecher: der Spieler hat Nachschub in den Hafen der belagerten Insel gebracht. Garnison +25, Moral der Belagerer −12 %, Fortschritt −12 %;
   * der Auftrag ist erfüllt. false, wenn kein passender Auftrag läuft oder die Belagerung schon vorbei ist.
   */
  deliverBlockade(playerId: string, contractId: string): boolean {
    const c = this.state.contracts.find((x) => x.id === contractId && x.playerId === playerId && x.status === 'aktiv' && x.kind === 'blockade');
    const sg = c ? this.siegeById(c.siegeId) : null;
    if (!c || !sg || sg.ended) return false;
    const D = WAR.delivery;
    const st = this.state.islands[sg.islandId];
    const w = this.island(sg.islandId);
    sg.garrison += D.garrison;
    if (st && w) st.garrison = Math.min(w.garrisonMax * 2, st.garrison + D.garrison);
    const a = this.armadaById(sg.armadaId);
    if (a) a.morale = Math.max(0, a.morale - D.morale);
    sg.morale = Math.max(0, sg.morale - D.morale);
    sg.progress = Math.max(0, sg.progress - D.progress);
    c.done = c.goal;
    this.awardMerit(playerId, c.client, WAR.kp.lieferung, `Nachschub nach ${w?.name ?? sg.islandId} gebracht`, sg.islandId);
    this.finishContract(c, 'erfuellt', 'Lieferung durch die Blockade gebracht');
    return true;
  }

  /** Laufende Aufträge eines Spielers (in `out`) */
  contractsOf(playerId: string, out: WarContract[]): WarContract[] {
    out.length = 0;
    for (const c of this.state.contracts) if (c.playerId === playerId) out.push(c);
    return out;
  }

  private finishContract(c: WarContract, status: ContractStatus, note: string): void {
    if (c.status !== 'aktiv') return;
    c.status = status;
    c.endedAt = this.state.t;
    c.note = note;
    this.notices.push({ type: 'auftrag', contract: c });
  }

  /**
   * Ziel erreicht (Entsatz, Invasion): voller Lohn ab den nötigen Kriegspunkten; ab der Hälfte ein Teil-Lohn im Verhältnis des Beitrags (ohne Boss-Siegel);
   * darunter gescheitert.
   */
  private settleByMerit(c: WarContract, what: string): void {
    const m = Math.round(c.merit);
    if (c.merit >= c.need) { this.finishContract(c, 'erfuellt', what); return; }
    if (c.merit < c.need / 2) { this.finishContract(c, 'gescheitert', `${what}, aber du hast zu wenig beigetragen (${m}/${c.need} Kriegspunkte)`); return; }
    const k = c.merit / c.need, r = c.reward;
    r.gold = Math.round((r.gold * k) / 10) * 10; r.honor = Math.round(r.honor * k); r.standing = Math.max(1, Math.round(r.standing * k)); r.seals = 0;
    this.finishContract(c, 'erfuellt', `${what} – Teil-Lohn für ${m}/${c.need} Kriegspunkte`);
  }

  /** Aufträge prüfen: erfüllt, gescheitert, abgelaufen (je Takt; wenige Einträge) */
  private stepContracts(): void {
    const s = this.state;
    for (let k = 0; k < s.contracts.length; k++) {
      const c = s.contracts[k];
      if (c.status !== 'aktiv') continue;
      const owner = s.islands[c.islandId]?.owner ?? null;
      const a = this.armadaById(c.armadaId);
      // Invasion: sobald die Armada belagert, gehört der Spieler zu den Angreifern dieser Belagerung
      if (!c.siegeId && a?.siegeId) c.siegeId = a.siegeId;
      if (c.siegeId && c.side && !this.helperSide(c.siegeId, c.playerId)) this.joinSiege(c.siegeId, c.playerId, c.side);
      const sg = this.siegeById(c.siegeId);
      switch (c.kind) {
        case 'entsatz':
          if (owner !== c.client) { this.finishContract(c, 'gescheitert', 'Die Insel ist gefallen'); continue; }
          if (!sg || sg.ended) { this.settleByMerit(c, 'Die Belagerung ist gebrochen'); continue; }
          break;
        case 'invasion':
          if (owner === c.client) { this.settleByMerit(c, 'Die Insel ist gefallen'); continue; }
          if (!a || a.status === 'aufgeloest' || a.status === 'heimkehr') { this.finishContract(c, 'gescheitert', 'Die Armada hat abgedreht'); continue; }
          break;
        case 'abfangen':
          if (c.done >= c.goal) { this.finishContract(c, 'erfuellt', 'Nachschub-Transporter versenkt'); continue; }
          if (!a || a.status === 'aufgeloest' || a.status === 'heimkehr' || this.transportsLeft(a) === 0) { this.finishContract(c, 'gescheitert', 'Der Nachschub ist dir entkommen'); continue; }
          break;
        case 'blockade':
          if (!sg || sg.ended) { this.finishContract(c, 'gescheitert', 'Die Belagerung endete vor der Lieferung'); continue; }
          break;
      }
      if (s.t > c.deadline) this.finishContract(c, 'gescheitert', 'Zeit abgelaufen');
    }
  }
  /**
   * Verluste der Truppen an Land (echte Trupps in Spielernähe) als Differenz seit der letzten Meldung: so bleiben Änderungen von außen erhalten
   * (Blockadebrecher-Lieferung stärkt die Garnison, versenkte Transporter kosten Truppen).
   */
  siegeLosses(siegeId: string, troopsLost: number, garrisonLost: number): void {
    const sg = this.siegeById(siegeId);
    if (!sg || sg.ended) return;
    if (Number.isFinite(troopsLost) && troopsLost > 0) sg.troops = Math.max(0, sg.troops - troopsLost);
    if (Number.isFinite(garrisonLost) && garrisonLost > 0) sg.garrison = Math.max(0, sg.garrison - garrisonLost);
    const a = this.armadaById(sg.armadaId);
    if (a) a.troops = sg.troops;
  }

  /** Der ganze Zustand als JSON-Kopie (Spielstand, Welt-Server) */
  snapshot(): FactionWarState { return JSON.parse(JSON.stringify(this.state)) as FactionWarState; }
}

/** Deterministischer Wert 0 … 1 aus drei Zahlen (Bauplan, ohne den Zufallsgenerator zu verbrauchen) */
function hash(a: number, b: number, c: number): number {
  let h = (Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b) ^ Math.imul(c + 13, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------------------------------------------
// Säubern (Laden, Import, Server)
// ---------------------------------------------------------------------------------------------------------------

const num = (v: unknown, d: number, lo = -1e12, hi = 1e12) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v.slice(0, 64) : d);
const DIPLO: readonly DiplomacyState[] = ['allianz', 'handelspakt', 'neutral', 'rivalitaet', 'krieg'];
const ROLES: readonly ArmadaRole[] = ['kommando', 'linie', 'fregatte', 'transport'];
const ASTATUS: readonly ArmadaStatus[] = ['anmarsch', 'gefecht', 'belagerung', 'heimkehr', 'aufgeloest'];

function cleanBag(raw: unknown, d: ResourceBag): ResourceBag {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const b = emptyBag();
  for (const r of RESOURCE_IDS) b[r] = num(o[r], d[r], 0, RESOURCE_CAP[r] * 4);
  return b;
}

/**
 * Fremde oder alte Daten säubern: unbekannte Nationen und Inseln fallen weg, Zahlen werden begrenzt, nichts bleibt „live“ hängen (echte Schiffe
 * entstehen nach dem Laden neu). null = unbrauchbar (dann beginnt das Ökosystem neu).
 */
export function cleanFactionWar(raw: unknown, registry: NationRegistry, islands: readonly WarIsland[]): FactionWarState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, any>;
  if (o.v !== 1) return null;
  const s = newWarState(registry, islands, num(o.rng, 0x4a5e5, 0, 4294967295) >>> 0);
  s.t = num(o.t, 0, 0, 1e10); s.seq = Math.round(num(o.seq, 0, 0, 1e9));
  s.nextCycleAt = num(o.nextCycleAt, s.t + WAR.cycle, 0, 1e10); s.nextDiplomacyAt = num(o.nextDiplomacyAt, s.t + WAR.diplomacyEvery, 0, 1e10);
  s.hegemon = typeof o.hegemon === 'string' && registry.has(o.hegemon) ? o.hegemon : null;
  if (o.stats && typeof o.stats === 'object') for (const k of Object.keys(s.stats) as (keyof FactionWarState['stats'])[]) s.stats[k] = Math.round(num(o.stats[k], 0, 0, 1e9));
  if (o.nations && typeof o.nations === 'object') for (const [id, n] of Object.entries(o.nations as Record<string, any>)) {
    const cur = s.nations[id];
    if (!cur || !n || typeof n !== 'object') continue;
    cur.stock = cleanBag(n.stock, cur.stock);
    cur.income = cleanBag(n.income, emptyBag());
    cur.nextBrainAt = num(n.nextBrainAt, cur.nextBrainAt, 0, 1e10);
    cur.shipsLost = Math.round(num(n.shipsLost, 0, 0, 1e7)); cur.islandsLost = Math.round(num(n.islandsLost, 0, 0, 1e7)); cur.islandsWon = Math.round(num(n.islandsWon, 0, 0, 1e7));
  }
  const byId = new Map(islands.map((w) => [w.id, w]));
  if (o.islands && typeof o.islands === 'object') for (const [id, v] of Object.entries(o.islands as Record<string, any>)) {
    const w = byId.get(id), cur = s.islands[id];
    if (!w || !cur || !v || typeof v !== 'object') continue;
    const owner = v.owner === null ? null : typeof v.owner === 'string' && registry.has(v.owner) ? v.owner : cur.owner;
    // nur eroberbare Inseln wechseln den Besitzer (ein kaputter Stand darf keine Hauptstadt verschenken)
    cur.owner = w.conquerable ? owner : w.founder;
    cur.garrison = num(v.garrison, w.garrisonMax, 0, w.garrisonMax * 2);
    cur.store = cleanBag(v.store, emptyBag());
    cur.conqueredAt = num(v.conqueredAt, -1, -1, 1e10);
    cur.siegeId = typeof v.siegeId === 'string' ? str(v.siegeId) : null;
    cur.reliefAt = num(v.reliefAt, -1e9, -1e9, 1e10);
  }
  if (Array.isArray(o.relations)) for (const r of o.relations) {
    if (!r || typeof r !== 'object') continue;
    const cur = s.relations.find((x) => (x.a === r.a && x.b === r.b) || (x.a === r.b && x.b === r.a));
    if (!cur) continue;
    cur.state = DIPLO.includes(r.state) ? r.state : cur.state;
    cur.trust = num(r.trust, cur.trust, -100, 100); cur.weariness = num(r.weariness, 0, 0, 100);
    cur.since = num(r.since, 0, 0, 1e10); cur.truceUntil = num(r.truceUntil, 0, 0, 1e10);
    cur.coalition = typeof r.coalition === 'string' ? str(r.coalition) : null;
    // 4.5B: Zweier-Bündnis (in Ständen aus 4.5.0 fehlt das Feld: keines)
    cur.allianceUntil = cur.state === 'allianz' ? num(r.allianceUntil, 0, 0, 1e10) : 0;
  }
  if (Array.isArray(o.coalitions)) for (const c of o.coalitions.slice(0, 6)) {
    if (!c || typeof c !== 'object' || typeof c.against !== 'string' || !registry.has(c.against)) continue;
    const members = Array.isArray(c.members) ? c.members.filter((m: unknown): m is string => typeof m === 'string' && registry.has(m) && m !== c.against) : [];
    if (members.length < 2) continue;
    s.coalitions.push({ id: str(c.id, `ko${++s.seq}`), against: c.against, members, formedAt: num(c.formedAt, 0, 0, 1e10), strikeAt: num(c.strikeAt, 0, 0, 1e10), calmSince: num(c.calmSince, -1, -1, 1e10) });
  }
  if (Array.isArray(o.armadas)) for (const a of o.armadas.slice(0, WAR.maxArmadas * 2)) {
    if (!a || typeof a !== 'object' || typeof a.nation !== 'string' || !registry.has(a.nation) || !byId.has(a.target) || !byId.has(a.home)) continue;
    if (!Array.isArray(a.route) || a.route.length < 4 || !Array.isArray(a.ships)) continue;
    const ships: ArmadaShip[] = a.ships.slice(0, WAR.maxShips).filter((x: any) => x && ROLES.includes(x.role)).map((x: any, k: number) => ({
      id: str(x.id, `${a.id}-${k}`), role: x.role, cls: Math.round(num(x.cls, 3, 0, 6)), hullTier: Math.round(num(x.hullTier, 3, 1, 5)), sailTier: Math.round(num(x.sailTier, 3, 1, 5)),
      cannonTier: Math.round(num(x.cannonTier, 3, 1, 5)), hull: num(x.hull, 1, 0, 1), sail: num(x.sail, 1, 0, 1), down: x.down === true, slot: Math.round(num(x.slot, k, 0, 20)),
    }));
    if (!ships.length) continue;
    const status: ArmadaStatus = ASTATUS.includes(a.status) ? a.status : 'heimkehr';
    s.armadas.push({
      id: str(a.id, `ar${++s.seq}`), nation: a.nation, purpose: a.purpose === 'entsatz' ? 'entsatz' : 'angriff', target: a.target, home: a.home,
      x: num(a.x, 0), z: num(a.z, 0), heading: num(a.heading, 0), route: a.route.slice(0, 4000).map((v: unknown) => num(v, 0)), leg: Math.round(num(a.leg, 1, 1, 4000)),
      status, resume: ASTATUS.includes(a.resume) ? a.resume : 'anmarsch', ships, troops: num(a.troops, 0, 0, 5000),
      supply: { proviant: num(a.supply?.proviant, 0, 0, 5000), medizin: num(a.supply?.medizin, 0, 0, 5000) }, morale: num(a.morale, 1, 0, 1),
      firepower0: num(a.firepower0, 1, 0, 1e6), createdAt: num(a.createdAt, 0, 0, 1e10), endedAt: num(a.endedAt, -1, -1, 1e10),
      battleId: typeof a.battleId === 'string' ? a.battleId : null, siegeId: typeof a.siegeId === 'string' ? a.siegeId : null, coalition: a.coalition === true,
      calmUntil: num(a.calmUntil, 0, 0, 1e10), live: false,
    });
  }
  if (Array.isArray(o.battles)) for (const b of o.battles.slice(0, 16)) {
    if (!b || typeof b !== 'object' || typeof b.a !== 'string' || typeof b.b !== 'string') continue;
    s.battles.push({
      id: str(b.id, `gs${++s.seq}`), x: num(b.x, 0), z: num(b.z, 0), a: b.a, b: b.b, nationA: str(b.nationA), nationB: str(b.nationB),
      islandId: typeof b.islandId === 'string' ? b.islandId : null, startedAt: num(b.startedAt, 0, 0, 1e10), t: num(b.t, 0, 0, 1e10), live: false,
      ended: b.ended === true, endedAt: num(b.endedAt, -1, -1, 1e10), winner: typeof b.winner === 'string' ? b.winner : null,
      reason: b.reason === 'sieg' || b.reason === 'rueckzug' || b.reason === 'vernichtet' ? b.reason : null, sunkA: Math.round(num(b.sunkA, 0, 0, 99)), sunkB: Math.round(num(b.sunkB, 0, 0, 99)),
    });
  }
  if (Array.isArray(o.sieges)) for (const g of o.sieges.slice(0, 16)) {
    if (!g || typeof g !== 'object' || !byId.has(g.islandId) || typeof g.attacker !== 'string' || !registry.has(g.attacker)) continue;
    const w = byId.get(g.islandId)!;
    // Kontrollpunkte (4.5B): gespeicherte übernehmen, in Ständen aus 4.5.0 aus Insel und Lage der Belagerungsflotte neu anlegen (umkämpft)
    const fleet = s.armadas.find((x) => x.id === g.armadaId);
    const fresh = siegePoints(w, fleet ? Math.atan2(fleet.x - w.x, fleet.z - w.z) : 0);
    const points: SiegePoint[] = Array.isArray(g.points) && g.points.length
      ? g.points.slice(0, 4).filter((p: any) => p && typeof p === 'object' && typeof p.kind === 'string' && p.kind in SIEGE_POINT_NAMES).map((p: any) => ({
        kind: p.kind as SiegePointKind, name: SIEGE_POINT_NAMES[p.kind as SiegePointKind], x: num(p.x, w.x), z: num(p.z, w.z), hold: num(p.hold, 0, -1, 1),
      }))
      : fresh;
    const helpers = Array.isArray(g.helpers) ? g.helpers.slice(0, 32).filter((h: any) => h && typeof h.playerId === 'string' && (h.side === 'angreifer' || h.side === 'verteidiger')).map((h: any) => ({ playerId: str(h.playerId), side: h.side as SiegeSide })) : [];
    s.sieges.push({
      id: str(g.id, `bl${++s.seq}`), islandId: g.islandId, attacker: g.attacker, defender: typeof g.defender === 'string' && registry.has(g.defender) ? g.defender : null,
      armadaId: str(g.armadaId), progress: num(g.progress, 0, 0, 1), morale: num(g.morale, 1, 0, 1), troops: num(g.troops, 0, 0, 5000), garrison: num(g.garrison, 0, 0, 5000),
      startedAt: num(g.startedAt, 0, 0, 1e10), t: num(g.t, 0, 0, 1e10), transportsLost: Math.round(num(g.transportsLost, 0, 0, 9)), paused: g.paused === true, live: false,
      ended: g.ended === true, endedAt: num(g.endedAt, -1, -1, 1e10), outcome: g.outcome === 'erobert' || g.outcome === 'abgebrochen' ? g.outcome : null,
      points: points.length ? points : fresh, helpers,
    });
  }
  // Kriegsaufträge und Kriegspunkte (4.5B; fehlen in Ständen aus 4.5.0)
  const KINDS: readonly ContractKind[] = ['entsatz', 'invasion', 'abfangen', 'blockade'];
  const STATUS: readonly ContractStatus[] = ['aktiv', 'erfuellt', 'gescheitert', 'aufgegeben'];
  if (Array.isArray(o.contracts)) for (const c of o.contracts.slice(0, 48)) {
    if (!c || typeof c !== 'object' || !KINDS.includes(c.kind) || typeof c.playerId !== 'string' || typeof c.client !== 'string' || !registry.has(c.client) || !byId.has(c.islandId)) continue;
    const rw = c.reward && typeof c.reward === 'object' ? c.reward : {};
    s.contracts.push({
      id: str(c.id, `ka${++s.seq}`), offerId: str(c.offerId, `${c.kind}:alt`), kind: c.kind, playerId: str(c.playerId), client: c.client,
      opponent: typeof c.opponent === 'string' && registry.has(c.opponent) ? c.opponent : null, islandId: c.islandId,
      siegeId: typeof c.siegeId === 'string' ? str(c.siegeId) : null, armadaId: typeof c.armadaId === 'string' ? str(c.armadaId) : null,
      side: c.side === 'angreifer' || c.side === 'verteidiger' ? c.side : null, acceptedAt: num(c.acceptedAt, 0, 0, 1e10), deadline: num(c.deadline, s.t + WAR.contractTime, 0, 1e10),
      merit: num(c.merit, 0, 0, 1e6), need: num(c.need, 0, 0, 1e4), done: Math.round(num(c.done, 0, 0, 99)), goal: Math.round(num(c.goal, 0, 0, 99)),
      status: STATUS.includes(c.status) ? c.status : 'gescheitert', endedAt: num(c.endedAt, -1, -1, 1e10), note: typeof c.note === 'string' ? c.note.slice(0, 120) : '',
      reward: { gold: num(rw.gold, 0, 0, 1e5), seals: Math.round(num(rw.seals, 0, 0, 9)), honor: num(rw.honor, 0, 0, 500), standing: num(rw.standing, 0, 0, 50), foeStanding: num(rw.foeStanding, 0, -50, 0) },
    });
  }
  if (o.merit && typeof o.merit === 'object') for (const [pid, acc] of Object.entries(o.merit as Record<string, unknown>)) {
    if (!acc || typeof acc !== 'object') continue;
    const out: Record<string, number> = {};
    for (const [nid, v] of Object.entries(acc as Record<string, unknown>)) if (registry.has(nid)) out[nid] = num(v, 0, 0, 1e7);
    s.merit[pid.slice(0, 64)] = out;
  }
  // Verweise prüfen: Schlachten und Belagerungen ohne ihre Armada enden, Inseln zeigen nur auf laufende Belagerungen
  const armadaIds = new Set(s.armadas.map((a) => a.id));
  for (const b of s.battles) if (!b.ended && (!armadaIds.has(b.a) || !armadaIds.has(b.b))) { b.ended = true; b.endedAt = s.t; }
  for (const g of s.sieges) if (!g.ended && !armadaIds.has(g.armadaId)) { g.ended = true; g.endedAt = s.t; g.outcome = 'abgebrochen'; }
  const openSieges = new Set(s.sieges.filter((g) => !g.ended).map((g) => g.id));
  for (const id in s.islands) { const st = s.islands[id]; if (st.siegeId && !openSieges.has(st.siegeId)) st.siegeId = null; }
  const openBattles = new Set(s.battles.filter((b) => !b.ended).map((b) => b.id));
  for (const a of s.armadas) {
    if (a.battleId && !openBattles.has(a.battleId)) { a.battleId = null; if (a.status === 'gefecht') a.status = a.resume === 'gefecht' ? 'anmarsch' : a.resume; }
    if (a.siegeId && !openSieges.has(a.siegeId)) { a.siegeId = null; if (a.status === 'belagerung') a.status = 'heimkehr'; }
  }
  return s;
}
