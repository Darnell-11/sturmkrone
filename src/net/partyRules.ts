// Phase 4.8A – Regeln für Gruppen und Spieler untereinander (rein: kein DOM, kein three.js, keine Speicheranforderung je Bild).
//
// Die Welt-KI (`FactionWarEngine.partyStance`) liefert die Haltung zweier Teams; der autoritative Shard (`MmoAuthority`), die Oberfläche
// (Rechtsklick-Menü, Betrachten) und die Seewelt (Eigenbeschuss, Heilung) fragen dieselben Funktionen:
// - **Gruppen-Zulassung:** gleiche Nation, Bündnis, Handelspakt, Neutral oder Rivalität – alles außer Krieg. Ungebundene Neulinge (vor dem Rat
//   der Gesandten) sind zu allen neutral.
// - **Kriegsausbruch in einer Gruppe:** `partyConflicts` bestimmt, wer gehen muss (Anführer zuerst, dann nach Beitritt: behalten wird, wer mit
//   allen Behaltenen vereinbar ist).
// - **Schutzzonen:** Ankerglück und die Hauptstadt-Häfen der fünf Mächte – dort kein Kampf zwischen Spielern.
// - **Spieler gegen Spieler:** nur zwischen Nationen im Krieg, nie in der eigenen Gruppe, nie in einer Schutzzone.
// - **Mitfahrt an Deck:** Lage relativ zum Schiff (wie `DeckGround.world`), damit jeder Client die Mitfahrer am selben Platz zeichnet.
import type { DiplomacyState } from '../data/nations';

/** Haltung zweier Spieler zueinander (aus ihren Teams) */
export type PartyStance = 'gleich' | 'buendnis' | 'handelspakt' | 'neutral' | 'rivalitaet' | 'krieg';
export const PARTY_STANCES: readonly PartyStance[] = ['gleich', 'buendnis', 'handelspakt', 'neutral', 'rivalitaet', 'krieg'];

export const STANCE_LABEL: Readonly<Record<PartyStance, string>> = {
  gleich: 'Gleiche Nation', buendnis: 'Bündnis', handelspakt: 'Handelspakt', neutral: 'Neutral', rivalitaet: 'Rivalität', krieg: 'Krieg',
};
/** Ton für Ring, Zielfenster und Menü: verbündet (grün), neutral (gelb), feindlich (rot) */
export const STANCE_TONE: Readonly<Record<PartyStance, 'friendly' | 'neutral' | 'hostile'>> = {
  gleich: 'friendly', buendnis: 'friendly', handelspakt: 'neutral', neutral: 'neutral', rivalitaet: 'neutral', krieg: 'hostile',
};

/**
 * Haltung zweier Teams nach dem aktuellen Zustand der Welt-KI. '' / null = ungebunden (vor dem Rat der Gesandten): neutral zu allen.
 * `diplomacy` = `FactionWarEngine.stateOf`.
 */
export function stanceOf(a: string | null | undefined, b: string | null | undefined, diplomacy: (a: string, b: string) => DiplomacyState): PartyStance {
  if (!a || !b) return 'neutral';
  if (a === b) return 'gleich';
  const st = diplomacy(a, b);
  return st === 'allianz' ? 'buendnis' : st;
}

/** Darf zwischen diesen Spielern eine Gruppe bestehen? (alles außer Krieg) */
export const groupAllowed = (s: PartyStance): boolean => s !== 'krieg';
/** Verbündet: gleiche Nation oder Bündnis – kein Eigenbeschuss, volle Heilung und Segen auch außerhalb einer Gruppe */
export const alliedStance = (s: PartyStance): boolean => s === 'gleich' || s === 'buendnis';

/** Grund, warum eine Einladung gesperrt ist ('' = erlaubt) */
export function inviteBlock(s: PartyStance): string {
  return groupAllowed(s) ? '' : 'Gesperrt (Kriegszustand)';
}

// ---------------------------------------------------------------------------------------------------------------
// Kriegsausbruch in einer bestehenden Gruppe
// ---------------------------------------------------------------------------------------------------------------

const _keep: string[] = [];

/**
 * Wer muss die Gruppe verlassen, wenn zwischen den Nationen ihrer Mitglieder Krieg herrscht? `members` in Reihenfolge (Anführer zuerst,
 * dann nach Beitritt). Behalten wird der Reihe nach, wer mit allen Behaltenen vereinbar ist; die übrigen landen in `out`. Liefert das erste
 * verfeindete Paar (Teams) oder null.
 */
export function partyConflicts(members: readonly string[], teamOf: (id: string) => string, stance: (a: string, b: string) => PartyStance, out: string[]): { a: string; b: string } | null {
  out.length = 0;
  _keep.length = 0;
  let pa = '', pb = '';
  for (const id of members) {
    const t = teamOf(id);
    let ok = true;
    for (const k of _keep) {
      const tk = teamOf(k);
      if (stance(tk, t) === 'krieg') { ok = false; if (!pa) { pa = tk; pb = t; } break; }
    }
    if (ok) _keep.push(id); else out.push(id);
  }
  return out.length ? { a: pa, b: pb } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Schutzzonen und Spieler gegen Spieler
// ---------------------------------------------------------------------------------------------------------------

/** Friedliche Schutzzone (Ankerglück, Hauptstadt-Häfen): Kreis um die Insel samt Hafenwasser */
export interface SafeZone { id: string; name: string; x: number; z: number; r: number }

/** Schutzzone an dieser Stelle oder null */
export function safeZoneAt(zones: readonly SafeZone[], x: number, z: number): SafeZone | null {
  for (const s of zones) { const dx = x - s.x, dz = z - s.z; if (dx * dx + dz * dz <= s.r * s.r) return s; }
  return null;
}

export interface PvpCheck {
  stance: PartyStance;
  /** beide in derselben Gruppe */
  sameParty: boolean;
  /** Name der Schutzzone am Ort des Angreifers bzw. des Ziels ('' = keine) */
  safeA: string;
  safeB: string;
}

/** Darf ein Spieler einem anderen Schaden zufügen? '' = ja, sonst ein deutscher Grund */
export function pvpBlock(c: PvpCheck): string {
  if (c.sameParty) return 'Kein Angriff auf die eigene Gruppe';
  if (alliedStance(c.stance)) return 'Kein Angriff auf Verbündete';
  if (c.safeA || c.safeB) return `Schutzzone ${c.safeA || c.safeB}: kein Kampf zwischen Spielern`;
  if (c.stance !== 'krieg') return 'Kein Krieg zwischen euren Nationen';
  return '';
}

/** Beziehung eines Mitspielers für Zielring und Zielfenster (Gruppe und Verbündete grün, Krieg rot, sonst gelb) */
export function playerRelation(stance: PartyStance, sameParty: boolean): 'friendly' | 'neutral' | 'hostile' {
  return sameParty ? 'friendly' : STANCE_TONE[stance];
}

// ---------------------------------------------------------------------------------------------------------------
// Mitfahrt an Deck (relative Deck-Koordinaten)
// ---------------------------------------------------------------------------------------------------------------

/** Grenzen der relativen Deck-Lage (m): quer, Höhe über dem Hauptdeck, längs */
export const RIDE_BOUNDS = { x: 9, yMin: -2, yMax: 10, z: 32 } as const;

export interface ShipPose { x: number; z: number; heading: number }

/** Relative Lage auf dem Schiff → Welt (wie `DeckGround.world`; y = Hauptdeckhöhe + ry) */
export function rideToWorld(ship: ShipPose, deckY: number, rx: number, ry: number, rz: number, out: { x: number; y: number; z: number }) {
  const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
  out.x = ship.x + rx * c + rz * s;
  out.z = ship.z - rx * s + rz * c;
  out.y = deckY + ry;
  return out;
}

/** Welt → relative Lage auf dem Schiff (nur x/z) */
export function worldToRide(ship: ShipPose, wx: number, wz: number, out: { x: number; z: number }) {
  const dx = wx - ship.x, dz = wz - ship.z;
  const c = Math.cos(-ship.heading), s = Math.sin(-ship.heading);
  out.x = dx * c + dz * s;
  out.z = -dx * s + dz * c;
  return out;
}

/** Liegt eine relative Lage auf einem Schiff dieser Länge/Breite (mit Spielraum)? */
export function rideValid(rx: number, ry: number, rz: number, shipL = RIDE_BOUNDS.z * 2, shipW = RIDE_BOUNDS.x * 2): boolean {
  if (![rx, ry, rz].every(Number.isFinite)) return false;
  return Math.abs(rx) <= Math.min(RIDE_BOUNDS.x, shipW * 0.5 + 0.5) && Math.abs(rz) <= Math.min(RIDE_BOUNDS.z, shipL * 0.5 + 0.5) && ry >= RIDE_BOUNDS.yMin && ry <= RIDE_BOUNDS.yMax;
}

/** Platz `i` für Mitfahrer auf dem Hauptdeck: abwechselnd Backbord/Steuerbord, von mittschiffs nach achtern */
export function rideSlot(i: number, shipL: number, shipW: number, out: { x: number; z: number }) {
  const side = i % 2 === 0 ? 1 : -1;
  out.x = side * Math.max(0.6, shipW * 0.22);
  out.z = Math.max(-shipL * 0.3, -1.5 - Math.floor(i / 2) * 2.2);
  return out;
}
