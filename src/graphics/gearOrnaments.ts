// 4.6G.2: Ornament-Textur der Ausrüstung (512 × 512, kachelbar, geteilt) – Grundlage für gestochen scharfe Runen und goldenes Filigran auf Rüstungen.
//
// Kanäle (Datenwerte, kein Farbraum):
//   R = Runen-Glyphen: 4 × 4 Felder, gut die Hälfte trägt ein Zeichen (Ring mit kantigen Strichen – eigene Sturmkrone-Zeichen: Welle, Anker,
//       Blitz, Dreizack, Sichel, Stern, Krone, Auge), scharfe Kanten, 6 px Strich bei 128 px Feldgröße
//   G = Filigran: geschwungene Ranken mit Spiralen und Blättchen (waagrecht und senkrecht kachelbar)
//   B = Leucht-Hof der Runen (weichgezeichnetes R): Gravur-Schatten und Glimmen
// Der Shader (render/toon.ts, GEAR_FRAG_GLSL, Muster 8 Runen und 9 Filigran) liest sie über die Uniform `uSkOrn` – kein neues Programm.
import { CanvasTexture, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping } from 'three';
import { markShared } from '../render/dispose';

export const ORNAMENT_SIZE = 512;
/** Felder je Kachel und Richtung (Runen) */
export const RUNE_CELLS = 4;
/** Arten der Runen-Zeichen (eigene Zeichen, keine echte Schrift) */
export const RUNE_KINDS = ['welle', 'anker', 'blitz', 'dreizack', 'sichel', 'stern', 'krone', 'auge'] as const;

function rnd(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/** Welche Felder ein Zeichen tragen und welches (fest, gleich für jede Figur): Index in RUNE_KINDS oder −1 */
export function runeLayout(seed = 4711): number[] {
  const R = rnd(seed);
  const out: number[] = [];
  for (let i = 0; i < RUNE_CELLS * RUNE_CELLS; i++) out.push(R() < 0.58 ? Math.floor(R() * RUNE_KINDS.length) : -1);
  // nie zwei gleiche Zeichen nebeneinander in einer Reihe
  for (let i = 1; i < out.length; i++) if (out[i] >= 0 && out[i] === out[i - 1]) out[i] = (out[i] + 3) % RUNE_KINDS.length;
  return out;
}

/** Ein Zeichen in einem Feld (Mitte cx, cy, Halbmesser r), weiß auf schwarz */
function glyph(g: CanvasRenderingContext2D, kind: number, cx: number, cy: number, r: number) {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.lineCap = 'round'; g.lineJoin = 'round';
  // äußerer Ring und feiner Innenring
  g.lineWidth = r * 0.085;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = r * 0.035;
  g.beginPath(); g.arc(0, 0, r * 0.82, 0, Math.PI * 2); g.stroke();
  // vier Kerben im Ring (Kompassrose)
  g.lineWidth = r * 0.07;
  for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82); g.lineTo(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12); g.stroke(); }
  g.lineWidth = r * 0.11;
  const s = r * 0.55;
  const line = (pts: [number, number][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s))); g.stroke(); };
  switch (RUNE_KINDS[kind]) {
    case 'welle': line([[-1, 0.2], [-0.5, -0.35], [0, 0.2], [0.5, -0.35], [1, 0.2]]); line([[-0.7, 0.7], [-0.25, 0.35], [0.25, 0.7], [0.7, 0.35]]); break;
    case 'anker': line([[0, -1], [0, 0.85]]); line([[-0.45, -0.55], [0.45, -0.55]]); line([[-0.85, 0.25], [-0.6, 0.75], [0, 0.95], [0.6, 0.75], [0.85, 0.25]]); break;
    case 'blitz': line([[0.35, -1], [-0.3, -0.05], [0.25, -0.05], [-0.35, 1]]); break;
    case 'dreizack': line([[0, -1], [0, 1]]); line([[-0.7, -0.75], [-0.7, -0.2], [0.7, -0.2], [0.7, -0.75]]); line([[-0.3, 0.6], [0.3, 0.6]]); break;
    case 'sichel': g.beginPath(); g.arc(-0.15 * s, 0, s * 0.85, -1.2, 1.2); g.stroke(); line([[0.2, -0.6], [0.2, 0.6]]); break;
    case 'stern': for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 4; line([[Math.cos(a), Math.sin(a)], [-Math.cos(a), -Math.sin(a)]]); } g.beginPath(); g.arc(0, 0, s * 0.18, 0, Math.PI * 2); g.fill(); break;
    case 'krone': line([[-0.85, 0.55], [-0.85, -0.45], [-0.4, 0.1], [0, -0.75], [0.4, 0.1], [0.85, -0.45], [0.85, 0.55], [-0.85, 0.55]]); break;
    case 'auge': g.beginPath(); g.ellipse(0, 0, s * 0.95, s * 0.5, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(0, 0, s * 0.22, 0, Math.PI * 2); g.fill(); break;
  }
  g.restore();
}

/** Filigran-Ranken: geschwungene Linie mit Spiralen und Blättchen, kachelbar (gezeichnet mit Versatz ±S) */
function filigree(g: CanvasRenderingContext2D, S: number) {
  const R = rnd(907);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.lineCap = 'round'; g.lineJoin = 'round';
  const rows = 4;
  for (let row = 0; row < rows; row++) {
    const y0 = (row + 0.5) * (S / rows), amp = S / rows * 0.28, k = 2, ph = row * 1.7;
    const yAt = (x: number) => y0 + Math.sin((x / S) * Math.PI * 2 * k + ph) * amp;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      // Hauptranke
      g.lineWidth = 3.4;
      g.beginPath();
      for (let x = 0; x <= S; x += 4) { const y = yAt(x); if (x) g.lineTo(x + ox, y + oy); else g.moveTo(x + ox, y + oy); }
      g.stroke();
    }
    // Spiralen und Blättchen an den Wendepunkten (abwechselnd oben/unten), fester Zufall je Reihe
    const n = 4 * k;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (S / n), y = yAt(x);
      const up = i % 2 ? 1 : -1;
      const rr = 9 + R() * 5;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const cx = x + ox, cy = y + oy + up * rr * 1.25;
        // Spirale (archimedisch, 1,6 Umdrehungen)
        g.lineWidth = 2.6;
        g.beginPath();
        for (let t = 0; t <= 1.6 * Math.PI * 2; t += 0.2) {
          const rad = rr * (1 - t / (1.6 * Math.PI * 2 + 0.6));
          const px = cx + Math.cos(t + (up > 0 ? Math.PI : 0)) * rad, py = cy + Math.sin(t) * rad * up;
          if (t) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.stroke();
        // Blättchen (Tropfen) gegenüber
        g.beginPath();
        const bx = x + ox + S / n * 0.25, by = y + oy - up * 7;
        g.ellipse(bx, by, 5.5, 2.4, up * 0.6, 0, Math.PI * 2);
        g.fill();
        // kleine Perle
        g.beginPath(); g.arc(x + ox - S / n * 0.3, y + oy + up * 2, 2.2, 0, Math.PI * 2); g.fill();
      }
    }
  }
  // feine Begleitlinie (zweite, dünnere Ranke versetzt)
  g.lineWidth = 1.4;
  for (let row = 0; row < rows; row++) {
    const y0 = (row + 0.5) * (S / rows) + 7, amp = S / rows * 0.24, k = 2, ph = row * 1.7 + 0.3;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath();
      for (let x = 0; x <= S; x += 4) { const y = y0 + Math.sin((x / S) * Math.PI * 2 * k + ph) * amp; if (x) g.lineTo(x + ox, y + oy); else g.moveTo(x + ox, y + oy); }
      g.stroke();
    }
  }
}

/** Getrennter Kastenfilter (kachelbar, wickelt an den Rändern), zweimal = annähernd Gauß */
function blurWrap(src: Float32Array, S: number, r: number): Float32Array {
  const a = src.slice(), b = new Float32Array(S * S);
  const pass = (from: Float32Array, to: Float32Array, horiz: boolean) => {
    const n = 2 * r + 1;
    for (let line = 0; line < S; line++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) { const i = (k + S) % S; sum += horiz ? from[line * S + i] : from[i * S + line]; }
      for (let i = 0; i < S; i++) {
        if (horiz) to[line * S + i] = sum / n; else to[i * S + line] = sum / n;
        const out = (i - r + S) % S, inn = (i + r + 1) % S;
        sum += (horiz ? from[line * S + inn] : from[inn * S + line]) - (horiz ? from[line * S + out] : from[out * S + line]);
      }
    }
  };
  for (let it = 0; it < 2; it++) { pass(a, b, true); pass(b, a, false); }
  return a;
}

let tex: CanvasTexture | null = null;
/** Geteilte Ornament-Textur (null ohne Dokument, z. B. in Tests) */
export function gearOrnamentTexture(): CanvasTexture | null {
  if (tex) return tex;
  if (typeof document === 'undefined') return null;
  const S = ORNAMENT_SIZE;
  const mk = () => { const c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d', { willReadFrequently: true }); if (g) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); } return { c, g }; };
  const runes = mk(), fil = mk(), out = mk();
  if (!runes.g || !fil.g || !out.g) return null;
  const cell = S / RUNE_CELLS;
  runeLayout().forEach((k, i) => { if (k >= 0) glyph(runes.g!, k, (i % RUNE_CELLS + 0.5) * cell, (Math.floor(i / RUNE_CELLS) + 0.5) * cell, cell * 0.34); });
  filigree(fil.g, S);
  const rd = runes.g.getImageData(0, 0, S, S).data, fd = fil.g.getImageData(0, 0, S, S).data;
  const r = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) r[i] = rd[i * 4] / 255;
  const halo = blurWrap(r, S, 5);
  const img = out.g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    img.data[i * 4] = rd[i * 4];
    img.data[i * 4 + 1] = fd[i * 4];
    img.data[i * 4 + 2] = Math.min(255, Math.round(halo[i] * 255 * 2.2));
    img.data[i * 4 + 3] = 255;
  }
  out.g.putImageData(img, 0, 0);
  const t = new CanvasTexture(out.c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.colorSpace = NoColorSpace;
  t.anisotropy = 4;
  t.name = 'gearOrnaments';
  tex = markShared(t);
  return tex;
}
