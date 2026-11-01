import { CREW_BY_ID, defaultParty } from '../../data/crew';
import { sanitizeLook } from '../../data/characterParts';
import { convertLegacy10, isLegacy10, lookFromLegacy, skillsFromLegacy } from './legacy';
import { createSave, defaultProgress, defaultShip, SAVE_VERSION, type SaveData } from './types';

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
  // Meilenstein 2: Charakter-Editor 2.0
  2: (d) => {
    const p = { ...(d.player ?? {}) };
    const faction = p.faction === 'marine' ? 'marine' : 'pirat';
    p.look = lookFromLegacy(p.look, faction, p.style);
    return { ...d, version: 3, player: p };
  },
  // Meilenstein 4: Faji-Skillbaum (1.0-Fähigkeiten werden übernommen)
  3: (d) => ({ ...d, version: 4, skills: skillsFromLegacy(d.legacy10, d.player?.level ?? 1) }),
  // Meilenstein 5: eigenes Schiff (Schiffsstufe aus 1.0 übernehmen)
  4: (d) => {
    const tier = typeof d.legacy10?.tier === 'number' ? Math.max(0, Math.min(6, Math.floor(d.legacy10.tier))) : 0;
    return { ...d, version: 5, ship: defaultShip(d.player?.faction === 'marine' ? 'marine' : 'pirat', tier) };
  },
  // Meilenstein 6: Ausrüstung, Aufträge, Statistik (Werte aus 1.0 übernehmen)
  5: (d) => {
    const L = d.legacy10 ?? {};
    const n = (v: unknown, def: number, max: number) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : def);
    const progress = { ...defaultProgress(), ...(d.progress ?? {}) };
    if (L.stats) progress.stats = { ...progress.stats, kills: n(L.stats.beaten, 0, 1e6), sunk: n(L.stats.sunk, 0, 1e6), boarded: n(L.stats.boarded, 0, 1e6) };
    return { ...d, version: 6, progress, gear: { weapon: n(L.weapon, 0, 5), armor: n(L.armor, 0, 4), potions: n(L.potions, 3, 10), shrine: 0 } };
  },
  // Meilenstein 7: Crew, Legenden, Schiffsausbauten (aus 1.0 übernehmen)
  6: (d) => {
    const L = d.legacy10 ?? {};
    const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(5, Math.floor(v))) : 0);
    const hired = Array.isArray(L.crew) ? L.crew.filter((c: unknown) => typeof c === 'string' && CREW_BY_ID[c as string]) : [];
    const legends = isObj(L.legends) ? Object.keys(L.legends).filter((k) => L.legends[k]) : [];
    const ship = { ...(d.ship ?? {}), up: { can: n(L.up?.can), hull: n(L.up?.hull), sail: n(L.up?.sail) } };
    return { ...d, version: 7, ship, crew: { hired, party: defaultParty(hired), loyalty: {} }, legends };
  },
  // 2.0: Talismane
  7: (d) => ({ ...d, version: 8, gear: { ...(d.gear ?? {}), trinkets: [], trinket: null } }),
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
  filled.player.look = sanitizeLook(filled.player.look, filled.player.faction);
  return { ok: true, data: filled, migratedFrom: from === SAVE_VERSION ? null : from };
}
