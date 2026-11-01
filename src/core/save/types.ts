// Aufbau eines Spielstands. Bei jeder Änderung: SAVE_VERSION erhöhen und in migrations.ts eine Migration ergänzen.
import { defaultLook, type CharacterLook } from '../../data/characterParts';
import { DEFAULT_SHIP_LOOK, type AmmoId, type ShipLook } from '../../data/ships';

export const SAVE_VERSION = 5;

export interface ShipState {
  /** Aktuelle Klasse (Index in SHIP_CLASSES) */
  tier: number;
  /** Gekaufte Klassen */
  owned: number[];
  look: ShipLook;
  ammo: AmmoId;
  /** Rumpfzustand 0 … 1 */
  hull: number;
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
  progress: {
    flags: Record<string, unknown>;
    quest: number;
  };
  skills: SkillState;
  ship: ShipState;
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
    progress: { flags: {}, quest: 0 },
    skills: { learned: {}, slots: [null, null, null], sp: 1, awakened: [] },
    ship: defaultShip(faction),
  };
}

export function defaultShip(faction: Faction, tier = 0): ShipState {
  const owned = Array.from({ length: tier + 1 }, (_, i) => i);
  return { tier, owned, look: DEFAULT_SHIP_LOOK(faction), ammo: 'kugel', hull: 1 };
}
