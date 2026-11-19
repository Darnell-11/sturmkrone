// Persönliche Raid-Beute: jeder Teilnehmer (`participantId` im `RaidPartyContext`) bekommt seine EIGENE, vorab festgelegte Beute – nichts wird
// geteilt, nichts würfelt gegen einen Mitspieler. Der Wurf ist deterministisch aus (Instanz, Teilnehmer, Boss): derselbe Spielstand liefert
// bei jedem Laden dieselbe Beute, und ein Server kann sie ohne Umbau erzeugen. Reine Daten und Rechnung ohne three.js.
import { FACTIONS, type FactionId } from '../data/factions';
import { GEAR_SET_BY_ID } from '../data/gear';
import type { Rarity } from '../data/rarity';
import { RAID_BOSSES } from './raidBosses';
import { hashString, mulberry32 } from './raidLayout';
import type { RaidPartyContext } from './raidTypes';

export type RaidLootKind = 'gold' | 'gear' | 'sail' | 'ornament' | 'xp';

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
 *  • ein garantiertes, neues Stück aus dem Boss-Set (erste Eroberung: zwei), danach je Sieg 55 % für ein weiteres,
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

  // Boss-Set: garantiert ein neues Stück, bei der ersten Eroberung zwei, danach 55 % für ein weiteres
  const set = bossSetId(f);
  const have = new Set(o.owned.gear);
  const missing = BOSS_PIECES.map((c) => `${set}_${c}`).filter((id) => !have.has(id) && hasPiece(f, id));
  const wanted = o.conquestsBefore === 0 ? 2 : rnd() < 0.55 ? 2 : 1;
  const picks: string[] = [];
  for (let i = 0; i < Math.min(wanted, missing.length); i++) picks.push(missing[i]);
  for (const id of picks) items.push({ kind: 'gear', id, label: pieceLabel(f, id), rarity: id.endsWith('_mainhand') || id.endsWith('_head') ? 'legendaer' : 'episch', fresh: true });
  if (!picks.length) items.push({ kind: 'gold', id: '', label: 'Beutemarken (Dublette)', rarity: 'episch', amount: Math.round(2200 * k), fresh: false });

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
