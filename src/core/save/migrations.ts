import { cleanMegaSave } from '../../data/megaIslands';
import { cleanKaiserSave } from '../../data/kaiserBattle';
import { CREW_BY_ID, defaultParty } from '../../data/crew';
import { officerSlots } from '../../data/crewTiers';
import { sanitizeLook } from '../../data/characterParts';
import { cleanConquest, cleanUnlocks } from '../../raid/occupation';
import { cleanReputation } from '../../data/reputation';
import { ARMOR, WEAPONS } from '../../data/items';
import { AMMO_UNLOCK, cleanEconomy } from '../../data/economy';
import { TIER_DEFS } from '../../data/balanceConfig';
import { rankIndex } from '../../data/ranks';
import { cleanEvolution, legacyUpToEvo } from '../../data/shipEvolution';
import { cleanFleet, emptyFleet, fleetSlots } from '../../data/playerFleet';
import { cleanWorldEvents } from '../../world/worldEventDirector';
import { chartOnLoad } from '../../world/mapDiscovery';
import { SHIP_UPGRADE_MAX } from '../../data/ships';
import { convertLegacy10, isLegacy10, lookFromLegacy, skillsFromLegacy } from './legacy';
import { createSave, defaultProgress, defaultShip, SAVE_VERSION, type SaveData } from './types';
import { countOr, isRecord } from '../sanitize';
import { migrateWorldTo21 } from './worldMigration';

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
  // 15: Balance-Umbau (data/balanceConfig.ts): Ausrüstungswerte folgen jetzt allein aus Stufe (Tier 1 … 5) und Platz und werden zur Laufzeit
  // berechnet – alte, zu starke Werte stecken nirgends im Spielstand und sind damit sauber auf die neuen Definitionen abgebildet. Gespeichert
  // sind nur Stufen-Indizes (werden eingegrenzt). Die Boss-Beute ist kein sicherer Wurf mehr: wer schon Eroberungen hat, bekommt dafür je
  // Eroberung ein Siegel und zwei Relikt-Splitter, damit jedes Boss-Stück schmiedbar bleibt.
  14: (d) => {
    const progress = { ...(d.progress ?? {}) };
    const unlocks = cleanUnlocks(progress.unlocks);
    const conquest = cleanConquest(progress.conquest);
    for (const r of Object.values(conquest)) {
      if (r.conquestCount > 0 && r.factionId) {
        unlocks.seals[r.factionId] = Math.min(999, (unlocks.seals[r.factionId] ?? 0) + Math.min(5, r.conquestCount));
        unlocks.shards = Math.min(9999, unlocks.shards + 2 * Math.min(5, r.conquestCount));
      }
    }
    progress.unlocks = unlocks;
    const gear = { ...(d.gear ?? {}) };
    const idx = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
    gear.weapon = idx(gear.weapon, WEAPONS.length - 1);
    gear.armor = idx(gear.armor, ARMOR.length - 1);
    if (gear.weaponEq !== undefined) gear.weaponEq = idx(gear.weaponEq, gear.weapon);
    if (gear.armorEq !== undefined) gear.armorEq = idx(gear.armorEq, gear.armor);
    const ship = d.ship && typeof d.ship === 'object' ? { ...d.ship } : d.ship;
    if (ship && ship.up && typeof ship.up === 'object') ship.up = Object.fromEntries(Object.entries(ship.up).map(([k, v]) => [k, idx(v, SHIP_UPGRADE_MAX)]));
    return { ...d, version: 15, progress, gear, ...(ship ? { ship } : {}) };
  },
  // 16: Ökonomie (Märkte, Fracht, Sold, Fahndungsdruck, Munitions-Freischaltung). Der erste Zahltag liegt eine Periode nach dem Laden (nichts
  // wird rückwirkend abgerechnet); wer schon Spezialmunition benutzt hat, behält sie: sie wird nach Rang freigeschaltet, ohne Ansehens-Prüfung.
  15: (d) => {
    const now = typeof d.meta?.playTime === 'number' && Number.isFinite(d.meta.playTime) ? d.meta.playTime : 0;
    const eco = cleanEconomy(d.progress?.economy, now);
    const fame = typeof d.player?.fame === 'number' ? d.player.fame : 0;
    const rank = rankIndex(fame);
    for (const id of ['kette', 'kartaetsche', 'brand'] as const) {
      const t = AMMO_UNLOCK[id].tier;
      if (!eco.ammo.includes(id) && rank >= TIER_DEFS[t].rankMin) eco.ammo.push(id);
    }
    return { ...d, version: 16, progress: { ...(d.progress ?? {}), economy: eco } };
  },
  // 17: Schiffs-Evolution (data/shipEvolution.ts). Die alten Ausbaustufen `ship.up` (0 … 5) werden auf Rumpf-, Segel- und Kanonen-Stufe 1 … 5
  // abgebildet (`legacyUpToEvo`: die alten Grundwerte sind jetzt Stufe 3, kein Schiff wird schwächer) und gelten für alle gekauften Klassen.
  16: (d) => {
    const ship = isRecord(d.ship) ? { ...d.ship } : {};
    const owned: number[] = Array.isArray(ship.owned) ? ship.owned.filter((x: unknown) => typeof x === 'number' && Number.isFinite(x)) : [typeof ship.tier === 'number' ? ship.tier : 0];
    const evo: Record<string, unknown> = isRecord(ship.evo) ? { ...ship.evo } : {};
    const mapped = legacyUpToEvo(ship.up);
    for (const c of owned) { const k = String(Math.max(0, Math.min(6, Math.floor(c)))); evo[k] = cleanEvolution(evo[k], mapped); }
    delete ship.up;
    ship.evo = evo;
    return { ...d, version: 17, ship };
  },
  // 18: Spieler-Flotte (data/playerFleet.ts). Die Begleitschiffe, die bisher ab Rang 5 und 8 von selbst erschienen, waren nie gespeichert; die Flotte beginnt
  // leer, die Plätze (ab Rang 4) füllt der Spieler mit besessenen Schiffen.
  17: (d) => ({ ...d, version: 18, fleet: emptyFleet() }),
  // 19: das lebendige Meer (Phase 4.3C): Welt-Ereignisse, Konvois und Wetterzellen beginnen beim nächsten Spielstart neu; dazu (Phase 4.3D) die Weltkarte:
  // bereits besuchte oder eroberte Inseln gelten als entdeckt (world/mapDiscovery.ts `legacyDiscovered`)
  18: (d) => ({ ...d, version: 19, world: { ...(d.world ?? {}), seaEvents: null, chart: chartOnLoad(undefined, d.progress) } }),
  // 20: das Ökosystem der Mächte (Phase 4.5A): Kassen, Verträge, Armadas und Inselbesitz beginnen beim nächsten Spielstart aus den Inseldaten (alle
  // Inseln bei ihren Gründern, Startbeziehungen aus data/nations.ts); Eroberungen des Spielers (Raids) bleiben unberührt in `progress.conquest`
  19: (d) => ({ ...d, version: 20, world: { ...(d.world ?? {}), factionWar: null } }),
  // 21: die erweiterte Welt (Phase 4.5C, 15 600 m Radius, entzerrte Inseln): Schiff, Seekarten-Zonen, Ereignisse, Konvois, Wetterzellen, Armadas,
  // Großschlachten und Kontrollpunkte wandern auf das neue Raster (core/save/worldMigration.ts); entdeckte Inseln, Flotten und Kriegsstände bleiben
  20: (d) => migrateWorldTo21(d),
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
  // Flotte: nur besessene Klassen außer dem Flaggschiff, Werte begrenzt, Ausbaustufen aus `ship.evo`, nie mehr aktive Schiffe als Plätze
  // Lebendiges Meer: fremde oder kaputte Daten fallen weg (dann beginnt es neu)
  filled.world.seaEvents = cleanWorldEvents(filled.world.seaEvents);
  // Weltkarte: gespeicherte Entdeckungen säubern; was der Stand schon weiß (besucht, erobert), gilt immer als entdeckt – auch bei frühen Ständen der Version 19
  filled.world.chart = chartOnLoad(filled.world.chart, filled.progress);
  // Mega-Inseln (4.4A): Ruhezeiten säubern (fehlt das Feld in älteren Ständen, bleibt es leer: alles bereit)
  filled.world.mega = cleanMegaSave(filled.world.mega);
  // Kaiser-Zitadellen (4.5D): Ruhezeiten und Siege säubern (fehlt das Feld, stehen alle fünf in voller Stärke)
  filled.world.kaiser = cleanKaiserSave(filled.world.kaiser);
  // Ökosystem der Mächte (4.5A): nur die Form prüfen; den Inhalt säubert das Spiel beim Laden mit Register und Inseldaten (`cleanFactionWar`)
  const fw = filled.world.factionWar as unknown;
  filled.world.factionWar = fw && typeof fw === 'object' && (fw as { v?: unknown }).v === 1 ? (fw as SaveData['world']['factionWar']) : null;
  filled.fleet = cleanFleet(filled.fleet, { owned: filled.ship.owned ?? [], flagship: filled.ship.tier, evo: filled.ship.evo ?? {}, look: filled.ship.look, slots: fleetSlots(rankIndex(filled.player.fame)) });
  return { ok: true, data: filled, migratedFrom: from === SAVE_VERSION ? null : from };
}
