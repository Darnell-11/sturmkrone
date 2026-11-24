import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';
import { detailCanvas, texDetail } from './texDetail';
import { markShared } from './dispose';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Die Rumpfplanken kommen seit 4.4A aus der PBR-Schmiede (graphics/pbrMaterialForge.ts: rumpf_alt, rumpf, rumpf_edel).

let deckCache: CanvasTexture | null = null;

/**
 * Deckplanken aus Eiche: warm verwittertes Holz mit feiner, langer Maserung, dunklen Teerfugen (Kalfaterung) zwischen den Gängen, versetzten
 * Stoßfugen mit Holznägeln und leichten Salzflecken. Bewusst ruhig: keine hellen Linien und kein Rauschen hoher Frequenz (das flimmerte als
 * weißes Kriseln). Die Kachel ist 1024 px groß und läuft mit Mipmaps und Anisotropie; Plankenbreite 1/8 der Kachel.
 * Die Farbe steckt in der Textur (das Material färbt nur leicht und dunkelt bei Nässe ab).
 */
export function deckTexture(): CanvasTexture {
  if (deckCache) return deckCache;
  const S = 1024;
  const { c, g } = detailCanvas(S, S);
  const W = c.width, H = c.height, k = W / S;
  const r = rng(77);
  g.fillStyle = '#8f6b47';
  g.fillRect(0, 0, W, H);
  const rows = 8, h = H / rows;
  for (let i = 0; i < rows; i++) {
    const y0 = i * h;
    // Grundton je Plank leicht anders, warm bis rötlich
    const hue = [[168, 128, 88], [158, 118, 80], [176, 134, 92], [150, 112, 76], [170, 126, 84], [162, 122, 84]][Math.floor(r() * 6)];
    const gr = g.createLinearGradient(0, y0, 0, y0 + h);
    gr.addColorStop(0, `rgb(${hue[0] + 6},${hue[1] + 5},${hue[2] + 4})`);
    gr.addColorStop(0.5, `rgb(${hue[0]},${hue[1]},${hue[2]})`);
    gr.addColorStop(1, `rgb(${hue[0] - 8},${hue[1] - 7},${hue[2] - 6})`);
    g.fillStyle = gr;
    g.fillRect(0, y0, W, h);
    // lange, weiche Maserung: dunkle und helle Streifen mit geringer Deckkraft
    for (let n = 0; n < 26; n++) {
      const y = y0 + 4 * k + r() * (h - 8 * k);
      const dark = r() < 0.55;
      g.strokeStyle = dark ? `rgba(60,36,18,${0.05 + r() * 0.07})` : `rgba(205,170,120,${0.04 + r() * 0.05})`;
      g.lineWidth = (dark ? 1.4 : 1.8) * k;
      g.beginPath();
      g.moveTo(0, y);
      const ph = r() * 6, amp = (0.8 + r() * 2.4) * k, fq = 0.008 + r() * 0.012;
      for (let x = 0; x <= W; x += 24 * k) g.lineTo(x, y + Math.sin(x * fq + ph) * amp + Math.sin(x * fq * 2.7 + ph * 1.7) * amp * 0.35);
      g.stroke();
    }
    // Astlöcher mit Maserungsringen
    if (r() < 0.5) {
      const kx = (60 + r() * 900) * k, ky = y0 + h * (0.3 + r() * 0.4);
      for (let ring = 3; ring >= 0; ring--) {
        g.strokeStyle = `rgba(50,28,12,${0.10 + ring * 0.05})`;
        g.lineWidth = 1.6 * k;
        g.beginPath(); g.ellipse(kx, ky, (8 + ring * 7) * k, (3.6 + ring * 3) * k, 0, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = 'rgba(40,22,10,0.55)';
      g.beginPath(); g.ellipse(kx, ky, 6 * k, 2.8 * k, 0, 0, Math.PI * 2); g.fill();
    }
    // Stoßfugen (versetzt) mit je zwei Holznägeln
    const off = ((i * 337) % 512) + Math.floor(r() * 90);
    for (let x = off; x < W; x += 512 * k) {
      g.fillStyle = 'rgba(22,14,8,0.78)';
      g.fillRect(x, y0, 3.5 * k, h);
      g.fillStyle = 'rgba(30,18,10,0.62)';
      for (const dy of [0.2, 0.8]) { g.beginPath(); g.arc(x + 14 * k, y0 + h * dy, 3 * k, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(x - 10 * k, y0 + h * dy, 3 * k, 0, Math.PI * 2); g.fill(); }
    }
    // Teerfuge zwischen den Gängen: dunkel, mit weicher Kante (kein heller Streifen)
    const seam = g.createLinearGradient(0, y0 + h - 8 * k, 0, y0 + h + 1);
    seam.addColorStop(0, 'rgba(24,15,9,0)');
    seam.addColorStop(0.55, 'rgba(24,15,9,0.72)');
    seam.addColorStop(1, 'rgba(14,9,5,0.92)');
    g.fillStyle = seam;
    g.fillRect(0, y0 + h - 8 * k, W, 8 * k + 1);
  }
  // großflächige Verwitterung: weiche helle Salzflecken und dunklere Laufspuren
  for (let n = 0; n < 34; n++) {
    const x = r() * W, y = r() * H, rad = (40 + r() * 140) * k;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const light = r() < 0.5;
    gr.addColorStop(0, light ? 'rgba(220,196,160,0.10)' : 'rgba(60,40,22,0.10)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = texDetail.aniso;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  deckCache = markShared(t);
  return t;
}
