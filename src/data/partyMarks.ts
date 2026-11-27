/**
 * Phase 4.9 – Markierungen der Gruppenmitglieder (rein, ohne three.js/DOM): smaragd-türkises Namensschild mit Klassen-Emblem über Figur bzw.
 * Mast, pulsierender grüner Ring auf Boden bzw. Wasser, Schiffs-Zeichen mit Fahrtrichtung auf Minikarte, Kompass und Seekarte.
 * Die Farben stehen gleich in `ui/css/tokens.css` (`--party-emerald`, `--party-turquoise`; ein Test gleicht sie ab).
 */
import { CLASS_BASES, SPECS, type ClassBase, type SpecId } from './classes';

export const PARTY_COLORS = { emerald: '#2ee6a8', turquoise: '#5ff2e0', deep: '#0b3b33' } as const;

export const PARTY_MARK = {
  /** höchstens so viele Mitspieler markieren (Gruppe bis 5 = vier andere) */
  max: 4,
  /** Ring an Land (Radius m) und um Schiffe (Anteil der Schiffslänge), Höhe über Boden bzw. Wasser (m; Pflaster und Wege liegen bis gut 0,2 m über dem Boden, Wellen wie beim Zielring) */
  ringLand: 0.85, ringShipK: 0.62, liftLand: 0.22, liftSea: 0.55,
  /** Pulsieren: Kreisfrequenz (rad/s), Größe ±, Deckkraft Mitte ± */
  pulseW: 2.6, pulseScale: 0.06, opacity: 0.55, opacityAmp: 0.18,
  /** Namensschild über dem Kopf (m über den Füßen) bzw. über dem Masttopp (m) */
  plateLand: 2.35, plateMast: 2.6,
  /** Schilder blenden ab dieser Entfernung (m) aus; Maßstab nah 1, fern bis `plateMin` */
  plateFar: 2600, plateMin: 0.62,
} as const;

/** Emblem eines Mitglieds: Wappen der Spezialisierung, sonst das Zeichen der Grundklasse, sonst ein Kompassstern */
export function partyEmblem(spec: string, base: string): string {
  const s = SPECS[spec as SpecId];
  if (s) return s.crest;
  const b = CLASS_BASES[base as ClassBase];
  return b ? b.icon : '✦';
}

/** Ring-Radius (m): an Land fest, auf See nach der Schiffslänge */
export function partyRingRadius(sea: boolean, shipL: number): number {
  return sea ? Math.max(6, shipL * PARTY_MARK.ringShipK) : PARTY_MARK.ringLand;
}

/** Maßstab eines Namensschilds nach Entfernung (m): nah 1, fern kleiner, nie unter `plateMin` */
export function plateScale(dist: number): number {
  return Math.max(PARTY_MARK.plateMin, Math.min(1, 1.12 - dist / 1400));
}

/** Untertitel des Schilds: „Stufe 12 · Kombo-DPS“ */
export function plateLine(level: number, role: string): string {
  return role ? `Stufe ${level | 0} · ${role}` : `Stufe ${level | 0}`;
}
