// Phase 4.9 – Bugspriet und Vorstag als reine Rechnung (kein three.js): `buildShip` setzt die Netze danach, die Prüfungen rechnen dieselben
// Zahlen nach. Alles in der Mittelebene des Schiffs (x = 0) in Schiffskoordinaten: z nach vorn, y nach oben.
//
// Die Vorsegel (Klüver, Stagsegel) sind seit 4.9 auf Wunsch des Spielers ganz entfallen: sie hingen als schmale Dreiecke frei vor dem Fockmast,
// schnitten Bugspriet und Galionsfigur und reichten bei großen Schiffen bis ins Wasser. Am Bug bleiben das Bugspriet und der Vorstag vom
// Fockmast-Topp zur Bugspriet-Nock. Regeln:
// - Der Vorstag (Leine samt Durchhang) geht über alle Punkte der Umrisslinie der Galionsfigur (obere konvexe Hülle in der Seitenansicht,
//   `FigureheadDef.profile`, samt Abstand) und über die Kopfhöhe am Vorsteven hinweg – eine Gerade über allen Ecken einer oberen konvexen Hülle
//   liegt über der ganzen Hülle – und endet vor der Figur.
// - Das Bugspriet ist mindestens ein Viertel der Schiffslänge lang (wie bisher) und wird nur so weit länger, wie der Vorstag es verlangt
//   (höchstens `BOW_RIG.maxLenK` der Länge).

export interface P2 { z: number; y: number }

/** Deckssprung: Bug und Heck steigen an (bei großen Schiffen begrenzt) */
export function sheerAt(t: number, L: number): number {
  const k = Math.min(1.6, L / 15) * 0.55;
  // stärkerer, weich auslaufender Deckssprung (Bug steigt kräftig, Heck sanfter)
  return (t > 0 ? Math.pow(t, 2.4) * 1.75 : t * t * 0.95) * k;
}

/** Vorsprung des Stevens: der Bug neigt sich oben nach vorn (geschwungener Vorsteven statt senkrechter Wand) */
export function rakeAt(t: number, L: number): number {
  const u = Math.max(0, (t - 0.72) / 0.28);
  return L * 0.075 * u * u;
}

/** Deckshöhe einer Klasse (Bordwand wächst mit der Schiffsgröße) – dieselbe Formel wie im Rumpfbau */
export function deckHeightOf(c: { L: number; decks: number }): number {
  return (1.4 + c.decks * 0.75) * Math.pow(Math.max(1, c.L / 24), 0.6);
}

/** Höhe eines Masts über Deck (Fockmast bei mehreren Masten etwas kürzer, Besan bei drei und mehr) */
export function mastHeightOf(c: { mh: number; masts: readonly number[] }, mi: number): number {
  return c.mh * (mi === 0 && c.masts.length > 1 ? 0.92 : mi === c.masts.length - 1 && c.masts.length > 2 ? 0.8 : 1);
}

export interface BowRigIn {
  /** Länge der Klasse, Deckshöhe an der Mitte (D), Bug-Spitze (z) und Höhe der Reling am Bug (bowTop) */
  L: number; D: number; bowZ: number; bowTop: number;
  /** Fockmast: Lage (z) und Höhe über Deck */
  foreZ: number; foreH: number;
  /** Maßstab der Rundhölzer (Schiffsgröße) */
  sc: number;
  /**
   * Galionsfigur: vorderste Spitze (z) und höchster Punkt (y) in Schiffskoordinaten, dazu die obere Umrisslinie (Punkte vom höchsten Punkt
   * nach vorn, Seitenansicht); ohne Umrisslinie zählt die Ecke (front, top). null = keine Figur.
   */
  figure: { front: number; top: number; profile?: readonly P2[] } | null;
}

/** Eingabe der Bug-Rechnung aus den Maßen einer Klasse und der Galionsfigur (Ausdehnung in Schiffskoordinaten) */
export function bowRigInput(c: { L: number; mh: number; masts: readonly number[]; decks: number }, figure: BowRigIn['figure']): BowRigIn {
  const D = deckHeightOf(c);
  return { L: c.L, D, bowZ: c.L / 2 + rakeAt(1, c.L), bowTop: D + sheerAt(1, c.L), foreZ: c.masts[0] * c.L, foreH: mastHeightOf(c, 0), sc: c.L / 15, figure };
}

export interface BowRig {
  sprit: { heel: P2; tip: P2; mid: P2; len: number; tilt: number; rHeel: number; rTip: number };
  /** Vorstag: Fockmast-Topp (a) → Oberkante der Bugspriet-Nock (b) */
  stay: { a: P2; b: P2 };
  /** Punkte, über die der Vorstag hinweggeht: Umrisslinie der Figur samt Abstand und die Kopfhöhe am Vorsteven */
  clear: P2[];
  margin: number;
}

export const BOW_RIG = {
  /** Neigung des Bugspriets (rad) und Mindestlänge (Anteil der Schiffslänge), Austritt unter der Reling am Vorsteven (m) */
  tilt: 0.25, lenK: 0.25, exit: 0.15,
  /** Abstand zur Figur (m, wächst etwas mit der Schiffsgröße), Kopfhöhe über dem Vordeck (m) */
  margin: 0.2, marginSc: 0.03, headroom: 1.9,
  /** Abstand des Vorstags über den Umrisspunkten (m), Suchschritt (m), größte Bugspriet-Länge (Anteil der Schiffslänge) */
  stayClear: 0.08, step: 0.1, maxLenK: 0.42,
  /** Anschlag des Vorstags am Fockmast (Anteil der Masthöhe) */
  stayTop: 0.94,
} as const;

const clampK = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Durchhang des Vorstags (m, straff gespannt) */
export function BOW_STAY_SAG(sc: number): number { return 0.06 + 0.015 * sc; }

/** Höhe der Bugspriet-Oberkante an der Stelle z (Achse + Radius, senkrecht gemessen) */
export function spritTop(r: Pick<BowRig, 'sprit'>, z: number): number {
  const s = r.sprit, span = Math.max(1e-6, s.tip.z - s.heel.z);
  const k = clampK((z - s.heel.z) / span, 0, 1);
  const axis = s.heel.y + (z - s.heel.z) * Math.tan(s.tilt);
  return axis + (s.rHeel + (s.rTip - s.rHeel) * k) / Math.cos(s.tilt);
}

/**
 * Abstand eines Stags (Gerade a → b mit Durchhang `sag` in der Mitte) über den Punkten von `clear` (negativ = durch Figur oder Kopfhöhe).
 * Ein Stag, das nicht vor allen Punkten endet, gilt als verletzt.
 */
export function stayClearance(r: Pick<BowRig, 'clear'>, a: P2, b: P2, sag = 0): number {
  let c = Number.POSITIVE_INFINITY;
  const span = b.z - a.z;
  for (const p of r.clear) {
    if (p.z >= b.z - 1e-6) return -1;
    if (p.z <= a.z || span <= 1e-6) continue;
    const t = (p.z - a.z) / span;
    const y = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t);
    if (y - p.y < c) c = y - p.y;
  }
  return c;
}

/** Bugspriet und Vorstag für eine Klasse */
export function bowRig(i: BowRigIn): BowRig {
  const m = BOW_RIG.margin + BOW_RIG.marginSc * Math.min(4, i.sc);
  const tilt = BOW_RIG.tilt, ct = Math.cos(tilt), st = Math.sin(tilt);
  // Umrisslinie der Figur samt Abstand (ohne Figur eine niedrige Bugzier knapp über der Reling) und die Kopfhöhe am Vorsteven
  const clear: P2[] = [{ z: i.bowZ, y: i.bowTop + BOW_RIG.headroom }];
  const fi = i.figure;
  if (fi && fi.profile && fi.profile.length) for (const p of fi.profile) clear.push({ z: p.z + m, y: p.y + m });
  else if (fi) clear.push({ z: fi.front + m, y: fi.top + m });
  else clear.push({ z: i.bowZ + 0.4 + m, y: i.bowTop + 0.6 + m });
  // Fuß des Rundholzes: knapp hinter dem Vorsteven unter der Reling (wie bisher); die Achse liegt damit fest, nur die Länge wächst
  const base = i.L * BOW_RIG.lenK;
  const mid0 = { z: i.bowZ + i.L * 0.08, y: i.bowTop - BOW_RIG.exit };
  const heel = { z: mid0.z - (base / 2) * ct, y: mid0.y - (base / 2) * st };
  const a = { z: i.foreZ, y: i.D + i.foreH * BOW_RIG.stayTop };
  const rig: BowRig = {
    sprit: { heel, tip: { z: 0, y: 0 }, mid: { z: 0, y: 0 }, len: base, tilt, rHeel: 0.12 * i.sc, rTip: 0.08 * i.sc },
    stay: { a, b: { z: 0, y: 0 } }, clear, margin: m,
  };
  const sag = BOW_STAY_SAG(i.sc);
  const setLen = (len: number) => {
    const s = rig.sprit;
    s.len = len;
    s.tip = { z: heel.z + len * ct, y: heel.y + len * st };
    s.mid = { z: (heel.z + s.tip.z) / 2, y: (heel.y + s.tip.y) / 2 };
    rig.stay.b = { z: s.tip.z, y: spritTop(rig, s.tip.z) + 0.03 };
  };
  // so kurz wie möglich (Grundlänge), so lang wie der Vorstag über der Figur verlangt, höchstens `maxLenK`
  const maxLen = Math.max(base, i.L * BOW_RIG.maxLenK);
  let len = base;
  setLen(len);
  for (let k = 0; k < 400 && len < maxLen && stayClearance(rig, a, rig.stay.b, sag) < BOW_RIG.stayClear; k++) {
    len = Math.min(maxLen, len + BOW_RIG.step);
    setLen(len);
  }
  return rig;
}
