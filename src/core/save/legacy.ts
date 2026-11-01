import { SAVE_VERSION, type Faction, type FightStyle, type SaveData } from './types';

/** localStorage-Schlüssel von Sturmkrone 1.0 */
export const LEGACY_KEY = 'sturmkrone-saga-1';

export function isLegacy10(raw: unknown): raw is Record<string, any> {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return r.v === 1 && typeof r.lvl === 'number' && (r.faction === 'pirat' || r.faction === 'marine');
}

const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);

/** Wandelt einen 1.0-Spielstand in das 2.0-Format (Version 1) um. Nichts geht verloren: Alles liegt zusätzlich in legacy10. */
export function convertLegacy10(raw: Record<string, any>, gameVersion: string, now = Date.now()): SaveData {
  const style: FightStyle = ['faust', 'schwert', 'effekt'].includes(raw.style) ? raw.style : 'schwert';
  const look: Record<string, string | number> = {};
  if (raw.look && typeof raw.look === 'object') {
    for (const [k, v] of Object.entries(raw.look)) if (typeof v === 'string' || typeof v === 'number') look[k] = v;
  }
  return {
    version: SAVE_VERSION,
    meta: { created: now, updated: now, playTime: 0, gameVersion },
    player: {
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 24) : 'Fynn',
      faction: raw.faction as Faction,
      style,
      blade: typeof raw.blade === 'string' ? raw.blade : 'saebel',
      level: Math.max(1, Math.floor(num(raw.lvl, 1))),
      xp: Math.max(0, num(raw.xp, 0)),
      gold: Math.max(0, num(raw.gold, 0)),
      fame: Math.max(0, num(raw.ruhm, 0)),
      look,
    },
    // Die 1.0-Welt hatte andere Koordinaten – das Schiff startet neu am Hafen.
    world: { boat: null, night: false },
    progress: {
      flags: raw.flags && typeof raw.flags === 'object' ? { ...raw.flags } : {},
      quest: Math.max(0, Math.floor(num(raw.quest, 0))),
    },
    legacy10: JSON.parse(JSON.stringify(raw)),
  };
}
