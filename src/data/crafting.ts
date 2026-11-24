// Zugang zu Ausrüstung: Kauf-Tore (Rang, Ansehen, nicht käuflich) und das Boss-Siegel-Schmieden der Stufe 5. Reine Daten und Regeln ohne
// three.js und ohne Spielzustand: das Spiel (`Game`) und die Oberfläche fragen DIESELBEN Funktionen, damit niemand über eine Lücke zwischen
// Anzeige und Logik an Endgame-Ausrüstung kommt.
import { BOSS_DROP_CHANCE, TIER_DEFS, craftCost, tierOfRank, type Tier } from './balanceConfig';
import type { FactionId } from './factions';

export const SHARD_NAME = 'Relikt-Splitter';

/** Siegel und Material (liegen in `progress.unlocks`, überleben jede Rückeroberung) */
export interface SealPurse { seals: Partial<Record<FactionId, number>>; shards: number }
export const sealsOf = (p: SealPurse, f: FactionId) => Math.max(0, Math.floor(p.seals[f] ?? 0));
export const sealTotal = (p: SealPurse) => Object.values(p.seals).reduce<number>((a, b) => a + Math.max(0, Math.floor(b ?? 0)), 0);

// ---------- Kauf-Tore ----------

export type GateReason =
  | { ok: true }
  | { ok: false; kind: 'rank'; needRank: number }
  | { ok: false; kind: 'rep'; needStanding: number }
  | { ok: false; kind: 'beute' }
  | { ok: false; kind: 'siegel' };

export interface GateInput {
  /** Stufe des Stücks (1 … 5) und sein eigener Mindestrang (Index in FAME_THRESHOLDS) */
  tier: Tier;
  rank?: number;
  /** Rang des Spielers (Index) */
  playerRank: number;
  /** Ansehen beim Hafen, in dem gekauft wird; ohne Hafenmacht (Ankerglück, freie Märkte) das beste Ansehen bei irgendeiner Macht */
  standing: number;
}

/**
 * Darf dieses Stück im Laden gekauft werden? Stufe 4 und 5 sind nie käuflich (Beute bzw. Siegel-Schmiede). Stufe 3 braucht den Rang der
 * Stufe und Ansehen „Freundlich“ beim Hafen. Der Mindestrang eines Stücks gilt zusätzlich.
 */
export function shopGate(i: GateInput): GateReason {
  if (i.tier >= 5) return { ok: false, kind: 'siegel' };
  if (i.tier >= 4) return { ok: false, kind: 'beute' };
  const need = Math.max(i.rank ?? 0, TIER_DEFS[i.tier].rankMin);
  if (i.playerRank < need) return { ok: false, kind: 'rank', needRank: need };
  const rep = TIER_DEFS[i.tier].repMin;
  if (rep !== null && rep > 0 && i.standing < rep) return { ok: false, kind: 'rep', needStanding: rep };
  return { ok: true };
}

// ---------- Boss-Siegel-Schmiede ----------

export type BossSlot = keyof typeof BOSS_DROP_CHANCE;
export const BOSS_SLOTS = Object.keys(BOSS_DROP_CHANCE) as BossSlot[];

export interface Recipe { itemId: string; factionId: FactionId; slot: BossSlot; seals: number; shards: number; gold: number; honor: number; rank: number }

/** Rezept eines Boss-Stücks (`boss_england_head`), oder null, wenn die Kennung kein Boss-Stück ist */
export function recipeOf(itemId: string): Recipe | null {
  const m = /^boss_([a-z]+)_([a-z]+)$/.exec(itemId);
  if (!m) return null;
  const slot = m[2] as BossSlot;
  if (!(slot in BOSS_DROP_CHANCE)) return null;
  return { itemId, factionId: m[1] as FactionId, slot, ...craftCost(slot), rank: TIER_DEFS[5].rankMin };
}

/** Rezept der Stufe-5-Waffe der Waffenlinie: Siegel beliebiger Mächte */
export const WEAPON_RECIPE = { seals: 6, shards: 6, gold: 11000, rank: TIER_DEFS[5].rankMin } as const;

/** Werft-Ausbau der letzten Stufe (5): Siegel beliebiger Mächte und Splitter zusätzlich zum Goldpreis; Stufe 4 braucht Rang 7 und Ansehen „Verbündet“ */
export const UPGRADE_RECIPE = { seals: 3, shards: 3, rank: TIER_DEFS[5].rankMin, rank4: TIER_DEFS[4].rankMin, standing4: 40 } as const;

export interface CraftCtx { gold: number; playerRank: number; honor: number; purse: SealPurse; owned: boolean }
export type CraftResult = { ok: true } | { ok: false; reason: string };

/** Fehlt etwas? Liefert den ersten Grund (Text für Anzeige und Meldung) */
export function craftCheck(r: Recipe, c: CraftCtx): CraftResult {
  if (c.owned) return { ok: false, reason: 'Du besitzt dieses Stück schon.' };
  if (c.playerRank < r.rank) return { ok: false, reason: 'Relikte schmiedet nur, wer den höchsten Rang trägt.' };
  if (c.honor < r.honor) return { ok: false, reason: `Die Macht schmiedet nur für Verdiente: Ehre ${r.honor} nötig.` };
  const have = sealsOf(c.purse, r.factionId);
  if (have < r.seals) return { ok: false, reason: `Es fehlen ${r.seals - have} Siegel dieser Macht.` };
  if (c.purse.shards < r.shards) return { ok: false, reason: `Es fehlen ${r.shards - c.purse.shards} ${SHARD_NAME}.` };
  if (c.gold < r.gold) return { ok: false, reason: `Dafür fehlen ${r.gold - c.gold} Gold.` };
  return { ok: true };
}

/** Siegel, Splitter und Gold abziehen (nur nach bestandener Prüfung) */
export function payRecipe(r: Recipe, purse: SealPurse): void {
  purse.seals[r.factionId] = sealsOf(purse, r.factionId) - r.seals;
  purse.shards -= r.shards;
}

export function weaponCraftCheck(c: { gold: number; playerRank: number; purse: SealPurse; owned: boolean }): CraftResult {
  const w = WEAPON_RECIPE;
  if (c.owned) return { ok: false, reason: 'Du besitzt diese Waffe schon.' };
  if (c.playerRank < w.rank) return { ok: false, reason: 'Relikte schmiedet nur, wer den höchsten Rang trägt.' };
  const total = sealTotal(c.purse);
  if (total < w.seals) return { ok: false, reason: `Es fehlen ${w.seals - total} Boss-Siegel.` };
  if (c.purse.shards < w.shards) return { ok: false, reason: `Es fehlen ${w.shards - c.purse.shards} ${SHARD_NAME}.` };
  if (c.gold < w.gold) return { ok: false, reason: `Dafür fehlen ${w.gold - c.gold} Gold.` };
  return { ok: true };
}

/** Siegel beliebiger Mächte bezahlen: zuerst die häufigste, damit die Reihenfolge nicht vom Zufall abhängt */
export function payWeapon(purse: SealPurse): void { paySeals(purse, WEAPON_RECIPE.seals, WEAPON_RECIPE.shards); }
export function paySeals(purse: SealPurse, seals: number, shards: number): void {
  let left = seals;
  const order = (Object.keys(purse.seals) as FactionId[]).sort((a, b) => sealsOf(purse, b) - sealsOf(purse, a) || (a < b ? -1 : 1));
  for (const f of order) {
    const take = Math.min(left, sealsOf(purse, f));
    purse.seals[f] = sealsOf(purse, f) - take;
    left -= take;
    if (left <= 0) break;
  }
  purse.shards -= shards;
}

/** Rang → Stufe (für die Anzeige „Rang X nötig“) */
export const tierOfPlayerRank = tierOfRank;
