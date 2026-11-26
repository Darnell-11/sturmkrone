// Phase 4.7D – reine Geometrie der Prolog-Bühne (ohne three.js, prüfbar): Bühnen-Rahmen und das Gelände von Grünmarkt.
// Die Netze baut world/prologueStage.ts aus genau diesen Funktionen (Geländeraster, Häuser, Laternen, Bewohner, Brandstellen).
import { GRUENMARKT } from '../data/prologue';

/** Bühnen-Rahmen: Ursprung (Welt) und Richtung (rad, wie ein Schiffskurs: lokales +z zeigt nach (sin h, cos h), lokales +x nach (cos h, −sin h)) */
export interface StageFrame { x: number; z: number; h: number }

/** Punkt im Rahmen (lokal x, y, z) → Welt */
export function frameToWorld(f: StageFrame, lx: number, ly: number, lz: number, out: { x: number; y: number; z: number }) {
  const c = Math.cos(f.h), s = Math.sin(f.h);
  out.x = f.x + lx * c + lz * s;
  out.y = ly;
  out.z = f.z - lx * s + lz * c;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Gelände von Grünmarkt (Stadt-Rahmen): flache Uferterrasse an der Kaimauer, sanfter Hügel landeinwärts, ringsum Strand und Meer
// ---------------------------------------------------------------------------------------------------------------

/** Küstenlinie (lokales z) über x: in der Mitte die Kaimauer bei z = 0, zu den Seiten biegt die Küste zurück */
export const gmCoastZ = (x: number): number => (Math.abs(x) < 64 ? 0 : -0.012 * (Math.abs(x) - 64) * (Math.abs(x) - 64)) + 0.8 * Math.sin(x * 0.07);

/** Gelände ohne Bauplätze: Uferterrasse, Hügel landeinwärts (Mitte bei z = −62, Halbachsen 70 × 48 m), ringsum Strand und Meer */
function gmBase(x: number, z: number): number {
  const G = GRUENMARKT;
  const cz = gmCoastZ(x);
  // Abstand landeinwärts von der Küste, dazu die Ränder der Insel (Seiten und Rücken fallen ebenfalls ins Meer)
  const inland = cz - z;
  const side = 118 - Math.abs(x) * 1.0;
  const back = z + 150;
  const edge = Math.min(inland, side, back);
  if (edge < 0) return Math.max(-5, G.plateau * 0.45 + edge * 0.22);
  // Uferstreifen (Kaimauer, Straße): flach; dahinter steigt der Hügel sanft an (weiche Kuppe: Smoothstep des Anteils 0 … 1, mal Hügelhöhe)
  const terrace = edge < 3 ? G.plateau * (0.55 + 0.45 * (edge / 3)) : G.plateau;
  const hx = x / 70, hz = (z + 62) / 48;
  const hk = Math.max(0, 1 - Math.sqrt(hx * hx + hz * hz));
  const hill = G.hill * hk * hk * (3 - 2 * hk);
  const ripple = 0.35 * Math.sin(x * 0.11 + z * 0.07) * Math.min(1, edge / 20);
  return terrace + hill * Math.min(1, edge / 14) + ripple * (edge > 8 ? 1 : 0);
}

/**
 * Ebene Bauplätze der Häuser am Hang (hintere Reihen): Mitte, Höhe, Radius (Grundriss samt Überstand) – das Gelände geht weich in sie über
 * (wie `addPad`). Überlappende Übergänge mischen die Bauplatz-Höhen gewichtet: die Fläche bleibt stetig, egal in welcher Reihenfolge.
 */
const PAD_SOFT = 4.5;
const PAD_R: Partial<Record<string, number>> = { fachwerkhaus: 4.4, steinhaus: 4.4, holzhuette: 3.8, kapelle: 7, gasthaus: 5.6, lagerhaus: 6.3 };
const GM_PADS: readonly (readonly [number, number, number, number])[] = GRUENMARKT.houses
  .filter(([, , z]) => z < -20)
  .map(([t, x, z]) => [x, z, gmBase(x, z), PAD_R[t] ?? 4.5] as const);

/** Bodenhöhe von Grünmarkt im Stadt-Rahmen (m über dem Meer; unter 0 = Meeresgrund) */
export function gmHeight(x: number, z: number): number {
  const h = gmBase(x, z);
  let wsum = 0, acc = 0;
  for (const [px, pz, py, r] of GM_PADS) {
    const dx = x - px, dz = z - pz;
    if (Math.abs(dx) > r + PAD_SOFT || Math.abs(dz) > r + PAD_SOFT) continue;
    const d = Math.hypot(dx, dz);
    if (d >= r + PAD_SOFT) continue;
    const s = d <= r ? 0 : (d - r) / PAD_SOFT;
    const w = 1 - s * s * (3 - 2 * s);
    wsum += w; acc += w * py;
  }
  if (wsum <= 0) return h;
  return h + (acc / wsum - h) * Math.min(1, wsum);
}

// ---------------------------------------------------------------------------------------------------------------
// 4.7D.1: Ausrichtung der Admirals-Flaggschiffe – Bug und Galionsfigur frontal auf die Schwarze Krone
// ---------------------------------------------------------------------------------------------------------------

/** Kurs (rad, wie `Ship.heading`: vorn = (sin h, cos h)), mit dem ein Schiff bei (x, z) mit dem Bug genau auf (tx, tz) zeigt */
export const headingToward = (x: number, z: number, tx: number, tz: number): number => Math.atan2(tx - x, tz - z);

/** Winkel zwischen der Bugrichtung eines Kurses und der Richtung zu einem Ziel (rad, 0 = Bug genau auf dem Ziel) */
export function bowError(x: number, z: number, heading: number, tx: number, tz: number): number {
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (fx * dx + fz * dz) / l)));
}

/** Lage eines Schiffs (Welt) */
export interface FleetPose { x: number; z: number; heading: number }

/**
 * Schlachtreihe vor einem Ziel: Plätze im Rahmen `f` (lokal x = Platz × Abstand quer, z = Tiefe + |Platz| × Staffel), jedes Schiff mit dem Bug
 * frontal auf den Zielpunkt (Welt) – die Reihe „zielt“ wie ein Fächer auf die Schwarze Krone (je weiter außen, desto stärker eingedreht).
 */
export function fleetFacing(f: StageFrame, slots: readonly number[], gap: number, depth: number, stagger: number, tx: number, tz: number, out: FleetPose[] = []): FleetPose[] {
  const p = { x: 0, y: 0, z: 0 };
  out.length = slots.length;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    frameToWorld(f, s * gap, 0, depth + Math.abs(s) * stagger, p);
    const o = out[i] ?? (out[i] = { x: 0, z: 0, heading: 0 });
    o.x = p.x; o.z = p.z; o.heading = headingToward(p.x, p.z, tx, tz);
  }
  return out;
}

/**
 * Bugdeck eines (maßstäblich vergrößerten) Schiffs: Punkt auf dem Vorschiff, von dem aus die Admirale ihre Aura in den Kern senden –
 * `ahead` = Anteil der halben Länge vor der Mitte, Höhe über der Wasserlinie aus Deckshöhe und Maßstab.
 */
export function bowDeck(x: number, z: number, heading: number, length: number, deckY: number, scale: number, out: { x: number; y: number; z: number }, ahead = 0.82, lift = 2.5) {
  const r = length * 0.5 * ahead * scale;
  out.x = x + Math.sin(heading) * r;
  out.z = z + Math.cos(heading) * r;
  out.y = deckY * scale + lift;
  return out;
}

/**
 * Lage der hohen See (Sturmjagd) zu Grünmarkt: die Schwarze Krone liegt HINTER der Stadt (lokales −z des Stadt-Rahmens), die Admirale kommen
 * von See (lokales +z) – in der Gewitterfront zeigen ihre Bugs damit zugleich auf Grünmarkt, die Kamera auf den Dächern und die Krone.
 * Liefert den bevorzugten Winkel (rad) vom Stadt-Ursprung aus, wie `Math.atan2(dx, dz)`.
 */
export const crownBearing = (town: StageFrame): number => town.h + Math.PI;
