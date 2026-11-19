import {
  BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { FactionId } from '../data/factions';
import { markShared } from './dispose';
import { paintFactionFlag } from './heraldry';
import { detailCanvas, texDetail } from './texDetail';
import { wrapAngle } from '../core/mathUtil';

/**
 * Schiffsflaggen als schweres Tuch (AAA-Fassung): fein unterteiltes Tuchnetz (32 × 20), das sich verjüngt oder als Schwalbenschwanz endet,
 * hochaufgelöste Vektor-Embleme (1024 × 640) mit Gold- und Silberborte, Webstruktur als Bump-Map, ausgefranste Kanten per alphaTest und ein
 * Stoff-Shader (`onBeforeCompile` auf MeshStandardMaterial, damit Nebel, Schatten und Licht des Spiels erhalten bleiben).
 *
 * Wind: Das Tuch folgt dem scheinbaren Wind (wahrer Wind minus Fahrtwind): bei Flaute hängt es schwer herab und rollt sich am Mast, mit Wind
 * und Fahrt streckt es sich und peitscht; die Richtung schwenkt um den Mast. Die Normalen folgen der Wellenkrümmung im Shader.
 * Wappen: `crestId` (eigene Wappen, `registerCrest`) oder `power` (Weltmacht, `render/heraldry.ts`) ersetzen das Emblem; alles Weitere ist Daten.
 */

export type ClothFlagKind = 'totenkopf' | 'krone' | 'anker' | 'welle' | 'stern' | 'marine';
export interface FlagSpec { flag: ClothFlagKind; color: string; power?: FactionId | null; crestId?: string | null }

/** Wappenmaler: zeichnet in den Einheitskreis (−1 … 1, y nach unten), Mittelpunkt bei (0, 0) */
export type CrestPainter = (g: CanvasRenderingContext2D, flagColor: string) => void;
const crests = new Map<string, CrestPainter>();
export function registerCrest(id: string, paint: CrestPainter) { crests.set(id, paint); }

const TEX_W = 1024, TEX_H = 640;

// ---------- Malen ----------
type G = CanvasRenderingContext2D;
const CREAM = '#F3E6C8';

function goldGrad(g: G, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#8A6420'); gr.addColorStop(0.32, '#F4DA7C'); gr.addColorStop(0.55, '#C9992F'); gr.addColorStop(0.8, '#F0D372'); gr.addColorStop(1, '#7A5518');
  return gr;
}
function silverGrad(g: G, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#8C939C'); gr.addColorStop(0.4, '#F2F5F8'); gr.addColorStop(0.7, '#B4BBC4'); gr.addColorStop(1, '#6F7680');
  return gr;
}

/** Füllen mit Prägung: dunkler Schlagschatten, Fläche, heller Rand oben links */
function emboss(g: G, path: () => void, fill: string | CanvasGradient, depth = 0.035) {
  g.save();
  g.translate(depth, depth * 1.2); g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); path(); g.fill();
  g.restore();
  g.fillStyle = fill; g.beginPath(); path(); g.fill();
  g.save(); g.lineWidth = depth * 0.5; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); path(); g.stroke(); g.restore();
}

function skullPath(g: G) {
  g.moveTo(0, -0.95);
  g.bezierCurveTo(0.42, -0.95, 0.72, -0.55, 0.64, 0.16);
  g.bezierCurveTo(0.62, 0.3, 0.5, 0.4, 0.46, 0.52);
  g.lineTo(0.42, 0.82); g.quadraticCurveTo(0.38, 0.96, 0.2, 0.96); g.lineTo(-0.2, 0.96); g.quadraticCurveTo(-0.38, 0.96, -0.42, 0.82);
  g.lineTo(-0.46, 0.52); g.bezierCurveTo(-0.5, 0.4, -0.62, 0.3, -0.64, 0.16);
  g.bezierCurveTo(-0.72, -0.55, -0.42, -0.95, 0, -0.95);
  g.closePath();
}

function cutlass(g: G, s: number) {
  g.save(); g.scale(s, 1); g.rotate(0.9);
  // Klinge: gekrümmt, mit Hohlkehle und Rückenlinie
  const blade = () => { g.moveTo(-0.075, 0.58); g.bezierCurveTo(-0.08, -0.4, 0.02, -1.12, 0.34, -1.62); g.bezierCurveTo(0.14, -1.06, 0.1, -0.4, 0.1, 0.58); g.closePath(); };
  emboss(g, blade, silverGrad(g, -0.1, 0, 0.14, 0), 0.03);
  g.strokeStyle = 'rgba(60,66,76,0.75)'; g.lineWidth = 0.018; g.beginPath(); g.moveTo(-0.02, 0.5); g.bezierCurveTo(-0.02, -0.4, 0.05, -1.0, 0.24, -1.42); g.stroke();
  // Gefäß: Parierstange, Handbügel, Griff, Knauf
  emboss(g, () => { g.rect(-0.3, 0.55, 0.6, 0.075); }, goldGrad(g, -0.3, 0, 0.3, 0), 0.025);
  g.strokeStyle = goldGrad(g, 0, 0.6, 0, 1.0); g.lineWidth = 0.045; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-0.3, 0.59); g.bezierCurveTo(-0.34, 0.95, -0.1, 1.02, 0.02, 0.97); g.stroke();
  g.fillStyle = '#3A2414'; g.fillRect(-0.045, 0.63, 0.09, 0.34);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.012; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-0.045, 0.66 + i * 0.055); g.lineTo(0.045, 0.69 + i * 0.055); g.stroke(); }
  emboss(g, () => { g.arc(0, 1.03, 0.07, 0, Math.PI * 2); }, goldGrad(g, -0.07, 0.96, 0.07, 1.1), 0.02);
  g.restore();
}

function paintSkull(g: G, fg: string) {
  // gekreuzte Entermesser hinter dem Schädel
  cutlass(g, 1); cutlass(g, -1);
  // Schädel mit weichem Verlauf, Wangenschatten und Rissen
  const gr = g.createRadialGradient(-0.2, -0.45, 0.1, 0, -0.1, 1.2);
  gr.addColorStop(0, '#FFF6DE'); gr.addColorStop(0.6, CREAM); gr.addColorStop(1, '#B9A57E');
  emboss(g, () => skullPath(g), gr, 0.04);
  g.save(); g.beginPath(); skullPath(g); g.clip();
  g.fillStyle = 'rgba(70,50,20,0.22)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 0.52, 0.38, 0.14, 0.2, s * 0.4, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(80,60,30,0.5)'; g.lineWidth = 0.014; g.beginPath(); g.moveTo(0.18, -0.9); g.lineTo(0.14, -0.7); g.lineTo(0.22, -0.55); g.lineTo(0.17, -0.42); g.stroke();
  g.restore();
  // Augenhöhlen, Brauenbögen, Nasenhöhle
  for (const s of [-1, 1]) {
    g.fillStyle = fg; g.beginPath(); g.ellipse(s * 0.27, 0.02, 0.2, 0.23, s * 0.28, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,250,235,0.55)'; g.lineWidth = 0.022; g.beginPath(); g.ellipse(s * 0.27, 0.02, 0.215, 0.245, s * 0.28, Math.PI * 1.05, Math.PI * 1.85); g.stroke();
  }
  g.fillStyle = fg; g.beginPath(); g.moveTo(0, 0.2); g.quadraticCurveTo(0.12, 0.34, 0.09, 0.5); g.lineTo(0.02, 0.45); g.lineTo(0, 0.5); g.lineTo(-0.02, 0.45); g.lineTo(-0.09, 0.5); g.quadraticCurveTo(-0.12, 0.34, 0, 0.2); g.fill();
  // Zähne
  g.fillStyle = '#F6EBCB'; g.strokeStyle = fg; g.lineWidth = 0.02;
  for (let i = 0; i < 8; i++) { const x = -0.34 + i * 0.097; g.beginPath(); g.rect(x, 0.62, 0.085, 0.26); g.fill(); g.stroke(); }
  g.fillStyle = fg; g.fillRect(-0.36, 0.745, 0.72, 0.014);
}

function paintCrown(g: G, fg: string) {
  // zwei gekreuzte Blitze hinter der Krone
  for (const s of [-1, 1]) {
    g.save(); g.scale(s, 1); g.rotate(0.62);
    emboss(g, () => { g.moveTo(-0.06, -1.55); g.lineTo(0.2, -0.9); g.lineTo(0.04, -0.9); g.lineTo(0.22, -0.2); g.lineTo(-0.1, -0.7); g.lineTo(0.04, -0.7); g.closePath(); }, silverGrad(g, -0.1, -1.5, 0.2, -0.2), 0.03);
    g.restore();
  }
  // Reif
  emboss(g, () => { g.moveTo(-0.85, 0.38); g.lineTo(0.85, 0.38); g.lineTo(0.8, 0.78); g.lineTo(-0.8, 0.78); g.closePath(); }, goldGrad(g, -0.85, 0.4, 0.85, 0.8), 0.035);
  // fünf Zacken mit Perlen, mittlere höher
  emboss(g, () => {
    g.moveTo(-0.85, 0.38); g.lineTo(-0.88, -0.38); g.lineTo(-0.56, 0.06); g.lineTo(-0.4, -0.5); g.lineTo(-0.18, 0.04);
    g.lineTo(0, -0.78); g.lineTo(0.18, 0.04); g.lineTo(0.4, -0.5); g.lineTo(0.56, 0.06); g.lineTo(0.88, -0.38); g.lineTo(0.85, 0.38); g.closePath();
  }, goldGrad(g, -0.9, -0.8, 0.9, 0.4), 0.035);
  for (const [x, y, r] of [[-0.88, -0.4, 0.07], [-0.4, -0.52, 0.07], [0, -0.82, 0.09], [0.4, -0.52, 0.07], [0.88, -0.4, 0.07]] as const) {
    const p = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); p.addColorStop(0, '#FFFFFF'); p.addColorStop(1, '#C9C2B0');
    g.fillStyle = p; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // Blitz-Edelstein in der Mitte und Juwelen am Reif
  const gem = g.createLinearGradient(0, -0.1, 0, 0.7); gem.addColorStop(0, '#CFF6FF'); gem.addColorStop(0.5, '#4FC3E8'); gem.addColorStop(1, '#1C6D9A');
  emboss(g, () => { g.moveTo(0.1, -0.12); g.lineTo(-0.14, 0.3); g.lineTo(-0.01, 0.3); g.lineTo(-0.1, 0.72); g.lineTo(0.17, 0.2); g.lineTo(0.03, 0.2); g.closePath(); }, gem, 0.02);
  for (const x of [-0.6, -0.34, 0.34, 0.6]) {
    g.fillStyle = x < 0 ? '#C8283A' : '#1F8F5A'; g.beginPath(); g.ellipse(x, 0.58, 0.08, 0.11, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = goldGrad(g, x - 0.1, 0.4, x + 0.1, 0.8); g.lineWidth = 0.03; g.stroke();
  }
  g.fillStyle = fg; g.globalAlpha = 0.25; g.fillRect(-0.8, 0.74, 1.6, 0.04); g.globalAlpha = 1;
}

function paintAnchor(g: G, fg: string) {
  const gold = goldGrad(g, -1, -1, 1, 1);
  emboss(g, () => { g.arc(0, -1.0, 0.2, 0, Math.PI * 2); g.arc(0, -1.0, 0.1, 0, Math.PI * 2, true); }, gold, 0.03);
  emboss(g, () => { g.rect(-0.07, -0.85, 0.14, 1.85); }, gold, 0.03);
  emboss(g, () => { g.rect(-0.45, -0.7, 0.9, 0.12); }, gold, 0.03);
  g.lineCap = 'round'; g.strokeStyle = gold; g.lineWidth = 0.14;
  g.beginPath(); g.arc(0, 0.2, 0.82, 0.18, Math.PI - 0.18); g.stroke();
  for (const s of [-1, 1]) emboss(g, () => { g.moveTo(s * 0.9, 0.12); g.lineTo(s * 0.66, 0.24); g.lineTo(s * 0.95, 0.42); g.lineTo(s * 1.08, 0.26); g.closePath(); }, gold, 0.03);
  // Tau um den Schaft
  g.strokeStyle = '#E2CFA0'; g.lineWidth = 0.05; g.beginPath();
  for (let i = 0; i <= 40; i++) { const t = i / 40; const x = Math.sin(t * Math.PI * 5) * 0.2, y = -0.78 + t * 1.55; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke(); g.strokeStyle = fg; g.globalAlpha = 0.45; g.lineWidth = 0.014; g.stroke(); g.globalAlpha = 1;
}

function paintWaves(g: G, fg: string) {
  for (let r = 0; r < 4; r++) {
    const y = -0.62 + r * 0.42, a = 0.2 - r * 0.02;
    const path = () => {
      g.moveTo(-1.5, y + 0.34);
      for (let i = 0; i <= 60; i++) { const x = -1.5 + i * 0.05; g.lineTo(x, y + Math.sin(x * 3.3 + r * 1.3) * a + Math.sin(x * 7.1 + r) * a * 0.25); }
      g.lineTo(1.5, y + 0.4); g.closePath();
    };
    emboss(g, path, r % 2 ? silverGrad(g, -1, y - 0.2, 1, y + 0.4) : goldGrad(g, -1, y - 0.2, 1, y + 0.4), 0.03);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.025; g.beginPath();
    for (let i = 0; i <= 60; i++) { const x = -1.5 + i * 0.05; const yy = y + Math.sin(x * 3.3 + r * 1.3) * a + Math.sin(x * 7.1 + r) * a * 0.25; if (i) g.lineTo(x, yy); else g.moveTo(x, yy); }
    g.stroke();
  }
  g.fillStyle = fg; g.globalAlpha = 0.18; g.fillRect(-1.5, 1.2, 3, 0.5); g.globalAlpha = 1;
}

function paintStar(g: G, fg: string) {
  const star = (n: number, ro: number, ri: number, rot: number) => () => { for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro, a = (i / (n * 2)) * Math.PI * 2 + rot; if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); };
  emboss(g, star(8, 1.15, 0.28, -Math.PI / 2), silverGrad(g, -1, -1, 1, 1), 0.035);
  emboss(g, star(4, 1.5, 0.3, -Math.PI / 2), goldGrad(g, -1, -1.5, 1, 1.5), 0.035);
  emboss(g, () => { g.arc(0, 0, 0.62, 0, Math.PI * 2); g.arc(0, 0, 0.5, 0, Math.PI * 2, true); }, goldGrad(g, -0.6, -0.6, 0.6, 0.6), 0.03);
  g.fillStyle = fg; g.beginPath(); g.arc(0, 0, 0.16, 0, Math.PI * 2); g.fill();
}

function paintShield(g: G, fg: string) {
  const sh = () => { g.moveTo(0, -1.1); g.lineTo(0.9, -0.8); g.lineTo(0.8, 0.3); g.quadraticCurveTo(0.6, 0.9, 0, 1.2); g.quadraticCurveTo(-0.6, 0.9, -0.8, 0.3); g.lineTo(-0.9, -0.8); g.closePath(); };
  emboss(g, sh, silverGrad(g, -1, -1, 1, 1), 0.04);
  g.save(); g.scale(0.88, 0.88); g.translate(0, 0.02); g.fillStyle = fg; g.beginPath(); sh(); g.fill(); g.restore();
  g.save(); g.scale(0.5, 0.5); g.translate(0, 0.1); paintAnchor(g, fg); g.restore();
}

/** Embleme je Flaggenart; alle zeichnen in den Einheitskreis */
const EMBLEM: Record<ClothFlagKind, (g: G, fg: string) => void> = {
  totenkopf: paintSkull, krone: paintCrown, anker: paintAnchor, welle: paintWaves, stern: paintStar, marine: paintShield,
};

/** Gold- und Silberborte, Ecken, Saumlinie und Hohlsaum am Mast */
function paintBorder(g: G, w: number, h: number) {
  const m = 14;
  g.save();
  // Goldrahmen mit Silberlitze innen
  g.lineWidth = 30; g.strokeStyle = goldGrad(g, 0, 0, w, h); g.strokeRect(m + 12, m + 12, w - 2 * m - 24, h - 2 * m - 24);
  g.lineWidth = 3.5; g.strokeStyle = 'rgba(70,45,10,0.9)'; g.strokeRect(m - 2, m - 2, w - 2 * m + 4, h - 2 * m + 4);
  g.lineWidth = 4; g.strokeStyle = silverGrad(g, 0, 0, w, h); g.strokeRect(m + 36, m + 36, w - 2 * m - 72, h - 2 * m - 72);
  // Kettenstich-Muster auf dem Goldband
  g.fillStyle = 'rgba(80,50,10,0.35)';
  for (let x = 40; x < w - 40; x += 18) { g.fillRect(x, m + 4, 8, 3); g.fillRect(x, h - m - 7, 8, 3); }
  for (let y = 40; y < h - 40; y += 18) { g.fillRect(m + 4, y, 3, 8); g.fillRect(w - m - 7, y, 3, 8); }
  // Eckverzierungen: Viertelkreise mit Rosette
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as const) {
    g.save(); g.translate(cx, cy); g.scale(sx, sy);
    g.fillStyle = goldGrad(g, 0, 0, 90, 90); g.beginPath(); g.moveTo(m, m); g.lineTo(m + 78, m); g.quadraticCurveTo(m + 22, m + 22, m, m + 78); g.closePath(); g.fill();
    g.fillStyle = 'rgba(60,35,5,0.6)'; g.beginPath(); g.arc(m + 26, m + 26, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#F6E7A8'; g.beginPath(); g.arc(m + 25, m + 25, 4.5, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.restore();
}

/** Hohlsaum am Mast: Segeltuchstreifen mit Messingösen */
function paintHoist(g: G, h: number) {
  const bw = 58;
  const gr = g.createLinearGradient(0, 0, bw, 0); gr.addColorStop(0, '#B79F72'); gr.addColorStop(0.5, '#D9C79B'); gr.addColorStop(1, '#A58D61');
  g.fillStyle = gr; g.fillRect(0, 0, bw, h);
  g.strokeStyle = 'rgba(60,40,15,0.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(bw - 6, 0); g.lineTo(bw - 6, h); g.stroke();
  g.setLineDash([9, 7]); g.lineWidth = 2; g.beginPath(); g.moveTo(bw - 14, 0); g.lineTo(bw - 14, h); g.stroke(); g.setLineDash([]);
  for (const y of [60, h * 0.5, h - 60]) {
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(bw / 2 + 1, y + 1.5, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = goldGrad(g, bw / 2 - 12, y - 12, bw / 2 + 12, y + 12); g.beginPath(); g.arc(bw / 2, y, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2A1A0C'; g.beginPath(); g.arc(bw / 2, y, 5.5, 0, Math.PI * 2); g.fill();
  }
}

/** Fertig gemaltes Flaggenbild (Farb-Leinwand) für eine Beschreibung */
export function paintFlagArt(g: G, w: number, h: number, spec: FlagSpec) {
  const k = w / TEX_W;
  g.save(); g.scale(k, k);
  const W = TEX_W, H = (h / w) * TEX_W;
  if (spec.power) {
    paintFactionFlag(spec.power, g, W, H);
  } else {
    // Tuchfarbe mit leichtem Verlauf und Randabdunklung
    g.fillStyle = spec.flag === 'marine' ? '#F6F6F2' : spec.color; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W * 0.5, H * 0.5, H * 0.2, W * 0.5, H * 0.5, W * 0.62); vg.addColorStop(0, 'rgba(255,255,255,0.08)'); vg.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const cx = W * 0.54, cy = H * 0.5;
    g.save(); g.translate(cx, cy);
    const S = H * (spec.flag === 'totenkopf' ? 0.305 : spec.flag === 'welle' ? 0.27 : 0.34);
    g.scale(S, S);
    const dark = spec.flag === 'marine' ? spec.color : darker(spec.color);
    const crest = spec.crestId ? crests.get(spec.crestId) : undefined;
    if (crest) crest(g, spec.color); else EMBLEM[spec.flag](g, dark);
    g.restore();
  }
  paintBorder(g, W, H);
  paintHoist(g, H);
  g.restore();
}

function darker(c: string): string {
  const col = new Color(c); col.multiplyScalar(0.28); return `#${col.getHexString()}`;
}

// ---------- Texturen (geteilt) ----------
interface ClothTextures { map: CanvasTexture; bump: CanvasTexture }
const texCache = new Map<string, ClothTextures>();

function weaveBump(art: HTMLCanvasElement): HTMLCanvasElement {
  const { c, g } = detailCanvas(TEX_W, TEX_H);
  g.fillStyle = '#808080'; g.fillRect(0, 0, TEX_W, TEX_H);
  // Leinwandbindung: feine Fäden in beide Richtungen, abwechselnd über und unter
  const cell = 5;
  for (let y = 0; y < TEX_H; y += cell) {
    for (let x = 0; x < TEX_W; x += cell) {
      const over = ((x / cell) + (y / cell)) & 1;
      g.fillStyle = over ? '#9A9A9A' : '#6A6A6A';
      g.fillRect(x, y, cell, cell - 1);
      g.fillStyle = over ? '#B2B2B2' : '#767676';
      g.fillRect(x, y, cell - 1, 1);
    }
  }
  // unregelmäßige Garn-Dicke
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.globalAlpha = 0.07;
  for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? '#FFFFFF' : '#000000'; g.fillRect(rnd() * TEX_W, rnd() * TEX_H, 40 + rnd() * 160, 1 + rnd() * 2); }
  g.globalAlpha = 1;
  // gestickte Embleme und Borten stehen als Relief auf dem Tuch
  g.save();
  (g as unknown as { filter: string }).filter = 'grayscale(1) contrast(1.6) blur(1.5px)';
  g.globalAlpha = 0.55; g.globalCompositeOperation = 'overlay'; g.drawImage(art, 0, 0, TEX_W, TEX_H);
  g.restore();
  return c;
}

export function clothTextures(spec: FlagSpec): ClothTextures {
  const key = `${spec.flag}|${spec.color}|${spec.power ?? ''}|${spec.crestId ?? ''}`;
  let t = texCache.get(key);
  if (t) return t;
  const { c, g } = detailCanvas(TEX_W, TEX_H);
  paintFlagArt(g, TEX_W, TEX_H, spec);
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace; map.anisotropy = texDetail.aniso; map.generateMipmaps = true; map.minFilter = LinearMipmapLinearFilter;
  const bump = new CanvasTexture(weaveBump(c));
  bump.anisotropy = texDetail.aniso; bump.wrapS = bump.wrapT = RepeatWrapping;
  t = { map: markShared(map), bump: markShared(bump) };
  texCache.set(key, t);
  return t;
}

// ---------- Tuchnetz ----------
export interface ClothShape {
  /** Länge entlang des Winds (Mast bei 0) und Höhe an der Mastseite, Meter */
  len: number; height: number;
  /** Verjüngung zur freien Kante: Höhe dort = (1 − taper) × height */
  taper?: number;
  /** Tiefe des Schwalbenschwanz-Einschnitts als Anteil der Länge (0 = glatte Kante) */
  swallow?: number;
  segsX?: number; segsY?: number;
}

/**
 * Tuch mit Gewicht `aFlag` (0 am Mast, 1 an der freien Kante) und Kantenabstand `aEdge` (x: zu Ober- und Unterkante, y: zur freien Kante,
 * beide in Höhen des Tuchs), für Auswehen und Ausfransen im Shader.
 */
export function clothGeometry(s: ClothShape): BufferGeometry {
  const nx = s.segsX ?? 32, ny = s.segsY ?? 20, taper = s.taper ?? 0, notch = s.swallow ?? 0;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], fl: number[] = [], ed: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ny; j++) {
    const v = j / ny;
    const xmax = s.len * (1 - notch * (1 - Math.abs(2 * v - 1)));
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx) * xmax;
      const hh = s.height * (1 - taper * (x / s.len));
      pos.push(x, (v - 0.5) * hh, 0); nor.push(0, 0, 1);
      // Leinwand-Texturen haben flipY: v = 1 ist die OBERE Bildkante, und v = 1 gehört zur Oberkante des Tuchs (y = +hh/2)
      uv.push(x / s.len, v);
      fl.push(x / s.len);
      ed.push(Math.min(v, 1 - v) * hh / s.height, (xmax - x) / s.height);
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aFlag', new Float32BufferAttribute(fl, 1));
  g.setAttribute('aEdge', new Float32BufferAttribute(ed, 2));
  g.setIndex(idx);
  return g;
}

// ---------- Material und Wind ----------
export interface ClothUniforms {
  /** Phase der Wellen (läuft mit der Windstärke) */
  uFPh: { value: number };
  /** Steifheit 0 (hängt schlaff) … 1 (gestreckt, peitscht) */
  uFK: { value: number };
  /** Schwenk um den Mast (Bogenmaß, 0 = genau achteraus) */
  uFAng: { value: number };
  uFLen: { value: number };
  uFH: { value: number };
}
export const makeClothUniforms = (len: number, height: number): ClothUniforms => ({ uFPh: { value: 0 }, uFK: { value: 0.5 }, uFAng: { value: 0 }, uFLen: { value: len }, uFH: { value: height } });

const GLSL_COMMON = /* glsl */ `
  attribute float aFlag; attribute vec2 aEdge;
  uniform float uFPh; uniform float uFK; uniform float uFAng; uniform float uFLen; uniform float uFH;
  varying vec2 vEdge; varying vec2 vFuv;
  float skFlagD(vec2 q) {
    float fk = q.x;
    float w = sin(uFPh - fk * 7.0 - q.y * 2.2) + 0.38 * sin(uFPh * 1.9 - fk * 13.0 + q.y * 3.4) + 0.5 * sin(uFPh * 0.55 - fk * 3.2);
    float amp = uFLen * (0.016 + 0.082 * uFK);
    return w * amp * fk * (0.35 + 0.65 * fk);
  }`;

const FRAG_COMMON = /* glsl */ `
  varying vec2 vEdge; varying vec2 vFuv;
  float skFh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float skFn(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(skFh(i), skFh(i + vec2(1.0, 0.0)), f.x), mix(skFh(i + vec2(0.0, 1.0)), skFh(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;

/**
 * Tuchmaterial: MeshStandardMaterial mit Bump-Map und Alpha-Test (ausgefranste Kanten), Doppelseiten; die Hinterseite spiegelt die Vorderseite.
 * Emissive mit der Farbkarte lässt das Tuch im Gegenlicht glühen (`ship.ts` setzt die Stärke).
 */
export function clothMaterial(tex: ClothTextures, u: ClothUniforms): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    map: tex.map, bumpMap: tex.bump, bumpScale: 1.6, roughness: 0.93, metalness: 0, side: DoubleSide, alphaTest: 0.5,
    emissive: new Color(0, 0, 0), emissiveMap: tex.map,
  });
  m.onBeforeCompile = function (shader: WebGLProgramParametersWithUniforms) {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        {
          // Normale folgt der Wellenkrümmung (Steigung der Auslenkung in Länge und Höhe), danach mit dem Schwenk um den Mast gedreht
          vec2 q = position.xy / uFLen;
          float e = 0.02;
          float d0 = skFlagD(q);
          float gx = (skFlagD(q + vec2(e, 0.0)) - d0) / (e * uFLen);
          float gy = (skFlagD(q + vec2(0.0, e)) - d0) / (e * uFLen);
          vec3 fn = normalize(vec3(-gx, -gy, 1.0));
          float ang0 = uFAng * (0.15 + 0.85 * smoothstep(0.0, 0.6, aFlag));
          float cs0 = cos(ang0), sn0 = sin(ang0);
          objectNormal = vec3(cs0 * fn.x - sn0 * fn.z, fn.y, sn0 * fn.x + cs0 * fn.z);
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float fk = aFlag;
          float slack = 1.0 - uFK;
          vec2 q = position.xy / uFLen;
          transformed.z += skFlagD(q);
          // Flaute: das Tuch hängt schwer herab und rafft sich am Mast; mit Wind streckt es sich und flattert in der Höhe
          transformed.y -= slack * fk * fk * uFH * 0.62;
          transformed.x *= 1.0 - slack * 0.3 * fk;
          transformed.y += sin(uFPh * 1.3 - fk * 5.0) * 0.025 * uFH * fk * uFK;
          float ang = uFAng * (0.15 + 0.85 * smoothstep(0.0, 0.6, fk));
          float cs = cos(ang), sn = sin(ang);
          transformed.xz = vec2(cs * transformed.x - sn * transformed.z, sn * transformed.x + cs * transformed.z);
          vEdge = aEdge; vFuv = uv;
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_COMMON}`)
      .replace('#include <alphatest_fragment>', `
        {
          // ausgefranste Kanten: oben und unten feine Fasern, an der freien Kante lange Fäden in Zugrichtung; am Mast sauberer Saum
          float tb = 0.008 + 0.034 * skFn(vec2(vFuv.x * 150.0, vFuv.y * 12.0));
          float tr = 0.03 + 0.12 * skFn(vec2(vFuv.x * 12.0, vFuv.y * 210.0)) + 0.02 * skFn(vFuv * 90.0);
          if (vEdge.x < tb || vEdge.y < tr) diffuseColor.a = 0.0;
          // Verwitterung: ungleichmäßig ausgeblichen, zur freien Kante grauer, Fransen dunkler
          float wv = skFn(vFuv * vec2(5.0, 3.5)), fine = skFn(vFuv * vec2(26.0, 18.0));
          diffuseColor.rgb *= mix(1.0, (0.78 + 0.22 * wv) * (0.9 + 0.1 * fine), 0.8);
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(1.0, 0.96, 0.88), 0.1 + 0.16 * vFuv.x * wv);
          diffuseColor.rgb *= 0.78 + 0.22 * smoothstep(0.0, 0.07, min(vEdge.y, vEdge.x * 1.6));
        }
        #include <alphatest_fragment>`);
  };
  m.customProgramCacheKey = () => 'flagcloth3';
  return m;
}

// ---------- Wind ----------
/** Zustand eines wehenden Tuchs auf einem Schiff (die Uniforms treiben den Shader) */
export interface ClothFlag { mesh: import('three').Mesh; u: ClothUniforms; mat: MeshStandardMaterial; ang: number; ph: number }

/**
 * Je Bild: scheinbarer Wind am Schiff = wahrer Wind (Richtung, Stärke) minus Fahrtwind. Das Tuch streckt sich mit dessen Stärke und
 * schwenkt in dessen Richtung; die Phase läuft mit Wind und Fahrt (bei Flaute fast still).
 * `heading`: Kurs des Schiffs (Bogenmaß, Welt), `windDir`: Richtung, in die der Wind weht, `windStrength`: 0 … ~2, `shipSpeed`: m/s.
 */
export function updateClothFlag(f: ClothFlag, dt: number, heading: number, windDir: number, windStrength: number, shipSpeed: number) {
  const ws = 1.2 + windStrength * 9.5;
  const ax = Math.sin(windDir) * ws - Math.sin(heading) * shipSpeed;
  const az = Math.cos(windDir) * ws - Math.cos(heading) * shipSpeed;
  const m = Math.hypot(ax, az);
  // im Schiffsraum: +x = (cos h, −sin h), +z = (sin h, cos h); achteraus ist −z
  const lx = ax * Math.cos(heading) - az * Math.sin(heading);
  const lz = ax * Math.sin(heading) + az * Math.cos(heading);
  const target = m > 0.6 ? Math.atan2(lx, -lz) : 0;
  const k = Math.min(1, dt * (1.2 + Math.min(1, m / 8) * 2.5));
  f.ang += wrapAngle(target - f.ang) * k;
  const stiff = Math.max(0.04, Math.min(1, m / 11));
  f.u.uFK.value += (stiff - f.u.uFK.value) * Math.min(1, dt * 2.2);
  f.ph += dt * (0.8 + 7.8 * f.u.uFK.value);
  f.u.uFPh.value = f.ph;
  f.u.uFAng.value = Math.max(-1.35, Math.min(1.35, f.ang));
}
