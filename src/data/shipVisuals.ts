// Visuelle Schiffs-Evolution: der reine, deterministische Bauplan der Ausbaustufen. Aus (Schiffsklasse, `ship.evo`) entstehen alle Zahlen und Lagen der
// Anbauten (Flickbretter, Eisenbänder, Panzerplatten, Rammsporn, Heckgalerie, Segel, vernagelte Stückpforten, Drehbassen) ohne three.js und ohne
// Zufall: dieselbe Eingabe liefert immer denselben Plan (Zufall nur über `seeded`). `entities/ship/shipBuilder.ts` setzt den Plan in Geometrie um,
// `tests/shipVisuals.test.ts` prüft ihn. Alle Maße sind Anteile von L, W und der Deckshöhe D, damit sie auf der Schaluppe (18 m) wie auf dem Leviathan (74 m) sitzen.
import { activePorts, portIndices, type ShipEvolution } from './shipEvolution';

/** Was der Plan von einer Schiffsklasse braucht (data/ships.ts `ShipClass`) */
export interface ClassDims { id: string; L: number; W: number; can: number; decks: number; masts: number[]; mh: number }

export type VisualTier = 1 | 2 | 3 | 4 | 5;
const vt = (n: number): VisualTier => (Math.max(1, Math.min(5, Math.round(n))) as VisualTier);
const at = <T,>(list: readonly T[], tier: number): T => list[vt(tier) - 1];

// ---------- Zufall und Farben ----------

/** Kleiner deterministischer Zufall (mulberry32) aus einem Text */
export function seeded(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const parse = (c: string): [number, number, number] => { const m = /^#?([0-9a-f]{6})$/i.exec(c.trim()); const v = m ? parseInt(m[1], 16) : 0x8a5a2b; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
/** Mischen zweier Farben (#rrggbb), k = Anteil von `b` */
export function mixHex(a: string, b: string, k: number): string {
  const [ar, ag, ab] = parse(a), [br, bg, bb] = parse(b);
  return `#${hex2(ar + (br - ar) * k)}${hex2(ag + (bg - ag) * k)}${hex2(ab + (bb - ab) * k)}`;
}
export const scaleHex = (c: string, f: number): string => { const [r, g, b] = parse(c); return `#${hex2(r * f)}${hex2(g * f)}${hex2(b * f)}`; };

/**
 * Rumpffarbe nach Rumpf-Stufe: Stufe 1 ausgeblichenes, helles Holz (zur Spielerfarbe hin gemischt, nicht ersetzt), Stufe 2 – 3 dunkleres, geöltes
 * Hartholz, Stufe 4 – 5 Mahagoni und Ebenholz. Die gewählte Rumpffarbe bleibt als Grundton erkennbar.
 */
export function tierHullColor(base: string, hullTier: number): string {
  switch (vt(hullTier)) {
    case 1: return scaleHex(mixHex(base, '#C9B896', 0.5), 1.05);
    case 2: return scaleHex(mixHex(base, '#5A3A22', 0.2), 0.9);
    case 3: return scaleHex(mixHex(base, '#4A2E1C', 0.32), 0.86);
    case 4: return scaleHex(mixHex(base, '#3A2216', 0.55), 0.82);
    default: return scaleHex(mixHex(base, '#221711', 0.62), 0.8);
  }
}

// ---------- Maße der Klasse ----------

/** Deckshöhe über der Wasserlinie (wie in `buildShip`: Bordwand wächst mit der Größe) */
export const deckHeightOf = (c: ClassDims): number => (1.4 + c.decks * 0.75) * Math.pow(Math.max(1, c.L / 24), 0.6);
/** Maßstab der Anbauten (Länge / 15, gedeckelt): große Schiffe bekommen kräftigere, aber nicht überdimensionierte Teile */
export const detailScale = (c: ClassDims): number => Math.min(2.6, Math.max(0.85, c.L / 15));

/** z der Hauptdeck-Stückpforte i (i = 0 … can − 1) */
export const mainPortZ = (c: ClassDims, i: number): number => (c.can === 1 ? 0 : (i / (c.can - 1) - 0.5) * c.L * 0.55);
/** z der Pforte i (0 … can) in der Reihe `row` (1, 2) der unteren Geschützdecks und deren Höhe */
export const lowerPortZ = (c: ClassDims, i: number): number => ((i / c.can) - 0.5) * c.L * 0.62;
export const lowerPortY = (c: ClassDims, row: number): number => deckHeightOf(c) * (0.62 - row * 0.2);
export const mainPortY = (c: ClassDims): number => deckHeightOf(c) - 0.7;

/** Alle Stückpforten (Mitte, Höhe, halbe Ausdehnung) beider Reihen: die Anbauten halten Abstand */
export function portSpots(c: ClassDims): { z: number; y: number; hz: number; hy: number }[] {
  const out: { z: number; y: number; hz: number; hy: number }[] = [];
  for (let i = 0; i < c.can; i++) out.push({ z: mainPortZ(c, i), y: mainPortY(c), hz: 0.55, hy: 0.45 });
  for (let row = 1; row < c.decks; row++) for (let i = 0; i <= c.can; i++) out.push({ z: lowerPortZ(c, i), y: lowerPortY(c, row), hz: 0.6, hy: 0.45 });
  return out;
}
const hitsPort = (c: ClassDims, z: number, y: number, hz: number, hy: number): boolean => portSpots(c).some((p) => Math.abs(z - p.z) < hz + p.hz && Math.abs(y - p.y) < hy + p.hy);

// ---------- Plan je Zweig ----------

export interface HullVisual {
  tier: VisualTier;
  /** Rauheit des Holzes (die Rumpffarbe liefert `tierHullColor` aus der gewählten Farbe) */
  roughness: number;
  /** Flickbretter je Bordseite (nur Stufe 1) und ihre Tönungen */
  patches: number;
  /** Eisenbänder je Bordseite (Stufe 2: halb so viele wie Stufe 3), umlaufende Bänder, Nieten */
  bands: number;
  /** Verstärkte Schanzkleider (Stufe 2 – 3) und Messing-Beschläge: 0 keine, 1 Ecken, 2 alle */
  reinforced: boolean;
  brass: 0 | 1 | 2;
  /** Panzergürtel (Stufe 4 – 5): Reihen und Werkstoff */
  belt: null | { rows: 1 | 2; steel: string; bolt: string; gold: boolean };
  /** Rammsporn (Stufe 4 – 5) */
  ram: null | { iron: string; tip: string; gold: boolean };
  /** Reihen der Heckgalerie (2 ab Stufe 4, sonst nach der Kastellhöhe: 0 = wie bisher) und zusätzliche Hecklaternen */
  galleryRows: 0 | 2;
  sternLamps: number;
}

export interface SailVisual {
  tier: VisualTier;
  /** Faktor auf Breite und Höhe jedes Segels (0,85 → Fläche 72 %) */
  dimK: number;
  /** Bauch des Segels: kleiner = straffer */
  billow: number;
  /** Abnutzung 0 … 1 (Flicken, Schmutz, ausgefranste Säume) */
  wear: number;
  tattered: boolean;
  /** Bordüre am Segelrand: Gold; ab Stufe 5 doppelt mit der Farbe der Macht/Flagge */
  border: null | { double: boolean };
  /** Topp-/Bramsegel über den Hauptrahen, Besansegel am Heck (Vorsegel am Bugspriet gibt es seit 4.9 nicht mehr) */
  topgallants: boolean;
  spanker: boolean;
  /** Takelage: Wanten je Seite, Webleinen (Schrittweite, 0 = keine), Rahhängetaue */
  shrouds: number;
  ratlineStep: number;
  yardLifts: boolean;
}

export interface CannonVisual {
  tier: VisualTier;
  /** Pforten der Hauptreihe je Seite insgesamt / bestückt, und welche (Index) offen sind bzw. vernagelt */
  total: number;
  active: number;
  open: number[];
  boarded: number[];
  /** Rohrart und Längenfaktor: rost (kurzes Eisenrohr), eisen, bronze, bronzelang (poliert), schwarz (Gussstahl mit Goldring) */
  barrel: 'rost' | 'eisen' | 'bronze' | 'bronzelang' | 'schwarz';
  lengthK: number;
  lids: boolean;
  goldRing: boolean;
  /** Anteil der unteren Pfortenreihen, die offen sind (der Rest vernagelt) */
  lowerOpenK: number;
  /** Drehbassen je Bordseite (ab Kanonen-Stufe 4) */
  swivels: number;
}

export interface ShipVisual { key: string; hull: HullVisual; sail: SailVisual; cannon: CannonVisual }

/** Kennung des sichtbaren Zustands: ändert sie sich, muss das Schiffsmodell neu gebaut werden */
export const visualKey = (evo: ShipEvolution): string => `${evo.hullTier}${evo.sailTier}${evo.cannonTier}`;

export function shipVisual(c: ClassDims, evo: ShipEvolution): ShipVisual {
  const h = vt(evo.hullTier), s = vt(evo.sailTier), k = vt(evo.cannonTier);
  const sc = detailScale(c);
  const active = activePorts(c.can, k);
  const open = portIndices(c.can, active);
  const openSet = new Set(open);
  const boarded: number[] = [];
  for (let i = 0; i < c.can; i++) if (!openSet.has(i)) boarded.push(i);
  return {
    key: visualKey(evo),
    hull: {
      tier: h,
      roughness: at([1, 0.9, 0.8, 0.66, 0.55], h),
      patches: h === 1 ? Math.max(3, Math.min(9, Math.round(2.6 + sc * 1.3))) : 0,
      bands: h === 2 ? Math.max(3, Math.min(8, Math.round(c.L / 9))) : h === 3 ? Math.max(4, Math.min(12, Math.round(c.L / 6))) : 0,
      reinforced: h === 2 || h === 3,
      brass: h === 3 ? 2 : h === 2 ? 1 : 0,
      belt: h >= 4 ? { rows: h >= 5 ? 2 : 1, steel: h >= 5 ? '#26292F' : '#7C838C', bolt: h >= 5 ? '#C79A45' : '#9AA0A8', gold: h >= 5 } : null,
      ram: h >= 4 ? { iron: h >= 5 ? '#2B2D33' : '#6D737C', tip: h >= 5 ? '#D9A93F' : '#9AA0A8', gold: h >= 5 } : null,
      galleryRows: h >= 4 ? 2 : 0,
      sternLamps: h >= 5 ? 3 : h >= 4 ? 2 : 0,
    },
    sail: {
      tier: s,
      dimK: s === 1 ? 0.85 : 1,
      billow: at([1.3, 1.1, 1, 0.88, 0.78], s),
      wear: at([1, 0.6, 0.35, 0.1, 0], s),
      tattered: s <= 3,
      border: s >= 4 ? { double: s >= 5 } : null,
      topgallants: s >= 4,
      spanker: s >= 4,
      shrouds: at([1, 3, 3, 5, 5], s),
      ratlineStep: at([0, 0.12, 0.075, 0.075, 0.06], s),
      yardLifts: s >= 2,
    },
    cannon: {
      tier: k, total: c.can, active, open, boarded,
      barrel: at(['rost', 'eisen', 'bronze', 'bronzelang', 'schwarz'] as const, k),
      lengthK: at([0.5, 1, 1, 1.18, 1.25], k),
      lids: k >= 2,
      goldRing: k >= 5,
      lowerOpenK: at([0.5, 0.75, 1, 1, 1], k),
      swivels: k >= 4 ? Math.max(2, Math.min(k >= 5 ? 7 : 5, Math.ceil(c.L / (k >= 5 ? 10 : 14)))) : 0,
    },
  };
}

/** Ist die Gesamtfläche der Segel (Stufe 1 = 72 %) verglichen mit voller Fläche */
export const sailAreaK = (v: SailVisual): number => v.dimK * v.dimK;

// ---------- Lagen der Anbauten (Anteile, Schiffskoordinaten) ----------

export interface Patch { side: 1 | -1; /** z in Metern */ z: number; /** Höhe über der Wasserlinie */ y: number; w: number; h: number; rot: number; tone: number; nails: number }

/**
 * Flickbretter (Stufe 1): je Bordseite andere Zahl und Lage (sichtbar unsymmetrisch), nie über Stückpforten, in abweichenden Holztönen
 * (`tone` 0 … 3 → Index in `PATCH_TONES`), leicht schief aufgenagelt. Nur im Mittelschiff (|t| ≤ 0,74), wo die Bordwand glatt ist.
 */
export function hullPatches(c: ClassDims, count: number): Patch[] {
  const D = deckHeightOf(c), sc = detailScale(c);
  const out: Patch[] = [];
  for (const side of [1, -1] as const) {
    const rnd = seeded(`${c.id}|patch|${side}`);
    const n = Math.max(2, count + (side === 1 ? 0 : -1 + Math.floor(rnd() * 2)));
    let tries = 0;
    while (out.filter((p) => p.side === side).length < n && tries++ < 80) {
      const z = (rnd() * 1.48 - 0.74) * c.L / 2;
      const w = (0.8 + rnd() * 1.0) * Math.min(sc, 2.2), h = (0.46 + rnd() * 0.4) * Math.min(sc, 2);
      const y = D * (0.2 + rnd() * 0.34) + 0.35;
      if (y + h / 2 > D * 0.97 || y - h / 2 < 0.45) continue;
      if (hitsPort(c, z, y, w / 2, h / 2)) continue;
      if (out.some((p) => p.side === side && Math.abs(p.z - z) < (p.w + w) / 2 + 0.3 && Math.abs(p.y - y) < (p.h + h) / 2 + 0.1)) continue;
      out.push({ side, z, y, w, h, rot: (rnd() - 0.5) * 0.3, tone: Math.floor(rnd() * 4), nails: 4 });
    }
  }
  return out;
}
export const PATCH_TONES = ['#8C6B45', '#A88B62', '#6A4A2B', '#B8A07A'] as const;

/** Stationen der senkrechten Eisenbänder (z in Metern), gleichmäßig im Mittelschiff, Abstand zu den Pforten gewahrt */
export function ironStations(c: ClassDims, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    let z = (-0.78 + (1.56 * (i + 0.5)) / count) * c.L / 2;
    // Pfortennähe: das Band rückt zwischen die Pforten (kleine Schiebung)
    const D = deckHeightOf(c);
    for (let k = 0; k < 6 && hitsPort(c, z, D * 0.5, 0.18, D * 0.5); k++) z += 0.45;
    out.push(z);
  }
  return out;
}

/** Plattenreihen des Panzergürtels: z-Bereiche (Mitte, Länge) entlang der Wasserlinie, ohne Bug und Heck */
export function beltPlates(c: ClassDims): { z: number; len: number }[] {
  const span = c.L * 0.72, n = Math.max(3, Math.round(span / (2.4 * Math.min(detailScale(c), 2.2))));
  const len = span / n;
  return Array.from({ length: n }, (_, i) => ({ z: -span / 2 + len * (i + 0.5) - c.L * 0.04, len: len * 0.94 }));
}

/** Platten zwischen den Stückpforten der Hauptreihe (Stufe 5, Breitseite): in jeder Lücke eine Platte, nie vor einer Pforte */
export function pilasterPlates(c: ClassDims): { z: number; len: number }[] {
  const out: { z: number; len: number }[] = [];
  for (let i = 0; i < c.can - 1; i++) {
    const a = mainPortZ(c, i), b = mainPortZ(c, i + 1), gap = b - a;
    const len = gap - 1.7;
    if (len >= 0.7) out.push({ z: (a + b) / 2, len: Math.min(len, 3.4 * Math.min(detailScale(c), 2)) });
  }
  return out;
}

/**
 * Lagen (z) der Drehbassen einer Bordseite zwischen `lo` und `hi`: `free(z)` sagt, ob an der Stelle Platz ist (nicht an Zugängen der Gangway, nicht
 * neben Aufbauten). Die Plätze werden fein abgetastet und gleichmäßig über alle freien Stellen verteilt, mit Mindestabstand `gap`; vorn zuerst.
 * Weniger als `count`, wenn die Reling nicht genug freie Strecke bietet.
 */
export function pickSwivelZ(count: number, lo: number, hi: number, gap: number, free: (z: number) => boolean): number[] {
  if (count <= 0 || hi <= lo) return [];
  const ok: number[] = [];
  for (let z = hi; z >= lo; z -= 0.25) if (free(z)) ok.push(z);
  if (!ok.length) return [];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const target = ok[Math.min(ok.length - 1, Math.floor(((i + 0.5) / count) * ok.length))];
    let best: number | null = null;
    for (const z of ok) {
      if (out.some((q) => Math.abs(q - z) < gap)) continue;
      if (best === null || Math.abs(z - target) < Math.abs(best - target)) best = z;
    }
    if (best !== null) out.push(best);
  }
  return out.sort((a, b) => b - a);
}

/** Wie viele der unteren Pfortenreihen-Positionen (0 … can) sind offen? Gleichmäßig verteilt wie bei der Hauptreihe */
export function lowerOpenIndices(c: ClassDims, openK: number): number[] {
  const total = c.can + 1;
  const n = Math.max(1, Math.min(total, Math.round(total * openK)));
  return portIndices(total, n);
}
