// Aufbau eines Spielstands. Bei jeder Änderung: SAVE_VERSION erhöhen und in migrations.ts eine Migration ergänzen.
import { defaultLook, type CharacterLook } from '../../data/characterParts';
import { DEFAULT_SHIP_LOOK, type AmmoId, type ShipLook } from '../../data/ships';
import { START_MARINE_STANDING, type FactionId } from '../../data/factions';
import { emptyEconomy, type EconomyState } from '../../data/economy';
import { emptyUnlocks, type ConquestRecord, type Unlocks } from '../../raid/occupation';
import { emptyReputation, type FactionReputationState } from '../../data/reputation';

export const SAVE_VERSION = 16;

export interface QuestProgress { id: string; step: number; count: number }

export interface ProgressState {
  flags: Record<string, unknown>;
  quest: number;
  /** Laufende Aufträge */
  quests: QuestProgress[];
  /** Abgeschlossene Aufträge */
  done: string[];
  /** Offene Schatzkarten (Insel-IDs) */
  maps: string[];
  stats: { kills: number; sunk: number; boarded: number; treasures: number; rescued: number };
  /** Ansehen bei den Weltmächten, −100 … +100 (seit Version 12; bisher nur `marine`: ab 20 verbündet, unter 0 feindlich, siehe data/factions.ts) */
  standing: Partial<Record<FactionId, number>>;
  /**
   * Eroberte Festungsinseln (seit Version 13), Schlüssel = Insel-ID: Besatzungs-Timer `occupiedUntil` (Uhr = `meta.playTime`), Zahl der
   * Eroberungen und Stand der Rückeroberungs-Flotte (raid/occupation.ts). Fehlt in älteren Spielständen (dann leer).
   */
  conquest?: Record<string, ConquestRecord>;
  /** Dauerhafte Freischaltungen aus Raids: Fraktions-Segel, Verzierungen und erbeutete Boss-Stücke – gehen bei einer Rückeroberung nie verloren */
  unlocks?: Unlocks;
  /** Fraktions-Ehre, Kopfgeld und Baupläne aus Seeschlachten (seit Version 14); das Ansehen steht in `standing`. Fehlt in älteren Spielständen (dann leer). */
  reputation?: FactionReputationState;
  /** Handel, Fracht, Unterhalt, Fahndungsdruck und freigeschaltete Munition (seit Version 16, data/economy.ts); fehlt in älteren Spielständen */
  economy?: EconomyState;
}

export interface GearState {
  weapon: number; armor: number; potions: number; shrine: number;
  /** Gefundene Talismane (IDs) und der angelegte */
  trinkets: string[];
  trinket: string | null;
  /** Inventar (alles optional: alte Spielstände bekommen Standardwerte, siehe core/inventory.ts ensureGear) */
  /** Verbrauchsgüter außer Proviant (ID → Anzahl) */
  items?: Record<string, number>;
  /** Gekaufte Kopfbedeckungen und die angelegte */
  heads?: string[];
  head?: string | null;
  /** Schnellleiste (Tasten 1–4): Güter-IDs */
  bar?: (string | null)[];
  /** Angelegte Waffen- und Rüstungsstufe, falls nicht die höchste */
  weaponEq?: number;
  armorEq?: number;
  /** Gekaufte Ausrüstungsstücke (IDs aus GEAR) und die angelegten je Platz (seit Version 11) */
  owned?: string[];
  worn?: Partial<Record<'hands' | 'legs' | 'feet' | 'offhand', string | null>>;
  /** Beute-Ausrüstung (data/gear.ts): besessene Stücke, angelegte je Platz und eigene Farben (Haupt-, Zierfarbe) */
  loot?: string[];
  outfit?: Partial<Record<'head' | 'shoulder' | 'chest' | 'cloak' | 'hands' | 'legs' | 'feet' | 'mainhand' | 'offhand', string | null>>;
  dyes?: Record<string, [string, string]>;
}

export interface ShipState {
  /** Aktuelle Klasse (Index in SHIP_CLASSES) */
  tier: number;
  /** Gekaufte Klassen */
  owned: number[];
  look: ShipLook;
  ammo: AmmoId;
  /** Rumpfzustand 0 … 1 */
  hull: number;
  /** Segelzustand (Segel-HP) und Crew-% 0 … 1; fehlt in älteren Spielständen (dann 1) */
  sail?: number;
  crew?: number;
  /**
   * Anteil je Besatzungsgruppe 0 … 1 (`matrosen`, `truppen`), seit der Zwei-Stufen-Crew. Fehlt in älteren Spielständen:
   * dann gilt `crew` für die Seeleute und die Truppen sind leer. `crew` bleibt als Seeleute-Anteil für alte Programmversionen erhalten.
   */
  crewPools?: Record<string, number>;
  /** Ausbauten der Werft (je 0 … 5): Kanonen, Rumpf, Segel */
  up: { can: number; hull: number; sail: number };
}

export interface CrewState {
  /** Angeheuerte Crew (IDs aus data/crew.ts) */
  hired: string[];
  /**
   * Offiziere im Land- und Entertrupp in Rangfolge. Es kämpfen die ersten `officerSlots(Schiffsklasse)`; weitere bleiben als Reserve
   * erhalten (nichts wird gelöscht, wenn man auf ein kleineres Schiff wechselt).
   */
  party: string[];
  /** Treue 0 … 100 */
  loyalty: Record<string, number>;
  /** Massentruppen (Stufe 2): Truppentyp → Köpfe (data/troops.ts). Namenlos, ohne Treue. Fehlt in älteren Spielständen (dann leer). */
  troops?: Record<string, number>;
  /** Plätze im Land-/Entertrupp, die beim letzten Speichern galten (aus der Schiffsklasse, data/crewTiers.ts); nur zur Anzeige und Prüfung */
  officerSlots?: number;
}

export interface SkillState {
  /** Gelernte Fähigkeiten mit Stufe */
  learned: Record<string, number>;
  /** Drei Plätze für aktive Fähigkeiten */
  slots: (string | null)[];
  /** Freie Fähigkeitspunkte */
  sp: number;
  /** Zweige, deren Faji erwacht ist */
  awakened: string[];
}

export type Faction = 'pirat' | 'marine';
export type FightStyle = 'faust' | 'schwert' | 'effekt';

export interface SaveData {
  version: number;
  meta: {
    created: number;
    updated: number;
    /** Gespielte Zeit in Sekunden */
    playTime: number;
    /** Spielversion, mit der zuletzt gespeichert wurde */
    gameVersion: string;
  };
  player: {
    name: string;
    faction: Faction;
    style: FightStyle;
    blade: string;
    /** Zweite Waffe (Platz 2, StyleId) und aktiver Platz 0/1 – fehlt in alten Spielständen (dann gilt der Standard) */
    alt?: string;
    slot?: 0 | 1;
    level: number;
    xp: number;
    gold: number;
    fame: number;
    look: CharacterLook;
  };
  world: {
    boat: { x: number; z: number; heading: number } | null;
    /** Uhrzeit 0 … 24 */
    time: number;
    /** Wetter-ID aus data/world.ts */
    weather: string;
  };
  progress: ProgressState;
  gear: GearState;
  skills: SkillState;
  ship: ShipState;
  crew: CrewState;
  /** Besiegte Legenden der Rangliste */
  legends: string[];
  /** Vollständiger Spielstand aus Sturmkrone 1.0 – bleibt erhalten, damit spätere Meilensteine Crew, Fähigkeiten usw. übernehmen können. */
  legacy10?: Record<string, unknown>;
}

export function createSave(name: string, faction: Faction, gameVersion: string, now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    meta: { created: now, updated: now, playTime: 0, gameVersion },
    player: {
      name: name.trim().slice(0, 24) || (faction === 'pirat' ? 'Fynn' : 'Rekrut'),
      faction,
      style: 'schwert',
      blade: 'saebel',
      level: 1,
      xp: 0,
      gold: 200,
      fame: 0,
      look: defaultLook(faction),
    },
    world: { boat: null, time: 9, weather: 'klar' },
    progress: defaultProgress(faction),
    gear: { weapon: 0, armor: 0, potions: 3, shrine: 0, trinkets: [], trinket: null, items: {}, heads: [], head: null, bar: ['proviant', null, null, null], owned: [], worn: {} },
    skills: { learned: {}, slots: [null, null, null], sp: 1, awakened: [] },
    ship: defaultShip(faction),
    crew: { hired: [], party: [], loyalty: {} },
    legends: [],
  };
}

export function defaultProgress(faction: Faction = 'pirat'): ProgressState {
  return { flags: {}, quest: 0, quests: [], done: [], maps: [], stats: { kills: 0, sunk: 0, boarded: 0, treasures: 0, rescued: 0 }, standing: { marine: START_MARINE_STANDING[faction] }, conquest: {}, unlocks: emptyUnlocks(), reputation: emptyReputation(), economy: emptyEconomy() };
}

export function defaultShip(faction: Faction, tier = 0): ShipState {
  const owned = Array.from({ length: tier + 1 }, (_, i) => i);
  return { tier, owned, look: DEFAULT_SHIP_LOOK(faction), ammo: 'kugel', hull: 1, up: { can: 0, hull: 0, sail: 0 } };
}
