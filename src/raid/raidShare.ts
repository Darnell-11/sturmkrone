// Phase 4.92 – gemeinsame Belagerung einer Gruppe (rein, ohne three.js; getestet).
//
// Wer in einer Gruppe eine Belagerung beginnt, lädt die Gruppe ein (`share` mit `raidShareRef`: Startwert und Prüfsumme der Insel). Wer dieselbe
// Festung danach belagert, nutzt dieselbe Instanz (`raidInstanceOf`) – gleicher Startwert = gleiche Festung, gleiche Wellen, gleiche Plätze.
// Alle geteilten Gegner der Instanz tragen ihren Bereich (`raidScope`): der Shard gibt sie nur an Teilnehmer weiter.
import { hashString } from './raidLayout';

/** so lange gilt eine Einladung (s Wanduhr) */
export const RAID_SHARE_TTL = 1200;

/** Einladung an die Gruppe: Startwert und Prüfsumme der Insel (≤ 32 Zeichen, nur Ziffern, Kleinbuchstaben und Punkt) */
export function raidShareRef(defId: string, seed: number): string { return `${(seed >>> 0).toString(36)}.${hashString(defId).toString(36)}`; }

/** Einladung lesen (null = ungültig) */
export function parseRaidShare(ref: string): { seed: number; defHash: string } | null {
  const m = /^([0-9a-z]{1,8})\.([0-9a-z]{1,8})$/.exec(ref);
  if (!m) return null;
  const seed = parseInt(m[1], 36);
  return Number.isFinite(seed) ? { seed, defHash: m[2] } : null;
}

/** gehört die Einladung zu dieser Insel? */
export const raidShareFits = (defId: string, defHash: string): boolean => hashString(defId).toString(36) === defHash;

/** Kennung der Instanz zu Insel und Startwert (für alle Teilnehmer gleich; dieselbe Form wie `newRaidInstanceId`) */
export const raidInstanceOf = (defId: string, seed: number): string => `raid-${defId}-${(seed >>> 0).toString(36)}`;

/** Bereich einer gemeinsamen Raid-Instanz für das Netz (kurz, nur Zeichen, die `cleanId` durchlässt) */
export function raidScope(raidInstanceId: string): string { return `rs.${hashString(raidInstanceId).toString(36)}`; }

/**
 * Schlüssel eines Gegners der Instanz: Platz in der Festung (`w.<Viertel>.<Welle>.<Nr>`, `dach.<Viertel>.<Nr>`, `hm.<Posten>`, `boss`) bzw. Platz der
 * Wachflotte (`wache-<n>`) – gleich für alle Teilnehmer, darum führt der Shard ihre Gegner zusammen
 */
export const raidEntityKey = (scope: string, place: string): string => `raid:${scope}:${place}`;
