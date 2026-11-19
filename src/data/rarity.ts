// Seltenheiten: die eine Quelle für Reihenfolge, Namen, Farben und Zeichen aller Beute-, Ausrüstungs- und Katalogstücke.
// Vorher lagen Typ und Tabelle in trinkets.ts, die Reihenfolge doppelt in loot.ts und rollTrinket.

export type Rarity = 'gewoehnlich' | 'selten' | 'episch' | 'legendaer';

/** Reihenfolge von gewöhnlich (Common) bis legendär (Legendary) */
export const RARITIES: readonly Rarity[] = ['gewoehnlich', 'selten', 'episch', 'legendaer'];

export const RARITY: Record<Rarity, { n: string; col: string; mark: string }> = {
  gewoehnlich: { n: 'Gewöhnlich', col: '#9A9A9A', mark: '●' },
  selten: { n: 'Selten', col: '#3A8FE0', mark: '◆' },
  episch: { n: 'Episch', col: '#A05AE0', mark: '★' },
  legendaer: { n: 'Legendär', col: '#E8A82A', mark: '♛' },
};

/** Rang 0 … 3 einer Seltenheit (fehlend = gewöhnlich), zum Vergleichen und Sortieren */
export const rarityRank = (r: Rarity | undefined): number => RARITIES.indexOf(r ?? 'gewoehnlich');
