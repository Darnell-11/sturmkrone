// Der natürliche Rand der Welt (Phase 4.3A): statt einer unsichtbaren Wand eine zweistufige Sturm-Zone. Reine Rechnung ohne three.js.
//
// Zwischen `SOFT_WORLD_RADIUS` und `HARD_WORLD_RADIUS` wächst die Stärke k von 0 auf 1 (weich, ohne Knick an beiden Enden). Mit k verdichten sich
// Gewitterwolken und Seegang (`Weather.edgeStorm`), dreht der Wind nach innen (`Environment.edgeWind`), wächst die See als Widerstand und
// schiebt eine Gegenströmung das Schiff Richtung Mitte der Welt. Die Strömung ist stärker als jedes Schiff unter Segeln: wer hinausfährt, kommt
// nicht weiter, wer treiben lässt, wird zurück ins Spielgebiet getragen. Die harte Kappe bei `HARD_WORLD_RADIUS` bleibt nur als Sicherung
// gegen Stoßfahrt (Volle Kraft voraus) und kaputte Zahlen.
import { clamp01 } from '../core/mathUtil';
import { EDGE_WALL, PLAYABLE_RADIUS } from '../data/world';

/** Ab hier beginnt die Sturmsee: der Rand des spielbaren Ozeans (10 400 m, seit 4.3B), hinter allen Inseln und Festungen */
export const SOFT_WORLD_RADIUS = PLAYABLE_RADIUS;
/** Hier ist der Sturm am dichtesten; weiter hinaus kommt nichts (dieselbe Grenze wie die frühere unsichtbare Wand) */
export const HARD_WORLD_RADIUS = EDGE_WALL;
/** Gegenströmung bei k = 1 in m/s: über der Höchstfahrt aller Schiffe unter Segeln (rund 14 m/s); die Zone ist seit 4.3B nur 200 m breit, darum kräftiger */
export const EDGE_PUSH_MAX = 20;
/** Zusätzlicher Widerstand der Sturmsee (1/s bei k = 1): wer hineinfährt, wird langsamer, statt an der Grenze zu kleben */
export const EDGE_DRAG = 0.9;

/** Text der Warnung auf der Anzeige */
export const EDGE_WARNING = 'Unerforschte Sturmsee – Rückkehr empfohlen';

/** Lage in der Sturm-Zone: Stärke k (0 … 1), Abstand zur Mitte, Einheitsvektor nach innen */
export interface EdgeZone { k: number; dist: number; inX: number; inZ: number }

export function newEdgeZone(): EdgeZone { return { k: 0, dist: 0, inX: 0, inZ: 0 }; }

/** Stärke 0 … 1 zu einem Abstand von der Mitte (weich: Steigung 0 an beiden Enden) */
export function edgeStrength(dist: number): number {
  const t = clamp01((dist - SOFT_WORLD_RADIUS) / (HARD_WORLD_RADIUS - SOFT_WORLD_RADIUS));
  return t * t * (3 - 2 * t);
}

/** Zone an einem Punkt; ungültige Zahlen (NaN) und die Mitte der Welt liefern k = 0 */
export function edgeZoneAt(x: number, z: number, out: EdgeZone): EdgeZone {
  const d = Math.sqrt(x * x + z * z);
  out.dist = d;
  if (!(d > SOFT_WORLD_RADIUS)) { out.k = 0; out.inX = 0; out.inZ = 0; return out; }
  out.k = edgeStrength(d);
  out.inX = -x / d;
  out.inZ = -z / d;
  return out;
}

/** Gegenströmung in m/s bei Stärke k */
export function edgePush(k: number): number { return EDGE_PUSH_MAX * k; }

/** Warnstufe der Anzeige: 0 keine, 1 Hinweis, 2 Gefahr (die Strömung ist schon spürbar) */
export function edgeWarningLevel(k: number): 0 | 1 | 2 {
  return k >= 0.35 ? 2 : k >= 0.02 ? 1 : 0;
}

/** Was die Strömung an einem Schiff ändert: Lage und Fahrt (das Schiff bewegt sich in seiner Blickrichtung, die Fahrt bleibt eine Zahl) */
export interface EdgeBody { x: number; z: number; speed: number }

/** Harte Kappe: nie hinter `HARD_WORLD_RADIUS` (Raids kennen keine Sturmsee, nur diese Grenze); true, wenn gekappt wurde */
export function clampToHardRadius(b: EdgeBody): boolean {
  const d = Math.sqrt(b.x * b.x + b.z * b.z);
  if (!(d > HARD_WORLD_RADIUS)) return false;
  const s = HARD_WORLD_RADIUS / d;
  b.x *= s; b.z *= s;
  b.speed *= 0.85;
  return true;
}

/**
 * Einen Zeitschritt Sturmsee auf ein Schiff anwenden: Strömung nach innen, Widerstand, harte Kappe. Liefert true, wenn das Schiff in der Zone ist.
 * Allokiert nichts (die Zone wird wiederverwendet). Kaputte Zahlen im Schiff (NaN) setzen es auf die Grenze zurück, statt sich fortzupflanzen.
 */
export function applyEdgeDrift(b: EdgeBody, dt: number, zone: EdgeZone): boolean {
  if (!Number.isFinite(b.x) || !Number.isFinite(b.z)) { b.x = 0; b.z = 0; b.speed = 0; zone.k = 0; return false; }
  edgeZoneAt(b.x, b.z, zone);
  if (zone.k > 0) {
    const push = edgePush(zone.k) * dt;
    b.x += zone.inX * push;
    b.z += zone.inZ * push;
    b.speed *= Math.exp(-EDGE_DRAG * zone.k * dt);
  }
  // Sicherung: nie hinter die harte Grenze (Stoßfahrt, Teleport)
  if (clampToHardRadius(b)) zone.k = 1;
  return zone.k > 0;
}
