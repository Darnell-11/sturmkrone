import type { IslandDef } from '../data/regions';
import { WORLD_RADIUS } from '../data/world';
import { BERNSTEINSEE } from '../data/regions';

export interface MapMarkers {
  player: { x: number; z: number; heading: number };
  enemies: { x: number; z: number; legend?: boolean; ally?: boolean }[];
  target: { x: number; z: number } | null;
  digs: { x: number; z: number }[];
}

const KIND_COLOR: Record<string, string> = { town: '#E3B04B', camp: '#C0503A', boss: '#8A2A3A', quiet: '#6DBB4C', treasure: '#6DBB4C', lighthouse: '#E8E2D4' };

/** Zeichnet Seekarte (rund, um den Spieler) oder Weltkarte (ganz, mit Namen) in ein Canvas. */
export function drawMap(ctx: CanvasRenderingContext2D, size: number, islands: IslandDef[], m: MapMarkers, mode: 'mini' | 'region' | 'world') {
  const dpr = ctx.canvas.width / size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const mini = mode === 'mini';
  const region = mode === 'region';
  const range = mini ? 420 : region ? BERNSTEINSEE.r * 0.82 : WORLD_RADIUS * 1.08;
  const cx = mini ? m.player.x : region ? BERNSTEINSEE.x : 0, cz = mini ? m.player.z : region ? BERNSTEINSEE.z : 0;
  const s = size / 2 / range;
  // x gespiegelt, damit die Karte zur Kamera passt (Blick nach Norden = +z, rechts = −x)
  const X = (x: number) => size / 2 - (x - cx) * s;
  const Y = (z: number) => size / 2 - (z - cz) * s;
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.clip();
  const sea = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  sea.addColorStop(0, '#2F8FB5'); sea.addColorStop(1, '#1A5E85');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, size, size);
  // Weltrand
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(X(0), Y(0), WORLD_RADIUS * s, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  for (const i of islands) {
    ctx.fillStyle = '#F1D9A0';
    ctx.beginPath(); ctx.arc(X(i.x), Y(i.z), Math.max(2, i.r * s * 1.15), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = KIND_COLOR[i.kind] ?? '#6DBB4C';
    ctx.beginPath(); ctx.arc(X(i.x), Y(i.z), Math.max(1.5, i.r * s * 0.7), 0, Math.PI * 2); ctx.fill();
    if (!mini) {
      ctx.font = region ? '700 13px "Alegreya Sans", sans-serif' : '700 10px "Alegreya Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(18,36,60,0.85)';
      ctx.strokeText(i.name, X(i.x), Y(i.z) - i.r * s - 5);
      ctx.fillStyle = '#FFF3C8';
      ctx.fillText(i.name, X(i.x), Y(i.z) - i.r * s - 5);
    }
  }
  for (const d of m.digs) {
    ctx.strokeStyle = '#FF4A3A'; ctx.lineWidth = 2.5;
    const x = X(d.x), y = Y(d.z);
    ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();
  }
  for (const e of m.enemies) {
    ctx.fillStyle = e.ally ? '#7CE07A' : e.legend ? '#FF4AFF' : '#FF5A4A';
    ctx.beginPath(); ctx.arc(X(e.x), Y(e.z), e.legend ? 4 : 3, 0, Math.PI * 2); ctx.fill();
  }
  if (m.target) {
    const tx = X(m.target.x), ty = Y(m.target.z);
    ctx.fillStyle = '#FFD166'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 2.5 : 6; const a = (k / 10) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(tx + Math.cos(a) * r, ty + Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Spieler als Pfeil
  const px = X(m.player.x), py = Y(m.player.z);
  ctx.translate(px, py);
  ctx.rotate(-m.player.heading);
  ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(27,20,16,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); ctx.stroke();
  if (mini) { ctx.fillStyle = '#fff'; ctx.font = '800 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', size / 2, 11); }
}
