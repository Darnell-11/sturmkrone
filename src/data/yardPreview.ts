// Werft-Vorschau (Phase 4.2C): Vorher → Nachher-Vergleich der Ausbaustufen und Schiffsklassen sowie der Gesamtplan (Gold, Material, Siegel) bis zu einer
// gewählten Stufe. Rein und ohne three.js: die Werft-Oberfläche (`ui/menus.ts`) zeigt es, `core/game.ts` ergänzt Tarif, Tore und Sold.
import { hullArmorOf } from './balanceConfig';
import { UPGRADE_RECIPE } from './crafting';
import { officerSlots, troopCapacity } from './crewTiers';
import type { GoodId } from './economy';
import { EVO_MAX, activePorts, evoCost, evoMaterial, evoStats, type EvoBranch, type ShipEvolution } from './shipEvolution';
import { SHIP_CLASSES } from './ships';
import { ramDamage } from '../naval/ramming';

/** Eine Zeile des Vergleichs: `better` = 1 Verbesserung, −1 Verschlechterung, 0 gleich (für die Färbung) */
export interface CompareRow { label: string; from: string; to: string; better: 1 | 0 | -1 }

const pct = (k: number) => `${Math.round(k * 100)} %`;
const num = (a: number, b: number, fmt: (n: number) => string, label: string, higherBetter = true): CompareRow => {
  const better = a === b ? 0 : (b > a) === higherBetter ? 1 : -1;
  return { label, from: fmt(a), to: fmt(b), better };
};
const text = (label: string, a: string, b: string, rank: (s: string) => number): CompareRow => ({ label, from: a, to: b, better: rank(a) === rank(b) ? 0 : rank(b) > rank(a) ? 1 : -1 });

/** Rumpfpunkte eines Schiffs der Klasse mit diesen Ausbauten (ohne Zusatzboni der Crew) */
export const hullPointsOf = (classIndex: number, e: ShipEvolution): number => Math.round(SHIP_CLASSES[classIndex].hp * evoStats(e).hullHpK);

/** Stoß mit 11 m/s Annäherung: Schaden am Ziel und Eigenschaden des Rammers (vor Panzerung) */
const ramAt = (classIndex: number, e: ShipEvolution) => ramDamage(11, hullPointsOf(classIndex, e), e.hullTier);

/** Was ändert sich, wenn ein Zweig des Schiffs von `from` auf `to` wechselt: die Zeilen dieses Zweigs */
export function evoCompareRows(classIndex: number, branch: EvoBranch, from: ShipEvolution, to: ShipEvolution): CompareRow[] {
  const c = SHIP_CLASSES[classIndex], a = evoStats(from), b = evoStats(to);
  if (branch === 'hull') {
    const ra = ramAt(classIndex, from), rb = ramAt(classIndex, to);
    const ramTxt = (e: ShipEvolution) => (e.hullTier >= 5 ? 'panzerbrechend' : e.hullTier >= 4 ? 'ja' : 'nein');
    return [
      num(hullPointsOf(classIndex, from), hullPointsOf(classIndex, to), (n) => `${n}`, 'Rumpf-HP'),
      num(hullArmorOf(classIndex, from.hullTier), hullArmorOf(classIndex, to.hullTier), (n) => `${Math.round(n)}`, 'Panzerung'),
      text('Rammsporn', ramTxt(from), ramTxt(to), (s) => (s === 'nein' ? 0 : s === 'ja' ? 1 : 2)),
      num(Math.round(ra.target), Math.round(rb.target), (n) => `${n}`, 'Rammschaden'),
      num(Math.round(ra.self), Math.round(rb.self), (n) => `${n}`, 'Eigenschaden beim Rammen', false),
    ];
  }
  if (branch === 'sail') {
    return [
      num(a.sailHpK, b.sailHpK, pct, 'Segel-HP'),
      num(c.spd * a.speedK, c.spd * b.speedK, (n) => n.toFixed(1), 'Tempo'),
      num(a.turnK, b.turnK, pct, 'Wendigkeit'),
      num(1 - a.upwindK, 1 - b.upwindK, pct, 'Besser am Wind'),
    ];
  }
  const perSide = (e: ShipEvolution) => activePorts(c.can, e.cannonTier);
  return [
    num(perSide(from), perSide(to), (n) => `${n} von ${c.can} je Seite`, 'Aktive Kanonen'),
    num(a.cannonDmgK, b.cannonDmgK, pct, 'Kanonenschaden'),
    num(1 / a.reloadK, 1 / b.reloadK, pct, 'Nachladen'),
    num(a.penOffset, b.penOffset, (n) => (n > 0 ? `+${n}` : `${n}`), 'Durchschlag'),
    text('Deck-Drehbassen', a.swivel ? 'ja' : 'nein', b.swivel ? 'ja' : 'nein', (s) => (s === 'ja' ? 1 : 0)),
  ];
}

/** Klassenwechsel: bisheriges Schiff (mit seinen Ausbauten) gegen die neue Klasse (neu gekauft: Stufe 1 in allen Zweigen, sonst mit ihrem Zustand) */
export function classCompareRows(fromIndex: number, fromEvo: ShipEvolution, toIndex: number, toEvo: ShipEvolution): CompareRow[] {
  const a = SHIP_CLASSES[fromIndex], b = SHIP_CLASSES[toIndex];
  const sa = evoStats(fromEvo), sb = evoStats(toEvo);
  return [
    num(hullPointsOf(fromIndex, fromEvo), hullPointsOf(toIndex, toEvo), (n) => `${n}`, 'Rumpf-HP'),
    num(a.can, b.can, (n) => `${n}`, 'Kanonen je Seite'),
    num(a.spd * sa.speedK, b.spd * sb.speedK, (n) => n.toFixed(1), 'Tempo'),
    num(a.crew, b.crew, (n) => `${n}`, 'Crew'),
    num(officerSlots(fromIndex), officerSlots(toIndex), (n) => `${n}`, 'Offiziersplätze'),
    num(troopCapacity(fromIndex), troopCapacity(toIndex), (n) => `${n}`, 'Truppen'),
  ];
}

export interface EvoPlan {
  /** Stufen, die gebaut werden (von … bis, jeweils einzeln) */
  steps: number[];
  /** Gold ohne Hafen-Tarif, Material je Ware (zusammengefasst), Boss-Siegel und Splitter der letzten Stufe */
  gold: number;
  materials: { good: GoodId; n: number }[];
  seals: number;
  shards: number;
}

/** Gesamtplan, um einen Zweig von Stufe `fromTier` auf `toTier` auszubauen (leer, wenn `toTier` nicht höher ist) */
export function evoPlan(branch: EvoBranch, classIndex: number, fromTier: number, toTier: number): EvoPlan {
  const steps: number[] = [];
  for (let t = fromTier + 1; t <= Math.min(EVO_MAX, toTier); t++) steps.push(t);
  const mats = new Map<GoodId, number>();
  let gold = 0, seals = 0, shards = 0;
  for (const t of steps) {
    gold += evoCost(classIndex, t);
    const m = evoMaterial(branch, classIndex, t);
    if (m) mats.set(m.good, (mats.get(m.good) ?? 0) + m.n);
    if (t >= EVO_MAX) { seals += UPGRADE_RECIPE.seals; shards += UPGRADE_RECIPE.shards; }
  }
  return { steps, gold, materials: [...mats].map(([good, n]) => ({ good, n })), seals, shards };
}

/** Der Zustand mit einer geänderten Stufe in einem Zweig (für die Vorschau eines Ausbaus) */
export function withTier(e: ShipEvolution, branch: EvoBranch, tier: number): ShipEvolution {
  const t = Math.max(1, Math.min(EVO_MAX, Math.round(tier))) as ShipEvolution['hullTier'];
  return { ...e, [branch === 'hull' ? 'hullTier' : branch === 'sail' ? 'sailTier' : 'cannonTier']: t };
}

/** Was in der Werft zur Vorschau gewählt ist: eine Stufe eines Zweigs des gefahrenen Schiffs oder eine Schiffsklasse */
export type YardPick = { kind: 'evo'; branch: EvoBranch; tier: number } | { kind: 'cls'; index: number };

/** `evo|hull|3` bzw. `cls|2` (so stehen die Wahl-Knöpfe im HTML) lesen; Ungültiges ergibt `null` */
export function parsePick(id: string): YardPick | null {
  const [k, a, b] = id.split('|');
  if (k === 'evo' && (a === 'hull' || a === 'sail' || a === 'cannon')) {
    const tier = Math.round(Number(b));
    return tier >= 1 && tier <= EVO_MAX ? { kind: 'evo', branch: a, tier } : null;
  }
  if (k === 'cls') {
    const index = Math.round(Number(a));
    return Number.isInteger(index) && index >= 0 && index < SHIP_CLASSES.length ? { kind: 'cls', index } : null;
  }
  return null;
}

export const pickId = (p: YardPick): string => (p.kind === 'evo' ? `evo|${p.branch}|${p.tier}` : `cls|${p.index}`);
export const samePick = (a: YardPick | null, b: YardPick | null): boolean => (!a || !b ? a === b : pickId(a) === pickId(b));

/** Alles, was die Werft zu einer Vorschau anzeigt: Vergleich, Gold (mit Tarif), Material, Siegel, offene Voraussetzungen, Inzahlungnahme */
export interface YardInfo {
  rows: CompareRow[];
  gold: number;
  goldOk: boolean;
  materials: { name: string; n: number; have: number }[];
  seals: number; shards: number; sealsHave: number; shardsHave: number;
  gates: string[];
  /** Klassenwechsel: Erstattung für die Ausbauten des bisherigen Schiffs (50 %) */
  refund: number;
}
