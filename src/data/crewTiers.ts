// Kapazitäten der Zwei-Stufen-Crew je Schiffsklasse (reine Daten, kein three.js):
//  Stufe 1 = Offiziere (benannte Crew, data/crew.ts): wie viele gleichzeitig im Land-/Entertrupp kämpfen
//  Stufe 2 = Massentruppen (data/troops.ts): namenlose Söldnertrupps, nur ab dem Leviathan (Rang 9)
// Index = Schiffsklasse (SHIP_CLASSES): Schaluppe, Brigg, Korvette, Fregatte, Galeone, Linienschiff, Leviathan.

/** Gleichzeitige Offiziere im Land- und Entertrupp je Klasse */
export const OFFICER_SLOTS: readonly number[] = [2, 2, 3, 3, 4, 4, 5];

/** Plätze für Massentruppen (Köpfe) je Klasse; 0 = die Klasse trägt keine Truppen */
export const TROOP_CAPACITY: readonly number[] = [0, 0, 0, 0, 0, 0, 100];

/** Mindestrang (Index in FAME_THRESHOLDS), um Truppen anzuheuern */
export const TROOP_RANK = 9;

/** Höchstzahl gleichzeitig sichtbarer Trupps (je Trupp höchstens `SQUAD_MAX_HEADS` Köpfe) */
export const MAX_SQUADS = 6;
export const SQUAD_MAX_HEADS = 20;

const clampTier = (tier: number) => Math.max(0, Math.min(OFFICER_SLOTS.length - 1, Math.round(tier) || 0));

/** Wie viele Offiziere kämpfen auf dieser Schiffsklasse gleichzeitig mit? */
export const officerSlots = (tier: number): number => OFFICER_SLOTS[clampTier(tier)];

/** Wie viele Truppen-Köpfe passen an Bord? */
export const troopCapacity = (tier: number): number => TROOP_CAPACITY[clampTier(tier)];

/**
 * Aufstellung der Offiziere hinter der Spielfigur: Platz 0 links, 1 rechts, 2 links dahinter, 3 rechts dahinter, …
 * `side` −1 = links, +1 = rechts; `back` = Abstand nach hinten in Metern.
 */
export function formationSlot(i: number): { side: number; back: number } {
  const row = Math.floor(i / 2);
  return { side: i % 2 === 0 ? -1 : 1, back: 1.6 + row * 1.5 };
}
