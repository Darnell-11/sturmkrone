// Instanzierte Belagerungs-Raids: reine Daten (JSON-tauglich, ohne three.js). Wie bei einem Schlachtzug gehört alles, was zählt
// (Teilnehmer, Ziele, Anlege-Plätze, Mauern, Viertel), zu einer Instanz mit eigener Kennung und einem festen Zufallswert (`seed`);
// ein oder mehrere Spieler greifen über dieselben Daten zu, und ein Server könnte sie ohne Umbau halten.
import type { FactionId } from '../data/factions';
import type { PersonalLoot } from './raidLoot';

/** Route A: Seetor und Mauern von See einreißen und im Burghafen anlegen. Route B: im Flachland landen und durch vier Stadtviertel marschieren. */
export type RaidRoute = 'A' | 'B';
/** briefing: Vorbereitung · sea: Seeschlacht gegen die Wachflotte · assault: Landung und Sturm auf die Burg · victory / retreat: Ende */
export type RaidPhase = 'briefing' | 'sea' | 'assault' | 'victory' | 'retreat';
export type StructureState = 'INTACT' | 'DAMAGED' | 'BREACHED';
export type StructureKind = 'seagate' | 'wall' | 'tower' | 'battery';
export type SlotZone = 'beach' | 'harbor';
export type DistrictId = 'strand' | 'hafen' | 'markt' | 'aufstieg';

/** Ein Teilnehmer des Raids (ein Spieler mit Flaggschiff und Flottenbegleitung) */
export interface RaidParticipant {
  playerId: string;
  /** Entitäts-Kennung des Flaggschiffs (null, solange keins gemeldet ist) */
  flagshipId: string | null;
  /** Eigene Begleitschiffe (Flottenstufe des Spielers) und angeheuerte Söldner-Eskorten */
  escorts: number;
  mercenaries: number;
  leader: boolean;
  alive: boolean;
  /** Belegter Anlege-Platz (slotId) oder null */
  slotId: string | null;
  /** Beitrag: Schaden an Bauwerken und versenkte Schiffe, gefallene Gegner an Land */
  structureDamage: number;
  shipsSunk: number;
  kills: number;
}

export interface RaidObjective {
  id: 'fleet' | 'breach' | 'districts' | 'keep';
  label: string;
  required: number;
  progress: number;
  done: boolean;
  /** Gilt für Route A, Route B oder beide */
  route: RaidRoute | 'both';
}

/**
 * Der Raid-Kontext: alles, was eine Instanz ausmacht. Er hängt an der Gruppe, nicht am einzelnen Spieler: Anlege-Plätze, Mauern
 * und Fortschritts-Auslöser gelten für alle Teilnehmer gemeinsam (`sharedObjectives`).
 */
export interface RaidPartyContext {
  raidInstanceId: string;
  factionId: FactionId;
  seed: number;
  leaderPlayerId: string;
  participants: RaidParticipant[];
  sharedObjectives: RaidObjective[];
  /** Persönliche Beute je Teilnehmer (`participantId` → eigener Wurf, nach dem Sieg gefüllt; nichts wird geteilt) */
  personalLoot?: Record<string, PersonalLoot>;
}

/** Ein zerstörbares Bauwerk (Seetor, Mauerflügel, Turm, Küstenbatterie) mit eigener Kennung und eigenen Lebenspunkten */
export interface RaidStructureDef {
  structureId: string;
  kind: StructureKind;
  label: string;
  /** Mitte in Inselkoordinaten, Drehung wie rotation.y, Ausmaße in Metern (Breite entlang der lokalen x-Achse) */
  x: number; z: number; yaw: number;
  w: number; d: number; h: number;
  maxHp: number;
  /** Muss durchbrochen sein, damit die Anlege-Plätze im Burghafen frei werden */
  required: boolean;
  /** Küstenbatterie: feuert auf Schiffe (Reichweite, Schaden je Schuss, Nachladezeit in Sekunden) */
  fire?: { range: number; dmg: number; reload: number };
}

export interface RaidStructureState {
  structureId: string;
  hp: number;
  maxHp: number;
  state: StructureState;
  required: boolean;
}

/** Anlege-Platz: Küstenpunkt der Landungsbuchten (Strand) oder Liegeplatz am Burgsteg (Hafen) */
export interface RaidSlotDef {
  slotId: string;
  zone: SlotZone;
  route: RaidRoute;
  label: string;
  x: number; z: number;
  /** Richtung vom Land zum Meer (Anfahrt), Bogenmaß wie atan2(z, x) */
  approach: number;
}

export interface RaidSlotState extends RaidSlotDef {
  unlocked: boolean;
  /** Teilnehmer (playerId), der den Platz belegt */
  occupiedBy: string | null;
}

/** Massentruppen der Verteidiger: ein Verband ist EINE Entität (instanziert gezeichnet, nicht eine Figur je Soldat) */
export type SquadTypeId = 'schwert' | 'musketier' | 'schlaeger';
export interface RaidSquadDef { squadId: string; typ: SquadTypeId; heads: number; x: number; z: number; yaw: number }
/** Wo ein Hauptmann steht: in den Vierteln der Route B, am Burgtor (Route A) und im Burghof */
export type CaptainPost = DistrictId | 'tor' | 'burg1' | 'burg2';
export interface RaidCaptainSpawn { captainId: string; /** Index in CAPTAINS[macht] (raidBosses.ts) */ index: number; post: CaptainPost; route: RaidRoute | 'both'; x: number; z: number; yaw: number }

export type EnemyKindId = 'matrose' | 'schildtraeger' | 'musketier' | 'schlaeger' | 'fajiwirker' | 'hauptmann' | 'legende';

/** Eine Welle Gegner an Land: erscheint, wenn ein Viertel betreten wird und die vorige Welle fast niedergerungen ist */
export interface RaidWaveDef {
  waveId: string;
  kinds: EnemyKindId[];
  /** Mitte und Streuung der Welle (Inselkoordinaten) */
  x: number; z: number; spread: number;
}

/** Straßensperre: Sperre quer zum Weg mit einer Lücke (Engstelle, Deckung für Gegner) */
export interface RaidBarricadeDef { barricadeId: string; x: number; z: number; yaw: number; w: number }

/** Dachschütze: Musketier auf dem flachen Dach eines Schützenhauses (y = Standhöhe) */
export interface RaidPerchDef { perchId: string; x: number; z: number; yaw: number; w: number; d: number; h: number }

/** Ein Haus im Viertel (Bauart aus world/architecture.ts oder ein Baustein der Macht) */
export interface RaidBuildingDef { t: string; x: number; z: number; yaw: number }

export interface RaidDistrictDef {
  districtId: DistrictId;
  label: string;
  /** Reihenfolge auf Route B (1 … 4) */
  order: number;
  x: number; z: number; radius: number;
  buildings: RaidBuildingDef[];
  barricades: RaidBarricadeDef[];
  perches: RaidPerchDef[];
  waves: RaidWaveDef[];
  /** Dichte Verbände der Verteidiger (Frontlinie der Massencrew) */
  squads: RaidSquadDef[];
}

export interface RaidDistrictState {
  districtId: DistrictId;
  label: string;
  order: number;
  entered: boolean;
  cleared: boolean;
  /** Gegner dieses Viertels insgesamt (Wellen plus Dachschützen) und gefallene */
  total: number;
  fallen: number;
}

/** Ein Schiff der Wachflotte vor der Küste: stark gepanzert, eigene Segel- und Mannschaftswerte */
export interface RaidGuardDef {
  guardId: string;
  tier: number;
  x: number; z: number; heading: number;
  /** Faktoren auf Rumpf, Segel-HP und Mannschaft gegenüber der Schiffsklasse */
  hull: number; sail: number; crew: number;
  name: string;
}

export interface RaidLayout {
  factionId: FactionId;
  seed: number;
  /** Insel: Radius, Küste (bereits zur Seeseite gedreht) und Hügel in Inselkoordinaten, Drehung der Anlage */
  r: number;
  coast: { a: number; f: number; p: number }[];
  hills: { x: number; z: number; r: number; h: number }[];
  rot: number;
  structures: RaidStructureDef[];
  slots: RaidSlotDef[];
  piers: { ax: number; az: number; bx: number; bz: number; hw: number; y: number }[];
  districts: RaidDistrictDef[];
  castle: { x: number; z: number; ringR: number; gateN: { x: number; z: number }; gateE: { x: number; z: number }; keep: { x: number; z: number }; arena: { x: number; z: number; r: number }; waves: RaidWaveDef[]; squads: RaidSquadDef[] };
  /** Torwache an der Burgpforte (Route A): zwei kleine Verbände */
  gateSquads: RaidSquadDef[];
  /** Hauptmänner: 3 bis 4 stark gepanzerte Anführer mit Aura (Route B vier, Route A drei) */
  captains: RaidCaptainSpawn[];
  guard: RaidGuardDef[];
  /** Wege als Linienzug (Inselkoordinaten): Route A vom Burgsteg zum Burgtor, Route B vom Strand durch vier Viertel zur Ostpforte */
  paths: { A: [number, number][]; B: [number, number][] };
  /** Aufstellung der Flotte des Spielers vor der Küste */
  staging: { x: number; z: number; heading: number };
  /** Ort des Seetors (zur Orientierung für Bildschirmhinweise) */
  gate: { x: number; z: number };
}

export type RaidEvent =
  | { type: 'phase'; phase: RaidPhase }
  | { type: 'objective'; objective: RaidObjective }
  | { type: 'structure'; structureId: string; state: StructureState; previous: StructureState; hp: number }
  | { type: 'slots'; zone: SlotZone; unlocked: boolean }
  | { type: 'district'; districtId: DistrictId; what: 'entered' | 'cleared' }
  | { type: 'participant'; playerId: string; what: 'joined' | 'left' | 'down' }
  | { type: 'route'; route: RaidRoute }
  | { type: 'boss'; what: 'appeared' | 'phase'; phase: number; bossId: string }
  | { type: 'end'; outcome: 'victory' | 'retreat' };

export type RaidOutcome = 'victory' | 'retreat';

/** Zustand einer Raid-Sitzung als reine Daten: speicherbar, übertragbar, wiederherstellbar */
export interface RaidSessionState {
  ctx: RaidPartyContext;
  phase: RaidPhase;
  /** Gewählte Route (die erste Landung legt sie fest) */
  route: RaidRoute | null;
  structures: Record<string, RaidStructureState>;
  slots: RaidSlotState[];
  districts: Record<string, RaidDistrictState>;
  fleetTotal: number;
  fleetDown: number;
  /** Wachflotte besiegt: die Landungszonen sind frei */
  landingOpen: boolean;
  breached: boolean;
  keepFallen: boolean;
  startedAt: number;
  endedAt: number | null;
  outcome: RaidOutcome | null;
}

/** Sprechende Zusammenfassung für Anzeige und Prüfung */
export interface RaidSnapshot {
  raidInstanceId: string;
  factionId: FactionId;
  phase: RaidPhase;
  route: RaidRoute | null;
  objectives: RaidObjective[];
  participants: number;
  slotsUnlocked: number;
  breached: boolean;
}

/** Schaden an Bauwerken je Munition: Kugeln brechen Mauern, Ketten und Kartätschen kaum */
export const STRUCTURE_AMMO_MULT: Record<string, number> = { kugel: 1, kette: 0.25, kartaetsche: 0.15, brand: 0.85 };
/** Belagerungs-Zuschlag auf den Kanonenschaden gegen Mauern (Schiffskanonen sind keine Mauerbrecher) */
export const SIEGE_DAMAGE_MULT = 3.2;
