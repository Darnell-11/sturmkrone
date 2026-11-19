import { CREW_BY_ID, defaultParty } from '../../data/crew';
import { officerSlots } from '../../data/crewTiers';
import { sanitizeLook } from '../../data/characterParts';
import { cleanConquest, cleanUnlocks } from '../../raid/occupation';
import { cleanReputation } from '../../data/reputation';
import { convertLegacy10, isLegacy10, lookFromLegacy, skillsFromLegacy } from './legacy';
import { createSave, defaultProgress, defaultShip, SAVE_VERSION, type SaveData } from './types';
import { countOr, isRecord } from '../sanitize';

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
    const tier = countOr(d.legacy10?.tier, 0, 6);
    return { ...d, version: 5, ship: defaultShip(d.player?.faction === 'marine' ? 'marine' : 'pirat', tier) };
  },
  // Meilenstein 6: Ausrüstung, Aufträge, Statistik (Werte aus 1.0 übernehmen)
  5: (d) => {
    const L = d.legacy10 ?? {};
    const progress = { ...defaultProgress(), ...(d.progress ?? {}) };
    if (L.stats) progress.stats = { ...progress.stats, kills: countOr(L.stats.beaten, 0, 1e6), sunk: countOr(L.stats.sunk, 0, 1e6), boarded: countOr(L.stats.boarded, 0, 1e6) };
    return { ...d, version: 6, progress, gear: { weapon: countOr(L.weapon, 0, 5), armor: countOr(L.armor, 0, 4), potions: countOr(L.potions, 3, 10), shrine: 0 } };
  },
  // Meilenstein 7: Crew, Legenden, Schiffsausbauten (aus 1.0 übernehmen)
  6: (d) => {
    const L = d.legacy10 ?? {};
    const hired = Array.isArray(L.crew) ? L.crew.filter((c: unknown) => typeof c === 'string' && CREW_BY_ID[c as string]) : [];
    const legends = isRecord(L.legends) ? Object.keys(L.legends).filter((k) => L.legends[k]) : [];
    const ship = { ...(d.ship ?? {}), up: { can: countOr(L.up?.can, 0, 5), hull: countOr(L.up?.hull, 0, 5), sail: countOr(L.up?.sail, 0, 5) } };
    return { ...d, version: 7, ship, crew: { hired, party: defaultParty(hired, officerSlots(6)), loyalty: {} }, legends };
  },
  // 2.0: Talismane
  7: (d) => ({ ...d, version: 8, gear: { ...(d.gear ?? {}), trinkets: [], trinket: null } }),
  // 2.6: Mantel und Stiefel gab es für die Anime-Figuren vorher nicht zur Auswahl – einmal Piratenkleidung anlegen
  8: (d) => {
    const p = d.player ?? {};
    const look = { ...(p.look ?? {}) };
    const marine = p.faction === 'marine';
    if (!look.coat || look.coat === 'keiner') { look.coat = 'lang'; look.coatColor = marine ? '#14284A' : '#7A1F1A'; }
    look.shoes = 'stiefel';
    return { ...d, version: 9, player: { ...p, look } };
  },
  // 2.9.27: Die Welt ist doppelt so weit (vierfache Fläche). Das Schiff bleibt in seinem Meer bei seiner Insel:
  // seine Lage wandert mit der Karte nach außen. Rund um Ankerglück ändert sich nichts (die Stadt blieb an ihrem Platz).
  9: (d) => {
    const world = { ...(d.world ?? {}) };
    const b = world.boat;
    if (b && typeof b.x === 'number' && typeof b.z === 'number' && Math.hypot(b.x, b.z - 160) > 220) {
      world.boat = { ...b, x: b.x * 2, z: b.z * 2 };
    }
    return { ...d, version: 10, world };
  },
  // 11: Plätze für Hände, Beine, Füße und Nebenhand (leer; die Rüstungsstufe bleibt, wie sie ist)
  10: (d) => ({ ...d, version: 11, gear: { ...(d.gear ?? {}), owned: [], worn: {} } }),
  // 12: Ansehen bei den Weltmächten (Marine): Marine-Anwärter beginnen als Freunde (60), Piraten als Gesetzlose (−40)
  11: (d) => ({ ...d, version: 12, progress: { ...(d.progress ?? {}), standing: { ...(d.progress?.standing ?? {}), marine: d.player?.faction === 'marine' ? 60 : -40 } } }),
  // 13: eroberte Festungsinseln (Besatzungs-Timer, Eroberungen) und dauerhafte Freischaltungen aus Raids; nichts Vorhandenes ändert sich
  12: (d) => ({ ...d, version: 13, progress: { ...(d.progress ?? {}), conquest: cleanConquest(d.progress?.conquest), unlocks: cleanUnlocks(d.progress?.unlocks) } }),
  // 14: Fraktions-Ehre, Kopfgeld und Baupläne (Seeschlachten); das Ansehen bei allen Mächten steckt schon in `standing` (fehlende Einträge gelten als 0)
  13: (d) => ({ ...d, version: 14, progress: { ...(d.progress ?? {}), reputation: cleanReputation(d.progress?.reputation) } }),
};

export type MigrationResult =
  | { ok: true; data: SaveData; migratedFrom: number | 'legacy10' | null }
  | { ok: false; error: string };

/** Ergänzt fehlende Felder mit Standardwerten, ohne vorhandene Werte zu überschreiben. */
function fillDefaults<T extends Record<string, any>>(value: unknown, defaults: T): T {
  if (!isRecord(value)) return defaults;
  const out: Record<string, any> = { ...value };
  for (const [k, d] of Object.entries(defaults as Record<string, any>)) {
    if (isRecord(d)) out[k] = fillDefaults(value[k], d);
    else if (out[k] === undefined || (d !== null && typeof out[k] !== typeof d)) out[k] = d;
  }
  return out as T;
}

export function migrateSave(raw: unknown, gameVersion: string): MigrationResult {
  if (isLegacy10(raw)) return { ok: true, data: convertLegacy10(raw, gameVersion), migratedFrom: 'legacy10' };
  if (!isRecord(raw)) return { ok: false, error: 'Die Datei enthält keinen Spielstand.' };
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
  const defaults = createSave('', isRecord(data.player) && data.player.faction === 'marine' ? 'marine' : 'pirat', gameVersion, 0);
  const filled = fillDefaults(data, defaults) as SaveData;
  if (filled.player.faction !== 'pirat' && filled.player.faction !== 'marine') filled.player.faction = 'pirat';
  filled.player.look = sanitizeLook(filled.player.look, filled.player.faction);
  return { ok: true, data: filled, migratedFrom: from === SAVE_VERSION ? null : from };
}
