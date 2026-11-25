// Seeschlachten an den Fraktionsgrenzen: reine Regeln ohne three.js (Ort, Seiten, Stärke, Dauer). Die Schiffe und ihre KI führt `NavalSystem`.
// Eine Grenzlinie trennt zwei Kuchenstücke (data/factions.ts: `BORDERS`): auf ihr stoßen die Flotten der beiden Mächte aufeinander, 2 bis 3 Schiffe
// gegen 2 bis 3, mit gelegentlichem Eingreifen einer Marine-Patrouille. Eine Schlacht entsteht nur in der Nähe des Spielers (Ort wird erwürfelt,
// sobald er an eine Grenzlinie heranfährt) und endet, wenn eine Seite besiegt ist oder die Zeit abläuft.
import { BORDER_FORTS, BORDERS, type PowerId } from '../data/factions';

export const BATTLE = {
  /** Entlang der Grenzlinie (Abstand vom Mittelpunkt) kommen Schlachten vor: außerhalb der Bernsteinsee, vor dem Weltrand */
  minAlong: 2200,
  maxAlong: 5200,
  /** Der Spieler muss näher als so viele Meter an der Grenzlinie segeln */
  reach: 900,
  /** Abstand der Schlacht zum Spieler beim Beginn (knapp außerhalb der Sicht, der Rauch verrät sie) */
  spawnMin: 640,
  spawnMax: 860,
  /** Seitenabstand der beiden Flotten von der Linie (Meter) */
  split: 65,
  /** Dauer in Sekunden, nach der die Überlebenden abdrehen */
  duration: 210,
  /** Warten bis zur ersten Schlacht und zwischen zwei Schlachten (Sekunden, von … bis) */
  firstDelay: [30, 60] as [number, number],
  cooldown: [150, 240] as [number, number],
  /** Marine greift so viele Sekunden nach Beginn ein (Wahrscheinlichkeit) */
  marineAfter: 55,
  marineChance: 0.55,
  /** Schiffe je Seite */
  perSide: [2, 3] as [number, number],
  /** Schaden der Schüsse von KI-Schiffen untereinander (Anteil), damit eine Schlacht lange genug dauert, um einzugreifen */
  aiDamage: 0.5,
  /** Großschlachten der Mächte (Phase 4.5A): KI-Treffer untereinander wirken verstärkt (entscheidende Schlachten in wenigen Minuten) */
  warDamage: 1.5,
  /** Abstand zur Grenzfestung (Meter entlang der Linie), den eine Schlacht einhält: Riffe und Festungsgeschütze */
  fortClear: 320,
  /** Anzeige-Reichweite für Kompass und Karte (Meter) */
  markRange: 3500,
} as const;

export interface BattleSite {
  borderIndex: number;
  /** Mitte der Schlacht (auf der Grenzlinie) */
  x: number; z: number;
  /** Seite 0 = Macht des Kuchenstücks vor der Linie (kleinerer Peilwinkel), Seite 1 = die dahinter */
  a: PowerId;
  b: PowerId;
  /** Richtung der Linie (Bogenmaß, 0 = +z) und Einheitsvektor quer zur Linie, in Richtung von Seite 1 */
  along: { x: number; z: number };
  across: { x: number; z: number };
}

/** Einheitsvektoren einer Grenzlinie: entlang (vom Mittelpunkt nach außen) und quer (zur Macht mit dem größeren Peilwinkel) */
export function borderAxes(borderIndex: number) {
  const a = (BORDERS[borderIndex].deg * Math.PI) / 180;
  return { along: { x: Math.sin(a), z: Math.cos(a) }, across: { x: Math.cos(a), z: -Math.sin(a) } };
}

/** Abstand des Punkts von der Grenzlinie (vorzeichenbehaftet, + = Seite 1) und Lage entlang der Linie */
export function borderCoords(borderIndex: number, x: number, z: number) {
  const { along, across } = borderAxes(borderIndex);
  return { along: x * along.x + z * along.z, across: x * across.x + z * across.z };
}

/**
 * Wo könnte jetzt eine Schlacht beginnen? Liegt der Spieler näher als `reach` an einer Grenzlinie (im Bereich `minAlong … maxAlong`), wird ein
 * Punkt auf der Linie gewählt, der 640 bis 860 m vom Spieler entfernt ist. Sonst null.
 * `rnd` liefert Zufallswerte 0 … 1 (testbar mit festen Folgen).
 */
export function battleSite(px: number, pz: number, rnd: () => number = Math.random): BattleSite | null {
  let best = -1, bestAcross = Infinity, bestAlong = 0;
  for (const b of BORDERS) {
    const c = borderCoords(b.borderIndex, px, pz);
    if (c.along < BATTLE.minAlong - 300 || c.along > BATTLE.maxAlong + 300) continue;
    if (Math.abs(c.across) < Math.abs(bestAcross)) { best = b.borderIndex; bestAcross = c.across; bestAlong = c.along; }
  }
  if (best < 0 || Math.abs(bestAcross) > BATTLE.reach) return null;
  const D = BATTLE.spawnMin + rnd() * (BATTLE.spawnMax - BATTLE.spawnMin);
  const dAlong = Math.sqrt(Math.max(0, D * D - bestAcross * bestAcross));
  // nie in die Riffe oder unter die Geschütze der Grenzfestung, nie außerhalb des Schlachtbands: sonst die andere Richtung versuchen
  const fort = BORDER_FORTS.find((f) => f.borderIndex === best);
  const fits = (v: number) => v >= BATTLE.minAlong && v <= BATTLE.maxAlong && !(fort && Math.abs(v - fort.radius) < BATTLE.fortClear);
  let sign = rnd() < 0.5 ? -1 : 1;
  let at = bestAlong + sign * dAlong;
  if (!fits(at)) { sign = -sign; at = bestAlong + sign * dAlong; }
  if (!fits(at)) return null;
  const { along, across } = borderAxes(best);
  const [a, b] = BORDERS[best].between;
  return { borderIndex: best, x: along.x * at, z: along.z * at, a, b, along, across };
}

/** Anzahl Schiffe je Seite (2 oder 3) */
export const sideSize = (rnd: () => number = Math.random): number => BATTLE.perSide[0] + Math.floor(rnd() * (BATTLE.perSide[1] - BATTLE.perSide[0] + 1));

/** Wartezeit bis zur nächsten Schlacht */
export const nextDelay = (first: boolean, rnd: () => number = Math.random): number => {
  const [lo, hi] = first ? BATTLE.firstDelay : BATTLE.cooldown;
  return lo + rnd() * (hi - lo);
};

/** Peilung (Grad, 0 = Norden, im Uhrzeigersinn) von einer Lage zu einem Punkt, für Meldungen („NO“, „SW“ …) */
export function compassWord(fromX: number, fromZ: number, toX: number, toZ: number): string {
  const deg = (((Math.atan2(toX - fromX, toZ - fromZ) * 180) / Math.PI) + 360) % 360;
  // Osten liegt in dieser Welt bei −x (siehe Kompass): Weltwinkel und Kompasswinkel sind gespiegelt
  const c = (360 - deg) % 360;
  return ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round(c / 45) % 8];
}
