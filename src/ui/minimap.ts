import type { IslandDef, RegionDef } from '../data/regions';
import { WORLD_RADIUS } from '../data/world';
import { BERNSTEINSEE } from '../data/regions';
import { FACTIONS, type FactionId } from '../data/factions';

/** Orientierungspunkte: Feinde (rot), Bosse (Totenkopf), Auftragspersonen (! Auftrag, ? Abgabe), Ziel des Auftrags */
/** Zeichen auf Kompass und Karten; seit 4.3C dazu die Horizont-Signale der Welt-Ereignisse und Handelskonvois */
export type PoiKind = 'enemy' | 'boss' | 'quest' | 'turnin' | 'npc' | 'target' | 'fort' | 'citadel' | 'alarm' | 'battle'
  | 'galeone' | 'blockade' | 'flotsam' | 'worldboss' | 'convoy'
  // Begegnungen (4.5C): Schiffbrüchige, Schmuggler-Rendezvous, Schatzsuche, Kriegs-Nachschub
  | 'castaway' | 'smuggler' | 'hunt' | 'supply'
  // Kaiser-Zitadelle (4.5D): Silhouette einer Festung mit drei Türmen und goldener Kaiserkrone darüber
  | 'kaiser'
  // 4.7E: Live-Kriegs-Einsatz des eigenen Teams (Wappenschild mit Funkwellen)
  | 'warquest';
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

export function coastK(c: NonNullable<ShapeLike['coast']>, a: number): number {
  let k = 1;
  for (const w of c) k += w.a * Math.sin(w.f * a + w.p);
  return k;
}

/** Inselumriss: Küstenlinie als Vieleck (24 Punkte reichen für die Karte), sonst Kreis */
export function outline(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (z: number) => number, s: number, i: IslandDef, shape: ShapeLike | undefined, grow: number) {
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
export function ownerRing(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (z: number) => number, s: number, i: IslandDef) {
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
    case 'kaiser': {
      // Kaiser-Zitadelle: Mauer mit Zinnen, zwei Ecktürme und ein hoher Bergfried in der Farbe der Macht, darüber die goldene Kaiserkrone
      ctx.fillStyle = col ?? '#B9A8E8'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-11, 8); ctx.lineTo(-11, -2); ctx.lineTo(-12.5, -2); ctx.lineTo(-12.5, -6); ctx.lineTo(-7.5, -6); ctx.lineTo(-7.5, -2); ctx.lineTo(-9, -2); ctx.lineTo(-9, 1);
      ctx.lineTo(-4, 1); ctx.lineTo(-4, -7); ctx.lineTo(-5.5, -7); ctx.lineTo(-5.5, -11); ctx.lineTo(5.5, -11); ctx.lineTo(5.5, -7); ctx.lineTo(4, -7); ctx.lineTo(4, 1);
      ctx.lineTo(9, 1); ctx.lineTo(9, -2); ctx.lineTo(7.5, -2); ctx.lineTo(7.5, -6); ctx.lineTo(12.5, -6); ctx.lineTo(12.5, -2); ctx.lineTo(11, -2); ctx.lineTo(11, 8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Tor und Zinnenlücken
      ctx.fillStyle = '#1b1410';
      ctx.beginPath(); ctx.moveTo(-2.2, 8); ctx.lineTo(-2.2, 4); ctx.arc(0, 4, 2.2, Math.PI, 0); ctx.lineTo(2.2, 8); ctx.closePath(); ctx.fill();
      ctx.fillRect(-1.6, -10, 1.2, 1.6); ctx.fillRect(0.6, -10, 1.2, 1.6);
      // Krone
      ctx.fillStyle = '#FFD36A'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-6, -13); ctx.lineTo(-6, -19); ctx.lineTo(-3, -15.5); ctx.lineTo(0, -21); ctx.lineTo(3, -15.5); ctx.lineTo(6, -19); ctx.lineTo(6, -13); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#C8322A'; ctx.beginPath(); ctx.arc(0, -15, 1.1, 0, Math.PI * 2); ctx.fill();
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
    case 'castaway': {
      // Schiffbrüchige: Floß mit roter Notruf-Fackel (pulsierend)
      const t = performance.now() / 1000, gl = 0.7 + 0.3 * Math.sin(t * 6);
      ctx.fillStyle = '#8A5A2B'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.2;
      ctx.fillRect(-6, 3, 12, 3.5); ctx.strokeRect(-6, 3, 12, 3.5);
      ctx.strokeStyle = '#9ED8F0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-8, 8); ctx.quadraticCurveTo(-4, 6, 0, 8); ctx.quadraticCurveTo(4, 10, 8, 8); ctx.stroke();
      ctx.strokeStyle = '#E8DCC4'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(2, 3); ctx.lineTo(2, -4); ctx.stroke();
      ctx.fillStyle = cb ? `rgba(255,210,58,${gl})` : `rgba(255,74,58,${gl})`; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(2, -6, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    }
    case 'smuggler': {
      // Schmuggler-Rendezvous: violetter Stern über einer Kiste ohne Siegel
      const t = performance.now() / 1000, gl = 0.75 + 0.25 * Math.sin(t * 4);
      ctx.fillStyle = '#4A3A2A'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.2;
      ctx.fillRect(-5, 1, 10, 6); ctx.strokeRect(-5, 1, 10, 6);
      ctx.fillStyle = `rgba(178,120,255,${gl})`; ctx.strokeStyle = '#E3B04B'; ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let n = 0; n < 10; n++) { const r = n % 2 ? 2 : 5.2; const a = (n / 10) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r - 4); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'hunt': {
      // Schatzsuche: rotes X auf einer Pergamentrolle, darüber ein Spaten
      ctx.fillStyle = '#E8D6AA'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-7, -5); ctx.lineTo(7, -5); ctx.lineTo(7, 6); ctx.lineTo(-7, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = cb ? '#1F6FD0' : '#C0392B'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(3, 4); ctx.moveTo(3, -2); ctx.lineTo(-3, 4); ctx.stroke();
      break;
    }
    case 'supply': {
      // Kriegs-Nachschub: Kiste mit Wimpel in der Farbe der Nation
      ctx.fillStyle = '#8A5A2B'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.2;
      ctx.fillRect(-6, 0, 12, 7); ctx.strokeRect(-6, 0, 12, 7);
      ctx.beginPath(); ctx.moveTo(-6, 3.5); ctx.lineTo(6, 3.5); ctx.stroke();
      ctx.strokeStyle = '#E8DCC4'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-3, -9); ctx.stroke();
      ctx.fillStyle = col ?? '#E3B04B'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-3, -9); ctx.lineTo(5, -6.5); ctx.lineTo(-3, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'convoy': {
      // Handelskonvoi: kleines Segel mit Kiste (bedroht: rot umrandet)
      ctx.fillStyle = '#F4EEDC'; ctx.strokeStyle = col ?? '#1b1410'; ctx.lineWidth = col ? 2 : 1.2;
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 1); ctx.lineTo(0, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8A5A2B'; ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(6, 2); ctx.lineTo(4, 5.5); ctx.lineTo(-4, 5.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'warquest': {
      // 4.7E: Live-Kriegs-Einsatz: Wappenschild in der Farbe des Teams mit Funkwellen, sanft pulsierend
      const pl = 1 + 0.08 * Math.sin(performance.now() / 200);
      ctx.scale(pl, pl);
      ctx.fillStyle = col ?? '#4FD58C'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-6.5, -7); ctx.lineTo(6.5, -7); ctx.lineTo(6.5, 0); ctx.quadraticCurveTo(6.5, 6, 0, 9.5); ctx.quadraticCurveTo(-6.5, 6, -6.5, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#F4EEDC'; ctx.fillStyle = '#F4EEDC'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 3, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 3, 4, -Math.PI * 0.82, -Math.PI * 0.18); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 3, 7, -Math.PI * 0.72, -Math.PI * 0.28); ctx.stroke();
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
  /** Krieg der Mächte (4.5A): Armadas unterwegs, Belagerungen mit Fortschritt, Großschlachten fern vom Spieler (die nahen stehen in `battles`) */
  wars?: {
    /** `tx`/`tz`: Ziel der Armada (Frontlinie, 4.5B) */
    armadas: { x: number; z: number; heading: number; color: string; name: string; ships: number; relief: boolean; tx?: number; tz?: number; kind?: 'angriff' | 'entsatz' | 'patrouille' | 'konvoi' | 'blockade' }[];
    /** `id` = Insel; `points` = Kontrollpunkte als Kurztext (4.5B) */
    sieges: { id?: string; x: number; z: number; r: number; color: string; name: string; progress: number; points?: string }[];
    battles: { x: number; z: number; name: string }[];
    /** Bündnislinien zwischen den Hauptstädten (4.5B): Zweier-Bündnis oder Koalition */
    alliances?: { ax: number; az: number; bx: number; bz: number; color: string; coalition: boolean }[];
    /** Eroberte Inseln (anderer Herr als beim Weltstart): Rahmen in der Farbe des neuen Herrn (4.5B) */
    conquered?: { x: number; z: number; r: number; color: string }[];
    /** 4.7E: Seeblockaden vor Häfen (gestrichelter Ring in der Farbe der Blockademacht) */
    blockades?: { x: number; z: number; r: number; color: string; name: string }[];
  };
  /** 4.7E: Team des Spielers (Macht-Kennung): seine Inseln tragen auf der Karte einen grünen Bündnis-Ring */
  team?: FactionId | null;
  /** 4.7E: laufende Live-Kriegs-Einsätze des Teams (Marker folgen den Einheiten) */
  warQuests?: { x: number; z: number; name: string; color: string; tracked: boolean }[];
  /** 4.7E: Offener Horizont – die Unbekannten Äußeren Meere sind gesichtet (Beschriftung jenseits der Sturmmauer) */
  horizon?: boolean;
  /** Wie oft eine Festungsinsel schon erobert wurde (Insel-ID → Zahl; bleibt auch nach einer Rückeroberung) */
  conquests?: Record<string, number>;
  /** Lebendiges Meer (Phase 4.3C): Welt-Ereignisse, Konvois, Strömungen (Mittellinie flach x, z, …) und Wetterzellen */
  seaEvents?: { x: number; z: number; kind: PoiKind; name: string; color?: string }[];
  convoys?: { x: number; z: number; name: string; threatened: boolean }[];
  currents?: { name: string; pts: number[] }[];
  cells?: { x: number; z: number; r: number; kind: 'gewitter' | 'nebelbank' | 'flaute'; label: string }[];
  /** Kartierte Zonen um Häfen und Leuchttürme (Phase 4.3D); der Entdeckungs-Nebel liegt über allem, was nicht kartiert ist */
  chartZones?: { x: number; z: number; r: number }[];
  /** Liegt eine Hafen-Blockade (Welt-Ereignis) vor dieser Insel? */
  blockaded?: (id: string) => boolean;
  /** Seekarten-Topografie einer Insel (4.3.6): Hügel (Höhenlinien), Stege, Spalten mit Brücken */
  topo?: (id: string) => MapTopo | undefined;
}

/** Topografie für die Seekarte: Hügel und Spalten in Inselkoordinaten, Stege in Weltkoordinaten */
export interface MapTopo {
  hills: readonly { x: number; z: number; r: number; h: number }[];
  piers: readonly { ax: number; az: number; bx: number; bz: number }[];
  rifts: readonly { kind: 'kanal' | 'lava' | 'kluft' | 'sund'; w: number; pts: readonly [number, number][]; cross: readonly [number, number][] }[];
}

/** Bildschirmposition ↔ Welt (x gespiegelt wie überall) */
export const worldToScreen = (v: WorldView, w: number, h: number, x: number, z: number) => ({ x: w / 2 - (x - v.cx) * v.scale, y: h / 2 - (z - v.cz) * v.scale });
export const screenToWorld = (v: WorldView, w: number, h: number, sx: number, sy: number) => ({ x: v.cx - (sx - w / 2) / v.scale, z: v.cz - (sy - h / 2) / v.scale });
