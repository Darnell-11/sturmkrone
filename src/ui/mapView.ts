// Ansicht der Weltkarte (Phase 4.3D): Zoom, Verschieben, Klemmung, Klick-oder-Ziehen und überlappungsfreie Beschriftung. Rein (ohne DOM, ohne three.js),
// alles ohne neue Objekte je Aufruf: Ergebnisse gehen in vorbereitete `out`-Felder, der Zeichenweg legt je Bild nichts an.
import { WORLD_RADIUS } from '../data/world';

/** Ansicht: Mittelpunkt (Weltkoordinaten) und Pixel je Meter (gleiche Form wie `WorldView` in minimap.ts) */
export interface MapView { cx: number; cz: number; scale: number }

/** Zoom relativ zur Gesamtansicht (1× = die ganze Welt passt ins Fenster) */
export const MAP_ZOOM_MIN = 0.65;
export const MAP_ZOOM_MAX = 4.5;
/** Ab diesem Zoom erscheinen die kleineren Inselnamen und die Markt-Abzeichen */
export const LABEL_ZOOM = 1.15;
/** Bis zu dieser Strecke (Pixel) vom Berührungspunkt zählt eine Geste als Klick (Inselwahl), darüber als Verschieben */
export const CLICK_SLOP = 5;
/** Halbe Kantenlänge der Karte (Meter): die Welt samt Rand */
export const MAP_EXTENT = WORLD_RADIUS * 1.08;

/** Pixel je Meter bei 1× (die ganze Welt passt in die kürzere Fensterseite) */
export const fitScale = (w: number, h: number): number => Math.min(w, h) / 2 / MAP_EXTENT;
export const zoomOf = (v: MapView, w: number, h: number): number => v.scale / fitScale(w, h);
export const scaleOfZoom = (zoom: number, w: number, h: number): number => Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, zoom)) * fitScale(w, h);

/**
 * Ansicht in die Grenzen zwingen: Zoom 0,65× … 4,5×. Ist die Karte in einer Richtung größer als das Fenster, bleibt das Fenster ganz auf der Karte. Ist sie
 * kleiner (oder etwa gleich groß), darf sie im Fenster wandern, aber höchstens zur Hälfte hinaus – so stimmt der Zoom um den Zeiger auch bei kleinem Zoom.
 */
export function clampView(v: MapView, w: number, h: number): MapView {
  const f = fitScale(w, h);
  v.scale = Math.max(MAP_ZOOM_MIN * f, Math.min(MAP_ZOOM_MAX * f, v.scale));
  const lx = panLimit(w / 2 / v.scale);
  const lz = panLimit(h / 2 / v.scale);
  v.cx = Math.max(-lx, Math.min(lx, v.cx));
  v.cz = Math.max(-lz, Math.min(lz, v.cz));
  return v;
}

/** Größter Abstand der Fenstermitte von der Kartenmitte bei halber Fensterbreite `half` (Meter) */
export const panLimit = (half: number): number => (half <= MAP_EXTENT ? Math.max(MAP_EXTENT - half, half * 0.5) : Math.max(half - MAP_EXTENT, MAP_EXTENT * 0.5));

/** Bildschirm → Welt (x gespiegelt wie überall im Spiel); `out` wird gefüllt */
export function screenToWorldInto(v: MapView, w: number, h: number, sx: number, sy: number, out: { x: number; z: number }): { x: number; z: number } {
  out.x = v.cx - (sx - w / 2) / v.scale;
  out.z = v.cz - (sy - h / 2) / v.scale;
  return out;
}

/** Welt → Bildschirm; `out` wird gefüllt */
export function worldToScreenInto(v: MapView, w: number, h: number, x: number, z: number, out: { x: number; y: number }): { x: number; y: number } {
  out.x = w / 2 - (x - v.cx) * v.scale;
  out.y = h / 2 - (z - v.cz) * v.scale;
  return out;
}

const _p = { x: 0, z: 0 };

/** Zoomen um den Faktor `f`, der Punkt unter (sx, sy) bleibt dort (Mausrad: Zeiger, Pinch: Mitte der Finger, Knöpfe: Fenstermitte) */
export function zoomAtPoint(v: MapView, w: number, h: number, sx: number, sy: number, f: number): MapView {
  screenToWorldInto(v, w, h, sx, sy, _p);
  const bx = _p.x, bz = _p.z;
  const fit = fitScale(w, h);
  v.scale = Math.max(MAP_ZOOM_MIN * fit, Math.min(MAP_ZOOM_MAX * fit, v.scale * f));
  v.cx = bx + (sx - w / 2) / v.scale;
  v.cz = bz + (sy - h / 2) / v.scale;
  return clampView(v, w, h);
}

/** Karte um (dx, dy) Pixel mit dem Finger oder der Maus schieben */
export function panByPixels(v: MapView, w: number, h: number, dx: number, dy: number): MapView {
  v.cx += dx / v.scale;
  v.cz += dy / v.scale;
  return clampView(v, w, h);
}

/** Auf einen Weltpunkt zentrieren (optional mit neuem Zoom, sonst der jetzige) */
export function centerOn(v: MapView, w: number, h: number, x: number, z: number, zoom?: number): MapView {
  if (zoom !== undefined) v.scale = scaleOfZoom(zoom, w, h);
  v.cx = x; v.cz = z;
  return clampView(v, w, h);
}

/** Gesamtansicht (1×, Mitte der Welt) */
export function fitAll(v: MapView, w: number, h: number): MapView {
  v.cx = 0; v.cz = 0; v.scale = fitScale(w, h);
  return clampView(v, w, h);
}

// ---------- Klick oder Ziehen ----------

export interface DragState { sx: number; sy: number; lx: number; ly: number; panning: boolean; active: boolean }
export const newDrag = (): DragState => ({ sx: 0, sy: 0, lx: 0, ly: 0, panning: false, active: false });

export function dragStart(d: DragState, x: number, y: number): void {
  d.sx = x; d.sy = y; d.lx = x; d.ly = y; d.panning = false; d.active = true;
}

/**
 * Zeiger bewegt: liegt er noch innerhalb von `CLICK_SLOP` Pixeln um den Berührungspunkt, bleibt es ein Klick (Karte rührt sich nicht). Sobald er die Schwelle
 * überschreitet, wird verschoben – ab dann bis zum Loslassen, auch wenn der Zeiger zurückkehrt. Die Verschiebung dieses Schritts steht in `out`.
 */
export function dragMove(d: DragState, x: number, y: number, out: { dx: number; dy: number }): boolean {
  out.dx = 0; out.dy = 0;
  if (!d.active) return false;
  if (!d.panning) {
    if (Math.hypot(x - d.sx, y - d.sy) <= CLICK_SLOP) return false;
    d.panning = true;
    // der Weg bis zur Schwelle geht nicht verloren: es wird vom Berührungspunkt an geschoben
    d.lx = d.sx; d.ly = d.sy;
  }
  out.dx = x - d.lx; out.dy = y - d.ly;
  d.lx = x; d.ly = y;
  return true;
}

/** Loslassen: war es ein Klick (nie verschoben)? */
export function dragEnd(d: DragState): boolean {
  const click = d.active && !d.panning;
  d.active = false; d.panning = false;
  return click;
}

// ---------- Beschriftung ohne Überlappung ----------

/** Wahrscheinlichkeit der Beschriftung: Rang 3 (Städte, Festungen, Hauptquartier) immer, Rang 2 (Häfen, Bosse, Leuchttürme) und 1 erst ab `LABEL_ZOOM` */
export type LabelRank = 1 | 2 | 3;

/** Werden Namen dieses Ranges bei diesem Zoom gezeigt? Kleinere Inselnamen und Markt-Abzeichen erst ab 1,15× */
export const labelShown = (rank: LabelRank, zoom: number): boolean => rank >= 3 || zoom >= LABEL_ZOOM;

/** Rechteckspeicher für bereits gesetzte Beschriftungen eines Bildes (feste Größe, kein Wachstum) */
export class LabelPlacer {
  private readonly r: Float32Array;
  n = 0;
  constructor(readonly cap = 256) { this.r = new Float32Array(cap * 4); }
  clear(): void { this.n = 0; }
  /** Rechteck setzen, wenn es kein gesetztes berührt (`pad` Pixel Luft); false = überlappt oder Speicher voll */
  tryPlace(x0: number, y0: number, x1: number, y1: number, pad = 2): boolean {
    if (this.n >= this.cap) return false;
    const r = this.r;
    for (let i = 0; i < this.n; i++) {
      const o = i * 4;
      if (x0 < r[o + 2] + pad && x1 > r[o] - pad && y0 < r[o + 3] + pad && y1 > r[o + 1] - pad) return false;
    }
    const o = this.n * 4;
    r[o] = x0; r[o + 1] = y0; r[o + 2] = x1; r[o + 3] = y1;
    this.n++;
    return true;
  }
  /** Ist das Rechteck frei (ohne es zu setzen)? */
  free(x0: number, y0: number, x1: number, y1: number, pad = 2): boolean {
    const r = this.r;
    for (let i = 0; i < this.n; i++) {
      const o = i * 4;
      if (x0 < r[o + 2] + pad && x1 > r[o] - pad && y0 < r[o + 3] + pad && y1 > r[o + 1] - pad) return false;
    }
    return true;
  }
  /** Rechteck für Tests: i-tes gesetztes (x0, y0, x1, y1) */
  at(i: number, out: number[]): number[] { const o = i * 4; out[0] = this.r[o]; out[1] = this.r[o + 1]; out[2] = this.r[o + 2]; out[3] = this.r[o + 3]; return out; }
}

/** Breite eines Textes, einmal gemessen und gemerkt (kein Messobjekt und kein neuer Text je Bild): Schrift → Text → Breite */
export class TextWidths {
  private readonly m = new Map<string, Map<string, number>>();
  /** `ctx.font` muss schon auf `font` stehen; gemessen wird nur beim ersten Mal */
  get(ctx: { measureText(t: string): { width: number } }, font: string, text: string): number {
    let by = this.m.get(font);
    if (!by) { by = new Map(); this.m.set(font, by); }
    let w = by.get(text);
    if (w === undefined) { w = ctx.measureText(text).width; by.set(text, w); }
    return w;
  }
}
