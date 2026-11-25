// Zeichner der Weltkarte (Taste M, Phase 4.3D): Meer, Sektoren und Gefahrenringe, Entdeckungs-Nebel, Inseln in drei Stufen (voll, schemenhafter Umriss, unsichtbar),
// Strömungen, Ereignisse, Konvois, Markt-Abzeichen und überlappungsfreie Namen. Ohne neue Objekte je Bild: die Umrechnung liest Modulvariablen
// (kein Abschluss je Bild), Rechtecke der Beschriftung liegen im `LabelPlacer`, Abzeichen-Texte werden einmal gebaut und gemerkt.
import type { IslandDef } from '../data/regions';
import { BORDERS, FACTIONS, SECTORS } from '../data/factions';
import { PLAYABLE_RADIUS, WORLD_RADIUS } from '../data/world';
import { KAISER_SITES, RINGS } from '../data/worldRings';
import { GOOD_BY_ID, profileOf, type GoodId } from '../data/economy';
import { drawPoi, outline, ownerRing, type MapTopo, type ShapeLike, type WorldMapData, type WorldView } from './minimap';
import { LABEL_ZOOM, LabelPlacer, MarkClusters, TextWidths, WAR_CLUSTER_PX, WAR_LABEL_ZOOM, fitScale, labelShown, type LabelRank } from './mapView';
import { isTravelPort } from '../world/fastTravel';

/** Ebenen der Karte, einzeln ein- und ausblendbar */
export interface MapLayers { sectors: boolean; currents: boolean; events: boolean; trade: boolean; war: boolean }
export const MAP_LAYERS: readonly { id: keyof MapLayers; label: string; hint: string }[] = [
  { id: 'sectors', label: 'Sektoren & Gefahrenringe', hint: 'Die fünf Mächte und die vier Meeres-Ringe' },
  { id: 'war', label: 'Krieg & Frontlinien', hint: 'Armadas mit Zielen, Belagerungen, Großschlachten, Bündnisse und eroberte Inseln' },
  { id: 'currents', label: 'Strömungen', hint: 'Elf Windstraßen mit Strömungsrichtung' },
  { id: 'events', label: 'Ereignisse & Konvois', hint: 'Schatz-Galeonen, Blockaden, Wrackfelder, Weltbosse, Handelskonvois' },
  { id: 'trade', label: 'Kontor-Handel', hint: 'Überschuss ▲ und Bedarf ▼ entdeckter Häfen' },
];
export const defaultLayers = (): MapLayers => ({ sectors: true, currents: true, events: true, trade: true, war: true });

export interface MapDrawState {
  selected: string | null;
  layers: MapLayers;
  /** Zweite Zeichenfläche gleicher Größe für den Nebel (die Karte legt sie einmal an und gibt sie mit dem Fenster frei) */
  fog: HTMLCanvasElement | null;
  /** Aktueller Zoom relativ zur Gesamtansicht (1× = ganze Welt) */
  zoom: number;
  /** Bedienelemente über der Karte als flache Liste (x0, y0, x1, y1, …) in CSS-Pixeln: dort setzt die Karte keine Namen (4.3.6, neu bei jeder Größenänderung) */
  chrome?: readonly number[];
}

// ---------- Arbeitsvariablen (kein Abschluss je Bild) ----------

let W = 0, H = 0, CX = 0, CZ = 0, S = 1;
const mx = (x: number): number => W / 2 - (x - CX) * S;
const my = (z: number): number => H / 2 - (z - CZ) * S;

// genug Platz für alle Namen der 156 Inseln, Ereignisse, Abzeichen und Bedienelemente (4.5C: 105+ Hauptinseln)
const placer = new LabelPlacer(720);
const widths = new TextWidths();
/** Kampf-Symbole (4.5B): Bildschirmlage und Art je Marke (0 Belagerung, 1 Großschlacht, 2 Grenz-Seeschlacht), feste Felder */
const WAR_MAX = 48;
const warX = new Float32Array(WAR_MAX), warY = new Float32Array(WAR_MAX), warKind = new Uint8Array(WAR_MAX);
const clusters = new MarkClusters(WAR_MAX);
const COUNT_TEXT: string[] = [];
const countText = (n: number): string => (COUNT_TEXT[n] ??= `×${n}`);
const FONT_NAME = '700 12px "Alegreya Sans", sans-serif';
const FONT_BIG = '800 13px "Alegreya Sans", sans-serif';
const FONT_BADGE = '700 11px "Alegreya Sans", sans-serif';
const FONT_EVENT = '800 12px "Alegreya Sans", sans-serif';
const FONT_MEGA = '900 15px "Alegreya", serif';
/** Zweiter und dritter Fels einer Riff-Passage (einmal angelegt, nicht je Bild) */
const REEF_TAIL = / I{2,3}$/;
/** Namen der Mächte und ihre Schriften je ganzzahliger Größe (einmal angelegt: kein neuer Text je Bild) */
const SECTOR_NAME = SECTORS.map((s) => FACTIONS[s.factionId].name.toUpperCase());
const SECTOR_FONT: string[] = [];
const sectorFont = (px: number): string => (SECTOR_FONT[px] ??= `900 ${px}px "Alegreya", serif`);
/** Bezugsschrift zum Messen (die Breite skaliert linear mit der Größe; so wächst der Breitenspeicher nicht mit jedem Zoom) */
const SECTOR_REF = 34;
const FONT_REF_SECTOR = sectorFont(SECTOR_REF);
/** Stellen für die Machtnamen (Winkel neben der Mittellinie in Grad, Anteil am Weltradius): die erste freie gewinnt. Auf der Mittellinie liegen die
 *  Mega-Inseln, deren Namen frei bleiben sollen (4.3.6) */
const SECTOR_TRY: readonly (readonly [number, number])[] = [[18, 0.74], [-18, 0.74], [0, 0.88], [24, 0.6], [-24, 0.6], [28, 0.86], [-28, 0.86], [0, 0.5]];

/** Liegt das Rechteck frei: im Bild, nicht unter Bedienelementen und nicht über einem Wahrzeichen (Mega-Insel, Festung) samt Namen? */
function sectorSpotFree(ctx: CanvasRenderingContext2D, d: WorldMapData, x0: number, y0: number, x1: number, y1: number): boolean {
  if (x0 < 10 || y0 < 10 || x1 > W - 10 || y1 > H - 10) return false;
  if (!placer.free(x0, y0, x1, y1, 4)) return false;
  for (let k = 0; k < d.islands.length; k++) {
    const i = d.islands[k];
    const fort = i.kind === 'marinefort' || i.kind === 'citadel';
    if (!i.mega && !fort) continue;
    const font = i.mega ? FONT_MEGA : FONT_BIG;
    ctx.font = font;
    const lw = widths.get(ctx, font, i.name) / 2;
    const sx = mx(i.x), sy = my(i.z), rr = Math.max(10, i.r * S * (fort ? 1.9 : 1.3));
    const hw = Math.max(lw, rr) + 6;
    if (x0 < sx + hw && x1 > sx - hw && y0 < sy + rr + 6 && y1 > sy - rr - (fort ? 50 : 30)) return false;
  }
  return true;
}

/** Rang der Beschriftung: Städte, Festungen und das Hauptquartier immer, Häfen, Bosse und Leuchttürme ab 1,15×, der Rest ebenso */
export function labelRank(i: Pick<IslandDef, 'kind' | 'marine' | 'mega' | 'skerry'>): LabelRank {
  // Mega-Inseln (4.3.6) sind die Haupt-Orientierungspunkte: immer beschriftet; Schären nur nah herangezoomt
  if (i.mega || i.kind === 'town' || i.kind === 'citadel' || i.kind === 'marinefort' || i.marine === 'hq') return 3;
  if (i.skerry) return 1;
  if (i.kind === 'harbor' || i.kind === 'boss' || i.kind === 'lighthouse') return 2;
  return 1;
}

let sortedFor: readonly IslandDef[] | null = null;
let sorted: IslandDef[] = [];
/** Inseln nach Rang (hoch zuerst), neu nur, wenn sich die Liste ändert */
function byRank(list: readonly IslandDef[]): IslandDef[] {
  if (sortedFor === list) return sorted;
  sortedFor = list;
  sorted = list.slice().sort((a, b) => labelRank(b) - labelRank(a) || b.r - a.r);
  return sorted;
}

const badgeCache = new Map<string, string>();
const ICON: Partial<Record<GoodId, string>> = {};
const icon = (g: GoodId): string => ICON[g] ?? (ICON[g] = GOOD_BY_ID[g]?.icon ?? '·');
/** Abzeichen eines Hafens: ▲ Überschuss, ▼ Bedarf (je höchstens zwei Waren); einmal gebaut */
function badgeOf(i: IslandDef): string {
  let t = badgeCache.get(i.id);
  if (t !== undefined) return t;
  const p = profileOf(i);
  t = [p.produce.length ? '▲' + p.produce.slice(0, 2).map(icon).join('') : '', p.demand.length ? '▼' + p.demand.slice(0, 2).map(icon).join('') : ''].filter(Boolean).join(' ');
  badgeCache.set(i.id, t);
  return t;
}

let bgKey = '';
let bgGrad: CanvasGradient | null = null;

const RING_TINT = ['rgba(120,200,150,0.07)', 'rgba(230,200,110,0.07)', 'rgba(230,140,80,0.09)', 'rgba(200,70,70,0.11)', 'rgba(150,100,220,0.12)'] as const;
const RING_EDGE = ['rgba(150,220,170,0.5)', 'rgba(240,215,130,0.5)', 'rgba(240,160,100,0.55)', 'rgba(225,100,100,0.6)', 'rgba(200,160,255,0.65)'] as const;
const STORM_SEA = 'rgba(70,80,120,0.28)';
const RING_LABEL = RINGS.map((r) => `Ring ${r.ring} · ${r.name}`);

function drawOutlineIsland(ctx: CanvasRenderingContext2D, i: IslandDef, shape: ShapeLike | undefined) {
  // Seekarten-Umriss eines Pergament-Blatts: gut erkennbare Küste mit Schraffur-Saum, keine Farben, keine Ringe, keine Namen
  ctx.fillStyle = i.mega ? 'rgba(226,206,160,0.3)' : 'rgba(226,206,160,0.22)';
  outline(ctx, mx, my, S, i, shape, 1); ctx.fill();
  ctx.strokeStyle = 'rgba(244,228,186,0.85)'; ctx.lineWidth = i.mega ? 1.8 : 1.3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(244,228,186,0.28)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
  outline(ctx, mx, my, S, i, shape, 1.22); ctx.stroke(); ctx.setLineDash([]);
}

const RIFT_COLOR: Record<MapTopo['rifts'][number]['kind'], string> = { kanal: '#3E86B4', sund: '#2E6F95', kluft: '#3A3530', lava: '#FF6A2A' };

/** Plastische Topografie bekannter Inseln: Höhenlinien der Hügel, Spalten (Kanal, Lava, Kluft, Meeresarm) mit Brücken, Stege und Hafenbuchten */
function drawTopo(ctx: CanvasRenderingContext2D, i: IslandDef, t: MapTopo) {
  const cx = mx(i.x), cy = my(i.z);
  // Höhenlinien: je Hügel bis zu vier Ringe, höhere Hügel mehr Linien (erst ab genug Maßstab sinnvoll)
  if (S > 0.03) {
    ctx.strokeStyle = 'rgba(110,80,44,0.42)'; ctx.lineWidth = 1;
    for (let k = 0; k < t.hills.length; k++) {
      const h = t.hills[k], hx = cx - h.x * S, hy = cy - h.z * S;
      const lines = Math.min(4, 1 + Math.floor(h.r * h.h / 9));
      for (let n = 1; n <= lines; n++) { const rr = h.r * S * (1 - n / (lines + 1)); if (rr < 1.2) continue; ctx.beginPath(); ctx.arc(hx, hy, rr, 0, Math.PI * 2); ctx.stroke(); }
    }
  }
  // Spalten und Brücken
  for (let k = 0; k < t.rifts.length; k++) {
    const r = t.rifts[k];
    const rw = Math.max(2.6, r.w * S);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let n = 0; n < r.pts.length; n++) { const x = cx - r.pts[n][0] * S, y = cy - r.pts[n][1] * S; if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    // dunkler Rand (Böschung), darauf die Spalte selbst: auch bei kleinem Maßstab gut lesbar
    ctx.strokeStyle = 'rgba(40,26,16,0.7)'; ctx.lineWidth = rw + 2; ctx.stroke();
    ctx.strokeStyle = RIFT_COLOR[r.kind]; ctx.lineWidth = rw; ctx.stroke();
    if (r.kind === 'lava') { ctx.strokeStyle = 'rgba(255,200,120,0.75)'; ctx.lineWidth = Math.max(0.8, r.w * S * 0.35); ctx.stroke(); }
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#F1E4C4'; ctx.lineWidth = Math.max(2, 4.6 * S);
    for (let n = 0; n < r.cross.length; n++) {
      // Brücke: kurzer heller Balken quer über die Spalte
      const [bx, bz] = r.cross[n];
      let dx = 0, dz = 1, best = Infinity;
      for (let m = 1; m < r.pts.length; m++) { const ax = r.pts[m - 1][0], az = r.pts[m - 1][1], ex = r.pts[m][0], ez = r.pts[m][1]; const mx2 = (ax + ex) / 2, mz2 = (az + ez) / 2, dd = (mx2 - bx) * (mx2 - bx) + (mz2 - bz) * (mz2 - bz); if (dd < best) { best = dd; const l = Math.hypot(ex - ax, ez - az) || 1; dx = (ex - ax) / l; dz = (ez - az) / l; } }
      const half = Math.max(4, (r.w * 0.5 + 6) * S);
      const px = cx - bx * S, py = cy - bz * S;
      ctx.beginPath(); ctx.moveTo(px - dz * half, py + dx * half); ctx.lineTo(px + dz * half, py - dx * half); ctx.stroke();
    }
  }
  // Stege: Hafenbuchten mit Anlegern
  if (S > 0.02) {
    ctx.strokeStyle = '#A27A4A'; ctx.lineWidth = Math.max(1.4, 3 * S);
    for (let k = 0; k < t.piers.length; k++) { const p = t.piers[k]; ctx.beginPath(); ctx.moveTo(mx(p.ax), my(p.az)); ctx.lineTo(mx(p.bx), my(p.bz)); ctx.stroke(); }
  }
}

function drawKnownIsland(ctx: CanvasRenderingContext2D, i: IslandDef, shape: ShapeLike | undefined) {
  ctx.fillStyle = 'rgba(94,180,196,0.35)';
  outline(ctx, mx, my, S, i, shape, 1.28); ctx.fill();
  ctx.fillStyle = '#F1D9A0';
  outline(ctx, mx, my, S, i, shape, 1); ctx.fill();
  ctx.fillStyle = KIND_FILL[i.kind] ?? '#6DBB4C';
  outline(ctx, mx, my, S, i, shape, 0.7); ctx.fill();
  ownerRing(ctx, mx, my, S, i);
}
const KIND_FILL: Record<string, string> = { town: '#E3B04B', camp: '#C0503A', boss: '#8A2A3A', quiet: '#5E9450', treasure: '#5E9450', lighthouse: '#E8E2D4', ruin: '#8A8A98', harbor: '#E3B04B', marinefort: '#D8E4F4', citadel: '#8A2A3A' };

/** Kriegs-Beschriftung (4.5B): unter dem Zeichen, sonst darüber */
function label2(ctx: CanvasRenderingContext2D, text: string, x: number, yBelow: number, yAbove: number, fill: string): boolean {
  return label(ctx, FONT_EVENT, text, x, yBelow, fill) || label(ctx, FONT_EVENT, text, x, yAbove, fill);
}

/** Beschriftung setzen, wenn kein anderes Rechteck im Weg liegt; liefert true, wenn gezeichnet */
function label(ctx: CanvasRenderingContext2D, font: string, text: string, x: number, y: number, fill: string, stroke = 'rgba(8,16,28,0.85)'): boolean {
  ctx.font = font;
  const w = widths.get(ctx, font, text);
  if (!placer.tryPlace(x - w / 2, y - 12, x + w / 2, y + 3)) return false;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
  return true;
}

function drawFog(ctx: CanvasRenderingContext2D, fog: HTMLCanvasElement, dpr: number, d: WorldMapData) {
  const f = fog.getContext('2d');
  if (!f) return;
  f.setTransform(dpr, 0, 0, dpr, 0, 0);
  f.globalCompositeOperation = 'source-over';
  f.clearRect(0, 0, W, H);
  f.fillStyle = 'rgba(10,20,30,0.55)';
  f.fillRect(0, 0, W, H);
  f.globalCompositeOperation = 'destination-out';
  f.fillStyle = '#000';
  f.beginPath();
  // Ring 1 und Ankerglück sind von Anfang an kartiert
  f.moveTo(mx(0) - 2400 * S, my(0)); f.arc(mx(0), my(0), 2400 * S, 0, Math.PI * 2);
  const zs = d.chartZones;
  if (zs) for (let k = 0; k < zs.length; k++) { const z = zs[k]; f.moveTo(mx(z.x) - z.r * S, my(z.z)); f.arc(mx(z.x), my(z.z), z.r * S, 0, Math.PI * 2); }
  // jede entdeckte Insel lichtet ihre Umgebung, das eigene Schiff die Wasser unter sich
  for (let k = 0; k < d.islands.length; k++) {
    const i = d.islands[k];
    if (!d.known(i.id)) continue;
    const rr = (i.r * 1.3 + 420) * S;
    f.moveTo(mx(i.x) - rr, my(i.z)); f.arc(mx(i.x), my(i.z), rr, 0, Math.PI * 2);
  }
  const pl = d.markers.player;
  f.moveTo(mx(pl.x) - 900 * S, my(pl.z)); f.arc(mx(pl.x), my(pl.z), 900 * S, 0, Math.PI * 2);
  f.fill();
  f.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(fog, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Name einer Mega-Insel (entdeckt oder nicht): über der Insel, sonst darunter; am Bildrand nach innen geschoben, damit er lesbar bleibt (4.3.6) */
function megaLabel(ctx: CanvasRenderingContext2D, i: IslandDef, known: boolean): void {
  const sx = mx(i.x), sy = my(i.z);
  if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) return;
  ctx.font = FONT_MEGA;
  const hw = widths.get(ctx, FONT_MEGA, i.name) / 2;
  const lx = Math.min(W - hw - 8, Math.max(hw + 8, sx));
  const rr = Math.max(10, i.r * S * (known ? 1.3 : 1.15));
  const fill = known ? '#FFF3C8' : '#F4E2B8';
  if (!label(ctx, FONT_MEGA, i.name, lx, sy - rr - 7, fill)) label(ctx, FONT_MEGA, i.name, lx, sy + rr + 17, fill);
}

/** Vollbild-Weltkarte */
export function drawWorldMap(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, v: WorldView, d: WorldMapData, st: MapDrawState) {
  W = w; H = h; CX = v.cx; CZ = v.cz; S = v.scale;
  const L = st.layers, zoom = st.zoom;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.setLineDash([]);
  const key = w + 'x' + h;
  if (key !== bgKey || !bgGrad) {
    bgKey = key;
    bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
    bgGrad.addColorStop(0, '#1F4A66'); bgGrad.addColorStop(1, '#0A1A28');
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);
  placer.clear();
  // Bedienelemente (Leisten, Legenden, Knöpfe) halten ihre Fläche frei: Namen darunter wären verdeckt
  const ch = st.chrome;
  if (ch) for (let k = 0; k + 3 < ch.length; k += 4) placer.tryPlace(ch[k], ch[k + 1], ch[k + 2], ch[k + 3], 0);

  // Gitternetz alle 500 m (ab genug Zoom)
  ctx.strokeStyle = 'rgba(232,214,170,0.07)'; ctx.lineWidth = 1;
  const step = 500;
  const x0 = CX - (w / 2) / S, x1 = CX + (w / 2) / S, z0 = CZ - (h / 2) / S, z1 = CZ + (h / 2) / S;
  if (step * S > 14) {
    for (let gx = Math.ceil(x0 / step) * step; gx < x1; gx += step) { ctx.beginPath(); ctx.moveTo(mx(gx), 0); ctx.lineTo(mx(gx), h); ctx.stroke(); }
    for (let gz = Math.ceil(z0 / step) * step; gz < z1; gz += step) { ctx.beginPath(); ctx.moveTo(0, my(gz)); ctx.lineTo(w, my(gz)); ctx.stroke(); }
  }
  // Sturmsee hinter dem spielbaren Meer, Weltrand
  ctx.fillStyle = STORM_SEA;
  ctx.beginPath(); ctx.arc(mx(0), my(0), WORLD_RADIUS * S, 0, Math.PI * 2); ctx.arc(mx(0), my(0), PLAYABLE_RADIUS * S, 0, Math.PI * 2, true); ctx.fill();
  ctx.strokeStyle = 'rgba(232,214,170,0.6)'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(mx(0), my(0), WORLD_RADIUS * S, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);

  if (L.sectors) {
    // Die fünf Kuchenstücke (je 72°) in der Farbe ihrer Macht
    for (let k = 0; k < SECTORS.length; k++) {
      const sec = SECTORS[k];
      const a0 = (sec.fromDeg * Math.PI) / 180, a1 = (sec.toDeg * Math.PI) / 180;
      ctx.beginPath(); ctx.moveTo(mx(0), my(0));
      for (let n = 0; n <= 28; n++) { const a = a0 + ((a1 - a0) * n) / 28; ctx.lineTo(mx(Math.sin(a) * WORLD_RADIUS), my(Math.cos(a) * WORLD_RADIUS)); }
      ctx.closePath();
      ctx.fillStyle = FACTIONS[sec.factionId].color + '24'; ctx.fill();
    }
    // Die vier Gefahrenringe: getönte Bänder mit Randlinie und Namen am oberen Rand
    for (let k = RINGS.length - 1; k >= 0; k--) {
      const r = RINGS[k], rIn = r.from * S, rOut = (k === RINGS.length - 1 ? PLAYABLE_RADIUS : r.to) * S;
      ctx.fillStyle = RING_TINT[k];
      ctx.beginPath(); ctx.arc(mx(0), my(0), rOut, 0, Math.PI * 2); if (rIn > 0) ctx.arc(mx(0), my(0), rIn, 0, Math.PI * 2, true); ctx.fill();
      ctx.strokeStyle = RING_EDGE[k]; ctx.lineWidth = 1.4; ctx.setLineDash([2, 6]);
      ctx.beginPath(); ctx.arc(mx(0), my(0), rOut, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    // Ring 5 (4.5C): die fünf freigehaltenen Bauplätze der Kaiser – „Verbotene Gewässer“, gestrichelt in Violett
    ctx.setLineDash([4, 5]); ctx.lineWidth = 1.3;
    for (let k = 0; k < KAISER_SITES.length; k++) {
      const ks = KAISER_SITES[k], rr = ks.clear * S;
      if (rr < 3) continue;
      ctx.fillStyle = 'rgba(120,80,190,0.10)'; ctx.strokeStyle = 'rgba(205,170,255,0.55)';
      ctx.beginPath(); ctx.arc(mx(ks.x), my(ks.z), rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Grenzlinien: die Marine hält sie (weiß gestrichelt, von der Mitte bis zum Weltrand)
    ctx.strokeStyle = 'rgba(236,243,255,0.6)'; ctx.setLineDash([10, 7]); ctx.lineWidth = 2;
    for (let k = 0; k < BORDERS.length; k++) {
      const a = (BORDERS[k].deg * Math.PI) / 180;
      ctx.beginPath(); ctx.moveTo(mx(0), my(0)); ctx.lineTo(mx(Math.sin(a) * WORLD_RADIUS), my(Math.cos(a) * WORLD_RADIUS)); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // Die alten Meeresnamen (Nebelarchipel, Nordwacht, Glutring, Sturmgürtel, Schlundriff) klebten eng in der Kartenmitte und überdeckten Ringe, Sektoren und
  // Inselnamen (4.3.6): sie entfallen; nur die Bernsteinsee bleibt als zarter Kreis um Ankerglück
  for (let k = 0; k < d.regions.length; k++) {
    const r = d.regions[k];
    if (r.id !== 'bernsteinsee') continue;
    ctx.fillStyle = r.color + '16';
    ctx.beginPath(); ctx.arc(mx(r.x), my(r.z), r.r * S, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = r.color + '55'; ctx.lineWidth = 1.2; ctx.stroke();
  }
  if (L.sectors) {
    // Namen der Mächte im Kuchenstück: an der ersten freien Stelle neben der Mittellinie (nicht über Mega-Inseln, Festungen und Bedienelementen, 4.3.6).
    // In der Gesamtansicht halten sie ihren Platz frei; nah herangezoomt sind sie nur noch Wasserzeichen, über die kleinere Namen laufen dürfen
    const fs = Math.round(Math.max(13, Math.min(34, WORLD_RADIUS * S * 0.06)));
    const font = sectorFont(fs), keep = zoom < LABEL_ZOOM;
    for (let k = 0; k < SECTORS.length; k++) {
      const sec = SECTORS[k], f = FACTIONS[sec.factionId], name = SECTOR_NAME[k];
      ctx.font = FONT_REF_SECTOR;
      const hw = (widths.get(ctx, FONT_REF_SECTOR, name) * fs) / SECTOR_REF / 2;
      let px = 0, py = 0, found = false;
      for (let c = 0; c < SECTOR_TRY.length; c++) {
        const a = (((sec.fromDeg + sec.toDeg) / 2 + SECTOR_TRY[c][0]) * Math.PI) / 180, rr = WORLD_RADIUS * SECTOR_TRY[c][1];
        const qx = mx(Math.sin(a) * rr), qy = my(Math.cos(a) * rr);
        if (c === 0) { px = qx; py = qy; }
        if (sectorSpotFree(ctx, d, qx - hw, qy - fs * 0.8, qx + hw, qy + fs * 0.25)) { px = qx; py = qy; found = true; break; }
      }
      if (found && keep) placer.tryPlace(px - hw, py - fs * 0.8, px + hw, py + fs * 0.25, 0);
      ctx.globalAlpha = found ? (keep ? 1 : 0.6) : 0.4;
      ctx.font = font; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,16,28,0.7)'; ctx.strokeText(name, px, py); ctx.fillStyle = f.color; ctx.fillText(name, px, py);
      ctx.globalAlpha = 1;
    }
  }

  // Entdeckungs-Nebel: alles außerhalb der kartierten Zonen liegt im Dunst
  if (st.fog) drawFog(ctx, st.fog, dpr, d);
  const zs = d.chartZones;
  if (zs && zs.length) {
    ctx.strokeStyle = 'rgba(244,226,184,0.3)'; ctx.lineWidth = 1.2; ctx.setLineDash([6, 6]);
    for (let k = 0; k < zs.length; k++) { ctx.beginPath(); ctx.arc(mx(zs[k].x), my(zs[k].z), zs[k].r * S, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
  }

  // Inseln: erst alle Flächen (kleine unten, große oben), dann die Namen nach Rang
  const isl = byRank(d.islands);
  const sel = st.selected;
  for (let k = isl.length - 1; k >= 0; k--) {
    const i = isl[k];
    const sx = mx(i.x), sy = my(i.z);
    if (sx < -120 || sx > w + 120 || sy < -120 || sy > h + 120) continue;
    const shape = d.shape?.(i.id);
    if (d.known(i.id)) {
      drawKnownIsland(ctx, i, shape);
      const tp = d.topo?.(i.id);
      if (tp) drawTopo(ctx, i, tp);
      // Mega-Inseln: goldener Saum als Haupt-Orientierungspunkt
      if (i.mega) { ctx.strokeStyle = 'rgba(227,176,75,0.85)'; ctx.lineWidth = 2; outline(ctx, mx, my, S, i, shape, 1.32); ctx.stroke(); }
    } else drawOutlineIsland(ctx, i, shape);
    if (sel === i.id) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(10, i.r * S * 1.5), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // Wahrzeichen: Marine-Grenzfestungen und die sechs großen Außenfestungen sind immer zu sehen (auch unentdeckt)
  for (let k = 0; k < isl.length; k++) {
    const i = isl[k];
    if (i.kind !== 'marinefort' && i.kind !== 'citadel') continue;
    const f = i.factionId ? FACTIONS[i.factionId] : null;
    const big = i.kind === 'citadel' || i.marine === 'hq';
    const ix = mx(i.x), iy = my(i.z) - Math.max(14, i.r * S * 1.9), kk = big ? 1.5 : 1.2;
    drawPoi(ctx, ix, iy, i.marine === 'hq' || i.kind === 'citadel' ? 'citadel' : 'fort', kk, i.marine === 'hq' ? '#F4F7FC' : f?.color);
    // das Symbol hält seine Fläche frei (4.5C): Ring- und Inselnamen legen sich nicht darüber
    placer.tryPlace(ix - 9 * kk, iy - 8 * kk, ix + 9 * kk, iy + 8 * kk, 0);
  }
  // Boss- und Auftragszeichen (nur entdeckte Inseln), Hafen-Blockaden
  for (let k = 0; k < isl.length; k++) {
    const i = isl[k];
    if (!d.known(i.id)) continue;
    const sx = mx(i.x), sy = my(i.z);
    if (sx < -60 || sx > w + 60 || sy < -60 || sy > h + 60) continue;
    if (i.kind === 'boss') drawPoi(ctx, sx + i.r * S * 0.9, sy - i.r * S * 0.9, 'boss', 1.1);
    const mk = d.islandMarks.get(i.id);
    if (mk) drawPoi(ctx, sx + Math.max(12, i.r * S * 1.45), sy, mk, 1.2);
    if (L.events && d.blockaded?.(i.id)) { ctx.strokeStyle = 'rgba(255,90,60,0.9)'; ctx.lineWidth = 2.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(sx, sy, Math.max(14, i.r * S * 1.9), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  }
  // Besetzte Inseln: goldener Ring mit Fahne und Countdown; im Endspurt pulsiert er rot, die Flotte läuft als Warnzeichen auf die Insel zu
  const occ = d.occupations;
  if (occ) for (let k = 0; k < occ.length; k++) {
    const o = occ[k];
    const x = mx(o.x), y = my(o.z), rr = Math.max(13, o.r * S * 1.5), t = performance.now() / 1000;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = o.endgame ? `rgba(255,${Math.round(80 + 60 * Math.sin(t * 6))},50,0.95)` : 'rgba(227,176,75,0.95)';
    ctx.setLineDash(o.endgame ? [5, 4] : []);
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#1b1410'; ctx.fillStyle = '#E3B04B'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 2, y - rr - 16); ctx.lineTo(x - 2, y - rr + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 2, y - rr - 16); ctx.lineTo(x + 12, y - rr - 11); ctx.lineTo(x - 2, y - rr - 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (o.fleet) { ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,90,60,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx(o.fleet.x), my(o.fleet.z)); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]); drawPoi(ctx, mx(o.fleet.x), my(o.fleet.z), 'alarm', 1.5); }
  }
  // Meeresströmungen: blaue Bänder mit Pfeilen in Fließrichtung, Name in der Mitte
  const cur = d.currents;
  if (L.currents && cur) for (let c = 0; c < cur.length; c++) {
    const cu = cur[c], pts = cu.pts;
    if (pts.length < 4) continue;
    ctx.save();
    ctx.strokeStyle = 'rgba(140,220,255,0.55)'; ctx.lineWidth = Math.max(2, 120 * S); ctx.lineCap = 'round'; ctx.setLineDash([10, 7]);
    ctx.beginPath();
    for (let k = 0; k < pts.length; k += 2) { const x = mx(pts[k]), y = my(pts[k + 1]); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(190,240,255,0.9)';
    const n = pts.length / 2;
    for (let k = Math.floor(n / 6); k < n - 1; k += Math.max(4, Math.floor(n / 4))) {
      const ax = mx(pts[k * 2]), ay = my(pts[k * 2 + 1]), bx = mx(pts[k * 2 + 2]), by = my(pts[k * 2 + 3]);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.atan2(by - ay, bx - ax));
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  // Wetterzellen, Konvois und Welt-Ereignisse
  const cells = d.cells;
  if (L.events && cells) for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    const x = mx(c.x), y = my(c.z), rr = Math.max(6, c.r * S);
    ctx.save();
    ctx.fillStyle = c.kind === 'gewitter' ? 'rgba(40,46,60,0.35)' : c.kind === 'nebelbank' ? 'rgba(230,236,240,0.25)' : 'rgba(255,240,200,0.12)';
    ctx.strokeStyle = c.kind === 'gewitter' ? 'rgba(120,130,160,0.8)' : c.kind === 'nebelbank' ? 'rgba(240,244,248,0.7)' : 'rgba(255,230,170,0.6)';
    ctx.lineWidth = 1.5; if (c.kind === 'flaute') ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }
  const cvs = d.convoys;
  if (L.events && cvs) for (let k = 0; k < cvs.length; k++) drawPoi(ctx, mx(cvs[k].x), my(cvs[k].z), 'convoy', 1.1, cvs[k].threatened ? '#FF4A3A' : undefined);
  const evs = d.seaEvents;
  if (L.events && evs) for (let k = 0; k < evs.length; k++) drawPoi(ctx, mx(evs[k].x), my(evs[k].z), evs[k].kind, 1.5, evs[k].color);
  const bts = d.battles;
  if (L.events && bts) for (let k = 0; k < bts.length; k++) {
    const b = bts[k], x = mx(b.x), y = my(b.z), t = performance.now() / 1000, rr = 20 + 3 * Math.sin(t * 5);
    ctx.strokeStyle = 'rgba(255,138,58,0.85)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    drawPoi(ctx, x, y, 'battle', 1.5);
  }
  // Krieg & Frontlinien (4.5A/4.5B): Bündnislinien zwischen Hauptstädten, Rahmen eroberter Inseln, Frontlinien der Armadas zu ihren Zielen,
  // Belagerungsring mit Fortschritt in der Farbe des Angreifers, Armadas als Pfeile in Fahrtrichtung, ferne Großschlachten
  const war = d.wars;
  if (L.war && war) {
    const al = war.alliances;
    if (al) for (let k = 0; k < al.length; k++) {
      const a = al[k];
      ctx.strokeStyle = a.color; ctx.globalAlpha = 0.75; ctx.lineWidth = a.coalition ? 1.6 : 2.4; ctx.setLineDash(a.coalition ? [2, 5] : [10, 6]);
      ctx.beginPath(); ctx.moveTo(mx(a.ax), my(a.az)); ctx.lineTo(mx(a.bx), my(a.bz)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    const cq = war.conquered;
    if (cq) for (let k = 0; k < cq.length; k++) {
      const c = cq[k], x = mx(c.x), y = my(c.z), rr = Math.max(9, c.r * S * 1.42);
      ctx.strokeStyle = 'rgba(12,10,8,0.8)'; ctx.lineWidth = 5; ctx.strokeRect(x - rr, y - rr, rr * 2, rr * 2);
      ctx.strokeStyle = c.color; ctx.lineWidth = 2.6; ctx.strokeRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    for (let k = 0; k < war.armadas.length; k++) {
      const a = war.armadas[k];
      if (a.tx === undefined || a.tz === undefined) continue;
      ctx.strokeStyle = a.color; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.6; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(mx(a.x), my(a.z)); ctx.lineTo(mx(a.tx), my(a.tz)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    for (let k = 0; k < war.sieges.length; k++) {
      const sg = war.sieges[k], x = mx(sg.x), y = my(sg.z), rr = Math.max(12, sg.r * S * 1.6);
      ctx.strokeStyle = 'rgba(20,16,14,0.65)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = sg.color; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, Math.min(1, sg.progress))); ctx.stroke();
    }
    for (let k = 0; k < war.battles.length; k++) {
      const b = war.battles[k], x = mx(b.x), y = my(b.z);
      ctx.strokeStyle = 'rgba(255,138,58,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      drawPoi(ctx, x, y, 'battle', 1.2);
    }
    for (let k = 0; k < war.armadas.length; k++) {
      const a = war.armadas[k], x = mx(a.x), y = my(a.z), s = 7 + Math.min(4, a.ships * 0.4);
      const fx = Math.sin(a.heading), fy = -Math.cos(a.heading);
      ctx.fillStyle = a.color; ctx.strokeStyle = 'rgba(16,12,10,0.85)'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + fx * s, y + fy * s);
      ctx.lineTo(x - fx * s * 0.7 - fy * s * 0.6, y - fy * s * 0.7 + fx * s * 0.6);
      ctx.lineTo(x - fx * s * 0.35, y - fy * s * 0.35);
      ctx.lineTo(x - fx * s * 0.7 + fy * s * 0.6, y - fy * s * 0.7 - fx * s * 0.6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (a.relief) { ctx.strokeStyle = a.color; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, s + 4, 0, Math.PI * 2); ctx.stroke(); }
    }
  }
  const m = d.markers;
  for (let k = 0; k < m.digs.length; k++) {
    const dg = m.digs[k];
    ctx.strokeStyle = '#FF4A3A'; ctx.lineWidth = 3;
    const x = mx(dg.x), y = my(dg.z);
    ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
  }
  for (let k = 0; k < m.enemies.length; k++) { const e = m.enemies[k]; drawPoi(ctx, mx(e.x), my(e.z), e.legend ? 'boss' : e.ally ? 'npc' : 'enemy', 1.1); }
  if (m.target) drawPoi(ctx, mx(m.target.x), my(m.target.z), 'target', 1.4);

  // ----- Beschriftung: nach Rang, nichts überlappt -----
  // 1. Spieler und Ereignisse (wichtiger als Inselnamen), 2. Städte und Festungen, 3. Häfen und Bosse, 4. der Rest, 5. Markt-Abzeichen
  const px = mx(m.player.x), py = my(m.player.z);
  placer.tryPlace(px - 14, py - 14, px + 14, py + 14, 0);
  // Belagerungen und Schlachten (4.5B): unter 1,25× gebündelte, überlappungsfreie Kampf-Symbole ohne Text (die Kartenmitte bleibt lesbar); der volle
  // Text erst beim Hineinzoomen oder für die angeklickte Insel. Grenz-Seeschlachten gehören dazu, sobald die Kriegsebene an ist
  const warOn = L.war && !!war, full = zoom >= WAR_LABEL_ZOOM;
  if (warOn && war) {
    if (full) {
      // unter dem Zeichen, sonst darüber: nie überlappend, auch wenn Belagerungen und Schlachten dicht beieinander liegen
      for (let k = 0; k < war.sieges.length; k++) { const sg = war.sieges[k], rr = Math.max(12, sg.r * S * 1.6); label2(ctx, `${sg.name} · ${Math.round(sg.progress * 100)} %`, mx(sg.x), my(sg.z) + rr + 16, my(sg.z) - rr - 8, '#FFC090'); }
      for (let k = 0; k < war.battles.length; k++) { const b = war.battles[k]; label2(ctx, b.name, mx(b.x), my(b.z) + 34, my(b.z) - 22, '#FFB070'); }
      if (bts && L.events) for (let k = 0; k < bts.length; k++) { const b = bts[k]; label2(ctx, `Seeschlacht ${FACTIONS[b.a].name} ⚔ ${FACTIONS[b.b].name}`, mx(b.x), my(b.z) + 42, my(b.z) - 30, '#FFB070'); }
      if (zoom >= LABEL_ZOOM) for (let k = 0; k < war.armadas.length; k++) { const a = war.armadas[k]; label(ctx, FONT_BADGE, `${a.name} (${a.ships})`, mx(a.x), my(a.z) + 18, a.color); }
    } else {
      // Marken sammeln: Belagerungen zuerst (sie setzen die Zentren), dann Großschlachten, dann Grenz-Seeschlachten
      let n = 0;
      for (let k = 0; k < war.sieges.length && n < WAR_MAX; k++, n++) { warX[n] = mx(war.sieges[k].x); warY[n] = my(war.sieges[k].z); warKind[n] = 0; }
      for (let k = 0; k < war.battles.length && n < WAR_MAX; k++, n++) { warX[n] = mx(war.battles[k].x); warY[n] = my(war.battles[k].z); warKind[n] = 1; }
      if (bts && L.events) for (let k = 0; k < bts.length && n < WAR_MAX; k++, n++) { warX[n] = mx(bts[k].x); warY[n] = my(bts[k].z); warKind[n] = 2; }
      const nc = clusters.build(warX, warY, n, WAR_CLUSTER_PX);
      for (let c = 0; c < nc; c++) {
        const x = clusters.cx[c], y = clusters.cy[c], cnt = clusters.count[c];
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
        let siege = false;
        for (let i = 0; i < n; i++) if (clusters.of[i] === c && warKind[i] === 0) { siege = true; break; }
        // Symbol: dunkle Scheibe mit Fahne (Belagerung) bzw. gekreuzten Kanonen (Schlacht), Zahl bei mehreren; der Platz bleibt für Namen frei
        ctx.fillStyle = 'rgba(14,10,8,0.82)'; ctx.strokeStyle = siege ? '#FFC090' : '#FFB070'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (siege) {
          ctx.strokeStyle = '#F4E2B8'; ctx.fillStyle = '#E8624A'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(x - 3, y + 7); ctx.lineTo(x - 3, y - 7); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x - 3, y - 7); ctx.lineTo(x + 7, y - 4); ctx.lineTo(x - 3, y - 1); ctx.closePath(); ctx.fill();
        } else drawPoi(ctx, x, y, 'battle', 0.9);
        let x1 = x + 13;
        if (cnt > 1) {
          ctx.font = FONT_BADGE; ctx.textAlign = 'left';
          const t = countText(cnt);
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,16,28,0.9)'; ctx.strokeText(t, x + 11, y + 15); ctx.fillStyle = '#FFE3A0'; ctx.fillText(t, x + 11, y + 15);
          x1 = x + 13 + widths.get(ctx, FONT_BADGE, t);
        }
        placer.tryPlace(x - 13, y - 13, x1, y + 17, 0);
      }
      // angeklickte Insel: ihr Belagerungstext trotz Bündelung
      if (sel) for (let k = 0; k < war.sieges.length; k++) {
        const sg = war.sieges[k];
        if (sg.id !== sel) continue;
        // unter, über oder neben der Insel: die erste freie Stelle (die Symbole ringsum bleiben stehen)
        const t = `${sg.name} · ${Math.round(sg.progress * 100)} %`, x = mx(sg.x), y = my(sg.z), rr = Math.max(12, sg.r * S * 1.6);
        ctx.font = FONT_EVENT;
        const hw = widths.get(ctx, FONT_EVENT, t) / 2;
        if (!label(ctx, FONT_EVENT, t, x, y + rr + 30, '#FFC090') && !label(ctx, FONT_EVENT, t, x, y - rr - 22, '#FFC090') && !label(ctx, FONT_EVENT, t, x + rr + hw + 18, y + 4, '#FFC090')) label(ctx, FONT_EVENT, t, x - rr - hw - 18, y + 4, '#FFC090');
      }
    }
  }
  if (L.events) {
    // Ereignis-Symbole halten ihre Fläche frei (4.5C): kein Inselname liegt über einem Symbol
    if (evs) for (let k = 0; k < evs.length; k++) { const x = mx(evs[k].x), y = my(evs[k].z); if (x > -20 && x < w + 20 && y > -20 && y < h + 20) placer.tryPlace(x - 12, y - 14, x + 12, y + 12, 0); }
    if (evs) for (let k = 0; k < evs.length; k++) { const e = evs[k]; label(ctx, FONT_EVENT, e.name, mx(e.x), my(e.z) + 24, e.kind === 'worldboss' ? '#FF9A8A' : e.kind === 'galeone' ? '#FFE07A' : e.kind === 'castaway' ? '#FFB0A0' : e.kind === 'smuggler' ? '#D6B4FF' : e.kind === 'hunt' ? '#F4D58A' : '#F4EEDC'); }
    if (bts && !warOn && full) for (let k = 0; k < bts.length; k++) { const b = bts[k]; label(ctx, FONT_EVENT, `Seeschlacht ${FACTIONS[b.a].name} ⚔ ${FACTIONS[b.b].name}`, mx(b.x), my(b.z) + 42, '#FFB070'); }
  }
  // Mega-Inseln vor allen anderen Namen: sie sind die Orientierungspunkte der Karte (4.3.6)
  for (let k = 0; k < isl.length; k++) { const i = isl[k]; if (i.mega) megaLabel(ctx, i, d.known(i.id)); }
  // Kaiser-Bauplätze (4.5C): Namen erst beim Hineinzoomen
  if (L.sectors && zoom >= LABEL_ZOOM) for (let k = 0; k < KAISER_SITES.length; k++) { const ks = KAISER_SITES[k]; label(ctx, FONT_BADGE, 'Verbotene Gewässer', mx(ks.x), my(ks.z) + 4, 'rgba(215,190,255,0.9)'); }
  // Ringnamen am Südrand jedes Rings (innen), wo keine Machtnamen stehen
  if (L.sectors) for (let k = 0; k < RINGS.length; k++) {
    const r = RINGS[k], rOut = (k === RINGS.length - 1 ? PLAYABLE_RADIUS : r.to) * S;
    label(ctx, FONT_BADGE, RING_LABEL[k], mx(0), my(0) + rOut - 8, RING_EDGE[k]);
  }
  if (occ) for (let k = 0; k < occ.length; k++) { const o = occ[k]; label(ctx, FONT_EVENT, o.endgame ? `⚠ ${o.text}` : o.text, mx(o.x), my(o.z) + Math.max(13, o.r * S * 1.5) + 15, o.endgame ? '#FF8A6A' : '#FFE3A0'); }
  if (L.currents && cur && zoom >= LABEL_ZOOM) for (let c = 0; c < cur.length; c++) { const pts = cur[c].pts; if (pts.length >= 4) { const mid = Math.floor(pts.length / 4); label(ctx, FONT_BADGE, cur[c].name, mx(pts[mid * 2]), my(pts[mid * 2 + 1]) - 9, '#BFEFFF'); } }
  if (L.events && cells && zoom >= LABEL_ZOOM) for (let k = 0; k < cells.length; k++) { const c = cells[k]; if (c.r * S > 14) label(ctx, FONT_BADGE, c.label, mx(c.x), my(c.z) + 4, 'rgba(235,240,248,0.95)'); }
  for (let k = 0; k < isl.length; k++) {
    const i = isl[k];
    if (i.mega) continue;
    if (!d.known(i.id)) {
      // Wahrzeichen tragen ihren Namen auch ungekartet (Festungen; Mega-Inseln stehen schon); sonst bleibt der Umriss stumm
      if ((i.kind === 'marinefort' || i.kind === 'citadel') && labelShown(labelRank(i), zoom)) label(ctx, FONT_BIG, i.name, mx(i.x), my(i.z) - Math.max(14, i.r * S * 1.9) - 14, '#FFF3C8');
      continue;
    }
    const rank = labelRank(i);
    const sx = mx(i.x), sy = my(i.z);
    if (sx < -80 || sx > w + 80 || sy < -60 || sy > h + 60) continue;
    if (sel !== i.id && !labelShown(rank, zoom)) continue;
    // Riff-Felsen (II, III einer Passage) tragen keinen eigenen Namen: die Passage heißt nach ihrem ersten Felsen
    if (i.skerry && REEF_TAIL.test(i.name)) continue;
    const font = rank === 3 ? FONT_BIG : FONT_NAME;
    // über der Insel; ist dort besetzt (Spieler, Ereignis, Nachbar), darunter
    if (!label(ctx, font, i.name, sx, sy - i.r * S * 1.3 - 6 - (i.kind === 'marinefort' || i.kind === 'citadel' ? 24 : 0), '#FFF3C8')) label(ctx, font, i.name, sx, sy + i.r * S * 1.3 + 16, '#FFF3C8');
  }
  if (L.trade && zoom >= LABEL_ZOOM) for (let k = 0; k < isl.length; k++) {
    const i = isl[k];
    if (!isTravelPort(i.kind) || !d.known(i.id)) continue;
    const sx = mx(i.x), sy = my(i.z);
    if (sx < -80 || sx > w + 80 || sy < -60 || sy > h + 60) continue;
    const t = badgeOf(i);
    if (t) label(ctx, FONT_BADGE, t, sx, sy + i.r * S * 1.3 + 15, profileOf(i).blackMarket ? '#E7B0FF' : '#C9F2B4');
  }

  // Spieler als Pfeil mit weißem Ring
  ctx.save();
  ctx.translate(px, py);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
  ctx.rotate(-m.player.heading);
  ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/** Für Tests und Prüfskripte: die gesetzten Beschriftungsrechtecke des letzten Bildes */
export const lastLabels = (): { count: number; at: (i: number, out: number[]) => number[] } => ({ count: placer.n, at: (i, out) => placer.at(i, out) });

/** Faktor zwischen Pixeln je Meter und Zoom der Gesamtansicht (für Anzeigen) */
export const zoomFactor = (scale: number, w: number, h: number): number => scale / fitScale(w, h);
