// Persönliche Raid-Beute: jeder Teilnehmer (`participantId` im `RaidPartyContext`) bekommt seine EIGENE, vorab festgelegte Beute – nichts wird
// geteilt, nichts würfelt gegen einen Mitspieler. Der Wurf ist deterministisch aus (Instanz, Teilnehmer, Boss): derselbe Spielstand liefert
// bei jedem Laden dieselbe Beute, und ein Server kann sie ohne Umbau erzeugen. Reine Daten und Rechnung ohne three.js.
import { FACTIONS, type FactionId } from '../data/factions';
import { GEAR_SET_BY_ID } from '../data/gear';
import { BOSS_DROP_CHANCE, SEAL_DROP } from '../data/balanceConfig';
import { SHARD_NAME } from '../data/crafting';
import type { Rarity } from '../data/rarity';
import { RAID_BOSSES } from './raidBosses';
import { hashString, mulberry32 } from './raidLayout';
import type { RaidPartyContext } from './raidTypes';

export type RaidLootKind = 'gold' | 'gear' | 'sail' | 'ornament' | 'xp' | 'seal' | 'shard';

export interface RaidLootItem {
  kind: RaidLootKind;
  /** Stück-ID (`boss_england_head`), Freischaltung (`sail:england`) oder leer (Gold, Erfahrung) */
  id: string;
  label: string;
  rarity: Rarity;
  amount?: number;
  /** Neu für diesen Spieler (sonst Dublette: wird zu Gold) */
  fresh: boolean;
}

export interface PersonalLoot {
  raidInstanceId: string;
  participantId: string;
  bossId: string;
  factionId: FactionId;
  items: RaidLootItem[];
}

/** Was der Spieler schon besitzt: Beute-Stücke, freigeschaltete Segel und Verzierungen (aus dem Spielstand) */
export interface LootOwned { gear: readonly string[]; sails: readonly string[]; ornaments: readonly string[] }

/** Beute-Set eines Bosses (data/gear.ts): Teile des Sets sind die Trophäen */
export const bossSetId = (f: FactionId) => `boss_${f}`;
/** Teile jedes Boss-Sets, in der Reihenfolge, in der sie zuerst fallen (Waffe und Kopf zuerst) */
export const BOSS_PIECES = ['mainhand', 'head', 'chest', 'shoulder', 'cloak', 'offhand'] as const;

export const sailId = (f: FactionId) => `sail:${f}`;
export const ornamentId = (f: FactionId) => `ornament:${f}`;

/** Wie die Beute gewichtet wird: Beitrag des Teilnehmers am Sieg (Schaden an Bauwerken, versenkte Schiffe, gefallene Gegner) */
export function contributionOf(ctx: RaidPartyContext, participantId: string): number {
  const score = (p: RaidPartyContext['participants'][number]) => p.structureDamage / 400 + p.shipsSunk * 6 + p.kills * 1.2;
  const all = ctx.participants.map(score);
  const total = all.reduce((a, b) => a + b, 0);
  const mine = ctx.participants.findIndex((p) => p.playerId === participantId);
  if (mine < 0) return 0;
  // wer da war, bekommt mindestens 60 % (Mitspieler gehen nie leer aus); der Rest folgt dem Beitrag
  return total <= 0 ? 1 : Math.min(1.25, 0.6 + 0.65 * (all[mine] / Math.max(...all, 1e-6)));
}

export interface LootRollOpts {
  ctx: RaidPartyContext;
  participantId: string;
  /** Stufe der Festung und Zahl der Eroberungen dieser Macht VOR diesem Sieg (0 = erste Eroberung) */
  level: number;
  conquestsBefore: number;
  owned: LootOwned;
  /** Erster Sieg über diesen Boss (voller Lohn) oder Wiederholung (halb) */
  firstClear: boolean;
}

/**
 * Die persönliche Beute eines Teilnehmers:
 *  • Gold und Erfahrung nach Beitrag,
 *  • je fehlendem Stück des Boss-Sets eine kleine Chance (8 – 15 %), dazu sicher Boss-Siegel und Relikt-Splitter zum Schmieden,
 *  • Fraktions-Segel bei der ersten Eroberung, Fraktions-Verzierung bei der zweiten; weitere Eroberungen: 25 % für noch Fehlendes (nie doppelt).
 * Alles Neue wird dauerhaft im Spielstand festgehalten (`progress.unlocks`) und geht bei einer Rückeroberung nie verloren.
 */
export function rollPersonalLoot(o: LootRollOpts): PersonalLoot {
  const f = o.ctx.factionId;
  const boss = RAID_BOSSES[f];
  const rnd = mulberry32(hashString(`${o.ctx.raidInstanceId}|${o.participantId}|${boss.id}`));
  const k = contributionOf(o.ctx, o.participantId);
  const items: RaidLootItem[] = [];
  const half = o.firstClear ? 1 : 0.5;
  items.push({ kind: 'gold', id: '', label: 'Beuteanteil', rarity: 'selten', amount: Math.round((1400 + o.level * 130) * k * half), fresh: true });
  items.push({ kind: 'xp', id: '', label: 'Erfahrung', rarity: 'gewoehnlich', amount: Math.round((500 + o.level * 70) * k * half), fresh: true });

  // Boss-Set: jedes noch fehlende Stück fällt mit seiner eigenen kleinen Chance (8 – 15 %, data/balanceConfig.ts BOSS_DROP_CHANCE).
  // Bad-Luck-Schutz: jeder Sieg gibt sicher Siegel dieser Macht und Relikt-Splitter; damit lässt sich jedes Stück gezielt schmieden (data/crafting.ts).
  const set = bossSetId(f);
  const have = new Set(o.owned.gear);
  const missing = BOSS_PIECES.map((c) => ({ c, id: `${set}_${c}` })).filter((x) => !have.has(x.id) && hasPiece(f, x.id));
  for (const x of missing) {
    if (rnd() < BOSS_DROP_CHANCE[x.c]) items.push({ kind: 'gear', id: x.id, label: pieceLabel(f, x.id), rarity: x.c === 'mainhand' || x.c === 'head' ? 'legendaer' : 'episch', fresh: true });
  }
  const seals = o.firstClear ? SEAL_DROP.first : SEAL_DROP.repeat;
  items.push({ kind: 'seal', id: `seal:${f}`, label: `Boss-Siegel von ${FACTIONS[f].name}`, rarity: 'episch', amount: seals, fresh: true });
  const shards = SEAL_DROP.shardsMin + Math.floor(rnd() * (SEAL_DROP.shardsMax - SEAL_DROP.shardsMin + 1));
  items.push({ kind: 'shard', id: 'shard', label: SHARD_NAME, rarity: 'selten', amount: shards, fresh: true });

  // Freischaltungen: Segel (1.), Verzierung (2.), danach 25 % für noch Fehlendes
  const wantSail = !o.owned.sails.includes(sailId(f)), wantOrn = !o.owned.ornaments.includes(ornamentId(f));
  const n = o.conquestsBefore + 1;
  if (wantSail && (n === 1 || (n > 2 && rnd() < 0.25))) items.push({ kind: 'sail', id: sailId(f), label: `Segel von ${FACTIONS[f].name}`, rarity: 'legendaer', fresh: true });
  if (wantOrn && (n === 2 || (n > 2 && rnd() < 0.25))) items.push({ kind: 'ornament', id: ornamentId(f), label: `Zier von ${FACTIONS[f].name}`, rarity: 'legendaer', fresh: true });
  return { raidInstanceId: o.ctx.raidInstanceId, participantId: o.participantId, bossId: boss.id, factionId: f, items };
}

function hasPiece(f: FactionId, id: string): boolean {
  const set = GEAR_SET_BY_ID[bossSetId(f)];
  if (!set) return false;
  return Object.keys(set.pieces).some((c) => `${set.id}_${c}` === id);
}

function pieceLabel(f: FactionId, id: string): string {
  const set = GEAR_SET_BY_ID[bossSetId(f)];
  const cat = id.slice(set?.id.length + 1);
  return (set?.pieces as Record<string, { n: string }> | undefined)?.[cat]?.n ?? id;
}

/** Für alle Teilnehmer, jeder mit eigener Beute (kein geteilter Wurf) */
export function rollRaidLoot(ctx: RaidPartyContext, o: Omit<LootRollOpts, 'ctx' | 'participantId'> & { ownedBy?: (participantId: string) => LootOwned }): PersonalLoot[] {
  return ctx.participants.map((p) => rollPersonalLoot({ ...o, ctx, participantId: p.playerId, owned: o.ownedBy ? o.ownedBy(p.playerId) : o.owned }));
}
