// Entzerrung der Welt (Phase 4.5C): Abbildung der Abstände vom Weltmittelpunkt aus der Welt bis 4.5.1 (spielbarer Radius 10 400 m, vier Ringe)
// auf die erweiterte Welt (15 600 m, fünf Ringe). Reine Rechnung ohne three.js und ohne Inseldaten.
//
// Alle Inseln, Festungen und Mega-Inseln der Welt bis 4.5.1 stehen seit 4.5C genau dort, wohin diese Abbildung ihre alte Lage bringt (die Tabellen in
// data/regions.ts, data/openWorld.ts, data/megaIslands.ts und data/factions.ts tragen die neuen Zahlen). Die Richtung (Winkel) bleibt, nur der
// Abstand wächst – stückweise linear und streng steigend, also umkehrbar: so hebt die Migration des Spielstands (Version 20 → 21,
// core/save/worldMigration.ts) Schiffe, Armadas, Karten-Zonen und Ereignisse auf das neue Raster, ohne dass sich die Reihenfolge der Orte ändert.
//
// Knoten (alter Abstand → neuer Abstand):
//   •     0 →     0 und   250 →   250  Ankerglück und der Heimatplatz bleiben, wo sie sind (Stadtplan, Steg, HOME_SPAWN)
//   •  1 500 →  2 300                  die Bernsteinsee rückt um gut 60 % auseinander: die Kartenmitte ist nicht mehr überladen
//   •  2 200 →  2 800                  Ende Ring 1
//   •  5 200 →  6 600                  Ende Ring 2 (Handels-Archipele)
//   •  8 200 → 10 200                  Ende Ring 3 (Riff- und Sturmgürtel mit den sechs Mega-Inseln)
//   • 10 400 → 13 000                  Ende Ring 4 (Königs-Meere); dahinter liegt neu Ring 5, die Äußeren Kaiser-Meere
// Jenseits des letzten Knotens gilt dessen Steigung weiter.

export const SPREAD_KNOTS: readonly (readonly [number, number])[] = [
  [0, 0], [250, 250], [1500, 2300], [2200, 2800], [5200, 6600], [8200, 10200], [10400, 13000],
];

function lerpKnots(d: number, from: 0 | 1, to: 0 | 1): number {
  const K = SPREAD_KNOTS;
  const v = Math.max(0, d);
  for (let i = 1; i < K.length; i++) {
    if (v <= K[i][from]) {
      const a = K[i - 1], b = K[i];
      const t = (v - a[from]) / (b[from] - a[from]);
      return a[to] + (b[to] - a[to]) * t;
    }
  }
  const a = K[K.length - 2], b = K[K.length - 1];
  return b[to] + ((v - b[from]) * (b[to] - a[to])) / (b[from] - a[from]);
}

/** Neuer Abstand vom Mittelpunkt zu einem alten (4.5.1) */
export const spreadDist = (d: number): number => lerpKnots(d, 0, 1);
/** Alter Abstand (4.5.1) zu einem neuen: genaue Umkehrung von `spreadDist` */
export const unspreadDist = (d: number): number => lerpKnots(d, 1, 0);

/** Punkt der alten Welt auf die neue heben (Richtung bleibt); `out` wird gefüllt und zurückgegeben */
export function spreadPoint(x: number, z: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const d = Math.hypot(x, z);
  if (!(d > 1e-6)) { out.x = x; out.z = z; return out; }
  const k = spreadDist(d) / d;
  out.x = x * k; out.z = z * k;
  return out;
}

/** Punkt der neuen Welt auf die alte zurückrechnen (für die Migration: wo stand diese Insel in Version 20?) */
export function unspreadPoint(x: number, z: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const d = Math.hypot(x, z);
  if (!(d > 1e-6)) { out.x = x; out.z = z; return out; }
  const k = unspreadDist(d) / d;
  out.x = x * k; out.z = z * k;
  return out;
}
