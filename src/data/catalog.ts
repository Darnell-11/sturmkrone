// Item-Kompendium: ALLE Gegenstände des Spiels als eine Liste, gebaut aus den Datenquellen (nichts ist hier von Hand eingetragen).
// Quellen: data/items.ts (Waffen, Rüstungen, Kopfbedeckungen, Schienen, Verbrauchsgüter), data/gear.ts (Rüstungssets), data/trinkets.ts,
// data/ships.ts (Schiffe, Ausbauten, Munition, Flaggen), data/figureheads.ts, data/factions.ts (Fraktions-Segel und -Zier) und
// raid/raidBosses.ts (Beute der sechs Endbosse). Neue Einträge in diesen Quellen erscheinen hier von selbst, jeder genau einmal
// (ein Test prüft Kennungen und Namen).
import type { SaveData } from '../core/save/types';
import { fmtInt, fmtNum, fmtPct } from '../core/format';
import { itemCount } from '../core/inventory';
import { AMMO, AMMO_IDS, FLAGS, FLAG_DESC, SHIP_CLASSES, SHIP_UPGRADES, SHIP_UPGRADE_IDS, SHIP_UPGRADE_MAX, upgradeEffectText, type FlagId } from './ships';
import { ARMOR, CONSUMABLES, GEAR, HEADS, WEAPONS, WEAPON_LINES, type GearSlot } from './items';
import { CAT_LABEL, type GearCat } from './equipment';
import { bonusRows, GEAR_CATALOG, GEAR_SET_BY_ID } from './gear';
import { TRINKETS } from './trinkets';
import { RARITIES, RARITY, type Rarity } from './rarity';
import { FIGUREHEAD_DEFS, FIGUREHEAD_MODELS, type FigureheadModelId } from './figureheads';
import { CITADELS, FACTIONS, FACTION_IDS, type FactionId } from './factions';
import { officerSlots, troopCapacity } from './crewTiers';
import { RANKS } from './ranks';
import { RAID_BOSSES } from '../raid/raidBosses';

export type CatalogCat = 'waffen' | 'ruestung' | 'talismane' | 'verbrauch' | 'schiff' | 'galion' | 'flaggen' | 'munition';

export const CATALOG_CATS: { id: CatalogCat; label: string; icon: string }[] = [
  { id: 'waffen', label: 'Waffen', icon: 'sword' },
  { id: 'ruestung', label: 'Rüstung & Kleidung', icon: 'chest' },
  { id: 'talismane', label: 'Talismane', icon: 'amulet' },
  { id: 'verbrauch', label: 'Verbrauchsgüter', icon: 'flask' },
  { id: 'schiff', label: 'Schiffe & Ausbauten', icon: 'ship' },
  { id: 'galion', label: 'Galionsfiguren', icon: 'figurehead' },
  { id: 'flaggen', label: 'Flaggen & Segel', icon: 'flag' },
  { id: 'munition', label: 'Kanonen & Munition', icon: 'cannonball' },
];

/** Bildzeichen der Kartenvorschau (gezeichnet von ui/itemArt.ts) */
export type GlyphKind =
  | 'sword' | 'fist' | 'focus' | 'dagger' | 'shield' | 'helm' | 'shoulder' | 'chest' | 'cloak' | 'glove' | 'greave' | 'boot'
  | 'amulet' | 'flask' | 'ship' | 'figurehead' | 'fig_dragon' | 'fig_valkyrie' | 'fig_skull' | 'fig_griffin'
  | 'flag_totenkopf' | 'flag_krone' | 'flag_anker' | 'flag_welle' | 'flag_stern' | 'flag_marine'
  | 'sail' | 'cannonball' | 'cannon' | 'hull';

/** Vorschau-Zeichen einer Galionsfigur und einer Flagge (Katalog und Werft nutzen dieselben) */
export const figureheadGlyph = (id: FigureheadModelId): GlyphKind => ({ storm_dragon: 'fig_dragon', valkyrie: 'fig_valkyrie', leviathan_skull: 'fig_skull', royal_griffin: 'fig_griffin' } as const)[id];
export const flagGlyph = (id: FlagId): GlyphKind => `flag_${id}`;

export interface CatalogStat { label: string; value: string; good?: boolean }

/** Besitz: `owned` = gehört dem Spieler, `locked` = noch nicht, `free` = frei wählbar (Werft) */
export interface OwnState { state: 'owned' | 'locked' | 'free'; note?: string }

export interface CatalogEntry {
  /** eindeutig, z. B. `weapon:schwert:3`, `set:kette:head` */
  id: string;
  cat: CatalogCat;
  /** Untergruppe in der Anzeige (Platz, Set, Linie) */
  group: string;
  name: string;
  rarity: Rarity;
  glyph: GlyphKind;
  /** Farben der Vorschau (Haupt- und Zierfarbe) */
  color: string;
  color2?: string;
  desc: string;
  stats: CatalogStat[];
  /** Woher man es bekommt */
  origin: string;
  /** Beute der Raid-Endbosse */
  raid?: boolean;
  faction?: FactionId;
  /** Besitz im Spielstand (ohne Spielstand: unbekannt) */
  own?: (s: SaveData) => OwnState;
}

const rank = (r: number) => `${RANKS.pirat[r]} · ${RANKS.marine[r]}`;
const price = (p: number) => `${fmtInt(p)} Gold`;
const x = (v: number) => `×${fmtNum(v, 2)}`;
const has = (list: readonly string[] | undefined, id: string): OwnState => ({ state: list?.includes(id) ? 'owned' : 'locked' });
const SLOT_GLYPH: Record<GearCat, GlyphKind> = { head: 'helm', shoulder: 'shoulder', chest: 'chest', cloak: 'cloak', hands: 'glove', legs: 'greave', feet: 'boot', mainhand: 'sword', offhand: 'dagger' };
const GEAR_GLYPH: Record<GearSlot, GlyphKind> = { hands: 'glove', legs: 'greave', feet: 'boot', offhand: 'shield' };
/** Seltenheit der Waffen- und Rüstungsstufen (Stufe 0 = Ausgangsstück) */
const TIER_RARITY: Rarity[] = ['gewoehnlich', 'gewoehnlich', 'selten', 'episch', 'episch', 'legendaer'];

function build(): CatalogEntry[] {
  const out: CatalogEntry[] = [];

  // ---------- Waffen: drei Linien je Kampfstil, sechs Stufen ----------
  for (const style of ['schwert', 'faust', 'effekt'] as const) {
    const line = WEAPON_LINES[style];
    WEAPONS.forEach((w, i) => out.push({
      id: `weapon:${style}:${i}`, cat: 'waffen', group: line.title, name: line.names[i] ?? w.n, rarity: TIER_RARITY[i] ?? 'legendaer',
      glyph: style === 'faust' ? 'fist' : style === 'effekt' ? 'focus' : 'sword', color: w.col, color2: w.glow ? '#fff3c8' : undefined,
      desc: line.flavor,
      stats: [{ label: 'Wirkung', value: line.stat(w, i).replace(/ · leuchtet$/, ''), good: true }, ...(w.glow ? [{ label: 'Besonderheit', value: 'leuchtet' }] : []), { label: 'Stufe', value: `${i + 1} von ${WEAPONS.length}` }, { label: 'Benötigter Rang', value: rank(w.rank) }, { label: 'Preis', value: i === 0 ? 'Ausgangswaffe' : price(w.price) }],
      origin: i === 0 ? 'Jeder Kämpfer beginnt mit dieser Stufe.' : 'Schmiede von Ankerglück (Grete Amboss); der alte Kauf wird zur Hälfte angerechnet.',
      own: (s) => (s.player.style === style ? { state: s.gear.weapon >= i ? 'owned' : 'locked' } : { state: 'locked', note: 'anderer Kampfstil' }),
    }));
  }

  // ---------- Rüstungsstufen, Kopfbedeckungen, Schienen, Stiefel und Schilde ----------
  ARMOR.forEach((a, i) => out.push({
    id: `armor:${i}`, cat: 'ruestung', group: 'Rüstungsstufen', name: a.n, rarity: TIER_RARITY[i] ?? 'legendaer', glyph: 'chest', color: '#8AA0B8',
    desc: `Rüstungsstufe ${i + 1}: schwerer wird der Stoff, tiefer die Verteidigung.`,
    stats: [{ label: 'Leben', value: `+${a.hp}`, good: true }, { label: 'Benötigter Rang', value: rank(a.rank) }, { label: 'Preis', value: i === 0 ? 'Ausgangsstück' : price(a.price) }],
    origin: i === 0 ? 'Jeder Kämpfer beginnt mit dieser Stufe.' : 'Schmiede von Ankerglück (Grete Amboss).',
    own: (s) => ({ state: s.gear.armor >= i ? 'owned' : 'locked' }),
  }));
  for (const h of HEADS) out.push({
    id: `head:${h.id}`, cat: 'ruestung', group: 'Kopfbedeckungen', name: h.n, rarity: h.rarity, glyph: 'helm', color: h.color,
    desc: h.d,
    stats: [{ label: 'Leben', value: `+${h.hp}`, good: true }, ...(h.reduce ? [{ label: 'Schadensminderung', value: fmtPct(h.reduce) }] : []), ...(h.crit ? [{ label: 'Volltreffer', value: `+${fmtPct(h.crit)}` }] : []), { label: 'Benötigter Rang', value: rank(h.rank) }, { label: 'Preis', value: price(h.price) }],
    origin: 'Markt von Ankerglück.', own: (s) => has(s.gear.heads, h.id),
  });
  for (const g of GEAR) out.push({
    id: `piece:${g.id}`, cat: 'ruestung', group: 'Schienen, Stiefel und Schilde', name: g.n, rarity: g.rarity, glyph: GEAR_GLYPH[g.slot], color: g.shield ?? g.shoesColor ?? '#9aa4ae',
    desc: g.d,
    stats: [{ label: 'Leben', value: `+${g.hp}`, good: true }, ...(g.reduce ? [{ label: 'Schadensminderung', value: fmtPct(g.reduce) }] : []), ...(g.crit ? [{ label: 'Volltreffer', value: `+${fmtPct(g.crit)}` }] : []), { label: 'Benötigter Rang', value: rank(g.rank) }, { label: 'Preis', value: price(g.price) }],
    origin: 'Markt von Ankerglück.', own: (s) => has(s.gear.owned, g.id),
  });

  // ---------- Rüstungssets (Beute und Ausrüster) und die Beute der Endbosse ----------
  for (const d of GEAR_CATALOG) {
    const set = GEAR_SET_BY_ID[d.set!];
    const cat = d.cat!;
    const weapon = cat === 'mainhand' || cat === 'offhand';
    const boss = Object.values(RAID_BOSSES).find((b) => `boss_${b.factionId}` === set.id);
    const citadel = boss ? CITADELS.find((c) => c.factionId === boss.factionId) : null;
    const sold = !set.raid && (set.rarity === 'gewoehnlich' || set.rarity === 'selten');
    out.push({
      id: `set:${d.id}`, cat: weapon ? 'waffen' : 'ruestung', group: `${set.n} · ${CAT_LABEL[cat]}`, name: d.n, rarity: set.rarity, glyph: SLOT_GLYPH[cat],
      color: d.palette?.[0] ?? '#8a8f96', color2: d.palette?.[1],
      desc: set.d,
      stats: [
        ...bonusRows(d.bonus ?? {}).map((r) => ({ label: r.label, value: r.value, good: true })),
        { label: 'Set', value: set.n },
        { label: 'Setbonus (3 Teile)', value: bonusRows(set.bonus3).map((r) => `${r.value} ${r.label}`).join(', ') || '–' },
        { label: 'Set komplett', value: bonusRows(set.bonusAll).map((r) => `${r.value} ${r.label}`).join(', ') || '–' },
        { label: 'Stufe', value: String(d.level ?? 1) },
        ...(sold ? [{ label: 'Preis', value: price(d.price ?? 0) }] : []),
      ],
      origin: boss ? `Raid-Endboss ${boss.name} (${boss.title})${citadel ? ` · Festung ${citadel.name}` : ''}. Jeder Teilnehmer würfelt seine eigene Beute.` : sold ? 'Ausrüster im Markt von Ankerglück oder Beute besiegter Gegner.' : 'Nur als Beute: Eliten, Bosse und Weltereignisse lassen es fallen.',
      raid: !!boss, faction: boss?.factionId,
      own: (s) => ({ state: (s.gear.loot ?? []).includes(d.id) || (s.progress.unlocks?.bossLoot ?? []).includes(d.id) ? 'owned' : 'locked' }),
    });
  }

  // ---------- Talismane ----------
  const TRINKET_STATS: Record<string, string> = { atk: 'Angriff', hp: 'Leben', gold: 'Gold', faji: 'Faji-Erholung', crit: 'Volltreffer', cannon: 'Kanonenschaden', speed: 'Tempo auf See' };
  for (const t of TRINKETS) out.push({
    id: `trinket:${t.id}`, cat: 'talismane', group: RARITY[t.rarity].n, name: t.n, rarity: t.rarity, glyph: 'amulet', color: RARITY[t.rarity].col,
    desc: 'Ein Talisman kann angelegt sein und gibt seinen Bonus, solange er getragen wird.',
    stats: Object.entries(t.bonus).map(([k, v]) => ({ label: TRINKET_STATS[k] ?? k, value: `+${fmtPct(v!)}`, good: true })),
    origin: 'Beute von Legenden, Bossen, Ruinen, Geisterschiffen und Schätzen.', own: (s) => has(s.gear.trinkets, t.id),
  });

  // ---------- Verbrauchsgüter ----------
  for (const c of CONSUMABLES) out.push({
    id: `item:${c.id}`, cat: 'verbrauch', group: c.repair ? 'Schiffsbedarf' : c.buff ? 'Stärkungen' : 'Speisen und Tränke', name: c.n, rarity: c.rarity, glyph: 'flask', color: c.color,
    desc: c.d,
    stats: [
      ...(c.heal ? [{ label: 'Heilung', value: fmtPct(c.heal), good: true }] : []),
      ...(c.faji ? [{ label: 'Faji', value: `+${fmtPct(c.faji)}`, good: true }] : []),
      ...(c.buff ? [{ label: 'Dauer', value: `${c.buff.dur} s` }] : []),
      { label: 'Abklingzeit', value: c.cd > 0 ? `${c.cd} s` : 'keine' }, { label: 'Höchstzahl', value: String(c.max) }, { label: 'Preis', value: price(c.price) },
    ],
    origin: 'Markt von Ankerglück (Schnellleiste: Tasten 1–4).',
    own: (s) => { const n = itemCount(s.gear, c.id); return { state: n > 0 ? 'owned' : 'locked', note: n > 0 ? `${n} im Beutel` : undefined }; },
  });

  // ---------- Schiffe und Ausbauten ----------
  SHIP_CLASSES.forEach((c, i) => out.push({
    id: `ship:${c.id}`, cat: 'schiff', group: 'Schiffsklassen', name: c.n, rarity: RARITIES[Math.min(3, Math.floor(i / 2))], glyph: 'ship', color: '#a8794a',
    desc: c.desc,
    stats: [{ label: 'Rumpf', value: fmtInt(c.hp), good: true }, { label: 'Kanonen je Seite', value: String(c.can) }, { label: 'Tempo', value: String(c.spd) }, { label: 'Seeleute', value: String(c.crew) }, { label: 'Offiziere', value: String(officerSlots(i)) }, ...(troopCapacity(i) > 0 ? [{ label: 'Truppen', value: String(troopCapacity(i)) }] : []), { label: 'Länge', value: `${c.L} m` }, { label: 'Benötigter Rang', value: rank(c.rank) }, { label: 'Preis', value: c.price ? price(c.price) : 'Startschiff' }],
    origin: 'Werft; ein gekauftes Schiff kann jederzeit gewechselt werden.',
    own: (s) => ({ state: s.ship.owned.includes(i) ? 'owned' : 'locked', note: s.ship.tier === i ? 'Flaggschiff' : undefined }),
  }));
  for (const id of SHIP_UPGRADE_IDS) out.push({
    id: `upgrade:${id}`, cat: 'schiff', group: 'Ausbauten der Werft', name: SHIP_UPGRADES[id].n, rarity: id === 'can' ? 'selten' : 'gewoehnlich', glyph: id === 'can' ? 'cannon' : id === 'hull' ? 'hull' : 'sail', color: id === 'can' ? '#6a6a72' : id === 'hull' ? '#a86a35' : '#e8dcc0',
    desc: `Bis zu ${SHIP_UPGRADE_MAX} Stufen: je Stufe ${upgradeEffectText(id)}.`,
    stats: [{ label: 'Wirkung je Stufe', value: upgradeEffectText(id), good: true }, { label: 'Höchststufe', value: String(SHIP_UPGRADE_MAX) }, { label: 'Gesamt', value: `+${Math.round(SHIP_UPGRADES[id].perLevel * SHIP_UPGRADE_MAX * 100)} %`, good: true }],
    origin: 'Werft: Preis steigt mit Stufe und Schiffsklasse.',
    own: (s) => ({ state: s.ship.up[id] > 0 ? 'owned' : 'locked', note: `Stufe ${s.ship.up[id]} von ${SHIP_UPGRADE_MAX}` }),
  });

  // ---------- Galionsfiguren ----------
  for (const id of FIGUREHEAD_MODELS) {
    const d = FIGUREHEAD_DEFS[id];
    out.push({
      id: `figurehead:${id}`, cat: 'galion', group: 'Galionsfiguren', name: d.name, rarity: d.rarity, glyph: figureheadGlyph(id), color: '#d7ae52', color2: '#7a4a22',
      desc: d.desc,
      stats: [{ label: 'Edelstein-Augen', value: `ab ${d.gemGlowFrom} m Schiffslänge`, good: true }, { label: 'Auswahl', value: 'Werft · Aussehen' }],
      origin: 'Werft: für jedes Schiff frei wählbar.', own: () => ({ state: 'free' }),
    });
  }

  // ---------- Flaggen, Fraktions-Segel und -Zier ----------
  for (const id of Object.keys(FLAGS) as FlagId[]) out.push({
    id: `flag:${id}`, cat: 'flaggen', group: 'Flaggen', name: FLAGS[id], rarity: 'gewoehnlich', glyph: flagGlyph(id), color: '#1E1A20', color2: '#F3E6C8',
    desc: FLAG_DESC[id], stats: [{ label: 'Farbe', value: 'frei wählbar' }], origin: 'Werft: für jedes Schiff frei wählbar.', own: () => ({ state: 'free' }),
  });
  for (const f of FACTION_IDS) {
    const F = FACTIONS[f];
    const boss = RAID_BOSSES[f];
    const citadel = CITADELS.find((c) => c.id === boss.islandId);
    const where = `Raid-Belagerung von ${citadel?.name ?? boss.islandId} (${boss.name})`;
    out.push({
      id: `sail:${f}`, cat: 'flaggen', group: 'Fraktions-Segel (Beute)', name: `Segel: ${F.name}`, rarity: 'legendaer', glyph: 'sail', color: F.ship.sail, color2: F.palette.primary,
      desc: `Segeltuch der ${F.adjective}en Flotte mit Wappen und Muster – erbeutet und für immer dein.`,
      stats: [{ label: 'Muster', value: F.ship.pattern }, { label: 'Dauerhaft', value: 'ja', good: true }], origin: `${where}. Mit „Eigene Flagge“ wieder ablegbar.`,
      raid: true, faction: f, own: (s) => has(s.progress.unlocks?.sails, `sail_${f}`),
    });
    out.push({
      id: `ornament:${f}`, cat: 'flaggen', group: 'Fraktions-Zier (Beute)', name: `Zier: ${F.name}`, rarity: 'legendaer', glyph: 'figurehead', color: F.palette.accent, color2: F.ship.hull,
      desc: `Galionsfigur und Zierstreifen der ${F.adjective}en Flotte – ein Siegespreis für den Bug.`,
      stats: [{ label: 'Dauerhaft', value: 'ja', good: true }], origin: `${where}.`,
      raid: true, faction: f, own: (s) => has(s.progress.unlocks?.ornaments, `ornament_${f}`),
    });
  }

  // ---------- Munition ----------
  for (const id of AMMO_IDS) {
    const a = AMMO[id];
    out.push({
      id: `ammo:${id}`, cat: 'munition', group: 'Kanonenmunition', name: a.n, rarity: id === 'kugel' ? 'gewoehnlich' : id === 'brand' ? 'episch' : 'selten', glyph: 'cannonball', color: a.color, color2: id === 'brand' ? '#ff7a2a' : undefined,
      desc: a.d,
      stats: [{ label: 'Rumpfschaden', value: x(a.hull) }, { label: 'Segelschaden', value: x(a.sail) }, { label: 'Crewschaden', value: x(a.crew) }, ...(a.fire ? [{ label: 'Feuer', value: 'setzt in Brand', good: true }] : []), { label: 'Reichweite', value: x(a.range) }, { label: 'Geschossgeschwindigkeit', value: x(a.speed) }],
      origin: 'Immer an Bord: Wechsel mit Taste U oder in der Schiffstafel.', own: () => ({ state: 'free' }),
    });
  }

  return out;
}

let cache: CatalogEntry[] | null = null;
/** Alle Einträge (einmal gebaut) */
export function catalog(): readonly CatalogEntry[] {
  return (cache ??= build());
}

export interface CatalogFilter { cat?: CatalogCat | 'all' | 'raid'; rarity?: Rarity | 'all'; query?: string }

const fold = (s: string) => s.toLocaleLowerCase('de-DE').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

/** Einträge nach Reiter, Seltenheit und Suchtext (Name, Gruppe, Beschreibung, Herkunft) */
export function filterCatalog(list: readonly CatalogEntry[], f: CatalogFilter): CatalogEntry[] {
  const q = fold(f.query?.trim() ?? '');
  return list.filter((e) => {
    if (f.cat === 'raid' ? !e.raid : f.cat && f.cat !== 'all' && e.cat !== f.cat) return false;
    if (f.rarity && f.rarity !== 'all' && e.rarity !== f.rarity) return false;
    return !q || fold(`${e.name} ${e.group} ${e.desc} ${e.origin}`).includes(q);
  });
}
