import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type BufferAttribute, type BufferGeometry } from 'three';
import { detailCanvas, texDetail } from './texDetail';

/** Kleiner, fester Zufall, damit Texturen bei jedem Start gleich aussehen */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

let plankCache: CanvasTexture | null = null;

/** Holzplanken in Graustufen (werden über Vertex- oder Materialfarbe eingefärbt) */
export function plankTexture(): CanvasTexture {
  if (plankCache) return plankCache;
  const { c, g } = detailCanvas(256, 256);
  const r = rng(7);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  const rows = 8, h = 256 / rows;
  for (let i = 0; i < rows; i++) {
    // jede Planke etwas anders getönt
    const tone = 220 + Math.floor(r() * 35);
    g.fillStyle = `rgb(${tone},${tone},${tone})`;
    g.fillRect(0, i * h, 256, h);
    // Maserung
    g.strokeStyle = 'rgba(0,0,0,0.07)';
    g.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      const y = i * h + 4 + r() * (h - 8);
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + k) * 1.5);
      g.stroke();
    }
    // Stoßfugen versetzt
    const off = (i % 2) * 64 + Math.floor(r() * 30);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = off; x < 256; x += 128) g.fillRect(x, i * h, 2, h);
    // Nägel
    g.fillStyle = 'rgba(0,0,0,0.3)';
    for (let x = off + 6; x < 256; x += 128) { g.fillRect(x, i * h + 6, 2, 2); g.fillRect(x, i * h + h - 8, 2, 2); }
    // Fuge zwischen den Planken
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.fillRect(0, i * h + h - 2, 256, 2);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = texDetail.aniso;
  plankCache = t;
  return t;
}

/** Segeltuch: Bahnen, Reffreihe, Liektau, Flicken – optional mit Wappen (Leinwand der Flagge) */
export function sailTexture(color: string, emblem: HTMLCanvasElement | null, seed: number): CanvasTexture {
  const { c, g } = detailCanvas(256, 192);
  const r = rng(seed);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 192);
  // Licht von oben, leicht schmutziger Saum unten
  const grad = g.createLinearGradient(0, 0, 0, 192);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(60,40,20,0.16)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 192);
  // Tuchbahnen
  for (let x = 32; x < 256; x += 32) {
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(x - 1, 0, 2, 192);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(x + 1, 0, 1, 192);
  }
  // Reffreihe
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 12; x < 256; x += 16) { g.beginPath(); g.arc(x, 26, 2, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,0.08)';
  g.fillRect(0, 24, 256, 4);
  // Flicken
  for (let k = 0; k < 2; k++) {
    if (r() < 0.35) continue;
    const w = 22 + r() * 26, h = 18 + r() * 22, x = 20 + r() * 200, y = 50 + r() * 110;
    g.fillStyle = r() < 0.5 ? 'rgba(255,240,210,0.22)' : 'rgba(80,60,40,0.14)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.setLineDash([3, 3]);
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    g.setLineDash([]);
  }
  // Wappen in der Mitte
  if (emblem) {
    g.save();
    g.beginPath();
    g.arc(128, 104, 48, 0, Math.PI * 2);
    g.clip();
    g.drawImage(emblem, 128 - 78, 104 - 48, 156, 96);
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(128, 104, 48, 0, Math.PI * 2); g.stroke();
  }
  // Liektau am Rand
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 5;
  g.strokeRect(2, 2, 252, 188);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = texDetail.aniso;
  return t;
}

let crateCache: CanvasTexture | null = null;

/** Frachtkiste: Bretter, Rahmen, Diagonalstrebe, Brandzeichen (Graustufen, über Materialfarbe getönt) */
export function crateTexture(): CanvasTexture {
  if (crateCache) return crateCache;
  const { c, g } = detailCanvas(128, 128);
  const r = rng(11);
  for (let i = 0; i < 4; i++) {
    const tone = 205 + Math.floor(r() * 40);
    g.fillStyle = `rgb(${tone},${tone},${tone})`;
    g.fillRect(0, i * 32, 128, 32);
    g.strokeStyle = 'rgba(0,0,0,0.08)';
    for (let k = 0; k < 3; k++) {
      const y = i * 32 + 5 + r() * 22;
      g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(40, y + 2, 80, y - 2, 128, y + 1); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, i * 32 + 30, 128, 2);
  }
  // Rahmen und Strebe (heller, erhaben)
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(0, 0, 128, 12); g.fillRect(0, 116, 128, 12); g.fillRect(0, 0, 12, 128); g.fillRect(116, 0, 12, 128);
  g.save(); g.translate(64, 64); g.rotate(-Math.PI / 4); g.fillRect(-84, -7, 168, 14); g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
  g.strokeRect(1, 1, 126, 126); g.strokeRect(12, 12, 104, 104);
  g.save(); g.translate(64, 64); g.rotate(-Math.PI / 4); g.strokeRect(-84, -7, 168, 14); g.restore();
  // Nägel in den Ecken
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (const [x, y] of [[5, 5], [121, 5], [5, 121], [121, 121]]) g.fillRect(x, y, 3, 3);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = texDetail.aniso;
  crateCache = t;
  return t;
}

/** Holzbohlen eines Stegs: Plankenrichtung quer zur Länge, eine Bohle ≈ 0,32 m */
export function deckUV(geo: BufferGeometry, width: number, length: number) {
  const uv = geo.getAttribute('uv') as BufferAttribute;
  const n = geo.getAttribute('normal') as BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    // Ober- und Unterseite: v entlang der Länge (8 Bohlen je Kachel)
    if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, uv.getX(i) * (width / 4), uv.getY(i) * (length / 2.56));
    else uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 0.15);
  }
  uv.needsUpdate = true;
}
