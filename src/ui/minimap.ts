import type { IslandDef, RegionDef } from '../data/regions';
import { WORLD_RADIUS } from '../data/world';
import { BERNSTEINSEE } from '../data/regions';
import { BORDERS, FACTIONS, SECTORS, type FactionId } from '../data/factions';

/** Orientierungspunkte: Feinde (rot), Bosse (Totenkopf), Auftragspersonen (! Auftrag, ? Abgabe), Ziel des Auftrags */
/** Zeichen auf Kompass und Karten; seit 4.3C dazu die Horizont-Signale der Welt-Ereignisse und Handelskonvois */
export type PoiKind = 'enemy' | 'boss' | 'quest' | 'turnin' | 'npc' | 'target' | 'fort' | 'citadel' | 'alarm' | 'battle'
  | 'galeone' | 'blockade' | 'flotsam' | 'worldboss' | 'convoy';
export interface Poi { x: number; z: number; kind: PoiKind; name?: string; /** Farbe der Macht (Grenzfestung, Endgame-Festung) */ color?: string }

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

const KIND_COLOR: Record<string, string> = { town: '#E3B04B', camp: '#C0503A', boss: '#8A2A3A', quiet: '#5E9450', treasure: '#5E9450', lighthouse: '#E8E2D4', ruin: '#8A8A98', harbor: '#E3B04B', marinefort: '#D8E4F4', citadel: '#8A2A3A' };

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

/** Ring in der Farbe der Besitzmacht um eine Insel (gestrichelt bei Kolonien in fremdem Kuchenstück) */
function ownerRing(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (z: number) => number, s: number, i: IslandDef) {
  const f = i.factionId ? FACTIONS[i.factionId] : null;
  if (!f) return;
  ctx.strokeStyle = f.color;
  ctx.lineWidth = i.kind === 'citadel' || i.marine ? 3.2 : 2.2;
  if (i.exclave) ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.arc(X(i.x), Y(i.z), Math.max(6, i.r * s * 1.55), 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
}

/** Eine Insel mit Brandungsring, Sand, Grün und (auf großen Karten) Namen */
function drawIsland(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (z: number) => number, s: number, i: IslandDef, shape: ShapeLike | undefined, label: 0 | 1 | 2, known = true) {
  if (!known) {
    ctx.strokeStyle = 'rgba(232,214,170,0.35)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(X(i.x), Y(i.z), Math.max(4, i.r * s), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(232,214,170,0.5)'; ctx.font = '800 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', X(i.x), Y(i.z) + 4);
    ownerRing(ctx, X, Y, s, i);
    return;
  }
  // Flachwasser-Ring, Sand, Landfläche: die echte Form (Küstenlinie)
  ctx.fillStyle = 'rgba(94,180,196,0.35)';
  outline(ctx, X, Y, s, i, shape, 1.28); ctx.fill();
  ctx.fillStyle = '#F1D9A0';
  outline(ctx, X, Y, s, i, shape, 1); ctx.fill();
  ctx.fillStyle = KIND_COLOR[i.kind] ?? '#6DBB4C';
  outline(ctx, X, Y, s, i, shape, 0.7); ctx.fill();
  ownerRing(ctx, X, Y, s, i);
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
export function drawPoi(ctx: CanvasRenderingContext2D, x: number, y: number, kind: PoiKind, k = 1, col?: string) {
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
    case 'alarm': {
      // Rückeroberungs-Flotte: pulsierendes rotes Warndreieck mit Ausrufezeichen
      const p = 1 + 0.12 * Math.sin(performance.now() / 160);
      ctx.scale(p, p);
      ctx.fillStyle = '#FF3A2A'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(8, 6); ctx.lineTo(-8, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#FFF3C8'; ctx.font = '900 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, 1.5); ctx.textBaseline = 'alphabetic';
      break;
    }
    case 'battle': {
      // Seeschlacht: zwei gekreuzte Kanonenrohre mit flackerndem Mündungsfeuer in einem dunklen Medaillon mit pulsierendem Ring
      const t = performance.now() / 1000;
      const pl = 1 + 0.1 * Math.sin(t * 7);
      ctx.scale(pl, pl);
      ctx.fillStyle = 'rgba(34,20,14,0.92)'; ctx.strokeStyle = cb ? '#FFD23A' : '#FF8A3A'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (const sgn of [-1, 1]) {
        ctx.save(); ctx.rotate(sgn * 0.8);
        ctx.fillStyle = '#D9D2C4'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-2.1, 6); ctx.lineTo(-1.3, -6); ctx.lineTo(1.3, -6); ctx.lineTo(2.1, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#7A7468'; ctx.fillRect(-2.4, 4, 4.8, 2.2);
        // Mündungsblitz, abwechselnd an beiden Rohren
        if (Math.sin(t * 17 + (sgn > 0 ? 0 : 2.4)) > 0.1) {
          ctx.fillStyle = '#FFE066'; ctx.strokeStyle = '#FF6A1F'; ctx.lineWidth = 0.8;
          ctx.beginPath();
          for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, rr = k % 2 ? 1.8 : 4; ctx.lineTo(Math.sin(a) * rr, -8 - Math.cos(a) * rr * 0.9); }
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
      break;
    }
    case 'npc':
      ctx.fillStyle = '#9ED0E8'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 2.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 'fort': {
      // Marine-Grenzfestung: weißer Schild mit blauem Anker
      ctx.fillStyle = '#F4F7FC'; ctx.strokeStyle = '#16306A'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(6, 1); ctx.quadraticCurveTo(5, 6, 0, 8); ctx.quadraticCurveTo(-5, 6, -6, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#16306A'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.moveTo(-2.4, -2); ctx.lineTo(2.4, -2); ctx.moveTo(-3.4, 1); ctx.quadraticCurveTo(0, 6.5, 3.4, 1); ctx.stroke();
      break;
    }
    case 'citadel': {
      // Endgame-Festung: Krone in der Farbe der Macht
      ctx.fillStyle = col ?? '#E3B04B'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-8, 5); ctx.lineTo(-8, -4); ctx.lineTo(-4, 0); ctx.lineTo(0, -7); ctx.lineTo(4, 0); ctx.lineTo(8, -4); ctx.lineTo(8, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#F4EEDC'; ctx.fillRect(-8, 5, 16, 2.6); ctx.strokeRect(-8, 5, 16, 2.6);
      break;
    }
    case 'galeone': {
      // Schatz-Galeone: goldene Leuchtrakete mit Strahlenkranz
      const t = performance.now() / 1000, gl = 0.75 + 0.25 * Math.sin(t * 5);
      ctx.strokeStyle = `rgba(255,214,110,${gl})`; ctx.lineWidth = 1.4;
      for (let n = 0; n < 8; n++) { const a = (n / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5 - 2); ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9 - 2); ctx.stroke(); }
      ctx.fillStyle = '#FFD24A'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(0, -2, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#E3B04B'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, 9); ctx.stroke();
      break;
    }
    case 'blockade': {
      // Hafen-Blockade: schwarze Rauchfahne über einer roten Sperrlinie
      ctx.fillStyle = '#1E1A20'; ctx.strokeStyle = '#F4EEDC'; ctx.lineWidth = 1;
      for (const [x, y, r] of [[0, 2, 3.6], [2.5, -2.5, 3.2], [-1.5, -6, 2.8], [1.5, -9, 2.2]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.strokeStyle = cb ? '#FFD23A' : '#FF4A3A'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-7, 7); ctx.lineTo(7, 7); ctx.stroke();
      break;
    }
    case 'flotsam': {
      // Treibgut: Kiste auf Wellen, darüber zwei Möwen
      ctx.fillStyle = '#8A5A2B'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.2;
      ctx.fillRect(-4, -1, 8, 6); ctx.strokeRect(-4, -1, 8, 6);
      ctx.strokeStyle = '#9ED8F0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-8, 6); ctx.quadraticCurveTo(-4, 3.5, 0, 6); ctx.quadraticCurveTo(4, 8.5, 8, 6); ctx.stroke();
      ctx.strokeStyle = '#F4EEDC'; ctx.lineWidth = 1.3;
      for (const [x, y] of [[-4, -6], [3, -8]]) { ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.quadraticCurveTo(x - 1.5, y - 2, x, y); ctx.quadraticCurveTo(x + 1.5, y - 2, x + 3, y); ctx.stroke(); }
      break;
    }
    case 'worldboss': {
      // Weltboss: Gewitterwirbel mit Blitz
      const t = performance.now() / 1000;
      ctx.save(); ctx.rotate(t * 1.5);
      ctx.strokeStyle = '#B8C4D8'; ctx.lineWidth = 1.8;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, 4 + k * 2.6, k * 2.1, k * 2.1 + 3.6); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = '#FFE066'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(1, -7); ctx.lineTo(-3, 1); ctx.lineTo(0, 1); ctx.lineTo(-1.5, 7); ctx.lineTo(3.5, -1.5); ctx.lineTo(0.5, -1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'convoy': {
      // Handelskonvoi: kleines Segel mit Kiste (bedroht: rot umrandet)
      ctx.fillStyle = '#F4EEDC'; ctx.strokeStyle = col ?? '#1b1410'; ctx.lineWidth = col ? 2 : 1.2;
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 1); ctx.lineTo(0, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8A5A2B'; ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(6, 2); ctx.lineTo(4, 5.5); ctx.lineTo(-4, 5.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
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
    ctx.save(); ctx.translate(x, y); ctx.rotate(-rot); drawPoi(ctx, 0, 0, p.kind, mini ? 0.9 : 1, p.color); ctx.restore();
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
  /** Ansehen bei den Weltmächten (Spielstand), für die Haltung der Marine im Inselfenster */
  standing?: Partial<Record<FactionId, number>>;
  /** Besetzte Festungsinseln (Spieler-Flagge, Countdown); im Endspurt mit der Lage der Rückeroberungs-Flotte */
  /** Laufende Seeschlachten an den Grenzen (Mitte, beteiligte Mächte, Überlebende je Seite) */
  battles?: { id: number; x: number; z: number; a: FactionId; b: FactionId; left: [number, number] }[];
  occupations?: { id: string; x: number; z: number; r: number; name: string; text: string; endgame: boolean; fleet?: { x: number; z: number } }[];
  /** Wie oft eine Festungsinsel schon erobert wurde (Insel-ID → Zahl; bleibt auch nach einer Rückeroberung) */
  conquests?: Record<string, number>;
  /** Lebendiges Meer (Phase 4.3C): Welt-Ereignisse, Konvois, Strömungen (Mittellinie flach x, z, …) und Wetterzellen */
  seaEvents?: { x: number; z: number; kind: PoiKind; name: string }[];
  convoys?: { x: number; z: number; name: string; threatened: boolean }[];
  currents?: { name: string; pts: number[] }[];
  cells?: { x: number; z: number; r: number; kind: 'gewitter' | 'nebelbank' | 'flaute'; label: string }[];
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
  // Die fünf Kuchenstücke (je 72°) in der Farbe ihrer Macht, darunter die Kernzone der Bernsteinsee
  for (const sec of SECTORS) {
    const a0 = (sec.fromDeg * Math.PI) / 180, a1 = (sec.toDeg * Math.PI) / 180;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0));
    for (let k = 0; k <= 28; k++) { const a = a0 + ((a1 - a0) * k) / 28; ctx.lineTo(X(Math.sin(a) * WORLD_RADIUS), Y(Math.cos(a) * WORLD_RADIUS)); }
    ctx.closePath();
    ctx.fillStyle = FACTIONS[sec.factionId].color + '24'; ctx.fill();
  }
  // Grenzlinien: die Marine hält sie (weiß gestrichelt, von der Mitte bis zum Weltrand)
  ctx.strokeStyle = 'rgba(236,243,255,0.6)'; ctx.setLineDash([10, 7]); ctx.lineWidth = 2;
  for (const b of BORDERS) {
    const a = (b.deg * Math.PI) / 180;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(Math.sin(a) * WORLD_RADIUS), Y(Math.cos(a) * WORLD_RADIUS)); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const r of d.regions) {
    if (r.id === 'bernsteinsee') {
      ctx.fillStyle = r.color + '1e';
      ctx.beginPath(); ctx.arc(X(r.x), Y(r.z), r.r * s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = r.color + '77'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.font = `800 ${Math.max(12, Math.min(26, r.r * s * 0.16))}px "Alegreya", serif`; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(244,226,184,0.55)';
    ctx.fillText(r.name.toUpperCase(), X(r.x), Y(r.z) - r.r * s * 0.78);
  }
  // Namen der Mächte entlang der Mittellinie jedes Kuchenstücks, nahe am Rand
  for (const sec of SECTORS) {
    const f = FACTIONS[sec.factionId], a = (((sec.fromDeg + sec.toDeg) / 2) * Math.PI) / 180;
    const px = X(Math.sin(a) * WORLD_RADIUS * 0.7), py = Y(Math.cos(a) * WORLD_RADIUS * 0.7);
    ctx.font = `900 ${Math.max(13, Math.min(34, WORLD_RADIUS * s * 0.06))}px "Alegreya", serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,16,28,0.7)'; ctx.strokeText(f.name.toUpperCase(), px, py); ctx.fillStyle = f.color; ctx.fillText(f.name.toUpperCase(), px, py);
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
    // Marine-Grenzfestungen und die sechs großen Außenfestungen sind immer zu sehen (auch unentdeckt): Wahrzeichen der Weltordnung
    if (i.kind === 'marinefort' || i.kind === 'citadel') {
      const f = i.factionId ? FACTIONS[i.factionId] : null;
      const big = i.kind === 'citadel' || i.marine === 'hq';
      drawPoi(ctx, X(i.x), Y(i.z) - Math.max(14, i.r * s * 1.9), big && i.marine !== 'hq' ? 'citadel' : i.marine === 'hq' ? 'citadel' : 'fort', big ? 1.5 : 1.2, i.marine === 'hq' ? '#F4F7FC' : f?.color);
      if (!known || !showNames) {
        ctx.font = `800 ${big ? 13 : 11}px "Alegreya Sans", sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,16,28,0.85)';
        const ly = Y(i.z) - Math.max(14, i.r * s * 1.9) - 14;
        ctx.strokeText(i.name, X(i.x), ly); ctx.fillStyle = '#FFF3C8'; ctx.fillText(i.name, X(i.x), ly);
      }
    }
    const mk = d.islandMarks.get(i.id);
    if (known && mk) drawPoi(ctx, X(i.x) + Math.max(12, i.r * s * 1.45), Y(i.z), mk, 1.2);
  }
  // Besetzte Inseln: goldener Ring mit Fahne und Countdown; im Endspurt pulsiert er rot, die Flotte läuft als Warnzeichen auf die Insel zu
  for (const o of d.occupations ?? []) {
    const x = X(o.x), y = Y(o.z), rr = Math.max(13, o.r * s * 1.5), t = performance.now() / 1000;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = o.endgame ? `rgba(255,${Math.round(80 + 60 * Math.sin(t * 6))},50,0.95)` : 'rgba(227,176,75,0.95)';
    ctx.setLineDash(o.endgame ? [5, 4] : []);
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // Fahne
    ctx.strokeStyle = '#1b1410'; ctx.fillStyle = '#E3B04B'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 2, y - rr - 16); ctx.lineTo(x - 2, y - rr + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 2, y - rr - 16); ctx.lineTo(x + 12, y - rr - 11); ctx.lineTo(x - 2, y - rr - 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = '800 12px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center';
    const label = o.endgame ? `⚠ ${o.text}` : o.text;
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(8,16,28,0.9)'; ctx.strokeText(label, x, y + rr + 15);
    ctx.fillStyle = o.endgame ? '#FF8A6A' : '#FFE3A0'; ctx.fillText(label, x, y + rr + 15);
    ctx.restore();
    if (o.fleet) { ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,90,60,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(o.fleet.x), Y(o.fleet.z)); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]); drawPoi(ctx, X(o.fleet.x), Y(o.fleet.z), 'alarm', 1.5); }
  }
  // Meeresströmungen: blaue Bänder mit Pfeilen in Fließrichtung, Name in der Mitte
  for (const c of d.currents ?? []) {
    if (c.pts.length < 4) continue;
    ctx.save();
    ctx.strokeStyle = 'rgba(140,220,255,0.55)'; ctx.lineWidth = Math.max(2, 120 * v.scale); ctx.lineCap = 'round'; ctx.setLineDash([10, 7]);
    ctx.beginPath();
    for (let k = 0; k < c.pts.length; k += 2) { const x = X(c.pts[k]), y = Y(c.pts[k + 1]); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(190,240,255,0.9)';
    const n = c.pts.length / 2;
    for (let k = Math.floor(n / 6); k < n - 1; k += Math.max(4, Math.floor(n / 4))) {
      const x0 = X(c.pts[k * 2]), y0 = Y(c.pts[k * 2 + 1]), x1 = X(c.pts[k * 2 + 2]), y1 = Y(c.pts[k * 2 + 3]);
      const a = Math.atan2(y1 - y0, x1 - x0);
      ctx.save(); ctx.translate(x0, y0); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (v.scale > 0.06) {
      const mid = Math.floor(n / 2);
      ctx.font = '700 11px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,16,28,0.85)'; ctx.strokeText(c.name, X(c.pts[mid * 2]), Y(c.pts[mid * 2 + 1]) - 9);
      ctx.fillStyle = '#BFEFFF'; ctx.fillText(c.name, X(c.pts[mid * 2]), Y(c.pts[mid * 2 + 1]) - 9);
    }
    ctx.restore();
  }
  // Wetterzellen: dunkle (Gewitter), weiße (Nebel) oder helle gestrichelte (Flaute) Kreise
  for (const c of d.cells ?? []) {
    const x = X(c.x), y = Y(c.z), rr = Math.max(6, c.r * v.scale);
    ctx.save();
    ctx.fillStyle = c.kind === 'gewitter' ? 'rgba(40,46,60,0.35)' : c.kind === 'nebelbank' ? 'rgba(230,236,240,0.25)' : 'rgba(255,240,200,0.12)';
    ctx.strokeStyle = c.kind === 'gewitter' ? 'rgba(120,130,160,0.8)' : c.kind === 'nebelbank' ? 'rgba(240,244,248,0.7)' : 'rgba(255,230,170,0.6)';
    ctx.lineWidth = 1.5; if (c.kind === 'flaute') ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    if (rr > 14) { ctx.font = '700 11px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(235,240,248,0.9)'; ctx.fillText(c.label, x, y + 4); }
    ctx.restore();
  }
  // Handelskonvois und Welt-Ereignisse
  for (const c of d.convoys ?? []) drawPoi(ctx, X(c.x), Y(c.z), 'convoy', 1.1, c.threatened ? '#FF4A3A' : undefined);
  for (const e of d.seaEvents ?? []) {
    const x = X(e.x), y = Y(e.z);
    drawPoi(ctx, x, y, e.kind, 1.5);
    ctx.font = '800 12px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(8,16,28,0.9)'; ctx.strokeText(e.name, x, y + 22);
    ctx.fillStyle = e.kind === 'worldboss' ? '#FF9A8A' : e.kind === 'galeone' ? '#FFE07A' : '#F4EEDC'; ctx.fillText(e.name, x, y + 22);
  }
  // Seeschlachten: gekreuzte Kanonen auf pulsierendem Ring, darunter „Macht ⚔ Macht“ in ihren Farben
  for (const b of d.battles ?? []) {
    const x = X(b.x), y = Y(b.z), t = performance.now() / 1000, rr = 20 + 3 * Math.sin(t * 5);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,138,58,0.85)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    drawPoi(ctx, x, y, 'battle', 1.5);
    const A = FACTIONS[b.a], B = FACTIONS[b.b];
    ctx.font = '800 12px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center';
    const txt = `Seeschlacht ${A.name} ⚔ ${B.name} (${b.left[0]}:${b.left[1]})`;
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(8,16,28,0.9)'; ctx.strokeText(txt, x, y + rr + 15);
    ctx.fillStyle = '#FFB070'; ctx.fillText(txt, x, y + rr + 15);
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
