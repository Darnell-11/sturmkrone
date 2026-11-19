import { CanvasTexture, SRGBColorSpace } from 'three';
import { FACTIONS, type EmblemId, type FactionId } from '../data/factions';
import { detailCanvas, texDetail } from './texDetail';
import { markShared } from './dispose';

/**
 * Heraldik der sechs Weltmächte: Flaggen, Segelmuster und Wappen, gemalt auf Canvas (Daten stehen in data/factions.ts).
 * Auf See muss man jede Macht schon von weitem erkennen: Segel tragen ein großflächiges Muster (England rotes Kreuz, Niederlande
 * Orange-Weiß-Blau, Deutschland schwarz-weiße Bahnen, Frankreich goldene Lilien auf Königsblau, Kurogane Dämonenmaske auf Blutrot,
 * Marine blaue Bänder mit Möwe und Anker). Alle Texturen sind geteilt (`markShared`) und mit Mipmaps und Anisotropie gefiltert.
 */

export type Paint = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** Muster und Wappen für das Segeltuch (gemalt in der logischen Größe 512 × 384, siehe `sailTexture`) */
export interface SailHeraldry { pattern: Paint | null; emblem: Paint }

const pal = (id: FactionId) => FACTIONS[id].palette;

// ---------- Wappen: gezeichnet in einem Einheitskreis (−1 … 1, y nach unten) ----------

type Pal = ReturnType<typeof pal>;

function lily(g: CanvasRenderingContext2D, fill: string) {
  g.fillStyle = fill;
  // mittleres Blatt
  g.beginPath(); g.moveTo(0, -0.92); g.bezierCurveTo(0.38, -0.5, 0.3, -0.08, 0, 0.14); g.bezierCurveTo(-0.3, -0.08, -0.38, -0.5, 0, -0.92); g.closePath(); g.fill();
  // seitliche, eingerollte Blätter
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 0.08, 0.02);
    g.bezierCurveTo(s * 0.55, -0.52, s * 1.02, -0.22, s * 0.84, 0.2);
    g.bezierCurveTo(s * 0.74, 0.4, s * 0.5, 0.42, s * 0.42, 0.28);
    g.bezierCurveTo(s * 0.62, 0.3, s * 0.7, 0.1, s * 0.5, 0.02);
    g.bezierCurveTo(s * 0.34, -0.04, s * 0.2, 0.06, s * 0.08, 0.14);
    g.closePath(); g.fill();
  }
  // Band und Fuß
  g.beginPath(); g.moveTo(-0.46, 0.2); g.lineTo(0.46, 0.2); g.lineTo(0.46, 0.38); g.lineTo(-0.46, 0.38); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-0.13, 0.4); g.lineTo(0, 0.94); g.lineTo(0.13, 0.4); g.closePath(); g.fill();
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.1, 0.4); g.bezierCurveTo(s * 0.5, 0.46, s * 0.58, 0.72, s * 0.34, 0.86); g.bezierCurveTo(s * 0.42, 0.66, s * 0.3, 0.52, s * 0.1, 0.5); g.closePath(); g.fill(); }
}

function eagle(g: CanvasRenderingContext2D, fill: string, gold: string) {
  g.fillStyle = fill;
  // Flügel mit Schwungfedern, gespiegelt
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 0.18, -0.22);
    g.lineTo(s * 0.7, -0.78); g.lineTo(s * 0.66, -0.46); g.lineTo(s * 0.98, -0.5); g.lineTo(s * 0.84, -0.18);
    g.lineTo(s * 1.0, -0.06); g.lineTo(s * 0.8, 0.1); g.lineTo(s * 0.86, 0.3); g.lineTo(s * 0.6, 0.22); g.lineTo(s * 0.58, 0.4); g.lineTo(s * 0.34, 0.26); g.lineTo(s * 0.18, 0.2);
    g.closePath(); g.fill();
  }
  // Rumpf, Schwanz, Kopf mit Schnabel
  g.beginPath(); g.ellipse(0, 0.04, 0.24, 0.42, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(-0.2, 0.38); g.lineTo(-0.16, 0.92); g.lineTo(-0.06, 0.8); g.lineTo(0, 0.96); g.lineTo(0.06, 0.8); g.lineTo(0.16, 0.92); g.lineTo(0.2, 0.38); g.closePath(); g.fill();
  g.beginPath(); g.arc(0, -0.5, 0.17, 0, Math.PI * 2); g.fill();
  g.fillStyle = gold;
  g.beginPath(); g.moveTo(0.1, -0.56); g.lineTo(0.36, -0.46); g.lineTo(0.1, -0.4); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-0.14, -0.66); g.lineTo(-0.1, -0.84); g.lineTo(-0.03, -0.7); g.lineTo(0, -0.88); g.lineTo(0.03, -0.7); g.lineTo(0.1, -0.84); g.lineTo(0.14, -0.66); g.closePath(); g.fill();
  // Krallen
  g.strokeStyle = gold; g.lineWidth = 0.07; g.lineCap = 'round';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.12, 0.42); g.lineTo(s * 0.3, 0.62); g.moveTo(s * 0.12, 0.42); g.lineTo(s * 0.14, 0.64); g.stroke(); }
}

function onaMask(g: CanvasRenderingContext2D, face: string, dark: string) {
  // gekreuzte Klingen hinter der Maske
  for (const s of [-1, 1]) {
    g.save(); g.rotate(s * 0.62);
    g.fillStyle = '#C8CCD4'; g.beginPath(); g.moveTo(-0.045, 0.78); g.lineTo(-0.05, -0.9); g.lineTo(0.0, -1.0); g.lineTo(0.05, -0.9); g.lineTo(0.045, 0.78); g.closePath(); g.fill();
    g.fillStyle = dark; g.fillRect(-0.2, 0.62, 0.4, 0.07); g.fillRect(-0.05, 0.69, 0.1, 0.3);
    g.restore();
  }
  // Hörner
  g.fillStyle = face;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.26, -0.42); g.quadraticCurveTo(s * 0.62, -0.62, s * 0.5, -1.0); g.quadraticCurveTo(s * 0.36, -0.7, s * 0.14, -0.5); g.closePath(); g.fill(); }
  // Gesicht
  g.beginPath(); g.moveTo(-0.46, -0.34); g.quadraticCurveTo(0, -0.62, 0.46, -0.34); g.quadraticCurveTo(0.54, 0.2, 0.28, 0.56); g.quadraticCurveTo(0, 0.7, -0.28, 0.56); g.quadraticCurveTo(-0.54, 0.2, -0.46, -0.34); g.closePath(); g.fill();
  g.fillStyle = dark;
  // Augenschlitze, Brauen, Nase, Mund mit Fängen
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(s * 0.08, -0.14); g.lineTo(s * 0.4, -0.26); g.lineTo(s * 0.34, -0.06); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(s * 0.04, -0.3); g.lineTo(s * 0.42, -0.42); g.lineTo(s * 0.4, -0.34); g.lineTo(s * 0.06, -0.24); g.closePath(); g.fill();
  }
  g.beginPath(); g.moveTo(0, -0.08); g.lineTo(0.07, 0.16); g.lineTo(-0.07, 0.16); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-0.3, 0.3); g.quadraticCurveTo(0, 0.2, 0.3, 0.3); g.quadraticCurveTo(0, 0.46, -0.3, 0.3); g.closePath(); g.fill();
  g.fillStyle = '#F2EEE4';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.2, 0.28); g.lineTo(s * 0.26, 0.5); g.lineTo(s * 0.12, 0.31); g.closePath(); g.fill(); }
}

function anchorGull(g: CanvasRenderingContext2D, ink: string, gold: string) {
  g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round';
  // Anker
  g.lineWidth = 0.1;
  g.beginPath(); g.arc(0, -0.28, 0.14, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(0, -0.14); g.lineTo(0, 0.62); g.moveTo(-0.3, -0.04); g.lineTo(0.3, -0.04); g.stroke();
  g.lineWidth = 0.11;
  g.beginPath(); g.arc(0, 0.12, 0.52, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke();
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.5, 0.2); g.lineTo(s * 0.7, 0.04); g.lineTo(s * 0.66, 0.3); g.closePath(); g.fill(); }
  // Möwe darüber
  g.strokeStyle = gold; g.lineWidth = 0.09;
  g.beginPath(); g.moveTo(-0.78, -0.52); g.quadraticCurveTo(-0.4, -1.02, 0, -0.66); g.quadraticCurveTo(0.4, -1.02, 0.78, -0.52); g.stroke();
}

function vocMark(g: CanvasRenderingContext2D, ink: string, accent: string) {
  g.strokeStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 0.24;
  g.beginPath(); g.moveTo(-0.5, -0.5); g.lineTo(0, 0.62); g.lineTo(0.5, -0.5); g.stroke();
  g.lineWidth = 0.14; g.strokeStyle = accent;
  g.beginPath(); g.arc(0, -0.34, 0.2, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = ink;
  g.beginPath(); g.arc(-0.66, 0.1, 0.3, 0.55 * Math.PI, 1.45 * Math.PI); g.stroke();
  g.beginPath(); g.arc(0.66, 0.1, 0.3, -0.45 * Math.PI, 0.45 * Math.PI); g.stroke();
}

function georgsKreuz(g: CanvasRenderingContext2D, p: Pal) {
  g.save();
  g.beginPath(); g.moveTo(-0.7, -0.78); g.lineTo(0.7, -0.78); g.lineTo(0.7, 0.1); g.quadraticCurveTo(0.66, 0.62, 0, 0.94); g.quadraticCurveTo(-0.66, 0.62, -0.7, 0.1); g.closePath();
  g.fillStyle = p.light; g.fill(); g.clip();
  g.fillStyle = p.secondary; g.fillRect(-0.7, -0.78, 0.44, 0.44);
  g.fillStyle = p.primary; g.fillRect(-0.16, -0.78, 0.32, 1.8); g.fillRect(-0.7, -0.3, 1.4, 0.32);
  g.restore();
  g.beginPath(); g.moveTo(-0.7, -0.78); g.lineTo(0.7, -0.78); g.lineTo(0.7, 0.1); g.quadraticCurveTo(0.66, 0.62, 0, 0.94); g.quadraticCurveTo(-0.66, 0.62, -0.7, 0.1); g.closePath();
  g.strokeStyle = p.accent; g.lineWidth = 0.1; g.stroke();
}

/** Wappen in einen Kreis um (cx, cy) mit Radius r malen (Farben je Macht) */
export function drawEmblem(g: CanvasRenderingContext2D, id: EmblemId, cx: number, cy: number, r: number, p: Pal) {
  g.save();
  g.translate(cx, cy); g.scale(r, r);
  switch (id) {
    case 'georgskreuz': georgsKreuz(g, p); break;
    case 'voc': vocMark(g, p.accent, p.primary); break;
    case 'adler': eagle(g, p.secondary, p.accent); break;
    case 'lilie': lily(g, p.accent); break;
    case 'klinge': onaMask(g, p.secondary, p.primary); break;
    case 'anker': anchorGull(g, p.secondary, p.accent); break;
  }
  g.restore();
}

/** Lilien im Rautenmuster (Segel, Flagge, Banner) */
function lilyDiaper(g: CanvasRenderingContext2D, w: number, h: number, col: string, step: number, size: number) {
  let row = 0;
  for (let y = step * 0.6; y < h + step; y += step * 0.9, row++) {
    for (let x = (row % 2 ? step * 0.5 : 0) + step * 0.2; x < w + step; x += step) {
      g.save(); g.translate(x, y); g.scale(size, size); lily(g, col); g.restore();
    }
  }
}

// ---------- Segel (512 × 384 logisch) ----------

const SAIL: Record<FactionId, SailHeraldry> = {
  england: {
    pattern: (g, w, h) => {
      const p = pal('england');
      // St.-Georgs-Kreuz über das ganze Tuch, weiß gesäumt: schon aus weiter Ferne zu sehen
      g.fillStyle = p.light; g.fillRect(w / 2 - 38, 0, 76, h); g.fillRect(0, h * 0.5 - 38, w, 76);
      g.fillStyle = p.primary; g.fillRect(w / 2 - 26, 0, 52, h); g.fillRect(0, h * 0.5 - 26, w, 52);
      g.fillStyle = p.secondary; g.fillRect(8, 8, 150, 100);
      g.strokeStyle = p.light; g.lineWidth = 16; g.beginPath(); g.moveTo(8, 8); g.lineTo(158, 108); g.moveTo(158, 8); g.lineTo(8, 108); g.stroke();
      g.strokeStyle = p.primary; g.lineWidth = 7; g.beginPath(); g.moveTo(8, 8); g.lineTo(158, 108); g.moveTo(158, 8); g.lineTo(8, 108); g.stroke();
    },
    emblem: (g, w, h) => { const p = pal('england'); g.fillStyle = p.light; g.beginPath(); g.arc(w / 2, h * 0.55, 92, 0, Math.PI * 2); g.fill(); drawEmblem(g, 'georgskreuz', w / 2, h * 0.55 + 4, 74, p); },
  },
  niederlande: {
    pattern: (g, w, h) => {
      const p = pal('niederlande');
      g.fillStyle = p.primary; g.fillRect(0, 0, w, h * 0.34);
      g.fillStyle = p.light; g.fillRect(0, h * 0.34, w, h * 0.32);
      g.fillStyle = p.accent; g.fillRect(0, h * 0.66, w, h * 0.34);
    },
    emblem: (g, w, h) => { const p = pal('niederlande'); g.fillStyle = p.light; g.beginPath(); g.arc(w / 2, h * 0.5, 84, 0, Math.PI * 2); g.fill(); drawEmblem(g, 'voc', w / 2, h * 0.5 + 4, 66, p); },
  },
  deutschland: {
    pattern: (g, w, h) => {
      const p = pal('deutschland');
      // senkrechte schwarz-weiße Bahnen über das ganze Tuch
      const n = 8, bw = w / n;
      for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? p.light : p.secondary; g.fillRect(i * bw, 0, bw + 1, h); }
    },
    emblem: (g, w, h) => { const p = pal('deutschland'); g.fillStyle = p.light; g.beginPath(); g.arc(w / 2, h * 0.55, 96, 0, Math.PI * 2); g.fill(); g.strokeStyle = p.accent; g.lineWidth = 9; g.stroke(); drawEmblem(g, 'adler', w / 2, h * 0.55 + 2, 78, p); },
  },
  frankreich: {
    pattern: (g, w, h) => {
      const p = pal('frankreich');
      g.fillStyle = p.primary; g.fillRect(0, 0, w, h);
      lilyDiaper(g, w, h, p.accent, 92, 24);
    },
    emblem: (g, w, h) => { const p = pal('frankreich'); g.fillStyle = p.primary; g.beginPath(); g.arc(w / 2, h * 0.55, 98, 0, Math.PI * 2); g.fill(); g.strokeStyle = p.light; g.lineWidth = 10; g.stroke(); drawEmblem(g, 'lilie', w / 2, h * 0.55, 72, p); },
  },
  kurogane: {
    pattern: (g, w, h) => {
      const p = pal('kurogane');
      g.fillStyle = p.secondary; g.fillRect(0, 0, w, h);
      // zwei schwarze Klingenhiebe quer über das Tuch und ein dunkler Saum
      g.fillStyle = p.primary;
      g.beginPath(); g.moveTo(0, h * 0.12); g.lineTo(w, h * 0.46); g.lineTo(w, h * 0.54); g.lineTo(0, h * 0.2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0, h * 0.62); g.lineTo(w, h * 0.9); g.lineTo(w, h * 0.96); g.lineTo(0, h * 0.7); g.closePath(); g.fill();
      g.fillRect(0, 0, w, 14); g.fillRect(0, h - 22, w, 22);
    },
    emblem: (g, w, h) => { const p = pal('kurogane'); g.fillStyle = p.primary; g.beginPath(); g.arc(w / 2, h * 0.55, 98, 0, Math.PI * 2); g.fill(); drawEmblem(g, 'klinge', w / 2, h * 0.55 + 4, 82, { ...p, secondary: p.secondary }); },
  },
  marine: {
    pattern: (g, w, h) => {
      const p = pal('marine');
      g.fillStyle = p.secondary; g.fillRect(0, h * 0.06, w, h * 0.13); g.fillRect(0, h * 0.8, w, h * 0.13);
      g.fillStyle = p.accent; g.fillRect(0, h * 0.2, w, 6); g.fillRect(0, h * 0.78, w, 6);
    },
    emblem: (g, w, h) => { const p = pal('marine'); g.fillStyle = p.light; g.beginPath(); g.arc(w / 2, h * 0.52, 92, 0, Math.PI * 2); g.fill(); drawEmblem(g, 'anker', w / 2, h * 0.52, 74, p); },
  },
};

export const sailHeraldry = (id: FactionId): SailHeraldry => SAIL[id];

// ---------- Flaggen (256 × 160) und Banner (128 × 256) ----------

const flagCache = new Map<FactionId, CanvasTexture>();
const bannerCache = new Map<FactionId, CanvasTexture>();

function finish(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = texDetail.aniso;
  return markShared(t);
}

function paintFlag(id: FactionId, g: CanvasRenderingContext2D, w: number, h: number) {
  const p = pal(id);
  const cx = w / 2, cy = h / 2, R = h * 0.34;
  switch (id) {
    case 'england': {
      // Union-Flagge: blaues Feld, weißes und rotes Andreaskreuz, weißes und rotes Georgskreuz
      g.fillStyle = p.secondary; g.fillRect(0, 0, w, h);
      g.lineCap = 'butt';
      g.strokeStyle = p.light; g.lineWidth = h * 0.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
      g.strokeStyle = p.primary; g.lineWidth = h * 0.08; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
      g.fillStyle = p.light; g.fillRect(cx - h * 0.17, 0, h * 0.34, h); g.fillRect(0, cy - h * 0.17, w, h * 0.34);
      g.fillStyle = p.primary; g.fillRect(cx - h * 0.1, 0, h * 0.2, h); g.fillRect(0, cy - h * 0.1, w, h * 0.2);
      break;
    }
    case 'niederlande':
      g.fillStyle = p.primary; g.fillRect(0, 0, w, h / 3);
      g.fillStyle = p.light; g.fillRect(0, h / 3, w, h / 3);
      g.fillStyle = p.accent; g.fillRect(0, (h * 2) / 3, w, h / 3);
      drawEmblem(g, 'voc', cx, cy, h * 0.15, p);
      break;
    case 'deutschland':
      g.fillStyle = p.secondary; g.fillRect(0, 0, w, h);
      g.fillStyle = p.light; g.fillRect(0, h * 0.22, w, h * 0.56);
      g.fillStyle = p.accent; g.beginPath(); g.arc(cx, cy, R * 0.98, 0, Math.PI * 2); g.fill();
      g.fillStyle = p.light; g.beginPath(); g.arc(cx, cy, R * 0.86, 0, Math.PI * 2); g.fill();
      drawEmblem(g, 'adler', cx, cy, R * 0.8, p);
      break;
    case 'frankreich':
      g.fillStyle = p.light; g.fillRect(0, 0, w, h);
      g.fillStyle = p.primary; g.fillRect(0, 0, w * 0.13, h);
      lilyDiaper(g, w, h, p.accent, h * 0.42, h * 0.075);
      g.fillStyle = p.primary; g.fillRect(0, 0, w * 0.13, h);
      drawEmblem(g, 'lilie', cx + w * 0.06, cy, h * 0.3, { ...p, accent: p.primary });
      break;
    case 'kurogane':
      g.fillStyle = p.primary; g.fillRect(0, 0, w, h);
      g.fillStyle = p.secondary; g.beginPath(); g.moveTo(0, h * 0.78); g.lineTo(w, h * 0.12); g.lineTo(w, h * 0.3); g.lineTo(0, h * 0.96); g.closePath(); g.fill();
      drawEmblem(g, 'klinge', cx, cy, h * 0.4, { ...p, primary: p.primary, secondary: p.secondary });
      break;
    case 'marine':
      g.fillStyle = p.light; g.fillRect(0, 0, w, h);
      g.fillStyle = p.secondary; g.fillRect(0, 0, w, h * 0.16); g.fillRect(0, h * 0.84, w, h * 0.16);
      g.fillStyle = p.accent; g.fillRect(0, h * 0.16, w, 3); g.fillRect(0, h * 0.84 - 3, w, 3);
      drawEmblem(g, 'anker', cx, cy, h * 0.33, p);
      break;
  }
  // Saum, damit die Fläche auch im Wind eine Kante hat
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
}

/** Flaggenbild der Macht in beliebiger Auflösung (Maße w × h im Verhältnis 8 : 5), zum Übermalen für Tuchflaggen (`render/flagCloth.ts`) */
export const paintFactionFlag = paintFlag;

/** Flagge der Macht (Schiffsfahne, Wimpel): geteilt, nie freigeben */
export function factionFlagTexture(id: FactionId): CanvasTexture {
  let t = flagCache.get(id);
  if (!t) {
    const { c, g } = detailCanvas(256, 160);
    paintFlag(id, g, 256, 160);
    t = finish(c);
    flagCache.set(id, t);
  }
  return t;
}

/** Hochformat-Banner für Festungen und Inseln (Fahnentuch am Mast): Flaggenmotiv, hochgestellt und mit Spitzen am unteren Rand */
export function factionBannerTexture(id: FactionId): CanvasTexture {
  let t = bannerCache.get(id);
  if (!t) {
    const { c, g } = detailCanvas(128, 256);
    const p = pal(id);
    // Grundfarbe und Streifen der Macht, darunter das Wappen
    const base: Record<FactionId, string> = { england: p.primary, niederlande: p.primary, deutschland: p.secondary, frankreich: p.primary, kurogane: p.primary, marine: p.light };
    g.fillStyle = base[id]; g.fillRect(0, 0, 128, 256);
    if (id === 'niederlande') { g.fillStyle = p.light; g.fillRect(0, 86, 128, 84); g.fillStyle = p.accent; g.fillRect(0, 170, 128, 86); }
    if (id === 'england') { g.fillStyle = p.secondary; g.fillRect(0, 0, 128, 40); g.fillStyle = p.light; g.fillRect(56, 40, 16, 216); }
    if (id === 'deutschland') { g.fillStyle = p.light; g.fillRect(0, 70, 128, 120); }
    if (id === 'frankreich') lilyDiaper(g, 128, 256, p.accent, 52, 13);
    if (id === 'kurogane') { g.fillStyle = p.secondary; g.beginPath(); g.moveTo(0, 256); g.lineTo(0, 190); g.lineTo(128, 80); g.lineTo(128, 150); g.closePath(); g.fill(); }
    if (id === 'marine') { g.fillStyle = p.secondary; g.fillRect(0, 0, 128, 34); g.fillRect(0, 222, 128, 34); }
    if (id === 'frankreich') { g.fillStyle = p.primary; g.beginPath(); g.arc(64, 118, 46, 0, Math.PI * 2); g.fill(); }
    if (id === 'england') { g.fillStyle = p.light; g.beginPath(); g.arc(64, 140, 44, 0, Math.PI * 2); g.fill(); }
    const em = { england: 'georgskreuz', niederlande: 'voc', deutschland: 'adler', frankreich: 'lilie', kurogane: 'klinge', marine: 'anker' } as const;
    drawEmblem(g, em[id], 64, id === 'england' ? 142 : 124, 40, p);
    // Saum und goldener Rand
    g.strokeStyle = id === 'niederlande' ? '#D4AC42' : p.accent; g.lineWidth = 5; g.strokeRect(2.5, 2.5, 123, 251);
    t = finish(c);
    bannerCache.set(id, t);
  }
  return t;
}
