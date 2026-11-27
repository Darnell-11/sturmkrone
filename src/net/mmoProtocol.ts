// Phase 4.8A – MMO-Protokoll: typisierte Pakete zwischen Spiel und Netz (rein: kein DOM, kein three.js).
//
// Das Spiel spricht nie direkt mit einem Netz, sondern schickt **Absichten** (`ClientIntent`) und bekommt **Nachrichten** (`ServerMsg`) zurück:
// Schnappschüsse der Welt im Interessenbereich (`snap`), Gruppen-Ereignisse (`party`), Chat (`chat`), Betrachten, Heilung, Segen, geteilten
// Fortschritt und Hinweise. Dieselben Pakete laufen über den lokalen Shard (`LocalShardMmoTransport`, BroadcastChannel zwischen Tabs) und
// über einen echten WebSocket-Server (`WebSocketMmoTransport`, `VITE_MMO_SERVER_URL`), dessen Logik `MmoAuthority` ist – das Spiel merkt den
// Unterschied nicht. Alles, was von außen kommt, läuft durch `cleanIntent` (Server) bzw. `cleanServerMsg` (Client): fremde Werte werden
// verworfen, Zahlen begrenzt, Texte gesäubert.
import type { DiplomacyState } from '../data/nations';
import type { PartyStance } from './partyRules';
import { PARTY_STANCES } from './partyRules';

export const MMO_PROTOCOL = 1;

/** Zahlen der MMO-Schicht (Interessenbereich, Takte, Gruppen, Chat, Reichweiten) */
export const MMO = {
  /** Interessenbereich (m): an Land / auf See */
  aoiLand: 600, aoiSea: 2400,
  /** Schnappschüsse an jeden Client (Hz), Zustand vom Client (Hz), Gruppen-Werte (Hz) */
  snapshotHz: 18, stateHz: 15, vitalsHz: 4,
  /** Interpolations-Verzug (s, ≈ zwei Schnappschüsse) und Ringpuffer-Länge */
  interpDelay: 0.12, bufferSize: 8,
  /** Gruppengröße und Einladung (s) */
  partyMin: 2, partyMax: 5, inviteTime: 30,
  /** Kriegsausbruch in einer Gruppe: Schutzfrist (s), höchstens bis zum Ende des laufenden Gefechts */
  warGrace: 30, warGraceMax: 120,
  /** Sagen-Reichweite (m) an Land / auf See */
  sayLand: 80, saySea: 350,
  chatMax: 200, chatLog: 120,
  /** Spam-Schutz: höchstens so viele Nachrichten je Fenster (s) */
  chatBurst: 6, chatWindow: 6,
  /** Herzschlag (s), Abbruch ohne Lebenszeichen (s), Wiederverbinden (s) */
  heartbeat: 5, timeout: 15, reconnectMin: 1, reconnectMax: 15,
  /** Heilung und Sturmhorn (m), geteilter Fortschritt (m), Mitfahrt (m), PvP-Schussweite (m) */
  healRange: 40, hornRange: 40, shareLand: 600, shareSea: 2400, rideRange: 160, hitRange: 650,
  /** Taste R antwortet nur auf ein frisches Flüstern (s) */
  replyWindow: 20,
  /** vorab angelegte Figuren und höchstens so viele Mitspieler-Schiffe in 3D */
  rigPool: 8, shipPool: 8,
  /** Figuren werden bis hierhin gezeichnet (m, höchstens die Figuren-Sichtweite der Grafikstufe); Schiffe entstehen in 3D ab `shipShow` und
   *  bleiben bis `shipHide` (wie die übrigen Live-Schiffe der Welt, 1 500 / 1 900 m) – der Interessenbereich (2 400 m) gilt für Netz und Karte */
  rigShow: 160, shipShow: 1500, shipHide: 1900,
  nameMax: 32,
  /** Relay-Server (`npm run mmo-server`): Standard-Port, Lebenszeichen der Startbildschirm-Wächter (s) */
  relayPort: 8787, watchPing: 10,
  /** 4.8B: Spieler gegen Spieler zu Fuß – Reichweite eines Treffers (m, auch Faji-Geschosse) */
  hitRangeLand: 34,
  /** 4.8B: höchstens so viele Steckbriefe je Paket (ein Steckbrief mit Aussehen ist rund 0,8 KB, ein Paket höchstens 64 KB) */
  profilesPerPacket: 24,
  /** 4.8B: Gruppen-Beute – Einsatzgebiet an Land / auf See (m), Würfel-Frist (s), höchstens so viele Würfel-Karten gleichzeitig im Fenster,
   *  höchstens so viele offene Würfel-Sitzungen je Gruppe (darüber bekommt der Finder das Stück) */
  lootLand: 250, lootSea: 1200, rollTime: 30, rollCards: 3, rollMaxPerParty: 12,
  /** 4.9: geteilte Gegner – Schnappschüsse (Hz), höchstens so viele je Shard / je Besitzer, je Paket; Tote bleiben so lange sichtbar (s);
   *  ohne Bericht des Besitzers (s) wandert ein Gegner zum nächsten Spieler (bis `entMigrate` m), ohne Spieler in `entDrop` m verschwindet er */
  entHz: 8, entMax: 400, entPerOwner: 48, entPerPacket: 64, entDeadKeep: 12, entStale: 3, entMigrate: 1500, entDrop: 2600,
  /** 4.91: feste Schlüssel (Lager, Bezirke, Kaiser, Raids) – nach dem Tod sperrt der Shard den Schlüssel so lange (s, normal / Boss), dann
   *  darf ihn der nächste Spieler wieder aufstellen; Kopien von Landgegnern entstehen bis `foeShow` m um den Spieler */
  entRespawn: 300, entRespawnBoss: 900, entRespawnMin: 20, entRespawnMax: 3600, foeShow: 160,
  /** 4.9: Kampf-Aktionen (Darstellung bei den Mitspielern) – höchstens so viele je Sekunde und Absender */
  actPerSec: 12,
} as const;

export type MmoDomain = 'land' | 'sea';
export type ChatChannel = 'sagen' | 'gruppe' | 'fluestern' | 'welt' | 'system';
export const CHAT_CHANNELS: readonly ChatChannel[] = ['sagen', 'gruppe', 'fluestern', 'welt', 'system'];
/** 4.92: `raid` = gemeinsame Belagerung (Startwert und Insel der Instanz an die Gruppe, damit alle dieselbe Festung belagern) */
export type ShareKind = 'kill' | 'sink' | 'merit' | 'raid';

/** Steckbrief eines Spielers (ändert sich selten: Stufe, Team, Ausrüstung) */
export interface PlayerProfile {
  id: string;
  name: string;
  level: number;
  /** Grundklasse und Spezialisierung ('' = noch offen), Rolle („Kombo-DPS“, „DPS/Heal“ …) und Anzeige „Schwertkämpfer · Säbel“ */
  base: string;
  spec: string;
  role: string;
  classLabel: string;
  /** Team (Nation) – '' = ungebunden (vor dem Rat der Gesandten) */
  team: string;
  /** Ausrüstungs-Stufe 1 … 5 und Schiff (Klasse 0 … 6, Name) */
  gearTier: number;
  shipTier: number;
  shipName: string;
  gender: 'm' | 'w';
  /** Startwert der Figur (Platz im Figuren-Pool) */
  look: number;
  /** Stellvertreter des lokalen Shards */
  bot: boolean;
  /** 4.8B: echtes Aussehen der Figur (null = Figur aus dem Pool, z. B. Kapitäne des lokalen Shards) */
  app: AppearanceNet | null;
}

/**
 * 4.8B: Aussehen eines Kapitäns über das Netz – die Felder von `CharacterLook` (data/characterParts.ts), dazu die sichtbare Ausrüstung
 * (`extra`, `dye`) und die Klassen-Waffe (`style` = Darstellungsstil, `blade` = Klingenfarbe). Das Protokoll prüft nur die Form (Kennungen,
 * Farben, Zahlen); welche Werte es gibt, entscheidet der Empfänger mit `sanitizeLook`.
 */
export interface AppearanceNet {
  look: Record<string, string | number | boolean>;
  extra: string[];
  dye: [string, string, string][];
  style: string;
  blade: string;
  glow: boolean;
}

/** Felder von `CharacterLook` mit Auswahl-Kennung, Farbe bzw. Schalter (neue Felder hier ergänzen) */
export const APP_ENUM_KEYS: readonly string[] = ['gender', 'body', 'face', 'eyes', 'brows', 'mouth', 'hair', 'beard', 'outfit', 'shoes', 'coat', 'hat', 'glasses', 'hairModel'];
export const APP_COLOR_KEYS: readonly string[] = ['skin', 'eyeColor', 'hairColor', 'outfitColor', 'accentColor', 'pantsColor', 'shoesColor', 'coatColor', 'hatColor', 'hatAccent'];
export const APP_BOOL_KEYS: readonly string[] = ['scar', 'earring', 'eyepatch', 'scarf', 'gloves'];

// ---------------------------------------------------------------------------------------------------------------
// 4.8B: Gruppen-Beute (Würfel „Bedarf / Gier / Passen“)
// ---------------------------------------------------------------------------------------------------------------

/** Güte eines Beutestücks: Grau/Weiß/Grün werden verteilt, ab Blau wird gewürfelt */
export type LootGrade = 'grau' | 'weiss' | 'gruen' | 'blau' | 'violett' | 'gold' | 'kosmos';
export const LOOT_GRADES: readonly LootGrade[] = ['grau', 'weiss', 'gruen', 'blau', 'violett', 'gold', 'kosmos'];
/** Für wen ein Stück „Bedarf“ ist: alle, Nahkämpfer (Faust und Schwert), nur Schwertkämpfer, Faji-Wirker, Schiff (nach Schiffsstufe) */
export type LootAffinity = 'alle' | 'nahkampf' | 'schwert' | 'faji' | 'schiff';
export const LOOT_AFFINITIES: readonly LootAffinity[] = ['alle', 'nahkampf', 'schwert', 'faji', 'schiff'];
export type LootKindNet = 'gear' | 'trinket' | 'consumable';
export type RollChoice = 'bedarf' | 'gier' | 'passen';
export const ROLL_CHOICES: readonly RollChoice[] = ['bedarf', 'gier', 'passen'];

/** Ein Beutestück über das Netz: Kennung im Spiel (`ref`), Anzeige und alles, was der Shard für Eignung und Ersatz braucht */
export interface LootItemNet {
  /** eindeutig je Fund (Würfel-Sitzung) */
  uid: string;
  /** Kennung in den Spieldaten (Rüstungsteil, Talisman, Gut) */
  ref: string;
  kind: LootKindNet;
  grade: LootGrade;
  name: string;
  /** Platz („Brust“, „Talisman“ …) */
  cat: string;
  aff: LootAffinity;
  /** Schiffsstufe, ab der ein Schiffs-Stück „Bedarf“ ist */
  ship: number;
  /** Goldwert (wer das Stück schon besitzt, bekommt ihn) */
  value: number;
  /** Qualitätsstufe 1 … 5 (Anzeige) */
  tier: number;
}

/** Würfel-Karte für einen Teilnehmer */
export interface RollView {
  id: string;
  item: LootItemNet;
  /** Sekunden bis zum automatischen Passen, Gesamtdauer */
  left: number;
  total: number;
  /** darf dieser Teilnehmer „Bedarf“ wählen? sonst der Grund */
  needOk: boolean;
  needWhy: string;
  /** Finder des Stücks, Zahl der Teilnehmer */
  from: string;
  n: number;
}

/** Zustand eines Spielers (15 Hz vom Client) */
export interface PlayerState {
  x: number; y: number; z: number; yaw: number;
  dom: MmoDomain;
  /** Tempo (m/s) – Gehen/Laufen der Figur bzw. Fahrt des Schiffs */
  spd: number;
  /** Schiff: Kurs, Rumpf (für Spieler gegen Spieler) */
  hdg: number; hull: number; mhull: number;
  hp: number; mhp: number; will: number; mwill: number;
  /** fährt an Bord des Schiffs dieses Spielers mit ('' = nein); Lage relativ zum Deck */
  ride: string; rx: number; ry: number; rz: number;
  /** im Gefecht (verlängert die Schutzfrist bei Kriegsausbruch) */
  combat: boolean;
  /** Ort für das Gruppenfenster („Ankerglück“, „Bernsteinsee“) */
  zone: string;
  /**
   * 4.92: Bereich der Welt ('' = offene Welt, sonst die Kennung einer gemeinsamen Raid-Instanz). Geteilte Gegner gibt der Shard nur an Spieler im
   * selben Bereich weiter, übergibt sie nur an sie und schreibt nur ihnen Abschüsse gut.
   */
  sc: string;
}

/** Eintrag eines Schnappschusses: Zustand plus Kennung und Version des Steckbriefs */
export interface SnapEntry extends PlayerState { id: string; pv: number }

export interface PartyMember { id: string; name: string; level: number; spec: string; role: string; team: string; bot: boolean }
export interface PartyView { id: string; leader: string; members: PartyMember[] }
export interface VitalEntry { id: string; hp: number; mhp: number; will: number; mwill: number; x: number; z: number; dom: MmoDomain; zone: string; ride: string }
export interface ChatMessage { ch: ChatChannel; from: string; name: string; to: string; toName: string; text: string; t: number }

export type PartyEvent =
  | { e: 'invite'; party: string; from: string; name: string; level: number; team: string; left: number }
  | { e: 'sent'; to: string; name: string }
  | { e: 'declined'; by: string; name: string; why: string }
  | { e: 'expired'; party: string; name: string }
  | { e: 'state'; party: PartyView | null }
  | { e: 'warn'; left: number; a: string; b: string; ids: string[]; fight: boolean }
  | { e: 'calm' }
  | { e: 'removed'; why: string };

// ---------------------------------------------------------------------------------------------------------------
// 4.9: geteilte Gegner (WorldEntitySync) und Kampf-Übertragung (CombatActionBroadcast)
// ---------------------------------------------------------------------------------------------------------------

/** Aussehen eines geteilten Schiffs (Farben, Flagge, Galionsfigur, Macht, Ausbaustufen) – jeder sieht dasselbe Schiff */
export interface EntLookNet { hull: string; stripe: string; sail: string; flag: string; flagColor: string; figurehead: string; power: string; evo: [number, number, number] }
/**
 * 4.91: Art eines geteilten Gegners – Schiff (See) oder Kämpfer an Land (Lager, Bezirke, Kommandanten, Bosse, Kaiser, Raids). 4.92: `beast` =
 * Seeungeheuer (Tiefsee-Leviathan): Lage, Leben, Phase und aufgetaucht (`pose` 0 … 1) kommen vom Besitzer
 */
export type EntCat = 'ship' | 'foe' | 'beast';
const catOf = (v: unknown): EntCat => (v === 'foe' ? 'foe' : v === 'beast' ? 'beast' : 'ship');
/**
 * Erscheinen eines geteilten Gegners (vom Client, der ihn erzeugt hat und ihn von da an steuert). 4.91: `cat`, Bodenhöhe `y`, Boss, Maßstab,
 * Sperrzeit nach dem Tod (`respawn` s, 0 = keine); bei Landgegnern ist `role` die Gegnerart. Feste Schlüssel (ohne Kennung des Clients davor)
 * führt der Shard zusammen: wer später dasselbe Lager aufstellt, bekommt den vorhandenen Gegner (und steuert ihn nicht).
 */
export interface EntSpawnNet { key: string; cat: EntCat; tier: number; role: string; level: number; name: string; x: number; z: number; y: number; hdg: number; hp: number; mhp: number; boss: boolean; scale: number; respawn: number; look: EntLookNet; /** 4.92: Bereich ('' = offene Welt, sonst gemeinsame Raid-Instanz) */ scope?: string }
/**
 * Lage und Leben eines geteilten Gegners (Besitzer an den Shard, 8 Hz); `dis` = kampfunfähig (Enterphase). 4.91 für Landgegner: Höhe, Bewegung
 * (`an`: 0 steht, 1 geht, 2 rennt, 3 holt aus, 4 greift an, 5 getroffen/taumelt, 6 liegt, 7 Phasenwechsel), Clip des Angriffs, Haltung 0 … 1,
 * Haltung gebrochen, Boss-Phase 1 … 3
 */
export interface EntStateNet { id: string; x: number; z: number; hdg: number; spd: number; hp: number; mhp: number; dis: boolean; y: number; an: number; clip: string; pose: number; brk: boolean; phase: number }
/** Ein geteilter Gegner im Schnappschuss (Shard an Client): Besitzer, Aussehen, Lage, Leben, Ziel der Aggro-Tabelle, tot */
export interface EntNet extends EntStateNet { owner: string; cat: EntCat; tier: number; role: string; level: number; name: string; look: EntLookNet; aggro: string; dead: boolean; boss: boolean; scale: number; scope?: string }
/** Abschuss eines geteilten Gegners: versenkt bzw. besiegt von `by`, gewürfelt wird beim `finder`, gutgeschrieben allen in `credit` */
export interface EntKillNet { id: string; cat: EntCat; name: string; role: string; level: number; tier: number; x: number; z: number; by: string; byName: string; finder: string; owner: string; credit: string[]; boss: boolean }

/** 4.91: Schlüssel höchstens 48 Zeichen (lange Inselkennungen: Anfang + Prüfsumme) */
/**
 * 4.91: Treffer auf einen Landgegner (Kopie) – was der Besitzer für `Enemy.takeHit` braucht: Haltung, Rückstoß, Hochschleudern, Richtung,
 * Zustand (Brand, Frost …) samt Dauer, schwer, Haltungsbruch-Finisher, Deckung knacken
 */
export interface FoeHitNet { poise: number; knock: number; launch: number; dx: number; dz: number; st: string; sd: number; heavy: boolean; fin: boolean; brk: boolean }

export function cleanFoeHit(raw: unknown): FoeHitNet | null {
  if (!isRec(raw)) return null;
  const dl = Math.hypot(num(raw.dx, 0, -1, 1), num(raw.dz, 0, -1, 1)) || 1;
  return {
    poise: num(raw.poise, 0, 0, 500), knock: num(raw.knock, 0, 0, 40), launch: num(raw.launch, 0, 0, 30), dx: num(raw.dx, 0, -1, 1) / dl, dz: num(raw.dz, 0, -1, 1) / dl,
    st: typeof raw.st === 'string' && /^[a-z]{0,12}$/.test(raw.st) ? raw.st : '', sd: num(raw.sd, 0, 0, 20), heavy: bool(raw.heavy), fin: bool(raw.fin), brk: bool(raw.brk),
  };
}

export function netKey(s: string): string {
  // 4.92: nur Zeichen, die `cleanId` durchlässt (vorher trennte „~“ die Prüfsumme ab – der Shard verwarf solche Schlüssel still)
  const safe = s.replace(/[^\w:.-]/g, '_');
  if (safe.length <= 48) return safe;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${safe.slice(0, 36)}.${(h >>> 0).toString(36)}`;
}
/** 4.91: fester Schlüssel (gleich für alle Spieler) oder Schlüssel eines Clients (`<Spieler-Kennung>.<Zähler>`, nie zusammengeführt) */
export const isWorldKey = (key: string): boolean => /^(isl|mega|kaiser|raid|evt|wb):/.test(key);

/** Kampf-Aktionen, die die Mitspieler sehen (Schaden läuft getrennt über Treffer-Pakete) */
export type ActKind = 'broadside' | 'bow' | 'swing' | 'art' | 'geist' | 'heal' | 'ult' | 'tele' | 'bau';
export const ACT_KINDS: readonly ActKind[] = ['broadside', 'bow', 'swing', 'art', 'geist', 'heal', 'ult', 'tele', 'bau'];
/** 4.92 `bau` (Bauwerk einer gemeinsamen Belagerung): `el` = Kennung des Bauwerks (Seetor, Mauerflügel, Turm, Batterie), `tx` = Lebensanteil 0 … 1;
 *  4.92 `tele` mit `slot` 9 = Tentakel-Schlag des Leviathans (Warnring am Ort) */
/** 4.91 `tele` (Warnfläche eines Boss-Angriffs): `slot` = Form (1 Kreis, 2 Kegel, 3 Linie, 4 Ring), `tx` = Reichweite (m), `ty` = Breite bzw.
 *  Öffnung, `n` = Vorwarnzeit in Zehntelsekunden; Ort und Richtung wie sonst */
/**
 * Eine Kampf-Aktion zur Darstellung: Ort und Blickrichtung des Auslösers, Ziel (`tx/ty/tz`), Seite und Zahl der Kanonen (Breitseite), Stil
 * und Element (Formen, Geistes-Faji, Ultimates), Platz (Form 1 – 10, Geist 1 – 4), auf See oder an Land; `ent` = Kennung eines geteilten
 * Gegners, der feuert ('' = der Absender selbst)
 */
export interface ActNet { t: ActKind; ent: string; x: number; y: number; z: number; yaw: number; side: number; n: number; style: string; el: string; slot: number; tx: number; ty: number; tz: number; sea: boolean }

export interface HelloIntent { k: 'hello'; v: number; profile: PlayerProfile; state: PlayerState }

export type ClientIntent =
  | HelloIntent
  | { k: 'state'; s: PlayerState }
  | { k: 'profile'; profile: PlayerProfile }
  | { k: 'chat'; ch: Exclude<ChatChannel, 'system'>; text: string; to: string }
  | { k: 'invite'; to: string }
  | { k: 'reply'; party: string; accept: boolean }
  | { k: 'leave' }
  | { k: 'kick'; id: string }
  | { k: 'promote'; id: string }
  | { k: 'inspect'; id: string }
  | { k: 'heal'; to: string; frac: number }
  | { k: 'horn'; x: number; z: number; heal: number; will: number }
  | { k: 'share'; what: ShareKind; ref: string; amount: number; x: number; z: number }
  | { k: 'ride'; ship: string; rx: number; ry: number; rz: number }
  | { k: 'unride' }
  /** Treffer gegen einen Mitspieler; `land` = zu Fuß (4.8B), sonst Kanonen auf See */
  | { k: 'hit'; to: string; dmg: number; land: boolean }
  | { k: 'ping'; t: number }
  | { k: 'bye' }
  /** Startbildschirm: nur die Zahl der Kapitäne hören (Kennung des Tabs, ohne Figur in der Welt) */
  | { k: 'watch'; id: string }
  /** Relay-Server: Diplomatie der Welt-KI dieses Clients (der am längsten verbundene Kapitän gilt) */
  | { k: 'diplo'; pairs: DiploPair[] }
  /** 4.8B: Beute in der Gruppe – Gold und Ruf werden geteilt, gewöhnliche Stücke reihum, ab Blau gewürfelt */
  | { k: 'loot'; gold: number; rep: number; power: string; items: LootItemNet[] }
  /** 4.8B: Wahl in einer Würfel-Sitzung */
  | { k: 'roll'; id: string; choice: RollChoice }
  /** 4.9: einen selbst erzeugten Gegner teilen (der Shard vergibt die Kennung, der Absender steuert ihn) */
  | { k: 'eclaim'; e: EntSpawnNet }
  /** 4.9: Lage und Leben der eigenen geteilten Gegner */
  | { k: 'estate'; list: EntStateNet[] }
  /** 4.9: Treffer auf einen geteilten Gegner; `applied` = beim Besitzer schon verrechnet (nur Bedrohung zählen) */
  | { k: 'ehit'; id: string; dmg: number; ammo: string; zone: 'hull' | 'sail'; pen: number; applied: boolean; foe?: FoeHitNet }
  /** 4.9: eigener geteilter Gegner ist untergegangen; `by` = wer zuletzt traf */
  | { k: 'edead'; id: string; by: string }
  /** 4.9: eigener geteilter Gegner wird hier nicht mehr gesteuert (zu weit weg) – der Shard übergibt ihn */
  | { k: 'erelease'; id: string }
  /** 4.9: ein eigener geteilter Gegner trifft das Schiff eines Mitspielers */
  | { k: 'ephit'; id: string; to: string; dmg: number; pen: number }
  /** 4.9: Kampf-Aktion zur Darstellung bei den Mitspielern */
  | { k: 'act'; a: ActNet };

/** Haltung zweier Nationen nach der Welt-KI eines Clients */
export interface DiploPair { a: string; b: string; s: DiplomacyState }

export interface InspectInfo { profile: PlayerProfile; stance: PartyStance; zone: string; dist: number; party: boolean }

export type ServerMsg =
  | { k: 'welcome'; id: string; shard: string; t: number }
  | { k: 'snap'; t: number; seq: number; list: SnapEntry[] }
  | { k: 'profiles'; list: (PlayerProfile & { pv: number })[] }
  | { k: 'gone'; id: string }
  | { k: 'party'; ev: PartyEvent }
  | { k: 'vitals'; list: VitalEntry[] }
  | { k: 'chat'; msg: ChatMessage }
  | { k: 'inspect'; info: InspectInfo }
  | { k: 'heal'; from: string; name: string; frac: number }
  | { k: 'horn'; from: string; name: string; heal: number; will: number }
  | { k: 'share'; from: string; name: string; what: ShareKind; ref: string; amount: number }
  | { k: 'hit'; from: string; name: string; dmg: number; land: boolean }
  | { k: 'ride'; ok: boolean; ship: string; text: string }
  | { k: 'notice'; text: string; tone: 'info' | 'warn' | 'error' }
  | { k: 'pong'; t: number; st: number }
  /** Zahl der verbundenen Kapitäne (Startbildschirm und Spiel); `world` = davon in der geteilten See */
  | { k: 'online'; n: number; world: number; shard: string }
  /** 4.8B: eigener Anteil an Gold und Ruf eines Gruppen-Funds (n = Zahl der Empfänger) */
  | { k: 'lootShare'; from: string; name: string; gold: number; rep: number; power: string; n: number }
  /** 4.8B: ein Stück wandert ins Inventar (reihum, gewonnen, allein, alle haben gepasst) */
  | { k: 'lootGet'; item: LootItemNet; how: 'reihum' | 'wurf' | 'allein' | 'verzicht'; from: string; name: string }
  /** 4.8B: neue Würfel-Sitzung, Ende einer Sitzung */
  | { k: 'rollStart'; roll: RollView }
  | { k: 'rollEnd'; id: string; winner: string; name: string; choice: RollChoice | ''; text: string }
  /** 4.9: Kennung eines geteilten Gegners (Antwort auf eclaim) */
  | { k: 'eclaimed'; key: string; id: string; owner: string }
  /** 4.91: fester Schlüssel noch gesperrt (Lager geräumt, Boss besiegt): `wait` s bis zur Wiederkehr – der Client stellt ihn nicht auf */
  | { k: 'edenied'; key: string; wait: number }
  /** 4.9: geteilte Gegner im Interessenbereich */
  | { k: 'ents'; t: number; list: EntNet[] }
  /** 4.9: Treffer eines Mitspielers auf einen eigenen geteilten Gegner (hier verrechnen) */
  | { k: 'ehit'; id: string; from: string; dmg: number; ammo: string; zone: 'hull' | 'sail'; pen: number; foe?: FoeHitNet }
  /** 4.9: Abschuss mit Gutschrift (an alle, die etwas davon haben) */
  | { k: 'ekill'; kill: EntKillNet }
  /** 4.9: du steuerst ab jetzt diesen Gegner (der bisherige Besitzer ist fort) */
  | { k: 'eown'; e: EntNet }
  /** 4.9: geteilter Gegner ist verschwunden */
  | { k: 'egone'; id: string }
  /** 4.9: ein geteilter Gegner trifft dein Schiff */
  | { k: 'ehitme'; id: string; name: string; dmg: number; pen: number }
  /** 4.9: Kampf-Aktion eines Mitspielers (bzw. seines Gegners) zur Darstellung */
  | { k: 'act'; from: string; a: ActNet };

// ---------------------------------------------------------------------------------------------------------------
// Interessenbereich und Reichweiten
// ---------------------------------------------------------------------------------------------------------------

/** Sichtweite zwischen zwei Spielern: Schiffe (oder ein Betrachter auf See) bis 2 400 m, Figuren an Land bis 600 m */
export const aoiRadius = (viewer: MmoDomain, other: MmoDomain): number => (viewer === 'sea' || other === 'sea' ? MMO.aoiSea : MMO.aoiLand);
/** Sagen-Reichweite nach dem Ort des Sprechers */
export const sayRadius = (dom: MmoDomain): number => (dom === 'sea' ? MMO.saySea : MMO.sayLand);
/** Reichweite des geteilten Fortschritts */
export const shareRadius = (dom: MmoDomain): number => (dom === 'sea' ? MMO.shareSea : MMO.shareLand);

// ---------------------------------------------------------------------------------------------------------------
// Neue, leere Werte
// ---------------------------------------------------------------------------------------------------------------

export function newPlayerState(): PlayerState {
  return { x: 0, y: 0, z: 0, yaw: 0, dom: 'land', spd: 0, hdg: 0, hull: 0, mhull: 0, hp: 1, mhp: 1, will: 0, mwill: 100, ride: '', rx: 0, ry: 0, rz: 0, combat: false, zone: '', sc: '' };
}

export function newProfile(id = ''): PlayerProfile {
  return { id, name: 'Kapitän', level: 1, base: '', spec: '', role: '', classLabel: '', team: '', gearTier: 1, shipTier: 0, shipName: '', gender: 'm', look: 0, bot: false, app: null };
}

export function copyState(src: PlayerState, dst: PlayerState): PlayerState {
  dst.x = src.x; dst.y = src.y; dst.z = src.z; dst.yaw = src.yaw; dst.dom = src.dom; dst.spd = src.spd;
  dst.hdg = src.hdg; dst.hull = src.hull; dst.mhull = src.mhull; dst.hp = src.hp; dst.mhp = src.mhp; dst.will = src.will; dst.mwill = src.mwill;
  dst.ride = src.ride; dst.rx = src.rx; dst.ry = src.ry; dst.rz = src.rz; dst.combat = src.combat; dst.zone = src.zone; dst.sc = src.sc ?? '';
  return dst;
}

// ---------------------------------------------------------------------------------------------------------------
// Säubern (alles, was über ein Netz kommt)
// ---------------------------------------------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const str = (v: unknown, max: number, d = ''): string => (typeof v === 'string' ? v.slice(0, max) : d);
const bool = (v: unknown): boolean => v === true;
const W = 40000;

/** Text für den Chat säubern: Steuerzeichen raus, Leerraum zusammenfassen, Länge begrenzen */
export function cleanText(v: unknown, max: number = MMO.chatMax): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Kennung (Spieler, Gruppe): kurze, harmlose Zeichenkette */
export function cleanId(v: unknown): string {
  return typeof v === 'string' && /^[\w:.-]{1,48}$/.test(v) ? v : '';
}

export function cleanProfile(raw: unknown): PlayerProfile | null {
  if (!isRec(raw)) return null;
  const id = cleanId(raw.id);
  if (!id) return null;
  return {
    id,
    name: cleanText(raw.name, MMO.nameMax) || 'Kapitän',
    level: Math.round(num(raw.level, 1, 1, 101)),
    base: str(raw.base, 12), spec: str(raw.spec, 16), role: str(raw.role, 20), classLabel: cleanText(raw.classLabel, 48),
    team: str(raw.team, 16),
    gearTier: Math.round(num(raw.gearTier, 1, 1, 6)),
    shipTier: Math.round(num(raw.shipTier, 0, 0, 6)),
    shipName: cleanText(raw.shipName, 32),
    gender: raw.gender === 'w' ? 'w' : 'm',
    look: Math.round(num(raw.look, 0, 0, 2 ** 31)),
    bot: bool(raw.bot),
    app: cleanAppearance(raw.app),
  };
}

const ENUM_RE = /^[a-z0-9_]{1,40}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ITEM_RE = /^[a-z0-9_]{1,48}$/;

/** 4.8B: Aussehen säubern (nur bekannte Felder, Kennungen, Farben, Zahlen); null = keins */
export function cleanAppearance(raw: unknown): AppearanceNet | null {
  if (!isRec(raw) || !isRec(raw.look)) return null;
  const src = raw.look, look: Record<string, string | number | boolean> = {};
  for (const k of APP_ENUM_KEYS) { const v = src[k]; if (typeof v === 'string' && ENUM_RE.test(v)) look[k] = v; }
  for (const k of APP_COLOR_KEYS) { const v = src[k]; if (typeof v === 'string' && COLOR_RE.test(v)) look[k] = v.toLowerCase(); }
  for (const k of APP_BOOL_KEYS) if (typeof src[k] === 'boolean') look[k] = src[k] as boolean;
  if (typeof src.height === 'number' && Number.isFinite(src.height)) look.height = Math.min(1.1, Math.max(0.9, src.height));
  const extra = Array.isArray(raw.extra) ? raw.extra.filter((e): e is string => typeof e === 'string' && ITEM_RE.test(e)).slice(0, 16) : [];
  const dye: [string, string, string][] = [];
  if (Array.isArray(raw.dye)) for (const d of raw.dye.slice(0, 16)) {
    if (Array.isArray(d) && typeof d[0] === 'string' && ITEM_RE.test(d[0]) && typeof d[1] === 'string' && COLOR_RE.test(d[1]) && typeof d[2] === 'string' && COLOR_RE.test(d[2])) dye.push([d[0], d[1].toLowerCase(), d[2].toLowerCase()]);
  }
  return {
    look, extra, dye,
    style: typeof raw.style === 'string' && ENUM_RE.test(raw.style) ? raw.style : '',
    blade: typeof raw.blade === 'string' && COLOR_RE.test(raw.blade) ? raw.blade.toLowerCase() : '#c9d2da',
    glow: bool(raw.glow),
  };
}

/** 4.8B: Beutestück säubern; null = verwerfen */
export function cleanLootItem(raw: unknown): LootItemNet | null {
  if (!isRec(raw)) return null;
  const uid = cleanId(raw.uid), ref = typeof raw.ref === 'string' && ITEM_RE.test(raw.ref) ? raw.ref : '';
  if (!uid || !ref) return null;
  const kind = raw.kind === 'gear' || raw.kind === 'trinket' || raw.kind === 'consumable' ? raw.kind : null;
  const grade = LOOT_GRADES.includes(raw.grade as LootGrade) ? (raw.grade as LootGrade) : null;
  if (!kind || !grade) return null;
  return {
    uid, ref, kind, grade,
    name: cleanText(raw.name, 48) || 'Beutestück',
    cat: cleanText(raw.cat, 24),
    aff: LOOT_AFFINITIES.includes(raw.aff as LootAffinity) ? (raw.aff as LootAffinity) : 'alle',
    ship: Math.round(num(raw.ship, 0, 0, 6)),
    value: Math.round(num(raw.value, 0, 0, 1e6)),
    tier: Math.round(num(raw.tier, 1, 1, 6)),
  };
}

function cleanRollView(raw: unknown): RollView | null {
  if (!isRec(raw)) return null;
  const id = cleanId(raw.id), item = cleanLootItem(raw.item);
  if (!id || !item) return null;
  const total = num(raw.total, 30, 1, 120);
  return { id, item, total, left: num(raw.left, total, 0, total), needOk: bool(raw.needOk), needWhy: cleanText(raw.needWhy, 80), from: cleanText(raw.from, MMO.nameMax), n: Math.round(num(raw.n, 1, 1, MMO.partyMax)) };
}

export function cleanState(raw: unknown, out: PlayerState = newPlayerState()): PlayerState | null {
  if (!isRec(raw)) return null;
  out.x = num(raw.x, 0, -W, W); out.y = num(raw.y, 0, -200, 400); out.z = num(raw.z, 0, -W, W);
  out.yaw = num(raw.yaw, 0, -100, 100); out.dom = raw.dom === 'sea' ? 'sea' : 'land'; out.spd = num(raw.spd, 0, 0, 80);
  out.hdg = num(raw.hdg, 0, -100, 100); out.hull = num(raw.hull, 0, 0, 1e6); out.mhull = num(raw.mhull, 0, 0, 1e6);
  out.mhp = num(raw.mhp, 1, 1, 1e7); out.hp = num(raw.hp, out.mhp, 0, out.mhp); out.mwill = num(raw.mwill, 100, 1, 1000); out.will = num(raw.will, 0, 0, out.mwill);
  out.ride = cleanId(raw.ride); out.rx = num(raw.rx, 0, -40, 40); out.ry = num(raw.ry, 0, -10, 20); out.rz = num(raw.rz, 0, -40, 40);
  out.combat = bool(raw.combat); out.zone = cleanText(raw.zone, 40); out.sc = cleanId(raw.sc);
  return out;
}

const SEND_CH: readonly string[] = ['sagen', 'gruppe', 'fluestern', 'welt'];
const DIPLO_STATES: readonly string[] = ['allianz', 'handelspakt', 'neutral', 'rivalitaet', 'krieg'];
const TEAM_RE = /^[a-z]{2,16}$/;

/** Diplomatie-Paare prüfen: nur Kleinbuchstaben-Kennungen, bekannte Zustände, höchstens 32 Paare */
export function cleanDiploPairs(raw: unknown): DiploPair[] {
  if (!Array.isArray(raw)) return [];
  const out: DiploPair[] = [];
  for (const e of raw.slice(0, 32)) {
    if (!isRec(e) || typeof e.a !== 'string' || typeof e.b !== 'string' || !TEAM_RE.test(e.a) || !TEAM_RE.test(e.b) || e.a === e.b) continue;
    if (!DIPLO_STATES.includes(e.s as string)) continue;
    out.push({ a: e.a, b: e.b, s: e.s as DiplomacyState });
  }
  return out;
}
const SHARES: readonly string[] = ['kill', 'sink', 'merit', 'raid'];
const POWER_RE = /^[a-z]{0,16}$/;
const ROLE_RE = /^[a-z_]{0,16}$/;
const AMMO_RE = /^[a-z]{1,12}$/;

/** 4.9: Aussehen eines geteilten Schiffs säubern */
export function cleanEntLook(raw: unknown): EntLookNet {
  const r = isRec(raw) ? raw : {};
  const col = (v: unknown, d: string) => (typeof v === 'string' && COLOR_RE.test(v) ? v.toLowerCase() : d);
  const id = (v: unknown, d: string) => (typeof v === 'string' && ENUM_RE.test(v) ? v : d);
  const evo = Array.isArray(r.evo) ? r.evo : [];
  const tier = (v: unknown) => Math.round(num(v, 3, 1, 5));
  return {
    hull: col(r.hull, '#4a3426'), stripe: col(r.stripe, '#a8322a'), sail: col(r.sail, '#efe6d2'), flag: id(r.flag, 'totenkopf'), flagColor: col(r.flagColor, '#1e1a20'),
    figurehead: id(r.figurehead, 'keine'), power: typeof r.power === 'string' && POWER_RE.test(r.power) ? r.power : '', evo: [tier(evo[0]), tier(evo[1]), tier(evo[2])],
  };
}

/** 4.9: Lage und Leben eines geteilten Gegners säubern (`out` wird überschrieben); null = verwerfen */
export function cleanEntState(raw: unknown, out?: EntStateNet): EntStateNet | null {
  if (!isRec(raw)) return null;
  const id = cleanId(raw.id);
  if (!id) return null;
  const mhp = num(raw.mhp, 1, 1, 1e7);
  const o = out ?? { id: '', x: 0, z: 0, hdg: 0, spd: 0, hp: 0, mhp: 1, dis: false, y: 0, an: 0, clip: '', pose: 1, brk: false, phase: 1 };
  o.id = id; o.x = num(raw.x, 0, -W, W); o.z = num(raw.z, 0, -W, W); o.hdg = num(raw.hdg, 0, -100, 100); o.spd = num(raw.spd, 0, 0, 80);
  o.mhp = mhp; o.hp = num(raw.hp, mhp, 0, mhp); o.dis = bool(raw.dis);
  // 4.91: Landgegner (Höhe, Bewegung, Angriffs-Clip, Haltung, Bruch, Phase)
  o.y = num(raw.y, 0, -200, 600); o.an = Math.round(num(raw.an, 0, 0, 9)); o.clip = typeof raw.clip === 'string' && CLIP_RE.test(raw.clip) ? raw.clip : '';
  o.pose = num(raw.pose, 1, 0, 1); o.brk = bool(raw.brk); o.phase = Math.round(num(raw.phase, 1, 1, 3));
  return o;
}
const CLIP_RE = /^[A-Za-z0-9_]{0,40}$/;

/** 4.9: Erscheinen eines geteilten Gegners säubern */
export function cleanEntSpawn(raw: unknown): EntSpawnNet | null {
  if (!isRec(raw)) return null;
  const key = cleanId(raw.key);
  if (!key) return null;
  const mhp = num(raw.mhp, 1, 1, 1e7);
  const cat = catOf(raw.cat);
  const rs = num(raw.respawn, 0, 0, MMO.entRespawnMax);
  return {
    key, cat, tier: Math.round(num(raw.tier, 0, 0, 6)), role: typeof raw.role === 'string' && ROLE_RE.test(raw.role) ? raw.role : 'patrouille', level: Math.round(num(raw.level, 1, 1, 101)),
    name: cleanText(raw.name, 48) || (cat === 'foe' ? 'Gegner' : 'Kriegsschiff'), x: num(raw.x, 0, -W, W), z: num(raw.z, 0, -W, W), y: num(raw.y, 0, -200, 600), hdg: num(raw.hdg, 0, -100, 100),
    mhp, hp: num(raw.hp, mhp, 0, mhp), boss: bool(raw.boss), scale: num(raw.scale, 1, 0.3, 4), respawn: rs > 0 ? Math.max(MMO.entRespawnMin, rs) : 0, look: cleanEntLook(raw.look),
    scope: cleanId(raw.scope),
  };
}

/** 4.9: geteilter Gegner im Schnappschuss säubern */
export function cleanEnt(raw: unknown): EntNet | null {
  const st = cleanEntState(raw);
  if (!st || !isRec(raw)) return null;
  const cat = catOf(raw.cat);
  return Object.assign(st, {
    owner: cleanId(raw.owner), cat, tier: Math.round(num(raw.tier, 0, 0, 6)), role: typeof raw.role === 'string' && ROLE_RE.test(raw.role) ? raw.role : 'patrouille',
    level: Math.round(num(raw.level, 1, 1, 101)), name: cleanText(raw.name, 48) || (cat === 'foe' ? 'Gegner' : 'Kriegsschiff'), look: cleanEntLook(raw.look), aggro: cleanId(raw.aggro), dead: bool(raw.dead),
    boss: bool(raw.boss), scale: num(raw.scale, 1, 0.3, 4), scope: cleanId(raw.scope),
  });
}

/** 4.9: Kampf-Aktion säubern; null = verwerfen */
export function cleanAct(raw: unknown): ActNet | null {
  if (!isRec(raw) || !ACT_KINDS.includes(raw.t as ActKind)) return null;
  return {
    t: raw.t as ActKind, ent: cleanId(raw.ent), x: num(raw.x, 0, -W, W), y: num(raw.y, 0, -200, 400), z: num(raw.z, 0, -W, W), yaw: num(raw.yaw, 0, -100, 100),
    side: raw.side === -1 || raw.side === 1 ? raw.side : 0, n: Math.round(num(raw.n, 1, 0, 48)),
    style: typeof raw.style === 'string' && ENUM_RE.test(raw.style) ? raw.style : '', el: typeof raw.el === 'string' && ENUM_RE.test(raw.el) ? raw.el : '',
    slot: Math.round(num(raw.slot, 0, 0, 16)), tx: num(raw.tx, 0, -W, W), ty: num(raw.ty, 0, -200, 400), tz: num(raw.tz, 0, -W, W), sea: bool(raw.sea),
  };
}

/** 4.9: Abschuss säubern */
function cleanKill(raw: unknown): EntKillNet | null {
  if (!isRec(raw)) return null;
  const id = cleanId(raw.id);
  if (!id) return null;
  return {
    id, cat: catOf(raw.cat), name: cleanText(raw.name, 48) || 'Kriegsschiff', role: typeof raw.role === 'string' && ROLE_RE.test(raw.role) ? raw.role : 'patrouille', level: Math.round(num(raw.level, 1, 1, 101)),
    tier: Math.round(num(raw.tier, 0, 0, 6)), x: num(raw.x, 0, -W, W), z: num(raw.z, 0, -W, W), by: cleanId(raw.by), byName: cleanText(raw.byName, MMO.nameMax), finder: cleanId(raw.finder),
    owner: cleanId(raw.owner), credit: Array.isArray(raw.credit) ? raw.credit.map(cleanId).filter(Boolean).slice(0, 32) : [], boss: bool(raw.boss),
  };
}

/** Absicht eines Clients prüfen (Server-Seite); null = verwerfen */
export function cleanIntent(raw: unknown): ClientIntent | null {
  if (!isRec(raw) || typeof raw.k !== 'string') return null;
  switch (raw.k) {
    case 'hello': {
      const profile = cleanProfile(raw.profile), state = cleanState(raw.state);
      return profile && state ? { k: 'hello', v: Math.round(num(raw.v, 0, 0, 1e6)), profile, state } : null;
    }
    case 'state': { const s = cleanState(raw.s); return s ? { k: 'state', s } : null; }
    case 'profile': { const p = cleanProfile(raw.profile); return p ? { k: 'profile', profile: p } : null; }
    case 'chat': {
      if (!SEND_CH.includes(raw.ch as string)) return null;
      const text = cleanText(raw.text);
      return text ? { k: 'chat', ch: raw.ch as Exclude<ChatChannel, 'system'>, text, to: cleanText(raw.to, MMO.nameMax + 16) } : null;
    }
    case 'invite': { const to = cleanText(raw.to, MMO.nameMax + 16); return to ? { k: 'invite', to } : null; }
    case 'reply': { const party = cleanId(raw.party); return party ? { k: 'reply', party, accept: bool(raw.accept) } : null; }
    case 'leave': return { k: 'leave' };
    case 'kick': case 'promote': case 'inspect': { const id = cleanId(raw.id); return id ? { k: raw.k, id } : null; }
    case 'heal': { const to = cleanId(raw.to); return to ? { k: 'heal', to, frac: num(raw.frac, 0, 0, 0.6) } : null; }
    case 'horn': return { k: 'horn', x: num(raw.x, 0, -W, W), z: num(raw.z, 0, -W, W), heal: num(raw.heal, 0, 0, 0.5), will: num(raw.will, 0, 0, 100) };
    case 'share': return SHARES.includes(raw.what as string)
      ? { k: 'share', what: raw.what as ShareKind, ref: cleanText(raw.ref, 32), amount: num(raw.amount, 1, 0, 1000), x: num(raw.x, 0, -W, W), z: num(raw.z, 0, -W, W) } : null;
    case 'ride': { const ship = cleanId(raw.ship); return ship ? { k: 'ride', ship, rx: num(raw.rx, 0, -40, 40), ry: num(raw.ry, 0, -10, 20), rz: num(raw.rz, 0, -40, 40) } : null; }
    case 'unride': return { k: 'unride' };
    case 'hit': { const to = cleanId(raw.to); return to ? { k: 'hit', to, dmg: num(raw.dmg, 0, 0, 5000), land: bool(raw.land) } : null; }
    case 'ping': return { k: 'ping', t: num(raw.t, 0, 0, 1e13) };
    case 'bye': return { k: 'bye' };
    case 'watch': { const id = cleanId(raw.id); return id ? { k: 'watch', id } : null; }
    case 'diplo': return { k: 'diplo', pairs: cleanDiploPairs(raw.pairs) };
    case 'loot': {
      const items = Array.isArray(raw.items) ? raw.items.slice(0, 8).map(cleanLootItem).filter((x): x is LootItemNet => !!x) : [];
      const gold = Math.round(num(raw.gold, 0, 0, 1e6)), rep = Math.round(num(raw.rep, 0, -100, 100));
      const power = typeof raw.power === 'string' && /^[a-z]{0,16}$/.test(raw.power) ? raw.power : '';
      return gold > 0 || rep !== 0 || items.length ? { k: 'loot', gold, rep, power, items } : null;
    }
    case 'roll': { const id = cleanId(raw.id); return id && ROLL_CHOICES.includes(raw.choice as RollChoice) ? { k: 'roll', id, choice: raw.choice as RollChoice } : null; }
    case 'eclaim': { const e = cleanEntSpawn(raw.e); return e ? { k: 'eclaim', e } : null; }
    case 'estate': {
      if (!Array.isArray(raw.list)) return null;
      const list: EntStateNet[] = [];
      for (const e of raw.list.slice(0, MMO.entPerOwner * 2)) { const st = cleanEntState(e); if (st) list.push(st); }
      return { k: 'estate', list };
    }
    case 'ehit': {
      const id = cleanId(raw.id);
      if (!id) return null;
      const foe = raw.foe === undefined ? null : cleanFoeHit(raw.foe);
      return { k: 'ehit', id, dmg: num(raw.dmg, 0, 0, 1e6), ammo: typeof raw.ammo === 'string' && AMMO_RE.test(raw.ammo) ? raw.ammo : 'kugel', zone: raw.zone === 'sail' ? 'sail' : 'hull', pen: num(raw.pen, 1, 0, 12), applied: bool(raw.applied), ...(foe ? { foe } : {}) };
    }
    case 'edead': { const id = cleanId(raw.id); return id ? { k: 'edead', id, by: cleanId(raw.by) } : null; }
    case 'erelease': { const id = cleanId(raw.id); return id ? { k: 'erelease', id } : null; }
    case 'ephit': { const id = cleanId(raw.id), to = cleanId(raw.to); return id && to ? { k: 'ephit', id, to, dmg: num(raw.dmg, 0, 0, 1e5), pen: num(raw.pen, 1, 0, 12) } : null; }
    case 'act': { const a = cleanAct(raw.a); return a ? { k: 'act', a } : null; }
    default: return null;
  }
}

const cleanMember = (r: unknown): PartyMember | null => {
  if (!isRec(r)) return null;
  const id = cleanId(r.id);
  return id ? { id, name: cleanText(r.name, MMO.nameMax) || 'Kapitän', level: Math.round(num(r.level, 1, 1, 101)), spec: str(r.spec, 16), role: str(r.role, 20), team: str(r.team, 16), bot: bool(r.bot) } : null;
};

function cleanPartyEvent(r: unknown): PartyEvent | null {
  if (!isRec(r)) return null;
  switch (r.e) {
    case 'invite': { const party = cleanId(r.party), from = cleanId(r.from); return party && from ? { e: 'invite', party, from, name: cleanText(r.name, MMO.nameMax), level: Math.round(num(r.level, 1, 1, 101)), team: str(r.team, 16), left: num(r.left, MMO.inviteTime, 0, 120) } : null; }
    case 'sent': return { e: 'sent', to: cleanId(r.to), name: cleanText(r.name, MMO.nameMax) };
    case 'declined': return { e: 'declined', by: cleanId(r.by), name: cleanText(r.name, MMO.nameMax), why: cleanText(r.why, 120) };
    case 'expired': return { e: 'expired', party: cleanId(r.party), name: cleanText(r.name, MMO.nameMax) };
    case 'state': {
      if (r.party === null) return { e: 'state', party: null };
      const p = r.party;
      if (!isRec(p) || !Array.isArray(p.members)) return null;
      const members = p.members.slice(0, MMO.partyMax).map(cleanMember).filter((m): m is PartyMember => !!m);
      const id = cleanId(p.id), leader = cleanId(p.leader);
      return id && leader ? { e: 'state', party: { id, leader, members } } : null;
    }
    case 'warn': return { e: 'warn', left: num(r.left, 0, 0, 600), a: str(r.a, 16), b: str(r.b, 16), ids: Array.isArray(r.ids) ? r.ids.map(cleanId).filter(Boolean).slice(0, MMO.partyMax) : [], fight: bool(r.fight) };
    case 'calm': return { e: 'calm' };
    case 'removed': return { e: 'removed', why: cleanText(r.why, 160) };
    default: return null;
  }
}

/** Nachricht des Servers prüfen (Client-Seite); null = verwerfen */
export function cleanServerMsg(raw: unknown): ServerMsg | null {
  if (!isRec(raw) || typeof raw.k !== 'string') return null;
  switch (raw.k) {
    case 'welcome': { const id = cleanId(raw.id); return id ? { k: 'welcome', id, shard: cleanText(raw.shard, 40), t: num(raw.t, 0, 0, 1e13) } : null; }
    case 'snap': {
      if (!Array.isArray(raw.list)) return null;
      const list: SnapEntry[] = [];
      for (const e of raw.list.slice(0, 256)) {
        if (!isRec(e)) continue;
        const id = cleanId(e.id);
        if (!id) continue;
        const s = cleanState(e);
        if (s) list.push(Object.assign(s, { id, pv: Math.round(num(e.pv, 0, 0, 1e9)) }));
      }
      return { k: 'snap', t: num(raw.t, 0, 0, 1e13), seq: Math.round(num(raw.seq, 0, 0, 1e12)), list };
    }
    case 'profiles': {
      if (!Array.isArray(raw.list)) return null;
      const list: (PlayerProfile & { pv: number })[] = [];
      for (const e of raw.list.slice(0, 256)) { const p = cleanProfile(e); if (p) list.push(Object.assign(p, { pv: Math.round(num((e as Rec).pv, 0, 0, 1e9)) })); }
      return { k: 'profiles', list };
    }
    case 'gone': { const id = cleanId(raw.id); return id ? { k: 'gone', id } : null; }
    case 'party': { const ev = cleanPartyEvent(raw.ev); return ev ? { k: 'party', ev } : null; }
    case 'vitals': {
      if (!Array.isArray(raw.list)) return null;
      const list: VitalEntry[] = [];
      for (const e of raw.list.slice(0, MMO.partyMax)) {
        if (!isRec(e)) continue;
        const id = cleanId(e.id);
        if (!id) continue;
        const mhp = num(e.mhp, 1, 1, 1e7), mwill = num(e.mwill, 100, 1, 1000);
        list.push({ id, mhp, hp: num(e.hp, mhp, 0, mhp), mwill, will: num(e.will, 0, 0, mwill), x: num(e.x, 0, -W, W), z: num(e.z, 0, -W, W), dom: e.dom === 'sea' ? 'sea' : 'land', zone: cleanText(e.zone, 40), ride: cleanId(e.ride) });
      }
      return { k: 'vitals', list };
    }
    case 'chat': {
      const m = raw.msg;
      if (!isRec(m) || !CHAT_CHANNELS.includes(m.ch as ChatChannel)) return null;
      const text = cleanText(m.text);
      return text ? { k: 'chat', msg: { ch: m.ch as ChatChannel, from: cleanId(m.from), name: cleanText(m.name, MMO.nameMax), to: cleanId(m.to), toName: cleanText(m.toName, MMO.nameMax), text, t: num(m.t, 0, 0, 1e13) } } : null;
    }
    case 'inspect': {
      const i = raw.info;
      if (!isRec(i)) return null;
      const profile = cleanProfile(i.profile);
      const stance = PARTY_STANCES.includes(i.stance as PartyStance) ? (i.stance as PartyStance) : 'neutral';
      return profile ? { k: 'inspect', info: { profile, stance, zone: cleanText(i.zone, 40), dist: num(i.dist, 0, 0, 1e6), party: bool(i.party) } } : null;
    }
    case 'heal': return { k: 'heal', from: cleanId(raw.from), name: cleanText(raw.name, MMO.nameMax), frac: num(raw.frac, 0, 0, 0.6) };
    case 'horn': return { k: 'horn', from: cleanId(raw.from), name: cleanText(raw.name, MMO.nameMax), heal: num(raw.heal, 0, 0, 0.5), will: num(raw.will, 0, 0, 100) };
    case 'share': return SHARES.includes(raw.what as string) ? { k: 'share', from: cleanId(raw.from), name: cleanText(raw.name, MMO.nameMax), what: raw.what as ShareKind, ref: cleanText(raw.ref, 32), amount: num(raw.amount, 1, 0, 1000) } : null;
    case 'hit': return { k: 'hit', from: cleanId(raw.from), name: cleanText(raw.name, MMO.nameMax), dmg: num(raw.dmg, 0, 0, 5000), land: bool(raw.land) };
    case 'ride': return { k: 'ride', ok: bool(raw.ok), ship: cleanId(raw.ship), text: cleanText(raw.text, 160) };
    case 'notice': return { k: 'notice', text: cleanText(raw.text, 200), tone: raw.tone === 'warn' || raw.tone === 'error' ? raw.tone : 'info' };
    case 'pong': return { k: 'pong', t: num(raw.t, 0, 0, 1e13), st: num(raw.st, 0, 0, 1e13) };
    case 'online': return { k: 'online', n: Math.round(num(raw.n, 0, 0, 1e6)), world: Math.round(num(raw.world, 0, 0, 1e6)), shard: cleanText(raw.shard, 40) };
    case 'lootShare': {
      const power = typeof raw.power === 'string' && /^[a-z]{0,16}$/.test(raw.power) ? raw.power : '';
      return { k: 'lootShare', from: cleanId(raw.from), name: cleanText(raw.name, MMO.nameMax), gold: Math.round(num(raw.gold, 0, 0, 1e6)), rep: Math.round(num(raw.rep, 0, -100, 100)), power, n: Math.round(num(raw.n, 1, 1, MMO.partyMax)) };
    }
    case 'lootGet': {
      const item = cleanLootItem(raw.item);
      const how = raw.how === 'reihum' || raw.how === 'wurf' || raw.how === 'allein' || raw.how === 'verzicht' ? raw.how : 'allein';
      return item ? { k: 'lootGet', item, how, from: cleanId(raw.from), name: cleanText(raw.name, MMO.nameMax) } : null;
    }
    case 'rollStart': { const roll = cleanRollView(raw.roll); return roll ? { k: 'rollStart', roll } : null; }
    case 'rollEnd': {
      const id = cleanId(raw.id);
      const choice = ROLL_CHOICES.includes(raw.choice as RollChoice) ? (raw.choice as RollChoice) : '';
      return id ? { k: 'rollEnd', id, winner: cleanId(raw.winner), name: cleanText(raw.name, MMO.nameMax), choice, text: cleanText(raw.text, MMO.chatMax) } : null;
    }
    case 'eclaimed': { const key = cleanId(raw.key), id = cleanId(raw.id); return key && id ? { k: 'eclaimed', key, id, owner: cleanId(raw.owner) } : null; }
    case 'edenied': { const key = cleanId(raw.key); return key ? { k: 'edenied', key, wait: num(raw.wait, 0, 0, MMO.entRespawnMax) } : null; }
    case 'ents': {
      if (!Array.isArray(raw.list)) return null;
      const list: EntNet[] = [];
      for (const e of raw.list.slice(0, MMO.entPerPacket)) { const x = cleanEnt(e); if (x) list.push(x); }
      return { k: 'ents', t: num(raw.t, 0, 0, 1e13), list };
    }
    case 'ehit': {
      const id = cleanId(raw.id);
      if (!id) return null;
      const foe = raw.foe === undefined ? null : cleanFoeHit(raw.foe);
      return { k: 'ehit', id, from: cleanId(raw.from), dmg: num(raw.dmg, 0, 0, 1e6), ammo: typeof raw.ammo === 'string' && AMMO_RE.test(raw.ammo) ? raw.ammo : 'kugel', zone: raw.zone === 'sail' ? 'sail' : 'hull', pen: num(raw.pen, 1, 0, 12), ...(foe ? { foe } : {}) };
    }
    case 'ekill': { const kill = cleanKill(raw.kill); return kill ? { k: 'ekill', kill } : null; }
    case 'eown': { const e = cleanEnt(raw.e); return e ? { k: 'eown', e } : null; }
    case 'egone': { const id = cleanId(raw.id); return id ? { k: 'egone', id } : null; }
    case 'ehitme': { const id = cleanId(raw.id); return id ? { k: 'ehitme', id, name: cleanText(raw.name, 48), dmg: num(raw.dmg, 0, 0, 1e5), pen: num(raw.pen, 1, 0, 12) } : null; }
    case 'act': { const a = cleanAct(raw.a); return a ? { k: 'act', from: cleanId(raw.from), a } : null; }
    default: return null;
  }
}

/** Paket → Text (WebSocket); höchstens 64 KB */
export function encodePacket(p: ClientIntent | ServerMsg): string {
  const s = JSON.stringify(p);
  return s.length <= 65536 ? s : JSON.stringify({ k: 'notice', text: 'Paket zu groß', tone: 'error' });
}

/** Text → rohes Objekt (noch ungeprüft); null bei kaputtem JSON oder Übergröße */
export function decodePacket(text: unknown): unknown {
  if (typeof text !== 'string' || text.length > 65536) return null;
  try { return JSON.parse(text) as unknown; } catch { return null; }
}
