import { CREW_BY_ID, defaultParty } from '../../data/crew';
import { defaultLook, type CharacterLook } from '../../data/characterParts';
import { defaultProgress, defaultShip, SAVE_VERSION, type Faction, type FightStyle, type SaveData, type SkillState } from './types';

/** localStorage-Schlüssel von Sturmkrone 1.0 */
export const LEGACY_KEY = 'sturmkrone-saga-1';

export function isLegacy10(raw: unknown): raw is Record<string, any> {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return r.v === 1 && typeof r.lvl === 'number' && (r.faction === 'pirat' || r.faction === 'marine');
}

const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);

/** Übersetzt den einfachen Look aus 1.0 (bzw. Spielstand-Version 1/2) in den Charakter-Editor 2.0. */
export function lookFromLegacy(raw: unknown, faction: Faction, style: FightStyle = 'schwert'): CharacterLook {
  const l = defaultLook(faction);
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    const hairMap: Record<string, CharacterLook['hair']> = { kurz: 'kurz', zopf: 'zopf', lang: 'lang', igel: 'igel', glatze: 'glatze' };
    const hatMap: Record<string, CharacterLook['hat']> = {
      dreispitz: 'dreispitz', bandana: 'bandana', kochmuetze: 'kochmuetze', muetze: 'muetze', brille: 'brille',
      suedwester: 'suedwester', helm: 'helm', keine: 'keiner',
    };
    l.skin = hex(r.skin) ?? l.skin;
    if (typeof r.hair === 'string' && hairMap[r.hair]) l.hair = hairMap[r.hair];
    l.hairColor = hex(r.hairCol) ?? l.hairColor;
    l.outfitColor = hex(r.outfit) ?? l.outfitColor;
    if (typeof r.hat === 'string' && hatMap[r.hat]) l.hat = hatMap[r.hat];
    l.hatColor = hex(r.hatCol) ?? l.hatColor;
    if (r.beard) l.beard = 'vollbart';
    if (r.patch) l.eyepatch = true;
    if (hex(r.coat)) { l.coat = 'lang'; l.coatColor = hex(r.coat)!; }
  }
  l.gloves = style === 'faust';
  return l;
}

/** Wandelt einen 1.0-Spielstand in das 2.0-Format (Version 1) um. Nichts geht verloren: Alles liegt zusätzlich in legacy10. */
export function convertLegacy10(raw: Record<string, any>, gameVersion: string, now = Date.now()): SaveData {
  const up = (v: unknown) => Math.max(0, Math.min(5, Math.floor(num(v, 0))));
  const hired: string[] = Array.isArray(raw.crew) ? raw.crew.filter((c: unknown) => typeof c === 'string' && CREW_BY_ID[c as string]) : [];
  const style: FightStyle = ['faust', 'schwert', 'effekt'].includes(raw.style) ? raw.style : 'schwert';
  const look = lookFromLegacy(raw.look, raw.faction as Faction, style);
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
    world: { boat: null, time: 9, weather: 'klar' },
    progress: {
      ...defaultProgress(),
      flags: raw.flags && typeof raw.flags === 'object' ? { ...raw.flags } : {},
      quest: Math.max(0, Math.floor(num(raw.quest, 0))),
      stats: {
        kills: Math.max(0, Math.floor(num(raw.stats?.beaten, 0))), sunk: Math.max(0, Math.floor(num(raw.stats?.sunk, 0))),
        boarded: Math.max(0, Math.floor(num(raw.stats?.boarded, 0))), treasures: 0, rescued: 0,
      },
    },
    gear: {
      weapon: Math.max(0, Math.min(5, Math.floor(num(raw.weapon, 0)))), armor: Math.max(0, Math.min(4, Math.floor(num(raw.armor, 0)))),
      potions: Math.max(0, Math.min(10, Math.floor(num(raw.potions, 3)))), shrine: 0, trinkets: [], trinket: null,
    },
    skills: skillsFromLegacy(raw, Math.max(1, Math.floor(num(raw.lvl, 1)))),
    ship: { ...defaultShip(raw.faction as Faction, Math.max(0, Math.min(6, Math.floor(num(raw.tier, 0))))), up: { can: up(raw.up?.can), hull: up(raw.up?.hull), sail: up(raw.up?.sail) } },
    crew: { hired, party: defaultParty(hired), loyalty: {} },
    legends: raw.legends && typeof raw.legends === 'object' ? Object.keys(raw.legends).filter((k) => raw.legends[k]) : [],
    legacy10: JSON.parse(JSON.stringify(raw)),
  };
}

/** Fähigkeiten aus 1.0 übernehmen (gleiche IDs); ohne Daten: Punkte für bisherige Stufen nachreichen */
export function skillsFromLegacy(raw: Record<string, any> | undefined, level: number): SkillState {
  const learned: Record<string, number> = {};
  if (raw?.sk && typeof raw.sk === 'object') for (const [k, v] of Object.entries(raw.sk)) if (typeof v === 'number' && v > 0) learned[k] = Math.floor(v);
  const slots = Array.isArray(raw?.slots) ? raw!.slots.slice(0, 3).map((s: unknown) => (typeof s === 'string' ? s : null)) : [null, null, null];
  while (slots.length < 3) slots.push(null);
  const sp = typeof raw?.sp === 'number' ? Math.max(0, Math.floor(raw.sp)) : Math.max(1, level);
  return { learned, slots, sp, awakened: [] };
}
