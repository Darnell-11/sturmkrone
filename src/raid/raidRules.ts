// Regeln rund um Raids: wer darf wann belagern, was kostet die Flottenbegleitung, was gibt es als Lohn. Reine Daten und Funktionen.
import { FACTIONS, type FactionId } from '../data/factions';
import type { RaidRoute } from './raidTypes';

/** Ab diesem Marine-Ansehen („hoher Dienststatus“) dient Weißwacht als sicherer Stützpunkt und kann nicht geraidet werden */
export const MARINE_SERVICE_STANDING = 60;
/** Ansehen bei der Marine nach einem Angriff auf ihr Hauptquartier (der Angriff selbst kostet sofort 40) */
export const MARINE_RAID_PENALTY = 40;

export interface RaidAccess {
  /** Der Raid kann begonnen werden */
  allowed: boolean;
  /** Marine-Hauptquartier mit hohem Dienststatus: sicherer Stützpunkt (Hafen, kein Kampf) */
  safeBase: boolean;
  reason: string;
}

/**
 * Wer darf eine Festungsinsel belagern? Die fünf Mächte immer; die Marine-Hafenstadt ebenso – außer der Spieler besitzt hohen
 * Marine-Dienststatus (Ansehen ab 60): dann ist sie sein sicherer Stützpunkt.
 */
export function raidAccess(factionId: FactionId, o: { marineStanding: number; occupied?: boolean }): RaidAccess {
  if (o.occupied) return { allowed: false, safeBase: true, reason: 'Die Insel ist in deiner Hand: dein sicherer Hafen mit Werft und Truppen. Erst wenn die Macht sie zurückerobert hat, lässt sie sich wieder belagern.' };
  if (factionId === 'marine' && o.marineStanding >= MARINE_SERVICE_STANDING) {
    return { allowed: false, safeBase: true, reason: 'Dein Dienststatus bei der Marine ist hoch: Weißwacht ist dein sicherer Stützpunkt. Hier wird nicht gekämpft.' };
  }
  const F = FACTIONS[factionId];
  return { allowed: true, safeBase: false, reason: factionId === 'marine' ? 'Die Marine wird dich fortan jagen: ein Angriff auf Weißwacht macht sie zu deinem erbitterten Feind.' : `${F.name} verteidigt seine Festungsinsel mit Wachflotte, Batterien und einer Burg voller Truppen.` };
}

/** Söldner-Eskorten: wer keine eigenen Begleitschiffe hat, heuert vor dem Raid welche an (insgesamt höchstens drei Begleitschiffe) */
export const ESCORT_MAX = 3;
export const MERCENARY_ESCORT_PRICE = 650;

/** Wie viele Söldner-Eskorten noch angeheuert werden dürfen */
export function mercenarySlots(ownEscorts: number, hired: number): number {
  return Math.max(0, ESCORT_MAX - Math.max(0, ownEscorts) - Math.max(0, hired));
}


export interface RaidReward { gold: number; xp: number; fame: number }

/** Lohn für den Sieg: Route B ist die längere und gefährlichere und zahlt ein Viertel mehr; Wiederholung zahlt die Hälfte */
export function raidReward(level: number, route: RaidRoute | null, firstClear: boolean): RaidReward {
  const k = (route === 'B' ? 1.25 : 1) * (firstClear ? 1 : 0.5);
  return { gold: Math.round((1800 + level * 220) * k), xp: Math.round((900 + level * 140) * k), fame: Math.round((120 + level * 8) * k) };
}
