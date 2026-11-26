// Phase 4.7C – der Klassenbaum als Sternbild: Lage der 60 Knoten (aufsteigender Klassen-Pfad mit kurzen Seitenzweigen zwischen den Meilensteinen),
// Verbindungen, Rang-Zähler der Stärkungen, römische Form-Nummern und die Vektor-Grafik (Edelstein-Sockel, Rauten-Medaillons, gekröntes
// Apex-Wappen, Stat-Symbole, Form-Embleme, Wasserzeichen je Klasse). Reine Rechnung und SVG-Text ohne DOM und ohne three.js: keine neuen
// Shader, nichts zur Laufzeit je Bild – das Fenster zeichnet sich nur bei einer Eingabe neu.
import type { ActionSkill } from '../data/actionStyles';
import { FORM_NODES, TREE_SIZE, ULT_NODE, type BuffKind, type ClassNode, type SpecId } from '../data/classes';

// ---------- Lage ----------

/** Zeichenfläche des Baums (Einheiten der viewBox) */
export const TREE_W = 720;
/** Höhe eines Abschnitts zwischen zwei Meilensteinen und Ränder oben/unten */
export const SEG_H = 150;
const BOTTOM = 70;
const TOP = 116;
export const TREE_H = BOTTOM + SEG_H * 10 + TOP;

/** Größen der Knoten (Durchmesser in viewBox-Einheiten = Pixel bei 720 Breite): Sockel, Medaillon (Diagonale), Apex-Wappen */
export const NODE_SIZE = { buff: 32, form: 58, ult: 76 } as const;

export interface GraphNode { n: number; x: number; y: number; kind: ClassNode['kind'] }
export interface GraphEdge { a: number; b: number }

/** Mittellinie des Pfads: windet sich leicht nach links und rechts, je Meilenstein eine Höhe */
const spineX = (i: number) => TREE_W / 2 + Math.sin(i * 1.15 + 0.4) * 58;
const spineY = (i: number) => TREE_H - BOTTOM - i * SEG_H;
/** Ausschlag der Seitenzweige (m der viewBox) */
const BRANCH_W = 140;

let LAYOUT: { nodes: GraphNode[]; edges: GraphEdge[] } | null = null;

/**
 * Lage aller 60 Knoten (Index 0 = Knoten 1). Meilensteine (Formen) liegen auf der Mittellinie; die Stärkungen dazwischen bilden einen Seitenzweig,
 * der abwechselnd links und rechts ausschwingt und zum nächsten Meilenstein zurückführt. Knoten 60 krönt den Baum oben in der Mitte.
 */
export function treeLayout(): { nodes: readonly GraphNode[]; edges: readonly GraphEdge[] } {
  if (LAYOUT) return LAYOUT;
  const nodes: GraphNode[] = [];
  const milestones = [...FORM_NODES, ULT_NODE];
  for (let i = 0; i < milestones.length; i++) {
    const a = milestones[i];
    const ax = i === milestones.length - 1 ? TREE_W / 2 : spineX(i), ay = spineY(i);
    nodes[a - 1] = { n: a, x: ax, y: ay, kind: i === milestones.length - 1 ? 'ult' : 'form' };
    if (i === milestones.length - 1) break;
    const b = milestones[i + 1];
    const bx = i + 1 === milestones.length - 1 ? TREE_W / 2 : spineX(i + 1), by = spineY(i + 1);
    const cnt = b - a - 1;
    const side = i % 2 ? 1 : -1;
    // Seitenzweig als Sternbild-Bogen: halbe Ellipse vom Meilenstein hinaus zur Seite und zurück zum nächsten (gleichmäßige Abstände)
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const at = (ph: number, o: { x: number; y: number }) => { o.x = mx + (ax - mx) * Math.cos(ph) + side * BRANCH_W * Math.sin(ph); o.y = my + (ay - my) * Math.cos(ph); return o; };
    // gleiche Abstände entlang des Bogens (Bogenlänge statt Winkel): kein Knoten drängt sich an seinen Nachbarn
    const K = 96, len: number[] = [0], p = { x: 0, y: 0 }, q = { x: ax, y: ay };
    for (let k = 1; k <= K; k++) { at((Math.PI * k) / K, p); len.push(len[k - 1] + Math.hypot(p.x - q.x, p.y - q.y)); q.x = p.x; q.y = p.y; }
    for (let j = 1; j <= cnt; j++) {
      const want = (len[K] * j) / (cnt + 1);
      let k = 1;
      while (k < K && len[k] < want) k++;
      const ph = (Math.PI * (k - 1 + (want - len[k - 1]) / Math.max(1e-6, len[k] - len[k - 1]))) / K;
      at(ph, p);
      nodes[a + j - 1] = { n: a + j, x: Math.max(28, Math.min(TREE_W - 28, p.x)), y: p.y, kind: 'buff' };
    }
  }
  const edges: GraphEdge[] = [];
  for (let n = 1; n < TREE_SIZE; n++) edges.push({ a: n, b: n + 1 });
  LAYOUT = { nodes, edges };
  return LAYOUT;
}

/** Römische Zahl der Form I … X */
export const roman = (n: number): string => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);

/** Rang-Zähler einer Stärkung: der wievielte Knoten dieser Art im Baum (k) von allen dieser Art (n) – „3/7“ */
export function buffRanks(tree: readonly ClassNode[]): { k: number; n: number }[] {
  const count: Partial<Record<BuffKind, number>> = {};
  for (const t of tree) if (t.buff) count[t.buff] = (count[t.buff] ?? 0) + 1;
  const seen: Partial<Record<BuffKind, number>> = {};
  return tree.map((t) => {
    if (!t.buff) return { k: 0, n: 0 };
    seen[t.buff] = (seen[t.buff] ?? 0) + 1;
    return { k: seen[t.buff]!, n: count[t.buff]! };
  });
}

// ---------- Vektor-Symbole ----------

/** Stat-Symbole (40er-Raster um 0,0) */
const STAT: Record<BuffKind, string> = {
  crit: '<path d="M0-11 L3-3 L11 0 L3 3 L0 11 L-3 3 L-11 0 L-3-3Z"/>',
  critDmg: '<path d="M-3-10 L-1-3 L5-1 L-1 1 L-3 8 L-5 1 L-11-1 L-5-3Z"/><path d="M7 2 L8.4 6 L12 7 L8.4 8 L7 12 L5.6 8 L2 7 L5.6 6Z"/>',
  hp: '<path d="M0 10 C-12 2 -11-9 -4.5-9 C-2-9 -0.6-7.5 0-6 C0.6-7.5 2-9 4.5-9 C11-9 12 2 0 10Z"/>',
  atk: '<path d="M-9 9 L6-6 L9-9 L8-4 L-7 10Z"/><path d="M-10 4 L-4 10" stroke-width="2.6" stroke-linecap="round" fill="none"/>',
  tempo: '<path d="M-10-8 L-2 0 L-10 8 M0-8 L8 0 L0 8" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  cd: '<path d="M-7-10 H7 L1 0 L7 10 H-7 L-1 0Z" fill="none" stroke-width="2.2" stroke-linejoin="round"/><path d="M-3 7 H3 L0 3Z"/>',
  armor: '<path d="M0-11 L9-7 V0 C9 6 4 9.5 0 11 C-4 9.5-9 6-9 0 V-7Z"/>',
  heal: '<path d="M-3-10 H3 V-3 H10 V3 H3 V10 H-3 V3 H-10 V-3 H-3Z"/>',
  regen: '<path d="M8-2 A8 8 0 1 1 3-7.5" fill="none" stroke-width="2.6" stroke-linecap="round"/><path d="M1-12 L8-8 L1-3Z"/>',
};

/** Motive der Form-Embleme je Klassenfamilie (40er-Raster) */
const MOTIF: Record<string, string> = {
  blade: '<path d="M-13 13 L9-9 L13-13 L11-7 L-10 13Z"/><path d="M-12 6 L-6 12" stroke-width="3" stroke-linecap="round" fill="none"/><circle cx="-13.5" cy="13.5" r="2.2"/>',
  twin: '<path d="M-13 11 L7-9 L11-12 L9-6 L-11 13Z"/><path d="M13 11 L-7-9 L-11-12 L-9-6 L11 13Z"/>',
  fist: '<path d="M-9-6 H9 V5 A7 7 0 0 1 2 12 H-3 A7 7 0 0 1-10 5 V-2Z"/><path d="M-4.5-6 V1 M0-6 V1 M4.5-6 V1" stroke-width="1.6" fill="none"/>',
  feuer: '<path d="M0-15 C7-6 11-1 9 6 C7 12-7 12-9 6 C-11 0-4-3 0-15Z"/><path d="M0-3 C3 1 4 4 2 7 C0 9-3 8-3 5 C-3 2-1 1 0-3Z" class="em-hi"/>',
  eis: '<path d="M0-14 V14 M-12-7 L12 7 M-12 7 L12-7" stroke-width="2.6" stroke-linecap="round" fill="none"/><path d="M0-14 L-3-10 M0-14 L3-10 M0 14 L-3 10 M0 14 L3 10" stroke-width="1.8" fill="none"/><circle r="3.5"/>',
  wasser: '<path d="M-14 0 C-9-6-5-6 0 0 C5 6 9 6 14 0" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M-14 7 C-9 1-5 1 0 7 C5 13 9 13 14 7" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M0-15 C5-9 6-6 0-3 C-6-6-5-9 0-15Z"/>',
  wind: '<path d="M-13-4 H6 A5 5 0 1 0 1-9" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M-13 3 H10 A5 5 0 1 1 5 8" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M-9 10 H2" stroke-width="2.2" stroke-linecap="round" fill="none"/>',
  blitz: '<path d="M3-15 L-7 2 H0 L-4 15 L8-3 H1Z"/>',
  sonne: '<circle r="6.5"/><path d="M0-15 V-10 M0 10 V15 M-15 0 H-10 M10 0 H15 M-10.6-10.6 L-7-7 M7 7 L10.6 10.6 M-10.6 10.6 L-7 7 M7-7 L10.6-10.6" stroke-width="2.4" stroke-linecap="round" fill="none"/>',
  mond: '<path d="M5-13 A13 13 0 1 0 5 13 A10 10 0 1 1 5-13Z"/><circle cx="9" cy="-8" r="1.4"/><circle cx="11" cy="3" r="1"/>',
  schwarzloch: '<circle r="5.5"/><path d="M0-12 A12 12 0 0 1 12 0 M0 12 A12 12 0 0 1-12 0" stroke-width="2.4" fill="none" stroke-linecap="round"/><ellipse rx="14" ry="4.5" fill="none" stroke-width="1.6" transform="rotate(-20)"/>',
  holy: '<circle r="11" fill="none" stroke-width="1.8"/><path d="M-2.4-14 H2.4 V-4 H10 V0.6 H2.4 V14 H-2.4 V0.6 H-10 V-4 H-2.4Z"/>',
  faji: '<path d="M0-14 L4-4 L14 0 L4 4 L0 14 L-4 4 L-14 0 L-4-4Z"/><circle r="3"/>',
};

/** Kleines Muster-Abzeichen (unten rechts im Medaillon): Vorstoß, Heber, Konter, Wirbel, Welle, Geschoss, Einschlag, Heilung */
const PATTERN: Record<string, string> = {
  dash: '<path d="M-6-4 L-1 0 L-6 4 M0-4 L5 0 L0 4" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  rise: '<path d="M0-6 L5 0 H2 V6 H-2 V0 H-5Z"/>',
  counter: '<path d="M0-6 L5-3 V1 C5 4 2 5.5 0 6.5 C-2 5.5-5 4-5 1 V-3Z"/>',
  spin: '<path d="M5 0 A5 5 0 1 1 2-4.6" fill="none" stroke-width="1.8" stroke-linecap="round"/><path d="M1-7 L5-4.5 L1-2Z"/>',
  wave: '<path d="M-6 2 C-3-3 0-3 3 2 M-6 6 C-3 1 0 1 3 6" fill="none" stroke-width="1.6" stroke-linecap="round"/>',
  shot: '<circle cx="3" cy="0" r="2.6"/><path d="M-7 0 H0" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
  impact: '<path d="M0-6 L1.5-1.5 L6 0 L1.5 1.5 L0 6 L-1.5 1.5 L-6 0 L-1.5-1.5Z"/>',
  heal: '<path d="M-1.5-6 H1.5 V-1.5 H6 V1.5 H1.5 V6 H-1.5 V1.5 H-6 V-1.5 H-1.5Z"/>',
};

/** Familie des Emblems zu einer Spezialisierung */
export function motifOf(spec: SpecId): string {
  switch (spec) {
    case 'schnell': case 'kraeftig': return 'fist';
    case 'doppel': return 'twin';
    case 'saebel': case 'langschwert': case 'grossschwert': return 'blade';
    case 'priester': return 'holy';
    default: return spec;
  }
}

/** Muster einer Form (für Abzeichen und animierte Vorschau) */
export function patternOf(sk: ActionSkill): string {
  if (sk.heal) return 'heal';
  if (sk.dashTo > 0) return 'dash';
  if (sk.rise > 0) return 'rise';
  if (sk.counter > 0) return 'counter';
  if (sk.hits.some((h) => h.projectile)) return 'shot';
  if (sk.hits.some((h) => h.shape === 'line')) return 'wave';
  if (sk.hits.length >= 3) return 'spin';
  return 'impact';
}

/** Form-Emblem: Motiv der Klasse in Farbverlauf, Muster-Abzeichen, gerahmt (für Medaillon und Detail) */
export function emblemSvg(spec: SpecId, pattern: string, gid: string): string {
  return `<g class="em-motif" fill="url(#${gid})" stroke="url(#${gid})">${MOTIF[motifOf(spec)] ?? MOTIF.faji}</g>`
    + `<g class="em-badge" transform="translate(11 11)"><circle r="7.5"/><g class="em-pat">${PATTERN[pattern] ?? PATTERN.impact}</g></g>`;
}

/** Stat-Symbol einer Stärkung */
export const statSvg = (k: BuffKind): string => `<g class="st-ic">${STAT[k]}</g>`;

/** Sechseck (Edelstein-Sockel) mit Radius r */
export function hexPoints(r: number): string {
  const p: string[] = [];
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; p.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`); }
  return p.join(' ');
}

// ---------- Wasserzeichen je Klasse ----------

const rays = (n: number, r0: number, r1: number, w = 2) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return `<path d="M${(Math.cos(a) * r0).toFixed(1)} ${(Math.sin(a) * r0).toFixed(1)} L${(Math.cos(a) * r1).toFixed(1)} ${(Math.sin(a) * r1).toFixed(1)}" stroke-width="${w}"/>`; }).join('');
const ring = (r: number, w = 2, dash = '') => `<circle r="${r}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const petals = (n: number, r: number, len: number) => Array.from({ length: n }, (_, i) => `<ellipse cx="0" cy="${-r}" rx="${(len * 0.32).toFixed(1)}" ry="${len}" transform="rotate(${((i / n) * 360).toFixed(1)})"/>`).join('');
const compass = (r: number) => `<path d="M0-${r} L${r * 0.12}-${r * 0.12} L${r} 0 L${r * 0.12} ${r * 0.12} L0 ${r} L-${r * 0.12} ${r * 0.12} L-${r} 0 L-${r * 0.12}-${r * 0.12}Z" stroke-width="2"/>${ring(r * 0.55, 1.5)}${ring(r * 1.05, 1, '4 6')}`;
const saber = (rot: number, L: number) => `<g transform="rotate(${rot})"><path d="M0 ${L * 0.5} C${L * 0.06} ${L * 0.1} ${L * 0.05}-${L * 0.3} -${L * 0.02}-${L * 0.5}" stroke-width="7" stroke-linecap="round"/><path d="M-${L * 0.09} ${L * 0.34} Q0 ${L * 0.42} ${L * 0.09} ${L * 0.34}" stroke-width="4"/></g>`;
const shield = (x: number, s: number) => `<g transform="translate(${x} 0) scale(${s})"><path d="M0-60 L50-40 V5 C50 40 20 58 0 66 C-20 58-50 40-50 5 V-40Z" stroke-width="3"/><path d="M0-48 V54 M-38-6 H38" stroke-width="2"/>${[-30, 30].map((cx) => [-28, 22].map((cy) => `<circle cx="${cx}" cy="${cy}" r="3"/>`).join('')).join('')}</g>`;
const spiral = (turns: number, r: number) => { let d = ''; const n = 90; for (let i = 0; i <= n; i++) { const t = i / n, a = t * turns * Math.PI * 2, rr = r * t; d += `${i ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(1)} ${(Math.sin(a) * rr).toFixed(1)}`; } return `<path d="${d}" stroke-width="2.4"/>`; };

/** Dezente Hintergrund-Illustration der Klasse (Linienzeichnung, Mittelpunkt 0,0, etwa ±200) */
export function watermarkSvg(spec: SpecId | null): string {
  switch (spec) {
    case 'saebel': return `${compass(170)}${saber(-38, 330)}${saber(38, 330)}`;
    case 'doppel': return `${saber(-28, 260)}${saber(28, 260)}${saber(-62, 200)}${saber(62, 200)}${ring(120, 1.5, '2 8')}`;
    case 'langschwert': return `${ring(150, 2)}<path d="M-180 120 C-60 20 60-60 190-150" stroke-width="6" stroke-linecap="round"/><path d="M60 -150 A80 80 0 1 0 140-60 A62 62 0 1 1 60-150Z" stroke-width="2"/>`;
    case 'grossschwert': case 'kraeftig': return `${shield(-80, 1.6)}${shield(80, 1.6)}<path d="M0-200 V200" stroke-width="10" stroke-linecap="round"/><path d="M-50-150 H50" stroke-width="8"/>`;
    case 'schnell': return `${rays(16, 60, 200, 2)}<path d="M-40-60 L20 0 L-30 10 L40 80" stroke-width="8" stroke-linejoin="round"/>${ring(50, 3)}`;
    case 'feuer': return `<path d="M-150 150 C-180 40-60 30-90-60 C-40-20-10-100-40-190 C60-120 140-40 80 40 C130 20 150-20 140-70 C220 40 160 170 40 190 C-40 200-120 190-150 150Z" stroke-width="3"/>${[-60, 0, 60].map((x, i) => `<path d="M${x} ${40 - i * 30} l-14 30 h28z" stroke-width="2"/>`).join('')}${ring(200, 1.5, '3 10')}`;
    case 'eis': return `${rays(6, 0, 190, 5)}${[60, 120].map((r) => Array.from({ length: 6 }, (_, i) => `<path d="M0 ${-r} l-24-24 M0 ${-r} l24-24" stroke-width="3" transform="rotate(${i * 60})"/>`).join('')).join('')}${ring(40, 3)}`;
    case 'wasser': return `${[0, 1, 2, 3].map((k) => `<path d="M-200 ${-90 + k * 60} C-140 ${-140 + k * 60}-80 ${-140 + k * 60}-20 ${-90 + k * 60} S100 ${-40 + k * 60} 200 ${-90 + k * 60}" stroke-width="3"/>`).join('')}${spiral(3, 70)}`;
    case 'wind': return `${spiral(2.5, 180)}<g transform="rotate(180)">${spiral(2.5, 120)}</g>`;
    case 'blitz': return `${ring(185, 2)}${ring(160, 1, '6 8')}<path d="M30-170 L-60 10 L10 10 L-30 170 L80-30 L10-30Z" stroke-width="4" stroke-linejoin="round"/>`;
    case 'sonne': return `${ring(80, 4)}${rays(24, 100, 200, 3)}${ring(130, 1.5, '2 6')}`;
    case 'mond': return `${[-140, -70, 0, 70, 140].map((x, i) => `<circle cx="${x}" cy="${-40 + Math.abs(x) * 0.6}" r="26" stroke-width="2" ${i === 2 ? '' : `stroke-dasharray="${i % 2 ? '40 200' : '80 200'}"`}/>`).join('')}<path d="M60-160 A150 150 0 1 0 60 160 A120 120 0 1 1 60-160Z" stroke-width="3"/>`;
    case 'schwarzloch': return `${ring(40, 6)}${spiral(3.2, 190)}<ellipse rx="200" ry="56" stroke-width="2" transform="rotate(-18)"/><ellipse rx="150" ry="36" stroke-width="1.5" transform="rotate(-18)"/>`;
    case 'priester': return `${ring(190, 3)}${ring(150, 2)}${petals(12, 92, 56)}${petals(12, 40, 30)}${ring(28, 3)}${rays(24, 150, 190, 2)}`;
    default: return `${ring(170, 2)}${petals(8, 80, 60)}`;
  }
}
