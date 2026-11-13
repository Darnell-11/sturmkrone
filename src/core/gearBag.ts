// Beute-Ausrüstung im Spielstand: besessene Stücke, angelegte je Platz, Farben, Werte und Setbonus.
// Die Stücke selbst stehen in data/gear.ts, ihr Aussehen in data/equipment.ts.
import { CAT_LABEL, EQUIP_BY_ID, GEAR_CATS, catOf, type EquipDef, type GearBonus, type GearCat } from '../data/equipment';
import { GEAR_SET_BY_ID, SETS } from '../data/gear';
import { RARITIES } from '../data/loot';
import type { Rarity } from '../data/trinkets';
import type { GearState } from './save/types';

export { CAT_LABEL };

/** Fehlende Felder alter Spielstände füllen */
export function ensureLoot(g: GearState): void {
  g.loot ??= [];
  g.outfit ??= {};
  g.dyes ??= {};
}

/** Das Stück mit dieser ID (nur Beute-Ausrüstung eines Sets) */
export const lootDef = (id: string | null | undefined): EquipDef | null => {
  const d = id ? EQUIP_BY_ID[id] : undefined;
  return d?.set ? d : null;
};

/** Angelegte Beute-Stücke (höchstens eines je Platz) */
export function wornLoot(g: GearState): EquipDef[] {
  const out: EquipDef[] = [];
  for (const c of GEAR_CATS) {
    const id = g.outfit?.[c];
    const d = lootDef(id);
    if (d && g.loot?.includes(d.id) && catOf(d) === c) out.push(d);
  }
  return out;
}

/** Wie viele Stücke eines Sets liegen im Beutel / sind angelegt */
export const setCount = (setId: string, ids: readonly string[]) => ids.filter((i) => EQUIP_BY_ID[i]?.set === setId).length;

/** Setbonus für die angelegten Stücke: ab drei der kleine, bei allen der große (ersetzt den kleinen) */
export function setBonuses(worn: readonly EquipDef[]): { set: string; n: number; total: number; bonus: GearBonus | null }[] {
  const counts = new Map<string, number>();
  for (const d of worn) if (d.set) counts.set(d.set, (counts.get(d.set) ?? 0) + 1);
  return [...counts].map(([id, n]) => {
    const set = GEAR_SET_BY_ID[id];
    const total = Object.keys(set.pieces).length;
    return { set: id, n, total, bonus: n >= total ? set.bonusAll : n >= 3 ? set.bonus3 : null };
  });
}

function add(a: GearBonus, b: GearBonus) {
  for (const k of Object.keys(b) as (keyof GearBonus)[]) a[k] = (a[k] ?? 0) + (b[k] ?? 0);
}

/** Summe aller Werte der angelegten Beute-Ausrüstung samt Setbonus */
export function lootBonus(g: GearState): GearBonus {
  const worn = wornLoot(g);
  const out: GearBonus = {};
  for (const d of worn) if (d.bonus) add(out, d.bonus);
  for (const s of setBonuses(worn)) if (s.bonus) add(out, s.bonus);
  return out;
}

/** Zeile „Set: Eisenwall (3/7)“ für ein Stück */
export function setLine(d: EquipDef, g: GearState): string {
  if (!d.set) return '';
  const set = GEAR_SET_BY_ID[d.set];
  const total = Object.keys(set.pieces).length;
  const have = wornLoot(g).filter((w) => w.set === d.set).length;
  return `Set: ${set.n} (${have}/${total} angelegt)`;
}

/** Anlegen: ersetzt das Stück auf dem Platz und räumt den gleichen Platz der alten Ausrüstung (Kopfbedeckung, Schienen, Stiefel) */
export function wearLoot(g: GearState, id: string | null, cat?: GearCat): void {
  ensureLoot(g);
  const d = lootDef(id);
  const c = d ? catOf(d) : cat;
  if (!c) return;
  g.outfit![c] = d && g.loot!.includes(d.id) ? d.id : null;
  if (d) clearOld(g, c);
}

/** Alte Ausrüstung (Kopfbedeckung, Hände, Beine, Füße) auf diesem Platz ablegen – damit nichts doppelt zählt */
export function clearOld(g: GearState, cat: GearCat): void {
  if (cat === 'head') g.head = null;
  else if (cat === 'hands' || cat === 'legs' || cat === 'feet') { if (g.worn) g.worn[cat] = null; }
  else if (cat === 'offhand') { if (g.worn) g.worn.offhand = null; }
}

/** Beute-Stück zufällig würfeln: genau in der Seltenheit, nur Neues; Stufe nicht weit über dem Spieler */
export function rollLootGear(rarity: Rarity, level: number, owned: readonly string[], rnd: () => number = Math.random): EquipDef | null {
  const reach = level + (rarity === 'legendaer' ? 22 : rarity === 'episch' ? 14 : 8);
  const all = SETS.filter((s) => s.rarity === rarity).flatMap((s) => (Object.keys(s.pieces) as GearCat[]).map((c) => EQUIP_BY_ID[`${s.id}_${c}`]));
  const fresh = all.filter((d) => d && !owned.includes(d.id));
  const near = fresh.filter((d) => (d.level ?? 1) <= reach);
  const pool = near.length ? near : fresh;
  if (!pool.length) return null;
  // Stücke eines Sets, von dem schon etwas im Beutel liegt, sind etwas wahrscheinlicher (Sets vervollständigen)
  const w = pool.map((d) => 1 + (d.set && owned.some((o) => EQUIP_BY_ID[o]?.set === d.set) ? 1.5 : 0));
  let r = rnd() * w.reduce((a, b) => a + b, 0), i = 0;
  for (; i < pool.length - 1; i++) { if (r < w[i]) break; r -= w[i]; }
  return pool[i];
}

/** Ins Beutel legen; legt an, wenn der Platz leer ist oder das Stück seltener ist als das getragene */
export function grantLoot(g: GearState, d: EquipDef): boolean {
  ensureLoot(g);
  if (g.loot!.includes(d.id)) return false;
  g.loot!.push(d.id);
  const c = catOf(d);
  const cur = lootDef(g.outfit![c]);
  const better = !cur || RARITIES.indexOf(d.rarity ?? 'gewoehnlich') > RARITIES.indexOf(cur.rarity ?? 'gewoehnlich');
  if (better) wearLoot(g, d.id);
  return true;
}
