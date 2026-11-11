import type { IslandDef, RegionDef } from '../data/regions';
import { WORLD_RADIUS } from '../data/world';
import { BERNSTEINSEE } from '../data/regions';

/** Orientierungspunkte: Feinde (rot), Bosse (Totenkopf), Auftragspersonen (! Auftrag, ? Abgabe), Ziel des Auftrags */
export type PoiKind = 'enemy' | 'boss' | 'quest' | 'turnin' | 'npc' | 'target';
export interface Poi { x: number; z: number; kind: PoiKind; name?: string }

/** Küstenlinie einer Insel (wie in der Welt gebaut), damit die Karte die echte Form zeigt statt eines Kreises */
export interface ShapeLike { x: number; z: number; base?: number; r: number; coast?: { a: number; f: number; p: number }[] }

export interface MapMarkers {
  player: { x: number; z: number; heading: number };
  enemies: { x: number; z: number; legend?: boolean; ally?: boolean }[];
  target: { x: number; z: number } | null;
  digs: { x: number; z: number }[];
  /** Blickrichtung der Kamera (Minikarte dreht sich so, dass oben = Blick) */
  view?: number;
  /** Sichtweite der Minikarte in Metern (Standard See: 420, zu Fuß viel kleiner) */
  range?: number;
  pois?: Poi[];
}

/** Farbenblind-Modus (vom Spiel gesetzt) */
export const mapPalette = { colorblind: false };

const KIND_COLOR: Record<string, string> = { town: '#E3B04B', camp: '#C0503A', boss: '#8A2A3A', quiet: '#5E9450', treasure: '#5E9450', lighthouse: '#E8E2D4', ruin: '#8A8A98', harbor: '#E3B04B' };

export interface MapOpts {
  /** Form der Insel nach ID */
  shape?: (id: string) => ShapeLike | undefined;
}

function coastK(c: NonNullable<ShapeLike['coast']>, a: number): number {
  let k = 1;
  for (const w of c) k += w.a * Math.sin(w.f * a + w.p);
  return k;
}

/** Inselumriss: Küstenlinie als Vieleck (24 Punkte reichen für die Karte), sonst Kreis */
function outline(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (z: number) => number, s: number, i: IslandDef, shape: ShapeLike | undefined, grow: number) {
  ctx.beginPath();
  if (shape?.coast) {
    const base = (shape.base ?? shape.r) * grow;
    const n = 28;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const r = base * coastK(shape.coast, a);
      // Küste liegt in Weltkoordinaten x/z der Insel (Winkel wie in islandGround: atan2(z, x))
      const px = X(i.x + Math.cos(a) * r), py = Y(i.z + Math.sin(a) * r);
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else ctx.arc(X(i.x), Y(i.z), Math.max(2, i.r * s * grow), 0, Math.PI * 2);
}

/** Eine Insel mit Brandungsring, Sand, Grün und (auf großen Karten) Namen */
function drawIsland(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (z: number) => number, s: number, i: IslandDef, shape: ShapeLike | undefined, label: 0 | 1 | 2, known = true) {
  if (!known) {
    ctx.strokeStyle = 'rgba(232,214,170,0.35)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(X(i.x), Y(i.z), Math.max(4, i.r * s), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(232,214,170,0.5)'; ctx.font = '800 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', X(i.x), Y(i.z) + 4);
    return;
  }
  // Flachwasser-Ring, Sand, Landfläche: die echte Form (Küstenlinie)
  ctx.fillStyle = 'rgba(94,180,196,0.35)';
  outline(ctx, X, Y, s, i, shape, 1.28); ctx.fill();
  ctx.fillStyle = '#F1D9A0';
  outline(ctx, X, Y, s, i, shape, 1); ctx.fill();
  ctx.fillStyle = KIND_COLOR[i.kind] ?? '#6DBB4C';
  outline(ctx, X, Y, s, i, shape, 0.7); ctx.fill();
  if (label) {
    ctx.font = label === 2 ? '700 13px "Alegreya Sans", sans-serif' : '700 10px "Alegreya Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(18,36,60,0.85)';
    const ly = Y(i.z) - i.r * s * 1.3 - 5;
    ctx.strokeText(i.name, X(i.x), ly);
    ctx.fillStyle = '#FFF3C8';
    ctx.fillText(i.name, X(i.x), ly);
  }
}

/** Symbole: roter Punkt, Totenkopf, Ausrufezeichen, Fragezeichen, Ziel-Stern */
export function drawPoi(ctx: CanvasRenderingContext2D, x: number, y: number, kind: PoiKind, k = 1) {
  const cb = mapPalette.colorblind;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'enemy':
      ctx.fillStyle = cb ? '#FF9A1A' : '#FF4A3A'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 'boss':
      // Totenkopf mit Augen und Zähnen
      ctx.fillStyle = '#F4EEDC'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, -1.5, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillRect(-3.4, 2.5, 6.8, 4); ctx.strokeRect(-3.4, 2.5, 6.8, 4);
      ctx.fillStyle = '#7A1F1A';
      ctx.beginPath(); ctx.arc(-2.4, -1.8, 1.7, 0, Math.PI * 2); ctx.arc(2.4, -1.8, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-0.4, 3, 0.8, 3);
      break;
    case 'quest': case 'turnin': {
      const col = kind === 'quest' ? '#E3B04B' : '#7FD08A';
      ctx.fillStyle = col; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1b1410'; ctx.font = '900 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(kind === 'quest' ? '!' : '?', 0, 0.5);
      ctx.textBaseline = 'alphabetic';
      break;
    }
    case 'npc':
      ctx.fillStyle = '#9ED0E8'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 2.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 'target':
      ctx.fillStyle = '#FFD166'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let n = 0; n < 10; n++) { const r = n % 2 ? 2.5 : 6.5; const a = (n / 10) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Zeichnet Seekarte (rund, um den Spieler, dreht sich mit der Kamera) oder Regions-/Weltkarte (ganz, mit Namen) in ein Canvas. */
export function drawMap(ctx: CanvasRenderingContext2D, size: number, islands: IslandDef[], m: MapMarkers, mode: 'mini' | 'region' | 'world', opts: MapOpts = {}) {
  const dpr = ctx.canvas.width / size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const mini = mode === 'mini';
  const region = mode === 'region';
  const range = mini ? m.range ?? 420 : region ? BERNSTEINSEE.r * 0.9 : WORLD_RADIUS * 1.08;
  const cx = mini ? m.player.x : region ? BERNSTEINSEE.x : 0, cz = mini ? m.player.z : region ? BERNSTEINSEE.z : 0;
  const s = size / 2 / range;
  // x gespiegelt, damit die Karte zur Kamera passt (Blick nach Norden = +z, rechts = −x)
  const X = (x: number) => size / 2 - (x - cx) * s;
  const Y = (z: number) => size / 2 - (z - cz) * s;
  const label: 0 | 1 | 2 = mini ? 0 : region ? 2 : 1;
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.clip();
  const sea = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // dunkle Seekarte statt Bonbon-Cyan (passt zum ernsten Look)
  sea.addColorStop(0, '#1F4A66'); sea.addColorStop(1, '#0E2638');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, size, size);
  // Minikarte: so drehen, dass oben = Blickrichtung der Kamera
  const rot = mini ? m.view ?? 0 : 0;
  if (mini) { ctx.translate(size / 2, size / 2); ctx.rotate(rot); ctx.translate(-size / 2, -size / 2); }
  // Weltrand
  ctx.strokeStyle = 'rgba(232,214,170,0.55)';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(X(0), Y(0), WORLD_RADIUS * s, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  for (const i of islands) {
    if (mini && Math.hypot(i.x - cx, i.z - cz) - i.r * 1.6 > range * 1.5) continue;
    drawIsland(ctx, X, Y, s, i, opts.shape?.(i.id), label);
  }
  for (const d of m.digs) {
    ctx.strokeStyle = '#FF4A3A'; ctx.lineWidth = 2.5;
    const x = X(d.x), y = Y(d.z);
    ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();
  }
  const cb = mapPalette.colorblind;
  for (const e of m.enemies) {
    const x = X(e.x), y = Y(e.z), r = e.legend ? 4.5 : 3.2;
    if (e.legend) { ctx.save(); ctx.translate(x, y); ctx.rotate(-rot); drawPoi(ctx, 0, 0, 'boss', 0.8); ctx.restore(); continue; }
    ctx.fillStyle = e.ally ? (cb ? '#3AA0FF' : '#7CE07A') : (cb ? '#FF9A1A' : '#FF5A4A');
    ctx.beginPath();
    if (e.ally) ctx.arc(x, y, r, 0, Math.PI * 2);
    else ctx.rect(x - r, y - r, r * 2, r * 2);
    ctx.fill();
    if (cb) { ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1; ctx.stroke(); }
  }
  // Orientierungspunkte (Symbole bleiben aufrecht, auch wenn sich die Karte dreht)
  for (const p of m.pois ?? []) {
    const x = X(p.x), y = Y(p.z);
    if (mini && Math.hypot(x - size / 2, y - size / 2) > size / 2 + 6) continue;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-rot); drawPoi(ctx, 0, 0, p.kind, mini ? 0.9 : 1); ctx.restore();
  }
  if (m.target) {
    const tx = X(m.target.x), ty = Y(m.target.z);
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(-rot); drawPoi(ctx, 0, 0, 'target'); ctx.restore();
  }
  ctx.restore();
  // Spieler: Sichtkegel nach oben, Pfeil zeigt die Laufrichtung relativ zum Blick
  ctx.save();
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); ctx.clip();
  ctx.translate(size / 2, size / 2);
  if (mini) {
    const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.34);
    cone.addColorStop(0, 'rgba(255,240,200,0.5)'); cone.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, size * 0.34, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath(); ctx.fill();
    ctx.rotate(-(m.player.heading - rot));
  } else {
    ctx.translate(X(m.player.x) - size / 2, Y(m.player.z) - size / 2);
    ctx.rotate(-m.player.heading);
  }
  ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(27,20,16,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); ctx.stroke();
  if (mini) {
    // Himmelsrichtungen am Rand drehen mit der Karte
    ctx.font = '800 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Osten liegt in dieser Welt bei −x (rechts, wenn man nach Norden = +z schaut)
    for (const [t, ang, col] of [['N', 0, '#FFD166'], ['O', Math.PI / 2, '#fff'], ['S', Math.PI, '#fff'], ['W', -Math.PI / 2, '#fff']] as const) {
      const rr = size / 2 - 9;
      ctx.fillStyle = col;
      ctx.fillText(t, size / 2 + Math.sin(rot + ang) * rr, size / 2 - Math.cos(rot + ang) * rr);
    }
    ctx.textBaseline = 'alphabetic';
  }
}

/** Zustand der Weltkarte: Mittelpunkt (Weltkoordinaten) und Pixel je Meter */
export interface WorldView { cx: number; cz: number; scale: number }

export interface WorldMapData {
  islands: IslandDef[];
  regions: RegionDef[];
  known: (id: string) => boolean;
  /** Auftragszeichen je Insel ('!' Auftrag, '?' Abgabe) */
  islandMarks: Map<string, 'quest' | 'turnin'>;
  markers: MapMarkers;
  shape?: (id: string) => ShapeLike | undefined;
}

/** Bildschirmposition ↔ Welt (x gespiegelt wie überall) */
export const worldToScreen = (v: WorldView, w: number, h: number, x: number, z: number) => ({ x: w / 2 - (x - v.cx) * v.scale, y: h / 2 - (z - v.cz) * v.scale });
export const screenToWorld = (v: WorldView, w: number, h: number, sx: number, sy: number) => ({ x: v.cx - (sx - w / 2) / v.scale, z: v.cz - (sy - h / 2) / v.scale });

/** Vollbild-Weltkarte: Regionen, alle Inseln (unbekannte als „?“), Spieler, Auftragszeichen, Feinde, Ziel, Schätze */
export function drawWorldMap(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, v: WorldView, d: WorldMapData, selected: string | null) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, '#1F4A66'); g.addColorStop(1, '#0A1A28');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const X = (x: number) => w / 2 - (x - v.cx) * v.scale;
  const Y = (z: number) => h / 2 - (z - v.cz) * v.scale;
  const s = v.scale;
  // Gitternetz alle 500 m (ab genug Zoom)
  ctx.strokeStyle = 'rgba(232,214,170,0.07)'; ctx.lineWidth = 1;
  const step = 500;
  const tl = screenToWorld(v, w, h, 0, 0), br = screenToWorld(v, w, h, w, h);
  for (let gx = Math.ceil(Math.min(tl.x, br.x) / step) * step; gx < Math.max(tl.x, br.x); gx += step) { ctx.beginPath(); ctx.moveTo(X(gx), 0); ctx.lineTo(X(gx), h); ctx.stroke(); }
  for (let gz = Math.ceil(Math.min(tl.z, br.z) / step) * step; gz < Math.max(tl.z, br.z); gz += step) { ctx.beginPath(); ctx.moveTo(0, Y(gz)); ctx.lineTo(w, Y(gz)); ctx.stroke(); }
  // Weltrand
  ctx.strokeStyle = 'rgba(232,214,170,0.6)'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(X(0), Y(0), WORLD_RADIUS * s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  // Regionen: weiche Flächen mit Namen
  for (const r of d.regions) {
    ctx.fillStyle = r.color + '22';
    ctx.beginPath(); ctx.arc(X(r.x), Y(r.z), r.r * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = r.color + '66'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = `800 ${Math.max(12, Math.min(26, r.r * s * 0.16))}px "Alegreya", serif`; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(244,226,184,0.55)';
    ctx.fillText(r.name.toUpperCase(), X(r.x), Y(r.z) - r.r * s * 0.78);
  }
  const showNames = s > 0.045;
  for (const i of d.islands) {
    const known = d.known(i.id);
    drawIsland(ctx, X, Y, s, i, d.shape?.(i.id), known && showNames ? 1 : 0, known);
    if (selected === i.id) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(X(i.x), Y(i.z), Math.max(10, i.r * s * 1.5), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (known && i.kind === 'boss') drawPoi(ctx, X(i.x) + i.r * s * 0.9, Y(i.z) - i.r * s * 0.9, 'boss', 1.1);
    const mk = d.islandMarks.get(i.id);
    if (known && mk) drawPoi(ctx, X(i.x) + Math.max(12, i.r * s * 1.45), Y(i.z), mk, 1.2);
  }
  const m = d.markers;
  for (const dg of m.digs) {
    ctx.strokeStyle = '#FF4A3A'; ctx.lineWidth = 3;
    const x = X(dg.x), y = Y(dg.z);
    ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
  }
  for (const e of m.enemies) drawPoi(ctx, X(e.x), Y(e.z), e.legend ? 'boss' : e.ally ? 'npc' : 'enemy', 1.1);
  if (m.target) drawPoi(ctx, X(m.target.x), Y(m.target.z), 'target', 1.4);
  // Spieler als Pfeil mit weißem Ring
  ctx.save();
  ctx.translate(X(m.player.x), Y(m.player.z));
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
  ctx.rotate(-m.player.heading);
  ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
