/**
 * Phase 4.9 – Kräfte am Steuerrad (rein, ohne three.js): die zehn Formen des Klassenbaums, die vier Geistes-Faji und das Ultimate wirken
 * auch über dem Meer. Formen werden zu See-Projektionen ihrer Familie (Faust: Druckwellen-Faust über das Wasser, Klinge: Fernschnitt-Welle,
 * Faji: Element-Geschoss, Priester: Lichtlanze und Heilung des eigenen Schiffs); die Geistes-Faji wirken auf Schiff und Gegner im Umkreis.
 * Tasten am Steuer: Formen 1 – 5 und Umschalt + 1 – 5 (wie zu Fuß), Geistes-Faji Umschalt + Q/R/T/G (Q, E, R und G gehören am Steuer den
 * Breitseiten, der Aktion und dem Flicken), V geht an Deck und entfesselt dort das Ultimate über dem Meer.
 */
import { ACTION_STYLES } from './actionStyles';

export type SeaArtFamily = 'faust' | 'klinge' | 'faji' | 'priester';

export const SEA_ART = {
  /** Reichweite (m) und halber Öffnungswinkel (rad), in dem ohne angewähltes Ziel das nächste Schiff gesucht wird */
  range: 200, cone: 0.85,
  /** Schaden: Angriffskraft × (Grund + je Form) × Stufenfaktor; ab Form 6 schwerer */
  dmgBase: 1.6, dmgSlot: 0.14, dmgLevel: 0.012,
  /** Abklingzeit am Steuer = Abklingzeit der Form × Faktor, mindestens `cdMin` s */
  cdK: 1.35, cdMin: 2.5,
  /** Fluggeschwindigkeit der Projektionen (m/s) */
  speed: 120,
  /** Priester: Heilung des eigenen Schiffs je Form (Anteil des Rumpfs) */
  healK: 0.02,
} as const;

/** Geistes-Faji am Steuer: Abklingzeit (s), Reichweite (m), Wirkung */
export const SEA_GEIST = [
  { slot: 1, label: 'Willens-Entfesselung', cd: 16, range: 150, effect: 'will' },
  { slot: 2, label: 'Lebensstrom-Fokus', cd: 22, range: 0, effect: 'heal' },
  { slot: 3, label: 'Erwachter Wille', cd: 14, range: 200, effect: 'thunder' },
  { slot: 4, label: 'Königsdruck', cd: 24, range: 95, effect: 'quake' },
] as const;

export type SeaGeistEffect = (typeof SEA_GEIST)[number]['effect'];

/** Familie eines Kampfstils auf See */
export function seaFamily(style: string): SeaArtFamily {
  if (style === 'priester') return 'priester';
  const st = (ACTION_STYLES as Record<string, { faji?: boolean; visual?: string } | undefined>)[style];
  if (st?.faji) return 'faji';
  if (st?.visual === 'faust' || style === 'sturmfaust' || style === 'erdspalter') return 'faust';
  return 'klinge';
}

/** Schaden einer Form am Steuer (Form 1 – 10) */
export function seaArtDamage(atk: number, level: number, slot: number): number {
  const s = Math.max(1, Math.min(10, Math.round(slot)));
  return Math.max(1, atk) * (SEA_ART.dmgBase + s * SEA_ART.dmgSlot + (s >= 6 ? 0.35 : 0)) * (1 + Math.max(1, level) * SEA_ART.dmgLevel);
}

/** Abklingzeit einer Form am Steuer aus der Abklingzeit der Form (s) */
export function seaArtCd(formCd: number): number {
  return Math.max(SEA_ART.cdMin, (Number.isFinite(formCd) ? formCd : 6) * SEA_ART.cdK);
}

/** Schaden eines Geistes-Faji am Steuer (Donner trifft hart, das Beben breit und schwächer) */
export function seaGeistDamage(atk: number, level: number, effect: SeaGeistEffect): number {
  const base = seaArtDamage(atk, level, 6);
  return effect === 'thunder' ? base * 2.2 : effect === 'quake' ? base * 1.1 : 0;
}
