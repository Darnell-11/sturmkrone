import { convertLegacy10, isLegacy10 } from './legacy';
import { createSave, SAVE_VERSION, type SaveData } from './types';

type Migration = (data: Record<string, any>) => Record<string, any>;

/** MIGRATIONS[n] hebt einen Spielstand von Version n auf n + 1. */
export const MIGRATIONS: Record<number, Migration> = {
  // Meilenstein 1: Tag/Nacht-Schalter wird zu Uhrzeit und Wetter
  1: (d) => {
    const world = { ...(d.world ?? {}) };
    world.time = world.night ? 22 : 9;
    world.weather = 'klar';
    delete world.night;
    return { ...d, version: 2, world };
  },
};

export type MigrationResult =
  | { ok: true; data: SaveData; migratedFrom: number | 'legacy10' | null }
  | { ok: false; error: string };

function isObj(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Ergänzt fehlende Felder mit Standardwerten, ohne vorhandene Werte zu überschreiben. */
function fillDefaults<T extends Record<string, any>>(value: unknown, defaults: T): T {
  if (!isObj(value)) return defaults;
  const out: Record<string, any> = { ...value };
  for (const [k, d] of Object.entries(defaults as Record<string, any>)) {
    if (isObj(d)) out[k] = fillDefaults(value[k], d);
    else if (out[k] === undefined || (d !== null && typeof out[k] !== typeof d)) out[k] = d;
  }
  return out as T;
}

export function migrateSave(raw: unknown, gameVersion: string): MigrationResult {
  if (isLegacy10(raw)) return { ok: true, data: convertLegacy10(raw, gameVersion), migratedFrom: 'legacy10' };
  if (!isObj(raw)) return { ok: false, error: 'Die Datei enthält keinen Spielstand.' };
  if (typeof raw.version !== 'number') return { ok: false, error: 'Unbekanntes Spielstand-Format.' };
  if (raw.version > SAVE_VERSION) {
    return { ok: false, error: 'Dieser Spielstand stammt aus einer neueren Version von Sturmkrone. Bitte lade die Seite neu, um das Update zu holen.' };
  }
  const from = raw.version;
  let data: Record<string, any> = raw;
  while (data.version < SAVE_VERSION) {
    const m = MIGRATIONS[data.version];
    if (!m) return { ok: false, error: `Für Version ${data.version} fehlt eine Migration.` };
    data = m(data);
  }
  const defaults = createSave('', isObj(data.player) && data.player.faction === 'marine' ? 'marine' : 'pirat', gameVersion, 0);
  const filled = fillDefaults(data, defaults) as SaveData;
  if (filled.player.faction !== 'pirat' && filled.player.faction !== 'marine') filled.player.faction = 'pirat';
  return { ok: true, data: filled, migratedFrom: from === SAVE_VERSION ? null : from };
}
