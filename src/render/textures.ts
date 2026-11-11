import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type BufferAttribute, type BufferGeometry } from 'three';
import { detailCanvas, texDetail } from './texDetail';
import { markShared } from './dispose';

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
  plankCache = markShared(t);
  return t;
}

let oakCache: CanvasTexture | null = null;

/** Dunkles, verwittertes Eichenholz (Graustufen): Planken mit tiefen Rillen, langer Maserung, Astlöchern, Salzstreifen und Nägeln */
export function oakTexture(): CanvasTexture {
  if (oakCache) return oakCache;
  const { c, g } = detailCanvas(256, 256);
  const r = rng(31);
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, 256, 256);
  const rows = 6, h = 256 / rows;
  for (let i = 0; i < rows; i++) {
    const tone = 128 + Math.floor(r() * 44);
    g.fillStyle = `rgb(${tone},${tone},${tone})`;
    g.fillRect(0, i * h, 256, h);
    // lange, leicht gewellte Maserung mit kräftigen Rillen
    for (let k = 0; k < 8; k++) {
      const y = i * h + 2 + r() * (h - 4);
      const dark = r() < 0.35;
      g.strokeStyle = dark ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.035)";
      g.lineWidth = dark ? 1.4 : 1;
      g.beginPath();
      g.moveTo(0, y);
      const ph = r() * 6, amp = 0.8 + r() * 1.8;
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.045 + ph) * amp);
      g.stroke();
    }
    // Astloch
    if (r() < 0.55) {
      const kx = 20 + r() * 216, ky = i * h + h * 0.5;
      g.fillStyle = 'rgba(0,0,0,0.38)';
      g.beginPath(); g.ellipse(kx, ky, 6 + r() * 4, 3 + r() * 2, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(kx, ky, 11, 6, 0, 0, Math.PI * 2); g.stroke();
    }
    // Stoßfugen und Nägel
    const off = (i % 2) * 64 + Math.floor(r() * 30);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    for (let x = off; x < 256; x += 128) g.fillRect(x, i * h, 2, h);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (let x = off + 6; x < 256; x += 128) { g.fillRect(x, i * h + 6, 3, 3); g.fillRect(x, i * h + h - 9, 3, 3); }
    // tiefe Fuge
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, i * h + h - 3, 256, 3);
  }
  // Salz- und Wasserstreifen
  // kurze, sehr schwache Salzfahnen statt durchgehender weißer Striche (die sahen von weitem wie Streifen auf Deck und Rumpf aus)
  for (let k = 0; k < 14; k++) {
    g.fillStyle = `rgba(255,248,235,${0.012 + r() * 0.02})`;
    const len = 14 + r() * 46;
    g.fillRect(r() * 256, r() * (256 - len), 2 + r() * 4, len);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = texDetail.aniso;
  oakCache = markShared(t);
  return t;
}

/** Segeltuch: Bahnen mit Nähten, zwei Reffbänder mit Reffbändseln, Liektau-Rand, Ösen, Flecken, Wetterspuren – optional mit Wappen */
export function sailTexture(color: string, emblem: HTMLCanvasElement | null, seed: number, tattered = false): CanvasTexture {
  const W = 512, H = 384;
  const { c, g } = detailCanvas(W, H);
  const r = rng(seed);
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  // Bahnen: jede etwas anders getönt, mit feinem Gewebe
  const panels = 8, pw = W / panels;
  for (let i = 0; i < panels; i++) {
    const t = r();
    g.fillStyle = t < 0.5 ? `rgba(255,248,230,${0.03 + r() * 0.07})` : `rgba(70,50,30,${0.02 + r() * 0.05})`;
    g.fillRect(i * pw, 0, pw, H);
  }
  g.globalAlpha = 0.07;
  g.strokeStyle = '#000';
  g.lineWidth = 1;
  for (let y = 0; y < H; y += 3) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  g.strokeStyle = '#fff';
  for (let x = 0; x < W; x += 4) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
  g.globalAlpha = 1;
  // Licht von oben, Schmutz und Salz zum Saum, Bauchschatten in der Mitte nach unten
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(255,255,255,0.14)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(70,48,26,0.24)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Nähte (genäht: gestrichelte Doppellinie)
  for (let x = pw; x < W; x += pw) {
    g.fillStyle = 'rgba(0,0,0,0.13)';
    g.fillRect(x - 1, 0, 2, H);
    g.strokeStyle = 'rgba(60,40,20,0.4)';
    g.lineWidth = 1.2;
    g.setLineDash([5, 4]);
    for (const dx of [-4, 4]) { g.beginPath(); g.moveTo(x + dx, 0); g.lineTo(x + dx, H); g.stroke(); }
    g.setLineDash([]);
  }
  // Zwei Reffbänder (doppelt genäht) mit Reffbändseln
  for (const by of [H * 0.3, H * 0.62]) {
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, by - 7, W, 14);
    g.strokeStyle = 'rgba(55,38,20,0.5)';
    g.lineWidth = 1.4;
    g.setLineDash([6, 4]);
    for (const dy of [-6, 6]) { g.beginPath(); g.moveTo(0, by + dy); g.lineTo(W, by + dy); g.stroke(); }
    g.setLineDash([]);
    for (let x = 22; x < W; x += 34) {
      g.fillStyle = 'rgba(50,34,18,0.75)';
      g.fillRect(x - 1.5, by - 3, 3, 22 + r() * 8);
      g.beginPath(); g.arc(x, by, 3.2, 0, Math.PI * 2); g.fill();
    }
  }
  // Wetterspuren: Wasserflecken, Schimmel an den unteren Ecken, ausgeblichene Streifen
  for (let k = 0; k < 5; k++) {
    const x = r() * W, y = H * (0.55 + r() * 0.45), rad = 24 + r() * 50;
    const rg = g.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, `rgba(90,66,40,${0.10 + r() * 0.10})`);
    rg.addColorStop(1, 'rgba(90,66,40,0)');
    g.fillStyle = rg;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (const cx of [0, W]) {
    const rg = g.createRadialGradient(cx, H, 0, cx, H, 110);
    rg.addColorStop(0, 'rgba(70,86,50,0.22)');
    rg.addColorStop(1, 'rgba(70,86,50,0)');
    g.fillStyle = rg;
    g.fillRect(cx - 110, H - 110, 220, 110);
  }
  for (let k = 0; k < 3; k++) {
    g.fillStyle = `rgba(255,250,235,${0.05 + r() * 0.06})`;
    g.fillRect(r() * W, 0, 6 + r() * 16, H * (0.5 + r() * 0.5));
  }
  // Flicken: genähte Tuchstücke
  for (let k = 0; k < 3; k++) {
    if (r() < 0.3) continue;
    const w = 44 + r() * 52, h = 36 + r() * 44, x = 40 + r() * 400, y = 100 + r() * 220;
    g.fillStyle = r() < 0.5 ? 'rgba(255,238,205,0.26)' : 'rgba(95,72,48,0.2)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(40,28,16,0.55)';
    g.lineWidth = 1.6;
    g.setLineDash([5, 4]);
    g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    g.setLineDash([]);
  }
  // Wappen in der Mitte
  if (emblem) {
    g.save();
    g.beginPath();
    g.arc(W / 2, H * 0.55, 98, 0, Math.PI * 2);
    g.clip();
    g.drawImage(emblem, W / 2 - 156, H * 0.55 - 96, 312, 192);
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 6;
    g.beginPath(); g.arc(W / 2, H * 0.55, 98, 0, Math.PI * 2); g.stroke();
  }
  // Liektau: kräftiger Rand aus gedrehtem Tau, Ösen in den Ecken, Zurrings am Rahen
  g.strokeStyle = 'rgba(46,32,18,0.7)';
  g.lineWidth = 11;
  g.strokeRect(5, 5, W - 10, H - 10);
  g.strokeStyle = 'rgba(190,150,100,0.45)';
  g.lineWidth = 3;
  g.setLineDash([7, 5]);
  g.strokeRect(5, 5, W - 10, H - 10);
  g.setLineDash([]);
  for (const [cx, cy] of [[16, 16], [W - 16, 16], [16, H - 16], [W - 16, H - 16]]) {
    g.fillStyle = 'rgba(30,20,12,0.85)';
    g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(200,170,110,0.8)';
    g.lineWidth = 2.4;
    g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2); g.stroke();
  }
  for (let x = 22; x < W; x += 28) { g.fillStyle = 'rgba(40,28,16,0.8)'; g.fillRect(x - 2, 0, 4, 18); }
  // Zerfetzte, verwitterte Ränder: ausgefranster Saum unten, angenagte Ecken und ein paar Risse (Alpha, mit alphaTest benutzt)
  if (tattered) {
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    const edge = (x: number, y: number, w: number, h: number) => g.fillRect(x, y, w, h);
    for (let x = 0; x < W; x += 6) {
      const d = r() < 0.5 ? r() * 16 : r() * 5 + (Math.sin(x * 0.05 + seed) + 1) * 7;
      edge(x, H - d, 6, d);
    }
    for (let y = 0; y < H; y += 6) {
      edge(0, y, r() * 5, 6);
      edge(W - r() * 5, y, 6, 6);
    }
    for (const [cx, cy] of [[0, H], [W, H]]) {
      g.beginPath(); g.arc(cx, cy, 14 + r() * 22, 0, Math.PI * 2); g.fill();
    }
    for (let k = 0; k < 2; k++) {
      const x = 60 + r() * 380, y = 200 + r() * 140;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 5 + r() * 9, y + 14 + r() * 26); g.lineTo(x - 4, y + 40 + r() * 20); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
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
  crateCache = markShared(t);
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
