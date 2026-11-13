// Beute-Pipeline: Was ein besiegter Gegner fallen lässt, in welcher Seltenheit und wie die Lichtsäule dazu aussieht.
// Alles Balancing steht hier; die Darstellung (combat/loot.ts) und die Übergabe an Spielstand und Anzeigen (core/game.ts) lesen es nur.
import { RARITY, type Rarity } from './trinkets';

export type LootKind = 'trinket' | 'gold' | 'proviant' | 'gear';

/** Ein Beutestück: Seltenheit steht beim Fallenlassen fest (Farbe der Säule), der Inhalt wird beim Aufheben gewürfelt */
export interface LootDrop { rarity: Rarity; kind: LootKind; value: number }

/** Reihenfolge der Seltenheiten: Gewöhnlich (Common), Selten (Rare), Episch (Epic), Legendär (Legendary) */
export const RARITIES: Rarity[] = ['gewoehnlich', 'selten', 'episch', 'legendaer'];

/** Aussehen der Lichtsäule je Seltenheit: Höhe und Radius in Metern, Leuchtstärke (über 1 = Bloom), Magnet-Reichweite, Funken je Sekunde */
export const LOOT_LOOK: Record<Rarity, { height: number; radius: number; glow: number; magnet: number; sparks: number }> = {
  gewoehnlich: { height: 5, radius: 0.32, glow: 1.4, magnet: 4.5, sparks: 0 },
  selten: { height: 9, radius: 0.4, glow: 1.9, magnet: 5.5, sparks: 2 },
  episch: { height: 14, radius: 0.5, glow: 2.4, magnet: 6.5, sparks: 5 },
  legendaer: { height: 22, radius: 0.65, glow: 3.2, magnet: 8, sparks: 10 },
};

/** Wahrscheinlichkeiten der Seltenheit [gewöhnlich, selten, episch, legendär] */
export const LOOT_WEIGHTS = {
  normal: [0.8, 0.16, 0.036, 0.004],
  elite: [0.42, 0.38, 0.16, 0.04],
  /** erste Beute eines Bosses: mindestens episch */
  bossFirst: [0, 0, 0.8, 0.2],
  /** Weltereignis-Belohnung: mindestens selten */
  event: [0, 0.6, 0.3, 0.1],
};

/** Wie viel Gold ein Beutestück wert ist, relativ zum Gold des Gegners (je Seltenheit) */
export const LOOT_GOLD_MULT = [1.2, 2.5, 5, 10];

export interface DropSource {
  boss?: boolean;
  elite?: boolean;
  level: number;
  /** Goldspanne des Gegners (aus den Gegnerwerten) */
  gold: [number, number];
}

function pick(w: number[], rnd: () => number): Rarity {
  let r = rnd(), i = 0;
  for (; i < w.length - 1; i++) { if (r < w[i]) break; r -= w[i]; }
  return RARITIES[i];
}

function make(rarity: Rarity, src: DropSource, rnd: () => number): LootDrop {
  const i = RARITIES.indexOf(rarity);
  // Bosse tragen viel Gold: ihre Beute-Säulen zählen nur halb, sonst wäre ein Gold-Stück mehr wert als der Kampf selbst
  const avg = (src.gold[0] + src.gold[1]) / 2 * (1 + 0.2 * (src.level - 1)) * (src.boss ? 0.5 : 1);
  const value = Math.max(5, Math.round(avg * LOOT_GOLD_MULT[i] * (0.85 + rnd() * 0.3)));
  const r = rnd();
  // Ausrüstung (Rüstungsteile der Sets, data/gear.ts) ist die häufigste Beute ab selten
  const kind: LootKind = i === 0 ? (r < 0.22 ? 'proviant' : r < 0.36 ? 'gear' : 'gold')
    : i === 1 ? (r < 0.3 ? 'trinket' : r < 0.78 ? 'gear' : 'gold')
    : i === 2 ? (r < 0.3 ? 'trinket' : r < 0.9 ? 'gear' : 'gold')
    : (r < 0.25 ? 'trinket' : r < 0.97 ? 'gear' : 'gold');
  return { rarity, kind, value };
}

/** Beute eines besiegten Gegners (kann leer sein); Bosse lassen vier Stücke fallen, das erste mindestens episch */
export function rollLoot(src: DropSource, rnd: () => number = Math.random): LootDrop[] {
  if (src.boss) {
    return [make(pick(LOOT_WEIGHTS.bossFirst, rnd), src, rnd), ...[0, 1, 2].map(() => make(pick(LOOT_WEIGHTS.elite, rnd), src, rnd))];
  }
  const chance = src.elite ? 0.85 : Math.min(0.3, 0.14 + src.level * 0.004);
  if (rnd() >= chance) return [];
  return [make(pick(src.elite ? LOOT_WEIGHTS.elite : LOOT_WEIGHTS.normal, rnd), src, rnd)];
}

/** Belohnung für ein abgeschlossenes Weltereignis: mindestens selten */
export function rollEventLoot(src: DropSource, count: number, rnd: () => number = Math.random): LootDrop[] {
  return Array.from({ length: count }, () => make(pick(LOOT_WEIGHTS.event, rnd), src, rnd));
}

export { RARITY };
