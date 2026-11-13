import { PLAYER_BASE } from '../data/combat';
import { ARMOR, WEAPONS } from '../data/regions';
import { BAR_SLOTS, CONSUMABLE_BY_ID, GEAR_BY_ID, GEAR_SLOTS, HEAD_BY_ID, type ConsumableDef, type GearDef, type HeadDef } from '../data/items';
import { TRINKET_BY_ID } from '../data/trinkets';
import type { GearState } from './save/types';
import { ensureLoot, lootBonus } from './gearBag';

/** Fehlende Felder alter Spielstände füllen (nichts geht verloren, keine Migration nötig) */
export function ensureGear(g: GearState): void {
  g.items ??= {};
  g.heads ??= [];
  if (g.head === undefined) g.head = null;
  g.owned ??= [];
  g.worn ??= {};
  ensureLoot(g);
  if (!g.bar || g.bar.length !== BAR_SLOTS) g.bar = Array.from({ length: BAR_SLOTS }, (_, i) => g.bar?.[i] ?? (i === 0 ? 'proviant' : null));
}

/** Angelegte Waffen- und Rüstungsstufe: höchstens die höchste gekaufte */
export const weaponEq = (g: GearState) => Math.min(g.weapon, g.weaponEq ?? g.weapon);
export const armorEq = (g: GearState) => Math.min(g.armor, g.armorEq ?? g.armor);
export const headEq = (g: GearState): HeadDef | null => (g.head ? HEAD_BY_ID[g.head] ?? null : null);
/** Angelegte Ausrüstungsstücke (Hände, Beine, Füße, Nebenhand) */
export function wornGear(g: GearState): GearDef[] {
  const out: GearDef[] = [];
  for (const s of GEAR_SLOTS) { const id = g.worn?.[s]; const d = id ? GEAR_BY_ID[id] : null; if (d && d.slot === s) out.push(d); }
  return out;
}

/** Anzahl eines Verbrauchsguts (Proviant liegt in gear.potions) */
export function itemCount(g: GearState, id: string): number {
  return id === 'proviant' ? g.potions : g.items?.[id] ?? 0;
}

/** Legt Stück ins Inventar, höchstens bis zur Obergrenze; liefert, wie viele hineinpassten */
export function addItem(g: GearState, id: string, n = 1): number {
  const def = CONSUMABLE_BY_ID[id];
  if (!def) return 0;
  const room = Math.max(0, def.max - itemCount(g, id));
  const add = Math.min(n, room);
  if (add <= 0) return 0;
  if (id === 'proviant') g.potions += add;
  else { g.items ??= {}; g.items[id] = (g.items[id] ?? 0) + add; }
  return add;
}

export function takeItem(g: GearState, id: string): boolean {
  if (itemCount(g, id) <= 0) return false;
  if (id === 'proviant') g.potions--;
  else { g.items![id]--; if (g.items![id] <= 0) delete g.items![id]; }
  return true;
}

/** Verbrauchsgüter im Beutel (Anzahl > 0), in Katalogreihenfolge */
export function bagConsumables(g: GearState): { def: ConsumableDef; n: number }[] {
  return Object.values(CONSUMABLE_BY_ID).map((def) => ({ def, n: itemCount(g, def.id) })).filter((x) => x.n > 0);
}

/** Werte, die Ausrüstung und Stärkungen zur Spielfigur beitragen */
export interface StatSheet {
  hp: number;
  atk: number;
  /** Volltreffer-Chance 0 … 1 */
  crit: number;
  /** Schadensminderung durch Ausrüstung und Stärkungen 0 … 1 (ohne Faji-Passive) */
  reduce: number;
  /** Zusatz-Erholung des Faji (Anteil) */
  fajiRegen: number;
  /** Goldbonus (Anteil) */
  gold: number;
}

export interface StatInput {
  level: number;
  gear: GearState;
  style: string;
  /** Faji-Passiv: Lebensbonus (Anteil), Volltreffer */
  hpPassive: number;
  critPassive: number;
  /** Crew-Boni */
  atkCrew: number;
  weaponCrew: number;
  fajiCrew: number;
  /** Laufende Stärkungen */
  buff: { atk: number; reduce: number; crit: number };
}

/** Eine Stelle für alle Werte: das Inventar zeigt sie an, applyPower wendet sie an – so stimmt beides immer überein. */
export function computeStats(i: StatInput): StatSheet {
  const g = i.gear;
  const armor = ARMOR[armorEq(g)]?.hp ?? 0;
  const weapon = WEAPONS[weaponEq(g)]?.dmg ?? 0;
  const head = headEq(g);
  const tb = (g.trinket ? TRINKET_BY_ID[g.trinket]?.bonus : null) ?? {};
  const wi = weaponEq(g);
  let gearHp = 0, gearCrit = 0, gearReduce = 0;
  for (const d of wornGear(g)) { gearHp += d.hp; gearCrit += d.crit ?? 0; gearReduce += d.reduce ?? 0; }
  const lb = lootBonus(g);
  return {
    hp: (PLAYER_BASE.hp(i.level) + armor + (head?.hp ?? 0) + gearHp + (lb.hp ?? 0)) * (1 + i.hpPassive) * (1 + (tb.hp ?? 0)),
    atk: (PLAYER_BASE.atk(i.level) + weapon * 0.5 * i.weaponCrew) * i.atkCrew * (1 + (tb.atk ?? 0) + (lb.atk ?? 0)) * (1 + i.buff.atk),
    crit: 0.1 + i.critPassive + (tb.crit ?? 0) + (head?.crit ?? 0) + gearCrit + (lb.crit ?? 0) + i.buff.crit + (i.style === 'faust' ? wi * 0.02 : 0),
    reduce: Math.min(0.75, (head?.reduce ?? 0) + gearReduce + (lb.reduce ?? 0) + i.buff.reduce),
    fajiRegen: i.fajiCrew + (tb.faji ?? 0) + (lb.faji ?? 0) + (i.style === 'effekt' ? wi * 0.05 : 0),
    gold: (tb.gold ?? 0) + (lb.gold ?? 0),
  };
}
