// Talismane: Beute mit Seltenheit. Einer ist angelegt und gibt seinen Bonus.

export type Rarity = 'gewoehnlich' | 'selten' | 'episch' | 'legendaer';

export const RARITY: Record<Rarity, { n: string; col: string; mark: string }> = {
  gewoehnlich: { n: 'Gewöhnlich', col: '#9A9A9A', mark: '●' },
  selten: { n: 'Selten', col: '#3A8FE0', mark: '◆' },
  episch: { n: 'Episch', col: '#A05AE0', mark: '★' },
  legendaer: { n: 'Legendär', col: '#E8A82A', mark: '♛' },
};

export interface TrinketBonus { atk?: number; hp?: number; gold?: number; faji?: number; crit?: number; cannon?: number; speed?: number }

export interface TrinketDef { id: string; n: string; rarity: Rarity; d: string; bonus: TrinketBonus }

export const TRINKETS: TrinketDef[] = [
  { id: 'muschel', n: 'Glücksmuschel', rarity: 'gewoehnlich', d: '+10 % Gold', bonus: { gold: 0.1 } },
  { id: 'haizahn', n: 'Haizahn-Kette', rarity: 'gewoehnlich', d: '+5 % Angriff', bonus: { atk: 0.05 } },
  { id: 'kork', n: 'Korkamulett', rarity: 'gewoehnlich', d: '+8 % Leben', bonus: { hp: 0.08 } },
  { id: 'kompass', n: 'Messingkompass', rarity: 'gewoehnlich', d: '+5 % Tempo auf See', bonus: { speed: 0.05 } },
  { id: 'pulverhorn', n: 'Pulverhorn', rarity: 'selten', d: '+12 % Kanonenschaden', bonus: { cannon: 0.12 } },
  { id: 'nebelperle', n: 'Nebelperle', rarity: 'selten', d: '+15 % Faji-Regeneration', bonus: { faji: 0.15 } },
  { id: 'wolfsauge', n: 'Wolfsauge', rarity: 'selten', d: '+6 % Kritische Treffer', bonus: { crit: 0.06 } },
  { id: 'eisenherz', n: 'Eisenherz', rarity: 'selten', d: '+15 % Leben', bonus: { hp: 0.15 } },
  { id: 'glutstein', n: 'Glutstein', rarity: 'episch', d: '+15 % Angriff, +8 % Krit', bonus: { atk: 0.15, crit: 0.08 } },
  { id: 'sturmfeder', n: 'Sturmfeder', rarity: 'episch', d: '+12 % Tempo, +15 % Kanonen', bonus: { speed: 0.12, cannon: 0.15 } },
  { id: 'geisterlaterne', n: 'Geisterlaterne', rarity: 'episch', d: '+25 % Faji-Regeneration, +10 % Leben', bonus: { faji: 0.25, hp: 0.1 } },
  { id: 'goldkrone', n: 'Kleine Goldkrone', rarity: 'episch', d: '+30 % Gold', bonus: { gold: 0.3 } },
  { id: 'tiefenauge', n: 'Auge der Tiefe', rarity: 'legendaer', d: '+25 % Angriff, +20 % Leben, +10 % Krit', bonus: { atk: 0.25, hp: 0.2, crit: 0.1 } },
  { id: 'siegelsplitter', n: 'Splitter des Sturmsiegels', rarity: 'legendaer', d: '+30 % Kanonen, +15 % Tempo, +20 % Faji', bonus: { cannon: 0.3, speed: 0.15, faji: 0.2 } },
];

export const TRINKET_BY_ID: Record<string, TrinketDef> = Object.fromEntries(TRINKETS.map((t) => [t.id, t]));

/** Zufälliger Talisman; min = geringste Seltenheit, luck verschiebt nach oben */
export function rollTrinket(min: Rarity, luck = 0, owned: string[] = []): TrinketDef | null {
  const order: Rarity[] = ['gewoehnlich', 'selten', 'episch', 'legendaer'];
  let i = order.indexOf(min);
  const r = Math.random() + luck;
  if (r > 0.97) i += 2; else if (r > 0.75) i += 1;
  i = Math.min(3, i);
  for (let k = i; k >= 0; k--) {
    const pool = TRINKETS.filter((t) => t.rarity === order[k] && !owned.includes(t.id));
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
  }
  return null;
}
