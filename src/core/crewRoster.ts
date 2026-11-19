// Spielstand-Helfer der Zwei-Stufen-Crew (ohne three.js): Offiziers-Plätze je Klasse, Truppen-Bestand, abwärtskompatibel.
import { officerSlots, troopCapacity } from '../data/crewTiers';
import { cleanRoster, clampRoster, rosterTotal, type TroopRoster } from '../data/troops';
import type { CrewState, ShipState } from './save/types';
import { clamp01 } from './mathUtil';

/** Offiziere, die auf dieser Schiffsklasse wirklich mitkämpfen (die ersten `officerSlots` der Rangfolge) */
export const activeParty = (party: readonly string[], tier: number): string[] => party.slice(0, officerSlots(tier));

/**
 * Ältere Spielstände kennen `troops` und `officerSlots` nicht: fehlende Felder ergänzen, Unsinn bereinigen und den Bestand auf die
 * Kapazität der Klasse kappen. Verändert nichts an `party`/`hired`. Liefert den bereinigten Bestand.
 */
export function ensureCrewState(crew: CrewState, tier: number): TroopRoster {
  // der gespeicherte Bestand bleibt unangetastet (auf einem Schiff ohne Truppenplätze ruht er an Land); aktiv ist, was auf das Schiff passt
  const stored = cleanRoster(crew.troops);
  crew.troops = stored as Record<string, number>;
  crew.officerSlots = officerSlots(tier);
  return clampRoster(stored, troopCapacity(tier));
}

/** Anteil der Seeleute und der Truppen aus dem Spielstand (alte Spielstände: `crew` gilt für die Seeleute, keine Truppen) */
export function savedPools(ship: ShipState, roster: TroopRoster, tier: number): { matrosen: number; truppen: number } {
  const p = ship.crewPools;
  const matrosen = typeof p?.matrosen === 'number' && Number.isFinite(p.matrosen) ? p.matrosen : ship.crew ?? 1;
  const cap = troopCapacity(tier);
  const truppen = cap > 0 ? Math.min(1, rosterTotal(roster) / cap) : 0;
  return { matrosen: clamp01(matrosen), truppen };
}
