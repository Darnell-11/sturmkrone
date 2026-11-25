// Phase 4.6D – AnimeVfxForge: sechs scharfe, prozedurale 256×256-Texturen (Klingensichel, Flammenpinsel, Plasma-Blitz, Gischt,
// Runen-/Glasrisse, Funken-Sprites) und die verbindliche 3-Schicht-Komposition jedes Kampfeffekts:
//   1. dunkler Kontrastmantel (NormalBlending, Tusche-/Rauchfarbe) hinter dem Effekt – verhindert Überstrahlung, gibt Anime-Tiefe,
//   2. UV-gescrollter Energiekern (AdditiveBlending: Bänder, verjüngte Sicheln, gezackte Fraktal-Segmente),
//   3. Partikelsturm und Oberflächen-Reaktion (Funken, Glut, Eis, Tropfen, Gestein; Krater- bzw. Gischtringe am Berührungspunkt).
// Alles läuft über die vorab angelegten Instanz-Pools von `CataclysmFx` (nichts entsteht im Kampf). Alle Effekt-Materialien sind
// Standard-`MeshBasicMaterial` mit Textur, Eckpunkt- und Instanzfarbe, doppelseitig, ohne Nebel: durchscheinend teilen sie sich EIN
// Shader-Programm (Additiv und Normal unterscheiden nur Mischung und Deckkraft), die festen Brocken (Fels, Wolke, Eisscholle) ein zweites.
// Die Deckkraft der dunklen Schicht ist eine Material-Uniform: je Mantel gibt es vier Stufen (gleiche Textur, gleiches Programm), in die
// der Pool jedes Teil beim Ausblenden einsortiert.
import {
  AdditiveBlending, ClampToEdgeWrapping, Color, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial,
  NormalBlending, RepeatWrapping, RGBAFormat, UnsignedByteType, type Texture,
} from 'three';
import { markShared } from '../render/dispose';
import type { CataclysmFx } from '../combat/cataclysmFx';

// ---------------------------------------------------------------------------------------------------------------
// Texturen (rein und deterministisch: gleiche Pixel bei jedem Start, ohne DOM – auch in den Tests)
// ---------------------------------------------------------------------------------------------------------------

export type VfxTexKey = 'slashArc' | 'flameBrush' | 'lightningJagged' | 'waterFoam' | 'runeCrack' | 'emberSpark';
export const VFX_TEX_KEYS: readonly VfxTexKey[] = ['slashArc', 'flameBrush', 'lightningJagged', 'waterFoam', 'runeCrack', 'emberSpark'];
export const VFX_TEX_SIZE = 256;

/** Zellen des Funken-Atlas (`emberSpark`, 2 × 2): Rauten-Funke/Stern, Glut, Eiskristall, Wassertropfen */
export type SparkCell = 0 | 1 | 2 | 3;

const LAT = 64;
function lattice(seed: number): Float32Array {
  const a = new Float32Array(LAT * LAT);
  let s = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < a.length; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; a[i] = s / 4294967296; }
  return a;
}
/** periodisches Wertrauschen: Perioden px, py Zellen (≤ 64) */
function vn(L: Float32Array, x: number, y: number, px: number, py: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
  const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const a = L[y0 * LAT + x0], b = L[y0 * LAT + x1], c = L[y1 * LAT + x0], d = L[y1 * LAT + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** Oktaven-Rauschen auf [0, 1)² mit Grundperioden px, py (bleibt kachelbar) */
function fbm(L: Float32Array, u: number, v: number, px: number, py: number, oct: number): number {
  let sum = 0, amp = 0.5, norm = 0, fx = px, fy = py;
  for (let o = 0; o < oct; o++) {
    sum += amp * vn(L, u * fx, v * fy, Math.min(LAT, fx), Math.min(LAT, fy));
    norm += amp; amp *= 0.5; fx *= 2; fy *= 2;
  }
  return sum / norm;
}
const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a: number, b: number, x: number) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const frac = (x: number) => x - Math.floor(x);
/** Dreieckswelle in [−1, 1] mit Periode 1 (scharfe Knicke: Blitz-Zickzack) */
const tri = (x: number) => Math.abs(frac(x) * 2 - 1) * 2 - 1;

type PixelFn = (u: number, v: number, out: Float32Array) => void;

function render(size: number, fn: PixelFn): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const o = new Float32Array(2);
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      o[0] = 0; o[1] = 0;
      fn(u, v, o);
      const i = (y * size + x) * 4;
      const l = Math.round(sat(o[0]) * 255);
      data[i] = l; data[i + 1] = l; data[i + 2] = l;
      data[i + 3] = Math.round(sat(o[1]) * 255);
    }
  }
  return data;
}

/** Klingensichel: u entlang (0 Schweif → 1 Spitze), v quer (0 innen → 1 Schneide). Gleißender Kern an der Schneide, ausgefranster Schweif */
function slashArcFn(): PixelFn {
  const L = lattice(11);
  return (u, v, o) => {
    const st = fbm(L, u, v, 3, 24, 3);
    const edge = sstep(0.6, 0.9, v) * (1 - sstep(0.955, 1, v));
    const core = Math.exp(-(((v - 0.91) / 0.022) ** 2));
    const body = v ** 1.05 * (1 - sstep(0.96, 1, v));
    const fray = sstep(0, 0.45, u + (st - 0.5) * 0.6);
    const tip = 1 - sstep(0.9, 1, u);
    const streak = 0.3 + 0.7 * sstep(0.35, 0.7, st);
    o[1] = (body * streak * 0.85 + edge * 0.75 + core) * fray * tip;
    o[0] = 0.4 + 0.6 * Math.max(edge * 0.75, core) + 0.12 * st * body;
  };
}

/** Flammenpinsel: kachelbar, Zungen laufen entlang v (Fließrichtung), turbulente Ränder mit Erosion */
function flameBrushFn(): PixelFn {
  const L1 = lattice(23), L2 = lattice(29);
  return (u, v, o) => {
    const n1 = fbm(L1, u, v, 4, 2, 3);
    const w = n1 - 0.5;
    const tong = 0.5 + 0.5 * Math.sin(2 * Math.PI * (u * 5 + w * 0.9));
    const n2 = fbm(L2, u + w * 0.12, v - w * 0.22, 8, 4, 3);
    const dens = sstep(0.18, 0.86, tong * 0.55 + n2 * 0.75 - 0.22);
    o[1] = dens * (0.7 + 0.3 * n2);
    o[0] = 0.55 + 0.45 * sstep(0.5, 1, dens);
  };
}

/** Plasma-Blitz: gezackte Ader entlang v (kachelbar), heller Kern, elektrisches Glühen, ein zweiter Ast, Ränder in u laufen aus */
function lightningFn(): PixelFn {
  const L = lattice(31);
  return (u, v, o) => {
    const c = 0.5 + 0.15 * tri(v * 3 + 0.13) + 0.075 * tri(v * 7 + 0.41) + 0.032 * tri(v * 17 + 0.77) + 0.03 * (vn(L, v * 64, 0.5, 64, 2) - 0.5);
    const d = Math.abs(u - c);
    const core = 1 - sstep(0.004, 0.02, d);
    const glow = Math.exp(-((d / 0.07) ** 2));
    const cb = c + 0.19 * tri(v * 2 + 0.25) + 0.05 * tri(v * 11 + 0.6);
    const gate = sstep(0.55, 0.9, 0.5 + 0.5 * Math.sin(2 * Math.PI * (v * 2 + 0.3)));
    const db = Math.abs(u - cb);
    const bcore = (1 - sstep(0.003, 0.013, db)) * gate;
    const bglow = Math.exp(-((db / 0.045) ** 2)) * gate;
    const side = sstep(0, 0.1, u) * (1 - sstep(0.9, 1, u));
    o[1] = (core + glow * 0.5 + bcore * 0.8 + bglow * 0.28) * side;
    o[0] = 0.35 + 0.65 * Math.max(core, bcore * 0.85) + 0.15 * glow;
  };
}

/** Gischt, Eis und Wellenkronen: kachelbar, wirbelnde Schaumflächen mit Bläschen und Schlieren */
function waterFoamFn(): PixelFn {
  const L1 = lattice(41), L2 = lattice(43);
  return (u, v, o) => {
    const w1 = fbm(L1, u, v, 6, 6, 3);
    const w2 = fbm(L2, u + (w1 - 0.5) * 0.25, v - (w1 - 0.5) * 0.25, 5, 5, 3);
    let foam = sstep(0.42, 0.6, w2);
    const bub = fbm(L1, u, v, 24, 24, 2);
    foam *= 0.5 + 0.5 * sstep(0.3, 0.62, bub);
    const lines = 0.5 + 0.5 * Math.sin(2 * Math.PI * (v * 6 + w1 * 2));
    foam = sat(foam + 0.28 * sstep(0.82, 1, lines) * w2);
    o[1] = foam;
    o[0] = 0.78 + 0.22 * foam;
  };
}

/** Radiale Glas-/Raum-Splitterrisse und konzentrische Schockwellen (Mitte bei 0,5 | 0,5, nicht kachelbar) */
function runeCrackFn(): PixelFn {
  const L = lattice(57);
  const n = 15;
  const ang = new Float32Array(n), len = new Float32Array(n), wid = new Float32Array(n);
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) { ang[i] = ((i + rnd() * 0.7) / n) * Math.PI * 2 - Math.PI; len[i] = 0.55 + 0.45 * rnd(); wid[i] = 0.009 + 0.007 * rnd(); }
  const R = [0.3, 0.55, 0.8, 0.95];
  return (u, v, o) => {
    const px = u * 2 - 1, py = v * 2 - 1;
    const r = Math.hypot(px, py), a = Math.atan2(py, px);
    let crack = 0;
    if (r > 0.03) {
      for (let i = 0; i < n; i++) {
        let da = a - ang[i];
        da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
        if (Math.abs(da) > 0.6) continue;
        const jag = (vn(L, r * 14 + i * 3.7, i * 1.3, 64, 64) - 0.5) * 0.07 * Math.sqrt(r);
        const d = Math.abs(r * Math.sin(da) - jag);
        const c = (1 - sstep(wid[i] * 0.4, wid[i], d)) * (1 - sstep(len[i] - 0.1, len[i], r)) * sstep(0.03, 0.09, r);
        if (c > crack) crack = c;
      }
    }
    let ring = 0;
    const au = a / (2 * Math.PI) + 0.5;
    for (let k = 0; k < R.length; k++) {
      const off = (vn(L, au * 32, k * 5.1, 32, 64) - 0.5) * 0.03;
      const g = sstep(0.32, 0.52, vn(L, au * 24, k * 9.7 + 3, 24, 64));
      const c = (1 - sstep(0.004, 0.016, Math.abs(r - R[k] - off))) * g;
      if (c > ring) ring = c;
    }
    const glow = Math.exp(-((r / 0.18) ** 2)) * 0.55 + Math.exp(-(((r - 0.8) / 0.12) ** 2)) * 0.16;
    const border = 1 - sstep(0.93, 1, r);
    o[1] = sat(Math.max(crack, ring * 0.9) + glow) * border;
    o[0] = 0.4 + 0.6 * Math.max(crack, ring);
  };
}

/** Funken-Atlas 2 × 2: Rauten-Funke mit Kreuzstrahlen (Stern), Glut, sechsstrahliger Eiskristall, Wassertropfen */
function emberSparkFn(): PixelFn {
  const rays6 = [0, Math.PI / 3, (2 * Math.PI) / 3];
  return (u, v, o) => {
    const cx = u < 0.5 ? 0 : 1, cy = v < 0.5 ? 0 : 1;
    const lx = ((u - cx * 0.5) / 0.5) * 2 - 1, ly = ((v - cy * 0.5) / 0.5) * 2 - 1;
    const r = Math.hypot(lx, ly);
    const border = 1 - sstep(0.86, 0.98, Math.max(Math.abs(lx), Math.abs(ly)));
    let a = 0, l = 1;
    if (cy === 1 && cx === 0) {
      // Rauten-Funke: Rautenkern, lange Längs- und kurze Querstrahlen
      const core = 1 - sstep(0.05, 0.42, Math.abs(ly) * 0.8 + Math.abs(lx) * 1.4);
      const rx = Math.exp(-Math.abs(lx) * 24) * (1 - Math.abs(ly)) ** 1.4;
      const ry = Math.exp(-Math.abs(ly) * 26) * (1 - Math.abs(lx)) ** 1.6 * 0.6;
      a = sat(core + rx + ry + Math.exp(-r * r * 7) * 0.35);
      l = 0.7 + 0.3 * core;
    } else if (cy === 1) {
      // Glut: weicher Ball mit heißem Kern
      a = Math.exp(-r * r * 3.4);
      l = 0.5 + 0.5 * Math.exp(-r * r * 14);
    } else if (cx === 0) {
      // Eiskristall: drei Achsen (sechs Strahlen) mit Seitenästen, kleiner Kern
      let ray = 0;
      for (const th of rays6) {
        const along = Math.abs(Math.cos(th) * lx + Math.sin(th) * ly), d = Math.abs(-Math.sin(th) * lx + Math.cos(th) * ly);
        ray = Math.max(ray, Math.exp(-d * 30) * (1 - along) ** 1.1);
        const bd = Math.abs(d - 0.12 * along * (1 - along) * 3.2);
        ray = Math.max(ray, Math.exp(-bd * 40) * sstep(0.25, 0.4, along) * (1 - sstep(0.55, 0.7, along)) * 0.6);
      }
      const core = 1 - sstep(0.06, 0.2, r);
      a = sat(ray + core + Math.exp(-r * r * 9) * 0.25);
      l = 0.75 + 0.25 * core;
    } else {
      // Wassertropfen: runder Bauch vorn (+y, Flugrichtung), spitzer Schweif hinten, Glanzlicht
      const yb = ly - 0.25;
      const belly = 1 - sstep(0.38, 0.47, Math.hypot(lx, yb));
      const w = 0.45 * Math.sqrt(sat((ly + 0.85) / 1.1));
      const tail = ly < 0.25 ? 1 - sstep(-0.04, 0.03, Math.abs(lx) - w) : 0;
      a = Math.max(belly, tail);
      l = 0.78 + 0.22 * Math.exp(-((lx + 0.14) ** 2 + (ly - 0.36) ** 2) * 30);
    }
    o[1] = a * border;
    o[0] = l;
  };
}

const PIXEL_FN: Record<VfxTexKey, () => PixelFn> = {
  slashArc: slashArcFn, flameBrush: flameBrushFn, lightningJagged: lightningFn, waterFoam: waterFoamFn, runeCrack: runeCrackFn, emberSpark: emberSparkFn,
};

/** RGBA-Pixel einer Textur (rein: gleiche Eingabe, gleiche Pixel; RGB = Helligkeit, A = Form) */
export function vfxTexturePixels(key: VfxTexKey, size = VFX_TEX_SIZE): Uint8Array {
  return render(size, PIXEL_FN[key]());
}

/** Kachelbar in u (S) bzw. v (T)? Fließ-Texturen wiederholen sich, Formen (Sichel, Risse, Funken) nicht */
export const VFX_TEX_WRAP: Readonly<Record<VfxTexKey, [boolean, boolean]>> = {
  slashArc: [false, false], flameBrush: [true, true], lightningJagged: [false, true], waterFoam: [true, true], runeCrack: [false, false], emberSpark: [false, false],
};

let TEXTURES: Record<VfxTexKey, DataTexture> | null = null;
/** Zeit für das Erzeugen der sechs Texturen (ms, Startzeit-Prüfung) */
export let vfxTextureMs = 0;

/** Die sechs Texturen, einmal erzeugt (geteilt, gegen Freigabe geschützt) */
export function vfxTextures(): Record<VfxTexKey, DataTexture> {
  if (TEXTURES) return TEXTURES;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const out = {} as Record<VfxTexKey, DataTexture>;
  for (const key of VFX_TEX_KEYS) {
    const tex = new DataTexture(vfxTexturePixels(key), VFX_TEX_SIZE, VFX_TEX_SIZE, RGBAFormat, UnsignedByteType);
    const [ws, wt] = VFX_TEX_WRAP[key];
    tex.wrapS = ws ? RepeatWrapping : ClampToEdgeWrapping;
    tex.wrapT = wt ? RepeatWrapping : ClampToEdgeWrapping;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.name = `vfx-${key}`;
    tex.needsUpdate = true;
    out[key] = markShared(tex);
  }
  TEXTURES = out;
  if (typeof performance !== 'undefined') vfxTextureMs = performance.now() - t0;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Materialien: ein Programm für alle durchscheinenden Schichten, eines für feste Brocken
// ---------------------------------------------------------------------------------------------------------------

export type VfxBlend = 'add' | 'ink' | 'solid';
/** Deckkraft-Stufen der dunklen Mäntel (Normal-Mischung): der Pool sortiert jedes Teil beim Ausblenden in die passende Stufe */
export const INK_LEVELS: readonly number[] = [1, 0.72, 0.46, 0.22];

const SCROLLERS: { tex: Texture; speed: number }[] = [];
const SCROLL_TEX = new Map<string, Texture>();
const MATS = new Map<string, MeshBasicMaterial>();

/** Textur mit eigenem UV-Lauf (Kopie mit gemeinsamer Bildquelle: kein zweites Bild im Speicher, nur eine eigene Verschiebung) */
function scrollTexture(key: VfxTexKey, speed: number): Texture {
  const id = `${key}:${speed}`;
  let t = SCROLL_TEX.get(id);
  if (!t) {
    t = markShared(vfxTextures()[key].clone());
    SCROLL_TEX.set(id, t);
    SCROLLERS.push({ tex: t, speed });
  }
  return t;
}

/** Material einer Effekt-Schicht (geteilt, im Cache): Textur, Mischung, UV-Lauf (je s entlang v), Stufe der Deckkraft (nur `ink`) */
export function vfxMaterial(key: VfxTexKey, blend: VfxBlend, scroll = 0, level = 0): MeshBasicMaterial {
  const id = `${key}|${blend}|${scroll}|${level}`;
  let m = MATS.get(id);
  if (!m) {
    const map = scroll !== 0 ? scrollTexture(key, scroll) : vfxTextures()[key];
    m = new MeshBasicMaterial({
      map, vertexColors: true, side: DoubleSide, fog: false,
      transparent: blend !== 'solid', depthWrite: blend === 'solid',
      blending: blend === 'add' ? AdditiveBlending : NormalBlending,
      opacity: blend === 'ink' ? INK_LEVELS[Math.max(0, Math.min(INK_LEVELS.length - 1, level))] : 1,
    });
    m.name = `vfx-${id}`;
    MATS.set(id, markShared(m));
  }
  return m;
}

/** UV-Lauf aller Fließ-Texturen weiterschieben (je Bild; Spielzeit, damit die Zeitlupe mitwirkt) */
export function advanceVfxScroll(dt: number) {
  for (const s of SCROLLERS) {
    const o = s.tex.offset;
    o.y = (o.y + s.speed * dt) % 1;
    if (o.y < 0) o.y += 1;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Die Schmiede: 3-Schicht-Effekte auf den Pools von CataclysmFx
// ---------------------------------------------------------------------------------------------------------------

/** Was die Schmiede über die Welt wissen muss (Berührungspunkte: Krater an Land, Gischt auf dem Wasser) */
export interface VfxSurface {
  isLand(x: number, z: number): boolean;
  groundY(x: number, z: number, y: number): number;
  waterY(x: number, z: number): number;
}

const WHITE = new Color(1, 1, 1);
const FOAM = new Color(0.92, 0.97, 1);
const DUST = new Color(0.62, 0.55, 0.45);
const ROCK = new Color(0.55, 0.5, 0.46);
const SPLINTER = new Color(0.5, 0.36, 0.22);
const C1 = new Color();
const C2 = new Color();
const rnd = Math.random;
/** Zwischenspeicher der Fraktal-Blitze (Hauptader bis 64 Abschnitte, Äste bis 16) – kein Speicher je Aufruf */
const PTS = new Float32Array(3 * 65);
const BPT = new Float32Array(3 * 17);

/** Optionen eines Klingen-/Faust-Bogens */
export interface SlashOpts {
  /** Lebensdauer (s Spielzeit) */
  life?: number;
  /** Helligkeit des Kerns */
  k?: number;
  /** Funken je Bogen (× Teilchenfaktor) */
  sparks?: number;
  /** Bogen fliegt mit (m/s) – Klingenwellen */
  vx?: number; vy?: number; vz?: number;
  /** Faust statt Klinge: kürzer, dicker, Druckring vorn */
  fist?: boolean;
  /** Rotation um die eigene Achse (rad/s) – Wirbel */
  spin?: number;
  /** Verzögerung (s) */
  delay?: number;
}

/** Optionen eines Fraktal-Blitzes */
export interface BoltOpts {
  /** Unterteilungen der Hauptader (2^depth Abschnitte, höchstens 6) */
  depth?: number;
  /** Nebenblitze */
  branches?: number;
  /** Zackigkeit (Anteil der Länge) */
  jitter?: number;
  /** Einschlag am Ende (Krater bzw. Gischt) */
  impact?: number;
  flicker?: number;
}

export type BurstKind = 'spark' | 'ember' | 'ice' | 'drop' | 'rock' | 'splinter' | 'smoke' | 'mist' | 'dust';

/** Optionen eines Partikelsturms */
export interface BurstOpts {
  up?: number;
  /** Richtung (normiert) und Bündelung 0 … 1 (0 = rundum) */
  dirX?: number; dirY?: number; dirZ?: number; focus?: number;
  life?: number;
  size?: number;
  grav?: number;
  /** Streuung der Startpunkte (m) */
  spread?: number;
  delay?: number;
}

export class AnimeVfxForge {
  /** Teilchenfaktor der Grafikstufe (setzt die Welt): Stürme werden auf schwachen Geräten dünner, die Schichten bleiben */
  detail = 1;
  surface: VfxSurface | null = null;
  /** Zähler für Prüfungen */
  readonly stats = { slashes: 0, bolts: 0, segments: 0, branches: 0, impacts: 0, craters: 0, splashes: 0, spirals: 0, bursts: 0, glass: 0, silhouettes: 0, funnels: 0, coronas: 0 };

  constructor(readonly fx: CataclysmFx) {}

  /** Dunkle Tusche-Farbe zu einer Energiefarbe (tief, leicht getönt: Gold → Dunkelrot, Blau → Indigo) */
  inkOf(c: Color, out = C2): Color {
    return out.setRGB(0.02 + c.r * 0.07, 0.015 + c.g * 0.045, 0.03 + c.b * 0.09);
  }

  private n(k: number): number { return Math.max(1, Math.round(k * this.detail)); }

  // ---------- Schicht 1 + 2 + 3: Klingen- und Faustbögen ----------

  /**
   * Klingen-/Faust-Sichel in drei Schichten: dunkler Tusche-Mantel (größer, länger), leuchtender Kern in Stilfarbe mit weißer Schneide,
   * Richtungsfunken entlang der Schwungbahn. Lage wie die Grundform `sickle`: flach in der XZ-Ebene, Spitze nach +Z, `roll` kippt die Ebene.
   */
  slash(x: number, y: number, z: number, yaw: number, pitch: number, roll: number, radius: number, core: Color, ink: Color, o: SlashOpts = {}) {
    const fx = this.fx, b = fx.brush;
    const life = o.life ?? 0.2, k = o.k ?? 1, sp = o.spin ?? 0, delay = o.delay ?? 0;
    const vx = o.vx ?? 0, vy = o.vy ?? 0, vz = o.vz ?? 0;
    const r = radius * (o.fist ? 0.75 : 1);
    // 1 – Tusche-Mantel
    b.reset().at(x, y, z).rot(yaw, pitch, roll).vel(vx, vy, vz).spin(sp).size(r * 0.75, 1, r * 0.75, r * 1.2, 1, r * 1.2).span(life * 1.35, delay).col(ink, 1).fade(0.02, 0.55);
    fx.emit('sickleInk');
    // 2 – Energiekern und weiße Schneide
    b.reset().at(x, y, z).rot(yaw, pitch, roll).vel(vx, vy, vz).spin(sp).size(r * 0.62, 1, r * 0.62, r, 1, r).span(life, delay).col(core, 2.5 * k).fade(0.01, 0.55);
    fx.emit('sickle');
    b.reset().at(x, y, z).rot(yaw, pitch, roll).vel(vx, vy, vz).spin(sp).size(r * 0.6, 1, r * 0.6, r * 0.96, 1, r * 0.96).span(life * 0.7, delay).col(WHITE, 1.5 * k).fade(0.01, 0.6);
    fx.emit('sickle');
    // 3 – Funken entlang der Bahn (tangential zur Sichel, nach außen gestreut)
    const ns = this.n(o.sparks ?? 5);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), srr = Math.sin(roll);
    for (let i = 0; i < ns; i++) {
      const a = (rnd() - 0.2) * 1.5;
      // Punkt auf der Sichel (Schiffsraum der Sichel: x = sin a, z = cos a), mit `roll` um die Vorwärtsachse gekippt
      const lx = Math.sin(a) * r, lz = Math.cos(a) * r;
      const ly = lx * srr, lxx = lx * cr;
      const px = x + lxx * cy + lz * sy, pz = z - lxx * sy + lz * cy, py = y + ly;
      const tx = Math.cos(a) * cr, tz = -Math.sin(a);
      const dx = tx * cy + tz * sy, dz = -tx * sy + tz * cy, dy = Math.cos(a) * srr;
      const s = 6 + rnd() * 9;
      b.reset().at(px, py, pz).vel(dx * s + vx, dy * s + 1.5 + vy, dz * s + vz).size(0.09, 0.5, 1, 0.03, 0.12, 1).span(0.22 + rnd() * 0.18, delay).col(i % 2 ? core : WHITE, 2.4).fade(0.01, 0.5);
      b.grav = 9; b.drag = 1.5;
      fx.emit('spark');
    }
    if (o.fist) {
      b.reset().at(x + sy * r * 0.9, y, z + cy * r * 0.9).rot(yaw, Math.PI / 2, 0).size(r * 0.25, 1, r * 0.25, r * 0.85, 1, r * 0.85).span(life * 1.2, delay).col(core, 1.6 * k).fade(0.01, 0.6);
      fx.emit('shock');
    }
    this.stats.slashes++;
  }

  // ---------- Fraktal-Blitze ----------

  /** Mittelpunkt-Verschiebung von A nach B in `pts` (n + 1 Punkte); liefert n */
  private fractal(pts: Float32Array, ax: number, ay: number, az: number, bx: number, by: number, bz: number, depth: number, jitter: number): number {
    const n = 1 << depth;
    pts[0] = ax; pts[1] = ay; pts[2] = az;
    pts[n * 3] = bx; pts[n * 3 + 1] = by; pts[n * 3 + 2] = bz;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    let amp = len * jitter;
    for (let step = n; step > 1; step >>= 1) {
      const h = step >> 1;
      for (let i = 0; i < n; i += step) {
        const i0 = i * 3, i1 = (i + step) * 3, im = (i + h) * 3;
        // zufällige Richtung, die Strecke entlang abgezogen (bleibt seitlich)
        let ox = rnd() - 0.5, oy = rnd() - 0.5, oz = rnd() - 0.5;
        const dx = pts[i1] - pts[i0], dy = pts[i1 + 1] - pts[i0 + 1], dz = pts[i1 + 2] - pts[i0 + 2];
        const dl = Math.hypot(dx, dy, dz) || 1;
        const pr = (ox * dx + oy * dy + oz * dz) / (dl * dl);
        ox -= dx * pr; oy -= dy * pr; oz -= dz * pr;
        const ol = Math.hypot(ox, oy, oz) || 1;
        const m = (amp * (0.6 + rnd() * 0.8)) / ol;
        pts[im] = (pts[i0] + pts[i1]) * 0.5 + ox * m;
        pts[im + 1] = (pts[i0 + 1] + pts[i1 + 1]) * 0.5 + oy * m;
        pts[im + 2] = (pts[i0 + 2] + pts[i1 + 2]) * 0.5 + oz * m;
      }
      amp *= 0.55;
    }
    return n;
  }

  /** Abschnitte eines Pfads als kamera-zugewandte Plasma-Streifen (Kern) mit dunklem Mantel */
  private segments(pts: Float32Array, n: number, core: Color, ink: Color, width: number, life: number, flicker: number, inkK = 2.6) {
    const fx = this.fx, b = fx.brush;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const ax = pts[o], ay = pts[o + 1], az = pts[o + 2];
      const dx = pts[o + 3] - ax, dy = pts[o + 4] - ay, dz = pts[o + 5] - az;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-3) continue;
      const yaw = Math.atan2(dx, dz), pitch = Math.acos(Math.max(-1, Math.min(1, dy / len)));
      b.reset().at(ax, ay, az).rot(yaw, pitch, 0).size(width * inkK, len * 1.04, width * inkK).span(life * 1.15).col(ink, 1).fade(0.01, 0.5);
      fx.emit('jagInk');
      b.reset().at(ax, ay, az).rot(yaw, pitch, 0).size(width, len * 1.04, width).span(life).col(core, 2.6).fade(0.01, 0.55);
      b.flicker = flicker;
      fx.emit('jag');
      if (i % 3 === 0) {
        b.reset().at(ax, ay, az).rot(yaw, pitch, 0).size(width * 0.35, len * 1.02, width * 0.35).span(life * 0.8).col(WHITE, 2.2).fade(0.01, 0.6);
        b.flicker = flicker;
        fx.emit('jag');
      }
      this.stats.segments++;
    }
  }

  /**
   * Mehrgliedriger, gezackter 3D-Fraktal-Blitz von A nach B: Hauptader (2^depth Abschnitte) mit verästelten Nebenblitzen, jede Ader mit
   * dunklem Mantel; am Ende auf Wunsch Einschlag mit Krater- bzw. Gischtring und Funkenregen.
   */
  bolt(ax: number, ay: number, az: number, bx: number, by: number, bz: number, core: Color, width: number, life: number, o: BoltOpts = {}) {
    const ink = this.inkOf(core, C1);
    const depth = Math.max(1, Math.min(6, o.depth ?? 3));
    const n = this.fractal(PTS, ax, ay, az, bx, by, bz, depth, o.jitter ?? 0.14);
    this.segments(PTS, n, core, ink, width, life, o.flicker ?? 0.4);
    const nb = Math.round((o.branches ?? 0) * Math.max(0.5, this.detail));
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    for (let k = 0; k < nb; k++) {
      const i = Math.max(1, Math.min(n - 1, Math.floor(n * (0.15 + rnd() * 0.7))));
      const px = PTS[i * 3], py = PTS[i * 3 + 1], pz = PTS[i * 3 + 2];
      const dx = PTS[i * 3 + 3] - px, dy = PTS[i * 3 + 4] - py, dz = PTS[i * 3 + 5] - pz;
      const dl = Math.hypot(dx, dy, dz) || 1;
      const bl = len * (0.12 + rnd() * 0.22);
      // Ast: ungefähr in Laufrichtung, kräftig zur Seite gedreht
      const ex = px + (dx / dl) * bl * 0.6 + (rnd() - 0.5) * bl * 1.3, ey = py + (dy / dl) * bl * 0.6 + (rnd() - 0.6) * bl * 0.8, ez = pz + (dz / dl) * bl * 0.6 + (rnd() - 0.5) * bl * 1.3;
      const bn = this.fractal(BPT, px, py, pz, ex, ey, ez, Math.max(1, Math.min(4, depth - 2)), 0.2);
      this.segments(BPT, bn, core, ink, width * 0.5, life * 0.8, 0.55, 2.2);
      this.stats.branches++;
    }
    if ((o.impact ?? 0) > 0) this.surfaceHit(bx, by, bz, o.impact!, core, 1);
    this.stats.bolts++;
  }

  // ---------- Oberflächen-Reaktion ----------

  /** Berührungspunkt: an Land dunkler Krater, Runen-Schockring, Gesteinsbrocken und Staub; auf dem Wasser Gischtring, Krone und Tropfen */
  surfaceHit(x: number, y: number, z: number, radius: number, core: Color, k = 1, delay = 0) {
    const fx = this.fx, b = fx.brush;
    const s = this.surface;
    const land = s ? s.isLand(x, z) : true;
    const gy = s ? (land ? s.groundY(x, z, y) : s.waterY(x, z)) : y;
    const r = Math.max(0.6, radius);
    // Schockring (Kern) – an Land Runen-Risse, auf See ein heller Druckring
    b.reset().at(x, gy + 0.08, z).rot(rnd() * 6).size(r * 0.2, 1, r * 0.2, r * 1.9, 1, r * 1.9).span(0.42, delay).col(core, 2 * k).fade(0.01, 0.65);
    fx.emit('shock');
    if (land) {
      b.reset().at(x, gy + 0.05, z).rot(rnd() * 6).size(r * 0.4, 1, r * 0.4, r * 1.3, 1, r * 1.3).span(1.6 + r * 0.1, delay).col(this.inkOf(core, C1), 1).fade(0.02, 0.45);
      fx.emit('crater');
      this.burst('rock', x, gy + 0.2, z, 3 * k + r * 0.6, 4 + r, ROCK, { up: 5 + r, size: 0.18 + r * 0.06, delay });
      this.burst('dust', x, gy + 0.3, z, 3 * k + r * 0.4, 2.2 + r * 0.6, DUST, { up: 1.2, size: 0.9 + r * 0.25, life: 0.9, delay });
      this.stats.craters++;
    } else {
      b.reset().at(x, gy + 0.06, z).rot(rnd() * 6).size(r * 0.3, 1, r * 0.3, r * 1.7, 1, r * 1.7).span(1.1, delay).col(FOAM, 1).fade(0.02, 0.55);
      fx.emit('foam');
      b.reset().at(x, gy - 0.1, z).rot(rnd() * 6).size(r * 0.35, r * 0.2, r * 0.35, r * 0.8, r * 1.3, r * 0.8).span(0.75, delay).col(FOAM, 1).fade(0.02, 0.5);
      b.vy = 1.5; b.grav = 4;
      fx.emit('splash');
      this.burst('drop', x, gy + 0.2, z, 5 * k + r, 3 + r * 0.8, FOAM, { up: 5 + r * 1.1, size: 0.2 + r * 0.03, grav: 14, delay });
      this.burst('mist', x, gy + 0.4, z, 2 * k + r * 0.3, 1.6 + r * 0.4, FOAM, { up: 1.5, size: 1.1 + r * 0.3, life: 0.9, delay });
      this.stats.splashes++;
    }
    this.burst('spark', x, gy + 0.3, z, 4 * k, 7 + r, core, { up: 4, delay });
    this.stats.impacts++;
  }

  // ---------- Partikelstürme ----------

  /** Partikelsturm einer Art (Funken, Glut, Eis, Tropfen, Gestein, Holzsplitter, Rauch, Nebel, Staub) */
  burst(kind: BurstKind, x: number, y: number, z: number, n: number, speed: number, color: Color, o: BurstOpts = {}) {
    const fx = this.fx, b = fx.brush;
    const cnt = this.n(n);
    const up = o.up ?? 2, sz = o.size ?? 0.3, spread = o.spread ?? 0.2, focus = o.focus ?? 0;
    const dx0 = o.dirX ?? 0, dy0 = o.dirY ?? 0, dz0 = o.dirZ ?? 0;
    const delay = o.delay ?? 0;
    for (let i = 0; i < cnt; i++) {
      let vx = rnd() - 0.5, vy = rnd() - 0.3, vz = rnd() - 0.5;
      const l = Math.hypot(vx, vy, vz) || 1;
      vx /= l; vy /= l; vz /= l;
      if (focus > 0) { vx = vx * (1 - focus) + dx0 * focus; vy = vy * (1 - focus) + dy0 * focus; vz = vz * (1 - focus) + dz0 * focus; }
      const s = speed * (0.45 + rnd() * 0.75);
      const px = x + (rnd() - 0.5) * spread, py = y + (rnd() - 0.5) * spread, pz = z + (rnd() - 0.5) * spread;
      switch (kind) {
        case 'spark':
          b.reset().at(px, py, pz).vel(vx * s, vy * s + up, vz * s).size(sz * 0.32, sz * 1.8, 1, sz * 0.1, sz * 0.5, 1).span(o.life ?? 0.25 + rnd() * 0.25, delay).col(i % 3 ? color : WHITE, 2.6).fade(0.01, 0.5);
          b.grav = o.grav ?? 10; b.drag = 1.2;
          fx.emit('spark');
          break;
        case 'ember':
          b.reset().at(px, py, pz).vel(vx * s, vy * s + up, vz * s).rot(0, 0, rnd() * 6).spin(0, 0, (rnd() - 0.5) * 6).size(sz, sz, 1, sz * 0.4, sz * 0.4, 1).span(o.life ?? 0.6 + rnd() * 0.6, delay).col(color, 2.2).fade(0.05, 0.6);
          b.grav = o.grav ?? -1.5; b.drag = 1.6; b.flicker = 0.25;
          fx.emit('ember');
          break;
        case 'ice':
          b.reset().at(px, py, pz).vel(vx * s, vy * s + up, vz * s).rot(0, 0, rnd() * 6).spin(0, 0, (rnd() - 0.5) * 10).size(sz, sz, 1, sz * 0.5, sz * 0.5, 1).span(o.life ?? 0.7 + rnd() * 0.5, delay).col(i % 3 ? color : WHITE, 1.8).fade(0.02, 0.5);
          b.grav = o.grav ?? 9; b.drag = 0.8;
          fx.emit('ice');
          break;
        case 'drop':
          b.reset().at(px, py, pz).vel(vx * s * 0.8, Math.abs(vy) * s * 0.5 + up, vz * s * 0.8).size(sz * 0.7, sz * 1.5, 1, sz * 0.5, sz * 1.1, 1).span(o.life ?? 0.7 + rnd() * 0.5, delay).col(color, 1).fade(0.02, 0.4);
          b.grav = o.grav ?? 14; b.drag = 0.4;
          fx.emit('drop');
          break;
        case 'rock': case 'splinter': {
          const r = sz * (0.6 + rnd() * 0.9);
          b.reset().at(px, py, pz).vel(vx * s, Math.abs(vy) * s * 0.6 + up, vz * s).rot(rnd() * 6, rnd() * 6, rnd() * 6).spin(rnd() * 10, rnd() * 10).size(kind === 'splinter' ? r * 0.35 : r, kind === 'splinter' ? r * 1.6 : r, kind === 'splinter' ? r * 0.3 : r).span(o.life ?? 1.1 + rnd() * 0.6, delay).col(kind === 'splinter' ? SPLINTER : color, 1).fade(0.01, 0.2);
          b.grav = o.grav ?? 20;
          fx.emit('rock');
          break;
        }
        case 'smoke': case 'mist': case 'dust':
          b.reset().at(px, py, pz).vel(vx * s * 0.5, Math.abs(vy) * s * 0.3 + up, vz * s * 0.5).rot(0, 0, rnd() * 6).spin(0, 0, (rnd() - 0.5) * 1.5).size(sz * 0.5, sz * 0.5, 1, sz * 1.6, sz * 1.6, 1).span(o.life ?? 1 + rnd() * 0.6, delay).col(color, 1).fade(0.08, 0.6);
          b.grav = o.grav ?? -0.4; b.drag = 1.4;
          fx.emit('smoke');
          break;
      }
    }
    this.stats.bursts++;
  }

  // ---------- Spiralen, Trichter, Korona ----------

  /** Aufsteigende Energie-Spirale (Launcher, Wirbel): gewundene Bänder mit dunklem Rauchband dahinter, Glut steigt mit */
  spiral(x: number, y: number, z: number, radius: number, height: number, core: Color, life: number, n = 3, spin = 7) {
    const fx = this.fx, b = fx.brush;
    const ink = this.inkOf(core, C1);
    b.reset().at(x, y, z).rot(rnd() * 6).spin(spin * 0.8).size(radius * 0.9, height * 0.3, radius * 0.9, radius * 1.35, height * 1.05, radius * 1.35).span(life * 1.2).col(ink, 1).fade(0.05, 0.5);
    fx.emit('ribbonInk');
    for (let i = 0; i < n; i++) {
      b.reset().at(x, y, z).rot((i / n) * Math.PI * 2 + rnd() * 0.3).spin(spin).size(radius * 0.6, height * 0.2, radius * 0.6, radius * 1.15, height, radius * 1.15).span(life).col(i % 2 ? WHITE : core, i % 2 ? 1.5 : 2.4).fade(0.03, 0.55);
      fx.emit('ribbon');
    }
    this.burst('ember', x, y + height * 0.3, z, 5, 1.5, core, { up: height * 1.6, spread: radius * 1.4, size: 0.22 });
    this.stats.spirals++;
  }

  /** Trichter-Tornado: dunkler Mantel, leuchtender Kern, gewundene Bänder (Wind-Ultimate, Sog, Wirbel) */
  funnel(x: number, y: number, z: number, height: number, radius: number, core: Color, ink: Color, life: number) {
    const fx = this.fx, b = fx.brush;
    b.reset().at(x, y, z).spin(3.5).size(radius * 0.6, height * 0.4, radius * 0.6, radius * 1.12, height, radius * 1.12).span(life).col(ink, 1).fade(0.08, 0.25);
    fx.emit('funnelInk');
    b.reset().at(x, y, z).spin(6).size(radius * 0.5, height * 0.4, radius * 0.5, radius, height * 0.98, radius).span(life).col(core, 1.4).fade(0.08, 0.25);
    fx.emit('funnel');
    b.reset().at(x, y, z).rot(1.3).spin(-8).size(radius * 0.35, height * 0.4, radius * 0.35, radius * 0.72, height * 0.95, radius * 0.72).span(life * 0.96).col(WHITE, 0.9).fade(0.08, 0.25);
    fx.emit('funnel');
    this.stats.funnels++;
  }

  /** Sonnen-Korona: dunkler Hitze-Kontrastring, Flammenkranz (UV-Lauf), züngelnde Bänder – ohne weiße Überstrahlung */
  corona(x: number, y: number, z: number, yaw: number, radius: number, core: Color, accent: Color, life: number) {
    const fx = this.fx, b = fx.brush;
    b.reset().at(x, y, z).rot(yaw, Math.PI / 2, 0).size(radius * 0.8, 1, radius * 0.8, radius * 1.55, 1, radius * 1.55).span(life).col(this.inkOf(accent, C1), 1).fade(0.06, 0.3);
    fx.emit('crater');
    for (let k = 0; k < 3; k++) {
      b.reset().at(x, y, z).rot(yaw, Math.PI / 2, k * 0.7).spin(0, 0, (k % 2 ? -1 : 1) * (0.8 + k * 0.4)).size(radius * (0.9 + k * 0.18), 1, radius * (0.9 + k * 0.18), radius * (1.05 + k * 0.2), 1, radius * (1.05 + k * 0.2)).span(life).col(k === 1 ? core : accent, 1.25 - k * 0.2).fade(0.06, 0.3);
      fx.emit('ring');
    }
    for (let i = 0; i < 6; i++) {
      b.reset().at(x, y, z).rot(yaw + (i / 6) * Math.PI * 2, Math.PI / 2, 0).spin(0, 0, 1.2).size(radius * 0.3, radius * 0.5, radius * 0.3, radius * 0.75, radius * 1.4, radius * 0.75).span(life * 0.9).col(accent, i % 2 ? 1.1 : 0.8).fade(0.08, 0.35);
      fx.emit('ribbon');
    }
    this.stats.coronas++;
  }

  // ---------- Nachbilder, Glas-Schnitte, Schockringe ----------

  /** Silhouettenartiges Blitz-Nachbild einer Figur (Füße bei y): Kopf, Schultern, Flanken, Beine als gezackte Plasma-Umrisse */
  silhouette(x: number, y: number, z: number, yaw: number, core: Color, life = 0.32) {
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    // Umriss im Figurenraum (seitlich, Höhe): Kopf oben, Schultern, Hüfte, Füße
    const O = [-0.12, 1.86, 0.12, 1.86, 0.27, 1.5, 0.36, 1.0, 0.18, 0.95, 0.24, 0.05, 0, 0.9, -0.24, 0.05, -0.18, 0.95, -0.36, 1.0, -0.27, 1.5, -0.12, 1.86];
    const ink = this.inkOf(core, C1);
    for (let i = 0; i + 3 < O.length; i += 2) {
      const ax = x + rx * O[i], ay = y + O[i + 1], az = z + rz * O[i];
      const bx = x + rx * O[i + 2], by = y + O[i + 3], bz = z + rz * O[i + 2];
      const n = this.fractal(BPT, ax, ay, az, bx, by, bz, 2, 0.16);
      this.segments(BPT, n, core, ink, 0.07, life, 0.6, 2.4);
    }
    this.burst('spark', x, y + 1, z, 6, 6, core, { up: 1.5, spread: 0.8 });
    this.stats.silhouettes++;
  }

  /** 3D-Glas-Schnittflächen in der Luft: Splitter-Ebenen mit Runen-Rissen, die aufreißen und auseinanderdriften */
  glass(x: number, y: number, z: number, yaw: number, n: number, size: number, core: Color, life = 0.9) {
    const fx = this.fx, b = fx.brush;
    const cnt = this.n(n);
    // dunkler Raum hinter dem zerspringenden Glas (Tusche-Mantel): ein senkrechter Riss ins Schwarze
    b.reset().at(x, y, z).rot(yaw, Math.PI / 2, rnd() * 6).size(size * 0.3, 1, size * 0.3, size * 1.5, 1, size * 1.5).span(life * 0.8).col(this.inkOf(core, C1), 1).fade(0.01, 0.5);
    fx.emit('crater');
    for (let i = 0; i < cnt; i++) {
      const a = yaw + (rnd() - 0.5) * 2.4, d = rnd() * size * 1.4;
      const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d, py = y + (rnd() - 0.3) * size;
      const s = size * (0.35 + rnd() * 0.6);
      b.reset().at(px, py, pz).rot(rnd() * 6, (rnd() - 0.5) * 2.4, (rnd() - 0.5) * 2.4).spin((rnd() - 0.5) * 2, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2).vel((rnd() - 0.5) * 3, rnd() * 1.5, (rnd() - 0.5) * 3).size(s * 0.6, s * 0.6, s * 0.6, s, s, s).span(life * (0.7 + rnd() * 0.5)).col(i % 3 ? core : WHITE, 1.8).fade(0.01, 0.45);
      fx.emit('glass');
    }
    this.stats.glass++;
  }

  /** Senkrechter oder liegender Druckring mit dunklem Saum (Clash, Überschall, Kollaps) */
  pressureRing(x: number, y: number, z: number, yaw: number, vertical: boolean, radius: number, core: Color, life = 0.4, vx = 0, vz = 0) {
    const fx = this.fx, b = fx.brush;
    const pitch = vertical ? Math.PI / 2 : 0;
    b.reset().at(x, y, z).rot(yaw, pitch, 0).vel(vx, 0, vz).size(radius * 0.25, 1, radius * 0.25, radius * 1.15, 1, radius * 1.15).span(life * 1.2).col(this.inkOf(core, C1), 1).fade(0.01, 0.5);
    fx.emit('crater');
    b.reset().at(x, y, z).rot(yaw, pitch, 0).vel(vx, 0, vz).size(radius * 0.2, 1, radius * 0.2, radius, 1, radius).span(life).col(core, 2.2).fade(0.01, 0.6);
    fx.emit('shock');
  }
}
