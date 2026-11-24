// Zeichner der Weltkarte (Taste M, Phase 4.3D): Meer, Sektoren und Gefahrenringe, Entdeckungs-Nebel, Inseln in drei Stufen (voll, schemenhafter Umriss, unsichtbar),
// Strömungen, Ereignisse, Konvois, Markt-Abzeichen und überlappungsfreie Namen. Ohne neue Objekte je Bild: die Umrechnung liest Modulvariablen
// (kein Abschluss je Bild), Rechtecke der Beschriftung liegen im `LabelPlacer`, Abzeichen-Texte werden einmal gebaut und gemerkt.
import type { IslandDef } from '../data/regions';
import { BORDERS, FACTIONS, SECTORS } from '../data/factions';
import { PLAYABLE_RADIUS, WORLD_RADIUS } from '../data/world';
import { RINGS } from '../data/worldRings';
import { GOOD_BY_ID, profileOf, type GoodId } from '../data/economy';
import { drawPoi, outline, ownerRing, type ShapeLike, type WorldMapData, type WorldView } from './minimap';
import { LABEL_ZOOM, LabelPlacer, TextWidths, fitScale, labelShown, type LabelRank } from './mapView';
import { isTravelPort } from '../world/fastTravel';

/** Ebenen der Karte, einzeln ein- und ausblendbar */
export interface MapLayers { sectors: boolean; currents: boolean; events: boolean; trade: boolean }
export const MAP_LAYERS: readonly { id: keyof MapLayers; label: string; hint: string }[] = [
  { id: 'sectors', label: 'Sektoren & Gefahrenringe', hint: 'Die fünf Mächte und die vier Meeres-Ringe' },
  { id: 'currents', label: 'Strömungen', hint: 'Elf Windstraßen mit Strömungsrichtung' },
  { id: 'events', label: 'Ereignisse & Konvois', hint: 'Schatz-Galeonen, Blockaden, Wrackfelder, Weltbosse, Handelskonvois' },
  { id: 'trade', label: 'Kontor-Handel', hint: 'Überschuss ▲ und Bedarf ▼ entdeckter Häfen' },
];
export const defaultLayers = (): MapLayers => ({ sectors: true, currents: true, events: true, trade: true });

export interface MapDrawState {
  selected: string | null;
  layers: MapLayers;
  /** Zweite Zeichenfläche gleicher Größe für den Nebel (die Karte legt sie einmal an und gibt sie mit dem Fenster frei) */
  fog: HTMLCanvasElement | null;
  /** Aktueller Zoom relativ zur Gesamtansicht (1× = ganze Welt) */
  zoom: number;
}

// ---------- Arbeitsvariablen (kein Abschluss je Bild) ----------

let W = 0, H = 0, CX = 0, CZ = 0, S = 1;
const mx = (x: number): number => W / 2 - (x - CX) * S;
const my = (z: number): number => H / 2 - (z - CZ) * S;

const placer = new LabelPlacer(320);
const widths = new TextWidths();
const FONT_NAME = '700 12px "Alegreya Sans", sans-serif';
const FONT_BIG = '800 13px "Alegreya Sans", sans-serif';
const FONT_BADGE = '700 11px "Alegreya Sans", sans-serif';
const FONT_EVENT = '800 12px "Alegreya Sans", sans-serif';

/** Rang der Beschriftung: Städte, Festungen und das Hauptquartier immer, Häfen, Bosse und Leuchttürme ab 1,15×, der Rest ebenso */
export function labelRank(i: Pick<IslandDef, 'kind' | 'marine'>): LabelRank {
  if (i.kind === 'town' || i.kind === 'citadel' || i.kind === 'marinefort' || i.marine === 'hq') return 3;
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

const RING_TINT = ['rgba(120,200,150,0.07)', 'rgba(230,200,110,0.07)', 'rgba(230,140,80,0.09)', 'rgba(200,70,70,0.11)'] as const;
const RING_EDGE = ['rgba(150,220,170,0.5)', 'rgba(240,215,130,0.5)', 'rgba(240,160,100,0.55)', 'rgba(225,100,100,0.6)'] as const;
const STORM_SEA = 'rgba(70,80,120,0.28)';
const RING_LABEL = RINGS.map((r) => `Ring ${r.ring} · ${r.name}`);

function drawOutlineIsland(ctx: CanvasRenderingContext2D, i: IslandDef, shape: ShapeLike | undefined) {
  // schemenhaft: Umriss eines Pergament-Blatts, keine Farben, keine Ringe, keine Namen
  ctx.fillStyle = 'rgba(226,206,160,0.13)';
  outline(ctx, mx, my, S, i, shape, 1); ctx.fill();
  ctx.strokeStyle = 'rgba(236,218,172,0.5)'; ctx.lineWidth = 1.1; ctx.setLineDash([3, 3]);
  ctx.stroke(); ctx.setLineDash([]);
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
    // Grenzlinien: die Marine hält sie (weiß gestrichelt, von der Mitte bis zum Weltrand)
    ctx.strokeStyle = 'rgba(236,243,255,0.6)'; ctx.setLineDash([10, 7]); ctx.lineWidth = 2;
    for (let k = 0; k < BORDERS.length; k++) {
      const a = (BORDERS[k].deg * Math.PI) / 180;
      ctx.beginPath(); ctx.moveTo(mx(0), my(0)); ctx.lineTo(mx(Math.sin(a) * WORLD_RADIUS), my(Math.cos(a) * WORLD_RADIUS)); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // Meere (Namen)
  for (let k = 0; k < d.regions.length; k++) {
    const r = d.regions[k];
    if (r.id === 'bernsteinsee') {
      ctx.fillStyle = r.color + '1e';
      ctx.beginPath(); ctx.arc(mx(r.x), my(r.z), r.r * S, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = r.color + '77'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.font = `800 ${Math.max(12, Math.min(26, r.r * S * 0.16))}px "Alegreya", serif`; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(244,226,184,0.55)';
    ctx.fillText(r.name.toUpperCase(), mx(r.x), my(r.z) - r.r * S * 0.78);
  }
  if (L.sectors) {
    // Namen der Mächte entlang der Mittellinie jedes Kuchenstücks, nahe am Rand; die Ringe tragen ihre Namen am Nordrand
    for (let k = 0; k < SECTORS.length; k++) {
      const sec = SECTORS[k], f = FACTIONS[sec.factionId], a = (((sec.fromDeg + sec.toDeg) / 2) * Math.PI) / 180;
      const px = mx(Math.sin(a) * WORLD_RADIUS * 0.7), py = my(Math.cos(a) * WORLD_RADIUS * 0.7);
      ctx.font = `900 ${Math.max(13, Math.min(34, WORLD_RADIUS * S * 0.06))}px "Alegreya", serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,16,28,0.7)'; ctx.strokeText(f.name.toUpperCase(), px, py); ctx.fillStyle = f.color; ctx.fillText(f.name.toUpperCase(), px, py);
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
    if (d.known(i.id)) drawKnownIsland(ctx, i, shape); else drawOutlineIsland(ctx, i, shape);
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
    drawPoi(ctx, mx(i.x), my(i.z) - Math.max(14, i.r * S * 1.9), i.marine === 'hq' || i.kind === 'citadel' ? 'citadel' : 'fort', big ? 1.5 : 1.2, i.marine === 'hq' ? '#F4F7FC' : f?.color);
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
  if (L.events && evs) for (let k = 0; k < evs.length; k++) drawPoi(ctx, mx(evs[k].x), my(evs[k].z), evs[k].kind, 1.5);
  const bts = d.battles;
  if (L.events && bts) for (let k = 0; k < bts.length; k++) {
    const b = bts[k], x = mx(b.x), y = my(b.z), t = performance.now() / 1000, rr = 20 + 3 * Math.sin(t * 5);
    ctx.strokeStyle = 'rgba(255,138,58,0.85)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    drawPoi(ctx, x, y, 'battle', 1.5);
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
  if (L.events) {
    if (evs) for (let k = 0; k < evs.length; k++) { const e = evs[k]; label(ctx, FONT_EVENT, e.name, mx(e.x), my(e.z) + 24, e.kind === 'worldboss' ? '#FF9A8A' : e.kind === 'galeone' ? '#FFE07A' : '#F4EEDC'); }
    if (bts) for (let k = 0; k < bts.length; k++) { const b = bts[k]; label(ctx, FONT_EVENT, `Seeschlacht ${FACTIONS[b.a].name} ⚔ ${FACTIONS[b.b].name}`, mx(b.x), my(b.z) + 42, '#FFB070'); }
  }
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
    if (!d.known(i.id)) {
      // Wahrzeichen tragen ihren Namen auch ungekartet; sonst bleibt der schemenhafte Umriss stumm
      if ((i.kind === 'marinefort' || i.kind === 'citadel') && labelShown(labelRank(i), zoom)) label(ctx, FONT_BIG, i.name, mx(i.x), my(i.z) - Math.max(14, i.r * S * 1.9) - 14, '#FFF3C8');
      continue;
    }
    const rank = labelRank(i);
    const sx = mx(i.x), sy = my(i.z);
    if (sx < -80 || sx > w + 80 || sy < -60 || sy > h + 60) continue;
    if (sel !== i.id && !labelShown(rank, zoom)) continue;
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
