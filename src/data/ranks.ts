import type { Faction } from '../core/save/types';

// Ränge und Ruhm-Schwellen aus Sturmkrone 1.0
export const RANKS: Record<Faction, string[]> = {
  pirat: ['Schiffsjunge', 'Deckschrubber', 'Matrose', 'Bootsmann', 'Maat', 'Kapitän', 'Freibeuter', 'Sturmkapitän', 'Schrecken der Meere', 'Herr der Gezeiten'],
  marine: ['Rekrut', 'Matrose', 'Gefreiter', 'Maat', 'Leutnant', 'Kapitän', 'Kommodore', 'Konteradmiral', 'Admiral', 'Großadmiral'],
};

export const FAME_THRESHOLDS = [0, 80, 220, 450, 800, 1300, 2000, 3000, 4300, 6000];

export const FACTION_LABELS: Record<Faction, string> = { pirat: 'Pirat', marine: 'Marine' };

export function rankIndex(fame: number): number {
  let i = 0;
  FAME_THRESHOLDS.forEach((t, k) => { if (fame >= t) i = k; });
  return i;
}

export function rankName(faction: Faction, fame: number): string {
  return RANKS[faction][rankIndex(fame)];
}
