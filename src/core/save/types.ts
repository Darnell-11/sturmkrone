// Aufbau eines Spielstands. Bei jeder Änderung: SAVE_VERSION erhöhen und in migrations.ts eine Migration ergänzen.
export const SAVE_VERSION = 1;

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
    look: Record<string, string | number>;
  };
  world: {
    boat: { x: number; z: number; heading: number } | null;
    night: boolean;
  };
  progress: {
    flags: Record<string, unknown>;
    quest: number;
  };
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
      look: {},
    },
    world: { boat: null, night: false },
    progress: { flags: {}, quest: 0 },
  };
}
