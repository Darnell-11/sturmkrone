// Reine Erzeugung der PBR-Sätze (Phase 4.4A): kachelbare Höhenfelder je Oberfläche, daraus Albedo, Normalkarte und ORMH (Verdeckung, Rauheit, Metall,
// Höhe). Ohne three.js und ohne DOM: läuft im Web Worker beim Start (graphics/forgeWorker.ts), im Hauptfaden als Rückfall und in den Tests.

/** Alle Oberflächen der Schmiede */
export type ForgeKind =
  | 'rumpf_alt' | 'rumpf' | 'rumpf_edel'
  | 'kanonenstahl' | 'messing' | 'stahl' | 'segeltuch'
  | 'fels_kalk' | 'fels_basalt' | 'fels_obsidian' | 'sand' | 'boden'
  | 'mauerwerk' | 'ziegel' | 'fachwerk' | 'hafenholz'
  | 'stoff' | 'leder' | 'griffwicklung';

export const FORGE_KINDS: readonly ForgeKind[] = [
  'rumpf_alt', 'rumpf', 'rumpf_edel', 'kanonenstahl', 'messing', 'stahl', 'segeltuch',
  'fels_kalk', 'fels_basalt', 'fels_obsidian', 'sand', 'boden', 'mauerwerk', 'ziegel', 'fachwerk', 'hafenholz', 'stoff', 'leder', 'griffwicklung',
];

/** Rezept: Grundrauheit, Metall, Reliefstärke (Normalkarte), Kachelgröße in Metern (Welt-/Körperraum), ob die Textur Farbe trägt und ob sie über UV läuft */
export interface ForgeRecipe {
  /** mittlere Rauheit (G-Kanal schwankt um diesen Wert) */
  rough: number;
  metal: number;
  /** Reliefstärke der Normalkarte (1 = normal) */
  relief: number;
  /** Meter je Kachel, wenn das Muster im Objektraum liegt (Dreiseiten-Projektion) */
  tile: number;
  /** Relieftiefe in Metern für das Bildschirm-Relief aus dem Höhenkanal */
  depth: number;
  /** trägt eine Farbkarte (Albedo) */
  albedo: boolean;
  /** Normalkarte über UV (Rumpf, Segel); sonst Relief aus dem Höhenkanal */
  uvNormal: boolean;
  label: string;
}

export const FORGE_RECIPES: Record<ForgeKind, ForgeRecipe> = {
  rumpf_alt: { rough: 0.9, metal: 0, relief: 1.35, tile: 4, depth: 0.004, albedo: true, uvNormal: true, label: 'Verwitterte Rumpfplanken' },
  rumpf: { rough: 0.72, metal: 0, relief: 1, tile: 4, depth: 0.003, albedo: true, uvNormal: true, label: 'Geölte Rumpfplanken' },
  rumpf_edel: { rough: 0.4, metal: 0, relief: 0.7, tile: 4, depth: 0.002, albedo: true, uvNormal: true, label: 'Seidenmattes Mahagoni/Ebenholz' },
  kanonenstahl: { rough: 0.46, metal: 1, relief: 1.1, tile: 0.6, depth: 0.0015, albedo: false, uvNormal: false, label: 'Gehämmerter Kanonenstahl' },
  messing: { rough: 0.3, metal: 1, relief: 0.6, tile: 0.35, depth: 0.0004, albedo: false, uvNormal: false, label: 'Gebürstetes Messing' },
  stahl: { rough: 0.24, metal: 1, relief: 0.5, tile: 0.4, depth: 0.0003, albedo: false, uvNormal: false, label: 'Polierter Klingenstahl' },
  segeltuch: { rough: 0.92, metal: 0, relief: 1, tile: 0.6, depth: 0.0006, albedo: false, uvNormal: true, label: 'Segeltuch-Gewebe' },
  fels_kalk: { rough: 0.86, metal: 0, relief: 1.2, tile: 6, depth: 0.08, albedo: false, uvNormal: false, label: 'Kalkstein' },
  fels_basalt: { rough: 0.8, metal: 0, relief: 1.3, tile: 5, depth: 0.1, albedo: false, uvNormal: false, label: 'Basalt' },
  fels_obsidian: { rough: 0.22, metal: 0, relief: 2.4, tile: 6, depth: 0.08, albedo: false, uvNormal: false, label: 'Obsidian' },
  sand: { rough: 0.94, metal: 0, relief: 0.8, tile: 3, depth: 0.012, albedo: false, uvNormal: false, label: 'Ufersand' },
  boden: { rough: 0.95, metal: 0, relief: 1, tile: 4, depth: 0.03, albedo: false, uvNormal: false, label: 'Waldboden und Asche' },
  mauerwerk: { rough: 0.86, metal: 0, relief: 1.2, tile: 0.62, depth: 0.012, albedo: false, uvNormal: false, label: 'Mauerquader (Steinmetzspuren)' },
  ziegel: { rough: 0.72, metal: 0, relief: 1, tile: 0.24, depth: 0.01, albedo: false, uvNormal: false, label: 'Dachziegel' },
  fachwerk: { rough: 0.86, metal: 0, relief: 1.2, tile: 1.6, depth: 0.006, albedo: false, uvNormal: false, label: 'Fachwerkbalken' },
  hafenholz: { rough: 0.9, metal: 0, relief: 1.2, tile: 2.4, depth: 0.005, albedo: false, uvNormal: false, label: 'Hafenholz' },
  stoff: { rough: 0.9, metal: 0, relief: 1, tile: 0.08, depth: 0.0005, albedo: false, uvNormal: false, label: 'Köperstoff' },
  leder: { rough: 0.5, metal: 0, relief: 1, tile: 0.12, depth: 0.0009, albedo: false, uvNormal: false, label: 'Narbenleder' },
  griffwicklung: { rough: 0.6, metal: 0, relief: 1.2, tile: 0.06, depth: 0.0012, albedo: false, uvNormal: false, label: 'Griffwicklung' },
};

/** Kantenlänge je Grafikstufe: Ultra und Max 1024 px, Hoch und Mittel 512 px, Niedrig 256 px (Speicher am Handy) */
export function forgeSizeForTier(tier: string): number {
  return tier === 'ultra' || tier === 'max' ? 1024 : tier === 'low' ? 256 : 512;
}

// ---------- kachelbares Rauschen (rein, ohne Zuweisungen je Pixel) ----------

function hash(i: number, j: number, s: number): number {
  let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Wertrauschen mit Periode (px, py) Gitterzellen: u, v in Kachelanteilen 0 … 1, Gitter fx × fy (ganze Zahlen → nahtlos) */
function vnoise(u: number, v: number, fx: number, fy: number, s: number): number {
  // u, v liegen in [0, 1): x, y sind nie negativ (kein doppeltes Modulo nötig)
  const x = u * fx, y = v * fy;
  const i = x | 0, j = y | 0;
  let tx = x - i, ty = y - j;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const i0 = i % fx, j0 = j % fy;
  const i1 = i0 + 1 === fx ? 0 : i0 + 1, j1 = j0 + 1 === fy ? 0 : j0 + 1;
  const a = hash(i0, j0, s), b = hash(i1, j0, s), c = hash(i0, j1, s), d = hash(i1, j1, s);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
}

/** Fraktales Rauschen (Oktaven verdoppeln die Frequenz, bleiben ganzzahlig → nahtlos) */
function fbm(u: number, v: number, fx: number, fy: number, oct: number, s: number): number {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) { sum += vnoise(u, v, fx << o, fy << o, s + o * 17) * amp; norm += amp; amp *= 0.5; }
  return sum / norm;
}

const _vor = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
/** Zellrauschen mit `n` × `n` Zellen je Kachel (nahtlos): Abstand zum nächsten und zweitnächsten Punkt (Kachelanteile × n), Zellnummer, Zellmitte */
function voronoi(u: number, v: number, n: number, s: number, jit = 0.9) {
  const x = u * n, y = v * n;
  const i = x | 0, j = y | 0;
  let f1 = 9, f2 = 9, id = 0, cx = 0, cy = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const ci = i + di, cj = j + dj;
    const wi = ci < 0 ? ci + n : ci >= n ? ci - n : ci, wj = cj < 0 ? cj + n : cj >= n ? cj - n : cj;
    const px = ci + 0.5 + (hash(wi, wj, s) - 0.5) * jit, py = cj + 0.5 + (hash(wi, wj, s + 7) - 0.5) * jit;
    const ex = px - x, ey = py - y;
    const d = Math.sqrt(ex * ex + ey * ey);
    if (d < f1) { f2 = f1; f1 = d; id = wi * 131 + wj; cx = px; cy = py; } else if (d < f2) f2 = d;
  }
  _vor.f1 = f1; _vor.f2 = f2; _vor.id = id; _vor.cx = cx; _vor.cy = cy;
  return _vor;
}

const smooth = (a: number, b: number, t: number) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
const fract = (x: number) => x - Math.floor(x);
const TAU = Math.PI * 2;

/** Ergebnis eines Bildpunkts: Höhe 0 … 1, Rauheit, Helligkeit der Albedo (0 … 1) und Farbstich (r, b relativ) */
interface Px { h: number; r: number; a: number; tr: number; tb: number }

/** Rumpfplanken: 8 Gänge je Kachel (wie die alte Rumpftextur: 4 m × 1,8 m), Kalfaterungsfugen, versetzte Stöße mit Holznägeln, Maserung */
function planks(u: number, v: number, o: Px, q: 0 | 1 | 2, seed: number) {
  const rows = 8;
  const rv = v * rows, ri = Math.floor(rv), fr = rv - ri;
  const seamW = q === 0 ? 0.075 : q === 1 ? 0.055 : 0.04;
  const seam = smooth(0, seamW, fr) * smooth(0, seamW, 1 - fr);
  const off = hash(ri, 3, seed) * 0.5 + ri * 0.37;
  const ju = fract(u * 2 + off);
  const jw = q === 0 ? 0.012 : 0.008;
  const joint = smooth(0, jw, ju) * smooth(0, jw, 1 - ju);
  const plank = ri * 2 + Math.floor(u * 2 + off);
  // Maserung: lange Jahresringe entlang u, durch Rauschen verbogen (ganzzahlige Frequenzen → nahtlos)
  const warp = fbm(u, v, 4, 8, 3, seed + plank);
  const ring = 0.5 + 0.5 * Math.sin(TAU * (v * rows * 9 + warp * (q === 2 ? 2.2 : 3.5)));
  const fine = vnoise(u, v, 64, 512, seed + 3);
  const grainAmp = q === 0 ? 0.32 : q === 1 ? 0.2 : 0.09;
  let h = 0.62 + (ring - 0.5) * grainAmp + (fine - 0.5) * 0.06 + (hash(plank, 9, seed) - 0.5) * 0.08;
  // Holznägel an den Stößen
  const nu = fract(u * 2 + off + 0.012), nv = fr;
  const na = nu * 120, nb = (nv - 0.22) * 34, nc = (nv - 0.78) * 34;
  const nail = Math.sqrt(na * na + Math.min(nb * nb, nc * nc));
  const peg = 1 - smooth(0.6, 1.0, nail);
  // Verwittert: Trockenrisse entlang der Maserung, ausgewaschene weiche Fasern
  let crack = 0;
  if (q === 0) {
    const c = Math.abs(fbm(u, v, 3, 24, 3, seed + 41) - 0.5);
    crack = 1 - smooth(0.0, 0.025, c);
    h -= crack * 0.28;
    h -= (fbm(u, v, 8, 16, 3, seed + 5) - 0.5) * 0.12;
  }
  h = h * seam * joint - peg * 0.12;
  o.h = Math.max(0, Math.min(1, h));
  const base = q === 0 ? 0.92 : q === 1 ? 0.72 : 0.4;
  o.r = Math.min(1, base + (fine - 0.5) * (q === 2 ? 0.06 : 0.12) + crack * 0.08 + (1 - seam) * (q === 2 ? 0.45 : 0.15));
  // Albedo: neutralgrau (die Rumpffarbe kommt aus den Eckpunktfarben), Fugen pechschwarz, verwittert ausgeblichen mit grauen Schlieren
  const tone = q === 0 ? 0.86 : q === 1 ? 0.78 : 0.7;
  let a = tone * (0.9 + (ring - 0.5) * (q === 2 ? 0.1 : 0.2) + (hash(plank, 5, seed) - 0.5) * 0.1);
  if (q === 0) a *= 0.92 + fbm(u, v, 2, 6, 3, seed + 77) * 0.16;
  a = a * (0.18 + 0.82 * seam) * (0.35 + 0.65 * joint) * (1 - peg * 0.55) * (1 - crack * 0.5);
  o.a = a; o.tr = q === 2 ? 0.04 : 0; o.tb = q === 0 ? 0.03 : 0;
}

function px(kind: ForgeKind, u: number, v: number, o: Px, seed: number) {
  o.tr = 0; o.tb = 0; o.a = 1;
  switch (kind) {
    case 'rumpf_alt': planks(u, v, o, 0, seed); return;
    case 'rumpf': planks(u, v, o, 1, seed); return;
    case 'rumpf_edel': planks(u, v, o, 2, seed); return;
    case 'kanonenstahl': {
      // gehämmert: flache Dellen je Hammerschlag (Zellrauschen), dazwischen Grate, feine Gusspocken
      const c = voronoi(u, v, 14, seed);
      const dent = c.f1 * c.f1;
      const ridge = smooth(0.0, 0.08, c.f2 - c.f1);
      const pits = smooth(0.9, 0.97, vnoise(u, v, 96, 96, seed + 2));
      o.h = Math.min(1, 0.35 + dent * 0.9) * (0.85 + 0.15 * ridge) - pits * 0.12 + (vnoise(u, v, 32, 32, seed + 5) - 0.5) * 0.06;
      o.r = 0.46 + (hash(c.id, 1, seed) - 0.5) * 0.16 + pits * 0.2 - (1 - ridge) * 0.08;
      return;
    }
    case 'messing':
    case 'stahl': {
      // gebürstet: feine Riefen längs u, einzelne Kratzer schräg, leichte Wolken
      const brush = vnoise(u, v, 6, 512, seed) * 0.6 + vnoise(u, v, 12, 1024, seed + 1) * 0.4;
      const sc = 1 - smooth(0, 0.006, Math.abs(fract(u * 3 + v * 7 + vnoise(u, v, 2, 2, seed + 9) * 0.4) - 0.5));
      const sc2 = 1 - smooth(0, 0.004, Math.abs(fract(u * 5 - v * 4 + 0.3) - 0.5));
      const cloud = fbm(u, v, 3, 3, 3, seed + 4);
      o.h = 0.5 + (brush - 0.5) * 0.4 - (sc + sc2 * 0.6) * 0.25;
      o.r = (kind === 'messing' ? 0.3 : 0.22) + (cloud - 0.5) * 0.12 + (sc + sc2) * 0.1 + (brush - 0.5) * 0.06;
      return;
    }
    case 'segeltuch': {
      // Leinwandbindung: Kette (senkrecht) und Schuss (waagrecht) gehen abwechselnd über- und untereinander; dazu Fadenverdickungen
      const N = 48;
      const tu = u * N, tv = v * N;
      const iu = Math.floor(tu), iv = Math.floor(tv);
      const par = (iu + iv) & 1;
      const fu = tu - iu, fv = tv - iv;
      const warp = Math.sin(Math.PI * fu) * (0.55 + 0.45 * Math.sin(Math.PI * (par ? fv : 1 - fv)));
      const weft = Math.sin(Math.PI * fv) * (0.55 + 0.45 * Math.sin(Math.PI * (par ? 1 - fu : fu)));
      const slub = vnoise(u, v, 12, 96, seed) * 0.25;
      o.h = Math.min(1, Math.max(warp, weft) * (0.85 + slub));
      o.r = 0.9 + (1 - o.h) * 0.08;
      return;
    }
    case 'fels_kalk': {
      // Kalkstein: Schichtbänder, Lösungsrinnen, Risse, Körnung
      const w = fbm(u, v, 3, 3, 4, seed);
      const strata = 0.5 + 0.5 * Math.sin(TAU * (v * 7 + w * 1.8));
      const crk = 1 - smooth(0, 0.03, Math.abs(fbm(u, v, 4, 4, 3, seed + 9) - 0.5));
      const grain = vnoise(u, v, 128, 128, seed + 3);
      o.h = 0.3 + strata * 0.3 + (w - 0.5) * 0.5 + (grain - 0.5) * 0.08 - crk * 0.35;
      o.r = 0.86 + (grain - 0.5) * 0.08 - strata * 0.04;
      return;
    }
    case 'fels_basalt': {
      // Basaltsäulen: Zellen mit eigener Neigung, tiefe Fugen, poröse Oberfläche
      const c = voronoi(u, v, 7, seed, 0.75);
      const edge = smooth(0.0, 0.12, c.f2 - c.f1);
      const tilt = (u * 7 - c.cx) * (hash(c.id, 2, seed) - 0.5) * 0.6 + (v * 7 - c.cy) * (hash(c.id, 3, seed) - 0.5) * 0.6;
      const pore = smooth(0.82, 0.92, vnoise(u, v, 160, 160, seed + 4));
      o.h = (0.55 + tilt * 0.5 + (hash(c.id, 4, seed) - 0.5) * 0.2) * edge - pore * 0.1 + (fbm(u, v, 16, 16, 3, seed + 8) - 0.5) * 0.12;
      o.r = 0.8 + pore * 0.1 + (1 - edge) * 0.1;
      return;
    }
    case 'fels_obsidian': {
      // Obsidian: muschelige Bruchflächen (glatte Schalen mit feinen Wellenringen), scharfe Grate, spiegelnd
      // große, unregelmäßige Schalen (Zellen verzerrt durch Rauschen), nur angedeutete Wellenringe, Grate weich auslaufend
      const w = fbm(u, v, 3, 3, 3, seed + 11);
      const c = voronoi(fract(u + (w - 0.5) * 0.12), fract(v + (w - 0.5) * 0.12), 4, seed, 0.95);
      const bowl = c.f1;
      const ripple = Math.sin(bowl * 30 + w * 6) * 0.012 * (1 - bowl);
      const ridge = smooth(0.0, 0.12, c.f2 - c.f1);
      o.h = Math.min(1, 0.3 + bowl * 0.45 + ripple + (w - 0.5) * 0.25) * (0.8 + 0.2 * ridge);
      o.r = 0.16 + (1 - ridge) * 0.18 + (hash(c.id, 5, seed) - 0.5) * 0.06;
      return;
    }
    case 'sand': {
      // Windrippel, Körnung, kleine Muschelsplitter
      const w = fbm(u, v, 3, 3, 3, seed);
      const rip = 0.5 + 0.5 * Math.sin(TAU * (u * 9 + v * 3 + w * 1.6));
      const grain = vnoise(u, v, 256, 256, seed + 2);
      const shell = smooth(0.93, 0.97, vnoise(u, v, 48, 48, seed + 6));
      o.h = 0.4 + rip * 0.35 + (grain - 0.5) * 0.18 + shell * 0.2;
      o.r = 0.94 - shell * 0.2;
      return;
    }
    case 'boden': {
      // Waldboden/Asche: Klumpen, Kiesel, feine Krümel
      const lump = fbm(u, v, 6, 6, 4, seed);
      const c = voronoi(u, v, 18, seed + 1, 0.95);
      const pebble = 1 - smooth(0.18, 0.32, c.f1);
      const crumb = vnoise(u, v, 192, 192, seed + 3);
      o.h = 0.25 + lump * 0.45 + pebble * 0.3 * hash(c.id, 7, seed) + (crumb - 0.5) * 0.1;
      o.r = 0.95 - pebble * 0.1;
      return;
    }
    case 'mauerwerk': {
      // Steinmetz-Oberfläche der Quader (die Fugen zeichnet der Shader nach Weltlage): schräge Spitzeisen-Riefen, Poren, Abplatzungen, Verwitterung
      const chisel = 0.5 + 0.5 * Math.sin(TAU * ((u + v) * 14 + vnoise(u, v, 6, 6, seed) * 1.6));
      const chip = smooth(0.76, 0.86, fbm(u, v, 5, 5, 3, seed + 4));
      const pore = smooth(0.88, 0.95, vnoise(u, v, 128, 128, seed + 6));
      o.h = 0.55 + (chisel - 0.5) * 0.16 + (fbm(u, v, 4, 4, 4, seed + 2) - 0.5) * 0.34 - chip * 0.28 - pore * 0.12;
      o.r = 0.86 + chip * 0.06 + pore * 0.05;
      return;
    }
    case 'ziegel': {
      // gebrannter Ton (die Ziegelreihen zeichnet der Shader): Brandflecken, feine Poren, Haarrisse, glattere Kuppen
      const n = fbm(u, v, 6, 6, 4, seed);
      const pore = smooth(0.86, 0.94, vnoise(u, v, 160, 160, seed + 2));
      const crk = 1 - smooth(0, 0.015, Math.abs(fbm(u, v, 3, 3, 3, seed + 5) - 0.5));
      o.h = 0.5 + (n - 0.5) * 0.4 - pore * 0.15 - crk * 0.2;
      o.r = 0.72 + (0.5 - n) * 0.14 + pore * 0.08;
      return;
    }
    case 'fachwerk':
    case 'hafenholz': {
      // Balken bzw. Bohlen: kräftige Maserung längs u, Dechselhiebe (Fachwerk) oder Trockenrisse und Salz (Hafen)
      const warp = fbm(u, v, 3, 6, 3, seed);
      const ring = 0.5 + 0.5 * Math.sin(TAU * (v * 18 + warp * 3));
      const fine = vnoise(u, v, 32, 384, seed + 1);
      const crk = 1 - smooth(0, 0.02, Math.abs(fbm(u, v, 2, 16, 3, seed + 5) - 0.5));
      let h = 0.6 + (ring - 0.5) * 0.3 + (fine - 0.5) * 0.08 - crk * 0.3;
      if (kind === 'fachwerk') h += (0.5 + 0.5 * Math.sin(TAU * (u * 9 + fbm(u, v, 3, 3, 2, seed + 7)))) * 0.12;
      o.h = Math.max(0, Math.min(1, h));
      o.r = 0.88 + crk * 0.08 + (fine - 0.5) * 0.06;
      return;
    }
    case 'stoff': {
      // Köperbindung: schräge Grate, Fasern, Flusen
      const d = 0.5 + 0.5 * Math.sin(TAU * (u + v) * 64);
      const x = 0.5 + 0.5 * Math.sin(TAU * (u - v) * 128);
      const fib = vnoise(u, v, 512, 64, seed);
      o.h = d * 0.7 + x * 0.15 + (fib - 0.5) * 0.15;
      o.r = 0.9 + (1 - d) * 0.06;
      return;
    }
    case 'leder': {
      // Narbenleder: kleine Polster (Zellen), feine Falten, Poren
      const c = voronoi(u, v, 48, seed, 0.9);
      const pad = smooth(0.0, 0.18, c.f2 - c.f1);
      const wr = fbm(u, v, 6, 3, 3, seed + 2);
      const pore = smooth(0.9, 0.96, vnoise(u, v, 256, 256, seed + 3));
      o.h = 0.35 + pad * 0.4 + (wr - 0.5) * 0.3 - pore * 0.1;
      o.r = 0.5 + (1 - pad) * 0.1 + pore * 0.1 + (wr - 0.5) * 0.08;
      return;
    }
    case 'griffwicklung': {
      // Lederriemen schräg gewickelt: Wülste mit Fuge, darüber Narbung
      const t = fract((u + v * 0.5) * 6);
      const band = Math.sin(Math.PI * t);
      const grain = vnoise(u, v, 96, 96, seed);
      o.h = band * 0.8 + (grain - 0.5) * 0.12;
      o.r = 0.58 + (1 - band) * 0.15;
      return;
    }
  }
}

/** Linear → sRGB-Byte (Nachschlagetabelle statt `pow` je Bildpunkt) */
const SRGB_LUT = (() => { const t = new Uint8Array(4096); for (let i = 0; i < 4096; i++) t[i] = Math.round(Math.pow(i / 4095, 1 / 2.2) * 255); return t; })();

/** Die erzeugten Karten eines Satzes (RGBA8, Zeile 0 = v 0) */
export interface ForgeMaps {
  size: number;
  albedo: Uint8Array | null;
  normal: Uint8Array;
  orm: Uint8Array;
}

/**
 * Karten eines Satzes erzeugen (rein und deterministisch: gleiche Art, Größe und Saat ergeben dieselben Bytes). Höhenfeld, Rauheit und Albedo je
 * Bildpunkt aus dem Rezept, dann Normalkarte aus zentralen Differenzen des Höhenfelds (kachelnd am Rand) und Umgebungsverdeckung aus der Senke
 * gegenüber der weichgezeichneten Umgebung.
 */
export function forgeMaps(kind: ForgeKind, size: number, seed = 1): ForgeMaps {
  const R = FORGE_RECIPES[kind];
  const S = size, N = S * S;
  const h = new Float32Array(N);
  const rough = new Float32Array(N);
  const alb = R.albedo ? new Uint8Array(N * 4) : null;
  const o: Px = { h: 0, r: 0, a: 1, tr: 0, tb: 0 };
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      px(kind, u, v, o, seed);
      const i = y * S + x;
      h[i] = o.h;
      rough[i] = o.r;
      if (alb) {
        // sRGB-Werte (die Textur trägt SRGBColorSpace)
        const a = Math.max(0, Math.min(1, o.a));
        const s = SRGB_LUT[(a * 4095) | 0];
        alb[i * 4] = Math.min(255, Math.round(s * (1 + o.tr)));
        alb[i * 4 + 1] = s;
        alb[i * 4 + 2] = Math.min(255, Math.round(s * (1 + o.tb)));
        alb[i * 4 + 3] = 255;
      }
    }
  }
  // Nachbarn mit Umlauf als Tabellen (keine Modulo-Rechnung je Bildpunkt)
  const prev = new Int32Array(S), next = new Int32Array(S);
  for (let i = 0; i < S; i++) { prev[i] = i === 0 ? S - 1 : i - 1; next[i] = i === S - 1 ? 0 : i + 1; }
  // weiches Umfeld (getrennter Kastenfilter mit laufender Summe, Radius nach Auflösung) für die Verdeckung
  const rad = Math.max(1, Math.round(S / 256));
  const tmp = new Float32Array(N), blur = new Float32Array(N);
  const k = 1 / (2 * rad + 1);
  for (let y = 0; y < S; y++) {
    const r = y * S;
    let sum = 0;
    for (let d = -rad; d <= rad; d++) sum += h[r + ((d + S) % S)];
    for (let x = 0; x < S; x++) {
      tmp[r + x] = sum * k;
      sum += h[r + ((x + rad + 1) % S)] - h[r + ((x - rad + S) % S)];
    }
  }
  for (let x = 0; x < S; x++) {
    let sum = 0;
    for (let d = -rad; d <= rad; d++) sum += tmp[((d + S) % S) * S + x];
    for (let y = 0; y < S; y++) {
      blur[y * S + x] = sum * k;
      sum += tmp[((y + rad + 1) % S) * S + x] - tmp[((y - rad + S) % S) * S + x];
    }
  }
  const normal = new Uint8Array(N * 4), orm = new Uint8Array(N * 4);
  // Reliefstärke unabhängig von der Auflösung: gleiche Form, gleiche Neigung
  const kn = R.relief * 3.2 * (S / 512);
  const metal = Math.round(R.metal * 255);
  for (let y = 0; y < S; y++) {
    const ym = prev[y] * S, yp = next[y] * S, yr = y * S;
    for (let x = 0; x < S; x++) {
      const dx = (h[yr + next[x]] - h[yr + prev[x]]) * 0.5, dy = (h[yp + x] - h[ym + x]) * 0.5;
      let nx = -dx * kn, ny = -dy * kn;
      const l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= l; ny *= l;
      const i = (yr + x) * 4;
      normal[i] = (nx * 127.5 + 127.5 + 0.5) | 0;
      normal[i + 1] = (ny * 127.5 + 127.5 + 0.5) | 0;
      normal[i + 2] = (l * 127.5 + 127.5 + 0.5) | 0;
      normal[i + 3] = 255;
      const cav = blur[yr + x] - h[yr + x];
      const ao = cav > 0 ? 1 - cav * 3.2 : 1;
      orm[i] = ((ao < 0.25 ? 0.25 : ao) * 255 + 0.5) | 0;
      const r = rough[yr + x];
      orm[i + 1] = ((r < 0.03 ? 0.03 : r > 1 ? 1 : r) * 255 + 0.5) | 0;
      orm[i + 2] = metal;
      const hv = h[yr + x];
      orm[i + 3] = ((hv < 0 ? 0 : hv > 1 ? 1 : hv) * 255 + 0.5) | 0;
    }
  }
  return { size: S, albedo: alb, normal, orm };
}

/** Satz der Rumpfplanken nach Rumpf-Stufe: 1–2 verwittert, 3 geölt, 4–5 seidenmatt (Mahagoni/Ebenholz) */
export function hullForgeKind(hullTier: number): ForgeKind {
  return hullTier <= 2 ? 'rumpf_alt' : hullTier >= 4 ? 'rumpf_edel' : 'rumpf';
}

/** Felsart eines Inselstils für steile Hänge */
export function rockForgeKind(style: string): ForgeKind {
  if (style === 'glut') return 'fels_obsidian';
  if (style === 'klippe' || style === 'nord' || style === 'sturm' || style === 'schlund' || style === 'nebel') return 'fels_basalt';
  return 'fels_kalk';
}
